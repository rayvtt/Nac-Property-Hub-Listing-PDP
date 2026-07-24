# /shotlist — site-visit film portal + shot lists

Build the pre-visit filming portal and, optionally, per-listing markdown scripts.
Phase ① of the **site-visit video workstream** (see `NAC-SITE-VISIT-VIDEO.md`).

## What it does

Runs `scripts/gen-shotlist.mjs`, which reads every listing's real data (from the
committed `properties/*.html`; per-slug markdown can use Notion when
`NOTION_TOKEN` is set) and:

- **Always rebuilds `shotlist/index.html`** — the self-contained film portal
  (all listings inlined → works offline on-site). Three stages: **Prepare/Browse**
  (search + country filter, ★ into *My Trip*) → **Trip** → **Read** (on-site
  screen: VI/EN toggle, progress ring, tap-to-tick shots saved per device).
  Live at `https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/shotlist/`.
- **Optionally writes `shotlist/<slug>.md`** for explicitly named slugs (or
  `--city <name>` matches) — the script as a table for pasting into Notion.

Each script's **Amenities** section lists only facilities the property actually
has (from `✨ Features JSON`); **Unit models** = one block per `💲 Price Bands
JSON` type. Waterfront / Tower-Bridge context is auto-detected. ★ = hero /
banner-video candidate.

## Usage

```
/shotlist                         # rebuild the portal (all listings)
/shotlist london-dock-wapping-london   # portal + that listing's .md
/shotlist --city london           # portal + a .md for every London listing
```

## Steps for the assistant

1. `cd scripts && npm install` if `scripts/node_modules` is missing.
2. Run `node scripts/gen-shotlist.mjs [<slug…> | --city <name>]`.
3. Commit the generated `shotlist/*` on the working branch and push so GitHub
   Pages serves the portal (Ray opens it on his phone on-site).
4. Report the listing/shot counts and the portal URL.
