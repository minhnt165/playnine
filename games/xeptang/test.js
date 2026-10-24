/* Kiểm tra engine Xếp Tầng: chạy `node test.js`
 * - Cắt khối: lệch trái / phải trên hai trục, khớp đúng, hít khớp trong dung sai "hoàn hảo", trượt hẳn
 * - Luật mọc lại sau chuỗi hoàn hảo và trần kích thước, điểm thưởng chuỗi
 * - Chuyển động qua lại, tốc độ tăng chậm có trần, không thả được trước khoảng tối thiểu
 * - Trượt hẳn là hết ván; tất định theo seed + thời điểm thả; bot thả đúng chơi mãi không thua
 * - Lưu / khôi phục qua JSON và từ chối dữ liệu hỏng
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'sai');
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'nhận ' + x + ', cần ' + y);
}

function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg ? msg + ': ' : '') + 'nhận ' + a + ', cần ' + b + ' ± ' + tol);
}

const blk = (x, z, w, d) => ({ x, z, w, d });
const B = E.BASE;

/** Thời gian (ms, tính từ lúc khối hiện ra) để khối đang trượt tới độ lệch `off` ở lượt đi đầu tiên. */
function timeToOffset(g, off) {
  const dist = E.SPAN - off * g.cur.side; // quãng đã đi kể từ mép xuất phát
  assert(dist >= 0 && dist <= 2 * E.SPAN, 'độ lệch ngoài đường trượt');
  return (dist / g.cur.v) * 1000;
}

/** Cho thời gian trôi tới đúng lúc khối lệch `off` rồi thả (bước thời gian tùy ý để thử chính xác). */
function dropAt(g, off) {
  const need = timeToOffset(g, off) - (g.t - g.cur.spawnT);
  if (need > 0) g = E.step(g, need);
  return E.drop(g);
}

/* ---------------- Cắt khối ---------------- */

test('lệch phải trên trục x: phần thừa bên phải rơi, phần chồng lên thành tầng mới', () => {
  const r = E.slice(blk(0, 0, 100, 100), blk(30, 0, 100, 100), 'x');
  eq(r.kind, 'place');
  eq(r.placed, blk(15, 0, 70, 100));
  eq(r.cut, blk(65, 0, 30, 100));
  eq(r.side, 1);
});

test('lệch trái trên trục z: phần thừa phía sau rơi, trục x giữ nguyên', () => {
  const r = E.slice(blk(5, 0, 60, 100), blk(5, -40, 60, 100), 'z');
  eq(r.kind, 'place');
  eq(r.placed, blk(5, -20, 60, 60));
  eq(r.cut, blk(5, -70, 60, 40));
  eq(r.side, -1);
});

test('lệch trái trên trục x với khối hẹp', () => {
  const r = E.slice(blk(10, 4, 40, 30), blk(-15, 4, 40, 30), 'x');
  eq(r.placed, blk(-2.5, 4, 15, 30));
  eq(r.cut, blk(-22.5, 4, 25, 30));
  eq(r.side, -1);
});

test('khớp đúng: hoàn hảo, không có phần rơi', () => {
  const r = E.slice(blk(12, -8, 70, 55), blk(12, -8, 70, 55), 'z');
  eq(r.kind, 'perfect');
  eq(r.placed, blk(12, -8, 70, 55));
  eq(r.cut, null);
});

test('lệch trong dung sai thì hít khớp đúng vị trí tầng dưới', () => {
  const tol = E.perfectTol(100);
  eq(tol, E.PERFECT_TOL);
  [tol, -tol, tol * 0.5].forEach((off) => {
    const r = E.slice(blk(0, 0, 100, 100), blk(off, 0, 100, 100), 'x');
    eq(r.kind, 'perfect', 'lệch ' + off);
    eq(r.placed, blk(0, 0, 100, 100));
  });
  const r = E.slice(blk(0, 0, 100, 100), blk(tol + 0.01, 0, 100, 100), 'x');
  eq(r.kind, 'place', 'vừa quá dung sai');
});

test('dung sai thu nhỏ theo khối hẹp (không quá 1/4 bề rộng)', () => {
  eq(E.perfectTol(8), 2);
  eq(E.slice(blk(0, 0, 8, 100), blk(2.5, 0, 8, 100), 'x').kind, 'place');
  eq(E.slice(blk(0, 0, 8, 100), blk(1.5, 0, 8, 100), 'x').kind, 'perfect');
});

