import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

// Private competitor-watcher skills live in the same `skills` collection as
// public agents, but with `private = true` and a `business_id` that scopes
// them to a single business. They never surface in /skills, the embeddings
// cache, the recommend route, or the team-picker endpoints. They exist so
// the growth report has a per-competitor "agent" identity to reference.

const EXTENSION_FIELDS = [
    { type: 'bool', name: 'private' },
    { type: 'text', name: 'business_id',         max: 60 },
    { type: 'text', name: 'owner_id',            max: 60 },
    { type: 'text', name: 'competitor_website',  max: 500 },
];

let extensionsReady = false;

export async function ensureSkillsExtensions() {
    if (extensionsReady) return true;
    try {
        const existing = await pb.collections.getOne('skills');
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = EXTENSION_FIELDS.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            await pb.collections.update('skills', {
                fields: [...(existing.fields || []), ...missing],
            });
            logger.info(`skills extended with fields [${missing.map(f => f.name).join(', ')}]`);
        }
        extensionsReady = true;
        return true;
    } catch (err) {
        logger.warn(`ensureSkillsExtensions failed: ${err.message}`);
        return false;
    }
}

function watcherFromCompetitor(c, business) {
    const name = `${c.name} Watcher`.slice(0, 200);
    const description = c.focus
        ? `Monitors ${c.name} (${c.website}) for ${business.name}. Focus: ${c.focus}`
        : `Monitors ${c.name} (${c.website}) for ${business.name} — surfaces what changed in the last 24 hours.`;
    return {
        name,
        agent_name: name,
        description: description.slice(0, 4000),
        category: 'Market Research',
        associated_tech_skills: '',
        created_by: business.owner_id || '',
        private: true,
        business_id: business.id,
        owner_id: business.owner_id || '',
        competitor_website: c.website,
    };
}

export async function syncCompetitorSkills(business) {
    if (!business?.id) return [];
    if (!(await ensureSkillsExtensions())) return [];
    const competitors = Array.isArray(business.competitors) ? business.competitors : [];

    let existing = [];
    try {
        existing = await pb.collection('skills').getFullList({
            filter: `business_id = "${business.id}" && private = true`,
            batch: 100,
        });
    } catch (err) {
        logger.warn(`syncCompetitorSkills: fetch existing failed: ${err.message}`);
    }
    const byWebsite = new Map(
        existing.map(s => [String(s.competitor_website || '').trim().toLowerCase(), s])
    );

    const wantedKeys = new Set();
    const team = [];

    for (const c of competitors) {
        const key = String(c?.website || '').trim().toLowerCase();
        if (!key || !c?.name) continue;
        wantedKeys.add(key);
        const data = watcherFromCompetitor(c, business);
        const found = byWebsite.get(key);
        if (found) {
            try {
                const upd = await pb.collection('skills').update(found.id, data);
                team.push(upd);
            } catch (err) {
                logger.warn(`syncCompetitorSkills: update ${found.id} failed: ${err.message}`);
                team.push(found);
            }
        } else {
            try {
                const created = await pb.collection('skills').create(data);
                team.push(created);
            } catch (err) {
                logger.warn(`syncCompetitorSkills: create for "${c.name}" failed: ${err.message}`);
            }
        }
    }

    for (const s of existing) {
        const k = String(s.competitor_website || '').trim().toLowerCase();
        if (!wantedKeys.has(k)) {
            try { await pb.collection('skills').delete(s.id); }
            catch (err) { logger.warn(`syncCompetitorSkills: delete ${s.id} failed: ${err.message}`); }
        }
    }

    logger.info(`syncCompetitorSkills: business=${business.name} synced ${team.length} watcher(s)`);
    return team;
}

export async function listCompetitorTeam(businessId) {
    if (!businessId) return [];
    if (!(await ensureSkillsExtensions())) return [];
    try {
        return await pb.collection('skills').getFullList({
            filter: `business_id = "${businessId}" && private = true`,
            batch: 100,
        });
    } catch {
        return [];
    }
}
