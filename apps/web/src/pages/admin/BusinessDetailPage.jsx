import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { ArrowLeft, Play, Plus, Trash2, RefreshCw } from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function BusinessDetailPage() {
    const { id } = useParams();
    const [business, setBusiness] = useState(null);
    const [team, setTeam] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);

    const [name, setName] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [description, setDescription] = useState('');
    const [scheduleHour, setScheduleHour] = useState(6);
    const [active, setActive] = useState(true);
    const [monthlyRevenue, setMonthlyRevenue] = useState('');
    const [competitors, setCompetitors] = useState([]);

    const load = async () => {
        setLoading(true);
        try {
            const [b, t, r] = await Promise.all([
                adminApi.getBusiness(id),
                adminApi.team(id).catch(() => ({ items: [] })),
                adminApi.listReports(id),
            ]);
            const biz = b.item;
            setBusiness(biz);
            setName(biz.name || '');
            setWebsiteUrl(biz.website_url || '');
            setDescription(biz.description || '');
            setScheduleHour(typeof biz.schedule_hour === 'number' ? biz.schedule_hour : 6);
            setActive(biz.active !== false);
            setMonthlyRevenue(biz.monthly_revenue ? String(biz.monthly_revenue) : '');
            setCompetitors(Array.isArray(biz.competitors) ? biz.competitors : []);
            setTeam(t.items || []);
            setReports(r.items || []);
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, [id]);

    const addCompetitor = () => setCompetitors([...competitors, { name: '', website: '', handles: '', focus: '' }]);
    const updateCompetitor = (i, patch) => setCompetitors(competitors.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const removeCompetitor = (i) => setCompetitors(competitors.filter((_, idx) => idx !== i));

    const onSave = async () => {
        setSaving(true);
        try {
            await adminApi.updateBusiness(id, {
                name, website_url: websiteUrl, description,
                schedule_hour: scheduleHour, active,
                monthly_revenue: monthlyRevenue === '' ? 0 : Number(monthlyRevenue),
                competitors: competitors.filter(c => c.name && c.website),
            });
            toast.success('Saved — competitor team updated.');
            adminApi.team(id).then(t => setTeam(t.items || [])).catch(() => {});
        } catch (err) {
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const onRunNow = async () => {
        setRunning(true);
        try {
            await adminApi.runNow(id);
            toast.success('Report queued — refresh in a moment');
            setTimeout(load, 8000);
        } catch (err) {
            toast.error(`Run failed: ${err.message}`);
        } finally {
            setRunning(false);
        }
    };

    if (loading) return <p className="text-zinc-400">Loading…</p>;
    if (!business) return <p className="text-zinc-400">Not found.</p>;

    return (
        <>
            <Helmet><title>{business.name} · Admin</title></Helmet>
            <div className="mb-6">
                <Link to="/admin/businesses" className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Businesses
                </Link>
                <div className="flex items-center justify-between mt-2">
                    <h1 className="text-2xl font-semibold">{name || business.name}</h1>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={load} className="text-zinc-300"><RefreshCw className="w-4 h-4 mr-1" /> Reload</Button>
                        <Button onClick={onRunNow} disabled={running} className="bg-zinc-800 hover:bg-zinc-700">
                            <Play className="w-4 h-4 mr-1" /> {running ? 'Running…' : 'Run report now'}
                        </Button>
                        <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader><CardTitle className="text-base">Basics</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-zinc-950 border-zinc-800" /></div>
                        <div><Label>Website URL</Label><Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} className="bg-zinc-950 border-zinc-800" /></div>
                        <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="bg-zinc-950 border-zinc-800 min-h-[80px]" /></div>
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <Label>Daily run hour (UTC)</Label>
                                <select value={scheduleHour} onChange={e => setScheduleHour(Number(e.target.value))} className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm">
                                    {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                                <Switch checked={active} onCheckedChange={setActive} />
                                <Label>{active ? 'Active' : 'Paused'}</Label>
                            </div>
                        </div>
                        <div>
                            <Label>Monthly revenue ($, optional)</Label>
                            <Input type="number" min="0" placeholder="e.g. 25000" value={monthlyRevenue} onChange={e => setMonthlyRevenue(e.target.value)} className="bg-zinc-950 border-zinc-800" />
                            <p className="text-xs text-zinc-500 mt-1">Used to translate the report's revenue lift % into dollars.</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Competitors</CardTitle>
                        <Button size="sm" variant="ghost" onClick={addCompetitor}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {competitors.length === 0 && <p className="text-sm text-zinc-500">Add competitor websites — the daily scan covers their homepage + RSS.</p>}
                        {competitors.map((c, i) => (
                            <div key={i} className="border border-zinc-800 rounded-md p-3 space-y-2">
                                <div className="grid grid-cols-12 gap-2 items-start">
                                    <Input placeholder="Name" value={c.name || ''} onChange={e => updateCompetitor(i, { name: e.target.value })} className="bg-zinc-950 border-zinc-800 col-span-3" />
                                    <Input placeholder="https://…" value={c.website || ''} onChange={e => updateCompetitor(i, { website: e.target.value })} className="bg-zinc-950 border-zinc-800 col-span-5" />
                                    <Input placeholder="@handle (optional)" value={c.handles || ''} onChange={e => updateCompetitor(i, { handles: e.target.value })} className="bg-zinc-950 border-zinc-800 col-span-3" />
                                    <Button size="icon" variant="ghost" onClick={() => removeCompetitor(i)} className="col-span-1"><Trash2 className="w-4 h-4" /></Button>
                                </div>
                                <Textarea
                                    placeholder="What to focus on for this competitor — e.g. 'pricing changes, new feature launches, hiring signals'. Becomes part of the daily prompt."
                                    value={c.focus || ''}
                                    onChange={e => updateCompetitor(i, { focus: e.target.value })}
                                    className="bg-zinc-950 border-zinc-800 text-sm min-h-[60px]"
                                />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-zinc-900 border-zinc-800 mt-4">
                <CardHeader>
                    <CardTitle className="text-base">Competitor team</CardTitle>
                    <p className="text-xs text-zinc-500">Auto-generated from the competitor list on save — one private watcher per competitor.</p>
                </CardHeader>
                <CardContent>
                    {team.length === 0 ? (
                        <p className="text-sm text-zinc-500">Add competitors and save to generate the team.</p>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {team.map(a => (
                                <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-md p-3">
                                    <div className="text-sm font-medium">{a.agent_name || a.name}</div>
                                    <div className="text-xs text-zinc-500 line-clamp-3 mt-1">{a.description}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800 mt-4">
                <CardHeader><CardTitle className="text-base">Reports</CardTitle></CardHeader>
                <CardContent>
                    {reports.length === 0 ? (
                        <p className="text-sm text-zinc-500">No reports yet. Hit "Run report now" or wait for the daily schedule.</p>
                    ) : (
                        <div className="space-y-2">
                            {reports.map(r => (
                                <Link key={r.id} to={`/admin/reports/${r.id}`} className="block bg-zinc-950 hover:bg-zinc-800/50 border border-zinc-800 rounded-md px-3 py-2">
                                    <div className="flex justify-between text-sm">
                                        <div>
                                            <div className="font-medium">{new Date(r.created).toLocaleString()}</div>
                                            <div className="text-xs text-zinc-500 line-clamp-2">{r.summary || (r.status === 'running' ? 'Running…' : r.status === 'failed' ? r.error : '')}</div>
                                        </div>
                                        <div className={`text-xs ${r.status === 'completed' ? 'text-emerald-400' : r.status === 'failed' ? 'text-rose-400' : 'text-amber-400'}`}>{r.status}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
