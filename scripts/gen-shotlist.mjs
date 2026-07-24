#!/usr/bin/env node
// gen-shotlist.mjs — Pre-visit filming shot-list generator (site-visit video workstream, phase ①).
//
// Reads a listing's real data (Notion Property Listings DB, or the shipped
// properties/<slug>.html as an offline fallback) and emits a BILINGUAL VI+EN
// filming script: a sectioned shot list where the amenity section only contains
// the amenities the property actually has (from ✨ Features JSON) and the unit
// section has one block per unit model in 💲 Price Bands JSON.
//
// Outputs, per listing, into shotlist/:
//   • shotlist/<slug>.md    — markdown script (paste into Notion / print)
//   • shotlist/<slug>.html  — phone-friendly tickable checklist (GitHub Pages,
//                             VI/EN toggle, progress ring, state saved on-device)
// And, for a multi-listing run, shotlist/index.html — a trip pack.
//
// Usage:
//   node gen-shotlist.mjs london-dock-wapping-london        # one listing
//   node gen-shotlist.mjs --city london                     # every London listing
//   node gen-shotlist.mjs --all                             # every listing
//   node gen-shotlist.mjs <slug> --from-html                # force offline HTML parse
//
// Data source: uses Notion when NOTION_TOKEN is set (richer — has unit counts &
// prices), otherwise parses the committed HTML. Pass --from-html to force HTML.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');
const OUT_DIR = path.join(ROOT, 'shotlist');

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const cityIdx = argv.indexOf('--city');
const cityFilter = cityIdx >= 0 ? (argv[cityIdx + 1] || '').toLowerCase() : null;
// positional = bare args, minus the value consumed by --city
const consumed = cityIdx >= 0 ? cityIdx + 1 : -1;
const positional = argv.filter((a, i) => !a.startsWith('--') && i !== consumed);
const FORCE_HTML = flags.has('--from-html') || !TOKEN;

// ─── Amenity → shot dictionary ────────────────────────────────────────────────
// Each matcher fires when ANY of its keywords appears in the combined (VI+EN)
// feature text. One shot per matcher, deduped. Order = filming order on-site.
// A property with no roof bar simply never triggers the rooftop matcher.
const AMENITY_SHOTS = [
  { key: 'lobby',      kw: ['lobby', 'concierge', 'lễ tân', 'sảnh', 'reception'],
    vi: 'Sảnh & quầy lễ tân', en: 'Lobby & concierge desk',
    move_vi: 'kéo lùi mở khung', move_en: 'slow pull-back reveal', secs: 8,
    why_vi: 'ấn tượng đầu tiên & đẳng cấp dịch vụ', why_en: 'first impression & service level' },
  { key: 'gym',        kw: ['gym', 'fitness', 'phòng tập'],
    vi: 'Phòng gym', en: 'Gym / fitness suite',
    move_vi: 'lia ngang dàn thiết bị', move_en: 'slow pan across equipment', secs: 8,
    why_vi: 'tiện ích sức khỏe hằng ngày', why_en: 'daily wellness amenity' },
  { key: 'pool',       kw: ['pool', 'bể bơi', 'hồ bơi', 'swimming'],
    vi: 'Bể bơi', en: 'Swimming pool',
    move_vi: 'lướt thấp trên mặt nước', move_en: 'low glide over the water', secs: 8,
    why_vi: 'điểm nhấn thư giãn cao cấp', why_en: 'signature leisure hero' },
  { key: 'spa',        kw: ['spa', 'sauna', 'steam', 'wellness', 'xông hơi', 'jacuzzi'],
    vi: 'Spa / sauna / wellness', en: 'Spa / sauna / wellness',
    move_vi: 'tĩnh, lấy nét chi tiết', move_en: 'static, detail rack-focus', secs: 6,
    why_vi: 'chiều sâu tiện ích chăm sóc', why_en: 'depth of wellness offer' },
  { key: 'rooftop',    kw: ['roof', 'rooftop', 'sky bar', 'sky lounge', 'sky garden', 'sân thượng', 'tầng thượng'],
    vi: 'Rooftop / sky bar', en: 'Rooftop / sky bar',
    move_vi: 'mở từ trong ra tầm nhìn thành phố', move_en: 'reveal from interior out to the skyline', secs: 12,
    why_vi: 'cảnh "wow" bán tầm nhìn', why_en: 'the "wow" — sells the view', hero: true },
  { key: 'lounge',     kw: ['lounge', 'clubhouse', 'club', 'phòng chờ', 'phòng sinh hoạt'],
    vi: 'Resident lounge / club', en: 'Resident lounge / club',
    move_vi: 'gimbal đi xuyên không gian', move_en: 'gimbal walk-through', secs: 8,
    why_vi: 'không gian cộng đồng riêng tư', why_en: 'private resident community space' },
  { key: 'cinema',     kw: ['cinema', 'screening', 'rạp chiếu', 'theatre', 'theater'],
    vi: 'Phòng chiếu phim', en: 'Screening room',
    move_vi: 'tĩnh rộng, đèn dịu', move_en: 'static wide, low light', secs: 5,
    why_vi: 'tiện ích giải trí đặc quyền', why_en: 'premium entertainment perk' },
  { key: 'cowork',     kw: ['co-work', 'cowork', 'business', 'làm việc', 'workspace', 'study'],
    vi: 'Không gian làm việc chung', en: 'Co-working / business lounge',
    move_vi: 'tĩnh rộng', move_en: 'static wide', secs: 5,
    why_vi: 'phù hợp cư dân làm việc từ xa', why_en: 'appeals to remote-working residents' },
  { key: 'golf',       kw: ['golf', 'golf ảo', 'simulator'],
    vi: 'Golf mô phỏng', en: 'Golf simulator',
    move_vi: 'tĩnh, bắt khoảnh khắc swing', move_en: 'static, catch a swing', secs: 5,
    why_vi: 'điểm khác biệt hiếm có', why_en: 'rare differentiator' },
  { key: 'court',      kw: ['squash', 'tennis', 'court', 'sân bóng', 'basketball', 'padel'],
    vi: 'Sân thể thao', en: 'Sports court',
    move_vi: 'góc cao rộng', move_en: 'high wide angle', secs: 5,
    why_vi: 'chiều rộng tiện ích thể thao', why_en: 'breadth of sports amenity' },
  { key: 'garden',     kw: ['garden', 'courtyard', 'vườn', 'sân vườn', 'podium', 'green', 'công viên', 'park'],
    vi: 'Vườn / sân trong', en: 'Garden / courtyard',
    move_vi: 'gimbal đi chậm', move_en: 'slow gimbal walk', secs: 8,
    why_vi: 'không gian xanh & thư giãn', why_en: 'greenery & calm' },
  { key: 'kids',       kw: ['children', 'kids', 'playground', 'trẻ em', 'thiếu nhi', 'nursery'],
    vi: 'Khu vui chơi trẻ em', en: "Kids' play area",
    move_vi: 'tĩnh rộng', move_en: 'static wide', secs: 4,
    why_vi: 'thông điệp gia đình', why_en: 'family-friendly message' },
  { key: 'dining',     kw: ['restaurant', 'dining', 'nhà hàng', 'cafe', 'café', 'bar', 'kitchen garden'],
    vi: 'Nhà hàng / bar', en: 'Restaurant / bar',
    move_vi: 'lia chậm không gian', move_en: 'slow pan of the room', secs: 6,
    why_vi: 'phong cách sống tại chỗ', why_en: 'lifestyle on the doorstep' },
  { key: 'beach',      kw: ['beach', 'bãi biển', 'beach club', 'biển'],
    vi: 'Bãi biển / beach club', en: 'Beach / beach club',
    move_vi: 'drone/gimbal ra biển', move_en: 'drone/gimbal out to the water', secs: 12,
    why_vi: 'cảnh bán mơ ước', why_en: 'aspirational hero', hero: true },
  { key: 'marina',     kw: ['marina', 'bến du thuyền', 'yacht', 'harbour', 'harbor'],
    vi: 'Bến du thuyền / mặt nước', en: 'Marina / waterfront',
    move_vi: 'lướt dọc bờ nước', move_en: 'glide along the waterfront', secs: 10,
    why_vi: 'định vị cao cấp ven nước', why_en: 'premium waterfront positioning', hero: true },
];

