#!/usr/bin/env node
/**
 * ensure-nac-methodology.mjs — inject the "How NAC scores" methodology
 * accordion into every properties/*.html PDP that doesn't already have one,
 * idempotently. Modelled on ensure-share-section.mjs.
 *
 * The PDP §06 Analysis donut shows per-pillar sub-scores but never explains
 * how they roll up into the /100 composite. This injects the framework
 * (weights · calibration · grade scale) as a <details> accordion BELOW the
 * existing .nac-donut-list, inside #nac-analysis. Static content — same on
 * every listing, fully bilingual via data-vi/data-en.
 *
 * The accompanying CSS rules already ship in properties/_template-listing-pdp.html
 * (the .nac-method* classes). For existing PDPs we inject both the CSS and the
 * markup; for the template the markup landed at template-update time so this
 * script is a no-op there (sentinel match).
 *
 * Runs in create-pdp.yml + sync-notion.yml and standalone:
 *   node scripts/ensure-nac-methodology.mjs           (all PDPs + template)
 *   node scripts/ensure-nac-methodology.mjs <slug>    (one file)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROP_DIR = path.resolve(__dirname, '..', 'properties');

// Sentinel — present iff the methodology accordion has already been injected.
const SENTINEL = 'id="nac-method"';

// Anchor strategy: regex against `<!-- 0X FEATURES -->` (PDPs use 06 or 07
// depending on when they were scaffolded) preceded by the §06 Analysis
// section's closing div pair. Matches both numberings.
const CLOSING_RE = /(\n\s*<\/div>\n\s*<\/div>\n\s*\n\s*<!-- 0[0-9] FEATURES -->)/;

// CSS anchor: just before the `/* FEATURES */` rule comment.
const CSS_ANCHOR = '/* FEATURES */';

const CSS_BLOCK = `/* ── NAC scoring methodology — accordion beneath the donut ─────────────── */
.nac-method {
  margin-top:2.6rem; max-width:640px; margin-left:auto; margin-right:auto;
  border-top:1px solid var(--line);
  /* §06 is data-side="full": mask the centre spine line so it can't cut
     through the accordion text */
  position:relative; z-index:2; background:var(--bg); padding-inline:1.2rem;
}
.nac-method[open] { padding-bottom:2.4rem; }
.nac-method-summary {
  list-style:none; cursor:pointer; padding:1.4rem .2rem 1.2rem;
  display:grid; grid-template-columns:1fr auto; row-gap:.2rem; column-gap:1rem;
  align-items:baseline; user-select:none;
}
.nac-method-summary::-webkit-details-marker { display:none; }
.nac-method-summary::marker { content:''; }
.nac-method-summary-text {
  grid-column:1; font-family:var(--ff-display); font-size:1.05rem; font-weight:500;
  color:var(--display); letter-spacing:-.005em;
}
.nac-method-summary-meta {
  grid-column:1; grid-row:2; font-family:var(--ff-mono); font-size:.6rem;
  letter-spacing:.16em; text-transform:uppercase; color:var(--muted);
}
.nac-method-summary-chev {
  grid-column:2; grid-row:1 / span 2; align-self:center;
  font-family:var(--ff-display); font-size:1.5rem; font-weight:300;
  color:var(--gold); transition:transform .25s ease;
}
.nac-method[open] .nac-method-summary-chev { transform:rotate(45deg); }
.nac-method-summary:hover .nac-method-summary-text { color:var(--gold); }

