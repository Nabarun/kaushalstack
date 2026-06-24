import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../utils/auth.js';
import { ensureBusinessesCollection, ensureReportsCollection } from './admin/collections.js';
import { runGrowthReportForBusiness } from '../services/growth-report.js';
import { syncCompetitorSkills, listCompetitorTeam } from '../services/competitor-skills.js';

const router = Router();

async function requireUser(req, res, next) {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    req.userId = userId;
    next();
}

router.use('/me/businesses', requireUser);
router.use('/me/reports', requireUser);
router.use('/me/agents', requireUser);

function normalizeCompetitors(input) {
    if (!Array.isArray(input)) return [];
    return input
        .map(c => ({
            name: String(c?.name || '').trim().slice(0, 200),
            website: String(c?.website || '').trim().slice(0, 500),
            handles: String(c?.handles || '').trim().slice(0, 500),
            focus: String(c?.focus || '').trim().slice(0, 2000),
        }))
        .filter(c => c.name && c.website);
}

function normalizeTeam(input) {
    if (!Array.isArray(input)) return [];
    return input
        .map(t => (typeof t === 'string' ? { id: t } : t))
        .filter(t => t && typeof t.id === 'string')
        .map(t => ({
            id: t.id,
            agent_name: t.agent_name || '',
            name: t.name || '',
            category: t.category || '',
        }));
}

function normalizeHour(input) {
    const n = Number(input);
    if (!Number.isFinite(n)) return 6;
    return Math.min(23, Math.max(0, Math.floor(n)));
}

function normalizeRevenue(input) {
    if (input === '' || input === null || input === undefined) return 0;
    const n = Number(input);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

async function loadOwnedBusiness(userId, id) {
    const rec = await pb.collection('businesses').getOne(id);
    if (rec.owner_id !== userId) {
        const err = new Error('forbidden');
        err.status = 403;
        throw err;
    }
    return rec;
}

router.get('/me/businesses', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const list = await pb.collection('businesses').getList(1, 100, {
            filter: `owner_id = "${req.userId}"`,
            sort: '-created',
        });
        res.json({ items: list.items });
    } catch (err) {
        logger.error('me businesses list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/me/businesses/:id', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const record = await loadOwnedBusiness(req.userId, req.params.id);
        res.json({ item: record });
    } catch (err) {
        res.status(err.status || 404).json({ error: err.message || 'not found' });
    }
});

router.post('/me/businesses', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    const { name, website_url, description } = req.body || {};
    if (!name || !website_url) return res.status(400).json({ error: 'name and website_url required' });
    try {
        const data = {
            name: String(name).slice(0, 200),
            website_url: String(website_url).slice(0, 500),
            description: String(description || '').slice(0, 2000),
            owner_id: req.userId,
            team: normalizeTeam(req.body?.team),
            competitors: normalizeCompetitors(req.body?.competitors),
            schedule_hour: normalizeHour(req.body?.schedule_hour),
            active: req.body?.active !== false,
            monthly_revenue: normalizeRevenue(req.body?.monthly_revenue),
        };
        const record = await pb.collection('businesses').create(data);
        syncCompetitorSkills(record).catch(err => logger.warn(`competitor sync (create) failed: ${err.message}`));
        res.json({ item: record });
    } catch (err) {
        logger.error('me businesses create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/me/businesses/:id', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        await loadOwnedBusiness(req.userId, req.params.id);
    } catch (err) {
        return res.status(err.status || 404).json({ error: err.message });
    }
    const patch = {};
    if (typeof req.body?.name === 'string')         patch.name = req.body.name.slice(0, 200);
    if (typeof req.body?.website_url === 'string')  patch.website_url = req.body.website_url.slice(0, 500);
    if (typeof req.body?.description === 'string')  patch.description = req.body.description.slice(0, 2000);
    if (Array.isArray(req.body?.team))              patch.team = normalizeTeam(req.body.team);
    if (Array.isArray(req.body?.competitors))       patch.competitors = normalizeCompetitors(req.body.competitors);
    if (req.body?.schedule_hour !== undefined)      patch.schedule_hour = normalizeHour(req.body.schedule_hour);
    if (typeof req.body?.active === 'boolean')      patch.active = req.body.active;
    if (req.body?.monthly_revenue !== undefined)    patch.monthly_revenue = normalizeRevenue(req.body.monthly_revenue);
    try {
        const record = await pb.collection('businesses').update(req.params.id, patch);
        if (Array.isArray(req.body?.competitors)) {
            syncCompetitorSkills(record).catch(err => logger.warn(`competitor sync (update) failed: ${err.message}`));
        }
        res.json({ item: record });
    } catch (err) {
        logger.error('me businesses update failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/me/businesses/:id/team', async (req, res) => {
    try {
        await loadOwnedBusiness(req.userId, req.params.id);
        const team = await listCompetitorTeam(req.params.id);
        res.json({ items: team });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.delete('/me/businesses/:id', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        await loadOwnedBusiness(req.userId, req.params.id);
        await pb.collection('businesses').delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.get('/me/businesses/:id/reports', async (req, res) => {
    if (!(await ensureReportsCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        await loadOwnedBusiness(req.userId, req.params.id);
        const list = await pb.collection('growth_reports').getList(1, 50, {
            filter: `business_id = "${req.params.id}"`,
            sort: '-created',
        });
        res.json({ items: list.items });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.get('/me/reports/:id', async (req, res) => {
    if (!(await ensureReportsCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const rec = await pb.collection('growth_reports').getOne(req.params.id);
        if (rec.business_id) {
            try {
                await loadOwnedBusiness(req.userId, rec.business_id);
            } catch (err) {
                return res.status(403).json({ error: 'forbidden' });
            }
        }
        res.json({ item: rec });
    } catch (err) {
        res.status(404).json({ error: 'not found' });
    }
});

router.post('/me/businesses/:id/run', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    if (!(await ensureReportsCollection())) return res.status(500).json({ error: 'collection not ready' });
    let business;
    try {
        business = await loadOwnedBusiness(req.userId, req.params.id);
    } catch (err) {
        return res.status(err.status || 404).json({ error: err.message });
    }
    runGrowthReportForBusiness(business)
        .then(rec => {
            if (rec) {
                pb.collection('businesses').update(business.id, { last_run_at: new Date().toISOString() }).catch(() => {});
            }
        })
        .catch(err => logger.error(`me run failed for ${business.id}: ${err.message}`));
    res.json({ ok: true, queued: true });
});

router.get('/me/agents', async (req, res) => {
    try {
        const list = await pb.collection('skills').getList(1, 200, {
            fields: 'id,name,agent_name,category,description',
            filter: 'private != true',
            sort: 'category,name',
        });
        res.json({ items: list.items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
