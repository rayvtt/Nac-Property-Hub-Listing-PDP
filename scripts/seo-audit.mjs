#!/usr/bin/env node
// Biweekly SEO/GEO/LLM audit.
//   1. Discovers every URL via sitemap.xml
//   2. Classifies each into Surface (PDP / Hub / Tool / Home / Blog / Brochure)
//   3. Fetches each page and extracts SEO signals (title, meta, H1, schema,
//      links, body length, OG tags)
//   4. Pulls last 14d Google Search Console data (queries, impressions, pos)
//   5. Pulls last 14d GA4 data (sessions, engagement)
//   6. Sends the bundle to Claude Opus 4.7 — gets prioritized task list,
//      biased toward the current month's theme
//   7. Writes deduped tasks into Notion "🚀 NAC - SEO Tasks"
//
// Phase status:
//   ✓ Steps 1-3 implemented (no credentials required)
//   ⏳ Step 4 — needs GSC_OAUTH_* secrets (skipped gracefully if absent)
//   ⏳ Step 5 — needs GA4_SERVICE_ACCOUNT_JSON + GA4_PROPERTY_ID
//   ⏳ Step 6 — Claude analyzer (Phase 2, not implemented yet)
//   ✓ Step 7 — Notion writer (skipped gracefully if NOTION_TOKEN absent)
//
// Run locally (dry-run, no Notion writes):
//   NOTION_TOKEN=... node scripts/seo-audit.mjs --dry-run
//
// Run live:
//   NOTION_TOKEN=... node scripts/seo-audit.mjs

import { Client as NotionClient } from '@notionhq/client';
import { google } from 'googleapis';
import * as cheerio from 'cheerio';

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT_SITE = 'https://nomadassetcollective.com';
const BLOG_SITE = 'https://blog.nomadassetcollective.com';
const SITEMAPS = [
  `${ROOT_SITE}/wp-sitemap.xml`,
  `${BLOG_SITE}/wp-sitemap.xml`,
];

const NOTION_TASKS_DB_ID = 'ada6bd2f8c324773b0d026f9db78d3a2';
const NOTION_TASKS_DS_ID = 'ce72b1b7-8c1a-4ab7-bc6b-c3ee5f4e18b9';

// Surface classifier — pattern matched against URL path.
// Order matters: first match wins.
const SURFACE_PATTERNS = [
  { surface: 'PDP',      test: (u) => /\/property-hub-bat-dong-san\/[^/]+\/[^/]+\/?$/.test(u.pathname) },
  { surface: 'Hub',      test: (u) => /\/property-hub-bat-dong-san\/?$/.test(u.pathname) || /\/property-hub-bat-dong-san\/[^/]+\/?$/.test(u.pathname) },
  { surface: 'Tool',     test: (u) => /\/(nac-index|comparison|so-sanh|quiz|quick-quiz)/i.test(u.pathname) },
  { surface: 'Brochure', test: (u) => /\/brochure/i.test(u.pathname) },
  { surface: 'Blog',     test: (u) => u.hostname === 'blog.nomadassetcollective.com' },
  { surface: 'Home',     test: (u) => u.pathname === '/' || u.pathname === '' },
];

function classifySurface(urlStr) {
  try {
    const u = new URL(urlStr);
    for (const { surface, test } of SURFACE_PATTERNS) {
      if (test(u)) return surface;
    }
  } catch {}
  return 'Sitewide';
}

// 12-month theme calendar. M1 starts June 2026.
const THEME_START = new Date('2026-06-01T00:00:00Z');
const THEMES = [
  'M1 Technical', 'M2 Meta', 'M3 E-E-A-T', 'M4 Internal Links',
  'M5 Hub Content', 'M6 PDP Content', 'M7 Tools', 'M8 Brochure',
  'M9 Vietnamese', 'M10 Backlinks', 'M11 Conversion', 'M12 Annual',
];

function currentTheme(now = new Date()) {
  const months = (now.getUTCFullYear() - THEME_START.getUTCFullYear()) * 12
    + (now.getUTCMonth() - THEME_START.getUTCMonth());
  if (months < 0) return THEMES[0];
  return THEMES[months % THEMES.length];
}

// ─── Sitemap discovery ──────────────────────────────────────────────────────

