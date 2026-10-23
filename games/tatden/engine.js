/* =====================================================================
 * Tắt Đèn - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn size x size, mỗi ô 1 (sáng) hoặc 0 (tắt); bấm một ô đảo ô đó và 4 ô kề
 *   - Sinh bàn: bấm ngẫu nhiên `par` ô khác nhau lên bàn tắt hết (theo seed) nên luôn giải được;
 *     par là cận trên của số lần bấm ít nhất, không phải đúng số ít nhất
 *   - Bộ giải GF(2) (khử Gauss) để test và để kiểm tra ván lưu có giải được không
 *   - Hàm thuần: nhận ván cũ, trả ván mới; toJSON / fromJSON để lưu ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SIZES = [5, 7];
  // Số lần bấm khi sinh bàn: cấp 1 bắt đầu nhẹ, mỗi cấp thêm 1, dừng ở trần (nhiều hơn nữa cũng không khó hơn)
  const PRESSES = { 5: { base: 2, cap: 15 }, 7: { base: 4, cap: 30 } };

  /** PRNG mulberry32: cùng seed ra cùng dãy số trong [0, 1). */
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

  const isSize = (s) => SIZES.indexOf(s) >= 0;
  const isLevel = (l) => Number.isInteger(l) && l >= 1;
  const isCell = (g, i) => Number.isInteger(i) && i >= 0 && i < g.size * g.size;

  function pressesFor(size, level) {
    const p = PRESSES[size];
    return Math.min(p.base + level, p.cap);
  }

  /** Các ô kề (trên, dưới, trái, phải) của ô i, không tràn qua mép. */
  function neighbours(size, i) {
    const r = Math.floor(i / size);
    const c = i % size;
    const out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }

  /** Đảo ô i và các ô kề; trả mảng mới. */
  function toggle(lights, size, i) {
    const next = lights.slice();
    next[i] ^= 1;
    neighbours(size, i).forEach((j) => { next[j] ^= 1; });
    return next;
  }

  const litCount = (lights) => lights.reduce((n, x) => n + x, 0);
  const isSolved = (g) => litCount(g.lights) === 0;

  /**
   * Ván mới: chọn ngẫu nhiên pressesFor(size, level) ô khác nhau, bấm lên bàn tắt hết.
   * Bàn 5x5 có vài tổ hợp bấm không đổi gì (nhân của ma trận); trúng thì chọn lại để bàn không tắt sẵn.
   */
  function newGame({ size, level, seed }) {
    if (!isSize(size) || !isLevel(level)) throw new Error('bad size/level');
    const n = size * size;
    const par = pressesFor(size, level);
    const rand = rng(seed);
    for (;;) {
      const idx = Array.from({ length: n }, (_, i) => i);
      for (let k = 0; k < par; k++) {
        const j = k + Math.floor(rand() * (n - k));
        const tmp = idx[k];
        idx[k] = idx[j];
        idx[j] = tmp;
      }
      let lights = new Array(n).fill(0);
      for (let k = 0; k < par; k++) lights = toggle(lights, size, idx[k]);
      if (litCount(lights) > 0) return { size, level, seed, par, start: lights.slice(), lights, moves: 0, total: 0 };
    }
  }

  /** Bấm ô i. moves = số nước của lần chơi bàn này, total = mọi lần bấm của ván (kể cả trước khi chơi lại). */
  function press(g, i) {
    if (isSolved(g) || !isCell(g, i)) return g;
    return Object.assign({}, g, { lights: toggle(g.lights, g.size, i), moves: g.moves + 1, total: g.total + 1 });
  }

  /** Chơi lại đúng bàn đầu (cùng ván, không tính là bỏ ván). */
  function restart(g) {
    return Object.assign({}, g, { lights: g.start.slice(), moves: 0 });
  }

  /**
   * Giải A·x = b trên GF(2) (A[i][j] = 1 nếu bấm j đảo i). Trả mảng ô cần bấm ít nhất, hoặc null nếu không giải được.
   * Bàn 7x7 có A khả nghịch; bàn 5x5 có 2 biến tự do nên thử 4 tổ hợp để lấy lời giải ngắn nhất.
   */
  function solve(lights, size) {
    const n = size * size;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const row = new Uint8Array(n + 1);
      row[i] = 1;
      neighbours(size, i).forEach((j) => { row[j] = 1; });
      row[n] = lights[i] ? 1 : 0;
      rows.push(row);
    }
    const pivotOf = []; // pivotOf[hàng] = cột trụ
    let r = 0;
    for (let c = 0; c < n && r < n; c++) {
      let p = r;
      while (p < n && !rows[p][c]) p++;
      if (p === n) continue;
      const tmp = rows[p];
      rows[p] = rows[r];
      rows[r] = tmp;
      for (let k = 0; k < n; k++) {
        if (k !== r && rows[k][c]) for (let j = c; j <= n; j++) rows[k][j] ^= rows[r][j];
      }
      pivotOf[r] = c;
      r++;
    }
    for (let k = r; k < n; k++) if (rows[k][n]) return null; // 0 = 1: không giải được
    const isPivot = new Uint8Array(n);
    pivotOf.forEach((c) => { isPivot[c] = 1; });
    const free = [];
    for (let c = 0; c < n; c++) if (!isPivot[c]) free.push(c);
    let best = null;
    for (let mask = 0; mask < 1 << free.length; mask++) {
      const x = new Uint8Array(n);
      free.forEach((c, b) => { x[c] = (mask >> b) & 1; });
      for (let k = 0; k < r; k++) {
        let v = rows[k][n];
        free.forEach((c) => { if (rows[k][c]) v ^= x[c]; });
        x[pivotOf[k]] = v;
      }
      const cells = [];
      for (let c = 0; c < n; c++) if (x[c]) cells.push(c);
      if (!best || cells.length < best.length) best = cells;
    }
    return best;
  }

  const solvable = (lights, size) => solve(lights, size) !== null;

  const toJSON = (g) => ({
    v: VERSION,
    size: g.size,
    level: g.level,
    seed: g.seed,
    par: g.par,
    start: g.start.slice(),
    lights: g.lights.slice(),
    moves: g.moves,
    total: g.total,
  });

  const isBoard = (a, size) => Array.isArray(a) && a.length === size * size && a.every((x) => x === 0 || x === 1);
  const isCount = (x) => Number.isInteger(x) && x >= 0;

  /** Ván lưu hỏng, khác phiên bản hoặc bàn không giải được thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { size, level, seed, par, start, lights, moves, total } = raw;
    if (!isSize(size) || !isLevel(level) || !Number.isInteger(seed) || seed < 0) return null;
    if (!Number.isInteger(par) || par < 1 || par > size * size) return null;
    if (!isCount(moves) || !isCount(total) || moves > total) return null;
    if (!isBoard(start, size) || !isBoard(lights, size) || litCount(start) === 0) return null;
    if (!solvable(start, size) || !solvable(lights, size)) return null;
    return { size, level, seed, par, start: start.slice(), lights: lights.slice(), moves, total };
  }

  const api = { VERSION, SIZES, rng, pressesFor, neighbours, toggle, litCount, isSolved, newGame, press, restart, solve, solvable, toJSON, fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
