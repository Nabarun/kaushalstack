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
            { type: 'text',   name: 'website',         max: 300 },
            { type: 'number', name: 'monthly_budget_usd', min: 0 },
            // Hard lifetime credit: when > 0, roundtable/spec calls tagged
            // with this partner are rejected (402) once lifetime spend hits
            // the cap. 0/absent = uncapped. monthly_budget_usd only alerts;
            // this one blocks.
            { type: 'number', name: 'credit_cap_usd', min: 0 },
            { type: 'json',   name: 'team' },
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
    {
        // One row per provisioned partner portal environment (the per-partner
        // studio container on the VPS). admin_pass is NOT stored — it lives
        // only in the container's env; rotate by recreating the environment.
        name: 'partner_environments',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'text',   name: 'slug',       required: true, max: 40 },
            { type: 'text',   name: 'url',        max: 300 },
            { type: 'select', name: 'status',     maxSelect: 1, values: ['provisioning', 'running', 'failed', 'removed'] },
            { type: 'text',   name: 'portal_name', max: 120 },
            { type: 'text',   name: 'admin_user',  max: 60 },
            { type: 'text',   name: 'container_id', max: 80 },
            { type: 'text',   name: 'token_record_id', max: 40 },
            { type: 'text',   name: 'error',       max: 1000 },
            { type: 'text',   name: 'added_by' },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    },
    {
        // Per-partner social connections for the multi-tenant publish flow.
        // One row per (partner, provider). Tokens are AES-GCM encrypted with
        // KEY_ENCRYPTION_SECRET; Facebook page tokens live as an encrypted
        // JSON array in pages_encrypted.
        name: 'partner_social_accounts',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'select', name: 'provider',   maxSelect: 1, values: ['facebook', 'linkedin'] },
            { type: 'text',   name: 'account_id',   max: 120 },
            { type: 'text',   name: 'account_name', max: 200 },
            { type: 'text',   name: 'token_encrypted',  max: 5000 },
            { type: 'text',   name: 'pages_encrypted',  max: 20000 },
            { type: 'text',   name: 'expires_at', max: 40 },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    },
    {
        // Audit log of token top-ups: every time the owner receives a payment
        // and grants tokens, one row lands here and the partner's
        // credit_cap_usd is raised by amount_usd (tokens / 100). The cap is
        // still the single enforcement point — this log is the paper trail.
        name: 'partner_credit_grants',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'number', name: 'tokens',     required: true, min: 0 },
            { type: 'number', name: 'amount_usd', min: 0 },
            { type: 'text',   name: 'note',       max: 500 },
            { type: 'text',   name: 'added_by' },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
    {
        // One row per (partner, feature) marketplace subscription at a flat
        // monthly price. `paid_until` is the source of truth for access: a
        // subscription past its paid_until is treated as unpaid and the
        // feature is hidden from that partner's portal until Mark-paid
        // extends it. status=cancelled removes access regardless of dates.
        name: 'feature_subscriptions',
        fields: [
            { type: 'text',   name: 'partner_id', required: true },
            { type: 'text',   name: 'feature_id', required: true, max: 60 },
            { type: 'select', name: 'status',     maxSelect: 1, values: ['active', 'cancelled'] },
            { type: 'number', name: 'price_inr',  min: 0 },
            { type: 'date',   name: 'paid_until' },
            { type: 'date',   name: 'last_paid_at' },
            { type: 'text',   name: 'added_by' },
            { type: 'autodate', name: 'created', onCreate: true },
            { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
    },
    {
        // Manually-logged spend that never passes through providers/index.js
        // (e.g. VPS/hosting bills, a CLI tool run outside kaushalstack, ad
        // spend) — the user records it by hand so the partner's true total
        // cost isn't undercounted by LLM-only usage_events.
        name: 'partner_manual_charges',
        fields: [
            { type: 'text',   name: 'partner_id',  required: true },
            { type: 'text',   name: 'description', required: true, max: 500 },
            { type: 'number', name: 'amount_usd',  required: true, min: 0 },
            { type: 'text',   name: 'added_by',    required: true },
            { type: 'autodate', name: 'created', onCreate: true },
        ],
    },
];

export async function ensurePartnerCollections() {
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
                logger.info(`partner: created collection ${def.name}`);
            } catch (err) {
                logger.warn(`partner: could not create collection ${def.name}: ${err.message}`);
            }
            continue;
        }
        // Self-repair: add any fields the def has gained since the collection
        // was first created (e.g. partners.team added after initial deploy).
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = def.fields.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            try {
                await pb.collections.update(existing.id, {
                    fields: [...existing.fields, ...missing],
                });
                logger.info(`partner: added fields [${missing.map(f => f.name).join(', ')}] to ${def.name}`);
            } catch (err) {
                logger.warn(`partner: could not add fields to ${def.name}: ${err.message}`);
            }
        }
    }
    ready = true;
}
