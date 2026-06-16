#!/usr/bin/env node
// Phase 2 of the SEO automation pipeline: validate audit tasks against the
// live page, auto-reject false positives, and draft concrete fixes via
// Claude Haiku.
//
// Sits between:
//   - Phase 1 (seo-audit.mjs): identifies issues, writes Status=New tasks
//   - Phase 3 (seo-apply.mjs):  reads Status=Approved tasks, lands fixes
//
// For each task this script:
//   1. Re-fetches the URL fresh
//   2. Confirms the flagged issue still exists in the rendered HTML
//      (catches WP/SEO-plugin-injected content the audit crawler missed)
//   3. If false positive  → Status=Rejected + Notes="why"
//   4. If real            → uses Claude to draft the actual fix, writes
//                           it into Proposed Fix + Diff Preview so the
//                           reviewer can approve in 10 sec per task
//
// Filters (env vars):
//   FILTER_PRIORITY         P0 (default) | P1 | P2 | "" for any
//   FILTER_AUTO_APPLICABLE  true (default) | false
//   MAX_TASKS               100 (default) — batch size per run
//   DRY_RUN                 true — print what would happen, no Notion writes
//
// Required env:
//   NOTION_TOKEN, ANTHROPIC_API_KEY

import { Client } from '@notionhq/client';
import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DB_ID = process.env.SEO_TASKS_DB_ID || 'ada6bd2f8c324773b0d026f9db78d3a2';
const MAX_TASKS = Math.max(1, parseInt(process.env.MAX_TASKS || '100', 10));
const FILTER_PRIORITY = (process.env.FILTER_PRIORITY ?? 'P0').trim();
const FILTER_AUTO_APPLICABLE = process.env.FILTER_AUTO_APPLICABLE !== 'false';
// Comma-separated statuses. Default: New (initial drafting). Set to "Approved"
// to re-process user-approved tasks that need a draft. Use "New,Approved" for both.
const FILTER_STATUSES = (process.env.FILTER_STATUSES ?? 'New')
  .split(',').map((s) => s.trim()).filter(Boolean);
const DRY = process.env.DRY_RUN === 'true';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY required'); process.exit(1); }

const notion = new Client({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' });
const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Notion query ───────────────────────────────────────────────────────────

async function fetchOpenTasks() {
  // Note: we no longer filter by Proposed Fix empty at the query level.
  // Schema tasks may have BAD drafts (placeholder text instead of <script>)
  // that need re-drafting. We filter client-side instead.
  const conditions = [];
  if (FILTER_STATUSES.length === 1) {
    conditions.push({ property: 'Status', select: { equals: FILTER_STATUSES[0] } });
  } else if (FILTER_STATUSES.length > 1) {
    conditions.push({
      or: FILTER_STATUSES.map((s) => ({ property: 'Status', select: { equals: s } })),
    });
  }
  if (FILTER_PRIORITY) {
    conditions.push({ property: 'Priority', select: { equals: FILTER_PRIORITY } });
  }
  if (FILTER_AUTO_APPLICABLE) {
    conditions.push({ property: 'Auto-Applicable', checkbox: { equals: true } });
  }

  const results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      filter: { and: conditions },
      sorts: [{ property: 'Impact Score', direction: 'descending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    if (results.length >= MAX_TASKS) break;
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return results.slice(0, MAX_TASKS);
}

function readTask(page) {
  const p = page.properties;
  const get = (key) => p?.[key];
  const txt = (prop) => prop?.rich_text?.map((t) => t.plain_text).join('') ?? '';
  const sel = (prop) => prop?.select?.name ?? null;
  const num = (prop) => prop?.number ?? null;
  const chk = (prop) => prop?.checkbox ?? false;
  const url = (prop) => prop?.url ?? null;

  return {
    pageId: page.id,
    taskId: p['Task ID']?.unique_id ? `${p['Task ID'].unique_id.prefix}-${p['Task ID'].unique_id.number}` : null,
    title: p['Title']?.title?.map((t) => t.plain_text).join('') ?? '',
    status: sel(get('Status')),
    priority: sel(get('Priority')),
    surface: sel(get('Surface')),
    category: sel(get('Category')),
    url: url(get('URL')),
    slug: txt(get('Slug')),
    issue: txt(get('Issue')),
    impactScore: num(get('Impact Score')),
    targetQuery: txt(get('Target Query')),
    autoApplicable: chk(get('Auto-Applicable')),
  };
}

// ─── Live page signal extraction ────────────────────────────────────────────

async function fetchPageSignals(url) {
  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NAC-SEO-Validate/1.0 (+https://nomadassetcollective.com)' },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    html = await res.text();
  } catch (err) { return { error: err.message }; }

  const $ = cheerio.load(html);

  // Body text excerpt — first ~600 words of visible content (for context to Claude)
  $('script, style, nav, footer, header, noscript').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000);

  return {
    url,
    title: ($('head title').first().text() || '').trim(),
    metaDesc: $('meta[name="description"]').attr('content') || '',
    canonical: $('link[rel="canonical"]').attr('href') || '',
    ogTitle: $('meta[property="og:title"]').attr('content') || '',
    ogDesc: $('meta[property="og:description"]').attr('content') || '',
    ogImage: $('meta[property="og:image"]').attr('content') || '',
    h1s: $('h1').map((_, el) => $(el).text().trim()).get(),
    schemaTypes: (() => {
      const types = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).text().trim());
          const arr = Array.isArray(json) ? json : [json];
          arr.forEach((node) => {
            const t = node['@type'];
            if (t) types.push(...(Array.isArray(t) ? t : [t]));
          });
        } catch {}
      });
      return types;
    })(),
    bodyExcerpt: bodyText,
  };
}

