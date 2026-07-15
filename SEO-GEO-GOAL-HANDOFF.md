# NAC SEO / GEO / `/goal` — Session Handoff

**Purpose:** carry the SEO/GEO ranking initiative into a new session that has broader access.
Read this top-to-bottom, do the **Transfer checklist** first, then work the **Open P0s**.

_Last updated: 2026-07-08 (compiled at end of the prior session)._

---

## 0. Transfer checklist — do these FIRST in the new session

The prior session was blocked by missing access. Grant these up front:

1. **Add repos to the session** (the prior session's `add_repo` server was offline, and GitHub MCP was scoped to only the two repos below):
   - `rayvtt/Nac-Property-Hub-Listing-PDP` (the SEO/PDP repo — already primary)
   - `rayvtt/NAC---Property-Hub` (hub + homepage HTML)
   - `rayvtt/nac-marketing-omnichannel` <-- REQUIRED for the MCC SEO module (worker at `command-center/worker.js`)
   - `rayvtt/NAC-Dashboard`, `rayvtt/NAC-Program-Brochures` <-- requested earlier; add if you want them in scope
2. **Confirm GitHub MCP scope** includes all of the above (prior session got `Access denied` on the marketing repo).
3. **WordPress admin access** (for the logo/favicon/Rank Math tasks) — the content REST API alone can't reach Rank Math settings, the Customizer Site Icon, or Google Business Profile.
4. **Ability to run `scripts/gsc-oauth-setup.mjs` locally** (needs a browser sign-in) to re-mint the dead GSC token.

---

## 1. Open P0s (do in this order)

### P0-A — Re-mint the GSC OAuth token (unblocks `/goal`, `/loop`, and `seo-audit`)
**Symptom:** `goal-review` fails with `GSC query failed (400) ... invalid_grant`. The refresh token is revoked/expired (very likely the Google OAuth consent screen is in **"Testing"** mode -> refresh tokens die after 7 days). This same token powers `seo-audit`, so **all Google rank data is dark** until fixed.

**Fix:**
1. Google Cloud Console -> OAuth consent screen -> set publishing status to **"In production"** (stops the 7-day expiry).
2. Locally: `cd scripts && export GSC_OAUTH_CLIENT_ID=... GSC_OAUTH_CLIENT_SECRET=... && node gsc-oauth-setup.mjs` -> sign in with the Google account that owns the GSC property -> copy the printed `refresh_token`.
3. Update repo secret **`GSC_OAUTH_REFRESH_TOKEN`** with the new value.
4. (Recommended) set repo var **`GSC_PROPERTY = sc-domain:nomadassetcollective.com`** (single domain property covers main + blog; currently it's the comma-separated URL-prefix form).
5. Fire a run: commit any change to `.github/triggers/goal-review.json` on `main` (or Actions -> "SEO Goal -> Bi-weekly Rank Review" -> Run workflow). Confirm a snapshot lands in `seo/rank-snapshots/<date>.json` and rows appear in the Rank Tracker Notion DB.

### P0-B — Country CLP `<title>` bug (live on every country page)
**Symptom:** every `.../property-hub-bat-dong-san/<country>/` page serves
`<title>, meta description, og:title, og:image, lang - .cl-name (country name VI/EN) ...</title>`
— i.e. the template's **top authoring comment is leaking into the title tag** (its literal `<title>` gets parsed as the real title once WP serves the file). Confirmed on cyprus, greece, turkey; affects **all**: `ae, au, cy, gr, my, pa, sg, th, tr, uk`. `vn.html` is clean (predates the template).

**Impact:** garbage title + zero keyword targeting + awful CTR on the primary commercial-intent surface. Likely the single biggest ranking drag right now.

**Fix (choose one — see pending decision 1A vs 1B):**
- **1A (quick):** in `country/_template-clp.html` **and** every `country/*.html`, neutralize the trap in the top comment — change the bullet `- <title>, meta description, ...` so it no longer contains a literal `<title>` (e.g. `- Title / meta description / og:title / og:image / lang`). Best to just delete the whole dev comment block from the shipped country files. Then the CLP->WP sync (`sync-wp-clp` / `sync-notion`) pushes clean titles.
- **1B (recommended):** do 1A **plus** set each CLP's real `<title>` + `<h1>` to target the commercial keyword **`dau tu dinh cu [country]`** (currently they lead with just the country name, so the keyword is absent from title/H1/body). Bigger SEO win.

### P0-C — Logo in Google Search
Your real logo: **`https://blog.nomadassetcollective.com/wp-content/uploads/2026/05/Logo.png`** (426x410, "NOMAD ASSET COLLECTIVE" wordmark in a ring of stars).

Three slots, three sources — current state:

| Slot | Source | State |
|---|---|---|
| Favicon by each result | WP **Site Icon** -> `<link rel=icon>`, square >=48px | only 32x32 (passport icon) |
| Brand/knowledge-panel logo | `Organization` JSON-LD `logo` **+ Google Business Profile** | main `Organization.logo` = passport icon, not the wordmark |
| Blog brand signal | `Organization` schema on blog | blog has **no** Organization schema |

**Highest-leverage (WP-admin, do these):**
1. **Rank Math -> Titles & Meta -> Local SEO / Knowledge Graph** on **both** main + blog: Type=Organization, Name="Nomad Asset Collective", upload `Logo.png`. Fixes the blog's missing schema too.
2. **WP Customizer -> Site Identity -> Site Icon**: upload a **>=512x512** logo (solid background) -> proper 48px+ favicon.
3. **Google Business Profile**: create/verify with the same logo — the real driver of the brand panel.

**Code reinforcement (optional, in repo):** point the homepage `Organization.logo` at the wordmark (re-host `Logo.png` on the main domain first). Note: if Rank Math is configured per step 1, its schema supersedes any hand-coded block — so prefer Rank Math.
_Reality: markup makes you eligible; Google chooses if/when to display; re-crawl takes days-weeks._

---

## 2. Workstream status

| Workstream | State |
|---|---|
| **Per-listing SEO/GEO/LLM scaffolding** | Shipped. `scripts/seo-geo-llm.mjs` completes RealEstateListing + FAQPage + BreadcrumbList JSON-LD from Notion; geo via Nominatim (`scripts/geocode-cache.json`); `llms.txt` regenerated each sync. |
| **SEO Tasks apply-loop** (`seo-apply.mjs`) | Converged. Default og:image wired (PR #278); queue drains via resolve/snooze (PR #279). Last run: 11 schema applied, 18 resolved, 8 snoozed, 0 stuck. Note: og:image/schema audit tasks on CLP/hub were false-positives (Rank Math already provides them). |
| **`/goal`** | Built + merged (PR #389/#391) but **producing no data** — both runs failed on GSC `invalid_grant`. 0 snapshots. Unblocks with P0-A. |
| **`/loop`** (recurring self-review) | = `goal-review.yml` cron (1st & 15th ~= 2 weeks). Durable GitHub Action (survives session end; better than the session-only `/loop` skill). Currently red (same GSC token). No separate `/loop` skill instance was created. |
| **MCC SEO module** | Not started — blocked on adding `nac-marketing-omnichannel`. Spec in section 5. |
| **GSC token** | `invalid_grant` — see P0-A. |
| **CLP `<title>`** | broken on all country pages — see P0-B. |

---

## 3. Key IDs, paths, secrets

**Notion (all under page `36548ec25e86816a893cda6e7de6df8c` = NAC - SEO/GEO Automation):**
- SEO Tasks DB: `ada6bd2f8c324773b0d026f9db78d3a2`
- Rank Tracker DB: `7913fbe44f6e4ae1a8d36239e26d9b45` (data source `2566f13b-2825-4bad-a512-e3f870c92d9b`)
- Goal Reviews DB: `18771efb91ec436bb3016463ea385a07` (data source `5d333553-99b1-417a-b8ec-678499d4cfd2`)
- Property Listings DB: `35848ec25e86803283acc7ad989649c9`
- Country Listings DB: `a01ef35ce9fd45b1bba3ec4de4da678c`

**Files (in `Nac-Property-Hub-Listing-PDP`):**
- `.claude/commands/goal.md` — the `/goal` command
- `seo/goal-keywords.json` — 37-keyword VN universe (**the one human-owned input**; edit/expand it)
- `scripts/goal-review.mjs` — GSC pull -> snapshot -> Notion mirror -> log
- `.github/workflows/goal-review.yml` + `.github/triggers/goal-review.json`
- `seo/rank-snapshots/*.json` (time series) + `seo/goal-log.md` (human log) — created on first successful run
- `scripts/gsc-oauth-setup.mjs` — token re-mint helper
- `scripts/seo-apply.mjs`, `scripts/seo-audit.mjs`, `scripts/seo-geo-llm.mjs`
- `country/_template-clp.html` + `country/{ae,au,cy,gr,my,pa,sg,th,tr,uk,vn}.html` — CLP pages (title bug in all but vn)

**Secrets / vars:** `GSC_OAUTH_CLIENT_ID`, `GSC_OAUTH_CLIENT_SECRET`, `GSC_OAUTH_REFRESH_TOKEN` (dead), `GSC_PROPERTY`, `NOTION_TOKEN`, `WP_APP_PASSWORD` (WP_USER=`admin_web`), `ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`.

**Live URLs:** main `https://nomadassetcollective.com/` - blog `https://blog.nomadassetcollective.com/` - hub `.../property-hub-bat-dong-san/` - MCC `https://nac-marketing-cc.ray-vtt.workers.dev/`.

**Repo conventions:** develop on `claude/<slug>`; PR + squash-merge via GitHub MCP; never `git push origin main` (proxy 403); small files/config to main via GitHub MCP `create_or_update_file`. Fire workflows by committing to `.github/triggers/<name>.json` on main.

---

## 4. Pending decisions (from prior session, unanswered)
- **CLP title:** 1A (quick neutralize) vs **1B (neutralize + keyword-target titles)** <- recommended.
- **GSC token:** **2A (re-mint now)** <- recommended, it's the master unlock.

---

## 5. MCC "SEO / Ranking" module — build spec (once `nac-marketing-omnichannel` is added)

MCC worker source: `command-center/worker.js`. Live app has views: `overview, activity, analytics, aiusage, approvals, compose, content, howto, instagram, leads, library, masks, outreach, plays, settings, threads` — **no SEO view**. Add `data-view="seo"`:

- **Rank panel** — fetch the PDP repo's public snapshots (`https://raw.githubusercontent.com/rayvtt/Nac-Property-Hub-Listing-PDP/main/seo/rank-snapshots/*.json` + `seo/goal-log.md`) -> render top-3 count, avg-position trend, band breakdown, movers/regressions. No extra auth (public raw).
- **Task queue** — read SEO Tasks + Rank Tracker via the worker's existing Notion path; show open/Approved/Applied counts.
- **Controls** — buttons to fire `goal-review` / `seo-apply` / `seo-audit` by committing their `.github/triggers/*.json` via the GitHub token the MCC already holds (same pattern as the homepage editor). Approve/reject SEO tasks by writing `Status` in Notion.
- **GSC token-health badge** — surface `invalid_grant` at a glance so a dead token is visible.
- Deploy: edit `worker.js` -> `npx wrangler deploy` (needs `CLOUDFLARE_API_TOKEN`).

---

## 6. First message to paste into the new session

> Continue the NAC SEO/GEO/`/goal` initiative. Read `SEO-GEO-GOAL-HANDOFF.md` in `Nac-Property-Hub-Listing-PDP`. Repos now added: nac-marketing-omnichannel (+ NAC-Dashboard, NAC-Program-Brochures). I have WP admin. Do in order: (1) re-mint the GSC token [P0-A], (2) ship the CLP `<title>` fix with keyword-targeted titles [P0-B / decision 1B], (3) wire the logo via Rank Math + Site Icon and reinforce `Organization.logo` in code [P0-C], (4) build the MCC SEO/Ranking module [section 5]. Then fire `/goal` and confirm the first real rank snapshot lands.
