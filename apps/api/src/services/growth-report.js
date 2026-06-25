import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';
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

    const system = `You are the growth-analysis lead for the round-table team supporting ${business.name}. Your job: read the scan of the business's competitors over the last 7 days and produce ONE concise growth report — plus an honest estimate of (a) the financial upside if the owner acts on the recommendations and (b) the market opportunity (TAM/SAM/SOM).

The team assigned to this business:
${teamRoster}

Speak to the business owner. Be specific. Cite competitor names. Avoid generic "consider doing X" filler — if nothing new is happening, say so. When a competitor block includes a "Focus for this competitor" line, weight your findings and recommendations for that competitor toward that focus area. When a "Source" line says google_news, treat the items as third-party news mentions rather than first-party announcements.

For the revenue_impact: be conservative, explain your assumptions, set confidence honestly (low if the scan is thin or the competitors aren't doing much), and never invent a dollar amount without a baseline.

For market_opportunity: estimate the total market size category for this kind of business (TAM = global/all-segments dollar value the category captures per year), the realistic serviceable slice given the business's geography, segment, and channel (SAM), and the obtainable slice over a 1-3 year horizon given the competitive landscape you just scanned (SOM). Express each as a dollar range. If the business description is thin, set confidence to low and say what would tighten the estimate. Never invent a precise number when the inputs don't support one.

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
  },
  "market_opportunity": {
    "tam": {
      "low_dollars": <number, annual>,
      "high_dollars": <number, annual>,
      "scope": "one short phrase, e.g. 'global B2B SaaS HR analytics'"
    },
    "sam": {
      "low_dollars": <number, annual>,
      "high_dollars": <number, annual>,
      "scope": "one short phrase, e.g. 'India SMB segment with online channel'"
    },
    "som": {
      "low_dollars": <number, annual>,
      "high_dollars": <number, annual>,
      "horizon_years": <number, typically 1 to 3>,
      "scope": "one short phrase, e.g. 'achievable share over 3 years given competitor density'"
    },
    "confidence": "low|medium|high",
    "reasoning": "2-3 sentences explaining the assumptions and what would tighten the estimate"
  }
}

If there's nothing notable in the competitor scan, return empty arrays for findings/recommendations and a revenue_impact with 0/0 lift and confidence=low. The market_opportunity should still be filled if the business description gives enough signal — set confidence=low when it doesn't. Do not invent items that are not in the scan data.`;

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
        const marketOpportunity = parsed.market_opportunity && typeof parsed.market_opportunity === 'object'
            ? parsed.market_opportunity
            : null;
        const recsText = recs.map((r, i) =>
            `${i + 1}. ${r.action || ''}${r.owner_agent ? ` — owner: ${r.owner_agent}` : ''}\n   Rationale: ${r.rationale || ''}${r.estimated_impact ? `\n   Estimated impact: ${r.estimated_impact}` : ''}`
        ).join('\n\n');

        const keyPath = fellBackToServer
            ? `byok-${primaryProvider}→server-${SERVER_PROVIDER}/${SERVER_MODEL}`
            : usingBYOK
                ? `byok-${primaryProvider}/${primaryModel}`
                : `server-${SERVER_PROVIDER}/${SERVER_MODEL}`;

        const finalRecord = await pb.collection('growth_reports').update(initial.id, {
            status: 'completed',
            summary,
            recommendations: recsText,
            findings: { scans: compact, findings, recommendations: recs, revenue_impact: revenueImpact, market_opportunity: marketOpportunity, key_path: keyPath },
        });

        const liftHi = revenueImpact?.estimated_monthly_lift_pct_high;
        const elapsedSec = Math.round((Date.now() - reportStarted) / 1000);
        logger.info(`growth-report: business=${business.name} report=${finalRecord.id} findings=${findings.length} recs=${recs.length} lift_hi=${liftHi ?? 'n/a'}% key=${keyPath} elapsed=${elapsedSec}s`);
        return finalRecord;
    } catch (err) {
        logger.error(`growth-report failed for business ${business.id}: ${err.message}`);
        try {
            return await pb.collection('growth_reports').update(initial.id, {
                status: 'failed',
                error: err.message,
            });
        } catch {
            return null;
        }
    }
}
