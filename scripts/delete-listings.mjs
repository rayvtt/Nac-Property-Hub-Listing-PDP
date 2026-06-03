#!/usr/bin/env node
// Permanently retire one or more listings: delete the WordPress page, archive
// the Notion row (so it drops out of every Live-driven query — index, CLP,
// sync-wp, scaffolders), and report the HTML files to remove. The calling
// workflow does the `git rm` + index rebuild + commit.
//
// Use when a listing has no usable hero photo (floor-plan-only, land lot,
// random/poor building shot) and shouldn't be public.
//
// Input: SLUGS env — comma/space/newline-separated 🔗 Slug values.
// Auth: NOTION_TOKEN, WP_APP_PASSWORD (+ optional WP_USER/WP_BASE_URL).
// Dry run: set DRY_RUN=true to log actions without mutating anything.

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_PASS = process.env.WP_APP_PASSWORD;
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');

const SLUGS = (process.env.SLUGS || '')
  .split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }
if (!SLUGS.length) { console.error('SLUGS env var is required (comma/space-separated slugs)'); process.exit(1); }
if (!WP_PASS && !DRY_RUN) { console.error('WP_APP_PASSWORD env var is required (or set DRY_RUN=true)'); process.exit(1); }

const notion = new Client({ auth: NOTION_TOKEN });
const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// WP REST with bot-gate-aware retry (same rationale as sync-wp.mjs — Imunify360
// intermittently 403/503s runner IPs).
async function wp(pathname, options = {}) {
  const method = options.method || 'GET';
  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res, text;
    try {
      res = await fetch(`${WP_API}${pathname}`, {
        ...options,
        headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
      });
      text = await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      throw e;
    }
    if (res.ok) { try { return text ? JSON.parse(text) : null; } catch { return null; } }
    lastErr = new Error(`WP ${method} ${pathname} → ${res.status}: ${text.slice(0, 200)}`);
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      await sleep(2000 * 2 ** (attempt - 1)); continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

const richText = (p) => {
  if (!p) return '';
  if (p.title) return p.title.map(t => t.plain_text).join('');
  if (p.rich_text) return p.rich_text.map(t => t.plain_text).join('');
  return '';
};

async function findRow(slug) {
  const res = await notion.databases.query({
    database_id: NOTION_DATABASE_ID,
    filter: { property: '🔗 Slug', rich_text: { equals: slug } },
  });
  return res.results[0] || null;
}

async function deleteWpPage(pageId) {
  // force=true bypasses trash so the page is gone, not recoverable from Trash.
  await wp(`/pages/${pageId}?force=true`, { method: 'DELETE' });
}

async function main() {
  console.log(`delete-listings — ${SLUGS.length} slug(s)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const removedFiles = [];
  let ok = 0, fail = 0;
  for (const slug of SLUGS) {
    try {
      const row = await findRow(slug);
      if (!row) { console.log(`  ⚠ ${slug}: no Notion row — will still git-rm the HTML if present`); removedFiles.push(slug); fail++; continue; }
      const props = row.properties;
      const wpId = props['🆔 WP Page ID']?.number || null;
      const name = richText(props['Property Name']);
      console.log(`\n━━━ ${slug} (${name}) — WP ${wpId || '—'} ━━━`);

      if (wpId) {
        if (DRY_RUN) console.log(`  [dry] would DELETE WP page ${wpId}`);
        else { await deleteWpPage(wpId); console.log(`  ✓ deleted WP page ${wpId}`); }
      } else {
        console.log('  (no WP Page ID — nothing to delete in WP)');
      }

      if (DRY_RUN) console.log('  [dry] would archive Notion row');
      else { await notion.pages.update({ page_id: row.id, archived: true }); console.log('  ✓ archived Notion row'); }

      removedFiles.push(slug);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${slug}: ${e.message}`);
      fail++;
    }
  }
  // Emit the slug list for the workflow to git-rm (one per line).
  console.log('\n--- REMOVE_HTML ---');
  for (const s of removedFiles) console.log(s);
  console.log('--- END ---');
  console.log(`\nDone. ${ok} retired, ${fail} issue(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
