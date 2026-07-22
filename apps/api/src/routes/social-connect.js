// Multi-tenant social connect + publish. OAuth happens HERE (one Meta app,
// one LinkedIn app, one callback URL each on kaushalstack.com) — tokens are
// stored per partner, encrypted, in partner_social_accounts. Portals hit
// these routes with their portal ksk_ token; the state blob carries the
// partner + return URL through the OAuth dance, AES-GCM sealed so it can't
// be tampered with.
//
//   POST   /partner/:id/social/:provider/connect-url   → { url } to redirect the browser to
//   GET    /social/:provider/callback                   (public — OAuth return)
//   GET    /partner/:id/social/status                   → per-provider connection info
//   POST   /partner/:id/social/:provider/publish        → publish a Studio card
//   DELETE /partner/:id/social/:provider                → disconnect

import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../utils/auth.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { verifiedPartnerId } from '../partner/membership.js';
import { ensurePartnerCollections } from '../partner/collections.js';

const router = Router();

const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'https://kaushalstack.com').replace(/\/$/, '');
const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const FB_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const FB_SCOPE = process.env.FACEBOOK_SCOPE || 'pages_show_list,pages_read_engagement,pages_manage_posts';
const LI_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || '';
const LI_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || '';
const LI_SCOPE = process.env.LINKEDIN_SCOPE || 'openid profile w_member_social';
const LI_VERSION = process.env.LINKEDIN_VERSION || '202606';

const PROVIDERS = new Set(['facebook', 'linkedin']);
const STATE_TTL_MS = 15 * 60 * 1000;

const esc = (s) => String(s || '').replace(/"/g, '\\"');

function redirectUri(provider) {
    return `${PUBLIC_ORIGIN}/api/social/${provider}/callback`;
}

function providerConfigured(provider) {
    return provider === 'facebook' ? !!(FB_APP_ID && FB_APP_SECRET) : !!(LI_CLIENT_ID && LI_CLIENT_SECRET);
}

// ── State blob (AES-GCM via utils/crypto — authenticated, so tamper-proof) ──
function sealState(payload) {
    return encrypt(JSON.stringify({ ...payload, e: Date.now() + STATE_TTL_MS }));
}
function openState(raw) {
    try {
        const p = JSON.parse(decrypt(raw));
        if (!p.e || p.e < Date.now()) return null;
        return p;
    } catch {
        return null;
    }
}

// Only ever bounce back to a portal we provisioned (or a first-party origin) —
// an attacker-crafted state can't turn the callback into an open redirect.
async function allowedReturnUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        if (u.origin === PUBLIC_ORIGIN) return true;
        const envs = await pb.collection('partner_environments').getFullList({
            filter: 'status = "running"', fields: 'url',
        }).catch(() => []);
        const known = new Set([
            ...envs.map(e => e.url),
            'https://mrnmr.srv1562298.hstgr.cloud',
            'https://consciousconnections.srv1562298.hstgr.cloud',
            'https://consciousconnections.in',
        ]);
        return known.has(u.origin);
    } catch {
        return false;
    }
}

async function requirePartnerMember(req, res) {
    const userId = await getUserIdFromAuth(req);
    if (!userId) { res.status(401).json({ error: 'unauthorized' }); return null; }
    const pid = await verifiedPartnerId(req.params.id, userId);
    if (!pid) { res.status(403).json({ error: 'not a member of this partner' }); return null; }
    return pid;
}

async function getAccount(partnerId, provider) {
    try {
        await ensurePartnerCollections();
        const r = await pb.collection('partner_social_accounts').getList(1, 1, {
            filter: `partner_id = "${esc(partnerId)}" && provider = "${esc(provider)}"`,
        });
        return r.items[0] || null;
    } catch {
        return null;
    }
}

async function saveAccount(partnerId, provider, fields) {
    const existing = await getAccount(partnerId, provider);
    if (existing) return pb.collection('partner_social_accounts').update(existing.id, fields);
    return pb.collection('partner_social_accounts').create({ partner_id: partnerId, provider, ...fields });
}

// ── Connect URL ──────────────────────────────────────────────────────────────

router.post('/partner/:id/social/:provider/connect-url', async (req, res) => {
    const provider = req.params.provider;
    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: 'unknown provider' });
    if (!providerConfigured(provider)) {
        return res.status(503).json({ error: `${provider} app credentials are not configured on kaushalstack` });
    }
    const pid = await requirePartnerMember(req, res);
    if (!pid) return;
    const returnUrl = String(req.body?.return_url || '').slice(0, 300);
    if (!(await allowedReturnUrl(returnUrl))) return res.status(400).json({ error: 'return_url is not a known portal' });

    const state = sealState({ p: pid, v: provider, r: returnUrl });
    let url;
    if (provider === 'facebook') {
        url = `https://www.facebook.com/v21.0/dialog/oauth?${new URLSearchParams({
            client_id: FB_APP_ID,
            redirect_uri: redirectUri('facebook'),
            response_type: 'code',
            scope: FB_SCOPE,
            state,
        })}`;
    } else {
        url = `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
            response_type: 'code',
            client_id: LI_CLIENT_ID,
            redirect_uri: redirectUri('linkedin'),
            scope: LI_SCOPE,
            state,
        })}`;
    }
    res.json({ url });
});

