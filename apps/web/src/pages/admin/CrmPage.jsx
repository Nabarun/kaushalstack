import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import {
    Handshake, Building2, Target, Users2, Sparkle, Plus, RefreshCw,
    ArrowUpRight, Pencil, Trash2, UserPlus,
} from 'lucide-react';
import { FEATURES } from './MarketplacePage.jsx';

const STAGES = ['qualification', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABEL = { qualification: 'Qualification', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const LEAD_SOURCES = ['referral', 'event', 'whatsapp', 'website', 'other'];
const ACCOUNT_STATUSES = ['active', 'dormant', 'churned'];

const fmtINR = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const featureTitle = (id) => FEATURES.find(f => f.id === id)?.title || id;

function subEffective(sub) {
    if (sub.status === 'cancelled') return 'cancelled';
    if (!sub.paid_until || new Date(sub.paid_until).getTime() < Date.now()) return 'unpaid';
    return 'active';
}

function ToolChips({ subs }) {
    if (!subs.length) return <span className="text-xs text-muted-foreground/60">no tools yet</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {subs.map(s => {
                const eff = subEffective(s);
                const cls = eff === 'active'
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                    : eff === 'unpaid'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : 'bg-muted text-muted-foreground line-through';
                return (
                    <span key={s.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ${cls}`} title={`${eff} · ${fmtINR(s.price_inr)}/mo`}>
                        {featureTitle(s.feature_id)}
                    </span>
                );
            })}
        </div>
    );
}

function FeaturePicker({ value, onChange }) {
    const ids = Array.isArray(value) ? value : [];
    const toggle = (id) => onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
    return (
        <div className="flex flex-wrap gap-1.5">
            {FEATURES.map(f => (
                <button
                    key={f.id} type="button" onClick={() => toggle(f.id)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                        ids.includes(f.id) ? 'bg-accent text-white border-accent' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {f.title}
                </button>
            ))}
        </div>
    );
}

function SelectNative({ value, onChange, options, labels = {}, className = '', allowEmpty }) {
    return (
        <select
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className={`bg-background border rounded-md px-2 py-1.5 text-sm ${className}`}
        >
            {allowEmpty && <option value="">{allowEmpty}</option>}
            {options.map(o => <option key={o} value={o}>{labels[o] || o}</option>)}
        </select>
    );
}

// One generic editor dialog: `fields` describes the form, `initial` the record.
function EditorDialog({ open, title, fields, initial, onSave, onClose, partners = [], accounts = [] }) {
    const [form, setForm] = useState(initial || {});
    const [busy, setBusy] = useState(false);
    useEffect(() => { setForm(initial || {}); }, [initial, open]);
    if (!open) return null;
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
            <DialogContent className="bg-card border text-foreground max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    {fields.map(f => (
                        <div key={f.key}>
                            <Label className="text-xs">{f.label}</Label>
                            {f.type === 'text' && (
                                <Input value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="bg-background border" placeholder={f.placeholder || ''} />
                            )}
                            {f.type === 'number' && (
                                <Input type="number" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value === '' ? null : Number(e.target.value))} className="bg-background border" />
                            )}
                            {f.type === 'date' && (
                                <Input type="date" value={(form[f.key] || '').slice(0, 10)} onChange={e => set(f.key, e.target.value)} className="bg-background border" />
                            )}
                            {f.type === 'textarea' && (
                                <textarea value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={3}
                                    className="w-full bg-background border rounded-md px-2 py-1.5 text-sm" />
                            )}
                            {f.type === 'select' && (
                                <SelectNative value={form[f.key]} onChange={v => set(f.key, v)} options={f.options} labels={f.labels} className="w-full" allowEmpty={f.allowEmpty} />
                            )}
                            {f.type === 'partner' && (
                                <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="w-full bg-background border rounded-md px-2 py-1.5 text-sm">
                                    <option value="">— not linked —</option>
                                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            )}
                            {f.type === 'account' && (
                                <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="w-full bg-background border rounded-md px-2 py-1.5 text-sm">
                                    <option value="">— no account —</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            )}
                            {f.type === 'features' && (
                                <FeaturePicker value={form[f.key]} onChange={v => set(f.key, v)} />
                            )}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button type="button" disabled={busy} onClick={async () => {
                        setBusy(true);
                        try { await onSave(form); onClose(); }
                        catch (e) { toast.error(e.message); }
                        finally { setBusy(false); }
                    }}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function CrmPage() {
    const [data, setData] = useState(null);
    const [tab, setTab] = useState('accounts');
    const [editor, setEditor] = useState(null); // { entity, title, fields, initial, id? }
    const [busy, setBusy] = useState(false);

    async function load() {
        try { setData(await adminApi.crmAll()); }
        catch (e) { toast.error(`CRM load failed: ${e.message}`); }
    }
    useEffect(() => { load(); }, []);

    const partnerName = useMemo(() => Object.fromEntries((data?.partners || []).map(p => [p.id, p.name])), [data]);
    const accountName = useMemo(() => Object.fromEntries((data?.accounts || []).map(a => [a.id, a.name])), [data]);
    const subsByPartner = useMemo(() => {
        const m = {};
        for (const s of data?.subscriptions || []) (m[s.partner_id] ||= []).push(s);
        return m;
    }, [data]);

    const pipelineValue = useMemo(
        () => (data?.opportunities || []).filter(o => !['won', 'lost'].includes(o.stage)).reduce((s, o) => s + (o.value_inr || 0), 0),
        [data],
    );
    const wonValue = useMemo(
        () => (data?.opportunities || []).filter(o => o.stage === 'won').reduce((s, o) => s + (o.value_inr || 0), 0),
        [data],
    );

    async function save(entity, id, form) {
        if (id) await adminApi.crmUpdate(entity, id, form);
        else await adminApi.crmCreate(entity, form);
        toast.success('Saved');
        await load();
    }

    async function remove(entity, id) {
        if (!window.confirm('Delete this record?')) return;
        try { await adminApi.crmDelete(entity, id); toast.success('Deleted'); await load(); }
        catch (e) { toast.error(e.message); }
    }

    // Won opportunity → offer to subscribe the linked partner to the sold tools.
    async function setStage(opp, stage) {
        try {
            await adminApi.crmUpdate('opportunities', opp.id, { stage });
            if (stage === 'won') {
                const account = (data?.accounts || []).find(a => a.id === opp.account_id);
                const featureIds = Array.isArray(opp.feature_ids) ? opp.feature_ids : [];
                if (account?.partner_id && featureIds.length &&
                    window.confirm(`Deal won 🎉 — subscribe ${account.name} to: ${featureIds.map(featureTitle).join(', ')}?`)) {
                    for (const fid of featureIds) {
                        await adminApi.subscribeFeature(account.partner_id, fid);
                    }
                    toast.success(`${account.name} subscribed to ${featureIds.length} tool(s)`);
                }
            }
            await load();
        } catch (e) { toast.error(e.message); }
    }

    async function syncPartners() {
        setBusy(true);
        try {
            const r = await adminApi.crmSyncPartners();
            toast.success(r.created ? `Created ${r.created} account(s) from partners` : 'All partners already have accounts');
            await load();
        } catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    }

    async function convertLead(lead) {
        if (!window.confirm(`Convert "${lead.company || lead.name}" into an account + opportunity?`)) return;
        try {
            await adminApi.crmConvertLead(lead.id);
            toast.success('Lead converted — account and opportunity created');
            await load();
        } catch (e) { toast.error(e.message); }
    }

    const accountFields = [
        { key: 'name', label: 'Account name', type: 'text' },
        { key: 'partner_id', label: 'Linked partner (tool space)', type: 'partner' },
        { key: 'industry', label: 'Industry', type: 'text' },
        { key: 'city', label: 'City', type: 'text' },
        { key: 'website', label: 'Website', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ACCOUNT_STATUSES },
        { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    const contactFields = [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'account_id', label: 'Account', type: 'account' },
        { key: 'role', label: 'Role', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phone', label: 'Phone / WhatsApp', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    const leadFields = [
        { key: 'name', label: 'Person', type: 'text' },
        { key: 'company', label: 'Company', type: 'text' },
        { key: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES, allowEmpty: '— source —' },
        { key: 'feature_ids', label: 'Interested in (our tools)', type: 'features' },
        { key: 'est_value_inr', label: 'Estimated ₹ / month', type: 'number' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phone', label: 'Phone / WhatsApp', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    const oppFields = [
        { key: 'title', label: 'Deal title', type: 'text' },
        { key: 'account_id', label: 'Account', type: 'account' },
        { key: 'feature_ids', label: 'Tools being sold', type: 'features' },
        { key: 'value_inr', label: '₹ / month', type: 'number' },
        { key: 'close_date', label: 'Expected close', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
    ];

    const TABS = [
        ['accounts', 'Accounts', Building2, data?.accounts?.length],
        ['opportunities', 'Opportunities', Target, data?.opportunities?.length],
        ['contacts', 'Contacts', Users2, data?.contacts?.length],
        ['leads', 'Leads', Sparkle, data?.leads?.length],
    ];

    return (
        <div className="max-w-6xl">
            <Helmet><title>CRM — Admin</title></Helmet>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h1 className="text-2xl font-bold flex items-center gap-2"><Handshake className="w-6 h-6" /> CRM</h1>
                <div className="text-sm text-muted-foreground">
                    Open pipeline <span className="font-semibold text-foreground">{fmtINR(pipelineValue)}</span>/mo
                    {wonValue > 0 && <> · won <span className="font-semibold text-green-600 dark:text-green-400">{fmtINR(wonValue)}</span>/mo</>}
                </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                Every record plugs into the tool space: accounts link to partners (their live subscriptions show as tools in use),
                leads and deals carry the marketplace tools involved, and a won deal can subscribe the partner in one click.
            </p>

            <div className="flex gap-1 mb-5 border-b">
                {TABS.map(([id, label, Icon, count]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                            tab === id ? 'border-accent text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}>
                        <Icon className="w-4 h-4" /> {label}
                        {count != null && <span className="text-[10px] bg-muted rounded-full px-1.5">{count}</span>}
                    </button>
                ))}
            </div>

            {!data ? <div className="text-sm text-muted-foreground">Loading…</div> : (
                <>
                    {tab === 'accounts' && (
                        <Card><CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-sm text-muted-foreground">Accounts linked to a partner show their live tool subscriptions.</div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" disabled={busy} onClick={syncPartners}>
                                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy ? 'animate-spin' : ''}`} /> Sync from partners
                                    </Button>
                                    <Button size="sm" onClick={() => setEditor({ entity: 'accounts', title: 'New account', fields: accountFields, initial: { status: 'active' } })}>
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Account
                                    </Button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                                        <th className="py-2 pr-3">Account</th><th className="py-2 px-3">City</th>
                                        <th className="py-2 px-3">Tools in use</th><th className="py-2 px-3 text-right">₹/mo</th>
                                        <th className="py-2 px-3">Status</th><th className="py-2 pl-3"></th>
                                    </tr></thead>
                                    <tbody>
                                        {data.accounts.map(a => {
                                            const subs = a.partner_id ? (subsByPartner[a.partner_id] || []) : [];
                                            const monthly = subs.filter(s => subEffective(s) === 'active').reduce((s, x) => s + (x.price_inr || 0), 0);
                                            return (
                                                <tr key={a.id} className="border-b last:border-0 align-top">
                                                    <td className="py-2.5 pr-3">
                                                        <div className="font-medium">{a.name}</div>
                                                        {a.partner_id
                                                            ? <div className="text-[10px] text-muted-foreground">partner: {partnerName[a.partner_id] || a.partner_id}</div>
                                                            : <div className="text-[10px] text-muted-foreground/60">not in tool space yet</div>}
                                                    </td>
                                                    <td className="py-2.5 px-3">{a.city || <span className="text-muted-foreground/50">—</span>}</td>
                                                    <td className="py-2.5 px-3"><ToolChips subs={subs} /></td>
                                                    <td className="py-2.5 px-3 text-right whitespace-nowrap">{monthly ? fmtINR(monthly) : <span className="text-muted-foreground/50">—</span>}</td>
                                                    <td className="py-2.5 px-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>{a.status || '—'}</span></td>
                                                    <td className="py-2.5 pl-3 whitespace-nowrap">
                                                        <button className="p-1 text-muted-foreground hover:text-foreground" title="Edit"
                                                            onClick={() => setEditor({ entity: 'accounts', id: a.id, title: `Edit ${a.name}`, fields: accountFields, initial: a })}>
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button className="p-1 text-muted-foreground hover:text-red-500" title="Delete" onClick={() => remove('accounts', a.id)}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {!data.accounts.length && <tr><td colSpan={6} className="py-6 text-sm text-muted-foreground">No accounts yet — use <em>Sync from partners</em> to bootstrap from your {data.partners.length} partners.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-3">
                                Manage subscriptions and payments in the <Link to="/admin/marketplace" className="text-accent hover:underline inline-flex items-center gap-0.5">Marketplace <ArrowUpRight className="w-3 h-3" /></Link>.
                            </p>
                        </CardContent></Card>
                    )}

                    {tab === 'opportunities' && (
                        <div>
                            <div className="flex justify-end mb-3">
                                <Button size="sm" onClick={() => setEditor({ entity: 'opportunities', title: 'New opportunity', fields: oppFields, initial: { stage: 'qualification' } })}>
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Opportunity
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                {STAGES.map(stage => {
                                    const items = data.opportunities.filter(o => (o.stage || 'qualification') === stage);
                                    const total = items.reduce((s, o) => s + (o.value_inr || 0), 0);
                                    return (
                                        <div key={stage} className="rounded-lg border bg-card/50 p-2 min-h-[120px]">
                                            <div className="flex items-center justify-between px-1 mb-2">
                                                <span className={`text-[11px] font-semibold uppercase tracking-wide ${stage === 'won' ? 'text-green-600 dark:text-green-400' : stage === 'lost' ? 'text-muted-foreground' : ''}`}>{STAGE_LABEL[stage]}</span>
                                                <span className="text-[10px] text-muted-foreground">{total ? fmtINR(total) : ''}</span>
                                            </div>
                                            <div className="space-y-2">
                                                {items.map(o => (
                                                    <div key={o.id} className="rounded-md border bg-card p-2">
                                                        <div className="flex items-start justify-between gap-1">
                                                            <div className="text-xs font-medium leading-tight">{o.title}</div>
                                                            <button className="text-muted-foreground hover:text-foreground shrink-0" title="Edit"
                                                                onClick={() => setEditor({ entity: 'opportunities', id: o.id, title: 'Edit opportunity', fields: oppFields, initial: o })}>
                                                                <Pencil className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        {o.account_id && <div className="text-[10px] text-muted-foreground mt-0.5">{accountName[o.account_id] || '?'}</div>}
                                                        {Array.isArray(o.feature_ids) && o.feature_ids.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {o.feature_ids.map(fid => <span key={fid} className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">{featureTitle(fid)}</span>)}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center justify-between mt-1.5">
                                                            <span className="text-[11px] font-semibold">{o.value_inr ? `${fmtINR(o.value_inr)}/mo` : ''}</span>
                                                            <select value={o.stage || 'qualification'} onChange={e => setStage(o, e.target.value)}
                                                                className="text-[10px] bg-background border rounded px-1 py-0.5">
                                                                {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {tab === 'contacts' && (
                        <Card><CardContent className="p-4">
                            <div className="flex justify-end mb-3">
                                <Button size="sm" onClick={() => setEditor({ entity: 'contacts', title: 'New contact', fields: contactFields, initial: {} })}>
                                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Contact
                                </Button>
                            </div>
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                                    <th className="py-2 pr-3">Name</th><th className="py-2 px-3">Account</th><th className="py-2 px-3">Role</th>
                                    <th className="py-2 px-3">Email</th><th className="py-2 px-3">Phone</th><th className="py-2 pl-3"></th>
                                </tr></thead>
                                <tbody>
                                    {data.contacts.map(c => (
                                        <tr key={c.id} className="border-b last:border-0">
                                            <td className="py-2.5 pr-3 font-medium">{c.name}{c.is_primary && <span className="ml-1.5 text-[9px] text-accent">PRIMARY</span>}</td>
                                            <td className="py-2.5 px-3">{accountName[c.account_id] || <span className="text-muted-foreground/50">—</span>}</td>
                                            <td className="py-2.5 px-3">{c.role || '—'}</td>
                                            <td className="py-2.5 px-3">{c.email || '—'}</td>
                                            <td className="py-2.5 px-3">{c.phone || '—'}</td>
                                            <td className="py-2.5 pl-3 whitespace-nowrap">
                                                <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setEditor({ entity: 'contacts', id: c.id, title: `Edit ${c.name}`, fields: contactFields, initial: c })}><Pencil className="w-3.5 h-3.5" /></button>
                                                <button className="p-1 text-muted-foreground hover:text-red-500" onClick={() => remove('contacts', c.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!data.contacts.length && <tr><td colSpan={6} className="py-6 text-sm text-muted-foreground">No contacts yet.</td></tr>}
                                </tbody>
                            </table>
                        </CardContent></Card>
                    )}

                    {tab === 'leads' && (
                        <Card><CardContent className="p-4">
                            <div className="flex justify-end mb-3">
                                <Button size="sm" onClick={() => setEditor({ entity: 'leads', title: 'New lead', fields: leadFields, initial: { status: 'new' } })}>
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Lead
                                </Button>
                            </div>
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                                    <th className="py-2 pr-3">Lead</th><th className="py-2 px-3">Source</th>
                                    <th className="py-2 px-3">Interested in</th><th className="py-2 px-3 text-right">Est ₹/mo</th>
                                    <th className="py-2 px-3">Status</th><th className="py-2 pl-3"></th>
                                </tr></thead>
                                <tbody>
                                    {data.leads.map(l => (
                                        <tr key={l.id} className="border-b last:border-0 align-top">
                                            <td className="py-2.5 pr-3">
                                                <div className="font-medium">{l.company || l.name}</div>
                                                {l.company && l.name && <div className="text-[10px] text-muted-foreground">{l.name}</div>}
                                            </td>
                                            <td className="py-2.5 px-3">{l.source || '—'}</td>
                                            <td className="py-2.5 px-3">
                                                {Array.isArray(l.feature_ids) && l.feature_ids.length
                                                    ? <div className="flex flex-wrap gap-1">{l.feature_ids.map(fid => <span key={fid} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">{featureTitle(fid)}</span>)}</div>
                                                    : <span className="text-muted-foreground/50">—</span>}
                                            </td>
                                            <td className="py-2.5 px-3 text-right whitespace-nowrap">{l.est_value_inr ? fmtINR(l.est_value_inr) : '—'}</td>
                                            <td className="py-2.5 px-3">
                                                <SelectNative value={l.status || 'new'} options={LEAD_STATUSES}
                                                    onChange={async v => { try { await adminApi.crmUpdate('leads', l.id, { status: v }); await load(); } catch (e) { toast.error(e.message); } }}
                                                    className="text-xs" />
                                            </td>
                                            <td className="py-2.5 pl-3 whitespace-nowrap">
                                                {l.status !== 'converted' && l.status !== 'lost' && (
                                                    <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 mr-1" onClick={() => convertLead(l)}>Convert</Button>
                                                )}
                                                <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setEditor({ entity: 'leads', id: l.id, title: 'Edit lead', fields: leadFields, initial: l })}><Pencil className="w-3.5 h-3.5" /></button>
                                                <button className="p-1 text-muted-foreground hover:text-red-500" onClick={() => remove('leads', l.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!data.leads.length && <tr><td colSpan={6} className="py-6 text-sm text-muted-foreground">No leads yet — add the people you're talking to.</td></tr>}
                                </tbody>
                            </table>
                        </CardContent></Card>
                    )}
                </>
            )}

            <EditorDialog
                open={!!editor}
                title={editor?.title || ''}
                fields={editor?.fields || []}
                initial={editor?.initial}
                partners={data?.partners || []}
                accounts={data?.accounts || []}
                onClose={() => setEditor(null)}
                onSave={(form) => save(editor.entity, editor.id, form)}
            />
        </div>
    );
}
