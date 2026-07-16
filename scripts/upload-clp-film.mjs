// Upload the CLP landmark-film clips to WP media and write the #clpFilm
// playlist block in the country page with the real WP source_urls.
// Idempotent (reuses existing media). Env: WP_APP_PASSWORD (WP_USER optional).
import { readFileSync, writeFileSync } from 'node:fs';

const WP = 'https://nomadassetcollective.com/wp-json/wp/v2';
const USER = process.env.WP_USER || 'admin_web';
const PASS = process.env.WP_APP_PASSWORD;
if (!PASS) { console.error('WP_APP_PASSWORD not set'); process.exit(1); }
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const UA = 'nac-clp-film/1.0 (github-actions)';

// per-country manifests — add a country here + a #clpFilm block in its page
const COUNTRIES = [
  {
    file: new URL('../country/gr.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-gr-acropolis',  l: 'Acropolis — Athens',           src: 'https://assets.mixkit.co/videos/31651/31651-720.mp4' },
      { name: 'nac-clp-gr-ruins',      l: 'Phế tích cổ đại — Athens',     src: 'https://assets.mixkit.co/videos/30369/30369-720.mp4' },
      { name: 'nac-clp-gr-castle',     l: 'Thành cổ Hy Lạp',              src: 'https://assets.mixkit.co/videos/3038/3038-720.mp4' },
      { name: 'nac-clp-gr-milos',      l: 'Bờ biển Milos',                src: 'https://assets.mixkit.co/videos/30528/30528-720.mp4' },
      { name: 'nac-clp-gr-coastline',  l: 'Bờ biển thiên đường',          src: 'https://assets.mixkit.co/videos/30380/30380-720.mp4' },
      { name: 'nac-clp-gr-village',    l: 'Làng biển đảo Hy Lạp',         src: 'https://assets.mixkit.co/videos/7792/7792-720.mp4' },
    ],
  },
  {
    file: new URL('../country/tr.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-tr-mosque',     l: 'Thánh đường Istanbul',         src: 'https://assets.mixkit.co/videos/35445/35445-720.mp4' },
      { name: 'nac-clp-tr-bosphorus',  l: 'Hoàng hôn cầu Bosphorus',      src: 'https://assets.mixkit.co/videos/11004/11004-720.mp4' },
      { name: 'nac-clp-tr-skyline',    l: 'Đường chân trời Istanbul',     src: 'https://assets.mixkit.co/videos/29026/29026-720.mp4' },
      { name: 'nac-clp-tr-cappadocia', l: 'Khinh khí cầu Cappadocia',     src: 'https://assets.mixkit.co/videos/12977/12977-720.mp4' },
      { name: 'nac-clp-tr-coast',      l: 'Bờ biển Istanbul',             src: 'https://assets.mixkit.co/videos/11995/11995-720.mp4' },
      { name: 'nac-clp-tr-waterways',  l: 'Eo biển Bosphorus',            src: 'https://assets.mixkit.co/videos/44906/44906-720.mp4' },
    ],
  },
  {
    file: new URL('../country/ae.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-ae-burj',       l: 'Burj Khalifa — Dubai',         src: 'https://assets.mixkit.co/videos/31033/31033-720.mp4' },
      { name: 'nac-clp-ae-palm',       l: 'Palm Jumeirah',                src: 'https://assets.mixkit.co/videos/30985/30985-720.mp4' },
      { name: 'nac-clp-ae-downtown',   l: 'Downtown Dubai — từ trên cao', src: 'https://assets.mixkit.co/videos/30991/30991-720.mp4' },
      { name: 'nac-clp-ae-marina',     l: 'Dubai Marina',                 src: 'https://assets.mixkit.co/videos/20207/20207-720.mp4' },
      { name: 'nac-clp-ae-beach',      l: 'Bãi biển Dubai',               src: 'https://assets.mixkit.co/videos/31005/31005-720.mp4' },
      { name: 'nac-clp-ae-burj-night', l: 'Burj Khalifa về đêm',          src: 'https://assets.mixkit.co/videos/39451/39451-720.mp4' },
    ],
  },
  {
    file: new URL('../country/uk.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-uk-bigben',     l: 'Big Ben — London',             src: 'https://assets.mixkit.co/videos/33823/33823-720.mp4' },
      { name: 'nac-clp-uk-towerbridge',l: 'Tower Bridge — từ trên cao',   src: 'https://assets.mixkit.co/videos/26852/26852-720.mp4' },
      { name: 'nac-clp-uk-londoneye',  l: 'London Eye',                   src: 'https://assets.mixkit.co/videos/4150/4150-720.mp4' },
      { name: 'nac-clp-uk-aerial',     l: 'Bay qua London',               src: 'https://assets.mixkit.co/videos/26853/26853-720.mp4' },
      { name: 'nac-clp-uk-thames',     l: 'Sông Thames — London',         src: 'https://assets.mixkit.co/videos/26857/26857-720.mp4' },
      { name: 'nac-clp-uk-sunset',     l: 'Hoàng hôn Tower Bridge',       src: 'https://assets.mixkit.co/videos/4457/4457-720.mp4' },
    ],
  },
  {
    file: new URL('../country/vn.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-vn-beach-central', l: 'Biển Nha Trang – Đà Nẵng',      src: 'https://assets.mixkit.co/videos/20204/20204-720.mp4' },
      { name: 'nac-clp-vn-terraces',      l: 'Ruộng bậc thang Tây Bắc',        src: 'https://assets.mixkit.co/videos/36771/36771-720.mp4' },
      { name: 'nac-clp-vn-mountains',     l: 'Núi rừng & đồng lúa',            src: 'https://assets.mixkit.co/videos/11277/11277-720.mp4' },
      { name: 'nac-clp-vn-paddies',       l: 'Ruộng lúa Việt Nam',             src: 'https://assets.mixkit.co/videos/16132/16132-720.mp4' },
      { name: 'nac-clp-vn-saigon',        l: 'Sài Gòn hối hả',                 src: 'https://assets.mixkit.co/videos/20201/20201-720.mp4' },
      { name: 'nac-clp-vn-saigon-night',  l: 'Phố đêm Sài Gòn',                src: 'https://assets.mixkit.co/videos/20203/20203-720.mp4' },
    ],
  },
  {
    file: new URL('../country/th.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-th-temple',     l: 'Đền cổ Thái Lan',              src: 'https://assets.mixkit.co/videos/11072/11072-720.mp4' },
      { name: 'nac-clp-th-bangkok',    l: 'Bangkok hoàng hôn',            src: 'https://assets.mixkit.co/videos/21916/21916-720.mp4' },
      { name: 'nac-clp-th-night',      l: 'Bangkok về đêm',               src: 'https://assets.mixkit.co/videos/27770/27770-720.mp4' },
      { name: 'nac-clp-th-phuket',     l: 'Hoàng hôn Phuket',             src: 'https://assets.mixkit.co/videos/6872/6872-720.mp4' },
      { name: 'nac-clp-th-beach',      l: 'Biển nhiệt đới Thái Lan',      src: 'https://assets.mixkit.co/videos/7060/7060-720.mp4' },
      { name: 'nac-clp-th-market',     l: 'Chợ nổi Thái Lan',             src: 'https://assets.mixkit.co/videos/11302/11302-720.mp4' },
    ],
  },
  {
    file: new URL('../country/my.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-my-skyline',    l: 'Kuala Lumpur — toàn cảnh',     src: 'https://assets.mixkit.co/videos/30180/30180-720.mp4' },
      { name: 'nac-clp-my-petronas',   l: 'Tháp đôi Petronas',            src: 'https://assets.mixkit.co/videos/20133/20133-720.mp4' },
      { name: 'nac-clp-my-petronas-n', l: 'Tháp đôi Petronas về đêm',     src: 'https://assets.mixkit.co/videos/20122/20122-720.mp4' },
      { name: 'nac-clp-my-dusk',       l: 'Kuala Lumpur — ngày sang đêm', src: 'https://assets.mixkit.co/videos/30988/30988-720.mp4' },
      { name: 'nac-clp-my-fromtop',    l: 'Kuala Lumpur — từ trên cao',   src: 'https://assets.mixkit.co/videos/39442/39442-720.mp4' },
      { name: 'nac-clp-my-night',      l: 'Kuala Lumpur về đêm',          src: 'https://assets.mixkit.co/videos/20183/20183-720.mp4' },
    ],
  },
  {
    file: new URL('../country/sg.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-sg-marinabay',  l: 'Marina Bay về đêm',            src: 'https://assets.mixkit.co/videos/30966/30966-720.mp4' },
      { name: 'nac-clp-sg-gardens',    l: 'Gardens by the Bay',           src: 'https://assets.mixkit.co/videos/20177/20177-720.mp4' },
      { name: 'nac-clp-sg-esplanade',  l: 'Esplanade — Singapore',        src: 'https://assets.mixkit.co/videos/20174/20174-720.mp4' },
      { name: 'nac-clp-sg-bay',        l: 'Vịnh Marina — Singapore',      src: 'https://assets.mixkit.co/videos/31084/31084-720.mp4' },
      { name: 'nac-clp-sg-fromtop',    l: 'Singapore — từ trên cao',      src: 'https://assets.mixkit.co/videos/11289/11289-720.mp4' },
      { name: 'nac-clp-sg-flyer',      l: 'Singapore Flyer',              src: 'https://assets.mixkit.co/videos/30967/30967-720.mp4' },
    ],
  },
  {
    file: new URL('../country/au.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-au-sydney',     l: 'Sydney — trung tâm thành phố', src: 'https://assets.mixkit.co/videos/11001/11001-720.mp4' },
      { name: 'nac-clp-au-brisbane',   l: 'Đường chân trời Brisbane',     src: 'https://assets.mixkit.co/videos/10984/10984-720.mp4' },
      { name: 'nac-clp-au-goldcoast',  l: 'Cung đường ven biển Úc',       src: 'https://assets.mixkit.co/videos/21014/21014-720.mp4' },
      { name: 'nac-clp-au-kangaroo',   l: 'Kangaroo — biểu tượng Úc',     src: 'https://assets.mixkit.co/videos/11111/11111-720.mp4' },
      { name: 'nac-clp-au-pinklake',   l: 'Hồ hồng nước Úc',              src: 'https://assets.mixkit.co/videos/11192/11192-720.mp4' },
      { name: 'nac-clp-au-koala',      l: 'Koala — nước Úc',              src: 'https://assets.mixkit.co/videos/11066/11066-720.mp4' },
    ],
  },
  {
    file: new URL('../country/cy.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-cy-villas',     l: 'Biệt thự ven Địa Trung Hải',   src: 'https://assets.mixkit.co/videos/8675/8675-720.mp4' },
      { name: 'nac-clp-cy-cityscape',  l: 'Thành phố Địa Trung Hải',      src: 'https://assets.mixkit.co/videos/15102/15102-720.mp4' },
      { name: 'nac-clp-cy-water',      l: 'Làn nước Địa Trung Hải',       src: 'https://assets.mixkit.co/videos/44912/44912-720.mp4' },
      { name: 'nac-clp-cy-pier',       l: 'Cầu tàu Địa Trung Hải',        src: 'https://assets.mixkit.co/videos/11318/11318-720.mp4' },
      { name: 'nac-clp-cy-sun',        l: 'Nắng Địa Trung Hải',           src: 'https://assets.mixkit.co/videos/25988/25988-720.mp4' },
      { name: 'nac-clp-cy-aerial',     l: 'Địa Trung Hải — từ trên cao',  src: 'https://assets.mixkit.co/videos/49218/49218-720.mp4' },
    ],
  },
  {
    file: new URL('../country/pa.html', import.meta.url).pathname,
    clips: [
      { name: 'nac-clp-pa-coast',      l: 'Bờ biển Caribbean',            src: 'https://assets.mixkit.co/videos/25266/25266-720.mp4' },
      { name: 'nac-clp-pa-sea',        l: 'Biển Caribbean',               src: 'https://assets.mixkit.co/videos/25293/25293-720.mp4' },
      { name: 'nac-clp-pa-aerial',     l: 'Bãi biển nhiệt đới — từ trên cao', src: 'https://assets.mixkit.co/videos/1573/1573-720.mp4' },
      { name: 'nac-clp-pa-paradise',   l: 'Thiên đường biển nhiệt đới',   src: 'https://assets.mixkit.co/videos/7205/7205-720.mp4' },
      { name: 'nac-clp-pa-waves',      l: 'Sóng biển nhiệt đới',          src: 'https://assets.mixkit.co/videos/16498/16498-720.mp4' },
      { name: 'nac-clp-pa-jungle',     l: 'Biển & rừng nhiệt đới',        src: 'https://assets.mixkit.co/videos/11017/11017-720.mp4' },
    ],
  },
];

