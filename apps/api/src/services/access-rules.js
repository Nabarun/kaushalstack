// Collection API-rule enforcement, applied at boot.
//
// Two invariants for the skills library, both enforced where clients cannot
// opt out — the collection's own API rules:
//
//   1. Guests see nothing: reading skills requires a signed-in user.
//   2. Private agents never leave the server this way: partner-scoped skills
//      (private = true) are excluded from list AND view for everyone. The
//      flows that legitimately need them (partner portals, business runners,
//      admin, the recommend embeddings cache) all use the superuser client,
//      which API rules don't apply to. The SPA's own `private != true`
//      filters remain as politeness, but the rule is the guarantee.
//
// Applied idempotently on every boot: if someone flips the rules back in the
// PocketBase UI, the next api restart re-locks them. The `private` field is
// also ensured to exist first — a rule referencing a missing field would
// break every query (bit us on a dev database that predated the field).

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const SKILLS_RULE = '@request.auth.id != "" && private != true';

export async function ensureSkillsAccessRules() {
    try {
        const col = await pb.collections.getOne('skills');

        const have = new Set((col.fields || []).map(f => f.name));
        if (!have.has('private')) {
            await pb.collections.update(col.id, {
                fields: [...col.fields, { type: 'bool', name: 'private' }],
            });
            logger.info('access-rules: added missing skills.private field');
        }

        if (col.listRule !== SKILLS_RULE || col.viewRule !== SKILLS_RULE) {
            await pb.collections.update(col.id, {
                listRule: SKILLS_RULE,
                viewRule: SKILLS_RULE,
            });
            logger.info(`access-rules: skills list/view locked to "${SKILLS_RULE}" (was list=${JSON.stringify(col.listRule)}, view=${JSON.stringify(col.viewRule)})`);
        }
    } catch (err) {
        logger.warn(`access-rules: could not update skills rules: ${err.message}`);
    }
}