async function fetchSitemapTree(rootUrl) {
  // Handles sitemap-index (with nested <sitemap>) and flat sitemap (<urlset>).
  const urls = [];
  const queue = [rootUrl];
  const seen = new Set();

  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);

    let xml;
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'NAC-SEO-Audit/1.0' } });
      if (!res.ok) {
        console.warn(`  ⚠ ${u} returned ${res.status} — skipping`);
        continue;
      }
      xml = await res.text();
    } catch (err) {
      console.warn(`  ⚠ ${u} fetch failed: ${err.message}`);
      continue;
    }

    const $ = cheerio.load(xml, { xmlMode: true });
    // sitemap-index branch
    const childMaps = $('sitemapindex sitemap loc').map((_, el) => $(el).text().trim()).get();
    childMaps.forEach((child) => queue.push(child));
    // urlset branch
    const pageUrls = $('urlset url loc').map((_, el) => $(el).text().trim()).get();
    urls.push(...pageUrls);
  }
  return urls;
}

// ─── On-page signal extraction ──────────────────────────────────────────────

async function extractSignals(pageUrl) {
  let html;
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'NAC-SEO-Audit/1.0 (+https://nomadassetcollective.com)' },
      redirect: 'follow',
    });
    if (!res.ok) return { url: pageUrl, error: `HTTP ${res.status}` };
    html = await res.text();
  } catch (err) {
    return { url: pageUrl, error: err.message };
  }

  const $ = cheerio.load(html);

  const title = ($('head title').first().text() || '').trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const twitterCard = $('meta[name="twitter:card"]').attr('content') || '';
  const h1s = $('h1').map((_, el) => $(el).text().trim()).get();
  const h2s = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 20);

  const hreflang = $('link[rel="alternate"][hreflang]').map((_, el) => ({
    lang: $(el).attr('hreflang'),
    href: $(el).attr('href'),
  })).get();

  const schemaTypes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).text().trim();
    if (!txt) return;
    try {
      const json = JSON.parse(txt);
      const arr = Array.isArray(json) ? json : [json];
      arr.forEach((node) => {
        const t = node['@type'];
        if (t) schemaTypes.push(...(Array.isArray(t) ? t : [t]));
      });
    } catch {}
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const bodyWordCount = bodyText.split(/\s+/).length;

  // Image alt coverage
  const imgs = $('img');
  const imgsTotal = imgs.length;
  const imgsMissingAlt = imgs.filter((_, el) => !($(el).attr('alt') || '').trim()).length;

  // Internal vs external link counts
  const origin = new URL(pageUrl).origin;
  let internal = 0, external = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const linkOrigin = new URL(href, pageUrl).origin;
      if (linkOrigin === origin) internal++; else external++;
    } catch {}
  });

  return {
    url: pageUrl,
    title,
    titleLen: title.length,
    metaDesc,
    metaDescLen: metaDesc.length,
    canonical,
    ogTitle,
    ogDesc,
    ogImage,
    twitterCard,
    h1s,
    h2sCount: h2s.length,
    h2sSample: h2s.slice(0, 5),
    hreflang,
    schemaTypes,
    bodyWordCount,
    imgsTotal,
    imgsMissingAlt,
    internalLinks: internal,
    externalLinks: external,
  };
}

// ─── Google Search Console (last 14d) ───────────────────────────────────────

