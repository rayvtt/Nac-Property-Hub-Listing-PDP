#!/usr/bin/env node
// Regenerates the "Định Vị NAC" positioning line (`📜 Statement VI` / `📜
// Statement EN`) for every Live listing so it stops reading as the identical
// generic "Sở hữu căn hộ «X» tại «Y»." on every PDP.
//
// The new line is *varied by property type* (villas, branded residences, condos,
// townhouses … each get a different sentence shape) and always carries three
// concrete elements the old line lacked:  property type · brand · city · the
// minimum ENTRY price (from Purchase Price + Currency).  Highlighted words use
// «guillemets» exactly like the rest of the field (the PDP splits on /«[^»]+»/g).
//
// Deterministic: a per-slug hash picks one of a type's variants, so siblings in
// the same city/type differ but every run is byte-identical (idempotent).
//
// Env: NOTION_TOKEN (req), NOTION_DATABASE_ID, DRY_RUN=true (log only, no write),
//      ONLY_SLUG=<slug> (limit to one listing — handy for sampling).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const ONLY_SLUG = (process.env.ONLY_SLUG || '').trim();
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN });

const rt = (p) => { if (!p) return ''; if (p.title) return p.title.map(t => t.plain_text).join(''); if (p.rich_text) return p.rich_text.map(t => t.plain_text).join(''); return ''; };
const num = (p) => (p && typeof p.number === 'number') ? p.number : null;
const sel = (p) => p?.select?.name || '';

// ── Money (matches sync-notion.mjs::fmtMoneyShort) ───────────────────────────
const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', AED: 'AED ', CAD: 'C$', AUD: 'A$', JPY: '¥', CHF: 'CHF ', CNY: '¥', SGD: 'S$', MYR: 'RM ', THB: '฿', VND: '₫' };
const sym = (c) => CURRENCY_SYMBOLS[c] || '$';
function fmtMoneyShort(n, currency) {
  if (n == null) return '';
  const s = sym(currency);
  if (n >= 1_000_000) return s + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return s + Math.round(n / 1_000) + 'K';
  return s + Math.round(n);
}

// ── Property-type wording + sentence shapes, keyed by 🏨 Hub Type ────────────
// {t} type-word · «{b}» brand · «{c}» city · «{p}» entry price. Brand/city/price
// are wrapped in guillemets (highlighted); the type word stays plain.
// {a}/{A} = English indefinite article (a/an) agreeing with the brand's initial
// sound; {b} brand · {c} city · {p} entry price (brand/city/price guillemeted).
const TYPES = {
  Villa: {
    viT: ['Sở hữu biệt thự «{b}» tại «{c}» từ «{p}».', 'Biệt thự riêng «{b}» giữa «{c}» — từ «{p}».'],
    enT: ['Own {a} «{b}» villa in «{c}» from «{p}».', 'A private «{b}» villa in «{c}», from «{p}».'],
  },
  'Branded Residences': {
    viT: ['Sở hữu căn hộ thương hiệu «{b}» tại «{c}» từ «{p}».', 'Căn hộ gắn thương hiệu «{b}» giữa «{c}» — từ «{p}».'],
    enT: ['Own {a} «{b}»-branded residence in «{c}» from «{p}».', '{A} «{b}» branded residence in «{c}», from «{p}».'],
  },
  Condo: {
    viT: ['Sở hữu căn hộ «{b}» tại «{c}» từ «{p}».', 'Căn hộ «{b}» giữa lòng «{c}» — từ «{p}».'],
    enT: ['Own {a} «{b}» residence in «{c}» from «{p}».', '{A} «{b}» residence in «{c}», from «{p}».'],
  },
  Resort: {
    viT: ['Sở hữu căn hộ nghỉ dưỡng «{b}» tại «{c}» từ «{p}».', 'Nghỉ dưỡng sở hữu «{b}» tại «{c}» — từ «{p}».'],
    enT: ['Own {a} «{b}» resort residence in «{c}» from «{p}».', '{A} «{b}» resort home in «{c}», from «{p}».'],
  },
  Townhouse: {
    viT: ['Sở hữu nhà phố «{b}» tại «{c}» từ «{p}».', 'Nhà phố «{b}» tại «{c}» — từ «{p}».'],
    enT: ['Own {a} «{b}» townhouse in «{c}» from «{p}».', '{A} «{b}» townhouse in «{c}», from «{p}».'],
  },
  Estate: {
    viT: ['Sở hữu dinh thự «{b}» tại «{c}» từ «{p}».', 'Dinh thự «{b}» tại «{c}» — từ «{p}».'],
    enT: ['Own {a} «{b}» estate in «{c}» from «{p}».', '{A} «{b}» estate in «{c}», from «{p}».'],
  },
};
const DEFAULT_TYPE = TYPES.Condo;

