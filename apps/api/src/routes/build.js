import { Router } from 'express';
import fs from 'node:fs/promises';
import { ZipArchive } from 'archiver';
import logger from '../utils/logger.js';
import { sessionDir, safeResolve, readSessionResult } from '../builder/workspace.js';
import { ANANYA_SKILL_ID } from '../builder/creative-registry.js';
import { handle } from './creative-http.js';

// CSP loosened enough for previewed apps that pull libs from CDNs (unpkg /
// jsdelivr / cdnjs). Helmet's default disallows third-party scripts; we
// override on preview routes only.
const PREVIEW_CSP = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src *; font-src * data: https:; frame-src https:;";

// strict: true so `/preview` and `/preview/` are distinct — the no-slash
// version redirects to the slash version (so relative paths inside the
// previewed HTML resolve under /preview/, not the parent path).
const router = Router({ strict: true });

// POST /build — backwards-compat wrapper for Ananya. Both JSON and SSE
// modes via the shared `handle()` — pass `?stream=1` (or Accept:
// text/event-stream) to get live progress.
router.post('/build', (req, res) => handle(req, res, ANANYA_SKILL_ID));

// GET /build/:id/result — recovery path. Returns the persisted result for a
// session that has finished (the SSE stream may have dropped before the
// client received the `done` event). 404 means the run is either still
// in-flight or never wrote a sidecar (e.g. the agent threw before completing).
router.get('/build/:id/result', async (req, res) => {
    const id = req.params.id;
    if (!/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: 'invalid session id' });
    try {
        const result = await readSessionResult(id);
        if (!result) return res.status(404).json({ error: 'result not ready' });
        res.json(result);
    } catch (err) {
        logger.error(`build result read error session=${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /build/:id/download — streams a ZIP of the session workspace
router.get('/build/:id/download', async (req, res) => {
    const id = req.params.id;
    if (!/^[a-f0-9]{16}$/.test(id)) {
        return res.status(400).json({ error: 'invalid session id' });
    }
    try {
        const dir = await sessionDir(id);
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="kaushal-app-${id}.zip"`,
        });
        const zip = new ZipArchive({ zlib: { level: 9 } });
        zip.on('error', err => {
            logger.error('zip error:', err.message);
            try { res.status(500).end(); } catch { /* already streaming */ }
        });
        zip.pipe(res);
        zip.directory(dir, false);
        await zip.finalize();
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// Redirect /build/:id/preview → /build/:id/preview/ so relative paths in
// index.html (e.g. assets/style.css) resolve against the right base URL.
// We hardcode the /api prefix because Traefik strips it before reaching us,
// so req.originalUrl doesn't include it.
router.get('/build/:id/preview', (req, res) => {
    if (!/^[a-f0-9]{16}$/.test(req.params.id)) return res.status(404).end();
    res.redirect(301, `/api/build/${req.params.id}/preview/`);
});

// Catch-all under /build/:id/preview/* — serves the requested file from the
// session workspace. Defaults to index.html for the root.
router.get(/^\/build\/([a-f0-9]{16})\/preview\/(.*)$/, async (req, res) => {
    const id = req.params[0];
    let rel = req.params[1] || '';
    if (!rel || rel.endsWith('/')) rel = `${rel || ''}index.html`;
    // Sidecar files (e.g. _session_result.json) live alongside user files but
    // are internal — the recovery route /build/:id/result is the way to read
    // them. Hide them from the public preview.
    if (rel.split('/').some(seg => seg.startsWith('_session_'))) return res.status(404).end();
    try {
        const abs = await safeResolve(id, rel);
        await fs.stat(abs); // throws if missing
        // Override helmet's strict CSP so CDN-loaded JS/CSS works.
        res.setHeader('Content-Security-Policy', PREVIEW_CSP);
        res.sendFile(abs);
    } catch {
        res.status(404).end();
    }
});

export default router;
