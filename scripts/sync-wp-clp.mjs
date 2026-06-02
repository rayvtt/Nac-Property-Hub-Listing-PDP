#!/usr/bin/env node
// Pushes each country/<slug>.html to its EXISTING WordPress page, writing the
// full HTML into the ACF field "raw_html_code". Mirrors sync-wp.mjs for CLPs.
//
// Lookup order:
//   1. If Notion has 🆔 WP Page ID, use it directly.
//   2. Else, parse the WP slug from 🔗 Country URL, look up by slug + link.
//
// NEVER creates pages. If neither lookup yields a match, the run fails.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@notionhq/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COUNTRY_DIR = path.join(ROOT, 'country');

const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_PASS = process.env.WP_APP_PASSWORD;
const ACF_HTML_FIELD = process.env.WP_ACF_FIELD || 'raw_html_code';
// The CLP must use the same WP page template as PDPs (the one that echoes
// `<?php the_field('raw_html_code'); ?>`). Without this, the ACF field is
// silently ignored on save — the field group's location rule is template-
// bound, so WP returns 200 but raw_html_code never lands.
const WP_TEMPLATE = process.env.WP_TEMPLATE || 'nac-residence-index.php';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const COUNTRY_DB_ID = process.env.NOTION_COUNTRY_DATABASE_ID || 'a01ef35ce9fd45b1bba3ec4de4da678c';
const ONLY_SLUG = process.env.ONLY_SLUG || null;

if (!WP_PASS) { console.error('WP_APP_PASSWORD env var is required'); process.exit(1); }
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const notion = new Client({ auth: NOTION_TOKEN });

async function wp(pathname, options = {}) {
  const res = await fetch(`${WP_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`WP ${options.method || 'GET'} ${pathname} → ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

const normalizeUrl = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();

function expectedSlugFromCountryUrl(countryUrl) {
  if (!countryUrl) return null;
  try {
    const segments = new URL(countryUrl).pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch { return null; }
}

// Self-healing: if the WP page's slug differs from the Notion Country URL slug,
// PATCH it so the public URL matches what's stored in Notion (and what other
// scripts/templates expect to link to). Idempotent: no-op when slugs already match.
async function reconcileSlug(page, countryUrl) {
  const expected = expectedSlugFromCountryUrl(countryUrl);
  if (!expected || expected === page.slug) return page;
  const updated = await wp(`/pages/${page.id}`, {
    method: 'POST',
    body: JSON.stringify({ slug: expected }),
  });
  console.log(`  ↻ slug ${page.slug} → ${updated.slug} on page ${page.id}`);
  return updated;
}

async function findByCountryUrl(countryUrl) {
  if (!countryUrl) return null;
  let parsed;
  try { parsed = new URL(countryUrl); } catch { return null; }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  const slug = segments[segments.length - 1];
  const candidates = await wp(`/pages?slug=${encodeURIComponent(slug)}&per_page=20&status=publish,draft,private,future,pending`);
  if (!candidates.length) return null;
  const target = normalizeUrl(countryUrl);
  const exact = candidates.find(p => normalizeUrl(p.link) === target);
  if (exact) return exact;
  if (candidates.length === 1) return candidates[0];
  return null;
}

async function updatePageAcf(pageId, html) {
  // Mirror the proven PDP updater (sync-wp.mjs) exactly:
  //   1. Pre-double every backslash so one survives WP's wp_unslash() — without
  //      this, inline-JS regex escapes in the CLP (modal/filter logic) corrupt.
  //   2. Send ONLY { acf: { raw_html_code } }. The previous version also sent
  //      `template: WP_TEMPLATE`, which caused the POST to 200 without
  //      persisting raw_html_code. Template is set once at page creation
  //      (create-wp-clp-page.mjs); re-enforcing it on every content push is
  //      unnecessary and was silently blocking the content update.
  const safeHtml = html.replace(/\\/g, '\\\\');
  return wp(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ acf: { [ACF_HTML_FIELD]: safeHtml } }),
  });
}

function richText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  return '';
}

function readNumber(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null;
}

function readUrl(prop) {
  if (!prop) return '';
  if (prop.url) return prop.url;
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('').trim();
  return '';
}

