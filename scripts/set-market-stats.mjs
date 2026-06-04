#!/usr/bin/env node
// Populates the per-metro `📊 Market Stats JSON` field on every Live listing so
// the §04 Market stat cards differ by city instead of showing the template
// default (33M+ / 23% / 80–95% / +30–45%) on every PDP.
//
// Metro is resolved from City / Region/City / Country. Figures are real and
// sourced (central banks, tourism boards, CBRE/CoreLogic/Savills/Global Property
// Guide, 2024) — ranges/estimates phrased honestly. Idempotent: only writes when
// the stored value differs. Listings whose metro isn't mapped are left untouched
// (template default stands — no regression).
//
// Env: NOTION_TOKEN (req), NOTION_DATABASE_ID, DRY_RUN=true (log only).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN });

// ── Per-metro stat sets (4 × { val, vi, en }) — real, sourced 2024 figures ───
const CITY_STATS = {
  Sydney: [
    { val: '+5.6%', vi: 'Tăng giá thuê Sydney 2024', en: 'Sydney rent growth 2024' },
    { val: '~1.5%', vi: 'Tỷ lệ nhà trống', en: 'Rental vacancy rate' },
    { val: '3–4%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
    { val: '446K', vi: 'Di cư ròng vào Úc 2023–24', en: 'Australia net migration 2023–24' },
  ],
  Melbourne: [
    { val: '+9–10%', vi: 'Tăng giá thuê Melbourne 2024', en: 'Melbourne rent growth 2024' },
    { val: '~1.8%', vi: 'Tỷ lệ nhà trống', en: 'Rental vacancy rate' },
    { val: '3.8%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
    { val: '5.2M', vi: 'Dân số Melbourne', en: 'Melbourne population' },
  ],
  Istanbul: [
    { val: '+30%', vi: 'Tăng giá nhà TRY 2024', en: 'House-price growth TRY 2024' },
    { val: '5–8%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
    { val: '8,416', vi: 'Căn bán cho người nước ngoài 2024', en: 'Foreign-buyer sales 2024' },
    { val: '16M', vi: 'Dân số İstanbul', en: 'İstanbul population' },
  ],
  London: [
    { val: '4.5%', vi: 'Lợi suất gộp khu trung tâm', en: 'Prime-central gross yield' },
    { val: '+3.7%', vi: 'Tăng giá thuê hợp đồng mới 2024', en: 'New-let rent growth 2024' },
    { val: '+19.8%', vi: 'Dự báo tăng giá đến 2028', en: 'Forecast price growth to 2028' },
    { val: '20M+', vi: 'Khách quốc tế London/năm', en: "London int'l visitors/yr" },
  ],
  Limassol: [
    { val: '+10.7%', vi: 'Tăng giá căn hộ 2024', en: 'Apartment-price growth 2024' },
    { val: '5–6%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
    { val: '28%', vi: 'Giao dịch từ người nước ngoài', en: 'Foreign-buyer transaction share' },
    { val: '€3,200/m²', vi: 'Giá Limassol/m² 2025', en: 'Limassol price per m² 2025' },
  ],
  'Panama City': [
    { val: '+10.1%', vi: 'Tăng giá nhà 2024', en: 'Home-price growth 2024' },
    { val: '7.8%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
    { val: 'USD', vi: 'Nền kinh tế USD hóa', en: 'USD-denominated economy' },
    { val: '+12%', vi: 'Tăng giá thuê căn hộ YoY', en: 'Apartment rent growth YoY' },
  ],
  'Da Nang': [
    { val: '10.9M', vi: 'Khách du lịch Đà Nẵng 2024', en: 'Da Nang visitors 2024' },
    { val: '+32%', vi: 'Tăng trưởng du lịch YoY', en: 'Tourism growth YoY' },
    { val: '4–4.5%', vi: 'Lợi suất cho thuê', en: 'Rental yield' },
    { val: '$2,500+/m²', vi: 'Giá căn hộ cao cấp/m²', en: 'Prime apartment price/m²' },
  ],
  'Ho Chi Minh City': [
    { val: '+24%', vi: 'Tăng giá căn hộ sơ cấp 2024', en: 'Primary apartment-price growth 2024' },
    { val: '$3,150/m²', vi: 'Giá sơ cấp trung bình/m²', en: 'Avg primary price per m²' },
    { val: '5,050', vi: 'Nguồn cung mới 2024 — thấp nhất từ 2013', en: 'New supply 2024 — lowest since 2013' },
    { val: '~3.9%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
  ],
  'Ho Tram': [
    { val: '17.5M', vi: 'Khách quốc tế Việt Nam 2024', en: "Vietnam int'l visitors 2024" },
    { val: '2h', vi: 'Từ TP.HCM (cao tốc)', en: 'From Ho Chi Minh City' },
    { val: '~4%', vi: 'Lợi suất cho thuê', en: 'Rental yield' },
    { val: '5★', vi: 'Bờ biển nghỉ dưỡng tích hợp', en: 'Integrated resort coast' },
  ],
  // Already live (kept here as the single source of truth — re-applied identically)
  Athens: [
    { val: '~8M', vi: 'Khách quốc tế Athens 2024', en: "Athens int'l visitors 2024" },
    { val: '+12%', vi: 'Tăng trưởng du lịch YoY 2024', en: 'Tourism growth YoY 2024' },
    { val: '+8.4%', vi: 'Tăng giá căn hộ Athens 2024', en: 'Athens apartment-price growth 2024' },
    { val: '4–8%', vi: 'Lợi suất cho thuê gộp', en: 'Gross rental yield' },
  ],
  Galaxidi: [
    { val: '2.5h', vi: 'Từ Athens (đường bộ)', en: 'From Athens by road' },
    { val: '+8.4%', vi: 'Tăng giá nhà Hy Lạp 2024', en: 'Greece house-price growth 2024' },
    { val: '30 min', vi: 'Tới Delphi — Di sản UNESCO', en: 'To Delphi — UNESCO site' },
    { val: '€250k+', vi: 'Ngưỡng Golden Visa', en: 'Golden Visa minimum' },
  ],
};

// Ordered keyword → metro. First hit on (City + Region/City + Country) wins.
const METRO_RULES = [
  [/galaxidi/i, 'Galaxidi'],
  [/athens|kallithea|glyfada|piraeus|kifisia|faliro/i, 'Athens'],
  [/istanbul|İstanbul|beylikd|bağcılar|bagcilar|sarıyer|sariyer|topkap/i, 'Istanbul'],
  [/sydney|parramatta|burwood|carlingford|zetland|macquarie|hurstville|arncliffe|caringbah|blacktown|ashbury|erskineville|north sydney|auburn|lakemba|bankstown/i, 'Sydney'],
  [/melbourne|box hill|blackburn|southbank|south melbourne|alphington|pagewood/i, 'Melbourne'],
  [/london/i, 'London'],
  [/limassol|paphos|larnaca|cyprus|nicosia/i, 'Limassol'],
  [/panama/i, 'Panama City'],
  [/ho tram|hồ tràm|ho-tram/i, 'Ho Tram'],
  [/da nang|đà nẵng|danang/i, 'Da Nang'],
  [/ho chi minh|hồ chí minh|hcmc|saigon|sài gòn/i, 'Ho Chi Minh City'],
];

const rt = (p) => { if (!p) return ''; if (p.title) return p.title.map(t => t.plain_text).join(''); if (p.rich_text) return p.rich_text.map(t => t.plain_text).join(''); return ''; };

function resolveMetro(p) {
  const hay = [rt(p['City']), rt(p['Region/City']), rt(p['📍 District']), p['Country']?.select?.name || ''].join(' | ');
  for (const [re, metro] of METRO_RULES) if (re.test(hay)) return metro;
  return null;
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
  console.log(`set-market-stats${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const rows = await fetchLive();
  console.log(`${rows.length} Live listings\n`);
  const byMetro = {}; let wrote = 0, skip = 0, unmapped = 0;
  for (const pg of rows) {
    const p = pg.properties;
    const slug = rt(p['🔗 Slug']) || rt(p['Property Name']);
    const metro = resolveMetro(p);
    if (!metro || !CITY_STATS[metro]) { unmapped++; console.log(`  ? ${slug}: no metro match — left as-is`); continue; }
    byMetro[metro] = (byMetro[metro] || 0) + 1;
    const desired = JSON.stringify(CITY_STATS[metro]);
    const current = rt(p['📊 Market Stats JSON']);
    if (current === desired) { skip++; continue; }
    console.log(`  ${DRY_RUN ? '[dry] would set' : '✓ set'} ${slug} → ${metro}`);
    if (!DRY_RUN) {
      await notion.pages.update({ page_id: pg.id, properties: { '📊 Market Stats JSON': { rich_text: [{ text: { content: desired } }] } } });
    }
    wrote++;
  }
  console.log(`\nBy metro: ${Object.entries(byMetro).map(([m, n]) => `${m}=${n}`).join(', ')}`);
  console.log(`${wrote} ${DRY_RUN ? 'would write' : 'written'}, ${skip} already current, ${unmapped} unmapped.`);
})().catch(e => { console.error(e); process.exit(1); });
