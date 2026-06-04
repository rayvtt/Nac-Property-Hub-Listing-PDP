# LLP Generation — Bespoke Per-Listing Enrichment

Source-of-truth document for **bespoke, de-banded** listing content (editorial **and** financial)
on the NAC Property Hub. One entry per listing. The values here are authored to be written back
into the Notion **🏠 NAC - Property Listings** DB, from which `sync-notion.mjs` patches every
`properties/<slug>.html`.

> **Why this doc exists.** A 2026-06 audit found the Australian batch (49 listings) had been
> enriched at the **suburb level, not per listing**: buildings in the same suburb shared
> byte-identical taglines, descriptions, NAC notes, pros/cons/features — and, worse, identical
> financials. ~33 of 49 carried the exact same `A$850,000 / 4.0% yield / A$2,833 rent / NAC 74`
> profile regardless of building, suburb, size, or tier. This document re-derives every field
> **per building** so no two listings are alike.

**Scope of this pass:** all 49 Australia listings (Sydney + Melbourne).
**Status:** financial figures are NAC estimates anchored to a per-district pricing model (below),
differentiated per building by unit size and tier. They are *not* developer-confirmed price lists;
each entry flags `confirmed` vs `estimated` facts.

---

## 1. District-average pricing model

The anchor for every listing's financials. For each district we hold three researched inputs:

| Input | Meaning | Source |
|---|---|---|
| **$/m²** | district median sale price per internal m² (apartments; houses/townhouses held as median sale price) | realestate.com.au / domain.com.au suburb profiles, dated per entry |
| **gross yield %** | district median gross rental yield for the asset class | same |
| **growth %/yr** | trailing/forecast 5-yr capital-growth rate | same |

A listing's price is **not** the district median — it is the district `$/m²` applied to *that
building's* representative unit size and tier, so two buildings in one suburb diverge by size,
configuration, and quality. The district table is filled in §4 from the research inputs.

> **Future automation (requested).** Because the listings are already live, we can compute these
> district averages directly from our own inventory once volume per district is sufficient, and —
> next step — stand up a scraper against a local real-estate hub (realestate.com.au / domain) to
> pull live comparable sales + rents per suburb and refresh the `$/m²`, yield, and growth inputs on
> a schedule. Until then the inputs are researched manually per district and dated. See §5.

---

## 2. Financial formulas (applied identically to every listing)

All AUD. Every output is a deterministic function of the building's `size`, `tier`, and its
district inputs — so de-banding is structural, not cosmetic.

```
tier_multiplier      : entry 0.92 · mid 1.00 · premium 1.12
Purchase Price        = district $/m²  ×  unit internal m²  ×  tier_multiplier
                        (townhouses/houses: district median house price × size/bed adjustment × tier)
Price Per M2          = Purchase Price / unit internal m²
Monthly Rent          = Purchase Price × gross_yield / 12          (rounded to nearest A$25)
Monthly Expenses      = Monthly Rent × expense_ratio
   expense_ratio       high-rise w/ pool+gym 0.34 · mid-rise w/ lift 0.30 · boutique walk-up 0.26
                        · townhouse (owners-corp light) 0.18 · freestanding house 0.15
Cash Flow (monthly)   = Monthly Rent − Monthly Expenses           (unleveraged)
Net Yield %           = (Monthly Rent − Monthly Expenses) × 12 / Purchase Price
Cash-on-Cash %        = Net Yield %   (unleveraged, cash purchase — the NAC default for FIRB buyers)
IRR (5-yr) %          = growth%/yr  +  Net Yield %                 (unleveraged total-return proxy)
Payback Years         = round( 1 / gross_yield )                  (gross-rent payback multiple)
```

Rationale: foreign (FIRB) buyers on this platform typically purchase with cash or a large deposit,
so the headline return is reported **unleveraged** — Cash-on-Cash equals net yield, and the 5-yr IRR
is the honest growth + net-income sum rather than a leverage-flattered figure. Payback is the gross
rental multiple (`1/yield`), which moves with each building's yield instead of sitting at a flat 13.

## 3. NAC Score rubric (/100)

Replaces the flat `74` that 47 of 49 listings shared. Scored per building; the sub-scores populate
`📊 Sub-Scores JSON` and must sum-weight to `⭐ NAC Score`.

| Dimension | Max | What moves it |
|---|---:|---|
| Location & transport | 25 | rail/metro proximity, CBD time, precinct anchors |
| Capital-growth outlook | 20 | district growth rate, supply pipeline, gentrification stage |
| Yield | 15 | net yield vs AU norm |
| Liquidity / resale depth | 15 | owner-occupier demand, stock overhang, buyer pool |
| Build quality & amenity | 10 | developer track record, specs, facilities |
| Immigration / education utility | 10 | school zones, university proximity, family-relocation fit |
| Freehold / AUD safe-haven | 5 | title type, currency, rule-of-law premium |

---

## 4. District inputs (researched)

Suburb medians researched per district (2026 portal data — realestate.com.au / Domain /
YourInvestmentProperty / propertyvalue.com.au / apartments.com.au). Apartment districts hold a
median **$/m²**; townhouse/house districts hold a **median dwelling price** (priced as houses, not
per-m²). These are the *anchor*; each listing's own price is derived in §5 from this × its unit
size × tier.

| Metro | District | Asset class | Median $/m² (apt) | Median dwelling (house/TH) | Gross yield | Growth %/yr |
|---|---|---|---:|---:|---:|---:|
| Sydney | Zetland (Green Square) | apt | A$13,500 | — | ~5.0% | 4.0% |
| Sydney | Waterloo | apt | A$13,000 | — | ~5.4% | 2.5% |
| Sydney | Erskineville | apt | A$15,000 | — | ~4.5% | 4.5% |
| Sydney | Macquarie Park | apt | A$13,500 | — | ~4.6% | 1.5% |
| Sydney | Carlingford | apt | A$12,250 | house ~A$2.2M | ~4.9% (apt) | 1.5% apt / 3.3% house |
| Sydney | North Sydney | apt | A$16,250 | — | ~3.5% | 3.5% |
| Sydney | Parramatta | apt | A$11,000 | — | ~5.0% | 3.0% |
| Sydney | Harris Park | apt | A$10,500 | — | ~5.2% | 3.0% |
| Sydney | Pagewood / Eastgardens | TH (house comp) | — | ~A$2.65M | ~2.4% | 3.5% |
| Sydney | Burwood | apt | A$13,200 | — | ~4.5% | 3.2% |
| Sydney | Auburn | apt | A$10,600 | — | ~6.0% | 4.5% |
| Sydney | Bankstown | apt | A$9,500 | — | ~5.5% | 4.8% |
| Sydney | Lakemba | apt | A$9,300 | — | ~5.3% | 6.0% |
| Sydney | Blacktown | apt | A$8,800 | — | ~5.3% | 3.5% |
| Sydney | Arncliffe | apt | A$11,100 | — | ~5.2% | 2.5% |
| Sydney | Ashbury | apt / TH | A$11,500 | house ~A$2.4M | ~2.8% apt / ~2.1% house | 4.5% apt / 8–10% house |
| Sydney | Caringbah | apt | A$12,000 | — | ~3.9% | 2.0–2.5% |
| Sydney | Hurstville | apt | A$10,800 *(est)* | — | ~4.9% | 3.0% |
| Sydney | Wentworth Point | apt | A$10,500 | — | ~5.0% | ~1.0% |
| Melbourne | Melbourne CBD | apt | A$10,800–11,500 | — | ~5.0% | 1.5% |
| Melbourne | Southbank | apt | A$12,500 | — | ~4.7% | 2.5% |
| Melbourne | South Melbourne | apt | A$12,800–13,500 | — | ~3.9% | 3.5% |
| Melbourne | Alphington | TH | — | townhouse ~A$1.30M | ~3.1% | 3.5% |
| Melbourne | Box Hill South | TH (house comp) | — | house ~A$1.5M | ~2.8% | 3.5% |
| Melbourne | Box Hill North | TH (house comp) | — | house ~A$1.4–1.5M | ~2.8% | 6.0% |
| Melbourne | Blackburn | TH (house comp) | — | house ~A$1.65M | ~2.4% | 8.2% |

> **Reproducibility.** The §5 financials are emitted deterministically from these district inputs +
> each listing's `size`, `tier`, and `expense_ratio` by the model in §2. Re-running with the same
> inputs yields byte-identical numbers — the basis for the future scraper (swap the manual medians
> for live-scraped suburb comps and regenerate). Per-listing model inputs are recorded inline in
> each entry's **Pricing basis** line.

---

## 5. Per-listing entries

_49 bespoke entries. Financials are engine-computed (§2); editorial is per-building researched
(developer sites, realestate.com.au/Domain/YIP/propertyvalue.com.au, 2026). `[c]`=confirmed,
`[e]`=estimated. Currency AUD throughout._

---

## SYDNEY — Inner South

### 1. Alba — `alba-zetland` · NAC 75/100
**Zetland (Green Square), Sydney** · apartment · mid tier · Bridgehill Group, off-plan/under-construction [c]
**Financials** — Price **A$1,116,000** · A$14,308/m² (78 m²) · gross yield 4.8% · **IRR 5yr 7.2%** · CoC 3.2% · payback 21 yr · rent A$4,475/mo · expenses A$1,520/mo · cash-flow A$2,955/mo
**Sub-scores** — Loc 22 · Growth 10 · Yield 12 · Liquidity 11 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Zetland A$13,500/m² × 78 m² × tier 1.06 · yield 4.8% · growth 4.0% · exp 0.34
**Building** — Two towers (10 + 15 storeys), 360 apts, Bourke/O'Dea cnr ~200 m Green Square stn; McNally + Sissons; double-storey penthouses, rooftop pool/gym [c]
**Tagline** — EN: "Twin towers, double-height penthouses, Green Square's doorstep" · VI: "Hai tháp đôi, penthouse thông tầng, sát Green Square"
**Statement** — Own a «Alba» apartment in «Sydney».
**Desc** — Alba is Bridgehill's two-tower address (10 and 15 storeys, 360 homes) 200 m from Green Square station at the Bourke St / O'Dea Ave corner. Its calling cards are double-storey penthouses, a rooftop terrace with city views, and resident pool and gym — a step up in scale from Bridgehill's earlier UNO and JADE next door.
**NAC Note** — Alba is the larger-scale, more polished sibling among the Zetland four — two towers and double-height penthouses give it a sharper profile than single-block neighbours. The 15-storey tower's mid-to-high floors carry the best aspect and resale story; lower-floor 2-beds compete with Luna and the broader Green Square supply, so unit selection drives the return more than the building name. The tenant pool is deep (young CBD professionals, ~75% rental suburb), but Alba's premium asks put yield at the lower end of the Zetland band. A capital-growth-led hold, not a cash-flow play.
**Pros** — 200 m to Green Square station (closest of the four); 15-storey tower with genuine city-aspect upper floors; double-storey penthouses as a resale halo; proven Bridgehill delivery in this exact precinct; rooftop terrace + pool + gym.
**Cons** — Premium pricing pulls yield to the bottom of the Zetland range; 360 units = heavy internal supply at any resale window; lower-floor 2-beds near-identical to Luna's; FIRB + NSW 8% surcharge.
**Features** — Two towers (10+15), 360 apts; rooftop skyline terrace; resident pool + gym; landscaped courtyard; ~200 m Green Square station.
**De-band** — Highest tier + largest scale of the Zetland four → per-m² premium and the lowest yield of the cluster.

### 2. Downtown — `downtown-zetland` · NAC 73/100
**Zetland (Green Square / Rosebery fringe), Sydney** · apartment · mid (entry-leaning) tier · Deicorp, off-plan/under-construction [c]
**Financials** — Price **A$660,000** · A$12,692/m² (52 m²) · gross yield 5.2% · **IRR 5yr 7.5%** · CoC 3.5% · payback 19 yr · rent A$2,850/mo · expenses A$910/mo · cash-flow A$1,940/mo
**Sub-scores** — Loc 21 · Growth 10 · Yield 14 · Liquidity 9 · Quality 7 · Immigration 7 · Safe-haven 5
**Pricing basis** — Zetland A$13,500/m² × 52 m² × tier 0.94 · yield 5.2% · growth 4.0% · exp 0.32
**Building** — Four buildings, 546 apts on a 2.16 ha Epsom Rd block; MHNDU + BVN; ground-floor retail + laneways; 6-Star Green Star precinct [c]
**Tagline** — EN: "Four buildings, retail at your door, lowest entry" · VI: "Bốn tòa nhà, phố mua sắm dưới chân, giá vào thấp nhất"
**Statement** — Own a «Downtown» residence in «Sydney».
**Desc** — Downtown is Deicorp's 546-apartment, four-building precinct on a 2.16 ha Epsom Road block, wrapping ground-floor retail and public laneways into a mixed-use neighbourhood rather than a single tower. Its scale lets it lead the Zetland four on entry price — from the low A$600Ks for a compact, lease-ready 1-bed.
**NAC Note** — Downtown is the volume play of the Zetland cluster — 546 homes and the lowest entry, anchored by a high-turnover 1-bed that leases fast to single CBD commuters. That gives it the best gross yield of the four and the deepest tenant pool, but also the heaviest concurrent supply: at any resale point you compete against your own building. A yield-and-liquidity hold for a buyer who wants the cheapest defensible Green Square ticket; pick a higher floor with retail-podium separation to protect resale. Capital growth tracks the precinct rather than outperforming it.
**Pros** — Lowest entry of the four; ground-floor retail + laneways (true mixed-use); compact 1-beds lease quickly; 6-Star Green Star (lower running costs); Deicorp scale and delivery record.
**Cons** — 546 units = heaviest internal resale competition; compact 1-bed caps growth upside; retail frontage noise on low floors; FIRB + surcharge, ~5% yield growth-led.
**Features** — Four buildings, 546 apts, 2.16 ha; integrated retail + laneways; 6-Star Green Star; walk to Green Square (~4 km CBD); MHNDU + BVN / Deicorp.
**De-band** — Smallest unit + lowest entry of the four → lowest price, highest gross yield, largest concurrent supply.

### 3. Luna — `luna-zetland` · NAC 76/100
**Zetland (Green Square), Sydney** · apartment · mid (design-led) tier · Bridgehill Group, **completed ~Q3 2024** [c]
**Financials** — Price **A$991,000** · A$13,764/m² (72 m²) · gross yield 5.0% · **IRR 5yr 7.5%** · CoC 3.5% · payback 20 yr · rent A$4,125/mo · expenses A$1,240/mo · cash-flow A$2,885/mo
**Sub-scores** — Loc 20 · Growth 10 · Yield 13 · Liquidity 13 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Zetland A$13,500/m² × 72 m² × tier 1.02 · yield 5.0% · growth 4.0% · exp 0.30
**Building** — Single 10-level, 230 apts + penthouses, 499 Botany Rd; MHN Design Union; 700 m² landscaped rooftop terrace (BBQ, lounge, EV charging, pet wash) [c]
**Tagline** — EN: "Boutique single block, 700 m² rooftop garden" · VI: "Tòa nhà boutique, vườn trên mái 700 m²"
**Statement** — Own a «Luna» apartment in «Sydney».
**Desc** — Luna is Bridgehill's completed, boutique 230-home building at 499 Botany Road — a single ten-level block by MHN Design Union, already built and tenantable. Its signature is a 700 m² landscaped rooftop with BBQ, community lounge, shared EV charging and a pet wash bay, steps from Gunyama Park and the Green Square primary school.
**NAC Note** — Luna's edge over its Zetland neighbours is that it's finished — income from day one, no construction risk and a verifiable strata history, which the off-plan three can't offer. The single-block, design-led format attracts a stickier owner-occupier-flavoured tenant, supporting rent but capping the bargain entry Downtown offers. The lowest-risk, most-liquid of the four for a passive holder; the trade-off is paying established-resale pricing rather than off-plan incentives. Growth tracks the precinct.
**Pros** — Completed (immediate income, zero construction risk); 700 m² rooftop terrace + BBQ; boutique single-block (low internal supply); shared EV charging + pet wash; steps to Gunyama Park + primary school.
**Cons** — Established-stock pricing (no off-plan incentives); smaller 2-bed than sister project Alba; single bathroom on the rep 2-bed; ~5% yield, FIRB still required (new dwelling).
**Features** — 700 m² rooftop terrace + BBQ; resident EV charging; pet wash bay; walk to Gunyama Park aquatic; boutique 230-home MHN block.
**De-band** — Only completed building of the four — trades on certainty (immediate income, known strata); tighter size keeps entry below Alba.

