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
.empty{flex:1;display:flex;align-items:center;justify-content:center;color:#78716c;font-size:14px;padding:40px;text-align:center}
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
    const frame = sid
        ? `<iframe src="${KS_ORIGIN}/api/build/${esc(sid)}/studio/" allow="clipboard-write"></iframe>`
        : `<div class="empty">No design session linked yet.<br>Paste a kaushalstack build-session id above to open Card Studio.</div>`;
    return page(`${PORTAL_NAME} — Studio`, `
<header><span class="brand">${esc(PORTAL_NAME)}</span><a href="/logout">Sign out</a></header>
<main>
<div class="bar">
<form method="post" action="/admin/session">
<span class="hint">Design session</span>
<input name="session_id" placeholder="16-character session id" value="${esc(sid)}" pattern="[a-f0-9]{16}">
<button type="submit">Open</button>
</form>
</div>
${frame}
</main>`);
}

// ── Server ───────────────────────────────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', c => { data += c; if (data.length > 10000) req.destroy(); });
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

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
});

server.listen(PORT, () => {
    console.log(`${PORTAL_NAME} portal listening on :${PORT}`);
});
