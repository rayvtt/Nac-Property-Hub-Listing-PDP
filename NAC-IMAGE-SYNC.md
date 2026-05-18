# NAC Image Sync — Cloudflare Images Pipeline

End-to-end automation: brochure PDF in Google Drive → embedded images extracted → uploaded to Cloudflare Images → URLs written back to Notion.

`scripts/sync-images.mjs` + `.github/workflows/sync-images.yml`.

## What it does

For each Notion property (filter: `Hub Status = Live` AND `Image URL` empty or still on the `wp-content/uploads/2026/05/` placeholder):

1. Collect image candidates from **any combination** of three sources:
   - **Berkeley web page** (`🌐 Berkeley Page URL` field, or `--berkeley-page` flag) — scrapes `.ashx` URLs from the page, bumps each to 1920×1080 via query params
   - **Explicit URL list** (`📷 Image URLs JSON` field, or `--berkeley-urls` flag) — JSON array of URLs to fetch directly
   - **Drive brochures** (`GS Source Folder` field, or `--pdf` flag) — downloads PDFs, runs `pdfimages -j` (poppler-utils)
2. Apply the **quality filter**:
   - width ≥ 1500px (real heroes are 1800+)
   - landscape orientation (width ≥ height) — drops portrait brochure spreads
   - file size ≥ 150KB
   - **bytes/pixel ≥ 0.05** — drops abstract design graphics (waves, gradient blocks) that compress unusually small. Real photos sit at 0.10–0.30 bytes/pixel
3. Dedupe by SHA-256, sort by **pixel area DESC** (the most pixels wins, regardless of CDN compression)
4. Take top 5. Upload to Cloudflare Images with stable custom IDs:
   - `<slug>-hero` → `Image URL` (Notion)
   - `<slug>-1` through `<slug>-4` → `🖼️ Image 1-4` (Notion)
5. Write the 5 `imagedelivery.net/.../public` URLs to Notion

