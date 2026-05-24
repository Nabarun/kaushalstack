
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Users, Trophy, Code, TrendingUp } from 'lucide-react';
import SkillCard from '@/components/SkillCard.jsx';
import SkillDetailModal from '@/components/SkillDetailModal.jsx';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext.jsx';

const HomePage = () => {
  const { isAuthenticated } = useAuth();
  const [trendingSkills, setTrendingSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, skills: 0, leaderboard: 0 });
  
  // Modal state
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchTrendingSkills = async () => {
      try {
        const records = await pb.collection('skills').getList(1, 6, {
          sort: '-likes_count,-created',
          $autoCancel: false
        });
        setTrendingSkills(records.items);
      } catch (error) {
        console.error('Failed to fetch skills:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchStats = async () => {
      try {
        // Fetch all collections as requested to count total verified records dynamically
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

    fetchTrendingSkills();
    fetchStats();
  }, []);

  const handleViewDetails = (skill) => {
    setSelectedSkill(skill);
    setIsModalOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>kaushalstack - Build and showcase skills in a free, open-source community</title>
        <meta name="description" content="Join kaushalstack to share your skills, learn from others, and contribute to an open-source knowledge platform. Showcase your expertise and grow together." />
      </Helmet>

      <div className="min-h-screen">
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.08),transparent_50%)]" />
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Free & Open Source</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
                Build and showcase skills in a{' '}
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  free, open-source community
                </span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed">
                Share your expertise, learn from others, and contribute to a collaborative knowledge platform. Join our community of contributors building the future of learning together.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isAuthenticated ? (
                  <>
                    <Link to="/skills">
                      <Button size="lg" className="gap-2">
                        Browse Skills
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link to="/profile">
                      <Button size="lg" variant="outline">
                        View Profile
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link to="/signup">
                      <Button size="lg" className="gap-2">
                        Get Started Free
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link to="/signin">
                      <Button size="lg" variant="outline">
                        Sign In
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
            >
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div className="text-3xl font-bold mb-2">{stats.users}</div>
                <p className="text-sm text-muted-foreground">Active Contributors</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Code className="w-6 h-6 text-accent" />
                </div>
                <div className="text-3xl font-bold mb-2">{stats.skills}</div>
                <p className="text-sm text-muted-foreground">Skills Shared</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-6 h-6 text-secondary" />
                </div>
                <div className="text-3xl font-bold mb-2">{stats.leaderboard}</div>
                <p className="text-sm text-muted-foreground">Leaderboard Entries</p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-12 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden shadow-lg group">
                <img 
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80" 
                  alt="Diverse team collaborating on a project" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                  <p className="text-white font-medium">Human-AI Collaboration</p>
                </div>
              </div>
              <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden shadow-lg group md:-translate-y-8">
                <img 
                  src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80" 
                  alt="Developers working together with modern technology" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                  <p className="text-white font-medium">Community Driven Innovation</p>
                </div>
              </div>
              <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden shadow-lg group">
                <img 
                  src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80" 
                  alt="Team meeting discussing strategy and growth" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                  <p className="text-white font-medium">Building the Future Together</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-primary">Popular Right Now</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Trending skills</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Discover what the community is learning and building today
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-80 bg-card rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trendingSkills.map((skill, index) => (
                  <motion.div
                    key={skill.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <SkillCard 
                      skill={skill} 
                      onViewDetails={handleViewDetails}
                    />
                  </motion.div>
                ))}
              </div>
            )}

            <div className="text-center mt-12">
              <Link to="/skills">
                <Button size="lg" variant="outline" className="gap-2">
                  View All Skills
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-20 bg-gradient-to-br from-primary to-accent text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Join our open-source community
            </h2>
            <p className="text-lg mb-8 text-white/90 leading-relaxed max-w-2xl mx-auto">
              kaushalstack is completely free and open source. We believe in collaborative learning and knowledge sharing. Join us in building the future of education, with plans to expand into banking and beyond.
            </p>
            {!isAuthenticated && (
              <Link to="/signup">
                <Button size="lg" variant="secondary" className="gap-2">
                  Create Free Account
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </section>
      </div>

      <SkillDetailModal 
        skill={selectedSkill}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
};

export default HomePage;
