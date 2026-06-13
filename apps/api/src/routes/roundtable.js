import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserBYOK } from './user-keys.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';

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
const CHAT_FIELDS = [
    { type: 'text',     name: 'user_id',      required: true },
    { type: 'text',     name: 'query',        required: true, max: 2000 },
    { type: 'json',     name: 'team',         maxSize: 100000 },
    { type: 'json',     name: 'responses',    maxSize: 200000 },
    { type: 'json',     name: 'tool_results', maxSize: 600000 },
    { type: 'autodate', name: 'created',      onCreate: true,  onUpdate: false },
    { type: 'autodate', name: 'updated',      onCreate: true,  onUpdate: true  },
];

async function ensureChatsCollection() {
    if (chatsCollectionReady) return;
    try {
        const existing = await pb.collections.getOne('roundtable_chats');
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = CHAT_FIELDS.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            try {
                await pb.collections.update('roundtable_chats', {
                    fields: [...existing.fields, ...missing],
                });
                logger.info(`roundtable_chats: added fields [${missing.map(f => f.name).join(', ')}]`);
            } catch (err) {
                logger.warn('Could not add roundtable_chats fields:', err.message);
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

function getUserIdFromHeader(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(authHeader.slice(7).split('.')[1], 'base64url').toString('utf8')
        );
        return payload.id || null;
    } catch {
        return null;
    }
}

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

async function saveChat(userId, query, team, responses) {
    try {
        return await pb.collection('roundtable_chats').create({
            user_id: userId,
            query,
            team,
            responses,
        });
    } catch (err) {
        logger.warn('Failed to save chat for', userId, err.message);
        return null;
    }
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(query, agents) {
    const agentList = agents.map((a, i) =>
        `${i + 1}. ${a.agent_name} — ${a.name} (${a.category})\n   Skills: ${a.associated_tech_skills || 'general'}\n   Background: ${(a.description || '').slice(0, 120)}`
    ).join('\n\n');

    return `You are moderating a strategic round table discussion where specialist agents each share their perspective in sequence.

Topic: "${query}"

Team:
${agentList}

Rules:
- Each agent gives 3-5 sentences grounded in their specific domain
- Agents speaking after the first should briefly acknowledge or build on what was said before them
- Be practical and specific — no generic advice
- Use natural first-person speech fitting their role

Respond with ONLY valid JSON, no markdown fences, no extra text:
{
  "responses": [
    {"name": "<agent_name>", "text": "<response>"},
    ...one entry per agent in the same order as the team list...
  ]
}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/roundtable', async (req, res) => {
    const { query, team } = req.body || {};

    if (!query || !Array.isArray(team) || team.length === 0) {
        return res.status(400).json({ error: 'query and team are required' });
    }

    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI not configured' });
    }

    const userId = getUserIdFromHeader(req.headers.authorization);
    const userBYOK = await getUserBYOK(userId);
    const usingUserKey = !!userBYOK;

    // Server-key fallback always uses OpenAI gpt-4o-mini so the free tier is
    // predictable. When the user is paying, honour their provider + model.
    const SERVER_PROVIDER = 'openai';
    const SERVER_DEFAULT_MODEL = 'gpt-4o-mini';

    const providerInUse = usingUserKey ? userBYOK.provider : SERVER_PROVIDER;
    const keyInUse = usingUserKey ? userBYOK.key : OPENAI_API_KEY;
    const modelInUse = usingUserKey
        ? (userBYOK.model || getProviderMeta(userBYOK.provider).defaultModel)
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

    let raw;
    try {
        raw = await chatComplete(providerInUse, {
            key: keyInUse,
            model: modelInUse,
            userPrompt: buildPrompt(query, team),
            jsonMode: true,
        });
    } catch (err) {
        // The dispatcher attaches a `status` field for upstream HTTP errors.
        // Treat 401/429 from the user's key as a soft, actionable failure.
        if (usingUserKey && (err.status === 401 || err.status === 429)) {
            const providerLabel = getProviderMeta(userBYOK.provider).label;
            return res.status(402).json({
                error: 'user_key_failed',
                detail: err.status === 401
                    ? `Your saved ${providerLabel} key was rejected. Please update it on your profile.`
                    : `Your ${providerLabel} account is out of quota or rate-limited. Check billing and try again.`,
                status: err.status,
            });
        }
        logger.error('roundtable provider call failed:', err.message);
        return res.status(500).json({ error: 'Round table call failed' });
    }

    try {
        const parsed = JSON.parse(raw || '{}');

        if (!Array.isArray(parsed.responses)) {
            throw new Error('Unexpected response shape from provider');
        }

        let chatId = null;
        if (userId) {
            // Free-tier usage only counts when the server key was used
            if (!usingUserKey && usageCollectionReady) incrementUsage(userId);
            if (chatsCollectionReady) {
                const saved = await saveChat(userId, query, team, parsed.responses);
                chatId = saved?.id || null;
            }
        }

        logger.info(`roundtable: "${query}" → ${parsed.responses.length} responses (user: ${userId || 'anon'}, key: ${usingUserKey ? 'user-byok' : 'server'}, remaining: ${remaining ?? 'unlimited'})`);

        res.json({
            responses: parsed.responses,
            chatId,
            using_user_key: usingUserKey,
            ...(remaining !== null ? { remaining, uses: usesAfter, limit: FREE_LIMIT } : {}),
        });
    } catch (err) {
        logger.error('roundtable error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/roundtable/usage', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
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
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    await ensureChatsCollection();
    try {
        const list = await pb.collection('roundtable_chats').getList(1, 50, {
            filter: `user_id = "${userId}"`,
            sort: '-created',
        });
        res.json({
            chats: list.items.map(c => ({
                id: c.id,
                query: c.query,
                team: c.team,
                responses: c.responses,
                tool_results: c.tool_results || {},
                created: c.created,
            })),
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
            styles:        typeof r.design_brief.styles === 'string'        ? r.design_brief.styles.slice(0, 4000)        : null,
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
// (Maya mockups, Ananya build, Kavya email, Tara social) into the chat under a
// stable key ('mockup' | 'build' | 'email' | 'social'). Idempotent per key:
// re-running a tool overwrites that slot.
const VALID_TOOL_KEYS = new Set(['mockup', 'build', 'email', 'social']);
router.post('/roundtable/chats/:id/tool-results', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { tool, result } = req.body || {};
    if (!VALID_TOOL_KEYS.has(tool)) {
        return res.status(400).json({ error: 'tool must be one of mockup|build|email|social' });
    }
    const trimmed = trimToolResult(result);
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
    const userId = getUserIdFromHeader(req.headers.authorization);
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
