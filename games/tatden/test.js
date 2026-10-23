/* Kiểm tra engine Tắt Đèn: chạy `node test.js`
 * - Luật: bấm một ô đảo ô đó và 4 ô kề (không tràn qua mép), bấm hai lần trả lại như cũ
 * - Thắng khi tắt hết đèn; sau khi thắng bấm không đổi gì; chơi lại bàn giữ nguyên bàn đầu
 * - Sinh bàn: theo seed, không bao giờ đã tắt sẵn, luôn giải được trong số lần bấm ≤ par, khó dần theo cấp
 * - Bộ giải GF(2): tìm cách tắt ngắn nhất, báo null khi bàn 5x5 không giải được
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
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

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'điều kiện sai');
}

const lit = (lights) => lights.reduce((n, x) => n + x, 0);
const zeros = (size) => new Array(size * size).fill(0);
const on = (lights) => lights.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
/** Bấm lần lượt các ô lên một bàn tắt hết. */
const pattern = (size, cells) => cells.reduce((l, i) => E.toggle(l, size, i), zeros(size));
/** Ván dựng tay từ một bàn đèn (để test luật không phụ thuộc bộ sinh). */
const handGame = (size, start) => ({ size, level: 1, seed: 1, par: 1, start: start.slice(), lights: start.slice(), moves: 0, total: 0 });

/* ---------------- Luật ---------------- */

test('bấm ô giữa đảo chính nó và 4 ô kề', () => {
  eq(on(E.toggle(zeros(5), 5, 12)), [7, 11, 12, 13, 17]);
});

test('bấm góc chỉ đảo 3 ô, bấm mép không tràn sang hàng khác', () => {
  eq(lit(E.toggle(zeros(5), 5, 0)), 3);
  eq(lit(E.toggle(zeros(5), 5, 24)), 3);
  eq(on(E.toggle(zeros(5), 5, 5)), [0, 5, 6, 10]); // đầu hàng 2: không đụng ô 4 (cuối hàng 1)
  eq(on(E.toggle(zeros(7), 7, 13)), [6, 12, 13, 20]); // cuối hàng 2 bàn 7x7: không đụng ô 14
});

test('bấm cùng một ô hai lần trả lại bàn cũ', () => {
  const a = pattern(7, [3, 10, 24]);
  eq(E.toggle(E.toggle(a, 7, 17), 7, 17), a);
});

test('neighbours trả về các ô kề hợp lệ', () => {
  eq(E.neighbours(5, 0).sort((a, b) => a - b), [1, 5]);
  eq(E.neighbours(5, 12).sort((a, b) => a - b), [7, 11, 13, 17]);
  eq(E.neighbours(7, 48).sort((a, b) => a - b), [41, 47]);
});

test('press tăng số nước, tắt hết đèn là thắng', () => {
  let g = handGame(5, pattern(5, [12]));
  ok(!E.isSolved(g));
  g = E.press(g, 12);
  eq([g.moves, g.total, E.isSolved(g), lit(g.lights)], [1, 1, true, 0]);
});

test('press không sửa ván cũ (hàm thuần)', () => {
  const g = handGame(5, pattern(5, [12]));
  const before = JSON.stringify(g);
  E.press(g, 3);
  eq(JSON.stringify(g), before);
});

test('đã thắng thì bấm thêm không đổi gì; ô ngoài bàn bị bỏ qua', () => {
  const g = E.press(handGame(5, pattern(5, [12])), 12);
  eq(E.press(g, 3), g);
  const h = handGame(5, pattern(5, [12]));
  [-1, 25, 1.5, '3', null].forEach((i) => eq(E.press(h, i), h, String(i)));
});

test('restart trả về bàn đầu, số nước về 0 nhưng tổng số lần bấm của ván giữ nguyên', () => {
  let g = handGame(5, pattern(5, [6, 18]));
  g = E.press(g, 0);
  g = E.press(g, 4);
  const r = E.restart(g);
  eq([r.lights, r.moves, r.total], [g.start, 0, 2]);
});

test('litCount đếm số đèn đang sáng', () => {
  eq(E.litCount(pattern(5, [0, 12])), 8);
});

/* ---------------- Sinh bàn ---------------- */

test('PRNG theo seed: cùng seed ra cùng dãy, khác seed ra dãy khác', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const c = E.rng(43);
  const xa = [a(), a(), a()];
  eq(xa, [b(), b(), b()]);
  ok(xa.every((x) => x >= 0 && x < 1));
  ok(JSON.stringify(xa) !== JSON.stringify([c(), c(), c()]));
});

test('cùng seed, cùng cỡ, cùng cấp thì ra cùng bàn', () => {
  eq(E.newGame({ size: 7, level: 4, seed: 99 }), E.newGame({ size: 7, level: 4, seed: 99 }));
});

test('số lần bấm khi sinh bàn tăng dần theo cấp rồi dừng ở trần', () => {
  E.SIZES.forEach((size) => {
    let prev = 0;
    for (let level = 1; level <= 60; level++) {
      const p = E.pressesFor(size, level);
      ok(p >= prev && p >= 1 && p <= size * size, size + ' cấp ' + level + ': ' + p);
      prev = p;
    }
    ok(E.pressesFor(size, 2) > E.pressesFor(size, 1), 'cấp 2 phải khó hơn cấp 1');
    eq(E.pressesFor(size, 1000), E.pressesFor(size, 60), 'có trần');
  });
});

