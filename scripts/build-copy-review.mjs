#!/usr/bin/env node
/**
 * build-copy-review.mjs — snapshot the LLP VI Copy Review state into
 * copy-review.json (repo root) for the MCC Copy Review module page
 * (copy-review.html, served on GitHub Pages).
 *
 * Sources:
 *   - 🇻🇳 NAC - LLP VI Copy Review findings DB (Notion) — all rows
 *   - MCC 🛎️ Command Requests control row — the run-log lines in `Result`
 *   - seo/llp-copy-reviewed.json — the /llp-copy loop's progress ledger
 *   - properties/*.html — the live-listing denominator
 *
 * Output is content-stable: the file is rewritten only when the payload
 * (minus the `generated` stamp) actually changed, so the cron never churns.
 *
 * Env: NOTION_TOKEN (required)
 *      COPY_REVIEW_DB_ID   (default: the findings DB)
 *      MCC_CONTROL_PAGE_ID (default: the LLP VI Copy Review request row)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client as NotionClient } from '@notionhq/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'copy-review.json');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.COPY_REVIEW_DB_ID || '95fb67b946c04c2896f9fd4a60e34367';
const MCC_PAGE_ID = process.env.MCC_CONTROL_PAGE_ID || '39d48ec25e86815f80aac39196754e6b';

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
const notion = new NotionClient({ auth: NOTION_TOKEN });

const rt = (p) => {
  if (!p) return '';
  const arr = p.title || p.rich_text || [];
  return arr.map(t => t.plain_text).join('');
};

async function fetchFindings() {
  let results = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DB_ID, start_cursor: cursor });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(page => ({
    id: page.id,
    notionUrl: page.url,
    finding: rt(page.properties['Finding']),
    slug: rt(page.properties['Slug']),
    field: rt(page.properties['Field']),
    severity: page.properties['Severity']?.select?.name || '',
    scope: page.properties['Scope']?.select?.name || '',
    status: page.properties['Status']?.select?.name || '',
    current: rt(page.properties['Current']),
    suggested: rt(page.properties['Suggested']),
    rationale: rt(page.properties['Rationale']),
    listingUrl: page.properties['Listing URL']?.url || null,
    created: page.created_time,
  })).sort((a, b) => (a.created < b.created ? 1 : -1));
}

async function fetchMccLogs() {
  const page = await notion.pages.retrieve({ page_id: MCC_PAGE_ID });
  const result = rt(page.properties['Result']);
  const status = page.properties['Status']?.select?.name || '';
  return { status, logs: result.split('\n').map(l => l.trim()).filter(Boolean) };
}

function readLedger() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'seo', 'llp-copy-reviewed.json'), 'utf8')); }
  catch { return []; }
}

function countListings() {
  return fs.readdirSync(path.join(ROOT, 'properties'))
    .filter(f => f.endsWith('.html') && !f.startsWith('_template')).length;
}

const [findings, mcc] = await Promise.all([fetchFindings(), fetchMccLogs()]);
const reviewed = readLedger();
const payload = {
  goal: 'LLP VI Copy Review — all Live LLPs (report-first)',
  mccStatus: mcc.status,
  totalListings: countListings(),
  reviewed,
  findings,
  logs: mcc.logs,
  links: {
    queue: 'https://app.notion.com/p/95fb67b946c04c2896f9fd4a60e34367',
    mccRow: 'https://app.notion.com/p/39d48ec25e86815f80aac39196754e6b',
  },
};

const next = JSON.stringify(payload, null, 2);
let prev = null;
try {
  const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  delete old.generated;
  prev = JSON.stringify(old, null, 2);
} catch {}
if (prev === next) {
  console.log('copy-review.json unchanged — not rewriting');
} else {
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), ...payload }, null, 2) + '\n');
  console.log(`copy-review.json written: ${findings.length} findings, ${reviewed.length}/${payload.totalListings} reviewed, ${mcc.logs.length} log lines`);
}
