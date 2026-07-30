// Customers — the merged Businesses + Teams view.
//
// A customer company could previously appear twice in the admin: once as a
// `partner` (portal, agent team, tokens, marketplace) under "Teams" and once
// as a `business` (competitor scan, growth reports) under "Businesses", with
// no link between the two collections. This page lists each company once and
// shows whichever facets it has. The collections stay separate on the API
// side — they back different machinery (growth-scheduler vs credit caps and
// portal provisioning) — so facets are matched here by normalized name.

import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { fmt$, fmtN, fmtRelative } from '@/lib/adminFormat';
import { mergeCustomers } from '@/lib/mergeCustomers';
import { PartnerStatsPanel, RoundTableStatsPanel } from '@/components/admin/PlatformStats';
import { TeamGrid } from '@/components/admin/TeamGrid';
import { toast } from 'sonner';
import {
    Plus, Users, Mail, Globe, Search, Activity, DollarSign, Clock, Coins, Trash2,
    ChevronDown, ChevronRight, ExternalLink, LineChart, Building2,
} from 'lucide-react';

// Business team JSON stores the role under `name`; partner rows arrive from
// the API already normalized. Level them so TeamGrid renders either.
function normalizeTeam(team) {
    if (!Array.isArray(team)) return [];
    return team.map(m => ({
        ...m,
        agent_name: m.agent_name || m.name || '—',
        role: m.role || m.name || '',
    }));
}

function UsagePills({ usage }) {
    const active = (usage?.calls || 0) > 0;
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span
                title="Total LLM calls attributed to this partner"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] tabular-nums ${active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
            >
                <Activity className="w-3 h-3" /> {fmtN(usage?.calls)} calls
            </span>
            <span
                title="Total spend on this partner"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] tabular-nums ${active ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}
            >
                <DollarSign className="w-3 h-3" /> {fmt$(usage?.cost_usd)}
            </span>
            <span
                title={usage?.last_active ? new Date(usage.last_active).toLocaleString() : 'No activity yet'}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${active ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}
            >
                <Clock className="w-3 h-3" /> {fmtRelative(usage?.last_active)}
            </span>
        </div>
    );
}

// 1 token = $0.01 of credit cap — mirrors USD_PER_TOKEN on the api side.
function tok(usd) { return Math.round(Number(usd || 0) * 100); }

