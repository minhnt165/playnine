/* Kiểm tra engine Cờ Tào Cáo (Backgammon): chạy `node test.js`
 * - Thế cờ ban đầu, gieo mở ván (đều thì gieo lại, bên cao đi trước bằng hai số đó)
 * - Sinh nước: vào lại từ bar trước, điểm bị chặn, đánh blot, gỡ quân (đúng số / số dư), đôi đi 4 lần,
 *   luật dùng tối đa số xúc xắc và luật con lớn hơn, đi từng bước / hoàn tác / kết thúc lượt
 * - Hết ván: thắng thường, gammon, backgammon
 * - Số cách gieo đánh trúng blot (bảng chuẩn 36 cách)
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
 * - Máy: luôn đi đúng luật, tất định theo seed; mức mạnh dần (in tỉ lệ để ghi vào README)
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
    console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e));
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

const { HUMAN, AI, BAR, OFF } = E;

/** Mảng 26 ô từ { điểm: số quân } (25 = bar, 0 = đã gỡ); phần còn lại cho vào ô đã gỡ cho đủ 15. */
function side(map) {
  const a = new Array(26).fill(0);
  let n = 0;
  for (const k in map) {
    a[k] = map[k];
    n += map[k];
  }
  a[OFF] += 15 - n;
  return a;
}
/** Dựng ván giữa chừng: lượt `turn` với xúc xắc `dice`. me / op theo góc nhìn từng bên. */
function pos(human, ai, turn, dice) {
  const g = {
    pts: [side(human), side(ai)], base: null, turn, dice: null, steps: [], maxLen: 0, mustDie: 0,
    over: false, winner: -1, result: 0, opening: [3, 1], ties: 0, turns: 4,
  };
  return dice ? E.setDice(g, dice) : g;
}
const stepsOf = (g) => E.legalSteps(g).map((s) => [s.from, s.to, s.die]).sort((x, y) => y[0] - x[0] || y[2] - x[2]);
const play = (g, from, to, die) => {
  const n = E.applyStep(g, { from, to, die });
  if (!n) throw new Error('bước sai luật: ' + [from, to, die]);
  return n;
};

/* ---------------- Thế cờ, mở ván ---------------- */
test('thế cờ ban đầu: 15 quân mỗi bên, pip 167', () => {
  const a = E.startPoints();
  eq(a.reduce((x, y) => x + y, 0), 15);
  eq(E.pip(a), 167);
  eq([a[24], a[13], a[8], a[6]], [2, 5, 3, 5]);
});

test('mở ván: bên gieo cao hơn đi trước bằng chính hai số đó', () => {
  const g = E.newGame({ opening: [5, 3] });
  eq([g.turn, g.dice, g.maxLen], [HUMAN, [5, 3], 2]);
  const h = E.newGame({ opening: [2, 6] });
  eq([h.turn, h.dice], [AI, [2, 6]]);
  let threw = false;
  try {
    E.newGame({ opening: [4, 4] });
  } catch (e) {
    threw = true;
  }
  ok(threw, 'mở ván đều phải bị từ chối');
});

test('mở ván ngẫu nhiên: đều thì gieo lại, không bao giờ đều', () => {
  let sawTie = false;
  for (let s = 1; s <= 200; s++) {
    const g = E.newGame({ rng: E.rng(s) });
    ok(g.opening[0] !== g.opening[1]);
    eq(g.turn, g.opening[0] > g.opening[1] ? HUMAN : AI);
    if (g.ties) sawTie = true;
  }
  ok(sawTie, 'phải có ít nhất một lần gieo đều trong 200 ván');
});

test('PRNG tất định theo seed, xúc xắc 1..6', () => {
  const a = E.rng(42), b = E.rng(42);
  const xs = [], ys = [];
  for (let i = 0; i < 200; i++) {
    xs.push(E.rollDie(a));
    ys.push(E.rollDie(b));
  }
  eq(xs, ys);
  ok(xs.every((d) => d >= 1 && d <= 6));
  for (let d = 1; d <= 6; d++) ok(xs.indexOf(d) >= 0, 'thiếu mặt ' + d);
  const c = E.rng(42);
  c.int(6);
  const st = c.getState();
  const v = c();
  c.setState(st);
  eq(c(), v);
});

