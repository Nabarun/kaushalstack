import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { recordUsage } from '../partner/usage.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_SECRET   = process.env.EMBED_SECRET;
const EMBED_MODEL    = 'text-embedding-3-small';

function skillText(s) {
    return `${s.name || ''} ${s.category || ''} ${s.associated_tech_skills || ''} ${s.description || ''}`.slice(0, 2000);
}

// `meter` attributes cost to the caller — the cron for skills, or the calling
// app's user id for the generic /embed endpoint below.
async function embedBatch(texts, meter = { agent: 'embed-cron', context: 'embeddings' }) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    recordUsage({
        provider: 'openai', model: EMBED_MODEL,
        usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: 0 },
        meter,
    });
    return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// POST /embed/run  — protected, used by OpenClaw cron
router.post('/embed/run', async (req, res) => {
    const auth = req.headers.authorization || '';
    if (EMBED_SECRET && auth !== `Bearer ${EMBED_SECRET}`) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    res.json({ started: true });  // respond immediately, run async

    (async () => {
        logger.info('Embed run triggered');
        let page = 1;
        const PAGE = 200;
        let ok = 0, fail = 0;

        while (true) {
            const result = await pb.collection('skills').getList(page, PAGE, {
                fields: 'id,name,category,associated_tech_skills,description,embedding',
                filter: 'private != true',
            });

            const unembed = result.items.filter(s => !Array.isArray(s.embedding) || s.embedding.length === 0);
            if (unembed.length === 0) { if (result.items.length < PAGE) break; page++; continue; }

            const BATCH = 100;
            for (let i = 0; i < unembed.length; i += BATCH) {
                const batch = unembed.slice(i, i + BATCH);
                try {
                    const vectors = await embedBatch(batch.map(skillText));
                    for (let j = 0; j < batch.length; j++) {
                        await pb.collection('skills').update(batch[j].id, { embedding: vectors[j] });
                        ok++;
                    }
                } catch (err) {
                    fail += batch.length;
                    logger.error('Embed batch failed:', err.message);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            if (result.items.length < PAGE) break;
            page++;
        }
        logger.info(`Embed run done: ${ok} embedded, ${fail} failed`);
    })();
});

// POST /embed — the shared embedding SERVICE for platform apps (e.g. Relay).
//
// Stateless: it turns text into vectors and stores NOTHING, so no calling app's
// data ever rests here — the strongest form of tenancy isolation, because the
// service can't leak what it never keeps. Each app owns its own (tenant-scoped)
// vector store and runs its own search; this endpoint is only the shared model
// access + one cost ledger.
//
// Auth is per-caller via a `ksk_` PAT (or member JWT); usage is metered under
// the caller's id. Distinct from /embed/run, which embeds the skills catalogue.
const MAX_TEXTS = 128;
const MAX_LEN   = 8000;

router.post('/embed', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const texts = req.body?.texts;
    if (!Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ error: 'texts must be a non-empty array' });
    }
    if (texts.length > MAX_TEXTS) {
        return res.status(400).json({ error: `max ${MAX_TEXTS} texts per request` });
    }

    const clean = texts.map(t => String(t ?? '').slice(0, MAX_LEN));
    try {
        const vectors = await embedBatch(clean, { agent: userId, context: 'embed-api' });
        res.json({ model: EMBED_MODEL, dims: vectors[0]?.length ?? 0, vectors });
    } catch (err) {
        logger.error('embed endpoint failed:', err.message);
        res.status(502).json({ error: 'embedding provider error' });
    }
});

export default router;
