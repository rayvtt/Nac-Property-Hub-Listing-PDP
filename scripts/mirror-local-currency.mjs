#!/usr/bin/env node
/**
 * mirror-local-currency.mjs — for every Live listing priced in a non-USD currency,
 * mirror the local-currency source into the dedicated fields:
 *   Currency      → Local Currency   (only when Local Currency is blank)
 *   Purchase Price → Local Price
 *
 * Why: the renderer's source of truth is `Local Currency`/`Local Price` (falling
 * back to `Currency`/`Purchase Price`). The fallback already displays correctly,
 * so this is a *non-destructive* fill — it makes the dedicated fields explicit
 * with zero change to displayed prices. USD-priced listings (Panama, Turkey CBI,
 * USD-denominated VN branded, etc.) are skipped. Idempotent: a row that already
 * has Local Currency set is left untouched.
 *
 *   node mirror-local-currency.mjs          # apply
 *   DRY=1 node mirror-local-currency.mjs    # preview only, no writes
 *
 * Env: NOTION_TOKEN (required), NOTION_DATABASE_ID (optional).
 */
import { Client } from '@notionhq/client';

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const DRY = /^(1|true|yes)$/i.test(process.env.DRY || '');
if (!TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }

// Pin the API version — an unpinned client can default to a newer Notion-Version
// under which databases.query(database_id) returns 0 rows (data-source model).
const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });
const sel = (p) => p?.select?.name || '';
const num = (p) => (typeof p?.number === 'number' ? p.number : null);
const txt = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text).join('').trim();

// Query ALL rows and keep Live ones client-side — the server-side select filter
// has intermittently returned 0 rows on this DB. Retry on an empty page set.
async function queryAll() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DATABASE_ID, start_cursor: cursor, page_size: 100 });
    out = out.concat(res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}
async function fetchLive() {
  let all = [];
  for (let i = 1; i <= 5; i++) {
    all = await queryAll();
    if (all.length) break;
    console.log(`  ⚠ fetchLive attempt ${i}: Notion returned 0 rows — retrying…`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
  const live = all.filter((pg) => sel(pg.properties?.['Hub Status']) === 'Live');
  console.log(`fetchLive: ${all.length} rows total · ${live.length} Live\n`);
  return live;
}

async function main() {
  const pages = await fetchLive();
  let set = 0, skipUsd = 0, skipDone = 0, skipNoCur = 0;
  for (const pg of pages) {
    const p = pg.properties;
    const slug = txt(p['🔗 Slug']) || '(no slug)';
    const cur = sel(p['Currency']);
    const localCur = sel(p['Local Currency']);
    const price = num(p['Purchase Price']);
    if (!cur) { skipNoCur++; continue; }            // no currency set — out of scope
    if (cur === 'USD') { skipUsd++; continue; }      // USD-priced — skip per scope
    if (localCur) { skipDone++; continue; }          // already mirrored — idempotent

    const props = { 'Local Currency': { select: { name: cur } } };
    if (price != null) props['Local Price'] = { number: price };
    console.log(`  ${DRY ? '(dry) ' : ''}${slug}: Local Currency=${cur}${price != null ? ` · Local Price=${price.toLocaleString('en-US')}` : ' · (no Purchase Price)'}`);
    if (!DRY) await notion.pages.update({ page_id: pg.id, properties: props });
    set++;
  }
  console.log(`\nmirror-local-currency: ${set} ${DRY ? 'would set' : 'set'} · ${skipUsd} USD-skipped · ${skipDone} already-set · ${skipNoCur} no-currency`);
}

main().catch((e) => { console.error(e); process.exit(1); });
