/* Kiểm tra engine Tính 24: chạy `node test.js`
 * - Phân số: cộng trừ nhân chia, tối giản, chia cho 0
 * - Bộ giải: so với một bộ giải vét cạn độc lập (số thực) trên cả 1820 tập 4 số 1–13, đếm biểu thức khác nhau,
 *   phân loại độ khó, các bước gợi ý luôn ra 24
 * - Sinh đề: mọi đề sinh ra có lời giải và đúng mức, không trùng trong bộ, tất định theo seed, đủ nhanh
 * - Luật ván: ghép hai ô, ô trống / chia 0 bị từ chối, xong đề sang đề kế, hoàn tác / làm lại, bỏ qua, gợi ý, thắng bộ 5 đề
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
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

/** Mọi tập 4 số 1–13 (không phân biệt thứ tự). */
function allSets() {
  const out = [];
  for (let a = 1; a <= 13; a++) for (let b = a; b <= 13; b++) for (let c = b; c <= 13; c++) for (let d = c; d <= 13; d++) out.push([a, b, c, d]);
  return out;
}

/** Bộ giải độc lập bằng số thực (sai số 1e-9) chỉ để kiểm tra có giải được không. */
function floatSolvable(nums) {
  if (nums.length === 1) return Math.abs(nums[0] - 24) < 1e-9;
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (i === j) continue;
      const rest = nums.filter((_, k) => k !== i && k !== j);
      const a = nums[i];
      const b = nums[j];
      const vals = [a + b, a - b, a * b];
      if (b !== 0) vals.push(a / b);
      for (const v of vals) if (floatSolvable(rest.concat([v]))) return true;
    }
  }
  return false;
}

/** Áp các bước { a, op, b } lên 4 ô, trả giá trị còn lại (phân số) hoặc null nếu bước sai. */
function runSteps(values, steps) {
  let s = { values: values.slice(), orig: values.map(() => true) };
  for (const st of steps) {
    s = E.stepSlots(s, st.a, st.op, st.b);
    if (!s) return null;
  }
  const live = s.values.filter(Boolean);
  return live.length === 1 ? live[0] : null;
}

const fr = (nums) => nums.map((n) => E.frac(n));

/** Chơi hết đề hiện tại bằng bộ giải. */
function solveCurrent(g) {
  const steps = E.findSteps(E.slotsOf(g).values);
  ok(steps && steps.length, 'đề không có lời giải: ' + E.current(g));
  for (const st of steps) g = E.combine(g, st.a, st.op, st.b);
  return g;
}

/* ---------------- Phân số ---------------- */

test('phân số: tối giản, mẫu dương, bốn phép tính', () => {
  eq(E.frac(6, 4), [3, 2]);
  eq(E.frac(3, -6), [-1, 2]);
  eq(E.frac(0, 5), [0, 1]);
  eq(E.calc(E.frac(8), '/', E.frac(3)), [8, 3]);
  eq(E.calc(E.frac(3), '-', E.frac(8, 3)), [1, 3]);
  eq(E.calc(E.frac(8), '/', E.frac(1, 3)), [24, 1]);
  eq(E.calc(E.frac(2, 3), '*', E.frac(3, 4)), [1, 2]);
  eq(E.calc(E.frac(1, 2), '+', E.frac(1, 3)), [5, 6]);
  eq(E.calc(E.frac(2), '-', E.frac(5)), [-3, 1]);
  eq(E.fracText([-8, 3]), '-8/3');
  eq(E.fracText([24, 1]), '24');
});

test('chia cho 0 bị từ chối', () => {
  eq(E.calc(E.frac(5), '/', E.frac(0)), null);
});

/* ---------------- Bộ giải ---------------- */

const SETS = allSets();
const ANALYSIS = new Map(SETS.map((s) => [s.join(','), E.analyze(s)]));

