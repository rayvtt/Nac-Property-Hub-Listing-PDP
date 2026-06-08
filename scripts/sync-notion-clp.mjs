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

// COUNTRY_LOOKUP — maps the Notion Property Listings 'Country' select value
// → Country DB row metadata. The auto-scaffold step uses this when a new
// country gets a Live listing without a matching Country DB row.
// Add entries here as you onboard new countries.
const COUNTRY_LOOKUP = {
  'Vietnam':         { slug: 'vn',  code: 'VN', nameVi: 'Việt Nam',         wpSlug: 'vietnam',         region: 'asia',   flag: '🇻🇳' },
  'United Kingdom':  { slug: 'uk',  code: 'GB', nameVi: 'Vương Quốc Anh',   wpSlug: 'uk',              region: 'uk',     flag: '🇬🇧' },
  'Turkey':          { slug: 'tr',  code: 'TR', nameVi: 'Thổ Nhĩ Kỳ',       wpSlug: 'turkey',          region: 'me',     flag: '🇹🇷' },
  'Cyprus':          { slug: 'cy',  code: 'CY', nameVi: 'Síp',              wpSlug: 'cyprus',          region: 'eu',     flag: '🇨🇾' },
  'Greece':          { slug: 'gr',  code: 'GR', nameVi: 'Hy Lạp',           wpSlug: 'greece',          region: 'eu',     flag: '🇬🇷' },
  'Panama':          { slug: 'pa',  code: 'PA', nameVi: 'Panama',           wpSlug: 'panama',          region: 'caribe', flag: '🇵🇦' },
  'Singapore':       { slug: 'sg',  code: 'SG', nameVi: 'Singapore',        wpSlug: 'singapore',       region: 'asia',   flag: '🇸🇬' },
  'Thailand':        { slug: 'th',  code: 'TH', nameVi: 'Thái Lan',         wpSlug: 'thailand',        region: 'asia',   flag: '🇹🇭' },
  'Indonesia':       { slug: 'id',  code: 'ID', nameVi: 'Indonesia',        wpSlug: 'indonesia',       region: 'asia',   flag: '🇮🇩' },
  'Philippines':     { slug: 'ph',  code: 'PH', nameVi: 'Philippines',      wpSlug: 'philippines',     region: 'asia',   flag: '🇵🇭' },
  'Malaysia':        { slug: 'my',  code: 'MY', nameVi: 'Malaysia',         wpSlug: 'malaysia',        region: 'asia',   flag: '🇲🇾' },
  'Japan':           { slug: 'jp',  code: 'JP', nameVi: 'Nhật Bản',         wpSlug: 'japan',           region: 'asia',   flag: '🇯🇵' },
  'Cambodia':        { slug: 'kh',  code: 'KH', nameVi: 'Campuchia',        wpSlug: 'cambodia',        region: 'asia',   flag: '🇰🇭' },
  'UAE':             { slug: 'ae',  code: 'AE', nameVi: 'UAE',              wpSlug: 'uae',             region: 'me',     flag: '🇦🇪' },
  'Dubai':           { slug: 'ae',  code: 'AE', nameVi: 'UAE',              wpSlug: 'uae',             region: 'me',     flag: '🇦🇪' },
  'Spain':           { slug: 'es',  code: 'ES', nameVi: 'Tây Ban Nha',      wpSlug: 'spain',           region: 'eu',     flag: '🇪🇸' },
  'Portugal':        { slug: 'pt',  code: 'PT', nameVi: 'Bồ Đào Nha',       wpSlug: 'portugal',        region: 'eu',     flag: '🇵🇹' },
  'Montenegro':      { slug: 'mne', code: 'ME', nameVi: 'Montenegro',       wpSlug: 'montenegro',      region: 'eu',     flag: '🇲🇪' },
  'Mexico':          { slug: 'mx',  code: 'MX', nameVi: 'Mexico',           wpSlug: 'mexico',          region: 'caribe', flag: '🇲🇽' },
  'Colombia':        { slug: 'co',  code: 'CO', nameVi: 'Colombia',         wpSlug: 'colombia',        region: 'caribe', flag: '🇨🇴' },
  'Costa Rica':      { slug: 'cr',  code: 'CR', nameVi: 'Costa Rica',       wpSlug: 'costa-rica',      region: 'caribe', flag: '🇨🇷' },
  'Saint Lucia':     { slug: 'lc',  code: 'LC', nameVi: 'Saint Lucia',      wpSlug: 'saint-lucia',     region: 'caribe', flag: '🇱🇨' },
  'Antigua and Barbuda': { slug: 'ag', code: 'AG', nameVi: 'Antigua và Barbuda', wpSlug: 'antigua-barbuda', region: 'caribe', flag: '🇦🇬' },
  'Grenada':         { slug: 'gd',  code: 'GD', nameVi: 'Grenada',          wpSlug: 'grenada',         region: 'caribe', flag: '🇬🇩' },
  'Vanuatu':         { slug: 'vu',  code: 'VU', nameVi: 'Vanuatu',          wpSlug: 'vanuatu',         region: 'pac',    flag: '🇻🇺' },
  'United States':   { slug: 'us',  code: 'US', nameVi: 'Hoa Kỳ',           wpSlug: 'usa',             region: 'us',     flag: '🇺🇸' },
  'USA':             { slug: 'us',  code: 'US', nameVi: 'Hoa Kỳ',           wpSlug: 'usa',             region: 'us',     flag: '🇺🇸' },
  'Australia':       { slug: 'au',  code: 'AU', nameVi: 'Úc',               wpSlug: 'australia',       region: 'pac',    flag: '🇦🇺' },
  'New Zealand':     { slug: 'nz',  code: 'NZ', nameVi: 'New Zealand',      wpSlug: 'new-zealand',     region: 'pac',    flag: '🇳🇿' },
};

