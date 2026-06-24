
import React, { useEffect, useState, useRef, useCallback } from 'react';
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

const ALL_CATEGORIES = [
  'All',
  'Tech', 'Cooking', 'Market Research', 'Social Feed Analysis', 'Music',
  'agriculture', 'banking', 'career', 'compliance', 'customer-support',
  'education', 'fitness', 'health', 'insurance', 'legal', 'mental-health',
  'nutrition', 'operations', 'personal-finance', 'real-estate', 'retail',
  'sales', 'sports', 'tax-rules', 'travel',
];

const PAGE_SIZE = 48;

const SkillsPage = () => {
  const { isAuthenticated } = useAuth();
  const [skills, setSkills]               = useState([]);
  const [totalItems, setTotalItems]       = useState(0);
  const [page, setPage]                   = useState(1);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [addSkillOpen, setAddSkillOpen]   = useState(false);
  const [editSkill, setEditSkill]         = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen]     = useState(false);

  const debounceTimer = useRef(null);

  const handleEdit = (skill) => setEditSkill(skill);
  const handleViewDetails = (skill) => { setSelectedSkill(skill); setIsModalOpen(true); };

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery]);

  const buildFilter = useCallback((q, cat, diff) => {
    const parts = [];
    if (q.trim()) {
      const words = q.trim().split(/\s+/).filter(Boolean);
      const wordParts = words.map(w =>
        `(name ~ "${w}" || description ~ "${w}" || associated_tech_skills ~ "${w}")`
      );
      parts.push(wordParts.join(' && '));
    }
    if (cat !== 'All') parts.push(`category = "${cat}"`);
    if (diff !== 'All') parts.push(`difficulty_level = "${diff}"`);
    parts.push('private != true');
    return parts.join(' && ');
  }, []);

  const fetchSkills = useCallback(async (q, cat, diff, pg, append = false) => {
    if (!append) setLoading(true); else setLoadingMore(true);
    try {
      const result = await pb.collection('skills').getList(pg, PAGE_SIZE, {
        sort: '-likes_count,-created',
        filter: buildFilter(q, cat, diff),
        $autoCancel: false,
      });
      setSkills(prev => append ? [...prev, ...result.items] : result.items);
      setTotalItems(result.totalItems);
      setPage(pg);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildFilter]);

  // Fetch on filter/search change (reset to page 1)
  useEffect(() => {
    fetchSkills(debouncedQuery, selectedCategory, difficultyFilter, 1);
  }, [debouncedQuery, selectedCategory, difficultyFilter, fetchSkills]);

  const loadMore = () => {
    fetchSkills(debouncedQuery, selectedCategory, difficultyFilter, page + 1, true);
  };

  const hasMore = skills.length < totalItems;

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
              <p className="text-muted-foreground">
                {totalItems > 0 ? `${totalItems.toLocaleString()} skills available` : 'Discover and learn from community contributions'}
              </p>
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
              {ALL_CATEGORIES.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="whitespace-nowrap">
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={selectedCategory}>
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-80 bg-card rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : skills.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {skills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        onViewDetails={handleViewDetails}
                        onEdit={handleEdit}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex justify-center mt-10">
                      <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? 'Loading…' : `Load more (${totalItems - skills.length} remaining)`}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No skills found matching your criteria</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AddSkillForm
        open={addSkillOpen}
        onOpenChange={setAddSkillOpen}
        onSuccess={() => fetchSkills(debouncedQuery, selectedCategory, difficultyFilter, 1)}
      />

      <AddSkillForm
        open={!!editSkill}
        onOpenChange={(open) => { if (!open) setEditSkill(null); }}
        skill={editSkill}
        onSuccess={() => fetchSkills(debouncedQuery, selectedCategory, difficultyFilter, 1)}
      />

      <SkillDetailModal
        skill={selectedSkill}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onEdit={handleEdit}
      />
    </>
  );
};

export default SkillsPage;
