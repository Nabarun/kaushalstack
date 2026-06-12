// Topic-based skill extraction: search YouTube for a topic, pull the top N
// video transcripts, and synthesize ONE skill record from all of them.
//
// Unlike auto-extract-skills.js (one skill per channel episode), this script
// aggregates many tutorials on the SAME topic into a single playbook — used to
// give an existing agent a real skill (mode=update) or to mint a new
// specialist agent (mode=create).
//
// Pipeline:
//   1. yt-dlp ytsearch → top videos for the query (relevance order)
//   2. youtube-transcript-api per video (disk-cached, shared with
//      auto-extract-skills.js) — walk down the list until --max-videos
//      transcripts are gathered
//   3. One gpt-4o synthesis call over all transcripts → skill_record JSON
//   4. Synthesis saved to scripts/topic-extract-output/<agent>.json so the
//      same record can be applied to local AND prod without re-running the LLM
//      (--from-file)
//   5. Embed description, then PATCH (update) or POST (create) into PocketBase
//
// Usage:
//   node scripts/extract-topic-skills.js \
//     --search "how to create a website" --mode update \
//     --agent Ananya --skill-id 0v9syxxawznp95v --dry-run
//
//   node scripts/extract-topic-skills.js \
//     --search "deploy website to hostinger" --mode create \
//     --agent Hostinger --dry-run
//
//   node scripts/extract-topic-skills.js \
//     --from-file scripts/topic-extract-output/hostinger.json --mode create \
//     --agent Hostinger --pb-url http://localhost:8090 --dry-run=false

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEFAULTS = {
    search:         '',
    mode:           '',        // 'update' | 'create'
    agent:          '',        // agent_name the skill belongs to
    skillId:        '',        // required for mode=update
    maxVideos:      10,
    minVideoLength: 240,       // seconds — tutorials can be shorter than podcasts
    searchPool:     25,        // how many search hits to consider before giving up
    fetchDelay:     30,        // seconds between live transcript fetches (YouTube 429s aggressively)
    maxPasses:      8,         // retry passes over IP-blocked videos (cool-down between passes)
    coolDown:       180,       // seconds to wait between retry passes
    dryRun:         true,
    fromFile:       '',        // skip search/transcripts/LLM, apply a saved synthesis
    recordId:       '',        // mode=create: fixed 15-char PocketBase id (so code can pin it across envs)
    pbUrl:          process.env.POCKETBASE_URL_OVERRIDE || '',
};

const PB_EMAIL = process.env.PB_SUPERUSER_EMAIL    || 'admin@kaushalstack.com';
const PB_PWD   = process.env.PB_SUPERUSER_PASSWORD || 'Kaushal_Prod_2025!';

const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const DRAFT_MODEL = process.env.AUTO_EXTRACT_MODEL || 'gpt-4o';
const EMBED_MODEL = 'text-embedding-3-small';

const OUTPUT_DIR = path.join(__dirname, 'topic-extract-output');

