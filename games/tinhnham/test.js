/* Kiểm tra engine Tính Nhẩm: chạy `node test.js`
 * - Sinh phép tính: tất định theo hạt giống, mọi câu có đáp án nguyên dương (chia hết), đúng phạm vi từng mức,
 *   không lặp lại ngay câu vừa hỏi, phép tính khó dần theo mức
 * - Nhập số: tự chấm khi gõ đủ số chữ số của đáp án, Enter chấm sớm, xóa lùi; đúng thì cộng điểm và tăng chuỗi,
 *   sai thì chuỗi về 0 (độ khó về mức 0), không trừ điểm, không trừ giờ
 * - Điểm theo mức và hệ số chuỗi, đồng hồ 60 giây, tất định theo hạt giống + chuỗi phím
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
function ok(c, msg) {
  if (!c) throw new Error(msg || 'điều kiện sai');
}

/** Gõ cả chuỗi phím, trả ván cuối và kết quả của phím cuối. */
function typeAll(g, keys) {
  let r = { game: g, result: null };
  for (const k of keys) r = E.press(r.game, k);
  return r;
}
/** Trả lời đúng câu hiện tại. */
const answerRight = (g) => typeAll(g, String(E.answerOf(g.q)).split(''));
/** Một đáp án sai cùng số chữ số với đáp án đúng (để được chấm tự động; không bắt đầu bằng 0). */
function wrongDigits(q) {
  const s = String(E.answerOf(q));
  const last = s[s.length - 1];
  return (s.slice(0, -1) + (last === '9' ? '8' : String(Number(last) + 1))).split('');
}
/** Sinh lần lượt n câu ở một mức cố định từ một hạt giống. */
function questionsAt(level, seed, n) {
  let rng = E.seedState(seed);
  let prev = null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = E.makeQuestion(rng, level, prev);
    out.push(r.q);
    rng = r.rng;
    prev = r.q;
  }
  return out;
}

/* ---------------- Sinh phép tính ---------------- */

test('cùng hạt giống thì cùng câu đầu và cùng dãy câu, khác hạt giống thì khác', () => {
  eq(E.newGame(42).q, E.newGame(42).q);
  eq(questionsAt(5, 7, 50), questionsAt(5, 7, 50));
  ok(JSON.stringify(questionsAt(5, 7, 50)) !== JSON.stringify(questionsAt(5, 8, 50)), 'hai hạt giống cho cùng dãy câu');
});

test('mọi câu ở mọi mức có đáp án nguyên dương, không quá MAX_DIGITS chữ số; chia luôn chia hết', () => {
  for (let level = 0; level <= E.MAX_LEVEL; level++) {
    for (let seed = 1; seed <= 60; seed++) {
      questionsAt(level, seed, 40).forEach((q) => {
        ok(E.OPS.indexOf(q.op) >= 0, 'phép tính lạ ' + q.op);
        ok(Number.isInteger(q.a) && Number.isInteger(q.b) && q.a > 0 && q.b > 0, 'toán hạng sai ' + JSON.stringify(q));
        const ans = E.answerOf(q);
        ok(Number.isInteger(ans) && ans > 0, 'đáp án sai ' + JSON.stringify(q));
        if (q.op === '÷') eq(q.a % q.b, 0, 'chia không hết');
        if (q.op === '-') ok(q.a > q.b, 'hiệu không dương');
        eq(q.level, level, 'mức của câu');
        ok(String(ans).length <= E.MAX_DIGITS, 'đáp án quá dài ' + ans);
      });
    }
  }
});

