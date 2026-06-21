#!/usr/bin/env node
// kaushalstack MCP server — stdio transport.
//
// Exposes five tools to any MCP host (Claude Desktop, Codex, etc.):
//   recommend_agents       → /api/recommend           (domain round-table team)
//   recommend_tech_agents  → /api/recommend/tech      (tech round-table team)
//   run_roundtable         → /api/roundtable          (domain or tech RT)
//   generate_spec          → /api/spec                (Aisha synthesis)
//   list_chats             → /api/roundtable/chats    (recent chats + state)
//
// Config (env vars):
//   KAUSHALSTACK_API_URL    default https://kaushalstack.com
//   KAUSHALSTACK_API_TOKEN  required — PocketBase auth token, copy from
//                            kaushalstack.com after signing in (devtools →
//                            Application → Local Storage → pocketbase_auth).
//
// The host configures the server via stdio. Tool inputs use plain JSON
// schemas so the host's LLM can call them without extra adapters.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_URL   = (process.env.KAUSHALSTACK_API_URL || 'https://kaushalstack.com').replace(/\/$/, '');
const API_TOKEN = process.env.KAUSHALSTACK_API_TOKEN || '';

function authHeaders() {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

// Tiny fetch wrapper that throws on non-2xx so tool handlers stay short.
async function apiCall(method, path, body) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.parse(text)?.error || text; } catch { /* leave as text */ }
    throw new Error(`${method} ${path} → ${res.status}: ${detail.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Tool definitions ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'recommend_agents',
    description:
      'Recommend a round-table team of DOMAIN specialists for a given user prompt. ' +
      'Returns 6–10 skills matched by semantic similarity. Excludes tech (use ' +
      'recommend_tech_agents for engineers) and pipeline-only agents (Maya, Ananya, ' +
      'Hostinger). Optional phase narrows to ideation / execution / marketing.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user prompt to recommend a team for.' },
        size:  { type: 'integer', minimum: 6, maximum: 10, default: 6 },
        phase: { type: 'string', enum: ['ideation', 'execution', 'marketing'], description: 'Optional phase filter.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recommend_tech_agents',
    description:
      'Recommend a parallel round-table team of TECH specialists (engineers) for ' +
      'a given spec or technical brief. Use this AFTER a domain round table has ' +
      'produced a spec — pass the spec text as the query so the recommendation ' +
      'matches the actual engineering surface area. Returns 4–8 skills, all in ' +
      'the Tech category.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The spec text or technical brief.' },
        size:  { type: 'integer', minimum: 4, maximum: 8, default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_roundtable',
    description:
      'Run a round-table discussion. Domain mode (default) creates or continues a ' +
      'chat with specialist agents discussing the user prompt. Tech mode (kind="tech") ' +
      'requires an existing chat_id and appends a parallel tech-team discussion ' +
      'on the spec. Returns the agents\' responses and the chat_id for follow-ups.',
    inputSchema: {
      type: 'object',
      properties: {
        query:  { type: 'string', description: 'The user prompt (domain) or spec text (tech).' },
        team:   {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:         { type: 'string' },
              agent_name: { type: 'string' },
              name:       { type: 'string' },
              category:   { type: 'string' },
            },
            required: ['id'],
          },
          description: 'List of skill objects (from recommend_agents / recommend_tech_agents).',
        },
        chat_id:     { type: 'string', description: 'Optional. Required for follow-ups and tech mode.' },
        prior_turns: { type: 'array', description: 'Optional. Prior turns from this chat for multi-turn continuity.' },
        kind:        { type: 'string', enum: ['domain', 'tech'], default: 'domain' },
      },
      required: ['query', 'team'],
    },
  },
  {
    name: 'generate_spec',
    description:
      'Have the Spec Engineer (Aisha) synthesize a one-page spec document from a ' +
      'round-table chat. Includes Title, Problem, Goals, Non-goals, Requirements, ' +
      'Proposed approach, Failure modes, Success criteria, Open questions, Rollout. ' +
      'If the chat already has a tech round table on tech_turns, the spec absorbs ' +
      'both transcripts (domain → Problem/Goals, tech → Approach/Risks). Authors ' +
      'line credits every agent that contributed.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'The chat ID to synthesize.' },
      },
      required: ['chat_id'],
    },
  },
  {
    name: 'list_chats',
    description:
      'List the authenticated user\'s recent kaushalstack chats with their state — ' +
      'query, team, turns, tech_team, tech_turns, tool_results (spec, mockup, ' +
      'build, etc). Newest first. Use this to find a chat_id to continue or to ' +
      'inspect what\'s been built.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Tool handlers ───────────────────────────────────────────────────────

const HANDLERS = {
  async recommend_agents({ query, size, phase }) {
    const body = { query };
    if (size  !== undefined) body.size  = size;
    if (phase !== undefined) body.phase = phase;
    const data = await apiCall('POST', '/recommend', body);
    return { skills: data.skills || [] };
  },

  async recommend_tech_agents({ query, size }) {
    const body = { query };
    if (size !== undefined) body.size = size;
    const data = await apiCall('POST', '/recommend/tech', body);
    return { skills: data.skills || [] };
  },

  async run_roundtable({ query, team, chat_id, prior_turns, kind }) {
    const body = { query, team };
    if (chat_id)     body.chat_id     = chat_id;
    if (prior_turns) body.prior_turns = prior_turns;
    if (kind)        body.kind        = kind;
    const data = await apiCall('POST', '/roundtable', body);
    return {
      responses: data.responses || [],
      chat_id:   data.chatId || null,
      is_follow_up:    data.is_follow_up    || false,
      byok_fell_back:  data.byok_fell_back  || false,
      turn_limit_reached: data.turn_limit_reached || false,
    };
  },

  async generate_spec({ chat_id }) {
    const data = await apiCall('POST', '/spec', { chat_id });
    return {
      spec_text:    data.spec_text || '',
      authors:      data.authors   || [],
      generated_at: data.generated_at,
      byok_fell_back: data.byok_fell_back || false,
    };
  },

  async list_chats() {
    const data = await apiCall('GET', '/roundtable/chats');
    return { chats: data.chats || [] };
  },
};

// ── MCP wiring ──────────────────────────────────────────────────────────

const server = new Server(
  { name: 'kaushalstack', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }
  if (!API_TOKEN && name !== 'recommend_agents' && name !== 'recommend_tech_agents') {
    // Recommend endpoints are unauthenticated; everything else needs a token.
    return {
      isError: true,
      content: [{ type: 'text', text: 'KAUSHALSTACK_API_TOKEN not set — required for this tool. See README for how to get one.' }],
    };
  }
  try {
    const result = await handler(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message || String(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// Server is now alive on stdio; the host will issue requests until it
// disconnects. No explicit shutdown loop needed.
