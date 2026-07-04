// Usage metering. Called from the single chatComplete choke point in
// providers/index.js — no per-agent instrumentation anywhere else.
//
// Accuracy notes: OpenAI (patched) reports exact usage via onUsage; providers
// not yet patched fall back to a chars/4 estimate and the row is flagged
// estimated=true. Embedding calls are not metered here (add the same hook to
// embeddings/cache.js when you want them on the dashboard).

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { ensurePartnerCollections } from './collections.js';

// $ per 1M tokens: [input, output]. Extend freely; unknown models fall back
// to DEFAULT_PRICE so cost is never silently zero. Cached input billed at
// the cached rate where the provider reports it (OpenAI: 50% of input).
const PRICE_PER_MTOK = {
    'gpt-4o-mini':        [0.15, 0.60],
    'gpt-4o':             [2.50, 10.00],
    'gpt-4.1':            [2.00, 8.00],
    'gpt-4.1-mini':       [0.40, 1.60],
    'o3-mini':            [1.10, 4.40],
    'claude-haiku-4-5':   [1.00, 5.00],
    'claude-sonnet-4-6':  [3.00, 15.00],
    'claude-opus-4-8':    [15.00, 75.00],
    'gemini-2.0-flash':   [0.10, 0.40],
    'gemini-2.5-pro':     [1.25, 10.00],
};
const DEFAULT_PRICE = [1.00, 4.00];

function priceFor(model) {
    const m = String(model || '').toLowerCase();
    for (const [key, price] of Object.entries(PRICE_PER_MTOK)) {
        if (m.startsWith(key)) return price;
    }
    return DEFAULT_PRICE;
}

export function estimateTokens(chars) {
    return Math.max(1, Math.round((chars || 0) / 4));
}

export function computeCostUSD(model, inputTokens, outputTokens, cachedTokens = 0) {
    const [inP, outP] = priceFor(model);
    const freshIn = Math.max(0, inputTokens - cachedTokens);
    const usd = (freshIn * inP + cachedTokens * inP * 0.5 + outputTokens * outP) / 1_000_000;
    return Number(usd.toFixed(6));
}

// Fire-and-forget: metering must never break or slow a chat call.
export async function recordUsage({ provider, model, usage, promptChars, completionChars, meter }) {
    try {
        await ensurePartnerCollections();
        const estimated = !usage;
        const input_tokens  = usage?.input_tokens  ?? estimateTokens(promptChars);
        const output_tokens = usage?.output_tokens ?? estimateTokens(completionChars);
        const cached_tokens = usage?.cached_input_tokens ?? 0;
        await pb.collection('usage_events').create({
            partner_id: meter?.partner_id || '',
            user_id:    meter?.user_id || '',
            agent:      meter?.agent || '',
            context:    meter?.context || 'untagged',
            provider:   provider || '',
            model:      model || '',
            input_tokens, output_tokens, cached_tokens,
            cost_usd: computeCostUSD(model, input_tokens, output_tokens, cached_tokens),
            estimated,
        });
    } catch (err) {
        logger.warn(`usage metering skipped: ${err.message}`);
    }
}
