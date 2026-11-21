// Brochure link on each country page (CLP).
//
// Each CLP's closing section (.cl-asp) gets a secondary text link to that
// country's programme brochure, under the "Schedule Consultation" button.
// Before this, no CLP linked to its brochure (the brochures link to the CLPs
// since Brochures PR #434), so the programme page and the country page did
// not point at each other.
//
// Called from sync-notion-clp.mjs::applyModel on every sync, so the link
// survives each Notion refresh and is removed if a slug leaves the map.
// Idempotent: strips any previous link + style before writing.
//
// URLs: rayvtt/NAC-Program-Brochures BROCHURE-URLS.md (all 200, no redirect,
// checked 2026-11-21). No brochure for vn / sg. Add a row here when a new
// country gets both a CLP and a brochure.

export const BROCHURE_BY_SLUG = {
  gr: { vi: 'Hy Lạp',        en: 'Greece',         url: 'https://nomadassetcollective.com/brochures/residences-chuong-trinh-hy-lap-golden-visa/' },
  cy: { vi: 'Đảo Síp',       en: 'Cyprus',         url: 'https://nomadassetcollective.com/brochures/chuong-trinh-dao-sip-rbi-residence-by-investment/' },
  tr: { vi: 'Thổ Nhĩ Kỳ',    en: 'Türkiye',        url: 'https://nomadassetcollective.com/brochures/chuong-trinh-tho-nhi-ky-cbi-citizenship-by-investment/' },
  ae: { vi: 'UAE',           en: 'UAE',            url: 'https://nomadassetcollective.com/brochures/chuong-trinh-uae-golden-visa-2/' },
  uk: { vi: 'Vương Quốc Anh', en: 'United Kingdom', url: 'https://nomadassetcollective.com/brochures/chuong-trinh-uk-thuong-tru-visa-dau-tu-rbi/' },
  malta: { vi: 'Malta',      en: 'Malta',          url: 'https://nomadassetcollective.com/brochures/chuong-trinh-malta-thuong-tru-nhan-rbi/' },
  th: { vi: 'Thái Lan',      en: 'Thailand',       url: 'https://nomadassetcollective.com/brochures/chuong-trinh-thai-lan-cu-tru-dai-han-ltr-rbi/' },
  pa: { vi: 'Panama',        en: 'Panama',         url: 'https://nomadassetcollective.com/brochures/chuong-trinh-panama-rbi-quyen-cu-tru-vinh-vien/' },
  my: { vi: 'Malaysia',      en: 'Malaysia',       url: 'https://nomadassetcollective.com/brochures/chuong-trinh-malaysia-rbi-mm2h-dau-tu-quyen-cu-tru/' },
  au: { vi: 'Úc',            en: 'Australia',      url: 'https://nomadassetcollective.com/brochures/chuong-trinh-uc-rbi-residency-by-investment/' },
};

const CSS = '.cl-asp-broch-wrap{margin-top:1.6rem}.cl-asp-broch{display:inline-block;padding:.5rem 0;font-family:var(--ff-mono);font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .2s ease}.cl-asp-broch:hover{border-bottom-color:var(--gold)}';

export function applyBrochureLink($, slug) {
  $('.cl-asp-broch-wrap').remove();
  $('#cl-asp-broch-css').remove();
  const b = BROCHURE_BY_SLUG[slug];
  const cta = $('.cl-asp .cl-asp-cta').first();
  if (!b || !cta.length) return false;
  const vi = `Xem brochure chương trình ${b.vi}`;
  const en = `Read the ${b.en} programme brochure`;
  cta.after(`<div class="cl-asp-broch-wrap"><a href="${b.url}" class="cl-asp-broch"><span data-vi="${vi}">${vi}</span><span data-en="${en}">${en}</span> →</a></div>`);
  $("head").append(`<style id="cl-asp-broch-css">${CSS}</style>`);
  return true;
}
