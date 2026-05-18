#!/usr/bin/env node
// Syncs every Notion row with Hub Status = Live into its matching
// properties/<slug>.html file by patching elements tagged with
// data-notion="<key>", data-notion-bg="<key>", data-notion-list="<key>",
// data-notion-json="<key>", or data-notion-roi.

import { Client } from '@notionhq/client';
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';

if (!TOKEN) {
  console.error('NOTION_TOKEN env var is required');
  process.exit(1);
}

const notion = new Client({ auth: TOKEN });

// ─── Notion → JS extraction ─────────────────────────────────────────────────

function richText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  return '';
}

function readNumber(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null;
}

function readSelect(prop) {
  return prop && prop.select ? prop.select.name : null;
}

function readMultiSelect(prop) {
  return prop && Array.isArray(prop.multi_select) ? prop.multi_select.map(s => s.name) : [];
}

function readUrl(prop) {
  if (!prop) return null;
  if (prop.url) return prop.url;
  // Fall back to rich_text content (handles Text-type fields used as URLs)
  if (prop.rich_text && prop.rich_text.length) return prop.rich_text.map(t => t.plain_text).join('').trim() || null;
  if (prop.title && prop.title.length) return prop.title.map(t => t.plain_text).join('').trim() || null;
  return null;
}

function readJsonField(prop) {
  const txt = richText(prop).trim();
  if (!txt) return [];
  try {
    return JSON.parse(txt);
  } catch (err) {
    console.warn(`  ⚠ Failed to parse JSON field: ${err.message}`);
    return [];
  }
}

function extractProperty(page) {
  const p = page.properties;
  const propertyIdNum = readNumber(p['Property ID']);
  return {
    slug: richText(p['🔗 Slug']),
    propertyId: propertyIdNum != null ? `NAC-${propertyIdNum}` : null,
    propertyNameEn: richText(p['Property Name']),
    propertyNameVi: richText(p['Name VI']),
    taglineEn: richText(p['🏷️ Tagline EN']),
    taglineVi: richText(p['🏷️ Tagline VI']),
    country: readSelect(p['Country']),
    regionCity: richText(p['Region/City']),
    district: richText(p['📍 District']),
    hubType: readSelect(p['🏨 Hub Type']),
    purchasePrice: readNumber(p['Purchase Price']),
    yieldPct: pct(readNumber(p['Yield %'])),
    irrPct: pct(readNumber(p['IRR %'])),
    cocPct: pct(readNumber(p['Cash-on-Cash %'])),
    payback: readNumber(p['Payback Years']),
    monthlyRent: readNumber(p['Monthly Rental Income']),
    nacScore: readNumber(p['⭐ NAC Score']),
    descEn: richText(p['📝 Desc EN']),
    descVi: richText(p['📝 Desc VI']),
    marketEn: richText(p['🌍 Market EN']),
    marketVi: richText(p['🌍 Market VI']),
    nacNoteEn: richText(p['💬 NAC Note EN']),
    nacNoteVi: richText(p['💬 NAC Note VI']),
    heroImg: readUrl(p['Image URL']),
    heroImgMobile: readUrl(p['Mobile Image URL']),
    galleryImg1: readUrl(p['🖼️ Image 1']),
    galleryImg2: readUrl(p['🖼️ Image 2']),
    galleryImg3: readUrl(p['🖼️ Image 3']),
    galleryImg4: readUrl(p['🖼️ Image 4']),
    features: readJsonField(p['✨ Features JSON']),
    pros: readJsonField(p['✅ Pros JSON']),
    cons: readJsonField(p['⚠️ Cons JSON']),
    process: readJsonField(p['🔄 Process JSON']),
    subScores: readJsonField(p['📊 Sub-Scores JSON']),
    tags: readMultiSelect(p['Tags']),
    hubStatus: readSelect(p['Hub Status']),
  };
}

const pct = (n) => (n == null ? null : n * 100);

const COUNTRY_FLAGS = {
  'Vietnam': '🇻🇳', 'Panama': '🇵🇦', 'Japan': '🇯🇵',
  'Thailand': '🇹🇭', 'Indonesia': '🇮🇩', 'Philippines': '🇵🇭',
  'Malaysia': '🇲🇾', 'Singapore': '🇸🇬', 'Cambodia': '🇰🇭',
  'Spain': '🇪🇸', 'Portugal': '🇵🇹', 'UAE': '🇦🇪',
  'Mexico': '🇲🇽', 'Colombia': '🇨🇴', 'Costa Rica': '🇨🇷',
  'Turkey': '🇹🇷', 'Cyprus': '🇨🇾', 'United Kingdom': '🇬🇧',
};
const countryFlag = (c) => (c && COUNTRY_FLAGS[c]) || null;

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtMoneyShort(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + Math.round(n);
}

