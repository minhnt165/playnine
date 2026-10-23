/* Kiểm tra engine Xí Ngầu: chạy `node test.js`
 * - Cách tính điểm của từng ô (kể cả case biên: sảnh có xúc xắc trùng, cù lũ và ngũ quý, luật joker)
 * - Thưởng phần trên, tổng điểm, giới hạn 3 lần lắc, giữ xúc xắc, hết ván sau 13 ô
 * - Điểm tối đa MAX_SCORE = 1575: chặn trên từng ô + một ván đạt đúng 1575
 * - PRNG seed được, lưu / khôi phục và từ chối dữ liệu hỏng
 * - Mô phỏng nhiều ván bằng bot đơn giản để xem phân bố điểm có hợp lý
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

/** Dựng ván với bộ xúc xắc cho trước (như vừa lắc lần `rolls`), qua toJSON / fromJSON để không cần cờ test trong engine. */
function withDice(g, dice, rolls) {
  const raw = E.toJSON(g);
  raw.dice = dice.slice();
  raw.rolls = rolls == null ? 1 : rolls;
  raw.held = [false, false, false, false, false];
  const r = E.fromJSON(raw);
  if (!r) throw new Error('withDice: fromJSON từ chối ' + JSON.stringify(raw));
  return r;
}
/** Ghi điểm `cat` với bộ xúc xắc `dice`. */
function play(g, dice, cat) {
  const before = withDice(g, dice);
  const after = E.score(before, cat);
  if (after === before) throw new Error('không ghi được ' + cat + ' với ' + dice.join(''));
  return after;
}
const S = (dice, cat, joker) => E.scoreDice(dice, cat, !!joker);
/** Duyệt cả 6^5 = 7776 bộ xúc xắc. */
function eachDice(fn) {
  for (let i = 0; i < 7776; i++) fn([0, 1, 2, 3, 4].map((k) => 1 + (Math.floor(i / Math.pow(6, k)) % 6)));
}

/* ---------------- Tính điểm từng ô ---------------- */

test('phần trên: tổng các mặt đúng số', () => {
  eq(S([1, 1, 2, 3, 1], 'ones'), 3);
  eq(S([2, 2, 2, 5, 6], 'twos'), 6);
  eq(S([3, 4, 5, 6, 1], 'threes'), 3);
  eq(S([4, 4, 4, 4, 1], 'fours'), 16);
  eq(S([5, 5, 5, 5, 5], 'fives'), 25);
  eq(S([1, 2, 3, 4, 5], 'sixes'), 0);
});

test('bộ ba / tứ quý: tổng cả 5 viên, không đủ thì 0', () => {
  eq(S([3, 3, 3, 4, 5], 'three'), 18);
  eq(S([3, 3, 4, 4, 5], 'three'), 0);
  eq(S([2, 2, 2, 2, 6], 'three'), 14, 'bốn viên giống cũng là bộ ba');
  eq(S([6, 6, 6, 6, 6], 'three'), 30);
  eq(S([2, 2, 2, 2, 6], 'four'), 14);
  eq(S([2, 2, 2, 6, 6], 'four'), 0);
  eq(S([1, 1, 1, 1, 1], 'four'), 5, 'ngũ quý cũng là tứ quý');
});

test('cù lũ 25: đúng 3 + 2; ngũ quý không phải cù lũ (trừ khi joker)', () => {
  eq(S([2, 2, 3, 3, 3], 'full'), 25);
  eq(S([6, 1, 6, 1, 1], 'full'), 25);
  eq(S([2, 2, 2, 2, 3], 'full'), 0);
  eq(S([2, 2, 3, 3, 4], 'full'), 0);
  eq(S([4, 4, 4, 4, 4], 'full'), 0, 'ngũ quý thường');
  eq(S([4, 4, 4, 4, 4], 'full', true), 25, 'ngũ quý dùng làm joker');
});