/* ---------------- Sinh nước ---------------- */
test('ván mở 3-1: làm điểm 5 (8/5 6/5) là một cách đi hợp lệ', () => {
  const g = E.newGame({ opening: [3, 1] });
  const seqs = E.sequences(g.pts[0], g.pts[1], [3, 1]);
  ok(seqs.length > 10, 'quá ít cách đi: ' + seqs.length);
  ok(seqs.every((s) => s.steps.length === 2));
  ok(seqs.some((s) => s.me[5] === 2 && s.me[8] === 2 && s.me[6] === 4), 'không thấy 8/5 6/5');
  // Không có hai cách đi trùng vị trí cuối
  const keys = new Set(seqs.map((s) => s.me.join() + '|' + s.op.join()));
  eq(keys.size, seqs.length);
});

test('đôi đi 4 lần', () => {
  const g = E.newGame({ opening: [6, 5] });
  const h = E.setDice(E.endTurn(play(play(g, 24, 18, 6), 18, 13, 5)), [3, 3]);
  eq(h.turn, AI);
  eq(h.maxLen, 4);
  eq(E.remaining(h), [3, 3, 3, 3]);
  const seqs = E.sequences(h.pts[1], h.pts[0], [3, 3]);
  ok(seqs.every((s) => s.steps.length === 4));
});

test('không đáp xuống điểm có ≥ 2 quân đối thủ', () => {
  // Máy chiếm điểm 18 của nó = điểm 7 của người
  const g = pos({ 10: 1, 1: 14 }, { 18: 2, 13: 13 }, HUMAN, [3, 5]);
  const s = stepsOf(g);
  ok(!s.some((x) => x[0] === 10 && x[1] === 7), 'không được đáp xuống điểm 7 bị chặn');
  ok(s.some((x) => x[0] === 10 && x[1] === 5));
});

test('đánh blot: quân đối thủ lên bar, pip đối thủ tăng', () => {
  // Máy có 1 quân ở điểm 20 của nó = điểm 5 của người
  const g = pos({ 8: 2, 6: 13 }, { 20: 1, 24: 14 }, HUMAN, [3, 1]);
  const pipBefore = E.pip(g.pts[1]);
  const hitStep = E.legalSteps(g).find((s) => s.from === 8 && s.to === 5);
  ok(hitStep && hitStep.hit, 'bước 8/5 phải là đánh');
  const h = play(g, 8, 5, 3);
  eq([h.pts[1][20], h.pts[1][BAR], h.pts[0][5]], [0, 1, 1]);
  eq(E.pip(h.pts[1]), pipBefore - 20 + 25);
});

test('có quân trên bar thì phải vào lại trước', () => {
  const g = pos({ 25: 1, 13: 5, 6: 9 }, { 24: 15 }, HUMAN, [4, 2]);
  const first = stepsOf(g);
  ok(first.length > 0 && first.every((x) => x[0] === BAR), 'chỉ được đi từ bar: ' + JSON.stringify(first));
  eq(first.map((x) => x[1]).sort(), [21, 23]);
  const h = play(g, BAR, 21, 4);
  ok(stepsOf(h).some((x) => x[0] !== BAR), 'vào xong thì đi quân khác được');
});

test('vào bar bị chặn cả hai số: không đi được gì', () => {
  // Máy chiếm điểm 1..6 của nó = điểm 24..19 của người: vào bằng số nào cũng bị chặn
  const g = pos({ 25: 1, 6: 14 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 }, HUMAN, [3, 5]);
  eq(g.maxLen, 0);
  eq(E.legalSteps(g), []);
  ok(E.turnDone(g), 'không đi được thì lượt xong ngay');
  const seqs = E.sequences(g.pts[0], g.pts[1], [3, 5]);
  eq(seqs.length, 1);
  eq(seqs[0].steps, []);
});

test('hai quân trên bar, chỉ vào được một: các bước khác bị cấm', () => {
  // Điểm 22 (vào bằng 3) mở, điểm 20 (vào bằng 5) bị chặn
  const g = pos({ 25: 2, 6: 13 }, { 5: 2, 10: 13 }, HUMAN, [3, 5]);
  eq(g.maxLen, 1);
  eq(stepsOf(g), [[25, 22, 3]]);
});