### 4. The Avenues — `the-avenues-zetland` · NAC 79/100
**Zetland (Green Square Town Centre), Sydney** · apartment · premium tier · Mirvac, off-plan (part of $1.23bn Town Centre) [c]
**Financials** — Price **A$1,354,000** · A$15,929/m² (85 m²) · gross yield 4.5% · **IRR 5yr 7.5%** · CoC 3.0% · payback 22 yr · rent A$5,075/mo · expenses A$1,725/mo · cash-flow A$3,350/mo
**Sub-scores** — Loc 22 · Growth 11 · Yield 12 · Liquidity 12 · Quality 10 · Immigration 7 · Safe-haven 5
**Pricing basis** — Zetland A$13,500/m² × 85 m² × tier 1.18 · yield 4.5% · growth 4.5% · exp 0.34
**Building** — Three interconnected, dual-aspect buildings, 130 Joynton Ave; CO-AP architects; skyline aspect; resident wellness studio + business studio [c]
**Tagline** — EN: "Mirvac's Town Centre address, dual-aspect skyline views" · VI: "Địa chỉ Town Centre của Mirvac, tầm nhìn đôi ra skyline"
**Statement** — Own a «The Avenues» apartment in «Sydney».
**Desc** — The Avenues is Mirvac's premium chapter at the heart of Green Square Town Centre — three interconnected, dual-aspect buildings curated with architects CO-AP and angled for Sydney-skyline outlooks. Residents get a private wellness studio and business studio, and the tier-one Mirvac brand that anchors the broader $1.23bn precinct masterplan.
**NAC Note** — The Avenues is the blue-chip pick of the Zetland four — Mirvac's brand, builder covenant and Town Centre positioning carry a resale premium the boutique and high-volume neighbours can't match, and from ~A$995K it's also the dearest. Dual-aspect, larger 2-beds appeal to owner-occupiers and quality tenants, firming rent but compressing gross yield to the bottom of the cluster. A capital-preservation and brand-liquidity hold for a buyer prioritising exit certainty over income; the Mirvac name is the asset as much as the bricks.
**Pros** — Tier-one Mirvac (strongest resale brand/covenant of the four); heart of the Town Centre (most central address); dual-aspect skyline buildings; private wellness + business studios; larger premium 2-bed plates.
**Cons** — Highest entry of the four; lowest gross yield (~4.5%); off-plan with a long Town Centre programme; FIRB + 8% surcharge on a premium base.
**Features** — Three interconnected dual-aspect buildings; wellness studio; business studio; central Town Centre (130 Joynton Ave); Mirvac $1.23bn masterplan.
**De-band** — Premium tier — Mirvac brand + largest dual-aspect units + most central site → top per-m² and lowest yield of the four.

### 5. Danks St District — `danks-st-district-waterloo` · NAC 71/100
**Waterloo, Sydney** · apartment · mid tier · DASCO, off-plan/under-construction [c]
**Financials** — Price **A$975,000** · A$13,000/m² (75 m²) · gross yield 5.5% · **IRR 5yr 6.2%** · CoC 3.7% · payback 18 yr · rent A$4,475/mo · expenses A$1,430/mo · cash-flow A$3,045/mo
**Sub-scores** — Loc 21 · Growth 7 · Yield 14 · Liquidity 10 · Quality 8 · Immigration 6 · Safe-haven 5
**Pricing basis** — Waterloo A$13,000/m² × 75 m² × tier 1.00 · yield 5.5% · growth 2.5% · exp 0.32
**Building** — ~1.6 ha masterplan, 400+ residences, landmark ~20-storey tower, curated ground retail + laneways; walk to new Waterloo Metro [c]
**Tagline** — EN: "1.6-hectare retail district, Metro a walk away" · VI: "Khu phố bán lẻ 1,6 ha, Metro trong tầm đi bộ"
**Statement** — Own a «Danks St District» apartment in «Sydney».
**Desc** — Danks St District is DASCO's 1.6-hectare masterplanned neighbourhood off Bourke and Danks Streets — 400-plus residences anchored by a ~20-storey landmark tower, woven through curated ground-floor retail and public laneways. Its pitch is district scale plus a short walk to the new Waterloo Metro.
**NAC Note** — Danks St District trades on the Waterloo Metro catalyst — a new station within walking distance is the biggest swing factor for inner-south growth this decade, and the retail-and-laneway scale gives it neighbourhood gravity Tb.W can't match. The flip side is Waterloo's soft recent unit growth (~1.4% last year) and heavy pipeline supply, so this is a Metro-uplift bet, not a track-record buy. A solid ~5.5% yield with genuine re-rating potential once the Metro beds in — but the buyer must hold through a supply-heavy, slow-growth window first. Pick a tower unit above the retail podium.
**Pros** — Walk to new Waterloo Metro (connectivity re-rating); 1.6 ha masterplan with retail + laneways; higher Waterloo yields (~5.5%) than Zetland; landmark ~20-storey view stock; lower entry than premium Zetland.
**Cons** — Waterloo unit growth weak (~1.35% last 12 mo); 400+ residences plus a heavy local pipeline; growth thesis leans on Metro timing; FIRB + surcharge, off-plan.
**Features** — Walk to Waterloo Metro; curated ground retail + laneways; landmark ~20-storey tower; 1.6 ha public domain; DASCO delivery.
**De-band** — Waterloo (not Zetland) base — lower per-m² + higher yield than the Zetland four, softer growth; Metro proximity sets it apart from Tb.W.

### 6. Tb.W — `tb-w-waterloo` · NAC 72/100
**Waterloo, Sydney** · apartment · mid (boutique) tier · The Botany / Tb.W, off-plan, completion ~Apr 2026 [c]
**Financials** — Price **A$772,000** · A$13,786/m² (56 m²) · gross yield 5.3% · **IRR 5yr 6.4%** · CoC 3.9% · payback 19 yr · rent A$3,400/mo · expenses A$885/mo · cash-flow A$2,515/mo
**Sub-scores** — Loc 20 · Growth 7 · Yield 14 · Liquidity 12 · Quality 8 · Immigration 6 · Safe-haven 5
**Pricing basis** — Waterloo A$13,000/m² × 56 m² × tier 1.06 · yield 5.3% · growth 2.5% · exp 0.26
**Building** — 132 apts across two buildings, only 3–4 apts/floor, 219–231 Botany Rd; industrial-chic + Scandinavian interiors; rooftop spaces [c]
**Tagline** — EN: "Boutique Botany Road, three homes per floor" · VI: "Boutique trên Botany Road, ba căn mỗi tầng"
**Statement** — Own a «Tb.W» apartment in «Sydney».
**Desc** — Tb.W (The Botany) is a boutique 132-apartment pair of buildings on Botany Road, Waterloo, completing around April 2026, with only three to four homes per floor. Its character is industrial-chic facades over Scandinavian-inspired interiors, premium finishes and rooftop residents' spaces — a design-led counterpoint to Waterloo's larger towers.
**NAC Note** — Tb.W's differentiator is density — three-to-four homes per floor in a 132-apartment scheme means more light, privacy and a less commoditised resale story than the 400-plus-unit towers around it. That boutique scarcity should hold value better through Waterloo's supply-heavy patch, and the near-term (April 2026) completion shortens settlement risk versus Danks St. A ~5.3% yield on a well-finished 1-bed that leases easily to CBD professionals; the catch is paying a boutique per-m² premium in a soft-growth suburb, so the buy is about product quality and lower supply risk rather than headline yield.
**Pros** — Low density (3–4 apts/floor, only 132 homes); near-term completion (~Apr 2026); design-led (industrial-chic + Scandinavian); boutique scarcity supports resale; Botany Rd + Waterloo Metro catchment.
**Cons** — Boutique per-m² premium in a weak-growth suburb; no large amenity podium; 1-bed limits the sharer/family segment; FIRB + surcharge, Waterloo growth lagged.
**Features** — Only 3–4 apts/floor; industrial-chic + Scandinavian interiors; rooftop residents' spaces; Botany Rd / Waterloo Metro; boutique 132-apt two-building scheme.
**De-band** — Boutique low-density → per-m² premium over volume Waterloo stock; larger 1-bed plate; near-term completion lowers its risk discount.

### 7. Lillian Residence — `lillian-residence-erskineville` · NAC 77/100
**Erskineville, Sydney** · apartment (+ terraces/penthouses) · premium (boutique inner-west) tier · Coronation Property, off-plan, est completion ~Jul 2027 [c]
**Financials** — Price **A$1,304,000** · A$15,902/m² (82 m²) · gross yield 4.5% · **IRR 5yr 7.7%** · CoC 3.2% · payback 22 yr · rent A$4,900/mo · expenses A$1,370/mo · cash-flow A$3,530/mo
**Sub-scores** — Loc 20 · Growth 11 · Yield 12 · Liquidity 13 · Quality 9 · Immigration 7 · Safe-haven 5
**Pricing basis** — Erskineville A$15,000/m² × 82 m² × tier 1.06 · yield 4.5% · growth 4.5% · exp 0.28
**Building** — 129 residences (apts, terrace homes, penthouses) across 8 floors, 9 Metters St; Silvester Fuller + Turf Design; beside new McPherson Park; ~3.5 km CBD [c]
**Tagline** — EN: "Boutique 8-floor village living beside McPherson Park" · VI: "Sống làng phố boutique 8 tầng, cạnh công viên McPherson"
**Statement** — Own a «Lillian Residence» apartment in «Sydney».
**Desc** — Lillian is Coronation Property's boutique 129-residence collection at 9 Metters Street, Erskineville — apartments, terrace homes and penthouses across just eight floors, by Silvester Fuller with Turf Design Studio landscaping. It sits beside the new McPherson Park in a tightly-held, ~3.5 km-from-CBD inner-west pocket.
**NAC Note** — Lillian is the outlier of the cluster — Erskineville is a blue-chip, supply-constrained inner-west suburb with firmer growth and a higher median than Zetland or Waterloo, so the thesis flips from yield to scarcity-led capital growth. The boutique 8-floor format, terrace component and park frontage attract owner-occupiers, keeping the building tightly held and supporting resale but compressing gross yield to ~4.5%. The highest-quality, lowest-supply-risk hold of the inner-south set, for a buyer wanting blue-chip exposure and patient on income. The 2027 completion is the main wait.
**Pros** — Blue-chip, supply-constrained Erskineville (firmer growth); boutique low-rise (8 floors, 129 homes — minimal supply); direct McPherson Park frontage; Silvester Fuller + Turf Design pedigree; terrace + penthouse formats broaden the buyer pool.
**Cons** — Highest entry of the inner-south cluster; lowest gross yield (~4.5%); longest wait (~Jul 2027); FIRB + surcharge on a high base.
**Features** — Beside McPherson Park; apts + terrace homes + penthouses; boutique 8-floor 129-res; Silvester Fuller + Turf Design; ~3.5 km CBD, Erskineville/St Peters stns.
**De-band** — Dearer suburb — Erskineville's higher median + tighter supply → top per-m², bottom yield, strongest growth and lowest supply risk of the set.

---
## SYDNEY — Macquarie Park (NW tech/university precinct)

### 8. Macquarie Rise — `macquarie-rise-macquarie-rise` · NAC 75/100
**Macquarie Park, Sydney** · apartment · premium tier · TOGA (w/ Baptist Union NSW), completion early 2027, final stage off-plan [c]
**Financials** — Price **A$1,391,000** · A$15,120/m² (92 m²) · gross yield 4.6% · **IRR 5yr 4.5%** · CoC 3.0% · payback 22 yr · rent A$5,325/mo · expenses A$1,810/mo · cash-flow A$3,515/mo
**Sub-scores** — Loc 23 · Growth 5 · Yield 12 · Liquidity 10 · Quality 10 · Immigration 10 · Safe-haven 5
**Pricing basis** — Macquarie Park A$13,500/m² × 92 m² × tier 1.12 · yield 4.6% · growth 1.5% · exp 0.34
**Building** — 3 towers, 268 apts, ~A$400M, 122 Herring Rd; Club Rise lounge (Pilates, gym, karaoke) + 20 m podium lap pool; Turner Studio + Stack Studio [c]
**Tagline** — EN: "Hotel-styled towers steps from two Metro stops" · VI: "Cụm tháp phong cách khách sạn, sát hai ga Metro"
**Statement** — Own a «Macquarie Rise» apartment in «Sydney».
**Desc** — Macquarie Rise is TOGA's flagship three-tower precinct on Herring Road, built around the resort-grade Club Rise lounge and a 20 m podium pool no rival Mac Park building matches. Hotel-specialist Stack Studio interiors and an early-2027 completion make it the most amenity-led, design-forward address in the cluster.
**NAC Note** — Of the five Macquarie Park towers, this is the amenity and brand play — TOGA is a 60-year Sydney name and the Club Rise / lap-pool package is genuinely a cut above, justifying the premium tier. The trade-off is price-per-m² at the top of the suburb band and a 2027 settlement that exposes buyers to the current completion-wave oversupply. Best for a hold-for-lifestyle-then-rent buyer who values the building over raw yield; we rate the developer covenant the strongest in the cluster.
**Pros** — Resort-grade Club Rise lounge + 20 m lap pool; TOGA's 60-yr delivery record; two Metro stations walkable; Stack Studio hotel-grade interiors; strong pre-sales (125+ sold).
**Cons** — Premium price-per-m² for the suburb; 268-unit rental competition at handover; 2027 settlement into a supply-heavy window; church-land partnership delivery dependencies.
**Features** — 20 m podium lap pool; Pilates studio + gym; karaoke / break-out rooms; co-working in Club Rise; four-bed family configs.
**De-band** — Highest $/m², only hotel-grade amenity podium — premium positioning, not yield-led.

### 9. Natura — `natura-macquarie-park` · NAC 72/100
**Macquarie Park, Sydney** · apartment · mid-premium tier · Romeciti, off-plan (selling) [c]
**Financials** — Price **A$1,231,000** · A$14,314/m² (86 m²) · gross yield 4.6% · **IRR 5yr 4.6%** · CoC 3.1% · payback 22 yr · rent A$4,725/mo · expenses A$1,510/mo · cash-flow A$3,215/mo
**Sub-scores** — Loc 22 · Growth 5 · Yield 12 · Liquidity 10 · Quality 8 · Immigration 10 · Safe-haven 5
**Pricing basis** — Macquarie Park A$13,500/m² × 86 m² × tier 1.06 · yield 4.6% · growth 1.5% · exp 0.32
**Building** — 2× 21-storey towers, 334 apts + retail, Shrimptons Creek corridor, ~7,000 m² gardens, 5 communal floors; Architectus + Elenberg Fraser [c]
**Tagline** — EN: "Green-corridor living opposite Macquarie Centre" · VI: "Sống bên hành lang xanh, đối diện Macquarie Centre"
**Statement** — Own a «Natura» residence in «Sydney».
**Desc** — Natura wraps two 21-storey towers around the Shrimptons Creek green corridor, with 7,000 m² of gardens and five whole floors of shared space — the greenest setting of any tower in the cluster. It sits directly opposite Macquarie Centre and a short walk from Macquarie University station, pairing Architectus architecture with Elenberg Fraser interiors.
**NAC Note** — Natura's differentiator is environmental — the creek frontage and the volume of landscaped communal space are real, not marketing gloss, and it sits closer to retail (Macquarie Centre) than the Herring Road towers. It is the most "amenity-as-greenery" of the five, where Macquarie Rise is "amenity-as-hotel." Romeciti is a less-established covenant than TOGA or Meriton, so we weight delivery risk slightly higher; against that, the green-corridor scarcity supports rental appeal to the university base. A solid mid-premium hold for a tenant-quality-driven investor.
**Pros** — Direct Shrimptons Creek frontage; opposite Macquarie Centre; 7,000 m² gardens + 5 communal floors; Elenberg Fraser interiors; deep student/staff catchment.
**Cons** — Romeciti a lighter covenant; very large 334-unit scheme; Waterloo Rd traffic on low floors; 2026–27 supply risk.
**Features** — Riparian creek-side gardens; five communal floors; ground-floor retail; four basement levels; 1–4 bed mix.
**De-band** — Greenest setting + closest to Macquarie Centre — smaller rep unit, retail-adjacency premium not amenity premium.

### 10. Parkside MQ — `parkside-mq-macquarie-park` · NAC 71/100
**Macquarie Park, Sydney** · apartment · mid tier · VIMG Australia, **completed** (move-in ready) [c]
**Financials** — Price **A$767,000** · A$13,224/m² (58 m²) · gross yield 4.6% · **IRR 5yr 4.7%** · CoC 3.2% · payback 22 yr · rent A$2,950/mo · expenses A$885/mo · cash-flow A$2,065/mo
**Sub-scores** — Loc 20 · Growth 5 · Yield 12 · Liquidity 12 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Macquarie Park A$13,500/m² × 58 m² × tier 0.98 · yield 4.6% · growth 1.5% · exp 0.30
**Building** — 2× ~14–15-storey towers, ~318 units, 159–161 Epping Rd; concierge podium, gym + yoga, clubhouse, outdoor cinema, water feature; DKO / Alliance [c]
**Tagline** — EN: "Completed and rent-ready on Epping Road" · VI: "Đã hoàn thiện, sẵn sàng cho thuê trên đường Epping"
**Statement** — Own a «Parkside MQ» apartment in «Sydney».
**Desc** — Parkside MQ is the one finished building in the cluster — twin ~14-storey DKO towers on Epping Road, already standing, with a concierge podium, outdoor cinema and water feature. Buyers skip construction risk entirely and can lease from settlement.
**NAC Note** — The de-risked pick: it is built, so there's no completion-wave timing gamble and rental income can start immediately — the opposite profile to Trilogy or Macquarie Rise. The smaller representative one-bedder makes it the lowest entry ticket and the easiest yield play of the five, for the cash-flow-first buyer. The catch is that a completed VIMG building has less "new release" scarcity and the one-bed stock competes hardest in the rental pool. Best for an investor who wants keys, a tenant, and no construction exposure now.
**Pros** — Already completed (zero construction risk); immediate rental income; lowest entry price (compact 1-beds); concierge + outdoor cinema podium; established Epping Rd transport spine.
**Cons** — No new-release growth kicker; compact 1-beds face deepest rental competition; older completed stock; no Metro literally at the door (bus/Epping Rd reliant).
**Features** — Concierge; gym + yoga room; clubhouse; outdoor cinema; central water-feature courtyard.
**De-band** — Only completed building → smallest rep unit, lowest entry price, highest immediate-yield, no construction-timing discount.

