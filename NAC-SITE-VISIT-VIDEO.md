# NAC Site-Visit Video Workstream

Turn a filming trip into live banner videos on every LLP, with the MCC tracking
who has video and who doesn't — as streamlined as the image pipeline.

```
① PRE-VISIT          ② ON-SITE         ③ UPLOAD              ④ AUTO-ATTACH        ⑤ MONITOR
   /shotlist   ──►    film to     ──►   MCC drag-drop   ──►   sync-notion cron ──► MCC board +
   (VI+EN script)     the list          → Cloudflare Stream   injects <video>      listing-status
                                         → writes Notion       into hero            (vid dimension)
```

The only genuinely new piece is Cloudflare **Stream** on the LLP side; the MCC
worker already runs Stream (`cfUploadVideo` / `/hero-upload`), so ③ reuses it.

---

## ① Pre-visit — shot-list generator ✅ SHIPPED

- Script: `scripts/gen-shotlist.mjs` · command: `/shotlist` · docs: `shotlist/README.md`.
- Reads a listing's real data (Notion Property Listings DB, or `properties/<slug>.html`
  offline) and emits a bilingual VI+EN sectioned filming script.
- **Amenities** section only lists facilities the property actually has (matched
  from `✨ Features JSON`); **Unit models** = one block per `💲 Price Bands JSON`
  type. Waterfront / Tower-Bridge context auto-detected. ★ = banner candidate.
- Outputs `shotlist/<slug>.md` + a phone-friendly `shotlist/<slug>.html`
  checklist (VI/EN toggle, progress ring, on-device tick state) served on GitHub
  Pages, + `shotlist/index.html` trip pack for multi-listing runs.
- Clip-naming convention baked into every list: `<slug>__<ID>.mp4`.

## ② On-site — filming

Film against the checklist (open on phone), ticking shots off. Name clips
`<slug>__<shot-id>.mp4` so ③ can auto-route. Shoot ★ shots landscape 16:9,
steady, 10–20s — those are the banner-video candidates.

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
