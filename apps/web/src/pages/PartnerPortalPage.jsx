// Partner Portal — Usage ($ + tokens), Assets (agents' requirements source),
// and Team (round-table entry point). Self-contained page: plain Tailwind
// classes, no new dependencies. Wire it in App.jsx:
//   import PartnerPortalPage from '@/pages/PartnerPortalPage.jsx';
//   <Route path="/partner" element={<ProtectedRoute><PartnerPortalPage /></ProtectedRoute>} />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import pocketbaseClient from '@/lib/pocketbaseClient.js';
import apiServerClient from '@/lib/apiServerClient.js';
import { avatarUrl } from '@/lib/avatar';

const authHeaders = () => ({ Authorization: `Bearer ${pocketbaseClient.authStore.token}` });

async function api(path, options = {}) {
    const res = await apiServerClient.fetch(path, {
        ...options,
        headers: { ...(options.headers || {}), ...authHeaders() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

const fmtUSD = (n) => `$${Number(n || 0).toFixed(n >= 100 ? 0 : 2)}`;
const fmtTok = (n) => Number(n || 0).toLocaleString();

function StatCard({ label, value, sub }) {
    return (
        <div className="rounded-xl border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
            {sub ? <div className="mt-0.5 text-xs text-gray-400">{sub}</div> : null}
        </div>
    );
}

function Bars({ rows }) {
    const max = Math.max(0.0001, ...rows.map((r) => r.cost_usd));
    return (
        <div className="space-y-2">
            {rows.length === 0 && <div className="text-sm text-gray-400">No usage in this range yet.</div>}
            {rows.map((r) => (
                <div key={r.key}>
                    <div className="flex justify-between text-sm">
                        <span className="truncate pr-2">{r.key}</span>
                        <span className="tabular-nums text-gray-600">{fmtUSD(r.cost_usd)} · {r.calls} calls</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-gray-100">
                        <div className="h-2 rounded bg-blue-500" style={{ width: `${(r.cost_usd / max) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function BudgetEditor({ partner, currentBudget, onSaved }) {
    const [value, setValue] = useState('');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const isOwner = partner.my_role === 'owner' || !partner.my_role;

    if (!isOwner) return null;

    const save = async () => {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) { setErr('Enter a valid amount'); return; }
        setBusy(true); setErr('');
        try {
            await api(`/partner/${partner.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthly_budget_usd: n }),
            });
            setEditing(false); setValue('');
            onSaved?.();
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-medium">Monthly budget alert</div>
                    <div className="text-xs text-gray-500">
                        {currentBudget > 0
                            ? `Alerts fire at 80% and 100% of ${fmtUSD(currentBudget)}/month for ${partner.name}.`
                            : `No budget set for ${partner.name} — set one to get spend alerts.`}
                    </div>
                </div>
                {!editing ? (
                    <button onClick={() => { setEditing(true); setValue(currentBudget > 0 ? String(currentBudget) : ''); }}
                        className="rounded-lg border px-3 py-1.5 text-sm text-gray-700">
                        {currentBudget > 0 ? 'Change' : 'Set budget'}
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">$</span>
                        <input value={value} onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && save()}
                            placeholder="e.g. 50" autoFocus
                            className="w-24 rounded-lg border px-2 py-1.5 text-sm" />
                        <button onClick={save} disabled={busy}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                            {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditing(false); setErr(''); }} disabled={busy}
                            className="text-sm text-gray-500">Cancel</button>
                    </div>
                )}
            </div>
            {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
        </div>
    );
}

function ManualChargesSection({ partner }) {
    const [charges, setCharges] = useState([]);
    const [total, setTotal] = useState(0);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        try {
            const d = await api(`/partner/${partner.id}/manual-charges`);
            setCharges(d.charges || []);
            setTotal(d.total_usd || 0);
        } catch (e) { setErr(e.message); }
    }, [partner.id]);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        const desc = description.trim();
        const n = Number(amount);
        if (!desc) { setErr('Enter a description'); return; }
        if (!Number.isFinite(n) || n < 0) { setErr('Enter a valid amount'); return; }
        setBusy(true); setErr('');
        try {
            await api(`/partner/${partner.id}/manual-charges`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: desc, amount_usd: n }),
            });
            setDescription(''); setAmount(''); load();
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };

    const remove = async (id) => {
        try { await api(`/partner/${partner.id}/manual-charges/${id}`, { method: 'DELETE' }); load(); }
        catch (e) { setErr(e.message); }
    };

    return (
        <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between">
                <h3 className="font-medium">Additional charges</h3>
                <span className="text-sm text-gray-600">{fmtUSD(total)} total</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
                Costs outside kaushalstack — a VPS bill, ad spend, something running in your terminal — logged by hand so {partner.name}'s true spend isn't undercounted.
            </p>
            {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            <div className="mt-4 flex flex-col gap-2 md:flex-row">
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                    placeholder="Description — e.g. VPS hosting for July"
                    className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                <div className="flex items-center gap-1 rounded-lg border px-3 py-2 md:w-32">
                    <span className="text-sm text-gray-500">$</span>
                    <input value={amount} onChange={(e) => setAmount(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && add()}
                        placeholder="Value" inputMode="decimal"
                        className="w-full text-sm outline-none" />
                </div>
                <button onClick={add} disabled={busy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                    {busy ? 'Adding…' : 'Add charge'}
                </button>
            </div>
            <div className="mt-4 space-y-2">
                {charges.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{c.description}</div>
                            <div className="text-xs text-gray-400">{new Date(c.created).toLocaleDateString()}</div>
                        </div>
                        <span className="text-sm font-medium tabular-nums">{fmtUSD(c.amount_usd)}</span>
                        <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">remove</button>
                    </div>
                ))}
                {charges.length === 0 && <div className="text-sm text-gray-400">No additional charges logged yet.</div>}
            </div>
        </div>
    );
}

function UsageTab({ partner }) {
    const [range, setRange] = useState('today');
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const timer = useRef(null);

    const load = useCallback(async () => {
        try { setData(await api(`/partner/${partner.id}/usage?range=${range}`)); setErr(''); }
        catch (e) { setErr(e.message); }
    }, [partner.id, range]);

    useEffect(() => {
        load();
        timer.current = setInterval(load, 10000); // near-realtime: 10s poll
        // live ticking on top of the poll — subscribe to new usage_events
        let unsub = null;
        pocketbaseClient.collection('usage_events')
            .subscribe('*', (e) => { if (e.record?.partner_id === partner.id) load(); })
            .then((u) => { unsub = u; })
            .catch(() => {}); // fine without realtime; the poll covers it
        return () => { clearInterval(timer.current); if (unsub) unsub(); };
    }, [load, partner.id]);

    const t = data?.totals;
    const budget = data?.monthly_budget_usd || 0;
    const mtdSpend = data?.mtd_spend_usd || 0;
    const budgetPct = budget > 0 ? mtdSpend / budget : 0;
    return (
        <div className="space-y-6">
            {budget > 0 && budgetPct >= 0.8 && (
                <div className={`rounded-lg p-3 text-sm ${budgetPct >= 1 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {budgetPct >= 1
                        ? <><b>{partner.name}</b> is over its monthly budget — {fmtUSD(mtdSpend)} spent of {fmtUSD(budget)}.</>
                        : <><b>{partner.name}</b> is at {Math.round(budgetPct * 100)}% of its monthly budget ({fmtUSD(mtdSpend)} of {fmtUSD(budget)}).</>}
                </div>
            )}
            <div className="flex gap-2">
                {['today', '7d', 'mtd'].map((r) => (
                    <button key={r} onClick={() => setRange(r)}
                        className={`rounded-full px-3 py-1 text-sm border ${range === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>
                        {r === 'mtd' ? 'Month to date' : r === '7d' ? 'Last 7 days' : 'Today'}
                    </button>
                ))}
            </div>
            {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Spend" value={fmtUSD(t?.cost_usd || 0)} sub={t?.estimated_calls ? `${t.estimated_calls} estimated` : 'exact usage'} />
                <StatCard label="Input tokens" value={fmtTok(t?.input_tokens)} />
                <StatCard label="Output tokens" value={fmtTok(t?.output_tokens)} />
                <StatCard label="LLM calls" value={fmtTok(t?.calls)} />
            </div>
            {budget > 0 && range === 'mtd' && (
                <div>
                    <div className="flex justify-between text-sm text-gray-600">
                        <span>Monthly budget</span><span>{fmtUSD(t?.cost_usd || 0)} / {fmtUSD(budget)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-gray-100">
                        <div className={`h-2 rounded ${((t?.cost_usd || 0) / budget) > 0.8 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, ((t?.cost_usd || 0) / budget) * 100)}%` }} />
                    </div>
                </div>
            )}
            <BudgetEditor partner={partner} currentBudget={budget} onSaved={load} />
            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                    <h3 className="mb-3 font-medium">By agent</h3>
                    <Bars rows={data?.by_agent || []} />
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <h3 className="mb-3 font-medium">By model</h3>
                    <Bars rows={data?.by_model || []} />
                </div>
            </div>
            <ManualChargesSection partner={partner} />
        </div>
    );
}

function AssetsTab({ partner }) {
    const [assets, setAssets] = useState([]);
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const fileRef = useRef(null);

    const load = useCallback(async () => {
        try { setAssets((await api(`/partner/${partner.id}/assets`)).assets || []); }
        catch (e) { setErr(e.message); }
    }, [partner.id]);
    useEffect(() => { load(); }, [load]);

    const addLink = async () => {
        if (!url.trim()) return;
        setBusy(true); setErr('');
        try {
            await api(`/partner/${partner.id}/assets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), note }),
            });
            setUrl(''); setNote(''); load();
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };

    const addFile = async (file) => {
        if (!file) return;
        setBusy(true); setErr('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('title', file.name);
            await api(`/partner/${partner.id}/assets`, { method: 'POST', body: fd });
            load();
        } catch (e) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
    };

    const remove = async (id) => {
        try { await api(`/partner/${partner.id}/assets/${id}`, { method: 'DELETE' }); load(); }
        catch (e) { setErr(e.message); }
    };

    const KIND_BADGE = { link: 'bg-blue-100 text-blue-700', doc: 'bg-amber-100 text-amber-700', media: 'bg-purple-100 text-purple-700' };
    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-600">
                Everything here becomes the requirements source your agent team reads from — brand links, briefs, docs, photos. Links marked <b>new</b> are queued for Deep Research ingestion.
            </p>
            {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            <div className="rounded-xl border bg-white p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row">
                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https:// — website, doc link, competitor page…"
                        className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the agents (optional)"
                        className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                    <button onClick={addLink} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">Add link</button>
                </div>
                <div className="text-sm text-gray-500">
                    or upload a doc / image / media file (≤25 MB):{' '}
                    <input ref={fileRef} type="file" onChange={(e) => addFile(e.target.files?.[0])} className="text-sm" />
                </div>
            </div>
            <div className="space-y-2">
                {assets.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[a.kind] || 'bg-gray-100 text-gray-600'}`}>{a.kind}</span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{a.title || a.url || a.file}</div>
                            {a.note && <div className="truncate text-xs text-gray-500">{a.note}</div>}
                        </div>
                        <span className="text-xs text-gray-400">{a.status}</span>
                        <button onClick={() => remove(a.id)} className="text-xs text-red-500 hover:underline">remove</button>
                    </div>
                ))}
                {assets.length === 0 && <div className="text-sm text-gray-400">No assets yet — add the partner's website to start.</div>}
            </div>
        </div>
    );
}

function TeamTab({ partner }) {
    const [assets, setAssets]   = useState(null);
    // Seed from the team persisted on this partner record — each partner
    // keeps its own saved team, restored across sessions.
    const [team, setTeam]       = useState(Array.isArray(partner.team) ? partner.team : []);
    const [profile, setProfile] = useState(null);   // { profile, needs, scanned }
    const [loading, setLoading] = useState(false);
    const [err, setErr]         = useState('');

    useEffect(() => {
        api(`/partner/${partner.id}/assets`)
            .then(d => setAssets(d.assets || []))
            .catch(() => setAssets([]));
    }, [partner.id]);

    const research = async () => {
        setLoading(true); setErr('');
        try {
            const data = await api(`/partner/${partner.id}/research-team`, { method: 'POST' });
            setTeam(data.team || []);
            setProfile({ profile: data.profile, needs: data.needs || [], scanned: data.scanned });
        } catch (e) { setErr(e.message); } finally { setLoading(false); }
    };

    const hasAssets = assets && assets.length > 0;

    return (
        <div className="space-y-6">
            <div className="rounded-xl border bg-white p-5">
                <p className="text-sm text-gray-600">
                    Deep Research scans everything in your Assets tab — it fetches your links, reads your notes, profiles the business, and assembles the agent team that covers its actual needs.
                </p>
                {assets === null && <p className="mt-3 text-xs text-gray-400">Loading assets…</p>}
                {assets !== null && !hasAssets && (
                    <p className="mt-3 text-sm text-amber-600">Add at least one asset (a website link works best) so Deep Research has something to scan.</p>
                )}
                {hasAssets && (
                    <button
                        onClick={research}
                        disabled={loading}
                        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {loading
                            ? `Deep Research is scanning ${assets.length} asset${assets.length !== 1 ? 's' : ''}…`
                            : `Run Deep Research on ${assets.length} asset${assets.length !== 1 ? 's' : ''}`}
                    </button>
                )}
                {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            </div>

            {profile?.profile && (
                <div className="rounded-xl border bg-white p-5">
                    <h3 className="mb-2 font-medium text-sm">
                        Business profile
                        {profile.scanned && (
                            <span className="ml-2 font-normal text-xs text-gray-400">
                                from {profile.scanned.assets} asset{profile.scanned.assets !== 1 ? 's' : ''}{profile.scanned.links_fetched > 0 ? `, ${profile.scanned.links_fetched} page${profile.scanned.links_fetched !== 1 ? 's' : ''} fetched` : ''}
                            </span>
                        )}
                    </h3>
                    <p className="text-sm text-gray-700">{profile.profile}</p>
                    {profile.needs.length > 0 && (
                        <ul className="mt-3 space-y-1">
                            {profile.needs.map((n, i) => (
                                <li key={i} className="text-sm text-gray-600">• {n}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {team.length > 0 && (
                <div className="rounded-xl border bg-white p-5">
                    <h3 className="mb-4 font-medium text-sm">Recommended team for {partner.name}</h3>
                    <div className="space-y-4">
                        {team.map(s => (
                            <div key={s.id} className="flex items-start gap-3">
                                <img
                                    src={avatarUrl(s.agent_name)}
                                    alt={s.agent_name}
                                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                />
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold">{s.agent_name}</div>
                                    <div className="text-xs text-gray-400">{s.category} · {s.name}</div>
                                    {s.why && (
                                        <div className="mt-1 text-xs text-gray-600 bg-blue-50/60 rounded-md px-2 py-1.5">
                                            {s.why}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <Link
                        to="/roundtable"
                        state={{ team, partner_id: partner.id }}
                        className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
                    >
                        Open Round Table with this team
                    </Link>
                </div>
            )}
        </div>
    );
}

function StudioTab({ partner }) {
    const storageKey = `studio_session_${partner.id}`;
    const [input, setInput] = useState('');
    const [sessionId, setSessionId] = useState(() => localStorage.getItem(storageKey) || '');
    const [err, setErr] = useState('');

    const load = () => {
        const m = String(input).match(/[a-f0-9]{16}/);
        if (!m) { setErr('Paste a preview link or a 16-character session id.'); return; }
        localStorage.setItem(storageKey, m[0]);
        setSessionId(m[0]); setInput(''); setErr('');
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
                <p className="text-sm text-gray-600">
                    Remix a campaign's cards — swap in fresh Unsplash images, get AI copy variants, and download the finished card as a PNG. Paste the preview link (or session id) from any agent build.
                </p>
                <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && load()}
                        placeholder="https://kaushalstack.com/api/build/…/preview/ or session id"
                        className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                    <button onClick={load} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Open in Studio</button>
                </div>
                {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
                {sessionId && <div className="mt-2 text-xs text-gray-400">Session: <span className="font-mono">{sessionId}</span></div>}
            </div>
            {sessionId ? (
                <iframe src={`/api/build/${sessionId}/studio/`} title="Card Studio"
                    className="w-full rounded-xl border bg-white" style={{ height: '78vh' }} />
            ) : (
                <div className="text-sm text-gray-400">No session loaded yet.</div>
            )}
        </div>
    );
}

export default function PartnerPortalPage() {
    const [partners, setPartners] = useState(null);
    const [active, setActive] = useState(null);
    const [tab, setTab] = useState('usage');
    const [name, setName] = useState('');
    const [err, setErr] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            const { partners: list } = await api('/partner/mine');
            setPartners(list || []);
            setActive((cur) => cur || (list && list[0]) || null);
        } catch (e) { setErr(e.message); setPartners([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const create = async () => {
        if (!name.trim()) return;
        try {
            const { partner: created } = await api('/partner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            setName('');
            const { partners: list } = await api('/partner/mine');
            const fresh = (list || []).find(p => p.id === created.id) || { ...created, my_role: 'owner' };
            setPartners(list || []);
            setActive(fresh);
            setTab('usage');
            setConfirmDelete(false);
        } catch (e) { setErr(e.message); }
    };

    const deleteActive = async () => {
        if (!active) return;
        setDeleting(true);
        try {
            await api(`/partner/${active.id}`, { method: 'DELETE' });
            setConfirmDelete(false);
            const updated = (partners || []).filter(p => p.id !== active.id);
            setPartners(updated);
            setActive(updated[0] || null);
        } catch (e) {
            setErr(e.message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl px-4 py-8">
            <h1 className="text-2xl font-semibold">Partner portal</h1>
            {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            {partners !== null && partners.length === 0 && (
                <div className="mt-6 rounded-xl border bg-white p-6">
                    <p className="text-sm text-gray-600">Create your first partner workspace (e.g. “ReFunction Rehab”, “Himalaya Enterprises”).</p>
                    <div className="mt-3 flex gap-2">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Partner name" className="rounded-lg border px-3 py-2 text-sm" />
                        <button onClick={create} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Create</button>
                    </div>
                </div>
            )}

            {active && (
                <>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        {partners.map((p) => (
                            <button key={p.id} onClick={() => { setActive(p); setConfirmDelete(false); }}
                                className={`rounded-full border px-3 py-1 text-sm ${active.id === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'}`}>
                                {p.name}
                            </button>
                        ))}
                        <div className="flex gap-1">
                            <input value={name} onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && create()}
                                placeholder="New partner…"
                                className="rounded-full border px-3 py-1 text-sm w-36 focus:outline-none focus:border-blue-500" />
                            <button onClick={create} disabled={!name.trim()}
                                className="rounded-full bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed">
                                Add
                            </button>
                        </div>
                    </div>
                    <div className="mt-6 flex items-center gap-1 border-b">
                        {[['usage', 'Usage'], ['assets', 'Assets'], ['team', 'Team'], ['studio', 'Studio']].map(([k, label]) => (
                            <button key={k} onClick={() => setTab(k)}
                                className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}>
                                {label}
                            </button>
                        ))}
                        <div className="ml-auto flex items-center gap-2 pb-1">
                            {confirmDelete ? (
                                <>
                                    <span className="text-xs text-red-600">Delete "{active.name}"?</span>
                                    <button onClick={deleteActive} disabled={deleting}
                                        className="rounded px-2 py-1 text-xs bg-red-600 text-white disabled:opacity-50">
                                        {deleting ? 'Deleting…' : 'Yes, delete'}
                                    </button>
                                    <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                                        className="rounded px-2 py-1 text-xs border text-gray-600">
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => setConfirmDelete(true)}
                                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1">
                                    Delete partner
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mt-6">
                        {tab === 'usage' && <UsageTab key={active.id} partner={active} />}
                        {tab === 'assets' && <AssetsTab key={active.id} partner={active} />}
                        {tab === 'team' && <TeamTab key={active.id} partner={active} />}
                        {tab === 'studio' && <StudioTab key={active.id} partner={active} />}
                    </div>
                </>
            )}
        </div>
    );
}