function fmtMoneyFull(n) {
  if (n == null) return '';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmt1(n) {
  if (n == null) return '';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? r.toFixed(1) : r.toString();
}

function fmt0(n) {
  return n == null ? '' : Math.round(n).toString();
}

// ─── Grade derivation (donut sub-scores) ────────────────────────────────────

function gradeEn(val) {
  if (val >= 9) return 'Excellent';
  if (val >= 7.5) return 'Good';
  if (val >= 6) return 'Fair';
  return 'Weak';
}
function gradeVi(val) {
  if (val >= 9) return 'Xuất Sắc';
  if (val >= 7.5) return 'Tốt';
  if (val >= 6) return 'Khá';
  return 'Yếu';
}

function enrichSubScores(scores) {
  return scores.map((s, i) => ({
    label_vi: s.label_vi,
    label_en: s.label_en,
    val: s.val,
    val_pct: Math.round(s.val * 10),
    delay: i * 80,
    grade_vi: gradeVi(s.val),
    grade_en: gradeEn(s.val),
  }));
}

// ─── HTML rendering ─────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function renderFeatures(features) {
  return features.map(f =>
    `<div class="nac-feat"><span class="nac-feat-icon">${esc(f.icon)}</span><span class="nac-feat-txt"><span data-vi>${esc(f.vi)}</span><span data-en>${esc(f.en)}</span></span></div>`
  ).join('');
}

function renderPcItems(items, sign) {
  return items.map(it =>
    `<div class="nac-pc-item"><span class="nac-pc-dot">${sign}</span> <span><span data-vi>${esc(it.vi)}</span><span data-en>${esc(it.en)}</span></span></div>`
  ).join('');
}

function renderProcess(steps) {
  return steps.map((s, i) => {
    const isLast = i === steps.length - 1;
    return `
          <div class="nac-proc-step">
            <div class="nac-proc-col"><div class="nac-proc-dot">${esc(s.n)}</div>${isLast ? '' : '<div class="nac-proc-line"></div>'}</div>
            <div class="nac-proc-body">
              <div class="nac-proc-dur"><span data-vi>${esc(s.dur_vi)}</span><span data-en>${esc(s.dur_en)}</span></div>
              <div class="nac-proc-title"><span data-vi>${esc(s.title_vi)}</span><span data-en>${esc(s.title_en)}</span></div>
              <div class="nac-proc-txt"><span data-vi>${esc(s.body_vi)}</span><span data-en>${esc(s.body_en)}</span></div>
            </div>
          </div>`;
  }).join('\n          ');
}

function renderDonutRows(scores) {
  return scores.map(s => `
            <div class="nac-donut-row">
              <span class="nac-donut-row-lbl"><span data-vi>${esc(s.label_vi)}</span><span data-en>${esc(s.label_en)}</span></span>
              <div class="nac-donut-row-bar"><div class="nac-donut-row-fill" data-fill="${Math.round(s.val * 10)}"></div></div>
              <span class="nac-donut-row-val">${s.val}</span>
            </div>`).join('\n            ');
}

// ─── Patch one HTML file with one Notion row ────────────────────────────────

function setSmartText($el, value) {
  // Replace the first child text node if any exists; otherwise just set text.
  // Preserves any child elements (e.g., a sibling .nac-stat-unit span).
  const node = $el.get(0);
  if (!node) return;
  const firstChild = node.children && node.children[0];
  if (firstChild && firstChild.type === 'text') {
    firstChild.data = value;
  } else if (node.children && node.children.length === 0) {
    $el.text(value);
  } else {
    $el.prepend(value);
  }
}