// ────────────────────────────────────────────────────────────────────────
// CLI parsing — same flat KV parser as auto-extract-skills.js
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
        if (eq > 0) { rawK = a.slice(2, eq); rawV = a.slice(eq + 1); }
        else {
            rawK = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) { rawV = next; i++; }
            else rawV = 'true';
        }
        const k = rawK.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        let v = rawV;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        else if (!isNaN(Number(v)) && rawK !== 'skill-id') v = Number(v);
        out[k] = v;
    }
    return out;
}
function printHelpAndExit() {
    console.log(`
extract-topic-skills.js — synthesize one agent skill from the top YouTube
tutorials on a topic.

Flags:
  --search <query>        YouTube search query (required unless --from-file)
  --mode <update|create>  update an existing skill record, or create a new one
  --agent <name>          agent_name (e.g. Ananya, Hostinger). Required.
  --skill-id <id>         PocketBase skill id to PATCH (mode=update only)
  --max-videos <n>        transcripts to aggregate (${DEFAULTS.maxVideos})
  --min-video-length <s>  skip videos shorter than this (${DEFAULTS.minVideoLength}s)
  --pb-url <url>          PocketBase base URL (default https://kaushalstack.com/pb)
  --from-file <path>      apply a previously saved synthesis (skips YouTube + LLM)
  --dry-run               print, don't write. Default ${DEFAULTS.dryRun}. --dry-run=false to apply.
`);
    process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────
// YouTube search via yt-dlp (no API key, relevance-ordered)
// ────────────────────────────────────────────────────────────────────────
function searchYouTube(query, pool) {
    const r = spawnSync('yt-dlp', [
        '--flat-playlist',
        '--print', '%(id)s|%(duration)s|%(view_count)s|%(title)s',
        `ytsearch${pool}:${query}`,
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
    if (r.status !== 0) throw new Error(`yt-dlp search failed: ${(r.stderr || '').slice(0, 300)}`);
    return r.stdout.trim().split('\n').filter(Boolean).map(line => {
        const [id, duration, views, ...titleParts] = line.split('|');
        return {
            id,
            duration: Number(duration) || 0,
            views:    Number(views) || 0,
            title:    titleParts.join('|'),
        };
    });
}

// ────────────────────────────────────────────────────────────────────────
// Transcript — same python helper + cache dir as auto-extract-skills.js
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
// Per-agent platform context injected into the synthesis prompt so the
// generated description stays consistent with how the agent actually works
// on KaushalStack (tool-using builders, the Maya→Ananya→Hostinger pipeline).
// ────────────────────────────────────────────────────────────────────────
const AGENT_CONTEXT = {
    ananya: `Ananya is KaushalStack's tool-using Dev Engineer agent. She doesn't just advise — she BUILDS: given a request she writes real HTML/CSS/vanilla-JS files into a session workspace (static sites, landing pages, web apps, no build step, CDN-only libraries), pulls royalty-free photos via an image-search tool, and hands the user a downloadable, deploy-ready site.
She works in a pipeline with two teammates:
- Maya (UX Mockup Designer) designs mockups first; Ananya inherits Maya's design system (palette, typography, layout) as a hard brief and builds the production site from it.
- Hostinger (Deployment Specialist) is consulted by Ananya for hosting/deployment guidance; Ananya ships a DEPLOY.md with Hostinger-ready instructions alongside the site files.
The description must present Ananya as the hands-on website builder whose playbook is distilled from the tutorials, covering: planning a site, structure/semantics, responsive layout, styling systems, assets/media, performance basics, forms, SEO basics, and getting the site live. Mention the Maya handoff and the Hostinger deployment consult as part of "How Ananya works".
HARD CONSTRAINT: Ananya's hands-on builds are static HTML/CSS/vanilla-JS ONLY — she never delivers WordPress/Elementor/site-builder sites herself. Where tutorials teach WordPress or site builders, fold that in only as advisory knowledge she can explain when asked ("what Ananya can advise on"), clearly separated from what she builds. Never claim she delivers a WordPress site.`,
    hostinger: `Hostinger is KaushalStack's Deployment Specialist agent — the team's hosting expert, named after the platform they specialize in. When Ananya (Dev Engineer) finishes building a static website, she consults Hostinger for exact deployment guidance, and users can ask Hostinger directly about getting any site live.
The description must be a practical Hostinger deployment playbook distilled from the tutorials: choosing a Hostinger plan, claiming/connecting a domain, DNS and nameservers, hPanel navigation, uploading a static site (File Manager / FTP / Git), public_html structure, free SSL setup, WordPress vs static hosting paths, email setup if covered, common pitfalls (wrong directory, propagation delays, mixed-content after SSL), and how to verify a deployment went live. Use the real menu names, button labels, plan names, and prices the tutorials mention.`,
};

// ────────────────────────────────────────────────────────────────────────
// Synthesis — one gpt-4o call over all transcripts → skill_record JSON
// ────────────────────────────────────────────────────────────────────────
function buildSynthesisPrompt(mode, agent, existing) {
    const ctx = AGENT_CONTEXT[agent.toLowerCase()] || '';
    const recordTarget = mode === 'update'
        ? `You are UPDATING the existing skill record below. Keep agent_name="${existing.agent_name}", category="${existing.category}", phase="${existing.phase}". You may keep or improve the name. Rewrite the description and associated_tech_skills from the transcripts.\n\nExisting record:\n${JSON.stringify({ name: existing.name, agent_name: existing.agent_name, category: existing.category, phase: existing.phase, difficulty_level: existing.difficulty_level }, null, 2)}`
        : `You are CREATING a new skill record. agent_name must be exactly "${agent}". category must be "Tech". phase must be "execution".`;

    return `You distill YouTube tutorial transcripts into "agent skills" for KaushalStack, a platform where AI specialist agents help founders ideate, execute, and market projects.

${recordTarget}

AGENT CONTEXT (the description must be consistent with this — it describes how the agent actually operates on the platform):
${ctx}

You will receive ${'${N}'} tutorial transcripts on the same topic. Synthesize them into ONE authoritative playbook — not a summary of each video. Merge overlapping advice, keep the best concrete specifics (real tool names, menu labels, prices, step sequences, gotchas), and resolve contradictions by majority/most-recent practice.

Skill record format:
- name: 4–8 word skill title
- agent_name: single word as instructed above
- category / phase: as instructed above
- difficulty_level: one of [Beginner, Intermediate, Advanced]
- associated_tech_skills: 10–15 comma-separated short tags
- description: rich markdown, MINIMUM 800 words and up to 1200 (short outputs are rejected — be generous with concrete bullet specifics from the transcripts), sections:
  "# {Skill name} ({Agent})" — 1-paragraph intro with real specifics,
  "## When to pick {Agent}" — bullet example prompts,
  "## What {Agent} covers" — 5–7 themed sub-sections with bullet specifics drawn from the transcripts (real tools, steps, numbers),
  "## How {Agent} works" — the agent's process on KaushalStack (use the AGENT CONTEXT pipeline),
  "## Output style",
  "## When NOT to pick {Agent}".

Hard constraints:
- Only claim things the transcripts actually teach (plus the AGENT CONTEXT platform facts).
- Concrete over generic: name the actual tools, panels, settings, and steps.
- No invented prices or statistics.

Return ONLY valid JSON:
{
  "skill_record": {
    "name": "...",
    "agent_name": "...",
    "category": "...",
    "phase": "...",
    "difficulty_level": "...",
    "associated_tech_skills": "...",
    "description": "..."
  },
  "synthesis_notes": "what you merged, what you dropped, contradictions resolved"
}`;
}

async function synthesize(mode, agent, existing, transcripts) {
    const perVideoBudget = Math.floor(90000 / transcripts.length);
    const corpus = transcripts.map((t, i) =>
        `=== VIDEO ${i + 1}: "${t.title}" (https://www.youtube.com/watch?v=${t.id}) ===\n${t.text.slice(0, perVideoBudget)}`
    ).join('\n\n');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: DRAFT_MODEL,
            response_format: { type: 'json_object' },
            temperature: 0.4,
            messages: [
                { role: 'system', content: buildSynthesisPrompt(mode, agent, existing).replace('${N}', String(transcripts.length)) },
                { role: 'user', content: `Here are the ${transcripts.length} transcripts:\n\n${corpus}\n\nSynthesize and respond with JSON per the schema.` },
            ],
        }),
    });
    if (!r.ok) throw new Error(`openai synth ${r.status}: ${(await r.text()).slice(0, 500)}`);
    const data = await r.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

