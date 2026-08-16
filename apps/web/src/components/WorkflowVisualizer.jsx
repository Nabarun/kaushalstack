import React from 'react';
import { Bot, Database, MessageCircleMore, Sparkles, Workflow } from 'lucide-react';

const SOURCES = [
  { label: 'CRM', Icon: Database },
  { label: 'AI context', Icon: Sparkles },
  { label: 'Conversations', Icon: MessageCircleMore },
];

/**
 * An original, CSS-only workflow animation. It uses the same storytelling
 * rhythm as the supplied reference (context → app → agents), without copying
 * its artwork, screenshots, or visual assets.
 */
export default function WorkflowVisualizer({ className = '' }) {
  return (
    <div className={`ks-workflow relative overflow-hidden rounded-[2rem] bg-[#fbfaf7] text-slate-950 ${className}`} aria-label="Animated AI workflow illustration">
      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(15,23,42,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.035)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative h-full min-h-[330px] p-5 sm:p-6">
        <div className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
          <span>Your context</span><span className="text-center">Your workspace</span><span className="text-right">AI team</span>
        </div>

        <div className="absolute left-[16%] right-[16%] top-[23%] border-t border-dashed border-slate-300" />
        <div className="absolute left-[31%] top-[20.5%] h-1.5 w-1.5 rounded-full bg-blue-500 ks-flow-dot" />
        <div className="absolute left-[65%] top-[20.5%] h-1.5 w-1.5 rounded-full bg-cyan-400 ks-flow-dot ks-flow-dot-delay" />

        <div className="absolute left-5 top-[34%] w-[29%] space-y-2">
          {SOURCES.map(({ label, Icon }, index) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 shadow-sm" style={{ animationDelay: `${index * 180}ms` }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-blue-500"><Icon className="h-3 w-3" /></span>
              <span className="truncate text-[9px] font-semibold text-slate-600">{label}</span>
            </div>
          ))}
        </div>

        <div className="absolute left-1/2 top-[31%] w-[38%] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_15px_35px_rgba(15,23,42,.12)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="flex items-center gap-1 text-[9px] font-bold"><Workflow className="h-3 w-3 text-indigo-500" /> Growth workspace</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {['Plan', 'Create', 'Review'].map((label, index) => <div key={label} className={`rounded-md px-1.5 py-2 text-center text-[8px] font-semibold ${index === 1 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'}`}>{label}</div>)}
          </div>
          <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[8px] text-slate-500"><span className="font-semibold text-slate-700">Campaign idea</span><br />Ready for specialist review</div>
        </div>

        <div className="absolute right-4 top-[34%] w-[22%] space-y-2">
          {['Strategist', 'Creator', 'Analyst'].map((role, index) => (
            <div key={role} className={`ks-agent-chip flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm ${index === 1 ? 'ks-agent-chip-delay' : ''}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full ${index === 0 ? 'bg-blue-100 text-blue-600' : index === 1 ? 'bg-indigo-100 text-indigo-600' : 'bg-cyan-100 text-cyan-600'}`}><Bot className="h-2.5 w-2.5" /></span>
              <span className="truncate text-[8px] font-semibold text-slate-600">{role}</span>
            </div>
          ))}
        </div>

        <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white px-3 py-2">
          <span className="text-[10px] font-semibold text-slate-600">Shared context becomes useful work.</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white"><Sparkles className="h-3 w-3" /></span>
        </div>
      </div>
    </div>
  );
}
