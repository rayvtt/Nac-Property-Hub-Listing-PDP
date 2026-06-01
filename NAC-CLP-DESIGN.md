# NAC-CLP-DESIGN.md — Country Listing Page

Companion to `NAC-PDP-DESIGN.md`. The CLP is the editorial container that sits between the site index and the property PDPs — one page per country, presenting all live listings for that country with map context, comparison, and quick-view.

**Auto-scaffolds from the Property Listings DB.** When a new Live listing lands in a country that doesn't yet have a CLP, the sync script creates a Draft row in the Country DB on the next tick. Editor opens the row and writes editorial copy directly into the **Notion page body** (clean WYSIWYG, structured `##` sections), flips Hub Status to Live, the page renders. The list of countries, list of cities per country, listings count, and price aggregates are never maintained by hand — they're computed from the Property Listings DB at sync time.

The Country DB schema is **deliberately lean** — only 10 properties (identity + gate + auto). Everything editorial lives in the Notion page body as structured rich text.

- Live reference: `country/vn.html` (Vietnam — 4 listings, 3 cities)
- Master template: `country/_template-clp.html`
- Editorial Notion DB: `🌍 NAC - Country Listings` (id `a01ef35ce9fd45b1bba3ec4de4da678c`)
- Listing data source: `🏠 NAC - Property Listings` (id `35848ec25e86803283acc7ad989649c9`) — joined by the `Country` select

---

## Page anatomy

Top to bottom:

| # | Section | What it does |
|---|---------|--------------|
| 1 | **Sticky header** | NAC Property Hub chrome — Hub icon + tool nav + VI/EN + WhatsApp. Same on every CLP. |
| 2 | **Hero** | Property carousel (top listings by price) crossfading with ken-burns + country plaque (snapshot stats) + featured-property pill + dots |
| 3 | **Intro narrative** | One italic guillemet pull quote + attribution. Editorial framing, no stats. |
| 4 | **Atlas** | SVG country silhouette with city pins; left-side pin-list mirrors the map and filters the Collection |
| 5 | **Collection** | Filter pills + horizontal-swipe row of all listings with cinematic load animation |
| 6 | **Compare table** | Sortable table of listings; row-click opens modal |
| 7 | **Aspiration close** | Guillemet line + gold consultation CTA |
| 8 | **Footer** | Curated-by + back link |
| 9 | **Quick-view modal** | Mini-PDP preview triggered from cards or table rows |

---

## Design tokens

Identical to the PDP — kept in sync intentionally so country pages and listing pages share visual DNA.

```
--bg / --surface / --surface-2 / --display / --text / --muted
--gold (#c4922c) / --gold-2 (#e8bf72) / --gold-soft / --orange
--line (rgba 15,26,54,.08) / --line-strong
--ff-display:  Cormorant Garamond
--ff-body:     Inter
--ff-mono:     JetBrains Mono
--maxw:        1320px
--pad:         2rem desktop / 1.25rem mobile (≤680px)
```

Breakpoints used in CSS:
- `@media(max-width:900px)` — atlas/hero stack, nav collapse, single-column for spine sections
- `@media(max-width:680px)` — phone-only polish (tighter padding, smaller pills)
- `@media(max-width:560px)` — drop the header subtitle

---

## Component contracts

### 1. Sticky header (`.cl-hdr`)

5 nav items mirroring the live Property Hub. First item is the **Hub icon** — a hub-and-spokes SVG (`.cl-hdr-hub`) with short italic "Hub" label, linking to the live PH. VI/EN toggle + WhatsApp green pill at the right.

```html
<a class="cl-hdr-mark" href="https://nomadassetcollective.com/property-hub-bat-dong-san/">
  <img class="cl-hdr-logo" src=".../cropped-OTG-Passport-Icons.png">
  <span class="cl-hdr-mark-txt">
    <span class="nac">NAC <em>Property Hub</em></span>
    <span class="sub">Danh Mục BĐS &amp; Công Cụ Đầu Tư</span>
  </span>
</a>
```

The Hub icon is purely structural and identical across countries — never change it.

### 2. Hero — property carousel

Slides are sorted by **price descending** (most expensive first). Up to 4–5 slides; each dwells 6 s with a ken-burns + crossfade.

```html
<div class="cl-hero-slide [on]"
     data-name-vi data-name-en
     data-price="$X"
     data-url="../properties/<slug>.html"
     style="background-image:url('<hero CF URL>')">
</div>
```

