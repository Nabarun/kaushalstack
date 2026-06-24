import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { growthApi } from '@/lib/growthApi';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { toast } from 'sonner';
import { Plus, ExternalLink, Sparkles, Eye, Briefcase } from 'lucide-react';

export default function GrowthPartnerPage() {
    const { isAuthenticated, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', website_url: '', description: '' });
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await growthApi.list();
            setItems(r.items || []);
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) { setLoading(false); return; }
        load();
    }, [isAuthenticated, authLoading]);

    const onCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.website_url.trim()) {
            toast.error('Name and website are required');
            return;
        }
        setSaving(true);
        try {
            const r = await growthApi.create(form);
            toast.success('Business added — configure competitors and team next.');
            setOpen(false);
            setForm({ name: '', website_url: '', description: '' });
            navigate(`/growth-partner/${r.item.id}`);
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) return null;

    if (!isAuthenticated) {
        return (
            <>
                <Helmet><title>Growth Partner · KaushalStack</title></Helmet>
                <div className="max-w-5xl mx-auto px-4 py-16">
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 text-sm text-primary mb-3">
                            <Sparkles className="w-4 h-4" /> Growth Partner
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">Wake up to what your competitors did yesterday.</h1>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Onboard your business, list your competitors, and assign a team of AI specialists. Every day they scan competitor sites and feeds and tell you what to do about it.
                        </p>
                        <div className="mt-8 flex justify-center gap-3">
                            <Link to="/signin"><Button size="lg">Sign in to get started</Button></Link>
                            <Link to="/signup"><Button size="lg" variant="outline">Create an account</Button></Link>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 mt-12">
                        <Card>
                            <CardHeader><CardTitle className="text-base">1. Add your business</CardTitle></CardHeader>
                            <CardContent className="text-sm text-muted-foreground">Name, website, what you do. Takes a minute.</CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">2. List competitors + pick a team</CardTitle></CardHeader>
                            <CardContent className="text-sm text-muted-foreground">Drop in competitor sites and choose the specialists who should weigh in on the daily report.</CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">3. Get a daily growth report</CardTitle></CardHeader>
                            <CardContent className="text-sm text-muted-foreground">Each day at your chosen hour, the team scans the last 30 days of competitor activity and ships you findings + recommendations.</CardContent>
                        </Card>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Helmet><title>Growth Partner · KaushalStack</title></Helmet>
            <div className="max-w-5xl mx-auto px-4 py-10">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                    <div>
                        <div className="inline-flex items-center gap-2 text-sm text-primary mb-2">
                            <Sparkles className="w-4 h-4" /> Growth Partner
                        </div>
                        <h1 className="text-3xl font-bold">Your businesses</h1>
                        <p className="text-muted-foreground mt-1">Daily competitor scans, summarized by your AI team.</p>
                    </div>
                    <Button onClick={() => setOpen(true)} className="self-start md:self-auto">
                        <Plus className="w-4 h-4 mr-1" /> Add business
                    </Button>
                </div>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                    <Card>
                        <CardContent className="p-12 text-center">
                            <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                            <h3 className="font-semibold mb-1">No businesses yet</h3>
                            <p className="text-sm text-muted-foreground mb-4">Add one to start scanning competitors.</p>
                            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add business</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-3">
                        {items.map(b => (
                            <Card key={b.id} className="hover:border-primary/40 transition-colors">
                                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                                    <div>
                                        <CardTitle className="text-lg">
                                            <Link to={`/growth-partner/${b.id}`} className="hover:underline">{b.name}</Link>
                                        </CardTitle>
                                        <a href={b.website_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1">
                                            {b.website_url} <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                    <Link to={`/growth-partner/${b.id}`}>
                                        <Button variant="ghost" size="sm"><Eye className="w-4 h-4 mr-1" /> Open</Button>
                                    </Link>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="flex flex-wrap gap-4 text-xs">
                                        <span>{(b.team || []).length} agents</span>
                                        <span>{(b.competitors || []).length} competitors</span>
                                        <span>Daily @ {String(b.schedule_hour ?? 6).padStart(2, '0')}:00 UTC</span>
                                        <span>{b.active ? 'Active' : 'Paused'}</span>
                                        <span>{b.last_run_at ? `Last run ${new Date(b.last_run_at).toLocaleString()}` : 'Not yet run'}</span>
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add business</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={onCreate} className="space-y-3">
                        <div>
                            <Label htmlFor="name">Business name</Label>
                            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                        </div>
                        <div>
                            <Label htmlFor="website">Website URL</Label>
                            <Input id="website" type="url" placeholder="https://example.com" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} required />
                        </div>
                        <div>
                            <Label htmlFor="description">What does this business do? (optional)</Label>
                            <Textarea id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[80px]" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
