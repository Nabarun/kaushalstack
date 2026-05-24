
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Award, Zap } from 'lucide-react';

const ContributorCard = ({ contributor }) => {
  const getAchievementBadges = (count) => {
    const badges = [];
    if (count >= 50) badges.push({ label: 'Expert', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' });
    if (count >= 20) badges.push({ label: 'Active', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' });
    if (count >= 10) badges.push({ label: 'Contributor', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' });
    return badges;
  };

  const badges = getAchievementBadges(contributor.contribution_count || 0);

  return (
    <Card className="transition-all duration-200 hover:shadow-lg">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg">
            {contributor.username?.[0]?.toUpperCase() || <User className="w-6 h-6" />}
          </div>
          <div>
            <CardTitle className="text-lg">{contributor.username}</CardTitle>
            {contributor.name && (
              <p className="text-sm text-muted-foreground">{contributor.name}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {contributor.bio && (
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {contributor.bio}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-2xl font-bold">{contributor.contribution_count || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Contributions</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Award className="w-4 h-4 text-accent" />
              <span className="text-2xl font-bold">{contributor.skills_added || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Skills Added</p>
          </div>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge, idx) => (
              <Badge key={idx} className={`${badge.color} text-xs`}>
                {badge.label}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ContributorCard;
