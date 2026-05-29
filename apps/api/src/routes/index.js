import { Router } from 'express';
import healthCheck from './health-check.js';
import recommendRouter from './recommend.js';
import embedRouter from './embed.js';
import roundtableRouter from './roundtable.js';
import trendingRouter from './trending.js';
import skillEditsRouter from './skill-edits.js';
import leaderboardRouter from './leaderboard.js';
import userKeysRouter from './user-keys.js';
import contactRouter from './contact.js';
import socialRouter from './social.js';

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
    router.use('/', skillEditsRouter);
    router.use('/', leaderboardRouter);
    router.use('/', userKeysRouter);
    router.use('/', contactRouter);
    router.use('/', socialRouter);

    return router;
};

