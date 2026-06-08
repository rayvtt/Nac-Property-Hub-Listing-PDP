#!/usr/bin/env node
// Creates the 7 Turkey (İstanbul) Notion listings from the developer price
// sheet — real USD pricing, per-unit-type price bands, handover dates, and
// CBI + guaranteed-sublease + district-grounded bilingual editorial.
//
// Mirrors generate-au-listings.mjs write path (raw Notion API, clean JSON).
// Idempotent: skips a project whose 🔗 Slug already exists.
//
// Env: NOTION_TOKEN (req), NOTION_DATABASE_ID, HUB_STATUS (default Draft),
//      DRY_RUN=true (log only).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const HUB_STATUS = process.env.HUB_STATUS || 'Draft';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' });

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const BAND_LABEL = {
  '1BR': ['1 Bedroom (1+1)', '1 Phòng Ngủ (1+1)'],
  '2BR': ['2 Bedroom (2+1)', '2 Phòng Ngủ (2+1)'],
  '3BR': ['3 Bedroom (3+1)', '3 Phòng Ngủ (3+1)'],
  '4BR': ['4 Bedroom (4+1)', '4 Phòng Ngủ (4+1)'],
  'PH':  ['Penthouse / Duplex', 'Penthouse / Duplex'],
};

// District knowledge (verifiable). Generic İstanbul framing where the sheet
// gives no district.
const DISTRICTS = {
  'Bağcılar': {
    en: 'Bağcılar is an established, well-connected residential district on İstanbul’s European side — on the M1/M3 metro, minutes from Mall of İstanbul and the Başakşehir growth corridor.',
    vi: 'Bağcılar là quận dân cư lâu đời, kết nối tốt ở khu Âu của İstanbul — trên tuyến metro M1/M3, cách Mall of İstanbul và hành lang phát triển Başakşehir vài phút.',
    proEn: 'Established European-side district on the M1/M3 metro', proVi: 'Quận khu Âu lâu đời, trên tuyến metro M1/M3',
  },
  'Topkapı': {
    en: 'Topkapı is a central European-side district on the T1 tram beside the historic city walls — minutes from the Old City, Zeytinburnu’s marina and the airport corridor.',
    vi: 'Topkapı là quận trung tâm khu Âu trên tuyến tram T1, kề tường thành lịch sử — cách Phố Cổ, marina Zeytinburnu và hành lang sân bay vài phút.',
    proEn: 'Central, on the T1 tram by the historic Old City', proVi: 'Trung tâm, trên tram T1 cạnh Phố Cổ lịch sử',
  },
  'Sarıyer': {
    en: 'Sarıyer is İstanbul’s premium green north on the Bosphorus — by the Belgrad Forest and the Maslak / İstinye business-and-luxury-retail corridor.',
    vi: 'Sarıyer là khu bắc cao cấp, xanh mát của İstanbul bên eo Bosphorus — kề rừng Belgrad và hành lang doanh nghiệp & bán lẻ cao cấp Maslak / İstinye.',
    proEn: 'Premium Bosphorus-north address by Maslak & the forest', proVi: 'Địa chỉ bắc Bosphorus cao cấp kề Maslak & rừng',
  },
  'İstanbul': {
    en: 'İstanbul is a transcontinental metropolis of ~16 million and one of the world’s largest residential markets, where USD-priced foreign demand meets a deep rental pool and a $400k path to citizenship.',
    vi: 'İstanbul là siêu đô thị liên lục địa ~16 triệu dân và một trong những thị trường nhà ở lớn nhất thế giới, nơi cầu nước ngoài giá USD gặp nguồn thuê dồi dào và lộ trình $400k tới quốc tịch.',
    proEn: 'Deep İstanbul rental pool — USD-priced foreign demand', proVi: 'Nguồn thuê İstanbul dồi dào — cầu nước ngoài giá USD',
  },
};

