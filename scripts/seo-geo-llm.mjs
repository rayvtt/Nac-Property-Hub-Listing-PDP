#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SEO / GEO / LLM structured-data completer.
//
// The PDP template (_template-listing-pdp.html) ships a full SEO package in
// <head>: RealEstateListing + FAQPage + BreadcrumbList JSON-LD, OG/Twitter
// cards. sync-notion.mjs::patchHeadSeo() fills the *prose* half (title, meta,
// canonical, og/twitter title+desc, JSON-LD name/description/url/address).
//
// This module fills the *structured* half that patchHeadSeo leaves as literal
// `{token}` placeholders — and which therefore shipped broken on 67 live PDPs:
//   • RealEstateListing  geo · offers (price+currency) · brand · amenityFeature
//                        · datePosted · validThrough · image
//   • FAQPage            all 5–6 Q&As, rebuilt from Notion financials/location
//   • BreadcrumbList     country + property names and hrefs
//
// Everything is idempotent: re-running on an already-complete page yields byte
// -identical output (deterministic from Notion fields; dates are token-gated so
// they're written once and never churned).
//
// Geo coordinates: the Notion DB has no lat/lng field, so resolveGeo() geocodes
// City+District+Country via OpenStreetMap Nominatim, cached on disk. On failure
// the geo block is omitted entirely (an absent geo is valid; a `{lat}` is not).
//
// Exports:
//   resolveGeo(prop, { cacheFile, contactEmail })  → { lat, lng } | null
//   completeStructuredData($, prop)                → mutates the cheerio doc
//   buildLlmsTxt(properties)                        → string (root llms.txt)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';

// ─── Shared helpers (kept in sync with sync-notion.mjs) ──────────────────────

const COUNTRY_SLUG_OVERRIDES = {
  'Việt Nam': 'vietnam', 'United States': 'usa', 'USA': 'usa',
  'United Kingdom': 'uk', 'Dubai': 'uae',
};
export function countrySlugFromName(c) {
  if (!c) return '';
  if (COUNTRY_SLUG_OVERRIDES[c]) return COUNTRY_SLUG_OVERRIDES[c];
  return c.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ISO-3166 alpha-2 for the countries that appear in the Notion `Country` enum.
const COUNTRY_ISO2 = {
  'United States': 'US', USA: 'US', Portugal: 'PT', Greece: 'GR', Spain: 'ES',
  UAE: 'AE', Dubai: 'AE', 'Abu Dhabi': 'AE', 'United Kingdom': 'GB', France: 'FR',
  Italy: 'IT', Germany: 'DE', Vietnam: 'VN', 'Việt Nam': 'VN', Thailand: 'TH',
  Indonesia: 'ID', Malaysia: 'MY', Japan: 'JP', Singapore: 'SG', Philippines: 'PH',
  Qatar: 'QA', 'Saudi Arabia': 'SA', Oman: 'OM', Bahrain: 'BH', Turkey: 'TR',
  Panama: 'PA', 'St Kitts': 'KN', Antigua: 'AG', Grenada: 'GD', Dominica: 'DM',
  'St Vincent': 'VC', Bahamas: 'BS', Jamaica: 'JM', Trinidad: 'TT', Barbados: 'BB',
  Hungary: 'HU', Cyprus: 'CY', Malta: 'MT', Albania: 'AL', Montenegro: 'ME',
  Florida: 'US', Texas: 'US', Hawaii: 'US', 'New York': 'US', Colorado: 'US',
  Vanuatu: 'VU', Australia: 'AU', 'New Zealand': 'NZ', Fiji: 'FJ', Samoa: 'WS',
  'Papua New Guinea': 'PG', Nauru: 'NR',
};
const iso2 = (c) => COUNTRY_ISO2[c] || '';

const HUB = 'https://nomadassetcollective.com/property-hub-bat-dong-san';

// A value is a leftover template placeholder if it still contains `{…}`.
const isToken = (s) => typeof s === 'string' && /\{[^}]*\}/.test(s);

