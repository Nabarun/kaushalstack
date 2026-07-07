// Complexity-aware model router (Pattern A: pre-flight heuristics).
//
// Scores an incoming prompt on cheap, deterministic signals — length, code
// presence, reasoning keywords, question density — and maps the score to a
// tier (light / standard / heavy), then picks the model for that tier from
// the provider's ladder. No LLM call is made to route, so the router itself
// costs nothing and adds no latency.
//
// Policy notes:
//   - A user-pinned model (BYOK preferred_model) always wins: we still score
//     and report the tier for transparency, but the pinned model is used.
//   - Bounded, well-understood tasks (e.g. spec consolidation) should be
//     PINNED to a tier by their route, not scored — pass forceTier for that.
//   - The tier→model ladders only list models already priced in
//     partner/usage.js so cost metering stays accurate.

const TIER_LADDERS = {
    openai:    { light: 'gpt-4o-mini',       standard: 'gpt-4.1-mini',      heavy: 'gpt-4o' },
    anthropic: { light: 'claude-haiku-4-5',  standard: 'claude-sonnet-4-6', heavy: 'claude-opus-4-8' },
    google:    { light: 'gemini-2.0-flash',  standard: 'gemini-2.0-flash',  heavy: 'gemini-2.5-pro' },
    // Single-model provider today — every tier resolves to the same model.
    xai:       { light: 'grok-2-latest',     standard: 'grok-2-latest',     heavy: 'grok-2-latest' },
};

// Words that signal open-ended, multi-step reasoning — the queries that look
// short but need a bigger model ("design my pricing strategy"). The `g` flag
// matters: each DISTINCT reasoning dimension the prompt stacks (architecture
// + security + migration…) adds weight, because multi-dimensional prompts
// are exactly the ones a light model answers plausibly-but-wrong.
const HEAVY_SIGNALS = /\b(architect(ure)?|design|strateg(y|ies|ize)|trade-?offs?|debug|diagnose|optimi[sz]e|migrat(e|ion)|security|scal(e|ing|ability)|refactor|roadmap|prioriti[sz]e|forecast|negotiat|valuation|compliance|legal|regulat|risks?)\b/gi;

// Words that signal bounded transformation work — consolidate, reformat,
// extract. These are the "no-brainer light tier" tasks.
const LIGHT_SIGNALS = /\b(summari[sz]e|consolidate|list|extract|translate|reformat|rename|categori[sz]e|classify|shorten|tl;?dr|bullet)\b/i;

export function scoreComplexity(query, { priorTurnsCount = 0 } = {}) {
    const q = String(query || '');
    let score = 0;
    const reasons = [];

    if (q.length > 4000)      { score += 3; reasons.push('very long prompt'); }
    else if (q.length > 1200) { score += 2; reasons.push('long prompt'); }
    else if (q.length > 280)  { score += 1; reasons.push('medium-length prompt'); }
    else                      { reasons.push('short prompt'); }

    if (/```|\bstack trace\b|\bTypeError\b|\bException\b/i.test(q)) {
        score += 2; reasons.push('contains code');
    }

    const questions = (q.match(/\?/g) || []).length;
    if (questions >= 2) { score += 1; reasons.push('multiple questions'); }

    // Count DISTINCT heavy keywords (dedup so "design, design, design"
    // doesn't inflate): first one +2, each additional +1, capped at +4.
    const heavyHits = new Set((q.match(HEAVY_SIGNALS) || []).map(w => w.toLowerCase()));
    if (heavyHits.size > 0) {
        score += Math.min(4, 1 + heavyHits.size);
        reasons.push(heavyHits.size > 2 ? 'multi-dimensional reasoning' : 'open-ended reasoning');
    }
    if (LIGHT_SIGNALS.test(q)) { score -= 1; reasons.push('bounded transformation'); }

    // Deep multi-turn chats carry accumulated context worth a stronger model.
    if (priorTurnsCount >= 5) { score += 1; reasons.push('deep conversation'); }

    const tier = score <= 1 ? 'light' : score <= 4 ? 'standard' : 'heavy';
    return { tier, score, reasons };
}

// Resolve the model for a prompt. Returns everything the caller needs to
// call chatComplete AND to explain the decision to the user:
//   { tier, score, reason, model, provider, pinned }
export function routePrompt({ provider, query, priorTurnsCount = 0, pinnedModel = null, forceTier = null }) {
    const ladder = TIER_LADDERS[provider] || TIER_LADDERS.openai;
    const scored = forceTier
        ? { tier: forceTier, score: null, reasons: ['tier pinned by task type'] }
        : scoreComplexity(query, { priorTurnsCount });

    if (pinnedModel) {
        return {
            ...scored,
            reason: 'pinned to your preferred model',
            model: pinnedModel,
            provider,
            pinned: true,
        };
    }
    return {
        ...scored,
        reason: scored.reasons.slice(0, 2).join(', '),
        model: ladder[scored.tier],
        provider,
        pinned: false,
    };
}
