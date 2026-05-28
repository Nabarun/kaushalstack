import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { encrypt, safeDecrypt } from '../utils/crypto.js';

const router = Router();

const OPENAI_KEY_RE = /^sk-(?:proj-)?[A-Za-z0-9_\-]{20,}$/;

function getUserIdFromHeader(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(authHeader.slice(7).split('.')[1], 'base64url').toString('utf8')
        );
        return payload.id || null;
    } catch {
        return null;
    }
}

async function validateOpenAIKey(key) {
    try {
        const r = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
        });
        if (r.status === 200) return { ok: true };
        if (r.status === 401) return { ok: false, reason: 'Key was rejected by OpenAI (unauthorized).' };
        if (r.status === 429) return { ok: false, reason: 'OpenAI returned 429 — key may be out of quota or rate-limited.' };
        return { ok: false, reason: `OpenAI returned status ${r.status}` };
    } catch (err) {
        return { ok: false, reason: `Could not reach OpenAI: ${err.message}` };
    }
}

// GET /me/openai-key — status only, never returns plaintext
router.get('/me/openai-key', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const user = await pb.collection('users').getOne(userId);
        res.json({
            has_key: !!user.openai_key_encrypted,
            last4:   user.openai_key_last4 || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /me/openai-key — save/update
router.post('/me/openai-key', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const raw = (req.body?.key || '').trim();
    if (!raw)                       return res.status(400).json({ error: 'key is required' });
    if (!OPENAI_KEY_RE.test(raw))   return res.status(400).json({ error: 'That does not look like an OpenAI API key (must start with sk- or sk-proj-).' });

    // Verify the key actually works before storing
    const v = await validateOpenAIKey(raw);
    if (!v.ok) return res.status(400).json({ error: v.reason });

    try {
        const ciphertext = encrypt(raw);
        const last4      = raw.slice(-4);

        await pb.collection('users').update(userId, {
            openai_key_encrypted: ciphertext,
            openai_key_last4: last4,
        });

        logger.info(`openai key saved for user ${userId} (last4 ${last4})`);
        res.json({ ok: true, has_key: true, last4 });
    } catch (err) {
        logger.error('save openai key error:', err.message);
        res.status(500).json({ error: 'Failed to save key' });
    }
});

// DELETE /me/openai-key
router.delete('/me/openai-key', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        await pb.collection('users').update(userId, {
            openai_key_encrypted: '',
            openai_key_last4: '',
        });
        logger.info(`openai key removed for user ${userId}`);
        res.json({ ok: true, has_key: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper for other routes that need a user's personal key (e.g. round table).
// Returns null if the user has no key or decryption fails.
export async function getUserOpenAIKey(userId) {
    if (!userId) return null;
    try {
        const user = await pb.collection('users').getOne(userId);
        if (!user.openai_key_encrypted) return null;
        return safeDecrypt(user.openai_key_encrypted);
    } catch {
        return null;
    }
}

export default router;
