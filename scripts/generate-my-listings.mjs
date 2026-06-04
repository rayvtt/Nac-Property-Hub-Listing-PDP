#!/usr/bin/env node
// Creates the Malaysia (Kuala Lumpur) Notion listings from developer fact
// sheets in the OTG Drive (PROPERTIES → MALAYSIA). Real MYR pricing from the
// Conlay Signature Suites fact sheet (Patsawan Properties — Eastern & Oriental
// × Mitsui Fudosan JV), per-unit-type price bands derived from the quoted
// RM2,491–3,318 psf range × built-up area, plus Malaysia MM2H + KLCC-grounded
// bilingual editorial.
//
// Mirrors generate-gr-listings.mjs / generate-tr-listings.mjs. Idempotent:
// skips a project whose 🔗 Slug already exists. Listings are created Draft by
// default — KLCC luxury yields are modest and the Drive folder ships only a
// fact sheet + floor plans (no real photos), so a row only flips to Live once
// real hero/gallery imagery lands (sync-images web-search fallback) and the
// financials are confirmed. Env: NOTION_TOKEN (req), NOTION_DATABASE_ID,
// HUB_STATUS (default Draft), DRY_RUN=true (log only).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const HUB_STATUS = process.env.HUB_STATUS || 'Draft';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN });

const rm = (n) => 'RM' + Math.round(n).toLocaleString('en-US');

