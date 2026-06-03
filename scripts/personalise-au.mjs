#!/usr/bin/env node
// Personalise AU listing editorial that the bulk generator left templated.
// Rewrites — per listing, grounded in real suburb facts + the row's own
// attributes — the fields users notice as repetitive:
//   🏷️ Tagline, 💬 NAC Note, ✅ Pros, ⚠️ Cons, ✨ Features,
//   🌍 Market, ✦ Brand Intro, 📝 Desc  (all bilingual VI/EN)
// Leaves Process (genuinely identical FIRB flow) and Cine titles (smart-generic)
// alone, and never touches financials/taxonomy/images.
//
// Source of truth = a SUBURB_PROFILES map of verifiable local knowledge
// (transport, drawcards, tenant markets, precinct character). No invented
// developer names or hard prices; prices stay labelled NAC estimates. Where a
// render/brochure detail is well-evidenced it's added as an amenity line.
//
// Writes via the raw Notion API exactly like generate-au-listings.mjs, so the
// JSON fields store as clean JSON (correct end-to-end rendering).
//
// Env: NOTION_TOKEN (required), NOTION_DATABASE_ID, DRY_RUN=true (log only),
//      SAMPLE_SLUGS="a,b,c" (restrict to these slugs; empty = all AU Live).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const SAMPLE = (process.env.SAMPLE_SLUGS || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN });

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const typeWord = { Condo: ['apartment', 'căn hộ'], Townhouse: ['townhouse', 'nhà phố'], Land: ['home', 'nhà'], 'Mixed-Use': ['residence', 'căn hộ'] };