test('gỡ quân: chỉ khi cả 15 quân đã về nhà', () => {
  const g = pos({ 7: 1, 3: 14 }, { 24: 15 }, HUMAN, [3, 1]);
  ok(!stepsOf(g).some((x) => x[1] === OFF), 'còn quân ở điểm 7 thì chưa được gỡ');
  const h = play(g, 7, 6, 1);
  ok(stepsOf(h).some((x) => x[0] === 3 && x[1] === OFF), 'về nhà hết thì gỡ đúng số 3');
});

test('gỡ quân bằng số dư: chỉ quân xa nhất', () => {
  const g = pos({ 4: 1, 2: 2 }, { 24: 15 }, HUMAN, [6, 5]);
  const s = stepsOf(g);
  ok(s.some((x) => x[0] === 4 && x[1] === OFF && x[2] === 6), 'số 6 gỡ quân xa nhất ở điểm 4');
  ok(!s.some((x) => x[0] === 2 && x[1] === OFF), 'chưa được gỡ quân ở điểm 2 khi còn quân ở 4');
  const h = play(g, 4, OFF, 6);
  ok(stepsOf(h).some((x) => x[0] === 2 && x[1] === OFF && x[2] === 5), 'sau đó số 5 gỡ quân ở 2');
});

test('luật dùng tối đa số xúc xắc: bỏ bước khiến con kia không đi được', () => {
  // Người: quân ở 13 và 2, gieo 6-1; máy chặn điểm 6 của người (= 19 của máy).
  // 13/7 rồi 2/1 dùng đủ hai con; 13/12 thì con 6 hết đường (12/6 bị chặn, chưa được gỡ) nên bị cấm.
  const g = pos({ 13: 1, 2: 1 }, { 19: 2, 10: 13 }, HUMAN, [6, 1]);
  eq(g.maxLen, 2);
  eq(stepsOf(g), [[13, 7, 6], [2, 1, 1]]);
  const seqs = E.sequences(g.pts[0], g.pts[1], [6, 1]);
  eq(seqs.length, 1);
  eq(seqs[0].steps.length, 2);
});

test('chỉ dùng được một con: phải dùng con lớn hơn', () => {
  // Quân duy nhất ở 8, gieo 5-2; máy chặn điểm 1 của người (= 24 của máy).
  // 8/3 hoặc 8/6 đều được, nhưng sau đó con còn lại đều rơi vào điểm 1 bị chặn: phải đi con 5.
  const g = pos({ 8: 1 }, { 24: 2, 10: 13 }, HUMAN, [5, 2]);
  eq(g.maxLen, 1);
  eq(g.mustDie, 5);
  eq(stepsOf(g), [[8, 3, 5]]);
  const seqs = E.sequences(g.pts[0], g.pts[1], [5, 2]);
  ok(seqs.length === 1 && seqs[0].steps[0][2] === 5, 'máy cũng chỉ được đi con 5');
});

test('chỉ dùng được một con và con lớn bị chặn: dùng con nhỏ', () => {
  // 8/3 (5) bị chặn (3 = 22 của máy), 8/6 (2) được, sau đó 6/1 (5) bị chặn
  const g = pos({ 8: 1 }, { 22: 2, 24: 2, 10: 11 }, HUMAN, [5, 2]);
  eq(g.maxLen, 1);
  eq(g.mustDie, 2);
  eq(stepsOf(g), [[8, 6, 2]]);
});

test('đi từng bước, hoàn tác, kết thúc lượt', () => {
  let g = E.newGame({ opening: [6, 1] });
  ok(!E.turnDone(g));
  eq(E.endTurn(g), null);
  g = play(g, 13, 7, 6);
  eq(E.remaining(g), [1]);
  const u = E.undoStep(g);
  eq([u.steps.length, u.pts[0][13], u.pts[0][7]], [0, 5, 0]);
  g = play(g, 8, 7, 1);
  ok(E.turnDone(g));
  eq(E.applyStep(g, { from: 6, to: 5, die: 1 }), null);
  const n = E.endTurn(g);
  eq([n.turn, n.dice, n.turns], [AI, null, 1]);
  eq(E.applyStep(n, { from: 24, to: 18, die: 6 }), null);
});

