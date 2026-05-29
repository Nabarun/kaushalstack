import React, { useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, Users, Trophy, Code, TrendingUp, Send, RotateCcw, Heart, MessageCircle, Swords } from 'lucide-react';
import SkillCard from '@/components/SkillCard.jsx';
import SkillDetailModal from '@/components/SkillDetailModal.jsx';
import AddSkillForm from '@/components/AddSkillForm.jsx';
import pb from '@/lib/pocketbaseClient';
import { avatarUrl } from '@/lib/avatar';

const EXAMPLES = [
  'A UPI-based split-expense app for college students',
  'An AI tutor for UPSC preparation in regional languages',
  'A hyperlocal delivery platform for kirana stores',
  'An EV charging network management dashboard',
  'A telemedicine platform for rural healthcare in India',
  'A fantasy cricket analytics tool for IPL season',
];

const TRENDING_INDIA_FALLBACK = [
  { label: 'IPL 2025 Analytics', prompt: 'A real-time cricket analytics and prediction platform for IPL 2025' },
  { label: 'ONDC Integration', prompt: 'A seller onboarding tool to integrate small businesses with the ONDC network' },
  { label: 'UPI for Business', prompt: 'A UPI-powered invoicing and payment reconciliation tool for small businesses' },
  { label: 'AI in AgriTech', prompt: 'An AI-powered crop advisory app for Indian farmers using satellite and weather data' },
  { label: 'EV Startup', prompt: 'An EV fleet management and charging station locator app for India' },
  { label: 'Vernacular EdTech', prompt: 'An adaptive learning platform for competitive exams like JEE and NEET in Hindi and regional languages' },
  { label: 'Digital Health', prompt: 'An ABHA-linked digital health records app connecting patients and doctors across India' },
  { label: 'Startup India Tools', prompt: 'A compliance and funding tracker for startups registered under Startup India' },
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
            {skill.description}
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


async function recommendTeam(query) {
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.skills || [];
  } catch (err) {
    console.error('recommend failed:', err);
    return [];
  }
}

const HomePage = () => {
  const navigate = useNavigate();

  const [trendingSkills, setTrendingSkills] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [stats, setStats]                   = useState({ users: 0, skills: 0, leaderboard: 0 });

  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [trendingTopics, setTrendingTopics] = useState(TRENDING_INDIA_FALLBACK);
  const [trendingSource, setTrendingSource] = useState('fallback');

  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [editSkill, setEditSkill]         = useState(null);

  const inputRef    = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trendingRes, statsRes] = await Promise.all([
          pb.collection('skills').getList(1, 6, { sort: '-likes_count,-created', $autoCancel: false }),
          fetch('/api/stats').then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        setTrendingSkills(trendingRes.items);
        if (statsRes) setStats({ users: statsRes.members, skills: statsRes.skills, leaderboard: statsRes.leaderboard });
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    fetch('/api/trending-india')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.topics?.length) {
          setTrendingTopics(data.topics);
          setTrendingSource(data.source || 'fallback');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, chatLoading]);

  const handleSubmit = async (goal) => {
    const text = (goal || input).trim();
    if (!text || chatLoading) return;

    setInput('');
    setMessages(prev => [...prev, { type: 'user', text }]);
    setChatLoading(true);

    const team = await recommendTeam(text);
    setMessages(prev => [...prev, { type: 'result', skills: team, query: text }]);
    setChatLoading(false);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
  };

  const reset = () => { setMessages([]); setInput(''); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100); };

  const handleViewDetails = (skill) => { setSelectedSkill(skill); setIsModalOpen(true); };

  const isEmpty = messages.length === 0;

  return (
    <>
      <Helmet>
        <title>kaushalstack - What do you want to build?</title>
        <meta name="description" content="Describe your project and kaushalstack assembles the right team of AI agent skills for you." />
      </Helmet>

      <div className="min-h-screen">

        {/* ── Chat Hero ── */}
        <section className="relative min-h-[90vh] flex flex-col overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.08),transparent_50%)] pointer-events-none" />

          <div className="relative flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">

            {/* Heading — fades out once chat starts */}
            <AnimatePresence>
              {isEmpty && (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -16, transition: { duration: 0.25 } }}
                  className="text-center mb-10"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">AI Agent Team Builder</span>
                  </div>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4" style={{ letterSpacing: '-0.02em' }}>
                    What do you want{' '}
                    <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      to build?
                    </span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                    Describe your project and we'll assemble the right team of AI agent skills for you.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Trending topics + example chips — only when empty */}
            <AnimatePresence>
              {isEmpty && (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  className="space-y-5 mb-8"
                >
                  {/* Trending in India */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-base">🇮🇳</span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Trending in India</span>
                      {trendingSource === 'google-trends' && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono">· live</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trendingTopics.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => handleSubmit(t.prompt)}
                          title={t.traffic ? `${t.traffic} searches` : undefined}
                          className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Build ideas */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">What do you want to build?</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {EXAMPLES.map((ex, i) => (
                        <button
                          key={i}
                          onClick={() => handleSubmit(ex)}
                          className="text-left text-sm px-4 py-3 rounded-xl border border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          "{ex}"
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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

            {/* Chat input */}
            <div className="sticky bottom-4 mt-auto">
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
                  placeholder="What do you want to build today?"
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

        {/* ── Stats ── */}
        <section className="py-12 bg-muted/20 border-y">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-bold mb-1">{stats.users}</div>
                <p className="text-sm text-muted-foreground">Members</p>
              </div>
              <div>
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Code className="w-5 h-5 text-accent" />
                </div>
                <div className="text-3xl font-bold mb-1">{stats.skills}</div>
                <p className="text-sm text-muted-foreground">Skills Shared</p>
              </div>
              <div>
                <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-5 h-5 text-secondary" />
                </div>
                <div className="text-3xl font-bold mb-1">{stats.leaderboard}</div>
                <p className="text-sm text-muted-foreground">Leaderboard Entries</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trending skills ── */}
        <section className="py-20 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-primary">Popular Right Now</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Trending skills</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Discover what the community is learning and building today
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-80 bg-card rounded-2xl animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trendingSkills.map((skill, index) => (
                  <motion.div key={skill.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.1 }}>
                    <SkillCard skill={skill} onViewDetails={handleViewDetails} />
                  </motion.div>
                ))}
              </div>
            )}

            <div className="text-center mt-12">
              <Link to="/skills">
                <Button size="lg" variant="outline" className="gap-2">
                  View All Skills <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
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
