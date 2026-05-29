import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { toast } from 'sonner';
import { ArrowLeft, Mail } from 'lucide-react';
import Logo from '@/components/Logo.jsx';
import pb from '@/lib/pocketbaseClient';

const SigninPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [mode, setMode]       = useState('signin'); // 'signin' | 'forgot'
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [resetEmail, setResetEmail] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(formData.email, formData.password);
    if (result.success) {
      toast.success('Signed in successfully');
      navigate('/');
    } else {
      toast.error(result.error || 'Invalid credentials');
    }
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setLoading(true);
    try {
      await pb.collection('users').requestPasswordReset(resetEmail.trim());
      setSent(true);
    } catch (err) {
      // PocketBase returns success even for unknown emails (security), but show generic error on network failure
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Sign In - kaushalstack</title>
        <meta name="description" content="Sign in to your kaushalstack account." />
      </Helmet>

      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-muted/30 to-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Logo size={28} />
            </div>

            {mode === 'signin' ? (
              <>
                <CardTitle className="text-2xl">Welcome back</CardTitle>
                <CardDescription>Sign in to your account to continue</CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl">Reset password</CardTitle>
                <CardDescription>We'll send a reset link to your email</CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent>
            {/* ── Sign In ── */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="text-gray-900 dark:text-gray-100"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setResetEmail(formData.email); setSent(false); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="text-gray-900 dark:text-gray-100"
                    placeholder="Enter your password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </Button>
              </form>
            )}

            {/* ── Forgot Password ── */}
            {mode === 'forgot' && !sent && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label htmlFor="reset-email">Email address</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    autoFocus
                    className="text-gray-900 dark:text-gray-100"
                    placeholder="you@example.com"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </Button>

                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </form>
            )}

            {/* ── Sent confirmation ── */}
            {mode === 'forgot' && sent && (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold mb-1">Check your inbox</p>
                  <p className="text-sm text-muted-foreground">
                    If <span className="font-medium">{resetEmail}</span> is registered, you'll receive a reset link shortly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setSent(false); }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </div>
            )}

            {mode === 'signin' && (
              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link to="/signup" className="text-primary hover:underline font-medium">
                  Sign up
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default SigninPage;
