import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext.jsx';

const EMPTY = {
  name: '', description: '', category: '', agent_name: '',
  associated_tech_skills: '', video_url: '', proof_of_concept_video: '', difficulty_level: '',
};

const CATEGORIES = [
  'Tech', 'Cooking', 'Market Research', 'Social Feed Analysis', 'Music',
  'agriculture', 'banking', 'career', 'compliance', 'customer-support',
  'education', 'fitness', 'health', 'insurance', 'legal', 'mental-health',
  'nutrition', 'operations', 'personal-finance', 'real-estate', 'retail',
  'sales', 'sports', 'tax-rules', 'travel',
];
const DIFFICULTY_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// Pass `skill` prop to enter edit mode; omit it for create mode.
const AddSkillForm = ({ open, onOpenChange, onSuccess, skill }) => {
  const { currentUser } = useAuth();
  const isEdit = !!skill;
  const [loading, setLoading]   = useState(false);
  const [formData, setFormData] = useState(EMPTY);

  useEffect(() => {
    if (skill) {
      setFormData({
        name:                    skill.name                    || '',
        description:             skill.description             || '',
        category:                skill.category                || '',
        agent_name:              skill.agent_name              || '',
        associated_tech_skills:  skill.associated_tech_skills  || '',
        video_url:               skill.video_url               || '',
        proof_of_concept_video:  skill.proof_of_concept_video  || '',
        difficulty_level:        skill.difficulty_level        || '',
      });
    } else {
      setFormData(EMPTY);
    }
  }, [skill, open]);

  const set = (key) => (e) => setFormData(prev => ({ ...prev, [key]: e.target.value }));
  const setSelect = (key) => (value) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Strip empty strings so optional fields aren't sent as empty
      const clean = Object.fromEntries(
        Object.entries(formData).filter(([, v]) => v !== '')
      );
      if (isEdit) {
        // Submit to the community-review pipeline instead of writing directly.
        // Only fields that changed go into the proposed payload so reviewers see a clean diff.
        const changed = Object.fromEntries(
          Object.entries(clean).filter(([k, v]) => (skill?.[k] ?? '') !== v)
        );
        if (Object.keys(changed).length === 0) {
          toast.message('Nothing to change');
          onOpenChange(false);
          return;
        }
        const token = pb.authStore.token;
        const r = await fetch(`/api/skills/${skill.id}/edits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(changed),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `API ${r.status}`);
        }
        toast.success('Edit submitted for community review (needs 3 approvals)');
      } else {
        await pb.collection('skills').create(
          { ...clean, created_by: currentUser.id, likes_count: 0, comments_count: 0 },
          { $autoCancel: false }
        );
        toast.success('Skill added successfully');
        setFormData(EMPTY);
      }
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Skill save error:', err, err?.data);
      // PocketBase puts field-level validation errors in err.data
      const fieldErrors = err?.data ? Object.entries(err.data)
        .map(([field, detail]) => `${field}: ${detail?.message || detail}`)
        .join(', ') : '';
      toast.error(fieldErrors || err.message || (isEdit ? 'Failed to update skill' : 'Failed to add skill'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Skill' : 'Add New Skill'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details of your skill'
              : 'Share your knowledge with the community by adding a new skill'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Skill Name *</Label>
            <Input id="name" value={formData.name} onChange={set('name')} required
              className="text-gray-900 dark:text-gray-100" placeholder="e.g., Advanced React Patterns" />
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea id="description" value={formData.description} onChange={set('description')} required
              rows={4} className="text-gray-900 dark:text-gray-100" placeholder="Describe what this skill is about..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={setSelect('category')}>
                <SelectTrigger id="category" className="text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="difficulty">Difficulty Level</Label>
              <Select value={formData.difficulty_level} onValueChange={setSelect('difficulty_level')}>
                <SelectTrigger id="difficulty" className="text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="agent_name">Agent / Creator Name *</Label>
            <Input id="agent_name" value={formData.agent_name} onChange={set('agent_name')} required
              className="text-gray-900 dark:text-gray-100" placeholder="e.g., Priya Sharma" />
          </div>

          <div>
            <Label htmlFor="tech_skills">Associated Tech Skills</Label>
            <Input id="tech_skills" value={formData.associated_tech_skills} onChange={set('associated_tech_skills')}
              className="text-gray-900 dark:text-gray-100" placeholder="React, TypeScript, Node.js (comma-separated)" />
          </div>

          <div>
            <Label htmlFor="video_url">Video URL</Label>
            <Input id="video_url" type="url" value={formData.video_url} onChange={set('video_url')}
              className="text-gray-900 dark:text-gray-100" placeholder="https://youtube.com/..." />
          </div>

          <div>
            <Label htmlFor="proof_video">Proof of Concept Video</Label>
            <Input id="proof_video" type="url" value={formData.proof_of_concept_video} onChange={set('proof_of_concept_video')}
              className="text-gray-900 dark:text-gray-100" placeholder="https://youtube.com/..." />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Skill')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSkillForm;
