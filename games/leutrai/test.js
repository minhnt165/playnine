/* Kiểm tra engine Lều Trại: chạy `node test.js`
 * - Luật: vòng chạm trống → lều → cỏ, hàng / cột, lều chạm nhau, ghép cây - lều, lỗi hiện trên bàn
 * - Thắng: đặt đúng lời giải là xong, cỏ không ảnh hưởng; sai một ô là chưa xong
 * - Sinh đề: mọi cỡ, nhiều seed, đúng một lời giải (solver đếm nghiệm, kiểm tra thêm bằng duyệt vét cạn ở 6x6)
 * - Hoàn tác / làm lại, gợi ý, lưu / khôi phục và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}

function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

/** Dựng đề từ bản vẽ: 'T' cây, 'A' lều của lời giải, '.' trống. Số hàng / cột tính từ lều. */
function puzzleFrom(rowsText) {
  const n = rowsText.length;
  const trees = [];
  const tents = [];
  rowsText.join('').split('').forEach((ch) => {
    trees.push(ch === 'T' ? 1 : 0);
    tents.push(ch === 'A' ? 1 : 0);
  });
  const { rows, cols } = E.clues(n, tents);
  return { n, trees, rows, cols, tents };
}

/** Đếm nghiệm bằng duyệt vét cạn mọi tập con ô kề cây (chỉ dùng cho đề nhỏ) để đối chiếu với solver. */
function bruteCount(p, limit) {
  const { n, trees, rows, cols } = p;
  const { orth, ring } = E.geo(n);
  const cand = [];
  for (let i = 0; i < n * n; i++) if (!trees[i] && orth[i].some((j) => trees[j])) cand.push(i);
  const need = trees.reduce((s, x) => s + x, 0);
  const s = new Array(n * n).fill(0);
  const rt = new Array(n).fill(0);
  const ct = new Array(n).fill(0);
  let count = 0;
  function go(k, placed) {
    if (count >= limit) return;
    if (placed === need) {
      for (let x = 0; x < n; x++) if (rt[x] !== rows[x] || ct[x] !== cols[x]) return;
      const tents = [];
      for (let i = 0; i < n * n; i++) if (s[i]) tents.push(i);
      if (E.canMatch(n, trees, tents)) count++;
      return;
    }
    if (k >= cand.length || cand.length - k < need - placed) return;
    const i = cand[k];
    const r = Math.floor(i / n);
    const c = i % n;
    if (rt[r] < rows[r] && ct[c] < cols[c] && !ring[i].some((j) => s[j])) {
      s[i] = 1; rt[r]++; ct[c]++;
      go(k + 1, placed + 1);
      s[i] = 0; rt[r]--; ct[c]--;
    }
    go(k + 1, placed);
  }
  go(0, 0);
  return count;
}

/** Đặt toàn bộ lều của lời giải (không qua lịch sử). */
function solved(g) {
  return Object.assign({}, g, { marks: g.sol.map((v) => (v ? E.TENT : E.EMPTY)) });
}

/* ---------------- PRNG ---------------- */

test('PRNG theo seed: cùng seed cùng dãy, khác seed khác dãy, trong [0, 1)', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const c = E.rng(43);
  const xa = [a(), a(), a()];
  eq(xa, [b(), b(), b()]);
  ok(JSON.stringify(xa) !== JSON.stringify([c(), c(), c()]));
  const r = E.rng(7);
  for (let k = 0; k < 1000; k++) {
    const v = r();
    ok(v >= 0 && v < 1);
    const m = r.int(5);
    ok(Number.isInteger(m) && m >= 0 && m < 5);
  }
});

/* ---------------- Luật ---------------- */

const SMALL = puzzleFrom([
  'TA....',
  '....AT',
  'A.....',
  'T..TA.',
  '.A....',
  '.T..AT',
]);
// Lều ở ô 1 (cây 0), 10 (cây 11), 12 (cây 18), 22 (cây 21), 25 (cây 31), 34 (cây 35)

test('đề nhỏ dựng tay: solver và duyệt vét cạn cùng đếm, lời giải khớp bản vẽ', () => {
  const a = E.solve(SMALL, 5);
  eq(a.count, bruteCount(SMALL, 5));
  if (a.count === 1) eq(a.sol, SMALL.tents);
});

