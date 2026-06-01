#!/usr/bin/env node
// Rebuilds index.html's two card sections from Notion Live rows:
//   1. Country Pages (CLPs) — from the Country DB
//   2. Listing Pages (PDPs) — from the Property Listings DB
//
// Markers in index.html bound each rebuilt section:
//   <!-- INDEX_COUNTRIES_START --> ... <!-- INDEX_COUNTRIES_END -->
//   <!-- INDEX_CARDS_START --> ... <!-- INDEX_CARDS_END -->
//
// Skips Live rows whose HTML file (country/<slug>.html or
// properties/<slug>.html) doesn't exist on disk — avoids broken links
// on the GitHub Pages preview index.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@notionhq/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const PROPERTIES_DIR = path.join(ROOT, 'properties');
const COUNTRY_DIR = path.join(ROOT, 'country');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const NOTION_COUNTRY_DATABASE_ID = process.env.NOTION_COUNTRY_DATABASE_ID || 'a01ef35ce9fd45b1bba3ec4de4da678c';

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }

const notion = new Client({ auth: NOTION_TOKEN });

const COUNTRY_FLAGS = {
  'Vietnam': '🇻🇳', 'Panama': '🇵🇦', 'Japan': '🇯🇵',
  'Thailand': '🇹🇭', 'Indonesia': '🇮🇩', 'Philippines': '🇵🇭',
  'Malaysia': '🇲🇾', 'Singapore': '🇸🇬', 'Cambodia': '🇰🇭',
  'Spain': '🇪🇸', 'Portugal': '🇵🇹', 'UAE': '🇦🇪',
  'Mexico': '🇲🇽', 'Colombia': '🇨🇴', 'Costa Rica': '🇨🇷',
  'Turkey': '🇹🇷', 'Cyprus': '🇨🇾', 'United Kingdom': '🇬🇧',
};

function richText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  return '';
}
const readNumber = (p) => (p && typeof p.number === 'number' ? p.number : null);
const readSelect = (p) => (p && p.select ? p.select.name : null);
const readUrl = (p) => (p && p.url ? p.url : null);
const readMultiSelect = (p) => (p && Array.isArray(p.multi_select) ? p.multi_select.map(s => s.name) : []);

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function fmtMoneyShort(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + Math.round(n);
}
function fmt1(n) {
  if (n == null) return '';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? r.toFixed(1) : r.toString();
}

async function fetchLiveCountries() {
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: NOTION_COUNTRY_DATABASE_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(page => {
    const p = page.properties;
    return {
      slug: richText(p['Slug']),
      countryNameVi: richText(p['Country Name VI']),
      countryNameEn: richText(p['Country Name EN']),
      countryCode: richText(p['Country Code']),
      countryUrl: readUrl(p['🔗 Country URL']),
      listingsCount: readNumber(p['📈 Listings Count']),
    };
  }).filter(c => c.slug);
}

async function fetchLiveProperties() {
  let results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } },
      start_cursor: cursor,
    });
    results = results.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return results.map(page => {
    const p = page.properties;
    const idNum = readNumber(p['Property ID']);
    return {
      slug: richText(p['🔗 Slug']),
      propertyId: idNum != null ? `NAC-${idNum}` : null,
      propertyIdNum: idNum,
      propertyName: richText(p['Property Name']),
      country: readSelect(p['Country']),
      district: richText(p['📍 District']),
      regionCity: richText(p['Region/City']),
      nacScore: readNumber(p['⭐ NAC Score']),
      purchasePrice: readNumber(p['Purchase Price']),
      yieldPct: readNumber(p['Yield %']),
      heroImg: readUrl(p['Image URL']),
      tags: readMultiSelect(p['Tags']),
      listingUrl: readUrl(p['Listing URL']),
    };
  }).filter(p => p.slug);
}

function renderCountryCard(c, heroImg, listingsCount) {
  const flag = COUNTRY_FLAGS[c.countryNameEn] || '🌍';
  const bgStyle = heroImg ? ` style="background-image:url('${esc(heroImg)}')"` : '';
  const count = listingsCount ?? c.listingsCount ?? 0;
  const liveBtn = c.countryUrl
    ? `<a href="${esc(c.countryUrl)}" class="country-card-btn country-card-btn-live" target="_blank" rel="noreferrer">Live ↗</a>`
    : `<span class="country-card-btn country-card-btn-live country-card-btn-disabled">Live</span>`;

  return `      <div class="country-card" data-slug="${esc(c.slug)}">
        <div class="country-card-img"${bgStyle}></div>
        <div class="country-card-body">
          <div class="country-card-meta">
            <span class="flag">${flag} ${esc(c.countryNameEn)} · CLP</span>
            <span class="name">${esc(c.countryNameVi || c.countryNameEn)}</span>
            <span class="stat">${count} listing${count === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="country-card-btns">
          <a href="country/${esc(c.slug)}.html" class="country-card-btn country-card-btn-preview" target="_blank">Preview ↗</a>
          ${liveBtn}
        </div>
      </div>`;
}

