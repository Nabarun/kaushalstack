import { Router } from 'express';
import { runCreativeAgent } from '../builder/creative-registry.js';

// POST /api/creative — generic entry point for every tool-using creative
// agent (Ananya, Maya, Kavya, Tara, ...). The agent is picked by agent_id
// (the PocketBase skill id). All runtime logic — input validation, BYOK
// routing, design-brief ingestion, agent loop dispatch, response shape —
// lives in runCreativeAgent.

const router = Router({ strict: true });

router.post('/creative', async (req, res) => {
    try {
        const result = await runCreativeAgent({
            agentId:         req.body?.agent_id,
            rawQuery:        req.body?.query,
            rawContext:      req.body?.context,
            designSessionId: req.body?.design_session_id,
            authHeader:      req.headers.authorization,
        });
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({
            error:      err.message,
            session_id: err.sessionId,
        });
    }
});

export default router;
