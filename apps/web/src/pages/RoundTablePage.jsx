import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Send, Key, Plus, Trash2, MessageSquare } from 'lucide-react';
import { avatarUrl } from '@/lib/avatar';
import pb from '@/lib/pocketbaseClient';

const PALETTE = ['#5b8dee', '#b07ef8', '#f0a04b', '#4ecba8', '#f06b6b'];
const FREE_LIMIT = 10;

const POSITIONS = [
  { x: 130, y: 50 },
  { x: 230, y: 130 },
  { x: 190, y: 240 },
  { x: 70,  y: 240 },
  { x: 30,  y: 130 },
];
const CENTER = { x: 130, y: 160 };

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

function BYOKScreen() {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 text-center" style={{ minHeight: 400 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>
        Free requests used up
      </h2>
      <p style={{ fontSize: 13, color: '#4a4f60', fontFamily: 'monospace', lineHeight: 1.8, maxWidth: 380, marginBottom: 32 }}>
        You've used all {FREE_LIMIT} complimentary round table sessions.
        To keep going, connect your own OpenAI API key — it takes under a minute.
      </p>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'left' }} className="space-y-4">
        {[
          { step: '1', title: 'Get a free OpenAI API key', body: 'Go to platform.openai.com → API Keys → Create new secret key.' },
          { step: '2', title: 'Copy the key', body: 'It starts with sk-proj-… — copy it and keep it safe.' },
          { step: '3', title: 'Coming soon: paste it here', body: 'We\'re adding a profile setting to save your key.' },
        ].map(({ step, title, body }) => (
          <div key={step} style={{ background: '#0e1018', border: '1px solid #1e2130', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#16192a', border: '1px solid #2a2d3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#5b8dee', flexShrink: 0, fontFamily: 'monospace' }}>{step}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#c8ccd8', marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 11, color: '#4a4f60', fontFamily: 'monospace', lineHeight: 1.6 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Key style={{ width: 13, height: 13, color: '#2e3244' }} />
        <span style={{ fontSize: 10, color: '#2e3244', fontFamily: 'monospace' }}>
          Keys are encrypted and stored per user account
        </span>
      </div>
    </div>
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

  const [chats, setChats]           = useState([]);     // [{ id, query, team, responses, created }]
  const [activeChat, setActiveChat] = useState(null);   // current chat object
  const [draftTeam, setDraftTeam]   = useState(initTeam.slice(0, 5));

  const inputRef = useRef(null);

  // Agents shown in the round table viz: from active chat if one is loaded, else from the draft team
  const visTeam = activeChat?.team || draftTeam;
  const agents  = visTeam.slice(0, 5).map((skill, i) => ({ ...skill, color: PALETTE[i], idx: i }));

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
        setRemaining(data.remaining);
        if (data.remaining <= 0) setLimitReached(true);
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
    const teamForRun = draftTeam.slice(0, 5);
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
        setLimitReached(true);
        setRemaining(0);
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
            {remaining !== null && !limitReached && (
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

          {/* ── Left: Round Table Viz ── */}
          <div style={{ width: 280, minWidth: 280, background: '#0a0c12', borderRight: '1px solid #1e2130' }}
            className="flex flex-col items-center py-6 flex-shrink-0 overflow-y-auto">

            <div className="relative" style={{ width: 260, height: 300 }}>
              <svg width="260" height="300" viewBox="0 0 260 300" className="absolute top-0 left-0">
                <circle cx={CENTER.x} cy={CENTER.y} r="110" fill="none" stroke="#14172090" strokeWidth="1" strokeDasharray="3 6" />
                {agents.map((a, i) => (
                  <motion.line key={i}
                    x1={POSITIONS[i].x} y1={POSITIONS[i].y}
                    x2={CENTER.x} y2={CENTER.y}
                    strokeWidth="1.5" strokeDasharray="3 6"
                    animate={{
                      stroke: activeIdx === i || focusedResponse?.agentIdx === i ? a.color : '#1a1d28',
                      opacity: activeIdx === i || focusedResponse?.agentIdx === i ? 0.7 : 0.3,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                ))}
              </svg>

              {agents.map((a, i) => (
                <button key={i} className="absolute flex flex-col items-center"
                  style={{
                    left: POSITIONS[i].x, top: POSITIONS[i].y, transform: 'translate(-50%, -50%)',
                    zIndex: 2, gap: 4, background: 'none', border: 'none',
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
                        boxShadow: [`0 0 0 3px ${a.color}50, 0 0 18px ${a.color}30`, `0 0 0 5px ${a.color}20, 0 0 28px ${a.color}20`],
                        scale: 1.15, borderColor: `${a.color}99`,
                      } : focusedResponse?.agentIdx === i ? {
                        boxShadow: `0 0 0 2px ${a.color}60`, scale: 1.08, borderColor: `${a.color}88`,
                      } : {
                        boxShadow: 'none', scale: 1, borderColor: 'rgba(255,255,255,0.06)',
                      }
                    }
                    transition={{ duration: 0.3 }}
                    style={{ width: 44, height: 44, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}
                  >
                    <img src={avatarUrl(a.agent_name)} alt={a.agent_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </motion.div>
                  <div style={{ textAlign: 'center', maxWidth: 64 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.2,
                      color: activeIdx === i ? a.color : focusedResponse?.agentIdx === i ? `${a.color}cc` : '#3a3f52',
                      transition: 'color 0.3s',
                    }}>
                      {a.agent_name}
                    </div>
                  </div>
                </button>
              ))}

              <motion.div
                style={{
                  position: 'absolute', left: CENTER.x, top: CENTER.y, transform: 'translate(-50%, -50%)',
                  width: 44, height: 44, background: '#0f1118', border: '1px solid #1e2130',
                  borderRadius: '50%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', zIndex: 3, gap: 2,
                }}
                animate={{
                  borderColor: activeIdx >= 0 ? `${PALETTE[activeIdx]}55` : '#1e2130',
                  boxShadow: activeIdx >= 0 ? `0 0 16px ${PALETTE[activeIdx]}20` : 'none',
                }}
                transition={{ duration: 0.3 }}
              >
                {activeIdx >= 0 ? (
                  <>
                    <TypingDots color={PALETTE[activeIdx]} />
                    <motion.span
                      style={{ fontSize: 7, fontFamily: 'monospace', color: PALETTE[activeIdx], letterSpacing: '0.04em' }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    >
                      thinking
                    </motion.span>
                  </>
                ) : (
                  <div style={{ fontSize: 16 }}>💬</div>
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
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Input pinned to top */}
            <div style={{ background: '#0a0c12', borderBottom: '1px solid #1e2130' }} className="px-5 py-4 flex-shrink-0">
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
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <AnimatePresence mode="wait">
                {limitReached && !activeChat ? (
                  <BYOKScreen key="byok" />
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

          {/* ── Right: History sidebar ── */}
          <div style={{ width: 280, minWidth: 280, background: '#0a0c12', borderLeft: '1px solid #1e2130' }}
            className="flex flex-col flex-shrink-0">

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
