// Platform-wide round-table stats shown at the top of the Customers page.
// Moved out of the old BusinessesPage when Businesses and Teams merged; the
// partner stats panel that sat beside it was retired — the AI Usage tab
// covers partner spend, calls and tokens in more detail.

import React, { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { fmtN } from '@/lib/adminFormat';
import { toast } from 'sonner';
import { MessageSquare, KeyRound, AlertTriangle, UserCheck } from 'lucide-react';

const RANGES = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 days' },
    { key: 'mtd',   label: 'Month to date' },
    { key: 'all',   label: 'All time' },
];

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

function RangeTabs({ range, setRange }) {
    return (
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
    );
}

export function RoundTableStatsPanel() {
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
                <RangeTabs range={range} setRange={setRange} />
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard icon={MessageSquare} label="Chats"           value={fmtN(t?.chats)}           sub={`${fmtN(t?.unique_users)} unique users`} />
                    <StatCard icon={UserCheck}     label="Free tier users" value={fmtN(t?.free_tier_users)} sub={`${fmtN(t?.at_limit)} hit limit`} />
                    <StatCard icon={AlertTriangle} label="At free limit"   value={fmtN(t?.at_limit)}        sub="need BYOK key" />
                    <StatCard icon={KeyRound}      label="BYOK users"      value={fmtN(t?.byok_users)}      sub="own API key" />
                </div>
            )}

            {!loading && (
                <div className="grid md:grid-cols-2 gap-4">
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
