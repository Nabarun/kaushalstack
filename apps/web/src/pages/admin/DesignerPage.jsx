import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { platformApi } from '@/lib/designerAdminApi';
import { toast } from 'sonner';
import {
    Palette, RefreshCw, Lock, Unlock, Trash2, ExternalLink, Globe, Link2,
    ShieldAlert, Clock, Users, FolderKanban, Inbox, Image as ImageIcon, HardDrive, Download, Mail, StickyNote, Archive, Wallet,
} from 'lucide-react';

// Admin → Designer. Every company on designer.kaushalstack.com, with the
// operator actions that used to need SSH: lock/unlock (payment), delete,
// resend verification, website-connection state, integrations, audit trail.

const fmtRetention = (d) => (!d ? '—' : d < 2 ? `${Math.round(d * 24)} hours` : `${d} days`);
const fmtBytes = (n) => {
    if (!n) return '0 MB';
    const mb = n / 1048576;
    return mb < 1024 ? `${mb.toFixed(mb < 10 ? 1 : 0)} MB` : `${(mb / 1024).toFixed(2)} GB`;
};
// Timestamps arrive three ways: registry rows as "YYYY-MM-DD HH:MM:SS" (UTC),
// ISO strings, and Prisma DateTimes as epoch milliseconds.
const toDate = (v) => {
    if (!v) return null;
    if (typeof v === 'number') return new Date(v);
    const s = String(v);
    return new Date(/^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(' ', 'T') + 'Z' : s);
};
const fmtDate = (v) => {
    const d = toDate(v);
    return d && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
};
const fmtWhen = (v) => {
    const d = toDate(v);
    return d && !isNaN(d) ? d.toLocaleString('en-IN') : '—';
};
const ago = (v) => {
    const d = toDate(v);
    if (!d || isNaN(d)) return 'never';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return fmtDate(v);
};

function StatusBadge({ w }) {
    if (w.status === 'suspended') return <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" variant="outline"><Lock className="w-3 h-3 mr-1" />Locked</Badge>;
    if (w.status === 'pending' || w.status === 'verified') return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" variant="outline"><Clock className="w-3 h-3 mr-1" />{w.status === 'verified' ? 'Awaiting mandate' : 'Pending email'}</Badge>;
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" variant="outline">Active</Badge>;
}

const TIER_LABEL = { starter: 'Starter', growth: 'Growth', advance: 'Advanced' };
function BillingBadge({ w }) {
    const b = w.billing;
    const tier = TIER_LABEL[w.tier] || w.tier || '—';
    if (!b) return <Badge variant="outline">{tier}</Badge>;
    if (b.exempt) return <Badge variant="outline" title="Billing exempt (grandfathered / courtesy)">{tier} · exempt</Badge>;
    const tone = b.state === 'full' ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : b.state === 'grace' ? 'border-amber-500/30 text-amber-700 dark:text-amber-400' : 'border-red-500/30 text-red-600 dark:text-red-400';
    const status = b.status === 'trialing' ? 'trial' : b.state === 'locked' ? 'unpaid · paused' : b.state === 'grace' ? 'grace' : (b.status || '').replace('_', ' ');
    return <Badge variant="outline" className={tone} title={b.message || ''}>{tier} · {b.cadence || ''} {status}</Badge>;
}

function RouteBadge({ state, tls }) {
    // Route = the Traefik file is on disk; TLS = the host actually serves a
    // trusted certificate. A route with a bad certificate is what a customer
    // sees as a browser security warning, so it outranks "route ok".
    const map = {
        ok: ['Route ok', 'bg-emerald-500'],
        stale: ['Route stale', 'bg-amber-500'],
        missing: ['Route missing', 'bg-red-500'],
        disabled: ['Routing off', 'bg-muted-foreground/40'],
    };
    let [label, dot] = map[state] || ['Unknown', 'bg-muted-foreground/40'];
    let title = `Traefik route file: ${state}`;
    if (state === 'ok' && tls === 'ok') { label = 'Domain live'; title += ' · certificate trusted'; }
    else if (tls === 'expiring') { label = 'Certificate expiring'; dot = 'bg-amber-500'; title += ' · certificate expires in under 14 days — renewal may have failed'; }
    else if (tls === 'invalid') { label = 'Certificate invalid'; dot = 'bg-red-500'; title += ' · host serves an untrusted certificate (ACME failed or pending)'; }
    else if (tls === 'unreachable') { label = 'Host unreachable'; dot = 'bg-red-500'; title += ' · TLS probe could not connect'; }
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={title}><span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />{label}</span>;
}