// ─── Validation: is the flagged issue still real? ───────────────────────────
// Returns { real: bool, reason: string } — reason explains why if false.

function validate(task, sig) {
  if (sig.error) return { real: false, reason: `Page fetch failed: ${sig.error}` };
  const t = task.title.toLowerCase();

  if (t.startsWith('missing <title>')) {
    return sig.title ? { real: false, reason: `Title now present: "${sig.title}"` } : { real: true };
  }
  if (t.startsWith('missing meta description')) {
    return sig.metaDesc ? { real: false, reason: `Meta description now present: "${sig.metaDesc.slice(0, 80)}…"` } : { real: true };
  }
  if (t.startsWith('missing canonical')) {
    return sig.canonical ? { real: false, reason: `Canonical now present: ${sig.canonical}` } : { real: true };
  }
  if (t.startsWith('no schema.org')) {
    return sig.schemaTypes.length ? { real: false, reason: `Schema now present: ${sig.schemaTypes.join(', ')}` } : { real: true };
  }
  if (t.startsWith('missing og:image')) {
    return sig.ogImage ? { real: false, reason: `og:image now present: ${sig.ogImage}` } : { real: true };
  }
  if (t.startsWith('no h1')) {
    return sig.h1s.length ? { real: false, reason: `H1 now present: "${sig.h1s[0]}"` } : { real: true };
  }
  // Length-based checks — re-evaluate length, may already be fixed
  if (t.startsWith('title too long')) {
    return sig.title.length > 65 ? { real: true } : { real: false, reason: `Title length OK now (${sig.title.length})` };
  }
  if (t.startsWith('meta description too long')) {
    return sig.metaDesc.length > 160 ? { real: true } : { real: false, reason: `Meta length OK now (${sig.metaDesc.length})` };
  }
  if (t.startsWith('multiple h1s')) {
    return sig.h1s.length > 1 ? { real: true } : { real: false, reason: `H1 count OK now (${sig.h1s.length})` };
  }
  // Unknown task type — assume real, no auto-draft
  return { real: true };
}

// ─── Drafting fixes via Claude ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an SEO/GEO copy expert drafting fixes for a luxury international real-estate website (Nomad Asset Collective — premium branded residences and visa/residency property listings, bilingual VI/EN).

Voice: editorial, factual, never marketing-y. Match the property name, brand, and location exactly as they appear on the page. Never invent details.

Output STRICT JSON only — no preamble, no markdown. Shape varies by task type (see prompt).`;

async function draftFix(task, sig) {
  const t = task.title.toLowerCase();
  let userPrompt;
  let parseShape;

  const pageContext = `Page URL: ${sig.url}
