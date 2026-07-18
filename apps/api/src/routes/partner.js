// Partner portal API.
//   POST   /partner                      create a partner (caller = owner)
//   GET    /partner/mine                 partners the caller belongs to
//   GET    /partner/:id/assets           list assets
//   POST   /partner/:id/assets           add link (json) or doc/media (multipart "file")
//   DELETE /partner/:id/assets/:assetId  remove an asset
//   GET    /partner/:id/usage?range=today|mtd|7d   spend + tokens rollup
//   GET    /partner/:id/manual-charges           list manually-logged charges + total
//   POST   /partner/:id/manual-charges           log a charge { description, amount_usd }
//   DELETE /partner/:id/manual-charges/:chargeId  remove a logged charge
//
// All routes require auth. Membership is enforced server-side on every call —
// the partner_id in a URL is never trusted on its own.

import { Router } from 'express';
import multer from 'multer';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../utils/auth.js';
import { ensurePartnerCollections } from '../partner/collections.js';
import { chatComplete } from '../providers/index.js';
import { ensureCache, search, cacheSize } from '../embeddings/cache.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const esc = (s) => String(s || '').replace(/"/g, '\\"');

async function membership(partnerId, userId) {
    try {
        const p = await pb.collection('partners').getOne(partnerId);
        if (p.owner_user_id === userId) return { partner: p, role: 'owner' };
        const m = await pb.collection('partner_members').getList(1, 1, {
            filter: `partner_id = "${esc(partnerId)}" && user_id = "${esc(userId)}"`,
        });
        if (m.items[0]) return { partner: p, role: m.items[0].role || 'viewer' };
    } catch { /* fall through */ }
    return null;
}

async function requireMember(req, res, roles = null) {
    const userId = await getUserIdFromAuth(req);
    if (!userId) { res.status(401).json({ error: 'unauthorized' }); return null; }
    await ensurePartnerCollections();
    const mem = await membership(req.params.id, userId);
    if (!mem) { res.status(403).json({ error: 'not a member of this partner' }); return null; }
    if (roles && !roles.includes(mem.role)) { res.status(403).json({ error: `requires role: ${roles.join('/')}` }); return null; }
    return { userId, ...mem };
}

// ── Partners ─────────────────────────────────────────────────────────────────

router.post('/partner', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    try {
        await ensurePartnerCollections();
        const partner = await pb.collection('partners').create({
            name, owner_user_id: userId, status: 'active',
            monthly_budget_usd: Number(req.body?.monthly_budget_usd) || 0,
        });
        await pb.collection('partner_members').create({ partner_id: partner.id, user_id: userId, role: 'owner' });
        res.json({ partner });
    } catch (err) {
        logger.error(`partner create failed: ${err.message}`);
        res.status(500).json({ error: 'could not create partner' });
    }
});

router.get('/partner/mine', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        await ensurePartnerCollections();
        const memberships = await pb.collection('partner_members').getFullList({
            filter: `user_id = "${esc(userId)}"`,
        });
        const partners = [];
        for (const m of memberships) {
            try {
                const p = await pb.collection('partners').getOne(m.partner_id);
                partners.push({ ...p, my_role: m.role });
            } catch { /* partner deleted */ }
        }
        res.json({ partners });
    } catch (err) {
        logger.error(`partner/mine failed: ${err.message}`);
        res.status(500).json({ error: 'could not list partners' });
    }
});

// ── Deep research team recommendation ────────────────────────────────────────
// POST /partner/:id/research-team
// 1. Scans the partner's assets — fetches live content from link assets,
//    reads titles/notes from docs — and builds a business profile via LLM.
// 2. Embeds a targeted search query from that profile to find candidate agents.
// 3. A second LLM pass selects the team and writes a per-agent "why this
//    agent, given these assets" rationale.
// All LLM calls are metered against the partner (context='research').

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RESEARCH_MODEL = 'gpt-4o-mini';
const PIPELINE_IDS = new Set(['uepji0o2teuf29b', '0v9syxxawznp95v', 'hostingerdeploy']);

async function fetchLinkText(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'KaushalStack-DeepResearch/1.0' } });
        if (!r.ok) return '';
        const html = await r.text();
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z#0-9]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);
    } catch {
        return '';
    } finally {
        clearTimeout(timer);
    }
}

async function embedText(text) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    });
    if (!r.ok) throw new Error(`embed failed: ${r.status}`);
    return (await r.json()).data[0].embedding;
}

function parseJsonReply(raw) {
    try { return JSON.parse(raw); } catch { /* try fenced */ }
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
    return null;
}

