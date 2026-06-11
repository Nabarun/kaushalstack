import logger from '../utils/logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOP_N_SHOWCASE = 5;
const TOP_N_CHAT = 10;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Holds the full /v1/models response so showcase + chat views share one fetch.
let rawCache = { models: [], fetched_at: null };

function isChatModel(id) {
    const lower = String(id || '').toLowerCase();
    // Exclude non-chat-completion model families.
    if (/whisper|tts|dall-e|embedding|audio|realtime|translate|moderation|image|davinci|babbage|instruct/.test(lower)) return false;
    // Positive whitelist of known chat-capable prefixes.
    return /^(gpt-3\.5|gpt-4|gpt-5|o1|o3|o4|chatgpt|chat-)/.test(lower);
}

async function refreshRaw() {
    if (!OPENAI_API_KEY) {
        logger.warn('openai-models: OPENAI_API_KEY missing');
        return rawCache;
    }
    try {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        });
        if (!res.ok) {
            const body = (await res.text()).slice(0, 200);
            throw new Error(`openai /v1/models ${res.status}: ${body}`);
        }
        const data = await res.json();
        const all = Array.isArray(data.data) ? data.data : [];
        rawCache = { models: all, fetched_at: new Date().toISOString() };
        logger.info(`openai-models: fetched ${all.length} models`);
    } catch (err) {
        logger.error('openai-models: fetch failed:', err.message);
    }
    return rawCache;
}

async function ensureFresh() {
    const age = rawCache.fetched_at ? Date.now() - new Date(rawCache.fetched_at).getTime() : Infinity;
    if (rawCache.models.length === 0 || age >= CACHE_TTL_MS) {
        await refreshRaw();
    }
    return rawCache;
}

function topByCreated(list, n) {
    return list
        .slice()
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .slice(0, n)
        .map(m => ({ id: m.id, created: m.created || 0, owned_by: m.owned_by || 'openai' }));
}

export async function getTopModels() {
    const { models, fetched_at } = await ensureFresh();
    return {
        models: topByCreated(models, TOP_N_SHOWCASE),
        refreshed_at: fetched_at,
        source: 'openai',
    };
}

export async function getChatModels() {
    const { models, fetched_at } = await ensureFresh();
    const chat = models.filter(m => isChatModel(m.id));
    return {
        models: topByCreated(chat, TOP_N_CHAT),
        refreshed_at: fetched_at,
        source: 'openai',
    };
}
