#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SEO/GEO/LLM scaffold tracker + notifier.
//
// Runs at the tail of create-pdp.yml for every newly-scaffolded listing. For
// each slug it:
//   1. Looks up the Notion Property Listings row (page id, name, Listing URL)
//   2. Records an "Applied" task in the 🚀 NAC - SEO Tasks DB so every new
//      listing's SEO/GEO/LLM scaffold is auditable (Surface=PDP, Category=Schema)
//   3. Posts a comment on the property row as the notification channel
//      ("✅ SEO/GEO/LLM scaffolded … tracked at <task url>")
//
// Idempotent: skips a slug that already has a scaffold task row, so re-runs of
// the 5-minute cron never duplicate. Never hard-fails — tracking/notifying must
// not break the scaffold pipeline, so all errors are logged and swallowed.
//
// Usage:
//   NOTION_TOKEN=… node seo-scaffold-log.mjs "slug-a slug-b"
//   NEW_SLUGS="slug-a,slug-b" NOTION_TOKEN=… node seo-scaffold-log.mjs
//
// Env:
//   NOTION_TOKEN            (required)
//   NOTION_DATABASE_ID      Property Listings DB (default below)
//   SEO_TASKS_DB_ID         SEO Tasks DB (default below)
//   GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID   → Commit/Revision link
// ─────────────────────────────────────────────────────────────────────────────

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const LISTINGS_DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const TASKS_DB = process.env.SEO_TASKS_DB_ID || 'ada6bd2f8c324773b0d026f9db78d3a2';

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(0); } // soft-exit

const notion = new Client({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' });

const slugsArg = process.argv.slice(2).join(' ') || process.env.NEW_SLUGS || '';
const slugs = slugsArg.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

const runUrl = (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID)
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;

const TITLE_PREFIX = 'SEO/GEO/LLM scaffolded';

const richText = (prop) => {
  if (!prop) return '';
  if (prop.title) return prop.title.map((t) => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text).join('');
  return '';
};

async function findListing(slug) {
  const res = await notion.databases.query({
    database_id: LISTINGS_DB,
    filter: { property: '🔗 Slug', rich_text: { equals: slug } },
    page_size: 1,
  });
  return res.results[0] || null;
}

async function existingTask(slug) {
  const res = await notion.databases.query({
    database_id: TASKS_DB,
    filter: {
      and: [
        { property: 'Slug', rich_text: { equals: slug } },
        { property: 'Title', title: { starts_with: TITLE_PREFIX } },
      ],
    },
    page_size: 1,
  });
  return res.results[0] || null;
}

async function createTask({ slug, name, url }) {
  const properties = {
    Title: { title: [{ text: { content: `${TITLE_PREFIX} — ${name}` } }] },
    Status: { select: { name: 'Applied' } },
    Priority: { select: { name: 'P1' } },
    Surface: { select: { name: 'PDP' } },
    Category: { select: { name: 'Schema' } },
    'Auto-Applicable': { checkbox: true },
    Slug: { rich_text: [{ text: { content: slug } }] },
    Issue: { rich_text: [{ text: { content:
      'New listing scaffolded — RealEstateListing + FAQPage + BreadcrumbList structured data, geo coordinates, OG/Twitter cards, and llms.txt entry auto-generated and pushed to WordPress.' } }] },
    'Proposed Fix': { rich_text: [{ text: { content:
      'Auto-completed by sync-notion.mjs → seo-geo-llm.mjs at scaffold time. No manual action required; review structured data with Google Rich Results Test if desired.' } }] },
    'Applied At': { date: { start: new Date().toISOString().slice(0, 10) } },
    'Audit Run': { date: { start: new Date().toISOString().slice(0, 10) } },
  };
  // 'URL' is a text property in this DB → write as rich_text, not url.
  if (url) properties['URL'] = { rich_text: [{ text: { content: url } }] };
  if (runUrl) properties['Commit/Revision'] = { url: runUrl };

  return notion.pages.create({ parent: { database_id: TASKS_DB }, properties });
}

async function notify(listingPageId, { name, taskUrl, url }) {
  const parts = [`✅ SEO/GEO/LLM scaffolded for ${name} — structured data (RealEstateListing · FAQPage · BreadcrumbList), geo, OG/Twitter cards and the llms.txt entry are filled and pushed to WordPress.`];
  if (url) parts.push(` Live: ${url}`);
  if (taskUrl) parts.push(` Tracked: ${taskUrl}`);
  await notion.comments.create({
    parent: { page_id: listingPageId },
    rich_text: [{ text: { content: parts.join('') } }],
  });
}

async function main() {
  if (!slugs.length) { console.log('No slugs supplied — nothing to log.'); return; }
  console.log(`SEO scaffold tracker — ${slugs.length} slug(s): ${slugs.join(', ')}`);

  for (const slug of slugs) {
    try {
      const prior = await existingTask(slug);
      if (prior) { console.log(`  ⤳ ${slug}: scaffold task already exists — skip`); continue; }

      const listing = await findListing(slug);
      if (!listing) { console.log(`  ⚠ ${slug}: no Notion listing row found — skip`); continue; }

      const name = richText(listing.properties['Property Name']) || slug;
      const url = richText(listing.properties['Listing URL']) || null;

      const task = await createTask({ slug, name, url });
      const taskUrl = task.url || null;
      console.log(`  ✓ ${slug}: logged SEO task${taskUrl ? ` (${taskUrl})` : ''}`);

      try {
        await notify(listing.id, { name, taskUrl, url });
        console.log(`  ✓ ${slug}: posted Notion comment notification`);
      } catch (e) {
        console.warn(`  ⚠ ${slug}: comment notify failed (${e.message}) — task row still recorded`);
      }
    } catch (e) {
      console.warn(`  ⚠ ${slug}: ${e.message}`);
    }
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e.message); process.exit(0); }); // never hard-fail