### 11. The Macquarie Collection — `the-macquarie-collection-macquarie-park` · NAC 74/100
**Macquarie Park (North Ryde edge), Sydney** · apartment · mid-premium tier · Landmark Group, completion late 2026 (off-plan) [c]
**Financials** — Price **A$1,545,000** · A$14,306/m² (108 m²) · gross yield 4.6% · **IRR 5yr 4.7%** · CoC 3.2% · payback 22 yr · rent A$5,925/mo · expenses A$1,780/mo · cash-flow A$4,145/mo
**Sub-scores** — Loc 22 · Growth 5 · Yield 12 · Liquidity 11 · Quality 9 · Immigration 10 · Safe-haven 5
**Pricing basis** — Macquarie Park A$13,500/m² × 108 m² × tier 1.06 · yield 4.6% · growth 1.5% · exp 0.30
**Building** — 3 buildings — 28-level 256-apt tower + two 6-level; 1–3 bed climate-controlled, 5 Halifax St nr North Ryde Metro; AJC; Landmark delivered 1,300-apt Lachlan's Line [c]
**Tagline** — EN: "North Ryde Metro address by a proven local builder" · VI: "Địa chỉ gần ga North Ryde, từ nhà phát triển uy tín"
**Statement** — Own a «The Macquarie Collection» apartment in «Sydney».
**Desc** — The Macquarie Collection is Landmark Group's three-building release on Halifax Street, anchored by a 28-storey tower beside North Ryde Metro and flanked by two low-rise buildings for a quieter scale mix. Apartments are climate-controlled and orientation-tuned for breeze and light, from the developer behind the 1,300-home Lachlan's Line.
**NAC Note** — The pitch is a trusted local builder (Landmark, 25 years, A$4B delivered) plus a North Ryde Metro doorstep rather than the Herring/Waterloo Road core. A larger three-bed representative unit positions it for the owner-occupier / family-tenant end, which defends value better in a unit-heavy oversupplied suburb. Completion is the nearest-term of the off-plan set (late 2026), trimming timing risk versus Trilogy and Macquarie Rise. We rate the covenant second only to TOGA/Meriton in the cluster.
**Pros** — Beside North Ryde Metro; Landmark's 25-yr / A$4B record; low-rise + tower scale choice; climate-controlled, breeze-oriented apts; nearest completion (late 2026).
**Cons** — Halifax St is North Ryde-edge, not the university core; 256-unit tower competition; 3-bed highest entry ticket; suburb supply overhang.
**Features** — Climate-controlled apartments; breeze/light orientation; tower + boutique low-rise mix; North Ryde Metro adjacency; 1–3 bed incl family layouts.
**De-band** — Largest rep unit (3-bed family) → highest absolute price, owner-occupier-defended value, North Ryde (not core) location.