test('sảnh nhỏ 30: 4 số liên tiếp, kể cả khi có viên trùng hoặc là sảnh lớn', () => {
  eq(S([1, 2, 3, 4, 6], 'small'), 30);
  eq(S([3, 4, 5, 6, 1], 'small'), 30);
  eq(S([2, 3, 2, 4, 5], 'small'), 30, 'trùng một viên trong sảnh');
  eq(S([3, 3, 4, 5, 6], 'small'), 30);
  eq(S([1, 2, 3, 4, 5], 'small'), 30, 'sảnh lớn cũng là sảnh nhỏ');
  eq(S([1, 2, 3, 5, 6], 'small'), 0, 'đứt ở giữa');
  eq(S([1, 1, 2, 2, 3], 'small'), 0);
  eq(S([6, 6, 6, 6, 6], 'small', true), 30, 'joker');
});

test('sảnh lớn 40: 5 số liên tiếp', () => {
  eq(S([5, 4, 3, 2, 1], 'large'), 40);
  eq(S([2, 3, 4, 5, 6], 'large'), 40);
  eq(S([1, 2, 3, 4, 6], 'large'), 0);
  eq(S([2, 3, 3, 4, 5], 'large'), 0, 'có viên trùng thì không thể là sảnh lớn');
  eq(S([1, 1, 1, 1, 1], 'large'), 0);
  eq(S([1, 1, 1, 1, 1], 'large', true), 40, 'joker');
});

test('ngũ quý 50, cơ hội = tổng', () => {
  eq(S([3, 3, 3, 3, 3], 'yacht'), 50);
  eq(S([3, 3, 3, 3, 2], 'yacht'), 0);
  eq(S([1, 2, 3, 4, 6], 'chance'), 16);
  eq(S([6, 6, 6, 6, 6], 'chance'), 30);
});

test('mọi ô x mọi bộ xúc xắc: điểm nằm trong khoảng hợp lệ', () => {
  let n = 0;
  eachDice((d) => {
    E.CATS.forEach((c) => {
      [false, true].forEach((j) => {
        const v = S(d, c, j);
        ok(Number.isInteger(v) && v >= 0 && v <= E.CAT_MAX[c], c + ' ' + d + ' = ' + v);
        n++;
      });
    });
  });
  eq(n, 7776 * 13 * 2);
});

/* ---------------- Lắc và giữ ---------------- */

test('ván mới: 13 ô trống, vòng 1, chưa lắc, chưa bắt đầu', () => {
  const g = E.newGame(42);
  eq(E.CATS.every((c) => g.scores[c] === null), true);
  eq([E.round(g), g.rolls, E.started(g), E.isDone(g), E.total(g)], [1, 0, false, false, 0]);
  eq(E.potential(g, 'chance'), null, 'chưa lắc thì không có điểm dự kiến');
  eq(E.started(E.roll(g)), true, 'lắc lần đầu là đã bắt đầu');
});

test('lắc tối đa 3 lần mỗi lượt', () => {
  let g = E.newGame(7);
  for (let i = 1; i <= 3; i++) {
    ok(E.canRoll(g), 'lần ' + i);
    g = E.roll(g);
    eq(g.rolls, i);
    ok(g.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6));
  }
  eq(E.canRoll(g), false);
  eq(E.roll(g), g, 'lần thứ 4 không đổi gì');
});

test('cùng seed thì cùng kết quả lắc; khác seed thì khác', () => {
  const a = E.roll(E.newGame(123));
  const b = E.roll(E.newGame(123));
  eq(a.dice, b.dice);
  const seen = new Set();
  for (let s = 1; s <= 20; s++) seen.add(E.roll(E.newGame(s)).dice.join(''));
  ok(seen.size > 15, 'seed khác nhau cho bộ khác nhau');
});

test('xúc xắc rơi đều sáu mặt', () => {
  let g = E.newGame(99);
  const count = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6000; i++) {
    g = E.roll(withDice(g, [1, 1, 1, 1, 1], 0));
    g.dice.forEach((d) => count[d - 1]++);
  }
  count.forEach((c) => ok(c > 4500 && c < 5500, 'phân bố lệch: ' + count));
});

