// Shared formatters for the admin console.

export function fmt$(n) {
    return `$${Number(n || 0).toFixed(Number(n) >= 100 ? 0 : 2)}`;
}

export function fmtN(n) {
    return Number(n || 0).toLocaleString();
}

export function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
}

export function fmtRelative(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return d.toLocaleDateString();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

export function initials(name) {
    if (!name) return '?';
    return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
