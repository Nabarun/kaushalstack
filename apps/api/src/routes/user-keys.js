import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { encrypt, safeDecrypt } from '../utils/crypto.js';
import { SUPPORTED_PROVIDERS, getProviderMeta, validateKey } from '../providers/index.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();

const VALID_STAGES = ['roundtable', 'spec', 'design', 'build'];

function parseStageModels(raw) {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

function shapeStatus(user) {
    return {
        provider: user.provider || null,
        has_key: !!user.byok_key_encrypted,
        last4: user.byok_key_last4 || null,
        model: user.preferred_model || null,
        stage_models: parseStageModels(user.preferred_models),
    };
}

// ──────────────────────────────────────────────────────────────────
// New provider-aware endpoints
// ──────────────────────────────────────────────────────────────────

// GET /me/provider — current provider + key/model status
router.get('/me/provider', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        const user = await pb.collection('users').getOne(userId);
        res.json(shapeStatus(user));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /me/provider — switch provider. Does NOT clear the key, but the caller
// is expected to follow up with /me/byok-key since keys are provider-specific.
router.put('/me/provider', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const provider = (req.body?.provider || '').trim();
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
        return res.status(400).json({ error: `provider must be one of: ${SUPPORTED_PROVIDERS.join(', ')}` });
    }
    try {
        await pb.collection('users').update(userId, { provider });
        res.json({ ok: true, provider });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /me/byok-key — save key for the user's current provider (or provider passed in body)
router.put('/me/byok-key', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const raw = (req.body?.key || '').trim();
    const providerOverride = (req.body?.provider || '').trim();
    if (!raw) return res.status(400).json({ error: 'key is required' });

    try {
        const user = await pb.collection('users').getOne(userId);
        const provider = providerOverride || user.provider || 'openai';
        if (!SUPPORTED_PROVIDERS.includes(provider)) {
            return res.status(400).json({ error: `provider must be one of: ${SUPPORTED_PROVIDERS.join(', ')}` });
        }
        const meta = getProviderMeta(provider);
        if (meta.keyPattern && !meta.keyPattern.test(raw)) {
            return res.status(400).json({ error: `That doesn't look like a ${meta.label} key. ${meta.keyHint}.` });
        }
        const v = await validateKey(provider, raw);
        if (!v.ok) return res.status(400).json({ error: v.reason });

        await pb.collection('users').update(userId, {
            provider,
            byok_key_encrypted: encrypt(raw),
            byok_key_last4: raw.slice(-4),
        });
        logger.info(`byok saved for user ${userId} (provider=${provider}, last4=${raw.slice(-4)})`);
        const fresh = await pb.collection('users').getOne(userId);
        res.json({ ok: true, ...shapeStatus(fresh) });
    } catch (err) {
        logger.error('byok save error:', err.message);
        res.status(500).json({ error: 'Failed to save key' });
    }
});

// DELETE /me/byok-key
router.delete('/me/byok-key', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        await pb.collection('users').update(userId, {
            byok_key_encrypted: '',
            byok_key_last4: '',
        });
        res.json({ ok: true, has_key: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /me/byok-model
router.put('/me/byok-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const model = (req.body?.model || '').trim();
    if (!model) return res.status(400).json({ error: 'model is required' });
    if (model.length > 100) return res.status(400).json({ error: 'model id too long' });
    try {
        await pb.collection('users').update(userId, { preferred_model: model });
        res.json({ ok: true, model });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/me/byok-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        await pb.collection('users').update(userId, { preferred_model: '' });
        res.json({ ok: true, model: null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /me/stage-model — set model for a specific pipeline stage
router.put('/me/stage-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const stage = (req.body?.stage || '').trim();
    const model = (req.body?.model || '').trim();
    if (!VALID_STAGES.includes(stage)) {
        return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` });
    }
    if (!model) return res.status(400).json({ error: 'model is required' });
    if (model.length > 100) return res.status(400).json({ error: 'model id too long' });
    try {
        const user = await pb.collection('users').getOne(userId);
        const current = parseStageModels(user.preferred_models);
        current[stage] = model;
        await pb.collection('users').update(userId, { preferred_models: JSON.stringify(current) });
        res.json({ ok: true, stage, model });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /me/stage-model?stage=xxx — clear model for a specific stage
router.delete('/me/stage-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const stage = (req.query?.stage || '').trim();
    if (!VALID_STAGES.includes(stage)) {
        return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` });
    }
    try {
        const user = await pb.collection('users').getOne(userId);
        const current = parseStageModels(user.preferred_models);
        delete current[stage];
        await pb.collection('users').update(userId, { preferred_models: JSON.stringify(current) });
        res.json({ ok: true, stage, model: null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────
// Legacy aliases — keep the old OpenAI-only endpoints working so any
// cached/old client doesn't 404. New code should use /me/byok-*.
// ──────────────────────────────────────────────────────────────────

router.get('/me/openai-key', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        const user = await pb.collection('users').getOne(userId);
        res.json({
            has_key: !!user.byok_key_encrypted,
            last4: user.byok_key_last4 || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/me/openai-key', async (req, res) => {
    // Forward to the new endpoint with provider='openai' implied.
    req.body = { ...(req.body || {}), provider: 'openai' };
    req.method = 'PUT';
    // Re-dispatch by calling the handler directly. Simpler: duplicate the minimum logic.
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const raw = (req.body?.key || '').trim();
    if (!raw) return res.status(400).json({ error: 'key is required' });
    try {
        const meta = getProviderMeta('openai');
        if (!meta.keyPattern.test(raw)) {
            return res.status(400).json({ error: `That doesn't look like an OpenAI key. ${meta.keyHint}.` });
        }
        const v = await validateKey('openai', raw);
        if (!v.ok) return res.status(400).json({ error: v.reason });
        await pb.collection('users').update(userId, {
            provider: 'openai',
            byok_key_encrypted: encrypt(raw),
            byok_key_last4: raw.slice(-4),
        });
        res.json({ ok: true, has_key: true, last4: raw.slice(-4) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save key' });
    }
});

router.delete('/me/openai-key', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        await pb.collection('users').update(userId, {
            byok_key_encrypted: '',
            byok_key_last4: '',
        });
        res.json({ ok: true, has_key: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/me/openai-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        const user = await pb.collection('users').getOne(userId);
        res.json({ model: user.preferred_model || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/me/openai-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const model = (req.body?.model || '').trim();
    if (!model) return res.status(400).json({ error: 'model is required' });
    try {
        await pb.collection('users').update(userId, { preferred_model: model });
        res.json({ ok: true, model });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/me/openai-model', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        await pb.collection('users').update(userId, { preferred_model: '' });
        res.json({ ok: true, model: null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────
// Helpers consumed by other routes (round table, etc.)
// ──────────────────────────────────────────────────────────────────

// Returns { provider, key, model } or null if the user has no usable BYOK config.
export async function getUserBYOK(userId) {
    if (!userId) return null;
    try {
        const user = await pb.collection('users').getOne(userId);
        if (!user.byok_key_encrypted) return null;
        const key = safeDecrypt(user.byok_key_encrypted);
        if (!key) return null;
        return {
            provider: user.provider || 'openai',
            key,
            model: user.preferred_model || null,
            models: parseStageModels(user.preferred_models),
        };
    } catch {
        return null;
    }
}

// Legacy helper — kept so any caller still expecting just the OpenAI key works.
export async function getUserOpenAIKey(userId) {
    const byok = await getUserBYOK(userId);
    if (!byok || byok.provider !== 'openai') return null;
    return byok.key;
}

export async function getUserPreferredModel(userId) {
    if (!userId) return null;
    try {
        const user = await pb.collection('users').getOne(userId);
        return user.preferred_model || null;
    } catch {
        return null;
    }
}

export default router;