// ── OAuth callbacks (public) ─────────────────────────────────────────────────

function backToPortal(res, returnUrl, params) {
    const u = new URL(returnUrl);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    res.redirect(302, u.toString());
}

router.get('/social/facebook/callback', async (req, res) => {
    const state = openState(String(req.query.state || ''));
    if (!state || state.v !== 'facebook') return res.status(400).send('Invalid or expired state — go back to the portal and try Connect again.');
    const fail = (msg) => backToPortal(res, state.r, { social_error: msg.slice(0, 140) });
    try {
        if (req.query.error) return fail(String(req.query.error_description || req.query.error));
        const code = String(req.query.code || '');
        if (!code) return fail('facebook returned no code');

        const shortTok = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
            client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: redirectUri('facebook'), code,
        })}`).then(r => r.json());
        if (!shortTok.access_token) return fail(shortTok.error?.message || 'token exchange failed');

        const longTok = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
            grant_type: 'fb_exchange_token', client_id: FB_APP_ID, client_secret: FB_APP_SECRET,
            fb_exchange_token: shortTok.access_token,
        })}`).then(r => r.json());
        const userToken = longTok.access_token || shortTok.access_token;

        const me = await fetch(`${FB_GRAPH}/me?fields=name&access_token=${encodeURIComponent(userToken)}`).then(r => r.json());
        const pagesResp = await fetch(`${FB_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`).then(r => r.json());
        const pages = (pagesResp.data || []).map(p => ({ page_id: p.id, page_name: p.name, page_token: p.access_token }));
        if (pages.length === 0) return fail('no Facebook Pages on this account — the connected user must manage at least one Page');

        await saveAccount(state.p, 'facebook', {
            account_id: '',
            account_name: me.name || '',
            token_encrypted: encrypt(userToken),
            pages_encrypted: encrypt(JSON.stringify(pages)),
            expires_at: '',
        });
        logger.info(`social: facebook connected for partner ${state.p} (${pages.length} pages)`);
        backToPortal(res, state.r, { social: 'facebook-connected' });
    } catch (err) {
        logger.error('facebook callback failed:', err.message);
        fail('facebook connection failed — try again');
    }
});

router.get('/social/linkedin/callback', async (req, res) => {
    const state = openState(String(req.query.state || ''));
    if (!state || state.v !== 'linkedin') return res.status(400).send('Invalid or expired state — go back to the portal and try Connect again.');
    const fail = (msg) => backToPortal(res, state.r, { social_error: msg.slice(0, 140) });
    try {
        if (req.query.error) return fail(String(req.query.error_description || req.query.error));
        const code = String(req.query.code || '');
        if (!code) return fail('linkedin returned no code');

        const tok = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code', code,
                redirect_uri: redirectUri('linkedin'),
                client_id: LI_CLIENT_ID, client_secret: LI_CLIENT_SECRET,
            }),
        }).then(r => r.json());
        if (!tok.access_token) return fail(tok.error_description || 'token exchange failed');

        const info = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: { Authorization: `Bearer ${tok.access_token}` },
        }).then(r => r.json());
        if (!info.sub) return fail('could not read LinkedIn profile');

        await saveAccount(state.p, 'linkedin', {
            account_id: info.sub,
            account_name: info.name || '',
            token_encrypted: encrypt(tok.access_token),
            pages_encrypted: '',
            expires_at: new Date(Date.now() + (tok.expires_in || 0) * 1000).toISOString(),
        });
        logger.info(`social: linkedin connected for partner ${state.p} (${info.name})`);
        backToPortal(res, state.r, { social: 'linkedin-connected' });
    } catch (err) {
        logger.error('linkedin callback failed:', err.message);
        fail('linkedin connection failed — try again');
    }
});

// ── Status ───────────────────────────────────────────────────────────────────

router.get('/partner/:id/social/status', async (req, res) => {
    const pid = await requirePartnerMember(req, res);
    if (!pid) return;
    const [fb, li] = await Promise.all([getAccount(pid, 'facebook'), getAccount(pid, 'linkedin')]);
    let fbPages = [];
    if (fb?.pages_encrypted) {
        try { fbPages = JSON.parse(decrypt(fb.pages_encrypted)).map(p => ({ page_id: p.page_id, page_name: p.page_name })); } catch { /* corrupt */ }
    }
    res.json({
        facebook: {
            configured: providerConfigured('facebook'),
            connected: !!fb,
            account_name: fb?.account_name || '',
            pages: fbPages,
        },
        linkedin: {
            configured: providerConfigured('linkedin'),
            connected: !!li && (!li.expires_at || new Date(li.expires_at) > new Date()),
            account_name: li?.account_name || '',
            expires_at: li?.expires_at || '',
        },
    });
});

