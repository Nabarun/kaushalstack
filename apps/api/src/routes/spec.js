// Spec Engineer — synthesizes a round-table chat into a structured spec
// document. One LLM call plus a bounded repair pass, wrapped in a
// deterministic quality gate (see ../spec/guard.js). Output follows the
// fixed template documented in SPEC_SYSTEM_PROMPT so the UI can render and
// edit it consistently.
//
// Flow:
//   POST /api/spec { chat_id }
//     -> server reads chat (query + turns/responses)
//     -> builds a single prompt with the round-table transcript
//     -> calls chatComplete with cached team-roster prefix
//     -> GUARD: stamp Date/Author in code, check sections, and (in combine
//        mode) verify every draft item survived; one repair pass fixes what
//        it can, anything still missing is appended verbatim — the combine
//        is loss-free by construction.
//     -> returns { spec_text, authors, quality }
//     -> client persists via PUT /roundtable/chats/:id/spec
//
// Saving + editing the spec is handled by the existing tool-results endpoint
// under the key "spec". This route only produces the first draft.

import { Router } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { chatComplete, getProviderMeta } from '../providers/index.js';
import { getUserBYOK } from './user-keys.js';
import { getUserIdFromAuth } from '../utils/auth.js';
import { verifiedPartnerId } from '../partner/membership.js';
import {
    todayISO, stampMetadata, missingSections,
    coverageReport, appendCarryover, unsourcedNumbers,
} from '../spec/guard.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERVER_PROVIDER = 'openai';
// SPEC_MODEL lets you route spec synthesis to a stronger model than the chat
// default without touching code — combine-mode restatement was partly a
// gpt-4o-mini capability problem. e.g. SPEC_MODEL=gpt-4o
const SERVER_DEFAULT_MODEL = process.env.SPEC_MODEL || 'gpt-4o-mini';
const UPLOAD_TEXT_CAP = 60000; // chars — keep prompts bounded regardless of file size

const router = Router();

// ── Spec file upload → plain text ────────────────────────────────────────────
// One endpoint handles every format the user might drop in: .md/.txt/.json read
// straight off the buffer, .pdf via pdf-parse, .docx via mammoth. Returns the
// extracted text so the client can recommend a team from it and seed the round
// table. In-memory only (multer memoryStorage) — nothing touches disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function extractText(file) {
    const name = (file.originalname || 'spec').toLowerCase();
    const ext  = name.includes('.') ? name.split('.').pop() : '';
    const mt   = file.mimetype || '';
    if (ext === 'pdf' || mt === 'application/pdf') {
        const data = await pdfParse(file.buffer);
        return data.text || '';
    }
    if (ext === 'docx' || mt.includes('officedocument.wordprocessingml')) {
        const { value } = await mammoth.extractRawText({ buffer: file.buffer });
        return value || '';
    }
    if (ext === 'doc' || mt === 'application/msword') {
        const e = new Error('Legacy .doc isn\'t supported — save it as .docx (or paste the text).'); e.status = 415; throw e;
    }
    // Everything else: treat as UTF-8 text (.md, .txt, .markdown, .json, .csv, .yaml…).
    return file.buffer.toString('utf8');
}

router.post('/spec/upload', upload.single('file'), async (req, res) => {
    // Public, like /api/recommend — it only extracts text and hands it back to
    // the caller; nothing is stored and no account data is touched. The chat it
    // later seeds still requires a signed-in user.
    if (!req.file) return res.status(400).json({ error: 'no file uploaded (expected field "file")' });
    try {
        let text = (await extractText(req.file) || '').trim();
        if (!text) return res.status(422).json({ error: 'could not read any text from that file' });
        const truncated = text.length > UPLOAD_TEXT_CAP;
        if (truncated) text = text.slice(0, UPLOAD_TEXT_CAP);
        logger.info(`spec upload: file=${req.file.originalname} chars=${text.length}${truncated ? ' (truncated)' : ''}`);
        res.json({ text, filename: req.file.originalname, chars: text.length, truncated });
    } catch (err) {
        logger.warn(`spec upload failed: ${err.message}`);
        res.status(err.status || 422).json({ error: err.message || 'failed to read file' });
    }
});

