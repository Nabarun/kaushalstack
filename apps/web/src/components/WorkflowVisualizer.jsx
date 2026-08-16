import React from 'react';
import { AtSign, Bot, BriefcaseBusiness, Globe2, Image, MessageCircleMore, MessagesSquare, Sparkles, UsersRound } from 'lucide-react';

const SOURCES = [
  { label: 'Assets', Icon: Image, top: '24%' },
  { label: 'Digital presence', Icon: Globe2, top: '38%' },
  { label: 'Social handles', Icon: AtSign, top: '52%' },
  { label: 'Client conversations', Icon: MessagesSquare, top: '66%' },
];

const FUTURE_WORK = ['Marketing', 'Research', 'Sales', 'Services', 'Support'];

/** Original CSS/SVG workflow: incoming context creates one long-lived customer team. */
export default function WorkflowVisualizer({ className = '' }) {
  return (
    <div className={`ks-workflow relative isolate overflow-hidden rounded-[2rem] bg-[#fbfdff] text-slate-950 ${className}`} aria-label="Customer context flows into KaushalStack and creates a dedicated AI roundtable">
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(37,99,235,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,.045)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative min-h-[420px] p-5 sm:min-h-[470px] sm:p-7">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">
          <span>Customer context</span><span>Dedicated AI team</span>
        </div>

        {/* Every animated dotted path is directed left → right, ending at the customer roundtable. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[30, 43, 56, 69].map((y, index) => (
            <path
              key={y}
              className="ks-flow-path ks-flow-path-source"
              d={`M 20 ${y} C 34 ${y}, 35 ${42 + index * 2}, 47 ${48 + index}`}
              pathLength="100"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="0.42"
              strokeDasharray="1.3 2.6"
              style={{ animationDelay: `${index * -0.36}s` }}
            />
          ))}
          <path className="ks-flow-path ks-flow-path-core" d="M 56 51 C 63 51, 67 49, 74 49" pathLength="100" fill="none" stroke="#2563eb" strokeWidth="0.62" strokeDasharray="1.5 2.5" />
          <path className="ks-flow-path ks-flow-path-core" d="M 77 57 C 79 65, 77 72, 72 78" pathLength="100" fill="none" stroke="#2563eb" strokeWidth="0.5" strokeDasharray="1.4 2.6" style={{ animationDelay: '-.75s' }} />
        </svg>

        <div className="absolute left-[5%] top-0 h-full w-[20%] sm:left-[7%] sm:w-[19%]">
          {SOURCES.map(({ label, Icon, top }) => (
            <div key={label} className="absolute left-0 flex w-full items-center gap-2 rounded-xl border border-blue-100 bg-white/95 px-2.5 py-2.5 shadow-sm" style={{ top }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></span>
              <span className="truncate text-[8px] font-bold text-slate-600 sm:text-[10px]">{label}</span>
            </div>
          ))}
        </div>

        <div className="absolute left-[51%] top-[49%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-blue-200 bg-white p-3 shadow-[0_18px_40px_rgba(37,99,235,.16)] sm:w-[18%] sm:p-4">
          <div className="flex items-center gap-2 text-[9px] font-extrabold text-slate-900 sm:text-[11px]"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white"><Sparkles className="h-3.5 w-3.5" /></span> KaushalStack</div>
          <p className="mt-2 text-[8px] leading-relaxed text-slate-500 sm:text-[9px]">Maps customer context and builds the right team.</p>
          <div className="mt-2 flex items-center gap-1 text-[8px] font-semibold text-blue-600 sm:text-[9px]"><BriefcaseBusiness className="h-3 w-3" /> Customer workspace</div>
        </div>

        <div className="absolute right-[5%] top-[27%] w-[23%] sm:right-[7%] sm:w-[18%]">
          <div className="relative mx-auto flex aspect-square w-full items-center justify-center rounded-full border border-blue-200 bg-blue-50/70">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-blue-600 px-1 text-center text-[7px] font-extrabold leading-tight text-white shadow-md sm:h-14 sm:w-14 sm:text-[8px]">Customer<br />roundtable</div>
            {['Marketing', 'Research', 'Sales', 'Support'].map((role, index) => {
              const positions = ['-left-2 top-1/2 -translate-y-1/2', 'left-1/2 -top-2 -translate-x-1/2', '-right-2 top-1/2 -translate-y-1/2', 'bottom-0 left-1/2 translate-y-1/2 -translate-x-1/2'];
              return <span key={role} className={`ks-agent-chip absolute ${positions[index]} flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-blue-700 shadow-sm`} title={role}><Bot className="h-3.5 w-3.5" /></span>;
            })}
          </div>
          <p className="mt-4 text-center text-[8px] font-bold text-slate-600 sm:text-[9px]"><UsersRound className="mr-1 inline h-3 w-3 text-blue-600" />One team for this customer</p>
        </div>

        <div className="absolute bottom-5 left-[27%] right-[7%] rounded-xl border border-blue-100 bg-white/95 px-3 py-2.5 shadow-sm sm:left-[29%]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-bold text-slate-600 sm:text-[9px]"><MessageCircleMore className="h-3.5 w-3.5 text-blue-600" /> Future conversations route to this roundtable</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{FUTURE_WORK.map(item => <span key={item} className="rounded-full bg-blue-50 px-2 py-1 text-[7px] font-bold text-blue-700 sm:text-[8px]">{item}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