test('bàn mới: chưa tắt sẵn, par = số lần bấm khi sinh, bàn đầu = bàn hiện tại', () => {
  for (let seed = 1; seed <= 300; seed++) {
    E.SIZES.forEach((size) => {
      const level = 1 + (seed % 25);
      const g = E.newGame({ size, level, seed });
      ok(!E.isSolved(g), 'đã tắt sẵn: ' + size + '/' + seed);
      eq([g.size, g.level, g.seed, g.moves, g.total, g.par], [size, level, seed, 0, 0, E.pressesFor(size, level)]);
      eq(g.start, g.lights);
    });
  }
});

test('bàn sinh ra luôn giải được và lời giải ngắn nhất không dài hơn par', () => {
  for (let seed = 1; seed <= 300; seed++) {
    E.SIZES.forEach((size) => {
      const g = E.newGame({ size, level: 1 + (seed % 30), seed: seed * 7919 });
      const sol = E.solve(g.lights, size);
      ok(sol, 'không giải được: ' + size + '/' + seed);
      ok(sol.length <= g.par, 'lời giải ' + sol.length + ' > par ' + g.par);
      // Bấm đúng lời giải thì thắng
      let h = g;
      sol.forEach((i) => { h = E.press(h, i); });
      ok(E.isSolved(h), 'bấm theo lời giải chưa tắt hết');
      eq(h.moves, sol.length);
    });
  }
});

test('seed khác nhau thì ra bàn khác nhau', () => {
  const boards = new Set();
  for (let seed = 1; seed <= 30; seed++) boards.add(E.newGame({ size: 5, level: 3, seed }).lights.join(''));
  ok(boards.size > 20, 'quá ít bàn khác nhau: ' + boards.size);
});

test('newGame từ chối cỡ bàn / cấp không hợp lệ', () => {
  [{ size: 4, level: 1, seed: 1 }, { size: 5, level: 0, seed: 1 }, { size: 7, level: 1.5, seed: 1 }].forEach((o) => {
    let threw = false;
    try {
      E.newGame(o);
    } catch (e) {
      threw = true;
    }
    ok(threw, JSON.stringify(o));
  });
});

/* ---------------- Bộ giải ---------------- */

test('solve: bàn tắt hết cần 0 lần bấm', () => {
  eq(E.solve(zeros(5), 5), []);
  eq(E.solve(zeros(7), 7), []);
});

test('solve: tìm lại đúng một lần bấm', () => {
  eq(E.solve(pattern(5, [12]), 5), [12]);
  eq(E.solve(pattern(7, [0]), 7), [0]);
});

test('solve: bàn 5x5 chỉ một đèn sáng ở góc thì không giải được', () => {
  const l = zeros(5);
  l[0] = 1;
  eq(E.solve(l, 5), null);
  eq(E.solvable(l, 5), false);
  eq(E.solvable(pattern(5, [3]), 5), true);
});

test('solve: bàn 7x7 bất kỳ đều giải được (ma trận khả nghịch)', () => {
  const r = E.rng(5);
  for (let k = 0; k < 50; k++) {
    const l = zeros(7).map(() => (r() < 0.5 ? 1 : 0));
    const sol = E.solve(l, 7);
    ok(sol, 'không giải được');
    eq(sol.reduce((x, i) => E.toggle(x, 7, i), l), zeros(7));
  }
});

test('solve 5x5: lời giải không dài hơn cách bấm đã biết và tắt được hết', () => {
  const r = E.rng(11);
  for (let k = 0; k < 40; k++) {
    const cells = [];
    for (let i = 0; i < 25; i++) if (r() < 0.4) cells.push(i);
    const l = pattern(5, cells);
    const sol = E.solve(l, 5);
    ok(sol && sol.length <= cells.length, 'lời giải dài hơn cách bấm đã biết');
    eq(sol.reduce((x, i) => E.toggle(x, 5, i), l), zeros(5));
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả sau khi bấm và chơi lại)', () => {
  let g = E.newGame({ size: 7, level: 3, seed: 123 });
  g = E.press(g, 10);
  g = E.press(g, 20);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g);
  const r = E.restart(g);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(r)))), r);
});

test('khôi phục ván dựng tay (cách e2e dựng ván lưu)', () => {
  const l = pattern(5, [12]);
  const g = E.fromJSON({ v: 1, size: 5, level: 2, seed: 7, par: 1, start: l, lights: l, moves: 0, total: 1 });
  ok(g, 'phải nhận');
  ok(E.isSolved(E.press(g, 12)));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.press(E.newGame({ size: 5, level: 2, seed: 9 }), 4));
  ok(E.fromJSON(good), 'ván tốt phải nhận');
  const bad = (patch) => Object.assign({}, good, patch);
  const corner = zeros(5);
  corner[0] = 1;
  [
    null,
    1,
    'x',
    {},
    bad({ v: 2 }),
    bad({ size: 6 }),
    bad({ size: '5' }),
    bad({ level: 0 }),
    bad({ level: 2.5 }),
    bad({ seed: -1 }),
    bad({ seed: 'a' }),
    bad({ par: 0 }),
    bad({ par: 26 }),
    bad({ moves: -1 }),
    bad({ total: 0, moves: 1 }),
    bad({ moves: 1.5 }),
    bad({ lights: good.lights.slice(1) }),
    bad({ lights: good.lights.map((x, i) => (i === 0 ? 2 : x)) }),
    bad({ start: 'abc' }),
    bad({ start: zeros(5) }), // bàn đầu đã tắt hết
    bad({ start: corner, lights: corner }), // bàn không giải được
    bad({ lights: null }),
  ].forEach((raw) => {
    eq(E.fromJSON(raw), null, JSON.stringify(raw));
  });
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
