/* Kiểm tra engine Nhị Phân: chạy `node test.js`
 * - Luật: ba ô liền nhau, thừa số 0 / 1 trong một hàng / cột, hai hàng / cột trùng nhau
 * - Chạm xoay trống → 0 → 1 → trống, ô cho sẵn không đổi, hoàn tác / làm lại
 * - Sinh đề theo seed: tất định, lời giải hợp lệ, đề có ĐÚNG MỘT lời giải (solver đếm nghiệm, dừng ở 2)
 *   trên nhiều seed cho mọi cỡ, và giải được bằng suy luận (không phải đoán)
 * - Thắng, gợi ý (sửa ô sai trước, rồi điền ô suy ra được), lưu / khôi phục, từ chối dữ liệu hỏng
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
  if (!v) throw new Error(msg || 'điều kiện sai');
}

/** Lưới từ chuỗi '0', '1', '.' (bỏ khoảng trắng) → mảng -1 / 0 / 1. */
const grid = (s) => s.replace(/\s+/g, '').split('').map((c) => (c === '.' ? -1 : Number(c)));
const EMPTY_ROWS = '\n......'.repeat(5);

// Lời giải 6×6 hợp lệ dùng chung (kiểm bằng isValidSolution bên dưới)
const SOL6 = grid(`
  010101
  101010
  011001
  100110
  001011
  110100
`);

/* ---------------- Luật ---------------- */

test('lời giải mẫu hợp lệ', () => {
  ok(E.isValidSolution(6, SOL6));
  eq(E.conflicts(6, SOL6), []);
});

test('ba ô giống nhau liền nhau theo hàng bị báo lỗi', () => {
  eq(E.conflicts(6, grid('000...' + EMPTY_ROWS)), [0, 1, 2]);
});

test('ba ô giống nhau liền nhau theo cột bị báo lỗi', () => {
  eq(E.conflicts(6, grid('.1....\n.1....\n.1....' + '\n......'.repeat(3))), [1, 7, 13]);
});

test('thừa số 1 trong một hàng: mọi ô 1 của hàng đó bị báo lỗi', () => {
  eq(E.conflicts(6, grid('1101.1' + EMPTY_ROWS)), [0, 1, 3, 5]);
});

