// Growth measures: what the agent survey said would sell KaushalStack more,
// held as records the admin can work — status, obstacles, the agents who
// proposed each one — and open a round table with. The collection is
// self-creating, same pattern as the CRM.

import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

export const COLLECTION = 'growth_measures';

const FIELDS = [
    { type: 'text',     name: 'key',         required: true,  max: 60 },   // stable slug, upsert target
    { type: 'text',     name: 'title',       required: true,  max: 200 },
    { type: 'text',     name: 'summary',     required: false, max: 2000 },
    { type: 'text',     name: 'rationale',   required: false, max: 2000 },
    { type: 'json',     name: 'obstacles',   maxSize: 20000 },              // [{ text, severity }]
    { type: 'json',     name: 'agent_ids',   maxSize: 4000 },               // skill ids who proposed it
    { type: 'json',     name: 'suggestions', maxSize: 40000 },              // [{ agent, one_thing, why }]
    { type: 'number',   name: 'priority',    required: false, min: 0 },     // agents behind it
    { type: 'text',     name: 'status',      required: false, max: 40 },    // proposed | in_progress | done | parked
    { type: 'text',     name: 'notes',       required: false, max: 5000 },
    { type: 'text',     name: 'source',      required: false, max: 120 },
    { type: 'text',     name: 'chat_id',     required: false, max: 60 },    // round-table chat, once one exists
    { type: 'autodate', name: 'created',     onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated',     onCreate: true, onUpdate: true },
];

export const WRITABLE = new Set(['title', 'summary', 'rationale', 'obstacles', 'agent_ids', 'status', 'notes', 'chat_id', 'priority']);

let ready = false;
export async function ensureGrowthMeasuresCollection() {
    if (ready) return;
    try {
        const existing = await pb.collections.getOne(COLLECTION);
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = FIELDS.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            await pb.collections.update(COLLECTION, { fields: [...(existing.fields || []), ...missing] });
            logger.info(`${COLLECTION}: added fields [${missing.map(f => f.name).join(', ')}]`);
        }
    } catch (err) {
        if (err?.status !== 404) throw err;
        await pb.collections.create({ name: COLLECTION, type: 'base', fields: FIELDS });
        logger.info(`created collection ${COLLECTION}`);
    }
    ready = true;
}

// One record per distinct agent name, richest persona wins — the same
// de-duplication the survey used, so names resolve to the id that ran.
export async function skillIndexByName() {
    const skills = await pb.collection('skills').getFullList({
        fields: 'id,name,agent_name,category,description,associated_tech_skills,private',
    });
    const byName = new Map();
    for (const s of skills) {
        const key = (s.agent_name || s.name || s.id).trim();
        const cur = byName.get(key);
        if (!cur || (s.description || '').length > (cur.description || '').length) byName.set(key, s);
    }
    return byName;
}

// Measures with their agents expanded to the full skill objects the
// round-table route expects (it trusts the team it is handed).
export async function listMeasures() {
    await ensureGrowthMeasuresCollection();
    const [items, skills] = await Promise.all([
        pb.collection(COLLECTION).getFullList({ sort: '-priority,title' }),
        pb.collection('skills').getFullList({ fields: 'id,name,agent_name,category,description,associated_tech_skills,private' }),
    ]);
    const byId = new Map(skills.map(s => [s.id, s]));
    return items.map(m => ({
        ...m,
        agents: (Array.isArray(m.agent_ids) ? m.agent_ids : []).map(id => byId.get(id)).filter(Boolean),
    }));
}

// Upsert by key. Agent names in the seed resolve to skill ids here, so the
// seed file stays readable and survives ids changing on re-import.
export async function seedGrowthMeasures(measures) {
    await ensureGrowthMeasuresCollection();
    const byName = await skillIndexByName();
    const out = [];
    for (const m of measures) {
        const agent_ids = (m.agents || []).map(n => byName.get(n)?.id).filter(Boolean);
        const unresolved = (m.agents || []).filter(n => !byName.get(n));
        const data = {
            key: m.key, title: m.title, summary: m.summary || '', rationale: m.rationale || '',
            obstacles: m.obstacles || [], agent_ids, suggestions: m.suggestions || [],
            priority: typeof m.priority === 'number' ? m.priority : agent_ids.length,
            status: m.status || 'proposed', source: m.source || '',
        };
        const existing = await pb.collection(COLLECTION).getFirstListItem(`key = "${m.key.replace(/"/g, '')}"`).catch(() => null);
        const rec = existing
            ? await pb.collection(COLLECTION).update(existing.id, data)
            : await pb.collection(COLLECTION).create(data);
        out.push({ key: m.key, id: rec.id, agents: agent_ids.length, unresolved, action: existing ? 'updated' : 'created' });
    }
    return out;
}