Floating elements over the carousel:
- `.cl-hero-eyebrow` — country crumb + "N listings live" status chip
- `.cl-name` — massive italic country name (VI primary, EN beneath in gold-2)
- `.cl-hero-tag` — country tagline (italic display, max 30ch)
- `.cl-hero-chips` — three country-specific chips (e.g. coastline, GDP, visitors)
- `.cl-hero-featured` — bottom pill: rotating thumbnail + name + price, links to the current slide's PDP
- `.cl-plaque` — right-side glass card with 5 rows (Listings / Cities / Entry / Yield / YoY)
- `.cl-hero-dots` — gold dots with 6 s progress fill (bottom-right)

### 3. Editorial intro (`.cl-intro`)

One paragraph, centered, italic Cormorant. Guillemets are CSS-generated via `::before` / `::after` — write the quote text without manual guillemets in the field; the page wraps it.

### 4. Atlas (`.cl-atlas`)

Two-column layout: text-left, map-right (stacks on mobile). Map is a stylized SVG with:
- `.cl-map-coast` — country silhouette path
- `.cl-map-grid` — decorative lat/lng lines
- `.cl-map-sea` — dashed offshore lines
- `.cl-pin-group` — city pins (clickable, trigger `clFilterCity()` to filter the Collection + scroll)
- `.cl-map-compass` — small compass rose

The pin-list on the left side replicates the city info as card-like rows; clicking either the pin OR the pin-list row does the same thing.

**Country silhouette path** is the one bit that varies per country. Stored in Notion as `🗺️ SVG Path` (the full `d="…"` value). For new countries: hand-draw a stylized path (not cartographically accurate) — 30–60 control points, smooth curves, normalized to a 320×420 viewBox.

### 5. Collection (`.cl-collection`)

The meat of the page. All listings in **one horizontal row** with brochure-style drag-to-scroll.

#### Filter pills (`.cl-coll-filter`)
```html
<button class="cl-pill on" data-filter="all">All <span class="pill-cnt">4</span></button>
<button class="cl-pill"    data-filter="<city-slug>">City Name <span class="pill-cnt">N</span></button>
```

Clicking a city pill:
1. Adds `.cl-card--dim` to non-matching cards (opacity .32, desaturated)
2. Smooth-scrolls the row to the first matching card

The atlas pin-list links (`a[data-city-filter]`) and SVG pins (`onclick="clFilterCity('<city>')"`) call the same handler — they scroll to the Collection section and apply the filter in one motion.

#### Listing card (`.cl-card`)
Width: 480 px desktop / 86 vw mobile. CSS-scroll-snap, snap-align: start.

Each card carries the data contract:
```
data-city, data-listing, data-img,
data-brand, data-name-vi, data-name-en,
data-tag-vi, data-tag-en,
data-price (number, K), data-yield, data-irr, data-coc, data-rent,
data-score (0-100),
data-subs (JSON array of {vi,en,val} for the 6 modal sub-scores),
data-url (path to the PDP)
```

Visual elements per card:
- Image area (16:10) with top-left chips row (`📍 City`, `⚡ Must know`, `🔥 Hot`, `Live`) and bottom-left brand mark
- Body: name, tagline, 3 inline stats (Entry / Yield / IRR), 88×88 mini-donut on the right
- Mini-donut: SVG circle with `stroke-dashoffset` animating from `263.9` → `data-final` value (= `263.9 - 2.639 * score`). Center shows `data-count-to` value (counts up from 0 via JS).
- Footer: "Quick view" chip + "Open listing →" arrow

**Click targets**:
- Anywhere in the card body → opens quick-view modal
- Footer arrow → opens the full PDP directly
- Footer arrow click does NOT bubble to body

#### Loading animation (per card, 140 ms stagger across the row)

1. **Slide-up + fade** — 40 px translateY → 0, opacity 0 → 1 (850 ms)
2. **Image blur-up** — `filter: blur(14px) saturate(.5) scale(1.08)` → clean (1100 ms, delayed 150 ms)
3. **Gold scan-line** — 2 px gold strip with linear-gradient brush + soft glow sweeps top→bottom across the image (1700 ms, delayed 250 ms)
4. **Donut stroke draw** — `stroke-dashoffset: 263.9` → `data-final` (1500 ms, delayed 550 ms)
5. **Score count-up** — 0 → `data-count-to` via JS easeOutCubic (1300 ms, in sync with donut)
6. **Body + footer fade-in** — opacity 0 → 1 (900 ms, delayed 400 ms)

