import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { growthApi } from '@/lib/growthApi';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Download, TrendingUp } from 'lucide-react';

const SIG_COLOR = { high: 'text-rose-600', medium: 'text-amber-600', low: 'text-muted-foreground' };
const CONF_COLOR = { high: 'text-emerald-600', medium: 'text-amber-600', low: 'text-muted-foreground' };

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

export default function GrowthReportDetailPage() {
    const { id } = useParams();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const r = await growthApi.report(id);
                setReport(r.item);
            } catch (err) {
                toast.error(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    if (loading) return <div className="max-w-4xl mx-auto px-4 py-10 text-muted-foreground">Loading…</div>;
    if (!report) return <div className="max-w-4xl mx-auto px-4 py-10 text-muted-foreground">Not found.</div>;

    const findings = report.findings?.findings || [];
    const recs = report.findings?.recommendations || [];
    const scans = report.findings?.scans || [];
    const revenue = report.findings?.revenue_impact || null;
    const pctRange = revenue ? formatPctRange(revenue.estimated_monthly_lift_pct_low, revenue.estimated_monthly_lift_pct_high) : null;
    const dollarRange = revenue ? formatMoneyRange(revenue.estimated_monthly_lift_dollars_low, revenue.estimated_monthly_lift_dollars_high) : null;

    return (
        <>
            <Helmet><title>Growth report · {new Date(report.created).toLocaleDateString()}</title></Helmet>
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between print:hidden">
                    <Link to={`/growth-partner/${report.business_id}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Back to business
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Download className="w-4 h-4 mr-1" /> Download PDF
                    </Button>
                </div>
                <div className="mt-2 mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold">Growth report</h1>
                    <p className="text-sm text-muted-foreground mt-1">{new Date(report.created).toLocaleString()}</p>
                    <div className={`text-xs mt-1 font-medium ${report.status === 'completed' ? 'text-emerald-600' : report.status === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>
                        Status: {report.status}{report.error ? ` — ${report.error}` : ''}
                    </div>
                    {report.findings?.key_path && (
                        <div className="text-xs text-muted-foreground mt-1 print:hidden">Generated via {report.findings.key_path}</div>
                    )}
                </div>

                {revenue && (pctRange || dollarRange) && (
                    <Card className="mb-4 border-emerald-200 bg-emerald-50/30">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-700" />
                                Projected revenue impact
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-3">
                                {dollarRange && (
                                    <div>
                                        <div className="text-3xl font-bold text-emerald-700">{dollarRange}<span className="text-base font-normal text-muted-foreground"> / month</span></div>
                                        <div className="text-xs text-muted-foreground mt-0.5">if you act on the recommendations below</div>
                                    </div>
                                )}
                                {pctRange && (
                                    <div>
                                        <div className="text-2xl font-semibold">{pctRange}<span className="text-sm font-normal text-muted-foreground"> monthly lift</span></div>
                                    </div>
                                )}
                                {revenue.time_horizon_months ? (
                                    <div className="text-sm">
                                        <span className="text-muted-foreground">Horizon:</span> <span className="font-medium">{revenue.time_horizon_months} months</span>
                                    </div>
                                ) : null}
                                {revenue.confidence ? (
                                    <div className="text-sm">
                                        <span className="text-muted-foreground">Confidence:</span>{' '}
                                        <span className={`font-medium ${CONF_COLOR[revenue.confidence] || ''}`}>{revenue.confidence}</span>
                                    </div>
                                ) : null}
                            </div>
                            {revenue.reasoning && (
                                <p className="text-sm text-muted-foreground leading-relaxed">{revenue.reasoning}</p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {report.summary && (
                    <Card className="mb-4">
                        <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
                        <CardContent className="leading-relaxed whitespace-pre-wrap">{report.summary}</CardContent>
                    </Card>
                )}

                {findings.length > 0 && (
                    <Card className="mb-4">
                        <CardHeader><CardTitle className="text-base">What competitors did</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            {findings.map((f, i) => (
                                <div key={i} className="border rounded-md p-3">
                                    <div className="flex justify-between text-sm">
                                        <div className="font-medium">{f.competitor}</div>
                                        <div className={`text-xs font-medium ${SIG_COLOR[f.significance] || 'text-muted-foreground'}`}>{f.significance || 'n/a'}</div>
                                    </div>
                                    <div className="text-sm mt-1">{f.what_changed}</div>
                                    {f.evidence && <div className="text-xs text-muted-foreground mt-1 break-all">↳ {f.evidence}</div>}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {recs.length > 0 && (
                    <Card className="mb-4">
                        <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            {recs.map((r, i) => (
                                <div key={i} className="border rounded-md p-3">
                                    <div className="text-sm font-medium">{i + 1}. {r.action}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{r.rationale}</div>
                                    {r.estimated_impact && <div className="text-xs text-emerald-700 mt-1">Estimated impact: {r.estimated_impact}</div>}
                                    {r.owner_agent && <div className="text-xs text-muted-foreground mt-1">Owner: {r.owner_agent}</div>}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {scans.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle className="text-base">Raw scan data</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            {scans.map((s, i) => (
                                <div key={i}>
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="text-sm font-medium">{s.name}</div>
                                        <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                            {s.website} <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                    {s.notice && <div className="text-[11px] text-amber-600 mb-1">{s.notice}</div>}
                                    {!s.ok ? (
                                        <div className="text-xs text-rose-600">Scan failed: {s.error}</div>
                                    ) : s.recent_items?.length ? (
                                        <ul className="space-y-1 text-xs">
                                            {s.recent_items.map((it, j) => (
                                                <li key={j} className="text-muted-foreground">
                                                    <span className="opacity-70">{it.published || ''}</span> · {it.link ? <a href={it.link} target="_blank" rel="noreferrer" className="hover:text-foreground">{it.title}</a> : it.title}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">Nothing in the last 30 days (or no feed exposed).</div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}
