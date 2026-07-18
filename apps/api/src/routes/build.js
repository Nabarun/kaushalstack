import { Router } from 'express';
import fs from 'node:fs/promises';
import { ZipArchive } from 'archiver';
import logger from '../utils/logger.js';
import path from 'node:path';
import { sessionDir, safeResolve, readSessionResult, fileManifest } from '../builder/workspace.js';
import { ANANYA_SKILL_ID } from '../builder/creative-registry.js';
import { handle } from './creative-http.js';

// CSP loosened enough for previewed apps that pull libs from CDNs (unpkg /
// jsdelivr / cdnjs). Helmet's default disallows third-party scripts; we
// override on preview routes only.
// Explicit frame-ancestors (superseding helmet's X-Frame-Options: SAMEORIGIN)
// so the Site Builder's canvas iframe works when the builder itself is
// embedded in a partner portal — the browser checks EVERY ancestor of the
// preview frame, including the portal at the top. Same env allowlist as Studio.
const PREVIEW_FRAME_ANCESTORS = ["'self'", ...String(process.env.STUDIO_FRAME_ANCESTORS || 'https://mrnmr.srv1562298.hstgr.cloud').split(',').map((s) => s.trim()).filter(Boolean)];
const PREVIEW_CSP = `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src *; font-src * data: https:; frame-src https:; frame-ancestors ${PREVIEW_FRAME_ANCESTORS.join(' ')};`;

// strict: true so `/preview` and `/preview/` are distinct — the no-slash
// version redirects to the slash version (so relative paths inside the
// previewed HTML resolve under /preview/, not the parent path).
const router = Router({ strict: true });

// POST /build — backwards-compat wrapper for Ananya. Both JSON and SSE
// modes via the shared `handle()` — pass `?stream=1` (or Accept:
// text/event-stream) to get live progress.
router.post('/build', (req, res) => handle(req, res, ANANYA_SKILL_ID));

// GET /build/:id/result — recovery path. 200 with the result when the agent
// has finished, 404 + a progress payload while it's still running. The
// payload gives the UI something better than "try again in 30s" — it shows
// how many files the agent has written and when it last touched the
// workspace, so the user can see actual forward motion.
router.get('/build/:id/result', async (req, res) => {
    const id = req.params.id;
    if (!/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ error: 'invalid session id' });
    try {
        const result = await readSessionResult(id);
        if (result) return res.json(result);

        // No final result yet — try to read the workspace as a liveness signal.
        const manifest = await fileManifest(id).catch(() => []);
        if (!manifest.length) {
            return res.status(404).json({ error: 'result not ready', workspace_exists: false });
        }
        const dir = await sessionDir(id);
        let latestMtime = 0;
        let latestPath  = null;
        for (const f of manifest) {
            try {
                const st = await fs.stat(path.join(dir, f.path));
                if (st.mtimeMs > latestMtime) { latestMtime = st.mtimeMs; latestPath = f.path; }
            } catch { /* file gone between manifest and stat — ignore */ }
        }
        return res.status(404).json({
            error: 'result not ready',
            workspace_exists: true,
            files_written: manifest.length,
            latest_file: latestPath,
            last_activity_ms_ago: latestMtime ? Date.now() - latestMtime : null,
        });
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
//
// Accepts ALL HTTP methods (GET, POST, etc.) so generated form-submit pages
// work without a backend. Ananya often writes `<form action="next.html"
// method="POST">` and a real user clicking submit would land on a 404 if we
// only accepted GET. The preview is static — the form data is intentionally
// discarded; we just serve the destination HTML so the multi-page flow is
// navigable.
router.all(/^\/build\/([a-f0-9]{16})\/preview\/(.*)$/, async (req, res) => {
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