test('bộ giải khớp bộ giải số thực trên cả 1820 tập số (1362 giải được)', () => {
  let solvable = 0;
  for (const s of SETS) {
    const a = ANALYSIS.get(s.join(','));
    eq(a.count > 0, floatSolvable(s), s.join(','));
    if (a.count > 0) solvable++;
  }
  eq(SETS.length, 1820);
  eq(solvable, 1362);
});

test('đếm biểu thức khác nhau: giao hoán / kết hợp tính là một', () => {
  // 6+6+6+6 và 6×6−6−6
  eq(E.analyze([6, 6, 6, 6]).count, 2);
  // chỉ (1+1+1)×8
  eq(E.analyze([1, 1, 1, 8]).count, 1);
  // thứ tự số không đổi kết quả
  eq(E.analyze([8, 3, 8, 3]).count, E.analyze([3, 3, 8, 8]).count);
  eq(E.analyze([1, 1, 1, 1]).count, 0);
});

test('đề cần phân số: 3 3 8 8, 1 5 5 5, 1 3 4 6 chỉ có lời giải qua phân số', () => {
  [[3, 3, 8, 8], [1, 5, 5, 5], [1, 3, 4, 6]].forEach((s) => {
    const a = E.analyze(s);
    ok(a.count > 0, s + ' giải được');
    eq(a.intPath, false, s.join(','));
  });
  eq(E.analyze([4, 4, 10, 10]).intPath, true);
});

test('phân loại độ khó', () => {
  eq(E.classify([3, 3, 8, 8]), 'hard');
  eq(E.classify([4, 4, 10, 10]), 'hard');
  eq(E.classify([1, 1, 1, 1]), null);
  let easy = 0;
  let hard = 0;
  for (const s of SETS) {
    const c = E.classify(s);
    const a = ANALYSIS.get(s.join(','));
    if (c === 'easy') {
      easy++;
      ok(a.count >= E.EASY_MIN && a.intPath, 'easy ' + s);
    } else if (c === 'hard') {
      hard++;
      ok(a.count > 0 && (a.count <= E.HARD_MAX || !a.intPath), 'hard ' + s);
    } else {
      ok(a.count === 0 || (a.intPath && a.count > E.HARD_MAX && a.count < E.EASY_MIN), 'null ' + s);
    }
  }
  // Mỗi mức đủ nhiều tập số để bộ 5 đề không lặp
  ok(easy >= 200, 'easy ' + easy);
  ok(hard >= 200, 'hard ' + hard);
});

test('các bước tìm được luôn ra 24 (mọi tập số giải được), tập không giải được trả null', () => {
  for (const s of SETS) {
    const steps = E.findSteps(fr(s));
    if (ANALYSIS.get(s.join(',')).count === 0) {
      eq(steps, null, s.join(','));
      continue;
    }
    ok(steps && steps.length === 3, 'ba bước ' + s);
    eq(runSteps(fr(s), steps), [24, 1], s.join(','));
  }
});

test('các bước tìm từ giữa chừng (ô trống) vẫn ra 24', () => {
  // 3 3 8 8: đã có 8/3 ở ô 0, ô 2 trống
  const slots = [E.frac(8, 3), E.frac(3), null, E.frac(8)];
  const steps = E.findSteps(slots);
  eq(runSteps(slots, steps), [24, 1]);
  // Đường cụt: 3+3=6, 8+8=16 → không ra 24
  eq(E.findSteps([E.frac(6), null, E.frac(16), null]), null);
});

