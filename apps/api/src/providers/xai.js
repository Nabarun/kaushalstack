// xAI Grok provider adapter.
// The xAI API is OpenAI-compatible (POST /v1/chat/completions, GET /v1/models),
// so this is largely a copy of openai.js with the base URL swapped.

const BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_CHAT_MODEL = 'grok-2-latest';

export const meta = {
    id: 'xai',
    label: 'xAI Grok',
    defaultModel: DEFAULT_CHAT_MODEL,
    keyPattern: /^xai-[A-Za-z0-9_\-]{20,}$/,
    keyHint: 'Starts with xai-',
};

function chatCapable(id) {
    // xAI publishes a small catalogue and almost everything they ship is
    // chat-capable. Filter only the explicit non-chat families (image gen,
    // embedding) when/if they exist.
    const lower = String(id || '').toLowerCase();
    if (/image|embedding|vision-only/.test(lower)) return false;
    return /^grok/.test(lower);
}

export async function validateKey(key) {
    const r = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, reason: 'Key was rejected by xAI (unauthorized).' };
    if (r.status === 429) return { ok: false, reason: 'xAI returned 429 — key may be out of quota or rate-limited.' };
    return { ok: false, reason: `xAI returned status ${r.status}` };
}

export async function listChatModels(key) {
    const r = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`xai /v1/models ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data.data) ? data.data : [];
    return all
        .filter(m => chatCapable(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .slice(0, 20)
        .map(m => ({ id: m.id, created: m.created || 0, owned_by: m.owned_by || 'xai' }));
}

export async function chatComplete({ key, model, systemPrompt, userPrompt, jsonMode }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

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
        const err = new Error(`xai chat ${r.status}: ${errBody}`);
        err.status = r.status;
        throw err;
    }
    const data = await r.json();
    return data.choices?.[0]?.message?.content || '';
}
