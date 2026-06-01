#!/usr/bin/env node
// Builds / refreshes country listing pages (CLPs) from Notion.
//
// Two Notion sources are joined:
//   1. 🌍 NAC - Country Listings (Country DB) — one row per country.
//      • Properties: Country Name VI/EN, Slug, Country Code, Hub Status,
//        🔗 Country URL, 📊 Plaque YoY, 📈 Listings Count, 📤 Last Synced.
//      • Page body  : structured ## sections (editorial copy + SVG path +
//        per-city pin data). Parsed by parseBody().
//   2. 🏠 NAC - Property Listings (LLP DB) — the listing cards. Filtered by
//      Country = <Country Name EN> and Hub Status = Live.
//
// For each Live country row the script:
//   • scaffolds country/<slug>.html from _template-clp.html if missing
//   • patches editorial scalar slots (hero tagline, intro quote, atlas
//     title/lead, collection title/lead, aspiration, country name, hero
//     chips, SVG silhouette) by cheerio-selecting the stable CLP classes
//   • rebuilds every listing-driven region from the LLP rows: hero
//     carousel slides, plaque snapshot, atlas pins + pin-list + per-city
//     counts, collection filter pills + meta, collection cards, and the
//     compare table — wiring data-url straight from each row's Listing URL
//   • stamps 📤 Last Synced + 📈 Listings Count back to the Country DB
//
// OFFLINE TEST MODE
//   node sync-notion-clp.mjs --fixture <model.json> [--slug vn] [--out path]
//   Skips Notion entirely; loads a pre-built model (same shape buildModel
//   produces from Notion) and renders against country/<slug>.html. Used to
//   validate the renderer against real data before it touches live.

import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COUNTRY_DIR = path.join(ROOT, 'country');
const TEMPLATE = path.join(COUNTRY_DIR, '_template-clp.html');

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const FIXTURE = getArg('--fixture');
const ONLY_SLUG = getArg('--slug') || process.env.ONLY_SLUG || null;
const OUT = getArg('--out');

const COUNTRY_DB_ID = process.env.NOTION_COUNTRY_DATABASE_ID || 'a01ef35ce9fd45b1bba3ec4de4da678c';
const LLP_DB_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';

// ─── small utils ──────────────────────────────────────────────────────────

