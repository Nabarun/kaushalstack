import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAuth } from '@/contexts/AdminAuthContext.jsx';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';

export default function AdminLoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAdminAuthenticated } = useAdminAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (isAdminAuthenticated) {
        const to = location.state?.from || '/admin/businesses';
        return <Navigate to={to} replace />;
    }

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const r = await login(email, password);
        setSubmitting(false);
        if (r.success) {
            toast.success('Welcome, admin');
            navigate(location.state?.from || '/admin/businesses');
        } else {
            toast.error(r.error || 'Sign-in failed');
        }
    };

    return (
        <>
            <Helmet><title>Admin Sign-In · KaushalStack</title></Helmet>
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
                <Card className="w-full max-w-md bg-card border">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-accent flex items-center justify-center mb-2">
                            <Shield className="w-6 h-6 text-foreground" />
                        </div>
                        <CardTitle className="text-2xl">Admin Console</CardTitle>
                        <CardDescription className="text-muted-foreground">Restricted area · admin accounts only</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-4">
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="bg-background border text-foreground" />
                            </div>
                            <div>
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="bg-background border text-foreground" />
                            </div>
                            <Button type="submit" className="w-full" disabled={submitting}>
                                {submitting ? 'Signing in…' : 'Sign in'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