// Spec template — frozen. The agent must output EXACTLY these sections so
// the UI can parse/render predictably and the user's edits don't break
// downstream consumers (Maya reads the proposed-approach block in particular).
// NOTE: the Date and Author lines the model writes are placeholders — the
// server overwrites both from code after generation (guard.stampMetadata).
const SPEC_SYSTEM_PROMPT = `You are the Spec Engineer. After a round table of specialist agents has discussed a user's idea, you turn that conversation into a single, decision-ready spec document that the design + build agents can act on.

Output MUST follow this exact template, in this order, using these exact section headings. Markdown only — no code fences around the whole doc, no commentary before or after.

Title: <one-line title in Title Case>

Author: <comma-separated agent names — every agent who spoke in the round table>
Status: Draft
Date: <today's date in YYYY-MM-DD — it is provided in the user message; never guess>

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
- EVERY number (percentages, counts, targets, timelines) must be traceable: either it appeared in the conversation/draft, or you tag it inline as [assumption] or [benchmark: <source>]. Never present an invented number as fact.
- Authors line must list every agent that contributed a perspective. Order them as they appeared.`;

// Marketing-phase template. Produces a campaign brief that Maya can turn into
// 5 per-platform mockups instead of a software spec. Aisha leads; Ananya and
// Hostinger do not run downstream for marketing chats.
const MARKETING_SPEC_SYSTEM_PROMPT = `You are the Campaign Spec Engineer. After a round table of specialist agents has discussed a marketing campaign or event, you turn that conversation into a single, decision-ready CAMPAIGN brief — five platform assets with concrete creative direction Maya can design from.

Output MUST follow this exact template, in this order, using these exact section headings. Markdown only — no code fences around the whole doc, no commentary before or after.

Title: <one-line campaign / event name in Title Case>

Author: <comma-separated agent names — every agent who spoke in the round table>
Status: Draft
Date: <today's date in YYYY-MM-DD — it is provided in the user message; never guess>

## Campaign brief

2–3 sentences on audience, occasion, and tone. Pull from what the round table surfaced — who this is for, what feeling it should land, and the single call-to-action.

## Assets

### Instagram
**Format:** Square feed post, 1080×1080 (note any companion story 1080×1920)
**Short description:** <visual direction + caption tone + hashtag angle + CTA>

### Facebook
**Format:** Feed image, 1200×630
**Short description:** <visual direction + caption copy angle + CTA>

### X (Twitter)
**Format:** In-feed image, 1200×675
**Short description:** <hook copy under 240 chars + visual direction + CTA>

### LinkedIn
**Format:** Shared image, 1200×627
**Short description:** <professional / B2B angle + headline copy + CTA>

### Email
**Format:** Single-column email banner, ~600px wide
**Short description:** <subject line + preview text + body angle + CTA button copy>

## Distribution

2–4 sentences on channels, sequence (which asset ships first, which follows), and timing relative to the event date.

## Success criteria

- <observable + measurable outcome 1>
- <observable + measurable outcome 2>

## Open questions

- <decision the user still needs to make>

RULES:
- Stay grounded in what the round table said. Don't invent angles, audiences, or claims they didn't surface.
- Each asset's "Short description" must be concrete enough for a designer to start from — specify the visual hook, the headline/copy direction, and the CTA. Not "make it look nice."
- EVERY number must be traceable to the conversation, or tagged inline as [assumption] or [benchmark: <source>].
- Authors line must list every agent that contributed a perspective. Order them as they appeared.
- Do NOT output the software-spec sections (Problem / Goals / Requirements / Proposed approach / Failure modes / Rollout) — this is a campaign brief, not a product spec.`;

