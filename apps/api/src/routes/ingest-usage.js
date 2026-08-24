// External usage ingestion: sibling apps (Saaransh at varanan.in, etc.) push
// their AI spend here so the admin AI Usage tab covers the whole portfolio.
// Shared-secret header; writes through the same recordUsage pipeline as the
// chatComplete choke point, so every admin view picks it up unchanged.
import { Router } from 'express';
import { recordUsage } from '../partner/usage.js';
import logger from '../utils/logger.js';

const router = Router();

router.post('/ingest/usage', async (req, res) => {
    const expected = process.env.USAGE_INGEST_KEY;
    if (!expected || req.headers['x-ingest-key'] !== expected) {
        return res.status(404).end(); // stay invisible without the key
    }
    const { provider, model, context, agent, input_tokens, output_tokens, cost_usd } = req.body || {};
    if (!provider || typeof cost_usd !== 'number' || !isFinite(cost_usd) || cost_usd < 0) {
        return res.status(400).json({ error: 'provider and a non-negative cost_usd are required' });
    }
    try {
        await recordUsage({
            provider: String(provider).slice(0, 40),
            model: String(model || 'external').slice(0, 80),
            usage: {
                input_tokens: Math.max(0, Math.round(Number(input_tokens) || 0)),
                output_tokens: Math.max(0, Math.round(Number(output_tokens) || 0)),
            },
            meter: {
                context: String(context || 'external').slice(0, 60),
                agent: String(agent || '').slice(0, 60),
            },
            costUSD: cost_usd,
        });
        res.json({ ok: true });
    } catch (err) {
        logger.warn(`ingest/usage failed: ${err.message}`);
        res.status(500).json({ error: 'ingest failed' });
    }
});

export default router;
