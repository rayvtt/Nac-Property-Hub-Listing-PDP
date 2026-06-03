# NAC Session Handoff — 2026-06-03

Pick this up in a fresh session. State, next actions, gotchas — all in one place.

---

## Where things stand

### ✅ Done & live

- **All 6 CLPs fully optimized** (cyprus, greece, panama, turkey, uk, vietnam) — canonical, hreflang ×3, twitter card, og:image, robots, JSON-LD `@graph` (CollectionPage + BreadcrumbList + ItemList of Products with Offer/price/currency). Vietnam preserves body case-study Article ItemList (head-scoped strip works).
- **20 listings machine-readable** across CLPs (Cyprus 3 · Greece 2 · Panama 2 · Turkey 4 · UK 5 · Vietnam 4) — citation-ready for Google AI Overviews / Perplexity / ChatGPT.
- **CLP→WP push pipeline** — `sync-wp-clp.mjs` fixed (PR merged, branch deleted). Drops `template` param + verify-after-write (re-GET, confirm "NAC Property Collection" sentinel + length match).
- **12 brochure meta descriptions** — applied via `seo-apply` pipeline.
- **Cine titles** — Notion-first, AI gap-fill (`generate-cine-titles.mjs`); `sync-notion.mjs` patches `#nac-img-1|2|3 .nac-cine-h [data-vi|en]`.
- **Daily seo-apply cron** wired (`0 10 * * *` UTC) but currently NOT moving Approved → Applied (see below).

### 🟡 In-flight (next session priority)

**The Approved → Applied hold-up.** PR #178 added daily cron to `seo-apply.yml`. 5+ windows have passed — **zero tasks moved** from Status=Approved to Status=Applied. No applier commits in git log.

**Plan agreed (file: `/root/.claude/plans/its-ok-let-skip-adaptive-crystal.md`):**

1. **Self-instrumenting log** — `scripts/seo-apply.mjs` writes `.github/state/seo-apply-last-run.json` at end of `main()` with `runStartedAt`, `tasksFetched`, `eligibleCount`, `appliedCount`, `dropReasons[]` (taskId, slug, surface, reason), `firstFiveErrors`. Workflow commits it back with `[skip ci]` (reuse `seo-list-state.yml:55–75` pattern).
2. **Close silent-drop paths** at `seo-apply.mjs:367–386` — convert `if/else if` into classifier that ALWAYS returns a reason. Add surface fallback (URL pattern → slug pattern → `Sitewide`). Add URL fallback for PDP/Brochure derived from `surface + slug`.
3. **Notion key collision** — `readTask()` reads `p['URL']` AND `p['userDefined:URL']` (same for `surface`). Suspected root cause: `surface=null` on the Approved tasks is dropping them silently.
4. **Mark dropped tasks Skipped in Notion** — extend `markSkipped()` callers to fire on routing drops + WP-page-not-found (not just "No usable Proposed Fix").
5. **Cron heartbeat** — if `seo-apply-last-run.json` doesn't update after next 10:00 UTC, cron is dead; switch to repository_dispatch.

**Verification path:** merge fires push-event run → within 5 min `seo-apply-last-run.json` lands on main → read `dropReasons[]` → see exactly why each of the 24 stuck Approved tasks is dropping → fix surface/URL fallback to match.

### 🔴 Blocked

- **8 Approved tasks** (tu-van-nhanh ×2 + 6 blog posts) — pages lack `raw_html_code` ACF; RankMath fields not REST-exposed. Needs mu-plugin (Path A) OR manual WP edits (Path B). Deferred by user.
- **Homepage RankMath** (post=2) — same mu-plugin blocker. Deferred.

### 📋 User-side laptop tasks

- Submit 6 CLP URLs to GSC URL Inspection → Request Indexing (24–72h re-crawl).
- `NAC-GOOGLE-VISIBILITY.md` — Yoast noindex taxonomies, Redirection 301s, WP nav priority (Property Hub, Brochures, NAC Index, Tư Vấn Nhanh).

---

## CLP further polish (optional, ~15 min each)

1. **Richer meta descriptions** — current 80–88 chars, target 140–160. Template in `sync-notion-clp.mjs:buildManagedSeoHead` — bake in actual brand+city list (e.g. Vietnam: `"Curated branded residences in Vietnam: Nobu, Mandarin Oriental, JW Marriott — Da Nang, Saigon, Ho Tram. 4 listings from NAC's Property Hub."`).
2. **Title keyword boost** — add `Branded Residences` or `Golden Visa Property` to `<Country> · NAC Property Collection`.

---

## Key file map

| File | Role |
|---|---|
| `scripts/seo-apply.mjs` | **PRIORITY EDIT** — instrumented logging + classifier refactor + Notion key fallback |
| `.github/workflows/seo-apply.yml` | Add commit-back step for `.github/state/seo-apply-last-run.json` |
| `.github/workflows/seo-list-state.yml:55–75` | Pattern to reuse for commit-back |
| `scripts/sync-notion-clp.mjs` | CLP sync — `buildManagedSeoHead()`, `stripManagedSeoHead($)` (head-scoped) |
| `scripts/sync-wp-clp.mjs` | CLP → WP. Fixed: no `template`, verify-after-write |
| `scripts/seo-validate-draft.mjs` | Draft generator (Claude meta + programmatic schema) |
| `scripts/sync-notion.mjs` | PDP sync — cine fields wired |
| `scripts/generate-cine-titles.mjs` | AI gap-fill, Notion-first |
| `country/{cy,gr,pa,tr,uk,vn}.html` | CLPs — SEO head managed by sync |

---

## Notion IDs

- Property Listings DB: `35848ec25e86803283acc7ad989649c9`
- SEO Tasks DB: `ada6bd2f8c324773b0d026f9db78d3a2` (data source `ce72b1b7-8c1a-4ab7-bc6b-c3ee5f4e18b9`)
- Country Listings DB: `a01ef35ce9fd45b1bba3ec4de4da678c` (data source `ef2e9ff0-d725-4f2b-87c1-2d72c5a21905`)

---

## Triggering gotchas

- **GITHUB_TOKEN cron commits don't trigger downstream workflows.** Use trigger-file PR merges or `repository_dispatch`.
- **MCP `actions_run_trigger` returns 403** (read-only). Can read logs via `actions_list` / `get_job_logs`.
- **jq `// empty` treats boolean `false` as falsy** — use STRING `"false"` in trigger JSON.
- **Notion writer** uses `database_id` parent (not `data_source_id` — that's MCP-only).

---

## First moves next session

1. Read this file.
2. Re-read `/root/.claude/plans/its-ok-let-skip-adaptive-crystal.md`.
3. Open `scripts/seo-apply.mjs`, jump to the routing block (~line 367–386).
4. Implement the 4 plan steps on branch `claude/seo-apply-instrument-<slug>`.
5. PR → squash-merge → wait ~5 min → read `.github/state/seo-apply-last-run.json` → diagnose 24 stuck tasks from `dropReasons[]`.
