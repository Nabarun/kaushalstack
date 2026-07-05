import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Send, Key, Plus, Trash2, MessageSquare, Download, CheckCircle2, AlertCircle, Eye, Mail, Megaphone, X, Search, UserPlus, Sparkles, Palette, Paperclip, Loader2, Volume2, Pause } from 'lucide-react';

// Tool-using agents — when their skill is in the active chat's team, the
// matching CTA panel renders.
//   Ananya — full-stack web build
//   Maya   — 1 landing page (desktop browser frame)
//   Kavya  — HTML email campaign + Gmail-frame preview
//   Tara   — platform-native social posts (Instagram + Facebook + LinkedIn + X, in parallel)
//   Meera  — mobile app build (Expo / React Native) — replaces Ananya for mobile queries
//   Priya  — mobile app screen designer — replaces Maya for mobile queries
const ANANYA_SKILL_ID          = '0v9syxxawznp95v';
const MAYA_SKILL_ID            = 'uepji0o2teuf29b';
const KAVYA_SKILL_ID           = 'ip1bvcutzgsy28p';
const TARA_SKILL_ID            = 'eu6cweasi3d4xt8';
const HOSTINGER_SKILL_ID       = 'hostingerdeploy';
const MOBILE_DEV_SKILL_ID      = 'mobiledevagent1';
const MOBILE_DESIGNER_SKILL_ID = 'mobiledesign001';

const MOBILE_QUERY_RX = /\b(mobile\s+app|react\s+native|expo\s+app|ios\s+app|android\s+app|expo\b|react-native|cross[-\s]platform\s+app|phone\s+app|smartphone\s+app|native\s+app|build\s+(?:a\s+)?(?:mobile|ios|android)|eas\s+build|expo\s+go|app\s+store|google\s+play)\b/i;
function isMobileQuery(q) { return MOBILE_QUERY_RX.test(q || ''); }
import { avatarUrl } from '@/lib/avatar';
import pb from '@/lib/pocketbaseClient';
import CreativePipeline from '@/components/CreativePipeline';
import ReactMarkdown from 'react-markdown';

// Dark-theme markdown components for agent responses (bullet points + bold).
// Defined once so both render sites share identical styling.
const AGENT_MD_COMPONENTS = {
  ul: ({ node, ...props }) => <ul style={{ paddingLeft: 20, marginTop: 6, marginBottom: 6, listStyle: 'disc' }} {...props} />,
  ol: ({ node, ...props }) => <ol style={{ paddingLeft: 20, marginTop: 6, marginBottom: 6 }} {...props} />,
  li: ({ node, ...props }) => <li style={{ marginBottom: 4 }} {...props} />,
  strong: ({ node, ...props }) => <strong style={{ color: '#f0f2f8', fontWeight: 700 }} {...props} />,
  p: ({ node, ...props }) => <p style={{ marginTop: 4, marginBottom: 8 }} {...props} />,
  code: ({ node, ...props }) => <code style={{ background: '#1a1d27', padding: '1px 5px', borderRadius: 3, fontSize: '0.9em' }} {...props} />,
};

// 10-slot palette so teams of 6 (hex viz) and 7–10 (grid viz) both have
// distinct colors per slot. Slots 0–5 are the originals so existing screens
// don't shift colors when team size stays at 6.
const PALETTE = [
  '#5b8dee', '#b07ef8', '#f0a04b', '#4ecba8', '#f06b6b', '#e070c2',
  '#5cc28a', '#f7c948', '#38b6ff', '#ff8a3d',
];
// Soft floor + hard ceiling for the round table. HomePage's seat picker
// enforces 6–10 too; mirrored here so the round-table-side editor (remove
// an agent, add a new one) clamps to the same range.
const TEAM_SIZE_MIN = 6;
const TEAM_SIZE_MAX = 10;
const FREE_LIMIT = 10;

// Vertical oval boardroom — capsule runs top-to-bottom with chair rows on
// the LEFT and RIGHT edges of the table. Row count scales with team size
// so the table always looks packed:
//   size 6  → 3 rows × 2 cols (left + right) = 3 left + 3 right
//   size 7  → 4 rows (4 left + 3 right)
//   size 8  → 4 rows (4 + 4)
//   size 9  → 5 rows (5 + 4)
//   size 10 → 5 rows (5 + 5)
// Seats alternate left→right as team index grows so each row fills evenly.
const OVAL_TABLE = { x: 80, y: 24, width: 120, height: 272, rx: 40 };
const OVAL_CENTER = { x: 140, y: 160 };
const OVAL_VIEW = { width: 280, height: 320 };
function getOvalPositions(count) {
    const numRows = Math.ceil(count / 2);
    const yTop = 36;
    const yBottom = 284;
    const positions = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2; // 0 = left, 1 = right
        const y = numRows === 1
            ? (yTop + yBottom) / 2
            : yTop + ((yBottom - yTop) * row) / (numRows - 1);
        // x=50/230 (instead of 40/240) gives the 88px-wide name labels below
        // each avatar enough breathing room without clipping against the
        // 280px-wide panel edges.
        const x = col === 0 ? 50 : 230;
        positions.push({ x, y });
    }
    return positions;
}

