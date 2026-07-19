import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import {
    Sparkles, Users, Search, Globe, Mic2, MessageSquare, Headphones,
    Wand2, Bot, Store, ExternalLink, IndianRupee, CheckCircle2, AlertCircle,
} from 'lucide-react';

const STATUS_STYLES = {
    live:         'bg-green-500/10 text-green-600 dark:text-green-400',
    beta:         'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    'coming-soon':'bg-muted text-muted-foreground',
};

const STATUS_LABEL = {
    live: 'Live',
    beta: 'Beta',
    'coming-soon': 'Coming soon',
};

export const FEATURES = [
    {
        id: 'studio',
        title: 'Studio',
        tagline: 'Design, remix, and publish social cards',
        description:
            'Card Studio — swap photos, edit captions with AI, add gradients, and export platform-ready posts to Facebook, LinkedIn, or as MP4.',
        icon: Wand2,
        category: 'Content',
        status: 'live',
        href: '/partner?tab=studio',
    },
    {
        id: 'multi-team',
        title: 'Multi-team',
        tagline: 'A dedicated AI team per partner',
        description:
            'Each partner gets a curated bench of AI specialists (Sameer, Zoya, Maya, Tara…) with role-based access via partner_members.',
        icon: Users,
        category: 'Workspace',
        status: 'live',
        href: '/admin/teams',
    },
    {
        id: 'research',
        title: 'Deep research',
        tagline: 'Build a team from the partner’s own assets',
        description:
            'Scans uploaded links and docs, embeds the profile, and recommends the right specialists with a per-agent "why this agent" rationale.',
        icon: Search,
        category: 'Intelligence',
        status: 'live',
        href: '/partner?tab=team',
    },
    {
        id: 'website',
        title: 'Website',
        tagline: 'Mockup → production site in one flow',
        description:
            'Maya designs the mockup, Ananya turns it into a production Vite build, Hostinger ships the ZIP straight to your VPS.',
        icon: Globe,
        category: 'Build',
        status: 'live',
        href: '/build',
    },
    {
        id: 'podcast-embed',
        title: 'Podcast embedding',
        tagline: 'Drop a podcast into any workspace',
        description:
            'Embed audio players, transcripts, and metadata as first-class assets that agents can reference when they generate content.',
        icon: Headphones,
        category: 'Content',
        status: 'beta',
        href: '/partner?tab=assets',
    },
    {
        id: 'chat-qna',
        title: 'Chat Q&A',
        tagline: 'Round-table conversations with your team',
        description:
            'Multi-agent chat where specialists debate an idea, hand off between phases (ideation → execution → marketing), and produce a spec.',
        icon: MessageSquare,
        category: 'Workspace',
        status: 'live',
        href: '/roundtable',
    },
    {
        id: 'speech',
        title: 'Speech',
        tagline: 'Give your agents a voice',
        description:
            'Text-to-speech for agents — pipe any generated content into a natural voice for demos, podcasts, or accessibility.',
        icon: Mic2,
        category: 'Voice',
        status: 'beta',
        href: '/roundtable',
    },
];

const CATEGORIES = ['All', ...Array.from(new Set(FEATURES.map(f => f.category)))];

