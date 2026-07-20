import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { FolderOpen, ExternalLink, Trash2, Search, Link2, HardDrive, MessageSquare } from 'lucide-react';

function fmtBytes(n) {
    const v = Number(n || 0);
    if (v >= 1024 * 1024 * 1024) return `${(v / (1024 ** 3)).toFixed(1)} GB`;
    if (v >= 1024 * 1024) return `${(v / (1024 ** 2)).toFixed(1)} MB`;
    if (v >= 1024) return `${(v / 1024).toFixed(0)} KB`;
    return `${v} B`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const PHASE_STYLES = {
    marketing: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    execution: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    ideation:  'bg-teal-500/10 text-teal-600 dark:text-teal-400',
};

export default function FoldersPage() {
    const [items, setItems] = useState([]);
    const [totalBytes, setTotalBytes] = useState(0);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [onlyLinked, setOnlyLinked] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [removeBusy, setRemoveBusy] = useState(false);

    useEffect(() => {
        setLoading(true);
        adminApi.listWorkspaces()
            .then(r => {
                setItems(r.items || []);
                setTotalBytes(r.total_bytes || 0);
            })
            .catch(err => toast.error(`Failed to load folders: ${err.message}`))
            .finally(() => setLoading(false));
    }, []);

    async function onRemoveConfirmed() {
        if (!removing) return;
        setRemoveBusy(true);
        try {
            await adminApi.deleteWorkspace(removing.id);
            setItems(prev => prev.filter(f => f.id !== removing.id));
            setTotalBytes(prev => Math.max(0, prev - (removing.bytes || 0)));
            toast.success(`Folder ${removing.id} deleted`);
            setRemoving(null);
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`);
        } finally {
            setRemoveBusy(false);
        }
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return items.filter(f => {
            if (onlyLinked && !f.chat) return false;
            if (!s) return true;
            return (
                f.id.includes(s) ||
                f.agent_name?.toLowerCase().includes(s) ||
                f.summary?.toLowerCase().includes(s) ||
                f.chat?.title?.toLowerCase().includes(s)
            );
        });
    }, [items, q, onlyLinked]);

    const linkedCount = items.filter(f => f.chat).length;

    return (
        <>
            <Helmet><title>Folders · Admin</title></Helmet>

            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold">Build folders</h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        Every generated site/mockup session on disk. Folders linked to a campaign chat power its
                        preview, Studio, and Site Builder &mdash; deleting one breaks those links.
                    </p>
                </div>
                {!loading && (
                    <div className="text-right text-xs text-muted-foreground">
                        <div className="inline-flex items-center gap-1 font-medium text-foreground">
                            <HardDrive className="w-3.5 h-3.5" /> {fmtBytes(totalBytes)} across {items.length} folders
                        </div>
                        <div className="mt-0.5">{linkedCount} linked to campaigns · {items.length - linkedCount} unlinked</div>
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        type="search"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Search by folder id, agent, or campaign…"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setOnlyLinked(v => !v)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        onlyLinked
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Link2 className="w-3 h-3 inline mr-1" /> Linked to a campaign
                </button>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : filtered.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        {items.length === 0 ? 'No build folders on disk.' : 'No folders match that filter.'}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-2">
                    {filtered.map(f => (
                        <Card key={f.id} className="bg-card border">
                            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center flex-shrink-0">
                                        <FolderOpen className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-sm">{f.id}</span>
                                            {f.agent_name && (
                                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                                    {f.agent_name}
                                                </span>
                                            )}
                                            {f.deployed && (
                                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                                                    deployed
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {fmtBytes(f.bytes)} · {f.files} files · updated {fmtDate(f.modified)}
                                        </div>
                                        {f.chat ? (
                                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
                                                <MessageSquare className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                                {f.chat.phase && (
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${PHASE_STYLES[f.chat.phase] || 'bg-muted text-muted-foreground'}`}>
                                                        {f.chat.phase}
                                                    </span>
                                                )}
                                                <span className="text-muted-foreground truncate max-w-md" title={f.chat.title}>
                                                    {f.chat.title || f.chat.chat_id}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="mt-1.5 text-xs text-muted-foreground/60 italic">
                                                Not referenced by any campaign chat
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <a
                                        href={`/api/build/${f.id}/preview/`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                        Preview <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-500/10"
                                        onClick={() => setRemoving(f)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={!!removing} onOpenChange={open => { if (!open && !removeBusy) setRemoving(null); }}>
                <DialogContent className="bg-card border text-foreground">
                    <DialogHeader>
                        <DialogTitle>Delete folder</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Delete <span className="font-mono text-foreground">{removing?.id}</span>
                        {' '}({fmtBytes(removing?.bytes)}, {removing?.files} files)?
                    </p>
                    {removing?.chat && (
                        <p className="text-sm rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 p-3">
                            This folder is linked to the campaign &ldquo;{removing.chat.title || removing.chat.chat_id}&rdquo; —
                            its preview, Studio, and Site Builder will stop working. This cannot be undone.
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setRemoving(null)} disabled={removeBusy}>Cancel</Button>
                        <Button
                            type="button"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={onRemoveConfirmed}
                            disabled={removeBusy}
                        >
                            {removeBusy ? 'Deleting…' : 'Delete folder'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
