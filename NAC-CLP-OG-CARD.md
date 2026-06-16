# NAC-CLP-OG-CARD.md

Per-country social-share preview card. One 1200×630 PNG per Live CLP, generated
on every Notion sync, served via GitHub Pages, wired into the CLP's
`og:image` / `twitter:image` meta tags.

This doc is the contract. Read before editing `scripts/build-clp-og-images.mjs`
or the CLP's head meta tags. If you change the layout, update the matching
section here so the next person doesn't reinvent the constraints.

---

## Layout

Two variants. The script picks based on what data is in the CLP HTML:

```
┌──────┬──────┬──────┬─────────────────────┐   "Three Heroes"
│      │      │      │  [NAC logo]         │   N cards (1, 2 or 3) on left
│  ①   │  ②   │  ③   │                     │   60% width
│      │      │      │  Việt Nam           │   text panel right 40%
│      │      │      │  VIETNAM            │
│CITY  │CITY  │CITY  │  Bờ biển vàng của… │
└──────┴──────┴──────┴─────────────────────┘
       NOMADASSETCOLLECTIVE.COM      PROPERTY HUB

┌──────────────────────┬─────────────────────┐   "Constellation Atlas"
│   country silhouette │  [NAC logo]         │   fallback when 0 listings
│   in NAC gold        │                     │   country silhouette + city
│   with city pins     │  Việt Nam           │   pins on left, text right
│                      │  …                  │
└──────────────────────┴─────────────────────┘
```

Pick rule (in `buildOne()`):

1. **`heroes.length > 0`** — Three Heroes. `target = min(3, heroes)`. Fetch
   from the candidate pool until N succeed.
2. **`heroes.length === 0` but `coastPath`** — atlas fallback. CLP has no
   Live listings yet (typical for newly-launched countries).
3. Neither — skip, log warning.

---

## Canvas / palette

| | Value | Source |
|---|---|---|
| Size | 1200 × 630 | Standard OG card (Facebook / LinkedIn / Twitter) |
| `NAVY` | `#1800ad` | NAC brand blue |
| `NAVY_DEEP` | `#0c0066` | Gradient end |
| `GOLD` | `#C4922C` | NAC `--gold` |
| `GOLD_SOFT` | `#E8BF72` | Lighter gold |
| `CREAM` | `#FAFAF7` | Body text |

Background = `bgFade` linear gradient navy → navy-deep + a subtle
`#ffffff @ 0.03` grain pattern.

---

## Typography

Matches the CLP CSS exactly. Both font families are **vendored TTFs** under
`scripts/fonts/` so `resvg` renders them deterministically in CI — no runtime
Google Fonts hit:

```
scripts/fonts/
  CormorantGaramond-400.ttf      ← display (taglines, country name)
  CormorantGaramond-400i.ttf
  CormorantGaramond-500.ttf
  CormorantGaramond-500i.ttf
  CormorantGaramond-600.ttf
  JetBrainsMono-400.ttf          ← mono (subtitle, stats, badges)
  JetBrainsMono-500.ttf
```

Resvg constructor:

```js
new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: {
    fontDirs: [FONT_DIR],
    defaultFontFamily: 'Cormorant Garamond',
    loadSystemFonts: true, // fallback for VI diacritics + emoji glyphs
  },
});
```

If you add a new weight or italic, drop the TTF into `scripts/fonts/` and
the script picks it up automatically.

---

## Right panel — text lockup

Reading top to bottom:

| Slot | y-coord | Font | Size | Color |
|---|---|---|---|---|
| NAC logo (whitened via `#whiten` filter) | 32 | n/a | 56×56 | pure white |
| Country name VI (italic display) | 152 | Cormorant Garamond Italic 500 | 74pt | `GOLD` |
| Country code subtitle (mono caps) | 188 | JetBrains Mono | 14pt | `CREAM @ 0.82` |
| VI tagline | dynamic | Cormorant Garamond Italic 500 | **auto-fit 18-28pt** | `CREAM` |
| EN tagline | dynamic | Cormorant Garamond Italic | **auto-fit 18-28pt** | `CREAM @ 0.82` |
| Stat line | H − 96 | JetBrains Mono | 16pt | `CREAM @ 0.9` |
| Property-hub badge | H − 64 | JetBrains Mono | 13pt | `GOLD_SOFT @ 0.88` |
| Footer URL strip | H − 14 | JetBrains Mono | 11pt | `CREAM @ 0.75` |

### Auto-fit tagline algorithm

CLP taglines wrap a punchy headline in `<strong>…</strong>` followed by an
em-dash and supporting copy:

```html
<strong>Bến đỗ an cư của Nam Bán Cầu</strong> — từ căn hộ resort Sydney
                                                đến nhà phố ven sông Melbourne.
```

