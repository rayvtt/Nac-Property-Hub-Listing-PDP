#!/usr/bin/env node
// scripts/sync-images.mjs
//
// End-to-end image pipeline for NAC property listings:
//   1. For each target property (--slug, or all Live properties with placeholder
//      Image URLs):
//   2. Collect image candidates from up to three sources, in this order of preference:
//        a. Notion `🌐 Berkeley Page URL` (or --berkeley-page) — scrape .ashx URLs
//           from a Berkeley Group development page, bump to 1920x1080, download
//        b. Notion `📷 Image URLs JSON` (or --berkeley-urls) — explicit URL list
//        c. Notion `GS Source Folder` (or --pdf) — Drive brochure PDFs,
//           extracted via pdfimages -j
//   3. Filter candidates (landscape, ≥1500px wide, ≥150KB, ≥0.05 bytes/pixel —
//      the bytes/pixel rule drops brochure design graphics like coloured waves)
//   4. Dedupe by SHA-256, sort by pixel area DESC, take top 5
//   5. Upload to Cloudflare Images with custom IDs (<slug>-hero, <slug>-1..4)
//   6. Write back the public-variant URLs to Notion:
//      Image URL  → hero
//      🖼️ Image 1-4 → gallery 1-4
//
// Required env:
//   CLOUDFLARE_API_TOKEN     — Cloudflare API token with `Cloudflare Images: Edit`
//   CLOUDFLARE_ACCOUNT_ID    — default: 2adeb401a00c6f459573f25eabb790da (NAC account)
//   NOTION_TOKEN             — Notion integration token
//   Drive auth (only needed for Drive PDF route — Berkeley web works without):
//     Option A (preferred): GSC_OAUTH_CLIENT_ID + GSC_OAUTH_CLIENT_SECRET +
//                           GSC_OAUTH_REFRESH_TOKEN — user-delegated OAuth.
//                           Folders shared with the authorizing Google account
//                           work without per-folder permission edits.
//     Option B (fallback):  GOOGLE_SERVICE_ACCOUNT_JSON — requires each Drive
//                           folder to be shared with the SA email.
//   NOTION_DATABASE_ID       — default: 35848ec25e86803283acc7ad989649c9
//
// CLI args:
//   --slug <slug>            — process just one property
//   --pdf <path>             — use a local PDF instead of downloading from Drive
//   --berkeley-page <url>    — scrape this Berkeley page for .ashx image URLs
//   --berkeley-urls <file>   — JSON array of image URLs (alternative to --berkeley-page)
//   --dry-run                — extract + upload but don't write to Notion
//   --keep-tmp               — don't clean up /tmp/sync-images-* working dir
//   --replace                — re-upload even if Image URL is already a CF URL

import { Client as NotionClient } from '@notionhq/client';
import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import { google } from 'googleapis';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ─── Config ─────────────────────────────────────────────────────────────
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '2adeb401a00c6f459573f25eabb790da';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GSC_OAUTH_CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID;
const GSC_OAUTH_CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const GSC_OAUTH_REFRESH_TOKEN = process.env.GSC_OAUTH_REFRESH_TOKEN;
const HAS_DRIVE_OAUTH = !!(GSC_OAUTH_CLIENT_ID && GSC_OAUTH_CLIENT_SECRET && GSC_OAUTH_REFRESH_TOKEN);

// Filter constants — tuned for Berkeley CDN + PDF extraction observed in
// production. See NAC-IMAGE-SYNC.md for the calibration data.
const MIN_WIDTH = 1500;             // Berkeley CDN caps at 1920px, PDF heroes are typically 1800+
const MIN_FILE_SIZE = 150_000;      // CDN-served JPEGs at 1920x933 land at 150-300KB
const MIN_BYTES_PER_PIXEL = 0.05;   // Brochure abstract graphics (waves, colour blocks) compress
                                    // far below 0.05 bytes/pixel because of large flat regions.
                                    // Real photos sit at 0.1-0.3 bytes/pixel.

// A floor/site/unit plan must NEVER become a hero/cover or a gallery image
// (user-facing rule). They're caught two ways — by filename and by content —
// because plans come at full photo resolution (e.g. 8000×5565 = 44.5 MP, 1.44
// aspect, indistinguishable from a real render by dimensions alone). We also
// cap megapixels/bytes so a giant stitched plan (23000×6134 = 141 MP, 89 MB)
// can't blow Cloudflare's upload limits (errors 5413/5443).
const MAX_MEGAPIXELS = 50;          // CF-upload safety; real photos here cap ~16-45 MP
const MAX_FILE_BYTES = 18_000_000;  // under CF's 20 MB hard cap, leaving margin

// Floor / site / unit plans and other line-drawing schematics. Matched against
// the source filename (Drive) or URL.
const FLOORPLAN_RX = /(floor[\s_-]*plan|floor[\s_-]*plate|site[\s_-]*plan|master[\s_-]*plan|masterplan|unit[\s_-]*plan|apartment[\s_-]*plan|key[\s_-]*plan|level[\s_-]*\d|\btypical\b|podium|\bplan\b|\bplans\b|\bfp\d|schedule|elevation|section[\s_-]*drawing|floorplan)/i;

// Maps / location diagrams — never acceptable as a listing image. (Aerial PHOTOS
// are fine and are NOT matched here; only map/diagram keywords.)
const MAP_RX = /(\bmap\b|location[\s_-]*map|locality|context[\s_-]*plan|connection[s]?[\s_-]*map|transport[\s_-]*map|precinct[\s_-]*map|street[\s_-]*map|wayfinding|distance[s]?[\s_-]*map|google[\s_-]*map)/i;

