import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import {
    Rocket, ChevronDown, ChevronRight, Plus, Trash2, Users, ClipboardList,
    CheckCircle2, XCircle, MinusCircle, FlaskConical, Megaphone, RefreshCw,
    MessageSquare, Send, Eraser,
} from 'lucide-react';

const STATUSES = ['backlog', 'planned', 'in_progress', 'review', 'done', 'blocked'];
const STATUS_LABELS = {
    backlog: 'Backlog', planned: 'Planned', in_progress: 'In progress',
    review: 'Review', done: 'Done', blocked: 'Blocked',
};
const STATUS_COLORS = {
    backlog:     'bg-muted text-muted-foreground',
    planned:     'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    review:      'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    done:        'bg-green-500/10 text-green-600 dark:text-green-400',
    blocked:     'bg-red-500/10 text-red-600 dark:text-red-400',
};
const PRIORITY_COLORS = {
    P0: 'bg-red-500/10 text-red-600 dark:text-red-400',
    P1: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    P2: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    P3: 'bg-muted text-muted-foreground',
};
const TYPE_ICONS = { test: FlaskConical };

function initials(name) {
    if (!name) return '?';
    return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function fmtRelative(iso) {
    if (!iso) return 'never';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 0) return new Date(iso).toLocaleDateString();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

function TestRunBadge({ run }) {
    if (!run) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground">
                <MinusCircle className="w-3 h-3" /> no runs yet
            </span>
        );
    }
    const styles = {
        pass:    ['bg-green-500/10 text-green-600 dark:text-green-400', CheckCircle2],
        fail:    ['bg-red-500/10 text-red-600 dark:text-red-400', XCircle],
        partial: ['bg-amber-500/10 text-amber-600 dark:text-amber-400', MinusCircle],
    };
    const [cls, Icon] = styles[run.status] || styles.partial;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
            <Icon className="w-3 h-3" />
            {run.passed}/{run.total} · {fmtRelative(run.created)}
        </span>
    );
}

function AgentChip({ member }) {
    return (
        <div className="rounded-lg border bg-card p-3 flex gap-2.5" title={member.why}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-xs font-semibold">
                {initials(member.agent_name)}
            </div>
            <div className="min-w-0">
                <div className="font-medium text-sm truncate">{member.agent_name}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-1">{member.role}</div>
            </div>
        </div>
    );
}

