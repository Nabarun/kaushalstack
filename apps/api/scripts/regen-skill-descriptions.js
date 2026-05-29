// One-off: regenerate dense markdown skill descriptions modeled on the
// TikTok Virality Scorer spec. Run via:
//   docker exec kaushalstack-api-1 node scripts/regen-skill-descriptions.js [--dry] [--limit=N] [--ids=a,b,c]
//
// Flags:
//   --dry         print results, do not write
//   --limit=N     stop after N skills (default: all)
//   --ids=a,b,c   only process specific skill ids
//   --concurrency=K  parallel OpenAI requests (default 5)
//   --skip-edited only process skills with version == 1 (default true)
//
// Tracks progress in /tmp/regen-skill.progress so the run is resumable.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PB_URL          = 'http://pocketbase:8090';
const PB_EMAIL        = 'admin@kaushalstack.com';
const PB_PWD          = 'Kaushal_Prod_2025!';
const OPENAI_KEY      = process.env.OPENAI_API_KEY;
const MODEL           = 'gpt-4o-mini';
const PROGRESS_FILE   = '/tmp/regen-skill.progress';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^-+/, '').split('=');
  return [k, v ?? true];
}));
const DRY         = !!args.dry;
const LIMIT       = args.limit ? parseInt(args.limit, 10) : Infinity;
const ONLY_IDS    = args.ids ? new Set(String(args.ids).split(',')) : null;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 5;
const SKIP_EDITED = args['skip-edited'] !== 'false';

if (!OPENAI_KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1); }

// ── Reference: the TikTok Virality Scorer description ───────────────────────
const REFERENCE_MARKDOWN = fs.readFileSync(
    path.join(import.meta.dirname, 'reference-tiktok.md'),
    'utf8',
);

function buildPrompt(skill) {
    return `You are rewriting a short skill stub into a dense, expert-quality skill specification in Markdown, modeled on the included REFERENCE example.

# REFERENCE example (TikTok Virality Scorer)
---
${REFERENCE_MARKDOWN}
---

# Source skill to rewrite
- name:        ${skill.name}
- agent_name:  ${skill.agent_name}
- category:    ${skill.category}
- difficulty:  ${skill.difficulty_level || 'Intermediate'}
- tech tags:   ${skill.associated_tech_skills || 'general'}
- current short description:
${(skill.description || '').slice(0, 600)}

# Instructions
Produce a single Markdown document that mirrors the REFERENCE's structure and voice but is fully specific to THIS skill's domain and verb (e.g., a "Monitor" skill needs a monitoring loop, an "Analyzer" needs an analysis framework, a "Mapper" needs a mapping rubric, an "Optimizer" needs an optimization workflow — adapt the section titles to fit).

Required sections in this order:
1. YAML frontmatter with name (kebab-case slug derived from skill name), a one-paragraph "Use this skill when…" description listing concrete trigger phrases / situations, and license: Proprietary. LICENSE.txt has complete terms
2. # H1 heading (the skill name) followed by a one-sentence positioning subtitle
3. ## Quick Reference — 3-row table of common task → guide pointer
4. ## Inputs to Gather — bullet list of bold-labelled inputs the skill needs from the user, with "Score with what's available; don't block on missing data — flag assumptions instead." energy
5. ## [Method section] — the core rubric / framework / workflow specific to this skill's verb. Use a weighted scoring table for Scorers/Auditors, a measurement framework for Monitors, an analysis rubric for Analysts, a mapping rubric for Mappers, an optimization checklist for Optimizers, etc. Make the weights / steps / metrics real and domain-correct.
6. ### Output format — numbered list, 3–5 items, of what every response should contain
7. ## Workflow notes — 1–2 short cross-reference paragraphs (you can invent file names like diagnosis.md, plan.md to suggest deeper guides)
8. ## Principles — three subsections: "Before [verbing]", "For each [thing]", "Avoid (Common Mistakes)" — each a bullet list of blunt, specific do/don'ts
9. ## QA (Required) — verification loop with subsections: "[Verb] QA" checks, "Calibration check", "Verification Loop" numbered steps. End with: "Do not deliver [output] until …"
10. ## Notes — 1–3 caveats about scope, freshness, or limits

Voice and quality rules:
- Blunt and specific. "Don't pad the score." "Specificity over politeness." No generic praise.
- Domain vocabulary. Use the right terms for ${skill.category} — not generic placeholders.
- Concrete examples whenever you'd otherwise be vague. "Cut the 4s intro," not "improve pacing."
- Length target: 5,500–7,500 characters. Do not pad to hit the floor.
- Output ONLY the Markdown document, no surrounding prose, no code fences, no preface.`;
}

async function generateDescription(skill) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0.5,
            messages: [{ role: 'user', content: buildPrompt(skill) }],
        }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return {
        text: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
    };
}

