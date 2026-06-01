#!/usr/bin/env node
// Ensures every properties/*.html has the inline !important font-feature-settings
// fix applied to each .word span via JS setProperty, disabling Cormorant Garamond's
// `hist`/`hlig` historical-ligature features that map lowercase 's' → long-s (ſ, U+017F).
// That glyph is absent from Google Fonts' latin/vietnamese subsets, rendering as blank.
//
// IMPORTANT: only `hist`/`hlig` are disabled — NOT `calt`/`liga`. Contextual alternates
// (`calt`, on by default) are what normalize Cormorant's 's' to the short form; turning
// them off RE-EXPOSES the long-s and is what caused "Istanbul" → "I tanbul" in the
// Định Vị NAC statement while the hero (calt on) rendered fine. Keep calt/liga enabled.
// Inline !important beats any author stylesheet rule including WP theme CSS.
// Idempotent: files that already contain the fix are skipped.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROPS = path.join(ROOT, 'properties');

const FIX = `      el.querySelectorAll('.word').forEach(function(w){
        w.style.setProperty('font-feature-settings','"hist" 0,"hlig" 0','important');
        w.style.setProperty('font-variant-alternates','normal','important');
      });`;

const OLD = `      el.innerHTML = html;\n    });\n  }\n  buildStatement();`;
const NEW = `      el.innerHTML = html;\n${FIX}\n    });\n  }\n  buildStatement();`;

const files = await fs.readdir(PROPS);
let patched = 0, already = 0;
for (const f of files) {
  if (!f.endsWith('.html') || f.startsWith('_')) continue;
  const fp = path.join(PROPS, f);
  const content = await fs.readFile(fp, 'utf-8');
  if (!content.includes('el.innerHTML = html;')) continue;
  if (content.includes("setProperty('font-feature-settings'")) { already++; continue; }
  const updated = content.replace(OLD, NEW);
  if (updated === content) { console.warn(`WARN: pattern not matched in ${f} — skipped`); continue; }
  await fs.writeFile(fp, updated, 'utf-8');
  console.log(`  patched: ${f}`);
  patched++;
}
console.log(`hist-glyph fix: ${patched} file(s) patched, ${already} already ok.`);