const round = (n) => Math.round(Number(n));
const fmt1 = (n) => {
  if (n == null) return '';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r);
};
const money = (n, currency) => {
  if (n == null) return '';
  return `${currency || 'USD'} ${round(n).toLocaleString('en-US')}`;
};

function canonicalOf(prop) {
  return `${HUB}/${countrySlugFromName(prop.country)}/${prop.slug}/`;
}
function locationText(prop) {
  return [prop.district, prop.regionCity, prop.country].filter(Boolean).join(', ');
}

// Match patchHeadSeo's JSON-LD serialization exactly so diffs stay minimal.
function serializeLd(json) {
  return '\n  ' + JSON.stringify(json, null, 2).split('\n').join('\n  ') + '\n  ';
}

// ─── Geocoding (OpenStreetMap Nominatim, disk-cached) ────────────────────────

export async function loadCache(cacheFile) {
  if (!cacheFile) return {};
  try { return JSON.parse(await fs.readFile(cacheFile, 'utf-8')); }
  catch { return {}; }
}
export async function saveCache(cacheFile, cache) {
  if (!cacheFile) return;
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Candidate queries from most to least specific. First hit wins.
function geoQueries(prop) {
  const c = prop.country === 'Việt Nam' ? 'Vietnam' : prop.country;
  return [
    [prop.propertyNameEn, prop.regionCity, c],
    [prop.district, prop.regionCity, c],
    [prop.regionCity, c],
  ].map((parts) => parts.filter(Boolean).join(', ')).filter(Boolean);
}

// resolveGeo({...prop}, opts) → { lat, lng } | null
// Mutates+returns the shared `cache` object so the caller can persist it once.
export async function resolveGeo(prop, opts = {}) {
  const { cache = {}, contactEmail = 'ops@nomadassetcollective.com', delayMs = 1100 } = opts;
  for (const q of geoQueries(prop)) {
    if (q in cache) {                    // cached (including cached null → skip)
      if (cache[q]) return cache[q];
      continue;
    }
    let hit = null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': `NAC-PDP-Geocoder/1.0 (${contactEmail})` },
      });
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr[0]?.lat && arr[0]?.lon) {
          hit = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
        }
      }
    } catch { /* network/parse error → treat as miss */ }
    cache[q] = hit;                      // cache the result (even null)
    await sleep(delayMs);                // Nominatim: ≤1 req/sec
    if (hit) return hit;
  }
  return null;
}

// ─── JSON-LD completers ──────────────────────────────────────────────────────

function completeRealEstate(json, prop) {
  const canonical = canonicalOf(prop);

  // image — fill from hero if the placeholder is still there; drop a stale token
  if (isToken(json.image)) {
    if (prop.heroImg) json.image = prop.heroImg; else delete json.image;
  }

  // datePosted / validThrough — token-gated so they're written once, not daily
  if (isToken(json.datePosted) || !json.datePosted) {
    json.datePosted = prop.listingDate || new Date().toISOString().slice(0, 10);
  }
  if (isToken(json.validThrough)) {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    json.validThrough = d.toISOString().slice(0, 10);
  }

  // address — mirror patchHeadSeo but also normalise the ISO country code
  if (json.address) {
    json.address.streetAddress = prop.district || prop.regionCity || '';
    json.address.addressLocality = prop.regionCity || '';
    json.address.addressRegion = prop.regionCity || undefined;
    json.address.addressCountry = iso2(prop.country) || prop.country || '';
  }

  // geo — fill from resolved coords, else remove the block (valid > broken)
  if (prop.geo && prop.geo.lat != null && prop.geo.lng != null) {
    json.geo = { '@type': 'GeoCoordinates', latitude: String(prop.geo.lat), longitude: String(prop.geo.lng) };
  } else if (isToken(json.geo?.latitude) || isToken(json.geo?.longitude)) {
    delete json.geo;
  }

  // offers — real price + the listing's actual currency
  if (json.offers) {
    if (prop.purchasePrice != null) json.offers.price = String(round(prop.purchasePrice));
    else if (isToken(json.offers.price)) delete json.offers.price;
    json.offers.priceCurrency = prop.currency || 'USD';
    if (!json.offers.availability) json.offers.availability = 'https://schema.org/InStock';
  }

  // brand — real brand name, else drop the block
  if (json.brand) {
    if (prop.brand) json.brand.name = prop.brand;
    else if (isToken(json.brand.name)) delete json.brand;
  }

  // amenityFeature — from Notion ✨ Features (EN labels), up to 6
  if (Array.isArray(prop.features) && prop.features.length) {
    json.amenityFeature = prop.features.slice(0, 6)
      .map((f) => (f && (f.en || f.vi)) ? { '@type': 'LocationFeatureSpecification', name: f.en || f.vi } : null)
      .filter(Boolean);
  } else if (Array.isArray(json.amenityFeature) && json.amenityFeature.some((a) => isToken(a?.name))) {
    delete json.amenityFeature;
  }

  // url stays canonical (patchHeadSeo already set it, but be safe)
  if (isToken(json.url) || !json.url) json.url = canonical;
  return json;
}

