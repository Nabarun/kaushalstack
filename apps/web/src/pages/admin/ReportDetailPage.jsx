import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const SIG_COLOR = { high: 'text-rose-400', medium: 'text-amber-400', low: 'text-zinc-400' };

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

    return (
        <>
            <Helmet><title>Growth report · Admin</title></Helmet>
            <div className="mb-6">
                <Link to={`/admin/businesses/${report.business_id}`} className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to business
                </Link>
                <h1 className="text-2xl font-semibold mt-2">Growth report — {new Date(report.created).toLocaleString()}</h1>
                <div className={`text-xs mt-1 ${report.status === 'completed' ? 'text-emerald-400' : report.status === 'failed' ? 'text-rose-400' : 'text-amber-400'}`}>
                    Status: {report.status}{report.error ? ` — ${report.error}` : ''}
                </div>
                {report.findings?.key_path && (
                    <div className="text-xs text-zinc-500 mt-1">Generated via {report.findings.key_path}</div>
                )}
            </div>

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
                                    <div className="text-xs text-zinc-500">Nothing in the last 24h (or no feed exposed).</div>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </>
    );
}
