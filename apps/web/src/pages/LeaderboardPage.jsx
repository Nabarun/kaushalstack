
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import pb from '@/lib/pocketbaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, Star, Info, Pencil, Check, Bot } from 'lucide-react';

const LeaderboardPage = () => {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) setLeaders(d.items); })
      .catch(err => console.error('Failed to fetch leaderboard:', err))
      .finally(() => setLoading(false));
  }, []);

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2: return <Medal className="w-6 h-6 text-gray-400" />;
      case 3: return <Medal className="w-6 h-6 text-amber-700" />;
      default: return <span className="font-bold text-muted-foreground w-6 text-center">{rank}</span>;
    }
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case 1: return 'bg-yellow-500/10 border-yellow-500/20';
      case 2: return 'bg-gray-400/10 border-gray-400/20';
      case 3: return 'bg-amber-700/10 border-amber-700/20';
      default: return 'bg-card border-border';
    }
  };

  return (
    <>
      <Helmet>
        <title>Leaderboard - kaushalstack</title>
        <meta name="description" content="Top contributors and skill sharers in the kaushalstack community." />
      </Helmet>

      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full mb-6">
              <Award className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Top Performers</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Community Leaderboard
            </h1>
            <p className="text-lg text-muted-foreground">
              Recognizing our most active and helpful community members this month.
            </p>
          </div>

          {/* How points are calculated */}
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                  How points are calculated
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Skills on kaushalstack are community-owned: anyone signed in can propose an edit, and changes merge once they collect <span className="font-semibold text-foreground">3 approvals</span> (or get discarded after <span className="font-semibold text-foreground">6 rejections</span>). Points are awarded when an edit merges:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-background border">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                    <Pencil className="w-4 h-4 text-yellow-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      +5 <Star className="w-3 h-3 fill-current text-accent" />
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      Edit author when their proposed change is merged
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-background border">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      +1 <Star className="w-3 h-3 fill-current text-accent" />
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      Each human reviewer who approves an edit that merges
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-background border">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">0</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      AI reviewer votes don't earn points
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4 italic">
                The leaderboard resets each calendar month. Lifetime totals appear on the <a href="/contributors" className="text-primary hover:underline">Contributors</a> page.
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-8 h-8 bg-muted rounded-full" />
                    <div className="w-12 h-12 bg-muted rounded-full" />
                    <div className="flex-1">
                      <div className="h-5 bg-muted rounded w-32 mb-2" />
                      <div className="h-4 bg-muted rounded w-24" />
                    </div>
                    <div className="h-8 bg-muted rounded w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : leaders.length > 0 ? (
            <div className="space-y-4">
              {leaders.map((entry, index) => {
                const user = entry.user;
                const rank = entry.rank || index + 1;
                
                return (
                  <Card 
                    key={entry.id} 
                    className={`transition-all duration-200 hover:shadow-md ${getRankColor(rank)}`}
                  >
                    <CardContent className="p-4 sm:p-6 flex items-center gap-4 sm:gap-6">
                      <div className="flex items-center justify-center w-8 shrink-0">
                        {getRankIcon(rank)}
                      </div>
                      
                      <Avatar className="w-12 h-12 sm:w-14 sm:h-14 border-2 border-background shadow-sm">
                        <AvatarImage src={user?.avatar ? pb.files.getUrl(user, user.avatar) : ''} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {user?.username?.substring(0, 2).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base sm:text-lg truncate">
                          {user?.name || user?.username || 'Unknown User'}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="truncate">@{user?.username || 'user'}</span>
                          {entry.badge && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                              {entry.badge}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center justify-end gap-1 text-accent font-bold text-lg sm:text-xl">
                          <span>{entry.points}</span>
                          <Star className="w-4 h-4 fill-current" />
                        </div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                          Points
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 bg-card rounded-2xl border shadow-sm">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No leaderboard data</h3>
              <p className="text-muted-foreground">The leaderboard is currently empty. Start contributing to claim the top spot!</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LeaderboardPage;
