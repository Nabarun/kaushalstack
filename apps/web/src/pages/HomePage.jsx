import React, { useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, Users, Trophy, Code, TrendingUp, Send, RotateCcw, Heart, MessageCircle, Swords, Play, X, Lightbulb, Megaphone } from 'lucide-react';
import SkillDetailModal from '@/components/SkillDetailModal.jsx';
import AddSkillForm from '@/components/AddSkillForm.jsx';
import DemoVideoCard from '@/components/DemoVideoCard.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { avatarUrl } from '@/lib/avatar';

// Phase-aligned prompt suggestions. Each entry carries the phase it belongs
// to so the suggestion cards are scannable at a glance. When a phase tile is
// active, the matching list renders; when none is selected, a mixed fallback
// shows so the page still has useful starting points.
const PHASE_EXAMPLES = {
  ideation: [
    { phase: 'ideation', prompt: 'Validate whether there is market demand for a UPI-based split-expense app for college students' },
    { phase: 'ideation', prompt: 'Research the competitive landscape for hyperlocal delivery to kirana stores in India' },
    { phase: 'ideation', prompt: 'Brainstorm features for an AI tutor focused on UPSC preparation in Hindi' },
    { phase: 'ideation', prompt: 'Identify the target user persona and core problem for a rural healthcare telemedicine platform' },
  ],
  execution: [
    { phase: 'execution', prompt: 'Build a landing page for a Bangalore physiotherapy clinic with services, hours, and contact' },
    { phase: 'execution', prompt: 'Create a UPI QR code generator that takes a UPI ID and amount and renders a scannable QR' },
    { phase: 'execution', prompt: 'Build a simple split-bill calculator that handles tip and uneven splits' },
    { phase: 'execution', prompt: 'Design a pricing page with three plans and a feature comparison table' },
  ],
  marketing: [
    { phase: 'marketing', prompt: 'Draft a launch announcement and Twitter thread for an EV charging station locator app' },
    { phase: 'marketing', prompt: 'Plan a 4-week content marketing calendar for a fantasy cricket analytics tool around IPL' },
    { phase: 'marketing', prompt: 'Write SEO meta descriptions and a Google Ads pitch for a JEE/NEET vernacular learning platform' },
    { phase: 'marketing', prompt: 'Design a referral program with rewards for a kirana store delivery startup' },
  ],
};

const DEFAULT_EXAMPLES = [
  PHASE_EXAMPLES.ideation[0],
  PHASE_EXAMPLES.execution[0],
  PHASE_EXAMPLES.marketing[0],
  PHASE_EXAMPLES.ideation[2],
  PHASE_EXAMPLES.execution[1],
  PHASE_EXAMPLES.marketing[1],
];

// Apps that kaushalstack powers — i.e. real products built by/with the community.
const POWERED_APPS = [
  {
    name: 'ReFunction Rehab',
    description: 'Physiotherapy clinic in Bangalore',
    url: 'https://refunctionrehab.in/',
    domain: 'refunctionrehab.in',
  },
];

