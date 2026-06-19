// Spec Engineer — synthesizes a round-table chat into a structured spec
// document. One-shot LLM call (no tools, no streaming). Output follows the
// fixed template documented in SPEC_SYSTEM_PROMPT so the UI can render and
// edit it consistently.
//
// Flow:
//   POST /api/spec { chat_id }
//     -> server reads chat (query + turns/responses)
//     -> builds a single prompt with the round-table transcript
//     -> calls chatComplete with cached team-roster prefix
//     -> returns { spec_text, authors }
//     -> client persists via PUT /roundtable/chats/:id/spec
//
// Saving + editing the spec is handled by the existing tool-results endpoint
// under the key "spec". This route only produces the first draft.

import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';
import { getUserBYOK } from './user-keys.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERVER_PROVIDER = 'openai';
const SERVER_DEFAULT_MODEL = 'gpt-4o-mini';

const router = Router();

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

// Spec template — frozen. The agent must output EXACTLY these sections so
// the UI can parse/render predictably and the user's edits don't break
// downstream consumers (Maya reads the proposed-approach block in particular).
const SPEC_SYSTEM_PROMPT = `You are the Spec Engineer. After a round table of specialist agents has discussed a user's idea, you turn that conversation into a single, decision-ready spec document that the design + build agents can act on.

Output MUST follow this exact template, in this order, using these exact section headings. Markdown only — no code fences around the whole doc, no commentary before or after.

Title: <one-line title in Title Case>

Author: <comma-separated agent names — every agent who spoke in the round table>
Status: Draft
Date: <today's date in YYYY-MM-DD>

## Problem

2–5 sentences describing the user's situation and the concrete pain. Pull from what the round table actually surfaced, not generic framing.

## Goals

- <3–5 specific, measurable goals>
- <each one starts with a verb>

## Non-goals

- <2–4 things explicitly out of scope>
- <each one a single line>

## Requirements

- **Must:** <hard constraint 1>
- **Must:** <hard constraint 2>
- **Should:** <strong preference 1>
- **Won't (now):** <explicit deferral>

## Proposed approach

3–6 sentences describing how to build this. Concrete: what changes, what gets added, what the user flow is. If the round table proposed a multi-step approach, capture the steps. End with **Alternatives considered:** and 1–3 alternatives with one-sentence rationales for why they were rejected.

## Failure modes

- <what breaks under load / on bad input / on dependency failure>
- <how the system degrades gracefully>

## Success criteria

- <observable outcome 1, measurable>
- <observable outcome 2, measurable>

## Open questions

- <decision the user still needs to make>
- <follow-up that affects scope>

## Rollout

2–4 sentences on how to ship safely: flag, internal first, staged %, and a one-sentence backout plan.

RULES:
- Stay grounded in what the agents said. Don't invent functionality nobody discussed.
- Where the round table disagreed, pick the strongest concrete approach and note the alternative under "Alternatives considered."
- Be specific. "Improve UX" is not a goal; "let a user revoke their key in one click from the dashboard" is.
- Authors line must list every agent that contributed a perspective. Order them as they appeared.`;

function buildSpecUserPrompt(chat) {
    // Pull every turn's responses — multi-turn chats accumulate context that
    // should all flow into the spec.
    const turns = Array.isArray(chat.turns) && chat.turns.length > 0
        ? chat.turns
        : [{ query: chat.query, responses: chat.responses || [] }];

    const transcript = turns.map((t, i) => {
        const header = turns.length > 1 ? `### Turn ${i + 1}\nUser asked: "${t.query}"\n` : `User asked: "${t.query}"\n`;
        const replies = (t.responses || []).map(r => `**${r.name}:** ${r.text}`).join('\n\n');
        return `${header}\n${replies}`;
    }).join('\n\n---\n\n');

    return `Synthesize the spec from this round-table conversation:\n\n${transcript}`;
}

function collectAuthors(chat) {
    const turns = Array.isArray(chat.turns) && chat.turns.length > 0
        ? chat.turns
        : [{ responses: chat.responses || [] }];
    const seen = new Set();
    const order = [];
    for (const t of turns) {
        for (const r of (t.responses || [])) {
            if (r?.name && !seen.has(r.name)) {
                seen.add(r.name);
                order.push(r.name);
            }
        }
    }
    return order;
}

router.post('/spec', async (req, res) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const chatId = (req.body?.chat_id || '').trim();
    if (!chatId) return res.status(400).json({ error: 'chat_id is required' });

    let chat;
    try {
        chat = await pb.collection('roundtable_chats').getOne(chatId);
    } catch {
        return res.status(404).json({ error: 'chat not found' });
    }
    if (chat.user_id !== userId) return res.status(403).json({ error: 'not your chat' });

    const authors = collectAuthors(chat);
    if (authors.length === 0) {
        return res.status(400).json({ error: 'this chat has no responses yet — wait for the round table to finish' });
    }

    // Provider routing follows the same rules as /api/roundtable.
    const userBYOK = await getUserBYOK(userId);
    const usingUserKey = !!userBYOK;
    const provider = usingUserKey ? userBYOK.provider : SERVER_PROVIDER;
    const key      = usingUserKey ? userBYOK.key      : OPENAI_API_KEY;
    const model    = usingUserKey
        ? (userBYOK.model || getProviderMeta(userBYOK.provider).defaultModel)
        : SERVER_DEFAULT_MODEL;

    try {
        const userPrompt = buildSpecUserPrompt(chat);
        const spec_text = await chatComplete(provider, {
            key,
            model,
            systemPrompt: SPEC_SYSTEM_PROMPT,
            userPrompt,
        });
        logger.info(`spec: chat=${chatId} authors=${authors.length} chars=${spec_text.length} provider=${provider}`);
        res.json({
            spec_text,
            authors,
            generated_at: new Date().toISOString(),
            engine: { provider, model },
        });
    } catch (err) {
        if (usingUserKey && (err.status === 401 || err.status === 429)) {
            const providerLabel = getProviderMeta(userBYOK.provider).label;
            return res.status(402).json({
                error: 'user_key_failed',
                detail: err.status === 401
                    ? `Your saved ${providerLabel} key was rejected.`
                    : `Your ${providerLabel} account is out of quota.`,
            });
        }
        logger.error(`spec error chat=${chatId}: ${err.message}`);
        res.status(500).json({ error: 'Spec generation failed' });
    }
});

export default router;
