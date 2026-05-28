import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

const RSS_URL       = 'https://trends.google.com/trending/rss?geo=IN';
const CACHE_TTL_MS  = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT = 8000;

const FALLBACK_TOPICS = [
    { label: 'IPL 2025 Analytics',   prompt: 'A real-time cricket analytics and prediction platform for IPL 2025' },
    { label: 'ONDC Integration',     prompt: 'A seller onboarding tool to integrate small businesses with the ONDC network' },
    { label: 'UPI for Business',     prompt: 'A UPI-powered invoicing and payment reconciliation tool for small businesses' },
    { label: 'AI in AgriTech',       prompt: 'An AI-powered crop advisory app for Indian farmers using satellite and weather data' },
    { label: 'EV Startup',           prompt: 'An EV fleet management and charging station locator app for India' },
    { label: 'Vernacular EdTech',    prompt: 'An adaptive learning platform for competitive exams like JEE and NEET in Hindi and regional languages' },
    { label: 'Digital Health',       prompt: 'An ABHA-linked digital health records app connecting patients and doctors across India' },
    { label: 'Startup India Tools',  prompt: 'A compliance and funding tracker for startups registered under Startup India' },
];

let cache = { items: null, ts: 0 };

function decodeEntities(s) {
    return (s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

function parseRSS(xml) {
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        // Title is the FIRST <title> in the item (avoid news_item_title)
        const titleMatch   = block.match(/<title>([\s\S]*?)<\/title>/);
        const trafficMatch = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
        const newsMatch    = block.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/);
        const title   = decodeEntities(titleMatch?.[1]?.trim());
        const traffic = decodeEntities(trafficMatch?.[1]?.trim() || '');
        const context = decodeEntities(newsMatch?.[1]?.trim() || '');
        if (title) items.push({ title, traffic, context });
    }
    return items;
}

function makePrompt(title, context) {
    if (context) {
        return `A real-time news and analytics platform tracking "${title}" — context: ${context.slice(0, 140)}`;
    }
    return `A real-time news and analytics platform tracking trends around "${title}" in India`;
}

router.get('/trending-india', async (req, res) => {
    if (cache.items && Date.now() - cache.ts < CACHE_TTL_MS) {
        return res.json({ topics: cache.items, source: 'cache', cachedAt: new Date(cache.ts).toISOString() });
    }

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

        const r = await fetch(RSS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
            signal: ctrl.signal,
        });
        clearTimeout(t);

        if (!r.ok) throw new Error(`feed ${r.status}`);
        const xml   = await r.text();
        const items = parseRSS(xml);

        if (items.length === 0) throw new Error('no items parsed');

        const topics = items.slice(0, 10).map(it => ({
            label: it.title,
            prompt: makePrompt(it.title, it.context),
            traffic: it.traffic,
        }));

        cache = { items: topics, ts: Date.now() };
        logger.info(`trending-india: refreshed ${topics.length} topics from Google Trends`);
        res.json({ topics, source: 'google-trends' });
    } catch (err) {
        logger.warn('trending-india fetch failed:', err.message);
        res.json({ topics: FALLBACK_TOPICS, source: 'fallback' });
    }
});

export default router;
