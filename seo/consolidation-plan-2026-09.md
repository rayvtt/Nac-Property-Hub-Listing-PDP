# NAC SEO — Consolidation + H1 fix plan (2026-09-12)

**Decision requested from Ray: approve the redirect map + the H1 fix below.** Nothing changes live until you say go. This is the single highest-leverage ranking action — it unblocks pages that already have content, which no amount of new content can do while these duplicates stand.

---

## 1. What the audit actually found (worse than "cannibalization")

Live-probed 2026-09-12. The `/residences/` and `/citizenships/` custom-post-types are **20 broken duplicate URLs all serving the *same* article** — the "Greece Golden Visa 2026" blog overview — regardless of slug:

| Probe | H1s | Title served | rel=canonical |
|---|---|---|---|
| `/residences/portugal-residence/` | **12** | "Chương Trình Overview: Greece Golden Visa 2026…" | → the Greece blog article |
| `/residences/malta-residence/` | **12** | *(identical Greece article)* | → same blog article |
| `/citizenships/turkey-citizenship/` | **12** | *(identical Greece article)* | → same blog article |
| `/citizenships/antigua-barbuda-citizenship/` | **12** | *(identical Greece article)* | → same blog article |
| `/residences/malaysia-residency/` … all 18 | **12** | *(identical Greece article)* | → same blog article |
| **CLP** `/property-hub-bat-dong-san/greece/` | **1** ✓ | "Định cư Hy Lạp: Golden Visa & BĐS Hy Lạp \| NAC" ✓ | self ✓ |

**Two root problems:**
1. **~20 zero-value duplicate URLs.** Every `/residences/*` and `/citizenships/*` page renders the one Greece article (Portugal, Malta, Turkey-citizenship, Antigua… all show Greece content). They add nothing, waste crawl budget, and drag sitewide quality signals.
2. **The 12-H1 defect lives in the source blog article**, which uses `<h1>` for every section ("1. Tổng Quan Nhanh", "2. Tại Sao Hy Lạp?", … = title + 11 sections). Because that article is duplicated everywhere, the 12-H1 shows on all 20 URLs — but it's **one article to fix**.

**Confirmed good:** the CLPs are clean (1 H1, keyword-targeted title, self-canonical) → **the CLP is the correct canonical** for each program's commercial query. No change needed there.

---

## 2. The 301 redirect map (retire all 20 broken URLs)

Rule: country has a CLP → CLP; else has a brochure → brochure; else → the Property Hub. Junk/duplicate slugs → Property Hub.

### /residences/
| # | Source (broken duplicate) | 301 → target | Why |
|---|---|---|---|
| 1 | `/residences/chuong-trinh-hy-lap-golden-visa/` | `/property-hub-bat-dong-san/greece/` | Greece CLP (canonical) |
| 2 | `/residences/malaysia-residency/` | `/property-hub-bat-dong-san/malaysia/` | Malaysia CLP |
| 3 | `/residences/malta-residence/` | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` | no CLP → Malta brochure |
| 4 | `/residences/portugal-residence/` | `/brochures/chuong-trinh-bo-dao-nha-golden-visa/` | no CLP → Portugal brochure |
| 5 | `/residences/italy-residence/` | `/brochures/chuong-trinh-y-italy-rbi-qua-dau-tu-bds/` | no CLP → Italy brochure |
| 6 | `/residences/hungary-residence/` | `/property-hub-bat-dong-san/` | no product for Hungary |
| 7 | `/residences/574/` | `/property-hub-bat-dong-san/` | junk numeric stub |
| 8 | `/residences/` (index) | `/property-hub-bat-dong-san/` | broken index |

### /citizenships/
| # | Source (broken duplicate) | 301 → target | Why |
|---|---|---|---|
| 9 | `/citizenships/turkey-citizenship/` | `/property-hub-bat-dong-san/turkey/` | Turkey CLP |
| 10 | `/citizenships/st-kitts-and-nevis-citizenship/` | `/brochures/chuong-trinh-si-kitts-nevis-quoc-tich/` | St Kitts brochure |
| 11 | `/citizenships/antigua-barbuda-citizenship/` | `/brochures/chuong-trinh-antigua-barbuda-cbi/` | Antigua brochure |
| 12 | `/citizenships/malta-citizenship/` | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` | Malta brochure |
| 13 | `/citizenships/malta-citizenship-2/` | `/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/` | duplicate slug |
| 14 | `/citizenships/saint-lucia-citizenship/` | `/property-hub-bat-dong-san/` | no product (alt: Caribbean CBI blog) |
| 15 | `/citizenships/grenada-citizenship/` | `/property-hub-bat-dong-san/` | no product (alt: Caribbean CBI blog) |
| 16 | `/citizenships/dominica-citizenship/` | `/property-hub-bat-dong-san/` | no product (alt: Caribbean CBI blog) |
| 17 | `/citizenships/vanuatu-citizenship/` | `/property-hub-bat-dong-san/` | no product |
| 18 | `/citizenships/571/` | `/property-hub-bat-dong-san/` | junk numeric stub |
| 19 | `/citizenships/572/` | `/property-hub-bat-dong-san/` | junk numeric stub |
| 20 | `/citizenships/` (index) | `/property-hub-bat-dong-san/` | broken index |

