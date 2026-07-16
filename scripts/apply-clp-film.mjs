// Patch a country page's #clpFilm playlist from the ?edit=1 manager dispatch.
// Env: FILE (country/xx.html), CLIPS (JSON array of {u,l}).
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.FILE || '';
if (!/^country\/[a-z]{2}\.html$/.test(file)) { console.error(`refusing file: ${file}`); process.exit(1); }
let clips;
try { clips = JSON.parse(process.env.CLIPS || ''); } catch (e) { console.error('CLIPS unparseable'); process.exit(1); }
if (!Array.isArray(clips) || !clips.length) { console.error('refusing empty playlist'); process.exit(1); }
for (const c of clips) {
  if (!c || typeof c.u !== 'string' || !/^https:\/\//.test(c.u)) { console.error('bad clip url'); process.exit(1); }
  c.l = String(c.l || '').slice(0, 80);
}
let html = readFileSync(file, 'utf8');
const re = /(<script type="application\/json" id="clpFilm">)([^]*?)(<\/script>)/;
if (!re.test(html)) { console.error('#clpFilm block not found'); process.exit(1); }
html = html.replace(re, `$1${JSON.stringify(clips.map((c) => ({ u: c.u, l: c.l })))}$3`);
writeFileSync(file, html);
console.log(`${file}: playlist set (${clips.length} clips).`);
