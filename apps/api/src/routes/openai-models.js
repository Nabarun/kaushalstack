import { Router } from 'express';
import logger from '../utils/logger.js';
import { getTopModels, getChatModels } from '../openai-models/service.js';
import { SUPPORTED_PROVIDERS, listChatModels } from '../providers/index.js';
import { getUserBYOK } from './user-keys.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();

// ──────────────────────────────────────────────────────────────────
// New provider-aware route
// ──────────────────────────────────────────────────────────────────

// GET /provider-models?provider=openai|anthropic
// Auth required. Uses the user's stored BYOK key for that provider.
router.get('/provider-models', async (req, res) => {
    const provider = (req.query.provider || '').toString().trim();
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
        return res.status(400).json({ error: `provider must be one of: ${SUPPORTED_PROVIDERS.join(', ')}` });
    }
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const byok = await getUserBYOK(userId);
    if (!byok || byok.provider !== provider) {
        return res.status(400).json({ error: `No saved ${provider} key for this user.` });
    }

    try {
        const models = await listChatModels(provider, byok.key);
        res.json({ models, refreshed_at: new Date().toISOString(), source: provider });
    } catch (err) {
        logger.error(`provider-models ${provider} error:`, err.message);
        res.status(502).json({ error: err.message, models: [] });
    }
});

// ──────────────────────────────────────────────────────────────────
// Legacy OpenAI-only routes — kept so older clients keep working.
// Both use the server's OpenAI key, not the user's.
// ──────────────────────────────────────────────────────────────────

router.get('/openai-models', async (req, res) => {
    res.json(await getTopModels());
});

router.get('/openai-models/chat', async (req, res) => {
    res.json(await getChatModels());
});

export default router;
