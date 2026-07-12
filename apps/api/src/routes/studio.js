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

// Visual reference scale for the space meter, not an enforced quota — a
// build workspace is mostly generated HTML/text plus a handful of images,
// so 50MB is already an unusually large session worth calling out.
const SPACE_METER_SCALE_BYTES = 50 * 1024 * 1024;

function humanBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function renderSpaceMeter(totalBytes, fileCount) {
    const pct = Math.min(100, (totalBytes / SPACE_METER_SCALE_BYTES) * 100);
    const level = pct >= 100 ? 'over' : pct >= 70 ? 'high' : 'ok';
    return `<span class="space-meter" title="${esc(fileCount)} files, ${esc(humanBytes(totalBytes))} total">
        <span class="space-bar"><span class="space-fill ${level}" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="space-label">${esc(humanBytes(totalBytes))}</span>
      </span>`;
}

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
        const totalBytes = manifest.reduce((sum, f) => sum + (f.bytes || 0), 0);
        const spaceMeter = renderSpaceMeter(totalBytes, manifest.length);

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
            <div class="thumb-wrap">
              <img class="thumb" loading="lazy" src="${esc(previewBase + f.path)}"
                   data-slug="${esc(slugToQuery(f.path))}" title="${esc(f.path)}"
                   onclick="selectImage(this)">
              <button class="thumb-del" type="button" data-path="${esc(f.path)}" title="Delete this image">✕</button>
            </div>`).join('');

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Lora:wght@400;600;700&family=Merriweather:wght@400;700&family=Oswald:wght@400;600;700&family=Space+Grotesk:wght@400;500;700&family=DM+Serif+Display&family=Bebas+Neue&family=Dancing+Script:wght@400;700&family=Anton&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f4f5f7; color: #0f172a; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 5; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .sid { font-size: 12px; color: #94a3b8; font-family: ui-monospace, monospace; }
  header a { margin-left: auto; font-size: 13px; color: #2563eb; text-decoration: none; }
  .space-meter { display: inline-flex; align-items: center; gap: 6px; }
  .space-bar { width: 60px; height: 6px; border-radius: 4px; background: #e2e8f0; overflow: hidden; }
  .space-fill { display: block; height: 100%; border-radius: 4px; background: #2563eb; }
  .space-fill.high { background: #d97706; }
  .space-fill.over { background: #dc2626; }
  .space-label { font-size: 11px; color: #94a3b8; font-family: ui-monospace, monospace; }
  /* minmax lets the middle (card) column shrink first — #card itself has
     max-width:100%, so it degrades gracefully instead of needing an early
     hard breakpoint. This kept the 3rd column from ever showing inside the
     ~1200-1280px Mr n Mr iframe under the old 1300px breakpoint. */
  .layout { display: grid; grid-template-columns: minmax(260px, 300px) minmax(380px, 1fr) minmax(260px, 320px); gap: 16px; padding: 20px; max-width: 1560px; margin: 0 auto; }
  @media (max-width: 880px) { .layout { grid-template-columns: 1fr; } }
  .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
  .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin: 0 0 10px; }
  aside.panel { max-height: calc(100vh - 110px); overflow-y: auto; }
  .thumbs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
  .thumb-wrap { position: relative; }
  .thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid transparent; display: block; }
  .thumb:hover { border-color: #93c5fd; }
  .thumb.sel { border-color: #2563eb; }
  .thumb-del { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; line-height: 16px; padding: 0;
    border: none; border-radius: 50%; background: rgba(15,23,42,.65); color: #fff; font-size: 11px; cursor: pointer;
    opacity: 0; transition: opacity .12s; }
  .thumb-wrap:hover .thumb-del { opacity: 1; }
  .thumb-del:hover { background: #dc2626; }
  .txt-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; }
  .txt-item:hover { border-color: #93c5fd; background: #f8fafc; }
  .txt-path { font-size: 11px; color: #94a3b8; font-family: ui-monospace, monospace; margin-bottom: 4px; }
  .txt-body { font-size: 13px; line-height: 1.45; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .composer { display: flex; flex-direction: column; gap: 16px; }
  .composer-side { display: flex; flex-direction: column; gap: 16px; }
  #card { width: 440px; max-width: 100%; aspect-ratio: 1/1; background: #fff; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(15,23,42,.12); }
  #card-img-wrap { position: relative; width: 100%; height: 56%; flex: none; }
  #card.overlay-text #card-img-wrap { height: 100%; }
  #card.overlay-text #card-body { display: none; }
  #card.overlay-text #card-brand { position: absolute; bottom: 8px; right: 10px; padding: 3px 9px; background: rgba(0,0,0,.4); border-radius: 6px; color: #fff; z-index: 3; }
  #card-img { width: 100%; height: 100%; object-fit: cover; background: #e2e8f0; display: block; }
  #img-gradient { position: absolute; inset: 0; pointer-events: none; }
  .zone { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; z-index: 2; pointer-events: none; }
  .zone > * { pointer-events: auto; }
  #zone-top { top: 0; }
  #zone-middle { top: 50%; transform: translateY(-50%); }
  #zone-bottom { bottom: 0; padding-bottom: 36px; }
  #card-body { flex: 1; padding: 18px 22px 6px; overflow: hidden; }
  .card-text-layer { font-size: 14px; line-height: 1.5; white-space: pre-wrap; cursor: text; display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
  .card-text-layer:hover { outline: 2px dashed #93c5fd; outline-offset: 4px; border-radius: 4px; }
  .card-text-layer:focus { outline: 2px solid #2563eb; outline-offset: 4px; border-radius: 4px; }
  #card-img-wrap .card-text-layer { text-shadow: 0 1px 4px rgba(0,0,0,.55); }
  .blur-box { position: absolute; z-index: 1; overflow: hidden; cursor: move; outline: 1px dashed rgba(255,255,255,.95); outline-offset: -1px; box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
  .blur-box canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
  .blur-box .bb-resize { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; background: #2563eb; border: 2px solid #fff; border-radius: 50%; cursor: nwse-resize; }
  .blur-box .bb-remove { position: absolute; right: 0; top: 0; width: 17px; height: 17px; background: rgba(15,23,42,.8); color: #fff; border: none; border-radius: 0 0 0 6px; font-size: 10px; line-height: 17px; text-align: center; cursor: pointer; padding: 0; }
  #card.exporting .blur-box { outline: none; box-shadow: none; }
  #card.exporting .bb-resize, #card.exporting .bb-remove { display: none; }
  #card-brand { padding: 0 22px 14px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; flex: none; }
  .layer-pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .layer-pill { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #cbd5e1; border-radius: 999px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #475569; background: #fff; }
  .layer-pill.sel { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
  .layer-pill .rm { color: #94a3b8; cursor: pointer; }
  .layer-pill .rm:hover { color: #dc2626; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .controls input { flex: 1 1 200px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
  .btn { border: none; border-radius: 8px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-weight: 500; }
  .btn-blue { background: #2563eb; color: #fff; }
  .btn-dark { background: #0f172a; color: #fff; }
  .hint { font-size: 12px; color: #94a3b8; }
  .style-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
  .style-row:last-child { margin-bottom: 0; }
  .style-row label { font-size: 12px; color: #64748b; min-width: 52px; }
  .style-row select, .style-row input[type=color] { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 9px; font-size: 13px; background: #fff; }
  .style-row input[type=range] { flex: 1 1 100px; }
  .style-row input[type=color] { padding: 2px; width: 40px; height: 32px; cursor: pointer; }
  .seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
  .seg button { border: none; background: #fff; padding: 6px 11px; font-size: 13px; cursor: pointer; color: #475569; }
  .seg button + button { border-left: 1px solid #cbd5e1; }
  .seg button.sel { background: #2563eb; color: #fff; }
  .recs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .rec-thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 10px; cursor: pointer; border: 2px solid transparent; }
  .rec-thumb:hover, .rec-thumb.sel { border-color: #2563eb; }
  .rec-text-item { margin-bottom: 4px; }
  .rec-text-meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
  .rec-text-platform { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #2563eb; flex: none; }
  .rec-text-why { font-size: 11.5px; color: #94a3b8; font-style: italic; }
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
  ${spaceMeter}
  <a href="${esc(previewBase)}" target="_blank" rel="noopener">Open full preview →</a>
</header>
<div class="layout">
  <aside class="panel">
    <h2 id="imagesHeading">Images (${images.length})</h2>
    <div class="thumbs">${thumbsHtml || '<div class="hint">No images in this session.</div>'}</div>
    <h2>Texts (${texts.length})</h2>
    ${textsHtml || '<div class="hint">No caption files in this session.</div>'}
  </aside>
  <section class="composer">
    <div class="panel">
      <h2>Card preview</h2>
      <div id="card">
        <div id="card-img-wrap">
          <img id="card-img" src="${esc(firstImg)}" crossorigin="anonymous">
          <div id="img-gradient"></div>
          <div class="zone" id="zone-top"></div>
          <div class="zone" id="zone-middle"></div>
          <div class="zone" id="zone-bottom"></div>
        </div>
        <div id="card-body">
          <div id="card-text" class="card-text-layer" contenteditable="true" spellcheck="false"
               data-position="below" data-font-key="system" data-color-hex="#0f172a" data-blur="0"
               onfocus="selectLayer('card-text')" onmousedown="selectLayer('card-text')"
               title="Click to edit the caption directly">${esc(firstText)}</div>
        </div>
        <div id="card-brand">kaushalstack</div>
      </div>
      <div class="controls" style="margin-top:14px">
        <input id="img-query" name="query" value="${esc(firstQuery)}" placeholder="Image search query">
        <button class="btn btn-blue"
                hx-post="recommend-images" hx-include="#img-query"
                hx-target="#img-recs" hx-swap="innerHTML" hx-indicator="#img-spin">
          Recommend 3 images
        </button>
        <span id="img-spin" class="htmx-indicator">searching Unsplash…</span>
        <button class="btn btn-blue"
                hx-post="recommend-text"
                hx-vals="js:{text: document.getElementById(activeTextId).innerText}"
                hx-target="#text-recs" hx-swap="innerHTML" hx-indicator="#text-spin">
          Get more text variants
        </button>
        <button class="btn btn-blue" type="button" onclick="addBlurBox()" title="Drag a soft-blur box over the image to hide a value (e.g. a number on a chart)">+ Blur box on image</button>
        <button class="btn btn-dark" onclick="downloadCard()">Download card as PNG</button>
      </div>
      <div class="hint" style="margin-top:8px">Pick an image on the left · edit the caption directly on the card · “Get more text variants” suggests a LinkedIn/Facebook/Twitter/Instagram rewrite with AI · download when it looks right.</div>
    </div>
  </section>
  <section class="composer-side">
    <div class="panel">
      <h2>Style</h2>
      <div class="style-row">
        <div id="layerPills" class="layer-pills"></div>
        <button class="btn btn-blue" type="button" onclick="addTextLayer()" style="padding:6px 12px;font-size:12px">+ Add text box</button>
      </div>
      <div class="style-row">
        <label for="textPosition">Position</label>
        <select id="textPosition" onchange="applyTextPosition(this.value)">
          <option value="below">Below image</option>
          <option value="over-top">Over image — top</option>
          <option value="over-middle">Over image — middle</option>
          <option value="over-bottom">Over image — bottom</option>
        </select>
      </div>
      <div class="style-row">
        <label for="gradientSelect">Gradient</label>
        <select id="gradientSelect" onchange="applyGradient(this.value)">
          <option value="none">None</option>
          <option value="darkbottom">Dark fade (bottom)</option>
          <option value="darktop">Dark fade (top)</option>
          <option value="warm">Warm sunset</option>
          <option value="cool">Cool blue</option>
          <option value="brand">Brand pink</option>
        </select>
      </div>
      <div class="style-row">
        <label for="fontSelect">Font</label>
        <select id="fontSelect" onchange="applyFont(this.value)">
          <option value="system">System</option>
          <option value="serif">Georgia (serif)</option>
          <option value="fraunces">Fraunces</option>
          <option value="poppins">Poppins</option>
          <option value="playfair">Playfair Display</option>
          <option value="montserrat">Montserrat</option>
          <option value="lora">Lora</option>
          <option value="merriweather">Merriweather</option>
          <option value="spacegrotesk">Space Grotesk</option>
          <option value="dmserif">DM Serif Display</option>
          <option value="oswald">Oswald (condensed)</option>
          <option value="bebas">Bebas Neue (display)</option>
          <option value="anton">Anton (heavy)</option>
          <option value="dancing">Dancing Script</option>
        </select>
        <label for="fontSize" style="min-width:32px">Size</label>
        <input type="range" id="fontSize" min="11" max="96" value="14" oninput="applyFontSize(this.value)">
        <span id="fontSizeVal" style="min-width:36px;font-size:12px;color:#64748b;font-variant-numeric:tabular-nums">14px</span>
      </div>
      <div class="style-row">
        <label>Style</label>
        <div class="seg">
          <button id="boldBtn" type="button" onclick="toggleBold()"><b>B</b></button>
          <button id="italicBtn" type="button" onclick="toggleItalic()"><i>I</i></button>
          <button id="blurBtn" type="button" title="Blur / redact this text so it can't be read (stays blurred in the download)" onclick="toggleBlur()">Blur</button>
        </div>
        <label for="textColor" style="min-width:32px">Color</label>
        <input type="color" id="textColor" value="#0f172a" oninput="applyColor(this.value)">
        <div class="seg">
          <button class="sel" data-align="left" onclick="applyAlign('left', this)">⟸</button>
          <button data-align="center" onclick="applyAlign('center', this)">≡</button>
          <button data-align="right" onclick="applyAlign('right', this)">⟹</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <h2>Image recommendations <span id="img-spin2" class="htmx-indicator"></span></h2>
      <div id="img-recs" class="recs"><div class="hint">Hit “Recommend 3 images” to see alternatives here.</div></div>
    </div>
    <div class="panel">
      <h2>Text variants <span id="text-spin" class="htmx-indicator">writing variants…</span></h2>
      <div id="text-recs" class="recs" style="grid-template-columns:1fr"><div class="hint">Hit “Get more text variants” for a LinkedIn/Facebook/Twitter/Instagram rewrite of the current caption.</div></div>
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
  function deleteImage(path, wrapEl) {
    if (!confirm('Delete this image from the session? This can\\'t be undone.')) return;
    fetch('image', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Delete failed (' + r.status + ')'); });
      if (wrapEl) wrapEl.remove();
      var heading = document.getElementById('imagesHeading');
      if (heading) heading.textContent = 'Images (' + document.querySelectorAll('.thumb-wrap').length + ')';
    }).catch(function (err) { alert(err.message); });
  }
  document.addEventListener('click', function (e) {
    var del = e.target.closest('.thumb-del');
    if (del) {
      e.stopPropagation();
      deleteImage(del.dataset.path, del.closest('.thumb-wrap'));
    }
  });
  function selectText(el) {
    document.getElementById(activeTextId).innerText = el.innerText;
  }

  var GRADIENTS = {
    none: '',
    darkbottom: 'linear-gradient(to top, rgba(0,0,0,.65), rgba(0,0,0,0) 60%)',
    darktop: 'linear-gradient(to bottom, rgba(0,0,0,.55), rgba(0,0,0,0) 55%)',
    warm: 'linear-gradient(135deg, rgba(232,93,117,.45), rgba(244,162,97,.15))',
    cool: 'linear-gradient(135deg, rgba(76,110,245,.4), rgba(139,92,246,.15))',
    brand: 'linear-gradient(180deg, rgba(232,93,117,.5), rgba(232,93,117,0) 55%)'
  };
  var FONTS = {
    system: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    fraunces: "'Fraunces', serif",
    poppins: "'Poppins', sans-serif",
    playfair: "'Playfair Display', serif",
    montserrat: "'Montserrat', sans-serif",
    lora: "'Lora', serif",
    merriweather: "'Merriweather', serif",
    spacegrotesk: "'Space Grotesk', sans-serif",
    dmserif: "'DM Serif Display', serif",
    oswald: "'Oswald', sans-serif",
    bebas: "'Bebas Neue', sans-serif",
    anton: "'Anton', sans-serif",
    dancing: "'Dancing Script', cursive"
  };
  function applyGradient(key) {
    document.getElementById('img-gradient').style.background = GRADIENTS[key] || '';
  }

  // ---- Text layers: multiple independent, selectable text boxes on one card.
  var layers = ['card-text'];
  var activeTextId = 'card-text';
  var layerSeq = 1;

  function renderLayerPills() {
    var html = layers.map(function (id, i) {
      var sel = id === activeTextId ? ' sel' : '';
      var rm = layers.length > 1
        ? '<span class="rm" onclick="event.stopPropagation();removeTextLayer(\\'' + id + '\\')">✕</span>'
        : '';
      return '<span class="layer-pill' + sel + '" onclick="selectLayer(\\'' + id + '\\')">Text ' + (i + 1) + rm + '</span>';
    }).join('');
    document.getElementById('layerPills').innerHTML = html;
  }

  function syncControlsToLayer(el) {
    document.getElementById('textPosition').value = el.dataset.position || 'below';
    document.getElementById('fontSelect').value = el.dataset.fontKey || 'system';
    var _fs = parseInt(el.style.fontSize, 10) || 14;
    document.getElementById('fontSize').value = _fs;
    document.getElementById('fontSizeVal').textContent = _fs + 'px';
    document.getElementById('textColor').value = el.dataset.colorHex || '#0f172a';
    document.getElementById('boldBtn').classList.toggle('sel', el.style.fontWeight === '700');
    document.getElementById('italicBtn').classList.toggle('sel', el.style.fontStyle === 'italic');
    document.getElementById('blurBtn').classList.toggle('sel', el.dataset.blur === '1');
    var align = el.style.textAlign || 'left';
    document.querySelectorAll('[data-align]').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.align === align);
    });
  }

  function selectLayer(id) {
    activeTextId = id;
    renderLayerPills();
    syncControlsToLayer(document.getElementById(id));
  }

  function updateOverlayTextClass() {
    var body = document.getElementById('card-body');
    document.getElementById('card').classList.toggle('overlay-text', body.children.length === 0);
  }

  function moveTextLayerToPosition(el, pos) {
    el.dataset.position = pos;
    if (pos === 'below') {
      document.getElementById('card-body').appendChild(el);
    } else {
      document.getElementById('zone-' + pos.replace('over-', '')).appendChild(el);
    }
    updateOverlayTextClass();
  }

  function addTextLayer() {
    layerSeq++;
    var id = 'text-layer-' + layerSeq;
    var el = document.createElement('div');
    el.id = id;
    el.className = 'card-text-layer';
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.innerText = 'New text';
    el.dataset.fontKey = 'system';
    el.dataset.colorHex = '#ffffff';
    el.dataset.blur = '0';
    el.style.color = '#ffffff';
    el.addEventListener('focus', function () { selectLayer(id); });
    el.addEventListener('mousedown', function () { selectLayer(id); });
    layers.push(id);
    moveTextLayerToPosition(el, 'over-top');
    // A second text box almost always means "on the image" — match the
    // same legibility nudge applyTextPosition does for the first switch.
    if (document.getElementById('gradientSelect').value === 'none') {
      document.getElementById('gradientSelect').value = 'darkbottom';
      applyGradient('darkbottom');
    }
    selectLayer(id);
  }

  function removeTextLayer(id) {
    if (layers.length <= 1) return;
    var el = document.getElementById(id);
    if (el) el.remove();
    layers = layers.filter(function (x) { return x !== id; });
    if (activeTextId === id) activeTextId = layers[0];
    renderLayerPills();
    syncControlsToLayer(document.getElementById(activeTextId));
    updateOverlayTextClass();
  }

  function applyTextPosition(pos) {
    var el = document.getElementById(activeTextId);
    var enteringOverlay = pos !== 'below' && el.dataset.position === 'below';
    moveTextLayerToPosition(el, pos);
    // First time moving THIS layer onto the image, nudge toward a combo
    // that's actually legible — dark text on a busy photo with no gradient
    // is a common first-try mistake. Still fully overridable afterwards.
    if (enteringOverlay) {
      document.getElementById('textColor').value = '#ffffff';
      applyColor('#ffffff');
      if (document.getElementById('gradientSelect').value === 'none') {
        document.getElementById('gradientSelect').value = 'darkbottom';
        applyGradient('darkbottom');
      }
    }
  }
  function applyFont(key) {
    var el = document.getElementById(activeTextId);
    el.dataset.fontKey = key;
    el.style.fontFamily = FONTS[key] || FONTS.system;
  }
  function applyFontSize(px) {
    document.getElementById(activeTextId).style.fontSize = px + 'px';
    document.getElementById('fontSizeVal').textContent = px + 'px';
  }
  // Redaction-safe blur: html2canvas (used for the PNG download) ignores CSS
  // filter:blur, so we blur via transparent text + a heavy text-shadow, which
  // it DOES paint — the name exports as an unreadable smear. Radius is in em so
  // it stays unreadable at any font size; the text colour drives the smear tint.
  function applyLayerColorBlur(el) {
    var hex = el.dataset.colorHex || '#0f172a';
    if (el.dataset.blur === '1') {
      el.style.color = 'transparent';
      el.style.textShadow = '0 0 0.55em ' + hex + ', 0 0 0.32em ' + hex + ', 0 0 0.32em ' + hex;
    } else {
      el.style.color = hex;
      el.style.textShadow = 'none';
    }
  }
  function applyColor(hex) {
    var el = document.getElementById(activeTextId);
    el.dataset.colorHex = hex;
    applyLayerColorBlur(el);
  }
  function toggleBlur() {
    var el = document.getElementById(activeTextId);
    el.dataset.blur = el.dataset.blur === '1' ? '0' : '1';
    applyLayerColorBlur(el);
    document.getElementById('blurBtn').classList.toggle('sel', el.dataset.blur === '1');
  }
  function toggleBold() {
    var t = document.getElementById(activeTextId);
    var on = t.style.fontWeight === '700';
    t.style.fontWeight = on ? '' : '700';
    document.getElementById('boldBtn').classList.toggle('sel', !on);
  }
  function toggleItalic() {
    var t = document.getElementById(activeTextId);
    var on = t.style.fontStyle === 'italic';
    t.style.fontStyle = on ? '' : 'italic';
    document.getElementById('italicBtn').classList.toggle('sel', !on);
  }
  function applyAlign(align, btn) {
    document.getElementById(activeTextId).style.textAlign = align;
    btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('sel'); });
    btn.classList.add('sel');
  }
  renderLayerPills();

  // ---- Blur boxes: redact a region of the card IMAGE (e.g. a value on a
  // chart). html2canvas ignores CSS filter:blur, so each box paints a soft
  // bilinear blur of the underlying image into a <canvas> — real pixels that
  // survive the PNG export. Falls back to a solid frost if the source image
  // is cross-origin and taints the canvas.
  var blurBoxes = [];
  var BLUR_SOFTNESS = 12; // higher = blurrier (downscale factor before upscale)

  function imgCoverMap() {
    var img = document.getElementById('card-img');
    var wrap = document.getElementById('card-img-wrap');
    var Wd = wrap.clientWidth, Hd = wrap.clientHeight;
    var Wn = img.naturalWidth, Hn = img.naturalHeight;
    if (!Wn || !Hn) return null;
    var scale = Math.max(Wd / Wn, Hd / Hn); // object-fit: cover
    return { img: img, scale: scale, offX: (Wn * scale - Wd) / 2, offY: (Hn * scale - Hd) / 2 };
  }

  function renderBlurBox(box) {
    var m = imgCoverMap();
    if (!m) return;
    var bw = box.offsetWidth, bh = box.offsetHeight;
    if (bw < 2 || bh < 2) return;
    var canvas = box.querySelector('canvas');
    canvas.width = Math.round(bw); canvas.height = Math.round(bh);
    var ctx = canvas.getContext('2d');
    try {
      // box (wrap coords) -> source-image pixel rect, undoing the cover crop
      var sx = (box.offsetLeft + m.offX) / m.scale, sy = (box.offsetTop + m.offY) / m.scale;
      var sw = bw / m.scale, sh = bh / m.scale;
      var tw = Math.max(2, Math.round(bw / BLUR_SOFTNESS)), th = Math.max(2, Math.round(bh / BLUR_SOFTNESS));
      var tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
      var tctx = tmp.getContext('2d'); tctx.imageSmoothingEnabled = true;
      tctx.drawImage(m.img, sx, sy, sw, sh, 0, 0, tw, th);  // downsample the region
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, tw, th, 0, 0, canvas.width, canvas.height); // upscale -> soft blur
    } catch (e) {
      ctx.fillStyle = 'rgba(120,120,120,.92)'; // tainted image — solid frost still hides it
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  function renderAllBlurBoxes() { blurBoxes.forEach(renderBlurBox); }

  function addBlurBox() {
    var wrap = document.getElementById('card-img-wrap');
    var box = document.createElement('div');
    box.className = 'blur-box';
    var w = Math.round(wrap.clientWidth * 0.42), h = Math.round(wrap.clientHeight * 0.16);
    box.style.width = w + 'px'; box.style.height = h + 'px';
    box.style.left = Math.round((wrap.clientWidth - w) / 2) + 'px';
    box.style.top = Math.round((wrap.clientHeight - h) / 2) + 'px';
    box.innerHTML = '<canvas></canvas><button class="bb-remove" title="Remove">&#10005;</button><div class="bb-resize"></div>';
    wrap.appendChild(box);
    blurBoxes.push(box);
    box.querySelector('.bb-remove').addEventListener('click', function (e) {
      e.stopPropagation(); box.remove();
      blurBoxes = blurBoxes.filter(function (b) { return b !== box; });
    });
    makeBoxInteractive(box);
    renderBlurBox(box);
  }

  function makeBoxInteractive(box) {
    var wrap = document.getElementById('card-img-wrap');
    var resize = box.querySelector('.bb-resize');
    var mode = null, sx0, sy0, l0, t0, w0, h0, raf = 0;
    function onMove(e) {
      var dx = e.clientX - sx0, dy = e.clientY - sy0;
      if (mode === 'move') {
        box.style.left = Math.max(0, Math.min(l0 + dx, wrap.clientWidth - box.offsetWidth)) + 'px';
        box.style.top = Math.max(0, Math.min(t0 + dy, wrap.clientHeight - box.offsetHeight)) + 'px';
      } else {
        box.style.width = Math.max(16, Math.min(w0 + dx, wrap.clientWidth - box.offsetLeft)) + 'px';
        box.style.height = Math.max(12, Math.min(h0 + dy, wrap.clientHeight - box.offsetTop)) + 'px';
      }
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; renderBlurBox(box); });
    }
    function onUp() { mode = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); renderBlurBox(box); }
    box.addEventListener('mousedown', function (e) {
      if (e.target === resize || e.target.className === 'bb-remove') return;
      mode = 'move'; sx0 = e.clientX; sy0 = e.clientY; l0 = box.offsetLeft; t0 = box.offsetTop;
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); e.preventDefault();
    });
    resize.addEventListener('mousedown', function (e) {
      mode = 'resize'; sx0 = e.clientX; sy0 = e.clientY; w0 = box.offsetWidth; h0 = box.offsetHeight;
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); e.preventDefault(); e.stopPropagation();
    });
  }

  // Re-blur against the new pixels whenever the card image is swapped.
  (function () { var ci = document.getElementById('card-img'); if (ci) ci.addEventListener('load', renderAllBlurBoxes); })();

  function downloadCard() {
    var card = document.getElementById('card');
    card.classList.add('exporting'); // hide blur-box handles/borders in the PNG
    // Webfonts (Fraunces/Poppins/Playfair) load async — capturing before
    // they're ready silently rasterizes the fallback font instead.
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      return html2canvas(card, { useCORS: true, scale: 2, backgroundColor: '#ffffff' });
    }).then(function (canvas) {
      var a = document.createElement('a');
      a.download = 'card-' + Date.now() + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    }).finally(function () { card.classList.remove('exporting'); });
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
                        content: 'You are a senior social media copywriter. Rewrite the caption you are given as 4 platform-tailored variants: LinkedIn, Facebook, Twitter/X, and Instagram. Tune tone, length, and hashtag/emoji use to what actually performs on each platform (LinkedIn: professional, credibility-led, minimal emoji; Facebook: warm, conversational, community-oriented; Twitter/X: short, punchy, hook-first; Instagram: visual-storytelling, emoji-friendly, hashtag-friendly). Keep the same language and core message as the original. For each variant also give a one-sentence "why" explaining the specific tailoring choice for that platform\'s audience/format — this is shown to the user as context, never inserted into the post itself, so it should explain the REASONING, not repeat the copy. Respond with JSON: {"variants": [{"platform": "LinkedIn", "text": "...", "why": "..."}, {"platform": "Facebook", "text": "...", "why": "..."}, {"platform": "Twitter/X", "text": "...", "why": "..."}, {"platform": "Instagram", "text": "...", "why": "..."}]}',
                    },
                    { role: 'user', content: text },
                ],
            }),
        });
        if (!r.ok) return sendFragment(res, errFragment(`Copy model returned ${r.status}.`));
        const data = await r.json();
        let variants = [];
        try { variants = JSON.parse(data.choices?.[0]?.message?.content || '{}').variants || []; } catch { /* fall through */ }
        variants = variants
            .filter(v => v && typeof v.text === 'string' && v.text.trim())
            .map(v => ({
                platform: typeof v.platform === 'string' && v.platform.trim() ? v.platform.trim().slice(0, 30) : 'Variant',
                text: v.text.trim().slice(0, 800),
                why: typeof v.why === 'string' ? v.why.trim().slice(0, 200) : '',
            }))
            .slice(0, 4);
        if (!variants.length) return sendFragment(res, errFragment('The model did not return usable variants — try again.'));

        const html = variants.map(v => `
            <div class="rec-text-item">
              <div class="rec-text-meta">
                <span class="rec-text-platform">${esc(v.platform)}</span>
                ${v.why ? `<span class="rec-text-why">${esc(v.why)}</span>` : ''}
              </div>
              <div class="rec-text" title="Click to use this copy" onclick="selectText(this)">${esc(v.text)}</div>
            </div>`).join('');
        sendFragment(res, html);
    } catch (err) {
        logger.error(`studio recommend-text error session=${id}: ${err.message}`);
        sendFragment(res, errFragment('Variant generation failed — try again.'));
    }
});

// ------------------------------------------------------- delete-image (JSON)

router.delete(/^\/build\/([a-f0-9]{16})\/studio\/image$/, async (req, res) => {
    const id = req.params[0];
    const relPath = String(req.body?.path || '');
    if (!IMG_RE.test(relPath)) return res.status(400).json({ error: 'Not an image path.' });
    try {
        const abs = await safeResolve(id, relPath);
        await fs.unlink(abs);
        res.json({ ok: true });
    } catch (err) {
        logger.error(`studio delete-image error session=${id} path=${relPath}: ${err.message}`);
        res.status(404).json({ error: 'Could not delete that file — it may already be gone.' });
    }
});

export default router;
