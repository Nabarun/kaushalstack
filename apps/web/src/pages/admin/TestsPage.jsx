// Tests — the portfolio test dashboard.
//
// Fed by ~/Projects/KaushalStackTestFramework, which posts one results.json a
// day to /admin/sprints/test-report. Each customer project is one card: the
// latest run's green/red state, a 14-run trend strip, and the individual tests
// behind it so a failure names itself instead of being a count.

import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/adminApi';
import { fmtRelative } from '@/lib/adminFormat';
import { toast } from 'sonner';
import {
    FlaskConical, CheckCircle2, XCircle, MinusCircle, RefreshCw,
    ChevronDown, ChevronRight, Clock, AlertTriangle,
} from 'lucide-react';

function StatusIcon({ status, className = 'w-4 h-4' }) {
    if (status === 'pass') return <CheckCircle2 className={`${className} text-green-600 dark:text-green-400`} />;
    if (status === 'fail') return <XCircle className={`${className} text-red-600 dark:text-red-400`} />;
    return <MinusCircle className={`${className} text-amber-600 dark:text-amber-400`} />;
}

// One block per run, oldest → newest. Reads at a glance as a stability strip:
// a lone red block among greens is a flake, a run of reds is a real breakage.
function TrendStrip({ history }) {
    if (!history?.length) return <span className="text-[11px] text-muted-foreground">no history</span>;
    return (
        <div className="flex items-center gap-0.5">
            {history.map((h, i) => (
                <span
                    key={i}
                    title={`${new Date(h.created).toLocaleString()} — ${h.passed} passed, ${h.failed} failed`}
                    className={`w-1.5 h-4 rounded-sm ${
                        h.status === 'pass' ? 'bg-green-500/70'
                            : h.status === 'fail' ? 'bg-red-500/70'
                                : 'bg-amber-500/70'
                    }`}
                />
            ))}
        </div>
    );
}

function TeamCard({ item }) {
    const [open, setOpen] = useState(item.latest?.status && item.latest.status !== 'pass');
    const latest = item.latest;

    if (!latest) {
        return (
            <Card>
                <CardContent className="p-4 flex items-center gap-3">
                    <MinusCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                            No suite reporting yet — this project has no daily test run.
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const failing = latest.tests.filter(t => t.status !== 'pass');
    const stale = Date.now() - new Date(latest.created).getTime() > 36 * 3600 * 1000;

    return (
        <Card className={latest.status !== 'pass' ? 'border-red-500/40' : undefined}>
            <CardContent className="p-4">
                <button
                    type="button"
                    className="w-full flex items-center gap-3 text-left"
                    onClick={() => setOpen(v => !v)}
                >
                    {open ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    <StatusIcon status={latest.status} className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{item.name}</span>
                            <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                                latest.status === 'pass'
                                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                            }`}>
                                {latest.passed}/{latest.total}
                            </span>
                            {stale && (
                                <span
                                    title="Last run is over 36h old — the daily job may not be running"
                                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                >
                                    <AlertTriangle className="w-3 h-3" /> stale
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {fmtRelative(latest.created)}
                            </span>
                            {latest.runner && <span>· {latest.runner}</span>}
                            {latest.duration_ms > 0 && <span>· {latest.duration_ms}ms</span>}
                        </div>
                    </div>
                    <TrendStrip history={item.history} />
                </button>

                {open && (
                    <div className="mt-3 pl-7 space-y-1">
                        {latest.tests.length === 0 && (
                            <div className="text-xs text-muted-foreground">No per-test detail in this run.</div>
                        )}
                        {latest.tests.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs py-1 border-b last:border-b-0">
                                <StatusIcon status={t.status} className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className={t.status === 'pass' ? '' : 'text-red-600 dark:text-red-400'}>{t.name}</div>
                                    {t.error && (
                                        <pre className="mt-1 text-[11px] whitespace-pre-wrap text-muted-foreground bg-muted/40 rounded p-2 overflow-x-auto">
                                            {t.error}
                                        </pre>
                                    )}
                                </div>
                                {t.duration_ms > 0 && (
                                    <span className="text-muted-foreground tabular-nums flex-shrink-0">{t.duration_ms}ms</span>
                                )}
                            </div>
                        ))}
                        {failing.length > 0 && (
                            <div className="text-[11px] text-muted-foreground pt-2">
                                {item.project}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function TestsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            setData(await adminApi.getTestDashboard());
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const t = data?.totals;
    const sorted = useMemo(() => {
        if (!data?.items) return [];
        // Red first, then unreported, then green — the dashboard should open on
        // whatever needs attention.
        const rank = i => (!i.latest ? 1 : i.latest.status === 'pass' ? 2 : 0);
        return [...data.items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }, [data]);

    return (
        <div className="space-y-4">
            <Helmet><title>Tests · Admin</title></Helmet>

            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold flex items-center gap-2">
                    <FlaskConical className="w-5 h-5" /> Test Dashboard
                </h1>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </Button>
            </div>

            <p className="text-sm text-muted-foreground max-w-3xl">
                Every customer project runs its suite once a day and reports here, so a business that
                broke overnight is visible before anyone opens a terminal. Expand a project to see the
                individual tests behind its result.
            </p>

            {t && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border bg-card p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Green</div>
                        <div className="text-2xl font-semibold mt-0.5 text-green-600 dark:text-green-400">{t.green}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">of {t.reporting} reporting</div>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Red</div>
                        <div className={`text-2xl font-semibold mt-0.5 ${t.red > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{t.red}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">projects failing</div>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Tests</div>
                        <div className="text-2xl font-semibold mt-0.5">{t.passed}/{t.tests}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">passing across the portfolio</div>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Not reporting</div>
                        <div className="text-2xl font-semibold mt-0.5">{t.teams - t.reporting}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">projects with no suite</div>
                    </div>
                </div>
            )}

            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!loading && sorted.length === 0 && (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No sprint teams yet — seed them on the Sprint tab first.
                </CardContent></Card>
            )}
            {sorted.map(item => <TeamCard key={item.team_id} item={item} />)}

            {!loading && data && (
                <p className="text-[11px] text-muted-foreground pt-2">
                    Runs are posted by <code>KaushalStackTestFramework/run_daily.sh</code> on the developer
                    machine, since the suites exercise the project repos directly.
                </p>
            )}
        </div>
    );
}
