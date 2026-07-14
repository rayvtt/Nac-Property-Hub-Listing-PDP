#!/usr/bin/env node
/**
 * copy-apply.mjs — the Copy Machine's apply sweeper.
 *
 * Sweeps the 🇻🇳 NAC - LLP VI Copy Review DB for rows with
 * Status = Approved AND Kind = rewrite, writes the Suggested (VI) +
 * Suggested EN copy onto the matching field pair of the listing's row in the
 * 🏠 NAC - Property Listings DB, then flips the finding to Applied. The
 * existing sync-notion cron (≤5 min) carries the change into the PDP HTML and
 * on to WordPress — this script never touches HTML or WP directly.
 *
 * Scope guard: ONLY Kind = rewrite rows are auto-applied. Defect findings
 * (Kind empty / "defect") keep the manual `/llp-copy apply` flow — their
 * Field strings are free-form (often multi-field) and their Suggested text
 * can be prose instructions rather than clean replacement copy.
 *
 * The MCC cockpit's Copy Machine view applies approved rows instantly at
 * click time; this sweeper is the backup path for rows approved directly in
 * Notion, and re-tries rows the cockpit could not apply.
 *
 * Env: NOTION_TOKEN (required)
 *      COPY_REVIEW_DB_ID   (default: the findings DB)
 *      NOTION_DATABASE_ID  (default: 🏠 NAC - Property Listings)
 *      MCC_CONTROL_PAGE_ID (default: the LLP VI Copy Review request row)
 *      DRY_RUN=1           report what would be applied, write nothing
 */
