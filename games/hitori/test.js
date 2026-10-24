/* Kiểm tra engine Hitori: chạy `node test.js`
 * - Luật: tô đen / khoanh tròn theo vòng, hoàn tác / làm lại, phát hiện vi phạm (đen kề nhau, trắng bị cô lập, số trùng)
 * - Thắng: đúng ba luật là thắng (kể cả tô thừa ô vô hại), sai một luật là chưa thắng
 * - Bộ đếm nghiệm: so với vét cạn trên lưới nhỏ, dừng ở giới hạn
 * - Sinh đề: mọi cỡ, nhiều seed, đề có đúng một nghiệm và lời giải hợp luật; cùng seed ra cùng đề
 * - Gợi ý: sửa ô sai trước, rồi tô ô đen còn thiếu; dùng gợi ý đến hết thì thắng
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
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

/** Lưới từ chuỗi các hàng ("12", "21" → [1,2,2,1]). */
const gridOf = (rows) => rows.join('').split('').map(Number);
/** Mảng tô (0/1) từ danh sách ô đen. */
const shadeOf = (size, blacks) => Array.from({ length: size }, (_, i) => (blacks.indexOf(i) >= 0 ? 1 : 0));

/**
 * Vét cạn mọi cách tô (lưới nhỏ) theo đúng định nghĩa nghiệm của engine:
 * ba luật Hitori + "ô tô đen nào cũng cần thiết" (số của nó còn ở một ô trắng cùng hàng / cột).
 */
function bruteCount(n, grid) {
  let count = 0;
  // Bỏ nhanh các cách tô có hai ô đen kề nhau (bit kề ngang không vắt qua mép, bit kề dọc cách n)
  let notLastCol = 0;
  for (let i = 0; i < n * n; i++) if (i % n !== n - 1) notLastCol |= 1 << i;
  for (let mask = 0; mask < 1 << (n * n); mask++) {
    if ((mask & notLastCol & (mask >> 1)) || (mask & (mask >> n))) continue;
    const s = Array.from({ length: n * n }, (_, i) => (mask >> i) & 1);
    if (!E.isValidShading(n, grid, s)) continue;
    let needed = true;
    for (let i = 0; i < n * n && needed; i++) {
      if (!s[i]) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      let found = false;
      for (let k = 0; k < n; k++) {
        const a = r * n + k;
        const b = k * n + c;
        if ((a !== i && !s[a] && grid[a] === grid[i]) || (b !== i && !s[b] && grid[b] === grid[i])) found = true;
      }
      needed = found;
    }
    if (needed) count++;
  }
  return count;
}

/* ---------------- Luật trên lưới ---------------- */

test('isValidShading: lời giải đúng; đen kề nhau, trắng bị chia cắt, số trùng đều sai', () => {
  // 1 1 2
  // 2 3 1
  // 3 2 2
  const g = gridOf(['112', '231', '322']);
  ok(E.isValidShading(3, g, shadeOf(9, [1, 8])), 'tô ô 1 và ô 8 là hợp luật');
  ok(!E.isValidShading(3, g, shadeOf(9, [0, 1, 8])), 'hai ô đen kề nhau');
  ok(!E.isValidShading(3, g, shadeOf(9, [1])), 'còn hai số 2 ở hàng cuối');
  ok(!E.isValidShading(3, g, shadeOf(9, [1, 3, 8])), 'ô 0 bị cô lập');
});

test('lưới toàn số khác nhau (hình vuông Latin): một nghiệm là không tô gì', () => {
  const g = gridOf(['123', '231', '312']);
  const r = E.countSolutions(3, g, 2);
  eq(r.count, 1);
  eq(r.solution, new Array(9).fill(0));
});

test('đề hai nghiệm (tô ô 0, hoặc tô ô 2 và ô 6): bộ đếm dừng ở 2', () => {
  const g = gridOf(['121', '213', '132']);
  eq(E.countSolutions(3, g, 2).count, 2);
  eq(E.countSolutions(3, g, 5).count, 2);
  eq(E.countSolutions(3, g, 1).count, 1, 'giới hạn 1 thì dừng ở nghiệm đầu');
});

