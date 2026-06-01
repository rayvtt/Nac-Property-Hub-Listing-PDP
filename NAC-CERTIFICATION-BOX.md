# NAC Certification Box — Design Template

Reusable closing sign-off block that lives just above the footer on every NAC PDP. Communicates IMC compliance, displays the NAC × IMC seal, lists the certification tags (cert, partner, property ID, status), and signs off with the reviewer card (Ray Vũ).

---

## Structure

```
.nac-cert (grid: auto 1fr, align-items:center, gap:2.5rem)
├── .nac-cert-seal           (NAC + × + IMC, stacked vertically on desktop)
│   ├── img.nac-cert-logo                  (NAC, 64×64)
│   ├── span.nac-cert-x                    (×)
│   └── img.nac-cert-logo.nac-cert-logo--imc (IMC, 94×94 — bigger to visually match)
└── .nac-cert-body
    ├── .nac-cert-lbl       (orange uppercase eyebrow: "Thẩm Định NAC" / "NAC Due Diligence")
    ├── h3.nac-cert-title   (display headline)
    ├── p.nac-cert-txt      (IMC internal-diligence prose, bilingual)
    ├── .nac-cert-meta      (pill row: Standard · Network · Property ID · Status)
    └── .nac-cert-reviewer  (top-border divider, then headshot + 3-line info)
        ├── img.nac-cert-reviewer-img      (52×68 portrait)
        └── .nac-cert-reviewer-info
            ├── .nac-cert-reviewer-name    (Ray Vũ — display 1rem)
            ├── .nac-cert-reviewer-role    ("Giám Đốc" / "CEO / Founder" — display .85rem muted)
            └── .nac-cert-reviewer-org     ("Nomad Asset Collective" — display .85rem muted)
```

On mobile (`≤680px`) the grid collapses to one column and the seal flips back to a horizontal row so the box stays compact.

---

## HTML

```html
<div class="nac-cert">
  <div class="nac-cert-seal" aria-hidden="true">
    <img src="https://nomadassetcollective.com/wp-content/uploads/2026/04/cropped-OTG-Passport-Icons.png" alt="NAC" class="nac-cert-logo">
    <span class="nac-cert-x">×</span>
    <img src="https://nomadassetcollective.com/wp-content/uploads/2026/05/OTG-Passport-Icons.png" alt="IMC" class="nac-cert-logo nac-cert-logo--imc">
  </div>
  <div class="nac-cert-body">
    <div class="nac-cert-lbl"><span data-vi="">Thẩm Định NAC</span><span data-en="">NAC Due Diligence</span></div>
    <h3 class="nac-cert-title"><span data-vi="">Được Thẩm Định Theo Chuẩn Nội Bộ NAC</span><span data-en="">Reviewed to NAC's Internal Diligence Standard</span></h3>
    <p class="nac-cert-txt">
      <span data-vi="">Hồ sơ này được lập theo chuẩn IMC (Investment Memorandum &amp; Compliance) nội bộ của NAC. Số liệu được đối chiếu từ chủ đầu tư, đối tác phân phối và nguồn thị trường độc lập. Cập nhật Q2/2026.</span>
      <span data-en="">This dossier is prepared to NAC's internal IMC (Investment Memorandum &amp; Compliance) standard. Figures triangulated from the developer, distribution partners and independent market sources. Updated Q2/2026.</span>
    </p>
    <div class="nac-cert-meta">
      <div class="nac-cert-tag"><span class="nac-cert-tag-key">Standard</span><span class="nac-cert-tag-val">IMC</span></div>
      <div class="nac-cert-tag"><span class="nac-cert-tag-key">Network</span><span class="nac-cert-tag-val">iQi Global</span></div>
      <div class="nac-cert-tag"><span class="nac-cert-tag-key">Property ID</span><span class="nac-cert-tag-val" data-notion="property_id">NAC-XX</span></div>
      <div class="nac-cert-tag"><span class="nac-cert-tag-key">Status</span><span class="nac-cert-tag-val">Listed</span></div>
    </div>
    <div class="nac-cert-reviewer">
      <img src="https://nomadassetcollective.com/wp-content/uploads/2026/03/ray-transparent.png" alt="Ray" class="nac-cert-reviewer-img">
      <div class="nac-cert-reviewer-info">
        <div class="nac-cert-reviewer-name">Ray Vũ</div>
        <div class="nac-cert-reviewer-role"><span data-vi="">Giám Đốc</span><span data-en="">CEO / Founder</span></div>
        <div class="nac-cert-reviewer-org">Nomad Asset Collective</div>
      </div>
    </div>
  </div>
</div>
```