async function fetchGscData() {
  const clientId = process.env.GSC_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GSC_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.log('  ⚠ GSC OAuth secrets not set — skipping GSC pull.');
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const sc = google.searchconsole({ version: 'v1', auth: oauth2 });

  const endDate = new Date();
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);

  // Property list. GSC_PROPERTY may be a single value or comma-separated:
  //   - Domain property:  "sc-domain:nomadassetcollective.com"  (covers all subdomains)
  //   - URL-prefix:       "https://nomadassetcollective.com/"
  //   - Multiple:         "https://nomadassetcollective.com/,https://blog.nomadassetcollective.com/"
  const propsRaw = process.env.GSC_PROPERTY
    || 'https://nomadassetcollective.com/,https://blog.nomadassetcollective.com/';
  const properties = propsRaw.split(',').map(s => s.trim()).filter(Boolean);

  const byPage = new Map();
  for (const siteUrl of properties) {
    console.log(`   • Querying ${siteUrl}`);
    let startRow = 0;
    let propertyFailed = false;
    while (true) {
      let res;
      try {
        res = await sc.searchanalytics.query({
          siteUrl,
          requestBody: {
            startDate: iso(startDate),
            endDate: iso(endDate),
            dimensions: ['page', 'query'],
            rowLimit: 25000,
            startRow,
          },
        });
      } catch (err) {
        // 403 = OAuth identity not on this property. 404 = property doesn't
        // exist. Either way, skip this one and keep going — don't crash the
        // whole audit.
        const code = err.status || err.code;
        console.warn(`     ⚠ ${siteUrl} failed (${code}): ${err.message?.split('\n')[0]}`);
        propertyFailed = true;
        break;
      }
      const rows = res.data.rows || [];
      // Group by page → { impressions, clicks, position, topQueries[] }
      for (const r of rows) {
        const [page, query] = r.keys;
        if (!byPage.has(page)) {
          byPage.set(page, { impressions: 0, clicks: 0, posWeighted: 0, queries: [] });
        }
        const entry = byPage.get(page);
        entry.impressions += r.impressions;
        entry.clicks += r.clicks;
        entry.posWeighted += r.position * r.impressions;
        entry.queries.push({ q: query, imp: r.impressions, pos: r.position, ctr: r.ctr });
      }
      if (rows.length < 25000) break;
      startRow += 25000;
    }
    if (propertyFailed) continue;
  }

  for (const entry of byPage.values()) {
    entry.avgPosition = entry.impressions ? entry.posWeighted / entry.impressions : 0;
    entry.queries.sort((a, b) => b.imp - a.imp);
    entry.queries = entry.queries.slice(0, 10);
    delete entry.posWeighted;
  }
  return byPage;
}

// ─── GA4 (last 14d) ─────────────────────────────────────────────────────────

async function fetchGa4Data() {
  const saJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!saJson || !propertyId) {
    console.log('  ⚠ GA4 secrets not set — skipping GA4 pull.');
    return null;
  }

  const credentials = JSON.parse(saJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const res = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: '14daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }, { name: 'hostName' }],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'userEngagementDuration' },
        { name: 'bounceRate' },
      ],
      limit: 10000,
    },
  });

  const byUrl = new Map();
  for (const row of res.data.rows || []) {
    const path = row.dimensionValues[0].value;
    const host = row.dimensionValues[1].value;
    const url = `https://${host}${path}`;
    byUrl.set(url, {
      sessions: Number(row.metricValues[0].value),
      engagedSessions: Number(row.metricValues[1].value),
      engagementDurationSec: Number(row.metricValues[2].value),
      bounceRate: Number(row.metricValues[3].value),
    });
  }
  return byUrl;
}

// ─── Notion writer ──────────────────────────────────────────────────────────

async function writeTasksToNotion(tasks, { dryRun }) {
  if (dryRun) {
    console.log(`\n[dry-run] would write ${tasks.length} task(s) to Notion. Sample:`);
    console.log(JSON.stringify(tasks.slice(0, 3), null, 2));
    return;
  }
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.log('  ⚠ NOTION_TOKEN not set — skipping Notion write.');
    return;
  }
  const notion = new NotionClient({ auth: token });

  // Dedupe: skip if an open task already exists for the same URL + Category
  // + Issue hash. (Implementation deferred until Phase 2 — for now we
  // append, and Notion users can manually deduplicate.)
  for (const task of tasks) {
    try {
      await notion.pages.create({
        parent: { database_id: NOTION_TASKS_DB_ID },
        properties: {
          Title: { title: [{ text: { content: task.title } }] },
          Status: { select: { name: 'New' } },
          Priority: { select: { name: task.priority || 'P2' } },
          Surface: { select: { name: task.surface } },
          Category: { select: { name: task.category } },
          'Theme Month': task.themeMonth ? { select: { name: task.themeMonth } } : undefined,
          URL: { url: task.url },
          Slug: task.slug ? { rich_text: [{ text: { content: task.slug } }] } : undefined,
          Issue: { rich_text: [{ text: { content: task.issue || '' } }] },
          'Proposed Fix': { rich_text: [{ text: { content: task.proposedFix || '' } }] },
          'Impact Score': task.impactScore != null ? { number: task.impactScore } : undefined,
          'Impressions 14d': task.impressions != null ? { number: task.impressions } : undefined,
          'Avg Position': task.avgPosition != null ? { number: task.avgPosition } : undefined,
          'Sessions 14d': task.sessions != null ? { number: task.sessions } : undefined,
          'Target Query': task.targetQuery ? { rich_text: [{ text: { content: task.targetQuery } }] } : undefined,
          'Auto-Applicable': { checkbox: !!task.autoApplicable },
          'Audit Run': { date: { start: new Date().toISOString().slice(0, 10) } },
        },
      });
    } catch (err) {
      console.warn(`  ⚠ Failed to write task "${task.title}": ${err.message}`);
    }
  }
}

