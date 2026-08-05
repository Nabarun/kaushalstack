import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Wand2, Globe, Users, Search, Bot, Sofa, Cog, AudioLines, Mic2, ArrowRight,
} from 'lucide-react';

// Public services catalog — deliberately generic: what we do per section,
// no client names, no pricing, no internals. The admin marketplace holds
// the specifics.
const SECTIONS = [
    {
        title: 'Content & Social',
        icon: Wand2,
        services: [
            'AI-assisted social creatives — design, remix and caption brand-ready posts',
            'Export for every platform, from image cards to short video',
        ],
    },
    {
        title: 'Websites',
        icon: Globe,
        services: [
            'Mockup to production website, designed and shipped end to end',
            'Hosting, domains and deployment handled for you',
        ],
    },
    {
        title: 'AI Teams',
        icon: Users,
        services: [
            'A dedicated team of AI specialists curated for your business',
            'Round-table discussions that turn ideas into concrete specs',
        ],
    },
    {
        title: 'Business Intelligence',
        icon: Search,
        services: [
            'Deep research built from your own links, documents and assets',
            'Live web research with cited findings on demand',
        ],
    },
    {
        title: 'Self-Learning Agents',
        icon: Bot,
        services: [
            'Agents that learn your business conversation by conversation',
            'Every approved lesson makes the next answer sharper',
        ],
    },
    {
        title: 'Design & Visualisation',
        icon: Sofa,
        services: [
            '2D concepts: moodboards, palettes and layout plans',
            'Photoreal 3D visualisations of spaces and interiors',
        ],
    },
    {
        title: 'Engineering Services',
        icon: Cog,
        services: [
            'Technical drawings read, validated and cross-checked by AI',
            'Manufacturing-ready specification sheets and tool drawings',
        ],
    },
    {
        title: 'Productivity & Voice',
        icon: AudioLines,
        services: [
            'Meeting recordings turned into clean, structured minutes — in your language',
            'Natural text-to-speech for content, demos and accessibility',
        ],
    },
];

export default function PublicMarketplacePage() {
    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <Helmet><title>Marketplace — KaushalStack</title></Helmet>

            <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-3xl sm:text-4xl font-bold mb-4">What we build for businesses</h1>
                <p className="text-muted-foreground">
                    KaushalStack pairs your business with AI specialists and ready-to-run tools —
                    from content and websites to design, engineering and intelligence.
                    Every service below is available as a managed, subscription-based offering.
                </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
                {SECTIONS.map(({ title, icon: Icon, services }) => (
                    <Card key={title} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-5">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                                <Icon className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="font-semibold mb-2">{title}</h2>
                            <ul className="space-y-1.5">
                                {services.map(s => (
                                    <li key={s} className="text-sm text-muted-foreground leading-snug">{s}</li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="text-center rounded-2xl border bg-card p-10">
                <Mic2 className="w-8 h-8 mx-auto mb-3 text-primary" />
                <h2 className="text-xl font-semibold mb-2">Tell us what your business needs</h2>
                <p className="text-muted-foreground max-w-xl mx-auto mb-6">
                    Every engagement starts with a conversation — we scope the right mix of tools
                    and specialists for your goals, and you subscribe only to what you use.
                </p>
                <Link to="/contact">
                    <Button size="lg" className="gap-2">
                        Talk to us <ArrowRight className="w-4 h-4" />
                    </Button>
                </Link>
            </div>
        </div>
    );
}