test('giữ xúc xắc: viên giữ không đổi khi lắc lại; chưa lắc / đã hết lượt lắc thì không giữ được', () => {
  let g = E.newGame(5);
  eq(E.toggleHold(g, 0), g, 'chưa lắc');
  g = E.roll(g);
  g = E.toggleHold(E.toggleHold(g, 1), 3);
  eq(g.held, [false, true, false, true, false]);
  const kept = [g.dice[1], g.dice[3]];
  for (let i = 0; i < 2; i++) {
    g = E.roll(g);
    eq([g.dice[1], g.dice[3]], kept);
  }
  eq(E.toggleHold(g, 0), g, 'hết lượt lắc');
  eq(E.toggleHold(E.toggleHold(E.roll(E.newGame(5)), 2), 2).held, [false, false, false, false, false], 'bấm hai lần là bỏ giữ');
  eq(E.toggleHold(E.roll(E.newGame(5)), 5).held, [false, false, false, false, false], 'chỉ số sai bị bỏ qua');
});

test('ghi điểm xong: về 0 lần lắc, bỏ giữ hết, sang vòng sau', () => {
  let g = withDice(E.newGame(1), [2, 2, 2, 5, 6]);
  g = E.toggleHold(E.toggleHold(E.toggleHold(g, 0), 1), 2);
  g = E.score(g, 'twos');
  eq([g.rolls, g.held, E.round(g)], [0, [false, false, false, false, false], 2]);
  eq(E.toggleHold(g, 0), g, 'chưa lắc vòng mới thì không giữ được');
});

/* ---------------- Ghi điểm, thưởng, tổng ---------------- */

test('ghi điểm: ô đã dùng không ghi lại được, chưa lắc thì không ghi được', () => {
  let g = E.newGame(3);
  eq(E.score(g, 'chance'), g, 'chưa lắc');
  g = play(g, [1, 2, 3, 4, 6], 'chance');
  eq(g.scores.chance, 16);
  const again = withDice(g, [6, 6, 6, 6, 5]);
  eq(E.legal(again, 'chance'), false);
  eq(E.potential(again, 'chance'), null);
  eq(E.score(again, 'chance'), again);
  eq(E.score(again, 'nope'), again, 'ô không tồn tại');
});

test('được ghi 0 (gạch ô) khi không đạt', () => {
  const g = play(E.newGame(3), [1, 2, 3, 4, 6], 'yacht');
  eq(g.scores.yacht, 0);
  eq(E.total(g), 0);
});

test('thưởng phần trên +35 khi đủ 63, thiếu 1 điểm thì không', () => {
  let g = E.newGame(11);
  [[1, 1, 1, 2, 3, 'ones'], [2, 2, 2, 1, 3, 'twos'], [3, 3, 3, 1, 2, 'threes'], [4, 4, 4, 1, 2, 'fours'], [5, 5, 5, 1, 2, 'fives']].forEach((r) => {
    g = play(g, r.slice(0, 5), r[5]);
  });
  eq(E.upperSum(g), 45);
  const hit = play(g, [6, 6, 6, 1, 2], 'sixes');
  eq([E.upperSum(hit), E.upperBonus(hit)], [63, 35]);
  eq(E.total(hit), 63 + 35);
  let m = play(play(E.newGame(1), [1, 1, 3, 4, 5], 'ones'), [2, 2, 2, 1, 3], 'twos');
  [[3, 3, 3, 1, 2, 'threes'], [4, 4, 4, 1, 2, 'fours'], [5, 5, 5, 1, 2, 'fives'], [6, 6, 6, 1, 2, 'sixes']].forEach((r) => {
    m = play(m, r.slice(0, 5), r[5]);
  });
  eq([E.upperSum(m), E.upperBonus(m)], [62, 0]);
});

test('tổng = phần trên + thưởng + phần dưới + thưởng ngũ quý', () => {
  let g = E.newGame(2);
  g = play(g, [6, 6, 6, 6, 6], 'yacht');
  g = play(g, [2, 2, 3, 3, 3], 'full');
  g = play(g, [4, 4, 4, 4, 4], 'fours'); // ngũ quý thứ hai: +100, ô Bốn còn trống nên bắt buộc ghi vào đó
  g = play(g, [1, 2, 3, 4, 5], 'large');
  eq([E.upperSum(g), E.upperBonus(g), E.lowerSum(g), E.yachtBonus(g)], [20, 0, 115, 100]);
  eq(E.total(g), 235);
});

/* ---------------- Ngũ quý thêm và joker ---------------- */

