/// <reference path="../pb_data/types.d.ts" />
// One-time backfill: usage_events recorded before partner_id attribution was
// added have partner_id="". For users who belong to exactly one partner we
// can safely attribute those events to that partner. Users with multiple
// partners are ambiguous — leave them untagged (they will not appear in any
// partner's usage dashboard, which is the correct safe default).
migrate((app) => {
    let tagged = 0, skipped = 0;
    try {
        const events = app.findRecordsByFilter('usage_events', 'partner_id = ""');
        for (const e of events) {
            const userId = e.get('user_id');
            if (!userId) { skipped++; continue; }
            let memberships;
            try {
                memberships = app.findRecordsByFilter('partner_members', `user_id = "${userId}"`);
            } catch { skipped++; continue; }
            if (memberships.length !== 1) { skipped++; continue; }
            e.set('partner_id', memberships[0].get('partner_id'));
            try { app.save(e); tagged++; } catch { skipped++; }
        }
    } catch (err) {
        console.log('backfill warning:', err.message);
    }
    console.log(`usage_events backfill: tagged=${tagged} skipped=${skipped}`);
}, (_app) => {
    // Intentionally irreversible — we cannot know which events were untagged before.
});