.nac-method-body { padding:.4rem .2rem 0; animation:nacMethIn .35s ease; }
@keyframes nacMethIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
.nac-method-intro {
  font-family:var(--ff-body); font-size:.92rem; line-height:1.6;
  color:var(--text); margin:0 0 1.6rem;
}
.nac-method-pillars { display:flex; flex-direction:column; gap:1.1rem; margin-bottom:1.7rem; }
.nac-method-pillar {
  display:grid; grid-template-columns:1fr auto; gap:.18rem 1rem;
  align-items:baseline; padding-bottom:1.05rem; border-bottom:1px solid var(--line);
}
.nac-method-pillar:last-child { border-bottom:none; padding-bottom:0; }
.nac-method-pillar-name {
  font-family:var(--ff-display); font-size:1.05rem; font-weight:500; color:var(--display);
}
.nac-method-pillar-wt {
  font-family:var(--ff-mono); font-size:.78rem; font-weight:500; color:var(--gold); white-space:nowrap;
}
.nac-method-pillar-desc {
  grid-column:1 / -1; font-family:var(--ff-body); font-size:.84rem; line-height:1.55;
  color:var(--muted); margin-top:.1rem;
}
.nac-method-pillar-track {
  grid-column:1 / -1; height:4px; border-radius:999px; background:var(--surface-2);
  overflow:hidden; margin-top:.55rem;
}
.nac-method-pillar-fill {
  height:100%; border-radius:999px;
  background:linear-gradient(90deg, var(--orange), var(--gold));
}
.nac-method-calib {
  font-family:var(--ff-body); font-size:.85rem; line-height:1.6;
  color:var(--muted); font-style:italic;
  padding:1.05rem 1.2rem; background:var(--surface-2);
  border-radius:12px; border-left:2px solid var(--gold);
  margin:0 0 2.6rem;
}
.nac-method-grades { display:flex; flex-direction:column; gap:.55rem; }
.nac-method-grade-head {
  font-family:var(--ff-mono); font-size:.6rem; letter-spacing:.18em;
  text-transform:uppercase; color:var(--muted); margin-bottom:.3rem;
}
.nac-method-grade {
  display:grid; grid-template-columns:64px auto 1fr; align-items:center;
  gap:.8rem; font-size:.85rem;
}
.nac-method-grade-band {
  font-family:var(--ff-mono); font-size:.74rem; color:var(--display); font-weight:500;
}
.nac-method-grade-stars { color:var(--gold); font-size:.78rem; letter-spacing:.05em; }
.nac-method-grade-lbl { font-family:var(--ff-body); color:var(--muted); }
@media(max-width:680px) {
  .nac-method { margin-top:2.1rem; padding-inline:.2rem; }
  .nac-method-summary-text { font-size:.98rem; }
  .nac-method-pillar-name { font-size:1rem; }
}