**Trigger**: the **Collection section** entering the viewport (not per-card intersection) — this guarantees off-screen cards (3–4) animate in sync rather than waiting for horizontal scroll.

#### Drag-to-scroll
Mouse drag on `.cl-cards` scrolls horizontally. Drag distance >8 px suppresses the synthetic card-click so dragging across a card never opens a modal by accident.

### 6. Compare table (`.cl-compare`)

Standard `<table>` with `data-sort="<key>" data-type="num|text"` on column headers. Click header to sort (arrow indicates direction). Row click opens the quick-view modal for that listing.

### 7. Aspiration close (`.cl-asp`)

Pattern: **"Sở hữu [property type or feature]. Sở hữu [Country name]."** / **"Own a [feature]. Own [Country]."**

Examples:
| Country | VI | EN |
|---------|----|----|
| Vietnam | Sở hữu một bờ biển. Sở hữu Việt Nam. | Own a coastline. Own Vietnam. |
| Cyprus  | Sở hữu một bến cảng. Sở hữu Síp. | Own a harbour. Own Cyprus. |
| UK      | Sở hữu một dòng sông. Sở hữu London. | Own a riverside. Own London. |
| Panama  | Sở hữu một cánh cửa. Sở hữu Panama. | Own a gateway. Own Panama. |

The country word should be bold (`<strong>`) — CSS sets it gold.

### 8. Footer (`.cl-foot`)
Single line: "Curated by Nomad Asset Collective · Back to index". No changes per country.

### 9. Quick-view modal (`.cl-modal`)

Slide-up sheet on mobile, centered card on desktop. Populated entirely from `data-*` attributes on the triggering card:
- Hero image (`data-img`)
- Name + tagline (`data-name-*`, `data-tag-*`)
- 4 stat tiles (Entry / Yield / IRR / Score)
- 6 animated sub-score bars from `data-subs` JSON
- Open Full Listing CTA → `data-url`

Closed by × button, backdrop click, or Escape.

---

## Notion sync

### Source of truth

- **`🏠 NAC - Property Listings`** (DB id `35848ec25e86803283acc7ad989649c9`) is the source of truth for **which countries exist**, **which cities exist within each country**, and **all listing-level data** (name, brand, image, price, yield, IRR, NAC score, sub-scores, etc.). Countries are derived from the `Country` select; cities from the `Region/City` text field. Listings count and price range are computed.
- **`🌍 NAC - Country Listings`** (DB id `a01ef35ce9fd45b1bba3ec4de4da678c`, data source `ef2e9ff0-d725-4f2b-87c1-2d72c5a21905`) is the source of truth for **country-level editorial content only** — tagline, intro quote, atlas title, hero chips, SVG silhouette path, aspiration line, etc.

### Country DB schema — 10 lean properties

The Country DB has **only 10 columns**. Everything editorial moves into the Notion page **body** as structured markdown sections — Notion's native rich-text editor handles all the prose.

| Property | Type | Origin |
|----------|------|--------|
| **Country Name VI** | Title | Auto-scaffold from LLP country lookup |
| **Country Name EN** | Rich text | Auto-scaffold |
| **Slug** | Rich text | Auto-scaffold (`vn`, `gb`, `cy`…) |
| **Country Code** | Rich text | Auto-scaffold (ISO 2: `VN`, `GB`, `CY`…) |
| **Hub Status** | Select (Draft / Live / Archived) | **Manual gate** |
| **🌏 Region** | Select | Auto-mirrored from LLP Country→Region map |
| **🔗 Country URL** | URL | Auto-computed (`…/property-hub-bat-dong-san/<country>/`) |
| **📊 Plaque YoY** | Rich text | **Manual** — only plaque value not derivable from LLP |
| **📈 Listings Count** | Number | Auto — rollup from LLP Live listings in that country |
| **📤 Last Synced** | Date | Auto — stamped by sync script |

The DB table view shows these 10 columns — clean to scan, easy to filter.

### Page body — where editorial content lives

Open a country row → see a Notion page with structured `##` headings, one per section. Edit naturally in WYSIWYG. The sync script parses these by heading name.