// a/an from the brand's initial sound. "The X" → article agrees with X.
const enArticle = (b) => {
  const w = b.replace(/^the\s+/i, '').trim();
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
};

// Stable hash → variant index (so a listing always renders the same line).
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

function shortBrand(p) {
  const brand = rt(p['✦ Brand']).trim();
  if (brand) return brand;
  // Fallback: first segment of the property name before a dash / "by" / comma.
  const name = rt(p['Property Name']).replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return name.split(/\s+—\s+|\s+by\s+|,\s*/i)[0].trim();
}

function buildStatement(p, slug) {
  const hub = rt(p['🏨 Hub Type']) || sel(p['🏨 Hub Type']);
  const T = TYPES[hub] || DEFAULT_TYPE;
  const b = shortBrand(p);
  const c = (rt(p['City']) || rt(p['Region/City']).split(',')[0]).trim();
  const price = fmtMoneyShort(num(p['Purchase Price']), sel(p['Currency']) || rt(p['Currency']));
  if (!b || !c || !price) return null; // never emit a half-filled line
  const i = hash(slug) % T.viT.length;
  const art = enArticle(b);
  const fill = (tpl) => tpl
    .replace('{a}', art).replace('{A}', art[0].toUpperCase() + art.slice(1))
    .replaceAll('{b}', b).replace('{c}', c).replace('{p}', price);
  return { vi: fill(T.viT[i]), en: fill(T.enT[i]) };
}

async function fetchLive() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, filter: { property: 'Hub Status', select: { equals: 'Live' } }, start_cursor: cursor, page_size: 100 });
    out = out.concat(res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

(async () => {
  console.log(`set-statements${DRY_RUN ? ' [DRY RUN]' : ''}${ONLY_SLUG ? ` [slug=${ONLY_SLUG}]` : ''}`);
  const rows = await fetchLive();
  let wrote = 0, skip = 0, nodata = 0;
  for (const pg of rows) {
    const p = pg.properties;
    const slug = rt(p['🔗 Slug']) || rt(p['Property Name']);
    if (ONLY_SLUG && slug !== ONLY_SLUG) continue;
    const st = buildStatement(p, slug);
    if (!st) { nodata++; console.log(`  ⚠ ${slug}: missing brand/city/price — left as-is`); continue; }
    const curVi = rt(p['📜 Statement VI']), curEn = rt(p['📜 Statement EN']);
    if (curVi === st.vi && curEn === st.en) { skip++; continue; }
    console.log(`  ${DRY_RUN ? '[dry]' : '✓'} ${slug}`);
    console.log(`        VI: ${st.vi}`);
    console.log(`        EN: ${st.en}`);
    if (!DRY_RUN) {
      await notion.pages.update({ page_id: pg.id, properties: {
        '📜 Statement VI': { rich_text: [{ text: { content: st.vi } }] },
        '📜 Statement EN': { rich_text: [{ text: { content: st.en } }] },
      } });
    }
    wrote++;
  }
  console.log(`\n${wrote} ${DRY_RUN ? 'would write' : 'written'}, ${skip} already current, ${nodata} missing data.`);
})().catch(e => { console.error(e); process.exit(1); });
