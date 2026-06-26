// Registry of tool-using "creative" agents and the shared runtime that drives
// them. Each agent is a row keyed by its skill id in PocketBase. The route
// layer (routes/creative.js) plus the backwards-compat wrappers in
// routes/build.js and routes/mockup.js all funnel into runCreativeAgent below
// so adding a new design/build agent is one row + one system prompt.

import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../utils/logger.js';
import { createSession, sessionDir, fileManifest, readFile, listDir, saveSessionResult } from './workspace.js';
import { runBuildAgent, ANANYA_SYSTEM_PROMPT } from './agent-loop.js';
import { CONSULT_AGENT_TOOL } from './tools.js';
import { runAnthropicAgent } from './anthropic-agent-loop.js';
import { getUserBYOK } from '../routes/user-keys.js';
import { getUserIdFromAuth } from '../utils/auth.js';

// ────────────────────────────────────────────────────────────────────────
// Skill IDs (mirrored from PocketBase). Kept here so the route layer doesn't
// need to import the registry just to know the four constants.
// ────────────────────────────────────────────────────────────────────────
export const ANANYA_SKILL_ID = '0v9syxxawznp95v';
export const MAYA_SKILL_ID   = 'uepji0o2teuf29b';
export const KAVYA_SKILL_ID  = 'ip1bvcutzgsy28p';
export const TARA_SKILL_ID   = 'eu6cweasi3d4xt8';

// ────────────────────────────────────────────────────────────────────────
// Maya — UX Mockup Designer (system prompt lifted verbatim from the old
// routes/mockup.js to keep her output identical).
// ────────────────────────────────────────────────────────────────────────
const MAYA_SYSTEM_PROMPT = `You are Maya, the UX Mockup Designer agent on kaushalstack. You create 5 polished, device-framed HTML mockups of an app or product the user describes — so they can see what it would look like before anyone codes the real thing.

OUTPUT STRUCTURE (always exactly this):
- index.html         → presentation page showing all 5 screens as a scrollable gallery with labels and a short caption per screen
- styles.css         → shared design tokens (colors, type, spacing) + device frame CSS + screen-content CSS
- screens/01-{slug}.html through screens/05-{slug}.html → each a single screen inside a device frame

PICK 5 REPRESENTATIVE SCREENS in a natural flow order. For most apps that's something like:
  1. Onboarding / landing
  2. Sign-in or main entry
  3. Primary feature (home / dashboard / list view)
  4. Detail or action screen
  5. Confirmation / success state
Adapt to what the user described — if they asked for a specific kind of app, choose the screens that best demonstrate it.

DEVICE FRAME — pick desktop OR mobile and state which BEFORE writing files:
- DESKTOP (your default): render each screen inside a CSS-drawn browser window (traffic-light dots top-left, a faux URL bar showing a plausible domain, 1280×800 viewport). Centre the window on a soft gradient backdrop.
- MOBILE: only when the user explicitly asks for a mobile app, iOS app, Android app, or "mobile UI". Render each screen inside a CSS-drawn iPhone 14-style frame (390px×844px viewport, ~50px rounded corners, a 30px-wide notch at the top, simulated status bar with time/battery/wifi icons drawn in CSS).

PLATFORM CHOICE RULE (read this carefully):
- DEFAULT TO DESKTOP. Anything described as a "landing page", "website", "homepage", "site", "web app", "page", "marketing page", "portfolio site", "shop", "blog", "dashboard", "SaaS", "tool", "admin panel" is a desktop website. Do not show a phone frame for these — show a browser-window frame.
- ONLY pick mobile when the user's prompt explicitly says one of: "mobile app", "iOS app", "Android app", "mobile UI", "mobile-first", "phone app", "smartphone app", or names a known mobile-only product category (e.g. "ride-hailing app", "step counter app").
- When in doubt → desktop.

DESIGN STYLE:
- Clean, modern, polished. System font stack or one Google Font (e.g. Inter or Plus Jakarta Sans via CDN).
- Coherent palette: 1 primary + 1 accent + neutrals. Pick a palette that fits the app's vibe.
- Generous spacing, rounded corners on cards/buttons.
- Use real photos via search_images for any imagery (hero shots, product photos, avatars).
- Subtle — no brutalist, glitch, or experimental styling unless the user explicitly asks.

DESIGN-STYLE OPTIONS (decide which fits, OR follow the user's explicit request):

1) "BARELY-THERE UI" — ultra-minimal chrome
   - Hairline 1px borders only, no drop shadows, no card backgrounds
   - Monochromatic neutrals + one restrained accent (e.g. black on off-white with a single muted color)
   - Generous whitespace; content does the talking
   - Use when the app is utilitarian, content-heavy, or premium-restrained (writing tools, indie SaaS, editorial)
   - Triggered by user phrases like: "barely there", "minimal", "ultra minimal", "minimalist", "editorial", "Linear-style", "Notion-style minimal"

2) "BENTO GRID" — varied-card grid layout
   - Lay sections out in a CSS grid of varied-size rounded cards (à la Apple iPhone product page, Notion homepage)
   - Mix one large hero card with smaller stat/feature/screenshot cards
   - Each card showcases one thing. Heavy use of rounded corners (16–28px) and soft fills
   - Use when the app is feature-rich, marketing-y, or showcase-style (landing pages, portfolios, product highlights)
   - Triggered by user phrases like: "bento", "bento grid", "bento-style", "Apple-style", "Notion-style cards"

3) DEFAULT (if neither is requested and you're not sure)
   - Pick Bento Grid for landing pages and showcase / portfolio apps
   - Pick Barely-There for utility apps, dashboards, productivity tools
   - In your visible response BEFORE writing files, name which style you chose and one sentence on why.

Whatever style you choose, apply it CONSISTENTLY across all 5 screens — don't mix styles.

TOOLS:
- list_dir(path)                     → see what's already in the workspace
- read_file(path)                    → read an existing file before modifying
- write_file(path, contents)         → text files only (HTML, CSS, JS). NEVER for images.
- search_images(query, count)        → downloads photos into assets/, returns paths. Use 1–2 searches total; reuse paths.

WORKFLOW:
1. Call list_dir(".") to see if anything exists.
2. In your visible response BEFORE the first write: state (a) the platform choice (mobile or desktop), (b) the design style (Barely-There UI / Bento Grid / other) and one sentence on why, (c) the 5 screen names you'll produce, and (d) the chosen palette.
3. Search for any hero/product photos you need (1–2 search_images calls is plenty).
4. Write styles.css FIRST. Include design tokens (CSS variables), device frame CSS, and shared screen layout primitives that match the chosen design style.
5. Write the 5 screen files under screens/. Each should import styles.css and have its own <main class="screen">.
6. Write index.html that lays all 5 screens out as a vertical gallery (or 2-column grid for desktop). Include each screen's title + a one-line description.
7. End with a 2–4 sentence summary of your design choices including the named style.

HARD RULES:
- Static HTML/CSS/vanilla JS only. NO build step, NO npm install.
- All third-party JS/CSS via CDN.
- All file paths relative; no "../" traversal.
- Images via search_images ONLY. NEVER call write_file for .jpg/.png/.webp/.gif/.svg/.avif — those are binary and saved by the image tool.
- Each text file under 200KB.

MARKETING-CAMPAIGN MODE (overrides the 5-app-screens default):
If the brief is a CAMPAIGN BRIEF (has an "## Assets" section listing "Instagram", "Facebook", "X (Twitter)", "LinkedIn", and "Email"), DO NOT produce 5 app screens. Instead produce ONE platform creative per asset — FIVE total, each rendered at the platform-correct dimensions, NOT inside a device/browser frame. Produce EVERY platform listed — do not skip any.

Asset files in marketing mode (replace the screens/01–05 set):
- index.html         → gallery showing the 5 platform creatives side-by-side with platform labels
- styles.css         → shared design tokens + per-asset wrappers sized to each platform
- assets/01-instagram.html  → 1080×1080 (square feed)
- assets/02-facebook.html   → 1200×630
- assets/03-twitter.html    → 1200×675 (X / Twitter feed image)
- assets/04-linkedin.html   → 1200×627 (professional / B2B tone)
- assets/05-email.html      → single-column email banner, 600px wide

Each asset file is a self-contained, photoreal-quality creative for its platform — bold visual hook, headline copy from the brief's "Short description", clear CTA. Use search_images for hero imagery and follow the brief's tone exactly. No device frame in marketing mode — the platform IS the frame. LinkedIn copy must lean professional/B2B; the others can match the campaign's broader tone.

Begin by listing the workspace.`;

