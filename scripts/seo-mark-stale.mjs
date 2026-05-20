#!/usr/bin/env node
// One-off helper: marks pre-tuning SEO audit tasks as Snoozed.
//
// Use this when the audit script's URL filter or surface classifier has been
// updated meaningfully, so existing Status=New tasks are stale (generated from
// the old logic). It moves them to Status=Snoozed with a Notes annotation
// instead of deleting them — they stay queryable for manual review later.
//
// Run via workflow_dispatch (.github/workflows/seo-mark-stale.yml) or locally:
//   NOTION_TOKEN=... node scripts/seo-mark-stale.mjs
//
// Optional env:
//   STALE_AUDIT_RUN_DATE   = "2026-05-19"  // only snooze tasks from this date
//                                              (default: all current Status=New)
//   STALE_NOTE             = "Pre-tuning audit (URL filter + classifier fix)"
//   DRY_RUN                = "true"        // print what would change, do nothing

import { Client } from '@notionhq/client';

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.SEO_TASKS_DB_ID || 'ada6bd2f8c324773b0d026f9db78d3a2';
const FILTER_DATE = process.env.STALE_AUDIT_RUN_DATE || '';
const NOTE = process.env.STALE_NOTE
  || `Pre-tuning audit run — superseded by tuned re-run on ${new Date().toISOString().slice(0, 10)}`;
const DRY = process.env.DRY_RUN === 'true';

if (!TOKEN) {
  console.error('NOTION_TOKEN env var is required');
  process.exit(1);
}

const notion = new Client({ auth: TOKEN });

async function fetchOpenTasks() {
  const results = [];
  let cursor;
  const baseFilter = { property: 'Status', select: { equals: 'New' } };
  const filter = FILTER_DATE
    ? { and: [baseFilter, { property: 'Audit Run', date: { equals: FILTER_DATE } }] }
    : baseFilter;

  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      filter,
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return results;
}

async function snooze(pageId) {
  return notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { select: { name: 'Snoozed' } },
      Notes: { rich_text: [{ text: { content: NOTE } }] },
    },
  });
}

async function main() {
  console.log(`Fetching open (Status=New) tasks${FILTER_DATE ? ` from ${FILTER_DATE}` : ''} …`);
  const tasks = await fetchOpenTasks();
  console.log(`  ${tasks.length} task(s) to snooze.`);
  if (!tasks.length) return;

  if (DRY) {
    console.log('[DRY_RUN] would snooze:');
    for (const t of tasks.slice(0, 10)) {
      const title = t.properties?.Title?.title?.[0]?.plain_text || '(no title)';
      console.log(`  - ${t.id}  ${title}`);
    }
    if (tasks.length > 10) console.log(`  … and ${tasks.length - 10} more`);
    console.log(`Notes that would be written: "${NOTE}"`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const t of tasks) {
    try {
      await snooze(t.id);
      ok++;
      if (ok % 25 === 0) process.stdout.write(`\r  ${ok}/${tasks.length}`);
    } catch (err) {
      failed++;
      console.warn(`\n  ⚠ ${t.id}: ${err.message}`);
    }
    // Notion API soft limit ~3 req/s — pacing keeps us well under
    await new Promise((r) => setTimeout(r, 320));
  }
  console.log(`\nDone. ${ok} snoozed, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
