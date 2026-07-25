// Sprint-board collections, created at runtime on first use — same
// self-repairing pattern as partner/collections.js, so a fresh deployment
// needs no manual PocketBase setup.
//
// A sprint team is an internal dev-agent squad attached to one customer
// project (TallyVisualizer, J4E, MRNMR, …). Its `team` JSON uses the exact
// member shape partners.team uses (id, agent_name, name, category,
// associated_tech_skills, why, description) so team members render with the
// same components as partner teams.

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

let ready = false;

const COLLECTIONS = [
    {
        name: 'sprint_teams',
        fields: [
            { type: 'text',   name: 'name',    required: true, max: 200 },
            { type: 'text',   name: 'slug',    required: true, max: 60 },
            { type: 'text',   name: 'project', max: 300 },
            { type: 'text',   name: 'mission', max: 1000 },
            { type: 'select', name: 'status',  maxSelect: 1, values: ['active', 'paused'] },
            { type: 'json',   name: 'team' },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    },
    {
        name: 'sprint_work_items',
        fields: [
            { type: 'text',   name: 'team_id', required: true },
            { type: 'text',   name: 'title',   required: true, max: 300 },
            { type: 'text',   name: 'detail',  max: 4000 },
            { type: 'select', name: 'type',    maxSelect: 1, values: ['feature', 'bug', 'test', 'infra', 'research', 'security'] },
            { type: 'select', name: 'status',  maxSelect: 1, values: ['backlog', 'planned', 'in_progress', 'review', 'done', 'blocked'] },
            { type: 'select', name: 'priority', maxSelect: 1, values: ['P0', 'P1', 'P2', 'P3'] },
            { type: 'text',   name: 'sprint',  max: 40 },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    },
    {
        // "CEO briefings" — each team's report up to the boss: what shipped,
        // what's planned, what they want to brainstorm. One row per briefing.
        name: 'sprint_reports',
        fields: [
            { type: 'text',   name: 'team_id', required: true },
            { type: 'text',   name: 'sprint',  max: 40 },
            { type: 'text',   name: 'summary', required: true, max: 8000 },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
    {
        // CEO ↔ team chat threads. audience is a sprint_teams id, or 'all'
        // for the stand-up thread where every team lead answers together.
        // agent_name labels assistant turns with who spoke (team name).
        name: 'sprint_chat_messages',
        fields: [
            { type: 'text',   name: 'audience', required: true, max: 40 },
            { type: 'select', name: 'role',     maxSelect: 1, values: ['user', 'assistant'] },
            { type: 'text',   name: 'agent_name', max: 120 },
            { type: 'text',   name: 'content',  required: true, max: 12000 },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
    {
        // One row per daily test-dashboard run. The per-project test suites
        // POST their result here; the sprint tab shows the latest run per
        // team so a red team is visible at a glance.
        name: 'sprint_test_runs',
        fields: [
            { type: 'text',   name: 'team_id', required: true },
            { type: 'select', name: 'status',  maxSelect: 1, values: ['pass', 'fail', 'partial'] },
            { type: 'number', name: 'total',   min: 0 },
            { type: 'number', name: 'passed',  min: 0 },
            { type: 'number', name: 'failed',  min: 0 },
            { type: 'text',   name: 'report_url', max: 500 },
            { type: 'text',   name: 'notes',   max: 2000 },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
];

export async function ensureSprintCollections() {
    if (ready) return;
    for (const def of COLLECTIONS) {
        let existing = null;
        try {
            existing = await pb.collections.getOne(def.name);
        } catch { /* not created yet */ }
        if (!existing) {
            try {
                await pb.send('/api/collections', {
                    method: 'POST',
                    body: { name: def.name, type: 'base', fields: def.fields },
                });
                logger.info(`sprint: created collection ${def.name}`);
            } catch (err) {
                logger.warn(`sprint: could not create collection ${def.name}: ${err.message}`);
            }
            continue;
        }
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = def.fields.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            try {
                await pb.collections.update(existing.id, {
                    fields: [...existing.fields, ...missing],
                });
                logger.info(`sprint: added fields [${missing.map(f => f.name).join(', ')}] to ${def.name}`);
            } catch (err) {
                logger.warn(`sprint: could not add fields to ${def.name}: ${err.message}`);
            }
        }
    }
    ready = true;
}
