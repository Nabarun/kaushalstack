import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';
import { runAttachedSkills, renderAttachedSkillSections } from './business-skills-runner.js';
import { getUserBYOK } from '../routes/user-keys.js';
import { scanAll } from './competitor-scanner.js';
import { ensureReportsCollection } from '../routes/admin/collections.js';
import { listCompetitorTeam, syncCompetitorSkills } from './competitor-skills.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERVER_PROVIDER = 'openai';
const SERVER_MODEL = 'gpt-4o-mini';
const LLM_TIMEOUT_MS = 60 * 1000; // cap each model call so a stuck request
                                  // can't blow the report's wall clock

function withTimeout(promise, ms, label) {
    let timer;
    const t = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms / 1000}s budget`)), ms);
    });
    return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

function compactScan(scan) {
    return {
        name: scan.name,
        website: scan.website,
        ok: scan.ok,
        homepage: scan.homepage,
        feed_url: scan.feed_url,
        source: scan.source || undefined,
        notice: scan.notice || undefined,
        recent_items: (scan.recent_items || []).slice(0, 8).map(i => ({
            title: i.title,
            link: i.link,
            published: i.published,
            description: i.description?.slice(0, 150),
        })),
        recent_count: (scan.recent_items || []).length,
        error: scan.error || undefined,
    };
}

function buildPrompt(business, team, scans, competitors) {
    const teamRoster = (team || [])
        .map(a => `- ${a.agent_name || a.name || a.id}${a.category ? ` (${a.category})` : ''}`)
        .join('\n') || '- (no specialists assigned)';

    const focusByWebsite = new Map(
        (competitors || []).map(c => [String(c.website || '').trim().toLowerCase(), String(c.focus || '').trim()])
    );

    const competitorBlocks = scans.map(s => {
        const focus = focusByWebsite.get(String(s.website || '').trim().toLowerCase()) || '';
        const head = `### ${s.name} — ${s.website}`;
        const focusLine = focus ? `Focus for this competitor: ${focus}` : '';
        const sourceLine = s.source ? `Source: ${s.source}${s.notice ? ` (${s.notice})` : ''}` : '';
        if (!s.ok) return [head, focusLine, `(scan failed: ${s.error || 'unknown'})`].filter(Boolean).join('\n');
        const hp = s.homepage ? `Homepage: ${s.homepage.title || ''}\nDesc: ${s.homepage.description || ''}\nH1s: ${(s.homepage.headings || []).join(' | ')}` : '';
        const items = s.recent_items.length
            ? s.recent_items.map(i => `- [${i.published || 'n/a'}] ${i.title} — ${i.link}${i.description ? `\n  ${i.description}` : ''}`).join('\n')
            : '(no items from the last 7 days, or no feed exposed)';
        return [head, focusLine, sourceLine, hp, `\nRecent items (last 7 days):\n${items}`].filter(Boolean).join('\n');
    }).join('\n\n');

    const monthlyRevenue = Number(business.monthly_revenue) || 0;
    const revenueLine = monthlyRevenue > 0
        ? `Business monthly revenue baseline: $${monthlyRevenue.toLocaleString()} (use this to compute dollar-denominated lift estimates).`
        : `Business monthly revenue baseline: not provided (express lift as a percentage range only; do not invent a dollar amount).`;

    const system = `You are the growth-analysis lead for the round-table team supporting ${business.name}. Your job: read the scan of the business's competitors over the last 7 days and produce ONE concise growth report — plus an honest estimate of the financial upside if the owner acts on the recommendations.

The team assigned to this business:
${teamRoster}

Speak to the business owner. Be specific. Cite competitor names. Avoid generic "consider doing X" filler — if nothing new is happening, say so. When a competitor block includes a "Focus for this competitor" line, weight your findings and recommendations for that competitor toward that focus area. When a "Source" line says google_news, treat the items as third-party news mentions rather than first-party announcements.

For the revenue_impact: be conservative, explain your assumptions, set confidence honestly (low if the scan is thin or the competitors aren't doing much), and never invent a dollar amount without a baseline.

Output strict JSON only.`;

    const user = `Business: ${business.name}
Website: ${business.website_url}
Description: ${business.description || '(none)'}
${revenueLine}

Competitor scans (last 7 days):

${competitorBlocks}

Return JSON of the shape:
{
  "summary": "3-5 sentence executive summary of what competitors did in the last 7 days",
  "findings": [
    { "competitor": "name", "what_changed": "...", "evidence": "url or page title", "significance": "low|medium|high" }
  ],
  "recommendations": [
    {
      "action": "concrete thing the business should do",
      "rationale": "why, tied to a competitor finding",
      "owner_agent": "agent name from the roster (or empty)",
      "estimated_impact": "one-line qualitative + rough quantitative impact, e.g. '+5-8% trial signups in Q1 if landing-page positioning matches Acme's new framing'"
    }
  ],
  "revenue_impact": {
    "estimated_monthly_lift_pct_low": <number, e.g. 3>,
    "estimated_monthly_lift_pct_high": <number, e.g. 8>,
    "estimated_monthly_lift_dollars_low": <number or null when baseline is missing>,
    "estimated_monthly_lift_dollars_high": <number or null when baseline is missing>,
    "time_horizon_months": <number, typically 3 to 12>,
    "confidence": "low|medium|high",
    "reasoning": "2-3 sentences on assumptions, what drives the range, and what would tighten the confidence"
  }
}

If there's nothing notable in the competitor scan, return empty arrays for findings/recommendations and a revenue_impact with 0/0 lift and confidence=low. Do not invent items that are not in the scan data.`;

    return { system, user };
}

