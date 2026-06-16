#!/usr/bin/env node
/**
 * strip-title-emojis.mjs — remove a leading emoji prefix from every listing's
 * title across the Property Listings DB.
 *
 * Earlier batches scaffolded titles like "🌳 Sobha Estates — …" / "🏙️ The
 * Conlay …". This strips the leading emoji (incl. ZWJ sequences + variation
 * selectors + the trailing space) from BOTH `Property Name` (title) and
 * `Name VI` (rich text), so the PDPs render clean names after the next
 * sync-notion. Idempotent: rows without a leading emoji are left untouched.
 *
 * Fire via the `strip-title-emojis` trigger token or workflow_dispatch.
 * Requires NOTION_TOKEN.
 */
import { Client } from '@notionhq/client';

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
if (!TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }
const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Leading run of emoji (pictographic / flags), each optionally followed by a
// variation selector, optionally joined by ZWJ into a sequence, then any spaces.
const EMOJI_LEAD = /^(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}☀-⛿✀-➿]️?(?:‍[\p{Extended_Pictographic}]️?)*\s*)+/u;
const strip = (s) => (s || '').replace(EMOJI_LEAD, '').trimStart();

async function* allPages() {
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: DATABASE_ID, start_cursor: cursor, page_size: 100 });
    for (const p of res.results) yield p;
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  let scanned = 0, changed = 0;
  for await (const page of allPages()) {
    scanned++;
    const titleProp = page.properties['Property Name'];
    const viProp = page.properties['Name VI'];
    const title = (titleProp?.title || []).map((t) => t.plain_text).join('');
    const vi = (viProp?.rich_text || []).map((t) => t.plain_text).join('');
    const newTitle = strip(title);
    const newVi = strip(vi);
    const props = {};
    if (newTitle && newTitle !== title) props['Property Name'] = { title: [{ text: { content: newTitle } }] };
    if (newVi !== vi) props['Name VI'] = { rich_text: newVi ? [{ text: { content: newVi } }] : [] };
    if (!Object.keys(props).length) continue;
    changed++;
    console.log(`  ${dry ? '[dry] ' : ''}✂ ${JSON.stringify(title)} → ${JSON.stringify(newTitle)}`);
    if (!dry) {
      await notion.pages.update({ page_id: page.id, properties: props });
      await sleep(350); // stay under Notion's ~3 req/s limit
    }
  }
  console.log(`\n✓ scanned ${scanned} listings, ${dry ? 'would change' : 'updated'} ${changed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
