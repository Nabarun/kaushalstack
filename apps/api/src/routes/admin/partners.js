import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { ensurePartnerCollections } from '../../partner/collections.js';
import { requireAdmin } from './auth.js';

const router = Router();

function normalizeTeam(raw) {
    if (!raw) return [];
    let team = raw;
    if (typeof team === 'string') {
        try { team = JSON.parse(team); } catch { return []; }
    }
    if (!Array.isArray(team)) return [];
    return team.map((m) => ({
        id: m.id || null,
        agent_name: m.agent_name || m.name || '—',
        role: m.name || m.role || '',
        category: m.category || '',
        description: m.description || '',
        associated_tech_skills: m.associated_tech_skills || '',
        why: m.why || '',
        // Multi-team partners (e.g. ConsciousConnections) group their bench
        // into named sub-teams; single-team partners just omit this.
        bench: m.bench || '',
    }));
}

router.get('/admin/partners', requireAdmin, async (req, res) => {
    try {
        const partners = await pb.collection('partners').getFullList({ sort: 'name' });

        // Resolve owner display info in one batch
        const ownerIds = Array.from(new Set(partners.map(p => p.owner_user_id).filter(Boolean)));
        const owners = {};
        if (ownerIds.length) {
            const filter = ownerIds.map(id => `id="${id}"`).join(' || ');
            try {
                const users = await pb.collection('users').getFullList({
                    filter,
                    fields: 'id,name,email,username',
                });
                for (const u of users) owners[u.id] = u;
            } catch (e) {
                logger.warn('admin/partners owner lookup failed:', e.message);
            }
        }

        // Aggregate all-time usage per partner in one pass over usage_events
        const usageByPartner = {};
        try {
            const events = await pb.collection('usage_events').getFullList({
                fields: 'partner_id,cost_usd,input_tokens,output_tokens,created',
            });
            for (const e of events) {
                const pid = e.partner_id;
                if (!pid) continue;
                if (!usageByPartner[pid]) {
                    usageByPartner[pid] = {
                        calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, last_active: null,
                    };
                }
                const u = usageByPartner[pid];
                u.calls++;
                u.cost_usd      += e.cost_usd      || 0;
                u.input_tokens  += e.input_tokens  || 0;
                u.output_tokens += e.output_tokens || 0;
                if (!u.last_active || e.created > u.last_active) u.last_active = e.created;
            }
        } catch (e) {
            logger.warn('admin/partners usage lookup failed:', e.message);
        }

        const rows = partners.map((p) => {
            const team = normalizeTeam(p.team);
            const owner = owners[p.owner_user_id] || null;
            const u = usageByPartner[p.id] || {
                calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, last_active: null,
            };
            return {
                id: p.id,
                name: p.name,
                status: p.status || 'active',
                website: p.website || '',
                owner_user_id: p.owner_user_id,
                owner: owner ? {
                    id: owner.id,
                    name: owner.name || owner.username || '',
                    email: owner.email || '',
                } : null,
                monthly_budget_usd: p.monthly_budget_usd || 0,
                credit_cap_usd: p.credit_cap_usd || 0,
                team_size: team.length,
                team,
                usage: {
                    calls: u.calls,
                    cost_usd: Number((u.cost_usd || 0).toFixed(4)),
                    input_tokens: u.input_tokens,
                    output_tokens: u.output_tokens,
                    last_active: u.last_active,
                },
                created: p.created,
                updated: p.updated,
            };
        });

        res.json({ items: rows });
    } catch (err) {
        logger.error('admin partners list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

function toRow(partner, owner) {
    return {
        id: partner.id,
        name: partner.name,
        status: partner.status || 'active',
        website: partner.website || '',
        owner_user_id: partner.owner_user_id,
        owner: owner ? {
            id: owner.id,
            name: owner.name || owner.username || '',
            email: owner.email || '',
        } : null,
        monthly_budget_usd: partner.monthly_budget_usd || 0,
        credit_cap_usd: partner.credit_cap_usd || 0,
        team_size: 0,
        team: [],
        usage: { calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, last_active: null },
        created: partner.created,
        updated: partner.updated,
    };
}

router.post('/admin/partners', requireAdmin, async (req, res) => {
    const name = (req.body?.name || '').trim();
    const ownerEmail = (req.body?.owner_email || '').trim().toLowerCase();
    const monthlyBudget = Number(req.body?.monthly_budget_usd) || 0;
    const website = (req.body?.website || '').trim().slice(0, 300);

    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
        // Resolve owner: by email if provided, else the admin caller.
        let ownerUser = null;
        if (ownerEmail) {
            try {
                ownerUser = await pb.collection('users').getFirstListItem(
                    `email = "${ownerEmail.replace(/"/g, '\\"')}"`,
                    { fields: 'id,name,email,username' },
                );
            } catch {
                return res.status(400).json({ error: `No user found with email "${ownerEmail}"` });
            }
        } else {
            try {
                ownerUser = await pb.collection('users').getOne(req.adminUserId, {
                    fields: 'id,name,email,username',
                });
            } catch { /* fall through with null */ }
        }
        const ownerId = ownerUser?.id || req.adminUserId;

        const partner = await pb.collection('partners').create({
            name,
            owner_user_id: ownerId,
            status: 'active',
            monthly_budget_usd: monthlyBudget,
            ...(website ? { website } : {}),
        });

        try {
            await pb.collection('partner_members').create({
                partner_id: partner.id,
                user_id: ownerId,
                role: 'owner',
            });
        } catch (e) {
            logger.warn(`partner_members owner grant failed for ${partner.id}:`, e.message);
        }

        res.json({ item: toRow(partner, ownerUser) });
    } catch (err) {
        logger.error('admin partner create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Token credits ────────────────────────────────────────────────────────────
// 1 token = $0.01 of credit_cap_usd (the ₹-paid → tokens conversion is the
// owner's call at grant time). Granting tokens raises the partner's hard cap
// and logs the grant so every payment has a paper trail.

const USD_PER_TOKEN = 0.01;

router.get('/admin/partners/:id/credits', requireAdmin, async (req, res) => {
    try {
        await ensurePartnerCollections();
        const partner = await pb.collection('partners').getOne(req.params.id);
        let grants = [];
        try {
            grants = await pb.collection('partner_credit_grants').getFullList({
                filter: `partner_id = "${req.params.id.replace(/"/g, '\\"')}"`,
                sort: '-created',
            });
        } catch { /* collection may not exist yet */ }
        res.json({
            credit_cap_usd: partner.credit_cap_usd || 0,
            tokens_cap: Math.round((partner.credit_cap_usd || 0) / USD_PER_TOKEN),
            grants: grants.map(g => ({
                id: g.id, tokens: g.tokens, amount_usd: g.amount_usd,
                note: g.note || '', created: g.created,
            })),
        });
    } catch (err) {
        logger.error('admin partner credits list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/partners/:id/credits', requireAdmin, async (req, res) => {
    const tokens = Math.round(Number(req.body?.tokens));
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!Number.isFinite(tokens) || tokens <= 0) {
        return res.status(400).json({ error: 'tokens must be a positive number' });
    }
    try {
        await ensurePartnerCollections();
        const partner = await pb.collection('partners').getOne(req.params.id);
        const amountUsd = Number((tokens * USD_PER_TOKEN).toFixed(4));
        const newCap = Number(((partner.credit_cap_usd || 0) + amountUsd).toFixed(4));

        const updated = await pb.collection('partners').update(partner.id, { credit_cap_usd: newCap });
        let grant = null;
        try {
            grant = await pb.collection('partner_credit_grants').create({
                partner_id: partner.id,
                tokens,
                amount_usd: amountUsd,
                note,
                added_by: req.adminUserId || '',
            });
        } catch (e) {
            logger.warn('credit grant log failed (cap was raised):', e.message);
        }

        logger.info(`admin: granted ${tokens} tokens ($${amountUsd}) to partner ${partner.name} (${partner.id}), cap now $${newCap}`);
        res.json({
            credit_cap_usd: updated.credit_cap_usd || 0,
            tokens_cap: Math.round((updated.credit_cap_usd || 0) / USD_PER_TOKEN),
            grant: grant ? {
                id: grant.id, tokens: grant.tokens, amount_usd: grant.amount_usd,
                note: grant.note || '', created: grant.created,
            } : null,
        });
    } catch (err) {
        logger.error('admin partner credit grant failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Revoke a token grant: the partner's cap drops by the grant's amount
// (floored at 0 so a partner who already spent it can't go negative-capped)
// and the log row disappears.
router.delete('/admin/partners/:id/credits/:grantId', requireAdmin, async (req, res) => {
    try {
        const grant = await pb.collection('partner_credit_grants').getOne(req.params.grantId).catch(() => null);
        if (!grant || grant.partner_id !== req.params.id) return res.status(404).json({ error: 'grant not found' });
        const partner = await pb.collection('partners').getOne(req.params.id);
        const newCap = Math.max(0, Number(((partner.credit_cap_usd || 0) - (grant.amount_usd || 0)).toFixed(4)));
        const updated = await pb.collection('partners').update(partner.id, { credit_cap_usd: newCap });
        await pb.collection('partner_credit_grants').delete(grant.id);
        logger.info(`admin: revoked grant ${grant.id} (${grant.tokens} tokens) from partner ${partner.name}, cap now $${newCap}`);
        res.json({
            credit_cap_usd: updated.credit_cap_usd || 0,
            tokens_cap: Math.round((updated.credit_cap_usd || 0) / USD_PER_TOKEN),
        });
    } catch (err) {
        logger.error('admin credit grant revoke failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Remove a partner. Memberships and feature subscriptions go with it;
// usage_events stay so historical spend accounting remains true.
router.delete('/admin/partners/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const esc = (s) => String(s || '').replace(/"/g, '\\"');
    try {
        const partner = await pb.collection('partners').getOne(id).catch(() => null);
        if (!partner) return res.status(404).json({ error: 'partner not found' });

        for (const col of ['partner_members', 'feature_subscriptions']) {
            try {
                const rows = await pb.collection(col).getFullList({
                    filter: `partner_id = "${esc(id)}"`,
                    fields: 'id',
                });
                for (const r of rows) await pb.collection(col).delete(r.id).catch(() => {});
            } catch { /* collection may not exist yet */ }
        }

        await pb.collection('partners').delete(id);
        logger.info(`admin: partner ${partner.name} (${id}) removed by ${req.adminUserId}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin partner delete failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
