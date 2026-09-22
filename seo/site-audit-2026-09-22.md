# NAC site crawl — broken / outdated / duplicate landing pages (2026-09-22)

**Ask:** "crawl and flag them all so I can set up redirect."
**Method:** live-crawled every WordPress CPT + taxonomy URL on
`nomadassetcollective.com` from the Rank Math sitemaps (residences, citizenships,
compares, compare-cat) plus the country landing pages (CLPs). Each URL probed for
raw HTTP status, redirect target, `<title>`, canonical, and H1 count. The WAF
"One moment, please…" interstitial (itself HTTP 200) was detected and retried
through, so the status column below is real — not a challenge page.

**Paste-ready redirect file:** [`seo/redirects-full-cleanup.txt`](./redirects-full-cleanup.txt)

---

## TL;DR

- **Good news:** you've already fixed **17** of the residence/citizenship
  duplicates — they're live 301s now (list in §3, don't redo them).
- **Still broken: 22 URLs** all return 200 (no redirect yet) — the last Greece
  duplicate, 2 citizenship stubs, and the entire `/compares/` + `/compare-cat/`
  thin-taxonomy set. Redirect map in §2.
- **2 new duplicates found** beyond the original list: a **duplicate UK CLP**
  (`/uk/` vs `/united-kingdom/`) and a **second Greece Golden Visa page** under
  `/brochures/`. See §4.
- **1 page to noindex, not redirect:** `/early-access/` (a real beta-signup page).
- **Structural fix:** after redirecting, set the `residence` / `citizenship` /
  `compare` post types + `compare-cat` taxonomy to **noindex + exclude from
  sitemap** so Google stops rediscovering these stubs (§5).

The 87 blog posts and 129 property listings (PDPs) were **not** flagged — they're
real content/products with clean self-canonicals, not the broken stubs Google is
surfacing.

---

## 1. The URL universe crawled

| Bucket | Count | Verdict |
|---|---:|---|
| `/residences/*` (CPT) | 8 | 7 already 301'd · **1 still broken** |
| `/citizenships/*` (CPT) | 12 | 10 already 301'd · **2 still broken** |
| `/compares/*` (CPT) | 15 | **all 15 still broken** (thin term stubs) |
| `/compare-cat/*` (taxonomy) | 4 | **all 4 still broken** (thin archives) |
| `/property-hub-bat-dong-san/<country>/` (CLPs) | 16 | 14 clean · **1 duplicate pair** (uk/united-kingdom) · 1 = early-access (noindex) |
| `/property-hub-bat-dong-san/<country>/<listing>/` (PDPs) | 129 | real listings — not flagged |
| `/brochures/*` | 21 | real brochures — **1 Greece dup** flagged (§4) |
| Blog posts (`blog.` + main post-sitemap) | 87 | real articles — not flagged |
| **Still-broken total needing action** | **22 + 2 dupes + 1 noindex** | see §2 / §4 |

---

## 2. STILL BROKEN — need a redirect (22 URLs, all return 200 today)

Rule: country → its CLP if one exists; else its brochure; else the Property Hub /
the So Sánh tool for comparison stubs.

### The last live Greece duplicate — do this first
| Source (200, live) | 301 → | Why |
|---|---|---|
| `/residences/chuong-trinh-hy-lap-golden-visa/` | `/property-hub-bat-dong-san/greece/` | the original Greece article still served raw; #1 CLP cannibaliser |

### Remaining `/citizenships/` stubs
| Source | 301 → |
|---|---|
| `/citizenships/saint-lucia-citizenship/` | `/brochures/` (no product; matches its Dominica/Vanuatu siblings) |
| `/citizenships/` (index) | `/brochures/` |

