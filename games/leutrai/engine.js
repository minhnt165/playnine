/* =====================================================================
 * Lều Trại - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật (Tents and Trees):
 *   - Mỗi cây ghép với đúng một lều kề cạnh (trên / dưới / trái / phải) và ngược lại
 *   - Hai lều không được chạm nhau, kể cả chéo
 *   - Số ở đầu hàng / cột là số lều trong hàng / cột đó
 *   Ô người chơi: 0 trống, 1 lều, 2 cỏ (đánh dấu "chắc chắn không có lều"). Ô cây không sửa được.
 *   Đề sinh theo seed (PRNG mulberry32) và luôn có đúng một lời giải (solver đếm nghiệm, dừng ở 2).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const EMPTY = 0;
  const TENT = 1;
  const GRASS = 2;
  const MODES = ['s', 'm', 'l'];
  const SIZES = { s: 6, m: 8, l: 12 };
  // Số cây (= số lều) mỗi cỡ: khoảng 1/5 số ô như các bản Tents phổ biến
  const TREES = { 6: 7, 8: 12, 12: 28 };
  const HISTORY_CAP = 1000; // số bước lịch sử tối đa trong ván lưu (trong phiên thì không giới hạn)

  /* ---------------- PRNG ---------------- */

  /** mulberry32: seed số nguyên 32 bit → hàm r() trong [0, 1), kèm r.int(n). */
  function rng(seed) {
    let a = seed >>> 0;
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    return r;
  }

  /* ---------------- Lân cận ---------------- */

  const cache = {};
  /** Lân cận cạnh (orth) và lân cận 8 hướng (ring) của mỗi ô, tính một lần cho mỗi cỡ. */
  function geo(n) {
    if (cache[n]) return cache[n];
    const orth = [];
    const ring = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const o = [];
      const g = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          g.push(rr * n + cc);
          if (!dr || !dc) o.push(rr * n + cc);
        }
      }
      orth.push(o);
      ring.push(g);
    }
    cache[n] = { orth, ring };
    return cache[n];
  }

  /* ---------------- Ghép cây với lều ---------------- */

  /**
   * Có ghép được mỗi cây với một lều riêng kề cạnh không (đồ thị hai phía, thuật toán Kuhn).
   * tents: mảng chỉ số ô lều; số lều phải bằng số cây.
   */
  function canMatch(n, trees, tents) {
    const { orth } = geo(n);
    let nTrees = 0;
    for (let i = 0; i < n * n; i++) nTrees += trees[i] ? 1 : 0;
    if (nTrees !== tents.length) return false;
    const owner = new Map(); // ô cây → chỉ số lều đang ghép
    function tryTent(k, seen) {
      const nb = orth[tents[k]];
      for (let j = 0; j < nb.length; j++) {
        const tr = nb[j];
        if (trees[tr] !== 1 || seen.has(tr)) continue;
        seen.add(tr);
        if (!owner.has(tr) || tryTent(owner.get(tr), seen)) {
          owner.set(tr, k);
          return true;
        }
      }
      return false;
    }
    for (let k = 0; k < tents.length; k++) if (!tryTent(k, new Set())) return false;
    return true;
  }

  /* ---------------- Solver đếm nghiệm ---------------- */

  /**
   * Đếm số cách đặt lều thỏa luật (dừng khi đạt `limit`, mặc định 2). Nghiệm là tập ô lều;
   * hai cách ghép cây khác nhau cho cùng một tập lều tính là một nghiệm.
   * Trả { count, sol } với sol là mảng 0/1 của nghiệm đầu tiên (null nếu vô nghiệm).
   * Cách làm: lan truyền suy luận (đủ hàng / cột, quanh lều không có lều, cây chỉ còn một chỗ)
   * rồi rẽ nhánh ở cây ít chỗ nhất; khi đã quyết hết thì kiểm tra ghép cặp.
   */
  function solve(p, limit) {
    const lim = limit || 2;
    const n = p.n;
    const N = n * n;
    const { orth, ring } = geo(n);
    const trees = p.trees;
    const treeIdx = [];
    for (let i = 0; i < N; i++) if (trees[i]) treeIdx.push(i);
    // -1 chưa biết, 0 không có lều, 1 lều. Ô cây và ô không kề cây nào chắc chắn không có lều.
    const start = new Int8Array(N);
    for (let i = 0; i < N; i++) start[i] = !trees[i] && orth[i].some((j) => trees[j]) ? -1 : 0;
    let count = 0;
    let sol = null;

    function propagate(s) {
      let changed = true;
      while (changed) {
        changed = false;
        // Hàng / cột: đủ lều thì chỗ còn lại không có lều; vừa đủ chỗ thì chỗ còn lại đều là lều
        for (let line = 0; line < 2 * n; line++) {
          const isRow = line < n;
          const k = isRow ? line : line - n;
          const want = isRow ? p.rows[k] : p.cols[k];
          let t = 0;
          let u = 0;
          for (let m = 0; m < n; m++) {
            const v = s[isRow ? k * n + m : m * n + k];
            if (v === 1) t++;
            else if (v === -1) u++;
          }
          if (t > want || t + u < want) return false;
          if (u && (t === want || t + u === want)) {
            const fill = t === want ? 0 : 1;
            for (let m = 0; m < n; m++) {
              const i = isRow ? k * n + m : m * n + k;
              if (s[i] === -1) s[i] = fill;
            }
            changed = true;
          }
        }
        // Lều: 8 ô quanh không có lều
        for (let i = 0; i < N; i++) {
          if (s[i] !== 1) continue;
          const g = ring[i];
          for (let j = 0; j < g.length; j++) {
            if (s[g[j]] === 1) return false;
            if (s[g[j]] === -1) {
              s[g[j]] = 0;
              changed = true;
            }
          }
        }
        // Cây: cần ít nhất một lều kề cạnh; chỉ còn một chỗ thì chỗ đó là lều
        for (let k = 0; k < treeIdx.length; k++) {
          const nb = orth[treeIdx[k]];
          let t = 0;
          let u = 0;
          let last = -1;
          for (let j = 0; j < nb.length; j++) {
            const v = s[nb[j]];
            if (v === 1) t++;
            else if (v === -1) {
              u++;
              last = nb[j];
            }
          }
          if (!t && !u) return false;
          if (!t && u === 1) {
            s[last] = 1;
            changed = true;
          }
        }
      }
      return true;
    }

    function search(s) {
      if (count >= lim || !propagate(s)) return;
      // Rẽ nhánh: cây chưa có lều kề và ít chỗ trống nhất; không còn cây nào như vậy thì ô chưa biết đầu tiên
      let pick = -1;
      let best = 9;
      for (let k = 0; k < treeIdx.length; k++) {
        const nb = orth[treeIdx[k]];
        let t = 0;
        let u = 0;
        let first = -1;
        for (let j = 0; j < nb.length; j++) {
          const v = s[nb[j]];
          if (v === 1) t++;
          else if (v === -1) {
            u++;
            if (first < 0) first = nb[j];
          }
        }
        if (!t && u && u < best) {
          best = u;
          pick = first;
        }
      }
      if (pick < 0) pick = s.indexOf(-1);
      if (pick < 0) {
        const tents = [];
        for (let i = 0; i < N; i++) if (s[i] === 1) tents.push(i);
        if (canMatch(n, trees, tents)) {
          count++;
          if (!sol) sol = Array.from(s);
        }
        return;
      }
      const a = s.slice();
      a[pick] = 1;
      search(a);
      const b = s.slice();
      b[pick] = 0;
      search(b);
    }

    search(start);
    return { count, sol };
  }

  /* ---------------- Sinh đề ---------------- */

  /** Một bố cục ngẫu nhiên: lều không chạm nhau, mỗi lều kèm một cây kề cạnh. null nếu không đặt đủ. */
  function layout(n, want, r) {
    const N = n * n;
    const { orth, ring } = geo(n);
    const tents = new Array(N).fill(0);
    const trees = new Array(N).fill(0);
    const order = [];
    for (let i = 0; i < N; i++) order.push(i);
    for (let i = N - 1; i > 0; i--) {
      const j = r.int(i + 1);
      const x = order[i];
      order[i] = order[j];
      order[j] = x;
    }
    let placed = 0;
    for (let k = 0; k < N && placed < want; k++) {
      const c = order[k];
      if (tents[c] || trees[c] || ring[c].some((j) => tents[j])) continue;
      const spots = orth[c].filter((j) => !tents[j] && !trees[j]);
      if (!spots.length) continue;
      tents[c] = 1;
      trees[spots[r.int(spots.length)]] = 1;
      placed++;
    }
    return placed === want ? { tents, trees } : null;
  }

  /** Số lều mỗi hàng / cột. */
  function clues(n, tents) {
    const rows = new Array(n).fill(0);
    const cols = new Array(n).fill(0);
    for (let i = 0; i < n * n; i++) {
      if (!tents[i]) continue;
      rows[Math.floor(i / n)]++;
      cols[i % n]++;
    }
    return { rows, cols };
  }

  /**
   * Sinh đề cỡ n theo seed: thử bố cục ngẫu nhiên đến khi solver xác nhận đúng một nghiệm.
   * Trả { n, seed, trees, rows, cols, sol, tries }.
   */
  function generate(n, seed) {
    const want = TREES[n] || Math.round((n * n) / 5);
    const r = rng(seed);
    for (let tries = 1; ; tries++) {
      const lay = layout(n, want, r);
      if (!lay) continue;
      const { rows, cols } = clues(n, lay.tents);
      const res = solve({ n, trees: lay.trees, rows, cols }, 2);
      if (res.count === 1) return { n, seed: seed >>> 0, trees: lay.trees, rows, cols, sol: res.sol, tries };
    }
  }

  /* ---------------- Ván chơi ---------------- */

  /** Ván từ một đề có sẵn (đã có lời giải). */
  function fromPuzzle(mode, p) {
    return {
      mode,
      n: p.n,
      seed: p.seed >>> 0,
      trees: p.trees.slice(),
      rows: p.rows.slice(),
      cols: p.cols.slice(),
      sol: p.sol.slice(),
      marks: new Array(p.n * p.n).fill(EMPTY),
      past: [],
      future: [],
      moves: 0,
      hints: 0,
    };
  }

  /** Ván mới: mode 's' | 'm' | 'l', seed số nguyên 32 bit. */
  function newGame({ mode, seed }) {
    const m = SIZES[mode] ? mode : 's';
    return fromPuzzle(m, generate(SIZES[m], seed >>> 0));
  }

  /** Chạm theo vòng: trống → lều → cỏ → trống (dir -1 đi ngược, dùng cho chuột phải). */
  const nextMark = (v, dir) => (dir < 0 ? (v + 2) % 3 : (v + 1) % 3);

  /**
   * Áp một nước: danh sách { i, v } (ô, giá trị mới). Bỏ qua ô cây, ô ngoài bàn, giá trị lạ và ô không đổi.
   * Cả danh sách là một bước hoàn tác. Không có gì đổi thì trả lại chính g.
   */
  function apply(g, list, opts) {
    const changes = [];
    const marks = g.marks.slice();
    list.forEach(({ i, v }) => {
      if (!Number.isInteger(i) || i < 0 || i >= marks.length || g.trees[i]) return;
      if (v !== EMPTY && v !== TENT && v !== GRASS) return;
      if (marks[i] === v) return;
      changes.push([i, marks[i], v]);
      marks[i] = v;
    });
    if (!changes.length) return g;
    return Object.assign({}, g, {
      marks,
      past: g.past.concat([changes]),
      future: [],
      moves: g.moves + 1,
      hints: g.hints + (opts && opts.hint ? 1 : 0),
    });
  }

  const cycle = (g, i, dir) => (g.trees[i] ? g : apply(g, [{ i, v: nextMark(g.marks[i], dir || 1) }]));
  const setCells = (g, idxs, v) => apply(g, idxs.map((i) => ({ i, v })));

  function undo(g) {
    if (!g.past.length) return g;
    const step = g.past[g.past.length - 1];
    const marks = g.marks.slice();
    for (let k = step.length - 1; k >= 0; k--) marks[step[k][0]] = step[k][1];
    return Object.assign({}, g, { marks, past: g.past.slice(0, -1), future: g.future.concat([step]), moves: g.moves + 1 });
  }

  function redo(g) {
    if (!g.future.length) return g;
    const step = g.future[g.future.length - 1];
    const marks = g.marks.slice();
    step.forEach((ch) => { marks[ch[0]] = ch[2]; });
    return Object.assign({}, g, { marks, past: g.past.concat([step]), future: g.future.slice(0, -1), moves: g.moves + 1 });
  }

  /** Số lều và số ô còn trống (chưa đánh dấu, không phải cây) của từng hàng / cột. */
  function lineStats(g) {
    const n = g.n;
    const rowTents = new Array(n).fill(0);
    const colTents = new Array(n).fill(0);
    const rowFree = new Array(n).fill(0);
    const colFree = new Array(n).fill(0);
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      if (g.marks[i] === TENT) {
        rowTents[r]++;
        colTents[c]++;
      } else if (g.marks[i] === EMPTY && !g.trees[i]) {
        rowFree[r]++;
        colFree[c]++;
      }
    }
    return { rowTents, colTents, rowFree, colFree };
  }

  /** Trạng thái số đầu hàng / cột: 'over' (quá), 'done' (đủ), 'short' (không còn đủ chỗ), '' (đang thiếu). */
  function lineState(want, tents, free) {
    if (tents > want) return 'over';
    if (tents === want) return 'done';
    return tents + free < want ? 'short' : '';
  }

  /**
   * Lỗi vi phạm luật nhìn thấy được trên bàn (không so với lời giải, nên không tính là trợ giúp):
   * lều chạm lều, lều không kề cây nào, cây không còn chỗ cho lều. Trả mảng chỉ số ô lỗi (tăng dần).
   */
  function errors(g) {
    const n = g.n;
    const { orth, ring } = geo(n);
    const bad = [];
    for (let i = 0; i < n * n; i++) {
      if (g.marks[i] === TENT) {
        if (ring[i].some((j) => g.marks[j] === TENT) || !orth[i].some((j) => g.trees[j])) bad.push(i);
      } else if (g.trees[i]) {
        if (!orth[i].some((j) => !g.trees[j] && g.marks[j] !== GRASS)) bad.push(i);
      }
    }
    return bad;
  }

  /** Xong khi tập lều thỏa mọi luật (đề có đúng một nghiệm nên đây cũng là lời giải). */
  function isSolved(g) {
    const n = g.n;
    const { ring } = geo(n);
    const { rowTents, colTents } = lineStats(g);
    for (let k = 0; k < n; k++) if (rowTents[k] !== g.rows[k] || colTents[k] !== g.cols[k]) return false;
    const tents = [];
    for (let i = 0; i < n * n; i++) if (g.marks[i] === TENT) tents.push(i);
    if (tents.some((i) => ring[i].some((j) => g.marks[j] === TENT))) return false;
    return canMatch(n, g.trees, tents);
  }

  const tentCount = (g) => g.marks.reduce((s, v) => s + (v === TENT ? 1 : 0), 0);
  const treeCount = (g) => g.trees.reduce((s, v) => s + v, 0);

  /**
   * Gợi ý một bước (so với lời giải): bỏ lều đặt sai, rồi đổi cỏ đè lên chỗ có lều, rồi đặt một lều còn thiếu
   * (ưu tiên hàng / cột còn thiếu ít lều nhất). Trả { i, v, kind } hoặc null nếu đã đủ lều đúng.
   */
  function hint(g) {
    const N = g.n * g.n;
    for (let i = 0; i < N; i++) if (g.marks[i] === TENT && !g.sol[i]) return { i, v: EMPTY, kind: 'wrongTent' };
    for (let i = 0; i < N; i++) if (g.marks[i] === GRASS && g.sol[i]) return { i, v: TENT, kind: 'wrongGrass' };
    const { rowTents, colTents } = lineStats(g);
    let best = -1;
    let score = Infinity;
    for (let i = 0; i < N; i++) {
      if (!g.sol[i] || g.marks[i] === TENT) continue;
      const r = Math.floor(i / g.n);
      const c = i % g.n;
      const s = Math.min(g.rows[r] - rowTents[r], g.cols[c] - colTents[c]);
      if (s < score) {
        score = s;
        best = i;
      }
    }
    return best < 0 ? null : { i: best, v: TENT, kind: 'tent' };
  }

  /** Dùng một gợi ý: là một nước bình thường (hoàn tác được), đếm vào g.hints. */
  function useHint(g) {
    const h = hint(g);
    return h ? apply(g, [{ i: h.i, v: h.v }], { hint: true }) : g;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const trimHistory = (a) => (a.length > HISTORY_CAP ? a.slice(a.length - HISTORY_CAP) : a);

  /** Ván lưu: đề (cây, số hàng / cột), dấu của người chơi, lịch sử. Không lưu lời giải. */
  function toJSON(g) {
    return {
      v: VERSION,
      mode: g.mode,
      seed: g.seed,
      trees: g.trees.slice(),
      rows: g.rows.slice(),
      cols: g.cols.slice(),
      marks: g.marks.slice(),
      past: trimHistory(g.past),
      future: trimHistory(g.future),
      moves: g.moves,
      hints: g.hints,
    };
  }

  const isIntIn = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  function validHistory(h, N, trees) {
    return Array.isArray(h) && h.every((step) => Array.isArray(step) && step.length > 0 && step.every((ch) =>
      Array.isArray(ch) && ch.length === 3 && isIntIn(ch[0], 0, N - 1) && !trees[ch[0]] &&
      isIntIn(ch[1], 0, 2) && isIntIn(ch[2], 0, 2) && ch[1] !== ch[2]));
  }

  /**
   * Khôi phục ván lưu. Hỏng, khác phiên bản, sai cỡ, hoặc đề không còn đúng một nghiệm thì trả null
   * (app chia ván mới). Lời giải tính lại bằng solver.
   */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !SIZES[raw.mode]) return null;
    const n = SIZES[raw.mode];
    const N = n * n;
    const { trees, rows, cols, marks, past, future, moves, hints } = raw;
    if (!isIntIn(raw.seed, 0, 4294967295)) return null;
    if (!Array.isArray(trees) || trees.length !== N || !trees.every((x) => x === 0 || x === 1)) return null;
    if (!Array.isArray(rows) || rows.length !== n || !rows.every((x) => isIntIn(x, 0, n))) return null;
    if (!Array.isArray(cols) || cols.length !== n || !cols.every((x) => isIntIn(x, 0, n))) return null;
    if (!Array.isArray(marks) || marks.length !== N || !marks.every((x, i) => isIntIn(x, 0, 2) && !(trees[i] && x))) return null;
    if (!validHistory(past, N, trees) || !validHistory(future, N, trees)) return null;
    if (!isIntIn(moves, 0, Number.MAX_SAFE_INTEGER) || !isIntIn(hints, 0, Number.MAX_SAFE_INTEGER)) return null;
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    const nTrees = sum(trees);
    if (!nTrees || sum(rows) !== nTrees || sum(cols) !== nTrees) return null;
    const res = solve({ n, trees, rows, cols }, 2);
    if (res.count !== 1) return null;
    return {
      mode: raw.mode,
      n,
      seed: raw.seed,
      trees: trees.slice(),
      rows: rows.slice(),
      cols: cols.slice(),
      sol: res.sol,
      marks: marks.slice(),
      past: past.map((s) => s.map((c) => c.slice())),
      future: future.map((s) => s.map((c) => c.slice())),
      moves,
      hints,
    };
  }

  const api = {
    VERSION, EMPTY, TENT, GRASS, MODES, SIZES, TREES,
    rng, geo, canMatch, solve, layout, clues, generate,
    fromPuzzle, newGame, nextMark, apply, cycle, setCells, undo, redo,
    lineStats, lineState, errors, isSolved, tentCount, treeCount, hint, useHint,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
