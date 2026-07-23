// Generic partner studio portal — one image, one container per partner.
// Deliberately dependency-free (node built-ins only) so the Docker build has
// no npm step at all: the VPS registry flakiness that has corrupted npm-ci
// layers twice can never touch this image.
//
// Env:
//   PORTAL_NAME   display name shown in the header (default: Studio)
//   ADMIN_USER    login username        (required)
//   ADMIN_PASS    login password        (required)
//   KS_ORIGIN     kaushalstack origin   (default: https://kaushalstack.com)
//   SESSION_ID    optional initial build-session id for the Studio tab
//   DATA_DIR      persistent dir        (default: /data)
//   PORT          listen port           (default: 8080)
//
// Optional — direct social OAuth on this portal's own domain (register
// https://<portal-host>/admin/facebook/callback and /admin/linkedin/callback
// on the provider apps; without these creds social proxies to kaushalstack):
//   FACEBOOK_APP_ID / FACEBOOK_APP_SECRET / FACEBOOK_SCOPE
//   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / LINKEDIN_SCOPE / LINKEDIN_VERSION

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || '/data';
const PORTAL_NAME = process.env.PORTAL_NAME || 'Studio';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const KS_ORIGIN = (process.env.KS_ORIGIN || 'https://kaushalstack.com').replace(/\/$/, '');
const KS_API_TOKEN = process.env.KS_API_TOKEN || '';
const PARTNER_ID = process.env.PARTNER_ID || '';
const TARA_AGENT_ID = process.env.TARA_AGENT_ID || '';
const CAN_CREATE_CAMPAIGNS = !!(KS_API_TOKEN && TARA_AGENT_ID);

// Direct social OAuth (optional). With the shared Meta/LinkedIn app creds in
// the env, Connect runs against this portal's own /admin/<provider>/callback
// (which must be registered as a redirect URI on the provider app) and tokens
// live in DATA_DIR/social.json — same pattern as the mrnmr/CC portals. Without
// creds the social routes proxy to kaushalstack central OAuth as before.
const FB_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const FB_SCOPE = process.env.FACEBOOK_SCOPE || 'pages_show_list,pages_read_engagement,pages_manage_posts';
const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const LI_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || '';
const LI_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || '';
const LI_SCOPE = process.env.LINKEDIN_SCOPE || 'openid profile w_member_social';
const LI_VERSION = process.env.LINKEDIN_VERSION || '202606';
const LOCAL_FB = !!(FB_APP_ID && FB_APP_SECRET);
const LOCAL_LI = !!(LI_CLIENT_ID && LI_CLIENT_SECRET);

if (!ADMIN_USER || !ADMIN_PASS) {
    console.error('ADMIN_USER and ADMIN_PASS are required');
    process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Session secret (persisted so logins survive restarts) ───────────────────
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
let SECRET;
try {
    SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (SECRET.length < 32) throw new Error('short');
} catch {
    SECRET = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
}

// ── Config (studio session id) ───────────────────────────────────────────────
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
function readConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg));
}
if (!readConfig().session_id && /^[a-f0-9]{16}$/.test(process.env.SESSION_ID || '')) {
    writeConfig({ session_id: process.env.SESSION_ID });
}

