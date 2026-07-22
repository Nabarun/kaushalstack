// Partner portal environment provisioning. Creates one `studio-portal`
// container per partner on the same VPS, routed by Traefik via labels —
// exactly the mrnmr/ConsciousConnections pattern, minus the per-partner repo.
//
// The api needs /var/run/docker.sock mounted (prod compose override) and the
// nabarun1/studio-portal:latest image present on the host.

import crypto from 'node:crypto';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { dockerAvailable, dockerRequest } from '../utils/dockerEngine.js';
import { hashApiToken, API_TOKEN_PREFIX } from '../utils/auth.js';
import { TARA_SKILL_ID } from '../builder/creative-registry.js';
import { ensurePartnerCollections } from './collections.js';

const PORTAL_IMAGE = process.env.PORTAL_IMAGE || 'nabarun1/studio-portal:latest';
const PORTAL_DOMAIN_SUFFIX = process.env.PORTAL_DOMAIN_SUFFIX || 'srv1562298.hstgr.cloud';
const KS_ORIGIN = process.env.PORTAL_KS_ORIGIN || 'https://kaushalstack.com';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const esc = (s) => String(s || '').replace(/"/g, '\\"');

export function portalUrl(slug) {
    return `https://${slug}.${PORTAL_DOMAIN_SUFFIX}`;
}

// Origins of running environments — studio/sitebuilder frame-ancestors pull
// from here so a freshly provisioned portal can embed Studio without an api
// restart. 60s cache keeps it out of the hot path.
let originsCache = { at: 0, list: [] };
export async function environmentOrigins() {
    if (Date.now() - originsCache.at < 60000) return originsCache.list;
    try {
        await ensurePartnerCollections();
        const envs = await pb.collection('partner_environments').getFullList({
            filter: 'status = "running"',
            fields: 'url',
        });
        originsCache = { at: Date.now(), list: envs.map(e => e.url).filter(Boolean) };
    } catch {
        originsCache = { at: Date.now(), list: originsCache.list };
    }
    return originsCache.list;
}
export function invalidateOriginsCache() { originsCache = { at: 0, list: [] }; }

// Combined static (env) + dynamic (provisioned portals) frame-ancestors list
// for Studio / Site Builder / preview CSP headers. Dynamic means a freshly
// created environment can embed Studio with no api restart.
const STATIC_ANCESTORS = ["'self'", ...String(process.env.STUDIO_FRAME_ANCESTORS || 'https://mrnmr.srv1562298.hstgr.cloud')
    .split(',').map((s) => s.trim()).filter(Boolean)];

export async function frameAncestors() {
    const dynamic = await environmentOrigins();
    return Array.from(new Set([...STATIC_ANCESTORS, ...dynamic]));
}

export async function getEnvironment(partnerId) {
    try {
        await ensurePartnerCollections();
        const r = await pb.collection('partner_environments').getList(1, 1, {
            filter: `partner_id = "${esc(partnerId)}" && status != "removed"`,
            sort: '-created',
        });
        return r.items[0] || null;
    } catch {
        return null;
    }
}

export async function slugTaken(slug) {
    try {
        const r = await pb.collection('partner_environments').getList(1, 1, {
            filter: `slug = "${esc(slug)}" && status != "removed"`,
        });
        return !!r.items[0];
    } catch {
        return false;
    }
}

export async function provisionEnvironment({ partner, slug, portalName, adminUser, adminPass, sessionId, addedBy }) {
    if (!SLUG_RE.test(slug)) throw Object.assign(new Error('slug must be 3-30 chars: a-z, 0-9, hyphens'), { status: 400 });
    if (!adminUser || !adminPass) throw Object.assign(new Error('admin username and password are required'), { status: 400 });
    if (adminPass.length < 8) throw Object.assign(new Error('password must be at least 8 characters'), { status: 400 });
    if (!(await dockerAvailable())) {
        throw Object.assign(new Error('docker socket not available to the api — mount /var/run/docker.sock'), { status: 503 });
    }
    if (await slugTaken(slug)) throw Object.assign(new Error(`subdomain "${slug}" is already in use`), { status: 409 });
    const existing = await getEnvironment(partner.id);
    if (existing) throw Object.assign(new Error(`partner already has an environment at ${existing.url}`), { status: 409 });

    await ensurePartnerCollections();

    // Mint a portal API token (owned by the provisioning admin) so the portal
    // can run campaigns against /api/creative. Raw token only ever lives in
    // the container env; PB stores the hash like every other ksk_ token.
    let ksToken = '';
    let tokenRecordId = '';
    if (addedBy) {
        try {
            const raw = API_TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
            const rec = await pb.collection('api_tokens').create({
                user_id: addedBy,
                name: `portal-${slug}`,
                token_hash: hashApiToken(raw),
                prefix: raw.slice(0, 8),
                last4: raw.slice(-4),
            });
            ksToken = raw;
            tokenRecordId = rec.id;
        } catch (err) {
            logger.warn(`environment: token mint failed for ${slug} (campaigns disabled): ${err.message}`);
        }
    }

    const record = await pb.collection('partner_environments').create({
        partner_id: partner.id,
        slug,
        url: portalUrl(slug),
        status: 'provisioning',
        portal_name: portalName || partner.name,
        admin_user: adminUser,
        token_record_id: tokenRecordId,
        added_by: addedBy || '',
    });

    const containerName = `portal-${slug}`;
    const volumeName = `portal_${slug.replace(/-/g, '_')}_data`;
    const router = `portal-${slug}`;
    try {
        await dockerRequest('POST', '/volumes/create', { Name: volumeName });

        const create = await dockerRequest('POST', `/containers/create?name=${containerName}`, {
            Image: PORTAL_IMAGE,
            Env: [
                `PORTAL_NAME=${portalName || partner.name}`,
                `ADMIN_USER=${adminUser}`,
                `ADMIN_PASS=${adminPass}`,
                `KS_ORIGIN=${KS_ORIGIN}`,
                `PARTNER_ID=${partner.id}`,
                ...(ksToken ? [`KS_API_TOKEN=${ksToken}`, `TARA_AGENT_ID=${TARA_SKILL_ID}`] : []),
                ...(sessionId ? [`SESSION_ID=${sessionId}`] : []),
                'DATA_DIR=/data',
                'PORT=8080',
            ],
            Labels: {
                'traefik.enable': 'true',
                [`traefik.http.routers.${router}.rule`]: `Host(\`${slug}.${PORTAL_DOMAIN_SUFFIX}\`)`,
                [`traefik.http.routers.${router}.entrypoints`]: 'websecure',
                [`traefik.http.routers.${router}.tls.certresolver`]: 'letsencrypt',
                [`traefik.http.services.${router}.loadbalancer.server.port`]: '8080',
                'kaushalstack.portal': slug,
                'kaushalstack.partner_id': partner.id,
            },
            ExposedPorts: { '8080/tcp': {} },
            HostConfig: {
                Binds: [`${volumeName}:/data`],
                RestartPolicy: { Name: 'unless-stopped' },
            },
        });

        await dockerRequest('POST', `/containers/${create.Id}/start`);

        const updated = await pb.collection('partner_environments').update(record.id, {
            status: 'running',
            container_id: create.Id.slice(0, 12),
        });
        invalidateOriginsCache();
        logger.info(`environment: provisioned ${containerName} for partner ${partner.name} at ${portalUrl(slug)}`);
        return updated;
    } catch (err) {
        await pb.collection('partner_environments').update(record.id, {
            status: 'failed',
            error: String(err.message || err).slice(0, 1000),
        }).catch(() => {});
        logger.error(`environment: provisioning ${containerName} failed: ${err.message}`);
        throw err;
    }
}

export async function removeEnvironment(record) {
    const containerName = `portal-${record.slug}`;
    try {
        await dockerRequest('DELETE', `/containers/${containerName}?force=true`);
    } catch (err) {
        if (err.statusCode !== 404) throw err;
    }
    // Revoke the portal's API token with it.
    if (record.token_record_id) {
        await pb.collection('api_tokens').delete(record.token_record_id).catch(() => {});
    }
    // Volume is kept on purpose — the partner's studio config survives a
    // re-provision under the same slug.
    const updated = await pb.collection('partner_environments').update(record.id, {
        status: 'removed',
        error: '',
    });
    invalidateOriginsCache();
    logger.info(`environment: removed ${containerName}`);
    return updated;
}
