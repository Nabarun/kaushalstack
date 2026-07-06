
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
import { User, Mail, Calendar, Code, Trophy, LogOut, Key, ShieldCheck, Trash2, ExternalLink, Pencil, Save, X, Bell, BellOff, Lock, BarChart2 } from 'lucide-react';
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
        filter: `created_by = "${user.id}" && private != true`,
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

              {/* Password reset */}
              <PasswordSection user={user} />

              {/* AI provider key management (OpenAI, Anthropic, …) */}
              <ProviderKeySection />

              {/* Email notification preferences */}
              <EmailPrefsSection user={user} />

              {/* Round Table usage */}
              <UsageSection user={user} />

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

function PasswordSection({ user }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendReset() {
    setBusy(true);
    try {
      await pb.collection('users').requestPasswordReset(user.email);
      setSent(true);
      toast.success(`Reset link sent to ${user.email}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to send reset email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Password</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          We'll email you a reset link to change your password.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-4 bg-muted/30 border rounded-lg px-4 py-3">
          <div>
            <div className="text-sm font-medium">Change your password</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Link will be sent to <span className="font-mono">{user?.email}</span>
            </div>
          </div>
          <Button onClick={sendReset} disabled={busy || sent} variant="outline" size="sm">
            {busy ? 'Sending…' : sent ? 'Email sent ✓' : 'Send reset link'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmailPrefsSection({ user }) {
  const [disabled, setDisabled] = useState(!!user?.notify_email_disabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !disabled;
    try {
      await pb.collection('users').update(user.id, { notify_email_disabled: next }, { $autoCancel: false });
      setDisabled(next);
      toast.success(next ? 'Email notifications turned off' : 'Email notifications turned on');
    } catch (err) {
      toast.error(err?.message || 'Failed to update preference');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          {disabled ? <BellOff className="w-5 h-5 text-muted-foreground" /> : <Bell className="w-5 h-5 text-primary" />}
          <h2 className="text-xl font-bold">Email notifications</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Get an email when one of your edits is merged, discarded, or someone comments on a skill you authored.
          The bell icon in the header always works regardless of this setting.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-4 bg-muted/30 border rounded-lg px-4 py-3">
          <div>
            <div className="text-sm font-medium">
              {disabled ? 'Emails are off' : 'Emails are on'}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Sent to <span className="font-mono">{user?.email}</span>
            </div>
          </div>
          <Button
            onClick={toggle}
            disabled={busy}
            variant={disabled ? 'default' : 'outline'}
            size="sm"
          >
            {busy ? 'Saving…' : (disabled ? 'Turn on' : 'Turn off')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-proj-…',
    hint: 'Starts with sk- or sk-proj-',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic',
    placeholder: 'sk-ant-api03-…',
    hint: 'Starts with sk-ant-',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  xai: {
    label: 'xAI Grok',
    placeholder: 'xai-…',
    hint: 'Starts with xai-',
    keysUrl: 'https://console.x.ai',
  },
  google: {
    label: 'Google Gemini',
    placeholder: 'AIza…',
    hint: 'Starts with AIza',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
};
const PROVIDER_IDS = Object.keys(PROVIDERS);

function ProviderKeySection() {
  const [status, setStatus] = useState({ provider: null, has_key: false, last4: null, model: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  // The provider currently selected in the input area. Defaults to whatever
  // the user has saved; if nothing saved, falls back to OpenAI.
  const [selectedProvider, setSelectedProvider] = useState('openai');

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
      const r = await authedFetch('/api/me/provider');
      if (!r.ok) throw new Error('failed');
      const d = await r.json();
      const next = {
        provider: d.provider || null,
        has_key: !!d.has_key,
        last4: d.last4 || null,
        model: d.model || null,
      };
      setStatus(next);
      if (next.provider) setSelectedProvider(next.provider);
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
      const r = await authedFetch('/api/me/byok-key', {
        method: 'PUT',
        body: JSON.stringify({ key, provider: selectedProvider }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to save');
      toast.success(`${PROVIDERS[selectedProvider].label} key saved. Round Table now uses your key.`);
      setInput('');
      setStatus({ provider: data.provider, has_key: true, last4: data.last4, model: data.model || null });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const providerLabel = status.provider ? PROVIDERS[status.provider]?.label || status.provider : 'BYOK';
    if (!confirm(`Remove your saved ${providerLabel} key? Future round-table sessions will use the free tier (10 lifetime requests).`)) return;
    setBusy(true);
    try {
      const r = await authedFetch('/api/me/byok-key', { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to remove');
      toast.success('Key removed.');
      setStatus({ provider: status.provider, has_key: false, last4: null, model: null });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const meta = PROVIDERS[selectedProvider];

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">AI Provider Key</h2>
          {status.has_key && status.provider && (
            <span className="inline-flex items-center gap-1 text-xs font-mono bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
              <ShieldCheck className="w-3 h-3" /> {PROVIDERS[status.provider]?.label || status.provider} connected
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Bring your own OpenAI or Anthropic key to remove the free-tier limit. Billed to your account, not ours.
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {loading ? (
          <div className="h-10 bg-muted/40 rounded animate-pulse" />
        ) : status.has_key ? (
          <>
            <div className="flex items-center justify-between gap-3 bg-muted/30 border rounded-lg px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Current key · {PROVIDERS[status.provider]?.label || status.provider}
                </div>
                <div className="font-mono text-sm">…{status.last4}</div>
              </div>
              <Button variant="outline" size="sm" onClick={remove} disabled={busy} className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </Button>
            </div>

            {/* Per-stage model pickers */}
            <PreferredModelPicker authedFetch={authedFetch} provider={status.provider} stage="roundtable" label="Preferred model for Round Table" />
            <PreferredModelPicker authedFetch={authedFetch} provider={status.provider} stage="spec" label="Preferred model for Spec Engineer" />
            <PreferredModelPicker authedFetch={authedFetch} provider={status.provider} stage="design" label="Preferred model for Designer" />
            <PreferredModelPicker authedFetch={authedFetch} provider={status.provider} stage="build" label="Preferred model for Execution" />

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-2">Replace with a new key:</p>
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value)}
                  className="text-sm bg-background border border-input rounded-md px-2 py-2 outline-none focus:border-primary"
                  disabled={busy}
                >
                  {PROVIDER_IDS.map(p => (
                    <option key={p} value={p}>{PROVIDERS[p].label}</option>
                  ))}
                </select>
                <Input
                  type="password"
                  placeholder={meta.placeholder}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  className="font-mono text-sm flex-1"
                />
                <Button onClick={save} disabled={busy || !input.trim()}>
                  {busy ? 'Validating…' : 'Update'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Provider</label>
              <select
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value)}
                className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 outline-none focus:border-primary"
                disabled={busy}
              >
                {PROVIDER_IDS.map(p => (
                  <option key={p} value={p}>{PROVIDERS[p].label}</option>
                ))}
              </select>
            </div>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Go to <a href={meta.keysUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">{new URL(meta.keysUrl).hostname} <ExternalLink className="w-3 h-3" /></a> and create a new secret key.</li>
              <li>Paste it below. We validate it with {meta.label}, encrypt it (AES-256-GCM), and store it linked to your account only.</li>
              <li>Your Round Table calls will be billed to your {meta.label} account instead of hitting our free-tier limit.</li>
            </ol>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={meta.placeholder}
                value={input}
                onChange={e => setInput(e.target.value)}
                className="font-mono text-sm"
              />
              <Button onClick={save} disabled={busy || !input.trim()}>
                {busy ? 'Validating…' : 'Save Key'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground italic flex items-center gap-1.5 pt-1">
              <ShieldCheck className="w-3 h-3" /> {meta.hint}. Keys are encrypted at rest and never exposed back to the browser — only the last 4 characters are shown.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const FREE_TIER_LIMIT = 10;

function UsageSection({ user }) {
  const [uses, setUses] = useState(null);
  const [hasKey, setHasKey] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = pb.authStore.token;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      pb.collection('roundtable_usage').getList(1, 1, {
        filter: `user_id = "${user.id}"`,
        $autoCancel: false,
      }).then(r => r.items[0]?.uses || 0).catch(() => 0),
      fetch('/api/me/provider', { headers })
        .then(r => r.ok ? r.json() : {})
        .then(d => !!d.has_key)
        .catch(() => false),
    ]).then(([u, k]) => {
      setUses(u);
      setHasKey(k);
    }).finally(() => setLoading(false));
  }, [user.id]);

  const pct = hasKey ? 100 : Math.min(100, Math.round(((uses || 0) / FREE_TIER_LIMIT) * 100));
  const remaining = hasKey ? null : Math.max(0, FREE_TIER_LIMIT - (uses || 0));
  const overLimit = !hasKey && (uses || 0) >= FREE_TIER_LIMIT;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Round Table usage</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Your lifetime Round Table calls on the free tier. Add an AI provider key above to remove the limit.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        {loading ? (
          <div className="h-10 bg-muted/40 rounded animate-pulse" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {hasKey ? 'Unlimited (BYOK key active)' : `${uses || 0} / ${FREE_TIER_LIMIT} free calls used`}
              </span>
              {!hasKey && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  overLimit
                    ? 'bg-destructive/10 text-destructive'
                    : remaining <= 2
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {overLimit ? 'Limit reached' : `${remaining} remaining`}
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  hasKey ? 'bg-primary' : overLimit ? 'bg-destructive' : remaining <= 2 ? 'bg-yellow-500' : 'bg-primary'
                }`}
                style={{ width: `${hasKey ? 100 : pct}%` }}
              />
            </div>
            {overLimit && (
              <p className="text-xs text-muted-foreground">
                Add an AI provider key in the section above to continue using Round Table without limits.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Per-provider default models used when the user hasn't picked one yet.
const PROVIDER_DEFAULT_MODEL = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  xai: 'grok-2-latest',
  google: 'gemini-1.5-flash-latest',
};

function PreferredModelPicker({ authedFetch, provider, stage, label }) {
  const defaultModel = PROVIDER_DEFAULT_MODEL[provider] || '';
  const providerLabel = (PROVIDERS && PROVIDERS[provider]?.label) || provider;

  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!provider) return;
    Promise.all([
      fetch(`/api/provider-models?provider=${encodeURIComponent(provider)}`, {
        headers: pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {},
      }).then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })),
      authedFetch('/api/me/provider').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([modelsRes, prefRes]) => {
      if (cancelled) return;
      const list = modelsRes.models || [];
      setOptions(list);
      setOptionsLoading(false);
      const current = (stage ? prefRes.stage_models?.[stage] : prefRes.model) || defaultModel;
      setSelected(current);
      setSaved(current);
    });
    return () => { cancelled = true; };
  }, [provider, stage]);

  const dropdownOptions = (() => {
    const ids = new Set(options.map(o => o.id));
    const extra = [];
    if (selected && !ids.has(selected)) extra.push({ id: selected, created: 0, owned_by: '' });
    if (defaultModel && !ids.has(defaultModel)) extra.push({ id: defaultModel, created: 0, owned_by: provider });
    return [...extra, ...options];
  })();

  async function save() {
    setBusy(true);
    try {
      const r = stage
        ? await authedFetch('/api/me/stage-model', {
            method: 'PUT',
            body: JSON.stringify({ stage, model: selected }),
          })
        : await authedFetch('/api/me/byok-model', {
            method: 'PUT',
            body: JSON.stringify({ model: selected }),
          });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to save');
      }
      setSaved(selected);
      toast.success(`${label || 'Model'} set to ${selected}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    try {
      const r = stage
        ? await authedFetch(`/api/me/stage-model?stage=${encodeURIComponent(stage)}`, { method: 'DELETE' })
        : await authedFetch('/api/me/byok-model', { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to reset');
      setSelected(defaultModel);
      setSaved(defaultModel);
      toast.success(`Reverted to default model (${defaultModel}).`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const dirty = selected !== saved;

  return (
    <div className="bg-muted/30 border rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {label || 'Preferred model'}
        </div>
        {saved && saved !== defaultModel && (
          <button onClick={resetToDefault} disabled={busy} className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted">
            reset to default
          </button>
        )}
      </div>
      {optionsLoading ? (
        <div className="h-9 bg-muted/40 rounded animate-pulse" />
      ) : (
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            disabled={busy}
            className="flex-1 font-mono text-sm bg-background border border-input rounded-md px-3 py-2 outline-none focus:border-primary"
          >
            {dropdownOptions.map(m => (
              <option key={m.id} value={m.id}>
                {m.id}{m.id === defaultModel ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Only chat-completion models are listed. Calls billed to your {providerLabel} account.
      </p>
    </div>
  );
}

export default UserProfilePage;
