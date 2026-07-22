// Card Studio — an htmx-driven remix surface over a build session's workspace.
// GET  /build/:id/studio/                 → full page: image/text gallery (left) + card composer (right)
// POST /build/:id/studio/recommend-images → 3 fresh Unsplash images saved into the workspace, returned as an HTML fragment
// POST /build/:id/studio/recommend-text   → 3 LLM copy variants of the current caption, returned as an HTML fragment
// POST /build/:id/studio/generate-image   → 1 Gemini-generated image saved into the workspace, returned as an HTML fragment
// POST /build/:id/studio/generate-video          → starts a Veo generation, returns { operationName }
// POST /build/:id/studio/generate-video-status   → polled by the client; downloads + saves the video once Gemini's job is done
// The composed card downloads client-side via html2canvas (images are
// same-origin through the preview route, so the canvas is never tainted).

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import multer from 'multer';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { safeResolve, fileManifest, readSessionResult } from '../builder/workspace.js';
import { recordUsage, checkPartnerCredit } from '../partner/usage.js';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const GEMINI_VIDEO_MODEL = 'veo-3.1-generate-preview';
// Veo bills per second of output video (720p/1080p rate), not per token.
const VEO_USD_PER_SECOND = Number(process.env.VEO_USD_PER_SECOND || 0.40);

// Tenant attribution for Studio's Gemini generation: the creative run that
// created this workspace persisted its verified partner_id/user_id in the
// session result sidecar — read it back so generation spend lands on the
// same tenant the campaign billed to. Sessions that predate that sidecar
// field (or ad-hoc sessions with no partner) meter as untagged: still
// recorded, just not attributed.
async function sessionMeterInfo(sessionId) {
    try {
        const r = await readSessionResult(sessionId);
        return { partner_id: r?.partner_id || '', user_id: r?.user_id || '' };
    } catch {
        return { partner_id: '', user_id: '' };
    }
}

// Partner-uploaded media, in-memory then written straight to the session
// workspace (same place Unsplash pulls land) — 80MB covers a short marketing
// clip comfortably without letting one upload blow out the session's disk use.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.mimetype)),
});

// Same relaxation as the preview route: htmx + html2canvas load from CDNs.
// frame-ancestors is explicit (not just omitted) so it supersedes helmet's
// default X-Frame-Options: SAMEORIGIN and lets partner portals (e.g. the
// Mr n Mr admin studio tab) embed this page cross-origin.
const STUDIO_FRAME_ANCESTORS = ["'self'", ...String(process.env.STUDIO_FRAME_ANCESTORS || 'https://mrnmr.srv1562298.hstgr.cloud').split(',').map((s) => s.trim()).filter(Boolean)];
const STUDIO_CSP = `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src *; font-src * data: https:; frame-ancestors ${STUDIO_FRAME_ANCESTORS.join(' ')};`;

const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)$/i;

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

