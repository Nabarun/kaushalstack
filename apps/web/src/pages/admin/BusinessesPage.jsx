import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Plus, ExternalLink } from 'lucide-react';

export default function BusinessesPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', website_url: '', description: '' });
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await adminApi.listBusinesses();
            setItems(r.items || []);
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const onCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.website_url.trim()) {
            toast.error('Name and website are required');
            return;
        }
        setSaving(true);
        try {
            await adminApi.createBusiness(form);
            toast.success('Business added');
            setOpen(false);
            setForm({ name: '', website_url: '', description: '' });
            load();
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Helmet><title>Businesses · Admin</title></Helmet>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Businesses</h1>
                    <p className="text-sm text-muted-foreground">Onboarded businesses and their growth-report teams.</p>
                </div>
                <Button onClick={() => setOpen(true)} className="bg-accent hover:bg-accent/80 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Add business
                </Button>
            </div>

            {loading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
            ) : items.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No businesses yet. Add one to get started.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {items.map(b => (
                        <Card key={b.id} className="bg-card border">
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <div>
                                    <CardTitle className="text-base">
                                        <Link to={`/admin/businesses/${b.id}`} className="hover:underline">{b.name}</Link>
                                    </CardTitle>
                                    <a href={b.website_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                        {b.website_url} <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                    <div>Daily @ {String(b.schedule_hour ?? 6).padStart(2, '0')}:00 UTC</div>
                                    <div>{b.active ? 'Active' : 'Paused'}</div>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground pt-0">
                                <div className="flex gap-4">
                                    <span>{(b.team || []).length} agents</span>
                                    <span>{(b.competitors || []).length} competitors</span>
                                    <span>{b.last_run_at ? `Last run ${new Date(b.last_run_at).toLocaleString()}` : 'Never run'}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Add business</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={onCreate} className="space-y-3">
                        <div>
                            <Label htmlFor="name">Business name</Label>
                            <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-background border" required />
                        </div>
                        <div>
                            <Label htmlFor="website">Website URL</Label>
                            <Input id="website" type="url" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} placeholder="https://example.com" className="bg-background border" required />
                        </div>
                        <div>
                            <Label htmlFor="description">Description (optional)</Label>
                            <Input id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-background border" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
