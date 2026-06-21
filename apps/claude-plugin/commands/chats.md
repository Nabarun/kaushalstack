---
description: List recent kaushalstack chats and their state (specs, mockups, builds, deploys).
---

Call the kaushalstack MCP tool `list_chats`.

Render the result as a table — for each chat:

- A short truncated `query` (first 60 chars)
- Turn count
- Whether a spec is present (`tool_results.spec`)
- Whether a mockup / build / deploy exist
- `created` date (relative — "2h ago", "3d ago")

Newest first. End with a one-line note: pass any `id` to `/kaushal-spec` to regenerate the spec, or `/kaushal-roundtable` to follow up on that chat.