// ─── Phase-1 heuristic task generator ────────────────────────────────────────
// Pre-LLM analyzer. Produces P0/P1 tasks from on-page signals alone — things
// any audit should catch: missing title, missing meta, no canonical, no
// schema, missing OG image. Phase 2 swaps this for Claude Opus with full
// GSC/GA4 context.

function heuristicTasks(signals, gscByPage, ga4ByUrl, theme) {
  const tasks = [];
  for (const sig of signals) {
    if (sig.error) continue;
    const surface = classifySurface(sig.url);
    const gsc = gscByPage?.get(sig.url) || gscByPage?.get(sig.url + '/');
    const ga4 = ga4ByUrl?.get(sig.url) || ga4ByUrl?.get(sig.url + '/');
    const impressions = gsc?.impressions ?? null;
    const sessions = ga4?.sessions ?? null;
    const avgPosition = gsc?.avgPosition ?? null;
    const topQuery = gsc?.queries?.[0]?.q ?? null;
    const slug = (() => {
      try {
        const segs = new URL(sig.url).pathname.split('/').filter(Boolean);
        return segs[segs.length - 1] || '';
      } catch { return ''; }
    })();
    const impactBase = (impressions ?? 10) * Math.max(1, (avgPosition ?? 50) - 10);

    const push = (t) => tasks.push({
      surface, slug, url: sig.url, themeMonth: theme,
      impressions, sessions, avgPosition, targetQuery: topQuery,
      ...t,
    });

    if (!sig.title) {
      push({
        title: `Missing <title> on ${slug || sig.url}`,
        priority: 'P0', category: 'Meta', autoApplicable: true,
        issue: 'Page has no <title> tag. Critical SEO/social/LLM signal.',
        proposedFix: '',
        impactScore: impactBase * 10,
      });
    } else if (sig.titleLen > 65) {
      push({
        title: `Title too long (${sig.titleLen} chars) — ${slug}`,
        priority: 'P1', category: 'Meta', autoApplicable: false,
        issue: `Current: "${sig.title}" (${sig.titleLen} chars). Google truncates around 60.`,
        proposedFix: '', impactScore: impactBase,
      });
    }
    if (!sig.metaDesc) {
      push({
        title: `Missing meta description — ${slug || sig.url}`,
        priority: 'P0', category: 'Meta', autoApplicable: true,
        issue: 'No meta description. Lowers CTR; LLMs and AI overviews lift meta description for summaries.',
        proposedFix: '', impactScore: impactBase * 5,
      });
    } else if (sig.metaDescLen > 160) {
      push({
        title: `Meta description too long (${sig.metaDescLen}) — ${slug}`,
        priority: 'P2', category: 'Meta', autoApplicable: false,
        issue: `Current: ${sig.metaDescLen} chars. Google truncates around 155.`,
        proposedFix: '', impactScore: impactBase * 0.5,
      });
    }
    if (!sig.canonical) {
      push({
        title: `Missing canonical link — ${slug || sig.url}`,
        priority: 'P1', category: 'Technical', autoApplicable: true,
        issue: 'No <link rel="canonical">. Risk of duplicate-content dilution.',
        proposedFix: `<link rel="canonical" href="${sig.url}">`,
        impactScore: impactBase * 2,
      });
    }
    if (sig.h1s.length === 0) {
      push({
        title: `No H1 on page — ${slug || sig.url}`,
        priority: 'P0', category: 'Content', autoApplicable: false,
        issue: 'No H1 found. Hurts ranking + accessibility + LLM parsing.',
        proposedFix: '', impactScore: impactBase * 8,
      });
    } else if (sig.h1s.length > 1) {
      push({
        title: `Multiple H1s (${sig.h1s.length}) — ${slug}`,
        priority: 'P2', category: 'Content', autoApplicable: false,
        issue: `Found ${sig.h1s.length} H1s. One H1 per page is the convention.`,
        proposedFix: '', impactScore: impactBase * 0.5,
      });
    }
    if (sig.schemaTypes.length === 0) {
      push({
        title: `No schema.org markup — ${slug || sig.url}`,
        priority: surface === 'PDP' ? 'P0' : 'P1',
        category: 'Schema', autoApplicable: true,
        issue: 'No JSON-LD schema found. GEO/LLM-readability suffers; AI overviews favor structured content.',
        proposedFix: surface === 'PDP'
          ? 'Add RealEstateListing + BreadcrumbList + FAQPage JSON-LD blocks.'
          : 'Add at minimum WebPage + BreadcrumbList JSON-LD.',
        impactScore: impactBase * 4,
      });
    }
    if (!sig.ogImage) {
      push({
        title: `Missing og:image — ${slug || sig.url}`,
        priority: 'P1', category: 'Meta', autoApplicable: true,
        issue: 'No og:image. Social shares render as plain text — kills CTR from social referrals.',
        proposedFix: '', impactScore: impactBase * 1.5,
      });
    }
    if (sig.imgsTotal > 0 && sig.imgsMissingAlt / sig.imgsTotal > 0.3) {
      push({
        title: `${sig.imgsMissingAlt}/${sig.imgsTotal} images missing alt — ${slug}`,
        priority: 'P2', category: 'Accessibility', autoApplicable: false,
        issue: 'Image alt text drives image-search traffic AND helps LLMs understand the page.',
        proposedFix: '', impactScore: impactBase * 0.8,
      });
    }
  }
  // Sort by impact desc
  tasks.sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0));
  return tasks;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const theme = currentTheme();
  console.log(`SEO audit — theme: ${theme}${dryRun ? '  (DRY RUN)' : ''}\n`);

  console.log('1. Discovering URLs via sitemap …');
  const urlSets = await Promise.all(SITEMAPS.map(fetchSitemapTree));
  const urls = [...new Set(urlSets.flat())];
  console.log(`   ${urls.length} unique URLs found.`);

  console.log('\n2. Extracting on-page signals (parallel, 10 at a time) …');
  const signals = [];
  const BATCH = 10;
  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map(extractSignals));
    signals.push(...results);
    process.stdout.write(`   ${signals.length}/${urls.length}\r`);
  }
  console.log(`   ${signals.length}/${urls.length} done.`);
  const errored = signals.filter(s => s.error);
  if (errored.length) console.log(`   ⚠ ${errored.length} pages errored.`);

  console.log('\n3. Pulling Google Search Console (last 14d) …');
  let gscByPage = null;
  try {
    gscByPage = await fetchGscData();
    if (gscByPage) console.log(`   ${gscByPage.size} pages with GSC data.`);
  } catch (err) {
    console.warn(`   ⚠ GSC pull failed: ${err.message}. Continuing without GSC data.`);
  }

  console.log('\n4. Pulling GA4 (last 14d) …');
  let ga4ByUrl = null;
  try {
    ga4ByUrl = await fetchGa4Data();
    if (ga4ByUrl) console.log(`   ${ga4ByUrl.size} pages with GA4 data.`);
  } catch (err) {
    console.warn(`   ⚠ GA4 pull failed: ${err.message}. Continuing without GA4 data.`);
  }

  console.log('\n5. Generating tasks (heuristic — Phase 1) …');
  const tasks = heuristicTasks(signals, gscByPage, ga4ByUrl, theme);
  console.log(`   ${tasks.length} task(s) generated.`);
  const byPriority = tasks.reduce((a, t) => ((a[t.priority] = (a[t.priority] || 0) + 1), a), {});
  console.log(`   By priority: ${JSON.stringify(byPriority)}`);

  console.log('\n6. Writing to Notion …');
  await writeTasksToNotion(tasks, { dryRun });

  console.log('\n✓ Audit complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
