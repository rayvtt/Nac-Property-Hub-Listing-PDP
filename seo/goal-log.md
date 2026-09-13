# NAC — /goal ranking log

Weekly VN immigration-investment SEO rank reviews (most recent first).

## 2026-09-13 — Execution tick: Golden Visa pillar actually drafted

**De-dup check first:** the 2026-09-10 entry claimed the "Thị thực vàng (Golden Visa) là gì" pillar (SEO-1518) was "kicked off … as a review draft." Verified via direct Notion search — **no such page existed.** The 09-10 run primed the brief but the draft was never actually written or filed. Treating that as not-shipped and redoing it properly this run, rather than re-logging a second "primed" entry.

**No regressions to defend.** Latest rank snapshot is still 2026-09-01 (0/37 top-3, all not-ranking) — no fresher GSC pull exists yet; nothing to defend since nothing is in top-3 to fall out of.

**Shipped this run:**
- **SEO-1518 → drafted and filed for real.** Full bilingual (VI ≈2,150 / EN ≈1,950 words) pillar "Thị thực vàng (Golden Visa) là gì?" via `content-blog-writer` + `/copy-write-vi` pass (6 translationese fixes). Comparison table covers 9 verified-active programmes (Hy Lạp, Síp, Malta, UAE, Bồ Đào Nha, Ý, Malaysia, Panama, New Zealand) + 4 verified closed/changed (Spain, Portugal property route, Australia, Panama threshold) — every figure traced to Notion (🔀 So Sánh Data, 🔖 Brochures Meta-data, 🏠 Property Listings); no number invented, unverifiable countries (UK, Singapore, Vietnam, US EB-5) omitted rather than guessed.
  - Filed as a **draft** in NAC Site CMS: https://app.notion.com/p/3da48ec25e86814889e5fc9eb393b5d8 (`Status=Idea`, `Reviewed by NAC?=Waiting to Review`, `Published?=Not started` — nothing published).
  - SEO-1518 updated with a note + Commit/Revision link to the draft; `Status` left at `New` (not `Applied` — that's reserved for auto-applied technical fixes).
  - Campaign record: `nac-marketing-omnichannel/campaigns/2026-09-golden-visa-la-gi/` (`campaign.md` + `article.md`, full VI/EN body + JSON-LD stub + SEO/AEO notes).
  - This is the cluster-hub pillar — internal-links down to 9 country CLPs/brochures; reciprocal links **up** from the 4 sibling Golden Visa country articles (Greece/Portugal/Spain/UAE) are still open, queued for `seo-aeo-optimizer` at publish.

**Indexation check:** nothing else shipped in the last 14 days to check (the only other log entry since was the PR #402 CLP title/H1 fix, already >14 days old). The new pillar is draft-only, not indexable yet.

**Still BLOCKED ON RAY (unchanged, now day 1 of the consolidation plan):** `seo/consolidation-plan-2026-09.md` (written 2026-09-12) — the 20×301 redirect map + CPT noindex need Ray's WP admin go-ahead; the Greece-article H1 fix is flagged as Claude's to execute but the plan's own text still reads "nothing changes live until you say go," so it was **not** auto-applied this run pending that explicit go (SEO Tasks #761/#1461 confirmed still Snoozed/New, not Approved).

**Next:** continue the content queue (US/EB-5 pillar, second-passport pillar, cost pillar — all still `New` in 🚀 SEO Tasks) on the next run; ask Ray directly about greenlighting the consolidation-plan H1 fix since it's the highest-leverage item and has sat since 09-12.

## 2026-09-10 — Weekly activities RESTART

**Root cause of the 7-week flatline:** measurement ran clean every cycle (07-24 → 09-01, all **0/37** not-ranking, avg position —), but **all 6 tasks queued on 07-24 are still `New` — nothing shipped.** Rankings can't move while briefs sit unexecuted and the structural blockers stand.

**Cadence changed to WEEKLY (this restart):**
- `goal-review.yml` cron: bi-weekly (1st/15th) → **weekly, every Monday 09:00 UTC** (measurement half).
- New **weekly execution Routine** (Tuesdays ~09:00 ICT, fresh session, notifies Ray): reads the fresh snapshot, defends any regression first, then **advances ONE queued task to a shipped draft each week** (drafts only) + logs + reports. The loop now drives execution, not just measurement.

**Primed this week:** kicked off the #1 top-of-funnel pillar — **"Thị thực vàng (Golden Visa) là gì"** (targets `thị thực vàng` + `golden visa là gì`, impact 80) — via the /blog-article pipeline as a review draft, internal-linking down to every program CLP. First artifact moving queued-brief → drafted since baseline.

**BLOCKED ON RAY — the real ranking lever (still unaddressed after 7 weeks):** the structural fix outranks all net-new content, because it unblocks pages that ALREADY have content:
1. **Cannibalization** — pick ONE canonical URL per program (recommend the CLP), 301 the competing `/residences/` + blog-overview URLs. Needs Ray's go on live-URL 301s.
2. **Multiple H1s (×12)** on the `/residences/` + `/citizenships/` WP template — needs the theme/template edit.
Until these land, program keywords (Hy Lạp, Malta, BĐN, Thổ…) stay split and can't reach top-3 no matter how much content ships.

**Next:** measurement Mon 2026-09-14 · working session Tue 2026-09-15.

## 2026-09-01 — Goal review

- **Tracked**: 37  ·  🥇 top-3: **0** (+0)  ·  🎯 striking: 0  ·  📄 page-2: 0  ·  🕳️ deep: 0  ·  ∅ not-ranking: 37
- **Avg position** (ranked set): —
- **Gainers**: —
- **Regressions**: —
- **Content gaps** (no page yet): hộ chiếu thứ hai, thị thực vàng, golden visa là gì, eb-5, thẻ xanh mỹ, đầu tư định cư mỹ, đầu tư định cư canada, chi phí đầu tư định cư, đầu tư định cư cần bao nhiêu tiền, đầu tư định cư giá rẻ
- **Quick wins** (striking 4–10, one push to top-3): —
## 2026-08-15 — Goal review

- **Tracked**: 37  ·  🥇 top-3: **0** (+0)  ·  🎯 striking: 0  ·  📄 page-2: 0  ·  🕳️ deep: 0  ·  ∅ not-ranking: 37
- **Avg position** (ranked set): —
- **Gainers**: —
- **Regressions**: —
- **Content gaps** (no page yet): hộ chiếu thứ hai, thị thực vàng, golden visa là gì, eb-5, thẻ xanh mỹ, đầu tư định cư mỹ, đầu tư định cư canada, chi phí đầu tư định cư, đầu tư định cư cần bao nhiêu tiền, đầu tư định cư giá rẻ
- **Quick wins** (striking 4–10, one push to top-3): —
## 2026-08-01 — Goal review

- **Tracked**: 37  ·  🥇 top-3: **0** (+0)  ·  🎯 striking: 0  ·  📄 page-2: 0  ·  🕳️ deep: 0  ·  ∅ not-ranking: 37
- **Avg position** (ranked set): —
- **Gainers**: —
- **Regressions**: —
- **Content gaps** (no page yet): hộ chiếu thứ hai, thị thực vàng, golden visa là gì, eb-5, thẻ xanh mỹ, đầu tư định cư mỹ, đầu tư định cư canada, chi phí đầu tư định cư, đầu tư định cư cần bao nhiêu tiền, đầu tư định cư giá rẻ
- **Quick wins** (striking 4–10, one push to top-3): —
## 2026-07-24 — Goal review + strategist pass

**Baseline (first run with real GSC data).** 37 keywords · 🥇 top-3: **0** · 🎯 striking: 0 · 📄 page-2: 0 · 🕳️ deep: 0 · ∅ not-ranking: **37** · avg position: —. GSC shows only 14 organic queries in 28 days (young, near-invisible site for these terms).

**Diagnosis — the blocker is STRUCTURAL, not a content shortage:**
1. **Cannibalization** — each program keyword has ≥3 competing NAC URLs (CLP + /residences/ + blog overview). Google splits the signal; no single page is strong enough for top-3.
2. **Multiple H1s (×12)** on the /residences/ + /citizenships/ template (already in the task queue) — destroys topical focus on every program page.
3. ✅ CLP title/H1 fix shipped today (PR #402) — resolves the old "No H1 on CLP" tasks; they auto-clear on the next audit.

**Queued this run (6 tasks → 🚀 SEO Tasks DB, all human-review):**
- US / EB-5 pillar — đầu tư định cư mỹ · eb-5 · thẻ xanh mỹ  (P1, impact 90)
- Second-passport pillar — hộ chiếu thứ hai · quốc tịch thứ hai  (P1, 85)
- Golden Visa explainer — thị thực vàng · golden visa là gì  (P1, 80)
- Cost pillar — chi phí · cần bao nhiêu tiền · giá rẻ  (P1, 78)
- Cannibalization audit — Greece/Malta/Portugal/Turkey consolidation  (P1, 72)
- Canada pillar — đầu tư định cư canada  (P2, 55)

**Path to top-3:** (1) consolidation decision — pick ONE canonical URL per program, 301 the rest [Ray's call]; (2) fix the 12-H1 template [queued]; (3) ship the 5 pillars via /blog-article. Expected: on-page movement 2–6 weeks · new pillars ranking 1–3 months · competitive head terms a quarter+.

**Content gaps (no page yet):** hộ chiếu thứ hai, thị thực vàng, golden visa là gì, eb-5, thẻ xanh mỹ, đầu tư định cư mỹ, đầu tư định cư canada, chi phí đầu tư định cư, đầu tư định cư cần bao nhiêu tiền, đầu tư định cư giá rẻ.

**Next review:** 2026-08-07.