router.post('/partner/:id/research-team', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner', 'editor']);
    if (!ctx) return;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'research not configured' });
    const partnerId = req.params.id;
    const meter = { user_id: ctx.userId, partner_id: partnerId, agent: 'Deep Research', context: 'research' };

    try {
        const assets = await pb.collection('partner_assets').getFullList({
            filter: `partner_id = "${esc(partnerId)}"`, sort: '-created',
        });
        if (assets.length === 0) return res.status(400).json({ error: 'add at least one asset first' });

        // ── 1. Scan assets ────────────────────────────────────────────────
        const links = assets.filter(a => a.kind === 'link' && a.url).slice(0, 5);
        const linkTexts = await Promise.all(links.map(async (a) => ({
            title: a.title || a.url,
            note:  a.note || '',
            url:   a.url,
            content: await fetchLinkText(a.url),
        })));
        const otherAssets = assets.filter(a => a.kind !== 'link').map(a => ({
            kind: a.kind, title: a.title || a.file || '', note: a.note || '',
        }));

        const assetDossier = [
            ...linkTexts.map(l => `LINK: ${l.title}\nURL: ${l.url}${l.note ? `\nNote: ${l.note}` : ''}${l.content ? `\nPage content (extracted): ${l.content}` : '\n(page could not be fetched)'}`),
            ...otherAssets.map(a => `${a.kind.toUpperCase()}: ${a.title}${a.note ? `\nNote: ${a.note}` : ''}`),
        ].join('\n\n---\n\n');

        // ── 2. Business profile + needs analysis ─────────────────────────
        const profileRaw = await chatComplete('openai', {
            key: OPENAI_API_KEY,
            model: RESEARCH_MODEL,
            systemPrompt: 'You are a business research analyst. You are given the raw asset dossier of a business (links with extracted page content, documents, notes). Analyze it and respond with ONLY valid JSON, no fences.',
            userPrompt: `Asset dossier for the business "${ctx.partner.name}":\n\n${assetDossier.slice(0, 20000)}\n\nRespond with JSON:\n{\n  "profile": "<3-4 sentence business profile: what the business does, who its customers are, its stage and visible strengths/gaps>",\n  "needs": ["<3-6 specific growth or operational needs you can infer from the assets>"],\n  "search_query": "<one dense sentence describing the expertise this business needs from specialist agents — used for semantic agent search>"\n}`,
            jsonMode: true,
            meter,
        });
        const profile = parseJsonReply(profileRaw);
        if (!profile?.search_query) throw new Error('research analysis failed');

        // ── 3. Candidate search ───────────────────────────────────────────
        await ensureCache();
        if (cacheSize() === 0) return res.status(500).json({ error: 'agent catalog not ready' });
        const vector = await embedText(`${profile.search_query} ${(profile.needs || []).join(' ')}`);
        const candidates = search(vector, 500, null)
            .filter(s => !PIPELINE_IDS.has(s.id) && s.category !== 'Tech')
            .slice(0, 15);

        // ── 4. Team selection + per-agent rationale ──────────────────────
        const candidateList = candidates.map((s, i) =>
            `${i + 1}. ${s.agent_name} — ${s.name} (${s.category})\n   ${(s.description || '').slice(0, 200)}`
        ).join('\n');
        // The model references candidates by NUMBER, not id — small models
        // reliably copy "3" but mangle 15-char random record ids, which
        // previously collapsed the team to whichever single id survived.
        const selectionRaw = await chatComplete('openai', {
            key: OPENAI_API_KEY,
            model: RESEARCH_MODEL,
            systemPrompt: 'You assemble specialist agent teams for businesses. Respond with ONLY valid JSON, no fences.',
            userPrompt: `Business profile:\n${profile.profile}\n\nIdentified needs:\n${(profile.needs || []).map(n => `- ${n}`).join('\n')}\n\nCandidate agents (numbered):\n${candidateList}\n\nSelect the 5-8 agents that best cover this business's needs. For each, write ONE sentence explaining why this agent was selected — reference the specific asset evidence or business need it addresses (e.g. "their website shows no online booking, and X specialises in…").\n\nJSON (n = the candidate's number from the list above):\n{\n  "team": [ { "n": 3, "why": "<one-sentence rationale grounded in the assets>" } ]\n}`,
            jsonMode: true,
            meter,
        });
        const selection = parseJsonReply(selectionRaw);

        let team = [];
        if (Array.isArray(selection?.team)) {
            const seen = new Set();
            for (const t of selection.team) {
                if (!t || typeof t !== 'object') continue;
                const idx = Number(t.n) - 1;
                const cand = Number.isInteger(idx) && idx >= 0 ? candidates[idx] : null;
                if (!cand || seen.has(cand.id)) continue;
                seen.add(cand.id);
                const { _score, ...s } = cand;
                team.push({ ...s, why: String(t.why || '').slice(0, 400) });
                if (team.length >= 8) break;
            }
        }
        // Top up: if the selection came back thin (bad JSON, too few picks),
        // fill to 5 with the highest-scoring remaining candidates.
        if (team.length < 5) {
            const have = new Set(team.map(s => s.id));
            for (const cand of candidates) {
                if (team.length >= 5) break;
                if (have.has(cand.id)) continue;
                const { _score, ...s } = cand;
                team.push({ ...s, why: '' });
            }
        }

        // Persist to the partner so the researched team survives reloads.
        const savedTeam = team.map(s => ({
            id: s.id, agent_name: s.agent_name, name: s.name, category: s.category,
            description: String(s.description || '').slice(0, 1000),
            associated_tech_skills: String(s.associated_tech_skills || '').slice(0, 500),
            why: s.why || '',
        }));
        await pb.collection('partners').update(partnerId, { team: savedTeam }).catch(() => {});

        logger.info(`research-team: partner=${partnerId} assets=${assets.length} links_fetched=${linkTexts.filter(l => l.content).length} team=${team.length}`);
        res.json({
            profile: profile.profile || '',
            needs: Array.isArray(profile.needs) ? profile.needs : [],
            scanned: { assets: assets.length, links_fetched: linkTexts.filter(l => l.content).length },
            team,
        });
    } catch (err) {
        logger.error(`research-team failed: ${err.message}`);
        res.status(500).json({ error: 'deep research failed — try again' });
    }
});