const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// escape a value destined for a double-quoted HTML attribute
const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
// escape text node content (keep intentional <em>/<strong> — callers pass those raw)
const escText = (s) => String(s ?? '').replace(/&(?![a-z#]+;)/gi, '&amp;');

const stripNum = (n) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

// Purchase price (full USD) → { num, unit } for "$360K" / "$1.8M"
function priceParts(usd) {
  if (usd == null) return { num: '—', unit: '' };
  const k = Math.round(usd / 1000);
  if (k >= 1000) return { num: stripNum(k / 1000), unit: 'M' };
  return { num: String(k), unit: 'K' };
}
const priceString = (usd) => {
  const { num, unit } = priceParts(usd);
  return `$${num}${unit}`;
};
const pct1 = (decimal) => (decimal == null ? null : (decimal * 100).toFixed(1));

// donut: r=42 → circumference 2π·42 ≈ 263.9; offset = C·(1 − score/100)
const DONUT_C = +(2 * Math.PI * 42).toFixed(1); // 263.9
const donutOffset = (score) => +(DONUT_C * (1 - (score || 0) / 100)).toFixed(1);

const shortBrand = (brand) => String(brand || '').split('(')[0].trim();

// first meaningful tag → chip copy
const TAG_CHIP = {
  'hot': { emoji: '🔥', vi: 'Nổi bật', en: 'Hot' },
  'must know': { emoji: '⚡', vi: 'Phải biết', en: 'Must know' },
  'residency': { emoji: '🛂', vi: 'Định cư', en: 'Residency' },
};
function tagChip(tags) {
  for (const t of tags || []) {
    const k = norm(t);
    if (TAG_CHIP[k]) return TAG_CHIP[k];
  }
  return { emoji: '⚡', vi: 'Phải biết', en: 'Must know' };
}

// assign a listing to one of the country's cities via match aliases
function assignCity(listing, cities) {
  const hay = norm(`${listing.regionCity || ''} ${listing.district || ''}`);
  for (const c of cities) {
    const aliases = (c.match && c.match.length) ? c.match : [c.name];
    for (const a of aliases) {
      const na = norm(a);
      if (na && hay.includes(na)) return c;
    }
  }
  return null;
}

// ─── bilingual span helpers (match the CLP markup) ─────────────────────────

// <span data-vi="…">…</span><span data-en="…">…</span>  (content may carry <em>/<strong>)
function biSpans(vi, en) {
  return `<span data-vi="${escAttr(vi)}">${vi}</span><span data-en="${escAttr(en)}">${en}</span>`;
}

// set a bilingual scalar slot by selector; no-op if the body field is empty
function setBi($, sel, pair) {
  if (!pair || (!pair.vi && !pair.en)) return;
  const el = $(sel);
  if (!el.length) return;
  el.html(biSpans(pair.vi ?? '', pair.en ?? ''));
}

// ─── renderers (return HTML strings; match country/vn.html structure) ──────

function renderHeroSlide(l, first) {
  const bg = l.heroImg
    ? `background-image:url('${escAttr(l.heroImg)}')`
    : `background:linear-gradient(135deg,#0f1a36,#1a2a4a)`;
  return `      <div class="cl-hero-slide${first ? ' on' : ''}"
           data-name-vi="${escAttr(l.nameVi)}"
           data-name-en="${escAttr(l.nameEn)}"
           data-price="${escAttr(priceString(l.purchasePrice))}"
           data-url="${escAttr(l.listingUrl)}"
           style="${bg}"></div>`;
}

function renderCard(l) {
  const { num, unit } = priceParts(l.purchasePrice);
  const dp = l.purchasePrice != null ? Math.round(l.purchasePrice / 1000) : '';
  const y = pct1(l.yieldPct);
  const irr = pct1(l.irrPct);
  const coc = pct1(l.cocPct);
  const subs = (l.subScores || []).map(s => ({
    vi: s.label_vi ?? s.vi ?? '', en: s.label_en ?? s.en ?? '', val: s.val,
  }));
  const subsAttr = escAttr(JSON.stringify(subs));
  const off = donutOffset(l.nacScore);
  const chip = tagChip(l.tags);
  const cityName = l.city ? l.city.name : '';

  return `    <article class="cl-card reveal"
             data-city="${escAttr(l.city ? l.city.slug : '')}"
             data-listing="${escAttr(l.slug)}"
             data-img="${escAttr(l.heroImg || '')}"
             data-brand="${escAttr(shortBrand(l.brand))}"
             data-name-vi="${escAttr(l.nameVi)}"
             data-name-en="${escAttr(l.nameEn)}"
             data-tag-vi="${escAttr(l.taglineVi)}"
             data-tag-en="${escAttr(l.taglineEn)}"
             data-price="${dp}"
             data-yield="${y ?? ''}"
             data-irr="${irr ?? ''}"
             data-coc="${coc ?? ''}"
             data-rent="${l.monthlyRent ?? ''}"
             data-score="${l.nacScore ?? ''}"
             data-subs='${subsAttr}'
             data-url="${escAttr(l.listingUrl)}">
      <div class="cl-card-img-wrap">
        <div class="cl-card-img" style="background-image:url('${escAttr(l.heroImg || '')}')"></div>
        <div class="cl-card-img-veil"></div>
        <div class="cl-card-chips">
          <span class="cl-card-chip city">${escText(cityName)}</span>
          <span class="cl-card-chip">${chip.emoji} <span data-vi="${escAttr(chip.vi)}">${chip.vi}</span><span data-en="${escAttr(chip.en)}">${chip.en}</span></span>
          <span class="cl-card-chip live"><span data-vi="Live">Live</span><span data-en="Live">Live</span></span>
        </div>
        <div class="cl-card-brandmark">${escText(shortBrand(l.brand))}</div>
      </div>
      <div class="cl-card-body">
        <div class="cl-card-info">
          <h3 class="cl-card-name">${biSpans(l.nameVi, l.nameEn)}</h3>
          <p class="cl-card-tag">${biSpans(l.taglineVi, l.taglineEn)}</p>
          <div class="cl-card-stats">
            <div class="cl-card-stat">
              <span class="cl-card-stat-num">$${num}<small>${unit}</small></span>
              <span class="cl-card-stat-lbl"><span data-vi="Vào cửa">Vào cửa</span><span data-en="Entry">Entry</span></span>
            </div>
            <div class="cl-card-stat">
              <span class="cl-card-stat-num">${y ?? '—'}<small>%</small></span>
              <span class="cl-card-stat-lbl">Yield</span>
            </div>
            <div class="cl-card-stat">
              <span class="cl-card-stat-num">${irr ?? '—'}<small>%</small></span>
              <span class="cl-card-stat-lbl">IRR</span>
            </div>
          </div>
        </div>
        <div class="cl-mini-donut">
          <svg viewBox="0 0 100 100">
            <circle class="cl-mini-donut-track" cx="50" cy="50" r="42"></circle>
            <circle class="cl-mini-donut-fill" cx="50" cy="50" r="42" stroke-dasharray="${DONUT_C}" stroke-dashoffset="${off}" data-final="${off}"></circle>
          </svg>
          <div class="cl-mini-donut-center">
            <span class="cl-mini-donut-val" data-count-to="${l.nacScore ?? 0}">0</span>
            <span class="cl-mini-donut-lbl">NAC</span>
          </div>
        </div>
      </div>
      <div class="cl-card-footer">
        <span class="cl-card-footer-quick"><span data-vi="Xem nhanh">Xem nhanh</span><span data-en="Quick view">Quick view</span></span>
        <span class="cl-card-footer-arrow"><span data-vi="Mở dự án">Mở dự án</span><span data-en="Open listing">Open listing</span> <span>→</span></span>
      </div>
    </article>`;
}

function renderCompareRow(l) {
  const { num, unit } = priceParts(l.purchasePrice);
  const dp = l.purchasePrice != null ? Math.round(l.purchasePrice / 1000) : '';
  const y = pct1(l.yieldPct);
  const irr = pct1(l.irrPct);
  const cityName = l.city ? l.city.name : '';
  return `          <tr data-listing="${escAttr(l.slug)}" data-city="${escAttr(cityName)}" data-price="${dp}" data-yield="${y ?? ''}" data-irr="${irr ?? ''}" data-score="${l.nacScore ?? ''}">
            <td>
              <span class="cl-tbl-name">${biSpans(l.nameVi, l.nameEn)}</span>
              <span class="cl-tbl-brand">${escText(shortBrand(l.brand))}</span>
            </td>
            <td>${escText(cityName)}</td>
            <td><span class="cl-tbl-val">$${num}<small>${unit}</small></span></td>
            <td><span class="cl-tbl-val">${y ?? '—'}<small>%</small></span></td>
            <td><span class="cl-tbl-val">${irr ?? '—'}<small>%</small></span></td>
            <td><span class="cl-tbl-pill">${l.nacScore ?? '—'} / 100</span></td>
          </tr>`;
}

function renderPin(c, count) {
  const x = c.pinX, y = c.pinY;
  const lblX = x + (c.labelOffsetX ?? 14);
  const word = count === 1 ? 'Listing' : 'Listings';
  return `        <g class="cl-pin-group" onclick="window.clFilterCity &amp;&amp; clFilterCity('${c.slug}')">
          <circle class="cl-pin-halo" cx="${x}" cy="${y}" r="7"></circle>
          <circle class="cl-pin-ring" cx="${x}" cy="${y}" r="6"></circle>
          <circle class="cl-pin-core" cx="${x}" cy="${y}" r="3"></circle>
          <text class="cl-pin-lbl" x="${lblX}" y="${y - 2}" text-anchor="start">${escText(c.name)}</text>
          <text class="cl-pin-cnt" x="${lblX}" y="${y + 10}" text-anchor="start">${count} ${word}</text>
        </g>`;
}

function renderPinlistItem(c, count) {
  const wordVi = 'dự án';
  const wordEn = count === 1 ? 'listing' : 'listings';
  return `        <a href="#collection" data-city-filter="${c.slug}">
          <div>
            <div class="cl-atlas-pinlist-city">${escText(c.name)}</div>
            <div class="cl-atlas-pinlist-meta"><span data-vi="${escAttr(c.regionVi || '')}">${escText(c.regionVi || '')}</span><span data-en="${escAttr(c.regionEn || '')}">${escText(c.regionEn || '')}</span></div>
          </div>
          <span class="cl-atlas-pinlist-count">${count} <span data-vi="${wordVi}">${wordVi}</span><span data-en="${wordEn}">${wordEn}</span></span>
        </a>`;
}

function renderFilterPills(cities, counts, total) {
  const all = `      <button class="cl-pill on" data-filter="all"><span data-vi="Tất cả">Tất cả</span><span data-en="All">All</span><span class="pill-cnt">${total}</span></button>`;
  const rest = cities
    .filter(c => (counts.get(c.slug) || 0) > 0)
    .map(c => `      <button class="cl-pill" data-filter="${c.slug}">${escText(c.name)} <span class="pill-cnt">${counts.get(c.slug)}</span></button>`);
  return [all, ...rest].join('\n');
}

function renderHeroChip(chip) {
  return `        <span class="cl-chip">${biSpans(chip.vi, chip.en)}</span>`;
}

// ─── the patcher: model → patched HTML string ───────────────────────────────

function applyModel(html, model) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const { country, body, listings } = model;

  // order: premium first (purchase price desc), stable by name
  const ordered = [...listings].sort((a, b) =>
    (b.purchasePrice ?? 0) - (a.purchasePrice ?? 0) || a.nameEn.localeCompare(b.nameEn));

  // city assignment + counts (body city order is canonical)
  const cities = body.cities || [];
  const counts = new Map();
  for (const l of ordered) {
    l.city = assignCity(l, cities);
    if (l.city) counts.set(l.city.slug, (counts.get(l.city.slug) || 0) + 1);
  }
  const usedCities = cities.filter(c => (counts.get(c.slug) || 0) > 0);
  const total = ordered.length;
  const cityCount = usedCities.length;

  // ── editorial scalars ─────────────────────────────────────────────
  setBi($, '.cl-name', { vi: country.nameVi, en: country.nameEn });
  // header trail country label (mirrors PDP's NAC-id slot)
  if (country.nameEn) $('.nac-trail-id').text(country.nameEn);
  setBi($, '.cl-hero-tag', body.heroTagline);
  setBi($, '.cl-intro-quote', body.introQuote);
  setBi($, '.cl-atlas-text-title', body.atlasTitle);
  setBi($, '.cl-atlas-text-lead', body.atlasLead);
  setBi($, '.cl-coll-title', body.collectionTitle);
  setBi($, '.cl-coll-lead', body.collectionLead);
  setBi($, '.cl-asp-line', body.aspiration);

  // hero chips
  if (body.heroChips && body.heroChips.length) {
    $('.cl-hero-chips').html(body.heroChips.map(renderHeroChip).join('\n'));
  }

  // SVG silhouette
  if (body.svgPath) $('.cl-map-coast').attr('d', body.svgPath);

  // ── plaque snapshot (derived) ─────────────────────────────────────
  const prices = ordered.map(l => l.purchasePrice).filter(n => n != null);
  const yields = ordered.map(l => l.yieldPct).filter(n => n != null).map(n => n * 100);
  const vals = $('.cl-plaque .cl-plaque-row-val');
  if (vals.length >= 5) {
    $(vals[0]).text(String(total));
    $(vals[1]).text(String(cityCount));
    if (prices.length) {
      const { num, unit } = priceParts(Math.min(...prices));
      $(vals[2]).html(`$${num}<small>${unit}</small>`);
    }
    if (yields.length) {
      const lo = Math.min(...yields).toFixed(1), hi = Math.max(...yields).toFixed(1);
      $(vals[3]).html(`${lo === hi ? lo : `${lo}–${hi}`}<small>%</small>`);
    }
    if (country.plaqueYoy) {
      const yoy = String(country.plaqueYoy).replace(/%\s*$/, '');
      $(vals[4]).html(`${yoy}<small>%</small>`);
    }
  }

  // collection head meta counts
  const metaNums = $('.cl-coll-meta .cl-coll-meta-num');
  if (metaNums.length >= 2) {
    $(metaNums[0]).text(String(total));
    $(metaNums[1]).text(String(cityCount));
  }

  // ── atlas (pins + pin-list) ───────────────────────────────────────
  if (usedCities.length) {
    // pin-list
    $('.cl-atlas-pinlist').html(
      usedCities.map(c => renderPinlistItem(c, counts.get(c.slug))).join('\n'));
    // SVG pins: drop existing groups, append fresh ones after the faint-city group
    $('.cl-pin-group').remove();
    const pinSvg = usedCities.map(c => renderPin(c, counts.get(c.slug))).join('\n');
    // insert before the compass rose if present, else append to svg
    const compass = $('.cl-map-compass');
    if (compass.length) compass.first().before(pinSvg + '\n');
    else $('.cl-atlas-map svg').append(pinSvg);
  }

  // ── filter pills ──────────────────────────────────────────────────
  $('.cl-coll-filter').html(renderFilterPills(usedCities, counts, total));

  // ── hero slides ───────────────────────────────────────────────────
  $('#cl-hero-slides').html(ordered.map((l, i) => renderHeroSlide(l, i === 0)).join('\n'));
  // static featured init (JS re-syncs on rotate, but keep first paint correct)
  if (ordered.length) {
    const f = ordered[0];
    $('#cl-hero-featured').attr('href', f.listingUrl);
    if (f.heroImg) $('#cl-hero-featured-thumb').attr('style', `background-image:url('${f.heroImg}')`);
    $('#cl-hero-featured-name').html(`${escText(f.nameVi)} <small>${priceString(f.purchasePrice)}</small>`);
  }

  // ── collection cards ──────────────────────────────────────────────
  $('#cl-collection-track').html(ordered.map(renderCard).join('\n'));

  // ── compare table ─────────────────────────────────────────────────
  const tbody = $('#cl-tbl tbody').length ? $('#cl-tbl tbody') : $('#cl-tbl').find('tbody');
  if (tbody.length) tbody.html(ordered.map(renderCompareRow).join('\n'));

  return $.html();
}

// ─── Notion → model ─────────────────────────────────────────────────────────

async function buildModelFromNotion(notion, countryRow) {
  const p = countryRow.properties;
  const rt = (prop) => {
    if (!prop) return '';
    if (prop.title) return prop.title.map(t => t.plain_text).join('');
    if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
    return '';
  };
  const url = (prop) => (prop?.url) || (prop?.rich_text ? prop.rich_text.map(t => t.plain_text).join('').trim() : '') || '';
  const country = {
    slug: rt(p['Slug']),
    nameVi: rt(p['Country Name VI']),
    nameEn: rt(p['Country Name EN']),
    plaqueYoy: rt(p['📊 Plaque YoY']),
    countryUrl: url(p['🔗 Country URL']),
    pageId: countryRow.id,
  };

  const body = await parseBody(notion, countryRow.id);
  const listings = await fetchCountryListings(notion, country.nameEn);
  return { country, body, listings };
}

async function listAllBlocks(notion, blockId) {
  let out = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    out = out.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

const blockText = (b) => {
  const t = b[b.type];
  if (t && Array.isArray(t.rich_text)) return t.rich_text.map(r => r.plain_text).join('');
  return '';
};

function stripFlag(line) {
  if (line.startsWith('🇻🇳')) return { lang: 'vi', text: line.replace(/^🇻🇳\s*/, '').trim() };
  if (line.startsWith('🇬🇧')) return { lang: 'en', text: line.replace(/^🇬🇧\s*/, '').trim() };
  return null;
}

const EDITORIAL = {
  'Hero Tagline': 'heroTagline', 'Intro Quote': 'introQuote',
  'Atlas Title': 'atlasTitle', 'Atlas Lead': 'atlasLead',
  'Collection Title': 'collectionTitle', 'Collection Lead': 'collectionLead',
  'Aspiration': 'aspiration',
};

async function parseBody(notion, pageId) {
  const blocks = await listAllBlocks(notion, pageId);
  const body = { heroChips: [], cities: [] };
  let section = null;
  let city = null;

  for (const b of blocks) {
    const text = blockText(b).trim();
    if (b.type === 'heading_2') { section = text; city = null; continue; }
    if (b.type === 'heading_3') {
      if (section === 'Cities') { city = { name: text, match: [] }; body.cities.push(city); }
      continue;
    }
    if (b.type === 'code') {
      if (section === 'SVG Path' && text) body.svgPath = text.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (!text) continue;

    if (EDITORIAL[section]) {
      const f = stripFlag(text);
      if (f) { body[EDITORIAL[section]] = body[EDITORIAL[section]] || {}; body[EDITORIAL[section]][f.lang] = f.text; }
    } else if (section === 'Hero Chips') {
      if (text.includes('|')) {
        const [vi, en] = text.split('|').map(s => s.trim());
        body.heroChips.push({ vi, en });
      }
    } else if (section === 'Cities' && city) {
      const m = text.replace(/^[-•]\s*/, '').match(/^([a-z_]+)\s*:\s*(.+)$/i);
      if (m) {
        const key = m[1].toLowerCase(); const val = m[2].trim();
        if (key === 'slug') city.slug = val;
        else if (key === 'region_vi') city.regionVi = val;
        else if (key === 'region_en') city.regionEn = val;
        else if (key === 'airport_vi') city.airportVi = val;
        else if (key === 'airport_en') city.airportEn = val;
        else if (key === 'pin_x') city.pinX = Number(val);
        else if (key === 'pin_y') city.pinY = Number(val);
        else if (key === 'label_offset_x') city.labelOffsetX = Number(val);
        else if (key === 'lat') city.lat = val;
        else if (key === 'lng') city.lng = val;
        else if (key === 'match') city.match = val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }
  return body;
}

async function fetchCountryListings(notion, countryNameEn) {
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: LLP_DB_ID,
      filter: {
        and: [
          { property: 'Hub Status', select: { equals: 'Live' } },
          { property: 'Country', select: { equals: countryNameEn } },
        ],
      },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const rt = (prop) => {
    if (!prop) return '';
    if (prop.title) return prop.title.map(t => t.plain_text).join('');
    if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
    return '';
  };
  const num = (prop) => (prop && typeof prop.number === 'number' ? prop.number : null);
  const url = (prop) => (prop?.url) || (prop?.rich_text ? prop.rich_text.map(t => t.plain_text).join('').trim() : '') || '';
  const ms = (prop) => (prop && Array.isArray(prop.multi_select) ? prop.multi_select.map(s => s.name) : []);
  const json = (prop) => { const t = rt(prop).trim(); if (!t) return []; try { return JSON.parse(t); } catch { return []; } };

  return results.map(page => {
    const p = page.properties;
    return {
      slug: rt(p['🔗 Slug']),
      nameVi: rt(p['Name VI']) || rt(p['Property Name']),
      nameEn: rt(p['Property Name']),
      taglineVi: rt(p['🏷️ Tagline VI']),
      taglineEn: rt(p['🏷️ Tagline EN']),
      brand: rt(p['✦ Brand']),
      purchasePrice: num(p['Purchase Price']),
      yieldPct: num(p['Yield %']),
      irrPct: num(p['IRR %']),
      cocPct: num(p['Cash-on-Cash %']),
      monthlyRent: num(p['Monthly Rental Income']),
      nacScore: num(p['⭐ NAC Score']),
      subScores: json(p['📊 Sub-Scores JSON']),
      listingUrl: url(p['Listing URL']),
      heroImg: url(p['Image URL']),
      regionCity: rt(p['Region/City']),
      district: rt(p['📍 District']),
      tags: ms(p['Tags']),
    };
  }).filter(l => l.slug);
}

// ─── per-country processing ─────────────────────────────────────────────────

async function ensureFile(slug) {
  const file = path.join(COUNTRY_DIR, `${slug}.html`);
  try {
    await fs.access(file);
    return { file, created: false };
  } catch {
    const tpl = await fs.readFile(TEMPLATE, 'utf-8');
    await fs.writeFile(file, tpl, 'utf-8');
    return { file, created: true };
  }
}

async function syncCountry(model, { outOverride } = {}) {
  const slug = model.country.slug;
  if (!slug) return { slug: '(missing)', skipped: 'no Slug' };
  const { file, created } = await ensureFile(slug);
  const html = await fs.readFile(file, 'utf-8');
  const patched = applyModel(html, model);
  const target = outOverride || file;
  await fs.writeFile(target, patched, 'utf-8');
  return { slug, file: target, created, listings: model.listings.length };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function runFixture() {
  const model = JSON.parse(await fs.readFile(FIXTURE, 'utf-8'));
  if (ONLY_SLUG) model.country.slug = ONLY_SLUG;
  const r = await syncCountry(model, { outOverride: OUT });
  console.log(`Fixture render → ${r.file} (${r.listings} listings)${r.created ? ' [scaffolded]' : ''}`);
}

async function runLive() {
  const { Client } = await import('@notionhq/client');
  const TOKEN = process.env.NOTION_TOKEN;
  if (!TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }
  const notion = new Client({ auth: TOKEN });

  let rows = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: COUNTRY_DB_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    rows = rows.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  let live = rows;
  if (ONLY_SLUG) {
    live = rows.filter(r => {
      const s = r.properties['Slug'];
      const slug = s?.rich_text ? s.rich_text.map(t => t.plain_text).join('') : (s?.title ? s.title.map(t => t.plain_text).join('') : '');
      return slug === ONLY_SLUG;
    });
  }
  console.log(`Country DB: ${rows.length} Live, ${live.length} to process.`);

  let ok = 0, fail = 0;
  for (const row of live) {
    try {
      const model = await buildModelFromNotion(notion, row);
      const r = await syncCountry(model);
      console.log(`  ✓ ${r.slug} → ${path.relative(ROOT, r.file)} (${r.listings} listings)${r.created ? ' [scaffolded]' : ''}`);
      // write back Last Synced + Listings Count
      await notion.pages.update({
        page_id: model.country.pageId,
        properties: {
          '📈 Listings Count': { number: model.listings.length },
          '📤 Last Synced': { date: { start: new Date().toISOString().slice(0, 10) } },
        },
      });
      ok++;
    } catch (err) {
      console.error(`  ✗ ${row.id}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} synced, ${fail} failed.`);
  if (fail > 0 && ok === 0) process.exit(1);
}

(FIXTURE ? runFixture() : runLive()).catch(err => { console.error(err); process.exit(1); });