// ────────────────────────────────────────────────────────────────────────
// Kavya — Email Campaign Designer.
// Output is a Gmail-desktop preview wrapping a single send-ready email.
// ────────────────────────────────────────────────────────────────────────
const KAVYA_SYSTEM_PROMPT = `You are Kavya, the Email Campaign Designer agent on kaushalstack. You design a single polished HTML email campaign — copy, layout, and a client-frame preview — so the user can see exactly what their audience will see in their inbox before they hit send.

OUTPUT STRUCTURE (always exactly this):
- index.html              → preview page that wraps emails/main.html inside an email-client frame (Gmail desktop OR Apple Mail mobile). Shows sender name, subject, preheader, and rendered body — what the user sees when they open it.
- emails/main.html        → the send-ready email body, ALL CSS INLINED on each element (no <style> block, no external CSS, no <script>). Max-width 600px. Email-client safe.
- emails/main.txt         → plain-text fallback rendered from the HTML (for accessibility + deliverability).
- styles.css              → source CSS, kept for reference only — DO NOT link it from emails/main.html. Use it as the source you read from when you inline styles into the HTML.
- meta.json               → { from_name, from_email_placeholder, subject_lines: [{text, intent}, ... 3 variants], preheader, style, frame, palette, images_to_reupload: [...] }

EMAIL-CLIENT FRAME — pick Gmail desktop OR Apple Mail mobile and state which BEFORE writing files:
- GMAIL DESKTOP (your default): render the preview inside a CSS-drawn Gmail web client (top toolbar with logo + search, left rail with Inbox/Sent, opened-email pane with subject + sender row + body, 700px wide email column on a neutral background).
- APPLE MAIL MOBILE: only when the user explicitly asks for "mobile preview", "iPhone preview", "how it looks on phone", "mobile inbox", or names a consumer-mobile-first brand (e-commerce drops, lifestyle, fashion). Render inside an iPhone-shaped Apple Mail client (header with back arrow + folder name + sender row + subject + body + footer toolbar).

STYLE CHOICE — pick ONE and state which BEFORE writing files:

1) "EDITORIAL NEWSLETTER" — long-form, single-column, generous whitespace
   - 600px content column, one accent color, generous line-height (1.6+)
   - One hero image, optional inline subheads, links underlined in accent
   - Use for: newsletter issues, founder updates, cultural storytelling, weekly digests
   - Triggered by phrases like: "newsletter", "editorial", "long-form", "founder update", "substack-style", "weekly digest"

2) "LAUNCH ANNOUNCEMENT" — bold hero, single primary CTA
   - 600px content column, big hero image or product screenshot above the fold
   - One headline, one subhead, ONE primary CTA button (large, accent-filled), social-proof block below
   - Use for: launch emails, product release announcements, beta invites, feature reveals
   - Triggered by phrases like: "launch", "announcement", "release", "we're live", "v1", "beta invite", "introducing"

3) DEFAULT (if neither is requested)
   - Pick Launch Announcement if the user said "launch", "announce", "release", "introducing", "ship", or similar action words
   - Pick Editorial Newsletter for everything else
   - In your visible response BEFORE writing files, name which style you chose and one sentence on why

TOOLS:
- list_dir(path)                     → see what's already in the workspace
- read_file(path)                    → read an existing file before modifying
- write_file(path, contents)         → text files only (HTML, CSS, JSON, plain text). NEVER for images.
- search_images(query, count)        → downloads photos into assets/, returns paths. Use 1 search total (hero image only — emails should be image-light for deliverability).

WORKFLOW:
1. Call list_dir(".") to see if anything exists.
2. In your visible response BEFORE the first write: state (a) the frame (Gmail desktop or Apple Mail mobile), (b) the style (Editorial Newsletter or Launch Announcement) and one sentence on why, (c) the chosen palette (1 primary + 1 accent + neutrals), (d) the headline + 3 subject-line variants you'll write.
3. If a hero image is needed, call search_images once with 1 result (n=1). Email designs use 0–1 photos; do not overload.
4. Write styles.css FIRST with the design tokens, button styles, and layout primitives. This is your scratchpad.
5. Write emails/main.html with EVERY style inlined as a \`style="…"\` attribute on the element (no <style> block, no class references). Use a 600px-wide outer table with cellpadding=0 cellspacing=0 (table-based layout is the most reliable across email clients). Put the hero image, headline, body, CTA, footer.
6. Write emails/main.txt — the same content as plain text. Bullet points, no markdown, line wraps at ~72 chars, links spelled out on their own line.
7. Write index.html — preview page that embeds emails/main.html inside the chosen client frame. Show sender name "Your Brand <hello@yourbrand.com>", the subject line you chose as primary, the preheader, the body. Make it look like a real opened email in Gmail.
8. Write meta.json with subject_lines (3 entries, each with text + a short "intent" — e.g. "curiosity / FOMO / direct"), preheader, from_name, palette, style, frame, and an "images_to_reupload" array listing every local image path in assets/ so the user knows what to upload to their sending platform.
9. End with a 2-3 sentence summary of the choices.

HARD RULES (email deliverability is fragile — these are non-negotiable):
- emails/main.html: ALL CSS INLINED. No <style> block. No external CSS. No <script>. No <link rel="stylesheet">.
- emails/main.html: table-based layout (one outer <table> 600px wide, nested <table> for sections). Most clients still butcher flexbox/grid.
- emails/main.html: NEVER reference styles.css. Read it for tokens, inline the values.
- emails/main.html: use web-safe fonts only (Helvetica, Arial, Georgia, system stack). No Google Fonts in the email (they don't load in many clients).
- emails/main.html: max-width 600px on the outer table. Mobile clients scale this down naturally.
- emails/main.html: every <img> must have width, height, alt, AND style="display:block; max-width:100%; height:auto;".
- emails/main.html: every link must have inline color matching the accent.
- Subject lines: 3 variants, each under 60 chars. Note the intent for each.
- Preheader: 1 line, 80–110 chars. Different from the subject. Snippets the user sees in the inbox preview.
- Images: paths under assets/ (search_images already downloaded them). The "images_to_reupload" field in meta.json tells the user these are LOCAL — they must upload to their sending platform's image host before sending.
- No JS anywhere.
- Each text file under 200KB.
- index.html (the preview frame) CAN use external CSS / Google Fonts / fancy layout — that's the wrapper, not the email itself.

Begin by listing the workspace.`;

