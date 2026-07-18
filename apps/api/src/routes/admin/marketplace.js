// Admin marketplace: per-partner feature subscriptions at a flat monthly
// price. paid_until drives access — past it, the subscription reads as
// "unpaid" and the partner's portal stops seeing the feature (enforced via
// GET /partner/:id/entitlements).

import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { ensurePartnerCollections } from '../../partner/collections.js';
import { requireAdmin } from './auth.js';

const router = Router();

export const MONTHLY_PRICE_INR = 1000;
const PERIOD_DAYS = 30;

const esc = (s) => String(s || '').replace(/"/g, '\\"');

export function effectiveStatus(sub) {
    if (sub.status === 'cancelled') return 'cancelled';
    if (!sub.paid_until || new Date(sub.paid_until).getTime() < Date.now()) return 'unpaid';
    return 'active';
}

function addDays(from, days) {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function toRow(sub, partner) {
    return {
        id: sub.id,
        partner_id: sub.partner_id,
        feature_id: sub.feature_id,
        status: sub.status,
        effective_status: effectiveStatus(sub),
        price_inr: sub.price_inr || MONTHLY_PRICE_INR,
        paid_until: sub.paid_until || null,
        last_paid_at: sub.last_paid_at || null,
        partner_name: partner?.name || sub.partner_id,
        created: sub.created,
        updated: sub.updated,
    };
}

// All subscriptions + the partner roster, so the UI can render every
// feature's panel from one call.
router.get('/admin/marketplace/subscriptions', requireAdmin, async (req, res) => {
    try {
        await ensurePartnerCollections();
        const [subs, partners] = await Promise.all([
            pb.collection('feature_subscriptions').getFullList({ sort: '-created' }),
            pb.collection('partners').getFullList({ sort: 'name', fields: 'id,name,status' }),
        ]);
        const byId = Object.fromEntries(partners.map(p => [p.id, p]));
        res.json({
            items: subs.map(s => toRow(s, byId[s.partner_id])),
            partners: partners.map(p => ({ id: p.id, name: p.name, status: p.status || 'active' })),
            price_inr: MONTHLY_PRICE_INR,
        });
    } catch (err) {
        logger.error('admin marketplace list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Subscribe a partner to a feature. Idempotent: an existing (partner,
// feature) row is reactivated instead of duplicated. First period starts
// paid — Mark paid extends it month by month after that.
router.post('/admin/marketplace/subscriptions', requireAdmin, async (req, res) => {
    const partnerId = (req.body?.partner_id || '').trim();
    const featureId = (req.body?.feature_id || '').trim();
    if (!partnerId || !featureId) {
        return res.status(400).json({ error: 'partner_id and feature_id are required' });
    }
    try {
        await ensurePartnerCollections();
        const partner = await pb.collection('partners').getOne(partnerId).catch(() => null);
        if (!partner) return res.status(404).json({ error: 'partner not found' });

        const now = new Date();
        const existing = await pb.collection('feature_subscriptions').getList(1, 1, {
            filter: `partner_id = "${esc(partnerId)}" && feature_id = "${esc(featureId)}"`,
        }).then(r => r.items[0]).catch(() => null);

        let sub;
        if (existing) {
            const paidUntil = existing.paid_until && new Date(existing.paid_until) > now
                ? existing.paid_until
                : addDays(now, PERIOD_DAYS);
            sub = await pb.collection('feature_subscriptions').update(existing.id, {
                status: 'active',
                paid_until: paidUntil,
            });
        } else {
            sub = await pb.collection('feature_subscriptions').create({
                partner_id: partnerId,
                feature_id: featureId,
                status: 'active',
                price_inr: MONTHLY_PRICE_INR,
                paid_until: addDays(now, PERIOD_DAYS),
                last_paid_at: now.toISOString(),
                added_by: req.adminUserId || '',
            });
        }
        res.json({ item: toRow(sub, partner) });
    } catch (err) {
        logger.error('admin marketplace subscribe failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Record a ₹1000 payment: extend paid_until by one period from whichever is
// later — now, or the current paid_until (early payments stack).
router.post('/admin/marketplace/subscriptions/:id/mark-paid', requireAdmin, async (req, res) => {
    try {
        const sub = await pb.collection('feature_subscriptions').getOne(req.params.id);
        const now = new Date();
        const base = sub.paid_until && new Date(sub.paid_until) > now ? new Date(sub.paid_until) : now;
        const updated = await pb.collection('feature_subscriptions').update(sub.id, {
            status: 'active',
            paid_until: addDays(base, PERIOD_DAYS),
            last_paid_at: now.toISOString(),
        });
        const partner = await pb.collection('partners').getOne(updated.partner_id).catch(() => null);
        res.json({ item: toRow(updated, partner) });
    } catch (err) {
        logger.error('admin marketplace mark-paid failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/marketplace/subscriptions/:id/cancel', requireAdmin, async (req, res) => {
    try {
        const updated = await pb.collection('feature_subscriptions').update(req.params.id, {
            status: 'cancelled',
        });
        const partner = await pb.collection('partners').getOne(updated.partner_id).catch(() => null);
        res.json({ item: toRow(updated, partner) });
    } catch (err) {
        logger.error('admin marketplace cancel failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