test('câu nằm trong phạm vi của mức: cộng / trừ theo add, nhân / chia theo mul', () => {
  const inR = (x, r) => x >= r[0] && x <= r[1];
  for (let level = 0; level <= E.MAX_LEVEL; level++) {
    const L = E.LEVELS[level];
    questionsAt(level, 3, 400).forEach((q) => {
      ok(L.ops.indexOf(q.op) >= 0, 'mức ' + level + ' không có phép ' + q.op);
      if (q.op === '+') ok(inR(q.a, L.add) && inR(q.b, L.add), 'cộng ngoài phạm vi ' + JSON.stringify(q));
      if (q.op === '-') ok(inR(q.b, L.add) && inR(q.a - q.b, L.add), 'trừ ngoài phạm vi ' + JSON.stringify(q));
      if (q.op === '×') ok(inR(q.a, L.mul[0]) && inR(q.b, L.mul[1]), 'nhân ngoài phạm vi ' + JSON.stringify(q));
      if (q.op === '÷') ok(inR(q.b, L.mul[0]) && inR(q.a / q.b, L.mul[1]), 'chia ngoài phạm vi ' + JSON.stringify(q));
    });
  }
});

test('mỗi mức ra đủ các phép của mức đó; mức 0 chỉ cộng trừ, nhân từ mức 1, chia từ mức 2', () => {
  eq(Array.from(new Set(E.LEVELS[0].ops)).sort(), ['+', '-']);
  ok(E.LEVELS[1].ops.indexOf('×') >= 0 && E.LEVELS[1].ops.indexOf('÷') < 0, 'mức 1');
  ok(E.LEVELS[2].ops.indexOf('÷') >= 0, 'mức 2');
  for (let level = 0; level <= E.MAX_LEVEL; level++) {
    const seen = Array.from(new Set(questionsAt(level, 11, 300).map((q) => q.op))).sort();
    eq(seen, Array.from(new Set(E.LEVELS[level].ops)).sort(), 'mức ' + level);
  }
});

test('không hỏi lại đúng câu vừa hỏi', () => {
  for (let level = 0; level <= E.MAX_LEVEL; level++) {
    const qs = questionsAt(level, 5, 500);
    for (let i = 1; i < qs.length; i++) {
      ok(!(qs[i].a === qs[i - 1].a && qs[i].op === qs[i - 1].op && qs[i].b === qs[i - 1].b), 'lặp câu ở mức ' + level);
    }
  }
});

test('khó dần: độ lớn trung bình của toán hạng và đáp án tăng theo mức', () => {
  const size = (q) => Math.log10(q.a) + Math.log10(q.b) + Math.log10(E.answerOf(q)) + (q.op === '×' || q.op === '÷' ? 1 : 0);
  const avg = (level) => {
    const qs = questionsAt(level, 9, 600);
    return qs.reduce((s, q) => s + size(q), 0) / qs.length;
  };
  for (let level = 1; level <= E.MAX_LEVEL; level++) ok(avg(level) > avg(level - 1), 'mức ' + level + ' không khó hơn mức ' + (level - 1));
});

test('mức theo chuỗi đúng: 3 câu đúng liên tiếp lên một mức, tối đa MAX_LEVEL', () => {
  eq([0, 1, 2, 3, 5, 6, 9, 23, 24, 100].map(E.levelOf), [0, 0, 0, 1, 1, 2, 3, 7, 8, 8]);
});

test('hệ số chuỗi: ×1 dưới 5 câu, ×2 từ 5, ×3 từ 10; điểm = (mức + 1) × hệ số', () => {
  eq([0, 4, 5, 9, 10, 50].map(E.multiplier), [1, 1, 2, 2, 3, 3]);
  eq([0, 3, 5, 10, 24, 99].map(E.pointsFor), [1, 2, 2 * 2, 4 * 3, 9 * 3, 9 * 3]);
  eq(E.MAX_POINTS, 27);
});

/* ---------------- Ván và nhập số ---------------- */

test('ván mới: 0 điểm, đồng hồ 0, câu đầu ở mức 0, ô nhập trống', () => {
  const g = E.newGame(1);
  eq([g.t, g.score, g.streak, g.correct, g.wrong, g.input, g.q.level, E.isOver(g), E.timeLeft(g)], [0, 0, 0, 0, 0, '', 0, false, E.ROUND_MS]);
});