function safeJson(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch {}
    const m = raw.match(/\{[\s\S]*\}$/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}

export async function runGrowthReportForBusiness(business) {
    await ensureReportsCollection();
    const reportStarted = Date.now();
    const competitors = Array.isArray(business.competitors) ? business.competitors : [];

    // Auto-team: synced competitor-watcher skills (private, scoped to this
    // business). Sync on every run so the team stays in lock-step with the
    // current competitor list. Falls back to business.team if sync produces
    // nothing (e.g. failure or legacy row).
    let team = [];
    try {
        const synced = await syncCompetitorSkills(business);
        team = synced.length ? synced : await listCompetitorTeam(business.id);
    } catch (err) {
        logger.warn(`growth-report: team sync failed: ${err.message}`);
        team = Array.isArray(business.team) ? business.team : [];
    }

    const initial = await pb.collection('growth_reports').create({
        business_id: business.id,
        run_date: new Date().toISOString(),
        competitors,
        status: 'running',
    });

    try {
        if (competitors.length === 0) {
            const empty = await pb.collection('growth_reports').update(initial.id, {
                status: 'completed',
                summary: 'No competitors configured for this business.',
                recommendations: '',
                findings: { findings: [], recommendations: [] },
            });
            return empty;
        }

        const scans = await scanAll(competitors);
        const compact = scans.map(compactScan);

        // BYOK: use the business owner's key when available, fall back to
        // the server OpenAI key on any failure (401/429/timeout/etc.) so the
        // daily report never hard-fails on a bad/expired BYOK.
        const ownerBYOK = business.owner_id ? await getUserBYOK(business.owner_id) : null;
        const usingBYOK = !!ownerBYOK;
        const primaryProvider = usingBYOK ? ownerBYOK.provider : SERVER_PROVIDER;
        const primaryKey      = usingBYOK ? ownerBYOK.key      : OPENAI_API_KEY;
        const primaryModel    = usingBYOK
            ? (ownerBYOK.model || getProviderMeta(ownerBYOK.provider).defaultModel)
            : SERVER_MODEL;

        if (!primaryKey) {
            const noAi = await pb.collection('growth_reports').update(initial.id, {
                status: 'completed',
                summary: 'Competitor scan completed but AI analysis is not configured (no BYOK and no server OPENAI_API_KEY).',
                recommendations: '',
                findings: { scans: compact, findings: [], recommendations: [] },
            });
            return noAi;
        }

        const { system, user } = buildPrompt(business, team, compact, competitors);

        let raw;
        let fellBackToServer = false;
        try {
            raw = await withTimeout(
                chatComplete(primaryProvider, {
                    key: primaryKey,
                    model: primaryModel,
                    userPrompt: user,
                    cachedPrefix: system,
                    jsonMode: true,
                }),
                LLM_TIMEOUT_MS,
                `LLM call (${primaryProvider}/${primaryModel})`,
            );
        } catch (err) {
            if (usingBYOK && OPENAI_API_KEY) {
                logger.warn(`growth-report BYOK failed (provider=${primaryProvider} model=${primaryModel} cause=${err.message}) — falling back to server openai/${SERVER_MODEL}`);
                try {
                    raw = await withTimeout(
                        chatComplete(SERVER_PROVIDER, {
                            key: OPENAI_API_KEY,
                            model: SERVER_MODEL,
                            userPrompt: user,
                            cachedPrefix: system,
                            jsonMode: true,
                        }),
                        LLM_TIMEOUT_MS,
                        `LLM fallback (${SERVER_PROVIDER}/${SERVER_MODEL})`,
                    );
                    fellBackToServer = true;
                } catch (fbErr) {
                    logger.error(`growth-report fallback also failed for business ${business.id}: ${fbErr.message}`);
                    const failed = await pb.collection('growth_reports').update(initial.id, {
                        status: 'failed',
                        error: `AI call failed (BYOK + server fallback): ${fbErr.message}`,
                        findings: { scans: compact },
                    });
                    return failed;
                }
            } else {
                logger.error(`growth-report AI call failed for business ${business.id}: ${err.message}`);
                const failed = await pb.collection('growth_reports').update(initial.id, {
                    status: 'failed',
                    error: `AI call failed: ${err.message}`,
                    findings: { scans: compact },
                });
                return failed;
            }
        }

        const parsed = safeJson(raw) || {};
        const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
        const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
        const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
        const revenueImpact = parsed.revenue_impact && typeof parsed.revenue_impact === 'object'
            ? parsed.revenue_impact
            : null;
        const recsText = recs.map((r, i) =>
            `${i + 1}. ${r.action || ''}${r.owner_agent ? ` — owner: ${r.owner_agent}` : ''}\n   Rationale: ${r.rationale || ''}${r.estimated_impact ? `\n   Estimated impact: ${r.estimated_impact}` : ''}`
        ).join('\n\n');

        const keyPath = fellBackToServer
            ? `byok-${primaryProvider}→server-${SERVER_PROVIDER}/${SERVER_MODEL}`
            : usingBYOK
                ? `byok-${primaryProvider}/${primaryModel}`
                : `server-${SERVER_PROVIDER}/${SERVER_MODEL}`;

        // Run any admin-uploaded private skills attached to this business as
        // an additional analysis layer. Each skill is a SKILL.md whose body
        // becomes the system prompt; the user prompt is the business context +
        // a short summary of the competitor scan. Outputs stack into the
        // recommendations text under a "Custom skill analysis" section so
        // the existing ReportDetailPage renders them with no UI change.
        let attachedSkillResults = [];
        try {
            const runnerCfg = fellBackToServer
                ? { provider: SERVER_PROVIDER, key: OPENAI_API_KEY, model: SERVER_MODEL }
                : { provider: primaryProvider, key: primaryKey,     model: primaryModel };
            attachedSkillResults = await runAttachedSkills(business, summary, runnerCfg);
        } catch (err) {
            logger.warn(`growth-report: attached-skills runner crashed for ${business.id}: ${err.message}`);
        }
        const attachedSectionsMd = renderAttachedSkillSections(attachedSkillResults);
        const recsTextWithAttached = attachedSectionsMd ? `${recsText}${attachedSectionsMd}` : recsText;

        // Build findings JSON + enforce the 300KB PocketBase json-field cap.
        // The largest contributor is usually scans (HTML extracts from
        // competitor pages); attached_skills tops out at ~20KB. If we're over
        // ~250KB total, progressively drop the heaviest fields rather than
        // failing the whole report save.
        const buildFindings = (skinny = false) => {
            const f = {
                findings,
                recommendations: recs,
                revenue_impact: revenueImpact,
                key_path: keyPath,
                attached_skills: attachedSkillResults,
            };
            if (!skinny) f.scans = compact;
            return f;
        };
        const FINDINGS_SAFE_MAX = 250_000;          // PB cap is 300_000 — leave headroom
        let findingsPayload = buildFindings(false);
        let findingsJson    = JSON.stringify(findingsPayload);
        if (findingsJson.length > FINDINGS_SAFE_MAX) {
            logger.warn(`growth-report: findings ${findingsJson.length}b exceeds ${FINDINGS_SAFE_MAX}b safe-cap — dropping scans block`);
            findingsPayload = buildFindings(true);
            findingsJson    = JSON.stringify(findingsPayload);
            if (findingsJson.length > FINDINGS_SAFE_MAX) {
                logger.warn(`growth-report: findings STILL ${findingsJson.length}b — trimming each attached_skills output_text`);
                const trimTo = Math.max(200, Math.floor(FINDINGS_SAFE_MAX / Math.max(1, attachedSkillResults.length) / 2));
                findingsPayload.attached_skills = attachedSkillResults.map(r => ({
                    ...r,
                    output_text: String(r.output_text || '').slice(0, trimTo) + (r.output_text?.length > trimTo ? `\n\n…(trimmed at ${trimTo} chars to fit storage cap)` : ''),
                }));
            }
        }
        // Schema cap on recommendations / summary text fields is 10,000 chars
        // (bumped from PB's 5,000 default on 2026-06-28). Defensive truncate so
        // the save never fails on overflow — full attached_skill outputs still
        // live in findings.attached_skills (300KB cap) so nothing is lost.
        const TEXT_FIELD_MAX = 9_700;   // leave headroom for the "trimmed" marker
        const trim = (s) => {
            const t = String(s || '');
            return t.length <= TEXT_FIELD_MAX
                ? t
                : `${t.slice(0, TEXT_FIELD_MAX)}\n\n…(trimmed at ${TEXT_FIELD_MAX} chars to fit storage cap — full attached-skill outputs available in findings.attached_skills)`;
        };
        const finalRecord = await pb.collection('growth_reports').update(initial.id, {
            status: 'completed',
            summary: trim(summary),
            recommendations: trim(recsTextWithAttached),
            findings: findingsPayload,
        });

        const liftHi = revenueImpact?.estimated_monthly_lift_pct_high;
        const elapsedSec = Math.round((Date.now() - reportStarted) / 1000);
        logger.info(`growth-report: business=${business.name} report=${finalRecord.id} findings=${findings.length} recs=${recs.length} lift_hi=${liftHi ?? 'n/a'}% key=${keyPath} elapsed=${elapsedSec}s`);
        return finalRecord;
    } catch (err) {
        // PocketBase wraps validation failures in 'Failed to update record.' —
        // log err.data (the per-field validation errors) so we can actually see
        // what was rejected.
        const detail = err?.response?.data || err?.data || err?.originalError?.data || null;
        const detailStr = detail ? ` | data=${JSON.stringify(detail).slice(0, 600)}` : '';
        logger.error(`growth-report failed for business ${business.id}: ${err.message}${detailStr}`);
        try {
            return await pb.collection('growth_reports').update(initial.id, {
                status: 'failed',
                error: detail ? `${err.message}: ${JSON.stringify(detail).slice(0, 500)}` : err.message,
            });
        } catch {
            return null;
        }
    }
}
