#!/usr/bin/env node
// Creates a WordPress page for every Notion row where Hub Status = Live but
// 🆔 WP Page ID is empty. The new page is:
//   - title  : Property Name (English)
//   - slug   : 🔗 Slug (Notion)
//   - parent : the country page under /<property-hub-path>/<country-slug>/
//   - template: auto-detected from an existing listing's WP page
//   - status : publish
//
// After successful creation, writes 🆔 WP Page ID and (if empty) Listing URL
// back to Notion so the next sync-wp.yml run can push the HTML payload.
//
// Replaces the Notion-side WP automation ("Side A" in CLAUDE.md).

import { Client as NotionClient } from '@notionhq/client';

const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_PASS = process.env.WP_APP_PASSWORD;
const PROPERTY_HUB_PATH = process.env.WP_PROPERTY_HUB_PATH || 'property-hub-bat-dong-san';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const TEMPLATE_SAMPLE_SLUG = process.env.WP_TEMPLATE_SAMPLE_SLUG || 'pullman-panama-city';

if (!WP_PASS) { console.error('WP_APP_PASSWORD env var is required'); process.exit(1); }
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const notion = new NotionClient({ auth: NOTION_TOKEN });

// Country name (from Notion's English Country select) → URL slug. The WP
// country pages are slugified from the English name: lowercase, spaces →
// hyphens, diacritics stripped. A few overrides handle special cases:
//   - "Việt Nam" (the Vietnamese variant in the Notion select) → "vietnam"
//   - "United States" / "USA" → "usa"
//   - "United Kingdom" → "uk" (kept as a 2-letter override)
//   - "Dubai" (treated as part of UAE) → "uae"
const COUNTRY_SLUG_OVERRIDES = {
  'Việt Nam': 'vietnam',
  'United States': 'usa',
  'USA': 'usa',
  'United Kingdom': 'uk',
  'Dubai': 'uae',
};

function countrySlug(country) {
  if (!country) return null;
  if (COUNTRY_SLUG_OVERRIDES[country]) return COUNTRY_SLUG_OVERRIDES[country];
  return country
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                       // non-alnum → hyphen
    .replace(/^-+|-+$/g, '');                          // trim hyphens
}

// ─── WP REST helpers ────────────────────────────────────────────────────────

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

let _cachedTemplate = null;
async function detectTemplate() {
  if (_cachedTemplate !== null) return _cachedTemplate;
  // `context=edit` is required to see the `template` field (REST exposes it
  // only with edit context). We auth as admin, so this works.
  const sample = await wp(`/pages?slug=${TEMPLATE_SAMPLE_SLUG}&per_page=1&context=edit`);
  if (!sample.length) {
    console.warn(`  ⚠ Could not find sample page "${TEMPLATE_SAMPLE_SLUG}" to detect template — falling back to default`);
    _cachedTemplate = '';
    return '';
  }
  _cachedTemplate = sample[0].template || '';
  console.log(`  Detected template: "${_cachedTemplate}" (from ${TEMPLATE_SAMPLE_SLUG})`);
  return _cachedTemplate;
}

async function lookupParentPage(countrySlug) {
  // Country pages live one level under /<PROPERTY_HUB_PATH>/. Filter by
  // matching the link path to disambiguate from any other page with the same
  // slug elsewhere on the site. Query all statuses (not just the publish
  // default) so a freshly-created country page is found, and to bust WP's
  // cached-empty response for the bare slug query string.
  const pages = await wp(`/pages?slug=${encodeURIComponent(countrySlug)}&per_page=10&status=publish,draft,private,future,pending`);
  if (!pages.length) return null;
  const targetPath = `/${PROPERTY_HUB_PATH}/${countrySlug}/`;
  return pages.find(p => p.link.includes(targetPath)) || pages[0];
}

async function createPage({ title, slug, parentId, template }) {
  const body = {
    title,
    slug,
    parent: parentId,
    status: 'publish',
  };
  if (template) body.template = template;
  return wp('/pages', { method: 'POST', body: JSON.stringify(body) });
}

