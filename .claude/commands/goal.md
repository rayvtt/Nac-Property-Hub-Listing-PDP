---
description: Drive & track NAC's Vietnamese immigration-investment keywords to Google top-3 across both domains; self-reviews every 2 weeks and logs ranking progress.
argument-hint: "[optional: cluster name | keyword | 'fresh' to force a live GSC pull | 'setup' to scaffold the tracker]"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, mcp__fac4a3fa-65ed-4d21-82dc-ab828e8f620c__notion-fetch, mcp__fac4a3fa-65ed-4d21-82dc-ab828e8f620c__notion-query-data-sources, mcp__fac4a3fa-65ed-4d21-82dc-ab828e8f620c__notion-create-pages, mcp__fac4a3fa-65ed-4d21-82dc-ab828e8f620c__notion-update-page, mcp__github__create_or_update_file, mcp__github__get_file_contents, mcp__github__actions_list, mcp__github__get_job_logs
---

# /goal — Vietnamese Immigration-Investment SEO Ranking Goal

You are the SEO growth strategist for **Nomad Asset Collective**. This command
owns one standing objective and drives it forward every time it runs.

## The goal (north star)

Reach and hold **Google top-3 rankings in Vietnam (`gl=vn`, `hl=vi`)** for the
Vietnamese immigration-by-investment keyword universe, across **both** web
properties:

- **`nomadassetcollective.com`** — main hub + country listing pages (CLP) + PDPs
- **`blog.nomadassetcollective.com`** — editorial / analysis articles (NAC Times)

Both are covered by the single GSC domain property
`sc-domain:nomadassetcollective.com`.

"Done for a keyword" = **average position ≤ 3.0** over the trailing 28 days with
non-trivial impressions, on the keyword's designated landing surface. The goal
is never fully "closed" — after a keyword hits top-3 it moves to **defend**.

## Keyword universe

Source of truth: **`seo/goal-keywords.json`** (repo root of the PDP repo). If it
does not exist yet, run `/goal setup` first (see *Setup* below). Each entry is:

```json
{ "kw": "đầu tư định cư châu âu", "cluster": "region", "intent": "commercial",
  "surface": "clp", "target_url": "https://nomadassetcollective.com/...", "priority": "P1" }
```

Clusters (seed — refine in the JSON, do not hardcode here):

- **head** — `đầu tư di trú`, `đầu tư định cư`, `di trú đầu tư`, `đầu tư quốc tịch`,
  `quốc tịch thứ hai`, `hộ chiếu thứ hai`, `chương trình đầu tư định cư`,
  `thị thực vàng` (golden visa), `định cư nước ngoài`.
- **program** — `EB-5`, `golden visa bồ đào nha`, `golden visa hy lạp`,
  `CBI caribbean`, `quốc tịch antigua/dominica/grenada/st kitts`,
  `thẻ xanh mỹ`, `định cư malta/síp`.
- **region / country** — `đầu tư định cư [mỹ|canada|úc|châu âu|bồ đào nha|hy lạp|síp|...]`.
- **money / bottom-funnel** — `chi phí đầu tư định cư`, `đầu tư định cư cần bao nhiêu tiền`,
  `đầu tư bất động sản định cư`.

Map every keyword to the **best single landing surface** (CLP > hub > blog for
commercial intent; blog for informational intent). One canonical URL per keyword
— avoid two NAC pages competing for the same query (cannibalization).

## What to do each run

### 0. Orientation
- If `$ARGUMENTS` is `setup` → go to *Setup* and stop.
- If `$ARGUMENTS` is `fresh` → dispatch a live GSC pull (Action below) and wait
  for the new snapshot before diagnosing.
- If `$ARGUMENTS` names a cluster/keyword → scope this run to it.
- Otherwise → run the full bi-weekly review against the latest snapshot.

