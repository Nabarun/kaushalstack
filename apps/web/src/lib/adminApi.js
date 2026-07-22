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

    // Attached private skills (admin-uploaded SKILL.md files that run as
    // additional analysis layers on top of the competitor scan).
    listBusinessSkills(businessId) {
        return fetch(`${API_BASE}/admin/businesses/${businessId}/skills`, { headers: headers() }).then(handle);
    },
    // Multipart upload: name (text) + file (the .md). Does NOT use the JSON
    // Content-Type header; let the browser set the multipart boundary.
    uploadBusinessSkill(businessId, name, file) {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('file', file);
        const h = {};
        if (adminPb.authStore.isValid && adminPb.authStore.token) {
            h.Authorization = `Bearer ${adminPb.authStore.token}`;
        }
        return fetch(`${API_BASE}/admin/businesses/${businessId}/skills`, {
            method: 'POST', headers: h, body: fd,
        }).then(handle);
    },
    deleteBusinessSkill(businessId, skillId) {
        return fetch(`${API_BASE}/admin/businesses/${businessId}/skills/${skillId}`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },

    getPartnerStats(range = 'mtd') {
        return fetch(`${API_BASE}/admin/partner-stats?range=${range}`, { headers: headers() }).then(handle);
    },
    listPartners() {
        return fetch(`${API_BASE}/admin/partners`, { headers: headers() }).then(handle);
    },
    createPartner(data) {
        return fetch(`${API_BASE}/admin/partners`, {
            method: 'POST', headers: headers(), body: JSON.stringify(data),
        }).then(handle);
    },
    getPartnerCredits(id) {
        return fetch(`${API_BASE}/admin/partners/${id}/credits`, { headers: headers() }).then(handle);
    },
    grantPartnerTokens(id, tokens, note) {
        return fetch(`${API_BASE}/admin/partners/${id}/credits`, {
            method: 'POST', headers: headers(), body: JSON.stringify({ tokens, note }),
        }).then(handle);
    },
    revokePartnerGrant(partnerId, grantId) {
        return fetch(`${API_BASE}/admin/partners/${partnerId}/credits/${grantId}`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },
    deletePartner(id) {
        return fetch(`${API_BASE}/admin/partners/${id}`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },
    getRoundtableStats(range = 'mtd') {
        return fetch(`${API_BASE}/admin/roundtable-stats?range=${range}`, { headers: headers() }).then(handle);
    },
    listEnvironments() {
        return fetch(`${API_BASE}/admin/environments`, { headers: headers() }).then(handle);
    },
    createEnvironment(partnerId, data) {
        return fetch(`${API_BASE}/admin/partners/${partnerId}/environment`, {
            method: 'POST', headers: headers(), body: JSON.stringify(data),
        }).then(handle);
    },
    resetEnvironmentPassword(partnerId, adminPass) {
        return fetch(`${API_BASE}/admin/partners/${partnerId}/environment/reset-password`, {
            method: 'POST', headers: headers(), body: JSON.stringify({ admin_pass: adminPass }),
        }).then(handle);
    },
    deleteEnvironment(partnerId) {
        return fetch(`${API_BASE}/admin/partners/${partnerId}/environment`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },
    listWorkspaces() {
        return fetch(`${API_BASE}/admin/workspaces`, { headers: headers() }).then(handle);
    },
    deleteWorkspace(id) {
        return fetch(`${API_BASE}/admin/workspaces/${id}`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },
    listFeatureSubscriptions() {
        return fetch(`${API_BASE}/admin/marketplace/subscriptions`, { headers: headers() }).then(handle);
    },
    subscribeFeature(partnerId, featureId) {
        return fetch(`${API_BASE}/admin/marketplace/subscriptions`, {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ partner_id: partnerId, feature_id: featureId }),
        }).then(handle);
    },
    markSubscriptionPaid(id) {
        return fetch(`${API_BASE}/admin/marketplace/subscriptions/${id}/mark-paid`, {
            method: 'POST', headers: headers(),
        }).then(handle);
    },
    cancelSubscription(id) {
        return fetch(`${API_BASE}/admin/marketplace/subscriptions/${id}/cancel`, {
            method: 'POST', headers: headers(),
        }).then(handle);
    },
    listEdits(status = 'pending') {
        return fetch(`${API_BASE}/admin/edits?status=${encodeURIComponent(status)}`, { headers: headers() }).then(handle);
    },
    deleteEdit(id) {
        return fetch(`${API_BASE}/admin/edits/${id}`, { method: 'DELETE', headers: headers() }).then(handle);
    },
};
