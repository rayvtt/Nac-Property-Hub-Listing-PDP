#!/usr/bin/env node
// pull-reels.mjs — bridge the 🎬 NAC - Reels - allthingsTikTok Notion DB into the
// site-visit film portal. Each reel row (e.g. "Script #021 — London Dock") owns a
// child "Shot Checklist" DB with per-shot Direction / ON-CAM / VO / Section / Done.
// This turns those into shotlist/scripts.json, which gen-shotlist.mjs inlines into
// the portal so on-site you read the REAL Claude-authored script (not the derived one).
//
//   node pull-reels.mjs                 # build scripts.json from committed reels-source.json (offline)
//   node pull-reels.mjs --from-notion   # refresh reels-source.json + scripts.json from Notion (needs NOTION_TOKEN)
//
// The transforms (parseOption/parseShotTitle/buildReel) are pure so the offline
// build and the live pull produce identical output.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(__dirname, 'reels-source.json');
const OUT_FILE = path.join(ROOT, 'shotlist', 'scripts.json');
const PROPERTIES_DIR = path.join(ROOT, 'properties');

const REELS_DB_ID = process.env.NAC_REELS_DB_ID || '32e48ec25e86804aaa56cdcb7389fd75';
const DEFAULT_SECTION_ORDER = ['Intro & Amenities', '2BR Tour', '3BR Tour', 'Interview', 'Closing & CTA'];

// ─── Pure transforms ────────────────────────────────────────────────────────────

