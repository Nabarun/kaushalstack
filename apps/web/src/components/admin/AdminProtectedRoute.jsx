import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext.jsx';

export default function AdminProtectedRoute({ children }) {
    const { isAdminAuthenticated } = useAdminAuth();
    const location = useLocation();
    if (!isAdminAuthenticated) {
        return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
    }
    return children;
}
