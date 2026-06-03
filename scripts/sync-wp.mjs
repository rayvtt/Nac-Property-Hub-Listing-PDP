#!/usr/bin/env node
// Pushes each properties/<slug>.html to its EXISTING WordPress page,
// writing the full HTML into the ACF field "raw_html_code".
//
// Page lookup: Notion field "Listing URL" → parse slug from the URL,
// match the WP page by slug + full URL.
//
// NEVER creates pages. If the lookup finds no match, the run fails so a
// human can fix the Notion URL or create the WP page.
//
// Auth: HTTP Basic with WP_USER + WP_APP_PASSWORD (Application Password).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@notionhq/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');

const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_PASS = process.env.WP_APP_PASSWORD;
const ACF_HTML_FIELD = process.env.WP_ACF_FIELD || 'raw_html_code';
const NOTION_LISTING_URL_FIELD = process.env.NOTION_LISTING_URL_FIELD || 'Listing URL';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const ONLY_SLUG = process.env.ONLY_SLUG || null;

if (!WP_PASS) { console.error('WP_APP_PASSWORD env var is required'); process.exit(1); }
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const notion = new Client({ auth: NOTION_TOKEN });

// ─── WP REST helpers ────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// nomadassetcollective.com sits behind Imunify360 bot-protection, which
// intermittently 403/503s GitHub-runner IPs and sometimes serves a JS-challenge
// HTML body in place of JSON. Both manifest as transient, whole-run failures
// that clear on a retry. Retry GETs (idempotent) with exponential backoff;
// surface the error only after several attempts so a real outage still fails.
async function wp(pathname, options = {}) {
  const method = options.method || 'GET';
  const retryable = method === 'GET';
  const maxAttempts = retryable ? 5 : 1;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res, text;
    try {
      res = await fetch(`${WP_API}${pathname}`, {
        ...options,
        headers: {
          Authorization: AUTH,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });
      text = await res.text();
    } catch (e) {
      lastErr = e; // network-level failure
      if (attempt < maxAttempts) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      throw e;
    }
    if (res.ok) {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        // 200 but non-JSON = Imunify360 challenge page masquerading as success.
        lastErr = new Error(`WP ${method} ${pathname} → 200 non-JSON (bot challenge?): ${text.slice(0, 120)}`);
        if (retryable && attempt < maxAttempts) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
        throw lastErr;
      }
    }
    lastErr = new Error(`WP ${method} ${pathname} → ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
    // 403/429/5xx from the bot-gate are transient; retry idempotent GETs.
    if (retryable && (res.status === 403 || res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

// Confirm the WP REST endpoint is actually reachable (not bot-gated) before we
// interpret "0 candidates" as "page genuinely missing". When Imunify360 blocks
// the runner, EVERY lookup returns empty, so without this canary the run wrongly
// reports all 60 listings as "did not match any WP page". Wait it out instead.
async function waitForWpReachable() {
  const maxAttempts = 7; // ~5 min total with the backoff below
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const probe = await wp(`/pages?per_page=1&status=publish`);
      if (Array.isArray(probe) && probe.length > 0) return true;
      const snippet = JSON.stringify(probe).slice(0, 200);
      console.error(`  WP canary: endpoint returned ${Array.isArray(probe) ? probe.length : 'non-array'} page(s) (attempt ${attempt}/${maxAttempts}) — likely bot-gated, waiting… body=${snippet}`);
    } catch (e) {
      console.error(`  WP canary: ${e.message} (attempt ${attempt}/${maxAttempts})`);
    }
    if (attempt < maxAttempts) await sleep(15000 * attempt); // 15s,30s,45s,60s,75s,90s
  }
  return false;
}

const normalizeUrl = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();

async function findByListingUrl(listingUrl) {
  if (!listingUrl) return null;
  let parsed;
  try { parsed = new URL(listingUrl); } catch { return null; }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  const slug = segments[segments.length - 1];

  const candidates = await wp(`/pages?slug=${encodeURIComponent(slug)}&per_page=20&status=publish,draft,private,future,pending`);
  if (!candidates.length) return null;

  // Prefer the candidate whose full WP `link` matches the Notion URL exactly.
  const target = normalizeUrl(listingUrl);
  const exact = candidates.find(p => normalizeUrl(p.link) === target);
  if (exact) return exact;
  // If only one candidate has that slug, accept it.
  if (candidates.length === 1) return candidates[0];
  return null;
}

async function updatePageAcf(pageId, html) {
  // WordPress REST runs wp_unslash() on every POST value, stripping ONE level of
  // backslashes. That silently corrupts inline-JS regex escapes in the HTML —
  // e.g. `text.split(/\s+/)` → `/s+/` (splits on the letter "s", deleting it),
  // and `/[^\d.-]/` → `/[^d.-]/`. The "I tanbul" statement bug came from exactly
  // this. Pre-double every backslash so one survives unslashing intact.
  const safeHtml = html.replace(/\\/g, '\\\\');
  return wp(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ acf: { [ACF_HTML_FIELD]: safeHtml } }),
  });
}

// ─── Notion helpers ─────────────────────────────────────────────────────────

function richText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  return '';
}

function readUrl(prop) {
  if (!prop) return '';
  if (prop.url) return prop.url;
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('').trim();
  return '';
}

async function fetchLiveProperties() {
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
  return results.map(page => {
    const p = page.properties;
    return {
      slug: richText(p['🔗 Slug']),
      listingUrl: readUrl(p[NOTION_LISTING_URL_FIELD]),
    };
  }).filter(p => p.slug);
}

// ─── Sync one property ──────────────────────────────────────────────────────

async function syncOne(prop) {
  const file = path.join(PROPERTIES_DIR, `${prop.slug}.html`);
  let html;
  try {
    html = await fs.readFile(file, 'utf-8');
  } catch {
    return { slug: prop.slug, skipped: 'no HTML file at properties/' + prop.slug + '.html' };
  }

  if (!prop.listingUrl) {
    return { slug: prop.slug, skipped: `no "${NOTION_LISTING_URL_FIELD}" in Notion yet — WP automation may still be writing it back` };
  }

  const page = await findByListingUrl(prop.listingUrl);
  if (!page) {
    return { slug: prop.slug, error: `Listing URL "${prop.listingUrl}" did not match any WP page` };
  }

  await updatePageAcf(page.id, html);
  return { slug: prop.slug, pageId: page.id, link: page.link };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Checking WP REST endpoint is reachable (not bot-gated)…`);
  if (!await waitForWpReachable()) {
    console.error('WP REST endpoint never returned pages — bot-gate (Imunify360) or outage. Aborting before mislabeling every listing as missing; re-run will retry.');
    process.exit(1);
  }
  console.log('  WP REST reachable.\n');

  console.log(`Fetching Live properties from Notion…`);
  let properties = await fetchLiveProperties();
  if (ONLY_SLUG) properties = properties.filter(p => p.slug === ONLY_SLUG);
  console.log(`  ${properties.length} property(ies) to sync to ${WP_BASE} as ${WP_USER}`);

  let ok = 0, fail = 0, skip = 0;
  const failures = [];
  for (const prop of properties) {
    try {
      const r = await syncOne(prop);
      if (r.skipped) {
        console.log(`  ⤳ ${r.slug}: skipped (${r.skipped})`);
        skip++;
      } else if (r.error) {
        console.error(`  ✗ ${r.slug}: ${r.error}`);
        fail++;
        failures.push(r);
      } else {
        console.log(`  ✓ ${r.slug} → page ${r.pageId} (${r.link})`);
        ok++;
      }
    } catch (err) {
      console.error(`  ✗ ${prop.slug}: ${err.message}`);
      fail++;
      failures.push({ slug: prop.slug, error: err.message });
    }
  }
  console.log(`\nDone. ${ok} updated, ${skip} skipped, ${fail} failed.`);
  if (failures.length) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f.slug}: ${f.error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
