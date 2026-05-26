import { Router } from 'express';
import healthCheck from './health-check.js';

const router = Router();

export default () => {
    router.get('/', (req, res) => {
        res.json({ ok: true, service: 'kaushalstack-api' });
    });

    router.get('/health', healthCheck);

    return router;
};

