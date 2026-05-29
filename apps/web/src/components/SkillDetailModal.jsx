
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Heart, MessageCircle, Code, BookOpen, Users, Pencil, History, RotateCcw, ShieldCheck, Send, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const SkillDetailModal = ({ skill, open, onOpenChange, onEdit }) => {
  const { currentUser } = useAuth();
  const [isAdmin, setIsAdmin]   = useState(false);
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [rolling, setRolling]   = useState(false);

  // Social: likes + comments
  const [liked, setLiked]             = useState(false);
  const [likesCount, setLikesCount]   = useState(0);
  const [likeBusy, setLikeBusy]       = useState(false);
  const [comments, setComments]       = useState([]);
  const [commentsCount, setCommentsCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (!currentUser) { setIsAdmin(false); return; }
    const token = pb.authStore.token;
    fetch('/api/me/admin-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setIsAdmin(!!d?.is_admin))
      .catch(() => {});
  }, [currentUser?.id]);

  useEffect(() => {
    if (!open || !isAdmin || !skill?.id) { setVersions([]); setShowVersions(false); return; }
    const token = pb.authStore.token;
    fetch(`/api/skills/${skill.id}/versions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.versions) setVersions(d.versions); })
      .catch(() => {});
  }, [open, isAdmin, skill?.id]);

  // Hydrate likes + comments whenever the modal opens for a skill
  useEffect(() => {
    if (!open || !skill?.id) return;
    setLikesCount(skill.likes_count || 0);
    setCommentsCount(skill.comments_count || 0);
    setLiked(false);
    setComments([]);
    setCommentText('');

    const token = pb.authStore.token;
    // Comments are public
    fetch(`/api/skills/${skill.id}/comments`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) { setComments(d.items); setCommentsCount(d.total || d.items.length); } })
      .catch(() => {});
    // "Have I liked this?" needs auth
    if (token) {
      fetch(`/api/skills/${skill.id}/like/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLiked(!!d.liked); })
        .catch(() => {});
    }
  }, [open, skill?.id]);

  if (!skill) return null;
  const canEdit = !!currentUser;

  async function toggleLike() {
    if (!currentUser) { toast.error('Sign in to like this skill'); return; }
    if (likeBusy) return;
    setLikeBusy(true);
    // optimistic
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const token = pb.authStore.token;
      const r = await fetch(`/api/skills/${skill.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `API ${r.status}`);
      setLiked(!!d.liked);
      setLikesCount(d.likes_count);
    } catch (err) {
      setLiked(prevLiked);
      setLikesCount(prevCount);
      toast.error(err.message);
    } finally {
      setLikeBusy(false);
    }
  }

  async function postComment(e) {
    e?.preventDefault();
    if (!currentUser) { toast.error('Sign in to comment'); return; }
    const text = commentText.trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      const token = pb.authStore.token;
      const r = await fetch(`/api/skills/${skill.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `API ${r.status}`);
      setComments(prev => [d.comment, ...prev]);
      setCommentsCount(d.comments_count);
      setCommentText('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPostingComment(false);
    }
  }

  async function deleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;
    try {
      const token = pb.authStore.token;
      const r = await fetch(`/api/skills/${skill.id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `API ${r.status}`);
      }
      setComments(prev => prev.filter(c => c.id !== commentId));
      setCommentsCount(n => Math.max(0, n - 1));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function rollback(versionId, versionNumber) {
    if (!confirm(`Roll back this skill to version ${versionNumber}? The current state will be saved as a new version first.`)) return;
    setRolling(true);
    try {
      const token = pb.authStore.token;
      const r = await fetch(`/api/skills/${skill.id}/rollback/${versionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      toast.success(`Rolled back. Skill is now at version ${data.new_version}.`);
      onOpenChange(false);
      window.location.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRolling(false);
    }
  }

  const difficultyColors = {
    Beginner: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    Advanced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  };

  const markdownComponents = {
    h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground tracking-tight" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-xl font-semibold mt-6 mb-3 text-foreground" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-lg font-medium mt-4 mb-2 text-foreground" {...props} />,
    p: ({node, ...props}) => <p className="text-muted-foreground leading-relaxed mb-4" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc list-outside space-y-2 mb-4 text-muted-foreground ml-5" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal list-outside space-y-2 mb-4 text-muted-foreground ml-5" {...props} />,
    li: ({node, ...props}) => <li className="leading-relaxed pl-1" {...props} />,
    a: ({node, ...props}) => <a className="text-primary font-medium hover:underline underline-offset-4" target="_blank" rel="noopener noreferrer" {...props} />,
    strong: ({node, ...props}) => <strong className="font-semibold text-foreground" {...props} />,
    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/40 pl-4 py-1 italic text-muted-foreground my-4 bg-muted/20 rounded-r-lg" {...props} />,
    code: ({node, inline, className, children, ...props}) => {
      return !inline ? (
        <div className="bg-[#0d1117] rounded-xl p-4 mb-4 overflow-x-auto border border-white/10 shadow-sm">
          <code className="text-sm font-mono text-gray-200" {...props}>
            {children}
          </code>
        </div>
      ) : (
        <code className="bg-muted px-1.5 py-0.5 rounded-md text-sm font-mono text-foreground border" {...props}>
          {children}
        </code>
      )
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4 mb-2">
            <DialogTitle className="text-2xl font-bold leading-tight">{skill.name}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              {skill.difficulty_level && (
                <Badge className={`${difficultyColors[skill.difficulty_level]} text-xs px-2.5 py-0.5`}>
                  {skill.difficulty_level}
                </Badge>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" className="gap-1.5 h-7 px-2.5 text-xs"
                  onClick={() => { onOpenChange(false); onEdit && onEdit(skill); }}>
                  <Pencil className="w-3 h-3" /> Propose edit
                </Button>
              )}
            </div>
          </div>
          <DialogDescription className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-foreground font-medium">
              <User className="w-4 h-4 text-muted-foreground" />
              {skill.agent_name}
            </span>
            <Badge variant="secondary" className="font-normal rounded-full px-3">
              {skill.category}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <div className="space-y-10 pb-8">
            {/* Description Section */}
            <section>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 border-b pb-2">
                <BookOpen className="w-5 h-5 text-primary" />
                About this skill
              </h3>
              <div className="markdown-content">
                <ReactMarkdown components={markdownComponents}>
                  {skill.description}
                </ReactMarkdown>
              </div>
            </section>

            {/* Tech Stack Section */}
            {skill.associated_tech_skills && (
              <section>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 border-b pb-2">
                  <Code className="w-5 h-5 text-accent" />
                  Associated Technologies
                </h3>
                <div className="flex flex-wrap gap-2 mt-3">
                  {skill.associated_tech_skills.split(',').map((tech, idx) => (
                    <Badge key={idx} variant="outline" className="bg-background text-sm font-medium px-3 py-1">
                      {tech.trim()}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Admin: Version History */}
            {isAdmin && (
              <section className="bg-purple-50/40 dark:bg-purple-950/10 rounded-2xl p-5 border border-purple-200/40 dark:border-purple-900/40">
                <button
                  type="button"
                  onClick={() => setShowVersions(s => !s)}
                  className="w-full flex items-center justify-between gap-2 mb-1"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300">
                      Admin · Version History
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      live v{skill.version || 1} · {versions.length} snapshots
                    </Badge>
                  </span>
                  <History className="w-4 h-4 text-muted-foreground" />
                </button>
                {showVersions && (
                  <div className="mt-3 space-y-2">
                    {versions.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No prior versions yet — this is the original.</p>
                    ) : versions.map(v => (
                      <div key={v.id} className="flex items-center justify-between gap-3 bg-background/60 border rounded-lg px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">v{v.version_number}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {new Date(v.created).toLocaleString()}
                            {v.author ? ` · by ${String(v.author).slice(0, 12)}` : ''}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" disabled={rolling} onClick={() => rollback(v.id, v.version_number)} className="gap-1.5">
                          <RotateCcw className="w-3 h-3" /> Roll back
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Community Engagement — like + comments */}
            <section className="bg-muted/30 rounded-2xl p-5 border shadow-sm">
              <h3 className="text-xs font-bold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                <Users className="w-4 h-4" />
                Community Engagement
              </h3>

              {/* Like / Comment count row */}
              <div className="flex items-center gap-3 mb-5">
                <button
                  onClick={toggleLike}
                  disabled={likeBusy}
                  title={currentUser ? (liked ? 'Unlike' : 'Like this skill') : 'Sign in to like'}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                    liked
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-background border-border hover:border-primary/40 hover:bg-primary/5'
                  } ${likeBusy ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                  <span className="font-semibold text-sm tabular-nums">{likesCount}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{likesCount === 1 ? 'Like' : 'Likes'}</span>
                </button>

                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-background">
                  <MessageCircle className="w-4 h-4 text-secondary" />
                  <span className="font-semibold text-sm tabular-nums">{commentsCount}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{commentsCount === 1 ? 'Comment' : 'Comments'}</span>
                </div>
              </div>

              {/* Add comment */}
              {currentUser ? (
                <form onSubmit={postComment} className="mb-5">
                  <Textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Share what you think about this skill…"
                    rows={2}
                    maxLength={2000}
                    className="text-gray-900 dark:text-gray-100 resize-y mb-2"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-mono">{commentText.length} / 2000</span>
                    <Button type="submit" size="sm" disabled={postingComment || !commentText.trim()} className="gap-1.5">
                      <Send className="w-3.5 h-3.5" /> {postingComment ? 'Posting…' : 'Post comment'}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground mb-4 italic">Sign in to like this skill or join the conversation.</p>
              )}

              {/* Comments list */}
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No comments yet — be the first.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map(c => {
                    const a = c.author;
                    const initials = (a?.name || a?.username || 'U').slice(0, 2).toUpperCase();
                    const canDelete = currentUser && (currentUser.id === c.user_id || isAdmin);
                    return (
                      <div key={c.id} className="flex gap-3 bg-background border rounded-lg p-3">
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarImage src={a?.avatar ? pb.files.getUrl(a, a.avatar) : ''} alt={a?.username || ''} />
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold">{a?.name || a?.username || 'Member'}</span>
                            {a?.username && <span className="text-[11px] text-muted-foreground font-mono">@{a.username}</span>}
                            <span className="text-[10px] text-muted-foreground font-mono">
                              · {c.created ? new Date(c.created).toLocaleString() : ''}
                            </span>
                            {canDelete && (
                              <button onClick={() => deleteComment(c.id)} title="Delete"
                                className="ml-auto text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SkillDetailModal;
