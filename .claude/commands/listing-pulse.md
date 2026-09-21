---
description: 📡 Listing Pulse — the freshness loop. Checks ~10 Live listings a day against each project's developer source for price, stage, handover and availability changes (every listing ~twice a month), and files what moved for Ray to Log or Dismiss in the MCC 📡 Listing Pulse view. Report-first — never writes to a listing itself.
argument-hint: "[status | <slug> | <batch size>]"
---

# /listing-pulse — developer pricing + project-stage freshness loop

The Copy Machine polices *copy quality*; **this loop polices facts going stale** —
the developer's price-from, the project's construction stage, the handover date,
availability, incentives. Nothing here ships without Ray: findings are filed
`Proposed`; Ray **Logs** (the Worker writes the listing field + a changelog entry)
or **Dismisses** in the cockpit's 📡 Listing Pulse view.

## The goal (north star)

Every **Live** listing is checked against its developer source **at least twice a
month** — 10 a day, every day, ≈13-day full cycle across ~133 listings. Ray only
ever sees listings where something *actually moved*; "checked, no change" is
recorded silently in the ledger. Goal is met when the ledger shows every Live
slug checked within the last 14 days.

## Control surfaces

- **Queue**: 📡 NAC - Listing Pulse (database `6a18ad33bcaa4d62b9fec02d61788beb`,
  data source `34e6cc7a-6f66-42ea-a8ff-e69326ac4032`). One row per
  (listing × changed field):
  - `Finding` (title): `<slug> — <Kind>: <one-line summary>`
  - `Slug` · `Country` · `Listing URL`
  - `Kind`: `source` (proposing the developer URL) · `price` · `stage` ·
    `handover` · `availability` · `incentive`
  - `Field`: the **exact** Property Listings property this would update —
    `🔗 Developer Source URL` · `Purchase Price` · `🏗️ Stage` · `🔑 Handover EN`
    (pair with `🔑 Handover VI`) · `⏳ Units Left` · (incentives → `💬 NAC Note`,
    filed as a copy defect, see chaining)
  - `Current` = today's value on the listing · `Proposed` = the new value
  - `Source URL` = the page you read · `Evidence` = the **exact quote** that
    supports the change · `Confidence`: `high` (page states it explicitly) ·
    `medium` (inferred from context) · `low` (ambiguous — still file, never hide)
  - `Detected` = today · `Status` = `Proposed` (always, on filing)
- **Listing fields** (🏠 NAC - Property Listings, data source
  `35848ec2-5e86-8074-b4b0-000bcbe88149`): read `🔗 Developer Source URL`,
  `Purchase Price`, `Currency`, `🏗️ Stage`, `🔑 Handover EN/VI`, `⏳ Units Left`,
  `Spotlight?`, `📷 Image URLs JSON`, `Partner`, `✦ Brand`. **Never write these
  from this command** — the Worker writes on Log.
- **Worker API** (the canonical control surface — the daily Routine runs with no
  repo and no connectors, so everything goes through the MCC Worker at
  `https://nac-marketing-cc.ray-vtt.workers.dev`, authed with the agent token
  from `GET /agents` → `agentToken`, or the CC key header):
  - `GET /listing-pulse?pick=10` → today's batch (stalest-first, risk-bumped),
    each with `slug · name · country · listingUrl · sourceUrl · price · currency ·
    stage · handoverEn/Vi · unitsLeft · brand · partner · lastChecked`.
  - `POST /listing-pulse {action:"propose", slug, kind, field, current, proposed,
    sourceUrl, evidence, confidence, country, listingUrl}` → one Proposed row
    (an open row for the same slug + field is refreshed, never duplicated).
  - `POST /listing-pulse {action:"checked", items:[{slug, result, changes}]}` →
    the ledger. `POST {action:"digest"}` → the Google Chat card (Worker holds
    the webhook). `GET /listing-pulse` → queue + digest + coverage (what MCC shows).
- **Ledger**: Worker KV (`PG_TELEMETRY` → `pulse:ledger`), shape:
  ```json
  { "listings": { "<slug>": { "checked": "YYYY-MM-DD", "result": "verified|changed|source-proposed|no-source", "changes": 0 } },
    "days":     { "YYYY-MM-DD": { "checked": ["slug", …], "changed": 0, "verified": 0, "sourceProposed": 0, "noSource": 0 } } }
  ```
  `seo/listing-pulse-checked.json` (repo root) is an optional mirror for
  offline audits — the Worker copy is canonical. **Verified goes to the ledger
  only — never as a Notion row.**

