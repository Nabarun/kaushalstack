import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext.jsx';
import { Shield, Briefcase, GitPullRequest, LogOut, FileText, Users, Store } from 'lucide-react';

export default function AdminLayout() {
    const { adminUser, logout } = useAdminAuth();
    const navigate = useNavigate();

    const onLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const linkClass = ({ isActive }) =>
        `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
            isActive ? 'bg-accent text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        }`;

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <aside className="w-60 border-r border bg-card p-4 flex flex-col print:hidden">
                <Link to="/admin/businesses" className="flex items-center gap-2 mb-6">
                    <Shield className="w-5 h-5" />
                    <span className="font-semibold">Admin</span>
                </Link>
                <nav className="flex-1 space-y-1">
                    <NavLink to="/admin/businesses" className={linkClass}>
                        <Briefcase className="w-4 h-4" /> Businesses
                    </NavLink>
                    <NavLink to="/admin/teams" className={linkClass}>
                        <Users className="w-4 h-4" /> Teams
                    </NavLink>
                    <NavLink to="/admin/marketplace" className={linkClass}>
                        <Store className="w-4 h-4" /> Marketplace
                    </NavLink>
                    <NavLink to="/admin/reviews" className={linkClass}>
                        <GitPullRequest className="w-4 h-4" /> Reviews
                    </NavLink>
                    <NavLink to="/admin/blog" className={linkClass}>
                        <FileText className="w-4 h-4" /> Blog
                    </NavLink>
                </nav>
                <div className="border-t border pt-3 mt-3">
                    <div className="text-xs text-muted-foreground px-3 mb-2 truncate">{adminUser?.email || ''}</div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    >
                        <LogOut className="w-4 h-4" /> Sign out
                    </button>
                </div>
            </aside>
            <main className="flex-1 p-6 overflow-x-hidden">
                <Outlet />
            </main>
        </div>
    );
}