async function embed(text) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
    });
    if (!r.ok) throw new Error(`openai embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).data[0].embedding;
}

// ────────────────────────────────────────────────────────────────────────
// PocketBase
// ────────────────────────────────────────────────────────────────────────
async function pbAuth(pbUrl) {
    const r = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PWD }),
    });
    if (!r.ok) throw new Error(`pb auth ${r.status} at ${pbUrl}`);
    return (await r.json()).token;
}
async function getAdminCreatorId(pbUrl, token) {
    const r = await fetch(`${pbUrl}/api/collections/users/records?perPage=1&filter=${encodeURIComponent('is_admin=true')}&fields=id`, {
        headers: { Authorization: token },
    });
    if (r.ok) {
        const id = (await r.json()).items?.[0]?.id;
        if (id) return id;
    }
    // Fallback (e.g. local dev DB without an is_admin field): any user.
    const any = await fetch(`${pbUrl}/api/collections/users/records?perPage=1&fields=id`, {
        headers: { Authorization: token },
    });
    if (!any.ok) throw new Error(`pb users ${any.status}`);
    return (await any.json()).items?.[0]?.id || '';
}
async function getSkill(pbUrl, token, id) {
    const r = await fetch(`${pbUrl}/api/collections/skills/records/${id}`, { headers: { Authorization: token } });
    if (!r.ok) throw new Error(`pb get skill ${id}: ${r.status}`);
    return r.json();
}
async function findSkillByAgent(pbUrl, token, agentName) {
    const filter = encodeURIComponent(`agent_name='${agentName}'`);
    const r = await fetch(`${pbUrl}/api/collections/skills/records?perPage=5&filter=${filter}&fields=id,name,agent_name`, {
        headers: { Authorization: token },
    });
    if (!r.ok) throw new Error(`pb find ${r.status}`);
    return (await r.json()).items || [];
}

// ────────────────────────────────────────────────────────────────────────
// Orchestration
// ────────────────────────────────────────────────────────────────────────
async function main() {
    const args = parseArgs();
    if (!OPENAI_KEY && !args.fromFile) { console.error('OPENAI_API_KEY not set'); process.exit(1); }
    if (!args.mode || !['update', 'create'].includes(args.mode)) { console.error('--mode update|create required'); process.exit(1); }
    if (!args.agent) { console.error('--agent required'); process.exit(1); }
    if (args.mode === 'update' && !args.skillId) { console.error('--skill-id required for mode=update'); process.exit(1); }

    const pbUrl = args.pbUrl || process.env.POCKETBASE_URL || 'https://kaushalstack.com/pb';
    console.log(`extract-topic-skills · mode=${args.mode} agent=${args.agent} pb=${pbUrl} dry-run=${args.dryRun}`);

    const token = await pbAuth(pbUrl);
    const existing = args.mode === 'update' ? await getSkill(pbUrl, token, args.skillId) : null;

    let synthesis, sources;
    if (args.fromFile) {
        const saved = JSON.parse(await fs.readFile(args.fromFile, 'utf8'));
        synthesis = saved.synthesis;
        sources   = saved.sources;
        console.log(`loaded saved synthesis from ${args.fromFile} (${sources.length} source videos)`);
    } else {
        // 1. search
        const hits = searchYouTube(args.search, args.searchPool);
        console.log(`search "${args.search}" → ${hits.length} hits`);
        const candidates = hits.filter(v => v.duration >= args.minVideoLength);

        // 2. transcripts — walk relevance order until we have maxVideos.
        // YouTube rate-limits transcript fetches hard (IpBlocked / 429), so we
        // sleep between live fetches and make multiple passes over the
        // rate-limited videos with a cool-down in between. Permanent failures
        // (no transcript exists) are dropped after the first pass.
        const sleep = (s) => new Promise(r => setTimeout(r, s * 1000));
        const transcripts = [];
        let queue = candidates.slice();
        for (let pass = 1; pass <= args.maxPasses && transcripts.length < args.maxVideos && queue.length > 0; pass++) {
            if (pass > 1) {
                console.log(`  — pass ${pass}: ${queue.length} rate-limited videos remain, cooling down ${args.coolDown}s…`);
                await sleep(args.coolDown);
            }
            const retry = [];
            for (const v of queue) {
                if (transcripts.length >= args.maxVideos) break;
                const cached = await fs.access(path.join(TRANSCRIPT_CACHE_DIR, `${v.id}.json`)).then(() => true).catch(() => false);
                const t = await fetchTranscript(v.id);
                if (t.ok) {
                    transcripts.push({ id: v.id, title: v.title, views: v.views, duration: v.duration, lang: t.lang, text: t.text });
                    console.log(`  ✓ ${v.id} ${Math.round(v.duration / 60)}min ${t.text.length} chars — ${v.title.slice(0, 70)}`);
                } else if (/IpBlocked|429|RequestBlocked/i.test(String(t.error))) {
                    console.log(`  ⏳ ${v.id} rate-limited, will retry — ${v.title.slice(0, 60)}`);
                    retry.push(v);
                } else {
                    console.log(`  ✗ ${v.id} skip permanently: ${String(t.error).slice(0, 80)} — ${v.title.slice(0, 60)}`);
                }
                if (!cached) await sleep(args.fetchDelay);
            }
            queue = retry;
        }
        if (transcripts.length < 3) { console.error(`only ${transcripts.length} transcripts — not enough to synthesize`); process.exit(1); }
        console.log(`aggregating ${transcripts.length} transcripts → ${DRAFT_MODEL}`);

        // 3. synthesize
        synthesis = await synthesize(args.mode, args.agent, existing, transcripts);
        sources = transcripts.map(t => ({ id: t.id, title: t.title, views: t.views, duration: t.duration }));

        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        const outPath = path.join(OUTPUT_DIR, `${args.agent.toLowerCase()}.json`);
        await fs.writeFile(outPath, JSON.stringify({ args: { search: args.search, mode: args.mode, agent: args.agent }, sources, synthesis }, null, 2));
        console.log(`synthesis saved → ${outPath}`);
    }

    const skill = synthesis.skill_record;
    if (!skill?.name || !skill?.description) { console.error('synthesis returned incomplete skill_record'); process.exit(1); }

    // Provenance: append a Sources section so the skill links back to the videos.
    if (!skill.description.includes('## Sources')) {
        const lines = sources.map(s => `- [${s.title}](https://www.youtube.com/watch?v=${s.id})`).join('\n');
        skill.description += `\n\n## Sources\n\nDistilled from ${sources.length} YouTube tutorials:\n${lines}`;
    }
    skill.video_url = `https://www.youtube.com/watch?v=${sources[0].id}`;

    console.log(`\n┌─ SKILL ─────────────────────────────────────`);
    console.log(`│ name:       ${skill.name}`);
    console.log(`│ agent:      ${skill.agent_name}`);
    console.log(`│ category:   ${skill.category} / ${skill.phase} / ${skill.difficulty_level}`);
    console.log(`│ tech:       ${skill.associated_tech_skills}`);
    console.log(`│ desc:       ${skill.description.length} chars`);
    console.log(`└─────────────────────────────────────────────`);
    console.log(`notes: ${synthesis.synthesis_notes || '-'}\n`);

    if (args.dryRun) {
        console.log(skill.description);
        console.log('\nDRY-RUN — nothing written. Rerun with --dry-run=false to apply.');
        return;
    }

    const vec = await embed([skill.name, skill.agent_name, skill.category, skill.description].join('\n'));

    if (args.mode === 'update') {
        const r = await fetch(`${pbUrl}/api/collections/skills/records/${args.skillId}`, {
            method: 'PATCH',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name:                   skill.name,
                description:            skill.description,
                associated_tech_skills: skill.associated_tech_skills,
                difficulty_level:       skill.difficulty_level,
                video_url:              skill.video_url,
                embedding:              vec,
            }),
        });
        if (!r.ok) throw new Error(`pb patch ${r.status}: ${(await r.text()).slice(0, 300)}`);
        console.log(`UPDATED skill ${args.skillId} (${skill.agent_name} — ${skill.name}) on ${pbUrl}`);
    } else {
        const dupes = await findSkillByAgent(pbUrl, token, skill.agent_name);
        if (dupes.length > 0) {
            console.error(`agent_name "${skill.agent_name}" already exists on ${pbUrl}: ${dupes.map(d => d.id).join(', ')} — refusing to create a duplicate.`);
            process.exit(1);
        }
        const creatorId = await getAdminCreatorId(pbUrl, token);
        const body = { ...skill, created_by: creatorId };
        if (args.recordId) body.id = args.recordId;
        const r = await fetch(`${pbUrl}/api/collections/skills/records`, {
            method: 'POST',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`pb create ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const created = await r.json();
        const p = await fetch(`${pbUrl}/api/collections/skills/records/${created.id}`, {
            method: 'PATCH',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ embedding: vec }),
        });
        if (!p.ok) throw new Error(`pb patch embedding ${p.status}`);
        console.log(`CREATED skill ${created.id} (${skill.agent_name} — ${skill.name}) on ${pbUrl}`);
    }
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
