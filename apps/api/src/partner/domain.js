// Hostname rules for partner portals. Pure — no PocketBase, no Docker — so
// the portfolio test suite can import it directly; environment.js re-exports
// everything here so existing callers are unaffected.

export const PORTAL_DOMAIN_SUFFIX = process.env.PORTAL_DOMAIN_SUFFIX || 'srv1562298.hstgr.cloud';

// A registrable hostname: at least two labels, no scheme, no path, no port.
export const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function defaultPortalHost(slug) {
    return `${slug}.${PORTAL_DOMAIN_SUFFIX}`;
}

export function portalUrl(slug, customDomain) {
    return `https://${customDomain || defaultPortalHost(slug)}`;
}

// People paste "https://example.com/" straight out of a browser bar — strip
// the paste-shaped parts before validating what's left.
export function normalizeDomain(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/[/?#].*$/, '')
        .replace(/:\d+$/, '')
        .replace(/\.$/, '');
}

export function assertUsableDomain(domain) {
    if (!DOMAIN_RE.test(domain)) {
        throw Object.assign(new Error('enter a domain like royalinterior.in — no http://, path or port'), { status: 400 });
    }
    if (domain === PORTAL_DOMAIN_SUFFIX || domain.endsWith(`.${PORTAL_DOMAIN_SUFFIX}`)) {
        throw Object.assign(new Error(`${PORTAL_DOMAIN_SUFFIX} subdomains are issued automatically — use the Subdomain field instead`), { status: 400 });
    }
    if (/(^|\.)kaushalstack\.com$/.test(domain)) {
        throw Object.assign(new Error('that domain belongs to the platform'), { status: 400 });
    }
}

// Both hosts stay routable: the partner's domain is canonical, the issued
// subdomain remains a working fallback while DNS propagates (and if the domain
// ever lapses, the portal doesn't vanish with it).
export function traefikHostRule(slug, customDomain) {
    const hosts = [defaultPortalHost(slug)];
    if (customDomain) hosts.push(customDomain);
    return hosts.map(h => `Host(\`${h}\`)`).join(' || ');
}
