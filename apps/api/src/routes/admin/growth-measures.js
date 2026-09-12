// Admin → Growth: the measures the agent survey surfaced, with obstacles and
// the agents who proposed each. Chat happens in the existing round table —
// the page hands it a team and a question; nothing new to run here.

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';
import { COLLECTION, WRITABLE, ensureGrowthMeasuresCollection, listMeasures } from '../../services/growth-measures.js';

const router = Router();

function pickWritable(body) {
    const out = {};
    for (const [k, v] of Object.entries(body || {})) if (WRITABLE.has(k)) out[k] = v;
    return out;
}

router.get('/admin/growth-measures', requireAdmin, async (req, res) => {
    try {
        res.json({ items: await listMeasures() });
    } catch (err) {
        logger.error('growth-measures list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/growth-measures', requireAdmin, async (req, res) => {
    try {
        await ensureGrowthMeasuresCollection();
        const data = pickWritable(req.body);
        if (!data.title) return res.status(400).json({ error: 'title is required' });
        data.key = String(req.body?.key || data.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        data.status = data.status || 'proposed';
        data.source = 'admin';
        res.json({ item: await pb.collection(COLLECTION).create(data) });
    } catch (err) {
        res.status(400).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
    }
});

router.patch('/admin/growth-measures/:id', requireAdmin, async (req, res) => {
    try {
        await ensureGrowthMeasuresCollection();
        res.json({ item: await pb.collection(COLLECTION).update(req.params.id, pickWritable(req.body)) });
    } catch (err) {
        res.status(400).json({ error: err.response?.data ? JSON.stringify(err.response.data) : err.message });
    }
});

router.delete('/admin/growth-measures/:id', requireAdmin, async (req, res) => {
    try {
        await ensureGrowthMeasuresCollection();
        await pb.collection(COLLECTION).delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