test('ngũ quý thêm sau khi ô ngũ quý đã 50: +100 mỗi lần', () => {
  let g = play(E.newGame(4), [2, 2, 2, 2, 2], 'yacht');
  eq(g.bonus, 0);
  g = play(g, [3, 3, 3, 3, 3], 'threes');
  g = play(g, [5, 5, 5, 5, 5], 'fives');
  eq([g.bonus, E.yachtBonus(g)], [2, 200]);
});

test('ngũ quý khi ô ngũ quý đã gạch 0: không có +100, nhưng vẫn là joker', () => {
  let g = play(E.newGame(4), [1, 2, 3, 4, 6], 'yacht');
  g = play(g, [3, 3, 3, 3, 3], 'threes');
  eq(g.bonus, 0);
  const j = withDice(g, [3, 3, 3, 3, 3]); // ô Ba đã dùng -> joker cho phần dưới
  eq(E.isJoker(j), true);
  eq(E.potential(j, 'large'), 40);
  g = E.score(j, 'large');
  eq([g.scores.large, g.bonus], [40, 0]);
});

test('ô ngũ quý còn trống: ngũ quý ghi ô khác theo luật thường (không joker)', () => {
  const g = withDice(E.newGame(4), [4, 4, 4, 4, 4]);
  eq(E.isJoker(g), false);
  eq([E.potential(g, 'full'), E.potential(g, 'small'), E.potential(g, 'fours'), E.potential(g, 'chance')], [0, 0, 20, 20]);
  eq(E.legal(g, 'ones'), true, 'được chọn bất kỳ ô trống nào');
  eq(E.legalCats(g).length, 13);
});

test('joker 1: ô cùng mặt ở phần trên còn trống thì bắt buộc ghi vào đó', () => {
  const g = withDice(play(E.newGame(4), [5, 5, 5, 5, 5], 'yacht'), [6, 6, 6, 6, 6]);
  eq(E.isJoker(g), true);
  eq(E.legalCats(g), ['sixes']);
  eq([E.potential(g, 'sixes'), E.potential(g, 'full'), E.potential(g, 'chance')], [30, null, null]);
  const after = E.score(g, 'sixes');
  eq([after.scores.sixes, after.bonus], [30, 1]);
  eq(E.score(g, 'chance'), g, 'ô khác bị từ chối');
});

test('joker 2: ô cùng mặt đã dùng thì chọn ô trống bất kỳ ở phần dưới, cù lũ / sảnh tính đủ điểm', () => {
  let g = play(E.newGame(4), [5, 5, 5, 5, 5], 'yacht');
  g = play(g, [2, 2, 2, 1, 3], 'twos');
  g = play(g, [1, 2, 3, 4, 6], 'small');
  const j = withDice(g, [2, 2, 2, 2, 2]);
  eq(E.legalCats(j), ['three', 'four', 'full', 'large', 'chance']);
  eq(E.legal(j, 'ones'), false, 'phần trên khác mặt bị khóa khi còn ô dưới');
  eq(['three', 'four', 'full', 'large', 'chance'].map((c) => E.potential(j, c)), [10, 10, 25, 40, 10]);
  const after = E.score(j, 'full');
  eq([after.scores.full, after.bonus], [25, 1]);
});

test('joker 3: phần dưới đã đầy thì ghi 0 vào một ô trống ở phần trên', () => {
  let g = play(E.newGame(4), [5, 5, 5, 5, 5], 'yacht');
  [[1, 1, 1, 2, 3, 'three'], [1, 1, 1, 1, 3, 'four'], [2, 2, 3, 3, 3, 'full'], [1, 2, 3, 4, 6, 'small'], [1, 2, 3, 4, 5, 'large'], [1, 2, 3, 4, 6, 'chance'], [4, 4, 1, 2, 3, 'fours']].forEach((r) => {
    g = play(g, r.slice(0, 5), r[5]);
  });
  const j = withDice(g, [4, 4, 4, 4, 4]);
  eq(E.legalCats(j), ['ones', 'twos', 'threes', 'fives', 'sixes']);
  eq(E.potential(j, 'ones'), 0);
  const after = E.score(j, 'twos');
  eq([after.scores.twos, after.bonus], [0, 1], 'vẫn được +100');
});

/* ---------------- Hết ván và điểm tối đa ---------------- */

