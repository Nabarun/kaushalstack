import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import Logo from '@/components/Logo.jsx';
import pb from '@/lib/pocketbaseClient';

const MIN_PWD_LENGTH = 8;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // PocketBase reset emails may pass the token as ?token=... or in the hash
  const tokenFromQuery = params.get('token');
  const tokenFromHash  = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.replace(/^#\/?/, '').split('?')[1] || '').get('token')
    : null;
  const token = tokenFromQuery || tokenFromHash;

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token. Please request a new reset link.');
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < MIN_PWD_LENGTH) {
      setError(`Password must be at least ${MIN_PWD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await pb.collection('users').confirmPasswordReset(token, password, confirm);
      setDone(true);
      toast.success('Password reset — please sign in');
      setTimeout(() => navigate('/signin'), 1800);
    } catch (err) {
      setError(err?.response?.data?.token?.message || err?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Reset Password - kaushalstack</title>
      </Helmet>

      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-muted/30 to-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Logo size={28} />
            </div>
            <CardTitle className="text-2xl">
              {done ? 'All set!' : 'Set a new password'}
            </CardTitle>
            <CardDescription>
              {done
                ? 'Redirecting you to sign in…'
                : 'Choose a strong password you haven\'t used before.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {done ? (
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Your password has been updated. You can now sign in with the new one.
                </p>
              </div>
            ) : !token ? (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground">
                  This reset link is invalid or has expired.
                </p>
                <Link to="/signin">
                  <Button variant="outline" className="w-full">Back to sign in</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={MIN_PWD_LENGTH}
                    className="text-gray-900 dark:text-gray-100"
                    placeholder={`At least ${MIN_PWD_LENGTH} characters`}
                  />
                </div>

                <div>
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    minLength={MIN_PWD_LENGTH}
                    className="text-gray-900 dark:text-gray-100"
                    placeholder="Re-enter your password"
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating…' : 'Update Password'}
                </Button>

                <div className="text-center text-sm">
                  <Link to="/signin" className="text-muted-foreground hover:text-foreground">
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
