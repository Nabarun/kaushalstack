import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Layers3, Sparkles } from 'lucide-react';

const PRODUCTS = [
  {
    name: 'Marketing Studio',
    eyebrow: 'Campaign creation workspace',
    description: 'A hands-on studio for shaping the visual, message and platform-ready versions of a campaign in one focused workflow.',
    points: ['Media and brand kit in one workspace', 'Design, copy variants and export handoff', 'Built for practical campaign momentum'],
    image: '/marketing-studio-thumbnail.png',
    tone: 'marketing',
  },
  {
    name: 'Interior Visualizer',
    eyebrow: 'Design presentation toolkit',
    description: 'Turn an early floor plan or site photo into options that are easy for clients to see, compare and approve.',
    points: ['Moodboards, palettes and layout thinking', 'Photoreal room renders and walkthrough stills', 'A clearer path to design sign-off'],
    tone: 'interior',
  },
];

export default function ProductsPage() {
  return (
    <div className="bg-white text-slate-950">
      <Helmet>
        <title>Our Products — KaushalStack</title>
        <meta name="description" content="Explore KaushalStack products for marketing creation and interior visualisation." />
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
        <div className="grid gap-8 lg:gap-14">
          {PRODUCTS.map((product, index) => (
            <article key={product.name} className={`grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_15px_50px_rgba(15,23,42,.07)] lg:grid-cols-2 ${index % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <div className={`relative min-h-[300px] overflow-hidden ${product.tone === 'interior' ? 'bg-[#2a211d]' : 'bg-slate-100'}`}>
                {product.image ? (
                  <img src={product.image} alt="Marketing Studio workspace" className="h-full w-full object-cover object-center transition duration-700 hover:scale-[1.025]" />
                ) : (
                  <>
                    <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(120deg,rgba(255,184,108,.45),transparent_45%),radial-gradient(circle_at_74%_25%,rgba(250,235,200,.55),transparent_30%)]" />
                    <div className="absolute inset-x-[13%] bottom-[10%] top-[18%] rounded-t-[7rem] border border-white/30 bg-[linear-gradient(135deg,#c28d65,#5f3e2d)] shadow-2xl" />
                    <div className="absolute bottom-[13%] left-[20%] h-[22%] w-[30%] rounded-t-[4rem] bg-[#d8b997]/80 shadow-xl" />
                    <div className="absolute right-[17%] top-[22%] flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur"><Layers3 className="h-6 w-6" /></div>
                  </>
                )}
                <div className="absolute inset-x-5 bottom-5 rounded-xl border border-white/25 bg-slate-950/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur">{product.name}</div>
              </div>
              <div className="flex flex-col p-7 sm:p-10 lg:p-12">
                <p className="text-xs font-bold tracking-[.16em] text-blue-600 uppercase">{product.eyebrow}</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.05em]">{product.name}</h2>
                <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">{product.description}</p>
                <ul className="mt-8 space-y-3 text-sm text-slate-600">{product.points.map(point => <li key={point} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{point}</li>)}</ul>
                <Link to="/contact" className="mt-10 inline-flex w-fit items-center gap-2 text-sm font-bold text-slate-950 transition hover:text-blue-600">Talk to us about {product.name} <ArrowRight className="h-4 w-4" /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28"><div className="mx-auto flex max-w-7xl flex-col gap-7 rounded-3xl bg-blue-50 p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between"><div><p className="flex items-center gap-2 text-sm font-bold text-blue-700"><Sparkles className="h-4 w-4" /> Built to work with your team</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em]">Need a product around another workflow?</h2></div><Link to="/contact" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">Start a conversation <ArrowRight className="h-4 w-4" /></Link></div></section>
    </div>
  );
}