// PATCH /partner/:id — owner updates name and/or monthly budget
router.patch('/partner/:id', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner']);
    if (!ctx) return;
    const patch = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        patch.name = req.body.name.trim().slice(0, 200);
    }
    if (req.body?.monthly_budget_usd !== undefined) {
        const b = Number(req.body.monthly_budget_usd);
        if (!Number.isFinite(b) || b < 0) return res.status(400).json({ error: 'monthly_budget_usd must be a non-negative number' });
        patch.monthly_budget_usd = b;
    }
    if (req.body?.credit_cap_usd !== undefined) {
        const c = Number(req.body.credit_cap_usd);
        if (!Number.isFinite(c) || c < 0) return res.status(400).json({ error: 'credit_cap_usd must be a non-negative number' });
        patch.credit_cap_usd = c;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' });
    try {
        const partner = await pb.collection('partners').update(req.params.id, patch);
        res.json({ partner });
    } catch (err) {
        logger.error(`partner patch failed: ${err.message}`);
        res.status(500).json({ error: 'could not update partner' });
    }
});

// PUT /partner/:id/team — persist the recommended agent team on the partner
router.put('/partner/:id/team', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner', 'editor']);
    if (!ctx) return;
    const raw = req.body?.team;
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'team must be an array' });
    const team = raw.slice(0, 12)
        .filter(s => s && typeof s === 'object')
        .map(s => ({
            id:         String(s.id || '').slice(0, 50),
            agent_name: String(s.agent_name || '').slice(0, 100),
            name:       String(s.name || '').slice(0, 200),
            category:   String(s.category || '').slice(0, 100),
            description:            String(s.description || '').slice(0, 1000),
            associated_tech_skills: String(s.associated_tech_skills || '').slice(0, 500),
            why:                    String(s.why || '').slice(0, 400),
        }))
        .filter(s => s.id && s.agent_name);
    try {
        const partner = await pb.collection('partners').update(req.params.id, { team });
        res.json({ ok: true, team: partner.team || [] });
    } catch (err) {
        logger.error(`partner team save failed: ${err.message}`);
        res.status(500).json({ error: 'could not save team' });
    }
});

router.delete('/partner/:id', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner']);
    if (!ctx) return;
    const partnerId = req.params.id;
    try {
        // Delete all related records first, then the partner itself.
        const assets = await pb.collection('partner_assets').getFullList({ filter: `partner_id = "${esc(partnerId)}"` });
        for (const a of assets) await pb.collection('partner_assets').delete(a.id).catch(() => {});
        const members = await pb.collection('partner_members').getFullList({ filter: `partner_id = "${esc(partnerId)}"` });
        for (const m of members) await pb.collection('partner_members').delete(m.id).catch(() => {});
        await pb.collection('partners').delete(partnerId);
        res.json({ ok: true });
    } catch (err) {
        logger.error(`partner delete failed: ${err.message}`);
        res.status(500).json({ error: 'could not delete partner' });
    }
});

