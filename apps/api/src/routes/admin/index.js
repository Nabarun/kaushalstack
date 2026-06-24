import { Router } from 'express';
import businessesRouter from './businesses.js';
import reportsRouter from './reports.js';
import { ensureAdminCollections } from './collections.js';

ensureAdminCollections().catch(() => {});

const router = Router();
router.use(businessesRouter);
router.use(reportsRouter);

export default router;
