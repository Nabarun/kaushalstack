// Collection API-rule enforcement, applied at boot.
//
// The SPA reads the skills library straight from PocketBase through the /pb
// proxy, so hiding skills from guests can't be a UI decision — it has to be
// the collection's own list/view rules. `@request.auth.id != ""` means any
// signed-in user; the server's superuser client is unaffected, so leaderboard,
// recommend embeddings, admin and the MCP tools keep working.
//
// Applied idempotently on every boot: if someone flips the rules back to
// public in the PocketBase UI, the next api restart re-locks them.

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const SIGNED_IN = '@request.auth.id != ""';

export async function ensureSkillsAccessRules() {
    try {
        const col = await pb.collections.getOne('skills');
        if (col.listRule === SIGNED_IN && col.viewRule === SIGNED_IN) return;
        await pb.collections.update(col.id, {
            listRule: SIGNED_IN,
            viewRule: SIGNED_IN,
        });
        logger.info(`access-rules: skills list/view now require a signed-in user (was list=${JSON.stringify(col.listRule)}, view=${JSON.stringify(col.viewRule)})`);
    } catch (err) {
        logger.warn(`access-rules: could not update skills rules: ${err.message}`);
    }
}