// Bare land / lot photos — empty sites, not a building. Filename-only signal
// (content can't be told from any landscape); visual review catches the rest.
const LANDLOT_RX = /(\blot[\s_-]*\d|\bland[\s_-]*(lot|parcel|size)|vacant|allotment|cleared[\s_-]*site|empty[\s_-]*site|raw[\s_-]*land)/i;

// A floor plan, map, or land-lot image is NEVER an acceptable listing image —
// not as a hero/cover and not in the gallery (user rule). Drop on filename.
function isUnusableRef(srcRef) {
  const lc = String(srcRef || '').toLowerCase();
  if (FLOORPLAN_RX.test(lc)) return 'floor/site plan (filename)';
  if (MAP_RX.test(lc)) return 'map/location diagram (filename)';
  if (LANDLOT_RX.test(lc)) return 'bare land/lot (filename)';
  return null;
}

// Content-based plan detection. Floor plans are flat white line-art: a large
// fraction of near-white pixels and very low colour saturation. Real renders —
// even bright all-white interiors — have gradients/shadows/reflections, so they
// never hit a high pure-white fraction. Calibrated on known samples:
//   floor plan : white≈0.62, meanSat≈0.05   →  DROP
//   photos     : white≤0.03, meanSat≥0.17   →  keep
// Uses ImageMagick (already a CI dependency). Fails safe (returns false) if the
// command errors so the pipeline never breaks.
function looksLikePlan(filePath) {
  try {
    const whiteFrac = Number(sh(`convert "${filePath}" -resize 160x160! -colorspace Gray -threshold 94% -format "%[fx:mean]" info:`).trim());
    const meanSat = Number(sh(`convert "${filePath}" -resize 160x160! -colorspace HSL -channel G -separate +channel -format "%[fx:mean]" info:`).trim());
    if (!Number.isFinite(whiteFrac) || !Number.isFinite(meanSat)) return false;
    return whiteFrac >= 0.25 && meanSat <= 0.12;
  } catch {
    return false;
  }
}

// ─── CLI parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY_SLUG = opt('--slug');
const ONLY_COUNTRY = process.env.ONLY_COUNTRY || opt('--country') || '';
const LOCAL_PDF = opt('--pdf');
const BERKELEY_PAGE_ARG = opt('--berkeley-page');
const BERKELEY_URLS_FILE = opt('--berkeley-urls');
const DRY_RUN = flag('--dry-run');
const KEEP_TMP = flag('--keep-tmp');
const REPLACE = flag('--replace');

// ─── Helpers ────────────────────────────────────────────────────────────
function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
}

function fileHash(filePath) {
  const buf = sh(`sha256sum "${filePath}"`).split(' ')[0];
  return buf;
}

function imageDims(filePath) {
  try {
    const out = sh(`identify -format "%wx%h" "${filePath}"`);
    const [w, h] = out.split('x').map(Number);
    return { width: w, height: h };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function fileSize(filePath) {
  const s = await fs.stat(filePath);
  return s.size;
}

// ─── Berkeley Group CDN helpers ──────────────────────────────────────────
// Berkeley's `.ashx` URLs accept ?h= and ?w= query params. /gallery/ paths
// reliably bump to 1920x933. /feature/ and /thumbnail/ paths often stay
// stuck at their original thumbnail size — we filter those out post-download.
function bumpBerkeleyUrl(url) {
  return url
    .replace(/([?&])h=\d+/i, '$1h=1080')
    .replace(/([?&])w=\d+/i, '$1w=1920');
}

// Scrape a Berkeley Group development page for .ashx image URLs.
// Looks at img[src], img[data-src], source[srcset], a[href] — anything that
// resolves to a Berkeley media path.
//
// Also follows sub-phase links one level deep. Berkeley pages like
// /developments/london/bermondsey/bermondsey-place link to /the-art-house and
// /the-art-mill — the sub-phase pages have richer galleries than the main
// landing page (which sticks to header + features + thumbnails).
async function scrapeBerkeleyPage(pageUrl, depth = 0) {
  const res = await fetch(pageUrl);
  if (!res.ok) throw new Error(`Berkeley page ${pageUrl} → HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const urls = new Set();
  const visit = (raw) => {
    if (!raw) return;
    // Handle srcset format ("url1 1x, url2 2x")
    for (const part of raw.split(',').map(s => s.trim().split(/\s+/)[0])) {
      if (part && part.includes('.ashx')) {
        const full = part.startsWith('//') ? `https:${part}`
                   : part.startsWith('/') ? `https://www.berkeleygroup.co.uk${part}`
                   : part;
        urls.add(full);
      }
    }
  };
  $('img').each((_, el) => { visit($(el).attr('src')); visit($(el).attr('data-src')); visit($(el).attr('srcset')); });
  $('source').each((_, el) => { visit($(el).attr('srcset')); });
  $('a').each((_, el) => { visit($(el).attr('href')); });

  // Follow sub-phase links (one level deep)
  if (depth === 0) {
    const basePath = new URL(pageUrl).pathname.replace(/\/+$/, '');
    const subPages = new Set();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      // Normalize to absolute
      let absUrl;
      try {
        absUrl = new URL(href, pageUrl).toString();
      } catch { return; }
      const u = new URL(absUrl);
      if (u.host !== 'www.berkeleygroup.co.uk') return;
      const sub = u.pathname.replace(/\/+$/, '');
      // Must be a strict sub-path of the main page (one level deeper)
      if (sub.startsWith(basePath + '/') && sub.split('/').length === basePath.split('/').length + 1) {
        subPages.add(`https://www.berkeleygroup.co.uk${sub}`);
      }
    });
    for (const sub of subPages) {
      try {
        const subUrls = await scrapeBerkeleyPage(sub, 1);
        for (const u of subUrls) urls.add(u);
      } catch { /* skip failed sub-pages */ }
    }
  }

  return [...urls];
}

