// Self-Learning Agents — the marketplace feature behind the ₹2,000/month tile.
//
// The loop, honestly stated: a learning pass mines the partner's recent
// round-table transcripts for durable, client-specific lessons per agent
// ("the client rejected discount-led hooks", "budget ceiling is ₹40k",
// "always propose Marathi captions"). Lessons land as PROPOSALS the admin
// approves or dismisses. Approving writes the lesson into that agent's
// dossier (partners.team[].description) under a "Learned" section — and since
// round-table prompts are built from those dossiers, every future
// conversation actually behaves differently. Nothing is learned silently:
// the human approval step is the feature, not a limitation.

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { chatComplete } from '../../providers/index.js';
import { ensurePartnerCollections } from '../../partner/collections.js';
import { requireAdmin } from './auth.js';
import { effectiveStatus } from './marketplace.js';
import { isNearDuplicate } from '../../utils/lesson-dedupe.js';

const router = Router();
const esc = (s) => String(s || '').replace(/"/g, '\\"');

const LEARN_PROVIDER = 'openai';
const LEARN_MODEL = 'gpt-4o-mini';
const FEATURE_ID = 'self-learning';
const MAX_LESSONS_PER_RUN = 5;
const MAX_CHATS_PER_RUN = 8;
const LEARNED_HEADER = '## Learned (self-learning)';

let ready = false;
async function ensureLearningCollection() {
    if (ready) return;
    const def = {
        name: 'agent_learnings',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'text',   name: 'agent_name', required: true, max: 120 },
            { type: 'text',   name: 'lesson',     required: true, max: 1500 },
            { type: 'select', name: 'status',     maxSelect: 1, values: ['proposed', 'applied', 'dismissed'] },
            { type: 'select', name: 'source',     maxSelect: 1, values: ['roundtable', 'manual'] },
            { type: 'text',   name: 'source_ref', max: 40 },
            { type: 'text',   name: 'added_by' },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    };
    try {
        await pb.collections.getOne(def.name);
    } catch {
        try {
            await pb.send('/api/collections', { method: 'POST', body: { name: def.name, type: 'base', fields: def.fields } });
            logger.info('self-learning: created collection agent_learnings');
        } catch (err) {
            logger.warn(`self-learning: could not create collection: ${err.message}`);
        }
    }
    ready = true;
}

function lessonRow(l) {
    return {
        id: l.id,
        partner_id: l.partner_id,
        agent_name: l.agent_name,
        lesson: l.lesson,
        status: l.status || 'proposed',
        source: l.source || 'roundtable',
        source_ref: l.source_ref || '',
        created: l.created,
        updated: l.updated,
    };
}

async function requireActiveSubscription(partnerId) {
    const sub = await pb.collection('feature_subscriptions').getList(1, 1, {
        filter: `partner_id = "${esc(partnerId)}" && feature_id = "${FEATURE_ID}"`,
    }).then(r => r.items[0]).catch(() => null);
    if (!sub || effectiveStatus(sub) !== 'active') {
        throw Object.assign(new Error('partner has no active Self-Learning subscription'), { status: 402 });
    }
}

function parseTeam(raw) {
    let team = raw;
    if (typeof team === 'string') { try { team = JSON.parse(team); } catch { return []; } }
    return Array.isArray(team) ? team : [];
}

// Chats aren't partner-tagged; membership is the partner boundary. A chat
// belongs to the partner's learning corpus when its author is on the bench.
async function partnerUserIds(partner) {
    const ids = new Set([partner.owner_user_id].filter(Boolean));
    try {
        const members = await pb.collection('partner_members').getFullList({
            filter: `partner_id = "${esc(partner.id)}"`,
            fields: 'user_id',
        });
        for (const m of members) if (m.user_id) ids.add(m.user_id);
    } catch { /* none */ }
    return Array.from(ids);
}