// Visual reference scale for the space meter, not an enforced quota. Raised
// from 50MB now that partners can upload their own video — a single short
// clip can legitimately be tens of MB, so the old scale flagged completely
// normal usage as "high".
const SPACE_METER_SCALE_BYTES = 200 * 1024 * 1024;

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
        const videos = manifest.filter(f => VIDEO_RE.test(f.path)).slice(0, 20);
        // Order preserved as it appears in the manifest so uploads/generated
        // assets interleave naturally rather than always sorting images first.
        const media = manifest.filter(f => MEDIA_RE.test(f.path)).slice(0, 80)
            .map(f => ({ ...f, type: VIDEO_RE.test(f.path) ? 'video' : 'image' }));
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

        // Default view is always a static image, never a video — keeps the
        // initial card state simple (no video-vs-image branching on load).
        const firstImg  = images[0] ? previewBase + images[0].path : '';
        const firstText = texts[0] ? texts[0].text : 'Click a text on the left to place it here — then click this caption to get 3 AI variants.';
        const firstQuery = images[0] ? slugToQuery(images[0].path) : '';

        const thumbsHtml = media.map(f => f.type === 'video' ? `
            <div class="thumb-wrap">
              <video class="thumb" muted preload="metadata" title="${esc(f.path)}"
                     src="${esc(previewBase + f.path)}#t=0.1" data-type="video"
                     onclick="selectMedia(this)"></video>
              <span class="thumb-badge">▶ video</span>
              <button class="thumb-del" type="button" data-path="${esc(f.path)}" title="Delete this video">✕</button>
            </div>` : `
            <div class="thumb-wrap">
              <img class="thumb" loading="lazy" src="${esc(previewBase + f.path)}"
                   data-slug="${esc(slugToQuery(f.path))}" data-type="image" title="${esc(f.path)}"
                   onclick="selectMedia(this)">
              <button class="thumb-del" type="button" data-path="${esc(f.path)}" title="Delete this image">✕</button>
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
  /* Left panel is a fixed-height flex column: only the media thumbnails
     scroll, so the Elements palette + hint below stay visible instead of
     the whole column scrolling the palette out of reach. */
  aside.panel { max-height: calc(100vh - 110px); overflow: hidden; display: flex; flex-direction: column; }
  /* Collapsible media library — closed by default; the icon rail expands it. */
  .gallery-toggle { border: 1px solid #cbd5e1; background: #fff; border-radius: 10px; min-width: 34px; height: 34px;
    font-size: 15px; cursor: pointer; margin-bottom: 10px; align-self: flex-start; }
  .gallery-toggle:hover { border-color: #2563eb; }
  .layout.gclosed { grid-template-columns: 56px minmax(380px, 1fr) minmax(260px, 320px); }
  .layout.gclosed aside.panel { padding: 10px 8px; }
  .layout.gclosed aside.panel > *:not(.gallery-toggle) { display: none !important; }
  .layout.gclosed .gallery-toggle { align-self: center; margin-bottom: 0; }
  @media (max-width: 880px) { .layout.gclosed { grid-template-columns: 1fr; } }
  aside.panel > h2, aside.panel > .palette, aside.panel > .hint, aside.panel > button, aside.panel > input, aside.panel > #uploadStatus { flex: none; }
  .thumbs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; flex: 1 1 auto; min-height: 96px; max-height: 340px; overflow-y: auto; }
  .thumb-wrap { position: relative; }
  .thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid transparent; display: block; }
  .thumb:hover { border-color: #93c5fd; }
  .thumb.sel { border-color: #2563eb; }
  .thumb-del { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; line-height: 16px; padding: 0;
    border: none; border-radius: 50%; background: rgba(15,23,42,.65); color: #fff; font-size: 11px; cursor: pointer;
    opacity: 0; transition: opacity .12s; }
  .thumb-wrap:hover .thumb-del { opacity: 1; }
  .thumb-del:hover { background: #dc2626; }
  .thumb-badge { position: absolute; left: 5px; bottom: 5px; font-size: 9.5px; font-weight: 600; letter-spacing: .02em;
    padding: 2px 6px; border-radius: 999px; background: rgba(15,23,42,.65); color: #fff; pointer-events: none; }
  /* drag-and-drop element palette + card blocks */
  .palette { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 6px 0 8px; }
  .pal-item { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px 6px; font-size: 12px; text-align: center;
    color: #475569; cursor: grab; background: #f8fafc; user-select: none; }
  .pal-item:hover { border-color: #2563eb; color: #1d4ed8; }
  .drop-line { height: 3px; background: #2563eb; border-radius: 2px; margin: 2px 0; }
  .dragover-zone { background: rgba(37,99,235,.06); border-radius: 6px; }
  .cblock { position: relative; margin: 6px 0; }
  .cblock:hover { outline: 1px dashed #93c5fd; outline-offset: 3px; border-radius: 4px; }
  /* Controls sit INSIDE the block — the card clips overflow, so the old
     negative-inset positions made them invisible. Delete is always shown so
     every dropped section has an obvious remove control. */
  .cblock-handle { position: absolute; left: 2px; top: 2px; font-size: 10px; color: #fff; background: rgba(15,23,42,.5);
    border-radius: 4px; padding: 1px 3px; cursor: grab; opacity: 0; z-index: 4; }
  .cblock-del { position: absolute; right: 2px; top: 2px; width: 17px; height: 17px; border: none; border-radius: 50%;
    background: rgba(220,38,38,.9); color: #fff; font-size: 9px; line-height: 17px; padding: 0; cursor: pointer; z-index: 4; }
  .cblock-del:hover { background: #dc2626; }
  .cblock:hover .cblock-handle { opacity: 1; }
  .blk-header { font-size: 22px; font-weight: 700; line-height: 1.25; }
  .blk-paragraph { font-size: 13px; line-height: 1.5; color: #334155; }
  .blk-divider { border-top: 1px solid #e2e8f0; margin: 8px 0; }
  .cblock-button { text-align: center; }
  .blk-button { display: inline-block; background: #2563eb; color: #fff; border-radius: 999px; padding: 8px 18px; font-size: 13px; font-weight: 600; }
  .blk-form { display: flex; flex-direction: column; gap: 8px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #fff; }
  .blk-form-title { font-size: 15px; font-weight: 700; }
  .form-fields { display: flex; flex-direction: column; gap: 8px; }
  .form-field { position: relative; }
  .ff-label { font-size: 11px; color: #64748b; margin-bottom: 3px; }
  .ff-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; }
  .ff-del { position: absolute; right: -13px; top: 0; width: 15px; height: 15px; border: none; border-radius: 50%;
    background: rgba(15,23,42,.5); color: #fff; font-size: 8px; line-height: 15px; padding: 0; cursor: pointer; opacity: 0; }
  .form-field:hover .ff-del { opacity: 1; }
  .form-tools { display: flex; gap: 6px; }
  .form-tool { border: 1px dashed #cbd5e1; background: #f8fafc; color: #475569; border-radius: 8px; padding: 5px 10px; font-size: 11px; cursor: pointer; user-select: none; }
  .form-tool:hover { border-color: #2563eb; color: #1d4ed8; }
  .blk-form .blk-media { aspect-ratio: 16/7; }
  .blk-form-submit { border: none; background: #0f172a; color: #fff; border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; }
  .blk-form-submit:disabled { opacity: .6; }
  #card.exporting .form-tools, #card.exporting .ff-del { display: none; }
  .blk-media { aspect-ratio: 16/9; background: #f1f5f9; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .blk-media-hint { font-size: 12px; color: #94a3b8; padding: 0 10px; text-align: center; }
  .blk-media img, .blk-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .blk-cols { display: flex; gap: 10px; }
  .blk-col { flex: 1; min-height: 56px; border: 1px dashed #e2e8f0; border-radius: 8px; padding: 4px 6px; }
  #card.exporting .blk-col { border-color: transparent; }
  #card.exporting .cblock-handle, #card.exporting .cblock-del { display: none; }
  #card.exporting .cblock { outline: none; }
  #card.exporting .blk-media.empty { visibility: hidden; }
  .picker-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.5); display: none; align-items: center; justify-content: center; z-index: 50; }
  .picker-box { background: #fff; border-radius: 14px; padding: 18px; width: min(560px, 92vw); max-height: 80vh; overflow-y: auto; }
  .picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
  .picker-thumb { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid transparent; }
  .picker-thumb:hover { border-color: #2563eb; }
  .composer { display: flex; flex-direction: column; gap: 16px; }
  .composer-side { display: flex; flex-direction: column; gap: 16px; }
  #card { position: relative; width: 440px; max-width: 100%; aspect-ratio: 1/1; background: #fff; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(15,23,42,.12); margin: 0 auto; }
  /* inline delete controls for the card's own image and caption */
  .media-del { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border: none; border-radius: 50%;
    background: rgba(220,38,38,.9); color: #fff; font-size: 11px; line-height: 22px; padding: 0; cursor: pointer; z-index: 5; opacity: 0; transition: opacity .12s; }
  #card-img-wrap:hover .media-del { opacity: 1; }
  .media-del:hover { background: #dc2626; }
  #card-img-wrap.media-empty { background: repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 10px,#e9eef4 10px,#e9eef4 20px); }
  #card-img-wrap.media-empty #card-img, #card-img-wrap.media-empty #card-video { display: none !important; }
  .media-empty-hint { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; color: #94a3b8; font-size: 12px; pointer-events: none; }
  #card-img-wrap.media-empty .media-empty-hint { display: flex; }
  #card.exporting .media-del { display: none !important; }
  #card.exporting #card-img-wrap.media-empty { background: #fff; }
  #card.exporting .media-empty-hint { display: none !important; }
  #card-img-wrap { position: relative; width: 100%; height: 56%; flex: none; }
  #card.overlay-text #card-img-wrap { height: 100%; }
  #card.overlay-text #card-body { display: none; }
  #card.overlay-text #card-brand { position: absolute; bottom: 8px; right: 10px; padding: 3px 9px; background: rgba(0,0,0,.4); border-radius: 6px; color: #fff; z-index: 3; }
  #card-img, #card-video { width: 100%; height: 100%; object-fit: contain; display: block; }
  #card-img { background: #e2e8f0; }
  #card-video { background: #000; }
  #img-gradient { position: absolute; inset: 0; pointer-events: none; }
  .zone { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; z-index: 2; pointer-events: none; }
  .zone > * { pointer-events: auto; }
  #zone-top { top: 0; }
  #zone-middle { top: 50%; transform: translateY(-50%); }
  #zone-bottom { bottom: 0; padding-bottom: 36px; }
  #card-body { flex: 1; padding: 18px 22px 6px; overflow-y: auto; }
  .card-text-layer { font-size: 14px; line-height: 1.5; white-space: pre-wrap; cursor: text; display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
  .card-text-layer:hover { outline: 2px dashed #93c5fd; outline-offset: 4px; border-radius: 4px; }
  .card-text-layer:focus { outline: 2px solid #2563eb; outline-offset: 4px; border-radius: 4px; }
  #card-img-wrap .card-text-layer { text-shadow: 0 1px 4px rgba(0,0,0,.55); }
  #card-brand { padding: 0 22px 14px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; flex: none; }
  .layer-pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .layer-pill { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #cbd5e1; border-radius: 999px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #475569; background: #fff; }
  .layer-pill.sel { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
  .layer-pill .rm { color: #94a3b8; cursor: pointer; }
  .layer-pill .rm:hover { color: #dc2626; }
  .controls { margin-top: 14px; }
  .ctl-group { margin-top: 12px; }
  .ctl-group:first-child { margin-top: 0; }
  .ctl-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
  .ctl-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  /* publish panel */
  /* Card width is capped on the viewport (not the mock) so #pubPreviews's own
     box stays exactly one card wide — that's what the carousel's translateX(-100%)
     per slide is measured against. Capping .pub-mock instead would shrink the
     visible card without shrinking that reference box, throwing the slide math off. */
  .pub-car-wrap { position: relative; margin-bottom: 8px; }
  .pub-car-viewport { overflow: hidden; max-width: 220px; margin: 0 auto; }
  .pub-previews { display: flex; transition: transform .25s ease; }
  .pub-mock { flex: 0 0 100%; width: 100%; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,.06); }
  .pub-car-btn { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; border: 1px solid #cbd5e1; background: #fff; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-size: 14px; color: #334155; line-height: 1; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
  .pub-car-btn:hover { background: #f1f5f9; }
  .pub-car-prev { left: 0; }
  .pub-car-next { right: 0; }
  .pub-car-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 12px; }
  .pub-car-dot { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; cursor: pointer; border: none; padding: 0; }
  .pub-car-dot.sel { background: #2563eb; }
  .pub-mock-head { display: flex; align-items: center; gap: 7px; padding: 8px 10px; }
  .pub-mock-avatar { width: 22px; height: 22px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 700; }
  .pub-mock-name { font-size: 11px; font-weight: 600; color: #0f172a; line-height: 1.2; }
  .pub-mock-sub { font-size: 9.5px; color: #94a3b8; }
  .pub-mock-img { width: 100%; background: #f1f5f9; overflow: hidden; position: relative; }
  .pub-mock-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pub-mock-cap { padding: 8px 10px 6px; font-size: 10.5px; line-height: 1.45; color: #334155; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
  .pub-mock-cap.expanded { -webkit-line-clamp: unset; overflow: visible; }
  .pub-mock-more { display: block; background: none; border: none; margin: 0; padding: 2px 10px 8px; font-size: 10.5px; font-weight: 600; color: #64748b; cursor: pointer; }
  .pub-mock-more:hover { color: #334155; text-decoration: underline; }
  .pub-mock-warn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; font-size: 10px; color: #92400e; background: rgba(254,243,199,.92); }
  .pub-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .pub-check { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #cbd5e1; border-radius: 999px; padding: 7px 14px; font-size: 13px; cursor: pointer; user-select: none; background: #fff; color: #334155; }
  .pub-check:has(input:checked) { border-color: #2563eb; background: #eff6ff; }
  .pub-check:has(input:disabled) { opacity: .5; cursor: not-allowed; }
  .pub-check input { margin: 0; accent-color: #2563eb; }
  .pub-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .pub-result-line { font-size: 12px; margin-top: 4px; }
  .btn-link { border: none; background: none; color: #2563eb; font-size: 12.5px; font-weight: 500; cursor: pointer; padding: 4px 0; }
  .btn-link:hover { text-decoration: underline; }
  .cal-box { margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .cal-nav-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 14px; color: #334155; line-height: 1; }
  .cal-nav-btn:hover { background: #f1f5f9; }
  .cal-month-label { font-size: 12.5px; font-weight: 600; color: #0f172a; }
  .cal-dow { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 10px; color: #94a3b8; margin-bottom: 4px; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .cal-day { position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; border-radius: 6px; cursor: pointer; color: #334155; background: #fff; border: 1px solid transparent; }
  .cal-day:hover:not(.cal-disabled):not(.cal-outside) { background: #eff6ff; }
  .cal-day.cal-disabled, .cal-day.cal-outside { color: #cbd5e1; cursor: default; }
  .cal-day.cal-today { border-color: #94a3b8; }
  .cal-day.cal-selected { background: #2563eb; color: #fff; }
  .cal-day.cal-has-post::after { content: ''; position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: #f59e0b; }
  .cal-day.cal-selected.cal-has-post::after { background: #fff; }
  .ctl-search { display: flex; gap: 8px; align-items: center; }
  .ctl-search input { flex: 1 1 160px; min-width: 0; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
  .btn { border: none; border-radius: 8px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-weight: 500; white-space: nowrap; }
  .btn-blue { background: #2563eb; color: #fff; }
  .btn-dark { background: #0f172a; color: #fff; }
  .btn:disabled { opacity: .55; cursor: default; }
  .hint { font-size: 12px; color: #94a3b8; }
  .style-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
  .style-row:last-child { margin-bottom: 0; }
  .style-row label { font-size: 12px; color: #64748b; min-width: 52px; }
  .style-row select, .style-row input[type=color] { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 9px; font-size: 13px; background: #fff; }
  .style-row select { flex: 1 1 0; min-width: 0; max-width: 100%; }
  .style-row input[type=range] { flex: 1 1 100px; }
  .style-row input[type=color] { padding: 2px; width: 40px; height: 32px; cursor: pointer; }
  .seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
  .seg button { border: none; background: #fff; padding: 6px 11px; font-size: 13px; cursor: pointer; color: #475569; }
  .seg button + button { border-left: 1px solid #cbd5e1; }
  .seg button.sel { background: #2563eb; color: #fff; }
  .emoji-tray { display: flex; flex-wrap: wrap; gap: 2px; flex: 1 1 auto; max-height: 96px; overflow-y: auto; }
  .emoji-btn { border: none; background: none; font-size: 19px; line-height: 1; padding: 3px 4px; border-radius: 6px; cursor: pointer; }
  .emoji-btn:hover { background: #eff6ff; }
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
    <button id="galleryToggle" class="gallery-toggle" type="button" onclick="toggleGallery()" title="Show / hide the media library">🖼</button>
    <button class="btn btn-blue" type="button" onclick="document.getElementById('uploadInput').click()" style="width:100%;margin-bottom:12px">⬆ Upload image or video</button>
    <input type="file" id="uploadInput" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" style="display:none" onchange="uploadMedia(this.files[0])">
    <div id="uploadStatus" class="hint" style="display:none;margin-bottom:10px"></div>
    <h2 id="mediaHeading">Media (${media.length})</h2>
    <div class="thumbs">${thumbsHtml || '<div class="hint">No images or videos in this session yet.</div>'}</div>
    <!-- Elements palette hidden for now — re-enable by removing display:none. -->
    <div id="elementsSection" style="display:none">
      <h2>Elements</h2>
      <div class="palette">
        <div class="pal-item" draggable="true" data-el="header">H&nbsp;&nbsp;Header</div>
        <div class="pal-item" draggable="true" data-el="paragraph">¶&nbsp;&nbsp;Paragraph</div>
        <div class="pal-item" draggable="true" data-el="divider">—&nbsp;&nbsp;Divider</div>
        <div class="pal-item" draggable="true" data-el="form">▭&nbsp;&nbsp;Form</div>
        <div class="pal-item" draggable="true" data-el="media">▦&nbsp;&nbsp;Image / Video</div>
        <div class="pal-item" draggable="true" data-el="columns">◫&nbsp;&nbsp;Columns</div>
        <div class="pal-item" draggable="true" data-el="button">⬭&nbsp;&nbsp;Button</div>
      </div>
      <div class="hint">Drag an element onto the card — dropping “Image / Video” opens your media to pick from.</div>
    </div>
  </aside>
  <section class="composer">
    <div class="panel">
      <h2>Card preview</h2>
      <div id="card">
        <div id="card-img-wrap">
          <img id="card-img" src="${esc(firstImg)}" crossorigin="anonymous">
          <video id="card-video" muted loop playsinline style="display:none"></video>
          <div id="img-gradient"></div>
          <div class="zone" id="zone-top"></div>
          <div class="zone" id="zone-middle"></div>
          <div class="zone" id="zone-bottom"></div>
          <div class="media-empty-hint">No image — pick one from the left</div>
          <button class="media-del" type="button" onclick="clearCardImage()" title="Remove this image / video">✕</button>
        </div>
        <div id="card-body">
          <div id="card-text" class="card-text-layer" contenteditable="true" spellcheck="false"
               data-position="below" data-font-key="system" data-color-hex="#0f172a" data-blur="0"
               onfocus="selectLayer('card-text')" onmousedown="selectLayer('card-text')"
               title="Click to edit the caption directly">${esc(firstText)}</div>
        </div>
        <div id="card-brand">kaushalstack</div>
      </div>
      <div class="controls">
        <div class="ctl-group">
          <div class="ctl-label">Find a new image</div>
          <div class="ctl-search">
            <input id="img-query" name="query" value="${esc(firstQuery)}" placeholder="Search Unsplash…">
            <button class="btn btn-blue"
                    hx-post="recommend-images" hx-include="#img-query"
                    hx-target="#img-recs" hx-swap="innerHTML" hx-indicator="#img-spin">
              Recommend 3 images
            </button>
          </div>
          <span id="img-spin" class="htmx-indicator">searching Unsplash…</span>
        </div>
        <div class="ctl-group">
          <div class="ctl-label">Generate with Gemini</div>
          <textarea id="gen-prompt" rows="2" placeholder="Describe the image or video you want…"
                    style="width:100%;box-sizing:border-box;resize:vertical;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit"></textarea>
          <div class="ctl-row" style="margin-top:8px">
            <button class="btn btn-blue" type="button"
                    hx-post="generate-image" hx-vals="js:{prompt: document.getElementById('gen-prompt').value}"
                    hx-target="#img-recs" hx-swap="innerHTML" hx-indicator="#gen-img-spin">
              Generate image
            </button>
            <button class="btn btn-blue" type="button" id="genVideoBtn" onclick="generateVideo()">Generate video</button>
            <span id="gen-img-spin" class="htmx-indicator">generating…</span>
          </div>
          <div class="hint" id="gen-vid-status" style="margin-top:6px"></div>
          <div id="gen-vid-result"></div>
        </div>
        <div class="ctl-group">
          <div class="ctl-label">Edit</div>
          <div class="ctl-row">
            <button class="btn btn-blue"
                    hx-post="recommend-text"
                    hx-vals="js:{text: document.getElementById(activeTextId).innerText}"
                    hx-target="#text-recs" hx-swap="innerHTML" hx-indicator="#text-spin">
              Get more text variants
            </button>
          </div>
        </div>
        <div class="ctl-group">
          <div class="ctl-label">Download</div>
          <div class="ctl-row">
            <button class="btn btn-dark" onclick="downloadCard()">Download as image (PNG)</button>
            <button class="btn btn-dark" id="videoExportBtn" style="display:none" onclick="downloadVideoWithOverlay()"
                    title="Burns the gradient and text into the video itself — comes back as a ready-to-post MP4">Download as video (MP4)</button>
          </div>
        </div>
        <div class="ctl-group" id="publishGroup" style="display:none">
          <div class="ctl-label">Publish</div>
          <div class="pub-car-wrap">
            <div class="pub-car-viewport"><div class="pub-previews" id="pubPreviews"></div></div>
            <button type="button" class="pub-car-btn pub-car-prev" onclick="pubCarNav(-1)" aria-label="Previous preview">‹</button>
            <button type="button" class="pub-car-btn pub-car-next" onclick="pubCarNav(1)" aria-label="Next preview">›</button>
          </div>
          <div class="pub-car-dots" id="pubCarDots"></div>
          <div class="pub-row">
            <label class="pub-check" id="pubCheckFb">
              <input type="checkbox" id="pubFb" checked onchange="refreshPublishPanel()">
              <span class="pub-dot" style="background:#1877f2"></span>Facebook
            </label>
            <label class="pub-check" id="pubCheckIg">
              <input type="checkbox" id="pubIg" onchange="refreshPublishPanel()">
              <span class="pub-dot" style="background:linear-gradient(45deg,#f09433,#dc2743,#bc1888)"></span>Instagram
            </label>
            <label class="pub-check" id="pubCheckLi">
              <input type="checkbox" id="pubLi" onchange="refreshPublishPanel()">
              <span class="pub-dot" style="background:#0a66c2"></span>LinkedIn
            </label>
            <button class="btn btn-dark" id="pubGoBtn" onclick="publishSelected()">Publish</button>
          </div>
          <div class="pub-row" id="pubCollabRow" style="display:none;margin-top:8px">
            <label for="pubCollabInput" style="font-size:12px;color:#64748b">IG collaborators</label>
            <input type="text" id="pubCollabInput" oninput="renderCollabHint()"
                   placeholder="username1, username2 — optional, up to 3 public accounts"
                   style="flex:1 1 220px;min-width:0;border:1px solid #cbd5e1;border-radius:8px;padding:6px 9px;font-size:12.5px">
          </div>
          <div class="hint" id="pubCollabHint"></div>
          <div class="hint" id="pubHint" style="margin-top:6px"></div>
          <div id="pubResults" style="margin-top:6px"></div>
          <button type="button" class="btn-link" id="pubScheduleToggle" onclick="toggleScheduleUI()" style="margin-top:8px">📅 Schedule for later</button>
          <div class="cal-box" id="pubScheduleBox" style="display:none">
            <div class="cal-head">
              <button type="button" class="cal-nav-btn" onclick="calNav(-1)">‹</button>
              <span class="cal-month-label" id="calMonthLabel"></span>
              <button type="button" class="cal-nav-btn" onclick="calNav(1)">›</button>
            </div>
            <div class="cal-dow"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
            <div class="cal-grid" id="calGrid"></div>
            <div class="pub-row" style="margin-top:10px">
              <span id="calSelectedLabel" class="hint">No date selected</span>
              <input type="time" id="pubScheduleTime" value="10:00" style="border:1px solid #cbd5e1;border-radius:8px;padding:6px 9px;font-size:13px">
              <button class="btn btn-dark" id="pubScheduleBtn" onclick="scheduleSelected()" disabled>Schedule post</button>
            </div>
            <div class="hint" id="pubScheduleHint" style="margin-top:6px"></div>
          </div>
        </div>
      </div>
      <div class="hint" style="margin-top:12px">Pick an image or video on the left · edit the caption directly on the card · “Get more text variants” suggests a LinkedIn/Facebook/Twitter/Instagram rewrite with AI · download as a PNG image, or as an MP4 video with your text and gradient burned in.</div>
    </div>
  </section>
  <section class="composer-side">
    <div class="panel">
      <h2>Style</h2>
      <div class="style-row">
        <label for="formatSelect">Format</label>
        <select id="formatSelect" onchange="applyFormat(this.value)" title="Sets the card's aspect ratio and the exported resolution">
          <option value="square">Square 1:1 — 1080×1080</option>
          <option value="portrait">Portrait 4:5 — 1080×1350 (IG/FB feed)</option>
          <option value="grid">Grid 3:4 — 1080×1440 (IG grid)</option>
          <option value="landscape">Landscape 1.91:1 — 1200×630 (events, link previews)</option>
          <option value="story">Story 9:16 — 1080×1920 (Stories/Reels)</option>
        </select>
      </div>
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
      <div class="style-row" style="align-items:flex-start">
        <label style="margin-top:4px">Emoji</label>
        <div class="emoji-tray" id="emojiTray"></div>
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
<div class="picker-overlay" id="mediaPicker" onclick="if (event.target === this) closeMediaPicker()">
  <div class="picker-box">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2 style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b">Choose an image or video</h2>
      <button class="btn" type="button" onclick="closeMediaPicker()" style="background:#e2e8f0;color:#0f172a">Close</button>
    </div>
    <div class="picker-grid" id="pickerGrid"></div>
  </div>
</div>
<script>
  // Client-side HTML escaper (the server-side esc() is Node-only — publish
  // results, previews and permalinks all render through this).
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  // A thumbnail is either an <img> (data-type="image") or a <video>
  // (data-type="video") — selecting either shows/hides the matching element
  // in the card so the gradient + text zones (siblings of both, in
  // #card-img-wrap) overlay identically no matter which is active.
  function selectMedia(el) {
    var img = document.getElementById('card-img');
    var vid = document.getElementById('card-video');
    document.getElementById('card-img-wrap').classList.remove('media-empty'); // picking media undoes a delete
    var isVideo = (el.getAttribute('data-type') || el.tagName).toLowerCase() === 'video';
    var src = el.getAttribute('src') || '';
    if (isVideo) {
      vid.src = src.replace(/#t=[\\d.]+$/, ''); // drop the thumbnail poster-frame fragment
      vid.style.display = 'block';
      img.style.display = 'none';
      vid.currentTime = 0;
      vid.play().catch(function () {});
    } else {
      img.src = src;
      img.style.display = 'block';
      vid.pause();
      vid.removeAttribute('src');
      vid.style.display = 'none';
    }
    document.getElementById('videoExportBtn').style.display = isVideo ? '' : 'none';
    var slug = el.getAttribute('data-slug');
    if (slug) document.getElementById('img-query').value = slug;
    document.querySelectorAll('.thumb.sel, .rec-thumb.sel').forEach(function (n) { n.classList.remove('sel'); });
    el.classList.add('sel');
    if (typeof refreshPublishPanel === 'function') refreshPublishPanel();
  }
  // Delete the card's main image/video — clears it to an empty placeholder;
  // pick any thumbnail on the left to fill it again.
  function clearCardImage() {
    var img = document.getElementById('card-img');
    var vid = document.getElementById('card-video');
    img.removeAttribute('src'); img.style.display = 'none';
    vid.pause(); vid.removeAttribute('src'); vid.style.display = 'none';
    document.getElementById('card-img-wrap').classList.add('media-empty');
    document.getElementById('videoExportBtn').style.display = 'none';
    document.querySelectorAll('.thumb.sel, .rec-thumb.sel').forEach(function (n) { n.classList.remove('sel'); });
  }
  function deleteMedia(path, wrapEl) {
    if (!confirm('Delete this from the session? This can\\'t be undone.')) return;
    fetch('media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Delete failed (' + r.status + ')'); });
      if (wrapEl) wrapEl.remove();
      var heading = document.getElementById('mediaHeading');
      if (heading) heading.textContent = 'Media (' + document.querySelectorAll('.thumb-wrap').length + ')';
    }).catch(function (err) { alert(err.message); });
  }
  function uploadMedia(file) {
    if (!file) return;
    var status = document.getElementById('uploadStatus');
    status.style.display = 'block';
    status.textContent = 'Uploading ' + file.name + '…';
    var fd = new FormData();
    fd.append('file', file);
    fetch('upload', { method: 'POST', body: fd }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Upload failed (' + r.status + ')'); return d; });
    }).then(function (d) {
      status.style.display = 'none';
      var previewBase = location.href.replace(/studio\\/$/, 'preview/');
      var wrap = document.createElement('div');
      wrap.className = 'thumb-wrap';
      var mediaEl;
      if (d.type === 'video') {
        mediaEl = document.createElement('video');
        mediaEl.className = 'thumb'; mediaEl.muted = true; mediaEl.preload = 'metadata';
        mediaEl.src = previewBase + d.path + '#t=0.1';
        mediaEl.dataset.type = 'video';
        var badge = document.createElement('span');
        badge.className = 'thumb-badge'; badge.textContent = '▶ video';
        wrap.appendChild(mediaEl); wrap.appendChild(badge);
      } else {
        mediaEl = document.createElement('img');
        mediaEl.className = 'thumb'; mediaEl.loading = 'lazy';
        mediaEl.src = previewBase + d.path;
        mediaEl.dataset.type = 'image';
        wrap.appendChild(mediaEl);
      }
      mediaEl.title = d.path;
      mediaEl.onclick = function () { selectMedia(mediaEl); };
      var del = document.createElement('button');
      del.className = 'thumb-del'; del.type = 'button'; del.title = 'Delete this';
      del.dataset.path = d.path; del.textContent = '✕';
      wrap.appendChild(del);
      var thumbs = document.querySelector('.thumbs');
      thumbs.insertBefore(wrap, thumbs.firstChild);
      var heading = document.getElementById('mediaHeading');
      if (heading) heading.textContent = 'Media (' + document.querySelectorAll('.thumb-wrap').length + ')';
      selectMedia(mediaEl);
    }).catch(function (err) {
      status.textContent = err.message;
      setTimeout(function () { status.style.display = 'none'; }, 4000);
    }).finally(function () { document.getElementById('uploadInput').value = ''; });
  }

  // ---- Gemini video generation: Veo runs as a long job (a minute or more),
  // so this kicks it off then polls every few seconds rather than holding one
  // long request open. The result is offered as a click-to-use thumbnail —
  // same "pick it, don't force it" pattern as the image recommendations —
  // instead of silently replacing whatever's on the card right now.
  function generateVideo() {
    var prompt = (document.getElementById('gen-prompt').value || '').trim();
    var status = document.getElementById('gen-vid-status');
    var btn = document.getElementById('genVideoBtn');
    document.getElementById('gen-vid-result').innerHTML = '';
    if (!prompt) { status.innerHTML = '<span style="color:#b91c1c">Describe the video you want first.</span>'; return; }
    btn.disabled = true; btn.textContent = 'Starting…';
    status.textContent = '';
    fetch('generate-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Could not start video generation.'); return d; }); })
      .then(function (d) {
        btn.textContent = 'Generating…';
        status.textContent = 'This can take a few minutes — feel free to keep editing while you wait.';
        pollVideoGen(d.operationName, Date.now());
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = 'Generate video';
        status.innerHTML = '<span style="color:#b91c1c">' + esc(err.message) + '</span>';
      });
  }
  function pollVideoGen(operationName, startedAt) {
    var btn = document.getElementById('genVideoBtn');
    var status = document.getElementById('gen-vid-status');
    fetch('generate-video-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationName: operationName }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Video status check failed.'); return d; }); })
      .then(function (d) {
        if (!d.done) {
          var secs = Math.round((Date.now() - startedAt) / 1000);
          status.textContent = 'Still generating… (' + secs + 's)';
          setTimeout(function () { pollVideoGen(operationName, startedAt); }, 6000);
          return;
        }
        btn.disabled = false; btn.textContent = 'Generate video';
        if (d.error) { status.innerHTML = '<span style="color:#b91c1c">' + esc(d.error) + '</span>'; return; }
        status.innerHTML = '<span style="color:#1b7a45">✓ Video ready — click it to use.</span>';
        var previewBase = location.href.replace(/studio\\/$/, 'preview/');
        var v = document.createElement('video');
        v.className = 'rec-thumb'; v.muted = true; v.preload = 'metadata';
        v.dataset.type = 'video';
        v.src = previewBase + d.path + '#t=0.1';
        v.title = 'Generated with Gemini — click to use';
        v.style.cssText = 'width:100%;max-width:160px;border-radius:8px;cursor:pointer;display:block;margin-top:8px';
        v.onclick = function () { selectMedia(v); };
        document.getElementById('gen-vid-result').appendChild(v);
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = 'Generate video';
        status.innerHTML = '<span style="color:#b91c1c">' + esc(err.message) + '</span>';
      });
  }

  document.addEventListener('click', function (e) {
    var del = e.target.closest('.thumb-del');
    if (del) {
      e.stopPropagation();
      deleteMedia(del.dataset.path, del.closest('.thumb-wrap'));
    }
  });
  function selectText(el) {
    document.getElementById(activeTextId).innerText = el.innerText;
    if (typeof refreshPublishPanel === 'function') refreshPublishPanel();
  }

  // ---- Formats: 2026 Meta/Instagram specs. ar drives the on-screen card;
  // w is the exported pixel width (height follows the ratio). IG feed accepts
  // 4:5 through 1.91:1 — story 9:16 is Stories/Reels only. Events prefer
  // landscape 1.91:1 (1200×630 doubles as the FB link-preview size).
  var FORMATS = {
    square:    { ar: '1 / 1',    w: 1080, igFeed: true,  name: 'Square 1:1' },
    portrait:  { ar: '4 / 5',    w: 1080, igFeed: true,  name: 'Portrait 4:5' },
    grid:      { ar: '3 / 4',    w: 1080, igFeed: true,  name: 'Grid 3:4' },
    landscape: { ar: '1.91 / 1', w: 1200, igFeed: true,  name: 'Landscape 1.91:1' },
    story:     { ar: '9 / 16',   w: 1080, igFeed: false, name: 'Story 9:16' }
  };
  var currentFormat = 'square';
  function applyFormat(key) {
    if (!FORMATS[key]) return;
    currentFormat = key;
    document.getElementById('card').style.aspectRatio = FORMATS[key].ar;
    if (typeof refreshPublishPanel === 'function') refreshPublishPanel();
  }
  // Export scale so the captured PNG lands at the format's target width
  // (e.g. 1080px) regardless of the card's on-screen size.
  function exportScale() {
    var w = document.getElementById('card').clientWidth || 440;
    return Math.max(1, FORMATS[currentFormat].w / w);
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
    activeTextId = id || '';
    renderLayerPills();
    var el = document.getElementById(activeTextId);
    if (el) syncControlsToLayer(el);
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

  // Removes an added caption layer via its pill ✕. The last remaining layer
  // can't be removed — the card always keeps at least one caption.
  function removeTextLayer(id) {
    if (layers.length <= 1) return;
    var el = document.getElementById(id);
    if (el) el.remove();
    layers = layers.filter(function (x) { return x !== id; });
    if (activeTextId === id) activeTextId = layers[0];
    renderLayerPills();
    var act = document.getElementById(activeTextId);
    if (act) syncControlsToLayer(act);
    updateOverlayTextClass();
  }

  function applyTextPosition(pos) {
    var el = document.getElementById(activeTextId);
    if (!el) return;
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
    if (!el) return;
    el.dataset.fontKey = key;
    el.style.fontFamily = FONTS[key] || FONTS.system;
  }
  function applyFontSize(px) {
    var el = document.getElementById(activeTextId);
    if (!el) return;
    el.style.fontSize = px + 'px';
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
    if (!el) return;
    el.dataset.colorHex = hex;
    applyLayerColorBlur(el);
  }
  function toggleBlur() {
    var el = document.getElementById(activeTextId);
    if (!el) return;
    el.dataset.blur = el.dataset.blur === '1' ? '0' : '1';
    applyLayerColorBlur(el);
    document.getElementById('blurBtn').classList.toggle('sel', el.dataset.blur === '1');
  }
  function toggleBold() {
    var t = document.getElementById(activeTextId);
    if (!t) return;
    var on = t.style.fontWeight === '700';
    t.style.fontWeight = on ? '' : '700';
    document.getElementById('boldBtn').classList.toggle('sel', !on);
  }
  function toggleItalic() {
    var t = document.getElementById(activeTextId);
    if (!t) return;
    var on = t.style.fontStyle === 'italic';
    t.style.fontStyle = on ? '' : 'italic';
    document.getElementById('italicBtn').classList.toggle('sel', !on);
  }
  function applyAlign(align, btn) {
    var el = document.getElementById(activeTextId);
    if (!el) return;
    el.style.textAlign = align;
    btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('sel'); });
    btn.classList.add('sel');
  }

  renderLayerPills();

  // Keeps the FB/IG publish previews in sync while typing directly in a
  // caption (delegated so it also covers text boxes added later).
  var refreshPreviewOnInputTimer = 0;
  document.getElementById('card').addEventListener('input', function (e) {
    if (!e.target.classList || !e.target.classList.contains('card-text-layer')) return;
    if (typeof refreshPublishPanel !== 'function') return;
    clearTimeout(refreshPreviewOnInputTimer);
    refreshPreviewOnInputTimer = setTimeout(refreshPublishPanel, 200);
  });

  // ---- Emoji tray: click to drop an emoji into the active caption at the caret.
  var EMOJIS = ['🌈','❤️','🔥','✨','🎉','🙌','👏','💬','📍','🗓️','🎬','😍','🥂','💖','⭐','🎈','🚀','✅','💡','👇','🤝','🌟','💫','🎯','📣','🫶','😊','💪','🎊','📸'];
  function insertEmoji(e) {
    var el = document.getElementById(activeTextId);
    if (!el) return;
    if (document.activeElement !== el) {
      el.focus();
      var sel = window.getSelection(); var range = document.createRange();
      range.selectNodeContents(el); range.collapse(false); // caret to end
      sel.removeAllRanges(); sel.addRange(range);
    }
    document.execCommand('insertText', false, e);
  }
  (function () {
    var tray = document.getElementById('emojiTray');
    if (!tray) return;
    EMOJIS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'emoji-btn'; b.textContent = e; b.title = 'Insert ' + e;
      // mousedown + preventDefault keeps the caption focused so the emoji lands
      // at the caret rather than jumping to the end.
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); insertEmoji(e); });
      tray.appendChild(b);
    });
  })();

  // ---- Drag & drop builder: palette elements dropped onto the card body ----
  var blockSeq = 0;
  var dropLine = document.createElement('div');
  dropLine.className = 'drop-line';

  document.querySelectorAll('.pal-item').forEach(function (p) {
    p.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/ks-element', p.getAttribute('data-el'));
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  function findInsertBefore(zone, y) {
    var kids = Array.prototype.filter.call(zone.children, function (k) { return k !== dropLine; });
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return kids[i];
    }
    return null;
  }

  function wireDropzone(zone, allowColumns) {
    zone.addEventListener('dragover', function (e) {
      var types = e.dataTransfer.types;
      if (Array.prototype.indexOf.call(types, 'text/ks-element') === -1
          && Array.prototype.indexOf.call(types, 'text/ks-block') === -1) return;
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('dragover-zone');
      var before = findInsertBefore(zone, e.clientY);
      if (before) zone.insertBefore(dropLine, before); else zone.appendChild(dropLine);
    });
    zone.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget || !zone.contains(e.relatedTarget)) {
        zone.classList.remove('dragover-zone');
        if (dropLine.parentNode === zone) dropLine.remove();
      }
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('dragover-zone');
      var before = findInsertBefore(zone, e.clientY);
      dropLine.remove();
      var blockId = e.dataTransfer.getData('text/ks-block');
      if (blockId) {
        var moving = document.getElementById(blockId);
        if (moving && moving !== zone && !moving.contains(zone)
            && (allowColumns || moving.getAttribute('data-type') !== 'columns')) {
          if (before) zone.insertBefore(moving, before); else zone.appendChild(moving);
        }
        return;
      }
      var type = e.dataTransfer.getData('text/ks-element');
      if (!type || (type === 'columns' && !allowColumns)) return;
      var block = createBlock(type);
      if (before) zone.insertBefore(block, before); else zone.appendChild(block);
      // Only a drag-dropped Image/Video block opens the media picker — the
      // main media section keeps its own gallery-click behaviour.
      if (type === 'media') openMediaPicker(block.querySelector('.blk-media'));
    });
  }

  function editableEl(tag, cls, text) {
    var el = document.createElement(tag);
    el.className = cls;
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.innerText = text;
    return el;
  }

  function createBlock(type) {
    blockSeq++;
    var b = document.createElement('div');
    b.className = 'cblock cblock-' + type;
    b.id = 'cblock-' + blockSeq;
    b.setAttribute('data-type', type);
    if (type === 'header') {
      b.appendChild(editableEl('div', 'blk-header', 'Headline goes here'));
    } else if (type === 'paragraph') {
      b.appendChild(editableEl('div', 'blk-paragraph', 'Write a short paragraph…'));
    } else if (type === 'divider') {
      var d = document.createElement('div'); d.className = 'blk-divider'; b.appendChild(d);
    } else if (type === 'button') {
      b.appendChild(editableEl('span', 'blk-button', 'Call to action'));
    } else if (type === 'form') {
      b.appendChild(buildFormBlock());
    } else if (type === 'media') {
      var m = document.createElement('div'); m.className = 'blk-media empty';
      m.innerHTML = '<span class="blk-media-hint">▦ Click to choose an image or video</span>';
      m.addEventListener('click', function () { openMediaPicker(m); });
      b.appendChild(m);
    } else if (type === 'columns') {
      var c = document.createElement('div'); c.className = 'blk-cols';
      for (var i = 0; i < 2; i++) {
        var col = document.createElement('div'); col.className = 'blk-col';
        wireDropzone(col, false);
        c.appendChild(col);
      }
      b.appendChild(c);
    }
    var handle = document.createElement('span');
    handle.className = 'cblock-handle'; handle.textContent = '⠿'; handle.title = 'Drag to reorder';
    handle.draggable = true;
    handle.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/ks-block', b.id);
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    var del = document.createElement('button');
    del.className = 'cblock-del'; del.type = 'button'; del.textContent = '✕'; del.title = 'Remove';
    del.addEventListener('click', function () { b.remove(); });
    b.appendChild(handle);
    b.appendChild(del);
    return b;
  }

  // ---- Form builder: fields + images + a live submit that stores to the DB.
  function makeFormField(labelText) {
    var w = document.createElement('div');
    w.className = 'form-field';
    w.appendChild(editableEl('div', 'ff-label', labelText));
    var inp = document.createElement('input');
    inp.className = 'ff-input';
    inp.placeholder = 'Type here…';
    w.appendChild(inp);
    var del = document.createElement('button');
    del.className = 'ff-del'; del.type = 'button'; del.textContent = '✕'; del.title = 'Remove field';
    del.addEventListener('click', function () { w.remove(); });
    w.appendChild(del);
    return w;
  }

  function buildFormBlock() {
    var f = document.createElement('div');
    f.className = 'blk-form';
    f.appendChild(editableEl('div', 'blk-form-title', 'Sign up'));
    var fields = document.createElement('div');
    fields.className = 'form-fields';
    fields.appendChild(makeFormField('Your email'));
    f.appendChild(fields);

    var tools = document.createElement('div');
    tools.className = 'form-tools';
    var addField = document.createElement('span');
    addField.className = 'form-tool'; addField.textContent = '+ Text field';
    addField.addEventListener('click', function () {
      var fld = makeFormField('Your answer');
      fields.appendChild(fld);
      fld.querySelector('.ff-label').focus();
    });
    var addImg = document.createElement('span');
    addImg.className = 'form-tool'; addImg.textContent = '+ Image';
    addImg.addEventListener('click', function () {
      var m = document.createElement('div');
      m.className = 'blk-media empty';
      m.innerHTML = '<span class="blk-media-hint">▦ Click to choose an image or video</span>';
      m.addEventListener('click', function () { openMediaPicker(m); });
      f.insertBefore(m, tools);
      openMediaPicker(m);
    });
    tools.appendChild(addField);
    tools.appendChild(addImg);
    f.appendChild(tools);

    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'blk-form-submit';
    var lbl = editableEl('span', 'blk-form-submit-label', 'Submit');
    submit.appendChild(lbl);
    submit.title = 'Click to submit and store in your database · click the text itself to edit the label';
    submit.addEventListener('click', function (e) {
      if (e.target === lbl) return; // caret landed in the label — editing, not submitting
      submitForm(f, submit, lbl);
    });
    f.appendChild(submit);

    // Enter inside any field submits, like a real form.
    f.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ff-input')) {
        e.preventDefault();
        submitForm(f, submit, lbl);
      }
    });
    return f;
  }

  function submitForm(formEl, submitBtn, lblEl) {
    var fields = {};
    var n = 0;
    formEl.querySelectorAll('.form-field').forEach(function (fld) {
      n++;
      var key = (fld.querySelector('.ff-label').innerText.trim() || ('Field ' + n)).slice(0, 200);
      while (Object.prototype.hasOwnProperty.call(fields, key)) key += ' ·';
      fields[key] = fld.querySelector('.ff-input').value.slice(0, 2000);
    });
    if (!Object.keys(fields).length) { alert('Add at least one text field first.'); return; }
    var orig = lblEl.innerText;
    submitBtn.disabled = true;
    lblEl.innerText = 'Saving…';
    fetch('form-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form: (formEl.querySelector('.blk-form-title').innerText.trim() || 'Form').slice(0, 200),
        fields: fields
      })
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Save failed (' + r.status + ')'); });
    }).then(function () {
      lblEl.innerText = '✓ Saved';
      formEl.querySelectorAll('.ff-input').forEach(function (i) { i.value = ''; });
      setTimeout(function () { lblEl.innerText = orig; submitBtn.disabled = false; }, 1800);
    }).catch(function (err) {
      alert(err.message);
      lblEl.innerText = orig;
      submitBtn.disabled = false;
    });
  }

  // Media picker — populated from the same session media the left gallery shows.
  var pickerTarget = null;
  function openMediaPicker(mediaEl) {
    pickerTarget = mediaEl;
    var grid = document.getElementById('pickerGrid');
    grid.innerHTML = '';
    var thumbs = document.querySelectorAll('.thumbs .thumb');
    if (!thumbs.length) grid.innerHTML = '<div class="hint">No media in this session yet — upload one first.</div>';
    thumbs.forEach(function (t) {
      var isVid = (t.getAttribute('data-type') || t.tagName).toLowerCase() === 'video';
      var src = (t.getAttribute('src') || '').replace(/#t=[\\d.]+$/, '');
      var item;
      if (isVid) {
        item = document.createElement('video');
        item.muted = true; item.preload = 'metadata';
        item.src = src + '#t=0.1';
      } else {
        item = document.createElement('img');
        item.src = src;
      }
      item.className = 'picker-thumb';
      item.addEventListener('click', function () { applyPicked(src, isVid); });
      grid.appendChild(item);
    });
    document.getElementById('mediaPicker').style.display = 'flex';
  }
  function closeMediaPicker() {
    document.getElementById('mediaPicker').style.display = 'none';
    pickerTarget = null;
  }
  function applyPicked(src, isVid) {
    if (!pickerTarget) return;
    pickerTarget.classList.remove('empty');
    pickerTarget.innerHTML = '';
    var el;
    if (isVid) {
      el = document.createElement('video');
      el.src = src; el.muted = true; el.loop = true; el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.play && el.play().catch(function () {});
    } else {
      el = document.createElement('img');
      el.src = src; el.crossOrigin = 'anonymous';
    }
    pickerTarget.appendChild(el);
    closeMediaPicker();
  }

  wireDropzone(document.getElementById('card-body'), true);

  function downloadCard() {
    var card = document.getElementById('card');
    card.classList.add('exporting'); // hide block chrome in the PNG

    var restores = [];

    // The card body scrolls while editing, so a tall stack of dropped blocks
    // would export clipped to the visible square. Freeze the image area's
    // pixel height, then let the card + body grow to their full content so
    // the capture includes everything. (Only relevant with blocks below the
    // image — overlay-text mode hides the body entirely.)
    var body = document.getElementById('card-body');
    if (body && !card.classList.contains('overlay-text') && body.scrollHeight > body.clientHeight + 2) {
      var wrap = document.getElementById('card-img-wrap');
      var pWrapH = wrap.style.height, pCardH = card.style.height, pAR = card.style.aspectRatio, pOv = body.style.overflow;
      wrap.style.height = wrap.offsetHeight + 'px';
      card.style.aspectRatio = 'auto';
      card.style.height = 'auto';
      body.style.overflow = 'visible';
      restores.push(function () {
        wrap.style.height = pWrapH; card.style.height = pCardH; card.style.aspectRatio = pAR; body.style.overflow = pOv;
      });
    }

    // html2canvas can't paint <video> elements at all — it leaves the region
    // blank. Swap EVERY visible video in the card (main media + any dropped
    // media blocks) for a still of its current frame, capture, then restore.
    var videoSnapped = false;
    Array.prototype.forEach.call(card.querySelectorAll('video'), function (v) {
      if (!v.currentSrc || v.offsetParent === null || v.style.display === 'none') return;
      try {
        var off = document.createElement('canvas');
        off.width = v.videoWidth; off.height = v.videoHeight;
        off.getContext('2d').drawImage(v, 0, 0, off.width, off.height);
        var snap = document.createElement('img');
        snap.src = off.toDataURL('image/png');
        snap.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
        v.style.display = 'none';
        v.parentNode.insertBefore(snap, v);
        videoSnapped = true;
        restores.push(function () { snap.remove(); v.style.display = 'block'; });
      } catch (e) { /* cross-origin or decode failure — export what html2canvas can see */ }
    });

    // Webfonts (Fraunces/Poppins/Playfair) load async — capturing before
    // they're ready silently rasterizes the fallback font instead.
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      return html2canvas(card, { useCORS: true, scale: exportScale(), backgroundColor: '#ffffff' });
    }).then(function (canvas) {
      var a = document.createElement('a');
      a.download = 'card-' + Date.now() + (videoSnapped ? '-frame' : '') + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    }).finally(function () {
      card.classList.remove('exporting');
      restores.forEach(function (r) { r(); });
    });
  }

  // Export the video itself with the gradient + text burned into every frame.
  // The overlay is captured client-side as a transparent PNG of #card-img-wrap
  // (video pixels hidden via visibility so layout is preserved), then ffmpeg
  // on the server composites it over the full clip.
  function downloadVideoWithOverlay() {
    var vid = document.getElementById('card-video');
    var wrap = document.getElementById('card-img-wrap');
    var card = document.getElementById('card');
    var btn = document.getElementById('videoExportBtn');
    if (vid.style.display === 'none' || !vid.currentSrc) {
      alert('Pick a video first — this export burns your text and gradient into the video itself.');
      return;
    }
    var relPath;
    try { relPath = decodeURIComponent(new URL(vid.currentSrc).pathname.split('/preview/')[1] || ''); } catch (e) { relPath = ''; }
    if (!relPath) { alert('Could not work out which video file is loaded.'); return; }
    btn.disabled = true;
    btn.textContent = 'Rendering video… (can take a minute)';
    card.classList.add('exporting');
    // Fully remove the video from the render tree (display:none, not just
    // visibility:hidden) — html2canvas paints a hidden <video>'s black
    // background box as opaque pixels, which would then cover the whole clip
    // and freeze it. The wrap keeps its size (its height comes from #card's
    // aspect-ratio, not the video), so gradient + text zones still lay out.
    vid.style.display = 'none';
    var restore = function () { vid.style.display = 'block'; card.classList.remove('exporting'); };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      return html2canvas(wrap, { useCORS: true, scale: exportScale(), backgroundColor: null });
    }).then(function (canvas) {
      restore();
      return fetch('render-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath, overlay: canvas.toDataURL('image/png') })
      });
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Render failed (' + r.status + ')'); return d; });
    }).then(function (d) {
      var a = document.createElement('a');
      a.href = location.href.replace(/studio\\/$/, 'preview/') + d.path;
      a.download = 'card-video-' + Date.now() + '.mp4';
      a.click();
    }).catch(function (err) {
      alert(err.message);
    }).finally(function () {
      restore();
      btn.disabled = false;
      btn.textContent = 'Download as video';
    });
  }

  // ---- Publish to Facebook -------------------------------------------------
  // Composes the card exactly like the downloads (PNG for images, or the
  // overlay-burned MP4 for videos), then hands it to the server which posts it
  // to a connected Page. Page tokens live only on the server.

  function composeCardPng() {
    var card = document.getElementById('card');
    card.classList.add('exporting');
    var restores = [];
    var body = document.getElementById('card-body');
    if (body && !card.classList.contains('overlay-text') && body.scrollHeight > body.clientHeight + 2) {
      var wrap = document.getElementById('card-img-wrap');
      var pWrapH = wrap.style.height, pCardH = card.style.height, pAR = card.style.aspectRatio, pOv = body.style.overflow;
      wrap.style.height = wrap.offsetHeight + 'px'; card.style.aspectRatio = 'auto'; card.style.height = 'auto'; body.style.overflow = 'visible';
      restores.push(function () { wrap.style.height = pWrapH; card.style.height = pCardH; card.style.aspectRatio = pAR; body.style.overflow = pOv; });
    }
    Array.prototype.forEach.call(card.querySelectorAll('video'), function (v) {
      if (!v.currentSrc || v.offsetParent === null || v.style.display === 'none') return;
      try {
        var off = document.createElement('canvas'); off.width = v.videoWidth; off.height = v.videoHeight;
        off.getContext('2d').drawImage(v, 0, 0, off.width, off.height);
        var snap = document.createElement('img'); snap.src = off.toDataURL('image/png');
        snap.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
        v.style.display = 'none'; v.parentNode.insertBefore(snap, v);
        restores.push(function () { snap.remove(); v.style.display = 'block'; });
      } catch (e) {}
    });
    return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
      .then(function () { return html2canvas(card, { useCORS: true, scale: exportScale(), backgroundColor: '#ffffff' }); })
      .then(function (canvas) { return canvas.toDataURL('image/png'); })
      .finally(function () { card.classList.remove('exporting'); restores.forEach(function (r) { r(); }); });
  }

  // Facebook publish image: clean photo + gradient, NO text — because the text
  // is posted as the FB message. Forces full-bleed image mode (photo fills the
  // card, the caption body is hidden) and hides any overlay text layers, so a
  // below-image caption or an over-image caption both drop out cleanly.
  function composeCardImageNoText() {
    var card = document.getElementById('card');
    card.classList.add('exporting');
    var restores = [function () { card.classList.remove('exporting'); }];
    if (!card.classList.contains('overlay-text')) {
      card.classList.add('overlay-text');
      restores.push(function () { card.classList.remove('overlay-text'); });
    }
    // Drop the below-image caption only — it goes in the FB post message. Text
    // placed OVER the image is a visual element positioned on the photo, so it
    // must stay baked into the composed image.
    Array.prototype.forEach.call(card.querySelectorAll('.card-text-layer'), function (t) {
      if ((t.dataset.position || 'below') !== 'below') return;
      var d = t.style.display; t.style.display = 'none';
      restores.push(function () { t.style.display = d; });
    });
    Array.prototype.forEach.call(card.querySelectorAll('video'), function (v) {
      if (!v.currentSrc || v.offsetParent === null || v.style.display === 'none') return;
      try {
        var off = document.createElement('canvas'); off.width = v.videoWidth; off.height = v.videoHeight;
        off.getContext('2d').drawImage(v, 0, 0, off.width, off.height);
        var snap = document.createElement('img'); snap.src = off.toDataURL('image/png');
        snap.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
        v.style.display = 'none'; v.parentNode.insertBefore(snap, v);
        restores.push(function () { snap.remove(); v.style.display = 'block'; });
      } catch (e) {}
    });
    return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
      .then(function () { return html2canvas(card, { useCORS: true, scale: exportScale(), backgroundColor: '#ffffff' }); })
      .then(function (canvas) { return canvas.toDataURL('image/png'); })
      .finally(function () { restores.forEach(function (r) { r(); }); });
  }

  // Renders the overlay onto the active video server-side and returns the MP4's
  // workspace path (same pipeline the video download uses). For Facebook we hide
  // the text so ONLY the gradient burns in — text goes in the post message.
  function composeCardVideoPath(noText) {
    var vid = document.getElementById('card-video');
    var wrap = document.getElementById('card-img-wrap');
    var card = document.getElementById('card');
    var relPath;
    try { relPath = decodeURIComponent(new URL(vid.currentSrc).pathname.split('/preview/')[1] || ''); } catch (e) { relPath = ''; }
    if (!relPath) return Promise.reject(new Error('Could not work out which video is loaded.'));
    card.classList.add('exporting'); vid.style.display = 'none';
    var hidden = [];
    if (noText) {
      // Only a below-image caption is dropped (it's in the FB post message).
      // Over-image text is positioned on the video and must burn in.
      Array.prototype.forEach.call(wrap.querySelectorAll('.card-text-layer'), function (t) {
        if ((t.dataset.position || 'below') !== 'below') return;
        hidden.push([t, t.style.display]); t.style.display = 'none';
      });
    }
    var restoreText = function () { hidden.forEach(function (p) { p[0].style.display = p[1]; }); };
    return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
      .then(function () { return html2canvas(wrap, { useCORS: true, scale: exportScale(), backgroundColor: null }); })
      .then(function (canvas) {
        vid.style.display = 'block'; card.classList.remove('exporting'); restoreText();
        return fetch('render-video', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: relPath, overlay: canvas.toDataURL('image/png') }) });
      })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Render failed'); return d.path; }); })
      .finally(function () { vid.style.display = 'block'; card.classList.remove('exporting'); restoreText(); });
  }

  function currentCaption() {
    var el = document.getElementById(activeTextId) || document.querySelector('.card-text-layer');
    return el ? el.innerText.trim() : '';
  }
  // Everything the card says, in reading order — caption layer(s) plus any
  // dropped header/paragraph/button/form-title blocks — so a Facebook post
  // carries ALL the card's text as its real (plain) message, not just the
  // active caption. The styled version still lives in the image.
  function collectCardText() {
    var nodes = document.getElementById('card')
      .querySelectorAll('.card-text-layer, .blk-header, .blk-paragraph, .blk-button, .blk-form-title');
    var parts = [];
    Array.prototype.forEach.call(nodes, function (n) {
      var t = (n.innerText || '').trim();
      if (t) parts.push(t);
    });
    return parts.join('\\n\\n');
  }
  function activeIsVideo() {
    var v = document.getElementById('card-video');
    return v.style.display !== 'none' && !!v.currentSrc;
  }

  // Publishing is owned by the host portal (which holds the OAuth tokens).
  // Studio composes the media ONCE (clean, no text — the text is the post
  // message), then hands off one postMessage PER SELECTED TARGET; the portal
  // posts to Facebook / Instagram / LinkedIn and replies per target.
  // Instagram's API fetches images from a public URL, so for IG the composed
  // PNG is first saved into the session workspace (public preview URL).
  var PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };

  function dataUrlToBlob(dataUrl) {
    var bin = atob(dataUrl.split(',')[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'image/png' });
  }
  function uploadComposed(blob) {
    var fd = new FormData();
    fd.append('file', blob, 'publish-card.png');
    return fetch('upload', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Could not stage the image for Instagram.'); return d.path; }); });
  }

  // Current media as a small preview src (video → current frame snapshot).
  function previewMediaSrc() {
    if (activeIsVideo()) {
      var v = document.getElementById('card-video');
      try {
        var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        return c.toDataURL('image/png');
      } catch (e) { return ''; }
    }
    var img = document.getElementById('card-img');
    return (img && img.style.display !== 'none' && img.src) ? img.src : '';
  }

  var MOCK_PLATFORMS = {
    fb: { avatarBg: '#1877f2', avatarText: 'f', name: 'Facebook', sub: 'Page post · just now' },
    ig: { avatarBg: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)', avatarText: 'IG', name: 'Instagram', sub: 'Feed · grid crops to 3:4' },
    li: { avatarBg: '#0a66c2', avatarText: 'in', name: 'LinkedIn', sub: 'Your profile · just now' }
  };
  function mockHtml(kind, src, caption, format) {
    var p = MOCK_PLATFORMS[kind];
    var head = '<div class="pub-mock-head"><span class="pub-mock-avatar" style="background:' + p.avatarBg + '">' + p.avatarText + '</span><div><div class="pub-mock-name">' + p.name + '</div><div class="pub-mock-sub">' + p.sub + '</div></div></div>';
    var warn = '';
    var ar = format.ar;
    if (kind === 'ig' && !format.igFeed) {
      ar = '4 / 5';
      warn = '<div class="pub-mock-warn">9:16 is for Stories/Reels — IG feed needs 4:5 to 1.91:1. Switch Format to include Instagram.</div>';
    }
    var imgHtml = src ? '<img src="' + esc(src) + '" alt="">' : '';
    return '<div class="pub-mock">' + head
      + '<div class="pub-mock-img" style="aspect-ratio:' + ar + '">' + imgHtml + warn + '</div>'
      + '<div class="pub-mock-cap">' + esc(caption || 'Your caption appears here as the post text.') + '</div>'
      + '<button type="button" class="pub-mock-more" style="display:none" onclick="toggleMockCaption(this)">… more</button></div>';
  }

  // Platforms clamp a caption to a couple of lines and offer "… more" — mirror
  // that instead of hard-cutting text the author can't get back to. Each mock
  // card toggles independently; the button only shows if the caption actually
  // overflows the clamp (a short caption never gets a dead "more" link).
  function toggleMockCaption(btn) {
    var cap = btn.previousElementSibling;
    var expanded = cap.classList.toggle('expanded');
    btn.textContent = expanded ? 'Show less' : '… more';
  }
  function syncMockCaptionOverflow() {
    document.querySelectorAll('#pubPreviews .pub-mock-cap').forEach(function (cap) {
      var btn = cap.nextElementSibling;
      if (!btn) return;
      cap.classList.remove('expanded');
      btn.textContent = '… more';
      btn.style.display = cap.scrollHeight > cap.clientHeight + 1 ? '' : 'none';
    });
  }

  // ---- Publish preview carousel: one platform mock visible at a time with
  // prev/next + dots, so FB/IG/LinkedIn previews don't fight for width.
  var pubCarIndex = 0;
  function renderPubCarousel() {
    var mocks = document.querySelectorAll('#pubPreviews .pub-mock');
    var track = document.getElementById('pubPreviews');
    var dots = document.getElementById('pubCarDots');
    if (!mocks.length || !track || !dots) return;
    if (pubCarIndex >= mocks.length) pubCarIndex = 0;
    track.style.transform = 'translateX(-' + (pubCarIndex * 100) + '%)';
    dots.innerHTML = '';
    mocks.forEach(function (m, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'pub-car-dot' + (i === pubCarIndex ? ' sel' : '');
      d.setAttribute('aria-label', 'Show preview ' + (i + 1));
      d.onclick = function () { pubCarIndex = i; renderPubCarousel(); };
      dots.appendChild(d);
    });
    // Reset expand state on every render/nav — otherwise an expanded caption
    // on a slide you've scrolled away from keeps the whole carousel taller
    // than the (collapsed) slide actually being shown.
    syncMockCaptionOverflow();
  }
  function pubCarNav(delta) {
    var mocks = document.querySelectorAll('#pubPreviews .pub-mock');
    if (!mocks.length) return;
    pubCarIndex = (pubCarIndex + delta + mocks.length) % mocks.length;
    renderPubCarousel();
  }

  // Keeps checkboxes legal for the current card + rebuilds the previews.
  function refreshPublishPanel() {
    var group = document.getElementById('publishGroup');
    if (!group || group.style.display === 'none') return;
    var igCheck = document.getElementById('pubIg');
    var igLabel = document.getElementById('pubCheckIg');
    var hint = document.getElementById('pubHint');
    var fmt = FORMATS[currentFormat];
    var igBlock = activeIsVideo()
      ? 'Instagram video isn\\'t supported yet — publish the image, or send the video to Facebook.'
      : (!fmt.igFeed ? 'Story 9:16 is outside Instagram\\'s feed range (4:5 – 1.91:1).' : '');
    if (igBlock) {
      igCheck.checked = false; igCheck.disabled = true; igLabel.title = igBlock;
    } else {
      igCheck.disabled = false; igLabel.title = '';
    }
    hint.textContent = igBlock || ('Format: ' + fmt.name + ' · exports at ' + fmt.w + 'px wide · text posts as the caption, not baked into the media.');
    var src = previewMediaSrc();
    var caption = collectCardText();
    document.getElementById('pubPreviews').innerHTML = mockHtml('fb', src, caption, fmt) + mockHtml('ig', src, caption, fmt) + mockHtml('li', src, caption, fmt);
    renderPubCarousel();
    var any = document.getElementById('pubFb').checked || igCheck.checked || document.getElementById('pubLi').checked;
    document.getElementById('pubGoBtn').disabled = !any;
    document.getElementById('pubCollabRow').style.display = (igCheck.checked && !igCheck.disabled) ? '' : 'none';
    renderCollabHint();
  }

  // Instagram lets you tag up to 3 public accounts as post co-authors — the
  // post appears on both profiles once they accept the invite. Facebook and
  // LinkedIn have no equivalent, so this only ever reaches the IG publish call.
  function collectCollaborators() {
    var raw = (document.getElementById('pubCollabInput') || {}).value || '';
    return raw.split(',').map(function (s) { return s.trim().replace(/^@/, ''); }).filter(Boolean).slice(0, 3);
  }
  function renderCollabHint() {
    var hint = document.getElementById('pubCollabHint');
    if (!hint || document.getElementById('pubCollabRow').style.display === 'none') { if (hint) hint.textContent = ''; return; }
    var raw = (document.getElementById('pubCollabInput') || {}).value || '';
    var typed = raw.split(',').map(function (s) { return s.trim().replace(/^@/, ''); }).filter(Boolean);
    var bad = typed.filter(function (n) { return !/^[A-Za-z0-9._]{1,30}$/.test(n); });
    if (bad.length) hint.innerHTML = '<span style="color:#b91c1c">Usernames can only contain letters, numbers, periods and underscores.</span>';
    else if (typed.length > 3) hint.innerHTML = '<span style="color:#b91c1c">Instagram allows up to 3 collaborators — only the first 3 will be invited.</span>';
    else hint.textContent = '';
  }

  function publishSelected() {
    var targets = [];
    if (document.getElementById('pubFb').checked) targets.push('facebook');
    if (document.getElementById('pubIg').checked) targets.push('instagram');
    if (document.getElementById('pubLi').checked) targets.push('linkedin');
    var btn = document.getElementById('pubGoBtn');
    var results = document.getElementById('pubResults');
    if (!targets.length) { results.innerHTML = '<div class="pub-result-line" style="color:#b91c1c">Pick at least one platform.</div>'; return; }
    btn.disabled = true; btn.textContent = 'Composing…';
    results.innerHTML = '';
    var caption = collectCardText();
    var prep;
    if (activeIsVideo()) {
      prep = composeCardVideoPath(true).then(function (path) {
        return { kind: 'video', videoUrl: location.href.replace(/studio\\/$/, 'preview/') + path };
      });
    } else {
      prep = composeCardImageNoText().then(function (dataUrl) {
        if (targets.indexOf('instagram') === -1) return { kind: 'image', image: dataUrl };
        btn.textContent = 'Staging for Instagram…';
        return uploadComposed(dataUrlToBlob(dataUrl)).then(function (path) {
          return { kind: 'image', image: dataUrl, imageUrl: location.href.replace(/studio\\/$/, 'preview/') + path };
        });
      });
    }
    prep.then(function (media) {
      btn.textContent = 'Publishing…';
      var pending = {};
      targets.forEach(function (t) {
        pending[t] = true;
        results.innerHTML += '<div class="pub-result-line" id="pubres-' + t + '"><span style="color:#64748b">' + PLATFORM_LABEL[t] + ': sending…</span></div>';
      });
      function done() { return !Object.keys(pending).some(function (k) { return pending[k]; }); }
      function onResult(e) {
        if (!e.data || e.data.type !== 'ks-studio-publish-result') return;
        var t = e.data.target;
        if (!pending[t]) return;
        pending[t] = false;
        var line = document.getElementById('pubres-' + t);
        if (line) {
          if (e.data.ok) {
            var link = e.data.permalink ? ' — <a href="' + esc(e.data.permalink) + '" target="_blank" rel="noopener">view ↗</a>' : '';
            line.innerHTML = '<span style="color:#1b7a45">✓ ' + esc(e.data.note || (PLATFORM_LABEL[t] + ': posted.')) + '</span>' + link;
          } else {
            line.innerHTML = '<span style="color:#b91c1c">✕ ' + PLATFORM_LABEL[t] + ': ' + esc(e.data.error || 'failed') + '</span>';
          }
        }
        if (done()) { window.removeEventListener('message', onResult); btn.disabled = false; btn.textContent = 'Publish'; }
      }
      window.addEventListener('message', onResult);
      targets.forEach(function (t) {
        var payload = { type: 'ks-studio-publish', target: t, sessionId: '${id}', caption: caption, kind: media.kind };
        if (media.videoUrl) payload.videoUrl = media.videoUrl;
        // IG only needs the public URL; FB/LinkedIn upload the bytes.
        if (t === 'instagram') { payload.imageUrl = media.imageUrl; payload.collaborators = collectCollaborators(); }
        else if (media.image) payload.image = media.image;
        (window.parent || window).postMessage(payload, '*');
      });
      setTimeout(function () {
        var timedOut = false;
        Object.keys(pending).forEach(function (t) {
          if (!pending[t]) return;
          timedOut = true; pending[t] = false;
          var line = document.getElementById('pubres-' + t);
          if (line) line.innerHTML = '<span style="color:#b91c1c">✕ ' + PLATFORM_LABEL[t] + ': the portal didn\\'t respond — open Studio from your portal.</span>';
        });
        if (timedOut) { window.removeEventListener('message', onResult); btn.disabled = false; btn.textContent = 'Publish'; }
      }, 60000);
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'Publish';
      results.innerHTML = '<div class="pub-result-line" style="color:#b91c1c">' + esc(err.message) + '</div>';
    });
  }

  // ---- Schedule for later: a small calendar control that hands the composed
  // image + target platforms + a future timestamp to the parent portal, which
  // stores it and publishes it itself when the date arrives (Studio's own tab
  // will not be open then, so it cannot fire the publish itself).
  var calViewDate = new Date(); calViewDate.setDate(1);
  var calSelected = null; // Date at local midnight of the chosen day
  var calMarkedDates = {}; // 'YYYY-MM-DD' -> true, for days with a pending scheduled post
  var calDatesRequested = false;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function calDateKey(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

  function toggleScheduleUI() {
    var box = document.getElementById('pubScheduleBox');
    var show = box.style.display === 'none';
    box.style.display = show ? 'block' : 'none';
    if (!show) return;
    renderCalendar();
    document.getElementById('pubScheduleHint').innerHTML = activeIsVideo()
      ? '<span style="color:#b91c1c">Scheduling supports images only right now — publish the video immediately instead.</span>' : '';
    if (!calDatesRequested) {
      calDatesRequested = true;
      (window.parent || window).postMessage({ type: 'ks-studio-schedule-dates' }, '*');
    }
  }

  function calNav(delta) {
    calViewDate.setMonth(calViewDate.getMonth() + delta);
    renderCalendar();
  }

  function renderCalendar() {
    var y = calViewDate.getFullYear(), m = calViewDate.getMonth();
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calMonthLabel').textContent = monthNames[m] + ' ' + y;
    var grid = document.getElementById('calGrid');
    grid.innerHTML = '';
    var firstDow = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var cells = [];
    for (var i = 0; i < firstDow; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) cells.push(d);
    cells.forEach(function (d) {
      var cell = document.createElement('div');
      if (d === null) { cell.className = 'cal-day cal-outside'; grid.appendChild(cell); return; }
      var thisDate = new Date(y, m, d);
      var key = calDateKey(y, m, d);
      cell.className = 'cal-day';
      cell.textContent = d;
      if (thisDate < today) cell.classList.add('cal-disabled');
      if (thisDate.getTime() === today.getTime()) cell.classList.add('cal-today');
      if (calMarkedDates[key]) cell.classList.add('cal-has-post');
      if (calSelected && calDateKey(calSelected.getFullYear(), calSelected.getMonth(), calSelected.getDate()) === key) cell.classList.add('cal-selected');
      if (thisDate >= today) cell.onclick = function () { selectCalDate(y, m, d); };
      grid.appendChild(cell);
    });
  }

  function selectCalDate(y, m, d) {
    calSelected = new Date(y, m, d);
    document.getElementById('calSelectedLabel').textContent = calSelected.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('pubScheduleBtn').disabled = false;
    renderCalendar();
  }

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'ks-studio-schedule-dates-result' || !e.data.dates) return;
    calMarkedDates = {};
    e.data.dates.forEach(function (ds) { calMarkedDates[ds] = true; });
    renderCalendar();
  });

  function scheduleSelected() {
    var targets = [];
    if (document.getElementById('pubFb').checked) targets.push('facebook');
    if (document.getElementById('pubIg').checked) targets.push('instagram');
    if (document.getElementById('pubLi').checked) targets.push('linkedin');
    var hint = document.getElementById('pubScheduleHint');
    var btn = document.getElementById('pubScheduleBtn');
    if (!targets.length) { hint.innerHTML = '<span style="color:#b91c1c">Pick at least one platform above.</span>'; return; }
    if (!calSelected) { hint.innerHTML = '<span style="color:#b91c1c">Pick a date on the calendar.</span>'; return; }
    if (activeIsVideo()) { hint.innerHTML = '<span style="color:#b91c1c">Scheduling supports images only right now — publish the video immediately instead.</span>'; return; }
    var timeVal = document.getElementById('pubScheduleTime').value || '10:00';
    var parts = timeVal.split(':');
    var when = new Date(calSelected.getFullYear(), calSelected.getMonth(), calSelected.getDate(), Number(parts[0] || 10), Number(parts[1] || 0), 0, 0);
    if (when.getTime() < Date.now() + 60000) { hint.innerHTML = '<span style="color:#b91c1c">Pick a time at least a minute from now.</span>'; return; }
    btn.disabled = true; btn.textContent = 'Composing…';
    hint.textContent = '';
    var caption = collectCardText();
    composeCardImageNoText().then(function (dataUrl) {
      btn.textContent = 'Staging…';
      return uploadComposed(dataUrlToBlob(dataUrl)).then(function (path) {
        return location.href.replace(/studio\\/$/, 'preview/') + path;
      });
    }).then(function (imageUrl) {
      btn.textContent = 'Scheduling…';
      return new Promise(function (resolve, reject) {
        function onResult(e) {
          if (!e.data || e.data.type !== 'ks-studio-schedule-result') return;
          window.removeEventListener('message', onResult);
          if (e.data.ok) resolve(e.data); else reject(new Error(e.data.error || 'Scheduling failed.'));
        }
        window.addEventListener('message', onResult);
        (window.parent || window).postMessage({
          type: 'ks-studio-schedule', sessionId: '${id}', caption: caption,
          targets: targets, imageUrl: imageUrl, scheduledAt: when.toISOString(),
          collaborators: targets.indexOf('instagram') !== -1 ? collectCollaborators() : []
        }, '*');
        setTimeout(function () {
          window.removeEventListener('message', onResult);
          reject(new Error('The portal did not respond — open Studio from your portal.'));
        }, 30000);
      });
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Schedule post';
      hint.innerHTML = '<span style="color:#1b7a45">✓ Scheduled for ' + esc(when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '.</span>';
      var key = calDateKey(calSelected.getFullYear(), calSelected.getMonth(), calSelected.getDate());
      calMarkedDates[key] = true;
      renderCalendar();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'Schedule post';
      hint.innerHTML = '<span style="color:#b91c1c">' + esc(err.message) + '</span>';
    });
  }

  // Only offer publishing when embedded in a host portal that can post for us.
  if (window.parent && window.parent !== window) {
    document.getElementById('publishGroup').style.display = '';
    refreshPublishPanel();
  }

  // ---- Collapsible media library: closed by default, remembered per browser.
  function setGallery(open) {
    document.querySelector('.layout').classList.toggle('gclosed', !open);
    var b = document.getElementById('galleryToggle');
    b.textContent = open ? '⟨' : '🖼';
    b.title = open ? 'Hide the media library' : 'Show the media library';
    try { localStorage.setItem('ks_gallery_open', open ? '1' : '0'); } catch (e) {}
  }
  function toggleGallery() {
    setGallery(document.querySelector('.layout').classList.contains('gclosed'));
  }
  (function () {
    var open = false;
    try { open = localStorage.getItem('ks_gallery_open') === '1'; } catch (e) {}
    setGallery(open);
  })();
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
            <img class="rec-thumb" data-type="image" src="${esc(previewBase + s.path)}"
                 data-slug="${esc(query)}" title="${esc(s.photographer ? 'Photo: ' + s.photographer : s.path)}"
                 onclick="selectMedia(this)">`).join('');
        sendFragment(res, html);
    } catch (err) {
        logger.error(`studio recommend-images error session=${id}: ${err.message}`);
        sendFragment(res, errFragment('Image search failed — try again.'));
    }
});

