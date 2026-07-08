#!/usr/bin/env node
// /goal bi-weekly review — measures Google rank (via GSC) for the Vietnamese
// immigration-investment keyword universe across BOTH properties (main + blog,
// both under the sc-domain property), snapshots it, mirrors into the 🎯 Rank
// Tracker Notion DB, logs a 🎯 Goal Reviews row + seo/goal-log.md, and prints a
// headline. Measurement + logging only — task-queueing stays with seo-audit and
// interactive /goal (keeps this job safe to run unattended).
//
// Rank source: Google Search Console (query × page), Vietnam intent implicit in
// the VI keywords. Keywords with no GSC impressions = "not-ranking" (a content
// gap). Optional SERP_API_KEY hook is left for a future absolute-position source.
//
// Env: GSC_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN, GSC_PROPERTY
//      (default sc-domain:nomadassetcollective.com), NOTION_TOKEN,
//      RANK_TRACKER_DB_ID, GOAL_REVIEWS_DB_ID. DRY_RUN=true skips all writes.

import { google } from 'googleapis';
import { Client } from '@notionhq/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KEYWORDS_FILE = path.join(ROOT, 'seo', 'goal-keywords.json');
const SNAP_DIR = path.join(ROOT, 'seo', 'rank-snapshots');
const LOG_FILE = path.join(ROOT, 'seo', 'goal-log.md');

const GSC_PROPERTY = process.env.GSC_PROPERTY || 'sc-domain:nomadassetcollective.com';
const RANK_DB = process.env.RANK_TRACKER_DB_ID || '7913fbe44f6e4ae1a8d36239e26d9b45';
const REVIEWS_DB = process.env.GOAL_REVIEWS_DB_ID || '18771efb91ec436bb3016463ea385a07';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DRY = process.env.DRY_RUN === 'true';

