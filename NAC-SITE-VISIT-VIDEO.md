# NAC Site-Visit Video Workstream

Turn a filming trip into published reels + live banner videos on every LLP —
managed end-to-end on the 🎬 **NAC - Reels - allthingsTikTok** Notion DB.

```
⓪ SCRIPT           ① FILM              ② INGEST            ③ POST-EDIT        ④ PUBLISH
  Claude Chat  ──►  portal reads   ──►  drop clips     ──►  editor cuts   ──►  social (reel) +
  → Reels DB        the script          per shot/angle      final video        LLP hero banner
  (child shot        (tick Done,         (→ Drive/CF)        (Editing →         (Scheduled →
   checklist)         on-site)                                Ready to Post)     Published)
```

**The Reels DB is the production spine.** Its two status fields ARE the pipeline:
- `Status`: `Post Idea → Draft → Ready for Review → Ready for Filming → Filming → Editing → Scheduled → Published`
- `Filming Status`: `Not Filmed → Filmed → Edited → Ready to Post`

Each reel row (e.g. *Script #021 — London Dock*) owns a child **Shot Checklist**
DB — per shot: `Shot`, `Section`, `Direction (EN)`, `ON-CAM option`, `VO option`,
`Done`. The film portal is the **field companion** that reads those scripts.

---

## ⓪ Script — authored in Claude Chat, lands in the Reels DB ✅ CONNECTED

- Claude Chat writes the bespoke reel script into the Reels DB
  (`32e48ec25e86804aaa56cdcb7389fd75`) + its child Shot Checklist.
- `scripts/pull-reels.mjs` bridges it into the portal:
  `--from-notion` (CI, needs `NOTION_TOKEN`) pulls every reel + child checklist →
  `scripts/reels-source.json`; the default build transforms that → `shotlist/scripts.json`
  (parses ON-CAM/VO into `{secs, vi, en}`, groups by Section, seeds `Done`, maps
  the reel to a listing slug). Committed `reels-source.json` = offline source of truth.
- `.github/workflows/build-film-portal.yml` runs pull-reels + gen-shotlist on
  push/cron so new scripts flow into the portal automatically.

## ① Film — the portal reads the real script on-site ✅ SHIPPED

- The portal's **Read** screen shows the actual Notion reel when one exists (tab
  **📋 Script #NNN**), else the derived **🎥 Shot ideas**. The script view has:
  the reel status banner (Status · Filming Status · platforms · duration · hook +
  links to the Notion reel & checklist), a progress ring seeded from Notion `Done`,
  and per shot: **Direction**, bilingual **ON-CAM** + **VO** lines (respects the
  VI/EN toggle), a **Done** tick, and a **clip drop-in** (paste the clip link;
  filename convention `<slug>__<n>.mp4`). All ticks/clips saved on-device (offline).
- **📋 Copy filming report** at wrap → a plain-text checklist (done/total, clip
  links per shot, what's still to shoot) to hand to the editor.

---

## ② Ingest — drop iPhone clips on the go ✅ SHIPPED *(uploads pending worker deploy)*

Built for filming solo, walking the site on an iPhone. On each script shot the
Read screen has a **🎬 Add clip** button (`<input type=file accept=video/*>` →
iOS offers *Record / Photo Library*). Each dropped clip is:
- **auto-named per section** — `<slug>__<section>-s<shot>-t<take>.mp4`
  (e.g. `london-dock-wapping-london__intro-s4-t1.mp4`); multiple takes per shot supported;
- **grouped + counted per section** (🎬 badge on each section header);
- saved on-device (offline); removable; and rolled into **🎞️ Clip manifest**
  (section-grouped list of names + URLs) + the **📋 Filming report** for the editor.

**Upload wiring:** with a worker URL set (portal **⚙︎ Upload**), each clip uploads
**straight from the iPhone to Cloudflare Stream** via a one-time *direct-creator-upload*
URL minted by the worker — the big file never proxies through the worker.
- Worker endpoint: `GET /reel-clip?name=…` in `nac-marketing-omnichannel/command-center/worker.js`
  → `reelClipUpload()` → CF `stream/direct_upload` → `{uploadURL, uid, playback, thumbnail}`.
  CC_KEY-gated + CORS (`*`) like the sibling `/hero-upload`. Reuses `CF_STREAM_TOKEN`/`CF_ACCOUNT_ID`.
- **To activate:** deploy the worker (land `command-center/**` on the deploy branch), then in the
  portal tap **⚙︎ Upload** → paste `https://nac-marketing-cc.ray-vtt.workers.dev` + the cockpit key.
  Until then the portal runs in **organizer mode** (clips logged + named + manifest, no upload) — no
  breakage. Needs a real-device smoke test (iPhone Safari → Stream) before relying on it.

---

### The portal — Prepare → Trip → Read

`shotlist/index.html` (command `/shotlist`, script `scripts/gen-shotlist.mjs`) is
the single bookmarkable, **offline** URL. **Prepare/Browse** (search + country
filter, ★ into *My Trip*, a 📋 badge on listings that have a reel script) →
**Trip** → **Read**. When a listing has no Notion reel yet, the Read screen falls
back to the auto-derived **🎥 Shot ideas** (amenities from `✨ Features JSON`,
unit blocks from `💲 Price Bands JSON`, ★ = banner candidate) + a per-slug
`shotlist/<slug>.md` for Notion paste. Served on GitHub Pages at `…/shotlist/`.

---

## LLP banner-video track (parallel output) — ⟨TODO⟩

The same footage feeds a **second** output besides the social reel: a muted-loop
**banner video on the listing's LLP hero**, tracked in the MCC. This is the
original phase ③–⑤ plan and is still to build.

## ③ Upload — MCC cockpit "📹 Site-Visit Videos" view  ⟨TODO — nac-marketing-omnichannel⟩

New cockpit view + worker endpoint. Per-listing cards: ✅ has video / ⏳
processing / ⬜ missing, coverage %, city filter, drag-drop upload.

- **Front-end** (`command-center/public/index.html`): add nav button
  `data-view="sitevideo"`, `sitevideo:"Site-Visit Videos"` to the `VTITLE` map,
  `sitevideo:vSiteVideo` to the dispatcher, and `function vSiteVideo()` modelled
  on `vCopyMachine` (per-listing card grid). Build desktop **and** ≤640px mobile
  in the same pass (hard-rule #7).
- **Worker** (`command-center/worker.js`): a `/site-video` endpoint that (GET)
  sweeps the Listings DS via `queryAll` reading `🎥 Banner Video URL`, and (POST
  multipart) uploads via the existing `cfUploadVideo(env, token, file, name)` →
  writes `🎥 Banner Video URL` (the Stream MP4 URL) + optional
  `🎥 Banner Poster URL` (`https://videodelivery.net/<uid>/thumbnails/thumbnail.jpg`)
  back to the row, then flips a `🎥 Video Status` select (`Processing → Ready`).
  Poll readiness with the `GET /hero-upload?uid=` shape already in the worker.
- Requires the Stream secrets the worker already references: `CF_ACCOUNT_ID`,
  `CF_STREAM_TOKEN` (or an Images token that also carries `Stream:Edit`),
  `CF_STREAM_CUSTOMER` (default `mvn90cz9tujutkw2`).

## ④ Auto-attach to the LLP hero  ⟨TODO — this repo⟩

Zero manual HTML. Mirrors the `Mobile Image URL` → `--bg-mobile` pattern.

- **Template** (`properties/_template-listing-pdp.html`): inside
  `<section class="nac-hero">`, between `.nac-hero-img` (line ~209) and
  `.nac-hero-veil` (line ~210), add an empty video layer the sync fills:
  `<video class="nac-hero-vid" data-notion-vid="banner_video" muted loop playsinline preload="none"></video>`
  styled `position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
  z-index:1` (below the veil so title/gradient still read). Reduced-motion:
  `@media(prefers-reduced-motion:reduce){.nac-hero-vid{display:none}}` so the
  poster image shows. Blank field = today's image-only hero (no regression).
- **Sync** (`scripts/sync-notion.mjs`): add
  `bannerVideo: readUrl(p['🎥 Banner Video URL'])` beside `heroImgMobile`
  (line ~139); in the `if (prop.heroImg)` block (line ~640) set the video src +
  `poster` = hero image when `prop.bannerVideo` is present, else strip the
  element's src (idempotent). Autoplay muted loop is the chosen playback (matches
  the homepage hero-film pattern).
- `sync-wp.mjs` then pushes the updated HTML live on the next tick.

## ⑤ Monitor — close the loop  ⟨TODO — this repo + MCC⟩

- **listing-status dashboard** (`scripts/build-llp-status.mjs`): add `'vid'` to
  `DIMS`; in `extract()` regex the hero `<video>` src for a real Stream host
  (`videodelivery.net` / `cloudflarestream.com`) → `f.videoReal`; in `derive()`
  add `st.vid = f.videoReal ? 'done' : 'block'`. The row-build / tally / JSON
  injection iterate `DIMS` generically, so they pick it up. Add the column
  header to `listing-status.html` by hand (presentation is hand-maintained).
- **MCC board** (③'s view) is the operational "who has video vs missing" —
  coverage %, filter to `missing`, one-tap to the LLP Pages preview.

---

## Notion fields (Property Listings DB `35848ec25e86803283acc7ad989649c9`)

| Field | Type | Written by | Read by |
|---|---|---|---|
| `🎥 Banner Video URL` | URL/Text | ③ MCC upload | ④ sync-notion, ⑤ status |
| `🎥 Banner Poster URL` | URL/Text | ③ (Stream thumbnail) | ④ (video `poster=`) — optional; falls back to `Image URL` |
| `🎥 Video Status` | Select (`Missing`/`Processing`/`Ready`) | ③ | ⑤ MCC board |

## Streamlining extras (backlog)

- **QC gate** before attach: reject portrait / sub-1080p / over-length clips
  (mirror the image pipeline's filter cascade in `NAC-IMAGE-SYNC.md`).
- **Trip planner**: `/shotlist --city <c>` already bundles a city; extend the
  MCC board to show video-less listings grouped by city as the filming target.
- **Optional mobile (vertical) cut** via a `--bg-video-mobile` twin, same shape
  as `--bg-mobile`. Default recommendation: one landscape clip + `object-fit:cover`.