async function downloadUrl(url, destPath) {
  let res = await fetch(url, { redirect: 'follow' });
  // Some CDNs (Kiler GYO, Hyatt newsroom, etc.) hot-link-protect via Referer.
  // Retry with a same-origin Referer + browser UA when blocked.
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    const origin = new URL(url).origin;
    res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'Referer': origin + '/',
        'User-Agent': 'Mozilla/5.0 (compatible; NAC-Listings-Sync/1.0)',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*',
      },
    });
  }
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return destPath;
}

// ─── Cloudflare Images ──────────────────────────────────────────────────
async function uploadToCloudflareImages(filePath, customId) {
  if (!CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN env var required');

  // If the image already exists at this ID, delete first (Cloudflare requires unique IDs)
  if (REPLACE) {
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1/${encodeURIComponent(customId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } }
    ).catch(() => {});
  }

  const fileBuf = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBuf]), fileName);
  formData.append('id', customId);
  formData.append('requireSignedURLs', 'false');

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
      body: formData,
    }
  );
  const data = await res.json();
  if (!data.success) {
    // Image with this ID already exists → fetch it
    const code = data.errors?.[0]?.code;
    if (code === 5409 || code === 5410) {
      const get = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1/${encodeURIComponent(customId)}`,
        { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` } }
      );
      const existing = await get.json();
      if (existing.success) {
        const v = existing.result.variants?.find(v => v.endsWith('/public')) || existing.result.variants?.[0];
        return v;
      }
    }
    throw new Error(`Cloudflare upload failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result.variants.find(v => v.endsWith('/public')) || data.result.variants[0];
}

// ─── PDF extraction ─────────────────────────────────────────────────────
async function extractImagesFromPdf(pdfPath, workDir) {
  const outPrefix = path.join(workDir, `img-${Date.now()}-`);
  try {
    sh(`pdfimages -j "${pdfPath}" "${outPrefix}"`);
  } catch (err) {
    console.warn(`  pdfimages warning on ${pdfPath}: ${err.message}`);
  }
  const dir = await fs.readdir(workDir);
  return dir
    .filter(f => f.startsWith(path.basename(outPrefix)) && f.endsWith('.jpg'))
    .map(f => path.join(workDir, f));
}

// Classify an image by URL/path keywords. Used to assign images to slots:
//
//   slot 0 (hero) + slot 1 (gallery_1, §05) → aspirational (wow shots)
//   slot 2 (gallery_2, §08)                 → interior (flat details)
//   slot 3 (gallery_3, §11, ending image)   → overview (building/area exterior)
//   slot 4 (unused in template)             → filler
//
// 'unclassified' is treated as a wildcard — eligible for any slot when its
// classification can't be inferred (typically PDF-extracted images).
function classifyImage(srcRef) {
  const lc = (srcRef || '').toLowerCase();

  // STOCK-LIFESTYLE — Berkeley's _lifestyleN paths are people-centric stock
  // photos (couples/families/selfies) that don't show the property. Excluded
  // from every slot priority list in pickFinalFive so they never appear on PDPs.
  if (/_lifestyle\d+|\/lifestyle\d+|lifestyle\d+[-_]/.test(lc)) return 'stock-lifestyle';

  // ASPIRATIONAL — hero shots, terrace views, premium amenities
  if (/\/(header|hero)\//.test(lc)) return 'aspirational';
  if (/(terrace-views?|penthouses?|sunrise-to-sunset|highlight-feature)/.test(lc)) return 'aspirational';
  if (/(beach-club|solaris-lounge|minus-one-club|the-club|tamesis-club|rooftop|sky-?bar|olive-grove)/.test(lc)) return 'aspirational';

  // INTERIOR — flat details, specifications, individual rooms
  if (/\/(internal|specification|interiors?)\//.test(lc)) return 'interior';
  if (/(kitchen|bathroom|bedroom|ensuite|spec_|showhome|living-?room)/.test(lc)) return 'interior';
  if (/\d+-bed-/.test(lc)) return 'interior';   // X-bed-apartment, X-bed-int, X-bed-suite — flat-unit shots
  if (/studio-apartment/.test(lc)) return 'interior';

  // OVERVIEW — exterior building, neighbourhood, area context
  if (/\/(external|exterior)/.test(lc)) return 'overview';
  if (/(townhouses|current-phase-image|phase-thumb|aerial|outdoor|building|courtyard)/.test(lc)) return 'overview';
  if (/(neighbourhood|park-life|connections-map|burgess-park|food-drink|cultural|kia-oval|cricket)/.test(lc)) return 'overview';
  if (/thames|river/.test(lc)) return 'overview';
  if (/(amenity-image|facilities-image)/.test(lc)) return 'overview'; // generic building facility renders

  return 'unclassified';
}

async function filterAndRank(candidates) {
  // candidates: [{ path, src, srcRef }] — srcRef is the original URL or PDF
  // path used to classify (URL keywords work for web; PDFs default to unclassified)
  const enriched = [];
  for (const c of candidates) {
    const dims = imageDims(c.path);
    if (!dims.width || !dims.height) continue;
    const size = await fileSize(c.path);
    const hash = fileHash(c.path);
    const pixels = dims.width * dims.height;
    const bytesPerPixel = pixels > 0 ? size / pixels : 0;
    const classification = classifyImage(c.srcRef || c.path);
    enriched.push({ ...c, ...dims, size, hash, pixels, bytesPerPixel, classification });
  }
  // Dedupe by content hash
  const seen = new Set();
  const deduped = enriched.filter(img => {
    if (seen.has(img.hash)) return false;
    seen.add(img.hash);
    return true;
  });

  // Hard-drop floor/site plans, oversized stitched panoramas, and anything that
  // would blow Cloudflare's upload limits. Floor plans must never reach a hero
  // or gallery slot (user-facing rule); the giant stitched plans also fail the
  // CF upload (5413/5443) so dropping them lets real photos win the slots.
  const megapixels = (img) => img.pixels / 1_000_000;
  const dropReason = (img) => {
    const byName = isUnusableRef(img.srcRef || img.path);
    if (byName) return byName;
    if (megapixels(img) > MAX_MEGAPIXELS) return `${megapixels(img).toFixed(0)}MP > ${MAX_MEGAPIXELS}MP (stitched plan/panorama — CF limit)`;
    if (img.size > MAX_FILE_BYTES) return `${(img.size / 1e6).toFixed(0)}MB > CF limit`;
    if (looksLikePlan(img.path)) return 'floor/site plan (content: white line-art)';
    return null;
  };
  const unique = [];
  let dropped = 0;
  for (const img of deduped) {
    const reason = dropReason(img);
    if (reason) {
      dropped++;
      console.log(`     ✂ dropped ${img.src}/${path.basename(String(img.srcRef || img.path))} — ${reason}`);
    } else {
      unique.push(img);
    }
  }
  if (dropped) console.log(`     ✂ excluded ${dropped} floor-plan/oversize candidate(s)`);
  // Filter cascade (two-pass — strict first, relaxed only if shortage):
  //   Strict:  width ≥ 1500, landscape, ≥150KB, ≥0.05 b/px
  //   Relaxed: width ≥ 1000, landscape, ≥80KB,  ≥0.04 b/px
  //
  // Strict thresholds were tuned for Berkeley CDN + brochure PDFs which yield
  // abundant 1800px+ heroes. For projects on smaller-CMS Turkish/SEA sources,
  // strict often produces too few candidates to fill the 5 slots — leaving
  // gaps in the gallery (Yeni had only 2/5, Referans had 0/5).
  //
  // We try strict first; if it produces <5 candidates, we re-run with the
  // relaxed pass and merge unique results. Strict candidates still rank above
  // relaxed ones via the existing pixel-area sort.
  const passStrict = (img) =>
    img.width >= MIN_WIDTH
    && img.width >= img.height
    && img.size >= MIN_FILE_SIZE
    && img.bytesPerPixel >= MIN_BYTES_PER_PIXEL;
  const passRelaxed = (img) =>
    img.width >= 1000
    && img.width >= img.height
    && img.size >= 80_000
    && img.bytesPerPixel >= 0.04;

  const strict = unique.filter(passStrict);
  let filtered = strict;
  if (strict.length < 5) {
    const strictHashes = new Set(strict.map(i => i.hash));
    const relaxedExtras = unique
      .filter(passRelaxed)
      .filter(i => !strictHashes.has(i.hash));
    filtered = [...strict, ...relaxedExtras];
    console.log(`     ⚠ strict filter yielded ${strict.length}/5 — added ${relaxedExtras.length} relaxed candidate(s)`);
  }
  // Sort by pixel area DESC — bigger image wins within each classification bucket
  return filtered.sort((a, b) => b.pixels - a.pixels);
}

// Diversity score between two candidates (higher = more visually different).
// For PDF candidates, uses pdfimages filename index distance — adjacent indices
// usually share a brochure page or spread, so different subjects sit far apart.
// For mixed sources or different URL classifications, treats them as inherently
// diverse (large score).
function diversityScore(a, b) {
  if (!a || !b) return 0;
  let score = 0;
  // Different bucket classifications → strong diversity signal
  if (a.classification !== b.classification) score += 1000;
  // Different sources (pdf vs web-page vs web-list) → moderate diversity
  if (a.src !== b.src) score += 500;
  // Same source: use filename-index distance (PDF outputs like prefix-NNN.jpg)
  if (a.src === b.src && a.src === 'pdf') {
    const ai = parseInt(path.basename(a.path).match(/-(\d+)\.jpg$/)?.[1] || '0');
    const bi = parseInt(path.basename(b.path).match(/-(\d+)\.jpg$/)?.[1] || '0');
    score += Math.abs(ai - bi);
  }
  // Same source web pages: different URL path segments → diverse
  if (a.srcRef && b.srcRef && typeof a.srcRef === 'string' && typeof b.srcRef === 'string') {
    const aSegs = new Set(a.srcRef.split('/'));
    const bSegs = new Set(b.srcRef.split('/'));
    const overlap = [...aSegs].filter(s => bSegs.has(s)).length;
    const total = aSegs.size + bSegs.size;
    if (total > 0) score += (1 - overlap / total) * 50;
  }
  return score;
}

// Pick the final 5 images by classification → slot assignment.
// See classifyImage() for the slot-to-class mapping rationale.
// Slot 3 (§11 ending) enforces visual diversity from slot 0 (hero) — picks
// the candidate with the largest diversity score from each bucket.
function pickFinalFive(ranked) {
  // 'stock-lifestyle' is intentionally absent — those images get dropped here.
  const buckets = { aspirational: [], overview: [], interior: [], unclassified: [] };
  for (const img of ranked) {
    if (buckets[img.classification]) buckets[img.classification].push(img);
  }

  const used = new Set();
  const pickFrom = (priorities) => {
    for (const bucket of priorities) {
      for (const img of buckets[bucket]) {
        if (!used.has(img.hash)) { used.add(img.hash); return img; }
      }
    }
    return null;
  };

  // Diversity-aware variant for slot 3: within each priority bucket, pick the
  // candidate with the highest diversity score from the given reference image.
  // Falls back to pixel area on ties (preserves the "biggest wins" default).
  const pickDiverse = (priorities, reference) => {
    for (const bucket of priorities) {
      const candidates = buckets[bucket].filter(img => !used.has(img.hash));
      if (!candidates.length) continue;
      const scored = candidates.map(c => ({ img: c, score: diversityScore(reference, c) }));
      scored.sort((a, b) => b.score - a.score || b.img.pixels - a.img.pixels);
      const picked = scored[0].img;
      used.add(picked.hash);
      return picked;
    }
    return null;
  };

  const hero = pickFrom(['aspirational', 'unclassified', 'overview', 'interior']);                   // 0
  const g1   = pickFrom(['aspirational', 'unclassified', 'overview', 'interior']);                   // 1 §05
  const g2   = pickFrom(['interior', 'unclassified', 'overview', 'aspirational']);                   // 2 §08
  const g3   = pickDiverse(['overview', 'unclassified', 'interior', 'aspirational'], hero);          // 3 §11 (diverse from hero)
  const g4   = pickFrom(['unclassified', 'overview', 'interior', 'aspirational']);                   // 4 filler

  return [hero, g1, g2, g3, g4].filter(img => img !== null);
}

// ─── Google Drive ───────────────────────────────────────────────────────
// OAuth (user delegation) preferred — folders shared with a human Google
// account "Just Work" without per-folder service-account adds. Falls back
// to the service account JSON when OAuth isn't configured.
function getDriveClient() {
  // Service account first when its key is present: SA keys never expire, so the
  // automation needs no periodic re-auth. User-delegated OAuth (GSC_OAUTH_*) is
  // the fallback — its refresh token CAN expire/revoke (→ invalid_grant), so
  // it's not used as the primary path. The GSC_OAUTH_* secrets stay in place
  // (still consumed by seo-audit); they're just not preferred for Drive here.
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return google.drive({ version: 'v3', auth });
  }
  if (HAS_DRIVE_OAUTH) {
    const auth = new google.auth.OAuth2(GSC_OAUTH_CLIENT_ID, GSC_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: GSC_OAUTH_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth });
  }
  throw new Error('No Drive auth configured (need GOOGLE_SERVICE_ACCOUNT_JSON or GSC_OAUTH_*)');
}

function parseFolderIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Files we never want to extract images from — these PDFs are present in
// many partner Drive folders and only contain text/forms/legal screenshots,
// never project renders. Matching is case-insensitive, accent-insensitive,
// and operates on the file name.
const NON_BROCHURE_PDF_PATTERNS = [
  /quy[\s_-]*tr[ìi]nh/i,        // "quy trình" = process
  /th[uủ][\s_-]*t[uụ]c/i,       // "thủ tục" = procedure
  /ph[uươ]ng[\s_-]*[áa]n/i,     // "phương án" = options
  /h[oồ][\s_-]*s[oơ]/i,         // "hồ sơ" = dossier/file
  /ph[áa]p[\s_-]*l[ýy]/i,       // "pháp lý" = legal
  /timeline/i,
  /policy/i,
  /process/i,
  /procedure/i,
  /legal/i,
  /immigration/i,
  /price[\s_-]*list/i,
];
const MIN_BROCHURE_PDF_BYTES = 1_000_000; // brochures with renders are ≥1MB; process PDFs are usually <500KB

function isBrochurePdf({ name, size }) {
  if (size != null && Number(size) < MIN_BROCHURE_PDF_BYTES) return false;
  if (!name) return true;
  return !NON_BROCHURE_PDF_PATTERNS.some(re => re.test(name));
}

async function listPdfsInDriveFolder(folderId) {
  const drive = getDriveClient();
  // List subfolders + PDFs recursively (1 level deep is enough for the NAC setup)
  const top = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.folder')`,
    fields: 'files(id, name, mimeType, size)',
    pageSize: 100,
  });
  const pdfs = [];
  for (const f of top.data.files) {
    if (f.mimeType === 'application/pdf') {
      pdfs.push({ id: f.id, name: f.name, size: f.size });
    } else if (f.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await drive.files.list({
        q: `'${f.id}' in parents and mimeType = 'application/pdf'`,
        fields: 'files(id, name, size)',
        pageSize: 100,
      });
      pdfs.push(...sub.data.files.map(p => ({ id: p.id, name: p.name, size: p.size })));
    }
  }
  // Filter out non-brochure PDFs (process docs, legal forms, timelines, price
  // lists). These exist in every Greek/Vietnamese Drive partner folder and
  // their generic government / Acropolis stock photography otherwise pollutes
  // the candidate set, drowning out the actual brochure renders.
  const filtered = pdfs.filter(isBrochurePdf);
  const skipped = pdfs.length - filtered.length;
  if (skipped > 0) {
    console.log(`     filtered out ${skipped} non-brochure PDF(s) (process/legal/timeline/<1MB)`);
  }
  return filtered;
}