test('hết ván sau đúng 13 ô; hết ván thì không lắc / ghi được nữa', () => {
  let g = E.newGame(8);
  E.CATS.forEach((c, i) => {
    eq(E.round(g), i + 1);
    eq(E.isDone(g), false);
    g = play(g, [1, 2, 3, 4, 6], c);
  });
  eq([E.isDone(g), E.round(g), E.filled(g)], [true, 13, 13]);
  eq(E.canRoll(g), false);
  eq(E.roll(g), g);
  eq(E.legalCats(Object.assign({}, g, { dice: [6, 6, 6, 6, 6], rolls: 1 })), []);
  eq(E.fromJSON(Object.assign(E.toJSON(g), { rolls: 1 })), null, 'ván đã hết không thể đang lắc dở');
});

test('MAX_SCORE = 1575: chặn trên từ điểm tối đa từng ô (cả joker) + 12 lần +100', () => {
  const best = {};
  eachDice((d) => {
    E.CATS.forEach((c) => {
      best[c] = Math.max(best[c] || 0, S(d, c, false), S(d, c, true));
    });
  });
  eq(best, E.CAT_MAX);
  const boxes = E.CATS.reduce((a, c) => a + best[c], 0); // 105 phần trên + 235 phần dưới
  eq(boxes, 340);
  // +100 chỉ có khi ô ngũ quý đã giữ 50 trước đó, nên tối đa 12 lần (12 ô còn lại)
  eq(boxes + E.UPPER_BONUS + 12 * E.YACHT_BONUS, E.MAX_SCORE);
  eq(E.MAX_SCORE, 1575);
});

test('MAX_SCORE đạt được: 13 lần ngũ quý theo đúng thứ tự joker', () => {
  let g = E.newGame(1);
  const seq = [
    [6, 'yacht'], [6, 'sixes'], [6, 'three'], [6, 'four'], [6, 'chance'], [6, 'full'], [6, 'small'], [6, 'large'],
    [1, 'ones'], [2, 'twos'], [3, 'threes'], [4, 'fours'], [5, 'fives'],
  ];
  seq.forEach(([f, c]) => {
    g = play(g, [f, f, f, f, f], c);
  });
  eq([E.isDone(g), g.bonus, E.upperBonus(g), E.total(g)], [true, 12, 35, E.MAX_SCORE]);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván, kể cả chuỗi lắc tiếp theo', () => {
  let g = E.roll(E.newGame(2024));
  g = E.toggleHold(g, 2);
  g = E.score(E.roll(g), 'chance');
  g = E.roll(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.roll(back).dice, E.roll(g).dice, 'PRNG tiếp tục đúng chỗ');
  const done = E.fromJSON(E.toJSON(play(E.newGame(1), [1, 1, 1, 1, 1], 'ones')));
  eq(done.scores.ones, 5);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(play(play(E.newGame(9), [3, 3, 3, 3, 3], 'yacht'), [3, 3, 3, 3, 3], 'threes'));
  eq(E.fromJSON(good) !== null, true, 'mẫu hợp lệ');
  const sc = (patch) => Object.assign({}, good, { scores: Object.assign({}, good.scores, patch) });
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { dice: [1, 2, 3, 4] }),
    Object.assign({}, good, { dice: [1, 2, 3, 4, 7] }),
    Object.assign({}, good, { dice: [1, 2, 3, 4, 2.5] }),
    Object.assign({}, good, { held: [true, false, false, false] }),
    Object.assign({}, good, { held: [1, 0, 0, 0, 0] }),
    Object.assign({}, good, { rolls: 4 }),
    Object.assign({}, good, { rolls: -1 }),
    Object.assign({}, good, { rolls: 0, held: [true, false, false, false, false] }),
    Object.assign({}, good, { rng: -5 }),
    Object.assign({}, good, { rng: 1.5 }),
    Object.assign({}, good, { seed: 'a' }),
    sc({ threes: 7 }),
    sc({ threes: 18 }),
    sc({ full: 20 }),
    sc({ chance: 3 }),
    sc({ three: 31 }),
    sc({ extra: 5 }),
    Object.assign({}, good, { scores: { ones: null } }),
    Object.assign({}, good, { bonus: 13 }),
    Object.assign({}, good, { bonus: 2 }),
    Object.assign({}, good, { bonus: -1 }),
    Object.assign({}, good, { bonus: 1, scores: Object.assign({}, good.scores, { yacht: 0 }) }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i + ' ' + JSON.stringify(raw)));
});

