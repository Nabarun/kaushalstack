// Agent-team roster rendering, shared by the Customers page.
// Moved out of the old PartnersPage when Businesses and Teams merged.

import React from 'react';
import { initials } from '@/lib/adminFormat';

const CATEGORY_COLORS = {
    'sales':            'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    'marketing':        'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    'customer-support': 'bg-green-500/10 text-green-600 dark:text-green-400',
    'product':          'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    'engineering':      'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    'operations':       'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    'finance':          'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

export function CategoryPill({ value }) {
    if (!value) return null;
    const cls = CATEGORY_COLORS[value] || 'bg-muted text-muted-foreground';
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-medium ${cls}`}>
            {value}
        </span>
    );
}

export function TeamMemberCard({ member }) {
    const skills = (member.associated_tech_skills || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 4);

    return (
        <div className="rounded-lg border bg-card p-4 flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-sm font-semibold text-foreground">
                {initials(member.agent_name)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{member.agent_name}</div>
                        {member.role && (
                            <div className="text-xs text-muted-foreground line-clamp-1">{member.role}</div>
                        )}
                    </div>
                    <CategoryPill value={member.category} />
                </div>
                {skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {skills.map((s, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {s}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const BENCH_LABELS = {
    inner:     'Inner team',
    marketing: 'Marketing team',
};

function benchLabel(key) {
    if (BENCH_LABELS[key]) return BENCH_LABELS[key];
    return `${key.charAt(0).toUpperCase()}${key.slice(1)} team`;
}

// Multi-team partners tag each member with a `bench`; render one section per
// bench. Partners without benches keep the flat grid.
export function TeamGrid({ team }) {
    const benches = Array.from(new Set(team.map(m => m.bench).filter(Boolean)));
    if (benches.length === 0) {
        return (
            <div className="grid gap-2 md:grid-cols-2">
                {team.map((m, i) => <TeamMemberCard key={m.id || i} member={m} />)}
            </div>
        );
    }
    const unbenched = team.filter(m => !m.bench);
    return (
        <div className="space-y-4">
            {benches.map(b => {
                const members = team.filter(m => m.bench === b);
                return (
                    <div key={b}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{benchLabel(b)}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">{members.length}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                            {members.map((m, i) => <TeamMemberCard key={m.id || i} member={m} />)}
                        </div>
                    </div>
                );
            })}
            {unbenched.length > 0 && (
                <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Other</div>
                    <div className="grid gap-2 md:grid-cols-2">
                        {unbenched.map((m, i) => <TeamMemberCard key={m.id || i} member={m} />)}
                    </div>
                </div>
            )}
        </div>
    );
}
