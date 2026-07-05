---
name: fable5-execution
description: Fable 5 execution playbook for the executor agent — web + mobile development tooling, PocketBase/Postgres database and schema scaffolding, and per-session token/cost monitoring. Load at the start of any build/execution task and report cost at the end.
version: 1
---

# Fable 5 Execution Skill

Use this skill whenever the executor agent builds, modifies, or verifies web or mobile features, creates database collections/schemas, or needs to report what a task cost in tokens and dollars.

## Model & Pricing (for cost reporting)

| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| **Claude Fable 5** | `claude-fable-5` | $10.00 | $50.00 |
| Claude Opus 4.8 | `claude-opus-4-8` | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | $3.00 ($2.00 intro thru 2026-08-31) | $15.00 ($10.00 intro) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 |

Cache read = 0.1× input price. Cache write = 1.25× (5-min TTL) / 2× (1-hour TTL) input price. Batch API = 50% off.

---

## Tool & MCP Inventory

### Built-in tools (always available)
| Tool | Use for |
|---|---|
| `Read` / `Write` / `Edit` | File work — prefer these over `cat`/`sed` in Bash |
| `Glob` / `Grep` | Finding files and code |
| `Bash` | npm/npx, docker, git, PocketBase CLI, psql, Expo CLI |
| `WebFetch` / `WebSearch` | Docs lookup (framework APIs, library versions) |
| `Agent` (Explore) | Broad read-only codebase sweeps |

### MCP servers (web development)
| Server | Key tools | Use for |
|---|---|---|
| **Claude Preview** | `preview_start`, `preview_screenshot`, `preview_snapshot`, `preview_inspect`, `preview_console_logs`, `preview_network`, `preview_click`, `preview_fill`, `preview_resize` | Run the dev server via `.claude/launch.json` and verify UI changes in a real browser. `preview_inspect` for exact CSS values; `preview_resize` for mobile (375×812) / tablet / desktop responsive checks and dark mode. |
| **claude-in-chrome** | `navigate`, `computer`, `read_page`, `read_console_messages`, `read_network_requests`, `form_input`, `tabs_*` | Driving a real Chrome — production smoke tests on kaushalstack.com, OAuth flows, anything Preview can't reach. Load via ToolSearch in ONE batched `select:` call. |
| **kaushalstack** | `generate_spec`, `recommend_agents`, `recommend_tech_agents`, `run_roundtable`, `list_chats` | Spec + round-table pipeline before building (see `/kaushalstack:build`). |
| **mcp-registry** | `search_mcp_registry`, `suggest_connectors` | Discover additional MCP connectors when a task needs a service we haven't wired up yet. |

### Mobile development
No dedicated mobile MCP yet — use `Bash` with the Expo toolchain, and Preview/Chrome for the web target:

```bash
npx create-expo-app@latest apps/mobile --template blank-typescript  # scaffold
npx expo start --web        # verify via Claude Preview against the web build
npx expo start --tunnel     # QR for a physical device (Expo Go)
npx expo prebuild && npx expo run:ios   # native builds when needed
eas build --platform all    # cloud builds (requires eas-cli + login)
```

Responsive verification for mobile web: `preview_resize` with preset `mobile`, then `preview_screenshot` + `preview_inspect`.

---

## Web Dev Workflow (this monorepo)

| Command | What it does |
|---|---|
| `npm run dev` | web (Vite) + api (Express) + pocketbase concurrently |
| `npm run build` | production web build |
| `npm run lint` | lint web + api |

- Apps live in `apps/web` (React/Vite), `apps/api` (Express), `apps/pocketbase`.
- Verify UI changes with Claude Preview before claiming done; check `preview_console_logs` for runtime errors.
- **Syntax-check edited system prompts** (template literals in `apps/api`) before committing: `node -e "import('<file>')"` — an unescaped backtick crashes the whole API.
- After committing, always `git push origin <branch>` (pre-authorized).
- Deploys: use the `deployment` skill. **Docker cache footgun**: if a deploy ADDs new files, build with `--no-cache` the first time or the COPY layer silently drops them.