### 12. Trilogy — `trilogy-macquarie-park` · NAC 73/100
**Macquarie Park, Sydney** · apartment · premium tier · Meriton, off-plan (selling) [c]
**Financials** — Price **A$1,158,000** · A$14,846/m² (78 m²) · gross yield 4.6% · **IRR 5yr 4.5%** · CoC 3.0% · payback 22 yr · rent A$4,450/mo · expenses A$1,515/mo · cash-flow A$2,935/mo
**Sub-scores** — Loc 22 · Growth 5 · Yield 12 · Liquidity 9 · Quality 10 · Immigration 10 · Safe-haven 5
**Pricing basis** — Macquarie Park A$13,500/m² × 78 m² × tier 1.10 · yield 4.6% · growth 1.5% · exp 0.34
**Building** — 3 towers 39/45/59 storeys (among AU's tallest suburban towers), ~866+ apts; 3,000 m² podium, rooftop gardens, childcare; 80%+ corner/dual-aspect; PTW [c]
**Tagline** — EN: "Sydney's tallest suburban towers, never-built-out views" · VI: "Tháp ngoại ô cao nhất Sydney, tầm nhìn không bị che"
**Statement** — Own a «Trilogy» apartment in «Sydney».
**Desc** — Trilogy is Meriton's three-tower landmark on Talavera Road, climbing to 59 storeys — among the tallest suburban residential towers in Australia, with views over Lane Cove National Park and the CBD that cannot be built out. Over 80% of homes hold corner, dual-aspect positions above a 3,000 m² landscaped podium.
**NAC Note** — The height-and-view play, carrying Meriton's covenant — Australia's largest apartment builder, the strongest delivery name in the cluster alongside TOGA. The "never-built-out" Lane Cove / CBD outlook is the genuine scarcity and the reason a high-floor unit can outperform on resale. The flip side: a 59-storey, ~866-unit megatower releases a large rental cohort at once, so ground/mid floors compete hard; value sits specifically in the view stock. A capital-growth / view-premium hold rather than a quick yield buy — pick the floor, not just the building.
**Pros** — Never-built-out Lane Cove NP + CBD views; Meriton (most bankable builder); 80%+ corner/dual-aspect layouts; 3,000 m² podium + rooftop gardens; on-site childcare + full amenity.
**Cons** — ~866-unit megatower floods the rental pool; low/mid floors lack the view premium; longer off-plan horizon; high-rise strata above the cluster norm.
**Features** — High-rise district & national-park views; rooftop gardens; 3,000 m² podium amenity; on-site childcare; dual-aspect corner majority.
**De-band** — View-driven — high-floor rep unit commands a view premium; tallest/largest scheme, yield concentrates in upper-floor stock.

## SYDNEY — Carlingford

### 13. 88 Livie — `88-livie-carlingford` · NAC 70/100
**Carlingford, Sydney** · apartment · mid tier · Landpearl (built by Decode, iCIRT), off-plan [c]
**Financials** — Price **A$1,050,000** · A$12,500/m² (84 m²) · gross yield 4.9% · **IRR 5yr 5.0%** · CoC 3.5% · payback 20 yr · rent A$4,300/mo · expenses A$1,205/mo · cash-flow A$3,095/mo
**Sub-scores** — Loc 18 · Growth 5 · Yield 13 · Liquidity 12 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Carlingford A$12,250/m² × 84 m² × tier 1.02 · yield 4.9% · growth 1.5% · exp 0.28
**Building** — Boutique 88 apts (studio–3 bed), 780–786 Pennant Hills Rd; most 2/3-beds w/ dual parking; off-form concrete + standing-seam metal; ~10 min walk station/light rail [c]
**Tagline** — EN: "Boutique 88-home block with dual parking" · VI: "Tòa căn hộ boutique 88 căn, hai chỗ đậu xe"
**Statement** — Own a «88 Livie» apartment in «Sydney».
**Desc** — 88 Livie is a deliberately small 88-apartment building on Pennant Hills Road, where most two- and three-bedders come with rare dual parking — a practical edge for Carlingford's car-dependent family tenants. The off-form-concrete and metal façade sits in leafy parkland yet five minutes from the M2 and walking distance to the future light rail.
**NAC Note** — Among the four Carlingford listings this is the boutique-scale, dual-parking pick — the small unit count and two-car allocation target owner-occupier families and command rents single-car investor stock can't. Landpearl is a modest but real 20-year developer, and Decode (iCIRT-certified) lifts construction-quality confidence. It won't have Meriton's amenity weight or The Carling's masterplan, but its scarcity-of-scale plus parking is a defensible niche. A clean mid-tier yield hold pitched at the family rental segment.
**Pros** — Boutique 88-unit (lower strata density); dual parking on most 2/3-beds (rare locally); Decode iCIRT builder; walk to future light rail; 5 min to the M2.
**Cons** — Pennant Hills Rd arterial frontage; Landpearl a lighter covenant; limited amenity vs Meriton; light rail not yet delivered.
**Features** — Dual-parking 2/3-bed layouts; off-form concrete + metal façade; studio–3-bed mix; parkland/river-walk surrounds; boutique low-density.
**De-band** — Dual-parking + boutique scale rent at a family premium on a sub-median price — yield-led small-scheme.

### 14. Luxton — `luxton-carlingford` · NAC 70/100
**Carlingford, Sydney** · apartment · premium (boutique) tier · Changfa Group (built Decode iCIRT), completion ~Q4 2025, near-complete [c]
**Financials** — Price **A$1,039,000** · A$12,988/m² (80 m²) · gross yield 4.9% · **IRR 5yr 5.0%** · CoC 3.5% · payback 20 yr · rent A$4,250/mo · expenses A$1,190/mo · cash-flow A$3,060/mo
**Sub-scores** — Loc 18 · Growth 5 · Yield 13 · Liquidity 12 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Carlingford A$12,250/m² × 80 m² × tier 1.06 · yield 4.9% · growth 1.5% · exp 0.28
**Building** — Boutique 69 residences (1–3 bed), 12 Shirley Rd; from A$610K (1bd)/A$699K (2bd)/A$1.135M (3bd); Dickson & Rothschild; quiet back-street [c]
**Tagline** — EN: "Boutique 69-home address, almost complete" · VI: "Địa chỉ boutique 69 căn, sắp hoàn thiện"
**Statement** — Own a «Luxton» apartment in «Sydney».
**Desc** — Luxton is a tightly boutique 69-residence building on quiet Shirley Road, the most near-complete (Q4 2025) of the Carlingford apartment field, built by iCIRT-certified Decode for international developer Changfa Group. Its small scale and leafy back-street setting deliver a private, premium feel a short walk from shops, schools and the light rail.
**NAC Note** — Luxton's edge is timing and address quality — closest to finished of the Carlingford apartments, so settlement/rental risk is low, and Shirley Road is quieter and leafier than 88 Livie's or The Carling's Pennant Hills frontage. Changfa is a sizeable international developer and Decode's iCIRT certification underpins build quality, making the covenant strong for a boutique scheme. With only 69 homes it won't have Meriton's masterplan amenity, and a ~A$699K two-bed sits above the suburb median — a quality-over-cheapness pick.
**Pros** — Near-complete (Q4 2025, minimal construction risk); quiet leafy Shirley Rd; iCIRT Decode build; sizeable Changfa covenant; boutique 69-home low density.
**Cons** — Priced above the Carlingford median; limited amenity vs masterplanned; small 1-car allocation; light rail still ramping.
**Features** — Boutique 69-residence; Dickson & Rothschild architecture; quiet back-street; walk to shops/schools/light rail; 1–3 bed to A$1.135M.
**De-band** — Near-complete + quiet-street boutique premium → above-median price, low construction risk, single-car yield-stock profile.

### 15. The Carling — `the-carling-carlingford` · NAC 71/100
**Carlingford, Sydney** · apartment · mid (masterplan-scale) tier · Meriton, completion late 2027 (off-plan) [c]
**Financials** — Price **A$612,000** · A$11,769/m² (52 m²) · gross yield 4.9% · **IRR 5yr 4.8%** · CoC 3.3% · payback 20 yr · rent A$2,500/mo · expenses A$800/mo · cash-flow A$1,700/mo
**Sub-scores** — Loc 20 · Growth 5 · Yield 13 · Liquidity 9 · Quality 10 · Immigration 9 · Safe-haven 5
**Pricing basis** — Carlingford A$12,250/m² × 52 m² × tier 0.96 · yield 4.9% · growth 1.5% · exp 0.32
**Building** — Masterplan — 1,200+ apts across 7 towers, 4,700 m² parkland, community centre/library + civic plaza, ground retail, direct light rail; A$27.5M VPA, 263–281 Pennant Hills Rd [c]
**Tagline** — EN: "Meriton's seven-tower town centre with light rail" · VI: "Khu trung tâm 7 tháp của Meriton, kề light rail"
**Statement** — Own a «The Carling» apartment in «Sydney».
**Desc** — The Carling is Meriton's master-planned town centre on Pennant Hills Road — over 1,200 apartments across seven towers wrapped around 4,700 m² of new parkland, a community centre, library and civic plaza, with light rail at the door. The largest, most amenity-rich and most transport-connected scheme in the Carlingford cluster.
**NAC Note** — The scale-and-infrastructure play, carrying Meriton's gold-standard delivery covenant (80,000+ apartments built) — the strongest developer name across both clusters. The A$27.5M community-infrastructure commitment and direct light-rail integration are genuine value drivers a boutique block can't replicate, and the compact one-bed gives the lowest entry ticket in Carlingford. The risk is the obverse of scale: 1,200+ apartments and a 2027 completion mean a very large rental cohort lands at once, so yield holds best in the well-located stock.
**Pros** — Meriton (most bankable builder); light rail at the door; 4,700 m² parkland + community centre/library/plaza; lowest entry ticket (compact 1-beds); integrated retail/dining.
**Cons** — 1,200+ apartments floods the local rental pool; Pennant Hills Rd arterial; long horizon to late-2027; high-density, smaller average units.
**Features** — Direct light-rail access; on-site library + community centre; 4,700 m² parkland; ground retail/dining + civic plaza; seven-tower staged town centre.
**De-band** — Largest masterplan + light-rail → lowest entry (compact 1-bed), infrastructure-backed yield, megaproject supply caveat.

### 16. Homeland Residences — `homeland-residences-carlingford` · NAC 68/100
**Carlingford, Sydney** · townhouse · premium tier · UFN, completion 2026 (under construction) [c]
**Financials** — Price **A$1,600,000** · A$8,205/m² (195 m²) · gross yield 3.0% · **IRR 5yr 5.8%** · CoC 2.5% · payback 33 yr · rent A$4,000/mo · expenses A$720/mo · cash-flow A$3,280/mo
**Sub-scores** — Loc 17 · Growth 9 · Yield 8 · Liquidity 12 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Carlingford house-comp (band A$1.4–1.8M) · 195 m² · yield 3.0% · growth 3.3% · exp 0.18 (townhouse)
**Building** — 8 smart-home townhouses on a 1,675 m² site, 135 Adderton Rd; digital locks, smart-home provisioning, luxury finishes, sustainability [c]
**Tagline** — EN: "Eight smart-home townhouses, land you own" · VI: "Tám nhà phố thông minh, sở hữu cả đất"
**Statement** — Own a «Homeland Residences» townhouse in «Sydney».
**Desc** — Homeland Residences is a gated set of just eight smart-home townhouses on Adderton Road, each with digital locks and full smart-home provisioning across luxury finishes. As the only townhouse — and only land-component — product in the Carlingford cluster, it offers house-style space and a freehold land share no apartment here can match.
**NAC Note** — The structurally different Carlingford listing — townhouse, not apartment — so it competes on land ownership and family space rather than yield. With Carlingford houses at a A$2.2M median and 3.3% growth, an A$1.4–1.8M townhouse is the cheapest route into the suburb's land-backed capital-growth story, which historically outperforms the apartment segment. The trade-off is a low ~3% gross yield and a tiny eight-home scheme from a smaller developer (UFN). For a buyer prioritising land, school catchment and long-hold growth over rental return.
**Pros** — Freehold land component (only land product in the cluster); house-scale 4-bed space; full smart-home spec + digital locks; ultra-boutique 8-home setting; in the land-backed 3.3% house-growth segment.
**Cons** — Low ~3% gross yield vs ~4.9% for local apartments; small UFN covenant; highest absolute entry in the cluster; no shared resort amenity.
**Features** — Private multi-level townhouse layouts; smart digital door locks; home-automation provisioning; private garage + courtyard; sustainability-focused build.
**De-band** — Only townhouse → land-backed value, house-tier price, lower yield but higher capital-growth segment — a different asset class from its neighbours.

---
## SYDNEY — North Sydney

### 17. Aura — `aura-north-sydney` · NAC 76/100
**North Sydney, Sydney** · apartment · premium tier · Aqualand, **completed 2024** (limited remaining stock) [c]
**Financials** — Price **A$1,619,000** · A$17,598/m² (92 m²) · gross yield 3.4% · **IRR 5yr 5.7%** · CoC 2.2% · payback 29 yr · rent A$4,575/mo · expenses A$1,555/mo · cash-flow A$3,020/mo
**Sub-scores** — Loc 25 · Growth 9 · Yield 9 · Liquidity 11 · Quality 10 · Immigration 7 · Safe-haven 5
**Pricing basis** — North Sydney A$16,000/m² × 92 m² × tier 1.10 · yield 3.4% · growth 3.5% · exp 0.34
**Building** — 28-storey, 168 Walker St, 386 residences over retail podium; atop new Victoria Cross Metro, 7,450 m² plaza; Woods Bagot + Richards Stanisich [c]
**Tagline** — EN: "Live above Victoria Cross Metro." · VI: "Sống ngay trên ga Metro Victoria Cross."
**Statement** — Own a «Aura» apartment in «Sydney».
**Desc** — Aura is North Sydney's $1bn signature tower — 386 residences crowning the new Victoria Cross Metro entrance, with Woods Bagot interiors and gun-barrel views to the Harbour Bridge, Luna Park and Opera House. Move-in-ready completion removes off-plan timing risk, and an Etymon-curated ground-floor hospitality precinct puts dining downstairs.
**NAC Note** — Aura's edge over its boutique North Sydney peer is scale and transport integration — you are buying the air rights above a brand-new Metro station, the strongest infrastructure catalyst on the lower North Shore. The trade-off is that 386 lots mean less scarcity than a 29-unit address, so growth tracks the market rather than outrunning it on rarity. Completed stock lets a buyer inspect the apartment and rent immediately, but yields are thin (~3.4%) — a capital-preservation and lifestyle play, not cash-flow.
**Pros** — Built directly above Victoria Cross Metro; completed and inspectable; harbour-icon views upper floors; Woods Bagot pedigree; curated ground-floor dining.
**Cons** — Low gross yield (~3.4%); 386-lot building dilutes scarcity; premium $/m² entry; high strata for full-service amenity.
**Features** — Victoria Cross Metro integration; three designer colour schemes; wellness/amenity floors; 7,450 m² public plaza; Etymon retail and dining.
**De-band** — Metro-on-title premium + move-in-ready → top-of-suburb $/m² with North-Sydney-typical sub-3.5% yield (highest Location sub-score in the set).

### 18. Serendipity — `serendipity-north-sydney` · NAC 73/100
**North Sydney, Sydney** · apartment · premium (boutique) tier · Wu Investments (builder Novati), recently completed / final releases [c]
**Financials** — Price **A$1,497,000** · A$17,821/m² (84 m²) · gross yield 3.5% · **IRR 5yr 6.1%** · CoC 2.6% · payback 29 yr · rent A$4,375/mo · expenses A$1,140/mo · cash-flow A$3,235/mo
**Sub-scores** — Loc 21 · Growth 9 · Yield 9 · Liquidity 13 · Quality 9 · Immigration 7 · Safe-haven 5
**Pricing basis** — North Sydney A$16,500/m² × 84 m² × tier 1.08 · yield 3.5% · growth 3.5% · exp 0.26
**Building** — 4-storey boutique, 29 apts, 5–7 Doohat Ave cul-de-sac; Mackenzie Architects; basement parking + rooftop skyline terrace; ~10 min walk station/Metro [c]
**Tagline** — EN: "Twenty-nine homes on a quiet cul-de-sac." · VI: "Hai mươi chín căn trên con phố cụt yên tĩnh."
**Statement** — Own a «Serendipity» apartment in «Sydney».
**Desc** — Serendipity is a four-storey, 29-residence boutique address tucked on Doohat Avenue, a leafy cul-de-sac minutes from North Sydney's core. Designed by Mackenzie Architects with a shared rooftop terrace framing the city skyline, it trades tower scale for low-density privacy and a tightly held owner profile.
**NAC Note** — Where Aura sells transport scale, Serendipity sells scarcity — 29 lots in a four-storey building defends value through downturns and attracts owner-occupiers rather than transient renters. The cul-de-sac position means quiet and a stronger community feel, but it's a 10-minute walk to the Metro rather than on top of it, so the transport story is good, not exceptional. Yields sit in the thin ~3.5% North Sydney band, so the case rests on land-scarcity capital growth and resale liquidity into the owner-occupier pool.
**Pros** — Only 29 residences (genuine scarcity); quiet cul-de-sac; communal rooftop skyline terrace; full-concrete boutique build; walkable to Metro, station and Greenwood Plaza.
**Cons** — No pool/gym amenity at this scale; 10-min walk to Metro (vs on-title); small building = fewer comparable sales; sub-3.5% yield.
**Features** — 29-apt boutique scale; Mackenzie Architects design; rooftop communal terrace; basement secure parking; premium fixtures.
**De-band** — Boutique scarcity supports a slight $/m² premium over Aura on the same yield, on a smaller footprint (highest Liquidity sub-score).

## SYDNEY — Parramatta & Harris Park

### 19. 180 George — `180-george-parramatta` · NAC 76/100
**Parramatta, Sydney** · apartment · premium (top of Parramatta) tier · Meriton, **completed 2023** (Charles & George) [c]
**Financials** — Price **A$1,113,000** · A$12,648/m² (88 m²) · gross yield 5.0% · **IRR 5yr 6.3%** · CoC 3.3% · payback 20 yr · rent A$4,650/mo · expenses A$1,580/mo · cash-flow A$3,070/mo
**Sub-scores** — Loc 22 · Growth 8 · Yield 13 · Liquidity 10 · Quality 10 · Immigration 8 · Safe-haven 5
**Pricing basis** — Parramatta A$11,500/m² × 88 m² × tier 1.10 · yield 5.0% · growth 3.0% · exp 0.34
**Building** — Twin towers N 67lvl/213m (tallest residential in Parramatta), S 59lvl; 553 residences + 346-room hotel; aquatic centre, ~1,200 m² podium gardens, ground Woolworths, childcare; Woods Bagot [c]
**Tagline** — EN: "Parramatta's tallest address, move-in ready." · VI: "Toà nhà cao nhất Parramatta, sẵn sàng dọn vào."
**Statement** — Own a «180 George» apartment in «Sydney».
**Desc** — 180 George is Meriton's landmark Charles & George complex — the tallest residential building in Parramatta, with 553 residences over a five-star-style amenity podium, a 346-room hotel, ground-floor Woolworths and riverfront cafés. As a completed Meriton build, buyers get full-concrete construction, inspectable stock and immediate rent.
**NAC Note** — The prestige, completed option among the four Parramatta lots — Meriton's brand, tallest-tower status and a hotel/retail podium give it the strongest owner-occupier and short-stay rental appeal. The flip side is the top Parramatta $/m² and the building's size (553 lots + hotel) means heavy turnover and rental competition. With completion done there's no construction risk and the ~5% yield is live today — the headline advantage over the off-plan Parramatta projects.
**Pros** — Tallest residential tower in Parramatta (icon status); completed and rentable now; Meriton full-concrete build; resort amenity + on-site Woolworths/childcare; hotel supports short-stay.
**Cons** — Highest $/m² of the four; 553 units + hotel = competition; large-building strata; growth into a soft 2026 market.
**Features** — Indoor aquatic centre + gym; ~1,200 m² podium gardens + pool; co-working hub; ground Woolworths + riverfront dining; 346-room hotel + 75-place childcare.
**De-band** — Completed prestige tower → highest Parramatta $/m², ~5% live yield with no off-plan wait.

### 20. Cosmopolitan — `cosmopolitan-parramatta` · NAC 73/100
**Parramatta (East/parkside), Sydney** · apartment · mid tier · Deicorp, off-plan (DA approved, under construction) [c]
**Financials** — Price **A$810,000** · A$10,800/m² (75 m²) · gross yield 5.0% · **IRR 5yr 6.4%** · CoC 3.4% · payback 20 yr · rent A$3,375/mo · expenses A$1,080/mo · cash-flow A$2,295/mo
**Sub-scores** — Loc 21 · Growth 8 · Yield 13 · Liquidity 10 · Quality 8 · Immigration 8 · Safe-haven 5
**Pricing basis** — Parramatta A$10,800/m² × 75 m² × tier 1.00 · yield 5.0% · growth 3.0% · exp 0.32
**Building** — $560M twin 45-level towers, 34 Hassall St; ~600 residences over a retail village; Turner Studio; "Gully Forest" podiums; beside new Parramatta Light Rail. List: 1BR A$590K / 2BR A$910K / 3BR A$1.33M [c]
**Tagline** — EN: "Parkside towers by the new Light Rail." · VI: "Tháp đôi cạnh công viên, kề Light Rail mới."
**Statement** — Own a «Cosmopolitan» apartment in «Sydney».
**Desc** — Cosmopolitan by Deicorp is a $560M twin-tower community on Parramatta's park-side eastern edge, with ~600 residences above a retail village and a three-podium "Gully Forest" garden sanctuary by Turner Studio. Its position beside the new Parramatta Light Rail stop puts the CBD, Westmead and Carlingford on a single line.
**NAC Note** — The green-credentials, transit-adjacent value play of the Parramatta four — parkside aspect, a distinctive landscaped podium and Light Rail at the door, at a list price (2-bed from A$910K) that undercuts the completed 180 George. The catch is off-the-plan: construction and settlement-valuation risk, and years to income, against a soft 2026 Parramatta backdrop. Deicorp's high-volume delivery de-risks the build but means abundant comparable stock at completion.
**Pros** — Beside the new Parramatta Light Rail; park-side outlook; distinctive "Gully Forest" podiums; transparent list pricing from A$590K; established Deicorp record.
**Cons** — Off-the-plan (multi-year wait + valuation risk); ~600 units adds completion-era supply; eastern-CBD edge (not Church St core); soft 2026 growth.
**Features** — Twin 45-level Turner Studio towers; "Gully Forest" three-podium garden; ground-floor retail village; outdoor kitchen + pavilions; Light Rail connectivity.
**De-band** — Lowest $/m² of the four (off-plan list pricing), smaller 75 m² 2-bed, ~5% yield priced at completion.

### 21. One City Square — `one-city-square-parramatta` · NAC 73/100
**Parramatta (Church St core), Sydney** · apartment · premium tier · JQZ, off-plan, est completion mid-2028 [c]
**Financials** — Price **A$595,000** · A$11,442/m² (52 m²) · gross yield 5.0% · **IRR 5yr 6.4%** · CoC 3.4% · payback 20 yr · rent A$2,475/mo · expenses A$790/mo · cash-flow A$1,685/mo
**Sub-scores** — Loc 22 · Growth 8 · Yield 13 · Liquidity 9 · Quality 8 · Immigration 8 · Safe-haven 5
**Pricing basis** — Parramatta A$11,000/m² × 52 m² × tier 1.04 · yield 5.0% · growth 3.0% · exp 0.32
**Building** — ~900 residences + commercial + dining piazza + high-end hotel, 57–83 Church St; landscaped public open space; prime CBD spine [c]
**Tagline** — EN: "A whole city square on Church Street." · VI: "Cả một quảng trường ngay trên phố Church."
**Statement** — Own a «One City Square» apartment in «Sydney».
**Desc** — One City Square is JQZ's ~900-residence, mixed-use precinct on Parramatta's premier Church Street, wrapping luxury apartments, commercial space, a hotel and a dining piazza around landscaped public open space. Targeted for mid-2028, it is the most central and largest-format of the cluster's projects.
**NAC Note** — Its distinction is location and placemaking — Church Street is Parramatta's highest-profile retail spine, and a self-contained "city square" with hotel and piazza is a stronger long-run destination than a standalone tower. That central premium pushes $/m² toward the top of the off-plan group, and with ~900 residences plus mid-2028 completion, the buyer takes the longest off-plan timeline and the largest single hit of new rental supply in the cluster. The entry format here is smaller (1-bed) investor stock.
**Pros** — Prime Church Street core; integrated hotel + dining piazza placemaking; landscaped public open space; flagship long-term draw; central walk to Metro/Light Rail + CBD jobs.
**Cons** — Longest off-plan wait (mid-2028); ~900 residences = heavy completion-era supply; central premium lifts $/m²; investor-skewed small-format stock.
**Features** — ~900 residences mixed-use; on-site high-end hotel; dining/retail piazza; landscaped public square; integrated commercial floors.
**De-band** — Central Church St premium $/m² on the smallest 52 m² 1-bed, longest 2028 off-plan runway.

### 22. Paramount on Parkes — `paramount-on-parkes-parramatta` · NAC 74/100
**Harris Park (Parramatta CBD fringe), Sydney** · apartment · mid tier · ALAND, **completed** (move-in ready) [c]
**Financials** — Price **A$840,000** · A$10,500/m² (80 m²) · gross yield 5.2% · **IRR 5yr 6.5%** · CoC 3.5% · payback 19 yr · rent A$3,650/mo · expenses A$1,170/mo · cash-flow A$2,480/mo
**Sub-scores** — Loc 20 · Growth 8 · Yield 14 · Liquidity 11 · Quality 8 · Immigration 8 · Safe-haven 5
**Pricing basis** — Harris Park A$10,500/m² × 80 m² × tier 1.00 · yield 5.2% · growth 3.0% · exp 0.32
**Building** — $357M, 46-level, 14–20 Parkes St; 331 residences over 3,000+ m² commercial; podium pool + gardens, rooftop terrace, kids' play; walk Harris Park stn + CBD [c]
**Tagline** — EN: "Harris Park's 46-storey landmark, ready now." · VI: "Toà tháp 46 tầng Harris Park, sẵn sàng dọn vào."
**Statement** — Own a «Paramount On Parkes» apartment in «Sydney».
**Desc** — Paramount on Parkes is ALAND's $357M, 46-storey flagship on the Parramatta CBD fringe in Harris Park — 331 residences over 3,000+ m² of commercial space, with a podium pool, rooftop terrace and kids' play area. Now complete and move-in ready, it offers the cluster's keenest fringe-CBD entry with no construction wait.
**NAC Note** — The completed, lower-entry alternative to 180 George — same "buy a finished apartment and rent it today" certainty, but on the Harris Park fringe at a softer $/m² and a family-friendly amenity mix. At 331 lots it is mid-sized, so rental competition is lighter than 180 George or the off-plan towers, supporting the cluster's strongest yield (~5.2%). The trade-off is a Harris Park rather than core-CBD postcode, so prestige sits a notch below One City Square.
**Pros** — Completed and move-in ready; strongest yield of the cluster (~5.2%); mid-sized 331-lot (lighter competition); family amenity (pool, rooftop, kids' play); walk to Harris Park station + CBD.
**Cons** — Harris Park fringe address (sub-core prestige); 46-storey high-rise strata; growth into a soft 2026 market; less iconic than 180 George / One City Square.
**Features** — 46-level landmark tower; podium pool + gardens; rooftop terrace; children's play area; 3,000+ m² ground-floor commercial.
**De-band** — Completed fringe-CBD stock → lowest finished-building $/m² and the cluster's top ~5.2% live yield.

### 23. The Signature Collection — `the-signature-collection-pagewood-rivera` · NAC 68/100
**Pagewood / Eastgardens, Sydney** · townhouse · premium tier · Meriton (Rivera), **completed** (move-in) [c]
**Financials** — Price **A$1,950,000** · A$8,864/m² (220 m²) · gross yield 2.5% · **IRR 5yr 5.5%** · CoC 2.0% · payback 40 yr · rent A$4,050/mo · expenses A$730/mo · cash-flow A$3,320/mo
**Sub-scores** — Loc 18 · Growth 9 · Yield 6 · Liquidity 12 · Quality 10 · Immigration 8 · Safe-haven 5
**Pricing basis** — Pagewood house-comp (median ~A$2.65M; band A$1.6–2.2M) · 220 m² · yield 2.5% · growth 3.5% · exp 0.18 (townhouse)
**Building** — Boutique 14 four-bed (+study) townhouses in the Rivera/Pagewood Centro masterplan; full-concrete, internal European lift, 2.8 m ceilings; UDIA NSW 2025 Award; pedestrian link to Pagewood Centro [c]
**Tagline** — EN: "Fourteen house-scale townhomes by Meriton." · VI: "Mười bốn nhà phố quy mô biệt thự của Meriton."
**Statement** — Own a «The Signature Collection» townhouse in «Sydney».
**Desc** — The Signature Collection is Meriton's award-winning Rivera enclave at Pagewood — just 14 four-bedroom townhomes with house-like proportions, private internal European lifts, 2.8 m ceilings, Miele kitchens, heated bathroom floors and full-concrete construction. A direct pedestrian link to Pagewood Centro's Coles Local and dining, plus optional resort fitness access, frames it as a low-maintenance luxury-house alternative.
**NAC Note** — The cluster's outlier — it prices and behaves like a house, so the comparison is to Pagewood/Eastgardens detached homes (~A$2.6–3.1M), not the apartment market. The draw for a family buyer is family-formation and education-migration fit: four bedrooms, a private lift, a garden and a UDIA-awarded build of only 14 dwellings give scarcity and owner-occupier resale depth. The catch is yield — at house-level pricing the gross return is the lowest in the set (~2.5%), so it's a safe-haven, lifestyle and capital-hold asset, not income; east-side growth (Eastgardens +23.8% in a year) is real but volatile.
**Pros** — House-scale 4-bed with private internal lift; only 14 dwellings (UDIA-awarded scarcity); completed, move-in, full-concrete Meriton build; direct link to Pagewood Centro; private garden/terrace + optional resort fitness.
**Cons** — Lowest yield of the set (~2.5%); house-level capital outlay; membership fee for fitness amenity; volatile single-suburb growth.
**Features** — Private internal European lift; 2.8 m ceilings, timber floors, quartz benchtops; Miele appliances + integrated fridge; heated bathroom flooring; solar + rainwater irrigation.
**De-band** — Prices as a house (~A$1.95M, 220 m²) at ~2.5% yield — the only townhouse and only pure safe-haven hold in the Parramatta-area set.

---
## SYDNEY — West & South-West

### 24. 17 George St — `17-george-st-burwood` · NAC 76/100
**Burwood, Sydney** · apartment · mid tier · P&N Sleiman Group, off-plan/under-construction [c]
**Financials** — Price **A$1,071,000** · A$13,731/m² (78 m²) · gross yield 4.7% · **IRR 5yr 6.4%** · CoC 3.2% · payback 21 yr · rent A$4,200/mo · expenses A$1,345/mo · cash-flow A$2,855/mo
**Sub-scores** — Loc 22 · Growth 8 · Yield 12 · Liquidity 12 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Burwood A$13,200/m² × 78 m² × tier 1.04 · yield 4.7% · growth 3.2% · exp 0.32
**Building** — 33-storey "Building C" of the Victoria Place precinct, 53 apts (smallest/most exclusive of three towers); 200 m Burwood Stn, beside Westfield Burwood [c]
**Tagline** — EN: "Boutique 53-home tower beside Westfield Burwood" · VI: "Tháp boutique 53 căn cạnh Westfield Burwood"
**Statement** — Own a «17 George St» apartment in «Sydney».
**Desc** — 17 George St is the intimate 33-storey "Building C" of Burwood's Victoria Place precinct — just 53 residences, the lowest density of the three towers, delivering a quieter, more private address 200 m from Burwood Station. Buyers get the full precinct amenity (wellness centre, retail, cafés) without the flagship tower's scale.
**NAC Note** — Of the three Sleiman towers, 17 George St is the scarcity play — 53 units means far fewer competing resales and rentals on exit, which supports price-per-m² premiums over the larger Building A. Same precinct, builder and transport as Victoria Place, so location risk is identical; what differs is supply. The trade-off is fewer floorplate options and a modest entry-price premium per square metre. For an investor prioritising rental scarcity and resale liquidity over headline yield.
**Pros** — Lowest-density tower (only 53 units, scarcity on resale); 200 m to Burwood Station; full Victoria Place amenity without flagship density; beside Westfield Burwood; iCIRT-grade developer.
**Cons** — Per-m² entry likely highest of the three towers; fewer floorplate choices; Burwood unit growth soft (~3%/yr); off-plan staged-build risk.
**Features** — 33-storey landmark tower; wellness/medical centre in precinct; ground-floor retail and cafés; secure basement parking; 750 m to future Burwood North Metro.
**De-band** — Smallest unit count (53) → highest $/m² of the three Burwood towers, a scarcity premium not a yield premium.

### 25. Genesis — `genesis-burwood` · NAC 73/100
**Burwood, Sydney** · apartment · mid (low-rise) tier · Forte Group, off-plan / brand-new (display open) [c]
**Financials** — Price **A$713,000** · A$12,732/m² (56 m²) · gross yield 4.6% · **IRR 5yr 6.6%** · CoC 3.4% · payback 22 yr · rent A$2,725/mo · expenses A$710/mo · cash-flow A$2,015/mo
**Sub-scores** — Loc 19 · Growth 8 · Yield 12 · Liquidity 12 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Burwood A$13,000/m² × 56 m² × tier 0.98 · yield 4.6% · growth 3.2% · exp 0.26
**Building** — Boutique 6-level, 38 apts (low-rise, not a tower); 450 m Burwood Stn, school belt (PLC, MLC, Meriden, Santa Sabina); ground retail/café + health [c]
**Tagline** — EN: "Boutique six-level living in Burwood's school belt" · VI: "Sống boutique 6 tầng giữa khu trường học Burwood"
**Statement** — Own a «Genesis» apartment in «Sydney».
**Desc** — Genesis is a 38-apartment, six-level boutique building by Forte Group — a deliberate low-rise alternative to Burwood's high-rise towers, with curved forms and bespoke cabinetry. It sits in Burwood's prestige-school belt (PLC, MLC, Meriden, Santa Sabina) and a 15-minute commute to the CBD.
**NAC Note** — The only true low-rise in Burwood, and that's its thesis — six levels and 38 homes means no strata-heavy tower levies, lower density and a product for owner-occupier families rather than the investor crowd chasing high-rises. Proximity to four elite private schools is a durable rental driver for the education-migration buyer. The flip side: a 15-minute walk to the station (vs 200 m for the Sleiman towers) and no resort-scale amenity. Smaller floorplates make it the lowest absolute entry of the three Burwood listings.
**Pros** — Low-rise (lower strata + density); walk to PLC, MLC, Meriden, Santa Sabina; lowest absolute price of the three; bespoke cabinetry / premium finishes; ground-floor café + health.
**Cons** — 450 m to station (furthest of the three); no large-scale gym/pool; only 38 units (thin comparables); Burwood growth subdued (~3%/yr).
**Features** — Six-level boutique scale; curved façade; brushed-metal/chrome bathroom fixtures; school-belt location; ground-floor retail + medical.
**De-band** — Compact 1-bed stock → lowest dollar entry of the Burwood trio at suburb-typical $/m²; low-rise strata keeps holding costs down.

### 26. Victoria Place — `victoria-place-burwood` · NAC 75/100
**Burwood, Sydney** · apartment · premium tier · P&N Sleiman Group, off-plan/under-construction [c]
**Financials** — Price **A$1,270,000** · A$15,119/m² (84 m²) · gross yield 4.4% · **IRR 5yr 6.2%** · CoC 2.9% · payback 23 yr · rent A$4,650/mo · expenses A$1,580/mo · cash-flow A$3,070/mo
**Sub-scores** — Loc 22 · Growth 9 · Yield 11 · Liquidity 10 · Quality 9 · Immigration 9 · Safe-haven 5
**Pricing basis** — Burwood A$13,500/m² × 84 m² × tier 1.12 · yield 4.4% · growth 3.3% · exp 0.34
**Building** — Flagship "Building A" up to 40 storeys, 252 apts incl skyhomes + penthouses, 28–34 Victoria St; 200 m Burwood Stn, 750 m future Burwood North Metro [c]
**Tagline** — EN: "Burwood's 40-storey flagship with skyhomes and metro" · VI: "Tháp biểu tượng 40 tầng với skyhome và metro"
**Statement** — Own a «Victoria Place» apartment in «Sydney».
**Desc** — Victoria Place is the centrepiece "Building A" of Burwood's largest urban precinct — a 40-storey landmark of 252 residences rising to skyhomes and penthouses with skyline views. It anchors a mixed-use precinct of wellness centre, retail and workspaces, 200 m from Burwood Station and 750 m from the future Burwood North Metro.
**NAC Note** — The premium, full-amenity end of the Burwood cluster — the tallest tower, the broadest config range (1–4 bed, skyhomes, penthouses) and the best views, justifying the highest $/m² of the three. Its scale is double-edged: 252 units means deep amenity and choice, but also the most competing rental/resale stock inside one building, which can cap yield and slow exit pricing versus the boutique 17 George St. The 750 m future-metro catalyst is the strongest medium-term growth lever in the cluster.
**Pros** — Tallest tower / best skyline views in the cluster; widest config range incl. skyhomes & penthouses; full precinct amenity; 200 m station + 750 m future metro upside; flagship of an award-track precinct.
**Cons** — Highest $/m² of the three; 252 units = most internal competition; lowest gross yield in the cluster; largest staged build (longest completion window).
**Features** — 40-storey landmark tower; skyhomes & penthouse tiers; wellness & medical centre; future Burwood North Metro 750 m; retail + commercial workspaces.
**De-band** — Largest floorplates + view premium → the cluster's highest $/m² and lowest yield; the metro catalyst gives the strongest growth case.

### 27. Stage 2 - Auburn — `stage-2-auburn-auburn-square` · NAC 76/100
**Auburn, Sydney** · apartment · entry tier · Tian An LFD (builder Binah, Gold-Star iCIRT), off-plan, completing Q4 2027 [c]
**Financials** — Price **A$763,000** · A$10,597/m² (72 m²) · gross yield 6.0% · **IRR 5yr 8.6%** · CoC 4.1% · payback 17 yr · rent A$3,825/mo · expenses A$1,225/mo · cash-flow A$2,600/mo
**Sub-scores** — Loc 20 · Growth 11 · Yield 15 · Liquidity 10 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Auburn A$10,600/m² × 72 m² × tier 1.00 · yield 6.0% · growth 4.5% · exp 0.32
**Building** — "North Village" — 2nd stage of Auburn Square, 264 residences (1/2/3-bed), on-site Coles + café, communal garden + BBQ; 10-yr Latent Defect Insurance; from A$525K [c]
**Tagline** — EN: "Coles-anchored North Village, Auburn's 6% yield play" · VI: "North Village có Coles, lợi suất 6% tại Auburn"
**Statement** — Own a «Stage 2 - Auburn» apartment in «Sydney».
**Desc** — Stage 2 "North Village" is the second release of the award-winning Auburn Square masterplan by Tian An — 264 Rothelowman-designed residences over a new on-site Coles and café, with a communal garden and BBQ deck. From A$525,000 with a Gold-Star iCIRT builder and 10-year Latent Defect Insurance, it's one of the strongest entry-yield plays in the set.
**NAC Note** — Auburn carries the highest unit rental yield in the western cluster (~6%), and Stage 2's on-site Coles is a rare, tangible amenity that supports both rents and owner-occupier demand — supermarket-anchored buildings rent and resell faster. The Gold-Star iCIRT builder and 10-year defect insurance directly de-risk the off-the-plan concern. The catch is timeline: Q4 2027 completion is the longest hold-to-settlement, exposing the buyer to construction-cost and rate movement. Auburn's working-migrant tenant base delivers yield, not the school-belt growth story of Burwood.
**Pros** — Highest gross yield in the cluster (~6%); on-site Coles + café; Gold-Star iCIRT builder + 10-yr defect insurance; award-winning established precinct; low entry from A$525K.
**Cons** — Q4 2027 (longest settlement wait); 264 units adds local supply; Auburn carries lower prestige than Burwood; limited capital-growth narrative.
**Features** — Ground-floor Coles supermarket; Rothelowman architecture; communal garden & BBQ; 10-year Latent Defect Insurance; 1/2/3-bed range.
**De-band** — Top-of-cluster ~6% yield at the lowest Burwood-area $/m²; the on-site Coles is a yield-stabiliser none of the peers have (highest Yield sub-score, 15).

### 28. Spring Square — `spring-square-bankstown` · NAC 78/100
**Bankstown, Sydney** · apartment · mid tier · Poly Australia (international), off-plan [c]
**Financials** — Price **A$712,000** · A$9,493/m² (75 m²) · gross yield 5.5% · **IRR 5yr 8.6%** · CoC 3.8% · payback 18 yr · rent A$3,275/mo · expenses A$1,050/mo · cash-flow A$2,225/mo
**Sub-scores** — Loc 22 · Growth 12 · Yield 14 · Liquidity 9 · Quality 9 · Immigration 7 · Safe-haven 5
**Pricing basis** — Bankstown A$9,500/m² × 75 m² × tier 1.00 · yield 5.5% · growth 4.8% · exp 0.32
**Building** — 516 apts across 5 towers on a 46,400 m² former-RSL site; retail, 684 m² health, childcare, 714-space basement; Scott Carver; 300–400 m Bankstown Stn + new Sydney Metro [c]
**Tagline** — EN: "Poly's five-tower metro precinct in Bankstown CBD" · VI: "Khu phức hợp 5 tháp của Poly cạnh metro Bankstown"
**Statement** — Own a «Spring Square» apartment in «Sydney».
**Desc** — Spring Square is Poly Australia's 516-apartment, five-tower precinct on a 4.6-hectare former-RSL site in Bankstown's northern CBD core — Scott Carver-designed, over retail, a 684 m² health facility and a childcare centre. It sits 300 m from the new Sydney Metro and 400 m from Bankstown Station.
**NAC Note** — Spring Square's edge is the new Sydney Metro literally 300 m away — Bankstown's conversion to the Metro line is a structural growth catalyst that pushed local unit growth to ~9% last year. Poly is a deep-pocketed international developer, lowering completion risk on a build this large. That scale is also the warning: 516 units across five towers is one of the biggest single supply injections in the cluster, so expect a wide rental and resale field within the precinct. A balanced growth-plus-yield play, not a scarcity one.
**Pros** — 300 m to new Sydney Metro (structural growth catalyst); major international developer (Poly) lowers build risk; full precinct (retail, 684 m² health, childcare); Bankstown CBD-core; strong recent unit growth (~9%).
**Cons** — 516 units = largest supply injection in the cluster; heavy internal competition; first-home stamp-duty exemption excludes FIRB buyers; five-tower staged delivery.
**Features** — Five-tower master-planned precinct; 684 m² on-site health facility; on-site childcare; 714-space basement; Scott Carver tonal-brick architecture.
**De-band** — Metro-driven ~9% recent growth + mid-5% yield at a low $/m² — the cluster's best blended growth-and-income profile, offset by the highest single-precinct supply.

### 29. The Luminar Residences — `the-luminar-residences-lakemba` · NAC 78/100
**Lakemba, Sydney** · apartment · entry tier · TQM Group (25 yrs), DWA Architects, off-plan / launching [c]
**Financials** — Price **A$502,000** · A$9,296/m² (54 m²) · gross yield 5.3% · **IRR 5yr 9.8%** · CoC 3.8% · payback 19 yr · rent A$2,225/mo · expenses A$625/mo · cash-flow A$1,600/mo
**Sub-scores** — Loc 20 · Growth 14 · Yield 14 · Liquidity 12 · Quality 7 · Immigration 6 · Safe-haven 5
**Pricing basis** — Lakemba A$9,300/m² × 54 m² × tier 1.00 · yield 5.3% · growth 6.0% · exp 0.28
**Building** — 70 studio/1/2-bed apts, 901–923 Canterbury Rd; pet-friendly; ducted A/C, ILVE appliances; walk Lakemba/Belmore stn + 2025 Sydney Metro upgrade [c]
**Tagline** — EN: "Boutique 70-home Lakemba living on the Metro upgrade" · VI: "70 căn boutique tại Lakemba đón nâng cấp Metro"
**Statement** — Own a «The Luminar Residences» apartment in «Sydney».
**Desc** — The Luminar Residences is a boutique 70-apartment building by TQM Group on Canterbury Road, Lakemba — studio, 1- and 2-bed homes with ducted air-conditioning, premium ILVE kitchens and Fisher & Paykel laundries, pet-friendly. It sits a short walk from Lakemba and Belmore stations, both set to benefit from the 2025 Sydney Metro City & Southwest upgrade.
**NAC Note** — Lakemba posted the strongest unit capital growth in the western cluster — roughly 14% in the last twelve months — riding the Sydney Metro Southwest upgrade, making Luminar the pure capital-growth bet rather than a yield bet. At 70 units it is genuinely boutique, so exit-supply risk is low. The honest caveats: Lakemba is the lowest-prestige address with a value-tenant profile, that 14% growth spike is recent and may not annualise, and the compact studio/1-bed stock caps the owner-occupier resale pool. Premium ILVE / Fisher & Paykel finishes in an entry suburb is a smart differentiator.
**Pros** — Strongest recent unit growth in the cluster (~14% last 12 mo); boutique 70 units (low resale-supply risk); Sydney Metro Southwest catalyst; premium ILVE + Fisher & Paykel finishes; pet-friendly with parking + storage.
**Cons** — Lowest-prestige address in the cluster; the 14% spike may not sustain; studio/1-bed skew limits owner-occupier resale; value-tenant base caps rent ceiling.
**Features** — Boutique 70-residence scale; ducted, zoned air-conditioning; premium ILVE kitchen; Fisher & Paykel laundry + storage; pet-friendly building.
**De-band** — Cluster-leading ~14% recent growth at the lowest entry ticket (A$502K, lowest in the whole AU set) — a Metro-upgrade growth play; boutique scale keeps exit-supply tight.

### 30. 2nd Avenue — `2nd-avenue-blacktown` · NAC 74/100
**Blacktown, Sydney** · apartment · entry tier · Landmark Group (25+ yrs, $4bn+), off-plan, completing Dec 2026 [c]
**Financials** — Price **A$490,000** · A$8,448/m² (58 m²) · gross yield 5.3% · **IRR 5yr 7.2%** · CoC 3.7% · payback 19 yr · rent A$2,175/mo · expenses A$650/mo · cash-flow A$1,525/mo
**Sub-scores** — Loc 21 · Growth 9 · Yield 14 · Liquidity 10 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Blacktown A$8,800/m² × 58 m² × tier 0.96 · yield 5.3% · growth 3.5% · exp 0.30
**Building** — 20-level, 275 1&2-bed apts over retail, DKO Architects; rooftop terrace/BBQ/lawn, 6 lifts, basement; 10-yr extended structural warranty; 6-min walk Blacktown Stn (express CBD + Parramatta) [c]
**Tagline** — EN: "20-storey Blacktown tower, six minutes to the station" · VI: "Tháp 20 tầng Blacktown, 6 phút tới ga tàu"
**Statement** — Own a «2nd Avenue» apartment in «Sydney».
**Desc** — 2nd Avenue is a 20-level, 275-apartment DKO tower above retail in central Blacktown by Landmark Group — 1- and 2-bed homes with study options, European kitchens and a rooftop terrace with BBQ and lawn. It is a six-minute walk to Blacktown Station, with express services to both the Sydney CBD and Parramatta.
**NAC Note** — The lowest $/m² and lowest entry ticket of the western cluster — Blacktown is the affordability floor, and its dual express rail to both the CBD and Parramatta is a genuine tenant draw given Parramatta's rise as Sydney's second CBD. Landmark's $4bn record and a 10-year structural warranty (beating NSW's six-year minimum) de-risk the December 2026 completion. The reality check: Blacktown unit growth is modest (~2–3.5%/yr), 275 units is a sizeable supply add, and the suburb is furthest from inner Sydney. A cash-flow-and-affordability entry, not a growth story.
**Pros** — Lowest entry price & $/m² in the cluster; 6-min walk to Blacktown Station (express CBD + Parramatta); Landmark $4bn record + 10-yr structural warranty; near-term Dec 2026 completion; rooftop terrace, BBQ & lawn.
**Cons** — Weakest capital-growth narrative (~2–3.5%/yr); 275 units = significant local supply; furthest suburb from inner Sydney; lowest-prestige address of the seven.
**Features** — 20-storey landmark tower; DKO Architects design; rooftop terrace with BBQ & lawn; European kitchen + stone benchtops; 1- & 2-bed with study options.
**De-band** — Lowest $/m² and shortest completion timeline of the cluster — an affordability/cash-flow entry, with Parramatta express rail the only real growth lever.

---
## SYDNEY — South & Inner-West

### 31. Arncliffe Central — `arncliffe-central-arncliffe` · NAC 72/100
**Arncliffe, Sydney** · apartment · entry tier · Billbergia + Evolve Housing (mixed-tenure), off-plan; first homes ~2027, full ~2028 [c]
**Financials** — Price **A$783,000** · A$10,440/m² (75 m²) · gross yield 5.2% · **IRR 5yr 6.1%** · CoC 3.6% · payback 19 yr · rent A$3,400/mo · expenses A$1,020/mo · cash-flow A$2,380/mo
**Sub-scores** — Loc 22 · Growth 7 · Yield 14 · Liquidity 9 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Arncliffe A$11,100/m² × 75 m² × tier 0.94 · yield 5.2% · growth 2.5% · exp 0.30
**Building** — ~744 residences across 4 buildings, 26–42 Eden St; 4,000 m² park, supermarket, library, childcare; adjacent Arncliffe Stn; ~75% social/affordable [c]
**Tagline** — EN: "A new town centre beside Arncliffe Station" · VI: "Trung tâm thị trấn mới cạnh ga Arncliffe"
**Statement** — Own a «Arncliffe Central» apartment in «Sydney».
**Desc** — Arncliffe Central is the suburb's largest urban-renewal project — four buildings wrapped around a 4,000 m² park, with a full-line supermarket, library and childcare built in. Market-sale apartments sit beside Evolve Housing's affordable homes, a block from Arncliffe Station and 15 minutes by rail to the CBD or airport.
**NAC Note** — A buy-the-precinct, not buy-the-building, play: scale and on-site amenity (park, supermarket, transport) underpin long-run rentability and resale liquidity a boutique block can't match. The flip side is the high social/affordable share — owners share the address with a large public-housing cohort, which can cap the premium versus a private-only tower. Strong 5%+ Arncliffe yields and a 2027–28 settlement window give an income-led entry near the airport line, for yield-and-hold investors comfortable with a staged, multi-building completion.
**Pros** — Direct walk to Arncliffe Station (15-min rail to CBD/airport); on-site 4,000 m² park + supermarket + library + childcare; Billbergia's 35-yr record; suburb yields among Sydney's strongest (5.2%); staged delivery (pick early-phase pricing).
**Cons** — ~75% social/affordable tenure may cap resale premium; large supply pipeline softens near-term growth; long build-out to 2028; under-airport-flightpath noise.
**Features** — 4,000 m² public park; full-line supermarket + retail/F&B; community centre & library; childcare; station-adjacent.
**De-band** — Largest scale of the Arncliffe pair (744 units) → lowest entry $/m² and strongest yield, but affordable-housing weighting tempers growth.

### 32. Duncan House — `duncan-house-arncliffe` · NAC 73/100
**Arncliffe, Sydney** · apartment · mid tier · Vortex Property Group, completed / final-release (~15 of 43 remain) [c]
**Financials** — Price **A$785,000** · A$11,544/m² (68 m²) · gross yield 5.2% · **IRR 5yr 6.3%** · CoC 3.8% · payback 19 yr · rent A$3,400/mo · expenses A$885/mo · cash-flow A$2,515/mo
**Sub-scores** — Loc 20 · Growth 7 · Yield 14 · Liquidity 12 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Arncliffe A$11,100/m² × 68 m² × tier 1.04 · yield 5.2% · growth 2.5% · exp 0.26
**Building** — 7-storey boutique, 43 apts (1/2/3-bed), 35–39 Duncan St; Place Studio; EV charging, underground car-wash, communal garden; airport-to-CBD views. Priced 1bd A$660K / 2bd A$995K / 3bd A$1.45M [c]
**Tagline** — EN: "Boutique 43-home address above the airport line" · VI: "Toà căn hộ boutique 43 căn trên tuyến sân bay"
**Statement** — Own a «Duncan House» apartment in «Sydney».
**Desc** — Duncan House is a low-density, seven-storey alternative to Arncliffe's mega-precincts — just 43 architect-designed apartments by Place Studio, with EV charging, an underground car-wash bay and a communal garden. Already over half sold and effectively complete, it offers immediate-settlement stock with airport-to-CBD outlooks.
**NAC Note** — The boutique counterweight to Arncliffe Central: a small, private-only owner body usually defends value better and simplifies strata, and being finished removes off-plan completion risk entirely. The trade-off is no large-scale on-site amenity and a higher $/m² than the master-planned neighbour. With final-release stock, buyers lose first-mover pricing but gain certainty of product and rent-from-day-one income at the suburb's 5%+ yields. For investors who prioritise a clean, fully-private boutique block over precinct scale.
**Pros** — Completed (zero off-plan/settlement risk); boutique 43-home, fully private strata; EV charging + underground car-wash; Place Studio design, airport/CBD views; same strong yields, smaller body corporate.
**Cons** — Limited remaining stock (~15 units) restricts choice; higher $/m² than the master-planned neighbour; no large retail/park amenity; airport-flightpath noise.
**Features** — EV charging bays; underground car-wash bay; communal garden + BBQ; seven-storey low-density form; airport-to-CBD elevated views.
**De-band** — Boutique + finished → $/m² above Arncliffe Central; smaller 68 m² footprint and immediate income differentiate the cash-flow profile.

### 33. Ashbury Apartment — `ashbury-apartment-ashbury` · NAC 67/100
**Ashbury, Sydney** · apartment · mid tier · Ashbury Terraces development (SJB architects), completed / move-in [c]
**Financials** — Price **A$1,073,000** · A$12,193/m² (88 m²) · gross yield 2.8% · **IRR 5yr 6.5%** · CoC 2.0% · payback 36 yr · rent A$2,500/mo · expenses A$750/mo · cash-flow A$1,750/mo
**Sub-scores** — Loc 16 · Growth 11 · Yield 7 · Liquidity 11 · Quality 9 · Immigration 8 · Safe-haven 5
**Pricing basis** — Ashbury A$11,500/m² × 88 m² × tier 1.06 · yield 2.8% · growth 4.5% (apt; house backdrop 8–10%) · exp 0.30
**Building** — Park-side apartment collection (1–4 bed + penthouses) beside W.H. Wagener Oval, 165–171 Milton St; heated pool, gym, communal dining; terracotta brick + arched windows [c]
**Tagline** — EN: "Park-side apartments in heritage Inner-West Ashbury" · VI: "Căn hộ ven công viên giữa Ashbury cổ kính"
**Statement** — Own a «Ashbury Apartment» apartment in «Sydney».
**Desc** — The apartment half of Ashbury Terraces is a small, low-rise collection overlooking W.H. Wagener Oval, with a heated pool, gym and communal dining in award-winning gardens. SJB's terracotta-brick, arched-window design lands these flats in one of the Inner-West's tightest, leafiest, blue-chip pockets.
**NAC Note** — Ashbury is a capital-growth suburb, not a yield suburb — houses run double-digit growth while unit yields sit near 2.8%, so this apartment is a hold-for-appreciation and lifestyle entry into a tightly-held postcode, not an income engine. The resort-style amenity and oval frontage justify a premium over generic Inner-West stock, but expect thin rental returns and rely on land-scarce capital growth. It's the lower-ticket way into Ashbury versus the A$2M+ terraces next door.
**Pros** — Blue-chip, tightly-held Inner-West postcode; direct W.H. Wagener Oval / parkland frontage; resort amenity (heated pool, gym, communal dining); SJB architecture; far lower entry than Ashbury houses/terraces.
**Cons** — Low rental yield (~2.8%, growth play); premium $/m² for the suburb; limited rail (bus / Canterbury & Croydon stations); small unit market = thinner resale liquidity.
**Features** — Heated swimming pool; communal dining + gym; 360 Degrees landscaped gardens; oval / park frontage; terracotta-brick arched-window architecture.
**De-band** — Lowest yield of the cluster (~2.8%) but the highest growth backdrop; priced as an apartment (~A$1.07M) where its Terrace sibling prices as a A$2M+ house.

### 34. Ashbury Terrace — `ashbury-terrace-ashbury-terrace` · NAC 73/100
**Ashbury, Sydney** · townhouse · premium tier · Ashbury Terraces (SJB architects), completed / move-in [c]
**Financials** — Price **A$2,290,000** · A$13,879/m² (165 m²) · gross yield 2.1% · **IRR 5yr 9.7%** · CoC 1.7% · payback 48 yr · rent A$4,000/mo · expenses A$720/mo · cash-flow A$3,280/mo
**Sub-scores** — Loc 16 · Growth 18 · Yield 5 · Liquidity 12 · Quality 9 · Immigration 8 · Safe-haven 5
**Pricing basis** — Ashbury house-comp (band A$2.19–2.705M) · 165 m² · yield 2.1% · growth 8.0% (house) · exp 0.18 (townhouse)
**Building** — Multi-level terrace homes beside Wagener Oval, 165–171 Milton St; skylights, private rooftop, large courtyard, 2-car; A$2.19M–A$2.705M [c]
**Tagline** — EN: "House-scale terraces with private rooftops, Ashbury" · VI: "Nhà phố tầng mái riêng giữa Ashbury"
**Statement** — Own a «Ashbury Terrace» townhouse in «Sydney».
**Desc** — These are full house-substitutes — three-bedroom terraces over multiple levels with skylights, large courtyards, private rooftop spaces and two-car parking, all by SJB. From A$2.19M, they trade as freestanding-home alternatives in Ashbury's land-scarce blue-chip enclave, with access to the scheme's pool and gardens.
**NAC Note** — Unlike the apartment sibling, the Terrace buys land and house-like utility, so it tracks Ashbury's strong house-price growth (8–10%/yr) rather than soft unit yields — the appreciation case is materially stronger, but the entry ticket (A$2.19M+) and ~2% yield make it a capital-preservation/family-hold asset, not cash-flow. FIRB-eligible new stock with rooftop and courtyard appeals to migration-track families wanting space without a freestanding-home price in the same street. Holding costs (land tax, low rent cover) are the watch-item.
**Pros** — House-like 3-level living with private rooftop + courtyard; two-car parking (rare for new stock); tracks Ashbury's 8–10% house-price growth; SJB design, new-build FIRB-eligible; blue-chip, land-scarce Inner-West address.
**Cons** — High A$2.19M+ entry ticket; ~2% gross yield (negative cash-flow likely); higher land-tax / holding costs for foreign owners; limited rail, bus-dependent.
**Features** — Private rooftop terrace; large ground-floor courtyard; multi-level layout with skylights; two-car parking; shared resort pool + gardens.
**De-band** — Prices and behaves as a house (A$2.29M, ~2.1% yield, house-grade growth) — the highest ticket and lowest yield in the AU set, while its same-address apartment sibling sits at ~half the price. _(Highest payback in set, 48 yr — a pure growth/land hold; the IRR is growth-led, not income-led.)_

### 35. Caringbah Greens — `caringbah-greens-caringbah` · NAC 66/100
**Caringbah, Sydney** · apartment · mid (penthouses premium) tier · Landmark Group, off-plan [c]
**Financials** — Price **A$1,023,000** · A$12,476/m² (82 m²) · gross yield 3.9% · **IRR 5yr 4.7%** · CoC 2.7% · payback 26 yr · rent A$3,325/mo · expenses A$1,065/mo · cash-flow A$2,260/mo
**Sub-scores** — Loc 19 · Growth 6 · Yield 10 · Liquidity 11 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Caringbah A$12,000/m² × 82 m² × tier 1.04 · yield 3.9% · growth 2.0% · exp 0.32
**Building** — 3 DKO coastal buildings over a redeveloped bowling club, 101–109 Willarong Rd; retains two bowling greens + new club bistro; 1–3 bed + 3–4 bed penthouses; 650 m Caringbah Stn; 10-yr structural warranty [c]
**Tagline** — EN: "Coastal apartments overlooking two bowling greens, Caringbah" · VI: "Căn hộ ven biển nhìn ra hai sân bowling Caringbah"
**Statement** — Own a «Caringbah Greens» apartment in «Sydney».
**Desc** — Caringbah Greens reimagines a bowling club into three coastal-toned DKO buildings wrapped around two retained greens, a central playground and a new club bistro. One- to three-bed residences (plus rare 3–4 bed penthouses) sit 650 m from Caringbah Station, minutes from Cronulla Beach and Westfield Miranda, backed by a 10-year structural warranty.
**NAC Note** — The drawcard is the green outlook and genuine resident amenity (bistro, bowling greens, playground) on a Sutherland Shire site that rarely releases new apartment stock — scarcity supports resale. Caringbah unit yields (~3.9%) and recently flat growth make this a balanced lifestyle-and-yield hold rather than a growth standout. The 10-year structural warranty (beating NSW's six-year minimum) is real comfort for offshore buyers who can't easily chase defects.
**Pros** — Retained bowling greens + bistro (rare resident amenity); 650 m walk to Caringbah Station; minutes to Cronulla Beach & Westfield Miranda; 10-yr structural warranty; DKO coastal design, established Landmark.
**Cons** — Flat recent Caringbah growth; yield (~3.9%) below the Arncliffe/Hurstville pair; penthouse tier pushes top-end pricing up; competing Willarong Rd projects add supply.
**Features** — Two bowling greens + central playground; on-site club bistro; 10-yr structural warranty; European appliances + stone benchtops; coastal-inspired DKO architecture.
**De-band** — Amenity-led Shire pricing (~A$12.5K/m², ~3.9% yield) — lower yield than the southern-line pair, justified by lifestyle + longer warranty; penthouse release widens its band versus Live.

### 36. Live — `live-caringbah` · NAC 66/100
**Caringbah, Sydney** · apartment · mid tier · Landmark Group & Live, off-plan [c]
**Financials** — Price **A$1,117,000** · A$11,758/m² (95 m²) · gross yield 3.9% · **IRR 5yr 5.3%** · CoC 2.8% · payback 26 yr · rent A$3,625/mo · expenses A$1,015/mo · cash-flow A$2,610/mo
**Sub-scores** — Loc 18 · Growth 7 · Yield 10 · Liquidity 11 · Quality 8 · Immigration 7 · Safe-haven 5
**Pricing basis** — Caringbah A$12,000/m² × 95 m² × tier 0.98 · yield 3.9% · growth 2.5% · exp 0.28
**Building** — Low-maintenance project, 10–14 Hinkler Ave; 3-bed residences from A$798,475; minutes Cronulla Beach, Westfield Miranda, Caringbah Stn (storey/unit count not published) [c]
**Tagline** — EN: "Three-bedroom Shire living from under A$800k" · VI: "Căn hộ ba phòng ngủ dưới 800 nghìn AUD"
**Statement** — Own a «Live» apartment in «Sydney».
**Desc** — Live is a smaller Landmark project on Hinkler Avenue pitched squarely at three-bedroom buyers, from A$798,475 — keen pricing for a full 3-bed in the Shire. It targets low-maintenance, family-scale apartment living minutes from Caringbah Station, Westfield Miranda and Cronulla Beach.
**NAC Note** — Live's edge over its Caringbah sibling is value-per-bedroom: a 3-bed under A$800K is unusually sharp for the Shire and broadens the tenant pool to families, supporting occupancy on the suburb's ~3.9% yields. It lacks the marquee bowling-green amenity of Caringbah Greens, so the case rests on floorplan size and price. Public detail (storeys, unit count, completion) is thin, so confirm the build program and strata before committing.
**Pros** — Sharp 3-bed entry (~A$798K) for the Shire; family-scale floorplans broaden tenant demand; minutes to station, Miranda and Cronulla Beach; established Landmark delivery; low-maintenance lock-up-and-leave format.
**Cons** — No headline resident amenity vs Caringbah Greens; limited published project detail; same flat recent Caringbah growth; smaller project = less marketing/resale profile.
**Features** — Three-bedroom-focused mix; two-car parking at entry tier; minutes to Caringbah Station; walk to Westfield Miranda; low-maintenance design.
**De-band** — Largest representative unit (95 m², 3-bed) at the lowest dollar entry of the Caringbah pair — best price-per-m² and per-bedroom, trading amenity for space and value.

### 37. Beyond — `beyond-hurstville` · NAC 73/100
**Hurstville, Sydney** · apartment · mid tier · _developer/completion to confirm_ `[e]`
**Financials** — Price **A$799,000** · A$10,797/m² (74 m²) · gross yield 4.9% · **IRR 5yr 6.3%** · CoC 3.3% · payback 20 yr · rent A$3,275/mo · expenses A$1,050/mo · cash-flow A$2,225/mo
**Sub-scores** — Loc 22 · Growth 8 · Yield 13 · Liquidity 10 · Quality 7 · Immigration 8 · Safe-haven 5
**Pricing basis** — Hurstville A$10,800/m² × 74 m² × tier 1.00 · yield 4.9% · growth 3.0% · exp 0.32 *(suburb-derived — research worker did not return a project block; confirm building facts)*
**Building** — High-rise apartment address at the Hurstville rail-and-retail hub; express trains to CBD; dense commercial core; near St George Hospital `[e]`
**Tagline** — EN: "High-rise value on the Hurstville rail hub" · VI: "Căn hộ cao tầng giá tốt cạnh ga Hurstville"
**Statement** — Own a «Beyond» apartment in «Sydney».
**Desc** — Beyond is a high-rise apartment address in Hurstville — one of southern Sydney's busiest rail-and-retail hubs, with express trains to the CBD and a dense commercial core at its base. AUD-denominated and FIRB-eligible, it offers a value entry with one of the cluster's stronger gross yields.
**NAC Note** — Hurstville is a transport-and-retail powerhouse on the T8/Illawarra line with express CBD access and a deep, year-round tenant base from its commercial core and proximity to St George Hospital — which underpins Beyond's ~4.9% gross yield, among the better in the southern-Sydney set. Capital growth is steady rather than spectacular (~3%/yr) and the suburb carries heavy apartment supply, so unit selection (aspect, floor) matters on resale. An income-led hold for a yield-focused buyer who values transport depth over prestige. **Building-level facts (developer, storeys, completion) need confirmation before publishing.**
**Pros** — Hurstville express-rail CBD hub; deep retail + commercial tenant base; near St George Hospital; ~4.9% gross yield (among the cluster's better); AUD freehold, FIRB-eligible.
**Cons** — Heavy apartment supply in Hurstville; ~3%/yr modest growth; busy/dense urban setting; **project-level detail unconfirmed**.
**Features** — Walk to Hurstville Station; ground/near retail; high-rise city aspect upper floors; secure basement parking; close to St George Hospital.
**De-band** — Transport-hub yield play — stronger gross yield (~4.9%) than the Ashbury/Caringbah lifestyle stock, at a mid southern-Sydney $/m². **⚠ ESTIMATED — re-run research to confirm the development.**

### 38. Sanctuary (Willow Skyhome Collection) — `sanctuary-willow` · NAC 66/100
**Wentworth Point, Sydney** · apartment · premium tier · Sekisui House Australia, off-plan; Willow move-in ~mid-2026, full masterplan ~2030 [c]
**Financials** — Price **A$1,074,000** · A$11,548/m² (93 m²) · gross yield 5.0% · **IRR 5yr 4.3%** · CoC 3.3% · payback 20 yr · rent A$4,475/mo · expenses A$1,520/mo · cash-flow A$2,955/mo
**Sub-scores** — Loc 18 · Growth 4 · Yield 13 · Liquidity 10 · Quality 10 · Immigration 6 · Safe-haven 5
**Pricing basis** — Wentworth Point A$10,500/m² × 93 m² × tier 1.10 · yield 5.0% · growth 1.0% · exp 0.34
**Building** — Willow skyhome collection in the ~A$2bn, 9.4 ha, ~2,000-home Sanctuary waterfront masterplan, 11 Wattlebird Rd; cabana pool + "Revive" indoor pool/gym; 2-min walk Olympic Park ferry; car space + storage cage each. Willow range A$810K → A$4.5M [c]
**Tagline** — EN: "Waterside skyhomes in a A$2bn masterplanned village" · VI: "Căn hộ ven sông trong khu đô thị 2 tỷ AUD"
**Statement** — Own a «Sanctuary» apartment in «Sydney».
**Desc** — Willow is the skyhome collection inside Sekisui House's Sanctuary — a A$2bn, ~2,000-home waterfront masterplan on the Parramatta River at Wentworth Point. Apartments average a generous 93 m², come with car space and storage cage, and share a cabana pool plus the "Revive" indoor pool and gym, two minutes' walk from the Olympic Park ferry.
**NAC Note** — Sanctuary's appeal is institutional-grade developer pedigree (Sekisui House) and masterplan scale — deep amenity, ferry access and a recognised brand that resonates with offshore buyers seeking certainty. The caution is supply: Wentworth Point has absorbed heavy apartment volume, keeping recent growth flat even as yields stay healthy (~5%), so this is an income-and-hold proposition leaning on a long masterplan maturation to 2030. Generous 93 m² floorplates and included parking/storage differentiate it from thinner investor stock nearby.
**Pros** — Sekisui House (blue-chip, well-capitalised developer); generous ~93 m² average floorplates; car space + storage cage included; cabana pool + "Revive" indoor pool & gym; 2-min walk to Olympic Park ferry + riverside parkland.
**Cons** — Wentworth Point supply glut suppressing capital growth; premium brand pricing (A$810K–A$4.5M); long build-out to 2030 (staged settlement); ferry/bus-dependent, no heavy rail.
**Features** — Waterfront Parramatta River setting; resident cabana pool; "Revive" indoor pool + gym; included car space & storage cage; skyhome-level views.
**De-band** — Largest average internal size in the cluster (93 m²) + a premium brand band; healthy ~5% yield offset by the weakest recent growth (local oversupply → lowest Growth sub-score, 4).
> **⚠ Data fix:** the live HTML labels the district "Willow" with a placeholder geo near Carlingford (lat −33.7304 / lng 151.0455). Correct suburb is **Wentworth Point, NSW 2127**; re-point geo to ~−33.825 / 151.073 when patching Notion/HTML.

---
## MELBOURNE — CBD & Inner

### 39. 640 — `640-melbourne-cbd` · NAC 72/100
**Melbourne CBD (640 Bourke St), Melbourne** · apartment · premium tier · Far East Consortium, off-plan, launched 2025 [c]
**Financials** — Price **A$658,000** · A$12,654/m² (52 m²) · gross yield 4.7% · **IRR 5yr 4.6%** · CoC 3.1% · payback 21 yr · rent A$2,575/mo · expenses A$875/mo · cash-flow A$1,700/mo
**Sub-scores** — Loc 22 · Growth 5 · Yield 12 · Liquidity 10 · Quality 10 · Immigration 8 · Safe-haven 5
**Pricing basis** — Melbourne CBD A$11,500/m² × 52 m² × tier 1.10 · yield 4.7% · growth 1.5% · exp 0.34
**Building** — 68-level Rothelowman glass tower wrapping the heritage Eliza Tinsley Building; ~600 larger-format residences; 3,000 m²+ amenity (Roman pool, whisky lounges, Eliza House); 1bd from A$640K [c]
**Tagline** — EN: "Heritage Eliza Tinsley address, glass-tower living" · VI: "Di sản Eliza Tinsley trong tháp kính 68 tầng"
**Statement** — Own a «640» apartment in «Melbourne».
**Desc** — 640 Bourke Street is Far East Consortium's 14th Melbourne tower — a 68-level Rothelowman glass form rising from the restored heritage Eliza Tinsley Building. With only ~600 larger-format residences and 3,000 m²+ of amenity (Roman pool, whisky lounges, private dining), it is pitched at owner-occupiers rather than the dense investor-stock that defines most CBD high-rise.
**NAC Note** — The more "collector-grade" of the two FEC CBD towers — bigger floorplates, lower unit count and a genuine heritage anchor give it a resale story pure-glass neighbours lack. The trade-off is a premium entry on a CBD yield that still sits ~4.7%, so the case is owner-occupier prestige and education proximity, not cash flow. Stamp-duty off-the-plan concessions sweeten the early-stage buy; FEC's 13-building Melbourne record de-risks delivery.
**Pros** — Heritage Eliza Tinsley facade (rare CBD scarcity); ~600 larger owner-occupier floorplates; 3,000 m²+ amenity incl. Roman pool & whisky lounge; FEC's 14th Melbourne tower; Bourke St mall doorstep, Free Tram Zone.
**Cons** — Premium $/m² for a ~4.7% CBD yield; off-plan multi-year settlement; broad CBD high-rise oversupply caps near-term growth; FIRB + foreign-buyer surcharge.
**Features** — Restored heritage Eliza Tinsley integration; Rothelowman 68-level glass tower; Roman pool + gym + whisky lounges; Eliza House dining + art-therapy; new laneway and plaza.
**De-band** — Highest $/m² and largest unit of the two CBD towers — priced as a scarce heritage owner-occupier asset, not investor stock.

### 40. West Side Place — `west-side-place-melbourne-cbd` · NAC 72/100
**Melbourne CBD (250 Spencer St), Melbourne** · apartment · mid tier · Far East Consortium, A$2B four-tower megaproject, largely **completed** [c]
**Financials** — Price **A$486,000** · A$10,800/m² (45 m²) · gross yield 5.2% · **IRR 5yr 4.9%** · CoC 3.4% · payback 19 yr · rent A$2,100/mo · expenses A$715/mo · cash-flow A$1,385/mo
**Sub-scores** — Loc 22 · Growth 5 · Yield 14 · Liquidity 9 · Quality 9 · Immigration 8 · Safe-haven 5
**Pricing basis** — Melbourne CBD A$10,800/m² × 45 m² × tier 1.00 · yield 5.2% · growth 1.5% · exp 0.34
**Building** — Melbourne's largest residential dev — 2,895 apts across 4 towers (Tower A 81lvl/268.7m); Ritz-Carlton + Dorsett hotels; Cottee Parker / Kerry Phelan [c]
**Tagline** — EN: "Ritz-Carlton-anchored living above Spencer Street" · VI: "Sống trên Spencer St dưới thương hiệu Ritz-Carlton"
**Statement** — Own a «West Side Place» apartment in «Melbourne».
**Desc** — West Side Place is Melbourne's largest-ever residential complex — four Far East Consortium towers (2,895 apartments) at 250 Spencer Street, anchored by the Ritz-Carlton and Dorsett hotels. Because it is built and occupied, buyers get a turn-key, hotel-serviced CBD address with immediate rental income rather than an off-plan wait.
**NAC Note** — The liquidity-and-yield counterweight to 640: completed, hotel-branded, and deep in tradeable stock. The five-star Ritz-Carlton halo lifts the address, but with ~2,895 units the resale pool is large and price discovery is competitive — a leasing machine, not a scarcity play. Compact one-bedders rent hard to students and professionals at the upper end of the CBD yield band (~5.2%). Buy on aspect and tower (A vs B vs C), since the building competes against itself on resale.
**Pros** — Completed and occupied (no off-plan risk); Ritz-Carlton + Dorsett services on-site; compact plates achieve top-of-band CBD yield; direct Southern Cross / Spencer St transit; mature body corporate.
**Cons** — 2,895 units = heavy internal resale competition; compact floorplates limit owner-occupier appeal; hotel-precinct strata fees run higher; FIRB + surcharge.
**Features** — Ritz-Carlton five-star hotel in-complex; Dorsett 316-room hotel; 81-level Tower A; Cottee Parker / Kerry Phelan; landscaped leisure deck + retail.
**De-band** — Lowest $/m² and smallest unit of the two CBD towers, highest yield — a completed, high-volume, hotel-branded leasing asset vs 640's heritage scarcity. (Lowest price in the whole AU set after Luminar/Blacktown — A$486K.)

### 41. Aura (Melbourne Square Stage 3) — `aura-melbourne-square-stage-3-southbank` · NAC 71/100
**Southbank (7 Hoff Blvd), Melbourne** · apartment · premium tier · OSK Property, off-plan — construction starts late 2026 [c]
**Financials** — Price **A$612,000** · A$12,750/m² (48 m²) · gross yield 4.7% · **IRR 5yr 5.6%** · CoC 3.1% · payback 21 yr · rent A$2,400/mo · expenses A$815/mo · cash-flow A$1,585/mo
**Sub-scores** — Loc 21 · Growth 7 · Yield 12 · Liquidity 10 · Quality 9 · Immigration 7 · Safe-haven 5
**Pricing basis** — Southbank A$12,500/m² × 48 m² × tier 1.02 · yield 4.7% · growth 2.5% · exp 0.34
**Building** — A$800M 67-storey COX tower, 673 apts, 4th of 6 in the A$3.5B Melbourne Square precinct; "vertical wellness" Aura Club (L7): pool, cold plunge, spa, golf sim, yoga; A$554K–A$2.87M [c]
**Tagline** — EN: "Southbank's vertical-wellness tower" · VI: "Tháp wellness thẳng đứng tại Southbank"
**Statement** — Own a «Aura ( Melbourne Square Stage 3)» apartment in «Melbourne».
**Desc** — Aura is the fourth tower in OSK Property's A$3.5B Melbourne Square precinct — a 67-storey COX Architecture landmark of 673 apartments built around a "vertical wellness ecosystem." The level-7 Aura Club packs a pool, cold plunge, spa, golf simulator and yoga studios, positioning it as Southbank's amenity-led owner-occupier and lifestyle-rental play.
**NAC Note** — Aura's edge is precinct maturity — buyers plug into an already-functioning Melbourne Square (park, supermarket, prior towers) rather than a single isolated build. The wellness amenity is genuinely differentiated and supports premium Southbank rents, but at 673 units in a six-tower master-plan the long-run supply pipeline is the risk to watch. Entry from A$554K keeps it accessible. Construction only starts late 2026, so this is the longest-dated hold in the Melbourne set.
**Pros** — Plugs into the established A$3.5B Melbourne Square precinct; L7 "Aura Club" (pool, cold plunge, spa, golf sim); COX landmark design; wide A$554K–A$2.87M range; Southbank arts/river, free-tram edge.
**Cons** — Construction only begins late 2026 (longest wait); 673 units atop a 6-tower pipeline; Southbank yields modest (~4.7%); FIRB + surcharge.
**Features** — Level-7 Aura Club vertical-wellness hub; golf simulator, music rooms, library, WFH spaces; heated pool, cold plunge, spa, Pilates/yoga; within Melbourne Square park + retail; 67-storey COX tower.
**De-band** — Lowest absolute entry of the Melbourne inner set on a mid-band Southbank $/m², but the longest-dated (late-2026 construction start).

### 42. Park Modern — `park-modern-south-melbourne` · NAC 72/100
**South Melbourne (11–27 Dorcas St), Melbourne** · apartment · mid-to-premium tier · Time & Place, off-plan/under-construction [c]
**Financials** — Price **A$1,011,000** · A$14,042/m² (72 m²) · gross yield 4.0% · **IRR 5yr 6.4%** · CoC 2.9% · payback 25 yr · rent A$3,375/mo · expenses A$945/mo · cash-flow A$2,430/mo
**Sub-scores** — Loc 20 · Growth 9 · Yield 10 · Liquidity 12 · Quality 9 · Immigration 7 · Safe-haven 5
**Pricing basis** — South Melbourne A$13,500/m² × 72 m² × tier 1.04 · yield 4.0% · growth 3.5% · exp 0.28
**Building** — 18 floors, 237 residences; natural-toned finishes; arts-precinct proximity; display L6, 332 St Kilda Rd [c]
**Tagline** — EN: "Boutique design living by Albert Park" · VI: "Sống thiết kế boutique cạnh Albert Park"
**Statement** — Own a «Park Modern» apartment in «Melbourne».
**Desc** — Park Modern is a boutique 18-storey, 237-residence building by Time & Place at 11–27 Dorcas Street, South Melbourne — natural-toned, design-led interiors a short walk from Albert Park, the arts precinct and the South Melbourne Market. Its modest scale and owner-occupier finish set it apart from the high-volume towers nearby.
**NAC Note** — The human-scale option of the South Melbourne pair — 18 floors and 237 homes versus R.Evolution's 400-plus-unit tower next door. That boutique footprint plus Time & Place's design pedigree (The Queensbridge) target owner-occupiers and downsizers, usually meaning steadier resale and lower body-corporate than amenity-heavy towers. South Melbourne's blue-chip, supply-constrained setting supports ~3–4% growth, though yields sit below CBD given the higher price base. The thinner amenity stack is the honest trade for the lower strata cost.
**Pros** — Boutique 237-home scale (limited internal competition); Time & Place design pedigree; walk to Albert Park, arts precinct & South Melbourne Market; blue-chip 3205 postcode; lower body-corp than amenity-heavy towers.
**Cons** — Lighter amenity vs tower competitors; lower yield (~4.0%) on a high price base; off-plan settlement timeline; FIRB + surcharge.
**Features** — Natural-toned, design-led interiors; 18-storey boutique mid-rise (237 homes); steps to South Melbourne Market & arts; walk to Albert Park & the lake; Time & Place quality control.
**De-band** — Highest $/m² of the two South Melbourne buildings but a smaller mid-size 2-bed plate and a lower yield — a boutique, lower-strata owner-occupier asset.

### 43. R.Evolution — `r-evolution-south-melbourne` · NAC 70/100
**South Melbourne (1 Horizon Way), Melbourne** · apartment · premium tier · R.Corporation, off-plan — move-in from June 2026 [c]
**Financials** — Price **A$1,324,000** · A$14,085/m² (94 m²) · gross yield 3.7% · **IRR 5yr 5.9%** · CoC 2.4% · payback 27 yr · rent A$4,075/mo · expenses A$1,385/mo · cash-flow A$2,690/mo
**Sub-scores** — Loc 20 · Growth 9 · Yield 10 · Liquidity 10 · Quality 9 · Immigration 7 · Safe-haven 5
**Pricing basis** — South Melbourne A$12,800/m² × 94 m² × tier 1.10 · yield 3.7% · growth 3.5% · exp 0.34
**Building** — ~423 units (apts, townhouses, sub-penthouses); homes "beyond 90 m²"; 30+ amenities — 300 m rooftop running track, 1+ acre Paul Bangay gardens, heated pool, wine-tasting room [c]
**Tagline** — EN: "Rooftop-running-track resort living, ready 2026" · VI: "Sống resort với đường chạy trên mái, sẵn 2026"
**Statement** — Own a «R.Evolution» apartment in «Melbourne».
**Desc** — R.Evolution is R.Corporation's second South Melbourne tower (sister to R.Iconic), a ~423-home landmark at One Horizon Way with move-in from June 2026. Every home spans beyond 90 m² with floor-to-ceiling glass, wrapped in 30-plus amenities — a 300 m rooftop running track, an acre of Paul Bangay gardens, a heated pool and a wine-tasting room.
**NAC Note** — The amenity-maximalist counterpart to boutique Park Modern: bigger homes (90 m²+), a near-term June-2026 settlement, and a resort-grade facility list that commands a rental premium and broad owner-occupier appeal. The flip side is a larger ~423-unit pool and the higher strata fees that 30+ amenities and a Paul Bangay garden inevitably carry. Large floorplates also dilute the headline yield (~3.7%). R.Corporation's R.Iconic record and an almost-complete build materially de-risk delivery.
**Pros** — Near-term move-in (June 2026, minimal build risk); 30+ resort amenities incl. 300 m rooftop running track; acre of Paul Bangay gardens + heated pool; large 90 m²+ floorplates, floor-to-ceiling glass; four-suburb convergence (South/Port Melbourne, Albert Park, Southbank).
**Cons** — Higher strata fees from extensive amenity & gardens; large plates dilute yield to ~3.7%; ~423 units (sizeable resale pool); FIRB + surcharge.
**Features** — 300 m rooftop running track with bay & skyline views; 1-acre Paul Bangay gardens; "Chairman's Club" workspace + wine-tasting room; heated pool + 30 amenities; homes beyond 90 m².
**De-band** — Largest unit size in the Melbourne set (94 m²) and lowest yield — an amenity-rich, near-complete large-format asset, the inverse of boutique Park Modern.

### 44. Yarra Park — `yarra-park-alphington` · NAC 69/100
**Alphington (YarraBend), Melbourne** · townhouse · premium tier · Glenvill (YarraBend masterplan), off-plan/staged [c]
**Financials** — Price **A$1,300,000** · A$7,879/m² (165 m²) · gross yield 3.1% · **IRR 5yr 6.0%** · CoC 2.5% · payback 32 yr · rent A$3,350/mo · expenses A$605/mo · cash-flow A$2,745/mo
**Sub-scores** — Loc 18 · Growth 9 · Yield 8 · Liquidity 12 · Quality 9 · Immigration 8 · Safe-haven 5
**Pricing basis** — Alphington townhouse-comp (median ~A$1.30M) · 165 m² · yield 3.1% · growth 3.5% · exp 0.18 (townhouse)
**Building** — Rothelowman townhouses within the 1,500+-residence YarraBend community on the former Alphington Paper Mill site, 6.5 km CBD; sustainability built-in; steps to Alphington Village, Yarra trails & station [c]
**Tagline** — EN: "Sustainable Rothelowman townhomes by the Yarra" · VI: "Nhà phố Rothelowman bền vững bên sông Yarra"
**Statement** — Own a «Yarra Park» townhouse in «Melbourne».
**Desc** — Yarra Park is a collection of Rothelowman-designed townhouses inside Glenvill's YarraBend community on the historic Alphington Paper Mill site, 6.5 km from the CBD. Sustainability is built in — rainwater tanks, energy-efficient appliances — with Alphington Village, the Artisan Food District and Yarra River trails at the door.
**NAC Note** — The only low-rise, land-backed asset in the Melbourne inner set — a family townhouse with its own title rather than a strata apartment, which changes the whole investment character. Owner-occupier downsizers and families drive Alphington demand, so resale leans on the home itself rather than a competitive tower pool, and the green/riverside YarraBend setting is a genuine lifestyle moat. The trade is the lowest yield (~3.1% on a A$1.3M base) — a capital-growth and liability-diversification hold, not income. Glenvill's delivered YarraBend stages de-risk the masterplan.
**Pros** — Land-backed townhouse title (not strata); inside the established YarraBend green riverside precinct; Rothelowman architecture + built-in sustainability; family/downsizer demand (resale not tower-dependent); Alphington Station + Yarra trails + Artisan Food District.
**Cons** — Lowest yield in the Melbourne inner set (~3.1%); high absolute entry (A$1.3M); 6.5 km from CBD (not walk-to-work); FIRB caps foreign buyers to new dwellings + surcharge.
**Features** — Rothelowman townhomes, generous indoor/outdoor; rainwater tanks + energy-efficient appliances; YarraBend Health & Wellness Centre; Yarra River trails + parklands; walk to Alphington Village & Artisan Food District.
**De-band** — Only townhouse/land-backed asset in the Melbourne inner set — a low-yield (~3.1%) capital-growth family hold, priced in A$ total not per-m² apartment terms.

## MELBOURNE — East (Box Hill / Blackburn townhouses)

### 45. 14 Asquith Street — `14-asquith-street-box-hill-south` · NAC 67/100
**Box Hill South, Melbourne** · townhouse · entry tier · boutique developer (not public), off-plan / small infill `[e]`
**Financials** — Price **A$1,250,000** · A$9,470/m² (132 m²) · gross yield 2.8% · **IRR 5yr 5.8%** · CoC 2.3% · payback 36 yr · rent A$2,925/mo · expenses A$525/mo · cash-flow A$2,400/mo
**Sub-scores** — Loc 20 · Growth 9 · Yield 7 · Liquidity 10 · Quality 6 · Immigration 10 · Safe-haven 5
**Pricing basis** — Box Hill South house-comp (median A$1.5M) · 132 m² · yield 2.8% · growth 3.5% · exp 0.18 (townhouse) *(no public project — see note)*
**Building** — No public townhouse project at the address; lot holds a ~496 m² house (last sold ~A$1.3M). Realistically a small 3–6 dwelling, 2-storey infill `[e]`
**Tagline** — EN: "Box Hill South's entry-priced townhouse address" · VI: "Nhà phố giá vào hợp lý tại Box Hill South"
**Statement** — Own a «14 Asquith Street» townhouse in «Melbourne».
**Desc** — A compact, entry-tier townhouse in the quiet Asquith Street pocket of Box Hill South — the most affordable way into the Box Hill High zone and the Box Hill transport-and-education hub. Walkable to the Box Hill Central interchange, Institute and Hospital. **Pricing and dwelling count are NAC estimates pending a confirmed developer release.**
**NAC Note** — Of the three Box Hill South townhouses, this is the entry play — smallest footprint, lowest ticket, and the thinnest verified data, since no formal project has been publicly released at the address. The location case is identical to its neighbours (Box Hill High zone, interchange, Chinese-Australian commercial core), but the unconfirmed development status means higher execution and timeline risk. **Treat the price as a placeholder until a developer price list lands.** A capital-growth and education-access hold, not a yield play at ~2.8% gross.
**Pros** — Lowest entry ticket in the Box Hill South trio; inside the prized Box Hill High zone; walk to Box Hill train/tram/bus interchange & Box Hill Central; smaller footprint (easier to let to students); AUD freehold, FIRB-eligible.
**Cons** — **No publicly confirmed development (highest execution/timeline risk of the trio)**; sub-3% yield, flat recent growth; small land share limits land-value upside; pricing is a NAC estimate.
**Features** — 3-bed / 2.5-bath / 2-car layout; private courtyard; 2-storey design; walk-to-station; Box Hill High catchment.
**De-band** — Lowest price + smallest internal size (132 m²) in the trio — the deliberate entry-tier anchor. **⚠ ESTIMATED — confirm developer/price before publishing.**

### 46. 325 Station St — `325-station-st-box-hill-south` · NAC 73/100
**Box Hill South, Melbourne** · townhouse · mid tier · "Author Townhomes" (builder Cobild, architect Jesse Ant), near-complete (~2023–24) [c]
**Financials** — Price **A$1,420,000** · A$8,606/m² (165 m²) · gross yield 3.0% · **IRR 5yr 6.0%** · CoC 2.5% · payback 33 yr · rent A$3,550/mo · expenses A$640/mo · cash-flow A$2,910/mo
**Sub-scores** — Loc 21 · Growth 9 · Yield 8 · Liquidity 11 · Quality 9 · Immigration 10 · Safe-haven 5
**Pricing basis** — Box Hill South house-comp (4-beds from A$1.38M) · 165 m² · yield 3.0% · growth 3.5% · exp 0.18 (townhouse)
**Building** — 53 townhouses, 2-storey, 20+ floorplan layouts (former ~12,627 m² lot), 325–335 Station St; natural-material palette [c]
**Tagline** — EN: "Box Hill South's 53-home townhouse community" · VI: "Cộng đồng nhà phố 53 căn tại Box Hill South"
**Statement** — Own a «325 Station St» townhouse in «Melbourne».
**Desc** — Author is a 53-residence townhome community on Station Street with 20+ floorplans across 3- and 4-bedroom homes, built by Cobild to a Jesse Ant Architects design with a natural-material palette. As a scaled, completed-or-near-completed project it offers immediate occupancy and a deep range of layouts, walkable to the Box Hill interchange, Institute and Box Hill Central.
**NAC Note** — The institutional-scale option of the three — a 53-home, professionally built and marketed community with verified pricing, real floorplans and near-term settlement, which de-risks it versus the boutique Asquith and Birdwood sites. The trade-off is scale: 53 near-identical homes mean more internal competition on resale and rent, so floorplan, aspect and corner positions matter. Pricing from ~A$1.38M for a 4-bed is well-evidenced. The liquidity-and-certainty pick of the cluster, with capital growth (not yield) the return engine.
**Pros** — Confirmed pricing & real floorplans (lowest execution risk of the trio); largest layout range (20+ plans, 3 & 4-bed); built by established Cobild / Jesse Ant; near-complete (immediate occupancy/letting); Box Hill High zone + walk to interchange.
**Cons** — 53 near-identical homes = high internal resale/rental competition; sub-3.3% yield; less land-value upside per dwelling than a 3-home site; owners-corp fees on a large scheme.
**Features** — 4-bed / 3-bath / 2-car representative layout; 20+ floorplan choices; landscaped communal setting; natural-material facades; Box Hill Central / interchange walkability.
**De-band** — Largest project (53 homes) and largest representative unit (~165 m²), with the only fully developer-confirmed price (~A$1.38M from) of the trio.

### 47. 34 Birdwood St — `34-birdwood-st-box-hill-south` · NAC 71/100
**Box Hill South, Melbourne** · townhouse · premium tier · XEN Architecture; DA approved, completion late 2025 [c]
**Financials** — Price **A$1,950,000** · A$9,286/m² (210 m²) · gross yield 2.6% · **IRR 5yr 5.6%** · CoC 2.1% · payback 38 yr · rent A$4,225/mo · expenses A$760/mo · cash-flow A$3,465/mo
**Sub-scores** — Loc 20 · Growth 9 · Yield 7 · Liquidity 11 · Quality 9 · Immigration 10 · Safe-haven 5
**Pricing basis** — Box Hill South house-comp (A$1.85M–A$2.15M) · 210 m² · yield 2.6% · growth 3.5% · exp 0.18 (townhouse)
**Building** — 3 townhouses only on a ~930 m² site, 2-storey, customisable floorplans — a boutique exclusive development [c]
**Tagline** — EN: "Three exclusive 4-bed Box Hill townhouses" · VI: "Ba căn nhà phố 4 phòng ngủ độc bản Box Hill"
**Statement** — Own a «34 Birdwood St» townhouse in «Melbourne».
**Desc** — A boutique enclave of just three large 4-bedroom townhouses on a ~930 m² Birdwood Street site, designed by XEN Architecture with 3–3.5 bathrooms, double parking and customisable floorplans. Scarcity and generous internal space (from A$1.85M) target owner-occupier families over investors. Box Hill High zone, walk to Box Hill Central and the hospital.
**NAC Note** — The premium, scarcity-driven end of the cluster — only three homes, the largest footprints, and a price (A$1.85M–A$2.15M) well above the Asquith and Author products. That exclusivity supports resale differentiation and an owner-occupier buyer pool, but it also pushes gross yield toward ~2.6%, so the thesis is almost entirely capital growth and land share, not cash flow. DA-approved with a late-2025 completion gives reasonable delivery confidence. The family owner-occupier / land-banking pick, and the most capital-intensive of the three.
**Pros** — Only 3 homes (genuine scarcity & resale differentiation); largest internal size + biggest land share of the trio; customisable floorplans (owner-occupier appeal); DA approved, near-term late-2025; Box Hill High zone, walk to Central & hospital.
**Cons** — Highest ticket (A$1.85M–A$2.15M) → lowest gross yield (~2.6%); tiny scheme = no on-site amenity, niche resale pool; most capital-intensive of the cluster; FIRB + Victorian surcharge on a higher base.
**Features** — 4-bed / 3–3.5-bath / 2-car large layout; private landscaped garden; customisable interiors; XEN Architecture design; ~930 m² boutique 3-home site.
**De-band** — Highest price (A$1.95M) and largest unit (~210 m²) of the trio on the smallest project — a premium 3-home scarcity play, the opposite of Author's 53-home scale.

### 48. 668-670 Elgar Rd — `668-670-elgar-rd-box-hill-north` · NAC 73/100
**Box Hill North, Melbourne** · townhouse · mid-premium tier · Bello Designs; DA in approval (earliest-stage) [c status / `[e]` pricing]
**Financials** — Price **A$1,650,000** · A$8,684/m² (190 m²) · gross yield 2.8% · **IRR 5yr 8.3%** · CoC 2.3% · payback 36 yr · rent A$3,850/mo · expenses A$695/mo · cash-flow A$3,155/mo
**Sub-scores** — Loc 19 · Growth 14 · Yield 7 · Liquidity 11 · Quality 8 · Immigration 9 · Safe-haven 5
**Pricing basis** — Box Hill North house-comp (~A$1.4–1.5M) · 190 m² · yield 2.8% · growth 6.0% · exp 0.18 (townhouse)
**Building** — Boutique 5 two-storey townhouses, mix of 4- and 5-bedroom, double garages [c]
**Tagline** — EN: "Five 4–5 bed townhouses, Box Hill North" · VI: "Năm căn nhà phố 4–5 phòng ngủ Box Hill North"
**Statement** — Own a «668-670 Elgar Rd» townhouse in «Melbourne».
**Desc** — A boutique Bello Designs scheme of five two-storey townhouses on Elgar Road, blending 4- and 5-bedroom homes with double garages for larger families. Near Box Hill North Primary, Koonung Secondary College, Springfield Park and Box Hill Hospital, with bus and train access. Early-stage (DA in approval), so plans and pricing remain indicative.
**NAC Note** — The only Box Hill North listing, giving it a leafier, lower-density submarket profile than the three South townhouses, plus the largest bedroom counts (up to 5-bed) for multi-generational families. The catch is stage: the DA is still in approval, so this carries the most planning and timeline uncertainty of the five and any price shown is indicative. Schooling leans on Koonung Secondary / Box Hill North Primary rather than the Box Hill High brand the South sites trade on. A family-sized, growth-oriented hold for buyers comfortable with early-approval risk.
**Pros** — Largest bedroom counts in the set (4–5 bed, multi-gen appeal); Box Hill North leafier, lower-density (diversifies the cluster); near Koonung Secondary & Springfield Park; double garages on every home; AUD freehold, FIRB-eligible.
**Cons** — **DA only in approval (highest planning/timeline risk of the five)**; pricing & completion not yet confirmed; outside the Box Hill High zone; ~2.8% gross yield (capital-growth, not cash-flow).
**Features** — 4–5 bedroom layouts; double garage per home; 2-storey boutique 5-home enclave; walk to Koonung Secondary / Box Hill North Primary; near Springfield Park & Box Hill Hospital.
**De-band** — Only Box Hill North address and only 5-bedroom option — largest homes-by-bedroom, a different (cheaper, leafier, higher-growth) submarket than the South trio, but the earliest project stage.

### 49. 380 Middleborough Road — `380-middleborough-road-blackburn` · NAC 77/100
**Blackburn, Melbourne** · townhouse · mid tier · boutique developer (via Core Elite / McGrath), off-plan [c]
**Financials** — Price **A$1,350,000** · A$7,714/m² (175 m²) · gross yield 2.4% · **IRR 5yr 10.2%** · CoC 2.0% · payback 42 yr · rent A$2,700/mo · expenses A$485/mo · cash-flow A$2,215/mo
**Sub-scores** — Loc 19 · Growth 18 · Yield 6 · Liquidity 11 · Quality 8 · Immigration 10 · Safe-haven 5
**Pricing basis** — Blackburn house-comp (from A$1.25M, median house A$1.65M) · 175 m² · yield 2.4% · growth 8.2% (house) · exp 0.18 (townhouse)
**Building** — Boutique 4 two-storey townhouses, each with private driveway + double garage, opposite Box Hill High School; walk to Laburnum station [c]
**Tagline** — EN: "Four townhouses opposite Box Hill High" · VI: "Bốn căn nhà phố đối diện Box Hill High"
**Statement** — Own a «380 Middleborough Road» townhouse in «Melbourne».
**Desc** — A boutique collection of four 4-bedroom, 3-bathroom townhouses on Middleborough Road, Blackburn, each with a private driveway and double garage, from A$1.25M. The headline draw is position: directly opposite Box Hill High School and a short stroll to Laburnum train station. Leafy, lower-density Blackburn offers a calmer alternative to the Box Hill commercial core.
**NAC Note** — The Blackburn outlier of the set, with a case resting on two specifics the Box Hill listings can't all claim: a literal opposite-the-gate position to Box Hill High School, and Blackburn's standout ~8.2%/yr recent capital growth — the strongest growth figure in the cluster. At ~A$1.25M entry it undercuts the Box Hill South premium and Birdwood's A$1.85M+. The offset is the lowest gross yield in the set (~2.4%), so this is unambiguously a school-zone capital-growth and owner-occupier play. A boutique 4-home scheme keeps competition low but means no on-site amenity. Strongest growth/schooling story, weakest income.
**Pros** — Directly opposite Box Hill High School (premier school-zone position); Blackburn's ~8.2%/yr capital growth (best in the cluster); lowest confirmed entry (from A$1.25M) of the boutique listings; walk to Laburnum station; private driveway + double garage, leafy low-density.
**Cons** — Lowest gross yield in the set (~2.4%, pure growth/owner-occupier); only 4 homes (no on-site amenity); Blackburn less transit-dense than the Box Hill interchange suburbs; FIRB + Victorian surcharge.
**Features** — 4-bed / 3-bath / 2-car layout; private driveway per home; double garage; opposite Box Hill High School; walk to Laburnum train station.
**De-band** — Only Blackburn address — pairs the cluster's lowest yield (~2.4%) with its highest capital growth (~8.2%/yr) and a unique opposite-Box-Hill-High position, at the lowest confirmed entry price (A$1.25M). Highest IRR in the AU set (10.2%), entirely growth-led.

---

## 6. Open items & data fixes

Surfaced during research — fold these into Notion when patching:

1. **`sanctuary-willow`** — district is mislabelled "Willow"; it is the Willow Skyhome collection in Sekisui House's **Sanctuary, Wentworth Point NSW 2127**. Live HTML geo (−33.7304 / 151.0455) is a Carlingford-area placeholder → re-point to ~−33.825 / 151.073.
2. **`beyond-hurstville`** — the research worker did not return a project block; financials are **suburb-derived estimates** and building facts (developer, storeys, completion) are unconfirmed. Re-run a single-listing research pass before publishing.
3. **`14-asquith-street-box-hill-south`** — no public townhouse project found at the address (lot currently holds a house). Price/dwelling count are placeholders; **do not flip Live** until a developer release confirms the project.
4. **Townhouse paybacks look long (33–48 yr)** by design — payback here is the gross-rent multiple (`1/yield`), and these are low-yield, land-backed *growth* assets. Their value shows in the **IRR (5yr)** column (growth + net yield), where Blackburn (10.2%), Ashbury Terrace (9.7%) and Box Hill North (8.3%) lead the set.
5. **VI long-form** (desc / NAC note / pros / cons / features) — this doc carries bilingual taglines + statements; the long-form VI mirrors of the EN prose are a follow-up translation pass before Notion write-back.

## 7. Applying this to Notion (next pass, not done here)

Per-listing, write back to the 🏠 NAC - Property Listings DB: `Purchase Price`, `Price Per M2`,
`Yield %`, `IRR %`, `Cash-on-Cash %`, `Payback Years`, `Monthly Rental Income`, `Monthly Expenses`,
`Cash Flow`, `⭐ NAC Score`, `📊 Sub-Scores JSON`, plus the bilingual editorial fields
(`🏷️ Tagline`, `📜 Statement`, `📝 Desc`, `💬 NAC Note`, `✅ Pros JSON`, `⚠️ Cons JSON`,
`✨ Features JSON`). The 5-min `sync-notion.yml` cron then patches every `properties/<slug>.html`
and pushes to WordPress. **Recommend doing this in small batches with a visual QA per batch**, since
each write goes live on the public site.






