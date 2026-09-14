import { adminPb } from '@/contexts/AdminAuthContext.jsx';

// Admin → Designer tab. Same auth pattern as adminApi.js, kept in its own
// module so the Designer surface can grow without touching the shared file.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (adminPb.authStore.isValid && adminPb.authStore.token) {
        h.Authorization = `Bearer ${adminPb.authStore.token}`;
    }
    return h;
}

async function handle(res) {
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data?.error || `${res.status}`);
    return data;
}

export function platformApi(product) {
  return {
    list() {
        return fetch(`${API_BASE}/admin/${product}/workspaces`, { headers: headers() }).then(handle);
    },
    get(slug) {
        return fetch(`${API_BASE}/admin/${product}/workspaces/${slug}`, { headers: headers() }).then(handle);
    },
    act(slug, action, extra = {}) {
        const body = typeof extra === 'string' ? { reason: extra } : extra;
        return fetch(`${API_BASE}/admin/${product}/workspaces/${slug}/actions`, {
            method: 'POST', headers: headers(), body: JSON.stringify({ action, ...body }),
        }).then(handle);
    },
    async download(slug) {
        const res = await fetch(`${API_BASE}/admin/${product}/workspaces/${slug}/export`, { headers: headers() });
        if (!res.ok) {
            let msg = `${res.status}`;
            try { msg = (await res.json()).error || msg; } catch {}
            throw new Error(msg);
        }
        const blob = await res.blob();
        const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || `designer-${slug}.tar.gz`;
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return name;
    },
    remove(slug, confirm) {
        return fetch(`${API_BASE}/admin/${product}/workspaces/${slug}?confirm=${encodeURIComponent(confirm)}`, {
            method: 'DELETE', headers: headers(),
        }).then(handle);
    },
  };
}
export const designerApi = platformApi('designer');
export const connectionsApi = platformApi('connections');
