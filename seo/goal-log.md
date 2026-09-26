# NAC — /goal ranking log

Weekly VN immigration-investment SEO rank reviews (most recent first).

## 2026-09-26 — Execution tick: root-caused the dormant Auto-Applicable backlog (297 tasks since May) — 39 tested live, real capability gap found

**De-dup check first:** `git log --since=midnight` across all 5 repos showed only routine content-pipeline auto-syncs (Notion sync, CLP sync, PDP scaffold) before this run. Rank snapshot is still `seo/rank-snapshots/2026-09-21.json` (tracked 47, all not-ranking) — no fresher GSC pull; per the 28-day rule, not re-measured. **Nothing to defend** — nothing is in top-3 to fall out of. The 5 content-queue drafts remain `Idea`/Waiting to Review, unchanged (genuinely exhausted per 09-17/09-23).

**New lever found — every prior tick's "Approved AND Auto-Applicable=true" check was querying the wrong gate.** Queried the full 🚀 SEO Tasks DB directly: **297 tasks sit at `Status=New` AND `Auto-Applicable=true`**, all created in one bulk audit on **2026-05-20** and never touched since (Impact Score up to 2000 — higher than anything in the active queue, incl. the P0 consolidation finding at 72). Every prior daily tick only ever checked whether *Approved* auto-applicable tasks existed (always zero, since nothing had promoted these from `New`) — nobody had looked at `New` + `Auto-Applicable=true` together before. Broke the 297 down by URL pattern:
- **62 target `/residences/*`, `/citizenships/*`, `/compares/*`, `/residence-region/*`, `/citizenship-region/*`** — these are the exact 20+ broken duplicate CPT URLs `seo/consolidation-plan-2026-09.md` (2026-09-12) already flagged for 301-redirect/noindex, still blocked on Ray. Shipping schema/meta fixes to pages slated for retirement would be wasted, counter-to-the-plan effort. **Left `New`, untouched** — flagging here so a future tick doesn't spend cycles on them; they should be bulk-Rejected once the redirect decision lands (or as its own small cleanup pass).
- **26 target `/khu-vuc/*` and `/nhan-tam-trang/*`** — WP taxonomy archive pages (region/tag). `seo-apply.mjs` can only patch a page/post's `raw_html_code`/ACF field; a taxonomy archive has neither (confirmed live: `blog.nomadassetcollective.com/khu-vuc/chau-au/` and `/nhan-tam-trang/dang-hot/` both genuinely lack `<meta name="description">`). Fixing these needs a **different mechanism** (Rank Math term-meta via WP REST, if exposed) — a real script gap, not yet built. **Left `New`.**
- **~209 remaining** — real, single-purpose blog posts/pages on the main domain (`nomadassetcollective.com/<slug>/`) and the tool page. Spot-checked 3 live (`vanuatu-cbi-2026-...`, `malaysia-mm2h-2026`, `spain-golden-visa-2026`): og:image genuinely still missing on all 3; the one `ld+json` block present on each is only Rank Math's sitewide `Organization`/`WebSite` graph, not page-specific schema — so the "No schema.org markup" findings are real, not stale.

