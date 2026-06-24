import React, { createContext, useContext, useEffect, useState } from 'react';
import Pocketbase from 'pocketbase';

const POCKETBASE_API_URL = import.meta.env.VITE_POCKETBASE_URL || '/pb';

// Separate PocketBase client + authStore so the admin session is isolated
// from the regular user session. Persisted in its own localStorage key.
const adminPb = new Pocketbase(POCKETBASE_API_URL);
const STORAGE_KEY = 'pb_admin_auth';

function loadAuth() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.token && parsed?.model) {
            adminPb.authStore.save(parsed.token, parsed.model);
        }
    } catch {}
}
loadAuth();
adminPb.authStore.onChange(() => {
    try {
        if (adminPb.authStore.isValid) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                token: adminPb.authStore.token,
                model: adminPb.authStore.model,
            }));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {}
});

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
    const [adminUser, setAdminUser] = useState(adminPb.authStore.model);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(
        adminPb.authStore.isValid && !!adminPb.authStore.model?.is_admin
    );
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = adminPb.authStore.onChange((token, model) => {
            setAdminUser(model);
            setIsAdminAuthenticated(adminPb.authStore.isValid && !!model?.is_admin);
        });
        return () => unsub();
    }, []);

    const login = async (email, password) => {
        setLoading(true);
        try {
            const authData = await adminPb.collection('users').authWithPassword(email, password, { $autoCancel: false });
            if (!authData?.record?.is_admin) {
                adminPb.authStore.clear();
                return { success: false, error: 'This account is not an admin.' };
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || 'Sign-in failed' };
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        adminPb.authStore.clear();
    };

    const authHeader = () => {
        return adminPb.authStore.isValid ? { Authorization: `Bearer ${adminPb.authStore.token}` } : {};
    };

    return (
        <AdminAuthContext.Provider value={{ adminUser, isAdminAuthenticated, loading, login, logout, authHeader, adminPb }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = () => {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error('useAdminAuth must be inside AdminAuthProvider');
    return ctx;
};

export { adminPb };