// ── The 7 projects (from the developer price sheet) ─────────────────────────
const PROJECTS = [
  { slug:'bagcilar-garden-istanbul', name:'Bağcılar Garden', district:'Bağcılar', folder:'1FZWsJZwVrKcNY8LoiA_hRXN7yzHRJ-pk',
    entry:487000, ppm2:2721, bands:[['3BR',487000,5],['4BR',788000,4]],
    handoverEn:'Handover: ready now', handoverVi:'Bàn giao: ngay (nhận nhà liền)', ready:true },
  { slug:'bagcilar-garden-phase-2-istanbul', name:'Bağcılar Garden Phase II', district:'Bağcılar', folder:'1uoD8C-VdVKVZM_VHCZ5l7tBigh9PhneZ',
    entry:479000, ppm2:3381, bands:[['2BR',479000,1]],
    handoverEn:'Handover: May 2026', handoverVi:'Bàn giao: tháng 5/2026', ready:false },
  { slug:'horizon-park-istanbul', name:'Horizon Park', district:'İstanbul', folder:'11Dm6sED_8MoYIFhUha0chIHhEITrGVKB',
    entry:456000, ppm2:3859, bands:[['2BR',456000,1]],
    handoverEn:'Handover: Phase II Q1 2026 · Phase III Q4 2027', handoverVi:'Bàn giao: GĐ II Q1/2026 · GĐ III Q4/2027', ready:false },
  { slug:'elite-complex-istanbul', name:'Elite Complex', district:'İstanbul', folder:'19iVMy7d0qu9xCHmxC_dy9BmWob1WoiiT',
    entry:472000, ppm2:3750, bands:[['2BR',472000,14],['3BR',545000,5]],
    handoverEn:'Handover: ready now', handoverVi:'Bàn giao: ngay (nhận nhà liền)', ready:true },
  { slug:'marmara-pearl-istanbul', name:'Marmara Pearl', district:'İstanbul', folder:'10GNCk6_Kv_BRc6bkIz92_8X_Ab8vBPCA',
    entry:475000, ppm2:3529, bands:[['2BR',475000,5],['PH',489000,2]],
    handoverEn:'Handover: ready now', handoverVi:'Bàn giao: ngay (nhận nhà liền)', ready:true },
  { slug:'topkapi-nova-residence-istanbul', name:'Topkapı Nova Residence Phase II', district:'Topkapı', folder:'1ARHO7qbowbHJUNRQqwzoaOiHy9LdbpOD',
    entry:446000, ppm2:6603, bands:[['1BR',446000,2],['2BR',519000,5]],
    handoverEn:'Handover: Q4 2027', handoverVi:'Bàn giao: Q4/2027', ready:false },
  { slug:'legend-residences-sariyer', name:'Legend', district:'Sarıyer', folder:'1_GTv-3fN_sOrw5qkaiaQZbvWS3NpqVWF',
    entry:826000, ppm2:7879, bands:[['1BR',826000,4],['2BR',1158000,3],['3BR',1755000,5]],
    handoverEn:'Handover: Q3 2026', handoverVi:'Bàn giao: Q3/2026', ready:false },
];