## What to do each run

0. **Orient** — `status` → report ledger coverage (checked ≤14d / stale / never)
   and stop. A slug → pulse that one listing. A number → batch size. Otherwise →
   the next batch of **10**.
1. **Pick the batch** — Live listings, ordered **stalest-first** (never-checked
   first, then oldest `checked`), then **risk-bumped** to the front: listings
   whose `🔑 Handover` names the current or next quarter/year (stage most likely
   to flip), and `Spotlight? = true`. Cap at the batch size.
2. **Phase 0 — source URL** (per listing with an empty `🔗 Developer Source URL`):
   find the project's **official developer/project page** (the developer's own
   site or the project microsite — not an aggregator, not a news article). Use
   what's already on the row to anchor the search: `✦ Brand`, `Property Name`,
   `Partner`, and the domains already in `📷 Image URLs JSON` (a listing whose
   images come from `fortressgardens.com.mt` almost certainly has its source
   there). File ONE `Kind=source` row: `Field = 🔗 Developer Source URL`,
   `Proposed` = the URL, `Evidence` = the page title/tagline proving it's the
   right project, `Confidence` honest. **Do not run Phase 1 on a listing until
   its source URL has been Logged** — record it in the ledger as
   `source-proposed` and move on. If no official page exists after a real
   search, record `no-source` (the listing is then checked manually by Ray, not
   by this loop) — never invent a URL.
3. **Phase 1 — pulse check** (per listing WITH a `🔗 Developer Source URL`):
   fetch the page and extract, where stated: price-from (in the listing's
   `Currency`), construction stage, handover/completion date, availability
   (units left / phase / sold out), and payment-plan or incentive changes.
   **Compare each to the listing's current field value.**
   - Different → file one row per changed field (`Kind` by type) with `Current`,
     `Proposed`, `Source URL`, the `Evidence` quote, and `Confidence`. Normalise
     stage to the `🏗️ Stage` select vocabulary: Pre-launch · Selling · Under
     construction · Topping out · Completed · Handed over · Sold out.
   - Same → file **nothing**; record `verified` in the ledger.
   - Page unreachable / no longer the project → file a `Kind=source` row
     proposing a corrected URL (or `no-source`), and note it in the digest.
4. **Ledger + digest** — one `checked` call with every listing's outcome
   (`items[]`), then `{action:"digest"}`: the Worker posts the Google Chat card
   (header `📡 Listing Pulse · <date>`, one row per changed listing `slug · Kind ·
   Current → Proposed`, the source URLs to confirm, and the totals `N checked ·
   N changed · N verified · N source URLs`). A `skipped` answer means no
   webhook is set — the MCC view is the record, never the absence of one.
5. **Report** — batch, what changed, what needs a source-URL confirmation, ledger
   coverage (how many Live slugs are within 14 days), anything Ray must know.

## Chaining into the Copy Machine (the Worker does this, not you)

When Ray **Logs** a `price` or `handover` change, the Worker scans that listing's
Excerpt / 📝 Desc / 💬 NAC Note / 📜 Statement (VI + EN) for the **superseded
value** and, for every field that still embeds it, files a `Kind=defect` row in
the 🇻🇳 NAC - LLP VI Copy Review queue ("embeds superseded value X → now Y") so
the next `/copy-machine` run rewrites it. A price change can't leave stale copy
behind. You don't file those rows — but **do** mention in the digest which
listings will have copy chased.

## Guardrails

- **Report-first, always.** This command never writes a Property Listings
  field. Only the Worker, on Ray's Log, does.
- **Never fabricate.** No source page → no proposal. No explicit figure → no
  price row. `Evidence` must be a real quote from the page you fetched; if you
  can't quote it, you can't file it.
- **Confidence is mandatory and honest.** Low-confidence changes are filed as
  `low`, never dropped and never dressed up as `high`.
- **One row per changed field**, full replacement value in `Proposed` — the
  Worker writes it verbatim on Log.
- **Aggregators and news are not sources.** Rightmove/Bayut/PropertyGuru/a
  press article can *hint*; the `🔗 Developer Source URL` must be the
  developer's own page.
- Batch ≤ 12; quality over speed. Every row must be Log-able in one glance:
  Current → Proposed, the quote, the link.

$ARGUMENTS