```markdown
## Hero Tagline
🇻🇳 <strong>Bờ biển vàng của châu Á</strong> — branded residences từ JW Marriott đến Nobu.
🇬🇧 <strong>Asia's golden coast</strong> — branded residences from JW Marriott to Nobu.

## Hero Chips
One chip per line, `VI | EN` separated by a single pipe.
- 🏖️ Bờ biển 3,260km | 🏖️ 3,260km coastline
- 📈 GDP 7.1% (2024) | 📈 GDP 7.1% (2024)
- ✈️ 17.5M du khách | ✈️ 17.5M visitors

## Intro Quote
🇻🇳 Việt Nam không phải là điểm đến mới — mà là chương mới của châu Á.
🇬🇧 Vietnam isn't Asia's next destination — it's Asia's next chapter.

## Atlas Title
🇻🇳 Ba thành phố. Bốn dự án. Một <em>bờ biển vàng</em>.
🇬🇧 Three cities. Four listings. One <em>golden coast</em>.

## Atlas Lead
🇻🇳 Từ Đà Nẵng ở miền Trung…
🇬🇧 From Da Nang in the centre…

## Collection Title
🇻🇳 Bốn dự án. <em>Một dải bờ biển.</em>
🇬🇧 Four listings. <em>One golden coast.</em>

## Collection Lead
🇻🇳 Vuốt, kéo, hoặc lọc theo thành phố.
🇬🇧 Swipe, drag, or filter by city.

## Aspiration
🇻🇳 Sở hữu một bờ biển. Sở hữu <strong>Việt Nam</strong>.
🇬🇧 Own a coastline. Own <strong>Vietnam</strong>.

## SVG Path
\`\`\`
M 88 56 C 100 50, 130 46, 158 52 …
\`\`\`

## Cities

### Đà Nẵng
- slug: da-nang
- region_vi: Mặt biển Mỹ Khê · Non Nước
- region_en: My Khe · Non Nuoc beachfront
- airport_vi: DAD · 15–20 phút
- airport_en: DAD · 15–20 min
- lat: 16.05°N
- lng: 108.21°E
- pin_x: 178
- pin_y: 186
- label_offset_x: 14

### Sài Gòn
…
```

**Parsing rules** (sync script):
- `## SectionName` heading marks a section
- `🇻🇳` line = Vietnamese content; `🇬🇧` line = English content
- `## Hero Chips` items are one chip per line, split on ` | ` for VI / EN
- `## SVG Path` reads from the triple-backtick code block
- `## Cities` → `### CityName` blocks parsed as objects from `- key: value` lines

Notion's WYSIWYG is forgiving: extra blank lines, bold, italics, links — all fine. The parser only cares about heading names + emoji line markers + key-value rows under cities.

### Auto-scaffold rule

The Country DB is **never maintained manually**. The sync script reads the Property Listings DB and:

1. **Discovers every Live country** — `SELECT DISTINCT Country FROM listings WHERE Hub Status = 'Live'`.
2. **For each Live country with no matching Country DB row**, creates a new row with:
   - `Country Name VI/EN`, `Slug`, `Country Code` filled from a country lookup table (built into the script)
   - `🌏 Region` mirrored from the LLP Country→Region map
   - `🔗 Country URL` computed from the slug
   - `Hub Status = Draft`
   - Page body seeded from a Notion template with empty `##` sections labelled `(TODO)` so the editor knows what to fill
3. **For each existing row**, refreshes auto fields (`📈 Listings Count`, `📤 Last Synced`); leaves the page body untouched.
4. **For each row with `Hub Status = Live`**, renders `country/<slug>.html` from the HTML template using:
   - Country DB **properties** (slug, country name, country code, plaque YoY)
   - Country DB **page body sections** (taglines, chips, intro quote, atlas title/lead, collection title/lead, aspiration, SVG path, cities)
   - LLP listings filtered by Country, sorted by Purchase Price desc (drives hero carousel, plaque entry/yield, filter pills, collection cards, compare table)

A new listing in a brand-new country auto-creates a Draft row within one cron tick. The editor opens the row, fills in the page body (~15 minutes of writing), flips Hub Status to Live, and the CLP renders.

### Field categories — at a glance

