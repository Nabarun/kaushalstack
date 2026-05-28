
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Heart, MessageCircle, Code, BookOpen, Users, Pencil, History, RotateCcw, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';
import { toast } from 'sonner';

const SkillDetailModal = ({ skill, open, onOpenChange, onEdit }) => {
  const { currentUser } = useAuth();
  const [isAdmin, setIsAdmin]   = useState(false);
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [rolling, setRolling]   = useState(false);

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

  if (!skill) return null;
  const canEdit = !!currentUser;

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

            {/* Community Stats */}
            <section className="bg-muted/30 rounded-2xl p-5 border shadow-sm">
              <h3 className="text-xs font-bold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                <Users className="w-4 h-4" />
                Community Engagement
              </h3>
              <div className="flex gap-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-xl tabular-nums">{skill.likes_count || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground">Likes</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <div className="font-bold text-xl tabular-nums">{skill.comments_count || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground">Comments</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SkillDetailModal;
