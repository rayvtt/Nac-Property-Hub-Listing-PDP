#!/usr/bin/env node
// Phase 3 applier — lands Status=Approved SEO fixes to the actual page.
//
// Target routing:
//   - PDP (slug matches properties/<slug>.html in the repo)
//     → edit local file, commit, push. sync-wp.yml then propagates to WP.
//   - Brochure / Hub / Tool (WP page with acf.raw_html_code field)
//     → fetch raw_html_code via WP REST, modify with cheerio, PATCH back.
//   - Blog (blog.nomadassetcollective.com)
//     → skipped this pass (different WP site, separate integration).
//
// For each task:
//   1. If proposedFix is empty, drafts it on-the-fly via Claude Haiku
//   2. Validates the fix is well-shaped for its category
//   3. Modifies the page's <head> via cheerio (idempotent — checks if the
//      fix is already present)
//   4. Writes back (file commit OR WP REST PATCH)
//   5. Marks Notion task Status=Applied with the commit/revision URL
//
// Env:
//   NOTION_TOKEN, ANTHROPIC_API_KEY, WP_USER, WP_APP_PASSWORD
//   DRY_RUN=true              — print actions, no writes
//   MAX_TASKS=20              — batch size
//   SCOPE=pdp,brochure        — comma-separated surfaces to apply

import { Client } from '@notionhq/client';
import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DB_ID = process.env.SEO_TASKS_DB_ID || 'ada6bd2f8c324773b0d026f9db78d3a2';
const MAX_TASKS = Math.max(1, parseInt(process.env.MAX_TASKS || '40', 10));
const DRY = process.env.DRY_RUN === 'true';
const SCOPE = (process.env.SCOPE || 'pdp,brochure').toLowerCase().split(',').map((s) => s.trim());
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_PASS = process.env.WP_APP_PASSWORD;
const ACF_HTML_FIELD = process.env.WP_ACF_FIELD || 'raw_html_code';

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY required'); process.exit(1); }
if (!WP_PASS) { console.error('WP_APP_PASSWORD required'); process.exit(1); }

const notion = new Client({ auth: NOTION_TOKEN });
const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Notion read/write ─────────────────────────────────────────────────────

async function fetchApprovedTasks() {
  const out = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      filter: {
        and: [
          { property: 'Status', select: { equals: 'Approved' } },
          { property: 'Auto-Applicable', checkbox: { equals: true } },
        ],
      },
      sorts: [{ property: 'Impact Score', direction: 'descending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    out.push(...res.results);
    if (out.length >= MAX_TASKS) break;
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out.slice(0, MAX_TASKS);
}

function readTask(page) {
  const p = page.properties;
  const txt = (prop) => prop?.rich_text?.map((t) => t.plain_text).join('') ?? '';
  const sel = (prop) => prop?.select?.name ?? null;
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
    url: p['URL']?.url ?? null,
    slug: txt(p['Slug']),
    issue: txt(p['Issue']),
    proposedFix: txt(p['Proposed Fix']),
  };
}

async function markApplied(task, receipt) {
  if (DRY) { console.log(`    [dry] mark applied: ${task.taskId} → ${receipt}`); return; }
  await notion.pages.update({
    page_id: task.pageId,
    properties: {
      Status: { select: { name: 'Applied' } },
      'Applied At': { date: { start: new Date().toISOString().slice(0, 10) } },
      'Commit/Revision': { url: receipt },
    },
  });
}

async function markSkipped(task, reason) {
  if (DRY) { console.log(`    [dry] mark skipped: ${task.taskId} — ${reason}`); return; }
  await notion.pages.update({
    page_id: task.pageId,
    properties: {
      Notes: { rich_text: [{ text: { content: `Apply skipped: ${reason}` } }] },
    },
  });
}

// ─── Drafting (fallback when Proposed Fix is empty) ─────────────────────────

const SYSTEM_PROMPT = `You are an SEO/GEO copy expert for Nomad Asset Collective — luxury international real-estate and visa/residency programs, bilingual VI/EN. Match the page's brand and language; never invent facts. Output STRICT JSON only.`;

async function draftMetaDescription(pageHtml, pageUrl) {
  const $ = cheerio.load(pageHtml);
  const title = ($('head title').first().text() || '').trim();
  const h1 = ($('h1').first().text() || '').trim();
  $('script, style, nav, footer, header, noscript').remove();
  const body = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);

  const resp = await claude.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `URL: ${pageUrl}
Title: ${title}
H1: ${h1}

Body excerpt:
${body}

Write a meta description for this page. Constraints:
- 140-155 characters
- Match the page's actual language (Vietnamese if the title/body is Vietnamese)
- Concrete and scannable, no generic CTA fluff
- Convey the unique value of THIS visa program / property

Return: {"description": "..."}`
    }],
  });
  const raw = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return parsed.description;
}

