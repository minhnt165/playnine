/* =====================================================================
 * Ô Số Tính - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật: lưới N×N (N = 4..7), mỗi hàng / cột có đủ 1..N; lưới chia thành "lồng", mỗi lồng có
 *   phép tính (+ − × ÷) và kết quả, các số trong lồng phải cho ra kết quả đó (− và ÷ chỉ cho lồng 2 ô,
 *   lấy số lớn trừ / chia số nhỏ). Lồng 1 ô cho sẵn số (ô cố định).
 *   - Sinh đề theo seed: hình vuông Latin ngẫu nhiên → chia lồng → chọn phép tính → solver đếm nghiệm,
 *     sửa lồng cho tới khi chỉ còn đúng một nghiệm
 *   - Ván: giá trị, ghi chú (bitmask), hoàn tác / làm lại không giới hạn, gợi ý; toJSON / fromJSON
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SIZES = [4, 5, 6, 7];
  const OPS = ['+', '-', '*', '/', '='];

  /* ---------------- Số ngẫu nhiên có seed (mulberry32) ---------------- */

  /** Chuỗi (ví dụ ngày) → số 32 bit; số thì giữ nguyên phần 32 bit. */
  function hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function makeRng(seed) {
    let a = hashSeed(seed);
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

  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      const x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }

  const range = (n) => Array.from({ length: n }, (_, i) => i);

  /** Ô kề cạnh (trên, dưới, trái, phải) của ô i trong lưới n×n. */
  function neighbours(n, i) {
    const r = Math.floor(i / n);
    const c = i % n;
    const out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  /* ---------------- Lồng: kiểm tra, liệt kê bộ số hợp lệ ---------------- */

  /** Bộ số `vals` (theo thứ tự ô của lồng) có cho ra kết quả của lồng không. */
  function cageHolds(op, target, vals) {
    if (op === '=') return vals.length === 1 && vals[0] === target;
    if (op === '+') return vals.reduce((s, v) => s + v, 0) === target;
    if (op === '*') return vals.reduce((s, v) => s * v, 1) === target;
    if (vals.length !== 2) return false;
    const hi = Math.max(vals[0], vals[1]);
    const lo = Math.min(vals[0], vals[1]);
    if (op === '-') return hi - lo === target;
    return lo > 0 && hi % lo === 0 && hi / lo === target; // '/'
  }

  /**
   * Mọi bộ số 1..n điền được vào lồng (đúng phép tính, hai ô cùng hàng / cột trong lồng khác nhau).
   * Trả về { rows, cols, tuples: [{ vals, rm, cm }] }: rows / cols là các hàng / cột lồng đi qua,
   * rm[j] / cm[j] là bitmask số mà bộ đặt vào hàng rows[j] / cột cols[j] (để solver kiểm tra nhanh).
   */
  function cageTuples(n, cage) {
    const { cells, op, target } = cage;
    const k = cells.length;
    const r = cells.map((i) => Math.floor(i / n));
    const c = cells.map((i) => i % n);
    const rows = Array.from(new Set(r));
    const cols = Array.from(new Set(c));
    const tuples = [];
    const vals = new Array(k);
    (function rec(j, acc) {
      if (op === '+' && acc > target) return;
      if (op === '*' && target % acc !== 0) return;
      if (j === k) {
        if (!cageHolds(op, target, vals)) return;
        const rm = rows.map(() => 0);
        const cm = cols.map(() => 0);
        for (let x = 0; x < k; x++) {
          rm[rows.indexOf(r[x])] |= 1 << (vals[x] - 1);
          cm[cols.indexOf(c[x])] |= 1 << (vals[x] - 1);
        }
        tuples.push({ vals: vals.slice(), rm, cm });
        return;
      }
      for (let v = 1; v <= n; v++) {
        let ok = true;
        for (let x = 0; x < j; x++) {
          if (vals[x] === v && (r[x] === r[j] || c[x] === c[j])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        vals[j] = v;
        rec(j + 1, op === '+' ? acc + v : op === '*' ? acc * v : acc);
      }
    })(0, op === '*' ? 1 : 0);
    return { rows, cols, tuples };
  }

  /* ---------------- Solver đếm nghiệm ---------------- */

  /**
   * Đếm nghiệm của đề (dừng khi đủ `limit`, mặc định 2). Tìm theo lồng: mỗi bước chọn lồng còn ít bộ số
   * khớp nhất với các hàng / cột đã điền, và cắt nhánh khi một hàng / cột không còn cách nào đủ 1..n.
   * Trả về { count, solutions, aborted } (solutions: tối đa `limit` lời giải, mỗi lời giải là mảng n*n giá trị).
   * `budget` (tùy chọn): số nút tìm kiếm tối đa; vượt thì dừng với aborted = true (bộ sinh đề bỏ cách chia lồng đó
   * để thời gian sinh đề không bị kéo dài bởi vài đề hiếm gặp).
   */
  function solve(puzzle, limit, budget) {
    const n = puzzle.size;
    const max = limit || 2;
    const full = (1 << n) - 1;
    const cs = puzzle.cages.map((cg) => Object.assign({ cells: cg.cells }, cageTuples(n, cg)));
    const rowM = new Int32Array(n);
    const colM = new Int32Array(n);
    const done = new Uint8Array(cs.length);
    const grid = new Array(n * n).fill(0);
    const rowCover = new Int32Array(n);
    const colCover = new Int32Array(n);
    const solutions = [];
    let count = 0;
    let nodes = 0;
    let aborted = false;

    const fits = (cg, t) => {
      for (let j = 0; j < cg.rows.length; j++) if (rowM[cg.rows[j]] & t.rm[j]) return false;
      for (let j = 0; j < cg.cols.length; j++) if (colM[cg.cols[j]] & t.cm[j]) return false;
      return true;
    };

    function dfs(left) {
      if (budget && ++nodes > budget) {
        aborted = true;
        return;
      }
      if (left === 0) {
        count++;
        if (solutions.length < max) solutions.push(grid.slice());
        return;
      }
      rowCover.fill(0);
      colCover.fill(0);
      let best = -1;
      let bestN = Infinity;
      for (let ci = 0; ci < cs.length; ci++) {
        if (done[ci]) continue;
        const cg = cs[ci];
        let m = 0;
        for (const t of cg.tuples) {
          if (!fits(cg, t)) continue;
          m++;
          for (let j = 0; j < cg.rows.length; j++) rowCover[cg.rows[j]] |= t.rm[j];
          for (let j = 0; j < cg.cols.length; j++) colCover[cg.cols[j]] |= t.cm[j];
        }
        if (m === 0) return;
        if (m < bestN) {
          bestN = m;
          best = ci;
        }
      }
      // Hàng / cột còn thiếu số mà không lồng nào đặt được vào nữa: nhánh chết
      for (let x = 0; x < n; x++) {
        if ((rowCover[x] | rowM[x]) !== full || (colCover[x] | colM[x]) !== full) return;
      }
      const cg = cs[best];
      const list = cg.tuples.filter((t) => fits(cg, t));
      done[best] = 1;
      for (const t of list) {
        for (let j = 0; j < cg.rows.length; j++) rowM[cg.rows[j]] |= t.rm[j];
        for (let j = 0; j < cg.cols.length; j++) colM[cg.cols[j]] |= t.cm[j];
        cg.cells.forEach((cell, x) => { grid[cell] = t.vals[x]; });
        dfs(left - 1);
        for (let j = 0; j < cg.rows.length; j++) rowM[cg.rows[j]] ^= t.rm[j];
        for (let j = 0; j < cg.cols.length; j++) colM[cg.cols[j]] ^= t.cm[j];
        if (count >= max || aborted) break;
      }
      done[best] = 0;
    }

    dfs(cs.length);
    return { count, solutions, aborted };
  }

  const countSolutions = (puzzle, limit) => solve(puzzle, limit || 2).count;

  /* ---------------- Sinh đề ---------------- */

  // Cấu hình theo cỡ: lồng lớn nhất, số lồng 1 ô tối đa, tỉ lệ cỡ lồng mong muốn (chỉ số = cỡ lồng),
  // xác suất chọn phép bó buộc nhất (tight, cao = dễ suy luận hơn) và xác suất dùng ÷ khi chia hết (div)
  const SPEC = {
    4: { maxCage: 3, maxSingles: 2, weights: [0, 0.06, 0.5, 0.44], tight: 0.6, div: 0.55 },
    5: { maxCage: 4, maxSingles: 2, weights: [0, 0.06, 0.44, 0.38, 0.12], tight: 0.5, div: 0.5 },
    6: { maxCage: 4, maxSingles: 2, weights: [0, 0.05, 0.4, 0.38, 0.17], tight: 0.35, div: 0.45 },
    7: { maxCage: 4, maxSingles: 1, weights: [0, 0.04, 0.36, 0.4, 0.2], tight: 0.2, div: 0.4 },
  };

  const BUDGET = 400; // số nút tìm kiếm tối đa cho mỗi lần đếm nghiệm khi sinh đề

  /** Hình vuông Latin ngẫu nhiên n×n (điền từng ô, thử số theo thứ tự ngẫu nhiên, quay lui khi kẹt). */
  function latinSquare(n, r) {
    const grid = new Array(n * n).fill(0);
    const rowM = new Int32Array(n);
    const colM = new Int32Array(n);
    (function fill(i) {
      if (i === n * n) return true;
      const row = Math.floor(i / n);
      const col = i % n;
      for (const v of shuffle(range(n).map((x) => x + 1), r)) {
        const b = 1 << (v - 1);
        if ((rowM[row] | colM[col]) & b) continue;
        rowM[row] |= b;
        colM[col] |= b;
        grid[i] = v;
        if (fill(i + 1)) return true;
        rowM[row] ^= b;
        colM[col] ^= b;
      }
      return false;
    })(0);
    return grid;
  }

  function pickSize(weights, r) {
    let x = r();
    for (let s = 1; s < weights.length; s++) {
      x -= weights[s];
      if (x < 0) return s;
    }
    return weights.length - 1;
  }

  /** Chia lưới thành các lồng liền nhau (mảng các mảng ô); nhiều lồng 1 ô quá thì gộp bớt vào lồng kề. */
  function partition(n, spec, r) {
    const owner = new Array(n * n).fill(-1);
    const cages = [];
    for (const start of shuffle(range(n * n), r)) {
      if (owner[start] >= 0) continue;
      const want = pickSize(spec.weights, r);
      const id = cages.length;
      const cells = [start];
      owner[start] = id;
      while (cells.length < want) {
        const front = [];
        cells.forEach((c) => neighbours(n, c).forEach((x) => { if (owner[x] < 0 && front.indexOf(x) < 0) front.push(x); }));
        if (!front.length) break;
        const x = front[r.int(front.length)];
        owner[x] = id;
        cells.push(x);
      }
      cages.push(cells);
    }
    // Gộp lồng 1 ô thừa vào lồng kề nhỏ nhất (không vượt cỡ tối đa)
    let singles = cages.filter((c) => c && c.length === 1);
    while (singles.length > spec.maxSingles) {
      const s = singles[r.int(singles.length)];
      const cell = s[0];
      const near = Array.from(new Set(neighbours(n, cell).map((x) => owner[x])))
        .filter((id) => cages[id].length < spec.maxCage)
        .sort((a, b) => cages[a].length - cages[b].length);
      if (!near.length) return null;
      const into = near[0];
      cages[owner[cell]] = null;
      cages[into].push(cell);
      owner[cell] = into;
      singles = cages.filter((c) => c && c.length === 1);
    }
    return cages.filter(Boolean).map((cells) => cells.sort((a, b) => a - b));
  }

  /** Các phép tính hợp lệ cho lồng với lời giải đã biết: [{ op, target }]. */
  function opChoices(cells, sol) {
    const vals = cells.map((i) => sol[i]);
    if (vals.length === 1) return [{ op: '=', target: vals[0] }];
    const out = [
      { op: '+', target: vals.reduce((s, v) => s + v, 0) },
      { op: '*', target: vals.reduce((s, v) => s * v, 1) },
    ];
    if (vals.length === 2) {
      const hi = Math.max(vals[0], vals[1]);
      const lo = Math.min(vals[0], vals[1]);
      out.push({ op: '-', target: hi - lo });
      if (hi % lo === 0) out.push({ op: '/', target: hi / lo });
    }
    return out;
  }

  /**
   * Chọn phép tính cho lồng: thường lấy phép bó buộc nhất (ít bộ số nhất) để đề dễ có nghiệm duy nhất,
   * đôi khi chọn ngẫu nhiên cho đề đa dạng. Lồng 2 ô chia hết thì hay dùng ÷.
   */
  function chooseOp(n, cells, sol, spec, r) {
    const choices = opChoices(cells, sol);
    if (choices.length === 1) return choices[0];
    const div = choices.find((c) => c.op === '/');
    if (div && r() < spec.div) return div;
    if (r() < spec.tight) {
      const scored = choices.map((c) => ({ c, k: cageTuples(n, { cells, op: c.op, target: c.target }).tuples.length }));
      scored.sort((a, b) => a.k - b.k);
      return scored[0].c;
    }
    return choices[r.int(choices.length)];
  }

  /**
   * Sinh đề cỡ `size` theo `seed`. Lặp: chia lồng + chọn phép; còn nhiều nghiệm thì đổi phép tính của một lồng
   * chứa ô khác nhau giữa hai nghiệm sang phép loại được nghiệm lạ; hết cách thì chia lồng lại.
   * Trả về { size, seed, cages: [{ cells, op, target }], solution }.
   */
  function generate(size, seed) {
    if (SIZES.indexOf(size) < 0) throw new Error('size');
    const r = makeRng(seed);
    const spec = SPEC[size];
    for (;;) {
      const sol = latinSquare(size, r);
      for (let tryPart = 0; tryPart < 8; tryPart++) {
        const parts = partition(size, spec, r);
        if (!parts) continue;
        const cages = parts.map((cells) => Object.assign({ cells }, chooseOp(size, cells, sol, spec, r)));
        const puzzle = { size, cages };
        for (let fix = 0; fix < 12; fix++) {
          const res = solve(puzzle, 2, BUDGET);
          if (res.aborted) break;
          if (res.count === 1) return { size, seed: hashSeed(seed), cages, solution: sol };
          const alt = res.solutions.find((s) => s.some((v, i) => v !== sol[i]));
          // Lồng có ô khác nhau giữa lời giải thật và nghiệm lạ, đổi được sang phép mà nghiệm lạ không thỏa
          const options = [];
          cages.forEach((cg, ci) => {
            if (!cg.cells.some((i) => alt[i] !== sol[i])) return;
            const altVals = cg.cells.map((i) => alt[i]);
            opChoices(cg.cells, sol).forEach((c) => {
              if (c.op !== cg.op && !cageHolds(c.op, c.target, altVals)) options.push({ ci, c });
            });
          });
          if (!options.length) break;
          const pick = options[r.int(options.length)];
          cages[pick.ci] = Object.assign({ cells: cages[pick.ci].cells }, pick.c);
        }
      }
    }
  }

  /* ---------------- Ván chơi ---------------- */

  const bit = (v) => 1 << (v - 1);

  /** Ô thuộc lồng 1 ô: cho sẵn số, không sửa được. */
  function fixedCells(g) {
    const out = new Array(g.size * g.size).fill(false);
    g.cages.forEach((cg) => { if (cg.cells.length === 1) out[cg.cells[0]] = true; });
    return out;
  }

  /** Chỉ số lồng của từng ô. */
  function cageIndex(g) {
    const out = new Array(g.size * g.size).fill(-1);
    g.cages.forEach((cg, ci) => cg.cells.forEach((i) => { out[i] = ci; }));
    return out;
  }

  function newGame(opts) {
    const p = generate(opts.size, opts.seed);
    return fromPuzzle(p);
  }

  /** Ván mới từ một đề (lồng 1 ô điền sẵn). */
  function fromPuzzle(p) {
    const g = {
      size: p.size,
      seed: p.seed >>> 0,
      cages: p.cages.map((c) => ({ cells: c.cells.slice(), op: c.op, target: c.target })),
      solution: p.solution.slice(),
      values: new Array(p.size * p.size).fill(0),
      notes: new Array(p.size * p.size).fill(0),
      moves: 0,
      hints: 0,
      undo: [],
      redo: [],
    };
    g.cages.forEach((cg) => { if (cg.cells.length === 1) g.values[cg.cells[0]] = cg.target; });
    return g;
  }

  /** Ô cùng hàng hoặc cùng cột với ô i (không gồm i). */
  function peers(n, i) {
    const r = Math.floor(i / n);
    const c = i % n;
    const out = [];
    for (let x = 0; x < n; x++) {
      if (x !== c) out.push(r * n + x);
      if (x !== r) out.push(x * n + c);
    }
    return out;
  }

  /** Áp một bản vá [[ô, giá trị cũ, ghi chú cũ, giá trị mới, ghi chú mới], ...]; `forward` = chiều mới. */
  function applyPatch(g, patch, forward) {
    const values = g.values.slice();
    const notes = g.notes.slice();
    patch.forEach((p) => {
      values[p[0]] = forward ? p[3] : p[1];
      notes[p[0]] = forward ? p[4] : p[2];
    });
    return Object.assign({}, g, { values, notes });
  }

  /** Ghi một thao tác: áp bản vá, đẩy vào lịch sử hoàn tác, xóa nhánh làm lại. */
  function commit(g, patch, extra) {
    if (!patch.length) return g;
    const next = applyPatch(g, patch, true);
    next.undo = g.undo.concat([patch]);
    next.redo = [];
    next.moves = g.moves + 1;
    return Object.assign(next, extra || {});
  }

  /** Bản vá đặt số v vào ô i: xóa ghi chú của ô, bỏ ghi chú số v ở các ô cùng hàng / cột. */
  function placePatch(g, i, v) {
    const patch = [[i, g.values[i], g.notes[i], v, 0]];
    if (v) {
      peers(g.size, i).forEach((j) => {
        if (g.notes[j] & bit(v)) patch.push([j, g.values[j], g.notes[j], g.values[j], g.notes[j] & ~bit(v)]);
      });
    }
    return patch;
  }

  const editable = (g, i) => Number.isInteger(i) && i >= 0 && i < g.size * g.size && !fixedCells(g)[i];
  const validDigit = (g, v) => Number.isInteger(v) && v >= 1 && v <= g.size;

  /** Điền số v vào ô i; điền lại đúng số đang có thì xóa ô. Ô cố định / số sai cỡ: không đổi gì. */
  function setValue(g, i, v) {
    if (isSolved(g) || !editable(g, i) || !validDigit(g, v)) return g;
    if (g.values[i] === v) return commit(g, [[i, v, g.notes[i], 0, g.notes[i]]]);
    return commit(g, placePatch(g, i, v));
  }

  /** Bật / tắt ghi chú số v ở ô trống i. */
  function toggleNote(g, i, v) {
    if (isSolved(g) || !editable(g, i) || !validDigit(g, v) || g.values[i]) return g;
    return commit(g, [[i, 0, g.notes[i], 0, g.notes[i] ^ bit(v)]]);
  }

  /** Xóa số và ghi chú của ô i. */
  function clearCell(g, i) {
    if (isSolved(g) || !editable(g, i) || (!g.values[i] && !g.notes[i])) return g;
    return commit(g, [[i, g.values[i], g.notes[i], 0, 0]]);
  }

  /**
   * Gợi ý: điền đúng số vào ô `i` (nếu ô đó trống hoặc sai), không thì vào ô trống / sai đầu tiên.
   * Trả về { game, cell } (cell = -1 khi không còn gì để gợi ý). Số lần gợi ý không giảm khi hoàn tác.
   */
  function hint(g, i) {
    const need = (j) => editable(g, j) && g.values[j] !== g.solution[j];
    let cell = Number.isInteger(i) && need(i) ? i : -1;
    if (cell < 0) cell = g.values.findIndex((v, j) => need(j) && !v);
    if (cell < 0) cell = g.values.findIndex((v, j) => need(j));
    if (cell < 0 || isSolved(g)) return { game: g, cell: -1 };
    return { game: commit(g, placePatch(g, cell, g.solution[cell]), { hints: g.hints + 1 }), cell };
  }

  function undo(g) {
    if (!g.undo.length || isSolved(g)) return g;
    const patch = g.undo[g.undo.length - 1];
    const next = applyPatch(g, patch, false);
    next.undo = g.undo.slice(0, -1);
    next.redo = g.redo.concat([patch]);
    return next;
  }

  function redo(g) {
    if (!g.redo.length || isSolved(g)) return g;
    const patch = g.redo[g.redo.length - 1];
    const next = applyPatch(g, patch, true);
    next.redo = g.redo.slice(0, -1);
    next.undo = g.undo.concat([patch]);
    return next;
  }

  /** Ô vi phạm luật hàng / cột (trùng số với ô khác cùng hàng hoặc cùng cột). */
  function conflicts(g) {
    const n = g.size;
    const bad = new Array(n * n).fill(false);
    for (let i = 0; i < n * n; i++) {
      const v = g.values[i];
      if (!v) continue;
      for (const j of peers(n, i)) {
        if (g.values[j] === v) {
          bad[i] = true;
          break;
        }
      }
    }
    return bad;
  }

  /** Trạng thái từng lồng: 'open' (còn ô trống), 'ok' (đủ và đúng phép tính), 'bad' (đủ mà sai). */
  function cageStates(g) {
    return g.cages.map((cg) => {
      const vals = cg.cells.map((i) => g.values[i]);
      if (vals.some((v) => !v)) return 'open';
      return cageHolds(cg.op, cg.target, vals) ? 'ok' : 'bad';
    });
  }

  /** Thắng: đủ ô, không trùng hàng / cột, mọi lồng đúng (đề có nghiệm duy nhất nên đây chính là lời giải). */
  function isSolved(g) {
    if (g.values.some((v) => !v)) return false;
    if (conflicts(g).some(Boolean)) return false;
    return cageStates(g).every((s) => s === 'ok');
  }

  const filledCount = (g) => g.values.filter(Boolean).length;

  /** Nhãn lồng: "12+", "3−", "60×", "2÷", lồng 1 ô chỉ có số. */
  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷', '=': '' };
  const cageLabel = (cg) => String(cg.target) + SYMBOL[cg.op];

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      v: VERSION,
      size: g.size,
      seed: g.seed,
      cages: g.cages.map((c) => ({ cells: c.cells.slice(), op: c.op, target: c.target })),
      solution: g.solution.slice(),
      values: g.values.slice(),
      notes: g.notes.slice(),
      moves: g.moves,
      hints: g.hints,
      undo: g.undo.map((p) => p.map((x) => x.slice())),
      redo: g.redo.map((p) => p.map((x) => x.slice())),
    };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isArr = (a, len) => Array.isArray(a) && a.length === len;

  /** Lời giải là hình vuông Latin và thỏa mọi lồng; lồng phủ đúng mỗi ô một lần, mỗi lồng liền một khối. */
  function validPuzzle(n, cages, sol) {
    const N = n * n;
    if (!isArr(sol, N) || !sol.every((v) => isInt(v, 1, n))) return false;
    for (let x = 0; x < n; x++) {
      let rm = 0;
      let cm = 0;
      for (let y = 0; y < n; y++) {
        rm |= bit(sol[x * n + y]);
        cm |= bit(sol[y * n + x]);
      }
      if (rm !== (1 << n) - 1 || cm !== (1 << n) - 1) return false;
    }
    if (!Array.isArray(cages) || !cages.length) return false;
    const seen = new Array(N).fill(false);
    for (const cg of cages) {
      if (!cg || typeof cg !== 'object' || !Array.isArray(cg.cells) || !cg.cells.length || cg.cells.length > 6) return false;
      if (OPS.indexOf(cg.op) < 0 || !isInt(cg.target, 0, 1e7)) return false;
      if ((cg.op === '=') !== (cg.cells.length === 1)) return false;
      if ((cg.op === '-' || cg.op === '/') && cg.cells.length !== 2) return false;
      for (const i of cg.cells) {
        if (!isInt(i, 0, N - 1) || seen[i]) return false;
        seen[i] = true;
      }
      if (!cageHolds(cg.op, cg.target, cg.cells.map((i) => sol[i]))) return false;
      // Liền khối: loang từ ô đầu phải tới đủ mọi ô của lồng
      const reach = [cg.cells[0]];
      for (let k = 0; k < reach.length; k++) {
        neighbours(n, reach[k]).forEach((x) => { if (cg.cells.indexOf(x) >= 0 && reach.indexOf(x) < 0) reach.push(x); });
      }
      if (reach.length !== cg.cells.length) return false;
    }
    return seen.every(Boolean);
  }

  function validPatchList(list, n) {
    if (!Array.isArray(list)) return false;
    return list.every((p) => Array.isArray(p) && p.length > 0 && p.every((x) =>
      isArr(x, 5) && isInt(x[0], 0, n * n - 1) && isInt(x[1], 0, n) && isInt(x[3], 0, n) && isInt(x[2], 0, (1 << n) - 1) && isInt(x[4], 0, (1 << n) - 1)));
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const n = raw.size;
    if (SIZES.indexOf(n) < 0) return null;
    if (!isInt(raw.seed, 0, 4294967295) || !isInt(raw.moves, 0, 1e7) || !isInt(raw.hints, 0, 1e5)) return null;
    if (!validPuzzle(n, raw.cages, raw.solution)) return null;
    if (!isArr(raw.values, n * n) || !raw.values.every((v) => isInt(v, 0, n))) return null;
    if (!isArr(raw.notes, n * n) || !raw.notes.every((v) => isInt(v, 0, (1 << n) - 1))) return null;
    if (!validPatchList(raw.undo, n) || !validPatchList(raw.redo, n)) return null;
    const g = {
      size: n,
      seed: raw.seed,
      cages: raw.cages.map((c) => ({ cells: c.cells.slice(), op: c.op, target: c.target })),
      solution: raw.solution.slice(),
      values: raw.values.slice(),
      notes: raw.notes.slice(),
      moves: raw.moves,
      hints: raw.hints,
      undo: raw.undo.map((p) => p.map((x) => x.slice())),
      redo: raw.redo.map((p) => p.map((x) => x.slice())),
    };
    // Ô cố định phải giữ đúng số cho sẵn
    const fixed = fixedCells(g);
    if (g.values.some((v, i) => fixed[i] && v !== g.solution[i])) return null;
    return g;
  }

  const api = {
    VERSION, SIZES, SPEC,
    makeRng, hashSeed, neighbours, peers,
    cageHolds, cageTuples, solve, countSolutions, latinSquare, partition, generate,
    newGame, fromPuzzle, fixedCells, cageIndex,
    setValue, toggleNote, clearCell, hint, undo, redo,
    conflicts, cageStates, isSolved, filledCount, cageLabel,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
