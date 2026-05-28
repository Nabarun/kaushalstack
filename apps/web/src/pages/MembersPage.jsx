import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import pb from '@/lib/pocketbaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Code, Users, Sparkles } from 'lucide-react';

const MembersPage = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) setMembers(d.items); })
      .catch(err => console.error('Failed to fetch members:', err))
      .finally(() => setLoading(false));
  }, []);

  const getInitials = (name) => (name ? name.substring(0, 2).toUpperCase() : 'M');

  return (
    <>
      <Helmet>
        <title>Members - kaushalstack</title>
        <meta name="description" content="Everyone who's signed up to kaushalstack." />
      </Helmet>

      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Community</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Members</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Everyone who's signed up. Sorted by lifetime contribution points, newest first within ties.
            </p>
            {!loading && members.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3 font-mono">{members.length} member{members.length !== 1 ? 's' : ''}</p>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Card key={i} className="animate-pulse shadow-sm">
                  <CardContent className="p-6 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-muted rounded-full mb-4" />
                    <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2 mb-6" />
                    <div className="flex gap-4 w-full justify-center">
                      <div className="h-8 bg-muted rounded w-16" />
                      <div className="h-8 bg-muted rounded w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : members.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {members.map((m) => {
                const isActive = (m.contribution_count || 0) > 0 || (m.skills_added || 0) > 0;
                return (
                  <Card key={m.id} className={`transition-all duration-200 hover:shadow-md hover:-translate-y-1 ${isActive ? '' : 'opacity-90'}`}>
                    <CardContent className="p-6 flex flex-col items-center text-center">
                      <Avatar className="w-20 h-20 mb-4 border-2 border-background shadow-sm">
                        <AvatarImage src={m.avatar ? pb.files.getUrl(m, m.avatar) : ''} alt={m.username} />
                        <AvatarFallback className="text-xl bg-primary/10 text-primary">
                          {getInitials(m.username)}
                        </AvatarFallback>
                      </Avatar>

                      <h3 className="font-bold text-lg mb-1 line-clamp-1">{m.name || m.username}</h3>
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <p className="text-sm text-muted-foreground">@{m.username}</p>
                        {!isActive && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">new</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-auto pt-4 border-t w-full justify-center">
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1 text-primary font-semibold">
                            <Code className="w-4 h-4" />
                            <span>{m.skills_added || 0}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Skills</span>
                        </div>
                        <div className="w-px h-8 bg-border" />
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1 text-accent font-semibold">
                            <Trophy className="w-4 h-4" />
                            <span>{m.contribution_count || 0}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Points</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 bg-card rounded-2xl border shadow-sm">
              <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No members yet</h3>
              <p className="text-muted-foreground">Check back later as the community grows.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default MembersPage;
