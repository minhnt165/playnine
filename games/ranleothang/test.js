/* Kiểm tra engine Rắn Leo Thang: chạy `node test.js`
 * - Đánh số ô kiểu zig-zag (1 dưới trái, 100 trên trái) và đổi ô <-> tọa độ
 * - Mọi bàn cố định hợp lệ: không đầu rắn trên chân thang, không nối chuỗi, không rắn ở ô 100
 * - Đi từng ô, leo thang, trượt rắn, dội lại khi vượt 100, tung 6 được tung tiếp, thắng
 * - Xúc xắc theo seed lặp lại được; hàng nghìn ván mô phỏng đều kết thúc với đúng một người thắng
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
  if (!v) throw new Error(msg || 'expected truthy');
}

const EMPTY = { id: 'empty', ladders: [], snakes: [] };
const rowOf = (n) => Math.floor((n - 1) / 10);

/* ---------------- Bàn cờ ---------------- */

test('đánh số zig-zag: 1 dưới trái, 10 dưới phải, 11 trên 10, 100 trên trái', () => {
  eq(E.coord(1), { row: 0, col: 0 });
  eq(E.coord(10), { row: 0, col: 9 });
  eq(E.coord(11), { row: 1, col: 9 });
  eq(E.coord(20), { row: 1, col: 0 });
  eq(E.coord(21), { row: 2, col: 0 });
  eq(E.coord(91), { row: 9, col: 9 });
  eq(E.coord(100), { row: 9, col: 0 });
});

test('ô <-> tọa độ là song ánh trên 100 ô, hai ô liền nhau luôn kề cạnh', () => {
  const seen = new Set();
  for (let n = 1; n <= 100; n++) {
    const { row, col } = E.coord(n);
    ok(row >= 0 && row < 10 && col >= 0 && col < 10, 'ngoài bàn ' + n);
    eq(E.squareAt(row, col), n, 'squareAt(coord(' + n + '))');
    seen.add(row * 10 + col);
    if (n > 1) {
      const p = E.coord(n - 1);
      eq(Math.abs(p.row - row) + Math.abs(p.col - col), 1, 'kề ' + (n - 1) + '-' + n);
    }
  }
  eq(seen.size, 100);
});

test('có ít nhất 3 bàn cố định, id khác nhau', () => {
  ok(E.LAYOUTS.length >= 3, 'chỉ có ' + E.LAYOUTS.length + ' bàn');
  eq(new Set(E.LAYOUTS.map((l) => l.id)).size, E.LAYOUTS.length);
});

test('mọi bàn hợp lệ: rắn đi xuống, thang đi lên, khác hàng, trong 2..99', () => {
  E.LAYOUTS.forEach((l) => {
    eq(E.validateLayout(l), [], l.id);
    ok(l.snakes.length >= 5 && l.ladders.length >= 5, l.id + ' quá ít rắn / thang');
    l.snakes.forEach(([h, t]) => ok(h > t && rowOf(h) !== rowOf(t), l.id + ' rắn ' + h + '->' + t));
    l.ladders.forEach(([f, t]) => ok(f < t && rowOf(f) !== rowOf(t), l.id + ' thang ' + f + '->' + t));
    l.snakes.concat(l.ladders).forEach(([a, b]) => ok(a >= 2 && a <= 99 && b >= 2 && b <= 99, l.id + ' ' + a + '->' + b));
  });
});

test('mọi bàn: không đầu rắn ở chân thang, không nối chuỗi, không rắn ở 100', () => {
  E.LAYOUTS.forEach((l) => {
    const heads = new Set(l.snakes.map((s) => s[0]));
    const feet = new Set(l.ladders.map((s) => s[0]));
    heads.forEach((h) => ok(!feet.has(h), l.id + ': đầu rắn trên chân thang ' + h));
    ok(!heads.has(100), l.id + ': rắn ở 100');
    const starts = new Set([...heads, ...feet]);
    eq(starts.size, l.snakes.length + l.ladders.length, l.id + ': hai lối cùng ô');
    l.snakes.concat(l.ladders).forEach(([, to]) => ok(!starts.has(to), l.id + ': nối chuỗi tại ' + to));
  });
});

test('validateLayout bắt được bàn hỏng', () => {
  const bad = [
    { id: 'x', ladders: [[5, 30]], snakes: [[5, 2]] }, // đầu rắn trên chân thang
    { id: 'x', ladders: [[5, 30]], snakes: [[30, 2]] }, // thang lên đúng đầu rắn (chuỗi)
    { id: 'x', ladders: [], snakes: [[100, 40]] }, // rắn ở 100
    { id: 'x', ladders: [[40, 20]], snakes: [] }, // thang đi xuống
    { id: 'x', ladders: [], snakes: [[20, 40]] }, // rắn đi lên
    { id: 'x', ladders: [[3, 7]], snakes: [] }, // cùng hàng
    { id: 'x', ladders: [[1, 30]], snakes: [] }, // ô 1
    { id: 'x', ladders: [[30, 100]], snakes: [] }, // thang lên thẳng 100
    { id: 'x', ladders: [[2.5, 30]], snakes: [] },
    { id: 'x', ladders: null, snakes: [] },
  ];
  bad.forEach((l) => ok(E.validateLayout(l).length > 0, JSON.stringify(l)));
});

