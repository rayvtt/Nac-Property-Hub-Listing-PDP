#!/usr/bin/env node
// Creates the Greece (Athens-area) Notion listings from the Oikos developer
// price sheet — real EUR pricing, per-unit-type price bands, handover notes,
// and Greece Golden Visa + district-grounded bilingual editorial.
//
// Prices: extracted from the Oikos master price list (min AVAILABLE/RESERVED
// price per bedroom type, per project tab). Districts: resolved from each
// project's address pin in the same sheet. Sold-out projects (Sierra, Curve)
// are intentionally excluded — no live inventory to sell.
//
// Mirrors generate-tr-listings.mjs. Idempotent: skips a project whose 🔗 Slug
// already exists. Env: NOTION_TOKEN (req), NOTION_DATABASE_ID,
// HUB_STATUS (default Draft), DRY_RUN=true (log only).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const HUB_STATUS = process.env.HUB_STATUS || 'Draft';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' });

const eur = (n) => '€' + Math.round(n).toLocaleString('en-US');
const BAND_LABEL = {
  'Studio': ['Studio', 'Studio'],
  '1BR': ['1 Bedroom', '1 Phòng Ngủ'],
  '2BR': ['2 Bedroom', '2 Phòng Ngủ'],
  '3BR': ['3 Bedroom', '3 Phòng Ngủ'],
  '4BR': ['4 Bedroom', '4 Phòng Ngủ'],
};
// Representative net size (m²) per band — used only to derive an indicative
// Price/m². Approximate; the PDP labels the figure as indicative.
const REP_M2 = { Studio: 30, '1BR': 45, '2BR': 70, '3BR': 120, '4BR': 160 };

// District knowledge (verifiable). `city` is the recognisable city proper used
// in the aspiration statement (CLAUDE.md: never a neighbourhood).
const DISTRICTS = {
  'Kallithea': {
    city: 'Athens',
    en: 'Kallithea is one of central Athens’ largest and fastest-regenerating districts — beside the Stavros Niarchos Foundation Cultural Centre, on the tram to the Athens Riviera and the Syngrou Avenue business spine, minutes from the coast and a short hop from the Acropolis.',
    vi: 'Kallithea là một trong những quận lớn và tái thiết nhanh nhất ở trung tâm Athens — cạnh Trung tâm Văn hóa Stavros Niarchos, trên tuyến tram ra Athens Riviera và trục doanh nghiệp Syngrou, cách bờ biển vài phút và gần Acropolis.',
    proEn: 'Central-Athens regeneration belt by the SNFCC & coastal tram',
    proVi: 'Vành đai tái thiết trung tâm Athens cạnh SNFCC & tram ven biển', loc: 7.0, score: 76,
  },
  'Glyfada': {
    city: 'Athens',
    en: 'Glyfada is the heart of the Athens Riviera — the capital’s premium southern coastal suburb of marinas, blue-flag beaches, golf and luxury retail, on the tram and the regenerated coastal front.',
    vi: 'Glyfada là trái tim của Athens Riviera — vùng ngoại ô ven biển phía nam cao cấp của thủ đô với bến du thuyền, bãi biển cờ xanh, sân golf và bán lẻ xa xỉ, trên tuyến tram và mặt tiền ven biển vừa được tái thiết.',
    proEn: 'Premium Athens Riviera — marinas, beaches & luxury retail',
    proVi: 'Athens Riviera cao cấp — bến du thuyền, bãi biển & bán lẻ xa xỉ', loc: 8.5, score: 80,
  },
  'Piraeus': {
    city: 'Athens',
    en: 'Piraeus is Athens’ historic port city — Europe’s largest passenger port, on Metro Line 3 straight to the airport, a university town drawing major COSCO-led waterfront regeneration.',
    vi: 'Piraeus là thành phố cảng lịch sử của Athens — cảng hành khách lớn nhất châu Âu, trên tuyến Metro 3 thẳng tới sân bay, thành phố đại học đang đón làn sóng tái thiết ven cảng do COSCO dẫn dắt.',
    proEn: 'Athens’ port city on Metro Line 3 — major waterfront regeneration',
    proVi: 'Thành phố cảng Athens trên Metro 3 — tái thiết ven cảng quy mô lớn', loc: 7.0, score: 76,
  },
  'Kifisia': {
    city: 'Athens',
    en: 'Kifisia is Athens’ established premium northern suburb — leafy, upscale, on Metro Line 1, long the address of choice for Athenian families and a deep long-let rental market.',
    vi: 'Kifisia là vùng ngoại ô phía bắc cao cấp lâu đời của Athens — xanh mát, sang trọng, trên tuyến Metro 1, từ lâu là địa chỉ ưa chuộng của các gia đình Athens với thị trường cho thuê dài hạn dồi dào.',
    proEn: 'Premium leafy northern suburb on Metro Line 1',
    proVi: 'Ngoại ô phía bắc cao cấp, xanh mát trên Metro 1', loc: 8.5, score: 80,
  },
  'Palaio Faliro': {
    city: 'Athens',
    en: 'Palaio Faliro is a sought-after Athens Riviera coastal suburb — Flisvos Marina, seafront parks and beaches, on the tram a few stops from Glyfada and central Athens.',
    vi: 'Palaio Faliro là vùng ngoại ô ven biển Athens Riviera được săn đón — bến Flisvos, công viên và bãi biển ven bờ, trên tuyến tram cách Glyfada và trung tâm Athens vài trạm.',
    proEn: 'Athens Riviera coast — Flisvos Marina & the seafront tram',
    proVi: 'Bờ Athens Riviera — bến Flisvos & tram ven biển', loc: 8.0, score: 80,
  },
  'Galaxidi': {
    city: 'Galaxidi',
    en: 'Galaxidi is a protected captains’ town on the Corinthian Gulf beneath Delphi — a picturesque seaside resort about two-and-a-half hours from Athens, prized for second homes and slow tourism.',
    vi: 'Galaxidi là thị trấn thuyền trưởng được bảo tồn bên Vịnh Corinth dưới chân Delphi — khu nghỉ ven biển thơ mộng cách Athens khoảng hai tiếng rưỡi, được ưa chuộng cho ngôi nhà thứ hai và du lịch nghỉ dưỡng.',
    proEn: 'Historic Corinthian-Gulf seaside town beneath Delphi',
    proVi: 'Thị trấn ven biển lịch sử bên Vịnh Corinth dưới chân Delphi', loc: 6.5, score: 74,
  },
};