import { Client as NotionClient } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.COPY_REVIEW_DB_ID || '95fb67b946c04c2896f9fd4a60e34367';
const LISTINGS_DB_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const MCC_PAGE_ID = process.env.MCC_CONTROL_PAGE_ID || '39d48ec25e86815f80aac39196754e6b';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
const notion = new NotionClient({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' });

// Base field name (what the Copy Machine writes in `Field`) → the exact
// VI/EN property-name pair on the Property Listings DB. Codepoint-exact —
// several names carry U+FE0F variation selectors; copy from sync-notion.mjs,
// never retype. A base name absent here is skipped loudly, never guessed.
const FIELD_MAP = {
  'Name VI':          { vi: 'Name VI',            en: null },
  'Excerpt':          { vi: 'Excerpt VI',          en: 'Excerpt EN' },
  '🏷️ Tagline':       { vi: '🏷️ Tagline VI',       en: '🏷️ Tagline EN' },
  '📝 Desc':          { vi: '📝 Desc VI',          en: '📝 Desc EN' },
  '🌍 Market':        { vi: '🌍 Market VI',        en: '🌍 Market EN' },
  '💬 NAC Note':      { vi: '💬 NAC Note VI',      en: '💬 NAC Note EN' },
  '📜 Statement':     { vi: '📜 Statement VI',     en: '📜 Statement EN' },
  '✦ Brand Intro':    { vi: '✦ Brand Intro VI',    en: '✦ Brand Intro EN' },
  '🏖️ Beach':         { vi: '🏖️ Beach VI',         en: '🏖️ Beach EN' },
  '✈️ Airport':       { vi: '✈️ Airport VI',       en: '✈️ Airport EN' },
  '🌏 Key Markets':   { vi: '🌏 Key Markets VI',   en: '🌏 Key Markets EN' },
  '📈 Property YoY':  { vi: '📈 Property YoY VI',  en: '📈 Property YoY EN' },
  '🎬 Cine 1':        { vi: '🎬 Cine 1 VI',        en: '🎬 Cine 1 EN' },
  '🎬 Cine 2':        { vi: '🎬 Cine 2 VI',        en: '🎬 Cine 2 EN' },
  '🎬 Cine 3':        { vi: '🎬 Cine 3 VI',        en: '🎬 Cine 3 EN' },
  '🔑 Handover':      { vi: '🔑 Handover VI',      en: '🔑 Handover EN' },
};

const rt = (p) => {
  if (!p) return '';
  const arr = p.title || p.rich_text || [];
  return arr.map(t => t.plain_text).join('');
};

// Notion caps a text object at 2000 chars; chunk long copy across objects.
const chunked = (s) => {
  const out = [];
  for (let i = 0; i < s.length; i += 1990) out.push({ text: { content: s.slice(i, i + 1990) } });
  return { rich_text: out };
};

async function queryAll(database_id, filter) {
  let results = [], cursor;
  do {
    const res = await notion.databases.query({ database_id, filter, start_cursor: cursor, page_size: 100 });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function findListingBySlug(slug) {
  const rows = await queryAll(LISTINGS_DB_ID, {
    property: '🔗 Slug', rich_text: { equals: slug },
  });
  return rows[0] || null;
}

// Per-field validation before anything is written to the listing row.
function validate(base, vi, en) {
  if (!vi) return 'empty Suggested (VI)';
  const pair = FIELD_MAP[base];
  if (pair.en && !en) return 'empty Suggested EN (field is a VI+EN pair)';
  if (base === '📜 Statement') {
    if (!vi.includes('«') || !vi.includes('»')) return 'Statement VI missing «guillemet» highlights';
    if (en && (!en.includes('«') || !en.includes('»'))) return 'Statement EN missing «guillemet» highlights';
  }
  return null;
}

async function appendMccLog(line) {
  try {
    const page = await notion.pages.retrieve({ page_id: MCC_PAGE_ID });
    const existing = rt(page.properties['Result']);
    const next = existing ? existing + '\n' + line : line;
    await notion.pages.update({ page_id: MCC_PAGE_ID, properties: { Result: chunked(next) } });
  } catch (e) {
    console.warn(`MCC log append failed (non-fatal): ${e.message}`);
  }
}

const approved = await queryAll(DB_ID, {
  and: [
    { property: 'Status', select: { equals: 'Approved' } },
    { property: 'Kind', select: { equals: 'rewrite' } },
  ],
});
console.log(`${approved.length} approved rewrite row(s) to apply${DRY_RUN ? ' (DRY RUN)' : ''}`);

let applied = 0, skipped = 0;
const appliedSlugs = new Set();
for (const row of approved) {
  const slug = rt(row.properties['Slug']).trim();
  const base = rt(row.properties['Field']).trim();
  const vi = rt(row.properties['Suggested']).trim();
  const en = rt(row.properties['Suggested EN']).trim();
  const label = `${slug} · ${base}`;

  const pair = FIELD_MAP[base];
  if (!pair) { console.warn(`✗ ${label} — unknown field base "${base}", skipping (extend FIELD_MAP)`); skipped++; continue; }
  const bad = validate(base, vi, en);
  if (bad) { console.warn(`✗ ${label} — ${bad}, skipping`); skipped++; continue; }

  const listing = await findListingBySlug(slug);
  if (!listing) { console.warn(`✗ ${label} — no listing row with 🔗 Slug = "${slug}", skipping`); skipped++; continue; }

  const props = { [pair.vi]: chunked(vi) };
  if (pair.en && en) props[pair.en] = chunked(en);

  if (DRY_RUN) {
    console.log(`→ would apply ${label}: ${Object.keys(props).join(' + ')}`);
    applied++;
    continue;
  }
  await notion.pages.update({ page_id: listing.id, properties: props });
  await notion.pages.update({ page_id: row.id, properties: { Status: { select: { name: 'Applied' } } } });
  console.log(`✓ applied ${label}`);
  applied++;
  appliedSlugs.add(slug);
}

console.log(`done: ${applied} applied, ${skipped} skipped`);
if (!DRY_RUN && applied > 0) {
  const d = new Date().toISOString().slice(0, 10);
  await appendMccLog(`[${d}] apply: ${applied} rewrite(s) applied → ${[...appliedSlugs].join(', ')}`);
}