// ── Assets ───────────────────────────────────────────────────────────────────

router.get('/partner/:id/assets', async (req, res) => {
    const ctx = await requireMember(req, res);
    if (!ctx) return;
    try {
        const items = await pb.collection('partner_assets').getFullList({
            filter: `partner_id = "${esc(req.params.id)}"`, sort: '-created',
        });
        res.json({ assets: items });
    } catch (err) {
        res.status(500).json({ error: 'could not list assets' });
    }
});

router.post('/partner/:id/assets', upload.single('file'), async (req, res) => {
    const ctx = await requireMember(req, res, ['owner', 'editor']);
    if (!ctx) return;
    try {
        const base = {
            partner_id: req.params.id,
            title: (req.body?.title || '').slice(0, 300),
            note:  (req.body?.note  || '').slice(0, 2000),
            status: 'new',
            added_by: ctx.userId,
        };
        if (req.file) {
            const fd = new FormData();
            for (const [k, v] of Object.entries(base)) fd.append(k, v);
            fd.append('kind', (req.file.mimetype || '').startsWith('image/') || (req.file.mimetype || '').startsWith('video/') ? 'media' : 'doc');
            fd.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' }), req.file.originalname || 'asset');
            const rec = await pb.collection('partner_assets').create(fd);
            return res.json({ asset: rec });
        }
        const url = (req.body?.url || '').trim();
        if (!url) return res.status(400).json({ error: 'provide a file upload or a url' });
        if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url must start with http(s)://' });
        const rec = await pb.collection('partner_assets').create({ ...base, kind: 'link', url, title: base.title || url });
        res.json({ asset: rec });
    } catch (err) {
        logger.error(`asset add failed: ${err.message}`);
        res.status(500).json({ error: 'could not add asset' });
    }
});

router.delete('/partner/:id/assets/:assetId', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner', 'editor']);
    if (!ctx) return;
    try {
        const asset = await pb.collection('partner_assets').getOne(req.params.assetId);
        if (asset.partner_id !== req.params.id) return res.status(404).json({ error: 'asset not found' });
        await pb.collection('partner_assets').delete(asset.id);
        res.json({ ok: true });
    } catch {
        res.status(404).json({ error: 'asset not found' });
    }
});

// ── Usage rollup ─────────────────────────────────────────────────────────────
// Aggregated server-side from usage_events. The dashboard polls this; for
// live ticking it can additionally subscribe to the usage_events collection
// via PocketBase realtime.