test('hai hàng đầy giống nhau bị báo lỗi, hàng chưa đầy thì không', () => {
  eq(E.conflicts(6, grid('010101\n010101' + '\n......'.repeat(4))), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  eq(E.conflicts(6, grid('010101\n01010.' + '\n......'.repeat(4))), []);
});

test('hai cột đầy giống nhau bị báo lỗi', () => {
  // Chép cột 0 sang cột 2 của lời giải
  const g = SOL6.slice();
  for (let r = 0; r < 6; r++) g[r * 6 + 2] = g[r * 6];
  const bad = E.conflicts(6, g);
  for (let r = 0; r < 6; r++) {
    ok(bad.indexOf(r * 6) >= 0 && bad.indexOf(r * 6 + 2) >= 0, 'cột 0 và cột 2 phải bị báo');
  }
  ok(!E.isValidSolution(6, g));
});

test('lưới thiếu ô thì chưa phải lời giải', () => {
  const g = SOL6.slice();
  g[7] = -1;
  ok(!E.isValidSolution(6, g));
});

/* ---------------- Thao tác ---------------- */

/** Ván nhỏ dựng tay từ SOL6: bỏ trống các ô có dấu '.' trong `mask`. */
function handGame(mask) {
  const m = grid(mask);
  const puzzle = SOL6.map((v, i) => (m[i] === -1 ? -1 : v));
  return E.fromPuzzle({ size: 6, seed: 1, puzzle, solution: SOL6 });
}
const MASK = `
  ..0101
  101010
  011001
  100110
  001011
  110100
`;

test('chạm xoay trống → 0 → 1 → trống, đếm nước đi', () => {
  let g = handGame(MASK);
  eq([g.cells[0], g.moves], [-1, 0]);
  g = E.cycle(g, 0);
  eq([g.cells[0], g.moves], [0, 1]);
  g = E.cycle(g, 0);
  eq(g.cells[0], 1);
  g = E.cycle(g, 0);
  eq([g.cells[0], g.moves], [-1, 3]);
  g = E.cycle(g, 0, -1); // xoay ngược (chuột phải): trống → 1
  eq(g.cells[0], 1);
});

test('ô cho sẵn không đổi được', () => {
  const g = handGame(MASK);
  eq(E.cycle(g, 2), g);
  eq(E.setCell(g, 2, 1), g);
  eq(E.isGiven(g, 2), true);
  eq(E.isGiven(g, 0), false);
});

test('đặt cùng giá trị, giá trị lạ hoặc ô ngoài lưới không tính nước', () => {
  const g = handGame(MASK);
  eq(E.setCell(g, 0, -1), g);
  eq(E.setCell(g, 99, 0), g);
  eq(E.setCell(g, 0, 2), g);
});

test('hoàn tác / làm lại không giới hạn, nước mới xóa nhánh làm lại', () => {
  let g = handGame(MASK);
  g = E.setCell(g, 0, 1);
  g = E.setCell(g, 1, 0);
  g = E.setCell(g, 0, 0);
  g = E.undo(g);
  eq([g.cells[0], g.cells[1]], [1, 0]);
  g = E.undo(g);
  g = E.undo(g);
  eq([g.cells[0], g.cells[1]], [-1, -1]);
  eq(E.undo(g), g, 'hết lịch sử thì hoàn tác không làm gì');
  g = E.redo(g);
  eq(g.cells[0], 1);
  g = E.setCell(g, 1, 1);
  eq(g.redo.length, 0);
  eq(E.redo(g), g);
  ok(g.moves >= 6, 'hoàn tác / làm lại cũng tính là nước');
});

test('điền đúng ô cuối thì thắng; điền sai thì chưa', () => {
  let g = handGame(MASK);
  g = E.setCell(g, 0, 0);
  ok(!E.isSolved(g));
  g = E.setCell(g, 1, 0); // sai: 000 ở đầu hàng
  ok(!E.isSolved(g));
  ok(E.conflicts(6, g.cells).indexOf(1) >= 0);
  g = E.setCell(g, 1, 1);
  ok(E.isSolved(g));
  eq(E.setCell(g, 0, 1), g, 'đã thắng thì không đổi được nữa');
});

test('emptyCount đếm ô trống', () => {
  eq(E.emptyCount(handGame(MASK)), 2);
});

/* ---------------- Gợi ý ---------------- */

test('gợi ý sửa ô sai trước', () => {
  let g = handGame(MASK);
  g = E.setCell(g, 0, 1); // đúng là 0
  const h = E.hint(g);
  eq([h.i, h.kind], [0, 'fix']);
  eq(h.game.cells[0], 0);
  eq(h.game.hints, 1);
});

test('gợi ý điền ô suy ra được và nêu lý do', () => {
  const g = handGame(MASK);
  const h = E.hint(g);
  ok(h.i === 0 || h.i === 1);
  eq(h.game.cells[h.i], SOL6[h.i]);
  ok(['pair', 'gap', 'count', 'line', 'guess'].indexOf(h.kind) >= 0, h.kind);
  eq(h.game.hints, 1);
  // Gợi ý tiếp tới khi xong
  let x = h.game;
  while (!E.isSolved(x)) x = E.hint(x).game;
  eq(x.hints, 2);
});

test('gợi ý khi đã thắng thì không làm gì', () => {
  const g = E.setCell(E.setCell(handGame(MASK), 0, 0), 1, 1);
  eq(E.hint(g), null);
});

/* ---------------- Sinh đề ---------------- */

test('PRNG theo seed tất định', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  for (let i = 0; i < 5; i++) eq(a(), b());
});

