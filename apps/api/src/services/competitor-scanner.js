import logger from '../utils/logger.js';

// Pragmatic scanner: fetch competitor homepage + try common RSS endpoints,
// with a Google News RSS fallback when the site itself can't be reached.
// Returns recent items (title + link + pubDate) from the last DEFAULT_WINDOW_MS
// where the feed exposes timestamps. Social platforms (X/IG/LinkedIn) are
// intentionally out of scope — they need paid API access or anti-bot bypassing.

const USER_AGENT = 'Mozilla/5.0 (compatible; KaushalStackGrowthBot/1.0; +https://kaushalstack.com)';
const FETCH_TIMEOUT_MS = 6000;            // single-request timeout
const PER_COMPETITOR_BUDGET_MS = 25000;   // hard wall-clock cap per competitor
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RSS_CANDIDATE_PATHS = [
    '/rss', '/feed', '/feed/', '/rss.xml', '/atom.xml',
    '/blog/rss', '/blog/feed', '/news/rss', '/news/feed',
    '/index.xml', '/feeds/posts/default',
];

async function timedFetch(url, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, {
            ...init,
            redirect: 'follow',
            headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) },
            signal: ctrl.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

function toUrl(maybe, base) {
    try {
        return new URL(maybe, base).toString();
    } catch {
        return null;
    }
}

function extractRssLinks(html, baseUrl) {
    const out = new Set();
    const linkRe = /<link\b[^>]*>/gi;
    for (const tag of html.match(linkRe) || []) {
        const typeMatch = tag.match(/type=["']([^"']+)["']/i);
        if (!typeMatch) continue;
        const type = typeMatch[1].toLowerCase();
        if (!/rss|atom|xml/.test(type)) continue;
        const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) continue;
        const abs = toUrl(hrefMatch[1], baseUrl);
        if (abs) out.add(abs);
    }
    return [...out];
}

