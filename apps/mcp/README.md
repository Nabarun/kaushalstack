# @kaushalstack/mcp

MCP server that exposes [kaushalstack](https://kaushalstack.com) as tools for
any MCP host — Claude Desktop, Codex, Cursor, your own scripts.

Use this when you want an LLM agent to **assemble a domain round table,
convene a tech round table, generate a spec, or browse past chats** —
without using the web UI.

## What it exposes

| Tool | Maps to | Purpose |
|---|---|---|
| `recommend_agents` | `POST /api/recommend` | Pick 6–10 domain specialists for a prompt |
| `recommend_tech_agents` | `POST /api/recommend/tech` | Pick 4–8 engineers off a spec |
| `run_roundtable` | `POST /api/roundtable` | Run a discussion (domain or tech mode) |
| `generate_spec` | `POST /api/spec` | Aisha synthesizes a spec from a chat |
| `list_chats` | `GET /api/roundtable/chats` | List recent chats + their state |

## Auth

Get your kaushalstack PocketBase token:

1. Sign in at https://kaushalstack.com
2. Open DevTools → Application → Local Storage → `https://kaushalstack.com`
3. Copy the `token` field out of the `pb_auth` entry

Set it as `KAUSHALSTACK_API_TOKEN` in the host's MCP config (examples below).

> The recommend tools work without a token (they only call public
> endpoints). Everything else — running a round table, generating a spec,
> listing chats — needs the token because the result is bound to your
> user account.

## Install

```bash
# Once published to npm
npx -y @kaushalstack/mcp

# Until then, run from the monorepo
cd apps/mcp && npm install && node src/index.js
```

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "kaushalstack": {
      "command": "npx",
      "args": ["-y", "@kaushalstack/mcp"],
      "env": {
        "KAUSHALSTACK_API_URL": "https://kaushalstack.com",
        "KAUSHALSTACK_API_TOKEN": "eyJhbGciOi..."
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the 🔌 attachment menu.

## Codex / Cursor / other MCP hosts

Same shape — point at the `kaushalstack-mcp` binary and pass the two env
vars. Stdio transport, no extra setup.

## Typical session

A host (Claude / Codex) using these tools might do:

```
1. recommend_agents({ query: "I want to start a kirana shop online" })
   → 6 domain specialists matching the prompt
2. run_roundtable({ query, team: <the 6>, kind: "domain" })
   → 6 perspectives, returns chat_id
3. generate_spec({ chat_id })
   → one-page spec drafted from the discussion
4. recommend_tech_agents({ query: <spec_text> })
   → 5 engineers scored against the spec, not the original prompt
5. run_roundtable({ query: <"review this spec…">, team: <the 5>,
                   chat_id, kind: "tech" })
   → tech-team perspectives appended to the chat
6. generate_spec({ chat_id })
   → v2 spec absorbs both transcripts; Authors line includes everyone
```

That's the entire kaushalstack core loop, callable headlessly.

## Config reference

| Env var | Default | Purpose |
|---|---|---|
| `KAUSHALSTACK_API_URL` | `https://kaushalstack.com` | Override for self-hosted deploys |
| `KAUSHALSTACK_API_TOKEN` | _(unset)_ | Required for run_roundtable, generate_spec, list_chats |

## License

MIT