test('chạm theo vòng: trống → lều → cỏ → trống; chuột phải đi ngược', () => {
  const g0 = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  const g1 = E.cycle(g0, 2);
  eq(g1.marks[2], E.TENT);
  const g2 = E.cycle(g1, 2);
  eq(g2.marks[2], E.GRASS);
  const g3 = E.cycle(g2, 2);
  eq(g3.marks[2], E.EMPTY);
  eq(E.cycle(g0, 2, -1).marks[2], E.GRASS);
  eq(g3.moves, 3);
  eq(g0.marks[2], E.EMPTY, 'ván cũ không bị sửa');
});

test('ô cây không đổi được, nước không đổi gì thì trả lại chính ván', () => {
  const g0 = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  ok(E.cycle(g0, 0) === g0);
  ok(E.setCells(g0, [0, 6], E.EMPTY) === g0);
  ok(E.apply(g0, [{ i: 99, v: 1 }, { i: 2, v: 7 }]) === g0);
});

test('kéo tô cỏ: nhiều ô là một nước, bỏ qua ô cây', () => {
  const g0 = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  const g = E.setCells(g0, [0, 2, 3, 4], E.GRASS);
  eq([g.marks[0], g.marks[2], g.marks[3], g.marks[4]], [0, 2, 2, 2]);
  eq([g.moves, g.past.length, g.past[0].length], [1, 1, 3]);
});

test('đếm hàng / cột: đủ, quá, thiếu chỗ', () => {
  eq(E.lineState(2, 3, 0), 'over');
  eq(E.lineState(2, 2, 4), 'done');
  eq(E.lineState(2, 1, 0), 'short');
  eq(E.lineState(2, 1, 1), '');
  let g = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  g = E.setCells(g, [1, 4], E.TENT); // hàng 0 (số 1) có hai lều
  g = E.setCells(g, [7, 8, 9, 10], E.GRASS); // hàng 1 (số 1) hết chỗ trống
  const s = E.lineStats(g);
  eq(s.rowTents[0], 2);
  eq(E.lineState(g.rows[0], s.rowTents[0], s.rowFree[0]), 'over');
  eq(s.rowFree[1], 1); // ô 6 trống (ô 11 là cây)
  g = E.setCells(g, [6], E.GRASS);
  const s2 = E.lineStats(g);
  eq(E.lineState(g.rows[1], s2.rowTents[1], s2.rowFree[1]), 'short');
});

test('lỗi trên bàn: lều chạm lều (cả chéo), lều không kề cây, cây hết chỗ', () => {
  let g = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  eq(E.errors(g), []);
  g = E.setCells(g, [1, 8], E.TENT); // chéo nhau
  eq(E.errors(g), [1, 8]);
  g = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  g = E.setCells(g, [14], E.TENT); // ô (2,2) không kề cây nào
  eq(E.errors(g), [14]);
  g = E.fromPuzzle('s', Object.assign({ seed: 1, sol: SMALL.tents }, SMALL));
  g = E.setCells(g, [1, 6], E.GRASS); // cây 0 chỉ có hai ô kề: 1 và 6
  eq(E.errors(g), [0]);
});

test('ghép cây - lều: cần mỗi cây một lều riêng', () => {
  // Hai cây chung một lều ở giữa thì không ghép được
  const trees = [1, 0, 1, 0, 0, 0, 0, 0, 0];
  ok(!E.canMatch(3, trees, [1]));
  ok(!E.canMatch(3, trees, [1, 7]));
  ok(E.canMatch(3, trees, [1, 5])); // lều 1 nhận cây 0, lều 5 nhận cây 2
  ok(E.canMatch(3, trees, [3, 5]));
  ok(!E.canMatch(3, [1, 0, 0, 0, 0, 0, 0, 0, 1], [1, 3])); // cả hai lều chỉ kề cây 0
});

