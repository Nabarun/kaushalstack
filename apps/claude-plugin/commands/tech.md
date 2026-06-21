---
description: Recommend tech specialists from kaushalstack scored against a spec text (use AFTER a spec is drafted).
argument-hint: <spec text or technical brief>
---

Call the kaushalstack MCP tool `recommend_tech_agents` with:

- `query`: $ARGUMENTS

If `$ARGUMENTS` is empty, look at the most recent spec in the conversation context. If still nothing, ask the user to paste a spec or technical brief.

Render the result as a compact table of **agent_name** + skill **name**. Note that the spec text — not the original user prompt — is the signal here: tech agents recommended off "build an app for kirana stores" will be terrible; tech agents recommended off "Node.js + PostgreSQL + WhatsApp API + Hostinger" will be on point.

End with a one-line suggestion to run `/kaushal-roundtable kind=tech` to convene them.