function patch(html, prop) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Simple text fields — find every element with data-notion="key", set first
  // text node (preserves child elements like unit spans). Also updates
  // data-count-to when present.
  const textMap = {
    property_id: prop.propertyId,
    flag: countryFlag(prop.country),
    property_name_en: prop.propertyNameEn,
    property_name_vi: prop.propertyNameVi,
    tagline_en: prop.taglineEn,
    tagline_vi: prop.taglineVi,
    country: prop.country,
    district: prop.district,
    region_city: prop.regionCity,
    hub_type: prop.hubType,
    desc_en: prop.descEn,
    desc_vi: prop.descVi,
    market_en: prop.marketEn,
    market_vi: prop.marketVi,
    nac_note_en: prop.nacNoteEn,
    nac_note_vi: prop.nacNoteVi,
    nac_score: fmt0(prop.nacScore),
    price_short: fmtMoneyShort(prop.purchasePrice),
    price_full: fmtMoneyFull(prop.purchasePrice),
    yield_pct: fmt1(prop.yieldPct),
    irr_pct: fmt1(prop.irrPct),
    coc_pct: fmt1(prop.cocPct),
    payback: fmt1(prop.payback),
    monthly_rent: fmtMoneyFull(prop.monthlyRent),
    yield_pct_unit: prop.yieldPct != null ? fmt1(prop.yieldPct) + '%' : null,
    irr_pct_unit: prop.irrPct != null ? fmt1(prop.irrPct) + '%' : null,
    coc_pct_unit: prop.cocPct != null ? fmt1(prop.cocPct) + '%' : null,
  };
  for (const [key, value] of Object.entries(textMap)) {
    if (value == null || value === '') continue;
    $(`[data-notion="${key}"]`).each((_, el) => {
      const $el = $(el);
      setSmartText($el, value);
      if ($el.attr('data-count-to') !== undefined) {
        $el.attr('data-count-to', value);
      }
    });
  }

  // Donut score: keep initial text "0" (count-up animates 0 → target) but
  // update the data-count-to target.
  if (prop.nacScore != null) {
    $('.nac-donut-score').attr('data-count-to', String(Math.round(prop.nacScore)));
  }

  // Background images
  if (prop.heroImg) {
    const heroStyle = `background-image:url('${prop.heroImg}')`
      + (prop.heroImgMobile ? `;--bg-mobile:url('${prop.heroImgMobile}')` : '');
    $(`[data-notion-bg="hero_img"]`).attr('style', heroStyle);

    // Head SEO image URLs — og:image, twitter:image, schema.org JSON-LD `image`.
    // Selector-based (no markup change needed). When sync-images writes a new CF
    // URL to Notion, the next cron tick propagates it everywhere automatically.
    $('meta[property="og:image"]').attr('content', prop.heroImg);
    $('meta[name="twitter:image"]').attr('content', prop.heroImg);
    $('script[type="application/ld+json"]').each((_, el) => {
      const $el = $(el);
      const txt = $el.text().trim();
      if (!txt) return;
      let json;
      try { json = JSON.parse(txt); } catch { return; }
      // Only update if the schema has a top-level `image` field
      // (RealEstateListing). Skip FAQPage / BreadcrumbList, which don't.
      if (typeof json.image === 'string') {
        json.image = prop.heroImg;
        $el.text('\n  ' + JSON.stringify(json, null, 2).split('\n').join('\n  ') + '\n  ');
      }
    });
  }
  const galleryImgs = [prop.galleryImg1, prop.galleryImg2, prop.galleryImg3, prop.galleryImg4];
  galleryImgs.forEach((url, i) => {
    if (!url) return;
    $(`[data-notion-bg="gallery_${i + 1}"]`).attr('style', `background-image:url('${url}')`);
  });

  // JSON-driven list containers
  if (prop.features.length) {
    $(`[data-notion-list="features"]`).html(renderFeatures(prop.features));
  }
  if (prop.pros.length) {
    $(`[data-notion-list="pros"]`).html(renderPcItems(prop.pros, '+'));
  }
  if (prop.cons.length) {
    $(`[data-notion-list="cons"]`).html(renderPcItems(prop.cons, '−'));
  }
  if (prop.process.length) {
    $(`[data-notion-list="process"]`).html(renderProcess(prop.process));
  }
  if (prop.subScores.length) {
    const enriched = enrichSubScores(prop.subScores);
    $(`script[data-notion-json="sub_scores"]`).text(JSON.stringify(enriched));
    $(`[data-notion-list="donut_rows"]`).html(renderDonutRows(prop.subScores));
  }

  // ROI sim data attributes (on the section root)
  const roi = $('[data-notion-roi]');
  if (roi.length) {
    if (prop.purchasePrice != null) roi.attr('data-price', String(Math.round(prop.purchasePrice)));
    if (prop.yieldPct != null) roi.attr('data-yield', fmt1(prop.yieldPct));
    if (prop.irrPct != null) roi.attr('data-irr', fmt1(prop.irrPct));
    if (prop.monthlyRent != null) roi.attr('data-rent', String(Math.round(prop.monthlyRent)));
  }

  return $.html();
}

// ─── Fetch all Live properties ──────────────────────────────────────────────

async function fetchLiveProperties() {
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(extractProperty).filter(p => p.slug);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching Live properties from Notion …');
  const properties = await fetchLiveProperties();
  console.log(`  ${properties.length} Live properties found`);

  let changed = 0;
  let failed = 0;
  for (const prop of properties) {
    try {
      const file = path.join(PROPERTIES_DIR, `${prop.slug}.html`);
      let existing;
      try {
        existing = await fs.readFile(file, 'utf-8');
      } catch {
        console.log(`  ⤳ ${prop.slug}: no HTML yet (skipped — create from template later)`);
        continue;
      }
      const patched = patch(existing, prop);
      if (patched === existing) {
        console.log(`  ✓ ${prop.slug}: no change`);
        continue;
      }
      await fs.writeFile(file, patched, 'utf-8');
      console.log(`  ✱ ${prop.slug}: updated`);
      changed++;
    } catch (err) {
      // Per-property try/catch — one bad row (malformed JSON, cheerio error,
      // unexpected schema) won't kill the whole batch. The cron resumes next
      // tick after the bad data is fixed.
      console.error(`  ✗ ${prop.slug || '(missing slug)'}: ${err.message}`);
      failed++;
    }
  }
  console.log(`Done. ${changed} file(s) changed, ${failed} failed.`);
  // Exit non-zero ONLY if every property failed (config/network issue);
  // partial failures don't block the rest of the pipeline.
  if (failed > 0 && changed === 0 && properties.length > 0) {
    console.error('All properties failed — exiting non-zero so the workflow surfaces the issue.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
