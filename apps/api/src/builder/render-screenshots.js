// Renders Tara's platform-mockup HTML pages to flat PNGs so the deliverable
// is something a user can actually upload to Instagram/Facebook/LinkedIn/X —
// an .html file styled to look like a post is not a postable asset on its
// own. This is a deterministic post-process (no LLM involved), so it costs
// no extra tokens and can't be skipped by the model forgetting a step.
//
// Puppeteer needs a real Chromium binary. In Docker (see apps/api/Dockerfile)
// we install it via `apk add chromium` and point PUPPETEER_EXECUTABLE_PATH
// at it; puppeteer-core never tries to download its own copy. If the env var
// isn't set (bare local dev with no Chromium), this module skips rendering
// and logs a warning — HTML output alone is still produced, so a missing
// screenshot capability degrades the feature, it doesn't break the run.

import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../utils/logger.js';

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
const NAV_TIMEOUT_MS = 25_000;

async function readDeclaredDims(metaPath) {
    try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        const m = String(meta.dimensions || '').match(/(\d+)\s*[×x]\s*(\d+)/);
        if (m) return { w: Number(m[1]), h: Number(m[2]) };
    } catch { /* meta.json missing or unparsable — use the fallback below */ }
    return { w: 1080, h: 1350 }; // Instagram feed — the most common default format
}

// sessionDirAbs: absolute path to the session workspace root.
// manifest: the {path, bytes}[] from fileManifest(sessionId).
// Returns {path, bytes}[] for the .png files it wrote, to merge into the
// manifest the caller returns to the client.
export async function renderPlatformScreenshots(sessionDirAbs, manifest) {
    const htmlFiles = manifest
        .map((f) => f.path)
        .filter((p) => /^posts\/[^/]+\/[^/]+\.html$/.test(p));
    if (htmlFiles.length === 0) return [];

    if (!CHROME_PATH) {
        logger.warn('renderPlatformScreenshots: PUPPETEER_EXECUTABLE_PATH not set — skipping (no Chromium available in this environment)');
        return [];
    }

    let puppeteer;
    try {
        ({ default: puppeteer } = await import('puppeteer-core'));
    } catch (err) {
        logger.warn(`renderPlatformScreenshots: puppeteer-core not installed — skipping (${err.message})`);
        return [];
    }

    let browser;
    const rendered = [];
    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        for (const relHtml of htmlFiles) {
            const absHtml = path.join(sessionDirAbs, relHtml);
            const metaPath = path.join(path.dirname(absHtml), 'meta.json');
            const dims = await readDeclaredDims(metaPath);
            let page;
            try {
                page = await browser.newPage();
                // Generous viewport so Tara's frame lays out at its natural
                // size without wrapping — the element screenshot below crops
                // to the frame's ACTUAL rendered bounding box regardless of
                // whether it matches the declared dimensions exactly, so this
                // doesn't need to be precise, just large enough.
                await page.setViewport({
                    width: Math.max(1400, dims.w + 200),
                    height: Math.max(1800, dims.h + 200),
                    deviceScaleFactor: 1, // 1:1 CSS px so output matches the platform's required upload pixels
                });
                await page.goto(`file://${absHtml}`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS });

                // Tara's own template consistently wraps each post in one
                // element directly under <body> (e.g. <div class="fb-frame">)
                // — screenshot that element specifically so the output is the
                // post itself, not the padding/centering wrapper around it.
                const handle = await page.evaluateHandle(() => document.body.firstElementChild);
                const el = handle.asElement();

                const outRel = relHtml.replace(/\.html$/, '.png');
                const outAbs = path.join(sessionDirAbs, outRel);
                if (el) {
                    await el.screenshot({ path: outAbs });
                } else {
                    await page.screenshot({ path: outAbs });
                }
                const stat = await fs.stat(outAbs);
                rendered.push({ path: outRel, bytes: stat.size });
            } catch (err) {
                // One broken frame (e.g. a font CDN timeout) must not cost
                // the user the other three platforms.
                logger.warn(`renderPlatformScreenshots: failed for ${relHtml}: ${err.message}`);
            } finally {
                if (page) await page.close().catch(() => {});
            }
        }
    } catch (err) {
        logger.error(`renderPlatformScreenshots: browser launch failed: ${err.message}`);
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
    return rendered;
}
