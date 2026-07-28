// Self-learning core — shared by the admin route (manual "run now") and the
// nightly scheduler. The pass mines a partner's recent round-table transcripts
// for durable client-specific lessons and stores them as proposals; approval
// stays with the admin route, the scheduler only ever proposes.

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { chatComplete } from '../providers/index.js';
import { isNearDuplicate } from '../utils/lesson-dedupe.js';

const LEARN_PROVIDER = 'openai';
const LEARN_MODEL = 'gpt-4o-mini';
export const FEATURE_ID = 'self-learning';
const MAX_LESSONS_PER_RUN = 5;
const MAX_CHATS_PER_RUN = 8;
export const LEARNED_HEADER = '## Learned (self-learning)';

const esc = (s) => String(s || '').replace(/"/g, '\\"');

let ready = false;
export async function ensureLearningCollection() {
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

export function lessonRow(l) {
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

export function parseTeam(raw) {
    let team = raw;
    if (typeof team === 'string') { try { team = JSON.parse(team); } catch { return []; } }
    return Array.isArray(team) ? team : [];
}

// Chats aren't partner-tagged; membership is the partner boundary.
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

// One pass for one partner. Throws with .status for route-friendly errors.
export async function runLearningPass(partner, { addedBy = '' } = {}) {
    if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('OpenAI not configured on the server'), { status: 500 });
    await ensureLearningCollection();

    const team = parseTeam(partner.team);
    if (team.length === 0) throw Object.assign(new Error('partner has no agent team to learn for'), { status: 400 });
    const agentNames = new Set(team.map(m => m.agent_name).filter(Boolean));

    const userIds = await partnerUserIds(partner);
    if (userIds.length === 0) return { proposed: 0, chats_read: 0, suppressed_duplicates: 0, items: [], note: 'partner has no members yet' };

    const filter = userIds.map(id => `user_id = "${esc(id)}"`).join(' || ');
    const chats = await pb.collection('roundtable_chats').getList(1, MAX_CHATS_PER_RUN, {
        filter, sort: '-updated',
    }).then(r => r.items).catch(() => []);

    const excerpts = chats.map(c => transcriptExcerpt(c, agentNames)).filter(Boolean);
    if (excerpts.length === 0) {
        return { proposed: 0, chats_read: 0, suppressed_duplicates: 0, items: [], note: 'no round-table conversations involving this team yet — nothing to learn from' };
    }

    // Existing lessons (any status) suppress re-proposals: a dismissed lesson
    // stays dismissed instead of resurfacing every run.
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
        meter: { user_id: addedBy, partner_id: partner.id, agent: 'self-learning', context: 'self-learning' },
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
            added_by: addedBy,
        });
        created.push(lessonRow(row));
    }

    logger.info(`self-learning: ${partner.name} run over ${excerpts.length} chat(s) → ${created.length} proposal(s), ${skippedDupes} duplicate(s) suppressed`);
    return { proposed: created.length, chats_read: excerpts.length, suppressed_duplicates: skippedDupes, items: created };
}
