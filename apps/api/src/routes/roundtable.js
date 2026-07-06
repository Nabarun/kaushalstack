import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserBYOK } from './user-keys.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FREE_LIMIT = 10;

// ── Collection bootstrap ────────────────────────────────────────────────────

let usageCollectionReady = false;
let chatsCollectionReady = false;

async function ensureUsageCollection() {
    if (usageCollectionReady) return;
    try {
        await pb.collections.getOne('roundtable_usage');
        usageCollectionReady = true;
    } catch {
        try {
            await pb.send('/api/collections', {
                method: 'POST',
                body: {
                    name: 'roundtable_usage',
                    type: 'base',
                    fields: [
                        { type: 'text',   name: 'user_id', required: true },
                        { type: 'number', name: 'uses',    min: 0 },
                    ],
                },
            });
            usageCollectionReady = true;
            logger.info('roundtable_usage collection created');
        } catch (err) {
            logger.warn('Could not create roundtable_usage collection:', err.message);
        }
    }
}

// Fields the collection must carry. `created`/`updated` are autodate — the
// original runtime-created collection omitted them, which silently broke the
// history list (GET sorts by -created) AND the persistence of tool outputs.
// This ensure step repairs both old and new deployments in place.
// query cap is intentionally generous: when a chat is seeded from an uploaded
// spec, the wrapped prompt includes the full spec text (up to ~60KB) along
// with the reviewer framing. 2000 chars was a holdover from before spec
// uploads existed and silently rejected every spec-seeded chat, breaking
// downstream /spec lookups because the client fell back to a local- id.
const QUERY_MAX = 100000;
const CHAT_FIELDS = [
    { type: 'text',     name: 'user_id',      required: true },
    { type: 'text',     name: 'query',        required: true, max: QUERY_MAX },
    { type: 'json',     name: 'team',         maxSize: 100000 },
    { type: 'json',     name: 'responses',    maxSize: 200000 },
    // turns is the multi-turn conversation thread: [{ query, responses }, …]
    // Legacy chats predate this field and rely on the top-level `query` +
    // `responses` instead — they're surfaced read-only via a load-time
    // adapter. New chats populate both for backwards compat: turns[0] is the
    // initial submit, and the top-level query/responses mirror turns[0] so
    // older readers keep working. 1 MB cap = ~10 turns × 8 agents × ~5KB.
    { type: 'json',     name: 'turns',        maxSize: 1000000 },
    // tech_team + tech_turns are the parallel storage for the technical
    // round table (Aisha's "convene tech team" flow). Same shape as
    // team/turns but tagged separately so the spec synthesizer can stitch
    // domain + tech transcripts into one combined doc.
    { type: 'json',     name: 'tech_team',    maxSize: 100000 },
    { type: 'json',     name: 'tech_turns',   maxSize: 1000000 },
    // uploaded_spec: { text, filename } — set when the user seeded this chat by
    // uploading a draft spec. Lets Aisha produce a COMBINED spec (upload + the
    // round table's review) and survives reloads.
    { type: 'json',     name: 'uploaded_spec', maxSize: 200000 },
    // agent_threads: { [agent_name]: [{ role: 'user'|'assistant', text, ts }] }
    // Per-agent 1:1 follow-up threads — the user can drill into any single
    // agent's response and chat with just them. Each agent's thread is
    // capped at AGENT_THREAD_TURN_CAP (in the route below) so a runaway
    // user can't bloat the row. 500KB ≈ 16 agents × 20 turns × ~1.5KB.
    { type: 'json',     name: 'agent_threads', maxSize: 500000 },
    { type: 'json',     name: 'tool_results', maxSize: 600000 },
    // phase scopes the chat to one of ideation | execution | marketing. Drives
    // spec template choice (marketing → 5-asset campaign brief, others →
    // software spec) and the pipeline strip (marketing hides Ananya/Hostinger).
    { type: 'text',     name: 'phase',        max: 20 },
    { type: 'autodate', name: 'created',      onCreate: true,  onUpdate: false },
    { type: 'autodate', name: 'updated',      onCreate: true,  onUpdate: true  },
];

const VALID_PHASES = new Set(['ideation', 'execution', 'marketing']);