// ─── Notion source ─────────────────────────────────────────────────────────────
async function fetchFromNotion(slug) {
  const { Client } = await import('@notionhq/client');
  const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });
  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: { property: '🔗 Slug', rich_text: { equals: slug } },
    page_size: 1,
  });
  const page = res.results[0];
  if (!page) return null;
  const p = page.properties;
  const rich = (x) => !x ? '' : (x.title ? x.title : x.rich_text || []).map(t => t.plain_text).join('').trim();
  const sel = (x) => x && x.select ? x.select.name : '';
  const json = (x) => { try { return JSON.parse(rich(x) || '[]'); } catch { return []; } };
  return {
    slug,
    name: rich(p['Property Name']),
    nameVi: rich(p['Name VI']),
    regionCity: rich(p['Region/City']),
    district: rich(p['📍 District']),
    country: sel(p['Country']),
    tagline: rich(p['🏷️ Tagline EN']),
    brand: rich(p['✦ Brand']),
    hubType: sel(p['🏨 Hub Type']),
    heroImg: (p['Image URL'] && (p['Image URL'].url || rich(p['Image URL']))) || '',
    features: json(p['✨ Features JSON']),   // [{icon,vi,en}]
    bands: json(p['💲 Price Bands JSON']),   // [{en,vi,from,units}]
    source: 'notion',
  };
}

