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
5. DEPLOYMENT HANDOFF — when what you built is a website, landing page, or web app (always the case when you received a design brief from Maya): after the site files are written you MUST call the consult_agent tool with agent_name "Hostinger" BEFORE writing DEPLOY.md. Describe exactly what you built (static HTML/CSS/JS bundle, the file/folder structure, whether there's an assets/ folder) and ask how the user should deploy it on Hostinger. THEN write DEPLOY.md based on the answer the tool returned: Hostinger's guidance adapted to YOUR actual files — exact upload steps, what goes where, SSL + domain pointers, and a short go-live checklist. Writing DEPLOY.md from your own general knowledge without a consult_agent call first is a workflow violation — the deployment steps must come from the Hostinger specialist. If the consult_agent call returns an error, say so in DEPLOY.md's first line ("(generic guidance — Hostinger specialist unavailable)") and only then fall back to your own knowledge. Skip this whole step only for tiny single-purpose widgets the user clearly won't host (e.g. "a quick timer to try locally").
6. After writing the text files (and DEPLOY.md when applicable), respond with a final 2-4 sentence summary of what you built. If you wrote DEPLOY.md, say the site is deployment-ready for Hostinger. DO NOT call any more tools in that final message.

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
    extraTools   = [],
    requireConsult = false,   // enforce a consult_agent call before accepting the final answer (design-brief builds)
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
    // palette/type/layout AND page count — one HTML file per Maya screen,
    // navigation wired in screen order.
    if (designBrief && (designBrief.styles || designBrief.sample_screen || designBrief.screens?.length || designBrief.available_images?.length)) {
        const briefSections = [];
        if (designBrief.available_images?.length) {
            const imgList = designBrief.available_images.map(p => `  - ${p}`).join('\n');
            briefSections.push(`Image files ALREADY IN YOUR WORKSPACE under assets/ (copied from Maya's session — reference these directly in <img src="..."> tags, do NOT call search_images for these subjects again):\n${imgList}`);
        }
        // When styles.css has been pre-copied to the workspace, we don't paste
        // it into the prompt — the agent shouldn't be reading or rewriting it.
        // It's only useful as context when she has to recreate it herself.
        if (designBrief.styles && !designBrief.stylesPreloaded) {
            briefSections.push(`Maya's design system (styles.css — palette, type, spacing, tokens):\n\`\`\`css\n${designBrief.styles}\n\`\`\``);
        }

        // Prefer the full screens array. Build one prompt section per screen so
        // Ananya can map each to a separate HTML page and wire connections.
        const screens = Array.isArray(designBrief.screens) ? designBrief.screens : [];
        if (screens.length > 0) {
            // Derive Ananya-friendly page filenames from Maya's screen names:
            // 01-hero.html → index.html (the entry), 02-form-step1.html → form-step1.html, etc.
            const pages = screens.map((s, i) => {
                const stripped = s.name.replace(/\.html?$/i, '').replace(/^\d+[-_]?/, ''); // "01-form-step1" → "form-step1"
                const slug = stripped || `page-${i + 1}`;
                const file = i === 0 ? 'index.html' : `${slug}.html`;
                return { ...s, file, slug };
            });
            const planLines = pages.map((p, i) =>
                `  ${i + 1}. ${p.name}  →  write file \`${p.file}\`${i + 1 < pages.length ? `  — its primary CTA / form action MUST link to \`${pages[i + 1].file}\`` : '  (final / end of flow — no forward link)'}`
            ).join('\n');
            const allowedHrefs = pages.map(p => `\`${p.file}\``).join(', ');
            const screenSections = pages.map((p, i) => (
                `### Screen ${i + 1} of ${pages.length} — Maya called it \`${p.name}\`  →  YOU write it as \`${p.file}\`\n\`\`\`html\n${p.html}\n\`\`\``
            )).join('\n\n');
            briefSections.push(
                `Maya designed a ${pages.length}-screen flow. Build ${pages.length} HTML pages — ONE per screen — and wire them together in this order:\n\n${planLines}\n\n` +
                `LINK NAMING — every internal navigation \`<a href="...">\` and every \`<form action="...">\` MUST resolve to one of these exact filenames: ${allowedHrefs}. NEVER copy Maya's screen filenames (\`01-…html\`) into your hrefs — those files do not exist in your workspace. If you copy a link target from Maya's HTML, you must translate it: e.g. \`02-form.html\` in Maya's source becomes \`form.html\` in yours.\n\n` +
                `FORM METHOD — every \`<form>\` MUST use \`method="GET"\` (or no method attribute at all, which defaults to GET). The preview is static — there is no backend. \`method="POST"\` would land the user on the destination page but with discarded form data and a broken back button. GET is the right method for "navigate to next page".\n\n` +
                `Preserve the same shared navbar / header across every page so they feel like one app.\n\n` +
                `MANDATORY: write a shared \`script.js\` file and \`<script defer src="script.js"></script>\` it from every page. The site is interactive HTML5 + vanilla JS, not a stack of static screenshots. Required behaviors:\n` +
                `  - **Persist form state across pages** via localStorage. On any form-submit page, write all named fields to \`localStorage.setItem('secondact_intake', JSON.stringify(formData))\` (or a similarly-named key derived from the project) BEFORE the form's GET navigation fires. On the next page, read that key in a DOMContentLoaded handler and personalize the rendering (e.g. show "Hi, {name}" on the report page, fill in summary cards from the user's inputs, etc.).\n` +
                `  - **Client-side validation** on every form. Use HTML5 \`required\`, \`type="email"\`, \`pattern\`, plus a small JS handler that prevents submit if validation fails and shows a friendly inline error. No native browser alerts.\n` +
                `  - **Animate "loading" / "generating" / "processing" screens.** If Maya designed a transitional state screen (one that says "generating your report", "thinking", "analyzing"), it should auto-advance after 2–4 seconds via \`setTimeout(() => location.href = 'next.html', 3000)\` and animate a progress indicator (CSS keyframe + JS percentage tick) while it waits. The user should NEVER have to manually click "Next" on a loading screen.\n` +
                `  - **Interactive chips / tabs / toggles**: any element Maya drew with \`is-on\` / \`active\` / \`selected\` state classes should respond to clicks (\`addEventListener('click', toggle)\`) and visually update.\n` +
                `  - **Semantic HTML5**: use \`<header>\`, \`<nav>\`, \`<main>\`, \`<section>\`, \`<form>\`, \`<button>\` properly — not a sea of \`<div>\`s. Add \`aria-*\` attributes where needed for screen readers (\`aria-label\` on icon-only buttons, \`aria-current\` on active nav items, \`aria-live="polite"\` on the loading indicator).\n` +
                `  - **Keep script.js under 8KB**. Use small, named functions; no frameworks.\n\n` +
                screenSections
            );
        } else if (designBrief.sample_screen) {
            // Back-compat: older briefs (or single-screen Maya runs) only carry one sample.
            briefSections.push(`Maya's primary screen layout (use the structure and visual hierarchy, NOT the device frame):\n\`\`\`html\n${designBrief.sample_screen}\n\`\`\``);
        }

        const multiPage = screens.length > 1;
        // When the runtime managed to pre-write Maya's styles.css into the
        // workspace, the agent MUST NOT overwrite it — small models keep
        // re-transcribing the file and dropping ~80% of the class
        // definitions. The HTML she writes references those classes, so
        // losing them means unstyled pages.
        const stylesLine = designBrief.stylesPreloaded
            ? `STYLES.CSS IS ALREADY IN YOUR WORKSPACE — Maya's verbatim stylesheet has been pre-copied for you (full file, all class definitions intact). Do NOT call write_file('styles.css', ...) — that would overwrite the source of truth and destroy the design. Every HTML page you write must \`<link rel="stylesheet" href="styles.css">\` and use the class names you see in Maya's screen HTML below. The classes already exist in the pre-loaded styles.css — trust them, don't guess.`
            : `MANDATORY FIRST STEP: write \`styles.css\` BEFORE writing any HTML page. Populate it with Maya's CSS variables, type stack, spacing, colors, button/card primitives — copied verbatim where possible. Every HTML page you write \`<link rel="stylesheet" href="styles.css">\`s it, so it MUST exist. Pages with a missing styles.css render as unstyled black text on white — a complete visual regression.`;
        userMessage += `\n\n────────\nDESIGN BRIEF FROM MAYA (UX Designer)\n\nYour teammate Maya already designed the mockups for this. INHERIT her visual decisions — exact palette colors, fonts, spacing scale, button/card shapes, layout patterns — AND reuse the photos she already pulled. ${multiPage ? `Build ${screens.length} production HTML pages that match Maya's screen flow one-to-one.` : 'Build the production website that embodies her design system.'}\n\n${stylesLine}\n\nIMPORTANT — what to strip from Maya's mockup HTML:\n- Maya wrapped each screen in a device frame. STRIP IT in your HTML. Remove every \`<div class="stage">\`, \`<div class="browser">\`, \`<div class="browser__bar">\`, \`<div class="browser__viewport">\`, \`<div class="phone">\`, \`<div class="iphone">\`, faux URL bars, traffic-light dots, status bars — anything that exists to make her HTML look like a screenshot.\n- KEEP everything INSIDE the frame: navbars, hero sections, cards, forms, footers. That's the actual content.\n- Use the class names from Maya's screen HTML directly — \`.tile\`, \`.bento\`, \`.btn\`, \`.input\`, \`.nav\`, \`.brand\`, \`.eyebrow\`, \`.hero\`, etc. They are all defined in the pre-loaded styles.css.\n- Use the same typography stack.\n${multiPage ? `- Produce EXACTLY ${screens.length} HTML files, one per Maya screen, named per the plan below. Same number of pages as Maya, all connected in the same order.\n- Mirror the section structure of EACH screen (do not collapse multiple screens into one page).\n- Same navbar/header on every page.\n` : '- Mirror the section structure of her screen.\n'}- For images, USE THE FILES ALREADY IN assets/ (listed below). Only call search_images for NEW image subjects Maya didn't pull.\n\n${briefSections.join('\n\n')}`;
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
    ];

    const trace = [];
    let finalText = '';

    // Deterministic guard: gpt-4o-mini sometimes skips the mandated
    // consult_agent step (or fakes the fallback header without calling the
    // tool). When a design brief came from Maya, the deployment consult is
    // the contract — so if the model tries to finish without having
    // consulted, we bounce it back once instead of accepting the answer.
    const mustConsult = requireConsult && !!designBrief;
    let consulted = false;
    let consultNudges = 0;

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
                tools: [...TOOL_DEFINITIONS, ...extraTools],
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
            if (mustConsult && !consulted && consultNudges < 2) {
                consultNudges++;
                trace.push({ turn, kind: 'consult_nudge' });
                if (onEvent) onEvent({ kind: 'consult_nudge' });
                messages.push({
                    role: 'user',
                    content: 'STOP — you have not called the consult_agent tool yet. Maya handed you this design, so the deployment guidance must come from the Hostinger specialist, not from memory. Call consult_agent now with agent_name "Hostinger", describe the exact files you wrote, ask how to deploy them, then write (or rewrite) DEPLOY.md from the answer, and only then give your final summary.',
                });
                continue;
            }
            finalText = msg.content || '';
            trace.push({ turn, kind: 'final', text: finalText });
            if (onEvent) onEvent({ kind: 'final', text: finalText });
            break;
        }

        // Execute each tool call sequentially and append the result.
        for (const call of toolCalls) {
            if (call.function.name === 'consult_agent') consulted = true;
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
