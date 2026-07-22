import fs from 'node:fs/promises';
import path from 'node:path';
import { listDir, readFile, writeFile, safeResolve } from './workspace.js';
import { ensureCache, refreshCache, getSkillByAgentName } from '../embeddings/cache.js';
import { recordUsage } from '../partner/usage.js';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const VALID_TTS_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

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

// Synthesize a voice-over via OpenAI TTS and save it as an mp3 in the
// session workspace under assets/. Returns the local path so the agent can
// drop it into an <audio src="..."> tag. Used by Tara for Reels/Stories/X-video
// posts where audio is part of the deliverable.
async function synthesizeVoice(sessionId, script, filename, voice = 'nova', speed = 1.0) {
    if (!OPENAI_KEY) {
        return { error: 'OPENAI_API_KEY not configured on server; voice synthesis unavailable.' };
    }
    const text = String(script || '').trim();
    if (!text) return { error: 'script is required' };
    if (text.length > 4000) return { error: 'script too long (max 4000 chars per TTS call)' };
    const v = VALID_TTS_VOICES.has(voice) ? voice : 'nova';
    const sp = Math.max(0.5, Math.min(parseFloat(speed) || 1.0, 1.5));

    const fname = String(filename || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60) || 'voiceover';
    const cleanName = fname.endsWith('.mp3') ? fname : `${fname}.mp3`;
    const relPath = `assets/${cleanName}`;

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({ model: 'tts-1-hd', voice: v, input: text, speed: sp }),
    });
    if (!r.ok) {
        const body = (await r.text()).slice(0, 200);
        return { error: `OpenAI TTS returned ${r.status}: ${body}` };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const abs = await safeResolve(sessionId, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    return {
        path: relPath,
        voice: v,
        bytes: buf.length,
        approx_duration_seconds: Math.round(text.length / 14),  // ~14 chars/sec for nova at speed=1.0
        embed_hint: `<audio controls src="${relPath}"></audio>`,
    };
}

// Generate a campaign visual with Gemini and save it under assets/. The
// no-text rule is ENFORCED server-side (appended to every prompt): generated
// typography is reliably garbled and adds nothing — copy belongs in HTML
// text layers, not baked into pixels. (Owner decision, 2026-07-23.)
const NO_TEXT_SUFFIX = ' — IMPORTANT: absolutely NO text, no words, no letters, no numbers, no typography, no captions, no watermarks, no logos, no signage with readable writing anywhere in the image. A clean photographic or illustrative visual only; any copy will be overlaid separately.';

async function generateImage(sessionId, prompt, filename, meter = null) {
    if (!GEMINI_KEY) {
        return { error: 'GEMINI_API_KEY not configured on server; image generation unavailable.' };
    }
    const p = String(prompt || '').trim().slice(0, 600);
    if (!p) return { error: 'prompt is required' };

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GEMINI_IMAGE_MODEL, input: [{ type: 'text', text: p + NO_TEXT_SUFFIX }] }),
    });
    if (!r.ok) {
        return { error: `Gemini returned ${r.status}: ${(await r.text()).slice(0, 200)}` };
    }
    const data = await r.json();
    const outputStep = (data.steps || []).find(s => s.type === 'model_output');
    const imgPart = outputStep?.content?.find(c => c.type === 'image');
    if (!imgPart?.data) return { error: 'Gemini did not return an image — rephrase the prompt and try once more.' };

    if (meter) {
        try {
            recordUsage({
                provider: 'google', model: GEMINI_IMAGE_MODEL,
                usage: {
                    input_tokens:  data.usage?.total_input_tokens ?? 0,
                    output_tokens: data.usage?.total_output_tokens ?? 0,
                    cached_input_tokens: data.usage?.total_cached_tokens ?? 0,
                },
                meter,
            });
        } catch { /* metering must never break the tool */ }
    }

    const ext = imgPart.mime_type === 'image/png' ? 'png' : 'jpg';
    const fname = String(filename || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60)
        || p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
        || 'generated';
    const relPath = `assets/gen-${fname.replace(/\.(png|jpe?g|webp)$/i, '')}-${Date.now()}.${ext}`;
    const buf = Buffer.from(imgPart.data, 'base64');
    const abs = await safeResolve(sessionId, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    return {
        path: relPath,
        bytes: buf.length,
        note: 'Image is text-free by design — overlay any copy as HTML text, never regenerate to add words.',
    };
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
    {
        type: 'function',
        function: {
            name: 'synthesize_voice',
            description: 'Generate a voice-over via OpenAI TTS (tts-1-hd) and save it as an mp3 in the workspace under assets/. Returns the local path you can drop into <audio src="..." controls></audio>. Use for Reel scripts, Story narration, X video captions, or any post format that benefits from spoken audio. Pick voice "nova" (default, energetic female) for upbeat marketing, "onyx" (deep male) for authoritative, "alloy" (neutral) for explainer, "fable" (British warm) for storytelling, "echo" or "shimmer" for variety.',
            parameters: {
                type: 'object',
                properties: {
                    script:   { type: 'string', description: 'The script to speak. Keep under 1500 chars (about 60 seconds at speed=1.0). Write spelled-out phrases for URLs (e.g. "mela ventures dot in slash foundr p w r"), abbreviations, and punctuation that should pause.' },
                    filename: { type: 'string', description: 'Filename without extension (will be saved as assets/<filename>.mp3). E.g. "voiceover-instagram-reel" or "voiceover-x-video".' },
                    voice:    { type: 'string', description: 'Voice id: alloy | echo | fable | onyx | nova | shimmer. Default "nova".' },
                    speed:    { type: 'number', description: 'Playback speed multiplier 0.5-1.5. Default 1.0.' },
                },
                required: ['script', 'filename'],
            },
        },
    },
];

// Not in TOOL_DEFINITIONS — opt-in via the agent's registry row (extraTools).
// Currently Tara: she generates the campaign's hero visuals. The no-text rule
// is enforced server-side; her prompt also forbids asking for words.
export const GENERATE_IMAGE_TOOL = {
    type: 'function',
    function: {
        name: 'generate_image',
        description: 'Generate a custom campaign visual with Gemini and save it into the workspace under assets/. Returns the local file path for <img src="...">. The image will contain NO text of any kind (enforced) — describe subject, scene, mood, lighting, palette, and composition only. All copy (headlines, hooks, CTAs) must be layered as HTML text over or beside the image, never baked into pixels. Prefer this over search_images for the hero visual so the imagery matches the campaign exactly; use search_images for secondary/supporting photos.',
        parameters: {
            type: 'object',
            properties: {
                prompt:   { type: 'string', description: 'Visual description WITHOUT any words to render: subject, setting, style, mood, colors, composition, lighting. E.g. "warm candid photo of two founders talking over coffee at a rooftop cafe at dusk, Bangalore skyline, soft bokeh, terracotta and cream palette".' },
                filename: { type: 'string', description: 'Short name for the file (saved as assets/gen-<filename>-<ts>.png). E.g. "hero-founders-dinner".' },
            },
            required: ['prompt'],
        },
    },
};

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
export async function executeTool(sessionId, name, args, extra = {}) {
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
        if (name === 'synthesize_voice') {
            const r = await synthesizeVoice(sessionId, args.script, args.filename, args.voice, args.speed);
            return JSON.stringify(r);
        }
        if (name === 'generate_image') {
            const meter = extra.meter ? { ...extra.meter, context: `${extra.meter.context || 'creative'}-generate-image` } : null;
            const r = await generateImage(sessionId, args.prompt, args.filename, meter);
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
