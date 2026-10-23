/* =====================================================================
 * PlayNine Cards - bộ bài tây dùng chung cho game bài (JS thuần, không build)
 *   - Nhúng sau kit.js: <link rel="stylesheet" href="../_kit/cards.css?v=1">
 *                       <script src="../_kit/cards.js?v=1"></script>
 *   - Phần thuần (chạy được trong Node để test): mô hình lá { rank: 1..13, suit: 'S'|'H'|'D'|'C' },
 *     id dạng 'AS' '10H' 'KD', newDeck, shuffle, rng có lưu / khôi phục trạng thái, nhãn và màu
 *   - Phần giao diện (window.PNCards): render / html (mặt lá, lưng lá), slot (ô trống), flip (lật lá),
 *     drag (kéo thả bằng pointer events)
 *   - API đã có game dựa vào: chỉ được thêm, không đổi nghĩa; đổi gì cũng tăng ?v= ở mọi game dùng
 * ===================================================================== */
(function (root) {
  'use strict';

  const CARDS_VERSION = '1.0.0';
  const SUITS = ['S', 'H', 'D', 'C']; // bích, cơ, rô, nhép (thứ tự cố định: newDeck dựa vào nó)
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const NAMES = {
    en: {
      rank: [null, 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'],
      suit: { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' },
      fmt: (r, s) => r + ' of ' + s,
      back: 'Face-down card',
    },
    vi: {
      rank: [null, 'Át', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Bồi', 'Đầm', 'Già'],
      suit: { S: 'bích', H: 'cơ', D: 'rô', C: 'nhép' },
      fmt: (r, s) => r + ' ' + s,
      back: 'Lá úp',
    },
  };

  /* ---------------- Phần thuần ---------------- */

  const suitOf = (x) => (x && typeof x === 'object' ? x.suit : x);
  const rankOf = (x) => (x && typeof x === 'object' ? x.rank : x);

  /** { rank: 10, suit: 'H' } -> '10H'. */
  function toId(card) {
    return RANK_LABEL[card.rank] + card.suit;
  }

  /** '10H' -> { rank: 10, suit: 'H' }. Nhận cả chữ thường và 'T' cho 10; sai định dạng trả null. */
  function fromId(id) {
    const m = /^(A|[2-9]|10|T|J|Q|K)([SHDC])$/.exec(String(id == null ? '' : id).trim().toUpperCase());
    if (!m) return null;
    const rank = m[1] === 'T' ? 10 : RANK_LABEL.indexOf(m[1]);
    return { rank, suit: m[2] };
  }

  /** Lá hợp lệ: rank nguyên 1..13 và suit thuộc SUITS. */
  function isCard(x) {
    return !!x && typeof x === 'object' && RANKS.indexOf(x.rank) >= 0 && SUITS.indexOf(x.suit) >= 0;
  }

  /**
   * Bộ bài mới, CHƯA xáo, thứ tự cố định: bộ -> chất -> bậc A..K.
   *   decks: số bộ 52 lá (tổng luôn là 52 × decks)
   *   suits: mảng chất (['S'], ['S','H'], ...) hoặc số 1 | 2 | 4 (1 = bích, 2 = bích + cơ, 4 = đủ);
   *          ít chất thì mỗi chất lặp lại cho đủ số lá (Nhện 1 chất: decks 2, suits 1 -> 104 lá bích)
   */
  function newDeck(opts) {
    const o = opts || {};
    const decks = o.decks == null ? 1 : o.decks;
    let suits = o.suits == null ? SUITS : o.suits;
    if (typeof suits === 'number') suits = SUITS.slice(0, suits);
    if (!(Number.isInteger(decks) && decks > 0)) throw new Error('newDeck: decks phải là số nguyên dương');
    if (!Array.isArray(suits) || !suits.length || suits.some((s) => SUITS.indexOf(s) < 0)) throw new Error('newDeck: suits không hợp lệ');
    if ((4 * decks) % suits.length) throw new Error('newDeck: 4 × decks phải chia hết cho số chất');
    const sets = (4 * decks) / suits.length; // số lần lặp mỗi chất
    const out = [];
    // Mỗi bộ 52 lá gồm 4 dãy 13 lá; dãy thứ k dùng chất suits[k % số chất]
    for (let k = 0; k < sets * suits.length; k++) {
      const suit = suits[k % suits.length];
      for (let r = 1; r <= 13; r++) out.push({ rank: r, suit });
    }
    return out;
  }

  /** Xáo Fisher–Yates; trả MẢNG MỚI, không đụng mảng vào. rng mặc định Math.random. */
  function shuffle(cards, rand) {
    const r = rand || Math.random;
    const a = cards.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Băm chuỗi thành số 32 bit (FNV-1a) để dùng chuỗi làm hạt giống (ví dụ ngày '2026-10-23'). */
  function hashSeed(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Bộ sinh số ngẫu nhiên có hạt giống (mulberry32). seed: số, chuỗi, hoặc bỏ trống (ngẫu nhiên).
   * Trả về hàm r() -> [0, 1), kèm r.int(n) -> 0..n-1, r.getState() -> số nguyên 32 bit (lưu được JSON),
   * r.setState(s) để chạy tiếp đúng dãy số từ chỗ đã lưu.
   */
  function rng(seed) {
    let a;
    if (typeof seed === 'string') a = hashSeed(seed);
    else if (typeof seed === 'number' && isFinite(seed)) a = seed >>> 0;
    else a = (Math.random() * 4294967296) >>> 0;
    function r() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    r.int = (n) => Math.floor(r() * n);
    r.getState = () => a;
    r.setState = (s) => { a = Number(s) >>> 0; };
    return r;
  }

  /** Cơ hoặc rô. Nhận lá hoặc chữ chất. Luật màu (xen kẽ đỏ / đen) luôn theo hàm này, kể cả khi bật bài 4 màu. */
  function isRed(x) {
    const s = suitOf(x);
    return s === 'H' || s === 'D';
  }
  const color = (x) => (isRed(x) ? 'red' : 'black');
  /** 1 -> 'A', 10 -> '10', 13 -> 'K'. Nhận lá hoặc số bậc. */
  const rankLabel = (x) => RANK_LABEL[rankOf(x)] || '';
  /** 'S' -> '♠'. Nhận lá hoặc chữ chất. */
  const suitSymbol = (x) => SUIT_SYMBOL[suitOf(x)] || '';

  /** Tên đọc được cho trình đọc màn hình: 'Queen of hearts' / 'Đầm cơ'. lang: 'en' | 'vi'. */
  function cardName(card, lang) {
    const n = NAMES[lang] || NAMES.en;
    if (!card) return n.back;
    return n.fmt(n.rank[card.rank], n.suit[card.suit]);
  }

  /* ---------------- Phần giao diện ---------------- */

  // Hình chất và hình lá mặt (viewBox 24 × 24), vẽ một lần vào sprite, lá bài dùng <use href="#pnc-…">
  const SPRITE =
    '<symbol id="pnc-S" viewBox="0 0 24 24"><path d="M12 1.8c.5.6 9.6 7.2 9.6 12.9 0 2.9-2.3 5.1-5 5.1-1.6 0-3-.7-3.8-1.9.3 1.8 1 3.1 2.5 4.5H8.7c1.5-1.4 2.2-2.7 2.5-4.5-.8 1.2-2.2 1.9-3.8 1.9-2.7 0-5-2.2-5-5.1C2.4 9 11.5 2.4 12 1.8z"/></symbol>' +
    '<symbol id="pnc-H" viewBox="0 0 24 24"><path d="M12 21.6c-.5-.5-9.7-7-9.7-13.2 0-3.2 2.4-5.6 5.5-5.6 1.8 0 3.3.9 4.2 2.4.9-1.5 2.4-2.4 4.2-2.4 3.1 0 5.5 2.4 5.5 5.6 0 6.2-9.2 12.7-9.7 13.2z"/></symbol>' +
    '<symbol id="pnc-D" viewBox="0 0 24 24"><path d="M12 1.4c2.3 3.8 5 7.3 8.6 10.6-3.6 3.3-6.3 6.8-8.6 10.6-2.3-3.8-5-7.3-8.6-10.6C7 8.7 9.7 5.2 12 1.4z"/></symbol>' +
    '<symbol id="pnc-C" viewBox="0 0 24 24"><circle cx="12" cy="6.9" r="4.6"/><circle cx="6.6" cy="13.9" r="4.6"/><circle cx="17.4" cy="13.9" r="4.6"/><path d="M10 9.6h4l-.6 4.4H10.6z"/><path d="M12 12.6c-.1 4.1-.9 6.9-3.2 9.7h6.4c-2.3-2.8-3.1-5.6-3.2-9.7z"/></symbol>' +
    // Già: vương miện 3 đỉnh
    '<symbol id="pnc-K" viewBox="0 0 24 24"><path d="M2.6 8.6 7.3 12.3 12 4.4l4.7 7.9 4.7-3.7-1.8 10H4.4z"/><circle cx="2.6" cy="7.4" r="1.6"/><circle cx="12" cy="3.2" r="1.7"/><circle cx="21.4" cy="7.4" r="1.6"/><path d="M4.4 19.9h15.2v2.3H4.4z"/></symbol>' +
    // Đầm: vương miện 5 đỉnh tròn
    '<symbol id="pnc-Q" viewBox="0 0 24 24"><path d="M3 18.6 2.4 9.6l4 3.3L9 7.6l3 4.6 3-4.6 2.6 5.3 4-3.3-.6 9z"/><circle cx="2.4" cy="8.4" r="1.4"/><circle cx="9" cy="6.3" r="1.4"/><circle cx="15" cy="6.3" r="1.4"/><circle cx="21.6" cy="8.4" r="1.4"/><circle cx="12" cy="15.4" r="1.6" fill="#fff" fill-opacity=".55"/><path d="M3 19.9h18v2.3H3z"/></symbol>' +
    // Bồi: mũ nồi cắm lông
    '<symbol id="pnc-J" viewBox="0 0 24 24"><path d="M3.6 18c.3-5.2 3.8-8.6 8.4-8.6s8.1 3.4 8.4 8.6z"/><path d="M12.6 9.8c1.4-4.6 4.6-7.3 8.6-7.9-1.4 2.9-3.6 5.9-7 8.3z"/><path d="M2.6 19.3h18.8v2.9H2.6z"/></symbol>' +
    // Lưng lá: ngôi sao 4 cánh ở giữa
    '<symbol id="pnc-star" viewBox="0 0 24 24"><path d="M12 1.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5C11.1 16.9 7.1 12.9 1.5 12 7.1 11.1 11.1 7.1 12 1.5z"/></symbol>';

  /**
   * Vị trí chấm cho lá 2..10: [cột, hàng]; cột 0 | 1 | 2 (trái, giữa, phải), hàng 0..1 từ trên xuống.
   * Theo cách xếp của bài thật; chấm nửa dưới quay ngược.
   */
  const PIPS = {
    2: [[1, 0], [1, 1]],
    3: [[1, 0], [1, 0.5], [1, 1]],
    4: [[0, 0], [2, 0], [0, 1], [2, 1]],
    5: [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],
    6: [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
    7: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
    8: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [1, 0.75], [0, 1], [2, 1]],
    9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, 0.5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
    10: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
  };

  const hasDoc = () => typeof document !== 'undefined';

  /** Chèn sprite hình chất vào trang (một lần). Gọi tự động khi tải và khi render. */
  function ensureSprite() {
    if (!hasDoc() || document.getElementById('pnc-sprite')) return;
    const host = document.body || document.documentElement;
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg id="pnc-sprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>' + SPRITE + '</defs></svg>';
    host.insertBefore(wrap.firstChild, host.firstChild);
  }

  const use = (id, cls, style) => '<svg class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + ' viewBox="0 0 24 24" aria-hidden="true"><use href="#pnc-' + id + '"/></svg>';

  function pageLang() {
    const l = hasDoc() && document.documentElement.lang ? document.documentElement.lang.slice(0, 2) : 'en';
    return NAMES[l] ? l : 'en';
  }

  function sizeValue(size) {
    if (size == null || size === '') return '';
    return typeof size === 'number' ? size + 'px' : String(size);
  }

  /** Nội dung mặt lá (không gồm khung ngoài). */
  function faceHTML(card) {
    const r = card.rank;
    const s = card.suit;
    let h = '<div class="pnc-face"><span class="pnc-rk' + (r === 10 ? ' pnc-ten' : '') + '">' + RANK_LABEL[r] + '</span>' + use(s, 'pnc-sm');
    if (r >= 11) {
      // Lá mặt: khung viền vàng, hình vương miện / mũ trên, chất dưới
      h += '<span class="pnc-court">' + use(RANK_LABEL[r], 'pnc-emb') + use(s, 'pnc-cs') + '</span>';
    } else if (r === 1) {
      h += use(s, 'pnc-ace');
    } else {
      // Lá nhỏ hẹp: một chất lớn; lá đủ rộng (container query trong cards.css): chấm như bài thật
      h += use(s, 'pnc-big') + '<span class="pnc-pips">';
      PIPS[r].forEach((p) => {
        h += use(s, 'pnc-p' + (p[1] > 0.5 ? ' pnc-p-dn' : ''), '--c:' + p[0] + ';--y:' + +p[1].toFixed(4));
      });
      h += '</span>';
    }
    return h + '</div>';
  }

  function cardClass(card, up, extra) {
    let c = 'pnc';
    if (card) c += ' pnc-s-' + card.suit + ' pnc-' + color(card) + (up ? ' pnc-up' : '');
    return extra ? c + ' ' + extra : c;
  }

  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /**
   * Chuỗi HTML của một lá (cùng cấu trúc với render). Dùng khi game dựng bàn bằng innerHTML.
   *   card: { rank, suit } hoặc null (lá úp không biết mặt, ví dụ lá tẩy của nhà cái; không lật được)
   *   opts: { faceUp = true, size, label, className }
   */
  function html(card, opts) {
    const o = opts || {};
    ensureSprite();
    const up = !!card && o.faceUp !== false;
    const w = sizeValue(o.size);
    const label = o.label === false ? '' : o.label != null ? o.label : cardName(up ? card : null, pageLang());
    let h = '<div class="' + cardClass(card, up, o.className) + '"';
    if (card) h += ' data-id="' + toId(card) + '"';
    if (w) h += ' style="--card-w:' + escAttr(w) + '"';
    if (label) h += ' role="img" aria-label="' + escAttr(label) + '"' + (o.label != null ? ' data-label' : '');
    h += '>' + (card ? faceHTML(card) : '') + '<div class="pnc-back"><svg class="pnc-star" viewBox="0 0 24 24" aria-hidden="true"><use href="#pnc-star"/></svg></div></div>';
    return h;
  }

  /** Như html nhưng trả về phần tử <div class="pnc …"> (khuyên dùng). */
  function render(card, opts) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html(card, opts);
    return wrap.firstChild;
  }

  /**
   * Ô trống (chỗ đặt lá): khung viền đứt cùng cỡ lá.
   *   opts: { label: 'A' | '♠' | 'K' | '' , size, className }
   */
  function slot(opts) {
    const o = opts || {};
    const el = document.createElement('div');
    el.className = 'pnc-slot' + (o.className ? ' ' + o.className : '');
    const w = sizeValue(o.size);
    if (w) el.style.setProperty('--card-w', w);
    if (o.label) {
      const s = document.createElement('span');
      s.className = 'pnc-slot-label';
      s.textContent = o.label;
      el.appendChild(s);
    }
    return el;
  }

  /** Đọc lá từ phần tử .pnc (data-id); lá úp không biết mặt trả null. */
  function cardOf(el) {
    const c = el && el.closest ? el.closest('.pnc') : null;
    return c && c.dataset.id ? fromId(c.dataset.id) : null;
  }

  function reducedMotion() {
    return hasDoc() && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setUp(el, up) {
    el.classList.toggle('pnc-up', up);
    if (el.getAttribute('role') === 'img' && !el.hasAttribute('data-label')) {
      el.setAttribute('aria-label', cardName(up ? cardOf(el) : null, pageLang()));
    }
  }

  /**
   * Lật lá: thu hẹp mặt đang thấy rồi mở mặt kia (2D, không đụng transform của chính .pnc).
   *   faceUp: true / false; bỏ trống = đảo trạng thái. opts: { duration = 300 }
   *   Trả Promise<el>. Giảm chuyển động (prefers-reduced-motion) thì đổi ngay. Lá null (không có mặt) không lật lên được.
   */
  function flip(el, faceUp, opts) {
    const cur = el.classList.contains('pnc-up');
    const up = faceUp == null ? !cur : !!faceUp;
    if (up === cur || (up && !el.dataset.id)) return Promise.resolve(el);
    const ms = opts && opts.duration != null ? opts.duration : 300;
    const from = el.querySelector(cur ? '.pnc-face' : '.pnc-back');
    if (!(ms > 0) || reducedMotion() || !from || typeof from.animate !== 'function') {
      setUp(el, up);
      return Promise.resolve(el);
    }
    const half = ms / 2;
    const a1 = from.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: half, easing: 'ease-in', fill: 'forwards' });
    return a1.finished.catch(() => {}).then(() => {
      setUp(el, up);
      a1.cancel();
      const to = el.querySelector(up ? '.pnc-face' : '.pnc-back');
      if (!to) return el;
      return to.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: half, easing: 'ease-out' }).finished.catch(() => {}).then(() => el);
    });
  }

  /**
   * Kéo thả lá bằng pointer events (chuột, cảm ứng, bút) trong container.
   *   opts.canPick(el, ev)         -> false: không cho nhấc; true: nhấc lá el; mảng phần tử: nhấc cả nhóm (chồng lá)
   *   opts.canDrop(el, target, els) -> false: không thả được vào target (không sáng, không chọn)
   *   opts.onDrop(el, target, els) -> trả false nếu từ chối (lá bay về chỗ cũ); khác false là nhận
   *   opts.onCancel(el, els)       -> không thả được: ngoài mọi đích, onDrop từ chối, Esc, pointercancel
   *   opts.onStart(el, els)        -> bắt đầu kéo (đã vượt ngưỡng)
   *   opts.cards   = '.pnc'        selector phần tử kéo được
   *   opts.targets = '[data-drop]' selector đích thả (trong container)
   *   opts.threshold = 6           px phải di chuyển mới tính là kéo (dưới ngưỡng là chạm: click bình thường)
   * Trả về { cancel(), destroy(), get active() }.
   */
  function drag(container, opts) {
    const o = opts || {};
    const cardSel = o.cards || '.pnc';
    const targetSel = o.targets || '[data-drop]';
    const threshold = o.threshold == null ? 6 : o.threshold;
    let s = null; // phiên kéo hiện tại
    let blockClickUntil = 0;
    container.classList.add('pnc-drag-area');

    function down(e) {
      if (s || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const el = e.target.closest ? e.target.closest(cardSel) : null;
      if (!el || !container.contains(el)) return;
      const pick = o.canPick ? o.canPick(el, e) : true;
      if (!pick) return;
      const els = Array.isArray(pick) ? pick.filter(Boolean) : [el];
      if (!els.length) return;
      if (els.indexOf(el) < 0) els.unshift(el);
      s = { id: e.pointerId, el, els, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, target: null };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelEv);
      window.addEventListener('keydown', key, true);
    }

    function start() {
      s.started = true;
      const lead = s.el.getBoundingClientRect();
      s.lead = lead;
      const g = document.createElement('div');
      g.className = 'pnc-ghost';
      g.setAttribute('aria-hidden', 'true');
      g.style.left = lead.left + 'px';
      g.style.top = lead.top + 'px';
      g.style.width = lead.width + 'px';
      g.style.height = lead.height + 'px';
      s.els.forEach((x) => {
        const r = x.getBoundingClientRect();
        const c = x.cloneNode(true);
        c.removeAttribute('id');
        c.classList.remove('pnc-selected', 'pnc-highlight', 'pnc-disabled', 'pnc-lifted');
        c.style.cssText += ';position:absolute;margin:0;transform:none;translate:none;transition:none;' +
          'left:' + (r.left - lead.left) + 'px;top:' + (r.top - lead.top) + 'px;width:' + r.width + 'px;height:' + r.height + 'px;--card-w:' + r.width + 'px';
        g.appendChild(c);
      });
      document.body.appendChild(g);
      s.ghost = g;
      s.els.forEach((x) => x.classList.add('pnc-lifted'));
      container.classList.add('pnc-dragging');
      if (o.onStart) o.onStart(s.el, s.els);
    }

    /** Đích dưới ngón tay (nếu hợp lệ); không có thì đích hợp lệ giao nhiều nhất với lá đầu (>= 20% diện tích lá). */
    function findTarget(dx, dy) {
      const L = s.lead;
      const box = { l: L.left + dx, t: L.top + dy, r: L.right + dx, b: L.bottom + dy };
      const ok = (t) => !o.canDrop || o.canDrop(s.el, t, s.els) !== false;
      const list = Array.prototype.slice.call(container.querySelectorAll(targetSel));
      let best = null;
      let bestArea = L.width * L.height * 0.2;
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        if (s.x >= r.left && s.x <= r.right && s.y >= r.top && s.y <= r.bottom && ok(list[i])) return list[i];
        const w = Math.min(box.r, r.right) - Math.max(box.l, r.left);
        const h = Math.min(box.b, r.bottom) - Math.max(box.t, r.top);
        if (w > 0 && h > 0 && w * h > bestArea && ok(list[i])) {
          bestArea = w * h;
          best = list[i];
        }
      }
      return best;
    }

    function move(e) {
      if (!s || e.pointerId !== s.id) return;
      s.x = e.clientX;
      s.y = e.clientY;
      const dx = s.x - s.x0;
      const dy = s.y - s.y0;
      if (!s.started) {
        if (Math.hypot(dx, dy) < threshold) return;
        start();
      }
      e.preventDefault();
      s.ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const t = findTarget(dx, dy);
      if (t !== s.target) {
        if (s.target) s.target.classList.remove('pnc-over');
        if (t) t.classList.add('pnc-over');
        s.target = t;
      }
    }

    function stopListening() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelEv);
      window.removeEventListener('keydown', key, true);
    }

    function finish(cur) {
      if (cur.target) cur.target.classList.remove('pnc-over');
      if (cur.ghost) cur.ghost.remove();
      cur.els.forEach((x) => x.classList.remove('pnc-lifted'));
      container.classList.remove('pnc-dragging');
    }

    /** Bay ghost tới vị trí (dx, dy) so với chỗ nhấc rồi dọn. */
    function settle(cur, dx, dy) {
      const g = cur.ghost;
      if (!g || reducedMotion() || typeof g.animate !== 'function') return finish(cur);
      const from = g.style.transform || 'translate(0px,0px)';
      const to = 'translate(' + dx + 'px,' + dy + 'px)';
      g.style.transform = to;
      g.classList.add('pnc-ghost-settle');
      const a = g.animate([{ transform: from }, { transform: to }], { duration: 160, easing: 'cubic-bezier(.2,.75,.3,1)' });
      a.finished.catch(() => {}).then(() => finish(cur));
    }

    function end(accepted) {
      const cur = s;
      s = null;
      stopListening();
      if (!cur.started) return;
      blockClickUntil = Date.now() + 400;
      if (cur.target) cur.target.classList.remove('pnc-over');
      if (!accepted) {
        if (o.onCancel) o.onCancel(cur.el, cur.els);
        return settle(cur, 0, 0);
      }
      // Lá vẫn trong trang (game dời phần tử): bay tới chỗ mới; game dựng lại phần tử khác thì dọn luôn
      if (document.contains(cur.el)) {
        const r = cur.el.getBoundingClientRect();
        return settle(cur, r.left - cur.lead.left, r.top - cur.lead.top);
      }
      finish(cur);
    }

    function up(e) {
      if (!s || e.pointerId !== s.id) return;
      if (!s.started) return end(false);
      let ok = false;
      if (s.target && o.onDrop) {
        try {
          ok = o.onDrop(s.el, s.target, s.els) !== false;
        } catch (err) {
          end(false);
          throw err;
        }
      }
      end(ok);
    }

    function cancelEv(e) {
      if (s && e.pointerId === s.id) end(false);
    }
    function key(e) {
      if (s && s.started && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        end(false);
      }
    }
    // Vừa kéo xong thì nuốt click (để game không hiểu nhầm là chạm chọn lá)
    function click(e) {
      if (Date.now() < blockClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        blockClickUntil = 0;
      }
    }
    function dragstart(e) {
      if (e.target.closest && e.target.closest(cardSel)) e.preventDefault();
    }

    container.addEventListener('pointerdown', down);
    container.addEventListener('click', click, true);
    container.addEventListener('dragstart', dragstart);

    return {
      get active() { return !!(s && s.started); },
      cancel() { if (s) end(false); },
      destroy() {
        if (s) end(false);
        container.removeEventListener('pointerdown', down);
        container.removeEventListener('click', click, true);
        container.removeEventListener('dragstart', dragstart);
        container.classList.remove('pnc-drag-area');
      },
    };
  }

  if (hasDoc()) {
    if (document.body) ensureSprite();
    else document.addEventListener('DOMContentLoaded', ensureSprite);
  }

  const api = {
    CARDS_VERSION, SUITS, RANKS,
    toId, fromId, isCard, newDeck, shuffle, rng, isRed, color, rankLabel, suitSymbol, cardName,
    html, render, slot, cardOf, flip, drag, ensureSprite,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PNCards = api;
})(typeof window !== 'undefined' ? window : this);
