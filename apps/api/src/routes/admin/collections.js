import pb from '../../utils/pocketbaseClient.js';
import logger from '../../utils/logger.js';

let businessesReady = false;
let reportsReady = false;

const BUSINESS_FIELDS = [
    { type: 'text',     name: 'name',          required: true, max: 200 },
    { type: 'text',     name: 'website_url',   required: true, max: 500 },
    { type: 'text',     name: 'owner_id',      required: false, max: 60 },
    { type: 'text',     name: 'description',   required: false, max: 2000 },
    { type: 'json',     name: 'team',          maxSize: 50000 },
    { type: 'json',     name: 'competitors',   maxSize: 100000 },
    { type: 'number',   name: 'schedule_hour', required: false, min: 0, max: 23, onlyInt: true },
    { type: 'bool',     name: 'active',        required: false },
    { type: 'date',     name: 'last_run_at',   required: false },
    { type: 'number',   name: 'monthly_revenue', required: false, min: 0 },
    { type: 'autodate', name: 'created',       onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated',       onCreate: true, onUpdate: true },
];

const REPORT_FIELDS = [
    { type: 'text',     name: 'business_id',   required: true, max: 60 },
    { type: 'date',     name: 'run_date',      required: false },
    { type: 'json',     name: 'competitors',   maxSize: 100000 },
    { type: 'json',     name: 'findings',      maxSize: 300000 },
    { type: 'text',     name: 'summary',       required: false, max: 0 },
    { type: 'text',     name: 'recommendations', required: false, max: 0 },
    { type: 'text',     name: 'status',        required: false, max: 40 },
    { type: 'text',     name: 'error',         required: false, max: 2000 },
    { type: 'autodate', name: 'created',       onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated',       onCreate: true, onUpdate: true },
];

async function ensureCollection(name, fields) {
    try {
        const existing = await pb.collections.getOne(name);
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = fields.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            try {
                await pb.collections.update(name, {
                    fields: [...(existing.fields || []), ...missing],
                });
                logger.info(`${name}: added fields [${missing.map(f => f.name).join(', ')}]`);
            } catch (err) {
                logger.warn(`Could not update ${name} fields: ${err.message}`);
            }
        }
        return true;
    } catch {
        try {
            await pb.send('/api/collections', {
                method: 'POST',
                body: { name, type: 'base', fields },
            });
            logger.info(`${name} collection created`);
            return true;
        } catch (err) {
            logger.warn(`Could not create ${name} collection: ${err.message}`);
            return false;
        }
    }
}

export async function ensureBusinessesCollection() {
    if (businessesReady) return true;
    businessesReady = await ensureCollection('businesses', BUSINESS_FIELDS);
    return businessesReady;
}

export async function ensureReportsCollection() {
    if (reportsReady) return true;
    reportsReady = await ensureCollection('growth_reports', REPORT_FIELDS);
    return reportsReady;
}

export async function ensureAdminCollections() {
    await ensureBusinessesCollection();
    await ensureReportsCollection();
}