`extractHeadline()` pulls only the `<strong>` portion (falls back to the
full string when there's no `<strong>` so non-conforming countries still
get something). Then `fitSingleLineFontSize()` estimates rendered width as

```
chars × size × 0.48      // Cormorant Garamond italic average glyph width
```

…and scales from 28pt down toward an 18pt floor when a headline would
otherwise overflow the ~412 px tagline budget. VI and EN sizes are
computed independently — short VI + long EN end up at different sizes.

Vertical gap between the two rows is `max(viSize, enSize) + 18` so the
spacing stays balanced when one row shrinks.

### Logo

Fetched once at script start from the WP CDN:

```
https://nomadassetcollective.com/wp-content/uploads/2026/05/OTG-Passport-Icons-4.png
```

Base64-encoded, embedded into every SVG. Run through `<filter id="whiten">`
(an `feColorMatrix` that drives R/G/B to 1.0 while preserving alpha) so it
reads as pure white regardless of the source PNG's gold tint. If the WP CDN
is unreachable the logo silently drops out — batch still ships.

---

## Left panel — Three Heroes

Cards adapt to the listing count. Column width stays constant; the group
centers in the panel when N < 3 so the visual rhythm matches the full
3-column case.

| N | Layout |
|---|---|
| 1 | One card centered |
| 2 | Two cards, gutter between, group centered |
| 3 | Three cards, edge-to-edge padding (current full layout) |

Card chrome (per tile):

- Width: `(720 − 2·PAD − 2·GUTTER) / 3 ≈ 209 px` (constant across N)
- Height: `H − 2·PAD = 566 px`
- Padding: 32 px outer, 14 px gutter
- Corners: `rx="14"`
- Border: gold `0.8 px @ 0.42` on top of the image
- Bottom gradient veil (`cardVeil`) — transparent → `NAVY_DEEP @ 0.82`
- City label centered at `y = COL_Y + COL_H − 28`, mono caps 13 pt gold
- Rank label `№01/№02/№03` above the city, mono caps 9 pt soft

### Hero source extraction

Pulled from the CLP HTML, not Notion. `sync-notion-clp` emits collection cards
in price-descending order, so the script just grabs `.cl-card` in order:

```js
$('#cl-collection-track .cl-card').each((_, el) => {
  const imgUrl = extractBgUrl($card.find('.cl-card-img').attr('style'));
  const cityName = $card.find('.cl-card-chip.city').first().text().trim();
  // …push up to 8 candidates
});
```

### Resilient fetch

CDN occasionally 502s or times out — that intermittent failure was
leaving empty dark tiles before. Two guards:

1. **`fetchAsDataUri` retries** — 5xx and abort errors retry twice with
   `attempt × 500 ms` backoff. 404 doesn't retry (no point).
2. **`fetchHeroDataUris` walks the pool** — keeps fetching candidates until
   it has `N` successful URIs. So if the 1st listing's CDN is down, the
   script silently advances to the 4th-9th candidate.

Variant log line reports what happened:

```
heroes (3/3, 8 candidates)        ← all good
heroes (2/3 — short pool)         ← only 2 listings available
heroes (3/3, 5 candidates)        ← fell forward through 2 failures
atlas (all 8 candidates failed)   ← CDN nuked, fell back to atlas variant
```

---

## Data extraction

From `country/<slug>.html`, via cheerio in `extractModel()`:

| Field | Selector | Notes |
|---|---|---|
| `nameVi` | `.cl-name [data-vi]` | Big italic display name (primary) |
| `nameEn` | `.cl-name [data-en]` | Falls back to `<title>` |
| `taglineVi` | `.cl-hero-tag [data-vi]` | Run through `extractHeadline()` |
| `taglineEn` | `.cl-hero-tag [data-en]` | Run through `extractHeadline()` |
| `viewBox` + `coastPath` | `.cl-atlas-map svg` + `.cl-map-coast` | Atlas fallback only |
| `heroes[]` | `#cl-collection-track .cl-card` × 8 | url + cityName per card |
| `listings` | `.cl-plaque .cl-plaque-row-val` (0) | Stat line |
| `cities` | `.cl-plaque .cl-plaque-row-val` (1) | Stat line |
| `entry` | `.cl-plaque .cl-plaque-row-val` (2) | Stat line |

Country code from `slug` via `COUNTRY_CODE_FROM_SLUG` lookup (11 entries —
add new ones here as new CLPs onboard).

---

## Output + wiring

```
og-images/
  clp-ae.png   clp-au.png   clp-cy.png   clp-gr.png
  clp-my.png   clp-pa.png   clp-sg.png   clp-th.png
  clp-tr.png   clp-uk.png   clp-vn.png
```