### `/compares/` thin term stubs (title is just a country name)
| Source | 301 → | Target type |
|---|---|---|
| `/compares/hy-lap/` (Greece) | `/property-hub-bat-dong-san/greece/` | CLP |
| `/compares/sip-cp/` (Cyprus) | `/property-hub-bat-dong-san/cyprus/` | CLP |
| `/compares/panama/` | `/property-hub-bat-dong-san/panama/` | CLP |
| `/compares/thai-lan/` (Thailand) | `/property-hub-bat-dong-san/thailand/` | CLP |
| `/compares/uc/` (Australia) | `/property-hub-bat-dong-san/australia/` | CLP |
| `/compares/malaysia/` | `/property-hub-bat-dong-san/malaysia/` | CLP |
| `/compares/malta-mt/` (Malta) | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` | brochure |
| `/compares/bo-dao-nha/` (Portugal) | `/brochures/chuong-trinh-bo-dao-nha-golden-visa/` | brochure |
| `/compares/new-zealand/` | `/brochures/chuong-trinh-new-zealand-rbi-dau-tu-di-tru/` | brochure |
| `/compares/new-zealand-2/` | `/brochures/chuong-trinh-new-zealand-rbi-dau-tu-di-tru/` | brochure (dup slug) |
| `/compares/nauru/` | `/brochures/chuong-trinh-nauru-quoc-tich-cbi-citizenship-by-investment/` | brochure |
| `/compares/hungary/` | `/property-hub-bat-dong-san/` | hub (no product) |
| `/compares/caribbean/` | `/so-sanh/` | comparison tool |
| `/compares/688/` | `/so-sanh/` | junk numeric slug |
| `/compares/` (index) | `/so-sanh/` | the real comparison tool |

### `/compare-cat/` thin archive pages → the real comparison tool
| Source | 301 → |
|---|---|
| `/compare-cat/asia/` | `/so-sanh/` |
| `/compare-cat/caribbean/` | `/so-sanh/` |
| `/compare-cat/europe/` | `/so-sanh/` |
| `/compare-cat/oceania/` | `/so-sanh/` |

> The **real** comparison tool is `/so-sanh/` (verified: `/brochures/so-sanh/`
> 301s to it). These `/compares/*` and `/compare-cat/*` pages are empty WordPress
> taxonomy stubs from an abandoned CPT experiment — pointing them at `/so-sanh/`
> both reclaims their equity and sends users to the tool they were looking for.

---

## 3. ALREADY FIXED — live 301s (do NOT redo these, 17 URLs)

Confirmed returning 301 on 2026-09-22:

| Source | → target |
|---|---|
| `/residences/` | `/brochures/` |
| `/residences/574/` | `/brochures/` |
| `/residences/hungary-residence/` | `/brochures/` |
| `/residences/italy-residence/` | `/brochures/chuong-trinh-y-italy-rbi-qua-dau-tu-bds/` |
| `/residences/malaysia-residency/` | `/brochures/chuong-trinh-malaysia-rbi-mm2h-dau-tu-quyen-cu-tru/` |
| `/residences/malta-residence/` | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` |
| `/residences/portugal-residence/` | `/brochures/chuong-trinh-bo-dao-nha-golden-visa/` |
| `/citizenships/571/` | `/brochures/` |
| `/citizenships/572/` | `/brochures/` |
| `/citizenships/antigua-barbuda-citizenship/` | `/brochures/chuong-trinh-antigua-barbuda-cbi-dau-tu-quoc-tich/` |
| `/citizenships/dominica-citizenship/` | `/brochures/` |
| `/citizenships/grenada-citizenship/` | `/property-hub-bat-dong-san/grenada/` |
| `/citizenships/malta-citizenship/` | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` |
| `/citizenships/malta-citizenship-2/` | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` |
| `/citizenships/st-kitts-and-nevis-citizenship/` | `/brochures/chuong-trinh-si-kitts-nevis-quoc-tich/` |
| `/citizenships/turkey-citizenship/` | `/brochures/chuong-trinh-tho-nhi-ky-cbi-citizenship-by-investment/` |
| `/citizenships/vanuatu-citizenship/` | `/brochures/` |

---

## 4. NEW duplicates found this crawl (beyond the original list)

### 4a. Duplicate UK country landing page — CLP cannibalization
Two live CLPs for the **same country**:

| URL | Title | Status |
|---|---|---|
| `/property-hub-bat-dong-san/uk/` | "United Kingdom · NAC Property Collection" | 200, self-canonical |
| `/property-hub-bat-dong-san/united-kingdom/` | "Đầu tư định cư Anh: Bất động sản hàng đầu…" | 200, self-canonical |

Both rank for the same UK queries and split each other's equity. `/united-kingdom/`
carries the **VI keyword-targeted title** (the canonical CLP pattern), so the
recommendation is **301 `/uk/` → `/united-kingdom/`**. ⚠️ **Confirm first** which
one your hub menu / internal links point to — keep the linked one, redirect the
other.

### 4b. Second Greece Golden Visa page under /brochures/
`/brochures/residences-chuong-trinh-hy-lap-golden-visa/` (200, title "Hy Lạp
Golden Visa — Cư Trú Qua Đầu Tư | NAC") is a **second** Greece page with an
auto-generated `residences-…` slug. Greece's canonical is the CLP. If you don't
need a standalone Greece brochure, **301 it → `/property-hub-bat-dong-san/greece/`**.
(Included in the redirect file, flagged REVIEW.)

---

## 5. Structural fix — stop the stubs coming back

Redirects reclaim equity from URLs Google already knows. To stop it rediscovering
new ones, in **Rank Math → Titles & Meta**:

- `residence` post type → **noindex** + exclude from sitemap
- `citizenship` post type → **noindex** + exclude from sitemap
- `compare` post type → **noindex** + exclude from sitemap
- `compare-cat` taxonomy → **noindex** + exclude from sitemap
- Individual page: `/property-hub-bat-dong-san/early-access/` → **noindex**
  (functional beta-signup page — do not redirect, just de-index)

Then (optional, cleanest) delete/unpublish the emptied CPT posts.

---

## 6. What's healthy (crawled, not flagged)

- **16 CLPs** — clean, 1 H1, VI keyword titles, self-canonical (the `<title>` fix
  from the earlier session is live). Only exception = the UK duplicate in §4a.
- **21 brochures** — real program brochures, self-canonical. Only exception = the
  Greece dup in §4b.
- **129 PDPs** + **87 blog posts** — real content with clean canonicals.

**Expected impact:** clearing these ~24 zero-value/duplicate URLs removes the last
cannibalisers of the CLPs and brochures, improves sitewide quality signals and
crawl budget, and lets each program page finally consolidate its ranking. Recrawl
typically reflects in GSC within 2–6 weeks.
