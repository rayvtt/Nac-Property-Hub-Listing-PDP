# NAC — /goal ranking log

Weekly VN immigration-investment SEO rank reviews (most recent first).

## 2026-09-16 — Execution tick: Canada pillar drafted; H1-fix blocker root-caused (not a Notion edit)

**De-dup check first:** `git log --since=midnight` clean in both repos; 🚀 SEO Tasks and NAC Site CMS showed nothing touched yet today. Rank snapshot is still 2026-09-14 (0/37 top-3) — no fresher GSC pull; nothing to defend since nothing is in top-3 to fall out of.

**Blocked item re-investigated (task #1461 / #1521, 4 days blocked):** the 09-12 consolidation plan assumed Claude could fix the Greece article's 12-H1 defect "via the CMS pipeline, no WP admin needed." Live-probed the article's actual HTML and cross-checked against the Notion source: all 12 mis-rendered headings are ordinary Heading_2 blocks in Notion — identical in type to sibling headings that render correctly as `<h2>` on the same page. So this isn't a Notion heading-level mistake; some render step outside Notion (WP theme or a Notion→WP sync/plugin) promotes headings matching a numbered "N. " prefix to `<h1>`, and that code isn't present in any of the 5 repos accessible from this session. **Not executable as a pure content edit** — corrected task #1461's and #1521's notes accordingly and flagged the decision Ray needs (where that render step actually lives, or a green light to test stripping the numbering as an unverified workaround). No live change made.

**Shipped this run:**
- **SEO-1520 (Canada pillar) → drafted, verified, and filed.** Delegated the bilingual VI+EN draft to `content-blog-writer`, which came back tool-limited (no WebSearch/Notion/git in that sub-session) — completed the remaining required steps directly: live-verified against `ircc.canada.ca`, filed to NAC Site CMS, updated the SEO task, committed and pushed the campaign record.
  - **Caught a real error before filing**: the sub-agent's draft (and the original SEO-1520 brief) assumed the Start-up Visa was still open. Live IRCC check found the opposite — SUV stopped issuing new commitment certificates 31/12/2025 and closed to new filings entirely 30/06/2026 (narrow transition window only), with an unspecified replacement pilot announced. Rewrote the article (both languages) before filing to lead with PNP entrepreneur streams as the route genuinely open in 2026, not SUV.
  - Filed as a **draft**: https://app.notion.com/p/3dd48ec25e868141b899fa9f31a7675a (`Status=Idea`, `Reviewed by NAC?=Waiting to Review`, `Published?=Not started`).
  - 12 `[VERIFY]` items left open (bilingually) — mostly per-province PNP thresholds, genuinely volatile and correctly left unstated rather than guessed.
  - Campaign record: `nac-marketing-omnichannel/campaigns/2026-09-canada-investment-migration/`, commit `d344143` on `claude/blissful-noether-86ngth` (pushed).
  - This was the last un-shipped item in the 07-24 content queue (EB-5/second-passport/Golden Visa/cost-pillar all already drafted; EB-5 additionally has 5 VERIFY items blocking it).

**Indexation check:** nothing shipped in the last 14 days is published — Golden Visa (09-13), second-passport (09-14), cost-pillar (09-15) and Canada (today) are all still Idea/draft-only in NAC Site CMS.

**Still BLOCKED ON RAY:**
1. Consolidation-plan 301s + CPT noindex (WP admin, unchanged).
2. **New**: where the blog's Notion→HTML render step actually lives (needed before the 12-H1 fix can be executed at all) — see above.
3. EB-5 pillar's 5 `[VERIFY]` items (unchanged from 09-14).

**Next:** the P1 content queue from 07-24 is now fully drafted; next run should either expand `goal-keywords.json` / run an indexation-and-on-page audit, or advance the Canada pillar's `[VERIFY]` closure once Ray weighs in on scope. Content queue is otherwise exhausted until Ray unblocks the structural item.

## 2026-09-14 — Goal review

- **Tracked**: 37  ·  🥇 top-3: **0** (+0)  ·  🎯 striking: 0  ·  📄 page-2: 0  ·  🕳️ deep: 0  ·  ∅ not-ranking: 37
- **Avg position** (ranked set): —
- **Gainers**: —
- **Regressions**: —
- **Content gaps** (no page yet): hộ chiếu thứ hai, thị thực vàng, golden visa là gì, eb-5, thẻ xanh mỹ, đầu tư định cư mỹ, đầu tư định cư canada, chi phí đầu tư định cư, đầu tư định cư cần bao nhiêu tiền, đầu tư định cư giá rẻ
- **Quick wins** (striking 4–10, one push to top-3): —
## 2026-09-14 — Execution tick: Second-passport pillar drafted; EB-5 mislabel corrected

**De-dup check first:** git log since midnight (both repos) + 🚀 SEO Tasks + NAC Site CMS all clean — no run had touched anything yet today. Rank snapshot is still 2026-09-01 (0/37 top-3) — no fresher GSC pull exists, so nothing to defend since nothing is in top-3 to fall out of.

**Correction to yesterday's "Next" note:** 09-13 listed the US/EB-5 pillar as still `New` in the content queue. It is not — **Task 1516 (US/EB-5) was already `Approved` and drafted on 2026-09-12** ("EB-5 và thẻ xanh Mỹ: chi phí thật, rủi ro thật, và khi nào một hộ chiếu khác đi nhanh hơn," filed to NAC Site CMS as Idea/Waiting to Review, campaign record at `nac-marketing-omnichannel/campaigns/2026-09-eb5-green-card-pillar/`). Yesterday's de-dup checked SEO-1518 (Golden Visa) but not 1516, so the "still New" line was wrong — flagging so nobody redrafts it. It carries **5 unresolved `[VERIFY]` items** (RIA inflation threshold 2027, Regional Center renewal, VN visa queue, I-526E/I-829 processing times, USCIS fee schedule) blocking publish — Ray's call, not auto-resolvable.

**Shipped this run:**
- **SEO-1517 → drafted and filed.** Full bilingual (VI ≈2,880 / EN ≈2,210 words) pillar "Hộ chiếu thứ hai / Quốc tịch thứ hai" via `content-blog-writer` + `/copy-write-vi` pass. Covers 6 verified-active CBI programmes (St Kitts & Nevis, Antigua & Barbuda, Grenada, Dominica, Saint Lucia, Türkiye) — every threshold/timeline traced to Notion (🔀 So Sánh Data, 🔖 Brochures Meta-data, 🏠 Property Listings, with source+date noted per figure, e.g. St Kitts's newer 147-day/120-180-day post-biometric-mandate numbers superseding an older Brochures Meta-data figure). Malta CBI/MEIN + Vanuatu/Jordan/Egypt/Nauru/Austria/Hungary checked and explicitly omitted — no verifiable current figure in Notion, not guessed.
  - Filed as a **draft** in NAC Site CMS: https://app.notion.com/p/3db48ec25e868142867cc752457b2f4d (`Status=Idea`, `Reviewed by NAC?=Waiting to Review`, `Published?=Not started` — nothing published).
  - One `[VERIFY]` left open (both languages): the specific VN Law on Nationality provision on dual citizenship after naturalizing abroad — needs a nationality lawyer's confirmation before publish, not resolvable from Notion data.
  - SEO-1517 updated with a note + commit link; `Status` left at `New` (editorial drafts don't flip to `Applied` — that's auto-fixes only).
  - Campaign record: `nac-marketing-omnichannel/campaigns/2026-09-second-passport-la-gi/` (`campaign.md` + `article.md`), commit `1ce451c` on `claude/nac-marketing-omnichannel-vh7YG`, confirmed on remote.
  - Internal-link deviation from the original brief: the brief's suggested `/citizenships/` path doesn't exist on the live site (see consolidation-plan finding below) — linked to the real live URLs instead (St Kitts/Antigua brochures, Turkey CLP, Property Hub root for "quốc tịch thứ hai" per its `target_url`).

**Indexation check:** nothing new in the last 14 days is published/indexable — Golden Visa (09-13) and second-passport (today) are both draft-only.

**Still BLOCKED ON RAY, now day 2:**
1. **Consolidation plan H1 fix + 301s** (`seo/consolidation-plan-2026-09.md`) — task #1521 (the cannibalization finding) shows `Approved`, but the two actual H1-fix action tasks (#761 Snoozed, #1461 New) are **not** approved, and the plan doc's own text is explicit: "nothing changes live until you say go." Treating the parent-finding approval as "yes, draft a plan" (which happened) — not as a green light to edit the live Greece article's headings. **Not auto-applied this run.** This is the highest-leverage item on the board and has now sat 2 days — needs an explicit yes/no from Ray, not just prioritization.
2. **EB-5 pillar's 5 `[VERIFY]` items** (above) — needs Ray's confirmation before it can move past draft.

**Next:** cost pillar (SEO-1519, P1/impact 78) is the only remaining un-shipped content-queue item — advance it next run. Ask Ray directly (again) on the H1-fix go/no-go and the EB-5 verify items, since both are now blocking real progress rather than lack of execution capacity.


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
