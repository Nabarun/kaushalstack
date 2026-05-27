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

function pickTeam(skills, size = 5) {
    const byCategory = {};
    for (const s of skills) {
        if (!byCategory[s.category]) byCategory[s.category] = s;
    }
    const diverse = Object.values(byCategory);
    const usedIds  = new Set(diverse.map(s => s.id));
    const extras   = skills.filter(s => !usedIds.has(s.id));
    return [...diverse, ...extras].slice(0, size);
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

        const vector  = await embedQuery(cleaned);
        const topSkills = search(vector, 50);
        const team    = pickTeam(topSkills);

        logger.info(`recommend: "${query}" → ${team.length} skills (cache: ${cacheSize()})`);
        res.json({ skills: team });
    } catch (err) {
        logger.error('recommend error:', err.message);
        res.status(500).json({ error: 'recommendation failed', skills: [] });
    }
});

export default router;
