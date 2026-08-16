
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, GitPullRequest } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo.jsx';
import NotificationBell from '@/components/NotificationBell.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const location = useLocation();
  const { isAuthenticated, logout, currentUser } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) { setPendingCount(0); return; }
    const token = pb.authStore.token;
    fetch('/api/edits?status=pending', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPendingCount(d.total || 0); })
      .catch(() => {});
  }, [isAuthenticated, location.pathname]);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
    { name: 'Our Services', path: '/marketplace' },
    { name: 'Our Products', path: '/products' },
    { name: 'Contact', path: '/contact' }
  ];
  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-[#fffdf9]/95 backdrop-blur-xl print:hidden">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10">
        <div className="flex h-[72px] items-center justify-between">
          <Link to="/" className="flex items-center">
            <Logo size={30} tagline />
          </Link>

          <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`relative py-2 text-sm font-semibold transition-colors duration-200 after:absolute after:inset-x-0 after:-bottom-[9px] after:h-0.5 after:origin-left after:transition-transform after:duration-200 ${
                  isActive(link.path)
                    ? 'text-slate-950 after:scale-x-100 after:bg-blue-600'
                    : 'text-slate-500 after:scale-x-0 hover:text-slate-950'
                }`}
              >
                {link.name}
              </Link>
            ))}

          </nav>

          <div className="hidden md:flex items-center gap-2.5">
            {isAuthenticated ? (
              <>
                <Link to="/review">
                  <Button variant="ghost" size="sm" className="gap-1.5 relative">
                    <GitPullRequest className="w-4 h-4" />
                    Review
                    {pendingCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {pendingCount}
                      </span>
                    )}
                  </Button>
                </Link>
                <NotificationBell />
                <Link to="/profile">
                  <Button variant="outline" size="sm" className="border-slate-200 bg-white font-semibold">
                    {currentUser?.username || 'Profile'}
                  </Button>
                </Link>
                  <Button onClick={logout} variant="outline" size="sm" className="border-slate-200 bg-white font-semibold">
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link to="/signin">
                  <Button variant="outline" size="sm" className="border-slate-200 bg-white font-semibold hover:bg-slate-50">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="bg-blue-600 px-4 font-bold shadow-sm hover:bg-blue-700">Sign Up</Button>
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 py-4">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isActive(link.path)
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <div className="flex flex-col gap-2 mt-4 px-4">
                {isAuthenticated ? (
                  <>
                    <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full">
                        {currentUser?.username || 'Profile'}
                      </Button>
                    </Link>
                    <Button onClick={() => { logout(); setMobileMenuOpen(false); }} variant="outline" size="sm" className="w-full">
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/signin" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" className="w-full">Sign Up</Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
