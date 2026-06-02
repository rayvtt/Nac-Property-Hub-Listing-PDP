#!/usr/bin/env node
// Creates (or finds) a WordPress page for every Country Listings DB row where
// Hub Status = Live but 🆔 WP Page ID is empty.
//
// Unlike the PDP variant, country pages typically already exist in WP (they
// serve as PDP parents). So the primary flow is "look up by slug + write the
// ID back to Notion." If the lookup fails, we create the page as a top-level
// child of /<PROPERTY_HUB_PATH>/.
//
// Mirrors scripts/create-wp-page.mjs ("Side A" for CLPs).

import { Client as NotionClient } from '@notionhq/client';

const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_PASS = process.env.WP_APP_PASSWORD;
// CLP pages must use the same template as PDPs (the one that echoes
// `<?php the_field('raw_html_code'); ?>`). The ACF field group's
// location rule is template-bound, so on the wrong template the
// raw_html_code field is silently ignored on save.
const WP_TEMPLATE = process.env.WP_TEMPLATE || 'nac-residence-index.php';
const PROPERTY_HUB_PATH = process.env.WP_PROPERTY_HUB_PATH || 'property-hub-bat-dong-san';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const COUNTRY_DB_ID = process.env.NOTION_COUNTRY_DATABASE_ID || 'a01ef35ce9fd45b1bba3ec4de4da678c';

if (!WP_PASS) { console.error('WP_APP_PASSWORD env var is required'); process.exit(1); }
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const notion = new NotionClient({ auth: NOTION_TOKEN });

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

let _hubRoot = null;
async function lookupHubRoot() {
  if (_hubRoot !== null) return _hubRoot;
  const result = await wp(`/pages?slug=${encodeURIComponent(PROPERTY_HUB_PATH)}&per_page=5&status=publish,draft,private,future,pending`);
  const pages = Array.isArray(result) ? result : [];
  if (!Array.isArray(result)) {
    console.warn(`  ⚠ WP /pages?slug=${PROPERTY_HUB_PATH} returned non-array:`, JSON.stringify(result).slice(0, 200));
  }
  _hubRoot = pages.find(p => new URL(p.link).pathname === `/${PROPERTY_HUB_PATH}/`) || pages[0] || null;
  return _hubRoot;
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

function readSelect(prop) {
  return prop && prop.select ? prop.select.name : null;
}

function wpSlugFromCountryUrl(countryUrl) {
  if (!countryUrl) return null;
  let parsed;
  try { parsed = new URL(countryUrl); } catch { return null; }
  const segments = parsed.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || null;
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
      notionPageId: page.id,
      countryNameEn: richText(p['Country Name EN']),
      countryNameVi: richText(p['Country Name VI']),
      fileSlug: richText(p['Slug']),
      countryUrl: readUrl(p['🔗 Country URL']),
      wpPageId: readNumber(p['🆔 WP Page ID']),
      hubStatus: readSelect(p['Hub Status']),
    };
  });
}

async function writeBackToNotion(notionPageId, wpPageId) {
  await notion.pages.update({
    page_id: notionPageId,
    properties: { '🆔 WP Page ID': { number: wpPageId } },
  });
}

async function processOne(country) {
  if (country.wpPageId) {
    return { slug: country.fileSlug, skipped: `already has WP Page ID ${country.wpPageId}` };
  }
  if (!country.countryUrl) {
    return { slug: country.fileSlug, error: 'no 🔗 Country URL — fill it in Notion first' };
  }
  const wpSlug = wpSlugFromCountryUrl(country.countryUrl);
  if (!wpSlug) {
    return { slug: country.fileSlug, error: `could not parse WP slug from "${country.countryUrl}"` };
  }

  // Look up existing page by slug under the hub root.
  const hubRoot = await lookupHubRoot();
  const lookup = await wp(`/pages?slug=${encodeURIComponent(wpSlug)}&per_page=20&status=publish,draft,private,future,pending`);
  const candidates = Array.isArray(lookup) ? lookup : [];
  const targetPath = `/${PROPERTY_HUB_PATH}/${wpSlug}/`;
  let page = candidates.find(p => p.link.includes(targetPath))
    || candidates.find(p => hubRoot && p.parent === hubRoot.id)
    || null;

  if (page) {
    // Idempotently correct the template on existing pages. If the user
    // (or a previous run) left it on the default WP template, the ACF
    // field is hidden by the location rule and any sync push silently
    // no-ops. Forcing it to WP_TEMPLATE self-heals that case.
    let templateFixed = false;
    if (WP_TEMPLATE && (page.template || '') !== WP_TEMPLATE) {
      await wp(`/pages/${page.id}`, {
        method: 'POST',
        body: JSON.stringify({ template: WP_TEMPLATE }),
      });
      templateFixed = true;
    }
    await writeBackToNotion(country.notionPageId, page.id);
    return { slug: country.fileSlug, pageId: page.id, link: page.link, reused: true, templateFixed };
  }

  // Not found — create it under hub root.
  if (!hubRoot) {
    return { slug: country.fileSlug, error: `WP page at /${PROPERTY_HUB_PATH}/${wpSlug}/ not found and hub root /${PROPERTY_HUB_PATH}/ not found either` };
  }
  const createBody = {
    title: country.countryNameEn || country.countryNameVi || wpSlug,
    slug: wpSlug,
    parent: hubRoot.id,
    status: 'publish',
  };
  if (WP_TEMPLATE) createBody.template = WP_TEMPLATE;
  page = await wp('/pages', {
    method: 'POST',
    body: JSON.stringify(createBody),
  });
  await writeBackToNotion(country.notionPageId, page.id);
  return { slug: country.fileSlug, pageId: page.id, link: page.link };
}

async function main() {
  console.log(`Fetching Live countries from Notion…`);
  const countries = await fetchLiveCountries();
  const needsCreate = countries.filter(c => !c.wpPageId);
  console.log(`  ${countries.length} Live, ${needsCreate.length} missing WP Page ID`);

  if (!needsCreate.length) { console.log('Nothing to do.'); return; }

  let ok = 0, fail = 0, skip = 0;
  for (const c of needsCreate) {
    try {
      const r = await processOne(c);
      if (r.skipped) {
        console.log(`  ⤳ ${r.slug}: skipped (${r.skipped})`);
        skip++;
      } else if (r.error) {
        console.error(`  ✗ ${r.slug}: ${r.error}`);
        fail++;
      } else if (r.reused) {
        console.log(`  ↻ ${r.slug} → reused existing WP page ${r.pageId} (${r.link})`);
        ok++;
      } else {
        console.log(`  ✓ ${r.slug} → WP page ${r.pageId} (${r.link})`);
        ok++;
      }
    } catch (err) {
      console.error(`  ✗ ${c.fileSlug}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} linked, ${skip} skipped, ${fail} failed.`);
  if (fail > 0 && ok === 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
