// Card Studio — an htmx-driven remix surface over a build session's workspace.
// GET  /build/:id/studio/                 → full page: image/text gallery (left) + card composer (right)
// POST /build/:id/studio/recommend-images → 3 fresh Unsplash images saved into the workspace, returned as an HTML fragment
// POST /build/:id/studio/recommend-text   → 3 LLM copy variants of the current caption, returned as an HTML fragment
// The composed card downloads client-side via html2canvas (images are
// same-origin through the preview route, so the canvas is never tainted).

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../utils/logger.js';
import { safeResolve, fileManifest } from '../builder/workspace.js';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

// Same relaxation as the preview route: htmx + html2canvas load from CDNs.
// frame-ancestors is explicit (not just omitted) so it supersedes helmet's
// default X-Frame-Options: SAMEORIGIN and lets partner portals (e.g. the
// Mr n Mr admin studio tab) embed this page cross-origin.
const STUDIO_FRAME_ANCESTORS = ["'self'", ...String(process.env.STUDIO_FRAME_ANCESTORS || 'https://mrnmr.srv1562298.hstgr.cloud').split(',').map((s) => s.trim()).filter(Boolean)];
const STUDIO_CSP = `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src *; font-src * data: https:; frame-ancestors ${STUDIO_FRAME_ANCESTORS.join(' ')};`;

const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;

const router = Router({ strict: true });

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// "assets/img-cozy-cafe-interior-2.jpg" → "cozy cafe interior"
function slugToQuery(imgPath) {
    return path.basename(imgPath)
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/^(img|studio)-/, '')
        .replace(/-\d{10,}/, '')      // studio timestamp
        .replace(/-\d+$/, '')         // trailing index
        .replace(/-/g, ' ')
        .trim();
}