test('gõ đủ số chữ số của đáp án đúng: tự chấm đúng, cộng điểm, tăng chuỗi, sang câu mới; ván cũ không đổi', () => {
  const g = E.newGame(2);
  const before = JSON.stringify(g);
  const r = answerRight(g);
  eq(JSON.stringify(g), before, 'ván cũ bị đổi');
  eq(r.result.type, 'correct');
  eq([r.game.score, r.game.streak, r.game.correct, r.game.input], [1, 1, 1, '']);
  eq([r.result.points, r.result.answer], [1, E.answerOf(g.q)]);
  eq(r.result.q, g.q);
  ok(r.game.q !== g.q, 'chưa sang câu mới');
});

test('gõ chưa đủ chữ số thì chưa chấm; xóa lùi bỏ chữ số cuối', () => {
  let g = E.newGame(3);
  for (let i = 0; i < 40 && String(E.answerOf(g.q)).length < 2; i++) g = answerRight(g).game;
  const s = String(E.answerOf(g.q));
  ok(s.length >= 2, 'không tìm được câu hai chữ số');
  let r = E.press(g, s[0]);
  eq([r.result.type, r.game.input], ['digit', s[0]]);
  r = E.press(r.game, 'back');
  eq([r.result.type, r.game.input], ['back', '']);
  eq(E.press(r.game, 'back').result.type, 'none', 'xóa khi trống');
});

test('gõ đủ chữ số nhưng sai: chuỗi về 0, không trừ điểm, không trừ giờ, câu mới về mức 0, báo đáp án đúng', () => {
  let g = E.newGame(4);
  for (let i = 0; i < 7; i++) g = answerRight(E.advance(g, 500).game).game;
  eq([g.streak, g.q.level], [7, 2]);
  const score = g.score;
  const q = g.q;
  const r = typeAll(g, wrongDigits(q));
  eq(r.result.type, 'wrong');
  eq(r.result.q, q);
  eq(r.result.answer, E.answerOf(q));
  eq(r.result.given, Number(wrongDigits(q).join('')));
  eq([r.game.score, r.game.streak, r.game.wrong, r.game.input, r.game.q.level, r.game.bestStreak], [score, 0, 1, '', 0, 7]);
  eq(r.game.t, g.t, 'sai không trừ giờ');
});

test('Enter chấm sớm (thiếu chữ số là sai); Enter khi ô trống không làm gì', () => {
  let g = E.newGame(5);
  for (let i = 0; i < 40 && String(E.answerOf(g.q)).length < 2; i++) g = answerRight(g).game;
  eq(E.press(g, 'enter').result.type, 'none');
  const s = String(E.answerOf(g.q));
  const r = typeAll(g, [s[0], 'enter']);
  eq(r.result.type, 'wrong');
});

test('số 0 đứng đầu không được nhận; phím lạ bị bỏ qua', () => {
  const g = E.newGame(6);
  eq(E.press(g, '0').result.type, 'none');
  eq(E.press(g, 'x').result.type, 'none');
  eq(E.press(g, '12').result.type, 'none');
  eq(E.press(g, '0').game, g);
});

test('điểm theo mức và chuỗi: 30 câu đúng liên tiếp cộng đúng tổng pointsFor, lên tới mức tối đa', () => {
  let g = E.newGame(7);
  let expect = 0;
  for (let i = 0; i < 30; i++) {
    expect += E.pointsFor(i);
    const r = answerRight(g);
    eq(r.result.points, E.pointsFor(i), 'câu ' + i);
    eq(r.result.level, E.levelOf(i));
    g = r.game;
  }
  eq([g.score, g.streak, g.bestStreak, g.maxLevel], [expect, 30, 30, E.MAX_LEVEL]);
});

test('advance là hàm thuần; tiến từng bước nhỏ hay một lần đều như nhau', () => {
  const g = E.newGame(8);
  const a = E.advance(g, 12345).game;
  let b = g;
  for (let i = 0; i < 1234; i++) b = E.advance(b, 10).game;
  b = E.advance(b, 5).game;
  eq(a, b);
  eq(g.t, 0);
  eq(E.advance(g, -50).game.t, 0, 'thời gian âm');
});