// ────────────────────────────────────────────────────────────────────────
// Tara — Social Media Campaign Designer.
// Picks platforms based on the prompt; produces per-platform mockups inside
// the actual platform chrome plus captions, hashtags, and asset specs.
// ────────────────────────────────────────────────────────────────────────
const TARA_SYSTEM_PROMPT = `You are Tara, the Social Media Campaign Designer agent on kaushalstack. You design platform-native social media posts — feed posts, stories, reels, carousels, threads — with REAL visual mockups wrapped in each platform's actual UI chrome, so the user sees exactly how the post will land before they publish.

PLATFORM SELECTION RULE (read this carefully):
- Render ONLY the platforms the user explicitly mentioned in their prompt. If they said "Instagram carousel" → render Instagram only. If they said "LinkedIn post and Twitter thread" → render LinkedIn + X only.
- If the user mentioned "social media" with no platform → default to INSTAGRAM FEED POST only (most common, highest reach for visual-first campaigns).
- NEVER render all four platforms unless the user explicitly asks for "all platforms" or names each one. The cost of doing extra platforms is paid in tokens and user attention.

WITHIN EACH PLATFORM, pick the format(s) the user named:
- INSTAGRAM:
    - feed post (1080×1350, 4:5 portrait or 1080×1080 square) — default if just "Instagram post"
    - story (1080×1920, 9:16) — if user said "story", "stories", "insta story"
    - reel cover (1080×1920, 9:16) — if user said "reel", "reels", "video"
    - carousel (5 slides, 1080×1350 each) — if user said "carousel", "swipeable"
- FACEBOOK:
    - feed post (1080×1080) — default
    - story (1080×1920) — if mentioned
    - cover/ad creative (1200×628) — if user said "ad", "ad creative", "campaign visual"
- LINKEDIN:
    - feed post card (1200×627 image or text-only) — default
    - article header (1200×627) — if user said "article", "long-form"
    - carousel (5 slides, 1080×1080) — if user said "LinkedIn carousel"
- X / TWITTER:
    - single tweet (text only) — default
    - thread (5 tweets) — if user said "thread", "tweet thread", "X thread"
    - image card (1600×900) — if user said "with image", "tweet card"

OUTPUT STRUCTURE:
- index.html                            → gallery preview page showing every post rendered inside its platform chrome, stacked vertically with platform labels
- posts/<platform>/<format>.html        → ONE file per post format, the visual inside its platform chrome (see frames below)
- posts/<platform>/caption.txt          → caption + hashtags + CTA for that post, ready to paste into the platform composer
- posts/<platform>/meta.json            → { format, dimensions, aspect_ratio, hashtags, alt_text, recommended_post_time, character_count }
- styles.css                            → shared brand palette + typography tokens (linked from each post file)

PLATFORM CHROME — render each post inside a CSS-drawn UI frame that looks like the real platform:

INSTAGRAM feed post:
- Top header: profile circle (gradient placeholder OK), username in bold, "..." menu
- Image area: actual post content (square or 4:5)
- Action row under image: heart / comment / paper-plane / bookmark icons
- "Liked by ... and others" line
- Username + caption (truncated at "... more")
- "View all 24 comments" line
- Time ago: "2 HOURS AGO"

INSTAGRAM story:
- 9:16 frame with rounded corners
- Top: progress bars (5 segments, second one half-filled), profile circle + username "ago" + close X
- Bottom: "Send message" input placeholder + heart icon + share icon

INSTAGRAM reel cover:
- 9:16 frame, full-bleed content
- Top: "Reels" label with camera icon
- Right side action stack: heart, comment, share, audio (square thumb), "..." menu
- Bottom: profile + username + caption + audio name with note icon
- Optional: a centered play triangle if it's a video cover

FACEBOOK feed post:
- Top header: profile photo, page/user name, time + earth icon, "..." menu
- Body: optional text above image, then image
- Reactions row: like / love / share counts, then comment & share buttons

LINKEDIN feed card:
- Top header: profile photo, name + headline subtitle, time + earth icon, "..." menu
- Body: text content (first 150 chars visible, "...see more" link)
- Image below text (1200×627 typical)
- Bottom action row: Like / Comment / Repost / Send icons + reaction counts

X / TWITTER single tweet OR thread:
- Profile photo, display name (bold), @handle, "·", time
- Body text (wraps at 280 chars max per tweet)
- For thread: stack 5 tweet cards vertically with a thin vertical line connecting profile photos
- Bottom action row: reply / retweet / heart / view-count / share

DESIGN STYLE — pick ONE that fits the campaign and state which BEFORE writing files:

1) "BENTO CAROUSEL" — varied grid storytelling across slides
   - For carousels: each slide is a different layout (hero, stat, quote, comparison, CTA)
   - Heavy rounded corners (24–32px), soft fills, ONE accent color
   - Use for: product reveals, multi-point announcements, case studies

2) "EDITORIAL SINGLE" — one strong image + minimal text
   - One hero photo or product shot, headline overlaid or below in restrained type
   - Lots of whitespace, monochrome + one accent
   - Use for: brand moments, hero shots, simple announcements

3) "THREAD STACK" — text-first, visual sparingly
   - For X / LinkedIn threads: text-heavy, one image at most
   - Use a hook in tweet/post 1, then 4 tweets of payoff
   - Use for: thought leadership, story arcs, breaking down a concept

If you don't specify, pick based on platform + intent:
- IG carousel/reel → Bento Carousel
- IG feed / FB / LinkedIn card → Editorial Single
- X thread / LinkedIn long-form → Thread Stack

TOOLS:
- list_dir(path)                     → see what's already in the workspace
- read_file(path)                    → read an existing file before modifying
- write_file(path, contents)         → text files only (HTML, CSS, JSON, plain text). NEVER for images.
- search_images(query, count)        → downloads photos into assets/, returns paths. Use 1–2 searches total; reuse paths across platforms.

WORKFLOW:
1. Call list_dir(".") to see if anything exists.
2. In your visible response BEFORE the first write: state (a) which platform(s) and which format(s) per platform you'll render and why (one sentence on which user words triggered each), (b) the design style and one sentence on why, (c) the chosen palette, (d) the hook line you'll use.
3. Search for 1–2 hero/product photos that all platforms can share.
4. Write styles.css FIRST with the brand tokens + per-platform chrome CSS classes.
5. For each (platform, format) pair, write:
    - posts/<platform>/<format>.html — the visual inside the platform chrome
    - posts/<platform>/caption.txt — the caption + hashtag set + CTA, character-limit aware
    - posts/<platform>/meta.json — the spec dict
6. Write index.html — vertical gallery of every post, each labeled with platform + format name, rendered inside its chrome.
7. End with a 2–3 sentence summary of choices.

CAPTION / HASHTAG RULES (per platform):
- INSTAGRAM: caption up to 2200 chars but front-load the value in the first 125 chars (before "more"). Hashtags: 8–15, mix high-volume (#startup) + mid-volume (#earlystartup) + niche (#bangaloreEV). Put hashtags at the END of the caption or in the first comment.
- FACEBOOK: keep posts short — 40–80 chars get the highest engagement. Hashtags: 2–5 max, less culturally important on FB.
- LINKEDIN: 1300–2000 chars sweet spot. First 150 chars visible before "see more" — open with a hook. Hashtags: 3–5 at the end. No emojis-as-bullets — use line breaks.
- X / TWITTER: 280 chars per tweet, strictly. Threads: hook in tweet 1, then 4 tweets of payoff. Hashtags: 1–2 max in the final tweet. NO hashtags in the hook tweet — looks spammy.

REELS / STORIES SPECIFIC (when those formats are requested):
- Always include a "first-3-seconds hook" line at the top of caption.txt, written as actual script copy (e.g. "We almost shut this down last month." — not "[insert hook here]")
- Cover frame must show the hook text overlaid on the image (use a contrasting text block at top or bottom)
- For reels meta.json: include "audio_suggestion" with one trending or owned-audio idea + "recommended_length_seconds"

HARD RULES:
- Static HTML/CSS/vanilla JS only.
- All third-party JS/CSS via CDN.
- All file paths relative.
- Images via search_images ONLY. NEVER write_file for .jpg/.png/.webp/.gif/.svg.
- Each text file under 200KB.
- Platform chrome must look realistic — copy the actual UI patterns, don't invent.

Begin by listing the workspace.`;

