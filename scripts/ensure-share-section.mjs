#!/usr/bin/env node
/**
 * ensure-share-section.mjs — inject a self-contained "Share" block into every
 * properties/*.html (PDPs) and country/*.html (CLPs) that doesn't already
 * have one (idempotent).
 *
 * Each block is fully self-contained — scoped CSS + inline script in one unit —
 * so it backfills cleanly into already-shipped pages from a single insertion
 * point (immediately before the page's footer). The share caption is composed
 * CLIENT-SIDE from the page's own og:title / tagline / price, so there are no
 * sync-notion or per-page data dependencies.
 *
 * Two palettes:
 *   • PDP block (PROP_DIR)  — NAC navy/orange, anchors before <footer class="nac-foot">
 *   • CLP block (COUNTRY_DIR) — NAC gold-on-dark, anchors before <footer class="cl-foot">
 *
 * Buttons (same on both): Facebook · LinkedIn · Threads · Instagram (copies
 * caption since IG has no web intent) · Copy link.
 *
 * Runs in create-pdp.yml + sync-notion.yml + sync-notion-clp.yml and standalone:
 *   node scripts/ensure-share-section.mjs            (all PDPs + all CLPs)
 *   node scripts/ensure-share-section.mjs <slug>     (one PDP)
 *   node scripts/ensure-share-section.mjs --clp <slug>  (one CLP)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROP_DIR = path.resolve(__dirname, '..', 'properties');
const COUNTRY_DIR = path.resolve(__dirname, '..', 'country');
const SENTINEL = 'id="nac-share"';
const SENTINEL_CLP = 'id="cl-share"';

const BLOCK = `      <!-- SHARE THIS LISTING (self-contained: scoped styles + inline script) -->
      <section id="nac-share" class="nac-share" data-share-v="3" aria-label="Share this listing">
        <span class="nac-share-lbl"><span data-vi="">Chia sẻ căn hộ này</span><span data-en="">Share this listing</span></span>
        <div class="nac-share-row">
          <button type="button" class="nac-share-btn" data-net="facebook" aria-label="Share on Facebook" title="Facebook"><img src="https://cdn.simpleicons.org/facebook/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="nac-share-btn" data-net="linkedin" aria-label="Share on LinkedIn" title="LinkedIn"><img src="https://cdn.simpleicons.org/linkedin/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="nac-share-btn" data-net="threads" aria-label="Share on Threads" title="Threads"><img src="https://cdn.simpleicons.org/threads/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="nac-share-btn" data-net="instagram" aria-label="Copy caption for Instagram" title="Instagram (copies caption)"><img src="https://cdn.simpleicons.org/instagram/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="nac-share-btn" data-net="copy" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#ffffff" d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7h-4a5 5 0 0 0 0 10h4v-1.9h-4A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm5-6v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10h-4z"/></svg></button>
        </div>
        <span class="nac-share-toast" id="nac-share-toast" role="status" hidden></span>
        <style>
          .nac-share{max-width:900px;margin:0 auto;padding:34px 20px 6px;text-align:center}
          .nac-share-lbl{display:block;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;color:#8a8576;margin-bottom:14px}
          .nac-share-row{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
          /* filled brand circles + white glyphs — matches the footer social row */
          .nac-share-btn{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;
            border:none;padding:0;color:#fff;transition:transform .18s ease,filter .18s ease}
          .nac-share-btn img,.nac-share-btn svg{width:19px;height:19px;display:block}
          .nac-share-btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
          .nac-share-btn:active{transform:translateY(0)}
          .nac-share-btn[data-net="facebook"]{background:#1877F2}
          .nac-share-btn[data-net="linkedin"]{background:#0A66C2}
          .nac-share-btn[data-net="threads"]{background:#000}
          .nac-share-btn[data-net="instagram"]{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)}
          .nac-share-btn[data-net="copy"]{background:#0F1A36}
          .nac-share-toast{display:inline-block;margin-top:12px;min-height:1.1em;font-size:.8rem;color:#E8743B;transition:opacity .2s}
        </style>
        <script>
          (function(){
            var s=document.getElementById('nac-share'); if(!s||s.dataset.wired) return; s.dataset.wired='1';
            var meta=function(p){var e=document.querySelector('meta[property="'+p+'"]');return e?e.getAttribute('content'):'';};
            var txt=function(sel){var e=document.querySelector(sel);return e?e.textContent.trim():'';};
            var url=meta('og:url')||location.href;
            var name=(meta('og:title')||document.title||'').split('—')[0].split('|')[0].trim();
            var tag=txt('[data-notion="tagline_en"]')||txt('[data-notion="tagline_vi"]');
            var price=txt('[data-notion="price_full"]');
            var cap=name+(tag?' — '+tag:'')+(price?' · from '+price:'');
            var links={
              facebook:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url),
              linkedin:'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(url),
              threads:'https://www.threads.net/intent/post?text='+encodeURIComponent(cap+' '+url)
            };
            var toast=function(m){var t=document.getElementById('nac-share-toast'); if(!t)return; t.textContent=m; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(function(){t.hidden=true;},2800);};
            var copy=function(text,msg){
              if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){toast(msg);},function(){toast('Copy failed — long-press to copy');});}
              else{var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');toast(msg);}catch(e){toast('Copy failed');}document.body.removeChild(ta);}
            };
            s.querySelectorAll('.nac-share-btn').forEach(function(b){
              b.addEventListener('click',function(){
                var net=b.getAttribute('data-net');
                if(links[net]){window.open(links[net],'_blank','noopener,noreferrer,width=640,height=660');}
                else if(net==='instagram'){copy(cap+' '+url,'Caption copied — paste it into your Instagram post'); window.open('https://www.instagram.com/','_blank','noopener,noreferrer');}
                else if(net==='copy'){copy(url,'Link copied');}
              });
            });
          })();
        </script>
      </section>

`;

// CLP share block — same 5 buttons, restyled to the CLP gold palette and
// anchored to the CLP footer. og:image / og:title / tagline pull works the
// same way client-side. Versioned (data-share-clp-v="1") so future upgrades
// can use the same strip-and-re-insert path as the PDP block.
const BLOCK_CLP = `      <!-- SHARE THIS COUNTRY (self-contained: scoped styles + inline script) -->
      <section id="cl-share" class="cl-share" data-share-clp-v="1" aria-label="Share this country page">
        <span class="cl-share-lbl"><span data-vi="Chia sẻ trang quốc gia">Chia sẻ trang quốc gia</span><span data-en="Share this country">Share this country</span></span>
        <div class="cl-share-row">
          <button type="button" class="cl-share-btn" data-net="facebook" aria-label="Share on Facebook" title="Facebook"><img src="https://cdn.simpleicons.org/facebook/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="cl-share-btn" data-net="linkedin" aria-label="Share on LinkedIn" title="LinkedIn"><img src="https://cdn.simpleicons.org/linkedin/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="cl-share-btn" data-net="threads" aria-label="Share on Threads" title="Threads"><img src="https://cdn.simpleicons.org/threads/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="cl-share-btn" data-net="instagram" aria-label="Copy caption for Instagram" title="Instagram (copies caption)"><img src="https://cdn.simpleicons.org/instagram/ffffff" alt="" aria-hidden="true"></button>
          <button type="button" class="cl-share-btn" data-net="copy" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#ffffff" d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7h-4a5 5 0 0 0 0 10h4v-1.9h-4A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm5-6v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10h-4z"/></svg></button>
        </div>
        <span class="cl-share-toast" id="cl-share-toast" role="status" hidden></span>
        <style>
          .cl-share{max-width:760px;margin:0 auto;padding:3rem 1.4rem 1rem;text-align:center}
          .cl-share-lbl{display:block;font-family:var(--ff-mono,ui-monospace,monospace);font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted,#8a8576);margin-bottom:1.1rem}
          .cl-share-row{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
          /* filled brand circles + white glyphs — matches PDP share row + CLP footer aesthetic */
          .cl-share-btn{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;
            border:none;padding:0;color:#fff;transition:transform .18s ease,filter .18s ease,box-shadow .22s ease}
          .cl-share-btn img,.cl-share-btn svg{width:19px;height:19px;display:block}
          .cl-share-btn:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:0 8px 24px -8px rgba(212,175,55,.45)}
          .cl-share-btn:active{transform:translateY(0)}
          .cl-share-btn[data-net="facebook"]{background:#1877F2}
          .cl-share-btn[data-net="linkedin"]{background:#0A66C2}
          .cl-share-btn[data-net="threads"]{background:#000}
          .cl-share-btn[data-net="instagram"]{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)}
          .cl-share-btn[data-net="copy"]{background:var(--gold,#d4af37);color:#0a0a0a}
          .cl-share-toast{display:inline-block;margin-top:14px;min-height:1.1em;font-family:var(--ff-mono,ui-monospace,monospace);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#d4af37);transition:opacity .2s}
          @media (max-width:680px){ .cl-share{padding:2.2rem 1rem .6rem} .cl-share-btn{width:42px;height:42px} }
        </style>
        <script>
          (function(){
            var s=document.getElementById('cl-share'); if(!s||s.dataset.wired) return; s.dataset.wired='1';
            var meta=function(p){var e=document.querySelector('meta[property="'+p+'"]');return e?e.getAttribute('content'):'';};
            var txt=function(sel){var e=document.querySelector(sel);return e?e.textContent.trim():'';};
            var url=meta('og:url')||location.href;
            var name=(meta('og:title')||document.title||'').split('·')[0].split('|')[0].trim();
            var tag=txt('.cl-hero-tag [data-en]')||txt('.cl-hero-tag [data-vi]');
            var cap=name+(tag?' — '+tag.replace(/\\s+/g,' ').trim():'');
            var links={
              facebook:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url),
              linkedin:'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(url),
              threads:'https://www.threads.net/intent/post?text='+encodeURIComponent(cap+' '+url)
            };
            var toast=function(m){var t=document.getElementById('cl-share-toast'); if(!t)return; t.textContent=m; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(function(){t.hidden=true;},2800);};
            var copy=function(text,msg){
              if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){toast(msg);},function(){toast('Copy failed — long-press to copy');});}
              else{var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');toast(msg);}catch(e){toast('Copy failed');}document.body.removeChild(ta);}
            };
            s.querySelectorAll('.cl-share-btn').forEach(function(b){
              b.addEventListener('click',function(){
                var net=b.getAttribute('data-net');
                if(links[net]){window.open(links[net],'_blank','noopener,noreferrer,width=640,height=660');}
                else if(net==='instagram'){copy(cap+' '+url,'Caption copied — paste into Instagram'); window.open('https://www.instagram.com/','_blank','noopener,noreferrer');}
                else if(net==='copy'){copy(url,'Link copied');}
              });
            });
          })();
        </script>
      </section>

`;

// Two-variant inject with version-sentinel upgrade path.
//   opts.versionSentinel — if already in the file, skip (current version installed)
//   opts.legacySentinel  — older marker; strip the prior block when present
//   opts.markerComment   — used by the regex to identify the legacy block
//   opts.legacyIdAttr    — backup regex on the legacy <section id="...">
const PDP_OPTS = {
  label: 'PDP',
  dir: PROP_DIR,
  anchor: '<footer class="nac-foot">',
  versionSentinel: 'data-share-v="3"',
  legacySentinel: SENTINEL,
  markerComment: '<!-- SHARE THIS LISTING',
  legacyIdAttr: 'id="nac-share"',
  block: BLOCK,
};
const CLP_OPTS = {
  label: 'CLP',
  dir: COUNTRY_DIR,
  anchor: '<footer class="cl-foot">',
  versionSentinel: 'data-share-clp-v="1"',
  legacySentinel: SENTINEL_CLP,
  markerComment: '<!-- SHARE THIS COUNTRY',
  legacyIdAttr: 'id="cl-share"',
  block: BLOCK_CLP,
};

function inject(file, opts) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(opts.versionSentinel)) return false; // already current
  // Upgrade path: strip any older share block (markup + scoped style/script),
  // then re-insert the current version.
  if (html.includes(opts.legacySentinel)) {
    const commentRe = new RegExp('[ \\t]*' + opts.markerComment.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '[\\s\\S]*?<\\/section>\\n?');
    const idRe = new RegExp('[ \\t]*<section ' + opts.legacyIdAttr.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '[\\s\\S]*?<\\/section>\\n?');
    html = html.replace(commentRe, '');
    html = html.replace(idRe, '');
  }
  const idx = html.indexOf(opts.anchor);
  if (idx === -1) { console.warn(`  ⚠ ${path.basename(file)}: no ${opts.anchor} anchor — skipped`); return false; }
  fs.writeFileSync(file, html.slice(0, idx) + opts.block + html.slice(idx));
  return true;
}

function runOne(opts, slug) {
  const files = slug
    ? [path.join(opts.dir, slug.endsWith('.html') ? slug : slug + '.html')]
    : fs.readdirSync(opts.dir).filter(f => f.endsWith('.html')).map(f => path.join(opts.dir, f));
  let n = 0;
  for (const f of files) { if (fs.existsSync(f) && inject(f, opts)) { n++; } }
  console.log(`ensure-share-section (${opts.label}): injected into ${n} file(s); ${files.length - n} already had it / skipped`);
}

function main() {
  const args = process.argv.slice(2);
  const clpMode = args.includes('--clp');
  const allMode = args.includes('--all');
  const slug = args.find(a => !a.startsWith('--'));

  if (allMode) {
    runOne(PDP_OPTS, slug);
    runOne(CLP_OPTS, slug);
  } else if (clpMode) {
    runOne(CLP_OPTS, slug);
  } else {
    runOne(PDP_OPTS, slug);
  }
}

main();
