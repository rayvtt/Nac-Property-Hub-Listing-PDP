#!/usr/bin/env node
// Queries the "🚀 NAC - SEO Tasks" Notion DB and writes the results into a
// JSON file under .github/state/. Lets workflow output feed back into the
// assistant's context (Read tool reads the JSON file directly from the repo).
//
// Env:
//   NOTION_TOKEN       (required)
//   FILTER_STATUS      Approved | New | Applied | Rejected | Snoozed | "" for all
//   FILTER_PRIORITY    P0 | P1 | P2 | "" for any
//   OUT_PATH           default: .github/state/seo-tasks-<status>.json

import { Client } from '@notionhq/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.SEO_TASKS_DB_ID || 'ada6bd2f8c324773b0d026f9db78d3a2';
const FILTER_STATUS = (process.env.FILTER_STATUS ?? '').trim();
const FILTER_PRIORITY = (process.env.FILTER_PRIORITY ?? '').trim();

if (!TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }

const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });

const conditions = [];
if (FILTER_STATUS) conditions.push({ property: 'Status', select: { equals: FILTER_STATUS } });
if (FILTER_PRIORITY) conditions.push({ property: 'Priority', select: { equals: FILTER_PRIORITY } });
const filter = conditions.length ? (conditions.length === 1 ? conditions[0] : { and: conditions }) : undefined;

async function fetchAll() {
  const results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      filter,
      sorts: [{ property: 'Impact Score', direction: 'descending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return results;
}

function shape(page) {
  const p = page.properties;
  const txt = (prop) => prop?.rich_text?.map((t) => t.plain_text).join('') ?? '';
  const sel = (prop) => prop?.select?.name ?? null;
  const num = (prop) => prop?.number ?? null;
  const chk = (prop) => prop?.checkbox ?? false;
  const url = (prop) => prop?.url ?? null;
  const taskId = p['Task ID']?.unique_id
    ? `${p['Task ID'].unique_id.prefix}-${p['Task ID'].unique_id.number}`
    : null;
  return {
    pageId: page.id,
    taskId,
    title: p['Title']?.title?.map((t) => t.plain_text).join('') ?? '',
    status: sel(p['Status']),
    priority: sel(p['Priority']),
    surface: sel(p['Surface']),
    category: sel(p['Category']),
    themeMonth: sel(p['Theme Month']),
    url: url(p['URL']),
    slug: txt(p['Slug']),
    issue: txt(p['Issue']),
    proposedFix: txt(p['Proposed Fix']),
    diffPreview: txt(p['Diff Preview']),
    notes: txt(p['Notes']),
    impactScore: num(p['Impact Score']),
    impressions: num(p['Impressions 14d']),
    avgPosition: num(p['Avg Position']),
    sessions: num(p['Sessions 14d']),
    targetQuery: txt(p['Target Query']),
    autoApplicable: chk(p['Auto-Applicable']),
    auditRun: p['Audit Run']?.date?.start ?? null,
    appliedAt: p['Applied At']?.date?.start ?? null,
    commitRevision: url(p['Commit/Revision']),
  };
}

async function main() {
  console.log(`Fetching tasks — status=${FILTER_STATUS || 'any'}, priority=${FILTER_PRIORITY || 'any'}`);
  const raw = await fetchAll();
  const tasks = raw.map(shape);
  console.log(`  ${tasks.length} task(s) found.`);

  const statusSlug = FILTER_STATUS.toLowerCase() || 'all';
  const outPath = process.env.OUT_PATH || path.join(ROOT, '.github', 'state', `seo-tasks-${statusSlug}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    filter: { status: FILTER_STATUS, priority: FILTER_PRIORITY },
    count: tasks.length,
    tasks,
  };
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`  → ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
