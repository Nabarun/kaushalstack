// Anthropic Claude provider adapter.
// Differences vs OpenAI:
//  - auth via x-api-key header, not Bearer
//  - anthropic-version header required
//  - max_tokens is required
//  - system prompt is a top-level field, not a message
//  - no native response_format; ask the model for JSON via prompt + we parse it

const BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_CHAT_MODEL = 'claude-3-5-sonnet-latest';
const MAX_TOKENS = 4096;

export const meta = {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: DEFAULT_CHAT_MODEL,
    keyPattern: /^sk-ant-[A-Za-z0-9_\-]{20,}$/,
    keyHint: 'Starts with sk-ant-',
};

export async function validateKey(key) {
    const r = await fetch(`${BASE_URL}/models`, {
        headers: {
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
        },
    });
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, reason: 'Key was rejected by Anthropic (unauthorized).' };
    if (r.status === 429) return { ok: false, reason: 'Anthropic returned 429 — key may be out of quota or rate-limited.' };
    return { ok: false, reason: `Anthropic returned status ${r.status}` };
}

export async function listChatModels(key) {
    const r = await fetch(`${BASE_URL}/models?limit=100`, {
        headers: {
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
        },
    });
    if (!r.ok) throw new Error(`anthropic /v1/models ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data.data) ? data.data : [];
    // Anthropic returns model objects with id, display_name, created_at (ISO string).
    return all
        .map(m => ({
            id: m.id,
            created: m.created_at ? Math.floor(new Date(m.created_at).getTime() / 1000) : 0,
            owned_by: 'anthropic',
        }))
        .sort((a, b) => b.created - a.created)
        .slice(0, 20);
}

export async function chatComplete({ key, model, systemPrompt, userPrompt, jsonMode }) {
    // No native JSON mode — append an instruction to the user prompt when needed.
    // The roundtable prompt already asks for JSON, so this is mostly belt-and-suspenders.
    const finalUser = jsonMode
        ? `${userPrompt}\n\nRespond with valid JSON only, no prose or markdown fences.`
        : userPrompt;

    // Newer Claude models (Opus 4, Sonnet 4, etc.) reject `temperature` outright.
    // Anthropic's default (~1.0) is fine for our use case, so we just omit it.
    const body = {
        model: model || DEFAULT_CHAT_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: finalUser }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const r = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const errBody = (await r.text()).slice(0, 300);
        const err = new Error(`anthropic messages ${r.status}: ${errBody}`);
        err.status = r.status;
        throw err;
    }
    const data = await r.json();
    // content is an array of {type, text} blocks. Concatenate text blocks.
    const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    return text;
}
