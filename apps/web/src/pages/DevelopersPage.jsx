import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Key, Plus, Copy, Trash2, Terminal, Sparkles, ShieldCheck, AlertTriangle, Loader2,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext.jsx';

// Display helper — "Jun 21, 2026"
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

// "2h ago" / "3d ago" style for last_used. Falls back to a date string after 30d.
function fmtRelative(iso) {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'never';
  const diff = Date.now() - t;
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 30 * 24 * 60 * 60 * 1000) return `${Math.round(diff / 86400000)}d ago`;
  return fmtDate(iso);
}

function authedFetch(path, opts = {}) {
  const token = pb.authStore.token;
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

// One-shot reveal of a freshly minted token. Visual emphasis = "this is the
// only time you'll see this — copy it now."
function NewTokenReveal({ token, name, onDismiss }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy — select and copy manually.');
    }
  }
  return (
    <Card className="border-2 border-primary bg-primary/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Token created: {name}
            </CardTitle>
            <CardDescription className="mt-1">
              Copy this token now. For your security, we won't show it again.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onDismiss}>Done</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 items-center bg-background border rounded-md px-3 py-2 font-mono text-xs break-all">
          <span className="flex-1">{token}</span>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 shrink-0">
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
          <p>
            Treat this like a password. Anyone with this token can act as you on the kaushalstack API.
            If you suspect it's been leaked, revoke it from the list below.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CodeBlock({ children }) {
  const text = typeof children === 'string' ? children : '';
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch { /* clipboard blocked */ }
  }
  return (
    <div className="relative group">
      <pre className="bg-muted border rounded-md px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre">
        {text}
      </pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={copy}
        className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Copy className="w-3 h-3" />
      </Button>
    </div>
  );
}

// Grouped reference for the endpoints a token can hit. Kept in sync with
// apps/api/src/routes/*.js — additions show up here, not in a separate doc.
const ENDPOINT_GROUPS = [
  {
    title: 'Round table',
    description: 'Build a specialist team, run a session, browse history.',
    rows: [
      { method: 'POST',   path: '/api/recommend',                desc: 'Recommend a domain specialist team for a query' },
      { method: 'POST',   path: '/api/recommend/tech',           desc: 'Recommend a tech specialist team for the spec' },
      { method: 'POST',   path: '/api/roundtable',               desc: 'Run a round-table turn (domain or tech)' },
      { method: 'GET',    path: '/api/roundtable/usage',         desc: 'Your free-tier usage + cap' },
      { method: 'GET',    path: '/api/roundtable/chats',         desc: 'Your saved chats (newest first)' },
      { method: 'DELETE', path: '/api/roundtable/chats/:id',     desc: 'Delete a chat' },
    ],
  },
  {
    title: 'Spec engineer',
    description: 'Synthesize a round-table chat into a structured spec.',
    rows: [
      { method: 'POST',   path: '/api/spec',                     desc: 'Generate a spec doc from a chat' },
      { method: 'POST',   path: '/api/spec/upload',              desc: 'Extract text from an uploaded spec file (.md/.pdf/.docx/.txt)' },
    ],
  },
  {
    title: 'Personal access tokens',
    description: 'Manage the tokens that authenticate every API call.',
    rows: [
      { method: 'GET',    path: '/api/me/api-tokens',            desc: 'List your tokens (prefix + last4 only)' },
      { method: 'POST',   path: '/api/me/api-tokens',            desc: 'Create a token — returned ONCE in the response' },
      { method: 'DELETE', path: '/api/me/api-tokens/:id',        desc: 'Revoke a token' },
    ],
  },
  {
    title: 'Provider (BYOK)',
    description: 'Bring your own OpenAI / Anthropic key for unlimited use.',
    rows: [
      { method: 'GET',    path: '/api/me/provider',              desc: 'Provider + saved key status' },
      { method: 'PUT',    path: '/api/me/provider',              desc: 'Switch provider (openai / anthropic)' },
      { method: 'PUT',    path: '/api/me/byok-key',              desc: 'Save a provider key (validated, encrypted)' },
      { method: 'DELETE', path: '/api/me/byok-key',              desc: 'Remove your saved key' },
      { method: 'PUT',    path: '/api/me/byok-model',            desc: 'Set preferred model id for your provider' },
      { method: 'GET',    path: '/api/provider-models',          desc: 'List chat models reachable with your key' },
    ],
  },
  {
    title: 'Hostinger deploy',
    description: 'Push an Ananya build to your Hostinger VPS.',
    rows: [
      { method: 'GET',    path: '/api/me/hostinger',             desc: 'Connection status' },
      { method: 'PUT',    path: '/api/me/hostinger',             desc: 'Save your Hostinger API token' },
      { method: 'DELETE', path: '/api/me/hostinger',             desc: 'Disconnect' },
      { method: 'POST',   path: '/api/deploy',                   desc: 'Deploy a build session (?stream=1 for SSE)' },
    ],
  },
  {
    title: 'Community',
    description: 'Likes, comments, and proposed edits on skills.',
    rows: [
      { method: 'POST',   path: '/api/skills/:id/like',          desc: 'Toggle your like on a skill' },
      { method: 'GET',    path: '/api/skills/:id/comments',      desc: 'List comments on a skill' },
      { method: 'POST',   path: '/api/skills/:id/comments',      desc: 'Add a comment' },
      { method: 'POST',   path: '/api/skills/:id/edits',         desc: 'Propose an edit to a skill' },
      { method: 'GET',    path: '/api/edits?status=pending',     desc: 'List edits in the review queue' },
      { method: 'POST',   path: '/api/edits/:id/approve',        desc: 'Approve a proposed edit' },
    ],
  },
  {
    title: 'Notifications',
    description: 'The bell + read-state your dashboard uses.',
    rows: [
      { method: 'GET',    path: '/api/me/notifications',         desc: 'Latest 20 notifications, actor-hydrated' },
      { method: 'GET',    path: '/api/me/notifications/unread-count', desc: 'Unread count (badge)' },
      { method: 'POST',   path: '/api/me/notifications/read-all', desc: 'Mark all read' },
    ],
  },
];