// ─── Notion helpers ─────────────────────────────────────────────────────────

function richText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  return '';
}

function readNumber(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null;
}

function readSelect(prop) {
  return prop && prop.select ? prop.select.name : null;
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
      notionPageId: page.id,
      propertyName: richText(p['Property Name']),
      slug: richText(p['🔗 Slug']),
      country: readSelect(p['Country']),
      wpPageId: readNumber(p['🆔 WP Page ID']),
      listingUrl: readUrl(p['Listing URL']),
    };
  });
}

async function writeBackToNotion(notionPageId, { wpPageId, listingUrl, currentListingUrl }) {
  const properties = {
    '🆔 WP Page ID': { number: wpPageId },
  };
  // Only write Listing URL if Notion doesn't already have one.
  if (!currentListingUrl && listingUrl) {
    properties['Listing URL'] = { url: listingUrl };
  }
  await notion.pages.update({ page_id: notionPageId, properties });
}

// ─── Per-property processing ────────────────────────────────────────────────

async function processOne(prop) {
  if (prop.wpPageId) {
    return { slug: prop.slug, skipped: `already has WP Page ID ${prop.wpPageId}` };
  }
  if (!prop.slug) {
    return { slug: '(missing)', skipped: 'no 🔗 Slug in Notion' };
  }
  if (!prop.propertyName) {
    return { slug: prop.slug, skipped: 'no Property Name in Notion' };
  }
  if (!prop.country) {
    return { slug: prop.slug, skipped: 'no Country in Notion' };
  }

  const cSlug = countrySlug(prop.country);
  if (!cSlug) {
    return { slug: prop.slug, error: `Could not derive country slug from "${prop.country}"` };
  }

  const parent = await lookupParentPage(cSlug);
  if (!parent) {
    return { slug: prop.slug, error: `No WP parent page found at /${PROPERTY_HUB_PATH}/${cSlug}/ — create it first or add an override in COUNTRY_SLUG_OVERRIDES` };
  }

  // Safety: if a WP page already exists at this slug under the country parent
  // (e.g., created by the legacy Notion automation, or a previous run that
  // failed before writing back to Notion), reuse it instead of creating a
  // duplicate. We still write the ID back so Notion is in sync.
  const existing = await wp(`/pages?slug=${encodeURIComponent(prop.slug)}&per_page=10&status=publish,draft,private,future,pending`);
  const reuse = existing.find(p => p.parent === parent.id);
  if (reuse) {
    const listingUrl = `${WP_BASE}/${PROPERTY_HUB_PATH}/${cSlug}/${prop.slug}/`;
    await writeBackToNotion(prop.notionPageId, {
      wpPageId: reuse.id,
      listingUrl,
      currentListingUrl: prop.listingUrl,
    });
    return { slug: prop.slug, pageId: reuse.id, link: reuse.link, reused: true };
  }

  const template = await detectTemplate();
  const page = await createPage({
    title: prop.propertyName,
    slug: prop.slug,
    parentId: parent.id,
    template,
  });

  const listingUrl = `${WP_BASE}/${PROPERTY_HUB_PATH}/${cSlug}/${prop.slug}/`;
  await writeBackToNotion(prop.notionPageId, {
    wpPageId: page.id,
    listingUrl,
    currentListingUrl: prop.listingUrl,
  });

  return { slug: prop.slug, pageId: page.id, link: page.link };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching Live properties from Notion…`);
  const properties = await fetchLiveProperties();
  const needsCreate = properties.filter(p => !p.wpPageId);
  console.log(`  ${properties.length} Live, ${needsCreate.length} missing WP Page ID`);

  if (!needsCreate.length) { console.log('Nothing to do.'); return; }

  let ok = 0, fail = 0, skip = 0;
  for (const prop of needsCreate) {
    try {
      const r = await processOne(prop);
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
      console.error(`  ✗ ${prop.slug}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} created, ${skip} skipped, ${fail} failed.`);
  if (fail > 0 && ok === 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