function renderCard(p) {
  const flag = (p.country && COUNTRY_FLAGS[p.country]) || '🌍';
  const bgStyle = p.heroImg ? ` style="background-image:url('${esc(p.heroImg)}')"` : '';
  const liveBtn = p.listingUrl
    ? `<a href="${esc(p.listingUrl)}" class="tile-btn tile-btn-live" target="_blank" rel="noreferrer">Live ↗</a>`
    : `<span class="tile-btn tile-btn-live tile-btn-disabled">Live</span>`;

  return `      <div class="tile" data-slug="${esc(p.slug)}">
        <div class="tile-img"${bgStyle}></div>
        <div class="tile-info">
          <span class="tile-country">${flag} ${esc(p.country || '')}</span>
          <span class="tile-name">${esc(p.propertyName)}</span>
          <span class="tile-stats"></span>
        </div>
        <div class="tile-btns">
          <a href="properties/${esc(p.slug)}.html" class="tile-btn tile-btn-preview" target="_blank">Preview ↗</a>
          ${liveBtn}
        </div>
      </div>`;
}

async function main() {
  const [countries, properties] = await Promise.all([
    fetchLiveCountries().catch(err => {
      console.warn(`  ⚠ Country DB fetch failed (${err.code || err.message}) — country section won't be rebuilt`);
      return [];
    }),
    fetchLiveProperties(),
  ]);
  console.log(`Found ${properties.length} Live propert(ies) and ${countries.length} Live countr(ies) in Notion.`);

  // ─── Properties (PDPs) ─────────────────────────────────────────────────
  for (const p of properties) {
    console.log(`  • slug=${p.slug || '(missing)'} id=${p.propertyId || '(missing)'} name="${p.propertyName || ''}"`);
  }
  const validProps = [];
  for (const p of properties) {
    try {
      await fs.access(path.join(PROPERTIES_DIR, `${p.slug}.html`));
      validProps.push(p);
    } catch {
      console.log(`  ⤳ ${p.slug}: no HTML file at properties/${p.slug}.html — skipped`);
    }
  }
  validProps.sort((a, b) => (a.propertyIdNum ?? 999) - (b.propertyIdNum ?? 999));

  // ─── Countries (CLPs) ──────────────────────────────────────────────────
  const validCountries = [];
  for (const c of countries) {
    try {
      await fs.access(path.join(COUNTRY_DIR, `${c.slug}.html`));
      // Pick a representative hero image: first matching Live listing with an image
      const matches = validProps.filter(p => p.country === c.countryNameEn);
      const heroImg = matches.find(p => p.heroImg)?.heroImg || null;
      validCountries.push({ ...c, heroImg, computedCount: matches.length });
    } catch {
      console.log(`  ⤳ ${c.slug}: no HTML file at country/${c.slug}.html — skipped`);
    }
  }
  validCountries.sort((a, b) => (a.countryNameEn || '').localeCompare(b.countryNameEn || ''));

  // ─── Read and patch index.html ─────────────────────────────────────────
  let html = await fs.readFile(INDEX_PATH, 'utf-8');
  const beforeHash = html;

  const cardsRe = /<!-- INDEX_CARDS_START[\s\S]*?<!-- INDEX_CARDS_END -->/;
  if (!cardsRe.test(html)) {
    console.error('Marker block (INDEX_CARDS_START/END) not found in index.html — cannot rebuild.');
    process.exit(1);
  }
  if (validProps.length) {
    const cards = validProps.map(renderCard).join('\n');
    const marker = '<!-- INDEX_CARDS_START — rebuilt by scripts/update-index.mjs from Notion Live rows -->';
    html = html.replace(cardsRe, `${marker}\n${cards}\n      <!-- INDEX_CARDS_END -->`);
  } else {
    console.log('No valid listings to render — keeping existing INDEX_CARDS block.');
  }

  const countriesRe = /<!-- INDEX_COUNTRIES_START[\s\S]*?<!-- INDEX_COUNTRIES_END -->/;
  if (countriesRe.test(html) && validCountries.length) {
    const cards = validCountries.map(c => renderCountryCard(c, c.heroImg, c.computedCount)).join('\n');
    const marker = '<!-- INDEX_COUNTRIES_START — rebuilt by scripts/update-index.mjs from Notion Country DB Live rows -->';
    html = html.replace(countriesRe, `${marker}\n${cards}\n      <!-- INDEX_COUNTRIES_END -->`);
  } else if (!countriesRe.test(html)) {
    console.log('No INDEX_COUNTRIES_START/END markers in index.html — skipping country rebuild.');
  } else {
    console.log('No valid countries to render — keeping existing INDEX_COUNTRIES block.');
  }

  if (html === beforeHash) {
    console.log(`No index change — ${validProps.length} listing(s) and ${validCountries.length} countr(ies) already match.`);
    return;
  }
  await fs.writeFile(INDEX_PATH, html, 'utf-8');
  console.log(`Done. Rebuilt index with ${validProps.length} listing card(s) and ${validCountries.length} country card(s).`);
  for (const c of validCountries) console.log(`  • country: ${c.countryNameEn} → country/${c.slug}.html`);
  for (const p of validProps) console.log(`  • listing: ${p.propertyId || '(no id)'} ${p.propertyName} → properties/${p.slug}.html`);
}

main().catch(err => { console.error(err); process.exit(1); });
