#!/usr/bin/env node
/**
 * build-clp-og-images.mjs — generate a bespoke 1200×630 social-share card per CLP.
 *
 * "Constellation Atlas" aesthetic: country silhouette in NAC gold on a deep-black
 * background, glowing city pins (constellation dots), bilingual country name,
 * the bespoke tagline, marquee cities, a wax-seal stamp top-right, and a hairline
 * gold rule + canonical URL along the bottom.
 *
 * Data is pulled from country/<slug>.html (the same files sync-notion-clp.mjs
 * patches), so re-running this after a Notion sync regenerates fresh PNGs with
 * up-to-date city pins / counts. Output: og-images/clp-<slug>.png (committed).
 *
 *   node scripts/build-clp-og-images.mjs            # all CLPs
 *   node scripts/build-clp-og-images.mjs vn         # one slug
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COUNTRY_DIR = path.join(ROOT, 'country');
const OUT_DIR = path.join(ROOT, 'og-images');

const W = 1200, H = 630;
const GOLD = '#d4af37';
const GOLD_SOFT = '#b8941f';
const CREAM = '#ede8dc';
const BG = '#0a0a0a';

const COUNTRY_CODE_FROM_SLUG = {
  ae: 'AE', au: 'AU', cy: 'CY', gr: 'GR', my: 'MY', pa: 'PA',
  sg: 'SG', th: 'TH', tr: 'TR', uk: 'UK', vn: 'VN',
};

// XML-escape only the chars that can break attribute values + text nodes.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Strip <strong>/<em> wrappers from tagline so we render plain text.
const stripInline = (s) => String(s ?? '')
  .replace(/<\/?(?:strong|em|b|i)\b[^>]*>/gi, '')
  .replace(/\s+/g, ' ').trim();

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function extractModel(html, slug) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const code = COUNTRY_CODE_FROM_SLUG[slug] || slug.toUpperCase();

  // Country name — prefer the bilingual hero name spans, fall back to <title>.
  const nameVi = $('.cl-name [data-vi]').first().text().trim()
    || $('.cl-hero-name [data-vi]').first().text().trim();
  const nameEn = $('.cl-name [data-en]').first().text().trim()
    || $('.cl-hero-name [data-en]').first().text().trim()
    || ($('title').text().split('·')[0] || '').trim();

  // Tagline — stripped of <strong>/<em> for rendering as plain text.
  const taglineEn = stripInline($('.cl-hero-tag [data-en]').first().html() || '');

  // Atlas SVG path + viewBox + pin coordinates.
  const svgEl = $('.cl-atlas-map svg').first();
  const viewBox = svgEl.attr('viewBox') || '0 0 320 420';
  const coastPath = $('.cl-map-coast').attr('d') || '';
  const pins = [];
  $('.cl-pin-group .cl-pin-core').each((_, el) => {
    const cx = parseFloat($(el).attr('cx'));
    const cy = parseFloat($(el).attr('cy'));
    if (Number.isFinite(cx) && Number.isFinite(cy)) pins.push({ cx, cy });
  });
  const cityNames = [];
  $('.cl-pin-group .cl-pin-lbl').each((_, el) => {
    const t = $(el).text().trim();
    if (t) cityNames.push(t);
  });

  // Stats from plaque.
  const plaqueVals = $('.cl-plaque .cl-plaque-row-val')
    .map((_, el) => $(el).text().trim()).get();
  const listings = plaqueVals[0] || '';
  const cities = plaqueVals[1] || '';
  const entry = plaqueVals[2] || '';

  return {
    slug,
    code,
    nameVi,
    nameEn,
    taglineEn,
    viewBox,
    coastPath,
    pins,
    cityNames,
    listings,
    cities,
    entry,
  };
}

function buildSvg(m) {
  const [vbx, vby, vbw, vbh] = m.viewBox.split(/\s+/).map(Number);
  // Fit atlas into a 460×460 box on the left, centered vertically at y=315.
  const ATLAS_W = 460, ATLAS_H = 460;
  const scale = Math.min(ATLAS_W / vbw, ATLAS_H / vbh);
  const atlasInnerW = vbw * scale;
  const atlasInnerH = vbh * scale;
  const ATLAS_X = 70 + (ATLAS_W - atlasInnerW) / 2;
  const ATLAS_Y = (H - atlasInnerH) / 2;

  const pinDots = m.pins.map((p) => {
    const x = ATLAS_X + (p.cx - vbx) * scale;
    const y = ATLAS_Y + (p.cy - vby) * scale;
    return `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="url(#pinHalo)"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${CREAM}" opacity="0.95"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${GOLD}"/>`;
  }).join('');

  // Right-column copy positions.
  const RX = 600;
  const taglineLines = wrapText(m.taglineEn || '', 38).slice(0, 3);
  const cityLine = m.cityNames.slice(0, 4).map(c => c.toUpperCase()).join('  ·  ');

  // Bottom stat line: build only from fields that have a value.
  const statParts = [];
  if (m.listings) statParts.push(`${m.listings} ${m.listings === '1' ? 'listing' : 'listings'}`);
  if (m.cities) statParts.push(`${m.cities} ${m.cities === '1' ? 'city' : 'cities'}`);
  if (m.entry) statParts.push(`from ${m.entry.replace(/\s+/g, '')}`);
  const statLine = statParts.join('  ·  ');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="${GOLD}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pinHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bgFade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d0d0d"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <pattern id="grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="3" fill="${BG}"/>
      <circle cx="1" cy="1" r="0.4" fill="#ffffff" opacity="0.025"/>
    </pattern>
  </defs>

  <!-- background + grain -->
  <rect width="${W}" height="${H}" fill="url(#bgFade)"/>
  <rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.5"/>

  <!-- gold halo behind atlas -->
  <ellipse cx="${(ATLAS_X + atlasInnerW / 2).toFixed(1)}"
           cy="${(ATLAS_Y + atlasInnerH / 2).toFixed(1)}"
           rx="320" ry="320" fill="url(#goldGlow)"/>

  <!-- country atlas silhouette -->
  <g transform="translate(${ATLAS_X.toFixed(1)} ${ATLAS_Y.toFixed(1)}) scale(${scale.toFixed(4)})">
    <path d="${esc(m.coastPath)}" fill="${GOLD}" opacity="0.92"
          stroke="${GOLD_SOFT}" stroke-width="0.5"/>
  </g>

  <!-- constellation pins -->
  ${pinDots}

  <!-- vertical hairline between columns -->
  <line x1="${RX - 30}" y1="115" x2="${RX - 30}" y2="${H - 115}"
        stroke="${GOLD}" stroke-width="0.6" opacity="0.35"/>

  <!-- NAC wordmark -->
  <text x="${RX}" y="130" font-family="ui-monospace, 'SF Mono', Menlo, monospace"
        font-size="14" letter-spacing="5.5" fill="#9b958a">
    NAC · NOMAD ASSET COLLECTIVE
  </text>

  <!-- Country name (EN — display) -->
  <text x="${RX}" y="232" font-family="Georgia, 'Times New Roman', serif"
        font-size="84" font-style="italic" font-weight="500" fill="${GOLD}"
        letter-spacing="-1">
    ${esc(m.nameEn)}
  </text>

  <!-- Country name (VI — secondary) -->
  ${m.nameVi && m.nameVi.toLowerCase() !== m.nameEn.toLowerCase() ? `
  <text x="${RX}" y="272" font-family="Georgia, serif"
        font-size="22" font-style="italic" fill="#9b958a"
        letter-spacing="0.5">
    ${esc(m.nameVi)}
  </text>` : ''}

  <!-- Tagline -->
  ${taglineLines.map((line, i) => `
  <text x="${RX}" y="${340 + i * 38}" font-family="Georgia, serif"
        font-size="26" font-style="italic" fill="${CREAM}"
        letter-spacing="0.3">
    ${esc(line)}
  </text>`).join('')}

  <!-- City ribbon -->
  ${cityLine ? `
  <text x="${RX}" y="${340 + taglineLines.length * 38 + 36}"
        font-family="ui-monospace, monospace" font-size="13"
        letter-spacing="3.5" fill="${GOLD_SOFT}">
    ${esc(cityLine)}
  </text>` : ''}

  <!-- Stat line -->
  ${statLine ? `
  <text x="${RX}" y="${H - 95}" font-family="ui-monospace, monospace"
        font-size="14" letter-spacing="2" fill="#8a8576">
    ${esc(statLine)}
  </text>` : ''}

  <!-- Wax-seal stamp (top-right) -->
  <g transform="translate(${W - 100} 100)">
    <circle r="62" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.7"/>
    <circle r="55" fill="none" stroke="${GOLD}" stroke-width="0.4" opacity="0.5"/>
    <text text-anchor="middle" y="-22" font-family="ui-monospace, monospace"
          font-size="9" letter-spacing="3" fill="${GOLD}">PROPERTY · HUB</text>
    <text text-anchor="middle" y="6" font-family="Georgia, serif"
          font-size="34" font-style="italic" font-weight="500" fill="${GOLD}">
      ${esc(m.code)}
    </text>
    <text text-anchor="middle" y="30" font-family="ui-monospace, monospace"
          font-size="9" letter-spacing="3" fill="${GOLD}">2026</text>
  </g>

  <!-- Bottom hairline + canonical URL -->
  <line x1="70" y1="${H - 55}" x2="${W - 70}" y2="${H - 55}"
        stroke="${GOLD}" stroke-width="0.6" opacity="0.35"/>
  <text x="70" y="${H - 28}" font-family="ui-monospace, monospace"
        font-size="11" letter-spacing="2.5" fill="#7a756a">
    NOMADASSETCOLLECTIVE.COM
  </text>
  <text x="${W - 70}" y="${H - 28}" text-anchor="end"
        font-family="ui-monospace, monospace"
        font-size="11" letter-spacing="2.5" fill="#7a756a">
    PROPERTY HUB · ${esc(m.code)}
  </text>
</svg>`;
}

async function buildOne(slug) {
  const file = path.join(COUNTRY_DIR, `${slug}.html`);
  let html;
  try { html = await fs.readFile(file, 'utf-8'); }
  catch { console.warn(`  ⚠ ${slug}: country/${slug}.html not found — skipped`); return false; }

  const model = extractModel(html, slug);
  if (!model.coastPath) {
    console.warn(`  ⚠ ${slug}: no .cl-map-coast path found — skipped`);
    return false;
  }

  const svg = buildSvg(model);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `clp-${slug}.png`);
  await fs.writeFile(outFile, png);
  console.log(`  ✓ ${slug} → og-images/clp-${slug}.png (${(png.length / 1024).toFixed(1)} KB) · ${model.pins.length} pins, ${model.cityNames.length} cities`);
  return true;
}

async function main() {
  const only = process.argv[2];
  const slugs = only
    ? [only.replace(/\.html$/, '')]
    : (await fs.readdir(COUNTRY_DIR))
        .filter(f => f.endsWith('.html') && !f.startsWith('_'))
        .map(f => f.replace(/\.html$/, ''))
        .sort();
  console.log(`Generating OG cards for ${slugs.length} CLP(s)…`);
  let ok = 0;
  for (const s of slugs) { if (await buildOne(s)) ok++; }
  console.log(`Done. ${ok}/${slugs.length} cards written to og-images/.`);
}

main().catch(err => { console.error(err); process.exit(1); });
