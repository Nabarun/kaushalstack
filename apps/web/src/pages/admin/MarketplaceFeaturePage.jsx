import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { ArrowLeft, IndianRupee, Plus, Sparkles } from 'lucide-react';
import { FEATURES, StatusPill, SubStatusPill, fmtDate } from './MarketplacePage.jsx';

export default function MarketplaceFeaturePage() {
    const { featureId } = useParams();
    const feature = FEATURES.find(f => f.id === featureId);

    const [subs, setSubs] = useState([]);
    const [partners, setPartners] = useState([]);
    const [priceInr, setPriceInr] = useState(1000);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState('');
    const [addId, setAddId] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        setLoading(true);
        adminApi.listFeatureSubscriptions()
            .then(r => {
                setSubs((r.items || []).filter(s => s.feature_id === featureId));
                setPartners(r.partners || []);
                if (r.price_inr) setPriceInr(r.price_inr);
            })
            .catch(err => toast.error(`Failed to load subscriptions: ${err.message}`))
            .finally(() => setLoading(false));
    }, [featureId]);

    function upsertSub(item) {
        setSubs(prev => {
            const i = prev.findIndex(s => s.id === item.id);
            if (i === -1) return [item, ...prev];
            const next = [...prev];
            next[i] = item;
            return next;
        });
    }

    // Partners with no live (non-cancelled) subscription to this feature.
    const availablePartners = useMemo(() => {
        const liveByPartner = new Set(subs.filter(s => s.status !== 'cancelled').map(s => s.partner_id));
        return partners.filter(p => !liveByPartner.has(p.id));
    }, [partners, subs]);

    const activeSubs    = subs.filter(s => s.effective_status === 'active');
    const unpaidSubs    = subs.filter(s => s.effective_status === 'unpaid');
    const cancelledSubs = subs.filter(s => s.effective_status === 'cancelled');
    const liveSubs      = subs.filter(s => s.status !== 'cancelled');

    async function onAdd(e) {
        e.preventDefault();
        const partner = partners.find(p => p.id === addId);
        if (!partner) { toast.error('Pick a partner first'); return; }
        setAdding(true);
        try {
            const r = await adminApi.subscribeFeature(partner.id, featureId);
            upsertSub(r.item);
            setAddId('');
            toast.success(`${partner.name} subscribed to ${feature?.title || featureId}`);
        } catch (err) {
            toast.error(`Subscribe failed: ${err.message}`);
        } finally {
            setAdding(false);
        }
    }

    async function onMarkPaid(sub) {
        setBusyId(sub.id);
        try {
            const r = await adminApi.markSubscriptionPaid(sub.id);
            upsertSub(r.item);
            toast.success(`Payment recorded — paid until ${fmtDate(r.item.paid_until)}`);
        } catch (err) {
            toast.error(`Mark paid failed: ${err.message}`);
        } finally {
            setBusyId('');
        }
    }

    async function onCancel(sub) {
        setBusyId(sub.id);
        try {
            const r = await adminApi.cancelSubscription(sub.id);
            upsertSub(r.item);
            toast.success(`Subscription cancelled for ${r.item.partner_name}`);
        } catch (err) {
            toast.error(`Cancel failed: ${err.message}`);
        } finally {
            setBusyId('');
        }
    }

    async function onResubscribe(sub) {
        setBusyId(sub.id);
        try {
            const r = await adminApi.subscribeFeature(sub.partner_id, featureId);
            upsertSub(r.item);
            toast.success(`${r.item.partner_name} re-subscribed`);
        } catch (err) {
            toast.error(`Re-subscribe failed: ${err.message}`);
        } finally {
            setBusyId('');
        }
    }

    if (!feature) {
        return (
            <>
                <Helmet><title>Marketplace · Admin</title></Helmet>
                <Link to="/admin/marketplace" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
                    <ArrowLeft className="w-4 h-4" /> Marketplace
                </Link>
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No capability called &ldquo;{featureId}&rdquo;.
                    </CardContent>
                </Card>
            </>
        );
    }

    const Icon = feature.icon || Sparkles;

    return (
        <>
            <Helmet><title>{feature.title} · Marketplace · Admin</title></Helmet>

            <Link to="/admin/marketplace" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
                <ArrowLeft className="w-4 h-4" /> Marketplace
            </Link>

            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-semibold">{feature.title}</h1>
                            <StatusPill value={feature.status} />
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                {feature.category}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{feature.description}</p>
                    </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <div className="inline-flex items-center gap-0.5 text-base font-semibold text-foreground">
                        <IndianRupee className="w-4 h-4" />{Number(priceInr).toLocaleString('en-IN')}<span className="text-xs font-normal text-muted-foreground">/month per partner</span>
                    </div>
                    <div className="mt-1">
                        <span className="text-green-600 dark:text-green-400 font-medium">{activeSubs.length} active</span>
                        {unpaidSubs.length > 0 && <span className="text-red-600 dark:text-red-400"> · {unpaidSubs.length} unpaid</span>}
                        {cancelledSubs.length > 0 && <span> · {cancelledSubs.length} cancelled</span>}
                    </div>
                    <div className="mt-0.5 inline-flex items-center gap-0.5 font-medium text-foreground">
                        <IndianRupee className="w-3 h-3" />{(activeSubs.length * priceInr).toLocaleString('en-IN')}/month
                    </div>
                </div>
            </div>

            <Card className="bg-card border mb-6">
                <CardContent className="p-4">
                    <form onSubmit={onAdd} className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-medium">Add a partner</span>
                        <select
                            value={addId}
                            onChange={e => setAddId(e.target.value)}
                            className="flex-1 min-w-48 px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="">
                                {availablePartners.length === 0 ? 'All partners already subscribed' : 'Choose a partner…'}
                            </option>
                            {availablePartners.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <Button type="submit" disabled={adding || !addId}>
                            <Plus className="w-4 h-4 mr-1" /> {adding ? 'Subscribing…' : 'Subscribe'}
                        </Button>
                    </form>
                    <p className="text-xs text-muted-foreground mt-2">
                        Subscribing starts a paid 30-day period at ₹{Number(priceInr).toLocaleString('en-IN')}/month.
                        <strong> Mark paid</strong> extends it 30 days per payment. Lapsed or cancelled subscriptions disappear
                        from the partner&#39;s site.
                    </p>
                </CardContent>
            </Card>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : subs.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No partners on {feature.title} yet — add one above.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-2">
                    {[...liveSubs, ...cancelledSubs].map(sub => {
                        const cancelled = sub.status === 'cancelled';
                        const busy = busyId === sub.id;
                        return (
                            <Card key={sub.id} className={`bg-card border ${cancelled ? 'opacity-60' : ''}`}>
                                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="font-medium text-sm truncate">{sub.partner_name}</div>
                                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                                            <SubStatusPill sub={cancelled ? null : sub} />
                                            {sub.last_paid_at && (
                                                <span className="text-[11px] text-muted-foreground">last paid {fmtDate(sub.last_paid_at)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {cancelled ? (
                                            <Button size="sm" variant="outline" disabled={busy} onClick={() => onResubscribe(sub)}>
                                                Re-subscribe
                                            </Button>
                                        ) : (
                                            <>
                                                <Button size="sm" variant="outline" disabled={busy} onClick={() => onMarkPaid(sub)}>
                                                    Mark paid
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-red-600 dark:text-red-400 hover:text-red-700"
                                                    disabled={busy}
                                                    onClick={() => onCancel(sub)}
                                                >
                                                    Cancel
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </>
    );
}
