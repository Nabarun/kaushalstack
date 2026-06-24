import logger from '../utils/logger.js';

// Pragmatic scanner: fetch competitor homepage + try common RSS endpoints.
// Returns recent items (title + link + pubDate) from the last ~24h where the
// feed exposes timestamps. Social platforms (X/IG/LinkedIn) are intentionally
// out of scope — they need paid API access or anti-bot bypassing.

const USER_AGENT = 'Mozilla/5.0 (compatible; KaushalStackGrowthBot/1.0; +https://kaushalstack.com)';
const FETCH_TIMEOUT_MS = 15000;
const RSS_CANDIDATE_PATHS = ['/rss', '/feed', '/feed/', '/rss.xml', '/atom.xml', '/blog/rss', '/blog/feed', '/news/rss'];

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

export async function scanCompetitor(competitor, { since = Date.now() - 24 * 60 * 60 * 1000 } = {}) {
    const out = {
        name: competitor.name,
        website: competitor.website,
        ok: false,
        homepage: null,
        feed_url: null,
        recent_items: [],
        all_items: [],
        error: null,
    };
    let homepageHtml = '';
    try {
        const res = await timedFetch(competitor.website);
        if (!res.ok) throw new Error(`status ${res.status}`);
        homepageHtml = await res.text();
        out.homepage = summarizeHomepage(homepageHtml);
        out.ok = true;
    } catch (err) {
        out.error = `homepage fetch failed: ${err.message}`;
        return out;
    }

    const linked = extractRssLinks(homepageHtml, competitor.website);
    const candidates = [...new Set([
        ...linked,
        ...RSS_CANDIDATE_PATHS.map(p => toUrl(p, competitor.website)).filter(Boolean),
    ])];

    for (const url of candidates) {
        const items = await tryRssAt(url);
        if (items && items.length) {
            out.feed_url = url;
            out.all_items = items.slice(0, 30);
            out.recent_items = items.filter(it => isRecent(it.published, since)).slice(0, 20);
            break;
        }
    }

    return out;
}

export async function scanAll(competitors, opts) {
    const results = [];
    for (const c of competitors) {
        try {
            const r = await scanCompetitor(c, opts);
            results.push(r);
        } catch (err) {
            logger.warn(`scanCompetitor failed for ${c.website}: ${err.message}`);
            results.push({ name: c.name, website: c.website, ok: false, error: err.message });
        }
    }
    return results;
}