async function ensureChatsCollection() {
    if (chatsCollectionReady) return;
    try {
        const existing = await pb.collections.getOne('roundtable_chats');
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = CHAT_FIELDS.filter(f => !have.has(f.name));

        // Pre-existing fields whose constraints have drifted from CHAT_FIELDS
        // get grown in place. Today only `query.max` matters — we widen it
        // from the original 2000 → QUERY_MAX so spec-seeded chats stop being
        // silently rejected. This is safe (PB allows growing text max).
        const fields = (existing.fields || []).map(f => {
            if (f.name === 'query' && (f.max || 0) < QUERY_MAX) {
                return { ...f, max: QUERY_MAX };
            }
            return f;
        });
        const queryFieldGrew = fields.some((f, i) => f !== (existing.fields || [])[i]);
        const needsUpdate = missing.length > 0 || queryFieldGrew;

        if (needsUpdate) {
            try {
                await pb.collections.update('roundtable_chats', {
                    fields: [...fields, ...missing],
                });
                const changes = [];
                if (missing.length > 0) changes.push(`added fields [${missing.map(f => f.name).join(', ')}]`);
                if (queryFieldGrew)    changes.push(`widened query.max → ${QUERY_MAX}`);
                logger.info(`roundtable_chats: ${changes.join('; ')}`);
            } catch (err) {
                logger.warn('Could not update roundtable_chats fields:', err.message);
            }
        }
        chatsCollectionReady = true;
    } catch {
        try {
            await pb.send('/api/collections', {
                method: 'POST',
                body: { name: 'roundtable_chats', type: 'base', fields: CHAT_FIELDS },
            });
            chatsCollectionReady = true;
            logger.info('roundtable_chats collection created');
        } catch (err) {
            logger.warn('Could not create roundtable_chats collection:', err.message);
        }
    }
}

ensureUsageCollection();
ensureChatsCollection();

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getUsageRecord(userId) {
    try {
        const list = await pb.collection('roundtable_usage').getList(1, 1, {
            filter: `user_id = "${userId}"`,
        });
        return list.items[0] || null;
    } catch {
        return null;
    }
}

async function incrementUsage(userId) {
    try {
        const existing = await getUsageRecord(userId);
        if (existing) {
            return await pb.collection('roundtable_usage').update(existing.id, {
                uses: (existing.uses || 0) + 1,
            });
        }
        return await pb.collection('roundtable_usage').create({
            user_id: userId,
            uses: 1,
        });
    } catch (err) {
        logger.warn('Failed to increment usage for', userId, err.message);
        return null;
    }
}

async function saveChat(userId, query, team, responses, uploadedSpec = null, phase = null) {
    try {
        return await pb.collection('roundtable_chats').create({
            user_id: userId,
            query,
            team,
            responses,
            // turns[0] mirrors the top-level query/responses so the chat
            // is multi-turn-ready from the start.
            turns: [{ query, responses }],
            // present only when the chat was seeded from an uploaded draft spec.
            ...(uploadedSpec ? { uploaded_spec: uploadedSpec } : {}),
            ...(phase && VALID_PHASES.has(phase) ? { phase } : {}),
        });
    } catch (err) {
        // Surface PB field-level validation errors — without this, "Failed to
        // create record" hides the actual culprit (which field was rejected
        // and why), making schema drift bugs invisible in prod logs.
        const fieldErrors = err?.data?.data
            ? Object.entries(err.data.data).map(([f, d]) => `${f}=${d?.message || JSON.stringify(d)}`).join('; ')
            : '';
        logger.warn(`Failed to save chat for ${userId}: ${err.message}${fieldErrors ? ' | ' + fieldErrors : ''}`);
        return null;
    }
}

// Append a new (query, responses) pair to an existing chat's turns array.
// Returns the updated chat record, or null on failure / ownership mismatch.
// Caps at 10 turns total so a runaway loop can't bloat the row.
//
// `kind` routes between the two round tables on the same chat:
//   'domain' → writes to `turns` (legacy + multi-turn case)
//   'tech'   → writes to `tech_turns` (Aisha's convene-tech flow)
const MAX_TURNS_PER_CHAT = 10;
async function appendChatTurn(chatId, userId, query, responses, kind = 'domain') {
    try {
        const existing = await pb.collection('roundtable_chats').getOne(chatId);
        if (existing.user_id !== userId) return null;
        const field = kind === 'tech' ? 'tech_turns' : 'turns';
        const turns = Array.isArray(existing[field]) ? existing[field].slice() : [];
        // Legacy chats stored only top-level query+responses; rebuild their
        // first turn from those so the array grows monotonically. (domain only)
        if (kind === 'domain' && turns.length === 0 && existing.query) {
            turns.push({ query: existing.query, responses: existing.responses || [] });
        }
        if (turns.length >= MAX_TURNS_PER_CHAT) {
            const e = new Error('turn limit reached'); e.status = 409;
            throw e;
        }
        turns.push({ query, responses });
        return await pb.collection('roundtable_chats').update(chatId, { [field]: turns });
    } catch (err) {
        if (err.status === 409) throw err;
        logger.warn('Failed to append turn to chat', chatId, err.message);
        return null;
    }
}

// ── Prompt builder ───────────────────────────────────────────────────────────

