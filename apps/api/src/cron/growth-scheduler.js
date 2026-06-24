import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { ensureBusinessesCollection, ensureReportsCollection } from '../routes/admin/collections.js';
import { runGrowthReportForBusiness } from '../services/growth-report.js';

const TICK_MS = 15 * 60 * 1000; // every 15 minutes
let started = false;

function sameUtcDay(a, b) {
    return a.getUTCFullYear() === b.getUTCFullYear()
        && a.getUTCMonth() === b.getUTCMonth()
        && a.getUTCDate() === b.getUTCDate();
}

async function tick() {
    try {
        if (!(await ensureBusinessesCollection())) return;
        await ensureReportsCollection();
        const now = new Date();
        const currentHour = now.getUTCHours();

        const list = await pb.collection('businesses').getList(1, 200, {
            filter: `active = true && schedule_hour = ${currentHour}`,
        });

        for (const business of list.items) {
            const last = business.last_run_at ? new Date(business.last_run_at) : null;
            if (last && sameUtcDay(last, now)) continue;
            logger.info(`growth-scheduler: running business=${business.name} (${business.id})`);
            try {
                await runGrowthReportForBusiness(business);
                await pb.collection('businesses').update(business.id, { last_run_at: now.toISOString() });
            } catch (err) {
                logger.error(`growth-scheduler: business ${business.id} failed: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error(`growth-scheduler tick failed: ${err.message}`);
    }
}

export function startGrowthScheduler() {
    if (started) return;
    started = true;
    logger.info('growth-scheduler: started (tick every 15m, daily per business at schedule_hour UTC)');
    setTimeout(tick, 30 * 1000); // initial run after warmup
    setInterval(tick, TICK_MS);
}