// ── Projects (OTG Drive → PROPERTIES/MALAYSIA) ──────────────────────────────
// Conlay Signature Suites fact sheet: 51-storey freehold serviced apartments,
// 194 units (L37–48 & 51), 635–3,617 sqft (1BR–3+1BR), RM1,582,000–12,000,000
// (RM2,491–3,318 psf), completed Q2 2025. Per-type "from" prices below are the
// built-up area × the quoted minimum psf (RM2,491); 1BR min and 3BR max are
// the developer's quoted endpoints.
const PROJECTS = [
  {
    slug: 'conlay-signature-suites-klcc',
    folder: '1DeLsgl0ifZYixxoJwVUcKFquNCnPjB8M',
    props: {
      'Property Name': { title: [{ text: { content: 'The Conlay Signature Suites — Kuala Lumpur (MM2H)' } }] },
      'Name VI': txt('The Conlay Signature Suites — Kuala Lumpur (MM2H)'),
      'Country': sel('Malaysia'), 'Currency': sel('MYR'), 'Region': sel('asia'),
      'Region/City': txt('KLCC, Kuala Lumpur'), '📍 District': txt('Jalan Conlay, KLCC'), 'City': txt('Kuala Lumpur'),
      '🏨 Hub Type': sel('Condo'), '🛂 Immigration Type': sel('RBI'),
      'Investment Program': sel('Malaysia MM2H'), 'Exit Strategy': sel('Hold Long-term'),
      'Tags': { multi_select: [{ name: 'Freehold' }, { name: 'Residency' }, { name: 'Must Know' }] },
      'Freehold': { checkbox: true }, '💸 Tax-Friendly': { checkbox: true }, '🌟 Hotel-Branded': { checkbox: false },
      'Hub Status': sel(HUB_STATUS), 'Status': { status: { name: 'Listed' } },
      '🔗 Slug': txt('conlay-signature-suites-klcc'),
      'Listing URL': { url: 'https://nomadassetcollective.com/property-hub-bat-dong-san/malaysia/conlay-signature-suites-klcc' },
      'GS Source Folder': { url: 'https://drive.google.com/drive/folders/1DeLsgl0ifZYixxoJwVUcKFquNCnPjB8M' },
      'Purchase Price': num(1582000), 'Price Per M2': num(26800),
      'Yield %': num(0.04), 'IRR %': num(0.052), 'ROI %': num(0.052), 'Cash-on-Cash %': num(0.027),
      'Monthly Rental Income': num(5250), 'Monthly Expenses': num(1680), 'Cash Flow': num(42840),
      'Payback Years': num(25), 'Minimum Hold Period': num(5), '⭐ NAC Score': num(76),
      'Excerpt EN': txt('Freehold serviced apartments in the heart of KLCC by Eastern & Oriental × Mitsui Fudosan, designed by Kerry Hill. 1-bed from RM1.58M; completed 2025, MM2H-ready.'),
      'Excerpt VI': txt('Căn hộ dịch vụ sở hữu vĩnh viễn ngay trung tâm KLCC, do Eastern & Oriental × Mitsui Fudosan phát triển, thiết kế Kerry Hill. 1PN từ RM1,58 triệu; hoàn thành 2025, sẵn sàng MM2H.'),
      '🏷️ Tagline EN': txt('E&O × Mitsui serviced living in the heart of KLCC'),
      '🏷️ Tagline VI': txt('Căn hộ dịch vụ E&O × Mitsui giữa lòng KLCC'),
      '📝 Desc EN': txt("The Conlay Signature Suites is a 51-storey freehold serviced-apartment tower on Jalan Conlay, in the heart of Kuala Lumpur City Centre (KLCC). Developed by Patsawan Properties — a joint venture between Malaysia's Eastern & Oriental Berhad and Japan's Mitsui Fudosan Group — and designed by Kerry Hill Architects with landscaping by Seksan Design, it offers 1-bedroom to 3+1-bedroom residences from 635 to 3,617 sq ft, priced from RM1,582,000 (RM2,491–3,318 psf). Completed in Q2 2025 on a built-and-sell basis, units hand over ready to move in, with five-star hospitality — concierge, sky dining, heated infinity pools, gym, spa and themed communal lounges across two facility floors. Freehold title is open to foreign buyers and supports Malaysia's MM2H long-stay residency."),
      '📝 Desc VI': txt('The Conlay Signature Suites là tháp căn hộ dịch vụ sở hữu vĩnh viễn 51 tầng trên đường Jalan Conlay, ngay trung tâm Kuala Lumpur City Centre (KLCC). Do Patsawan Properties — liên doanh giữa Eastern & Oriental Berhad (Malaysia) và Mitsui Fudosan Group (Nhật Bản) — phát triển, thiết kế bởi Kerry Hill Architects và cảnh quan Seksan Design, dự án có các căn từ 1 phòng ngủ đến 3+1 phòng ngủ, diện tích 635–3.617 sq ft, giá từ RM1.582.000 (RM2.491–3.318/sq ft). Hoàn thành Q2 2025 theo mô hình xây xong mới bán, bàn giao sẵn sàng dọn vào ở, với dịch vụ 5 sao — lễ tân, sky dining, hồ bơi vô cực nước ấm, gym, spa và các sảnh sinh hoạt chuyên đề trên hai tầng tiện ích. Sở hữu vĩnh viễn, mở cho người nước ngoài và hỗ trợ thẻ cư trú dài hạn MM2H của Malaysia.'),
      '✦ Brand': txt('The Conlay'),
      '✦ Brand Intro EN': txt("The Conlay is Eastern & Oriental's landmark serviced-apartment address on Jalan Conlay — an E&O × Mitsui Fudosan collaboration delivering Kerry Hill–designed freehold residences with full five-star hospitality in the heart of KLCC."),
      '✦ Brand Intro VI': txt('The Conlay là địa chỉ căn hộ dịch vụ biểu tượng của Eastern & Oriental trên đường Jalan Conlay — sự hợp tác E&O × Mitsui Fudosan, mang đến các căn hộ sở hữu vĩnh viễn do Kerry Hill thiết kế cùng dịch vụ 5 sao trọn vẹn giữa lòng KLCC.'),
      '🌍 Market EN': txt("Kuala Lumpur pairs a freehold-friendly property market with Malaysia's MM2H long-stay residency — a renewable visa (Silver/Gold/Platinum tiers) for the whole family, with foreigners able to own freehold above the state price floor (RM1m in KL). KLCC is the capital's trophy core: the Petronas Twin Towers, KLCC Park, Pavilion KL and the financial district. Prime yields are modest (~3–4% gross) and capital growth has been steady rather than spectacular amid healthy supply, so the play is a hard-asset, lifestyle and residency hold in a low-tax, English-speaking, MYR-priced market with deep regional demand from China, Singapore and the Gulf."),
      '🌍 Market VI': txt('Kuala Lumpur kết hợp thị trường bất động sản thân thiện sở hữu vĩnh viễn với chương trình cư trú dài hạn MM2H của Malaysia — visa gia hạn (bậc Silver/Gold/Platinum) cho cả gia đình, người nước ngoài được sở hữu vĩnh viễn trên mức sàn giá của bang (RM1 triệu tại KL). KLCC là lõi trung tâm danh giá của thủ đô: tháp đôi Petronas, công viên KLCC, Pavilion KL và khu tài chính. Lợi suất hạng sang ở mức vừa phải (~3–4% gộp) và tăng giá vốn ổn định trong bối cảnh nguồn cung dồi dào, nên đây là khoản nắm giữ tài sản thực, phong cách sống và cư trú trong một thị trường thuế thấp, nói tiếng Anh, định giá MYR với nhu cầu khu vực mạnh từ Trung Quốc, Singapore và vùng Vịnh.'),
      '🌏 Key Markets EN': txt('China · Singapore · Vietnam · Middle East · Japan · Korea'),
      '🌏 Key Markets VI': txt('Trung Quốc · Singapore · Việt Nam · Trung Đông · Nhật Bản · Hàn Quốc'),
      '🏖️ Beach EN': txt('Inland capital — KLCC Park lake, Bukit Bintang & city parklands at the door'),
      '🏖️ Beach VI': txt('Thủ đô trong đất liền — hồ công viên KLCC, Bukit Bintang & mảng xanh đô thị ngay cửa'),
      '✈️ Airport EN': txt("Kuala Lumpur Int'l (KUL) — ~45 min; KL Sentral & city rail close by"),
      '✈️ Airport VI': txt('Sân bay quốc tế Kuala Lumpur (KUL) — ~45 phút; KL Sentral & đường sắt đô thị gần kề'),
      '📈 Property YoY EN': txt('+1–3%/yr MYR — KL prime 2023–2026 (NAC estimate)'),
      '📈 Property YoY VI': txt('+1–3%/năm MYR — KL hạng sang 2023–2026 (NAC ước tính)'),
      '💬 NAC Note EN': txt("The Conlay Signature Suites is a freehold serviced apartment in the heart of KLCC, eligible to support Malaysia's MM2H long-stay residency — a renewable visa for the whole family with generous stay rights in a low-tax, English-speaking hub. Built by an Eastern & Oriental × Mitsui Fudosan joint venture and designed by Kerry Hill Architects, it completed in Q2 2025 and hands over ready to move in. 1-bedroom units start at RM1,582,000 (RM2,491–3,318 psf). NAC reads this as a capital-preservation and lifestyle hold rather than a high-yield play: KL prime gross yields run ~3–4% and growth is steady, so the value is the trophy address, freehold title and residency optionality. Figures other than the developer's price/psf are NAC estimates; confirm live availability and current MM2H tiers before relying on them."),
      '💬 NAC Note VI': txt('The Conlay Signature Suites là căn hộ dịch vụ sở hữu vĩnh viễn ngay trung tâm KLCC, đủ điều kiện hỗ trợ chương trình cư trú dài hạn MM2H của Malaysia — visa gia hạn cho cả gia đình với quyền lưu trú rộng rãi tại một trung tâm thuế thấp, nói tiếng Anh. Do liên doanh Eastern & Oriental × Mitsui Fudosan xây dựng và Kerry Hill Architects thiết kế, dự án hoàn thành Q2 2025 và bàn giao sẵn sàng dọn vào ở. Căn 1 phòng ngủ khởi điểm từ RM1.582.000 (RM2.491–3.318/sq ft). NAC xem đây là khoản giữ bảo toàn vốn và phong cách sống hơn là dòng tiền cao: lợi suất gộp hạng sang KL khoảng 3–4% và tăng giá ổn định, nên giá trị nằm ở địa chỉ danh giá, sở hữu vĩnh viễn và lựa chọn cư trú. Các số liệu ngoài giá/psf của CĐT là ước tính của NAC; cần xác nhận căn còn trống và các bậc MM2H hiện hành trước khi sử dụng.'),
      '📜 Statement EN': txt('Own a «Conlay» serviced residence in «Kuala Lumpur».'),
      '📜 Statement VI': txt('Sở hữu căn hộ dịch vụ «Conlay» tại «Kuala Lumpur».'),
      '📊 Sub-Scores JSON': txt(JSON.stringify([
        { key: 'brand', label_vi: 'Thương Hiệu', label_en: 'Brand', val: 7.5 },
        { key: 'yield', label_vi: 'Yield', label_en: 'Yield', val: 5.0 },
        { key: 'location', label_vi: 'Vị Trí', label_en: 'Location', val: 9.0 },
        { key: 'management', label_vi: 'Quản Lý', label_en: 'Management', val: 7.5 },
        { key: 'liquidity', label_vi: 'Thanh Khoản', label_en: 'Liquidity', val: 6.5 },
        { key: 'risk', label_vi: 'Rủi Ro', label_en: 'Risk', val: 7.0 },
      ])),
      '✅ Pros JSON': txt(JSON.stringify([
        { en: 'Trophy KLCC address on Jalan Conlay — steps from KLCC Park, the Petronas Twin Towers and Pavilion KL', vi: 'Địa chỉ vàng KLCC trên đường Jalan Conlay — sát công viên KLCC, tháp đôi Petronas và Pavilion KL' },
        { en: 'Freehold title open to foreign buyers — supports Malaysia MM2H long-stay residency for the family', vi: 'Sở hữu vĩnh viễn, mở cho người nước ngoài — hỗ trợ thẻ cư trú dài hạn MM2H Malaysia cho cả gia đình' },
        { en: 'Blue-chip pedigree: an Eastern & Oriental × Mitsui Fudosan joint venture, designed by Kerry Hill Architects', vi: 'Chủ đầu tư đẳng cấp: liên doanh Eastern & Oriental × Mitsui Fudosan, thiết kế bởi Kerry Hill Architects' },
        { en: 'Completed and handed over (Q2 2025) — no construction risk, ready to move in or rent immediately', vi: 'Đã hoàn thành và bàn giao (Q2 2025) — không rủi ro xây dựng, sẵn sàng dọn vào ở hoặc cho thuê ngay' },
        { en: 'Five-star serviced-apartment management — concierge, sky dining, heated infinity pools, gym & spa', vi: 'Vận hành căn hộ dịch vụ 5 sao — lễ tân, sky dining, hồ bơi vô cực nước ấm, gym & spa' },
      ])),
      '⚠️ Cons JSON': txt(JSON.stringify([
        { en: 'KL prime yields are modest (~3–4% gross) — a lifestyle/residency and capital-preservation hold, not a high cash-flow play', vi: 'Lợi suất KL hạng sang ở mức vừa phải (~3–4% gộp) — thiên về phong cách sống/cư trú và bảo toàn vốn, không phải dòng tiền cao' },
        { en: 'KLCC luxury segment carries meaningful supply — resale liquidity is moderate and pricing discipline matters', vi: 'Phân khúc cao cấp KLCC có nguồn cung đáng kể — thanh khoản thứ cấp vừa phải, cần kỷ luật về giá' },
        { en: 'MYR currency exposure for foreign buyers', vi: 'Rủi ro tỷ giá MYR đối với người mua nước ngoài' },
        { en: 'MM2H tiers and the RM1m KLCC foreign-purchase floor change periodically — confirm current rules per applicant', vi: 'Các bậc MM2H và mức sàn mua RM1 triệu cho người nước ngoài tại KLCC thay đổi theo thời kỳ — cần xác nhận quy định hiện hành theo từng hồ sơ' },
      ])),
      '✨ Features JSON': txt(JSON.stringify([
        { icon: '🛂', en: 'Malaysia MM2H eligible — a renewable long-stay visa for the whole family', vi: 'Đủ điều kiện MM2H Malaysia — visa lưu trú dài hạn gia hạn cho cả gia đình' },
        { icon: '🏗️', en: 'Eastern & Oriental × Mitsui Fudosan JV, designed by Kerry Hill Architects', vi: 'Liên doanh Eastern & Oriental × Mitsui Fudosan, thiết kế Kerry Hill Architects' },
        { icon: '🏙️', en: 'Freehold serviced apartments in the heart of KLCC, Jalan Conlay', vi: 'Căn hộ dịch vụ sở hữu vĩnh viễn ngay trung tâm KLCC, Jalan Conlay' },
        { icon: '🛎️', en: 'Five-star hospitality — concierge, sky dining, heated infinity pools, gym & spa', vi: 'Dịch vụ 5 sao — lễ tân, sky dining, hồ bơi vô cực nước ấm, gym & spa' },
        { icon: '🔑', en: 'Completed Q2 2025 — built-and-sell, ready to move in', vi: 'Hoàn thành Q2 2025 — xây xong mới bán, sẵn sàng dọn vào ở' },
      ])),
      '🔄 Process JSON': txt(JSON.stringify([
        { n: '01', dur_vi: 'Tuần 1–2', dur_en: 'Week 1–2', title_vi: 'Xét Điều Kiện & Chọn Căn', title_en: 'Eligibility & Unit Selection', body_vi: 'Xác nhận điều kiện sở hữu cho người nước ngoài (sàn RM1 triệu tại KLCC) và mục tiêu MM2H, chọn căn theo loại/tầng.', body_en: 'Confirm foreign-ownership eligibility (the RM1m KLCC floor) and the MM2H objective, then select a unit by type/floor.' },
        { n: '02', dur_vi: 'Tuần 2–6', dur_en: 'Week 2–6', title_vi: 'Đặt Cọc & Ký SPA', title_en: 'Reservation & SPA', body_vi: 'Đặt cọc, ký Hợp đồng Mua Bán (SPA) và nộp hồ sơ xin chấp thuận chuyển nhượng cho người nước ngoài của bang.', body_en: 'Reserve, sign the Sale & Purchase Agreement (SPA) and file for state consent to transfer to a foreign buyer.' },
        { n: '03', dur_vi: 'Tháng 2–4', dur_en: 'Month 2–4', title_vi: 'Sang Tên & Thanh Toán', title_en: 'Title Transfer & Settlement', body_vi: 'Hoàn tất thanh toán/giải ngân và đăng bộ sang tên sở hữu vĩnh viễn.', body_en: 'Complete payment/financing and register the freehold title transfer.' },
        { n: '04', dur_vi: 'Tháng 3–6', dur_en: 'Month 3–6', title_vi: 'Hồ Sơ MM2H', title_en: 'MM2H Application', body_vi: 'Nộp hồ sơ MM2H (tiền gửi cố định + điều kiện theo bậc); cấp thị thực cho cả gia đình.', body_en: 'File the MM2H application (fixed deposit + tier conditions); visas issued for the whole family.' },
      ])),
      '💲 Price Bands JSON': txt(JSON.stringify([
        { en: '1 Bedroom', vi: '1 Phòng Ngủ', from: 1582000 },
        { en: '1+1 Bedroom', vi: '1+1 Phòng Ngủ', from: 2359000 },
        { en: '2 Bedroom', vi: '2 Phòng Ngủ', from: 3325000 },
        { en: '3 Bedroom', vi: '3 Phòng Ngủ', from: 12000000 },
      ])),
      '🔑 Handover EN': txt('Completed Q2 2025 — built & ready to move in'),
      '🔑 Handover VI': txt('Hoàn thành Q2 2025 — bàn giao sẵn sàng dọn vào ở'),
      '🎬 Cine 1 EN': txt('Kuala Lumpur · the tropical metropolis'), '🎬 Cine 1 VI': txt('Kuala Lumpur · đô thị nhiệt đới'),
      '🎬 Cine 2 EN': txt('A Kerry Hill landmark above KLCC'), '🎬 Cine 2 VI': txt('Dấu ấn Kerry Hill trên cao KLCC'),
      '🎬 Cine 3 EN': txt('Freehold in the heart of the city'), '🎬 Cine 3 VI': txt('Sở hữu vĩnh viễn giữa lòng thành phố'),
      'Listing Date': { date: { start: new Date().toISOString().slice(0, 10) } },
    },
  },
];

