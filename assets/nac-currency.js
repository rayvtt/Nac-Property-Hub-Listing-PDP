/*
 * NAC currency switch — "Giá gốc · $ USD · ₫ VNĐ"
 * ------------------------------------------------------------------
 * One shared widget for every Property Hub surface: the hub (HP), every
 * listing page (LLP, properties/*.html) and every country page (CLP,
 * country/*.html). Ported from the NAC Times blog widget
 * (nac-marketing-omnichannel · scripts/cms-scheduler/blog-interactive.js)
 * and extended with a USD view.
 *
 *  · finds every money amount on the page ($360K · A$1.2M · €290,000 ·
 *    AED 8,89 triệu · 360.000 USD · $118<small>K</small> …) and wraps it in
 *    <span class="nac-money" data-o="original" data-c="ISO" data-v="value">
 *  · a floating pill (bottom-left, shows after the first screen) switches
 *    every amount between the original price, ≈ USD and ≈ VND
 *  · live FX from open.er-api.com (cached 12 h in localStorage "nacFx",
 *    built-in fallback rates); the choice persists in localStorage "nacCur"
 *  · a MutationObserver re-marks anything the page renders later (the hub
 *    re-renders cards on every filter, CLP heroes rotate), and the labels +
 *    formatting follow the page's own VI/EN toggle
 *
 * WP-safety: this file is loaded with <script src> from GitHub Pages, but it
 * is still written with ZERO backslashes (regexes are built from plain
 * strings) so it can be inlined into a WordPress page without wp_unslash
 * damage. No inline handlers, no innerHTML from page data.
 *
 * Opt-outs: put data-nac-cur-skip on any element to leave its amounts alone;
 * add data-nac-cur-avoid to a fixed bar the pill should sit above.
 */