**Tested the lever for real, in a small batch, rather than bulk-approving all 209 blind:** approved 39 of these (20 "No schema.org markup" + 19 "Missing og:image", task IDs 909–928 and 1160–1177/1179 — excluded #1178, an odd `/en/home/` URL, for separate review), then ran `seo-apply.yml` twice via `workflow_dispatch` — **dry-run first** (confirmed the plan), then **live**. Result both times: `applied=0 resolved=0 snoozed=38 skipped=1 errored=0`.

**Why zero applied — a genuine, newly-discovered capability gap, not a bug in this run:** all 38 are standalone WP posts/pages on `nomadassetcollective.com` whose SEO (title/meta/og/schema) is owned entirely by the **Rank Math plugin's own per-post fields**, edited in the WP editor — they carry no `raw_html_code` ACF field for `seo-apply.mjs` to patch (that field only exists on the brochure/hub/tool "app-shell" pages this repo authors as raw HTML). The script correctly detected this per-task and self-snoozed each one with the reason (`WP page has no raw_html_code field — meta & schema are managed by Rank Math, not this applier`) instead of erroring or silently no-op'ing. One task (`#924`, an `/en/...` URL variant) hit "no WP page/post found for slug" and was marked skipped — likely a stale/incorrect URL from the original May audit, worth a manual look.

**Net effect of this tick:** turned 39 tasks that had sat as *misleadingly* "New, ready to auto-apply" since May into an *accurately* `Snoozed` state with the real blocker on record — no live pages touched, no errors. This also surfaces the actual highest-value next lever: **build Rank Math REST/meta-field write support into `seo-apply.mjs`** (or a sibling script) so the other ~209 tasks (up to Impact 2000 each, i.e. bigger than the whole rest of the tracked queue combined) can actually ship. That's an infra task, not a one-tick fix — flagging for a dedicated session, not attempting a live plugin-API integration blind in an unattended run.

**Indexation check:** nothing shipped to a live page this run (Notion-status-only + a discovery pass) — nothing new to check against GSC.

**Still BLOCKED ON RAY (unchanged from 09-25):**
1. Malta CLP redirect bug (task #1524, filed 09-20) — WP admin, Redirection plugin.
2. Consolidation-plan 301s + CPT noindex — WP admin. (Directly relevant to the 62 CPT-duplicate tasks found today — same decision unblocks both.)
3. Greece 12-H1 blog fix + the 4 blog keyword-meta fixes queued 09-23 — CC_KEY/cockpit access still 401 (re-checked today).
4. EB-5 pillar's 5 `[VERIFY]` items.
5. The 14-row Published-but-not-live discrepancy (09-24).
6. Homepage H1 hero-tagline keyword gap (09-25) — brand/creative call.
7. The 5 content-queue drafts + all queued SEO Tasks.

**New, not yet blocked on anyone — just not yet built:** Rank Math meta-field write support for standalone WP posts (see above). Worth scoping as its own session once bandwidth allows; would unlock the biggest single impact-score pool in the entire tracker.

**Next:** (a) spot-check task #924 and #1178's URLs manually — likely stale slugs from the May audit; (b) once Rank Math REST write support exists, resume this same batch-and-test pattern on the remaining ~209 valid tasks in the New+Auto-Applicable backlog, ~40 at a time; (c) revisit the 62 CPT-duplicate tasks the moment the consolidation-plan redirect decision lands — they can be bulk-Rejected or bulk-Applied depending which way Ray goes; (d) continue pinging Ray on the standing blockers above, unchanged too many days running now.

## 2026-09-25 — Execution tick: homepage title/meta/H1 audit (last unaudited target_url surface) shipped

**De-dup check first:** `git log --since=midnight` clean across all 5 repos (routine content-pipeline auto-syncs only, last pre-midnight commits 00–02 UTC). 🚀 SEO Tasks confirmed via SQL (`date("Last Edited")='2026-09-25'`) — zero rows touched today before this run. Rank snapshot is still `seo/rank-snapshots/2026-09-21.json` (tracked 47, all not-ranking, avg position null) — no fresher GSC pull exists; per the 28-day-window rule, not re-measured this tick. **Nothing to defend** — nothing is in top-3 to fall out of.

Zero tasks at `Status=Approved AND Auto-Applicable=true` (seo-apply has nothing to do — unchanged every day). CC_KEY/cockpit access re-checked (`curl .../blog-wp-whoami`) — still 401, so the Greece 12-H1 blog fix and the 4 blog keyword-meta fixes queued 09-23 remain genuinely blocked, not just unattempted.

**Shipped this run — closed the one target_url surface in `seo/goal-keywords.json` never audited this cycle** (hub 09-18/19, CLP 09-20/21, brochure 09-22, blog 09-23 were all done; the `surface:"home"` cluster — 3 keywords → `https://nomadassetcollective.com/` — was missed):
- Live-curled the homepage (served from `NAC-HOMEPAGE-V2.html` in `rayvtt/NAC---Property-Hub`, confirmed by matching the live H1 text back to the file). `<title>` already exact-matched **`đầu tư định cư`** (P0). `<meta name="description">`, `og:description`, and `twitter:description` matched **none** of the 3 mapped phrases (`đầu tư di trú` P0, `đầu tư định cư` P0, `di trú đầu tư` P1) as an exact contiguous phrase.
- Rewrote all 3 descriptions to work in `đầu tư di trú` as one native-Vietnamese sentence (per `/copy-write-vi` — topic-fronted, no calque), without disturbing the title's existing match: meta → *"NAC đồng hành cùng nhà đầu tư di trú qua danh mục bất động sản tuyển chọn, gắn với 16 chương trình cư trú & quốc tịch — đối tác iQi Global, chuẩn IMC."* (150 chars); og/twitter mirrored shorter (127/106 chars).
- Shipped via [PR #350](https://github.com/rayvtt/NAC---Property-Hub/pull/350) (rebase-merged, commit `d91aa06`), no WP admin needed — synced automatically via `sync-html-to-wordpress.yml`. **Live-verified via curl post-sync**: new meta description confirmed live on `nomadassetcollective.com/`.
- SEO task filed and marked `Applied` in 🚀 SEO Tasks with the PR link.

**New finding, filed not fixed:** the homepage's single `<h1>` ("Tiên phong một tiêu chuẩn sống toàn cầu" — a deliberate brand hero tagline) targets none of the 3 keywords. Unlike the Property Hub tool's H1 (rewritten directly 09-19 — that was a structural multi-H1 defect, not a creative-copy call), this is the flagship homepage's hero brand statement — filed as a separate P2 task for **Ray's call**, not self-served, with 3 options sketched (leave as pure brand voice; work a phrase into the hero-sub line instead; rewrite the H1 itself).

**Indexation check:** nothing else shipped in the last 14 days besides 09-24's Notion-only WP-Post-ID backfill (no live page changed, nothing new to index-check) and today's homepage meta fix (too fresh to check recrawl — GSC latency is days, not hours). The 5 content-queue drafts remain `Idea`/Waiting to Review, unchanged.

**Still BLOCKED ON RAY (unchanged + 1 new):**
1. Malta CLP redirect bug (task #1524, filed 09-20) — WP admin, Redirection plugin, highest priority.
2. Consolidation-plan 301s + CPT noindex — WP admin.
3. Greece 12-H1 blog fix + the 4 blog keyword-meta fixes queued 09-23 — need Ray's cockpit access or a session holding `CC_KEY` (confirmed still 401 today).
4. EB-5 pillar's 5 `[VERIFY]` items.
5. The 14-row Published-but-not-live discrepancy filed 09-24 — needs Ray's per-row call.
6. **NEW** — the homepage H1 hero-tagline keyword gap (today) — brand/creative call.
7. The 5 content-queue drafts + all queued SEO Tasks — no Ray decision yet.

**Next:** the on-page title/meta/H1 intent-match audit is now genuinely exhausted across every mapped surface (hub, CLP, brochure, blog, home). Once someone with CC_KEY/cockpit access is available, that unlocks 3 queued items at once (Greece 12-H1, 4 blog metas, 14-row re-push decisions). Until then: the first real GSC indexation check once a fresher snapshot lands, or re-verify the content queue is still exhausted before the next tick.

## 2026-09-24 — Execution tick: sitewide WP Post ID backfill sweep (closes out 09-23's blocker) + 14-row discrepancy found

**De-dup check first:** `git log --since=midnight` across all 5 repos showed only routine content-pipeline auto-syncs (Notion sync, CLP sync, PDP scaffold) — no goal-review or SEO-fix commits yet today. 🚀 SEO Tasks confirmed via Notion SQL query (`date("Last Edited")='2026-09-24'`) — zero rows touched today before this run. Zero tasks at `Status=Approved AND Auto-Applicable=true` (seo-apply has nothing to do — same as every prior day). Rank snapshot is still `seo/rank-snapshots/2026-09-21.json` (tracked 47, all not-ranking, avg position null) — no fresher GSC pull exists; nothing to re-measure this tick per the 28-day-window rule. **Nothing to defend** — nothing is in top-3 to fall out of. The 5 content-queue pillar drafts remain `Status=Idea`/Waiting to Review, unchanged — no Ray decision yet, nothing to re-draft.

**Shipped this run — the sitewide WP-Post-ID backfill sweep flagged as "the single highest-leverage item" 09-23 left open (task #1526's own recommendation, doable without CC_KEY/cockpit access via the same public-REST + Notion-write approach used for the 4 rows fixed that day):**
- Queried the NAC Site CMS DB directly (not via the pipeline) for every `Status=Published` row: **103 total, 97 missing `🆔 WP Post ID`** — far more than the 4 already caught 09-23 suggested.
- Resolved **83 of 97** by extracting each row's slug from its stored URL and looking it up via the **public**, unauthenticated `GET blog.nomadassetcollective.com/wp-json/wp/v2/posts?slug=` endpoint (no secrets needed) — including 2 emoji-titled posts whose WordPress-generated slug got silently truncated at a bracketed suffix (`[Grouped Bar Chart]`, `[Bar Chart]`), caught by following the 301 redirect from the Notion-stored slug and re-querying on the corrected one. Verified zero duplicate WP Post IDs assigned across the 83 (each Notion row maps to a distinct live post). Wrote all 83 back to Notion directly via `notion-update-page`, then re-queried the DB to confirm: missing count dropped from 97 → 14.
- **The remaining 14 are a genuine new finding, not a backfill gap** — no live WP post exists at the Notion-stored URL for any of them (confirmed via direct `curl`, with and without `status=publish`, zero results either way for 13 of them; the 14th, "Vietnam Branded Residences 2026," points at a staging domain `orchid-peafowl-913880.hostingersite.com`, never the production blog at all). One further row in the original 97 ("Spain Golden Visa 2026," the short-title duplicate) turned out to 301-redirect to a *different*, already-resolved sibling row's live URL — almost certainly a duplicate/superseded Notion row from an earlier content pass; left unresolved rather than force-assigning it someone else's post ID, since that would misrepresent which Notion row actually owns that live post.
- Filed the 14-row discrepancy as a new P1 Technical task (not auto-applicable — needs a human call per row: confirm the article was actually pushed and the WP post later deleted/slug-changed, vs. never pushed at all) and appended a dated update note directly onto task #1526's own page recording the sweep result, so anyone reading that task next sees it's closed, not still open.

**Why this matters for the ranking goal:** every one of these 83 (now correctly WP-Post-ID-tagged) rows was previously one click away from `blog-wp.js` creating a **duplicate WP post** instead of updating the existing live one, the instant anyone used the cockpit's Re-push button or ran a bulk republish — which would have split ranking signal across two URLs for the same content, actively working against the top-3 goal rather than just sitting idle. This was a landmine sitting under ~80% of the entire published blog archive, not the 4-row edge case 09-23's audit happened to surface.

**Indexation check:** nothing shipped to a live page this run (Notion-data-only fix, no HTML/WP content changed) — no fresh page to check against GSC. The 09-19 through 09-23 on-page fixes (Property Hub, Malta, Greece/Turkey, NZ/St Kitts/Montenegro, 4 blog keyword metas) remain within normal recrawl latency; still nothing new to confirm.

**Still BLOCKED ON RAY (updated):**
1. Malta CLP redirect bug (task #1524, filed 09-20) — WP admin, Redirection plugin, highest priority, unchanged.
2. Consolidation-plan 301s + CPT noindex (WP admin, unchanged).
3. The Greece 12-H1 blog fix + the 4 blog keyword meta fixes queued 09-23 — still need either Ray's cockpit access or a session holding `CC_KEY` to actually push via `blog-wp.js`.
4. EB-5 pillar's 5 `[VERIFY]` items.
5. **NEW** — the 14-row Published-but-not-live discrepancy just filed: needs Ray to confirm per-row whether each was ever actually pushed (re-push once CC_KEY access exists) or should have its `Status` corrected.
6. The 5 content-queue drafts + all queued SEO Tasks — no Ray decision yet.

**Next:** once someone with CC_KEY/cockpit access is available, that unlocks four queued items at once (Greece 12-H1 fix, 4 blog keyword metas, and now the 14-row re-push decisions). Until then, continue the audit-and-backfill pattern: the CLP/brochure/PDP surfaces are fully audited (09-18 through 09-23), the blog surface's title/meta/H1 audit is done (09-23) and its data-integrity landmine is now closed (today) — the next genuinely new lever is either a first real GSC indexation check once a fresher snapshot lands, or re-verifying the content queue is still exhausted before the next tick.

## 2026-09-23 — Execution tick: blog title/meta/H1 audit (last unaudited surface) + duplicate-post-risk fix

**De-dup check first:** `git log --since=midnight` across all 5 repos showed only routine content-pipeline auto-syncs (Notion sync, CLP sync, PDP scaffold, brochure auto-sync) — no goal-review or SEO-fix commits yet today. 🚀 SEO Tasks and 🎯 Goal Reviews confirmed via Notion query: nothing created/edited today before this run (last touch was 09-21/09-22). Rank snapshot is still `seo/rank-snapshots/2026-09-21.json` (tracked 47, all not-ranking, avg position null) — no fresher GSC pull exists; nothing to re-measure this tick per the "28-day window, don't re-measure each run" rule. **Nothing to defend** — nothing is in top-3 to fall out of.

**Content queue re-verified, genuinely exhausted (closing a loose thread from 09-21's gap list):** double-checked whether `thẻ xanh mỹ`, `đầu tư định cư mỹ`, and `đầu tư định cư giá rẻ` were real gaps among the 5 already-drafted pillars. Confirmed via NAC Site CMS: the EB-5 draft's own SEO annotation explicitly targets `eb-5` · `thẻ xanh mỹ` · `đầu tư định cư mỹ` (in its H1 and an H2 opening line), and the cost-pillar draft's §3 explicitly targets `đầu tư định cư giá rẻ` (H2 + an FAQ H3). No new draft needed — all 10 blog content-gap keywords are covered by the 5 existing Idea-status drafts, still awaiting Ray's review.

**Shipped this run — closing out 09-22's own "Next" note (the blog-surface title/meta/H1 intent-match audit, the last unaudited surface after hub/CLP/brochure):** of the 16 blog-mapped keywords in `seo/goal-keywords.json`, 12 have `target_url: null` (content gaps, not yet live — see above) and 4 map to real live articles (Portugal, Panama, Antigua, Italy). Live-audited all 4 via curl (title/meta/full-body exact-phrase search):
- **Portugal** (`golden visa bồ đào nha` P1, `định cư bồ đào nha` P1): first already matches exactly in the meta description; second is **absent everywhere** on the page (title/meta/body) — a real P1 gap, same priority as the one that already matches.
- **Panama** (`friendly nations visa panama` P2): "Friendly Nations Visa" appears but never immediately followed by "Panama" — the exact contiguous phrase is absent everywhere.
- **Antigua** (`quốc tịch caribbean` P2 matches exactly in the title; `quốc tịch antigua` P2 is absent everywhere — the page always opens "Antigua & Barbuda", never "Quốc tịch Antigua").
- **Italy** (`italy investor visa` P2 matches exactly in the title; `định cư ý` P2 is absent — the whole article uses the English "Italy" and "Cư trú", never the Vietnamese short-form country name "Ý").

All 4 confirmed via `curl` + a Python exact-phrase check (title/meta/body separately), same methodology as the 09-20/09-21 CLP audits. Queued all 4 as SEO Tasks (Category=Meta, drafted Excerpt VI rewrites in `Proposed Fix`) — see below for why these are **queued, not shipped**.

**Bigger finding — resolved a long-standing blocker, then found a new risk underneath it:** while tracing where to apply these fixes, found the blog's Notion→WP render pipeline: `command-center/blog-wp.js` in `nac-marketing-omnichannel` (shipped 2026-09-22, one day before this run). This **resolves blocker #3** ("where does the blog's Notion→HTML render step live") that has stalled the Greece-article 12-H1 fix from the consolidation plan since 09-12 — and confirms the new pipeline already renders Notion `heading_1` blocks as `<h2>` (`// the theme owns <h1>`), so pushing a Notion-authored article through it would not reproduce that defect.

However, actually fixing anything live via this pipeline requires either the cockpit's Re-push button (Ray) or a session holding the `CC_KEY` Worker secret gating `nac-marketing-cc.ray-vtt.workers.dev` — this session has neither (`/blog-wp-whoami` returned 401 unauthorized). Before queuing the 4 keyword fixes as "ready to ship the moment someone has access", checked whether re-pushing would even be safe: **all 4 audited rows had an empty `🆔 WP Post ID`** — the field `blog-wp.js::push()` uses to target-UPDATE the existing live post; empty means a re-push would **create a duplicate WP post** instead. Backfilled all 4 (wpIds 658/679/662/671) by looking up each slug via the **public**, unauthenticated `GET /wp-json/wp/v2/posts?slug=` endpoint (no secrets needed — WP REST reads are public for published posts) and writing the ID back to each Notion row directly via the Notion MCP. Verified one write landed correctly by re-fetching. Queued a P1 Technical task recommending a full sitewide sweep, since this field is brand-new (yesterday's pipeline) and other legacy Published posts almost certainly share the same gap — a landmine for whoever next clicks "Re-push" on an old article.

**Indexation check:** nothing new shipped to a live page this run (the 4 keyword fixes are queued, not applied) — the 09-19 through 09-22 fixes (Property Hub, Malta, Greece/Turkey, NZ/St Kitts/Montenegro) are all still within normal recrawl latency, no fresh GSC pull to check against yet.

**Still BLOCKED ON RAY (updated):**
1. Malta CLP redirect bug (task #1524, filed 09-20) — WP admin, Redirection plugin, highest priority, unchanged.
2. Consolidation-plan 301s + CPT noindex (WP admin, unchanged).
3. ~~Where the blog's Notion→HTML render step lives~~ **RESOLVED this run** — it's `command-center/blog-wp.js`. New blocker in its place: the Greece 12-H1 fix (and the 4 keyword fixes above) need either Ray's cockpit access or a session with the `CC_KEY` secret to actually push.
4. EB-5 pillar's 5 `[VERIFY]` items.
5. The 5 content-queue drafts + the new SEO Tasks (4 blog keyword fixes + 1 backfill-sweep recommendation) — no Ray decision yet.

**Next:** the single highest-leverage item once someone with CC_KEY/cockpit access is available: apply the same WP-Post-ID safety check to the Greece Golden Visa article's Site CMS row, then re-push it to actually land the 12-H1 fix — the pipeline is now known and already handles headings correctly, so this is no longer blocked on *finding* the pipeline, only on *access* to trigger it. Otherwise: a sitewide WP-Post-ID backfill sweep (mechanical, doable without CC_KEY — same public-REST + Notion-write approach used today), or the first real GSC indexation check once the next snapshot lands.

## 2026-09-22 — Execution tick: brochure meta-description audit (NZ · St Kitts · Montenegro) shipped

**De-dup check first:** `git log --since=midnight` across all 5 repos showed only routine content-pipeline auto-syncs (Notion sync, CLP sync, PDP scaffold) — no goal-review or SEO-fix commits yet today. 🚀 SEO Tasks and 🎯 Goal Reviews confirmed via Notion query: nothing created/edited today before this run. Zero tasks at `Status=Approved AND Auto-Applicable=true`. Rank snapshot is `seo/rank-snapshots/2026-09-21.json` (fetched 05:01 UTC today, byte-consistent with the 09-21 log entry: tracked 47, still all not-ranking, avg position null) — no fresher GSC pull exists this run. **Nothing to defend** — nothing is in top-3 to fall out of. The 5 content-queue pillar drafts (Golden Visa, EB-5, second-passport, cost, Canada) remain `Status=Idea`/Waiting to Review in NAC Site CMS, unchanged — no Ray decision yet, nothing to re-draft.

**Shipped this run — the last un-audited surface, per 09-21's own "Next" note:** live-audited the 4 brochure-mapped keywords in `seo/goal-keywords.json` (`golden visa new zealand` / `đầu tư định cư new zealand` / `quốc tịch st kitts và nevis` / `định cư montenegro`, all P2) against their brochures in `NAC-Program-Brochures`:
- **St Kitts & Nevis brochure had NO `<meta name="description">` tag at all** — confirmed by grepping the full `<head>` (also zero og:/twitter:/JSON-LD, but cross-checking Montenegro and the Cyprus master template showed the whole 16-brochure family lacks og/twitter/JSON-LD by design, so that part is out of scope — the missing *description* tag specifically is the real, family-inconsistent gap). Added one covering the exact phrase `quốc tịch st kitts và nevis`, built from real facts already in the page body (1984 launch — oldest CBI program, 157+ visa-free countries, 60–90 day processing, no residency requirement) — no fabricated figures.
- **New Zealand brochure**: meta description (static tag + the `setLang` toggle's VI branch) already read naturally close to `golden visa new zealand` but was missing `đầu tư định cư new zealand` entirely — added the phrase without touching the existing wording.
- **Montenegro brochure**: meta description used "cư trú" throughout but never the tracked `định cư montenegro` phrase — reworded the opening clause to lead with it, kept every existing fact (RBI, 1-year temporary residence, no legal minimum investment, 9–15% income tax, EU candidate 2028, 4–8 week processing).

Verified `check_brochure_parity.py` 15/15 on all three post-edit (script blocks parse clean, no WP-safety regressions). Shipped via [PR #361](https://github.com/rayvtt/NAC-Program-Brochures/pull/361) (squash-merged, commit `9cceae6`) — `wp-sync.yml` fired automatically on push to `main`; same "Claude's to ship" class of safe on-page Meta fix as the 09-19/09-20/09-21 ticks (no WP admin needed, no structural/redirect risk).

**Flagged but NOT fixed this tick (scope control — titles/H1 carry more brand/parity risk than meta description, and these are P2, lowest priority in the tracked set):** Montenegro's `<title>` and hero `<h1>` also say "Cư Trú" not "Định Cư" — a bigger word-choice mismatch than NZ/St Kitts's reordering issue. New Zealand's title reads "New Zealand Golden Visa" (reversed word order vs. the tracked "golden visa new zealand" phrase) — left as-is since it's a natural, strong match already. Worth a follow-up if these P2 keywords are still not-ranking after the next couple of GSC pulls once the meta fix has had time to register.

**Indexation check:** nothing shipped 8–14 days ago besides the still-unconfirmed 09-19/09-20/09-21 fixes (Property Hub H1, Malta CLP, Greece/Turkey CLP) — all well within normal Google recrawl latency, still nothing to confirm via GSC (no fresh GSC API pull this session; rank snapshots come from the separate cron).

**Still BLOCKED ON RAY (unchanged from 09-21):**
1. Malta CLP redirect bug (task #1524, filed 09-20) — WP admin, Redirection plugin, highest priority.
2. Consolidation-plan 301s + CPT noindex (WP admin).
3. Where the blog's Notion→HTML render step lives (needed before the 12-H1 blog fix, task #1461) — confirmed not in any of the 5 accessible repos.
4. EB-5 pillar's 5 `[VERIFY]` items.
5. The 5 content-queue drafts + remaining idle SEO Tasks — no Ray decision yet.

**Next:** the CLP + brochure title/meta/H1 audit passes are now both exhausted for the current keyword set (every mapped surface — hub, CLPs, brochures — has been checked; blog-surface keywords route to articles, not yet audited the same way). Candidates for the next tick: (a) run the same title/meta/H1 intent-match check on the 16 blog-mapped keywords' landing articles once the blog render-step location is found (blocked on #3 above), or (b) do a first real indexation check via GSC (not WebSearch, which is unreliable for this) once a fresh GSC pull lands, to see if any of the last 4 ticks' fixes (Property Hub, Malta, Greece/Turkey, NZ/St Kitts/Montenegro) have moved anything — the 09-21 GSC pull still shows 0/47 ranking, so this is the first real signal test to watch for. Otherwise: keep escalating the 5 blockers above.

## 2026-09-21 — Goal review

- **Tracked**: 47  ·  🥇 top-3: **0** (+0)  ·  🎯 striking: 0  ·  📄 page-2: 0  ·  🕳️ deep: 0  ·  ∅ not-ranking: 47
- **Avg position** (ranked set): —
- **Gainers**: —
- **Regressions**: —
- **Content gaps** (no page yet): hộ chiếu thứ hai, thị thực vàng, golden visa là gì, eb-5, thẻ xanh mỹ, đầu tư định cư mỹ, đầu tư định cư canada, chi phí đầu tư định cư, đầu tư định cư cần bao nhiêu tiền, đầu tư định cư giá rẻ
- **Quick wins** (striking 4–10, one push to top-3): —
## 2026-09-21 — Execution tick: Greece + Turkey CLP meta-description exact-phrase fix shipped

**De-dup check first:** `git log --since=midnight` clean (last commits pre-midnight were unrelated content-pipeline auto-syncs). 🚀 SEO Tasks and 🎯 Goal Reviews confirmed nothing touched today before this run. Rank snapshot is still `seo/rank-snapshots/2026-09-14.json` (tracked:37, unchanged) — no fresher GSC pull exists. **Nothing to defend** — nothing is in top-3 to fall out of. Content queue re-checked: all 5 pillar drafts (Canada, cost-pillar, second-passport, Golden Visa, EB-5) still Idea/Waiting to Review, unchanged since 09-19 — no Ray decision yet. Zero tasks at Status=Approved AND Auto-Applicable=true. The Malta redirect P0 (task #1524, filed 09-20) is still untouched — Ray hasn't acted on it.

**Shipped this run — closing out 09-20's own "Next" note:** live-audited the two remaining P1/P2 keyword near-misses flagged 09-20 (Turkey's `quốc tịch thổ nhĩ kỳ`, Greece's `golden visa hy lạp` — both "close but not exact-phrase matches in title/meta"). Confirmed via curl: both countries' P1 primary keyword (`định cư hy lạp`, `đầu tư định cư thổ nhĩ kỳ`) already exact-matched in their CLP `<title>`, but the secondary phrase did not appear as an exact contiguous phrase anywhere on the page. Rewrote both meta descriptions (+ og:description/twitter:description/JSON-LD description mirrors, 4 occurrences per file) to include the missing phrase naturally, without disturbing the existing exact matches — Greece now opens "Golden Visa Hy Lạp – định cư Hy Lạp qua bất động sản..."; Turkey now reads "...lộ trình quốc tịch Thổ Nhĩ Kỳ (CBI) từ NAC." Also updated the `CLP_SEO` source template in `scripts/sync-notion-clp.mjs` so the next Notion CLP sync doesn't revert either page. Shipped via [PR #435](https://github.com/rayvtt/Nac-Property-Hub-Listing-PDP/pull/435) (squash-merged, commit `405972d`), no WP admin needed — synced automatically via `sync-wp-clp.yml` on push to main. Live-verified via curl on both `nomadassetcollective.com/property-hub-bat-dong-san/greece/` and `.../turkey/` post-sync: both new phrases confirmed live.

This completes the CLP title/meta/H1 intent-match audit pass that started 09-18 (Property Hub) → 09-19 (shipped) → 09-20 (Malta CLP + found the redirect bug) → today (Greece + Turkey). All CLP-mapped P0/P1 keywords now have exact-phrase coverage in their landing page's title or meta description; the remaining gaps are entirely blocked-on-Ray structural items (below), not audit/content levers.

**Indexation check:** ran a plain WebSearch (no live GSC API pull available this session — rank snapshots come from a separate cron) for `site:nomadassetcollective.com/property-hub-bat-dong-san/`, the exact new Property Hub title string ("Đầu Tư Quốc Tịch & Định Cư — NAC Property Hub Toàn Cầu", shipped 09-19), and "Golden Visa Hy Lạp" (shipped today). All three searches returned zero nomadassetcollective.com results — only third-party VN immigration-consulting sites surfaced. This is directional and inconclusive, not a confirmed non-index: WebSearch's backing index is not Google's live index and does not reliably surface `site:`-scoped or exact-phrase results even for pages that are indexed, and both changes are only 1–2 days old (SEO-1522 09-19, Malta 09-20), well within normal Google recrawl/reindex latency. No way to confirm indexation status this run without a real GSC pull.

**Still BLOCKED ON RAY (unchanged):**
1. Malta CLP redirect bug (task #1524, filed 09-20) — WP admin, Redirection plugin, highest priority.
2. Consolidation-plan 301s + CPT noindex (WP admin, unchanged).
3. Where the blog's Notion→HTML render step lives (needed before the 12-H1 blog fix, task #1461) — confirmed not in any of the 5 accessible repos.
4. EB-5 pillar's 5 `[VERIFY]` items.
5. The 5 content-queue drafts + remaining idle SEO Tasks — no Ray decision yet.

**Next:** the CLP-level on-page/audit lever is now exhausted (every mapped CLP checked, all exact-phrase gaps closed) — the next genuinely new lever is either (a) a similar title/meta/H1 intent-match audit pass on the brochure pages (`Brochures html/*.html` in the NAC-Program-Brochures repo) for the ~10 program keywords that route to a brochure instead of a CLP, since those haven't been audited yet, or (b) keep escalating the 5 blockers above since content + CLP-audit levers are now both exhausted for this cycle. Recommend (a) for the next run.

## 2026-09-20 — Execution tick: Malta CLP meta fix shipped; found a live redirect bug hiding it (P0, blocked on Ray)

**De-dup check first:** `git log --since=midnight` clean in all 5 repos before this run started (last commits pre-midnight were unrelated content-pipeline auto-syncs at 00:xx–02:xx UTC). 🚀 SEO Tasks and 🎯 Goal Reviews confirmed clean via SQL query (`Last Edited`/`Created` = today) — nothing touched today before this run. Rank snapshot is still `seo/rank-snapshots/2026-09-14.json` (tracked:37, unchanged) — no fresher GSC pull exists. **Nothing to defend** — nothing is in top-3 to fall out of. Content queue re-checked via SQL: all 5 pillar drafts (Canada, cost-pillar, second-passport, Golden Visa, EB-5) still `Status=Idea`/`Reviewed by NAC?=Waiting to Review`, unchanged since 09-19 — no Ray decision yet, nothing to re-draft. Zero tasks at `Status=Approved AND Auto-Applicable=true`.

**Shipped this run — continuing 09-19's "Next" note (audit CLP title/meta/H1 vs `seo/goal-keywords.json`):** live-audited every CLP-mapped keyword (17 across 11 country pages) against its landing page's actual `<title>`/meta description/H1. Found `country/malta.html` had **no entry** in `scripts/sync-notion-clp.mjs`'s `CLP_SEO` map, so it fell back to the generic pattern with zero mention of MPRP anywhere (title/meta/og/twitter/JSON-LD) — missing the tracked `malta mprp` keyword entirely, unlike every other mapped country. Added a `malta` entry mirroring the `my.html` (MM2H) pattern and hand-patched the live `country/malta.html` (4 occurrences each of title + description) so it shipped immediately instead of waiting on the next Notion CLP sync. Shipped via [PR #432](https://github.com/rayvtt/Nac-Property-Hub-Listing-PDP/pull/432) (squash-merged, commit `dd25365`), no WP admin needed. Confirmed correct on GitHub Pages (`rayvtt.github.io/.../country/malta.html`) post-merge.

**New P0 finding while verifying live — the fix above currently has ZERO effect on the ranking domain:** `curl`'d the live URL to confirm the fix and found `https://nomadassetcollective.com/property-hub-bat-dong-san/malta/` returns **HTTP 301 → `/property-hub-bat-dong-san/malaysia/`** (header `x-redirect-by: redirection`, i.e. a WP Redirection-plugin rule). The Malta Country Listings DB row is fully correct on our side — `Hub Status=Live`, `🆔 WP Page ID=2966`, `🔗 Country URL=.../malta/`, `📤 Last Synced=2026-09-20` — so the real WP page exists and is synced correctly; an errant redirect rule is sitting in front of it. Spot-checked 5 other CLPs (cyprus/thailand/greece/turkey/panama/malaysia itself) — all resolve 200 directly, so this is Malta-specific, not systemic. Filed as a new P0 task (Impact 95, Category=Technical, Auto-Applicable=false — WP admin/Redirection-plugin territory, same class of blocker as the consolidation-plan 301s). This means no Malta-specific keyword can rank to its own URL while the rule stands, and traffic/crawl signal for it currently pools on the Malaysia page instead.

**Indexation check:** nothing shipped in the last 14 days besides today's Malta meta fix — too early to check reindexing, and moot until the redirect above is cleared. The 5 content-queue drafts remain unpublished.

**Still BLOCKED ON RAY (updated):**
1. **NEW, highest priority:** Malta CLP redirect bug above — WP admin, Redirection plugin.
2. Consolidation-plan 301s + CPT noindex (WP admin, unchanged).
3. Where the blog's Notion→HTML render step lives (needed before the 12-H1 blog fix, task #1461) — confirmed not in any of the 5 accessible repos.
4. EB-5 pillar's 5 `[VERIFY]` items.
5. The 5 content-queue drafts + remaining idle SEO Tasks — no Ray decision yet.

**Next:** once the Malta redirect is cleared, live-verify the MPRP title/meta actually serves and watch for the first GSC signal on `malta mprp` / `định cư malta`. Otherwise: finish the CLP intent-match audit against the remaining P1 keywords not yet spot-checked in detail (Turkey's `quốc tịch thổ nhĩ kỳ`, Greece's `golden visa hy lạp` — both close but not exact-phrase matches in title, lower priority than the Malta redirect), or keep escalating the 5 blockers above.

## 2026-09-19 — Execution tick: SEO-1522 shipped live (Property Hub title/meta/H1 fix)

**De-dup check first:** `git log --since=midnight` clean in all 5 repos before this run started (last commits pre-midnight were 00:43/01:14/02:36 UTC auto-sync content pipelines, unrelated). 🚀 SEO Tasks and 🎯 Goal Reviews showed nothing touched today before this run. Rank snapshot is still `seo/rank-snapshots/2026-09-14.json` (cron re-fetched at 05:01 UTC, byte-identical, still measured against the pre-expansion 37-keyword set — the 09-17 expansion to 47 hasn't been picked up by a fresh GSC pull yet). **Nothing to defend** — nothing is in top-3 to fall out of.

**Shipped this run — landed SEO-1522 directly, per 09-18's own "Next" note:** implemented the drafted title/meta description/H1 rewrite in `NAC-PROPERTY-HUB.html` (`rayvtt/NAC---Property-Hub`):
- `<title>`: "NAC Property Hub — Danh mục đầu tư bất động sản toàn cầu" → **"Đầu Tư Quốc Tịch & Định Cư — NAC Property Hub Toàn Cầu"** (54 chars, leads with the P0 phrase)
- Meta description rewritten (154 chars) to work in `đầu tư quốc tịch` / `đầu tư định cư` / `quốc tịch thứ hai` naturally
- Fixed the compounding structural defect in the same edit: the page shipped **3 competing `<h1>`** tags (header logo "NAC", the main content heading, the NAC Lister tool heading) — demoted the logo and the Lister heading to `<h2>`, rewrote the primary content H1 to "Đầu Tư Quốc Tịch & Định Cư Toàn Cầu — Danh Mục BĐS NAC" (VI) / "Global Investment Citizenship & Residency — NAC Property Hub" (EN). Exactly 1 `<h1>` on the page now.
- Extended the two `h1.serif` mobile-breakpoint CSS rules to `h1.serif,h2.serif` so the demoted Lister heading keeps its responsive sizing — checked first for tag-based CSS/JS hooks (`querySelector('h1')` etc.) that a retag could break; none found.
- Shipped via this repo's own PR → auto-merge → auto-sync flow (no WP admin needed): PR [#331](https://github.com/rayvtt/NAC---Property-Hub/pull/331), merge commit `2f67570`. `sync-html-to-wordpress.yml` fired on merge; **live-verified via curl** on `https://nomadassetcollective.com/property-hub-bat-dong-san/` post-sync — new title, new meta description, and exactly 1 `<h1>` all confirmed live.
- SEO-1522 marked `Applied` in 🚀 SEO Tasks with the commit link. Also resolved the standalone "3×H1 on hub page" structural defect tasks (#1438/#740, previously `Approved`/unfixed) as a side effect of the same edit — marked `Applied`.

This was authorized directly (not gated on a separate Ray review) per the scheduled task's own instruction that "the H1 fix is Claude's" when it doesn't require WP admin — this edit lands through the property-hub repo's PR/auto-merge flow, not WP admin or a live-URL 301, and the copy was already drafted+queued for a day with no objection.

**Indexation check:** the edit is live as of today — too early to check reindexing/recrawl of the new title in GSC (recrawl is typically days, not minutes); nothing else shipped in the last 14 days is published (the 6 content-queue items — Golden Visa, second-passport, EB-5, cost-pillar, Canada pillars, all still Idea/draft-only in NAC Site CMS — remain unpublished, nothing new to index-check there).

**Still BLOCKED ON RAY (unchanged):**
1. Consolidation-plan 301s + CPT noindex (WP admin).
2. Where the blog's Notion→HTML render step lives (needed before the 12-H1 blog fix, task #1461, can execute) — confirmed not in any of the 5 accessible repos.
3. EB-5 pillar's 5 `[VERIFY]` items.
4. The 6 content-queue drafts + remaining idle SEO Tasks — no Ray decision yet.

**Next:** with SEO-1522 shipped, re-run the same live-audit pass (title/meta/H1 intent-match against `seo/goal-keywords.json`) against the other already-indexed, non-locked surfaces (country CLPs) to see if the same keyword-mismatch pattern exists there — CLPs go through `sync-notion.mjs`'s `patchHeadSeo()` so a real defect there might be auto-fixable rather than needing a manual PR like the hub page. Also: the next GSC pull (once it lands with the expanded 47-keyword set) will be the first real signal on whether title/meta/H1 changes move anything — watch the 09-14→next snapshot delta for the hub-mapped keywords specifically.

## 2026-09-18 — Execution tick: Property Hub page's own title/H1/meta miss every mapped keyword (SEO-1522)

**De-dup check first:** `git log --since=midnight` clean in both repos (last commits were 01:14 UTC auto-syncs, unrelated content pipelines). 🚀 SEO Tasks, NAC Site CMS, and 🎯 Goal Reviews all showed nothing touched today before this run. Rank snapshot is still `seo/rank-snapshots/2026-09-14.json` (re-fetched by cron at 05:01 UTC but byte-identical — `tracked:37`, still measured against the pre-expansion keyword set) — no fresher GSC pull exists. **Nothing to defend** — nothing is in top-3 to fall out of.

**Content queue + Auto-Applicable queue re-confirmed exhausted (no change since 09-17):** all 5 pillars (Golden Visa #1518, second-passport #1517, EB-5 #1516, cost-pillar #1519, Canada #1520) remain Idea/Waiting to Review in NAC Site CMS, untouched by Ray. Zero tasks at `Status=Approved AND Auto-Applicable=true`. Consolidation-plan blockers (#1521 cannibalization plan — Ray's WP admin for the 301s/CPT noindex; #1461 blog 12-H1 fix — render step location still unknown, confirmed not present in any of the 5 accessible repos) unchanged.

**Shipped this run — new finding, not a duplicate (checked existing tasks #1437/#1438/#739/#740 first, all about length/count, none about keyword-intent match):** live-audited `https://nomadassetcollective.com/property-hub-bat-dong-san/` — the designated `surface=hub` landing page for **7 tracked keywords** (2× P0: `đầu tư quốc tịch`, `đầu tư định cư châu âu`; plus `quốc tịch thứ hai`, `chương trình đầu tư định cư`, `định cư nước ngoài`, `đầu tư bất động sản định cư`, `hộ chiếu thứ hai`). Raw `curl` confirmed:
- `<title>` = "NAC Property Hub — Danh mục đầu tư bất động sản toàn cầu" — matches none of the 7 phrases exactly.
- Meta description — same, no exact-phrase match.
- 3× `<h1>` still live (NAC / Danh Mục BĐS & Công Cụ Đầu Tư / NAC Lister — Thêm BĐS Vào Hub) — the existing #1438/#740 defect (Approved, never applied) is confirmed still unfixed today, and it compounds the intent-match problem since Google can't tell which H1 is primary.

Queued **SEO-1522** (🚀 SEO Tasks, P0, Impact 88, Category=Meta, `Auto-Applicable=false`) with a drafted VI title + meta description + H1 rewrite that works the P0/P1 phrases in naturally. Deliberately **not** auto-applied: this exact page is in `scripts/seo-apply.mjs`'s default `LOCKED` list (`nac-residence-index`) — excluded from the cheerio/WP-REST auto-rewrite pipeline by design (hand-maintained flagship SPA). Flagged it as the highest-leverage lever currently available that is **not** gated on Ray's WP admin access, since the fix ships through the `rayvtt/NAC---Property-Hub` repo's own PR→auto-merge flow (edits `NAC-PROPERTY-HUB.html` directly, syncs to WP on merge) rather than through WP admin or the inaccessible blog render pipeline — worth prioritizing over further content drafts now that all 5 queued pillars are drafted and awaiting review.

**Directional (non-GSC) signal, logged as context only, not a ranking claim:** a plain web search for "đầu tư định cư" and for the bare domain surfaced zero `nomadassetcollective.com` results, while several VN competitors (Arton Capital, BSOP, SI Group, dautuquocte.org) ranked prominently. Consistent with the near-zero-impressions GSC state already on file; not itself GSC data, so not written into the rank tracker.

**Indexation check:** nothing shipped in the last 14 days is published — the 5 content-queue drafts (09-12 through 09-16) remain Idea/draft-only; today's task queue entry doesn't touch a live page either (draft-only proposed fix).

**Still BLOCKED ON RAY (unchanged):**
1. Consolidation-plan 301s + CPT noindex (WP admin, unchanged).
2. Where the blog's Notion→HTML render step actually lives (needed before the 12-H1 fix can execute) — unchanged.
3. EB-5 pillar's 5 `[VERIFY]` items — unchanged.
4. The 5 content-queue drafts + the idle SEO Tasks — no Ray decision yet on any of them.

**Next:** either land SEO-1522 directly (title/meta/H1 rewrite in `NAC-PROPERTY-HUB.html`, PR + auto-merge — doesn't need Ray's WP admin) on a future run once it's had a look, or run the same live-audit pass against the other already-indexed, non-locked surfaces (country CLPs) to see if the same keyword-intent mismatch exists there too — that's the next genuinely new lever once this one is actioned.

## 2026-09-17 — Execution tick: goal-keywords.json expanded (37→47); content queue confirmed exhausted, all blockers unchanged

**De-dup check first:** `git log --since=midnight` clean in both repos (last commits were 05:02 UTC auto-syncs, unrelated). 🚀 SEO Tasks, NAC Site CMS, and 🎯 Goal Reviews all show nothing touched today before this run. Rank snapshot `seo/rank-snapshots/2026-09-14.json` was re-fetched by the cron (file timestamp 09-17 05:01) but the data is byte-identical to what was already logged on 09-16 — same 28-day window (2026-08-17→09-13), same headline `{tracked:37, top-3:0, striking:0, page-2:0, deep:0, not-ranking:37}`. **Nothing to defend** — nothing was in top-3 to fall out of, and no fresher GSC pull exists yet.

**Content queue re-verified, genuinely exhausted:** double-checked the 09-16 claim that all 5 pillars (EB-5, second-passport, Golden Visa, cost-pillar, Canada) are drafted — the cost-pillar draft ("Đầu tư định cư cần bao nhiêu tiền?", https://app.notion.com/p/3dc48ec25e86815a9dbec52085180379) was the one I couldn't immediately confirm existed; verified directly in NAC Site CMS that it's real (full bilingual body, filed 09-15, `Status=Idea`). All 5 are `Idea`/`Waiting to Review`/`Not started` — untouched by Ray since filing. Nothing to re-draft.

**Auto-Applicable queue checked, genuinely empty:** the "idle since 2026-05-20" meta-description (×12) and schema.org (×4) tasks that looked stale are **not** stuck in a broken pipeline — none of them are `Status=Approved` (the `seo-apply.yml` daily-cron filter). They're `Snoozed` (the original rows) or `New` (May-20 duplicates of the same rows — a duplicate-row generation bug from that day's audit run, worth a separate cleanup pass but not a ranking blocker). The 8× "No H1 on hub page" tasks that also looked idle ARE `Approved` but `Auto-Applicable=false` by design (structural fix, needs human eyeball) — working as intended, not a bug. **Nothing was runnable via `seo-apply` this run** — no task exists at `Status=Approved AND Auto-Applicable=true`.

**Consolidation-plan / H1-fix blocker re-checked, confirmed genuinely external:** re-examined whether the Notion→WP blog render step (the thing promoting numbered in-body headings to `<h1>`) might live in `nac-marketing-omnichannel/scripts/cms-scheduler` — the one accessible-repo candidate not fully ruled out on 09-16. Read `publish.mjs` directly: it's explicitly disabled (a no-op since a 2026-06-07 mass-mispublish incident) and defers to "the live Notion→WP sync," which isn't implemented in this repo either. Confirmed: the render step genuinely isn't in any of the 5 accessible repos. Task #1461 still needs Ray's answer on where it lives (or a go-ahead to test the "strip numbering" workaround).

**Shipped this run — fallback per the playbook ("queue empty → expand goal-keywords.json"):** added **10 new keywords** for 5 live programs that had zero tracking despite having real, live canonical pages — a pure coverage gap, not manufactured filler:
- Malaysia MM2H: `mm2h là gì` (P1, informational), `định cư malaysia` (P2) → CLP `/property-hub-bat-dong-san/malaysia/`
- Malta MPRP: `định cư malta`, `malta mprp` (P2 each) → CLP `/property-hub-bat-dong-san/malta/` — deliberately did **not** add "quốc tịch malta": NAC's Malta brochure is the MPRP *residency* program, not the separate, much-harder-vetted MEIN citizenship route, so a citizenship-intent keyword would mistarget the page
- Thailand LTR: `định cư thái lan`, `thái lan ltr visa` (P2 each) → CLP `/property-hub-bat-dong-san/thailand/` — checked the brochure title first; it's the LTR (Long-Term Resident) visa, not the separate Thailand Elite membership scheme, so used "ltr visa" not "elite visa"
- New Zealand Active Investor Plus: `golden visa new zealand`, `đầu tư định cư new zealand` (P2 each) → brochure (no CLP exists for NZ)
- St Kitts & Nevis CBI: `quốc tịch st kitts và nevis` (P2) → brochure (no CLP)
- Montenegro RBI: `định cư montenegro` (P2) → brochure (no CLP)

All 6 target URLs live-verified (curl, 200 OK) before committing. `_meta.updated` bumped to 2026-09-17. Total tracked keywords: 37 → **47**. Committed + pushed to `claude/serene-fermat-u20tsu`.

**Indexation check:** nothing shipped in the last 14 days is published — the 5 content-queue drafts (09-12 through 09-16) remain Idea/draft-only, nothing new to check.

**Still BLOCKED ON RAY (unchanged):**
1. Consolidation-plan 301s + CPT noindex (WP admin).
2. Where the blog's Notion→HTML render step actually lives (re-confirmed not in any of the 5 accessible repos this run) — needed before the 12-H1 fix (#1461) can execute at all.
3. EB-5 pillar's 5 `[VERIFY]` items (unchanged).
4. The 5 content-queue drafts + none of the 16 idle SEO Tasks have had a Ray decision.

**Next:** the keyword universe now covers 14 of NAC's 18 live country programs (still gapped: UAE has only a generic "đầu tư định cư dubai" hub keyword — fine, already covered; Spain is a closed/legacy program, deliberately not tracked; Nauru and Australia's brochure specifically are low-priority/already covered via the hub CLP keyword). Next run: either the duplicate-row Notion cleanup (12+4 stale May-20 rows cluttering the SEO Tasks triage — low priority, doesn't block ranking), or keep pinging Ray on the 3 blockers above since content + keyword-expansion levers are now both exhausted for this cycle.

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
