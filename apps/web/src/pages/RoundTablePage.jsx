import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Send, Key, Plus, Trash2, MessageSquare, Hammer, Download, CheckCircle2, AlertCircle, Eye, Palette, Lock, Sparkles, Mail, Megaphone } from 'lucide-react';

// Tool-using agents — when their skill is in the active chat's team, the
// matching CTA panel renders.
//   Ananya — full-stack web build
//   Maya   — 5 device-framed HTML mockups
//   Kavya  — HTML email campaign + Gmail-frame preview
//   Tara   — platform-native social posts + per-platform chrome
const ANANYA_SKILL_ID = '0v9syxxawznp95v';
const MAYA_SKILL_ID   = 'uepji0o2teuf29b';
const KAVYA_SKILL_ID  = 'ip1bvcutzgsy28p';
const TARA_SKILL_ID   = 'eu6cweasi3d4xt8';
import { avatarUrl } from '@/lib/avatar';
import pb from '@/lib/pocketbaseClient';

// 10-slot palette so teams of 6 (hex viz) and 7–10 (grid viz) both have
// distinct colors per slot. Slots 0–5 are the originals so existing screens
// don't shift colors when team size stays at 6.
const PALETTE = [
  '#5b8dee', '#b07ef8', '#f0a04b', '#4ecba8', '#f06b6b', '#e070c2',
  '#5cc28a', '#f7c948', '#38b6ff', '#ff8a3d',
];
const TEAM_SIZE_MAX = 10;
const FREE_LIMIT = 10;

