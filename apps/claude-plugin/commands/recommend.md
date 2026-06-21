---
description: Recommend a round-table team of domain specialists from kaushalstack for a given prompt.
argument-hint: <user prompt>
---

Call the kaushalstack MCP tool `recommend_agents` with:

- `query`: $ARGUMENTS

If `$ARGUMENTS` is empty, ask the user what they want to build first.

Show me the recommended team — for each agent, list **agent_name**, the skill **name**, and the **category** in a compact table. End with a one-line next-step nudge (run `/kaushal-roundtable` to convene them, or `/kaushal-tech` after a spec exists).