function buildProps(p) {
  const D = DISTRICTS[p.district] || DISTRICTS['İstanbul'];
  const regionCity = p.district === 'İstanbul' ? 'Istanbul' : `${p.district}, Istanbul`;
  const propName = `${p.name} — Istanbul (CBI)`;
  const listingUrl = `https://nomadassetcollective.com/property-hub-bat-dong-san/turkey/${p.slug}`;
  const folderUrl = `https://drive.google.com/drive/folders/${p.folder}`;
  const entryBand = BAND_LABEL[p.bands[0][0]][0];
  const score = p.district === 'Sarıyer' ? 81 : 77;
  const locVal = p.district === 'Sarıyer' ? 8.5 : (p.district === 'İstanbul' ? 7.0 : 7.5);

  const bandsJson = JSON.stringify(p.bands.map(([b, from, units]) => ({
    en: BAND_LABEL[b][0], vi: BAND_LABEL[b][1], from, units,
  })));
  const subs = JSON.stringify([
    { key:'brand', label_vi:'Thương Hiệu', label_en:'Brand', val:7.0 },
    { key:'yield', label_vi:'Yield', label_en:'Yield', val:7.5 },
    { key:'location', label_vi:'Vị Trí', label_en:'Location', val:locVal },
    { key:'management', label_vi:'Quản Lý', label_en:'Management', val:7.5 },
    { key:'liquidity', label_vi:'Thanh Khoản', label_en:'Liquidity', val:6.5 },
    { key:'risk', label_vi:'Rủi Ro', label_en:'Risk', val:7.0 },
  ]);
  const pros = JSON.stringify([
    { en:'Turkish citizenship from $400k — passports in ~3–6 months, ~110 countries visa-free', vi:'Quốc tịch Thổ Nhĩ Kỳ từ $400k — hộ chiếu trong ~3–6 tháng, miễn visa ~110 quốc gia' },
    { en:'Guaranteed 3-year sublease at 4%/year (12% deducted from the price)', vi:'Cho thuê lại đảm bảo 3 năm, 4%/năm (trừ thẳng 12% vào giá)' },
    { en:'USD-priced, freehold TAPU title; basic furniture included', vi:'Định giá USD, sổ đỏ TAPU sở hữu vĩnh viễn; nội thất cơ bản kèm theo' },
    { en:D.proEn, vi:D.proVi },
    { en:(p.ready?'Ready to hand over now':p.handoverEn.replace('Handover: ','Completing ')), vi:(p.ready?'Bàn giao ngay':p.handoverVi.replace('Bàn giao: ','Hoàn thành ')) },
  ]);
  const cons = JSON.stringify([
    { en:'Citizenship requires a 3-year hold — cannot sell before then', vi:'Quốc tịch yêu cầu nắm giữ 3 năm — không thể bán trước thời hạn' },
    { en:'USD/TRY dynamics affect local costs and resale pricing', vi:'Biến động USD/TRY ảnh hưởng chi phí địa phương và giá bán lại' },
    { en:'CBI resale market is thinner than Vietnam/UAE', vi:'Thị trường bán lại CBI mỏng hơn Việt Nam/UAE' },
    { en:(p.ready?'Indicative pricing — confirm live availability':'Off-plan — handover timing per developer schedule'), vi:(p.ready?'Giá tham khảo — cần xác nhận căn còn trống':'Hình thành tương lai — thời điểm bàn giao theo CĐT') },
  ]);
  const feats = JSON.stringify([
    { icon:'🛂', en:'Turkey CBI eligible — from $400,000 USD', vi:'Đủ điều kiện Turkey CBI — từ $400.000 USD' },
    { icon:'🤝', en:'Guaranteed 3-year sublease — 4%/year (12% total)', vi:'Cho thuê lại đảm bảo 3 năm — 4%/năm (tổng 12%)' },
    { icon:'💎', en:'Freehold TAPU title, USD-denominated', vi:'Sổ đỏ TAPU vĩnh viễn, định giá USD' },
    { icon:'📍', en:`${p.district === 'İstanbul' ? 'İstanbul' : p.district} — ${D.proEn.replace(/^[^—]*— ?/, '')}`, vi:`${p.district === 'İstanbul' ? 'İstanbul' : p.district} — ${D.proVi.replace(/^[^—]*— ?/, '')}` },
    { icon:'🔑', en:p.handoverEn, vi:p.handoverVi },
  ]);
  const proc = JSON.stringify([
    { n:'01', dur_vi:'Tuần 1–2', dur_en:'Week 1–2', title_vi:'Kiểm Tra Điều Kiện & Chọn Căn', title_en:'Eligibility & Unit Selection', body_vi:'Xác nhận điều kiện CBI ($400k) và chọn căn theo loại/tầng/hướng.', body_en:'Confirm CBI eligibility ($400k) and select by type/floor/aspect.' },
    { n:'02', dur_vi:'Tuần 2–4', dur_en:'Week 2–4', title_vi:'Đặt Cọc & Hợp Đồng', title_en:'Reservation & Contract', body_vi:'Đặt cọc, ký hợp đồng; chọn gói cho thuê lại 3 năm (4%/năm).', body_en:'Pay deposit, sign contract; opt into the 3-year sublease (4%/yr).' },
    { n:'03', dur_vi:'Tuần 4–8', dur_en:'Week 4–8', title_vi:'Sang Tên TAPU & Đạt Ngưỡng', title_en:'TAPU Transfer & Threshold', body_vi:'Chuyển sổ đỏ TAPU, xác nhận đạt ngưỡng $400k để nộp đơn quốc tịch.', body_en:'Transfer TAPU title, confirm the $400k threshold for the application.' },
    { n:'04', dur_vi:'Tháng 3–6', dur_en:'Month 3–6', title_vi:'Nộp Đơn & Nhận Hộ Chiếu', title_en:'Application & Passport', body_vi:'Nộp đơn quốc tịch — cả gia đình nhận hộ chiếu trong 3–6 tháng.', body_en:'Submit the citizenship application — the whole family receives passports in 3–6 months.' },
  ]);

  const noteEn = `${p.name} qualifies for Turkish citizenship by investment — from $400,000 USD, a passport for the whole family in ~3–6 months with visa-free access to ~110 countries — and ${entryBand} units start at ${usd(p.entry)} (net of the developer's guaranteed 3-year, 4%/year sublease, i.e. 12% deducted up front). ${D.en} NAC reads it as a passport-plus-income play: the guaranteed sublease gives USD-priced certainty over the CBI hold. ${p.handoverEn}. Figures are from the developer price list; confirm live availability before relying on them.`;
  const noteVi = `${p.name} đủ điều kiện nhập tịch Thổ Nhĩ Kỳ theo diện đầu tư — từ $400.000 USD, cả gia đình nhận hộ chiếu trong ~3–6 tháng, miễn visa ~110 quốc gia — và căn ${BAND_LABEL[p.bands[0][0]][1]} khởi điểm từ ${usd(p.entry)} (đã trừ lợi nhuận cho thuê lại đảm bảo 3 năm, 4%/năm, tức trừ thẳng 12%). ${D.vi} NAC xem đây là khoản đầu tư "hộ chiếu + dòng tiền": gói cho thuê lại đảm bảo mang lại sự chắc chắn định giá USD trong thời gian giữ CBI. ${p.handoverVi}. Số liệu lấy từ bảng giá CĐT; cần xác nhận căn còn trống trước khi sử dụng.`;

  const txt = (s) => ({ rich_text: s == null || s === '' ? [] : [{ text: { content: String(s).slice(0, 1990) } }] });
  const sel = (n) => ({ select: { name: n } });
  const num = (n) => ({ number: n });
  const yld = 0.04, mri = Math.round(p.entry * yld / 12);

  return {
    'Property Name': { title: [{ text: { content: propName } }] },
    'Name VI': txt(`${p.name} — Istanbul (Quốc tịch CBI)`),
    'Country': sel('Turkey'), 'Currency': sel('USD'), 'Region': sel('me'),
    'Region/City': txt(regionCity), '📍 District': txt(p.district),
    'City': txt('Istanbul'),
    '🏨 Hub Type': sel('Condo'), '🛂 Immigration Type': sel('CBI'),
    'Investment Program': sel('Turkey CBI'), 'Exit Strategy': sel('Hold Long-term'),
    'Tags': { multi_select: [{ name: 'Citizenship' }, { name: 'Must Know' }] },
    'Freehold': { checkbox: true }, '💸 Tax-Friendly': { checkbox: true },
    'Hub Status': sel(HUB_STATUS), 'Status': { status: { name: 'Listed' } },
    '🔗 Slug': txt(p.slug), 'Listing URL': { url: listingUrl }, 'GS Source Folder': { url: folderUrl },
    'Purchase Price': num(p.entry), 'Price Per M2': num(p.ppm2),
    'Yield %': num(yld), 'IRR %': num(0.10), 'ROI %': num(0.10), 'Cash-on-Cash %': num(0.04),
    'Monthly Rental Income': num(mri), 'Monthly Expenses': num(0),
    'Cash Flow': num(Math.round(p.entry * yld)), 'Payback Years': num(15), 'Minimum Hold Period': num(3),
    '⭐ NAC Score': num(score),
    'Excerpt EN': txt(`Turkey CBI residence in ${regionCity}. ${entryBand} from ${usd(p.entry)}; $400k path to citizenship + guaranteed 3-yr sublease.`),
    'Excerpt VI': txt(`Căn hộ Turkey CBI tại ${regionCity}. ${BAND_LABEL[p.bands[0][0]][1]} từ ${usd(p.entry)}; lộ trình quốc tịch $400k + cho thuê lại đảm bảo 3 năm.`),
    '🏷️ Tagline EN': txt(`Turkish citizenship + guaranteed yield in ${p.district === 'İstanbul' ? 'İstanbul' : p.district}`),
    '🏷️ Tagline VI': txt(`Quốc tịch Thổ Nhĩ Kỳ + lợi suất đảm bảo tại ${p.district === 'İstanbul' ? 'İstanbul' : p.district}`),
    '📝 Desc EN': txt(`${p.name} is a USD-priced İstanbul residence qualifying for Turkey's Citizenship by Investment programme (from $400,000). ${D.en} Units start at ${usd(p.entry)} (${entryBand}), with an optional developer-guaranteed 3-year sublease at 4%/year — 12% deducted directly from the price — and basic furniture handed over. ${p.handoverEn}.`),
    '📝 Desc VI': txt(`${p.name} là dự án căn hộ İstanbul định giá USD, đủ điều kiện chương trình Nhập tịch theo Đầu tư của Thổ Nhĩ Kỳ (từ $400.000). ${D.vi} Căn khởi điểm từ ${usd(p.entry)} (${BAND_LABEL[p.bands[0][0]][1]}), kèm tùy chọn cho thuê lại đảm bảo 3 năm 4%/năm — trừ thẳng 12% vào giá — và bàn giao nội thất cơ bản. ${p.handoverVi}.`),
    '✦ Brand': txt(p.name),
    '✦ Brand Intro EN': txt(`${p.name} — a residential development in ${regionCity}, offered under Turkey's $400k Citizenship-by-Investment programme with a developer-guaranteed sublease.`),
    '✦ Brand Intro VI': txt(`${p.name} — dự án nhà ở tại ${regionCity}, chào bán theo chương trình Nhập tịch $400k của Thổ Nhĩ Kỳ kèm gói cho thuê lại đảm bảo của CĐT.`),
    '🌍 Market EN': txt(`Türkiye's $400k Citizenship-by-Investment programme is one of the world's largest CBI markets by application volume — popular with MENA, Russian, Central-Asian and increasingly Vietnamese buyers seeking a second passport with EU-candidate exposure. USD-priced stock and developer-guaranteed sublease products deliver more reliable hard-currency returns than self-managed condos, while a weak TRY supports foreign demand.`),
    '🌍 Market VI': txt(`Chương trình Nhập tịch $400k của Thổ Nhĩ Kỳ là một trong những thị trường CBI lớn nhất thế giới theo số đơn — phổ biến với người mua MENA, Nga, Trung Á và ngày càng nhiều Việt Nam tìm hộ chiếu thứ hai với cơ hội ứng viên EU. Sản phẩm định giá USD và cho thuê lại đảm bảo của CĐT mang lợi nhuận ngoại tệ ổn định hơn condo tự quản, trong khi TRY yếu hỗ trợ cầu nước ngoài.`),
    '🌏 Key Markets EN': txt('Vietnam · Middle East · Russia · Central Asia · Europe'),
    '🌏 Key Markets VI': txt('Việt Nam · Trung Đông · Nga · Trung Á · Châu Âu'),
    '🏖️ Beach EN': txt('Sea of Marmara & Bosphorus shoreline within reach'),
    '🏖️ Beach VI': txt('Biển Marmara & bờ Bosphorus trong tầm với'),
    '✈️ Airport EN': txt('İstanbul Airport (IST) & Sabiha Gökçen (SAW) — 30–60 min'),
    '✈️ Airport VI': txt('Sân bay İstanbul (IST) & Sabiha Gökçen (SAW) — 30–60 phút'),
    '📈 Property YoY EN': txt('+15–25%/yr TRY (+5–8% USD) — İstanbul 2024–2026 (NAC estimate)'),
    '📈 Property YoY VI': txt('+15–25%/năm TRY (+5–8% USD) — İstanbul 2024–2026 (NAC ước tính)'),
    '💬 NAC Note EN': txt(noteEn), '💬 NAC Note VI': txt(noteVi),
    '📜 Statement EN': txt(`Own a «${p.name}» residence in «İstanbul».`),
    '📜 Statement VI': txt(`Sở hữu căn hộ «${p.name}» tại «İstanbul».`),
    '📊 Sub-Scores JSON': txt(subs), '✅ Pros JSON': txt(pros), '⚠️ Cons JSON': txt(cons),
    '✨ Features JSON': txt(feats), '🔄 Process JSON': txt(proc),
    '💲 Price Bands JSON': txt(bandsJson),
    '🔑 Handover EN': txt(p.handoverEn), '🔑 Handover VI': txt(p.handoverVi),
    '🎬 Cine 1 EN': txt('İstanbul · two continents, one address'), '🎬 Cine 1 VI': txt('İstanbul · hai lục địa, một địa chỉ'),
    '🎬 Cine 2 EN': txt('A passport, an address, an income'), '🎬 Cine 2 VI': txt('Một hộ chiếu, một mái nhà, một dòng tiền'),
    '🎬 Cine 3 EN': txt('İstanbul · where east meets west'), '🎬 Cine 3 VI': txt('İstanbul · nơi Đông gặp Tây'),
    'Listing Date': { date: { start: new Date().toISOString().slice(0, 10) } },
    _slug: p.slug, _name: propName,
  };
}

async function existingSlugs() {
  const set = new Set(); let cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      const s = pg.properties['🔗 Slug'];
      const v = s && s.rich_text ? s.rich_text.map(t => t.plain_text).join('') : '';
      if (v) set.add(v);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return set;
}

(async () => {
  console.log(`generate-tr-listings — ${PROJECTS.length} projects, Hub Status=${HUB_STATUS}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const existing = await existingSlugs();
  let made = 0, skip = 0;
  for (const p of PROJECTS) {
    if (existing.has(p.slug)) { console.log(`  ⤳ ${p.slug}: exists, skipping`); skip++; continue; }
    const props = buildProps(p);
    const name = props._name; delete props._slug; delete props._name;
    console.log(`  ${DRY_RUN ? '[dry] would create' : '✓ creating'} ${p.slug} — ${name} | entry ${usd(p.entry)} | bands ${p.bands.map(b => b[0]).join('/')}`);
    if (!DRY_RUN) await notion.pages.create({ parent: { database_id: DB }, properties: props });
    made++;
  }
  console.log(`\nDone. ${made} ${DRY_RUN ? 'previewed' : 'created'}, ${skip} skipped.`);
})().catch(e => { console.error(e); process.exit(1); });
