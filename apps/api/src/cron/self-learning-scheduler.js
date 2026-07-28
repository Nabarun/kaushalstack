// Nightly self-learning: every partner with an active self-learning
// subscription gets a learning pass once a day, without anyone clicking
// anything — that's what makes the feature *self*-learning. The scheduler
// only ever PROPOSES lessons; approval (and therefore any change in agent
// behavior) stays with the admin.
//
// Same shape as growth-scheduler.js: cheap tick, in-memory once-per-UTC-day
// guard. A restart mid-day at worst repeats one pass, which the code-level
// duplicate suppression makes harmless.

import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { effectiveStatus } from '../routes/admin/marketplace.js';
import { FEATURE_ID, runLearningPass } from '../services/self-learning.js';

const TICK_MS = 30 * 60 * 1000; // every 30 minutes
const RUN_HOUR_UTC = 1;         // ~06:30 IST, before the working day
let started = false;
const lastRunDay = new Map();   // partner_id -> 'YYYY-MM-DD' (UTC)

function utcDay(d) {
    return d.toISOString().slice(0, 10);
}

async function tick() {
    try {
        const now = new Date();
        if (now.getUTCHours() !== RUN_HOUR_UTC) return;
        if (!process.env.OPENAI_API_KEY) return;

        const subs = await pb.collection('feature_subscriptions').getFullList({
            filter: `feature_id = "${FEATURE_ID}" && status = "active"`,
        }).catch(() => []);

        for (const sub of subs) {
            if (effectiveStatus(sub) !== 'active') continue; // paid_until lapsed
            if (lastRunDay.get(sub.partner_id) === utcDay(now)) continue;
            lastRunDay.set(sub.partner_id, utcDay(now));
            try {
                const partner = await pb.collection('partners').getOne(sub.partner_id);
                const r = await runLearningPass(partner, { addedBy: 'scheduler' });
                if (r.proposed > 0) {
                    logger.info(`self-learning-scheduler: ${partner.name} → ${r.proposed} new proposal(s)`);
                }
            } catch (err) {
                logger.warn(`self-learning-scheduler: partner ${sub.partner_id} failed: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error(`self-learning-scheduler tick failed: ${err.message}`);
    }
}

export function startSelfLearningScheduler() {
    if (started) return;
    started = true;
    logger.info(`self-learning-scheduler: started (daily at ${String(RUN_HOUR_UTC).padStart(2, '0')}:00 UTC for active subscriptions)`);
    setInterval(tick, TICK_MS);
}
