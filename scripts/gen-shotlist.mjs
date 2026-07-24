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
    tagline: rich(p['🏷️ Tagline EN']),
    brand: rich(p['✦ Brand']),
    hubType: sel(p['🏨 Hub Type']),
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
  return {
    slug,
    name: t('property_name_en'),
    nameVi: t('property_name_vi'),
    regionCity: t('region_city'),
    district: t('district'),
    tagline: t('tagline_en'),
    brand: t('brand'),
    hubType: '',
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

const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toHtml(data, sections) {
  const rows = sections.map(s => {
    const items = s.shots.map(x => `
      <label class="sh${x.hero ? ' hero' : ''}" data-secs="${x.secs}">
        <input type="checkbox" data-id="${x.id}">
        <span class="id">${x.id}${x.hero ? ' ★' : ''}</span>
        <span class="txt"><b class="en">${escH(x.en)}</b><b class="vi">${escH(x.vi)}</b>
          <small class="en">${escH(x.move_en)} · ~${x.secs}s · ${escH(x.why_en)}</small>
          <small class="vi">${escH(x.move_vi)} · ~${x.secs}s · ${escH(x.why_vi)}</small></span>
      </label>`).join('');
    return `<section class="grp"><h2>§${s.id} · <span class="en">${escH(s.en)}</span><span class="vi">${escH(s.vi)}</span></h2>${
      s.note_en ? `<p class="note"><span class="en">${escH(s.note_en)}</span><span class="vi">${escH(s.note_vi)}</span></p>` : ''
    }${items}</section>`;
  }).join('');
  const loc = escH([data.district, data.regionCity].filter(Boolean).join(' · '));
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Shot list · ${escH(data.name || data.slug)}</title>
<style>
:root{--nac:#1800ad;--org:#F4622A;--ink:#12121a;--mut:#6b6b78;--line:#e7e7ee;--bg:#f6f6fb;--card:#fff}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);padding-bottom:40px}
.top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid var(--line);padding:12px 16px calc(12px + env(safe-area-inset-bottom,0)/3)}
.ttl{font-weight:800;font-size:18px;letter-spacing:-.01em;margin:0 0 2px}
.sub{color:var(--mut);font-size:13px}
.bar{display:flex;align-items:center;gap:12px;margin-top:10px}
.ring{--p:0;width:44px;height:44px;border-radius:50%;flex:0 0 44px;background:conic-gradient(var(--org) calc(var(--p)*1%),var(--line) 0);display:grid;place-items:center}
.ring::after{content:attr(data-p);width:34px;height:34px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:11px;font-weight:700}
.meta{flex:1;font-size:12.5px;color:var(--mut)}
.lang{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;font-weight:700;font-size:12px}
.lang button{border:0;background:var(--card);color:var(--mut);padding:7px 12px;min-height:34px}
.lang button.on{background:var(--nac);color:#fff}
.grp{margin:18px 16px 0}
.grp h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--nac);margin:0 0 8px;font-weight:800}
.note{margin:0 0 10px;font-size:12.5px;color:var(--mut);font-style:italic}
.sh{display:flex;align-items:flex-start;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:8px;min-height:52px;cursor:pointer}
.sh.hero{border-color:var(--org);box-shadow:0 0 0 1px var(--org) inset}
.sh input{width:24px;height:24px;flex:0 0 24px;margin:1px 0 0;accent-color:var(--org)}
.sh .id{font-weight:800;font-size:12px;color:var(--nac);flex:0 0 34px;padding-top:2px}
.sh.hero .id{color:var(--org)}
.sh .txt{flex:1;min-width:0}
.sh .txt b{display:block;font-weight:650;font-size:15px}
.sh .txt small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.sh input:checked ~ .txt b{text-decoration:line-through;color:var(--mut)}
.sh input:checked ~ .txt{opacity:.6}
.vi{display:none}
body.vi .en{display:none}body.vi .vi{display:block}
body.vi .lang small.en,body:not(.vi) small.vi{display:none}
.foot{margin:22px 16px 0;color:var(--mut);font-size:12px;text-align:center}
</style></head><body>
<div class="top">
  <div class="ttl">🎬 ${escH(data.name || data.slug)}</div>
  <div class="sub">${loc || '&nbsp;'}</div>
  <div class="bar">
    <div class="ring" id="ring" data-p="0%"></div>
    <div class="meta"><span id="done">0</span>/${totalShots(sections)} shots · ~${totalSecs(sections)}s footage · ★ = banner candidate</div>
    <div class="lang"><button id="bEn" class="on">EN</button><button id="bVi">VI</button></div>
  </div>
</div>
${rows}
<p class="foot">Clip naming: <code>${escH(data.slug)}__&lt;ID&gt;.mp4</code> · ticks saved on this device · shoot ★ shots landscape 16:9</p>
<script>
var KEY='shotlist:'+${JSON.stringify(data.slug)};
var boxes=[].slice.call(document.querySelectorAll('input[type=checkbox]'));
var saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
function upd(){var d=0;boxes.forEach(function(b){if(b.checked)d++});
  var pct=boxes.length?Math.round(d/boxes.length*100):0;
  var r=document.getElementById('ring');r.style.setProperty('--p',pct);r.setAttribute('data-p',pct+'%');
  document.getElementById('done').textContent=d;
  var s={};boxes.forEach(function(b){if(b.checked)s[b.dataset.id]=1});
  try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
boxes.forEach(function(b){if(saved[b.dataset.id])b.checked=true;b.addEventListener('change',upd)});
function setLang(vi){document.body.classList.toggle('vi',vi);
  document.getElementById('bVi').classList.toggle('on',vi);
  document.getElementById('bEn').classList.toggle('on',!vi);
  try{localStorage.setItem('shotlist:lang',vi?'vi':'en')}catch(e){}}
document.getElementById('bVi').addEventListener('click',function(){setLang(true)});
document.getElementById('bEn').addEventListener('click',function(){setLang(false)});
setLang((function(){try{return localStorage.getItem('shotlist:lang')==='vi'}catch(e){return false}})());
upd();
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

async function resolveSlugs() {
  if (positional.length) return positional;
  const all = await allSlugs();
  if (cityFilter) {
    const out = [];
    for (const s of all) if (await cityMatch(s, cityFilter)) out.push(s);
    return out;
  }
  if (flags.has('--all')) return all;
  return [];
}

// ─── Trip-pack index ────────────────────────────────────────────────────────────
function tripIndex(entries) {
  const cards = entries.map(e => `<a class="c" href="${escH(e.slug)}.html">
    <b>${escH(e.name || e.slug)}</b><small>${escH([e.district, e.regionCity].filter(Boolean).join(' · '))}</small>
    <small>${e.shots} shots · ~${e.secs}s</small></a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Site-visit shot lists</title><style>
body{margin:0;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f6fb;color:#12121a;padding:20px}
h1{font-size:20px;margin:4px 4px 16px}
.g{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.c{display:block;background:#fff;border:1px solid #e7e7ee;border-radius:14px;padding:14px;text-decoration:none;color:inherit}
.c b{display:block;font-size:15px;margin-bottom:4px}.c small{display:block;color:#6b6b78;font-size:12.5px}
@media(max-width:640px){.g{grid-template-columns:1fr}}
</style></head><body><h1>🎬 Site-visit shot lists (${entries.length})</h1><div class="g">${cards}</div></body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const slugs = await resolveSlugs();
  if (!slugs.length) {
    console.error('Usage: node gen-shotlist.mjs <slug...> | --city <name> | --all  [--from-html]');
    process.exit(1);
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  const entries = [];
  for (const slug of slugs) {
    const data = await loadListing(slug);
    if (!data) { console.warn(`  ⚠ ${slug}: no data (not in Notion or properties/)`); continue; }
    const sections = buildSections(data);
    await fs.writeFile(path.join(OUT_DIR, `${slug}.md`), toMarkdown(data, sections));
    await fs.writeFile(path.join(OUT_DIR, `${slug}.html`), toHtml(data, sections));
    entries.push({ slug, name: data.name, regionCity: data.regionCity, district: data.district,
      shots: totalShots(sections), secs: totalSecs(sections) });
    console.log(`  ✓ ${slug} — ${totalShots(sections)} shots (~${totalSecs(sections)}s), src=${data.source} → shotlist/${slug}.html`);
  }
  if (entries.length > 1) {
    await fs.writeFile(path.join(OUT_DIR, 'index.html'), tripIndex(entries));
    console.log(`  ✓ trip pack → shotlist/index.html (${entries.length} listings)`);
  }
  console.log(`\nDone. ${entries.length} shot list(s) in shotlist/`);
}

main().catch(e => { console.error(e); process.exit(1); });
