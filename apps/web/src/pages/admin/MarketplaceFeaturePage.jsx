import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { ArrowLeft, IndianRupee, Plus, Sparkles, Server, ExternalLink, Trash2, RefreshCw, KeyRound } from 'lucide-react';
import { FEATURES, StatusPill, SubStatusPill, fmtDate } from './MarketplacePage.jsx';

function slugify(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function genPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    const buf = new Uint32Array(14);
    crypto.getRandomValues(buf);
    for (const v of buf) out += chars[v % chars.length];
    return out;
}

// Password reset popup — generates a new password and recreates the portal
// container with it; everything else (URL, data, connections) survives.
function ResetPasswordDialog({ env, onClose }) {
    const [pass, setPass] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (env) { setPass(genPassword()); setDone(false); }
    }, [env]);

    if (!env) return null;

    async function onReset() {
        if (pass.length < 8) { toast.error('Password must be at least 8 characters'); return; }
        setBusy(true);
        try {
            await adminApi.resetEnvironmentPassword(env.partner_id, pass);
            setDone(true);
            toast.success('Password reset — the portal restarted with the new password');
        } catch (err) {
            toast.error(`Reset failed: ${err.message}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={!!env} onOpenChange={open => { if (!open && !busy) onClose(); }}>
            <DialogContent className="bg-card border text-foreground">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-500" /> Reset portal password — {env.slug}
                    </DialogTitle>
                </DialogHeader>
                {done ? (
                    <div className="space-y-3">
                        <p className="text-sm">New credentials for <span className="font-mono">{env.slug}.srv1562298.hstgr.cloud</span>:</p>
                        <div className="rounded-lg border bg-background p-3 text-sm space-y-1">
                            <div><span className="text-muted-foreground">Username:</span> <span className="font-mono">{env.admin_user || 'admin'}</span></div>
                            <div><span className="text-muted-foreground">Password:</span> <span className="font-mono">{pass}</span></div>
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400">
                            Save it now — it is not stored anywhere. Anyone logged into the portal stays logged in; only new logins need the new password.
                        </p>
                        <DialogFooter><Button type="button" onClick={onClose}>Done</Button></DialogFooter>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            The portal restarts with the new password (a few seconds of downtime). Nothing else changes —
                            URL, linked designs, and social connections all survive.
                        </p>
                        <div>
                            <Label htmlFor="reset-pass">New password</Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    id="reset-pass"
                                    value={pass}
                                    onChange={e => setPass(e.target.value)}
                                    className="bg-background border font-mono text-sm"
                                />
                                <Button type="button" size="sm" variant="ghost" title="Generate new password"
                                    onClick={() => setPass(genPassword())}>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                            <Button type="button" onClick={onReset} disabled={busy}>
                                {busy ? 'Resetting…' : 'Reset password'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Environment creation popup — collects everything needed to provision the
// partner's studio portal container on the VPS.
function EnvironmentDialog({ partner, onClose, onCreated }) {
    const [form, setForm] = useState({ slug: '', portal_name: '', admin_user: 'admin', admin_pass: '', session_id: '' });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (partner) {
            setForm({
                slug: slugify(partner.name),
                portal_name: partner.name,
                admin_user: 'admin',
                admin_pass: genPassword(),
                session_id: '',
            });
            setResult(null);
        }
    }, [partner]);

    if (!partner) return null;

    async function onSubmit(e) {
        e.preventDefault();
        if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(form.slug)) {
            toast.error('Subdomain must be 3-30 chars: lowercase letters, digits, hyphens');
            return;
        }
        if (form.admin_pass.length < 8) { toast.error('Password must be at least 8 characters'); return; }
        setBusy(true);
        try {
            const r = await adminApi.createEnvironment(partner.id, form);
            setResult({ ...r.item, admin_pass: form.admin_pass });
            onCreated(r.item);
            toast.success(`Environment created at ${r.item.url}`);
        } catch (err) {
            toast.error(`Provisioning failed: ${err.message}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={!!partner} onOpenChange={open => { if (!open && !busy) onClose(); }}>
            <DialogContent className="bg-card border text-foreground">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-primary" /> Studio environment — {partner.name}
                    </DialogTitle>
                </DialogHeader>

                {result ? (
                    <div className="space-y-3">
                        <p className="text-sm">
                            Environment is up at{' '}
                            <a href={result.url} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                                {result.url.replace('https://', '')}
                            </a>
                            . The HTTPS certificate may take a minute on first load.
                        </p>
                        <div className="rounded-lg border bg-background p-3 text-sm space-y-1">
                            <div><span className="text-muted-foreground">Username:</span> <span className="font-mono">{result.admin_user}</span></div>
                            <div><span className="text-muted-foreground">Password:</span> <span className="font-mono">{result.admin_pass}</span></div>
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400">
                            Save the password now — it is not stored anywhere and cannot be recovered, only reset by recreating the environment.
                        </p>
                        <DialogFooter>
                            <Button type="button" onClick={onClose}>Done</Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="space-y-3">
                        <div>
                            <Label htmlFor="env-slug">Subdomain</Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    id="env-slug"
                                    value={form.slug}
                                    onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                                    className="bg-background border font-mono text-sm"
                                    required
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">.srv1562298.hstgr.cloud</span>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="env-name">Portal display name</Label>
                            <Input
                                id="env-name"
                                value={form.portal_name}
                                onChange={e => setForm({ ...form, portal_name: e.target.value })}
                                className="bg-background border"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="env-user">Admin username</Label>
                                <Input
                                    id="env-user"
                                    value={form.admin_user}
                                    onChange={e => setForm({ ...form, admin_user: e.target.value })}
                                    className="bg-background border"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="env-pass">Password</Label>
                                <div className="flex items-center gap-1">
                                    <Input
                                        id="env-pass"
                                        value={form.admin_pass}
                                        onChange={e => setForm({ ...form, admin_pass: e.target.value })}
                                        className="bg-background border font-mono text-sm"
                                        required
                                    />
                                    <Button type="button" size="sm" variant="ghost" title="Generate new password"
                                        onClick={() => setForm({ ...form, admin_pass: genPassword() })}>
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="env-session">Design session id <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                                id="env-session"
                                value={form.session_id}
                                onChange={e => setForm({ ...form, session_id: e.target.value.trim() })}
                                placeholder="16-character build session to preload in Studio"
                                className="bg-background border font-mono text-sm"
                                pattern="[a-f0-9]{16}"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Provisioning…' : 'Create environment'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

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
    const [environments, setEnvironments] = useState([]);
    const [envFor, setEnvFor] = useState(null);
    const [resetFor, setResetFor] = useState(null);

    const isStudio = featureId === 'studio';

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
        if (featureId === 'studio') {
            adminApi.listEnvironments()
                .then(r => setEnvironments(r.items || []))
                .catch(() => {});
        }
    }, [featureId]);

    const envByPartner = useMemo(
        () => Object.fromEntries(environments.filter(e => e.status !== 'removed').map(e => [e.partner_id, e])),
        [environments],
    );

    async function onRemoveEnv(env) {
        try {
            await adminApi.deleteEnvironment(env.partner_id);
            setEnvironments(prev => prev.filter(e => e.id !== env.id));
            toast.success(`Environment ${env.slug} removed`);
        } catch (err) {
            toast.error(`Remove failed: ${err.message}`);
        }
    }

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
            // Studio without an environment is unusable — offer to create one
            // right away, prefilled from the partner.
            if (isStudio && !envByPartner[partner.id]) setEnvFor(partner);
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
                                            {isStudio && envByPartner[sub.partner_id] && (
                                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                                                    <Server className="w-3 h-3" />
                                                    <a href={envByPartner[sub.partner_id].url} target="_blank" rel="noreferrer" className="hover:underline">
                                                        {envByPartner[sub.partner_id].slug}.srv1562298.hstgr.cloud
                                                    </a>
                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                    <button
                                                        type="button"
                                                        title="Reset portal password"
                                                        onClick={() => setResetFor(envByPartner[sub.partner_id])}
                                                        className="ml-0.5 text-muted-foreground hover:text-amber-600"
                                                    >
                                                        <KeyRound className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Remove environment (portal goes offline)"
                                                        onClick={() => onRemoveEnv(envByPartner[sub.partner_id])}
                                                        className="ml-0.5 text-muted-foreground hover:text-red-600"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {isStudio && !cancelled && !envByPartner[sub.partner_id] && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-sky-500/40 text-sky-600 dark:text-sky-400"
                                                onClick={() => setEnvFor(partners.find(p => p.id === sub.partner_id) || { id: sub.partner_id, name: sub.partner_name })}
                                            >
                                                <Server className="w-3.5 h-3.5 mr-1" /> Create environment
                                            </Button>
                                        )}
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

            <EnvironmentDialog
                partner={envFor}
                onClose={() => setEnvFor(null)}
                onCreated={env => setEnvironments(prev => [env, ...prev.filter(e => e.id !== env.id)])}
            />

            <ResetPasswordDialog env={resetFor} onClose={() => setResetFor(null)} />
        </>
    );
}