function transcriptExcerpt(chat, agentNames) {
    const lines = [];
    const turns = Array.isArray(chat.turns) ? chat.turns.slice(-4) : [];
    for (const turn of turns) {
        if (turn?.query) lines.push(`CLIENT: ${String(turn.query).slice(0, 400)}`);
        for (const r of Array.isArray(turn?.responses) ? turn.responses : []) {
            const name = r?.agent_name || r?.name;
            if (!name || !agentNames.has(name)) continue;
            const text = String(r?.response || r?.text || '').slice(0, 350);
            if (text) lines.push(`${name}: ${text}`);
        }
    }
    return lines.join('\n');
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

// Run a learning pass over the partner's recent round-table transcripts.
router.post('/admin/marketplace/self-learning/:partnerId/run', requireAdmin, async (req, res) => {
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OpenAI not configured on the server' });
    try {
        await ensurePartnerCollections();
        await ensureLearningCollection();
        const partner = await pb.collection('partners').getOne(req.params.partnerId).catch(() => null);
        if (!partner) return res.status(404).json({ error: 'partner not found' });
        await requireActiveSubscription(partner.id);

        const team = parseTeam(partner.team);
        if (team.length === 0) return res.status(400).json({ error: 'partner has no agent team to learn for' });
        const agentNames = new Set(team.map(m => m.agent_name).filter(Boolean));

        const userIds = await partnerUserIds(partner);
        if (userIds.length === 0) return res.json({ proposed: 0, note: 'partner has no members yet' });

        const filter = userIds.map(id => `user_id = "${esc(id)}"`).join(' || ');
        const chats = await pb.collection('roundtable_chats').getList(1, MAX_CHATS_PER_RUN, {
            filter, sort: '-updated',
        }).then(r => r.items).catch(() => []);

        const excerpts = chats
            .map(c => transcriptExcerpt(c, agentNames))
            .filter(Boolean);
        if (excerpts.length === 0) {
            return res.json({ proposed: 0, note: 'no round-table conversations involving this team yet — nothing to learn from' });
        }

        // Existing lessons (any status) suppress re-proposals: a dismissed
        // lesson stays dismissed instead of resurfacing every run.
        const existing = await pb.collection('agent_learnings').getFullList({
            filter: `partner_id = "${esc(partner.id)}"`,
            fields: 'agent_name,lesson',
        }).catch(() => []);
        const known = existing.map(l => `- [${l.agent_name}] ${l.lesson}`).join('\n');

        const systemPrompt = [
            `You extract durable, client-specific lessons from a consulting team's conversation transcripts.`,
            `A lesson is worth keeping ONLY if it should change how that agent behaves in FUTURE conversations with THIS client: stated preferences, corrections the client made, constraints (budget, tone, language, audience), decisions taken.`,
            `Never propose generic best practices, one-off task details, or anything already covered by a known lesson.`,
            `Agents you may attribute lessons to: ${Array.from(agentNames).join(', ')}.`,
            known ? `Known lessons (do not repeat or rephrase):\n${known}` : '',
            `Respond as JSON: {"lessons":[{"agent_name":"...","lesson":"one sentence, concrete"}]} — at most ${MAX_LESSONS_PER_RUN}, and an empty array is the correct answer when nothing durable appeared.`,
        ].filter(Boolean).join('\n\n');

        const raw = await chatComplete(LEARN_PROVIDER, {
            key: process.env.OPENAI_API_KEY,
            model: LEARN_MODEL,
            systemPrompt,
            userPrompt: `Transcripts (most recent first):\n\n${excerpts.join('\n\n---\n\n').slice(0, 24000)}`,
            jsonMode: true,
            meter: { user_id: req.adminUserId || '', partner_id: partner.id, agent: 'self-learning', context: 'self-learning' },
        });

        let lessons = [];
        try { lessons = JSON.parse(raw)?.lessons || []; } catch { /* model returned junk — propose nothing */ }

        const byAgent = {};
        for (const e of existing) (byAgent[e.agent_name] ||= []).push(e.lesson);

        const created = [];
        let skippedDupes = 0;
        for (const l of lessons.slice(0, MAX_LESSONS_PER_RUN)) {
            const agentName = String(l?.agent_name || '').trim();
            const lesson = String(l?.lesson || '').trim().slice(0, 1500);
            if (!agentName || !lesson || !agentNames.has(agentName)) continue;
            if (isNearDuplicate(lesson, byAgent[agentName] || [])) { skippedDupes++; continue; }
            (byAgent[agentName] ||= []).push(lesson);
            const row = await pb.collection('agent_learnings').create({
                partner_id: partner.id,
                agent_name: agentName,
                lesson,
                status: 'proposed',
                source: 'roundtable',
                source_ref: chats[0]?.id || '',
                added_by: req.adminUserId || '',
            });
            created.push(lessonRow(row));
        }

        logger.info(`self-learning: ${partner.name} run over ${excerpts.length} chat(s) → ${created.length} proposal(s), ${skippedDupes} duplicate(s) suppressed`);
        res.json({ proposed: created.length, chats_read: excerpts.length, suppressed_duplicates: skippedDupes, items: created });
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
