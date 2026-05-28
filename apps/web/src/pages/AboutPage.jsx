
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Users, Code, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

const AboutPage = () => {
  const [stats, setStats] = useState({ users: 0, skills: 0, leaderboard: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [usersList, skillsList, leaderboardList] = await Promise.all([
          pb.collection('users').getFullList({ $autoCancel: false }).catch(() => []),
          pb.collection('skills').getFullList({ $autoCancel: false }).catch(() => []),
          pb.collection('leaderboard').getFullList({ $autoCancel: false }).catch(() => [])
        ]);
        
        setStats({
          users: usersList.length,
          skills: skillsList.length,
          leaderboard: leaderboardList.length
        });
      } catch (error) {
        console.error('Failed to fetch platform stats:', error);
      }
    };

    fetchStats();
  }, []);

  return (
    <>
      <Helmet>
        <title>About - kaushalstack</title>
        <meta name="description" content="Learn about kaushalstack's mission to build a free, open-source community for skill sharing and collaborative learning." />
      </Helmet>

      <div className="min-h-screen">
        <section className="py-20 bg-gradient-to-br from-background via-muted/30 to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Our Mission</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Building the future of{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                collaborative learning
              </span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              kaushalstack is a free, open-source platform where anyone can share their skills, learn from others, and contribute to a growing knowledge base. We believe in the power of community-driven education and collaborative growth.
            </p>
          </div>
        </section>

        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20">
              <div>
                <h2 className="text-3xl font-bold mb-4">Open source at our core</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  We're committed to transparency and community ownership. Every line of code, every feature, and every decision is made with the community in mind. Our platform is built by contributors, for contributors.
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
                    <Heart className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">100% Free</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
                    <Code className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium">Open Source</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
                    <Users className="w-4 h-4 text-secondary" />
                    <span className="text-sm font-medium">Community Driven</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl font-bold text-primary mb-2">{stats.users}</div>
                    <p className="text-sm text-muted-foreground">Members</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl font-bold text-accent mb-2">{stats.skills}</div>
                    <p className="text-sm text-muted-foreground">Skills Shared</p>
                  </CardContent>
                </Card>
                <Card className="sm:col-span-2">
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl font-bold text-secondary mb-2">{stats.leaderboard}</div>
                    <p className="text-sm text-muted-foreground">Leaderboard Entries</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl p-8 text-center">
                  <TrendingUp className="w-16 h-16 text-primary mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Future expansion</h3>
                  <p className="text-muted-foreground">
                    We're planning to expand beyond skill sharing into banking, financial literacy, and more community-driven services
                  </p>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <h2 className="text-3xl font-bold mb-4">Growing together</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Our vision extends beyond just skill sharing. We're building an ecosystem where community members can access financial services, educational resources, and collaborative tools — all while maintaining our commitment to being free and open source.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Join us in shaping the future of community-driven platforms. Whether you're here to learn, teach, or contribute to the codebase, there's a place for you in the kaushalstack community.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-gradient-to-br from-primary to-accent text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to join the community?
            </h2>
            <p className="text-lg mb-8 text-white/90 leading-relaxed max-w-2xl mx-auto">
              Start sharing your skills, learning from others, and contributing to the future of collaborative education today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button size="lg" variant="secondary" className="gap-2">
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/skills">
                <Button size="lg" variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  Browse Skills
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default AboutPage;
