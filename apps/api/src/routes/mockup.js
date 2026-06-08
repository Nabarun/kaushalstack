import { Router } from 'express';
import { runCreativeAgent, MAYA_SKILL_ID } from '../builder/creative-registry.js';

// Backwards-compat wrapper. The frontend (RoundTablePage.jsx) calls
// POST /api/mockup directly with Maya's hard-coded behaviour. We keep the
// shape and just forward into the generic creative runtime under Maya's
// agent id. New work should call POST /api/creative with agent_id instead.

const router = Router({ strict: true });

router.post('/mockup', async (req, res) => {
    try {
        const result = await runCreativeAgent({
            agentId:         MAYA_SKILL_ID,
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