function buildSpecUserPrompt(chat, rawSpecText) {
    // Domain round-table transcript — every turn's responses.
    const domainTurns = Array.isArray(chat.turns) && chat.turns.length > 0
        ? chat.turns
        : [{ query: chat.query, responses: chat.responses || [] }];

    const domainTranscript = domainTurns.map((t, i) => {
        const header = domainTurns.length > 1 ? `### Domain · Turn ${i + 1}\nUser asked: "${t.query}"\n` : `User asked: "${t.query}"\n`;
        const replies = (t.responses || []).map(r => `**${r.name}:** ${r.text}`).join('\n\n');
        return `${header}\n${replies}`;
    }).join('\n\n---\n\n');

    // Tech round-table transcript — only present when "Convene tech team"
    // fired. Tech RT is single-shot for now (no multi-turn) so we just
    // flatten its turns linearly.
    const techTurns = Array.isArray(chat.tech_turns) ? chat.tech_turns : [];
    let techTranscript = '';
    if (techTurns.length > 0) {
        techTranscript = '\n\n========\n\nTECHNICAL ROUND TABLE (consulted on the spec):\n\n' +
            techTurns.map((t, i) => {
                const header = techTurns.length > 1 ? `### Tech · Round ${i + 1}\nQuestion: "${t.query}"\n` : `Question: "${t.query}"\n`;
                const replies = (t.responses || []).map(r => `**${r.name}:** ${r.text}`).join('\n\n');
                return `${header}\n${replies}`;
            }).join('\n\n---\n\n');
    }

    // Real date, injected — the model never guesses it (guard re-stamps it
    // afterwards anyway, belt and braces).
    const dateLine = `Today's date is ${todayISO()}. Use exactly this in the Date line.`;

    // When the user uploaded a draft spec, the round table was convened to
    // REVIEW it — so the job is a LOSSLESS MERGE, not a summary.
    const uploaded = (rawSpecText || '').trim();
    if (uploaded) {
        const uploadedBlock = `\n\n========\n\nUSER-UPLOADED DRAFT SPEC (the starting point — nothing in it may be lost):\n\n${uploaded.slice(0, 40000)}`;
        const reviewGuidance = `${dateLine}\n\nProduce a single COMBINED spec under a ZERO-LOSS contract:\n1. EVERY item in the uploaded draft — each goal, requirement (Must/Should/Won't), feature, constraint, metric, number, bullet and table row — MUST appear in your output, either verbatim or faithfully reworded with identical facts. You may reorganize and deduplicate; you may NEVER summarize items away or collapse a list into a shorter one.\n2. On top of that, FOLD IN everything the round table added${techTurns.length > 0 ? ' and the technical round table\'s architecture/risk notes' : ''} — gaps they flagged, tightened goals, expert suggestions.\n3. If the round table contradicted a draft item, KEEP the draft item and record the disagreement under "Alternatives considered" or "Open questions" — never silently drop or alter it.\n4. Reformat the merged result to the required template.`;
        return `${reviewGuidance}${uploadedBlock}\n\n========\n\nROUND-TABLE REVIEW (what the experts added / flagged as missing):\n\n${domainTranscript}${techTranscript}`;
    }

    const guidance = techTurns.length > 0
        ? `${dateLine}\n\nSynthesize the spec from BOTH round-table conversations below. The domain round table set the problem and goals; the technical round table reviewed the spec draft and weighed in on architecture, stack choices, and engineering risks. The final spec should absorb both perspectives — domain-driven Problem/Goals/Requirements, tech-driven Proposed approach/Failure modes/Open questions.`
        : `${dateLine}\n\nSynthesize the spec from this round-table conversation:`;

    return `${guidance}\n\n${domainTranscript}${techTranscript}`;
}

