// Hostinger integration for the Round Table: per-user API-token storage
// ("Login to Hostinger") plus the VPS deploy endpoint behind Ananya's
// "Deploy to Hostinger" button.

import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { encrypt, safeDecrypt } from '../utils/crypto.js';
import { deploySession } from '../builder/deployer.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();

// Returns the decrypted Hostinger token for a user, or null.
export async function getUserHostingerToken(userId) {
    if (!userId) return null;
    try {
        const user = await pb.collection('users').getOne(userId);
        if (!user.hostinger_token_encrypted) return null;
        return safeDecrypt(user.hostinger_token_encrypted) || null;
    } catch {
        return null;
    }
}

// ──────────────────────────────────────────────────────────────────
// Token storage — "Login to Hostinger"
// ──────────────────────────────────────────────────────────────────

// GET /me/hostinger — connection status (no secret leaves the server)
router.get('/me/hostinger', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        const user = await pb.collection('users').getOne(userId);
        res.json({ connected: !!user.hostinger_token_encrypted, last4: user.hostinger_token_last4 || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /me/hostinger — save the hPanel API token (encrypted at rest)
router.put('/me/hostinger', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const token = (req.body?.token || '').trim();
    if (!token)               return res.status(400).json({ error: 'token is required' });
    if (token.length < 8)     return res.status(400).json({ error: 'that token looks too short' });
    if (token.length > 500)   return res.status(400).json({ error: 'token too long' });

    try {
        await pb.collection('users').update(userId, {
            hostinger_token_encrypted: encrypt(token),
            hostinger_token_last4: token.slice(-4),
        });
        logger.info(`hostinger token saved for user ${userId} (last4=${token.slice(-4)})`);
        res.json({ ok: true, connected: true, last4: token.slice(-4) });
    } catch (err) {
        logger.error('hostinger token save error:', err.message);
        res.status(500).json({ error: 'Failed to save token' });
    }
});

// DELETE /me/hostinger — disconnect
router.delete('/me/hostinger', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        await pb.collection('users').update(userId, {
            hostinger_token_encrypted: '',
            hostinger_token_last4: '',
        });
        res.json({ ok: true, connected: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────
// Deploy — Ananya's build → VPS
// ──────────────────────────────────────────────────────────────────

function wantsStream(req) {
    return req.query?.stream === '1'
        || req.query?.stream === 'true'
        || (req.headers.accept || '').includes('text/event-stream');
}

// POST /api/deploy — push a build session to the VPS. JSON by default; SSE with
// ?stream=1 so the UI can show live progress (connect → upload → configure).
router.post('/deploy', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const sessionId = (req.body?.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'session_id is required' });

    // Deploys are gated on a connected Hostinger account.
    const hostingerToken = await getUserHostingerToken(userId);
    if (!hostingerToken) {
        return res.status(403).json({ error: 'not connected to Hostinger', code: 'hostinger_not_connected' });
    }

    if (!wantsStream(req)) {
        try {
            const result = await deploySession({ sessionId, hostingerToken });
            return res.json(result);
        } catch (err) {
            return res.status(err.status || 500).json({ error: err.message });
        }
    }

    // SSE mode
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (eventName, data) => {
        try { res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`); }
        catch { /* client gone */ }
    };
    send('connected', { ts: Date.now() });

    const heartbeat = setInterval(() => {
        try { res.write(`: ping\n\n`); } catch { /* dead */ }
    }, 20000);

    let clientGone = false;
    const onClose = () => { clientGone = true; clearInterval(heartbeat); };
    res.on('close', onClose);

    try {
        const result = await deploySession({
            sessionId,
            hostingerToken,
            onEvent: (evt) => { if (!clientGone) send(evt.kind || 'trace', evt); },
        });
        if (!clientGone) send('done', result);
    } catch (err) {
        if (!clientGone) send('error', { error: err.message });
    } finally {
        clearInterval(heartbeat);
        res.off('close', onClose);
        try { res.end(); } catch { /* already closed */ }
    }
});

export default router;
