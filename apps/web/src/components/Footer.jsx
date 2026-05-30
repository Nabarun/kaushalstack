
import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-secondary text-secondary-foreground mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <span className="text-xl font-bold">kaushalstack</span>
            <p className="mt-4 text-sm text-secondary-foreground/80 leading-relaxed max-w-prose">
              Building a free, open-source community where everyone can showcase their skills and learn from each other. Join us in creating the future of collaborative learning.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full text-xs font-medium">
              <Heart className="w-3 h-3" />
              <span>Open Source</span>
            </div>
          </div>

          <div className="md:justify-self-end">
            <span className="font-semibold text-sm">Community</span>
            <ul className="mt-4 space-y-2">
              <li>
                <Link to="/skills" className="text-sm text-secondary-foreground/80 hover:text-secondary-foreground transition-colors">
                  Browse Skills
                </Link>
              </li>
              <li>
                <Link to="/leaderboard" className="text-sm text-secondary-foreground/80 hover:text-secondary-foreground transition-colors">
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link to="/members" className="text-sm text-secondary-foreground/80 hover:text-secondary-foreground transition-colors">
                  Members
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-sm text-secondary-foreground/80 hover:text-secondary-foreground transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-secondary-foreground/80 hover:text-secondary-foreground transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/about#demo" className="text-sm text-secondary-foreground/80 hover:text-secondary-foreground transition-colors inline-flex items-center gap-1">
                  ▶ Watch demo
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-secondary-foreground/10 text-center text-sm text-secondary-foreground/60">
          <p>© 2026 kaushalstack.com. Built with passion for the community.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