// Splits the model prompt into a (large, stable) cached prefix and a
// (small, per-turn) suffix so the provider's prompt-cache machinery actually
// hits between turns of the same chat. The prefix is the team roster + the
// base instructions; the suffix is "earlier in this round table … now answer
// this new question". OpenAI auto-caches identical prefixes; Anthropic uses
// the explicit cache_control marker on the prefix block.
function buildPrompt({ query, agents, priorTurns = [] }) {
    const agentList = agents.map((a, i) =>
        `${i + 1}. ${a.agent_name} — ${a.name} (${a.category})\n   Skills: ${a.associated_tech_skills || 'general'}\n   Background: ${(a.description || '').slice(0, 120)}`
    ).join('\n\n');

    // Stable across every turn of this chat — cache target.
    const cachedPrefix = `You are moderating a strategic round table discussion where specialist agents each share their perspective in sequence.

Team:
${agentList}

Rules:
- Each agent answers in 3 to 10 short markdown bullet points (use \`- \` dash bullets), grounded in their specific domain
- Use \`**bold**\` to emphasize the 1-3 most important terms, numbers, or actions per response — sparingly, not on every bullet
- Do NOT use markdown headings (no \`#\`, \`##\`, \`###\`) — bullets and bold only
- Each bullet is a tight phrase or one short sentence, not a paragraph
- Speak in first person, natural voice fitting the agent's role
- Agents speaking after the first should briefly acknowledge or build on what was said before them (this can be the first bullet)
- Be practical and specific — no generic advice
- On a follow-up turn, treat the prior conversation as established context: don't repeat earlier points, build on them

The "text" field in the JSON below must contain the markdown bullets verbatim (newlines preserved, bullet markers preserved). Respond with ONLY valid JSON, no markdown fences, no extra text:
{
  "responses": [
    {"name": "<agent_name>", "text": "<markdown bullet response>"},
    ...one entry per agent in the same order as the team list...
  ]
}`;

    // Per-turn body. Prior turns appear here so the agents have memory,
    // but the bytes change between turns (good — we don't waste a cache
    // marker on them and they're not that big).
    let userPrompt;
    if (priorTurns.length === 0) {
        userPrompt = `Topic: "${query}"`;
    } else {
        const turnHistory = priorTurns.map((t, i) => {
            const responses = (t.responses || [])
                .map(r => `  ${r.name}: ${r.text}`)
                .join('\n');
            return `Turn ${i + 1} — user asked: "${t.query}"\n${responses}`;
        }).join('\n\n');
        userPrompt = `Earlier in this round table:

${turnHistory}

Now the user's follow-up question: "${query}"

Each agent should respond to the follow-up while staying consistent with what they said in prior turns.`;
    }

    return { cachedPrefix, userPrompt };
}

// Caps prior turns sent to the model — keep the most recent N turns
// verbatim, drop older. Each turn ≈ 4-5KB of conversation, so 3 turns ≈ 15KB,
// which is the sweet spot between cost and useful memory.
const PRIOR_TURNS_KEPT_VERBATIM = 3;

