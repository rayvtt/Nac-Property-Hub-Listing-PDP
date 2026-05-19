#!/usr/bin/env node
// For each properties/*.html, finds .nac-cine-h spans with empty VI/EN content
// and generates a 2-clause italic title (VI + EN) by passing the matching
// .nac-cine-img background image to Claude's multimodal API.
//
// Idempotent — skips sections that already have titles. Skips entirely if
// ANTHROPIC_API_KEY is not set, so the surrounding pipeline never fails.
//
// Run locally:  ANTHROPIC_API_KEY=sk-ant-... node generate-cine-titles.mjs
// Run a single file:  node generate-cine-titles.mjs limassol-del-mar-dao-sip

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPERTIES_DIR = path.join(ROOT, 'properties');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ONLY_SLUG = process.argv[2] || null;

if (!API_KEY) {
  console.log('ANTHROPIC_API_KEY not set — skipping cine title generation.');
  process.exit(0);
}

const client = new Anthropic({ apiKey: API_KEY });

const SYSTEM = `You write short, evocative section titles for luxury property listing pages. Each title joins two clauses with " · " (space, middle dot U+00B7, space). Style is editorial and sensory — like a coffee-table book caption — not marketing copy.

Match the voice of these examples:
- VI: "Sky Bar tầng 43 · Tầm nhìn 270° ra biển Mỹ Khê" / EN: "Sky Bar floor 43 · 270° Mỹ Khê coastline"
- VI: "Tháp 186m · Thiết kế Japandi độc quyền Nobu" / EN: "186m tower · Japandi design by Nobu"
- VI: "Punta Pacifica · Vịnh Thái Bình Dương 270°" / EN: "Punta Pacifica · Pacific Bay 270°"
- VI: "Hồ vô cực tầng thượng · Tầm nhìn toàn cảnh" / EN: "Rooftop infinity pool · Skyline panorama"
- VI: "Cuộc Sống Nobu · Biển Mỹ Khê" / EN: "Life by Nobu · Mỹ Khê"

Rules:
- 4-9 words per language
- No emoji, no quotes, no period at the end
- The first clause names what is visible (architecture, feature, time of day); the second clause anchors location, brand, or feeling
- Use the property's real place names and brand from the context — never invent landmarks
- Output STRICT JSON only: {"vi": "...", "en": "..."}. No markdown, no preamble, no trailing text.`;

async function generateTitle(imageUrl, context) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: `Property: ${context.propertyName}\nBrand: ${context.brand || '—'}\nLocation: ${context.location || '—'}\nSection number: §${context.sectionNum}\n\nReturn JSON: {"vi": "...", "en": "..."}` },
      ],
    }],
  });
  const text = resp.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.vi || !parsed.en) throw new Error(`malformed: ${text}`);
  return parsed;
}

function extractContext($) {
  const propertyName = ($('h1.nac-hero-name [data-en]').text() || $('h1.nac-hero-name').text()).trim();
  const country = $('[data-notion="country"]').first().text().trim();
  const district = $('[data-notion="district"]').first().text().trim();
  const brand = $('.nac-fact-gold').first().text().trim();
  const location = [district, country].filter(Boolean).join(', ');
  return { propertyName, brand, location };
}

async function patchFile(htmlPath) {
  const html = await fs.readFile(htmlPath, 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });
  const ctx = extractContext($);

  let updates = 0;
  const sections = $('.nac-cine').toArray();

  for (const sec of sections) {
    const $sec = $(sec);
    const $titleVi = $sec.find('.nac-cine-h [data-vi]');
    const $titleEn = $sec.find('.nac-cine-h [data-en]');
    if (!$titleVi.length || !$titleEn.length) continue;
    const viFilled = $titleVi.text().trim();
    const enFilled = $titleEn.text().trim();
    // Notion (via sync-notion.mjs) is the source of truth. AI only fills gaps.
    if (viFilled && enFilled) continue;

    const imageStyle = $sec.find('.nac-cine-img').attr('style') || '';
    const m = imageStyle.match(/url\(['"]?(.+?)['"]?\)/);
    if (!m) continue;
    const imageUrl = m[1];
    const sectionNum = $sec.find('.nac-cine-num').text().trim() || '?';

    try {
      const { vi, en } = await generateTitle(imageUrl, { ...ctx, sectionNum });
      if (!viFilled) $titleVi.text(vi);
      if (!enFilled) $titleEn.text(en);
      updates += 1;
      console.log(`  §${sectionNum} → ${en}`);
    } catch (err) {
      console.warn(`  §${sectionNum} skipped: ${err.message}`);
    }
  }

  if (updates) {
    await fs.writeFile(htmlPath, $.html(), 'utf8');
    console.log(`✓ ${path.basename(htmlPath)}: ${updates} title(s) generated`);
  }
  return updates;
}

async function main() {
  let files = (await fs.readdir(PROPERTIES_DIR))
    .filter(f => f.endsWith('.html') && !f.startsWith('_template'))
    .map(f => path.join(PROPERTIES_DIR, f));

  if (ONLY_SLUG) {
    const target = path.join(PROPERTIES_DIR, `${ONLY_SLUG.replace(/\.html$/, '')}.html`);
    files = files.filter(f => f === target);
    if (!files.length) {
      console.error(`No file matched slug: ${ONLY_SLUG}`);
      process.exit(1);
    }
  }

  let total = 0;
  for (const f of files) {
    total += await patchFile(f);
  }
  console.log(`\nGenerated ${total} cine title(s) across ${files.length} file(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
