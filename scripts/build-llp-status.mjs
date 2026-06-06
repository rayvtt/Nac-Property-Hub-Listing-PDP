#!/usr/bin/env node
/**
 * build-llp-status.mjs — LLP Completeness Dashboard generator.
 *
 * Scans every properties/<slug>.html and AUTO-DERIVES a 9-dimension
 * personalisation status per listing, then injects the data block into
 * listing-status.html (human view) and writes listing-status.json (machine
 * view, so the agent can read current state in-repo).
 *
 * "Auto-ticks": status is computed from what actually shipped in the HTML, so
 * when sync-notion patches real content into a listing (or a banded cluster is
 * de-banded), the next build flips the affected cells with zero manual edits.
 *
 * Dimensions: id · fin · nac · edit · json · cine · img · geo · qa
 * Statuses:   done (bespoke/complete) · band (generic/duplicated/partial) ·
 *             block (missing/broken/placeholder) · draft / na (override-only)
 *
 * De-banding: financial / score / editorial / cine fingerprints are hashed
 * across all listings; a fingerprint SHARED by >1 listing marks those cells
 * `band` (with the cluster size), a UNIQUE fingerprint marks `done`.
 *
 * Human-only calls (QA viability, known-broken, "drafted in LLP-GENERATION.md")
 * live in scripts/llp-status-overrides.json and always win over the auto value.
 *
 * Usage:  node scripts/build-llp-status.mjs            (from repo root or scripts/)
 *         node scripts/build-llp-status.mjs --check     (exit 1 if HTML would change)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROP_DIR = path.join(ROOT, 'properties');
const HTML_OUT = path.join(ROOT, 'listing-status.html');
const JSON_OUT = path.join(ROOT, 'listing-status.json');
const OVERRIDES = path.join(__dirname, 'llp-status-overrides.json');

const IMG_HASH = 'qse3Pw84PrZ2S0PQOTtixw';
const DIMS = ['id', 'fin', 'nac', 'edit', 'json', 'cine', 'img', 'geo', 'ovw', 'qa'];

// ---- country normalisation -------------------------------------------------
const COUNTRY = {
  AU: { name: 'Australia', flag: '🇦🇺' }, AUSTRALIA: 'AU',
  GR: { name: 'Greece', flag: '🇬🇷' }, GREECE: 'GR',
  TR: { name: 'Türkiye', flag: '🇹🇷' }, TURKEY: 'TR', TURKIYE: 'TR',
  GB: { name: 'United Kingdom', flag: '🇬🇧' }, UK: 'GB', 'UNITED KINGDOM': 'GB',
  VN: { name: 'Vietnam', flag: '🇻🇳' }, VIETNAM: 'VN',
  CY: { name: 'Cyprus', flag: '🇨🇾' }, CYPRUS: 'CY',
  PA: { name: 'Panama', flag: '🇵🇦' }, PANAMA: 'PA',
};
function normCountry(raw) {
  if (!raw || raw.includes('{')) return { code: 'XX', name: 'Unknown', flag: '🏳️' };
  let key = raw.trim().toUpperCase();
  if (typeof COUNTRY[key] === 'string') key = COUNTRY[key];
  const c = COUNTRY[key];
  return c && c.name ? { code: key, ...c } : { code: 'XX', name: raw.trim(), flag: '🏳️' };
}
// listing order: biggest portfolios first
const COUNTRY_ORDER = ['AU', 'GR', 'TR', 'GB', 'VN', 'CY', 'PA', 'XX'];

// ---- extraction helpers ----------------------------------------------------
const decode = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function extract(html, slug) {
  const g = (re) => { const m = html.match(re); return m ? decode(m[1]) : ''; };
  const f = {};
  f.slug = slug;
  f.name = g(/data-notion="property_name_en"[^>]*>([^<]*)/) ||
           g(/<title>([^<|—]+)/) || slug;
  f.country = normCountry(g(/"addressCountry":\s*"([^"]*)"/) || g(/data-notion="country"[^>]*>([^<]*)/));
  const district = g(/data-notion="district"[^>]*>([^<]*)/);
  f.region = (district.split(',')[0] || '').trim() || f.country.name;
  f.district = district;

  // financials
  f.price = g(/data-notion-roi[^>]*data-price="([^"]*)"/) || g(/data-notion="price_short"[^>]*>([^<]*)/);
  f.yield = g(/data-notion="yield_pct">([^<]*)/) || g(/data-notion-roi[^>]*data-yield="([^"]*)"/);
  f.irr = g(/data-notion="irr_pct">([^<]*)/);
  f.coc = g(/data-notion="coc_pct">([^<]*)/);
  f.payback = g(/data-notion="payback"[^>]*>([^<]*)/);

  // score + sub-scores (donut count-to values)
  f.score = g(/data-notion="nac_score">([^<]*)/);
  f.subs = (html.match(/data-count-to="([0-9.]+)"/g) || []).join(',');

  // editorial
  f.tagline = g(/data-notion="tagline_en"[^>]*>([^<]*)/);
  f.desc = g(/data-notion="desc_en"[^>]*>([^<]*)/);
  f.nacNote = g(/data-notion="nac_note_en"[^>]*>([^<]*)/);

  // cine titles (English clause of each .nac-cine-h)
  const cine = [...html.matchAll(/nac-cine-h"><span data-vi="[^"]*">[^<]*<\/span><span data-en="[^"]*">([^<]*)<\/span>/g)]
    .map((m) => decode(m[1]));
  f.cine = cine;

  // list completeness — empty container renders as `>` then `</div>`
  const listFull = (k) => new RegExp(`data-notion-list="${k}">\\s*<div`).test(html);
  f.lists = { pros: listFull('pros'), cons: listFull('cons'), features: listFull('features') };

  // images
  const real = (u) => !!u && !u.includes('{') && (u.includes('imagedelivery.net') || u.includes('/wp-content/'));
  f.hero = g(/class="nac-hero-img"[^>]*background-image:url\(['"]?([^'")]+)/);
  const gal = ['gallery_1', 'gallery_2', 'gallery_3']
    .map((k) => g(new RegExp(`data-notion-bg="${k}"[^>]*background-image:url\\(['"]?([^'")]+)`)));
  f.heroReal = real(f.hero);
  f.galReal = gal.filter(real).length;
  // thumb token for dashboard: CF image id, or @full-url for non-CF
  if (f.hero && f.hero.includes('imagedelivery.net')) {
    const m = f.hero.match(/imagedelivery\.net\/[^/]+\/([^/]+)\//);
    f.thumb = m ? m[1] : '@' + f.hero;
  } else f.thumb = f.hero ? '@' + f.hero : '';

  // §01 overview facts (Location / Ownership / Residency / Completion) — these
  // bind to region_city, ownership_en, residency, handover_en. Track how many
  // of the four render non-empty.
  f.ovwFacts = [
    g(/data-notion="region_city"[^>]*>([^<]*)/),
    g(/data-notion="ownership_en"[^>]*>([^<]*)/),
    g(/data-notion="residency"[^>]*>([^<]*)/),
    g(/data-notion="handover_en"[^>]*>([^<]*)/),
  ].filter((v) => v && !String(v).includes('{')).length;

  // geo / structured data
  f.lat = g(/"latitude":\s*"?([^",}]+)/);
  const ldBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  f.ldTokens = ldBlocks.join('').match(/\{[a-z][a-z _0-9-]*\}/gi)?.length || 0;

  return f;
}

// ---- fingerprints + clusters ----------------------------------------------
function buildClusters(rows) {
  const fp = { fin: {}, nac: {}, edit: {}, cine: {} };
  const key = {
    fin: (f) => (f.price && f.irr && f.coc) ? [f.price, f.yield, f.irr, f.coc].join('|') : null,
    nac: (f) => (f.score && f.subs) ? f.score + '#' + f.subs : null,
    edit: (f) => (f.tagline && f.desc) ? (f.tagline + '||' + f.desc).toLowerCase() : null,
    cine: (f) => (f.cine.length && f.cine.every(Boolean)) ? f.cine.join(' · ').toLowerCase() : null,
  };
  rows.forEach((f) => { for (const d of Object.keys(fp)) { const k = key[d](f); if (k) (fp[d][k] = fp[d][k] || []).push(f.slug); } });
  // per-slug cluster size (>1 means banded)
  const size = {};
  rows.forEach((f) => {
    size[f.slug] = {};
    for (const d of Object.keys(fp)) { const k = key[d](f); size[f.slug][d] = k ? fp[d][k].length : 0; }
  });
  return size;
}

// ---- status derivation -----------------------------------------------------
function derive(f, dup) {
  const st = {};
  const has = (v) => v && !String(v).includes('{');

  st.id = f.country.name === 'Unknown' ? 'block' : (has(f.district) ? 'done' : 'band');

  if (!has(f.price) || !has(f.irr) || !has(f.coc)) st.fin = 'block';
  else st.fin = dup.fin > 1 ? 'band' : 'done';

  if (!has(f.score)) st.nac = 'block';
  else st.nac = dup.nac > 1 ? 'band' : 'done';

  if (!has(f.tagline) || !has(f.desc)) st.edit = 'block';
  else st.edit = dup.edit > 1 ? 'band' : 'done';

  const lc = [f.lists.pros, f.lists.cons, f.lists.features].filter(Boolean).length;
  st.json = lc === 3 ? 'done' : lc === 0 ? 'block' : 'band';

  if (!f.cine.length || f.cine.some((c) => !c)) st.cine = f.cine.some(Boolean) ? 'band' : 'block';
  else st.cine = dup.cine > 1 ? 'band' : 'done';

  st.img = !f.heroReal ? 'block' : (f.galReal >= 2 ? 'done' : 'band');

  st.geo = (has(f.lat) && f.ldTokens === 0) ? 'done' : 'block';

  // §01 overview facts: 4/4 filled → done, 0 → block, partial → band
  st.ovw = f.ovwFacts >= 4 ? 'done' : f.ovwFacts === 0 ? 'block' : 'band';

  st.qa = 'done'; // viability is a human call; refined via overrides

  return st;
}

// ---- main ------------------------------------------------------------------
function main() {
  const check = process.argv.includes('--check');
  const overrides = fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) : {};

  const files = fs.readdirSync(PROP_DIR).filter((f) => f.endsWith('.html') && !f.startsWith('_'));
  const feats = files.map((file) => extract(fs.readFileSync(path.join(PROP_DIR, file), 'utf8'), file.replace(/\.html$/, '')));
  const clusters = buildClusters(feats);

  const rows = feats.map((f) => {
    const dup = clusters[f.slug];
    const auto = derive(f, dup);
    const ov = overrides[f.slug] || {};
    const st = { ...auto };
    DIMS.forEach((d) => { if (ov[d]) st[d] = ov[d]; });
    const dupOut = {}; for (const d of Object.keys(dup)) if (dup[d] > 1) dupOut[d] = dup[d];
    return { name: f.name, slug: f.slug, code: f.country.code, country: f.country.name,
      flag: f.country.flag, region: f.region, thumb: f.thumb, st, auto,
      note: ov.note || '', dup: dupOut };
  });

  // group: country -> region
  rows.sort((a, b) => (COUNTRY_ORDER.indexOf(a.code) - COUNTRY_ORDER.indexOf(b.code))
    || a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  const groups = [];
  const counts = {};
  for (const r of rows) {
    counts[r.code] = counts[r.code] || { code: r.code, name: r.country, flag: r.flag, count: 0 };
    counts[r.code].count++;
    let grp = groups[groups.length - 1];
    if (!grp || grp.code !== r.code || grp.region !== r.region)
      groups.push((grp = { country: r.country, code: r.code, flag: r.flag, region: r.region, rows: [] }));
    grp.rows.push({ name: r.name, slug: r.slug, thumb: r.thumb, st: r.st, note: r.note, dup: r.dup });
  }
  const countries = COUNTRY_ORDER.filter((c) => counts[c]).map((c) => counts[c]);

  const data = {
    generated: '', reviewed: '', fingerprint: '',
    dims: DIMS,
    imgHash: IMG_HASH,
    total: rows.length,
    countries,
    groups,
    overrides,
  };
  // content-stable timestamp: only bump `generated` when the actual status data
  // changes, so re-runs are byte-identical and CI doesn't churn noise commits.
  const stable = JSON.stringify({ dims: data.dims, imgHash: data.imgHash, total: data.total, countries, groups, overrides });
  data.fingerprint = crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16);
  const prev = fs.existsSync(JSON_OUT) ? JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')) : null;
  if (prev && prev.fingerprint === data.fingerprint) {
    data.generated = prev.generated; data.reviewed = prev.reviewed;
  } else {
    const now = new Date();
    data.generated = now.toISOString().slice(0, 19) + 'Z';
    data.reviewed = now.toISOString().slice(0, 10);
  }

  // write machine JSON
  const jsonStr = JSON.stringify(data, null, 2);
  // inject into HTML between markers
  const html = fs.readFileSync(HTML_OUT, 'utf8');
  const re = /(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/;
  if (!re.test(html)) { console.error('✖ data marker not found in listing-status.html'); process.exit(2); }
  const nextHtml = html.replace(re, `$1\n${JSON.stringify(data)}\n$2`);

  if (check) {
    const changed = nextHtml !== html;
    console.log(changed ? '✖ listing-status.html is stale — run build-llp-status.mjs' : '✓ dashboard up to date');
    process.exit(changed ? 1 : 0);
  }

  fs.writeFileSync(JSON_OUT, jsonStr);
  fs.writeFileSync(HTML_OUT, nextHtml);

  // console summary
  const tally = { done: 0, band: 0, block: 0, draft: 0, na: 0 };
  let cells = 0, doneCells = 0;
  rows.forEach((r) => DIMS.forEach((d) => { tally[r.st[d]]++; if (r.st[d] !== 'na') { cells++; if (r.st[d] === 'done') doneCells++; } }));
  console.log(`✓ ${rows.length} listings · ${countries.map((c) => c.code + ':' + c.count).join(' ')}`);
  console.log(`  cells ${doneCells}/${cells} done (${Math.round(doneCells / cells * 100)}%) · ` +
    `done ${tally.done} · band ${tally.band} · block ${tally.block} · draft ${tally.draft} · na ${tally.na}`);
  const banded = {}; rows.forEach((r) => Object.keys(r.dup).forEach((d) => { banded[d] = banded[d] || new Set(); r.dup[d] >= 1 && banded[d].add(r.slug); }));
  Object.keys(banded).forEach((d) => console.log(`  ⚠ ${d}: ${banded[d].size} listings in shared clusters`));
}

main();