// ----------------------------------------------------- generate-image (htmx)
// Gemini's "Nano Banana" image model, via the Interactions API. Synchronous
// (a few seconds) so this fits the same htmx fragment pattern as
// recommend-images above — one generated image dropped into #img-recs.

router.post(/^\/build\/([a-f0-9]{16})\/studio\/generate-image$/, async (req, res) => {
    const id = req.params[0];
    const prompt = String(req.body?.prompt || '').trim().slice(0, 600);
    if (!prompt) return sendFragment(res, errFragment('Describe the image you want first.'));
    if (!GEMINI_KEY) return sendFragment(res, errFragment('GEMINI_API_KEY is not configured on the server.'));
    try {
        const meterInfo = await sessionMeterInfo(id);
        if (meterInfo.partner_id) {
            const credit = await checkPartnerCredit(meterInfo.partner_id);
            if (credit.blocked) return sendFragment(res, errFragment('Token budget exhausted — image generation is paused for this workspace.'));
        }
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
            method: 'POST',
            headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: GEMINI_IMAGE_MODEL, input: [{ type: 'text', text: prompt }] }),
        });
        if (!r.ok) return sendFragment(res, errFragment(`Gemini returned ${r.status}: ${(await r.text()).slice(0, 200)}`));
        const data = await r.json();
        const outputStep = (data.steps || []).find(s => s.type === 'model_output');
        const imgPart = outputStep?.content?.find(c => c.type === 'image');
        if (!imgPart?.data) return sendFragment(res, errFragment('Gemini did not return an image — try a different prompt.'));
        // Interactions responses carry exact token usage (image output is
        // billed as image tokens) — record it against the session's tenant.
        recordUsage({
            provider: 'google', model: GEMINI_IMAGE_MODEL,
            usage: {
                input_tokens:  data.usage?.total_input_tokens ?? 0,
                output_tokens: data.usage?.total_output_tokens ?? 0,
                cached_input_tokens: data.usage?.total_cached_tokens ?? 0,
            },
            meter: { ...meterInfo, agent: 'studio', context: 'studio-generate-image' },
        });
        const ext = imgPart.mime_type === 'image/png' ? 'png' : 'jpg';
        const buf = Buffer.from(imgPart.data, 'base64');
        const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gemini';
        const relPath = `assets/studio-gen-${slug}-${Date.now()}.${ext}`;
        const abs = await safeResolve(id, relPath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, buf);
        const previewBase = `/api/build/${id}/preview/`;
        sendFragment(res, `<img class="rec-thumb" data-type="image" src="${esc(previewBase + relPath)}" title="Generated with Gemini: ${esc(prompt)}" onclick="selectMedia(this)">`);
    } catch (err) {
        logger.error(`studio generate-image error session=${id}: ${err.message}`);
        sendFragment(res, errFragment('Image generation failed — try again.'));
    }
});