function trimPriorTurns(turns) {
    if (!Array.isArray(turns) || turns.length === 0) return [];
    return turns.slice(-PRIOR_TURNS_KEPT_VERBATIM);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// System pipeline agents — they don't deliberate at the round table. Old
// chats that historically had them in `team` still load (responses are
// persisted), but new round-table prompts skip them so we stop paying for
// thin Maya/Ananya/Hostinger "perspectives".
const PIPELINE_SYSTEM_IDS = new Set(['uepji0o2teuf29b', '0v9syxxawznp95v', 'hostingerdeploy']);

router.post('/roundtable', async (req, res) => {
    const { query, team: rawTeam, chat_id: chatIdInput, prior_turns: priorTurnsInput, kind: kindInput, uploaded_spec: uploadedSpecInput, phase: rawPhase, partner_id: rawPartnerId } = req.body || {};
    const phase = typeof rawPhase === 'string' && VALID_PHASES.has(rawPhase) ? rawPhase : null;
    const partnerId = typeof rawPartnerId === 'string' && rawPartnerId.trim() ? rawPartnerId.trim() : '';
    // Normalize an uploaded draft spec (only honored when creating a new chat).
    let uploadedSpec = null;
    if (uploadedSpecInput && typeof uploadedSpecInput === 'object' && typeof uploadedSpecInput.text === 'string' && uploadedSpecInput.text.trim()) {
        uploadedSpec = { text: uploadedSpecInput.text.slice(0, 60000), filename: String(uploadedSpecInput.filename || 'spec').slice(0, 200) };
    }

    if (!query || !Array.isArray(rawTeam) || rawTeam.length === 0) {
        return res.status(400).json({ error: 'query and team are required' });
    }
    // kind routes between the domain RT (default) and the tech RT. Tech is
    // a single-shot session right now — multi-turn comes later if useful.
    const kind = kindInput === 'tech' ? 'tech' : 'domain';
    // Tech round table requires an existing chat to append onto. Domain RT
    // creates new chats from scratch; tech RT can only run on a chat that
    // already has domain responses + a spec, so we enforce chat_id.
    if (kind === 'tech' && !chatIdInput) {
        return res.status(400).json({ error: 'tech round table requires chat_id' });
    }
    const team = rawTeam.filter(s => s && !PIPELINE_SYSTEM_IDS.has(s.id));
    if (team.length === 0) {
        return res.status(400).json({ error: 'team must include at least one round-table specialist (Maya/Ananya/Hostinger are pipeline-only)' });
    }

    // Multi-turn mode: the client passes the existing chat's id + the prior
    // turns it has cached locally so the model has context. We validate
    // ownership server-side before appending. Prior turns are trimmed to the
    // most recent N to keep prompt cost bounded.
    const isFollowUp = typeof chatIdInput === 'string'
        && chatIdInput.trim().length > 0
        && Array.isArray(priorTurnsInput)
        && priorTurnsInput.length > 0;
    const priorTurns = isFollowUp ? trimPriorTurns(priorTurnsInput) : [];

    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI not configured' });
    }

    const userId = await getUserIdFromAuth(req);
    const userBYOK = await getUserBYOK(userId);
    const usingUserKey = !!userBYOK;

    // Server-key fallback always uses OpenAI gpt-4o-mini so the free tier is
    // predictable. When the user is paying, honour their provider + model.
    const SERVER_PROVIDER = 'openai';
    const SERVER_DEFAULT_MODEL = 'gpt-4o-mini';

    const providerInUse = usingUserKey ? userBYOK.provider : SERVER_PROVIDER;
    const keyInUse = usingUserKey ? userBYOK.key : OPENAI_API_KEY;
    const modelInUse = usingUserKey
        ? (userBYOK.models?.roundtable || userBYOK.model || getProviderMeta(userBYOK.provider).defaultModel)
        : SERVER_DEFAULT_MODEL;

    let usesAfter = null;
    let remaining = null;

    // Only enforce the free-tier limit when falling back to the server key.
    // Users with their own key bear their own costs and have no app-imposed cap.
    if (!usingUserKey && userId && usageCollectionReady) {
        const record = await getUsageRecord(userId);
        const currentUses = record?.uses || 0;

        if (currentUses >= FREE_LIMIT) {
            return res.status(402).json({
                error: 'limit_reached',
                uses: currentUses,
                limit: FREE_LIMIT,
                remaining: 0,
            });
        }
        usesAfter = currentUses + 1;
        remaining = FREE_LIMIT - usesAfter;
    }

    const { cachedPrefix, userPrompt } = buildPrompt({ query, agents: team, priorTurns });

    let raw;
    let fellBackToServer = false;
    try {
        raw = await chatComplete(providerInUse, {
            key: keyInUse,
            model: modelInUse,
            userPrompt,
            cachedPrefix,
            jsonMode: true,
            meter: { user_id: userId || '', partner_id: partnerId, agent: 'roundtable', context: 'roundtable' },
        });
    } catch (err) {
        // BYOK failed for any reason (401/429/504/timeout/quota) — fall
        // back to the server's OpenAI gpt-4o-mini so the user is never
        // hard-blocked. Counts toward the free tier on the way out.
        const isBYOKFailure = usingUserKey && (
            err.status === 401 || err.status === 429 || err.status === 504 ||
            err.cause?.code === 'ETIMEDOUT' || err.cause?.code === 'ECONNRESET'
        );
        if (isBYOKFailure) {
            const causeMsg = err.cause?.message || err.cause?.code || err.message;
            logger.warn(`roundtable BYOK failed (provider=${providerInUse} model=${modelInUse} cause=${causeMsg}) — falling back to server gpt-4o-mini`);
            try {
                raw = await chatComplete(SERVER_PROVIDER, {
                    key: OPENAI_API_KEY,
                    model: SERVER_DEFAULT_MODEL,
                    userPrompt,
                    cachedPrefix,
                    jsonMode: true,
                    meter: { user_id: userId || '', partner_id: partnerId, agent: 'roundtable', context: 'roundtable' },
                });
                fellBackToServer = true;
            } catch (fallbackErr) {
                const cm = fallbackErr.cause?.message || fallbackErr.cause?.code || '(no cause)';
                logger.error(`roundtable server fallback also failed: ${fallbackErr.message} | cause=${cm}`);
                return res.status(500).json({ error: 'Round table call failed (BYOK + server fallback both failed)' });
            }
        } else {
            const causeMsg = err.cause?.message || err.cause?.code || (err.cause ? String(err.cause) : '(no cause)');
            logger.error(`roundtable provider call failed: ${err.message} | cause=${causeMsg} | provider=${providerInUse} model=${modelInUse}`);
            return res.status(500).json({ error: 'Round table call failed' });
        }
    }

    try {
        const parsed = JSON.parse(raw || '{}');

        if (!Array.isArray(parsed.responses)) {
            throw new Error('Unexpected response shape from provider');
        }

        let chatId = null;
        let turnLimitReached = false;
        if (userId) {
            // Free-tier usage only counts when the server key was used
            if (!usingUserKey && usageCollectionReady) incrementUsage(userId);
            if (chatsCollectionReady) {
                if (kind === 'tech') {
                    // Tech RT appends to tech_turns AND stamps the tech_team
                    // on the chat row for later restoration. Always treats
                    // the call as a follow-up because the chat already exists.
                    try {
                        const appended = await appendChatTurn(chatIdInput, userId, query, parsed.responses, 'tech');
                        chatId = appended?.id || null;
                        // Best-effort: stamp tech_team so the UI can rehydrate it.
                        await pb.collection('roundtable_chats').update(chatIdInput, { tech_team: team }).catch(() => {});
                    } catch (err) {
                        if (err.status === 409) {
                            turnLimitReached = true;
                            chatId = chatIdInput;
                        } else throw err;
                    }
                } else if (isFollowUp) {
                    try {
                        const appended = await appendChatTurn(chatIdInput, userId, query, parsed.responses, 'domain');
                        chatId = appended?.id || null;
                    } catch (err) {
                        if (err.status === 409) {
                            turnLimitReached = true;
                            chatId = chatIdInput;
                        } else throw err;
                    }
                } else {
                    const saved = await saveChat(userId, query, team, parsed.responses, uploadedSpec, phase);
                    chatId = saved?.id || null;
                }
            }
        }

        logger.info(`roundtable[${kind}]: ${isFollowUp ? `[turn ${priorTurns.length + 1}]` : '[new]'} "${query.slice(0, 60)}" → ${parsed.responses.length} responses (user: ${userId || 'anon'}, key: ${usingUserKey ? 'user-byok' : 'server'}, remaining: ${remaining ?? 'unlimited'})`);

        res.json({
            responses: parsed.responses,
            chatId,
            is_follow_up: isFollowUp,
            turn_limit_reached: turnLimitReached,
            using_user_key: usingUserKey,
            // Flag set when BYOK failed and we used the server key instead.
            // Client surfaces a small banner so the user knows their key
            // needs attention without hard-blocking the request.
            byok_fell_back: fellBackToServer,
            ...(remaining !== null ? { remaining, uses: usesAfter, limit: FREE_LIMIT } : {}),
        });
    } catch (err) {
        logger.error('roundtable error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Per-agent 1:1 follow-up threads ─────────────────────────────────────────
//
// The user can drill into any single agent's round-table response and chat
// with just that agent. Each agent's thread is stored on the chat row as
// agent_threads[<agent_name>] = [{ role, text, ts }, …]. The route below
// rebuilds the prompt from: the agent's persona, the original round-table
// query + their response, and the running 1:1 transcript.

const AGENT_THREAD_TURN_CAP = 10;       // user turns per agent (each turn = 1 user + 1 assistant)
const AGENT_THREAD_MSG_MAX  = 4000;     // chars per user message

function buildAgentThreadPrompt({ agent, originalQuery, originalResponse, thread, message }) {
    const systemPrompt = `You are ${agent.agent_name} — ${agent.name} (${agent.category}).
Skills: ${agent.associated_tech_skills || 'general'}
Background: ${(agent.description || '').slice(0, 240)}

You just participated in a round-table discussion with the user and a few peers from your platform. The user now wants to follow up with YOU specifically — one-on-one. Stay in character, draw on the original discussion, and keep the conversation grounded in your specific domain.

Rules:
- Reply in 3 to 10 short markdown bullet points (use \`- \` dash bullets), each a tight phrase or one short sentence
- Use \`**bold**\` to emphasize the 1-3 most important terms, numbers, or actions per response — sparingly, not on every bullet
- Do NOT use markdown headings (no \`#\`, \`##\`, \`###\`) — bullets and bold only
- Speak in first person, natural voice fitting your role
- Be practical and specific — no generic advice
- Reference your earlier round-table answer when relevant; don't repeat it verbatim
- If the user asks something outside your domain, say so briefly and suggest who on the team would know better`;

    // Transcript: original RT framing, then prior 1:1 turns, then the new
    // user message. Plain prose so any provider/model can read it without
    // needing structured-messages mode.
    const priorTranscript = (thread || []).map(t => {
        const tag = t.role === 'user' ? 'User' : agent.agent_name;
        return `${tag}: ${t.text}`;
    }).join('\n\n');

    const userPrompt = `Round table context — the user originally asked:
"${originalQuery}"

Your round-table response was:
"${originalResponse || '(no recorded response — answer from your persona alone)'}"

${priorTranscript ? `Conversation so far:\n\n${priorTranscript}\n\n` : ''}User's next message:
"${message}"

Reply as ${agent.agent_name} in markdown bullet points (no JSON, no markdown headings — just \`- \` dash bullets and \`**bold**\` for emphasis).`;

    return { systemPrompt, userPrompt };
}

// Look up an agent by name across the chat's domain team + tech team. We
// match agent_name first (the canonical display name in responses) and fall
// back to name (the underlying skill name).
function findAgentByName(chat, agentName) {
    const haystacks = [
        ...(Array.isArray(chat.team) ? chat.team : []),
        ...(Array.isArray(chat.tech_team) ? chat.tech_team : []),
    ];
    return haystacks.find(a => a?.agent_name === agentName || a?.name === agentName) || null;
}

// Find this agent's most recent RT response across all turns (domain + tech).
// Lets the 1:1 reference what they actually said in the discussion instead
// of starting from a blank slate.
function findAgentLatestResponse(chat, agentName) {
    const allTurns = [
        ...(Array.isArray(chat.turns) ? chat.turns : []),
        ...(Array.isArray(chat.tech_turns) ? chat.tech_turns : []),
    ];
    for (let i = allTurns.length - 1; i >= 0; i--) {
        const t = allTurns[i];
        const r = (t.responses || []).find(r => r?.name === agentName);
        if (r?.text) return { text: r.text, query: t.query };
    }
    // Legacy chats: only top-level responses present.
    const r = Array.isArray(chat.responses) ? chat.responses.find(r => r?.name === agentName) : null;
    return r?.text ? { text: r.text, query: chat.query } : null;
}

router.post('/roundtable/chats/:id/agent-threads/:agentName', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const chatId = req.params.id;
    const agentName = decodeURIComponent(req.params.agentName || '').trim();
    if (!agentName) return res.status(400).json({ error: 'agent name is required' });

    const message = String(req.body?.message || '').trim().slice(0, AGENT_THREAD_MSG_MAX);
    if (!message) return res.status(400).json({ error: 'message is required' });

    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OpenAI not configured' });

    let chat;
    try {
        chat = await pb.collection('roundtable_chats').getOne(chatId);
    } catch {
        return res.status(404).json({ error: 'chat not found' });
    }
    if (chat.user_id !== userId) return res.status(403).json({ error: 'not your chat' });

    const agent = findAgentByName(chat, agentName);
    if (!agent) return res.status(404).json({ error: `agent ${agentName} is not part of this chat` });

    const existingThreads = (chat.agent_threads && typeof chat.agent_threads === 'object') ? chat.agent_threads : {};
    const thread = Array.isArray(existingThreads[agentName]) ? existingThreads[agentName].slice() : [];
    const userTurnsSoFar = thread.filter(t => t.role === 'user').length;
    if (userTurnsSoFar >= AGENT_THREAD_TURN_CAP) {
        return res.status(409).json({
            error: 'thread_full',
            detail: `This 1:1 with ${agentName} has hit the ${AGENT_THREAD_TURN_CAP}-turn cap. Start a new round table to keep branching this thread.`,
            cap: AGENT_THREAD_TURN_CAP,
        });
    }

    const original = findAgentLatestResponse(chat, agentName);
    const userBYOK = await getUserBYOK(userId);
    const usingUserKey = !!userBYOK;
    const SERVER_PROVIDER = 'openai';
    const SERVER_DEFAULT_MODEL = 'gpt-4o-mini';

    let providerInUse = usingUserKey ? userBYOK.provider : SERVER_PROVIDER;
    let keyInUse      = usingUserKey ? userBYOK.key : OPENAI_API_KEY;
    let modelInUse    = usingUserKey
        ? (userBYOK.models?.roundtable || userBYOK.model || getProviderMeta(userBYOK.provider).defaultModel)
        : SERVER_DEFAULT_MODEL;
    let fellBackToServer = false;

    const { systemPrompt, userPrompt } = buildAgentThreadPrompt({
        agent,
        originalQuery: original?.query || chat.query || '',
        originalResponse: original?.text || '',
        thread,
        message,
    });

    let reply;
    try {
        reply = await chatComplete(providerInUse, {
            key: keyInUse,
            model: modelInUse,
            systemPrompt,
            userPrompt,
            meter: { user_id: userId, agent: agentName, context: 'agent-thread' },
        });
    } catch (err) {
        // Same soft-fall policy as /roundtable: any BYOK failure (auth,
        // quota, network) silently retries on the server's gpt-4o-mini so
        // the user gets a reply instead of a dead-end.
        const isBYOKFailure = usingUserKey && (
            err.status === 401 || err.status === 429 || err.status === 504 ||
            err.cause?.code === 'ETIMEDOUT' || err.cause?.code === 'ECONNRESET'
        );
        if (!isBYOKFailure) {
            const causeMsg = err.cause?.message || err.cause?.code || err.message;
            logger.error(`agent-thread call failed for ${agentName}: ${err.message} | cause=${causeMsg}`);
            return res.status(500).json({ error: 'Agent reply failed' });
        }
        const causeMsg = err.cause?.message || err.cause?.code || err.message;
        logger.warn(`agent-thread BYOK failed (provider=${providerInUse}, cause=${causeMsg}) — falling back to server gpt-4o-mini`);
        providerInUse = SERVER_PROVIDER;
        keyInUse      = OPENAI_API_KEY;
        modelInUse    = SERVER_DEFAULT_MODEL;
        fellBackToServer = true;
        try {
            reply = await chatComplete(providerInUse, {
                key: keyInUse,
                model: modelInUse,
                systemPrompt,
                userPrompt,
                meter: { user_id: userId, agent: agentName, context: 'agent-thread' },
            });
        } catch (fallbackErr) {
            logger.error(`agent-thread fallback also failed: ${fallbackErr.message}`);
            return res.status(500).json({ error: 'Agent reply failed (BYOK + server fallback both failed)' });
        }
    }

    const trimmed = (reply || '').trim();
    if (!trimmed) return res.status(502).json({ error: 'empty reply from model' });

    const now = new Date().toISOString();
    const userTurn      = { role: 'user',      text: message, ts: now };
    const assistantTurn = { role: 'assistant', text: trimmed, ts: now };
    const nextThread    = [...thread, userTurn, assistantTurn];
    const nextThreads   = { ...existingThreads, [agentName]: nextThread };

    try {
        await pb.collection('roundtable_chats').update(chatId, { agent_threads: nextThreads });
    } catch (err) {
        // Persistence failure shouldn't lose the reply we already paid for —
        // surface it to the client; the UI will show it for the rest of
        // this session even if reload won't have it.
        logger.warn(`agent-thread persist failed for chat ${chatId}: ${err.message}`);
    }

    logger.info(`agent-thread: chat=${chatId} agent=${agentName} turn=${userTurnsSoFar + 1} (${usingUserKey && !fellBackToServer ? 'user-byok' : 'server'})`);

    res.json({
        agent_name: agentName,
        message: assistantTurn,
        user_message: userTurn,
        thread: nextThread,
        turns_used: userTurnsSoFar + 1,
        turns_cap: AGENT_THREAD_TURN_CAP,
        byok_fell_back: fellBackToServer,
    });
});

router.get('/roundtable/usage', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const userBYOK = await getUserBYOK(userId);
    if (userBYOK) {
        return res.json({ has_user_key: true, unlimited: true });
    }

    await ensureUsageCollection();
    const record = await getUsageRecord(userId);
    const uses   = record?.uses || 0;
    res.json({ has_user_key: false, uses, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - uses) });
});

router.get('/roundtable/chats', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    await ensureChatsCollection();
    try {
        const list = await pb.collection('roundtable_chats').getList(1, 50, {
            filter: `user_id = "${userId}"`,
            sort: '-created',
        });
        res.json({
            chats: list.items.map(c => {
                // Adapter for legacy chats: those rows have only top-level
                // query+responses (no turns field). Wrap them as a one-turn
                // thread so the client treats every chat uniformly. We also
                // flag legacy=true so the UI can show a "start a new chat to
                // continue" banner — appending to a legacy chat would
                // double-write into the schema migration boundary.
                const turns = Array.isArray(c.turns) && c.turns.length > 0
                    ? c.turns
                    : [{ query: c.query, responses: c.responses || [] }];
                const legacy = !(Array.isArray(c.turns) && c.turns.length > 0);
                return {
                    id: c.id,
                    query: c.query,
                    team: c.team,
                    responses: c.responses,
                    turns,
                    legacy,
                    // Tech round table — only populated for chats that ran the
                    // "Convene tech team" flow. Empty array / null otherwise.
                    tech_team:  Array.isArray(c.tech_team)  ? c.tech_team  : [],
                    tech_turns: Array.isArray(c.tech_turns) ? c.tech_turns : [],
                    // { text, filename } when this chat was seeded from an upload.
                    uploaded_spec: c.uploaded_spec || null,
                    // { [agent_name]: [{role, text, ts}] } — per-agent 1:1
                    // follow-up threads. Empty object on chats that haven't
                    // used the drill-in feature.
                    agent_threads: c.agent_threads && typeof c.agent_threads === 'object' ? c.agent_threads : {},
                    tool_results: c.tool_results || {},
                    created: c.created,
                };
            }),
        });
    } catch (err) {
        logger.error('list chats error:', err.message);
        res.status(500).json({ error: err.message, chats: [] });
    }
});

