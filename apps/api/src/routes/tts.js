// POST /tts — synthesize a TTS voice-over for arbitrary text and stream
// the mp3 back. Used by the roundtable "speak" button on each agent response.
// Plus an in-process LRU cache so the same text+voice combo is only hit once.

import { Router } from 'express';
import crypto from 'node:crypto';
import logger from '../utils/logger.js';

const router = Router();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TTS_MODEL  = 'tts-1-hd';
const VALID_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
const MAX_INPUT_CHARS = 4000;

// Tiny LRU — same text+voice gets cached for the life of the process so
// re-clicking "speak" on the same response is instant + free.
const CACHE_MAX = 200;
const cache = new Map();
function cacheKey(text, voice) {
    return crypto.createHash('sha256').update(`${voice}::${text}`).digest('hex');
}
function cacheGet(k) {
    if (!cache.has(k)) return null;
    const v = cache.get(k);
    cache.delete(k); cache.set(k, v);     // promote to MRU
    return v;
}
function cacheSet(k, buf) {
    if (cache.has(k)) cache.delete(k);
    cache.set(k, buf);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// POST /tts  { text, voice? }  →  audio/mpeg
router.post('/tts', async (req, res) => {
    if (!OPENAI_KEY) {
        return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > MAX_INPUT_CHARS) {
        return res.status(400).json({ error: `text too long (max ${MAX_INPUT_CHARS} chars)` });
    }
    const voice = VALID_VOICES.has(req.body?.voice) ? req.body.voice : 'nova';

    const key = cacheKey(text, voice);
    const cached = cacheGet(key);
    if (cached) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', cached.length);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-TTS-Cache', 'hit');
        return res.end(cached);
    }

    try {
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({ model: TTS_MODEL, voice, input: text, speed: 1.0 }),
        });
        if (!r.ok) {
            const body = (await r.text()).slice(0, 200);
            logger.warn(`/tts openai ${r.status}: ${body}`);
            return res.status(502).json({ error: `OpenAI TTS returned ${r.status}` });
        }
        const buf = Buffer.from(await r.arrayBuffer());
        cacheSet(key, buf);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', buf.length);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-TTS-Cache', 'miss');
        return res.end(buf);
    } catch (err) {
        logger.error('/tts error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
