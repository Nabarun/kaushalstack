// Google Gemini provider adapter.
// Differences vs OpenAI:
//  - auth via ?key= query param, not Bearer header
//  - endpoint embeds the model: POST /v1beta/models/{model}:generateContent
//  - request: contents:[{role, parts:[{text}]}], systemInstruction top-level
//  - JSON mode via generationConfig.responseMimeType = 'application/json'
//  - response: candidates[0].content.parts[].text
//  - model list: GET /v1beta/models; objects don't carry a `created` timestamp,
//    we sort by name desc as a rough proxy (newer versions sort higher)

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-1.5-flash-latest';
const MAX_OUTPUT_TOKENS = 4096;

export const meta = {
    id: 'google',
    label: 'Google Gemini',
    defaultModel: DEFAULT_CHAT_MODEL,
    keyPattern: /^AIza[0-9A-Za-z_\-]{35}$/,
    keyHint: 'Starts with AIza',
};

export async function validateKey(key) {
    const r = await fetch(`${BASE_URL}/models?key=${encodeURIComponent(key)}`);
    if (r.status === 200) return { ok: true };
    if (r.status === 400 || r.status === 401 || r.status === 403) {
        return { ok: false, reason: 'Key was rejected by Google (unauthorized).' };
    }
    if (r.status === 429) return { ok: false, reason: 'Google returned 429 — key may be out of quota or rate-limited.' };
    return { ok: false, reason: `Google returned status ${r.status}` };
}

export async function listChatModels(key) {
    const r = await fetch(`${BASE_URL}/models?pageSize=200&key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`google /v1beta/models ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data.models) ? data.models : [];
    return all
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => ({
            id: (m.name || '').replace(/^models\//, ''),
            created: 0,
            owned_by: 'google',
        }))
        .filter(m => m.id && !/embedding|aqa|image/.test(m.id))
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, 20);
}

export async function chatComplete({ key, model, systemPrompt, userPrompt, jsonMode }) {
    const modelId = model || DEFAULT_CHAT_MODEL;
    const url = `${BASE_URL}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

    const body = {
        contents: [
            { role: 'user', parts: [{ text: userPrompt }] },
        ],
        generationConfig: {
            temperature: 0.8,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
    };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    if (jsonMode) body.generationConfig.responseMimeType = 'application/json';

    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const errBody = (await r.text()).slice(0, 300);
        const err = new Error(`google generateContent ${r.status}: ${errBody}`);
        err.status = r.status;
        throw err;
    }
    const data = await r.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map(p => p.text || '').join('');
}
