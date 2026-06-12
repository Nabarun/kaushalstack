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
                fields: 'id,name,description,category,agent_name,associated_tech_skills,difficulty_level,likes_count,comments_count,phase,embedding',
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

// Force an immediate reload regardless of TTL. Used when a by-name lookup
// misses — the record may have been created since the last load.
export async function refreshCache() {
    await loadCache();
}

// Returns top-K skills sorted by descending cosine similarity.
// Each skill carries its `_score` so callers can apply relevance thresholds.
// If `phase` is provided, only skills in that phase are considered. Skills with
// an empty `phase` field are treated as 'ideation' to match the homepage
// default-bucket rule.
export function search(queryVector, topK = 50, phase = null) {
    const qv = new Float32Array(queryVector);
    const pool = phase
        ? cache.filter(e => {
            const p = e.skill.phase || 'ideation';
            return p === phase;
        })
        : cache;
    return pool
        .map(entry => ({ skill: entry.skill, score: cosine(qv, entry.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(e => ({ ...e.skill, _score: e.score }));
}

export function cacheSize() {
    return cache.length;
}

// Look up a single skill by id, bypassing the phase filter that search()
// applies. Used by recommend.js for cross-phase pins (e.g. Maya, who is
// formally phase=execution but should also appear in ideation teams for
// design-shaped queries).
export function getSkillById(id) {
    const entry = cache.find(e => e.skill.id === id);
    return entry ? entry.skill : null;
}

// Look up a single skill by agent_name (case-insensitive). Used by the
// consult_agent tool so one creative agent can ask another for guidance
// without knowing record ids.
export function getSkillByAgentName(agentName) {
    const n = String(agentName || '').trim().toLowerCase();
    if (!n) return null;
    const entry = cache.find(e => (e.skill.agent_name || '').trim().toLowerCase() === n);
    return entry ? entry.skill : null;
}

// Warm cache on startup (non-blocking)
setTimeout(() => loadCache(), 5000);