function txt(s) { return { rich_text: s == null || s === '' ? [] : [{ text: { content: String(s).slice(0, 1990) } }] }; }
function sel(n) { return { select: { name: n } }; }
function num(n) { return { number: n }; }

async function existingSlugs() {
  const set = new Set(); let cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      const s = pg.properties['🔗 Slug'];
      const v = s && s.rich_text ? s.rich_text.map((t) => t.plain_text).join('') : '';
      if (v) set.add(v);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return set;
}

(async () => {
  console.log(`generate-my-listings — ${PROJECTS.length} project(s), Hub Status=${HUB_STATUS}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const existing = await existingSlugs();
  let made = 0, skip = 0;
  for (const p of PROJECTS) {
    if (existing.has(p.slug)) { console.log(`  ⤳ ${p.slug}: exists, skipping`); skip++; continue; }
    const entry = p.props['Purchase Price'].number;
    console.log(`  ${DRY_RUN ? '[dry] would create' : '✓ creating'} ${p.slug} — entry ${rm(entry)}`);
    if (!DRY_RUN) await notion.pages.create({ parent: { database_id: DB }, properties: p.props });
    made++;
  }
  console.log(`\nDone. ${made} ${DRY_RUN ? 'previewed' : 'created'}, ${skip} skipped.`);
})().catch((e) => { console.error(e); process.exit(1); });
