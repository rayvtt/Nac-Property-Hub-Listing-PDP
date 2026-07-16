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
