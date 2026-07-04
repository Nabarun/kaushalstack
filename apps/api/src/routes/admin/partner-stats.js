import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

function rangeStart(range) {
    const now = new Date();
    if (range === 'mtd')   return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (range === '7d')    return new Date(Date.now() - 7 * 24 * 3600 * 1000);
    if (range === 'today') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return null;
}

router.get('/admin/partner-stats', requireAdmin, async (req, res) => {
    const range = ['today', '7d', 'mtd', 'all'].includes(req.query.range) ? req.query.range : 'mtd';
    try {
        // ── Partners ─────────────────────────────────────────────────────────
        let partners = [];
        try {
            partners = await pb.collection('partners').getFullList({ sort: 'name' });
        } catch { /* collection may not exist yet */ }

        // ── Member map: user_id → partner_id ─────────────────────────────────
        // Most usage_events carry partner_id='' — they're attributed by user
        // membership, exactly like the per-partner /partner/:id/usage endpoint.
        const userToPartner = {};
        try {
            const members = await pb.collection('partner_members').getFullList({
                fields: 'partner_id,user_id',
            });
            for (const m of members) {
                if (m.user_id && !userToPartner[m.user_id]) {
                    userToPartner[m.user_id] = m.partner_id;
                }
            }
        } catch {}

        // ── All usage events in range ─────────────────────────────────────────
        const start = rangeStart(range);
        const startStr = start ? start.toISOString().replace('T', ' ').slice(0, 19) : null;

        let events = [];
        try {
            events = await pb.collection('usage_events').getFullList({
                filter: startStr ? `created >= "${startStr}"` : '',
                sort: '-created',
                fields: 'partner_id,user_id,cost_usd,input_tokens,output_tokens,created',
            });
        } catch {}

        // ── Platform totals (all events) ──────────────────────────────────────
        const totals = { cost_usd: 0, input_tokens: 0, output_tokens: 0, calls: events.length };
        for (const e of events) {
            totals.cost_usd      += e.cost_usd      || 0;
            totals.input_tokens  += e.input_tokens   || 0;
            totals.output_tokens += e.output_tokens  || 0;
        }
        totals.cost_usd = Number(totals.cost_usd.toFixed(4));

        // ── Per-partner attribution ───────────────────────────────────────────
        // Attribute each event to a partner via:
        //   1. event.partner_id (explicit)
        //   2. userToPartner[event.user_id] (member-based, covers most events)
        const byPartner = {};
        for (const e of events) {
            const pid = e.partner_id || userToPartner[e.user_id] || '';
            if (!pid) continue;
            if (!byPartner[pid]) {
                byPartner[pid] = { cost_usd: 0, calls: 0, input_tokens: 0, output_tokens: 0, last_active: null };
            }
            byPartner[pid].cost_usd      += e.cost_usd      || 0;
            byPartner[pid].calls++;
            byPartner[pid].input_tokens  += e.input_tokens   || 0;
            byPartner[pid].output_tokens += e.output_tokens  || 0;
            if (!byPartner[pid].last_active || e.created > byPartner[pid].last_active) {
                byPartner[pid].last_active = e.created;
            }
        }

        const partnerRows = partners.map(p => {
            const u = byPartner[p.id] || { cost_usd: 0, calls: 0, input_tokens: 0, output_tokens: 0, last_active: null };
            return {
                id: p.id,
                name: p.name,
                status: p.status || 'active',
                cost_usd: Number((u.cost_usd || 0).toFixed(4)),
                calls: u.calls,
                input_tokens: u.input_tokens,
                output_tokens: u.output_tokens,
                last_active: u.last_active,
            };
        }).sort((a, b) => b.cost_usd - a.cost_usd);

        res.json({
            range,
            totals: {
                ...totals,
                partners: partners.length,
                active_partners: Object.keys(byPartner).length,
            },
            partners: partnerRows,
        });
    } catch (err) {
        logger.error('admin partner-stats failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
