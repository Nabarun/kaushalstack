import logger from '../utils/logger.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = 'gpt-4o-mini';
// Each turn = 1 chat-completion + (optional) tool execution. Pixabay searches
// + file downloads add 1–3 turns over the old text-only flow, so 12 turned
// out to be too tight. 20 is the default; callers (e.g. the mockup agent that
// writes 7+ files) can bump it further.
const DEFAULT_MAX_TURNS = 20;

export const ANANYA_SYSTEM_PROMPT = `You are Ananya, the Dev Engineer agent on kaushalstack. You build small static web apps in response to user requests by writing files into a session workspace using the tools provided.

HARD RULES:
- Output only HTML, CSS, and vanilla JavaScript (ES modules OK). NO build step, NO npm install, NO bundler-required framework imports.
- All third-party JS/CSS via public CDN URLs (unpkg, jsdelivr, cdnjs).
- For IMAGES: call the search_images tool. The tool DOWNLOADS the photo into the workspace and returns a path. You ONLY reference that path in an <img src="..."> tag. **NEVER call write_file for an image file** (anything ending in .jpg, .png, .webp, .gif, .svg) — those binary files are already on disk after search_images returns. Calling write_file on them will corrupt the image with text.
- write_file is ONLY for text source files: HTML, CSS, JS, JSON.
- Never invent image URLs, never use picsum.photos or placeholder.com, never leave <img src> blank.
- All file paths relative to the workspace root (e.g. "index.html", "assets/main.css"). NEVER use "../" or absolute paths.
- The app must run when the user opens index.html directly in a browser. No server required.
- Keep generated source files under ~200KB each (the file-size limit applies to text files; images saved by search_images are exempt).

WORKFLOW:
1. Call list_dir(".") first to see if anything already exists.
2. Plan the file structure briefly in your visible response (one short paragraph), then start writing files.
3. If the app needs hero or illustrative images, call search_images with a specific query BEFORE writing index.html so you know the actual paths to use. After search_images, the image files are already saved — you do not need to (and must not) write_file them.
4. Always create at least an index.html. Add CSS/JS as separate files when it improves readability.
5. After writing the text files, respond with a final 2-4 sentence summary of what you built. DO NOT call any more tools in that final message.

QUALITY:
- The result should look polished — use a reasonable color palette, sensible typography, spacing.
- Be opinionated: if the user is vague, make a strong design choice and explain it.
- Add a small footer note: "Built by Ananya on kaushalstack.com".`;

export async function runBuildAgent({
    sessionId,
    query,
    context,
    designBrief  = null,
    model        = DEFAULT_MODEL,
    systemPrompt = ANANYA_SYSTEM_PROMPT,
    maxTurns     = DEFAULT_MAX_TURNS,
    userIntro    = 'Build this for me',
    onEvent,
}) {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured on server');

    // If invocation came from a Round Table, the other agents' perspectives
    // are passed in as context. Stitch them into the user prompt as
    // additional requirements/considerations the agent should reflect.
    let userMessage = `${userIntro}: ${query}`;
    if (Array.isArray(context) && context.length > 0) {
        const teamInput = context
            .filter(c => c && typeof c.agent_name === 'string' && typeof c.perspective === 'string')
            .map(c => `- ${c.agent_name}: ${c.perspective.trim()}`)
            .join('\n\n');
        if (teamInput) {
            userMessage = `${userIntro}: ${query}\n\nYour teammates at the round table discussed this request and gave the following input. Incorporate their thinking where it makes the output stronger — but stay within your stated constraints:\n\n${teamInput}`;
        }
    }

    // If Maya (UX Designer) produced mockups for this round-table chat first,
    // her design system gets appended as a hard brief. Ananya should inherit
    // palette/type/layout rather than starting blank.
    if (designBrief && (designBrief.styles || designBrief.sample_screen || designBrief.available_images?.length)) {
        const briefSections = [];
        if (designBrief.available_images?.length) {
            const imgList = designBrief.available_images.map(p => `  - ${p}`).join('\n');
            briefSections.push(`Image files ALREADY IN YOUR WORKSPACE under assets/ (copied from Maya's session — reference these directly in <img src="..."> tags, do NOT call search_images for these subjects again):\n${imgList}`);
        }
        if (designBrief.styles) {
            briefSections.push(`Maya's design system (styles.css — palette, type, spacing, tokens):\n\`\`\`css\n${designBrief.styles}\n\`\`\``);
        }
        if (designBrief.sample_screen) {
            briefSections.push(`Maya's primary screen layout (use the structure and visual hierarchy, NOT the device frame):\n\`\`\`html\n${designBrief.sample_screen}\n\`\`\``);
        }
        userMessage += `\n\n────────\nDESIGN BRIEF FROM MAYA (UX Designer)\n\nYour teammate Maya already designed the mockups for this. INHERIT her visual decisions — exact palette colors, fonts, spacing scale, button/card shapes, layout patterns — AND reuse the photos she already pulled. Build the production website that embodies her design system.\n\nIMPORTANT:\n- Do NOT preserve her mockup's device frame (iPhone shell or browser-window chrome). Build the real, full-width website.\n- Pull the CSS variables / palette from her styles.css verbatim where you can. Don't invent new colors.\n- Use the same typography stack.\n- Mirror the section structure of her screen.\n- For images, USE THE FILES ALREADY IN assets/ (listed below). Only call search_images for NEW image subjects Maya didn't pull.\n\n${briefSections.join('\n\n')}`;
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
    ];

    const trace = [];
    let finalText = '';

    for (let turn = 0; turn < maxTurns; turn++) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model,
                messages,
                tools: TOOL_DEFINITIONS,
                tool_choice: 'auto',
                temperature: 0.7,
            }),
        });
        if (!r.ok) {
            const body = (await r.text()).slice(0, 400);
            throw new Error(`openai chat ${r.status}: ${body}`);
        }
        const data = await r.json();
        const msg = data.choices?.[0]?.message;
        if (!msg) throw new Error('openai returned no message');

        // Push the assistant message into the history so subsequent tool
        // results have something to attach to.
        messages.push(msg);

        const toolCalls = msg.tool_calls || [];
        if (toolCalls.length === 0) {
            finalText = msg.content || '';
            trace.push({ turn, kind: 'final', text: finalText });
            if (onEvent) onEvent({ kind: 'final', text: finalText });
            break;
        }

        // Execute each tool call sequentially and append the result.
        for (const call of toolCalls) {
            let parsed = {};
            try { parsed = JSON.parse(call.function.arguments || '{}'); } catch { /* ignored */ }
            const result = await executeTool(sessionId, call.function.name, parsed);
            const traceEntry = {
                turn,
                kind: 'tool',
                name: call.function.name,
                args: parsed,
                result_preview: result.slice(0, 200),
            };
            trace.push(traceEntry);
            if (onEvent) onEvent(traceEntry);
            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: result,
            });
        }
    }

    if (!finalText) {
        finalText = `Reached the ${maxTurns}-turn limit. The workspace may be incomplete.`;
        trace.push({ turn: maxTurns, kind: 'truncated' });
    }

    logger.info(`build-agent: session=${sessionId} turns=${trace.length} tools=${trace.filter(t => t.kind === 'tool').length}`);
    return { final: finalText, trace };
}
