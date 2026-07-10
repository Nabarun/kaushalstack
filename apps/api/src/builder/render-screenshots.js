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
                const viewportW = Math.max(1400, dims.w + 200);
                const viewportH = Math.max(1800, dims.h + 200);
                await page.setViewport({ width: viewportW, height: viewportH, deviceScaleFactor: 1 });
                await page.goto(`file://${absHtml}`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS });

                // networkidle0 fires on network quiescence, not on webfont
                // SWAP completion — a real (if rare) race where Fraunces/Inter
                // haven't painted yet and text renders in the fallback font
                // or briefly invisible (FOIT). Wait on the font-loading API
                // directly, plus every <img> and CSS background-image being
                // fully decoded, before capturing anything.
                await page.evaluate(() => document.fonts.ready).catch(() => {});
                await page.evaluate(async () => {
                    const imgs = Array.from(document.images).map((img) =>
                        img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; }));
                    const bgUrls = [];
                    for (const el of document.querySelectorAll('*')) {
                        const bg = getComputedStyle(el).backgroundImage;
                        const matches = bg && bg.match(/url\(["']?([^"')]+)["']?\)/g);
                        if (matches) matches.forEach((u) => bgUrls.push(u.slice(4).replace(/^["']|["']?\)$/g, '')));
                    }
                    const bgs = bgUrls.map((src) => new Promise((res) => {
                        const i = new Image(); i.onload = i.onerror = res; i.src = src;
                    }));
                    await Promise.all([...imgs, ...bgs]);
                }).catch(() => {});

                // Tara's system prompt mandates data-render-target="true" on
                // the post's outer frame div (e.g. <div class="fb-frame"
                // data-render-target="true">) — sessions generated before
                // that prompt change won't have it, so fall back to "first
                // element under body", which was the sole strategy before
                // and matched every real session observed.
                const handle = await page.evaluateHandle(() =>
                    document.querySelector('[data-render-target]') || document.body.firstElementChild);
                const el = handle.asElement();

                // Tara's CSS frame is typically built at "preview widget" size
                // (a few hundred px), not the literal platform upload pixel
                // count. Measure the actual rendered box, then bump the device
                // scale factor so the exported PNG lands near the platform's
                // native resolution instead of a soft, undersized crop —
                // upscaling via DPR (a true re-raster) rather than resizing
                // the PNG after the fact, so text stays crisp.
                if (el) {
                    const box = await el.boundingBox();
                    if (box?.width > 0) {
                        const scale = Math.min(4, Math.max(1, dims.w / box.width));
                        if (scale > 1.05) {
                            await page.setViewport({ width: viewportW, height: viewportH, deviceScaleFactor: scale });
                        }
                    }
                }

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
