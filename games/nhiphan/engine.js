/* =====================================================================
 * Nhị Phân - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật Takuzu / Binairo trên lưới N×N (N chẵn), mỗi ô là 0 hoặc 1:
 *   - không quá hai ô giống nhau liền nhau theo hàng / cột;
 *   - mỗi hàng / cột có số 0 bằng số 1;
 *   - không có hai hàng giống nhau, không có hai cột giống nhau.
 *   Ô: -1 = trống, 0, 1. Ván là đối tượng bất biến: mọi thao tác trả ván mới (hoặc chính ván cũ nếu không đổi gì).
 *   Sinh đề: lời giải ngẫu nhiên theo seed → bỏ dần ô cho sẵn khi đề vẫn giải được bằng suy luận
 *   (mức 1: cặp / kẹp giữa / đủ số; mức 2: thêm suy luận cả hàng). Suy luận đi hết lưới ⇒ lời giải duy nhất;
 *   test kiểm lại bằng solver đếm nghiệm độc lập (quay lui, dừng ở 2).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SIZES = [6, 8, 10, 12];
  const MAX_HISTORY = 20000; // trần độ dài lịch sử khi đọc ván lưu (chống dữ liệu phình)

  /* ---------------- PRNG (mulberry32) ---------------- */

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

  function shuffle(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const x = arr[i];
      arr[i] = arr[j];
      arr[j] = x;
    }
    return arr;
  }

  /* ---------------- Hàng / cột ---------------- */

  const lineCache = {};
  /** 2N đường: N hàng rồi N cột; mỗi đường là mảng chỉ số ô theo thứ tự. */
  function lines(n) {
    if (lineCache[n]) return lineCache[n];
    const out = [];
    for (let r = 0; r < n; r++) out.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) out.push(Array.from({ length: n }, (_, r) => r * n + c));
    return (lineCache[n] = out);
  }

  const patCache = {};
  /** Mọi dãy N bit hợp lệ cho một đường: đủ N/2 số 1, không ba bit giống nhau liền nhau. Bit j = ô thứ j. */
  function patterns(n) {
    if (patCache[n]) return patCache[n];
    const out = [];
    const full = (1 << n) - 1;
    for (let p = 0; p <= full; p++) {
      let ones = 0;
      for (let x = p; x; x &= x - 1) ones++;
      if (ones !== n / 2) continue;
      // ba bit 1 liền nhau: p & p>>1 & p>>2; ba bit 0 liền nhau: tương tự trên ~p trong n bit
      const q = ~p & full;
      if (p & (p >> 1) & (p >> 2)) continue;
      if (q & (q >> 1) & (q >> 2)) continue;
      out.push(p);
    }
    return (patCache[n] = out);
  }

  /** Đường đã đầy → dãy bit; còn ô trống → -1. */
  function lineBits(cells, line) {
    let p = 0;
    for (let j = 0; j < line.length; j++) {
      const v = cells[line[j]];
      if (v < 0) return -1;
      if (v === 1) p |= 1 << j;
    }
    return p;
  }

  /* ---------------- Kiểm luật ---------------- */

  /**
   * Các ô đang vi phạm luật (mảng chỉ số tăng dần): ba ô giống nhau liền nhau; mọi ô mang giá trị bị thừa
   * trong một đường (quá N/2); mọi ô của hai hàng / hai cột đầy giống nhau.
   */
  function conflicts(n, cells) {
    const bad = new Uint8Array(n * n);
    const ls = lines(n);
    const half = n / 2;
    ls.forEach((line) => {
      const cnt = [0, 0];
      for (let j = 0; j < n; j++) {
        const v = cells[line[j]];
        if (v >= 0) cnt[v]++;
        if (j >= 2 && v >= 0 && v === cells[line[j - 1]] && v === cells[line[j - 2]]) {
          bad[line[j]] = bad[line[j - 1]] = bad[line[j - 2]] = 1;
        }
      }
      [0, 1].forEach((v) => {
        if (cnt[v] > half) line.forEach((i) => { if (cells[i] === v) bad[i] = 1; });
      });
    });
    // Hai hàng (cột) đầy giống nhau
    [0, n].forEach((off) => {
      const bits = [];
      for (let k = 0; k < n; k++) bits.push(lineBits(cells, ls[off + k]));
      for (let a = 0; a < n; a++) {
        if (bits[a] < 0) continue;
        for (let b = a + 1; b < n; b++) {
          if (bits[a] === bits[b]) ls[off + a].concat(ls[off + b]).forEach((i) => { bad[i] = 1; });
        }
      }
    });
    const out = [];
    for (let i = 0; i < n * n; i++) if (bad[i]) out.push(i);
    return out;
  }

  /** Lưới đầy và đúng cả ba luật. */
  function isValidSolution(n, cells) {
    if (!cells || cells.length !== n * n) return false;
    for (let i = 0; i < n * n; i++) if (cells[i] !== 0 && cells[i] !== 1) return false;
    return conflicts(n, cells).length === 0;
  }

  /* ---------------- Suy luận (dùng cho sinh đề, gợi ý) ---------------- */

  /**
   * Tìm các ô suy ra được từ lưới hiện tại bằng luật cơ bản. Trả { i, v, kind } đầu tiên tìm thấy,
   * `false` nếu lưới mâu thuẫn, `null` nếu không suy được gì.
   *   - pair:  hai ô giống nhau liền nhau → hai ô hai đầu là giá trị kia
   *   - gap:   x _ x → ô giữa là giá trị kia
   *   - count: đường đã đủ N/2 của một giá trị → ô trống còn lại là giá trị kia
   */
  function basicStep(n, cells, ls) {
    const half = n / 2;
    for (let k = 0; k < ls.length; k++) {
      const line = ls[k];
      for (let j = 0; j + 1 < n; j++) {
        const a = cells[line[j]];
        const b = cells[line[j + 1]];
        if (a >= 0 && a === b) {
          if (j > 0 && cells[line[j - 1]] < 0) return { i: line[j - 1], v: 1 - a, kind: 'pair' };
          if (j + 2 < n && cells[line[j + 2]] < 0) return { i: line[j + 2], v: 1 - a, kind: 'pair' };
        }
        if (j + 2 < n && b < 0 && a >= 0 && a === cells[line[j + 2]]) return { i: line[j + 1], v: 1 - a, kind: 'gap' };
      }
    }
    for (let k = 0; k < ls.length; k++) {
      const line = ls[k];
      let c0 = 0;
      let c1 = 0;
      let empty = -1;
      for (let j = 0; j < n; j++) {
        const v = cells[line[j]];
        if (v === 0) c0++;
        else if (v === 1) c1++;
        else if (empty < 0) empty = line[j];
      }
      if (c0 > half || c1 > half) return false;
      if (empty >= 0 && c0 === half) return { i: empty, v: 1, kind: 'count' };
      if (empty >= 0 && c1 === half) return { i: empty, v: 0, kind: 'count' };
    }
    return null;
  }

  /**
   * Suy luận cả đường: liệt kê mọi dãy hợp lệ khớp với các ô đã điền (và khác mọi đường đầy cùng chiều);
   * ô nào mọi dãy đều cùng giá trị thì điền. Trả { i, v, kind: 'line' } | false (mâu thuẫn) | null.
   */
  function lineStep(n, cells, ls) {
    const pats = patterns(n);
    const full = (1 << n) - 1;
    for (let off = 0; off < 2 * n; off += n) {
      const done = [];
      for (let k = 0; k < n; k++) done.push(lineBits(cells, ls[off + k]));
      for (let k = 0; k < n; k++) {
        if (done[k] >= 0) continue;
        const line = ls[off + k];
        let mask = 0;
        let ones = 0;
        for (let j = 0; j < n; j++) {
          const v = cells[line[j]];
          if (v >= 0) {
            mask |= 1 << j;
            if (v === 1) ones |= 1 << j;
          }
        }
        let and = full;
        let or = 0;
        let any = false;
        for (let p = 0; p < pats.length; p++) {
          const x = pats[p];
          if ((x & mask) !== ones || done.indexOf(x) >= 0) continue;
          any = true;
          and &= x;
          or |= x;
        }
        if (!any) return false;
        const forced1 = and & ~mask;
        const forced = forced1 | (~or & ~mask & full);
        if (forced) {
          const j = 31 - Math.clz32(forced); // ô bị ép nào cũng được, lấy bit cao nhất
          return { i: line[j], v: (forced1 >> j) & 1, kind: 'line' };
        }
      }
    }
    return null;
  }

  /** Một bước suy luận ở mức `level` (1 cơ bản, 2 thêm cả đường). */
  function logicStep(n, cells, level) {
    const ls = lines(n);
    const s = basicStep(n, cells, ls);
    if (s !== null || level < 2) return s;
    return lineStep(n, cells, ls);
  }

  /**
   * Giải bằng suy luận tới khi bế tắc. Trả { solved, cells }. `solved` = lưới đầy và hợp lệ:
   * vì mọi bước đều là hệ quả bắt buộc, đi hết lưới nghĩa là đề có đúng một lời giải.
   */
  function logicSolve(n, start, level) {
    const cells = start.slice();
    for (;;) {
      const s = logicStep(n, cells, level);
      if (s === false) return { solved: false, cells };
      if (s === null) break;
      cells[s.i] = s.v;
    }
    return { solved: isValidSolution(n, cells), cells };
  }

  /* ---------------- Solver đếm nghiệm (quay lui, độc lập với bộ suy luận) ---------------- */

  /** Lan truyền luật cơ bản tại chỗ; trả false nếu mâu thuẫn (kể cả hai đường đầy trùng nhau). */
  function propagate(n, g, ls) {
    for (;;) {
      const s = basicStep(n, g, ls);
      if (s === false) return false;
      if (s === null) break;
      g[s.i] = s.v;
    }
    for (let i = 0; i < n * n; i++) if (g[i] < 0) return noDupes(n, g, ls);
    return conflicts(n, g).length === 0;
  }
  function noDupes(n, g, ls) {
    for (let off = 0; off < 2 * n; off += n) {
      const seen = {};
      for (let k = 0; k < n; k++) {
        const b = lineBits(g, ls[off + k]);
        if (b < 0) continue;
        if (seen[b]) return false;
        seen[b] = true;
      }
    }
    return true;
  }

  /** Đếm số lời giải của đề (dừng khi đạt `limit`, mặc định 2). */
  function countSolutions(n, puzzle, limit) {
    const lim = limit || 2;
    const ls = lines(n);
    let count = 0;
    (function dfs(g) {
      if (count >= lim) return;
      if (!propagate(n, g, ls)) return;
      // chọn ô trống thuộc đường có ít ô trống nhất
      let best = -1;
      let bestScore = Infinity;
      for (let k = 0; k < ls.length; k++) {
        let empty = 0;
        let first = -1;
        for (let j = 0; j < n; j++) {
          if (g[ls[k][j]] < 0) {
            empty++;
            if (first < 0) first = ls[k][j];
          }
        }
        if (empty > 0 && empty < bestScore) {
          bestScore = empty;
          best = first;
        }
      }
      if (best < 0) {
        count++;
        return;
      }
      for (let v = 0; v <= 1 && count < lim; v++) {
        const h = g.slice();
        h[best] = v;
        dfs(h);
      }
    })(Int8Array.from(puzzle));
    return count;
  }

  /* ---------------- Sinh đề ---------------- */

  /** Mức suy luận của mỗi cỡ: 6×6 (Dễ), 8×8 (Vừa) chỉ cần luật cơ bản; 10×10, 12×12 cần thêm suy luận cả đường. */
  const levelOf = (n) => (n <= 8 ? 1 : 2);

  /**
   * Lời giải ngẫu nhiên: dựng từng hàng từ các dãy hợp lệ, giữ luật theo cột, quay lui khi bí.
   * Quay lui ngẫu nhiên có đuôi dài (thỉnh thoảng sa vào nhánh chết rất sâu), nên giới hạn số nút
   * mỗi lần thử rồi làm lại từ đầu với dãy ngẫu nhiên tiếp theo: thời gian ổn định, vẫn tất định theo seed.
   */
  function randomSolution(n, r) {
    for (;;) {
      const cells = trySolution(n, r, 40 * n);
      if (cells) return cells;
    }
  }

  function trySolution(n, r, budget) {
    const pats = patterns(n);
    const full = (1 << n) - 1;
    const half = n / 2;
    const rows = [];
    const ones = new Array(n).fill(0);
    const ok = (p, k) => {
      if (rows.indexOf(p) >= 0) return false;
      if (k >= 2) {
        const a = rows[k - 1];
        const b = rows[k - 2];
        // cột có ba ô giống nhau liền nhau: hai hàng trên bằng nhau và bằng hàng mới
        if (~(a ^ b) & ~(a ^ p) & full) return false;
      }
      for (let c = 0; c < n; c++) {
        const o = ones[c] + ((p >> c) & 1);
        if (o > half || k + 1 - o > half) return false;
      }
      return true;
    };
    const colsDistinct = () => {
      const seen = {};
      for (let c = 0; c < n; c++) {
        let b = 0;
        for (let k = 0; k < n; k++) b |= ((rows[k] >> c) & 1) << k;
        if (seen[b]) return false;
        seen[b] = true;
      }
      return true;
    };
    let nodes = 0;
    const found = (function dfs(k) {
      if (k === n) return colsDistinct();
      if (++nodes > budget) return false;
      const order = shuffle(pats.slice(), r);
      for (let t = 0; t < order.length; t++) {
        const p = order[t];
        if (!ok(p, k)) continue;
        rows.push(p);
        for (let c = 0; c < n; c++) ones[c] += (p >> c) & 1;
        if (dfs(k + 1)) return true;
        if (nodes > budget) return false; // hết lượt: bỏ cả lần thử này
        rows.pop();
        for (let c = 0; c < n; c++) ones[c] -= (p >> c) & 1;
      }
      return false;
    })(0);
    if (!found) return null;
    const cells = [];
    for (let k = 0; k < n; k++) for (let c = 0; c < n; c++) cells.push((rows[k] >> c) & 1);
    return cells;
  }

  /** Sinh { puzzle, solution } theo seed: bỏ ô cho sẵn theo thứ tự ngẫu nhiên khi đề vẫn suy ra được. */
  function generate(n, seed) {
    const r = rng(seed);
    const solution = randomSolution(n, r);
    const level = levelOf(n);
    const puzzle = solution.slice();
    const order = shuffle(Array.from({ length: n * n }, (_, i) => i), r);
    order.forEach((i) => {
      const v = puzzle[i];
      puzzle[i] = -1;
      if (!logicSolve(n, puzzle, level).solved) puzzle[i] = v;
    });
    return { puzzle, solution };
  }

  /* ---------------- Ván ---------------- */

  /** Ván từ đề có sẵn (dùng cho test và khôi phục). */
  function fromPuzzle({ size, seed, puzzle, solution }) {
    return { size, seed, puzzle: puzzle.slice(), solution: solution.slice(), cells: puzzle.slice(), undo: [], redo: [], moves: 0, hints: 0 };
  }

  function newGame({ size, seed }) {
    const n = SIZES.indexOf(size) >= 0 ? size : 6;
    const s = (Number(seed) >>> 0) || 1;
    return fromPuzzle(Object.assign({ size: n, seed: s }, generate(n, s)));
  }

  const isGiven = (g, i) => g.puzzle[i] !== -1;
  const emptyCount = (g) => g.cells.reduce((s, v) => s + (v < 0 ? 1 : 0), 0);
  const isSolved = (g) => isValidSolution(g.size, g.cells);

  /** Áp một thay đổi ô (không đụng lịch sử). */
  function withCell(g, i, v, patch) {
    const cells = g.cells.slice();
    cells[i] = v;
    return Object.assign({}, g, { cells, moves: g.moves + 1 }, patch);
  }

  /** Đặt ô i = v (-1 xóa). Ô cho sẵn, ô ngoài lưới, giá trị lạ, không đổi gì hoặc ván đã xong → trả ván cũ. */
  function setCell(g, i, v) {
    if (!Number.isInteger(i) || i < 0 || i >= g.cells.length || isGiven(g, i)) return g;
    if (v !== -1 && v !== 0 && v !== 1) return g;
    if (g.cells[i] === v || isSolved(g)) return g;
    return withCell(g, i, v, { undo: g.undo.concat([[i, g.cells[i], v]]), redo: [] });
  }

  /** Chạm: trống → 0 → 1 → trống (dir = -1: chiều ngược lại). */
  function cycle(g, i, dir) {
    const cur = g.cells[i];
    const next = dir === -1 ? (cur === -1 ? 1 : cur === 1 ? 0 : -1) : cur === -1 ? 0 : cur === 0 ? 1 : -1;
    return setCell(g, i, next);
  }

  function undo(g) {
    if (!g.undo.length || isSolved(g)) return g;
    const m = g.undo[g.undo.length - 1];
    return withCell(g, m[0], m[1], { undo: g.undo.slice(0, -1), redo: g.redo.concat([m]) });
  }

  function redo(g) {
    if (!g.redo.length || isSolved(g)) return g;
    const m = g.redo[g.redo.length - 1];
    return withCell(g, m[0], m[2], { undo: g.undo.concat([m]), redo: g.redo.slice(0, -1) });
  }

  /**
   * Gợi ý một ô: còn ô sai so với lời giải thì sửa ô sai đầu tiên (kind 'fix'); không thì điền ô suy ra
   * được từ lưới hiện tại (kind = luật đã dùng: pair / gap / count / line), bí thì điền ô trống đầu tiên
   * ('guess'). Trả { game, i, kind } hoặc null khi đã giải xong. Gợi ý ghi vào lịch sử như một nước.
   */
  function hint(g) {
    if (isSolved(g)) return null;
    const apply = (i, kind) => {
      const v = g.solution[i];
      const game = withCell(g, i, v, { undo: g.undo.concat([[i, g.cells[i], v]]), redo: [], hints: g.hints + 1 });
      return { game, i, kind };
    };
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] >= 0 && g.cells[i] !== g.solution[i]) return apply(i, 'fix');
    const s = logicStep(g.size, g.cells, 2);
    if (s && g.solution[s.i] === s.v) return apply(s.i, s.kind);
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] < 0) return apply(i, 'guess');
    return null;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const enc = (cells) => cells.map((v) => (v < 0 ? '.' : String(v))).join('');
  const dec = (s, n, allowEmpty) => {
    if (typeof s !== 'string' || s.length !== n * n) return null;
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '0' || c === '1') out.push(Number(c));
      else if (c === '.' && allowEmpty) out.push(-1);
      else return null;
    }
    return out;
  };

  const toJSON = (g) => ({
    v: VERSION,
    size: g.size,
    seed: g.seed,
    puzzle: enc(g.puzzle),
    solution: enc(g.solution),
    cells: enc(g.cells),
    undo: g.undo.map((m) => m.slice()),
    redo: g.redo.map((m) => m.slice()),
    moves: g.moves,
    hints: g.hints,
  });

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const n = raw.size;
    if (SIZES.indexOf(n) < 0 || !Number.isInteger(raw.seed) || raw.seed < 0) return null;
    const puzzle = dec(raw.puzzle, n, true);
    const solution = dec(raw.solution, n, false);
    const cells = dec(raw.cells, n, true);
    if (!puzzle || !solution || !cells || !isValidSolution(n, solution)) return null;
    for (let i = 0; i < n * n; i++) {
      if (puzzle[i] >= 0 && (puzzle[i] !== solution[i] || cells[i] !== puzzle[i])) return null;
    }
    const nat = (x) => Number.isInteger(x) && x >= 0;
    if (!nat(raw.moves) || !nat(raw.hints)) return null;
    const hist = (h) => Array.isArray(h) && h.length <= MAX_HISTORY && h.every((m) =>
      Array.isArray(m) && m.length === 3 && Number.isInteger(m[0]) && m[0] >= 0 && m[0] < n * n && puzzle[m[0]] < 0 &&
      [-1, 0, 1].indexOf(m[1]) >= 0 && [-1, 0, 1].indexOf(m[2]) >= 0 && m[1] !== m[2]);
    if (!hist(raw.undo) || !hist(raw.redo)) return null;
    return {
      size: n,
      seed: raw.seed,
      puzzle,
      solution,
      cells,
      undo: raw.undo.map((m) => m.slice()),
      redo: raw.redo.map((m) => m.slice()),
      moves: raw.moves,
      hints: raw.hints,
    };
  }

  const api = {
    VERSION, SIZES, rng, patterns, lines, conflicts, isValidSolution, logicStep, logicSolve, countSolutions, levelOf, generate,
    fromPuzzle, newGame, isGiven, emptyCount, isSolved, setCell, cycle, undo, redo, hint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