const PHASE_TILES = [
  { id: 'ideation',  label: 'Ideation',   Icon: Lightbulb },
  { id: 'execution', label: 'Execution',  Icon: Code },
  { id: 'marketing', label: 'Marketing',  Icon: Megaphone },
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-primary/50"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

// Strip the leading markdown `# Title (Agent)` and any other markdown
// markers so the card preview reads as plain prose. Newer skills use
// rich markdown descriptions; older ones are plain text — both work.
function previewFromDescription(desc) {
  if (!desc) return '';
  let s = desc.replace(/^\s*#[^\n]*\n+/, '');         // drop the H1 title line
  s = s.replace(/^\s*##[^\n]*\n+/, '');                // and any H2 immediately after
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');             // bold
  s = s.replace(/\*([^*]+)\*/g, '$1');                 // italics
  s = s.replace(/`([^`]+)`/g, '$1');                   // inline code
  return s.trim();
}

function AgentCard({ skill, index, onViewDetails }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.08, duration: 0.35 }}
    >
      <Card
        className="h-full flex flex-col hover:shadow-md transition-shadow cursor-pointer group overflow-hidden"
        onClick={() => onViewDetails && onViewDetails(skill)}
      >
        {/* Avatar + identity */}
        <div className="flex flex-col items-center pt-6 pb-4 px-4 text-center border-b border-border/50">
          <div className="relative mb-3">
            <img
              src={avatarUrl(skill.agent_name)}
              alt={skill.agent_name}
              className="w-16 h-16 rounded-full bg-muted object-cover ring-2 ring-background shadow-sm"
              loading="lazy"
            />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-primary" />
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{skill.agent_name}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap justify-center">
            <Badge variant="outline" className="text-xs px-1.5 py-0">{skill.category}</Badge>
            {skill.difficulty_level && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">{skill.difficulty_level}</Badge>
            )}
          </div>
        </div>

        {/* Skill info */}
        <CardContent className="flex-1 flex flex-col pt-4 pb-3">
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 mb-1.5 text-center">
            {skill.name}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 text-center mb-3">
            {previewFromDescription(skill.description)}
          </p>
          {skill.associated_tech_skills && (
            <div className="flex flex-wrap gap-1 justify-center mt-auto">
              {skill.associated_tech_skills.split(',').slice(0, 3).map((tech, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">{tech.trim()}</Badge>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter className="border-t pt-3 pb-3 justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{skill.likes_count || 0}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{skill.comments_count || 0}</span>
        </CardFooter>
      </Card>
    </motion.div>
  );
}


async function recommendTeam(query, phase = null, size = 6) {
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, phase, size }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.skills || [];
  } catch (err) {
    console.error('recommend failed:', err);
    return [];
  }
}

// Team-size selector used on the homepage prompt area. Backend clamps to
// 6–10; default 6 (matches the round-table hex viz). Beyond 6 the round
// table page nests a 1–4 agent inner ring inside the hex.
const TEAM_SIZE_MIN = 6;
const TEAM_SIZE_MAX = 10;

// Circular round-table seat layout: 10 chair positions evenly spaced around
// a center "table" circle. Coordinates are in a 100×100 viewBox; seat 0 sits
// at top (north) and seats rotate clockwise so reading order matches the
// round-table metaphor.
const SEAT_POSITIONS = Array.from({ length: TEAM_SIZE_MAX }, (_, i) => {
  const angleDeg = (i * 360) / TEAM_SIZE_MAX - 90;
  const rad = (angleDeg * Math.PI) / 180;
  const radius = 38;
  return { cx: 50 + radius * Math.cos(rad), cy: 50 + radius * Math.sin(rad) };
});

function TableSeatsSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Round table</span>
        <span className="text-xs font-mono text-foreground">
          <span className="text-primary font-bold">{value}</span>
          <span className="text-muted-foreground"> / {TEAM_SIZE_MAX} seats</span>
        </span>
      </div>
      <svg width="70" height="70" viewBox="0 0 100 100" aria-label="round table seat picker" role="group">
        {/* Spokes from each seat to the table */}
        {SEAT_POSITIONS.map((s, i) => {
          const filled = i + 1 <= value;
          return (
            <line key={`spoke-${i}`}
              x1={s.cx} y1={s.cy} x2="50" y2="50"
              stroke={filled ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--muted-foreground) / 0.12)'}
              strokeWidth="0.6"
              strokeDasharray={filled ? '0' : '1.5 1.5'}
            />
          );
        })}
        {/* The "table" — soft inner circle */}
        <circle cx="50" cy="50" r="14"
          fill="hsl(var(--muted) / 0.4)"
          stroke="hsl(var(--muted-foreground) / 0.3)"
          strokeWidth="1" />
        {/* Seats — clickable chair circles */}
        {SEAT_POSITIONS.map((s, i) => {
          const n = i + 1;
          const filled = n <= value;
          const isMinimum = n <= TEAM_SIZE_MIN;
          return (
            <circle key={`seat-${i}`}
              cx={s.cx} cy={s.cy} r="6.5"
              fill={filled ? 'hsl(var(--primary))' : 'transparent'}
              stroke={filled ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.45)'}
              strokeWidth="1.5"
              strokeDasharray={filled ? '0' : '2 1.5'}
              style={{
                cursor: isMinimum ? 'not-allowed' : 'pointer',
                transition: 'fill 0.18s, stroke 0.18s, r 0.18s',
              }}
              onClick={() => {
                if (n <= TEAM_SIZE_MIN) return;
                onChange(filled ? n - 1 : n);
              }}
            >
              <title>
                {isMinimum
                  ? `Seat ${n} — always present`
                  : filled
                    ? `Click to free seat ${n}`
                    : `Click to seat agent ${n}`}
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

const HomePage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [stats, setStats] = useState({ users: 0, skills: 0, leaderboard: 0 });
  // 5 most-recently-created skills, shown as a card row below the stats. Auto-refreshes
  // on every homepage load so the auto-extract pipeline's drops show up immediately.
  const [recentSkills, setRecentSkills] = useState([]);
  // null = search across all phases. Otherwise: 'ideation' | 'execution' | 'marketing'.
  const [selectedPhase, setSelectedPhase] = useState(null);

  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  // Team size for the recommendation. Persisted across submissions on this
  // page (user pick survives until they leave or refresh).
  const [teamSize, setTeamSize] = useState(TEAM_SIZE_MIN);

  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [editSkill, setEditSkill]         = useState(null);

  const inputRef    = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setStats({ users: s.members, skills: s.skills, leaderboard: s.leaderboard }); })
      .catch(err => console.error('Failed to fetch stats:', err));

    // PocketBase direct read — `created` is the autodate field on the skills
    // collection. Fields list trims payload to what AgentCard actually renders.
    const recentFields = 'id,name,description,category,phase,agent_name,associated_tech_skills,difficulty_level,likes_count,comments_count,created';
    fetch(`/pb/api/collections/skills/records?sort=-created&perPage=5&fields=${recentFields}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) setRecentSkills(d.items); })
      .catch(err => console.error('Failed to fetch recent skills:', err));
  }, []);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, chatLoading]);

  const handleSubmit = async (goal, phaseOverride) => {
    const text = (goal || input).trim();
    if (!text || chatLoading) return;

    // When a suggestion card is clicked, it knows its own phase — use that
    // (and update the tile selection so the UI reflects it).
    const phase = phaseOverride !== undefined ? phaseOverride : selectedPhase;
    if (phaseOverride !== undefined && phaseOverride !== selectedPhase) {
      setSelectedPhase(phaseOverride);
    }

    setInput('');
    setMessages(prev => [...prev, { type: 'user', text, phase }]);
    setChatLoading(true);

    const team = await recommendTeam(text, phase, teamSize);
    setMessages(prev => [...prev, { type: 'result', skills: team, query: text, phase }]);
    setChatLoading(false);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
  };

  const reset = () => { setMessages([]); setInput(''); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100); };

  const handleViewDetails = (skill) => { setSelectedSkill(skill); setIsModalOpen(true); };

  const isEmpty = messages.length === 0;
  // Split hero (video + prompt side-by-side) only for anonymous visitors who
  // haven't started a chat. Members go straight to the existing centered
  // prompt-first layout. Render nothing flicker-y until auth resolves.
  const showSplitHero = isEmpty && !authLoading && !isAuthenticated;

  // Placeholder text — narrows the prompt to whatever scope the user picked.
  const promptPlaceholder = selectedPhase
    ? `What do you want to build in the ${selectedPhase} phase?`
    : 'What do you want to build today?';

  // First-visit banner for members. Persists dismissal in localStorage so it
  // never re-shows after they've closed it (per device).
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  useEffect(() => {
    if (authLoading || !isAuthenticated || !isEmpty) { setShowWelcomeBanner(false); return; }
    try {
      if (!localStorage.getItem('ks_welcome_dismissed')) setShowWelcomeBanner(true);
    } catch { /* private mode */ }
  }, [authLoading, isAuthenticated, isEmpty]);
  function dismissWelcome() {
    try { localStorage.setItem('ks_welcome_dismissed', '1'); } catch {}
    setShowWelcomeBanner(false);
  }

  // NOTE: HeroBanner and CompactPromptInput were previously defined as nested
  // functions here. That created a new component identity on every render, so
  // React unmounted and remounted the textarea on every keystroke, killing
  // focus for guest users. They are now inlined where used in the JSX below.

  return (
    <>
      <Helmet>
        <title>kaushalstack - What do you want to build?</title>
        <meta name="description" content="Describe your project and kaushalstack assembles the right team of AI agent skills for you." />
      </Helmet>

      <div className="min-h-screen">

        {/* ── Chat Hero with phase scope ── */}
        {/* min-h scales with viewport: 60vh on mobile (where 90vh wastes most
            of the screen on empty gradient) and 90vh from md up where content
            naturally fills more. */}
        <section className="relative min-h-[60vh] md:min-h-[90vh] flex flex-col overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.08),transparent_50%)] pointer-events-none" />

          <div className={`relative flex-1 flex flex-col w-full px-4 sm:px-6 py-12 ${showSplitHero ? 'max-w-6xl mx-auto' : 'max-w-4xl mx-auto'}`}>

            {/* ── SPLIT HERO (logged-out, empty) ── video + compact prompt ── */}
            {showSplitHero && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-start mb-2"
              >
                {/* LEFT: Demo video */}
                <div className="order-2 lg:order-1">
                  <DemoVideoCard src="/demo-jun6.mp4" poster="/demo-jun6-poster.jpg" duration="3 min" />
                  <p className="text-center text-xs text-muted-foreground mt-3">
                    🎥 Latest walkthrough — Maya designs, Ananya builds, you download.
                  </p>
                </div>

                {/* RIGHT: Headline + input + compact trending */}
                <div className="order-1 lg:order-2 space-y-5 lg:pt-1">
                  <div className="text-center mb-6 lg:text-left lg:mb-0">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-5">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">AI Agent Team Builder</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-bold leading-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
                      What do you want{' '}
                      <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">to build?</span>
                    </h1>
                    <p className="text-base text-muted-foreground lg:max-w-md">
                      Describe your project and we'll assemble the right team of AI agent skills for you.
                    </p>
                  </div>
                  {/* Split-hero prompt input. Tap targets: textarea is min-h-12 (48px)
                      and the send button is 44×44, both above iOS's 44pt minimum. */}
                  <div className="bg-card rounded-2xl border shadow-md px-4 py-3 focus-within:border-primary transition-colors">
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={inputRef}
                        rows={2}
                        value={input}
                        onChange={e => {
                          setInput(e.target.value);
                          e.target.style.height = '48px';
                          e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                        }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                        placeholder={promptPlaceholder}
                        className="flex-1 resize-none bg-transparent text-base outline-none leading-relaxed placeholder:text-muted-foreground"
                        style={{ height: '48px', minHeight: '48px', maxHeight: '160px' }}
                      />
                      <button
                        onClick={() => handleSubmit()}
                        disabled={!input.trim() || chatLoading}
                        className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/50">
                      <TableSeatsSelector value={teamSize} onChange={setTeamSize} />
                    </div>
                  </div>

                  <div className="text-center lg:text-left pt-1">
                    <Link to="/signup" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      New here? <span className="text-primary font-semibold">Create a free account →</span>
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}

            {/* First-visit member welcome — soft banner above the centered prompt */}
            <AnimatePresence>
              {showWelcomeBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                  className="mb-6 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-accent/8 to-transparent px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4 text-primary fill-primary translate-x-0.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">New here? Watch the 3-min walkthrough</div>
                    <div className="text-xs text-muted-foreground">See the round table, community edits, and BYOK in action.</div>
                  </div>
                  <Link to="/about#demo">
                    <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap">
                      Watch demo
                    </button>
                  </Link>
                  <button onClick={dismissWelcome} aria-label="Dismiss"
                    className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Heading + phase tiles. Plain conditional render (no AnimatePresence)
                so it disappears the instant `showSplitHero` flips — otherwise
                Framer's exit animation can wedge in some browsers and the heading
                stays mounted on top of the invisible split-hero, pushing all
                content below the fold on mobile. */}
            {isEmpty && !showSplitHero && (
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">AI Agent Team Builder</span>
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4" style={{ letterSpacing: '-0.02em' }}>
                  What brings you to{' '}
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Kaushalstack?
                  </span>
                </h1>
                <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6 px-2">
                  Are you in <span className="font-semibold text-foreground">Ideation</span>, <span className="font-semibold text-foreground">Execution</span>, or <span className="font-semibold text-foreground">Marketing</span> stage?
                </p>

                {/* Phase tiles — sit under the subtitle so users can pick a stage */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-2xl mx-auto w-full">
                  {PHASE_TILES.map(({ id, label, Icon }) => {
                    const active = selectedPhase === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedPhase(active ? null : id)}
                        className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl border-2 px-2 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-all ${
                          active
                            ? 'border-primary bg-primary/10 text-primary shadow-sm -translate-y-0.5'
                            : 'border-border bg-card hover:border-primary/40 text-foreground hover:-translate-y-0.5'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prompt input — bumped up high when empty, so it's the first interaction.
                Plain conditional render (same reasoning as the heading above). */}
            {isEmpty && !showSplitHero && (
              <div className="mb-8">
                <div className="bg-card rounded-2xl border-2 shadow-lg px-4 py-3 sm:px-5 sm:py-4 focus-within:border-primary transition-colors">
                  <div className="flex items-end gap-2 sm:gap-3">
                    <textarea
                      ref={inputRef}
                      rows={2}
                      value={input}
                      onChange={e => {
                        setInput(e.target.value);
                        e.target.style.height = '48px';
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                      }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                      placeholder={promptPlaceholder}
                      className="flex-1 resize-none bg-transparent text-base outline-none leading-relaxed placeholder:text-muted-foreground"
                      style={{ height: '48px', minHeight: '48px' }}
                    />
                    <button
                      onClick={() => handleSubmit()}
                      disabled={!input.trim() || chatLoading}
                      className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/50">
                    <TableSeatsSelector value={teamSize} onChange={setTeamSize} />
                  </div>
                </div>
              </div>
            )}

            {/* Recommended suggestions — only when empty and not in split-hero mode */}
            {isEmpty && !showSplitHero && (
              <div className="mb-8">
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {selectedPhase
                          ? `${selectedPhase.charAt(0).toUpperCase() + selectedPhase.slice(1)} suggestions`
                          : 'Recommended suggestions'}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {(selectedPhase ? PHASE_EXAMPLES[selectedPhase] : DEFAULT_EXAMPLES).map((ex, i) => (
                        <button
                          key={`${selectedPhase || 'all'}-${i}`}
                          onClick={() => handleSubmit(ex.prompt, ex.phase)}
                          className="text-left text-sm px-4 py-3 rounded-xl border border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-block text-[10px] font-mono font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              {ex.phase}
                            </span>
                          </div>
                          <div className="leading-snug">"{ex.prompt}"</div>
                        </button>
                      ))}
                    </div>
                  </div>
              </div>
            )}

            {/* Chat messages */}
            {!isEmpty && (
              <div ref={messagesRef} className="space-y-5 mb-4 overflow-y-auto max-h-[calc(90vh-12rem)]">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => {
                    if (msg.type === 'user') return (
                      <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                        <div className="bg-primary text-primary-foreground text-sm px-4 py-3 rounded-2xl rounded-tr-sm max-w-lg shadow-sm">
                          {msg.text}
                        </div>
                      </motion.div>
                    );

                    if (msg.type === 'result') return (
                      <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-4 h-4 text-primary" />
                          </div>
                          <div className="bg-card border text-sm px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm max-w-lg">
                            {msg.skills.length === 0 ? (
                              <>No matching skills yet — <Link to="/skills" className="text-primary hover:underline">browse all skills</Link> or contribute one!</>
                            ) : (
                              <>Here's your recommended team for <span className="font-semibold">"{msg.query}"</span> — {msg.skills.length} agent{msg.skills.length !== 1 ? 's' : ''} selected.</>
                            )}
                          </div>
                        </div>
                        {msg.skills.length > 0 && (
                          <div className="ml-11 space-y-5">
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {msg.skills.map((skill, idx) => (
                                <AgentCard key={skill.id} skill={skill} index={idx} onViewDetails={handleViewDetails} />
                              ))}
                            </div>

                            {/* Hero CTA — the obvious next step after team recommendation */}
                            <motion.div
                              initial={{ opacity: 0, y: 16, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: 0.7, duration: 0.4, type: 'spring', stiffness: 220 }}
                            >
                              <button
                                onClick={() => navigate('/roundtable', { state: { team: msg.skills, query: msg.query } })}
                                className="group relative w-full overflow-hidden rounded-2xl text-left transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                                style={{
                                  background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                                }}
                              >
                                {/* Animated shimmer overlay */}
                                <motion.div
                                  aria-hidden
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)',
                                  }}
                                  animate={{ x: ['-100%', '120%'] }}
                                  transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
                                />

                                <div className="relative px-5 sm:px-6 py-5 flex items-center gap-4 text-white">
                                  <motion.div
                                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 ring-2 ring-white/30"
                                    animate={{ scale: [1, 1.08, 1] }}
                                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                  >
                                    <Swords className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                                  </motion.div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/80 font-mono">
                                        Next step
                                      </span>
                                      <span className="text-[10px] font-mono text-white/60 hidden sm:inline">·</span>
                                      <span className="text-[10px] font-mono text-white/60 hidden sm:inline">recommended</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-bold leading-tight mb-0.5">
                                      Deploy this team to the Round Table
                                    </div>
                                    <div className="text-xs sm:text-sm text-white/85 leading-snug">
                                      All {msg.skills.length} agents discuss "<span className="font-semibold">{msg.query}</span>" in one focused session.
                                    </div>
                                  </div>

                                  <motion.div
                                    className="shrink-0 hidden sm:flex items-center gap-2 bg-white/15 backdrop-blur rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 ring-white/25"
                                    animate={{ x: [0, 4, 0] }}
                                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                                  >
                                    Start
                                    <ArrowRight className="w-4 h-4" />
                                  </motion.div>
                                </div>
                              </button>
                            </motion.div>
                          </div>
                        )}
                      </motion.div>
                    );

                    return null;
                  })}
                </AnimatePresence>

                <AnimatePresence>
                  {chatLoading && (
                    <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div className="bg-card border rounded-2xl rounded-tl-sm shadow-sm"><TypingDots /></div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            )}

            {/* Chat input (sticky bottom) — only when a chat is active. When empty, the
                bumped-up inline prompt above handles input instead. Hidden in split-hero mode. */}
            <div className={`sticky bottom-4 mt-auto ${(showSplitHero || isEmpty) ? 'hidden' : ''}`}>
              <div className="flex items-end gap-2 bg-card rounded-2xl border shadow-md px-4 py-3 focus-within:border-primary transition-colors">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = '24px';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                  placeholder={promptPlaceholder}
                  className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed max-h-32 placeholder:text-muted-foreground"
                  style={{ height: '24px' }}

                />
                <div className="flex items-center gap-2 shrink-0">
                  {!isEmpty && (
                    <button onClick={reset} title="Start over" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleSubmit()}
                    disabled={!input.trim() || chatLoading}
                    className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-2">
                Enter to send · <Link to="/skills" className="text-primary hover:underline">Browse all skills</Link>
                {!isEmpty && <> · <button onClick={reset} className="text-primary hover:underline">Start over</button></>}
              </p>
            </div>
          </div>
        </section>

        {/* ── Recently added skills ── 5 most-recently created agents, fetched
            on mount. Sits ABOVE the stats row because "what's new on the
            platform" lands harder for first-time visitors than headcount.
            Hidden gracefully if PocketBase returns nothing. */}
        {recentSkills.length > 0 && (
          <section className="py-16 sm:py-20 bg-background border-y">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary tracking-wide uppercase">Just added</span>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">Recently added skills</h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
                  New AI specialist agents just joined the round table.
                </p>
              </div>

              {/* Grid scales from 1 → 2 → 3 → 5 cols. 5-across at xl puts every
                  card on one row for a clean shelf look on wide screens. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
                {recentSkills.map((skill, i) => (
                  <AgentCard key={skill.id} skill={skill} index={i} onViewDetails={handleViewDetails} />
                ))}
              </div>

              <div className="text-center mt-8">
                <Link to="/skills" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-semibold">
                  Browse all {stats.skills > 0 ? stats.skills.toLocaleString() : ''} skills
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Stats ── tucked below the Recently-added shelf since "what's new"
            matters more to first-time visitors than headcount. Labels switch
            to shorter copy on mobile so the 3-col grid doesn't truncate. */}
        <section className="py-12 bg-muted/20 border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-3 gap-3 sm:gap-8 text-center">
              <div>
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold mb-1">{stats.users}</div>
                <p className="text-xs sm:text-sm text-muted-foreground">Members</p>
              </div>
              <div>
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Code className="w-5 h-5 text-accent" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold mb-1">{stats.skills}</div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <span className="sm:hidden">Skills</span>
                  <span className="hidden sm:inline">Skills Shared</span>
                </p>
              </div>
              <div>
                <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-5 h-5 text-secondary" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold mb-1">{stats.leaderboard}</div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <span className="sm:hidden">Leaderboard</span>
                  <span className="hidden sm:inline">Leaderboard Entries</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Powered by kaushalstack ── */}
        <section className="py-20 bg-muted/20 border-t">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-primary">Built with our community</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Powered by kaushalstack</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Real products built using AI agent teams assembled on kaushalstack
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {POWERED_APPS.map((app, i) => (
                <motion.a
                  key={app.url}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="block group"
                >
                  <Card className="h-full hover:shadow-lg hover:-translate-y-0.5 transition-all border-border/60">
                    <CardContent className="p-6 flex items-start gap-4">
                      <img
                        src={`https://www.google.com/s2/favicons?sz=128&domain=${app.domain}`}
                        alt={`${app.name} logo`}
                        className="w-12 h-12 rounded-xl bg-background ring-1 ring-border object-contain p-1.5 shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {app.name}
                          </h3>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                          {app.description}
                        </p>
                        <span className="text-xs font-mono text-muted-foreground/70">{app.domain}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Community CTA ── */}
        <section className="py-20 bg-gradient-to-br from-primary to-accent text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Join our open-source community</h2>
            <p className="text-lg mb-8 text-white/90 leading-relaxed max-w-2xl mx-auto">
              kaushalstack is completely free and open source. We believe in collaborative learning and knowledge sharing. Join us in building the future of education.
            </p>
            <Link to="/signup">
              <Button size="lg" variant="secondary" className="gap-2">
                Create Free Account <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </section>
      </div>

      <SkillDetailModal skill={selectedSkill} open={isModalOpen} onOpenChange={setIsModalOpen} onEdit={setEditSkill} />
      <AddSkillForm open={!!editSkill} onOpenChange={(o) => { if (!o) setEditSkill(null); }} skill={editSkill} onSuccess={() => window.location.reload()} />
    </>
  );
};

export default HomePage;