const METHOD_STYLE = {
  GET:    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  POST:   'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
  PUT:    'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/30',
  DELETE: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
};

function MethodBadge({ method }) {
  const cls = METHOD_STYLE[method] || 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center justify-center text-[10px] font-bold tracking-wider w-14 py-0.5 rounded border ${cls} shrink-0`}>
      {method}
    </span>
  );
}

const SETUP_SNIPPETS = [
  {
    title: 'Codex CLI',
    body: 'Add to ~/.codex/config.toml and restart Codex.',
    snippet: `[mcp_servers.kaushalstack]
command = "npx"
args = ["-y", "kaushalstack-mcp"]
env = { KAUSHALSTACK_API_TOKEN = "<paste-your-token>" }`,
  },
  {
    title: 'Claude Code plugin',
    body: 'Add the marketplace, install the plugin, reload. Then export KAUSHALSTACK_API_TOKEN in your shell so the plugin’s MCP server can authenticate.',
    snippet: `/plugin marketplace add Nabarun/kaushalstack
/plugin install kaushalstack@kaushalstack
/reload-plugin`,
  },
  {
    title: 'Claude Desktop',
    body: 'Edit claude_desktop_config.json (Settings → Developer → Edit Config).',
    snippet: `{
  "mcpServers": {
    "kaushalstack": {
      "command": "npx",
      "args": ["-y", "kaushalstack-mcp"],
      "env": { "KAUSHALSTACK_API_TOKEN": "<paste-your-token>" }
    }
  }
}`,
  },
  {
    title: 'Raw curl',
    body: 'Hit any /api/* endpoint directly.',
    snippet: `curl https://kaushalstack.com/api/me/api-tokens \\
  -H "Authorization: Bearer <paste-your-token>"`,
  },
];

export default function DevelopersPage() {
  const { currentUser } = useAuth();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(null); // id being revoked
  const [revealed, setRevealed] = useState(null); // { token, name } shown once after create

  async function load() {
    setLoading(true);
    try {
      const r = await authedFetch('/api/me/api-tokens');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Server error (${r.status})`);
      setTokens(d.tokens || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  async function create(e) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    setCreating(true);
    try {
      const r = await authedFetch('/api/me/api-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: cleanName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Server error (${r.status})`);
      setRevealed({ token: d.token, name: cleanName });
      setName('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(t) {
    if (!confirm(`Revoke "${t.name}"? Anything using this token will stop working immediately.`)) return;
    setRevoking(t.id);
    try {
      const r = await authedFetch(`/api/me/api-tokens/${t.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Server error (${r.status})`);
      toast.success(`Revoked "${t.name}"`);
      // If we just revoked the token we'd been showing, hide the reveal too.
      if (revealed && t.last4 && revealed.token.endsWith(t.last4)) setRevealed(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      <Helmet>
        <title>Developers — kaushalstack</title>
        <meta name="description" content="Generate personal access tokens to use the kaushalstack API and the kaushalstack-mcp server from Codex, Claude Code, and Claude Desktop." />
      </Helmet>

      <div className="min-h-screen py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full mb-4">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">Developers</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>
              kaushalstack API tokens
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-2xl">
              Personal access tokens let you call the kaushalstack API from your terminal, scripts,
              or AI tools like Codex and Claude Code. Signed in as{' '}
              <span className="font-medium text-foreground">@{currentUser?.username || '…'}</span>.
            </p>
          </div>

          {revealed && (
            <div className="mb-8">
              <NewTokenReveal
                token={revealed.token}
                name={revealed.name}
                onDismiss={() => setRevealed(null)}
              />
            </div>
          )}

          {/* Create */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="w-4 h-4" />
                Generate a new token
              </CardTitle>
              <CardDescription>
                Give the token a name so you remember where you used it (e.g. "MacBook · Codex").
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={create} className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="token-name" className="mb-1.5 block text-xs">Name</Label>
                  <Input
                    id="token-name"
                    placeholder="e.g. Codex on my laptop"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={80}
                    disabled={creating}
                  />
                </div>
                <Button type="submit" disabled={creating || !name.trim()} className="gap-2 sm:w-auto">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Generate token
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* List */}
          <Card className="mb-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="w-4 h-4" />
                Your tokens
              </CardTitle>
              <CardDescription>
                Only the prefix and last four characters are shown — the full value lives only in your client.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
                  No tokens yet. Generate one above to get started.
                </div>
              ) : (
                <div className="divide-y">
                  {tokens.map(t => (
                    <div key={t.id} className="py-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {t.prefix || 'ksk_'}…{t.last4 || '????'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end text-xs text-muted-foreground whitespace-nowrap">
                        <span>Created {fmtDate(t.created)}</span>
                        <span>Last used {fmtRelative(t.last_used)}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revoke(t)}
                        disabled={revoking === t.id}
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        {revoking === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup */}
          <div>
            <h2 className="text-xl font-bold mb-1">Plug it in</h2>
            <p className="text-sm text-muted-foreground mb-6">
              These snippets give an AI tool access to your round-table specialists, spec generation,
              and build pipeline through the <a href="https://www.npmjs.com/package/kaushalstack-mcp" target="_blank" rel="noreferrer" className="text-primary hover:underline">kaushalstack-mcp</a> server.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {SETUP_SNIPPETS.map(s => (
                <Card key={s.title}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {s.title}
                      <Badge variant="secondary" className="font-normal text-[10px] uppercase tracking-wider">setup</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">{s.body}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock>{s.snippet}</CodeBlock>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* API reference */}
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-1">API endpoints</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Every endpoint accepts your token via <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">Authorization: Bearer &lt;token&gt;</code>.
              Base URL: <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">https://kaushalstack.com</code>
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Most JSON in/JSON out. Request and response shapes mirror what the kaushalstack-mcp tools send — see{' '}
              <a href="https://www.npmjs.com/package/kaushalstack-mcp" target="_blank" rel="noreferrer" className="text-primary hover:underline">the npm package</a> for the canonical schemas.
            </p>

            <div className="space-y-6">
              {ENDPOINT_GROUPS.map(g => (
                <Card key={g.title}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{g.title}</CardTitle>
                    <CardDescription className="text-xs">{g.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y border rounded-md overflow-hidden">
                      {g.rows.map(r => (
                        <div key={`${r.method}-${r.path}`} className="px-3 py-2 flex items-center gap-3 text-sm hover:bg-muted/40 transition-colors">
                          <MethodBadge method={r.method} />
                          <code className="font-mono text-xs sm:text-sm break-all flex-shrink-0">{r.path}</code>
                          <span className="hidden sm:inline text-xs text-muted-foreground truncate ml-auto pl-3">
                            {r.desc}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Mobile: show descriptions below since the row layout is tight on narrow screens. */}
                    <div className="sm:hidden mt-2 space-y-1">
                      {g.rows.map(r => (
                        <p key={`m-${r.method}-${r.path}`} className="text-[11px] text-muted-foreground leading-snug">
                          <span className="font-mono font-semibold">{r.method}</span> {r.path} — {r.desc}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-10 text-xs text-muted-foreground text-center">
            Questions? <Link to="/contact" className="text-primary hover:underline">Get in touch</Link>.
          </div>
        </div>
      </div>
    </>
  );
}
