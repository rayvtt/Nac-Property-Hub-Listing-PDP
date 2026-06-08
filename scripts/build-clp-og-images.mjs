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

// CLP taglines wrap a tight headline phrase in <strong>…</strong> followed by
// an em-dash and supporting copy ("<strong>Asia's golden coast</strong> —
// branded residences from JW Marriott…"). On the OG card we only want the
// punchy headline — the rest is too long for the right panel anyway. Fall
// back to the full text if no <strong> wrapper is found.
function extractHeadline(html) {
  if (!html) return '';
  const m = String(html).match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
  return stripInline(m ? m[1] : html);
}

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

// Pick the largest font size at which a single-line tagline fits inside a
// width budget. Estimates char width as `size * factor`; Cormorant Garamond
// italic averages ~0.48em per glyph. Capped at `baseSize`, floored at `minSize`
// so very long taglines stay legible (no 6pt micro-print).
function fitSingleLineFontSize(text, maxWidth, baseSize = 28, minSize = 18, charFactor = 0.48) {
  if (!text) return baseSize;
  const chars = text.length;
  const wAtBase = chars * baseSize * charFactor;
  if (wAtBase <= maxWidth) return baseSize;
  const fitted = Math.floor(maxWidth / (chars * charFactor));
  return Math.max(minSize, fitted);
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

  const taglineEn = extractHeadline($('.cl-hero-tag [data-en]').first().html() || '');
  const taglineVi = extractHeadline($('.cl-hero-tag [data-vi]').first().html() || '');

  // Pool of candidate listings (top-N by price, the order sync-notion-clp emits
  // collection cards). Grab up to 8 so buildOne can fall back to the next
  // listing if any of the first three image fetches fail — guarantees all
  // three slots populate even when 1-2 CDN images 404 or time out.
  const heroes = [];
  $('#cl-collection-track .cl-card').each((_, el) => {
    if (heroes.length >= 8) return false;
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

// Fetch a remote image and return a `data:image/...;base64,…` URI. Retries
// transient errors with simple backoff (250ms, 750ms) before giving up, since
// the CDN occasionally 502s or times out under load — that intermittent
// failure was leaving empty hero slots on the OG card.
async function fetchAsDataUri(url, attempt = 1) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      // 5xx is worth a retry; 404 isn't.
      if (res.status >= 500 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 500));
        return fetchAsDataUri(url, attempt + 1);
      }
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
      || (url.endsWith('.png') ? 'image/png' : 'image/jpeg');
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt * 500));
      return fetchAsDataUri(url, attempt + 1);
    }
    return null;
  }
}

