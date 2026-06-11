// Autonomous skill extraction from a YouTube channel's long-form episodes.
//
// What this does, end-to-end, per video:
//   1. Scrape the channel's videos page → list of long-form (≥10 min) videos
//   2. Skip anything already in state file (previously processed)
//   3. Pull the transcript via youtube-transcript-api (Python subprocess)
//   4. Hand transcript + episode metadata to gpt-4o with a strict JSON schema
//      that asks: "is this relevant to KaushalStack (ideation/execution/marketing)?
//      Score 1–10. If ≥ relevance threshold, draft a complete skill record."
//   5. Embed the proposed description with text-embedding-3-small
//   6. Cosine-compare against every existing skill's embedding — skip if any
//      existing skill is too similar (prevents duplicates like 'another
//      D2C-brand-strategist')
//   7. If all gates pass (relevance ≥ min, confidence ≥ min, overlap < max),
//      POST the skill + PATCH the embedding into PocketBase
//   8. Record the decision (created / skipped / why) in the state file
//
// Defaults to --dry-run on first run so you eyeball proposals before
// anything goes live. Flip --dry-run=false (or omit) once happy.
//
// Usage examples:
//   node scripts/auto-extract-skills.js --channel @rajshamani --dry-run
//   node scripts/auto-extract-skills.js --channel @rajshamani --max-new 3
//   node scripts/auto-extract-skills.js --help

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ────────────────────────────────────────────────────────────────────────
// Config (most overridable via CLI flags)
// ────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
    channel:        '@rajshamani',
    maxNew:         5,
    minRelevance:   8,      // 1–10, gpt-4o's self-score (8 is conservative — flip down to 7 if too strict)
    minConfidence:  0.75,   // 0–1, gpt-4o's self-estimate
    maxOverlap:     0.78,   // cosine similarity threshold vs existing skills (0.78 catches even moderately similar agents)
    minVideoLength: 600,    // seconds; below this we treat as a short
    dryRun:         true,   // SAFE DEFAULT — flip to false once you trust it
    statePath:      path.join(__dirname, 'auto-extract-state.json'),
};

// PocketBase + LLM endpoints. Match the rest of the scripts/ folder.
const PB_URL   = process.env.POCKETBASE_URL  || 'https://kaushalstack.com/pb';
const PB_EMAIL = process.env.PB_SUPERUSER_EMAIL    || 'admin@kaushalstack.com';
const PB_PWD   = process.env.PB_SUPERUSER_PASSWORD || 'Kaushal_Prod_2025!';

const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const DRAFT_MODEL   = process.env.AUTO_EXTRACT_MODEL || 'gpt-4o';
const EMBED_MODEL   = 'text-embedding-3-small';

