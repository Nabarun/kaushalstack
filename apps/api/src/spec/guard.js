// Deterministic quality gate for generated specs.
//
// Everything the LLM is bad at guaranteeing gets enforced here in code:
//   - Date + Author lines are stamped programmatically (models guess dates
//     from training data — that's how "2023" leaked into a 2026 spec).
//   - Required sections are checked per template.
//   - LOSSLESS MERGE: when a spec was combined from an uploaded draft, every
//     meaningful item in the draft must survive into the output. Items the
//     model dropped are surfaced for a repair pass; anything still missing
//     after repair gets appended verbatim so the combine is loss-free by
//     construction, not by hope.
//   - Numbers in the output that appear in neither the draft nor the round
//     table transcript are reported as unsourced so the UI can badge them.

export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// ── Metadata stamping ────────────────────────────────────────────────────────

export function stampMetadata(text, authors) {
    let out = String(text || '');
    const date = todayISO();

    if (/^Date:.*$/m.test(out)) {
        out = out.replace(/^Date:.*$/m, `Date: ${date}`);
    } else if (/^Status:.*$/m.test(out)) {
        out = out.replace(/^Status:.*$/m, (m) => `${m}\nDate: ${date}`);
    } else {
        out = `Date: ${date}\n\n${out}`;
    }

    if (Array.isArray(authors) && authors.length > 0) {
        const line = `Author: ${authors.join(', ')}`;
        if (/^Author:.*$/m.test(out)) out = out.replace(/^Author:.*$/m, line);
        else out = out.replace(/^Date:.*$/m, (m) => `${line}\n${m}`);
    }
    return out;
}

// ── Section completeness ─────────────────────────────────────────────────────

export const SOFTWARE_SECTIONS = [
    '## Problem', '## Goals', '## Non-goals', '## Requirements',
    '## Proposed approach', '## Failure modes', '## Success criteria',
    '## Open questions', '## Rollout',
];
export const MARKETING_SECTIONS = [
    '## Campaign brief', '## Assets', '## Distribution',
    '## Success criteria', '## Open questions',
];

export function missingSections(text, phase) {
    const required = phase === 'marketing' ? MARKETING_SECTIONS : SOFTWARE_SECTIONS;
    return required.filter((h) => !String(text || '').includes(h));
}

// ── Lossless coverage (combine mode) ─────────────────────────────────────────

const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with',
    'is', 'are', 'be', 'as', 'that', 'this', 'it', 'by', 'at', 'from',
    'we', 'our', 'must', 'should', 'will', 'can', 'not', 'now',
]);

export function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[`*_#>~]/g, ' ')
        .replace(/[^a-z0-9%.\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(s) {
    return new Set(normalize(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t)));
}

// Meaningful atoms of a draft spec: bullets, numbered items, MoSCoW lines,
// table body rows. Headings and free prose reorganize legitimately during a
// merge, so they aren't treated as loss when reworded — items are.
export function extractUnits(draft) {
    const units = [];
    for (const raw of String(draft || '').split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (/^([-*+]|\d+[.)])\s+/.test(line)) {
            units.push(line.replace(/^([-*+]|\d+[.)])\s+/, ''));
        } else if (/^\|.+\|$/.test(line) && !/^\|[\s:|-]+\|$/.test(line)) {
            units.push(line);
        } else if (/\*\*\s*(must|should|won'?t|goal)/i.test(line)) {
            units.push(line);
        }
    }
    return [...new Set(units.map((u) => u.trim()))].filter((u) => tokenSet(u).size >= 3);
}

function bestLineRecall(unitTokens, specLines) {
    let best = 0;
    for (const lineTokens of specLines) {
        if (lineTokens.size === 0) continue;
        let hit = 0;
        for (const t of unitTokens) if (lineTokens.has(t)) hit++;
        const recall = hit / unitTokens.size;
        if (recall > best) best = recall;
        if (best === 1) break;
    }
    return best;
}

export function coverageReport(draft, specText) {
    const units = extractUnits(draft);
    if (units.length === 0) return { total: 0, missing: [], ratio: 1 };

    const specNorm = normalize(specText);
    const specLines = String(specText || '')
        .split(/\n|(?<=[.!?])\s+/)
        .map(tokenSet)
        .filter((s) => s.size > 0);

    const missing = [];
    for (const unit of units) {
        const u = normalize(unit);
        if (specNorm.includes(u)) continue;                 // verbatim (normalized)
        const ut = tokenSet(unit);
        if (ut.size === 0) continue;
        if (bestLineRecall(ut, specLines) >= 0.6) continue; // faithful rewording
        // fall back: tokens present across the whole doc (split across lines)
        let hit = 0;
        for (const t of ut) if (specNorm.includes(t)) hit++;
        if (hit / ut.size >= 0.85) continue;
        missing.push(unit);
    }
    return { total: units.length, missing, ratio: (units.length - missing.length) / units.length };
}

// Guaranteed-lossless floor: whatever the model still dropped after the
// repair pass rides along verbatim. Ugly beats lossy.
export function appendCarryover(specText, missing) {
    if (!missing || missing.length === 0) return specText;
    const block = [
        '',
        '## Appendix — carried over from the draft',
        '',
        'These items from the uploaded draft were preserved verbatim to guarantee a loss-free merge. Fold them into the sections above when editing.',
        '',
        ...missing.map((m) => `- ${m}`),
    ].join('\n');
    return String(specText).trimEnd() + '\n' + block + '\n';
}

// ── Number provenance ────────────────────────────────────────────────────────

export function extractNumbers(text) {
    return [...new Set(String(text || '').match(/\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?/g) || [])]
        .map((n) => n.trim());
}

// Numbers in the spec that appear in none of the source texts and carry no
// [assumption]/[benchmark: …] tag nearby. Reported, not auto-edited — the UI
// (or a critic pass) decides what to do with them.
export function unsourcedNumbers(specText, sources) {
    const src = (sources || []).map(normalize).join(' ');
    const date = todayISO();
    const dateParts = new Set([date, date.slice(0, 4), date.slice(5, 7), date.slice(8, 10)]);
    const spec = String(specText || '');

    return extractNumbers(spec).filter((n) => {
        const bare = n.replace(/\s/g, '').replace('%', '');
        if (dateParts.has(bare) || dateParts.has(n)) return false;
        if (/^\d{4}$/.test(bare) && Number(bare) >= 1990 && Number(bare) <= 2100) return false; // years
        if (src.includes(normalize(n)) || src.includes(bare)) return false;
        const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tagged = new RegExp(`${esc}[^\\n]{0,60}\\[(assumption|benchmark|given)`, 'i');
        return !tagged.test(spec);
    });
}