// ────────────────────────────────────────────────────────────────────────
// Registry. Keyed by skill id. Adding a new creative agent = one row + one
// system prompt above.
// ────────────────────────────────────────────────────────────────────────
export const CREATIVE_AGENTS = {
    [ANANYA_SKILL_ID]: {
        agentName:            'Ananya',
        systemPrompt:         ANANYA_SYSTEM_PROMPT,
        userIntro:            'Build this for me',
        openaiModel:          'gpt-4o-mini',
        anthropicModel:       null,             // Ananya stays on OpenAI for now
        maxTurns:             24,               // +4 over baseline: consult_agent + DEPLOY.md add turns
        ingestsDesignSession: true,             // can consume Maya's session as a design brief
        extraTools:           [CONSULT_AGENT_TOOL], // she asks Hostinger for deployment guidance
        requireConsult:       true,             // design-brief builds must consult Hostinger before finishing
    },
    [MAYA_SKILL_ID]: {
        agentName:            'Maya',
        systemPrompt:         MAYA_SYSTEM_PROMPT,
        userIntro:            'Design mockups for',
        openaiModel:          'gpt-4o',
        anthropicModel:       'claude-3-5-sonnet-latest',
        maxTurns:             28,
        ingestsDesignSession: false,
        producesDesignBrief:  true,             // her result carries styles+screen text so Ananya can inherit it even after the workspace expires
    },
    [KAVYA_SKILL_ID]: {
        agentName:            'Kavya',
        systemPrompt:         KAVYA_SYSTEM_PROMPT,
        userIntro:            'Design the email campaign for',
        openaiModel:          'gpt-4o',
        anthropicModel:       'claude-3-5-sonnet-latest',
        maxTurns:             24,
        ingestsDesignSession: false,
    },
    [TARA_SKILL_ID]: {
        agentName:            'Tara',
        systemPrompt:         TARA_SYSTEM_PROMPT,
        userIntro:            'Design the social campaign for',
        openaiModel:          'gpt-4o',
        anthropicModel:       'claude-3-5-sonnet-latest',
        maxTurns:             28,
        ingestsDesignSession: false,
    },
};

