// Admin: every private (partner-scoped) skill with the partner it works for.
//
// Attribution is resolved in priority order, because the linkage grew
// organically across three generations of seeding:
//   1. direct    — skills.partner_id (new seeds set this explicitly)
//   2. business  — skills.business_id → businesses.name → partner of the
//                  same normalized name (the ReFunction competitor watchers)
//   3. team      — skill.agent_name appears on a partner's team roster
//                  (the ConsciousConnections portal crew, seeded by name only)
//   4. unassigned — shown honestly rather than guessed
//
// Read-only; served via the superuser client since collection rules hide
// private skills from every normal token on purpose.

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

// Same loose key the Customers page pairs facets with.
const normKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseTeam(raw) {
    let team = raw;
    if (typeof team === 'string') { try { team = JSON.parse(team); } catch { return []; } }
    return Array.isArray(team) ? team : [];
}

router.get('/admin/private-skills', requireAdmin, async (req, res) => {
    try {
        const [skills, partners, businesses] = await Promise.all([
            pb.collection('skills').getFullList({
                filter: 'private = true',
                fields: 'id,agent_name,name,category,partner_id,business_id,created_by,created',
                sort: '-created',
            }).catch(() => []),
            pb.collection('partners').getFullList({ fields: 'id,name,team' }).catch(() => []),
            pb.collection('businesses').getFullList({ fields: 'id,name' }).catch(() => []),
        ]);

        const partnerById = Object.fromEntries(partners.map(p => [p.id, p]));
        const partnerByKey = Object.fromEntries(partners.map(p => [normKey(p.name), p]));
        const businessById = Object.fromEntries(businesses.map(b => [b.id, b]));
        const partnerByAgent = {};
        for (const p of partners) {
            for (const m of parseTeam(p.team)) {
                if (m.agent_name) partnerByAgent[m.agent_name] ||= p;
            }
        }

        const items = skills.map(s => {
            let partner = null;
            let via = 'unassigned';
            if (s.partner_id && partnerById[s.partner_id]) {
                partner = partnerById[s.partner_id];
                via = 'direct';
            } else if (s.business_id && businessById[s.business_id]) {
                const b = businessById[s.business_id];
                const p = partnerByKey[normKey(b.name)];
                if (p) { partner = p; via = 'business'; }
            }
            if (!partner && s.agent_name && partnerByAgent[s.agent_name]) {
                partner = partnerByAgent[s.agent_name];
                via = 'team';
            }
            return {
                id: s.id,
                agent_name: s.agent_name || '—',
                skill_name: s.name || '',
                category: s.category || '',
                partner: partner ? { id: partner.id, name: partner.name } : null,
                via: partner ? via : 'unassigned',
                business_name: s.business_id ? (businessById[s.business_id]?.name || s.business_id) : '',
                created: s.created,
            };
        });

        res.json({
            items,
            totals: {
                total: items.length,
                assigned: items.filter(i => i.partner).length,
                unassigned: items.filter(i => !i.partner).length,
            },
        });
    } catch (err) {
        logger.error('admin private-skills failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
