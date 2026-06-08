#!/usr/bin/env node
// Audits every Live Australia listing field-by-field and reports whether each
// editorial field is PERSONALISED or still the bulk TEMPLATE. Read-only.
// Checks: Tagline, NAC Note (composition), Pros/Cons/Features JSON, Excerpt.
//
// Env: NOTION_TOKEN (req), NOTION_DATABASE_ID.

import { Client } from '@notionhq/client';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
if (!NOTION_TOKEN) { console.error('NOTION_TOKEN required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN, notionVersion: '2022-06-28' });

const rt = (p) => { if (!p) return ''; if (p.title) return p.title.map(t => t.plain_text).join(''); if (p.rich_text) return p.rich_text.map(t => t.plain_text).join(''); return ''; };
const json = (p) => { try { return JSON.parse(rt(p) || '[]'); } catch { return []; } };

// Templated signatures left by generate-au-listings.mjs:
const isTemplateTagline = (s) => /^Freehold .+ living in /i.test(s);
const isTemplateNote = (s) => /safe-haven hold rather than a cash-flow play\s+—\s+typical of/i.test(s);
const isTemplateExcerpt = (s) => /FIRB-approved new dwelling; capital-growth & safe-haven hold/i.test(s);
const isTemplatePros = (arr) => arr.some(x => /^Tight metropolitan rental market$/i.test(x.en || ''));
const isTemplateCons = (arr) => arr.some(x => /^~9-hour flight from Vietnam$/i.test(x.en || ''));
const isTemplateFeats = (arr) => arr.some(x => /established transport & amenity/i.test(x.en || ''));

async function fetchAU() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, filter: { property: 'Hub Status', select: { equals: 'Live' } }, start_cursor: cursor, page_size: 100 });
    out = out.concat(res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out.filter(pg => (pg.properties['Country']?.select?.name || '') === 'Australia');
}

(async () => {
  const rows = (await fetchAU()).sort((a, b) => rt(a.properties['🔗 Slug']).localeCompare(rt(b.properties['🔗 Slug'])));
  console.log(`Auditing ${rows.length} Live AU listings\n`);
  const M = (ok) => ok ? 'ok ' : 'TPL';
  console.log(`${'#'.padStart(2)} ${'slug'.padEnd(42)} tag note pros cons feat excerpt`);
  let allClean = 0; const issues = [];
  rows.forEach((pg, i) => {
    const p = pg.properties; const slug = rt(p['🔗 Slug']);
    const f = {
      tag: !isTemplateTagline(rt(p['🏷️ Tagline EN'])) && !!rt(p['🏷️ Tagline EN']),
      note: !isTemplateNote(rt(p['💬 NAC Note EN'])) && !!rt(p['💬 NAC Note EN']),
      pros: !isTemplatePros(json(p['✅ Pros JSON'])) && json(p['✅ Pros JSON']).length > 0,
      cons: !isTemplateCons(json(p['⚠️ Cons JSON'])) && json(p['⚠️ Cons JSON']).length > 0,
      feat: !isTemplateFeats(json(p['✨ Features JSON'])) && json(p['✨ Features JSON']).length > 0,
      exc: !isTemplateExcerpt(rt(p['Excerpt EN'])) && !!rt(p['Excerpt EN']),
    };
    const clean = Object.values(f).every(Boolean);
    if (clean) allClean++; else issues.push({ slug, f });
    console.log(`${String(i + 1).padStart(2)} ${slug.padEnd(42)} ${M(f.tag)}  ${M(f.note)}  ${M(f.pros)}  ${M(f.cons)}  ${M(f.feat)}  ${M(f.exc)}`);
  });
  console.log(`\n${allClean}/${rows.length} fully personalised.`);
  if (issues.length) {
    console.log('\nNot fully personalised:');
    for (const it of issues) {
      const bad = Object.entries(it.f).filter(([, v]) => !v).map(([k]) => k).join(', ');
      console.log(`  - ${it.slug}: still template/empty → ${bad}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });

// re-run audit after excerpt + Willow fallback