/* ---------------- Mô phỏng bằng bot ---------------- */

/** Bot đơn giản: giữ mặt nhiều nhất (hoặc giữ chuỗi sảnh khi còn ô sảnh lớn), ghi ô cho điểm cao nhất có trừ hao. */
function botTurn(g) {
  g = E.roll(g);
  for (let r = 1; r < E.MAX_ROLLS; r++) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    g.dice.forEach((d) => counts[d]++);
    const has = (f) => counts[f] > 0;
    let keep = null;
    if (g.scores.large === null) keep = [[2, 3, 4, 5], [3, 4, 5, 6], [1, 2, 3, 4]].find((run) => run.every(has)) || null;
    if (!keep) {
      let face = 6;
      for (let f = 6; f >= 1; f--) if (counts[f] > counts[face]) face = f;
      keep = [face, face, face, face, face];
    }
    const want = keep.slice();
    const held = g.dice.map((d) => {
      const k = want.indexOf(d);
      if (k < 0) return false;
      want.splice(k, 1);
      return true;
    });
    if (held.every(Boolean)) break;
    held.forEach((h, i) => {
      if (h !== g.held[i]) g = E.toggleHold(g, i);
    });
    g = E.roll(g);
  }
  let best = null;
  let bestVal = -Infinity;
  E.legalCats(g).forEach((c) => {
    const p = E.potential(g, c);
    const i = E.CATS.indexOf(c);
    let v = p;
    if (i < 6) v += (p / (i + 1) - 3) * (i + 1) * 0.6; // thưởng / phạt theo mục tiêu 3 viên mỗi mặt (đủ 63)
    if (c === 'chance') v -= 12;
    if (p === 0) v = -E.CAT_MAX[c] / 4 - (c === 'yacht' ? 5 : 0);
    if (v > bestVal) {
      bestVal = v;
      best = c;
    }
  });
  return E.score(g, best);
}

test('mô phỏng 3000 ván bằng bot: hết ván đúng 13 lượt, điểm hợp lý', () => {
  const totals = [];
  let yachts = 0;
  let bonusGames = 0;
  for (let s = 1; s <= 3000; s++) {
    let g = E.newGame(s * 2654435761);
    let turns = 0;
    while (!E.isDone(g)) {
      const before = E.filled(g);
      g = botTurn(g);
      eq(E.filled(g), before + 1, 'mỗi lượt ghi đúng một ô');
      turns++;
    }
    eq(turns, 13);
    const t = E.total(g);
    eq(t, E.upperSum(g) + E.upperBonus(g) + E.lowerSum(g) + E.yachtBonus(g));
    ok(t >= 0 && t <= E.MAX_SCORE, 'tổng ngoài khoảng: ' + t);
    totals.push(t);
    if (g.scores.yacht === 50) yachts++;
    if (E.upperBonus(g)) bonusGames++;
  }
  totals.sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const pct = (p) => totals[Math.floor(p * (totals.length - 1))];
  const share = totals.filter((t) => t >= E.WIN_SCORE).length / totals.length;
  console.log('       bot: trung bình ' + mean.toFixed(1) + ', p10 ' + pct(0.1) + ', trung vị ' + pct(0.5) + ', p90 ' + pct(0.9) +
    ', cao nhất ' + totals[totals.length - 1] + '; ngũ quý 50: ' + (yachts / 30).toFixed(1) + '%; thưởng 35: ' +
    (bonusGames / 30).toFixed(1) + '%; >= ' + E.WIN_SCORE + ': ' + (share * 100).toFixed(1) + '%');
  ok(mean > 150 && mean < 260, 'trung bình ngoài khoảng mong đợi: ' + mean);
  ok(totals[totals.length - 1] < 1000, 'bot thường không chạm gần điểm tối đa');
  ok(share > 0.01 && share < 0.5, 'mốc ' + E.WIN_SCORE + ' phải khó nhưng đạt được: ' + share);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
