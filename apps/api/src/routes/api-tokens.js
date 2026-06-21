// Personal Access Tokens (PATs) — members generate long-lived tokens that
// authenticate against the same API as their browser session. The raw token
// is shown to the user exactly once; only sha256(token) is stored, so a DB
// dump never leaks usable credentials.
//
// Use cases:
//   • Wire kaushalstack-mcp into Claude Code / Codex / Claude Desktop
//   • curl scripts and CI jobs
//   • Third-party integrations a member builds against the platform

import { Router } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../utils/auth.js';
import { hashApiToken, API_TOKEN_PREFIX } from '../utils/auth.js';

const router = Router();

const MAX_TOKENS_PER_USER = 20;
const MAX_NAME_LEN = 80;

// ── Collection bootstrap ────────────────────────────────────────────────────

let collectionReady = false;
const FIELDS = [
    { type: 'text',     name: 'user_id',     required: true },
    { type: 'text',     name: 'name',        required: true, max: MAX_NAME_LEN },
    { type: 'text',     name: 'token_hash',  required: true, max: 80 },
    { type: 'text',     name: 'prefix',      max: 20 },
    { type: 'text',     name: 'last4',       max: 10 },
    { type: 'date',     name: 'last_used' },
    { type: 'autodate', name: 'created',     onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated',     onCreate: true, onUpdate: true  },
];

async function ensureCollection() {
    if (collectionReady) return;
    try {
        const existing = await pb.collections.getOne('api_tokens');
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = FIELDS.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            try {
                await pb.collections.update('api_tokens', {
                    fields: [...existing.fields, ...missing],
                });
                logger.info(`api_tokens: added fields [${missing.map(f => f.name).join(', ')}]`);
            } catch (err) {
                logger.warn('Could not add api_tokens fields:', err.message);
            }
        }
        collectionReady = true;
    } catch {
        try {
            await pb.send('/api/collections', {
                method: 'POST',
                body: { name: 'api_tokens', type: 'base', fields: FIELDS, indexes: [
                    'CREATE UNIQUE INDEX IF NOT EXISTS `idx_api_tokens_hash` ON `api_tokens` (`token_hash`)',
                    'CREATE INDEX IF NOT EXISTS `idx_api_tokens_user` ON `api_tokens` (`user_id`)',
                ] },
            });
            collectionReady = true;
            logger.info('api_tokens collection created');
        } catch (err) {
            logger.warn('Could not create api_tokens collection:', err.message);
        }
    }
}

ensureCollection();

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateToken() {
    return API_TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
}

function shape(rec) {
    return {
        id: rec.id,
        name: rec.name,
        prefix: rec.prefix || '',
        last4: rec.last4 || '',
        last_used: rec.last_used || null,
        created: rec.created,
    };
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.get('/me/api-tokens', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    await ensureCollection();
    try {
        const list = await pb.collection('api_tokens').getList(1, 100, {
            filter: `user_id = "${userId}"`,
            sort: '-created',
        });
        res.json({ tokens: list.items.map(shape) });
    } catch (err) {
        logger.error('list api-tokens error:', err.message);
        res.status(500).json({ error: err.message, tokens: [] });
    }
});

router.post('/me/api-tokens', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const name = String(req.body?.name || '').trim().slice(0, MAX_NAME_LEN);
    if (!name) return res.status(400).json({ error: 'name is required' });

    await ensureCollection();

    try {
        const existing = await pb.collection('api_tokens').getList(1, 1, {
            filter: `user_id = "${userId}"`,
            fields: 'id',
        });
        if (existing.totalItems >= MAX_TOKENS_PER_USER) {
            return res.status(400).json({ error: `you already have ${MAX_TOKENS_PER_USER} tokens — revoke one before creating another` });
        }
    } catch { /* limit check is best-effort */ }

    const raw = generateToken();
    const hash = hashApiToken(raw);

    try {
        const rec = await pb.collection('api_tokens').create({
            user_id: userId,
            name,
            token_hash: hash,
            prefix: raw.slice(0, 8),
            last4: raw.slice(-4),
        });
        logger.info(`api token created for user ${userId} (name="${name}", last4=${raw.slice(-4)})`);
        // The raw token is the ONE moment it's ever sent over the wire — the
        // UI must show it immediately and warn the user it won't be retrievable.
        res.json({ token: raw, record: shape(rec) });
    } catch (err) {
        logger.error('create api-token error:', err.message);
        res.status(500).json({ error: 'Failed to create token' });
    }
});

router.delete('/me/api-tokens/:id', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const rec = await pb.collection('api_tokens').getOne(req.params.id);
        if (rec.user_id !== userId) return res.status(403).json({ error: 'forbidden' });
        await pb.collection('api_tokens').delete(req.params.id);
        logger.info(`api token revoked: id=${req.params.id} user=${userId}`);
        res.json({ ok: true });
    } catch (err) {
        if (err?.status === 404) return res.status(404).json({ error: 'token not found' });
        logger.error('revoke api-token error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