Existing <title>: ${sig.title || '(none)'}
Existing meta description: ${sig.metaDesc || '(none)'}
Existing H1: ${sig.h1s[0] || '(none)'}
Existing og:title: ${sig.ogTitle || '(none)'}
Target query (from GSC): ${task.targetQuery || '(none)'}
Page surface type: ${task.surface}
Body excerpt (first ~600 words):
${sig.bodyExcerpt.slice(0, 3000)}`;

  if (t.startsWith('missing <title>') || t.startsWith('title too long')) {
    userPrompt = `${pageContext}\n\nWrite a single <title> tag for this page. Constraints:\n- 50-60 characters total\n- Lead with what makes this page distinctive\n- End with " | Nomad Asset Collective" if room (truncate if over 60 chars)\n- No emoji\n\nReturn: {"title": "...", "rationale": "one sentence"}`;
    parseShape = 'title';
  } else if (t.startsWith('missing meta description') || t.startsWith('meta description too long')) {
    userPrompt = `${pageContext}\n\nWrite a meta description for this page. Constraints:\n- 140-155 characters\n- Concrete, scannable, includes the page's main value proposition\n- No CTA fluff ("click here", "learn more")\n- Match the page's actual content — don't invent\n\nReturn: {"description": "...", "rationale": "one sentence"}`;
    parseShape = 'description';
  } else if (t.startsWith('missing canonical')) {
    return {
      fix: `<link rel="canonical" href="${sig.url}">`,
      diffPreview: `Add to <head>:\n<link rel="canonical" href="${sig.url}">`,
      rationale: 'Self-canonical to the live URL.',
    };
  } else if (t.startsWith('no schema.org')) {
    // Programmatic — no Claude needed. Schema is highly templatable.
    const schemaType = {
      PDP: 'RealEstateListing', Hub: 'CollectionPage', Tool: 'WebApplication',
      Home: 'WebSite', Brochure: 'CreativeWork', Blog: 'Article', Sitewide: 'WebPage',
    }[task.surface] || 'WebPage';
    const desc = (sig.metaDesc || sig.bodyExcerpt || '').slice(0, 200).trim();
    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': schemaType,
          name: sig.h1s[0] || sig.title || task.slug,
          headline: schemaType === 'Article' ? (sig.h1s[0] || sig.title) : undefined,
          description: desc,
          url: sig.url,
          publisher: { '@type': 'Organization', name: 'Nomad Asset Collective' },
          inLanguage: /[àáảãạ]/.test(sig.title) ? 'vi' : 'en',
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nomadassetcollective.com/' },
            { '@type': 'ListItem', position: 2, name: sig.h1s[0] || sig.title || task.slug },
          ],
        },
      ],
    };
    // Clean undefined fields
    const main = jsonld['@graph'][0];
    Object.keys(main).forEach((k) => { if (main[k] === undefined) delete main[k]; });
    const block = '<script type="application/ld+json">\n' + JSON.stringify(jsonld, null, 2) + '\n</script>';
    return {
      fix: block,
      diffPreview: `Add to <head>:\n${block.slice(0, 400)}${block.length > 400 ? '…' : ''}`,
      rationale: `Programmatic ${schemaType} + BreadcrumbList schema.`,
    };
  } else if (t.startsWith('missing og:image')) {
    return {
      fix: `<meta property="og:image" content="${sig.url}/path-to-hero-image.jpg"><!-- replace with actual hero -->`,
      diffPreview: `Add to <head>. Use the page's hero image URL — likely already present as the main visual.`,
      rationale: 'Manual: substitute the page hero image URL.',
    };
  } else {
    // No drafter for this task type
    return null;
  }

  // Call Claude
  const resp = await claude.messages.create({
    model: MODEL,
    max_tokens: parseShape === 'jsonld' ? 1500 : 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const raw = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);

  if (parseShape === 'title') {
    return {
      fix: parsed.title,
      diffPreview: `Replace <title> tag:\n  before: ${sig.title || '(empty)'}\n  after:  ${parsed.title}`,
      rationale: parsed.rationale || '',
    };
  }
  if (parseShape === 'description') {
    return {
      fix: parsed.description,
      diffPreview: `Replace <meta name="description">:\n  before: ${sig.metaDesc || '(empty)'}\n  after:  ${parsed.description}`,
      rationale: parsed.rationale || '',
    };
  }
  if (parseShape === 'jsonld') {
    // Validate that Claude returned an actual object, not a string
    if (!parsed.jsonld || typeof parsed.jsonld !== 'object') {
      throw new Error(`Claude returned non-object jsonld: ${JSON.stringify(parsed.jsonld).slice(0, 100)}`);
    }
    const block = '<script type="application/ld+json">\n' + JSON.stringify(parsed.jsonld, null, 2) + '\n</script>';
    return {
      fix: block,
      diffPreview: `Add to <head>:\n${block.slice(0, 400)}${block.length > 400 ? '…' : ''}`,
      rationale: parsed.rationale || '',
    };
  }
  return null;
}

// ─── Notion writes ──────────────────────────────────────────────────────────