function rangeStart(range) {
    const now = new Date();
    if (range === 'all') return new Date(0); // lifetime — for hard credit caps, not just monthly alerts
    if (range === 'mtd') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (range === '7d')  return new Date(Date.now() - 7 * 24 * 3600 * 1000);
    // today (UTC midnight — PocketBase `created` is UTC)
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

router.get('/partner/:id/usage', async (req, res) => {
    const ctx = await requireMember(req, res);
    if (!ctx) return;
    const range = ['today', 'mtd', '7d', 'all'].includes(req.query.range) ? req.query.range : 'today';
    const start = rangeStart(range).toISOString().replace('T', ' ').slice(0, 19);
    try {
        const events = await pb.collection('usage_events').getFullList({
            filter: `partner_id = "${esc(req.params.id)}" && created >= "${start}"`,
            sort: '-created',
        });
        const sum = { cost_usd: 0, input_tokens: 0, output_tokens: 0, calls: events.length, estimated_calls: 0 };
        const byAgent = {}, byModel = {}, byContext = {};
        for (const e of events) {
            sum.cost_usd += e.cost_usd || 0;
            sum.input_tokens += e.input_tokens || 0;
            sum.output_tokens += e.output_tokens || 0;
            if (e.estimated) sum.estimated_calls++;
            const bump = (map, k) => {
                if (!map[k]) map[k] = { cost_usd: 0, calls: 0 };
                map[k].cost_usd += e.cost_usd || 0; map[k].calls++;
            };
            bump(byAgent, e.agent || '(untagged)');
            bump(byModel, `${e.provider}/${e.model}`);
            bump(byContext, e.context || 'untagged');
        }
        sum.cost_usd = Number(sum.cost_usd.toFixed(4));

        // Month-to-date spend regardless of the selected range — powers the
        // budget alert banner, which is always monthly.
        let mtdSpend = 0;
        if (range === 'mtd') {
            mtdSpend = sum.cost_usd;
        } else {
            const mtdStart = rangeStart('mtd').toISOString().replace('T', ' ').slice(0, 19);
            try {
                const mtdEvents = await pb.collection('usage_events').getFullList({
                    filter: `partner_id = "${esc(req.params.id)}" && created >= "${mtdStart}"`,
                    fields: 'cost_usd',
                });
                for (const e of mtdEvents) mtdSpend += e.cost_usd || 0;
                mtdSpend = Number(mtdSpend.toFixed(4));
            } catch { /* alert simply won't show */ }
        }

        res.json({
            range, since: start,
            totals: sum,
            by_agent:   Object.entries(byAgent).map(([k, v]) => ({ key: k, ...v, cost_usd: Number(v.cost_usd.toFixed(4)) })).sort((a, b) => b.cost_usd - a.cost_usd),
            by_model:   Object.entries(byModel).map(([k, v]) => ({ key: k, ...v, cost_usd: Number(v.cost_usd.toFixed(4)) })).sort((a, b) => b.cost_usd - a.cost_usd),
            by_context: Object.entries(byContext).map(([k, v]) => ({ key: k, ...v, cost_usd: Number(v.cost_usd.toFixed(4)) })).sort((a, b) => b.cost_usd - a.cost_usd),
            monthly_budget_usd: ctx.partner.monthly_budget_usd || 0,
            credit_cap_usd: ctx.partner.credit_cap_usd || 0,
            mtd_spend_usd: mtdSpend,
        });
    } catch (err) {
        logger.error(`usage rollup failed: ${err.message}`);
        res.status(500).json({ error: 'could not compute usage' });
    }
});

// ── Manual charges ───────────────────────────────────────────────────────────
// Spend that never touches providers/index.js — a VPS bill, ad spend, a CLI
// tool run outside kaushalstack — logged by hand so a partner's true cost
// isn't undercounted by LLM-only usage_events.

router.get('/partner/:id/manual-charges', async (req, res) => {
    const ctx = await requireMember(req, res);
    if (!ctx) return;
    try {
        const items = await pb.collection('partner_manual_charges').getFullList({
            filter: `partner_id = "${esc(req.params.id)}"`, sort: '-created',
        });
        const total = Number(items.reduce((sum, c) => sum + (c.amount_usd || 0), 0).toFixed(4));
        res.json({ charges: items, total_usd: total });
    } catch (err) {
        logger.error(`manual charges list failed: ${err.message}`);
        res.status(500).json({ error: 'could not list charges' });
    }
});

router.post('/partner/:id/manual-charges', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner', 'editor']);
    if (!ctx) return;
    const description = (req.body?.description || '').trim().slice(0, 500);
    const amount = Number(req.body?.amount_usd);
    if (!description) return res.status(400).json({ error: 'description is required' });
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'amount_usd must be a non-negative number' });
    try {
        const rec = await pb.collection('partner_manual_charges').create({
            partner_id: req.params.id, description, amount_usd: amount, added_by: ctx.userId,
        });
        res.json({ charge: rec });
    } catch (err) {
        logger.error(`manual charge add failed: ${err.message}`);
        res.status(500).json({ error: 'could not add charge' });
    }
});

router.delete('/partner/:id/manual-charges/:chargeId', async (req, res) => {
    const ctx = await requireMember(req, res, ['owner', 'editor']);
    if (!ctx) return;
    try {
        const charge = await pb.collection('partner_manual_charges').getOne(req.params.chargeId);
        if (charge.partner_id !== req.params.id) return res.status(404).json({ error: 'charge not found' });
        await pb.collection('partner_manual_charges').delete(charge.id);
        res.json({ ok: true });
    } catch {
        res.status(404).json({ error: 'charge not found' });
    }
});

// ── Entitlements ─────────────────────────────────────────────────────────────
// Which marketplace features this partner currently has paid access to.
// Public read (no auth) so the partner-facing portals (MrnMr,
// ConsciousConnections) can gate their UI without a user session — it only
// exposes feature ids, nothing sensitive. A subscription past paid_until or
// cancelled does not appear here.

router.get('/partner/:id/entitlements', async (req, res) => {
    try {
        await ensurePartnerCollections();
        const subs = await pb.collection('feature_subscriptions').getFullList({
            filter: `partner_id = "${esc(req.params.id)}" && status = "active"`,
            fields: 'feature_id,paid_until',
        });
        const now = Date.now();
        const features = Array.from(new Set(
            subs
                .filter(s => s.paid_until && new Date(s.paid_until).getTime() >= now)
                .map(s => s.feature_id),
        ));
        res.json({ partner_id: req.params.id, features });
    } catch (err) {
        logger.error(`entitlements failed: ${err.message}`);
        res.status(500).json({ error: 'could not load entitlements' });
    }
});

export default router;
