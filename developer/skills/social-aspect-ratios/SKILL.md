---
name: social-aspect-ratios
description: Pick the right aspect ratio + export resolution for a social image or video (Facebook, Instagram, Meta ads) — 2026 specs. Use when choosing/resizing a card format in Card Studio, generating campaign creatives, or answering "what size should this post be".
---

# Social aspect ratios — 2026 Meta / Instagram specs

## Decision rules (apply in order)

1. **Event promotion → Landscape 1.91:1** (1200×630). Events prefer landscape; this size
   doubles as the FB link-preview format.
2. **Instagram feed (or FB+IG together) → Portrait 4:5** (1080×1350). Fills the most
   mobile feed space; the safe cross-platform default.
3. **Stories/Reels → 9:16** (1080×1920). Never send 9:16 to the IG *feed* — feed accepts
   only 4:5 through 1.91:1.
4. **IG grid consistency matters most → 3:4** (1080×1440) — matches the post-2025 grid
   preview exactly, so nothing crops.
5. **No signal at all → Square 1:1** (1080×1080).

Quick three to remember: **1080×1350 (4:5) feed · 1080×1920 (9:16) Stories/Reels ·
1200×630 (1.91:1) link previews/events.**

## Facebook

| Use | Ratio | Export |
|---|---|---|
| Feed image | 4:5 | 1080×1350 |
| Stories | 9:16 | 1080×1920 |
| Link preview / events | 1.91:1 | 1200×630 |
| **Paid placements (ads)** | 1:1 / 4:5 | **1440×1440 / 1440×1800** — Meta now recommends higher-res exports for ads; the old 1080px minimums can show upscaling artifacts on newer devices |

## Instagram

**Feed** (accepted range 4:5 → 1.91:1):
- **4:5 — 1080×1350 — recommended default** (most feed real estate on mobile)
- 3:4 — 1080×1440 — matches the newer profile grid exactly (no grid crop)
- 1:1 — 1080×1080 — fine for centered, symmetrical content
- 1.91:1 — 1080×566 — weakest for feed visibility; only for genuinely wide shots

**Profile grid (changed 2025, holds through 2026):** the grid preview is now **3:4**, not
square. Even a 4:5 post gets its thumbnail cropped to ~3:4 — keep faces/text/logos
centered so nothing chops off top/bottom.

**Stories & Reels:** 9:16 — 1080×1920. **Safe zone: keep key content ~250px clear of the
top and bottom** (username, captions, action buttons live there). Reels cover thumbnails
crop to ~4:5–3:4 on the grid — design covers for that crop.

**Carousels:** up to 20 slides; the FIRST slide's ratio locks the rest. Keep all slides
the same ratio; 1080×1350 is the safe default.

**Profile photo:** 1:1, ≥320×320, displayed as a circle — keep key elements off corners.

## How Card Studio implements this

`apps/api/src/routes/studio.js` — the **Format** select in the Style panel maps to a
`FORMATS` table: `square 1/1 @1080`, `portrait 4/5 @1080`, `grid 3/4 @1080`,
`landscape 1.91/1 @1200`, `story 9/16 @1080`. Changing it sets the card's CSS
`aspect-ratio`; every export (`downloadCard`, `composeCardPng`,
`composeCardImageNoText`, video overlays) uses `exportScale()` =
`FORMATS[currentFormat].w / card.clientWidth` so the output lands at the target pixel
width. The publish panel disables the Instagram checkbox for `story` (outside IG feed
range) and for videos (IG video not yet supported); the IG preview mock shows the same
warning. For ad exports at 1440px, bump the format's `w` (or add an `ads` variant).

## Gotchas
- IG feed **rejects** images taller than 4:5 or wider than 1.91:1 — resize before upload,
  don't rely on IG to crop.
- IG's publish API fetches media from a **public URL** (no byte upload) — Studio stages
  the composed PNG in the session workspace first.
- Don't upscale a 1080px export for ads; re-export at 1440px from source.
