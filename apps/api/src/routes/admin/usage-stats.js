// Provider-level usage: which provider (OpenAI / Anthropic / Google / xAI)
// is burning how much, and which partner is consuming it. One query over
// usage_events serves both the range-scoped aggregates and the lifetime
// per-partner spend that credit caps are measured against.

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

const zero = () => ({ cost_usd: 0, calls: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0, estimated_calls: 0 });

function add(bucket, e) {
    bucket.cost_usd      += e.cost_usd      || 0;
    bucket.calls++;
    bucket.input_tokens  += e.input_tokens  || 0;
    bucket.output_tokens += e.output_tokens || 0;
    bucket.cached_tokens += e.cached_tokens || 0;
    if (e.estimated) bucket.estimated_calls++;
}

const round = (b) => ({ ...b, cost_usd: Number(b.cost_usd.toFixed(4)) });

router.get('/admin/usage-by-provider', requireAdmin, async (req, res) => {
    const range = ['today', '7d', 'mtd', 'all'].includes(req.query.range) ? req.query.range : 'mtd';
    try {
        let partners = [];
        try {
            partners = await pb.collection('partners').getFullList({
                sort: 'name', fields: 'id,name,status,credit_cap_usd',
            });
        } catch { /* collection may not exist yet */ }

        // All events, unfiltered: the range aggregates and the lifetime
        // cap math come from the same list.
        let events = [];
        try {
            events = await pb.collection('usage_events').getFullList({
                fields: 'partner_id,provider,model,context,cost_usd,input_tokens,output_tokens,cached_tokens,estimated,created',
            });
        } catch {}

        const start = rangeStart(range);
        const startMs = start ? start.getTime() : 0;

        const totals = zero();
        const byProvider = {};              // provider -> bucket + models map
        const byPartnerProvider = {};       // partner_id -> { total, providers: {} }
        const lifetimeByPartner = {};       // partner_id -> usd (all time, cap basis)
        const untagged = { ...zero(), providers: {}, contexts: {} };
        const byContext = {};               // context -> bucket (ALL events, tagged or not)
        const byDay = {};                   // YYYY-MM-DD -> { total_usd, providers: {prov: usd} }

        for (const e of events) {
            const pid = e.partner_id || '';
            if (pid) lifetimeByPartner[pid] = (lifetimeByPartner[pid] || 0) + (e.cost_usd || 0);

            if (startMs && new Date(e.created).getTime() < startMs) continue;

            const provider = e.provider || 'unknown';
            add(totals, e);

            // Which feature burns the money — across every event, not just untagged.
            const ectx = e.context || 'untagged';
            if (!byContext[ectx]) byContext[ectx] = zero();
            add(byContext[ectx], e);

            // Daily spend series for the trend chart.
            const day = String(e.created || '').slice(0, 10);
            if (day) {
                if (!byDay[day]) byDay[day] = { total_usd: 0, providers: {} };
                byDay[day].total_usd += e.cost_usd || 0;
                byDay[day].providers[provider] = (byDay[day].providers[provider] || 0) + (e.cost_usd || 0);
            }

            if (!byProvider[provider]) byProvider[provider] = { ...zero(), models: {} };
            add(byProvider[provider], e);
            const model = e.model || 'unknown';
            if (!byProvider[provider].models[model]) byProvider[provider].models[model] = zero();
            add(byProvider[provider].models[model], e);

            if (pid) {
                if (!byPartnerProvider[pid]) byPartnerProvider[pid] = { total: zero(), providers: {} };
                add(byPartnerProvider[pid].total, e);
                if (!byPartnerProvider[pid].providers[provider]) byPartnerProvider[pid].providers[provider] = zero();
                add(byPartnerProvider[pid].providers[provider], e);
            } else {
                add(untagged, e);
                if (!untagged.providers[provider]) untagged.providers[provider] = zero();
                add(untagged.providers[provider], e);
                const ctx = e.context || 'untagged';
                if (!untagged.contexts[ctx]) untagged.contexts[ctx] = zero();
                add(untagged.contexts[ctx], e);
            }
        }

        const providersOut = Object.entries(byProvider)
            .map(([provider, { models, ...b }]) => ({
                provider,
                ...round(b),
                models: Object.entries(models)
                    .map(([model, mb]) => ({ model, ...round(mb) }))
                    .sort((a, z) => z.cost_usd - a.cost_usd),
            }))
            .sort((a, z) => z.cost_usd - a.cost_usd);

        // Every partner appears — a zero row with a cap set is exactly the
        // "capped but idle" signal the page exists to show.
        const partnersOut = partners.map(p => {
            const agg = byPartnerProvider[p.id];
            const provOut = {};
            for (const [prov, b] of Object.entries(agg?.providers || {})) provOut[prov] = round(b);
            return {
                partner_id: p.id,
                name: p.name || p.id,
                status: p.status || 'active',
                credit_cap_usd: Number(p.credit_cap_usd) || 0,
                lifetime_cost_usd: Number((lifetimeByPartner[p.id] || 0).toFixed(4)),
                ...round(agg?.total || zero()),
                by_provider: provOut,
            };
        }).sort((a, z) => z.cost_usd - a.cost_usd || z.lifetime_cost_usd - a.lifetime_cost_usd);

        const { providers: uProv, contexts: uCtx, ...uTotals } = untagged;
        const untaggedProviders = {};
        for (const [prov, b] of Object.entries(uProv)) untaggedProviders[prov] = round(b);
        const untaggedContexts = Object.entries(uCtx)
            .map(([context, b]) => ({ context, ...round(b) }))
            .sort((a, z) => z.cost_usd - a.cost_usd)
            .slice(0, 10);

        const contextsOut = Object.entries(byContext)
            .map(([context, b]) => ({ context, ...round(b) }))
            .sort((a, z) => z.cost_usd - a.cost_usd);

        // Chart series capped at the most recent 90 days so range=all stays light.
        const dailyOut = Object.entries(byDay)
            .sort(([a], [z]) => a.localeCompare(z))
            .slice(-90)
            .map(([date, d]) => ({
                date,
                total_usd: Number(d.total_usd.toFixed(4)),
                providers: Object.fromEntries(
                    Object.entries(d.providers).map(([p, usd]) => [p, Number(usd.toFixed(4))]),
                ),
            }));

        res.json({
            range,
            totals: round(totals),
            providers: providersOut,
            partners: partnersOut,
            contexts: contextsOut,
            daily: dailyOut,
            untagged: {
                ...round(uTotals),
                providers: untaggedProviders,
                contexts: untaggedContexts,
            },
        });
    } catch (err) {
        logger.error('admin usage-by-provider failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