function generateSchemaJsonLd(pageHtml, pageUrl, surface, slug) {
  const $ = cheerio.load(pageHtml);
  const title = ($('head title').first().text() || '').trim();
  const h1 = ($('h1').first().text() || '').trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  $('script, style, nav, footer, header, noscript').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 200);

  const schemaType = {
    PDP: 'RealEstateListing', Hub: 'CollectionPage', Tool: 'WebApplication',
    Home: 'WebSite', Brochure: 'CreativeWork', Blog: 'Article', Sitewide: 'WebPage',
  }[surface] || 'WebPage';

  const desc = (metaDesc || bodyText || '').slice(0, 200).trim();
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': schemaType,
        name: h1 || title || slug,
        ...(schemaType === 'Article' ? { headline: h1 || title } : {}),
        description: desc,
        url: pageUrl,
        publisher: { '@type': 'Organization', name: 'Nomad Asset Collective' },
        inLanguage: /[àáảãạ]/.test(title) ? 'vi' : 'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nomadassetcollective.com/' },
          { '@type': 'ListItem', position: 2, name: h1 || title || slug },
        ],
      },
    ],
  };
  return '<script type="application/ld+json">\n' + JSON.stringify(jsonld, null, 2) + '\n</script>';
}

// ─── Cheerio fix injectors ──────────────────────────────────────────────────
// Each returns { changed: bool, html: newHtml, reason: string }
// Idempotent: checks if the fix is already present.

function injectMetaDescription($, content) {
  if (!content) return { changed: false, reason: 'empty description' };
  const existing = $('meta[name="description"]');
  if (existing.length) {
    const cur = existing.attr('content') || '';
    if (cur === content) return { changed: false, reason: 'already correct' };
    existing.attr('content', content);
    return { changed: true, reason: `updated existing meta` };
  }
  $('head').append(`\n<meta name="description" content="${content.replace(/"/g, '&quot;')}">`);
  return { changed: true, reason: 'inserted new meta' };
}

function injectTitle($, content) {
  if (!content) return { changed: false, reason: 'empty title' };
  const existing = $('head title');
  if (existing.length) {
    if (existing.text() === content) return { changed: false, reason: 'already correct' };
    existing.text(content);
    return { changed: true, reason: 'updated existing title' };
  }
  $('head').prepend(`\n<title>${content}</title>`);
  return { changed: true, reason: 'inserted new title' };
}

function injectCanonical($, url) {
  if (!url) return { changed: false, reason: 'no url' };
  const existing = $('link[rel="canonical"]');
  if (existing.length) {
    if (existing.attr('href') === url) return { changed: false, reason: 'already correct' };
    existing.attr('href', url);
    return { changed: true, reason: 'updated canonical href' };
  }
  $('head').append(`\n<link rel="canonical" href="${url}">`);
  return { changed: true, reason: 'inserted canonical' };
}

function injectSchemaBlock($, jsonLd) {
  if (!jsonLd || !jsonLd.trim().startsWith('<script')) {
    return { changed: false, reason: 'invalid schema block (not a <script> tag)' };
  }
  // Check if any schema already exists; don't dedupe by content for now
  $('head').append('\n' + jsonLd);
  return { changed: true, reason: 'inserted schema JSON-LD' };
}

// ─── Routing: PDP file vs WP REST ───────────────────────────────────────────

async function findPdpFile(slug) {
  if (!slug) return null;
  const p = path.join(PROPERTIES_DIR, `${slug}.html`);
  try {
    await fs.access(p);
    return p;
  } catch { return null; }
}