// ── Verifiable per-suburb knowledge ─────────────────────────────────────────
// Each profile supplies finished bilingual copy so the suburb voice is editable
// in one place. {brand}/{type}/{typeVi}/{yld} are interpolated at compose time.
const SUBURB_PROFILES = {
  'Macquarie Park': {
    taglineEn: 'Metro-connected living at Sydney’s tech & university hub',
    taglineVi: 'Sống kết nối Metro tại trung tâm công nghệ & đại học của Sydney',
    blurbEn: 'a residential address in Macquarie Park — Sydney’s live-where-you-work tech, health and university precinct, on the Metro line',
    blurbVi: 'một địa chỉ tại Macquarie Park — khu công nghệ, y tế và đại học “sống-nơi-làm-việc” của Sydney, ngay trên tuyến Metro',
    marketEn: 'Macquarie Park is one of Sydney’s rare precincts where homes, a university, a hospital, a super-regional mall and a global business park all sit on the Metro — a structurally deep, year-round tenant base and a clear education/skilled-migration draw.',
    marketVi: 'Macquarie Park là một trong số ít khu của Sydney nơi nhà ở, đại học, bệnh viện, trung tâm thương mại lớn và khu văn phòng toàn cầu cùng nằm trên tuyến Metro — nguồn khách thuê dồi dào quanh năm và lực hút giáo dục/định cư tay nghề rõ rệt.',
    note: (c) => ({
      en: `Macquarie Park is one of Sydney’s few true live-where-you-work precincts — Macquarie University, a university hospital, the Macquarie Centre super-mall and a global business park (Optus, Microsoft, pharma HQs) all sit on the Metro line. That gives ${c.brand} a deep, year-round pool of student and professional tenants and a clear education/skilled-migration angle for relocating families. NAC reads it as a capital-growth hold rather than a yield play: the ~${c.yld}% gross yield is modest, but freehold AUD title and two Metro stations underwrite both rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Macquarie Park là một trong số ít khu “sống-nơi-làm-việc” đúng nghĩa của Sydney — Đại học Macquarie, bệnh viện đại học, trung tâm thương mại Macquarie Centre và khu văn phòng toàn cầu (Optus, Microsoft, các hãng dược) đều nằm trên tuyến Metro. Điều này mang lại cho ${c.brand} nguồn khách thuê sinh viên và chuyên gia dồi dào quanh năm, cùng lộ trình giáo dục/định cư tay nghề rõ ràng cho các gia đình. NAC xem đây là khoản đầu tư tăng giá vốn hơn là dòng tiền: lợi suất gộp ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và hai ga Metro bảo chứng cho khả năng cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Walk to two Sydney Metro stations (Macquarie University & Macquarie Park)', vi: 'Đi bộ tới hai ga Sydney Metro (Macquarie University & Macquarie Park)' },
      { en: 'Beside Macquarie University, the hospital & a global business park — built-in tenant demand', vi: 'Kề Đại học Macquarie, bệnh viện & khu văn phòng toàn cầu — nguồn thuê sẵn có' },
      { en: 'Steps from Macquarie Centre, one of Sydney’s largest shopping & dining hubs', vi: 'Sát Macquarie Centre, một trong những TTTM & ẩm thực lớn nhất Sydney' },
    ],
    feats: [
      { icon: '🚇', en: 'Two Sydney Metro stations within walking distance', vi: 'Hai ga Sydney Metro trong tầm đi bộ' },
      { icon: '🎓', en: 'Macquarie University & university hospital next door', vi: 'Đại học Macquarie & bệnh viện đại học kề bên' },
    ],
    conRisk: { en: 'Plenty of new high-rise stock in Macquarie Park — be selective on aspect/floor for resale', vi: 'Nguồn cung căn hộ cao tầng mới dồi dào tại Macquarie Park — cần chọn hướng/tầng kỹ để bán lại' },
  },
  'Blackburn': {
    taglineEn: 'Leafy, station-side townhouse living in Melbourne’s east',
    taglineVi: 'Nhà phố xanh mát, cạnh ga tàu ở phía đông Melbourne',
    blurbEn: 'a low-rise townhouse address in Blackburn — a quiet, green, established suburb in Melbourne’s east, on the Lilydale/Belgrave train line',
    blurbVi: 'một dự án nhà phố thấp tầng tại Blackburn — vùng ngoại ô phía đông Melbourne yên tĩnh, xanh mát, lâu đời, trên tuyến tàu Lilydale/Belgrave',
    marketEn: 'Blackburn is established east-Melbourne family territory — leafy streets, Blackburn Lake Sanctuary, well-regarded schools and a train station, ~18 km from the CBD. Low-rise townhouses here appeal to owner-occupier families, which supports both rental stability and resale depth.',
    marketVi: 'Blackburn là vùng gia đình lâu đời phía đông Melbourne — đường phố rợp cây, khu bảo tồn Blackburn Lake, trường học tốt và có ga tàu, cách CBD ~18 km. Nhà phố thấp tầng tại đây hấp dẫn các gia đình ở thực, hỗ trợ cả ổn định cho thuê lẫn thanh khoản bán lại.',
    note: (c) => ({
      en: `Blackburn is established, leafy east-Melbourne family territory — tree-lined streets, the Blackburn Lake Sanctuary, sought-after schools and a station on the Lilydale/Belgrave line, ~18 km from the CBD. A low-rise freehold ${c.type} here is an owner-occupier product, which gives ${c.brand} steadier tenant demand and a deeper resale pool than CBD high-rise. NAC views it as a capital-growth and family-relocation hold: the ~${c.yld}% yield is modest, but freehold AUD land and the school catchment underpin durable value. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Blackburn là vùng gia đình lâu đời, xanh mát phía đông Melbourne — phố rợp cây, khu bảo tồn Blackburn Lake, trường học được ưa chuộng và một ga trên tuyến Lilydale/Belgrave, cách CBD ~18 km. Một căn ${c.typeVi} freehold thấp tầng ở đây là sản phẩm cho người ở thực, mang lại cho ${c.brand} nhu cầu thuê ổn định hơn và thanh khoản bán lại sâu hơn so với cao tầng CBD. NAC xem đây là khoản đầu tư tăng giá vốn & gia đình chuyển cư: lợi suất ~${c.yld}% khiêm tốn, nhưng đất freehold bằng AUD và tuyến trường học giữ giá trị bền vững. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Walk to Blackburn station (Lilydale/Belgrave line) into the CBD', vi: 'Đi bộ tới ga Blackburn (tuyến Lilydale/Belgrave) vào CBD' },
      { en: 'Leafy, established family suburb — Blackburn Lake Sanctuary & parks nearby', vi: 'Khu gia đình lâu đời, xanh mát — kề khu bảo tồn Blackburn Lake & công viên' },
      { en: 'Sought-after eastern-suburbs school catchment', vi: 'Nằm trong tuyến trường học được ưa chuộng ở phía đông' },
    ],
    feats: [
      { icon: '🌳', en: 'Quiet, tree-lined streets beside Blackburn Lake Sanctuary', vi: 'Phố yên tĩnh rợp cây kề khu bảo tồn Blackburn Lake' },
      { icon: '🚆', en: 'Blackburn station on the Lilydale/Belgrave line', vi: 'Ga Blackburn trên tuyến Lilydale/Belgrave' },
    ],
    conRisk: { en: 'Low-rise townhouse — fewer building amenities than a high-rise tower', vi: 'Nhà phố thấp tầng — ít tiện ích toà nhà hơn so với cao ốc' },
  },
  'Carlingford': {
    taglineEn: 'Light-rail family living in Sydney’s school belt',
    taglineVi: 'Sống gia đình cạnh light-rail trong vùng trường học của Sydney',
    blurbEn: 'a residential address in Carlingford — an established family suburb in Sydney’s north-west and the terminus of the Parramatta Light Rail',
    blurbVi: 'một địa chỉ tại Carlingford — khu gia đình lâu đời ở tây bắc Sydney, điểm cuối tuyến Parramatta Light Rail',
    marketEn: 'Carlingford is established family north-west Sydney — strong public and selective schools, Carlingford Court, and a Light Rail terminus running to the Parramatta CBD. It sits between the Macquarie Park and Parramatta job markets, which keeps family and student tenant demand steady.',
    marketVi: 'Carlingford là khu gia đình lâu đời ở tây bắc Sydney — trường công và trường chọn lọc tốt, TTTM Carlingford Court, và điểm cuối tuyến Light Rail nối CBD Parramatta. Nằm giữa hai thị trường việc làm Macquarie Park và Parramatta, giúp nhu cầu thuê từ gia đình và sinh viên ổn định.',
    note: (c) => ({
      en: `Carlingford is established north-west Sydney family territory — known for strong public and selective schools, Carlingford Court, and the Parramatta Light Rail terminus that links it to the Parramatta CBD. Sitting between the Macquarie Park and Parramatta employment hubs gives ${c.brand} a steady mix of family and student tenants. NAC reads it as a school-catchment and capital-growth hold: the ~${c.yld}% yield is modest, but freehold AUD title and the education pull support both rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Carlingford là vùng gia đình lâu đời ở tây bắc Sydney — nổi tiếng với trường công và trường chọn lọc tốt, TTTM Carlingford Court, và điểm cuối Parramatta Light Rail nối tới CBD Parramatta. Vị trí giữa hai trung tâm việc làm Macquarie Park và Parramatta mang lại cho ${c.brand} nguồn khách thuê gia đình và sinh viên ổn định. NAC xem đây là khoản đầu tư theo tuyến trường học & tăng giá vốn: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và lực hút giáo dục hỗ trợ cả cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Parramatta Light Rail terminus — direct to the Parramatta CBD', vi: 'Điểm cuối Parramatta Light Rail — thẳng tới CBD Parramatta' },
      { en: 'Strong public & selective school catchment — family tenant magnet', vi: 'Tuyến trường công & trường chọn lọc tốt — hút khách thuê gia đình' },
      { en: 'Between the Macquarie Park & Parramatta job markets', vi: 'Nằm giữa hai thị trường việc làm Macquarie Park & Parramatta' },
    ],
    feats: [
      { icon: '🚊', en: 'Parramatta Light Rail terminus at Carlingford', vi: 'Điểm cuối Parramatta Light Rail tại Carlingford' },
      { icon: '🎓', en: 'Sought-after schools & Carlingford Court nearby', vi: 'Trường học được ưa chuộng & Carlingford Court kề bên' },
    ],
    conRisk: { en: 'Suburban location — capital growth led by schools/transport, not a CBD address', vi: 'Vị trí ngoại ô — tăng giá vốn dựa vào trường học/giao thông, không phải địa chỉ CBD' },
  },
  'Southbank': {
    taglineEn: 'Riverfront high-rise in Melbourne’s arts precinct',
    taglineVi: 'Căn hộ cao tầng ven sông trong khu nghệ thuật của Melbourne',
    blurbEn: 'a high-rise address in Southbank — Melbourne’s riverfront arts-and-dining precinct, a tram ride from the CBD',
    blurbVi: 'một dự án cao tầng tại Southbank — khu nghệ thuật & ẩm thực ven sông của Melbourne, cách CBD một chuyến tram',
    marketEn: 'Southbank is Melbourne’s riverfront arts precinct — the Arts Centre, NGV, Hamer Hall and the Southbank Promenade dining strip, with the CBD a short walk across the Yarra. It is dense, walkable and tram-wrapped, drawing CBD professionals, students and corporate tenants.',
    marketVi: 'Southbank là khu nghệ thuật ven sông của Melbourne — Arts Centre, NGV, Hamer Hall và dải ẩm thực Southbank Promenade, CBD chỉ vài phút đi bộ qua sông Yarra. Khu phố sầm uất, dễ đi bộ, phủ kín tram, thu hút chuyên gia CBD, sinh viên và khách thuê doanh nghiệp.',
    note: (c) => ({
      en: `Southbank is Melbourne’s riverfront arts-and-dining precinct — the Arts Centre, NGV and Hamer Hall on one side, the Yarra and a short walk to the CBD on the other, all wrapped in trams. ${c.brand} sits in the Melbourne Square precinct, anchored by a full-line supermarket and a large public park. NAC reads a CBD-fringe tower like this as a rental-yield and liquidity play more than most AU stock: the ~${c.yld}% yield is solid for the market and the walkable location keeps it leasable, though high-rise supply means resale rewards a well-chosen aspect. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Southbank là khu nghệ thuật & ẩm thực ven sông của Melbourne — Arts Centre, NGV và Hamer Hall một bên, sông Yarra và CBD chỉ vài phút đi bộ phía kia, tất cả phủ kín tram. ${c.brand} nằm trong quần thể Melbourne Square, với siêu thị lớn và một công viên công cộng rộng. NAC xem một toà cao tầng ven CBD như thế này nghiêng về lợi suất cho thuê & thanh khoản hơn phần lớn sản phẩm Úc: lợi suất ~${c.yld}% là tốt cho thị trường và vị trí dễ đi bộ giúp luôn cho thuê được, dù nguồn cung cao tầng đòi hỏi chọn hướng tốt khi bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Walk across the Yarra to the Melbourne CBD; trams at the door', vi: 'Đi bộ qua sông Yarra vào CBD Melbourne; tram ngay cửa' },
      { en: 'In the arts precinct — Arts Centre, NGV, Hamer Hall, Southbank dining', vi: 'Trong khu nghệ thuật — Arts Centre, NGV, Hamer Hall, ẩm thực Southbank' },
      { en: 'Melbourne Square precinct — full-line supermarket & a large public park', vi: 'Quần thể Melbourne Square — siêu thị lớn & công viên công cộng rộng' },
    ],
    feats: [
      { icon: '🎭', en: 'Heart of Melbourne’s arts precinct, on the Yarra', vi: 'Trung tâm khu nghệ thuật Melbourne, ven sông Yarra' },
      { icon: '🚋', en: 'Tram-wrapped, walk to the CBD', vi: 'Phủ kín tram, đi bộ vào CBD' },
    ],
    conRisk: { en: 'Dense high-rise supply in Southbank — aspect & floor matter for resale', vi: 'Nguồn cung cao tầng dày đặc tại Southbank — hướng & tầng quyết định khi bán lại' },
  },
};

// Universal lines reused across listings (kept short; suburb lines lead).
const uniPros = (c) => ([
  { en: `Freehold ${c.type} title, FIRB-approved for foreign buyers`, vi: `Sở hữu freehold ${c.typeVi}, được FIRB duyệt cho người nước ngoài` },
  { en: 'Australian rule of law & a stable AUD — a safe-haven hold', vi: 'Pháp quyền Úc & đồng AUD ổn định — tài sản trú ẩn an toàn' },
]);
const uniFeats = (c) => ([
  { icon: '💎', en: `Freehold ${c.type} — AUD-denominated, FIRB-approved`, vi: `${cap(c.typeVi)} sở hữu freehold — định giá AUD, FIRB duyệt` },
  { icon: '🛡️', en: 'Stable-currency, rule-of-law safe-haven hold', vi: 'Tài sản trú ẩn an toàn, tiền tệ ổn định' },
  { icon: '🎓', en: 'Education & skilled-migration pathway for families', vi: 'Lộ trình giáo dục & định cư tay nghề cho gia đình' },
]);
const uniCons = (c) => ([
  { en: `~${c.yld}% gross yield — a capital-growth hold, not a cash-flow play`, vi: `Lợi suất gộp ~${c.yld}% — kênh tăng giá vốn, không phải dòng tiền` },
  { en: 'Foreign buyers need FIRB approval + state surcharge duties', vi: 'Người nước ngoài cần FIRB + phụ phí thuế bang' },
  { en: '~9-hour flight from Vietnam; pricing indicative (NAC estimate)', vi: 'Cách Việt Nam ~9 giờ bay; giá tham khảo (NAC ước tính)' },
]);

// ── Notion read helpers ─────────────────────────────────────────────────────
const rt = (p) => { if (!p) return ''; if (p.title) return p.title.map(t => t.plain_text).join(''); if (p.rich_text) return p.rich_text.map(t => t.plain_text).join(''); return ''; };
const txt = (s) => ({ rich_text: s == null || s === '' ? [] : [{ text: { content: String(s).slice(0, 1990) } }] });

async function fetchAU() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, filter: { property: 'Hub Status', select: { equals: 'Live' } }, start_cursor: cursor, page_size: 100 });
    out = out.concat(res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out.filter(pg => (pg.properties['Country']?.select?.name || '') === 'Australia');
}

