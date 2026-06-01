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
  return wp(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ acf: { [ACF_HTML_FIELD]: html } }),
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

async function fetchLiveCountries() {
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: COUNTRY_DB_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(page => {
    const p = page.properties;
    return {
      fileSlug: richText(p['Slug']),
      countryUrl: readUrl(p['🔗 Country URL']),
      wpPageId: readNumber(p['🆔 WP Page ID']),
    };
  }).filter(c => c.fileSlug);
}

async function syncOne(c) {
  const file = path.join(COUNTRY_DIR, `${c.fileSlug}.html`);
  let html;
  try {
    html = await fs.readFile(file, 'utf-8');
  } catch {
    return { slug: c.fileSlug, skipped: `no HTML file at country/${c.fileSlug}.html` };
  }

  let page;
  if (c.wpPageId) {
    page = await wp(`/pages/${c.wpPageId}`);
  } else if (c.countryUrl) {
    page = await findByCountryUrl(c.countryUrl);
  }
  if (!page) {
    return { slug: c.fileSlug, error: c.wpPageId
      ? `WP Page ID ${c.wpPageId} not found`
      : `Could not locate WP page from 🔗 Country URL "${c.countryUrl}" — run create-wp-clp-page first`,
    };
  }

  await updatePageAcf(page.id, html);
  return { slug: c.fileSlug, pageId: page.id, link: page.link };
}

async function main() {
  console.log(`Fetching Live countries from Notion…`);
  let countries = await fetchLiveCountries();
  if (ONLY_SLUG) countries = countries.filter(c => c.fileSlug === ONLY_SLUG);
  console.log(`  ${countries.length} country(ies) to sync to ${WP_BASE} as ${WP_USER}`);

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