test('thắng: đặt đúng lời giải là xong, cỏ không ảnh hưởng, thiếu / thừa một lều là chưa', () => {
  const g0 = E.newGame({ mode: 's', seed: 12345 });
  ok(!E.isSolved(g0));
  const done = solved(g0);
  ok(E.isSolved(done));
  // Phủ cỏ mọi ô còn lại vẫn là xong
  const grassy = Object.assign({}, done, { marks: done.marks.map((v, i) => (v || g0.trees[i] ? v : E.GRASS)) });
  ok(E.isSolved(grassy));
  const first = g0.sol.indexOf(1);
  const missing = Object.assign({}, done, { marks: done.marks.map((v, i) => (i === first ? E.EMPTY : v)) });
  ok(!E.isSolved(missing));
  const extra = done.marks.slice();
  const spot = extra.findIndex((v, i) => !v && !g0.trees[i]);
  extra[spot] = E.TENT;
  ok(!E.isSolved(Object.assign({}, done, { marks: extra })));
});

/* ---------------- Sinh đề ---------------- */

E.MODES.forEach((mode) => {
  const n = E.SIZES[mode];
  test('sinh đề ' + n + 'x' + n + ' (' + mode + '): 40 seed, đúng một lời giải, lời giải thỏa luật', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const p = E.generate(n, seed * 7919);
      eq(p.n, n);
      const nTrees = p.trees.reduce((s, x) => s + x, 0);
      eq(nTrees, E.TREES[n], 'số cây');
      eq(p.rows.reduce((s, x) => s + x, 0), nTrees);
      eq(p.cols.reduce((s, x) => s + x, 0), nTrees);
      const res = E.solve(p, 2);
      eq(res.count, 1, 'seed ' + seed);
      eq(res.sol, p.sol);
      const g = solved(E.fromPuzzle(mode, p));
      ok(E.isSolved(g), 'lời giải thỏa luật');
      eq(E.errors(g), []);
      seen.add(p.trees.join(''));
    }
    ok(seen.size >= 38, 'đề khác nhau theo seed');
  });
});

test('sinh đề tất định theo seed', () => {
  eq(E.generate(8, 99).trees, E.generate(8, 99).trees);
  eq(E.newGame({ mode: 'l', seed: 5 }).sol, E.newGame({ mode: 'l', seed: 5 }).sol);
});

test('6x6: solver khớp duyệt vét cạn trên 30 đề và trên đề nhiều nghiệm', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = E.generate(6, seed * 31 + 3);
    eq(bruteCount(p, 3), 1, 'seed ' + seed);
  }
  // Bố cục ngẫu nhiên (chưa lọc): solver và vét cạn phải cùng kết luận 1 / nhiều nghiệm
  const r = E.rng(2024);
  let multi = 0;
  for (let k = 0; k < 60; k++) {
    const lay = E.layout(6, 7, r);
    if (!lay) continue;
    const { rows, cols } = E.clues(6, lay.tents);
    const p = { n: 6, trees: lay.trees, rows, cols };
    const a = E.solve(p, 3).count;
    eq(a, bruteCount(p, 3), 'bố cục ' + k);
    if (a > 1) multi++;
  }
  ok(multi > 0, 'có bố cục nhiều nghiệm để đối chiếu');
});

test('sinh đề đủ nhanh: 12x12 trung bình < 100 ms trong Node', () => {
  const t0 = Date.now();
  for (let seed = 1000; seed < 1020; seed++) E.generate(12, seed);
  const avg = (Date.now() - t0) / 20;
  ok(avg < 100, 'trung bình ' + avg + ' ms');
});

/* ---------------- Hoàn tác / gợi ý ---------------- */

test('hoàn tác / làm lại không giới hạn, nước mới xóa nhánh làm lại', () => {
  let g = E.newGame({ mode: 's', seed: 3 });
  const free = g.trees.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  for (let k = 0; k < 20; k++) g = E.cycle(g, free[k % free.length]);
  const snap = g.marks.slice();
  for (let k = 0; k < 20; k++) g = E.undo(g);
  eq(g.marks.every((v) => v === 0), true);
  ok(E.undo(g) === g, 'hết để hoàn tác');
  for (let k = 0; k < 20; k++) g = E.redo(g);
  eq(g.marks, snap);
  ok(E.redo(g) === g, 'hết để làm lại');
  g = E.undo(E.undo(g));
  g = E.cycle(g, free[0]);
  eq(g.future.length, 0);
  ok(g.moves > 40, 'hoàn tác / làm lại cũng tính là nước');
});

test('hoàn tác một nét kéo trả lại cả nét', () => {
  let g = E.newGame({ mode: 's', seed: 3 });
  const free = g.trees.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0).slice(0, 5);
  g = E.setCells(g, free, E.GRASS);
  g = E.undo(g);
  eq(free.map((i) => g.marks[i]), [0, 0, 0, 0, 0]);
});