async function wp(path, init = {}) {
  return fetch(`${WP}${path}`, { ...init, headers: { Authorization: AUTH, 'User-Agent': UA, ...(init.headers || {}) } });
}
async function findExisting(slug) {
  const r = await wp(`/media?search=${encodeURIComponent(slug)}&per_page=20`);
  if (!r.ok) return '';
  for (const m of (await r.json().catch(() => [])) || []) {
    if (m.slug === slug || (m.source_url || '').endsWith(`/${slug}.mp4`)) return m.source_url;
  }
  return '';
}
async function upload(name, src) {
  const dl = await fetch(src, { headers: { 'User-Agent': UA } });
  if (!dl.ok) throw new Error(`fetch ${src} → ${dl.status}`);
  const r = await wp('/media', {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename=${name}.mp4` },
    body: Buffer.from(await dl.arrayBuffer()),
  });
  if (!r.ok) throw new Error(`upload ${name} → ${r.status}`);
  return (await r.json()).source_url;
}

for (const c of COUNTRIES) {
  const out = [];
  for (const clip of c.clips) {
    let url = await findExisting(clip.name);
    if (url) console.log(`= exists: ${clip.name}`);
    else { url = await upload(clip.name, clip.src); console.log(`+ uploaded: ${clip.name} → ${url}`); }
    out.push({ u: url, l: clip.l });
  }
  let html = readFileSync(c.file, 'utf8');
  const re = /(<script type="application\/json" id="clpFilm">)([^]*?)(<\/script>)/;
  const m = html.match(re);
  if (!m) { console.error(`#clpFilm block not found in ${c.file}`); process.exit(1); }
  const json = JSON.stringify(out);
  if (json !== m[2]) { html = html.replace(re, `$1${json}$3`); writeFileSync(c.file, html); console.log(`${c.file}: playlist written (${out.length} clips).`); }
  else console.log(`${c.file}: already current.`);
}

// ── prune: delete any nac-clp-* VIDEO on WP media that no manifest references
// (old clips from swapped-out playlists). Slug+mime guarded.
const keep = new Set();
for (const c of COUNTRIES) for (const clip of c.clips) keep.add(clip.name);
let deleted = 0;
for (let page = 1; page <= 5; page++) {
  const r = await wp(`/media?search=nac-clp&per_page=100&page=${page}`);
  if (!r.ok) break;
  const arr = await r.json().catch(() => []);
  if (!Array.isArray(arr) || !arr.length) break;
  for (const m of arr) {
    const slug = m.slug || '';
    if (!slug.startsWith('nac-clp-') || !(m.mime_type || '').startsWith('video')) continue;
    if (keep.has(slug)) continue;
    const d = await wp(`/media/${m.id}?force=true`, { method: 'DELETE' });
    if (d.ok) { deleted++; console.log(`- pruned: ${slug} (#${m.id})`); }
    else console.error(`! prune failed: ${slug} -> ${d.status}`);
  }
  if (arr.length < 100) break;
}
console.log(`Prune: removed ${deleted} unreferenced clip(s).`);
