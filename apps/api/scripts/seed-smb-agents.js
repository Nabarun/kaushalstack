// One-off seeder: insert the SMB-owner-facing personas as `skills` records, then embed.
// Idempotent — skips any agent_name that already exists.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pb from '../src/utils/pocketbaseClient.js';
import logger from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PERSONAS_DIR = path.join(__dirname, '..', 'src', 'advisors', 'smb-personas');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = 'text-embedding-3-small';

if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing from env');
    process.exit(1);
}

function parsePersona(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error('Missing or malformed frontmatter');
    const fm = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([\w_]+):\s*(.*)$/);
        if (!kv) continue;
        fm[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1').trim();
    }
    return { ...fm, description: m[2].trim() };
}

async function embed(text) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.data[0].embedding;
}

async function seedOne(file) {
    const text = fs.readFileSync(path.join(PERSONAS_DIR, file), 'utf8');
    const p = parsePersona(text);

    if (!p.agent_name) throw new Error(`${file}: missing agent_name`);

    // Idempotency by skill name — agent_name is a persona slot that can own
    // multiple skills, so two different SMB skills owned by different personas
    // is fine; the same skill name twice is not.
    try {
        const existing = await pb.collection('skills').getFirstListItem(
            `name="${p.name.replace(/"/g, '\\"')}"`
        );
        return { file, agent_name: p.agent_name, status: 'skipped', id: existing.id };
    } catch (e) {
        if (e.status !== 404) throw e;
    }

    // Create skill record
    const record = await pb.collection('skills').create({
        name: p.name,
        description: p.description,
        category: p.category,
        phase: p.phase,
        difficulty_level: p.difficulty_level,
        agent_name: p.agent_name,
        associated_tech_skills: p.associated_tech_skills,
        created_by: 'system',
        likes_count: 0,
        comments_count: 0,
    });

    // Embed using same input shape as embed.js route
    const skillText = `${p.name || ''} ${p.category || ''} ${p.associated_tech_skills || ''} ${p.description || ''}`.slice(0, 2000);
    const vector = await embed(skillText);
    await pb.collection('skills').update(record.id, { embedding: vector });

    return { file, agent_name: p.agent_name, status: 'created+embedded', id: record.id };
}

(async () => {
    const files = fs.readdirSync(PERSONAS_DIR).filter(f => f.endsWith('.md'));
    logger.info(`Seeding ${files.length} SMB personas from ${PERSONAS_DIR}`);

    const results = [];
    for (const f of files) {
        try {
            const r = await seedOne(f);
            console.log(`[${r.status.padEnd(18)}] ${r.agent_name.padEnd(10)} → ${r.id}`);
            results.push(r);
        } catch (e) {
            const detail = e?.response?.data || e?.data || e?.originalError?.data || null;
            console.error(`[FAILED] ${f}: ${e.message}`);
            if (detail) console.error('       detail:', JSON.stringify(detail, null, 2));
            results.push({ file: f, status: 'failed', error: e.message });
        }
    }

    const created = results.filter(r => r.status === 'created+embedded').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log(`\n=== ${created} created, ${skipped} skipped, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
})();
