import { Router } from 'express';
import { handle } from './creative-http.js';

const router = Router({ strict: true });

// Debug probe — writes one SSE event immediately and ends. Used to verify
// the response actually streams through the middleware/proxy chain.
router.get('/creative/stream-test', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: probe\ndata: {"ok":true,"ts":${Date.now()}}\n\n`);
    setTimeout(() => { res.write(`event: bye\ndata: {}\n\n`); res.end(); }, 500);
});

router.post('/creative', (req, res) => handle(req, res));
export default router;
