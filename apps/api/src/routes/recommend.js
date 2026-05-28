import { Router } from 'express';
import logger from '../utils/logger.js';
import { ensureCache, search, cacheSize } from '../embeddings/cache.js';

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL    = 'text-embedding-3-small';

const STOPWORDS = new Set([
    'help','with','team','for','the','and','that','this','can','you','want',
    'need','make','build','create','using','use','get','have','from','what',
    'how','who','will','our','your','their','about','into','some','more',
    'like','just','also','than','then','when','where','which','please','want',
]);

async function embedQuery(text) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`);
    const data = await res.json();
    return data.data[0].embedding;
}

// Tech is only force-included when the best Tech candidate is semantically
// relevant. With text-embedding-3-small, scores around 0.25–0.27 are loose
// surface matches (e.g. shared "Monitor" token); above ~0.30 the match is
// actually adjacent to the query (Python Analyzer for cricket-analytics
// queries lands at ~0.35, while Linux Monitor for telemedicine lands at ~0.26).
const TECH_MIN_SCORE = 0.30;

function pickTeam(scored, size = 5) {
    // One per category, in order of score, until we hit `size`.
    const seenCats = new Set();
    const team = [];
    for (const s of scored) {
        if (!seenCats.has(s.category)) {
            seenCats.add(s.category);
            team.push(s);
        }
        if (team.length === size) break;
    }

    // If Tech isn't already in the team, try to add the best-scoring Tech
    // candidate from the wider results — but only if it clears the relevance
    // floor. We'd rather return 4 strong picks than pad with an irrelevant one.
    const hasTech = team.some(s => s.category === 'Tech');
    if (!hasTech) {
        const bestTech = scored.find(s => s.category === 'Tech');
        if (bestTech && (bestTech._score ?? 0) >= TECH_MIN_SCORE) {
            if (team.length >= size) team[team.length - 1] = bestTech;
            else team.push(bestTech);
        }
    }

    return team.slice(0, size);
}

router.post('/recommend', async (req, res) => {
    const { query } = req.body || {};
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
    }

    // Clean query for embedding — remove stopwords for a tighter semantic signal
    const cleaned = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w))
        .join(' ') || query;

    try {
        if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

        await ensureCache();

        if (cacheSize() === 0) {
            logger.warn('Embedding cache empty, returning empty team');
            return res.json({ skills: [] });
        }

        const vector    = await embedQuery(cleaned);
        const topSkills = search(vector, 500);
        let team        = pickTeam(topSkills);

        const techPick = team.find(s => s.category === 'Tech');
        logger.info(`recommend: "${query}" → ${team.length} skills, top score ${team[0]?._score?.toFixed(3) || 'n/a'}, tech score ${techPick?._score?.toFixed(3) || 'omitted'}`);

        // Strip the _score before sending to the client — internal detail
        res.json({ skills: team.slice(0, 5).map(({ _score, ...s }) => s) });
    } catch (err) {
        logger.error('recommend error:', err.message);
        res.status(500).json({ error: 'recommendation failed', skills: [] });
    }
});

export default router;
