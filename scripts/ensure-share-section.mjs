#!/usr/bin/env node
/**
 * ensure-share-section.mjs — inject a self-contained "Share this listing" block
 * into every properties/*.html that doesn't already have one (idempotent).
 *
 * The block is fully self-contained — scoped CSS + inline script in one unit —
 * so it backfills cleanly into 100+ already-shipped PDPs from a single insertion
 * point (immediately before <footer class="nac-foot">). The share caption is
 * composed CLIENT-SIDE from the page's own og:title / tagline / price, so there
 * are no sync-notion or per-listing data dependencies.
 *
 * Buttons: Facebook · LinkedIn · Threads · Instagram (copy caption, no web
 * intent exists) · Copy link. Labels use the site's [data-vi]/[data-en] spans
 * so they inherit the existing language toggle.
 *
 * Runs in create-pdp.yml + sync-notion.yml (like fix-hist-glyph) and standalone:
 *   node scripts/ensure-share-section.mjs            (all PDPs + template)
 *   node scripts/ensure-share-section.mjs <slug>     (one file)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROP_DIR = path.resolve(__dirname, '..', 'properties');
const SENTINEL = 'id="nac-share"';
const ANCHOR = '<footer class="nac-foot">';

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

const VERSION = 'data-share-v="3"';
function inject(file) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(VERSION)) return false;            // already current
  // Upgrade path: strip any older share block (markup + scoped style/script),
  // then re-insert the current version. Self-contained single <section>, so the
  // first </section> after it closes the block.
  if (html.includes(SENTINEL)) {
    html = html.replace(/[ \t]*<!-- SHARE THIS LISTING[\s\S]*?<\/section>\n?/, '');
    html = html.replace(/[ \t]*<section id="nac-share"[\s\S]*?<\/section>\n?/, '');
  }
  const idx = html.indexOf(ANCHOR);
  if (idx === -1) { console.warn(`  ⚠ ${path.basename(file)}: no <footer> anchor — skipped`); return false; }
  fs.writeFileSync(file, html.slice(0, idx) + BLOCK + html.slice(idx));
  return true;
}

function main() {
  const only = process.argv[2];
  const files = only
    ? [path.join(PROP_DIR, only.endsWith('.html') ? only : only + '.html')]
    : fs.readdirSync(PROP_DIR).filter((f) => f.endsWith('.html')).map((f) => path.join(PROP_DIR, f));
  let n = 0;
  for (const f of files) { if (fs.existsSync(f) && inject(f)) { n++; } }
  console.log(`ensure-share-section: injected into ${n} file(s); ${files.length - n} already had it / skipped`);
}

main();