function gradeOf(score) {
  if (score == null) return '';
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Strong';
  if (score >= 70) return 'Solid';
  return 'Fair';
}

// Rebuild the FAQ mainEntity from Notion data. Only emits questions we can
// answer with real values, so we never ship a `{token}` answer. English-only,
// matching the template.
function buildFaq(prop) {
  const name = prop.propertyNameEn || prop.propertyNameVi || 'this residence';
  const loc = locationText(prop);
  const price = money(prop.purchasePrice, prop.currency);
  const unit = (prop.hubType || 'residence').toLowerCase();
  const qa = [];

  if (price) {
    const tenure = prop.freehold ? 'Freehold ownership.' : 'Leasehold ownership.';
    qa.push([`What is the price of ${name}?`,
      `${name} starts from ${price} for a ${unit}${loc ? ` in ${loc}` : ''}. ${tenure}`]);
  }
  if (prop.yieldPct != null || prop.irrPct != null) {
    const bits = [];
    if (prop.yieldPct != null) bits.push(`an estimated ${fmt1(prop.yieldPct)}% gross rental yield`);
    if (prop.irrPct != null) bits.push(`${prop.payback ? `a ${round(prop.payback)}-year ` : ''}IRR of ${fmt1(prop.irrPct)}%`);
    if (prop.cocPct != null) bits.push(`a Cash-on-Cash return of ${fmt1(prop.cocPct)}% per year`);
    let ans = `${name} offers ${bits.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
    if (prop.monthlyRent != null) ans += ` Monthly rental income is approximately ${money(prop.monthlyRent, prop.currency)}.`;
    qa.push([`What is the rental yield for ${name}?`, ans]);
  }
  {
    const tenure = prop.freehold ? `${name} is available on a freehold basis to foreign buyers` : `${name} is available to foreign buyers on a leasehold basis`;
    let imm = '';
    if (prop.immigrationType === 'CBI') imm = ` Purchase can qualify for the ${prop.investmentProgram || 'citizenship-by-investment'} program.`;
    else if (prop.immigrationType === 'RBI') imm = ` Purchase can qualify for the ${prop.investmentProgram || 'residency-by-investment'} program.`;
    qa.push([`Can foreigners buy ${name}?`, `Yes. ${tenure}.${imm}`.replace('..', '.')]);
  }
  if (loc) {
    const facts = [prop.beachEn, prop.airportEn].filter(Boolean).join(' ');
    qa.push([`Where is ${name} located?`, `${name} is located in ${loc}.${facts ? ' ' + facts : ''}`.trim()]);
  }
  if (prop.nacScore != null) {
    let ans = `${name} holds a NAC Composite Score of ${round(prop.nacScore)}/100, rated '${gradeOf(prop.nacScore)}'.`;
    if (Array.isArray(prop.subScores) && prop.subScores.length) {
      const subs = prop.subScores
        .map((s) => (s && s.label_en != null && s.val != null) ? `${s.label_en} ${s.val}/10` : null)
        .filter(Boolean).join(', ');
      if (subs) ans += ` Sub-scores: ${subs}.`;
    }
    qa.push([`What is the NAC Score for ${name}?`, ans]);
  }

  return qa.map(([q, a]) => ({
    '@type': 'Question', name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  }));
}

function completeFaq(json, prop) {
  const entities = buildFaq(prop);
  if (entities.length) json.mainEntity = entities;
  return json;
}

function completeBreadcrumb(json, prop) {
  const cSlug = countrySlugFromName(prop.country);
  const canonical = canonicalOf(prop);
  if (!Array.isArray(json.itemListElement)) return json;
  for (const item of json.itemListElement) {
    if (item.position === 2) {
      item.name = prop.country || item.name;
      item.item = `${HUB}/${cSlug}/`;
    } else if (item.position === 3) {
      item.name = prop.propertyNameEn || prop.propertyNameVi || item.name;
      item.item = canonical;
    }
  }
  return json;
}

// Walk every <script type="application/ld+json"> and complete it by @type.
// Returns the number of blocks changed.
export function completeStructuredData($, prop) {
  let changed = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const $el = $(el);
    const raw = $el.text().trim();
    if (!raw) return;
    let json;
    try { json = JSON.parse(raw); } catch { return; }

    const type = json['@type'];
    const before = JSON.stringify(json);
    if (type === 'RealEstateListing') completeRealEstate(json, prop);
    else if (type === 'FAQPage') completeFaq(json, prop);
    else if (type === 'BreadcrumbList') completeBreadcrumb(json, prop);
    else return;

    if (JSON.stringify(json) !== before) { $el.text(serializeLd(json)); changed++; }
  });
  return changed;
}

// ─── llms.txt (root LLM/GEO discovery index) ─────────────────────────────────
// Spec: https://llmstxt.org — a Markdown file LLMs and AI crawlers read to
// understand a site. We emit one bullet per Live listing with the canonical
// URL and a one-line factual summary (brand, location, entry price, yield).

function firstSentence(text, maxLen = 160) {
  if (!text) return '';
  const m = text.match(/^[^.!?]+[.!?]/);
  let s = (m ? m[0] : text).trim();
  if (s.length > maxLen) s = s.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

export function buildLlmsTxt(properties) {
  const lines = [];
  lines.push('# Nomad Asset Collective — Property Hub');
  lines.push('');
  lines.push('> Curated international branded-residence and visa/residency real-estate listings. '
    + 'Each listing below is a standalone property detail page (PDP) with verified financials '
    + '(entry price, yield, IRR), a NAC composite score, and structured RealEstateListing + FAQ data.');
  lines.push('');
  lines.push('## Listings');
  lines.push('');

  const live = properties
    .filter((p) => p.slug && p.propertyNameEn && p.hubStatus === 'Live')
    .sort((a, b) => (a.country || '').localeCompare(b.country || '') || a.propertyNameEn.localeCompare(b.propertyNameEn));

  for (const p of live) {
    const url = canonicalOf(p);
    const facts = [
      [p.hubType, [p.district, p.regionCity, p.country].filter(Boolean).join(', ')].filter(Boolean).join(' in '),
      p.purchasePrice != null ? `from ${money(p.purchasePrice, p.currency)}` : '',
      p.yieldPct != null ? `~${fmt1(p.yieldPct)}% yield` : '',
      p.nacScore != null ? `NAC ${round(p.nacScore)}/100` : '',
    ].filter(Boolean).join(' · ');
    const desc = firstSentence(p.descEn) || facts;
    lines.push(`- [${p.propertyNameEn}](${url}): ${facts}. ${desc}`.replace(/\s+\./g, '.'));
  }

  lines.push('');
  lines.push('## About');
  lines.push('');
  lines.push('- [Property Hub index](https://nomadassetcollective.com/property-hub-bat-dong-san/): all listings, filterable by region, programme, and yield.');
  lines.push('- Bilingual (Vietnamese / English). Operated by Nomad Asset Collective.');
  lines.push('');
  return lines.join('\n');
}

export { canonicalOf, locationText };
