import React from 'react';
import { AtSign, Bot, BriefcaseBusiness, Globe2, Image, MessageCircleMore, MessagesSquare, Sparkles, UsersRound } from 'lucide-react';

const SOURCES = [
  { label: 'Assets', Icon: Image, top: '25%' },
  { label: 'Digital presence', Icon: Globe2, top: '38%' },
  { label: 'Social handles', Icon: AtSign, top: '51%' },
  { label: 'Client conversations', Icon: MessagesSquare, top: '64%' },
];

const FUTURE_WORK = ['Marketing', 'Research', 'Sales', 'Services', 'Support'];

/** Original CSS workflow visual: customer signals build one dedicated team. */
export default function WorkflowVisualizer({ className = '' }) {
  return (
    <div className={`ks-workflow relative overflow-hidden rounded-[2rem] bg-[#fbfdff] text-slate-950 ${className}`} aria-label="Customer context flows into KaushalStack and creates a dedicated AI roundtable">
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(37,99,235,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,.045)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative h-full min-h-[330px] p-5 sm:p-6">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[.14em] text-slate-400">
          <span>Customer context</span><span>Dedicated AI team</span>
        </div>

        {/* Curved dotted paths deliberately originate at each customer source. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[31, 43, 55, 67].map((y, index) => <path key={y} d={`M 12 ${y} C 29 ${y}, 31 ${48 + index * 2}, 47 ${50 + index * 2}`} fill="none" stroke="#93c5fd" strokeWidth="0.35" strokeDasharray="1.2 1.3" />)}
          <path d="M 57 55 C 66 55, 70 50, 76 48" fill="none" stroke="#2563eb" strokeWidth="0.5" strokeDasharray="1.4 1.2" />
          <path d="M 76 62 C 76 69, 73 74, 68 79" fill="none" stroke="#2563eb" strokeWidth="0.5" strokeDasharray="1.4 1.2" />
        </svg>

        <div className="absolute left-4 top-0 h-full w-[30%]">
          {SOURCES.map(({ label, Icon, top }, index) => (
            <div key={label} className="absolute left-0 flex w-full items-center gap-2 rounded-lg border border-blue-100 bg-white/95 px-2.5 py-2 shadow-sm" style={{ top, animationDelay: `${index * 160}ms` }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3 w-3" /></span>
              <span className="truncate text-[8px] font-bold text-slate-600">{label}</span>
            </div>
          ))}
        </div>

        <div className="absolute left-[49%] top-[43%] w-[25%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-blue-200 bg-white p-2.5 shadow-[0_15px_35px_rgba(37,99,235,.14)]">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold text-slate-900"><span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 text-white"><Sparkles className="h-3 w-3" /></span> KaushalStack</div>
          <p className="mt-2 text-[8px] leading-relaxed text-slate-500">Maps your context and assembles the right customer team.</p>
          <div className="mt-2 flex items-center gap-1 text-[8px] font-semibold text-blue-600"><BriefcaseBusiness className="h-3 w-3" /> Customer workspace</div>
        </div>

        <div className="absolute right-3 top-[31%] w-[26%]">
          <div className="relative mx-auto flex aspect-square w-full items-center justify-center rounded-full border border-blue-200 bg-blue-50/70">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-center text-[7px] font-extrabold leading-tight text-white shadow-md">Customer<br />roundtable</div>
            {['Marketing', 'Research', 'Sales', 'Support'].map((role, index) => {
              const positions = ['-left-2 top-1/2 -translate-y-1/2', 'left-1/2 -top-2 -translate-x-1/2', '-right-2 top-1/2 -translate-y-1/2', 'bottom-0 left-1/2 translate-y-1/2 -translate-x-1/2'];
              return <span key={role} className={`ks-agent-chip absolute ${positions[index]} flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-blue-700 shadow-sm`} title={role}><Bot className="h-3 w-3" /></span>;
            })}
          </div>
          <p className="mt-3 text-center text-[8px] font-bold text-slate-600"><UsersRound className="mr-1 inline h-3 w-3 text-blue-600" />One team for this customer</p>
        </div>

        <div className="absolute bottom-4 left-[32%] right-4 rounded-xl border border-blue-100 bg-white/95 p-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-600"><MessageCircleMore className="h-3 w-3 text-blue-600" /> Future conversations route to this roundtable</div>
          <div className="mt-2 flex flex-wrap gap-1">{FUTURE_WORK.map(item => <span key={item} className="rounded-full bg-blue-50 px-1.5 py-1 text-[7px] font-bold text-blue-700">{item}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
