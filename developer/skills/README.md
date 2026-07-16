# Developer skills

Reusable, battle-tested **runbooks** for building on and operating the kaushalstack
platform. Each one captures a real feature/setup end-to-end — the architecture, the
exact steps, the env/config, and the troubleshooting for every error actually hit —
so the next person does the *delta*, not the whole discovery again.

These are written in the [Claude Code skill](https://docs.claude.com/claude-code) format
(a folder with a `SKILL.md` that has `name` + `description` frontmatter), so they double
as human docs **and** as skills an AI agent can load and follow.

## For developers — how to use these

1. **Read it** — each `SKILL.md` is a standalone doc. Start there before touching the feature.
2. **Install it as a live skill** (optional) — copy the skill folder into your own
   `~/.claude/skills/` (user-wide) or a repo's `./.claude/skills/` (project-scoped), then
   Claude Code will auto-load it and can execute the runbook for you:
   ```
   cp -r developer/skills/<skill-name> ~/.claude/skills/
   ```
3. **Improve it** — if you hit a new gotcha, add it to the troubleshooting table and open a PR.
   The value of these compounds only if they stay current.

## Available skills

| Skill | What it's for |
|---|---|
| [`facebook-publishing`](facebook-publishing/SKILL.md) | Light up "Publish to Facebook" in a partner's Card Studio portal. One shared Meta app already exists — this is the **per-partner delta** to onboard a new partner (Meta config, portal code/env, `STUDIO_FRAME_ANCESTORS`, deploy/verify) plus a full troubleshooting table. |
| [`social-aspect-ratios`](social-aspect-ratios/SKILL.md) | Pick the right aspect ratio + export resolution for social creatives — 2026 Facebook/Instagram/Meta-ads specs, decision rules (events → landscape 1.91:1, IG feed → 4:5, Stories → 9:16), grid-crop and safe-zone gotchas, and how Card Studio's Format selector maps to them. |

## Conventions

- One folder per skill, containing `SKILL.md` (required) and any helper files/scripts.
- `SKILL.md` frontmatter: a short `name` (kebab-case) and a `description` that says
  *when* to use it (so an agent can match it to a task).
- Prefer "delta over full rebuild" framing: state clearly what's one-time/shared vs.
  what changes per use, so onboarding the Nth partner/app is minutes, not a day.
- Keep a **troubleshooting table** of real errors → causes → fixes. That's usually the
  highest-value part.
