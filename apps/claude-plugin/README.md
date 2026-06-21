# kaushalstack — Claude Code plugin

Bundles the [kaushalstack-mcp](https://www.npmjs.com/package/kaushalstack-mcp)
server plus slash commands that orchestrate the full round-table → spec
loop, callable from inside Claude Code.

## What you get

| Command | Purpose |
|---|---|
| `/kaushal-recommend <prompt>` | Pick 6–10 domain specialists for a prompt |
| `/kaushal-tech <spec>` | Pick 4–8 engineers off a spec |
| `/kaushal-roundtable` | Run a discussion with the most recent team |
| `/kaushal-spec` | Have Aisha synthesize a spec from the chat |
| `/kaushal-chats` | List recent chats + their state |
| `/kaushal-build <prompt>` | **Run the whole pipeline end-to-end in one command** |

The MCP server (`kaushalstack-mcp`) gets auto-spawned when the plugin
loads. The five tools it exposes are also callable directly by Claude
without the slash-command wrappers — the wrappers just give you tighter
control and orchestration.

## Install

### 1. Get your kaushalstack token

Sign in at https://kaushalstack.com → DevTools → Application → Local Storage
→ `https://kaushalstack.com` → copy `token` out of the `pb_auth` entry.

### 2. Set the token as an env var on your shell

```bash
# ~/.zshrc or ~/.bashrc
export KAUSHALSTACK_API_TOKEN="eyJhbGciOi..."
```

(The plugin reads it from the environment when it spawns the MCP server.)

### 3. Install the plugin

Once Claude Code's plugin marketplace publishes this:

```
/plugin install kaushalstack
```

Until then, point Claude Code at this directory directly:

```
/plugin install /path/to/kaushalstack/apps/claude-plugin
```

### 4. Verify

In a Claude Code session:

```
/kaushal-recommend a kirana shop website that takes orders on WhatsApp
```

You should see a team of 6 domain specialists. From there:

```
/kaushal-build a kirana shop website that takes orders on WhatsApp
```

…runs the whole pipeline in one go.

## Configuration

The plugin reads two env vars:

| Var | Default | Purpose |
|---|---|---|
| `KAUSHALSTACK_API_URL` | `https://kaushalstack.com` | Self-hosted override |
| `KAUSHALSTACK_API_TOKEN` | _(unset)_ | Required for round-table / spec / list_chats |

`recommend_agents` and `recommend_tech_agents` work without the token —
the rest of the tools need it because the result is bound to your user.

## License

MIT