async function wpFetch(pathname, options = {}, baseOverride) {
  const base = (baseOverride || WP_BASE).replace(/\/$/, '');
  const api = `${base}/wp-json/wp/v2`;
  const res = await fetch(`${api}${pathname}`, {
    ...options,
    headers: {
      Authorization: WP_AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WP ${options.method || 'GET'} ${base}${pathname} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function findWpPageBySlug(slug, baseOverride) {
  // Try pages first, then posts (blog posts on blog subdomain).
  for (const endpoint of ['/pages', '/posts']) {
    try {
      const list = await wpFetch(`${endpoint}?slug=${encodeURIComponent(slug)}&per_page=5&status=publish`, {}, baseOverride);
      if (list && list.length) return list[0];
    } catch (err) {
      // 401/403 on blog subdomain = no auth there. Log and try next.
      if (/401|403/.test(err.message)) {
        console.warn(`     ⚠ ${endpoint} on ${baseOverride || WP_BASE} returned auth error — skipping`);
        return null;
      }
      // 404 just means slug doesn't exist at this endpoint, try next
    }
  }
  return null;
}

// ─── Apply one task ─────────────────────────────────────────────────────────

function classifyTaskType(task) {
  const t = task.title.toLowerCase();
  if (t.startsWith('missing meta description') || t.startsWith('meta description too long')) return 'meta_description';
  if (t.startsWith('missing <title>') || t.startsWith('title too long')) return 'title';
  if (t.startsWith('missing canonical')) return 'canonical';
  if (t.startsWith('no schema.org')) return 'schema';
  if (t.startsWith('missing og:image')) return 'og_image';
  return null;
}

async function applyTask(task, surfaceTarget) {
  const taskType = classifyTaskType(task);
  if (!taskType) return { applied: false, reason: `no applier for task type "${task.title}"` };

  // Get the current HTML — either from repo file or from WP REST
  let currentHtml, writeBack;
  if (surfaceTarget.kind === 'pdp_file') {
    currentHtml = await fs.readFile(surfaceTarget.path, 'utf8');
    writeBack = async (newHtml) => fs.writeFile(surfaceTarget.path, newHtml, 'utf8');
  } else if (surfaceTarget.kind === 'wp_page') {
    const page = surfaceTarget.page;
    currentHtml = page.acf?.[ACF_HTML_FIELD] || '';
    if (!currentHtml) return { applied: false, reason: `WP page ${page.id} has no ${ACF_HTML_FIELD} ACF field` };
    writeBack = async (newHtml) => {
      if (DRY) return { id: page.id, modified: '(dry)' };
      return wpFetch(`/pages/${page.id}`, {
        method: 'POST',
        body: JSON.stringify({ acf: { [ACF_HTML_FIELD]: newHtml } }),
      });
    };
  }

  // Determine the fix value — use proposedFix if present, else draft on-the-fly
  let fixValue = task.proposedFix;
  if (!fixValue || (taskType === 'schema' && !fixValue.trim().startsWith('<script'))) {
    if (taskType === 'meta_description') {
      console.log(`    drafting meta description on-the-fly…`);
      fixValue = await draftMetaDescription(currentHtml, surfaceTarget.url);
    } else {
      return { applied: false, reason: `no usable Proposed Fix for ${taskType}` };
    }
  }

  // Inject
  const $ = cheerio.load(currentHtml, { decodeEntities: false });
  let result;
  if (taskType === 'meta_description') result = injectMetaDescription($, fixValue);
  else if (taskType === 'title') result = injectTitle($, fixValue);
  else if (taskType === 'canonical') result = injectCanonical($, surfaceTarget.url);
  else if (taskType === 'schema') result = injectSchemaBlock($, fixValue);
  else if (taskType === 'og_image') result = { changed: false, reason: 'og:image needs manual hero URL — skipped' };

  if (!result.changed) return { applied: false, reason: result.reason };

  if (DRY) {
    console.log(`    [dry] would write back ${result.reason} (fix=${(fixValue || '').slice(0, 60)}…)`);
    return { applied: true, dryRun: true, reason: result.reason, fixValue };
  }

  await writeBack($.html());
  return { applied: true, reason: result.reason, fixValue };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`SEO applier  ${DRY ? '(DRY RUN)' : '(LIVE)'}`);
  console.log(`  scope: ${SCOPE.join(',')}  max: ${MAX_TASKS}\n`);

  const raw = await fetchApprovedTasks();
  const tasks = raw.map(readTask);
  console.log(`  ${tasks.length} approved task(s) fetched.`);

  // Filter by SCOPE — route each task to PDP file or WP REST
  const eligible = [];
  const MAIN_WP_SURFACES = ['Brochure', 'Hub', 'Tool', 'Home', 'Sitewide'];
  for (const t of tasks) {
    const url = t.url || '';
    const surf = t.surface || '';
    const pdpFile = await findPdpFile(t.slug);

    if (pdpFile && SCOPE.includes('pdp')) {
      eligible.push({ task: t, kind: 'pdp_file', path: pdpFile, url });
    } else if (surf === 'Blog' && SCOPE.includes('blog')) {
      // Blog lives on blog.nomadassetcollective.com — separate WP site.
      // Route to the blog WP API. If WP_BLOG_BASE_URL isn't set, fall back
      // to main and accept it'll likely 404 (logged as skip with reason).
      const blogBase = (process.env.WP_BLOG_BASE_URL || 'https://blog.nomadassetcollective.com').replace(/\/$/, '');
      const derived = url || `${blogBase}/${t.slug}/`;
      eligible.push({ task: t, kind: 'wp_page', url: derived, wpBase: blogBase });
    } else if (MAIN_WP_SURFACES.includes(surf) && SCOPE.some(s => ['brochure','hub','tool','home','sitewide'].includes(s))) {
      // Any main-domain WP page — derive URL from surface + slug
      const prefix = surf === 'Brochure' ? '/brochures/' : '/';
      const derived = url || `${WP_BASE}${prefix}${t.slug}/`;
      eligible.push({ task: t, kind: 'wp_page', url: derived, wpBase: WP_BASE });
    } else {
      // Silent-drop visible: log the reason so we can see exactly why
      console.log(`  ⌀ skip ${t.taskId} (${t.slug}): surface=${surf || 'null'}, no PDP file at properties/${t.slug}.html, no routing match`);
    }
  }
  console.log(`  ${eligible.length} eligible (in scope).\n`);

  // Group by URL/file so we modify each page once even with multiple fixes
  const byTarget = new Map();
  for (const e of eligible) {
    const key = e.kind === 'pdp_file' ? e.path : e.url;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(e);
  }

  const stats = { applied: 0, skipped: 0, errored: 0 };
  const pdpFilesEdited = new Set();

  for (const [key, group] of byTarget) {
    const first = group[0];
    console.log(`▸ ${first.kind === 'pdp_file' ? path.relative(ROOT, first.path) : first.url}  (${group.length} task${group.length > 1 ? 's' : ''})`);

    // Resolve the surface target once per page
    let surfaceTarget;
    if (first.kind === 'pdp_file') {
      surfaceTarget = { kind: 'pdp_file', path: first.path, url: first.url };
    } else {
      try {
        const wpBase = first.wpBase || WP_BASE;
        const page = await findWpPageBySlug(first.task.slug, wpBase);
        if (!page) {
          const reason = `WP page not found for slug "${first.task.slug}" on ${wpBase}`;
          console.log(`    ⚠ ${reason}`);
          for (const e of group) { await markSkipped(e.task, reason); stats.skipped++; }
          continue;
        }
        surfaceTarget = { kind: 'wp_page', page, url: first.url, wpBase };
      } catch (err) {
        console.warn(`    ⚠ WP lookup failed: ${err.message}`);
        for (const e of group) stats.errored++;
        continue;
      }
    }

    // We need to read current HTML ONCE then apply all fixes, then write back ONCE
    let workingHtml;
    if (surfaceTarget.kind === 'pdp_file') {
      workingHtml = await fs.readFile(surfaceTarget.path, 'utf8');
    } else {
      workingHtml = surfaceTarget.page.acf?.[ACF_HTML_FIELD] || '';
      if (!workingHtml) { console.log(`    ⚠ WP page has no raw_html_code — skipping group`); for (const e of group) stats.skipped++; continue; }
    }

    let pageDirty = false;
    const appliedHere = [];

    for (const e of group) {
      const task = e.task;
      try {
        const taskType = classifyTaskType(task);
        if (!taskType) { console.log(`    ⌀ skip ${task.taskId}: unknown task type "${task.title}"`); stats.skipped++; continue; }

        let fixValue = task.proposedFix;
        if (!fixValue || (taskType === 'schema' && !fixValue.trim().startsWith('<script'))) {
          if (taskType === 'meta_description') {
            console.log(`    drafting meta description on-the-fly for ${task.taskId}…`);
            try { fixValue = await draftMetaDescription(workingHtml, surfaceTarget.url); }
            catch (err) { console.warn(`    ⚠ draft failed: ${err.message}`); stats.errored++; continue; }
          } else if (taskType === 'schema') {
            console.log(`    generating schema JSON-LD on-the-fly for ${task.taskId}…`);
            fixValue = generateSchemaJsonLd(workingHtml, surfaceTarget.url, task.surface, task.slug);
          } else {
            console.log(`    ⌀ skip ${task.taskId}: no usable Proposed Fix`);
            await markSkipped(task, 'No usable Proposed Fix');
            stats.skipped++;
            continue;
          }
        }

        const $ = cheerio.load(workingHtml, { decodeEntities: false });
        let result;
        if (taskType === 'meta_description') result = injectMetaDescription($, fixValue);
        else if (taskType === 'title') result = injectTitle($, fixValue);
        else if (taskType === 'canonical') result = injectCanonical($, surfaceTarget.url);
        else if (taskType === 'schema') result = injectSchemaBlock($, fixValue);
        else if (taskType === 'og_image') result = { changed: false, reason: 'og:image needs manual hero URL' };

        if (!result.changed) {
          console.log(`    ⌀ skip ${task.taskId}: ${result.reason}`);
          await markSkipped(task, result.reason);
          stats.skipped++;
          continue;
        }

        workingHtml = $.html();
        pageDirty = true;
        appliedHere.push({ task, taskType, fixValue });
        console.log(`    ✓ apply ${task.taskId}: ${result.reason}`);
      } catch (err) {
        console.warn(`    ⚠ error ${task.taskId}: ${err.message}`);
        stats.errored++;
      }
      await sleep(200);
    }

    if (!pageDirty) continue;

    // Commit page back
    let receipt = '';
    if (surfaceTarget.kind === 'pdp_file') {
      if (!DRY) await fs.writeFile(surfaceTarget.path, workingHtml, 'utf8');
      pdpFilesEdited.add(path.relative(ROOT, surfaceTarget.path));
      receipt = '(repo commit — see SEO apply commit)';
    } else {
      const wpBase = surfaceTarget.wpBase || WP_BASE;
      if (!DRY) {
        const updated = await wpFetch(`/pages/${surfaceTarget.page.id}`, {
          method: 'POST',
          body: JSON.stringify({ acf: { [ACF_HTML_FIELD]: workingHtml } }),
        }, wpBase);
        receipt = `${wpBase}/wp-admin/post.php?post=${surfaceTarget.page.id}&action=edit`;
      } else {
        receipt = '(dry-run — would PATCH WP)';
      }
    }

    for (const a of appliedHere) {
      await markApplied(a.task, receipt);
      stats.applied++;
      await sleep(200);
    }
  }

  // Single commit for all PDP file edits (if any)
  if (!DRY && pdpFilesEdited.size > 0) {
    try {
      execSync('git config user.name "nac-seo-bot"', { cwd: ROOT });
      execSync('git config user.email "nac-seo-bot@users.noreply.github.com"', { cwd: ROOT });
      execSync(`git add ${[...pdpFilesEdited].map((f) => `"${f}"`).join(' ')}`, { cwd: ROOT });
      execSync('git commit -m "seo: apply approved SEO fixes to PDP <head> tags"', { cwd: ROOT });
      execSync('git push origin HEAD', { cwd: ROOT });
      console.log(`\n✓ Pushed ${pdpFilesEdited.size} PDP file(s).`);
    } catch (err) {
      console.warn(`⚠ git push failed: ${err.message}`);
    }
  }

  console.log(`\nDone. applied=${stats.applied}  skipped=${stats.skipped}  errored=${stats.errored}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
