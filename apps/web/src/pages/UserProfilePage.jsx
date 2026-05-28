
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';
import SkillCard from '@/components/SkillCard.jsx';
import SkillDetailModal from '@/components/SkillDetailModal.jsx';
import AddSkillForm from '@/components/AddSkillForm.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Mail, Calendar, Code, Trophy, LogOut, Key, ShieldCheck, Trash2, ExternalLink, Pencil, Save, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const UserProfilePage = () => {
  // AuthContext exposes the auth record as `currentUser`; alias it locally so
  // existing references to `user` keep working.
  const { currentUser: user, logout } = useAuth();
  const [userSkills, setUserSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSkill, setEditSkill] = useState(null);

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

  useEffect(() => { fetchUserSkills(); }, [user]);

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
            <div className="lg:col-span-2 space-y-8">

              {/* Profile details — name + bio */}
              <ProfileEditSection user={user} />

              {/* OpenAI API key management */}
              <OpenAIKeySection />

              <div className="flex items-center justify-between">
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
                      onEdit={setEditSkill}
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
        onEdit={setEditSkill}
      />

      <AddSkillForm
        open={!!editSkill}
        onOpenChange={(o) => { if (!o) setEditSkill(null); }}
        skill={editSkill}
        onSuccess={() => { setEditSkill(null); fetchUserSkills(); }}
      />
    </>
  );
};

function ProfileEditSection({ user }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [form, setForm]       = useState({ name: user?.name || '', bio: user?.bio || '' });

  function start() {
    setForm({ name: user?.name || '', bio: user?.bio || '' });
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const clean = {
        name: (form.name || '').trim(),
        bio: (form.bio || '').trim(),
      };
      await pb.collection('users').update(user.id, clean, { $autoCancel: false });
      // refresh the cached auth record so the sidebar/header show new values
      try { await pb.collection('users').authRefresh({ $autoCancel: false }); } catch {}
      toast.success('Profile updated');
      setEditing(false);
    } catch (err) {
      const detail = err?.data?.data
        ? Object.entries(err.data.data).map(([f, d]) => `${f}: ${d?.message || d}`).join('; ')
        : err?.message || 'Failed to update profile';
      toast.error(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Profile details</h2>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={start} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Your display name and bio are visible to other members. Username and email aren't editable here.
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {editing ? (
          <>
            <div>
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Nabarun Sengupta"
                className="text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <Label htmlFor="profile-bio">Bio</Label>
              <Textarea
                id="profile-bio"
                rows={3}
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="A line or two about yourself"
                className="text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy} className="gap-1.5">
                <Save className="w-3.5 h-3.5" /> {busy ? 'Saving…' : 'Save changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={busy} className="gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Display name</div>
              <div className="text-sm">{user?.name || <span className="italic text-muted-foreground">Not set</span>}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Username</div>
              <div className="text-sm font-mono">@{user?.username}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Bio</div>
              <div className="text-sm whitespace-pre-wrap">{user?.bio || <span className="italic text-muted-foreground">No bio yet — tell the community a bit about yourself.</span>}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OpenAIKeySection() {
  const [status, setStatus] = useState({ has_key: false, last4: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');

  function authedFetch(url, opts = {}) {
    const token = pb.authStore.token;
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
  }

  async function refresh() {
    try {
      const r = await authedFetch('/api/me/openai-key');
      if (!r.ok) throw new Error('failed');
      const d = await r.json();
      setStatus({ has_key: !!d.has_key, last4: d.last4 || null });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function save() {
    const key = input.trim();
    if (!key) return;
    setBusy(true);
    try {
      const r = await authedFetch('/api/me/openai-key', {
        method: 'POST',
        body: JSON.stringify({ key }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to save');
      toast.success('API key saved and validated. Round Table now uses your key.');
      setInput('');
      setStatus({ has_key: true, last4: data.last4 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove your saved OpenAI key? Future round-table sessions will use the free tier (10 lifetime requests).')) return;
    setBusy(true);
    try {
      const r = await authedFetch('/api/me/openai-key', { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to remove');
      toast.success('Key removed.');
      setStatus({ has_key: false, last4: null });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">OpenAI API Key</h2>
          {status.has_key && (
            <span className="inline-flex items-center gap-1 text-xs font-mono bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
              <ShieldCheck className="w-3 h-3" /> connected
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Bring your own OpenAI key to remove the free-tier limit. Billed to your OpenAI account, not ours.
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {loading ? (
          <div className="h-10 bg-muted/40 rounded animate-pulse" />
        ) : status.has_key ? (
          <>
            <div className="flex items-center justify-between gap-3 bg-muted/30 border rounded-lg px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Current key</div>
                <div className="font-mono text-sm">sk-…{status.last4}</div>
              </div>
              <Button variant="outline" size="sm" onClick={remove} disabled={busy} className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </Button>
            </div>
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-2">Replace with a new key:</p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-proj-…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button onClick={save} disabled={busy || !input.trim()}>
                  {busy ? 'Validating…' : 'Update'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside mb-3">
              <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">platform.openai.com/api-keys <ExternalLink className="w-3 h-3" /></a> and create a new secret key.</li>
              <li>Paste it below. We validate it with OpenAI, encrypt it (AES-256-GCM), and store it linked to your account only.</li>
              <li>Your Round Table calls will be billed to your OpenAI account instead of hitting our free-tier limit.</li>
            </ol>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-proj-…"
                value={input}
                onChange={e => setInput(e.target.value)}
                className="font-mono text-sm"
              />
              <Button onClick={save} disabled={busy || !input.trim()}>
                {busy ? 'Validating…' : 'Save Key'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground italic flex items-center gap-1.5 pt-1">
              <ShieldCheck className="w-3 h-3" /> Keys are encrypted at rest and never exposed back to the browser — only the last 4 characters are shown.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default UserProfilePage;
