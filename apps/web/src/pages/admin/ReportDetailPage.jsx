import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Download, TrendingUp, Globe } from 'lucide-react';

const SIG_COLOR = { high: 'text-rose-400', medium: 'text-amber-400', low: 'text-zinc-400' };
const CONF_COLOR = { high: 'text-emerald-400', medium: 'text-amber-400', low: 'text-zinc-400' };

function formatMoneyRange(lo, hi) {
    const fmt = (n) => `$${Math.round(Number(n)).toLocaleString()}`;
    if (lo == null && hi == null) return null;
    if (lo == null) return fmt(hi);
    if (hi == null || lo === hi) return fmt(lo);
    return `${fmt(lo)} – ${fmt(hi)}`;
}
function formatPctRange(lo, hi) {
    const fmt = (n) => `${Number(n).toFixed(Number.isInteger(Number(n)) ? 0 : 1)}%`;
    if (lo == null && hi == null) return null;
    if (lo == null) return fmt(hi);
    if (hi == null || lo === hi) return fmt(lo);
    return `${fmt(lo)} – ${fmt(hi)}`;
}

export default function ReportDetailPage() {
    const { id } = useParams();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const r = await adminApi.getReport(id);
                setReport(r.item);
            } catch (err) {
                toast.error(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    if (loading) return <p className="text-zinc-400">Loading…</p>;
    if (!report) return <p className="text-zinc-400">Not found.</p>;

    const findings = report.findings?.findings || [];
    const recs = report.findings?.recommendations || [];
    const scans = report.findings?.scans || [];
    const revenue = report.findings?.revenue_impact || null;
    const pctRange = revenue ? formatPctRange(revenue.estimated_monthly_lift_pct_low, revenue.estimated_monthly_lift_pct_high) : null;
    const dollarRange = revenue ? formatMoneyRange(revenue.estimated_monthly_lift_dollars_low, revenue.estimated_monthly_lift_dollars_high) : null;
    const market = report.findings?.market_opportunity || null;
    const tamRange = market?.tam ? formatMoneyRange(market.tam.low_dollars, market.tam.high_dollars) : null;
    const samRange = market?.sam ? formatMoneyRange(market.sam.low_dollars, market.sam.high_dollars) : null;
    const somRange = market?.som ? formatMoneyRange(market.som.low_dollars, market.som.high_dollars) : null;

    return (
        <>
            <Helmet><title>Growth report · Admin</title></Helmet>
            <div className="mb-6">
                <div className="flex items-center justify-between print:hidden">
                    <Link to={`/admin/businesses/${report.business_id}`} className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Back to business
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => window.print()} className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800">
                        <Download className="w-4 h-4 mr-1" /> Download PDF
                    </Button>
                </div>
                <h1 className="text-2xl font-semibold mt-2">Growth report — {new Date(report.created).toLocaleString()}</h1>
                <div className={`text-xs mt-1 ${report.status === 'completed' ? 'text-emerald-400' : report.status === 'failed' ? 'text-rose-400' : 'text-amber-400'}`}>
                    Status: {report.status}{report.error ? ` — ${report.error}` : ''}
                </div>
                {report.findings?.key_path && (
                    <div className="text-xs text-zinc-500 mt-1 print:hidden">Generated via {report.findings.key_path}</div>
                )}
            </div>

            {revenue && (pctRange || dollarRange) && (
                <Card className="bg-emerald-950/20 border-emerald-900 mb-4">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            Projected revenue impact
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-3">
                            {dollarRange && (
                                <div>
                                    <div className="text-3xl font-bold text-emerald-400">{dollarRange}<span className="text-base font-normal text-zinc-400"> / month</span></div>
                                    <div className="text-xs text-zinc-400 mt-0.5">if you act on the recommendations below</div>
                                </div>
                            )}
                            {pctRange && (
                                <div className="text-2xl font-semibold">{pctRange}<span className="text-sm font-normal text-zinc-400"> monthly lift</span></div>
                            )}
                            {revenue.time_horizon_months ? (
                                <div className="text-sm"><span className="text-zinc-400">Horizon:</span> <span className="font-medium">{revenue.time_horizon_months} months</span></div>
                            ) : null}
                            {revenue.confidence ? (
                                <div className="text-sm"><span className="text-zinc-400">Confidence:</span> <span className={`font-medium ${CONF_COLOR[revenue.confidence] || ''}`}>{revenue.confidence}</span></div>
                            ) : null}
                        </div>
                        {revenue.reasoning && (
                            <p className="text-sm text-zinc-300 leading-relaxed">{revenue.reasoning}</p>
                        )}
                    </CardContent>
                </Card>
            )}

            {market && (tamRange || samRange || somRange) && (
                <Card className="bg-indigo-950/20 border-indigo-900 mb-4">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Globe className="w-4 h-4 text-indigo-400" />
                            Market opportunity (TAM / SAM / SOM)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid sm:grid-cols-3 gap-3 mb-3">
                            {[
                                { label: 'TAM', range: tamRange, scope: market.tam?.scope, note: 'annual, total category' },
                                { label: 'SAM', range: samRange, scope: market.sam?.scope, note: 'annual, serviceable' },
                                { label: 'SOM', range: somRange, scope: market.som?.scope, note: `obtainable${market.som?.horizon_years ? `, ${market.som.horizon_years}y horizon` : ''}` },
                            ].map((b, i) => b.range ? (
                                <div key={i} className="bg-zinc-950 border border-indigo-900 rounded-md p-3">
                                    <div className="text-xs uppercase tracking-wide text-indigo-400 font-semibold">{b.label}</div>
                                    <div className="text-lg font-bold text-indigo-200 mt-0.5">{b.range}</div>
                                    <div className="text-xs text-zinc-400 mt-0.5">{b.note}</div>
                                    {b.scope && <div className="text-xs text-zinc-500 mt-1 italic">{b.scope}</div>}
                                </div>
                            ) : null)}
                        </div>
                        {market.confidence && (
                            <div className="text-sm mb-1"><span className="text-zinc-400">Confidence:</span> <span className={`font-medium ${CONF_COLOR[market.confidence] || ''}`}>{market.confidence}</span></div>
                        )}
                        {market.reasoning && <p className="text-sm text-zinc-300 leading-relaxed">{market.reasoning}</p>}
                    </CardContent>
                </Card>
            )}

            {report.summary && (
                <Card className="bg-zinc-900 border-zinc-800 mb-4">
                    <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
                    <CardContent className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{report.summary}</CardContent>
                </Card>
            )}

            {findings.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800 mb-4">
                    <CardHeader><CardTitle className="text-base">What competitors did</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {findings.map((f, i) => (
                            <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-md p-3">
                                <div className="flex justify-between text-sm">
                                    <div className="font-medium">{f.competitor}</div>
                                    <div className={`text-xs ${SIG_COLOR[f.significance] || 'text-zinc-400'}`}>{f.significance || 'n/a'}</div>
                                </div>
                                <div className="text-sm text-zinc-300 mt-1">{f.what_changed}</div>
                                {f.evidence && <div className="text-xs text-zinc-500 mt-1 break-all">↳ {f.evidence}</div>}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {recs.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800 mb-4">
                    <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {recs.map((r, i) => (
                            <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-md p-3">
                                <div className="text-sm font-medium">{i + 1}. {r.action}</div>
                                <div className="text-xs text-zinc-400 mt-1">{r.rationale}</div>
                                {r.estimated_impact && <div className="text-xs text-emerald-400 mt-1">Estimated impact: {r.estimated_impact}</div>}
                                {r.owner_agent && <div className="text-xs text-zinc-500 mt-1">Owner: {r.owner_agent}</div>}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {scans.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader><CardTitle className="text-base">Raw scan data</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {scans.map((s, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-center mb-1">
                                    <div className="text-sm font-medium">{s.name}</div>
                                    <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1">
                                        {s.website} <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                {s.notice && <div className="text-[11px] text-amber-400 mb-1">{s.notice}</div>}
                                {!s.ok ? (
                                    <div className="text-xs text-rose-400">Scan failed: {s.error}</div>
                                ) : s.recent_items?.length ? (
                                    <ul className="space-y-1 text-xs">
                                        {s.recent_items.map((it, j) => (
                                            <li key={j} className="text-zinc-400">
                                                <span className="text-zinc-500">{it.published || ''}</span> · {it.link ? <a href={it.link} target="_blank" rel="noreferrer" className="hover:text-zinc-200">{it.title}</a> : it.title}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-xs text-zinc-500">Nothing in the last 7 days (or no feed exposed).</div>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </>
    );
}
