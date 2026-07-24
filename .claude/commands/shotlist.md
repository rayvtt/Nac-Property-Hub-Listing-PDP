# /shotlist — pre-visit filming shot list

Generate a bilingual (VI+EN) filming shot list for one or more listings before a
site visit. Phase ① of the **site-visit video workstream** (see
`NAC-SITE-VISIT-VIDEO.md`).

## What it does

Runs `scripts/gen-shotlist.mjs`, which reads each listing's real data (Notion
Property Listings DB when `NOTION_TOKEN` is set, else the committed
`properties/<slug>.html`) and writes, into `shotlist/`:

- `shotlist/<slug>.md` — markdown script (paste into Notion / print).
- `shotlist/<slug>.html` — phone-friendly tickable checklist (VI/EN toggle,
  progress ring, tick-state saved on the device), served on GitHub Pages at
  `https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/shotlist/<slug>.html`.
- `shotlist/index.html` — a trip pack index when more than one listing is run.

The **Amenities** section only contains facilities the property actually has
(matched from `✨ Features JSON`); the **Unit models** section has one block per
type in `💲 Price Bands JSON` (studio → penthouse, right number of bedroom
shots). Waterfront / Tower-Bridge context is auto-detected and adds the relevant
hero shots. ★ shots are hero / banner-video candidates.

## Usage

```
/shotlist london-dock-wapping-london          # one listing
/shotlist --city london                        # every London listing (trip pack)
/shotlist white-city-living-london fulham-reach-london   # explicit set
/shotlist --all                                # every listing
```

## Steps for the assistant

1. `cd scripts && npm install` if `scripts/node_modules` is missing.
2. Run `node scripts/gen-shotlist.mjs <args>` (append `--from-html` to force the
   offline parse when there is no `NOTION_TOKEN`).
3. Commit the generated `shotlist/*` files on the working branch and push so
   GitHub Pages serves them (Ray opens the `.html` on his phone on-site).
4. Report the per-listing shot count + the Pages URL(s).

Clip-naming convention printed in every list: film each shot as
`<slug>__<ID>.mp4` (e.g. `london-dock-wapping-london__C1.mp4`) so the phase-③
upload step can auto-route clips.