// List loose image files (JPG/PNG/WebP) in a Drive folder, recursing into
// subfolders up to `maxDepth` levels. Many partner folders keep the renders as
// loose files in a nested "CGIs" / "Renders" subfolder (e.g. project →
// "MACQUARIE PARK, NATURA" → "CGIs"), NOT inside a PDF — listPdfsInDriveFolder
// only sees top-level PDFs and misses these. BFS with a scan cap so a huge
// shared drive can't blow up. Returns [{ id, name, size }].
async function listImagesInDriveFolder(folderId, maxDepth = 4) {
  const drive = getDriveClient();
  const images = [];
  let frontier = [{ id: folderId, depth: 0 }];
  let scanned = 0;
  while (frontier.length && scanned < 80) {
    const next = [];
    for (const node of frontier) {
      if (scanned >= 80) break;
      scanned++;
      const res = await drive.files.list({
        q: `'${node.id}' in parents and (mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder')`,
        fields: 'files(id, name, mimeType, size)',
        pageSize: 200,
      });
      for (const f of res.data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (node.depth + 1 < maxDepth) next.push({ id: f.id, depth: node.depth + 1 });
        } else if (/\.(jpe?g|png|webp)$/i.test(f.name || '')) {
          // Restrict to CF-Images-friendly formats; skip tiff/gif/svg/heic.
          images.push({ id: f.id, name: f.name, size: f.size });
        }
      }
    }
    frontier = next;
  }
  return images;
}

