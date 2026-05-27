import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let cache = [];        // [{ id, skill, vector: Float32Array }]
let lastLoaded = 0;
let loading = false;

function cosine(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot   += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

async function loadCache() {
    if (loading) return;
    loading = true;
    try {
        logger.info('Loading skill embeddings into cache...');
        const page_size = 200;
        let page = 1;
        const items = [];
        while (true) {
            const result = await pb.collection('skills').getList(page, page_size, {
                fields: 'id,name,description,category,agent_name,associated_tech_skills,difficulty_level,likes_count,comments_count,embedding',
            });
            for (const s of result.items) {
                if (Array.isArray(s.embedding) && s.embedding.length > 0) {
                    items.push({
                        id: s.id,
                        skill: { ...s, embedding: undefined },
                        vector: new Float32Array(s.embedding),
                    });
                }
            }
            if (result.items.length < page_size) break;
            page++;
        }
        cache = items;
        lastLoaded = Date.now();
        logger.info(`Cache loaded: ${cache.length} skills with embeddings`);
    } catch (err) {
        logger.error('Failed to load embedding cache:', err);
    } finally {
        loading = false;
    }
}

export async function ensureCache() {
    if (cache.length === 0 || Date.now() - lastLoaded > REFRESH_INTERVAL_MS) {
        await loadCache();
    }
}

export function search(queryVector, topK = 50) {
    const qv = new Float32Array(queryVector);
    return cache
        .map(entry => ({ skill: entry.skill, score: cosine(qv, entry.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(e => e.skill);
}

export function cacheSize() {
    return cache.length;
}

// Warm cache on startup (non-blocking)
setTimeout(() => loadCache(), 5000);