function WorkItemRow({ item, onStatus, onDelete }) {
    const TypeIcon = TYPE_ICONS[item.type];
    return (
        <div className="flex items-start gap-2 py-2 border-b last:border-b-0">
            <span className={`mt-0.5 flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.P2}`}>
                {item.priority}
            </span>
            <div className="flex-1 min-w-0">
                <div className="text-sm flex items-center gap-1.5">
                    {TypeIcon && <TypeIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    <span className={item.status === 'done' ? 'line-through text-muted-foreground' : ''}>{item.title}</span>
                </div>
                {item.detail && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2" title={item.detail}>{item.detail}</div>
                )}
            </div>
            <select
                value={item.status}
                onChange={(e) => onStatus(item, e.target.value)}
                className={`text-[11px] rounded-md px-1.5 py-1 border-0 cursor-pointer ${STATUS_COLORS[item.status]}`}
            >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <button onClick={() => onDelete(item)} className="text-muted-foreground hover:text-red-500 mt-1" title="Delete item">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

function AddItemForm({ teamId, onAdded }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [detail, setDetail] = useState('');
    const [type, setType] = useState('feature');
    const [priority, setPriority] = useState('P2');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!title.trim()) return;
        setBusy(true);
        try {
            const { item } = await adminApi.createSprintItem(teamId, { title, detail, type, priority, status: 'backlog' });
            onAdded(item);
            setTitle(''); setDetail(''); setOpen(false);
            toast.success('Work item added');
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add work item
            </Button>
        );
    }
    return (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Input placeholder="Detail (optional)" value={detail} onChange={e => setDetail(e.target.value)} />
            <div className="flex items-center gap-2">
                <select value={type} onChange={e => setType(e.target.value)} className="text-xs border rounded-md px-2 py-1.5 bg-background">
                    {['feature', 'bug', 'test', 'infra', 'research', 'security'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="text-xs border rounded-md px-2 py-1.5 bg-background">
                    {['P0', 'P1', 'P2', 'P3'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={submit} disabled={busy || !title.trim()}>Add</Button>
            </div>
        </div>
    );
}

// Minimal renderer for the **Name (Role):** speaker markers in replies —
// bold segments only, everything else verbatim.
function ChatText({ text }) {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    return (
        <span className="whitespace-pre-wrap">
            {parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
                ? <strong key={i}>{p.slice(2, -2)}</strong>
                : <span key={i}>{p}</span>)}
        </span>
    );
}

function CeoChat({ teams }) {
    const [open, setOpen] = useState(false);
    const [audience, setAudience] = useState('all');
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const endRef = React.useRef(null);

    const load = async (aud) => {
        try {
            const { items } = await adminApi.listSprintChat(aud);
            setMessages(items);
        } catch (e) {
            toast.error(e.message);
        }
    };

    useEffect(() => { if (open) load(audience); }, [open, audience]);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

    const send = async () => {
        const message = draft.trim();
        if (!message || sending) return;
        setSending(true);
        setDraft('');
        setMessages(m => [...m, { id: 'tmp', role: 'user', agent_name: 'CEO', content: message }]);
        try {
            const { items } = await adminApi.sendSprintChat(audience, message);
            setMessages(m => [...m.filter(x => x.id !== 'tmp'), ...items]);
        } catch (e) {
            toast.error(e.message);
            setMessages(m => m.filter(x => x.id !== 'tmp'));
            setDraft(message);
        } finally {
            setSending(false);
        }
    };

    const clear = async () => {
        if (!window.confirm('Clear this thread?')) return;
        try {
            await adminApi.clearSprintChat(audience);
            setMessages([]);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const audienceName = audience === 'all' ? 'All teams' : (teams.find(t => t.id === audience)?.name || 'Team');

    return (
        <Card>
            <CardContent className="p-4">
                <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(!open)}>
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <MessageSquare className="w-4 h-4" />
                    <span className="font-semibold flex-1">Ask the teams</span>
                    <span className="text-xs text-muted-foreground">CEO chat · {audienceName}</span>
                </button>

                {open && (
                    <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <select
                                value={audience}
                                onChange={e => setAudience(e.target.value)}
                                className="text-sm border rounded-md px-2 py-1.5 bg-background"
                            >
                                <option value="all">All teams (stand-up)</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <div className="flex-1" />
                            {messages.length > 0 && (
                                <Button variant="ghost" size="sm" className="text-xs" onClick={clear}>
                                    <Eraser className="w-3.5 h-3.5 mr-1" /> Clear thread
                                </Button>
                            )}
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-3 max-h-96 overflow-y-auto space-y-3">
                            {messages.length === 0 && !sending && (
                                <div className="text-xs text-muted-foreground text-center py-6">
                                    Ask {audienceName === 'All teams' ? 'all your teams' : `the ${audienceName} team`} anything —
                                    status, plans, risks, or brainstorm an enhancement.
                                </div>
                            )}
                            {messages.map((m, i) => (
                                <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                                        m.role === 'user'
                                            ? 'bg-accent text-white'
                                            : 'bg-card border'
                                    }`}>
                                        {m.role === 'assistant' && (
                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{m.agent_name}</div>
                                        )}
                                        <ChatText text={m.content} />
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div className="text-xs text-muted-foreground italic">The team is preparing an answer…</div>
                            )}
                            <div ref={endRef} />
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                placeholder={`Message ${audienceName}…`}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                                disabled={sending}
                            />
                            <Button onClick={send} disabled={sending || !draft.trim()}>
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function TeamCard({ team, onRefresh }) {
    const [expanded, setExpanded] = useState(false);
    const [items, setItems] = useState(team.work_items);
    const [reportOpen, setReportOpen] = useState(false);
    const [reportText, setReportText] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => setItems(team.work_items), [team.work_items]);

    const counts = useMemo(() => {
        const c = { open: 0, done: 0 };
        for (const i of items) (i.status === 'done' ? c.done++ : c.open++);
        return c;
    }, [items]);

    const sortedItems = useMemo(() => {
        const prio = { P0: 0, P1: 1, P2: 2, P3: 3 };
        const stat = { in_progress: 0, review: 1, planned: 2, blocked: 3, backlog: 4, done: 5 };
        return [...items].sort((a, b) =>
            (stat[a.status] ?? 9) - (stat[b.status] ?? 9) || (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9));
    }, [items]);

    const setItemStatus = async (item, status) => {
        const prev = items;
        setItems(items.map(i => i.id === item.id ? { ...i, status } : i));
        try {
            await adminApi.updateSprintItem(item.id, { status });
        } catch (e) {
            setItems(prev);
            toast.error(e.message);
        }
    };

    const deleteItem = async (item) => {
        if (!window.confirm(`Delete "${item.title}"?`)) return;
        try {
            await adminApi.deleteSprintItem(item.id);
            setItems(items.filter(i => i.id !== item.id));
        } catch (e) {
            toast.error(e.message);
        }
    };

    const submitReport = async () => {
        if (!reportText.trim()) return;
        setBusy(true);
        try {
            await adminApi.addSprintReport(team.id, reportText.trim());
            setReportOpen(false); setReportText('');
            toast.success('Briefing recorded');
            onRefresh();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardContent className="p-4">
                <button className="w-full flex items-center gap-3 text-left" onClick={() => setExpanded(!expanded)}>
                    {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{team.name}</span>
                            <TestRunBadge run={team.latest_test_run} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{team.mission}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{team.team.length}</span>
                        <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />{counts.open} open</span>
                    </div>
                </button>

                {expanded && (
                    <div className="mt-4 space-y-4">
                        {team.project && <div className="text-[11px] text-muted-foreground font-mono">{team.project}</div>}

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {team.team.map((m, i) => <AgentChip key={m.id || i} member={m} />)}
                        </div>

                        {team.latest_report && (
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
                                    <Megaphone className="w-3.5 h-3.5" />
                                    Briefing to the CEO · {team.latest_report.sprint} · {fmtRelative(team.latest_report.created)}
                                </div>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{team.latest_report.summary}</p>
                            </div>
                        )}

                        <div>
                            <div className="text-xs font-medium mb-1">Work items</div>
                            <div className="rounded-lg border px-3">
                                {sortedItems.length === 0 && (
                                    <div className="py-3 text-xs text-muted-foreground">No work items yet.</div>
                                )}
                                {sortedItems.map(item => (
                                    <WorkItemRow key={item.id} item={item} onStatus={setItemStatus} onDelete={deleteItem} />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <AddItemForm teamId={team.id} onAdded={(item) => setItems([...items, item])} />
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setReportOpen(true)}>
                                <Megaphone className="w-3.5 h-3.5 mr-1" /> Record briefing
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Briefing to the CEO — {team.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>What has the team shipped, what's planned, what needs your call?</Label>
                        <textarea
                            className="w-full min-h-32 rounded-md border bg-background p-2 text-sm"
                            value={reportText}
                            onChange={e => setReportText(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setReportOpen(false)}>Cancel</Button>
                        <Button onClick={submitReport} disabled={busy || !reportText.trim()}>Save briefing</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

export default function SprintPage() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);

    const load = async () => {
        try {
            const { items } = await adminApi.listSprintTeams();
            setTeams(items);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const seed = async () => {
        setSeeding(true);
        try {
            const r = await adminApi.seedSprintTeams();
            const parts = [];
            if (r.created_teams) parts.push(`${r.created_teams} new team${r.created_teams === 1 ? '' : 's'}`);
            if (r.created_items) parts.push(`${r.created_items} new work item${r.created_items === 1 ? '' : 's'}`);
            if (r.refreshed_teams) parts.push(`${r.refreshed_teams} roster${r.refreshed_teams === 1 ? '' : 's'} refreshed`);
            toast.success(parts.length ? `Synced — ${parts.join(', ')}` : 'Already up to date');
            await load();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSeeding(false);
        }
    };

    const health = useMemo(() => {
        const h = { pass: 0, fail: 0, none: 0 };
        for (const t of teams) {
            const s = t.latest_test_run?.status;
            if (s === 'pass') h.pass++;
            else if (s === 'fail' || s === 'partial') h.fail++;
            else h.none++;
        }
        return h;
    }, [teams]);

    return (
        <div className="space-y-4">
            <Helmet><title>Sprint Board — Admin</title></Helmet>
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold flex items-center gap-2">
                    <Rocket className="w-5 h-5" /> Sprint Board
                </h1>
                <div className="flex-1" />
                {teams.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                        <span className="text-green-600 dark:text-green-400 font-medium">{health.pass} green</span>
                        {' · '}
                        <span className="text-red-600 dark:text-red-400 font-medium">{health.fail} red</span>
                        {' · '}
                        <span>{health.none} unreported</span>
                    </div>
                )}
                <Button variant="outline" size="sm" onClick={load}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </Button>
                <Button
                    size="sm"
                    onClick={seed}
                    disabled={seeding}
                    title="Add any teams and work items from the seed roster that aren't on the board yet. Never changes items you've already re-prioritized."
                >
                    <Plus className="w-3.5 h-3.5 mr-1" /> {seeding ? 'Syncing…' : 'Sync teams'}
                </Button>
            </div>

            <p className="text-sm text-muted-foreground max-w-3xl">
                One dev-agent team per customer project. Each team's sprint 1 carries the same mandated P0:
                a daily test dashboard covering positive and negative flows with critical integrations mocked.
                Green/red status is the latest daily run.
            </p>

            {teams.length > 0 && <CeoChat teams={teams} />}

            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!loading && teams.length === 0 && (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No sprint teams yet. Seed the default roster to get started.
                </CardContent></Card>
            )}
            {teams.map(team => <TeamCard key={team.id} team={team} onRefresh={load} />)}
        </div>
    );
}