| Where | What |
|-------|------|
| **LLP DB (auto-derived)** | List of countries · cities per country · listings count · plaque entry · plaque yield range · hero carousel slides · collection cards · compare table rows · filter pill counts |
| **Country DB properties (manual but light)** | Slug · Country Code · Hub Status · Plaque YoY · the gate + 2 atomic facts |
| **Country DB page body (manual, rich)** | Hero tagline · 3 hero chips · intro quote · atlas title · atlas lead · collection title · collection lead · aspiration line · SVG silhouette · per-city pin coords + region/airport copy |
| **Country DB auto-stamped** | Country Name VI/EN (scaffold default, editor can rename) · Region (mirrored) · Country URL (computed) · Listings Count · Last Synced |

### Sync script (future): `scripts/sync-notion-clp.mjs`

Triggered by `*/5 * * * *` cron + `workflow_dispatch` + `push` to `.github/triggers/**` + `repository_dispatch` (same triggers as `sync-notion.yml`).

1. Query the Property Listings DB → group Live listings by Country
2. For each Country in the resulting set:
   - Upsert a row in the Country DB (create Draft with empty body template if missing; refresh auto fields if exists)
   - If `Hub Status = Live`:
     - Fetch the Country DB row's **properties + page body** (single `notion-fetch` call returns both)
     - Parse the body sections by heading
     - Query LLP for listings in that country (sorted by Purchase Price desc)
     - Patch `country/<slug>.html` via cheerio against `data-notion-clp` / `data-notion-clp-list` slots
3. Stamp `📤 Last Synced` and `📈 Listings Count` on every row touched
4. Commit + push so `sync-wp.yml` propagates the rendered HTML to WordPress

Idempotent — re-firing is always safe.

### `data-notion-clp` attribute pattern

Mirrors the PDP's `data-notion="*"` convention. The CLP template uses `data-notion-clp="<field-key>"` on every element the sync script should patch:

```html
<h1 class="cl-name" data-notion-clp="country_name">
  <span data-vi>Việt Nam</span>
  <span data-en>Vietnam</span>
</h1>
```

For list-shaped data (cities, slides, cards), use `data-notion-clp-list="cities"` on the container — sync rebuilds the list from the parsed page body.

### WordPress sync (Phase 1 — shipped)

Two scripts + two workflows push CLP HTML to WordPress, mirroring the PDP pipeline:

| Script | What it does | Workflow |
|---|---|---|
| `scripts/create-wp-clp-page.mjs` | For Live country rows where `🆔 WP Page ID` is empty, parses the WP slug from `🔗 Country URL`, looks up the existing WP page (most country pages already exist as PDP parents), writes the Page ID back to Notion. Creates the WP page under `/<PROPERTY_HUB_PATH>/` if missing. | `.github/workflows/create-wp-clp-page.yml` — cron `*/5` + dispatch + push to `.github/triggers/**` |
| `scripts/sync-wp-clp.mjs` | For Live country rows with `🆔 WP Page ID`, reads `country/<slug>.html` (using the Notion `Slug` field for file lookup), PUTs the full HTML into the WP page's `raw_html_code` ACF field. | `.github/workflows/sync-wp-clp.yml` — cron `*/5` + dispatch + push to `country/*.html` |

Field used by both: `🆔 WP Page ID` (Number) on the Country DB. The Country URL field already encodes the WP slug (`https://nomadassetcollective.com/property-hub-bat-dong-san/vietnam/` → slug `vietnam`), so no separate WP-slug field is needed — the script parses it.

**Prerequisite — Notion integration access:** The Country DB must be shared with the `NAC Property Lister` integration (the same one used by the LLP sync). One-time setup: open the Country DB → `···` menu → Connections → add `NAC Property Lister` with **edit** permission. Without this, both scripts fail with `Could not find database with ID: …`. Each new country row inherits access from its parent DB, so no per-row sharing is needed.

**WP template requirement:** The country page in WP must use a template that echoes `<?php the_field('raw_html_code'); ?>` — same as PDPs. If the page existed before this pipeline (e.g. as a PDP parent), it likely has the default WP template and won't render the pushed HTML until the template is switched manually in WP admin → Pages → Page Attributes → Template.

**End-to-end "Hub Status → Live" → WP for CLPs:**
```
Notion Country DB: Hub Status → Live
  ├── create-wp-clp-page.yml (≤5 min): find/create WP page → writes WP Page ID back to Notion
  └── sync-wp-clp.yml (≤5 min): push country/<slug>.html into raw_html_code ACF
```

Total: same ~10 min ceiling as PDPs.

### Notion → HTML sync (Phase 2 — not yet implemented)

