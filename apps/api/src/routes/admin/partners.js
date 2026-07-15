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

        const rows = partners.map((p) => {
            const team = normalizeTeam(p.team);
            const owner = owners[p.owner_user_id] || null;
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

export default router;
