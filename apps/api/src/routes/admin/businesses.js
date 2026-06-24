import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';
import { ensureBusinessesCollection } from './collections.js';
import { syncCompetitorSkills, listCompetitorTeam } from '../../services/competitor-skills.js';

const router = Router();

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

router.use('/admin/businesses', requireAdmin);

router.get('/admin/businesses', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const list = await pb.collection('businesses').getList(1, 100, { sort: '-created' });
        res.json({ items: list.items });
    } catch (err) {
        logger.error('admin businesses list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/admin/businesses/:id', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const record = await pb.collection('businesses').getOne(req.params.id);
        res.json({ item: record });
    } catch (err) {
        res.status(404).json({ error: 'not found' });
    }
});

router.post('/admin/businesses', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    const { name, website_url, description } = req.body || {};
    if (!name || !website_url) return res.status(400).json({ error: 'name and website_url required' });
    try {
        const data = {
            name: String(name).slice(0, 200),
            website_url: String(website_url).slice(0, 500),
            description: String(description || '').slice(0, 2000),
            owner_id: req.adminUserId,
            team: normalizeTeam(req.body?.team),
            competitors: normalizeCompetitors(req.body?.competitors),
            schedule_hour: normalizeHour(req.body?.schedule_hour),
            active: req.body?.active !== false,
        };
        const record = await pb.collection('businesses').create(data);
        syncCompetitorSkills(record).catch(err => logger.warn(`competitor sync (create) failed: ${err.message}`));
        res.json({ item: record });
    } catch (err) {
        logger.error('admin businesses create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/admin/businesses/:id', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    const patch = {};
    if (typeof req.body?.name === 'string')         patch.name = req.body.name.slice(0, 200);
    if (typeof req.body?.website_url === 'string')  patch.website_url = req.body.website_url.slice(0, 500);
    if (typeof req.body?.description === 'string')  patch.description = req.body.description.slice(0, 2000);
    if (Array.isArray(req.body?.team))              patch.team = normalizeTeam(req.body.team);
    if (Array.isArray(req.body?.competitors))       patch.competitors = normalizeCompetitors(req.body.competitors);
    if (req.body?.schedule_hour !== undefined)      patch.schedule_hour = normalizeHour(req.body.schedule_hour);
    if (typeof req.body?.active === 'boolean')      patch.active = req.body.active;
    try {
        const record = await pb.collection('businesses').update(req.params.id, patch);
        if (Array.isArray(req.body?.competitors)) {
            syncCompetitorSkills(record).catch(err => logger.warn(`competitor sync (update) failed: ${err.message}`));
        }
        res.json({ item: record });
    } catch (err) {
        logger.error('admin businesses update failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/admin/businesses/:id/team', async (req, res) => {
    try {
        const team = await listCompetitorTeam(req.params.id);
        res.json({ items: team });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/businesses/:id', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        await pb.collection('businesses').delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
