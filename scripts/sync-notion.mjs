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
import {
  completeStructuredData, resolveGeo, buildLlmsTxt, loadCache, saveCache,
} from './seo-geo-llm.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');
const GEOCACHE_FILE = path.join(__dirname, 'geocode-cache.json');

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
    priceBands: readJsonField(p['💲 Price Bands JSON']),
    marketStats: readJsonField(p['📊 Market Stats JSON']),
    handoverEn: richText(p['🔑 Handover EN']),
    handoverVi: richText(p['🔑 Handover VI']),
    tags: readMultiSelect(p['Tags']),
    hubStatus: readSelect(p['Hub Status']),
    // ─ fields consumed by the SEO/GEO/LLM structured-data completer ─
    freehold: p['Freehold']?.checkbox === true,
    immigrationType: readSelect(p['🛂 Immigration Type']),
    investmentProgram: readSelect(p['Investment Program']),
    listingDate: p['Listing Date']?.date?.start || null,
    // prop.geo is resolved in main() (async geocode) and read by the completer
    geo: null,
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
  JPY: '¥',  CHF: 'CHF ', CNY: '¥', SGD: 'S$', MYR: 'RM ', THB: '฿',
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

function fmtUsd(n) { return '$' + Math.round(Number(n)).toLocaleString('en-US'); }
// Residence Mix & Indicative Pricing — one card per unit-type band.
// Band shape: { en, vi, from (USD number), units (int) }. Shows the entry
// ("from") price; "from" is net of the 3-yr/4% sublease per the source sheet.
function renderPriceBands(bands, currency) {
  // Order bands smallest → largest: studio · 1BR · 2BR · 3BR · 4BR · penthouse.
  const rank = (b) => {
    const s = (b.en || '').toLowerCase();
    if (s.includes('studio')) return 0;
    if (s.includes('penthouse') || s.includes('duplex')) return 90;
    const m = s.match(/(\d+)\s*bed/) || s.match(/\b(\d)\s*\+\s*1\b/);
    return m ? parseInt(m[1], 10) : 50;
  };
  return [...bands].sort((a, b) => rank(a) - rank(b)).map(b => `
            <tr>
              <td class="nac-band-type"><span data-vi>${esc(b.vi)}</span><span data-en>${esc(b.en)}</span></td>
              <td class="nac-band-price"><span class="nac-band-lead"><span data-vi>từ</span><span data-en>from</span></span>${fmtMoneyFull(b.from, currency)}</td>
            </tr>`).join('\n          ');
}

// Market-context stat cards (§04 Market). Per-listing/per-city via Notion
// `📊 Market Stats JSON` — array of { val, vi, en }. When the field is empty the
// listing keeps the template's hardcoded default cards (no regression).
function renderMarketStats(stats) {
  return stats.map(s => `<div class="nac-mkt-card"><div class="nac-mkt-val">${esc(s.val)}</div><div class="nac-mkt-key"><span data-vi="">${esc(s.vi)}</span><span data-en="">${esc(s.en)}</span></div></div>`).join('');
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
    handover_en: prop.handoverEn,
    handover_vi: prop.handoverVi,
    // §01 overview facts: ownership (from Freehold checkbox) + residency
    // (from Investment Program, else Immigration Type). Location reuses
    // region_city and completion reuses handover_vi/en above.
    ownership_vi: prop.freehold ? 'Sở hữu vĩnh viễn' : 'Sở hữu có thời hạn',
    ownership_en: prop.freehold ? 'Freehold' : 'Leasehold',
    residency: (prop.investmentProgram && prop.investmentProgram !== 'None')
      ? prop.investmentProgram
      : ((prop.immigrationType && prop.immigrationType !== 'None') ? prop.immigrationType : '—'),
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

  // Google Maps embed — template ships with empty src=""; we build a query
  // from "Property Name, District, City" and inject the Google Maps iframe URL.
  if (prop.propertyNameEn) {
    const locality = [prop.district, prop.regionCity, prop.country].filter(Boolean).join(', ');
    const query = encodeURIComponent(`${prop.propertyNameEn}${locality ? ', ' + locality : ''}`);
    const mapUrl = `https://maps.google.com/maps?q=${query}&output=embed&z=15`;
    $('iframe.nac-map').attr('src', mapUrl);
    $('iframe.nac-map').attr('title', `${prop.propertyNameEn} — Location`);
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
  // Residence Mix & Indicative Pricing — only revealed when the listing has
  // band data (TR inventory). Stays hidden on every other listing.
  if (prop.priceBands && prop.priceBands.length) {
    $(`[data-notion-list="price_bands"]`).html(renderPriceBands(prop.priceBands, prop.currency));
    $(`[data-notion-when="price_bands"]`).removeAttr('hidden');
  }
  // Per-city market-context stat cards. Only replaces the default cards when the
  // listing supplies `📊 Market Stats JSON`; otherwise the template default stands.
  if (prop.marketStats && prop.marketStats.length) {
    $('.nac-mkt').first().html(renderMarketStats(prop.marketStats));
  }

  // ROI sim data attributes (on the section root)
  const roi = $('[data-notion-roi]');
  if (roi.length) {
    if (prop.purchasePrice != null) roi.attr('data-price', String(Math.round(prop.purchasePrice)));
    if (prop.yieldPct != null) roi.attr('data-yield', fmt1(prop.yieldPct));
    if (prop.irrPct != null) roi.attr('data-irr', fmt1(prop.irrPct));
    if (prop.monthlyRent != null) roi.attr('data-rent', String(Math.round(prop.monthlyRent)));
  }

  // ─── SEO / GEO / LLM structured data ────────────────────────────────────
  // Completes the half of the <head> JSON-LD that patchHeadSeo leaves as
  // `{token}` placeholders: RealEstateListing geo/offers/brand/amenities,
  // the whole FAQPage, and BreadcrumbList. Idempotent — see seo-geo-llm.mjs.
  completeStructuredData($, prop);

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

  // Geocode cache (City+District+Country → lat/lng). Loaded once, persisted at
  // the end so the next run is a pure cache hit (no Nominatim calls).
  const geocache = await loadCache(GEOCACHE_FILE);
  const geocacheSizeBefore = Object.keys(geocache).length;

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
      // Resolve geo coordinates (cached; geocodes only on first sight). Failure
      // → null, and the completer omits the geo block rather than ship `{lat}`.
      try {
        prop.geo = await resolveGeo(prop, { cache: geocache });
      } catch (e) {
        console.warn(`  ⚠ ${prop.slug}: geocode failed (${e.message}) — geo omitted`);
        prop.geo = null;
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
  // Persist the geocode cache if it grew (new coordinates resolved).
  if (Object.keys(geocache).length !== geocacheSizeBefore) {
    try { await saveCache(GEOCACHE_FILE, geocache); console.log('  ↳ geocode cache updated'); }
    catch (e) { console.warn(`  ⚠ could not save geocode cache: ${e.message}`); }
  }

  // Regenerate the root llms.txt LLM/GEO discovery index from all Live rows.
  try {
    const llms = buildLlmsTxt(properties);
    const llmsFile = path.join(ROOT, 'llms.txt');
    let prevLlms = '';
    try { prevLlms = await fs.readFile(llmsFile, 'utf-8'); } catch {}
    if (llms !== prevLlms) {
      await fs.writeFile(llmsFile, llms, 'utf-8');
      console.log('  ↳ llms.txt regenerated');
    }
  } catch (e) {
    console.warn(`  ⚠ could not write llms.txt: ${e.message}`);
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
