import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as xai from './xai.js';
import * as google from './google.js';
import { recordUsage } from '../partner/usage.js';

const REGISTRY = {
    openai,
    anthropic,
    xai,
    google,
};

export const SUPPORTED_PROVIDERS = Object.keys(REGISTRY);

function pick(provider) {
    const impl = REGISTRY[provider];
    if (!impl) throw new Error(`Unsupported provider: ${provider}`);
    return impl;
}

export function getProviderMeta(provider) {
    return pick(provider).meta;
}

export async function validateKey(provider, key) {
    return pick(provider).validateKey(key);
}

export async function listChatModels(provider, key) {
    return pick(provider).listChatModels(key);
}

// Single choke point for every chat completion in the platform — which makes
// it the single choke point for usage metering too. Callers can attach
//   opts.meter = { partner_id, user_id, agent, context }
// for attribution; calls without it are still metered as context='untagged'
// so total spend on the dashboard is always true. Providers that surface
// exact token usage do so via the onUsage callback; others get a chars/4
// estimate flagged estimated=true.
export async function chatComplete(provider, opts = {}) {
    const impl = pick(provider);
    let usage = null;
    const { meter, ...providerOpts } = opts;
    const text = await impl.chatComplete({
        ...providerOpts,
        onUsage: (u) => { usage = u; },
    });
    const promptChars =
        (opts.systemPrompt?.length || 0) +
        (opts.userPrompt?.length || 0) +
        (opts.cachedPrefix?.length || 0);
    recordUsage({
        provider,
        model: opts.model || impl.meta?.defaultModel,
        usage,
        promptChars,
        completionChars: text?.length || 0,
        meter,
    }).catch(() => {});
    return text;
}
