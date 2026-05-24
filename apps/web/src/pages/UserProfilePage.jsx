
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';
import SkillCard from '@/components/SkillCard.jsx';
import SkillDetailModal from '@/components/SkillDetailModal.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Mail, Calendar, Code, Trophy, LogOut } from 'lucide-react';

const UserProfilePage = () => {
  const { user, logout } = useAuth();
  const [userSkills, setUserSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchUserSkills = async () => {
      if (!user) return;
      try {
        const records = await pb.collection('skills').getList(1, 50, {
          filter: `created_by = "${user.id}"`,
          sort: '-created',
          $autoCancel: false
        });
        setUserSkills(records.items);
      } catch (error) {
        console.error('Failed to fetch user skills:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserSkills();
  }, [user]);

  const handleViewDetails = (skill) => {
    setSelectedSkill(skill);
    setIsModalOpen(true);
  };

  if (!user) return null;

  const getInitials = (name) => {
    return name ? name.substring(0, 2).toUpperCase() : 'US';
  };

  return (
    <>
      <Helmet>
        <title>My Profile - kaushalstack</title>
        <meta name="description" content="View your kaushalstack profile and shared skills." />
      </Helmet>

      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Profile Sidebar */}
            <div className="lg:col-span-1">
              <Card className="shadow-sm">
                <CardHeader className="text-center pb-2">
                  <Avatar className="w-24 h-24 mx-auto mb-4 border-4 border-background shadow-sm">
                    <AvatarImage src={user.avatar ? pb.files.getUrl(user, user.avatar) : ''} alt={user.username} />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {getInitials(user.username)}
                    </AvatarFallback>
                  </Avatar>
                  <CardTitle className="text-2xl">{user.name || user.username}</CardTitle>
                  <p className="text-muted-foreground text-sm">@{user.username}</p>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                  {user.bio && (
                    <p className="text-sm text-center text-muted-foreground leading-relaxed">
                      {user.bio}
                    </p>
                  )}
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{user.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Joined {new Date(user.created).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-primary mb-1">
                        <Code className="w-4 h-4" />
                        <span className="font-bold text-xl">{user.skills_added || userSkills.length}</span>
                      </div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Skills</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-accent mb-1">
                        <Trophy className="w-4 h-4" />
                        <span className="font-bold text-xl">{user.contribution_count || 0}</span>
                      </div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Points</p>
                    </div>
                  </div>

                  <div className="pt-6 border-t">
                    <Button variant="destructive" className="w-full gap-2" onClick={logout}>
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Skills Content */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">My Shared Skills</h2>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-80 bg-card rounded-2xl animate-pulse shadow-sm" />
                  ))}
                </div>
              ) : userSkills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {userSkills.map((skill) => (
                    <SkillCard 
                      key={skill.id} 
                      skill={skill} 
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              ) : (
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                      <Code className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No skills shared yet</h3>
                    <p className="text-muted-foreground max-w-md mb-6">
                      You haven't contributed any skills to the platform yet. Share your expertise with the community!
                    </p>
                    <Button asChild>
                      <a href="/skills">Browse Skills to get inspired</a>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      <SkillDetailModal 
        skill={selectedSkill}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
};

export default UserProfilePage;
