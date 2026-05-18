# NAC Image Sync — Cloudflare Images Pipeline

End-to-end automation: brochure PDF in Google Drive → embedded images extracted → uploaded to Cloudflare Images → URLs written back to Notion.

`scripts/sync-images.mjs` + `.github/workflows/sync-images.yml`.

## What it does

For each Notion property (filter: `Hub Status = Live` AND `Image URL` empty or still on the `wp-content/uploads/2026/05/` placeholder):

1. Parse `GS Source Folder` URL → Drive folder ID
2. List PDFs in that folder (recurses one level for sub-phase folders)
3. Download each PDF
4. Extract embedded JPEG images via `pdfimages -j` (poppler-utils)
5. Filter to images ≥ 800px wide, ≥ 50KB. Dedupe by SHA-256 hash. Sort by file size DESC.
6. Take top 5. Upload to Cloudflare Images with custom IDs:
   - `<slug>-hero` → `Image URL` (Notion)
   - `<slug>-1` through `<slug>-4` → `🖼️ Image 1-4` (Notion)
7. Write the 5 `imagedelivery.net/.../public` URLs to Notion

The next `sync-notion.yml` cron tick then propagates these new URLs into the HTML files automatically (data-notion-bg fields).

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

### 3. Create Google service account for Drive access
- Google Cloud Console → APIs & Services → Credentials → Create Service Account
- Grant roles: none (just needs auth)
- Create key → JSON → download
- Enable the Drive API in the same project
- In each Drive `GS Source Folder`, share with the service account email (Viewer is enough)
- The folder permissions need to include this service account for it to read PDFs

### 4. Add GitHub repo secrets
Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | From step 2 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full contents of the JSON key file from step 3 |
| `NOTION_TOKEN` | (already configured) |

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

### Local run without Drive auth (PDF already downloaded)
```bash
node sync-images.mjs \
  --slug fulham-reach-palmer-house-london \
  --pdf ./brochure.pdf
```

### Test mode (no Notion writes, no Drive)
```bash
CLOUDFLARE_API_TOKEN=... \
node sync-images.mjs \
  --slug fulham-reach-palmer-house-london \
  --pdf /tmp/fulham-reach.pdf \
  --dry-run \
  --keep-tmp
```

This will:
- Extract images from the local PDF
- Upload to Cloudflare Images with `<slug>-hero`, `<slug>-1..4` custom IDs
- Print URLs to stdout
- Skip the Notion update step
- Leave the working dir at `/tmp/sync-images-…` for inspection

## CLI flags

| Flag | Effect |
|---|---|
| `--slug <slug>` | Process one specific property by Notion `🔗 Slug` |
| `--pdf <path>` | Use a local PDF instead of downloading from Drive |
| `--dry-run` | Skip Notion writes |
| `--keep-tmp` | Don't clean up the working dir (for debugging) |
| `--replace` | Re-upload even if Image URL is already on `imagedelivery.net` |

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
| `width ≥ 800px` | Hero/gallery images on PDPs are full-bleed — anything smaller looks bad |
| `file size ≥ 50KB` | Small files are usually UI elements (logos, icons, dividers) |
| Dedupe by SHA-256 | PDF compositing duplicates the same image multiple times for layering |
| Sort by file size DESC | The largest JPEGs in a brochure are virtually always the photographic renders |

If too few/too many images pass — adjust the constants in `sync-images.mjs`:

```js
const MIN_WIDTH = 800;
const MIN_FILE_SIZE = 50_000;
```

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
