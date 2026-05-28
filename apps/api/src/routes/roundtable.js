import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FREE_LIMIT = 10;

// ── Usage collection bootstrap ──────────────────────────────────────────────

let usageCollectionReady = false;

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

ensureUsageCollection();

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

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/roundtable', async (req, res) => {
    const { query, team } = req.body || {};

    if (!query || !Array.isArray(team) || team.length === 0) {
        return res.status(400).json({ error: 'query and team are required' });
    }

    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI not configured' });
    }

    // Identify user and check usage limit
    const userId = getUserIdFromHeader(req.headers.authorization);
    let usesAfter = null;
    let remaining = null;

    if (userId && usageCollectionReady) {
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

        // Optimistically compute post-request values
        usesAfter  = currentUses + 1;
        remaining  = FREE_LIMIT - usesAfter;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0.8,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: buildPrompt(query, team) }],
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI error ${response.status}: ${err}`);
        }

        const data   = await response.json();
        const raw    = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed.responses)) {
            throw new Error('Unexpected response shape from OpenAI');
        }

        // Increment usage only after a successful call
        if (userId && usageCollectionReady) {
            incrementUsage(userId); // fire-and-forget
        }

        logger.info(`roundtable: "${query}" → ${parsed.responses.length} responses (user: ${userId || 'anon'}, remaining: ${remaining ?? 'unlimited'})`);

        res.json({
            responses: parsed.responses,
            ...(remaining !== null ? { remaining, uses: usesAfter, limit: FREE_LIMIT } : {}),
        });
    } catch (err) {
        logger.error('roundtable error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Usage status endpoint (GET)
router.get('/roundtable/usage', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    await ensureUsageCollection();
    const record = await getUsageRecord(userId);
    const uses   = record?.uses || 0;

    res.json({ uses, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - uses) });
});

export default router;
