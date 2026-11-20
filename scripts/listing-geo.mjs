// listing-geo.mjs — one verified map point per Live listing.
//
// Writes assets/listing-geo.json (served by GitHub Pages), which the Property
// Hub's world map and Leaflet map read, keyed by Property ID number (= the hub
// feed's `id`). The PDP's own JSON-LD `geo` uses the same points.
//
// Source of truth: scripts/geo-overrides.json, hand-verified on 2026-11-20
// (OSM project features, developer-stated sites, suburb centroids). Each entry
// carries a precision:
//   site — the project itself (OSM feature, street address, developer site)
//   area — the suburb / district the project sits in
//   city — city-level only (Notion has no district yet)
// A new Live listing with no override is geocoded automatically, district
// first ([district, Region/City, country] → [Region/City, country]), never by
// project name: short names like "Aura" or "640" match the wrong building. The
// point must fall within a known metro's radius, otherwise it becomes its own
// city-level metro. Auto entries are marked `auto: true`; promote them into
// geo-overrides.json once checked.
//
// Pure apart from the optional Nominatim call (cached in geocode-cache.json).

import fs from 'node:fs/promises';

const UA = 'NAC-PDP-Geocoder/1.0 (+https://nomadassetcollective.com)';

export async function loadGeoOverrides(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf-8')); }
  catch { return { metros: {}, listings: {} }; }
}

const idNum = (prop) => (prop.propertyId || '').replace(/^NAC-/, '');

// Verified point for a property, or null when it has no override yet.
export function overrideGeo(ov, prop) {
  const g = ov.listings[idNum(prop)];
  return g ? { lat: g.lat, lng: g.lng } : null;
}

function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

async function nominatim(q, cache, delayMs) {
  const key = 'district-first|' + q;
  if (key in cache) return cache[key];
  let hit = null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const arr = await res.json();
      if (arr[0]?.lat) hit = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
    }
  } catch { /* network failure → null, retried next run */ return null; }
  cache[key] = hit;
  await new Promise((r) => setTimeout(r, delayMs));
  return hit;
}

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function buildListingGeo(properties, ov, { cache = {}, delayMs = 1100, geocode = true } = {}) {
  const metros = JSON.parse(JSON.stringify(ov.metros));
  const listings = {};
  for (const [id, g] of Object.entries(ov.listings)) {
    listings[id] = { slug: g.slug || null, lat: g.lat, lng: g.lng, metro: g.metro, area: g.area, prec: g.prec };
  }
  for (const prop of properties) {
    const id = idNum(prop);
    if (!id || listings[id]) continue;
    if (!geocode) continue;
    const country = prop.country === 'Việt Nam' ? 'Vietnam' : prop.country;
    const queries = [
      [prop.district, prop.regionCity, country],
      [prop.regionCity, country],
    ].map((p) => p.filter(Boolean).join(', ')).filter(Boolean);
    let pt = null, prec = 'area';
    for (const q of queries) {
      pt = await nominatim(q, cache, delayMs);
      if (pt) break;
      prec = 'city';
    }
    if (!pt) { console.warn(`  ⚠ listing-geo: no point for NAC-${id} (${prop.slug})`); continue; }
    let best = null, bestKm = Infinity;
    for (const [k, m] of Object.entries(metros)) {
      const d = km(pt, m);
      if (d <= m.maxKm && d < bestKm) { best = k; bestKm = d; }
    }
    if (!best) {
      const city = (prop.regionCity || '').split(',').pop().trim() || prop.country || 'city';
      best = slugify(city) || `metro-${id}`;
      if (!metros[best]) metros[best] = { vi: city, en: city, lat: pt.lat, lng: pt.lng, maxKm: 40 };
    }
    const area = (prop.district || prop.regionCity || '').split(/[,·]/)[0].trim();
    listings[id] = { slug: prop.slug || null, lat: +pt.lat.toFixed(5), lng: +pt.lng.toFixed(5), metro: best, area, prec, auto: true };
    console.log(`  ↳ listing-geo: auto-placed NAC-${id} (${prop.slug}) in ${best} [${prec}] — verify and add to geo-overrides.json`);
  }
  const outMetros = {};
  for (const k of Object.keys(metros).sort()) { const { vi, en, lat, lng } = metros[k]; outMetros[k] = { vi, en, lat, lng }; }
  const outListings = {};
  for (const k of Object.keys(listings).sort((a, b) => a - b)) outListings[k] = listings[k];
  return {
    v: 1,
    note: 'Map points for the Property Hub, keyed by Property ID. prec: site = the project itself, area = its suburb/district, city = city only. Built by scripts/listing-geo.mjs from scripts/geo-overrides.json.',
    metros: outMetros,
    listings: outListings,
  };
}
