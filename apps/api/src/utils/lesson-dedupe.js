// Near-duplicate detection for self-learning lessons. Pure — no PocketBase,
// no providers — so the portfolio test suite can import it directly.
//
// Prompt-level "don't repeat known lessons" is advisory at best — models
// rephrase. This is the hard guard: token-set Jaccard against the agent's
// existing lessons, so "never use discount messaging" can't come back as
// "avoid discount-led campaigns" run after run.

const STOP = new Set([
    'the', 'a', 'an', 'for', 'to', 'in', 'of', 'and', 'or', 'this', 'that',
    'is', 'are', 'be', 'always', 'never', 'any', 'all', 'with', 'on', 'at',
    'client', 'clients', 'future', 'campaigns', 'campaign', 'ensure',
    'ensuring', 'remember', 'avoid', 'use', 'prioritize',
]);

function tokens(s) {
    return new Set(String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 2 && !STOP.has(w)));
}

// Two measures, either one trips:
// - Jaccard (inter/union) for same-length rephrasings.
// - Overlap coefficient (inter/smaller-set) for the short-vs-long case, where
//   a terse rephrase is a subset of a wordier known lesson — "use Mondays
//   exclusively for evergreen content" vs "use Mondays only for evergreen
//   content; avoid promotions…". Jaccard scores that 0.33 and lets it through.
export function isNearDuplicate(lesson, existingLessons, { jaccard = 0.5, overlap = 0.7 } = {}) {
    const a = tokens(lesson);
    // Degenerate input (empty / all stop-words) fails closed: treated as a
    // duplicate so it is never proposed.
    if (a.size === 0) return true;
    for (const other of existingLessons) {
        const b = tokens(other);
        if (b.size === 0) continue;
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        if (inter / (a.size + b.size - inter) >= jaccard) return true;
        if (inter / Math.min(a.size, b.size) >= overlap) return true;
    }
    return false;
}