/* ---------------- Đi quân ---------------- */

test('từ ngoài bàn (0) tung 3: đi qua 1, 2, 3', () => {
  eq(E.planMove(EMPTY, 0, 3), { path: [1, 2, 3], landed: 3, to: 3, jump: null, bounced: false });
});

test('đứng ở chân thang thì leo, ở đầu rắn thì trượt', () => {
  const l = { id: 't', ladders: [[4, 25]], snakes: [[27, 5]] };
  eq(E.planMove(l, 1, 3), { path: [2, 3, 4], landed: 4, to: 25, jump: { type: 'ladder', from: 4, to: 25 }, bounced: false });
  eq(E.planMove(l, 25, 2), { path: [26, 27], landed: 27, to: 5, jump: { type: 'snake', from: 27, to: 5 }, bounced: false });
  eq(E.planMove(l, 24, 2).to, 26, 'đi ngang qua đầu rắn thì không sao');
});

test('vượt 100 thì dội lại phần dư', () => {
  eq(E.planMove(EMPTY, 97, 5), { path: [98, 99, 100, 99, 98], landed: 98, to: 98, jump: null, bounced: true });
  eq(E.planMove(EMPTY, 99, 6).to, 95);
  eq(E.planMove(EMPTY, 94, 6), { path: [95, 96, 97, 98, 99, 100], landed: 100, to: 100, jump: null, bounced: false });
});

test('dội lại trúng đầu rắn vẫn bị rắn cắn', () => {
  const l = { id: 't', ladders: [], snakes: [[98, 78]] };
  const m = E.planMove(l, 97, 5);
  eq([m.landed, m.to, m.bounced, m.jump && m.jump.type], [98, 78, true, 'snake']);
});

test('applyRoll: đi quân, chuyển lượt, đếm số lần tung', () => {
  let g = E.newGame({ players: 3, seed: 1, layout: 0 });
  eq([g.pos, g.turn, g.rolls, g.counts, g.winner], [[0, 0, 0], 0, 0, [0, 0, 0], null]);
  const r = E.applyRoll(g, 2);
  g = r.game;
  eq([g.pos, g.turn, g.rolls, g.counts], [[2, 0, 0], 1, 1, [1, 0, 0]]);
  eq([r.move.player, r.move.roll, r.move.from, r.move.to, r.move.extra, r.move.won], [0, 2, 0, 2, false, false]);
  g = E.applyRoll(E.applyRoll(g, 1).game, 1).game;
  eq([g.turn, g.counts], [0, [1, 1, 1]], 'hết vòng quay về người chơi');
});

test('tung 6 được tung tiếp (khi bật), tắt thì chuyển lượt', () => {
  const on = E.applyRoll(E.newGame({ players: 2, seed: 1, layout: 0, extraSix: true }), 6);
  eq([on.game.turn, on.move.extra], [0, true]);
  const off = E.applyRoll(E.newGame({ players: 2, seed: 1, layout: 0, extraSix: false }), 6);
  eq([off.game.turn, off.move.extra], [1, false]);
});

test('về đúng 100 là thắng, ván kết thúc, tung tiếp không đổi gì', () => {
  const g0 = E.newGame({ players: 2, seed: 1, layout: 0 });
  const g = Object.assign({}, g0, { pos: [94, 30], counts: [5, 5], rolls: 10 });
  const r = E.applyRoll(g, 6); // 6 về đích: thắng, không tung thêm
  eq([r.move.won, r.move.extra, r.game.winner, E.isOver(r.game)], [true, false, 0, true]);
  eq(E.applyRoll(r.game, 3).game, r.game);
  eq(E.roll(r.game).move, null);
});

test('máy về 100 trước thì máy thắng', () => {
  const g0 = E.newGame({ players: 4, seed: 1, layout: 0 });
  const g = Object.assign({}, g0, { pos: [50, 60, 98, 10], turn: 2, counts: [3, 3, 2, 2], rolls: 10 });
  const r = E.applyRoll(g, 2);
  eq([r.game.winner, r.game.pos[2]], [2, 100]);
});

test('từ chối số xúc xắc sai', () => {
  const g = E.newGame({ players: 2, seed: 1 });
  [0, 7, 2.5, '3', null].forEach((d) => {
    let threw = false;
    try { E.applyRoll(g, d); } catch (e) { threw = true; }
    ok(threw, String(d));
  });
});

