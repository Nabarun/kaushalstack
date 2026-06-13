import { Router } from 'express';
import { handle } from './creative-http.js';

// POST /api/creative — generic entry point for every tool-using creative
// agent (Ananya, Maya, Kavya, Tara, ...). The agent is picked by agent_id
// (the PocketBase skill id). All runtime logic — input validation, BYOK
// routing, design-brief ingestion, agent loop dispatch, response shape —
// lives in runCreativeAgent. The JSON vs SSE switch lives in creative-http.

const router = Router({ strict: true });
router.post('/creative', (req, res) => handle(req, res));
export default router;
