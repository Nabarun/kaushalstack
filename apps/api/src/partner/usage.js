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
    // Nano Banana image output is billed as image tokens (~1120 per 1K
    // image → ≈$0.067 each at $60/M output).
    'gemini-3.1-flash-image': [0.30, 60.00],
};
const DEFAULT_PRICE = [1.00, 4.00];

function priceFor(model) {
    const m = String(model || '').toLowerCase();
    // Longest prefix wins, so 'gemini-3.1-flash-image' beats a shorter
    // 'gemini-3.1-flash' entry regardless of insertion order.
    for (const [key, price] of Object.entries(PRICE_PER_MTOK).sort((a, b) => b[0].length - a[0].length)) {
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

const esc = (s) => String(s || '').replace(/"/g, '\\"');

// Lifetime spend for a partner — the basis for hard credit caps.
export async function lifetimeSpendUSD(partnerId) {
    if (!partnerId) return 0;
    try {
        await ensurePartnerCollections();
        const rows = await pb.collection('usage_events').getFullList({
            filter: `partner_id = "${esc(partnerId)}"`,
            fields: 'cost_usd',
        });
        return Number(rows.reduce((sum, r) => sum + (r.cost_usd || 0), 0).toFixed(6));
    } catch {
        return 0;
    }
}

// Hard-cap gate for partner-tagged calls. cap 0/absent = uncapped.
// Fails OPEN on read errors: a metering hiccup must not take every
// roundtable down — the cap is a spend control, not a security boundary.
export async function checkPartnerCredit(partnerId) {
    if (!partnerId) return { blocked: false, spent_usd: 0, cap_usd: 0 };
    let cap = 0;
    try {
        const p = await pb.collection('partners').getOne(partnerId);
        cap = Number(p.credit_cap_usd) || 0;
    } catch { /* fail open */ }
    if (cap <= 0) return { blocked: false, spent_usd: 0, cap_usd: 0 };
    const spent = await lifetimeSpendUSD(partnerId);
    return { blocked: spent >= cap, spent_usd: spent, cap_usd: cap };
}

// Fire-and-forget: metering must never break or slow a chat call.
// costUSD overrides the token-based computation for spend that isn't
// token-priced at all (e.g. Veo video, billed per second of output).
export async function recordUsage({ provider, model, usage, promptChars, completionChars, meter, costUSD }) {
    try {
        await ensurePartnerCollections();
        const estimated = !usage && typeof costUSD !== 'number';
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
            cost_usd: typeof costUSD === 'number'
                ? Number(costUSD.toFixed(6))
                : computeCostUSD(model, input_tokens, output_tokens, cached_tokens),
            estimated,
        });
    } catch (err) {
        logger.warn(`usage metering skipped: ${err.message}`);
    }
}
