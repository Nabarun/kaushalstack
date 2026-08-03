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

// Signature-verified variant of getUserIdFromAuth: resolves a user id ONLY
// when the credential actually verifies — ksk_ tokens against their stored
// hash (as always), and PocketBase JWTs against PocketBase itself via
// auth-refresh, because decodeJwtUserId alone trusts the payload without
// checking the signature. Use this wherever the resolved id has billing or
// authz consequences and no other guard exists on the route. Verified JWTs
// are cached briefly (same TTL as api tokens) so polling endpoints don't
// hammer PB.
const JWT_VERIFY_CACHE = new Map(); // sha256(token) → { userId, cachedAt }

export async function verifiedUserIdFromAuth(req) {
    const header = req?.headers?.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    if (token.startsWith(API_TOKEN_PREFIX)) return await lookupApiToken(token);

    const hash = hashApiToken(token);
    const hit = JWT_VERIFY_CACHE.get(hash);
    if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.userId;
    try {
        const base = (process.env.POCKETBASE_URL || 'http://localhost:8090').replace(/\/$/, '');
        const r = await fetch(`${base}/api/collections/users/auth-refresh`, {
            method: 'POST',
            headers: { Authorization: token },
        });
        if (!r.ok) return null;
        const data = await r.json();
        const userId = data?.record?.id || null;
        if (userId) {
            if (JWT_VERIFY_CACHE.size > 1000) JWT_VERIFY_CACHE.clear(); // crude bound; refills on demand
            JWT_VERIFY_CACHE.set(hash, { userId, cachedAt: Date.now() });
        }
        return userId;
    } catch {
        return null;
    }
}

// Sync variant kept for hot paths that only need the JWT case. Use sparingly.
export function getUserIdFromJwtHeader(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    if (token.startsWith(API_TOKEN_PREFIX)) return null;
    return decodeJwtUserId(token);
}