async function generateEmbedding(skill, newDescription) {
    // Embed using name + new description so the vector reflects the rewritten content.
    const input = `${skill.name}\n${skill.agent_name || ''}\n${skill.category || ''}\n${newDescription}`.slice(0, 8000);
    const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input }),
    });
    if (!r.ok) throw new Error(`openai embed ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return {
        vector: data.data?.[0]?.embedding || null,
        usage: data.usage,
    };
}

// ── PocketBase helpers ──────────────────────────────────────────────────────

async function pbAuth() {
    const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PWD }),
    });
    return (await r.json()).token;
}

async function listSkills(token, filter) {
    const out = [];
    let page = 1;
    while (true) {
        const url = `${PB_URL}/api/collections/skills/records?perPage=200&page=${page}&fields=id,name,agent_name,category,difficulty_level,associated_tech_skills,description,version` + (filter ? `&filter=${encodeURIComponent(filter)}` : '');
        const r = await fetch(url, { headers: { Authorization: token } }).then(r => r.json());
        if (!r.items?.length) break;
        out.push(...r.items);
        if (r.items.length < 200) break;
        page++;
    }
    return out;
}

async function updateSkill(token, id, body) {
    const r = await fetch(`${PB_URL}/api/collections/skills/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`pb patch ${r.status}: ${await r.text()}`);
}

// ── Progress tracking ───────────────────────────────────────────────────────

function loadProgress() {
    try {
        return new Set(fs.readFileSync(PROGRESS_FILE, 'utf8').trim().split('\n').filter(Boolean));
    } catch { return new Set(); }
}

function recordProgress(id) {
    fs.appendFileSync(PROGRESS_FILE, id + '\n');
}

// ── Runner with bounded concurrency ─────────────────────────────────────────

async function pool(items, worker, concurrency) {
    let i = 0;
    const inflight = new Array(concurrency).fill(null).map(async () => {
        while (i < items.length) {
            const idx = i++;
            try { await worker(items[idx], idx); }
            catch (err) { console.error(`[${items[idx]?.id}] worker error:`, err.message); }
        }
    });
    await Promise.all(inflight);
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
    const token = await pbAuth();

    let filter = '';
    if (SKIP_EDITED) filter = '(version = 1 || version = null || version = 0)';
    let skills = await listSkills(token, filter);
    if (ONLY_IDS) skills = skills.filter(s => ONLY_IDS.has(s.id));

    const done = loadProgress();
    skills = skills.filter(s => !done.has(s.id));
    if (LIMIT < Infinity) skills = skills.slice(0, LIMIT);

    console.log(`processing ${skills.length} skills (concurrency ${CONCURRENCY}, model ${MODEL}, dry=${DRY})`);

    let processed = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let embedTokens = 0;
    let failures = 0;
    const t0 = Date.now();

    await pool(skills, async (s) => {
        try {
            const { text, usage } = await generateDescription(s);
            inputTokens  += usage?.prompt_tokens     || 0;
            outputTokens += usage?.completion_tokens || 0;

            if (DRY) {
                console.log('\n\n████ SAMPLE:', s.name, '|', s.category, '████\n');
                console.log(text);
                console.log('\n──── end sample (chars:', text.length, ') ────');
                processed++;
                return;
            }

            // 1. Persist new description
            await updateSkill(token, s.id, { description: text });

            // 2. Re-embed against the rewritten description so the recommend
            //    engine matches on the new content. Failure here is non-fatal —
            //    the cache will just keep the stale vector until next run.
            try {
                const { vector, usage: eu } = await generateEmbedding(s, text);
                embedTokens += eu?.prompt_tokens || eu?.total_tokens || 0;
                if (vector) await updateSkill(token, s.id, { embedding: vector });
            } catch (err) {
                console.error(`[${s.id}] embed failed:`, err.message);
            }

            recordProgress(s.id);
            processed++;
        } catch (err) {
            failures++;
            console.error(`[${s.id}] ${s.name}: ${err.message}`);
        }

        if (processed > 0 && (processed % 25 === 0 || DRY)) {
            const elapsed = (Date.now() - t0) / 1000;
            const rate    = processed / elapsed;
            const eta     = Math.round((skills.length - processed) / Math.max(rate, 0.001));
            const cost    = inputTokens * 0.15e-6 + outputTokens * 0.6e-6 + embedTokens * 0.02e-6;
            console.log(`[${processed}/${skills.length}] ${rate.toFixed(2)}/s · cost $${cost.toFixed(3)} · failures ${failures} · eta ${eta}s`);
        }
    }, CONCURRENCY);

    const elapsed = (Date.now() - t0) / 1000;
    const cost    = inputTokens * 0.15e-6 + outputTokens * 0.6e-6 + embedTokens * 0.02e-6;
    console.log(`\nDONE · processed ${processed} · failures ${failures} · ${elapsed.toFixed(1)}s · tokens chat in/out ${inputTokens}/${outputTokens} · embed ${embedTokens} · est cost $${cost.toFixed(3)}`);
})();
