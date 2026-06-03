#!/usr/bin/env node
// Bulk-generate Draft Notion listing rows for every Australia project folder
// with >=5 images (enough to fill a PDP). Idempotent: skips any project whose
// Drive folder is already wired to an existing row (so the hand-built ones are
// never duplicated). Rows are created as Hub Status = Draft — nothing
// publishes until a human flips them Live.
//
// Financials are NAC city/type-tier ESTIMATES (clearly growth-led for AU resi);
// editorial + JSON blocks are templated from project name / suburb / city /
// asset type so no required field is left empty. Refine standouts by hand.
//
// Auth: service account (Drive) + NOTION_TOKEN. Run via the
// generate-au-listings workflow.

import { google } from 'googleapis';
import { Client as NotionClient } from '@notionhq/client';

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GSC_OAUTH_CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID;
const GSC_OAUTH_CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const GSC_OAUTH_REFRESH_TOKEN = process.env.GSC_OAUTH_REFRESH_TOKEN;
const HAS_OAUTH = !!(GSC_OAUTH_CLIENT_ID && GSC_OAUTH_CLIENT_SECRET && GSC_OAUTH_REFRESH_TOKEN);
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const ROOT = (process.env.DRIVE_TREE_ROOT || '').trim() || '1n4F9kZ2nfTsRH0qGW-OtXCqT_zN9Nzu-';
const MIN_IMAGES = Number(process.env.MIN_IMAGES || 5);
const MAX_DEPTH = 8;
const DRY_RUN = process.env.DRY_RUN === 'true';
const HUB_STATUS = process.env.HUB_STATUS || 'Draft'; // 'Live' to publish immediately
const LIMIT = Number(process.env.LIMIT || 0); // 0 = no cap

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
const notion = new NotionClient({ auth: NOTION_TOKEN });

function getDrive() {
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
    return google.drive({ version: 'v3', auth });
  }
  if (HAS_OAUTH) {
    const auth = new google.auth.OAuth2(GSC_OAUTH_CLIENT_ID, GSC_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: GSC_OAUTH_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth });
  }
  throw new Error('No Drive auth (GOOGLE_SERVICE_ACCOUNT_JSON or GSC_OAUTH_*)');
}
const drive = getDrive();

const CATEGORY = /^(COMPLETED|OFF[\s_-]*THE[\s_-]*PLAN|OF\s+THE\s+PLAN|TOWNHOUSE|HOUSE\s*&\s*LAND|COMMERCIALS|APARTMENT)\b/i;

async function listChildren(id) {
  const out = []; let t;
  do {
    const res = await drive.files.list({ q: `'${id}' in parents and trashed = false`, fields: 'nextPageToken, files(id,name,mimeType)', pageSize: 200, pageToken: t, orderBy: 'folder,name' });
    out.push(...(res.data.files || [])); t = res.data.nextPageToken;
  } while (t);
  return out;
}

const projects = [];
async function walk(id, name, depth, ctx, parentName) {
  let kids; try { kids = await listChildren(id); } catch { return 0; }
  const nctx = { ...ctx };
  if (/^SYDNEY/i.test(name)) nctx.city = 'Sydney';
  else if (/^MELBOURNE/i.test(name)) nctx.city = 'Melbourne';
  if (/^APARTMENT/i.test(name)) nctx.type = 'Condo';
  else if (/^TOWNHOUSE/i.test(name)) nctx.type = 'Townhouse';
  else if (/^HOUSE\s*&\s*LAND/i.test(name)) nctx.type = 'Land';
  else if (/^COMMERCIALS/i.test(name)) nctx.type = 'Mixed-Use';

  const folders = kids.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  let recImg = kids.filter(f => (f.mimeType || '').startsWith('image/')).length;
  if (depth < MAX_DEPTH) for (const f of folders) recImg += await walk(f.id, f.name, depth + 1, nctx, name);

  if (CATEGORY.test(parentName || '') && !CATEGORY.test(name)) {
    projects.push({ id, rawName: name, recImg, city: ctx.city || nctx.city || 'Sydney', type: ctx.type || nctx.type || 'Condo' });
  }
  return recImg;
}