test('bộ đếm nghiệm khớp vét cạn trên 400 lưới 4x4 ngẫu nhiên', () => {
  let a = 7;
  const rand = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  const seen = [0, 0, 0];
  for (let k = 0; k < 400; k++) {
    const g = Array.from({ length: 16 }, () => 1 + Math.floor(rand() * 4));
    const brute = bruteCount(4, g);
    const r = E.countSolutions(4, g, 100);
    eq(r.count, brute, 'lưới ' + g.join(''));
    seen[Math.min(brute, 2)]++;
  }
  ok(seen[0] && seen[1] && seen[2], 'có đủ loại 0 / 1 / nhiều nghiệm: ' + seen);
});

/* ---------------- Ván chơi ---------------- */

const game5 = () => E.newGame({ size: 5, seed: 12345 });

test('ván mới: đúng cỡ, chưa đánh dấu, chưa thắng', () => {
  const g = game5();
  eq([g.n, g.grid.length, g.marks.length, g.moves, g.hints], [5, 25, 25, 0, 0]);
  ok(g.marks.every((m) => m === 0));
  ok(!E.isWon(g));
});

test('chạm ô xoay vòng: bình thường → đen → khoanh tròn → bình thường', () => {
  let g = game5();
  g = E.tap(g, 3);
  eq(g.marks[3], E.BLACK);
  g = E.tap(g, 3);
  eq(g.marks[3], E.CIRCLE);
  g = E.tap(g, 3);
  eq(g.marks[3], E.NONE);
  eq(g.moves, 3);
});

test('toggle bật / tắt một dấu: khoanh tròn ô đen thì thành khoanh tròn, lần nữa thì xóa', () => {
  let g = game5();
  g = E.toggle(g, 0, E.CIRCLE);
  eq(g.marks[0], E.CIRCLE);
  g = E.toggle(g, 0, E.CIRCLE);
  eq(g.marks[0], E.NONE);
  g = E.toggle(E.tap(g, 0), 0, E.CIRCLE);
  eq(g.marks[0], E.CIRCLE);
  g = E.toggle(g, 0, E.BLACK);
  eq(g.marks[0], E.BLACK);
  eq(E.toggle(g, 99, E.BLACK), g);
});

test('setMark cùng dấu không tính nước; ô ngoài lưới, dấu lạ bị bỏ qua', () => {
  const g = game5();
  eq(E.setMark(g, 0, E.NONE), g);
  eq(E.setMark(g, 0, 7), g);
  eq(E.tap(g, 25), g);
  eq(E.tap(g, -1), g);
});

test('hoàn tác / làm lại không giới hạn, nước mới xóa nhánh làm lại', () => {
  let g = game5();
  for (let i = 0; i < 5; i++) g = E.tap(g, i);
  ok(E.canUndo(g) && !E.canRedo(g));
  for (let i = 0; i < 5; i++) g = E.undo(g);
  ok(g.marks.every((m) => m === 0), 'về trạng thái đầu');
  ok(!E.canUndo(g) && E.canRedo(g));
  eq(g.moves, 5, 'hoàn tác không trừ số nước đã đi');
  g = E.redo(g);
  g = E.redo(g);
  eq([g.marks[0], g.marks[1], g.marks[2]], [E.BLACK, E.BLACK, E.NONE]);
  g = E.tap(g, 10);
  ok(!E.canRedo(g), 'nước mới xóa nhánh làm lại');
  const fresh = game5();
  eq(E.undo(fresh), fresh, 'hoàn tác khi chưa có nước');
  eq(E.redo(fresh), fresh, 'làm lại khi chưa có gì');
});

test('violations: báo đen kề nhau', () => {
  let g = game5();
  g = E.setMark(g, 0, E.BLACK);
  g = E.setMark(g, 1, E.BLACK);
  const v = E.violations(g);
  eq(v.adjacent, [0, 1]);
});

test('violations: báo ô trắng bị cô lập (góc bị hai ô đen chặn)', () => {
  let g = game5();
  g = E.setMark(g, 1, E.BLACK);
  g = E.setMark(g, 5, E.BLACK);
  eq(E.violations(g).isolated, [0]);
});

