import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';
import { ensureBusinessesCollection, ensureReportsCollection } from './collections.js';
import { runGrowthReportForBusiness } from '../../services/growth-report.js';

const router = Router();

router.use('/admin/reports', requireAdmin);
router.use('/admin/businesses/:id/reports', requireAdmin);
router.use('/admin/businesses/:id/run', requireAdmin);
router.use('/admin/agents', requireAdmin);

router.get('/admin/businesses/:id/reports', async (req, res) => {
    if (!(await ensureReportsCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const list = await pb.collection('growth_reports').getList(1, 50, {
            filter: `business_id = "${req.params.id}"`,
            sort: '-created',
        });
        res.json({ items: list.items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/admin/reports/:id', async (req, res) => {
    if (!(await ensureReportsCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const rec = await pb.collection('growth_reports').getOne(req.params.id);
        res.json({ item: rec });
    } catch (err) {
        res.status(404).json({ error: 'not found' });
    }
});

// Manual trigger — kicks off scan + report for a business, returns the
// pending report record. The actual work continues async in the background.
router.post('/admin/businesses/:id/run', async (req, res) => {
    if (!(await ensureBusinessesCollection())) return res.status(500).json({ error: 'collection not ready' });
    if (!(await ensureReportsCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const business = await pb.collection('businesses').getOne(req.params.id);
        runGrowthReportForBusiness(business)
            .then(rec => {
                if (rec) {
                    pb.collection('businesses').update(business.id, { last_run_at: new Date().toISOString() }).catch(() => {});
                }
            })
            .catch(err => logger.error(`manual run failed for ${business.id}: ${err.message}`));
        res.json({ ok: true, queued: true });
    } catch (err) {
        res.status(404).json({ error: 'business not found' });
    }
});

// List available agents (skills) for the team picker.
router.get('/admin/agents', async (req, res) => {
    try {
        const list = await pb.collection('skills').getList(1, 200, {
            fields: 'id,name,agent_name,category,description',
            sort: 'category,name',
        });
        res.json({ items: list.items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
