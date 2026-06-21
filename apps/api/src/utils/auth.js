import crypto from 'crypto';
import pb from './pocketbaseClient.js';
import logger from './logger.js';

// kaushalstack personal access tokens look like:
//   ksk_<64 lowercase hex>
// We store sha256(token) so the raw value only ever lives on the client.
export const API_TOKEN_PREFIX = 'ksk_';
const API_TOKEN_RE = /^ksk_[a-f0-9]{64}$/;

export function hashApiToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// In-process cache: token_hash → { userId, recordId, lastUsedSentAt }
// Avoids a PB read on every request when the same token is hammered (typical
// MCP / Codex usage pattern). Entries expire after 5 min so revocation
// propagates without a server restart.
const TOKEN_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_USED_THROTTLE_MS = 60 * 1000;

function getCached(hash) {
    const entry = TOKEN_CACHE.get(hash);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
        TOKEN_CACHE.delete(hash);
        return null;
    }
    return entry;
}

function setCached(hash, userId, recordId) {
    TOKEN_CACHE.set(hash, { userId, recordId, cachedAt: Date.now(), lastUsedSentAt: 0 });
}

// Fire-and-forget last_used bump, throttled per cache entry.
function bumpLastUsed(entry) {
    const now = Date.now();
    if (now - entry.lastUsedSentAt < LAST_USED_THROTTLE_MS) return;
    entry.lastUsedSentAt = now;
    pb.collection('api_tokens')
        .update(entry.recordId, { last_used: new Date().toISOString() })
        .catch(() => {});
}

function decodeJwtUserId(token) {
    try {
        const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
        );
        return payload.id || null;
    } catch {
        return null;
    }
}

async function lookupApiToken(token) {
    if (!API_TOKEN_RE.test(token)) return null;
    const hash = hashApiToken(token);

    const cached = getCached(hash);
    if (cached) {
        bumpLastUsed(cached);
        return cached.userId;
    }

    try {
        const list = await pb.collection('api_tokens').getList(1, 1, {
            filter: `token_hash = "${hash}"`,
        });
        const rec = list.items[0];
        if (!rec) return null;
        setCached(hash, rec.user_id, rec.id);
        bumpLastUsed(TOKEN_CACHE.get(hash));
        return rec.user_id;
    } catch (err) {
        // Collection may not exist yet (first boot). Treat as miss.
        if (err?.status !== 404) logger.warn('api_tokens lookup failed:', err.message);
        return null;
    }
}

// Resolve a user id from either a PocketBase JWT or a kaushalstack api token.
// Returns null on miss/bad-shape (callers respond 401).
export async function getUserIdFromAuth(req) {
    const header = req?.headers?.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;

    if (token.startsWith(API_TOKEN_PREFIX)) {
        return await lookupApiToken(token);
    }
    return decodeJwtUserId(token);
}

// Sync variant kept for hot paths that only need the JWT case. Use sparingly.
export function getUserIdFromJwtHeader(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    if (token.startsWith(API_TOKEN_PREFIX)) return null;
    return decodeJwtUserId(token);
}
