import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Layers3, Sparkles } from 'lucide-react';
import DemoVideoCard from '@/components/DemoVideoCard';

// Products are grouped into categories on the page; order here is display order.
const CATEGORIES = [
  { key: 'operations', label: 'Operations', blurb: 'Run the business day to day.' },
  { key: 'marketing', label: 'Marketing', blurb: 'Make and ship the campaign.' },
  { key: 'design', label: 'Design', blurb: 'Show the work before it is built.' },
  { key: 'commerce', label: 'Commerce', blurb: 'Sell online without a developer.' },
  { key: 'connections', label: 'Connections', blurb: 'Turn the relationships you already have into a searchable network.' },
];

const PRODUCTS = [
  {
    category: 'operations',
    name: 'Payroll',
    eyebrow: 'Payroll & HR for multi-outlet businesses',
    description: 'Monthly payroll for restaurants, retail chains, clinics and salons: day-rate and salaried staff across every branch, salary slips and HR letters, encrypted bank and identity data, outlet-manager access. Sign up, pay online, run payroll the same afternoon.',
    points: ['₹2,000 a month or ₹20,000 a year, plus GST', 'Slips, appointment, experience and warning letters on your letterhead', 'ESI, PF, advances, month locking, audit trail, analytics'],
    image: '/payroll-thumbnail.png',
    tone: 'payroll',
    href: 'https://payroll.kaushalstack.com',
    cta: 'See plans and sign up',
  },
  {
    category: 'marketing',
    name: 'Marketing Studio',
    eyebrow: 'Campaign creation workspace',
    description: 'A hands-on studio for shaping the visual, message and platform-ready versions of a campaign in one focused workflow.',
    points: ['Media and brand kit in one workspace', 'Design, copy variants and export handoff', 'Built for practical campaign momentum'],
    image: '/marketing-studio-thumbnail.png',
    tone: 'marketing',
    cta: 'See plans and sign up',
  },
  {
    category: 'design',
    name: 'Interior Visualizer',
    eyebrow: 'Design presentation toolkit',
    points: ['Moodboards, palettes and layout thinking', 'Photoreal room renders and walkthrough stills', 'A clearer path to design sign-off'],
    video: '/interior-visualizer-demo.mp4',
    videoPoster: '/interior-visualizer-demo-poster.jpg',
    videoDuration: '3 min',
    tone: 'interior',
    cta: 'See plans and sign up',
  },
  {
    category: 'commerce',
    name: 'KaushalStack E-commerce',
    eyebrow: 'Storefront and order desk',
    description: 'A complete shop for a business that already sells — catalogue, enquiries and orders in one place, with the owner in control of everything a customer sees.',
    points: ['Owner-editable catalogue that publishes instantly', 'Orders tracked from enquiry through to delivery', 'A shop the owner runs without a developer'],
    video: '/ecommerce-demo.mp4',
    videoPoster: '/ecommerce-demo-poster.jpg',
    videoDuration: '2 min',
    tone: 'ecommerce',
  },
  {
    category: 'connections',
    name: 'WhatsApp Contact Organizer',
    eyebrow: 'Connections · relationship intelligence',
    description: 'Link a WhatsApp account as a read-only device and every contact, group and conversation becomes a searchable relationship map: who you actually know, how well, what they talk about, and who can introduce you. Nothing is ever sent from your account.',
    points: ['Lead finder ranks people on relevance × relationship strength, with the evidence', 'Warm-intro paths through the groups you share', 'Starter ₹999, Growth ₹2,999, Advanced ₹6,999 a month plus GST; 30 days free'],
    tone: 'connections',
    href: 'https://connections.kaushalstack.com',
    cta: 'See plans and sign up',
  },
];