test('trượt hẳn (kể cả chạm mép đúng bằng bề rộng) là hụt, cả khối rơi', () => {
  [100, 130, -100, -101].forEach((off) => {
    const r = E.slice(blk(0, 0, 100, 100), blk(off, 0, 100, 100), 'x');
    eq(r.kind, 'miss', 'lệch ' + off);
    eq(r.placed, null);
    eq(r.cut, blk(off, 0, 100, 100));
    eq(r.side, Math.sign(off));
  });
});

/* ---------------- Mọc lại, điểm thưởng, tốc độ ---------------- */

test('mọc lại: chỉ từ hoàn hảo thứ REGROW_FROM liên tiếp, mỗi lần +GROW, không quá BASE', () => {
  eq(E.REGROW_FROM, 3);
  eq(E.regrow(50, 1), 50);
  eq(E.regrow(50, 2), 50);
  eq(E.regrow(50, 3), 50 + E.GROW);
  eq(E.regrow(50, 7), 50 + E.GROW);
  eq(E.regrow(B - 1, 4), B);
  eq(E.regrow(B, 9), B);
});

test('điểm thưởng nhỏ: +1 cho mỗi hoàn hảo từ lần thứ 2 liên tiếp', () => {
  eq([0, 1, 2, 3, 10].map(E.bonusFor), [0, 0, 1, 1, 1]);
});

test('tốc độ tăng chậm, đơn điệu, có trần', () => {
  eq(E.speedFor(0), E.V0);
  let prev = 0;
  for (let n = 0; n < 300; n++) {
    const v = E.speedFor(n);
    assert(v >= prev, 'giảm ở ' + n);
    assert(v <= E.V_MAX, 'vượt trần ở ' + n);
    prev = v;
  }
  eq(E.speedFor(1000), E.V_MAX);
  assert(E.speedFor(10) <= E.V0 * 1.25, 'tăng quá nhanh');
  assert(E.speedFor(10) > E.V0, 'không tăng');
});

test('khoảng thả tối thiểu: không khối nào tới vùng hoàn hảo sớm hơn MIN_DROP_MS, kể cả ở tốc độ trần', () => {
  assert(((E.SPAN - E.PERFECT_TOL) / E.V_MAX) * 1000 >= E.MIN_DROP_MS);
  assert(E.SPAN >= B, 'khối mới phải xuất hiện ngoài tháp');
});

/* ---------------- Ván chơi ---------------- */

test('ván mới: một tầng đế đủ rộng, chưa có điểm, khối đầu trượt trên trục x từ ngoài tháp', () => {
  const g = E.newGame(42);
  eq(g.layers, [blk(0, 0, B, B)]);
  eq([g.blocks, g.score, g.streak, g.over, g.t], [0, 0, 0, false, 0]);
  eq(E.axisOf(g), 'x');
  eq(Math.abs(E.offsetAt(g)), E.SPAN);
  eq(g.cur.v, E.V0);
  const m = E.moving(g);
  eq([m.w, m.d, m.z], [B, B, 0]);
});

test('khối trượt đúng tốc độ, dội lại ở hai mép, chu kỳ 4·SPAN/v', () => {
  let g = E.newGame(3);
  const s = g.cur.side;
  g = E.step(g, 1000);
  near(E.offsetAt(g), s * (E.SPAN - E.V0), 1e-9);
  g = E.step(g, ((2 * E.SPAN) / E.V0) * 1000 - 1000); // tới mép bên kia
  near(E.offsetAt(g), -s * E.SPAN, 1e-9);
  g = E.step(g, 500);
  near(E.offsetAt(g), -s * (E.SPAN - E.V0 / 2), 1e-9, 'đã dội lại');
  const period = ((4 * E.SPAN) / E.V0) * 1000;
  const a = E.offsetAt(g);
  near(E.offsetAt(E.step(g, period)), a, 1e-6);
});

test('bước mặc định là STEP_MS và không đổi ván cũ (hàm thuần)', () => {
  const g = E.newGame(1);
  const json = JSON.stringify(g);
  const h = E.step(g);
  eq(h.t, E.STEP_MS);
  eq(JSON.stringify(g), json);
});

