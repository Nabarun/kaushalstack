
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { User, Heart, MessageCircle, Code, BookOpen, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';

const SkillDetailModal = ({ skill, open, onOpenChange }) => {
  if (!skill) return null;

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
            {skill.difficulty_level && (
              <Badge className={`${difficultyColors[skill.difficulty_level]} text-xs shrink-0 px-2.5 py-0.5`}>
                {skill.difficulty_level}
              </Badge>
            )}
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

        <ScrollArea className="flex-1 px-6 py-6">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default SkillDetailModal;
