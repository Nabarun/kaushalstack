import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
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