export function StatusPill({ value }) {
    const cls = STATUS_STYLES[value] || 'bg-muted text-muted-foreground';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-medium ${cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${value === 'live' ? 'bg-green-500' : value === 'beta' ? 'bg-amber-500' : 'bg-muted-foreground/50'}`} />
            {STATUS_LABEL[value] || value}
        </span>
    );
}

export function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SubStatusPill({ sub }) {
    if (!sub || sub.effective_status === 'cancelled') {
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not subscribed</span>;
    }
    if (sub.effective_status === 'unpaid') {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                <AlertCircle className="w-3 h-3" /> Unpaid since {fmtDate(sub.paid_until)}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" /> Paid until {fmtDate(sub.paid_until)}
        </span>
    );
}

function FeatureCard({ feature, subs, onOpen }) {
    const Icon = feature.icon || Sparkles;
    const active = subs.filter(s => s.effective_status === 'active').length;
    const unpaid = subs.filter(s => s.effective_status === 'unpaid').length;

    return (
        <Card
            className="bg-card border overflow-hidden hover:border-primary/40 transition-colors group cursor-pointer"
            onClick={() => onOpen(feature)}
        >
            <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <StatusPill value={feature.status} />
                </div>

                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-base leading-tight">{feature.title}</h3>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                            {feature.category}
                        </span>
                    </div>
                    <p className="text-sm font-medium text-foreground/90 mb-2 leading-snug">
                        {feature.tagline}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {feature.description}
                    </p>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full tabular-nums ${active > 0 ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                            {active} subscribed
                        </span>
                        {unpaid > 0 && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full tabular-nums bg-red-500/10 text-red-600 dark:text-red-400">
                                {unpaid} unpaid
                            </span>
                        )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-primary group-hover:underline">
                        Open <ExternalLink className="w-3 h-3" />
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

export default function MarketplacePage() {
    const navigate = useNavigate();
    const [category, setCategory] = useState('All');
    const [q, setQ] = useState('');
    const [subs, setSubs] = useState([]);
    const [priceInr, setPriceInr] = useState(1000);

    useEffect(() => {
        adminApi.listFeatureSubscriptions()
            .then(r => {
                setSubs(r.items || []);
                if (r.price_inr) setPriceInr(r.price_inr);
            })
            .catch(err => toast.error(`Failed to load subscriptions: ${err.message}`));
    }, []);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return FEATURES.filter(f => {
            if (category !== 'All' && f.category !== category) return false;
            if (!s) return true;
            return (
                f.title.toLowerCase().includes(s) ||
                f.tagline.toLowerCase().includes(s) ||
                f.description.toLowerCase().includes(s) ||
                f.category.toLowerCase().includes(s)
            );
        });
    }, [category, q]);

    const liveCount   = FEATURES.filter(f => f.status === 'live').length;
    const betaCount   = FEATURES.filter(f => f.status === 'beta').length;
    const cominCount  = FEATURES.filter(f => f.status === 'coming-soon').length;

    const activeSubs  = subs.filter(s => s.effective_status === 'active');
    const unpaidSubs  = subs.filter(s => s.effective_status === 'unpaid');
    const mrrInr      = activeSubs.length * priceInr;

    return (
        <>
            <Helmet><title>Marketplace · Admin</title></Helmet>

            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-primary/10 rounded-full mb-2">
                        <Store className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] font-medium uppercase tracking-widest text-primary">Marketplace</span>
                    </div>
                    <h1 className="text-2xl font-semibold">Platform capabilities</h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        Click a capability to manage which partners subscribe to it &mdash; &#8377;{Number(priceInr).toLocaleString('en-IN')}/month each. Lapsed subscriptions disappear from the partner&#39;s site.
                    </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <div>{FEATURES.length} capabilities · {liveCount} live · {betaCount} beta{cominCount > 0 ? ` · ${cominCount} coming soon` : ''}</div>
                    <div className="mt-0.5">
                        <span className="text-green-600 dark:text-green-400 font-medium">{activeSubs.length} active subscriptions</span>
                        {unpaidSubs.length > 0 && (
                            <span className="text-red-600 dark:text-red-400"> · {unpaidSubs.length} unpaid</span>
                        )}
                    </div>
                    <div className="mt-0.5 inline-flex items-center gap-0.5 font-medium text-foreground">
                        <IndianRupee className="w-3 h-3" />{mrrInr.toLocaleString('en-IN')}/month
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        type="search"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Search capabilities…"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                    {CATEGORIES.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setCategory(c)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                category === c
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0 ? (
                <Card className="bg-card border">
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No capabilities match that filter.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(f => (
                        <FeatureCard
                            key={f.id}
                            feature={f}
                            subs={subs.filter(s => s.feature_id === f.id)}
                            onOpen={feature => navigate(`/admin/marketplace/${feature.id}`)}
                        />
                    ))}
                </div>
            )}

            <div className="mt-8 pt-6 border-t text-xs text-muted-foreground flex items-center gap-2">
                <Bot className="w-3.5 h-3.5" />
                <span>
                    Partner sites read <code className="bg-muted rounded px-1">GET /partner/:id/entitlements</code> to know which paid features to show.
                </span>
            </div>
        </>
    );
}
