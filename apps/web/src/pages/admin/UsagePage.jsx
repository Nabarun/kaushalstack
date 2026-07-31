import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Activity, RefreshCw, Wallet, ArrowUpRight, Cpu } from 'lucide-react';

// Provider ids come from the api's provider registry; anything new shows up
// with its raw id until given a label here.
const PROVIDER_META = {
    openai:    { label: 'OpenAI',             dot: 'bg-emerald-500' },
    anthropic: { label: 'Anthropic · Claude', dot: 'bg-orange-500' },
    google:    { label: 'Google · Gemini',    dot: 'bg-blue-500' },
    xai:       { label: 'xAI · Grok',         dot: 'bg-purple-500' },
};
const provLabel = (id) => PROVIDER_META[id]?.label || id;
const provDot   = (id) => PROVIDER_META[id]?.dot || 'bg-muted-foreground/60';

const RANGES = [
    ['today', 'Today'],
    ['7d', '7 days'],
    ['mtd', 'Month'],
    ['all', 'All time'],
];

function fmtUSD(v) {
    if (!v) return '$0';
    if (v < 1) return `$${v.toFixed(4)}`;
    return `$${v.toFixed(2)}`;
}

function fmtTok(v) {
    if (!v) return '0';
    if (v < 1000) return String(v);
    if (v < 1_000_000) return `${(v / 1000).toFixed(1)}k`;
    return `${(v / 1_000_000).toFixed(2)}M`;
}