// ── Publish ──────────────────────────────────────────────────────────────────

function dataUrlToBuffer(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
}

router.post('/partner/:id/social/:provider/publish', async (req, res) => {
    const provider = req.params.provider;
    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: 'unknown provider' });
    const pid = await requirePartnerMember(req, res);
    if (!pid) return;
    const account = await getAccount(pid, provider);
    if (!account) return res.status(400).json({ error: `${provider} is not connected for this partner` });

    const caption = String(req.body?.caption || '').slice(0, 3000);
    const kind = req.body?.kind === 'video' ? 'video' : 'image';
    try {
        if (provider === 'facebook') {
            const pages = JSON.parse(decrypt(account.pages_encrypted || ''));
            const page = pages.find(p => p.page_id === req.body?.page_id) || pages[0];
            if (!page) return res.status(400).json({ error: 'no Facebook Page available' });

            const fd = new FormData();
            fd.append('access_token', page.page_token);
            if (kind === 'video') {
                const videoUrl = String(req.body?.videoUrl || '');
                if (!videoUrl.startsWith(`${PUBLIC_ORIGIN}/`)) return res.status(400).json({ error: 'videoUrl must be a kaushalstack URL' });
                const vid = await fetch(videoUrl).then(r => r.arrayBuffer());
                fd.append('description', caption);
                fd.append('source', new Blob([vid], { type: 'video/mp4' }), 'card.mp4');
                const out = await fetch(`${FB_GRAPH}/${page.page_id}/videos`, { method: 'POST', body: fd }).then(r => r.json());
                if (out.error) return res.status(502).json({ error: out.error.message });
                return res.json({ ok: true, id: out.id, note: `Posted video to ${page.page_name}` });
            }
            const img = dataUrlToBuffer(req.body?.image);
            if (!img) return res.status(400).json({ error: 'image must be a png/jpeg data URL' });
            fd.append('caption', caption);
            fd.append('source', new Blob([img.buf], { type: img.mime }), 'card.png');
            const out = await fetch(`${FB_GRAPH}/${page.page_id}/photos`, { method: 'POST', body: fd }).then(r => r.json());
            if (out.error) return res.status(502).json({ error: out.error.message });
            return res.json({ ok: true, id: out.post_id || out.id, note: `Posted to ${page.page_name}` });
        }

        // linkedin
        if (account.expires_at && new Date(account.expires_at) < new Date()) {
            return res.status(400).json({ error: 'LinkedIn token expired — reconnect from the portal' });
        }
        const token = decrypt(account.token_encrypted);
        const author = `urn:li:person:${account.account_id}`;
        const liHeaders = {
            Authorization: `Bearer ${token}`,
            'LinkedIn-Version': LI_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
        };
        let content;
        const img = kind === 'image' ? dataUrlToBuffer(req.body?.image) : null;
        if (img) {
            const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
                method: 'POST', headers: liHeaders,
                body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
            }).then(r => r.json());
            const uploadUrl = init?.value?.uploadUrl;
            const imageUrn = init?.value?.image;
            if (!uploadUrl || !imageUrn) return res.status(502).json({ error: init?.message || 'LinkedIn image upload init failed' });
            const put = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': img.mime },
                body: img.buf,
            });
            if (!put.ok) return res.status(502).json({ error: `LinkedIn image upload failed (${put.status})` });
            content = { media: { id: imageUrn, title: 'card' } };
        }
        const post = await fetch('https://api.linkedin.com/rest/posts', {
            method: 'POST', headers: liHeaders,
            body: JSON.stringify({
                author,
                commentary: caption,
                visibility: 'PUBLIC',
                distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
                lifecycleState: 'PUBLISHED',
                ...(content ? { content } : {}),
            }),
        });
        if (!post.ok) {
            const body = await post.json().catch(() => ({}));
            return res.status(502).json({ error: body.message || `LinkedIn returned ${post.status}` });
        }
        const urn = post.headers.get('x-restli-id') || post.headers.get('x-linkedin-id') || '';
        return res.json({ ok: true, id: urn, note: `Posted to LinkedIn as ${account.account_name}${kind === 'video' ? ' (text-only — video posting coming later)' : ''}` });
    } catch (err) {
        logger.error(`social publish ${provider} failed for ${pid}: ${err.message}`);
        res.status(500).json({ error: 'publish failed — try again' });
    }
});

router.delete('/partner/:id/social/:provider', async (req, res) => {
    const provider = req.params.provider;
    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: 'unknown provider' });
    const pid = await requirePartnerMember(req, res);
    if (!pid) return;
    const account = await getAccount(pid, provider);
    if (account) await pb.collection('partner_social_accounts').delete(account.id).catch(() => {});
    res.json({ ok: true });
});

export default router;
