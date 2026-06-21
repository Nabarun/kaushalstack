# kaushalstack — Claude Code plugin

Bundles the [kaushalstack-mcp](https://www.npmjs.com/package/kaushalstack-mcp)
server plus slash commands that orchestrate the full round-table → spec
loop, callable from inside Claude Code.

## What you get

| Command | Purpose |
|---|---|
| `/kaushalstack:recommend <prompt>` | Pick 6–10 domain specialists for a prompt |
| `/kaushalstack:tech <spec>` | Pick 4–8 engineers off a spec |
| `/kaushalstack:roundtable` | Run a discussion with the most recent team |
| `/kaushalstack:spec` | Have Aisha synthesize a spec from the chat |
| `/kaushalstack:chats` | List recent chats + their state |
| `/kaushalstack:build <prompt>` | **Run the whole pipeline end-to-end in one command** |

The MCP server (`kaushalstack-mcp`) gets auto-spawned when the plugin
loads. The five tools it exposes are also callable directly by Claude
without the slash-command wrappers — the wrappers just give you tighter
control and orchestration.

## Install

### 1. Get your kaushalstack token

Sign in at https://kaushalstack.com and go to **Developers**
(https://kaushalstack.com/developers). Click **Generate token**, name it,
and copy the `ksk_…` value — it's shown only once.

### 2. Set the token as an env var on your shell

```bash
# ~/.zshrc or ~/.bashrc
export KAUSHALSTACK_API_TOKEN="eyJhbGciOi..."
```

(The plugin reads it from the environment when it spawns the MCP server.)

### 3. Install the plugin

Add the kaushalstack marketplace, then install the plugin from it:

```
/plugin marketplace add Nabarun/kaushalstack
/plugin install kaushalstack@kaushalstack
/reload-plugin
```

After install, restart Claude Code so the bundled MCP server picks up the
`KAUSHALSTACK_API_TOKEN` you exported in step 2.

Or, to install straight from a local checkout without the marketplace:

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