// Walk the candidate pool, fetching each until we have N successful images.
// Skips over failed candidates instead of leaving null slots in the output.
async function fetchHeroDataUris(candidates, n) {
  const out = [];
  for (const c of candidates) {
    if (out.length >= n) break;
    const uri = await fetchAsDataUri(c.imgUrl);
    if (uri) out.push({ ...c, dataUri: uri });
  }
  return out;
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
    <!-- Force every opaque pixel of the logo to pure white while keeping its alpha
         intact — works regardless of which source PNG variant we load. -->
    <filter id="whiten" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 1
                                           0 0 0 0 1
                                           0 0 0 0 1
                                           0 0 0 1 0"/>
    </filter>
  </defs>`;

// ──────────────────────────────────────────────────────────────────────────
// Layout helpers — text panel on the right (shared by both variants)
// ──────────────────────────────────────────────────────────────────────────
function rightTextPanel(m, rightX, panelTitle = 'PROPERTY · HUB') {
  // Bilingual taglines — strictly one row per language. Auto-shrink the font
  // size if a headline is too long for the right panel width (~412px usable).
  // No wrapping, never a hanging word. Base bumped to 38pt with a 22pt floor
  // so short headlines pop big on mobile previews (cards render ~300px wide).
  const TAGLINE_W = W - rightX - 36;
  const viSize = fitSingleLineFontSize(m.taglineVi || '', TAGLINE_W, 38, 22);
  const enSize = fitSingleLineFontSize(m.taglineEn || '', TAGLINE_W, 38, 22);

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
  // Logo top-aligned with where the hero images start (y=32 PAD on the
  // heroes variant) — gives the lockup a clean horizontal baseline across
  // the whole composition.
  const LOGO_SIZE = 56;
  const logoY = 32;
  const nameY = logoY + LOGO_SIZE + 76;
  const subY = nameY + 40;

  // Tagline rows: VI first (matches the big VI country name), EN below.
  const viY = (showEnSub ? subY : nameY) + 80;
  const gapVE = Math.max(viSize, enSize) + 22;
  const enY = viY + gapVE;

  return `
  <!-- NAC logo (above country name, whitened via #whiten filter) -->
  ${nacLogo(rightX, logoY, LOGO_SIZE)}

  <!-- Country name — VI is primary -->
  <text x="${rightX}" y="${nameY}" font-family="${FF_DISPLAY}"
        font-size="86" font-style="italic" font-weight="500" fill="${GOLD}"
        letter-spacing="-1">
    ${esc(primaryName)}
  </text>

  ${showEnSub ? `
  <text x="${rightX}" y="${subY}" font-family="${FF_MONO}"
        font-size="17" letter-spacing="4" fill="${CREAM}" opacity="0.85">
    ${esc(m.nameEn.toUpperCase())}
  </text>` : ''}

  <!-- VI tagline — single line, auto-sized to fit -->
  ${m.taglineVi ? `
  <text x="${rightX}" y="${viY}" font-family="${FF_DISPLAY}"
        font-size="${viSize}" font-style="italic" fill="${CREAM}"
        letter-spacing="0.2" font-weight="500">
    ${esc(m.taglineVi)}
  </text>` : ''}

  <!-- EN tagline — single line, auto-sized to fit -->
  ${m.taglineEn ? `
  <text x="${rightX}" y="${enY}" font-family="${FF_DISPLAY}"
        font-size="${enSize}" font-style="italic" fill="${CREAM}"
        letter-spacing="0.2" opacity="0.82">
    ${esc(m.taglineEn)}
  </text>` : ''}

  <!-- Stat line + property-hub badge (bottom of right panel) -->
  ${statLine ? `
  <text x="${rightX}" y="${H - 100}" font-family="${FF_MONO}"
        font-size="20" letter-spacing="2.4" fill="${CREAM}" opacity="0.92">
    ${esc(statLine)}
  </text>` : ''}

  <text x="${rightX}" y="${H - 66}" font-family="${FF_MONO}"
        font-size="16" letter-spacing="3.5" fill="${GOLD_SOFT}" opacity="0.9">
    ${esc(panelTitle)} · ${esc(m.code)} · 2026
  </text>`;
}

// NAC logo, embedded as a data URI so resvg renders it offline. Recoloured
// to pure white via the #whiten filter so it reads cleanly over the blue bg.
// Positioned at (x, y) — left-anchored, sized 52×52 by default.
function nacLogo(x, y, size = 52) {
  if (!NAC_LOGO_DATAURI) return '';
  return `
  <image href="${NAC_LOGO_DATAURI}" x="${x}" y="${y}" width="${size}" height="${size}"
         preserveAspectRatio="xMidYMid meet" filter="url(#whiten)"/>`;
}

function commonChrome() {
  return `
  <rect width="${W}" height="${H}" fill="url(#bgFade)"/>
  <rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.5"/>

  <!-- Bottom hairline + canonical URL -->
  <line x1="40" y1="${H - 38}" x2="${W - 40}" y2="${H - 38}"
        stroke="${GOLD}" stroke-width="0.5" opacity="0.5"/>
  <text x="40" y="${H - 14}" font-family="${FF_MONO}"
        font-size="14" letter-spacing="2.5" fill="${CREAM}" opacity="0.8">
    NOMADASSETCOLLECTIVE.COM
  </text>
  <text x="${W - 40}" y="${H - 14}" text-anchor="end"
        font-family="${FF_MONO}"
        font-size="14" letter-spacing="2.5" fill="${CREAM}" opacity="0.8">
    PROPERTY HUB
  </text>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Variant A: Three Heroes — top-3 listing images, left 60% / text right 40%
// ──────────────────────────────────────────────────────────────────────────
function buildHeroesSvg(m, heroDataUris) {
  // Left panel (60% width) — N vertical cards where N is the number of
  // resolved heroes (1, 2, or 3). The card width stays constant at the
  // 3-column size so the visual rhythm matches across all variants — when
  // there are fewer cards, the group gets centred in the panel instead.
  const PAD = 32, GUTTER = 14;
  const PANEL_X = 0, PANEL_W = 720;
  const COL_W = (PANEL_W - 2 * PAD - 2 * GUTTER) / 3;
  const COL_Y = PAD;
  const COL_H = H - 2 * PAD;
  const RADIUS = 14;
  const N = heroDataUris.length;
  const totalCardsW = N * COL_W + Math.max(0, N - 1) * GUTTER;
  const startX = PANEL_X + (PANEL_W - totalCardsW) / 2;

  const cards = heroDataUris.map((dataUri, i) => {
    const x = startX + i * (COL_W + GUTTER);
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

  <!-- RIGHT PANEL — text (logo + name + tagline + stats) -->
  ${rightTextPanel(m, 752)}
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

  ${rightTextPanel(m, 752)}
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
    // Walk the candidate pool (up to 8 from extractModel), keeping every
    // successful fetch up to a cap. Cap is min(3, listings count) — countries
    // with 1 or 2 Live listings get 1 or 2 cards instead of dark placeholder
    // tiles. The buildHeroesSvg layout centres whatever it's handed.
    const target = Math.min(3, model.heroes.length);
    const resolved = await fetchHeroDataUris(model.heroes, target);
    if (resolved.length > 0) {
      const heroModel = { ...model, heroes: resolved };
      svg = buildHeroesSvg(heroModel, resolved.map(r => r.dataUri));
      variant = `heroes (${resolved.length}/${target}, ${model.heroes.length} candidates)`;
    } else {
      svg = buildAtlasSvg(model);
      variant = `atlas (all ${model.heroes.length} candidates failed)`;
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