// Oval boardroom layout for the round-table viz. Column count scales with
// team size so chairs always look packed against the table (no empty seats
// shown on this page — that's the homepage picker's job):
//   size 6  → 3 columns × 2 rows
//   size 7  → 4 cols (top 4 + bottom 3)
//   size 8  → 4 cols (top 4 + bottom 4)
//   size 9  → 5 cols (top 5 + bottom 4)
//   size 10 → 5 cols (top 5 + bottom 5)
// Seats alternate top→bottom as team index grows so the table fills evenly.
const OVAL_TABLE = { x: 18, y: 100, width: 224, height: 60, rx: 30 };
const OVAL_CENTER = { x: 130, y: 130 };
function getOvalPositions(count) {
    const numCols = Math.ceil(count / 2);
    const positions = [];
    for (let i = 0; i < count; i++) {
        const col = Math.floor(i / 2);
        const row = i % 2; // 0 = top, 1 = bottom
        const x = OVAL_TABLE.x + ((col + 0.5) * OVAL_TABLE.width) / numCols;
        const y = row === 0 ? 36 : 224;
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
  color, Icon, label,
  idleHeadline, idleBlurb, idleCta,
  runningHeadline, runningBlurb,
  doneLabel,
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
            <div style={{ fontSize: 11, color: '#5a607a', marginTop: 2 }}>{runningBlurb}</div>
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

export default function RoundTablePage() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const initTeam  = location.state?.team || [];
  const initQuery = location.state?.query || '';

  const [prompt, setPrompt]         = useState('');
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [loading, setLoading]       = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [remaining, setRemaining]   = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const [limitReason, setLimitReason]   = useState('limit_reached');
  const [hasUserKey, setHasUserKey]     = useState(false);

  const [chats, setChats]           = useState([]);     // [{ id, query, team, responses, created }]
  const [activeChat, setActiveChat] = useState(null);   // current chat object
  const [draftTeam, setDraftTeam]   = useState(initTeam.slice(0, TEAM_SIZE_MAX));

  // Tool-action states — scoped to the active chat, reset on chat change.
  // `build` = Ananya app, `mockup` = Maya screens, `email` = Kavya campaign,
  // `social` = Tara social posts.
  const [build, setBuild]   = useState({ status: 'idle', result: null, error: null });
  const [mockup, setMockup] = useState({ status: 'idle', result: null, error: null });
  const [email,  setEmail]  = useState({ status: 'idle', result: null, error: null });
  const [social, setSocial] = useState({ status: 'idle', result: null, error: null });
  useEffect(() => {
    setBuild({ status: 'idle', result: null, error: null });
    setMockup({ status: 'idle', result: null, error: null });
    setEmail({ status: 'idle', result: null, error: null });
    setSocial({ status: 'idle', result: null, error: null });
  }, [activeChat?.id]);

  async function runToolAction({ endpoint, excludeAgentId, setState, extraBody = {} }) {
    if (!activeChat) return;
    setState({ status: 'running', result: null, error: null });
    try {
      const skill = activeChat.team.find(s => s.id === excludeAgentId);
      const skillAgentName = skill?.agent_name;
      const context = (activeChat.responses || [])
        .filter(r => r.name && r.text && r.name !== skillAgentName)
        .map(r => ({ agent_name: r.name, perspective: r.text }));
      const token = pb.authStore.token;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: activeChat.query, context, ...extraBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setState({ status: 'done', result: data, error: null });
    } catch (err) {
      setState({ status: 'error', result: null, error: err.message });
    }
  }

  // If Maya already produced mockups in this chat, Ananya consumes them as a
  // design brief — palette, typography, layout structure carry over.
  const triggerBuild = () => runToolAction({
    endpoint: '/api/build',
    excludeAgentId: ANANYA_SKILL_ID,
    setState: setBuild,
    extraBody: mockup.status === 'done' && mockup.result?.session_id
      ? { design_session_id: mockup.result.session_id }
      : {},
  });
  const triggerMockup = () => runToolAction({
    endpoint: '/api/mockup',
    excludeAgentId: MAYA_SKILL_ID,
    setState: setMockup,
  });
  // Kavya + Tara both run via the generic /api/creative endpoint — the agent
  // is picked by agent_id (PocketBase skill id). See routes/creative.js.
  const triggerEmail = () => runToolAction({
    endpoint: '/api/creative',
    excludeAgentId: KAVYA_SKILL_ID,
    setState: setEmail,
    extraBody: { agent_id: KAVYA_SKILL_ID },
  });
  const triggerSocial = () => runToolAction({
    endpoint: '/api/creative',
    excludeAgentId: TARA_SKILL_ID,
    setState: setSocial,
    extraBody: { agent_id: TARA_SKILL_ID },
  });

  // Convenience flag for the UI to indicate Ananya will inherit Maya's design.
  const buildWillInheritDesign = mockup.status === 'done' && !!mockup.result?.session_id;

  const inputRef = useRef(null);

  // Agents shown in the round table viz: from active chat if one is loaded, else from the draft team
  const visTeam = activeChat?.team || draftTeam;
  const agents  = visTeam.slice(0, TEAM_SIZE_MAX).map((skill, i) => ({ ...skill, color: PALETTE[i] || PALETTE[i % PALETTE.length], idx: i }));
  const ovalPositions = getOvalPositions(agents.length);

  // Load history + usage on mount
  useEffect(() => {
    const token = pb.authStore.token;
    if (!token) return;

    fetch('/api/roundtable/chats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.chats) setChats(data.chats); })
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
  }, []);

  useEffect(() => {
    if (activeChat?.responses?.length > 0) setFocusedIdx(activeChat.responses.length - 1);
  }, [activeChat?.id]);

  async function run(q) {
    const query = (q || prompt).trim();
    if (!query || loading || draftTeam.length === 0 || limitReached) return;

    setPrompt('');
    setActiveChat(null);
    setLoading(true);
    setActiveIdx(-1);
    setFocusedIdx(0);

    // animate cycling agents during wait
    let cur = 0;
    const teamForRun = draftTeam.slice(0, TEAM_SIZE_MAX);
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
        body: JSON.stringify({ query, team: teamForRun }),
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

      const newChat = {
        id: data.chatId || `local-${Date.now()}`,
        query,
        team: teamForRun,
        responses: [],
        created: new Date().toISOString(),
      };
      setActiveChat(newChat);

      // Reveal responses one at a time
      for (let i = 0; i < responsesWithIdx.length; i++) {
        setActiveIdx(responsesWithIdx[i].agentIdx);
        await new Promise(resolve => setTimeout(resolve, 300));
        setActiveChat(prev => prev ? { ...prev, responses: [...prev.responses, responsesWithIdx[i]] } : prev);
      }

      // Prepend to history
      setChats(prev => [{ ...newChat, responses: responsesWithIdx }, ...prev]);
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
    setActiveChat(chat);
    setFocusedIdx(chat.responses?.length ? chat.responses.length - 1 : 0);
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

  const responses       = activeChat?.responses || [];
  const focusedResponse = responses[focusedIdx];
  const focusedAgent    = focusedResponse ? agents[focusedResponse.agentIdx] || agents[0] : null;
  const focusedColor    = focusedResponse ? PALETTE[focusedResponse.agentIdx] || PALETTE[0] : null;

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

      <div style={{ background: '#080a0e', height: '100vh', color: '#e8eaf0' }} className="flex flex-col">

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

        {/* 3-column layout */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Round Table Viz (hidden on mobile — compact strip lives in
                  the middle column instead) ── */}
          <div style={{ width: 280, minWidth: 280, background: '#0a0c12', borderRight: '1px solid #1e2130' }}
            className="hidden md:flex flex-col items-center py-6 flex-shrink-0 overflow-y-auto">

            {/* Oval boardroom layout — column count adapts to team size so the
                table always looks packed (no empty seats shown here). Seats
                alternate top→bottom in fill order. */}
            <div className="relative" style={{ width: 260, height: 280 }}>
              <svg width="260" height="280" viewBox="0 0 260 280" className="absolute top-0 left-0">
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
                    <div style={{ textAlign: 'center', maxWidth: 56 }}>
                      <div style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.1,
                        color: activeIdx === i ? a.color : focusedResponse?.agentIdx === i ? `${a.color}cc` : '#3a3f52',
                        transition: 'color 0.3s',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
                      style={{ fontSize: 9, fontFamily: 'monospace', color: PALETTE[activeIdx], letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
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

            <div className="w-full px-4 space-y-1 mt-2">
              {agents.map((a, i) => {
                const hasResponse = responses.some(r => r.agentIdx === i);
                const isActive    = activeIdx === i;
                const isFocused   = focusedResponse?.agentIdx === i;
                return (
                  <button key={i} onClick={() => {
                    const rIdx = responses.findIndex(r => r.agentIdx === i);
                    if (rIdx >= 0) setFocusedIdx(rIdx);
                  }} disabled={!hasResponse}
                    style={{
                      width: '100%', background: isFocused ? `${a.color}12` : 'transparent',
                      border: `1px solid ${isFocused ? `${a.color}30` : 'transparent'}`,
                      borderRadius: 8, padding: '6px 10px',
                      cursor: hasResponse ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: isActive ? a.color : hasResponse ? `${a.color}80` : '#1e2130',
                      transition: 'background 0.3s',
                    }} />
                    <img src={avatarUrl(a.agent_name)} alt={a.agent_name}
                      style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.03em', color: isFocused ? a.color : '#4a4f60' }}>
                        {a.agent_name}
                      </div>
                      <div style={{ fontSize: 9, color: '#2e3244', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.category}
                      </div>
                    </div>
                    {isActive && (
                      <motion.span style={{ fontSize: 8, fontFamily: 'monospace', color: a.color }}
                        animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}>
                        thinking…
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Middle: Active Chat (input at TOP) ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

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
              {/* Active chat query header */}
              {activeChat && (
                <div className="mb-3 flex items-start gap-2">
                  <span style={{ fontSize: 10, color: '#4a4f60', fontFamily: 'monospace', flexShrink: 0, paddingTop: 2 }}>YOU:</span>
                  <span style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600, flex: 1 }}>{activeChat.query}</span>
                </div>
              )}
              <div style={{ background: '#12141c', border: `1px solid ${limitReached ? '#f06b6b33' : '#1e2130'}`, borderRadius: 12 }}
                className="flex items-center gap-2 px-3 py-2">
                <input
                  ref={inputRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
                  placeholder={limitReached ? 'Free limit reached — connect your OpenAI key to continue' : 'Ask the round table anything…'}
                  disabled={loading || limitReached}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: limitReached ? '#3a3f52' : '#e8eaf0', fontSize: 13, fontFamily: 'Syne, sans-serif',
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

            {/* Response feed */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
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
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: focusedColor, letterSpacing: '0.02em' }}>
                          {focusedResponse.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#4a4f60', fontFamily: 'monospace' }}>
                          {focusedAgent?.category || ''}{focusedAgent?.name ? ` · ${focusedAgent.name}` : ''}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: '#c8ccd8', lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {focusedResponse.text}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Design Mockups — only when Maya is in the team and all responses are in */}
              {(() => {
                if (!activeChat) return null;
                const teamHasMaya = activeChat.team?.some(s => s.id === MAYA_SKILL_ID);
                const allResponsesIn = (activeChat.responses?.length || 0) >= (activeChat.team?.length || 0) && (activeChat.responses?.length || 0) > 0;
                if (!teamHasMaya || !allResponsesIn || loading) return null;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                    style={{ marginTop: 16, padding: 20, background: '#0e1018', border: '1px solid #1e2130', borderRadius: 12 }}
                  >
                    {mockup.status === 'idle' && (
                      <>
                        <div style={{ fontSize: 10, color: '#b07ef8', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Round table done · Maya can design this
                        </div>
                        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
                          Generate 5 device-framed HTML mockups so you can see screens before anything ships.
                        </div>
                        <button onClick={triggerMockup} style={{
                          background: '#b07ef8', color: '#fff', border: 'none', borderRadius: 8,
                          padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}>
                          <Palette style={{ width: 14, height: 14 }} /> Design Mockups
                        </button>
                      </>
                    )}
                    {mockup.status === 'running' && (
                      <div className="flex items-center gap-3">
                        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
                          <Palette style={{ width: 22, height: 22, color: '#b07ef8' }} />
                        </motion.div>
                        <div>
                          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Maya is sketching…</div>
                          <div style={{ fontSize: 11, color: '#5a607a', marginTop: 2 }}>Picking a palette, fetching photos, drawing 5 screens. 1–2 minutes.</div>
                        </div>
                      </div>
                    )}
                    {mockup.status === 'done' && mockup.result && (
                      <>
                        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                          <CheckCircle2 style={{ width: 16, height: 16, color: '#5cc28a' }} />
                          <span style={{ fontSize: 11, color: '#5cc28a', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Mockups ready</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{mockup.result.summary}</div>
                        {mockup.result.files?.length > 0 && (
                          <div style={{ marginBottom: 14, padding: '8px 12px', background: '#0a0c12', borderRadius: 6, border: '1px solid #1e2130', maxHeight: 180, overflow: 'auto' }}>
                            {mockup.result.files.map(f => (
                              <div key={f.path} style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>{f.path}</span>
                                <span style={{ color: '#4a4f60' }}>{f.bytes.toLocaleString()} B</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {mockup.result.preview_url && (
                            <a href={`/api${mockup.result.preview_url.replace(/^\/api/, '')}`} target="_blank" rel="noopener noreferrer" style={{
                              background: '#b07ef8', color: '#fff', borderRadius: 8,
                              padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                            }}>
                              <Eye style={{ width: 14, height: 14 }} /> Preview
                            </a>
                          )}
                          <a href={`/api${mockup.result.download_url.replace(/^\/api/, '')}`} download style={{
                            background: '#5cc28a', color: '#0a0c12', borderRadius: 8,
                            padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                          }}>
                            <Download style={{ width: 14, height: 14 }} /> Download ZIP
                          </a>
                        </div>
                      </>
                    )}
                    {mockup.status === 'error' && (
                      <div className="flex items-start gap-3">
                        <AlertCircle style={{ width: 18, height: 18, color: '#f06b6b', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#f06b6b', fontWeight: 600 }}>Mockup generation failed</div>
                          <div style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', marginTop: 4 }}>{mockup.error}</div>
                          <button onClick={triggerMockup} style={{
                            marginTop: 10, color: '#b07ef8', background: 'none', border: '1px solid #b07ef844',
                            borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          }}>
                            Try again
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })()}

              {/* Build & Download — only when Ananya is in the team and all responses are in.
                  When Maya is ALSO in the team, this panel renders in a locked state until
                  her mockups complete, then animates open to unlock the build action. */}
              {(() => {
                if (!activeChat) return null;
                const teamHasAnanya = activeChat.team?.some(s => s.id === ANANYA_SKILL_ID);
                const teamHasMaya   = activeChat.team?.some(s => s.id === MAYA_SKILL_ID);
                const allResponsesIn = (activeChat.responses?.length || 0) >= (activeChat.team?.length || 0) && (activeChat.responses?.length || 0) > 0;
                if (!teamHasAnanya || !allResponsesIn || loading) return null;
                const buildLocked = teamHasMaya && mockup.status !== 'done';
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    style={{ marginTop: 32, padding: 20, background: '#0e1018', border: '1px solid #1e2130', borderRadius: 12 }}
                  >
                    {build.status === 'idle' && (
                      <AnimatePresence mode="wait">
                        {buildLocked ? (
                          <motion.div
                            key="locked"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                          >
                            <div style={{ fontSize: 10, color: '#5a607a', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Lock style={{ width: 11, height: 11 }} />
                              Waiting for Maya
                            </div>
                            <div style={{ fontSize: 13, color: '#8a91a8', marginBottom: 14, lineHeight: 1.65 }}>
                              Generate the mockups first — Ananya will build the production website using <span style={{ color: '#b07ef8', fontWeight: 600 }}>Maya's palette, typography, and layout</span>.
                            </div>
                            <button disabled style={{
                              background: '#1e2130', color: '#5a607a', border: '1px solid #1e2130',
                              borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600,
                              cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}>
                              <Lock style={{ width: 14, height: 14 }} />
                              Locked — design first
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="unlocked"
                            initial={{
                              opacity: 0,
                              scale: 0.95,
                              boxShadow: '0 0 0 0 rgba(92, 194, 138, 0)',
                            }}
                            animate={{
                              opacity: 1,
                              scale: 1,
                              boxShadow: [
                                '0 0 0 0 rgba(92, 194, 138, 0)',
                                '0 0 0 16px rgba(92, 194, 138, 0.25)',
                                '0 0 0 32px rgba(92, 194, 138, 0)',
                              ],
                            }}
                            transition={{
                              opacity: { duration: 0.35 },
                              scale:   { duration: 0.5, type: 'spring', stiffness: 240, damping: 18 },
                              boxShadow: { duration: 1.2, times: [0, 0.5, 1], ease: 'easeOut' },
                            }}
                            style={{ borderRadius: 10, padding: 2 }}
                          >
                            <div style={{ fontSize: 10, color: '#5b8dee', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {buildWillInheritDesign && <Sparkles style={{ width: 11, height: 11, color: '#5cc28a' }} />}
                              {buildWillInheritDesign
                                ? "Maya designed it · Ananya will build from her design"
                                : "Round table done · Ananya can build this"}
                            </div>
                            <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
                              {buildWillInheritDesign
                                ? <>Ananya inherits Maya's <span style={{ color: '#b07ef8', fontWeight: 600 }}>palette, typography, and layout structure</span>, then ships the production website (no mockup device frame).</>
                                : <>The team's input becomes Ananya's brief. She'll write the files, you download the ZIP.</>}
                            </div>
                            <button onClick={triggerBuild} style={{
                              background: '#5b8dee', color: '#fff', border: 'none', borderRadius: 8,
                              padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}>
                              <Hammer style={{ width: 14, height: 14 }} />
                              {buildWillInheritDesign ? "Build from Maya's design" : 'Build & Download'}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                    {build.status === 'running' && (
                      <div className="flex items-center gap-3">
                        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
                          <Hammer style={{ width: 22, height: 22, color: '#5b8dee' }} />
                        </motion.div>
                        <div>
                          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Ananya is building…</div>
                          <div style={{ fontSize: 11, color: '#5a607a', marginTop: 2 }}>Reading the team input, calling tools, writing files. 30–90 seconds.</div>
                        </div>
                      </div>
                    )}
                    {build.status === 'done' && build.result && (
                      <>
                        <div className="flex items-center gap-2 mb-2" style={{ marginBottom: 10 }}>
                          <CheckCircle2 style={{ width: 16, height: 16, color: '#5cc28a' }} />
                          <span style={{ fontSize: 11, color: '#5cc28a', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>App ready</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{build.result.summary}</div>
                        {build.result.files?.length > 0 && (
                          <div style={{ marginBottom: 14, padding: '8px 12px', background: '#0a0c12', borderRadius: 6, border: '1px solid #1e2130' }}>
                            {build.result.files.map(f => (
                              <div key={f.path} style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>{f.path}</span>
                                <span style={{ color: '#4a4f60' }}>{f.bytes.toLocaleString()} B</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {build.result.preview_url && (
                            <a href={`/api${build.result.preview_url.replace(/^\/api/, '')}`} target="_blank" rel="noopener noreferrer" style={{
                              background: '#5b8dee', color: '#fff', borderRadius: 8,
                              padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                            }}>
                              <Eye style={{ width: 14, height: 14 }} /> Preview
                            </a>
                          )}
                          <a href={`/api${build.result.download_url.replace(/^\/api/, '')}`} download style={{
                            background: '#5cc28a', color: '#0a0c12', borderRadius: 8,
                            padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                          }}>
                            <Download style={{ width: 14, height: 14 }} /> Download ZIP
                          </a>
                        </div>
                      </>
                    )}
                    {build.status === 'error' && (
                      <div className="flex items-start gap-3">
                        <AlertCircle style={{ width: 18, height: 18, color: '#f06b6b', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#f06b6b', fontWeight: 600 }}>Build failed</div>
                          <div style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', marginTop: 4 }}>{build.error}</div>
                          <button onClick={triggerBuild} style={{
                            marginTop: 10, color: '#5b8dee', background: 'none', border: '1px solid #5b8dee44',
                            borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          }}>
                            Try again
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })()}

              {/* Email Campaign — only when Kavya is in the team and all responses are in */}
              {(() => {
                if (!activeChat) return null;
                const teamHasKavya   = activeChat.team?.some(s => s.id === KAVYA_SKILL_ID);
                const allResponsesIn = (activeChat.responses?.length || 0) >= (activeChat.team?.length || 0) && (activeChat.responses?.length || 0) > 0;
                if (!teamHasKavya || !allResponsesIn || loading) return null;
                return (
                  <CreativeToolPanel
                    status={email.status}
                    result={email.result}
                    error={email.error}
                    color="#f0a04b"
                    Icon={Mail}
                    label="Email"
                    idleHeadline="Round table done · Kavya can draft this"
                    idleBlurb="Generate a send-ready HTML email — subject-line variants, preheader, plain-text fallback, all inside a Gmail-frame preview."
                    idleCta="Design Email Campaign"
                    runningHeadline="Kavya is drafting…"
                    runningBlurb="Choosing a frame, writing copy, inlining CSS, fetching a hero photo. 1–2 minutes."
                    doneLabel="Email ready"
                    onTrigger={triggerEmail}
                  />
                );
              })()}

              {/* Social Posts — only when Tara is in the team and all responses are in */}
              {(() => {
                if (!activeChat) return null;
                const teamHasTara    = activeChat.team?.some(s => s.id === TARA_SKILL_ID);
                const allResponsesIn = (activeChat.responses?.length || 0) >= (activeChat.team?.length || 0) && (activeChat.responses?.length || 0) > 0;
                if (!teamHasTara || !allResponsesIn || loading) return null;
                return (
                  <CreativeToolPanel
                    status={social.status}
                    result={social.result}
                    error={social.error}
                    color="#e070c2"
                    Icon={Megaphone}
                    label="Social"
                    idleHeadline="Round table done · Tara can post this"
                    idleBlurb="Generate platform-native posts (Instagram, Facebook, LinkedIn, X) rendered inside each platform's UI chrome with captions, hashtags, and asset specs."
                    idleCta="Design Social Posts"
                    runningHeadline="Tara is composing…"
                    runningBlurb="Picking platforms, drafting captions, fetching photos, rendering platform chrome. 1–2 minutes."
                    doneLabel="Posts ready"
                    onTrigger={triggerSocial}
                  />
                );
              })()}
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
            className="hidden md:flex flex-col flex-shrink-0">

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
