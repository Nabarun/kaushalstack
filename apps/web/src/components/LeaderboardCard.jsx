
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award } from 'lucide-react';

const LeaderboardCard = ({ entry, rank, userName }) => {
  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
    if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
    return null;
  };

  const getBadgeColor = (badge) => {
    if (badge === 'Gold') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    if (badge === 'Silver') return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    if (badge === 'Bronze') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Card className={`transition-all duration-200 ${rank <= 3 ? 'border-primary/50 shadow-md' : ''}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted font-bold text-lg">
            {getRankIcon(rank) || `#${rank}`}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-lg">{userName}</span>
              {entry.badge && (
                <Badge className={`${getBadgeColor(entry.badge)} text-xs`}>
                  {entry.badge}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{entry.contribution_count} contributions</span>
              <span className="font-medium text-primary">{entry.points} points</span>
            </div>
            {entry.prize_info && (
              <p className="text-sm text-muted-foreground mt-2">{entry.prize_info}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeaderboardCard;