/* ---------------- Xúc xắc theo seed ---------------- */

test('cùng seed: cùng bàn và cùng chuỗi xúc xắc; seed khác thì khác', () => {
  const play = (seed) => {
    let g = E.newGame({ players: 4, seed });
    const seq = [g.layout];
    for (let i = 0; i < 40 && !E.isOver(g); i++) {
      const r = E.roll(g);
      seq.push(r.move.roll);
      g = r.game;
    }
    return seq;
  };
  eq(play(12345), play(12345));
  ok(JSON.stringify(play(12345)) !== JSON.stringify(play(54321)), 'seed khác ra giống hệt');
});

test('xúc xắc đều: 60000 lần tung, mỗi mặt 1..6 ~ 1/6', () => {
  const n = [0, 0, 0, 0, 0, 0, 0];
  let s = 99;
  for (let i = 0; i < 60000; i++) {
    const r = E.nextDie(s);
    s = r.rng;
    ok(Number.isInteger(r.die) && r.die >= 1 && r.die <= 6, 'mặt ' + r.die);
    n[r.die]++;
  }
  for (let d = 1; d <= 6; d++) ok(Math.abs(n[d] - 10000) < 500, 'mặt ' + d + ': ' + n[d]);
});

test('bàn chọn theo seed và mọi bàn đều được chọn', () => {
  const seen = new Set();
  for (let s = 1; s <= 200; s++) seen.add(E.newGame({ players: 2, seed: s }).layout);
  eq(seen.size, E.LAYOUTS.length);
});

/* ---------------- Mô phỏng ---------------- */

test('5000 ván mô phỏng đều kết thúc với đúng một người thắng', () => {
  let maxRolls = 0;
  let total = 0;
  for (let i = 0; i < 5000; i++) {
    const players = 2 + (i % 3);
    let g = E.newGame({ players, seed: i * 7919 + 1, extraSix: i % 2 === 0 });
    let rolls = 0;
    while (!E.isOver(g)) {
      const r = E.roll(g);
      g = r.game;
      rolls++;
      if (rolls > 20000) throw new Error('ván ' + i + ' không kết thúc');
      g.pos.forEach((p) => ok(!E.jumpAt(E.LAYOUTS[g.layout], p), 'đứng lại ở lối ' + p));
    }
    eq(g.pos.filter((p) => p === 100).length, 1, 'ván ' + i);
    eq(g.pos[g.winner], 100);
    eq(g.rolls, rolls);
    eq(g.counts.reduce((a, b) => a + b, 0), rolls);
    maxRolls = Math.max(maxRolls, rolls);
    total += rolls;
  }
  console.log('       (trung bình ' + Math.round(total / 5000) + ' lần tung / ván, dài nhất ' + maxRolls + ')');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (kể cả chuỗi xúc xắc)', () => {
  let g = E.newGame({ players: 3, seed: 777, extraSix: false });
  for (let i = 0; i < 10; i++) g = E.roll(g).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.roll(back), E.roll(g));
});

test('khôi phục ván đã thắng', () => {
  const g0 = E.newGame({ players: 2, seed: 1, layout: 0 });
  const g = E.applyRoll(Object.assign({}, g0, { pos: [94, 30], counts: [5, 5], rolls: 10 }), 6).game;
  eq(E.fromJSON(E.toJSON(g)), g);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.applyRoll(E.newGame({ players: 2, seed: 5, layout: 0 }), 2).game);
  eq(E.fromJSON(good) !== null, true, 'mẫu tốt');
  const head = E.LAYOUTS[0].snakes[0][0];
  const bad = [
    null,
    1,
    'x',
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { layout: E.LAYOUTS.length }),
    Object.assign({}, good, { layout: -1 }),
    Object.assign({}, good, { players: 1, pos: [0], counts: [1] }),
    Object.assign({}, good, { players: 5, pos: [0, 0, 0, 0, 0], counts: [1, 0, 0, 0, 0] }),
    Object.assign({}, good, { pos: [2] }),
    Object.assign({}, good, { pos: [101, 0] }),
    Object.assign({}, good, { pos: [-1, 0] }),
    Object.assign({}, good, { pos: [head, 0] }),
    Object.assign({}, good, { pos: [100, 0] }),
    Object.assign({}, good, { winner: 0 }),
    Object.assign({}, good, { turn: 2 }),
    Object.assign({}, good, { rng: 1.5 }),
    Object.assign({}, good, { rng: -1 }),
    Object.assign({}, good, { extraSix: 'yes' }),
    Object.assign({}, good, { counts: [5, 0] }),
    Object.assign({}, good, { rolls: -1 }),
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
