
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext.jsx';

const AddSkillForm = ({ open, onOpenChange, onSuccess }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    agent_name: '',
    associated_tech_skills: '',
    video_url: '',
    proof_of_concept_video: '',
    difficulty_level: ''
  });

  const categories = ['Tech', 'Cooking', 'Market Research', 'Social Feed Analysis', 'Music'];
  const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        created_by: currentUser.id,
        likes_count: 0,
        comments_count: 0
      };

      await pb.collection('skills').create(data, { $autoCancel: false });
      
      toast.success('Skill added successfully');
      setFormData({
        name: '',
        description: '',
        category: '',
        agent_name: '',
        associated_tech_skills: '',
        video_url: '',
        proof_of_concept_video: '',
        difficulty_level: ''
      });
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.message || 'Failed to add skill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Skill</DialogTitle>
          <DialogDescription>
            Share your knowledge with the community by adding a new skill
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Skill Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="text-gray-900 dark:text-gray-100"
              placeholder="e.g., Advanced React Patterns"
            />
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={4}
              className="text-gray-900 dark:text-gray-100"
              placeholder="Describe what this skill is about..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger id="category" className="text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="difficulty">Difficulty Level</Label>
              <Select value={formData.difficulty_level} onValueChange={(value) => setFormData({ ...formData, difficulty_level: value })}>
                <SelectTrigger id="difficulty" className="text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {difficultyLevels.map((level) => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="agent_name">Agent/Creator Name *</Label>
            <Input
              id="agent_name"
              value={formData.agent_name}
              onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
              required
              className="text-gray-900 dark:text-gray-100"
              placeholder="e.g., Priya Sharma"
            />
          </div>

          <div>
            <Label htmlFor="tech_skills">Associated Tech Skills</Label>
            <Input
              id="tech_skills"
              value={formData.associated_tech_skills}
              onChange={(e) => setFormData({ ...formData, associated_tech_skills: e.target.value })}
              className="text-gray-900 dark:text-gray-100"
              placeholder="React, TypeScript, Node.js (comma-separated)"
            />
          </div>

          <div>
            <Label htmlFor="video_url">Video URL</Label>
            <Input
              id="video_url"
              type="url"
              value={formData.video_url}
              onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
              className="text-gray-900 dark:text-gray-100"
              placeholder="https://youtube.com/..."
            />
          </div>

          <div>
            <Label htmlFor="proof_video">Proof of Concept Video</Label>
            <Input
              id="proof_video"
              type="url"
              value={formData.proof_of_concept_video}
              onChange={(e) => setFormData({ ...formData, proof_of_concept_video: e.target.value })}
              className="text-gray-900 dark:text-gray-100"
              placeholder="https://youtube.com/..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Adding...' : 'Add Skill'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSkillForm;
