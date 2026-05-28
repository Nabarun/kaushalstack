import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

const router = Router();

const APPROVAL_THRESHOLD  = 3;
const REJECTION_THRESHOLD = 6;
const AI_REVIEWER_ID      = 'ai-reviewer';

// Editable fields we accept in a proposed_data payload (mirror of AddSkillForm)
const EDITABLE_FIELDS = [
    'name', 'description', 'category', 'agent_name',
    'associated_tech_skills', 'video_url', 'proof_of_concept_video', 'difficulty_level',
];

function getUserIdFromHeader(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(authHeader.slice(7).split('.')[1], 'base64url').toString('utf8')
        );
        return payload.id || null;
    } catch {
        return null;
    }
}

async function getUser(userId) {
    try { return await pb.collection('users').getOne(userId); }
    catch { return null; }
}

function pickEditable(obj) {
    const out = {};
    for (const k of EDITABLE_FIELDS) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
}

async function mergeEdit(edit, skill) {
    // Snapshot current skill as a new version row
    const currentVersion = skill.version || 1;
    const currentData    = pickEditable(skill);
    await pb.collection('skill_versions').create({
        skill_id: skill.id,
        version_number: currentVersion,
        data: currentData,
        author: skill.created_by || '',
        approved_by: edit.approvals || [],
    });

    // Apply proposed data + bump version on the live row
    await pb.collection('skills').update(skill.id, {
        ...edit.proposed_data,
        version: currentVersion + 1,
    });

    // Mark edit as approved
    await pb.collection('skill_edits').update(edit.id, { status: 'approved' });
    logger.info(`edit ${edit.id} merged into skill ${skill.id} (now v${currentVersion + 1})`);
}

async function discardEdit(editId) {
    await pb.collection('skill_edits').update(editId, { status: 'discarded' });
    logger.info(`edit ${editId} discarded`);
}

// ── Routes ──────────────────────────────────────────────────────────────────