const notion = NOTION_TOKEN ? new Client({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' }) : null;
const iso = (d) => d.toISOString().slice(0, 10);
const norm = (s) => (s || '').toLowerCase().normalize('NFC').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const bandOf = (pos) => pos == null ? 'not-ranking' : pos <= 3 ? 'top-3' : pos <= 10 ? 'striking' : pos <= 20 ? 'page-2' : 'deep';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── GSC pull: query × page for one date window, over 1+ properties ─────────
// GSC_PROPERTY may be a single value or comma-separated (domain property OR a
// pair of URL-prefix properties — main + blog). We iterate and MERGE; the page
// URL's host is what distinguishes main vs blog downstream. Per-property errors
// are collected (never thrown) so an expired token / one bad property degrades
// gracefully instead of crashing the bi-weekly job.
async function gscWindow(sc, properties, startDate, endDate) {
  const byQuery = new Map(); // normalizedQuery → [{ page, position, impressions, clicks, ctr }]
  let anyOk = false;
  const errors = [];
  for (const siteUrl of properties) {
    let startRow = 0;
    while (true) {
      let res;
      try {
        res = await sc.searchanalytics.query({
          siteUrl,
          requestBody: { startDate, endDate, dimensions: ['query', 'page'], rowLimit: 25000, startRow },
        });
      } catch (err) {
        const code = err.status || err.code;
        errors.push(`${siteUrl} (${code}): ${err.message?.split('\n')[0]}`);
        break; // skip this property, try the next
      }
      anyOk = true;
      const rows = res.data.rows || [];
      for (const r of rows) {
        const [query, page] = r.keys;
        const key = norm(query);
        if (!byQuery.has(key)) byQuery.set(key, []);
        byQuery.get(key).push({ page, position: r.position, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr });
      }
      if (rows.length < 25000) break;
      startRow += 25000;
    }
  }
  return { byQuery, anyOk, errors };
}

// Best (lowest-position) NAC page for an exact keyword match in a window.
function exactMatch(byQuery, normKw) {
  const rows = byQuery.get(normKw);
  if (!rows || !rows.length) return null;
  const best = rows.reduce((a, b) => (b.position < a.position ? b : a));
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  return { position: best.position, page: best.page, impressions, clicks };
}

// Long-tail context: queries CONTAINING the keyword (for the Notes field).
function containsContext(byQuery, normKw) {
  let count = 0, bestPos = Infinity, imp = 0;
  for (const [q, rows] of byQuery) {
    if (q === normKw || !q.includes(normKw)) continue;
    count++;
    imp += rows.reduce((s, r) => s + r.impressions, 0);
    for (const r of rows) if (r.position < bestPos) bestPos = r.position;
  }
  return { count, bestPos: bestPos === Infinity ? null : bestPos, impressions: imp };
}

function domainOf(url) {
  if (!url) return 'none';
  if (url.includes('blog.nomadassetcollective.com')) return 'blog';
  if (url.includes('nomadassetcollective.com')) return 'main';
  return 'none';
}

// ─── Notion upsert ──────────────────────────────────────────────────────────
async function upsertKeyword(k, date) {
  if (!notion || DRY) return;
  const found = await notion.databases.query({
    database_id: RANK_DB, filter: { property: 'Keyword', title: { equals: k.kw } }, page_size: 1,
  });
  const existing = found.results[0];
  const props = {
    Keyword: { title: [{ text: { content: k.kw } }] },
    Cluster: k.cluster ? { select: { name: k.cluster } } : undefined,
    Surface: k.surface ? { select: { name: k.surface } } : undefined,
    Priority: k.priority ? { select: { name: k.priority } } : undefined,
    Domain: { select: { name: k.domain } },
    Band: { select: { name: k.band } },
    Position: { number: round1(k.position) },
    'Prev Position': { number: round1(k.prevPosition) },
    Delta: { number: round1(k.delta) },
    'Impressions 28d': { number: Math.round(k.impressions || 0) },
    'Clicks 28d': { number: Math.round(k.clicks || 0) },
    'Target URL': { url: k.rankingUrl || k.target_url || null },
    'Last Review': { date: { start: date } },
    Notes: { rich_text: [{ text: { content: (k.notes || '').slice(0, 1900) } }] },
  };
  Object.keys(props).forEach((key) => props[key] === undefined && delete props[key]);
  if (existing) {
    const prevBest = existing.properties['Best Position']?.number;
    const cands = [prevBest, k.position].filter((v) => v != null);
    if (cands.length) props['Best Position'] = { number: round1(Math.min(...cands)) };
    await notion.pages.update({ page_id: existing.id, properties: props });
  } else {
    props['Best Position'] = { number: round1(k.position) };
    props['First Seen'] = { date: { start: date } };
    await notion.pages.create({ parent: { database_id: RANK_DB }, properties: props });
  }
  await sleep(180);
}

async function logReview(review) {
  if (!notion || DRY) return;
  await notion.pages.create({
    parent: { database_id: REVIEWS_DB },
    properties: {
      Review: { title: [{ text: { content: `Review ${review.date}` } }] },
      Date: { date: { start: review.date } },
      Tracked: { number: review.tracked },
      'Top-3': { number: review.top3 },
      Striking: { number: review.striking },
      'Page-2': { number: review.page2 },
      Deep: { number: review.deep },
      'Not-Ranking': { number: review.notRanking },
      'Avg Position': { number: round1(review.avgPosition) },
      'Avg Position Delta': { number: round1(review.avgPositionDelta) },
      'Top-3 Delta': { number: review.top3Delta },
      Movers: { rich_text: [{ text: { content: review.movers.slice(0, 1900) } }] },
      Regressions: { rich_text: [{ text: { content: review.regressions.slice(0, 1900) } }] },
      Notes: { rich_text: [{ text: { content: review.notes.slice(0, 1900) } }] },
    },
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`/goal review  ${DRY ? '(DRY RUN)' : '(LIVE)'}  property=${GSC_PROPERTY}`);

  const cfg = JSON.parse(await fs.readFile(KEYWORDS_FILE, 'utf8'));
  const universe = cfg.keywords || [];
  console.log(`  ${universe.length} tracked keyword(s).`);

  const clientId = process.env.GSC_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GSC_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error('  ✗ GSC OAuth secrets missing — cannot measure rank. Exiting 0 (no snapshot).');
    process.exit(0);
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const sc = google.searchconsole({ version: 'v1', auth: oauth2 });

  const today = new Date();
  const date = iso(today);
  const day = 24 * 60 * 60 * 1000;
  const curWin = { start: iso(new Date(today - 28 * day)), end: iso(new Date(today - 1 * day)) };
  const prevWin = { start: iso(new Date(today - 56 * day)), end: iso(new Date(today - 29 * day)) };
  console.log(`  window cur=${curWin.start}..${curWin.end}  prev=${prevWin.start}..${prevWin.end}`);

  const properties = GSC_PROPERTY.split(',').map((s) => s.trim()).filter(Boolean);
  console.log(`  properties: ${properties.join(', ')}`);
  const curRes = await gscWindow(sc, properties, curWin.start, curWin.end);
  if (!curRes.anyOk) {
    console.error('  ✗ GSC returned no data for any property — the OAuth refresh token is likely expired/revoked.');
    console.error('    Fix: run `node scripts/gsc-oauth-setup.mjs` locally and update the GSC_OAUTH_REFRESH_TOKEN repo secret.');
    console.error('    Details: ' + (curRes.errors.join(' | ') || '(no error detail)'));
    process.exit(0); // graceful — no snapshot this run, workflow stays green
  }
  const prevRes = await gscWindow(sc, properties, prevWin.start, prevWin.end);
  const cur = curRes.byQuery;
  const prev = prevRes.byQuery;
  console.log(`  GSC rows: cur=${cur.size} queries, prev=${prev.size} queries`);

  const results = [];
  for (const k of universe) {
    const nk = norm(k.kw);
    const m = exactMatch(cur, nk);
    const pm = exactMatch(prev, nk);
    const ctx = containsContext(cur, nk);
    const position = m ? m.position : null;
    const prevPosition = pm ? pm.position : null;
    const delta = position != null && prevPosition != null ? position - prevPosition : null;
    const rankingUrl = m ? m.page : null;
    const notesBits = [];
    if (ctx.count) notesBits.push(`${ctx.count} long-tail queries contain this term (best pos ${round1(ctx.bestPos)}, ${ctx.impressions} impr)`);
    if (!m && ctx.count) notesBits.push('exact term not ranking yet; visible via long-tail — tighten on-page targeting');
    if (!m && !ctx.count) notesBits.push('no GSC visibility — content gap; brief a page for this keyword');
    results.push({
      ...k, position, prevPosition, delta, rankingUrl,
      domain: domainOf(rankingUrl || (m ? m.page : null)) || 'none',
      impressions: m ? m.impressions : 0, clicks: m ? m.clicks : 0,
      band: bandOf(position), context: ctx, notes: notesBits.join(' · '),
    });
  }

  // Headline
  const counts = { 'top-3': 0, striking: 0, 'page-2': 0, deep: 0, 'not-ranking': 0 };
  for (const r of results) counts[r.band]++;
  const ranked = results.filter((r) => r.position != null);
  const avgPosition = ranked.length ? ranked.reduce((s, r) => s + r.position, 0) / ranked.length : null;

  // Deltas vs the previous snapshot on disk
  let prevSnap = null;
  try {
    const files = (await fs.readdir(SNAP_DIR)).filter((f) => f.endsWith('.json')).sort();
    if (files.length) prevSnap = JSON.parse(await fs.readFile(path.join(SNAP_DIR, files[files.length - 1]), 'utf8'));
  } catch { /* first run — no prior snapshot */ }
  const avgPositionDelta = prevSnap?.headline?.avgPosition != null && avgPosition != null
    ? avgPosition - prevSnap.headline.avgPosition : null;
  const top3Delta = prevSnap?.headline ? counts['top-3'] - (prevSnap.headline['top-3'] ?? 0) : null;

  // Movers (within-run: cur vs prior 28d window) + regressions (was top-3, now not)
  const withDelta = results.filter((r) => r.delta != null);
  const gainers = withDelta.filter((r) => r.delta < -0.5).sort((a, b) => a.delta - b.delta).slice(0, 5);
  const regressions = results.filter((r) => r.prevPosition != null && r.prevPosition <= 3 && (r.position == null || r.position > 3));
  const moversStr = gainers.length ? gainers.map((r) => `${r.kw} ${round1(r.prevPosition)}→${round1(r.position)}`).join(' · ') : '—';
  const regrStr = regressions.length ? regressions.map((r) => `${r.kw} ${round1(r.prevPosition)}→${r.position == null ? 'gone' : round1(r.position)}`).join(' · ') : '—';

  const contentGaps = results.filter((r) => r.band === 'not-ranking' && !r.target_url).map((r) => r.kw);
  const quickWins = results.filter((r) => r.band === 'striking').map((r) => `${r.kw}(#${round1(r.position)})`);

  const snapshot = {
    date, property: GSC_PROPERTY, window: { cur: curWin, prev: prevWin },
    headline: { tracked: results.length, ...counts, avgPosition: round1(avgPosition) },
    keywords: results.map((r) => ({
      kw: r.kw, cluster: r.cluster, surface: r.surface, priority: r.priority,
      domain: r.domain, band: r.band, position: round1(r.position),
      prevPosition: round1(r.prevPosition), delta: round1(r.delta),
      impressions: r.impressions, clicks: r.clicks, url: r.rankingUrl,
      contains: { count: r.context.count, bestPos: round1(r.context.bestPos) },
    })),
  };

  // Write snapshot
  if (!DRY) {
    await fs.mkdir(SNAP_DIR, { recursive: true });
    await fs.writeFile(path.join(SNAP_DIR, `${date}.json`), JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  }

  // Notion mirror
  if (notion && !DRY) {
    console.log('  writing Rank Tracker rows…');
    for (const r of results) { try { await upsertKeyword(r, date); } catch (e) { console.warn(`   ⚠ upsert ${r.kw}: ${e.message}`); } }
    const review = {
      date, tracked: results.length, top3: counts['top-3'], striking: counts.striking,
      page2: counts['page-2'], deep: counts.deep, notRanking: counts['not-ranking'],
      avgPosition, avgPositionDelta, top3Delta,
      movers: moversStr, regressions: regrStr,
      notes: `Content gaps: ${contentGaps.length} · Quick wins (striking): ${quickWins.length}`,
    };
    try { await logReview(review); } catch (e) { console.warn(`   ⚠ log review: ${e.message}`); }
  }

  // Markdown log
  const md = [
    `## ${date} — Goal review`,
    ``,
    `- **Tracked**: ${results.length}  ·  🥇 top-3: **${counts['top-3']}**${top3Delta != null ? ` (${top3Delta >= 0 ? '+' : ''}${top3Delta})` : ''}  ·  🎯 striking: ${counts.striking}  ·  📄 page-2: ${counts['page-2']}  ·  🕳️ deep: ${counts.deep}  ·  ∅ not-ranking: ${counts['not-ranking']}`,
    `- **Avg position** (ranked set): ${round1(avgPosition) ?? '—'}${avgPositionDelta != null ? ` (${avgPositionDelta <= 0 ? '' : '+'}${round1(avgPositionDelta)} vs last review${avgPositionDelta < 0 ? ' ✅ improved' : ''})` : ''}`,
    `- **Gainers**: ${moversStr}`,
    `- **Regressions**: ${regrStr}`,
    `- **Content gaps** (no page yet): ${contentGaps.length ? contentGaps.join(', ') : '—'}`,
    `- **Quick wins** (striking 4–10, one push to top-3): ${quickWins.length ? quickWins.join(', ') : '—'}`,
    ``,
  ].join('\n');
  if (!DRY) {
    let head = '';
    try { head = await fs.readFile(LOG_FILE, 'utf8'); } catch { head = '# NAC — /goal ranking log\n\nBi-weekly VN immigration-investment SEO rank reviews (most recent first).\n\n'; }
    // insert newest review just under the header block
    const marker = '\n\n';
    const idx = head.indexOf(marker, head.indexOf('most recent first'));
    const out = idx > -1 ? head.slice(0, idx + marker.length) + md + head.slice(idx + marker.length) : head + md;
    await fs.writeFile(LOG_FILE, out, 'utf8');
  }

  console.log(`\nHeadline: top-3=${counts['top-3']} striking=${counts.striking} page-2=${counts['page-2']} deep=${counts.deep} not-ranking=${counts['not-ranking']}  avgPos=${round1(avgPosition) ?? '—'}`);
  console.log(`Gainers: ${moversStr}`);
  console.log(`Regressions: ${regrStr}`);
  console.log(`Done.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