async function downloadDrivePdf(fileId, destPath) {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  await fs.writeFile(destPath, Buffer.from(res.data));
  return destPath;
}

// ─── Notion ─────────────────────────────────────────────────────────────
function getNotion() {
  if (!NOTION_TOKEN) throw new Error('NOTION_TOKEN env var required');
  return new NotionClient({ auth: NOTION_TOKEN });
}

const richText = (p) => {
  if (!p) return '';
  if (p.title) return p.title.map(t => t.plain_text).join('');
  if (p.rich_text) return p.rich_text.map(t => t.plain_text).join('');
  return '';
};
const readUrl = (p) => (p && p.url ? p.url : null);

async function fetchLiveProperties(includeNonLive = false) {
  const notion = getNotion();
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      // When targeting a single slug we allow Draft rows through so images can
      // be sourced & verified *before* the listing is flipped Live.
      filter: includeNonLive ? undefined : { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(page => ({
    pageId: page.id,
    slug: richText(page.properties['🔗 Slug']),
    propertyName: richText(page.properties['Property Name']),
    country: page.properties['Country']?.select?.name || '',
    regionCity: richText(page.properties['Region/City']),
    imageUrl: readUrl(page.properties['Image URL']),
    gsSourceFolder: readUrl(page.properties['GS Source Folder']),
    // Optional new fields for the Berkeley web route. Either one is enough.
    berkeleyPage: readUrl(page.properties['🌐 Berkeley Page URL']),
    imageUrlsJson: richText(page.properties['📷 Image URLs JSON']),
  })).filter(p => p.slug);
}

// ─── Web-search fallback ────────────────────────────────────────────────────
// When Drive / Berkeley / URL-list produce zero candidates (e.g. the Drive
// service account doesn't have access to the folder, or the property has no
// brochure), ask Claude to web-search for public images of the property and
// return URLs we can route through Cloudflare.
//
// Cheap (~$0.005 per call with Haiku 4.5 + web_search tool) and runs only when
// other sources fail. Outputs feed into the same filter+rank+upload pipeline
// as Drive PDF extraction, so quality control is identical.

async function searchWebForPropertyImages({ propertyName, regionCity, country }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('     ANTHROPIC_API_KEY not set — skipping web search fallback');
    return [];
  }
  if (!propertyName) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const locationLine = [regionCity, country].filter(Boolean).join(', ');

  const prompt = `Find 8–12 high-resolution public image URLs of the property "${propertyName}"${locationLine ? ` in ${locationLine}` : ''}.

Search the web for:
- The brand's official newsroom / press kit (e.g. newsroom.hyatt.com, news.marriott.com)
- The project's official website
- Real estate listing portals featuring this specific property
- News articles with photography

Requirements for each URL:
- Direct image URL ending in .jpg, .jpeg, .png, or .webp
- Landscape orientation, ≥1500px wide if possible
- Mix of aerial / exterior, interior, amenities, pool, beach
- Skip thumbnails, logos, stock photos, watermarked images

Return ONLY a valid JSON array of strings. No commentary, no markdown fences.
Example: ["https://example.com/hero.jpg", "https://example.com/villa.jpg"]`;

  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    });
    // The final assistant text block contains the JSON. Tool-use blocks are
    // interleaved in resp.content but we only care about plain text.
    let text = '';
    for (const block of resp.content) {
      if (block.type === 'text') text += block.text;
    }
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrMatch) return [];
    const urls = JSON.parse(arrMatch[0]);
    if (!Array.isArray(urls)) return [];
    return urls.filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
  } catch (err) {
    console.warn(`     web search call failed: ${err.message}`);
    return [];
  }
}

