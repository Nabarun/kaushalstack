
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart } from 'lucide-react';

// Routes that own their own full-bleed canvas and shouldn't have the global
// footer competing for vertical space.
const FULL_BLEED_ROUTES = new Set(['/roundtable', '/build']);

const Footer = () => {
  const { pathname } = useLocation();
  if (FULL_BLEED_ROUTES.has(pathname)) return null;
  return (
    <footer className="mt-24 bg-[#111520] text-white print:hidden">
      <div className="max-w-7xl mx-auto px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <span className="text-xl font-bold tracking-tight">Kaushal<span className="text-orange-400">Stack</span></span>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              AI teams, focused products, and practical workflows for businesses ready to move faster.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
              <Heart className="w-3 h-3" />
              <span>Open Source</span>
            </div>
          </div>

          <div className="md:justify-self-end">
            <span className="font-semibold text-sm">Explore</span>
            <ul className="mt-4 space-y-2">
              <li>
                <Link to="/marketplace" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Our Services
                </Link>
              </li>
              <li>
                <Link to="/products" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Our Products
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-sm text-slate-400 hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/about#demo" className="inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white">
                  ▶ Watch demo
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 text-sm text-slate-500 sm:flex-row">
          <p>© 2026 kaushalstack.com. Built with passion for the community.</p>
          <Link to="/privacy" className="transition-colors hover:text-white">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
