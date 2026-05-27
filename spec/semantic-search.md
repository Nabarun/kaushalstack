# Semantic Search for KaushalStack Skills

## Problem

Current keyword search fails for natural-language queries. Searching "IPL prediction team"
returns no results because the exact words don't appear in skill names, even though skills
like "IPL Powerplay Matchup Analyst" are semantically identical to what the user wants.

Root cause: `name ~ "prediction"` is a substring match, not a meaning match.

---

## Proposed Solution

Replace keyword matching with **embedding-based semantic search**:

1. Every skill is converted to a vector (embedding) that encodes its meaning
2. User queries are embedded the same way at query time
3. Skills are ranked by cosine similarity to the query vector
4. Semantically related skills surface even when zero keywords overlap

---

## Architecture

```
User query
    │
    ▼
Express API /api/recommend
    │
    ├─ 1. Embed query via OpenAI text-embedding-3-small
    │
    ├─ 2. Load skill embeddings from PocketBase
    │      (cached in-memory, refreshed every 10 min)
    │
    ├─ 3. Cosine similarity: query vector vs all skill vectors
    │
    ├─ 4. Take top 30 by score
    │
    └─ 5. Diversity selection: 1 per category → fill to 5
           Return JSON array of skill records
```

---

## Data Model Changes

### PocketBase: `skills` collection — new field

| Field | Type | Notes |
|---|---|---|
| `embedding` | `json` | Float32 array, 1536 dims (text-embedding-3-small) |
| `embedding_updated_at` | `autodate` | Set on each embed run |

Skills without an embedding fall back to keyword search gracefully.

---

## Components to Build

### 1. Embedding Worker (`apps/api/src/embeddings/worker.js`)

Runs on demand and on a schedule. For each skill missing an embedding (or older than 24h):
- Concatenate: `name + " " + category + " " + associated_tech_skills + " " + description`
- Call OpenAI `text-embedding-3-small`
- PATCH the skill record in PocketBase with the embedding array

Batches 100 skills per run to stay within OpenAI rate limits.

```
Estimated cost: 5000 skills × ~200 tokens avg = 1M tokens
text-embedding-3-small: $0.02 / 1M tokens → ~$0.02 one-time
Daily incremental: negligible (only new/updated skills)
```

### 2. Recommendation Endpoint (`POST /api/recommend`)

```
Request:
  { "query": "help me build an IPL prediction system" }

Response:
  { "skills": [ ...5 skill records... ] }
```

Internal flow:
1. Strip stopwords, embed the cleaned query
2. Load skill vectors from in-memory cache (refreshed every 10 min from PocketBase)
3. Cosine similarity against all cached vectors
4. Sort descending, take top 30
5. Diversity pick → return top 5

Falls back to existing PocketBase keyword filter if embedding cache is empty.

### 3. In-Memory Vector Cache (`apps/api/src/embeddings/cache.js`)

```js
// Loaded once on startup, refreshed every 10 min
{
  skillId: { vector: Float32Array, skill: { ...record } },
  ...
}
```

With 5000 skills at 1536 dims × 4 bytes = ~30 MB — well within a Node.js process.

### 4. OpenClaw Daily Cron Job

```yaml
# .openclaw/tasks/embed-new-skills.yaml
schedule: "0 2 * * *"   # 2 AM daily
command: >
  curl -X POST https://kaushalstack.com/api/embed/run
       -H "Authorization: Bearer $EMBED_SECRET"
```

The `/api/embed/run` endpoint triggers the worker for skills added/updated in the last 25h.

### 5. Frontend Change (`HomePage.jsx`)

Replace `recommendTeam()` PocketBase direct call with:

```js
const res = await fetch('/api/recommend', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: text }),
});
const { skills } = await res.json();
```

---

## Environment Variables Required

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | For text-embedding-3-small |
| `EMBED_SECRET` | Bearer token to protect `/api/embed/run` |

---

## Implementation Phases

### Phase 1 — Embed existing skills (one-time)
- Add `embedding` JSON field to PocketBase `skills` collection
- Build and run `worker.js` once to embed all 5108 skills
- Verify embeddings are stored correctly

### Phase 2 — Recommendation endpoint
- Build `/api/recommend` with in-memory cache + cosine similarity
- Test against current keyword search — compare result quality
- Deploy API image

### Phase 3 — Wire up frontend
- Replace `recommendTeam()` in `HomePage.jsx` with fetch to `/api/recommend`
- Deploy web image

### Phase 4 — Daily refresh
- Add `/api/embed/run` protected endpoint
- Configure OpenClaw cron job
- Verify incremental embedding works on new skills

---

## Fallback Strategy

If OpenAI is unavailable or the embedding cache is empty:
- Fall back to existing PocketBase keyword OR filter
- Log the fallback so it's visible in API logs
- No user-facing error

---

## Files to Create / Modify

```
apps/api/src/
  embeddings/
    worker.js        ← batch embed skills via OpenAI
    cache.js         ← in-memory vector store + cosine similarity
  routes/
    recommend.js     ← POST /api/recommend
    embed.js         ← POST /api/embed/run (protected)
  index.js           ← register new routes

apps/web/src/pages/
  HomePage.jsx       ← call /api/recommend instead of direct PocketBase

.openclaw/tasks/
  embed-new-skills.yaml  ← daily cron

spec/
  semantic-search.md     ← this document
```

---

## Success Criteria

| Query | Current result | Expected after |
|---|---|---|
| "IPL prediction team" | No results | IPL cricket skills |
| "help me manage anxiety" | Random generic | mental-health skills |
| "build a react dashboard" | May miss good matches | Tech/React skills |
| "farm irrigation advice" | May miss | agriculture skills |
