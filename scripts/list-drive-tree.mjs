#!/usr/bin/env node
// On-demand Google Drive tree printer (discovery aid).
//
// The chat-side Drive connector can't reliably enumerate folders nobody has
// opened, which makes finding new project folders (e.g. under
// "03.AUSTRALIA 2026") impossible from chat. The service account CAN read the
// whole tree, so this script walks a root folder recursively and prints an
// indented tree to the Actions log — including per-folder file counts and
// image/PDF tallies so you can spot which leaf folders are viable listings
// (have renders / brochures) at a glance.
//
// Auth mirrors sync-images.mjs: service account preferred (never expires),
// user-delegated OAuth as fallback.
//
// Config (all optional):
//   DRIVE_TREE_ROOT  — folder ID to walk (default: 03.AUSTRALIA 2026)
//   DRIVE_TREE_DEPTH — max recursion depth (default 6)

import { google } from 'googleapis';

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GSC_OAUTH_CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID;
const GSC_OAUTH_CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const GSC_OAUTH_REFRESH_TOKEN = process.env.GSC_OAUTH_REFRESH_TOKEN;
const HAS_DRIVE_OAUTH = !!(GSC_OAUTH_CLIENT_ID && GSC_OAUTH_CLIENT_SECRET && GSC_OAUTH_REFRESH_TOKEN);

// Default root = "03.AUSTRALIA 2026". A blank env (e.g. workflow_dispatch with
// no input) also falls back to this.
const ROOT = (process.env.DRIVE_TREE_ROOT || '').trim() || '1n4F9kZ2nfTsRH0qGW-OtXCqT_zN9Nzu-';
const MAX_DEPTH = Number(process.env.DRIVE_TREE_DEPTH || 8);
const FOLDER_CAP = 900;

function getDriveClient() {
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

const drive = getDriveClient();
let folderCount = 0;

async function listChildren(id) {
  const out = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${id}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 200,
      pageToken,
      orderBy: 'folder,name',
    });
    out.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

// A "project" folder = a child of one of these listing buckets, whose own
// name isn't itself a bucket. We tally the recursive image count for each so
// the build list (≥5 images = enough to fill a PDP) is obvious.
const CATEGORY = /^(COMPLETED|OFF[\s_-]*THE[\s_-]*PLAN|OF\s+THE\s+PLAN|TOWNHOUSE|HOUSE\s*&\s*LAND|COMMERCIALS|APARTMENT)\b/i;
const projects = [];

async function walk(id, name, depth, parentName = '') {
  const pad = '  '.repeat(depth);
  let children;
  try {
    children = await listChildren(id);
  } catch (e) {
    console.log(`${pad}✗ ${name} (${id}): ${e.message}`);
    return 0;
  }
  const folders = children.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const files = children.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  const imgs = files.filter(f => (f.mimeType || '').startsWith('image/')).length;
  const pdfs = files.filter(f => f.mimeType === 'application/pdf').length;
  const tag = files.length ? `  [files:${files.length} img:${imgs} pdf:${pdfs}]` : '';
  console.log(`${pad}📁 ${name}  (${id})${tag}`);
  folderCount++;

  let recImg = imgs;
  if (folderCount <= FOLDER_CAP && depth < MAX_DEPTH) {
    for (const f of folders) recImg += await walk(f.id, f.name, depth + 1, name);
  } else if (folders.length) {
    console.log(`${pad}  … ${folders.length} subfolder(s) (depth/cap limit)`);
  }

  if (CATEGORY.test(parentName) && !CATEGORY.test(name)) {
    projects.push({ name, id, recImg });
  }
  return recImg;
}

(async () => {
  console.log(`Drive tree from root ${ROOT} (depth ${MAX_DEPTH}) via ${GOOGLE_SERVICE_ACCOUNT_JSON ? 'service account' : (HAS_DRIVE_OAUTH ? 'OAuth' : 'NO AUTH')}\n`);
  const meta = await drive.files.get({ fileId: ROOT, fields: 'id, name' });
  await walk(ROOT, meta.data.name, 0);
  console.log(`\nDone. ${folderCount} folder(s) printed.`);

  projects.sort((a, b) => b.recImg - a.recImg);
  console.log(`\n===== PROJECT IMAGE TALLY (${projects.length} projects) =====`);
  for (const p of projects) {
    console.log(`${p.recImg >= 5 ? '✅' : '  '} ${String(p.recImg).padStart(3)} imgs  ${p.name}  (${p.id})`);
  }
  console.log(`\n${projects.filter(p => p.recImg >= 5).length} project(s) with >=5 images (PDP-ready).`);
})().catch(e => { console.error(e); process.exit(1); });