---

## Database Scaffolding

### PocketBase (default for this project)

Schema changes are JS migration files in `apps/pocketbase/pb_migrations/`, named `<unix-timestamp>_<snake_case_description>.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",                       // "base" | "auth" | "view"
      name: "my_collection",
      listRule: "@request.auth.id != ''", // access rules; null = superuser only
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        "CREATE INDEX `idx_my_col_user` ON `my_collection` (`userId`)",
      ],
      fields: [
        { name: "id", type: "text", primaryKey: true, system: true, required: true,
          min: 15, max: 15, pattern: "^[a-z0-9]+$", autogeneratePattern: "[a-z0-9]{15}" },
        { name: "userId", type: "text", max: 0 },
        { name: "payload", type: "json", maxSize: 2000000 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    // down migration
    app.delete(app.findCollectionByNameOrFilter("my_collection"));
  }
);
```

Rules of thumb:
- Timestamp prefix = `date +%s` at authoring time; must sort after existing migrations.
- Migrations run automatically on PocketBase start (`npm run dev` locally; container restart in prod).
- Also regenerate/extend `apps/pocketbase/database-types.d.ts` when adding collections so the API/web stay typed.
- The `skills` collection gates access on the `private` flag — keep new rules consistent with that pattern.
- Prod rollout requires rebuilding the pocketbase image (deployment skill, Step 1).

### Postgres (for standalone client projects, e.g. ReFunction on the Hostinger VPS)

Keep schemas as versioned SQL files: `db/schema.sql` + `db/migrations/NNN_description.sql`.

```sql
-- db/migrations/001_create_patients.sql
BEGIN;
CREATE TABLE IF NOT EXISTS patients (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name   TEXT NOT NULL,
  phone       TEXT UNIQUE,
  dob         DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients (phone);
COMMIT;
```

Local Postgres for development:

```bash
docker run -d --name devpg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
docker exec -i devpg psql -U postgres < db/migrations/001_create_patients.sql
docker exec -it devpg psql -U postgres -c '\dt'   # verify
```

Choose PocketBase when the feature lives inside kaushalstack (auth + rules for free); choose Postgres when the data belongs to an external/client system or needs relational reporting (joins, window functions).

---

## Token & Cost Monitoring

A working monitor ships with this skill: [`scripts/session_cost.py`](scripts/session_cost.py). It parses the Claude Code transcripts in `~/.claude/projects/-Users-nabarunsengupta-Projects-kaushalstack/`, dedupes streamed messages, and prices each token class per model using the table above.

```bash
python3 .claude/skills/fable5-execution/scripts/session_cost.py         # current (latest) session
python3 .claude/skills/fable5-execution/scripts/session_cost.py --all   # whole project history
python3 .claude/skills/fable5-execution/scripts/session_cost.py <path/to/session.jsonl>
```

Sample output:

```
model                 msgs      input     output    cache rd   cache wr  est. cost
claude-fable-5           8      7,276      7,965   1,145,844    233,761    $6.2921
```

**Executor protocol:**
1. At the **end of every substantive task**, run the script (latest-session mode) and include a one-line cost summary in the final report, e.g. *"This task consumed ~1.2M cache-read + 8K output tokens on Fable 5 ≈ $6.29."*
2. If a task is projected to be token-heavy (large fan-outs, many subagents), check cost mid-task and flag if the session crosses **$20**.
3. Cost-control levers, in order: reuse the session (warm cache within 5-min TTL) → delegate mechanical work to subagents on cheaper models (`model: haiku`/`sonnet`) → keep prompts stable so the cache prefix holds.
4. The interactive `/cost` command shows the harness's own view — use the script when you need per-model breakdowns or history across sessions.

---

## Incremental roadmap

Start with the above; extend this skill as the stack grows:
- [ ] Add an Expo/EAS mobile app to the monorepo and document its launch config
- [ ] Wire a Postgres MCP connector (via `search_mcp_registry`) for direct query tooling
- [ ] Per-task cost budgets written into task reports
- [ ] Seed-data scaffolding helpers for new PocketBase collections
