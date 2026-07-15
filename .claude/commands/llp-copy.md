---
description: Standing goal — review the Vietnamese copy of every Live LLP for language quality + relevance (report-first); logs each batch to the MCC and queues findings for Ray's approval. Runs until all listings are reviewed, then flips to spot-check mode for new listings.
argument-hint: "[optional: slug | 'status' | 'apply' to push Approved findings to Notion]"
allowed-tools: Bash, Read, Grep, Glob, mcp__Notion__notion-fetch, mcp__Notion__notion-query-data-sources, mcp__Notion__notion-create-pages, mcp__Notion__notion-update-page, mcp__github__create_or_update_file, mcp__github__get_file_contents
---

# /llp-copy — LLP Vietnamese Copy Review Goal

You are NAC's Vietnamese-native copy editor. This command owns one standing
objective and drives it forward every time it runs.

## The goal (north star)

Every **Live LLP** (`properties/*.html`, 126+ and growing) has had its full
Vietnamese copy reviewed for **language quality and relevance**. "Reviewed" =
every VI field of the listing read by a competent VI editor pass, with every
defect filed as a finding. The goal closes when the reviewed-set covers all
Live listings; after that, each **new** listing gets reviewed within a day of
going Live (spot-check mode).

**Report-first (Ray's chosen mode):** never edit listing copy directly. File
findings; Ray approves; only then apply (via `apply` argument) to the
**🏠 Property Listings DB** (source of truth) so sync-notion propagates.

## Control surfaces

- **Findings queue**: Notion DB **🇻🇳 NAC - LLP VI Copy Review**
  (data source `2e085e5f-86c2-4168-8efb-4c7771a6fdf8`). One row per defect:
  Finding · Slug · Field · Severity (`P0 wrong-fact` / `P1 broken-VI` /
  `P2 style`) · Scope (`per-listing` / `template-wide`) · Current · Suggested ·
  Rationale · Status (`Proposed` → Ray sets `Approved`/`Rejected` → loop sets
  `Applied`).
- **MCC control + logs**: 🛎️ NAC - Marketing - Command Requests row
  **"LLP VI Copy Review — all Live LLPs (report-first)"**
  (page `39d48ec2-5e86-815f-80aa-c39196754e6b`). APPEND one log line to its
  `Result` per run: `[date] batch: <slugs or count> reviewed · <n> findings
  (<p0>/<p1>/<p2>) · <reviewed-total>/<live-total> done`. Never overwrite
  earlier log lines. Set its Status → `Done` when the goal closes.
- **Progress ledger**: `seo/llp-copy-reviewed.json` in this repo — array of
  `{slug, date, findings}` for every listing already reviewed. This is the
  loop's memory; read it first, append after each batch, commit via the
  GitHub MCP (feature branch → PR → squash-merge, never direct to main).

## What to do each run

0. **Orient** — `status` argument → report progress only. A slug argument →
   review just that listing. `apply` → find `Approved` rows in the findings
   queue, write each to the matching field on the listing's row in the
   🏠 Property Listings DB (`35848ec25e86803283acc7ad989649c9`), set the
   finding `Applied`, log to MCC. Otherwise → review the next batch.
1. **Pick the next batch** — 8–12 listings from `properties/*.html` not yet in
   `seo/llp-copy-reviewed.json` (alphabetical, `_template` excluded).
2. **Review each listing's VI copy from the DB (source of truth)** — the copy
   lives on the listing's row in the **🏠 NAC - Property Listings DB**
   (data source `35848ec2-5e86-8074-b4b0-000bcbe88149`; Ray's curated field
   view is **"Listing PDP (db)"**). Review every VI-bearing field:
   `Name VI` · `🏷️ Tagline VI` · `Excerpt VI` · `📝 Desc VI` · `🌍 Market VI` ·
   `💬 NAC Note VI` · `📜 Statement VI` · `✦ Brand Intro VI` ·
   `🌏 Key Markets VI` · `🏖️ Beach VI` · `✈️ Airport VI` ·
   `📈 Property YoY VI` · `🎬 Cine 1/2/3 VI` · `🔑 Handover VI` ·
   `📣 Share Title VI` · and the `vi` strings inside `✅ Pros JSON` ·
   `⚠️ Cons JSON` · `✨ Features JSON` · `🔄 Process JSON` ·
   `📊 Market Stats JSON` · `💲 Price Bands JSON`. Fetch rows via
   `notion-fetch`/`notion-query-data-sources`; use corpus-wide SQL `LIKE`
   sweeps to check whether a newly-found defect pattern exists on OTHER rows
   before filing (one sweep beats 126 reads — and it verifies the finding).
   The rendered HTML is only the source for **template-wide** strings
   (methodology, footer, CTA), which don't live in the DB. Read as a native
   editor, not a grep: whole sentences, in context, against the listing's
   actual facts (city, asset class, program, developer, tenure).
3. **File findings** — one row per defect in the findings queue, Status
   `Proposed`. Template-wide defects (shared methodology/footer/CTA strings)
   get Scope `template-wide` and are filed ONCE — check the queue for an
   existing row before filing a duplicate.
4. **Log** — append the batch ledger entries + the MCC `Result` log line.
5. **Report** — 2–4 sentences: batch reviewed, notable findings, running
   total. When reviewed-total reaches the Live-listing count: set the MCC row
   Status `Done`, delete the driving Routine (trigger) if one exists, and
   switch future runs to spot-check mode (only new Live listings).

## Review rubric (what counts as a defect)

| Severity | What | Examples |
|---|---|---|
| **P0 wrong-fact** | VI copy contradicts the listing's data or overstates legally-distinct claims | `căn hộ` vs `biệt thự` mismatch with Hub Type; `sở hữu vĩnh viễn` (freehold) written on a 50-year-leasehold listing; wrong city/district; wrong program |
| **P1 broken-VI** | Garbled or misspelled Vietnamese a native reader stumbles on | diacritic typos (`chia sẽ`→`chia sẻ`, `Si Gòn`→`Sài Gòn`); calques that aren't Vietnamese (`Vi vị trí`); broken grammar; untranslated EN fragments mid-sentence |
| **P2 style** | Correct but unnatural / off-register for an investment memo | translationese (`mức độ rảnh tay`, `độ bền thu nhập`); **English sentence architecture wearing Vietnamese words** — a `mà`-chain off `khiến/làm cho`, a `cộng với X đưa Y về mức` calque, 3+ modifiers stacked before one noun, a parenthetical fact-dump (see `/copy-write-vi`); informal particles (`nhé`) in formal sections; EN plural on VI nouns (`emails`); inconsistent terminology across pages |

**Terminology glossary (one canonical VI term per concept — flag deviations):**
freehold → `sở hữu vĩnh viễn` (only when genuinely freehold) · long-term
ownership → `sở hữu lâu dài` · leasehold → `thuê dài hạn (leasehold)` ·
condotel → `condotel` (keep) · gross yield → `lợi suất gộp` · revenue share →
`chia sẻ doanh thu` · branded residences → `căn hộ hàng hiệu` · Saigon →
`Sài Gòn` / `TP.HCM` (never `Si Gòn`) · installments → `thanh toán theo tiến độ`.

## Guardrails

- **Never fabricate**: a "suggested rewrite" must preserve the listing's facts
  exactly; if the fact itself looks wrong, that's a P0 finding, not a rewrite.
- **Read `.claude/commands/copy-write-vi.md` before writing any `Suggested`
  text.** A rewrite that's grammatically valid but keeps English sentence
  architecture is not a fix — apply its 5 patterns (topic-fronting, native
  connectives, no pre-noun modifier stacks, data folded into clauses, textured
  closings) so the suggestion actually sounds native, not just spell-checked.
- **Never edit HTML directly** — copy lives in Notion (per-listing) or in the
  template/inject scripts (template-wide); HTML is generated.
- **Template-wide fixes ship as code PRs** (they're not brand-voice calls when
  the string is objectively broken); brand-voice/style changes always wait for
  Ray's approval in the queue.
- Batch size ≤ 12 so each run stays reviewable; quality over speed.

$ARGUMENTS