// "~18s\n\n🇻🇳 \"...\"\n\n🇬🇧 ..." → { secs, vi, en, raw }. Handles VO/ON-CAM lines
// that carry only one language (interview questions) or no flags at all.
export function parseOption(str) {
  if (str == null || String(str).trim() === '') return null;
  const raw = String(str).trim();
  const sm = raw.match(/^~?\s*(\d+)\s*s\b/i);
  const secs = sm ? parseInt(sm[1], 10) : null;
  const dq = (s) => (s || '').replace(/^["“”]+|["“”]+$/g, '').replace(/["“”]+$/g, '').trim();
  const viM = raw.match(/🇻🇳([\s\S]*?)(?=🇬🇧|$)/);
  const enM = raw.match(/🇬🇧([\s\S]*)$/);
  let vi = viM ? dq(viM[1]) : '';
  let en = enM ? dq(enM[1]) : '';
  if (!vi && !en) {
    // no flags — strip the leading duration and use the remainder for both
    const body = raw.replace(/^~?\s*\d+\s*s\b\s*/i, '').trim();
    vi = body; en = body;
  }
  return { secs, vi, en, raw };
}

// "4. The Club" → { n:4, name:"The Club" }; "Note: …" → { n:null, name:"…", note:true }
export function parseShotTitle(str) {
  const s = String(str || '').trim();
  if (/^note\b/i.test(s)) return { n: null, name: s.replace(/^note:\s*/i, ''), note: true };
  const m = s.match(/^(\d+)\s*[.)]\s*(.*)$/);
  if (m) return { n: parseInt(m[1], 10), name: m[2].trim(), note: false };
  return { n: null, name: s, note: false };
}

const isDropRow = (shotTitle) => /delete me|stray empty/i.test(String(shotTitle || ''));

// { meta, shots[] } → portal-ready reel { …meta, doneCount, total, sections[] }
export function buildReel(reel) {
  const meta = reel.meta || {};
  const order = meta.sectionOrder && meta.sectionOrder.length ? meta.sectionOrder : DEFAULT_SECTION_ORDER;
  const rank = (name) => { const i = order.indexOf(name); return i < 0 ? order.length : i; };

  const byShot = (reel.shots || [])
    .filter((r) => !isDropRow(r.Shot))
    .map((r) => {
      const t = parseShotTitle(r.Shot);
      return {
        n: t.n, name: t.name, note: t.note,
        section: r.Section || '—',
        direction: (r['Direction (EN)'] || '').trim(),
        oncam: parseOption(r['ON-CAM option']),
        vo: parseOption(r['VO option']),
        done: r.Done === '__YES__' || r.Done === true,
      };
    });

  const secNames = [...new Set(byShot.map((s) => s.section))].sort((a, b) => rank(a) - rank(b));
  const sections = secNames.map((name) => {
    const rows = byShot.filter((s) => s.section === name);
    const note = rows.find((s) => s.note);
    const shots = rows.filter((s) => !s.note).sort((a, b) => (a.n || 999) - (b.n || 999));
    return { name, note: note ? note.name : '', shots };
  });

  const shotList = sections.flatMap((s) => s.shots);
  return {
    scriptNo: meta.scriptNo || '', slug: meta.slug || '', postName: meta.postName || '',
    status: meta.status || '', filmingStatus: meta.filmingStatus || '',
    platforms: meta.platforms || [], durationSec: meta.durationSec || null,
    hookType: meta.hookType || '', postUrl: meta.postUrl || null,
    reelUrl: meta.reelUrl || '', checklistUrl: meta.checklistUrl || '',
    total: shotList.length, doneCount: shotList.filter((s) => s.done).length,
    sections,
  };
}

// ─── Slug resolution (live pull only) ───────────────────────────────────────────
async function listingSlugs() {
  try {
    const files = await fs.readdir(PROPERTIES_DIR);
    return files.filter((f) => f.endsWith('.html') && !f.startsWith('_')).map((f) => f.replace(/\.html$/, ''));
  } catch { return []; }
}
function matchSlug(postName, slugs) {
  const t = String(postName || '').toLowerCase();
  // longest slug whose hyphen-free words mostly appear in the post name wins
  let best = '', bestScore = 0;
  for (const s of slugs) {
    const words = s.split('-').filter((w) => w.length > 2);
    const hit = words.filter((w) => t.includes(w)).length;
    const score = hit / Math.max(1, words.length);
    if (hit >= 2 && score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 0.5 ? best : '';
}

// ─── Notion pull ────────────────────────────────────────────────────────────────
async function pullFromNotion() {
  const TOKEN = process.env.NOTION_TOKEN;
  if (!TOKEN) { console.error('NOTION_TOKEN required for --from-notion'); process.exit(1); }
  const { Client } = await import('@notionhq/client');
  const notion = new Client({ auth: TOKEN, notionVersion: '2022-06-28' });
  const slugs = await listingSlugs();

  // 1) every reel row
  const reels = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: REELS_DB_ID, start_cursor: cursor, page_size: 100 });
    reels.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  const rt = (p) => !p ? '' : ((p.title || p.rich_text || []).map((t) => t.plain_text).join('').trim());
  const sel = (p) => p && p.select ? p.select.name : '';
  const multi = (p) => p && Array.isArray(p.multi_select) ? p.multi_select.map((s) => s.name) : [];

  const out = [];
  for (const page of reels) {
    const pr = page.properties;
    const postName = rt(pr['Post name']);
    // 2) find this reel's child Shot-Checklist database
    let childDbId = null, checklistUrl = '';
    let bc;
    do {
      const kids = await notion.blocks.children.list({ block_id: page.id, start_cursor: bc, page_size: 100 });
      const db = kids.results.find((b) => b.type === 'child_database');
      if (db) { childDbId = db.id; checklistUrl = 'https://app.notion.com/p/' + db.id.replace(/-/g, ''); break; }
      bc = kids.has_more ? kids.next_cursor : null;
    } while (bc);
    if (!childDbId) continue;

    // 3) pull the shot rows
    const shots = [];
    let sc;
    do {
      const q = await notion.databases.query({ database_id: childDbId, start_cursor: sc, page_size: 100 });
      for (const row of q.results) {
        const rp = row.properties;
        shots.push({
          Shot: rt(rp['Shot']),
          Section: sel(rp['Section']),
          'Direction (EN)': rt(rp['Direction (EN)']),
          'ON-CAM option': rt(rp['ON-CAM option']),
          'VO option': rt(rp['VO option']),
          Done: rp['Done'] && rp['Done'].checkbox ? '__YES__' : '__NO__',
        });
      }
      sc = q.has_more ? q.next_cursor : null;
    } while (sc);

    const scriptNo = (postName.match(/#\s*0*(\d+)/) || [])[1] || '';
    out.push({
      meta: {
        scriptNo: scriptNo ? scriptNo.padStart(3, '0') : '',
        slug: matchSlug(postName, slugs),
        postName,
        status: sel(pr['Status']), filmingStatus: sel(pr['Filming Status']),
        platforms: multi(pr['Platform']),
        durationSec: pr['Duration (sec)'] && typeof pr['Duration (sec)'].number === 'number' ? pr['Duration (sec)'].number : null,
        hookType: sel(pr['Hook Type']),
        postUrl: pr['Post URL'] ? pr['Post URL'].url : null,
        reelUrl: page.url || '',
        checklistUrl,
        sectionOrder: DEFAULT_SECTION_ORDER,
      },
      shots,
    });
  }
  await fs.writeFile(SOURCE_FILE, JSON.stringify({ _note: 'Auto-pulled from Notion by pull-reels.mjs --from-notion', reels: out }, null, 2) + '\n');
  console.log(`  ✓ pulled ${out.length} reel(s) from Notion → reels-source.json`);
  return { reels: out };
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const fromNotion = process.argv.includes('--from-notion');
  const source = fromNotion ? await pullFromNotion() : JSON.parse(await fs.readFile(SOURCE_FILE, 'utf8'));
  const reels = (source.reels || []).map(buildReel).filter((r) => r.slug);
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify({ reels }, null, 2) + '\n');
  const totalShots = reels.reduce((a, r) => a + r.total, 0);
  console.log(`  ✓ scripts.json · ${reels.length} reel script(s) · ${totalShots} shots`);
  for (const r of reels) console.log(`     #${r.scriptNo} ${r.slug} — ${r.total} shots (${r.doneCount} done) · ${r.status}`);
}

// only run main when invoked directly (keeps transforms importable/testable)
if (process.argv[1] && process.argv[1].endsWith('pull-reels.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
