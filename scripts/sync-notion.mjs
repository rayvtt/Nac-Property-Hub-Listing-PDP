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
    currency: readSelect(p['Currency']),
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
    statementEn: richText(p['📜 Statement EN']),
    statementVi: richText(p['📜 Statement VI']),
    brand: richText(p['✦ Brand']),
    brandIntroEn: richText(p['✦ Brand Intro EN']),
    brandIntroVi: richText(p['✦ Brand Intro VI']),
    beachEn: richText(p['🏖️ Beach EN']),
    beachVi: richText(p['🏖️ Beach VI']),
    airportEn: richText(p['✈️ Airport EN']),
    airportVi: richText(p['✈️ Airport VI']),
    keyMarketsEn: richText(p['🌏 Key Markets EN']),
    keyMarketsVi: richText(p['🌏 Key Markets VI']),
    propertyYoyEn: richText(p['📈 Property YoY EN']),
    propertyYoyVi: richText(p['📈 Property YoY VI']),
    cine1Vi: richText(p['🎬 Cine 1 VI']),
    cine1En: richText(p['🎬 Cine 1 EN']),
    cine2Vi: richText(p['🎬 Cine 2 VI']),
    cine2En: richText(p['🎬 Cine 2 EN']),
    cine3Vi: richText(p['🎬 Cine 3 VI']),
    cine3En: richText(p['🎬 Cine 3 EN']),
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

// Currency symbol lookup. Falls back to USD '$' if Currency field is empty/unknown.
const CURRENCY_SYMBOLS = {
  USD: '$',  EUR: '€',  GBP: '£',  AED: 'AED ',  CAD: 'C$',  AUD: 'A$',
  JPY: '¥',  CHF: 'CHF ', CNY: '¥', SGD: 'S$',
};
const currencySymbol = (code) => CURRENCY_SYMBOLS[code] || '$';

function fmtMoneyShort(n, currency) {
  if (n == null) return '';
  const sym = currencySymbol(currency);
  if (n >= 1_000_000) return sym + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return sym + Math.round(n / 1_000) + 'K';
  return sym + Math.round(n);
}

