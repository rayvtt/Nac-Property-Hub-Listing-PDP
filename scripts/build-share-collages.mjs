#!/usr/bin/env node
/**
 * build-share-collages.mjs — generate a 5-photo social share image per listing.
 *
 * For each Live listing it montages the hero + up to 4 gallery images into a
 * 1200×630 collage (hero left, 2×2 gallery right), uploads it to Cloudflare
 * Images as `<slug>-share`, and writes the URL to the Notion `Share Image URL`
 * field. sync-notion then points og:image / twitter:image at it, so shared
 * links unfurl with the photo collage (the short blurb is og:description).
 *
 * Idempotent: skips listings that already have a Share Image URL unless REPLACE.
 * Requires ImageMagick (convert/montage or magick) — installed in CI alongside
 * sync-images. Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NOTION_TOKEN.
 *
 *   node build-share-collages.mjs              # all Live listings, skip done
 *   ONLY=slug-a,slug-b node build-share-collages.mjs   # pilot a few
 *   REPLACE=1 node build-share-collages.mjs    # regenerate all
 */
import { Client } from '@notionhq/client';
import { execFileSync } from 'node:child_process';
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

const notion = new Client({ auth: TOKEN });
const url = (p) => (p?.url || (p?.rich_text || []).map((t) => t.plain_text).join('')) || '';
const rt = (p) => (p?.rich_text || p?.title || []).map((t) => t.plain_text).join('').trim();

// ImageMagick: prefer IM7 `magick`, fall back to IM6 `convert`/`montage`.
let IM7 = false;
try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); IM7 = true; } catch { /* IM6 */ }
const convert = (args) => execFileSync(IM7 ? 'magick' : 'convert', IM7 ? args : args, { stdio: 'pipe' });
const montage = (args) => execFileSync(IM7 ? 'magick' : 'montage', IM7 ? ['montage', ...args] : args, { stdio: 'pipe' });

const NAVY = '#0F1A36';
const firstFont = (cands, fallback) => cands.find((f) => f && fs.existsSync(f)) || fallback;
// Tagline = the Property Hub display face, Cormorant Garamond Italic (downloaded
// in CI; covers Vietnamese). Falls back to Noto/DejaVu serif if unavailable.
const DISPLAY = firstFont([
  process.env.DISPLAY_FONT,
  '/usr/share/fonts/truetype/cormorant/CormorantGaramond-Italic.ttf',
  '/usr/share/fonts/truetype/noto/NotoSerif-Italic.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf',
], '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf');
// Chips use a sans with Vietnamese coverage (DejaVu Sans, installed).
const SANS = firstFont([
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
], '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');