> **Alt for the 4 "no-product" Caribbean rows (14–16):** if you'd rather keep topical relevance, point them at a Caribbean-CBI blog pillar instead of the hub. Say the word and I'll add that pillar to the content queue and repoint them there.

The paste-ready redirect block (Rank Math or .htaccess) is in [`seo/redirects-residences-citizenships.txt`](./redirects-residences-citizenships.txt).

---

## 3. The 12-H1 fix (one article)

- **Article:** `blog.nomadassetcollective.com/chuong-trinh-overview-greece-golden-visa-2026-huong-dan-toan-dien-cho-nha-dau-tu-viet-nam/` (in the NAC Site CMS).
- **Now:** 12 × `<h1>` — the title + 11 in-body section headers.
- **Fix:** keep ONE `<h1>` (the article title the theme renders); convert the 11 in-body section `<h1>` → `<h2>`, and any sub-points to `<h3>`. Pure heading-hierarchy change, no copy rewrite.
- **Then:** audit every other blog post for >1 `<h1>` (this authoring pattern likely repeated) and fix the same way.
- **I can do this one** via the CMS/content pipeline once you approve — it doesn't need WP admin.

---

## 4. Execution split + approval checklist

**I do (once you approve — no WP admin needed):**
- [ ] Fix the 12-H1 in the Greece blog article (h1→h2/h3), then audit + fix other posts.
- [ ] Hand you the redirect list in Rank Math import format (or the .htaccess block) so it's a paste, not 20 manual entries. *(done — see the redirects file)*

**You do (WP admin, ~15 min — I can't reach Rank Math/redirects via API):**
- [ ] Add the 20 × 301 redirects (Rank Math → Redirections, or the Redirection plugin / .htaccess block provided).
- [ ] Set the `residence`, `citizenship`, and `compare` custom post types to **noindex + exclude from sitemap** (Rank Math → Titles & Meta → those CPTs) so Google stops discovering them.
- [ ] Delete/unpublish the 18 broken CPT posts (optional once redirected, but cleanest).

---

## 5. Expected impact

- Removes ~20 duplicate/thin URLs → sitewide quality + crawl-budget improvement.
- Consolidates every program's link-equity onto its ONE canonical (CLP or brochure) → each program page finally strong enough to compete.
- Fixes the 12-H1 topical-focus defect on the one real article it lives in.
- **This is the prerequisite** — the queued content pillars (Golden Visa, US/EB-5, …) rank far faster once program signals aren't split 3–4 ways.
- Timeline: recrawl + consolidation typically shows in GSC in **2–6 weeks**.
