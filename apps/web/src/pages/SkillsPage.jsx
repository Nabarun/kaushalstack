
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus } from 'lucide-react';
import SkillCard from '@/components/SkillCard.jsx';
import AddSkillForm from '@/components/AddSkillForm.jsx';
import SkillDetailModal from '@/components/SkillDetailModal.jsx';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext.jsx';

const SkillsPage = () => {
  const { isAuthenticated } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  
  // Modal state
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const categories = ['All', 'Tech', 'Cooking', 'Market Research', 'Social Feed Analysis', 'Music'];

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const records = await pb.collection('skills').getList(1, 100, {
        sort: '-created',
        $autoCancel: false
      });
      setSkills(records.items);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleViewDetails = (skill) => {
    setSelectedSkill(skill);
    setIsModalOpen(true);
  };

  const filteredSkills = skills.filter((skill) => {
    const matchesCategory = selectedCategory === 'All' || skill.category === selectedCategory;
    const matchesDifficulty = difficultyFilter === 'All' || skill.difficulty_level === difficultyFilter;
    const matchesSearch = 
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (skill.associated_tech_skills && skill.associated_tech_skills.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesCategory && matchesDifficulty && matchesSearch;
  });

  return (
    <>
      <Helmet>
        <title>Browse Skills - kaushalstack</title>
        <meta name="description" content="Explore skills shared by the kaushalstack community across tech, cooking, research, and more." />
      </Helmet>

      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Browse skills</h1>
              <p className="text-muted-foreground">Discover and learn from community contributions</p>
            </div>
            {isAuthenticated && (
              <Button onClick={() => setAddSkillOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Skill
              </Button>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, description, or tech stack..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-gray-900 dark:text-gray-100"
              />
            </div>
            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-full md:w-48 text-gray-900 dark:text-gray-100">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Levels</SelectItem>
                <SelectItem value="Beginner">Beginner</SelectItem>
                <SelectItem value="Intermediate">Intermediate</SelectItem>
                <SelectItem value="Advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap mb-8">
              {categories.map((category) => (
                <TabsTrigger key={category} value={category} className="whitespace-nowrap">
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => (
              <TabsContent key={category} value={category}>
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-80 bg-card rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : filteredSkills.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSkills.map((skill) => (
                      <SkillCard 
                        key={skill.id} 
                        skill={skill} 
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No skills found matching your criteria</p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      <AddSkillForm 
        open={addSkillOpen} 
        onOpenChange={setAddSkillOpen}
        onSuccess={fetchSkills}
      />

      <SkillDetailModal 
        skill={selectedSkill}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
};

export default SkillsPage;