// The fields of a creative-agent result worth persisting onto a chat so it can
// be re-opened later. We deliberately drop `trace` (only useful live) to keep
// the JSON small — the rest is enough to rehydrate the panel and re-serve the
// preview/download from the (now persistent) workspace volume.
function trimToolResult(r) {
    if (!r || typeof r !== 'object') return null;
    // Persist Maya's design brief text (styles + EVERY screen) so Ananya can
    // inherit the full flow on a later build even after the design workspace
    // expires. Cap the sizes per-field to keep the chat JSON small — 8 screens
    // × 2400 chars + 4000 char styles ≈ 24KB worst case, still well below any
    // PocketBase row limit.
    let designBrief = null;
    if (r.design_brief && typeof r.design_brief === 'object') {
        const rawScreens = Array.isArray(r.design_brief.screens) ? r.design_brief.screens : [];
        const screens = rawScreens.slice(0, 8).map(s => ({
            name: typeof s?.name === 'string' ? s.name.slice(0, 80)   : '',
            html: typeof s?.html === 'string' ? s.html.slice(0, 2400) : '',
        })).filter(s => s.name && s.html);
        designBrief = {
            // Styles cap is matched to the API-side DESIGN_BRIEF_STYLES_CAP
            // (24KB). Maya's stylesheets typically run 15–18KB, so the old
            // 4KB cap truncated the bulk of her class definitions and the
            // inline-fallback Ananya run rendered as unstyled HTML.
            styles:        typeof r.design_brief.styles === 'string'        ? r.design_brief.styles.slice(0, 24000)       : null,
            screens,
            sample_screen: typeof r.design_brief.sample_screen === 'string' ? r.design_brief.sample_screen.slice(0, 2400) : (screens[0]?.html || null),
        };
    }
    return {
        session_id:    r.session_id,
        agent_id:      r.agent_id,
        agent_name:    r.agent_name,
        summary:       typeof r.summary === 'string' ? r.summary.slice(0, 20000) : '',
        files:         Array.isArray(r.files) ? r.files.slice(0, 200) : [],
        engine:        r.engine || null,
        download_url:  r.download_url,
        preview_url:   r.preview_url,
        design_applied: typeof r.design_applied === 'boolean' ? r.design_applied : undefined,
        design_brief:   designBrief,
        deploy:         r.deploy || undefined,   // VPS deploy result (Ananya → Hostinger)
        saved_at:      new Date().toISOString(),
    };
}

