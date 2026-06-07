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
      <section id="nac-share" class="nac-share" aria-label="Share this listing">
        <span class="nac-share-lbl"><span data-vi="">Chia sẻ căn hộ này</span><span data-en="">Share this listing</span></span>
        <div class="nac-share-row">
          <button type="button" class="nac-share-btn" data-net="facebook" aria-label="Share on Facebook" title="Facebook"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M14 9h3l.4-3H14V4.3c0-.9.3-1.5 1.6-1.5H17V.1C16.7.1 15.7 0 14.6 0 12.2 0 10.6 1.4 10.6 4v2H8v3h2.6v8H14V9z"/></svg></button>
          <button type="button" class="nac-share-btn" data-net="linkedin" aria-label="Share on LinkedIn" title="LinkedIn"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.3 8h4.4v13H.3V8zm7.1 0h4.2v1.8h.06c.6-1.1 2-2.2 4.06-2.2 4.35 0 5.15 2.86 5.15 6.58V21h-4.4v-5.9c0-1.4 0-3.2-2-3.2-2 0-2.3 1.5-2.3 3.1V21H7.4V8z"/></svg></button>
          <button type="button" class="nac-share-btn" data-net="threads" aria-label="Share on Threads" title="Threads"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12.18 22h-.05c-3.02-.02-5.34-1.02-6.9-2.96C3.83 17.32 3.1 14.93 3.07 12.02v-.04C3.1 9.07 3.83 6.68 5.23 4.96 6.79 3.02 9.11 2.02 12.13 2h.05c2.32.02 4.25.62 5.74 1.79 1.4 1.1 2.39 2.66 2.93 4.65l-1.95.55c-.9-3.2-3.13-4.84-6.73-4.86-2.37.02-4.16.78-5.32 2.25-1.09 1.38-1.65 3.36-1.67 5.89.02 2.53.58 4.51 1.67 5.89 1.16 1.47 2.95 2.23 5.32 2.25 2.13-.02 3.55-.52 4.72-1.68.84-.83 1.28-1.86 1.43-2.96-.69-.4-1.5-.64-2.36-.71-.13 1.06-.6 2.43-2.36 2.43-1.4 0-2.5-.95-2.5-2.3 0-1.6 1.45-2.42 3.13-2.42.6 0 1.16.05 1.66.16-.07-.93-.55-1.55-1.62-1.55-.86 0-1.4.36-1.74.99l-1.78-.86c.64-1.18 1.83-1.86 3.52-1.86 2.43 0 3.62 1.5 3.62 4.04v.06c.97.55 1.66 1.32 2.04 2.3.07-.78.05-1.96-.46-3.5l1.86-.6c.66 2.03.6 3.97-.18 5.65C17.5 20.86 15.18 22 12.18 22zm.74-8.2c-.86 0-1.34.4-1.34.83 0 .3.27.66.93.66.78 0 1.2-.7 1.3-1.4-.27-.06-.57-.09-.89-.09z"/></svg></button>
          <button type="button" class="nac-share-btn" data-net="instagram" aria-label="Copy caption for Instagram" title="Instagram (copies caption)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.62c-3.15 0-3.5.01-4.74.07-.97.04-1.5.21-1.85.34-.46.18-.8.4-1.15.74-.34.35-.56.69-.74 1.15-.13.35-.3.88-.34 1.85-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.04.97.21 1.5.34 1.85.18.46.4.8.74 1.15.35.34.69.56 1.15.74.35.13.88.3 1.85.34 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c.97-.04 1.5-.21 1.85-.34.46-.18.8-.4 1.15-.74.34-.35.56-.69.74-1.15.13-.35.3-.88.34-1.85.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.04-.97-.21-1.5-.34-1.85a3.1 3.1 0 0 0-.74-1.15 3.1 3.1 0 0 0-1.15-.74c-.35-.13-.88-.3-1.85-.34-1.24-.06-1.59-.07-4.74-.07zm0 2.76a5.46 5.46 0 1 1 0 10.92 5.46 5.46 0 0 1 0-10.92zm0 9a3.54 3.54 0 1 0 0-7.08 3.54 3.54 0 0 0 0 7.08zm6.95-9.22a1.27 1.27 0 1 1-2.55 0 1.27 1.27 0 0 1 2.55 0z"/></svg></button>
          <button type="button" class="nac-share-btn" data-net="copy" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7h-4a5 5 0 0 0 0 10h4v-1.9h-4A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm5-6v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10h-4z"/></svg></button>
        </div>
        <span class="nac-share-toast" id="nac-share-toast" role="status" hidden></span>
        <style>
          .nac-share{max-width:900px;margin:0 auto;padding:34px 20px 6px;text-align:center}
          .nac-share-lbl{display:block;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;color:#8a8576;margin-bottom:14px}
          .nac-share-row{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
          .nac-share-btn{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;
            border:1px solid rgba(15,26,54,.15);background:#fff;color:#0F1A36;transition:all .18s ease;padding:0}
          .nac-share-btn:hover{background:#0F1A36;color:#fff;border-color:#0F1A36;transform:translateY(-2px)}
          .nac-share-btn:active{transform:translateY(0)}
          .nac-share-toast{display:inline-block;margin-top:12px;min-height:1.1em;font-size:.8rem;color:#E8743B;transition:opacity .2s}
          @media (prefers-color-scheme: dark){
            .nac-share-btn{background:rgba(255,255,255,.06);color:#ede8dc;border-color:rgba(255,255,255,.18)}
            .nac-share-btn:hover{background:#E8743B;color:#fff;border-color:#E8743B}
          }
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

function inject(file) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(SENTINEL)) return false;
  const idx = html.indexOf(ANCHOR);
  if (idx === -1) { console.warn(`  ⚠ ${path.basename(file)}: no <footer> anchor — skipped`); return false; }
  const next = html.slice(0, idx) + BLOCK + html.slice(idx);
  fs.writeFileSync(file, next);
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
