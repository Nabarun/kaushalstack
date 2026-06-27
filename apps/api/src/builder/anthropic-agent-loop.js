// Anthropic tool-use agent loop — parallel to agent-loop.js but using Claude's
// /v1/messages API. Same workspace tools (list_dir, read_file, write_file,
// search_images); different request/response shape.

import logger from '../utils/logger.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_MAX_TURNS = 20;
// Generous output budget per turn. Tool-use responses include the full
// `contents` argument of write_file as model output, so a single HTML screen
// can easily consume 2–3K tokens. 4K was too tight — Claude silently skipped
// writes rather than truncating. 16K is well within Sonnet/Opus 4 limits.
const MAX_TOKENS = 16384;

// Translate OpenAI function-calling tool defs into Anthropic's tool format:
//   { type: 'function', function: { name, description, parameters } }
// ↓
//   { name, description, input_schema }
function toAnthropicTools(openaiTools) {
    return openaiTools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
    }));
}

export async function runAnthropicAgent({
    sessionId,
    apiKey,
    query,
    context,
    designBrief = null,
    model       = DEFAULT_MODEL,
    systemPrompt,
    maxTurns    = DEFAULT_MAX_TURNS,
    userIntro   = 'Build this for me',
    onEvent,
}) {
    if (!apiKey) throw new Error('Anthropic API key is required');
    if (!systemPrompt) throw new Error('systemPrompt is required');

    // Construct the user message exactly the way the OpenAI loop does so the
    // observable behaviour is identical between providers.
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
        userMessage += `\n\n────────\nDESIGN BRIEF FROM MAYA (UX Designer)\n\nYour teammate Maya already designed the mockups for this. INHERIT her visual decisions — exact palette colors, fonts, spacing scale, button/card shapes, layout patterns — AND reuse the photos she already pulled. Build the production website that embodies her design system.\n\nIMPORTANT:\n- Do NOT preserve her mockup's device frame.\n- Pull the CSS variables / palette from her styles.css verbatim where you can.\n- Use the same typography stack.\n- Mirror the section structure of her screen.\n- For images, USE THE FILES ALREADY IN assets/ (listed below). Only call search_images for NEW image subjects Maya didn't pull.\n\n${briefSections.join('\n\n')}`;
    }

    const tools = toAnthropicTools(TOOL_DEFINITIONS);
    const messages = [{ role: 'user', content: userMessage }];

    // Cache the system prompt + tools. Both are stable across the entire run
    // (system prompt is the agent's persona, tools are the workspace tool defs).
    // First call pays ~25% extra for cache creation; subsequent calls read at
    // ~10% of base input. With 20+ turns, this is a 25-35% latency + cost cut.
    // The cache_control marker on the LAST item in `tools` extends caching to
    // every tool def before it (Anthropic's "everything-up-to-this-mark" rule).
    const cachedSystem = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
    const cachedTools  = tools.length > 0
        ? [...tools.slice(0, -1), { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } }]
        : tools;

    const trace = [];
    let finalText = '';
    let cacheCreateTokens = 0;
    let cacheReadTokens   = 0;
    let inputTokens       = 0;
    let outputTokens      = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
                model,
                max_tokens: MAX_TOKENS,
                system: cachedSystem,
                tools: cachedTools,
                messages,
            }),
        });
        if (!r.ok) {
            const body = (await r.text()).slice(0, 400);
            const err = new Error(`anthropic messages ${r.status}: ${body}`);
            err.status = r.status;
            throw err;
        }
        const data = await r.json();
        const blocks = data.content || [];
        const stopReason = data.stop_reason;
        // Accumulate cache + usage telemetry so we can verify cache is actually hitting.
        const usage = data.usage || {};
        cacheCreateTokens += usage.cache_creation_input_tokens || 0;
        cacheReadTokens   += usage.cache_read_input_tokens     || 0;
        inputTokens       += usage.input_tokens                || 0;
        outputTokens      += usage.output_tokens               || 0;

        // Push the assistant message into history so any tool_result we add
        // next references it correctly.
        messages.push({ role: 'assistant', content: blocks });

        if (stopReason !== 'tool_use') {
            // Final response — collect text blocks.
            finalText = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
            trace.push({ turn, kind: 'final', text: finalText });
            if (onEvent) onEvent({ kind: 'final', text: finalText });
            break;
        }

        // Execute each tool_use block in order, append a tool_result for each.
        const toolUses = blocks.filter(b => b.type === 'tool_use');
        const resultBlocks = [];
        for (const tu of toolUses) {
            const args = tu.input || {};
            const result = await executeTool(sessionId, tu.name, args);
            const traceEntry = {
                turn,
                kind: 'tool',
                name: tu.name,
                args,
                result_preview: result.slice(0, 200),
            };
            trace.push(traceEntry);
            if (onEvent) onEvent(traceEntry);
            resultBlocks.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: result,
            });
        }
        messages.push({ role: 'user', content: resultBlocks });
    }

    if (!finalText) {
        finalText = `Reached the ${maxTurns}-turn limit. The workspace may be incomplete.`;
        trace.push({ turn: maxTurns, kind: 'truncated' });
    }

    // Cache-hit ratio = cache_read / (cache_read + cache_create + uncached input).
    // First turn always misses; turns 2..N should be ~100% if caching works.
    const totalInput = cacheReadTokens + cacheCreateTokens + inputTokens;
    const cacheHitPct = totalInput > 0 ? Math.round((cacheReadTokens / totalInput) * 100) : 0;
    logger.info(`anthropic-agent: session=${sessionId} model=${model} turns=${trace.length} tools=${trace.filter(t => t.kind === 'tool').length} cache_hit=${cacheHitPct}% (read=${cacheReadTokens} create=${cacheCreateTokens} fresh_in=${inputTokens} out=${outputTokens})`);
    return { final: finalText, trace };
}