// NAC region code → continent label (drives the §10 track-record ribbon count).
// UK and EU both roll into Europe for a single continent bucket.
const REGION_CONTINENT = {
  asia:   'Asia',
  eu:     'Europe',
  uk:     'Europe',
  me:     'Middle East',
  caribe: 'Central America',
  us:     'North America',
  pac:    'Oceania',
};

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

  return `    <a class="cl-card reveal"
             href="${escAttr(l.listingUrl)}"
             rel="noopener"
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
              <span class="cl-card-stat-lbl"><span data-vi="Giá khởi điểm">Giá khởi điểm</span><span data-en="Entry">Entry</span></span>
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
    </a>`;
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

function renderPin(c) {
  const x = c.pinX, y = c.pinY;
  // anchor "end" lets clustered right-side pins grow their labels leftward
  // into the empty map centre instead of off the right viewBox edge.
  const anchor = c.labelAnchor === 'end' || c.labelAnchor === 'middle' ? c.labelAnchor : 'start';
  const lblX = x + (c.labelOffsetX ?? 14);
  const lblY = y + (c.labelOffsetY ?? 0);
  return `        <g class="cl-pin-group" onclick="window.clFilterCity &amp;&amp; clFilterCity('${c.slug}')">
          <circle class="cl-pin-halo" cx="${x}" cy="${y}" r="7"></circle>
          <circle class="cl-pin-ring" cx="${x}" cy="${y}" r="6"></circle>
          <circle class="cl-pin-core" cx="${x}" cy="${y}" r="3"></circle>
          <text class="cl-pin-lbl" x="${lblX}" y="${lblY + 3}" text-anchor="${anchor}">${escText(c.name)}</text>
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

// ─── managed SEO / GEO head block ────────────────────────────────────────────
// Generates the full set of "structural" head tags for a CLP — canonical,
// og:url/locale/site_name, twitter card, hreflang, robots, and a rich JSON-LD
// @graph (CollectionPage + BreadcrumbList + ItemList of the actual listings).
// applyModel() strips any existing managed tags first, then injects this fresh
// block, so all CLPs converge to identical, correct, listing-aware structure on
// every sync — current 6 countries and any future scaffold alike.

const ORIGIN = 'https://nomadassetcollective.com';
const HUB_PATH = '/property-hub-bat-dong-san';
const CURRENCY_CODE = { USD: 'USD', EUR: 'EUR', GBP: 'GBP', AED: 'AED', SGD: 'SGD', JPY: 'JPY', CAD: 'CAD', AUD: 'AUD' };

function clpCanonical(country) {
  if (country.countryUrl) return country.countryUrl.replace(/\/?$/, '/');
  const meta = COUNTRY_META[country.nameEn] || {};
  const wp = meta.wpSlug || country.slug;
  return `${ORIGIN}${HUB_PATH}/${wp}/`;
}

// Each listing → schema.org Product (universally indexed, supports offers +
// brand + image). Branded residences are products being sold, so Product with
// an Offer is the cleanest type for rich results + LLM extraction.
function listingToJsonLd(l, position) {
  const item = {
    '@type': 'Product',
    name: l.nameEn || l.nameVi,
    category: l.hubType || 'Branded Residence',
  };
  if (l.heroImg) item.image = l.heroImg;
  if (l.listingUrl) item.url = l.listingUrl;
  if (l.brand) item.brand = { '@type': 'Brand', name: shortBrand(l.brand) };
  if (l.regionCity) item.areaServed = l.regionCity;
  if (l.purchasePrice != null) {
    item.offers = {
      '@type': 'Offer',
      price: Math.round(l.purchasePrice),
      priceCurrency: CURRENCY_CODE[l.currency] || 'USD',
      availability: 'https://schema.org/InStock',
      ...(l.listingUrl ? { url: l.listingUrl } : {}),
    };
  }
  return { '@type': 'ListItem', position, item };
}

function buildManagedSeoHead(country, ordered, total, descText, ogImg) {
  const canonical = clpCanonical(country);
  const enCanonical = canonical.replace(`${ORIGIN}${HUB_PATH}/`, `${ORIGIN}/en${HUB_PATH}/`);
  const titleText = `${country.nameEn} · NAC Property Collection`;

  const graph = [
    {
      '@type': 'CollectionPage',
      name: titleText,
      description: descText,
      url: canonical,
      inLanguage: 'vi',
      numberOfItems: total,
      isPartOf: { '@type': 'WebSite', name: 'Nomad Asset Collective', url: `${ORIGIN}/` },
      about: { '@type': 'Country', name: country.nameEn },
      ...(ogImg ? { primaryImageOfPage: ogImg } : {}),
      publisher: {
        '@type': 'Organization',
        name: 'Nomad Asset Collective',
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/wp-content/uploads/2026/05/nac-cover.png`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Property Hub', item: `${ORIGIN}${HUB_PATH}/` },
        { '@type': 'ListItem', position: 3, name: country.nameEn, item: canonical },
      ],
    },
  ];
  if (total > 0) {
    graph.push({
      '@type': 'ItemList',
      name: `Branded residences in ${country.nameEn}`,
      numberOfItems: total,
      itemListElement: ordered.map((l, i) => listingToJsonLd(l, i + 1)),
    });
  }
  const jsonLd = { '@context': 'https://schema.org', '@graph': graph };

  return [
    `<meta property="og:url" content="${escAttr(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="vi_VN">`,
    `<meta property="og:locale:alternate" content="en_US">`,
    `<meta property="og:site_name" content="Nomad Asset Collective">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(titleText)}">`,
    `<meta name="twitter:description" content="${escAttr(descText)}">`,
    ...(ogImg ? [`<meta name="twitter:image" content="${escAttr(ogImg)}">`] : []),
    `<link rel="canonical" href="${escAttr(canonical)}">`,
    `<link rel="alternate" hreflang="vi" href="${escAttr(canonical)}">`,
    `<link rel="alternate" hreflang="en" href="${escAttr(enCanonical)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escAttr(canonical)}">`,
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">`,
    `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`,
  ].join('\n');
}

