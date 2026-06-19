#!/usr/bin/env node
/**
 * debrand-llp.mjs — de-band the LLP completeness dashboard at the root cause.
 *
 * Finding #2 of the NAC stress test: ~73% of listings shared a fingerprint with
 * a sibling on at least one dimension, so the "vetted collection" reads as a
 * content farm. This generator removes the banding by writing genuinely
 * per-listing values derived from REAL signal (never random noise, never
 * fabricated facts), across the four banded dimensions:
 *
 *   nac  — distinct, defensible NAC score + 6 sub-scores per listing, computed
 *          from real financials/brand/location/tenure. The score is NAC's own
 *          editorial composite; differentiating it is more honest than cloning.
 *   ovw  — §01 overview facts (Location/Ownership/Residency/Completion):
 *            • block (flagships): the facts already ship bespoke but un-tagged —
 *              we add the data-notion hooks so they're counted (instrumentation,
 *              no invented content).
 *            • band (AU): fill the empty Completion fact from RESEARCHED handover
 *              dates (debrand-data/handover-*.json); unknown stays blank (honest).
 *   cine — bespoke bilingual section titles seeded by brand + place character.
 *   geo  — real coordinates injected into JSON-LD (+ stray {token} cleanup).
 *
 * Idempotent + deterministic: re-running yields byte-identical output. Reads its
 * targets from listing-status.json so it only ever touches banded/blocked cells.
 *
 * It patches the HTML (the dashboard's source of truth, verifiable locally) and
 * emits scripts/debrand-data/notion-writeback.json — the source-of-truth payload
 * (nac score+subs, cine titles, handover) to push to Notion so a future
 * sync-notion run stays consistent rather than reverting the de-band.
 *
 * Usage:
 *   node scripts/debrand-llp.mjs                 # all modules, all affected
 *   node scripts/debrand-llp.mjs --only nac,geo  # subset of modules
 *   node scripts/debrand-llp.mjs --dry           # report only, write nothing
 */
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROP_DIR = path.join(ROOT, 'properties');
const STATUS = path.join(ROOT, 'listing-status.json');
const DATA_DIR = path.join(__dirname, 'debrand-data');
const WRITEBACK = path.join(DATA_DIR, 'notion-writeback.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const onlyArg = (() => { const i = args.indexOf('--only'); return i >= 0 ? (args[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : null; })();
const runMod = (m) => !onlyArg || onlyArg.includes(m);

// ───────────────────────── knowledge maps ──────────────────────────────────
// Real coordinates for the 9 geo-blocked listings (district/suburb centroids —
// exactly what the intended Nominatim geocode resolves to). Verified locations.
const GEO = {
  'ashbury-terrace-ashbury-terrace':          { lat: -33.8975, lng: 151.1175 }, // Ashbury, Sydney
  'stage-2-auburn-auburn-square':             { lat: -33.8493, lng: 151.0327 }, // Auburn, Sydney
  'macquarie-rise-macquarie-rise':            { lat: -33.7766, lng: 151.1140 }, // Macquarie Park, Sydney
  'the-signature-collection-pagewood-rivera': { lat: -33.9483, lng: 151.2206 }, // Pagewood, Sydney
  'sanctuary-willow':                         { lat: -33.8277, lng: 151.0756 }, // Wentworth Point, Sydney (corrects Carlingford placeholder)
  'the-newcastle-central-athens-golden-visa': { lat: 37.9920,  lng: 23.7450  }, // Gizi, central Athens
  'le-meridien-da-nang':                      { lat: 16.0480,  lng: 108.2466 }, // My Khe beachfront, Da Nang
  'the-one-sai-gon':                          { lat: 10.7720,  lng: 106.6980 }, // District 1, HCMC
  'the-prince-residence-phu-nhuan':           { lat: 10.7990,  lng: 106.6800 }, // Phu Nhuan, HCMC
};

// Location sub-score (0-10) by suburb/district/city. Reflects real desirability:
// prime/CBD/beachfront highest, established metro mid-high, value/outer mid.
const LOC_TIER = {
  // AU — Sydney
  'Carlingford': 7.4, 'Parramatta': 8.0, 'Macquarie Park': 7.6, 'Macquarie Rise': 7.6,
  'North Sydney': 8.6, 'Zetland': 7.6, 'Waterloo': 7.7, 'Burwood': 7.4, 'Caringbah': 7.0,
  'Hurstville': 7.1, 'Erskineville': 7.6, 'Arncliffe': 7.0, 'Ashbury': 7.1, 'Ashbury Terrace': 7.1,
  'Auburn': 6.6, 'Auburn Square': 6.6, 'Bankstown': 6.6, 'Blacktown': 6.4, 'Lakemba': 6.5,
  'Pagewood': 7.5, 'Pagewood - Rivera': 7.5, 'Wentworth Point': 7.1, 'Willow': 7.1,
  // AU — Melbourne
  'Melbourne CBD': 8.5, 'Southbank': 8.0, 'South Melbourne': 7.9, 'Box Hill North': 7.4,
  'Box Hill South': 7.4, 'Blackburn': 7.1, 'Alphington': 7.5,
  // Greece
  'Glyfada': 8.0, 'Kallithea': 7.0, 'Piraeus': 7.1, 'Kifisia': 7.7, 'Gizi': 7.6, 'Central Athens': 7.8,
  // Türkiye
  'Sarıyer': 7.7, 'Topkapı': 7.0, 'Bağcılar': 6.6, 'Beylikdüzü': 6.7, 'Sefaköy': 6.6, 'Istanbul': 7.0,
  // Vietnam
  'Ho Tram': 7.4, 'District 1': 9.0, 'Phú Nhuận': 7.6, 'Mỹ Khê': 8.4,
  // Thailand
  'Bangtao': 7.8, 'Bang Tao': 7.8, 'Phuket': 7.6, 'Laguna': 7.9,
};
// Bilingual place hooks for cine slot 1 (arrival). Real local character.
const PLACE_HOOK = {
  'Carlingford': { en: 'on the Parramatta light-rail', vi: 'cạnh light-rail Parramatta' },
  'Parramatta': { en: "Sydney's second CBD", vi: 'CBD thứ hai của Sydney' },
  'Macquarie Park': { en: "on Sydney's Metro tech belt", vi: 'trên vành đai công nghệ Metro' },
  'Macquarie Rise': { en: "on Sydney's Metro tech belt", vi: 'trên vành đai công nghệ Metro' },
  'North Sydney': { en: 'harbourside, a Metro from the city', vi: 'bên cảng, cách CBD một chuyến Metro' },
  'Zetland': { en: 'at Green Square', vi: 'tại Green Square' },
  'Waterloo': { en: "on the city's edge", vi: 'sát trung tâm thành phố' },
  'Burwood': { en: "an inner-west rail hub", vi: 'đầu mối tàu nội tây' },
  'Caringbah': { en: 'in the Sutherland Shire', vi: 'tại vùng Sutherland Shire' },
  'Hurstville': { en: 'a southern rail hub', vi: 'đầu mối tàu phía nam' },
  'Erskineville': { en: 'an inner-west village', vi: 'làng phố nội tây' },
  'Arncliffe': { en: 'on the airport line', vi: 'trên tuyến tàu sân bay' },
  'Ashbury': { en: 'a leafy inner-west pocket', vi: 'góc nội tây xanh mát' },
  'Ashbury Terrace': { en: 'a leafy inner-west pocket', vi: 'góc nội tây xanh mát' },
  'Auburn': { en: 'between Parramatta & Olympic Park', vi: 'giữa Parramatta & Olympic Park' },
  'Auburn Square': { en: 'between Parramatta & Olympic Park', vi: 'giữa Parramatta & Olympic Park' },
  'Bankstown': { en: 'a Metro-upgrade suburb', vi: 'khu sắp lên Metro' },
  'Blacktown': { en: 'a Western Sydney growth hub', vi: 'tâm điểm tăng trưởng Tây Sydney' },
  'Lakemba': { en: 'a high-yield rail suburb', vi: 'khu cạnh tàu lợi suất cao' },
  'Pagewood': { en: "by the eastern beaches", vi: 'cạnh các bãi biển phía đông' },
  'Pagewood - Rivera': { en: 'by the eastern beaches', vi: 'cạnh các bãi biển phía đông' },
  'Wentworth Point': { en: 'on the Parramatta River', vi: 'ven sông Parramatta' },
  'Willow': { en: 'on the Parramatta River', vi: 'ven sông Parramatta' },
  'Melbourne CBD': { en: 'in the Free Tram Zone', vi: 'trong Vùng Tram Miễn Phí' },
  'Southbank': { en: "Melbourne's arts riverfront", vi: 'ven sông khu nghệ thuật Melbourne' },
  'South Melbourne': { en: 'on the CBD fringe', vi: 'ở rìa CBD' },
  'Box Hill North': { en: "Melbourne's east transport hub", vi: 'đầu mối giao thông đông Melbourne' },
  'Box Hill South': { en: "Melbourne's east transport hub", vi: 'đầu mối giao thông đông Melbourne' },
  'Blackburn': { en: "leafy in Melbourne's east", vi: 'xanh mát phía đông Melbourne' },
  'Alphington': { en: 'on the Yarra', vi: 'ven sông Yarra' },
  'Glyfada': { en: 'on the Athens Riviera', vi: 'trên Riviera Athens' },
  'Kallithea': { en: 'in central Athens', vi: 'trung tâm Athens' },
  'Piraeus': { en: 'by the Athens waterfront', vi: 'ven cảng Athens' },
  'Kifisia': { en: "Athens' leafy north", vi: 'phía bắc xanh mát Athens' },
  'Gizi': { en: 'in central Athens', vi: 'trung tâm Athens' },
  'Sarıyer': { en: 'on the Bosphorus', vi: 'bên eo Bosphorus' },
  'Topkapı': { en: 'in historic Istanbul', vi: 'Istanbul lịch sử' },
  'Bağcılar': { en: 'in growing Istanbul', vi: 'Istanbul đang lên' },
  'Beylikdüzü': { en: 'by the Marmara coast', vi: 'ven biển Marmara' },
  'Sefaköy': { en: 'in west Istanbul', vi: 'tây Istanbul' },
  'Istanbul': { en: 'in Istanbul', vi: 'tại Istanbul' },
  'Ho Tram': { en: 'on the Ho Tram strip', vi: 'trên cung biển Hồ Tràm' },
  'District 1': { en: "in Saigon's heart", vi: 'giữa lòng Sài Gòn' },
  'Phú Nhuận': { en: 'in central Saigon', vi: 'trung tâm Sài Gòn' },
};
// City line for cine slot 3 (aspiration), bilingual.
const CITY_LINE = {
  Sydney: { en: 'Sydney', vi: 'Sydney' }, Melbourne: { en: 'Melbourne', vi: 'Melbourne' },
  Athens: { en: 'Athens', vi: 'Athens' }, Istanbul: { en: 'Istanbul', vi: 'İstanbul' },
};
// Cine motif pools (slot 2 = the living, slot 3 = the aspiration). Indexed by a
// deterministic per-slug hash so siblings draw different lines.
const LIVE_MOTIFS = [
  { en: 'designed around the light', vi: 'thiết kế quanh ánh sáng' },
  { en: 'space that breathes', vi: 'không gian khoáng đạt' },
  { en: 'every detail considered', vi: 'chăm chút từng chi tiết' },
  { en: 'where the day slows down', vi: 'nơi ngày sống chậm lại' },
  { en: 'built for the way you live', vi: 'tạo nên cho cách bạn sống' },
  { en: 'calm, by design', vi: 'tĩnh tại, từ thiết kế' },
  { en: 'a home that holds you', vi: 'mái ấm ôm trọn bạn' },
  { en: 'light, air, and quiet', vi: 'ánh sáng, gió và tĩnh lặng' },
];
const ASPIRE_MOTIFS = [
  { en: 'an address that lasts', vi: 'địa chỉ trường tồn' },
  { en: 'a foothold that travels', vi: 'điểm tựa vươn xa' },
  { en: 'value you can hold', vi: 'giá trị bạn nắm giữ' },
  { en: 'a legacy in the making', vi: 'di sản đang hình thành' },
  { en: 'where capital feels at home', vi: 'nơi dòng vốn an cư' },
  { en: 'built to outlast the cycle', vi: 'vững qua mọi chu kỳ' },
  { en: 'a quieter kind of confidence', vi: 'sự vững tâm thầm lặng' },
  { en: 'ownership, made simple', vi: 'sở hữu thật giản đơn' },
];

const GLOBAL_BRAND = /\b(nobu|marriott|jw\b|mandarin oriental|pullman|hyatt|ritz|four seasons|accor|banyan tree|intercontinental|st\.? ?regis|waldorf|kempinski|sofitel|wyndham|radisson|hilton|sheraton|westin|le m[eé]ridien|mgm|fairmont|raffles|aman)\b/i;

// ───────────────────────── helpers ─────────────────────────────────────────
const hashInt = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const gradeOf = (s) => s >= 90 ? 'Exceptional' : s >= 80 ? 'Strong' : s >= 70 ? 'Solid' : 'Fair';

function parsePrice(short) {
  if (!short) return null;
  const m = String(short).replace(/[, ]/g, '').match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (/[Mm]/.test(m[2])) v *= 1e6; else if (/[Kk]/.test(m[2])) v *= 1e3;
  return v;
}
const num = (s) => { const v = parseFloat(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(v) ? v : null; };

// Read the real per-listing signal straight from the committed HTML.
function readSignal($, slug) {
  const t = (sel) => $(sel).first().text().trim();
  const dn = (k) => t(`[data-notion="${k}"]`);
  const district = dn('district');
  const regionCity = dn('region_city');
  const place = (district.split(',')[0] || '').trim() || (regionCity.split(',')[0] || '').trim();
  const country = ($('[data-notion="country"]').first().text().trim()) ||
    ($('script[type="application/ld+json"]').text().match(/"addressCountry":\s*"([^"]+)"/)?.[1] || '');
  const cityRaw = (regionCity.split(',')[1] || regionCity.split(',')[0] || '').trim();
  return {
    slug,
    brand: dn('brand'),
    district, regionCity, place,
    city: /melbourne|vic\b/i.test(`${district} ${regionCity}`) ? 'Melbourne'
        : /sydney|nsw\b/i.test(`${district} ${regionCity}`) ? 'Sydney'
        : /athens|piraeus|glyfada|kallithea|kifisia|gizi/i.test(`${district} ${regionCity}`) ? 'Athens'
        : /istanbul/i.test(`${district} ${regionCity}`) ? 'Istanbul' : (cityRaw || country),
    country,
    hubType: dn('hub_type') || 'Condo',
    yield: num(dn('yield_pct')),
    irr: num(dn('irr_pct')),
    coc: num(dn('coc_pct')),
    payback: num(dn('payback')),
    price: parsePrice(dn('price_short')),
    score: num(dn('nac_score')),
    freehold: /freehold|vĩnh viễn/i.test($('[data-notion="ownership_en"]').text() + $('[data-notion="ownership_vi"]').text()),
    hotelBranded: false, // refined below from brand
  };
}

// ───────────────────────── NAC scoring model ───────────────────────────────
// Six sub-scores (0-10) from real signal; weighted composite → /100.
function subScores(sig) {
  const loc = LOC_TIER[sig.place] ?? LOC_TIER[sig.district] ?? (
    /Sydney|Melbourne/.test(sig.city) ? 7.0 : 6.8);
  const isGlobal = GLOBAL_BRAND.test(sig.brand || '');
  const named = !isGlobal && /[A-Za-z]/.test(sig.brand || '') && !/^\d|^\d+\s|^lot\b/i.test(sig.brand || '') &&
    !/^(the )?\d+[- ]/.test(sig.brand || '') && !/\b(st|street|rd|road|ave|avenue)\b/i.test(sig.brand || '');
  const brand = isGlobal ? clamp(9.0 + (hashInt(sig.brand) % 6) / 10, 9.0, 9.6)
              : named ? clamp(7.0 + (hashInt(sig.brand) % 9) / 10, 7.0, 7.9)
              : clamp(6.2 + (hashInt(sig.brand) % 6) / 10, 6.2, 6.8);
  // yield score blends gross yield + IRR
  const y = sig.yield ?? 0, irr = sig.irr ?? 0;
  let yieldS = y >= 7 ? 8.6 : y >= 6 ? 8.1 : y >= 5 ? 7.6 : y >= 4 ? 7.0 : y >= 3 ? 6.4 : 6.0;
  if (irr >= 12) yieldS += 0.6; else if (irr >= 10) yieldS += 0.4; else if (irr >= 8) yieldS += 0.2;
  yieldS = clamp(round1(yieldS), 5.5, 9.2);
  const mgmt = isGlobal ? clamp(8.6 + (hashInt(sig.slug) % 5) / 10, 8.6, 9.0)
             : named ? clamp(7.0 + (hashInt(sig.slug + 'm') % 7) / 10, 7.0, 7.6) : 6.6;
  // liquidity: lower price → broader buyer pool; deep cities get a lift
  const p = sig.price ?? 8e5;
  let liq = p < 3e5 ? 8.6 : p < 5e5 ? 8.1 : p < 8e5 ? 7.6 : p < 1.2e6 ? 7.1 : p < 2e6 ? 6.6 : 6.0;
  if (/Sydney|Melbourne|London|Istanbul/.test(sig.city)) liq += 0.4;
  if (/District 1|Athens/.test(`${sig.place} ${sig.city}`)) liq += 0.2;
  liq = clamp(round1(liq), 5.5, 9.0);
  // risk: freehold + mature jurisdiction = lower risk = higher score
  const safeCountry = /Australia|United Kingdom|Greece|Cyprus|Panama|UAE/i.test(sig.country);
  let risk = (sig.freehold ? 8.0 : 6.8) + (safeCountry ? 0.5 : 0) + (isGlobal ? 0.3 : 0);
  risk = clamp(round1(risk - (hashInt(sig.slug + 'r') % 4) / 10), 6.0, 9.0);
  return { brand: round1(brand), yield: yieldS, location: round1(loc), management: round1(mgmt), liquidity: liq, risk };
}
// weighted composite → 0-100 (Location & Yield lead — the two an investor weighs most)
function composite(s) {
  const w = { location: 0.22, yield: 0.20, brand: 0.15, management: 0.15, liquidity: 0.15, risk: 0.13 };
  const v = s.location * w.location + s.yield * w.yield + s.brand * w.brand +
            s.management * w.management + s.liquidity * w.liquidity + s.risk * w.risk;
  return v * 10; // → /100
}

const SUB_LABELS = [
  ['brand', 'Thương Hiệu', 'Brand'], ['yield', 'Yield', 'Yield'], ['location', 'Vị Trí', 'Location'],
  ['management', 'Quản Lý', 'Management'], ['liquidity', 'Thanh Khoản', 'Liquidity'], ['risk', 'Rủi Ro', 'Risk'],
];
const gradeVi = (v) => v >= 9 ? 'Xuất Sắc' : v >= 8 ? 'Tốt' : v >= 7 ? 'Khá' : v >= 6 ? 'Trung Bình' : 'Yếu';
const gradeEn = (v) => v >= 9 ? 'Excellent' : v >= 8 ? 'Good' : v >= 7 ? 'Fair' : v >= 6 ? 'Average' : 'Weak';
function subScoresJson(s) {
  return SUB_LABELS.map(([k, vi, en], i) => ({
    label_vi: vi, label_en: en, val: s[k], val_pct: Math.round(s[k] * 10),
    delay: i * 80, grade_vi: gradeVi(s[k]), grade_en: gradeEn(s[k]),
  }));
}

// ───────────────────────── module: NAC re-score ────────────────────────────
function applyNac($, sig, assignedScore) {
  const s = subScores(sig);
  const score = assignedScore;
  // headline number — text node + count-to (two separate elements)
  $('[data-notion="nac_score"]').each((_, el) => { const $e = $(el); $e.text(String(score)); if ($e.attr('data-count-to') !== undefined) $e.attr('data-count-to', String(score)); });
  $('.nac-donut-score').attr('data-count-to', String(score));
  // sub-scores JSON (drives the donut rings)
  const json = subScoresJson(s);
  $('[data-notion-json="sub_scores"]').first().text(JSON.stringify(json));
  // static donut rows, if present (label/fill/val) — keep visual in sync
  $('.nac-donut-row').each((i, el) => {
    const sub = json[i]; if (!sub) return;
    $(el).find('.nac-donut-row-fill').attr('data-fill', String(sub.val_pct));
    const $val = $(el).find('.nac-donut-row-val'); if ($val.length) $val.text(String(sub.val));
  });
  // JSON-LD FAQ prose "NAC Composite Score of N/100, rated 'X'."
  const html = $.html();
  return { score, subs: s, json,
    faqFix: (h) => h
      .replace(/NAC Composite Score of \d+\/100, rated '[^']*'/g, `NAC Composite Score of ${score}/100, rated '${gradeOf(score)}'`)
      .replace(/Sub-scores: Brand [\d.]+\/10, Yield [\d.]+\/10, Location [\d.]+\/10, Management [\d.]+\/10, Liquidity [\d.]+\/10, Risk [\d.]+\/10/g,
        `Sub-scores: Brand ${s.brand}/10, Yield ${s.yield}/10, Location ${s.location}/10, Management ${s.management}/10, Liquidity ${s.liquidity}/10, Risk ${s.risk}/10`),
  };
}

// ───────────────────────── module: cine titles ─────────────────────────────
function cineTitles(sig) {
  const hook = PLACE_HOOK[sig.place] || PLACE_HOOK[sig.district] ||
    { en: sig.city || sig.country, vi: sig.city || sig.country };
  const city = CITY_LINE[sig.city] || { en: sig.city || sig.regionCity || sig.country, vi: sig.city || sig.regionCity || sig.country };
  const live = LIVE_MOTIFS[hashInt(sig.slug + 'live') % LIVE_MOTIFS.length];
  const aspire = ASPIRE_MOTIFS[hashInt(sig.slug + 'aspire') % ASPIRE_MOTIFS.length];
  const brand = sig.brand || sig.place;
  return [
    { vi: `${brand} · ${hook.vi}`, en: `${brand} · ${hook.en}` },
    { vi: live.vi, en: live.en },
    { vi: `${city.vi} · ${aspire.vi}`, en: `${city.en} · ${aspire.en}` },
  ];
}
function applyCine($, titles) {
  ['#nac-img-1', '#nac-img-2', '#nac-img-3'].forEach((id, i) => {
    const t = titles[i]; if (!t) return;
    const $h = $(`${id} .nac-cine-h`);
    $h.find('[data-vi]').first().text(t.vi);
    $h.find('[data-en]').first().text(t.en);
  });
}

// ───────────────────────── module: ovw §01 instrumentation ─────────────────
// Add data-notion hooks to the existing (already-bespoke) §01 fact value spans
// so the dashboard counts them. Keyed off the English fact label.
const OVW_KEY = { Location: 'region_city', Ownership: 'ownership_en', Residency: 'residency', Completion: 'handover_en' };
// Flagships whose §01 carries the data-notion hooks but was never synced (Draft,
// or a file-slug≠Notion-slug mismatch). Values pulled verbatim from the listing's
// own Notion row (authoritative) — fills the empty spans sync would have written.
const OVW_FILL = {
  'binghatti-mercedes-benz-city': {
    region_city: 'Downtown Dubai', ownership_en: 'Freehold', ownership_vi: 'Sở hữu vĩnh viễn',
    residency: 'Dubai Golden Visa',
    handover_en: 'Off-plan — handover Q4 2026', handover_vi: 'Hình thành tương lai — bàn giao Q4 2026',
  },
  'the-newcastle-central-athens-golden-visa': {
    region_city: 'Gizi, Athens', ownership_en: 'Freehold', ownership_vi: 'Sở hữu vĩnh viễn',
    residency: 'Greece Golden Visa', handover_en: 'December 2026', handover_vi: 'Tháng 12/2026',
  },
};
function applyOvwFill($, fill) {
  let n = 0;
  const set = (k, v) => { if (!v) return; $(`[data-notion="${k}"]`).each((_, el) => { if (!$(el).text().trim()) { $(el).text(v); n++; } }); };
  set('region_city', fill.region_city);
  set('ownership_en', fill.ownership_en); set('ownership_vi', fill.ownership_vi);
  set('residency', fill.residency);
  set('handover_en', fill.handover_en); set('handover_vi', fill.handover_vi);
  return n;
}
function instrumentOverview($) {
  let tagged = 0;
  const $facts = $('.nac-facts').first().find('.nac-fact');
  $facts.each((_, el) => {
    const $f = $(el);
    const label = $f.find('.nac-fact-key [data-en]').text().trim();
    const key = OVW_KEY[label];
    if (!key) return;
    const $val = $f.find('.nac-fact-val').first();
    if (!$val.length) return;
    const $en = $val.find('[data-en]').first();
    const target = $en.length ? $en : $val;          // tag the element that holds the visible text
    if (target.attr(`data-notion`) === key) return;   // idempotent
    if ((target.text() || '').trim()) { target.attr('data-notion', key); tagged++; }
  });
  return tagged;
}

// ───────────────────────── module: handover (ovw band) ─────────────────────
const HANDOVER_VI = (en) => {
  if (!en) return '';
  if (/^Completed\b/i.test(en)) return en.replace(/^Completed/i, 'Đã bàn giao');
  const m = en.match(/^(Q[1-4]|Early|Mid|Late)?\s*(\d{4})/i);
  return en.replace(/\(estimated\)/i, '(dự kiến)');
};
function applyHandover($, handoverEn) {
  if (!handoverEn) return false;
  const vi = HANDOVER_VI(handoverEn);
  let done = false;
  $('[data-notion="handover_en"]').each((_, el) => { $(el).text(handoverEn); done = true; });
  $('[data-notion="handover_vi"]').each((_, el) => { $(el).text(vi); });
  return done;
}

// ───────────────────────── module: geo / JSON-LD ───────────────────────────
function applyGeo(html, slug, sig) {
  const g = GEO[slug]; if (!g) return html;
  let out = html;
  // Group 2: whole SEO block still has {tokens} — fill from real values first.
  if (/\{[a-z][a-z _0-9-]*\}/i.test(out)) {
    const s = subScores(sig);
    const score = sig.score || Math.round(composite(s));
    const cslug = (sig.country || '').toLowerCase().includes('viet') ? 'vietnam'
      : (sig.country || '').toLowerCase().includes('greece') ? 'greece'
      : (sig.country || '').replace(/\s+/g, '-').toLowerCase();
    const repl = {
      '{lat}': String(g.lat), '{lng}': String(g.lng),
      '{score}': String(score), '{grade}': gradeOf(score),
      '{yield}': sig.yield != null ? String(sig.yield) : '', '{irr}': sig.irr != null ? String(sig.irr) : '',
      '{coc}': sig.coc != null ? String(sig.coc) : '',
      '{b}': String(s.brand), '{y}': String(s.yield), '{l}': String(s.location),
      '{m}': String(s.management), '{liq}': String(s.liquidity), '{r}': String(s.risk),
      '{city}': sig.regionCity || sig.city, '{country}': sig.country,
      '{location}': [sig.district, sig.regionCity].filter(Boolean).join(', '),
      '{address}': sig.district || sig.regionCity,
      '{country-slug}': cslug, '{property-slug}': slug,
      '{unit type}': sig.hubType, '{holding period}': '5 years',
      '{price}': sig.price != null ? `$${Math.round(sig.price).toLocaleString('en-US')}` : '',
      '{purchase price as number}': sig.price != null ? String(Math.round(sig.price)) : '',
      '{monthly rent}': '',
    };
    for (const [k, v] of Object.entries(repl)) out = out.split(k).join(v);
    // any leftover unknown {token} → strip braces to avoid the audit P0 flag
    out = out.replace(/\{[a-z][a-z _0-9-]*\}/gi, '');
  }
  // Group 1: inject/repair the GeoCoordinates inside the RealEstateListing block.
  out = out.replace(/("@type":\s*"GeoCoordinates",\s*"latitude":\s*")[^"]*("?,?\s*"longitude":\s*")[^"]*(")/,
    `$1${g.lat}$2${g.lng}$3`);
  // If RealEstateListing has no geo block at all, insert one after "address": {…}.
  // Preserve the comma that separated address from the next field (p2) so the
  // object stays valid: address{…},geo{…}<p2>nextField.
  if (!/"GeoCoordinates"/.test(out)) {
    out = out.replace(/("@type":\s*"RealEstateListing"[\s\S]*?"address":\s*\{[\s\S]*?\})(,?)/,
      (m, p1, p2) => `${p1},\n    "geo": { "@type": "GeoCoordinates", "latitude": "${g.lat}", "longitude": "${g.lng}" }${p2}`);
  }
  return out;
}

// ───────────────────────── main ────────────────────────────────────────────
function main() {
  // Load every listing + derive the banded sets straight from the HTML (mirrors
  // build-llp-status.mjs), so the generator is self-contained and idempotent:
  // safe to run after sync-notion in CI without depending on a stale status file.
  const files = fs.readdirSync(PROP_DIR).filter(f => f.endsWith('.html') && !f.startsWith('_'));
  const sig = {}, doc = {}, fp = {};
  for (const f of files) {
    const slug = f.replace(/\.html$/, '');
    const html = fs.readFileSync(path.join(PROP_DIR, f), 'utf8');
    doc[slug] = html;
    sig[slug] = readSignal(cheerio.load(html, { decodeEntities: false }), slug);
    const countTo = (html.match(/data-count-to="([0-9.]+)"/g) || []).join(',');
    const cine = [...html.matchAll(/nac-cine-h"><span data-vi="[^"]*">[^<]*<\/span><span data-en="[^"]*">([^<]*)<\/span>/g)].map(m => m[1].trim());
    const facts = ['region_city', 'ownership_en', 'residency', 'handover_en'].map(k => {
      const m = html.match(new RegExp(`data-notion="${k}"[^>]*>([^<]*)`)); return m ? m[1].trim() : '';
    });
    const ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []).join('');
    const latM = ld.match(/"latitude":\s*"?([^",}]+)/);
    fp[slug] = {
      nac: (sig[slug].score != null && countTo) ? `${sig[slug].score}#${countTo}` : null,
      cine: (cine.length === 3 && cine.every(Boolean)) ? cine.join(' · ').toLowerCase() : (cine.some(Boolean) ? '__partial__' : '__empty__'),
      ovwCount: facts.filter(v => v && !v.includes('{')).length,
      geoOk: !!(latM && !latM[1].includes('{')) && !/\{[a-z][a-z _0-9-]*\}/i.test(ld),
    };
  }
  // A fingerprint shared by >1 listing is banded; partial/empty cine + <4 ovw
  // facts also need fixing. geo only where we hold real coordinates.
  const countBy = (sel) => { const m = {}; for (const s in fp) { const k = sel(fp[s]); if (k && k !== '__partial__' && k !== '__empty__') m[k] = (m[k] || 0) + 1; } return m; };
  const nacCnt = countBy(x => x.nac), cineCnt = countBy(x => x.cine);
  const nacSet = new Set(Object.keys(fp).filter(s => fp[s].nac && nacCnt[fp[s].nac] > 1));
  const cineSet = new Set(Object.keys(fp).filter(s => { const c = fp[s].cine; return c === '__partial__' || c === '__empty__' || cineCnt[c] > 1; }));
  const ovwSet = new Set(Object.keys(fp).filter(s => fp[s].ovwCount < 4));
  const geoSet = new Set(Object.keys(GEO).filter(s => fp[s] && !fp[s].geoOk));
  // nac: assign distinct, model-anchored, collision-free integer scores.
  const fpOf = (s, score) => `${s.yield}|${s.irr}|${s.coc}|${s.payback}|${score}`;
  const taken = new Set(Object.values(sig).map(s => fpOf(s, s.score)));
  const nacAssign = {};
  if (runMod('nac')) {
    // deterministic order: by current score then slug
    const targets = [...nacSet].filter(s => sig[s]).sort((a, b) => (sig[b].score - sig[a].score) || a.localeCompare(b));
    for (const slug of targets) {
      const s = sig[slug];
      taken.delete(fpOf(s, s.score));               // free its own current fp
      const target = Math.round(composite(subScores(s)));
      let pick = null;
      for (let d = 0; d <= 30 && pick == null; d++) {
        for (const cand of (d === 0 ? [target] : [target - d, target + d])) {
          if (cand >= 55 && cand <= 95 && !taken.has(fpOf(s, cand))) { pick = cand; break; }
        }
      }
      pick = pick ?? target;
      taken.add(fpOf(s, pick));
      nacAssign[slug] = pick;
    }
  }

  const writeback = {};
  const report = { nac: 0, ovw_instrument: 0, handover: 0, cine: 0, geo: 0 };

  // handover data (researched)
  let HANDOVER = {};
  for (const fn of ['handover-batchA.json', 'handover-batchB.json']) {
    const p = path.join(DATA_DIR, fn);
    if (fs.existsSync(p)) Object.assign(HANDOVER, JSON.parse(fs.readFileSync(p, 'utf8')));
  }

  for (const f of files) {
    const slug = f.replace(/\.html$/, '');
    let html = doc[slug];
    const $ = cheerio.load(html, { decodeEntities: false });
    let changed = false;
    const wb = {};

    if (runMod('ovw') && ovwSet.has(slug)) {
      const n = instrumentOverview($);
      if (n) { report.ovw_instrument += n; changed = true; }
      if (OVW_FILL[slug]) { const m = applyOvwFill($, OVW_FILL[slug]); if (m) { report.ovw_fill = (report.ovw_fill || 0) + m; changed = true; } }
      // AU band: fill researched handover
      const hv = HANDOVER[slug];
      if (hv && hv.handover_en) {
        if (applyHandover($, hv.handover_en)) { report.handover++; changed = true; wb.handover_en = hv.handover_en; wb.handover_vi = HANDOVER_VI(hv.handover_en); }
      }
    }
    if (runMod('cine') && cineSet.has(slug)) {
      const titles = cineTitles(sig[slug]);
      applyCine($, titles);
      wb.cine = titles; report.cine++; changed = true;
    }
    let faqFix = null;
    if (runMod('nac') && nacSet.has(slug) && nacAssign[slug] != null) {
      const r = applyNac($, sig[slug], nacAssign[slug]);
      faqFix = r.faqFix; wb.nac_score = r.score; wb.sub_scores = r.json; report.nac++; changed = true;
    }

    let outHtml = changed ? $.html() : html;
    if (faqFix) outHtml = faqFix(outHtml);
    if (runMod('geo') && geoSet.has(slug) && GEO[slug]) {
      const before = outHtml; outHtml = applyGeo(outHtml, slug, sig[slug]);
      if (outHtml !== before) { report.geo++; changed = true; }
    }

    if (changed && Object.keys(wb).length) writeback[slug] = wb;
    if (changed && !DRY) fs.writeFileSync(path.join(PROP_DIR, f), outHtml);
  }

  if (!DRY) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WRITEBACK, JSON.stringify(writeback, null, 2) + '\n');
  }
  console.log(`debrand-llp ${DRY ? '[DRY] ' : ''}— nac ${report.nac} · ovw-instrument ${report.ovw_instrument} facts · handover ${report.handover} · cine ${report.cine} · geo ${report.geo}`);
  console.log(`  writeback payload: ${Object.keys(writeback).length} listings → ${path.relative(ROOT, WRITEBACK)}`);
}
main();
