import { Router } from 'express';
import healthCheck from './health-check.js';
import recommendRouter from './recommend.js';
import embedRouter from './embed.js';
import roundtableRouter from './roundtable.js';
import trendingRouter from './trending.js';
import skillEditsRouter from './skill-edits.js';
import leaderboardRouter from './leaderboard.js';
import userKeysRouter from './user-keys.js';
import apiTokensRouter from './api-tokens.js';
import contactRouter from './contact.js';
import socialRouter from './social.js';
import notificationsRouter from './notifications.js';
import openaiModelsRouter from './openai-models.js';
import buildRouter from './build.js';
import mockupRouter from './mockup.js';
import creativeRouter from './creative.js';
import hostingerRouter from './hostinger.js';
import specRouter from './spec.js';

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
    router.use('/', apiTokensRouter);
    router.use('/', contactRouter);
    router.use('/', socialRouter);
    router.use('/', notificationsRouter);
    router.use('/', openaiModelsRouter);
    router.use('/', buildRouter);
    router.use('/', mockupRouter);
    router.use('/', creativeRouter);
    router.use('/', hostingerRouter);
    router.use('/', specRouter);

    return router;
};

