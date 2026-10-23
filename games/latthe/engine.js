/* =====================================================================
 * Lật Thẻ - Engine thuần (không đụng DOM)
 *   - Bàn có 2 x số cặp thẻ úp; mỗi hình xuất hiện đúng 2 lần
 *   - Lật 2 thẻ: cùng hình thì giữ mở (ăn cặp), khác hình thì chờ app gọi hide() để úp lại
 *   - Đang có cặp sai mở thì khóa, không lật thêm được
 *   - Ăn hết các cặp là thắng; một lượt (move) = một lần lật thẻ thứ hai
 * ===================================================================== */
(function (root) {
  'use strict';

  const FACE_COUNT = 18; // số hình có sẵn (app.js vẽ đủ 18 hình)

  // Mức độ: số cặp và các cách xếp lưới (cột x hàng) để app chọn theo khung màn hình
  const MODES = {
    easy: { pairs: 6, grids: [[4, 3], [3, 4], [6, 2]] },
    medium: { pairs: 8, grids: [[4, 4], [8, 2]] },
    hard: { pairs: 15, grids: [[5, 6], [6, 5], [10, 3]] },
  };
  const MODE_KEYS = ['easy', 'medium', 'hard'];

  /* ---------------- PRNG ---------------- */

  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  const int = (x) => Number.isInteger(x);
  const isMode = (m) => typeof m === 'string' && MODE_KEYS.indexOf(m) >= 0;

  /* ---------------- Chia bài ---------------- */

  /** Chọn ngẫu nhiên `pairs` hình khác nhau, mỗi hình 2 thẻ, rồi xáo. */
  function deal(mode, rng) {
    const pairs = MODES[mode].pairs;
    const pool = [];
    for (let f = 0; f < FACE_COUNT; f++) pool.push(f);
    shuffleInPlace(pool, rng);
    const deck = [];
    pool.slice(0, pairs).forEach((f) => deck.push(f, f));
    return shuffleInPlace(deck, rng);
  }

  /** Ván mới. rng mặc định Math.random; truyền seededRandom(n) để ra cùng một bàn. */
  function createGame(mode, rng) {
    if (!isMode(mode)) mode = 'easy';
    const faces = deal(mode, rng || Math.random);
    return {
      mode,
      faces,
      matched: faces.map(() => false),
      open: [], // thẻ đang mở mà chưa ăn (0, 1 hoặc 2 thẻ; 2 thẻ = cặp sai đang chờ úp)
      moves: 0, // số cặp đã thử
      flips: 0, // số lần lật thẻ
      status: 'playing',
    };
  }

  /* ---------------- Lật thẻ ---------------- */

  const isLocked = (g) => g.open.length >= 2;
  const pairCount = (g) => g.faces.length / 2;
  const matchedPairs = (g) => g.matched.filter(Boolean).length / 2;
  const remainingPairs = (g) => pairCount(g) - matchedPairs(g);
  const progress = (g) => matchedPairs(g) / pairCount(g);

  /** Lật được thẻ i không (đang chơi, không khóa, thẻ còn úp). */
  function canFlip(g, i) {
    return (
      g.status === 'playing' &&
      int(i) && i >= 0 && i < g.faces.length &&
      !isLocked(g) &&
      !g.matched[i] &&
      g.open.indexOf(i) < 0
    );
  }

  /**
   * Lật thẻ i. Trả null nếu không lật được, hoặc
   *   { kind: 'first', index }               thẻ đầu của lượt
   *   { kind: 'match', pair: [a, b], won }   ăn cặp (won: vừa ăn hết)
   *   { kind: 'mismatch', pair: [a, b] }     cặp sai, bàn khóa tới khi gọi hide()
   */
  function flip(g, i) {
    if (!canFlip(g, i)) return null;
    g.flips++;
    g.open.push(i);
    if (g.open.length === 1) return { kind: 'first', index: i };
    g.moves++;
    const a = g.open[0];
    const b = g.open[1];
    if (g.faces[a] === g.faces[b]) {
      g.matched[a] = true;
      g.matched[b] = true;
      g.open = [];
      if (g.matched.every(Boolean)) g.status = 'won';
      return { kind: 'match', pair: [a, b], won: g.status === 'won' };
    }
    return { kind: 'mismatch', pair: [a, b] };
  }

  /** Úp lại cặp sai đang mở; trả về cặp đó, không có thì null. */
  function hide(g) {
    if (!isLocked(g)) return null;
    const pair = g.open;
    g.open = [];
    return pair;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  /** Dạng gọn để lưu; cặp sai đang chờ úp thì coi như đã úp. */
  function toJSON(g) {
    return {
      mode: g.mode,
      faces: g.faces.slice(),
      matched: g.matched.map((m) => (m ? 1 : 0)),
      open: g.open.length === 1 ? g.open.slice() : [],
      moves: g.moves,
      flips: g.flips,
    };
  }

  /** Dựng lại ván từ JSON; dữ liệu hỏng, sai luật hoặc ván đã xong thì trả null. */
  function fromJSON(o) {
    try {
      if (!o || typeof o !== 'object' || !isMode(o.mode)) return null;
      const n = MODES[o.mode].pairs * 2;
      const faces = o.faces;
      const matchedRaw = o.matched;
      if (!Array.isArray(faces) || faces.length !== n) return null;
      if (!Array.isArray(matchedRaw) || matchedRaw.length !== n) return null;
      // Mỗi hình đúng 2 thẻ
      const count = {};
      for (const f of faces) {
        if (!int(f) || f < 0 || f >= FACE_COUNT) return null;
        count[f] = (count[f] || 0) + 1;
      }
      if (Object.keys(count).some((f) => count[f] !== 2)) return null;
      const matched = matchedRaw.map((m) => m === 1 || m === true);
      if (matchedRaw.some((m) => m !== 0 && m !== 1 && m !== true && m !== false)) return null;
      // Hai thẻ cùng hình phải cùng đã ăn hoặc cùng chưa ăn
      const state = {};
      for (let i = 0; i < n; i++) {
        const f = faces[i];
        if (f in state && state[f] !== matched[i]) return null;
        state[f] = matched[i];
      }
      const open = Array.isArray(o.open) ? o.open : [];
      if (open.length > 1) return null;
      if (open.length === 1 && (!int(open[0]) || open[0] < 0 || open[0] >= n || matched[open[0]])) return null;
      const done = matched.filter(Boolean).length / 2;
      const moves = o.moves;
      const flips = o.flips;
      if (!int(moves) || moves < done) return null;
      if (!int(flips) || flips < moves * 2 + open.length) return null;
      if (done === n / 2) return null; // ván đã xong thì không khôi phục
      return { mode: o.mode, faces: faces.slice(), matched, open: open.slice(), moves, flips, status: 'playing' };
    } catch (e) {
      return null;
    }
  }

  const api = {
    FACE_COUNT,
    MODES,
    MODE_KEYS,
    seededRandom,
    deal,
    createGame,
    canFlip,
    flip,
    hide,
    isLocked,
    pairCount,
    matchedPairs,
    remainingPairs,
    progress,
    toJSON,
    fromJSON,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LatThe = api;
})(typeof window !== 'undefined' ? window : this);