function compose(pg) {
  const p = pg.properties;
  const slug = rt(p['🔗 Slug']);
  const suburb = rt(p['📍 District']) || (rt(p['Region/City']).split(',')[0] || '').trim();
  const city = (rt(p['Region/City']).split(',')[1] || '').trim() || 'Sydney';
  const hubType = p['🏨 Hub Type']?.select?.name || 'Condo';
  const brand = rt(p['✦ Brand']) || rt(p['Property Name']);
  const yld = ((p['Yield %']?.number || 0) * 100).toFixed(1);
  const [tEn, tVi] = typeWord[hubType] || typeWord.Condo;
  const prof = SUBURB_PROFILES[suburb];
  if (!prof) return { slug, skip: `no suburb profile for "${suburb}"` };
  const c = { brand, type: tEn, typeVi: tVi, yld, city, suburb };
  const note = prof.note(c);
  const pros = [...prof.pros, ...uniPros(c)].slice(0, 5);
  const cons = [uniCons(c)[0], uniCons(c)[1], prof.conRisk, uniCons(c)[2]].slice(0, 4);
  const feats = [...prof.feats, ...uniFeats(c)].slice(0, 5);
  const desc = {
    en: `${brand} is ${prof.blurbEn}. AUD-denominated and FIRB-approved for foreign buyers, it suits families pursuing Australian education, migration optionality, or stable-currency diversification. Pricing is a NAC estimate pending the developer price list.`,
    vi: `${brand} là ${prof.blurbVi}. Định giá AUD và được FIRB duyệt cho người nước ngoài; phù hợp gia đình hướng đến giáo dục Úc, lựa chọn định cư, hoặc đa dạng hóa tiền tệ ổn định. Giá là NAC ước tính, chờ bảng giá CĐT.`,
  };
  const props = {
    '🏷️ Tagline EN': txt(prof.taglineEn), '🏷️ Tagline VI': txt(prof.taglineVi),
    '💬 NAC Note EN': txt(note.en), '💬 NAC Note VI': txt(note.vi),
    '✅ Pros JSON': txt(JSON.stringify(pros)),
    '⚠️ Cons JSON': txt(JSON.stringify(cons)),
    '✨ Features JSON': txt(JSON.stringify(feats)),
    '🌍 Market EN': txt(prof.marketEn), '🌍 Market VI': txt(prof.marketVi),
    '✦ Brand Intro EN': txt(`${brand} — ${prof.blurbEn}.`), '✦ Brand Intro VI': txt(`${brand} — ${prof.blurbVi}.`),
    '📝 Desc EN': txt(desc.en), '📝 Desc VI': txt(desc.vi),
  };
  return { slug, suburb, city, brand, pageId: pg.id, props, preview: { tagline: prof.taglineEn, note: note.en, pros: pros.map(x => x.en), cons: cons.map(x => x.en), feats: feats.map(x => x.icon + ' ' + x.en) } };
}