function sendFragment(res, html, status = 200) {
    res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

const errFragment = (msg) => `<div class="rec-error">${esc(msg)}</div>`;

// ---------------------------------------------------------------- main page

router.get('/build/:id/studio', (req, res) => {
    if (!/^[a-f0-9]{16}$/.test(req.params.id)) return res.status(404).end();
    res.redirect(301, `/api/build/${req.params.id}/studio/`);
});

router.get(/^\/build\/([a-f0-9]{16})\/studio\/$/, async (req, res) => {
    const id = req.params[0];
    try {
        const manifest = await fileManifest(id);
        if (!manifest.length) {
            res.setHeader('Content-Security-Policy', STUDIO_CSP);
            return res.status(404).send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;color:#64748b">This session has no files yet (or the id is wrong).</body>');
        }

        const previewBase = `/api/build/${id}/preview/`;
        const images = manifest.filter(f => IMG_RE.test(f.path)).slice(0, 60);

        const texts = [];
        for (const f of manifest.filter(f => f.path.endsWith('.txt')).slice(0, 20)) {
            try {
                const raw = await fs.readFile(await safeResolve(id, f.path), 'utf8');
                const t = raw.trim().slice(0, 600);
                if (t) texts.push({ path: f.path, text: t });
            } catch { /* unreadable — skip */ }
        }

        const firstImg  = images[0] ? previewBase + images[0].path : '';
        const firstText = texts[0] ? texts[0].text : 'Click a text on the left to place it here — then click this caption to get 3 AI variants.';
        const firstQuery = images[0] ? slugToQuery(images[0].path) : '';

        const thumbsHtml = images.map(f => `
            <img class="thumb" loading="lazy" src="${esc(previewBase + f.path)}"
                 data-slug="${esc(slugToQuery(f.path))}" title="${esc(f.path)}"
                 onclick="selectImage(this)">`).join('');

        const textsHtml = texts.map(t => `
            <div class="txt-item" onclick="selectText(this.querySelector('.txt-body'))">
                <div class="txt-path">${esc(t.path)}</div>
                <div class="txt-body">${esc(t.text)}</div>
            </div>`).join('');

        const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Card Studio · ${esc(id)}</title>
<script src="https://unpkg.com/htmx.org@1.9.12"></script>
<script src="https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f4f5f7; color: #0f172a; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 5; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .sid { font-size: 12px; color: #94a3b8; font-family: ui-monospace, monospace; }
  header a { margin-left: auto; font-size: 13px; color: #2563eb; text-decoration: none; }
  .layout { display: grid; grid-template-columns: 360px 1fr; gap: 20px; padding: 20px; max-width: 1280px; margin: 0 auto; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
  .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin: 0 0 10px; }
  aside.panel { max-height: calc(100vh - 110px); overflow-y: auto; }
  .thumbs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
  .thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid transparent; }
  .thumb:hover { border-color: #93c5fd; }
  .thumb.sel { border-color: #2563eb; }
  .txt-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; }
  .txt-item:hover { border-color: #93c5fd; background: #f8fafc; }
  .txt-path { font-size: 11px; color: #94a3b8; font-family: ui-monospace, monospace; margin-bottom: 4px; }
  .txt-body { font-size: 13px; line-height: 1.45; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .composer { display: flex; flex-direction: column; gap: 16px; }
  #card { width: 440px; max-width: 100%; aspect-ratio: 1/1; background: #fff; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(15,23,42,.12); }
  #card-img { width: 100%; height: 56%; object-fit: cover; background: #e2e8f0; flex: none; }
  #card-body { flex: 1; padding: 18px 22px 6px; overflow: hidden; }
  #card-text { font-size: 14px; line-height: 1.5; white-space: pre-wrap; cursor: text; display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
  #card-text:hover { outline: 2px dashed #93c5fd; outline-offset: 4px; border-radius: 4px; }
  #card-text:focus { outline: 2px solid #2563eb; outline-offset: 4px; border-radius: 4px; }
  #card-brand { padding: 0 22px 14px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; flex: none; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .controls input { flex: 1 1 200px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
  .btn { border: none; border-radius: 8px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-weight: 500; }
  .btn-blue { background: #2563eb; color: #fff; }
  .btn-dark { background: #0f172a; color: #fff; }
  .hint { font-size: 12px; color: #94a3b8; }
  .recs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .rec-thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 10px; cursor: pointer; border: 2px solid transparent; }
  .rec-thumb:hover, .rec-thumb.sel { border-color: #2563eb; }
  .rec-text { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; cursor: pointer; background: #f8fafc; }
  .rec-text:hover { border-color: #2563eb; background: #eff6ff; }
  .rec-error { grid-column: 1 / -1; font-size: 13px; color: #b91c1c; background: #fef2f2; border-radius: 8px; padding: 10px 12px; }
  .htmx-indicator { display: none; font-size: 12px; color: #64748b; }
  .htmx-request .htmx-indicator, .htmx-request.htmx-indicator { display: inline; }
</style>
</head>
<body>
<header>
  <h1>Card Studio</h1>
  <span class="sid">${esc(id)}</span>
  <a href="${esc(previewBase)}" target="_blank" rel="noopener">Open full preview →</a>
</header>
<div class="layout">
  <aside class="panel">
    <h2>Images (${images.length})</h2>
    <div class="thumbs">${thumbsHtml || '<div class="hint">No images in this session.</div>'}</div>
    <h2>Texts (${texts.length})</h2>
    ${textsHtml || '<div class="hint">No caption files in this session.</div>'}
  </aside>
  <section class="composer">
    <div class="panel">
      <h2>Card preview</h2>
      <div id="card">
        <img id="card-img" src="${esc(firstImg)}" crossorigin="anonymous">
        <div id="card-body">
          <div id="card-text" contenteditable="true" spellcheck="false"
               title="Click to edit the caption directly">${esc(firstText)}</div>
        </div>
        <div id="card-brand">kaushalstack</div>
      </div>
      <div class="controls" style="margin-top:14px">
        <input id="img-query" name="query" value="${esc(firstQuery)}" placeholder="Image search query">
        <button class="btn btn-blue"
                hx-post="recommend-images" hx-include="#img-query"
                hx-target="#img-recs" hx-swap="innerHTML" hx-indicator="#img-spin">
          Recommend 3 from Unsplash
        </button>
        <span id="img-spin" class="htmx-indicator">searching Unsplash…</span>
        <button class="btn btn-blue"
                hx-post="recommend-text"
                hx-vals="js:{text: document.getElementById('card-text').innerText}"
                hx-target="#text-recs" hx-swap="innerHTML" hx-indicator="#text-spin">
          Get 3 copy variants
        </button>
        <button class="btn btn-dark" onclick="downloadCard()">Download card as PNG</button>
      </div>
      <div class="hint" style="margin-top:8px">Pick an image on the left · edit the caption directly on the card · “Get 3 copy variants” rewrites it with AI · download when it looks right.</div>
    </div>
    <div class="panel">
      <h2>Image recommendations <span id="img-spin2" class="htmx-indicator"></span></h2>
      <div id="img-recs" class="recs"><div class="hint">Hit “Recommend 3 from Unsplash” to see alternatives here.</div></div>
    </div>
    <div class="panel">
      <h2>Copy variants <span id="text-spin" class="htmx-indicator">writing variants…</span></h2>
      <div id="text-recs" class="recs" style="grid-template-columns:1fr"><div class="hint">Hit “Get 3 copy variants” to rewrite the current caption.</div></div>
    </div>
  </section>
</div>
<script>
  function selectImage(el) {
    document.getElementById('card-img').src = el.getAttribute('src');
    var slug = el.getAttribute('data-slug');
    if (slug) document.getElementById('img-query').value = slug;
    document.querySelectorAll('.thumb.sel, .rec-thumb.sel').forEach(function (n) { n.classList.remove('sel'); });
    el.classList.add('sel');
  }
  function selectText(el) {
    document.getElementById('card-text').innerText = el.innerText;
  }
  function downloadCard() {
    var card = document.getElementById('card');
    html2canvas(card, { useCORS: true, scale: 2, backgroundColor: '#ffffff' }).then(function (canvas) {
      var a = document.createElement('a');
      a.download = 'card-' + Date.now() + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
  }
</script>
</body>
</html>`;

        res.setHeader('Content-Security-Policy', STUDIO_CSP);
        res.set('Content-Type', 'text/html; charset=utf-8').send(page);
    } catch (err) {
        logger.error(`studio page error session=${id}: ${err.message}`);
        res.status(500).send('studio error');
    }
});

// -------------------------------------------------- recommend-images (htmx)

router.post(/^\/build\/([a-f0-9]{16})\/studio\/recommend-images$/, async (req, res) => {
    const id = req.params[0];
    const query = String(req.body?.query || '').trim().slice(0, 100);
    if (!query) return sendFragment(res, errFragment('Type an image search query first.'));
    if (!UNSPLASH_KEY) return sendFragment(res, errFragment('UNSPLASH_ACCESS_KEY is not configured on the server.'));
    try {
        const params = new URLSearchParams({
            query, per_page: '3', orientation: 'landscape', content_filter: 'high',
        });
        const r = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
            headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
        });
        if (!r.ok) return sendFragment(res, errFragment(`Unsplash returned ${r.status}.`));
        const hits = ((await r.json()).results || []).slice(0, 3);
        if (!hits.length) return sendFragment(res, errFragment(`No Unsplash results for “${query}”.`));

        // Save into the workspace under a studio- prefix + timestamp so we
        // never clobber the campaign's original assets/img-* files.
        const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
        const ts = Date.now();
        const saved = [];
        for (let i = 0; i < hits.length; i++) {
            try {
                const url = hits[i].urls?.regular || hits[i].urls?.small;
                if (!url) continue;
                const imgRes = await fetch(url);
                if (!imgRes.ok) continue;
                const buf = Buffer.from(await imgRes.arrayBuffer());
                const relPath = `assets/studio-${slug}-${ts}-${i + 1}.jpg`;
                const abs = await safeResolve(id, relPath);
                await fs.mkdir(path.dirname(abs), { recursive: true });
                await fs.writeFile(abs, buf);
                saved.push({ path: relPath, photographer: hits[i].user?.name || '' });
            } catch { /* skip this hit */ }
        }
        if (!saved.length) return sendFragment(res, errFragment('Could not download any of the Unsplash results.'));

        const previewBase = `/api/build/${id}/preview/`;
        const html = saved.map(s => `
            <img class="rec-thumb" src="${esc(previewBase + s.path)}"
                 data-slug="${esc(query)}" title="${esc(s.photographer ? 'Photo: ' + s.photographer : s.path)}"
                 onclick="selectImage(this)">`).join('');
        sendFragment(res, html);
    } catch (err) {
        logger.error(`studio recommend-images error session=${id}: ${err.message}`);
        sendFragment(res, errFragment('Image search failed — try again.'));
    }
});

// ---------------------------------------------------- recommend-text (htmx)

router.post(/^\/build\/([a-f0-9]{16})\/studio\/recommend-text$/, async (req, res) => {
    const id = req.params[0];
    const text = String(req.body?.text || '').trim().slice(0, 1200);
    if (!text) return sendFragment(res, errFragment('The card has no caption to rewrite yet.'));
    if (!OPENAI_KEY) return sendFragment(res, errFragment('OPENAI_API_KEY is not configured on the server.'));
    try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0.9,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'You are a senior social media copywriter. Rewrite the caption you are given in 3 distinct ways: (1) punchier and shorter, (2) warmer and more story-driven, (3) a bold hook-first version. Keep the same language, keep any hashtags or emojis that fit, and stay close to the original length unless the variant style demands otherwise. Respond with JSON: {"variants": ["...", "...", "..."]}',
                    },
                    { role: 'user', content: text },
                ],
            }),
        });
        if (!r.ok) return sendFragment(res, errFragment(`Copy model returned ${r.status}.`));
        const data = await r.json();
        let variants = [];
        try { variants = JSON.parse(data.choices?.[0]?.message?.content || '{}').variants || []; } catch { /* fall through */ }
        variants = variants.filter(v => typeof v === 'string' && v.trim()).slice(0, 3);
        if (!variants.length) return sendFragment(res, errFragment('The model did not return usable variants — try again.'));

        const html = variants.map(v => `
            <div class="rec-text" title="Click to use this copy" onclick="selectText(this)">${esc(v.trim())}</div>`).join('');
        sendFragment(res, html);
    } catch (err) {
        logger.error(`studio recommend-text error session=${id}: ${err.message}`);
        sendFragment(res, errFragment('Variant generation failed — try again.'));
    }
});

export default router;