// ─── HTML source (offline fallback) ────────────────────────────────────────────
async function fetchFromHtml(slug) {
  const file = path.join(PROPERTIES_DIR, `${slug}.html`);
  let html;
  try { html = await fs.readFile(file, 'utf8'); } catch { return null; }
  const $ = cheerio.load(html, { decodeEntities: false });
  const t = (k) => $(`[data-notion="${k}"]`).first().text().trim();
  const features = [];
  $('.nac-feat').each((_, e) => {
    const $e = $(e);
    features.push({
      icon: $e.find('.nac-feat-icon').text().trim(),
      vi: $e.find('[data-vi]').text().trim(),
      en: $e.find('[data-en]').text().trim(),
    });
  });
  const bands = [];
  $('.nac-band-type').each((_, e) => {
    const $e = $(e);
    bands.push({ vi: $e.find('[data-vi]').text().trim(), en: $e.find('[data-en]').text().trim() });
  });
  const heroStyle = $('[data-notion-bg="hero_img"]').attr('style') || '';
  const heroImg = (heroStyle.match(/background-image:\s*url\(['"]?([^'")]+)/) || [])[1] || '';
  return {
    slug,
    name: t('property_name_en'),
    nameVi: t('property_name_vi'),
    regionCity: t('region_city'),
    district: t('district'),
    country: t('country'),
    tagline: t('tagline_en'),
    brand: t('brand'),
    hubType: '',
    heroImg,
    features, bands,
    source: 'html',
  };
}

async function loadListing(slug) {
  if (!FORCE_HTML) {
    const n = await fetchFromNotion(slug);
    if (n) return n;
    console.warn(`  ⚠ ${slug}: not found in Notion, falling back to HTML`);
  }
  return fetchFromHtml(slug);
}

// ─── Shot-list builder ─────────────────────────────────────────────────────────
const shot = (id, vi, en, mv, me, secs, wv, we, hero = false) =>
  ({ id, vi, en, move_vi: mv, move_en: me, secs, why_vi: wv, why_en: we, hero });

// Classify each price band into a unit type + bedroom count for its shot block.
function bedroomsOf(band) {
  const s = ((band.en || '') + ' ' + (band.vi || '')).toLowerCase();
  if (/studio/.test(s)) return 0;
  if (/penthouse|duplex/.test(s)) return 3;
  const m = s.match(/(\d+)\s*(?:bed|br|phòng ngủ|pn)/) || s.match(/\b(\d)\s*\+\s*1\b/);
  return m ? parseInt(m[1], 10) : 1;
}

function buildSections(data) {
  const featText = data.features.map(f => `${f.vi} ${f.en}`).join(' ').toLowerCase();
  const nearTower = /tower bridge/i.test(`${data.nameVi} ${data.tagline} ${featText}`);
  const isWater = /river|thames|marina|beach|biển|sông|waterfront|dock|wharf|harbour|harbor/i.test(
    `${data.name} ${data.regionCity} ${data.district} ${featText}`);
  const sections = [];

  // §A — Arrival & Exterior
  const A = [
    shot('A1', 'Toàn cảnh mặt tiền toà nhà', 'Building façade, wide',
      'đẩy vào chậm', 'slow push-in', 8, 'quy mô & địa chỉ', 'the scale & the address'),
    shot('A2', 'Lối vào chính & mái đón', 'Main entrance & arrival canopy',
      'lia theo bước chân', 'tracking with footsteps', 6, 'nghi thức đón khách', 'the arrival ritual'),
  ];
  if (isWater) A.push(shot('A3', 'Lối đi ven nước' + (nearTower ? ' hướng Tower Bridge' : ''),
    'Waterside walk' + (nearTower ? ' toward Tower Bridge' : ''),
    'gimbal đi bộ', 'gimbal walk', 10, 'cảnh vị trí đắt giá', 'the location hero', true));
  sections.push({ id: 'A', vi: 'Ngoại thất & Lối vào', en: 'Arrival & Exterior', shots: A });

  // §C — Amenities the property actually has
  const amen = [];
  let n = 1;
  for (const m of AMENITY_SHOTS) {
    if (m.kw.some(k => featText.includes(k))) {
      amen.push(shot('C' + n, m.vi, m.en, m.move_vi, m.move_en, m.secs, m.why_vi, m.why_en, !!m.hero));
      n++;
    }
  }
  if (amen.length) {
    sections.push({ id: 'C', vi: 'Tiện ích', en: 'Amenities', shots: amen,
      note_vi: 'Chỉ liệt kê tiện ích trích từ dữ liệu listing — bổ sung tại chỗ nếu thấy thêm.',
      note_en: 'Only amenities found in the listing data — add any others you find on-site.' });
  }

  // §D — Unit models (one block per price band; generic fallback if none)
  const unitShots = [];
  const bands = (data.bands || []).slice().sort((a, b) => bedroomsOf(a) - bedroomsOf(b));
  let d = 1;
  const emit = (label_vi, label_en, beds) => {
    const tag = `[${label_en}]`;
    unitShots.push(shot('D' + d++, `${label_vi} · phòng khách (một cú máy)`, `${tag} living, one-take`,
      'oner từ cửa ra cửa sổ', 'entry-to-window oner', beds >= 2 ? 10 : 8, 'cảm giác không gian', 'sense of space'));
    unitShots.push(shot('D' + d++, `${label_vi} · bếp`, `${tag} kitchen`,
      'lấy nét chi tiết đảo bếp', 'island detail rack-focus', 5, 'chất lượng hoàn thiện', 'finish quality'));
    for (let b = 1; b <= Math.max(1, beds); b++) {
      unitShots.push(shot('D' + d++, `${label_vi} · phòng ngủ ${beds > 1 ? b : ''}`.trim(),
        `${tag} bedroom ${beds > 1 ? b : ''}`.trim(),
        'lia chậm', 'slow pan', 6, b === 1 ? 'phòng ngủ chính & tủ' : 'phòng ngủ phụ', b === 1 ? 'master + wardrobe' : 'secondary bedroom'));
    }
    unitShots.push(shot('D' + d++, `${label_vi} · phòng tắm`, `${tag} bathroom`,
      'tĩnh, gương & đá', 'static, mirror & stone', 4, 'vật liệu cao cấp', 'premium materials'));
    unitShots.push(shot('D' + d++, `${label_vi} · ban công / tầm nhìn`, `${tag} balcony / view step-out`,
      'bước ra ban công', 'step-out to the view', beds >= 2 ? 10 : 8, 'lý do xuống tiền', 'the reason to buy', true));
  };
  if (bands.length) {
    for (const b of bands) emit(b.vi || b.en, b.en || b.vi, bedroomsOf(b));
  } else {
    // No price bands on file — one generic block, prompt to film every model on site.
    emit('Căn hộ mẫu', 'Show unit', 1);
  }
  sections.push({ id: 'D', vi: 'Căn hộ mẫu', en: 'Unit models', shots: unitShots,
    note_vi: bands.length ? 'Một khối cho mỗi loại căn trong bảng giá.' : 'Không có bảng giá trong dữ liệu — quay mọi loại căn mẫu có sẵn tại chỗ (studio → 3PN).',
    note_en: bands.length ? 'One block per unit type in the price bands.' : 'No price bands in the data — film every show unit available on-site (studio → 3-bed).' });

  // §E — Views & Balcony (aspirational)
  sections.push({ id: 'E', vi: 'Tầm nhìn & Ban công', en: 'Views & Balcony', shots: [
    shot('E1', 'Toàn cảnh từ ban công' + (nearTower ? ': sông → Tower Bridge → thành phố' : ''),
      'Balcony POV pan' + (nearTower ? ': river → Tower Bridge → skyline' : ''),
      'lia ngang chậm', 'slow horizontal pan', 12, 'cảnh bán chính', 'the key selling view', true),
    shot('E2', 'Ánh nắng giờ vàng qua cửa kính', 'Golden-hour light through the glass',
      'tĩnh, phơi sáng theo trời', 'static, expose for sky', 8, 'cảm xúc & chất sống', 'emotion & living quality'),
  ] });

  // §F — Neighbourhood & Connectivity
  sections.push({ id: 'F', vi: 'Khu vực & Kết nối', en: 'Neighbourhood & Connectivity', shots: [
    shot('F1', 'Ga tàu / metro gần nhất', 'Nearest tube / metro / DLR entrance',
      'tĩnh, bắt biển ga', 'static, catch the station sign', 5, 'kết nối giao thông', 'transport connectivity'),
    shot('F2', 'Nhịp sống khu phố (café, phố mua sắm)', 'Neighbourhood life (cafés, high street)',
      'gimbal đi bộ', 'gimbal walk', 8, 'phong cách sống quanh nhà', 'lifestyle around the home'),
    shot('F3', 'Cột mốc nổi bật của khu', 'Signature local landmark',
      'tĩnh rộng', 'establishing wide', 8, 'định vị & uy tín khu vực', 'positioning & area prestige'),
  ] });

  // §G — Aspirational closers (banner candidates)
  sections.push({ id: 'G', vi: 'Cảnh kết (ứng viên banner)', en: 'Aspirational closers (banner candidates)', shots: [
    shot('G1', 'Ngoại thất giờ vàng, đèn trong nhà sáng', 'Golden-hour exterior, interior lights on',
      'đẩy vào rất chậm', 'very slow push-in', 10, 'ứng viên video banner LLP', 'LLP banner video candidate', true),
    shot('G2', isWater ? 'Trôi chậm ngang mặt nước lúc hoàng hôn' : 'Trôi chậm ngang toà nhà lúc hoàng hôn',
      isWater ? 'Slow drift across the water at dusk' : 'Slow drift across the building at dusk',
      'gimbal/drone trôi ngang', 'gimbal/drone lateral drift', 12, 'cảnh kết mở/đóng phim', 'opener/closer beauty shot', true),
  ] });

  return sections;
}

// ─── Renderers ─────────────────────────────────────────────────────────────────
const totalSecs = (sections) => sections.reduce((a, s) => a + s.shots.reduce((b, x) => b + x.secs, 0), 0);
const totalShots = (sections) => sections.reduce((a, s) => a + s.shots.length, 0);

function toMarkdown(data, sections) {
  const L = [];
  L.push(`# 🎬 Shot list — ${data.name || data.slug}`);
  if (data.nameVi) L.push(`**VI:** ${data.nameVi}`);
  const loc = [data.district, data.regionCity].filter(Boolean).join(' · ');
  if (loc) L.push(`**Location:** ${loc}`);
  L.push(`**Shots:** ${totalShots(sections)} · **Est. footage:** ~${totalSecs(sections)}s of usable clips · **Source:** ${data.source}`);
  L.push('');
  L.push(`> Clip naming: film each shot as \`${data.slug}__<ID>.mp4\` (e.g. \`${data.slug}__C1.mp4\`) so upload can auto-route.`);
  L.push('');
  for (const s of sections) {
    L.push(`## §${s.id} — ${s.en} / ${s.vi}`);
    if (s.note_en) L.push(`_${s.note_en} / ${s.note_vi}_`);
    L.push('');
    L.push('| ID | Shot (EN) | Cảnh (VI) | Move | ~s | Sells |');
    L.push('|----|-----------|-----------|------|----|-------|');
    for (const x of s.shots) {
      const star = x.hero ? ' ⭐' : '';
      L.push(`| ${x.id}${star} | ${x.en} | ${x.vi} | ${x.move_en} / ${x.move_vi} | ${x.secs} | ${x.why_en} |`);
    }
    L.push('');
  }
  L.push('⭐ = hero / banner-video candidate. Shoot these landscape 16:9, steady, 10–20s each.');
  return L.join('\n');
}

// Build one portal entry {meta + sections} for the inlined dataset.
function portalEntry(data, sections) {
  const city = data.regionCity || data.district || '';
  return {
    slug: data.slug,
    name: data.name || data.slug,
    nameVi: data.nameVi || '',
    city,
    country: data.country || '',
    thumb: data.heroImg || '',
    shots: totalShots(sections),
    secs: totalSecs(sections),
    sections: sections.map(s => ({
      id: s.id, vi: s.vi, en: s.en, note_vi: s.note_vi || '', note_en: s.note_en || '',
      shots: s.shots.map(x => ({
        id: x.id, vi: x.vi, en: x.en, move_vi: x.move_vi, move_en: x.move_en,
        secs: x.secs, why_vi: x.why_vi, why_en: x.why_en, hero: !!x.hero,
      })),
    })),
  };
}

// The whole portal is one self-contained page: all listings inlined (works
// offline on-site), three stages — Prepare (browse) → Trip → Read.
function buildPortal(entries) {
  const json = JSON.stringify({ listings: entries }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>NAC Film Scripts — site-visit portal</title>
<style>
:root{--nac:#1800ad;--org:#F4622A;--ink:#12121a;--mut:#6b6b78;--line:#e7e7ee;--bg:#f6f6fb;--card:#fff}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);padding-bottom:calc(30px + env(safe-area-inset-bottom,0))}
.top{position:sticky;top:0;z-index:9;background:rgba(255,255,255,.9);backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid var(--line);padding:11px 14px calc(9px + env(safe-area-inset-top,0)/4)}
.top .r1{display:flex;align-items:center;gap:10px}
.brand{font-weight:800;font-size:16px;letter-spacing:-.01em;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand small{color:var(--mut);font-weight:600}
.lang{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;font-weight:700;font-size:12px;flex:0 0 auto}
.lang button{border:0;background:var(--card);color:var(--mut);padding:7px 11px;min-height:34px}
.lang button.on{background:var(--nac);color:#fff}
.tripbtn{border:1px solid var(--line);background:var(--card);border-radius:999px;font-weight:700;font-size:12.5px;padding:7px 12px;min-height:34px;color:var(--ink);display:inline-flex;align-items:center;gap:5px}
.tripbtn b{background:var(--org);color:#fff;border-radius:999px;font-size:11px;padding:1px 6px;min-width:18px;text-align:center}
.tripbtn.on{background:var(--nac);color:#fff;border-color:var(--nac)}
.search{margin-top:9px;width:100%;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:11px 12px;font-size:15px;min-height:44px}
.chips{display:flex;gap:7px;overflow-x:auto;padding:9px 2px 1px;-webkit-overflow-scrolling:touch}
.chip{flex:0 0 auto;border:1px solid var(--line);background:var(--card);color:var(--mut);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700;min-height:32px}
.chip.on{background:var(--nac);color:#fff;border-color:var(--nac)}
.wrap{padding:14px}
.grid{display:grid;gap:11px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;position:relative}
.card .th{aspect-ratio:16/10;background:#e9e9f1 center/cover no-repeat;position:relative}
.card .star{position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.42);color:#fff;font-size:16px;display:grid;place-items:center;backdrop-filter:blur(4px)}
.card .star.on{background:var(--org)}
.card .bd{padding:11px 12px 12px}
.card .nm{font-weight:700;font-size:15px;letter-spacing:-.01em;display:block}
.card .lo{color:var(--mut);font-size:12.5px;margin-top:2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .mt{color:var(--mut);font-size:12px;margin-top:7px;display:flex;gap:8px;align-items:center}
.pill{background:#eef0ff;color:var(--nac);border-radius:999px;font-weight:700;font-size:11px;padding:2px 8px}
.empty{color:var(--mut);text-align:center;padding:50px 20px;font-size:14.5px}
.tlist{display:flex;flex-direction:column;gap:9px}
.trow{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px;cursor:pointer}
.trow .tth{width:64px;height:44px;flex:0 0 64px;border-radius:9px;background:#e9e9f1 center/cover no-repeat}
.trow .ti{flex:1;min-width:0}
.trow .ti b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trow .ti small{color:var(--mut);font-size:12px}
.trow .rm{border:0;background:transparent;color:var(--mut);font-size:20px;padding:4px 8px}
.sum{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin-bottom:12px;display:flex;gap:16px;align-items:center}
.sum b{font-size:22px;font-weight:800;color:var(--nac)}
.sum span{color:var(--mut);font-size:12.5px}
.btnrow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:var(--card);border-radius:11px;font-weight:700;font-size:13px;padding:9px 13px;min-height:40px;color:var(--ink)}
.btn.pri{background:var(--nac);color:#fff;border-color:var(--nac)}
/* read view */
.rhead{display:flex;align-items:center;gap:11px;margin-bottom:6px}
.back{border:1px solid var(--line);background:var(--card);border-radius:10px;min-width:40px;min-height:40px;font-size:17px}
.rtitle{flex:1;min-width:0}
.rtitle .rt{font-weight:800;font-size:17px;letter-spacing:-.01em;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rtitle .rl{color:var(--mut);font-size:12.5px}
.rbar{display:flex;align-items:center;gap:12px;margin:8px 0 4px}
.ring{--p:0;width:46px;height:46px;border-radius:50%;flex:0 0 46px;background:conic-gradient(var(--org) calc(var(--p)*1%),var(--line) 0);display:grid;place-items:center}
.ring::after{content:attr(data-p);width:36px;height:36px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:11px;font-weight:800}
.rmeta{flex:1;font-size:12.5px;color:var(--mut)}
.grp{margin:18px 0 0}
.grp h2{font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--nac);margin:0 0 8px;font-weight:800}
.gnote{margin:0 0 10px;font-size:12.5px;color:var(--mut);font-style:italic}
.sh{display:flex;align-items:flex-start;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:8px;min-height:52px;cursor:pointer}
.sh.hero{border-color:var(--org);box-shadow:0 0 0 1px var(--org) inset}
.sh input{width:24px;height:24px;flex:0 0 24px;margin:1px 0 0;accent-color:var(--org)}
.sh .id{font-weight:800;font-size:12px;color:var(--nac);flex:0 0 36px;padding-top:2px}
.sh.hero .id{color:var(--org)}
.sh .txt{flex:1;min-width:0}
.sh .txt b{font-weight:650;font-size:15px}
.sh .txt small{color:var(--mut);font-size:12.5px;margin-top:2px}
.sh.done .txt b{text-decoration:line-through;color:var(--mut)}
.sh.done .txt{opacity:.6}
.foot{margin:22px 0 0;color:var(--mut);font-size:12px;text-align:center}
.hide{display:none!important}
/* language toggle — active lang inline everywhere; block for the stacked shot text */
.vis-en,.vis-vi{display:none}
body:not(.vi) .vis-en{display:inline}
body.vi .vis-vi{display:inline}
body:not(.vi) .sh .txt .vis-en,body.vi .sh .txt .vis-vi{display:block}
@media(max-width:640px){.grid{grid-template-columns:1fr 1fr;gap:9px}.card .nm{font-size:13.5px}.card .bd{padding:9px 10px 10px}.wrap{padding:12px}}
@media(max-width:380px){.grid{grid-template-columns:1fr}}
</style></head><body>
<div class="top">
  <div class="r1">
    <div class="brand">🎬 NAC Film Scripts <small id="crumb"></small></div>
    <button class="tripbtn" id="tripBtn" data-act="go-trip">🎒 <b id="tripN">0</b></button>
    <div class="lang"><button id="bEn" class="on" data-act="lang" data-l="en">EN</button><button id="bVi" data-act="lang" data-l="vi">VI</button></div>
  </div>
  <div id="filters">
    <input class="search" id="q" placeholder="Search property, city, country…" autocomplete="off">
    <div class="chips" id="chips"></div>
  </div>
</div>
<div class="wrap" id="app"></div>
<script id="D" type="application/json">${json}</script>
<script>
var DATA=JSON.parse(document.getElementById('D').textContent).listings;
var BY={};DATA.forEach(function(l){BY[l.slug]=l});
var app=document.getElementById('app'),crumb=document.getElementById('crumb'),filters=document.getElementById('filters');
var state={v:'browse',slug:'',q:'',c:'All'};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function LS(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function SS(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function getTrip(){return LS('sl:trip',[])}
function setTrip(a){SS('sl:trip',a);paintTripN()}
function inTrip(s){return getTrip().indexOf(s)>=0}
function toggleTrip(s){var t=getTrip(),i=t.indexOf(s);if(i>=0)t.splice(i,1);else t.push(s);setTrip(t)}
function ticks(s){return LS('sl:ticks:'+s,{})}
function paintTripN(){document.getElementById('tripN').textContent=getTrip().length}
function countries(){var m={};DATA.forEach(function(l){if(l.country)m[l.country]=(m[l.country]||0)+1});return Object.keys(m).sort()}
function nm(l){return document.body.classList.contains('vi')&&l.nameVi?l.nameVi:l.name}

function renderChips(){
  var cs=countries(),h='<button class="chip'+(state.c==='All'?' on':'')+'" data-act="chip" data-c="All">All ('+DATA.length+')</button>';
  cs.forEach(function(c){h+='<button class="chip'+(state.c===c?' on':'')+'" data-act="chip" data-c="'+esc(c)+'">'+esc(c)+'</button>'});
  document.getElementById('chips').innerHTML=cs.length?h:'';
}
function match(l){
  if(state.c!=='All'&&l.country!==state.c)return false;
  if(!state.q)return true;
  var q=state.q.toLowerCase();
  return (l.name+' '+l.nameVi+' '+l.city+' '+l.country+' '+l.slug).toLowerCase().indexOf(q)>=0;
}
function renderBrowse(){
  filters.classList.remove('hide');crumb.textContent='';
  var list=DATA.filter(match).sort(function(a,b){return a.name.localeCompare(b.name)});
  if(!list.length){app.innerHTML='<div class="empty">No properties match.</div>';return}
  var h='<div class="grid">';
  list.forEach(function(l){
    var th=l.thumb?' style="background-image:url('+esc(l.thumb)+')"':'';
    h+='<div class="card" data-act="open" data-slug="'+esc(l.slug)+'">'
      +'<div class="th"'+th+'><button class="star'+(inTrip(l.slug)?' on':'')+'" data-act="star" data-slug="'+esc(l.slug)+'">'+(inTrip(l.slug)?'★':'☆')+'</button></div>'
      +'<div class="bd"><span class="nm">'+esc(nm(l))+'</span><span class="lo">'+esc(l.city||'')+'</span>'
      +'<span class="mt"><span class="pill">'+l.shots+' shots</span> ~'+l.secs+'s</span></div></div>';
  });
  app.innerHTML=h+'</div>';
}
function renderTrip(){
  filters.classList.add('hide');crumb.innerHTML='· <span class="vis-en">My trip</span><span class="vis-vi">Chuyến của tôi</span>';
  var t=getTrip().map(function(s){return BY[s]}).filter(Boolean);
  if(!t.length){app.innerHTML='<div class="empty"><span class="vis-en">No properties in your trip yet.<br>Star properties in Browse to prep them.</span><span class="vis-vi">Chưa có địa điểm nào.<br>Bấm ★ ở phần Duyệt để chuẩn bị.</span><div class="btnrow" style="justify-content:center"><button class="btn pri" data-act="go-browse">Browse properties</button></div></div>';return}
  var sh=t.reduce(function(a,l){return a+l.shots},0),se=t.reduce(function(a,l){return a+l.secs},0);
  var h='<div class="sum"><div><b>'+t.length+'</b><br><span><span class="vis-en">stops</span><span class="vis-vi">điểm</span></span></div>'
    +'<div><b>'+sh+'</b><br><span>shots</span></div><div><b>~'+se+'s</b><br><span><span class="vis-en">footage</span><span class="vis-vi">thời lượng</span></span></div></div>';
  h+='<div class="tlist">';
  t.forEach(function(l){
    var th=l.thumb?' style="background-image:url('+esc(l.thumb)+')"':'';
    h+='<div class="trow" data-act="open" data-slug="'+esc(l.slug)+'"><div class="tth"'+th+'></div>'
      +'<div class="ti"><b>'+esc(nm(l))+'</b><small>'+esc(l.city||'')+' · '+l.shots+' shots</small></div>'
      +'<button class="rm" data-act="star" data-slug="'+esc(l.slug)+'">✕</button></div>';
  });
  h+='</div><div class="btnrow"><button class="btn" data-act="go-browse">+ Add more</button></div>';
  app.innerHTML=h;
}
function renderRead(){
  filters.classList.add('hide');
  var l=BY[state.slug];if(!l){state.v='browse';return render()}
  crumb.textContent='';
  var tk=ticks(l.slug),done=0;
  l.sections.forEach(function(s){s.shots.forEach(function(x){if(tk[x.id])done++})});
  var pct=l.shots?Math.round(done/l.shots*100):0;
  var h='<div class="rhead"><button class="back" data-act="go-browse">‹</button>'
    +'<div class="rtitle"><span class="rt">'+esc(nm(l))+'</span><span class="rl">'+esc(l.city||'')+'</span></div>'
    +(inTrip(l.slug)?'':'<button class="btn" data-act="star" data-slug="'+esc(l.slug)+'">🎒 Add</button>')+'</div>'
    +'<div class="rbar"><div class="ring" id="ring" data-p="'+pct+'%" style="--p:'+pct+'"></div>'
    +'<div class="rmeta"><span id="rdone">'+done+'</span>/'+l.shots+' shots · ~'+l.secs+'s · ★ = banner candidate</div></div>';
  l.sections.forEach(function(s){
    h+='<section class="grp"><h2>§'+s.id+' · <span class="vis-en">'+esc(s.en)+'</span><span class="vis-vi">'+esc(s.vi)+'</span></h2>';
    if(s.note_en)h+='<p class="gnote"><span class="vis-en">'+esc(s.note_en)+'</span><span class="vis-vi">'+esc(s.note_vi)+'</span></p>';
    s.shots.forEach(function(x){
      var on=tk[x.id];
      h+='<label class="sh'+(x.hero?' hero':'')+(on?' done':'')+'" data-id="'+x.id+'">'
        +'<input type="checkbox" data-id="'+x.id+'"'+(on?' checked':'')+'>'
        +'<span class="id">'+x.id+(x.hero?' ★':'')+'</span>'
        +'<span class="txt"><b class="vis-en">'+esc(x.en)+'</b><b class="vis-vi">'+esc(x.vi)+'</b>'
        +'<small class="vis-en">'+esc(x.move_en)+' · ~'+x.secs+'s · '+esc(x.why_en)+'</small>'
        +'<small class="vis-vi">'+esc(x.move_vi)+' · ~'+x.secs+'s · '+esc(x.why_vi)+'</small></span></label>';
    });
    h+='</section>';
  });
  h+='<p class="foot">Clip naming: <code>'+esc(l.slug)+'__&lt;ID&gt;.mp4</code> · ticks saved on this device</p>';
  app.innerHTML=h;
}
function render(){
  if(state.v==='browse')renderBrowse();
  else if(state.v==='trip')renderTrip();
  else if(state.v==='read')renderRead();
  document.getElementById('tripBtn').classList.toggle('on',state.v==='trip');
  window.scrollTo(0,0);
}
function nav(v,slug){state.v=v;state.slug=slug||'';
  var h='#/'+v+(slug?'/'+slug:'');if(location.hash!==h)location.hash=h;render()}
function fromHash(){
  var p=(location.hash||'').replace(/^#\\//,'').split('/');
  if(p[0]==='read'&&p[1]){state.v='read';state.slug=decodeURIComponent(p[1])}
  else if(p[0]==='trip'){state.v='trip'}
  else{state.v='browse'}
  render();
}
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]');if(!t)return;var a=t.dataset.act;
  if(a==='lang'){setLangMode(t.dataset.l==='vi');return}
  if(a==='chip'){state.c=t.dataset.c;renderChips();renderBrowse();return}
  if(a==='star'){e.preventDefault();e.stopPropagation();toggleTrip(t.dataset.slug);render();renderChips();return}
  if(a==='open'){nav('read',t.dataset.slug);return}
  if(a==='go-trip'){nav('trip');return}
  if(a==='go-browse'){nav('browse');return}
});
document.addEventListener('change',function(e){
  var b=e.target;if(b.type!=='checkbox')return;
  var l=BY[state.slug];if(!l)return;
  var tk=ticks(l.slug);if(b.checked)tk[b.dataset.id]=1;else delete tk[b.dataset.id];
  SS('sl:ticks:'+l.slug,tk);
  b.closest('.sh').classList.toggle('done',b.checked);
  var done=0;l.sections.forEach(function(s){s.shots.forEach(function(x){if(tk[x.id])done++})});
  var pct=l.shots?Math.round(done/l.shots*100):0,r=document.getElementById('ring');
  if(r){r.style.setProperty('--p',pct);r.setAttribute('data-p',pct+'%')}
  var d=document.getElementById('rdone');if(d)d.textContent=done;
});
document.getElementById('q').addEventListener('input',function(){state.q=this.value;renderBrowse()});
window.addEventListener('hashchange',fromHash);
function setLangMode(vi){document.body.classList.toggle('vi',vi);
  document.getElementById('bVi').classList.toggle('on',vi);
  document.getElementById('bEn').classList.toggle('on',!vi);
  SS('sl:lang',vi?'vi':'en');render()}
setLangMode(LS('sl:lang','en')==='vi');
paintTripN();renderChips();fromHash();
</script></body></html>`;
}

// ─── Slug resolution ────────────────────────────────────────────────────────────
async function allSlugs() {
  const files = await fs.readdir(PROPERTIES_DIR);
  return files.filter(f => f.endsWith('.html') && !f.startsWith('_')).map(f => f.replace(/\.html$/, ''));
}

async function cityMatch(slug, city) {
  const d = await fetchFromHtml(slug);
  if (!d) return false;
  return `${d.slug} ${d.regionCity} ${d.district} ${d.name}`.toLowerCase().includes(city);
}


// ─── Main ───────────────────────────────────────────────────────────────────────
// Always rebuilds the portal (shotlist/index.html) from EVERY committed listing,
// so on-site you can reach any script — even ones added since the last trip.
// Additionally writes a markdown script (Notion-paste) for any explicitly named
// slugs / --city matches. The portal scan parses the committed HTML (fast,
// offline); --md uses Notion when a token is present for the richer unit data.
async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const all = await allSlugs();

  const entries = [];
  for (const slug of all) {
    const data = await fetchFromHtml(slug);
    if (!data || !data.name) continue;              // skip stubs with no title
    entries.push(portalEntry(data, buildSections(data)));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(path.join(OUT_DIR, 'index.html'), buildPortal(entries));
  const totShots = entries.reduce((a, e) => a + e.shots, 0);
  console.log(`  ✓ portal → shotlist/index.html · ${entries.length} listings · ${totShots} shots inlined`);

  // Optional per-slug markdown scripts
  let mdSlugs = positional.slice();
  if (!mdSlugs.length && cityFilter) {
    for (const s of all) if (await cityMatch(s, cityFilter)) mdSlugs.push(s);
  }
  for (const slug of mdSlugs) {
    const data = await loadListing(slug);
    if (!data) { console.warn(`  ⚠ ${slug}: no data (not in Notion or properties/)`); continue; }
    const sections = buildSections(data);
    await fs.writeFile(path.join(OUT_DIR, `${slug}.md`), toMarkdown(data, sections));
    console.log(`  ✓ ${slug} — ${totalShots(sections)} shots (~${totalSecs(sections)}s), src=${data.source} → shotlist/${slug}.md`);
  }
  console.log(`\nDone. Portal + ${mdSlugs.length} markdown script(s) in shotlist/`);
}

main().catch(e => { console.error(e); process.exit(1); });
