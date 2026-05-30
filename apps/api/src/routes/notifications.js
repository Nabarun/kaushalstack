import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

const router = Router();

function getUserIdFromHeader(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(authHeader.slice(7).split('.')[1], 'base64url').toString('utf8')
        );
        return payload.id || null;
    } catch { return null; }
}

function publicActor(u) {
    if (!u) return null;
    return { id: u.id, username: u.username, name: u.name || '', avatar: u.avatar || '', collectionId: u.collectionId };
}

// GET /me/notifications — latest 20 with author/actor hydrated
router.get('/me/notifications', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const list = await pb.collection('notifications').getList(1, 20, {
            filter: `user_id = "${userId}"`,
            sort: '-created',
        });

        const actorIds = [...new Set(list.items.map(n => n.actor_id).filter(Boolean))];
        const actorMap = {};
        if (actorIds.length > 0) {
            const filter = actorIds.map(id => `id = "${id}"`).join(' || ');
            const users = await pb.collection('users').getFullList({ filter, $autoCancel: false }).catch(() => []);
            for (const u of users) actorMap[u.id] = publicActor(u);
        }

        const items = list.items.map(n => ({
            id: n.id,
            kind: n.kind,
            data: n.data || {},
            actor: actorMap[n.actor_id] || (n.actor_id === 'ai-reviewer' ? { id: 'ai-reviewer', username: 'AI reviewer', name: 'AI reviewer' } : null),
            actor_id: n.actor_id,
            subject_id: n.subject_id,
            read_at: n.read_at || null,
            created: n.created,
        }));

        res.json({ items });
    } catch (err) {
        logger.error('list notifications error:', err.message);
        res.status(500).json({ error: err.message, items: [] });
    }
});

// GET /me/notifications/unread-count — used by the bell badge
router.get('/me/notifications/unread-count', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.json({ count: 0 });

    try {
        const list = await pb.collection('notifications').getList(1, 1, {
            filter: `user_id = "${userId}" && read_at = null`,
            fields: 'id',
        });
        res.json({ count: list.totalItems });
    } catch (err) {
        res.json({ count: 0 });
    }
});

// POST /me/notifications/:id/read — mark one read
router.post('/me/notifications/:id/read', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const n = await pb.collection('notifications').getOne(req.params.id);
        if (n.user_id !== userId) return res.status(403).json({ error: 'forbidden' });
        if (!n.read_at) await pb.collection('notifications').update(n.id, { read_at: new Date().toISOString() });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /me/notifications/read-all
router.post('/me/notifications/read-all', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const all = await pb.collection('notifications').getFullList({
            filter: `user_id = "${userId}" && read_at = null`,
            fields: 'id',
            $autoCancel: false,
        });
        const now = new Date().toISOString();
        await Promise.all(all.map(n => pb.collection('notifications').update(n.id, { read_at: now })));
        res.json({ ok: true, marked: all.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
