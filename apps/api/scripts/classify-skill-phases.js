// Classify each skill into one of: ideation, execution, marketing.
// Default provider: google (gemini-2.0-flash). Override with --provider/--model.
//
// Run inside the api container:
//   docker exec kaushalstack-api-1 node /workspace/apps/api/scripts/classify-skill-phases.js [args]
//
// Args:
//   --limit=N         max skills to classify this run (default 1000)
//   --concurrency=N   parallel in-flight calls (default 5)
//   --provider=X      openai|anthropic|xai|google (default google)
//   --model=X         model id; defaults to provider's default
//   --dry-run         print classifications without writing back to PocketBase
//
// Skips any skill that already has a non-empty `phase` set so the script is
// resumable across runs.

import fs from 'node:fs';
import process from 'node:process';
import { chatComplete, getProviderMeta } from '../src/providers/index.js';

const PB_URL    = 'http://pocketbase:8090';
const PB_EMAIL  = 'admin@kaushalstack.com';
const PB_PWD    = 'Kaushal_Prod_2025!';
const PROGRESS  = '/tmp/classify-phases.progress';
const VALID     = ['ideation', 'execution', 'marketing'];

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^-+/, '').split('=');
    return [k, v ?? true];
}));
const LIMIT       = args.limit       ? parseInt(args.limit, 10)       : 1000;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 5;
const PROVIDER    = (args.provider || 'google').toString();
const MODEL       = args.model || (PROVIDER === 'google' ? 'gemini-2.0-flash' : getProviderMeta(PROVIDER).defaultModel);
const DRY_RUN     = !!args['dry-run'];

const PROVIDER_KEY_ENV = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    xai: 'XAI_API_KEY',
    google: 'GEMINI_API_KEY',
};
const apiKey = process.env[PROVIDER_KEY_ENV[PROVIDER]];
if (!apiKey) {
    console.error(`Missing env var ${PROVIDER_KEY_ENV[PROVIDER]} for provider=${PROVIDER}`);
    process.exit(1);
}

console.log(`classify-skill-phases · provider=${PROVIDER} model=${MODEL} limit=${LIMIT} concurrency=${CONCURRENCY}${DRY_RUN ? ' DRY-RUN' : ''}`);

async function pbAuth() {
    const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PWD }),
    });
    if (!r.ok) throw new Error(`pb auth failed: ${r.status}`);
    return (await r.json()).token;
}

async function listSkillsMissingPhase(token) {
    const out = [];
    let page = 1;
    while (true) {
        const url = `${PB_URL}/api/collections/skills/records?perPage=200&page=${page}&filter=${encodeURIComponent('phase = ""')}&fields=id,name,category,description,agent_name`;
        const r = await fetch(url, { headers: { Authorization: token } });
        if (!r.ok) throw new Error(`pb list failed: ${r.status}`);
        const data = await r.json();
        if (!data.items?.length) break;
        out.push(...data.items);
        if (data.items.length < 200) break;
        page++;
        if (out.length >= LIMIT * 2) break; // grab some slack in case some fail
    }
    return out;
}

async function updatePhase(token, id, phase) {
    const r = await fetch(`${PB_URL}/api/collections/skills/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ phase }),
    });
    if (!r.ok) throw new Error(`pb patch ${r.status}: ${(await r.text()).slice(0, 150)}`);
}

const PROMPT_INSTRUCTIONS = `You classify skills into one of three project lifecycle phases:

- ideation: research, brainstorming, planning, validation, customer discovery, market research, ideation, persona generation, competitive analysis, feasibility, requirements gathering.
- execution: building, implementing, coding, designing, deploying, operating, maintaining, QA, infrastructure, integrations, ops, automation, day-to-day operations.
- marketing: promoting, distributing, advertising, SEO, content marketing, social media, customer acquisition, sales, growth, retention, branding (when post-launch), PR.

Reply with valid JSON only: {"phase": "ideation" | "execution" | "marketing"}. No prose, no markdown.`;

function buildUserPrompt(s) {
    const desc = (s.description || '').slice(0, 1500);
    return `Skill name: ${s.name}\nCategory: ${s.category || ''}\nAgent: ${s.agent_name || ''}\n\nDescription:\n${desc}`;
}

function parsePhase(raw) {
    if (!raw) return null;
    // Try JSON parse first (jsonMode response)
    try {
        const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        const obj = JSON.parse(trimmed);
        if (obj.phase && VALID.includes(obj.phase.toLowerCase())) return obj.phase.toLowerCase();
    } catch { /* fall through */ }
    // Fallback: regex
    const m = raw.toLowerCase().match(/(ideation|execution|marketing)/);
    return m ? m[1] : null;
}

async function classify(skill) {
    const out = await chatComplete(PROVIDER, {
        key: apiKey,
        model: MODEL,
        systemPrompt: PROMPT_INSTRUCTIONS,
        userPrompt: buildUserPrompt(skill),
        jsonMode: true,
    });
    return parsePhase(out);
}

function loadDone() {
    try { return new Set(fs.readFileSync(PROGRESS, 'utf8').trim().split('\n').filter(Boolean)); }
    catch { return new Set(); }
}
function markDone(id, phase) {
    fs.appendFileSync(PROGRESS, `${id}\n`);
    fs.appendFileSync(PROGRESS + '.log', `${id} ${phase}\n`);
}

async function pool(items, worker, concurrency) {
    let i = 0;
    const inflight = new Array(concurrency).fill(null).map(async () => {
        while (i < items.length) {
            const idx = i++;
            try { await worker(items[idx]); }
            catch (err) { console.error(`[${items[idx]?.id}] ${err.message}`); }
        }
    });
    await Promise.all(inflight);
}

(async () => {
    const token = await pbAuth();
    let skills = await listSkillsMissingPhase(token);

    const done = loadDone();
    skills = skills.filter(s => !done.has(s.id));

    if (LIMIT < Infinity) skills = skills.slice(0, LIMIT);
    console.log(`To classify: ${skills.length} skills`);

    let processed = 0, fail = 0;
    const counts = { ideation: 0, execution: 0, marketing: 0 };
    const t0 = Date.now();

    await pool(skills, async (s) => {
        try {
            const phase = await classify(s);
            if (!phase) {
                fail++;
                console.error(`[${s.id}] ${s.name.slice(0, 40)} → unparseable phase`);
                return;
            }
            counts[phase]++;
            if (!DRY_RUN) {
                await updatePhase(token, s.id, phase);
                markDone(s.id, phase);
            } else {
                console.log(`DRY ${s.id} ${s.name.slice(0, 50).padEnd(50)} → ${phase}`);
            }
            processed++;
            if (processed && processed % 50 === 0) {
                const dt = (Date.now() - t0) / 1000;
                console.log(`[${processed}/${skills.length}] ${(processed/dt).toFixed(1)}/s · ${JSON.stringify(counts)} · fail=${fail}`);
            }
        } catch (err) {
            fail++;
            console.error(`[${s.id}] ${err.message.slice(0, 200)}`);
        }
    }, CONCURRENCY);

    const dt = (Date.now() - t0) / 1000;
    console.log(`\nDONE · processed=${processed} fail=${fail} · ${dt.toFixed(1)}s · ${JSON.stringify(counts)}`);
})();
