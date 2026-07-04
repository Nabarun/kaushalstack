// Partner Portal — Usage ($ + tokens), Assets (agents' requirements source),
// and Team (round-table entry point). Self-contained page: plain Tailwind
// classes, no new dependencies. Wire it in App.jsx:
//   import PartnerPortalPage from '@/pages/PartnerPortalPage.jsx';
//   <Route path="/partner" element={<ProtectedRoute><PartnerPortalPage /></ProtectedRoute>} />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import pocketbaseClient from '@/lib/pocketbaseClient.js';
import apiServerClient from '@/lib/apiServerClient.js';

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
    return (
        <div className="space-y-6">
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

export default function PartnerPortalPage() {
    const [partners, setPartners] = useState(null);
    const [active, setActive] = useState(null);
    const [tab, setTab] = useState('usage');
    const [name, setName] = useState('');
    const [err, setErr] = useState('');

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
        try { await api('/partner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }); setName(''); load(); }
        catch (e) { setErr(e.message); }
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
                            <button key={p.id} onClick={() => setActive(p)}
                                className={`rounded-full border px-3 py-1 text-sm ${active.id === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'}`}>
                                {p.name}
                            </button>
                        ))}
                    </div>
                    <div className="mt-6 flex gap-1 border-b">
                        {[['usage', 'Usage'], ['assets', 'Assets'], ['team', 'Team']].map(([k, label]) => (
                            <button key={k} onClick={() => setTab(k)}
                                className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-6">
                        {tab === 'usage' && <UsageTab partner={active} />}
                        {tab === 'assets' && <AssetsTab partner={active} />}
                        {tab === 'team' && (
                            <div className="rounded-xl border bg-white p-6 text-sm text-gray-700">
                                <p>Your partner's private agent team runs through the Round Table. Open it and describe what {active.name} needs — the Assets tab's contents become the team's requirements source once Deep Research ingestion lands.</p>
                                <Link to="/roundtable" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Open Round Table</Link>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