async function fetchAllCountries() {
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: COUNTRY_DB_ID,
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(page => {
    const p = page.properties;
    const status = p['Hub Status']?.select?.name || '';
    return {
      fileSlug: richText(p['Slug']),
      countryUrl: readUrl(p['🔗 Country URL']),
      wpPageId: readNumber(p['🆔 WP Page ID']),
      isLive: status === 'Live',
    };
  }).filter(c => c.fileSlug);
}

async function syncOne(c) {
  let page;
  if (c.wpPageId) {
    page = await wp(`/pages/${c.wpPageId}`);
  } else if (c.countryUrl) {
    page = await findByCountryUrl(c.countryUrl);
  }
  if (!page) {
    // Only error for Live rows — drafts may legitimately not yet have a WP page.
    if (!c.isLive) return { slug: c.fileSlug, skipped: 'draft + no WP page yet' };
    return { slug: c.fileSlug, error: c.wpPageId
      ? `WP Page ID ${c.wpPageId} not found`
      : `Could not locate WP page from 🔗 Country URL "${c.countryUrl}" — run create-wp-clp-page first`,
    };
  }
  if (!page.id) {
    return { slug: c.fileSlug, error: `WP page resolved without an id (got: ${JSON.stringify(page).slice(0, 160)})` };
  }

  // Reconcile slug for every page we touch, regardless of Hub Status. Catches
  // typos like the original Malaysia page (slug "malta") even for drafts.
  page = await reconcileSlug(page, c.countryUrl);

  if (!c.isLive) return { slug: c.fileSlug, pageId: page.id, link: page.link, slugOnly: true };

  const file = path.join(COUNTRY_DIR, `${c.fileSlug}.html`);
  let html;
  try {
    html = await fs.readFile(file, 'utf-8');
  } catch {
    return { slug: c.fileSlug, skipped: `no HTML file at country/${c.fileSlug}.html` };
  }

  await updatePageAcf(page.id, html);

  // Verify the write actually persisted — the field can return 200 without
  // changing. Re-GET and confirm a sentinel from the freshly-pushed HTML is now
  // present in raw_html_code.
  const sentinel = 'NAC Property Collection';
  let verified = false;
  try {
    const check = await wp(`/pages/${page.id}?_fields=acf&context=edit`);
    const saved = check?.acf?.[ACF_HTML_FIELD] || '';
    verified = saved.includes(sentinel) && Math.abs(saved.length - html.length) < 4000;
  } catch { /* verification GET failed — report unverified below */ }
  if (!verified) {
    return { slug: c.fileSlug, error: `pushed to page ${page.id} but raw_html_code did not persist (ACF REST write may be disabled for this page)` };
  }

  return { slug: c.fileSlug, pageId: page.id, link: page.link };
}

async function main() {
  console.log(`Fetching countries from Notion (all statuses; non-Live get slug-reconcile only)…`);
  let countries = await fetchAllCountries();
  if (ONLY_SLUG) countries = countries.filter(c => c.fileSlug === ONLY_SLUG);
  const liveCount = countries.filter(c => c.isLive).length;
  console.log(`  ${countries.length} country row(s) (${liveCount} Live) → ${WP_BASE} as ${WP_USER}`);

  let ok = 0, fail = 0, skip = 0;
  const failures = [];
  for (const c of countries) {
    try {
      const r = await syncOne(c);
      if (r.skipped) {
        console.log(`  ⤳ ${r.slug}: skipped (${r.skipped})`);
        skip++;
      } else if (r.error) {
        console.error(`  ✗ ${r.slug}: ${r.error}`);
        fail++;
        failures.push(r);
      } else if (r.slugOnly) {
        console.log(`  ✓ ${r.slug} → page ${r.pageId} (slug reconciled only · draft)`);
        ok++;
      } else {
        console.log(`  ✓ ${r.slug} → page ${r.pageId} (${r.link})`);
        ok++;
      }
    } catch (err) {
      console.error(`  ✗ ${c.fileSlug}: ${err.message}`);
      fail++;
      failures.push({ slug: c.fileSlug, error: err.message });
    }
  }
  console.log(`\nDone. ${ok} updated, ${skip} skipped, ${fail} failed.`);
  if (failures.length) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f.slug}: ${f.error}`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
