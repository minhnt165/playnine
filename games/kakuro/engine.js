/* =====================================================================
 * Kakuro - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn n x n (tính cả hàng / cột ô gợi ý); hàng 0 và cột 0 luôn là ô đen
 *   - Ô trắng điền 1..9; mỗi đoạn ngang / dọc (dãy ô trắng liền nhau) có tổng bằng số gợi ý
 *     ở ô đen ngay bên trái / bên trên, và không lặp số trong đoạn
 *   - Sinh đề: dựng khung đối xứng tâm → điền số ngẫu nhiên → leo đồi đổi từng chữ số tới khi chỉ
 *     lan truyền (không đoán) đã suy ra hết bàn, nên lời giải duy nhất và giải được bằng suy luận
 *   - Bộ giải đếm nghiệm (dừng ở `limit`): lan truyền theo tổ hợp còn hợp của từng đoạn, rồi quay lui
 *     ở ô ít khả năng nhất; test dùng nó để chứng minh đề sinh ra có đúng một nghiệm
 *   - Hàm thuần: nhận ván cũ, trả ván mới (hoàn tác / làm lại lưu dạng vá); toJSON / fromJSON để lưu ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /*
   * Ba cỡ (mode). n: cạnh bàn tính cả ô gợi ý; p: xác suất một cặp ô đối xứng bị tô đen lúc dựng khung;
   * maxRun: đoạn dài nhất; minWhite / maxWhite: số ô trắng chấp nhận (khung quá thưa hoặc quá đặc thì dựng lại).
   */
  const MODES = {
    s: { n: 6, p: 0.16, maxRun: 4, minWhite: 14, maxWhite: 20 },
    m: { n: 8, p: 0.2, maxRun: 5, minWhite: 28, maxWhite: 38 },
    l: { n: 10, p: 0.22, maxRun: 6, minWhite: 46, maxWhite: 62 },
  };
  const MODE_KEYS = Object.keys(MODES);
  const isMode = (m) => MODE_KEYS.indexOf(m) >= 0;

  /* ---------------- PRNG ---------------- */

  /** Băm chuỗi / số thành seed 32 bit (FNV-1a cho chuỗi). */
  function toSeed(x) {
    if (typeof x === 'number' && isFinite(x)) return x >>> 0;
    const s = String(x);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** PRNG mulberry32: cùng seed ra cùng dãy số trong [0, 1); r.int(n) → 0..n-1. */
  function rng(seed) {
    let a = toSeed(seed);
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    return r;
  }

  function shuffle(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      const x = arr[i];
      arr[i] = arr[j];
      arr[j] = x;
    }
    return arr;
  }

  /* ---------------- Tổ hợp ---------------- */
  // Tập chữ số dạng mặt nạ bit: chữ số d ứng với bit (d - 1); 9 bit, 0..511

  const bit = (d) => 1 << (d - 1);
  const POP = new Uint8Array(512);
  const MSUM = new Uint8Array(512);
  for (let m = 1; m < 512; m++) {
    POP[m] = POP[m >> 1] + (m & 1);
    MSUM[m] = MSUM[m & (m - 1)] + (31 - Math.clz32(m & -m)) + 1;
  }
  /** COMBOS[len][sum] = mảng mặt nạ các tập len chữ số khác nhau có tổng sum. */
  const COMBOS = [];
  for (let len = 0; len <= 9; len++) {
    COMBOS.push([]);
    for (let s = 0; s <= 45; s++) COMBOS[len].push([]);
  }
  for (let m = 1; m < 512; m++) COMBOS[POP[m]][MSUM[m]].push(m);

  const digitsOf = (m) => {
    const out = [];
    for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
    return out;
  };

  /**
   * Các tổ hợp của một đoạn: len ô, tổng sum. Mỗi tổ hợp { digits, ok }; ok = false khi tổ hợp
   * không chứa đủ các chữ số đã điền (`placed`, mảng chữ số) nên không còn dùng được.
   */
  function combos(len, sum, placed) {
    if (!(len >= 1 && len <= 9 && sum >= 0 && sum <= 45)) return [];
    let need = 0;
    (placed || []).forEach((d) => { if (d >= 1 && d <= 9) need |= bit(d); });
    return COMBOS[len][sum].map((m) => ({ digits: digitsOf(m), ok: (m & need) === need }));
  }

  /* ---------------- Khung bàn ---------------- */

  /**
   * Tìm các đoạn của khung `white` (mảng 0/1, n*n). Đoạn: { dir: 'h' | 'v', clue: ô đen chứa gợi ý,
   * cells: [ô...] }. cellRuns[2*i] / [2*i+1] = chỉ số đoạn ngang / dọc chứa ô i (-1 nếu ô đen).
   */
  function findRuns(n, white) {
    const runs = [];
    const cellRuns = new Int16Array(2 * n * n).fill(-1);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (!white[i]) continue;
        if (c === 0 || !white[i - 1]) {
          const cells = [];
          for (let k = c; k < n && white[r * n + k]; k++) cells.push(r * n + k);
          cells.forEach((j) => { cellRuns[2 * j] = runs.length; });
          runs.push({ dir: 'h', clue: c > 0 ? i - 1 : -1, cells });
        }
        if (r === 0 || !white[i - n]) {
          const cells = [];
          for (let k = r; k < n && white[k * n + c]; k++) cells.push(k * n + c);
          cells.forEach((j) => { cellRuns[2 * j + 1] = runs.length; });
          runs.push({ dir: 'v', clue: r > 0 ? i - n : -1, cells });
        }
      }
    }
    return { runs, cellRuns };
  }

  /** Các ô trắng có liền một khối (đi ngang / dọc) không. */
  function connected(n, white) {
    const start = white.indexOf(1);
    if (start < 0) return false;
    const seen = new Uint8Array(n * n);
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    while (stack.length) {
      const i = stack.pop();
      count++;
      const r = Math.floor(i / n);
      const c = i % n;
      const next = [];
      if (r > 0) next.push(i - n);
      if (r < n - 1) next.push(i + n);
      if (c > 0) next.push(i - 1);
      if (c < n - 1) next.push(i + 1);
      next.forEach((j) => {
        if (white[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      });
    }
    return count === white.reduce((a, b) => a + b, 0);
  }

  /**
   * Khung hợp lệ: hàng 0 / cột 0 đen, mỗi ô trắng thuộc một đoạn ngang và một đoạn dọc dài 2..9,
   * các ô trắng liền một khối. (Không đòi đối xứng: đó chỉ là thẩm mỹ của bộ sinh.)
   */
  function validLayout(n, white) {
    if (!Number.isInteger(n) || n < 3 || !Array.isArray(white) || white.length !== n * n) return false;
    for (let i = 0; i < n * n; i++) {
      if (white[i] !== 0 && white[i] !== 1) return false;
      if (white[i] && (i < n || i % n === 0)) return false;
    }
    const { runs } = findRuns(n, white);
    if (runs.some((run) => run.cells.length < 2 || run.cells.length > 9)) return false;
    return connected(n, white);
  }

  /** Dựng khung ngẫu nhiên đối xứng tâm theo cỡ; dựng lại tới khi đạt điều kiện của cỡ đó. */
  function makeLayout(mode, r) {
    const cfg = MODES[mode];
    const n = cfg.n;
    const mirror = (i) => {
      const row = Math.floor(i / n);
      const col = i % n;
      return (n - row) * n + (n - col); // quay 180° quanh tâm phần trong (hàng / cột 1..n-1)
    };
    for (let attempt = 0; attempt < 500; attempt++) {
      const white = new Array(n * n).fill(0);
      for (let row = 1; row < n; row++) for (let col = 1; col < n; col++) white[row * n + col] = 1;
      for (let i = 0; i < n * n; i++) {
        if (!white[i] || mirror(i) < i) continue;
        if (r() < cfg.p) white[i] = white[mirror(i)] = 0;
      }
      // Sửa: ô lẻ (đoạn dài 1) thì tô đen; đoạn quá dài thì cắt ở giữa; lặp tới khi ổn định
      for (let guard = 0; guard < 60; guard++) {
        const { runs } = findRuns(n, white);
        let changed = false;
        for (const run of runs) {
          if (!run.cells.every((i) => white[i])) continue; // đoạn đã bị sửa trong lượt này
          const len = run.cells.length;
          if (len === 1) {
            const i = run.cells[0];
            white[i] = white[mirror(i)] = 0;
            changed = true;
          } else if (len > cfg.maxRun) {
            // cắt ở vị trí 2..len-3 để hai nửa còn lại đều dài ít nhất 2
            const i = run.cells[2 + r.int(len - 4)];
            white[i] = white[mirror(i)] = 0;
            changed = true;
          }
        }
        if (!changed) break;
      }
      const count = white.reduce((a, b) => a + b, 0);
      if (count < cfg.minWhite || count > cfg.maxWhite) continue;
      const { runs } = findRuns(n, white);
      if (runs.some((run) => run.cells.length < 2 || run.cells.length > cfg.maxRun)) continue;
      if (!connected(n, white)) continue;
      return white;
    }
    return null;
  }

  /* ---------------- Bộ giải ---------------- */

  /**
   * Đếm nghiệm của đề (khung + tổng mỗi đoạn), dừng khi đủ `limit` (mặc định 2).
   * sums[k] = tổng của đoạn thứ k theo findRuns; `info` (tùy chọn) = kết quả findRuns dùng lại cho đỡ tính.
   * limit = -1: chỉ lan truyền, không rẽ nhánh, trả thêm `unresolved` (các ô chưa suy ra được).
   * Trả { count, solution (nghiệm đầu), other (nghiệm thứ hai), nodes }.
   * Mỗi nút: lan truyền tới khi ổn định (tổ hợp còn hợp của từng đoạn → thu hẹp khả năng của ô; chữ số
   * bắt buộc chỉ còn một chỗ → đặt; ô chỉ còn một khả năng → đặt và gạch khỏi các ô cùng đoạn), rồi
   * rẽ nhánh ở ô ít khả năng nhất.
   */
  function solve(n, white, sums, limit, info) {
    const lim = limit || 2;
    const { runs, cellRuns } = info || findRuns(n, white);
    const R = runs.length;
    const runCells = runs.map((run) => run.cells);
    const runCombos = runs.map((run, k) => (COMBOS[run.cells.length] && COMBOS[run.cells.length][sums[k]]) || []);
    const cells = [];
    for (let i = 0; i < n * n; i++) if (white[i]) cells.push(i);
    const res = { count: 0, solution: null, other: null, nodes: 0 };
    if (runCombos.some((c) => !c.length)) return res;

    // Hàng đợi các đoạn cần xét lại (khả năng của một ô trong đoạn vừa đổi)
    const inQ = new Uint8Array(R);
    const queue = [];
    function touch(i) {
      const h = cellRuns[2 * i];
      const v = cellRuns[2 * i + 1];
      if (!inQ[h]) { inQ[h] = 1; queue.push(h); }
      if (!inQ[v]) { inQ[v] = 1; queue.push(v); }
    }

    /** Đặt chữ số d vào ô i: gạch d khỏi các ô trống cùng đoạn. false nếu mâu thuẫn. */
    function assign(st, i, d) {
      const b = bit(d);
      const h = cellRuns[2 * i];
      const v = cellRuns[2 * i + 1];
      if ((st.placed[h] | st.placed[v]) & b) return false;
      st.vals[i] = d;
      st.cand[i] = b;
      st.placed[h] |= b;
      st.placed[v] |= b;
      touch(i);
      for (let side = 0; side < 2; side++) {
        const list = runCells[side ? v : h];
        for (let x = 0; x < list.length; x++) {
          const j = list[x];
          if (st.vals[j] || !(st.cand[j] & b)) continue;
          st.cand[j] &= ~b;
          if (!st.cand[j]) return false;
          touch(j);
        }
      }
      return true;
    }

    /** Xét lại một đoạn: thu hẹp khả năng các ô theo tổ hợp còn hợp; false nếu mâu thuẫn. */
    function reviseRun(st, k) {
      const { vals, cand } = st;
      const list = runCells[k];
      const p = st.placed[k];
      const combos = runCombos[k];
      let union = 0;
      let inter = 511;
      let any = false;
      for (let ci = 0; ci < combos.length; ci++) {
        const c = combos[ci];
        if ((c & p) !== p) continue;
        const rest = c & ~p;
        let cover = 0;
        let ok = true;
        for (let x = 0; x < list.length; x++) {
          const i = list[x];
          if (vals[i]) continue;
          const y = cand[i] & rest;
          if (!y) { ok = false; break; }
          cover |= y;
        }
        if (!ok || cover !== rest) continue;
        union |= rest;
        inter &= rest;
        any = true;
      }
      if (!any) return false;
      for (let x = 0; x < list.length; x++) {
        const i = list[x];
        if (vals[i]) continue;
        const y = cand[i] & union;
        if (!y) return false;
        if (y !== cand[i]) { cand[i] = y; touch(i); }
      }
      // Chữ số có mặt trong mọi tổ hợp còn hợp mà chỉ một ô nhận được → ô đó phải là nó
      let req = inter & union;
      while (req) {
        const b = req & -req;
        req ^= b;
        let only = -1;
        let cnt = 0;
        for (let x = 0; x < list.length; x++) {
          const i = list[x];
          if (!vals[i] && cand[i] & b) { cnt++; only = i; }
        }
        if (!cnt) return false;
        if (cnt === 1 && cand[only] !== b) { cand[only] = b; touch(only); }
      }
      return true;
    }

    function resetQueue(all) {
      queue.length = 0;
      inQ.fill(all ? 1 : 0);
      if (all) for (let k = 0; k < R; k++) queue.push(k);
    }

    /** Lan truyền tới khi ổn định: xét các đoạn trong hàng đợi, rồi đặt các ô chỉ còn một khả năng. */
    function propagate(st) {
      for (;;) {
        while (queue.length) {
          const k = queue.pop();
          inQ[k] = 0;
          if (!reviseRun(st, k)) return false;
        }
        let progressed = false;
        for (let x = 0; x < cells.length; x++) {
          const i = cells[x];
          if (st.vals[i] || POP[st.cand[i]] !== 1) continue;
          if (!assign(st, i, 32 - Math.clz32(st.cand[i]))) return false;
          progressed = true;
        }
        if (!progressed) return true;
      }
    }

    function dfs(st) {
      res.nodes++;
      if (!propagate(st)) return;
      let best = -1;
      let bestCount = 10;
      for (const i of cells) {
        if (st.vals[i]) continue;
        const c = POP[st.cand[i]];
        if (c < bestCount) { best = i; bestCount = c; }
      }
      if (lim < 0) {
        // Chỉ lan truyền, không rẽ nhánh: báo các ô chưa suy ra được (thước đo độ mơ hồ cho bộ sinh)
        res.unresolved = cells.filter((i) => !st.vals[i]);
        if (best < 0) res.count = 1;
        return;
      }
      if (best < 0) {
        res.count++;
        if (res.count === 1) res.solution = Array.from(st.vals);
        else if (res.count === 2) res.other = Array.from(st.vals);
        return;
      }
      const m = st.cand[best];
      for (let d = 1; d <= 9 && res.count < lim; d++) {
        if (!(m & bit(d))) continue;
        const next = { vals: st.vals.slice(), cand: st.cand.slice(), placed: st.placed.slice() };
        resetQueue(false);
        if (assign(next, best, d)) dfs(next);
      }
    }

    const start = { vals: new Int8Array(n * n), cand: new Int16Array(n * n), placed: new Int32Array(R) };
    for (const i of cells) start.cand[i] = 511;
    resetQueue(true);
    dfs(start);
    return res;
  }

  /** Tổng mỗi đoạn theo lời giải. */
  const sumsOf = (runs, sol) => runs.map((run) => run.cells.reduce((s, i) => s + sol[i], 0));

  /**
   * Điền chữ số ngẫu nhiên vào khung, không lặp trong đoạn (quay lui). Mỗi đoạn có "chiều" pol = -1 / +1:
   * ô thuộc hai đoạn cùng chiều nghiêng về chữ số nhỏ / lớn, nên tổng hay rơi về hai đầu (ít tổ hợp,
   * đề dễ có nghiệm duy nhất hơn nhiều so với điền đều). null nếu bế tắc quá lâu.
   */
  function fillDigits(n, white, runs, cellRuns, r) {
    const pol = runs.map(() => (r() < 0.5 ? -1 : 1));
    const cells = [];
    for (let i = 0; i < n * n; i++) if (white[i]) cells.push(i);
    const used = new Int32Array(runs.length);
    const sol = new Array(n * n).fill(0);
    let steps = 0;
    function go(j) {
      if (j === cells.length) return true;
      if (++steps > 20000) return false;
      const i = cells[j];
      const h = cellRuns[2 * i];
      const v = cellRuns[2 * i + 1];
      const p = pol[h] + pol[v];
      const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ d, w: -p * (d - 5) + r() * 2 - 1 })).sort((a, b) => b.w - a.w);
      for (const { d } of ds) {
        if ((used[h] | used[v]) & bit(d)) continue;
        used[h] |= bit(d);
        used[v] |= bit(d);
        sol[i] = d;
        if (go(j + 1)) return true;
        used[h] &= ~bit(d);
        used[v] &= ~bit(d);
        sol[i] = 0;
      }
      return false;
    }
    return go(0) ? sol : null;
  }

  const ITERS = { s: 300, m: 500, l: 500 }; // số lần thử đổi một chữ số trước khi bỏ khung

  /**
   * Sinh đề có lời giải duy nhất theo cỡ và seed (tất định). Leo đồi: đổi một chữ số ở ô chưa suy ra
   * được (hoặc ô cùng đoạn với nó), giữ thay đổi nếu số ô chưa suy ra được không tăng. Khi chỉ lan truyền
   * đã điền kín bàn thì nghiệm là duy nhất (lan truyền chỉ loại khả năng sai) và người giải được bằng suy luận,
   * không phải đoán. Trả { mode, n, white, sol } (sol: chữ số ở ô trắng, 0 ở ô đen).
   */
  function generate(mode, seed) {
    if (!isMode(mode)) throw new Error('mode không hợp lệ: ' + mode);
    const r = rng(seed);
    const n = MODES[mode].n;
    for (let attempt = 0; attempt < 100; attempt++) {
      const white = makeLayout(mode, r);
      if (!white) continue;
      const { runs, cellRuns } = findRuns(n, white);
      const sol = fillDigits(n, white, runs, cellRuns, r);
      if (!sol) continue;
      const info = { runs, cellRuns };
      const unresolved = () => solve(n, white, sumsOf(runs, sol), -1, info).unresolved;
      let un = unresolved();
      for (let it = 0; it < ITERS[mode] && un.length; it++) {
        let i = un[r.int(un.length)];
        if (r() < 0.5) {
          const cs = runs[cellRuns[2 * i + r.int(2)]].cells;
          i = cs[r.int(cs.length)];
        }
        let ban = 0;
        runs[cellRuns[2 * i]].cells.concat(runs[cellRuns[2 * i + 1]].cells).forEach((j) => {
          if (j !== i) ban |= bit(sol[j]);
        });
        const options = [];
        for (let d = 1; d <= 9; d++) if (!(ban & bit(d)) && d !== sol[i]) options.push(d);
        if (!options.length) continue;
        const old = sol[i];
        sol[i] = options[r.int(options.length)];
        const next = unresolved();
        if (next.length <= un.length) un = next;
        else sol[i] = old;
      }
      if (!un.length) return { mode, n, white, sol };
    }
    throw new Error('không sinh được đề ' + mode + ' với seed ' + seed);
  }

  /* ---------------- Ván chơi ---------------- */

  /** Gắn dữ liệu dẫn xuất của đề (đoạn kèm tổng, cellRuns) vào ván; phần này không lưu. */
  function build(base) {
    const { runs, cellRuns } = findRuns(base.n, base.white);
    const sums = sumsOf(runs, base.sol);
    runs.forEach((run, k) => { run.sum = sums[k]; });
    return Object.assign({}, base, { runs, cellRuns });
  }

  /** Ván mới: { mode, seed } → ván chưa điền gì. */
  function newGame(opts) {
    const mode = opts && isMode(opts.mode) ? opts.mode : 's';
    const seed = opts && opts.seed != null ? toSeed(opts.seed) : (Math.random() * 4294967296) >>> 0;
    const p = generate(mode, seed);
    const size = p.n * p.n;
    return build({
      mode,
      seed,
      n: p.n,
      white: p.white,
      sol: p.sol,
      vals: new Array(size).fill(0),
      notes: new Array(size).fill(0),
      moves: 0,
      hints: 0,
      undo: [],
      redo: [],
    });
  }

  const isWhite = (g, i) => Number.isInteger(i) && i >= 0 && i < g.n * g.n && g.white[i] === 1;
  const whiteCount = (g) => g.white.reduce((a, b) => a + b, 0);
  const filledCount = (g) => g.vals.reduce((a, v, i) => a + (g.white[i] && v ? 1 : 0), 0);
  /** Các ô cùng đoạn ngang hoặc dọc với ô i (không gồm i). */
  function peers(g, i) {
    const out = [];
    [g.cellRuns[2 * i], g.cellRuns[2 * i + 1]].forEach((k) => {
      if (k >= 0) g.runs[k].cells.forEach((j) => { if (j !== i && out.indexOf(j) < 0) out.push(j); });
    });
    return out;
  }

  /**
   * Áp một bản vá: patch = [[ô, giá trị mới, ghi chú mới], ...]. Lưu bản ngược vào undo, xóa redo.
   * Bản vá không đổi gì thì trả lại đúng ván cũ.
   */
  function applyPatch(g, patch) {
    const real = patch.filter(([i, v, m]) => g.vals[i] !== v || g.notes[i] !== m);
    if (!real.length) return g;
    const vals = g.vals.slice();
    const notes = g.notes.slice();
    const back = real.map(([i]) => [i, g.vals[i], g.notes[i]]);
    real.forEach(([i, v, m]) => {
      vals[i] = v;
      notes[i] = m;
    });
    return Object.assign({}, g, { vals, notes, moves: g.moves + 1, undo: g.undo.concat([back]), redo: [] });
  }

  /**
   * Điền chữ số d (1..9) vào ô i; d = 0 xóa số. Điền số thì xóa ghi chú của ô đó và gạch d khỏi
   * ghi chú các ô cùng đoạn (cùng một lần hoàn tác).
   */
  function setValue(g, i, d) {
    if (!isWhite(g, i) || !Number.isInteger(d) || d < 0 || d > 9 || isSolved(g)) return g;
    if (d === 0) return applyPatch(g, [[i, 0, g.notes[i]]]);
    const patch = [[i, d, 0]];
    peers(g, i).forEach((j) => {
      if (g.notes[j] & bit(d)) patch.push([j, g.vals[j], g.notes[j] & ~bit(d)]);
    });
    return applyPatch(g, patch);
  }

  /** Bật / tắt ghi chú d ở ô trống i. */
  function toggleNote(g, i, d) {
    if (!isWhite(g, i) || !Number.isInteger(d) || d < 1 || d > 9 || g.vals[i] || isSolved(g)) return g;
    return applyPatch(g, [[i, 0, g.notes[i] ^ bit(d)]]);
  }

  /** Xóa cả số và ghi chú của ô i. */
  function erase(g, i) {
    if (!isWhite(g, i) || isSolved(g)) return g;
    return applyPatch(g, [[i, 0, 0]]);
  }

  /** Hoàn tác / làm lại: chuyển bản vá giữa hai ngăn xếp. Trả ván mới, kèm `last` = các ô vừa đổi. */
  function shift(g, from, to) {
    if (!g[from].length || isSolved(g)) return g;
    const patch = g[from][g[from].length - 1];
    const vals = g.vals.slice();
    const notes = g.notes.slice();
    const back = patch.map(([i]) => [i, g.vals[i], g.notes[i]]);
    patch.forEach(([i, v, m]) => {
      vals[i] = v;
      notes[i] = m;
    });
    const out = Object.assign({}, g, { vals, notes, moves: g.moves + 1 });
    out[from] = g[from].slice(0, -1);
    out[to] = g[to].concat([back]);
    out.last = patch.map(([i]) => i);
    return out;
  }
  const undo = (g) => shift(g, 'undo', 'redo');
  const redo = (g) => shift(g, 'redo', 'undo');

  /** Ô nên gợi ý: ô `prefer` nếu đang trống / sai, không thì ô trống / sai đầu tiên. -1 nếu không còn. */
  function hintCell(g, prefer) {
    if (isWhite(g, prefer) && g.vals[prefer] !== g.sol[prefer]) return prefer;
    for (let i = 0; i < g.n * g.n; i++) if (g.white[i] && g.vals[i] !== g.sol[i]) return i;
    return -1;
  }

  /** Gợi ý: điền đúng chữ số của lời giải vào ô i (ván tính là có trợ giúp). */
  function hint(g, i) {
    if (!isWhite(g, i) || g.vals[i] === g.sol[i]) return g;
    const next = setValue(g, i, g.sol[i]);
    return next === g ? g : Object.assign({}, next, { hints: g.hints + 1 });
  }

  /**
   * Trạng thái theo luật (không nhìn lời giải): ô lặp số trong đoạn, đoạn sai tổng (đã đầy mà lệch,
   * hoặc chưa đầy mà đã đạt / vượt tổng), đoạn xong (đầy, đúng tổng, không lặp).
   */
  function check(g) {
    const dupCells = [];
    const badRuns = [];
    const doneRuns = [];
    g.runs.forEach((run, k) => {
      let s = 0;
      let filled = 0;
      let dup = false;
      const seen = {};
      run.cells.forEach((i) => {
        const v = g.vals[i];
        if (!v) return;
        s += v;
        filled++;
        if (seen[v] != null) {
          dup = true;
          if (dupCells.indexOf(i) < 0) dupCells.push(i);
          if (dupCells.indexOf(seen[v]) < 0) dupCells.push(seen[v]);
        } else seen[v] = i;
      });
      const full = filled === run.cells.length;
      if ((full && s !== run.sum) || (!full && s >= run.sum)) badRuns.push(k);
      else if (full && !dup) doneRuns.push(k);
    });
    return { dupCells, badRuns, doneRuns };
  }

  /** Thắng: mọi ô trắng đã điền, mọi đoạn đúng tổng và không lặp. */
  function isSolved(g) {
    for (let i = 0; i < g.n * g.n; i++) if (g.white[i] && !g.vals[i]) return false;
    return check(g).doneRuns.length === g.runs.length;
  }

  /** Bảng tổ hợp của đoạn k theo các số đã điền trong đoạn. */
  function runCombos(g, k) {
    const run = g.runs[k];
    if (!run) return [];
    return combos(run.cells.length, run.sum, run.cells.map((i) => g.vals[i]).filter((v) => v));
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    seed: g.seed,
    n: g.n,
    white: g.white.slice(),
    sol: g.sol.slice(),
    vals: g.vals.slice(),
    notes: g.notes.slice(),
    moves: g.moves,
    hints: g.hints,
    undo: g.undo,
    redo: g.redo,
  });

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  function validPatchList(list, size, white) {
    return Array.isArray(list) && list.every((p) => Array.isArray(p) && p.length > 0 && p.every((e) =>
      Array.isArray(e) && e.length === 3 && isInt(e[0], 0, size - 1) && white[e[0]] === 1 && isInt(e[1], 0, 9) && isInt(e[2], 0, 511)));
  }

  /** Ván lưu hỏng, khác phiên bản hoặc lời giải sai luật thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !isMode(raw.mode)) return null;
    const n = MODES[raw.mode].n;
    const size = n * n;
    if (raw.n !== n || !isInt(raw.seed, 0, 4294967295) || !isInt(raw.moves, 0, 1e7) || !isInt(raw.hints, 0, 1e6)) return null;
    const arr = (a, lo, hi) => Array.isArray(a) && a.length === size && a.every((x) => isInt(x, lo, hi));
    if (!arr(raw.white, 0, 1) || !arr(raw.sol, 0, 9) || !arr(raw.vals, 0, 9) || !arr(raw.notes, 0, 511)) return null;
    if (!validLayout(n, raw.white)) return null;
    for (let i = 0; i < size; i++) {
      if (raw.white[i] ? !raw.sol[i] : raw.sol[i] || raw.vals[i] || raw.notes[i]) return null;
    }
    // Lời giải phải đúng luật: không lặp số trong đoạn
    const { runs } = findRuns(n, raw.white);
    for (const run of runs) {
      let m = 0;
      for (const i of run.cells) {
        if (m & bit(raw.sol[i])) return null;
        m |= bit(raw.sol[i]);
      }
    }
    if (!validPatchList(raw.undo, size, raw.white) || !validPatchList(raw.redo, size, raw.white)) return null;
    return build({
      mode: raw.mode,
      seed: raw.seed,
      n,
      white: raw.white.slice(),
      sol: raw.sol.slice(),
      vals: raw.vals.slice(),
      notes: raw.notes.slice(),
      moves: raw.moves,
      hints: raw.hints,
      undo: raw.undo.map((p) => p.map((e) => e.slice())),
      redo: raw.redo.map((p) => p.map((e) => e.slice())),
    });
  }

  const api = {
    VERSION,
    MODES,
    MODE_KEYS,
    rng,
    toSeed,
    bit,
    combos,
    findRuns,
    validLayout,
    makeLayout,
    solve,
    sumsOf,
    generate,
    newGame,
    isWhite,
    whiteCount,
    filledCount,
    peers,
    setValue,
    toggleNote,
    erase,
    undo,
    redo,
    hintCell,
    hint,
    check,
    isSolved,
    runCombos,
    toJSON,
    fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
