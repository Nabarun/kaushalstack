// Partner portal API.
//   POST   /partner                      create a partner (caller = owner)
//   GET    /partner/mine                 partners the caller belongs to
//   GET    /partner/:id/assets           list assets
//   POST   /partner/:id/assets           add link (json) or doc/media (multipart "file")
//   DELETE /partner/:id/assets/:assetId  remove an asset
//   GET    /partner/:id/usage?range=today|mtd|7d   spend + tokens rollup
//
// All routes require auth. Membership is enforced server-side on every call —
// the partner_id in a URL is never trusted on its own.

import { Router } from 'express';
import multer from 'multer';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../utils/auth.js';
import { ensurePartnerCollections } from '../partner/collections.js';

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
    if (range === 'mtd') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (range === '7d')  return new Date(Date.now() - 7 * 24 * 3600 * 1000);
    // today (UTC midnight — PocketBase `created` is UTC)
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

router.get('/partner/:id/usage', async (req, res) => {
    const ctx = await requireMember(req, res);
    if (!ctx) return;
    const range = ['today', 'mtd', '7d'].includes(req.query.range) ? req.query.range : 'today';
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
        res.json({
            range, since: start,
            totals: sum,
            by_agent:   Object.entries(byAgent).map(([k, v]) => ({ key: k, ...v, cost_usd: Number(v.cost_usd.toFixed(4)) })).sort((a, b) => b.cost_usd - a.cost_usd),
            by_model:   Object.entries(byModel).map(([k, v]) => ({ key: k, ...v, cost_usd: Number(v.cost_usd.toFixed(4)) })).sort((a, b) => b.cost_usd - a.cost_usd),
            by_context: Object.entries(byContext).map(([k, v]) => ({ key: k, ...v, cost_usd: Number(v.cost_usd.toFixed(4)) })).sort((a, b) => b.cost_usd - a.cost_usd),
            monthly_budget_usd: ctx.partner.monthly_budget_usd || 0,
        });
    } catch (err) {
        logger.error(`usage rollup failed: ${err.message}`);
        res.status(500).json({ error: 'could not compute usage' });
    }
});

export default router;