test('thả trước MIN_DROP_MS bị bỏ qua', () => {
  let g = E.newGame(5);
  g = E.step(g, E.MIN_DROP_MS - 1);
  eq(E.canDrop(g), false);
  const r = E.drop(g);
  eq(r.event.kind, 'early');
  eq(r.game, g);
  eq(E.canDrop(E.step(g, 1)), true);
});

test('thả đúng lúc khối qua giữa: hoàn hảo, khối kế tiếp trượt trục z cùng cỡ', () => {
  const { game: g, event } = dropAt(E.newGame(9), 0);
  eq(event.kind, 'perfect');
  eq([g.blocks, g.score, g.streak, g.perfects], [1, 1, 1, 1]);
  eq(g.layers.length, 2);
  eq(E.top(g), blk(0, 0, B, B));
  eq(E.axisOf(g), 'z');
  eq(g.cur.spawnT, g.t);
  eq(g.cur.v, E.speedFor(1));
  eq(Math.abs(E.offsetAt(g)), E.SPAN);
  const m = E.moving(g);
  eq([m.x, m.w, m.d], [0, B, B]);
});

test('thả lệch: tầng mới hẹp lại, khối kế tiếp có cỡ đó, chuỗi hoàn hảo về 0', () => {
  let { game: g } = dropAt(E.newGame(9), 0);
  const r = dropAt(g, -20); // trục z
  g = r.game;
  eq(r.event.kind, 'place');
  near(E.top(g).z, -10, 1e-9);
  near(E.top(g).d, 80, 1e-9);
  eq(E.top(g).w, B);
  near(r.event.cut.d, 20, 1e-9);
  eq(r.event.side, -1);
  eq([g.blocks, g.score, g.streak], [2, 2, 0]);
  const m = E.moving(g);
  near(m.d, 80, 1e-9);
  near(m.z, -10, 1e-9); // khối kế tiếp trượt trục x, giữ z của tầng mới
});

test('chuỗi hoàn hảo: điểm thưởng từ lần 2, mọc lại từ lần 3', () => {
  let g = E.newGame(11);
  g = dropAt(g, 30).game; // x hẹp còn 70
  near(E.top(g).w, 70, 1e-9);
  g = dropAt(g, 25).game; // z hẹp còn 75
  near(E.top(g).d, 75, 1e-9);
  const sizes = [];
  const events = [];
  for (let i = 0; i < 4; i++) {
    const r = dropAt(g, 0.5);
    g = r.game;
    events.push([r.event.kind, r.event.streak, r.event.bonus, r.event.grew]);
    sizes.push([Math.round(E.top(g).w * 1e6) / 1e6, Math.round(E.top(g).d * 1e6) / 1e6]);
  }
  eq(events, [
    ['perfect', 1, 0, false],
    ['perfect', 2, 1, false],
    ['perfect', 3, 1, true],
    ['perfect', 4, 1, true],
  ]);
  // lần 3 trượt trục x (đã có 4 tầng), lần 4 trục z
  eq(sizes, [[70, 75], [70, 75], [70 + E.GROW, 75], [70 + E.GROW, 75 + E.GROW]]);
  eq([g.blocks, g.score, g.bestStreak], [6, 6 + 3, 4]);
});

test('mọc lại giữ tâm, không vượt cỡ đế', () => {
  let g = E.newGame(2);
  g = dropAt(g, 3.5 * g.cur.side).game; // x còn 96.5
  near(E.top(g).w, 96.5, 1e-9);
  for (let i = 0; i < 6; i++) g = dropAt(g, 0).game;
  eq(E.top(g).w, B);
  eq(E.top(g).d, B);
  near(E.top(g).x, 1.75 * E.newGame(2).cur.side, 1e-9);
});

test('trượt hẳn là hết ván, điểm giữ nguyên, sau đó không đổi gì nữa', () => {
  let g = dropAt(E.newGame(4), 0).game;
  const r = dropAt(g, -g.cur.side * (E.SPAN - 10)); // lệch 115 > 100, ở lượt đi về phía bên kia
  g = r.game;
  eq(r.event.kind, 'miss');
  eq(g.over, true);
  eq([g.blocks, g.score, g.streak], [1, 1, 0]);
  eq(r.event.cut.d, B);
  eq(E.drop(g).game, g);
  eq(E.drop(g).event.kind, 'over');
  eq(E.step(g, 1000), g);
});