function TokensDialog({ partner, onClose, onGranted }) {
    const [info, setInfo] = useState(null);
    const [tokens, setTokens] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [revokeId, setRevokeId] = useState('');

    useEffect(() => {
        if (!partner) return;
        setInfo(null);
        adminApi.getPartnerCredits(partner.id)
            .then(setInfo)
            .catch(err => toast.error(`Failed to load credits: ${err.message}`));
    }, [partner]);

    if (!partner) return null;

    const usedTokens = tok(partner.usage?.cost_usd);
    const capTokens = info ? info.tokens_cap : tok(partner.credit_cap_usd);
    const remaining = Math.max(0, capTokens - usedTokens);

    async function onRevoke(grant) {
        setBusy(true);
        try {
            const r = await adminApi.revokePartnerGrant(partner.id, grant.id);
            setInfo(prev => ({
                credit_cap_usd: r.credit_cap_usd,
                tokens_cap: r.tokens_cap,
                grants: (prev?.grants || []).filter(g => g.id !== grant.id),
            }));
            onGranted(partner.id, r.credit_cap_usd);
            toast.success(`Removed ${Number(grant.tokens).toLocaleString()} tokens — cap is now ${r.tokens_cap.toLocaleString()}`);
        } catch (err) {
            toast.error(`Remove failed: ${err.message}`);
        } finally {
            setBusy(false);
            setRevokeId('');
        }
    }

    async function onGrant(e) {
        e.preventDefault();
        const n = Math.round(Number(tokens));
        if (!Number.isFinite(n) || n <= 0) { toast.error('Enter a positive token amount'); return; }
        setBusy(true);
        try {
            const r = await adminApi.grantPartnerTokens(partner.id, n, note.trim());
            setInfo(prev => ({
                credit_cap_usd: r.credit_cap_usd,
                tokens_cap: r.tokens_cap,
                grants: r.grant ? [r.grant, ...(prev?.grants || [])] : (prev?.grants || []),
            }));
            onGranted(partner.id, r.credit_cap_usd);
            setTokens('');
            setNote('');
            toast.success(`${n.toLocaleString()} tokens added — cap is now ${r.tokens_cap.toLocaleString()} tokens`);
        } catch (err) {
            toast.error(`Grant failed: ${err.message}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={!!partner} onOpenChange={open => { if (!open && !busy) onClose(); }}>
            <DialogContent className="bg-card border text-foreground">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-amber-500" /> Tokens — {partner.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border bg-background p-3">
                        <div className="text-lg font-semibold tabular-nums">{capTokens.toLocaleString()}</div>
                        <div className="text-[11px] text-muted-foreground">Assigned</div>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                        <div className="text-lg font-semibold tabular-nums">{usedTokens.toLocaleString()}</div>
                        <div className="text-[11px] text-muted-foreground">Used</div>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                        <div className={`text-lg font-semibold tabular-nums ${remaining === 0 && capTokens > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {capTokens === 0 ? '∞' : remaining.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{capTokens === 0 ? 'Uncapped' : 'Remaining'}</div>
                    </div>
                </div>

                <form onSubmit={onGrant} className="space-y-3">
                    <div>
                        <Label htmlFor="grant-tokens">Tokens to add</Label>
                        <Input
                            id="grant-tokens"
                            type="number"
                            min="1"
                            step="1"
                            value={tokens}
                            onChange={e => setTokens(e.target.value)}
                            placeholder="e.g., 1000"
                            className="bg-background border"
                            autoFocus
                        />
                        {Number(tokens) > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                = ${(Number(tokens) * 0.01).toFixed(2)} of credit cap
                            </p>
                        )}
                    </div>
                    <div>
                        <Label htmlFor="grant-note">Payment note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                            id="grant-note"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="e.g., ₹1000 received via UPI, 22 Jul"
                            className="bg-background border"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
                        <Button type="submit" disabled={busy || !tokens}>
                            {busy ? 'Adding…' : 'Add tokens'}
                        </Button>
                    </DialogFooter>
                </form>

                {info?.grants?.length > 0 && (
                    <div className="border-t pt-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent top-ups</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {info.grants.slice(0, 8).map(g => (
                                <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="tabular-nums font-medium">+{Number(g.tokens).toLocaleString()}</span>
                                    <span className="text-muted-foreground truncate flex-1">{g.note || '—'}</span>
                                    <span className="text-muted-foreground flex-shrink-0">{fmtRelative(g.created)}</span>
                                    {revokeId === g.id ? (
                                        <span className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => onRevoke(g)}
                                                className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-medium disabled:opacity-50"
                                            >
                                                {busy ? '…' : 'Remove'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => setRevokeId('')}
                                                className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]"
                                            >
                                                Keep
                                            </button>
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            title="Remove this top-up (lowers the cap by its amount)"
                                            onClick={() => setRevokeId(g.id)}
                                            className="p-0.5 rounded text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Every private (partner-scoped) agent and who it works for. Attribution
// precedence lives server-side; `via` says how the link was resolved so an
// unassigned agent is visible instead of silently guessed.
function PrivateAgentsPanel() {
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        adminApi.listPrivateSkills()
            .then(setData)
            .catch(() => setData({ items: [], totals: { total: 0, assigned: 0, unassigned: 0 } }));
    }, []);

    if (!data || data.totals.total === 0) return null;
    const { items, totals } = data;

    return (
        <Card className="mt-6">
            <CardContent className="p-4">
                <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(v => !v)}>
                    {open ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    <span className="font-semibold">Private agents</span>
                    <span className="text-xs text-muted-foreground">
                        {totals.total} agents · {totals.assigned} attributed
                        {totals.unassigned > 0 ? ` · ${totals.unassigned} unassigned` : ''}
                    </span>
                </button>

                {open && (
                    <div className="mt-4 rounded-xl border overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Agent</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Skill</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Working for</th>
                                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Since</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.map(i => (
                                    <tr key={i.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{i.agent_name}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{i.skill_name}</td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            {i.partner ? (
                                                <span
                                                    title={i.via === 'business'
                                                        ? `Linked through business "${i.business_name}"`
                                                        : i.via === 'team'
                                                            ? "Linked by matching the partner's team roster"
                                                            : 'Directly attributed (partner_id)'}
                                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                                                >
                                                    {i.partner.name}
                                                    <span className="text-[10px] uppercase tracking-wide opacity-70">{i.via}</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                                    unassigned
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">{fmtRelative(i.created)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function FacetBadge({ icon: Icon, label, title }) {
    return (
        <span
            title={title}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-primary/10 text-primary"
        >
            <Icon className="w-3 h-3" /> {label}
        </span>
    );
}

function CustomerRow({ row, defaultOpen, onRemove, onTokens }) {
    const { partner, business } = row;
    const team = useMemo(
        () => normalizeTeam(partner?.team?.length ? partner.team : business?.team),
        [partner, business],
    );
    const [open, setOpen] = useState(!!defaultOpen);
    const hasTeam = team.length > 0;
    const website = partner?.website || business?.website_url || '';

    return (
        <Card className="bg-card border overflow-hidden">
            <button
                type="button"
                onClick={() => hasTeam && setOpen(v => !v)}
                className={`w-full flex items-start justify-between p-4 text-left gap-3 ${hasTeam ? 'hover:bg-muted/30 transition-colors cursor-pointer' : 'cursor-default'}`}
            >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base truncate">{row.name}</span>
                            {partner && <FacetBadge icon={Building2} label="Portal" title="Has a partner portal: agent team, tokens, marketplace" />}
                            {business && <FacetBadge icon={LineChart} label="Growth reports" title="Has competitor scanning and scheduled growth reports" />}
                            {partner && partner.status !== 'active' && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {partner.status}
                                </span>
                            )}
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                            {partner && (partner.owner ? (
                                <span className="inline-flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    <span className="truncate">{partner.owner.email || partner.owner.name}</span>
                                </span>
                            ) : (
                                <span className="italic">no owner</span>
                            ))}
                            {website && (
                                <a
                                    href={website}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                    <Globe className="w-3 h-3" />
                                    <span className="truncate">{website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                                </a>
                            )}
                            {hasTeam && <span>· {team.length} {team.length === 1 ? 'agent' : 'agents'}</span>}
                        </div>

                        {business && (
                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1 flex-wrap">
                                <Link
                                    to={`/admin/businesses/${business.id}`}
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                    Growth reports <ExternalLink className="w-3 h-3" />
                                </Link>
                                <span>{(business.competitors || []).length} competitors</span>
                                <span>Daily @ {String(business.schedule_hour ?? 6).padStart(2, '0')}:00 UTC</span>
                                <span>{business.active ? 'Active' : 'Paused'}</span>
                                <span>{business.last_run_at ? `Last run ${fmtRelative(business.last_run_at)}` : 'Never run'}</span>
                            </div>
                        )}

                        {partner && (
                            <div className="mt-2">
                                <UsagePills usage={partner.usage} />
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-1 flex-shrink-0 flex items-center gap-2">
                    {partner && (
                        <>
                            <span
                                role="button"
                                title={`Assign tokens to ${partner.name}`}
                                onClick={(e) => { e.stopPropagation(); onTokens(partner); }}
                                className="p-1 rounded text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                            >
                                <Coins className="w-4 h-4" />
                            </span>
                            <span
                                role="button"
                                title={`Remove ${partner.name}`}
                                onClick={(e) => { e.stopPropagation(); onRemove(partner); }}
                                className="p-1 rounded text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </span>
                        </>
                    )}
                    {hasTeam && (open
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                </div>
            </button>

            {open && hasTeam && (
                <CardContent className="border-t pt-4 pb-4 bg-muted/10">
                    <TeamGrid team={team} />
                </CardContent>
            )}
        </Card>
    );
}

const SORTS = [
    { key: 'name',        label: 'Name' },
    { key: 'last_active', label: 'Last active' },
    { key: 'calls',       label: 'Calls' },
    { key: 'cost',        label: 'Spend' },
    { key: 'team',        label: 'Team size' },
];

export default function CustomersPage() {
    const [partners, setPartners] = useState([]);
    const [businesses, setBusinesses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState('last_active');

    const [partnerOpen, setPartnerOpen] = useState(false);
    const [partnerForm, setPartnerForm] = useState({ name: '', owner_email: '', monthly_budget_usd: '', website: '' });
    const [creatingPartner, setCreatingPartner] = useState(false);

    const [bizOpen, setBizOpen] = useState(false);
    const [bizForm, setBizForm] = useState({ name: '', website_url: '', description: '' });
    const [creatingBiz, setCreatingBiz] = useState(false);

    const [removing, setRemoving] = useState(null);
    const [removeBusy, setRemoveBusy] = useState(false);
    const [tokensFor, setTokensFor] = useState(null);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            adminApi.listPartners().catch(err => { toast.error(`Partners failed: ${err.message}`); return { items: [] }; }),
            adminApi.listBusinesses().catch(err => { toast.error(`Businesses failed: ${err.message}`); return { items: [] }; }),
        ])
            .then(([p, b]) => { setPartners(p.items || []); setBusinesses(b.items || []); })
            .finally(() => setLoading(false));
    }, []);

    async function onCreatePartner(e) {
        e.preventDefault();
        const name = partnerForm.name.trim();
        if (!name) { toast.error('Name is required'); return; }
        setCreatingPartner(true);
        try {
            const payload = { name };
            if (partnerForm.owner_email.trim()) payload.owner_email = partnerForm.owner_email.trim();
            if (partnerForm.monthly_budget_usd) payload.monthly_budget_usd = Number(partnerForm.monthly_budget_usd);
            if (partnerForm.website.trim()) payload.website = partnerForm.website.trim();
            const r = await adminApi.createPartner(payload);
            if (r?.item) setPartners(prev => [r.item, ...prev]);
            toast.success(`Partner "${r.item?.name || name}" created`);
            setPartnerOpen(false);
            setPartnerForm({ name: '', owner_email: '', monthly_budget_usd: '', website: '' });
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setCreatingPartner(false);
        }
    }

    async function onCreateBusiness(e) {
        e.preventDefault();
        if (!bizForm.name.trim() || !bizForm.website_url.trim()) {
            toast.error('Name and website are required');
            return;
        }
        setCreatingBiz(true);
        try {
            await adminApi.createBusiness(bizForm);
            toast.success('Business added');
            setBizOpen(false);
            setBizForm({ name: '', website_url: '', description: '' });
            const r = await adminApi.listBusinesses();
            setBusinesses(r.items || []);
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setCreatingBiz(false);
        }
    }

    async function onRemoveConfirmed() {
        if (!removing) return;
        setRemoveBusy(true);
        try {
            await adminApi.deletePartner(removing.id);
            setPartners(prev => prev.filter(p => p.id !== removing.id));
            toast.success(`Partner "${removing.name}" removed`);
            setRemoving(null);
        } catch (err) {
            toast.error(`Remove failed: ${err.message}`);
        } finally {
            setRemoveBusy(false);
        }
    }

    const rows = useMemo(() => mergeCustomers(partners, businesses), [partners, businesses]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        const base = !s ? rows : rows.filter(r => {
            if (r.name?.toLowerCase().includes(s)) return true;
            if (r.partner?.owner?.email?.toLowerCase().includes(s)) return true;
            if (r.partner?.owner?.name?.toLowerCase().includes(s)) return true;
            if (r.partner?.website?.toLowerCase().includes(s)) return true;
            if (r.business?.website_url?.toLowerCase().includes(s)) return true;
            const team = normalizeTeam(r.partner?.team?.length ? r.partner.team : r.business?.team);
            return team.some(m =>
                m.agent_name?.toLowerCase().includes(s) ||
                m.role?.toLowerCase().includes(s) ||
                m.category?.toLowerCase().includes(s)
            );
        });

        const teamSize = r => (r.partner?.team_size || (r.business?.team || []).length || 0);
        return [...base].sort((a, b) => {
            if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
            if (sort === 'team') return teamSize(b) - teamSize(a);
            if (sort === 'calls') return (b.partner?.usage?.calls || 0) - (a.partner?.usage?.calls || 0);
            if (sort === 'cost')  return (b.partner?.usage?.cost_usd || 0) - (a.partner?.usage?.cost_usd || 0);
            const at = a.partner?.usage?.last_active ? new Date(a.partner.usage.last_active).getTime() : 0;
            const bt = b.partner?.usage?.last_active ? new Date(b.partner.usage.last_active).getTime() : 0;
            return bt - at;
        });
    }, [rows, q, sort]);

    const withPortal = rows.filter(r => r.partner).length;
    const withReports = rows.filter(r => r.business).length;
    const withBoth = rows.filter(r => r.partner && r.business).length;
    const totalCalls = partners.reduce((sum, p) => sum + (p.usage?.calls || 0), 0);
    const totalCost = partners.reduce((sum, p) => sum + (p.usage?.cost_usd || 0), 0);

    return (
        <>
            <Helmet><title>Customers · Admin</title></Helmet>

            <PartnerStatsPanel />
            <RoundTableStatsPanel />

            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold">Customers</h1>
                    <p className="text-sm text-muted-foreground">
                        Every customer company in one place — partner portals and growth-report businesses.
                        Expand a row to see its agent team.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {!loading && rows.length > 0 && (
                        <div className="text-right text-xs text-muted-foreground">
                            <div>{rows.length} customers · {withPortal} portal · {withReports} growth reports{withBoth > 0 ? ` · ${withBoth} both` : ''}</div>
                            <div>{fmtN(totalCalls)} calls · {fmt$(totalCost)} spend</div>
                        </div>
                    )}
                    <Button onClick={() => setBizOpen(true)} variant="outline">
                        <LineChart className="w-4 h-4 mr-1" /> Add business
                    </Button>
                    <Button onClick={() => setPartnerOpen(true)} className="bg-accent hover:bg-accent/80 text-white">
                        <Plus className="w-4 h-4 mr-1" /> Add partner
                    </Button>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                            type="search"
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search customers, owners, agents, or categories…"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground mr-1">Sort:</span>
                        {SORTS.map(s => (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => setSort(s.key)}
                                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                    sort === s.key
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : filtered.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        {rows.length === 0 ? 'No customers yet. Add a partner or a business to get started.' : 'No customers match that search.'}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {filtered.map(r => (
                        <CustomerRow
                            key={r.key}
                            row={r}
                            defaultOpen={filtered.length === 1}
                            onRemove={setRemoving}
                            onTokens={setTokensFor}
                        />
                    ))}
                </div>
            )}

            <PrivateAgentsPanel />

            <TokensDialog
                partner={tokensFor}
                onClose={() => setTokensFor(null)}
                onGranted={(id, newCap) => setPartners(prev => prev.map(p => p.id === id ? { ...p, credit_cap_usd: newCap } : p))}
            />

            <Dialog open={!!removing} onOpenChange={open => { if (!open && !removeBusy) setRemoving(null); }}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Remove partner</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Remove <strong className="text-foreground">{removing?.name}</strong>? This deletes its team roster,
                        member access, and all marketplace feature subscriptions — the partner&#39;s site loses every paid
                        feature immediately. Usage history is kept for accounting. Any growth-report business of the same
                        name is left untouched. This cannot be undone.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setRemoving(null)} disabled={removeBusy}>Cancel</Button>
                        <Button
                            type="button"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={onRemoveConfirmed}
                            disabled={removeBusy}
                        >
                            {removeBusy ? 'Removing…' : 'Remove partner'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={partnerOpen} onOpenChange={setPartnerOpen}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Add partner</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={onCreatePartner} className="space-y-3">
                        <div>
                            <Label htmlFor="partner-name">Partner name</Label>
                            <Input
                                id="partner-name"
                                value={partnerForm.name}
                                onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })}
                                placeholder="e.g., Acme Cafe"
                                className="bg-background border"
                                required
                                autoFocus
                            />
                        </div>
                        <div>
                            <Label htmlFor="partner-owner-email">Owner email <span className="text-muted-foreground font-normal">(optional — defaults to you)</span></Label>
                            <Input
                                id="partner-owner-email"
                                type="email"
                                value={partnerForm.owner_email}
                                onChange={e => setPartnerForm({ ...partnerForm, owner_email: e.target.value })}
                                placeholder="owner@example.com"
                                className="bg-background border"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Must match a user already signed up on kaushalstack.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="partner-website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                                id="partner-website"
                                type="url"
                                value={partnerForm.website}
                                onChange={e => setPartnerForm({ ...partnerForm, website: e.target.value })}
                                placeholder="https://example.com"
                                className="bg-background border"
                            />
                        </div>
                        <div>
                            <Label htmlFor="partner-budget">Monthly budget (USD) <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                                id="partner-budget"
                                type="number"
                                min="0"
                                step="0.01"
                                value={partnerForm.monthly_budget_usd}
                                onChange={e => setPartnerForm({ ...partnerForm, monthly_budget_usd: e.target.value })}
                                placeholder="0"
                                className="bg-background border"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setPartnerOpen(false)} disabled={creatingPartner}>Cancel</Button>
                            <Button type="submit" disabled={creatingPartner}>{creatingPartner ? 'Creating…' : 'Create partner'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={bizOpen} onOpenChange={setBizOpen}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Add business</DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-muted-foreground">
                        A business gets competitor scanning and scheduled growth reports. Use the same name as an existing
                        partner and the two will show as one customer.
                    </p>
                    <form onSubmit={onCreateBusiness} className="space-y-3">
                        <div>
                            <Label htmlFor="biz-name">Business name</Label>
                            <Input id="biz-name" value={bizForm.name} onChange={e => setBizForm({ ...bizForm, name: e.target.value })} className="bg-background border" required autoFocus />
                        </div>
                        <div>
                            <Label htmlFor="biz-website">Website URL</Label>
                            <Input id="biz-website" type="url" value={bizForm.website_url} onChange={e => setBizForm({ ...bizForm, website_url: e.target.value })} placeholder="https://example.com" className="bg-background border" required />
                        </div>
                        <div>
                            <Label htmlFor="biz-description">Description (optional)</Label>
                            <Input id="biz-description" value={bizForm.description} onChange={e => setBizForm({ ...bizForm, description: e.target.value })} className="bg-background border" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setBizOpen(false)} disabled={creatingBiz}>Cancel</Button>
                            <Button type="submit" disabled={creatingBiz}>{creatingBiz ? 'Saving…' : 'Add business'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
