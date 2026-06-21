---
description: Run a kaushalstack round-table discussion with a previously-recommended team.
argument-hint: <prompt or spec text>
---

Run a round table.

Steps:

1. Find the most recent team in the conversation context (output of `/kaushal-recommend` or `/kaushal-tech`). If you can't find one, ask the user to run `/kaushal-recommend` first.
2. Decide the kind: `domain` (default) or `tech`. If the most recent team came from `recommend_tech_agents`, use `tech` and pass `chat_id` from the prior conversation. Otherwise use `domain`.
3. Call the kaushalstack MCP tool `run_roundtable` with:
   - `query`: $ARGUMENTS (or the user's original prompt / the spec text, as appropriate)
   - `team`: the recommended team (full skill objects, not just names)
   - `chat_id`: only required for follow-ups or tech mode
   - `kind`: `domain` | `tech`

Render every agent's response in order — **agent_name** in bold, then their text. End with the returned `chat_id` so the user can pass it to `/kaushal-spec`.

If `byok_fell_back: true` shows up in the result, mention it as a small note: their BYOK key was skipped and we used the server fallback.
