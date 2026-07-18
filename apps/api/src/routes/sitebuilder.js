// Site Builder — a visual page editor over a build session's workspace.
// Shared by ALL partner portals (like Card Studio): one deploy serves everyone.
//
// GET  /build/:id/sitebuilder/          → the editor: pages/assets tree (left),
//                                         canvas iframe (middle), properties (right)
// GET  /build/:id/sitebuilder/manifest  → JSON {pages, assets} of the workspace
// POST /build/:id/sitebuilder/save      → {path, html} writes an edited page back
//
// The canvas iframe loads the page through /api/build/:id/preview/ — same
// origin as this editor, so the parent script reaches straight into the
// iframe DOM: click-to-select, inline style edits, element moves, palette
// drops. Saving serializes the cleaned document and writes it to the
// session workspace.

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { safeResolve, fileManifest } from '../builder/workspace.js';

// Same media rules as Card Studio uploads: images + short video, 80MB cap.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /^(image\/(jpeg|png|webp|gif|svg\+xml)|video\/(mp4|webm|quicktime))$/.test(file.mimetype)),
});

// Same embedding rules as Card Studio: partner portals iframe this page.
const SB_FRAME_ANCESTORS = ["'self'", ...String(process.env.STUDIO_FRAME_ANCESTORS || 'https://mrnmr.srv1562298.hstgr.cloud').split(',').map((s) => s.trim()).filter(Boolean)];
const SB_CSP = `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src *; font-src * data: https:; frame-ancestors ${SB_FRAME_ANCESTORS.join(' ')};`;

const PAGE_RE = /\.html?$/i;
const IMG_RE = /\.(jpe?g|png|webp|gif|svg)$/i;
const MAX_PAGE_BYTES = 1024 * 1024; // generated landing pages can be sizable

const router = Router({ strict: true });

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// macOS AppleDouble (._*) and .DS_Store junk sometimes rides in via zips —
// hide it from the tree entirely.
const JUNK_SEG = (p) => p.split('/').some((seg) => seg.startsWith('._') || seg === '.DS_Store');

function splitManifest(manifest) {
    const clean = manifest.filter((f) => !JUNK_SEG(f.path));
    const pages = clean.filter((f) => PAGE_RE.test(f.path)).map((f) => f.path)
        .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
    const assets = clean.filter((f) => !PAGE_RE.test(f.path)).map((f) => f.path).sort();
    return { pages, assets };
}

router.get('/build/:id/sitebuilder', (req, res) => {
    if (!/^[a-f0-9]{16}$/.test(req.params.id)) return res.status(404).end();
    res.redirect(301, `/api/build/${req.params.id}/sitebuilder/`);
});

router.get(/^\/build\/([a-f0-9]{16})\/sitebuilder\/manifest$/, async (req, res) => {
    try {
        res.json(splitManifest(await fileManifest(req.params[0])));
    } catch {
        res.status(404).json({ error: 'session not found' });
    }
});

// Write an edited page back. Pages only (.html), capped, traversal-safe.
router.post(/^\/build\/([a-f0-9]{16})\/sitebuilder\/save$/, async (req, res) => {
    const id = req.params[0];
    const rel = String(req.body?.path || '');
    const html = req.body?.html;
    if (!PAGE_RE.test(rel)) return res.status(400).json({ error: 'only .html pages can be saved' });
    if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'html required' });
    if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES) return res.status(413).json({ error: 'page too large (max 1MB)' });
    try {
        const abs = await safeResolve(id, rel);
        await fs.stat(abs); // only overwrite pages that already exist
        await fs.writeFile(abs, html, 'utf8');
        res.json({ ok: true, path: rel, bytes: Buffer.byteLength(html, 'utf8') });
    } catch {
        res.status(404).json({ error: 'page not found in this session' });
    }
});

// Upload an asset into the session workspace (multipart field: "file").
router.post(/^\/build\/([a-f0-9]{16})\/sitebuilder\/upload$/, upload.single('file'), async (req, res) => {
    const id = req.params[0];
    if (!req.file) return res.status(400).json({ error: 'no file received (images and mp4/webm video only)' });
    const safeName = path.basename(req.file.originalname || 'asset')
        .replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'asset';
    const rel = `assets/sb-${Date.now()}-${safeName}`;
    try {
        const abs = await safeResolve(id, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, req.file.buffer);
        res.json({ ok: true, path: rel, bytes: req.file.buffer.length });
    } catch (e) {
        res.status(500).json({ error: `upload failed: ${e.message}` });
    }
});

