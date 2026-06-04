# AU Listing Personalisation Checklist

Companion to [`LLP-GENERATION.md`](./LLP-GENERATION.md). Use this as the **gate** for taking any
listing from suburb-banded/template to *fully personalised*. A listing passes only when every box is
**building-specific** — not suburb-shared, not a template default.

> **Reference standard:** `natura-macquarie-park` is the only AU listing currently personalised
> end-to-end (bespoke financials, editorial, **and** cine titles). Match it.

---

## Current AU state (49 listings, reviewed 2026-06)

| Dimension | State | Evidence |
|---|---|---|
| Hero + gallery images | ✅ **Personalised** | All 49 have unique hero + 4–6 distinct Cloudflare photos |
| Statement / aspiration line | ✅ Personalised | Auto-built from brand + city («Brand» … in «City») |
| Financials (price/rent/yield/IRR/CoC/payback) | ❌ **Banded** | ~33 shared A$850k / 4.0% / NAC 74 — *fixed in LLP-GENERATION.md §5* |
| NAC score + sub-scores | ❌ Banded | Flat 74 on 47/49 — *fixed in doc* |
| Editorial (tagline/desc/NAC note/pros/cons/features) | ❌ Suburb-shared | Byte-identical within suburb (brand swapped) — *fixed in doc* |
| Cine titles (§05/08/11 captions) | ❌ **Generic filler** | "Designed for the way you live / built to last" shared; only `natura` bespoke |
| Geo / map | ⚠️ 1 broken | `sanctuary-willow` → Carlingford, should be Wentworth Point |
| Data integrity | ⚠️ 2 unviable | `beyond-hurstville` unconfirmed; `14-asquith` has no real project |

**Net:** images + statement are genuinely per-listing; everything text/number is banded except `natura`.
`LLP-GENERATION.md` closes the financial + editorial gaps. **Cine titles are an open gap** not yet
written.

---

## ✅ "Fully Personalised Listing" checklist (apply per listing)

_Verification method in italics._

### 1 · Identity & taxonomy
- [ ] `Property Name` + `Name VI` — real bilingual building name
- [ ] `🔗 Slug`, `Listing URL` match the canonical pattern
- [ ] `Country / Region / Region-City / 📍 District / City` correct *(check `sanctuary-willow` → Wentworth Point)*
- [ ] `🏨 Hub Type` (apartment vs townhouse), `🛂 Immigration Type`, `Investment Program`, `Exit Strategy`, `Tags`, `Freehold`, `🌟 Hotel-Branded`, `💸 Tax-Friendly` — set per building

### 2 · Financials — every number distinct, defensible *(from LLP-GENERATION.md §5)*
- [ ] `Purchase Price` + `Price Per M2` (district $/m² × this unit's size × tier — **not** the A$850k default)
- [ ] `Yield %`, `IRR %`, `Cash-on-Cash %`, `ROI %`, `Payback Years`
- [ ] `Monthly Rental Income`, `Monthly Expenses`, `Cash Flow`, `Minimum Hold Period`, `Currency = AUD`
- [ ] *Verify: no two same-suburb listings share an identical row in the §5 table*

### 3 · NAC score + sub-scores
- [ ] `⭐ NAC Score` (rubric-derived, not flat 74) + `📊 Sub-Scores JSON` aligned to the donut `data-count-to`

### 4 · Editorial — bilingual VI + EN, building-specific
- [ ] `🏷️ Tagline` — names this building's hook (not the suburb line)
- [ ] `📝 Desc`, `💬 NAC Note` — this building's developer/scale/risk, distinct from neighbours
- [ ] `✦ Brand` + `✦ Brand Intro`, `🌍 Market`, `🌏 Key Markets`, `📈 Property YoY`, `✈️ Airport`, `🏖️ Beach` (where relevant)
- [ ] `Excerpt VI/EN` (hub fan-card blurb) — building-specific
- [ ] `📜 Statement` — guillemet «…» format, correct property-type word

### 5 · JSON sections (the most-missed)
- [ ] `✅ Pros JSON` (5) · `⚠️ Cons JSON` (4) · `✨ Features JSON` (5) — concrete to this building, honest
- [ ] `🔄 Process JSON` valid; `💲 Price Bands JSON` where a residence-mix table applies

### 6 · Cine titles — **OPEN GAP**
- [ ] `🎬 Cine 1/2/3 VI`+`EN` — image-derived, building-specific (not "Designed for the way you live / built to last"). *Fill Notion fields, or run `generate-cine-titles.mjs` with `ANTHROPIC_API_KEY` funded*

### 7 · Images
- [ ] `Image URL` (hero), `🖼️ Image 1–4`, `Mobile Image URL` — real photos of **this** building (✅ already done for AU); confirm no floor-plan / map / lot slipped through

### 8 · Geo / SEO / structured data
- [ ] `seo-geo-llm.mjs` geo block resolves to the **right suburb** *(fix `sanctuary-willow`)*
- [ ] JSON-LD has no `{token}` leftovers; `RealEstateListing` offer uses real price + AUD

### 9 · Pre-Live QA gate
- [ ] No empty applicable Notion field (half-filled = bug)
- [ ] Desktop (≥901px) **and** mobile (≤900px) both render
- [ ] **Viability:** real photos exist; project is real *(blocks `14-asquith`; confirm `beyond-hurstville`)*

---

## Per-listing exceptions (don't apply the blanket flow)

| Listing | Action |
|---|---|
| `sanctuary-willow` | Fix district/geo to **Wentworth Point NSW 2127** *before* SEO regen |
| `beyond-hurstville` | Run a single research pass to confirm developer/storeys/completion; financials currently estimated |
| `14-asquith-street-box-hill-south` | **Do not flip Live** — no real project at the address; retire or hold until a developer release exists |
| `natura-macquarie-park` | Already fully personalised — use as the reference standard |

---

## Write-back order (each step goes live on the public site — batch + QA)

1. **Geo/data fixes** (`sanctuary-willow`; quarantine `14-asquith`, `beyond-hurstville`).
2. **Financials + NAC score** per `LLP-GENERATION.md` §5 → Notion numeric + `📊 Sub-Scores JSON`.
3. **Editorial** (tagline, desc, NAC note, pros/cons/features, excerpt) → Notion bilingual fields.
4. **Cine titles** → fill `🎬 Cine 1/2/3` or run the generator.
5. Let the 5-min `sync-notion.yml` cron patch HTML → WordPress; **visual QA each batch** desktop + mobile.