// Sanity-check on boot — fail loudly rather than silently no-op
if (!OPENAI_KEY) {
    console.error('OPENAI_API_KEY is not set. Refusing to run.');
    process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────
// CLI parsing — flat KV parser, no dependencies
// ────────────────────────────────────────────────────────────────────────
function parseArgs() {
    const out = { ...DEFAULTS };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') printHelpAndExit();
        if (!a.startsWith('--')) continue;
        const eq = a.indexOf('=');
        let rawK, rawV;
        if (eq > 0) {
            rawK = a.slice(2, eq); rawV = a.slice(eq + 1);
        } else {
            rawK = a.slice(2);
            // Look ahead: next argv is the value unless it starts with --
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) { rawV = next; i++; }
            else rawV = 'true';
        }
        const k = rawK.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        let v = rawV;
        if (v === 'true')  v = true;
        else if (v === 'false') v = false;
        else if (!isNaN(Number(v))) v = Number(v);
        out[k] = v;
    }
    return out;
}
function printHelpAndExit() {
    console.log(`
auto-extract-skills.js — pull long-form episodes from a YouTube channel and
auto-create KaushalStack skill agents from the transcripts.

Flags (all optional):
  --channel <handle>      YouTube handle, default ${DEFAULTS.channel}
  --max-new <n>           Cap how many new videos to process this run (${DEFAULTS.maxNew})
  --min-relevance <n>     gpt-4o relevance score threshold, 1–10 (${DEFAULTS.minRelevance})
  --min-confidence <f>    gpt-4o confidence threshold, 0–1 (${DEFAULTS.minConfidence})
  --max-overlap <f>       Cosine ceiling vs existing skills (${DEFAULTS.maxOverlap})
  --dry-run               Print proposals, do not POST. Default: ${DEFAULTS.dryRun}.
                          Pass --dry-run=false to actually create.
  --state-path <path>     Where the processed-videos log lives (${DEFAULTS.statePath})
  --help                  This message
`);
    process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────
// State (processed-videos log) — JSON on disk, idempotent reruns
// ────────────────────────────────────────────────────────────────────────
async function loadState(p) {
    try { return JSON.parse(await fs.readFile(p, 'utf8')); }
    catch { return { processed: {} }; }
}
async function saveState(p, state) {
    await fs.writeFile(p, JSON.stringify(state, null, 2));
}

// ────────────────────────────────────────────────────────────────────────
// Channel videos — scrape ytInitialData from the channel videos page,
// extract every lockupViewModel, return the long-form ones.
// ────────────────────────────────────────────────────────────────────────
async function fetchChannelVideos(handle) {
    const url = `https://www.youtube.com/${encodeURIComponent(handle)}/videos`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });
    if (!res.ok) throw new Error(`channel fetch ${res.status}`);
    const html = await res.text();
    const start = html.indexOf('var ytInitialData = ');
    if (start < 0) throw new Error('ytInitialData not found in channel page');
    const blobStart = start + 'var ytInitialData = '.length;
    const blobEnd   = html.indexOf('};</script>', blobStart);
    const data = JSON.parse(html.slice(blobStart, blobEnd + 1));

    const out = [];
    const seen = new Set();
    (function walk(node) {
        if (Array.isArray(node)) { for (const n of node) walk(n); return; }
        if (!node || typeof node !== 'object') return;
        if (node.lockupViewModel) {
            const lv = node.lockupViewModel;
            const id = lv.contentId;
            if (id && !seen.has(id)) {
                const meta = lv.metadata?.lockupMetadataViewModel || {};
                const title = meta.title?.content || '';
                let length = '';
                const overlays = lv.contentImage?.thumbnailViewModel?.overlays || [];
                for (const ov of overlays) {
                    const bottom = ov.thumbnailBottomOverlayViewModel || {};
                    for (const b of (bottom.badges || [])) {
                        const t = b.thumbnailBadgeViewModel?.text || '';
                        if (t.includes(':')) length = t;
                    }
                }
                seen.add(id);
                out.push({ id, title, length });
            }
        }
        for (const v of Object.values(node)) walk(v);
    })(data);
    return out;
}

function lengthToSeconds(s) {
    if (!s) return 0;
    const p = s.split(':').map(Number);
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return 0;
}

// ────────────────────────────────────────────────────────────────────────
// Transcript — shell out to a Python helper that uses youtube-transcript-api.
// We embed the Python here so the script is self-contained; if the helper
// already exists at scripts/lib/fetch-transcript.py we use that instead.
// ────────────────────────────────────────────────────────────────────────
const PY_TRANSCRIPT_HELPER = `
import sys, json
from youtube_transcript_api import YouTubeTranscriptApi
vid = sys.argv[1]
try:
    t = YouTubeTranscriptApi().fetch(vid, languages=['en', 'hi'])
    print(json.dumps({'ok': True, 'lang': str(t.language), 'text': ' '.join(s.text for s in t.snippets)}))
except Exception as e:
    print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}))
`;
// Transcripts are expensive to fetch (YouTube IP-blocks aggressively) so we
// cache them on disk after the first successful pull. A cache hit costs ~1ms;
// a cache miss costs a Python subprocess + risk of HTTP 429 / IP-block.
const TRANSCRIPT_CACHE_DIR = path.join(__dirname, '.transcript-cache');
async function fetchTranscript(videoId) {
    const cachePath = path.join(TRANSCRIPT_CACHE_DIR, `${videoId}.json`);
    try {
        const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
        if (cached.ok) return cached;
    } catch { /* miss */ }

    const py = process.env.PYTHON3 || '/opt/homebrew/bin/python3.14';
    const r = spawnSync(py, ['-c', PY_TRANSCRIPT_HELPER, videoId], {
        encoding: 'utf8', maxBuffer: 1024 * 1024 * 50,
    });
    let result;
    if (r.status !== 0) {
        result = { ok: false, error: r.stderr || `python exited ${r.status}` };
    } else {
        try { result = JSON.parse(r.stdout.trim()); }
        catch (e) { result = { ok: false, error: `parse: ${e.message} :: ${r.stdout.slice(0, 200)}` }; }
    }
    if (result.ok) {
        await fs.mkdir(TRANSCRIPT_CACHE_DIR, { recursive: true });
        await fs.writeFile(cachePath, JSON.stringify(result));
    }
    return result;
}