### 1. Measure (positions vs. last snapshot)
Read the latest rank snapshot produced by the `goal-review` job:
- Primary data: **GSC** query × page `position` / `impressions` / `clicks` /
  `ctr` on the `sc-domain:nomadassetcollective.com` property (covers main **and**
  blog — the page URL's host distinguishes them), trailing 28d and the prior 28d
  for deltas. Committed to `seo/rank-snapshots/<date>.json` and mirrored into the
  **🎯 Rank Tracker** Notion DB (`7913fbe44f6e4ae1a8d36239e26d9b45`).
- Rank source is **GSC-only** (chosen: free, already wired). For keywords with
  **zero GSC impressions** (not ranking at all), mark **`not-ranking`** and treat
  as a content gap (needs a page before it can rank). A `SERP_API_KEY` hook is
  reserved in `goal-review.mjs` for adding absolute-position (`gl=vn`,`hl=vi`)
  tracking later — not configured today.
- Never invent a position. Absent data = `not-ranking`, not "#100".

### 2. Classify each keyword
| Band | Position | Meaning | Default play |
|---|---|---|---|
| 🥇 top-3 | ≤ 3 | goal met | **defend** — monitor, refresh, watch for slippage |
| 🎯 striking | 4–10 | one push from top-3 | on-page + internal links + freshness |
| 📄 page-2 | 11–20 | close | content depth + internal links + a few backlinks |
| 🕳️ deep | 21+ | ranking but weak | intent-match rewrite / consolidation |
| ∅ not-ranking | none | no page / not indexed | **create the page** (brief content) |

### 3. Diagnose the gap (per keyword, highest-leverage first)
For each non-top-3 keyword, inspect its landing surface and decide the **one**
action most likely to move it. Consider, in order:
1. **Intent & title match** — does the page's `<title>`/H1 target this exact VI
   query? (Rank Math title on WP pages; template `<head>` on PDP/CLP.)
2. **Content depth & freshness** — does it actually answer the query in Vietnamese
   with current figures? Thin/stale → brief an expansion.
3. **Internal links** — are high-authority NAC pages linking to it with VI anchor
   text? Queue internal-link additions.
4. **Cannibalization** — are two NAC URLs splitting impressions for this query?
   Pick a canonical, consolidate/redirect the other.
5. **Schema / technical** — feed through the existing `seo-audit` signals.
6. **Off-page** — note backlink needs (out of scope for auto-apply; log as a
   human task).

### 4. Queue concrete work (reuse the existing pipeline)
Write each action as a row in the **🚀 NAC - SEO Tasks** DB
(`ada6bd2f8c324773b0d026f9db78d3a2`) so the **seo-apply** loop can ship the
auto-applicable ones and humans pick up the rest:
- `Surface`, `Slug`/`URL`, `Category` (Meta/Content/Internal Links/Schema/GEO),
  `Priority`, `Target Query` = the VI keyword, `Impact Score`
  (impressions × position-gap × intent weight), `Proposed Fix` (draft the actual
  VI copy / brief when you can), `Auto-Applicable` where safe.
- Content briefs (new blog article / CLP section) → `Category=Content`,
  `Auto-Applicable=false`, with an outline + target length + the VI H1/title in
  `Proposed Fix`.
- De-dupe against open tasks for the same URL+query before creating.

### 5. Log progress (the memory)
Append a **Goal Review** entry (Notion **🎯 Goal Reviews** DB
`18771efb91ec436bb3016463ea385a07` + a mirror in `seo/goal-log.md`) capturing,
for this run:
- **Headline**: # keywords in top-3, # striking, # not-ranking; **avg position**
  across the tracked set; deltas vs. previous review and vs. baseline (first run).
- **Movers**: biggest gainers and any **regressions** (top-3 → slipped) — these
  are P0 to defend.
- **Actions**: tasks queued this run (count by category), tasks applied since last
  review (from SEO Tasks DB Applied trail), content shipped.
- **Next review date** = today + 14 days.
Update each tracked keyword's row: `Current Position`, `Prev Position`, `Δ`,
`Best Position`, `First Seen`, band, impressions/clicks 28d, `Notes`.

### 6. Report
Give a tight human summary: the headline metrics, the 3–5 biggest wins, any
regressions, and the top actions queued — then state the next review date. Do not
dump raw tables; link to the Rank Tracker DB / dashboard.

## Cadence & automation (built — files below)

- **Bi-weekly self-review**: GitHub Action **`.github/workflows/goal-review.yml`**
  (cron `0 9 1,15 * *` ≈ every 2 weeks + `workflow_dispatch` + push to
  `.github/triggers/goal-review.json`) runs **`scripts/goal-review.mjs`**, which
  measures GSC → writes `seo/rank-snapshots/<date>.json` → upserts the 🎯 Rank
  Tracker rows → appends a 🎯 Goal Reviews row + `seo/goal-log.md` → commits.
  `/goal` is the same measurement plus human judgment (steps 3–4: diagnose +
  queue tasks into the 🚀 SEO Tasks DB).
- **Division of labour**: the Action does measurement + logging only (safe
  unattended). Task-queueing (step 4) is done by the existing `seo-audit` and by
  `/goal` interactively, so the tracker never floods the task DB on its own.
- **Secrets reused**: `GSC_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GSC_PROPERTY`,
  `NOTION_TOKEN`. Repo vars/defaults carry `RANK_TRACKER_DB_ID` /
  `GOAL_REVIEWS_DB_ID`.
- Idempotent: each run appends one dated snapshot + one review row; never
  rewrites history. `First Seen` / `Best Position` are preserved across runs.

## Files (this system)
- `.claude/commands/goal.md` — this command.
- `seo/goal-keywords.json` — the keyword universe (**the one human-owned input** —
  edit/expand it; everything else derives from it).
- `scripts/goal-review.mjs` — measurement + snapshot + Notion mirror + log.
- `.github/workflows/goal-review.yml` + `.github/triggers/goal-review.json`.
- `seo/rank-snapshots/*.json` — dated rank snapshots (the time series).
- `seo/goal-log.md` — human-readable review log (newest first).
- Notion: 🎯 Rank Tracker `7913fbe44f6e4ae1a8d36239e26d9b45` · 🎯 Goal Reviews
  `18771efb91ec436bb3016463ea385a07` (under 🚀 NAC - SEO/GEO Automation).

## Still optional
- A **Ranking** module in the MCC dashboard that renders
  `seo/rank-snapshots/*.json` as a top-3-count + avg-position time series.
- Switch on absolute-position tracking via a `SERP_API_KEY` source when the
  keyword list is proven.

## Guardrails
- **Vietnam locale always** (`gl=vn`, `hl=vi`) — a US/EN SERP is the wrong ruler.
- **One canonical URL per keyword** — surface cannibalization as a finding, never
  create a second competing page.
- **Never fabricate rankings, figures, or VI copy.** Missing data = not-ranking;
  write real Vietnamese that matches the page, not machine gloss.
- Only auto-apply safe on-page changes through `seo-apply`; content and backlinks
  stay human-reviewed.
- Both domains, every run — do not silently drop the blog.

$ARGUMENTS