export default function ProductsPage() {
  return (
    <div className="bg-white text-slate-950">
      <Helmet>
        <title>Our Products — KaushalStack</title>
        <meta name="description" content="Explore KaushalStack products by category: operations, marketing, design, commerce and connections — payroll, campaign studio, interior visualisation, e-commerce and the WhatsApp contact organizer." />
      </Helmet>

      <section className="relative overflow-hidden bg-[#071b3a] px-5 py-20 text-white sm:px-8 lg:px-10 lg:py-28">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-400/25 blur-3xl" />
        <div className="relative mx-auto max-w-7xl">
          <p className="text-xs font-bold tracking-[.18em] text-blue-200 uppercase">Our products</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[.96] tracking-[-.06em] sm:text-6xl">Focused tools for the work that needs to look—and feel—finished.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300">Each product gives a real workflow its own thoughtfully-designed space, while still connecting to the wider KaushalStack team.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="grid gap-14 lg:gap-20">
          {CATEGORIES.map((cat) => {
            const items = PRODUCTS.filter((p) => p.category === cat.key);
            if (!items.length) return null;
            return (
              <div key={cat.key} className="grid gap-8 lg:gap-12">
                <div className="border-b border-slate-200 pb-4">
                  <p className="text-xs font-bold tracking-[.18em] text-blue-600 uppercase">{cat.label}</p>
                  <p className="mt-1 text-slate-600">{cat.blurb}</p>
                </div>
                {items.map((product, index) => (
            <article key={product.name} className={`grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_15px_50px_rgba(15,23,42,.07)] lg:grid-cols-2 ${index % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <div className={`relative min-h-[300px] overflow-hidden ${product.tone === 'interior' ? 'bg-[#2a211d]' : 'bg-slate-100'}`}>
                {product.video ? (
                  <DemoVideoCard
                    src={product.video}
                    poster={product.videoPoster}
                    duration={product.videoDuration}
                    aspect="h-full"
                    className="rounded-none border-0 shadow-none"
                  />
                ) : product.image ? (
                  <img src={product.image} alt={`${product.name} workspace`} className="h-full w-full object-cover object-top transition duration-700 hover:scale-[1.025]" />
                ) : product.tone === 'connections' ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg viewBox="0 0 320 240" className="h-full w-full max-h-[320px]" aria-hidden="true">
                      {[[160,120,0],[70,60,1],[250,70,1],[60,180,1],[240,190,1],[160,40,2],[300,130,2],[30,120,2],[160,210,2]].map(([x,y,r],i)=>(
                        <g key={i}><line x1="160" y1="120" x2={x} y2={y} stroke="#3987e5" strokeOpacity={r===0?0:r===1?.55:.25} strokeWidth="1.2" /><circle cx={x} cy={y} r={r===0?11:r===1?7:5} fill={r===0?'#3987e5':'#0d1117'} stroke="#3987e5" strokeOpacity={r===0?1:.7} strokeWidth="1.4" /></g>
                      ))}
                    </svg>
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(120deg,rgba(255,184,108,.45),transparent_45%),radial-gradient(circle_at_74%_25%,rgba(250,235,200,.55),transparent_30%)]" />
                    <div className="absolute inset-x-[13%] bottom-[10%] top-[18%] rounded-t-[7rem] border border-white/30 bg-[linear-gradient(135deg,#c28d65,#5f3e2d)] shadow-2xl" />
                    <div className="absolute bottom-[13%] left-[20%] h-[22%] w-[30%] rounded-t-[4rem] bg-[#d8b997]/80 shadow-xl" />
                    <div className="absolute right-[17%] top-[22%] flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur"><Layers3 className="h-6 w-6" /></div>
                  </>
                )}
              </div>
              <div className="flex flex-col p-7 sm:p-10 lg:p-12">
                <p className="text-xs font-bold tracking-[.16em] text-blue-600 uppercase">{product.eyebrow}</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.05em]">{product.name}</h2>
                {product.description && (
                  <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">{product.description}</p>
                )}
                <ul className="mt-8 space-y-3 text-sm text-slate-600">{product.points.map(point => <li key={point} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{point}</li>)}</ul>
                {product.href ? (
                  <a href={product.href} target="_blank" rel="noopener noreferrer" className="mt-10 inline-flex w-fit items-center gap-2 text-sm font-bold text-slate-950 transition hover:text-blue-600">{product.cta || `Open ${product.name}`} <ArrowRight className="h-4 w-4" /></a>
                ) : (
                  <Link to="/contact" className="mt-10 inline-flex w-fit items-center gap-2 text-sm font-bold text-slate-950 transition hover:text-blue-600">Talk to us about {product.name} <ArrowRight className="h-4 w-4" /></Link>
                )}
              </div>
            </article>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28"><div className="mx-auto flex max-w-7xl flex-col gap-7 rounded-3xl bg-blue-50 p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between"><div><p className="flex items-center gap-2 text-sm font-bold text-blue-700"><Sparkles className="h-4 w-4" /> Built to work with your team</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em]">Need a product around another workflow?</h2></div><Link to="/contact" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">Start a conversation <ArrowRight className="h-4 w-4" /></Link></div></section>
    </div>
  );
}
