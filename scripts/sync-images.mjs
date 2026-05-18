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
//   GOOGLE_SERVICE_ACCOUNT_JSON — (optional) Google service account JSON. Only
//                              needed for Drive PDF route; Berkeley web works
//                              without it
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

// Filter constants — tuned for Berkeley CDN + PDF extraction observed in
// production. See NAC-IMAGE-SYNC.md for the calibration data.
const MIN_WIDTH = 1500;             // Berkeley CDN caps at 1920px, PDF heroes are typically 1800+
const MIN_FILE_SIZE = 150_000;      // CDN-served JPEGs at 1920x933 land at 150-300KB
const MIN_BYTES_PER_PIXEL = 0.05;   // Brochure abstract graphics (waves, colour blocks) compress
                                    // far below 0.05 bytes/pixel because of large flat regions.
                                    // Real photos sit at 0.1-0.3 bytes/pixel.

// ─── CLI parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY_SLUG = opt('--slug');
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
async function scrapeBerkeleyPage(pageUrl) {
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
  return [...urls];
}

async function downloadUrl(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
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

async function filterAndRank(candidates) {
  // candidates: [{ path, src }] — src is 'pdf' or 'web', used for logging
  const enriched = [];
  for (const c of candidates) {
    const dims = imageDims(c.path);
    if (!dims.width || !dims.height) continue;
    const size = await fileSize(c.path);
    const hash = fileHash(c.path);
    const pixels = dims.width * dims.height;
    const bytesPerPixel = pixels > 0 ? size / pixels : 0;
    enriched.push({ ...c, ...dims, size, hash, pixels, bytesPerPixel });
  }
  // Dedupe by content hash
  const seen = new Set();
  const unique = enriched.filter(img => {
    if (seen.has(img.hash)) return false;
    seen.add(img.hash);
    return true;
  });
  // Filter cascade:
  //   - width ≥ MIN_WIDTH (1500): real heroes are 1800px+, drops thumbnails
  //   - landscape only (width ≥ height): drops vertical brochure spreads
  //   - file size ≥ MIN_FILE_SIZE (150KB): drops tiny CDN renditions
  //   - bytes/pixel ≥ MIN_BYTES_PER_PIXEL (0.05): drops abstract design
  //     graphics (waves, gradient blocks) that compress unusually small
  const filtered = unique.filter(img =>
    img.width >= MIN_WIDTH
    && img.width >= img.height
    && img.size >= MIN_FILE_SIZE
    && img.bytesPerPixel >= MIN_BYTES_PER_PIXEL
  );
  // Sort by pixel area DESC — bigger image wins, regardless of CDN compression
  return filtered.sort((a, b) => b.pixels - a.pixels);
}

// ─── Google Drive ───────────────────────────────────────────────────────
function getDriveClient() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var required');
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

function parseFolderIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function listPdfsInDriveFolder(folderId) {
  const drive = getDriveClient();
  // List subfolders + PDFs recursively (1 level deep is enough for the NAC setup)
  const top = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.folder')`,
    fields: 'files(id, name, mimeType)',
    pageSize: 100,
  });
  const pdfs = [];
  for (const f of top.data.files) {
    if (f.mimeType === 'application/pdf') {
      pdfs.push({ id: f.id, name: f.name });
    } else if (f.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await drive.files.list({
        q: `'${f.id}' in parents and mimeType = 'application/pdf'`,
        fields: 'files(id, name)',
        pageSize: 100,
      });
      pdfs.push(...sub.data.files.map(p => ({ id: p.id, name: p.name })));
    }
  }
  return pdfs;
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

async function fetchLiveProperties() {
  const notion = getNotion();
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(page => ({
    pageId: page.id,
    slug: richText(page.properties['🔗 Slug']),
    propertyName: richText(page.properties['Property Name']),
    imageUrl: readUrl(page.properties['Image URL']),
    gsSourceFolder: readUrl(page.properties['GS Source Folder']),
    // Optional new fields for the Berkeley web route. Either one is enough.
    berkeleyPage: readUrl(page.properties['🌐 Berkeley Page URL']),
    imageUrlsJson: richText(page.properties['📷 Image URLs JSON']),
  })).filter(p => p.slug);
}