// ------------------------------------------------------ generate-video (JSON)
// Veo, via the classic long-running-operation pattern: kick off the job here
// (returns immediately with an operation name), then the client polls
// generate-video-status below. No server-side job state is kept — each poll
// re-asks Gemini directly, so this survives a server restart mid-generation.

router.post(/^\/build\/([a-f0-9]{16})\/studio\/generate-video$/, async (req, res) => {
    const id = req.params[0];
    const prompt = String(req.body?.prompt || '').trim().slice(0, 600);
    if (!prompt) return res.status(400).json({ error: 'Describe the video you want first.' });
    if (!GEMINI_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    try {
        const meterInfo = await sessionMeterInfo(id);
        if (meterInfo.partner_id) {
            const credit = await checkPartnerCredit(meterInfo.partner_id);
            if (credit.blocked) return res.status(402).json({ error: 'Token budget exhausted — video generation is paused for this workspace.' });
        }
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VIDEO_MODEL}:predictLongRunning`, {
            method: 'POST',
            headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ instances: [{ prompt }] }),
        });
        if (!r.ok) return res.status(502).json({ error: `Gemini returned ${r.status}: ${(await r.text()).slice(0, 200)}` });
        const data = await r.json();
        if (!data.name) return res.status(502).json({ error: 'Gemini did not return an operation id.' });
        res.json({ ok: true, operationName: data.name });
    } catch (err) {
        logger.error(`studio generate-video error session=${id}: ${err.message}`);
        res.status(502).json({ error: 'Video generation failed to start — try again.' });
    }
});

// Operation names look like "models/veo-3.1-generate-preview/operations/xyz" —
// validated so this can't be abused as an open proxy to arbitrary Gemini paths.
const VEO_OP_RE = /^models\/[\w.-]+\/operations\/[\w-]+$/;

// Completed operations we've already saved + metered, so a client re-polling
// a finished job gets the same path back instead of re-downloading the clip
// and (worse) double-billing the tenant. In-memory only: after a restart a
// re-poll would re-record, but clients stop polling on done, so in practice
// this window is the same request loop that started the job.
const veoCompleted = new Map(); // operationName → relPath

router.post(/^\/build\/([a-f0-9]{16})\/studio\/generate-video-status$/, async (req, res) => {
    const id = req.params[0];
    const operationName = String(req.body?.operationName || '');
    if (!VEO_OP_RE.test(operationName)) return res.status(400).json({ error: 'Bad operation id.' });
    if (!GEMINI_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    if (veoCompleted.has(operationName)) return res.json({ ok: true, done: true, path: veoCompleted.get(operationName) });
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
            headers: { 'x-goog-api-key': GEMINI_KEY },
        });
        if (!r.ok) return res.status(502).json({ error: `Gemini returned ${r.status}: ${(await r.text()).slice(0, 200)}` });
        const data = await r.json();
        if (!data.done) return res.json({ ok: true, done: false });
        if (data.error) return res.json({ ok: true, done: true, error: data.error.message || 'Video generation failed.' });
        const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!videoUri) return res.json({ ok: true, done: true, error: 'Gemini finished but returned no video.' });
        // fetch() follows the file host's redirect automatically (unlike curl,
        // which needs -L) — no extra config needed here.
        const vRes = await fetch(videoUri, { headers: { 'x-goog-api-key': GEMINI_KEY } });
        if (!vRes.ok) return res.json({ ok: true, done: true, error: `Could not download the generated video (${vRes.status}).` });
        const buf = Buffer.from(await vRes.arrayBuffer());
        const relPath = `assets/studio-genvid-${Date.now()}.mp4`;
        const abs = await safeResolve(id, relPath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, buf);
        veoCompleted.set(operationName, relPath);
        // Veo bills per second of output — probe the real duration rather than
        // assuming the 8s default (falls back to 8s if ffprobe can't read it).
        let seconds = 8;
        try { seconds = await probeDurationSeconds(abs); } catch { /* keep the default */ }
        const meterInfo = await sessionMeterInfo(id);
        recordUsage({
            provider: 'google', model: GEMINI_VIDEO_MODEL,
            meter: { ...meterInfo, agent: 'studio', context: 'studio-generate-video' },
            costUSD: seconds * VEO_USD_PER_SECOND,
        });
        res.json({ ok: true, done: true, path: relPath });
    } catch (err) {
        logger.error(`studio generate-video-status error session=${id}: ${err.message}`);
        res.status(502).json({ error: 'Could not check video status — try again.' });
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

// ------------------------------------------------------- delete-media (JSON)

router.delete(/^\/build\/([a-f0-9]{16})\/studio\/media$/, async (req, res) => {
    const id = req.params[0];
    const relPath = String(req.body?.path || '');
    if (!MEDIA_RE.test(relPath)) return res.status(400).json({ error: 'Not an image or video path.' });
    try {
        const abs = await safeResolve(id, relPath);
        await fs.unlink(abs);
        res.json({ ok: true });
    } catch (err) {
        logger.error(`studio delete-media error session=${id} path=${relPath}: ${err.message}`);
        res.status(404).json({ error: 'Could not delete that file — it may already be gone.' });
    }
});

// ------------------------------------------------------------ upload (JSON)

router.post(/^\/build\/([a-f0-9]{16})\/studio\/upload$/, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        const id = req.params[0];
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (80MB max).' : 'Upload rejected — only JPEG/PNG/WebP/GIF images or MP4/WebM/MOV video are accepted.';
            return res.status(400).json({ error: msg });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        try {
            const isVideo = req.file.mimetype.startsWith('video/');
            const extFromName = path.extname(req.file.originalname || '').toLowerCase();
            const ext = isVideo
                ? (/^\.(mp4|webm|mov|m4v)$/i.test(extFromName) ? extFromName : '.mp4')
                : (/^\.(jpe?g|png|webp|gif)$/i.test(extFromName) ? extFromName : '.jpg');
            const relPath = `assets/upload-${Date.now()}${ext}`;
            const abs = await safeResolve(id, relPath);
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, req.file.buffer);
            const stat = await fs.stat(abs);
            res.json({ path: relPath, bytes: stat.size, type: isVideo ? 'video' : 'image' });
        } catch (uploadErr) {
            logger.error(`studio upload error session=${id}: ${uploadErr.message}`);
            res.status(500).json({ error: 'Upload failed — try again.' });
        }
    });
});

// ------------------------------------------------------ render-video (JSON)
// Burns the card's overlay (gradient + text layers, sent by the client as a
// transparent PNG snapshot of #card-img-wrap) into every frame of a session
// video with ffmpeg, and saves the result into the workspace for download.
// Pure local CPU — no external API, no metered cost.

const FFMPEG_TIMEOUT_MS = 3 * 60 * 1000;
const RENDER_MAX_SECONDS = 120; // hard cap on output duration as a CPU guard

function runCmd(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args);
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${cmd} timed out`));
        }, FFMPEG_TIMEOUT_MS);
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('error', err => { clearTimeout(timer); reject(err); });
        child.on('close', code => {
            clearTimeout(timer);
            if (code === 0) resolve(stdout);
            else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400).trim()}`));
        });
    });
}

// Works for both videos and still images — ffprobe reports a PNG as a
// single-frame video stream with width/height.
async function probeDims(fileAbs) {
    const out = await runCmd('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0:s=x', fileAbs,
    ]);
    const m = out.trim().match(/^(\d+)x(\d+)/);
    if (!m) throw new Error(`could not probe dimensions: ${out.slice(0, 100)}`);
    return { w: Number(m[1]), h: Number(m[2]) };
}

// Duration in whole seconds (ceil — Veo bills per started second).
async function probeDurationSeconds(fileAbs) {
    const out = await runCmd('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0', fileAbs,
    ]);
    const secs = parseFloat(out.trim());
    if (!Number.isFinite(secs) || secs <= 0) throw new Error(`could not probe duration: ${out.slice(0, 100)}`);
    return Math.ceil(secs);
}

router.post(/^\/build\/([a-f0-9]{16})\/studio\/render-video$/, async (req, res) => {
    const id = req.params[0];
    const relPath = String(req.body?.path || '');
    const overlay = String(req.body?.overlay || '');
    if (!VIDEO_RE.test(relPath)) return res.status(400).json({ error: 'Not a video path.' });
    const m = overlay.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ error: 'Missing or invalid overlay image.' });
    const overlayAbs = `${await safeResolve(id, `assets/render-overlay-${Date.now()}.png`)}`;
    try {
        const videoAbs = await safeResolve(id, relPath);
        await fs.stat(videoAbs); // throws if missing
        await fs.writeFile(overlayAbs, Buffer.from(m[1], 'base64'));
        const outRel = `assets/export-${Date.now()}.mp4`;
        const outAbs = await safeResolve(id, outRel);
        // The output matches the card preview exactly (WYSIWYG): the overlay is
        // a snapshot of the square #card-img-wrap, so we cover-fit the video
        // into the overlay's dimensions (scale up to cover, centre-crop the
        // overflow — the object-fit:cover the browser does) rather than
        // stretching the overlay onto the video. That keeps text/gradient
        // undistorted even when the video's aspect ratio differs from the card
        // (e.g. a portrait clip in a square card). Both layers are scaled to
        // the SAME even WxH so overlay=0:0 lines up pixel-for-pixel, and the
        // video's own frames drive the timeline so motion is preserved.
        const od = await probeDims(overlayAbs);
        const W = od.w - (od.w % 2), H = od.h - (od.h % 2); // libx264/yuv420p need even dims
        await runCmd('ffmpeg', [
            '-y', '-i', videoAbs, '-i', overlayAbs,
            '-filter_complex',
            `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[base];`
            + `[1:v]scale=${W}:${H}[ov];[base][ov]overlay=0:0:format=auto[out]`,
            '-map', '[out]', '-map', '0:a?',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
            '-c:a', 'copy', '-t', String(RENDER_MAX_SECONDS),
            '-movflags', '+faststart', outAbs,
        ]);
        const stat = await fs.stat(outAbs);
        res.json({ path: outRel, bytes: stat.size });
    } catch (err) {
        logger.error(`studio render-video error session=${id} path=${relPath}: ${err.message}`);
        res.status(500).json({ error: 'Video render failed — try again.' });
    } finally {
        fs.unlink(overlayAbs).catch(() => {});
    }
});

// ---------------------------------------------------- form submissions (PB)
// A Form block's Submit button POSTs its field values here; they're stored in
// the studio_form_submissions PocketBase collection keyed by session id. The
// session id is the capability, consistent with the rest of the studio.

router.post(/^\/build\/([a-f0-9]{16})\/studio\/form-submit$/, async (req, res) => {
    const id = req.params[0];
    const fields = req.body?.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return res.status(400).json({ error: 'No form fields submitted.' });
    }
    const entries = Object.entries(fields).slice(0, 30)
        .map(([k, v]) => [String(k).slice(0, 200), String(v ?? '').slice(0, 2000)]);
    if (!entries.length) return res.status(400).json({ error: 'No form fields submitted.' });
    try {
        // Reject junk writes against ids that aren't real sessions.
        const manifest = await fileManifest(id);
        if (!manifest.length) return res.status(404).json({ error: 'Unknown session.' });
        const rec = await pb.collection('studio_form_submissions').create({
            session_id: id,
            form_title: String(req.body?.form || '').slice(0, 200),
            data: Object.fromEntries(entries),
        });
        res.json({ ok: true, id: rec.id });
    } catch (err) {
        logger.error(`studio form-submit error session=${id}: ${err.message}`);
        res.status(500).json({ error: 'Could not save the submission — try again.' });
    }
});

router.get(/^\/build\/([a-f0-9]{16})\/studio\/submissions$/, async (req, res) => {
    const id = req.params[0];
    try {
        const items = await pb.collection('studio_form_submissions').getFullList({
            filter: `session_id = "${id}"`, sort: '-created',
        });
        res.json({
            submissions: items.map(i => ({ id: i.id, form: i.form_title, data: i.data, created: i.created })),
        });
    } catch (err) {
        logger.error(`studio submissions list error session=${id}: ${err.message}`);
        res.status(500).json({ error: 'Could not load submissions.' });
    }
});

export default router;
