/* =====================================================================
 * Chia Ô - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật Shikaku: chia lưới thành các hình chữ nhật, mỗi hình chứa đúng một số và diện tích bằng số đó.
 *   - Hình: { r, c, h, w } (hàng, cột góc trên trái, cao, rộng). Số (đề): { r, c, n }.
 *   - Ván: { mode, size, seed, clues, solution, rects, undo, redo, moves, hints }
 *     solution[k] là hình của số clues[k]; rects là các hình người chơi đã vẽ (không chồng nhau).
 *   - Mỗi nước (vẽ, xóa, xóa hết, gợi ý) là một bước { add: [...], del: [...] } để hoàn tác / làm lại.
 *   - Sinh đề: chia lưới ngẫu nhiên theo hạt giống, đặt số, rồi solver (Algorithm X / dancing links)
 *     đếm nghiệm đến 2; còn nghiệm khác thì dời một số sang ô làm nghiệm đó sai, lặp đến khi duy nhất.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const MODES = ['s', 'm', 'l'];
  const SIZES = { s: 7, m: 10, l: 13 };
  const WEIGHT_POW = 1; // trọng số chọn hình khi chia lưới = diện tích ^ WEIGHT_POW
  // Diện tích lớn nhất của một hình khi chia lưới, và cạnh dài nhất của hình mảnh (rộng hoặc cao 1)
  const SHAPE = {
    s: { maxA: 8, thin: 5 },
    m: { maxA: 12, thin: 6 },
    l: { maxA: 16, thin: 7 },
  };

  /* ---------------- Số ngẫu nhiên theo hạt giống (mulberry32) ---------------- */

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

  /* ---------------- Hình chữ nhật ---------------- */

  const area = (x) => x.h * x.w;
  const sameRect = (a, b) => a.r === b.r && a.c === b.c && a.h === b.h && a.w === b.w;
  const overlaps = (a, b) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w;
  const contains = (x, r, c) => r >= x.r && r < x.r + x.h && c >= x.c && c < x.c + x.w;
  const copyRect = (x) => ({ r: x.r, c: x.c, h: x.h, w: x.w });

  /** Hình chữ nhật có hai góc đối là hai ô a, b (thứ tự bất kỳ). */
  function rectFrom(a, b) {
    const r = Math.min(a.r, b.r);
    const c = Math.min(a.c, b.c);
    return { r, c, h: Math.abs(a.r - b.r) + 1, w: Math.abs(a.c - b.c) + 1 };
  }

  /** Hình nằm trọn trong lưới n x n, cạnh nguyên dương. */
  function validRect(n, x) {
    return !!x && [x.r, x.c, x.h, x.w].every(Number.isInteger) && x.h >= 1 && x.w >= 1 &&
      x.r >= 0 && x.c >= 0 && x.r + x.h <= n && x.c + x.w <= n;
  }

  /** Ô thuộc hình nào: mảng n*n, -1 = trống. Hình chồng nhau thì trả null. */
  function ownerGrid(n, rects) {
    const own = new Array(n * n).fill(-1);
    for (let k = 0; k < rects.length; k++) {
      const x = rects[k];
      for (let r = x.r; r < x.r + x.h; r++) {
        for (let c = x.c; c < x.c + x.w; c++) {
          if (own[r * n + c] >= 0) return null;
          own[r * n + c] = k;
        }
      }
    }
    return own;
  }

  /* ---------------- Solver: Algorithm X với dancing links ---------------- */

  /** Mọi hình ứng viên của từng số: đúng diện tích, chứa ô của số, không chứa số nào khác. */
  function candidates(n, clues) {
    const W = n + 1;
    const P = new Int32Array(W * W); // tổng tiền tố số lượng số trên lưới
    const at = new Int8Array(n * n);
    clues.forEach((q) => { at[q.r * n + q.c] = 1; });
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) P[(r + 1) * W + c + 1] = P[r * W + c + 1] + P[(r + 1) * W + c] - P[r * W + c] + at[r * n + c];
    }
    const count = (r, c, h, w) => P[(r + h) * W + c + w] - P[r * W + c + w] - P[(r + h) * W + c] + P[r * W + c];
    return clues.map((q) => {
      const list = [];
      for (let h = 1; h <= Math.min(n, q.n); h++) {
        if (q.n % h) continue;
        const w = q.n / h;
        if (w > n) continue;
        for (let r = Math.max(0, q.r - h + 1); r <= Math.min(q.r, n - h); r++) {
          for (let c = Math.max(0, q.c - w + 1); c <= Math.min(q.c, n - w); c++) {
            if (count(r, c, h, w) === 1) list.push({ r, c, h, w });
          }
        }
      }
      return list;
    });
  }

  /**
   * Tìm tối đa `limit` lời giải. Mỗi lời giải là mảng hình theo thứ tự số.
   * Cột: mỗi số một cột + mỗi ô một cột; hàng: một hình ứng viên (phủ cột số của nó và các ô).
   */
  function search(n, clues, limit) {
    const N2 = n * n;
    const K = clues.length;
    let sum = 0;
    clues.forEach((q) => { sum += q.n; });
    if (sum !== N2 || K === 0) return [];
    const cand = candidates(n, clues);
    const rows = [];
    cand.forEach((list, k) => list.forEach((x) => rows.push({ k, x })));

    const cols = K + N2;
    let total = cols + 1;
    rows.forEach((row) => { total += 1 + area(row.x); });
    const L = new Int32Array(total);
    const R = new Int32Array(total);
    const U = new Int32Array(total);
    const D = new Int32Array(total);
    const C = new Int32Array(total);
    const S = new Int32Array(cols + 1);
    const rowOf = new Int32Array(total);
    for (let i = 0; i <= cols; i++) {
      L[i] = i === 0 ? cols : i - 1;
      R[i] = i === cols ? 0 : i + 1;
      U[i] = D[i] = C[i] = i;
    }
    let next = cols + 1;
    const addNode = (col, ri, first) => {
      const x = next++;
      C[x] = col;
      rowOf[x] = ri;
      U[x] = U[col];
      D[x] = col;
      D[U[col]] = x;
      U[col] = x;
      S[col]++;
      if (first < 0) {
        L[x] = R[x] = x;
      } else {
        L[x] = L[first];
        R[x] = first;
        R[L[first]] = x;
        L[first] = x;
      }
      return x;
    };
    rows.forEach((row, ri) => {
      const first = addNode(1 + row.k, ri, -1);
      const x = row.x;
      for (let r = x.r; r < x.r + x.h; r++) {
        for (let c = x.c; c < x.c + x.w; c++) addNode(1 + K + r * n + c, ri, first);
      }
    });

    const cover = (c) => {
      L[R[c]] = L[c];
      R[L[c]] = R[c];
      for (let i = D[c]; i !== c; i = D[i]) {
        for (let j = R[i]; j !== i; j = R[j]) {
          U[D[j]] = U[j];
          D[U[j]] = D[j];
          S[C[j]]--;
        }
      }
    };
    const uncover = (c) => {
      for (let i = U[c]; i !== c; i = U[i]) {
        for (let j = L[i]; j !== i; j = L[j]) {
          S[C[j]]++;
          U[D[j]] = j;
          D[U[j]] = j;
        }
      }
      L[R[c]] = c;
      R[L[c]] = c;
    };

    const found = [];
    const pick = [];
    /** Trả true khi đã đủ `limit` lời giải (dừng tìm). */
    function rec() {
      if (R[0] === 0) {
        const sol = new Array(K);
        pick.forEach((ri) => { sol[rows[ri].k] = copyRect(rows[ri].x); });
        found.push(sol);
        return found.length >= limit;
      }
      // Cột ít hàng nhất (ô hoặc số bị ràng buộc chặt nhất)
      let best = R[0];
      for (let c = R[best]; c !== 0; c = R[c]) if (S[c] < S[best]) best = c;
      if (S[best] === 0) return false;
      cover(best);
      let stop = false;
      for (let i = D[best]; i !== best && !stop; i = D[i]) {
        pick.push(rowOf[i]);
        for (let j = R[i]; j !== i; j = R[j]) cover(C[j]);
        stop = rec();
        for (let j = L[i]; j !== i; j = L[j]) uncover(C[j]);
        pick.pop();
      }
      uncover(best);
      return stop;
    }
    rec();
    return found;
  }

  const countSolutions = (n, clues, limit) => search(n, clues, limit || 2).length;
  function solve(n, clues) {
    const s = search(n, clues, 1);
    return s.length ? s[0] : null;
  }

  /* ---------------- Sinh đề ---------------- */

  /** Chọn một hình, hình càng lớn càng dễ được chọn (đề ít số 2, 3 vụn vặt, cần suy luận hơn). */
  function pickWeighted(opts, rand) {
    let sum = 0;
    const ws = opts.map((x) => { const w = Math.pow(area(x), WEIGHT_POW); sum += w; return w; });
    let t = rand() * sum;
    for (let i = 0; i < opts.length; i++) {
      t -= ws[i];
      if (t < 0) return opts[i];
    }
    return opts[opts.length - 1];
  }

  /**
   * Chia lưới thành các hình ngẫu nhiên: quét ô trống đầu tiên theo hàng, chọn một hình bắt đầu ở đó.
   * Ô lẻ 1x1 còn sót được gộp vào hình mảnh kề bên nếu ghép lại vẫn là hình chữ nhật.
   */
  function partition(n, shape, rand) {
    const own = new Array(n * n).fill(-1);
    const rects = [];
    for (let i = 0; i < n * n; i++) {
      if (own[i] >= 0) continue;
      const r0 = Math.floor(i / n);
      const c0 = i % n;
      const opts = [];
      let hMax = n - r0;
      for (let w = 1; c0 + w <= n && own[r0 * n + c0 + w - 1] < 0; w++) {
        let h = 0;
        while (h < hMax && own[(r0 + h) * n + c0 + w - 1] < 0) h++;
        hMax = h;
        for (let h2 = 1; h2 <= hMax; h2++) {
          const a = w * h2;
          if (a < 2 || a > shape.maxA) continue;
          if (Math.min(w, h2) === 1 && Math.max(w, h2) > shape.thin) continue;
          if (Math.max(w, h2) > 4 * Math.min(w, h2) && Math.min(w, h2) > 1) continue; // không dẹt quá 1:4
          opts.push({ r: r0, c: c0, h: h2, w });
        }
      }
      const x = opts.length ? pickWeighted(opts, rand) : { r: r0, c: c0, h: 1, w: 1 };
      for (let r = x.r; r < x.r + x.h; r++) for (let c = x.c; c < x.c + x.w; c++) own[r * n + c] = rects.length;
      rects.push(x);
    }
    // Gộp ô lẻ: hình 1x1 nối vào hình mảnh kề có cạnh chung trọn vẹn
    for (let k = 0; k < rects.length; k++) {
      const x = rects[k];
      if (!x || area(x) !== 1) continue;
      const near = [];
      const look = (r, c) => (r >= 0 && c >= 0 && r < n && c < n ? rects[own[r * n + c]] : null);
      const L = look(x.r, x.c - 1);
      const Rr = look(x.r, x.c + 1);
      const Up = look(x.r - 1, x.c);
      const Dn = look(x.r + 1, x.c);
      if (L && L.h === 1 && L.r === x.r) near.push([L, { r: x.r, c: L.c, h: 1, w: L.w + 1 }]);
      if (Rr && Rr.h === 1 && Rr.r === x.r) near.push([Rr, { r: x.r, c: x.c, h: 1, w: Rr.w + 1 }]);
      if (Up && Up.w === 1 && Up.c === x.c) near.push([Up, { r: Up.r, c: x.c, h: Up.h + 1, w: 1 }]);
      if (Dn && Dn.w === 1 && Dn.c === x.c) near.push([Dn, { r: x.r, c: x.c, h: Dn.h + 1, w: 1 }]);
      const fit = near.filter((p) => area(p[1]) <= shape.maxA);
      if (!fit.length) continue;
      const [other, merged] = fit[rand.int(fit.length)];
      const j = rects.indexOf(other);
      rects[j] = merged;
      rects[k] = null;
      for (let r = merged.r; r < merged.r + merged.h; r++) for (let c = merged.c; c < merged.c + merged.w; c++) own[r * n + c] = j;
    }
    return rects.filter(Boolean).sort((a, b) => a.r - b.r || a.c - b.c);
  }

  /** Ô ngẫu nhiên trong hình x, bỏ các ô nằm trong hình `avoid` (nếu có). */
  function cellIn(x, rand, avoid) {
    const cells = [];
    for (let r = x.r; r < x.r + x.h; r++) {
      for (let c = x.c; c < x.c + x.w; c++) if (!avoid || !contains(avoid, r, c)) cells.push({ r, c });
    }
    return cells[rand.int(cells.length)];
  }

  /** Đề có lời giải duy nhất cho cỡ n: { clues, solution }. Tất định theo seed. */
  function generate(mode, seed) {
    const n = SIZES[mode];
    const rand = rng(seed);
    for (;;) {
      const rects = partition(n, SHAPE[mode], rand);
      const clues = rects.map((x) => Object.assign(cellIn(x, rand), { n: area(x) }));
      for (let it = 0; it < 80; it++) {
        const sols = search(n, clues, 2);
        if (sols.length === 1) return { clues, solution: rects.map(copyRect) };
        // Lời giải khác lời giải gốc: dời số của một hình khác nhau sang ô chỉ có ở hình gốc
        const alt = sols.find((s) => s.some((x, k) => !sameRect(x, rects[k])));
        const diff = [];
        alt.forEach((x, k) => { if (!sameRect(x, rects[k])) diff.push(k); });
        const k = diff[rand.int(diff.length)];
        const cell = cellIn(rects[k], rand, alt[k]);
        clues[k] = { r: cell.r, c: cell.c, n: clues[k].n };
      }
    }
  }

  /** Tô màu các hình của lời giải: hai hình kề nhau khác màu (thứ tự "nhỏ nhất sau cùng", đủ 6 màu cho đồ thị phẳng). */
  function colors(g, palette) {
    const P = palette || 8;
    const n = g.size;
    const K = g.clues.length;
    const own = ownerGrid(n, g.solution);
    const adj = Array.from({ length: K }, () => new Set());
    for (let i = 0; i < n * n; i++) {
      const c = i % n;
      if (c + 1 < n && own[i] !== own[i + 1]) { adj[own[i]].add(own[i + 1]); adj[own[i + 1]].add(own[i]); }
      if (i + n < n * n && own[i] !== own[i + n]) { adj[own[i]].add(own[i + n]); adj[own[i + n]].add(own[i]); }
    }
    // Thứ tự: lần lượt bỏ đỉnh bậc nhỏ nhất, tô theo thứ tự ngược lại
    const deg = adj.map((s) => s.size);
    const gone = new Array(K).fill(false);
    const order = [];
    for (let t = 0; t < K; t++) {
      let best = -1;
      for (let k = 0; k < K; k++) if (!gone[k] && (best < 0 || deg[k] < deg[best])) best = k;
      gone[best] = true;
      order.push(best);
      adj[best].forEach((j) => { if (!gone[j]) deg[j]--; });
    }
    const col = new Array(K).fill(-1);
    const used = new Array(P).fill(0);
    order.reverse().forEach((k) => {
      const taken = new Set();
      adj[k].forEach((j) => { if (col[j] >= 0) taken.add(col[j]); });
      let pickC = -1;
      // Màu ít dùng nhất trong các màu còn trống, xoay điểm bắt đầu theo hạt giống để mỗi đề một kiểu
      for (let s = 0; s < P; s++) {
        const cc = (s + (g.seed >>> 0) + k) % P;
        if (!taken.has(cc) && (pickC < 0 || used[cc] < used[pickC])) pickC = cc;
      }
      if (pickC < 0) pickC = k % P;
      col[k] = pickC;
      used[pickC]++;
    });
    return col;
  }

  /* ---------------- Ván ---------------- */

  /** Ván từ đề có sẵn; đề không có lời giải duy nhất thì trả null. */
  function fromPuzzle({ mode, size, seed, clues }) {
    const n = size || SIZES[mode];
    const cl = clues.map((q) => ({ r: q.r, c: q.c, n: q.n }));
    const sols = search(n, cl, 2);
    if (sols.length !== 1) return null;
    return { mode, size: n, seed: seed >>> 0, clues: cl, solution: sols[0], rects: [], undo: [], redo: [], moves: 0, hints: 0 };
  }

  function newGame({ mode, seed }) {
    const m = MODES.indexOf(mode) >= 0 ? mode : 's';
    const s = seed == null ? Math.floor(Math.random() * 4294967296) : seed >>> 0;
    const p = generate(m, s);
    return { mode: m, size: SIZES[m], seed: s, clues: p.clues, solution: p.solution, rects: [], undo: [], redo: [], moves: 0, hints: 0 };
  }

  /** Chỉ số các số nằm trong hình x. */
  function cluesIn(g, x) {
    const out = [];
    g.clues.forEach((q, k) => { if (contains(x, q.r, q.c)) out.push(k); });
    return out;
  }

  /** 'ok' (đúng một số, đủ diện tích) | 'empty' (không có số) | 'many' (nhiều số) | 'area' (sai diện tích). */
  function rectStatus(g, x) {
    const ks = cluesIn(g, x);
    if (ks.length === 0) return 'empty';
    if (ks.length > 1) return 'many';
    return g.clues[ks[0]].n === area(x) ? 'ok' : 'area';
  }
  const rectOk = (g, x) => rectStatus(g, x) === 'ok';

  function rectAt(g, r, c) {
    for (let i = 0; i < g.rects.length; i++) if (contains(g.rects[i], r, c)) return i;
    return -1;
  }

  const coverage = (g) => g.rects.reduce((s, x) => s + area(x), 0);
  const isSolved = (g) => coverage(g) === g.size * g.size && g.rects.every((x) => rectOk(g, x));
  const canUndo = (g) => g.undo.length > 0 && !isSolved(g);
  const canRedo = (g) => g.redo.length > 0 && !isSolved(g);

  /** Áp một bước lên danh sách hình: gỡ `del` (phải có sẵn), thêm `add` (không được chồng). Sai thì null. */
  function applyStep(n, rects, add, del) {
    const out = rects.slice();
    for (const x of del) {
      const i = out.findIndex((y) => sameRect(x, y));
      if (i < 0) return null;
      out.splice(i, 1);
    }
    for (const x of add) {
      if (!validRect(n, x) || out.some((y) => overlaps(x, y))) return null;
      out.push(copyRect(x));
    }
    return out;
  }

  /** Nước mới: áp bước, ghi vào lịch sử hoàn tác, xóa nhánh làm lại. */
  function act(g, add, del, extra) {
    const rects = applyStep(g.size, g.rects, add, del);
    if (!rects) return g;
    return Object.assign({}, g, {
      rects,
      undo: g.undo.concat([{ add: add.map(copyRect), del: del.map(copyRect) }]),
      redo: [],
      moves: g.moves + 1,
    }, extra || {});
  }

  /** Vẽ hình x; các hình đang chồng lên x bị gỡ. Hình trùng hình cũ, ra ngoài lưới hoặc ván đã xong: không đổi. */
  function draw(g, x, extra) {
    if (isSolved(g) || !validRect(g.size, x)) return g;
    if (g.rects.some((y) => sameRect(x, y))) return g;
    return act(g, [copyRect(x)], g.rects.filter((y) => overlaps(x, y)), extra);
  }

  function erase(g, r, c) {
    const i = rectAt(g, r, c);
    if (i < 0 || isSolved(g)) return g;
    return act(g, [], [g.rects[i]]);
  }

  function clear(g) {
    if (!g.rects.length || isSolved(g)) return g;
    return act(g, [], g.rects);
  }

  function undo(g) {
    if (!canUndo(g)) return g;
    const step = g.undo[g.undo.length - 1];
    const rects = applyStep(g.size, g.rects, step.del, step.add);
    if (!rects) return g;
    return Object.assign({}, g, { rects, undo: g.undo.slice(0, -1), redo: g.redo.concat([step]) });
  }

  function redo(g) {
    if (!canRedo(g)) return g;
    const step = g.redo[g.redo.length - 1];
    const rects = applyStep(g.size, g.rects, step.add, step.del);
    if (!rects) return g;
    return Object.assign({}, g, { rects, redo: g.redo.slice(0, -1), undo: g.undo.concat([step]) });
  }

  /**
   * Gợi ý: đặt hình đúng của một số. Ưu tiên số đang bị hình sai che (số nằm trong hình sai, rồi hình
   * của lời giải bị hình sai đè), sau đó số có ít hình ứng viên nhất. Trả ván mới với hints + 1.
   */
  function hint(g) {
    if (isSolved(g)) return g;
    const placed = (k) => g.rects.some((y) => sameRect(y, g.solution[k]));
    const wrong = g.rects.filter((y) => !g.solution.some((s) => sameRect(s, y)));
    const open = g.clues.map((_, k) => k).filter((k) => !placed(k));
    let k = open.find((i) => wrong.some((y) => contains(y, g.clues[i].r, g.clues[i].c)));
    if (k == null) k = open.find((i) => wrong.some((y) => overlaps(y, g.solution[i])));
    if (k == null) {
      const cand = candidates(g.size, g.clues);
      k = open.reduce((best, i) => (best == null || cand[i].length < cand[best].length ? i : best), null);
    }
    if (k == null) return g;
    return draw(g, g.solution[k], { hints: g.hints + 1 });
  }

  /* ---------------- Lưu ván ---------------- */

  const rectArr = (x) => [x.r, x.c, x.h, x.w];
  const stepArr = (s) => [s.add.map(rectArr), s.del.map(rectArr)];

  function toJSON(g) {
    return {
      v: VERSION,
      mode: g.mode,
      seed: g.seed,
      clues: g.clues.map((q) => [q.r, q.c, q.n]),
      rects: g.rects.map(rectArr),
      undo: g.undo.map(stepArr),
      redo: g.redo.map(stepArr),
      moves: g.moves,
      hints: g.hints,
    };
  }

  const isInt = (v, min) => Number.isInteger(v) && v >= min;

  function readRects(n, list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const a of list) {
      if (!Array.isArray(a) || a.length !== 4) return null;
      const x = { r: a[0], c: a[1], h: a[2], w: a[3] };
      if (!validRect(n, x)) return null;
      out.push(x);
    }
    return out;
  }

  function readSteps(n, list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const s of list) {
      if (!Array.isArray(s) || s.length !== 2) return null;
      const add = readRects(n, s[0]);
      const del = readRects(n, s[1]);
      if (!add || !del || add.length + del.length === 0) return null;
      out.push({ add, del });
    }
    return out;
  }

  /** Ván lưu hỏng, khác phiên bản, đề không có lời giải duy nhất hoặc lịch sử không khớp bàn: trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    if (MODES.indexOf(raw.mode) < 0 || !isInt(raw.seed, 0) || raw.seed > 4294967295) return null;
    if (!isInt(raw.moves, 0) || !isInt(raw.hints, 0)) return null;
    const n = SIZES[raw.mode];
    if (!Array.isArray(raw.clues) || raw.clues.length === 0 || raw.clues.length > n * n) return null;
    const seen = new Set();
    const clues = [];
    for (const q of raw.clues) {
      if (!Array.isArray(q) || q.length !== 3) return null;
      const [r, c, v] = q;
      if (!isInt(r, 0) || !isInt(c, 0) || r >= n || c >= n || !isInt(v, 1) || v > n * n) return null;
      if (seen.has(r * n + c)) return null;
      seen.add(r * n + c);
      clues.push({ r, c, n: v });
    }
    const rects = readRects(n, raw.rects);
    const undoS = readSteps(n, raw.undo);
    const redoS = readSteps(n, raw.redo);
    if (!rects || !undoS || !redoS || !ownerGrid(n, rects)) return null;
    if (raw.moves < undoS.length + redoS.length) return null;
    // Lịch sử phải chạy được từ bàn hiện tại: hoàn tác lùi hết và làm lại tiến hết
    let state = rects;
    for (let i = undoS.length - 1; i >= 0 && state; i--) state = applyStep(n, state, undoS[i].del, undoS[i].add);
    if (!state) return null;
    state = rects;
    for (let i = redoS.length - 1; i >= 0 && state; i--) state = applyStep(n, state, redoS[i].add, redoS[i].del);
    if (!state) return null;
    const sols = search(n, clues, 2);
    if (sols.length !== 1) return null;
    return { mode: raw.mode, size: n, seed: raw.seed, clues, solution: sols[0], rects, undo: undoS, redo: redoS, moves: raw.moves, hints: raw.hints };
  }

  const api = {
    VERSION, MODES, SIZES,
    rng, rectFrom, validRect, ownerGrid, candidates, countSolutions, solve, generate, colors,
    fromPuzzle, newGame, cluesIn, rectStatus, rectOk, rectAt, coverage, isSolved, canUndo, canRedo,
    draw, erase, clear, undo, redo, hint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