async function updateNotionImages(pageId, urls) {
  const notion = getNotion();
  const props = {};
  if (urls[0]) props['Image URL'] = { url: urls[0] };
  if (urls[1]) props['🖼️ Image 1'] = { url: urls[1] };
  if (urls[2]) props['🖼️ Image 2'] = { url: urls[2] };
  if (urls[3]) props['🖼️ Image 3'] = { url: urls[3] };
  if (urls[4]) props['🖼️ Image 4'] = { url: urls[4] };
  await notion.pages.update({ page_id: pageId, properties: props });
}

// ─── Main ───────────────────────────────────────────────────────────────
async function processProperty(prop) {
  console.log(`\n━━━ ${prop.slug} (${prop.propertyName || ''}) ━━━`);

  const isPlaceholder = !prop.imageUrl
    || prop.imageUrl.includes('/wp-content/uploads/2026/05/');
  const isCloudflare = prop.imageUrl?.includes('imagedelivery.net');

  if (isCloudflare && !REPLACE) {
    console.log('  ⤳ already on Cloudflare Images, skipping (--replace to override)');
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
            candidates.push({ path: dest, src: 'web-page' });
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
      try { urlList = JSON.parse(prop.imageUrlsJson); } catch {}
    }
    if (urlList.length) {
      console.log(`  🔗 downloading ${urlList.length} explicit URL(s)`);
      for (let i = 0; i < urlList.length; i++) {
        const bumped = bumpBerkeleyUrl(urlList[i]);
        const dest = path.join(workDir, `web-list-${i + 1}.jpg`);
        try {
          await downloadUrl(bumped, dest);
          candidates.push({ path: dest, src: 'web-list' });
        } catch (e) { /* skip individual URL failures */ }
      }
    }

    // 1c. Drive PDFs (or local --pdf)
    const pdfs = [];
    if (LOCAL_PDF) {
      pdfs.push({ path: LOCAL_PDF, name: path.basename(LOCAL_PDF) });
    } else if (prop.gsSourceFolder && GOOGLE_SERVICE_ACCOUNT_JSON) {
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
      }
    }
    for (const pdf of pdfs) {
      console.log(`  ▸ extracting from ${pdf.name}…`);
      const imgs = await extractImagesFromPdf(pdf.path, workDir);
      console.log(`     ${imgs.length} JPEG(s) extracted`);
      candidates.push(...imgs.map(p => ({ path: p, src: 'pdf' })));
    }

    if (!candidates.length) {
      console.log('  ⤳ no candidates from any source, skipping');
      console.log('     (provide --berkeley-page, --berkeley-urls, --pdf, or set GS Source Folder + Google SA)');
      return;
    }
    console.log(`  total candidates: ${candidates.length}`);

    // 2. Filter + rank (one filter for all sources)
    const ranked = await filterAndRank(candidates);
    const top5 = ranked.slice(0, 5);
    console.log(`  → ${ranked.length} pass filter (≥${MIN_WIDTH}px, landscape, ≥${MIN_FILE_SIZE / 1000}KB, ≥${MIN_BYTES_PER_PIXEL} b/px)`);
    console.log(`  → top ${top5.length} selected:`);
    for (const img of top5) {
      console.log(`     [${img.src}] ${img.width}x${img.height} (${(img.pixels / 1_000_000).toFixed(1)}MP), ${(img.size / 1024).toFixed(0)}KB, ${img.bytesPerPixel.toFixed(2)} b/px`);
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
    const all = await fetchLiveProperties();
    properties = all.filter(p => p.slug === ONLY_SLUG);
    if (!properties.length) {
      console.error(`No Live property with slug "${ONLY_SLUG}"`);
      process.exit(1);
    }
  } else {
    properties = await fetchLiveProperties();
    if (!REPLACE) {
      properties = properties.filter(p =>
        !p.imageUrl || p.imageUrl.includes('/wp-content/uploads/2026/05/')
      );
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
