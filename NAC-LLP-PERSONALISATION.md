# NAC-LLP-PERSONALISATION.md — Listing personalisation checklist

The canonical "is this listing actually personalised, or is it showing template
defaults?" checklist. Companion to CLAUDE.md → *Listing data completeness*
(which lists every Notion field) — this doc is specifically about the fields
that, when left blank/templated, make listings look **identical to each other**.

Two audit scripts enforce it:
- `scripts/audit-au.mjs` — per-listing editorial audit (AU today; pattern is country-agnostic).
- `scripts/seo-audit.mjs` — flags `{token}` / broken JSON-LD.

## A. Per-listing (must be unique to each property) — bilingual VI+EN

Driven by Notion → patched by `sync-notion.mjs`. If blank, the PDP shows the
template placeholder (worse than empty).

| Field | PDP surface | "Templated" smell |
|---|---|---|
| `🏷️ Tagline` | hero / card | starts `Freehold … living in …` |
| `💬 NAC Note` | §NAC composition | `safe-haven hold rather than a cash-flow play` |
| `Excerpt` | hub fan card | `FIRB-approved new dwelling; capital-growth & safe-haven hold` |
| `✅ Pros JSON` | §pros | `Tight metropolitan rental market` |
| `⚠️ Cons JSON` | §cons | `~9-hour flight from Vietnam` |
| `✨ Features JSON` | §features | `established transport & amenity` |
| `📝 Desc` | §overview | identical prose across listings |
| `✦ Brand` + `✦ Brand Intro` | §brand | empty → brand section blank |
| `🌍 Market` (prose) | §04 Market | identical paragraph |
| `📜 Statement` | closing aspiration line | must be `Sở hữu [type] «Brand» tại «City».` |
| `📊 Sub-Scores JSON` | donut | must align with `⭐ NAC Score` |
| `🔄 Process JSON` | §process | generic steps |
| `🎬 Cine 1/2/3` | image-break titles | blank → AI-filled (needs ANTHROPIC_API_KEY credit) |

## B. Per-CITY / metro (shared across listings in the same city, but must differ between cities)

**This is the gap that made every listing's §04 boxes identical.** These are
metro-level market facts — all Sydney suburbs share Sydney's numbers, but Sydney
≠ İstanbul ≠ Athens.

| Field | PDP surface | Granularity | Source of truth |
|---|---|---|---|
| `📊 Market Stats JSON` | §04 the 4 `.nac-mkt-card` boxes | **per metro city** | `set-market-stats.mjs` `CITY_STATS` map (real, sourced figures) |
| `🌏 Key Markets` | §04 facts | per country/market | Notion |
| `🏖️ Beach` · `✈️ Airport` | §04 facts | per city | Notion |
| `📈 Property YoY` | §04 facts | per city (label NAC estimate) | Notion |

**`📊 Market Stats JSON`** shape — array of `{val, vi, en}` (typically 4); `val`
is the language-neutral big number, `vi`/`en` are the labels. Empty field →
template default cards stand (no regression). Choose **city/asset-appropriate**
metrics (residential markets → price growth / yield / vacancy / migration;
tourism-led → visitors / occupancy). Label ranges/estimates honestly; never
invent a precise figure — cite a real source (central bank, tourism board).

```json
[{"val":"~8M","vi":"Khách quốc tế Athens 2024","en":"Athens int'l visitors 2024"},
 {"val":"+8.4%","vi":"Tăng giá căn hộ Athens 2024","en":"Athens apartment-price growth 2024"}]
```

## C. Per-listing structural (data-driven, but per-property)

| Field | PDP surface | Notes |
|---|---|---|
| `💲 Price Bands JSON` | §Residence Mix table | reveals the table only when present; currency-aware (€/$/£) |
| `🔑 Handover` | §features / note | per project |
| `Image URL` · `🖼️ Image 1-4` · `Mobile Image URL` | hero + gallery | from `sync-images`; **real photos only** (no plans/maps/lots) |

## D. Cross-sell — Plan-B Journey cards (template-level, but must fit the listing's programme)

The 2nd "Representative Journeys" card is currently hardcoded in
`_template-listing-pdp.html` (`Canada Start-Up Visa / Hanoi founder`). On a
Greece/Turkey PDP this reads as residue. **Rule:** the journey cards must match
the listing's `Investment Program` (a Greece GV listing → EU-residency journeys,
a Turkey CBI listing → CBI journeys), or be reduced to the single matching card.
*(Open item — country-aware journey cards or single-card per programme.)*

## E. Audit cadence

Before flipping `Hub Status → Live`, and after any batch generation:
1. `audit-au.mjs` (or country variant) → every editorial field PERSONALISED, not TPL.
2. Confirm `📊 Market Stats JSON` is set and matches the listing's city.
3. `seo-audit.mjs` → no `{token}` / broken JSON-LD.
4. Real photos present (hero is a render/photo, not a plan/map/lot).

## City coverage for `📊 Market Stats JSON` (rollout status)

All 11 mapped metros are **✅ done** (76 listings written via `set-market-stats:write`,
live on WP). New markets (e.g. **Thailand / Malaysia**, Bangkok / KL / Koh Samui, etc.)
are **pending** — add them to `CITY_STATS` + `METRO_RULES` in `scripts/set-market-stats.mjs`
with real, sourced figures, then re-run `set-market-stats:write`.

| City (metro) | Listings | Status |
|---|---|---|
| Athens · Galaxidi | 6 · 1 | ✅ done |
| Sydney · Melbourne | 38 · 11 | ✅ done |
| İstanbul | 11 | ✅ done |
| London | 5 | ✅ done |
| Limassol (Cyprus) | 3 | ✅ done |
| Panama City | 2 | ✅ done |
| Da Nang · HCMC · Hồ Tràm | 2 · 1 · 1 | ✅ done |
| Bangkok · Kuala Lumpur · Koh Samui · … | — | ⏳ pending (add to CITY_STATS) |