test('bước sai luật bị từ chối', () => {
  const g = E.newGame({ opening: [6, 1] });
  eq(E.applyStep(g, { from: 13, to: 8, die: 5 }), null); // không có con 5
  eq(E.applyStep(g, { from: 6, to: OFF, die: 6 }), null); // chưa về nhà hết
  eq(E.applyStep(g, { from: 13, to: 6, die: 6 }), null); // sai điểm đến
  eq(E.applyStep(g, { from: 3, to: 2, die: 1 }), null); // không có quân
  ok(E.applyStep(g, { from: 24, to: 18, die: 6 }), '24/18 hợp lệ');
});

/* ---------------- Hết ván ---------------- */
test('phải dùng cả hai con: 2-1 với quân cuối ở điểm 2 thì đi 2/1* rồi gỡ, không gỡ thẳng', () => {
  const g = pos({ 2: 1 }, { 24: 1, 6: 14 }, HUMAN, [2, 1]);
  eq(g.maxLen, 2);
  eq(stepsOf(g), [[2, 1, 1]]);
  const h = play(play(g, 2, 1, 1), 1, OFF, 2);
  eq([h.over, h.result, h.pts[AI][BAR]], [true, 3, 1]);
});

test('gỡ quân cuối: thắng thường khi đối thủ đã gỡ ít nhất một quân', () => {
  const g = pos({ 1: 1 }, { 6: 5, 5: 5, 4: 4 }, HUMAN, [2, 1]);
  const h = play(g, 1, OFF, 2);
  eq([h.over, h.winner, h.result], [true, HUMAN, 1]);
  eq(E.legalSteps(h), []);
  eq(E.endTurn(h), null);
});

test('gammon: đối thủ chưa gỡ quân nào', () => {
  const g = pos({ 1: 1 }, { 6: 5, 5: 5, 4: 5 }, HUMAN, [2, 1]);
  eq(play(g, 1, OFF, 2).result, 2);
});

test('backgammon: đối thủ chưa gỡ quân nào và còn quân trong nhà bên thắng hoặc trên bar', () => {
  // Máy còn 1 quân ở điểm 24 của nó (= điểm 1 của người, trong nhà người)
  const g = pos({ 2: 1 }, { 24: 1, 6: 14 }, HUMAN, [6, 5]);
  eq(play(g, 2, OFF, 6).result, 3);
  const h = pos({ 2: 1 }, { 25: 1, 6: 14 }, HUMAN, [6, 5]);
  eq(play(h, 2, OFF, 6).result, 3);
  eq(E.resultOf([side({}), side({ 18: 1, 6: 14 })], HUMAN), 2);
});

test('máy thắng: kết quả ghi bên thắng là máy', () => {
  const g = pos({ 6: 15 }, { 1: 1 }, AI, [3, 2]);
  const h = E.playSequence(g, [[1, OFF, 3]]);
  eq([h.over, h.winner, h.result], [true, AI, 2]);
});

/* ---------------- Blot bị lộ ---------------- */
test('số cách gieo đánh trúng blot đúng bảng chuẩn (không bị chặn)', () => {
  const table = { 1: 11, 2: 12, 3: 14, 4: 15, 5: 15, 6: 17, 7: 6, 8: 6, 9: 5, 10: 3, 11: 2, 12: 3, 13: 0, 14: 0, 15: 1, 16: 1, 17: 0, 18: 1, 20: 1, 24: 1 };
  // Quân máy trên bar (tọa độ 25), blot của người ở điểm p: khoảng cách đúng bằng p
  for (const d in table) {
    const p = Number(d);
    eq(E.shots(side({ [p]: 1 }), side({ 25: 1 }), p), table[d], 'khoảng cách ' + d);
  }
});