// POST /skills/:id/edits — propose an edit
router.post('/skills/:id/edits', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const skill = await pb.collection('skills').getOne(req.params.id).catch(() => null);
    if (!skill) return res.status(404).json({ error: 'skill not found' });

    const proposed = pickEditable(req.body || {});
    if (Object.keys(proposed).length === 0) {
        return res.status(400).json({ error: 'no editable fields in payload' });
    }

    try {
        const created = await pb.collection('skill_edits').create({
            user_id: userId,
            skill_id: skill.id,
            base_version: skill.version || 1,
            proposed_data: proposed,
            status: 'pending',
            approvals: [],
            rejections: [],
        });
        res.json({ edit: created });
    } catch (err) {
        logger.error('propose edit error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /edits — list pending edits (for the review queue)
router.get('/edits', async (req, res) => {
    const status = req.query.status || 'pending';
    try {
        const list = await pb.collection('skill_edits').getList(1, 100, {
            filter: `status = "${status}"`,
            sort: '-created',
        });

        // Hydrate with current skill data so the UI can diff
        const items = await Promise.all(list.items.map(async edit => {
            const skill = await pb.collection('skills').getOne(edit.skill_id).catch(() => null);
            return { ...edit, current_skill: skill ? pickEditable({ ...skill, id: skill.id }) : null, skill_meta: skill ? { id: skill.id, agent_name: skill.agent_name, version: skill.version } : null };
        }));
        res.json({ edits: items, total: list.totalItems });
    } catch (err) {
        logger.error('list edits error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

async function voteOnEdit(editId, voterId, type, voteKind /* 'approve' | 'reject' */, reason) {
    const edit = await pb.collection('skill_edits').getOne(editId).catch(() => null);
    if (!edit) return { status: 404, body: { error: 'edit not found' } };
    if (edit.status !== 'pending') return { status: 409, body: { error: `edit is already ${edit.status}` } };

    if (voterId === edit.user_id) return { status: 403, body: { error: 'authors cannot vote on their own edit' } };

    const approvals  = Array.isArray(edit.approvals)  ? edit.approvals  : [];
    const rejections = Array.isArray(edit.rejections) ? edit.rejections : [];

    if (approvals.some(v => v.voter_id === voterId) || rejections.some(v => v.voter_id === voterId)) {
        return { status: 409, body: { error: 'already voted on this edit' } };
    }

    const vote = { voter_id: voterId, type, at: new Date().toISOString(), ...(reason ? { reason } : {}) };

    if (voteKind === 'approve') {
        approvals.push(vote);
        if (approvals.length >= APPROVAL_THRESHOLD) {
            const skill = await pb.collection('skills').getOne(edit.skill_id);
            await mergeEdit({ ...edit, approvals }, skill);
            return { status: 200, body: { merged: true, approvals, rejections } };
        }
        await pb.collection('skill_edits').update(editId, { approvals });
        return { status: 200, body: { approvals, rejections, threshold: APPROVAL_THRESHOLD } };
    } else {
        rejections.push(vote);
        if (rejections.length >= REJECTION_THRESHOLD) {
            await pb.collection('skill_edits').update(editId, { rejections });
            await discardEdit(editId);
            return { status: 200, body: { discarded: true, approvals, rejections } };
        }
        await pb.collection('skill_edits').update(editId, { rejections });
        return { status: 200, body: { approvals, rejections, threshold: REJECTION_THRESHOLD } };
    }
}

// POST /edits/:id/approve
router.post('/edits/:id/approve', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const result = await voteOnEdit(req.params.id, userId, 'human', 'approve');
    res.status(result.status).json(result.body);
});

// POST /edits/:id/reject
router.post('/edits/:id/reject', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const result = await voteOnEdit(req.params.id, userId, 'human', 'reject');
    res.status(result.status).json(result.body);
});

// POST /edits/:id/ai-review — invoke AI reviewer
router.post('/edits/:id/ai-review', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const edit = await pb.collection('skill_edits').getOne(req.params.id).catch(() => null);
    if (!edit) return res.status(404).json({ error: 'edit not found' });
    if (edit.status !== 'pending') return res.status(409).json({ error: `edit is already ${edit.status}` });
    if (edit.ai_review) return res.status(409).json({ error: 'AI has already reviewed this edit' });

    const skill = await pb.collection('skills').getOne(edit.skill_id).catch(() => null);
    if (!skill) return res.status(404).json({ error: 'skill not found' });

    const current  = pickEditable(skill);
    const proposed = edit.proposed_data || {};

    const prompt = `You are reviewing a community-proposed edit to a skill record on a skills-sharing platform.

Current skill:
${JSON.stringify(current, null, 2)}

Proposed change (only changed fields):
${JSON.stringify(proposed, null, 2)}

Decide: does the proposed change IMPROVE the skill record on clarity and/or accuracy WITHOUT introducing harm, spam, vandalism, factual errors, or low-quality content?

Respond with ONLY valid JSON:
{"decision": "approve" | "reject", "reason": "<one short sentence>"}`;

    try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!r.ok) throw new Error(`openai ${r.status}`);
        const data = await r.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        const decision = parsed.decision === 'approve' ? 'approve' : 'reject';
        const reason   = (parsed.reason || '').slice(0, 300);

        // Stamp the ai_review field so it can't be re-run
        await pb.collection('skill_edits').update(edit.id, {
            ai_review: { decision, reason, at: new Date().toISOString() },
        });

        // Cast the vote
        const result = await voteOnEdit(edit.id, AI_REVIEWER_ID, 'ai', decision, reason);
        return res.status(result.status).json({ ai_review: { decision, reason }, ...result.body });
    } catch (err) {
        logger.error('ai-review error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /skills/:id/versions — list version snapshots (admin only)
router.get('/skills/:id/versions', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const u = await getUser(userId);
    if (!u?.is_admin) return res.status(403).json({ error: 'admin only' });

    try {
        const list = await pb.collection('skill_versions').getList(1, 100, {
            filter: `skill_id = "${req.params.id}"`,
            sort: '-version_number',
        });
        res.json({ versions: list.items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /skills/:id/rollback/:versionId — admin rollback
router.post('/skills/:id/rollback/:versionId', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const u = await getUser(userId);
    if (!u?.is_admin) return res.status(403).json({ error: 'admin only' });

    try {
        const skill   = await pb.collection('skills').getOne(req.params.id);
        const version = await pb.collection('skill_versions').getOne(req.params.versionId);
        if (version.skill_id !== skill.id) return res.status(400).json({ error: 'version belongs to a different skill' });

        // Snapshot the CURRENT state before overwriting (so rollback is itself reversible)
        await pb.collection('skill_versions').create({
            skill_id: skill.id,
            version_number: skill.version || 1,
            data: pickEditable(skill),
            author: 'rollback-snapshot',
            approved_by: [],
        });

        await pb.collection('skills').update(skill.id, {
            ...version.data,
            version: (skill.version || 1) + 1,
        });

        logger.info(`admin ${userId} rolled skill ${skill.id} back to version ${version.version_number}`);
        res.json({ ok: true, new_version: (skill.version || 1) + 1 });
    } catch (err) {
        logger.error('rollback error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /me/admin-status — used by frontend to decide whether to show admin UI
router.get('/me/admin-status', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.json({ is_admin: false });
    const u = await getUser(userId);
    res.json({ is_admin: !!u?.is_admin });
});

export default router;