function Stat({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto font-medium tabular-nums">{value}</span>
        </div>
    );
}

const PRODUCTS = {
    designer: { key: 'designer', title: 'Designer', noun: 'company', nouns: 'companies', fallbackHost: 'designer.kaushalstack.com', intro: 'Lock for non-payment, remove, resend verification, and see what each one is using.', stats: (s) => [`${s.customers} clients · ${s.projects} projects · ${s.inquiries} enquiries`, `${s.photos} photos · ${fmtBytes(s.bytes)}`] },
    connections: { key: 'connections', title: 'Connections', noun: 'organisation', nouns: 'organisations', fallbackHost: 'connections.kaushalstack.com', intro: 'WhatsApp contact organizer organisations: seats, sync state, billing, locks.', stats: (s) => [`${s.seats} seat${s.seats === 1 ? '' : 's'} (${s.linked} linked) · ${s.contacts.toLocaleString('en-IN')} contacts`, `${s.groups} groups · ${s.messages.toLocaleString('en-IN')} messages`] },
};

export default function DesignerPage({ product = 'designer' }) {
    const P = PRODUCTS[product] || PRODUCTS.designer;
    const designerApi = useMemo(() => platformApi(P.key), [P.key]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null); // slug
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState('');
    const [lockOpen, setLockOpen] = useState(false);
    const [lockReason, setLockReason] = useState('Payment overdue');
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [verifyLink, setVerifyLink] = useState('');
    const [notes, setNotes] = useState('');
    const [template, setTemplate] = useState('payment-reminder');

    async function load() {
        setLoading(true);
        setError('');
        try {
            setData(await designerApi.list());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }
    async function openDetail(slug) {
        setSelected(slug);
        setDetail(null);
        setVerifyLink('');
        try {
            const d = await designerApi.get(slug);
            setDetail(d);
            setNotes(d.notes || '');
        } catch (err) {
            toast.error(`Could not load ${slug}: ${err.message}`);
            setSelected(null);
        }
    }
    useEffect(() => { load(); }, []);

    const rows = useMemo(() => {
        const list = data?.workspaces || [];
        const q = query.trim().toLowerCase();
        return q
            ? list.filter((w) => [w.slug, w.name, w.email, w.phone].some((v) => (v || '').toLowerCase().includes(q)))
            : list;
    }, [data, query]);
    const counts = useMemo(() => {
        const list = data?.workspaces || [];
        return {
            total: list.length,
            active: list.filter((w) => w.status === 'active').length,
            locked: list.filter((w) => w.status === 'suspended').length,
            pending: list.filter((w) => w.status === 'pending' || w.status === 'verified').length,
        };
    }, [data]);

    async function act(slug, action, extra = '', okMessage = 'Done') {
        setBusy(action);
        try {
            const r = await designerApi.act(slug, action, extra);
            toast.success(okMessage);
            if (r?.link) setVerifyLink(r.link);
            if (r?.workspace) setDetail((d) => (d ? { ...d, ...r.workspace } : r.workspace));
            await load();
            return r;
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusy('');
        }
    }

    async function doDelete() {
        if (!detail || deleteConfirm !== detail.slug) return;
        setBusy('delete');
        try {
            const r = await designerApi.remove(detail.slug, deleteConfirm);
            toast.success(`${detail.slug} removed. Archive kept for ${fmtRetention(data?.retentionDays || 1)}.`);
            setDeleteOpen(false);
            setSelected(null);
            setDetail(null);
            setDeleteConfirm('');
            await load();
            if (r?.archive) toast.message('Archive kept until ' + fmtDate(r.purgeAt), { description: r.archive });
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusy('');
        }
    }

    const host = data?.platformHost || P.fallbackHost;

    return (
        <div className="space-y-6">
            <Helmet><title>{P.title} · Admin</title></Helmet>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2"><Palette className="w-6 h-6" /> {P.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {P.nouns[0].toUpperCase() + P.nouns.slice(1)} on <a className="underline underline-offset-2" href={`https://${host}`} target="_blank" rel="noreferrer">{host}</a>. {P.intro}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${P.noun}, owner…`} className="w-56" />
                    <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[[P.nouns[0].toUpperCase() + P.nouns.slice(1), counts.total], ['Active', counts.active], ['Locked', counts.locked], ['Pending setup', counts.pending]].map(([l, v]) => (
                    <Card key={l}><CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">{l}</div>
                        <div className="text-2xl font-semibold tabular-nums">{v}</div>
                    </CardContent></Card>
                ))}
            </div>

            {error && (
                <Card className="border-red-500/40"><CardContent className="p-4 flex items-start gap-3 text-sm">
                    <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                    <div><div className="font-medium">Designer is not reachable</div><div className="text-muted-foreground">{error}</div></div>
                </CardContent></Card>
            )}

            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                            <tr>
                                <th className="text-left px-4 py-3">{P.noun[0].toUpperCase() + P.noun.slice(1)}</th>
                                <th className="text-left px-4 py-3">Owner</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Plan</th>
                                <th className="text-left px-4 py-3">Usage</th>
                                <th className="text-left px-4 py-3">Last activity</th>
                                <th className="text-left px-4 py-3">Since</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !data && (
                                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Loading {P.nouns}…</td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">{query ? `No ${P.noun} matches that search.` : `No ${P.nouns} yet.`}</td></tr>
                            )}
                            {rows.map((w) => (
                                <tr key={w.slug} className="border-b last:border-0 hover:bg-accent/30 cursor-pointer" onClick={() => openDetail(w.slug)}>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{w.name}</div>
                                        <div className="text-xs text-muted-foreground">{w.host}</div>
                                        <RouteBadge state={w.route} tls={w.tls} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div>{w.email}</div>
                                        <div className="text-xs text-muted-foreground">{w.phone || '—'}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge w={w} />
                                        {w.status === 'suspended' && w.lockReason && <div className="text-xs text-muted-foreground mt-1 max-w-[180px] truncate" title={w.lockReason}>{w.lockReason}</div>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <BillingBadge w={w} />
                                        {w.billing?.currentPeriodEnd && !w.billing.exempt && <div className="text-xs text-muted-foreground mt-1">{w.billing.status === 'trialing' ? 'trial ends' : 'period ends'} {fmtDate(w.billing.currentPeriodEnd)}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {P.stats(w.stats)[0]}
                                        <div>{P.stats(w.stats)[1]}</div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">{ago(w.stats.lastActivity)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(w.createdAt)}</td>
                                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        {w.status === 'active' && (
                                            <Button size="sm" variant="outline" onClick={() => { openDetail(w.slug); setLockOpen(true); }}>
                                                <Lock className="w-3.5 h-3.5 mr-1" /> Lock
                                            </Button>
                                        )}
                                        {w.status === 'suspended' && (
                                            <Button size="sm" onClick={() => act(w.slug, 'unlock', '', `${w.slug} unlocked`)} disabled={busy === 'unlock'}>
                                                <Unlock className="w-3.5 h-3.5 mr-1" /> Unlock
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {(data?.trash || []).length > 0 && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-sm font-medium"><Archive className="w-4 h-4" /> Recently deleted</div>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-3">Each deletion keeps one archive for {fmtRetention(data.retentionDays)}, then it is purged automatically. Restore from the archive on the server before then.</p>
                        <div className="divide-y text-sm">
                            {data.trash.map((t) => (
                                <div key={t.id} className="py-2 flex flex-wrap gap-x-4 gap-y-1 items-center">
                                    <span className="font-medium">{t.name}</span>
                                    <span className="text-muted-foreground">{t.slug} · {t.email}</span>
                                    <span className="text-muted-foreground">deleted {fmtDate(t.deletedAt)} by {t.actor.replace(/^operator:/, '')}</span>
                                    <span className="ml-auto text-xs">
                                        {t.purgedAt ? <Badge variant="outline">purged {fmtDate(t.purgedAt)}</Badge>
                                            : t.retained ? <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">archive kept · purges {fmtWhen(t.purgeAt)} · {fmtBytes(t.bytes)}</Badge>
                                            : <Badge variant="outline" className="border-red-500/40 text-red-600">archive missing</Badge>}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Company detail */}
            <Dialog open={Boolean(selected) && !lockOpen && !deleteOpen} onOpenChange={(o) => { if (!o) { setSelected(null); setDetail(null); } }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {!detail ? (
                        <DialogHeader><DialogTitle>Loading…</DialogTitle></DialogHeader>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">{detail.name} <StatusBadge w={detail} /></DialogTitle>
                                <DialogDescription>
                                    <a href={`https://${detail.host}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 inline-flex items-center gap-1">{detail.host} <ExternalLink className="w-3 h-3" /></a>
                                    {' · '}<a href={`https://${detail.host}/admin`} target="_blank" rel="noreferrer" className="underline underline-offset-2">their admin</a>
                                    {' · owner '}<a href={`mailto:${detail.email}`} className="underline underline-offset-2">{detail.email}</a>{detail.phone ? ` · ${detail.phone}` : ''}
                                </DialogDescription>
                            </DialogHeader>

                            {detail.status === 'suspended' && (
                                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm">
                                    <div className="font-medium flex items-center gap-2"><Lock className="w-4 h-4" /> Locked {detail.lockedAt ? `on ${fmtDate(detail.lockedAt)}` : ''}</div>
                                    <div className="text-muted-foreground mt-0.5">{detail.lockReason || 'No reason recorded'} — their whole address shows an “access paused” page.</div>
                                </div>
                            )}

                            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                                {P.key === 'designer' ? (<>
                                <Stat icon={Users} label="Clients" value={detail.stats.customers} />
                                <Stat icon={FolderKanban} label="Projects" value={detail.stats.projects} />
                                <Stat icon={Inbox} label="Enquiries" value={detail.stats.inquiries} />
                                <Stat icon={ImageIcon} label="Gallery photos" value={detail.stats.photos} />
                                <Stat icon={HardDrive} label="Storage" value={fmtBytes(detail.stats.bytes)} />
                                <Stat icon={Clock} label="Last activity" value={ago(detail.stats.lastActivity)} />
                                <Stat icon={Users} label="Admin accounts" value={detail.stats.admins} />
                                </>) : (<>
                                <Stat icon={Users} label="Seats (WhatsApp accounts)" value={`${detail.stats.seats} (${detail.stats.linked} linked)`} />
                                <Stat icon={Inbox} label="Contacts" value={detail.stats.contacts.toLocaleString('en-IN')} />
                                <Stat icon={FolderKanban} label="Groups" value={detail.stats.groups} />
                                <Stat icon={HardDrive} label="Messages mirrored" value={detail.stats.messages.toLocaleString('en-IN')} />
                                <Stat icon={Clock} label="Last sync" value={ago(detail.stats.lastSync)} />
                                </>)}
                                <Stat icon={Globe} label="Domain route" value={`${detail.route}${detail.tls ? ` · cert ${detail.tls}` : ''}`} />
                                <Stat icon={Archive} label="Last backup" value={detail.lastBackup ? fmtDate(detail.lastBackup) : 'never'} />
                            </div>

                            {P.key === 'designer' && <div className="rounded-md border p-3 text-sm space-y-1.5">
                                <div className="font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Own website</div>
                                {detail.websiteStatus === 'connected' && <div>Connected: <a href={detail.website} target="_blank" rel="noreferrer" className="underline">{detail.website}</a></div>}
                                {detail.websiteStatus === 'requested' && <div>Requested {ago(detail.websiteRequestedAt)}: <a href={detail.website} target="_blank" rel="noreferrer" className="underline">{detail.website}</a> — add the analytics snippet, then mark connected.</div>}
                                {!detail.websiteStatus && <div className="text-muted-foreground">Not connected. They can request it from their Analytics tab.</div>}
                                <div className="flex gap-2 pt-1">
                                    {detail.websiteStatus !== 'connected' && detail.website && <Button size="sm" variant="outline" disabled={busy === 'website-connected'} onClick={() => act(detail.slug, 'website-connected', '', 'Marked website connected')}>Mark connected</Button>}
                                    {detail.websiteStatus === 'connected' && <Button size="sm" variant="outline" disabled={busy === 'website-disconnect'} onClick={() => act(detail.slug, 'website-disconnect', '', 'Website disconnected')}>Disconnect</Button>}
                                </div>
                            </div>}

                            <div className="rounded-md border p-3 text-sm space-y-2">
                                <div className="font-medium flex items-center gap-2"><Wallet className="w-4 h-4" /> Plan & billing</div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <BillingBadge w={detail} />
                                    {detail.billing?.message && !detail.billing.exempt && <span className="text-xs text-muted-foreground">{detail.billing.message}</span>}
                                </div>
                                {detail.subscription && (
                                    <div className="text-xs text-muted-foreground">
                                        {TIER_LABEL[detail.subscription.tier]} · {detail.subscription.cadence} · {detail.subscription.status} · autopay {detail.subscription.autopay ? 'on' : 'off'} · period {fmtDate(detail.subscription.currentPeriodStart)} → {fmtDate(detail.subscription.currentPeriodEnd)}
                                        {detail.subscription.gstin ? ` · GSTIN ${detail.subscription.gstin}` : ''}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-xs text-muted-foreground">Tier:</span>
                                    {['starter', 'growth', 'advance'].map((t) => (
                                        <Button key={t} size="sm" variant={detail.tier === t ? 'default' : 'outline'} disabled={busy === 'set-tier' || detail.tier === t} onClick={() => act(detail.slug, 'set-tier', { tier: t }, `Tier set to ${TIER_LABEL[t]}`)}>{TIER_LABEL[t]}</Button>
                                    ))}
                                    <Button size="sm" variant="outline" className="ml-auto" disabled={busy === 'billing-exempt'} onClick={() => act(detail.slug, 'billing-exempt', { exempt: !detail.billingExempt }, detail.billingExempt ? 'Billing switched on' : 'Marked billing-exempt')}>
                                        {detail.billingExempt ? 'Start billing this company' : 'Mark billing-exempt'}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">Setting the tier here changes what the company can use; it does not charge them. Payments and plan changes the company makes itself appear below.</p>
                                {(detail.payments || []).length > 0 && (
                                    <div className="max-h-32 overflow-y-auto rounded border divide-y text-xs mt-1">
                                        {detail.payments.map((p) => (
                                            <div key={p.id} className="px-2 py-1 flex gap-3"><span className="font-mono">{p.invoiceNumber}</span><span>{TIER_LABEL[p.tier]} · {p.cadence}</span><span className="ml-auto">{fmtDate(p.paidAt)} · ₹{(p.totalPaise / 100).toLocaleString('en-IN')}</span></div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-md border p-3 text-sm space-y-2">
                                <div className="font-medium flex items-center gap-2"><StickyNote className="w-4 h-4" /> Notes (operator only)</div>
                                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} placeholder="Billing arrangement, who to call, anything the next operator should know." />
                                <div className="flex justify-end">
                                    <Button size="sm" variant="outline" disabled={busy === 'note' || notes === (detail.notes || '')} onClick={() => act(detail.slug, 'note', { notes }, 'Notes saved')}>Save notes</Button>
                                </div>
                            </div>

                            <div className="rounded-md border p-3 text-sm space-y-2">
                                <div className="font-medium flex items-center gap-2"><Mail className="w-4 h-4" /> Email the owner</div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <select value={template} onChange={(e) => setTemplate(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                                        {(data?.emailTemplates || []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                    <Button size="sm" variant="outline" disabled={busy === 'email-owner'} onClick={() => act(detail.slug, 'email-owner', { template }, `Emailed ${detail.email}`)}>Send to {detail.email}</Button>
                                    <span className="text-xs text-muted-foreground">Templated, no free text; every send is in the audit trail.</span>
                                </div>
                            </div>

                            {P.key === 'designer' && <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline">Varanan {detail.integrations?.varanan ? 'on' : 'off'}</Badge>
                                <Badge variant="outline">KaushalStack metering {detail.integrations?.kaushalstack ? 'on' : 'off'}</Badge>
                            </div>}

                            <div className="flex flex-wrap gap-2">
                                {detail.status === 'active' && <Button size="sm" variant="outline" onClick={() => setLockOpen(true)}><Lock className="w-3.5 h-3.5 mr-1" /> Lock access</Button>}
                                {detail.status === 'suspended' && <Button size="sm" disabled={busy === 'unlock'} onClick={() => act(detail.slug, 'unlock', '', `${detail.slug} unlocked`)}><Unlock className="w-3.5 h-3.5 mr-1" /> Unlock</Button>}
                                {(detail.status === 'pending' || detail.status === 'verified') && <Button size="sm" variant="outline" disabled={busy === 'verification-link'} onClick={() => act(detail.slug, 'verification-link', '', 'New verification link issued')}>New verification link</Button>}
                                {(detail.route !== 'ok' || detail.tls === 'invalid' || detail.tls === 'expiring') && <Button size="sm" variant="outline" disabled={busy === 'publish-route'} onClick={() => act(detail.slug, 'publish-route', '', 'Route re-published')}>Re-publish domain</Button>}
                                {P.key === 'designer' && <Button size="sm" variant="outline" disabled={busy === 'integrate-varanan'} onClick={() => act(detail.slug, 'integrate-varanan', '', 'Varanan re-synced')}>Re-sync Varanan</Button>}
                                {P.key === 'designer' && <Button size="sm" variant="outline" disabled={busy === 'export'} onClick={async () => { setBusy('export'); try { const n = await designerApi.download(detail.slug); toast.success(`Downloading ${n}`); } catch (e) { toast.error(e.message); } finally { setBusy(''); } }}><Download className="w-3.5 h-3.5 mr-1" /> Export data</Button>}
                                {P.key === 'designer' && <Button size="sm" variant="destructive" className="ml-auto" onClick={() => setDeleteOpen(true)}><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>}
                            </div>
                            {verifyLink && (
                                <div className="rounded-md border p-3 text-xs break-all">
                                    <div className="font-medium mb-1">{P.key === 'designer' ? 'Single-use verification link' : 'Setup link (7 days)'} — send privately to {detail.email}</div>
                                    <code>{verifyLink}</code>
                                    <div className="mt-2"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(verifyLink); toast.success('Copied'); }}>Copy</Button></div>
                                </div>
                            )}

                            <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Audit trail</div>
                                <div className="max-h-56 overflow-y-auto rounded-md border divide-y text-xs">
                                    {(detail.audit || []).map((a, i) => (
                                        <div key={i} className="px-3 py-1.5 flex gap-3">
                                            <span className="text-muted-foreground whitespace-nowrap">{fmtWhen(a.createdAt)}</span>
                                            <span className="flex-1">{a.action}</span>
                                            <span className="text-muted-foreground truncate max-w-[160px]" title={a.actor}>{a.actor}</span>
                                        </div>
                                    ))}
                                    {!(detail.audit || []).length && <div className="px-3 py-3 text-muted-foreground">Nothing recorded yet.</div>}
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Lock */}
            <Dialog open={lockOpen} onOpenChange={setLockOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Lock {detail?.name || selected}</DialogTitle>
                        <DialogDescription>
                            Visitors and their clients see only “temporarily unavailable” (a 503, so search engines wait rather than de-index). The owner can still sign in and sees the real reason below. APIs and admin answer 423. Nothing is deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Reason (recorded in the audit trail)</label>
                        <Input value={lockReason} onChange={(e) => setLockReason(e.target.value)} placeholder="Payment overdue" maxLength={200} />
                        <div className="flex gap-2 flex-wrap">
                            {['Payment overdue', 'Invoice unpaid 30+ days', 'Terms breach — under review'].map((r) => (
                                <button key={r} type="button" className="text-xs px-2 py-1 rounded border hover:bg-accent" onClick={() => setLockReason(r)}>{r}</button>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLockOpen(false)}>Cancel</Button>
                        <Button variant="destructive" disabled={busy === 'lock' || !selected} onClick={async () => { await act(selected, 'lock', lockReason, `${selected} locked`); setLockOpen(false); }}>
                            <Lock className="w-4 h-4 mr-1" /> Lock access
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete */}
            <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(''); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {detail?.name}</DialogTitle>
                        <DialogDescription>
                            Removes the company from the platform: its address stops answering and it disappears from this list. A full archive of its database and files is kept on the server for {fmtRetention(data?.retentionDays || 1)} (see “Recently deleted”), then purged automatically. Type <code className="font-mono">{detail?.slug}</code> to confirm.
                        </DialogDescription>
                    </DialogHeader>
                    <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={detail?.slug} autoFocus />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" disabled={busy === 'delete' || !detail || deleteConfirm !== detail.slug} onClick={doDelete}>
                            <Trash2 className="w-4 h-4 mr-1" /> Delete company
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
