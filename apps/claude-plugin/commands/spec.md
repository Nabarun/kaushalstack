---
description: Have Aisha (Spec Engineer) synthesize a one-page spec from a kaushalstack chat.
argument-hint: <chat_id, or empty to use the most recent>
---

Generate a kaushalstack spec.

Steps:

1. Resolve the chat id: use `$ARGUMENTS` if provided, otherwise grab the `chat_id` from the most recent `/kaushal-roundtable` output in the conversation. If neither is available, call `list_chats` and use the newest one.
2. Call the kaushalstack MCP tool `generate_spec` with:
   - `chat_id`: <resolved id>

Render the returned `spec_text` verbatim — it's already markdown with the standard sections (Title, Problem, Goals, Non-goals, Requirements, Proposed approach, Failure modes, Success criteria, Open questions, Rollout).

Below the spec, list the `authors` (every agent who contributed) in a single line. If the chat already has tech responses, the spec absorbed both transcripts and the authors line should reflect that.

End with a one-line nudge: if no tech round table has run yet, suggest `/kaushal-tech` then `/kaushal-roundtable kind=tech`, then `/kaushal-spec` again to land a v2 with both perspectives.
