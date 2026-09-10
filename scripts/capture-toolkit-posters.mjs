// Capture static poster screenshots of the NAC homepage toolkit's tool pages
// and commit them into this repo so GitHub Pages serves them WAF-free.
//
// Why here: the homepage (NAC---Property-Hub) is a PRIVATE repo, so its own
// Pages/jsDelivr can't serve public images, and WP media sits behind the site
// WAF (JS-challenges <img> loads → blank tiles). This repo has PUBLIC GitHub
// Pages, so JPGs committed here are reachable at
//   https://rayvtt.github.io/Nac-Property-Hub-Listing-PDP/toolkit-posters/<slug>.jpg
// which the homepage toolkit tiles use as their poster. No secret required —
// a real browser on the runner clears the WAF's JS challenge, and the runner's
// GITHUB_TOKEN commits the results.
//
// Each tool is captured twice: VI (<slug>.jpg) and EN (<slug>-en.jpg). The
// homepage swaps the poster src on the VI/EN toggle and falls back to VI (then
// to the branded cover) if a variant is missing.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT_DIR = 'toolkit-posters';
mkdirSync(OUT_DIR, { recursive: true });

// slug must match the POSTER_MAP in NAC-HOMEPAGE-V2.html
const TOOLS = [
  // ?access=granted was the hub beta-gate admin unlock; the gate is now removed
  // but the param is harmless, so the camera keeps using it.
  { slug: 'nac-tool-poster-property-hub',  url: 'https://nomadassetcollective.com/property-hub-bat-dong-san/?access=granted' },
  { slug: 'nac-tool-poster-nac-index',     url: 'https://nomadassetcollective.com/nac-residence-index/' },
  { slug: 'nac-tool-poster-quick-advisor', url: 'https://nomadassetcollective.com/tu-van-nhanh/' },
  { slug: 'nac-tool-poster-market-brief',  url: 'https://nomadassetcollective.com/property-hub-bat-dong-san/vietnam/' },
  { slug: 'nac-tool-poster-compare',       url: 'https://nomadassetcollective.com/property-hub-bat-dong-san/?access=granted#compareSection' },
  // langToggle: the WP front page 404s on ?lang=en (a plugin owns the `lang`
  // query var and only resolves vi) — drive the page's own VI/EN toggle instead
  { slug: 'nac-tool-poster-calculator',    url: 'https://nomadassetcollective.com/#calc', langToggle: true },
  { slug: 'nac-tool-poster-so-sanh',       url: 'https://nomadassetcollective.com/so-sanh/' },
  { slug: 'nac-tool-poster-brochures',     url: 'https://nomadassetcollective.com/brochures/' },
  { slug: 'nac-tool-poster-nac-times',     url: 'https://blog.nomadassetcollective.com/' },
];

const browser = await chromium.launch();
// A normal Chrome UA — headless Chromium advertises "HeadlessChrome", and the
// site WAF JS-challenges suspicious UAs with a reload loop that destroys evaluate().
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 750 },
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});

// evaluate() that survives a WAF-challenge reload: on "context destroyed",
// wait for the fresh document to settle and try again
async function ev(page, fn, arg) {
  for (let a = 0; a < 3; a++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) {
      if (!String(e.message).includes('destroyed')) throw e;
      console.log('  (page navigated mid-evaluate — waiting out the reload)');
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
  }
  return page.evaluate(fn, arg);
}

// the So Sánh page sits behind WP post-password protection — unlock the context
await ctx.request.post('https://nomadassetcollective.com/wp-login.php?action=postpass', {
  form: { post_password: 'nomad', redirect_to: 'https://nomadassetcollective.com/so-sanh/' },
  maxRedirects: 2,
}).catch((e) => console.warn('postpass unlock failed (so-sanh may show its gate):', e.message));

const LANGS = [
  { suffix: '', query: 'lang=vi' },
  { suffix: '-en', query: 'lang=en' },
];
const EN_TOGGLES = ['#btn-en', '.lang-btn[data-lang="en"]', '[data-lang-set="en"]'];

let failures = 0;
for (const t of TOOLS) {
  for (const L of LANGS) {
    const slug = t.slug + L.suffix;
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      const page = await ctx.newPage();
      try {
        console.log(`── ${slug}${attempt > 1 ? ' (retry)' : ''}`);
        // insert the lang query before any #fragment (…/?lang=en#compare)
        let url = t.url;
        if (L.query && !t.langToggle) {
          const hi = url.indexOf('#');
          const hash = hi >= 0 ? url.slice(hi) : '';
          const path = hi >= 0 ? url.slice(0, hi) : url;
          url = path + (path.includes('?') ? '&' : '?') + L.query + hash;
        }
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
        if (t.langToggle) {
          const want = L.suffix === '-en' ? 'en' : 'vi';
          await ev(page, (w) => {
            try { localStorage.setItem('nac_home_lang', w); } catch (e) {}
            const b = document.querySelector('.lang-btn[data-lang="' + w + '"]');
            if (b) b.click();
          }, want);
          await page.waitForTimeout(600);
          const got = await ev(page, () => document.documentElement.lang || '?');
          console.log(`  lang after toggle: ${got} (wanted ${want})`);
        } else if (L.suffix === '-en') {
          for (const sel of EN_TOGGLES) {
            const hit = await page.$(sel).catch(() => null);
            if (hit) { await hit.click().catch(() => {}); break; }
          }
        }
        await page.waitForTimeout(4500); // charts / animations / fonts settle
        const hashId = (t.url.split('#')[1] || '').trim();
        await ev(page, () => window.scrollTo(0, 700));
        await page.waitForTimeout(900);
        for (let pass = 0; pass < 5; pass++) {
          const landed = await ev(page, (id) => {
            const el = id ? document.getElementById(id) : null;
            if (!el) { window.scrollTo(0, 0); return true; }
            const drift = Math.abs(el.getBoundingClientRect().top);
            el.scrollIntoView({ block: 'start' });
            return drift < 4;
          }, hashId);
          await page.waitForTimeout(1000);
          if (landed && pass > 0) break;
        }
        await page.waitForTimeout(800);
        if (hashId === 'calc') {
          await page.waitForFunction(() => {
            const r = document.getElementById('calcRows');
            return r && r.children.length > 2;
          }, { timeout: 10000 }).catch(() => {});
        }
        const buf = await page.screenshot({ type: 'jpeg', quality: 72 });
        const path = `${OUT_DIR}/${slug}.jpg`;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, buf);
        console.log(`  saved ${path} (${(buf.length / 1024).toFixed(0)}KB)`);
        done = true;
      } catch (e) {
        console.error(`  ${attempt === 2 ? 'FAILED' : 'attempt 1 failed'} ${slug}: ${e.message}`);
        if (attempt === 2) failures++;
      } finally {
        await page.close().catch(() => {});
      }
    }
  }
}
await browser.close();
if (failures) { console.error(`${failures} poster(s) failed`); process.exit(1); }
console.log('All toolkit posters captured.');
