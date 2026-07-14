---
name: facebook-publishing
description: Enable "Publish to Facebook" in a partner's Card Studio portal. One shared Meta app already exists (kaushalstack, App ID 1629953545366835) — this skill is the PER-PARTNER delta to light it up for a new partner portal. Use when onboarding a new partner to Facebook publishing, or debugging an existing one.
---

# Facebook publishing — per-partner setup

## What this does

Lets a partner post a Studio-composed card straight to **their own Facebook Page**.
Model is **"connect once, ever"**: the partner clicks *Connect Facebook* one time in
their portal, and from then on any card can be published to their Page with one click.

## Architecture (read once so the delta makes sense)

Three moving parts, only two of which change per partner:

1. **One shared Meta app** — `kaushalstack`, App ID `1629953545366835`. A single Meta
   app serves ALL partners. Each partner just connects their own FB account/Page via
   OAuth against this app. **Already created — do NOT make a new app per partner.**
   (Its App Secret lives in each portal's `.env` as `FACEBOOK_APP_SECRET`.)

2. **Shared kaushalstack Studio** (`apps/api/src/routes/studio.js`) — the *Publish to
   Facebook* button, `composeCardPng` / `composeCardVideoPath`, `collectCardText`, and
   the `postMessage({type:'ks-studio-publish', …})` hand-off to the host portal. This is
   ONE surface serving every partner. **Already built.** The only per-partner delta here
   is the `STUDIO_FRAME_ANCESTORS` env (so the studio iframe is allowed to embed in the
   new partner's domain).

3. **Per-partner portal** (mrnmr-web and its clones) — OWNS the connection. It runs the
   OAuth, stores the Page token in its own SQLite (`fb_pages`), records posts (`fb_posts`),
   and posts to the Graph API. Studio only composes the asset and hands it up; the token
   never reaches the browser. **This is where most of the per-partner work is.**

Why the portal owns the token, not the studio session: a studio session is anonymous
(16-hex id, no partner identity). The partner's identity only exists in their portal
login, so the connection must live there to persist "once, ever".

## Per-partner DELTA checklist

Assume: partner portal is a mrnmr-web clone deployed on the VPS at
`/docker/<partner>/` behind Traefik, reachable at `https://<partner-domain>`.

### 1. Meta app config (developers.facebook.com → the kaushalstack app)
For the new partner, add (do NOT create a new app):
- **Facebook Login → Settings → Valid OAuth Redirect URIs** → add
  `https://<partner-domain>/admin/facebook/callback`
- **Settings → Basic → App Domains** → add `<partner-domain>`
- **Settings → Basic → + Add Platform → Website → Site URL** → `https://<partner-domain>/`
  (App Domains won't stick without a matching Website/Site URL.)
- **App Roles → Roles** → add the partner's FB account (the one that manages their Page)
  as **Tester/Developer** — required until App Review is live for `pages_manage_posts`.

> ⚠️ `*.hstgr.cloud` (the Hostinger default hostname) is a **shared** domain and Meta
> often silently refuses to save it as an App Domain. If App Domains won't hold, put the
> portal on a real domain (a subdomain the partner controls, e.g. `app.<partner>.in`) →
> A record → `187.127.147.87` → Traefik `Host()` rule → LE cert → use that everywhere.

### 2. Portal code — ensure the FB feature is present
If the portal was cloned from mrnmr-web AFTER this feature landed, it's already there.
If it's an older clone, port these from mrnmr-web:
- **`server.js`**: `fb_pages` + `fb_posts` tables (auto-created on boot); the `FB_*`
  consts + `fbSignState`/`fbVerifyState`/`fbPages`/`recordFbPost`; routes
  `/admin/facebook/start`, `/admin/facebook/callback`, `/admin/api/facebook/status`,
  `/admin/api/facebook/disconnect`, `/admin/api/facebook/publish`,
  `/admin/api/facebook/posts`; and the **body-parser exemption** — the global
  `express.json` limit is tiny (10kb), so the publish route needs its own
  `express.json({ limit: '30mb' })` (base64 card image ≈ a few MB, else 413).
- **`admin-studio.html`**: the "Facebook publishing" card (Connect + status + posts log),
  `loadFbStatus`/`fbConnect`/`loadFbPosts`, and the `message` bridge that receives
  `ks-studio-publish` from the studio iframe and POSTs `/admin/api/facebook/publish`
  (validating `e.origin === new URL(KS_API_URL).origin`).

### 3. Portal env + compose (`/docker/<partner>/`)
Append to `.env` (copy the App ID/Secret server-side from kaushalstack's `.env` so the
secret never appears in a command's output):
```
FACEBOOK_APP_ID=1629953545366835
FACEBOOK_APP_SECRET=<same secret as kaushalstack>
FACEBOOK_REDIRECT_URI_PORTAL=https://<partner-domain>/admin/facebook/callback
# optional: FACEBOOK_SCOPE=... (defaults to pages_show_list,pages_read_engagement,pages_manage_posts)
```
Add matching lines to the `environment:` block in `docker-compose.yml`:
```
      FACEBOOK_APP_ID: ${FACEBOOK_APP_ID}
      FACEBOOK_APP_SECRET: ${FACEBOOK_APP_SECRET}
      FACEBOOK_REDIRECT_URI_PORTAL: ${FACEBOOK_REDIRECT_URI_PORTAL}
      FACEBOOK_SCOPE: ${FACEBOOK_SCOPE}
```

### 4. kaushalstack env — allow the studio iframe to embed on the partner domain
On the VPS `/docker/kaushalstack/.env`, add the partner domain to `STUDIO_FRAME_ANCESTORS`
(comma-separated, alongside existing partners), then restart the api container:
```
STUDIO_FRAME_ANCESTORS=https://mrnmr.srv1562298.hstgr.cloud,https://<partner-domain>
```
Confirm it's passed through in `/docker/kaushalstack/docker-compose.yml`'s api
`environment:` block. Without this the studio iframe is X-Frame-blocked in the portal.

### 5. Deploy + verify
- Rebuild/restart the partner portal (see [[deploy-and-local-dev-reality]]).
- Restart the kaushalstack api if you changed `STUDIO_FRAME_ANCESTORS`.
- Verify (Basic Auth = the portal admin creds):
  - `GET /admin/api/facebook/status` → `{"configured":true,"connected":false,...}`
  - `GET /admin/facebook/start` → 302 to `facebook.com/...dialog/oauth?...redirect_uri=<partner callback>...scope=...pages_manage_posts`
- Then a human does the real test: portal → **Connect Facebook** → login with the
  account that manages the Page → select the Page → open a campaign in Studio → design →
  **Publish to Facebook** → check the Page.

## App Review (one-time for the whole app, not per partner)
`pages_manage_posts` is Advanced Access → needs Meta **App Review** (screencast, privacy
policy + ToS URLs, use-case write-up; days–weeks). **Until approved, only accounts added
as Tester/Developer on the app can publish.** After approval, any partner connects with
no tester step. Do this once for the shared kaushalstack app.

## Troubleshooting (errors seen during the mrnmr rollout)
| Symptom | Cause → Fix |
|---|---|
| "domain … isn't included in the app's domains" (at dialog load OR `dialog/close`) | App Domains and/or Valid OAuth Redirect URIs not saved. Set BOTH (step 1) + Website/Site URL. If it won't hold on `*.hstgr.cloud`, move to a real domain. |
| "Invalid Scopes: pages_manage_posts" | App can't request the scope. Add `pages_manage_posts` via **Use cases** (new dashboard) or **App Review → Permissions and Features**; ensure it's a Business-capable app. Diagnose by temporarily setting `FACEBOOK_SCOPE=pages_show_list` (env, no redeploy) — if that loads, it's just the permission; if it still errors, the app can't do Pages. |
| "No Facebook Page found — you must manage at least one Page." | OAuth fully works; the logged-in account manages no Page, OR the Page wasn't ticked on the "which Pages?" login screen. Re-connect and SELECT the Page. Business-Manager "New Pages Experience" pages may need `business_management` added to `FACEBOOK_SCOPE`. |
| `413 Content Too Large` on publish | Global JSON body limit too small for the base64 image. The publish route needs its own `express.json({ limit: '30mb' })` (step 2). |
| Studio iframe blank / X-Frame error in portal | Partner domain missing from kaushalstack `STUDIO_FRAME_ANCESTORS` (step 4). |
| Publish "portal didn't respond" | Studio opened standalone, not embedded — publishing only works inside the partner portal (which holds the token). |

## Facts to remember
- **FB post text is plain** — no fonts/colors/bold/positioning. Styling only survives in
  the image. So Studio splits it: the **media** is composed WITHOUT text
  (`composeCardImageNoText()` for images — forces full-bleed + hides all caption/overlay
  text; `composeCardVideoPath(true)` for video — burns only the gradient), and the **text**
  goes into the FB post message via `collectCardText()` (caption + all
  header/paragraph/button/form-title blocks). Net: clean visual + real text in the post,
  no duplicated text. (The "Download as image/video" exports still bake text in — only the
  *publish* path strips it.)
- **Clearing the published-posts log**: it's the `fb_posts` table in the portal's SQLite,
  not on Facebook. Wipe it with:
  `docker exec <portal>-web-1 node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; new DatabaseSync('/data/analytics.db').prepare('DELETE FROM fb_posts').run()"`
  (clears the log + the "Published ✓" badges; the real FB posts are untouched).
- **Rotate the shared App Secret before going live to real (non-tester) users** — it was
  pasted in plaintext during the mrnmr rollout, so it's in that session's transcript.
- Page tokens are long-lived (~60 days) and refresh with use → the partner connects once.

Related: [[mrnmr-web-deploy-and-analytics]], [[apply-changes-to-both-portals]], [[deploy-and-local-dev-reality]]