function collectAuthors(chat) {
    const domainTurns = Array.isArray(chat.turns) && chat.turns.length > 0
        ? chat.turns
        : [{ responses: chat.responses || [] }];
    const techTurns = Array.isArray(chat.tech_turns) ? chat.tech_turns : [];
    const seen = new Set();
    const order = [];
    for (const t of [...domainTurns, ...techTurns]) {
        for (const r of (t.responses || [])) {
            if (r?.name && !seen.has(r.name)) {
                seen.add(r.name);
                order.push(r.name);
            }
        }
    }
    return order;
}

// Flatten everything the model was allowed to draw from — used for number
// provenance checks.
function collectSourceTexts(chat, rawSpecText) {
    const out = [rawSpecText || ''];
    const turnSets = [chat.turns, chat.tech_turns, [{ query: chat.query, responses: chat.responses }]];
    for (const turns of turnSets) {
        if (!Array.isArray(turns)) continue;
        for (const t of turns) {
            if (t?.query) out.push(String(t.query));
            for (const r of (t?.responses || [])) if (r?.text) out.push(String(r.text));
        }
    }
    return out;
}

router.post('/spec', async (req, res) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const chatId = (req.body?.chat_id || '').trim();
    if (!chatId) return res.status(400).json({ error: 'chat_id is required' });
    const partnerIdInput = typeof req.body?.partner_id === 'string' ? req.body.partner_id.trim() : '';
    const partnerId = partnerIdInput ? await verifiedPartnerId(partnerIdInput, userId) : '';

    // Optional uploaded draft spec → produce a COMBINED spec (upload + review).
    // Falls back to the chat's persisted uploaded_spec when the client omits it.
    let rawSpecText = typeof req.body?.raw_spec_text === 'string' ? req.body.raw_spec_text : '';

    let chat;
    try {
        chat = await pb.collection('roundtable_chats').getOne(chatId);
    } catch {
        return res.status(404).json({ error: 'chat not found' });
    }
    if (chat.user_id !== userId) return res.status(403).json({ error: 'not your chat' });

    if (!rawSpecText && chat.uploaded_spec) {
        rawSpecText = typeof chat.uploaded_spec === 'string' ? chat.uploaded_spec : (chat.uploaded_spec.text || '');
    }

    const authors = collectAuthors(chat);
    if (authors.length === 0) {
        return res.status(400).json({ error: 'this chat has no responses yet — wait for the round table to finish' });
    }

    // Provider routing follows the same rules as /api/roundtable.
    const userBYOK = await getUserBYOK(userId);
    const usingUserKey = !!userBYOK;
    let provider = usingUserKey ? userBYOK.provider : SERVER_PROVIDER;
    let key      = usingUserKey ? userBYOK.key      : OPENAI_API_KEY;
    let model    = usingUserKey
        ? (userBYOK.models?.spec || userBYOK.model || getProviderMeta(userBYOK.provider).defaultModel)
        : SERVER_DEFAULT_MODEL;
    let fellBackToServer = false;

    // Phase-aware template: marketing chats get the campaign-brief template
    // (5 platform assets), everything else gets the software-spec template.
    const isMarketing = chat?.phase === 'marketing';
    const systemPrompt = isMarketing ? MARKETING_SPEC_SYSTEM_PROMPT : SPEC_SYSTEM_PROMPT;

    const generate = async (userPrompt) => {
        try {
            return await chatComplete(provider, {
                key, model, systemPrompt, userPrompt,
                meter: { user_id: userId, partner_id: partnerId, agent: 'Spec Engineer', context: 'spec' },
            });
        } catch (err) {
            // BYOK failed — fall back to server model so the spec still
            // lands. Match /api/roundtable's fallback policy.
            const isBYOKFailure = usingUserKey && (
                err.status === 401 || err.status === 429 || err.status === 504 ||
                err.cause?.code === 'ETIMEDOUT' || err.cause?.code === 'ECONNRESET'
            );
            if (!isBYOKFailure) throw err;
            const causeMsg = err.cause?.message || err.cause?.code || err.message;
            logger.warn(`spec BYOK failed (provider=${provider} model=${model} cause=${causeMsg}) — falling back to server ${SERVER_DEFAULT_MODEL}`);
            provider = SERVER_PROVIDER;
            key      = OPENAI_API_KEY;
            model    = SERVER_DEFAULT_MODEL;
            fellBackToServer = true;
            return await chatComplete(provider, {
                key, model, systemPrompt, userPrompt,
                meter: { user_id: userId, partner_id: partnerId, agent: 'Spec Engineer', context: 'spec' },
            });
        }
    };

    try {
        const userPrompt = buildSpecUserPrompt(chat, rawSpecText);
        let spec_text = stampMetadata(await generate(userPrompt), authors);

        // ── Quality gate ────────────────────────────────────────────────────
        let sectionsMissing = missingSections(spec_text, chat?.phase);
        let coverage = rawSpecText ? coverageReport(rawSpecText, spec_text) : { total: 0, missing: [], ratio: 1 };
        let repaired = false;

        if (sectionsMissing.length > 0 || coverage.missing.length > 0) {
            // One bounded repair pass with the exact defect list. Cheap, and
            // fixes the common case where a small model dropped a handful of
            // draft items or a section.
            const problems = [];
            if (sectionsMissing.length > 0) problems.push(`Missing required sections: ${sectionsMissing.join(', ')}`);
            if (coverage.missing.length > 0) {
                problems.push(`These items from the uploaded draft were LOST and must be restored (reworded is fine, dropped is not):\n${coverage.missing.map(m => `- ${m}`).join('\n')}`);
            }
            const repairPrompt = `${userPrompt}\n\n========\n\nYou already produced the spec below, but it FAILED review:\n${problems.join('\n\n')}\n\nOutput the corrected FULL spec (entire document, same template). Fix every listed problem and change nothing else.\n\n--- PREVIOUS SPEC ---\n\n${spec_text}`;
            spec_text = stampMetadata(await generate(repairPrompt), authors);
            repaired = true;
            sectionsMissing = missingSections(spec_text, chat?.phase);
            coverage = rawSpecText ? coverageReport(rawSpecText, spec_text) : coverage;
        }

        // Guaranteed floor: anything STILL missing rides along verbatim.
        let appended = 0;
        if (coverage.missing.length > 0) {
            spec_text = appendCarryover(spec_text, coverage.missing);
            appended = coverage.missing.length;
            coverage = coverageReport(rawSpecText, spec_text);
        }

        const unsourced = unsourcedNumbers(spec_text, collectSourceTexts(chat, rawSpecText));

        logger.info(`spec: chat=${chatId} phase=${chat?.phase || 'default'} template=${isMarketing ? 'marketing' : 'software'} authors=${authors.length} chars=${spec_text.length} provider=${provider}${fellBackToServer ? ' (BYOK fallback)' : ''} coverage=${coverage.ratio.toFixed(2)}${repaired ? ' repaired' : ''}${appended ? ` appended=${appended}` : ''} unsourced_numbers=${unsourced.length}`);

        res.json({
            spec_text,
            authors,
            generated_at: new Date().toISOString(),
            engine: { provider, model },
            byok_fell_back: fellBackToServer,
            quality: {
                sections_ok: sectionsMissing.length === 0,
                sections_missing: sectionsMissing,
                coverage_ratio: Number(coverage.ratio.toFixed(3)),
                draft_items: coverage.total,
                repaired,
                carried_over_verbatim: appended,
                unsourced_numbers: unsourced,
            },
        });
    } catch (err) {
        const causeMsg = err.cause?.message || err.cause?.code || (err.cause ? String(err.cause) : '(no cause)');
        logger.error(`spec error chat=${chatId}: ${err.message} | cause=${causeMsg} | provider=${provider} model=${model}`);
        res.status(500).json({ error: 'Spec generation failed' });
    }
});

export default router;
