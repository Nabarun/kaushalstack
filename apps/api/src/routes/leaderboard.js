import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

const router = Router();

function publicUserFields(u) {
    if (!u) return null;
    return {
        id: u.id,
        username: u.username,
        name: u.name || '',
        avatar: u.avatar || '',
        collectionId: u.collectionId, // needed for pb.files.getUrl on the client
    };
}

async function hydrateUsers(userIds) {
    const distinct = [...new Set(userIds.filter(Boolean))];
    if (distinct.length === 0) return {};
    const filter = distinct.map(id => `id = "${id}"`).join(' || ');
    try {
        const list = await pb.collection('users').getFullList({ filter, $autoCancel: false });
        const map = {};
        for (const u of list) map[u.id] = publicUserFields(u);
        return map;
    } catch (err) {
        logger.warn('hydrateUsers failed:', err.message);
        return {};
    }
}

// GET /leaderboard?month=YYYY-MM (defaults to current month)
router.get('/leaderboard', async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    try {
        const list = await pb.collection('leaderboard').getList(1, 100, {
            filter: `month = "${month}"`,
            sort: '-points',
        });

        const userMap = await hydrateUsers(list.items.map(r => r.user_id));
        const items = list.items.map((r, i) => ({
            id: r.id,
            user_id: r.user_id,
            month: r.month,
            points: r.points || 0,
            contribution_count: r.contribution_count || 0,
            rank: r.rank || (i + 1),
            badge: r.badge || '',
            user: userMap[r.user_id] || null,
        }));

        res.json({ items, month });
    } catch (err) {
        logger.error('leaderboard list error:', err.message);
        res.status(500).json({ error: err.message, items: [] });
    }
});

// GET /contributors — users with contribution_count > 0 OR skills_added > 0
router.get('/contributors', async (req, res) => {
    try {
        const list = await pb.collection('users').getFullList({
            filter: 'contribution_count > 0 || skills_added > 0',
            sort: '-contribution_count,-skills_added,-created',
            $autoCancel: false,
        });
        const items = list.map(u => ({
            ...publicUserFields(u),
            contribution_count: u.contribution_count || 0,
            skills_added: u.skills_added || 0,
            created: u.created,
        }));
        res.json({ items });
    } catch (err) {
        logger.error('contributors list error:', err.message);
        res.status(500).json({ error: err.message, items: [] });
    }
});

export default router;
