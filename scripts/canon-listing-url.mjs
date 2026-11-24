// Listing URLs on nomadassetcollective.com are served with a trailing slash;
// the slash-less form 301s. ~50 Notion rows store it without, so every link
// built from `Listing URL` went through a redirect. Normalise at the point of
// use (path only; leave query/fragment/file URLs and other hosts untouched).
// Shared by sync-notion-clp.mjs (CLP cards + JSON-LD) and update-index.mjs
// (GitHub Pages preview index "Live" buttons).
export function canonListingUrl(u) {
  if (!u) return u;
  const host = 'https://nomadassetcollective.com/';
  if (!u.startsWith(host)) return u;
  if (u.includes('?') || u.includes('#') || u.endsWith('/')) return u;
  const last = u.slice(u.lastIndexOf('/') + 1);
  if (last.includes('.')) return u;
  return u + '/';
}