// Strip the managed tags so re-sync never duplicates them. Leaves <title>,
// meta description, og:title/og:description, og:image (updated in place).
// SCOPED TO <head> — body JSON-LD (e.g. the case-study Article ItemList near
// the footer) is editorial content and must be preserved.
function stripManagedSeoHead($) {
  const head = $('head');
  head.find('link[rel="canonical"]').remove();
  head.find('link[rel="alternate"][hreflang]').remove();
  head.find('meta[property="og:url"]').remove();
  head.find('meta[property="og:type"]').remove();
  head.find('meta[property="og:locale"]').remove();
  head.find('meta[property="og:locale:alternate"]').remove();
  head.find('meta[property="og:site_name"]').remove();
  head.find('meta[name="twitter:card"]').remove();
  head.find('meta[name="twitter:title"]').remove();
  head.find('meta[name="twitter:description"]').remove();
  head.find('meta[name="twitter:image"]').remove();
  head.find('meta[name="robots"]').remove();
  head.find('script[type="application/ld+json"]').remove();
}

// ─── the patcher: model → patched HTML string ───────────────────────────────

function applyModel(html, model, { globalStats } = {}) {
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

  // ── title + meta (page head) ──────────────────────────────────────
  const titleText = `${country.nameEn} · NAC Property Collection`;
  $('title').text(titleText);
  $('meta[property="og:title"]').attr('content', titleText);
  $('meta[name="twitter:title"]').attr('content', titleText);
  const descText = total > 0
    ? `Branded residences across ${country.nameEn} — ${total} curated listing${total === 1 ? '' : 's'} from NAC's Property Hub.`
    : `Branded residences across ${country.nameEn} — curated listings from NAC's Property Hub.`;
  $('meta[name="description"]').attr('content', descText);
  $('meta[property="og:description"]').attr('content', descText);
  $('meta[name="twitter:description"]').attr('content', descText);
  // Bespoke per-country social card (constellation atlas + tagline + stamp).
  // Generated by scripts/build-clp-og-images.mjs and served from GH Pages.
  // Falls back to the first listing's hero if the slug is missing (shouldn't
  // happen — every Live CLP gets a card).
  const ogImg = country.slug
    ? `https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/og-images/clp-${country.slug}.png`
    : ordered.find(l => l.heroImg)?.heroImg;
  if (ogImg) {
    $('meta[property="og:image"]').attr('content', ogImg);
  }

  // ── managed SEO / GEO head (canonical, hreflang, twitter, JSON-LD @graph) ──
  // Strip any prior managed tags, then inject a fresh listing-aware block so
  // every CLP gets a complete, country-specific SEO/GEO header on every sync.
  stripManagedSeoHead($);
  $('head').append('\n' + buildManagedSeoHead(country, ordered, total, descText, ogImg) + '\n');

  // ── editorial scalars ─────────────────────────────────────────────
  setBi($, '.cl-name', { vi: country.nameVi, en: country.nameEn });
  // header trail country label (mirrors PDP's NAC-id slot)
  if (country.nameEn) $('.nac-trail-id').text(country.nameEn);

  // hero eyebrow — "Quốc gia · <name>" + live count badge
  const eyebrowFirst = $('.cl-hero-eyebrow > span').not('.live').first();
  if (eyebrowFirst.length) {
    eyebrowFirst.html(biSpans(`Quốc gia · ${country.nameVi}`, `Country · ${country.nameEn}`));
  }
  const liveBadge = $('.cl-hero-eyebrow .live');
  if (liveBadge.length) {
    const en = total === 1 ? 'listing live' : 'listings live';
    liveBadge.html(biSpans(`${total} dự án Live`, `${total} ${en}`));
  }

  // strip any Vietnam-only static SVG markers leftover from the template
  $('.cl-map-faint-city, .cl-map-faint-lbl').remove();
  // strip any HTML comments inside the SVG that mention specific cities
  $('.cl-atlas-map svg').contents().filter(function () { return this.type === 'comment'; }).remove();
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
  // Always rebuild — leaving the template default leaks placeholder
  // (Vietnam) cities onto countries that haven't received any Live
  // listings yet (MY/TH/SG/AE etc.).
  $('.cl-pin-group').remove();
  if (usedCities.length) {
    $('.cl-atlas-pinlist').html(
      usedCities.map(c => renderPinlistItem(c, counts.get(c.slug))).join('\n'));
    const pinSvg = usedCities.map(c => renderPin(c)).join('\n');
    // insert before the compass rose if present, else append to svg
    const compass = $('.cl-map-compass');
    if (compass.length) compass.first().before(pinSvg + '\n');
    else $('.cl-atlas-map svg').append(pinSvg);
  } else {
    $('.cl-atlas-pinlist').html(
      `        <div class="cl-atlas-pinlist-empty"><span data-vi="Dự án đầu tiên sắp ra mắt — bản đồ thành phố sẽ kích hoạt khi có dự án Live.">Dự án đầu tiên sắp ra mắt — bản đồ thành phố sẽ kích hoạt khi có dự án Live.</span><span data-en="First listings coming soon — city pins activate once a Live listing lands.">First listings coming soon — city pins activate once a Live listing lands.</span></div>`);
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

  // Heading mirrors the row count — "Bốn dự án" / "Four listings" was the
  // hardcoded template default and stayed wrong for any country with ≠4
  // listings. Spell out 1–10 in both langs, fall back to digits beyond.
  const n = ordered.length;
  const VI_NUMS = ['Không','Một','Hai','Ba','Bốn','Năm','Sáu','Bảy','Tám','Chín','Mười'];
  const EN_NUMS = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'];
  const viWord = n >= 0 && n <= 10 ? VI_NUMS[n] : String(n);
  const enWord = n >= 0 && n <= 10 ? EN_NUMS[n] : String(n);
  const enUnit = n === 1 ? 'listing' : 'listings';
  const viTitle = `${viWord} dự án. Một <em>cái nhìn</em>.`;
  const enTitle = `${enWord} ${enUnit}. One <em>side-by-side</em>.`;
  $('.cl-compare-title [data-vi]').attr('data-vi', viTitle).html(viTitle);
  $('.cl-compare-title [data-en]').attr('data-en', enTitle).html(enTitle);
  // 0-listing CLPs: hide the entire compare section so the framing stays
  // honest (no "Zero listings. One side-by-side." heading on its own).
  if (n === 0) $('.cl-compare').attr('hidden', 'hidden');
  else $('.cl-compare').removeAttr('hidden');

  // ── §10 track-record ribbon (NAC-wide brag) ───────────────────────
  // Only present on the newer CLP layout (AE/AU/MY/SG/TH/VN). Older
  // CLPs (CY/GR/PA/TR/UK) skipped this section — silently no-op there.
  if (globalStats) {
    const trackNums = $('.cl-track .cl-track-num');
    if (trackNums.length >= 3) {
      $(trackNums[0]).html(`${globalStats.listingsFloor}<span class="cl-track-plus">+</span>`);
      $(trackNums[1]).text(String(globalStats.countriesCount));
      $(trackNums[2]).text(String(globalStats.continentsCount));
    }
  }

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
      if (b.type === 'bulleted_list_item' && text.includes('|')) {
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
        else if (key === 'label_offset_y') city.labelOffsetY = Number(val);
        else if (key === 'label_anchor') city.labelAnchor = val.toLowerCase();
        else if (key === 'lat') city.lat = val;
        else if (key === 'lng') city.lng = val;
        else if (key === 'match') city.match = val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }
  return body;
}

// ─── Auto-scaffold ─────────────────────────────────────────────────────────
// When a new country gets a Live listing in the LLP without a corresponding
// Country DB row, create a Draft row with auto-fields + a structured page
// body so the editor can fill in the editorial and flip Hub Status = Live.

const block = {
  p: (text) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } }),
  quote: (text) => ({ object: 'block', type: 'quote', quote: { rich_text: [{ type: 'text', text: { content: text } }] } }),
  h2: (text) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } }),
  h3: (text) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } }),
  bullet: (text) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } }),
  code: (text, language = 'plain text') => ({ object: 'block', type: 'code', code: { rich_text: [{ type: 'text', text: { content: text } }], language } }),
};