---

## CSS

```css
/* Box shell */
.nac-cert { display:grid; grid-template-columns:auto 1fr; gap:2.5rem; align-items:center; padding:2.5rem; border-radius:20px; background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); margin-bottom:4rem; }
@media(max-width:680px) { .nac-cert { grid-template-columns:1fr; gap:1.75rem; padding:2rem 1.4rem; } }

/* Seal column — stacked vertically on desktop, horizontal row on mobile */
.nac-cert-seal { display:flex; flex-direction:column; align-items:center; gap:.6rem; flex-shrink:0; }
.nac-cert-logo { width:64px; height:64px; object-fit:contain; }
.nac-cert-logo--imc { width:94px; height:94px; }                 /* +30 vs NAC to compensate for IMC internal whitespace */
.nac-cert-x { font-family:var(--ff-display); font-size:1.6rem; color:var(--muted); opacity:.5; font-weight:300; }
@media(max-width:680px) {
  .nac-cert-seal { flex-direction:row; gap:.85rem; }
  .nac-cert-logo { width:54px; height:54px; }
  .nac-cert-logo--imc { width:84px; height:84px; }
}

/* Body */
.nac-cert-lbl { font-family:var(--ff-mono); font-size:.62rem; letter-spacing:.2em; text-transform:uppercase; color:var(--orange); font-weight:500; margin-bottom:.85rem; }
.nac-cert-title { font-family:var(--ff-display); font-size:1.55rem; font-weight:500; color:var(--display); letter-spacing:-.005em; line-height:1.2; margin-bottom:.9rem; }
.nac-cert-txt { font-size:.92rem; line-height:1.75; color:var(--text); margin-bottom:1.5rem; }

/* Meta tag row */
.nac-cert-meta { display:flex; column-gap:.65rem; row-gap:calc(.65rem + 5px); flex-wrap:wrap; }
.nac-cert-tag { display:flex; align-items:center; gap:.45rem; padding:.4rem .85rem; border-radius:999px; background:var(--surface-2); border:1px solid var(--line); }
.nac-cert-tag-key { font-family:var(--ff-mono); font-size:.62rem; letter-spacing:.1em; color:var(--muted); text-transform:uppercase; }
.nac-cert-tag-val { font-family:var(--ff-display); font-size:.85rem; font-weight:500; color:var(--gold); }

/* Reviewer card (sign-off line) */
.nac-cert-reviewer { display:flex; align-items:center; gap:.85rem; margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid var(--line); }
.nac-cert-reviewer-img { width:52px; height:68px; border-radius:10px; object-fit:cover; object-position:top center; flex-shrink:0; border:1px solid var(--line); }
.nac-cert-reviewer-name { font-family:var(--ff-display); font-size:1rem; font-weight:500; color:var(--display); }
.nac-cert-reviewer-role { font-family:var(--ff-display); font-size:.85rem; color:var(--muted); margin-top:.2rem; }
.nac-cert-reviewer-org  { font-family:var(--ff-display); font-size:.85rem; color:var(--muted); margin-top:.2rem; }

/* Mobile tweaks */
@media(max-width:680px) {
  .nac-cert { margin-bottom:2.5rem; }
  .nac-cert-title { font-size:1.25rem; }
  .nac-cert-txt { font-size:.88rem; line-height:1.7; }
  .nac-cert-tag { padding:.32rem .7rem; }
  .nac-cert-tag-val { font-size:.78rem; }
}
```

---

## Per-listing edits

Only the `Property ID` tag value changes per listing:

```html
<span class="nac-cert-tag-val" data-notion="property_id">NAC-XX</span>
```

It's also patched automatically by `scripts/sync-notion.mjs` from the Notion row's Property ID. Everything else (logos, title, prose, reviewer name/role/org) is shared across all PDPs and should not be customised per listing.

---

## Design notes

- **Seal stacks vertically on desktop, horizontal on mobile.** Keeps the cert box compact and lets the seal column vertically centre against the body content (`.nac-cert { align-items:center }`).
- **IMC logo is intentionally larger** (94 vs 64) because its source PNG has more internal whitespace; visually the two read as the same size.
- **The reviewer card uses 3 distinct lines** (name / role / org). Role and org share the same display-font typography — only the name uses weight 500.
- **The `×` divider** is symmetric so it works both vertically (desktop) and horizontally (mobile) without rotation.