test('viết lời giải thành biểu thức, ngoặc tối thiểu', () => {
  const f = (s) => fr(s);
  eq(E.exprText(f([3, 3, 8, 8]), [{ a: 2, op: '/', b: 0 }, { a: 1, op: '-', b: 0 }, { a: 3, op: '/', b: 0 }]), '8 ÷ (3 − 8 ÷ 3)');
  eq(E.exprText(f([1, 2, 3, 4]), [{ a: 0, op: '+', b: 1 }, { a: 1, op: '+', b: 2 }, { a: 2, op: '*', b: 3 }]), '(1 + 2 + 3) × 4');
  eq(E.exprText(f([2, 3, 4, 5]), [{ a: 0, op: '-', b: 1 }, { a: 2, op: '-', b: 1 }]), null, 'chưa gộp về một ô');
  eq(E.exprText(f([9, 3, 1, 1]), [{ a: 0, op: '-', b: 1 }, { a: 2, op: '-', b: 3 }, { a: 1, op: '-', b: 3 }]), '9 − 3 − (1 − 1)');
  eq(E.exprText([E.frac(-8, 3), null, null, null], []), '−8/3');
  // Biểu thức của mọi lời giải tính lại bằng số thực đúng 24
  for (const s of SETS.filter((_, i) => i % 7 === 0)) {
    const text = E.solutionText(s);
    if (!text) continue;
    const v = Function('return ' + text.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/'))();
    ok(Math.abs(v - 24) < 1e-9, text + ' = ' + v);
  }
});

/* ---------------- Sinh đề ---------------- */

test('mọi đề sinh ra có lời giải và đúng mức (200 bộ mỗi mức, cả đề bỏ qua)', () => {
  E.MODES.forEach((mode) => {
    for (let seed = 1; seed <= 200; seed++) {
      let g = E.newGame({ mode, seed });
      for (let k = 0; k < 6; k++) g = E.skip(g);
      eq(g.deck.length, 7);
      g.deck.forEach((p) => {
        const a = E.analyze(p);
        ok(a.count > 0, 'giải được ' + p);
        eq(E.classify(p), mode, p.join(','));
      });
      const keys = g.deck.map((p) => p.slice().sort((x, y) => x - y).join(','));
      eq(new Set(keys).size, keys.length, 'không trùng trong bộ');
    }
  });
});

test('sinh đề tất định theo seed (số hoặc chuỗi)', () => {
  eq(E.newGame({ mode: 'easy', seed: 42 }), E.newGame({ mode: 'easy', seed: 42 }));
  eq(E.newGame({ mode: 'hard', seed: '2026-10-24' }).deck, E.newGame({ mode: 'hard', seed: '2026-10-24' }).deck);
  let a = E.newGame({ mode: 'hard', seed: 9 });
  let b = E.newGame({ mode: 'hard', seed: 9 });
  a = solveCurrent(a);
  b = solveCurrent(b);
  eq(a.deck, b.deck);
  ok(JSON.stringify(E.newGame({ mode: 'easy', seed: 1 }).deck) !== JSON.stringify(E.newGame({ mode: 'easy', seed: 2 }).deck), 'seed khác thì đề khác');
});

test('mode lạ thì về easy', () => {
  eq(E.newGame({ mode: 'x', seed: 1 }).mode, 'easy');
});

test('sinh đề đủ nhanh (một bộ 5 đề)', () => {
  E.MODES.forEach((mode) => {
    let worst = 0;
    let total = 0;
    for (let seed = 1000; seed < 1100; seed++) {
      const t0 = process.hrtime.bigint();
      let g = E.newGame({ mode, seed });
      for (let k = 0; k < 4; k++) g = E.skip(g);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      worst = Math.max(worst, ms);
      total += ms;
    }
    console.log('       ' + mode + ': trung bình ' + (total / 100).toFixed(1) + ' ms / bộ, chậm nhất ' + worst.toFixed(1) + ' ms');
    ok(worst < 150, mode + ' chậm nhất ' + worst);
  });
});

/* ---------------- Luật ván ---------------- */

/** Ván dựng tay với đề cho trước (đề hiện tại là phần tử cuối của deck). */
function gameWith(nums, extra) {
  return Object.assign({ mode: 'hard', rng: 12345, deck: [nums], done: 0, skips: 0, hints: 0, moves: 0, steps: [] }, extra || {});
}

test('ván mới: đề đầu, chưa đi nước nào', () => {
  const g = E.newGame({ mode: 'easy', seed: 3 });
  eq([g.done, g.skips, g.hints, g.moves, g.steps.length, g.deck.length], [0, 0, 0, 0, 0, 1]);
  eq(E.isWon(g), false);
  eq(E.slotsOf(g).orig, [true, true, true, true]);
});

test('ghép hai ô: kết quả vào ô chạm sau, ô kia trống', () => {
  let g = gameWith([3, 3, 8, 8]);
  g = E.combine(g, 2, '/', 0);
  const s = E.slotsOf(g);
  eq(s.values, [[8, 3], [3, 1], null, [8, 1]]);
  eq(s.orig, [false, true, false, true]);
  eq([g.moves, g.steps.length], [1, 1]);
});

test('bước sai bị từ chối: cùng ô, ô trống, chia cho 0, phép lạ', () => {
  let g = gameWith([3, 3, 8, 8]);
  eq(E.combine(g, 1, '+', 1), g);
  eq(E.combine(g, 1, '%', 2), g);
  eq(E.combine(g, 1, '+', 9), g);
  g = E.combine(g, 0, '-', 1); // 3 − 3 = 0 ở ô 1
  eq(E.combine(g, 0, '+', 1), g, 'ô 0 đã trống');
  eq(E.combine(g, 2, '/', 1), g, 'chia cho 0');
});

test('ra 24 thì xong đề, rút đề kế; ghép hết mà không ra 24 thì kẹt', () => {
  let g = gameWith([3, 3, 8, 8]);
  g = E.combine(g, 2, '/', 0);
  g = E.combine(g, 1, '-', 0);
  eq(E.isStuck(g), false);
  g = E.combine(g, 3, '/', 0);
  eq([g.done, g.deck.length, g.steps.length, g.moves], [1, 2, 0, 3]);
  eq(E.classify(E.current(g)), 'hard');
  let s = gameWith([3, 3, 8, 8]);
  s = E.combine(s, 0, '+', 1);
  s = E.combine(s, 2, '+', 3);
  s = E.combine(s, 1, '+', 3);
  eq(E.isStuck(s), true);
  eq(s.done, 0);
});

test('hoàn tác từng bước và làm lại đề', () => {
  let g = gameWith([3, 3, 8, 8]);
  eq(E.canUndo(g), false);
  eq(E.undo(g), g);
  g = E.combine(g, 0, '+', 1);
  g = E.combine(g, 2, '+', 3);
  g = E.undo(g);
  eq(E.slotsOf(g).values, [null, [6, 1], [8, 1], [8, 1]]);
  g = E.combine(g, 2, '*', 3);
  g = E.reset(g);
  eq(E.slotsOf(g).values, fr([3, 3, 8, 8]));
  eq(g.moves, 3, 'hoàn tác không trừ số nước');
});

test('bỏ qua: đề khác cùng mức, không tăng số đề đã giải', () => {
  let g = E.newGame({ mode: 'hard', seed: 5 });
  g = E.combine(g, 0, '+', 1);
  const before = E.current(g);
  g = E.skip(g);
  eq([g.done, g.skips, g.steps.length, g.deck.length], [0, 1, 0, 2]);
  ok(JSON.stringify(E.current(g)) !== JSON.stringify(before));
  eq(E.classify(E.current(g)), 'hard');
});

test('giải đủ 5 đề là thắng bộ; sau đó mọi thao tác không đổi gì', () => {
  E.MODES.forEach((mode) => {
    for (let seed = 1; seed <= 30; seed++) {
      let g = E.newGame({ mode, seed });
      for (let k = 0; k < E.SET_SIZE; k++) {
        eq(E.isWon(g), false);
        eq(g.done, k);
        g = solveCurrent(g);
      }
      eq(E.isWon(g), true);
      eq(g.deck.length, E.SET_SIZE, 'không rút thêm đề sau đề cuối');
      eq(g.moves, 15);
      eq(E.progress(g), 1);
      eq(E.combine(g, 0, '+', 1), g);
      eq(E.skip(g), g);
      eq(E.undo(g), g);
      eq(E.hint(g), null);
      eq(E.isStuck(g), false);
    }
  });
});

test('gợi ý: bước kế của một lời giải từ trạng thái hiện tại, tăng số gợi ý', () => {
  let g = gameWith([3, 3, 8, 8]);
  g = E.combine(g, 2, '/', 0); // 8/3 ở ô 0
  const h = E.hint(g);
  eq(h.reset, false);
  eq(h.game.hints, 1);
  const next = E.combine(h.game, h.step.a, h.step.op, h.step.b);
  ok(next !== h.game, 'bước gợi ý hợp lệ');
  ok(E.findSteps(E.slotsOf(next).values), 'sau bước gợi ý vẫn giải được');
});

test('gợi ý khi đi vào đường cụt: bảo làm lại đề, kèm bước đầu từ đề gốc', () => {
  let g = gameWith([3, 3, 8, 8]);
  g = E.combine(g, 0, '+', 1); // 6 8 8: không ra 24
  const h = E.hint(g);
  eq(h.reset, true);
  const fresh = E.combine(E.reset(h.game), h.step.a, h.step.op, h.step.b);
  ok(E.findSteps(E.slotsOf(fresh).values), 'bước đầu dẫn tới lời giải');
});

test('tiến độ tính cả bước trong đề hiện tại', () => {
  let g = gameWith([3, 3, 8, 8]);
  eq(E.progress(g), 0);
  g = E.combine(g, 0, '+', 1);
  eq(E.progress(g), 0.05);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (giữa đề, sau bỏ qua, sau gợi ý)', () => {
  let g = E.newGame({ mode: 'easy', seed: 11 });
  g = solveCurrent(g);
  g = E.skip(g);
  g = E.hint(g).game;
  const st = E.findSteps(E.slotsOf(g).values)[0];
  g = E.combine(g, st.a, st.op, st.b);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  // Rút đề sau khi khôi phục vẫn ra đúng dãy đề như ván gốc
  eq(solveCurrent(back).deck, solveCurrent(g).deck);
});

test('khôi phục ván đã thắng', () => {
  let g = E.newGame({ mode: 'hard', seed: 2 });
  for (let k = 0; k < E.SET_SIZE; k++) g = solveCurrent(g);
  eq(E.fromJSON(E.toJSON(g)), g);
});

test('từ chối dữ liệu hỏng', () => {
  const base = E.toJSON(E.combine(gameWith([3, 3, 8, 8]), 2, '/', 0));
  ok(E.fromJSON(base), 'bản gốc hợp lệ');
  const bad = (patch) => Object.assign({}, base, patch);
  [
    null, 1, 'x', {},
    bad({ v: 2 }),
    bad({ mode: 'medium' }),
    bad({ rng: -1 }),
    bad({ rng: 1.5 }),
    bad({ done: -1 }),
    bad({ done: 6 }),
    bad({ hints: '1' }),
    bad({ moves: 0 }), // ít hơn số bước đang có
    bad({ deck: [[3, 3, 8]] }),
    bad({ deck: [[3, 3, 8, 14]] }),
    bad({ deck: [[0, 3, 8, 8]] }),
    bad({ deck: [[3, 3, 8, 8], [1, 2, 3, 4]] }), // dư đề so với done + skips
    bad({ deck: [[1, 1, 1, 1]], steps: [] }), // đề không giải được
    bad({ steps: [[2, '/', 2]] }),
    bad({ steps: [[2, '^', 0]] }),
    bad({ steps: [[2, '/', 0], [2, '+', 1]] }), // ô 2 đã trống
    bad({ steps: [[0, '-', 1], [2, '/', 1]] }), // chia cho 0
    bad({ steps: [[2, '/', 0], [1, '-', 0], [3, '/', 0]], moves: 3 }), // đã ra 24 mà chưa sang đề
    bad({ steps: [[0, '+', 1], [2, '+', 3], [1, '+', 3], [3, '+', 1]], moves: 4 }),
    bad({ steps: 'x' }),
    bad({ steps: [[0, '+']] }),
    bad({ done: 5, skips: 0, deck: [[3, 3, 8, 8]] }),
  ].forEach((raw) => {
    eq(E.fromJSON(raw), null, JSON.stringify(raw));
  });
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
