#!/usr/bin/env node
// One-shot WP brand setup (P0-C, 2026-07): give Google a real favicon + logo.
//
//  1. Fetches the NAC wordmark (Logo.png, 426×410, currently hosted on the blog)
//  2. Renders a 512×512 site icon from it (centered on a solid white square via
//     @resvg/resvg-js — Google requires a square ≥48px favicon; WP wants ≥512)
//  3. Uploads both to the MAIN site's media library (idempotent: reuses any
//     existing attachment with the same slug instead of duplicating)
//  4. Sets the WP Site Icon via POST /wp-json/wp/v2/settings { site_icon }
//  5. Prints the hosted URLs — Organization.logo in the homepage/hub JSON-LD
//     should point at the re-hosted wordmark URL this prints.
//
// Env: WP_APP_PASSWORD (required), WP_USER (default admin_web),
//      WP_BASE_URL (default https://nomadassetcollective.com),
//      LOGO_SOURCE_URL (default the blog's Logo.png).
// Rank Math Knowledge-Graph + Google Business Profile still need the WP-admin
// click-path (no REST surface) — see SEO-GEO-GOAL-HANDOFF.md §P0-C.

import { Resvg } from '@resvg/resvg-js';

const WP_BASE = (process.env.WP_BASE_URL || 'https://nomadassetcollective.com').replace(/\/$/, '');
const WP_API = `${WP_BASE}/wp-json/wp/v2`;
const WP_USER = process.env.WP_USER || 'admin_web';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const LOGO_SOURCE_URL = process.env.LOGO_SOURCE_URL
  || 'https://blog.nomadassetcollective.com/wp-content/uploads/2026/05/Logo.png';
const ICON_SIZE = 512;

if (!WP_APP_PASSWORD) { console.error('✗ WP_APP_PASSWORD missing'); process.exit(1); }
const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Imunify360 on the WP host intermittently 403s GitHub runner IPs (same
// bot-gate sync-wp.mjs works around) — retry everything with backoff. All
// calls here are idempotent-by-design (search-first media reuse), so retrying
// POSTs is safe.
async function wp(pathname, { method = 'GET', headers = {}, body } = {}) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try {
      res = await fetch(`${WP_API}${pathname}`, {
        method,
        headers: { Authorization: AUTH, Accept: 'application/json', 'User-Agent': 'NAC-Brand-Setup/1.0', ...headers },
        body,
      });
    } catch (err) {
      last = err.message;
      if (attempt < 5) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      throw new Error(`${method} ${pathname} network failure: ${last}`);
    }
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      last = `HTTP ${res.status}`;
      if (attempt < 5) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
    }
    if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  throw new Error(`${method} ${pathname} failed after 5 attempts (${last})`);
}

// Find an existing attachment by slug (idempotent re-runs) or upload a new one.
async function uploadMedia(filename, buf, title) {
  const slug = filename.replace(/\.[a-z]+$/i, '');
  const existing = await wp(`/media?slug=${encodeURIComponent(slug)}&per_page=5`);
  if (Array.isArray(existing) && existing.length) {
    const m = existing[0];
    console.log(`  ↩ reusing existing media #${m.id}: ${m.source_url}`);
    return m;
  }
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/png' }), filename);
  form.append('title', title);
  form.append('alt_text', title);
  const m = await wp('/media', { method: 'POST', body: form });
  console.log(`  ✓ uploaded media #${m.id}: ${m.source_url}`);
  return m;
}

async function main() {
  console.log(`WP brand setup → ${WP_BASE} as ${WP_USER}`);

  console.log(`1) fetching wordmark: ${LOGO_SOURCE_URL}`);
  const srcRes = await fetch(LOGO_SOURCE_URL, { headers: { 'User-Agent': 'NAC-Brand-Setup/1.0' } });
  if (!srcRes.ok) throw new Error(`logo fetch → ${srcRes.status}`);
  const logoBuf = Buffer.from(await srcRes.arrayBuffer());
  console.log(`   ${logoBuf.length} bytes`);

  console.log(`2) rendering ${ICON_SIZE}×${ICON_SIZE} site icon (white square, centered wordmark)`);
  // Slight inset so the ring of stars isn't flush against the tile edge.
  const inset = Math.round(ICON_SIZE * 0.06);
  const box = ICON_SIZE - inset * 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}">`,
    `<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="#ffffff"/>`,
    `<image x="${inset}" y="${inset}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${logoBuf.toString('base64')}"/>`,
    `</svg>`,
  ].join('');
  const iconBuf = new Resvg(svg, { fitTo: { mode: 'width', value: ICON_SIZE } }).render().asPng();
  console.log(`   ${iconBuf.length} bytes`);

  console.log('3) uploading to media library');
  const logoMedia = await uploadMedia('nac-logo-wordmark.png', logoBuf, 'Nomad Asset Collective — logo wordmark');
  const iconMedia = await uploadMedia(`nac-site-icon-${ICON_SIZE}.png`, iconBuf, 'Nomad Asset Collective — site icon');

  console.log('4) setting Site Icon via /wp/v2/settings');
  const settings = await wp('/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_icon: iconMedia.id }),
  });
  if (settings.site_icon === iconMedia.id) {
    console.log(`   ✓ site_icon = ${iconMedia.id}`);
  } else {
    console.warn(`   ⚠ settings responded with site_icon=${settings.site_icon} (expected ${iconMedia.id}).`);
    console.warn('     If unset, this WP may not expose site_icon over REST — set it manually:');
    console.warn('     WP Admin → Appearance → Customize → Site Identity → Site Icon → pick the uploaded 512px icon.');
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('RESULT (use these URLs):');
  console.log(`  Organization.logo (wordmark): ${logoMedia.source_url}`);
  console.log(`  Site icon (512):              ${iconMedia.source_url}`);
  console.log('──────────────────────────────────────────────');
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
