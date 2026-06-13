import { Router } from 'express';
import { MAYA_SKILL_ID } from '../builder/creative-registry.js';
import { handle } from './creative-http.js';

// Backwards-compat wrapper for Maya. Both JSON and SSE modes — pass
// `?stream=1` (or Accept: text/event-stream) to get live progress.
const router = Router({ strict: true });
router.post('/mockup', (req, res) => handle(req, res, MAYA_SKILL_ID));
export default router;