function stripTags(s) {
    return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

function parseRss(xml, baseUrl) {
    const items = [];
    const itemRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
    for (const block of xml.match(itemRe) || []) {
        const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
        let link = '';
        const linkAttr = block.match(/<link[^>]*href=["']([^"']+)["']/i);
        if (linkAttr) link = linkAttr[1];
        else link = stripTags((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
        const pubRaw = (block.match(/<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || '';
        const desc = stripTags((block.match(/<(description|summary|content[^>]*)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || '').slice(0, 600);
        const pub = pubRaw ? new Date(pubRaw) : null;
        items.push({
            title: title.slice(0, 300),
            link: link ? toUrl(link, baseUrl) || link : '',
            published: pub && !isNaN(pub) ? pub.toISOString() : null,
            description: desc,
        });
    }
    return items;
}

async function tryRssAt(url) {
    try {
        const res = await timedFetch(url);
        if (!res.ok) return null;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const text = await res.text();
        if (!/xml|rss|atom/.test(ct) && !/<rss|<feed|<channel/i.test(text)) return null;
        return parseRss(text, url);
    } catch {
        return null;
    }
}

function summarizeHomepage(html) {
    const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const desc = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
    const og   = (html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
    const h1s = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) || []).slice(0, 3).map(stripTags).filter(Boolean);
    return {
        title: title.slice(0, 300),
        description: (desc || og).slice(0, 500),
        headings: h1s.map(h => h.slice(0, 200)),
    };
}

function isRecent(iso, sinceMs) {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= sinceMs;
}

async function tryGoogleNews(competitorName, competitorWebsite, since) {
    if (!competitorName) return null;
    try {
        // Bias the query toward the company by name + domain so we don't grab
        // generic news for ambiguous brand names. Falls back to name-only.
        let host = '';
        try { host = new URL(competitorWebsite).hostname.replace(/^www\./, ''); } catch {}
        const q = host
            ? `"${competitorName}" OR site:${host}`
            : `"${competitorName}"`;
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
        const res = await timedFetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        const items = parseRss(text, url);
        if (!items.length) return null;
        return {
            feed_url: url,
            all_items: items.slice(0, 30),
            recent_items: items.filter(it => isRecent(it.published, since)).slice(0, 20),
        };
    } catch {
        return null;
    }
}

// Pick the first RSS candidate that returns items. Runs in parallel and
// short-circuits as soon as one succeeds, so a single slow URL doesn't
// hold up the others. Always settles — resolves on first hit, when all
// candidates finish without a hit, or when the wall-clock ceiling fires.
// Returns { url, items } | null.
function raceRssCandidates(candidates) {
    if (candidates.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => {
        let done = false;
        let remaining = candidates.length;
        const finish = (val) => {
            if (done) return;
            done = true;
            clearTimeout(ceiling);
            resolve(val);
        };
        for (const url of candidates) {
            tryRssAt(url)
                .then((items) => {
                    if (items && items.length) finish({ url, items });
                })
                .catch(() => {})
                .finally(() => {
                    remaining--;
                    if (remaining === 0) finish(null);
                });
        }
        const ceiling = setTimeout(() => finish(null), FETCH_TIMEOUT_MS + 2000);
    });
}

// Hard wall-clock cap on the entire competitor scan. Even if some inner
// step hangs against expectations, this resolves cleanly with a failure
// row instead of leaving the report stuck in "running" forever.
function withHardTimeout(promise, ms, label) {
    return new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
            if (done) return;
            done = true;
            resolve({ __timed_out: true, label });
        }, ms);
        promise.then(
            (val) => { if (!done) { done = true; clearTimeout(t); resolve(val); } },
            (err) => { if (!done) { done = true; clearTimeout(t); resolve({ __error: err?.message || String(err) }); } },
        );
    });
}

export async function scanCompetitor(competitor, { since = Date.now() - DEFAULT_WINDOW_MS } = {}) {
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    const out = {
        name: competitor.name,
        website: competitor.website,
        ok: false,
        homepage: null,
        feed_url: null,
        recent_items: [],
        all_items: [],
        source: null,        // 'homepage_rss' | 'direct_rss' | 'google_news'
        notice: null,        // soft note when we used a fallback
        error: null,         // hard error only when nothing at all worked
    };

    let homepageHtml = '';
    let homepageFailed = false;
    let homepageErr = null;

    logger.info(`scanCompetitor: "${competitor.name}" (${competitor.website}) — fetching homepage`);
    try {
        const res = await timedFetch(competitor.website);
        if (!res.ok) throw new Error(`status ${res.status}`);
        homepageHtml = await res.text();
        out.homepage = summarizeHomepage(homepageHtml);
    } catch (err) {
        homepageFailed = true;
        homepageErr = err.message;
        logger.info(`scanCompetitor: "${competitor.name}" homepage failed — ${err.message}`);
    }

    // RSS discovery: links declared in the homepage HTML (if we got it) +
    // common path conventions. Race them in parallel so the slowest URL
    // doesn't dominate. Even when the homepage fails, common paths may work
    // because the feed endpoint isn't bot-blocked.
    if (elapsed() < PER_COMPETITOR_BUDGET_MS) {
        const linkedFromHomepage = homepageHtml
            ? extractRssLinks(homepageHtml, competitor.website)
            : [];
        const candidates = [...new Set([
            ...linkedFromHomepage,
            ...RSS_CANDIDATE_PATHS.map(p => toUrl(p, competitor.website)).filter(Boolean),
        ])];
        logger.info(`scanCompetitor: "${competitor.name}" — racing ${candidates.length} RSS candidates`);
        const winner = await raceRssCandidates(candidates);
        if (winner) {
            out.feed_url = winner.url;
            out.all_items = winner.items.slice(0, 30);
            out.recent_items = winner.items.filter(it => isRecent(it.published, since)).slice(0, 20);
            out.source = linkedFromHomepage.includes(winner.url) ? 'homepage_rss' : 'direct_rss';
            out.ok = true;
            if (homepageFailed) {
                out.notice = `homepage unreachable (${homepageErr}); using RSS feed at ${winner.url}`;
            }
            logger.info(`scanCompetitor: "${competitor.name}" RSS hit at ${winner.url} (${out.recent_items.length} recent items, ${elapsed()}ms total)`);
            return out;
        }
    } else {
        logger.warn(`scanCompetitor: "${competitor.name}" exceeded budget before RSS, skipping`);
    }

    // Last resort: Google News RSS. Works even when the competitor's own
    // infrastructure blocks us, and is free + no API key required.
    if (elapsed() < PER_COMPETITOR_BUDGET_MS) {
        logger.info(`scanCompetitor: "${competitor.name}" — trying Google News fallback`);
        const news = await tryGoogleNews(competitor.name, competitor.website, since);
        if (news && (news.recent_items.length || news.all_items.length)) {
            out.feed_url = news.feed_url;
            out.all_items = news.all_items;
            out.recent_items = news.recent_items;
            out.source = 'google_news';
            out.ok = true;
            out.notice = homepageFailed
                ? `homepage + RSS unreachable (${homepageErr || 'no feed'}); using Google News mentions instead`
                : `no RSS feed exposed; using Google News mentions instead`;
            logger.info(`scanCompetitor: "${competitor.name}" Google News hit (${out.recent_items.length} recent items, ${elapsed()}ms total)`);
            return out;
        }
    }

    // Nothing worked.
    if (homepageFailed) {
        out.error = `homepage fetch failed: ${homepageErr}; no RSS or Google News fallback succeeded`;
    } else {
        out.ok = true;
        out.notice = 'no feed exposed and no recent news mentions found';
    }
    logger.info(`scanCompetitor: "${competitor.name}" — done (${elapsed()}ms, ok=${out.ok}, source=${out.source})`);
    return out;
}

// Run all competitor scans in parallel, each one with a hard wall-clock
// timeout. Total scan time ≈ PER_COMPETITOR_BUDGET_MS regardless of N.
export async function scanAll(competitors, opts) {
    return Promise.all(competitors.map(async (c) => {
        const result = await withHardTimeout(
            scanCompetitor(c, opts),
            PER_COMPETITOR_BUDGET_MS,
            `scanCompetitor("${c.name}")`,
        );
        if (result?.__timed_out) {
            logger.warn(`scanCompetitor "${c.name}" hit hard timeout at ${PER_COMPETITOR_BUDGET_MS / 1000}s`);
            return { name: c.name, website: c.website, ok: false, error: `scan exceeded ${PER_COMPETITOR_BUDGET_MS / 1000}s budget` };
        }
        if (result?.__error) {
            logger.warn(`scanCompetitor "${c.name}" failed: ${result.__error}`);
            return { name: c.name, website: c.website, ok: false, error: result.__error };
        }
        return result;
    }));
}