// ---------------------------------------------------------------- the editor
router.get(/^\/build\/([a-f0-9]{16})\/sitebuilder\/$/, async (req, res) => {
    const id = req.params[0];
    let manifest;
    try {
        manifest = await fileManifest(id);
    } catch {
        manifest = [];
    }
    res.setHeader('Content-Security-Policy', SB_CSP);
    // The editor evolves often — never let browsers serve a stale copy.
    res.setHeader('Cache-Control', 'no-store');
    if (!manifest.length) {
        return res.status(404).send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;color:#64748b">This session has no files yet (or the id is wrong).</body>');
    }
    const { pages, assets } = splitManifest(manifest);
    const previewBase = `/api/build/${id}/preview/`;
    const saveUrl = `/api/build/${id}/sitebuilder/save`;

    res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site Builder</title>
<style>
  :root { --ink:#0f172a; --mut:#64748b; --line:#e2e8f0; --accent:#4f46e5; --bg:#f1f5f9; --panel:#ffffff; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin:0; font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:var(--ink); background:var(--bg); }
  .app { display:grid; grid-template-columns: 240px 1fr 280px; height:100vh; }
  .col { overflow-y:auto; background:var(--panel); }
  .col.left { border-right:1px solid var(--line); padding:12px; }
  .col.right { border-left:1px solid var(--line); padding:12px; }
  .center { display:flex; flex-direction:column; min-width:0; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--mut); margin:14px 0 6px; }
  h2:first-child { margin-top:0; }
  .hint { font-size:11px; color:var(--mut); line-height:1.5; }
  /* tree */
  .tree { margin-bottom:4px; }
  .node { display:flex; align-items:center; gap:6px; padding:4px 6px; border-radius:6px; cursor:pointer; font-size:12.5px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .node:hover { background:#f8fafc; }
  .node.active { background:#eef2ff; color:var(--accent); font-weight:600; }
  .node .ico { flex:none; width:14px; text-align:center; color:var(--mut); }
  .node.active .ico { color:var(--accent); }
  .grouphead { display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; }
  .grouphead .caret { transition: transform .15s; font-size:10px; color:var(--mut); }
  .grouphead.closed .caret { transform: rotate(-90deg); }
  .groupbody.closed { display:none; }
  #assetsTree { max-height:240px; overflow-y:auto; }
  .upbtn { width:100%; border:1px dashed #cbd5e1; background:#f8fafc; border-radius:8px; padding:7px 8px; font-size:12px; cursor:pointer; color:var(--mut); margin:2px 0 6px; }
  .upbtn:hover { border-color:var(--accent); color:var(--accent); }
  .upbtn:disabled { opacity:.5; cursor:wait; }
  #upStatus { font-size:11px; margin-top:4px; }
  #upStatus.err { color:#b91c1c; }
  #upStatus.ok { color:#15803d; }
  .assetprev { margin:8px 0; border:1px solid var(--line); border-radius:8px; padding:8px; }
  .assetprev img { max-width:100%; border-radius:6px; display:block; margin-bottom:6px; }
  .assetprev .path { font-size:10.5px; color:var(--mut); word-break:break-all; }
  /* palette */
  .palette { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .pal-item { border:1px dashed #cbd5e1; border-radius:8px; padding:7px 8px; font-size:12px; cursor:grab; background:#f8fafc; user-select:none; }
  .pal-item:hover { border-color:var(--accent); color:var(--accent); }
  /* toolbar + canvas */
  .toolbar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--panel); border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .toolbar .pagename { font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px; }
  .toolbar .spacer { flex:1; }
  .btn { border:1px solid var(--line); background:#fff; border-radius:8px; padding:6px 12px; font-size:12.5px; cursor:pointer; color:var(--ink); }
  .btn:hover { border-color:#94a3b8; }
  .btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  .btn.primary:disabled { opacity:.5; cursor:not-allowed; }
  .btn.vp { padding:6px 9px; }
  .btn.vp.on { background:#eef2ff; border-color:var(--accent); color:var(--accent); }
  #status { font-size:12px; color:var(--mut); }
  #status.ok { color:#15803d; }
  #status.err { color:#b91c1c; }
  #status.dirty { color:#b45309; }
  .canvaswrap { flex:1; overflow:auto; display:flex; justify-content:center; padding:16px; }
  #canvas { width:100%; max-width:1200px; height:100%; min-height:600px; border:1px solid var(--line); border-radius:10px; background:#fff; box-shadow:0 4px 18px rgba(15,23,42,.06); transition:max-width .2s; }
  .canvaswrap.mobile #canvas { max-width:390px; }
  /* right panel */
  .crumbs { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
  .crumb { font-size:11px; background:#f1f5f9; border:1px solid var(--line); border-radius:6px; padding:2px 7px; cursor:pointer; color:var(--mut); }
  .crumb.cur { background:#eef2ff; border-color:var(--accent); color:var(--accent); font-weight:600; }
  .tabs { display:flex; gap:4px; margin-bottom:10px; }
  .tab { flex:1; text-align:center; border:1px solid var(--line); border-radius:8px; padding:6px 0; font-size:12px; cursor:pointer; color:var(--mut); }
  .tab.on { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  .field { margin-bottom:10px; }
  .field label { display:block; font-size:11px; color:var(--mut); margin-bottom:4px; }
  .field input[type=text], .field input[type=number], .field select, .field textarea {
    width:100%; border:1px solid var(--line); border-radius:8px; padding:6px 8px; font-size:12.5px; font-family:inherit; }
  .field textarea { resize:vertical; min-height:64px; }
  .field input:focus, .field select:focus, .field textarea:focus { outline:none; border-color:var(--accent); }
  .rowflex { display:flex; gap:6px; }
  .rowflex > * { flex:1; }
  .swatchrow { display:flex; gap:6px; align-items:center; }
  .swatchrow input[type=color] { width:34px; height:28px; padding:1px; border:1px solid var(--line); border-radius:6px; background:#fff; }
  .swatchrow .clear { font-size:11px; color:var(--mut); cursor:pointer; text-decoration:underline; }
  .btnrow { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px; }
  .mini { border:1px solid var(--line); background:#fff; border-radius:7px; padding:5px 9px; font-size:12px; cursor:pointer; }
  .mini:hover { border-color:var(--accent); color:var(--accent); }
  .mini.on { background:#eef2ff; border-color:var(--accent); color:var(--accent); }
  .mini.danger:hover { border-color:#b91c1c; color:#b91c1c; }
  .noselect { color:var(--mut); font-size:12px; padding:18px 4px; text-align:center; }
  .tagline { font-size:11px; color:var(--mut); margin-bottom:8px; }
  .tagline b { color:var(--ink); font-family:ui-monospace,monospace; }
</style>
</head>
<body>
<div class="app">
  <aside class="col left">
    <h2>Pages</h2>
    <div class="tree" id="pagesTree"></div>
    <div class="grouphead" id="assetsHead"><span class="caret">▾</span><h2 style="margin:8px 0">Assets</h2></div>
    <button class="upbtn" id="upBtn">⬆ Upload asset (image / video)</button>
    <input type="file" id="upFile" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm">
    <div id="upStatus"></div>
    <div class="groupbody tree" id="assetsTree"></div>
    <div id="assetPrev"></div>
    <h2>Elements</h2>
    <div class="palette" id="palette">
      <div class="pal-item" draggable="true" data-el="header">H&nbsp;&nbsp;Header</div>
      <div class="pal-item" draggable="true" data-el="paragraph">¶&nbsp;&nbsp;Paragraph</div>
      <div class="pal-item" draggable="true" data-el="divider">—&nbsp;&nbsp;Divider</div>
      <div class="pal-item" draggable="true" data-el="form">▭&nbsp;&nbsp;Form</div>
      <div class="pal-item" draggable="true" data-el="media">▦&nbsp;&nbsp;Image</div>
      <div class="pal-item" draggable="true" data-el="columns">◫&nbsp;&nbsp;Columns</div>
      <div class="pal-item" draggable="true" data-el="button">⬭&nbsp;&nbsp;Button</div>
    </div>
    <div class="hint" style="margin-top:8px">Drag an element into the page, or select something first and click a palette item to insert after it.</div>
  </aside>

  <main class="center">
    <div class="toolbar">
      <span class="pagename" id="pageName">—</span>
      <span id="status"></span>
      <span class="spacer"></span>
      <button class="btn vp on" id="vpDesk" title="Desktop width">🖥</button>
      <button class="btn vp" id="vpMob" title="Mobile width">📱</button>
      <button class="btn" id="openBtn">Open page ↗</button>
      <button class="btn" id="revertBtn">Revert</button>
      <button class="btn primary" id="saveBtn">Save</button>
    </div>
    <div class="canvaswrap" id="canvasWrap">
      <iframe id="canvas" title="Page canvas"></iframe>
    </div>
  </main>

  <aside class="col right" id="props">
    <div class="noselect" id="noSel">Click any element on the page to edit it.</div>
    <div id="selPanel" style="display:none">
      <div class="crumbs" id="crumbs"></div>
      <div class="tagline">Selected: <b id="selTag"></b></div>
      <div class="btnrow">
        <button class="mini" id="mvUp" title="Move before previous sibling">↑ Up</button>
        <button class="mini" id="mvDown" title="Move after next sibling">↓ Down</button>
        <button class="mini" id="dupBtn">⧉ Duplicate</button>
        <button class="mini danger" id="delBtn">✕ Delete</button>
      </div>
      <div class="tabs">
        <div class="tab on" data-tab="settings">Settings</div>
        <div class="tab" data-tab="style">Style</div>
      </div>

      <div id="tab-settings">
        <div class="field" id="fText" style="display:none">
          <label>Text</label>
          <textarea id="inText"></textarea>
        </div>
        <div class="field" id="fHref" style="display:none">
          <label>Link (URL or pick a page/asset)</label>
          <input type="text" id="inHref" placeholder="https://… or index.html">
          <select id="selHref" style="margin-top:5px"><option value="">— link to a page or asset —</option></select>
          <label style="margin-top:6px"><input type="checkbox" id="inNewTab" style="width:auto"> open in new tab</label>
        </div>
        <div class="field" id="fSrc" style="display:none">
          <label>Image</label>
          <select id="selSrc"><option value="">— pick an asset —</option></select>
          <input type="text" id="inSrc" placeholder="or paste an image URL" style="margin-top:5px">
        </div>
        <div class="field" id="fAlt" style="display:none">
          <label>Alt text</label>
          <input type="text" id="inAlt">
        </div>
      </div>

      <div id="tab-style" style="display:none">
        <div class="field"><label>Text color</label>
          <div class="swatchrow"><input type="color" id="stColor"><span class="clear" data-clear="color">clear</span></div>
        </div>
        <div class="field"><label>Background</label>
          <div class="swatchrow"><input type="color" id="stBg"><span class="clear" data-clear="backgroundColor">clear</span></div>
        </div>
        <div class="field"><label>Font</label>
          <select id="stFont">
            <option value="">(inherit)</option>
            <option value="Georgia, 'Times New Roman', serif">Serif — Georgia</option>
            <option value="'Playfair Display', Georgia, serif">Serif — Playfair</option>
            <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">Sans — System</option>
            <option value="'Inter', -apple-system, sans-serif">Sans — Inter</option>
            <option value="'Courier New', ui-monospace, monospace">Monospace</option>
          </select>
        </div>
        <div class="rowflex">
          <div class="field"><label>Size (px)</label><input type="number" id="stSize" min="8" max="120" placeholder="—"></div>
          <div class="field"><label>Radius (px)</label><input type="number" id="stRadius" min="0" max="200" placeholder="—"></div>
        </div>
        <div class="btnrow">
          <button class="mini" id="stBold">B</button>
          <button class="mini" id="stItalic" style="font-style:italic">I</button>
        </div>
        <div class="field"><label>Align (also moves images/buttons left ↔ right)</label>
          <div class="btnrow">
            <button class="mini" data-align="left">⇤ Left</button>
            <button class="mini" data-align="center">⇥⇤ Center</button>
            <button class="mini" data-align="right">⇥ Right</button>
          </div>
        </div>
        <div class="rowflex">
          <div class="field"><label>Padding (px)</label><input type="number" id="stPad" min="0" max="200" placeholder="—"></div>
          <div class="field"><label>Margin (px)</label><input type="number" id="stMar" min="0" max="200" placeholder="—"></div>
        </div>
        <div class="btnrow"><button class="mini danger" id="stClear">Clear all styles on this element</button></div>
      </div>
    </div>
  </aside>
</div>

<script>
(function () {
  'use strict';
  var PREVIEW = ${JSON.stringify(previewBase)};
  var SAVE_URL = ${JSON.stringify(saveUrl)};
  var PAGES = ${JSON.stringify(pages)};
  var ASSETS = ${JSON.stringify(assets)};
  var IMG_ASSETS = ASSETS.filter(function (a) { return /\\.(jpe?g|png|webp|gif|svg)$/i.test(a); });

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('canvas');
  var currentPage = null;
  var doc = null;          // iframe contentDocument once loaded
  var sel = null;          // selected element inside the iframe
  var hoverEl = null;
  var dirty = false;

  function setStatus(text, cls) {
    var s = $('status');
    s.textContent = text || '';
    s.className = cls || '';
  }
  function markDirty() {
    if (!dirty) { dirty = true; setStatus('Unsaved changes', 'dirty'); }
  }

  // ------------------------------------------------------------- left: trees
  function nodeHtml(p, ico, cls) {
    return '<div class="node ' + (cls || '') + '" data-path="' + p.replace(/"/g, '&quot;') + '">'
      + '<span class="ico">' + ico + '</span><span>' + p + '</span></div>';
  }
  function renderTrees() {
    $('pagesTree').innerHTML = PAGES.map(function (p) {
      return nodeHtml(p, '📄', p === currentPage ? 'active' : '');
    }).join('') || '<div class="hint">No pages in this session.</div>';
    $('assetsTree').innerHTML = ASSETS.map(function (p) {
      var ico = /\\.(jpe?g|png|webp|gif|svg)$/i.test(p) ? '🖼' : /\\.css$/i.test(p) ? '🎨' : /\\.js$/i.test(p) ? '⚙️' : '📎';
      return nodeHtml(p, ico, '');
    }).join('') || '<div class="hint">No assets.</div>';
  }
  $('pagesTree').addEventListener('click', function (e) {
    var n = e.target.closest('.node');
    if (n) loadPage(n.getAttribute('data-path'));
  });
  $('assetsTree').addEventListener('click', function (e) {
    var n = e.target.closest('.node');
    if (!n) return;
    var p = n.getAttribute('data-path');
    var isImg = /\\.(jpe?g|png|webp|gif|svg)$/i.test(p);
    var html = '<div class="assetprev">';
    if (isImg) html += '<img src="' + PREVIEW + p + '">';
    html += '<div class="path">' + p + '</div>';
    if (isImg && sel && sel.tagName === 'IMG') html += '<button class="mini" id="useAsset" style="margin-top:6px">Use in selected image</button>';
    html += '</div>';
    $('assetPrev').innerHTML = html;
    var use = $('useAsset');
    if (use) use.onclick = function () { if (sel && sel.tagName === 'IMG') { sel.src = relSrc(p); syncSettings(); markDirty(); } };
  });
  $('assetsHead').addEventListener('click', function () {
    $('assetsHead').classList.toggle('closed');
    $('assetsTree').classList.toggle('closed');
  });

  // ------------------------------------------------------------- upload
  $('upBtn').addEventListener('click', function () { $('upFile').click(); });
  $('upFile').addEventListener('change', function () {
    var f = $('upFile').files[0];
    $('upFile').value = '';
    if (!f) return;
    var st = $('upStatus');
    $('upBtn').disabled = true;
    st.textContent = 'Uploading ' + f.name + '…';
    st.className = '';
    var fd = new FormData();
    fd.append('file', f);
    fetch('upload', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'upload failed');
        var p = res.d.path;
        ASSETS.push(p);
        if (/\\.(jpe?g|png|webp|gif|svg)$/i.test(p)) IMG_ASSETS.push(p);
        renderTrees();
        fillLinkPickers();
        st.textContent = 'Uploaded ✓ ' + p.split('/').pop();
        st.className = 'ok';
        // open its preview so "Use in selected image" is one click away
        var nodes = document.querySelectorAll('#assetsTree .node');
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].getAttribute('data-path') === p) { nodes[i].click(); break; }
        }
      })
      .catch(function (err) { st.textContent = err.message; st.className = 'err'; })
      .then(function () { $('upBtn').disabled = false; });
  });

  // Compute a relative src for an asset from the current page's directory.
  function relSrc(assetPath) {
    var dir = currentPage.indexOf('/') >= 0 ? currentPage.slice(0, currentPage.lastIndexOf('/') + 1) : '';
    if (dir && assetPath.indexOf(dir) === 0) return assetPath.slice(dir.length);
    return (dir ? '../'.repeat(dir.split('/').length - 1) : '') + assetPath;
  }

  // ------------------------------------------------------------- canvas load
  function loadPage(p, keepDirtyCheck) {
    if (dirty && keepDirtyCheck !== false && !confirm('You have unsaved changes on ' + currentPage + ' — discard them?')) return;
    currentPage = p;
    dirty = false;
    select(null);
    setStatus('');
    $('pageName').textContent = p;
    renderTrees();
    canvas.src = PREVIEW + p + '?sb=' + Date.now();
  }

  canvas.addEventListener('load', function () {
    try { doc = canvas.contentDocument; } catch (err) { doc = null; }
    if (!doc || !doc.body) return;
    injectEditorBits();
  });

  function injectEditorBits() {
    var st = doc.createElement('style');
    st.id = 'sb-style';
    st.textContent = '[data-sb-hover]{outline:1px dashed #94a3b8 !important; outline-offset:2px;}'
      + '[data-sb-sel]{outline:2px solid #4f46e5 !important; outline-offset:2px;}'
      + '.sb-dropline{height:3px;background:#4f46e5;border-radius:2px;margin:2px 0;}';
    doc.head.appendChild(st);

    doc.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var t = e.target;
      if (t === doc.body || t === doc.documentElement) { select(null); return; }
      select(t);
    }, true);

    doc.addEventListener('mouseover', function (e) {
      if (hoverEl) hoverEl.removeAttribute('data-sb-hover');
      hoverEl = e.target;
      if (hoverEl && hoverEl !== doc.body && hoverEl !== doc.documentElement && !hoverEl.hasAttribute('data-sb-sel')) {
        hoverEl.setAttribute('data-sb-hover', '1');
      }
    }, true);
    doc.addEventListener('mouseout', function () {
      if (hoverEl) { hoverEl.removeAttribute('data-sb-hover'); hoverEl = null; }
    }, true);

    wireCanvasDrop();
  }

  // ------------------------------------------------------------- selection
  function select(el) {
    if (sel) sel.removeAttribute('data-sb-sel');
    sel = el || null;
    if (sel) {
      sel.removeAttribute('data-sb-hover');
      sel.setAttribute('data-sb-sel', '1');
      try { sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) {}
      $('noSel').style.display = 'none';
      $('selPanel').style.display = 'block';
      renderCrumbs();
      $('selTag').textContent = '<' + sel.tagName.toLowerCase() + '>' + (sel.id ? ' #' + sel.id : '') + (sel.className && typeof sel.className === 'string' ? ' .' + sel.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
      syncSettings();
      syncStyle();
    } else {
      $('noSel').style.display = 'block';
      $('selPanel').style.display = 'none';
    }
  }

  function renderCrumbs() {
    var chain = [];
    var n = sel;
    while (n && n !== doc.body && chain.length < 6) { chain.unshift(n); n = n.parentElement; }
    $('crumbs').innerHTML = '<span class="crumb" data-i="body">body</span>' + chain.map(function (el, i) {
      return '<span class="crumb' + (i === chain.length - 1 ? ' cur' : '') + '" data-i="' + i + '">' + el.tagName.toLowerCase() + '</span>';
    }).join('');
    var crumbEls = $('crumbs').querySelectorAll('.crumb');
    crumbEls.forEach(function (c) {
      c.onclick = function () {
        var iAttr = c.getAttribute('data-i');
        if (iAttr === 'body') { select(null); return; }
        select(chain[Number(iAttr)]);
      };
    });
  }

  // Is this element's content simple enough to edit as plain text?
  function textEditable(el) {
    if (!el) return false;
    if (['IMG', 'VIDEO', 'HR', 'BR', 'INPUT', 'SELECT', 'IFRAME', 'SVG'].indexOf(el.tagName) >= 0) return false;
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (['BR', 'B', 'I', 'EM', 'STRONG', 'SPAN'].indexOf(c.tagName) === -1) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- settings tab
  function fillLinkPickers() {
    var opts = '<option value="">— link to a page or asset —</option>';
    PAGES.forEach(function (p) { opts += '<option value="' + p + '">📄 ' + p + '</option>'; });
    ASSETS.forEach(function (a) { opts += '<option value="' + a + '">📎 ' + a + '</option>'; });
    $('selHref').innerHTML = opts;
    var iopts = '<option value="">— pick an asset —</option>';
    IMG_ASSETS.forEach(function (a) { iopts += '<option value="' + a + '">' + a + '</option>'; });
    $('selSrc').innerHTML = iopts;
  }

  function syncSettings() {
    if (!sel) return;
    var isLink = sel.tagName === 'A' || (sel.tagName === 'BUTTON');
    var isImg = sel.tagName === 'IMG';
    var canText = textEditable(sel);
    $('fText').style.display = canText ? '' : 'none';
    if (canText) $('inText').value = sel.textContent;
    $('fHref').style.display = isLink ? '' : 'none';
    if (isLink) {
      $('inHref').value = sel.getAttribute('href') || '';
      $('inNewTab').checked = sel.getAttribute('target') === '_blank';
      $('selHref').value = '';
    }
    $('fSrc').style.display = isImg ? '' : 'none';
    $('fAlt').style.display = isImg ? '' : 'none';
    if (isImg) {
      $('inSrc').value = sel.getAttribute('src') || '';
      $('inAlt').value = sel.getAttribute('alt') || '';
      $('selSrc').value = '';
    }
  }

  $('inText').addEventListener('input', function () { if (sel && textEditable(sel)) { sel.textContent = $('inText').value; markDirty(); } });
  $('inHref').addEventListener('input', function () {
    if (!sel) return;
    if (sel.tagName === 'A') sel.setAttribute('href', $('inHref').value);
    else if (sel.tagName === 'BUTTON') sel.setAttribute('data-href', $('inHref').value);
    markDirty();
  });
  $('selHref').addEventListener('change', function () {
    if (!sel || !$('selHref').value) return;
    $('inHref').value = relSrc($('selHref').value);
    $('inHref').dispatchEvent(new Event('input'));
  });
  $('inNewTab').addEventListener('change', function () {
    if (!sel) return;
    if ($('inNewTab').checked) sel.setAttribute('target', '_blank');
    else sel.removeAttribute('target');
    markDirty();
  });
  $('inSrc').addEventListener('input', function () { if (sel && sel.tagName === 'IMG') { sel.src = $('inSrc').value; markDirty(); } });
  $('selSrc').addEventListener('change', function () {
    if (!sel || sel.tagName !== 'IMG' || !$('selSrc').value) return;
    var r = relSrc($('selSrc').value);
    sel.src = r;
    $('inSrc').value = r;
    markDirty();
  });
  $('inAlt').addEventListener('input', function () { if (sel && sel.tagName === 'IMG') { sel.setAttribute('alt', $('inAlt').value); markDirty(); } });

  // ------------------------------------------------------------- style tab
  function syncStyle() {
    if (!sel) return;
    var cs = canvas.contentWindow.getComputedStyle(sel);
    $('stColor').value = rgbToHex(cs.color) || '#000000';
    $('stBg').value = rgbToHex(cs.backgroundColor) || '#ffffff';
    $('stFont').value = sel.style.fontFamily || '';
    $('stSize').value = sel.style.fontSize ? parseInt(sel.style.fontSize, 10) : '';
    $('stRadius').value = sel.style.borderRadius ? parseInt(sel.style.borderRadius, 10) : '';
    $('stPad').value = sel.style.padding ? parseInt(sel.style.padding, 10) : '';
    $('stMar').value = sel.style.margin ? parseInt(sel.style.margin, 10) : '';
    $('stBold').classList.toggle('on', cs.fontWeight === '700' || Number(cs.fontWeight) >= 600);
    $('stItalic').classList.toggle('on', cs.fontStyle === 'italic');
  }
  function rgbToHex(rgb) {
    var m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(rgb || '');
    if (!m) return null;
    return '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + Number(v).toString(16)).slice(-2); }).join('');
  }
  function setStyle(prop, val) { if (!sel) return; sel.style[prop] = val; markDirty(); }

  $('stColor').addEventListener('input', function () { setStyle('color', $('stColor').value); });
  $('stBg').addEventListener('input', function () { setStyle('backgroundColor', $('stBg').value); });
  $('stFont').addEventListener('change', function () { setStyle('fontFamily', $('stFont').value); });
  $('stSize').addEventListener('input', function () { setStyle('fontSize', $('stSize').value ? $('stSize').value + 'px' : ''); });
  $('stRadius').addEventListener('input', function () { setStyle('borderRadius', $('stRadius').value ? $('stRadius').value + 'px' : ''); });
  $('stPad').addEventListener('input', function () { setStyle('padding', $('stPad').value ? $('stPad').value + 'px' : ''); });
  $('stMar').addEventListener('input', function () { setStyle('margin', $('stMar').value ? $('stMar').value + 'px' : ''); });
  $('stBold').addEventListener('click', function () {
    var on = $('stBold').classList.toggle('on');
    setStyle('fontWeight', on ? '700' : '400');
  });
  $('stItalic').addEventListener('click', function () {
    var on = $('stItalic').classList.toggle('on');
    setStyle('fontStyle', on ? 'italic' : 'normal');
  });
  document.querySelectorAll('[data-align]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!sel) return;
      var a = b.getAttribute('data-align');
      // Blocks: text-align. Images/buttons: block + auto margins actually move
      // the element itself left/center/right.
      if (sel.tagName === 'IMG' || sel.tagName === 'BUTTON' || (sel.tagName === 'A' && sel.children.length === 0)) {
        sel.style.display = 'block';
        sel.style.marginLeft = a === 'left' ? '0' : 'auto';
        sel.style.marginRight = a === 'right' ? '0' : 'auto';
        if (a === 'left') sel.style.marginRight = 'auto';
        if (a === 'right') sel.style.marginLeft = 'auto';
      } else {
        sel.style.textAlign = a;
      }
      markDirty();
    });
  });
  document.querySelectorAll('.clear').forEach(function (c) {
    c.addEventListener('click', function () { setStyle(c.getAttribute('data-clear'), ''); syncStyle(); });
  });
  $('stClear').addEventListener('click', function () { if (sel) { sel.removeAttribute('style'); markDirty(); syncStyle(); } });

  // ------------------------------------------------------------- move / dup / del
  $('mvUp').addEventListener('click', function () {
    if (sel && sel.previousElementSibling) { sel.parentElement.insertBefore(sel, sel.previousElementSibling); markDirty(); }
  });
  $('mvDown').addEventListener('click', function () {
    if (sel && sel.nextElementSibling) { sel.parentElement.insertBefore(sel.nextElementSibling, sel); markDirty(); }
  });
  $('dupBtn').addEventListener('click', function () {
    if (!sel) return;
    var clone = sel.cloneNode(true);
    clone.removeAttribute('data-sb-sel');
    sel.parentElement.insertBefore(clone, sel.nextSibling);
    markDirty();
  });
  $('delBtn').addEventListener('click', function () {
    if (!sel) return;
    var parent = sel.parentElement;
    sel.remove();
    sel = null;
    select(parent !== doc.body ? parent : null);
    markDirty();
  });

  // ------------------------------------------------------------- tabs
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x === t); });
      $('tab-settings').style.display = t.getAttribute('data-tab') === 'settings' ? '' : 'none';
      $('tab-style').style.display = t.getAttribute('data-tab') === 'style' ? '' : 'none';
    });
  });

  // ------------------------------------------------------------- palette
  function buildElement(type) {
    var el;
    var d = doc;
    if (type === 'header') { el = d.createElement('h2'); el.textContent = 'New heading'; el.style.margin = '16px 0'; }
    else if (type === 'paragraph') { el = d.createElement('p'); el.textContent = 'New paragraph — click to edit the text in Settings.'; el.style.margin = '10px 0'; }
    else if (type === 'divider') { el = d.createElement('hr'); el.style.border = 'none'; el.style.borderTop = '1px solid #d6d3cd'; el.style.margin = '18px 0'; }
    else if (type === 'button') {
      el = d.createElement('a');
      el.textContent = 'Click me';
      el.setAttribute('href', '#');
      el.style.cssText = 'display:inline-block;padding:10px 22px;border-radius:999px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;margin:8px 0;';
    } else if (type === 'media') {
      el = d.createElement('img');
      el.src = IMG_ASSETS.length ? relSrc(IMG_ASSETS[0]) : 'https://via.placeholder.com/600x300';
      el.alt = '';
      el.style.cssText = 'max-width:100%;border-radius:10px;display:block;margin:10px 0;';
    } else if (type === 'columns') {
      el = d.createElement('div');
      el.style.cssText = 'display:flex;gap:16px;margin:12px 0;flex-wrap:wrap;';
      for (var i = 0; i < 2; i++) {
        var col = d.createElement('div');
        col.style.cssText = 'flex:1;min-width:200px;';
        var p = d.createElement('p');
        p.textContent = 'Column ' + (i + 1) + ' text';
        col.appendChild(p);
        el.appendChild(col);
      }
    } else if (type === 'form') {
      el = d.createElement('form');
      el.style.cssText = 'display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;';
      var inp = d.createElement('input');
      inp.type = 'email';
      inp.placeholder = 'you@example.com';
      inp.style.cssText = 'flex:1;min-width:180px;padding:10px 14px;border:1px solid #d6d3cd;border-radius:8px;';
      var btn = d.createElement('button');
      btn.type = 'submit';
      btn.textContent = 'Submit';
      btn.style.cssText = 'padding:10px 20px;border:none;border-radius:8px;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer;';
      el.appendChild(inp);
      el.appendChild(btn);
    }
    return el;
  }

  document.querySelectorAll('.pal-item').forEach(function (p) {
    p.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/ks-element', p.getAttribute('data-el'));
      e.dataTransfer.effectAllowed = 'copy';
    });
    p.addEventListener('click', function () {
      if (!doc) return;
      var el = buildElement(p.getAttribute('data-el'));
      if (!el) return;
      if (sel && sel.parentElement) sel.parentElement.insertBefore(el, sel.nextSibling);
      else doc.body.appendChild(el);
      select(el);
      markDirty();
    });
  });

  var dropLine = null;
  function wireCanvasDrop() {
    dropLine = doc.createElement('div');
    dropLine.className = 'sb-dropline';
    doc.addEventListener('dragover', function (e) {
      if (Array.prototype.indexOf.call(e.dataTransfer.types, 'text/ks-element') === -1) return;
      e.preventDefault();
      var target = e.target;
      while (target && target.parentElement && target.parentElement !== doc.body) target = target.parentElement;
      if (!target || target === doc.documentElement || target === dropLine) return;
      var r = target.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) doc.body.insertBefore(dropLine, target);
      else doc.body.insertBefore(dropLine, target.nextSibling);
    });
    doc.addEventListener('drop', function (e) {
      var type = e.dataTransfer.getData('text/ks-element');
      if (!type) return;
      e.preventDefault();
      var el = buildElement(type);
      if (el && dropLine.parentNode) dropLine.parentNode.insertBefore(el, dropLine);
      else if (el) doc.body.appendChild(el);
      if (dropLine.parentNode) dropLine.remove();
      if (el) { select(el); markDirty(); }
    });
    doc.addEventListener('dragleave', function () { if (dropLine.parentNode) dropLine.remove(); });
  }

  // ------------------------------------------------------------- save / revert
  function serialize() {
    var clone = doc.documentElement.cloneNode(true);
    var junk = clone.querySelectorAll('#sb-style, .sb-dropline');
    junk.forEach(function (j) { j.remove(); });
    clone.querySelectorAll('[data-sb-sel],[data-sb-hover]').forEach(function (el) {
      el.removeAttribute('data-sb-sel');
      el.removeAttribute('data-sb-hover');
    });
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  }
  $('saveBtn').addEventListener('click', function () {
    if (!doc || !currentPage) return;
    $('saveBtn').disabled = true;
    setStatus('Saving…');
    fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPage, html: serialize() }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'save failed');
        dirty = false;
        setStatus('Saved ✓', 'ok');
      })
      .catch(function (err) { setStatus('Save failed: ' + err.message, 'err'); })
      .then(function () { $('saveBtn').disabled = false; });
  });
  $('revertBtn').addEventListener('click', function () {
    if (!currentPage) return;
    if (dirty && !confirm('Discard your unsaved changes?')) return;
    loadPage(currentPage, false);
  });
  $('openBtn').addEventListener('click', function () {
    if (currentPage) window.open(PREVIEW + currentPage, '_blank');
  });
  $('vpDesk').addEventListener('click', function () {
    $('canvasWrap').classList.remove('mobile');
    $('vpDesk').classList.add('on');
    $('vpMob').classList.remove('on');
  });
  $('vpMob').addEventListener('click', function () {
    $('canvasWrap').classList.add('mobile');
    $('vpMob').classList.add('on');
    $('vpDesk').classList.remove('on');
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ------------------------------------------------------------- boot
  fillLinkPickers();
  renderTrees();
  if (PAGES.length) loadPage(PAGES[0], false);
  else setStatus('This session has no pages', 'err');
})();
</script>
</body>
</html>`);
});

export default router;