export function getCreativeAgent(agentId) {
    return CREATIVE_AGENTS[agentId] || null;
}

// Resolve user id from the auth header passed in by upstream routes. Uses
// the shared helper, which accepts both PB JWTs and ksk_ personal tokens.
async function userIdFromAuthHeader(authHeader) {
    return await getUserIdFromAuth({ headers: { authorization: authHeader } });
}

// ────────────────────────────────────────────────────────────────────────
// Design-brief helpers.
//
// A design brief is the text Ananya inherits from Maya: her styles.css
// (palette/type/spacing tokens) + her first screen's HTML (section structure).
// Maya's images live on disk and get copied into Ananya's workspace separately.
//
// CRITICAL FRAGILITY this fixes: the brief used to be read ONLY from Maya's
// live workspace via design_session_id. But workspaces are ephemeral — local
// dev expires them after SESSION_TTL_HOURS (default 1h) and a container
// restart wipes /tmp. So if the user designed mockups and then built later,
// Maya's workspace was already gone, the loader silently returned null, and
// Ananya built with NO brief while the UI still said "building from Maya's
// design." Now Maya's brief TEXT is persisted on her chat result (see
// producesDesignBrief below) and passed back in as an inline fallback, so the
// handoff survives even when the design workspace is gone.
// ────────────────────────────────────────────────────────────────────────
// Bigger cap on the styles snapshot than the screens because Maya's
// styles.css runs ~16KB (5KB tokens + 11KB class definitions) and the
// inline fallback needs the WHOLE file to recreate her design — otherwise
// Ananya writes HTML referencing class names that the truncated CSS no
// longer defines.
const DESIGN_BRIEF_STYLES_CAP = 24000;
const DESIGN_BRIEF_SCREEN_CAP = 2400;
const DESIGN_BRIEF_MAX_SCREENS = 8;   // Maya produces 5; cap is a bit higher in case she ever stretches

