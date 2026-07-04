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
    return null; // all time
}

router.get('/admin/roundtable-stats', requireAdmin, async (req, res) => {
    const range = ['today', '7d', 'mtd', 'all'].includes(req.query.range) ? req.query.range : 'mtd';
    try {
        const start = rangeStart(range);
        const startStr = start ? start.toISOString().replace('T', ' ').slice(0, 19) : null;

        // ── Chats ────────────────────────────────────────────────────────────
        let chats = [];
        try {
            const filter = startStr ? `created >= "${startStr}"` : '';
            chats = await pb.collection('roundtable_chats').getFullList({
                filter,
                fields: 'user_id,phase,created',
                sort: '-created',
            });
        } catch { /* collection may not exist yet */ }

        const uniqueUsers = new Set(chats.map(c => c.user_id)).size;
        const phases = { ideation: 0, execution: 0, marketing: 0, other: 0 };
        const userChatCount = {};
        for (const c of chats) {
            const p = c.phase || 'ideation';
            if (phases[p] !== undefined) phases[p]++; else phases.other++;
            userChatCount[c.user_id] = (userChatCount[c.user_id] || 0) + 1;
        }

        // Top 5 users by chat count — hydrate usernames
        const topUserIds = Object.entries(userChatCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id]) => id);

        const topUsers = [];
        for (const uid of topUserIds) {
            try {
                const u = await pb.collection('users').getOne(uid, { fields: 'id,username,name' });
                topUsers.push({ id: uid, username: u.username || u.name || uid, chats: userChatCount[uid] });
            } catch {
                topUsers.push({ id: uid, username: uid.slice(0, 8) + '…', chats: userChatCount[uid] });
            }
        }

        // ── Free-tier usage ──────────────────────────────────────────────────
        let usageRows = [];
        try {
            usageRows = await pb.collection('roundtable_usage').getFullList({
                fields: 'user_id,uses',
            });
        } catch {}

        const FREE_LIMIT = 10;
        const atLimit   = usageRows.filter(r => (r.uses || 0) >= FREE_LIMIT).length;
        const totalFreeUsers = usageRows.length;

        // ── BYOK users ───────────────────────────────────────────────────────
        let byokCount = 0;
        try {
            const byokList = await pb.collection('users').getList(1, 1, {
                filter: 'byok_key_encrypted != ""',
                fields: 'id',
            });
            byokCount = byokList.totalItems;
        } catch {}

        res.json({
            range,
            totals: {
                chats: chats.length,
                unique_users: uniqueUsers,
                free_tier_users: totalFreeUsers,
                at_limit: atLimit,
                byok_users: byokCount,
            },
            phases,
            top_users: topUsers,
        });
    } catch (err) {
        logger.error('admin roundtable-stats failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
