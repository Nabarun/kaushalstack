
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, GitPullRequest } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo.jsx';
import NotificationBell from '@/components/NotificationBell.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useAdminAuth } from '@/contexts/AdminAuthContext.jsx';
import pb from '@/lib/pocketbaseClient';

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const location = useLocation();
  const { isAuthenticated, logout, currentUser } = useAuth();
  const { isAdminAuthenticated } = useAdminAuth();

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
    { name: 'Skills', path: '/skills' },
    { name: 'Leaderboard', path: '/leaderboard' },
    { name: 'Members', path: '/members' },
    // Growth Partner is admin-only — appended below if the admin session is active
    { name: 'Developers', path: '/developers' },
    { name: 'Contact', path: '/contact' }
  ];
  if (isAdminAuthenticated) {
    navLinks.splice(4, 0, { name: 'Growth Partner', path: '/growth-partner' });
  }

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center">
            {/* tagline=true renders the italic serif "Your AI Onboarding
                Partner" below the wordmark — see Logo.jsx for the styling. */}
            <Logo size={30} tagline />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(link.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
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
                  <Button variant="outline" size="sm">
                    {currentUser?.username || 'Profile'}
                  </Button>
                </Link>
                <Button onClick={logout} variant="outline" size="sm">
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link to="/signin">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive(link.path)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
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