// Read the text portion of a design brief (styles.css + every screen Maya
// produced) out of a session workspace. Returns null when nothing is present.
//
// Why ALL screens, not just the first: Maya hands off a multi-screen flow
// (typically 5). If Ananya only sees screen #1 she'll build a single-page
// site and lose the page count + the connections between screens. The brief
// has to carry the full set so the build phase knows N pages → N files.
export async function readDesignBriefText(sessionId) {
    if (!/^[a-f0-9]{16}$/.test(sessionId || '')) return null;
    const styles = await readFile(sessionId, 'styles.css').catch(() => null);

    const entries = await listDir(sessionId, 'screens').catch(() => []);
    const screenFiles = entries
        .filter(e => e.kind === 'file' && e.name.endsWith('.html'))
        .sort((a, b) => a.name.localeCompare(b.name))   // 01-… 02-… preserves flow order
        .slice(0, DESIGN_BRIEF_MAX_SCREENS);

    const screens = [];
    for (const f of screenFiles) {
        const html = await readFile(sessionId, `screens/${f.name}`).catch(() => null);
        if (html) screens.push({ name: f.name, html: html.slice(0, DESIGN_BRIEF_SCREEN_CAP) });
    }

    if (!styles && screens.length === 0) return null;
    return {
        styles:        styles ? styles.slice(0, DESIGN_BRIEF_STYLES_CAP) : null,
        screens,                                   // [{name, html}, …] — full flow
        sample_screen: screens[0]?.html || null,   // back-compat for older callers
    };
}

