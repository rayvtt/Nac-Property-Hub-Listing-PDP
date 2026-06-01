# NAC-CLP-DESIGN.md — Country Listing Page

Companion to `NAC-PDP-DESIGN.md`. The CLP is the editorial container that sits between the site index and the property PDPs — one page per country, presenting all live listings for that country with map context, comparison, and quick-view.

Live reference: `country/vn.html` (Vietnam — 4 listings, 3 cities).
Master template: `country/_template-clp.html`.
Notion source: `🌍 NAC - Country Listings` DB (see "Notion sync" below).

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

### Database: `🌍 NAC - Country Listings`

Holds country-level metadata for the CLP. Listing-level data continues to come from `🏠 NAC - Property Listings`.

| Field | Type | Notion property | Sync target |
|-------|------|-----------------|-------------|
| Country Name VI | Title | `Country Name VI` | `.cl-name [data-vi]`, `<title>` |
| Country Name EN | Rich text | `Country Name EN` | `.cl-name [data-en]` |
| Slug | Rich text | `Slug` | filename `country/<slug>.html` |
| Hub Status | Select | `Hub Status` (Draft / Live) | (sync gate) |
| Country Code | Rich text | `Country Code` (ISO 2) | `<meta name="country">` |
| Hero Tagline VI | Rich text | `Hero Tagline VI` | `.cl-hero-tag [data-vi]` |
| Hero Tagline EN | Rich text | `Hero Tagline EN` | `.cl-hero-tag [data-en]` |
| Hero Chip 1 VI | Rich text | `🏷️ Hero Chip 1 VI` | first chip in `.cl-hero-chips` (VI side) |
| Hero Chip 1 EN | Rich text | `🏷️ Hero Chip 1 EN` | first chip in `.cl-hero-chips` (EN side) |
| Hero Chip 2 VI/EN | Rich text | `🏷️ Hero Chip 2 VI/EN` | second chip |
| Hero Chip 3 VI/EN | Rich text | `🏷️ Hero Chip 3 VI/EN` | third chip |
| Plaque Entry | Rich text | `💵 Plaque Entry` | `.cl-plaque-row` (Entry from) value |
| Plaque Yield | Rich text | `📈 Plaque Yield` | `.cl-plaque-row` (Yield) value |
| Plaque YoY | Rich text | `📊 Plaque YoY` | `.cl-plaque-row` (YoY USD) value |
| Intro Quote VI | Rich text | `📜 Intro Quote VI` | `.cl-intro-quote [data-vi]` |
| Intro Quote EN | Rich text | `📜 Intro Quote EN` | `.cl-intro-quote [data-en]` |
| Atlas Title VI | Rich text | `🗺️ Atlas Title VI` | `.cl-atlas-text-title [data-vi]` |
| Atlas Title EN | Rich text | `🗺️ Atlas Title EN` | `.cl-atlas-text-title [data-en]` |
| Atlas Lead VI | Rich text | `🗺️ Atlas Lead VI` | `.cl-atlas-text-lead [data-vi]` |
| Atlas Lead EN | Rich text | `🗺️ Atlas Lead EN` | `.cl-atlas-text-lead [data-en]` |
| SVG Path | Rich text | `🗺️ SVG Path` | full `d="..."` for `.cl-map-coast` |
| Cities JSON | Rich text | `📍 Cities JSON` | array of `{slug, name, region_vi/en, airport_vi/en, count, pin_x, pin_y}` — drives the pin-list AND the SVG pins |
| Collection Title VI/EN | Rich text | `🎯 Collection Title VI/EN` | `.cl-coll-title [data-vi/en]` |
| Collection Lead VI/EN | Rich text | `🎯 Collection Lead VI/EN` | `.cl-coll-lead [data-vi/en]` |
| Aspiration Line VI | Rich text | `🌟 Aspiration Line VI` | `.cl-asp-line [data-vi]` |
| Aspiration Line EN | Rich text | `🌟 Aspiration Line EN` | `.cl-asp-line [data-en]` |
| Country URL | URL | `🔗 Country URL` | canonical link |

### Sync script (future): `scripts/sync-notion-clp.mjs`

1. Query `🌍 Country Listings` DB filtered by Hub Status = Live
2. For each country row:
   - Read country-level fields above
   - Query `🏠 Property Listings` DB filtered by `Country == <country>` AND `Hub Status = Live`
   - Sort listings by Price desc
   - Patch `country/<slug>.html` via cheerio:
     - Hero carousel slides (top-N by price, fill image/name/price/url)
     - Plaque counts (Listings = N, Cities = unique cities)
     - Filter pills (one per city, with counts)
     - Collection cards (one per listing, filled from Property Listings DB)
     - Compare table rows (one per listing)
     - Country-level text fields (tagline, quote, atlas, aspiration, etc.)
3. Commit + push so `sync-wp.yml` propagates the rendered HTML to WordPress

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

## Workflow — scaffold a new country

### Manual (today)

1. Copy `country/_template-clp.html` → `country/<slug>.html` (slug is 2-letter ISO: `vn`, `cy`, `gb`, etc.)
2. Replace:
   - `<title>` and meta description
   - Country name (VI/EN), tagline, hero chips
   - Hero carousel slides (top 4 listings by price)
   - Plaque snapshot
   - Intro pull quote
   - Atlas: replace SVG `d="..."` with country silhouette; update city pin positions + labels
   - Collection: duplicate `<article class="cl-card">` per listing, fill `data-*` + innerHTML, set `data-city` to match a filter pill
   - Filter pills: one per city + an "All"
   - Compare table: one row per listing
   - Aspiration line
3. Update `index.html` "Country Pages" section — add new card
4. Commit + push; GH Pages publishes within ~1 min

### Notion-driven (target)

1. Create row in `🌍 NAC - Country Listings` with all country-level fields filled
2. Set `Hub Status = Live`
3. Next `sync-notion-clp.yml` cron tick (or manual workflow_dispatch) scaffolds `country/<slug>.html` from the template and patches all `data-notion-clp` slots
4. `sync-wp.yml` propagates the HTML to WordPress

---

## Index integration

`index.html` has a "Country Pages" section above the Listing grid. Each country gets a 16:10 card with hero image + country name + listings count → links to `country/<slug>.html`. Cards are added manually for now; will be Notion-driven in a future iteration.