async function dl(u, dest) {
  const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 NAC-collage' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`download ${u} → ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function uploadCF(filePath, id) {
  if (REPLACE) {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${CF_TOKEN}` } }).catch(() => {});
  }
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  fd.append('id', id);
  fd.append('requireSignedURLs', 'false');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1`,
    { method: 'POST', headers: { Authorization: `Bearer ${CF_TOKEN}` }, body: fd });
  const data = await res.json();
  if (!data.success) {
    const code = data.errors?.[0]?.code;
    if (code === 5409 || code === 5410) { // exists — fetch its URL
      const g = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${CF_TOKEN}` } })).json();
      if (g.success) return (g.result.variants.find((v) => v.endsWith('/public')) || g.result.variants[0]);
    }
    throw new Error('CF upload failed: ' + JSON.stringify(data.errors));
  }
  return data.result.variants.find((v) => v.endsWith('/public')) || data.result.variants[0];
}

// Pull the displayed entry price + IRR straight from the shipped HTML (already
// currency-converted by sync-notion) for the chips.
function readStats(slug) {
  try {
    const h = fs.readFileSync(path.join(ROOT, 'properties', slug + '.html'), 'utf8');
    const g = (re) => { const m = h.match(re); return m ? m[1].trim() : ''; };
    const price = g(/data-notion="price_short"[^>]*>([^<]*)/);
    const irr = g(/data-notion="irr_pct"[^>]*>([^<]*)/);
    return { price, irr: irr ? irr + '%' : '' };
  } catch { return {}; }
}

// Build a 1200×630 collage: hero left (600×630) + 2×2 of the next images right.
function buildCollage(images, work, tagline, stats) {
  const hero = images[0];
  const gallery = images.slice(1);
  const left = path.join(work, 'left.jpg');
  const base = path.join(work, 'collage.jpg');
  convert([hero, '-resize', '600x630^', '-gravity', 'center', '-extent', '600x630', '-strip', left]);

  if (gallery.length === 0) {
    convert([hero, '-resize', '1200x630^', '-gravity', 'center', '-extent', '1200x630', '-strip', base]);
  } else {
    // four tiles (cycle through what's available to fill the 2×2)
    const tiles = [];
    for (let i = 0; i < 4; i++) {
      const src = gallery[i % gallery.length];
      const t = path.join(work, `tile${i}.jpg`);
      convert([src, '-resize', '300x315^', '-gravity', 'center', '-extent', '300x315', '-strip', t]);
      tiles.push(t);
    }
    const right = path.join(work, 'right.jpg');
    montage([...tiles, '-tile', '2x2', '-geometry', '+0+0', '-background', NAVY, right]);
    convert([left, right, '+append', '-strip', base]);
  }
  return tagline ? addTaglineBand(base, tagline, stats || {}, work) : finalize(base, work);
}

function finalize(src, work) {
  const out = path.join(work, 'final.jpg');
  convert([src, '-strip', '-quality', '86', out]);
  return out;
}

// A rounded chip sized to its text: translucent stat pill, or a solid status badge.
function makeChip(text, name, bg, fg, work) {
  const out = path.join(work, name + '.png');
  const w = Math.min(360, Math.max(140, 30 + text.length * 12));
  convert(['-size', `${w}x46`, 'xc:none',
    '-fill', bg, '-draw', `roundrectangle 0,0,${w - 1},45,23,23`,
    '-font', SANS, '-pointsize', '20', '-fill', fg, '-gravity', 'center', '-annotate', '+0+0', text, out]);
  return { path: out, w };
}

// Frosted "highlight" band across the middle: tagline in the Property Hub serif on
// the left + a stacked column of Giá vào / IRR 10 năm / Live chips on the right.
function addTaglineBand(src, tagline, stats, work) {
  const W = 1200, BAND_H = 186, Y = Math.round((630 - BAND_H) / 2);
  const blur = path.join(work, 'blur.jpg');
  const band = path.join(work, 'band.jpg');
  const txt = path.join(work, 'txt.png');
  const chipsPng = path.join(work, 'chips.png');
  const bt = path.join(work, 'bandtext.jpg');
  const out = path.join(work, 'final.jpg');

  // frosted highlight
  convert([src, '-blur', '0x16', blur]);
  convert([blur, '-crop', `${W}x${BAND_H}+0+${Y}`, '+repage', '-brightness-contrast', '-24x4', band]);

  // stacked chips column (right)
  const chips = [];
  if (stats.price) chips.push(makeChip(`Giá vào   ${stats.price}`, 'c1', 'rgba(255,255,255,0.16)', '#ffffff', work));
  if (stats.irr) chips.push(makeChip(`IRR 10 năm   ${stats.irr}`, 'c2', 'rgba(255,255,255,0.16)', '#ffffff', work));
  chips.push(makeChip('●  Live', 'c3', '#1f9d57', '#ffffff', work));
  montage([...chips.map((c) => c.path), '-tile', '1x' + chips.length, '-geometry', '+0+6', '-background', 'none', chipsPng]);
  const chipsW = Math.max(...chips.map((c) => c.w));

  // tagline (Property Hub serif italic), in the space left of the chips
  const textW = W - chipsW - 130;
  const text = tagline.replace(/\s+/g, ' ').trim().normalize('NFC');
  convert(['-background', 'none', '-fill', '#ffffff', '-font', DISPLAY, '-size', `${textW}x${BAND_H - 44}`,
    '-gravity', 'west', `caption:${text}`, txt]);

  // compose: tagline pinned left, chips pinned right
  convert([band,
    txt, '-gravity', 'west', '-geometry', '+48+0', '-composite',
    chipsPng, '-gravity', 'east', '-geometry', '+44+0', '-composite', bt]);
  convert([src, bt, '-geometry', `+0+${Y}`, '-composite', '-strip', '-quality', '88', out]);
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
    if (!REPLACE && url(p['Share Image URL'])) { skip++; continue; }
    const hero = url(p['Image URL']);
    const gal = ['🖼️ Image 1', '🖼️ Image 2', '🖼️ Image 3', '🖼️ Image 4'].map((k) => url(p[k])).filter(Boolean);
    const imgs = [hero, ...gal].filter((u) => u && !u.includes('{'));
    if (!imgs.length) { console.log(`  ⤳ ${slug}: no images — skipped`); skip++; continue; }

    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'collage-'));
    try {
      const local = [];
      for (let i = 0; i < imgs.length; i++) local.push(await dl(imgs[i], path.join(work, `src${i}.img`)));
      const tagline = rt(p['🏷️ Tagline EN']);
      const stats = readStats(slug);
      const collage = buildCollage(local, work, tagline, stats);
      const cfUrl = await uploadCF(collage, `${slug}-share`);
      await notion.pages.update({ page_id: pg.id, properties: { 'Share Image URL': { url: cfUrl } } });
      console.log(`  ✓ ${slug}: ${imgs.length} photos${tagline ? ' + tagline' : ''} → ${cfUrl}`);
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
