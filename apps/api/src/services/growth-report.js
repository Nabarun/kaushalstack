import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';
import { getUserBYOK } from '../routes/user-keys.js';
import { scanAll } from './competitor-scanner.js';
import { ensureReportsCollection } from '../routes/admin/collections.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERVER_PROVIDER = 'openai';
const SERVER_MODEL = 'gpt-4o-mini';

function compactScan(scan) {
    return {
        name: scan.name,
        website: scan.website,
        ok: scan.ok,
        homepage: scan.homepage,
        feed_url: scan.feed_url,
        recent_items: (scan.recent_items || []).slice(0, 10).map(i => ({
            title: i.title,
            link: i.link,
            published: i.published,
            description: i.description?.slice(0, 240),
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
        if (!s.ok) return [head, focusLine, `(scan failed: ${s.error || 'unknown'})`].filter(Boolean).join('\n');
        const hp = s.homepage ? `Homepage: ${s.homepage.title || ''}\nDesc: ${s.homepage.description || ''}\nH1s: ${(s.homepage.headings || []).join(' | ')}` : '';
        const items = s.recent_items.length
            ? s.recent_items.map(i => `- [${i.published || 'n/a'}] ${i.title} — ${i.link}${i.description ? `\n  ${i.description}` : ''}`).join('\n')
            : '(no items from the last 24h, or no feed exposed)';
        return [head, focusLine, hp, `\nRecent items (24h):\n${items}`].filter(Boolean).join('\n');
    }).join('\n\n');

    const system = `You are the growth-analysis lead for the round-table team supporting ${business.name}. Your job: read the scan of the business's competitors over the last 24 hours and produce ONE concise growth report.

The team assigned to this business:
${teamRoster}

Speak to the business owner. Be specific. Cite competitor names. Avoid generic "consider doing X" filler — if nothing new is happening, say so. When a competitor block includes a "Focus for this competitor" line, weight your findings and recommendations for that competitor toward that focus area. Output strict JSON only.`;

    const user = `Business: ${business.name}
Website: ${business.website_url}
Description: ${business.description || '(none)'}

Competitor scans (last 24h):

${competitorBlocks}

Return JSON of the shape:
{
  "summary": "2-4 sentence executive summary of what competitors did in the last 24h",
  "findings": [
    { "competitor": "name", "what_changed": "...", "evidence": "url or page title", "significance": "low|medium|high" }
  ],
  "recommendations": [
    { "action": "concrete thing the business should do", "rationale": "why, tied to a competitor finding", "owner_agent": "agent name from the roster (or empty)" }
  ]
}

If there's nothing notable, return empty arrays and say so in the summary. Do not invent items that are not in the scan data.`;

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
    const competitors = Array.isArray(business.competitors) ? business.competitors : [];
    const team = Array.isArray(business.team) ? business.team : [];

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
            raw = await chatComplete(primaryProvider, {
                key: primaryKey,
                model: primaryModel,
                userPrompt: user,
                cachedPrefix: system,
                jsonMode: true,
            });
        } catch (err) {
            if (usingBYOK && OPENAI_API_KEY) {
                logger.warn(`growth-report BYOK failed (provider=${primaryProvider} model=${primaryModel} cause=${err.message}) — falling back to server openai/${SERVER_MODEL}`);
                try {
                    raw = await chatComplete(SERVER_PROVIDER, {
                        key: OPENAI_API_KEY,
                        model: SERVER_MODEL,
                        userPrompt: user,
                        cachedPrefix: system,
                        jsonMode: true,
                    });
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
        const recsText = recs.map((r, i) =>
            `${i + 1}. ${r.action || ''}${r.owner_agent ? ` — owner: ${r.owner_agent}` : ''}\n   Rationale: ${r.rationale || ''}`
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
            findings: { scans: compact, findings, recommendations: recs, key_path: keyPath },
        });

        logger.info(`growth-report: business=${business.name} report=${finalRecord.id} findings=${findings.length} recs=${recs.length} key=${keyPath}`);
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
