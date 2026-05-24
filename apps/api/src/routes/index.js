import { Router } from 'express';
import healthCheck from './health-check.js';

const router = Router();

export default () => {
    router.get('/health', healthCheck);

    return router;
};