test('sinh đề tất định theo seed', () => {
  const a = E.newGame({ size: 8, seed: 12345 });
  const b = E.newGame({ size: 8, seed: 12345 });
  eq(a.puzzle, b.puzzle);
  eq(a.solution, b.solution);
  const c = E.newGame({ size: 8, seed: 12346 });
  ok(JSON.stringify(c.puzzle) !== JSON.stringify(a.puzzle), 'seed khác phải ra đề khác');
});

test('solver đếm nghiệm: lưới trống có nhiều nghiệm, lời giải đầy có 1, lưới mâu thuẫn có 0', () => {
  eq(E.countSolutions(6, Array(36).fill(-1), 2), 2);
  eq(E.countSolutions(6, SOL6, 2), 1);
  eq(E.countSolutions(6, grid('000...' + EMPTY_ROWS), 2), 0);
});

test('solver đếm nghiệm đếm đúng trên đề có hai nghiệm', () => {
  // Tìm hình chữ nhật a b / b a trong lời giải mà đổi chéo xong vẫn hợp lệ → bỏ trống 4 ô đó là có 2 nghiệm
  let found = null;
  for (let r1 = 0; r1 < 6 && !found; r1++) for (let r2 = r1 + 1; r2 < 6 && !found; r2++)
    for (let c1 = 0; c1 < 6 && !found; c1++) for (let c2 = c1 + 1; c2 < 6 && !found; c2++) {
      const g = SOL6.slice();
      const cells = [r1 * 6 + c1, r1 * 6 + c2, r2 * 6 + c1, r2 * 6 + c2];
      if (g[cells[0]] === g[cells[1]] || g[cells[0]] !== g[cells[3]] || g[cells[1]] !== g[cells[2]]) continue;
      cells.forEach((i) => { g[i] = 1 - g[i]; });
      if (E.isValidSolution(6, g)) found = cells;
    }
  ok(found, 'cần một hình chữ nhật đổi được');
  const p = SOL6.slice();
  found.forEach((i) => { p[i] = -1; });
  eq(E.countSolutions(6, p, 2), 2);
  eq(E.countSolutions(6, p, 5), 2);
});

const SEEDS = { 6: 40, 8: 30, 10: 15, 12: 8 };
E.SIZES.forEach((n) => {
  test('đề ' + n + '×' + n + ': lời giải hợp lệ, khớp ô cho sẵn, đúng một nghiệm trên ' + SEEDS[n] + ' seed', () => {
    for (let s = 1; s <= SEEDS[n]; s++) {
      const g = E.newGame({ size: n, seed: s * 7919 + n });
      eq(g.size, n);
      ok(E.isValidSolution(n, g.solution), 'seed ' + s + ': lời giải sai luật');
      g.puzzle.forEach((v, i) => { if (v !== -1) ok(v === g.solution[i], 'seed ' + s + ': ô cho sẵn lệch lời giải'); });
      eq(E.countSolutions(n, g.puzzle, 2), 1, 'seed ' + s + ': số nghiệm');
      ok(E.emptyCount(g) > (n * n) / 2, 'seed ' + s + ': đề quá dễ (' + E.emptyCount(g) + ' ô trống)');
      eq(g.cells, g.puzzle);
      ok(!E.isSolved(g));
    }
  });
});

test('đề giải được bằng suy luận theo mức của cỡ (không cần đoán)', () => {
  E.SIZES.forEach((n) => {
    for (let s = 1; s <= 5; s++) {
      const g = E.newGame({ size: n, seed: s * 31 + n });
      const r = E.logicSolve(n, g.puzzle, E.levelOf(n));
      ok(r.solved, n + '×' + n + ' seed ' + s);
      eq(r.cells, g.solution);
    }
  });
  // 6×6 (Dễ), 8×8 (Vừa) chỉ cần luật cơ bản: cặp, kẹp giữa, đủ số; 10×10, 12×12 cần suy luận cả đường
  eq(E.SIZES.map(E.levelOf), [1, 1, 2, 2]);
});