The next `sync-notion.yml` cron tick then propagates these new URLs into the HTML files automatically (data-notion-bg, og:image, twitter:image, JSON-LD RealEstateListing image — all four covered by PR #132).

## One-time setup

### 1. Enable Cloudflare Images (paid plan)
- Dashboard → Images → Subscribe to Images plan ($5/month for 100K images)
- Account ID: `2adeb401a00c6f459573f25eabb790da` (already wired into the workflow as a default)

### 2. Create Cloudflare API token
- Cloudflare dashboard → My Profile → API Tokens → Create Token
- Template: **Custom token**
- Permissions: `Account → Cloudflare Images → Edit`
- Account resources: include this account only
- Save the generated token

### 3. (Optional) Google service account for Drive PDF route
**Skip this if you're only using the Berkeley web page route.** The Berkeley `--berkeley-page` scrape works without any Drive auth.

If you want the Drive PDF fallback:
- Google Cloud Console → APIs & Services → Credentials → Create Service Account
- Grant roles: none (just needs auth)
- Create key → JSON → download
- Enable the Drive API in the same project
- In each Drive `GS Source Folder`, share with the service account email (Viewer is enough)

### 4. Add GitHub repo secrets
Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Required for | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | All routes | From step 2 |
| `NOTION_TOKEN` | All routes | (already configured) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Drive route only | Full contents of the JSON key file from step 3 |

For Berkeley-only operation, the first two are sufficient.

## Usage

### Trigger from GitHub Actions tab
1. Actions → **Sync Images → Cloudflare**
2. Run workflow
3. Optional: enter a single slug (e.g. `fulham-reach-palmer-house-london`) to test
4. Optional: tick `replace` to re-upload existing CF URLs

### Local run (one-shot)
With all env vars set:
```bash
cd scripts
npm install
npm run images -- --slug fulham-reach-palmer-house-london
```

### Local run — Berkeley page route (no Drive auth needed)
```bash
CLOUDFLARE_API_TOKEN=... NOTION_TOKEN=... \
node sync-images.mjs \
  --slug fulham-reach-palmer-house-london \
  --berkeley-page "https://www.berkeleygroup.co.uk/developments/london/fulham/fulham-reach/palmer-house"
```

### Local run — Drive PDF route (already downloaded PDF)
```bash
node sync-images.mjs \
  --slug fulham-reach-palmer-house-london \
  --pdf ./brochure.pdf
```

### Local run — combined Berkeley + PDF
```bash
CLOUDFLARE_API_TOKEN=... NOTION_TOKEN=... \
node sync-images.mjs \
  --slug fulham-reach-palmer-house-london \
  --berkeley-page "https://www.berkeleygroup.co.uk/developments/london/fulham/fulham-reach/palmer-house" \
  --pdf ./palmer-house-brochure.pdf
```

### Test mode (no Notion writes)
```bash
CLOUDFLARE_API_TOKEN=... \
node sync-images.mjs \
  --slug fulham-reach-palmer-house-london \
  --berkeley-page "https://www.berkeleygroup.co.uk/developments/london/fulham/fulham-reach/palmer-house" \
  --dry-run \
  --keep-tmp
```

This will:
- Scrape the Berkeley page for `.ashx` URLs, bump to 1920×1080, download
- Filter + rank + take top 5
- Upload to Cloudflare Images with `<slug>-hero`, `<slug>-1..4` custom IDs
- Print URLs to stdout
- Skip the Notion update step
- Leave the working dir at `/tmp/sync-images-…` for inspection

## CLI flags

| Flag | Effect |
|---|---|
| `--slug <slug>` | Process one specific property by Notion `🔗 Slug` |
| `--pdf <path>` | Use a local PDF instead of downloading from Drive |
| `--berkeley-page <url>` | Scrape this Berkeley Group page for `.ashx` URLs (the recommended route — no Drive auth needed) |
| `--berkeley-urls <file>` | JSON array of image URLs in a local file (alternative to scraping) |
| `--dry-run` | Skip Notion writes |
| `--keep-tmp` | Don't clean up the working dir (for debugging) |
| `--replace` | Re-upload even if Image URL is already on `imagedelivery.net` |

Sources are **additive** — you can combine `--pdf` + `--berkeley-page` and the filter+rank step will pick the top 5 across all candidates.

### Notion fields the script reads

| Field | Type | Used for |
|---|---|---|
| `🔗 Slug` | Text | Filename + CF custom ID |
| `Image URL` | URL | Decides whether to process (placeholder = yes, CF URL = skip unless `--replace`) |
| `GS Source Folder` | URL | Drive PDF route (needs Google SA) |
| `🌐 Berkeley Page URL` | URL | Berkeley page scrape route (no auth needed) |
| `📷 Image URLs JSON` | Text | Explicit URL list (alternative to scraping) |

## Filename / ID conventions

- CF Images custom ID: `<slug>-hero`, `<slug>-1`, `<slug>-2`, `<slug>-3`, `<slug>-4`
- Delivery URL: `https://imagedelivery.net/<account_hash>/<slug>-hero/public`
- Account hash is returned in the upload response and embedded in the URL — no separate config needed

If a custom ID already exists at upload time, the script will either:
- Skip + reuse the existing URL (default)
- Delete + re-upload (when `--replace` is set)

## Filtering rules

| Rule | Why |
|---|---|
| `width ≥ 1500px` | Berkeley CDN serves up to 1920px; PDF heroes are typically 1800+. Anything smaller is a thumbnail rendition that didn't bump |
| `width ≥ height` (landscape) | Drops vertical brochure spreads (e.g., 1818×2389) which look weird as hero backgrounds |
| `file size ≥ 150KB` | CDN-served JPEGs at 1920×933 land at 150–300KB. Below that = thumbnail |
| `bytes/pixel ≥ 0.05` | **Drops abstract design graphics** (wave gradients, colour blocks) that compress unusually small. Real photos sit at 0.10–0.30 b/px; flat-colour designs sit at <0.05 b/px |
| Dedupe by SHA-256 | PDF compositing duplicates the same image multiple times for layering |
| Sort by pixel area DESC | Largest image wins, regardless of CDN compression (file-size sort was misleading) |

Tunable constants in `sync-images.mjs`:

```js
const MIN_WIDTH = 1500;
const MIN_FILE_SIZE = 150_000;
const MIN_BYTES_PER_PIXEL = 0.05;
```

### Berkeley CDN URL bumping

The script swaps `?h=121&w=250` → `?h=1080&w=1920` on Berkeley `.ashx` URLs. This works for `/gallery/` paths reliably. `/feature/` and `/thumbnail/` paths often stay stuck at their original size — these get filtered out by the width/size cascade.

## Cost reference

Per 1,000 properties processed:
- Storage: 5 images × 1,000 = 5,000 images. Free tier: 5,000 images included.
- Bandwidth: priced at ~$1 per 100K delivery requests. Negligible at this scale.
- Total: ~$5/month for the Images plan + Notion API quota only.

## Failure modes & recovery

| Error | Cause | Fix |
|---|---|---|
| `CLOUDFLARE_API_TOKEN env var required` | Missing secret | Add to GH secrets |
| `Cloudflare upload failed: ... code 7003` | Invalid token | Recreate with correct permissions |
| `no PDFs to process, skipping` | GS Source Folder empty or wrong URL | Check Notion field |
| `no usable images found` | All extracted images failed the size filter | Lower thresholds or check brochure content |
| Drive `403: insufficient permissions` | Service account not shared on the folder | Share the folder with the service account email |