function defaultBodyBlocks(meta, countryEn) {
  const todoVi = '🇻🇳 TODO: viết nội dung tiếng Việt.';
  const todoEn = `🇬🇧 TODO: write English copy for ${countryEn}.`;
  return [
    block.quote(`Sync target: country/${meta.slug}.html · regenerated from this page + Live listings in 🏠 NAC - Property Listings where Country = ${countryEn}. Edit each ## section below. Flip Hub Status = Live once filled in.`),
    block.h2('Hero Tagline'),
    block.p(todoVi), block.p(todoEn),
    block.h2('Hero Chips'),
    block.p('One chip per line. Format: VI | EN (separate with a single pipe).'),
    block.bullet('TODO chip 1 VI | TODO chip 1 EN'),
    block.bullet('TODO chip 2 VI | TODO chip 2 EN'),
    block.bullet('TODO chip 3 VI | TODO chip 3 EN'),
    block.h2('Intro Quote'),
    block.p(todoVi), block.p(todoEn),
    block.h2('Atlas Title'),
    block.p(todoVi), block.p(todoEn),
    block.h2('Atlas Lead'),
    block.p(todoVi), block.p(todoEn),
    block.h2('Collection Title'),
    block.p(todoVi), block.p(todoEn),
    block.h2('Collection Lead'),
    block.p('🇻🇳 Vuốt, kéo, hoặc lọc theo thành phố. Bấm thẻ để xem nhanh, mũi tên để mở dự án.'),
    block.p('🇬🇧 Swipe, drag, or filter by city. Click a card for quick view, the arrow for the full listing.'),
    block.h2('Aspiration'),
    block.p(`🇻🇳 TODO: câu kết về ${meta.nameVi}. Format: Sở hữu một X. Sở hữu <strong>${meta.nameVi}</strong>.`),
    block.p(`🇬🇧 TODO: closing line about ${countryEn}. Format: Own a X. Own <strong>${countryEn}</strong>.`),
    block.h2('SVG Path'),
    block.p('Stylized country silhouette (320×420 viewBox). Replace the d= value below with a path that matches the country shape.'),
    block.code('M 100 100 C 130 80, 180 80, 220 100 C 240 120, 240 200, 220 280 C 180 320, 130 320, 100 280 C 80 200, 80 120, 100 100 Z'),
    block.h2('Cities'),
    block.p('One ### heading per city. Replace TODO with real city data. match: aliases must overlap with the listing\'s Region/City + District values so the script can assign each listing to a city.'),
    block.h3('TODO City'),
    block.bullet('slug: todo-slug'),
    block.bullet('match: todo, alias1, alias2'),
    block.bullet('region_vi: TODO miền · vùng'),
    block.bullet('region_en: TODO region · area'),
    block.bullet('airport_vi: TODO sân bay · X phút'),
    block.bullet('airport_en: TODO airport · X min'),
    block.bullet('lat: 0.00°N'),
    block.bullet('lng: 0.00°E'),
    block.bullet('pin_x: 160'),
    block.bullet('pin_y: 210'),
    block.bullet('label_offset_x: 14'),
    block.bullet('label_offset_y: 0'),
    block.bullet('label_anchor: start'),
  ];
}