async function reject(task, reason) {
  if (DRY) { console.log(`  [dry] reject ${task.taskId}: ${reason}`); return; }
  await notion.pages.update({
    page_id: task.pageId,
    properties: {
      Status: { select: { name: 'Rejected' } },
      Notes: { rich_text: [{ text: { content: `Auto-rejected (false positive): ${reason}` } }] },
    },
  });
}

async function writeDraft(task, draft) {
  if (DRY) {
    console.log(`  [dry] draft ${task.taskId}: ${draft.fix.slice(0, 80)}…`);
    return;
  }
  await notion.pages.update({
    page_id: task.pageId,
    properties: {
      'Proposed Fix': { rich_text: [{ text: { content: draft.fix.slice(0, 2000) } }] },
      'Diff Preview': { rich_text: [{ text: { content: draft.diffPreview.slice(0, 2000) } }] },
      Notes: draft.rationale ? { rich_text: [{ text: { content: draft.rationale } }] } : undefined,
    },
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`SEO validate+draft  ${DRY ? '(DRY RUN)' : ''}`);
  console.log(`  filters: statuses=${FILTER_STATUSES.join('|')}, priority=${FILTER_PRIORITY || 'any'}, auto-applicable=${FILTER_AUTO_APPLICABLE}, max=${MAX_TASKS}`);

  const raw = await fetchOpenTasks();
  const WP_BASE = 'https://nomadassetcollective.com';
  const BLOG_BASE = 'https://blog.nomadassetcollective.com';
  const allTasks = raw.map(readTask).map((t) => {
    // Derive URL from slug when the Notion URL field is empty
    if (!t.url && t.slug) {
      if (t.surface === 'Blog') t.url = `${BLOG_BASE}/${t.slug}/`;
      else if (t.surface === 'Brochure') t.url = `${WP_BASE}/brochures/${t.slug}/`;
      else t.url = `${WP_BASE}/${t.slug}/`;
    }
    return t;
  }).filter((t) => t.url);
  // Client-side filter: skip tasks with a GOOD existing draft.
  // Schema tasks with placeholder text (no <script) need re-drafting.
  const tasks = allTasks.filter((t) => {
    const fix = (t.proposedFix || '').trim();
    if (!fix) return true; // empty = needs draft
    const isSchema = t.title.toLowerCase().startsWith('no schema.org');
    if (isSchema && !fix.startsWith('<script')) return true; // bad schema draft
    return false; // good draft exists, skip
  });
  console.log(`  ${allTasks.length} fetched, ${tasks.length} need drafting (${allTasks.length - tasks.length} already have good drafts).\n`);

  // Group by URL so we fetch each page only once
  const byUrl = new Map();
  for (const t of tasks) {
    if (!byUrl.has(t.url)) byUrl.set(t.url, []);
    byUrl.get(t.url).push(t);
  }
  console.log(`  ${byUrl.size} unique URL(s) to fetch.\n`);

  let stats = { rejected: 0, drafted: 0, skipped: 0, errored: 0 };

  for (const [url, group] of byUrl) {
    console.log(`▸ ${url}  (${group.length} task${group.length > 1 ? 's' : ''})`);
    const sig = await fetchPageSignals(url);

    for (const task of group) {
      try {
        // Skip validation for tasks the human has already approved — trust
        // their judgment, just draft. Auto-rejecting an approved task would
        // override the human decision.
        if (task.status !== 'Approved') {
          const v = validate(task, sig);
          if (!v.real) {
            console.log(`    ✗ reject ${task.taskId}: ${v.reason.slice(0, 100)}`);
            await reject(task, v.reason);
            stats.rejected++;
            await sleep(350);
            continue;
          }
        }

        const draft = await draftFix(task, sig);
        if (!draft) {
          console.log(`    ⌀ skip   ${task.taskId}: no drafter for "${task.title.slice(0, 50)}"`);
          stats.skipped++;
          continue;
        }

        await writeDraft(task, draft);
        stats.drafted++;
        console.log(`    ✓ draft  ${task.taskId}: ${draft.fix.slice(0, 70)}…`);
        await sleep(350); // Notion rate limit pacing
      } catch (err) {
        stats.errored++;
        console.warn(`    ⚠ error  ${task.taskId}: ${err.message}`);
        await sleep(500);
      }
    }
  }

  console.log(`\nDone. rejected=${stats.rejected}  drafted=${stats.drafted}  skipped=${stats.skipped}  errored=${stats.errored}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