test('đồng hồ: hết 60 giây thì kết thúc (báo over một lần), không vượt quá, sau đó gõ phím không đổi gì', () => {
  let r = E.advance(E.newGame(9), E.ROUND_MS - 1);
  eq(r.events, []);
  r = E.advance(r.game, 500);
  eq(r.events, [{ type: 'over' }]);
  const g = r.game;
  eq([g.t, E.isOver(g), E.timeLeft(g)], [E.ROUND_MS, true, 0]);
  eq(E.advance(g, 1000).events, []);
  const d = String(E.answerOf(g.q))[0];
  eq(E.press(g, d).result.type, 'none');
  eq(E.press(g, d).game, g);
});

test('tất định: cùng hạt giống + cùng chuỗi phím và thời điểm cho cùng điểm và cùng dãy câu', () => {
  const play = (seed) => {
    let g = E.newGame(seed);
    const log = [];
    for (let i = 0; i < 60; i++) {
      g = E.advance(g, 700).game;
      g = (i % 7 === 6 ? typeAll(g, wrongDigits(g.q)) : answerRight(g)).game;
      log.push(g.q);
    }
    return { score: g.score, log };
  };
  eq(play(2024), play(2024));
  ok(JSON.stringify(play(2024).log) !== JSON.stringify(play(2025).log), 'khác hạt giống mà cùng dãy câu');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả chữ số đang gõ) và chơi tiếp cho cùng câu sau', () => {
  let g = E.newGame(77);
  for (let i = 0; i < 9; i++) g = answerRight(E.advance(g, 900).game).game;
  g = typeAll(g, wrongDigits(g.q)).game;
  for (let i = 0; i < 4; i++) g = answerRight(g).game;
  for (let i = 0; i < 40 && String(E.answerOf(g.q)).length < 2; i++) g = answerRight(g).game;
  g = E.press(g, String(E.answerOf(g.q))[0]).game;
  ok(g.input.length === 1, 'chưa có chữ số đang gõ');
  g = E.advance(g, 333).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.press(back, 'back').game, E.press(g, 'back').game);
  const g2 = E.press(g, 'back').game;
  eq(answerRight(E.fromJSON(E.toJSON(g2))).game, answerRight(g2).game);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(answerRight(E.advance(E.newGame(5), 1000).game).game);
  const bad = (patch) => Object.assign({}, good, patch);
  const badQ = (patch) => bad({ q: Object.assign({}, good.q, patch) });
  [
    null, 1, 'x', {}, [],
    bad({ v: 99 }),
    bad({ t: -1 }), bad({ t: E.ROUND_MS + 1 }), bad({ t: 1.5 }),
    bad({ score: -1 }), bad({ score: '3' }),
    bad({ streak: -1 }), bad({ bestStreak: 0, streak: 1 }),
    bad({ correct: -1 }), bad({ wrong: 1.2 }),
    bad({ maxLevel: E.MAX_LEVEL + 1 }),
    bad({ rng: 'x' }), bad({ rng: 2 ** 40 }),
    bad({ seed: null }),
    bad({ q: null }),
    badQ({ op: '^' }), badQ({ a: 0 }), badQ({ b: 0 }), badQ({ level: E.MAX_LEVEL + 1 }), badQ({ level: -1 }),
    badQ({ op: '÷', a: 7, b: 2 }), badQ({ op: '-', a: 3, b: 5 }), badQ({ op: '-', a: 4, b: 4 }),
    bad({ input: 'a' }), bad({ input: '0' }), bad({ input: 5 }), bad({ input: '1'.repeat(E.MAX_DIGITS + 1) }),
  ].forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i + ': ' + JSON.stringify(raw)));
  // Ô nhập đã đủ chữ số (lẽ ra đã được chấm) cũng là hỏng
  eq(E.fromJSON(bad({ input: String(E.answerOf(good.q)) })), null, 'ô nhập đủ chữ số');
  ok(E.fromJSON(good) !== null, 'mẫu tốt bị từ chối');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
