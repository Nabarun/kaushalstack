import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { GitPullRequest, Trash2, User, Bot, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = ['pending', 'approved', 'discarded', 'all'];

const STATUS_COLORS = {
    pending:   { bg: '#fef9c320', color: '#854d0e', border: '#ca8a0440' },
    approved:  { bg: '#dcfce720', color: '#166534', border: '#16a34a40' },
    discarded: { bg: '#fee2e220', color: '#991b1b', border: '#ef444440' },
};

export default function ReviewsPage() {
    const [edits, setEdits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('pending');
    const [deleting, setDeleting] = useState(null);

    async function load(s = status) {
        setLoading(true);
        try {
            const data = await adminApi.listEdits(s);
            setEdits(data.edits || []);
        } catch (err) {
            toast.error(`Failed to load: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(status); }, [status]);

    async function handleDelete(id) {
        if (!confirm('Permanently delete this edit record? This cannot be undone.')) return;
        setDeleting(id);
        try {
            await adminApi.deleteEdit(id);
            toast.success('Edit deleted');
            setEdits(prev => prev.filter(e => e.id !== id));
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`);
        } finally {
            setDeleting(null);
        }
    }

    return (
        <>
            <Helmet><title>Reviews · Admin</title></Helmet>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GitPullRequest className="w-5 h-5" />
                        <h1 className="text-2xl font-semibold">Skill Edit Reviews</h1>
                        <Badge variant="outline" className="font-mono text-xs">{edits.length}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">View and delete community-proposed skill edits.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => load(status)} disabled={loading} className="gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {/* Status filter */}
            <div className="flex gap-2 mb-5">
                {STATUS_OPTIONS.map(s => (
                    <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${
                            status === s
                                ? 'bg-accent text-white'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
                        }`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-32 bg-card rounded-xl animate-pulse" />)}
                </div>
            ) : edits.length === 0 ? (
                <Card className="bg-muted/30 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <GitPullRequest className="w-10 h-10 text-muted-foreground mb-3" />
                        <h3 className="text-lg font-semibold mb-1">No {status === 'all' ? '' : status} edits</h3>
                        <p className="text-sm text-muted-foreground">Nothing to show for this filter.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {edits.map(edit => {
                        const col = STATUS_COLORS[edit.status] || STATUS_COLORS.pending;
                        const approvals  = Array.isArray(edit.approvals)  ? edit.approvals  : [];
                        const rejections = Array.isArray(edit.rejections) ? edit.rejections : [];
                        const changedFields = Object.keys(edit.proposed_data || {});

                        return (
                            <Card key={edit.id}>
                                <CardHeader className="border-b py-3">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <GitPullRequest className="w-4 h-4 text-primary shrink-0" />
                                                <span className="font-semibold text-sm">
                                                    {edit.skill_meta?.agent_name || edit.skill_id}
                                                </span>
                                                <Badge style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}
                                                    className="text-[10px] px-1.5 capitalize">
                                                    {edit.status}
                                                </Badge>
                                                {changedFields.length > 0 && (
                                                    <span className="text-xs text-muted-foreground font-mono">
                                                        [{changedFields.join(', ')}]
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    {edit.user_meta?.name || edit.user_meta?.username || edit.user_id.slice(0, 8)}
                                                    {edit.user_meta?.email && (
                                                        <span className="font-mono text-[10px]">({edit.user_meta.email})</span>
                                                    )}
                                                </span>
                                                <span>·</span>
                                                <span>{new Date(edit.created).toLocaleString()}</span>
                                                <span>·</span>
                                                <span className="text-green-700 dark:text-green-400">{approvals.length} approve</span>
                                                <span className="text-red-700 dark:text-red-400">{rejections.length} reject</span>
                                                {edit.ai_review && (
                                                    <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                                        <Bot className="w-3 h-3" /> AI: {edit.ai_review.decision}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={deleting === edit.id}
                                            onClick={() => handleDelete(edit.id)}
                                            className="gap-1.5 shrink-0"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            {deleting === edit.id ? 'Deleting…' : 'Delete'}
                                        </Button>
                                    </div>
                                </CardHeader>

                                {changedFields.length > 0 && (
                                    <CardContent className="pt-3 pb-3">
                                        <div className="space-y-2">
                                            {changedFields.map(f => {
                                                const before = String(edit.current_skill?.[f] ?? '—');
                                                const after  = String(edit.proposed_data[f] ?? '—');
                                                return (
                                                    <div key={f} className="text-xs border rounded-md overflow-hidden">
                                                        <div className="px-2 py-1 bg-muted/40 border-b font-mono uppercase tracking-wider text-muted-foreground">
                                                            {f}
                                                        </div>
                                                        <div className="grid grid-cols-2 divide-x">
                                                            <div className="p-2 bg-red-50/40 dark:bg-red-950/10">
                                                                <div className="text-[10px] font-semibold text-red-600 mb-0.5">Current</div>
                                                                <div className="whitespace-pre-wrap break-words line-clamp-3">{before}</div>
                                                            </div>
                                                            <div className="p-2 bg-green-50/40 dark:bg-green-950/10">
                                                                <div className="text-[10px] font-semibold text-green-600 mb-0.5">Proposed</div>
                                                                <div className="whitespace-pre-wrap break-words line-clamp-3">{after}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </>
    );
}
