import React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Pencil } from 'lucide-react';
import { avatarUrl } from '@/lib/avatar';
import { useAuth } from '@/contexts/AuthContext.jsx';

const difficultyColors = {
  Beginner:     'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-400',
  Intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Advanced:     'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-400',
};

const SkillCard = ({ skill, onViewDetails, onEdit }) => {
  const { currentUser } = useAuth();
  const canEdit = !!currentUser; // anyone signed in can propose edits
  return (
  <Card className="h-full flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-1 overflow-hidden">
    {/* Agent identity strip */}
    <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border/50">
      <img
        src={avatarUrl(skill.agent_name)}
        alt={skill.agent_name}
        className="w-12 h-12 rounded-full bg-muted shrink-0 object-cover"
        loading="lazy"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{skill.agent_name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <Badge variant="outline" className="text-xs px-1.5 py-0">{skill.category}</Badge>
          {skill.difficulty_level && (
            <Badge className={`${difficultyColors[skill.difficulty_level]} text-xs px-1.5 py-0`}>
              {skill.difficulty_level}
            </Badge>
          )}
        </div>
      </div>
    </div>

    <CardHeader className="pt-4 pb-2">
      <h3 className="text-base font-semibold leading-snug line-clamp-2">{skill.name}</h3>
    </CardHeader>

    <CardContent className="flex-1 flex flex-col pt-0">
      <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
        {skill.description}
      </p>

      {skill.associated_tech_skills && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {skill.associated_tech_skills.split(',').slice(0, 3).map((tech, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs">{tech.trim()}</Badge>
          ))}
        </div>
      )}
    </CardContent>

    <CardFooter className="flex items-center justify-between border-t pt-4 mt-auto">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><Heart className="w-4 h-4" />{skill.likes_count || 0}</span>
        <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" />{skill.comments_count || 0}</span>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit && onEdit(skill)} title="Propose edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onViewDetails && onViewDetails(skill)}>
          View Details
        </Button>
      </div>
    </CardFooter>
  </Card>
  );
};

export default SkillCard;
