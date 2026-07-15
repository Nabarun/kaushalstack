import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent } from '@/components/ui/card';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Users, ChevronDown, ChevronRight, Mail, Search } from 'lucide-react';

const CATEGORY_COLORS = {
    'sales':            'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    'marketing':        'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    'customer-support': 'bg-green-500/10 text-green-600 dark:text-green-400',
    'product':          'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    'engineering':      'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    'operations':       'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    'finance':          'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function CategoryPill({ value }) {
    if (!value) return null;
    const cls = CATEGORY_COLORS[value] || 'bg-muted text-muted-foreground';
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-medium ${cls}`}>
            {value}
        </span>
    );
}

function initials(name) {
    if (!name) return '?';
    return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function TeamMemberCard({ member }) {
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

function PartnerRow({ partner, defaultOpen }) {
    const [open, setOpen] = useState(!!defaultOpen);
    const hasTeam = partner.team && partner.team.length > 0;

    return (
        <Card className="bg-card border overflow-hidden">
            <button
                type="button"
                onClick={() => hasTeam && setOpen(v => !v)}
                className={`w-full flex items-center justify-between p-4 text-left ${hasTeam ? 'hover:bg-muted/30 transition-colors cursor-pointer' : 'cursor-default'}`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base truncate">{partner.name}</span>
                            {partner.status !== 'active' && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {partner.status}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            {partner.owner ? (
                                <span className="inline-flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    <span className="truncate">{partner.owner.email || partner.owner.name}</span>
                                </span>
                            ) : (
                                <span className="italic">no owner</span>
                            )}
                            <span>· {partner.team_size} {partner.team_size === 1 ? 'member' : 'members'}</span>
                        </div>
                    </div>
                </div>
                {hasTeam && (
                    open
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
            </button>

            {open && hasTeam && (
                <CardContent className="border-t pt-4 pb-4 bg-muted/10">
                    <div className="grid gap-2 md:grid-cols-2">
                        {partner.team.map((m, i) => (
                            <TeamMemberCard key={m.id || i} member={m} />
                        ))}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export default function PartnersPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        setLoading(true);
        adminApi.listPartners()
            .then(r => setItems(r.items || []))
            .catch(err => toast.error(`Failed to load partners: ${err.message}`))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return items;
        return items.filter(p => {
            if (p.name?.toLowerCase().includes(s)) return true;
            if (p.owner?.email?.toLowerCase().includes(s)) return true;
            if (p.owner?.name?.toLowerCase().includes(s)) return true;
            return (p.team || []).some(m =>
                m.agent_name?.toLowerCase().includes(s) ||
                m.role?.toLowerCase().includes(s) ||
                m.category?.toLowerCase().includes(s)
            );
        });
    }, [items, q]);

    const withTeams = items.filter(p => p.team_size > 0);
    const totalMembers = items.reduce((sum, p) => sum + p.team_size, 0);

    return (
        <>
            <Helmet><title>Teams · Admin</title></Helmet>

            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold">Teams</h1>
                    <p className="text-sm text-muted-foreground">
                        The AI teams provisioned for each partner &mdash; expand a partner to see who&#39;s on their bench.
                    </p>
                </div>
                {!loading && items.length > 0 && (
                    <div className="text-right text-xs text-muted-foreground">
                        <div>{items.length} partners · {withTeams.length} with teams</div>
                        <div>{totalMembers} team members total</div>
                    </div>
                )}
            </div>

            {items.length > 0 && (
                <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        type="search"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Search partners, owners, agents, or categories…"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
                </div>
            ) : filtered.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        {items.length === 0 ? 'No partners yet.' : 'No partners match that search.'}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {filtered.map(p => (
                        <PartnerRow key={p.id} partner={p} defaultOpen={filtered.length === 1} />
                    ))}
                </div>
            )}
        </>
    );
}
