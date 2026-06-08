# CLAUDE.md — Working Notes

Process rules and gotchas for this repo. Read this before making layout changes.

## Viewports

Two viewports drive every layout decision:

| View      | Viewport       | Spine grid                       | Marker layout                     |
|-----------|----------------|----------------------------------|-----------------------------------|
| **Desktop** | width ≥ 901px | `grid-template-columns:1fr 140px 1fr` | Vertical (dot/num/label stacked) in center column |
| **Mobile**  | width ≤ 900px | `grid-template-columns:1fr` (single)  | Horizontal row at top of section (dot absolute on spine line, num + label inline) |

The mobile breakpoint is `@media(max-width:900px)`. Some component-level rules also use `@media(max-width:680px)` for tighter phone-only tweaks (eg. donut, cine gallery, CTA pill paddings).

## `data-side` on spine sections

`data-side` is set on `.nac-spine-section`. It drives where content sits on **desktop**. On mobile, every value collapses to single-column.

| `data-side` value | Desktop layout                                           | HTML inner wrapper(s)                          | Mobile (auto)         |
|-------------------|----------------------------------------------------------|------------------------------------------------|-----------------------|
| `left`            | Content in col 1 (left of spine)                         | `.nac-spine-content`                           | Single col            |
| `right`           | Content in col 3 (right of spine)                        | `.nac-spine-content`                           | Single col            |
| `full`            | Content spans all 3 cols, max-width 900px, centered      | `.nac-spine-content`                           | Single col            |
| `both`            | Two columns — left in col 1, right in col 3              | `.nac-spine-left` + `.nac-spine-right`         | Both stack in col 1   |

**Critical:** to "collapse a section into one view on mobile only," do NOT change `data-side`. The mobile media query already stacks `both` into a single column. Changing `data-side` affects the **desktop** layout too.

## Common pitfalls (learned the hard way)

1. **Don't change `data-side` to fix mobile.** It changes desktop. The mobile CSS already collapses `both` to single column. If a `both` section looks wrong on mobile, fix the mobile media query, not the structure.

2. **Always check both views.** Before reporting a task done, mentally walk through what changed at desktop (≥901px) AND mobile (≤900px) widths. The user has called this out as a recurring issue.

3. **`@media(max-width:680px)` is for phone-only polish** (tighter padding, smaller fonts on the pills, donut, gallery). Use this when a change should affect phones only, not tablets.

4. **`.nac-spine-marker` on mobile** uses `position:relative` with `padding-left:22px` and an absolute-positioned `.nac-spine-dot` at `left:-9px` so the dot floats over the spine line. Don't apply margin-left to the marker — it shifts the section number text off-position.

5. **Image breaks** — the old single cinematic gallery (`#nac-gallery`) was replaced with 3 individual full-bleed image sections (`#nac-img-1`, `#nac-img-2`, `#nac-img-3`) distributed at §04, §07, §10 in the spine. `#nac-img-3` has class `nac-cine--aspiration` (gradient overlay + CTA button). These are standard `position:relative` blocks — no sticky scroll.

## Aspiration CTA line (last image section)

Formula: **"Sở hữu [property_type] [Brand name] tại [City]."** / **"Own a [property_type_en] in [City]."**

Rules:
- `property_type` matches the asset class: `căn hộ` (apartment/residence), `biệt thự` (villa), `căn hộ dịch vụ` (serviced apartment), etc.
- `City` = the city proper name, **never** a neighbourhood, beach, or district (e.g. `Đà Nẵng` not `Mỹ Khê`, `Panama City` not `Punta Pacífica`).
- Brand name = short brand, not the full property name (e.g. `Nobu`, `Mandarin Oriental`, `Pullman`).

| Listing | VI | EN |
|---------|----|----|
| Nobu Da Nang | Sở hữu căn hộ Nobu tại Đà Nẵng. | Own a Nobu residence in Da Nang. |
| Mandarin Oriental Da Nang | Sở hữu biệt thự Mandarin Oriental tại Đà Nẵng. | Own a Mandarin Oriental villa in Da Nang. |
| Pullman Panama City | Sở hữu căn hộ Pullman tại Panama City. | Own a Pullman residence in Panama City. |

Also: `data-stmt` highlight words use `«word»` (guillemet quotes) — **not** `[word]` and **not** `&#91;word&#93;` — to prevent WordPress shortcode processing. cheerio `decodeEntities:false` was silently decoding `&#91;` → `[` on every sync, causing WP to strip the brackets. The JS parser splits on `/(«[^»]+»)/g` and checks `part.charAt(0) === '«'`.

