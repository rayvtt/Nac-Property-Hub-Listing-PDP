// Offline check: rebuild every PDP title from what the HTML already carries
// (name = first " · " segment of the current title, ID from the tail,
// city from JSON-LD addressLocality) and assert all fit TITLE_MAX.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildPdpTitle, shortName, TITLE_MAX } from './pdp-title.mjs';

assert.equal(shortName('Limassol Del Mar — Leptos Estates, Beachfront Penthouse (Cyprus RBI)'), 'Limassol Del Mar');
assert.equal(buildPdpTitle({ nameEn: 'Pullman Panama City ', regionCity: 'Punta Pacifica, Panama City', country: 'Panama', idNum: '19' }),
  'Pullman Panama City · NAC-19'); // place already in the name
assert.equal(buildPdpTitle({ nameEn: 'Nobu Residences Da Nang', regionCity: 'Đà Nẵng', country: 'Việt Nam', idNum: '1' }),
  'Nobu Residences Da Nang · Đà Nẵng · NAC-1');
assert.equal(buildPdpTitle({}), '');

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'properties');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
let n = 0, before = 0, maxLen = 0;
const samples = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('_'))) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const t = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!t) continue;
  const old = decode(t[1].trim());
  const idNum = (old.match(/NAC-(\d+)\s*$/) || [])[1] || '';
  const nameEn = old.split(' · ')[0];
  const loc = (html.match(/"addressLocality":\s*"([^"]*)"/) || [])[1] || '';
  const country = (html.match(/"addressCountry":\s*"([^"]*)"/) || [])[1] || '';
  const neu = buildPdpTitle({ nameEn, regionCity: loc, country: country.length > 2 ? country : '', idNum });
  assert.ok(neu.length <= TITLE_MAX, `${f}: ${neu.length} > ${TITLE_MAX}: ${neu}`);
  assert.ok(!idNum || neu.endsWith(`NAC-${idNum}`), `${f}: lost ID`);
  n++; if (old.length > 70) before++; maxLen = Math.max(maxLen, neu.length);
  if (samples.length < 8 && old.length > 100) samples.push(`${old.length}→${neu.length}  ${neu}`);
}
console.log(`ok: ${n} PDP titles all ≤ ${TITLE_MAX} (max ${maxLen}); ${before} were > 70 before`);
console.log(samples.join('\n'));