The cheerio-based `sync-notion-clp.mjs` script (documented above) hasn't been built yet, and `country/_template-clp.html` / `country/vn.html` don't yet carry `data-notion-clp` attributes. Until both land, country pages render from their current static HTML and are pushed to WP as-is. Editorial edits in the Notion page body do not yet propagate. See "Sync script (future)" above for the planned shape.

### Hard requirements learned in production

Two things that **must** hold for any CLP — enforce them in `sync-notion-clp.mjs` when it's built, and check them when hand-building a country from the template:

1. **Header must be `position:sticky`, never `position:fixed`.** The CLP is embedded inside WordPress via the `raw_html_code` ACF field. A `position:fixed` header is positioned relative to the viewport in isolation, but inside WP any ancestor with a `transform` / `filter` / `will-change` becomes its containing block, so the header silently stops being fixed (and on top of that it collides with the WP theme's own site header). The PDP `.nac-hdr` uses `position:sticky; top:0;` for exactly this reason. The CLP `.cl-hdr` now matches. **Mirror the main Property Hub header — sticky, not fixed.**

2. **Listing card `data-url` must be the absolute Notion `Listing URL`, never a relative `../properties/<slug>.html` preview path.** The relative path 404s on the live WP site (it resolves under `/property-hub-bat-dong-san/<country>/properties/…`, which doesn't exist). Critically, the WP slug in the Listing URL can differ from the `🔗 Slug` / HTML file name — e.g. Nobu's file is `nobu-da-nang.html` but its WP Listing URL is `…/vietnam/nobu-dn/`. So you cannot derive the live URL by string-munging the file slug; you must read `Listing URL` from the Property Listings DB row. The CLP card carries it on `data-url`, consumed by the hero-featured anchor (`featured.href`), the quick-view modal CTA (`#cl-modal-cta`), and the card click handler (`window.location.href = card.dataset.url`).

When `sync-notion-clp.mjs` is built it should populate each collection card's `data-url` (and the hero-featured static `href` fallback) directly from the matching Property Listings row's `Listing URL`, sourced the same way `update-index.mjs` already reads it.

---

## Workflow — adding a new country

### Primary path (Notion-driven, near-zero touch)

1. Add a new listing to `🏠 NAC - Property Listings` with `Country = <new country>` and `Hub Status = Live`.
2. Within ≤5 min, `sync-notion-clp.yml` creates a Draft row in `🌍 NAC - Country Listings` with `Country Name VI/EN`, `Slug`, `Country Code`, `🌏 Region`, `🔗 Country URL` pre-filled (from the script's country lookup table); the page body is seeded from a Notion template with empty `##` sections labelled `(TODO)`.
3. Editor opens the row in Notion. **Properties** at the top show the 10 atomic fields; **page body** has the structured editorial sections to fill in:
   - `## Hero Tagline` (🇻🇳 / 🇬🇧)
   - `## Hero Chips` (3 lines, `VI | EN`)
   - `## Intro Quote` (🇻🇳 / 🇬🇧)
   - `## Atlas Title` and `## Atlas Lead` (🇻🇳 / 🇬🇧)
   - `## Collection Title` and `## Collection Lead` (🇻🇳 / 🇬🇧)
   - `## Aspiration` (🇻🇳 / 🇬🇧)
   - `## SVG Path` — paste the country silhouette `d=…` value into the code block
   - `## Cities` — one `###` sub-heading per city with `- key: value` lines for region/airport copy + pin coords
4. Set `📊 Plaque YoY` on the property panel.
5. Flip `Hub Status` to **Live**.
6. Next cron tick renders `country/<slug>.html`; `sync-wp.yml` propagates to WordPress.

The editor never touches HTML or git. Everything lives in Notion.

### Manual escape hatch (template-driven)

For one-off design iteration or testing the layout without a Notion DB:

1. Copy `country/_template-clp.html` → `country/<slug>.html`
2. Replace the country-level fields per the inline header comment in the template
3. Duplicate `<article class="cl-card">` per listing; fill `data-*` + innerHTML; set `data-city` to match a filter pill
4. Commit + push; GH Pages publishes within ~1 min

Once you're happy with the layout, port the content fields back into Notion so the next sync doesn't overwrite your changes.

---

## Index integration

`index.html` has a "Country Pages" section above the Listing grid. Each country gets a 16:10 card with hero image + country name + listings count → links to `country/<slug>.html`. Cards are added manually for now; will be Notion-driven in a future iteration.