test('gợi ý: sửa lều sai trước, rồi cỏ đè lên lều, rồi đặt lều; dùng đủ gợi ý thì giải xong', () => {
  let g = E.newGame({ mode: 'm', seed: 77 });
  const wrong = g.sol.findIndex((v, i) => !v && !g.trees[i]);
  const right = g.sol.indexOf(1);
  g = E.setCells(g, [wrong], E.TENT);
  g = E.setCells(g, [right], E.GRASS);
  eq(E.hint(g), { i: wrong, v: E.EMPTY, kind: 'wrongTent' });
  g = E.useHint(g);
  eq(E.hint(g), { i: right, v: E.TENT, kind: 'wrongGrass' });
  g = E.useHint(g);
  eq(g.hints, 2);
  let guard = 0;
  while (!E.isSolved(g) && guard++ < 100) {
    const h = E.hint(g);
    eq(h.kind, 'tent');
    g = E.useHint(g);
  }
  ok(E.isSolved(g));
  eq(E.hint(g), null);
  ok(E.useHint(g) === g);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử, gợi ý, lời giải tính lại)', () => {
  let g = E.newGame({ mode: 'm', seed: 2468 });
  const free = g.trees.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  g = E.cycle(g, free[0]);
  g = E.setCells(g, free.slice(1, 4), E.GRASS);
  g = E.useHint(g);
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
});

test('ván lưu giữ tối đa 1000 bước lịch sử', () => {
  let g = E.newGame({ mode: 's', seed: 8 });
  const free = g.trees.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  for (let k = 0; k < 1100; k++) g = E.cycle(g, free[k % free.length]);
  const j = E.toJSON(g);
  eq(j.past.length, 1000);
  const back = E.fromJSON(JSON.parse(JSON.stringify(j)));
  eq(back.marks, g.marks);
  eq(back.moves, 1100);
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.cycle(E.newGame({ mode: 's', seed: 11 }), E.newGame({ mode: 's', seed: 11 }).trees.indexOf(0));
  const good = E.toJSON(g);
  ok(E.fromJSON(JSON.parse(JSON.stringify(good))), 'bản gốc hợp lệ');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const treeAt = good.trees.indexOf(1);
  const twoSol = (() => {
    // Hai cây cạnh nhau ở góc, mỗi cây có thể đặt lều hai bên: không duy nhất
    const r = E.rng(5);
    for (;;) {
      const lay = E.layout(6, 7, r);
      if (!lay) continue;
      const { rows, cols } = E.clues(6, lay.tents);
      if (E.solve({ n: 6, trees: lay.trees, rows, cols }, 2).count > 1) return { trees: lay.trees, rows, cols };
    }
  })();
  const cases = [
    null, 1, 'x', {}, [],
    bad({ v: 2 }),
    bad({ mode: 'xl' }),
    bad({ mode: 'm' }), // sai cỡ so với dữ liệu
    bad({ seed: -1 }),
    bad({ seed: 1.5 }),
    bad({ trees: good.trees.slice(1) }),
    bad({ trees: good.trees.map((x) => (x ? 2 : 0)) }),
    bad({ rows: good.rows.slice(1) }),
    bad({ rows: good.rows.map((x, k) => (k ? x : x + 1)) }), // tổng không khớp số cây
    bad({ cols: good.cols.map((x) => String(x)) }),
    bad({ marks: good.marks.map((x, i) => (i === treeAt ? 1 : x)) }), // lều trên ô cây
    bad({ marks: good.marks.map((x, i) => (i ? x : 3)) }),
    bad({ marks: good.marks.slice(2) }),
    bad({ past: 'x' }),
    bad({ past: [[[0, 0]]] }),
    bad({ past: [[]] }),
    bad({ past: [[[treeAt, 0, 1]]] }),
    bad({ future: [[[0, 1, 1]]] }),
    bad({ moves: -1 }),
    bad({ hints: 'a' }),
    bad({ trees: twoSol.trees, rows: twoSol.rows, cols: twoSol.cols, marks: good.marks.map(() => 0), past: [], future: [] }),
  ];
  cases.forEach((raw, k) => eq(E.fromJSON(raw), null, 'case ' + k));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
