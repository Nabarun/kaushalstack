
import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, User } from 'lucide-react';

const SkillCard = ({ skill, onViewDetails }) => {
  const difficultyColors = {
    Beginner: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    Advanced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  };

  return (
    <Card className="h-full flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 mb-2">
          <CardTitle className="text-lg leading-snug line-clamp-2">{skill.name}</CardTitle>
          {skill.difficulty_level && (
            <Badge className={`${difficultyColors[skill.difficulty_level]} text-xs shrink-0`}>
              {skill.difficulty_level}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span className="truncate">{skill.agent_name}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
          {skill.description}
        </p>

        <div className="space-y-3 mt-auto">
          <Badge variant="outline" className="text-xs">
            {skill.category}
          </Badge>
          
          {skill.associated_tech_skills && (
            <div className="flex flex-wrap gap-1">
              {skill.associated_tech_skills.split(',').slice(0, 3).map((tech, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {tech.trim()}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4 mt-auto">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Heart className="w-4 h-4" />
            <span>{skill.likes_count || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="w-4 h-4" />
            <span>{skill.comments_count || 0}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onViewDetails && onViewDetails(skill)}>
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
};

export default SkillCard;