async function scaffoldMissingCountries(notion) {
  // Discover all Live countries in the LLP
  const liveCountries = new Set();
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: LLP_DB_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const sel = page.properties.Country?.select;
      if (sel?.name) liveCountries.add(sel.name);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  // Discover existing Country DB rows (any status, dedup by Slug)
  const existingSlugs = new Set();
  const existingNamesEn = new Set();
  cursor = undefined;
  do {
    const res = await notion.databases.query({
      database_id: COUNTRY_DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const p = page.properties;
      const slug = (p.Slug?.rich_text || []).map(t => t.plain_text).join('');
      if (slug) existingSlugs.add(slug);
      const nameEn = (p['Country Name EN']?.rich_text || []).map(t => t.plain_text).join('');
      if (nameEn) existingNamesEn.add(nameEn);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const created = [];
  const skipped = [];
  for (const country of liveCountries) {
    if (existingNamesEn.has(country)) continue;
    const meta = COUNTRY_LOOKUP[country];
    if (!meta) {
      console.warn(`  ⚠ Auto-scaffold: no COUNTRY_LOOKUP entry for "${country}" — add one to scripts/sync-notion-clp.mjs`);
      skipped.push(country);
      continue;
    }
    if (existingSlugs.has(meta.slug)) continue;

    const countryUrl = `https://nomadassetcollective.com/property-hub-bat-dong-san/${meta.wpSlug}/`;
    await notion.pages.create({
      parent: { database_id: COUNTRY_DB_ID },
      icon: { type: 'emoji', emoji: meta.flag },
      properties: {
        'Country Name VI': { title: [{ text: { content: meta.nameVi } }] },
        'Country Name EN': { rich_text: [{ text: { content: country } }] },
        'Slug': { rich_text: [{ text: { content: meta.slug } }] },
        'Country Code': { rich_text: [{ text: { content: meta.code } }] },
        'Hub Status': { select: { name: 'Draft' } },
        '🌏 Region': { select: { name: meta.region } },
        '🔗 Country URL': { url: countryUrl },
      },
      children: defaultBodyBlocks(meta, country),
    });
    console.log(`  + Auto-scaffolded Country DB row: ${country} (slug=${meta.slug}, status=Draft) — editor fills body, flips to Live`);
    created.push(country);
  }
  return { created, skipped };
}

// NAC-wide brag stats for the §10 track-record ribbon. Counts Live + Draft
// so the "100+" suffix stays honest as drafts flip to Live (no churn per
// status change). Continents derived from COUNTRY_LOOKUP[c].region via
// REGION_CONTINENT — unknown countries are simply skipped from the count.
async function fetchGlobalStats(notion) {
  const countries = new Set();
  let total = 0;
  for (const status of ['Live', 'Draft']) {
    let cursor;
    do {
      const res = await notion.databases.query({
        database_id: LLP_DB_ID,
        filter: { property: 'Hub Status', select: { equals: status } },
        start_cursor: cursor,
        page_size: 100,
      });
      total += res.results.length;
      for (const p of res.results) {
        const c = p.properties.Country?.select?.name;
        if (c) countries.add(c);
      }
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
  }
  const continents = new Set();
  for (const c of countries) {
    const region = COUNTRY_LOOKUP[c]?.region;
    const continent = region && REGION_CONTINENT[region];
    if (continent) continents.add(continent);
  }
  return {
    listingsFloor: Math.floor(total / 10) * 10,
    countriesCount: countries.size,
    continentsCount: continents.size,
  };
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
  const sel = (prop) => (prop && prop.select ? prop.select.name : null);
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
      currency: sel(p['Currency']),
      hubType: sel(p['🏨 Hub Type']),
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

// Cache the template's <script> body once per process — used by syncCountry to
// keep every country file's JS in sync with the template. The template is the
// canonical source of truth for client-side behaviour (card click handlers,
// modal, hero carousel, etc.); copying it over on every render means JS
// changes propagate without touching each country/*.html by hand.
let _templateScriptBody = null;
async function getTemplateScriptBody() {
  if (_templateScriptBody !== null) return _templateScriptBody;
  try {
    const tplHtml = await fs.readFile(TEMPLATE, 'utf-8');
    const $tpl = cheerio.load(tplHtml, { decodeEntities: false });
    _templateScriptBody = $tpl('body > script').last().html() || '';
  } catch {
    _templateScriptBody = '';
  }
  return _templateScriptBody;
}

async function syncCountry(model, { outOverride, globalStats } = {}) {
  const slug = model.country.slug;
  if (!slug) return { slug: '(missing)', skipped: 'no Slug' };
  const { file, created } = await ensureFile(slug);
  const html = await fs.readFile(file, 'utf-8');
  let patched = applyModel(html, model, { globalStats });

  // Overwrite the country file's <script> with the template's. Skips the
  // template itself (which is the source we just read from).
  if (path.resolve(file) !== path.resolve(TEMPLATE)) {
    const tplScript = await getTemplateScriptBody();
    if (tplScript) {
      const $ = cheerio.load(patched, { decodeEntities: false });
      const $script = $('body > script').last();
      if ($script.length) {
        $script.html(tplScript);
        patched = $.html();
      }
    }
  }

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
  const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });

  // Auto-scaffold step: for any country with a Live LLP listing but no Country DB
  // row, create a Draft row with auto-fields + a structured body template.
  // Failure here logs a warning but doesn't block the main sync.
  try {
    const { created, skipped } = await scaffoldMissingCountries(notion);
    if (created.length) console.log(`Auto-scaffolded ${created.length} Country DB row(s): ${created.join(', ')}`);
    if (skipped.length) console.log(`Auto-scaffold skipped ${skipped.length} country(ies) (no COUNTRY_LOOKUP entry): ${skipped.join(', ')}`);
  } catch (err) {
    console.warn(`Auto-scaffold step failed: ${err.message} — continuing with existing rows`);
  }

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

  // NAC-wide stats for the §10 track-record ribbon — fetched once, reused
  // for every country so all CLPs render identical brag numbers.
  let globalStats = null;
  try {
    globalStats = await fetchGlobalStats(notion);
    console.log(`Global stats: ${globalStats.listingsFloor}+ listings · ${globalStats.countriesCount} countries · ${globalStats.continentsCount} continents`);
  } catch (err) {
    console.warn(`fetchGlobalStats failed: ${err.message} — track-record ribbon will keep stale numbers`);
  }

  let ok = 0, fail = 0;
  for (const row of live) {
    try {
      const model = await buildModelFromNotion(notion, row);
      const r = await syncCountry(model, { globalStats });
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
