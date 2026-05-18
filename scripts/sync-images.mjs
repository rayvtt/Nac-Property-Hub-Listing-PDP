#!/usr/bin/env node
// scripts/sync-images.mjs
//
// End-to-end image pipeline for NAC property listings:
//   1. For each target property (--slug, or all Live properties with placeholder
//      Image URLs):
//   2. List brochure PDFs in the Notion `GS Source Folder` Drive folder
//   3. Download each PDF
//   4. Extract embedded JPEG images via `pdfimages -j` (requires poppler-utils)
//   5. Filter by min dimensions + file size, dedupe by content hash
//   6. Sort by file size DESC, take top 5 (largest = best hero candidates)
//   7. Upload to Cloudflare Images with custom IDs (<slug>-hero, <slug>-1..4)
//   8. Write back the public-variant URLs to Notion:
//      Image URL  → hero
//      🖼️ Image 1-4 → gallery 1-4
//
// Required env:
//   CLOUDFLARE_API_TOKEN     — Cloudflare API token with `Cloudflare Images: Edit`
//   CLOUDFLARE_ACCOUNT_ID    — default: 2adeb401a00c6f459573f25eabb790da (NAC account)
//   NOTION_TOKEN             — Notion integration token
//   GOOGLE_SERVICE_ACCOUNT_JSON — Google service account credentials JSON (string)
//   NOTION_DATABASE_ID       — default: 35848ec25e86803283acc7ad989649c9
//
// CLI args:
//   --slug <slug>            — process just one property
//   --pdf <path>             — use a local PDF instead of downloading from Drive
//   --dry-run                — extract + upload but don't write to Notion
//   --keep-tmp               — don't clean up /tmp/sync-images-* working dir
//   --replace                — re-upload even if Image URL is already a CF URL

import { Client as NotionClient } from '@notionhq/client';
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

// Min dimensions/size for an extracted image to be considered usable
const MIN_WIDTH = 800;
const MIN_FILE_SIZE = 50_000; // 50KB

// ─── CLI parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY_SLUG = opt('--slug');
const LOCAL_PDF = opt('--pdf');
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

async function filterAndRank(imagePaths) {
  const enriched = [];
  for (const p of imagePaths) {
    const dims = imageDims(p);
    const size = await fileSize(p);
    const hash = fileHash(p);
    enriched.push({ path: p, ...dims, size, hash });
  }
  // Dedupe by hash
  const seen = new Set();
  const unique = enriched.filter(img => {
    if (seen.has(img.hash)) return false;
    seen.add(img.hash);
    return true;
  });
  // Filter by min size/dimensions
  const filtered = unique.filter(img => img.width >= MIN_WIDTH && img.size >= MIN_FILE_SIZE);
  // Sort by file size descending — usually the rendering hero shots are large + high-detail
  return filtered.sort((a, b) => b.size - a.size);
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
    // 1. Collect PDFs
    const pdfs = [];
    if (LOCAL_PDF) {
      pdfs.push({ path: LOCAL_PDF, name: path.basename(LOCAL_PDF) });
    } else {
      const folderId = parseFolderIdFromUrl(prop.gsSourceFolder);
      if (!folderId) {
        console.log(`  ⤳ no GS Source Folder URL, skipping`);
        return;
      }
      console.log(`  Drive folder: ${folderId}`);
      const driveFiles = await listPdfsInDriveFolder(folderId);
      console.log(`  Found ${driveFiles.length} PDF(s) in Drive`);
      for (const df of driveFiles) {
        const dest = path.join(workDir, df.name);
        console.log(`    ↓ downloading ${df.name}…`);
        await downloadDrivePdf(df.id, dest);
        pdfs.push({ path: dest, name: df.name });
      }
    }

    if (!pdfs.length) {
      console.log('  ⤳ no PDFs to process, skipping');
      return;
    }

    // 2. Extract images from all PDFs
    const allImages = [];
    for (const pdf of pdfs) {
      console.log(`  ▸ extracting from ${pdf.name}…`);
      const imgs = await extractImagesFromPdf(pdf.path, workDir);
      console.log(`    extracted ${imgs.length} JPEG(s)`);
      allImages.push(...imgs);
    }
    console.log(`  total extracted: ${allImages.length}`);

    // 3. Filter + rank
    const ranked = await filterAndRank(allImages);
    const top5 = ranked.slice(0, 5);
    console.log(`  → ${ranked.length} pass min filter (${MIN_WIDTH}px+, ${MIN_FILE_SIZE / 1000}KB+, deduped)`);
    console.log(`  → top ${top5.length} selected:`);
    for (const img of top5) {
      console.log(`     ${path.basename(img.path)}: ${img.width}x${img.height}, ${(img.size / 1024).toFixed(0)}KB`);
    }

    if (!top5.length) {
      console.log('  ⤳ no usable images found, skipping');
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

  // Test-mode shortcut: --pdf + --slug + --dry-run skips Notion fetch
  // (useful for first-time setup before NOTION_TOKEN/Drive auth is available)
  if (LOCAL_PDF && ONLY_SLUG && DRY_RUN) {
    properties = [{ slug: ONLY_SLUG, imageUrl: null, gsSourceFolder: null, pageId: null, propertyName: ONLY_SLUG }];
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