// ── The Oikos projects with live inventory (Sierra & Curve sold out) ─────────
// bands: [bandKey, fromPriceEUR]. folder = shared Oikos materials folder.
const OIKOS_FOLDER = '1_B4LOufILbrrsHmFgTeKT2_Pjud4QLjI';
const PROJECTS = [
  { slug:'thiseos-kallithea-athens', name:'Thiseos', brand:'Thiseos', district:'Kallithea', type:'Condo',
    bands:[['1BR',250000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'the-one-glyfada-athens', name:'The One', brand:'The One', district:'Glyfada', type:'Condo',
    bands:[['1BR',281000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'opus-residence-kallithea', name:'Opus Residence', brand:'Opus', district:'Kallithea', type:'Condo',
    bands:[['1BR',265000],['2BR',363000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'boulevard-residence-kallithea', name:'Boulevard', brand:'Boulevard', district:'Kallithea', type:'Condo',
    bands:[['1BR',264000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'meridia-piraeus-athens', name:'Meridia', brand:'Meridia', district:'Piraeus', type:'Condo',
    bands:[['1BR',260000],['2BR',317000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'kifisia-suites-park-18', name:'Kifisia Suites — Park 18', brand:'Kifisia Suites', district:'Kifisia', type:'Condo',
    bands:[['1BR',260000],['2BR',330000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'riviera-suites-palaio-faliro', name:'Riviera Suites Faliro', brand:'Riviera Suites', district:'Palaio Faliro', type:'Condo',
    bands:[['2BR',505000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'levante-villas-galaxidi', name:'Levante Villas', brand:'Levante Villas', district:'Galaxidi', type:'Villa',
    bands:[['3BR',646000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
  { slug:'izi-lux-kallithea-athens', name:'Izi Lux', brand:'Izi Lux', district:'Kallithea', type:'Condo',
    bands:[['2BR',315000]], handoverEn:'Handover: completing 2026', handoverVi:'Bàn giao: hoàn thiện 2026' },
];

function buildProps(p) {
  const D = DISTRICTS[p.district];
  const isVilla = p.type === 'Villa';
  const typeEn = isVilla ? 'villa' : 'residence';
  const typeVi = isVilla ? 'biệt thự' : 'căn hộ';
  const regionCity = `${p.district}, Athens`.replace('Galaxidi, Athens', 'Galaxidi, Greece');
  const propName = `${p.name} — ${D.city} (Golden Visa)`;
  const listingUrl = `https://nomadassetcollective.com/property-hub-bat-dong-san/greece/${p.slug}`;
  const folderUrl = `https://drive.google.com/drive/folders/${OIKOS_FOLDER}`;
  const entry = p.bands[0][1];
  const entryBandEn = BAND_LABEL[p.bands[0][0]][0];
  const entryBandVi = BAND_LABEL[p.bands[0][0]][1];
  const ppm2 = Math.round(entry / REP_M2[p.bands[0][0]]);

  const bandsJson = JSON.stringify(p.bands.map(([b, from]) => ({
    en: BAND_LABEL[b][0], vi: BAND_LABEL[b][1], from,
  })));
  const subs = JSON.stringify([
    { key:'brand', label_vi:'Thương Hiệu', label_en:'Brand', val:7.0 },
    { key:'yield', label_vi:'Yield', label_en:'Yield', val:6.5 },
    { key:'location', label_vi:'Vị Trí', label_en:'Location', val:D.loc },
    { key:'management', label_vi:'Quản Lý', label_en:'Management', val:7.0 },
    { key:'liquidity', label_vi:'Thanh Khoản', label_en:'Liquidity', val:7.0 },
    { key:'risk', label_vi:'Rủi Ro', label_en:'Risk', val:7.5 },
  ]);
  const pros = JSON.stringify([
    { en:'5-year renewable EU residence for the whole family — spouse, children and both sets of parents', vi:'Thẻ cư trú EU 5 năm gia hạn cho cả gia đình — vợ/chồng, con cái và cha mẹ hai bên' },
    { en:'Schengen free movement; no minimum-stay requirement; citizenship path after 7 years', vi:'Tự do đi lại Schengen; không yêu cầu thời gian lưu trú tối thiểu; lộ trình quốc tịch sau 7 năm' },
    { en:'Greece’s Golden Visa is Europe’s most-applied residence-by-investment route', vi:'Golden Visa Hy Lạp là chương trình định cư theo đầu tư được nộp nhiều nhất châu Âu' },
    { en:D.proEn, vi:D.proVi },
    { en:'EUR-priced freehold title; furnished handover + developer prepaid-rent programme', vi:'Sở hữu vĩnh viễn định giá EUR; bàn giao nội thất + chương trình trả trước tiền thuê của CĐT' },
  ]);
  const cons = JSON.stringify([
    { en:'Golden Visa qualifying amount depends on area & route — confirm eligibility per unit', vi:'Mức đầu tư đủ điều kiện Golden Visa tùy khu vực & lộ trình — cần xác nhận theo từng căn' },
    { en:'A residence permit, not immediate citizenship — the naturalisation path is ~7 years', vi:'Là thẻ cư trú, không phải quốc tịch ngay — lộ trình nhập tịch khoảng 7 năm' },
    { en:'Greek residential yields are moderate — a residence-plus-capital play, not high cash-flow', vi:'Lợi suất nhà ở Hy Lạp ở mức vừa phải — thiên về cư trú + tăng giá vốn, không phải dòng tiền cao' },
    { en:'Indicative pricing — confirm live availability before relying on it', vi:'Giá tham khảo — cần xác nhận căn còn trống trước khi sử dụng' },
  ]);
  const feats = JSON.stringify([
    { icon:'🛂', en:'Greece Golden Visa eligible — €250k–€800k by area & route', vi:'Đủ điều kiện Golden Visa Hy Lạp — €250k–€800k tùy khu vực & lộ trình' },
    { icon:'🇪🇺', en:'5-year renewable EU residence + Schengen mobility', vi:'Thẻ cư trú EU 5 năm gia hạn + đi lại Schengen' },
    { icon:'🛋️', en:'Furnished handover + developer prepaid-rent programme', vi:'Bàn giao nội thất + chương trình trả trước tiền thuê của CĐT' },
    { icon:'📍', en:`${p.district} — ${D.proEn.replace(/^[^—]*— ?/, '')}`, vi:`${p.district} — ${D.proVi.replace(/^[^—]*— ?/, '')}` },
    { icon:'🔑', en:p.handoverEn, vi:p.handoverVi },
  ]);
  const proc = JSON.stringify([
    { n:'01', dur_vi:'Tuần 1–2', dur_en:'Week 1–2', title_vi:'Xét Điều Kiện & Chọn Căn', title_en:'Eligibility & Unit Selection', body_vi:'Xác nhận lộ trình Golden Visa (€250k/€400k/€800k) và chọn căn theo loại/tầng.', body_en:'Confirm the Golden Visa route (€250k/€400k/€800k) and select a unit by type/floor.' },
    { n:'02', dur_vi:'Tuần 2–6', dur_en:'Week 2–6', title_vi:'Đặt Cọc & Mua', title_en:'Reservation & Purchase', body_vi:'Đặt cọc, ký qua công chứng Hy Lạp, lấy mã số thuế (AFM) và mở tài khoản ngân hàng.', body_en:'Reserve, sign via a Greek notary, obtain a Greek tax number (AFM) and open a bank account.' },
    { n:'03', dur_vi:'Tháng 2–4', dur_en:'Month 2–4', title_vi:'Sang Tên & Đầu Tư', title_en:'Title Transfer & Investment', body_vi:'Hoàn tất chuyển nhượng và khoản đầu tư đủ ngưỡng Golden Visa.', body_en:'Complete the property transfer and the qualifying Golden Visa investment.' },
    { n:'04', dur_vi:'Tháng 4–8', dur_en:'Month 4–8', title_vi:'Hồ Sơ Golden Visa', title_en:'Golden Visa Application', body_vi:'Nộp đơn thẻ cư trú; lấy sinh trắc; cấp thẻ cho cả gia đình.', body_en:'File the residence-permit application; biometrics; permits issued for the whole family.' },
  ]);

  const noteEn = `${p.name} is ${D.city === 'Galaxidi' ? 'a Corinthian-Gulf' : 'an Athens'} ${typeEn} eligible for Greece’s Golden Visa — Europe’s most popular residence-by-investment programme, granting the whole family a 5-year renewable EU residence permit, Schengen free movement and a path to citizenship after seven years, with no minimum-stay requirement. ${D.en} ${entryBandEn} units start at ${eur(entry)}. The qualifying investment depends on area and route — €250,000 via a commercial-to-residential conversion or listed-building restoration, €400,000 across most of Greece, or €800,000 for a single Attica residence — so NAC confirms the eligible route per unit. The developer’s prepaid-rent programme and furnished handover make it a hands-off EU-residence-plus-yield hold. ${p.handoverEn}. Figures are from the developer price list; confirm live availability before relying on them.`;
  const noteVi = `${p.name} là ${typeVi} ${D.city === 'Galaxidi' ? 'bên Vịnh Corinth' : 'tại Athens'} đủ điều kiện Golden Visa Hy Lạp — chương trình định cư theo đầu tư phổ biến nhất châu Âu, cấp cho cả gia đình thẻ cư trú EU 5 năm gia hạn, tự do đi lại Schengen và lộ trình quốc tịch sau bảy năm, không yêu cầu thời gian lưu trú. ${D.vi} Căn ${entryBandVi} khởi điểm từ ${eur(entry)}. Mức đầu tư đủ điều kiện tùy khu vực và lộ trình — €250.000 qua chuyển đổi thương mại sang nhà ở hoặc trùng tu tòa nhà di sản, €400.000 ở phần lớn Hy Lạp, hoặc €800.000 cho một căn nhà ở tại Attica — nên NAC xác nhận lộ trình phù hợp theo từng căn. Chương trình trả trước tiền thuê của CĐT và bàn giao nội thất biến đây thành khoản giữ "cư trú EU + lợi suất" không cần bận tâm. ${p.handoverVi}. Số liệu lấy từ bảng giá CĐT; cần xác nhận căn còn trống trước khi sử dụng.`;

  const txt = (s) => ({ rich_text: s == null || s === '' ? [] : [{ text: { content: String(s).slice(0, 1990) } }] });
  const sel = (n) => ({ select: { name: n } });
  const num = (n) => ({ number: n });
  const yld = 0.05, mri = Math.round(entry * yld / 12);
  const cityForStmt = D.city;

  return {
    'Property Name': { title: [{ text: { content: propName } }] },
    'Name VI': txt(`${p.name} — ${D.city} (Golden Visa)`),
    'Country': sel('Greece'), 'Currency': sel('EUR'), 'Region': sel('eu'),
    'Region/City': txt(regionCity), '📍 District': txt(p.district),
    'City': txt(D.city),
    '🏨 Hub Type': sel(p.type), '🛂 Immigration Type': sel('RBI'),
    'Investment Program': sel('Greece Golden Visa'), 'Exit Strategy': sel('Hold Long-term'),
    'Tags': { multi_select: [{ name: 'Residency' }, { name: 'Must Know' }] },
    'Freehold': { checkbox: true }, '💸 Tax-Friendly': { checkbox: true },
    'Hub Status': sel(HUB_STATUS), 'Status': { status: { name: 'Listed' } },
    '🔗 Slug': txt(p.slug), 'Listing URL': { url: listingUrl }, 'GS Source Folder': { url: folderUrl },
    'Purchase Price': num(entry), 'Price Per M2': num(ppm2),
    'Yield %': num(yld), 'IRR %': num(0.10), 'ROI %': num(0.10), 'Cash-on-Cash %': num(0.045),
    'Monthly Rental Income': num(mri), 'Monthly Expenses': num(0),
    'Cash Flow': num(Math.round(entry * yld)), 'Payback Years': num(18), 'Minimum Hold Period': num(5),
    '⭐ NAC Score': num(D.score),
    'Excerpt EN': txt(`Greece Golden Visa ${typeEn} in ${regionCity}. ${entryBandEn} from ${eur(entry)}; 5-yr renewable EU residence + Schengen for the whole family.`),
    'Excerpt VI': txt(`${typeVi.charAt(0).toUpperCase() + typeVi.slice(1)} Golden Visa Hy Lạp tại ${regionCity}. ${entryBandVi} từ ${eur(entry)}; thẻ cư trú EU 5 năm + Schengen cho cả gia đình.`),
    '🏷️ Tagline EN': txt(`EU residence + Schengen in ${p.district}`),
    '🏷️ Tagline VI': txt(`Cư trú EU + Schengen tại ${p.district}`),
    '📝 Desc EN': txt(`${p.name} is ${D.city === 'Galaxidi' ? 'a Corinthian-Gulf' : 'an Athens'} ${typeEn}, priced in EUR and eligible for Greece’s Golden Visa residence-by-investment programme. ${D.en} Units start at ${eur(entry)} (${entryBandEn}), delivered furnished with an optional developer prepaid-rent programme. The Golden Visa grants the whole family a 5-year renewable EU residence permit with Schengen free movement and no minimum-stay requirement. ${p.handoverEn}.`),
    '📝 Desc VI': txt(`${p.name} là ${typeVi} ${D.city === 'Galaxidi' ? 'bên Vịnh Corinth' : 'tại Athens'} định giá EUR, đủ điều kiện chương trình định cư theo đầu tư Golden Visa Hy Lạp. ${D.vi} Căn khởi điểm từ ${eur(entry)} (${entryBandVi}), bàn giao nội thất kèm tùy chọn chương trình trả trước tiền thuê của CĐT. Golden Visa cấp cho cả gia đình thẻ cư trú EU 5 năm gia hạn, tự do đi lại Schengen và không yêu cầu thời gian lưu trú. ${p.handoverVi}.`),
    '✦ Brand': txt(p.brand),
    '✦ Brand Intro EN': txt(`${p.name} — a residential development in ${regionCity}, offered under Greece’s Golden Visa residence-by-investment programme with a developer prepaid-rent option.`),
    '✦ Brand Intro VI': txt(`${p.name} — dự án nhà ở tại ${regionCity}, chào bán theo chương trình định cư Golden Visa Hy Lạp kèm tùy chọn trả trước tiền thuê của CĐT.`),
    '🌍 Market EN': txt(`Greece’s Golden Visa is Europe’s most-applied residence-by-investment programme — a 5-year renewable EU permit for the whole family, Schengen free movement and no minimum-stay requirement, with a path to citizenship after seven years. Athens residential values have re-rated sharply since 2017 on tourism, the SNFCC/Ellinikon regeneration and foreign demand, while the post-2024 tiering (€250k conversion / €400k / €800k Attica) keeps well-chosen stock in demand. EUR pricing and EU rule-of-law give hard-currency stability rare among residence-by-investment markets.`),
    '🌍 Market VI': txt(`Golden Visa Hy Lạp là chương trình định cư theo đầu tư được nộp nhiều nhất châu Âu — thẻ EU 5 năm gia hạn cho cả gia đình, tự do đi lại Schengen, không yêu cầu lưu trú, kèm lộ trình quốc tịch sau bảy năm. Giá nhà Athens đã tăng mạnh từ 2017 nhờ du lịch, tái thiết SNFCC/Ellinikon và cầu nước ngoài, trong khi cơ chế phân tầng sau 2024 (€250k chuyển đổi / €400k / €800k Attica) giữ nguồn cung chọn lọc luôn có cầu. Định giá EUR và pháp quyền EU mang lại sự ổn định ngoại tệ hiếm có trong các thị trường định cư theo đầu tư.`),
    '🌏 Key Markets EN': txt('Vietnam · China · Middle East · Turkey · Europe'),
    '🌏 Key Markets VI': txt('Việt Nam · Trung Quốc · Trung Đông · Thổ Nhĩ Kỳ · Châu Âu'),
    '🏖️ Beach EN': txt(D.city === 'Galaxidi' ? 'Corinthian-Gulf waterfront on the doorstep' : 'Athens Riviera beaches & marinas within reach'),
    '🏖️ Beach VI': txt(D.city === 'Galaxidi' ? 'Bờ Vịnh Corinth ngay trước cửa' : 'Bãi biển & bến du thuyền Athens Riviera trong tầm với'),
    '✈️ Airport EN': txt(D.city === 'Galaxidi' ? 'Athens Int’l (ATH) — ~2.5 hrs by road' : 'Athens Int’l Airport (ATH) — 30–45 min'),
    '✈️ Airport VI': txt(D.city === 'Galaxidi' ? 'Sân bay quốc tế Athens (ATH) — ~2,5 giờ đường bộ' : 'Sân bay quốc tế Athens (ATH) — 30–45 phút'),
    '📈 Property YoY EN': txt('+5–8%/yr EUR — Athens 2023–2026 (NAC estimate)'),
    '📈 Property YoY VI': txt('+5–8%/năm EUR — Athens 2023–2026 (NAC ước tính)'),
    '💬 NAC Note EN': txt(noteEn), '💬 NAC Note VI': txt(noteVi),
    '📜 Statement EN': txt(`Own a «${p.brand}» ${typeEn} in «${cityForStmt}».`),
    '📜 Statement VI': txt(`Sở hữu ${typeVi} «${p.brand}» tại «${cityForStmt}».`),
    '📊 Sub-Scores JSON': txt(subs), '✅ Pros JSON': txt(pros), '⚠️ Cons JSON': txt(cons),
    '✨ Features JSON': txt(feats), '🔄 Process JSON': txt(proc),
    '💲 Price Bands JSON': txt(bandsJson),
    '🔑 Handover EN': txt(p.handoverEn), '🔑 Handover VI': txt(p.handoverVi),
    '🎬 Cine 1 EN': txt(`${D.city} · where Europe began`), '🎬 Cine 1 VI': txt(`${D.city} · nơi châu Âu bắt đầu`),
    '🎬 Cine 2 EN': txt('A home, a Schengen key, a yield'), '🎬 Cine 2 VI': txt('Một mái nhà, một tấm vé Schengen, một dòng tiền'),
    '🎬 Cine 3 EN': txt('Greece · light, sea, and a place in Europe'), '🎬 Cine 3 VI': txt('Hy Lạp · ánh sáng, biển cả, và một chỗ đứng ở châu Âu'),
    'Listing Date': { date: { start: new Date().toISOString().slice(0, 10) } },
    _slug: p.slug, _name: propName, _entry: entry, _bands: p.bands.map(b => b[0]).join('/'),
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
  console.log(`generate-gr-listings — ${PROJECTS.length} projects, Hub Status=${HUB_STATUS}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const existing = await existingSlugs();
  let made = 0, skip = 0;
  for (const p of PROJECTS) {
    if (existing.has(p.slug)) { console.log(`  ⤳ ${p.slug}: exists, skipping`); skip++; continue; }
    const props = buildProps(p);
    const name = props._name, entry = props._entry, bands = props._bands;
    delete props._slug; delete props._name; delete props._entry; delete props._bands;
    console.log(`  ${DRY_RUN ? '[dry] would create' : '✓ creating'} ${p.slug} — ${name} | ${p.district} | entry ${eur(entry)} | bands ${bands}`);
    if (!DRY_RUN) await notion.pages.create({ parent: { database_id: DB }, properties: props });
    made++;
  }
  console.log(`\nDone. ${made} ${DRY_RUN ? 'previewed' : 'created'}, ${skip} skipped.`);
})().catch(e => { console.error(e); process.exit(1); });
