// Operator relay for a KaushalStack platform product (Designer, Connections…):
// the admin UI calls /admin/<product>/…, this relays to that product's
// operator API with a server-held bearer token. The browser never sees the
// token and never talks to the product directly. Unconfigured = 503 with a
// clear message, so a missing env var reads as "not wired up".

import { Router } from 'express';
import { Readable } from 'node:stream';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const ACTIONS = new Set([
    'lock', 'unlock', 'website-connected', 'website-disconnect',
    'integrate-varanan', 'publish-route', 'verification-link', 'note', 'email-owner', 'set-tier', 'billing-exempt',
]);

/**
 * @param {{ key: string, label: string, envPrefix: string, upstream: string }} product
 *   key: URL segment under /admin; envPrefix: <PREFIX>_OPERATOR_URL/TOKEN;
 *   upstream: the product's operator collection path (/api/operator/workspaces, /api/operator/orgs)
 */
export function platformOpsRouter(product) {
const router = Router();
function config() {
    const base = (process.env[`${product.envPrefix}_OPERATOR_URL`] || '').replace(/\/$/, '');
    const token = process.env[`${product.envPrefix}_OPERATOR_TOKEN`] || '';
    return base && token ? { base, token } : null;
}

async function actorFor(req) {
    try {
        const u = await pb.collection('users').getOne(req.adminUserId, { fields: 'email' });
        return u?.email || req.adminUserId;
    } catch {
        return req.adminUserId;
    }
}

async function relay(res, path, init = {}) {
    const cfg = config();
    if (!cfg) {
        return res.status(503).json({
            error: `${product.label} is not connected: set ${product.envPrefix}_OPERATOR_URL and ${product.envPrefix}_OPERATOR_TOKEN on the API.`,
        });
    }
    try {
        const r = await fetch(`${cfg.base}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                'Content-Type': 'application/json',
                ...(init.headers || {}),
            },
            signal: AbortSignal.timeout(20000),
        });
        const text = await r.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) || `Designer answered ${r.status}` }; }
        // Designer answers 404 for a bad token too; say so rather than "not found".
        if (r.status === 404 && path === product.upstream) {
            data = { error: `${product.label} rejected the operator token (or the operator API is off).` };
        }
        return res.status(r.status).json(data);
    } catch (err) {
        logger.error(`${product.key} relay failed: ${err.message}`);
        return res.status(502).json({ error: `Could not reach ${product.label}: ${err.message}` });
    }
}

const slugParam = (req, res) => {
    const slug = String(req.params.slug || '');
    if (!SLUG_RE.test(slug)) {
        res.status(400).json({ error: 'Invalid workspace' });
        return null;
    }
    return slug;
};

router.get(`/admin/${product.key}/workspaces`, requireAdmin, (req, res) =>
    relay(res, product.upstream));

router.get(`/admin/${product.key}/workspaces/:slug`, requireAdmin, (req, res) => {
    const slug = slugParam(req, res);
    if (slug) relay(res, `${product.upstream}/${slug}`);
});

router.post(`/admin/${product.key}/workspaces/:slug/actions`, requireAdmin, async (req, res) => {
    const slug = slugParam(req, res);
    if (!slug) return;
    const action = String(req.body?.action || '');
    if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Unknown action' });
    const actor = await actorFor(req);
    logger.info(`${product.key}: ${actor} → ${action} ${slug}`);
    relay(res, `${product.upstream}/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({
            action,
            reason: String(req.body?.reason || '').slice(0, 200),
            notes: String(req.body?.notes || '').slice(0, 4000),
            template: String(req.body?.template || '').slice(0, 40),
            tier: String(req.body?.tier || '').slice(0, 20),
            exempt: Boolean(req.body?.exempt),
            actor,
        }),
    });
});

// Streams the company's tar.gz straight through; the browser downloads it.
router.get(`/admin/${product.key}/workspaces/:slug/export`, requireAdmin, async (req, res) => {
    const slug = slugParam(req, res);
    if (!slug) return;
    const cfg = config();
    if (!cfg) return res.status(503).json({ error: `${product.label} is not connected.` });
    const actor = await actorFor(req);
    logger.info(`${product.key}: ${actor} exported ${slug}`);
    try {
        const r = await fetch(`${cfg.base}${product.upstream}/${slug}/export?actor=${encodeURIComponent(actor)}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            signal: AbortSignal.timeout(120000),
        });
        if (!r.ok || !r.body) {
            const text = await r.text().catch(() => '');
            let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) || `Designer answered ${r.status}` }; }
            return res.status(r.status).json(data);
        }
        res.status(200);
        for (const h of ['content-type', 'content-length', 'content-disposition']) {
            const v = r.headers.get(h);
            if (v) res.setHeader(h, v);
        }
        res.setHeader('Cache-Control', 'private, no-store');
        Readable.fromWeb(r.body).pipe(res);
    } catch (err) {
        logger.error(`${product.key} export failed: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: `Could not reach ${product.label}: ${err.message}` });
    }
});

router.delete(`/admin/${product.key}/workspaces/:slug`, requireAdmin, async (req, res) => {
    const slug = slugParam(req, res);
    if (!slug) return;
    if (req.query.confirm !== slug) {
        return res.status(400).json({ error: 'Type the workspace address to confirm deletion' });
    }
    const actor = await actorFor(req);
    logger.warn(`${product.key}: ${actor} DELETED ${slug}`);
    relay(res, `${product.upstream}/${slug}?confirm=${encodeURIComponent(slug)}&actor=${encodeURIComponent(actor)}`, {
        method: 'DELETE',
    });
});

return router;
}
