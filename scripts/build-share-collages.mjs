#!/usr/bin/env node
/**
 * build-share-collages.mjs — generate a premium "editorial brochure" share card
 * per listing.
 *
 * Layout (1200×630): a clean 3-photo mosaic up top (hero + two stacked, hairline
 * seams) → a crisp orange rule → a NAVY editorial footer carrying the location
 * eyebrow, the headline in Cormorant Garamond, and an inline stat row with the
 * NAC-score donut — the LLP's own design language (navy + orange, serif display,
 * tracked eyebrows, the score ring). Uploaded to Cloudflare as `<slug>-share`,
 * written to Notion `Share Image URL` (also used as the page cover); sync-notion
 * points og:image / twitter:image at it.
 *
 * Idempotent via a content fingerprint (🔁 Share Hash); REPLACE / ONLY force it.
 * Requires ImageMagick. Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NOTION_TOKEN.
 *
 *   node build-share-collages.mjs              # all Live listings, skip unchanged
 *   ONLY=slug-a,slug-b node build-share-collages.mjs   # pilot a few
 *   REPLACE=1 node build-share-collages.mjs    # regenerate all
 */
import { Client } from '@notionhq/client';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '2adeb401a00c6f459573f25eabb790da';
const REPLACE = /^(1|true|yes)$/i.test(process.env.REPLACE || '');
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
if (!CF_TOKEN) { console.error('CLOUDFLARE_API_TOKEN required'); process.exit(1); }

// Pin the Notion API version. @notionhq/client is an unpinned ^2.2.15, so a fresh
// CI `npm install` can pull a newer client that defaults to a newer Notion-Version
// header — under which `databases.query` by database_id returns 0 rows (the
// data-source migration). Pinning 2022-06-28 keeps the Live query deterministic.
const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });
const url = (p) => (p?.url || (p?.rich_text || []).map((t) => t.plain_text).join('')) || '';
const rt = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text).join('').trim();

// ImageMagick: prefer IM7 `magick`, fall back to IM6 `convert`.
let IM7 = false;
try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); IM7 = true; } catch { /* IM6 */ }
const convert = (args) => execFileSync(IM7 ? 'magick' : 'convert', args, { stdio: 'pipe' });
const imgW = (f) => parseInt(execFileSync(IM7 ? 'magick' : 'convert', [f, '-format', '%w', 'info:']).toString().trim(), 10) || 0;

