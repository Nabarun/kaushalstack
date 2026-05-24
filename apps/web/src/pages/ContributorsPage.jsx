
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import pb from '@/lib/pocketbaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Code, Users, Sparkles } from 'lucide-react';

const ContributorsPage = () => {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContributors = async () => {
      try {
        const records = await pb.collection('users').getList(1, 50, {
          sort: '-contribution_count,-created',
          filter: 'contribution_count > 0 || skills_added > 0',
          $autoCancel: false
        });
        setContributors(records.items);
      } catch (error) {
        console.error('Failed to fetch contributors:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContributors();
  }, []);

  const getInitials = (name) => {
    return name ? name.substring(0, 2).toUpperCase() : 'CO';
  };

  return (
    <>
      <Helmet>
        <title>Contributors - kaushalstack</title>
        <meta name="description" content="Meet the amazing contributors building the kaushalstack community." />
      </Helmet>

      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Our Community</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              Meet our contributors
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              These are the dedicated individuals sharing their knowledge and helping build the kaushalstack open-source ecosystem.
            </p>
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
          ) : contributors.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {contributors.map((contributor) => (
                <Card key={contributor.id} className="transition-all duration-200 hover:shadow-md hover:-translate-y-1">
                  <CardContent className="p-6 flex flex-col items-center text-center">
                    <Avatar className="w-20 h-20 mb-4 border-2 border-background shadow-sm">
                      <AvatarImage src={contributor.avatar ? pb.files.getUrl(contributor, contributor.avatar) : ''} alt={contributor.username} />
                      <AvatarFallback className="text-xl bg-primary/10 text-primary">
                        {getInitials(contributor.username)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <h3 className="font-bold text-lg mb-1 line-clamp-1">{contributor.name || contributor.username}</h3>
                    <p className="text-sm text-muted-foreground mb-4">@{contributor.username}</p>
                    
                    <div className="flex items-center gap-4 mt-auto pt-4 border-t w-full justify-center">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 text-primary font-semibold">
                          <Code className="w-4 h-4" />
                          <span>{contributor.skills_added || 0}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Skills</span>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 text-accent font-semibold">
                          <Trophy className="w-4 h-4" />
                          <span>{contributor.contribution_count || 0}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Points</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-card rounded-2xl border shadow-sm">
              <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No contributors found</h3>
              <p className="text-muted-foreground">Check back later as our community grows.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ContributorsPage;
