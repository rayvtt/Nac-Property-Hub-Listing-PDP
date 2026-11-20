/*
 * NAC Weekly masthead line — "● Bản tin tuần Số 36" / "● NAC Weekly No. 36"
 * ------------------------------------------------------------------
 * Mirrors the NAC Times blog masthead corner (nac-marketing-omnichannel ·
 * scripts/cms-scheduler/blog-seo-snippet.php §12, .nac-wk-link) on every
 * Property Hub surface: the hub header, every listing page and every country
 * page. The markup + CSS are baked into each page (no layout shift, works
 * without JS with the last-known issue number); this script only:
 *
 *  · refreshes the issue number from the blog's own NAC Weekly category
 *    (WP REST, category 28 "ban-tin-tuan"; the newest title carrying
 *    "Số NN" wins — the quarterly special edition never takes the line,
 *    same rule as the blog). Cached 3 h in localStorage "nacWk".
 *  · points the link at the right edition: /ban-tin-tuan/ in VI,
 *    /en/weekly-report/ in EN, following the page's own VI/EN toggle.
 *  · on LLP/CLP the line sits inside the header's home link, so it is a
 *    role="link" span (a real <a> inside an <a> is invalid HTML); its click
 *    opens the blog in a new tab instead of following the home link.
 *
 * WP-safe: zero backslashes, no inline handlers.
 */
(function () {
  if (window.NACWeekly) return;
  window.NACWeekly = true;
  var VI = 'https://blog.nomadassetcollective.com/ban-tin-tuan/';
  var EN = 'https://blog.nomadassetcollective.com/en/weekly-report/';
  var API = 'https://blog.nomadassetcollective.com/wp-json/wp/v2/posts?categories=28&per_page=8&_fields=title';
  var KEY = 'nacWk';

  function lang() {
    var el = document.querySelector('body[data-lang]') || document.querySelector('.nac-pdp[data-lang]');
    var l = (el && el.getAttribute('data-lang')) || document.documentElement.lang || 'vi';
    return l.indexOf('en') === 0 ? 'en' : 'vi';
  }
  function url() { return lang() === 'en' ? EN : VI; }
  function setN(n) {
    var s = document.querySelectorAll('[data-nac-wk-n]');
    for (var i = 0; i < s.length; i++) s[i].textContent = n;
  }
  function store(v) { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch (e) { return null; } return null; }

  function refresh() {
    var c = null;
    try { c = JSON.parse(store() || 'null'); } catch (e) { c = null; }
    if (c && c.n) setN(c.n);
    if (c && c.n && Date.now() - c.at < 3 * 36e5) return;
    if (!window.fetch) return;
    fetch(API).then(function (r) { return r.json(); }).then(function (posts) {
      if (!posts || !posts.length) return;
      for (var i = 0; i < posts.length; i++) {
        var t = (posts[i].title && posts[i].title.rendered) || '';
        var m = /S[ốo](?:[ ]|&nbsp;|&#160;)*([0-9]+)/.exec(t);
        if (m) {
          var n = m[1].length < 2 ? '0' + m[1] : m[1];
          setN(n);
          store(JSON.stringify({ n: n, at: Date.now() }));
          return;
        }
      }
    }).catch(function () {});
  }

  function bind() {
    var links = document.querySelectorAll('.nac-wk-link');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute('data-nac-wk-bound')) continue;
      a.setAttribute('data-nac-wk-bound', '1');
      if (a.tagName === 'A') {
        // real link (hub): just keep its href on the current edition
        a.href = url();
        a.addEventListener('click', function () { this.href = url(); });
        a.addEventListener('mouseenter', function () { this.href = url(); });
        continue;
      }
      var go = function (e) {
        e.preventDefault();
        e.stopPropagation();
        window.open(url(), '_blank', 'noopener');
      };
      a.addEventListener('click', go);
      a.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
  }

  // keep real links (hub) on the current edition as the VI/EN toggle flips, so
  // middle-click / copy-link also land on the right language
  function retarget() {
    var links = document.querySelectorAll('a.nac-wk-link');
    for (var i = 0; i < links.length; i++) links[i].href = url();
  }
  function start() {
    bind(); refresh();
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(retarget);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
