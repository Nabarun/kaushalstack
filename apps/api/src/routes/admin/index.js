import { Router } from 'express';
import businessesRouter from './businesses.js';
import reportsRouter from './reports.js';
import businessSkillsRouter from './business-skills.js';
import editsRouter from './edits.js';
import partnerStatsRouter from './partner-stats.js';
import roundtableStatsRouter from './roundtable-stats.js';
import { ensureAdminCollections } from './collections.js';

ensureAdminCollections().catch(() => {});

const router = Router();
router.use(businessesRouter);
router.use(reportsRouter);
router.use(businessSkillsRouter);
router.use(editsRouter);
router.use(partnerStatsRouter);
router.use(roundtableStatsRouter);

export default router;