// ── Social tokens (direct-OAuth mode only) ──────────────────────────────────
const SOCIAL_FILE = path.join(DATA_DIR, 'social.json');
function readSocial() {
    try { return JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8')); } catch { return {}; }
}
function writeSocial(s) {
    fs.writeFileSync(SOCIAL_FILE, JSON.stringify(s), { mode: 0o600 });
}

// ── Campaign runs (Tara via kaushalstack /api/creative) ─────────────────────
// One at a time; state survives restarts via campaign.json so the page can
// keep polling even if the container bounced mid-run (the run itself won't
// survive a restart — status flips to failed on next start if it was running).
const CAMPAIGN_FILE = path.join(DATA_DIR, 'campaign.json');
function readCampaign() {
    try { return JSON.parse(fs.readFileSync(CAMPAIGN_FILE, 'utf8')); } catch { return { status: 'idle' }; }
}
function writeCampaign(c) {
    fs.writeFileSync(CAMPAIGN_FILE, JSON.stringify(c));
}
let campaignInFlight = false;
if (readCampaign().status === 'running') {
    writeCampaign({ status: 'failed', error: 'portal restarted while the campaign was running — try again' });
}

async function runCampaign(brief) {
    campaignInFlight = true;
    writeCampaign({ status: 'running', brief: brief.slice(0, 300), started: Date.now() });
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30 * 60 * 1000);
        const r = await fetch(`${KS_ORIGIN}/api/creative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KS_API_TOKEN}` },
            body: JSON.stringify({ agent_id: TARA_AGENT_ID, query: brief, partner_id: PARTNER_ID }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.session_id) {
            throw new Error(data.error || `kaushalstack returned ${r.status}`);
        }
        writeConfig({ ...readConfig(), session_id: data.session_id });
        writeCampaign({ status: 'done', session_id: data.session_id, finished: Date.now() });
    } catch (err) {
        const msg = err.name === 'AbortError' ? 'campaign run timed out after 30 minutes' : String(err.message || err);
        writeCampaign({ status: 'failed', error: msg.slice(0, 300), finished: Date.now() });
    } finally {
        campaignInFlight = false;
    }
}

// ── Cookie session ───────────────────────────────────────────────────────────
const COOKIE = 'portal_s';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(value) {
    return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}