test('blot bị chặn đường: ít cách đánh hơn', () => {
  // Khoảng cách 8: 6-2, 5-3, 4-4, 2-2 = 6 cách. Người chiếm điểm 4 (= 21 của máy): 4-4 và 2-2 hết đường
  eq(E.shots(side({ 8: 1 }), side({ 25: 1 }), 8), 6);
  eq(E.shots(side({ 8: 1, 4: 2 }), side({ 25: 1 }), 8), 4);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván (kể cả bước đang đi dở trong lượt)', () => {
  let g = E.newGame({ opening: [6, 1] });
  g = play(g, 13, 7, 6);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back.pts, g.pts);
  eq([back.turn, back.dice, back.steps.length, back.maxLen], [g.turn, g.dice, 1, 2]);
  const done = E.endTurn(play(back, 8, 7, 1));
  const back2 = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(done))));
  eq([back2.turn, back2.dice, back2.turns], [AI, null, 1]);
  eq(back2.pts, done.pts);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame({ opening: [6, 1] }));
  const bad = [
    null, 1, {}, Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { turn: 2 }),
    Object.assign({}, good, { dice: [7, 1] }),
    Object.assign({}, good, { dice: [6] }),
    Object.assign({}, good, { steps: [[13, 8, 5]] }),
    Object.assign({}, good, { steps: [[13, 7]] }),
    Object.assign({}, good, { dice: null, steps: [[13, 7, 6]] }),
    Object.assign({}, good, { opening: [3, 3] }),
    Object.assign({}, good, { turns: -1 }),
    Object.assign({}, good, { pts: [good.pts[0], good.pts[1].slice(0, 25)] }),
    Object.assign({}, good, { pts: [good.pts[0].map((x, i) => (i === 6 ? 6 : x)), good.pts[1]] }), // 16 quân
    Object.assign({}, good, { pts: [good.pts[0].map((x, i) => (i === 6 ? '5' : x)), good.pts[1]] }),
    // Hai màu cùng một điểm: người ở 1 và máy ở 24 (cùng ô)
    Object.assign({}, good, { pts: [side({ 1: 1, 6: 14 }), side({ 24: 1, 6: 14 })] }),
    // Ván đã xong
    Object.assign({}, good, { pts: [side({}), side({ 6: 15 })] }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

/* ---------------- Máy ---------------- */
const randomPolicy = (r) => (g) => {
  const seqs = E.sequences(g.pts[g.turn], g.pts[1 - g.turn], g.dice);
  return seqs[r.int(seqs.length)].steps;
};
const levelPolicy = (level) => (g, seed) => E.chooseMove(g, { level, seed });

/** Chơi trọn một ván; mỗi chuỗi máy chọn phải hợp lệ (playSequence kiểm từng bước và đủ số bước). */
function playOut(pol0, pol1, seed, check) {
  const r = E.rng(seed);
  let g = E.newGame({ rng: r });
  let guard = 0;
  while (!g.over) {
    if (++guard > 1500) throw new Error('ván quá dài');
    if (!g.dice) g = E.setDice(g, E.rollDice(r));
    const steps = (g.turn === HUMAN ? pol0 : pol1)(g, seed * 7919 + guard);
    if (check) {
      const seqs = E.sequences(g.pts[g.turn], g.pts[1 - g.turn], g.dice);
      ok(seqs.some((s) => JSON.stringify(s.steps.map((x) => x.slice(0, 3))) === JSON.stringify(steps.map((x) => x.slice(0, 3)))), 'chuỗi máy chọn không nằm trong các cách đi');
    }
    const n = E.playSequence(g, steps);
    if (!n) throw new Error('máy đi sai luật: ' + JSON.stringify(steps));
    g = n;
  }
  return g;
}

test('máy cả ba mức luôn đi đúng luật (nhiều ván ngẫu nhiên)', () => {
  for (const lv of ['easy', 'medium']) {
    for (let s = 1; s <= 6; s++) playOut(levelPolicy(lv), randomPolicy(E.rng(s)), 100 + s, true);
  }
  playOut(levelPolicy('hard'), randomPolicy(E.rng(9)), 77, true);
});

test('máy tất định theo seed', () => {
  const g = E.setDice(E.endTurn(play(play(E.newGame({ opening: [3, 1] }), 8, 5, 3), 6, 5, 1)), [6, 4]);
  for (const lv of E.LEVELS) eq(E.chooseMove(g, { level: lv, seed: 5 }), E.chooseMove(g, { level: lv, seed: 5 }), lv);
});

test('máy Vừa / Khó làm điểm 5 với 3-1 mở ván', () => {
  const g = E.newGame({ opening: [1, 3] }); // máy đi trước với 3-1
  for (const lv of ['medium', 'hard']) {
    const steps = E.chooseMove(g, { level: lv, seed: 1 });
    const h = E.playSequence(g, steps);
    eq([h.pts[AI][5], h.pts[AI][8], h.pts[AI][6]], [2, 2, 4], lv);
  }
});

test('máy Vừa đánh blot khi đánh được an toàn', () => {
  // Người để blot ở điểm 20 (= 5 của máy); máy có 3 quân ở 8 và 2 ở 6 → 8/5* 6/5 bằng 3-1 vừa đánh vừa làm điểm
  const g = pos({ 20: 1, 6: 10, 8: 4 }, { 8: 3, 6: 5, 13: 5, 24: 2 }, AI, [3, 1]);
  const h = E.playSequence(g, E.chooseMove(g, { level: 'medium', seed: 3 }));
  eq([h.pts[HUMAN][BAR], h.pts[AI][5]], [1, 2]);
});

test('máy Khó nghĩ đủ nhanh (trung bình một nước)', () => {
  const r = E.rng(11);
  let g = E.newGame({ rng: r });
  let n = 0, total = 0, worst = 0;
  while (!g.over && n < 30) {
    if (!g.dice) g = E.setDice(g, E.rollDice(r));
    const t0 = Date.now();
    const steps = E.chooseMove(g, { level: 'hard', seed: n });
    const dt = Date.now() - t0;
    total += dt;
    worst = Math.max(worst, dt);
    n++;
    g = E.playSequence(g, steps);
  }
  console.log('       Khó: ' + n + ' nước, trung bình ' + Math.round(total / n) + ' ms, chậm nhất ' + worst + ' ms');
  ok(total / n < 300, 'Khó quá chậm');
});

/** Tỉ lệ thắng của pol0 trước pol1 qua `games` ván, đổi lượt nhau đi trước nhờ seed. */
function rate(pol0, pol1, games, seed0) {
  let w = 0, pts = 0, opPts = 0;
  for (let i = 0; i < games; i++) {
    const g = playOut(pol0, pol1, seed0 + i);
    if (g.winner === HUMAN) {
      w++;
      pts += g.result;
    } else opPts += g.result;
  }
  return { w, games, pct: Math.round((w / games) * 100), pts, opPts };
}

const t0 = Date.now();
test('mức mạnh dần: Vừa thắng bot ngẫu nhiên gần như luôn luôn', () => {
  const r = rate(levelPolicy('medium'), randomPolicy(E.rng(1)), 100, 1000);
  console.log('       Vừa vs ngẫu nhiên: ' + r.w + '/' + r.games + ' (' + r.pct + '%), điểm ' + r.pts + '-' + r.opPts);
  ok(r.pct >= 90, 'Vừa phải thắng ≥ 90%');
});
test('mức mạnh dần: Dễ vẫn thắng bot ngẫu nhiên', () => {
  const r = rate(levelPolicy('easy'), randomPolicy(E.rng(2)), 100, 2000);
  console.log('       Dễ vs ngẫu nhiên: ' + r.w + '/' + r.games + ' (' + r.pct + '%)');
  ok(r.pct >= 60, 'Dễ phải hơn ngẫu nhiên');
});
test('mức mạnh dần: Vừa thắng Dễ', () => {
  const r = rate(levelPolicy('medium'), levelPolicy('easy'), 200, 3000);
  console.log('       Vừa vs Dễ: ' + r.w + '/' + r.games + ' (' + r.pct + '%), điểm ' + r.pts + '-' + r.opPts);
  ok(r.pct >= 58, 'Vừa phải thắng Dễ rõ');
});
test('mức mạnh dần: Khó thắng Dễ rõ rệt', () => {
  const r = rate(levelPolicy('hard'), levelPolicy('easy'), 60, 4000);
  console.log('       Khó vs Dễ: ' + r.w + '/' + r.games + ' (' + r.pct + '%), điểm ' + r.pts + '-' + r.opPts);
  ok(r.pct >= 65, 'Khó phải thắng Dễ ≥ 65%');
});
test('mức mạnh dần: Khó không thua Vừa', () => {
  const r = rate(levelPolicy('hard'), levelPolicy('medium'), 60, 5000);
  console.log('       Khó vs Vừa: ' + r.w + '/' + r.games + ' (' + r.pct + '%), điểm ' + r.pts + '-' + r.opPts);
  ok(r.pct >= 50, 'Khó phải thắng Vừa ít nhất một nửa');
});
console.log('       (mô phỏng mức mạnh: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
