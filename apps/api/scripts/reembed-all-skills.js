// Re-embed every skill (regardless of existing embedding) using the current
// name + description as input. Run inside the api container:
//   docker exec kaushalstack-api-1 node /workspace/apps/api/scripts/reembed-all-skills.js
//
// Tracks progress in /tmp/reembed-skills.progress so the run is resumable.

import fs from 'node:fs';
import process from 'node:process';

const PB_URL    = 'http://pocketbase:8090';
const PB_EMAIL  = 'admin@kaushalstack.com';
const PB_PWD    = 'Kaushal_Prod_2025!';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL     = 'text-embedding-3-small';
const PROGRESS  = '/tmp/reembed-skills.progress';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^-+/, '').split('=');
    return [k, v ?? true];
}));
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 10;
const LIMIT       = args.limit ? parseInt(args.limit, 10) : Infinity;

if (!OPENAI_KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1); }

async function pbAuth() {
    const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PWD }),
    });
    return (await r.json()).token;
}

async function listSkills(token) {
    const out = [];
    let page = 1;
    while (true) {
        const r = await fetch(
            `${PB_URL}/api/collections/skills/records?perPage=200&page=${page}&fields=id,name,description,agent_name,category`,
            { headers: { Authorization: token } },
        ).then(r => r.json());
        if (!r.items?.length) break;
        out.push(...r.items);
        if (r.items.length < 200) break;
        page++;
    }
    return out;
}

async function embed(skill) {
    const input = `${skill.name}\n${skill.agent_name || ''}\n${skill.category || ''}\n${skill.description || ''}`.slice(0, 8000);
    const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, input }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    return { vector: data.data[0].embedding, tokens: data.usage?.total_tokens || 0 };
}

async function updateEmbedding(token, id, vector) {
    const r = await fetch(`${PB_URL}/api/collections/skills/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ embedding: vector }),
    });
    if (!r.ok) throw new Error(`pb patch ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

function loadDone() {
    try { return new Set(fs.readFileSync(PROGRESS, 'utf8').trim().split('\n').filter(Boolean)); }
    catch { return new Set(); }
}
function markDone(id) { fs.appendFileSync(PROGRESS, id + '\n'); }

async function pool(items, worker, concurrency) {
    let i = 0;
    const inflight = new Array(concurrency).fill(null).map(async () => {
        while (i < items.length) {
            const idx = i++;
            try { await worker(items[idx]); }
            catch (err) { console.error(`[${items[idx]?.id}]`, err.message); }
        }
    });
    await Promise.all(inflight);
}

(async () => {
    const token = await pbAuth();
    let skills  = await listSkills(token);
    const done  = loadDone();
    skills = skills.filter(s => !done.has(s.id));
    if (LIMIT < Infinity) skills = skills.slice(0, LIMIT);

    console.log(`re-embedding ${skills.length} skills (concurrency ${CONCURRENCY})`);

    let processed = 0;
    let failures  = 0;
    let tokens    = 0;
    const t0 = Date.now();

    await pool(skills, async (s) => {
        try {
            const { vector, tokens: t } = await embed(s);
            await updateEmbedding(token, s.id, vector);
            markDone(s.id);
            tokens += t;
            processed++;
        } catch (err) {
            failures++;
            console.error(`[${s.id}] ${s.name}: ${err.message}`);
        }
        if (processed && processed % 200 === 0) {
            const elapsed = (Date.now() - t0) / 1000;
            const rate    = processed / elapsed;
            const eta     = Math.round((skills.length - processed) / Math.max(rate, 0.001));
            const cost    = tokens * 0.02e-6;
            console.log(`[${processed}/${skills.length}] ${rate.toFixed(1)}/s · tokens ${tokens} · cost $${cost.toFixed(3)} · failures ${failures} · eta ${eta}s`);
        }
    }, CONCURRENCY);

    const elapsed = (Date.now() - t0) / 1000;
    const cost    = tokens * 0.02e-6;
    console.log(`\nDONE · processed ${processed} · failures ${failures} · ${elapsed.toFixed(1)}s · tokens ${tokens} · cost $${cost.toFixed(3)}`);
})();
