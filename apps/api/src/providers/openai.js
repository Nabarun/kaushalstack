// OpenAI provider adapter. Also used for xAI Grok by overriding the base URL.

const BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';

export const meta = {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: DEFAULT_CHAT_MODEL,
    keyPattern: /^sk-(?:proj-)?[A-Za-z0-9_\-]{20,}$/,
    keyHint: 'Starts with sk- or sk-proj-',
};

function chatCapable(id) {
    const lower = String(id || '').toLowerCase();
    if (/whisper|tts|dall-e|embedding|audio|realtime|translate|moderation|image|davinci|babbage|instruct/.test(lower)) return false;
    return /^(gpt-3\.5|gpt-4|gpt-5|o1|o3|o4|chatgpt|chat-)/.test(lower);
}

export async function validateKey(key) {
    const r = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, reason: 'Key was rejected by OpenAI (unauthorized).' };
    if (r.status === 429) return { ok: false, reason: 'OpenAI returned 429 — key may be out of quota or rate-limited.' };
    return { ok: false, reason: `OpenAI returned status ${r.status}` };
}

export async function listChatModels(key) {
    const r = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`openai /v1/models ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data.data) ? data.data : [];
    return all
        .filter(m => chatCapable(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .slice(0, 20)
        .map(m => ({ id: m.id, created: m.created || 0, owned_by: m.owned_by || 'openai' }));
}

export async function chatComplete({ key, model, systemPrompt, userPrompt, cachedPrefix, jsonMode }) {
    // OpenAI auto-caches identical prompt prefixes >=1024 tokens for 5-10
    // minutes. We don't send explicit markers — the only requirement is that
    // the cached prefix sit at the START of the prompt and be byte-identical
    // across calls. Combining cachedPrefix + userPrompt in that order gives
    // the cache a stable hit zone for multi-turn round tables.
    const userContent = cachedPrefix
        ? `${cachedPrefix}\n\n${userPrompt}`
        : userPrompt;
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userContent });

    const body = {
        model: model || DEFAULT_CHAT_MODEL,
        temperature: 0.8,
        messages,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const errBody = (await r.text()).slice(0, 300);
        const err = new Error(`openai chat ${r.status}: ${errBody}`);
        err.status = r.status;
        throw err;
    }
    const data = await r.json();
    return data.choices?.[0]?.message?.content || '';
}