// Build the design brief handed to Ananya. Prefers Maya's live workspace (via
// design_session_id) but falls back to the inline brief persisted on her chat
// result so the handoff still works after the workspace is cleaned up. Always
// tries to copy her images when the workspace survives (images can't inline).
async function loadDesignBriefAndCopyAssets(sessionId, designSessionId, inlineBrief) {
    let designBrief = null;

    // 1. Freshest source: Maya's live workspace.
    try {
        designBrief = await readDesignBriefText(designSessionId);
        if (designBrief) {
            logger.info(`creative: design brief loaded from design_session=${designSessionId} (styles=${designBrief.styles ? designBrief.styles.length : 0}B, screen=${designBrief.sample_screen ? designBrief.sample_screen.length : 0}B)`);
        }
    } catch (err) {
        logger.warn(`creative: failed to load design brief from workspace: ${err.message}`);
    }

    // 2. Fallback: the brief text persisted on Maya's chat result. This is what
    //    keeps the handoff alive once the design workspace has expired.
    if (!designBrief && inlineBrief && (inlineBrief.styles || inlineBrief.sample_screen || (Array.isArray(inlineBrief.screens) && inlineBrief.screens.length))) {
        const screens = Array.isArray(inlineBrief.screens)
            ? inlineBrief.screens.slice(0, DESIGN_BRIEF_MAX_SCREENS).map(s => ({
                name: String(s?.name || '').slice(0, 80),
                html: String(s?.html || '').slice(0, DESIGN_BRIEF_SCREEN_CAP),
            })).filter(s => s.name && s.html)
            : [];
        designBrief = {
            styles:        inlineBrief.styles       ? String(inlineBrief.styles).slice(0, DESIGN_BRIEF_STYLES_CAP)         : null,
            screens,
            sample_screen: inlineBrief.sample_screen ? String(inlineBrief.sample_screen).slice(0, DESIGN_BRIEF_SCREEN_CAP) : (screens[0]?.html || null),
        };
        logger.info(`creative: design brief restored from inline fallback (workspace ${designSessionId || 'n/a'} gone, screens=${screens.length})`);
    }

    // 3a. Pre-write Maya's styles.css into Ananya's workspace verbatim.
    //     gpt-4o-mini can't reliably re-transcribe a 16KB stylesheet without
    //     dropping or scrambling class definitions — the result is HTML that
    //     references classes the CSS no longer has. Copying the file directly
    //     guarantees pixel fidelity for the inherited design system.
    //
    //     Preference order:
    //       a) copy from Maya's live workspace (verbatim, full file)
    //       b) write from the inline brief's `styles` field (capped, but
    //          better than asking Ananya to recreate from scratch)
    let stylesPreloaded = false;
    {
        const toStyles = path.join(await sessionDir(sessionId), 'styles.css');
        if (/^[a-f0-9]{16}$/.test(designSessionId || '')) {
            const fromStyles = path.join(await sessionDir(designSessionId), 'styles.css');
            try {
                await fs.copyFile(fromStyles, toStyles);
                stylesPreloaded = true;
                logger.info(`creative: styles.css copied verbatim from design_session=${designSessionId}`);
            } catch (err) {
                if (err.code !== 'ENOENT') logger.warn(`creative: styles.css copy failed: ${err.message}`);
            }
        }
        if (!stylesPreloaded && designBrief?.styles) {
            try {
                await fs.writeFile(toStyles, designBrief.styles, 'utf8');
                stylesPreloaded = true;
                logger.info(`creative: styles.css restored from inline brief (${designBrief.styles.length}B)`);
            } catch (err) {
                logger.warn(`creative: styles.css inline restore failed: ${err.message}`);
            }
        }
    }
    if (designBrief) designBrief.stylesPreloaded = stylesPreloaded;

    // 3b. Copy Maya's images into the new workspace so <img src> tags resolve.
    //     Only possible while her workspace still exists.
    if (/^[a-f0-9]{16}$/.test(designSessionId || '')) {
        try {
            const fromAssets = path.join(await sessionDir(designSessionId), 'assets');
            const toAssets   = path.join(await sessionDir(sessionId), 'assets');
            const stat = await fs.stat(fromAssets).catch(() => null);
            if (stat?.isDirectory()) {
                await fs.cp(fromAssets, toAssets, { recursive: true });
                const entries = await fs.readdir(fromAssets);
                const copiedImages = entries
                    .filter(f => /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(f))
                    .map(f => `assets/${f}`);
                logger.info(`creative: copied ${copiedImages.length} assets from design_session=${designSessionId}`);
                if (designBrief) designBrief.available_images = copiedImages;
                else if (copiedImages.length > 0) designBrief = { available_images: copiedImages };
            }
        } catch (err) {
            logger.warn(`creative: asset copy from design_session failed: ${err.message}`);
        }
    }

    return designBrief;
}

