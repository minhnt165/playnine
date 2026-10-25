/* =====================================================================
 * Sao Chiến (Star Battle) - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới n x n chia thành n vùng. Đặt sao sao cho mỗi hàng, mỗi cột, mỗi vùng có đúng k sao
 *     và không hai sao nào kề nhau (kể cả chéo).
 *   - Mode: '5' (5x5, 1 sao), '8' (8x8, 1 sao), '10' (10x10, 2 sao), 'daily' (8x8, 1 sao, seed theo ngày).
 *   - Dấu của người chơi mỗi ô: EMPTY (trống), DOT (chấm loại trừ), STAR (sao), AUTO (chấm tự động quanh sao:
 *     hiện như chấm, bị gỡ khi sao sinh ra nó bị gỡ).
 *   - Thắng: các sao đúng luật (đề có đúng một nghiệm nên đó chính là lời giải); chấm không ảnh hưởng.
 *   - Sinh đề theo seed: đặt sao hợp lệ ngẫu nhiên → dựng vùng lớn dần quanh các sao (k = 2: dựng 2n vùng con
 *     rồi ghép cặp vùng kề nhau) → bộ giải đếm nghiệm (dừng ở 2); còn nghiệm khác thì chuyển một ô sao "lạ"
 *     của nghiệm đó sang vùng bên cạnh (nghiệm lạ hỏng, lời giải gốc vẫn đúng), lặp tới khi một nghiệm.
 *   - Hàm thuần: nhận ván cũ, trả ván mới; mỗi nước là một bước lịch sử gồm nhiều ô (chấm tự động, kéo chấm).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const MODES = {
    5: { n: 5, k: 1 },
    8: { n: 8, k: 1 },
    10: { n: 10, k: 2 },
    daily: { n: 8, k: 1 },
  };
  const MODE_KEYS = ['5', '8', '10', 'daily'];
  const EMPTY = 0;
  const DOT = 1;
  const STAR = 2;
  const AUTO = 3;
  const MAX_HISTORY = 20000; // chặn ván lưu phình bất thường

  /* ---------------- PRNG, băm chuỗi, ngày ---------------- */

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

  /** Băm FNV-1a 32 bit (seed của đề hằng ngày). */
  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dailySeed = (date) => hashString('saochien-daily-' + date);

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
  /** Ô kề cạnh (nb4) và ô kề cả chéo (nb8) của từng ô, lưu đệm theo n. */
  function geometry(n) {
    if (geoCache[n]) return geoCache[n];
    const nb4 = [];
    const nb8 = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const a = [];
      const b = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          b.push(rr * n + cc);
          if (!dr || !dc) a.push(rr * n + cc);
        }
      }
      nb4.push(a);
      nb8.push(b);
    }
    geoCache[n] = { nb4, nb8 };
    return geoCache[n];
  }

  /** Các ô của vùng `id` có liên thông (đi qua cạnh) không; `skip` = ô coi như đã bỏ khỏi vùng. */
  function regionConnected(n, regions, id, skip) {
    const { nb4 } = geometry(n);
    let start = -1;
    let total = 0;
    for (let i = 0; i < n * n; i++) {
      if (regions[i] === id && i !== skip) {
        total++;
        if (start < 0) start = i;
      }
    }
    if (total === 0) return false;
    const seen = new Uint8Array(n * n);
    const stack = [start];
    seen[start] = 1;
    let reached = 0;
    while (stack.length) {
      const u = stack.pop();
      reached++;
      for (const v of nb4[u]) {
        if (!seen[v] && v !== skip && regions[v] === id) {
          seen[v] = 1;
          stack.push(v);
        }
      }
    }
    return reached === total;
  }

  /** Bảng vùng hợp lệ: đủ n*n ô, id 0..n-1, vùng nào cũng có ô và liên thông. */
  function isValidRegions(n, regions) {
    if (!Array.isArray(regions) || regions.length !== n * n) return false;
    if (!regions.every((v) => Number.isInteger(v) && v >= 0 && v < n)) return false;
    for (let id = 0; id < n; id++) if (!regionConnected(n, regions, id, -1)) return false;
    return true;
  }

  /** Mảng sao (0/1) có đúng luật không: mỗi hàng / cột / vùng đúng k sao, không hai sao kề nhau. */
  function isValidStars(n, k, regions, stars) {
    const { nb8 } = geometry(n);
    const row = new Array(n).fill(0);
    const col = new Array(n).fill(0);
    const reg = new Array(n).fill(0);
    for (let i = 0; i < n * n; i++) {
      if (!stars[i]) continue;
      if (nb8[i].some((j) => stars[j])) return false;
      row[Math.floor(i / n)]++;
      col[i % n]++;
      reg[regions[i]]++;
    }
    for (let x = 0; x < n; x++) if (row[x] !== k || col[x] !== k || reg[x] !== k) return false;
    return true;
  }

  /* ---------------- Bộ giải: đếm nghiệm (dừng ở limit) ---------------- */
  // Trạng thái bộ giải là một Int8Array: [0, N) ô (0 chưa biết, 1 sao, 2 trống),
  // [N, N + U) số sao của từng đơn vị, [N + U, N + 2U) số ô chưa biết của từng đơn vị.
  // Đơn vị: n hàng, n cột, n vùng (U = 3n).

  function makeSolver(n, k, regions) {
    const N = n * n;
    const U = 3 * n;
    const ST = N;
    const UN = N + U;
    const { nb8 } = geometry(n);
    const unitCells = Array.from({ length: U }, () => []);
    const cellUnits = [];
    for (let i = 0; i < N; i++) {
      const us = [Math.floor(i / n), n + (i % n), 2 * n + regions[i]];
      cellUnits.push(us);
      us.forEach((u) => unitCells[u].push(i));
    }

    function initial() {
      const s = new Int8Array(N + 2 * U);
      for (let u = 0; u < U; u++) s[UN + u] = unitCells[u].length;
      return s;
    }

    /**
     * Gán ô i = v (1 sao, 2 trống) rồi suy luận lan truyền:
     * sao → 8 ô quanh trống; đơn vị đủ k sao → ô còn lại trống; số ô chưa biết vừa đủ → tất cả là sao.
     * Trả false khi mâu thuẫn.
     */
    function assign(s, i, v) {
      const stack = [i, v];
      while (stack.length) {
        const val = stack.pop();
        const c = stack.pop();
        if (s[c] !== 0) {
          if (s[c] !== val) return false;
          continue;
        }
        s[c] = val;
        const us = cellUnits[c];
        for (let x = 0; x < 3; x++) {
          const u = us[x];
          s[UN + u]--;
          if (val === 1) s[ST + u]++;
          const st = s[ST + u];
          const un = s[UN + u];
          if (st > k || st + un < k) return false;
          if (un > 0) {
            if (st === k) {
              for (const j of unitCells[u]) if (s[j] === 0) stack.push(j, 2);
            } else if (st + un === k) {
              for (const j of unitCells[u]) if (s[j] === 0) stack.push(j, 1);
            }
          }
        }
        if (val === 1) {
          for (const j of nb8[c]) {
            if (s[j] === 1) return false;
            if (s[j] === 0) stack.push(j, 2);
          }
        }
      }
      return true;
    }

    /** Đơn vị còn thiếu sao có ít ô chưa biết nhất (-1 khi mọi đơn vị đã đủ). */
    function tightest(s) {
      let best = -1;
      let score = 1e9;
      for (let u = 0; u < U; u++) {
        const need = k - s[ST + u];
        if (need <= 0) continue;
        const sc = s[UN + u] - need;
        if (sc < score) {
          score = sc;
          best = u;
        }
      }
      return best;
    }

    return { N, U, ST, UN, unitCells, cellUnits, initial, assign, tightest };
  }

  /**
   * Đếm nghiệm, dừng khi đủ `limit` (mặc định 2). `fixed` (tùy chọn): mảng trạng thái ban đầu theo ô
   * (0 chưa biết, 1 sao, 2 trống). Trả { count, solutions } (tối đa `limit` nghiệm, mỗi nghiệm mảng 0/1).
   */
  function countSolutions(n, k, regions, limit, fixed) {
    const S = makeSolver(n, k, regions);
    const max = limit || 2;
    const solutions = [];
    let s0 = S.initial();
    if (fixed) {
      for (let i = 0; i < S.N && s0; i++) if (fixed[i] && !S.assign(s0, i, fixed[i])) s0 = null;
    }

    function search(s) {
      const u = S.tightest(s);
      if (u < 0) {
        solutions.push(Array.from(s.subarray(0, S.N), (x) => (x === 1 ? 1 : 0)));
        return;
      }
      let cell = -1;
      for (const j of S.unitCells[u]) {
        if (s[j] === 0) {
          cell = j;
          break;
        }
      }
      for (const v of [1, 2]) {
        const next = s.slice();
        if (S.assign(next, cell, v)) search(next);
        if (solutions.length >= max) return;
      }
    }

    if (s0) search(s0);
    return { count: solutions.length, solutions };
  }

  /* ---------------- Sinh đề ---------------- */

  /** Mọi cách chọn k cột trong một hàng mà không hai cột nào kề nhau (lưu đệm). */
  const comboCache = {};
  function rowCombos(n, k) {
    const key = n + ':' + k;
    if (comboCache[key]) return comboCache[key];
    const out = [];
    const pick = (start, acc) => {
      if (acc.length === k) {
        out.push(acc.slice());
        return;
      }
      for (let c = start; c < n; c++) {
        acc.push(c);
        pick(c + 2, acc);
        acc.pop();
      }
    };
    pick(0, []);
    comboCache[key] = out;
    return out;
  }

  /** Đặt sao hợp lệ ngẫu nhiên (quay lui theo hàng); trả mảng 0/1 hoặc null khi quá số bước. */
  function placeStars(n, k, rand) {
    const combos = rowCombos(n, k);
    const colCount = new Array(n).fill(0);
    const rows = [];
    let steps = 0;
    function fill(r) {
      if (r === n) return true;
      if (++steps > 20000) return false;
      const prev = r > 0 ? rows[r - 1] : [];
      const rowsLeft = n - r - 1;
      for (const combo of shuffle(combos.slice(), rand)) {
        // Không kề sao hàng trên (kể cả chéo), cột chưa đủ k sao
        if (combo.some((c) => colCount[c] >= k || prev.some((p) => Math.abs(p - c) <= 1))) continue;
        combo.forEach((c) => colCount[c]++);
        // Cột nào còn thiếu nhiều hơn số hàng còn lại đặt được (không hai sao liền hàng trong một cột) thì bỏ
        let okCols = true;
        for (let c = 0; c < n && okCols; c++) if (k - colCount[c] > Math.ceil(rowsLeft / 2)) okCols = false;
        if (okCols) {
          rows[r] = combo;
          if (fill(r + 1)) return true;
        }
        combo.forEach((c) => colCount[c]--);
        if (steps > 20000) return false;
      }
      return false;
    }
    if (!fill(0)) return null;
    const stars = new Array(n * n).fill(0);
    rows.forEach((combo, r) => combo.forEach((c) => { stars[r * n + c] = 1; }));
    return stars;
  }

  /** Vùng lớn dần từ các hạt: mỗi bước lấy ngẫu nhiên một ô chưa có vùng kề một vùng, gán cho một vùng kề nó. */
  function grow(n, seeds, rand) {
    const N = n * n;
    const { nb4 } = geometry(n);
    const reg = new Array(N).fill(-1);
    seeds.forEach((cell, id) => { reg[cell] = id; });
    let left = N - seeds.length;
    while (left > 0) {
      const front = [];
      for (let i = 0; i < N; i++) if (reg[i] < 0 && nb4[i].some((j) => reg[j] >= 0)) front.push(i);
      const cell = front[Math.floor(rand() * front.length)];
      const ids = nb4[cell].filter((j) => reg[j] >= 0).map((j) => reg[j]);
      reg[cell] = ids[Math.floor(rand() * ids.length)];
      left--;
    }
    return reg;
  }

  /** Ghép cặp các vùng con kề nhau (quay lui ngẫu nhiên); trả mảng cặp của từng vùng hoặc null. */
  function pairRegions(n, sub, count, rand) {
    const { nb4 } = geometry(n);
    const adj = Array.from({ length: count }, () => new Set());
    for (let i = 0; i < n * n; i++) {
      for (const j of nb4[i]) if (sub[i] !== sub[j]) adj[sub[i]].add(sub[j]);
    }
    const lists = adj.map((s) => shuffle(Array.from(s), rand));
    const mate = new Array(count).fill(-1);
    let steps = 0;
    function match() {
      if (++steps > 5000) return false;
      // Vùng chưa ghép có ít lựa chọn nhất
      let u = -1;
      let best = 1e9;
      for (let x = 0; x < count; x++) {
        if (mate[x] >= 0) continue;
        const free = lists[x].filter((y) => mate[y] < 0).length;
        if (free < best) {
          best = free;
          u = x;
        }
      }
      if (u < 0) return true;
      for (const v of lists[u]) {
        if (mate[v] >= 0) continue;
        mate[u] = v;
        mate[v] = u;
        if (match()) return true;
        mate[u] = mate[v] = -1;
      }
      return false;
    }
    return match() ? mate : null;
  }

  /** Dựng vùng quanh lời giải: mỗi vùng chứa đúng k sao của lời giải. Trả mảng id vùng hoặc null. */
  function buildRegions(n, k, stars, rand) {
    const starCells = [];
    for (let i = 0; i < n * n; i++) if (stars[i]) starCells.push(i);
    const sub = grow(n, starCells, rand);
    if (k === 1) return sub;
    const mate = pairRegions(n, sub, starCells.length, rand);
    if (!mate) return null;
    const id = new Array(starCells.length).fill(-1);
    let next = 0;
    for (let x = 0; x < starCells.length; x++) {
      if (id[x] < 0) id[x] = id[mate[x]] = next++;
    }
    return sub.map((s) => id[s]);
  }

  /** Đánh lại id vùng theo thứ tự xuất hiện (hàng trên xuống, trái sang phải). */
  function normalize(regions) {
    const map = {};
    let next = 0;
    return regions.map((r) => {
      if (map[r] === undefined) map[r] = next++;
      return map[r];
    });
  }

  /**
   * Sửa vùng tới khi đề có một nghiệm: lấy một nghiệm khác lời giải, chọn ngẫu nhiên một ô sao của nghiệm đó
   * mà lời giải không có, chuyển ô sang một vùng kề (vùng cũ vẫn liên thông). Vùng cũ mất một sao của nghiệm lạ
   * nên nghiệm đó hỏng; lời giải gốc giữ nguyên vì ô chuyển không phải sao. Trả true nếu đã một nghiệm.
   */
  function repair(n, k, regions, stars, rand, maxIter) {
    const { nb4 } = geometry(n);
    for (let it = 0; it < maxIter; it++) {
      const r = countSolutions(n, k, regions, 2);
      if (r.count === 1) return true;
      const alt = r.solutions.find((s) => s.some((v, i) => v !== stars[i]));
      if (!alt) return false;
      const cand = [];
      for (let i = 0; i < n * n; i++) if (alt[i] && !stars[i]) cand.push(i);
      let moved = false;
      for (const c of shuffle(cand, rand)) {
        const others = [];
        for (const j of nb4[c]) if (regions[j] !== regions[c] && others.indexOf(regions[j]) < 0) others.push(regions[j]);
        if (!others.length || !regionConnected(n, regions, regions[c], c)) continue;
        regions[c] = others[Math.floor(rand() * others.length)];
        moved = true;
        break;
      }
      if (!moved) return false;
    }
    return false;
  }

  /** Sinh đề một nghiệm theo seed: trả { regions, solution } (tất định theo n, k, seed). */
  function generate(n, k, seed) {
    const rand = rng(seed);
    for (;;) {
      const stars = placeStars(n, k, rand);
      if (!stars) continue;
      for (let tries = 0; tries < 4; tries++) {
        const regions = buildRegions(n, k, stars, rand);
        if (!regions) continue;
        if (repair(n, k, regions, stars, rand, 6 * n)) return { regions: normalize(regions), solution: stars };
      }
    }
  }

  /* ---------------- Bộ đề sinh sẵn (10x10, 2 sao) ---------------- */
  // Sinh 10x10 hai sao ngay trên máy trung bình ~30 ms nhưng có đề tới ~230 ms (điện thoại chậm gấp ~10 lần),
  // nên cỡ này lấy từ puzzles.js (tools/build-puzzles.js sinh bằng chính generate ở trên). Seed chọn đề và một
  // trong 8 phép xoay / lật; xoay / lật giữ nguyên tính một nghiệm. Bộ giải chạy lại để lấy lời giải (~1 ms).

  let bank = null;
  function puzzleBank() {
    if (bank) return bank;
    try {
      bank = typeof module !== 'undefined' && module.exports ? require('./puzzles.js') : root.SAOCHIEN_PUZZLES;
    } catch (e) {
      bank = null;
    }
    return bank || {};
  }

  /** Ô (r, c) sau phép đối xứng t (0..7) của hình vuông n x n. */
  function transformCell(n, t, r, c) {
    const m = n - 1;
    switch (t) {
      case 1: return [c, m - r];
      case 2: return [m - r, m - c];
      case 3: return [m - c, r];
      case 4: return [r, m - c];
      case 5: return [m - r, c];
      case 6: return [c, r];
      case 7: return [m - c, m - r];
      default: return [r, c];
    }
  }

  function transformRegions(n, regions, t) {
    const out = new Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const [r, c] = transformCell(n, t, Math.floor(i / n), i % n);
      out[r * n + c] = regions[i];
    }
    return normalize(out);
  }

  /** Đề theo cỡ và seed: cỡ có bộ đề sinh sẵn thì chọn trong đó, không thì sinh ngay. Trả { regions, solution }. */
  function puzzleFor(n, k, seed) {
    const list = puzzleBank()[n + 'x' + k];
    if (!list || !list.length) return generate(n, k, seed);
    const rand = rng(seed);
    const pick = list[Math.floor(rand() * list.length)];
    const regions = transformRegions(n, pick.split('').map(Number), Math.floor(rand() * 8));
    const r = countSolutions(n, k, regions, 2);
    if (r.count !== 1) return generate(n, k, seed); // bộ đề hỏng (không xảy ra: test kiểm từng đề)
    return { regions, solution: r.solutions[0] };
  }

  /* ---------------- Ván chơi ---------------- */

  const isMode = (m) => MODE_KEYS.indexOf(m) >= 0;
  const isMark = (m) => m === EMPTY || m === DOT || m === STAR || m === AUTO;
  const isCell = (g, i) => Number.isInteger(i) && i >= 0 && i < g.n * g.n;
  /** Chấm tự động tính như chấm khi chơi. */
  const norm = (m) => (m === AUTO ? DOT : m);

  function make(base, marks, moves, hints, history, future) {
    return {
      mode: base.mode, n: base.n, k: base.k, seed: base.seed, date: base.date,
      regions: base.regions, solution: base.solution,
      marks, moves, hints, history, future,
    };
  }

  /** Ván mới: { mode, seed } hoặc đề hằng ngày { mode: 'daily', date: 'YYYY-MM-DD' } (seed theo ngày). */
  function newGame(o) {
    const mode = String(o && o.mode);
    if (!isMode(mode)) throw new Error('bad mode');
    const { n, k } = MODES[mode];
    let date = null;
    let seed = (o.seed >>> 0);
    if (mode === 'daily') {
      date = isDate(o.date) ? o.date : '2026-01-01';
      seed = dailySeed(date);
    }
    const { regions, solution } = puzzleFor(n, k, seed);
    const base = { mode, n, k, seed, date, regions, solution };
    return make(base, new Array(n * n).fill(EMPTY), 0, 0, [], []);
  }

  const starsOf = (g) => g.marks.map((m) => (m === STAR ? 1 : 0));
  const isWon = (g) => isValidStars(g.n, g.k, g.regions, starsOf(g));

  /** Áp một bước (danh sách [ô, dấu cũ, dấu mới]) thành nước mới; bước rỗng thì trả nguyên ván. */
  function commit(g, step, isHint) {
    if (!step.length) return g;
    const marks = g.marks.slice();
    step.forEach(([i, , b]) => { marks[i] = b; });
    return make(g, marks, g.moves + 1, g.hints + (isHint ? 1 : 0), g.history.concat([step]), []);
  }

  /**
   * Các thay đổi khi đặt dấu `mark` cho ô i:
   * - đặt sao và bật chấm tự động: ô trống quanh sao thành AUTO;
   * - gỡ sao: chấm tự động quanh nó không còn kề sao nào khác thì xóa.
   */
  function changesFor(g, i, mark, auto) {
    const { nb8 } = geometry(g.n);
    const cur = g.marks[i];
    const step = [[i, cur, mark]];
    if (mark === STAR && auto) {
      for (const j of nb8[i]) if (g.marks[j] === EMPTY) step.push([j, EMPTY, AUTO]);
    }
    if (cur === STAR && mark !== STAR) {
      for (const j of nb8[i]) {
        if (g.marks[j] !== AUTO) continue;
        if (!nb8[j].some((x) => x !== i && g.marks[x] === STAR)) step.push([j, AUTO, EMPTY]);
      }
    }
    return step;
  }

  /** Đặt dấu cho ô i (một nước, xóa nhánh làm lại). opts: { auto: chấm quanh sao, hint: nước gợi ý }. */
  function setMark(g, i, mark, opts) {
    const o = opts || {};
    if (!isCell(g, i) || !isMark(mark) || g.marks[i] === mark || isWon(g)) return g;
    return commit(g, changesFor(g, i, mark, !!o.auto), !!o.hint);
  }

  /** Thứ tự xoay vòng khi chạm: 'dot' = trống → chấm → sao → trống; 'star' = trống → sao → chấm → trống. */
  const CYCLE = {
    dot: { [EMPTY]: DOT, [DOT]: STAR, [STAR]: EMPTY },
    star: { [EMPTY]: STAR, [STAR]: DOT, [DOT]: EMPTY },
  };
  function tap(g, i, order, auto) {
    if (!isCell(g, i)) return g;
    const cyc = CYCLE[order] || CYCLE.dot;
    return setMark(g, i, cyc[norm(g.marks[i])], { auto });
  }

  /** Bật / tắt một dấu (phím X = chấm, S = sao, chuột phải = chấm): ô đang có dấu đó thì về trống. */
  function toggle(g, i, mark, auto) {
    if (!isCell(g, i)) return g;
    return setMark(g, i, norm(g.marks[i]) === mark ? EMPTY : mark, { auto });
  }

  /**
   * Kéo để đánh chấm hàng loạt (một nước): mark DOT = chấm các ô trống; mark EMPTY = xóa chấm. Sao không đổi.
   */
  function paint(g, cells, mark) {
    if (isWon(g) || (mark !== DOT && mark !== EMPTY)) return g;
    const step = [];
    const seen = {};
    for (const i of cells) {
      if (!isCell(g, i) || seen[i]) continue;
      seen[i] = 1;
      const cur = g.marks[i];
      if (mark === DOT && cur === EMPTY) step.push([i, EMPTY, DOT]);
      else if (mark === EMPTY && (cur === DOT || cur === AUTO)) step.push([i, cur, EMPTY]);
    }
    return commit(g, step, false);
  }

  const canUndo = (g) => g.history.length > 0 && !isWon(g);
  const canRedo = (g) => g.future.length > 0 && !isWon(g);

  /** Hoàn tác một nước (không trừ số nước đã đi: bỏ ván sau khi hoàn tác hết vẫn là ván đã chơi). */
  function undo(g) {
    if (!canUndo(g)) return g;
    const step = g.history[g.history.length - 1];
    const marks = g.marks.slice();
    for (let x = step.length - 1; x >= 0; x--) marks[step[x][0]] = step[x][1];
    return make(g, marks, g.moves, g.hints, g.history.slice(0, -1), g.future.concat([step]));
  }

  function redo(g) {
    if (!canRedo(g)) return g;
    const step = g.future[g.future.length - 1];
    const marks = g.marks.slice();
    step.forEach(([i, , b]) => { marks[i] = b; });
    return make(g, marks, g.moves, g.hints, g.history.concat([step]), g.future.slice(0, -1));
  }

  /**
   * Đếm và lỗi theo dấu hiện tại:
   * - rowStars / colStars / regionStars: số sao từng hàng / cột / vùng;
   * - rowLeft / colLeft: số sao còn thiếu (âm = thừa);
   * - adjacent: ô sao có sao kề (kể cả chéo);
   * - over: { rows, cols, regions } đơn vị thừa sao;
   * - blocked: { rows, cols, regions } đơn vị không còn đủ ô trống để đặt đủ sao (chấm quá tay);
   * - bad: ô sao vi phạm (kề sao khác hoặc nằm trong đơn vị thừa sao).
   */
  function status(g) {
    const { n, k, regions, marks } = g;
    const { nb8 } = geometry(n);
    const rowStars = new Array(n).fill(0);
    const colStars = new Array(n).fill(0);
    const regionStars = new Array(n).fill(0);
    const rowFree = new Array(n).fill(0);
    const colFree = new Array(n).fill(0);
    const regionFree = new Array(n).fill(0);
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      if (marks[i] === STAR) {
        rowStars[r]++;
        colStars[c]++;
        regionStars[regions[i]]++;
      } else if (marks[i] === EMPTY) {
        rowFree[r]++;
        colFree[c]++;
        regionFree[regions[i]]++;
      }
    }
    const pick = (cnt, free, over) => {
      const out = [];
      for (let x = 0; x < n; x++) if (over ? cnt[x] > k : cnt[x] <= k && cnt[x] + free[x] < k) out.push(x);
      return out;
    };
    const over = { rows: pick(rowStars, rowFree, true), cols: pick(colStars, colFree, true), regions: pick(regionStars, regionFree, true) };
    const blocked = { rows: pick(rowStars, rowFree, false), cols: pick(colStars, colFree, false), regions: pick(regionStars, regionFree, false) };
    const adjacent = [];
    const bad = [];
    for (let i = 0; i < n * n; i++) {
      if (marks[i] !== STAR) continue;
      const adj = nb8[i].some((j) => marks[j] === STAR);
      if (adj) adjacent.push(i);
      if (adj || over.rows.indexOf(Math.floor(i / n)) >= 0 || over.cols.indexOf(i % n) >= 0 || over.regions.indexOf(regions[i]) >= 0) bad.push(i);
    }
    return {
      rowStars, colStars, regionStars,
      rowLeft: rowStars.map((s) => k - s),
      colLeft: colStars.map((s) => k - s),
      adjacent, over, blocked, bad,
    };
  }

  /**
   * Gợi ý một ô (opts.auto như khi chơi):
   * 1. sửa lỗi: sao sai → chấm; chấm che mất sao của lời giải → sao;
   * 2. không có lỗi: một sao suy ra được bằng suy luận lan truyền từ các dấu hiện có;
   * 3. không suy ra được: đặt một sao của lời giải ở đơn vị còn ít ô trống nhất.
   * Trả { game, cell, kind: 'fix' | 'deduce' | 'reveal' } hoặc null khi đã thắng.
   */
  function hint(g, opts) {
    if (isWon(g)) return null;
    const auto = !!(opts && opts.auto);
    const N = g.n * g.n;
    const sol = g.solution;
    const done = (cell, mark, kind) => ({ game: setMark(g, cell, mark, { auto, hint: true }), cell, kind });
    for (let i = 0; i < N; i++) if (g.marks[i] === STAR && !sol[i]) return done(i, DOT, 'fix');
    for (let i = 0; i < N; i++) if ((g.marks[i] === DOT || g.marks[i] === AUTO) && sol[i]) return done(i, STAR, 'fix');
    // Mọi dấu hiện có đều đúng: suy luận từ đó
    const S = makeSolver(g.n, g.k, g.regions);
    const s = S.initial();
    for (let i = 0; i < N; i++) {
      if (g.marks[i] === STAR) S.assign(s, i, 1);
      else if (g.marks[i] !== EMPTY) S.assign(s, i, 2);
    }
    for (let i = 0; i < N; i++) if (s[i] === 1 && g.marks[i] !== STAR) return done(i, STAR, 'deduce');
    let cell = -1;
    let best = 1e9;
    for (let i = 0; i < N; i++) {
      if (!sol[i] || g.marks[i] === STAR) continue;
      const sc = Math.min.apply(null, S.cellUnits[i].map((u) => s[S.UN + u] - (g.k - s[S.ST + u])));
      if (sc < best) {
        best = sc;
        cell = i;
      }
    }
    return cell < 0 ? null : done(cell, STAR, 'reveal');
  }

  /** Tỉ lệ sao đã đặt đúng (cho thanh tiến độ trên cổng). */
  function progress(g) {
    let done = 0;
    for (let i = 0; i < g.n * g.n; i++) if (g.marks[i] === STAR && g.solution[i]) done++;
    return done / (g.n * g.k);
  }

  /* ---------------- Lưu ván ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    seed: g.seed,
    date: g.date,
    regions: g.regions.slice(),
    marks: g.marks.slice(),
    moves: g.moves,
    hints: g.hints,
    history: g.history.map((s) => s.map((c) => c.slice())),
    future: g.future.map((s) => s.map((c) => c.slice())),
  });

  /** Đọc lịch sử dạng [[[ô, dấu cũ, dấu mới], ...], ...]; sai thì null. */
  function readSteps(raw, N) {
    if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
    const out = [];
    for (const step of raw) {
      if (!Array.isArray(step) || !step.length || step.length > N) return null;
      const st = [];
      for (const c of step) {
        if (!Array.isArray(c) || c.length !== 3) return null;
        const [i, a, b] = c;
        if (!Number.isInteger(i) || i < 0 || i >= N || !isMark(a) || !isMark(b) || a === b) return null;
        st.push([i, a, b]);
      }
      out.push(st);
    }
    return out;
  }

  /** Ván lưu hỏng, khác phiên bản hoặc bảng vùng không có đúng một nghiệm thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { mode, seed, date, regions, marks, moves, hints } = raw;
    if (!isMode(mode)) return null;
    const { n, k } = MODES[mode];
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) return null;
    if (mode === 'daily' ? !isDate(date) || seed !== dailySeed(date) : date !== null) return null;
    const N = n * n;
    if (!isValidRegions(n, regions)) return null;
    if (!Array.isArray(marks) || marks.length !== N || !marks.every(isMark)) return null;
    if (!Number.isInteger(moves) || moves < 0 || !Number.isInteger(hints) || hints < 0 || hints > moves) return null;
    const history = readSteps(raw.history, N);
    const future = readSteps(raw.future, N);
    if (!history || !future) return null;
    const r = countSolutions(n, k, regions, 2);
    if (r.count !== 1) return null;
    const base = { mode, n, k, seed, date, regions: regions.slice(), solution: r.solutions[0] };
    return make(base, marks.slice(), moves, hints, history, future);
  }

  const api = {
    VERSION, MODES, MODE_KEYS, EMPTY, DOT, STAR, AUTO,
    rng, hashString, isDate, dailySeed, geometry,
    isValidRegions, isValidStars, countSolutions, placeStars, generate, puzzleBank, puzzleFor, transformRegions,
    newGame, setMark, tap, toggle, paint, undo, redo, canUndo, canRedo, isWon, status, hint, progress,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