test('violations: số trùng còn lại, ô phải tô vì trùng ô khoanh tròn, và hai ô khoanh tròn trùng số là lỗi', () => {
  const g0 = game5();
  let pair = null;
  for (let r = 0; r < 5 && !pair; r++) {
    for (let a = 0; a < 5 && !pair; a++) {
      for (let b = a + 1; b < 5 && !pair; b++) if (g0.grid[r * 5 + a] === g0.grid[r * 5 + b]) pair = [r * 5 + a, r * 5 + b];
    }
  }
  ok(pair, 'đề 5x5 có ít nhất một cặp trùng trong hàng');
  let v = E.violations(g0);
  ok(v.dup.indexOf(pair[0]) >= 0 && v.dup.indexOf(pair[1]) >= 0, 'cặp trùng được báo');
  eq(v.clash, []);
  let g = E.setMark(g0, pair[0], E.CIRCLE);
  eq(E.violations(g).must.indexOf(pair[1]) >= 0, true, 'ô trùng số với ô khoanh tròn thì chắc chắn phải tô');
  ok(E.violations(g).must.indexOf(pair[0]) < 0, 'chính ô khoanh tròn không bị báo phải tô');
  g = E.setMark(g, pair[1], E.CIRCLE);
  v = E.violations(g);
  ok(v.clash.indexOf(pair[0]) >= 0 && v.clash.indexOf(pair[1]) >= 0, 'hai ô khoanh tròn trùng số');
  g = E.setMark(g, pair[1], E.BLACK);
  v = E.violations(g);
  ok(v.dup.indexOf(pair[1]) < 0 && v.clash.indexOf(pair[0]) < 0, 'tô đen một ô thì hết trùng với nó');
});

test('tô đúng lời giải thì thắng; khoanh tròn các ô trắng cũng thắng', () => {
  let g = game5();
  g.solution.forEach((b, i) => { if (b) g = E.setMark(g, i, E.BLACK); });
  ok(E.isWon(g));
  let h = game5();
  h.solution.forEach((b, i) => { h = E.setMark(h, i, b ? E.BLACK : E.CIRCLE); });
  ok(E.isWon(h));
});

test('thiếu một ô đen thì chưa thắng', () => {
  let g = game5();
  const blacks = g.solution.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  blacks.slice(1).forEach((i) => { g = E.setMark(g, i, E.BLACK); });
  ok(!E.isWon(g));
});

test('đã thắng thì chạm / hoàn tác không đổi gì', () => {
  let g = game5();
  g.solution.forEach((b, i) => { if (b) g = E.setMark(g, i, E.BLACK); });
  eq(E.tap(g, 0), g);
  eq(E.undo(g), g);
});

/* ---------------- Gợi ý ---------------- */

test('gợi ý sửa ô tô sai trước', () => {
  let g = game5();
  const white = g.solution.findIndex((b) => !b);
  g = E.setMark(g, white, E.BLACK);
  const h = E.hint(g);
  eq(h.cell, white);
  eq(h.game.marks[white], E.CIRCLE);
  eq(h.game.hints, 1);
  ok(E.canUndo(h.game), 'gợi ý hoàn tác được');
});

test('gợi ý liên tục đến hết thì thắng, số lần gợi ý được đếm', () => {
  let g = E.newGame({ size: 7, seed: 99 });
  let steps = 0;
  while (!E.isWon(g) && steps < 100) {
    const h = E.hint(g);
    ok(h, 'còn gợi ý khi chưa thắng');
    g = h.game;
    steps++;
  }
  ok(E.isWon(g));
  eq(g.hints, steps);
  eq(E.hint(g), null, 'thắng rồi thì hết gợi ý');
});

/* ---------------- Sinh đề ---------------- */

