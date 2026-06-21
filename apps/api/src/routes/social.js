import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { notify, NotificationKind } from '../notifications/dispatch.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();

const MAX_COMMENT_LEN = 2000;

function publicUserFields(u) {
    if (!u) return null;
    return {
        id: u.id,
        username: u.username,
        name: u.name || '',
        avatar: u.avatar || '',
        collectionId: u.collectionId,
    };
}

async function hydrateUsers(userIds) {
    const distinct = [...new Set(userIds.filter(Boolean))];
    if (!distinct.length) return {};
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

// ── Likes ───────────────────────────────────────────────────────────────────

// POST /skills/:id/like — toggle the current user's like for this skill
router.post('/skills/:id/like', async (req, res) => {
    const userId  = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const skillId = req.params.id;

    try {
        const skill = await pb.collection('skills').getOne(skillId).catch(() => null);
        if (!skill) return res.status(404).json({ error: 'skill not found' });

        const existing = await pb.collection('skill_likes').getList(1, 1, {
            filter: `user_id = "${userId}" && skill_id = "${skillId}"`,
        });

        let liked;
        let newCount = skill.likes_count || 0;

        if (existing.items.length) {
            // un-like
            await pb.collection('skill_likes').delete(existing.items[0].id);
            newCount = Math.max(0, newCount - 1);
            liked = false;
        } else {
            // like
            await pb.collection('skill_likes').create({ user_id: userId, skill_id: skillId });
            newCount = newCount + 1;
            liked = true;
        }

        await pb.collection('skills').update(skillId, { likes_count: newCount });
        res.json({ liked, likes_count: newCount });
    } catch (err) {
        logger.error('toggle like error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /skills/:id/like/me — whether the caller has liked this skill
router.get('/skills/:id/like/me', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.json({ liked: false });

    try {
        const r = await pb.collection('skill_likes').getList(1, 1, {
            filter: `user_id = "${userId}" && skill_id = "${req.params.id}"`,
        });
        res.json({ liked: r.items.length > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Comments ────────────────────────────────────────────────────────────────

// GET /skills/:id/comments — list comments, newest first, with author info
router.get('/skills/:id/comments', async (req, res) => {
    const skillId = req.params.id;
    try {
        const list = await pb.collection('skill_comments').getList(1, 100, {
            filter: `skill_id = "${skillId}"`,
            sort: '-created',
        });
        const userMap = await hydrateUsers(list.items.map(c => c.user_id));
        const items = list.items.map(c => ({
            id: c.id,
            user_id: c.user_id,
            text: c.text,
            created: c.created,
            updated: c.updated,
            author: userMap[c.user_id] || null,
        }));
        res.json({ items, total: list.totalItems });
    } catch (err) {
        logger.error('list comments error:', err.message);
        res.status(500).json({ error: err.message, items: [] });
    }
});

// POST /skills/:id/comments — add a comment
router.post('/skills/:id/comments', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const skillId = req.params.id;
    const text    = String(req.body?.text || '').trim().slice(0, MAX_COMMENT_LEN);
    if (!text) return res.status(400).json({ error: 'comment text is required' });

    try {
        const skill = await pb.collection('skills').getOne(skillId).catch(() => null);
        if (!skill) return res.status(404).json({ error: 'skill not found' });

        const created = await pb.collection('skill_comments').create({
            user_id: userId, skill_id: skillId, text,
        });

        const newCount = (skill.comments_count || 0) + 1;
        await pb.collection('skills').update(skillId, { comments_count: newCount });

        // hydrate author for immediate render
        const u = await pb.collection('users').getOne(userId).catch(() => null);

        // Notify the skill's creator (not the commenter themselves).
        if (skill.created_by) {
            notify({
                userId: skill.created_by,
                kind: NotificationKind.COMMENT_ON_SKILL,
                actor_id: userId,
                subject_id: skill.id,
                data: {
                    skill_name: skill.name,
                    comment_excerpt: text.slice(0, 240),
                    author_username: u?.username || 'A member',
                },
            });
        }

        res.json({
            comment: {
                id: created.id,
                user_id: userId,
                text: created.text,
                created: created.created,
                author: publicUserFields(u),
            },
            comments_count: newCount,
        });
    } catch (err) {
        logger.error('add comment error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /skills/:id/comments/:cid — author can delete their own comment;
//   skill owner & admins can delete anything attached to their skill.
router.delete('/skills/:id/comments/:cid', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const comment = await pb.collection('skill_comments').getOne(req.params.cid).catch(() => null);
        if (!comment) return res.status(404).json({ error: 'comment not found' });
        if (comment.skill_id !== req.params.id) return res.status(400).json({ error: 'comment does not belong to this skill' });

        const me = await pb.collection('users').getOne(userId).catch(() => null);
        const isAuthor = comment.user_id === userId;
        const isAdmin  = !!me?.is_admin;
        if (!isAuthor && !isAdmin) return res.status(403).json({ error: 'forbidden' });

        await pb.collection('skill_comments').delete(comment.id);

        // best-effort counter decrement
        const skill = await pb.collection('skills').getOne(comment.skill_id).catch(() => null);
        if (skill) {
            await pb.collection('skills').update(skill.id, {
                comments_count: Math.max(0, (skill.comments_count || 0) - 1),
            });
        }

        res.json({ ok: true });
    } catch (err) {
        logger.error('delete comment error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