function makeSession() {
    const exp = Date.now() + SESSION_TTL_MS;
    const payload = `${exp}`;
    return `${payload}.${sign(payload)}`;
}
function validSession(raw) {
    if (!raw) return false;
    const i = raw.lastIndexOf('.');
    if (i < 1) return false;
    const payload = raw.slice(0, i);
    const mac = raw.slice(i + 1);
    const expect = sign(payload);
    if (mac.length !== expect.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return false;
    return Number(payload) > Date.now();
}
// OAuth state for direct mode: HMAC-signed with the session secret, 15-minute
// TTL — proves the dance started from this portal's authed Connect click.
function oauthState(provider) {
    const payload = `${provider}.${Date.now() + 15 * 60 * 1000}.${crypto.randomBytes(8).toString('hex')}`;
    return `${payload}.${sign(payload)}`;
}
function validOauthState(raw, provider) {
    const i = String(raw || '').lastIndexOf('.');
    if (i < 1) return false;
    const payload = raw.slice(0, i);
    const mac = raw.slice(i + 1);
    const expect = sign(payload);
    if (mac.length !== expect.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return false;
    const [p, exp] = payload.split('.');
    return p === provider && Number(exp) > Date.now();
}

function cookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) {
        crypto.timingSafeEqual(bb, bb);
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body) {
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box;margin:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f6f5f2;color:#1c1917;min-height:100vh;display:flex;flex-direction:column}
header{background:#fff;border-bottom:1px solid #e7e5e4;padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
header .brand{font-weight:700;font-size:15px;letter-spacing:.2px}
header a{color:#78716c;text-decoration:none;font-size:13px}
header a:hover{color:#1c1917}
main{flex:1;display:flex;flex-direction:column}
.card{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:28px;max-width:380px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.center{flex:1;display:flex;align-items:center;justify-content:center;padding:20px}
h1{font-size:18px;margin-bottom:16px}
label{display:block;font-size:12px;color:#57534e;margin:12px 0 4px}
input{width:100%;padding:9px 11px;border:1px solid #d6d3d1;border-radius:8px;font-size:14px}
input:focus{outline:2px solid #0ea5e9;border-color:#0ea5e9}
button{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#1e293b}
.err{background:#fef2f2;color:#b91c1c;border-radius:8px;padding:9px 11px;font-size:13px;margin-bottom:6px}
.bar{background:#fff;border-bottom:1px solid #e7e5e4;padding:10px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bar form{display:flex;gap:8px;align-items:center;flex:1;min-width:260px}
.bar input{max-width:280px;font-family:ui-monospace,monospace;font-size:13px}
.bar button{margin:0;width:auto;padding:8px 14px;font-size:13px}
.bar .hint{font-size:12px;color:#78716c}
iframe{border:0;flex:1;width:100%;min-height:70vh}
.empty{flex:1;display:flex;align-items:center;justify-content:center;color:#78716c;font-size:14px;padding:40px;text-align:center;line-height:1.7}
.spin{width:28px;height:28px;border:3px solid #e7e5e4;border-top-color:#0f172a;border-radius:50%;margin:0 auto 14px;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
textarea:focus{outline:2px solid #0ea5e9;border-color:#0ea5e9}
.chip{font-size:12px;background:#fff;border:1px solid #e7e5e4;border-radius:999px;padding:5px 12px;display:inline-flex;align-items:center;gap:6px}
.chip a{color:#0369a1;text-decoration:none;font-weight:600}
.chip a:hover{text-decoration:underline}
.chip .dim{color:#a8a29e}
.chip-x{margin:0;width:auto;padding:0 4px;background:none;border:0;color:#a8a29e;font-size:11px;cursor:pointer}
.chip-x:hover{color:#b91c1c;background:none}
</style></head><body>${body}</body></html>`;
}

function loginPage(error) {
    return page(`${PORTAL_NAME} — Sign in`, `
<main class="center"><div class="card">
<h1>${esc(PORTAL_NAME)}</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/login">
<label for="u">Username</label><input id="u" name="username" autocomplete="username" autofocus>
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password">
<button type="submit">Sign in</button>
</form>
</div></main>`);
}

function studioPage() {
    const sid = readConfig().session_id || '';
    const campaign = readCampaign();

    let body;
    if (sid) {
        body = `<iframe src="${KS_ORIGIN}/api/build/${esc(sid)}/studio/" allow="clipboard-write"></iframe>`;
    } else if (campaign.status === 'running') {
        body = `<div class="empty"><div>
<div class="spin"></div>
<strong>Tara is designing your campaign…</strong><br>
Posts for Instagram, Facebook, LinkedIn and X — usually 3–6 minutes.<br>
<span style="font-size:12px;color:#a8a29e">This page refreshes itself when it's ready.</span>
</div></div>
<script>setInterval(async()=>{try{const r=await fetch('/admin/campaign/status');const d=await r.json();if(d.status!=='running')location.reload();}catch(e){}},5000);</script>`;
    } else if (CAN_CREATE_CAMPAIGNS) {
        body = `<div class="center"><div class="card" style="max-width:460px">
<h1>Create your first campaign</h1>
${campaign.status === 'failed' ? `<div class="err">Last run failed: ${esc(campaign.error || 'unknown error')}</div>` : ''}
<p style="font-size:13px;color:#57534e;margin-bottom:4px">Describe the campaign — Tara designs platform-native posts for Instagram, Facebook, LinkedIn and X, then they open here in Studio for you to edit and publish.</p>
<form method="post" action="/admin/campaign">
<label for="brief">Campaign brief</label>
<textarea id="brief" name="brief" rows="4" required minlength="12" style="width:100%;padding:9px 11px;border:1px solid #d6d3d1;border-radius:8px;font-size:14px;font-family:inherit;resize:vertical" placeholder="e.g. Monsoon knee-care package launch — 20% off physio assessments this August, warm and reassuring tone, book via phone"></textarea>
<button type="submit">Create campaign</button>
</form>
</div></div>`;
    } else {
        body = `<div class="empty">No design session linked yet.<br>Paste a kaushalstack build-session id above to open Card Studio.</div>`;
    }

    const socialBar = (KS_API_TOKEN || LOCAL_FB || LOCAL_LI) ? `
<div class="bar" id="social-bar" style="border-top:0;padding-top:0">
  <span class="hint">Publishing</span>
  <span id="fb-chip" class="chip">Facebook: checking…</span>
  <span id="li-chip" class="chip">LinkedIn: checking…</span>
</div>
<script>
(function () {
  var KS = ${JSON.stringify(KS_ORIGIN)};
  function chip(id, htmlStr) { document.getElementById(id).innerHTML = htmlStr; }
  function connectLink(p, label) { return '<a href="/admin/social/connect/' + p + '">' + label + '</a>'; }
  function disconnectBtn(p) { return '<form method="post" action="/admin/social/disconnect/' + p + '" style="display:inline;margin:0"><button type="submit" class="chip-x" title="Disconnect">✕</button></form>'; }
  fetch('/admin/social/status').then(function (r) { return r.json(); }).then(function (s) {
    var fb = s.facebook || {};
    chip('fb-chip', !fb.configured ? 'Facebook: <span class="dim">not configured</span>'
      : fb.connected ? 'Facebook: <strong>' + (fb.pages && fb.pages[0] ? fb.pages[0].page_name : fb.account_name) + '</strong> ' + disconnectBtn('facebook')
      : connectLink('facebook', 'Connect Facebook'));
    var li = s.linkedin || {};
    chip('li-chip', !li.configured ? 'LinkedIn: <span class="dim">not configured</span>'
      : li.connected ? 'LinkedIn: <strong>' + li.account_name + '</strong> ' + disconnectBtn('linkedin')
      : connectLink('linkedin', 'Connect LinkedIn'));
  }).catch(function () {
    chip('fb-chip', 'Facebook: <span class="dim">status unavailable</span>');
    chip('li-chip', 'LinkedIn: <span class="dim">status unavailable</span>');
  });

  var q = new URLSearchParams(location.search);
  if (q.get('social')) { history.replaceState(null, '', location.pathname); }
  if (q.get('social_error')) { alert('Connection failed: ' + q.get('social_error')); history.replaceState(null, '', location.pathname); }

  // Studio → portal publish hand-off: forward the card to kaushalstack and
  // report the outcome back into the iframe.
  window.addEventListener('message', function (ev) {
    if (ev.origin !== KS) return;
    var d = ev.data || {};
    if (d.type !== 'ks-studio-publish') return;
    var target = d.target === 'linkedin' ? 'linkedin' : 'facebook';
    fetch('/admin/social/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: target, kind: d.kind, image: d.image, videoUrl: d.videoUrl, caption: d.caption, page_id: d.page_id }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (out) {
        ev.source.postMessage({ type: 'ks-studio-publish-result', target: d.target, ok: !!(out.ok && out.j.ok), note: out.j.note, permalink: out.j.permalink, error: out.j.error }, KS);
      })
      .catch(function () {
        ev.source.postMessage({ type: 'ks-studio-publish-result', target: d.target, ok: false, error: 'portal could not reach kaushalstack' }, KS);
      });
  });
})();
</script>` : '';

    return page(`${PORTAL_NAME} — Studio`, `
<header><span class="brand">${esc(PORTAL_NAME)}</span><a href="/logout">Sign out</a></header>
<main>
<div class="bar">
<form method="post" action="/admin/session">
<span class="hint">Design session</span>
<input name="session_id" placeholder="16-character session id" value="${esc(sid)}" pattern="[a-f0-9]{16}">
<button type="submit">Open</button>
</form>
${sid && CAN_CREATE_CAMPAIGNS ? `<form method="post" action="/admin/campaign/reset"><button type="submit" style="background:#fff;color:#0f172a;border:1px solid #d6d3d1">New campaign</button></form>` : ''}
</div>
${socialBar}
${body}
</main>`);
}

// ── Server ───────────────────────────────────────────────────────────────────
function readBody(req, limit = 10000) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', c => { data += c; if (data.length > limit) req.destroy(); });
        req.on('end', () => resolve(data));
    });
}

function formFields(body) {
    const out = {};
    for (const pair of body.split('&')) {
        const i = pair.indexOf('=');
        if (i > 0) out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
    }
    return out;
}

function dataUrlToBuffer(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
}

// Direct-mode publishing — same Graph / Posts API calls the central
// social-connect route makes, but with the locally stored tokens.
async function publishFacebookLocal(payload) {
    const pages = readSocial().facebook?.pages || [];
    const pageSel = pages.find(p => p.page_id === payload.page_id) || pages[0];
    if (!pageSel) return { status: 400, body: { error: 'Facebook is not connected — use Connect Facebook first' } };
    const caption = String(payload.caption || '').slice(0, 3000);
    const fd = new FormData();
    fd.append('access_token', pageSel.page_token);
    if (payload.kind === 'video') {
        const videoUrl = String(payload.videoUrl || '');
        if (!videoUrl.startsWith(`${KS_ORIGIN}/`)) return { status: 400, body: { error: 'videoUrl must be a kaushalstack URL' } };
        const vid = await fetch(videoUrl).then(r => r.arrayBuffer());
        fd.append('description', caption);
        fd.append('source', new Blob([vid], { type: 'video/mp4' }), 'card.mp4');
        const out = await fetch(`${FB_GRAPH}/${pageSel.page_id}/videos`, { method: 'POST', body: fd }).then(r => r.json());
        if (out.error) return { status: 502, body: { error: out.error.message } };
        return { status: 200, body: { ok: true, id: out.id, note: `Posted video to ${pageSel.page_name}` } };
    }
    const img = dataUrlToBuffer(payload.image);
    if (!img) return { status: 400, body: { error: 'image must be a png/jpeg data URL' } };
    fd.append('caption', caption);
    fd.append('source', new Blob([img.buf], { type: img.mime }), 'card.png');
    const out = await fetch(`${FB_GRAPH}/${pageSel.page_id}/photos`, { method: 'POST', body: fd }).then(r => r.json());
    if (out.error) return { status: 502, body: { error: out.error.message } };
    return { status: 200, body: { ok: true, id: out.post_id || out.id, note: `Posted to ${pageSel.page_name}` } };
}

async function publishLinkedinLocal(payload) {
    const li = readSocial().linkedin;
    if (!li?.access_token) return { status: 400, body: { error: 'LinkedIn is not connected — use Connect LinkedIn first' } };
    if (li.expires_at && new Date(li.expires_at) < new Date()) {
        return { status: 400, body: { error: 'LinkedIn token expired — reconnect from the portal' } };
    }
    const caption = String(payload.caption || '').slice(0, 3000);
    const author = `urn:li:person:${li.member_id}`;
    const liHeaders = {
        Authorization: `Bearer ${li.access_token}`,
        'LinkedIn-Version': LI_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
    };
    let content;
    const img = payload.kind !== 'video' ? dataUrlToBuffer(payload.image) : null;
    if (img) {
        const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
            method: 'POST', headers: liHeaders,
            body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        }).then(r => r.json());
        const uploadUrl = init?.value?.uploadUrl;
        const imageUrn = init?.value?.image;
        if (!uploadUrl || !imageUrn) return { status: 502, body: { error: init?.message || 'LinkedIn image upload init failed' } };
        const put = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${li.access_token}`, 'Content-Type': img.mime },
            body: img.buf,
        });
        if (!put.ok) return { status: 502, body: { error: `LinkedIn image upload failed (${put.status})` } };
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
        return { status: 502, body: { error: body.message || `LinkedIn returned ${post.status}` } };
    }
    const urn = post.headers.get('x-restli-id') || post.headers.get('x-linkedin-id') || '';
    return { status: 200, body: { ok: true, id: urn, note: `Posted to LinkedIn as ${li.member_name}${payload.kind === 'video' ? ' (text-only — video posting coming later)' : ''}` } };
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const authed = validSession(cookies(req)[COOKIE]);

    const redirect = (to, setCookie) => {
        const h = { Location: to };
        if (setCookie) h['Set-Cookie'] = setCookie;
        res.writeHead(302, h);
        res.end();
    };
    const html = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
    };

    if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }

    if (url.pathname === '/login') {
        if (req.method === 'POST') {
            const f = formFields(await readBody(req));
            const ok = safeEqual(f.username || '', ADMIN_USER) & safeEqual(f.password || '', ADMIN_PASS);
            if (ok) {
                return redirect('/admin/studio',
                    `${COOKIE}=${encodeURIComponent(makeSession())}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
            }
            return html(401, loginPage('Wrong username or password'));
        }
        return html(200, authed ? loginPage() : loginPage());
    }

    if (url.pathname === '/logout') {
        return redirect('/login', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    }

    // ── Direct-OAuth callbacks (public — provider redirects land here; the
    // signed state is the proof the flow started from an authed Connect) ────
    const portalOrigin = `https://${req.headers.host}`;
    const backToStudio = (params) => redirect(`/admin/studio?${new URLSearchParams(params)}`);

    if (url.pathname === '/admin/facebook/callback' && LOCAL_FB) {
        if (!validOauthState(String(url.searchParams.get('state') || ''), 'facebook')) {
            return html(400, page('Connect failed', `<main class="center"><div class="card"><h1>Connect failed</h1><p style="font-size:13px;color:#57534e">Invalid or expired state — go back to Studio and try Connect again.</p></div></main>`));
        }
        const fail = (msg) => backToStudio({ social_error: String(msg).slice(0, 140) });
        try {
            if (url.searchParams.get('error')) return fail(url.searchParams.get('error_description') || url.searchParams.get('error'));
            const code = String(url.searchParams.get('code') || '');
            if (!code) return fail('facebook returned no code');

            const shortTok = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
                client_id: FB_APP_ID, client_secret: FB_APP_SECRET,
                redirect_uri: `${portalOrigin}/admin/facebook/callback`, code,
            })}`).then(r => r.json());
            if (!shortTok.access_token) return fail(shortTok.error?.message || 'token exchange failed');

            const longTok = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
                grant_type: 'fb_exchange_token', client_id: FB_APP_ID, client_secret: FB_APP_SECRET,
                fb_exchange_token: shortTok.access_token,
            })}`).then(r => r.json());
            const userToken = longTok.access_token || shortTok.access_token;

            const me = await fetch(`${FB_GRAPH}/me?fields=name&access_token=${encodeURIComponent(userToken)}`).then(r => r.json());
            const pagesResp = await fetch(`${FB_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`).then(r => r.json());
            const pages = (pagesResp.data || []).filter(p => p.id && p.access_token)
                .map(p => ({ page_id: p.id, page_name: p.name || p.id, page_token: p.access_token }));
            if (pages.length === 0) return fail('no Facebook Pages on this account — the connected user must manage at least one Page');

            writeSocial({ ...readSocial(), facebook: { account_name: me.name || '', pages, connected: new Date().toISOString() } });
            console.log(`social: facebook connected directly (${pages.length} pages)`);
            return backToStudio({ social: 'facebook-connected' });
        } catch (err) {
            console.error('facebook callback failed:', err.message);
            return fail('facebook connection failed — try again');
        }
    }

    if (url.pathname === '/admin/linkedin/callback' && LOCAL_LI) {
        if (!validOauthState(String(url.searchParams.get('state') || ''), 'linkedin')) {
            return html(400, page('Connect failed', `<main class="center"><div class="card"><h1>Connect failed</h1><p style="font-size:13px;color:#57534e">Invalid or expired state — go back to Studio and try Connect again.</p></div></main>`));
        }
        const fail = (msg) => backToStudio({ social_error: String(msg).slice(0, 140) });
        try {
            if (url.searchParams.get('error')) return fail(url.searchParams.get('error_description') || url.searchParams.get('error'));
            const code = String(url.searchParams.get('code') || '');
            if (!code) return fail('linkedin returned no code');

            const tok = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code', code,
                    redirect_uri: `${portalOrigin}/admin/linkedin/callback`,
                    client_id: LI_CLIENT_ID, client_secret: LI_CLIENT_SECRET,
                }),
            }).then(r => r.json());
            if (!tok.access_token) return fail(tok.error_description || 'token exchange failed');

            const info = await fetch('https://api.linkedin.com/v2/userinfo', {
                headers: { Authorization: `Bearer ${tok.access_token}` },
            }).then(r => r.json());
            if (!info.sub) return fail('could not read LinkedIn profile');

            writeSocial({
                ...readSocial(),
                linkedin: {
                    member_id: info.sub, member_name: info.name || '',
                    access_token: tok.access_token,
                    expires_at: new Date(Date.now() + (tok.expires_in || 0) * 1000).toISOString(),
                },
            });
            console.log(`social: linkedin connected directly (${info.name})`);
            return backToStudio({ social: 'linkedin-connected' });
        } catch (err) {
            console.error('linkedin callback failed:', err.message);
            return fail('linkedin connection failed — try again');
        }
    }

    if (!authed) return redirect('/login');

    if (url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/') {
        return redirect('/admin/studio');
    }

    if (url.pathname === '/admin/studio') {
        return html(200, studioPage());
    }

    if (url.pathname === '/admin/session' && req.method === 'POST') {
        const f = formFields(await readBody(req));
        const sid = String(f.session_id || '').trim();
        if (sid === '' || /^[a-f0-9]{16}$/.test(sid)) {
            writeConfig({ ...readConfig(), session_id: sid });
        }
        return redirect('/admin/studio');
    }

    // ── Social connect + publish (proxied to kaushalstack with the portal token) ──
    const ksHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${KS_API_TOKEN}` };

    if (url.pathname === '/admin/social/status') {
        let central = null;
        if ((!LOCAL_FB || !LOCAL_LI) && KS_API_TOKEN) {
            try {
                central = await fetch(`${KS_ORIGIN}/api/partner/${PARTNER_ID}/social/status`, { headers: ksHeaders })
                    .then(r => r.json());
            } catch { central = null; }
        }
        const s = (LOCAL_FB || LOCAL_LI) ? readSocial() : {};
        const li = s.linkedin;
        const liLive = !!(li && (!li.expires_at || new Date(li.expires_at) > new Date()));
        const out = {
            facebook: LOCAL_FB ? {
                configured: true,
                connected: !!(s.facebook?.pages?.length),
                account_name: s.facebook?.account_name || '',
                pages: (s.facebook?.pages || []).map(p => ({ page_id: p.page_id, page_name: p.page_name })),
            } : (central?.facebook || { configured: false, connected: false, account_name: '', pages: [] }),
            linkedin: LOCAL_LI ? {
                configured: true,
                connected: liLive,
                account_name: li?.member_name || '',
                expires_at: li?.expires_at || '',
            } : (central?.linkedin || { configured: false, connected: false, account_name: '', expires_at: '' }),
        };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(out));
        return;
    }

    if (url.pathname.startsWith('/admin/social/connect/') && req.method === 'GET') {
        const provider = url.pathname.split('/').pop();
        if (provider === 'facebook' && LOCAL_FB) {
            return redirect(`https://www.facebook.com/v21.0/dialog/oauth?${new URLSearchParams({
                client_id: FB_APP_ID,
                redirect_uri: `${portalOrigin}/admin/facebook/callback`,
                response_type: 'code',
                scope: FB_SCOPE,
                state: oauthState('facebook'),
            })}`);
        }
        if (provider === 'linkedin' && LOCAL_LI) {
            return redirect(`https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
                response_type: 'code',
                client_id: LI_CLIENT_ID,
                redirect_uri: `${portalOrigin}/admin/linkedin/callback`,
                scope: LI_SCOPE,
                state: oauthState('linkedin'),
            })}`);
        }
        try {
            const r = await fetch(`${KS_ORIGIN}/api/partner/${PARTNER_ID}/social/${provider}/connect-url`, {
                method: 'POST', headers: ksHeaders,
                body: JSON.stringify({ return_url: `https://${req.headers.host}/admin/studio` }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data.url) return html(502, page('Connect failed', `<main class="center"><div class="card"><h1>Connect failed</h1><p style="font-size:13px;color:#57534e">${esc(data.error || 'kaushalstack rejected the request')}</p><p style="margin-top:12px"><a href="/admin/studio">← Back to Studio</a></p></div></main>`));
            return redirect(data.url);
        } catch {
            return html(502, page('Connect failed', `<main class="center"><div class="card"><h1>Connect failed</h1><p style="font-size:13px;color:#57534e">kaushalstack unreachable — try again.</p><p style="margin-top:12px"><a href="/admin/studio">← Back to Studio</a></p></div></main>`));
        }
    }

    if (url.pathname === '/admin/social/publish' && req.method === 'POST') {
        const body = await readBody(req, 25 * 1024 * 1024);
        let payload;
        try { payload = JSON.parse(body); } catch { payload = null; }
        const target = payload?.target === 'linkedin' ? 'linkedin' : payload?.target === 'facebook' ? 'facebook' : '';
        if (!payload || !target) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error":"bad publish payload"}');
            return;
        }
        if ((target === 'facebook' && LOCAL_FB) || (target === 'linkedin' && LOCAL_LI)) {
            try {
                const out = target === 'facebook' ? await publishFacebookLocal(payload) : await publishLinkedinLocal(payload);
                res.writeHead(out.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out.body));
            } catch (err) {
                console.error(`social publish ${target} failed:`, err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end('{"error":"publish failed — try again"}');
            }
            return;
        }
        try {
            const r = await fetch(`${KS_ORIGIN}/api/partner/${PARTNER_ID}/social/${target}/publish`, {
                method: 'POST', headers: ksHeaders,
                body: JSON.stringify({
                    kind: payload.kind, image: payload.image, videoUrl: payload.videoUrl,
                    caption: payload.caption, page_id: payload.page_id,
                }),
            });
            const data = await r.json().catch(() => ({}));
            res.writeHead(r.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end('{"error":"kaushalstack unreachable"}');
        }
        return;
    }

    if (url.pathname.startsWith('/admin/social/disconnect/') && req.method === 'POST') {
        const provider = url.pathname.split('/').pop();
        if ((provider === 'facebook' && LOCAL_FB) || (provider === 'linkedin' && LOCAL_LI)) {
            const s = readSocial();
            delete s[provider];
            writeSocial(s);
            return redirect('/admin/studio');
        }
        try {
            await fetch(`${KS_ORIGIN}/api/partner/${PARTNER_ID}/social/${provider}`, { method: 'DELETE', headers: ksHeaders });
        } catch { /* best effort */ }
        return redirect('/admin/studio');
    }

    if (url.pathname === '/admin/campaign' && req.method === 'POST') {
        if (!CAN_CREATE_CAMPAIGNS) return redirect('/admin/studio');
        if (campaignInFlight) return redirect('/admin/studio');
        const f = formFields(await readBody(req));
        const brief = String(f.brief || '').trim().slice(0, 2000);
        if (brief.length >= 12) runCampaign(brief); // fire and poll — no await
        return redirect('/admin/studio');
    }

    if (url.pathname === '/admin/campaign/status') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(readCampaign()));
        return;
    }

    // Unlink the current session so the create-campaign card comes back.
    if (url.pathname === '/admin/campaign/reset' && req.method === 'POST') {
        if (!campaignInFlight) {
            writeConfig({ ...readConfig(), session_id: '' });
            if (readCampaign().status !== 'running') writeCampaign({ status: 'idle' });
        }
        return redirect('/admin/studio');
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
});

server.listen(PORT, () => {
    console.log(`${PORTAL_NAME} portal listening on :${PORT}`);
});
