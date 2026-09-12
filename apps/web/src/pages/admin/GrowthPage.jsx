import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { TrendingUp, RefreshCw, MessagesSquare, AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2, Users } from 'lucide-react';

// Pipeline-only agents never deliberate; the round-table route drops them,
// so drop them here too and the "N agents" on the button is what actually runs.
const PIPELINE_IDS = new Set(['uepji0o2teuf29b', '0v9syxxawznp95v', 'hostingerdeploy']);

const STATUSES = [
    ['proposed',    'Proposed'],
    ['in_progress', 'In progress'],
    ['done',        'Done'],
    ['parked',      'Parked'],
];
const STATUS_TONE = {
    proposed:    'bg-muted text-muted-foreground',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    done:        'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    parked:      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};
const SEVERITY_TONE = {
    high:   'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
    medium: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
    low:    'border-border text-muted-foreground',
};

function discussionPrompt(m) {
    const obstacles = (m.obstacles || []).map(o => `- ${o.text}`).join('\n') || '- (none recorded yet)';
    return `Growth measure: "${m.title}"\n${m.summary || ''}\n\nKnown obstacles:\n${obstacles}\n\nEach of you proposed something in this direction when asked what would help KaushalStack sell more. Working together: how do we actually achieve this for our customers? Be specific about sequence, what to build first, what to skip, and how we get past each obstacle.`;
}

function Measure({ m, onChange, onDelete }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [obstacle, setObstacle] = useState('');
    const [busy, setBusy] = useState(false);
    const team = useMemo(() => (m.agents || []).filter(a => !PIPELINE_IDS.has(a.id)), [m.agents]);
    const skipped = (m.agents || []).length - team.length;

    async function patch(data) {
        setBusy(true);
        try {
            const r = await adminApi.updateGrowthMeasure(m.id, data);
            onChange({ ...m, ...r.item, agents: m.agents });
        } catch (err) {
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setBusy(false);
        }
    }

    function addObstacle(e) {
        e.preventDefault();
        const text = obstacle.trim();
        if (!text) return;
        patch({ obstacles: [...(m.obstacles || []), { text, severity: 'medium' }] });
        setObstacle('');
    }
    function removeObstacle(i) {
        patch({ obstacles: (m.obstacles || []).filter((_, j) => j !== i) });
    }
    function discuss() {
        if (team.length === 0) return toast.error('No round-table agents on this measure');
        navigate('/roundtable', { state: { team, query: discussionPrompt(m) } });
    }

    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                                <Users className="h-3 w-3" /> {m.priority ?? (m.agents || []).length} agents
                            </span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[m.status] || STATUS_TONE.proposed}`}>
                                {STATUSES.find(s => s[0] === m.status)?.[1] || m.status || 'Proposed'}
                            </span>
                        </div>
                        <h2 className="mt-2 text-lg font-semibold leading-snug">{m.title}</h2>
                        {m.summary && <p className="mt-1 text-sm text-foreground/90">{m.summary}</p>}
                        {m.rationale && <p className="mt-2 text-sm text-muted-foreground">{m.rationale}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <select
                            value={m.status || 'proposed'}
                            disabled={busy}
                            onChange={e => patch({ status: e.target.value })}
                            className="rounded-lg border bg-background px-2 py-1.5 text-xs"
                        >
                            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button onClick={() => onDelete(m)} title="Remove measure" className="rounded-lg border p-1.5 text-muted-foreground hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* obstacles */}
                <div className="mt-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Obstacles
                    </div>
                    <ul className="space-y-1.5">
                        {(m.obstacles || []).map((o, i) => (
                            <li key={i} className={`flex items-start gap-2 rounded-lg border-l-2 bg-muted/40 px-3 py-2 text-sm ${SEVERITY_TONE[o.severity] || SEVERITY_TONE.low}`}>
                                <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-wide">{o.severity || 'note'}</span>
                                <span className="flex-1 text-foreground/90">{o.text}</span>
                                <button onClick={() => removeObstacle(i)} disabled={busy} className="shrink-0 text-muted-foreground hover:text-red-600" title="Remove">×</button>
                            </li>
                        ))}
                        {(m.obstacles || []).length === 0 && <li className="text-sm text-muted-foreground">None recorded.</li>}
                    </ul>
                    <form onSubmit={addObstacle} className="mt-2 flex gap-2">
                        <input
                            value={obstacle}
                            onChange={e => setObstacle(e.target.value)}
                            placeholder="Add an obstacle…"
                            className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm"
                        />
                        <button type="submit" disabled={busy || !obstacle.trim()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">
                            <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                    </form>
                </div>

                {/* agents */}
                <div className="mt-4">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Proposed by</div>
                    <div className="flex flex-wrap gap-1.5">
                        {(m.agents || []).map(a => (
                            <span key={a.id} className="rounded-md border bg-background px-2 py-0.5 text-xs" title={a.name}>
                                <span className="font-semibold">{a.agent_name || a.name}</span>
                                {a.category && <span className="text-muted-foreground"> · {a.category}</span>}
                                {a.private && <span className="text-muted-foreground"> · private</span>}
                            </span>
                        ))}
                        {(m.agents || []).length === 0 && <span className="text-sm text-muted-foreground">No agents assigned.</span>}
                    </div>
                </div>

                {/* what they said */}
                {(m.suggestions || []).length > 0 && (
                    <div className="mt-4">
                        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} What they said ({m.suggestions.length})
                        </button>
                        {open && (
                            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                                {m.suggestions.map((s, i) => (
                                    <li key={i} className="rounded-lg border px-3 py-2 text-sm">
                                        <div className="text-xs font-semibold text-muted-foreground">{s.agent}</div>
                                        <div className="font-medium">{s.one_thing}</div>
                                        <div className="text-xs text-muted-foreground">{s.why}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
                    <button onClick={discuss} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                        <MessagesSquare className="h-4 w-4" /> Discuss with these {team.length} agents
                    </button>
                    {skipped > 0 && <span className="text-xs text-muted-foreground">{skipped} pipeline agent{skipped > 1 ? 's' : ''} sit{skipped > 1 ? '' : 's'} out of round tables</span>}
                    <span className="text-xs text-muted-foreground">Opens the round table with this team and the measure as the question.</span>
                </div>
            </CardContent>
        </Card>
    );
}

export default function GrowthPage() {
    const [items, setItems] = useState(null);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState('');

    async function load() {
        setLoading(true);
        try {
            const r = await adminApi.growthMeasures();
            setItems(r.items || []);
        } catch (err) {
            toast.error(`Failed to load growth measures: ${err.message}`);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    async function create(e) {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        try {
            const r = await adminApi.createGrowthMeasure({ title: t, priority: 0 });
            setItems(prev => [...(prev || []), { ...r.item, agents: [] }]);
            setTitle('');
        } catch (err) {
            toast.error(`Could not add: ${err.message}`);
        }
    }
    async function remove(m) {
        if (!window.confirm(`Remove "${m.title}"?`)) return;
        try {
            await adminApi.deleteGrowthMeasure(m.id);
            setItems(prev => prev.filter(x => x.id !== m.id));
        } catch (err) {
            toast.error(`Could not remove: ${err.message}`);
        }
    }

    const sorted = useMemo(() => [...(items || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.title.localeCompare(b.title)), [items]);
    const assigned = useMemo(() => new Set((items || []).flatMap(m => (m.agents || []).map(a => a.id))).size, [items]);

    return (
        <div className="max-w-5xl">
            <Helmet><title>Growth — Admin</title></Helmet>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 text-2xl font-bold"><TrendingUp className="h-6 w-6" /> Growth</h1>
                <button onClick={load} className="rounded-lg border p-2 text-muted-foreground hover:text-foreground" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
                What the agents said would sell KaushalStack more, ranked by how many asked for it. Each measure carries the obstacles we already know about and the agents who proposed it — open a round table with them to work out how to get there.
                {items && items.length > 0 && <> {items.length} measures · {assigned} agents assigned.</>}
            </p>

            {loading && !items ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
                <div className="space-y-4">
                    {sorted.map(m => (
                        <Measure key={m.id} m={m} onChange={u => setItems(prev => prev.map(x => (x.id === u.id ? u : x)))} onDelete={remove} />
                    ))}
                    {sorted.length === 0 && (
                        <Card><CardContent className="p-5 text-sm text-muted-foreground">No measures yet. Seed them from the agent survey, or add one below.</CardContent></Card>
                    )}
                    <form onSubmit={create} className="flex gap-2">
                        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a measure…" className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm" />
                        <button type="submit" disabled={!title.trim()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><Plus className="h-4 w-4" /> Add</button>
                    </form>
                </div>
            )}
        </div>
    );
}
