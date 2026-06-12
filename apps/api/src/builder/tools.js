import fs from 'node:fs/promises';
import path from 'node:path';
import { listDir, readFile, writeFile, safeResolve } from './workspace.js';
import { ensureCache, refreshCache, getSkillByAgentName } from '../embeddings/cache.js';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Ask another KaushalStack agent for guidance. The consulted agent's skill
// description (its playbook, distilled from real tutorials) becomes the
// system prompt of a one-shot LLM call. This is how Ananya asks Hostinger
// "how do I deploy this site" while building.
async function consultAgent(agentName, question) {
    const q = String(question || '').trim();
    if (!q) return { error: 'question is required' };
    await ensureCache();
    let skill = getSkillByAgentName(agentName);
    if (!skill) {
        // The agent may have been added since the cache last loaded.
        await refreshCache();
        skill = getSkillByAgentName(agentName);
    }
    if (!skill) {
        return { error: `No agent named "${agentName}" on KaushalStack. Check the spelling of agent_name.` };
    }
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: `You are ${skill.agent_name}, the "${skill.name}" specialist agent on KaushalStack. Your playbook:\n\n${skill.description}\n\nA teammate agent is consulting you mid-build. Answer their question with concrete, actionable guidance drawn from your playbook — exact steps, panel/menu names, file paths, settings. No fluff, under 450 words.`,
                },
                { role: 'user', content: q.slice(0, 2000) },
            ],
        }),
    });
    if (!r.ok) {
        return { error: `consult failed: openai ${r.status}` };
    }
    const data = await r.json();
    const answer = data.choices?.[0]?.message?.content || '';
    return { agent: skill.agent_name, skill: skill.name, answer };
}

// Search Unsplash, download up to N hits into the session workspace under
// assets/, and return their local paths so the agent can drop them into
// <img src="…"> tags. Saving locally (rather than hotlinking) means the
// downloaded ZIP is self-contained and works offline.
async function searchAndSaveImages(sessionId, query, count = 3) {
    if (!UNSPLASH_KEY) {
        return { error: 'UNSPLASH_ACCESS_KEY not configured on server; image search unavailable.' };
    }
    const q = String(query || '').trim();
    if (!q) return { error: 'query is required' };
    const n = Math.max(1, Math.min(parseInt(count, 10) || 3, 5));

    const params = new URLSearchParams({
        query: q,
        per_page: String(n),
        orientation: 'landscape',
        content_filter: 'high',
    });
    const r = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
        headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    });
    if (!r.ok) {
        const body = (await r.text()).slice(0, 200);
        return { error: `Unsplash returned ${r.status}: ${body}` };
    }
    const data = await r.json();
    const hits = (data.results || []).slice(0, n);
    if (hits.length === 0) return { images: [], message: 'No images found for that query.' };

    const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
    const saved = [];
    for (let i = 0; i < hits.length; i++) {
        const photo = hits[i];
        try {
            const url = photo.urls?.regular || photo.urls?.small;
            if (!url) continue;
            const imgRes = await fetch(url);
            if (!imgRes.ok) continue;
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const relPath = `assets/img-${slug}-${i + 1}.jpg`;
            const abs = await safeResolve(sessionId, relPath);
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, buf);
            saved.push({
                path: relPath,
                width: photo.width,
                height: photo.height,
                description: photo.description || photo.alt_description || '',
                photographer: photo.user?.name || '',
                bytes: buf.length,
            });
        } catch { /* skip this hit, try the next */ }
    }
    return { images: saved };
}

// OpenAI tool definitions (function calling schema). When we add Anthropic
// support later, the dispatcher will translate from this shape.
export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'list_dir',
            description: 'List files and subdirectories at the given path relative to the workspace root. Returns an array of {name, kind} entries.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path inside the workspace. Use "." for the root.' },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file at the given relative path. Returns the file as a string.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path of the file to read.' },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create or overwrite a file at the given path with the given contents. Use this to author the app source files (HTML, CSS, JS, JSON). Max 200KB per file.',
            parameters: {
                type: 'object',
                properties: {
                    path:     { type: 'string', description: 'Relative path where the file should be written (e.g. "index.html").' },
                    contents: { type: 'string', description: 'Full file contents.' },
                },
                required: ['path', 'contents'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_images',
            description: 'Search Unsplash for royalty-free photos and save them into the workspace under assets/. Returns local file paths you can drop directly into <img src="..."> tags. Always prefer this over inventing image URLs, using picsum/placeholder services, or leaving image slots empty. Good for hero photos, illustrations, backgrounds.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search keywords (e.g. "physiotherapy clinic", "coffee shop interior", "minimalist desk").' },
                    count: { type: 'number', description: 'How many images to fetch (1-5). Default 3. Use 1 when you only need a hero photo.' },
                },
                required: ['query'],
            },
        },
    },
];

// Not in TOOL_DEFINITIONS — only agents whose registry row opts in (currently
// Ananya) get this one, so Maya/Kavya/Tara don't burn turns consulting.
export const CONSULT_AGENT_TOOL = {
    type: 'function',
    function: {
        name: 'consult_agent',
        description: 'Ask another KaushalStack specialist agent a question and get their expert guidance back as text. Use this to consult the Hostinger agent (agent_name "Hostinger") for deployment/hosting instructions once a site is built.',
        parameters: {
            type: 'object',
            properties: {
                agent_name: { type: 'string', description: 'The agent to consult, e.g. "Hostinger".' },
                question:   { type: 'string', description: 'A specific question, including relevant context about what you built (file structure, static vs dynamic, assets).' },
            },
            required: ['agent_name', 'question'],
        },
    },
};

// Dispatch a tool call to the workspace. Returns the string result to feed
// back into the LLM. Errors are stringified, never thrown — the agent loop
// can keep going and the LLM can adapt.
export async function executeTool(sessionId, name, args) {
    try {
        if (name === 'list_dir') {
            const entries = await listDir(sessionId, args.path);
            return JSON.stringify(entries);
        }
        if (name === 'read_file') {
            return await readFile(sessionId, args.path);
        }
        if (name === 'write_file') {
            // Guard: never let write_file clobber an image (search_images already
            // saved it as binary; any "write" here would replace bytes with text).
            const ext = (args.path || '').toLowerCase().match(/\.([a-z0-9]+)$/);
            if (ext && /^(jpe?g|png|webp|gif|svg|avif|ico)$/.test(ext[1])) {
                return JSON.stringify({
                    error: `${args.path} is a binary image — already saved by search_images. write_file is only for text source files (HTML/CSS/JS/JSON). Skip this call and reference the existing path in <img src="…">.`,
                });
            }
            const r = await writeFile(sessionId, args.path, args.contents);
            return JSON.stringify({ ok: true, ...r });
        }
        if (name === 'search_images') {
            const r = await searchAndSaveImages(sessionId, args.query, args.count);
            return JSON.stringify(r);
        }
        if (name === 'consult_agent') {
            const r = await consultAgent(args.agent_name, args.question);
            return JSON.stringify(r);
        }
        return JSON.stringify({ error: `unknown tool: ${name}` });
    } catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
