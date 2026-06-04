#!/usr/bin/env node
// Reconstructs a rolling window (default 14 days) of per-listing field changes
// from git history of properties/*.html and writes listing-changelog.json at the
// repo root. This is the ONLY reliable old→new source — Notion's API doesn't
// expose property-value history; sync-notion commits an HTML snapshot on every
// change, so diffing consecutive blobs recovers the full change log.
//
// Output entry: { ts, country, slug, name, field, label, kind, from, to }
// Newest-first. Consumed by the live feed on listing-status.html.
//
// Pure git + regex (no Notion, no secrets). Env: CHANGELOG_DAYS (default 14).

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Permanent ledger: by default scans the ENTIRE git history (deterministic, so
// re-runs reproduce the full log and nothing is ever dropped). CHANGELOG_DAYS
// can still scope to a rolling window if ever needed.
const DAYS = parseInt(process.env.CHANGELOG_DAYS || '3650', 10);
const LEDGER = DAYS >= 3650;
const SINCE = `${DAYS} days ago`;
const sh = (cmd) => execSync(cmd, { maxBuffer: 1 << 28, encoding: 'utf8' });
const shQuiet = (cmd) => { try { return sh(cmd); } catch { return ''; } };

// ── Field extractors over a PDP HTML string ─────────────────────────────────
const FLAG = { greece:'🇬🇷', turkey:'🇹🇷', australia:'🇦🇺', cyprus:'🇨🇾', panama:'🇵🇦',
  vietnam:'🇻🇳', 'united-kingdom':'🇬🇧', uk:'🇬🇧', thailand:'🇹🇭', malaysia:'🇲🇾',
  portugal:'🇵🇹', spain:'🇪🇸', uae:'🇦🇪', dubai:'🇦🇪' };

const m1 = (html, re) => { const m = html.match(re); return m ? m[1].trim() : null; };
const mAll = (html, re) => { const out = []; let m; const r = new RegExp(re, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((m = r.exec(html))) out.push(m[1].trim()); return out; };

// kind: num (X→Y), money (string→string), text (truncate), set (updated)
const FIELDS = [
  { key:'score',   label:'NAC Score',  kind:'num',   get:h => m1(h, /nac-donut-score"\s+data-count-to="([\d.]+)"/) },
  { key:'price',   label:'Entry Price',kind:'money', get:h => m1(h, /data-notion="price_short">([^<]+)</) },
  { key:'yield',   label:'Yield %',    kind:'num',   get:h => m1(h, /data-count-to="([\d.]+)"\s+data-notion="yield_pct"/) },
  { key:'irr',     label:'IRR %',      kind:'num',   get:h => m1(h, /data-count-to="([\d.]+)"\s+data-notion="irr_pct"/) },
  { key:'coc',     label:'Cash-on-Cash %', kind:'num', get:h => m1(h, /data-count-to="([\d.]+)"\s+data-notion="coc_pct"/) },
  { key:'payback', label:'Payback yr', kind:'num',   get:h => m1(h, /data-count-to="([\d.]+)"\s+data-notion="payback"/) },
  { key:'hero',    label:'Hero image', kind:'set',   get:h => (h.match(/imagedelivery\.net\/[^"')]+\/[a-z0-9-]+-hero\/public/) || [null])[0] },
  { key:'gallery', label:'Gallery',    kind:'set',   get:h => { const ids = mAll(h, /imagedelivery\.net\/[^"')]+\/([a-z0-9-]+-\d)\/public/); return ids.length ? [...new Set(ids)].sort().join(',') : null; } },
  { key:'market',  label:'Market stats', kind:'set', get:h => { const v = mAll(h, /nac-mkt-val">([^<]+)</); return v.length ? v.join(' | ') : null; } },
  { key:'bands',   label:'Price bands', kind:'set',  get:h => { const t = mAll(h, /nac-band-type[^>]*>([\s\S]*?)<\/td>/); const p = mAll(h, /nac-band-price[^>]*>([\s\S]*?)<\/td>/); return (t.length||p.length) ? (t.join('/') + '::' + p.join('/')).replace(/<[^>]+>/g,'').replace(/\s+/g,' ') : null; } },
  { key:'tagline', label:'Tagline',    kind:'text',  get:h => m1(h, /data-notion="tagline_en">([^<]*)</) },
  { key:'nacnote', label:'NAC Note',   kind:'text',  get:h => m1(h, /data-notion="nac_note_en">([^<]*)</) },
  { key:'market_prose', label:'Market prose', kind:'text', get:h => m1(h, /data-notion="market_en">([^<]*)</) },
  { key:'desc',    label:'Description',kind:'text',  get:h => m1(h, /data-notion="desc_en">([^<]*)</) },
];

const countryOf = (h) => (h.match(/property-hub-bat-dong-san\/([a-z-]+)\//) || [null, null])[1];
const nameOf = (h) => {
  let t = m1(h, /<title>([^<]+)<\/title>/) || '';
  t = t.replace(/\s*[|–—].*$/, '').trim(); // strip "| NAC" / "— City (...)" suffix
  return t || null;
};
const trunc = (s, n = 52) => { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

function extract(html) {
  const f = {};
  for (const fld of FIELDS) f[fld.key] = fld.get(html) || null;
  f._country = countryOf(html);
  f._name = nameOf(html);
  return f;
}

function show(rev, path) { return shQuiet(`git show ${rev}:${path} 2>/dev/null`); }

// ── Walk history ─────────────────────────────────────────────────────────────
const slugOf = (p) => p.replace(/^properties\//, '').replace(/\.html$/, '');
// Baseline = the commit just before the window. If the whole repo is younger
// than the window (genesis inside it), use the genesis commit as the baseline
// so the initial bulk import isn't reported as 88 "added" events — only changes
// *since* genesis + listings genuinely added later surface.
let baseRev = shQuiet(`git rev-list -1 --until="${SINCE}" HEAD`).trim();
if (!baseRev) baseRev = shQuiet(`git rev-list --max-parents=0 HEAD`).trim().split('\n')[0];
const state = {}; // slug → field-set

if (baseRev) {
  const files = shQuiet(`git ls-tree -r --name-only ${baseRev} -- properties`).split('\n').filter(p => /^properties\/.+\.html$/.test(p));
  for (const p of files) { const h = show(baseRev, p); if (h) state[slugOf(p)] = extract(h); }
}

const commits = shQuiet(`git log --since="${SINCE}" --reverse --pretty=%H%x09%cI -- 'properties/*.html'`)
  .split('\n').filter(Boolean).map(l => { const [h, iso] = l.split('\t'); return { h, iso }; })
  .filter(c => c.h !== baseRev); // baseRev is the seed, not a change to report

const entries = [];
for (const { h, iso } of commits) {
  const changed = shQuiet(`git diff-tree --no-commit-id --name-status -r ${h} -- 'properties/*.html'`)
    .split('\n').filter(Boolean).map(l => { const [st, ...rest] = l.split('\t'); return { st: st[0], path: rest.join('\t') }; });
  for (const { st, path } of changed) {
    if (!/^properties\/.+\.html$/.test(path)) continue;
    const slug = slugOf(path);
    if (st === 'D') {
      const prev = state[slug] || {};
      entries.push({ ts: iso, country: prev._country, slug, name: prev._name || slug, field: 'listing', label: 'Listing', kind: 'event', from: 'Live', to: 'removed' });
      delete state[slug]; continue;
    }
    const html = show(h, path); if (!html) continue;
    const cur = extract(html);
    const prev = state[slug];
    if (!prev) { // new within window
      entries.push({ ts: iso, country: cur._country, slug, name: cur._name || slug, field: 'listing', label: 'Listing', kind: 'event', from: null, to: 'added' });
      state[slug] = cur; continue;
    }
    for (const fld of FIELDS) {
      const a = prev[fld.key], b = cur[fld.key];
      if (a === b || b == null) continue;        // unchanged or not present now
      if (a == null && b != null && fld.kind !== 'num' && fld.kind !== 'money') continue; // first-fill of soft field — skip noise
      entries.push({
        ts: iso, country: cur._country || prev._country, slug, name: cur._name || prev._name || slug,
        field: fld.key, label: fld.label, kind: fld.kind,
        from: (fld.kind === 'text' || fld.kind === 'set') ? trunc(a) : a,
        to:   (fld.kind === 'text' || fld.kind === 'set') ? trunc(b) : b,
      });
    }
    state[slug] = cur;
  }
}

entries.sort((x, y) => (x.ts < y.ts ? 1 : x.ts > y.ts ? -1 : 0)); // newest first
const out = { generated: new Date().toISOString(), ledger: LEDGER, windowDays: DAYS, count: entries.length, flags: FLAG, entries };
writeFileSync('listing-changelog.json', JSON.stringify(out, null, 1));
console.log(`build-changelog: ${entries.length} change events over ${DAYS}d across ${new Set(entries.map(e => e.slug)).size} listings`);
const byField = {}; for (const e of entries) byField[e.label] = (byField[e.label] || 0) + 1;
console.log('by field: ' + Object.entries(byField).map(([k, v]) => `${k}=${v}`).join(', '));