test('suy luận cả đường gỡ được chỗ luật cơ bản bế tắc, và luôn đúng với lời giải', () => {
  let stuck = 0;
  for (let s = 1; s <= 10; s++) {
    const g = E.newGame({ size: 10, seed: s });
    const basic = E.logicSolve(10, g.puzzle, 1);
    if (basic.solved) continue;
    stuck++;
    eq(E.logicStep(10, basic.cells, 1), null);
    const step = E.logicStep(10, basic.cells, 2);
    ok(step && step.kind === 'line', 'seed ' + s);
    eq(step.v, g.solution[step.i]);
  }
  ok(stuck > 0, 'đề 10×10 phải có chỗ cần suy luận cả đường');
});

test('suy luận cả đường dùng luật hai hàng không trùng nhau', () => {
  // Hàng 3 bắt đầu 001 như hàng 0 (001011). Dãy hợp lệ bắt đầu 001 chỉ có 001011 và 001101;
  // 001011 đã dùng ở hàng 0 nên hàng 3 phải là 001101. Luật cơ bản không thấy gì.
  const g = grid('001011\n......\n......\n001...\n......\n......');
  eq(E.logicStep(6, g, 1), null);
  eq(E.logicStep(6, g, 2), { i: 23, v: 1, kind: 'line' });
  const r = E.logicSolve(6, g, 2);
  eq(r.cells.slice(18, 24), [0, 0, 1, 1, 0, 1]);
});

test('chơi hết đề bằng gợi ý thì thắng, không bước nào phải đoán', () => {
  E.SIZES.forEach((n) => {
    let g = E.newGame({ size: n, seed: 99 });
    let guard = 0;
    while (!E.isSolved(g) && guard++ < 200) {
      const h = E.hint(g);
      ok(h.kind !== 'guess', n + '×' + n + ': phải đoán ở bước ' + guard);
      g = h.game;
    }
    ok(E.isSolved(g));
    eq(g.cells, g.solution);
  });
});

test('sinh đề đủ nhanh (12×12 trung bình < 100 ms trong Node)', () => {
  const t0 = Date.now();
  for (let s = 0; s < 10; s++) E.newGame({ size: 12, seed: 1000 + s });
  const avg = (Date.now() - t0) / 10;
  ok(avg < 100, 'trung bình ' + avg + ' ms');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử hoàn tác / làm lại)', () => {
  let g = E.newGame({ size: 6, seed: 5 });
  const empties = g.cells.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
  g = E.setCell(g, empties[0], 1);
  g = E.setCell(g, empties[1], 0);
  g = E.undo(g);
  g = E.hint(g).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.setCell(handGame(MASK), 0, 0));
  ok(E.fromJSON(good), 'bản tốt phải nhận');
  const flip = (s, k) => s.slice(0, k) + (s[k] === '0' ? '1' : '0') + s.slice(k + 1);
  const bad = [
    null, 1, 'x', {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { size: 7 }),
    Object.assign({}, good, { seed: 'a' }),
    Object.assign({}, good, { puzzle: good.puzzle.slice(1) }),
    Object.assign({}, good, { cells: '2' + good.cells.slice(1) }),
    Object.assign({}, good, { solution: '.' + good.solution.slice(1) }),
    Object.assign({}, good, { solution: flip(good.solution, 0) }), // lời giải sai luật
    Object.assign({}, good, { cells: flip(good.cells, 2) }), // sửa ô cho sẵn
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { hints: 1.5 }),
    Object.assign({}, good, { undo: [[2, -1, 0]] }), // hoàn tác trên ô cho sẵn
    Object.assign({}, good, { undo: [[0, -1, 5]] }),
    Object.assign({}, good, { undo: 'x' }),
    Object.assign({}, good, { redo: [[0, -1]] }),
  ];
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + k));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