Served via GitHub Pages at
`https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/og-images/clp-<slug>.png`.

`sync-notion-clp.mjs::applyModel()` sets the meta tags on every sync:

```js
const ogImg = country.slug
  ? `https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/og-images/clp-${country.slug}.png`
  : ordered.find(l => l.heroImg)?.heroImg;       // legacy fallback
$('meta[property="og:image"]').attr('content', ogImg);
```

`buildManagedSeoHead` threads the same URL into `twitter:image` and the
JSON-LD `primaryImageOfPage`.

---

## Automation

`.github/workflows/sync-notion-clp.yml` runs `*/5 * * * *` cron + push to
`.github/triggers/**` or to the script paths. Pipeline:

1. `node scripts/sync-notion-clp.mjs` — patches `country/*.html` from Notion
2. `node scripts/ensure-share-section.mjs --clp` — share-button block
3. **`node scripts/build-clp-og-images.mjs`** — rebuilds every OG PNG
4. Commits `country/` + `og-images/` together; rebase-retry on push

So a real-world change flow is: edit a CLP's hero tagline in Notion →
within ~5 min the HTML repaints AND the OG card regenerates AND WP gets
the updated HTML via `sync-wp-clp.yml`.

---

## Running locally

```bash
# All 11 CLPs
node scripts/build-clp-og-images.mjs

# One slug
node scripts/build-clp-og-images.mjs vn

# Smoke-test against a historical CLP (with listings) — useful when current
# CLPs are empty due to a Notion bug regression
cp /tmp/vn-with-listings.html country/vn.html
node scripts/build-clp-og-images.mjs vn
git checkout country/vn.html
```

PNG lands in `og-images/clp-<slug>.png`. Open it locally to QA.

---

## Adding a new country

1. Add the country to the `COUNTRY_LOOKUP` table in `sync-notion-clp.mjs`
   (slug, code, region, etc.)
2. Add the slug → code mapping to `COUNTRY_CODE_FROM_SLUG` in
   `build-clp-og-images.mjs`
3. Create the Notion Country DB row, flip `Hub Status: Live`
4. Next cron tick scaffolds `country/<slug>.html` from the template, runs
   `build-clp-og-images.mjs` against it, and writes the OG PNG

If the country has no Live listings yet, the atlas variant fallback renders
the country silhouette + city pins. The PNG repaints automatically once
the first listing flips Live.

---

## Social-cache invalidation

Platforms cache OG cards hard. After shipping a layout change, scrape-fresh
via each platform's debugger to see the new card immediately:

- **Facebook / Threads** — https://developers.facebook.com/tools/debug/
- **LinkedIn** — https://www.linkedin.com/post-inspector/

Otherwise the new preview surfaces naturally when each platform's cache
expires (24-48 h).

---

## Known gotchas (learned the hard way)

1. **`@notionhq/client` must be pinned to `notionVersion: '2022-06-28'`** —
   PR #329 / PR #344. The unpinned `^2.2.15` lets fresh CI installs pull
   a newer client where `databases.query(database_id)` returns 0 rows under
   the data-source migration. Result: every CLP renders as `atlas (0
   listings)` because the per-country listings fetch silently empties.

2. **Compound `and:` filters don't work** under the data-source migration —
   PR #339. `fetchAllLiveListings` does a single-property filter for
   `Hub Status = Live` and filters by country client-side.

3. **The slug property is `🔗 Sl`, not `🔗 Slug`** — PR #344. Someone
   trimmed the property name in Notion. The lookup tries both:
   ```js
   slug: rt(p['🔗 Slug']) || rt(p['🔗 Sl']),
   ```
   If listings stop populating again, dump the LLP row's property keys
   first — that's where renames hide.

4. **OG card content vs. text size** — Cormorant Garamond italic glyphs
   are narrower than upright; the `0.48` char-factor was tuned for italic.
   If you change the font to upright/bold, retune the factor or the
   auto-fit will be too aggressive.

5. **Resvg + emoji** — `loadSystemFonts: true` is kept on as a fallback so
   the runner's Noto Emoji + Noto Sans handle VI diacritics and any
   stray emoji in the tagline. Don't remove it.

---

## File index

| Path | What |
|---|---|
| `scripts/build-clp-og-images.mjs` | The generator |
| `scripts/fonts/` | Vendored TTFs |
| `scripts/sync-notion-clp.mjs` | Patches the og:image meta |
| `og-images/clp-*.png` | Committed outputs (11) |
| `.github/workflows/sync-notion-clp.yml` | Rebuild pipeline |
| `country/_template-clp.html` | Where the og:image meta lives in the head |
