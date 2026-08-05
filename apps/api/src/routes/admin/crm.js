// Lightweight CRM over the partner/tool-space machinery. Four entities —
// accounts, contacts, leads, opportunities — all wired into the marketplace:
// an account links to a partner (its live feature subscriptions ARE the
// "tools in use"), leads carry the features they're interested in, and a won
// opportunity can subscribe the partner to the features it sold.

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

const ENTITY_FIELDS = {
    crm_accounts: [
        { type: 'text',     name: 'name',        required: true,  max: 200 },
        { type: 'text',     name: 'partner_id',  required: false, max: 60 },
        { type: 'text',     name: 'industry',    required: false, max: 120 },
        { type: 'text',     name: 'city',        required: false, max: 120 },
        { type: 'text',     name: 'website',     required: false, max: 300 },
        { type: 'text',     name: 'status',      required: false, max: 40 },  // active | dormant | churned
        { type: 'text',     name: 'notes',       required: false, max: 5000 },
        { type: 'autodate', name: 'created',     onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated',     onCreate: true, onUpdate: true },
    ],
    crm_contacts: [
        { type: 'text',     name: 'name',        required: true,  max: 200 },
        { type: 'text',     name: 'account_id',  required: false, max: 60 },
        { type: 'text',     name: 'role',        required: false, max: 120 },
        { type: 'text',     name: 'email',       required: false, max: 200 },
        { type: 'text',     name: 'phone',       required: false, max: 40 },
        { type: 'bool',     name: 'is_primary',  required: false },
        { type: 'text',     name: 'notes',       required: false, max: 3000 },
        { type: 'autodate', name: 'created',     onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated',     onCreate: true, onUpdate: true },
    ],
    crm_leads: [
        { type: 'text',     name: 'name',        required: true,  max: 200 },
        { type: 'text',     name: 'company',     required: false, max: 200 },
        { type: 'text',     name: 'source',      required: false, max: 80 },  // referral | event | whatsapp | website | other
        { type: 'text',     name: 'status',      required: false, max: 40 },  // new | contacted | qualified | converted | lost
        { type: 'json',     name: 'feature_ids', maxSize: 4000 },             // marketplace features they're interested in
        { type: 'text',     name: 'email',       required: false, max: 200 },
        { type: 'text',     name: 'phone',       required: false, max: 40 },
        { type: 'number',   name: 'est_value_inr', required: false, min: 0 },
        { type: 'text',     name: 'notes',       required: false, max: 5000 },
        { type: 'autodate', name: 'created',     onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated',     onCreate: true, onUpdate: true },
    ],
    crm_opportunities: [
        { type: 'text',     name: 'title',       required: true,  max: 200 },
        { type: 'text',     name: 'account_id',  required: false, max: 60 },
        { type: 'json',     name: 'feature_ids', maxSize: 4000 },             // which tools this deal sells
        { type: 'text',     name: 'stage',       required: false, max: 40 },  // qualification | proposal | negotiation | won | lost
        { type: 'number',   name: 'value_inr',   required: false, min: 0 },   // monthly
        { type: 'date',     name: 'close_date',  required: false },
        { type: 'text',     name: 'notes',       required: false, max: 5000 },
        { type: 'autodate', name: 'created',     onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated',     onCreate: true, onUpdate: true },
    ],
};

// Client-writable fields per entity (everything except system/auto fields).
const WRITABLE = Object.fromEntries(
    Object.entries(ENTITY_FIELDS).map(([col, fields]) => [
        col,
        new Set(fields.filter(f => f.type !== 'autodate').map(f => f.name)),
    ]),
);

let crmReady = false;
async function ensureCrmCollections() {
    if (crmReady) return;
    for (const [name, fields] of Object.entries(ENTITY_FIELDS)) {
        try {
            const existing = await pb.collections.getOne(name);
            const have = new Set((existing.fields || []).map(f => f.name));
            const missing = fields.filter(f => !have.has(f.name));
            if (missing.length > 0) {
                await pb.collections.update(name, { fields: [...(existing.fields || []), ...missing] });
                logger.info(`${name}: added fields [${missing.map(f => f.name).join(', ')}]`);
            }
        } catch (err) {
            if (err?.status !== 404) throw err;
            await pb.collections.create({ name, type: 'base', fields });
            logger.info(`created collection ${name}`);
        }
    }
    crmReady = true;
}

// Express 5 no longer supports regex-in-param — validate explicitly.
const VALID_ENTITIES = new Set(['accounts', 'contacts', 'leads', 'opportunities']);
function colOf(req, res) {
    const e = req.params.entity;
    if (!VALID_ENTITIES.has(e)) {
        res.status(404).json({ error: 'unknown crm entity' });
        return null;
    }
    return `crm_${e}`;
}

function pickWritable(col, body) {
    const out = {};
    for (const [k, v] of Object.entries(body || {})) {
        if (WRITABLE[col].has(k)) out[k] = v;
    }
    return out;
}

// One fetch for the whole page: all four entities + the partner roster and
// live subscriptions so the UI can render each account's tools in use.
router.get('/admin/crm', requireAdmin, async (req, res) => {
    try {
        await ensureCrmCollections();
        const [accounts, contacts, leads, opportunities, partners, subs] = await Promise.all([
            pb.collection('crm_accounts').getFullList({ sort: '-updated' }),
            pb.collection('crm_contacts').getFullList({ sort: '-updated' }),
            pb.collection('crm_leads').getFullList({ sort: '-updated' }),
            pb.collection('crm_opportunities').getFullList({ sort: '-updated' }),
            pb.collection('partners').getFullList({ sort: 'name', fields: 'id,name,status,credit_cap_usd' }).catch(() => []),
            pb.collection('feature_subscriptions').getFullList({ sort: '-created' }).catch(() => []),
        ]);
        res.json({ accounts, contacts, leads, opportunities, partners, subscriptions: subs });
    } catch (err) {
        logger.error('crm list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/crm/:entity', requireAdmin, async (req, res) => {
    try {
        await ensureCrmCollections();
        const col = colOf(req, res);
        if (!col) return;
        const item = await pb.collection(col).create(pickWritable(col, req.body));
        res.json({ item });
    } catch (err) {
        res.status(400).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
    }
});

router.patch('/admin/crm/:entity/:id', requireAdmin, async (req, res) => {
    try {
        await ensureCrmCollections();
        const col = colOf(req, res);
        if (!col) return;
        const item = await pb.collection(col).update(req.params.id, pickWritable(col, req.body));
        res.json({ item });
    } catch (err) {
        res.status(400).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
    }
});

router.delete('/admin/crm/:entity/:id', requireAdmin, async (req, res) => {
    try {
        await ensureCrmCollections();
        const col = colOf(req, res);
        if (!col) return;
        await pb.collection(col).delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Bootstrap: one account per partner that doesn't have one yet — the fastest
// way to a populated CRM, and the account arrives already wired to its
// partner's live subscriptions.
router.post('/admin/crm/accounts/sync-partners', requireAdmin, async (req, res) => {
    try {
        await ensureCrmCollections();
        const [partners, accounts] = await Promise.all([
            pb.collection('partners').getFullList({ fields: 'id,name,status' }),
            pb.collection('crm_accounts').getFullList({ fields: 'id,partner_id' }),
        ]);
        const linked = new Set(accounts.map(a => a.partner_id).filter(Boolean));
        let created = 0;
        for (const p of partners) {
            if (linked.has(p.id)) continue;
            await pb.collection('crm_accounts').create({
                name: p.name, partner_id: p.id,
                status: p.status === 'active' ? 'active' : 'dormant',
            });
            created++;
        }
        res.json({ created, total_partners: partners.length });
    } catch (err) {
        logger.error('crm sync-partners failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Convert a lead: create an account (+contact when the lead has a person
// name vs company) and optionally an opportunity carrying the lead's
// feature interest and estimated value.
router.post('/admin/crm/leads/:id/convert', requireAdmin, async (req, res) => {
    try {
        await ensureCrmCollections();
        const lead = await pb.collection('crm_leads').getOne(req.params.id);
        if (lead.status === 'converted') return res.status(400).json({ error: 'Lead is already converted.' });

        const account = await pb.collection('crm_accounts').create({
            name: lead.company || lead.name,
            status: 'active',
            notes: lead.notes || '',
        });
        if (lead.company && lead.name && lead.company !== lead.name) {
            await pb.collection('crm_contacts').create({
                name: lead.name, account_id: account.id, is_primary: true,
                email: lead.email || '', phone: lead.phone || '',
            });
        }
        let opportunity = null;
        if (req.body?.create_opportunity !== false) {
            opportunity = await pb.collection('crm_opportunities').create({
                title: `${account.name} — first subscription`,
                account_id: account.id,
                feature_ids: lead.feature_ids || [],
                stage: 'qualification',
                value_inr: lead.est_value_inr || 0,
            });
        }
        await pb.collection('crm_leads').update(lead.id, { status: 'converted' });
        res.json({ account, opportunity });
    } catch (err) {
        logger.error('crm lead convert failed:', err.message);
        res.status(400).json({ error: err.message });
    }
});

export default router;