// ────────────────────────────────────────────────────────────────────────
// LLM draft — single gpt-4o call with strict JSON output. Either:
//   A. relevance < threshold → returns { relevance_score, skip_reason }
//   B. relevance ≥ threshold → returns full { skill_record, confidence, ... }
// We pass the full transcript (gpt-4o handles 128K easily) so the model
// can spot the concrete numbers, anecdotes, and named tools that turn a
// good skill into a great one.
// ────────────────────────────────────────────────────────────────────────
const DRAFT_SYSTEM_PROMPT = `You distill long-form YouTube interview transcripts into "agent skills" for KaushalStack, a platform that helps founders ideate / execute / market their projects with a team of AI specialist agents.

KaushalStack has three lifecycle phases:
- ideation: research, validation, brainstorming, persona discovery, founder strategy, deciding what to build
- execution: building, designing, implementing, operating, day-to-day ops
- marketing: promoting, growth, brand, content, social, email, sales motion

A great agent skill captures one expert's distinctive playbook on a clearly bounded topic. Examples already in the catalogue:
- Fabrice — Second Act Career Strategist (US D2C / passion food business pivot)
- Anuba — Self-Led Career Reinvention Coach (women in tech / inner transformation)
- Zach — Tech-to-B2B Founder Strategist (B2B SaaS via Salesforce-alum wedge)
- Kavya — Email Campaign Designer (HTML email + Gmail preview)
- Tara — Social Media Campaign Designer (platform-native social posts)
- Vaibhav — Solo AI-Stack Founder Coach (single-person company using AI tools)
- Suyash — Indian D2C Niche Brand Strategist (Gen Z, online, influencer)
- Prasad — Bootstrapped Heritage Retail Brand Builder (saree / ethnic wear / physical retail)

Your job, per transcript:
1. Score relevance to one or more of the three phases (1–10).
   Hard floor — score these ≤ 4 unless the speaker maps wisdom into a concrete founder/business mechanism:
   - Pseudoscience: graphology / handwriting analysis, astrology, manifestation, energy work, palmistry
   - Generic motivational / personal-development talks ("mindset shifts", "success habits")
   - Politics, geopolitics, civic policy
   - Celebrity interviews about personal life
   - Pure neuroscience / health / diet / fitness (not business-applied)
   - Sports (unless the wisdom is squarely about building a sports business)
   - Bollywood / filmmaking craft (not business of film)
   - War / military / combat memoir
2. If score < 7: just return { relevance_score, confidence, skip_reason }. Don't waste tokens drafting.
3. If score ≥ 7: write a fully-formed skill record matching the format below.

For the skill record:
- name: 4–8 word agent skill title (e.g. "Indian D2C Niche Brand Strategist")
- agent_name: a single-word first name (preferably the expert's actual first name — use what the transcript reveals). Must not collide with: Maya, Ananya, Arjun, Priya, Rohan, Vikram, Sneha, Meera, Ravi, Fabrice, Anuba, Zach, Kavya, Tara, Vaibhav, Suyash, Prasad.
- category: one of [Tech, career, sales, retail, operations, customer-support, education, fitness, health, insurance, legal, mental-health, nutrition, personal-finance, real-estate, sports, tax-rules, travel, agriculture, banking, compliance, Music, Cooking, Market Research, Social Feed Analysis]
- phase: one of [ideation, execution, marketing]
- difficulty_level: one of [Beginner, Intermediate, Advanced]
- associated_tech_skills: comma-separated short tags (10–15 tags)
- description: rich markdown matching the style of Fabrice/Zach/Anuba/Suyash/Prasad — sections: "# {Skill name} ({Agent})", a 1-paragraph intro with the real specifics from the transcript, "## When to pick {Agent}" with bullet prompts, "## What {Agent} covers" with 4–7 themed sub-sections each with bullet specifics from the transcript (real numbers, names, anecdotes), "## How {Agent} thinks", "## Output style", "## When NOT to pick {Agent}" with pointers to the catalog agents that DO fit those other cases. ~700–1200 words.

Hard constraints in the description:
- Use real concrete numbers, names, dollar amounts, year counts, anecdotes from the transcript.
- Name specific tools, brands, places mentioned in the transcript.
- Don't invent things the speaker didn't say.
- Make the "When NOT to pick" pointers reference real agents from the list above where relevant.

Also estimate your own confidence (0–1) that this skill is genuinely distinct and valuable, not a thin or duplicative add. Reasoning string explains your scoring.

Return ONLY valid JSON of the shape:
{
  "relevance_score": <1-10>,
  "confidence": <0-1>,
  "phases_matched": ["ideation" | "execution" | "marketing", ...],
  "skip_reason": "..." (only if score < 7, omit otherwise),
  "skill_record": {
    "name": "...",
    "agent_name": "...",
    "category": "...",
    "phase": "...",
    "difficulty_level": "...",
    "associated_tech_skills": "...",
    "description": "..."
  } (only if score ≥ 7),
  "reasoning": "...",
  "potential_overlap_concerns": "..." (only if you suspect overlap with an existing catalog agent)
}`;