test('tất định theo seed + thời điểm thả', () => {
  const times = [1300, 2500, 3800, 5000, 6100, 7600, 9000];
  const a = E.play(77, times);
  const b = E.play(77, times);
  eq(JSON.stringify(a.game), JSON.stringify(b.game));
  eq(JSON.stringify(a.events), JSON.stringify(b.events));
  const c = E.play(78, times);
  const d = E.play(77, times.map((x) => x + 40));
  assert(JSON.stringify(c.game) !== JSON.stringify(a.game), 'seed khác phải khác');
  assert(JSON.stringify(d.game) !== JSON.stringify(a.game), 'thời điểm khác phải khác');
  eq(a.events.length, times.length);
});

test('play: thả theo bước cố định, thời điểm thả làm tròn lên bội STEP_MS', () => {
  const r = E.play(1, [1001]);
  eq(r.game.t % E.STEP_MS, 0);
  assert(r.game.t >= 1001 && r.game.t < 1001 + E.STEP_MS);
});

test('luôn chơi tiếp được: bot thả đúng giữa 300 tầng trên nhiều seed không bao giờ thua, khối giữ đủ cỡ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let g = E.newGame(seed);
    for (let i = 0; i < 300; i++) {
      const r = dropAt(g, 0);
      assert(r.event.kind === 'perfect', 'seed ' + seed + ' tầng ' + i);
      g = r.game;
    }
    eq([g.over, g.blocks, E.top(g).w, E.top(g).d], [false, 300, B, B]);
    eq(g.cur.v, E.V_MAX);
  }
});

test('khối ra từ hai phía tùy seed', () => {
  const sides = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    let g = E.newGame(seed);
    for (let i = 0; i < 6; i++) {
      sides.add(g.cur.side);
      g = dropAt(g, 0).game;
    }
  }
  eq([...sides].sort(), [-1, 1]);
});

test('điểm = số tầng + thưởng, điểm thưởng tối đa 1 mỗi tầng', () => {
  const times = [];
  let t = 0;
  for (let i = 0; i < 40; i++) {
    t += 900 + ((i * 37) % 400);
    times.push(t);
  }
  for (let seed = 1; seed <= 10; seed++) {
    const r = E.play(seed, times);
    const g = r.game;
    const bonus = r.events.reduce((s, e) => s + (e.bonus || 0), 0);
    eq(g.score, g.blocks + bonus);
    assert(g.score <= 2 * g.blocks);
    eq(g.layers.length, g.blocks + 1);
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván và chạy tiếp giống hệt', () => {
  let g = E.play(21, [1200, 2400, 3700]).game;
  g = E.step(g, 333);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(JSON.stringify(back), JSON.stringify(g));
  const a = E.drop(E.step(g, 400));
  const b = E.drop(E.step(back, 400));
  eq(JSON.stringify(a), JSON.stringify(b));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.play(8, [1200, 2400]).game);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const cases = [
    null,
    1,
    'x',
    {},
    bad({ v: 99 }),
    bad({ layers: [] }),
    bad({ layers: 'x' }),
    bad({ layers: [{ x: 0, z: 0, w: B, d: B }, { x: 0, z: 0, w: -1, d: 3 }, { x: 0, z: 0, w: 5, d: 3 }] }),
    bad({ layers: [{ x: 0, z: 0, w: B, d: B }, { x: NaN, z: 0, w: 5, d: 3 }, { x: 0, z: 0, w: 5, d: 3 }] }),
    bad({ layers: [{ x: 0, z: 0, w: B + 1, d: B }, { x: 0, z: 0, w: 5, d: 3 }, { x: 0, z: 0, w: 5, d: 3 }] }),
    bad({ blocks: 5 }),
    bad({ score: -1 }),
    bad({ score: 1000 }),
    bad({ t: -5 }),
    bad({ t: 'a' }),
    bad({ over: 'no' }),
    bad({ streak: -1 }),
    bad({ rng: 1.5 }),
    bad({ hue0: 400 }),
    bad({ cur: null }),
    bad({ cur: Object.assign({}, good.cur, { side: 0 }) }),
    bad({ cur: Object.assign({}, good.cur, { v: 1e6 }) }),
    bad({ cur: Object.assign({}, good.cur, { spawnT: good.t + 1 }) }),
  ];
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'trường hợp ' + i + ': ' + JSON.stringify(raw)));
  assert(E.fromJSON(good) !== null, 'dữ liệu tốt bị từ chối');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
