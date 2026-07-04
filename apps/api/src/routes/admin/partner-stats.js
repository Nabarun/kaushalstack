import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

const esc = (s) => String(s || '').replace(/"/g, '\\"');

function rangeStart(range) {
    const now = new Date();
    if (range === 'mtd') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (range === '7d')  return new Date(Date.now() - 7 * 24 * 3600 * 1000);
    if (range === 'today') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return null; // all time
}

router.get('/admin/partner-stats', requireAdmin, async (req, res) => {
    const range = ['today', '7d', 'mtd', 'all'].includes(req.query.range) ? req.query.range : 'mtd';
    try {
        // Fetch all partners
        let partners = [];
        try {
            partners = await pb.collection('partners').getFullList({ sort: 'name' });
        } catch { /* collection may not exist yet */ }

        const partnerMap = Object.fromEntries(partners.map(p => [p.id, p]));

        // Fetch usage events within range
        const start = rangeStart(range);
        let eventsFilter = 'partner_id != ""';
        if (start) {
            const startStr = start.toISOString().replace('T', ' ').slice(0, 19);
            eventsFilter += ` && created >= "${startStr}"`;
        }

        let events = [];
        try {
            events = await pb.collection('usage_events').getFullList({
                filter: eventsFilter,
                sort: '-created',
                fields: 'partner_id,cost_usd,input_tokens,output_tokens,created,agent,model,provider',
            });
        } catch { /* usage_events may be empty */ }

        // Aggregate totals
        const totals = { cost_usd: 0, input_tokens: 0, output_tokens: 0, calls: events.length };
        const byPartner = {};

        for (const e of events) {
            totals.cost_usd     += e.cost_usd     || 0;
            totals.input_tokens += e.input_tokens  || 0;
            totals.output_tokens+= e.output_tokens || 0;

            const pid = e.partner_id;
            if (!byPartner[pid]) {
                byPartner[pid] = { cost_usd: 0, calls: 0, input_tokens: 0, output_tokens: 0, last_active: null };
            }
            byPartner[pid].cost_usd      += e.cost_usd     || 0;
            byPartner[pid].input_tokens  += e.input_tokens  || 0;
            byPartner[pid].output_tokens += e.output_tokens || 0;
            byPartner[pid].calls++;
            if (!byPartner[pid].last_active || e.created > byPartner[pid].last_active) {
                byPartner[pid].last_active = e.created;
            }
        }

        totals.cost_usd = Number(totals.cost_usd.toFixed(4));

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
            totals: { ...totals, partners: partners.length, active_partners: Object.keys(byPartner).length },
            partners: partnerRows,
        });
    } catch (err) {
        logger.error('admin partner-stats failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
