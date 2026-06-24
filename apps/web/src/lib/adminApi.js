import { adminPb } from '@/contexts/AdminAuthContext.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (adminPb.authStore.isValid && adminPb.authStore.token) {
        h.Authorization = `Bearer ${adminPb.authStore.token}`;
    }
    return h;
}

async function handle(res) {
    if (!res.ok) {
        let msg = `${res.status}`;
        try {
            const data = await res.json();
            msg = data?.error || msg;
        } catch {}
        throw new Error(msg);
    }
    return res.json();
}

export const adminApi = {
    listBusinesses() {
        return fetch(`${API_BASE}/admin/businesses`, { headers: headers() }).then(handle);
    },
    getBusiness(id) {
        return fetch(`${API_BASE}/admin/businesses/${id}`, { headers: headers() }).then(handle);
    },
    createBusiness(data) {
        return fetch(`${API_BASE}/admin/businesses`, {
            method: 'POST', headers: headers(), body: JSON.stringify(data),
        }).then(handle);
    },
    updateBusiness(id, data) {
        return fetch(`${API_BASE}/admin/businesses/${id}`, {
            method: 'PATCH', headers: headers(), body: JSON.stringify(data),
        }).then(handle);
    },
    deleteBusiness(id) {
        return fetch(`${API_BASE}/admin/businesses/${id}`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },
    listAgents() {
        return fetch(`${API_BASE}/admin/agents`, { headers: headers() }).then(handle);
    },
    listReports(businessId) {
        return fetch(`${API_BASE}/admin/businesses/${businessId}/reports`, { headers: headers() }).then(handle);
    },
    team(businessId) {
        return fetch(`${API_BASE}/admin/businesses/${businessId}/team`, { headers: headers() }).then(handle);
    },
    getReport(id) {
        return fetch(`${API_BASE}/admin/reports/${id}`, { headers: headers() }).then(handle);
    },
    runNow(businessId) {
        return fetch(`${API_BASE}/admin/businesses/${businessId}/run`, {
            method: 'POST', headers: headers(),
        }).then(handle);
    },
};
