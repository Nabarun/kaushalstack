// Self-Learning Agents — the marketplace feature behind the ₹2,000/month tile.
//
// The loop, honestly stated: a learning pass mines the partner's recent
// round-table transcripts for durable, client-specific lessons per agent.
// Lessons land as PROPOSALS the admin approves or dismisses. Approving writes
// the lesson into that agent's dossier (partners.team[].description) under a
// "Learned" section — and since round-table prompts are built from those
// dossiers, every future conversation actually behaves differently. Nothing is
// learned silently: proposals appear on their own (nightly scheduler in
// cron/self-learning-scheduler.js), but only approval changes behavior.
//
// Pass mechanics live in services/self-learning.js, shared with the scheduler.

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { ensurePartnerCollections } from '../../partner/collections.js';
import { requireAdmin } from './auth.js';
import { effectiveStatus } from './marketplace.js';
import {
    FEATURE_ID, LEARNED_HEADER, ensureLearningCollection, lessonRow,
    parseTeam, runLearningPass,
} from '../../services/self-learning.js';

const router = Router();
const esc = (s) => String(s || '').replace(/"/g, '\\"');

async function requireActiveSubscription(partnerId) {
    const sub = await pb.collection('feature_subscriptions').getList(1, 1, {
        filter: `partner_id = "${esc(partnerId)}" && feature_id = "${FEATURE_ID}"`,
    }).then(r => r.items[0]).catch(() => null);
    if (!sub || effectiveStatus(sub) !== 'active') {
        throw Object.assign(new Error('partner has no active Self-Learning subscription'), { status: 402 });
    }
}

// GET lessons for one partner, newest first, grouped client-side.
router.get('/admin/marketplace/self-learning/:partnerId', requireAdmin, async (req, res) => {
    try {
        await ensureLearningCollection();
        const rows = await pb.collection('agent_learnings').getFullList({
            filter: `partner_id = "${esc(req.params.partnerId)}"`,
            sort: '-created',
        }).catch(() => []);
        res.json({ items: rows.map(lessonRow) });
    } catch (err) {
        logger.error('self-learning list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Manual "run now" — the scheduler does this nightly; this is for when the
// admin wants proposals immediately after a big conversation.
router.post('/admin/marketplace/self-learning/:partnerId/run', requireAdmin, async (req, res) => {
    try {
        await ensurePartnerCollections();
        const partner = await pb.collection('partners').getOne(req.params.partnerId).catch(() => null);
        if (!partner) return res.status(404).json({ error: 'partner not found' });
        await requireActiveSubscription(partner.id);
        const result = await runLearningPass(partner, { addedBy: req.adminUserId || '' });
        res.json(result);
    } catch (err) {
        logger.error('self-learning run failed:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// Manual lesson — the admin noticed something on a call; same approval flow.
router.post('/admin/marketplace/self-learning/:partnerId/lessons', requireAdmin, async (req, res) => {
    const agentName = String(req.body?.agent_name || '').trim().slice(0, 120);
    const lesson = String(req.body?.lesson || '').trim().slice(0, 1500);
    if (!agentName || !lesson) return res.status(400).json({ error: 'agent_name and lesson are required' });
    try {
        await ensurePartnerCollections();
        await ensureLearningCollection();
        const partner = await pb.collection('partners').getOne(req.params.partnerId).catch(() => null);
        if (!partner) return res.status(404).json({ error: 'partner not found' });
        await requireActiveSubscription(partner.id);
        const team = parseTeam(partner.team);
        if (!team.some(m => m.agent_name === agentName)) {
            return res.status(400).json({ error: `no agent named "${agentName}" on this partner's team` });
        }
        const row = await pb.collection('agent_learnings').create({
            partner_id: partner.id,
            agent_name: agentName,
            lesson,
            status: 'proposed',
            source: 'manual',
            added_by: req.adminUserId || '',
        });
        res.json({ item: lessonRow(row) });
    } catch (err) {
        logger.error('self-learning manual lesson failed:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// Approve: the lesson becomes part of the agent's dossier, which is what the
// round-table prompt is built from — this is the moment the agent "learns".
router.post('/admin/marketplace/self-learning/lessons/:id/apply', requireAdmin, async (req, res) => {
    try {
        const l = await pb.collection('agent_learnings').getOne(req.params.id);
        if (l.status === 'applied') return res.json({ item: lessonRow(l) });
        const partner = await pb.collection('partners').getOne(l.partner_id);
        const team = parseTeam(partner.team);
        const member = team.find(m => m.agent_name === l.agent_name);
        if (!member) return res.status(400).json({ error: `agent "${l.agent_name}" is no longer on the team` });

        const desc = String(member.description || '');
        member.description = desc.includes(LEARNED_HEADER)
            ? `${desc}\n- ${l.lesson}`
            : `${desc}\n\n${LEARNED_HEADER}\n- ${l.lesson}`;

        await pb.collection('partners').update(partner.id, { team });
        const updated = await pb.collection('agent_learnings').update(l.id, { status: 'applied' });
        logger.info(`self-learning: applied lesson to ${partner.name}/${l.agent_name}`);
        res.json({ item: lessonRow(updated) });
    } catch (err) {
        logger.error('self-learning apply failed:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.post('/admin/marketplace/self-learning/lessons/:id/dismiss', requireAdmin, async (req, res) => {
    try {
        const updated = await pb.collection('agent_learnings').update(req.params.id, { status: 'dismissed' });
        res.json({ item: lessonRow(updated) });
    } catch (err) {
        logger.error('self-learning dismiss failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
