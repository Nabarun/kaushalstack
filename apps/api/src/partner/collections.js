// Partner-portal collections, created at runtime on first use — same
// self-repairing pattern as roundtable.js's ensure* helpers, so a fresh
// deployment needs no manual PocketBase setup.

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

let ready = false;

const COLLECTIONS = [
    {
        name: 'partners',
        fields: [
            { type: 'text',   name: 'name',            required: true, max: 200 },
            { type: 'text',   name: 'owner_user_id',   required: true },
            { type: 'select', name: 'status',          maxSelect: 1, values: ['active', 'suspended'] },
            { type: 'number', name: 'monthly_budget_usd', min: 0 },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    },
    {
        name: 'partner_members',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'text',   name: 'user_id',    required: true },
            { type: 'select', name: 'role',       maxSelect: 1, values: ['owner', 'editor', 'viewer'] },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
    {
        // Assets are the requirements source agents read from. kind=link rows
        // carry url only; doc/media rows carry a file. `status` tracks the
        // ingestion pipeline (new → ingested/failed) for the RAG/Deep-Research
        // phase — writing it now means no migration later.
        name: 'partner_assets',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'select', name: 'kind',       maxSelect: 1, values: ['link', 'doc', 'media'] },
            { type: 'text',   name: 'title',      max: 300 },
            { type: 'text',   name: 'url',        max: 2000 },
            { type: 'text',   name: 'note',       max: 2000 },
            { type: 'file',   name: 'file',       maxSelect: 1, maxSize: 26214400 },
            { type: 'select', name: 'status',     maxSelect: 1, values: ['new', 'ingested', 'failed'] },
            { type: 'text',   name: 'added_by',   required: true },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
    {
        // One row per LLM call, written from the single choke point in
        // providers/index.js. partner_id/user_id/agent are best-effort
        // attribution (untagged calls land with context='untagged' so total
        // spend is still true). estimated=true when the provider didn't
        // return exact token usage and we fell back to a chars/4 estimate.
        name: 'usage_events',
        fields: [
            { type: 'text',   name: 'partner_id' },
            { type: 'text',   name: 'user_id' },
            { type: 'text',   name: 'agent',   max: 120 },
            { type: 'text',   name: 'context', max: 60 },
            { type: 'text',   name: 'provider', max: 30 },
            { type: 'text',   name: 'model',    max: 120 },
            { type: 'number', name: 'input_tokens',  min: 0 },
            { type: 'number', name: 'output_tokens', min: 0 },
            { type: 'number', name: 'cached_tokens', min: 0 },
            { type: 'number', name: 'cost_usd',      min: 0 },
            { type: 'bool',   name: 'estimated' },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
];

export async function ensurePartnerCollections() {
    if (ready) return;
    for (const def of COLLECTIONS) {
        try {
            await pb.collections.getOne(def.name);
        } catch {
            try {
                await pb.send('/api/collections', {
                    method: 'POST',
                    body: { name: def.name, type: 'base', fields: def.fields },
                });
                logger.info(`partner: created collection ${def.name}`);
            } catch (err) {
                logger.warn(`partner: could not create collection ${def.name}: ${err.message}`);
            }
        }
    }
    ready = true;
}
