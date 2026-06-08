#!/usr/bin/env node
/**
 * build-clp-og-images.mjs — generate a bespoke 1200×630 social-share card per CLP.
 *
 * "Three Heroes" layout (v2):
 *   ┌──────────┬──────────┬──────────┬─────────────────┐
 *   │          │          │          │  NAC wordmark   │
 *   │  hero 1  │  hero 2  │  hero 3  │  Country name   │
 *   │  (top 3  │  (price- │  (sorted)│  Tagline        │
 *   │  listings│   sorted │          │  Stats          │
 *   │   in CLP)│          │          │  PROPERTY · CODE│
 *   └──────────┴──────────┴──────────┴─────────────────┘
 *      60% width (3 vertical cards on left)              40% width (text on right)
 *
 * Hero URLs are extracted from `style="background-image:url('…')"` on the
 * `.cl-card-img` divs in the CLP HTML. Each remote image is fetched, encoded
 * as a base64 data URI, and embedded into the SVG so resvg can rasterise it
 * without network access at render time.
 *
 * Fallback: when a CLP has 0 listings (typical for newly-launched countries
 * or while a Notion-bug regression is in flight), the script falls back to
 * the v1 "Constellation Atlas" — country silhouette + city pins — so the
 * card still renders something meaningful.
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
const FONT_DIR = path.join(__dirname, 'fonts');

// CLP typography (matches country/_template-clp.html CSS vars). Vendored TTFs
// in scripts/fonts/ so resvg can render them in CI without network access.
const FF_DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const FF_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const W = 1200, H = 630;
// NAC brand palette (matches country/_template-clp.html CSS variables)
const GOLD = '#C4922C';      // --gold
const GOLD_SOFT = '#E8BF72'; // lighter gold accent
const GOLD_GLOW = '#F4E4BF'; // --gold-soft
const CREAM = '#FAFAF7';
const NAVY = '#1800ad';      // NAC blue (--nav)
const NAVY_DEEP = '#0c0066'; // deeper variant for the gradient

// NAC wordmark / logo on the dark theme — fetched once, embedded into every SVG.
const NAC_LOGO_URL = 'https://nomadassetcollective.com/wp-content/uploads/2026/05/OTG-Passport-Icons-4.png';
let NAC_LOGO_DATAURI = null;

const COUNTRY_CODE_FROM_SLUG = {
  ae: 'AE', au: 'AU', cy: 'CY', gr: 'GR', my: 'MY', pa: 'PA',
  sg: 'SG', th: 'TH', tr: 'TR', uk: 'UK', vn: 'VN',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const stripInline = (s) => String(s ?? '')
  .replace(/<\/?(?:strong|em|b|i)\b[^>]*>/gi, '')
  .replace(/\s+/g, ' ').trim();

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Pull a background-image URL out of a `style="background-image:url('…')"` blob.
function extractBgUrl(styleAttr) {
  if (!styleAttr) return '';
  const m = styleAttr.match(/background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i);
  return m ? m[1] : '';
}

function extractModel(html, slug) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const code = COUNTRY_CODE_FROM_SLUG[slug] || slug.toUpperCase();

  const nameVi = $('.cl-name [data-vi]').first().text().trim()
    || $('.cl-hero-name [data-vi]').first().text().trim();
  const nameEn = $('.cl-name [data-en]').first().text().trim()
    || $('.cl-hero-name [data-en]').first().text().trim()
    || ($('title').text().split('·')[0] || '').trim();

  const taglineEn = stripInline($('.cl-hero-tag [data-en]').first().html() || '');
  const taglineVi = stripInline($('.cl-hero-tag [data-vi]').first().html() || '');

  // Top-N listings — collection cards are emitted by sync-notion-clp in
  // price-descending order, so just grab the first three.
  const heroes = [];
  $('#cl-collection-track .cl-card').each((_, el) => {
    if (heroes.length >= 3) return false;
    const $card = $(el);
    const imgUrl = extractBgUrl($card.find('.cl-card-img').attr('style'))
      || extractBgUrl($card.find('.cl-card-img-wrap').attr('style'));
    const cityName = $card.find('.cl-card-chip.city').first().text().trim();
    if (imgUrl) heroes.push({ imgUrl, cityName });
  });

  // Fallback atlas data for the empty case.
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

  const plaqueVals = $('.cl-plaque .cl-plaque-row-val')
    .map((_, el) => $(el).text().trim()).get();

  return {
    slug, code, nameVi, nameEn, taglineEn, taglineVi,
    heroes,
    viewBox, coastPath, pins, cityNames,
    listings: plaqueVals[0] || '',
    cities: plaqueVals[1] || '',
    entry: plaqueVals[2] || '',
  };
}

// Fetch a remote image and return a `data:image/...;base64,…` URI.
// Returns null on failure (network / 404 / non-image) so the caller can fall
// back gracefully without aborting the whole batch.
async function fetchAsDataUri(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
      || (url.endsWith('.png') ? 'image/png' : 'image/jpeg');
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const COMMON_DEFS = `
  <defs>
    <linearGradient id="bgFade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${NAVY}"/>
      <stop offset="100%" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
    <pattern id="grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="3" fill="${NAVY}"/>
      <circle cx="1" cy="1" r="0.4" fill="#ffffff" opacity="0.03"/>
    </pattern>
    <linearGradient id="cardVeil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="65%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="${NAVY_DEEP}" stop-opacity="0.82"/>
    </linearGradient>
    <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="${GOLD}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pinHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <!-- Soft gaussian blur used by the watermark atlas behind the right panel -->
    <filter id="atlasBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>`;

// ──────────────────────────────────────────────────────────────────────────
// Layout helpers — text panel on the right (shared by both variants)
// ──────────────────────────────────────────────────────────────────────────
function rightTextPanel(m, rightX, panelTitle = 'PROPERTY · HUB') {
  // Bilingual taglines — one row per language. Caps each at 2 wrapped lines
  // so the right panel doesn't run out of vertical room.
  const viLines = wrapText(m.taglineVi || '', 32).slice(0, 2);
  const enLines = wrapText(m.taglineEn || '', 32).slice(0, 2);

  const statParts = [];
  if (m.listings) statParts.push(`${m.listings} ${m.listings === '1' ? 'listing' : 'listings'}`);
  if (m.cities)   statParts.push(`${m.cities} ${m.cities === '1' ? 'city' : 'cities'}`);
  if (m.entry)    statParts.push(`from ${m.entry.replace(/\s+/g, '')}`);
  const statLine = statParts.join('  ·  ');

  // VI as primary display name (Georgia italic, NAC gold, 74pt). EN subtitle
  // below for global readability. Show the EN subtitle only when it differs
  // from the VI name (e.g. "Singapore" / "Singapore" → suppress).
  const showEnSub = m.nameEn && m.nameEn.toLowerCase() !== (m.nameVi || '').toLowerCase();
  const primaryName = m.nameVi || m.nameEn;
  const nameY = 200;
  const subY = nameY + 36;

  // Tagline blocks: VI first (matches the big VI country name), EN below.
  const viY = (showEnSub ? subY : nameY) + 48;
  const lineH = 30;
  const viBlockH = viLines.length * lineH;
  const enY = viY + viBlockH + 22;

  return `
  <!-- Country name — VI is primary -->
  <text x="${rightX}" y="${nameY}" font-family="${FF_DISPLAY}"
        font-size="74" font-style="italic" font-weight="500" fill="${GOLD}"
        letter-spacing="-1">
    ${esc(primaryName)}
  </text>

  ${showEnSub ? `
  <text x="${rightX}" y="${subY}" font-family="${FF_MONO}"
        font-size="11" letter-spacing="4" fill="${GOLD_SOFT}" opacity="0.7">
    ${esc(m.nameEn.toUpperCase())}
  </text>` : ''}

  <!-- VI tagline -->
  ${viLines.map((line, i) => `
  <text x="${rightX}" y="${viY + i * lineH}" font-family="${FF_DISPLAY}"
        font-size="20" font-style="italic" fill="${CREAM}"
        letter-spacing="0.2">
    ${esc(line)}
  </text>`).join('')}

  <!-- EN tagline (muted, sits below VI) -->
  ${enLines.map((line, i) => `
  <text x="${rightX}" y="${enY + i * lineH}" font-family="${FF_DISPLAY}"
        font-size="20" font-style="italic" fill="${GOLD_SOFT}"
        letter-spacing="0.2" opacity="0.78">
    ${esc(line)}
  </text>`).join('')}

  <!-- Stat line + property-hub badge (bottom of right panel) -->
  ${statLine ? `
  <text x="${rightX}" y="${H - 96}" font-family="${FF_MONO}"
        font-size="13" letter-spacing="2.4" fill="${GOLD_SOFT}">
    ${esc(statLine)}
  </text>` : ''}

  <text x="${rightX}" y="${H - 64}" font-family="${FF_MONO}"
        font-size="11" letter-spacing="3.5" fill="${GOLD_SOFT}" opacity="0.55">
    ${esc(panelTitle)} · ${esc(m.code)} · 2026
  </text>`;
}

// Blurred country silhouette sitting BEHIND the right text panel. Sized to
// fit within the right 40% of the canvas, low opacity, gold tint. No-op when
// the CLP has no atlas path (cleanly degrades).
function rightPanelAtlasBackdrop(m) {
  if (!m.coastPath || !m.viewBox) return '';
  const [vbx, vby, vbw, vbh] = m.viewBox.split(/\s+/).map(Number);
  // Right panel spans x=720 to x=1200. Fit a 380×380 box centred at x=960.
  const BOX = 380;
  const scale = Math.min(BOX / vbw, BOX / vbh);
  const innerW = vbw * scale;
  const innerH = vbh * scale;
  const x = 960 - innerW / 2;
  const y = H / 2 - innerH / 2;
  return `
  <g filter="url(#atlasBlur)" opacity="0.16">
    <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(4)})">
      <path d="${esc(m.coastPath)}" fill="${GOLD}"/>
    </g>
  </g>`;
}

// Top-left NAC logo, embedded as a data URI so resvg renders it without a
// network round-trip. Empty string if the logo wasn't reachable.
function topLeftLogo() {
  if (!NAC_LOGO_DATAURI) return '';
  const SIZE = 56;
  const X = 36, Y = 30;
  return `
  <image href="${NAC_LOGO_DATAURI}" x="${X}" y="${Y}" width="${SIZE}" height="${SIZE}"
         preserveAspectRatio="xMidYMid meet"/>`;
}

function commonChrome() {
  return `
  <rect width="${W}" height="${H}" fill="url(#bgFade)"/>
  <rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.5"/>

  <!-- Bottom hairline + canonical URL -->
  <line x1="40" y1="${H - 34}" x2="${W - 40}" y2="${H - 34}"
        stroke="${GOLD}" stroke-width="0.5" opacity="0.3"/>
  <text x="40" y="${H - 14}" font-family="${FF_MONO}"
        font-size="10" letter-spacing="2.5" fill="${GOLD_SOFT}" opacity="0.55">
    NOMADASSETCOLLECTIVE.COM
  </text>
  <text x="${W - 40}" y="${H - 14}" text-anchor="end"
        font-family="${FF_MONO}"
        font-size="10" letter-spacing="2.5" fill="${GOLD_SOFT}" opacity="0.55">
    PROPERTY HUB
  </text>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Variant A: Three Heroes — top-3 listing images, left 60% / text right 40%
// ──────────────────────────────────────────────────────────────────────────
function buildHeroesSvg(m, heroDataUris) {
  // Left panel (60% width) — 3 vertical cards.
  const PAD = 32, GUTTER = 14;
  const PANEL_X = 0, PANEL_W = 720;
  const COL_W = (PANEL_W - 2 * PAD - 2 * GUTTER) / 3;
  const COL_Y = PAD;
  const COL_H = H - 2 * PAD;
  const RADIUS = 14;

  const cards = heroDataUris.map((dataUri, i) => {
    const x = PANEL_X + PAD + i * (COL_W + GUTTER);
    const hero = m.heroes[i] || {};
    const city = (hero.cityName || '').toUpperCase();

    return `
    <!-- card ${i + 1} -->
    <clipPath id="cardClip${i}">
      <rect x="${x.toFixed(1)}" y="${COL_Y}" width="${COL_W.toFixed(1)}" height="${COL_H}" rx="${RADIUS}" ry="${RADIUS}"/>
    </clipPath>
    <g clip-path="url(#cardClip${i})">
      ${dataUri
        ? `<image href="${dataUri}" x="${x.toFixed(1)}" y="${COL_Y}" width="${COL_W.toFixed(1)}" height="${COL_H}" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect x="${x.toFixed(1)}" y="${COL_Y}" width="${COL_W.toFixed(1)}" height="${COL_H}" fill="#1a1a1a"/>`}
      <!-- gradient veil for label legibility -->
      <rect x="${x.toFixed(1)}" y="${COL_Y}" width="${COL_W.toFixed(1)}" height="${COL_H}" fill="url(#cardVeil)"/>
    </g>
    <!-- gold border on top of the image -->
    <rect x="${x.toFixed(1)}" y="${COL_Y}" width="${COL_W.toFixed(1)}" height="${COL_H}"
          rx="${RADIUS}" ry="${RADIUS}" fill="none"
          stroke="${GOLD}" stroke-width="0.8" opacity="0.42"/>
    ${city ? `
    <text x="${(x + COL_W / 2).toFixed(1)}" y="${COL_Y + COL_H - 28}"
          text-anchor="middle"
          font-family="${FF_MONO}" font-size="13"
          letter-spacing="3" fill="${GOLD}" font-weight="500">
      ${esc(city)}
    </text>
    <text x="${(x + COL_W / 2).toFixed(1)}" y="${COL_Y + COL_H - 50}"
          text-anchor="middle"
          font-family="${FF_MONO}" font-size="9"
          letter-spacing="3" fill="#a89c83" opacity="0.85">
      №${String(i + 1).padStart(2, '0')}
    </text>` : ''}`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${COMMON_DEFS}
  ${commonChrome()}

  <!-- LEFT PANEL — three hero cards (60%) -->
  ${cards}

  <!-- vertical hairline divider -->
  <line x1="720" y1="60" x2="720" y2="${H - 60}"
        stroke="${GOLD}" stroke-width="0.5" opacity="0.32"/>

  <!-- Blurred atlas backdrop underneath the right text panel -->
  ${rightPanelAtlasBackdrop(m)}

  <!-- RIGHT PANEL — text (40%) -->
  ${rightTextPanel(m, 752)}

  <!-- NAC logo (top-left of canvas, sits over the leftmost hero) -->
  ${topLeftLogo()}
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Variant B: Constellation Atlas — empty-listings fallback
// ──────────────────────────────────────────────────────────────────────────
function buildAtlasSvg(m) {
  const [vbx, vby, vbw, vbh] = m.viewBox.split(/\s+/).map(Number);
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

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${COMMON_DEFS}
  ${commonChrome()}

  <ellipse cx="${(ATLAS_X + atlasInnerW / 2).toFixed(1)}"
           cy="${(ATLAS_Y + atlasInnerH / 2).toFixed(1)}"
           rx="320" ry="320" fill="url(#goldGlow)"/>
  ${m.coastPath ? `
  <g transform="translate(${ATLAS_X.toFixed(1)} ${ATLAS_Y.toFixed(1)}) scale(${scale.toFixed(4)})">
    <path d="${esc(m.coastPath)}" fill="${GOLD}" opacity="0.92"
          stroke="${GOLD_SOFT}" stroke-width="0.5"/>
  </g>` : ''}
  ${pinDots}

  <line x1="720" y1="60" x2="720" y2="${H - 60}"
        stroke="${GOLD}" stroke-width="0.5" opacity="0.32"/>

  <!-- Blurred atlas backdrop underneath the right text panel -->
  ${rightPanelAtlasBackdrop(m)}

  ${rightTextPanel(m, 752)}

  <!-- NAC logo (top-left of canvas) -->
  ${topLeftLogo()}
</svg>`;
}

async function buildOne(slug) {
  const file = path.join(COUNTRY_DIR, `${slug}.html`);
  let html;
  try { html = await fs.readFile(file, 'utf-8'); }
  catch { console.warn(`  ⚠ ${slug}: country/${slug}.html not found — skipped`); return false; }

  const model = extractModel(html, slug);

  // Pick a render path based on what data we actually have.
  let svg, variant;
  if (model.heroes.length > 0) {
    const dataUris = await Promise.all(model.heroes.map(h => fetchAsDataUri(h.imgUrl)));
    const ok = dataUris.filter(Boolean).length;
    if (ok > 0) {
      // Pad to 3 (with nulls) so layout is consistent if a fetch failed.
      while (dataUris.length < 3) dataUris.push(null);
      svg = buildHeroesSvg(model, dataUris);
      variant = `heroes (${ok}/${model.heroes.length})`;
    } else {
      svg = buildAtlasSvg(model);
      variant = 'atlas (all fetches failed)';
    }
  } else if (model.coastPath) {
    svg = buildAtlasSvg(model);
    variant = 'atlas (0 listings)';
  } else {
    console.warn(`  ⚠ ${slug}: no listings + no atlas path — skipped`);
    return false;
  }

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: {
      // Vendored Cormorant Garamond + JetBrains Mono — matches CLP CSS vars
      // and renders deterministically in CI (no Google Fonts at runtime).
      fontDirs: [FONT_DIR],
      defaultFontFamily: 'Cormorant Garamond',
      loadSystemFonts: true, // fall through for emoji + Vietnamese diacritics if needed
    },
  });
  const png = resvg.render().asPng();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `clp-${slug}.png`);
  await fs.writeFile(outFile, png);
  console.log(`  ✓ ${slug} → og-images/clp-${slug}.png (${(png.length / 1024).toFixed(1)} KB) · ${variant}`);
  return true;
}

async function main() {
  // Fetch the NAC wordmark/logo once and embed into every card. Falls back
  // silently if the WP CDN is unreachable so the rest of the batch still ships.
  NAC_LOGO_DATAURI = await fetchAsDataUri(NAC_LOGO_URL);
  if (!NAC_LOGO_DATAURI) console.warn(`  ⚠ NAC logo fetch failed (${NAC_LOGO_URL}) — cards will render without it`);

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
