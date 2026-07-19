import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Users, ChevronDown, ChevronRight, Mail, Search, Activity, DollarSign, Clock, Plus, Trash2 } from 'lucide-react';

const CATEGORY_COLORS = {
    'sales':            'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    'marketing':        'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    'customer-support': 'bg-green-500/10 text-green-600 dark:text-green-400',
    'product':          'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    'engineering':      'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    'operations':       'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    'finance':          'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function CategoryPill({ value }) {
    if (!value) return null;
    const cls = CATEGORY_COLORS[value] || 'bg-muted text-muted-foreground';
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-medium ${cls}`}>
            {value}
        </span>
    );
}

function initials(name) {
    if (!name) return '?';
    return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function fmt$(n) {
    const v = Number(n || 0);
    if (v === 0) return '$0';
    if (v < 0.01) return `<$0.01`;
    if (v >= 100) return `$${v.toFixed(0)}`;
    return `$${v.toFixed(2)}`;
}

function fmtN(n) { return Number(n || 0).toLocaleString(); }

function fmtRelative(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 0) return d.toLocaleDateString();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

function TeamMemberCard({ member }) {
    const skills = (member.associated_tech_skills || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 4);

    return (
        <div className="rounded-lg border bg-card p-4 flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-sm font-semibold text-foreground">
                {initials(member.agent_name)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{member.agent_name}</div>
                        {member.role && (
                            <div className="text-xs text-muted-foreground line-clamp-1">{member.role}</div>
                        )}
                    </div>
                    <CategoryPill value={member.category} />
                </div>
                {skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {skills.map((s, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {s}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const BENCH_LABELS = {
    inner:     'Inner team',
    marketing: 'Marketing team',
};

function benchLabel(key) {
    if (BENCH_LABELS[key]) return BENCH_LABELS[key];
    return `${key.charAt(0).toUpperCase()}${key.slice(1)} team`;
}

// Multi-team partners tag each member with a `bench`; render one section per
// bench. Partners without benches keep the flat grid.
function TeamGrid({ team }) {
    const benches = Array.from(new Set(team.map(m => m.bench).filter(Boolean)));
    if (benches.length === 0) {
        return (
            <div className="grid gap-2 md:grid-cols-2">
                {team.map((m, i) => <TeamMemberCard key={m.id || i} member={m} />)}
            </div>
        );
    }
    const unbenched = team.filter(m => !m.bench);
    return (
        <div className="space-y-4">
            {benches.map(b => {
                const members = team.filter(m => m.bench === b);
                return (
                    <div key={b}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{benchLabel(b)}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">{members.length}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                            {members.map((m, i) => <TeamMemberCard key={m.id || i} member={m} />)}
                        </div>
                    </div>
                );
            })}
            {unbenched.length > 0 && (
                <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Other</div>
                    <div className="grid gap-2 md:grid-cols-2">
                        {unbenched.map((m, i) => <TeamMemberCard key={m.id || i} member={m} />)}
                    </div>
                </div>
            )}
        </div>
    );
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

function PartnerRow({ partner, defaultOpen, onRemove }) {
    const [open, setOpen] = useState(!!defaultOpen);
    const hasTeam = partner.team && partner.team.length > 0;

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
                            <span className="font-semibold text-base truncate">{partner.name}</span>
                            {partner.status !== 'active' && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {partner.status}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                            {partner.owner ? (
                                <span className="inline-flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    <span className="truncate">{partner.owner.email || partner.owner.name}</span>
                                </span>
                            ) : (
                                <span className="italic">no owner</span>
                            )}
                            <span>· {partner.team_size} {partner.team_size === 1 ? 'member' : 'members'}</span>
                        </div>
                        <div className="mt-2">
                            <UsagePills usage={partner.usage} />
                        </div>
                    </div>
                </div>
                <div className="pt-1 flex-shrink-0 flex items-center gap-2">
                    <span
                        role="button"
                        title={`Remove ${partner.name}`}
                        onClick={(e) => { e.stopPropagation(); onRemove(partner); }}
                        className="p-1 rounded text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </span>
                    {hasTeam && (open
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                </div>
            </button>

            {open && hasTeam && (
                <CardContent className="border-t pt-4 pb-4 bg-muted/10">
                    <TeamGrid team={partner.team} />
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

export default function PartnersPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState('last_active');
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ name: '', owner_email: '', monthly_budget_usd: '' });
    const [creating, setCreating] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [removeBusy, setRemoveBusy] = useState(false);

    useEffect(() => {
        setLoading(true);
        adminApi.listPartners()
            .then(r => setItems(r.items || []))
            .catch(err => toast.error(`Failed to load partners: ${err.message}`))
            .finally(() => setLoading(false));
    }, []);

    async function onCreate(e) {
        e.preventDefault();
        const name = createForm.name.trim();
        if (!name) { toast.error('Name is required'); return; }
        setCreating(true);
        try {
            const payload = { name };
            if (createForm.owner_email.trim()) payload.owner_email = createForm.owner_email.trim();
            if (createForm.monthly_budget_usd) payload.monthly_budget_usd = Number(createForm.monthly_budget_usd);
            const r = await adminApi.createPartner(payload);
            if (r?.item) setItems(prev => [r.item, ...prev]);
            toast.success(`Partner "${r.item?.name || name}" created`);
            setCreateOpen(false);
            setCreateForm({ name: '', owner_email: '', monthly_budget_usd: '' });
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setCreating(false);
        }
    }

    async function onRemoveConfirmed() {
        if (!removing) return;
        setRemoveBusy(true);
        try {
            await adminApi.deletePartner(removing.id);
            setItems(prev => prev.filter(p => p.id !== removing.id));
            toast.success(`Partner "${removing.name}" removed`);
            setRemoving(null);
        } catch (err) {
            toast.error(`Remove failed: ${err.message}`);
        } finally {
            setRemoveBusy(false);
        }
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        const base = !s ? items : items.filter(p => {
            if (p.name?.toLowerCase().includes(s)) return true;
            if (p.owner?.email?.toLowerCase().includes(s)) return true;
            if (p.owner?.name?.toLowerCase().includes(s)) return true;
            return (p.team || []).some(m =>
                m.agent_name?.toLowerCase().includes(s) ||
                m.role?.toLowerCase().includes(s) ||
                m.category?.toLowerCase().includes(s)
            );
        });

        // Sort. Descending for numeric/date fields, ascending for name.
        const sorted = [...base].sort((a, b) => {
            if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
            if (sort === 'team') return (b.team_size || 0) - (a.team_size || 0);
            if (sort === 'calls') return (b.usage?.calls || 0) - (a.usage?.calls || 0);
            if (sort === 'cost')  return (b.usage?.cost_usd || 0) - (a.usage?.cost_usd || 0);
            // last_active — nulls sink to the bottom
            const at = a.usage?.last_active ? new Date(a.usage.last_active).getTime() : 0;
            const bt = b.usage?.last_active ? new Date(b.usage.last_active).getTime() : 0;
            return bt - at;
        });
        return sorted;
    }, [items, q, sort]);

    const withTeams = items.filter(p => p.team_size > 0);
    const totalMembers = items.reduce((sum, p) => sum + p.team_size, 0);
    const totalCalls   = items.reduce((sum, p) => sum + (p.usage?.calls || 0), 0);
    const totalCost    = items.reduce((sum, p) => sum + (p.usage?.cost_usd || 0), 0);

    return (
        <>
            <Helmet><title>Teams · Admin</title></Helmet>

            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold">Teams</h1>
                    <p className="text-sm text-muted-foreground">
                        The AI teams provisioned for each partner &mdash; expand a partner to see who&#39;s on their bench.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {!loading && items.length > 0 && (
                        <div className="text-right text-xs text-muted-foreground">
                            <div>{items.length} partners · {withTeams.length} with teams · {totalMembers} members</div>
                            <div>{fmtN(totalCalls)} calls · {fmt$(totalCost)} spend</div>
                        </div>
                    )}
                    <Button onClick={() => setCreateOpen(true)} className="bg-accent hover:bg-accent/80 text-white">
                        <Plus className="w-4 h-4 mr-1" /> Add partner
                    </Button>
                </div>
            </div>

            {items.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                            type="search"
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search partners, owners, agents, or categories…"
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
                        {items.length === 0 ? 'No partners yet.' : 'No partners match that search.'}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {filtered.map(p => (
                        <PartnerRow key={p.id} partner={p} defaultOpen={filtered.length === 1} onRemove={setRemoving} />
                    ))}
                </div>
            )}

            <Dialog open={!!removing} onOpenChange={open => { if (!open && !removeBusy) setRemoving(null); }}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Remove partner</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Remove <strong className="text-foreground">{removing?.name}</strong>? This deletes its team roster,
                        member access, and all marketplace feature subscriptions — the partner&#39;s site loses every paid
                        feature immediately. Usage history is kept for accounting. This cannot be undone.
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

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Add partner</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={onCreate} className="space-y-3">
                        <div>
                            <Label htmlFor="partner-name">Partner name</Label>
                            <Input
                                id="partner-name"
                                value={createForm.name}
                                onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
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
                                value={createForm.owner_email}
                                onChange={e => setCreateForm({ ...createForm, owner_email: e.target.value })}
                                placeholder="owner@example.com"
                                className="bg-background border"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Must match a user already signed up on kaushalstack.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="partner-budget">Monthly budget (USD) <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                                id="partner-budget"
                                type="number"
                                min="0"
                                step="0.01"
                                value={createForm.monthly_budget_usd}
                                onChange={e => setCreateForm({ ...createForm, monthly_budget_usd: e.target.value })}
                                placeholder="0"
                                className="bg-background border"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
                            <Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create partner'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
