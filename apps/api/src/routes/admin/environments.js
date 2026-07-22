// Admin control over partner portal environments — the "environment creation"
// behind the Marketplace Studio tile.

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';
import { ensurePartnerCollections } from '../../partner/collections.js';
import {
    provisionEnvironment, removeEnvironment, getEnvironment, SLUG_RE,
} from '../../partner/environment.js';
import { dockerAvailable } from '../../utils/dockerEngine.js';

const router = Router();

function toRow(e) {
    return {
        id: e.id,
        partner_id: e.partner_id,
        slug: e.slug,
        url: e.url,
        status: e.status,
        portal_name: e.portal_name || '',
        admin_user: e.admin_user || '',
        error: e.error || '',
        created: e.created,
    };
}

router.get('/admin/environments', requireAdmin, async (req, res) => {
    try {
        await ensurePartnerCollections();
        let items = [];
        try {
            items = await pb.collection('partner_environments').getFullList({
                filter: 'status != "removed"',
                sort: '-created',
            });
        } catch { /* collection may not exist yet */ }
        res.json({ items: items.map(toRow), docker_available: await dockerAvailable() });
    } catch (err) {
        logger.error('admin environments list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/partners/:id/environment', requireAdmin, async (req, res) => {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    const portalName = String(req.body?.portal_name || '').trim().slice(0, 120);
    const adminUser = String(req.body?.admin_user || '').trim().slice(0, 60);
    const adminPass = String(req.body?.admin_pass || '');
    const sessionId = String(req.body?.session_id || '').trim();
    if (sessionId && !/^[a-f0-9]{16}$/.test(sessionId)) {
        return res.status(400).json({ error: 'session_id must be a 16-character build session id' });
    }
    if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'subdomain must be 3-30 chars: lowercase letters, digits, hyphens' });
    }
    try {
        const partner = await pb.collection('partners').getOne(req.params.id).catch(() => null);
        if (!partner) return res.status(404).json({ error: 'partner not found' });

        const env = await provisionEnvironment({
            partner, slug, portalName, adminUser, adminPass, sessionId,
            addedBy: req.adminUserId,
        });
        res.json({ item: toRow(env) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.delete('/admin/partners/:id/environment', requireAdmin, async (req, res) => {
    try {
        const env = await getEnvironment(req.params.id);
        if (!env) return res.status(404).json({ error: 'no environment for this partner' });
        const updated = await removeEnvironment(env);
        res.json({ item: toRow(updated) });
    } catch (err) {
        logger.error('admin environment remove failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