(async () => {
  let rows = await fetchAU();
  if (SAMPLE.length) rows = rows.filter(pg => SAMPLE.includes(rt(pg.properties['🔗 Slug'])));
  console.log(`personalise-au — ${rows.length} AU listing(s)${DRY_RUN ? ' [DRY RUN]' : ''}${SAMPLE.length ? ` (sample: ${SAMPLE.join(', ')})` : ''}\n`);
  let done = 0, skip = 0;
  for (const pg of rows) {
    const r = compose(pg);
    if (r.skip) { console.log(`  ⤳ ${r.slug}: skipped (${r.skip})`); skip++; continue; }
    console.log(`━━━ ${r.slug} — ${r.brand} (${r.suburb}, ${r.city}) ━━━`);
    console.log(`  tagline: ${r.preview.tagline}`);
    console.log(`  note: ${r.preview.note}`);
    console.log(`  pros:\n   - ${r.preview.pros.join('\n   - ')}`);
    console.log(`  cons:\n   - ${r.preview.cons.join('\n   - ')}`);
    console.log(`  features:\n   - ${r.preview.feats.join('\n   - ')}\n`);
    if (!DRY_RUN) { await notion.pages.update({ page_id: r.pageId, properties: r.props }); }
    done++;
  }
  console.log(`\nDone. ${done} ${DRY_RUN ? 'previewed' : 'updated'}, ${skip} skipped (no profile).`);
})().catch(e => { console.error(e); process.exit(1); });
