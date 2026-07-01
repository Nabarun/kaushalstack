import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { Check, X, Sparkles, Bot, GitPullRequest, User, ShieldX, Trash2 } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext.jsx';

const APPROVAL_THRESHOLD  = 3;
const REJECTION_THRESHOLD = 6;

function authedFetch(url, opts = {}) {
  const token = pb.authStore.token;
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

function FieldDiff({ field, before, after }) {
  if (before === after) return null;
  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <div className="px-3 py-1.5 bg-muted/40 border-b text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {field}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        <div className="p-3 bg-red-50/40 dark:bg-red-950/10">
          <div className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 font-semibold mb-1">Current</div>
          <div className="text-foreground whitespace-pre-wrap break-words">{String(before ?? '—')}</div>
        </div>
        <div className="p-3 bg-green-50/40 dark:bg-green-950/10">
          <div className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold mb-1">Proposed</div>
          <div className="text-foreground whitespace-pre-wrap break-words">{String(after ?? '—')}</div>
        </div>
      </div>
    </div>
  );
}

function EditCard({ edit, currentUserId, isAdmin, onAction }) {
  const [busy, setBusy] = useState(false);

  const approvals  = Array.isArray(edit.approvals)  ? edit.approvals  : [];
  const rejections = Array.isArray(edit.rejections) ? edit.rejections : [];
  const aiVoted    = !!edit.ai_review;

  const isAuthor   = edit.user_id === currentUserId;
  const alreadyVoted = approvals.some(v => v.voter_id === currentUserId) ||
                       rejections.some(v => v.voter_id === currentUserId);

  async function vote(action) {
    setBusy(true);
    try {
      const r = await authedFetch(`/api/edits/${edit.id}/${action}`, { method: 'POST' });
      const data = await r.json();
      if (r.status === 422 && data.error === 'merge_failed') {
        toast.error(`Vote recorded but merge failed: ${data.detail || 'unknown error'}`);
        onAction();
        return;
      }
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      if (data.merged)    toast.success('Approved — change merged into the skill');
      else if (data.discarded) toast.success('Rejected — change discarded after 6 rejections');
      else if (action === 'approve') toast.success(`Approved (${data.approvals.length}/${APPROVAL_THRESHOLD})`);
      else                  toast.success(`Rejected (${data.rejections.length}/${REJECTION_THRESHOLD})`);
      onAction();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function adminReject() {
    setBusy(true);
    try {
      const r = await authedFetch(`/api/edits/${edit.id}/admin-reject`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      toast.success('Edit rejected by admin — change discarded immediately');
      onAction();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEdit() {
    if (!confirm('Permanently delete this edit? This cannot be undone.')) return;
    setBusy(true);
    try {
      const r = await authedFetch(`/api/admin/edits/${edit.id}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      toast.success('Edit deleted');
      onAction();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function aiReview() {
    setBusy(true);
    try {
      const r = await authedFetch(`/api/edits/${edit.id}/ai-review`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      const dec = data.ai_review?.decision;
      toast.success(`AI ${dec === 'approve' ? 'approved' : 'rejected'}: ${data.ai_review?.reason || ''}`);
      onAction();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const current  = edit.current_skill || {};
  const proposed = edit.proposed_data || {};
  const changedFields = Object.keys(proposed);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm truncate">{edit.skill_meta?.agent_name || edit.skill_id}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{edit.skill_meta?.version || 1} → v{(edit.skill_meta?.version || 1) + 1}</Badge>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <User className="w-3 h-3" />
              proposed by <span className="font-mono">{edit.user_id.slice(0, 8)}</span>
              <span>·</span>
              <span>{new Date(edit.created).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge style={{ background: '#15803d20', color: '#15803d', border: '1px solid #15803d40' }} className="text-[11px] font-mono">
              {approvals.length}/{APPROVAL_THRESHOLD} approvals
            </Badge>
            <Badge style={{ background: '#b9101020', color: '#b91010', border: '1px solid #b9101040' }} className="text-[11px] font-mono">
              {rejections.length}/{REJECTION_THRESHOLD} rejections
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {changedFields.map(f => (
          <FieldDiff key={f} field={f} before={current[f]} after={proposed[f]} />
        ))}

        {edit.ai_review && (
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                AI reviewer: {edit.ai_review.decision}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{edit.ai_review.reason}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button size="sm" disabled={busy || isAuthor || alreadyVoted} onClick={() => vote('approve')}
            className="gap-1.5 bg-green-600 hover:bg-green-700">
            <Check className="w-3.5 h-3.5" /> Approve
          </Button>
          <Button size="sm" variant="destructive" disabled={busy || isAuthor || alreadyVoted}
            onClick={() => vote('reject')} className="gap-1.5">
            <X className="w-3.5 h-3.5" /> Reject
          </Button>
          {isAdmin && (
            <Button size="sm" disabled={busy} onClick={adminReject}
              className="gap-1.5 bg-orange-700 hover:bg-orange-800 text-white">
              <ShieldX className="w-3.5 h-3.5" /> Admin Reject
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={deleteEdit} className="gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
          {!aiVoted && (
            <Button size="sm" variant="outline" disabled={busy} onClick={aiReview} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Request AI Review
            </Button>
          )}
          {isAuthor && <span className="text-xs text-muted-foreground ml-2">You proposed this edit — wait for others to vote</span>}
          {!isAuthor && alreadyVoted && <span className="text-xs text-muted-foreground ml-2">You've already voted</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReviewPage() {
  const { currentUser } = useAuth();
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const r = await authedFetch('/api/edits?status=pending');
      const data = await r.json();
      setEdits(data.edits || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  if (!currentUser) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-muted-foreground mb-4">Sign in to review community edits.</p>
          <Link to="/signin"><Button>Sign In</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Review pending edits — kaushalstack</title>
      </Helmet>

      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest className="w-5 h-5 text-primary" />
              <h1 className="text-3xl font-bold">Pending Edits</h1>
              <Badge variant="outline" className="text-xs font-mono">{edits.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Edits need 3 approvals to merge or 6 rejections to discard. You can approve, reject, or request an AI review.
            </p>
          </div>

          {loading ? (
            <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-48 bg-card rounded-2xl animate-pulse" />)}</div>
          ) : edits.length === 0 ? (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <GitPullRequest className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="text-lg font-semibold mb-1">No pending edits</h3>
                <p className="text-sm text-muted-foreground">Edits proposed by the community will show up here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {edits.map((e, i) => (
                <motion.div key={e.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <EditCard edit={e} currentUserId={currentUser.id} isAdmin={!!currentUser?.is_admin} onAction={refresh} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
