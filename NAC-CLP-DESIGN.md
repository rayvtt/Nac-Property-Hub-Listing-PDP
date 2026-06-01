# NAC-CLP-DESIGN.md — Country Listing Page

Companion to `NAC-PDP-DESIGN.md`. The CLP is the editorial container that sits between the site index and the property PDPs — one page per country, presenting all live listings for that country with map context, comparison, and quick-view.

**Auto-scaffolds from the Property Listings DB.** When a new Live listing lands in a country that doesn't yet have a CLP, the sync script creates a Draft row in the Country DB on the next tick. Editor fills in the editorial copy + the country silhouette path, flips Hub Status to Live, the page renders. The list of countries, the list of cities per country, the listings count, and the entry price are never maintained by hand — they're computed from the Property Listings DB at sync time.

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

### Auto-scaffold rule

The Country DB is **never maintained manually**. The sync script reads the Property Listings DB and:

1. **Discovers every Live country** — `SELECT DISTINCT Country FROM listings WHERE Hub Status = 'Live'`.
2. **For each Live country with no matching row in the Country DB**, creates a new Draft row with:
   - `Country Name VI/EN`, `Slug`, `Country Code` filled from a country lookup table (built into the script)
   - `🌏 Region` mirrored from the LLP DB's Region field
   - `Hub Status = Draft`
   - All editorial fields left blank for the editor to author
3. **For each existing row**, refreshes the auto-computed fields (plaque entry / cities count / last synced) and leaves the editorial fields untouched.
4. **For each row with `Hub Status = Live`**, renders `country/<slug>.html` from the template using country-level fields from the Country DB AND listing-level data from the Property Listings DB (filtered by Country, sorted by Purchase Price desc).

A new listing in a brand-new country auto-creates a Draft country row within one cron tick. The editor opens the row, fills in the editorial copy + the SVG silhouette path + the per-city pin coords, flips Hub Status to Live, and the CLP renders on the next tick.

### Field categories (Country DB)

| Field | Origin |
|-------|--------|
| Country Name VI, Country Name EN, Slug, Country Code | **Auto-scaffold** on first creation (from country lookup table); editor can correct |
| 🌏 Region | **Auto** (mirrored from LLP Country → Region map) |
| Hub Status | **Manual** (editor controls when the CLP goes live) |
| Hero Tagline VI/EN | **Manual** — editorial copy |
| 🏷️ Hero Chip 1–3 VI/EN | **Manual** — country macro facts (GDP, coastline, visitors) |
| 💵 Plaque Entry | **Auto** — `min(Purchase Price)` across Live listings, formatted as `$NK` / `$N.NM` |
| 📈 Plaque Yield | **Auto** — `min(Yield %) – max(Yield %)` across Live listings |
| 📊 Plaque YoY | **Manual** — country-level macro stat, no derivation source |
| 📜 Intro Quote VI/EN | **Manual** — editorial |
| 🗺️ Atlas Title / Lead VI/EN | **Manual** — editorial |
| 🗺️ SVG Path | **Manual** — hand-drawn silhouette, 320×420 viewBox |
| 📍 Cities JSON | **Mixed** — sync script auto-fills `slug`, `name`, `count` per city by grouping LLP listings by `Region/City`; editor fills in `region_vi/en`, `airport_vi/en`, `pin_x`, `pin_y`, `lat`, `lng` after positioning pins on the SVG |
| 🎯 Collection Title / Lead VI/EN | **Manual** — editorial |
| 🌟 Aspiration Line VI/EN | **Manual** — editorial (`Sở hữu một X. Sở hữu <Country>.` pattern) |
| 🔗 Country URL | **Auto-scaffold** (computed as `https://nomadassetcollective.com/property-hub-bat-dong-san/<country-slug>/`); editor can correct |
| 📤 Last Synced | **Auto** — stamped by the script after each successful patch |

### Sync script (future): `scripts/sync-notion-clp.mjs`

Triggered by `*/5 * * * *` cron + `workflow_dispatch` + `push` to `.github/triggers/**` + `repository_dispatch` (same triggers as `sync-notion.yml`).

1. Query the Property Listings DB → group Live listings by Country
2. For each Country in the resulting set:
   - Upsert a row in the Country DB (create with `Hub Status = Draft` if missing; refresh auto fields if exists)
   - If `Hub Status = Live`, render the CLP:
     - Read country-level fields from the Country DB row
     - Read listing-level fields from the Property Listings DB (filtered + price-desc sorted)
     - Patch `country/<slug>.html` via cheerio against `data-notion-clp` / `data-notion-clp-list` slots
3. Stamp `📤 Last Synced` on every row touched
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

For list-shaped data (cities, slides, cards), use `data-notion-clp-list="cities"` on the container — sync rebuilds the list from the JSON.

---

## Workflow — adding a new country

### Primary path (Notion-driven, near-zero touch)

1. Add a new listing to `🏠 NAC - Property Listings` with `Country = <new country>` and `Hub Status = Live`.
2. Within ≤5 min, `sync-notion-clp.yml` creates a Draft row in `🌍 NAC - Country Listings` populated with `Country Name VI/EN`, `Slug`, `Country Code`, `🌏 Region`, `🔗 Country URL`, and an initial `📍 Cities JSON` listing the city from `Region/City`.
3. Editor opens the row in Notion and fills in:
   - Hero tagline + 3 hero chips (country macro facts)
   - Intro quote, atlas title + lead, collection title + lead, aspiration line
   - Plaque YoY (the only plaque value not auto-computed)
   - `🗺️ SVG Path` — stylized country silhouette, 320×420 viewBox
   - `📍 Cities JSON` — fill in per-city `region_vi/en`, `airport_vi/en`, and `pin_x/pin_y` coords (after eyeballing where each city sits on the silhouette)
4. Flip `Hub Status` to **Live**.
5. Next cron tick renders `country/<slug>.html`; `sync-wp.yml` propagates to WordPress.

The editor never touches HTML or git for content changes — only for visual/layout iteration.

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
