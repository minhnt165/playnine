/* =====================================================================
 * Nổ Khối - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn lưu theo cột: cols[x] là chồng khối từ dưới lên ({ id, c }), cột rỗng bị bỏ đi
 *     nên "khối rơi" và "cột dồn trái" chỉ là lọc mảng
 *   - Nổ nhóm n khối (nối theo cạnh, cùng màu, n ≥ 2) được (n - 2)² điểm; dọn sạch bàn thưởng 1000
 *   - Hết nhóm từ 2 khối là hết ván; khối còn lại không bị trừ điểm
 *   - Mã khối (id) giữ nguyên suốt ván để giao diện làm hiệu ứng rơi / dồn
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const CLEAR_BONUS = 1000;
  const DEFAULTS = { w: 10, h: 12, k: 4 };
  const MAX_SIDE = 30;
  const MAX_COLORS = 6;

  /** PRNG mulberry32: cùng seed ra cùng dãy số. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const points = (n) => (n >= 2 ? (n - 2) * (n - 2) : 0);

  /** Màu khối tại (x, y), y = 0 là hàng dưới cùng; ô trống / ngoài bàn trả 0. */
  function colorAt(g, x, y) {
    const col = g.cols[x];
    const b = col && col[y];
    return b ? b.c : 0;
  }

  /** Còn cặp khối cạnh nhau cùng màu không. */
  function hasMoves(g) {
    for (let x = 0; x < g.cols.length; x++) {
      const col = g.cols[x];
      for (let y = 0; y < col.length; y++) {
        const c = col[y].c;
        if (colorAt(g, x, y + 1) === c || colorAt(g, x + 1, y) === c) return true;
      }
    }
    return false;
  }

  /**
   * Ván mới: w cột × h hàng, k màu, sinh ngẫu nhiên theo seed.
   * Bàn phải có ít nhất một nhóm (gần như luôn có); không có thì sinh tiếp từ cùng dãy số.
   */
  function newGame(seed, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const s = (Number(seed) >>> 0) || 1;
    const rand = rng(s);
    let g;
    do {
      const cols = [];
      for (let x = 0; x < o.w; x++) {
        const col = [];
        for (let y = 0; y < o.h; y++) col.push({ id: x * o.h + y, c: 1 + Math.floor(rand() * o.k) });
        cols.push(col);
      }
      g = { w: o.w, h: o.h, k: o.k, seed: s, cols, score: 0, pops: 0 };
    } while (!hasMoves(g));
    return g;
  }

  /** Nhóm chứa ô (x, y): mảng [x, y] (kể cả nhóm 1 khối); ô trống / ngoài bàn trả []. */
  function groupAt(g, x, y) {
    const c = colorAt(g, x, y);
    if (!c) return [];
    const seen = new Set([x + ',' + y]);
    const out = [];
    const stack = [[x, y]];
    while (stack.length) {
      const p = stack.pop();
      out.push(p);
      const near = [[p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]];
      for (const q of near) {
        const key = q[0] + ',' + q[1];
        if (!seen.has(key) && colorAt(g, q[0], q[1]) === c) {
          seen.add(key);
          stack.push(q);
        }
      }
    }
    return out;
  }

  /** Mọi nhóm từ 2 khối trở lên (mỗi khối nằm trong đúng một nhóm). */
  function groups(g) {
    const done = new Set();
    const out = [];
    g.cols.forEach((col, x) => col.forEach((b, y) => {
      if (done.has(x + ',' + y)) return;
      const grp = groupAt(g, x, y);
      grp.forEach((p) => done.add(p[0] + ',' + p[1]));
      if (grp.length >= 2) out.push(grp);
    }));
    return out;
  }

  const blocksLeft = (g) => g.cols.reduce((n, col) => n + col.length, 0);
  const isCleared = (g) => g.cols.length === 0;
  const isOver = (g) => !hasMoves(g);

  /** Nổ nhóm chứa (x, y). Nhóm dưới 2 khối hoặc ô trống thì trả lại chính ván cũ. */
  function pop(g, x, y) {
    const grp = groupAt(g, x, y);
    if (grp.length < 2) return g;
    const gone = new Set(grp.map((p) => p[0] + ',' + p[1]));
    const cols = g.cols
      .map((col, cx) => col.filter((b, cy) => !gone.has(cx + ',' + cy)))
      .filter((col) => col.length > 0);
    let score = g.score + points(grp.length);
    if (cols.length === 0) score += CLEAR_BONUS;
    return { w: g.w, h: g.h, k: g.k, seed: g.seed, cols, score, pops: g.pops + 1 };
  }

  const toJSON = (g) => ({
    v: VERSION, w: g.w, h: g.h, k: g.k, seed: g.seed, score: g.score, pops: g.pops,
    cols: g.cols.map((col) => col.map((b) => [b.id, b.c])),
  });

  const isInt = (n, min, max) => Number.isInteger(n) && n >= min && (max == null || n <= max);

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { w, h, k, seed, score, pops, cols } = raw;
    if (!isInt(w, 1, MAX_SIDE) || !isInt(h, 1, MAX_SIDE) || !isInt(k, 2, MAX_COLORS)) return null;
    if (!isInt(seed, 0) || !isInt(score, 0) || !isInt(pops, 0)) return null;
    if (!Array.isArray(cols) || cols.length > w) return null;
    const ids = new Set();
    const out = [];
    for (const col of cols) {
      if (!Array.isArray(col) || col.length < 1 || col.length > h) return null;
      const c2 = [];
      for (const b of col) {
        if (!Array.isArray(b) || b.length !== 2 || !isInt(b[0], 0) || !isInt(b[1], 1, k) || ids.has(b[0])) return null;
        ids.add(b[0]);
        c2.push({ id: b[0], c: b[1] });
      }
      out.push(c2);
    }
    return { w, h, k, seed, cols: out, score, pops };
  }

  const api = { CLEAR_BONUS, newGame, points, colorAt, groupAt, groups, hasMoves, blocksLeft, isCleared, isOver, pop, toJSON, fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
