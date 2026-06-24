import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext.jsx';
import { Shield, Briefcase, LogOut } from 'lucide-react';

export default function AdminLayout() {
    const { adminUser, logout } = useAdminAuth();
    const navigate = useNavigate();

    const onLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const linkClass = ({ isActive }) =>
        `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
            isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
        }`;

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
            <aside className="w-60 border-r border-zinc-800 bg-zinc-900/40 p-4 flex flex-col print:hidden">
                <Link to="/admin/businesses" className="flex items-center gap-2 mb-6">
                    <Shield className="w-5 h-5" />
                    <span className="font-semibold">Admin</span>
                </Link>
                <nav className="flex-1 space-y-1">
                    <NavLink to="/admin/businesses" className={linkClass}>
                        <Briefcase className="w-4 h-4" /> Businesses
                    </NavLink>
                </nav>
                <div className="border-t border-zinc-800 pt-3 mt-3">
                    <div className="text-xs text-zinc-500 px-3 mb-2 truncate">{adminUser?.email || ''}</div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50"
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