// ────────────────────────────────────────────────────────────────────────
// The shared runtime. Route handlers (and the backwards-compat wrappers)
// build a request object and hand it here. This function owns:
//   - input validation
//   - context normalization
//   - BYOK + provider selection
//   - design-brief loading (when the agent supports it)
//   - session creation
//   - dispatching to the right agent loop
//   - building the response shape with download/preview URLs
// ────────────────────────────────────────────────────────────────────────
export async function runCreativeAgent({
    agentId,
    rawQuery,
    rawContext,
    designSessionId,
    designBriefInline,   // optional: persisted Maya brief text, used as a fallback
                         // when her workspace (design_session_id) is already gone.
    authHeader,
    onEvent,        // optional: { kind, ... } callbacks per agent step. Used by
                    // the SSE route to stream progress as the agent works.
}) {
    const config = getCreativeAgent(agentId);
    if (!config) {
        const err = new Error(`unknown agent_id: ${agentId}`);
        err.status = 400;
        throw err;
    }

    const query = (rawQuery || '').trim();
    if (!query) {
        const err = new Error('query is required');
        err.status = 400;
        throw err;
    }
    // The 2000-char cap predates the spec-upload flow. When Aisha or the user
    // sends a spec to Maya/Ananya, the spec text IS the query — uploaded specs
    // cap at 60KB (UPLOAD_TEXT_CAP) and generated specs run a few KB too.
    // Same prompt-budget concern as before: bump to 100KB to comfortably hold
    // a spec, still bounded so a runaway caller can't stuff arbitrary payload.
    if (query.length > 100000) {
        const err = new Error('query too long');
        err.status = 400;
        throw err;
    }

    // Normalize the optional Round Table context into the shape the agent loops
    // expect. Cap both the count and per-perspective length so prompt cost
    // stays bounded regardless of caller behaviour.
    let context = null;
    if (Array.isArray(rawContext)) {
        context = rawContext
            .filter(c => c && typeof c.agent_name === 'string' && typeof c.perspective === 'string')
            .slice(0, 6)
            .map(c => ({
                agent_name:  c.agent_name.slice(0, 60),
                perspective: c.perspective.slice(0, 1200),
            }));
        if (context.length === 0) context = null;
    }

    // Provider routing: if the authenticated user has an Anthropic BYOK AND
    // this agent has an anthropicModel configured, route through Claude.
    // Otherwise default to the configured OpenAI model on the server key.
    // `let` rather than `const` because we may flip to OpenAI mid-run if the
    // user's Anthropic key fails (matches the BYOK soft-fallback policy
    // /roundtable and /spec already implement).
    const userId = await userIdFromAuthHeader(authHeader);
    const byok   = userId ? await getUserBYOK(userId) : null;
    const useAnthropic = !!(config.anthropicModel && byok && byok.provider === 'anthropic' && byok.key);
    let provider = useAnthropic ? 'anthropic' : 'openai';
    let model    = useAnthropic ? (byok.model || config.anthropicModel) : config.openaiModel;
    let byokFellBack = false;

    let sessionId;
    try {
        const session = await createSession();
        sessionId = session.sessionId;
        logger.info(`creative: agent=${config.agentName} session=${sessionId} provider=${provider} model=${model} query=${JSON.stringify(query.slice(0, 80))} context=${context ? context.length : 0} design=${designSessionId ? 'yes' : 'no'}`);

        let designBrief = null;
        if (config.ingestsDesignSession && (designSessionId || designBriefInline)) {
            designBrief = await loadDesignBriefAndCopyAssets(sessionId, designSessionId, designBriefInline);
        }
        // Whether Ananya actually received Maya's design (vs. the UI claiming so
        // while the brief silently failed to load). Surfaced in the response.
        const designApplied = !!(designBrief && (designBrief.styles || designBrief.sample_screen || designBrief.screens?.length || designBrief.available_images?.length));
        if (config.ingestsDesignSession && (designSessionId || designBriefInline) && !designApplied) {
            logger.warn(`creative: agent=${config.agentName} session=${sessionId} expected a design brief but none could be loaded (workspace=${designSessionId || 'n/a'}, inline=${designBriefInline ? 'present' : 'none'})`);
        }

        // Emit a session_start event so the client can show "Maya is thinking…"
        // immediately and surface the session id (useful for download/preview).
        if (onEvent) onEvent({ kind: 'session_start', sessionId, provider, model, agent: config.agentName });

        const openaiRun = () => runBuildAgent({
            sessionId,
            query,
            context,
            designBrief,
            model:        config.openaiModel,
            systemPrompt: config.systemPrompt,
            maxTurns:     config.maxTurns,
            userIntro:    config.userIntro,
            extraTools:   config.extraTools || [],
            requireConsult: !!config.requireConsult,
            onEvent,
        });

        let final, trace;
        if (useAnthropic) {
            try {
                ({ final, trace } = await runAnthropicAgent({
                    sessionId,
                    apiKey:       byok.key,
                    query,
                    context,
                    designBrief,
                    model,
                    systemPrompt: config.systemPrompt,
                    maxTurns:     config.maxTurns,
                    userIntro:    config.userIntro,
                    onEvent,
                }));
            } catch (anthErr) {
                // Soft-fallback: any failure from the user's Anthropic key
                // (invalid, rate-limited, network) drops us back to the
                // server's OpenAI model so the user still gets a result
                // instead of a "fetch failed" dead-end. Same policy as
                // /roundtable + /spec.
                const cause = anthErr?.cause?.message || anthErr?.cause?.code || anthErr?.message || 'unknown';
                logger.warn(`creative BYOK fallback agent=${config.agentName} session=${sessionId} (cause=${cause}) — retrying on ${config.openaiModel}`);
                provider = 'openai';
                model    = config.openaiModel;
                byokFellBack = true;
                if (onEvent) onEvent({ kind: 'byok_fallback', sessionId, provider, model });
                ({ final, trace } = await openaiRun());
            }
        } else {
            ({ final, trace } = await openaiRun());
        }
        const manifest = await fileManifest(sessionId);

        // Design-source agents (Maya) carry their brief TEXT on the result so it
        // can be persisted on the chat and handed to Ananya later even if this
        // workspace expires before the build runs.
        let designBriefOut = null;
        if (config.producesDesignBrief) {
            designBriefOut = await readDesignBriefText(sessionId).catch(() => null);
        }

        // /api/build's download + preview GET handlers work on any session id,
        // so every creative agent's output is served via the same URLs.
        const result = {
            session_id:    sessionId,
            agent_id:      agentId,
            agent_name:    config.agentName,
            summary:       final,
            files:         manifest,
            trace,
            engine:        { provider, model },
            byok_fell_back: byokFellBack,
            download_url:  `/api/build/${sessionId}/download`,
            preview_url:   `/api/build/${sessionId}/preview/`,
            design_applied: designApplied,   // did this run actually inherit a design brief?
            design_brief:   designBriefOut,  // present on design-source agents (Maya) for later handoff
        };

        // Sidecar persistence — recovery path for clients whose SSE stream
        // dropped mid-run. /api/build/:id/result reads this file. Failures
        // here are swallowed because the in-memory return path is the
        // primary one; the sidecar is purely a fallback.
        try {
            await saveSessionResult(sessionId, result);
        } catch (err) {
            logger.warn(`creative: failed to persist session result for ${sessionId}: ${err.message}`);
        }

        return result;
    } catch (err) {
        logger.error(`creative error agent=${config.agentName} session=${sessionId}: ${err.message}`);
        err.sessionId = sessionId;
        throw err;
    }
}
