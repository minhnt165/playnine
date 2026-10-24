/* =====================================================================
 * Hitori - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới số n x n (n = 5 | 7 | 9). Tô đen một số ô sao cho:
 *     (1) giữa các ô không tô, không số nào lặp trong một hàng / cột;
 *     (2) hai ô đen không kề nhau theo cạnh;
 *     (3) mọi ô không tô liên thông (đi qua cạnh).
 *   - Dấu của người chơi mỗi ô: NONE (bình thường) → BLACK (tô đen) → CIRCLE (khoanh tròn: chắc chắn trắng)
 *   - Thắng: dấu hiện tại đúng ba luật trên (ô khoanh tròn tính là trắng).
 *   - Nghiệm khi đếm / sinh đề: ba luật + "ô đen nào cũng cần thiết" (số của nó còn ở một ô trắng cùng hàng
 *     hoặc cột). Đề có đúng một nghiệm như vậy; mọi cách tô hợp ba luật đều chứa nghiệm đó (tô thừa ô vô hại
 *     vẫn thắng, xem README).
 *   - Sinh đề theo seed: hình vuông Latin ngẫu nhiên → chọn ô đen (không kề, trắng liên thông) → đổi số ở ô đen
 *     thành số của một ô trắng cùng hàng / cột → bộ giải đếm nghiệm (dừng ở 2), chỉ nhận đề một nghiệm.
 *   - Hàm thuần: nhận ván cũ, trả ván mới; toJSON / fromJSON để lưu ván (ván lưu được giải lại để kiểm tra).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SIZES = [5, 7, 9];
  const NONE = 0;
  const BLACK = 1;
  const CIRCLE = 2;
  const MAX_HISTORY = 20000; // chặn ván lưu phình bất thường
  // Tỉ lệ ô đen của lời giải: đủ nhiều để có việc làm, đủ ít để còn chỗ cho luật liên thông
  const DENSITY = { 5: [0.28, 0.36], 7: [0.28, 0.34], 9: [0.27, 0.32] };

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

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /* ---------------- Hình học lưới ---------------- */

  const geoCache = {};
  /** Ô kề theo cạnh của từng ô (lưu đệm theo n). */
  function geometry(n) {
    if (geoCache[n]) return geoCache[n];
    const nb = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const out = [];
      if (r > 0) out.push(i - n);
      if (c > 0) out.push(i - 1);
      if (c < n - 1) out.push(i + 1);
      if (r < n - 1) out.push(i + n);
      nb.push(out);
    }
    geoCache[n] = { nb };
    return geoCache[n];
  }

  /** Các ô cùng hàng hoặc cùng cột có cùng số với ô i. */
  function peersOf(n, grid) {
    const peers = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = r * n + k;
        const b = k * n + c;
        if (a !== i && grid[a] === grid[i]) out.push(a);
        if (b !== i && grid[b] === grid[i]) out.push(b);
      }
      peers.push(out);
    }
    return peers;
  }

  /** Các ô không đen (shaded[i] falsy) có liên thông không. */
  function whitesConnected(n, shaded) {
    const { nb } = geometry(n);
    const N = n * n;
    let start = -1;
    let total = 0;
    for (let i = 0; i < N; i++) {
      if (!shaded[i]) {
        total++;
        if (start < 0) start = i;
      }
    }
    if (total === 0) return false;
    const seen = new Uint8Array(N);
    const stack = [start];
    seen[start] = 1;
    let reached = 0;
    while (stack.length) {
      const u = stack.pop();
      reached++;
      for (const v of nb[u]) {
        if (!seen[v] && !shaded[v]) {
          seen[v] = 1;
          stack.push(v);
        }
      }
    }
    return reached === total;
  }

  /** Cách tô (mảng 0/1) có đúng ba luật Hitori không. */
  function isValidShading(n, grid, shaded) {
    const { nb } = geometry(n);
    for (let i = 0; i < n * n; i++) {
      if (shaded[i] && nb[i].some((j) => shaded[j])) return false;
    }
    for (let k = 0; k < n; k++) {
      const row = {};
      const col = {};
      for (let m = 0; m < n; m++) {
        const a = k * n + m;
        const b = m * n + k;
        if (!shaded[a]) {
          if (row[grid[a]]) return false;
          row[grid[a]] = 1;
        }
        if (!shaded[b]) {
          if (col[grid[b]]) return false;
          col[grid[b]] = 1;
        }
      }
    }
    return whitesConnected(n, shaded);
  }

  /* ---------------- Bộ giải: đếm nghiệm (dừng ở limit) ---------------- */
  // Trạng thái ô trong bộ giải: 0 chưa biết, 1 đen, 2 trắng

  /**
   * Đếm nghiệm của đề (ba luật + ô đen phải cần thiết), dừng khi đủ `limit`.
   * Trả { count, solution } với solution là mảng 0/1 của nghiệm đầu tiên tìm được (null nếu không có).
   */
  function countSolutions(n, grid, limit) {
    const N = n * n;
    const { nb } = geometry(n);
    const peers = peersOf(n, grid);
    const max = limit || 2;
    let count = 0;
    let first = null;

    const disc = new Int16Array(N);
    const low = new Int16Array(N);

    /**
     * Tarjan trên đồ thị các ô không đen, gốc là một ô trắng:
     * - ô trắng không tới được từ gốc → mâu thuẫn (trả false);
     * - ô chưa biết không tới được → phải đen (nếu tô trắng nó sẽ bị cô lập);
     * - ô chưa biết là điểm khớp ngăn cách gốc với một ô trắng khác → phải trắng.
     * Ghi các ô bị ép vào `out` dưới dạng [ô, trạng thái].
     */
    function connectivity(st, out) {
      let rootCell = -1;
      let whites = 0;
      for (let i = 0; i < N; i++) {
        if (st[i] === 2) {
          whites++;
          if (rootCell < 0) rootCell = i;
        }
      }
      if (rootCell < 0) return true;
      disc.fill(-1);
      let time = 0;
      let reachedWhites = 0;
      // DFS đệ quy: độ sâu tối đa 81 ô
      function dfs(u) {
        disc[u] = low[u] = time++;
        let w = st[u] === 2 ? 1 : 0;
        if (w) reachedWhites++;
        let cut = false;
        for (const v of nb[u]) {
          if (st[v] === 1) continue;
          if (disc[v] < 0) {
            const cw = dfs(v);
            w += cw;
            if (low[v] < low[u]) low[u] = low[v];
            if (low[v] >= disc[u] && cw > 0) cut = true;
          } else if (disc[v] < low[u]) low[u] = disc[v];
        }
        if (cut && u !== rootCell && st[u] === 0) out.push([u, 2]);
        return w;
      }
      dfs(rootCell);
      if (reachedWhites < whites) return false;
      for (let i = 0; i < N; i++) if (st[i] === 0 && disc[i] < 0) out.push([i, 1]);
      return true;
    }

    /** Suy luận đến khi đứng yên; false nếu gặp mâu thuẫn. */
    function propagate(st) {
      for (;;) {
        let changed = false;
        for (let i = 0; i < N; i++) {
          const s = st[i];
          if (s === 1) {
            for (const j of nb[i]) {
              if (st[j] === 1) return false;
              if (st[j] === 0) {
                st[j] = 2;
                changed = true;
              }
            }
            // Ô đen phải cần thiết: còn ít nhất một ô cùng số, cùng hàng / cột, không đen
            let alive = 0;
            let last = -1;
            let hasWhite = false;
            for (const j of peers[i]) {
              if (st[j] === 2) {
                hasWhite = true;
                break;
              }
              if (st[j] === 0) {
                alive++;
                last = j;
              }
            }
            if (!hasWhite) {
              if (alive === 0) return false;
              if (alive === 1) {
                st[last] = 2;
                changed = true;
              }
            }
          } else if (s === 2) {
            for (const j of peers[i]) {
              if (st[j] === 2) return false;
              if (st[j] === 0) {
                st[j] = 1;
                changed = true;
              }
            }
          }
        }
        if (changed) continue;
        const forced = [];
        if (!connectivity(st, forced)) return false;
        if (!forced.length) return true;
        for (const [i, v] of forced) st[i] = v;
      }
    }

    function search(st) {
      if (!propagate(st)) return;
      // Rẽ nhánh ở ô chưa biết có nhiều ô trùng số nhất (ràng buộc chặt nhất)
      let best = -1;
      let score = -1;
      for (let i = 0; i < N; i++) {
        if (st[i] === 0 && peers[i].length > score) {
          score = peers[i].length;
          best = i;
        }
      }
      if (best < 0) {
        count++;
        if (!first) first = Array.from(st, (x) => (x === 1 ? 1 : 0));
        return;
      }
      for (const v of [1, 2]) {
        const next = st.slice();
        next[best] = v;
        search(next);
        if (count >= max) return;
      }
    }

    // Ô không trùng số với ô nào cùng hàng / cột thì không bao giờ phải tô: trắng ngay từ đầu
    const st = new Int8Array(N);
    for (let i = 0; i < N; i++) if (peers[i].length === 0) st[i] = 2;
    search(st);
    return { count, solution: first };
  }

  /* ---------------- Sinh đề ---------------- */

  /** Hình vuông Latin n x n ngẫu nhiên (điền từng ô, thứ tự số ngẫu nhiên, quay lui; quá bước thì làm lại). */
  function latinSquare(n, rand) {
    const N = n * n;
    for (;;) {
      const grid = new Array(N).fill(0);
      const rowUsed = Array.from({ length: n }, () => new Array(n + 1).fill(false));
      const colUsed = Array.from({ length: n }, () => new Array(n + 1).fill(false));
      const order = [];
      let steps = 0;
      let okFill = true;
      let i = 0;
      while (i < N) {
        const r = Math.floor(i / n);
        const c = i % n;
        if (!order[i]) {
          order[i] = shuffle(Array.from({ length: n }, (_, k) => k + 1), rand);
          order[i].pos = 0;
        }
        if (grid[i]) {
          rowUsed[r][grid[i]] = colUsed[c][grid[i]] = false;
          grid[i] = 0;
        }
        let placed = false;
        while (order[i].pos < n) {
          const v = order[i][order[i].pos++];
          if (!rowUsed[r][v] && !colUsed[c][v]) {
            grid[i] = v;
            rowUsed[r][v] = colUsed[c][v] = true;
            placed = true;
            break;
          }
        }
        if (placed) i++;
        else {
          order[i] = null;
          i--;
          if (i < 0 || ++steps > 4000) {
            okFill = false;
            break;
          }
        }
      }
      if (okFill) return grid;
    }
  }

  /** Chọn ô đen ngẫu nhiên: không kề nhau, các ô còn lại liên thông. */
  function pickBlacks(n, rand) {
    const N = n * n;
    const { nb } = geometry(n);
    const [lo, hi] = DENSITY[n] || [0.28, 0.33];
    const target = Math.round(N * (lo + rand() * (hi - lo)));
    const shaded = new Array(N).fill(0);
    let count = 0;
    for (const i of shuffle(Array.from({ length: N }, (_, k) => k), rand)) {
      if (count >= target) break;
      if (nb[i].some((j) => shaded[j])) continue;
      shaded[i] = 1;
      if (whitesConnected(n, shaded)) count++;
      else shaded[i] = 0;
    }
    return shaded;
  }

  /** Số ở ô đen đổi thành số của một ô trắng ngẫu nhiên cùng hàng hoặc cột (để ô đen "cần thiết"). */
  function assignValues(n, latin, shaded, rand) {
    const grid = latin.slice();
    for (let i = 0; i < n * n; i++) {
      if (!shaded[i]) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      const pool = [];
      for (let k = 0; k < n; k++) {
        const a = r * n + k;
        const b = k * n + c;
        if (!shaded[a]) pool.push(latin[a]);
        if (!shaded[b]) pool.push(latin[b]);
      }
      grid[i] = pool[Math.floor(rand() * pool.length)];
    }
    return grid;
  }

  /** Sinh đề một nghiệm theo seed: trả { grid, solution }. */
  function generate(n, seed) {
    const rand = rng(seed);
    for (;;) {
      const latin = latinSquare(n, rand);
      for (let p = 0; p < 6; p++) {
        const shaded = pickBlacks(n, rand);
        for (let k = 0; k < 6; k++) {
          const grid = assignValues(n, latin, shaded, rand);
          const r = countSolutions(n, grid, 2);
          if (r.count === 1) return { grid, solution: r.solution };
        }
      }
    }
  }

  /* ---------------- Ván chơi ---------------- */

  const isSize = (n) => SIZES.indexOf(n) >= 0;
  const isMark = (m) => m === NONE || m === BLACK || m === CIRCLE;
  const isCell = (g, i) => Number.isInteger(i) && i >= 0 && i < g.n * g.n;

  function make(n, seed, grid, solution, marks, moves, hints, history, future) {
    return { n, seed, grid, solution, marks, moves, hints, history, future };
  }

  /** Ván mới cỡ `size` theo `seed`. */
  function newGame({ size, seed }) {
    if (!isSize(size)) throw new Error('bad size');
    const s = seed >>> 0;
    const { grid, solution } = generate(size, s);
    return make(size, s, grid, solution, new Array(size * size).fill(NONE), 0, 0, [], []);
  }

  const shadedOf = (g) => g.marks.map((m) => (m === BLACK ? 1 : 0));
  const isWon = (g) => isValidShading(g.n, g.grid, shadedOf(g));

  /** Đặt dấu `mark` cho ô i (một nước, xóa nhánh làm lại). Ván đã thắng hoặc nước không đổi gì: trả nguyên ván. */
  function setMark(g, i, mark, isHint) {
    if (!isCell(g, i) || !isMark(mark) || g.marks[i] === mark || isWon(g)) return g;
    const marks = g.marks.slice();
    const a = marks[i];
    marks[i] = mark;
    return make(g.n, g.seed, g.grid, g.solution, marks, g.moves + 1, g.hints + (isHint ? 1 : 0), g.history.concat([{ i, a, b: mark }]), []);
  }

  /** Chạm: bình thường → đen → khoanh tròn → bình thường. */
  const tap = (g, i) => (isCell(g, i) ? setMark(g, i, (g.marks[i] + 1) % 3) : g);
  /** Bật / tắt một dấu (phím X / O, chuột phải / nhấn giữ = khoanh tròn): ô đang có dấu đó thì về bình thường. */
  const toggle = (g, i, mark) => (isCell(g, i) ? setMark(g, i, g.marks[i] === mark ? NONE : mark) : g);

  const canUndo = (g) => g.history.length > 0 && !isWon(g);
  const canRedo = (g) => g.future.length > 0 && !isWon(g);

  /** Hoàn tác một nước (không trừ số nước đã đi: bỏ ván sau khi hoàn tác hết vẫn là ván đã chơi). */
  function undo(g) {
    if (!canUndo(g)) return g;
    const step = g.history[g.history.length - 1];
    const marks = g.marks.slice();
    marks[step.i] = step.a;
    return make(g.n, g.seed, g.grid, g.solution, marks, g.moves, g.hints, g.history.slice(0, -1), g.future.concat([step]));
  }

  function redo(g) {
    if (!canRedo(g)) return g;
    const step = g.future[g.future.length - 1];
    const marks = g.marks.slice();
    marks[step.i] = step.b;
    return make(g.n, g.seed, g.grid, g.solution, marks, g.moves, g.hints, g.history.concat([step]), g.future.slice(0, -1));
  }

  /**
   * Vi phạm luật theo dấu hiện tại (ô khoanh tròn và ô bình thường đều tính là trắng):
   * - adjacent: ô đen có ô đen kề cạnh;
   * - isolated: ô trắng nằm ngoài vùng trắng lớn nhất (bị ô đen cắt rời);
   * - dup: ô trắng còn trùng số với một ô trắng khác cùng hàng / cột (việc còn phải làm);
   * - must: ô chưa đánh dấu trùng số với một ô khoanh tròn cùng hàng / cột (chắc chắn phải tô);
   * - clash: hai ô khoanh tròn trùng số cùng hàng / cột (chắc chắn sai).
   */
  function violations(g) {
    const { n, grid, marks } = g;
    const N = n * n;
    const { nb } = geometry(n);
    const adjacent = [];
    const dupSet = new Uint8Array(N);
    const clashSet = new Uint8Array(N);
    const mustSet = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (marks[i] === BLACK && nb[i].some((j) => marks[j] === BLACK)) adjacent.push(i);
    }
    for (let k = 0; k < n; k++) {
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          [[k * n + a, k * n + b], [a * n + k, b * n + k]].forEach(([x, y]) => {
            if (marks[x] === BLACK || marks[y] === BLACK || grid[x] !== grid[y]) return;
            dupSet[x] = dupSet[y] = 1;
            if (marks[x] === CIRCLE && marks[y] === CIRCLE) clashSet[x] = clashSet[y] = 1;
            else if (marks[x] === CIRCLE) mustSet[y] = 1;
            else if (marks[y] === CIRCLE) mustSet[x] = 1;
          });
        }
      }
    }
    // Vùng trắng: giữ vùng lớn nhất (bằng nhau thì vùng gặp trước), các vùng khác là bị cô lập
    const comp = new Int16Array(N).fill(-1);
    const sizes = [];
    for (let s = 0; s < N; s++) {
      if (marks[s] === BLACK || comp[s] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [s];
      comp[s] = id;
      while (stack.length) {
        const u = stack.pop();
        size++;
        for (const v of nb[u]) {
          if (marks[v] !== BLACK && comp[v] < 0) {
            comp[v] = id;
            stack.push(v);
          }
        }
      }
      sizes.push(size);
    }
    let main = 0;
    sizes.forEach((sz, id) => { if (sz > sizes[main]) main = id; });
    const isolated = [];
    const dup = [];
    const must = [];
    const clash = [];
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0 && comp[i] !== main) isolated.push(i);
      if (dupSet[i]) dup.push(i);
      if (mustSet[i]) must.push(i);
      if (clashSet[i]) clash.push(i);
    }
    return { adjacent, isolated, dup, must, clash };
  }

  /**
   * Gợi ý một ô: sửa ô đánh dấu sai trước (đen mà phải trắng → khoanh tròn; khoanh tròn mà phải đen → tô đen),
   * không có thì tô một ô đen còn thiếu. Trả { game, cell } hoặc null khi đã thắng.
   */
  function hint(g) {
    if (isWon(g)) return null;
    const N = g.n * g.n;
    let cell = -1;
    let mark = NONE;
    for (let i = 0; i < N && cell < 0; i++) {
      if (g.marks[i] === BLACK && !g.solution[i]) {
        cell = i;
        mark = CIRCLE;
      } else if (g.marks[i] === CIRCLE && g.solution[i]) {
        cell = i;
        mark = BLACK;
      }
    }
    for (let i = 0; i < N && cell < 0; i++) {
      if (g.marks[i] === NONE && g.solution[i]) {
        cell = i;
        mark = BLACK;
      }
    }
    if (cell < 0) return null;
    return { game: setMark(g, cell, mark, true), cell };
  }

  /** Tỉ lệ ô đen của lời giải đã tô đúng (cho thanh tiến độ trên cổng). */
  function progress(g) {
    let need = 0;
    let done = 0;
    for (let i = 0; i < g.n * g.n; i++) {
      if (!g.solution[i]) continue;
      need++;
      if (g.marks[i] === BLACK) done++;
    }
    return need ? done / need : 0;
  }

  /* ---------------- Lưu ván ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    n: g.n,
    seed: g.seed,
    grid: g.grid.slice(),
    marks: g.marks.slice(),
    moves: g.moves,
    hints: g.hints,
    history: g.history.map((s) => [s.i, s.a, s.b]),
    future: g.future.map((s) => [s.i, s.a, s.b]),
  });

  /** Đọc lịch sử dạng [[ô, dấu cũ, dấu mới], ...]; sai thì null. */
  function readSteps(raw, N) {
    if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
    const out = [];
    for (const s of raw) {
      if (!Array.isArray(s) || s.length !== 3) return null;
      const [i, a, b] = s;
      if (!Number.isInteger(i) || i < 0 || i >= N || !isMark(a) || !isMark(b) || a === b) return null;
      out.push({ i, a, b });
    }
    return out;
  }

  /** Ván lưu hỏng, khác phiên bản hoặc lưới không có đúng một nghiệm thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { n, seed, grid, marks, moves, hints } = raw;
    if (!isSize(n) || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) return null;
    const N = n * n;
    if (!Array.isArray(grid) || grid.length !== N || !grid.every((v) => Number.isInteger(v) && v >= 1 && v <= n)) return null;
    if (!Array.isArray(marks) || marks.length !== N || !marks.every(isMark)) return null;
    if (!Number.isInteger(moves) || moves < 0 || !Number.isInteger(hints) || hints < 0 || hints > moves) return null;
    const history = readSteps(raw.history, N);
    const future = readSteps(raw.future, N);
    if (!history || !future) return null;
    const r = countSolutions(n, grid, 2);
    if (r.count !== 1) return null;
    return make(n, seed, grid.slice(), r.solution, marks.slice(), moves, hints, history, future);
  }

  const api = {
    VERSION, SIZES, NONE, BLACK, CIRCLE,
    rng, countSolutions, isValidShading, generate,
    newGame, setMark, tap, toggle, undo, redo, canUndo, canRedo, isWon, violations, hint, progress,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
