import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

function pickEditable(obj) {
    const FIELDS = ['name', 'description', 'category', 'agent_name', 'associated_tech_skills', 'video_url', 'proof_of_concept_video', 'difficulty_level'];
    const out = {};
    for (const k of FIELDS) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
}

// GET /admin/edits?status=pending|approved|discarded|all
router.get('/admin/edits', requireAdmin, async (req, res) => {
    const { status = 'pending' } = req.query;
    try {
        const filter = status === 'all' ? '' : `status = "${status}"`;
        const list = await pb.collection('skill_edits').getList(1, 200, {
            filter,
            sort: '-created',
        });

        const items = await Promise.all(list.items.map(async edit => {
            const skill = await pb.collection('skills').getOne(edit.skill_id).catch(() => null);
            let user = null;
            try { user = await pb.collection('users').getOne(edit.user_id, { fields: 'id,name,username,email' }); } catch {}
            return {
                ...edit,
                current_skill: skill ? pickEditable({ ...skill, id: skill.id }) : null,
                skill_meta: skill ? { id: skill.id, agent_name: skill.agent_name, version: skill.version } : null,
                user_meta: user ? { name: user.name, username: user.username, email: user.email } : null,
            };
        }));

        res.json({ edits: items, total: list.totalItems });
    } catch (err) {
        logger.error('admin list edits error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /admin/edits/:id — hard-delete an edit record
router.delete('/admin/edits/:id', requireAdmin, async (req, res) => {
    try {
        await pb.collection('skill_edits').delete(req.params.id);
        logger.info(`admin ${req.adminUserId} deleted edit ${req.params.id}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin delete edit error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
