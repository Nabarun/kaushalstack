import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Plus, ExternalLink, Users, DollarSign, Zap, Activity, MessageSquare, KeyRound, AlertTriangle, UserCheck } from 'lucide-react';

const RANGES = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 days' },
    { key: 'mtd',   label: 'Month to date' },
    { key: 'all',   label: 'All time' },
];

function fmt$(n)   { return `$${Number(n || 0).toFixed(Number(n) >= 100 ? 0 : 2)}`; }
function fmtN(n)   { return Number(n || 0).toLocaleString(); }
function fmtDate(d){ return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'; }

function StatCard({ icon: Icon, label, value, sub, accent }) {
    return (
        <div className="rounded-xl border bg-card p-4 flex gap-3">
            <div className={`mt-0.5 rounded-lg p-2 ${accent || 'bg-primary/10'}`}>
                <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="text-2xl font-semibold mt-0.5">{value}</div>
                {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

function PartnerStatsPanel() {
    const [range, setRange] = useState('mtd');
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getPartnerStats(range)
            .then(setStats)
            .catch(err => toast.error('Stats failed: ' + err.message))
            .finally(() => setLoading(false));
    }, [range]);

    const t = stats?.totals;

    return (
        <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Partner Overview</h2>
                <div className="flex gap-1">
                    {RANGES.map(r => (
                        <button key={r.key} onClick={() => setRange(r.key)}
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                                range === r.key
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-muted-foreground hover:text-foreground'
                            }`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard icon={Users}     label="Total partners"   value={fmtN(t?.partners)}         sub={`${fmtN(t?.active_partners)} active`} />
                    <StatCard icon={DollarSign} label="Spend"           value={fmt$(t?.cost_usd)}          sub={RANGES.find(r => r.key === range)?.label} />
                    <StatCard icon={Zap}        label="LLM calls"       value={fmtN(t?.calls)}             sub="usage events" />
                    <StatCard icon={Activity}   label="Tokens"          value={fmtN((t?.input_tokens || 0) + (t?.output_tokens || 0))} sub={`${fmtN(t?.input_tokens)} in · ${fmtN(t?.output_tokens)} out`} />
                </div>
            )}

            {!loading && stats?.partners?.length > 0 && (
                <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Partner</th>
                                <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Spend</th>
                                <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Calls</th>
                                <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Tokens</th>
                                <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Last active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {stats.partners.map(p => (
                                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-2.5">
                                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${p.calls > 0 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                                        {p.name}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt$(p.cost_usd)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtN(p.calls)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtN(p.input_tokens + p.output_tokens)}</td>
                                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtDate(p.last_active)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function RoundTableStatsPanel() {
    const [range, setRange] = useState('mtd');
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getRoundtableStats(range)
            .then(setStats)
            .catch(err => toast.error('RT stats failed: ' + err.message))
            .finally(() => setLoading(false));
    }, [range]);

    const t = stats?.totals;
    const phases = stats?.phases || {};

    return (
        <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Round Table Usage</h2>
                <div className="flex gap-1">
                    {RANGES.map(r => (
                        <button key={r.key} onClick={() => setRange(r.key)}
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                                range === r.key
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-muted-foreground hover:text-foreground'
                            }`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard icon={MessageSquare} label="Chats"          value={fmtN(t?.chats)}          sub={`${fmtN(t?.unique_users)} unique users`} />
                    <StatCard icon={UserCheck}     label="Free tier users" value={fmtN(t?.free_tier_users)} sub={`${fmtN(t?.at_limit)} hit limit`} />
                    <StatCard icon={AlertTriangle} label="At free limit"  value={fmtN(t?.at_limit)}        sub="need BYOK key" />
                    <StatCard icon={KeyRound}      label="BYOK users"     value={fmtN(t?.byok_users)}      sub="own API key" />
                </div>
            )}

            {!loading && (
                <div className="grid md:grid-cols-2 gap-4">
                    {/* Phase breakdown */}
                    <div className="rounded-xl border p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Chats by phase</div>
                        <div className="space-y-2">
                            {[['ideation','Ideation'],['execution','Execution'],['marketing','Marketing'],['other','Other']].map(([key, label]) => {
                                const count = phases[key] || 0;
                                const total = stats?.totals?.chats || 1;
                                return (
                                    <div key={key}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span>{label}</span>
                                            <span className="tabular-nums text-muted-foreground">{fmtN(count)}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(count / total) * 100}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Top users */}
                    <div className="rounded-xl border p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Top users by chats</div>
                        {stats?.top_users?.length ? (
                            <div className="space-y-2">
                                {stats.top_users.map((u, i) => (
                                    <div key={u.id} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                                            <span className="font-mono">{u.username}</span>
                                        </span>
                                        <span className="tabular-nums text-muted-foreground">{fmtN(u.chats)} chats</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No chats in this period.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BusinessesPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', website_url: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [partnerOpen, setPartnerOpen] = useState(false);
    const [partnerForm, setPartnerForm] = useState({ name: '', owner_email: '', monthly_budget_usd: '' });
    const [creatingPartner, setCreatingPartner] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await adminApi.listBusinesses();
            setItems(r.items || []);
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const onCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.website_url.trim()) {
            toast.error('Name and website are required');
            return;
        }
        setSaving(true);
        try {
            await adminApi.createBusiness(form);
            toast.success('Business added');
            setOpen(false);
            setForm({ name: '', website_url: '', description: '' });
            load();
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const onCreatePartner = async (e) => {
        e.preventDefault();
        const name = partnerForm.name.trim();
        if (!name) { toast.error('Partner name is required'); return; }
        setCreatingPartner(true);
        try {
            const payload = { name };
            if (partnerForm.owner_email.trim()) payload.owner_email = partnerForm.owner_email.trim();
            if (partnerForm.monthly_budget_usd) payload.monthly_budget_usd = Number(partnerForm.monthly_budget_usd);
            const r = await adminApi.createPartner(payload);
            toast.success(`Partner "${r.item?.name || name}" created — now available in Teams and Marketplace`);
            setPartnerOpen(false);
            setPartnerForm({ name: '', owner_email: '', monthly_budget_usd: '' });
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setCreatingPartner(false);
        }
    };

    return (
        <>
            <Helmet><title>Businesses · Admin</title></Helmet>

            <PartnerStatsPanel />
            <RoundTableStatsPanel />

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Businesses</h1>
                    <p className="text-sm text-muted-foreground">Onboarded businesses and their growth-report teams.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => setPartnerOpen(true)} variant="outline">
                        <Users className="w-4 h-4 mr-1" /> Add partner
                    </Button>
                    <Button onClick={() => setOpen(true)} className="bg-accent hover:bg-accent/80 text-white">
                        <Plus className="w-4 h-4 mr-1" /> Add business
                    </Button>
                </div>
            </div>

            {loading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
            ) : items.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No businesses yet. Add one to get started.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {items.map(b => (
                        <Card key={b.id} className="bg-card border">
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <div>
                                    <CardTitle className="text-base">
                                        <Link to={`/admin/businesses/${b.id}`} className="hover:underline">{b.name}</Link>
                                    </CardTitle>
                                    <a href={b.website_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                        {b.website_url} <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                    <div>Daily @ {String(b.schedule_hour ?? 6).padStart(2, '0')}:00 UTC</div>
                                    <div>{b.active ? 'Active' : 'Paused'}</div>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground pt-0">
                                <div className="flex gap-4">
                                    <span>{(b.team || []).length} agents</span>
                                    <span>{(b.competitors || []).length} competitors</span>
                                    <span>{b.last_run_at ? `Last run ${new Date(b.last_run_at).toLocaleString()}` : 'Never run'}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Add business</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={onCreate} className="space-y-3">
                        <div>
                            <Label htmlFor="name">Business name</Label>
                            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-background border" required />
                        </div>
                        <div>
                            <Label htmlFor="website">Website URL</Label>
                            <Input id="website" type="url" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} placeholder="https://example.com" className="bg-background border" required />
                        </div>
                        <div>
                            <Label htmlFor="description">Description (optional)</Label>
                            <Input id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-background border" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={partnerOpen} onOpenChange={setPartnerOpen}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Add partner</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={onCreatePartner} className="space-y-3">
                        <div>
                            <Label htmlFor="bp-partner-name">Partner name</Label>
                            <Input
                                id="bp-partner-name"
                                value={partnerForm.name}
                                onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })}
                                placeholder="e.g., Acme Cafe"
                                className="bg-background border"
                                required
                                autoFocus
                            />
                        </div>
                        <div>
                            <Label htmlFor="bp-partner-owner-email">Owner email <span className="text-muted-foreground font-normal">(optional — defaults to you)</span></Label>
                            <Input
                                id="bp-partner-owner-email"
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
                            <Label htmlFor="bp-partner-budget">Monthly budget (USD) <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                                id="bp-partner-budget"
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
        </>
    );
}