`;

const MARKUP_BLOCK = `
        <!-- Methodology accordion — "show your work" disclosure beneath the donut.
             Static framework content (same for every listing). -->
        <details class="nac-method" id="nac-method">
          <summary class="nac-method-summary" aria-label="Show NAC scoring methodology">
            <span class="nac-method-summary-text">
              <span data-vi="">Phương pháp chấm điểm NAC</span><span data-en="">How NAC scores</span>
            </span>
            <span class="nac-method-summary-chev" aria-hidden="true">＋</span>
          </summary>
          <div class="nac-method-body">
            <div class="nac-method-pillars">
              <div class="nac-method-pillar">
                <span class="nac-method-pillar-name"><span data-vi="">Thương Hiệu & CĐT</span><span data-en="">Brand &amp; Developer</span></span>
                <span class="nac-method-pillar-wt">20%</span>
                <span class="nac-method-pillar-desc"><span data-vi="">Uy tín nhà điều hành, đối tác thiết kế, lịch sử bàn giao.</span><span data-en="">Operator pedigree, design partner, delivery record.</span></span>
                <div class="nac-method-pillar-track"><div class="nac-method-pillar-fill" style="width:100%"></div></div>
              </div>
              <div class="nac-method-pillar">
                <span class="nac-method-pillar-name"><span data-vi="">Lợi Suất & Dòng Tiền</span><span data-en="">Yield &amp; Cash Flow</span></span>
                <span class="nac-method-pillar-wt">20%</span>
                <span class="nac-method-pillar-desc"><span data-vi="">Lợi suất cho thuê gộp/ròng, cash-on-cash, độ bền thu nhập.</span><span data-en="">Gross &amp; net rental yield, cash-on-cash, income durability.</span></span>
                <div class="nac-method-pillar-track"><div class="nac-method-pillar-fill" style="width:100%"></div></div>
              </div>
              <div class="nac-method-pillar">
                <span class="nac-method-pillar-name"><span data-vi="">Vị Trí & Thị Trường</span><span data-en="">Location &amp; Market</span></span>
                <span class="nac-method-pillar-wt">20%</span>
                <span class="nac-method-pillar-desc"><span data-vi="">Vi vị trí, nền tảng thành phố, cung–cầu, quỹ đạo tăng trưởng.</span><span data-en="">Micro-location, city fundamentals, supply–demand, growth trajectory.</span></span>
                <div class="nac-method-pillar-track"><div class="nac-method-pillar-fill" style="width:100%"></div></div>
              </div>
              <div class="nac-method-pillar">
                <span class="nac-method-pillar-name"><span data-vi="">Quản Lý & Vận Hành</span><span data-en="">Management &amp; Ops</span></span>
                <span class="nac-method-pillar-wt">15%</span>
                <span class="nac-method-pillar-desc"><span data-vi="">Chất lượng chương trình cho thuê, mức độ rảnh tay, chuẩn dịch vụ.</span><span data-en="">Rental-programme quality, hands-off operation, service standard.</span></span>
                <div class="nac-method-pillar-track"><div class="nac-method-pillar-fill" style="width:75%"></div></div>
              </div>
              <div class="nac-method-pillar">
                <span class="nac-method-pillar-name"><span data-vi="">Thanh Khoản & Thoát Vốn</span><span data-en="">Liquidity &amp; Exit</span></span>
                <span class="nac-method-pillar-wt">15%</span>
                <span class="nac-method-pillar-desc"><span data-vi="">Độ sâu thị trường thứ cấp, quyền mua nước ngoài, lựa chọn thoát vốn.</span><span data-en="">Resale depth, foreign-buyer access, exit optionality.</span></span>
                <div class="nac-method-pillar-track"><div class="nac-method-pillar-fill" style="width:75%"></div></div>
              </div>
              <div class="nac-method-pillar">
                <span class="nac-method-pillar-name"><span data-vi="">Hồ Sơ Rủi Ro</span><span data-en="">Risk Profile</span></span>
                <span class="nac-method-pillar-wt">10%</span>
                <span class="nac-method-pillar-desc"><span data-vi="">Rủi ro thi công, tỷ giá, pháp lý, chu kỳ thị trường (điểm nghịch — cao hơn = rủi ro thấp hơn).</span><span data-en="">Construction, currency, legal, market cyclicality (scored inversely — higher = lower risk).</span></span>
                <div class="nac-method-pillar-track"><div class="nac-method-pillar-fill" style="width:50%"></div></div>
              </div>
            </div>
            <p class="nac-method-calib">
              <span data-vi="">Sáu trụ cột được tính theo trọng số, sau đó hiệu chỉnh bởi Hội đồng Đầu tư NAC dựa trên các giao dịch so sánh trước khi công bố điểm tổng hợp trên thang /100.</span>
              <span data-en="">The six pillars are weighted, then calibrated by the NAC Investment Committee against comparable transactions before the /100 composite is published.</span>
            </p>
            <div class="nac-method-grades">
              <div class="nac-method-grade-head"><span data-vi="">Thang xếp hạng</span><span data-en="">Grade scale</span></div>
              <div class="nac-method-grade"><span class="nac-method-grade-band">85–100</span><span class="nac-method-grade-stars">★★★★★</span><span class="nac-method-grade-lbl"><span data-vi="">Xuất Sắc</span><span data-en="">Outstanding</span></span></div>
              <div class="nac-method-grade"><span class="nac-method-grade-band">75–84</span><span class="nac-method-grade-stars">★★★★</span><span class="nac-method-grade-lbl"><span data-vi="">Rất Tốt</span><span data-en="">Excellent</span></span></div>
              <div class="nac-method-grade"><span class="nac-method-grade-band">65–74</span><span class="nac-method-grade-stars">★★★</span><span class="nac-method-grade-lbl"><span data-vi="">Tốt</span><span data-en="">Strong</span></span></div>
              <div class="nac-method-grade"><span class="nac-method-grade-band">55–64</span><span class="nac-method-grade-stars">★★</span><span class="nac-method-grade-lbl"><span data-vi="">Khá</span><span data-en="">Fair</span></span></div>
            </div>
          </div>
        </details>
      </div>

    `;

function inject(file) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(SENTINEL)) return false;
  const m = html.match(CLOSING_RE);
  if (!m) {
    console.warn(`  ⚠ ${path.basename(file)}: closing pattern before §07/§06 FEATURES not found — skipped`);
    return false;
  }
  if (!html.includes(CSS_ANCHOR)) {
    console.warn(`  ⚠ ${path.basename(file)}: CSS anchor "/* FEATURES */" not found — skipped`);
    return false;
  }
  // m[0] looks like: "\n      </div>\n    </div>\n\n    <!-- 0X FEATURES -->"
  // We splice MARKUP_BLOCK in BEFORE the .nac-spine-content's closing </div>,
  // i.e. right after the .nac-donut-list ends. MARKUP_BLOCK supplies the
  // spine-content's </div>; we drop the original first </div> from m[0].
  const featuresComment = m[0].match(/<!-- 0[0-9] FEATURES -->/)[0];
  const replacement = MARKUP_BLOCK + '</div>\n\n    ' + featuresComment;
  const next = html
    .replace(CLOSING_RE, replacement)
    .replace(CSS_ANCHOR, CSS_BLOCK + CSS_ANCHOR);
  fs.writeFileSync(file, next);
  return true;
}

function main() {
  const only = process.argv[2];
  const files = only
    ? [path.join(PROP_DIR, only.endsWith('.html') ? only : only + '.html')]
    : fs.readdirSync(PROP_DIR).filter(f => f.endsWith('.html')).map(f => path.join(PROP_DIR, f));
  let n = 0, skipped = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.warn(`  ⚠ ${path.basename(f)}: missing`); continue; }
    if (inject(f)) n++; else skipped++;
  }
  console.log(`ensure-nac-methodology: injected into ${n} file(s); ${skipped} already had it / skipped`);
}

main();
