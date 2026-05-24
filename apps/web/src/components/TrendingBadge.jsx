
import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const TrendingBadge = () => {
  return (
    <Badge className="bg-gradient-to-r from-primary to-accent text-white border-0">
      <TrendingUp className="w-3 h-3 mr-1" />
      Trending
    </Badge>
  );
};

export default TrendingBadge;
