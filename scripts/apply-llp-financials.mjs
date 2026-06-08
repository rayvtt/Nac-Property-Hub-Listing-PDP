#!/usr/bin/env node
/**
 * apply-llp-financials.mjs — write bespoke, de-banded financials to Notion.
 *
 * One-shot (idempotent) writer that pushes the per-building financial figures
 * authored in LLP-GENERATION.md (parsed into scripts/au-financials.json) into
 * the 🏠 NAC - Property Listings DB. Matches rows by the `🔗 Slug` field, so
 * there is no name-collision risk. The next sync-notion tick then patches the
 * numbers into properties/<slug>.html, which de-bands the dashboard's fin/nac
 * cells automatically.
 *
 * Only numeric fields are touched (price/yields/score) — editorial is left
 * alone. Percent fields are stored as decimals (0.048 = 4.8%), matching the DB.
 *
 * Env:
 *   NOTION_TOKEN        (required)
 *   NOTION_DATABASE_ID  (optional, defaults to the Property Listings DB)
 *   DRY_RUN=1           log the diff without writing
 *   ONLY=slug-a,slug-b  restrict to specific slugs
 *
 * Usage (CI): node apply-llp-financials.mjs
 */
import { Client } from '@notionhq/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'au-financials.json'), 'utf8'));
const richText = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text).join('').trim();

async function fetchLive() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    out = out.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

function buildProps(target, current) {
  // Only emit fields whose value actually differs, so re-runs are no-ops.
  const props = {}; const diffs = [];
  for (const [name, val] of Object.entries(target)) {
    const cur = current[name]?.number ?? null;
    const same = cur !== null && Math.abs(cur - val) < (Math.abs(val) < 1 ? 1e-6 : 0.5);
    if (!same) { props[name] = { number: val }; diffs.push(`${name}: ${cur} → ${val}`); }
  }
  return { props, diffs };
}

async function main() {
  const pages = await fetchLive();
  const bySlug = new Map();
  for (const pg of pages) { const s = richText(pg.properties['🔗 Slug']); if (s) bySlug.set(s, pg); }
  console.log(`Live rows: ${pages.length} · target listings: ${Object.keys(DATA).length}${DRY_RUN ? ' · DRY RUN' : ''}`);

  let written = 0, noop = 0, missing = [];
  for (const [slug, target] of Object.entries(DATA)) {
    if (ONLY.length && !ONLY.includes(slug)) continue;
    const pg = bySlug.get(slug);
    if (!pg) { missing.push(slug); continue; }
    const { props, diffs } = buildProps(target, pg.properties);
    if (!diffs.length) { noop++; continue; }
    console.log(`\n${slug}\n  ${diffs.join('\n  ')}`);
    if (!DRY_RUN) { await notion.pages.update({ page_id: pg.id, properties: props }); }
    written++;
  }

  console.log(`\n${DRY_RUN ? 'Would write' : 'Wrote'} ${written} · unchanged ${noop}`);
  if (missing.length) console.log(`⚠ no Live Notion row for: ${missing.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
