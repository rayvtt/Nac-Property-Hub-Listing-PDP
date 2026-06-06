#!/usr/bin/env node
/**
 * drive-tree.mjs — reliable recursive Google Drive folder enumerator.
 *
 * WHY THIS EXISTS
 * The Notion/Drive *search* index returns INCOMPLETE child lists for
 * cross-owner ("shared-with-me") folders — a `'<id>' in parents` query can
 * come back with 1 of N children (or empty) even though the files are there
 * and readable by direct ID. That made "drop a folder link → find everything"
 * unreliable. The Drive *API* `files.list`, called with the right flags
 * (`includeItemsFromAllDrives` + `supportsAllDrives` + `corpora:'allDrives'`)
 * and full pagination, does NOT have that gap. This script walks a folder
 * recursively that way and writes the complete tree to drive-tree.json.
 *
 * AUTH: prefers user-delegated OAuth (GSC_OAUTH_*) because the partner folders
 * are shared *with the user*, not with the service account (the SA only sees
 * what's explicitly shared with it). Falls back to GOOGLE_SERVICE_ACCOUNT_JSON.
 *
 * Usage:  node scripts/drive-tree.mjs <folderUrlOrId> [--out drive-tree.json]
 *         DRIVE_TREE_FOLDER=<url|id> node scripts/drive-tree.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GSC_OAUTH_CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID;
const GSC_OAUTH_CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const GSC_OAUTH_REFRESH_TOKEN = process.env.GSC_OAUTH_REFRESH_TOKEN;
const HAS_OAUTH = !!(GSC_OAUTH_CLIENT_ID && GSC_OAUTH_CLIENT_SECRET && GSC_OAUTH_REFRESH_TOKEN);

function getDrive() {
  // OAuth first: the partner brochure folders are shared with the user account,
  // so user-delegated creds see them; the service account often cannot.
  if (HAS_OAUTH) {
    const auth = new google.auth.OAuth2(GSC_OAUTH_CLIENT_ID, GSC_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: GSC_OAUTH_REFRESH_TOKEN });
    return { drive: google.drive({ version: 'v3', auth }), via: 'oauth' };
  }
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return { drive: google.drive({ version: 'v3', auth }), via: 'service-account' };
  }
  throw new Error('No Drive auth (need GSC_OAUTH_* or GOOGLE_SERVICE_ACCOUNT_JSON)');
}

const folderId = (s) => {
  if (!s) return null;
  const m = String(s).match(/(?:folders\/|id=|^)([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : (String(s).trim() || null);
};

// List ALL direct children of a folder, paginated, across all corpora.
async function listChildren(drive, id) {
  const out = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${id}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      orderBy: 'folder,name',
      pageToken,
    });
    out.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function walk(drive, id, name, prefix, depth, flat, lines) {
  const kids = await listChildren(drive, id);
  const node = { id, name, mimeType: FOLDER_MIME, children: [] };
  for (const f of kids) {
    const where = `${prefix}/${f.name}`;
    if (f.mimeType === FOLDER_MIME) {
      lines.push(`${'  '.repeat(depth)}📁 ${f.name}/`);
      if (depth < 8) {
        node.children.push(await walk(drive, f.id, f.name, where, depth + 1, flat, lines));
      }
    } else {
      const mb = f.size ? ` (${(Number(f.size) / 1e6).toFixed(1)}MB)` : '';
      lines.push(`${'  '.repeat(depth)}• ${f.name}${mb}`);
      flat.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null, path: where });
      node.children.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null });
    }
  }
  return node;
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(ROOT, 'drive-tree.json');
  const raw = (outIdx >= 0 ? args.filter((_, i) => i !== outIdx && i !== outIdx + 1) : args)[0] || process.env.DRIVE_TREE_FOLDER;
  const id = folderId(raw);
  if (!id) { console.error('Usage: drive-tree.mjs <folderUrlOrId>'); process.exit(1); }

  const { drive, via } = getDrive();
  console.log(`🔎 Enumerating Drive folder ${id} (auth: ${via})\n`);
  const flat = [], lines = [];
  let root;
  try {
    const meta = await drive.files.get({ fileId: id, fields: 'id,name', supportsAllDrives: true }).catch(() => null);
    const rootName = meta?.data?.name || '(root)';
    lines.push(`📁 ${rootName}/`);
    root = await walk(drive, id, rootName, rootName, 1, flat, lines);
  } catch (err) {
    console.error(`Drive enumeration failed: ${err.message}`);
    process.exit(2);
  }

  const result = {
    folderId: id,
    generatedAt: new Date().toISOString(),
    via,
    fileCount: flat.length,
    files: flat,
    tree: root,
  };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(lines.join('\n'));
  console.log(`\n✓ ${flat.length} files across the tree → ${path.relative(ROOT, outPath)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
