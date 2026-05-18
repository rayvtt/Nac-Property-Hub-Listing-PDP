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

## Workflow

- Develop on a feature branch (`claude/<slug>-qarsn`).
- Push, open PR via `mcp__github__create_pull_request`, squash-merge via `mcp__github__merge_pull_request`. No need to ask before merging.
- Then `git checkout main && git pull origin main && git branch -D <branch>`.
- Never push direct to main — the proxy blocks it.

## Templates

Templates and references:

- [`properties/_template-listing-pdp.html`](./properties/_template-listing-pdp.html) — **master PDP template** (snapshot 2026-05-12, post-PR #47). Duplicate this for every new listing.
- [`NAC-STICKY-PILLS.md`](./NAC-STICKY-PILLS.md) — bottom-center CTA pill + top-right settings pill (theme + lang). Both collapsed-by-default, expand on hover/tap.
- [`NAC-FOOTER.md`](./NAC-FOOTER.md) — bilingual gold title, wave underline, 5-icon social row, 3-col nav.
- [`NAC-BACKLINKS.md`](./NAC-BACKLINKS.md) — canonical URLs for every NAC button across all PDPs.
- [`NAC-CERTIFICATION-BOX.md`](./NAC-CERTIFICATION-BOX.md) — closing sign-off block: NAC × IMC seal (vertical on desktop, horizontal on mobile), IMC compliance prose, meta tag row, 3-line reviewer card (Ray Vũ).

## Notion sync

- Cron every 5 minutes via `.github/workflows/sync-notion.yml` (GitHub's reliable minimum — `*/2` gets silently throttled to 15–30 min under load). Use Actions tab → "Run workflow" for immediate sync.
- Source DB ID: `35848ec25e86803283acc7ad989649c9` (🏠 NAC - Property Listings).
- Script: `scripts/sync-notion.mjs`. Filters by `Hub Status = Live`, patches HTML via cheerio targeting `data-notion="*"`, `data-notion-list="*"`, `data-notion-json="*"`, `data-notion-roi`, `data-notion-bg`.
- Donut score (`.nac-donut-score`) is a special case — sync only updates `data-count-to`, never the inner text (preserves the count-up-from-0 animation).
- **Mobile hero image** — optional Notion URL field `Mobile Image URL`. When set, sync appends `--bg-mobile:url(...)` to the hero element's inline style alongside the desktop `background-image`. A CSS rule `@media(max-width:900px) { .nac-hero-img[style*="--bg-mobile"] { background-image:var(--bg-mobile) !important; } }` swaps to the mobile image on viewports ≤900px. Field left blank = single-image behavior unchanged.

## Cinematic section title generation

- Script: `scripts/generate-cine-titles.mjs`. Runs after `sync-notion.mjs` in both `create-pdp.yml` and `sync-notion.yml`.
- Targets every `.nac-cine` block in every `properties/*.html`. For each block where both `.nac-cine-h [data-vi]` AND `.nac-cine-h [data-en]` are empty, it sends the matching `.nac-cine-img` background image URL to Claude (multimodal, default model `claude-haiku-4-5-20251001`) and writes back a 2-clause `·`-separated title in both languages.
- Idempotent: any cine block that already has VI or EN content is skipped, so editorial overrides survive future runs. To regenerate a title, blank out both `data-vi` and `data-en` spans in `.nac-cine-h`.
- Requires repo secret `ANTHROPIC_API_KEY`. If missing, the script logs a skip message and exits 0 so the rest of the pipeline still succeeds.
- Manual single-file run: `cd scripts && ANTHROPIC_API_KEY=... npm run titles -- <slug>` (no `<slug>` = all files).
- Cost: ~$0.001/image with Haiku 4.5; a typical PDP has 3 cine blocks (≈$0.003 per scaffold).

## Image sync (PDF brochures → Cloudflare Images → Notion)

- Script: `scripts/sync-images.mjs` (see `NAC-IMAGE-SYNC.md` for the full setup walkthrough).
- Workflow: `.github/workflows/sync-images.yml` — manual `workflow_dispatch` only (expensive operation; not run on schedule).
- Flow: Notion `GS Source Folder` → list PDFs via Drive API → `pdfimages -j` extracts embedded JPEGs → dedupe + filter (≥800px, ≥50KB) → top-5 by file size → upload to Cloudflare Images with custom IDs `<slug>-hero`, `<slug>-1..4` → write `imagedelivery.net/.../public` URLs back to Notion `Image URL` + `🖼️ Image 1-4`.
- The next `sync-notion.yml` cron tick then patches the new URLs into the HTML files (data-notion-bg fields auto-update).
- Required secrets: `CLOUDFLARE_API_TOKEN` (with `Cloudflare Images: Edit` scope), `GOOGLE_SERVICE_ACCOUNT_JSON`, `NOTION_TOKEN`. Account ID `2adeb401a00c6f459573f25eabb790da` is hardcoded as default.
- Local test (no Drive/Notion required): `CLOUDFLARE_API_TOKEN=... node sync-images.mjs --slug <slug> --pdf <path> --dry-run --keep-tmp`.

## WordPress sync

- Triggered by every push to `main` that touches `properties/*.html`, plus a 5-min cron and on-demand via `.github/workflows/sync-wp.yml`.
- Script: `scripts/sync-wp.mjs`. Posts the **full HTML** of each `properties/<slug>.html` into ACF field `raw_html_code` on the matching WP page.
- Lookup: reads the Notion `Listing URL` field, parses the slug from the URL, and matches the WP page by slug + full URL. Property ID is Notion-only and not used for matching.
- **Never creates pages.** Skips (not fails) if `Listing URL` is empty (normal for newly scaffolded listings). Fails loudly if `Listing URL` is set but no WP page matches — fix the URL or create the page, then re-run.
- Auth: HTTP Basic with `WP_USER` (default `admin_web`) and the `WP_APP_PASSWORD` secret (a WP Application Password). Also requires `NOTION_TOKEN`.
- WP-side requirement: ACF field `raw_html_code` (textarea) with **Show in REST API** enabled. Template echoes `<?php the_field('raw_html_code'); ?>`.
- Manual single-slug sync: Actions tab → **Sync PDP HTML → WordPress** → **Run workflow** → enter `only_slug` (e.g. `nobu-da-nang`).

## New listing automation (Hub Status → Live)

Two parallel automations run when a Notion row flips to **Hub Status = Live**:

**Side A — WP automation (set up in Notion/WordPress, outside this repo):**
- Creates a WP page using the `[NAC Residence Index]` template (with empty `raw_html_code` ACF field)
- Writes back WP Page ID and Listing URL to the Notion row

**Side B — Git automation (`.github/workflows/create-pdp.yml`, cron every 5 min):**
1. Queries Notion for Live rows
2. For each slug with no `properties/<slug>.html`, copies `_template-listing-pdp.html` to that path
3. Immediately runs `sync-notion.mjs` to patch the new file with current Notion content
4. Commits and pushes to `main` → triggers `sync-wp.yml`

**Full end-to-end flow once both sides are active:**
```
Notion Hub Status → Live
  │
  ├── Side A: WP automation creates page → writes Listing URL back to Notion
  │
  └── Side B (within ~5 min):
        create-pdp.yml: scaffold properties/<slug>.html → patch with Notion → push
          └── sync-wp.yml: skips (Listing URL empty) on first push
              ↳ 5-min retry: once Listing URL is in Notion, push succeeds → WP page live
```

The 5-min `sync-wp.yml` cron ensures the WP push happens automatically once Side A finishes (≤10 min end-to-end, no manual intervention required).

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
