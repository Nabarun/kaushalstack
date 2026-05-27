import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_SECRET   = process.env.EMBED_SECRET;
const EMBED_MODEL    = 'text-embedding-3-small';

function skillText(s) {
    return `${s.name || ''} ${s.category || ''} ${s.associated_tech_skills || ''} ${s.description || ''}`.slice(0, 2000);
}

async function embedBatch(texts) {
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

export default router;