function fmtMoneyFull(n, currency) {
  if (n == null) return '';
  return currencySymbol(currency) + Math.round(n).toLocaleString('en-US');
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

// ─── Head SEO patcher ───────────────────────────────────────────────────────
// Rebuilds <title>, meta tags, canonical, and JSON-LD strings from Notion
// data. The template uses `{Placeholder}` literals; this overwrites them.

const COUNTRY_SLUG_OVERRIDES = {
  'Việt Nam': 'vietnam',
  'United States': 'usa',
  'USA': 'usa',
  'United Kingdom': 'uk',
  'Dubai': 'uae',
};
function countrySlugFromName(c) {
  if (!c) return '';
  if (COUNTRY_SLUG_OVERRIDES[c]) return COUNTRY_SLUG_OVERRIDES[c];
  return c.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function firstSentence(text, maxLen = 155) {
  if (!text) return '';
  const m = text.match(/^[^.!?]+[.!?]/);
  let s = m ? m[0] : text;
  if (s.length > maxLen) s = s.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
  return s.trim();
}

function patchHeadSeo($, prop) {
  const nameEn = prop.propertyNameEn || '';
  const nameVi = prop.propertyNameVi || '';
  if (!nameEn && !nameVi) return; // can't build anything useful

  const idNum = prop.propertyId?.replace(/^NAC-/, '') || '';
  const location = [prop.district, prop.regionCity, prop.country].filter(Boolean).join(', ');
  const cSlug = countrySlugFromName(prop.country);
  const canonical = `https://nomadassetcollective.com/property-hub-bat-dong-san/${cSlug}/${prop.slug}/`;

  const price = fmtMoneyShort(prop.purchasePrice, prop.currency);
  const yieldStr = prop.yieldPct != null ? `${fmt1(prop.yieldPct)}%` : '';

  // Build the canonical title: "Name — Tagline · Location · NAC-ID"
  const titleParts = [nameEn];
  if (prop.taglineEn) titleParts.push(prop.taglineEn);
  else if (location) titleParts.push(location);
  if (idNum) titleParts.push(`NAC-${idNum}`);
  const title = titleParts.join(' · ');

  // Description: 1-sentence factual summary. Prefer Notion desc_en, fall back
  // to a built string from price/yield/location.
  const description = firstSentence(prop.descEn)
    || [nameEn, location && `in ${location}`, price && `from ${price}`, yieldStr && `· ${yieldStr} yield`].filter(Boolean).join(' ');

  const ogDescription = firstSentence(prop.descEn, 200) || description;
  const twitterDescription = firstSentence(prop.descEn, 120) || description.slice(0, 120);

  const keywords = [
    nameEn,
    prop.brand,
    prop.regionCity,
    prop.country && `branded residences ${prop.country}`,
    'NAC Property Hub',
    prop.tags?.join(', '),
  ].filter(Boolean).join(', ');

  // Apply via cheerio
  $('title').text(title);
  $('meta[name="description"]').attr('content', description);
  $('meta[name="keywords"]').attr('content', keywords);
  $('link[rel="canonical"]').attr('href', canonical);
  $('meta[property="og:title"]').attr('content', `${nameEn} — ${prop.taglineEn || location}`.replace(/ — $/, ''));
  $('meta[property="og:description"]').attr('content', ogDescription);
  $('meta[property="og:url"]').attr('content', canonical);
  $('meta[name="twitter:title"]').attr('content', [nameEn, price && `${price} entry`, yieldStr && `${yieldStr} yield`].filter(Boolean).join(' · '));
  $('meta[name="twitter:description"]').attr('content', twitterDescription);

  // JSON-LD: top-level RealEstateListing has name / alternateName / description /
  // url / address. Skip FAQPage and BreadcrumbList which the existing image
  // patch already handles for the `image` field.
  $('script[type="application/ld+json"]').each((_, el) => {
    const $el = $(el);
    const raw = $el.text().trim();
    if (!raw) return;
    let json;
    try { json = JSON.parse(raw); } catch { return; }
    let changed = false;
    if (json['@type'] === 'RealEstateListing' || json.name?.includes('{Property Name')) {
      if (json.name) { json.name = nameEn; changed = true; }
      if (json.alternateName) { json.alternateName = nameVi || nameEn; changed = true; }
      if (json.description) { json.description = description; changed = true; }
      if (json.url) { json.url = canonical; changed = true; }
      if (json.address) {
        if (json.address.streetAddress) json.address.streetAddress = prop.district || prop.regionCity || '';
        if (json.address.addressLocality) json.address.addressLocality = prop.regionCity || '';
        if (json.address.addressCountry) json.address.addressCountry = prop.country || '';
        changed = true;
      }
    }
    if (changed) $el.text('\n  ' + JSON.stringify(json, null, 2).split('\n').join('\n  ') + '\n  ');
  });
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
    brand: prop.brand,
    brand_intro_en: prop.brandIntroEn,
    brand_intro_vi: prop.brandIntroVi,
    beach_en: prop.beachEn,
    beach_vi: prop.beachVi,
    airport_en: prop.airportEn,
    airport_vi: prop.airportVi,
    key_markets_en: prop.keyMarketsEn,
    key_markets_vi: prop.keyMarketsVi,
    property_yoy_en: prop.propertyYoyEn,
    property_yoy_vi: prop.propertyYoyVi,
    nac_score: fmt0(prop.nacScore),
    currency: prop.currency,
    price_short: fmtMoneyShort(prop.purchasePrice, prop.currency),
    price_full: fmtMoneyFull(prop.purchasePrice, prop.currency),
    yield_pct: fmt1(prop.yieldPct),
    irr_pct: fmt1(prop.irrPct),
    coc_pct: fmt1(prop.cocPct),
    payback: fmt1(prop.payback),
    monthly_rent: fmtMoneyFull(prop.monthlyRent, prop.currency),
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

  // Statement quote (Định Vị NAC / NAC Positioning) — patches the data-stmt
  // attribute on the `<p>` elements. JS parser reads data-stmt at runtime and
  // splits into word spans; «guillemet» words render gold/italic.
  if (prop.statementVi) {
    $('#nac-stmt-vi').attr('data-stmt', prop.statementVi);
  }
  if (prop.statementEn) {
    $('#nac-stmt-en').attr('data-stmt', prop.statementEn);
  }

  // Cine section titles — Notion takes priority. Any span left blank is
  // filled by scripts/generate-cine-titles.mjs (Claude Haiku 4.5 multimodal)
  // later in the same workflow.
  const cines = [
    { id: '#nac-img-1', vi: prop.cine1Vi, en: prop.cine1En },
    { id: '#nac-img-2', vi: prop.cine2Vi, en: prop.cine2En },
    { id: '#nac-img-3', vi: prop.cine3Vi, en: prop.cine3En },
  ];
  for (const c of cines) {
    if (c.vi) $(`${c.id} .nac-cine-h [data-vi]`).text(c.vi);
    if (c.en) $(`${c.id} .nac-cine-h [data-en]`).text(c.en);
  }

  // ─── Head SEO (title, meta, JSON-LD) ────────────────────────────────────
  // The PDP template ships with `{Property Name}` etc. literal placeholders
  // in <head>. They were meant to be hand-filled per listing but auto-scaffolds
  // inherit them, producing browser tabs like "{Property Name} — {Key Differe…".
  // We rebuild these strings from Notion fields at sync time.
  patchHeadSeo($, prop);

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
