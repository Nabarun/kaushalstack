import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { growthApi } from '@/lib/growthApi';
import { toast } from 'sonner';
import { ArrowLeft, Play, Plus, Trash2, RefreshCw, Save } from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function GrowthBusinessDetailPage() {
    const { id } = useParams();
    const [business, setBusiness] = useState(null);
    const [agents, setAgents] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);

    const [name, setName] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [description, setDescription] = useState('');
    const [scheduleHour, setScheduleHour] = useState(6);
    const [active, setActive] = useState(true);
    const [team, setTeam] = useState([]);
    const [competitors, setCompetitors] = useState([]);

    const load = async () => {
        setLoading(true);
        try {
            const [b, a, r] = await Promise.all([growthApi.get(id), growthApi.agents(), growthApi.reports(id)]);
            const biz = b.item;
            setBusiness(biz);
            setName(biz.name || '');
            setWebsiteUrl(biz.website_url || '');
            setDescription(biz.description || '');
            setScheduleHour(typeof biz.schedule_hour === 'number' ? biz.schedule_hour : 6);
            setActive(biz.active !== false);
            setTeam(Array.isArray(biz.team) ? biz.team : []);
            setCompetitors(Array.isArray(biz.competitors) ? biz.competitors : []);
            setAgents(a.items || []);
            setReports(r.items || []);
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, [id]);

    const teamIds = useMemo(() => new Set(team.map(t => t.id)), [team]);
    const toggleAgent = (agent) => {
        if (teamIds.has(agent.id)) setTeam(team.filter(t => t.id !== agent.id));
        else setTeam([...team, { id: agent.id, agent_name: agent.agent_name, name: agent.name, category: agent.category }]);
    };

    const addCompetitor = () => setCompetitors([...competitors, { name: '', website: '', handles: '' }]);
    const updateCompetitor = (i, patch) => setCompetitors(competitors.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const removeCompetitor = (i) => setCompetitors(competitors.filter((_, idx) => idx !== i));

    const onSave = async () => {
        setSaving(true);
        try {
            await growthApi.update(id, {
                name, website_url: websiteUrl, description,
                schedule_hour: scheduleHour, active,
                team, competitors: competitors.filter(c => c.name && c.website),
            });
            toast.success('Saved');
        } catch (err) {
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const onRunNow = async () => {
        setRunning(true);
        try {
            await growthApi.runNow(id);
            toast.success('Report queued — pull to refresh in a moment');
            setTimeout(load, 8000);
        } catch (err) {
            toast.error(`Run failed: ${err.message}`);
        } finally {
            setRunning(false);
        }
    };

    if (loading) return <div className="max-w-5xl mx-auto px-4 py-10 text-muted-foreground">Loading…</div>;
    if (!business) return <div className="max-w-5xl mx-auto px-4 py-10 text-muted-foreground">Not found.</div>;

    const groupedAgents = agents.reduce((acc, a) => {
        const k = a.category || 'Other';
        (acc[k] ||= []).push(a);
        return acc;
    }, {});

    return (
        <>
            <Helmet><title>{business.name} · Growth Partner</title></Helmet>
            <div className="max-w-5xl mx-auto px-4 py-8">
                <Link to="/growth-partner" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Growth Partner
                </Link>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-2 mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold">{name || business.name}</h1>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Reload</Button>
                        <Button variant="outline" onClick={onRunNow} disabled={running}>
                            <Play className="w-4 h-4 mr-1" /> {running ? 'Running…' : 'Run report now'}
                        </Button>
                        <Button onClick={onSave} disabled={saving}><Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save'}</Button>
                    </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader><CardTitle className="text-base">Basics</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                            <div><Label>Website URL</Label><Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} /></div>
                            <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[80px]" /></div>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <Label>Daily run hour (UTC)</Label>
                                    <select value={scheduleHour} onChange={e => setScheduleHour(Number(e.target.value))} className="w-full mt-1 bg-background border border-input rounded-md px-3 py-2 text-sm">
                                        {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                    <Switch checked={active} onCheckedChange={setActive} />
                                    <Label>{active ? 'Active' : 'Paused'}</Label>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base">Competitors</CardTitle>
                                <CardDescription className="text-xs">Websites + RSS feeds. Last 24h is scanned.</CardDescription>
                            </div>
                            <Button size="sm" variant="ghost" onClick={addCompetitor}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {competitors.length === 0 && <p className="text-sm text-muted-foreground">Add at least one competitor for the daily scan to do anything.</p>}
                            {competitors.map((c, i) => (
                                <div key={i} className="border rounded-md p-3 space-y-2">
                                    <div className="grid grid-cols-12 gap-2 items-start">
                                        <Input placeholder="Name" value={c.name || ''} onChange={e => updateCompetitor(i, { name: e.target.value })} className="col-span-3" />
                                        <Input placeholder="https://…" value={c.website || ''} onChange={e => updateCompetitor(i, { website: e.target.value })} className="col-span-5" />
                                        <Input placeholder="@handle (optional)" value={c.handles || ''} onChange={e => updateCompetitor(i, { handles: e.target.value })} className="col-span-3" />
                                        <Button size="icon" variant="ghost" onClick={() => removeCompetitor(i)} className="col-span-1"><Trash2 className="w-4 h-4" /></Button>
                                    </div>
                                    <Textarea
                                        placeholder="What to focus on for this competitor — e.g. 'pricing changes, new feature launches, hiring signals'. Becomes part of the daily prompt."
                                        value={c.focus || ''}
                                        onChange={e => updateCompetitor(i, { focus: e.target.value })}
                                        className="min-h-[60px] text-sm"
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="text-base">Team ({team.length} selected)</CardTitle>
                        <CardDescription className="text-xs">Pick the specialists whose perspective should shape the growth report.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(groupedAgents).map(([category, list]) => (
                                <div key={category}>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{category}</div>
                                    <div className="space-y-1">
                                        {list.map(a => {
                                            const selected = teamIds.has(a.id);
                                            return (
                                                <button key={a.id} type="button" onClick={() => toggleAgent(a)}
                                                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors border ${selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-muted'}`}>
                                                    <div className="font-medium">{a.agent_name || a.name}</div>
                                                    <div className={`text-xs truncate ${selected ? 'opacity-80' : 'text-muted-foreground'}`}>{a.name}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="mt-4">
                    <CardHeader><CardTitle className="text-base">Reports</CardTitle></CardHeader>
                    <CardContent>
                        {reports.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No reports yet. Hit "Run report now" or wait for the daily schedule.</p>
                        ) : (
                            <div className="space-y-2">
                                {reports.map(r => (
                                    <Link key={r.id} to={`/growth-partner/reports/${r.id}`} className="block border rounded-md px-3 py-2 hover:bg-muted/50 transition-colors">
                                        <div className="flex justify-between text-sm">
                                            <div>
                                                <div className="font-medium">{new Date(r.created).toLocaleString()}</div>
                                                <div className="text-xs text-muted-foreground line-clamp-2">{r.summary || (r.status === 'running' ? 'Running…' : r.status === 'failed' ? r.error : '')}</div>
                                            </div>
                                            <div className={`text-xs font-medium ${r.status === 'completed' ? 'text-emerald-600' : r.status === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>{r.status}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
