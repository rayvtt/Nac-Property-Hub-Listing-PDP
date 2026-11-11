// PDP <title> builder — keeps the SERP title inside Google's ~60-char display
// width (target ≤ 65). The previous formula, "Name · Tagline · NAC-ID", put the
// whole marketing tagline in the title: 119/129 PDPs ran past 70 chars
// (median 91, max 150), so Google truncated or rewrote them. The tagline still
// ships in og:title / meta description; the title carries name + place + ID.
//
// Pure (no Notion / cheerio) so it unit-tests offline: node pdp-title.test.mjs

export const TITLE_MAX = 65;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// "Limassol Del Mar — Leptos Estates, Beachfront Penthouse (Cyprus RBI)"
//   → "Limassol Del Mar"
export function shortName(name) {
  return clean(clean(name).replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s+[—–|]\s+/)[0]);
}

// Most specific place that isn't already in the name. Region/City is often
// "Punta Pacifica, Panama City" — prefer its last (city) segment.
function placeFor(name, regionCity, country) {
  const lower = name.toLowerCase();
  const segs = clean(regionCity).split(',').map(clean).filter(Boolean);
  const city = segs.length ? segs[segs.length - 1] : '';
  for (const p of [city, clean(country)]) {
    if (p && !lower.includes(p.toLowerCase())) return p;
  }
  return '';
}

export function buildPdpTitle({ nameEn, regionCity, country, idNum, tagline } = {}) {
  const full = clean(nameEn);
  if (!full) return '';
  const short = shortName(full) || full;
  const id = idNum ? `NAC-${idNum}` : '';
  const join = (...p) => p.filter(Boolean).join(' · ');

  const candidates = [];
  for (const n of [full, short]) {
    const place = placeFor(n, regionCity, country);
    candidates.push(join(n, place, id), join(n, id));
  }
  for (const c of candidates) if (c.length <= TITLE_MAX) return c;

  // Name alone is too long: cut it at a word boundary, keep the ID visible.
  const room = TITLE_MAX - (id ? id.length + 3 : 0) - 1;
  const cut = short.slice(0, room).replace(/\s+\S*$/, '').replace(/[\s,—–-]+$/, '');
  return join(cut + '…', id);
}
