# Google Search Visibility — One-time WP Admin Tasks

When you're next at a laptop, do these in order. ~15 min total.

## 1. Yoast: hide taxonomy archives from search (permanent fix)

WP Admin → **SEO** → **Search Appearance** → **Taxonomies** tab.

For each of these custom taxonomies, set **"Show ... in search results?"** to **No**:

| Taxonomy | Affects URLs |
|---|---|
| `citizenship-region` | `/citizenship-region/europe/`, `/citizenship-region/caribbean/`, … |
| `residence-region` | `/residence-region/residency-by-investment/`, … |
| `compare-cat` | `/compare-cat/europe/`, `/compare-cat/caribbean/`, … |
| `chuyen-muc` (categories) | `/chuyen-muc/case-study/`, `/chuyen-muc/infographic/`, … |
| `khu-vuc` (blog regions) | `blog.nomadassetcollective.com/khu-vuc/chau-au/`, … |
| `nhan-tam-trang` (blog labels) | `blog.nomadassetcollective.com/nhan-tam-trang/dang-hot/`, … |

Also tick **"Hide from sitemap"** on each (so they stop appearing in `wp-sitemap.xml`).

**Save Changes** at the bottom.

## 2. Yoast: noindex specific bad pages

If any `/blocks/*` pages or other Gutenberg patterns are showing up:
- Open each page in WP admin
- Scroll to **Yoast SEO box** → **Advanced** tab
- "Allow search engines to show this page in search results?" → **No**

## 3. Redirection plugin: 301 dead URLs to meaningful destinations

WP Admin → **Tools** → **Redirection** → **Add new**:

| Source URL | Target URL |
|---|---|
| `/citizenship-region/caribbean/` | `/brochures/chuong-trinh-antigua-barbuda-cbi-dau-tu-quoc-tich/` |
| `/citizenship-region/europe/` | `/brochures/chuong-trinh-bo-dao-nha-golden-visa/` |
| `/citizenship-region/middle-east/` | `/brochures/chuong-trinh-uae-golden-visa-2/` |
| `/citizenship-region/oceania/` | `/brochures/` |
| `/residence-region/residency-by-investment/` | `/brochures/` |
| `/residence-region/residency-for-financially-independent-people/` | `/brochures/` |
| `/compare-cat/europe/` | `/compares/bo-dao-nha/` |
| `/compare-cat/caribbean/` | `/compares/caribbean/` |
| Any `/blocks/*` URL | `/` (homepage) |

301 transfers SEO weight to the destination. Better than just blocking.

## 4. WP nav: strengthen pages you WANT in Google site links

The pages you want Google to show as site links (e.g. NAC Index, Tu Vấn Nhanh, brochures overview, comparison tool):

- WP Admin → **Appearance** → **Menus** → add each to the primary nav (header or footer)
- Link to them from the homepage hero / above-fold sections
- Google site links are influenced by internal linking depth + click-through rate

Suggested primary pages to boost:
1. `/brochures/` (Brochures overview)
2. `/nac-residence-index/` (NAC Index tool)
3. `/tu-van-nhanh/` (Quick consult)
4. `/compares/` (Comparison tool)
5. `/nguyen-cuu-dien-hinh/` (Case studies)

## 5. After saving everything

- Submit a fresh sitemap in GSC (it'll exclude the noindexed pages)
- Wait 1-2 weeks for Google to re-crawl
- Check `site:nomadassetcollective.com -inurl:citizenship-region -inurl:residence-region -inurl:compare-cat -inurl:chuyen-muc -inurl:blocks` to verify those URL patterns are gone

## Why all this matters

Google's site links picker chooses 4-6 sub-pages it thinks are most important on your domain. Right now it's picking junk taxonomy archives because:
- They have unique URLs and meta tags (Google sees them as legit pages)
- They're in the sitemap (you're telling Google "index me")
- They don't have noindex tags

After this checklist, Google will only have your real pages to choose from → site links will surface your brochures, tools, and key landing pages instead.