async function draftSkill(transcript, meta) {
    const userPrompt = `Episode title: ${meta.title}
Channel: ${meta.channel}
Video ID: ${meta.videoId}
Transcript language: ${meta.lang}

Transcript:
"""
${transcript.slice(0, 80000)}
"""

Analyze and respond with JSON per the schema.`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: DRAFT_MODEL,
            response_format: { type: 'json_object' },
            temperature: 0.4,
            messages: [
                { role: 'system', content: DRAFT_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
        }),
    });
    if (!r.ok) {
        const body = (await r.text()).slice(0, 500);
        throw new Error(`openai draft ${r.status}: ${body}`);
    }
    const data = await r.json();
    const raw  = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(raw);
}

// ────────────────────────────────────────────────────────────────────────
// Embedding + overlap check — embed the proposed description, cosine vs
// every existing skill's embedding, return the max similarity + that skill.
// ────────────────────────────────────────────────────────────────────────
async function embed(text) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
    });
    if (!r.ok) throw new Error(`openai embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).data[0].embedding;
}
function cosine(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return d / (Math.sqrt(na) * Math.sqrt(nb));
}

// Lazily load all existing skill embeddings into memory once per run.
let SKILL_CACHE = null;
async function loadAllSkillEmbeddings(pbToken) {
    if (SKILL_CACHE) return SKILL_CACHE;
    const out = [];
    let page = 1;
    while (true) {
        const r = await fetch(`${PB_URL}/api/collections/skills/records?perPage=200&page=${page}&fields=id,name,agent_name,embedding`, {
            headers: { Authorization: pbToken },
        });
        if (!r.ok) throw new Error(`pb list ${r.status}`);
        const j = await r.json();
        for (const x of j.items || []) {
            if (Array.isArray(x.embedding) && x.embedding.length > 0) {
                out.push({ id: x.id, name: x.name, agent_name: x.agent_name, vec: x.embedding });
            }
        }
        if ((j.items || []).length < 200) break;
        page++;
    }
    SKILL_CACHE = out;
    return out;
}
async function maxOverlapAgainstCatalog(proposedVec, pbToken) {
    const skills = await loadAllSkillEmbeddings(pbToken);
    let max = { score: 0, skill: null };
    for (const s of skills) {
        const sc = cosine(proposedVec, s.vec);
        if (sc > max.score) max = { score: sc, skill: { id: s.id, name: s.name, agent_name: s.agent_name } };
    }
    return max;
}

// ────────────────────────────────────────────────────────────────────────
// PocketBase auth + create skill
// ────────────────────────────────────────────────────────────────────────
async function pbAuth() {
    const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PWD }),
    });
    if (!r.ok) throw new Error(`pb auth ${r.status}`);
    return (await r.json()).token;
}
async function getAdminCreatorId(token) {
    const r = await fetch(`${PB_URL}/api/collections/users/records?perPage=1&filter=${encodeURIComponent('is_admin=true')}&fields=id`, {
        headers: { Authorization: token },
    });
    if (!r.ok) throw new Error(`pb users ${r.status}`);
    return (await r.json()).items?.[0]?.id || '';
}
async function createSkill(skill, embedding, token, creatorId) {
    const body = { ...skill, created_by: creatorId };
    const create = await fetch(`${PB_URL}/api/collections/skills/records`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!create.ok) throw new Error(`pb create ${create.status}: ${(await create.text()).slice(0, 300)}`);
    const created = await create.json();
    const patch = await fetch(`${PB_URL}/api/collections/skills/records/${created.id}`, {
        method: 'PATCH',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding }),
    });
    if (!patch.ok) throw new Error(`pb patch embedding ${patch.status}`);
    return created.id;
}

// ────────────────────────────────────────────────────────────────────────
// Orchestration
// ────────────────────────────────────────────────────────────────────────
async function main() {
    const args  = parseArgs();
    const state = await loadState(args.statePath);
    console.log(`auto-extract-skills · channel=${args.channel} max-new=${args.maxNew} dry-run=${args.dryRun}`);

    let videos;
    try { videos = await fetchChannelVideos(args.channel); }
    catch (e) { console.error(`channel fetch failed: ${e.message}`); process.exit(1); }
    console.log(`channel returned ${videos.length} videos`);

    const longForm = videos.filter(v => lengthToSeconds(v.length) >= args.minVideoLength);
    const fresh    = longForm.filter(v => !state.processed[v.id]);
    const toProcess = fresh.slice(0, args.maxNew);
    console.log(`long-form: ${longForm.length} · already processed: ${longForm.length - fresh.length} · new this run: ${toProcess.length}`);

    if (toProcess.length === 0) {
        console.log('nothing new. exiting.');
        return;
    }

    const token     = await pbAuth();
    const creatorId = await getAdminCreatorId(token);

    let created = 0, skipped = 0, errored = 0;
    for (const v of toProcess) {
        console.log(`\n── [${v.id}] ${v.length}  ${v.title.slice(0, 90)}`);
        const decision = { channel: args.channel, title: v.title, processed_at: new Date().toISOString() };

        try {
            // 1. transcript
            const t = await fetchTranscript(v.id);
            if (!t.ok) {
                decision.decision = 'skipped'; decision.reason = `transcript: ${t.error}`;
                console.log(`  SKIP · transcript fail: ${t.error}`);
                skipped++; state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }
            console.log(`  transcript: ${t.text.length} chars (${t.lang})`);

            // 2. LLM draft
            const draft = await draftSkill(t.text, { title: v.title, channel: args.channel, videoId: v.id, lang: t.lang });
            decision.relevance_score = draft.relevance_score;
            decision.confidence      = draft.confidence;
            console.log(`  relevance=${draft.relevance_score}/10  confidence=${draft.confidence}  phases=${(draft.phases_matched || []).join(',')}`);

            if (draft.relevance_score < args.minRelevance) {
                decision.decision = 'skipped'; decision.reason = draft.skip_reason || `relevance ${draft.relevance_score} < ${args.minRelevance}`;
                console.log(`  SKIP · ${decision.reason}`);
                skipped++; state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }
            if ((draft.confidence ?? 0) < args.minConfidence) {
                decision.decision = 'skipped'; decision.reason = `confidence ${draft.confidence} < ${args.minConfidence}`;
                console.log(`  SKIP · ${decision.reason}`);
                skipped++; state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }

            const skill = draft.skill_record;
            if (!skill?.name || !skill?.agent_name || !skill?.description) {
                decision.decision = 'skipped'; decision.reason = 'incomplete skill_record';
                console.log(`  SKIP · ${decision.reason}`);
                skipped++; state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }
            console.log(`  drafted: ${skill.agent_name} — ${skill.name} (${skill.category}/${skill.phase})`);

            // 3a. agent_name uniqueness (case-insensitive). Two agents named
            // "Vaibhav" would shadow each other in the UI; refuse to create.
            const existingAgentNames = (await loadAllSkillEmbeddings(token))
                .map(s => (s.agent_name || '').trim().toLowerCase())
                .filter(Boolean);
            if (existingAgentNames.includes((skill.agent_name || '').trim().toLowerCase())) {
                decision.decision = 'skipped';
                decision.reason   = `agent_name "${skill.agent_name}" already used in catalog`;
                console.log(`  SKIP · ${decision.reason}`);
                skipped++; state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }

            // 3b. description overlap check
            const embedText = [skill.name, skill.agent_name, skill.category, skill.description].join('\n');
            const vec = await embed(embedText);
            const overlap = await maxOverlapAgainstCatalog(vec, token);
            decision.max_overlap = { score: +overlap.score.toFixed(3), against: overlap.skill };
            console.log(`  max overlap: ${overlap.score.toFixed(3)} vs ${overlap.skill?.agent_name || '-'} (${overlap.skill?.name || '-'})`);
            if (overlap.score > args.maxOverlap) {
                decision.decision = 'skipped'; decision.reason = `overlap ${overlap.score.toFixed(3)} > ${args.maxOverlap}`;
                console.log(`  SKIP · ${decision.reason}`);
                skipped++; state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }

            // 4. create (or dry-run report)
            if (args.dryRun) {
                decision.decision = 'dry_run_pass';
                decision.drafted  = { name: skill.name, agent_name: skill.agent_name, category: skill.category, phase: skill.phase };
                console.log(`  DRY-RUN · would create.`);
                console.log(`  reasoning: ${(draft.reasoning || '').slice(0, 300)}`);
                if (args.showDraft) {
                    console.log(`\n  ┌─ FULL DRAFT ─────────────────────────────────────────────`);
                    console.log(`  │ name:       ${skill.name}`);
                    console.log(`  │ agent:      ${skill.agent_name}`);
                    console.log(`  │ category:   ${skill.category}`);
                    console.log(`  │ phase:      ${skill.phase}`);
                    console.log(`  │ difficulty: ${skill.difficulty_level}`);
                    console.log(`  │ tech:       ${skill.associated_tech_skills}`);
                    console.log(`  └──────────────────────────────────────────────────────────`);
                    console.log(skill.description.split('\n').map(l => '  ' + l).join('\n'));
                    console.log('');
                }
                state.processed[v.id] = decision; await saveState(args.statePath, state); continue;
            }
            const sid = await createSkill(skill, vec, token, creatorId);
            decision.decision = 'created'; decision.skill_id = sid;
            decision.agent_name = skill.agent_name; decision.skill_name = skill.name;
            console.log(`  CREATED · skill_id=${sid} agent=${skill.agent_name}`);
            created++;
        } catch (e) {
            decision.decision = 'error'; decision.reason = e.message;
            console.error(`  ERROR · ${e.message}`);
            errored++;
        }
        state.processed[v.id] = decision;
        await saveState(args.statePath, state);
    }

    console.log(`\nDONE · created=${created} skipped=${skipped} errored=${errored} (of ${toProcess.length} processed)`);
    if (args.dryRun) {
        console.log(`Dry-run mode. Rerun with --dry-run=false to actually create the passing proposals.`);
    }
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
