#!/usr/bin/env node
// Creates properties/<slug>.html from the master template for every Notion row
// with Hub Status = Live that doesn't yet have an HTML file.
//
// Intended to run inside the create-pdp GitHub Action, which follows this up
// with sync-notion.mjs to immediately patch the new file with Notion content,
// then commits and pushes to main.  The push triggers sync-wp.yml, which will
// skip listings with no Listing URL yet (written back later by the WP
// automation) and succeed once that field is populated.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@notionhq/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');
const TEMPLATE = path.join(PROPERTIES_DIR, '_template-listing-pdp.html');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const notion = new Client({ auth: NOTION_TOKEN });

function richText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
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
  return results
    .map(page => ({ slug: richText(page.properties['🔗 Slug']) }))
    .filter(p => p.slug);
}

async function main() {
  const [template, properties] = await Promise.all([
    fs.readFile(TEMPLATE, 'utf-8'),
    fetchLiveProperties(),
  ]);
  console.log(`Found ${properties.length} Live propert(ies) in Notion.`);

  const newSlugs = [];
  for (const { slug } of properties) {
    const dest = path.join(PROPERTIES_DIR, `${slug}.html`);
    let exists = false;
    try { await fs.access(dest); exists = true; } catch { /* new */ }
    if (exists) {
      console.log(`  ⤳ ${slug}: already exists — skip`);
      continue;
    }
    await fs.writeFile(dest, template, 'utf-8');
    console.log(`  ✓ ${slug}: created from template`);
    newSlugs.push(slug);
  }
  console.log(`\nDone. ${newSlugs.length} file(s) created.`);

  // Emit space-separated slugs so the workflow can dispatch sync-images for each.
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `new_slugs=${newSlugs.join(' ')}\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