async function updateNotionImages(pageId, urls) {
  const notion = getNotion();
  const props = {};
  if (urls[0]) {
    props['Image URL'] = { url: urls[0] };
    // Mobile hero — same CF Image ID, different variant. The "mobile" variant
    // is configured 1080×1920 cover (center-crop to portrait) so the hero
    // looks impactful on ≤900px viewports. CSS in the PDP swaps via
    // `--bg-mobile:url(...)` on the hero element.
    props['Mobile Image URL'] = { url: urls[0].replace(/\/public$/, '/mobile') };
  }
  if (urls[1]) props['🖼️ Image 1'] = { url: urls[1] };
  if (urls[2]) props['🖼️ Image 2'] = { url: urls[2] };
  if (urls[3]) props['🖼️ Image 3'] = { url: urls[3] };
  if (urls[4]) props['🖼️ Image 4'] = { url: urls[4] };
  const update = { page_id: pageId, properties: props };
  // Also set the Notion page cover (banner) to the hero so the row is
  // visually identifiable in gallery/board views.
  if (urls[0]) update.cover = { type: 'external', external: { url: urls[0] } };
  await notion.pages.update(update);
}

// ─── Main ───────────────────────────────────────────────────────────────
async function processProperty(prop) {
  console.log(`\n━━━ ${prop.slug} (${prop.propertyName || ''}) ━━━`);

  const isPlaceholder = !prop.imageUrl
    || prop.imageUrl.includes('/wp-content/uploads/2026/05/');
  const isCloudflare = prop.imageUrl?.includes('imagedelivery.net');

  if (isCloudflare && !REPLACE) {
    // Already imaged — just make sure the Notion page cover is set (idempotent
    // backfill for rows imaged before cover support existed).
    try {
      await getNotion().pages.update({ page_id: prop.pageId, cover: { type: 'external', external: { url: prop.imageUrl } } });
      console.log('  ⤳ already on Cloudflare Images — cover ensured, skipping');
    } catch (e) {
      console.log(`  ⤳ already on Cloudflare Images, skipping (cover update failed: ${e.message})`);
    }
    return;
  }
  if (!isPlaceholder && !REPLACE && !LOCAL_PDF) {
    console.log(`  ⤳ Image URL is non-placeholder external (${prop.imageUrl}) — skipping`);
    return;
  }

  const workDir = await fs.mkdtemp('/tmp/sync-images-');
  console.log(`  workDir: ${workDir}`);

  try {
    // Build the candidate pool from all available sources. Any combination is
    // valid — the filter+rank step at the end picks the best 5 regardless of
    // where each candidate came from.
    const candidates = []; // [{ path, src }]

    // 1a. Berkeley Group web page (scrape .ashx URLs)
    const berkeleyPageUrl = BERKELEY_PAGE_ARG || prop.berkeleyPage;
    if (berkeleyPageUrl) {
      try {
        console.log(`  🌐 scraping Berkeley page: ${berkeleyPageUrl}`);
        const urls = await scrapeBerkeleyPage(berkeleyPageUrl);
        console.log(`     found ${urls.length} .ashx URL(s)`);
        for (let i = 0; i < urls.length; i++) {
          const bumped = bumpBerkeleyUrl(urls[i]);
          const dest = path.join(workDir, `web-page-${i + 1}.jpg`);
          try {
            await downloadUrl(bumped, dest);
            candidates.push({ path: dest, src: 'web-page', srcRef: urls[i] });
          } catch (e) { /* skip individual URL failures */ }
        }
      } catch (err) {
        console.warn(`     scrape failed: ${err.message}`);
      }
    }

    // 1b. Explicit URL list from Notion or --berkeley-urls
    let urlList = [];
    if (BERKELEY_URLS_FILE) {
      try { urlList = JSON.parse(await fs.readFile(BERKELEY_URLS_FILE, 'utf8')); } catch {}
    } else if (prop.imageUrlsJson) {
      // Try strict JSON parse first. If that fails (e.g. Notion auto-linked
      // the URLs and broke the JSON structure), fall back to a regex sweep
      // that pulls every http(s):// URL out of the field text. This is
      // pragmatic: the Notion `📷 Image URLs JSON` field is a rich_text
      // property, and Notion's URL auto-detection sometimes wraps the
      // contents in a hyperlink that mangles the JSON.
      try {
        urlList = JSON.parse(prop.imageUrlsJson);
        if (!Array.isArray(urlList)) urlList = [];
      } catch {
        const matches = prop.imageUrlsJson.match(/https?:\/\/[^\s"',<>()\[\]{}]+/g) || [];
        urlList = [...new Set(matches)]; // dedupe — auto-link often duplicates
        if (urlList.length) {
          console.log(`     ⚠ JSON parse failed — recovered ${urlList.length} URL(s) via regex fallback`);
        }
      }
    }
    if (urlList.length) {
      console.log(`  🔗 downloading ${urlList.length} explicit URL(s)`);
      for (let i = 0; i < urlList.length; i++) {
        const bumped = bumpBerkeleyUrl(urlList[i]);
        const dest = path.join(workDir, `web-list-${i + 1}.jpg`);
        try {
          await downloadUrl(bumped, dest);
          candidates.push({ path: dest, src: 'web-list', srcRef: urlList[i] });
        } catch (e) { /* skip individual URL failures */ }
      }
    }

    // 1c. Drive PDFs (or local --pdf)
    const pdfs = [];
    if (LOCAL_PDF) {
      pdfs.push({ path: LOCAL_PDF, name: path.basename(LOCAL_PDF) });
    } else if (prop.gsSourceFolder && (HAS_DRIVE_OAUTH || GOOGLE_SERVICE_ACCOUNT_JSON)) {
      const folderId = parseFolderIdFromUrl(prop.gsSourceFolder);
      if (folderId) {
        console.log(`  📂 Drive folder: ${folderId}`);
        const driveFiles = await listPdfsInDriveFolder(folderId);
        console.log(`     found ${driveFiles.length} PDF(s)`);
        for (const df of driveFiles) {
          const dest = path.join(workDir, df.name);
          console.log(`    ↓ ${df.name}…`);
          await downloadDrivePdf(df.id, dest);
          pdfs.push({ path: dest, name: df.name });
        }
        // Also collect loose image files (CGI renders etc.) nested in
        // subfolders like ".../CGIs" — these aren't inside any PDF, so the
        // PDF-only path above misses them. They flow into the same
        // filter+rank+upload step as every other candidate.
        const driveImgs = await listImagesInDriveFolder(folderId);
        if (driveImgs.length) {
          console.log(`     found ${driveImgs.length} loose Drive image(s)`);
          let n = 0;
          for (const im of driveImgs.slice(0, 40)) {
            const ext = (im.name.match(/\.(jpe?g|png|webp)$/i) || ['.jpg'])[0];
            const dest = path.join(workDir, `drive-img-${++n}${ext}`);
            try {
              await downloadDrivePdf(im.id, dest); // generic alt:media binary fetch
              candidates.push({ path: dest, src: 'drive-img', srcRef: im.name });
            } catch (e) { /* skip individual image failures */ }
          }
        }
      }
    }
    for (const pdf of pdfs) {
      console.log(`  ▸ extracting from ${pdf.name}…`);
      const imgs = await extractImagesFromPdf(pdf.path, workDir);
      console.log(`     ${imgs.length} JPEG(s) extracted`);
      // PDF images get classified as 'unclassified' (no URL keywords) — they
      // compete for slots flexibly. srcRef points to the PDF for tracing.
      candidates.push(...imgs.map(p => ({ path: p, src: 'pdf', srcRef: pdf.path })));
    }

    // 1d. Web-search fallback — runs when all primary sources yielded zero.
    // Most common trigger: GS Source Folder was set but the Drive service
    // account doesn't have read access, so the folder query returned nothing.
    if (!candidates.length) {
      console.log('  🌐 no primary candidates — falling back to web search');
      const webUrls = await searchWebForPropertyImages({
        propertyName: prop.propertyName,
        regionCity: prop.regionCity,
        country: prop.country,
      });
      console.log(`     web search returned ${webUrls.length} URL(s)`);
      for (let i = 0; i < webUrls.length; i++) {
        const dest = path.join(workDir, `web-search-${i + 1}.jpg`);
        try {
          await downloadUrl(webUrls[i], dest);
          candidates.push({ path: dest, src: 'web-search', srcRef: webUrls[i] });
        } catch (e) { /* skip individual URL failures */ }
      }
    }

    if (!candidates.length) {
      console.log('  ⤳ no candidates from any source, skipping');
      console.log('     (provide --berkeley-page, --berkeley-urls, --pdf, GS Source Folder + Google SA, or ANTHROPIC_API_KEY for web fallback)');
      return;
    }
    console.log(`  total candidates: ${candidates.length}`);

    // 2. Filter + classify + slot-pick
    const ranked = await filterAndRank(candidates);
    console.log(`  → ${ranked.length} pass filter (≥${MIN_WIDTH}px, landscape, ≥${MIN_FILE_SIZE / 1000}KB, ≥${MIN_BYTES_PER_PIXEL} b/px)`);
    const byClass = ranked.reduce((acc, img) => { (acc[img.classification] ??= 0); acc[img.classification]++; return acc; }, {});
    console.log(`     by class: ${Object.entries(byClass).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    const top5 = pickFinalFive(ranked);
    const slotLabels = ['hero (aspirational)', 'gallery_1 §05 (aspirational)', 'gallery_2 §08 (interior)', 'gallery_3 §11 (overview/ending)', 'gallery_4 (filler)'];
    console.log(`  → final ${top5.length} selected:`);
    for (let i = 0; i < top5.length; i++) {
      const img = top5[i];
      console.log(`     [${slotLabels[i]}] [${img.src}/${img.classification}] ${img.width}x${img.height} (${(img.pixels / 1_000_000).toFixed(1)}MP), ${(img.size / 1024).toFixed(0)}KB`);
    }

    if (!top5.length) {
      console.log('  ⤳ no usable images passed filter, skipping');
      return;
    }

    // 4. Upload to Cloudflare Images
    const urls = [];
    for (let i = 0; i < top5.length; i++) {
      const customId = i === 0 ? `${prop.slug}-hero` : `${prop.slug}-${i}`;
      console.log(`  ⬆ uploading as ${customId}…`);
      const url = await uploadToCloudflareImages(top5[i].path, customId);
      urls.push(url);
      console.log(`     → ${url}`);
    }

    // 5. Write back to Notion
    if (!DRY_RUN) {
      console.log(`  📝 updating Notion (${prop.pageId})…`);
      await updateNotionImages(prop.pageId, urls);
      console.log(`     done`);
    } else {
      console.log(`  (--dry-run: skipping Notion update)`);
    }
  } finally {
    if (!KEEP_TMP) {
      try { await fs.rm(workDir, { recursive: true, force: true }); } catch {}
    } else {
      console.log(`  (--keep-tmp: working dir retained at ${workDir})`);
    }
  }
}

async function main() {
  console.log(`sync-images.mjs — CF account ${CLOUDFLARE_ACCOUNT_ID}`);
  if (DRY_RUN) console.log('DRY RUN: will not write to Notion');

  let properties;

  // Test-mode shortcut: --slug + --dry-run + (--pdf or --berkeley-page or --berkeley-urls)
  // skips Notion fetch. Useful for first-time setup or for processing a property
  // that doesn't have a Notion row yet (e.g., authoring from a brochure URL).
  if (ONLY_SLUG && DRY_RUN && (LOCAL_PDF || BERKELEY_PAGE_ARG || BERKELEY_URLS_FILE)) {
    properties = [{ slug: ONLY_SLUG, imageUrl: null, gsSourceFolder: null, berkeleyPage: null, imageUrlsJson: null, pageId: null, propertyName: ONLY_SLUG }];
  } else if (ONLY_SLUG) {
    // Include Draft rows for single-slug runs so images can be sourced &
    // verified before the listing goes Live. Accepts a comma-separated list.
    const wanted = new Set(ONLY_SLUG.split(',').map(s => s.trim()).filter(Boolean));
    const all = await fetchLiveProperties(true);
    properties = all.filter(p => wanted.has(p.slug));
    if (!properties.length) {
      console.error(`No property matching slug(s) "${ONLY_SLUG}"`);
      process.exit(1);
    }
  } else {
    properties = await fetchLiveProperties();
    if (!REPLACE) {
      properties = properties.filter(p =>
        !p.imageUrl || p.imageUrl.includes('/wp-content/uploads/2026/05/')
      );
    }
    // Optional country scope — lets a --replace sweep target one market (e.g.
    // re-pick all Australia listings) without disturbing established listings
    // in other countries.
    if (ONLY_COUNTRY) {
      properties = properties.filter(p => (p.country || '').toLowerCase() === ONLY_COUNTRY.toLowerCase());
      console.log(`  country scope: ${ONLY_COUNTRY} → ${properties.length} listing(s)`);
    }
  }

  console.log(`Processing ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}…`);
  for (const prop of properties) {
    try {
      await processProperty(prop);
    } catch (err) {
      console.error(`  ✗ ${prop.slug}: ${err.message}`);
    }
  }
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
