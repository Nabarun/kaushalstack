import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

const RSS_URL        = 'https://trends.google.com/trending/rss?geo=IN';
const FETCH_TIMEOUT  = 8000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Return the current date in IST as a YYYY-MM-DD string — used as the cache key
// so refresh happens at IST midnight (when Google Trends India also rolls over)
function istDateKey() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

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

let cache = { items: null, day: null, ts: 0 };

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

// Reject titles containing Indic, CJK, Thai, Arabic etc. scripts — keep Latin-script only
const NON_LATIN_RE = /[֐-׿؀-ۿऀ-෿฀-࿿က-႟぀-ヿ一-鿿가-힯]/;
function isEnglishTitle(s) {
    return !!s && !NON_LATIN_RE.test(s);
}

// LLM filter: drop NSFW + pure entertainment/celebrity trends, keep buildable topics
async function llmFilterRelevant(items) {
    if (!OPENAI_API_KEY || items.length === 0) return items;

    const numbered = items.map((it, i) => `${i + 1}. ${it.title}${it.context ? ` (context: ${it.context.slice(0, 100)})` : ''}`).join('\n');

    const prompt = `These are trending Google searches in India right now:

${numbered}

Return JSON {"keep": [1-based indices]} for items that meet ALL of:
1. NOT sexually suggestive, explicit, or NSFW in any way
2. NOT a pure song / movie title / album / celebrity-gossip item
3. Could plausibly inspire a tech / product / data project (sports analytics, fintech, weather, public services, government policy, science, agriculture, healthcare, education, business, geopolitics, etc. are all fair game)

Be lenient — keep anything with even modest tech relevance. Only drop pure entertainment and inappropriate content. Respond with ONLY valid JSON, no prose.`;

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);

        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        clearTimeout(t);

        if (!r.ok) throw new Error(`openai ${r.status}`);
        const data   = await r.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        const keep   = new Set(Array.isArray(parsed.keep) ? parsed.keep : []);
        if (keep.size === 0) return items; // model refused; don't drop everything

        const kept = items.filter((_, i) => keep.has(i + 1));
        logger.info(`trending-india llm filter: kept ${kept.length}/${items.length}`);
        return kept;
    } catch (err) {
        logger.warn('trending-india llm filter failed, keeping unfiltered:', err.message);
        return items;
    }
}

router.get('/trending-india', async (req, res) => {
    const today = istDateKey();
    if (cache.items && cache.day === today) {
        return res.json({
            topics: cache.items, source: 'cache',
            cachedAt: new Date(cache.ts).toISOString(),
            day: cache.day,
        });
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

        const englishItems = items.filter(it => isEnglishTitle(it.title));
        const safeItems    = await llmFilterRelevant(englishItems.slice(0, 20));

        let topics = safeItems.slice(0, 10).map(it => ({
            label: it.title,
            prompt: makePrompt(it.title, it.context),
            traffic: it.traffic,
        }));

        // Pad with curated fallback if we got fewer than 6 English trends
        if (topics.length < 6) {
            const seen = new Set(topics.map(t => t.label.toLowerCase()));
            for (const fb of FALLBACK_TOPICS) {
                if (topics.length >= 8) break;
                if (!seen.has(fb.label.toLowerCase())) topics.push(fb);
            }
        }

        cache = { items: topics, day: today, ts: Date.now() };
        logger.info(`trending-india: ${englishItems.length}/${items.length} English trends → ${topics.length} chips (day=${today})`);
        res.json({ topics, source: 'google-trends', day: today });
    } catch (err) {
        logger.warn('trending-india fetch failed:', err.message);
        res.json({ topics: FALLBACK_TOPICS, source: 'fallback' });
    }
});

export default router;