(function () {
  if (window.NACCur) return;

  var NBSP = String.fromCharCode(160), NNBSP = String.fromCharCode(8239), THIN = String.fromCharCode(8201);
  var LS_FX = 'nacFx', LS_MODE = 'nacCur';

  // ── FX (USD base) ────────────────────────────────────────────────────────
  var FALLBACK = { t: '2026-10-10', r: { USD: 1, VND: 25863, EUR: 0.8924, AED: 3.6725, GBP: 0.7558, AUD: 1.433, MYR: 4.0875, THB: 33.57, SGD: 1.2807, TRY: 49.34, CAD: 1.38, NZD: 1.66, HKD: 7.78 } };
  var FX = FALLBACK, fxReady = null;
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  function loadFx() {
    if (fxReady) return fxReady;
    var c = null;
    try { c = JSON.parse(store(LS_FX) || 'null'); } catch (e) { c = null; }
    if (c && c.r && c.r.VND && Date.now() - c.at < 12 * 36e5) { FX = c; fxReady = Promise.resolve(FX); return fxReady; }
    if (!window.fetch) { fxReady = Promise.resolve(FX); return fxReady; }
    fxReady = fetch('https://open.er-api.com/v6/latest/USD').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.rates && d.rates.VND) {
        FX = { t: new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10), at: Date.now(), r: d.rates };
        store(LS_FX, JSON.stringify(FX));
      }
      return FX;
    }).catch(function () { return FX; });
    return fxReady;
  }
  function toUsd(v, cur) { if (cur === 'USD') return v; var r = FX.r[cur] || FALLBACK.r[cur]; return r ? v / r : null; }

  // ── Recognisers (built from plain strings — no backslashes) ─────────────
  var SP = '[ ' + NBSP + NNBSP + THIN + ']';
  var LET = 'A-Za-zÀ-ỹ';
  var NUM = '([0-9]+(?:[.,][0-9]+)*)';
  var DASH = '[–—-]';
  var PRE = { 'US$': 'USD', 'A$': 'AUD', 'S$': 'SGD', 'C$': 'CAD', 'NZ$': 'NZD', 'HK$': 'HKD', '$': 'USD', '€': 'EUR', '£': 'GBP', '฿': 'THB', 'RM': 'MYR',
    USD: 'USD', EUR: 'EUR', GBP: 'GBP', AUD: 'AUD', SGD: 'SGD', THB: 'THB', MYR: 'MYR', AED: 'AED', CAD: 'CAD' };
  var POST = { USD: 'USD', EUR: 'EUR', AED: 'AED', GBP: 'GBP', AUD: 'AUD', SGD: 'SGD', THB: 'THB', MYR: 'MYR', VND: 'VND', 'VNĐ': 'VND', 'đồng': 'VND',
    '€': 'EUR', euro: 'EUR', 'bảng Anh': 'GBP', 'đô la Mỹ': 'USD', 'đô la Úc': 'AUD', 'đô la Singapore': 'SGD', ringgit: 'MYR', baht: 'THB', dirham: 'AED', lira: 'TRY' };
  var SCALE = { k: 1e3, K: 1e3, 'nghìn': 1e3, 'ngàn': 1e3, thousand: 1e3, m: 1e6, M: 1e6, mn: 1e6, 'triệu': 1e6, million: 1e6, Million: 1e6,
    bn: 1e9, B: 1e9, 'tỷ': 1e9, 'tỉ': 1e9, billion: 1e9, Billion: 1e9 };
  function alt(map) {
    return Object.keys(map).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return k.split('$').join('[$]'); }).join('|');
  }
  var SYM = '(' + alt(PRE) + ')', CODE = '(' + alt(POST) + ')', SC = '(' + alt(SCALE) + ')';
  var NOT_AFTER_SCALE = '(?![' + LET + '²0-9])';
  // pre-form:  $360K · A$1.2M · AED 8,89 triệu · €250,000–300,000
  var PRE_F = SYM + SP + '?' + NUM + '(?:' + SP + '?' + DASH + SP + '?' + NUM + ')?(?:' + SP + '?' + SC + NOT_AFTER_SCALE + ')?';
  // post-form: 360.000 USD · 8,89 triệu AED · 2 million USD
  var POST_F = NUM + '(?:' + SP + '?' + DASH + SP + '?' + NUM + ')?(?:' + SP + '?' + SC + ')?' + SP + '?' + CODE + '(?![' + LET + ']|[$])';
  var B = '(^|[^' + LET + '0-9$])';
  var RE_SCAN = new RegExp(B + '(?:' + PRE_F + ')|' + B + '(?:' + POST_F + ')', 'g');
  var RE_FULL = new RegExp('^' + SP + '*(?:(?:' + PRE_F + ')|(?:' + POST_F + '))' + SP + '*$');
  var SCALE_TAG = new RegExp('^' + SP + '*' + SC + SP + '*$');

  // Separator-aware parse: "1,234.5" · "1.234,5" · "250.000" · "8,89" · "1.2"
  function parseNum(s, scaled, lang) {
    var d = s.lastIndexOf('.'), c = s.lastIndexOf(',');
    if (d >= 0 && c >= 0) return d > c ? +s.split(',').join('') : +s.split('.').join('').replace(',', '.');
    var sep = d >= 0 ? '.' : (c >= 0 ? ',' : '');
    if (!sep) return +s;
    var p = s.split(sep), grouped = p[0].length <= 3 && p.slice(1).every(function (x) { return x.length === 3; });
    if (grouped && p.length === 2 && scaled && lang) {
      // "1.250 triệu" (VI thousands) vs "1.250M" (EN decimal) — follow the text's language
      grouped = (lang === 'vi') === (sep === '.');
    }
    if (grouped) return +p.join('');
    return p.length === 2 ? +(p[0] + '.' + p[1]) : NaN;
  }

  // ── Language ────────────────────────────────────────────────────────────
  function pageLang() {
    var el = document.querySelector('body[data-lang]') || document.querySelector('.nac-pdp[data-lang]');
    var l = (el && el.getAttribute('data-lang')) || document.documentElement.lang || 'vi';
    return l.indexOf('en') === 0 ? 'en' : 'vi';
  }
  function nodeLang(node) {
    for (var el = node.nodeType === 1 ? node : node.parentElement; el && el !== document.body; el = el.parentElement) {
      var v = el.hasAttribute('data-vi'), e = el.hasAttribute('data-en');
      if (v !== e) return v ? 'vi' : 'en';
      if (el.hasAttribute('lang')) return el.getAttribute('lang').indexOf('en') === 0 ? 'en' : 'vi';
    }
    return '';
  }

  // ── Formatting ──────────────────────────────────────────────────────────
  function f(x, d, en) { return x.toLocaleString(en ? 'en-US' : 'vi-VN', { maximumFractionDigits: d }); }
  function vndParts(v, en) {
    if (v >= 1e9) return [f(v / 1e9, v >= 1e11 ? 0 : (v >= 1e10 || en) ? 1 : 2, en), en ? 'bn' : 'tỷ'];
    if (v >= 1e6) return [f(v / 1e6, 0, en), en ? 'm' : 'triệu'];
    return [f(v / 1e3, 0, en), en ? 'k' : 'nghìn'];
  }
  function vnd(a, b, en) {
    var x = vndParts(a, en), y = b != null ? vndParts(b, en) : null;
    var num = y ? (y[1] === x[1] ? x[0] + '–' + y[0] : x[0] + ' ' + x[1] + '–' + y[0]) : x[0];
    var unit = y ? y[1] : x[1];
    return en ? 'VND ' + num + unit : num + ' ' + unit + ' đồng';
  }
  function usd1(n, full) {
    var step = n >= 1e5 ? 1000 : n >= 1e4 ? 100 : n >= 1e3 ? 10 : 1;
    if (full && n < 1e6) return '$' + (Math.round(n / step) * step).toLocaleString('en-US');
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.0', '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
    if (n >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function usd(a, b, full) { return b != null ? usd1(a, full) + '–' + usd1(b, full) : usd1(a, full); }

  // ── Marking ─────────────────────────────────────────────────────────────
  var SKIP = 'script,style,noscript,textarea,input,select,option,svg,code,pre,title,[contenteditable],.nac-cur,[data-nac-cur-skip]';
  function skipped(el) { return !el || !!el.closest(SKIP + ',.nac-money'); }
  function readMatch(m, lang) {
    // returns {c, v, v2, scaled} from a RE_SCAN / RE_FULL match (offset 0 = RE_SCAN with boundary groups)
    var g = m.pre || m.post, word = m.pre ? m[g.s] : m[g.c];
    var cur = m.pre ? PRE[word] : POST[word], n1 = m[g.n1], n2 = m[g.n2], sc = m[g.sc];
    // "2 đồng hồ" is two clocks, not two dong — a bare "đồng" only counts with a scale (tỷ/triệu)
    if (!cur || (word === 'đồng' && !sc)) return null;
    var mul = sc ? SCALE[sc] : 1, a = parseNum(n1, !!sc, lang) * mul, b = n2 ? parseNum(n2, !!sc, lang) * mul : null;
    if (!(a > 0) || (n2 && !(b > 0))) return null;
    return { c: cur, v: a, v2: b, full: !sc };
  }
  // group indexes inside RE_SCAN / RE_FULL
  var G_SCAN = { pre: { b: 1, s: 2, n1: 3, n2: 4, sc: 5 }, post: { b: 6, n1: 7, n2: 8, sc: 9, c: 10 } };
  var G_FULL = { pre: { s: 1, n1: 2, n2: 3, sc: 4 }, post: { n1: 5, n2: 6, sc: 7, c: 8 } };
  function tag(m, G) {
    if (m[G.pre.s] !== undefined) { m.pre = G.pre; m.post = null; } else { m.pre = null; m.post = G.post; }
    return m;
  }
  function setMoney(el, info, lang, original, html) {
    el.classList.add('nac-money');
    el.setAttribute('data-o', original);
    if (html != null) el.setAttribute('data-oh', html);
    el.setAttribute('data-c', info.c);
    el.setAttribute('data-v', String(info.v));
    if (info.v2 != null) el.setAttribute('data-v2', String(info.v2));
    if (info.full) el.setAttribute('data-full', '');
    if (lang) el.setAttribute('data-l', lang);
  }
  function markSplit(root) {
    // $118<small>K</small> — the scale sits in its own element, so judge the parent's whole text
    var n = 0, tags = root.querySelectorAll('small,sup,sub,span,em,b,i,strong');
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i], p = t.parentElement;
      if (t.childElementCount || t.textContent.length > 12 || !p || !SCALE_TAG.test(t.textContent)) continue;
      if (p.classList.contains('nac-money') || p.children.length > 3 || skipped(p)) continue;
      var txt = p.textContent.trim(), m = RE_FULL.exec(txt);
      if (!m) continue;
      var lang = nodeLang(p), info = readMatch(tag(m, G_FULL), lang);
      if (!info) continue;
      setMoney(p, info, lang, txt, p.innerHTML);
      n++;
    }
    return n;
  }
  function markText(root) {
    var n = 0, nodes = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) {
        if (!t.nodeValue || t.nodeValue.length < 2 || !/[0-9]/.test(t.nodeValue)) return NodeFilter.FILTER_REJECT;
        return skipped(t.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (t) {
      var s = t.nodeValue, last = 0, frag = null, m, lang = null;
      RE_SCAN.lastIndex = 0;
      while ((m = RE_SCAN.exec(s))) {
        tag(m, G_SCAN);
        var bnd = m.pre ? m[G_SCAN.pre.b] : m[G_SCAN.post.b], start = m.index + (bnd || '').length, end = m.index + m[0].length;
        if (lang === null) lang = nodeLang(t);
        var info = readMatch(m, lang);
        if (!info) continue;
        frag = frag || document.createDocumentFragment();
        if (start > last) frag.appendChild(document.createTextNode(s.slice(last, start)));
        var sp = document.createElement('span'), orig = s.slice(start, end);
        sp.textContent = orig;
        setMoney(sp, info, lang, orig, null);
        frag.appendChild(sp);
        last = end; n++;
      }
      if (!frag) return;
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      t.parentNode.replaceChild(frag, t);
    });
    return n;
  }
  function unmark(el) {
    // page code rewrote a marked amount — drop our wrapper and let it be re-read
    if (el.hasAttribute('data-oh')) {
      ['data-o', 'data-oh', 'data-c', 'data-v', 'data-v2', 'data-full', 'data-l', 'data-m', 'title'].forEach(function (a) { el.removeAttribute(a); });
      el.classList.remove('nac-money');
      return el;
    }
    var p = el.parentNode;
    if (!p) return null;
    p.replaceChild(document.createTextNode(el.textContent), el);
    return p;
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  var saved = store(LS_MODE);
  var mode = saved === 'vnd' || saved === 'usd' ? saved : 'orig';
  var T = {
    vi: { orig: 'Giá gốc', usd: 'USD', vnd: 'VNĐ', rate: 'Tỷ giá tham khảo', aria: 'Đơn vị tiền tệ' },
    en: { orig: 'Original', usd: 'USD', vnd: 'VND', rate: 'Indicative rate', aria: 'Currency' }
  };
  function applyOne(sp, pl) {
    var c = sp.getAttribute('data-c');
    if (mode === 'orig' || (mode === 'usd' && c === 'USD') || (mode === 'vnd' && c === 'VND')) {
      if (sp.getAttribute('data-m')) {
        if (sp.hasAttribute('data-oh')) sp.innerHTML = sp.getAttribute('data-oh'); else sp.textContent = sp.getAttribute('data-o');
        sp.removeAttribute('data-m'); sp.removeAttribute('title');
      }
      return;
    }
    var en = (sp.getAttribute('data-l') || pl) === 'en';
    var a = toUsd(+sp.getAttribute('data-v'), c), b = sp.hasAttribute('data-v2') ? toUsd(+sp.getAttribute('data-v2'), c) : null;
    if (a == null) return;
    var txt = mode === 'usd' ? usd(a, b, sp.hasAttribute('data-full')) : vnd(a * FX.r.VND, b != null ? b * FX.r.VND : null, en);
    sp.textContent = '≈ ' + txt;
    sp.title = sp.getAttribute('data-o');
    sp.setAttribute('data-m', mode + ':' + (en ? 'en' : 'vi'));
  }
  var bar = null, count = 0, lastLang = null;
  function applyAll(list) {
    var pl = pageLang();
    busy = true;
    Array.prototype.forEach.call(list || document.querySelectorAll('.nac-money'), function (sp) { applyOne(sp, pl); });
    if (bar) syncBar(pl);
    flush();
  }
  function syncBar(pl) {
    var L = T[pl];
    bar.setAttribute('aria-label', L.aria);
    var btns = bar.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var m = btns[i].getAttribute('data-m');
      btns[i].lastChild.nodeValue = L[m];
      btns[i].setAttribute('aria-pressed', m === mode ? 'true' : 'false');
    }
    var note = bar.querySelector('small');
    note.textContent = mode === 'orig' ? '' : L.rate + ' ' + FX.t.split('-').reverse().join('/') + ' · 1 USD = ' +
      Math.round(FX.r.VND).toLocaleString(pl === 'en' ? 'en-US' : 'vi-VN') + (pl === 'en' ? ' VND' : ' đ');
    bar.classList.toggle('dk', !!document.querySelector('.nac-pdp[data-theme="dark"],body[data-theme="dark"],html[data-theme="dark"]'));
  }

  // ── The pill ────────────────────────────────────────────────────────────
  var CSS = '.nac-cur{position:fixed;left:14px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:90;display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(255,255,255,.96);border:1px solid #e6e3dc;box-shadow:0 6px 22px rgba(0,0,0,.12);font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .25s ease,transform .25s ease,bottom .25s ease;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}' +
    '.nac-cur.on{opacity:1;transform:none;pointer-events:auto}' +
    '.nac-cur button{appearance:none;-webkit-appearance:none;border:0;background:none;margin:0;padding:8px 12px;border-radius:999px;color:#5b5f66;font:inherit;letter-spacing:0;cursor:pointer;white-space:nowrap;min-height:32px}' +
    '.nac-cur button:hover{color:#15171a}' +
    '.nac-cur button b{font-weight:700;margin-right:4px}' +
    '.nac-cur button[aria-pressed="true"]{background:#15171a;color:#fff}' +
    '.nac-cur button:focus-visible{outline:2px solid #F4622A;outline-offset:1px}' +
    '.nac-cur small{display:none;position:absolute;left:4px;bottom:calc(100% + 6px);white-space:nowrap;font:400 10.5px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;color:#5b5f66;background:rgba(255,255,255,.96);border:1px solid #e6e3dc;border-radius:6px;padding:4px 7px}' +
    '.nac-cur small:not(:empty){display:block}' +
    '.nac-cur.dk{background:rgba(20,22,28,.94);border-color:rgba(255,255,255,.14)}' +
    '.nac-cur.dk button{color:rgba(255,255,255,.66)}.nac-cur.dk button:hover{color:#fff}' +
    '.nac-cur.dk button[aria-pressed="true"]{background:#fff;color:#15171a}' +
    '.nac-cur.dk small{background:rgba(20,22,28,.94);border-color:rgba(255,255,255,.14);color:rgba(255,255,255,.7)}' +
    '.nac-money[data-m]{border-bottom:1px dotted rgba(244,98,42,.55)}' +
    '@media (max-width:420px){.nac-cur button{padding:8px 10px}}' +
    '@media (prefers-reduced-motion:reduce){.nac-cur{transition:none}}';
  function makeBar() {
    var st = document.createElement('style');
    st.id = 'nac-cur-css'; st.textContent = CSS;
    document.head.appendChild(st);
    bar = document.createElement('div');
    bar.className = 'nac-cur';
    bar.setAttribute('role', 'group');
    [['orig', ''], ['usd', '$'], ['vnd', '₫']].forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-m', d[0]);
      if (d[1]) { var s = document.createElement('b'); s.textContent = d[1]; b.appendChild(s); }
      b.appendChild(document.createTextNode(''));
      bar.appendChild(b);
    });
    bar.appendChild(document.createElement('small'));
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      mode = b.getAttribute('data-m');
      store(LS_MODE, mode);
      if (mode === 'orig') applyAll(); else { applyAll(); loadFx().then(function () { applyAll(); }); }
    });
    var shown = false;
    function show() {
      var y = (window.scrollY || window.pageYOffset) > 600;
      if (y !== shown) { shown = y; bar.classList.toggle('on', y); if (y) place(); }
    }
    window.addEventListener('scroll', show, { passive: true });
    window.addEventListener('resize', place, { passive: true });
    show();
    syncBar(pageLang());
  }
  // keep clear of the bottom tool bars (hub + PDP .nac-tools, anything tagged data-nac-cur-avoid)
  function place() {
    if (!bar) return;
    var lift = 0, w = bar.offsetWidth || 220, H = window.innerHeight;
    document.querySelectorAll('.nac-tools,[data-nac-cur-avoid]').forEach(function (el) {
      if (!el.getClientRects().length) return;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < H - 140 || r.top > H) return;
      var narrow = window.innerWidth <= 900;
      if (narrow || r.left < 14 + w + 12) lift = Math.max(lift, H - r.top + 10);
    });
    bar.style.bottom = lift ? 'calc(' + Math.round(lift) + 'px + env(safe-area-inset-bottom,0px))' : '';
  }

  // ── Scan + observe ──────────────────────────────────────────────────────
  var busy = false, obs = null, queue = [], timer = 0;
  function flush() { if (obs) obs.takeRecords(); busy = false; }
  function scan(root) {
    busy = true;
    var n = markSplit(root) + markText(root);
    count += n;
    if (count && !bar) makeBar();
    flush();
    return n;
  }
  function process() {
    timer = 0;
    var roots = queue; queue = [];
    var pl = pageLang();
    if (pl !== lastLang) { lastLang = pl; applyAll(); } else if (bar) syncBar(pl);
    roots.forEach(function (r) {
      if (!r.isConnected) return;
      var before = count;
      scan(r);
      if (mode !== 'orig' && count > before) applyAll(r.querySelectorAll ? r.querySelectorAll('.nac-money:not([data-m])') : []);
      if (mode !== 'orig' && r.classList && r.classList.contains('nac-money')) applyAll([r]);
    });
    place();
  }
  function enqueue(n) {
    var el = n.nodeType === 1 ? n : n.parentElement;
    if (!el || el.closest('.nac-cur')) return;
    var money = el.closest('.nac-money');
    if (money) { el = unmark(money); if (!el) return; }
    if (queue.indexOf(el) < 0) queue.push(el);
    if (!timer) timer = setTimeout(process, 60);
  }
  function start() {
    lastLang = pageLang();
    scan(document.body);
    if (mode !== 'orig') { applyAll(); loadFx().then(function () { applyAll(); }); }
    if (!window.MutationObserver) return;
    obs = new MutationObserver(function (recs) {
      if (busy) return;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'attributes') { if (!timer) timer = setTimeout(process, 60); continue; }
        if (r.type === 'characterData') { enqueue(r.target); continue; }
        if (r.target.closest && r.target.closest('.nac-money') && r.addedNodes.length) { enqueue(r.target); continue; }
        for (var j = 0; j < r.addedNodes.length; j++) {
          var a = r.addedNodes[j];
          if (a.nodeType === 1 || a.nodeType === 3) enqueue(a);
        }
      }
    });
    // body subtree: content changes + the VI/EN (data-lang) and theme toggles; <html lang> for the hub
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-lang', 'data-theme'] });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] });
  }

  window.NACCur = {
    get mode() { return mode; },
    rescan: function (root) { var n = scan(root || document.body); if (mode !== 'orig') applyAll(); return n; },
    apply: function () { applyAll(); },
    set: function (m) { if (m === 'orig' || m === 'usd' || m === 'vnd') { mode = m; store(LS_MODE, m); applyAll(); if (m !== 'orig') loadFx().then(function () { applyAll(); }); } }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