function TypingDots({ color }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          style={{ background: color }}
          className="inline-block w-1.5 h-1.5 rounded-full"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

function BYOKScreen({ reason }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 text-center" style={{ minHeight: 400 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>
        {reason === 'user_key_failed' ? 'Your OpenAI key didn\'t work' : 'Free requests used up'}
      </h2>
      <p style={{ fontSize: 13, color: '#4a4f60', fontFamily: 'monospace', lineHeight: 1.8, maxWidth: 380, marginBottom: 28 }}>
        {reason === 'user_key_failed'
          ? 'OpenAI rejected the key on your profile. Update it and try again.'
          : `You've used all ${FREE_LIMIT} complimentary sessions. Add your own OpenAI key to keep going — it takes under a minute.`}
      </p>

      <button
        onClick={() => navigate('/profile')}
        style={{
          background: '#5b8dee', color: '#fff', border: 'none', borderRadius: 10,
          padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 32,
        }}
      >
        <Key style={{ width: 15, height: 15 }} />
        {reason === 'user_key_failed' ? 'Update key on profile' : 'Add your OpenAI key'}
      </button>

      <div style={{ width: '100%', maxWidth: 420, textAlign: 'left' }} className="space-y-3">
        {[
          { step: '1', title: 'Create a key',     body: 'Go to platform.openai.com → API Keys → Create new secret key.' },
          { step: '2', title: 'Copy it',          body: 'Starts with sk-proj-… — keep it safe.' },
          { step: '3', title: 'Paste on profile', body: 'Profile → OpenAI API Key. We validate it, encrypt it, and never expose it back.' },
        ].map(({ step, title, body }) => (
          <div key={step} style={{ background: '#0e1018', border: '1px solid #1e2130', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#16192a', border: '1px solid #2a2d3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#5b8dee', flexShrink: 0, fontFamily: 'monospace' }}>{step}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#c8ccd8', marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 11, color: '#4a4f60', fontFamily: 'monospace', lineHeight: 1.5 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reusable creative-tool CTA panel. Used for Kavya (email) and Tara (social).
// Maya (mockups) and Ananya (build) have bespoke panels with extra state
// (lock interlock, design inheritance) so they aren't using this helper —
// keep it focused on the simple idle → running → done → error flow.
function CreativeToolPanel({
  status, result, error,
  pendingSessionId, recoveryNote, onRecover,
  color, Icon, label,
  idleHeadline, idleBlurb, idleCta,
  runningHeadline, runningBlurb,
  doneLabel,
  progressLabel,    // optional: live string from the SSE stream
  onTrigger,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      style={{ marginTop: 16, padding: 20, background: '#0e1018', border: '1px solid #1e2130', borderRadius: 12 }}
    >
      {status === 'idle' && (
        <>
          <div style={{ fontSize: 10, color, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            {idleHeadline}
          </div>
          <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
            {idleBlurb}
          </div>
          <button onClick={onTrigger} style={{
            background: color, color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <Icon style={{ width: 14, height: 14 }} /> {idleCta}
          </button>
        </>
      )}
      {status === 'running' && (
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
            <Icon style={{ width: 22, height: 22, color }} />
          </motion.div>
          <div>
            <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>{runningHeadline}</div>
            <div style={{ fontSize: 11, color: progressLabel ? color : '#5a607a', marginTop: 2 }}>
              {progressLabel || runningBlurb}
            </div>
          </div>
        </div>
      )}
      {status === 'done' && result && (
        <>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <CheckCircle2 style={{ width: 16, height: 16, color: '#5cc28a' }} />
            <span style={{ fontSize: 11, color: '#5cc28a', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{doneLabel}</span>
          </div>
          <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{result.summary}</div>
          {result.files?.length > 0 && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#0a0c12', borderRadius: 6, border: '1px solid #1e2130', maxHeight: 180, overflow: 'auto' }}>
              {result.files.map(f => (
                <div key={f.path} style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span>{f.path}</span>
                  <span style={{ color: '#4a4f60' }}>{f.bytes.toLocaleString()} B</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result.preview_url && (
              <a href={`/api${result.preview_url.replace(/^\/api/, '')}`} target="_blank" rel="noopener noreferrer" style={{
                background: color, color: '#fff', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
              }}>
                <Eye style={{ width: 14, height: 14 }} /> Preview
              </a>
            )}
            <a href={`/api${result.download_url.replace(/^\/api/, '')}`} download style={{
              background: '#5cc28a', color: '#0a0c12', borderRadius: 8,
              padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
            }}>
              <Download style={{ width: 14, height: 14 }} /> Download ZIP
            </a>
          </div>
        </>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-3">
          <AlertCircle style={{ width: 18, height: 18, color: '#f06b6b', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#f06b6b', fontWeight: 600 }}>{label} generation failed</div>
            <div style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', marginTop: 4 }}>{error}</div>
            {pendingSessionId && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#0a0c12', border: '1px solid #2a3550', borderRadius: 6, fontSize: 11, color: '#a8b1c8', lineHeight: 1.55 }}>
                The stream dropped but the run may have finished on the server.
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {onRecover && (
                    <button onClick={onRecover} style={{ color, background: 'none', border: `1px solid ${color}44`, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
                      Check if it finished
                    </button>
                  )}
                  {recoveryNote && <span style={{ fontSize: 11, color: '#8a91a8', fontStyle: 'italic' }}>{recoveryNote}</span>}
                </div>
              </div>
            )}
            <button onClick={onTrigger} style={{
              marginTop: 10, color, background: 'none', border: `1px solid ${color}44`,
              borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
            }}>
              Try again
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)    return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Persisted chats come back with responses shaped as `{ name, text }` — the
// `agentIdx` field is added client-side at live-run time so the avatar
// click handlers can map `responses[].agentIdx → team[i]`. Without this,
// every avatar click on a loaded chat silently no-ops because findIndex
// returns -1. Rebuild agentIdx by matching response.name against the team
// (preferring agent_name, falling back to name).
function hydrateAgentIdx(chat) {
  if (!chat) return chat;
  const team = Array.isArray(chat.team) ? chat.team : [];
  const techTeam = Array.isArray(chat.tech_team) ? chat.tech_team : [];
  const indexFor = (roster, name) => {
    if (!name) return null;
    const i = roster.findIndex(a => a?.agent_name === name || a?.name === name);
    return i >= 0 ? i : null;
  };
  const patch = (roster) => (responses) => {
    if (!Array.isArray(responses)) return responses;
    return responses.map((r, fallback) => {
      if (r && Number.isFinite(r.agentIdx)) return r;
      const idx = indexFor(roster, r?.name);
      return { ...r, agentIdx: idx ?? fallback };
    });
  };
  const patchDomain = patch(team);
  const patchTech   = patch(techTeam);
  const turns      = Array.isArray(chat.turns)
    ? chat.turns.map(t => ({ ...t, responses: patchDomain(t.responses) }))
    : chat.turns;
  const techTurns  = Array.isArray(chat.tech_turns)
    ? chat.tech_turns.map(t => ({ ...t, responses: patchTech(t.responses) }))
    : chat.tech_turns;
  return {
    ...chat,
    responses: patchDomain(chat.responses),
    turns,
    tech_turns: techTurns,
  };
}

export default function RoundTablePage() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const initTeam  = location.state?.team || [];
  const initQuery = location.state?.query || '';
  const initUploadedSpec = location.state?.uploadedSpec || null;
  const initPhase = location.state?.phase || null;

  // The uploaded draft spec, when the user arrived (or uploaded here) from a
  // spec file. Drives the review-framed round table + Aisha's combine/as-is.
  // Restored from the active chat (chat.uploaded_spec) so it survives reloads.
  const [uploadedSpec, setUploadedSpec] = useState(initUploadedSpec);
  const rtFileInputRef = useRef(null);
  const [rtUploading, setRtUploading]   = useState(false);
  // Two-phase progress so the centered loader card can name what's happening:
  // 'reading' = parsing the file → text on the server, 'recommending' = embedding +
  // matching specialists. 'idle' means no upload in progress. Phase transitions
  // drive a stepper UI so the user sees clear progress instead of a blank wait.
  const [rtUploadStage, setRtUploadStage] = useState('idle');
  const [rtUploadFilename, setRtUploadFilename] = useState('');
  const [rtUploadError, setRtUploadError] = useState('');
  const [prompt, setPrompt]         = useState('');
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [loading, setLoading]       = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  // TTS "speak this" button state — one shared audio element so switching
  // agents stops the previous voice-over. tag = `${role}:${agentName}` so we
  // can highlight whichever button is currently playing/loading.
  const [ttsTag, setTtsTag]       = useState(null);   // which message is active
  const [ttsState, setTtsState]   = useState('idle'); // 'idle' | 'loading' | 'playing'
  const ttsAudioRef               = useRef(null);
  const ttsObjectUrlRef           = useRef(null);
  const [remaining, setRemaining]   = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [limitReason, setLimitReason]   = useState('limit_reached');
  const [hasUserKey, setHasUserKey]     = useState(false);

  const [chats, setChats]           = useState([]);     // [{ id, query, team, responses, created }]
  const [activeChat, setActiveChat] = useState(null);   // current chat object
  const [draftTeam, setDraftTeam]   = useState(initTeam.slice(0, TEAM_SIZE_MAX));

  // 1:1 agent thread state — one open at a time, keyed by agent_name.
  // `threadOpenFor` is the agent_name whose drilled-in chat is expanded;
  // null means closed. `threadInput`/`threadSending` are the textarea
  // value + in-flight indicator; cleared on close or successful send.
  const [threadOpenFor, setThreadOpenFor] = useState(null);
  const [threadInput, setThreadInput]     = useState('');
  const [threadSending, setThreadSending] = useState(false);
  const [threadError, setThreadError]     = useState('');
  const AGENT_THREAD_TURN_CAP = 10;

  // Tool-action states — scoped to the active chat, reset on chat change.
  // `build` = Ananya app, `mockup` = Maya screens, `email` = Kavya campaign,
  // `social` = Tara social posts. The `progress` field holds the most recent
  // streamed event from the agent (tool call, turn count) so the UI shows
  // "Maya is fetching photos…" instead of a 2-minute opaque spinner.
  // pendingSessionId tracks the workspace id once the SSE stream's
  // `session_start` event fires. It stays populated on error so the UI can
  // offer a "Check if it finished" recovery action — Maya/Ananya often
  // complete server-side after the SSE stream has died on the client.
  const initToolState = { status: 'idle', result: null, error: null, progress: null, pendingSessionId: null, recoveryNote: null };
  const [build, setBuild]   = useState(initToolState);
  const [mockup, setMockup] = useState(initToolState);
  const [email,  setEmail]  = useState(initToolState);
  const [social, setSocial] = useState(initToolState);
  // Spec Engineer state. Independent of the other tools because spec has a
  // simpler shape (text + authors) and lives in tool_results.spec.
  //   idle  → button to generate
  //   running → calling /api/spec
  //   done  → editable textarea + save + send-to-Maya
  //   error → message + retry
  // `editing` holds the in-flight textarea value so Save can compare to the
  // saved copy. `dirty` short-circuits the save button.
  const initSpecState = { status: 'idle', result: null, error: null, editing: '', dirty: false };
  const [spec, setSpec] = useState(initSpecState);
  // Tech round table state — fires after Aisha's first spec via the
  // "Convene tech team" CTA. Two-step: first /api/recommend/tech returns
  // a tech team (status='picking'), then user confirms and we POST
  // /api/roundtable with kind=tech (status='running' → 'done').
  // tech_responses is the flat array of replies; rehydrates from chat.tech_turns.
  const initTechState = { status: 'idle', team: [], responses: [], error: null };
  const [tech, setTech] = useState(initTechState);
  // Deploy panel (Ananya → Hostinger VPS). The persisted source of truth is
  // `build.result.deploy`; this state drives the live run + restore.
  const [deploy, setDeploy] = useState(initToolState);
  // Hostinger connection ("Login to Hostinger" → stored hPanel API token).
  const [hostinger, setHostinger]               = useState({ connected: false, last4: null, loading: true, saving: false, error: null });
  const [showHostingerLogin, setShowHostingerLogin] = useState(false);
  const [hostingerToken, setHostingerToken]     = useState('');
  // On chat switch, rehydrate each tool panel from the chat's persisted
  // tool_results (saved server-side when a run finishes) so previously
  // generated mockups/builds re-appear with their previews. Falls back to idle
  // for tools that were never run in this chat.
  useEffect(() => {
    const saved = activeChat?.tool_results || {};
    const restore = r => (r ? { status: 'done', result: r, error: null, progress: null } : initToolState);
    setBuild(restore(saved.build));
    setMockup(restore(saved.mockup));
    setEmail(restore(saved.email));
    setSocial(restore(saved.social));
    // A finished deploy is persisted nested on the build result.
    setDeploy(saved.build?.deploy ? { status: 'done', result: saved.build.deploy, error: null, progress: null } : initToolState);
    // Spec rehydration: lives at tool_results.spec.
    if (saved.spec) {
      setSpec({ status: 'done', result: saved.spec, error: null, editing: saved.spec.text || '', dirty: false });
    } else {
      setSpec(initSpecState);
    }
    // Uploaded-spec rehydration. Only sync from the chat once one is active —
    // before that, keep whatever the navigation/upload seeded so the first run
    // can review it. Switching to a chat without an upload clears it.
    if (activeChat) setUploadedSpec(activeChat.uploaded_spec || null);
    // Tech RT rehydration — flatten tech_turns into a single responses list.
    const techTurns = Array.isArray(activeChat?.tech_turns) ? activeChat.tech_turns : [];
    if (techTurns.length > 0) {
      const flat = techTurns.flatMap(t => (t.responses || []));
      setTech({ status: 'done', team: activeChat?.tech_team || [], responses: flat, error: null });
    } else {
      setTech(initTechState);
    }
    setShowHostingerLogin(false);
  }, [activeChat?.id]);

  // Persist a finished tool result onto the active chat so it survives reloads.
  // Also mirror it into the local `chats` cache so the in-memory copy matches.
  async function persistToolResult(toolKey, result) {
    const chatId = activeChat?.id;
    if (!chatId || !result?.session_id) return;
    const token = pb.authStore.token;
    if (!token) return;
    try {
      const res = await fetch(`/api/roundtable/chats/${chatId}/tool-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tool: toolKey, result }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.tool_results) {
        setChats(prev => prev.map(c => (c.id === chatId ? { ...c, tool_results: data.tool_results } : c)));
        setActiveChat(prev => (prev?.id === chatId ? { ...prev, tool_results: data.tool_results } : prev));
      }
    } catch { /* best-effort — the in-memory result still shows this session */ }
  }

  // Friendly label for an agent event, used in the running-state subtitle.
  function describeProgress(evt) {
    if (!evt) return null;
    if (evt.kind === 'session_start') return `Spinning up · ${evt.model}`;
    if (evt.kind === 'tool') {
      const name = evt.name || 'tool';
      if (name === 'write_file')    return `Writing ${evt.args?.path || 'file'}`;
      if (name === 'read_file')     return `Reading ${evt.args?.path || 'file'}`;
      if (name === 'list_dir')      return 'Inspecting the workspace';
      if (name === 'search_images') return `Fetching photos for "${evt.args?.query || ''}"`;
      if (name === 'consult_agent') return `Consulting ${evt.args?.agent_name || 'a teammate'}`;
      return `Running ${name}`;
    }
    // Deployer emits deploy_step events with a human-friendly message
    // already baked in (connect → upload → configure → verify → finalize).
    if (evt.kind === 'deploy_step') return evt.message || `Deploy step: ${evt.step || '…'}`;
    if (evt.kind === 'final')     return 'Wrapping up';
    if (evt.kind === 'truncated') return 'Hit the turn cap — finishing what made it';
    return null;
  }

  async function runToolAction({ endpoint, excludeAgentId, setState, toolKey, extraBody = {} }) {
    if (!activeChat) return;
    setState({ status: 'running', result: null, error: null, progress: null, pendingSessionId: null, recoveryNote: null });
    // pendingSessionId is captured outside the setState closure so the catch
    // block can put it on the error state without racing the latest setter.
    let pendingSessionId = null;
    try {
      const skill = activeChat.team.find(s => s.id === excludeAgentId);
      const skillAgentName = skill?.agent_name;
      const context = (activeChat.responses || [])
        .filter(r => r.name && r.text && r.name !== skillAgentName)
        .map(r => ({ agent_name: r.name, perspective: r.text }));
      const token = pb.authStore.token;

      // Switch to SSE streaming via ?stream=1 so we get live progress events
      // and avoid any proxy/browser idle-timeout on multi-minute runs.
      const streamEndpoint = endpoint + (endpoint.includes('?') ? '&' : '?') + 'stream=1';
      const res = await fetch(streamEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // query_override (when present in extraBody) replaces the chat's
        // original query — used by Spec → Maya so Maya designs from the
        // refined spec, not the raw original prompt.
        body: JSON.stringify({
          query: extraBody.query_override || activeChat.query,
          context,
          ...extraBody,
          query_override: undefined,   // strip the override so the server doesn't see it
        }),
      });
      if (!res.ok || !res.body) {
        // Server fell back to JSON (e.g. proxy stripped the stream). Try to
        // read it as JSON for the existing error shape.
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Action failed (${res.status})`);
      }

      // Parse SSE: events are separated by `\n\n`. Each event has an `event:`
      // and `data:` line. Buffer partial reads across chunks.
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      let finalError  = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split;
        while ((split = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, split);
          buffer    = buffer.slice(split + 2);
          if (!raw || raw.startsWith(':')) continue; // heartbeat
          let eventName = 'message';
          let data = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (!data) continue;
          let payload;
          try { payload = JSON.parse(data); }
          catch { continue; }

          if (eventName === 'done') { finalResult = payload; }
          else if (eventName === 'error') { finalError = payload?.error || 'Action failed'; }
          else {
            // session_start carries the workspace id so we can offer a
            // "did it finish anyway?" recovery action if the stream dies.
            if (eventName === 'session_start' && payload?.sessionId) {
              pendingSessionId = payload.sessionId;
              setState(prev => ({ ...prev, pendingSessionId }));
            }
            // Progress event — update the visible subtitle live.
            setState(prev => ({ ...prev, progress: { ...payload, kind: eventName } }));
          }
        }
      }

      if (finalError) throw new Error(finalError);
      if (!finalResult) throw new Error('Stream ended without a result');
      setState({ status: 'done', result: finalResult, error: null, progress: null, pendingSessionId: null, recoveryNote: null });
      if (toolKey) persistToolResult(toolKey, finalResult);
    } catch (err) {
      // Keep pendingSessionId on the error state — the recovery flow uses it
      // to fetch the persisted result via /api/build/:id/result.
      setState({ status: 'error', result: null, error: err.message, progress: null, pendingSessionId, recoveryNote: null });
    }
  }

  // Recovery path: the SSE stream may die mid-run (network blip, proxy
  // timeout, browser tab throttling), but the agent keeps running server-side
  // and writes its final result to a sidecar JSON at
  // /api/build/:id/result. This polls that endpoint and slots the result
  // back into the tool state as if SSE had delivered it.
  async function recoverPending({ setState, toolKey }) {
    return new Promise((resolve) => {
      setState(prev => {
        const sessionId = prev.pendingSessionId;
        if (!sessionId) { resolve(); return prev; }
        // Mark we're checking — UI flips the button to a spinner string.
        (async () => {
          try {
            const r = await fetch(`/api/build/${sessionId}/result`);
            if (r.status === 404) {
              // Server enriches the 404 with workspace state when the agent
              // is still working — show real progress instead of a flat
              // "try again". When the workspace is empty, the agent likely
              // hasn't started writing yet (or never came back at all).
              const info = await r.json().catch(() => ({}));
              let note;
              if (!info.workspace_exists) {
                note = 'Still spinning up — give it 30s and check again.';
              } else {
                const files = info.files_written || 0;
                const secs  = info.last_activity_ms_ago != null
                  ? Math.max(0, Math.round(info.last_activity_ms_ago / 1000))
                  : null;
                const latest = info.latest_file ? ` · ${info.latest_file}` : '';
                const ago = secs != null
                  ? (secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`)
                  : 'just now';
                note = `${files} file${files === 1 ? '' : 's'} written · last activity ${ago}${latest}`;
              }
              setState(p => ({ ...p, recoveryNote: note }));
              resolve();
              return;
            }
            if (!r.ok) {
              const txt = (await r.text()).slice(0, 200);
              setState(p => ({ ...p, recoveryNote: `Lookup failed: ${txt || r.status}` }));
              resolve();
              return;
            }
            const result = await r.json();
            setState({ status: 'done', result, error: null, progress: null, pendingSessionId: null, recoveryNote: null });
            if (toolKey) persistToolResult(toolKey, result);
            resolve();
          } catch (err) {
            setState(p => ({ ...p, recoveryNote: `Lookup failed: ${err.message}` }));
            resolve();
          }
        })();
        return { ...prev, recoveryNote: 'Checking…' };
      });
    });
  }

  // If the design stage already produced mockups in this chat, the build stage
  // consumes them as a design brief. We pass BOTH the session id (so images get
  // copied) AND the persisted brief text (so the handoff works after the
  // workspace has expired — the common case once you come back to a saved chat).
  //
  // For mobile queries Meera replaces Ananya (build) and Priya replaces Maya
  // (design). Both use the generic /api/creative endpoint with an agent_id.
  const isMobile = isMobileQuery(activeChat?.query);
  const triggerBuild = () => {
    if (isMobile) {
      return runToolAction({
        endpoint: '/api/creative',
        excludeAgentId: MOBILE_DEV_SKILL_ID,
        setState: setBuild,
        toolKey: 'build',
        extraBody: { agent_id: MOBILE_DEV_SKILL_ID },
      });
    }
    const extraBody = {};
    if (mockup.status === 'done' && mockup.result) {
      if (mockup.result.session_id)  extraBody.design_session_id = mockup.result.session_id;
      if (mockup.result.design_brief) extraBody.design_brief     = mockup.result.design_brief;
    }
    return runToolAction({
      endpoint: '/api/build',
      excludeAgentId: ANANYA_SKILL_ID,
      setState: setBuild,
      toolKey: 'build',
      extraBody,
    });
  };
  const triggerMockup = (overrideQuery) => {
    if (isMobile) {
      return runToolAction({
        endpoint: '/api/creative',
        excludeAgentId: MOBILE_DESIGNER_SKILL_ID,
        setState: setMockup,
        toolKey: 'mockup',
        extraBody: {
          agent_id: MOBILE_DESIGNER_SKILL_ID,
          ...(typeof overrideQuery === 'string' && overrideQuery.trim()
            ? { query_override: overrideQuery.trim() }
            : {}),
        },
      });
    }
    return runToolAction({
      endpoint: '/api/mockup',
      excludeAgentId: MAYA_SKILL_ID,
      setState: setMockup,
      toolKey: 'mockup',
      // When the Spec Engineer hands off, the spec text replaces the original
      // user query as the design driver.
      ...(typeof overrideQuery === 'string' && overrideQuery.trim()
        ? { extraBody: { query_override: overrideQuery.trim() } }
        : {}),
    });
  };

  // Spec Engineer — synthesize a structured spec doc from the round-table
  // transcript. One-shot LLM call, not the SSE-streamed creative pipeline.
  async function generateSpec() {
    if (!activeChat?.id) return;
    setSpec(s => ({ ...s, status: 'running', error: null }));
    try {
      const token = pb.authStore.token;
      const res = await fetch('/api/spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // When seeded from an upload, hand the draft spec to Aisha so she
        // produces a COMBINED spec (upload + the round table's review).
        body: JSON.stringify({ chat_id: activeChat.id, ...(uploadedSpec?.text ? { raw_spec_text: uploadedSpec.text } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Spec failed (${res.status})`);
      }
      const data = await res.json();
      const result = {
        text: data.spec_text,
        authors: data.authors || [],
        generated_at: data.generated_at,
        edited_at: null,
        engine: data.engine || null,
      };
      setSpec({ status: 'done', result, error: null, editing: result.text, dirty: false });
      persistSpec(result);
    } catch (err) {
      setSpec(s => ({ ...s, status: 'error', error: err.message }));
    }
  }

  // ── TTS "speak this" — per-agent-response voice-over via /api/tts.
  //
  // Single shared audio element (ttsAudioRef): clicking speak on another
  // message stops the previous one. Same tag clicked twice = toggle play/pause.
  // The /api/tts route caches identical (text+voice) inputs server-side, so
  // re-clicking the same message is instant + free after the first request.
  async function toggleSpeak(tag, text) {
    if (!text?.trim()) return;
    const audio = ttsAudioRef.current;
    if (!audio) return;

    // Same tag clicked while playing → pause. Same tag while paused → resume.
    if (ttsTag === tag) {
      if (ttsState === 'playing') {
        audio.pause();
        setTtsState('idle');
      } else if (ttsState === 'idle' && audio.src) {
        audio.play().catch(() => {});
        setTtsState('playing');
      }
      return;
    }

    // New tag → stop current, fetch new, play
    audio.pause();
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
    setTtsTag(tag);
    setTtsState('loading');
    try {
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000), voice: 'nova' }),
      });
      if (!r.ok) throw new Error(`tts ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      ttsObjectUrlRef.current = url;
      audio.src = url;
      audio.onended = () => setTtsState('idle');
      await audio.play();
      setTtsState('playing');
    } catch (err) {
      console.error('tts failed:', err);
      setTtsState('idle');
      setTtsTag(null);
    }
  }

  useEffect(() => {
    return () => {
      // Cleanup on unmount: revoke any pending object URL.
      if (ttsObjectUrlRef.current) {
        URL.revokeObjectURL(ttsObjectUrlRef.current);
        ttsObjectUrlRef.current = null;
      }
    };
  }, []);

  // Per-agent 1:1 thread: send the user's message to the backend, append the
  // resulting transcript onto both the active chat object and the cached
  // chats list so reload + revisit show the same thread.
  async function sendAgentThreadMessage(agentName, message) {
    const chatId = activeChat?.id;
    if (!chatId || !agentName || !message.trim()) return;
    setThreadError('');
    setThreadSending(true);
    try {
      const token = pb.authStore.token;
      const res = await fetch(`/api/roundtable/chats/${chatId}/agent-threads/${encodeURIComponent(agentName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `Reply failed (${res.status})`);
      const nextThread = Array.isArray(data.thread) ? data.thread : [];
      // Patch both the active chat and the cached chats list so the new
      // 1:1 turns survive switching between chats or reloading.
      const patchAgentThreads = (chat) => {
        if (!chat || chat.id !== chatId) return chat;
        return {
          ...chat,
          agent_threads: { ...(chat.agent_threads || {}), [agentName]: nextThread },
        };
      };
      setActiveChat(prev => patchAgentThreads(prev));
      setChats(prev => prev.map(patchAgentThreads));
      setThreadInput('');
    } catch (err) {
      setThreadError(err.message);
    } finally {
      setThreadSending(false);
    }
  }

  async function persistSpec(specResult) {
    const chatId = activeChat?.id;
    if (!chatId) return;
    const token = pb.authStore.token;
    if (!token) return;
    try {
      const res = await fetch(`/api/roundtable/chats/${chatId}/tool-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tool: 'spec', result: specResult }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.tool_results) {
        setChats(prev => prev.map(c => (c.id === chatId ? { ...c, tool_results: data.tool_results } : c)));
        setActiveChat(prev => (prev?.id === chatId ? { ...prev, tool_results: data.tool_results } : prev));
      }
    } catch { /* best-effort */ }
  }

  function saveSpecEdits() {
    if (!spec.result || !spec.dirty) return;
    const updated = { ...spec.result, text: spec.editing, edited_at: new Date().toISOString() };
    setSpec(s => ({ ...s, result: updated, dirty: false }));
    persistSpec(updated);
  }

  function sendSpecToMaya() {
    const text = (spec.editing || spec.result?.text || '').trim();
    if (!text) return;
    if (spec.dirty) saveSpecEdits();
    triggerMockup(text);
  }

  // Skip Aisha's synthesis: hand the user's uploaded spec to Maya verbatim.
  function sendUploadedToMaya() {
    const text = (uploadedSpec?.text || '').trim();
    if (!text) return;
    triggerMockup(text);
  }

  // Upload a spec straight from the Round Table page: extract text, recommend a
  // fresh team from it, and stage a new chat (team + title + uploadedSpec) so
  // the next Run reviews the spec.
  async function uploadSpecHere(file) {
    if (!file || rtUploading) return;
    setRtUploadError('');
    setRtUploading(true);
    setRtUploadStage('reading');
    setRtUploadFilename(file.name);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/spec/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Couldn't read that file (${res.status})`);
      const specText = (data.text || '').trim();
      if (!specText) throw new Error('No text found in that file.');
      // We deliberately DO NOT recommend a team or auto-run the round table
      // here. The user wanted to land on a quiet "ready to verify" state with
      // the spec attached and a sensible default prompt. Team recommendation
      // is deferred to submit (see run()), so the user can edit the prompt
      // first and only pay the recommend round-trip when they're ready.
      setActiveChat(null);
      setDraftTeam([]);
      setUploadedSpec({ text: specText, filename: file.name });
      setPrompt('Verify the spec');
    } catch (err) {
      setRtUploadError(err.message);
    } finally {
      setRtUploading(false);
      setRtUploadStage('idle');
      setRtUploadFilename('');
      if (rtFileInputRef.current) rtFileInputRef.current.value = '';
    }
  }

  // Convene tech team — single-step: recommend a tech team off the current
  // spec text, then immediately run the tech round table on that team with
  // the spec as the context. Once tech responses are in, we auto-regenerate
  // Aisha's spec so it incorporates both transcripts.
  async function conveneTechTeam() {
    const chatId = activeChat?.id;
    const specText = (spec.editing || spec.result?.text || '').trim();
    if (!chatId || !specText) return;
    setTech({ status: 'recommending', team: [], responses: [], error: null });
    const token = pb.authStore.token;
    try {
      // 1. Recommend tech specialists off the spec.
      const recRes = await fetch('/api/recommend/tech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: specText, size: 5 }),
      });
      if (!recRes.ok) throw new Error(`Tech recommend failed (${recRes.status})`);
      const recData = await recRes.json();
      const techTeam = recData.skills || [];
      if (techTeam.length === 0) throw new Error('No tech specialists matched this spec');

      setTech({ status: 'running', team: techTeam, responses: [], error: null });

      // 2. Run the tech round table. The "query" we pass is a focused brief
      // — what the tech team should debate. Anchored on the spec.
      const techQuery = `Review this spec and weigh in on the engineering choices, architecture, and risks. Where it's silent on stack/infra, propose concrete options.\n\nSpec:\n${specText}`;
      const rtRes = await fetch('/api/roundtable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: techQuery,
          team: techTeam,
          chat_id: chatId,
          kind: 'tech',
        }),
      });
      if (!rtRes.ok) {
        const errBody = await rtRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Tech round table failed (${rtRes.status})`);
      }
      const rtData = await rtRes.json();
      const responses = rtData.responses || [];
      setTech({ status: 'done', team: techTeam, responses, error: null });

      // Reflect the tech turn into local activeChat so the next Aisha
      // regenerate sees it without a server round-trip.
      setActiveChat(prev => prev ? {
        ...prev,
        tech_team: techTeam,
        tech_turns: [{ query: techQuery, responses }],
      } : prev);

      // 3. Auto-regenerate Aisha's spec with combined context.
      generateSpec();
    } catch (err) {
      setTech(t => ({ ...t, status: 'error', error: err.message }));
    }
  }

  // Save the Hostinger hPanel API token ("Login to Hostinger").
  async function saveHostingerToken() {
    const tok = hostingerToken.trim();
    if (!tok) return;
    setHostinger(h => ({ ...h, saving: true, error: null }));
    try {
      const token = pb.authStore.token;
      const res = await fetch('/api/me/hostinger', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: tok }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setHostinger(h => ({ ...h, saving: false, error: data.error || 'Could not save token' })); return; }
      setHostinger({ connected: true, last4: data.last4 || null, loading: false, saving: false, error: null });
      setShowHostingerLogin(false);
      setHostingerToken('');
    } catch (err) {
      setHostinger(h => ({ ...h, saving: false, error: err.message }));
    }
  }

  // Deploy Ananya's finished build to the Hostinger VPS. Streams progress over
  // SSE, then nests the deploy result on the build and persists it.
  async function triggerDeploy() {
    const sessionId = build.result?.session_id;
    if (!sessionId) return;
    setDeploy({ status: 'running', result: null, error: null, progress: null });
    try {
      const token = pb.authStore.token;
      const res = await fetch('/api/deploy?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      // Not-connected (or any pre-stream failure) comes back as JSON, not SSE.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'hostinger_not_connected') {
          setHostinger(h => ({ ...h, connected: false }));
          setShowHostingerLogin(true);
          throw new Error('Connect your Hostinger account first.');
        }
        throw new Error(data.error || `Deploy failed (${res.status})`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      let finalError  = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split;
        while ((split = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, split);
          buffer    = buffer.slice(split + 2);
          if (!raw || raw.startsWith(':')) continue;
          let eventName = 'message';
          let data = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (!data) continue;
          let payload;
          try { payload = JSON.parse(data); } catch { continue; }
          if (eventName === 'done') finalResult = payload;
          else if (eventName === 'error') finalError = payload?.error || 'Deploy failed';
          else setDeploy(prev => ({ ...prev, progress: { ...payload, kind: eventName } }));
        }
      }

      if (finalError) throw new Error(finalError);
      if (!finalResult) throw new Error('Stream ended without a result');
      setDeploy({ status: 'done', result: finalResult, error: null, progress: null });

      // Nest the deploy on the build result and persist so it survives reloads.
      const updatedBuild = { ...build.result, deploy: finalResult };
      setBuild(prev => ({ ...prev, result: updatedBuild }));
      persistToolResult('build', updatedBuild);
    } catch (err) {
      setDeploy({ status: 'error', result: null, error: err.message, progress: null });
    }
  }
  // Kavya + Tara both run via the generic /api/creative endpoint — the agent
  // is picked by agent_id (PocketBase skill id). See routes/creative.js.
  const triggerEmail = () => runToolAction({
    endpoint: '/api/creative',
    excludeAgentId: KAVYA_SKILL_ID,
    setState: setEmail,
    toolKey: 'email',
    extraBody: { agent_id: KAVYA_SKILL_ID },
  });
  const triggerSocial = () => runToolAction({
    endpoint: '/api/creative',
    excludeAgentId: TARA_SKILL_ID,
    setState: setSocial,
    toolKey: 'social',
    extraBody: { agent_id: TARA_SKILL_ID },
  });

  // Convenience flag for the UI to indicate Ananya will inherit Maya's design.
  // True when Maya finished and we have either her live session or her persisted
  // brief text to hand over.
  const buildWillInheritDesign = mockup.status === 'done'
    && !!(mockup.result?.session_id || mockup.result?.design_brief);

  const inputRef = useRef(null);

  // Agents shown in the round table viz: from active chat if one is loaded, else from the draft team
  const visTeam = activeChat?.team || draftTeam;
  const agents  = visTeam.slice(0, TEAM_SIZE_MAX).map((skill, i) => ({ ...skill, color: PALETTE[i] || PALETTE[i % PALETTE.length], idx: i }));
  const ovalPositions = getOvalPositions(agents.length);
  // Team can be edited at any time the round table isn't mid-call — both
  // before the first prompt AND between turns of an active chat. Adding mid-
  // conversation means the new agent gets prior turns as background context
  // and responds from the next turn forward; removing means that agent stops
  // weighing in. Legacy chats predate multi-turn so we don't touch them.
  const canEditTeam = !loading && !activeChat?.legacy;
  // Source-of-truth team for the editor: the active chat's team while a chat
  // is open, otherwise the draft. removeAgent/addAgent route writes to the
  // matching slot.
  const editingTeam = activeChat?.team || draftTeam;
  const canRemove   = canEditTeam && editingTeam.length > TEAM_SIZE_MIN;
  const canAdd      = canEditTeam && editingTeam.length < TEAM_SIZE_MAX;

  // Agent-add picker state. Search hits /api/recommend so results are ordered
  // by relevance to the user's typed query (not by recency). Stuck behind a
  // popover so the search field doesn't clutter the resting page.
  const [showPicker, setShowPicker]       = useState(false);
  const [pickerQuery, setPickerQuery]     = useState('');
  const [pickerResults, setPickerResults] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  function applyTeamMutation(mutator) {
    if (activeChat) {
      // Edit the live chat's team; also reflect into the history sidebar
      // entry so prepended chat list stays consistent.
      setActiveChat(prev => prev ? { ...prev, team: mutator(prev.team || []) } : prev);
      setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, team: mutator(c.team || []) } : c));
    } else {
      setDraftTeam(prev => mutator(prev));
    }
  }
  function removeAgent(skillId) {
    if (!canRemove) return;
    applyTeamMutation(team => team.filter(s => s.id !== skillId));
  }
  function addAgent(skill) {
    if (!canAdd) return;
    if (editingTeam.some(s => s.id === skill.id)) return;
    applyTeamMutation(team => [...team, skill]);
    setShowPicker(false);
    setPickerQuery('');
    setPickerResults([]);
  }
  async function searchAgents(q) {
    const text = q.trim();
    if (!text) { setPickerResults([]); return; }
    setPickerLoading(true);
    try {
      const r = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, size: 15 }),
      });
      if (!r.ok) { setPickerResults([]); return; }
      const data = await r.json();
      const selected = new Set(editingTeam.map(s => s.id));
      setPickerResults((data.skills || []).filter(s => !selected.has(s.id)));
    } catch {
      setPickerResults([]);
    } finally {
      setPickerLoading(false);
    }
  }
  // Debounced search — fires 250ms after the user stops typing.
  useEffect(() => {
    if (!showPicker) return;
    const id = setTimeout(() => { searchAgents(pickerQuery); }, 250);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerQuery, showPicker, editingTeam.length]);

  // Load history + usage on mount
  useEffect(() => {
    const token = pb.authStore.token;
    if (!token) return;

    fetch('/api/roundtable/chats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.chats) setChats(data.chats.map(hydrateAgentIdx)); })
      .catch(() => {});

    fetch('/api/roundtable/usage', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.has_user_key) {
          setHasUserKey(true);
          setRemaining(null);
          setLimitReached(false);
        } else {
          setHasUserKey(false);
          setRemaining(data.remaining);
          if (data.remaining <= 0) { setLimitReached(true); setLimitReason('limit_reached'); }
        }
      })
      .catch(() => {});

    // Hostinger connection status — gates Ananya's deploy button.
    fetch('/api/me/hostinger', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setHostinger(h => ({ ...h, connected: !!data?.connected, last4: data?.last4 || null, loading: false })))
      .catch(() => setHostinger(h => ({ ...h, loading: false })));
  }, []);

  // Reset focus to the FIRST response of the latest turn whenever the active
  // chat changes OR a new turn lands. Picking the first response (not last)
  // makes the carousel start from the top of the new round, matching the
  // reading order in the prior-turns transcript above it.
  useEffect(() => {
    const latest = activeChat?.turns?.[activeChat.turns.length - 1];
    const responsesLen = latest?.responses?.length || activeChat?.responses?.length || 0;
    if (responsesLen > 0) setFocusedIdx(0);
  }, [activeChat?.id, activeChat?.turns?.length]);

  async function run(q) {
    const baseQuery = (q || prompt).trim();
    if (!baseQuery || loading) return;

    // Multi-turn append vs new-chat decision. Legacy chats (predating the
    // turns field) stay read-only — submitting starts a fresh chat, same as
    // before, so the migration boundary doesn't graft new turns onto rows
    // that the old write path can't represent. The 10-turn cap matches the
    // backend; past it we silently fall back to a new chat.
    const TURN_CAP = 10;
    const isFollowUp = !!activeChat
      && !activeChat.legacy
      && Array.isArray(activeChat.turns)
      && activeChat.turns.length > 0
      && activeChat.turns.length < TURN_CAP;

    // When seeded from an uploaded draft spec (initial run only), the round
    // table REVIEWS the spec — each expert says what's missing — instead of
    // discussing a fresh prompt. The spec rides in the query so the agents see
    // it; uploaded_spec is persisted so Aisha can later combine the two.
    const seedFromUpload = !!uploadedSpec && !isFollowUp;
    const query = seedFromUpload
      ? `You are reviewing a draft spec the user uploaded${baseQuery ? ` ("${baseQuery}")` : ''}. From your specialty, add what's MISSING — gaps, risks, requirements, and anything you'd insist on before building. Build on the spec; don't just restate it.\n\n=== DRAFT SPEC ===\n${uploadedSpec.text}`
      : baseQuery;

    // Team for follow-ups stays locked to the existing chat's team — the
    // model can't sensibly switch personas mid-conversation.
    let teamForRun = isFollowUp
      ? activeChat.team.slice(0, TEAM_SIZE_MAX)
      : draftTeam.slice(0, TEAM_SIZE_MAX);

    // Spec-seeded chats arrive without a team — uploadSpecHere intentionally
    // skipped recommend so the user could see the attached spec + edit the
    // prompt first. Recommend lazily at submit time, off the spec text so
    // the picked specialists match the actual content (not whatever default
    // prompt the user kept). Use the centered upload loader for visibility.
    if (!isFollowUp && teamForRun.length === 0 && seedFromUpload) {
      setRtUploadError('');
      setRtUploading(true);
      setRtUploadStage('recommending');
      setRtUploadFilename(uploadedSpec.filename || 'spec');
      try {
        const rres = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: uploadedSpec.text.slice(0, 8000), size: 6 }),
        });
        const rdata = await rres.json().catch(() => ({}));
        const team = (rdata.skills || []).slice(0, TEAM_SIZE_MAX);
        if (team.length === 0) {
          setRtUploadError('Could not match any specialists to this spec — try editing the spec or the prompt.');
          return;
        }
        setDraftTeam(team);
        teamForRun = team;
      } catch (err) {
        setRtUploadError(`Specialist recommendation failed: ${err.message}`);
        return;
      } finally {
        setRtUploading(false);
        setRtUploadStage('idle');
        setRtUploadFilename('');
      }
    }

    if (teamForRun.length === 0 || limitReached) return;

    setPrompt('');
    if (!isFollowUp) setActiveChat(null);
    setLoading(true);
    setActiveIdx(-1);
    setFocusedIdx(0);

    // animate cycling agents during wait
    let cur = 0;
    const animTimer = setInterval(() => {
      setActiveIdx(cur % teamForRun.length);
      cur++;
    }, 600);

    try {
      const token = pb.authStore.token;
      const res = await fetch('/api/roundtable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query,
          team: teamForRun,
          ...(isFollowUp
            ? { chat_id: activeChat.id, prior_turns: activeChat.turns }
            : { ...(seedFromUpload ? { uploaded_spec: uploadedSpec } : {}), ...(initPhase ? { phase: initPhase } : {}) }),
        }),
      });

      clearInterval(animTimer);

      if (res.status === 402) {
        const errBody = await res.json().catch(() => ({}));
        setLimitReached(true);
        setLimitReason(errBody.error === 'user_key_failed' ? 'user_key_failed' : 'limit_reached');
        if (errBody.error !== 'user_key_failed') setRemaining(0);
        return;
      }

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();

      if (data.remaining !== undefined) {
        setRemaining(data.remaining);
        if (data.remaining <= 0) setLimitReached(true);
      }

      const responsesWithIdx = data.responses.map((r, i) => {
        const agentIdx = teamForRun.findIndex(a => a.agent_name === r.name || a.name === r.name);
        return { ...r, agentIdx: agentIdx >= 0 ? agentIdx : i };
      });

      const newTurn = { query, responses: [] };

      if (isFollowUp) {
        // Append a fresh turn to the existing chat. We keep mutating the
        // last turn's responses array as the per-agent reveal animates.
        setActiveChat(prev => prev ? { ...prev, turns: [...(prev.turns || []), newTurn] } : prev);
      } else {
        const newChat = {
          id: data.chatId || `local-${Date.now()}`,
          query,
          team: teamForRun,
          responses: [],
          turns: [newTurn],
          legacy: false,
          created: new Date().toISOString(),
          ...(seedFromUpload ? { uploaded_spec: uploadedSpec } : {}),
        };
        setActiveChat(newChat);
      }

      // Reveal responses one at a time, appending to the latest turn each time.
      for (let i = 0; i < responsesWithIdx.length; i++) {
        setActiveIdx(responsesWithIdx[i].agentIdx);
        await new Promise(resolve => setTimeout(resolve, 300));
        setActiveChat(prev => {
          if (!prev) return prev;
          const turns = (prev.turns || []).slice();
          const lastIdx = turns.length - 1;
          if (lastIdx < 0) return prev;
          turns[lastIdx] = { ...turns[lastIdx], responses: [...turns[lastIdx].responses, responsesWithIdx[i]] };
          // Keep top-level `responses` mirroring the latest turn so any older
          // consumer that still reads activeChat.responses stays current.
          return { ...prev, turns, responses: turns[lastIdx].responses };
        });
      }

      // Snapshot the final state into history. For follow-ups we update the
      // existing entry; for fresh chats we prepend a new one.
      const finalTurns = isFollowUp
        ? [...(activeChat.turns || []), { query, responses: responsesWithIdx }]
        : [{ query, responses: responsesWithIdx }];

      if (isFollowUp) {
        setChats(prev => prev.map(c => (
          c.id === activeChat.id ? { ...c, turns: finalTurns, responses: responsesWithIdx } : c
        )));
      } else {
        const newChat = {
          id: data.chatId || `local-${Date.now()}`,
          query,
          team: teamForRun,
          responses: responsesWithIdx,
          turns: finalTurns,
          legacy: false,
          created: new Date().toISOString(),
          ...(seedFromUpload ? { uploaded_spec: uploadedSpec } : {}),
        };
        setChats(prev => [newChat, ...prev]);
      }
      setActiveIdx(-1);
    } catch (err) {
      clearInterval(animTimer);
      console.error(err);
    } finally {
      setLoading(false);
      setActiveIdx(-1);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
    }
  }

  const didAutoRun = useRef(false);
  useEffect(() => {
    if (initQuery && draftTeam.length > 0 && !didAutoRun.current) {
      didAutoRun.current = true;
      run(initQuery);
    }
  }, []);

  function selectChat(chat) {
    // Persisted chats arrive from the API without agentIdx on each response —
    // the click-to-focus handlers below depend on agentIdx, so without
    // rehydration every avatar click silently no-ops. Hydration also runs
    // at list-load (hydrateAgentIdx in the fetch above); doing it here too
    // catches anything passed in from elsewhere (navigation state, etc).
    const hydrated = hydrateAgentIdx(chat);
    setActiveChat(hydrated);
    const latest = hydrated.turns?.[hydrated.turns.length - 1]?.responses
                || hydrated.responses
                || [];
    setFocusedIdx(latest.length ? latest.length - 1 : 0);
    setActiveIdx(-1);
  }

  function startNewChat() {
    setActiveChat(null);
    setActiveIdx(-1);
    setFocusedIdx(0);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }

  async function deleteChat(chatId, e) {
    e.stopPropagation();
    const token = pb.authStore.token;
    if (!token) return;
    try {
      await fetch(`/api/roundtable/chats/${chatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat?.id === chatId) setActiveChat(null);
    } catch {}
  }

  // Multi-turn: responses always refers to the LATEST turn's responses so the
  // focused-response carousel + agent highlighting always reflect the most
  // recent round of answers. Prior turns are surfaced separately above.
  const turns           = Array.isArray(activeChat?.turns) ? activeChat.turns : (activeChat ? [{ query: activeChat.query, responses: activeChat.responses || [] }] : []);
  const latestTurn      = turns[turns.length - 1];
  const priorTurns      = turns.slice(0, -1);
  const responses       = latestTurn?.responses || activeChat?.responses || [];
  const focusedResponse = responses[focusedIdx];
  const focusedAgent    = focusedResponse ? agents[focusedResponse.agentIdx] || agents[0] : null;
  const focusedColor    = focusedResponse ? PALETTE[focusedResponse.agentIdx] || PALETTE[0] : null;
  // Disabling the follow-up affordance on legacy chats keeps the
  // pre-multi-turn schema untouched and gives users a clear nudge to start
  // fresh if they want a conversation.
  const canFollowUp     = !!activeChat && !activeChat.legacy && turns.length < 10;

  const remainingColor =
    remaining === null ? '#4a4f60'
    : remaining <= 2   ? '#f06b6b'
    : remaining <= 5   ? '#f0a04b'
    : '#4a4f60';

  return (
    <>
      <Helmet>
        <title>Round Table — kaushalstack</title>
      </Helmet>

      {/* Clamp to viewport-minus-header (4rem = Header h-16) so the inner
          flex-1 overflow-y-auto regions get a bounded height. Footer is
          hidden on this route so nothing else competes for vertical space. */}
      <div style={{ background: '#080a0e', height: 'calc(100vh - 4rem)', color: '#e8eaf0' }} className="flex flex-col">

        {/* Top bar */}
        <div style={{ background: '#0d0f16', borderBottom: '1px solid #1e2130' }}
          className="flex items-center justify-between px-5 py-3 z-10 flex-shrink-0">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold tracking-widest uppercase">Round Table</span>
          </button>

          <div className="flex items-center gap-3">
            {hasUserKey && (
              <span style={{ background: '#0a2618', border: '1px solid #4ecba844', color: '#4ecba8' }}
                className="text-xs font-mono px-3 py-1 rounded-full flex items-center gap-1">
                <Key style={{ width: 11, height: 11 }} /> your key
              </span>
            )}
            {!hasUserKey && remaining !== null && !limitReached && (
              <span style={{ background: '#12141c', border: `1px solid ${remainingColor}44`, color: remainingColor }}
                className="text-xs font-mono px-3 py-1 rounded-full">
                {remaining} request{remaining !== 1 ? 's' : ''} remaining
              </span>
            )}
            {limitReached && (
              <span style={{ background: '#1a0a0a', border: '1px solid #f06b6b44', color: '#f06b6b' }}
                className="text-xs font-mono px-3 py-1 rounded-full">
                limit reached
              </span>
            )}
            <span style={{ background: '#12141c', border: '1px solid #1e2130' }}
              className="text-xs font-mono text-gray-500 px-3 py-1 rounded-full">
              {agents.length} agents
            </span>
            {loading && (
              <motion.span
                style={{ background: '#12141c', border: '1px solid #1a2040', color: '#5b8dee' }}
                className="text-xs font-mono px-3 py-1 rounded-full flex items-center gap-1.5"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                thinking <TypingDots color="#5b8dee" />
              </motion.span>
            )}
          </div>
        </div>

        {/* 3-column layout — min-h-0 is the Flexbox overflow gotcha: without
            it, this row's min-height: auto lets it grow to fit children,
            defeating the overflow-hidden + the inner columns' overflow-y-auto.
            Same min-h-0 reasoning applies to each column. */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Left: Round Table Viz (hidden on mobile — compact strip lives in
                  the middle column instead) ── */}
          <div style={{ width: 280, minWidth: 280, background: '#0a0c12', borderRight: '1px solid #1e2130' }}
            className="hidden md:flex flex-col items-center py-6 flex-shrink-0 min-h-0 overflow-y-auto">

            {/* Vertical oval boardroom — row count adapts to team size so the
                table always looks packed. Seats alternate left→right in fill
                order. */}
            <div className="relative" style={{ width: OVAL_VIEW.width, height: OVAL_VIEW.height }}>
              <svg width={OVAL_VIEW.width} height={OVAL_VIEW.height} viewBox={`0 0 ${OVAL_VIEW.width} ${OVAL_VIEW.height}`} className="absolute top-0 left-0">
                {/* Conference table — soft capsule */}
                <rect
                  x={OVAL_TABLE.x} y={OVAL_TABLE.y}
                  width={OVAL_TABLE.width} height={OVAL_TABLE.height}
                  rx={OVAL_TABLE.rx} ry={OVAL_TABLE.rx}
                  fill="#0f1118" stroke="#1e2130" strokeWidth="1"
                />
              </svg>

              {/* Avatars positioned around the table */}
              {agents.map((a, i) => {
                const pos = ovalPositions[i];
                if (!pos) return null;
                return (
                  <button key={`oval-${i}`} className="absolute flex flex-col items-center"
                    style={{
                      left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)',
                      zIndex: 2, gap: 3, background: 'none', border: 'none',
                      cursor: responses.length > 0 ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      const rIdx = responses.findIndex(r => r.agentIdx === i);
                      if (rIdx >= 0) setFocusedIdx(rIdx);
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <motion.div
                        animate={
                          activeIdx === i ? {
                            boxShadow: [`0 0 0 2px ${a.color}50, 0 0 16px ${a.color}30`, `0 0 0 4px ${a.color}20, 0 0 26px ${a.color}20`],
                            scale: 1.12, borderColor: `${a.color}99`,
                          } : focusedResponse?.agentIdx === i ? {
                            boxShadow: `0 0 0 2px ${a.color}60`, scale: 1.06, borderColor: `${a.color}88`,
                          } : {
                            boxShadow: 'none', scale: 1, borderColor: 'rgba(255,255,255,0.06)',
                          }
                        }
                        transition={{ duration: 0.3 }}
                        style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}
                      >
                        <img src={avatarUrl(a.agent_name)} alt={a.agent_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </motion.div>
                      {/* Remove ✕ — only while drafting AND we have more than
                          the floor team size, so the user can't accidentally
                          drop below 6. role=button + stopPropagation keeps
                          the click from also firing the parent focus button. */}
                      {canRemove && (
                        <span
                          role="button"
                          aria-label={`Remove ${a.agent_name}`}
                          title={`Remove ${a.agent_name}`}
                          onClick={(e) => { e.stopPropagation(); removeAgent(a.id); }}
                          style={{
                            position: 'absolute', top: -4, right: -4,
                            width: 16, height: 16, borderRadius: '50%',
                            background: '#1a0a0a', border: '1px solid #f06b6b88',
                            color: '#f06b6b', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 4, transition: 'transform 0.15s, background 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.18)'; e.currentTarget.style.background = '#3a0e0e'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = '#1a0a0a'; }}
                        >
                          <X style={{ width: 9, height: 9 }} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', width: 88 }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.15,
                        color: activeIdx === i ? a.color : focusedResponse?.agentIdx === i ? `${a.color}cc` : '#5a5f72',
                        transition: 'color 0.3s',
                        // 2-line clamp instead of single-line ellipsis so
                        // "Calisthenics Coach" reads as "Calisthenics / Coach"
                        // rather than "Calisthenic…".
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {a.agent_name}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* "Thinking" pill at the centre of the table */}
              <motion.div
                style={{
                  position: 'absolute', left: OVAL_CENTER.x, top: OVAL_CENTER.y,
                  transform: 'translate(-50%, -50%)',
                  background: '#0a0c12', borderRadius: 999,
                  padding: '6px 12px', zIndex: 3,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                animate={{
                  borderColor: activeIdx >= 0 ? `${PALETTE[activeIdx]}55` : '#1e2130',
                  boxShadow: activeIdx >= 0 ? `0 0 16px ${PALETTE[activeIdx]}25` : 'none',
                  border: `1px solid ${activeIdx >= 0 ? `${PALETTE[activeIdx]}55` : '#1e2130'}`,
                }}
                transition={{ duration: 0.3 }}
              >
                {activeIdx >= 0 ? (
                  <>
                    <TypingDots color={PALETTE[activeIdx]} />
                    <motion.span
                      style={{
                        fontSize: 9, fontFamily: 'monospace', color: PALETTE[activeIdx],
                        letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      {agents[activeIdx].agent_name}
                    </motion.span>
                  </>
                ) : (
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#3a3f52', letterSpacing: '0.05em' }}>
                    💬 round table
                  </span>
                )}
              </motion.div>
            </div>

            {/* Team-size pill + add-agent affordance — only while drafting.
                The pill shows current/max so the user sees room before they
                click; the button is a popover trigger. Hidden once a chat
                is active because the team is locked from that point. */}
            {canEditTeam && (
              <div className="mt-4 w-full px-4 flex flex-col items-center gap-3" style={{ position: 'relative' }}>
                <div style={{ fontSize: 10, color: '#4a4f60', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                  {editingTeam.length} / {TEAM_SIZE_MAX} agents
                </div>
                <button
                  onClick={() => { setShowPicker(s => !s); setPickerQuery(''); setPickerResults([]); }}
                  disabled={!canAdd}
                  style={{
                    background: canAdd ? '#12141c' : '#0d0f16',
                    border: `1px dashed ${canAdd ? '#5b8dee55' : '#1e213055'}`,
                    color: canAdd ? '#5b8dee' : '#3a3f52',
                    borderRadius: 8, padding: '7px 12px',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                    cursor: canAdd ? 'pointer' : 'not-allowed',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <UserPlus style={{ width: 12, height: 12 }} />
                  {canAdd ? 'Add agent' : 'Team full'}
                </button>

                <AnimatePresence>
                  {showPicker && canAdd && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'absolute', top: '100%', left: 8, right: 8,
                        background: '#0d0f16', border: '1px solid #1e2130',
                        borderRadius: 10, marginTop: 6, padding: 10, zIndex: 30,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#12141c', border: '1px solid #1e2130', borderRadius: 8, padding: '6px 8px', marginBottom: 8 }}>
                        <Search style={{ width: 11, height: 11, color: '#4a4f60' }} />
                        <input
                          autoFocus
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setShowPicker(false); }}
                          placeholder="Search for an agent…"
                          style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            color: '#e8eaf0', fontSize: 12, fontFamily: 'monospace',
                          }}
                        />
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {pickerLoading && (
                          <div style={{ fontSize: 11, color: '#4a4f60', padding: '8px 6px', fontFamily: 'monospace' }}>Searching…</div>
                        )}
                        {!pickerLoading && pickerQuery.trim() && pickerResults.length === 0 && (
                          <div style={{ fontSize: 11, color: '#4a4f60', padding: '8px 6px', fontFamily: 'monospace' }}>No matching agents</div>
                        )}
                        {!pickerLoading && !pickerQuery.trim() && (
                          <div style={{ fontSize: 11, color: '#3a3f52', padding: '8px 6px', fontFamily: 'monospace', lineHeight: 1.5 }}>
                            Type what you want help with — e.g. "kirana marketing", "GST", "logo design".
                          </div>
                        )}
                        {!pickerLoading && pickerResults.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => addAgent(s)}
                            style={{
                              width: '100%', textAlign: 'left',
                              background: 'transparent', border: '1px solid transparent',
                              borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 8,
                              marginBottom: 2, transition: 'background 0.12s, border-color 0.12s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#12141c'; e.currentTarget.style.borderColor = '#1e2130'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            <img src={avatarUrl(s.agent_name)} alt={s.agent_name}
                              style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#c8ccd8', lineHeight: 1.2 }}>
                                {s.agent_name}
                              </div>
                              <div style={{ fontSize: 9, color: '#5a5f72', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.category} · {s.name}
                              </div>
                            </div>
                            <Plus style={{ width: 12, height: 12, color: '#5b8dee', flexShrink: 0 }} />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </div>

          {/* ── Middle: Active Chat (input at TOP) ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">

            {/* Compact agents strip (mobile only — replaces the left viz which
                is hidden below md). Horizontal scroll if more than ~6 fit. */}
            <div className="md:hidden flex items-center gap-2 px-3 py-2 overflow-x-auto flex-shrink-0"
              style={{ background: '#0a0c12', borderBottom: '1px solid #1e2130' }}>
              {agents.map((a, i) => {
                const hasResponse = responses.some(r => r.agentIdx === i);
                const isActive    = activeIdx === i;
                const isFocused   = focusedResponse?.agentIdx === i;
                return (
                  <button key={i}
                    onClick={() => {
                      const rIdx = responses.findIndex(r => r.agentIdx === i);
                      if (rIdx >= 0) setFocusedIdx(rIdx);
                    }}
                    disabled={!hasResponse}
                    style={{
                      background: isFocused ? `${a.color}12` : 'transparent',
                      border: `1px solid ${isFocused ? `${a.color}40` : 'transparent'}`,
                      borderRadius: 999,
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: `1.5px solid ${isActive ? a.color : isFocused ? `${a.color}aa` : 'rgba(255,255,255,0.08)'}`,
                      overflow: 'hidden',
                    }}>
                      <img src={avatarUrl(a.agent_name)} alt={a.agent_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                      color: isActive ? a.color : isFocused ? `${a.color}cc` : '#4a4f60',
                    }}>
                      {a.agent_name}
                    </span>
                    {isActive && <TypingDots color={a.color} />}
                  </button>
                );
              })}
            </div>

            {/* Input pinned to top */}
            <div style={{ background: '#0a0c12', borderBottom: '1px solid #1e2130' }} className="px-3 sm:px-5 py-3 sm:py-4 flex-shrink-0">
              {/* Active chat query header — shows the most recent turn's question */}
              {activeChat && (
                <div className="mb-3 flex items-start gap-2">
                  <span style={{ fontSize: 10, color: '#4a4f60', fontFamily: 'monospace', flexShrink: 0, paddingTop: 2 }}>
                    {turns.length > 1 ? `T${turns.length}:` : 'YOU:'}
                  </span>
                  {/* Spec-seeded chats can have queries up to ~100 chars —
                      clamp the display to 2 lines so the input stays anchored
                      and the response area gets its full slot. The full text
                      lives in the title attribute on hover. */}
                  <span
                    title={latestTurn?.query || activeChat.query}
                    style={{
                      fontSize: 13, color: '#c8ccd8', fontWeight: 600, flex: 1,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.4,
                    }}
                  >
                    {latestTurn?.query || activeChat.query}
                  </span>
                </div>
              )}
              {/* Legacy-chat banner — predates multi-turn, can't be appended to */}
              {activeChat?.legacy && (
                <div className="mb-3 flex items-center gap-2" style={{
                  background: '#1a1408', border: '1px solid #4d3811', borderRadius: 8,
                  padding: '6px 10px', fontSize: 11, color: '#d4b27d', lineHeight: 1.5,
                }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>READ-ONLY</span>
                  <span>· this chat predates multi-turn. Submitting will start a fresh chat.</span>
                </div>
              )}
              {uploadedSpec && !canFollowUp && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, color: '#b07ef8' }}>
                  <Paperclip style={{ width: 12, height: 12 }} />
                  Reviewing uploaded spec · {uploadedSpec.filename}
                  <button onClick={() => setUploadedSpec(null)} title="Remove" style={{ background: 'none', border: 'none', color: '#5a607a', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              )}
              {rtUploadError && <div style={{ fontSize: 11, color: '#f06b6b', marginBottom: 6 }}>{rtUploadError}</div>}
              <div style={{ background: '#12141c', border: `1px solid ${limitReached ? '#f06b6b33' : canFollowUp ? '#5b8dee44' : '#1e2130'}`, borderRadius: 12 }}
                className="flex items-center gap-2 px-3 py-2">
                <input
                  ref={rtFileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,.json,.csv,.yaml,.yml,.pdf,.docx"
                  className="hidden"
                  onChange={e => uploadSpecHere(e.target.files?.[0])}
                />
                <button
                  onClick={() => rtFileInputRef.current?.click()}
                  disabled={rtUploading || loading || canFollowUp}
                  title={canFollowUp ? 'Start a new chat to upload a spec' : 'Upload a spec (.md, .txt, .pdf, .docx) — recommends a team & reviews it'}
                  style={{ background: 'none', border: 'none', color: rtUploading ? '#b07ef8' : '#5a607a', cursor: rtUploading || loading || canFollowUp ? 'not-allowed' : 'pointer', padding: 2, display: 'flex', flexShrink: 0, opacity: canFollowUp ? 0.4 : 1 }}
                >
                  {rtUploading ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Paperclip style={{ width: 16, height: 16 }} />}
                </button>
                {/* Multi-line textarea so long prompts (uploaded spec titles,
                    spec follow-ups) wrap to 2 lines and scroll internally past
                    3 — instead of horizontally scrolling away from the user. */}
                <textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
                  placeholder={
                    limitReached ? 'Free limit reached — connect your OpenAI key to continue'
                    : canFollowUp ? `Follow up… (${10 - turns.length} turn${10 - turns.length === 1 ? '' : 's'} left)`
                    : 'Ask the round table anything…'
                  }
                  disabled={loading || limitReached}
                  rows={2}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: limitReached ? '#3a3f52' : '#e8eaf0', fontSize: 13, fontFamily: 'Syne, sans-serif',
                    resize: 'none', lineHeight: 1.4, maxHeight: '4.2em', overflowY: 'auto',
                  }}
                />
                <button onClick={() => run()}
                  disabled={loading || !prompt.trim() || limitReached}
                  style={{
                    background: loading || !prompt.trim() || limitReached ? '#1e2130' : '#5b8dee',
                    border: 'none', borderRadius: 8, width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: loading || !prompt.trim() || limitReached ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <Send style={{ width: 14, height: 14, color: '#fff' }} />
                </button>
              </div>
            </div>

            {/* Response feed — `min-h-0` is the missing piece: flex items
                default to `min-height: auto`, which means even with flex-1
                this element grows to fit its content (CreativePipeline can
                run tall), defeating overflow-y-auto. Setting min-h-0 lets
                it shrink and the inner scrollbar engage. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
              {/* Spec-upload progress — replaces everything else in the feed
                  while we read the file + match specialists. Two-step stepper
                  so the user can see WHAT is happening, not just THAT a wait
                  is in progress. */}
              {rtUploading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col items-center justify-center text-center"
                  style={{ minHeight: 240, padding: '40px 20px' }}
                >
                  <div style={{ position: 'relative', width: 56, height: 56, marginBottom: 18 }}>
                    <Loader2 style={{ width: 56, height: 56, color: '#9b6cf0' }} className="animate-spin" />
                    <Paperclip style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 20, height: 20, color: '#9b6cf0',
                    }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#c8ccd8', marginBottom: 6 }}>
                    {rtUploadStage === 'reading' ? 'Reading your spec…' : 'Finding the right specialists…'}
                  </div>
                  {rtUploadFilename && (
                    <div style={{ fontSize: 11, color: '#5a607a', fontFamily: 'monospace', marginBottom: 18 }}>
                      {rtUploadFilename}
                    </div>
                  )}
                  {/* Two-step indicator. Done step shows tick, current shows
                      spinner, future shows muted dot. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#6a6f82' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {rtUploadStage === 'reading'
                        ? <Loader2 style={{ width: 12, height: 12, color: '#9b6cf0' }} className="animate-spin" />
                        : <CheckCircle2 style={{ width: 12, height: 12, color: '#5cc28a' }} />}
                      <span style={{ color: rtUploadStage === 'reading' ? '#c8ccd8' : '#6a6f82' }}>Extract text</span>
                    </div>
                    <div style={{ width: 18, height: 1, background: '#1e2130' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {rtUploadStage === 'recommending'
                        ? <Loader2 style={{ width: 12, height: 12, color: '#9b6cf0' }} className="animate-spin" />
                        : <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#1e2130' }} />}
                      <span style={{ color: rtUploadStage === 'recommending' ? '#c8ccd8' : '#6a6f82' }}>Match specialists</span>
                    </div>
                  </div>
                </motion.div>
              )}
              {/* Round-table run loader — visible the whole time the model
                  is generating responses. The left-rail viz already cycles
                  agents and the top bar has a "thinking" pill, but the main
                  canvas was empty during runs; users couldn't tell the
                  click had registered. A centered card here covers that. */}
              {loading && !rtUploading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col items-center justify-center text-center"
                  style={{ minHeight: 180, padding: '24px 20px' }}
                >
                  <div style={{ position: 'relative', width: 48, height: 48, marginBottom: 14 }}>
                    <Loader2 style={{ width: 48, height: 48, color: '#5b8dee' }} className="animate-spin" />
                    <Sparkles style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 18, height: 18, color: '#5b8dee',
                    }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#c8ccd8', marginBottom: 4 }}>
                    The round table is thinking…
                  </div>
                  <div style={{ fontSize: 11, color: '#5a607a' }}>
                    {(activeChat?.team || draftTeam || []).length} specialists are weighing in. ~10–30 seconds.
                  </div>
                </motion.div>
              )}

              {/* Prior turns transcript — collapsed view of older turns in
                  this chat. The focus carousel below always shows the latest
                  turn; prior turns get a compact "T1: query — N responses"
                  summary so the user can see how the conversation evolved
                  without us re-rendering every old response in full. */}
              {priorTurns.length > 0 && !loading && (
                <div className="mb-5 pb-4" style={{ borderBottom: '1px solid #1e2130' }}>
                  <div style={{ fontSize: 10, color: '#3a3f52', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>
                    Earlier in this chat
                  </div>
                  <div className="space-y-2">
                    {priorTurns.map((t, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#6a6f82', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'monospace', color: '#4a4f60', fontSize: 10, flexShrink: 0 }}>T{i + 1}</span>
                        <span style={{ flex: 1 }}>
                          {t.query}
                          <span style={{ color: '#3a3f52', marginLeft: 6 }}>
                            · {(t.responses || []).length} agent{(t.responses || []).length === 1 ? '' : 's'} replied
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <AnimatePresence mode="wait">
                {limitReached && !activeChat ? (
                  <BYOKScreen key="byok" reason={limitReason} />
                ) : !activeChat && !loading ? (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center" style={{ minHeight: 200 }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                    <div style={{ fontSize: 13, color: '#2e3244', fontFamily: 'monospace', lineHeight: 1.8 }}>
                      Type a prompt above to start a new round table
                      {chats.length > 0 && <><br />or pick a past chat from the right</>}
                    </div>
                  </motion.div>
                ) : loading && !focusedResponse ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center" style={{ minHeight: 200 }}>
                    {activeIdx >= 0 && agents[activeIdx] && (
                      <div className="flex flex-col items-center gap-3">
                        <motion.img src={avatarUrl(agents[activeIdx].agent_name)}
                          alt={agents[activeIdx].agent_name}
                          style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${PALETTE[activeIdx]}44` }}
                          animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                        <div style={{ fontSize: 11, color: PALETTE[activeIdx], fontFamily: 'monospace', fontWeight: 700 }}>
                          {agents[activeIdx].agent_name}
                        </div>
                        <div className="flex items-center gap-2">
                          <TypingDots color={PALETTE[activeIdx]} />
                          <motion.span style={{ fontSize: 11, fontFamily: 'monospace', color: PALETTE[activeIdx] }}
                            animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}>
                            thinking…
                          </motion.span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : focusedResponse ? (
                  <motion.div key={`${activeChat?.id}-${focusedIdx}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <img src={avatarUrl(focusedAgent?.agent_name || focusedResponse.name)}
                        alt={focusedResponse.name}
                        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${focusedColor}44` }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: focusedColor, letterSpacing: '0.02em' }}>
                          {focusedResponse.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#4a4f60', fontFamily: 'monospace' }}>
                          {focusedAgent?.category || ''}{focusedAgent?.name ? ` · ${focusedAgent.name}` : ''}
                        </div>
                      </div>
                      {/* Speak button — TTS the response via /api/tts. Same audio
                          element gets reused across agents; clicking another
                          agent's button stops the previous one. */}
                      {(() => {
                        const tag = `rt:${focusedResponse.name}:${focusedIdx}`;
                        const isThis = ttsTag === tag;
                        const isLoading = isThis && ttsState === 'loading';
                        const isPlaying = isThis && ttsState === 'playing';
                        return (
                          <button
                            onClick={() => toggleSpeak(tag, focusedResponse.text)}
                            disabled={isLoading}
                            title={isPlaying ? 'Pause' : isLoading ? 'Generating audio…' : `Listen to ${focusedResponse.name}`}
                            style={{
                              background: isPlaying ? `${focusedColor}22` : 'transparent',
                              border: `1px solid ${isPlaying ? focusedColor : '#1e2130'}`,
                              borderRadius: 8,
                              padding: '6px 10px',
                              color: isPlaying ? focusedColor : '#8a91a8',
                              cursor: isLoading ? 'wait' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              fontFamily: 'monospace',
                            }}
                          >
                            {isLoading ? (
                              <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                            ) : isPlaying ? (
                              <Pause style={{ width: 13, height: 13 }} />
                            ) : (
                              <Volume2 style={{ width: 13, height: 13 }} />
                            )}
                            {isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Listen'}
                          </button>
                        );
                      })()}
                    </div>
                    {/* Hidden audio element shared by every speak button on this page. */}
                    <audio ref={ttsAudioRef} preload="none" style={{ display: 'none' }} />
                    {/* Inline keyframe for the loader spinner — Tailwind's animate-spin
                        relies on a class that may not be active on this page; provide
                        a fallback styled keyframe via CSS. */}
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .animate-spin { animation: spin 1s linear infinite; }`}</style>
                    <div style={{ fontSize: 14, color: '#c8ccd8', lineHeight: 1.7 }}>
                      <ReactMarkdown components={AGENT_MD_COMPONENTS}>
                        {focusedResponse.text}
                      </ReactMarkdown>
                    </div>

                    {/* 1:1 follow-up thread with this specific agent. The
                        toggle button opens an inline chat below the response;
                        the thread is persisted on the chat row so it survives
                        navigation and reload. */}
                    {(() => {
                      const agentName = focusedResponse.name;
                      const thread = (activeChat?.agent_threads?.[agentName] || []);
                      const userTurnsUsed = thread.filter(t => t.role === 'user').length;
                      const capped = userTurnsUsed >= AGENT_THREAD_TURN_CAP;
                      const open   = threadOpenFor === agentName;

                      if (!open) {
                        return (
                          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                              onClick={() => {
                                setThreadOpenFor(agentName);
                                setThreadInput('');
                                setThreadError('');
                              }}
                              style={{
                                background: `${focusedColor}12`,
                                border: `1px solid ${focusedColor}40`,
                                color: focusedColor,
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <MessageSquare style={{ width: 12, height: 12 }} />
                              {thread.length > 0
                                ? `Continue 1:1 with ${agentName} (${userTurnsUsed}/${AGENT_THREAD_TURN_CAP})`
                                : `Ask ${agentName} a follow-up`}
                            </button>
                            {thread.length > 0 && (
                              <span style={{ fontSize: 11, color: '#5a607a' }}>
                                {Math.ceil(thread.length / 2)} message{Math.ceil(thread.length / 2) === 1 ? '' : 's'} saved
                              </span>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div style={{
                          marginTop: 18,
                          background: '#0a0c12',
                          border: `1px solid ${focusedColor}33`,
                          borderRadius: 10,
                          padding: 14,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <MessageSquare style={{ width: 13, height: 13, color: focusedColor }} />
                              <span style={{ fontSize: 11, fontFamily: 'monospace', color: focusedColor, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                1:1 with {agentName}
                              </span>
                              <span style={{ fontSize: 10, color: '#5a607a' }}>
                                {userTurnsUsed}/{AGENT_THREAD_TURN_CAP} turns
                              </span>
                            </div>
                            <button
                              onClick={() => { setThreadOpenFor(null); setThreadError(''); }}
                              title="Hide thread"
                              style={{ background: 'none', border: 'none', color: '#5a607a', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
                            >
                              <X style={{ width: 14, height: 14 }} />
                            </button>
                          </div>

                          {thread.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                              {thread.map((t, i) => (
                                <div key={i} style={{
                                  alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                                  maxWidth: '85%',
                                  background: t.role === 'user' ? '#12141c' : `${focusedColor}10`,
                                  border: `1px solid ${t.role === 'user' ? '#1e2130' : `${focusedColor}33`}`,
                                  borderRadius: 8,
                                  padding: '8px 12px',
                                  fontSize: 12.5,
                                  color: '#c8ccd8',
                                  lineHeight: 1.6,
                                  whiteSpace: t.role === 'user' ? 'pre-wrap' : 'normal',
                                }}>
                                  <div style={{ fontSize: 9, color: t.role === 'user' ? '#5a607a' : focusedColor, fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                    {t.role === 'user' ? 'You' : agentName}
                                  </div>
                                  {t.role === 'user' ? (
                                    t.text
                                  ) : (
                                    <ReactMarkdown components={AGENT_MD_COMPONENTS}>
                                      {t.text}
                                    </ReactMarkdown>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#5a607a', marginBottom: 12, fontStyle: 'italic' }}>
                              Ask {agentName} something they didn't cover in the round table.
                            </div>
                          )}

                          {capped ? (
                            <div style={{
                              fontSize: 11,
                              color: '#d4b27d',
                              background: '#1a1408',
                              border: '1px solid #4d3811',
                              borderRadius: 6,
                              padding: '6px 10px',
                            }}>
                              Thread is full ({AGENT_THREAD_TURN_CAP} turns). Start a fresh round table to keep branching.
                            </div>
                          ) : (
                            <>
                              <div style={{
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: 8,
                                background: '#12141c',
                                border: `1px solid ${threadSending ? `${focusedColor}55` : '#1e2130'}`,
                                borderRadius: 8,
                                padding: '8px 10px',
                              }}>
                                <textarea
                                  value={threadInput}
                                  onChange={e => setThreadInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      if (!threadSending && threadInput.trim()) {
                                        sendAgentThreadMessage(agentName, threadInput);
                                      }
                                    }
                                  }}
                                  placeholder={`Ask ${agentName} anything…`}
                                  rows={2}
                                  disabled={threadSending}
                                  style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#e8eaf0',
                                    fontSize: 12.5,
                                    fontFamily: 'inherit',
                                    resize: 'none',
                                    lineHeight: 1.4,
                                    maxHeight: '4.2em',
                                    overflowY: 'auto',
                                  }}
                                />
                                <button
                                  onClick={() => sendAgentThreadMessage(agentName, threadInput)}
                                  disabled={threadSending || !threadInput.trim()}
                                  style={{
                                    background: threadSending || !threadInput.trim() ? '#1e2130' : focusedColor,
                                    border: 'none',
                                    borderRadius: 6,
                                    width: 30,
                                    height: 30,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: threadSending || !threadInput.trim() ? 'not-allowed' : 'pointer',
                                    flexShrink: 0,
                                  }}
                                >
                                  {threadSending ? <Loader2 style={{ width: 12, height: 12, color: '#fff' }} className="animate-spin" /> : <Send style={{ width: 12, height: 12, color: '#fff' }} />}
                                </button>
                              </div>
                              {threadError && (
                                <div style={{ fontSize: 11, color: '#f06b6b', marginTop: 6 }}>{threadError}</div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Spec Engineer (Aisha) is now the first avatar in the
                  CreativePipeline below — generate/edit/send-to-Maya live
                  inside her section instead of in a standalone panel. */}
              {false && (() => {
                if (!activeChat) return null;
                const allResponsesIn = (activeChat.responses?.length || 0) >= (activeChat.team?.length || 0) && (activeChat.responses?.length || 0) > 0;
                if (!allResponsesIn || loading) return null;
                const accent = '#9b6cf0';
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    style={{ marginTop: 16, padding: 20, background: '#0e1018', border: '1px solid #1e2130', borderRadius: 12 }}
                  >
                    {spec.status === 'idle' && (
                      <>
                        <div style={{ fontSize: 10, color: accent, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Round table done · Spec Engineer can synthesize this
                        </div>
                        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
                          Turn the conversation into a one-page spec — Problem, Goals, Requirements, Proposed approach, Rollout. You can edit it before sending to Maya.
                        </div>
                        <button onClick={generateSpec} style={{
                          background: accent, color: '#fff', border: 'none', borderRadius: 8,
                          padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}>
                          <Sparkles style={{ width: 14, height: 14 }} /> Generate Spec
                        </button>
                      </>
                    )}
                    {spec.status === 'running' && (
                      <div className="flex items-center gap-3">
                        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
                          <Sparkles style={{ width: 22, height: 22, color: accent }} />
                        </motion.div>
                        <div>
                          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Drafting the spec…</div>
                          <div style={{ fontSize: 11, color: '#5a607a', marginTop: 2 }}>Synthesizing every agent's contribution into one structured doc. ~10s.</div>
                        </div>
                      </div>
                    )}
                    {spec.status === 'done' && spec.result && (
                      <>
                        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                          <CheckCircle2 style={{ width: 16, height: 16, color: '#5cc28a' }} />
                          <span style={{ fontSize: 11, color: '#5cc28a', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Spec ready</span>
                          {spec.result.authors?.length > 0 && (
                            <span style={{ fontSize: 10, color: '#5a607a', fontFamily: 'monospace', marginLeft: 4 }}>
                              · authors: {spec.result.authors.join(', ')}
                            </span>
                          )}
                          {spec.dirty && (
                            <span style={{ fontSize: 10, color: '#f0a04b', fontFamily: 'monospace', marginLeft: 'auto' }}>● unsaved edits</span>
                          )}
                        </div>
                        <textarea
                          value={spec.editing}
                          onChange={e => setSpec(s => ({ ...s, editing: e.target.value, dirty: e.target.value !== s.result?.text }))}
                          spellCheck={false}
                          style={{
                            width: '100%', minHeight: 360,
                            background: '#0a0c12', color: '#c8ccd8',
                            border: '1px solid #1e2130', borderRadius: 8,
                            padding: 12, fontSize: 12, lineHeight: 1.55,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            resize: 'vertical', outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                          <button
                            onClick={saveSpecEdits}
                            disabled={!spec.dirty}
                            style={{
                              background: spec.dirty ? '#5cc28a' : '#1e2130',
                              color: spec.dirty ? '#0a0c12' : '#5a607a',
                              border: 'none', borderRadius: 8, padding: '8px 14px',
                              fontSize: 12, fontWeight: 700, cursor: spec.dirty ? 'pointer' : 'not-allowed',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            <CheckCircle2 style={{ width: 12, height: 12 }} /> Save edits
                          </button>
                          <button
                            onClick={sendSpecToMaya}
                            disabled={mockup.status === 'running'}
                            style={{
                              background: '#b07ef8', color: '#fff',
                              border: 'none', borderRadius: 8, padding: '8px 14px',
                              fontSize: 12, fontWeight: 700,
                              cursor: mockup.status === 'running' ? 'not-allowed' : 'pointer',
                              opacity: mockup.status === 'running' ? 0.5 : 1,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            <Palette style={{ width: 12, height: 12 }} /> Send to Maya
                          </button>
                          <button
                            onClick={generateSpec}
                            style={{
                              background: 'none', color: '#5a607a',
                              border: '1px solid #1e2130', borderRadius: 8, padding: '8px 14px',
                              fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            Regenerate
                          </button>
                        </div>
                      </>
                    )}
                    {spec.status === 'error' && (
                      <div className="flex items-start gap-3">
                        <AlertCircle style={{ width: 18, height: 18, color: '#f06b6b', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#f06b6b', fontWeight: 600 }}>Spec generation failed</div>
                          <div style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', marginTop: 4 }}>{spec.error}</div>
                          <button onClick={generateSpec} style={{
                            marginTop: 10, color: accent, background: 'none',
                            border: `1px solid ${accent}44`, borderRadius: 6,
                            padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          }}>Try again</button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })()}

              {/* Aisha → Maya → Ananya → Hostinger pipeline. The four are
                  always shown as system stages once the round table is in,
                  regardless of which specialists the user picked. Earlier
                  code gated Maya/Ananya/Hostinger on team membership, which
                  broke the flow for teams that didn't happen to include
                  them — "Send to Maya" would disappear when there's no
                  Maya in the round table. The triggers route to /api/mockup
                  etc. by skill id, which works whether or not the agent was
                  ever a round-table contributor. */}
              {(() => {
                if (!activeChat) return null;
                const allResponsesIn = (activeChat.responses?.length || 0) >= (activeChat.team?.length || 0) && (activeChat.responses?.length || 0) > 0;
                if (!allResponsesIn || loading) return null;
                const chatIsMobile = isMobileQuery(activeChat?.query);
                const members = [
                  { key: 'aisha',     name: 'Aisha',     role: 'Spec Engineer',                        accent: '#9b6cf0', theme: 'warm' },
                  chatIsMobile
                    ? { key: 'priya',  name: 'Priya',  role: 'Mobile App Designer',                    accent: '#b07ef8', theme: 'warm' }
                    : { key: 'maya',   name: 'Maya',   role: 'Landing Page Designer',                  accent: '#b07ef8', theme: 'warm' },
                  { key: 'tara',      name: 'Tara',      role: 'Social Campaign Designer',             accent: '#e070c2', theme: 'warm', parallelWith: chatIsMobile ? 'priya' : 'maya' },
                  { key: 'kavya',     name: 'Kavya',     role: 'Email Campaign Designer',              accent: '#f0a04b', theme: 'warm', parallelWith: 'tara' },
                  chatIsMobile
                    ? { key: 'meera', name: 'Meera', role: 'Mobile App Engineer',                      accent: '#5b8dee', theme: 'warm' }
                    : { key: 'ananya', name: 'Ananya', role: 'Dev Engineer',                           accent: '#5b8dee', theme: 'warm' },
                  { key: 'hostinger', name: 'Hostinger', role: 'Deploy Engineer',                      accent: '#9b6cf0', theme: 'cool' },
                ];
                return (
                  <CreativePipeline
                    members={members}
                    phase={activeChat?.phase || initPhase || null}
                    spec={spec} mockup={mockup} build={build} deploy={deploy} hostinger={hostinger} social={social} email={email}
                    generateSpec={generateSpec} setSpec={setSpec} saveSpecEdits={saveSpecEdits} sendSpecToMaya={sendSpecToMaya}
                    uploadedSpec={uploadedSpec} sendUploadedToMaya={sendUploadedToMaya}
                    tech={tech} conveneTechTeam={conveneTechTeam}
                    triggerMockup={triggerMockup} triggerBuild={triggerBuild} triggerDeploy={triggerDeploy} triggerSocial={triggerSocial} triggerEmail={triggerEmail}
                    recoverMockup={() => recoverPending({ setState: setMockup, toolKey: 'mockup' })}
                    recoverBuild={() =>  recoverPending({ setState: setBuild,  toolKey: 'build'  })}
                    recoverSocial={() => recoverPending({ setState: setSocial, toolKey: 'social' })}
                    recoverEmail={() =>  recoverPending({ setState: setEmail,  toolKey: 'email'  })}
                    saveHostingerToken={saveHostingerToken}
                    showHostingerLogin={showHostingerLogin} setShowHostingerLogin={setShowHostingerLogin}
                    hostingerToken={hostingerToken} setHostingerToken={setHostingerToken} setHostinger={setHostinger}
                    describeProgress={describeProgress} buildWillInheritDesign={buildWillInheritDesign}
                  />
                );
              })()}

              {/* Kavya's standalone panel was removed — she's now an avatar
                  inside CreativePipeline above (parallel to Maya and Tara),
                  so her section renders inline when you click her avatar. */}

              {/* Tara's standalone panel was removed — she's now an avatar
                  inside CreativePipeline above (parallel to Maya), so her
                  section renders inline when you click her avatar there. */}
            </div>

            {/* Dot nav at bottom (within active chat) */}
            {responses.length > 1 && (
              <div style={{ borderTop: '1px solid #1e2130', background: '#0a0c12' }} className="px-5 py-3 flex items-center justify-center gap-2 flex-shrink-0">
                {responses.map((r, i) => {
                  const color = PALETTE[r.agentIdx] || PALETTE[0];
                  return (
                    <button key={i} onClick={() => setFocusedIdx(i)} style={{
                      width: focusedIdx === i ? 20 : 7, height: 7, borderRadius: 4,
                      background: focusedIdx === i ? color : '#1e2130',
                      border: 'none', cursor: 'pointer', transition: 'all 0.25s', padding: 0,
                    }} />
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: History sidebar (hidden on mobile — chat list drawer
                  could go here later; for now the screen is too narrow to fit
                  three columns) ── */}
          <div style={{ width: 280, minWidth: 280, background: '#0a0c12', borderLeft: '1px solid #1e2130' }}
            className="hidden md:flex flex-col flex-shrink-0 min-h-0">

            <div style={{ borderBottom: '1px solid #1e2130' }} className="px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-bold tracking-widest uppercase text-gray-400">History</span>
                <span style={{ fontSize: 10, color: '#3a3f52', fontFamily: 'monospace' }}>{chats.length}</span>
              </div>
              <button onClick={startNewChat}
                title="New chat"
                style={{ background: '#12141c', border: '1px solid #1e2130', borderRadius: 8, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Plus className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {chats.length === 0 ? (
                <div style={{ fontSize: 11, color: '#2e3244', fontFamily: 'monospace', padding: '24px 12px', textAlign: 'center', lineHeight: 1.7 }}>
                  No past chats yet.<br />
                  Submit a prompt to start.
                </div>
              ) : (
                chats.map(chat => {
                  const isActive = activeChat?.id === chat.id;
                  return (
                    <button key={chat.id} onClick={() => selectChat(chat)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: isActive ? '#16192a' : 'transparent',
                        border: `1px solid ${isActive ? '#2a2d3e' : 'transparent'}`,
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: 4,
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                      className="hover:bg-[#12141c] group"
                    >
                      <div className="flex items-start gap-2">
                        <div style={{ fontSize: 12, color: isActive ? '#c8ccd8' : '#8a8f9e', fontWeight: 600, lineHeight: 1.4, flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {chat.query}
                        </div>
                        <div onClick={(e) => deleteChat(chat.id, e)}
                          role="button"
                          aria-label="delete chat"
                          className="opacity-0 group-hover:opacity-100 cursor-pointer"
                          style={{ flexShrink: 0, padding: 2 }}>
                          <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 9, color: '#3a3f52', fontFamily: 'monospace' }}>
                          {formatRelativeTime(chat.created)}
                        </span>
                        <span style={{ fontSize: 9, color: '#3a3f52', fontFamily: 'monospace' }}>·</span>
                        <span style={{ fontSize: 9, color: '#3a3f52', fontFamily: 'monospace' }}>
                          {(chat.responses || []).length} agents
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
