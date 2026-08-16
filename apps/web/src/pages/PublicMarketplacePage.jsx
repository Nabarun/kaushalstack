import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowRight, AudioLines, BrainCircuit, Check, ChevronRight, Globe2, Layers3, MessageSquareText, Mic2, Palette, Search, Sparkles, UsersRound, Wrench } from 'lucide-react';
import CapabilityVisualizer from '@/components/CapabilityVisualizer.jsx';

const CAPABILITIES = [
  { name: 'Studio', eyebrow: 'Content', icon: Palette, tone: 'orange', description: 'Design, remix and publish social cards that stay on-brand across every channel.', detail: 'Image cards, captions, gradients and platform-ready exports.' },
  { name: 'AI teams', eyebrow: 'Workspace', icon: UsersRound, tone: 'violet', description: 'A focused bench of specialists that can debate, plan and move work forward together.', detail: 'Structured round tables from idea to usable spec.' },
  { name: 'Deep research', eyebrow: 'Intelligence', icon: Search, tone: 'cyan', description: 'Turn your approved links and documents into a living foundation for sharper decisions.', detail: 'Source-grounded research and recommended specialist teams.' },
  { name: 'Website', eyebrow: 'Build', icon: Globe2, tone: 'blue', description: 'Move from a visual direction to a production-ready site in one coherent workflow.', detail: 'Design, build and deployment support in one place.' },
  { name: 'Self-learning agents', eyebrow: 'Intelligence', icon: BrainCircuit, tone: 'green', description: 'Agents that retain approved preferences, corrections and constraints to get more useful over time.', detail: 'Human-reviewed learning keeps the context precise.' },
  { name: 'Interior visualizer', eyebrow: 'Design', icon: Layers3, tone: 'pink', description: 'Make a spatial idea easy to approve with moodboards, plans and photoreal room views.', detail: '2D concepts and 3D presentation-ready visuals.' },
  { name: 'Meeting intelligence', eyebrow: 'Productivity', icon: MessageSquareText, tone: 'teal', description: 'Turn recorded conversations into clear notes, decisions and assigned next steps.', detail: 'Transcription and structured minutes across Indian languages.' },
  { name: 'Engineering validation', eyebrow: 'Engineering', icon: Wrench, tone: 'amber', description: 'Turn technical drawings into checked specifications and clear manufacturing-ready outputs.', detail: 'AI extraction with standards-based cross-checks.' },
  { name: 'Voice', eyebrow: 'Voice', icon: AudioLines, tone: 'rose', description: 'Give ideas and agents a natural voice for product demos, accessibility and richer content.', detail: 'Text-to-speech built into your content workflow.' },
];

const STEPS = [
  ['01', 'Start with the work', 'Describe the outcome, bring a brief, or share your approved source material.'],
  ['02', 'Compose your stack', 'Choose one capability or connect a set of specialists and tools around the workflow.'],
  ['03', 'Keep moving', 'Your AI team creates, researches, validates and hands work into the next stage.'],
];

