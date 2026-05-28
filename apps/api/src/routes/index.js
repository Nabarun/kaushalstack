import { Router } from 'express';
import healthCheck from './health-check.js';
import recommendRouter from './recommend.js';
import embedRouter from './embed.js';
import roundtableRouter from './roundtable.js';
import trendingRouter from './trending.js';

const router = Router();

export default () => {
    router.get('/', (req, res) => {
        res.json({ ok: true, service: 'kaushalstack-api' });
    });

    router.get('/health', healthCheck);
    router.use('/', recommendRouter);
    router.use('/', embedRouter);
    router.use('/', roundtableRouter);
    router.use('/', trendingRouter);

    return router;
};