const NAVY = '#0F1A36';
const ORANGE = '#E8743B';
const CREAM = '#F5F1E8';
// Bump when the collage *design* changes. Folded into the input fingerprint so a
// redesign forces a hub-wide repaint on the next scheduled run.
const DESIGN_VERSION = 'editorial-v3';
// Accept a font only if it's a real file (a 404 page saved by curl is tiny).
const validFont = (f) => { try { return f && fs.statSync(f).size > 5000; } catch { return false; } };
const firstFont = (cands, fallback) => cands.find(validFont) || fallback;
// Headline = the Property Hub display face, Cormorant Garamond Italic (downloaded
// in CI; covers Vietnamese). Falls back to Noto/DejaVu serif if unavailable.
const DISPLAY = firstFont([
  process.env.DISPLAY_FONT,
  '/usr/share/fonts/truetype/cormorant/CormorantGaramond-Italic.ttf',
  '/usr/share/fonts/truetype/noto/NotoSerif-Italic.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf',
], '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf');
// Labels/stats use a sans with full Vietnamese coverage (Noto Sans, else DejaVu).
const SANS = firstFont([
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
], '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
const SANS_BOLD = firstFont([
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
], SANS);

async function dl(u, dest) {
  const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 NAC-collage' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`download ${u} → ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function uploadCF(filePath, id) {
  // Always delete-then-upload. CF Images keys by id, so re-POSTing an existing id
  // returns 5409 *without* overwriting the bytes — uploadCF is only ever called
  // once we've decided to (re)build, so replacing is always the intent.
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${CF_TOKEN}` } }).catch(() => {});
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  fd.append('id', id);
  fd.append('requireSignedURLs', 'false');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1`,
    { method: 'POST', headers: { Authorization: `Bearer ${CF_TOKEN}` }, body: fd });
  const data = await res.json();
  if (!data.success) {
    const code = data.errors?.[0]?.code;
    if (code === 5409 || code === 5410) {
      const g = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${CF_TOKEN}` } })).json();
      if (g.success) return (g.result.variants.find((v) => v.endsWith('/public')) || g.result.variants[0]);
    }
    throw new Error('CF upload failed: ' + JSON.stringify(data.errors));
  }
  return data.result.variants.find((v) => v.endsWith('/public')) || data.result.variants[0];
}

// Pull the displayed editorial fields straight from the shipped HTML (already
// localized + currency-converted by sync-notion): location, brand, price, yield,
// NAC score, names. One source of truth = what's actually on the page.
function readMeta(slug) {
  try {
    const h = fs.readFileSync(path.join(ROOT, 'properties', slug + '.html'), 'utf8');
    const g = (re) => { const m = h.match(re); return m ? m[1].replace(/<[^>]*>/g, '').trim() : ''; };
    const num = (v) => (v || '').replace(/[^\d.]/g, '');
    return {
      country: g(/data-notion="country"[^>]*>([^<]*)/),
      district: g(/data-notion="district"[^>]*>([^<]*)/),
      brand: g(/data-notion="brand"[^>]*>([\s\S]*?)</),
      price: g(/data-notion="price_short"[^>]*>([^<]*)/),
      yield: num(g(/data-notion="yield_pct"[^>]*>([\s\S]*?)<\/div>/)),
      irr: num(g(/data-notion="irr_pct"[^>]*>([\s\S]*?)<\/div>/)),
      nac: g(/class="nac-donut-score"[^>]*data-count-to="([^"]*)"/),
      nameVi: g(/data-notion="property_name_vi"[^>]*>([^<]*)/),
      nameEn: g(/data-notion="property_name_en"[^>]*>([^<]*)/),
    };
  } catch { return {}; }
}

// ── image helpers ──────────────────────────────────────────────────────────
function imgTile(src, w, h, work, name) {
  const out = path.join(work, 'tile_' + name + '.jpg');
  convert([src, '-resize', `${w}x${h}^`, '-gravity', 'center', '-extent', `${w}x${h}`, '-strip', out]);
  return out;
}

// 3-photo mosaic, 1200×462: hero left + up to two stacked on the right, navy seams.
function buildMosaic(images, work) {
  const MW = 1200, MH = 462, SEAM = 4, out = path.join(work, 'mosaic.jpg');
  const hero = images[0];
  const gallery = images.slice(1);
  if (!gallery.length) {
    convert([hero, '-resize', `${MW}x${MH}^`, '-gravity', 'center', '-extent', `${MW}x${MH}`, '-strip', out]);
    return out;
  }
  const heroW = 742, rightW = MW - heroW - SEAM;
  const heroT = imgTile(hero, heroW, MH, work, 'h');
  let rightCol;
  if (gallery.length === 1) {
    rightCol = imgTile(gallery[0], rightW, MH, work, 'r0');
  } else {
    const ih = Math.round((MH - SEAM) / 2);
    const r0 = imgTile(gallery[0], rightW, ih, work, 'r0');
    const r1 = imgTile(gallery[1], rightW, MH - SEAM - ih, work, 'r1');
    rightCol = path.join(work, 'rcol.jpg');
    convert(['-size', `${rightW}x${MH}`, `xc:${NAVY}`,
      r0, '-gravity', 'northwest', '-geometry', '+0+0', '-composite',
      r1, '-gravity', 'northwest', '-geometry', `+0+${ih + SEAM}`, '-composite', rightCol]);
  }
  convert(['-size', `${MW}x${MH}`, `xc:${NAVY}`,
    heroT, '-gravity', 'northwest', '-geometry', '+0+0', '-composite',
    rightCol, '-gravity', 'northwest', '-geometry', `+${heroW + SEAM}+0`, '-composite', '-strip', out]);
  return out;
}

// ── editorial footer pieces ──────────────────────────────────────────────────
// NAC-score donut: faint full ring + an orange arc for the score fraction, with
// the number + "NAC" centered — the LLP's signature score mark.
function makeRing(score, work) {
  const out = path.join(work, 'ring.png');
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const D = 102, c = 51, r = 46, end = -90 + (s / 100) * 360;
  convert(['-size', `${D}x${D}`, 'xc:none',
    '-fill', 'none', '-stroke', 'rgba(245,241,232,0.16)', '-strokewidth', '5', '-draw', `ellipse ${c},${c} ${r},${r} 0,360`,
    '-stroke', ORANGE, '-strokewidth', '5', '-draw', `ellipse ${c},${c} ${r},${r} -90,${end.toFixed(1)}`,
    '-stroke', 'none',
    '-font', SANS_BOLD, '-fill', CREAM, '-pointsize', '33', '-gravity', 'center', '-annotate', '+0+9', String(Math.round(s)),
    '-font', SANS, '-fill', ORANGE, '-pointsize', '11', '-kerning', '2.5', '-gravity', 'center', '-annotate', '+0-23', 'NAC',
    out]);
  return out;
}

// A stacked stat: tracked uppercase label over a cream value.
function statCol(label, value, work, name) {
  const out = path.join(work, name + '.png');
  const lab = path.join(work, name + '_l.png');
  const val = path.join(work, name + '_v.png');
  convert(['-background', 'none', '-fill', 'rgba(245,241,232,0.55)', '-font', SANS, '-pointsize', '14', '-kerning', '2.5', `label:${label.toUpperCase().normalize('NFC')}`, lab]);
  convert(['-background', 'none', '-fill', CREAM, '-font', SANS, '-pointsize', '28', `label:${String(value).normalize('NFC')}`, val]);
  convert([lab, '-size', '4x10', 'xc:none', val, '-background', 'none', '-gravity', 'west', '-append', out]);
  return out;
}
const vrule = (work, name, h = 60) => { const o = path.join(work, name + '.png'); convert(['-size', `1x${h}`, 'xc:rgba(245,241,232,0.20)', o]); return o; };
const hgap = (w, work, name) => { const o = path.join(work, name + '.png'); convert(['-size', `${w}x1`, 'xc:none', o]); return o; };
const vgap = (w, h, work, name) => { const o = path.join(work, name + '.png'); convert(['-size', `${w}x${h}`, 'xc:none', o]); return o; };

// Right-side stat cluster: [Giá vào] | [Lợi suất] | NAC ring — hairline dividers.
function makeStatCluster(meta, work) {
  const cols = [];
  if (meta.price) cols.push(statCol('Giá vào', meta.price, work, 'sc_price'));
  if (meta.yield) cols.push(statCol('Lợi suất', meta.yield + '%', work, 'sc_yield'));
  const joined = [];
  cols.forEach((e, i) => { if (i) joined.push(hgap(24, work, 'g' + i + 'a'), vrule(work, 'v' + i), hgap(24, work, 'g' + i + 'b')); joined.push(e); });
  if (meta.nac) { if (joined.length) joined.push(hgap(28, work, 'gn')); joined.push(makeRing(meta.nac, work)); }
  if (!joined.length) return null;
  const out = path.join(work, 'cluster.png');
  convert([...joined, '-background', 'none', '-gravity', 'center', '+append', out]);
  return { path: out, w: imgW(out) };
}

// Left editorial block: eyebrow (COUNTRY · DISTRICT) + serif headline + serif sub.
function renderEditorial(meta, tagline, textW, work) {
  const parts = [];
  const eye = [meta.country, meta.district].filter(Boolean).join('  ·  ').toUpperCase();
  if (eye) {
    const p = path.join(work, 'eye.png');
    convert(['-background', 'none', '-fill', ORANGE, '-font', SANS, '-pointsize', '15', '-kerning', '3', `label:${eye.normalize('NFC')}`, p]);
    parts.push(p, vgap(textW, 13, work, 'eg'));
  }
  const head = (tagline.vi || meta.nameVi || meta.nameEn || '').normalize('NFC');
  if (head) {
    const p = path.join(work, 'head.png');
    convert(['-background', 'none', '-fill', CREAM, '-font', DISPLAY, '-pointsize', '38', '-size', `${textW}x`, '-gravity', 'west', `caption:${head}`, p]);
    parts.push(p);
  }
  const sub = (tagline.en || '').normalize('NFC');
  if (sub) {
    const p = path.join(work, 'sub.png');
    convert(['-background', 'none', '-fill', 'rgba(245,241,232,0.70)', '-font', DISPLAY, '-pointsize', '22', '-size', `${textW}x`, '-gravity', 'west', `caption:${sub}`, p]);
    parts.push(vgap(textW, 8, work, 'sg'), p);
  }
  const out = path.join(work, 'left.png');
  convert([...parts, '-background', 'none', '-gravity', 'west', '-append', out]);
  return out;
}

// Assemble: mosaic (top) + orange rule + navy editorial footer (bottom).
function buildCollage(images, work, meta, tagline) {
  const mosaic = buildMosaic(images, work);
  const cluster = makeStatCluster(meta, work);
  const PAD = 50, GAP = 46, BAND_H = 168;
  const textW = Math.max(360, 1200 - PAD * 2 - (cluster ? cluster.w : 0) - (cluster ? GAP : 0));
  const left = renderEditorial(meta, tagline || {}, textW, work);

  const band = path.join(work, 'band.png');
  const bandCmd = ['-size', `1200x${BAND_H}`, `xc:${NAVY}`, left, '-gravity', 'west', '-geometry', `+${PAD}+0`, '-composite'];
  if (cluster) bandCmd.push(cluster.path, '-gravity', 'east', '-geometry', `+${PAD}+0`, '-composite');
  bandCmd.push(band);
  convert(bandCmd);

  const out = path.join(work, 'final.jpg');
  convert(['-size', '1200x630', `xc:${NAVY}`,
    mosaic, '-gravity', 'northwest', '-geometry', '+0+0', '-composite',
    band, '-gravity', 'southwest', '-geometry', '+0+0', '-composite',
    '-fill', ORANGE, '-draw', 'rectangle 0,460 1199,463',
    '-strip', '-quality', '90', out]);
  return out;
}

async function fetchLive() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DATABASE_ID,
      filter: { property: 'Hub Status', select: { equals: 'Live' } }, start_cursor: cursor });
    out = out.concat(res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function main() {
  const pages = await fetchLive();
  let done = 0, skip = 0, fail = 0;
  for (const pg of pages) {
    const p = pg.properties;
    const slug = rt(p['🔗 Slug']);
    if (!slug) { continue; }
    if (ONLY.length && !ONLY.includes(slug)) continue;
    const hero = url(p['Image URL']);
    const gal = ['🖼️ Image 1', '🖼️ Image 2', '🖼️ Image 3', '🖼️ Image 4'].map((k) => url(p[k])).filter(Boolean);
    const imgs = [hero, ...gal].filter((u) => u && !u.includes('{'));
    if (!imgs.length) { console.log(`  ⤳ ${slug}: no images — skipped`); skip++; continue; }

    // Headline — editor-controlled 📣 Share Title VI/EN, else the on-page tagline's
    // first clause. One VI line, one EN line.
    const strip = (s) => (s || '').replace(/\s+/g, ' ').split(/[,.·\n]/)[0].trim();
    const tagline = {
      vi: rt(p['📣 Share Title VI']) || strip(rt(p['🏷️ Tagline VI'])),
      en: rt(p['📣 Share Title EN']) || strip(rt(p['🏷️ Tagline EN'])),
    };
    const meta = readMeta(slug);

    // Input fingerprint → rebuild only when a source actually changed.
    const fp = crypto.createHash('md5')
      .update(JSON.stringify({ v: DESIGN_VERSION, imgs, tagline, meta }))
      .digest('hex').slice(0, 12);
    const force = REPLACE || ONLY.length > 0;
    if (!force && url(p['Share Image URL']) && rt(p['🔁 Share Hash']) === fp) { skip++; continue; }

    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'collage-'));
    try {
      const local = [];
      for (let i = 0; i < imgs.length; i++) local.push(await dl(imgs[i], path.join(work, `src${i}.img`)));
      const collage = buildCollage(local, work, meta, tagline);
      const cfUrl = await uploadCF(collage, `${slug}-share`);
      // Cache-bust: append a content hash of the collage as ?v= so Facebook/LinkedIn
      // (which cache OG previews by URL) refresh when the image changes.
      const ver = crypto.createHash('md5').update(fs.readFileSync(collage)).digest('hex').slice(0, 8);
      const verUrl = cfUrl + (cfUrl.includes('?') ? '&' : '?') + 'v=' + ver;
      await notion.pages.update({
        page_id: pg.id,
        cover: { type: 'external', external: { url: verUrl } },
        properties: {
          'Share Image URL': { url: verUrl },
          '🔁 Share Hash': { rich_text: [{ text: { content: fp } }] },
        },
      });
      console.log(`  ✓ ${slug}: ${imgs.length} photos · NAC ${meta.nac || '—'} → ${verUrl}`);
      done++;
    } catch (e) {
      console.log(`  ✖ ${slug}: ${e.message}`);
      fail++;
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  console.log(`\nshare collages — built ${done} · skipped ${skip} · failed ${fail}${IM7 ? '' : ' (IM6)'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
