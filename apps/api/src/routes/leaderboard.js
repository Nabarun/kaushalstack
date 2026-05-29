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

async function getAdminUserIds() {
    try {
        const admins = await pb.collection('users').getFullList({
            filter: 'is_admin = true',
            fields: 'id',
            $autoCancel: false,
        });
        return new Set(admins.map(u => u.id));
    } catch (err) {
        logger.warn('getAdminUserIds failed:', err.message);
        return new Set();
    }
}

// GET /leaderboard?month=YYYY-MM (defaults to current month)
router.get('/leaderboard', async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    try {
        const adminIds = await getAdminUserIds();

        const list = await pb.collection('leaderboard').getList(1, 100, {
            filter: `month = "${month}"`,
            sort: '-points',
        });

        const filtered = list.items.filter(r => !adminIds.has(r.user_id));
        const userMap  = await hydrateUsers(filtered.map(r => r.user_id));

        const items = filtered.map((r, i) => ({
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

// GET /members — every non-admin user on the platform, sorted by activity
// (Was previously /contributors with a contribution_count>0 filter; renamed and
// opened up so brand-new members are visible too.)
async function listMembers(_req, res) {
    try {
        const list = await pb.collection('users').getFullList({
            filter: 'is_admin != true',
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
        logger.error('members list error:', err.message);
        res.status(500).json({ error: err.message, items: [] });
    }
}

router.get('/members', listMembers);
// Keep /contributors as a temporary alias so any cached client doesn't 404
router.get('/contributors', listMembers);

// GET /stats — public totals for landing/about pages
router.get('/stats', async (_req, res) => {
    try {
        const [members, skills, leaderboard] = await Promise.all([
            pb.collection('users').getList(1, 1, { filter: 'is_admin != true', fields: 'id', $autoCancel: false }),
            pb.collection('skills').getList(1, 1, { fields: 'id', $autoCancel: false }),
            pb.collection('leaderboard').getList(1, 1, { fields: 'id', $autoCancel: false }),
        ]);
        res.json({
            members: members.totalItems,
            skills: skills.totalItems,
            leaderboard: leaderboard.totalItems,
        });
    } catch (err) {
        logger.error('stats error:', err.message);
        res.status(500).json({ error: err.message, members: 0, skills: 0, leaderboard: 0 });
    }
});

export default router;
