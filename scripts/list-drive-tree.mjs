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
const MAX_DEPTH = Number(process.env.DRIVE_TREE_DEPTH || 6);
const FOLDER_CAP = 500;

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

async function walk(id, name, depth) {
  const pad = '  '.repeat(depth);
  let children;
  try {
    children = await listChildren(id);
  } catch (e) {
    console.log(`${pad}✗ ${name} (${id}): ${e.message}`);
    return;
  }
  const folders = children.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const files = children.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  const imgs = files.filter(f => (f.mimeType || '').startsWith('image/')).length;
  const pdfs = files.filter(f => f.mimeType === 'application/pdf').length;
  const tag = files.length ? `  [files:${files.length} img:${imgs} pdf:${pdfs}]` : '';
  console.log(`${pad}📁 ${name}  (${id})${tag}`);
  folderCount++;
  if (folderCount > FOLDER_CAP) {
    console.log(`${pad}  … (folder cap ${FOLDER_CAP} reached — stopping)`);
    process.exit(0);
  }
  if (depth >= MAX_DEPTH) {
    if (folders.length) console.log(`${pad}  … ${folders.length} subfolder(s) (max depth ${MAX_DEPTH})`);
    return;
  }
  for (const f of folders) await walk(f.id, f.name, depth + 1);
}

(async () => {
  console.log(`Drive tree from root ${ROOT} (depth ${MAX_DEPTH}) via ${GOOGLE_SERVICE_ACCOUNT_JSON ? 'service account' : (HAS_DRIVE_OAUTH ? 'OAuth' : 'NO AUTH')}\n`);
  const meta = await drive.files.get({ fileId: ROOT, fields: 'id, name' });
  await walk(ROOT, meta.data.name, 0);
  console.log(`\nDone. ${folderCount} folder(s) printed.`);
})().catch(e => { console.error(e); process.exit(1); });