// POST /roundtable/chats/:id/tool-results — merge one creative-agent output
// (Maya mockups, Ananya build, Kavya email, Tara social, Spec Engineer doc)
// into the chat under a stable key. Idempotent per key: re-running a tool
// overwrites that slot.
const VALID_TOOL_KEYS = new Set(['mockup', 'build', 'email', 'social', 'spec']);

// Spec is plain text plus a tiny envelope — much simpler shape than the
// creative-agent results. Capped at 60KB so a runaway model can't bloat the
// row, but Maya's 16KB stylesheet + 5×2KB screens is still a fraction of this.
function trimSpecResult(r) {
    if (!r || typeof r !== 'object') return null;
    const text = typeof r.text === 'string' ? r.text.slice(0, 60000) : '';
    if (!text) return null;
    return {
        text,
        authors:      Array.isArray(r.authors) ? r.authors.slice(0, 20).map(a => String(a).slice(0, 60)) : [],
        generated_at: typeof r.generated_at === 'string' ? r.generated_at : new Date().toISOString(),
        edited_at:    typeof r.edited_at === 'string' ? r.edited_at : null,
        engine:       r.engine || null,
    };
}

router.post('/roundtable/chats/:id/tool-results', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { tool, result } = req.body || {};
    if (!VALID_TOOL_KEYS.has(tool)) {
        return res.status(400).json({ error: 'tool must be one of mockup|build|email|social|spec' });
    }
    const trimmed = tool === 'spec' ? trimSpecResult(result) : trimToolResult(result);
    if (!trimmed) return res.status(400).json({ error: 'result is required' });

    await ensureChatsCollection();
    try {
        const chat = await pb.collection('roundtable_chats').getOne(req.params.id);
        if (chat.user_id !== userId) return res.status(403).json({ error: 'forbidden' });

        const merged = { ...(chat.tool_results || {}), [tool]: trimmed };
        await pb.collection('roundtable_chats').update(req.params.id, { tool_results: merged });
        res.json({ ok: true, tool_results: merged });
    } catch (err) {
        logger.error('save tool-result error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/roundtable/chats/:id', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
        const chat = await pb.collection('roundtable_chats').getOne(req.params.id);
        if (chat.user_id !== userId) return res.status(403).json({ error: 'forbidden' });
        await pb.collection('roundtable_chats').delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