export default function PublicMarketplacePage() {
  return (
    <div className="ks-marketplace overflow-hidden bg-[#fffdf9] text-slate-950">
      <Helmet>
        <title>AI capabilities for ambitious teams — KaushalStack</title>
        <meta name="description" content="KaushalStack brings AI teams, content studio, research, websites, visualisation and workflow tools into one adaptable business stack." />
      </Helmet>

      <section className="relative isolate min-h-[690px] overflow-hidden bg-[#10131d] text-white">
        <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_16%_18%,rgba(255,125,25,.27),transparent_29%),radial-gradient(circle_at_78%_63%,rgba(83,93,255,.24),transparent_28%),linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:auto,auto,56px_56px,56px_56px]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#10131d] to-transparent" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-20 pt-20 sm:px-8 lg:min-h-[690px] lg:grid-cols-[1.03fr_.97fr] lg:px-10 lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.07] px-3.5 py-2 text-xs font-semibold tracking-[.13em] text-orange-200 uppercase backdrop-blur"><Sparkles className="h-3.5 w-3.5" /> An AI operating layer for business</div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[.96] tracking-[-.065em] sm:text-6xl lg:text-7xl">Make your business <span className="bg-gradient-to-r from-[#ffb069] via-[#ff7850] to-[#9da5ff] bg-clip-text text-transparent">move as one.</span></h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-slate-300 sm:text-xl">KaushalStack connects capable AI teams, purpose-built tools and your real work—so strategy, creation and execution never have to live in separate systems.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff7a18] px-5 text-sm font-bold text-white transition hover:bg-[#ff8d3d] focus:outline-none focus:ring-2 focus:ring-orange-200">Design your stack <ArrowRight className="h-4 w-4" /></Link>
              <a href="#capabilities" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[.045] px-5 text-sm font-semibold text-white transition hover:bg-white/10">Explore capabilities <ChevronRight className="h-4 w-4" /></a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-300">
              {['Built around your workflow', 'Human control at every stage', 'Start focused. Expand when ready.'].map(item => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-orange-300" /> {item}</span>)}
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[560px]">
            <div className="absolute inset-[7%] rounded-full border border-white/10 bg-white/[.025] shadow-[0_0_100px_rgba(255,112,26,.13)]" />
            <CapabilityVisualizer className="absolute inset-0 h-full w-full" />
            <div className="absolute left-0 top-[19%] rounded-xl border border-white/10 bg-[#202531]/85 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm"><span className="block font-semibold text-orange-200">Research → decision</span><span className="text-slate-400">shared context</span></div>
            <div className="absolute bottom-[17%] right-0 rounded-xl border border-white/10 bg-[#202531]/85 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm"><span className="block font-semibold text-indigo-200">Teams in motion</span><span className="text-slate-400">one connected workflow</span></div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="text-xs font-bold tracking-[.18em] text-orange-600 uppercase">The capability stack</p><h2 className="mt-4 max-w-md text-4xl font-semibold leading-[1.02] tracking-[-.055em] sm:text-5xl">One system. More ways to make progress.</h2></div><p className="max-w-xl text-lg leading-relaxed text-slate-600">Choose the capabilities that solve the immediate need, then layer in the rest when the work asks for it. Every module is designed to connect, not compete for your team’s attention.</p></div>
        <div id="capabilities" className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ name, eyebrow, icon: Icon, tone, description, detail }) => <article key={name} className="ks-capability group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_50px_rgba(15,23,42,.10)]"><div className={`ks-icon ks-icon-${tone} flex h-11 w-11 items-center justify-center rounded-xl`}><Icon className="h-5 w-5" /></div><div className="mt-7 flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[.15em] text-slate-400 uppercase">{eyebrow}</p><h3 className="mt-2 text-xl font-semibold tracking-[-.03em]">{name}</h3></div><span className="mt-1 text-sm text-slate-300 transition group-hover:translate-x-1 group-hover:text-orange-500"><ArrowRight className="h-4 w-4" /></span></div><p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-400">{detail}</p></article>)}
        </div>
      </section>

      <section className="bg-[#f4f1eb] px-5 py-20 sm:px-8 lg:px-10 lg:py-28"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-bold tracking-[.18em] text-orange-600 uppercase">From prompt to momentum</p><h2 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-.055em] sm:text-5xl">Tools are useful. A well-designed flow changes the pace of work.</h2></div><div className="mt-14 grid gap-4 md:grid-cols-3">{STEPS.map(([number, title, description]) => <div key={number} className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/[.035]"><span className="font-mono text-xs font-bold tracking-[.15em] text-orange-600">{number}</span><h3 className="mt-10 text-2xl font-semibold tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-xs leading-relaxed text-slate-600">{description}</p></div>)}</div></div></section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-28"><div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-[#131722] px-7 py-14 text-white sm:px-12 lg:px-16 lg:py-20"><div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-orange-500/25 blur-3xl" /><div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" /><div className="relative grid gap-9 lg:grid-cols-[1fr_auto] lg:items-end"><div className="max-w-2xl"><Mic2 className="h-7 w-7 text-orange-300" /><h2 className="mt-7 text-4xl font-semibold leading-[1.02] tracking-[-.055em] sm:text-5xl">Bring us the workflow you want to improve.</h2><p className="mt-5 text-lg leading-relaxed text-slate-300">We’ll help you shape the right combination of AI teams and capabilities around it—without forcing your work into a template.</p></div><Link to="/contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-slate-950 transition hover:bg-orange-50">Start a conversation <ArrowRight className="h-4 w-4" /></Link></div></div></section>
    </div>
  );
}