The statement is **Notion-synced** as of PR #149 — fields `📜 Statement VI` / `📜 Statement EN` on the property DB patch `data-stmt` on `#nac-stmt-vi` / `#nac-stmt-en`. New scaffolded listings get their quote from Notion automatically; no manual HTML edit needed. Use guillemets in the Notion field text as well.

## Workflow

- Develop on a feature branch (`claude/<slug>-qarsn`).
- Push, open PR via `mcp__github__create_pull_request`, squash-merge via `mcp__github__merge_pull_request`. No need to ask before merging.
- Then `git checkout main && git pull origin main && git branch -D <branch>`.
- Never push direct to main — the proxy blocks it.

## Templates

Templates and references:

- [`properties/_template-listing-pdp.html`](./properties/_template-listing-pdp.html) — **master PDP template** (snapshot 2026-05-12, post-PR #47). Duplicate this for every new listing.
- [`country/_template-clp.html`](./country/_template-clp.html) — **master CLP template** (snapshot 2026-06-01). Duplicate this for every new country page. Live reference: `country/vn.html`.
- [`NAC-CLP-DESIGN.md`](./NAC-CLP-DESIGN.md) — Country Listing Page design system, data contract, and scaffold workflow. Read this before adding a new country.
- [`NAC-STICKY-PILLS.md`](./NAC-STICKY-PILLS.md) — bottom-center CTA pill + top-right settings pill (theme + lang). Both collapsed-by-default, expand on hover/tap.
- [`NAC-FOOTER.md`](./NAC-FOOTER.md) — bilingual gold title, wave underline, 5-icon social row, 3-col nav.
- [`NAC-BACKLINKS.md`](./NAC-BACKLINKS.md) — canonical URLs for every NAC button across all PDPs.
- [`NAC-CERTIFICATION-BOX.md`](./NAC-CERTIFICATION-BOX.md) — closing sign-off block: NAC × IMC seal (vertical on desktop, horizontal on mobile), IMC compliance prose, meta tag row, 3-line reviewer card (Ray Vũ).
- [`NAC-CLP-OG-CARD.md`](./NAC-CLP-OG-CARD.md) — per-country social-share preview card (1200×630 PNG, "Three Heroes" + "Constellation Atlas" variants, auto-fit single-line bilingual taglines, resilient hero fetch, NAC blue + Cormorant Garamond). Wired into CLP `og:image` / `twitter:image` via GH Pages.
- [`NAC-LLP-PERSONALISATION.md`](./NAC-LLP-PERSONALISATION.md) — canonical per-listing + per-city personalisation checklist (the "is it bespoke or showing template defaults?" reference): editorial fields and their templated-smell tells, `📊 Market Stats JSON` per-city requirement, Plan-B journey rule, audit cadence, city rollout tracker.

## Notion sync

- Cron every 5 minutes via `.github/workflows/sync-notion.yml` (GitHub's reliable minimum — `*/2` gets silently throttled to 15–30 min under load). Use Actions tab → "Run workflow" for immediate sync.
- Source DB ID: `35848ec25e86803283acc7ad989649c9` (🏠 NAC - Property Listings).
- Country DB ID: `a01ef35ce9fd45b1bba3ec4de4da678c` (🌍 NAC - Country Listings) — data source `ef2e9ff0-d725-4f2b-87c1-2d72c5a21905`. Holds **country-level editorial content only** (tagline, intro quote, atlas SVG path, hero chips, etc.). **Auto-scaffolds from the Property Listings DB** — when a new Live listing lands in a country that has no row yet, the future `scripts/sync-notion-clp.mjs` creates a Draft row; cities, listings count, and price-from are computed from the Listings DB at sync time. Never maintain country / city lists by hand. Schema + field categories + workflow in `NAC-CLP-DESIGN.md`.
- Script: `scripts/sync-notion.mjs`. Filters by `Hub Status = Live`, patches HTML via cheerio targeting `data-notion="*"`, `data-notion-list="*"`, `data-notion-json="*"`, `data-notion-roi`, `data-notion-bg`.
- Donut score (`.nac-donut-score`) is a special case — sync only updates `data-count-to`, never the inner text (preserves the count-up-from-0 animation).
- **Mobile hero image** — optional Notion URL field `Mobile Image URL`. When set, sync appends `--bg-mobile:url(...)` to the hero element's inline style alongside the desktop `background-image`. A CSS rule `@media(max-width:900px) { .nac-hero-img[style*="--bg-mobile"] { background-image:var(--bg-mobile) !important; } }` swaps to the mobile image on viewports ≤900px. Field left blank = single-image behavior unchanged.

## Cinematic section title generation

- Script: `scripts/generate-cine-titles.mjs`. Runs after `sync-notion.mjs` in both `create-pdp.yml` and `sync-notion.yml`.
- **Notion is source of truth.** `sync-notion.mjs` reads six fields — `🎬 Cine 1 VI`/`EN`, `🎬 Cine 2 VI`/`EN`, `🎬 Cine 3 VI`/`EN` — and writes them into `#nac-img-1|2|3 .nac-cine-h [data-vi|en]`. Any span left empty (Notion field blank) is then filled by the AI generator below.
- Targets every `.nac-cine` block in every `properties/*.html`. For any block where either `data-vi` OR `data-en` is empty, it sends the matching `.nac-cine-img` background image URL to Claude (multimodal, default model `claude-haiku-4-5-20251001`) and writes back a 2-clause `·`-separated title — only into the spans that are still blank, so Notion-supplied content is never clobbered.
- Idempotent: cine blocks where both VI and EN are already filled are skipped entirely. To force regeneration of a single title, clear the Notion field AND blank out the corresponding span in the HTML file.
- Requires repo secret `ANTHROPIC_API_KEY`. If missing, the script logs a skip message and exits 0 so the rest of the pipeline still succeeds.
- Manual single-file run: `cd scripts && ANTHROPIC_API_KEY=... npm run titles -- <slug>` (no `<slug>` = all files).
- Cost: ~$0.001/image with Haiku 4.5; a typical PDP has 3 cine blocks (≈$0.003 per scaffold).

## SEO / GEO / LLM scaffolding (auto, per listing)

The PDP template ships a full SEO package in `<head>` — `RealEstateListing` +
`FAQPage` + `BreadcrumbList` JSON-LD, OG/Twitter cards — but as `{token}`
placeholders. `sync-notion.mjs::patchHeadSeo()` fills the *prose* half (title,
meta description, keywords, canonical, og/twitter title+desc, JSON-LD
name/description/url). **`scripts/seo-geo-llm.mjs` fills the *structured* half**
(this used to ship broken on 67 PDPs as literal `{lat}` / `{purchase price as
number}` / `{Hotel/Brand name}` / `{Amenity}` / empty FAQ):

- **`completeStructuredData($, prop)`** — called at the end of `patch()` in
  `sync-notion.mjs`. Completes, by `@type`:
  - `RealEstateListing` → `geo`, `offers` (real price + the listing's actual
    `Currency`, not hardcoded USD), `brand`, `amenityFeature` (from `✨ Features
    JSON`), `datePosted`/`validThrough` (token-gated so written once, never
    churned), ISO-3166 `addressCountry`, hero `image`.
  - `FAQPage` → 5 Q&As rebuilt from Notion financials/location/score. Only emits
    questions it can answer with real data — never a `{token}` answer.
  - `BreadcrumbList` → country + property names/hrefs.
  - **Idempotent**: deterministic from Notion fields → re-running yields
    byte-identical output (verified).
- **Geo**: the Notion DB has no lat/lng field, so `resolveGeo()` geocodes
  City+District+Country via OpenStreetMap **Nominatim**, cached in
  `scripts/geocode-cache.json` (committed; next run is a pure cache hit, zero
  network). Geocode failure → the `geo` block is **omitted** (absent geo is
  valid; `{lat}` is not).
- **`llms.txt`** (repo root) is regenerated from all Live rows on every sync —
  an [llmstxt.org](https://llmstxt.org) discovery index (one bullet per listing:
  canonical URL + brand/location/price/yield/NAC-score). NOTE: served at GH
  Pages today; needs WP upload to sit at `nomadassetcollective.com/llms.txt`.
- **Tracking + notify** (`scripts/seo-scaffold-log.mjs`, run at the tail of
  `create-pdp.yml` for each `new_slugs`): records an **Applied** task in the
  `🚀 NAC - SEO Tasks` DB (`ada6bd2f8c324773b0d026f9db78d3a2`, Surface=PDP,
  Category=Schema) and posts a **comment on the listing's Notion row** as the
  notification. Idempotent (skips slugs already logged); never hard-fails the
  pipeline. Requires the NAC PDP Sync integration to have **Insert comments**
  capability for the comment to post — the task row records either way.
- **Audit guard**: `seo-audit.mjs` now flags `schemaBroken` (P0) when any
  JSON-LD block has `{token}` placeholders or fails to parse — presence-only
  checks missed the original rot.

`seo-geo-llm.mjs` is pure (cheerio + Notion field shape, no Notion client), so
it unit-tests offline against the template / any PDP.

## Image pipeline (PDF / Berkeley web → Cloudflare Images → Notion)

This is the production-ready replacement for the manual "screenshot from brochure → resize → upload to WP media" workflow. End-to-end: source images → extract → classify → upload → write URLs back to Notion. The next `sync-notion.yml` cron tick then propagates the URLs into the HTML files everywhere they appear.

- Script: `scripts/sync-images.mjs`. Walkthrough in `NAC-IMAGE-SYNC.md`.
- Workflow: `.github/workflows/sync-images.yml` — `workflow_dispatch` (manual + auto). As of PR #148, `create-pdp.yml` auto-dispatches this workflow for every newly-scaffolded slug via `gh workflow run sync-images.yml -f only_slug=<slug>`, so "Hub Status → Live" triggers the full image pipeline with zero manual intervention.
- Account hash (in every `imagedelivery.net/<hash>/<id>/<variant>` URL): `qse3Pw84PrZ2S0PQOTtixw`.

### Sources (additive — combine any)

| Source | Notion field | CLI flag | Auth needed | When to use |
|---|---|---|---|---|
| Berkeley page scrape | `🌐 Berkeley Page URL` | `--berkeley-page <url>` | none | UK Berkeley listings (also follows one-level sub-phase links like `/the-art-mill`) |
| Explicit URL list | `📷 Image URLs JSON` | `--berkeley-urls <file>` | none | Curated URL set from any source |
| Drive PDF | `GS Source Folder` | `--pdf <path>` | `GOOGLE_SERVICE_ACCOUNT_JSON` (optional — `--pdf` works with local PDF) | Brochures with 2.5MP+ images (Berkeley CDN caps at 1.8MP, brochures often hit 4MP+) |
| **Web search fallback** | (auto-trigger) | none | `ANTHROPIC_API_KEY` | Runs automatically when *all* primary sources yield 0 candidates (e.g. Drive service account lacks folder access). Claude with `web_search` tool finds 8–12 public URLs from newsrooms / official sites / news articles, fed through the same filter+rank+upload pipeline. ~$0.005 per call. |

Drive PDF + brochure is the best source when available — Grand Marina's 19MB brochure produced 4.0MP heroes vs Berkeley web's 1.8MP cap. Web-search fallback is the safety net for "Drive can't see the folder" — you get usable hero images on Cloudflare with zero manual intervention.

### Cloudflare Images variants (one-time setup, documented in NAC-IMAGE-SYNC.md)

| Variant | Config | URL suffix | Used for |
|---|---|---|---|
| `public` | `fit: scale-down, 2400×2400` | `/public` | Desktop hero + 4 gallery backgrounds, og:image, twitter:image, JSON-LD image |
| `mobile` | `fit: cover, 1080×1920` | `/mobile` | Hero on ≤900px viewports (wired into HTML via inline `--bg-mobile:url(...)`) |

The default CF `public` variant was downscaling to 1366×768 (visibly grainy on 4K). Bumping to 2400×2400 unlocks full source resolution. PR #136 docs the API call.

### Filter cascade

| Rule | Threshold | Why |
|---|---|---|
| width | ≥ 1500px | Berkeley CDN caps at 1920; PDF heroes are typically 1800–3000+. Smaller = thumbnail rendition that didn't bump |
| orientation | width ≥ height | Drops portrait brochure spreads (e.g., 1818×2389 page-spreads) |
| file size | ≥ 150KB | CDN-served 1920×933 lands at 150–300KB |
| **bytes/pixel** | **≥ 0.05** | **Drops abstract design graphics** (wave gradients, colour blocks) that compress unusually small. Real photos sit at 0.10–0.30 b/px. Caught the Fulham "wave graphic" |
| dedupe | by SHA-256 | PDFs composite duplicates for layering |
| sort | **pixel area DESC** | CDN compression makes file-size sort misleading |

### Slot picker (today's content rule)

Position dictates what role the image plays. The picker uses URL-keyword classification (`aspirational` / `interior` / `overview` / `unclassified`) + a per-slot priority list:

| Slot | Position in PDP | Class preference | What it should be |
|---|---|---|---|
| 0 | Top hero (full-bleed) | aspirational → unclassified → overview → interior | **Aspirational #1** — wow shot, the headline image |
| 1 | §05 cine | aspirational → unclassified → overview → interior | **Aspirational #2** — second wow, different angle |
| 2 | §08 cine | interior → unclassified → overview → aspirational | Interior detail — what the flat looks like |
| 3 | §11 cine (right before closing aspiration line) | overview → unclassified → interior → aspirational | **Project Overview / ending image** — building/areas, not flat. Must be visually distinct from hero |
| 4 | gallery_4 (currently unused in template) | unclassified → overview → interior → aspirational | Filler — Notion stores it for future use |

**Diversity rule** (Grand Marina taught us this): hero (slot 0) and ending (slot 3) should not be the same kind of shot. Implemented via post-pick diversity check: if slots 0 and 3 are visually similar (same source region + same class), the script tries the next-best candidate for slot 3.

### URL-keyword classifier

Berkeley CDN paths map cleanly to classes; PDF-extracted images default to `unclassified` (wildcard). Keywords (extend in `classifyImage()` as needed):

- **Aspirational** — `/header/`, `/hero/`, `terrace-views`, `penthouses`, `lifestyle`, `sunrise-to-sunset`, `highlight-feature`, `beach-club`, `solaris-lounge`, `minus-one-club`, `the-club`, `tamesis-club`, `rooftop`, `sky-bar`, `olive-grove`
- **Interior** — `/internal/`, `/specification/`, `/interiors/`, `kitchen`, `bathroom`, `bedroom`, `ensuite`, `spec_`, `showhome`, `living-room`, any `\d+-bed-` pattern, `studio-apartment`
- **Overview** — `/external/`, `/exterior/`, `townhouses`, `current-phase-image`, `phase-thumb`, `aerial`, `outdoor`, `site-plan`, `building`, `courtyard`, `neighbourhood`, `park-life`, `connections-map`, `burgess-park`, `food-drink`, `cultural`, `kia-oval`, `cricket`, `thames`, `river`, `amenity-image`, `facilities-image`

### Notion field mapping

When sync-images uploads to CF, it writes these Notion fields:

- `Image URL` → CF hero `/public` URL
- `🖼️ Image 1-4` → CF gallery `/public` URLs (per slot mapping above)
- `Mobile Image URL` → CF hero `/mobile` URL (same image ID, different variant). HTML uses this via inline `--bg-mobile` CSS variable on the hero element; CSS media query swaps it in on ≤900px

### Triggering

1. **Single property (ping protocol)**: user creates Notion row with brochure URL or Berkeley page → message "process images for `<slug>`" → me running `node sync-images.mjs --slug <slug> ...`
2. **Bulk** (autonomous): GH Actions workflow_dispatch → script iterates all Live properties with placeholder image URLs

### Required secrets

- `CLOUDFLARE_API_TOKEN` (with `Cloudflare Images: Edit`)
- `NOTION_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (optional — Drive route only; Berkeley web doesn't need it)

## WordPress sync

- Triggered by every push to `main` that touches `properties/*.html`, plus a 5-min cron and on-demand via `.github/workflows/sync-wp.yml`.
- Script: `scripts/sync-wp.mjs`. Posts the **full HTML** of each `properties/<slug>.html` into ACF field `raw_html_code` on the matching WP page.
- Lookup: reads the Notion `Listing URL` field, parses the slug from the URL, and matches the WP page by slug + full URL. Property ID is Notion-only and not used for matching.
- **Never creates pages.** Skips (not fails) if `Listing URL` is empty (normal for newly scaffolded listings). Fails loudly if `Listing URL` is set but no WP page matches — fix the URL or create the page, then re-run.
- Auth: HTTP Basic with `WP_USER` (default `admin_web`) and the `WP_APP_PASSWORD` secret (a WP Application Password). Also requires `NOTION_TOKEN`.
- WP-side requirement: ACF field `raw_html_code` (textarea) with **Show in REST API** enabled. Template echoes `<?php the_field('raw_html_code'); ?>`.
- Manual single-slug sync: Actions tab → **Sync PDP HTML → WordPress** → **Run workflow** → enter `only_slug` (e.g. `nobu-da-nang`).

## New listing automation (Hub Status → Live)

### Triggers

Every relevant workflow (`create-pdp.yml`, `create-wp-page.yml`, `sync-images.yml`, `sync-notion.yml`) wakes up on **all** of:

1. **Cron** `*/5 * * * *` — passive safety net
2. **`workflow_dispatch`** — manual button in Actions tab
3. **`push` to `.github/triggers/**`** — chat-driven on-demand path; the assistant appends to `.github/triggers/last-trigger.txt` and pushes via the GitHub MCP, firing all four workflows in parallel within seconds. No PAT, no Notion automation needed.
4. **`repository_dispatch` types `notion-update` or `new-listing`** — for a future Notion webhook (one-time PAT setup) so any Notion row edit fires the chain directly.

Workflows are all idempotent — they query Notion for the current state and skip rows already in the target state. Re-firing is safe.

### Pipeline

Three parallel automations run when a Notion row flips to **Hub Status = Live**:

**Side A — WP page creation (`.github/workflows/create-wp-page.yml`, cron every 5 min):**
1. Queries Notion for Live rows where `🆔 WP Page ID` is empty
2. Looks up the country parent page in WP (slug from `COUNTRY_SLUGS` table in `scripts/create-wp-page.mjs`)
3. Auto-detects the `NAC Residence Index` template from a sample existing listing (Pullman Panama, configurable via `WP_TEMPLATE_SAMPLE_SLUG` repo var)
4. Creates the new WP page with title = `Property Name`, slug = `🔗 Slug`, parent = country page, status = publish
5. Writes WP Page ID and Listing URL back to Notion
6. Safe to re-run: existing-page detection reuses pages instead of duplicating

**Side B — Git automation (`.github/workflows/create-pdp.yml`, cron every 5 min):**
1. Queries Notion for Live rows
2. For each slug with no `properties/<slug>.html`, copies `_template-listing-pdp.html` to that path
3. Immediately runs `sync-notion.mjs` to patch the new file with current Notion content
4. Commits and pushes to `main` → triggers `sync-wp.yml`
5. **Dispatches `sync-images.yml`** for each newly-scaffolded slug (added PR #148), kicking off Drive → CF image extraction in parallel

**Full end-to-end flow:**
```
Notion Hub Status → Live
  │
  ├── Side A (within ~5 min):
  │     create-wp-page.yml: create WP page → writes WP Page ID + Listing URL back to Notion
  │
  └── Side B (within ~5 min):
        create-pdp.yml: scaffold properties/<slug>.html → patch Notion → push → dispatch sync-images.yml
          ├── sync-wp.yml: pushes HTML into WP `raw_html_code` ACF field
          └── sync-images.yml: extracts from Drive (GS Source Folder) → uploads to CF → writes URLs back to Notion
                ↳ Next sync-notion cron tick (≤5 min) patches CF URLs into HTML → another sync-wp push
```

Total end-to-end "Hub Status → Live" to fully-populated WP page: ~10–15 min, zero manual triggers.

## LLP completeness dashboard — the shared progress board

**`listing-status.html`** (repo root, served on GitHub Pages, also reachable via the floating "Personalisation Status" pop-up on `index.html`) is the **single source of truth for how personalised each listing is**. Both Ray and Claude check progress here. It is **auto-generated** — never hand-edit the data block.

- **Generator**: `scripts/build-llp-status.mjs`. Scans every `properties/*.html`, derives a 9-dimension status per listing, and writes `listing-status.json` (machine-readable, read this in-repo to see current state) + injects the data block into `listing-status.html` (human view, with thumbnails + filters).
- **Dimensions**: `id · fin · nac · edit · json · cine · img · geo · qa`. Statuses: `done` (bespoke/complete) · `band` (generic / shares a fingerprint with sibling listings) · `block` (missing/broken/placeholder) · `draft` / `na` (override-only).
- **Auto-ticks**: status is derived from what actually shipped in the HTML, so once `sync-notion` patches real Notion content (or a banded cluster is de-banded), the **next build flips the cells automatically** — no manual ticking.
- **De-banding**: `fin` / `nac` / `edit` / `cine` fingerprints are hashed across all listings. A fingerprint **shared by >1 listing → `band`** (cell tooltip shows the cluster size); **unique → `done`**. This is what surfaces the "33 AU listings sharing IRR 8.5 / CoC 2.9 / NAC 74" banding — and it resolves itself the moment you write bespoke numbers.
- **Human-only calls** (QA viability, known-broken, "drafted in LLP-GENERATION.md but not written") live in **`scripts/llp-status-overrides.json`** (`slug → {dim: status, note}`) and always win over the auto value. The dashboard's "Export overrides JSON" button emits this exact shape.
- **Refresh**: runs as a step in `.github/workflows/sync-notion.yml` (every 5 min + on push to `.github/triggers/**`), so new listings appear and completed work ticks itself with zero manual triggers. Output is **content-stable** (timestamp only bumps on a real status change) → no churn commits. Run locally with `cd scripts && node build-llp-status.mjs`; CI-style staleness check with `node build-llp-status.mjs --check`.
- When working a listing to completion, **finish against the dashboard** — drive its row to all-green (or set a justified override) rather than eyeballing the PDP.

### Live-change ledger + activity feed (left column of the dashboard)

The dashboard's left column is a **live activity feed** of every listing change
(`[time] · country · listing · field from→to`); **`listing-changelog.json`**
(repo root) is its data source.

- **Generator**: `scripts/build-changelog.mjs` — reconstructs changes by diffing
  git history of `properties/*.html`. This is the **only reliable old→new source**
  — Notion's API has no field-value history, but `sync-notion` commits an HTML
  snapshot on every change, so consecutive blobs recover the full log.
- **Permanent ledger** by default (scans the FULL history, deterministic, never
  drops events). `CHANGELOG_DAYS=<n>` scopes a rolling window if ever needed.
  Genesis tree is used as a silent baseline so the initial bulk import isn't
  reported as 60+ "added" events. Tracks NAC score / price / yield / IRR / CoC /
  payback / market-stats / price-bands / hero+gallery / editorial / new+removed.
- **Workflow**: `.github/workflows/build-changelog.yml` — refreshes the JSON on
  push to `properties/*` + every 30 min (pure git, no secrets, GITHUB_TOKEN
  commit). So changes from **any source or session** show up automatically — no
  chat session needs to be open.

### ⚠️ The dashboard PRESENTATION is hand-maintained — don't clobber it

`build-llp-status.mjs` only **swaps the `<script id="data">` block** (regex,
between the markers) and leaves the rest of `listing-status.html` intact. The
page's CSS/markup/JS is a bespoke **Apple-aesthetic design** (frosted header,
completion ring + count-up, dot-matrix with per-row completion bars, segmented
country filter, sticky-frozen column headers, the live feed). When editing the
dashboard: **preserve the `<script id="data" type="application/json">` … `</script>`
markers** and never regenerate the whole file from a template — restyle in place.

## Per-city market stats — §04 Market cards (`📊 Market Stats JSON`)

The four §04 "Market" stat cards (`.nac-mkt`) used to be hardcoded in the PDP
template → identical on every listing. They're now **per-metro, Notion-driven**:

- Field `📊 Market Stats JSON` — array of `{val, vi, en}` (typically 4). Empty →
  the template default cards stand (no regression). `sync-notion.mjs::renderMarketStats()`
  renders `.nac-mkt` when the field is present.
- **Bulk rollout**: `scripts/set-market-stats.mjs` (+ `set-market-stats.yml`,
  token `set-market-stats:write`) maps each Live listing to its metro
  (Sydney/Melbourne/İstanbul/London/Limassol/Panama City/Da Nang/HCMC/Ho Tram/
  Athens/Galaxidi) and writes real, sourced 2024 figures. Idempotent; unmapped
  metros are left as-is. Extend `CITY_STATS` + `METRO_RULES` for new cities.
- Full per-listing + per-city personalisation checklist: **`NAC-LLP-PERSONALISATION.md`**.

## Listing data completeness — back-fill EVERY Notion field

**A new listing is not "done" until every applicable field on its Property Listings row is filled.** Empty fields don't error — they silently fall back to the PDP template's placeholder values, which is worse than blank. (Cautionary example: the 2026-06 Australia batch — `natura-macquarie-park`, `downtown-zetland`, `yarra-park-alphington` — shipped with the template's default **IRR 13.8% / Cash-on-Cash 8.1%** showing identically on all three, plus empty Pros/Cons/Features/Sub-Scores/Process sections, **Monthly Rental Income**, **Payback Years**, and **NAC Note**. Treat a half-filled row as a bug, not a draft.)

Author all of these at creation time. Only the *italicised* ones are auto-filled by the pipeline:

- **Financials (numeric):** `Purchase Price` · `Yield %` · `IRR %` · `Cash-on-Cash %` · `ROI %` · `Cash Flow` · `Monthly Rental Income` · `Monthly Expenses` · `Payback Years` · `Price Per M2` · `Minimum Hold Period`
- **Taxonomy / gate:** `Country` · `Currency` · `Region` · `Region/City` · `📍 District` · `🏨 Hub Type` · `🛂 Immigration Type` · `Investment Program` · `Exit Strategy` · `Tags` · `Freehold` · `🌟 Hotel-Branded` · `💸 Tax-Friendly` · `Status` · `Hub Status` · `🔗 Slug` · *`Listing URL`* · *`Property ID`* (auto)
- **Editorial — bilingual VI + EN:** `Excerpt` · `📝 Desc` · `🏷️ Tagline` · `📜 Statement` · `✦ Brand` + `✦ Brand Intro` · `🌍 Market` · `🌏 Key Markets` · `🏖️ Beach` · `✈️ Airport` · `📈 Property YoY` · `💬 NAC Note` · `Name VI`
- **Score + JSON metadata (the most-missed — fill these):** `⭐ NAC Score` · `📊 Sub-Scores JSON` · `✅ Pros JSON` · `⚠️ Cons JSON` · `✨ Features JSON` · `🔄 Process JSON`
- **Per-city / structural JSON:** `📊 Market Stats JSON` (per-metro §04 cards — see *Per-city market stats* above) · `💲 Price Bands JSON` (Residence Mix table; reveals only when present; currency-aware) · `🔑 Handover EN/VI` — both used by the Greece/Turkey generators (`scripts/generate-gr-listings.mjs`, `generate-tr-listings.mjs`).
- **Cine titles:** `🎬 Cine 1/2/3 VI`+`EN` — fill in Notion, **or** leave blank ONLY when `ANTHROPIC_API_KEY` has credit (the generator fills blanks; on a $0 balance they stay empty).
- **Images (pipeline-filled):** *`Image URL`* · *`🖼️ Image 1-4`* · *`Mobile Image URL`* come from `sync-images` — but you must set **`GS Source Folder`** (or `🌐 Berkeley Page URL` / `📷 Image URLs JSON`) so it has a source to pull from.

**JSON field shapes:** before writing the JSON fields, `notion-fetch` an already-complete listing (e.g. `pullman-panama-city`, `nobu-da-nang`, `grand-marina-…`) and copy the exact structure — `✅ Pros JSON` / `⚠️ Cons JSON` / `✨ Features JSON` / `🔄 Process JSON` / `📊 Sub-Scores JSON` each have a shape the PDP renderer expects; a malformed or empty value renders a blank or placeholder section. `📊 Sub-Scores JSON` must align with `⭐ NAC Score` (drives the count-up donut) — see `NAC-PDP-DESIGN.md`.

**Before flipping `Hub Status → Live`, verify the row has no empty applicable field.** When generating a batch, run this completeness check on every row first — going Live triggers the public WP page, so placeholder numbers go live with it.

### A listing needs real photos — or it does NOT ship

**A floor plan, a map / location diagram, or a bare land-lot photo is NOT an acceptable listing image.** A listing whose only available imagery is plans/maps/lots is **not viable** and must **never be made Live, scaffolded, or processed** in the first place. When assessing a source folder, count only *real* photos (renders/exteriors/interiors/amenities/aerials) toward the "enough images to fill a PDP" bar — floor plans, maps, and land lots do **not** count. `sync-images` hard-drops all three (see `NAC-IMAGE-SYNC.md` → "Unacceptable images") so they can't become a hero/cover or gallery shot. If one ships anyway (no usable hero), **retire it** end-to-end with the `delete-listings` workflow (`scripts/delete-listings.mjs` → deletes the WP page, archives the Notion row, removes the HTML, rebuilds the index). Driven by a `delete-listings:slug-a,slug-b` token on the last `.github/triggers/last-trigger.txt` line.

## Listing URL convention

Canonical NAC Listing URL pattern (stored in Notion `Listing URL`, parsed by `sync-wp.mjs`):

```
https://nomadassetcollective.com/property-hub-bat-dong-san/<country-slug>/<property-slug>/
```

- `<country-slug>` — lowercase English country name (e.g. `cyprus`, `panama`, `vietnam`).
- `<property-slug>` — short brand+city or brand+location handle. Should NOT duplicate the country path or include visa-type suffixes (e.g. use `limassol-del-mar-dao-sip`, not `limassol-del-mar-leptos-cyprus-rbi`). Vietnamese qualifiers (`dao-sip` for "Cyprus island") are permitted when they aid recognition.
- Notion `🔗 Slug` field must match `<property-slug>` — the scaffold cron uses it to name `properties/<slug>.html`.

Existing examples:
| Property ID | Notion title | Listing URL |
|-------------|--------------|-------------|
| NAC-19 | Pullman Panama City | `…/panama/pullman-panama-city/` |
| NAC-86 | Limassol Del Mar | `…/cyprus/limassol-del-mar-dao-sip/` |

When a new Notion row goes Live without a Listing URL, generate one from Country + a short slug and write both `Listing URL` and `🔗 Slug` back to Notion. The two cron jobs then handle scaffold + WP push.

## GitHub Pages preview

Every file under `properties/*.html` on `main` is served by GitHub Pages at:

```
https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/properties/<slug>.html
```

Use this to QA a new PDP before the WP page exists or to confirm the scaffold ran. Returns 404 until `create-pdp.yml` commits the file to `main`; 200 once published (Pages refresh is typically <1 min after push). Example: `https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/properties/limassol-del-mar-dao-sip.html` (NAC-86).