function CapCell({ cap, lifetime }) {
    if (!cap) return <span className="text-muted-foreground">no cap</span>;
    const pct = Math.min(100, (lifetime / cap) * 100);
    const bar = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500';
    return (
        <div className="min-w-[110px]">
            <div className="flex justify-between text-[11px] mb-0.5">
                <span className={pct >= 100 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>{fmtUSD(lifetime)}</span>
                <span className="text-muted-foreground">of {fmtUSD(cap)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function UsagePage() {
    const [range, setRange] = useState('mtd');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load(r = range) {
        setLoading(true);
        try {
            setData(await adminApi.usageByProvider(r));
        } catch (err) {
            toast.error(`Failed to load usage: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(range); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

    const providerIds = useMemo(() => (data?.providers || []).map(p => p.provider), [data]);
    const models = useMemo(
        () => (data?.providers || []).flatMap(p => p.models.map(m => ({ ...m, provider: p.provider })))
            .sort((a, z) => z.cost_usd - a.cost_usd),
        [data],
    );
    const hasUntagged = (data?.untagged?.calls || 0) > 0;
    const activePartners = useMemo(
        () => (data?.partners || []).filter(p => p.calls > 0 || p.credit_cap_usd > 0 || p.lifetime_cost_usd > 0),
        [data],
    );

    return (
        <div className="max-w-6xl">
            <Helmet><title>AI Usage — Admin</title></Helmet>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Activity className="w-6 h-6" /> AI Usage
                </h1>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border overflow-hidden">
                        {RANGES.map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => setRange(id)}
                                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                    range === id ? 'bg-accent text-white' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => load()}
                        className="p-2 rounded-lg border text-muted-foreground hover:text-foreground"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
                Every LLM call is metered at one choke point and lands here — by provider, by model, and by the partner it ran for.
                Costs are provider billing in USD.
            </p>

            {loading && !data ? (
                <div className="text-muted-foreground text-sm">Loading…</div>
            ) : !data ? null : (
                <div className="space-y-6">
                    {/* ── provider cards ─────────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(data.providers.length ? data.providers : [null]).map((p, i) => p === null ? (
                            <Card key={i}><CardContent className="p-4 text-sm text-muted-foreground">No AI calls in this range.</CardContent></Card>
                        ) : (
                            <Card key={p.provider}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`w-2 h-2 rounded-full ${provDot(p.provider)}`} />
                                        <span className="text-sm font-medium">{provLabel(p.provider)}</span>
                                    </div>
                                    <div className="text-2xl font-bold">{fmtUSD(p.cost_usd)}</div>
                                    <div className="text-[11px] text-muted-foreground mt-1">
                                        {p.calls} calls · {fmtTok(p.input_tokens)} in / {fmtTok(p.output_tokens)} out
                                        {p.cached_tokens > 0 && <> · {fmtTok(p.cached_tokens)} cached</>}
                                    </div>
                                    {p.estimated_calls > 0 && (
                                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                            {p.estimated_calls} call{p.estimated_calls > 1 ? 's' : ''} estimated (~chars/4)
                                        </div>
                                    )}
                                    {p.models[0] && (
                                        <div className="text-[11px] text-muted-foreground mt-1 truncate" title={p.models.map(m => `${m.model} ${fmtUSD(m.cost_usd)}`).join(' · ')}>
                                            top: <span className="font-mono">{p.models[0].model}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* ── totals line ────────────────────────────────────── */}
                    <div className="text-sm text-muted-foreground">
                        Total <span className="font-semibold text-foreground">{fmtUSD(data.totals.cost_usd)}</span> across{' '}
                        {data.totals.calls} calls · {fmtTok(data.totals.input_tokens)} input / {fmtTok(data.totals.output_tokens)} output tokens
                        {data.totals.estimated_calls > 0 && <> · {data.totals.estimated_calls} estimated</>}
                    </div>

                    {/* ── partner × provider matrix ──────────────────────── */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4" /> Spend by partner</h2>
                                <Link to="/admin/customers" className="text-xs text-accent inline-flex items-center gap-1 hover:underline">
                                    Grant credits / set caps in Customers <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                                            <th className="py-2 pr-3 font-medium">Partner</th>
                                            {providerIds.map(id => (
                                                <th key={id} className="py-2 px-3 font-medium whitespace-nowrap">
                                                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${provDot(id)}`} />
                                                    {provLabel(id)}
                                                </th>
                                            ))}
                                            <th className="py-2 px-3 font-medium">Total ({RANGES.find(r => r[0] === range)?.[1]})</th>
                                            <th className="py-2 pl-3 font-medium">Lifetime vs cap</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activePartners.map(p => (
                                            <tr key={p.partner_id} className="border-b last:border-0">
                                                <td className="py-2.5 pr-3">
                                                    <div className="font-medium">{p.name}</div>
                                                    {p.status !== 'active' && <div className="text-[10px] text-muted-foreground">{p.status}</div>}
                                                </td>
                                                {providerIds.map(id => {
                                                    const c = p.by_provider[id];
                                                    return (
                                                        <td key={id} className="py-2.5 px-3 whitespace-nowrap">
                                                            {c ? (
                                                                <>
                                                                    <span>{fmtUSD(c.cost_usd)}</span>
                                                                    <span className="text-[10px] text-muted-foreground ml-1">({c.calls})</span>
                                                                </>
                                                            ) : <span className="text-muted-foreground/50">—</span>}
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-2.5 px-3 font-semibold whitespace-nowrap">{fmtUSD(p.cost_usd)}</td>
                                                <td className="py-2.5 pl-3"><CapCell cap={p.credit_cap_usd} lifetime={p.lifetime_cost_usd} /></td>
                                            </tr>
                                        ))}
                                        {hasUntagged && (
                                            <tr className="border-b last:border-0 bg-muted/30">
                                                <td className="py-2.5 pr-3">
                                                    <div className="font-medium flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> Platform (untagged)</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {data.untagged.contexts.slice(0, 4).map(c => `${c.context} ${fmtUSD(c.cost_usd)}`).join(' · ')}
                                                    </div>
                                                </td>
                                                {providerIds.map(id => {
                                                    const c = data.untagged.providers[id];
                                                    return (
                                                        <td key={id} className="py-2.5 px-3 whitespace-nowrap">
                                                            {c ? (
                                                                <>
                                                                    <span>{fmtUSD(c.cost_usd)}</span>
                                                                    <span className="text-[10px] text-muted-foreground ml-1">({c.calls})</span>
                                                                </>
                                                            ) : <span className="text-muted-foreground/50">—</span>}
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-2.5 px-3 font-semibold whitespace-nowrap">{fmtUSD(data.untagged.cost_usd)}</td>
                                                <td className="py-2.5 pl-3 text-muted-foreground text-xs">platform overhead</td>
                                            </tr>
                                        )}
                                        {!activePartners.length && !hasUntagged && (
                                            <tr><td colSpan={providerIds.length + 3} className="py-4 text-muted-foreground text-sm">No spend in this range.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-3">
                                Caps are enforced on <span className="font-medium">lifetime</span> spend at the metering choke point — a partner at 100% is blocked
                                until more credit is granted. Untagged rows are platform features (CEO chat, admin tools) not billed to any partner.
                            </p>
                        </CardContent>
                    </Card>

                    {/* ── model breakdown ────────────────────────────────── */}
                    {models.length > 0 && (
                        <Card>
                            <CardContent className="p-4">
                                <h2 className="font-semibold mb-3">Cost by model</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                                                <th className="py-2 pr-3 font-medium">Model</th>
                                                <th className="py-2 px-3 font-medium">Provider</th>
                                                <th className="py-2 px-3 font-medium text-right">Calls</th>
                                                <th className="py-2 px-3 font-medium text-right">Input</th>
                                                <th className="py-2 px-3 font-medium text-right">Output</th>
                                                <th className="py-2 pl-3 font-medium text-right">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {models.map(m => (
                                                <tr key={`${m.provider}-${m.model}`} className="border-b last:border-0">
                                                    <td className="py-2 pr-3 font-mono text-xs">
                                                        {m.model}
                                                        {m.estimated_calls > 0 && <span className="ml-1.5 text-amber-600 dark:text-amber-400" title={`${m.estimated_calls} estimated calls`}>~</span>}
                                                    </td>
                                                    <td className="py-2 px-3 whitespace-nowrap">
                                                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${provDot(m.provider)}`} />
                                                        {provLabel(m.provider)}
                                                    </td>
                                                    <td className="py-2 px-3 text-right">{m.calls}</td>
                                                    <td className="py-2 px-3 text-right">{fmtTok(m.input_tokens)}</td>
                                                    <td className="py-2 px-3 text-right">{fmtTok(m.output_tokens)}</td>
                                                    <td className="py-2 pl-3 text-right font-medium">{fmtUSD(m.cost_usd)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-3">
                                    Per-model $/MTok prices live server-side in <code className="bg-muted rounded px-1">partner/usage.js</code> — that table is what
                                    turns tokens into the costs above, so it is the place to tune when comparing providers for the pricing model.
                                    Rows marked <span className="text-amber-600 dark:text-amber-400">~</span> include estimated token counts (provider didn&rsquo;t report usage; ~chars/4).
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
