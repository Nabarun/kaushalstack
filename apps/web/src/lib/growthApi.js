import pb from '@/lib/pocketbaseClient';

const API_BASE = import.meta.env.VITE_API_URL || '/hcgi/api';

function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (pb.authStore.isValid && pb.authStore.token) {
        h.Authorization = `Bearer ${pb.authStore.token}`;
    }
    return h;
}

async function handle(res) {
    if (!res.ok) {
        let msg = `${res.status}`;
        try { const d = await res.json(); msg = d?.error || msg; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

export const growthApi = {
    list:   ()              => fetch(`${API_BASE}/me/businesses`,       { headers: headers() }).then(handle),
    get:    (id)            => fetch(`${API_BASE}/me/businesses/${id}`, { headers: headers() }).then(handle),
    create: (data)          => fetch(`${API_BASE}/me/businesses`,       { method: 'POST',   headers: headers(), body: JSON.stringify(data) }).then(handle),
    update: (id, data)      => fetch(`${API_BASE}/me/businesses/${id}`, { method: 'PATCH',  headers: headers(), body: JSON.stringify(data) }).then(handle),
    remove: (id)            => fetch(`${API_BASE}/me/businesses/${id}`, { method: 'DELETE', headers: headers() }).then(handle),
    runNow: (id)            => fetch(`${API_BASE}/me/businesses/${id}/run`, { method: 'POST', headers: headers() }).then(handle),
    reports:(businessId)    => fetch(`${API_BASE}/me/businesses/${businessId}/reports`, { headers: headers() }).then(handle),
    report: (id)            => fetch(`${API_BASE}/me/reports/${id}`,    { headers: headers() }).then(handle),
    agents: ()              => fetch(`${API_BASE}/me/agents`,           { headers: headers() }).then(handle),
};
