import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as xai from './xai.js';
import * as google from './google.js';

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

export async function chatComplete(provider, opts) {
    return pick(provider).chatComplete(opts);
}