E.SIZES.forEach((n) => {
  const seeds = n === 9 ? 30 : 60;
  test('sinh đề ' + n + 'x' + n + ': ' + seeds + ' seed đều có đúng một nghiệm, lời giải hợp luật', () => {
    for (let s = 1; s <= seeds; s++) {
      const g = E.newGame({ size: n, seed: s * 7919 });
      ok(g.grid.every((v) => Number.isInteger(v) && v >= 1 && v <= n), 'số trong 1..n');
      const r = E.countSolutions(n, g.grid, 2);
      eq(r.count, 1, 'seed ' + s);
      eq(r.solution, g.solution, 'lời giải khớp, seed ' + s);
      ok(E.isValidShading(n, g.grid, g.solution));
      const blacks = g.solution.reduce((a, b) => a + b, 0);
      ok(blacks >= Math.floor(n * n * 0.2), 'đủ ô đen để có việc làm, seed ' + s + ': ' + blacks);
    }
  });
});

test('cùng seed ra cùng đề, khác seed ra đề khác', () => {
  const a = E.newGame({ size: 7, seed: 42 });
  const b = E.newGame({ size: 7, seed: 42 });
  const c = E.newGame({ size: 7, seed: 43 });
  eq(a.grid, b.grid);
  ok(JSON.stringify(a.grid) !== JSON.stringify(c.grid));
});

test('cỡ không hợp lệ thì báo lỗi', () => {
  let threw = false;
  try {
    E.newGame({ size: 6, seed: 1 });
  } catch (e) {
    threw = true;
  }
  ok(threw);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử hoàn tác / làm lại)', () => {
  let g = E.newGame({ size: 7, seed: 5 });
  g = E.tap(g, 0);
  g = E.tap(g, 10);
  g = E.tap(g, 10);
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'khôi phục được');
  eq(back, g);
  eq(E.redo(back).marks[10], E.CIRCLE);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.tap(E.newGame({ size: 5, seed: 8 }), 0));
  ok(E.fromJSON(good), 'mẫu tốt nhận được');
  const bad = [
    null,
    1,
    'x',
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { n: 6 }),
    Object.assign({}, good, { grid: good.grid.slice(1) }),
    Object.assign({}, good, { grid: good.grid.map((v, i) => (i === 0 ? 0 : v)) }),
    Object.assign({}, good, { grid: good.grid.map((v, i) => (i === 0 ? '1' : v)) }),
    Object.assign({}, good, { marks: good.marks.map((m, i) => (i === 0 ? 3 : m)) }),
    Object.assign({}, good, { marks: good.marks.slice(2) }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { hints: 1.5 }),
    Object.assign({}, good, { seed: 'x' }),
    Object.assign({}, good, { history: [{ i: 99, a: 0, b: 1 }] }),
    Object.assign({}, good, { history: 'abc' }),
    Object.assign({}, good, { future: [{ i: 0, a: 0, b: 7 }] }),
    // Lưới không có nghiệm nào (toàn số 1)
    Object.assign({}, good, { grid: new Array(25).fill(1) }),
  ];
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + k));
});

test('lưới ván lưu bị sửa thành đề nhiều nghiệm thì bị từ chối', () => {
  const j = E.toJSON(E.newGame({ size: 5, seed: 3 }));
  const latin = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) latin.push(((r + c) % 5) + 1);
  ok(E.fromJSON(Object.assign({}, j, { grid: latin, marks: new Array(25).fill(0), history: [], future: [] })), 'lưới Latin (một nghiệm) vẫn nhận');
  // Ô 0 đổi thành 3: trùng với ô 2 (cùng hàng) và ô 10 (cùng cột) → tô ô 0, hoặc tô ô 2 và ô 10
  const twin = latin.slice();
  twin[0] = 3;
  eq(E.countSolutions(5, twin, 2).count, 2);
  eq(E.fromJSON(Object.assign({}, j, { grid: twin, marks: new Array(25).fill(0), history: [], future: [] })), null);
});

/* ---------------- Tốc độ sinh đề ---------------- */

test('sinh đề 9x9 đủ nhanh (trung bình < 60 ms trong Node)', () => {
  const t0 = Date.now();
  const k = 30;
  for (let s = 0; s < k; s++) E.newGame({ size: 9, seed: 1000 + s });
  const avg = (Date.now() - t0) / k;
  console.log('       9x9: trung bình ' + avg.toFixed(1) + ' ms / đề');
  ok(avg < 60, 'trung bình ' + avg + ' ms');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