// ── name → brand / suburb / clean ──────────────────────────────────────────
const SUBURB_FIX = { 'CBD': 'Melbourne CBD', 'DOCKLANDS': 'Docklands', 'SOUTH BANK': 'Southbank', 'SOUTH MELBOURNE': 'South Melbourne' };
function tc(s) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bMq\b/, 'MQ').replace(/\bNsw\b/i, 'NSW'); }
function parseName(raw) {
  let n = raw.replace(/-\d{8}T\d{6}Z(-\d+)?(-\d+)?$/i, '').replace(/\s*-\s*B[àa]n giao.*$/i, '').trim();
  let suburb = '', brand = n;
  // Split on comma first, else a SPACED dash (so "668-670" isn't broken).
  const m = n.match(/^(.+?),\s*(.+)$/) || n.match(/^(.+?)\s[–-]\s(.+)$/);
  if (m) { suburb = m[1].trim(); brand = m[2].trim(); }
  // Folder naming is inconsistent (some "Suburb, Brand", some "Street, Suburb").
  // If the left part looks like a street address, treat it as the brand instead.
  if (/^\d/.test(suburb) && !/^\d/.test(brand)) { const t = suburb; suburb = brand; brand = t; }
  const sKey = suburb.toUpperCase();
  suburb = SUBURB_FIX[sKey] || tc(suburb);
  brand = tc(brand).replace(/\s+/g, ' ').trim();
  if (!brand) brand = suburb;
  return { brand, suburb: suburb || brand };
}
function slugify(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

// ── financial tiers (AUD, NAC estimates) ────────────────────────────────────
function financials(city, type) {
  const T = {
    'Sydney|Condo': [850000, 0.040, 16000, 0.085],
    'Sydney|Townhouse': [1450000, 0.036, 9500, 0.080],
    'Sydney|Land': [1450000, 0.036, 9500, 0.080],
    'Sydney|Mixed-Use': [950000, 0.045, 12000, 0.085],
    'Melbourne|Condo': [650000, 0.045, 12000, 0.085],
    'Melbourne|Townhouse': [1300000, 0.036, 9000, 0.080],
    'Melbourne|Land': [1300000, 0.036, 9000, 0.080],
    'Melbourne|Mixed-Use': [800000, 0.048, 10000, 0.085],
  };
  const [price, yld, ppm2, irr] = T[`${city}|${type}`] || T['Sydney|Condo'];
  const mri = Math.round(price * yld / 12);
  const mexp = Math.round(mri * 0.28);
  const cashflow = (mri - mexp) * 12;
  const coc = Math.round((cashflow / price) * 1000) / 1000;
  return { price, yld, ppm2, irr, mri, mexp, cashflow, coc };
}

const typeWord = { Condo: ['apartment', 'căn hộ'], Townhouse: ['townhouse', 'nhà phố'], Land: ['home', 'nhà'], 'Mixed-Use': ['residence', 'căn hộ'] };

function buildProps(p) {
  const { brand, suburb } = parseName(p.rawName);
  const city = p.city, type = p.type;
  const [tEn, tVi] = typeWord[type] || typeWord.Condo;
  const f = financials(city, type);
  const propName = brand.toLowerCase() === suburb.toLowerCase() ? brand : `${brand} — ${suburb}`;
  const slug = slugify(`${brand}-${suburb}`).slice(0, 60);
  const listingUrl = `https://nomadassetcollective.com/property-hub-bat-dong-san/australia/${slug}/`;
  const folderUrl = `https://drive.google.com/drive/folders/${p.id}`;
  const score = type === 'Land' ? 75 : 74;
  const airport = city === 'Sydney' ? 'Sydney Airport (SYD)' : 'Melbourne Airport (MEL)';
  const yoy = type === 'Condo' ? '+4–6%/year' : '+5–7%/year';

  const subs = JSON.stringify([
    { key: 'brand', label_vi: 'Thương Hiệu', label_en: 'Brand', val: 6.5 },
    { key: 'yield', label_vi: 'Yield', label_en: 'Yield', val: type === 'Condo' ? 6.5 : 6.0 },
    { key: 'location', label_vi: 'Vị Trí', label_en: 'Location', val: 8.0 },
    { key: 'management', label_vi: 'Quản Lý', label_en: 'Management', val: 7.5 },
    { key: 'liquidity', label_vi: 'Thanh Khoản', label_en: 'Liquidity', val: 8.0 },
    { key: 'risk', label_vi: 'Rủi Ro', label_en: 'Risk', val: 8.5 },
  ]);
  const pros = JSON.stringify([
    { vi: `Sở hữu freehold tại ${suburb}, ${city}`, en: `Freehold title in ${suburb}, ${city}` },
    { vi: `${tVi.charAt(0).toUpperCase() + tVi.slice(1)} mới, được FIRB duyệt cho người nước ngoài`, en: `Brand-new ${tEn}, FIRB-approved for foreign buyers` },
    { vi: 'Pháp quyền Úc & đồng AUD ổn định', en: 'Australian rule of law & stable AUD' },
    { vi: 'Thị trường cho thuê đô thị khan hiếm', en: 'Tight metropolitan rental market' },
    { vi: 'Kênh tăng giá vốn & định cư/du học', en: 'Capital-growth + education / migration pathway' },
  ]);
  const cons = JSON.stringify([
    { vi: `Lợi suất ~${(f.yld * 100).toFixed(1)}% — kênh tăng giá vốn, không phải dòng tiền`, en: `~${(f.yld * 100).toFixed(1)}% yield — capital-growth, not cash-flow` },
    { vi: 'Người nước ngoài cần FIRB + phụ phí thuế', en: 'Foreign buyers need FIRB + surcharge duties' },
    { vi: 'Cách Việt Nam ~9 giờ bay', en: '~9-hour flight from Vietnam' },
    { vi: 'Giá tham khảo — NAC ước tính, cần xác nhận', en: 'Indicative pricing — NAC estimate, to confirm' },
  ]);
  const feats = JSON.stringify([
    { icon: '💎', en: `Freehold ${tEn} — AUD-denominated, FIRB-approved`, vi: `${tVi} sở hữu freehold — định giá AUD, FIRB duyệt` },
    { icon: '📍', en: `${suburb}, ${city} — established transport & amenity`, vi: `${suburb}, ${city} — hạ tầng & tiện ích sẵn có` },
    { icon: '🎓', en: 'Education & professional rental demand', vi: 'Nhu cầu thuê từ sinh viên & chuyên gia' },
    { icon: '🛡️', en: 'Stable-currency, rule-of-law safe-haven hold', vi: 'Tài sản trú ẩn an toàn, tiền tệ ổn định' },
    { icon: '📈', en: `Capital growth ${yoy} (NAC estimate)`, vi: `Tăng giá vốn ${yoy} (NAC ước tính)` },
  ]);
  const proc = JSON.stringify([
    { n: '01', dur_vi: 'Tuần 1–2', dur_en: 'Week 1–2', title_vi: 'Tư Vấn & Chọn Căn', title_en: 'Consultation & Selection', body_vi: 'NAC chọn căn theo tầng/hướng/loại và giải thích quy trình FIRB.', body_en: 'NAC selects by floor/aspect/type and explains the FIRB process.' },
    { n: '02', dur_vi: 'Tuần 2–3', dur_en: 'Week 2–3', title_vi: 'Đặt Cọc & Hợp Đồng', title_en: 'Reservation & Contract', body_vi: 'Ký hợp đồng mua bán, đặt cọc giữ chỗ; luật sư rà soát.', body_en: 'Sign the contract of sale, pay holding deposit; solicitor review.' },
    { n: '03', dur_vi: 'Tuần 3–8', dur_en: 'Week 3–8', title_vi: 'Phê Duyệt FIRB & 10%', title_en: 'FIRB Approval & 10%', body_vi: 'Nộp FIRB, thanh toán 10% vào tài khoản tín thác.', body_en: 'Lodge FIRB, pay 10% deposit into trust.' },
    { n: '04', dur_vi: 'Khi bàn giao', dur_en: 'At settlement', title_vi: 'Tất Toán & Bàn Giao', title_en: 'Settlement & Handover', body_vi: 'Thanh toán phần còn lại, đăng bộ sổ, bàn giao cho thuê.', body_en: 'Pay balance, register title, hand to rental program.' },
  ]);

  const T = (en, vi) => ({ en, vi });
  const txt = (s) => ({ rich_text: s == null || s === '' ? [] : [{ text: { content: String(s).slice(0, 1990) } }] });
  const sel = (name) => ({ select: { name } });
  const num = (n) => ({ number: n });

  return {
    'Property Name': { title: [{ text: { content: propName } }] },
    'Name VI': txt(propName),
    'Country': sel('Australia'),
    'Currency': sel('AUD'),
    'Region': sel('pac'),
    'Region/City': txt(`${suburb}, ${city}`),
    '📍 District': txt(suburb),
    '🏨 Hub Type': sel(type),
    '🛂 Immigration Type': sel('None'),
    'Investment Program': sel('None'),
    'Exit Strategy': sel('Hold Long-term'),
    'Tags': { multi_select: [{ name: 'Freehold' }, { name: 'Must Know' }] },
    'Freehold': { checkbox: true },
    'Hub Status': sel(HUB_STATUS),
    'Status': { status: { name: 'Listed' } },
    '🔗 Slug': txt(slug),
    'Listing URL': { url: listingUrl },
    'GS Source Folder': { url: folderUrl },
    'Purchase Price': num(f.price),
    'Price Per M2': num(f.ppm2),
    'Yield %': num(f.yld),
    'IRR %': num(f.irr),
    'ROI %': num(f.irr),
    'Cash-on-Cash %': num(f.coc),
    'Cash Flow': num(f.cashflow),
    'Monthly Rental Income': num(f.mri),
    'Monthly Expenses': num(f.mexp),
    'Payback Years': num(13),
    'Minimum Hold Period': num(5),
    '⭐ NAC Score': num(score),
    'Excerpt EN': txt(`Freehold ${tEn} in ${suburb}, ${city}. FIRB-approved new dwelling; capital-growth & safe-haven hold.`),
    'Excerpt VI': txt(`${tVi.charAt(0).toUpperCase() + tVi.slice(1)} freehold tại ${suburb}, ${city}. Nhà mới FIRB duyệt; tăng giá vốn & trú ẩn an toàn.`),
    '🏷️ Tagline EN': txt(`Freehold ${tEn} living in ${suburb}`),
    '🏷️ Tagline VI': txt(`${tVi.charAt(0).toUpperCase() + tVi.slice(1)} freehold tại ${suburb}`),
    '📝 Desc EN': txt(`${brand} brings new freehold ${tEn}s to ${suburb}, ${city} — an established, well-connected ${city} location with strong education and professional rental demand. AUD-denominated and FIRB-approved for foreign buyers, it suits families pursuing Australian education, migration optionality, or stable-currency diversification. Indicative pricing from ~A$${(f.price / 1000).toFixed(0)}k (NAC estimate — to confirm against the developer price list).`),
    '📝 Desc VI': txt(`${brand} mang đến ${tVi} freehold mới tại ${suburb}, ${city} — vị trí ${city} sẵn hạ tầng, nhu cầu thuê từ sinh viên & chuyên gia cao. Định giá AUD, được FIRB duyệt cho người nước ngoài; phù hợp gia đình hướng đến giáo dục Úc, lựa chọn định cư, hoặc đa dạng hóa tiền tệ ổn định. Giá tham khảo từ ~${(f.price / 1000).toFixed(0)}k AUD (NAC ước tính — cần xác nhận theo bảng giá CĐT).`),
    '✦ Brand': txt(brand),
    '✦ Brand Intro EN': txt(`${brand} — a residential development in ${suburb}, ${city}.`),
    '✦ Brand Intro VI': txt(`${brand} — dự án nhà ở tại ${suburb}, ${city}.`),
    '🌍 Market EN': txt(`${city} is one of the world's most liveable, rule-of-law property markets — AUD-denominated, deep buyer demand from migration and education, and historically resilient capital growth.`),
    '🌍 Market VI': txt(`${city} là một trong những thị trường BĐS đáng sống & pháp quyền nhất thế giới — định giá AUD, nhu cầu lớn từ di trú & giáo dục, tăng giá vốn bền bỉ.`),
    '🌏 Key Markets EN': txt('China · Hong Kong · Vietnam · India · returning expats'),
    '🌏 Key Markets VI': txt('Trung Quốc · Hồng Kông · Việt Nam · Ấn Độ · Việt kiều hồi hương'),
    '🏖️ Beach EN': txt(`${suburb} · established ${city} amenity & transport`),
    '🏖️ Beach VI': txt(`${suburb} · hạ tầng & giao thông ${city} sẵn có`),
    '✈️ Airport EN': txt(`${airport} — 30–40 min drive`),
    '✈️ Airport VI': txt(`${airport} — 30–40 phút lái xe`),
    '📈 Property YoY EN': txt(`${yoy} (${suburb} / ${city}, NAC estimate)`),
    '📈 Property YoY VI': txt(`${yoy} (${suburb} / ${city}, NAC ước tính)`),
    '💬 NAC Note EN': txt(`NAC views ${brand} as a capital-growth and safe-haven hold rather than a cash-flow play — typical of ${city} residential, where the ~${(f.yld * 100).toFixed(1)}% yield is modest but freehold AUD ownership, rule of law, and education-driven demand underpin durable value. Pricing and figures here are NAC estimates pending the developer price list; confirm before relying on them.`),
    '💬 NAC Note VI': txt(`NAC xem ${brand} là khoản đầu tư tăng giá vốn & trú ẩn an toàn hơn là dòng tiền — điển hình của BĐS ${city}, nơi yield ~${(f.yld * 100).toFixed(1)}% khiêm tốn nhưng sở hữu freehold bằng AUD, pháp quyền và nhu cầu giáo dục giữ giá trị bền vững. Giá và số liệu là NAC ước tính, chờ bảng giá CĐT; cần xác nhận trước khi sử dụng.`),
    '📜 Statement EN': txt(`Own a «${brand}» ${tEn} in «${city}».`),
    '📜 Statement VI': txt(`Sở hữu ${tVi} «${brand}» tại «${city}».`),
    '📊 Sub-Scores JSON': txt(subs),
    '✅ Pros JSON': txt(pros),
    '⚠️ Cons JSON': txt(cons),
    '✨ Features JSON': txt(feats),
    '🔄 Process JSON': txt(proc),
    '🎬 Cine 1 EN': txt(`${suburb} · a new address`),
    '🎬 Cine 1 VI': txt(`${suburb} · một địa chỉ mới`),
    '🎬 Cine 2 EN': txt('Designed for the way you live'),
    '🎬 Cine 2 VI': txt('Thiết kế cho cách bạn sống'),
    '🎬 Cine 3 EN': txt(`${city} · built to last`),
    '🎬 Cine 3 VI': txt(`${city} · bền vững với thời gian`),
    'Listing Date': { date: { start: new Date().toISOString().slice(0, 10) } },
    _slug: slug, _name: propName,
  };
}

function folderIdFromUrl(u) { const m = (u || '').match(/folders\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }

async function existingFolderIds() {
  const ids = new Set(); let cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      const gs = pg.properties['GS Source Folder']?.url;
      const fid = folderIdFromUrl(gs);
      if (fid) ids.add(fid);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return ids;
}

(async () => {
  console.log(`Walking ${ROOT} for >=${MIN_IMAGES}-image AU projects…${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const meta = await drive.files.get({ fileId: ROOT, fields: 'name' });
  await walk(ROOT, meta.data.name, 0, {}, '');
  const eligible = projects.filter(p => p.recImg >= MIN_IMAGES);
  console.log(`Found ${projects.length} projects, ${eligible.length} with >=${MIN_IMAGES} images.`);

  const skip = await existingFolderIds();
  console.log(`${skip.size} folders already wired to existing rows (will skip).`);

  let created = 0, skipped = 0, failed = 0;
  for (const p of eligible) {
    if (skip.has(p.id)) { skipped++; continue; }
    const props = buildProps(p);
    const slug = props._slug, name = props._name;
    delete props._slug; delete props._name; delete props['date:Listing Date'];
    if (LIMIT && created >= LIMIT) { console.log('  (LIMIT reached)'); break; }
    if (DRY_RUN) { console.log(`  ✎ would create: ${name}  [${p.city}/${p.type} · ${p.recImg} imgs · ${slug}]`); created++; continue; }
    try {
      const page = await notion.pages.create({ parent: { database_id: DB }, properties: props });
      console.log(`  ✅ ${name}  [${p.city}/${p.type} · ${p.recImg} imgs] → ${page.id}`);
      created++;
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.body || e.message}`);
      failed++;
    }
  }
  console.log(`\nDone. ${created} created, ${skipped} skipped (existing), ${failed} failed.`);
})().catch(e => { console.error(e); process.exit(1); });
