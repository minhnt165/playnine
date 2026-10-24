/* Kiểm tra engine Bài Tim: chạy `node test.js`
 * - Chia bài tất định theo seed, hướng chuyền xoay vòng (trái / phải / đối diện / không chuyền), chuyền 3 lá
 * - Luật ra lá: 2♣ mở, phải theo chất, nước đầu không đổ cơ / Q♠, không mở cơ khi cơ chưa vỡ
 * - Ăn nước, tính điểm (cơ 1, Q♠ 13), bắn trăng, hết trận ≥ 100 (thấp nhất thắng, đồng hạng thì đánh thêm)
 * - Máy (Dễ / Vừa / Khó) luôn chuyền và ra lá hợp lệ trên hàng trăm trận; máy mạnh dần theo mức
 * - Hành vi máy: đổ Q♠, lọt dưới lá to, chuyền lá nguy hiểm, thử bắn trăng, chặn bắn trăng
 * - Lưu / khôi phục, từ chối dữ liệu hỏng
 */
const E = require('./engine.js');
const C = require('../_kit/cards.js');

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
  if (!v) throw new Error(msg || 'expected truthy');
}
function throws(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) throw new Error(msg || 'expected throw');
}
const sorted = (a) => a.slice().sort();

const ALL = C.newDeck().map(C.toId);
const suitOf = (id) => C.fromId(id).suit;

/** Đủ 52 lá, không trùng: trên tay + nước đang đánh + đã ra. */
function checkCards(g) {
  const all = g.played.concat(g.trick.map((p) => p.card), ...g.hands);
  eq(all.length, 52, 'tổng số lá');
  eq(new Set(all).size, 52, 'lá trùng');
}

/**
 * Dựng ván đang đánh để test luật. hands: 4 mảng id (cùng số lá, hoặc hơn kém 1 theo trick);
 * lá không nằm trên tay / trong nước thì coi như đã ra ở các nước trước (played).
 */
function setup(o) {
  const g = E.newMatch({ seed: 1, level: o.level || 'medium' });
  const hands = o.hands.map((h) => h.slice());
  const trick = (o.trick || []).map((p) => ({ seat: p.seat, card: p.card }));
  const used = new Set([].concat(...hands, trick.map((p) => p.card)));
  const played = ALL.filter((id) => !used.has(id));
  const tricks = played.length / 4;
  const leader = o.leader != null ? o.leader : trick.length ? trick[0].seat : 0;
  const st = Object.assign({}, g, {
    phase: 'play',
    round: o.round || 4,
    hands,
    passed: null,
    trick,
    leader,
    turn: (leader + trick.length) % 4,
    tricks,
    broken: o.broken != null ? o.broken : false,
    taken: o.taken || [[], [], [], []],
    played,
    voids: o.voids || [[], [], [], []],
    scores: o.scores || [0, 0, 0, 0],
    history: o.history || [],
  });
  checkCards(st);
  return st;
}

/** Chơi hết một ván bằng máy, levels[s] là mức của ghế s. check(g, id) gọi trước mỗi lá. */
function playRound(g, levels, check) {
  if (g.phase === 'pass') g = E.exchange(g, [0, 1, 2, 3].map((s) => E.aiPass(g, s, levels[s])));
  while (g.phase === 'play') {
    const id = E.aiPlay(g, levels[g.turn]);
    if (check) check(g, id);
    g = E.play(g, id);
  }
  return g;
}
function playMatch(seed, levels, check) {
  let g = E.newMatch({ seed, level: 'easy' });
  let rounds = 0;
  for (;;) {
    g = playRound(g, levels, check);
    rounds++;
    if (g.phase === 'over') return { g, rounds };
    if (rounds > 60) throw new Error('trận không kết thúc');
    g = E.nextRound(g);
  }
}

/* ---------------- Chia bài, chuyền bài ---------------- */

test('chia 13 lá mỗi người, đủ 52 lá, tất định theo seed', () => {
  const a = E.newMatch({ seed: 42, level: 'hard' });
  const b = E.newMatch({ seed: 42, level: 'hard' });
  const c = E.newMatch({ seed: 43, level: 'hard' });
  a.hands.forEach((h) => eq(h.length, 13));
  checkCards(a);
  eq(a, b, 'cùng seed');
  ok(JSON.stringify(a.hands) !== JSON.stringify(c.hands), 'khác seed phải khác bài');
  eq([a.phase, a.round, a.scores, a.level], ['pass', 1, [0, 0, 0, 0], 'hard']);
});

test('mức lạ thì về Vừa', () => {
  eq(E.newMatch({ seed: 1, level: 'x' }).level, 'medium');
});

test('hướng chuyền: trái, phải, đối diện, không chuyền rồi lặp lại', () => {
  eq([1, 2, 3, 4, 5, 6, 7, 8].map(E.passOffset), [1, 3, 2, 0, 1, 3, 2, 0]);
  const g = E.newMatch({ seed: 5 });
  eq([E.passTarget(g, 0), E.passTarget(g, 3), E.passSource(g, 0)], [1, 0, 3]);
});

test('chuyền 3 lá: lá tới đúng người nhận, rồi người cầm 2♣ mở', () => {
  const g = E.newMatch({ seed: 7 });
  const picks = g.hands.map((h) => h.slice(0, 3));
  const n = E.exchange(g, picks);
  eq(n.phase, 'play');
  for (let s = 0; s < 4; s++) {
    eq(n.hands[s].length, 13);
    picks[s].forEach((id) => ok(n.hands[(s + 1) % 4].indexOf(id) >= 0, 'lá chuyền sang trái'));
  }
  eq(sorted(E.received(n, 1)), sorted(picks[0]));
  ok(n.hands[n.turn].indexOf('2C') >= 0, 'người cầm 2♣ mở');
  eq(n.leader, n.turn);
  eq([n.humanMoves, n.moves], [1, 4]);
  checkCards(n);
  eq(g.phase, 'pass', 'không đụng trạng thái cũ');
});

test('chuyền phải ở ván 2, đối diện ở ván 3', () => {
  let g = E.newMatch({ seed: 9 });
  g = Object.assign({}, g, { round: 2 });
  let picks = g.hands.map((h) => h.slice(0, 3));
  let n = E.exchange(g, picks);
  picks[0].forEach((id) => ok(n.hands[3].indexOf(id) >= 0, 'ván 2 sang phải'));
  g = Object.assign({}, g, { round: 3 });
  picks = g.hands.map((h) => h.slice(0, 3));
  n = E.exchange(g, picks);
  picks[0].forEach((id) => ok(n.hands[2].indexOf(id) >= 0, 'ván 3 sang đối diện'));
});

test('chuyền sai thì báo lỗi', () => {
  const g = E.newMatch({ seed: 7 });
  const good = g.hands.map((h) => h.slice(0, 3));
  throws(() => E.exchange(g, good.slice(0, 3)), 'thiếu người');
  throws(() => E.exchange(g, [g.hands[0].slice(0, 2)].concat(good.slice(1))), '2 lá');
  throws(() => E.exchange(g, [[g.hands[0][0], g.hands[0][0], g.hands[0][1]]].concat(good.slice(1))), 'trùng lá');
  throws(() => E.exchange(g, [g.hands[1].slice(0, 3)].concat(good.slice(1))), 'lá không có trên tay');
  const played = E.exchange(g, good);
  throws(() => E.exchange(played, good), 'đã chuyền rồi');
});

test('ván 4 không chuyền: đánh luôn, người cầm 2♣ mở', () => {
  let g = E.newMatch({ seed: 11 });
  for (let r = 1; r < 4; r++) {
    g = playRound(g, ['easy', 'easy', 'easy', 'easy']);
    if (g.phase === 'over') return;
    g = E.nextRound(g);
  }
  eq([g.round, g.phase, g.passed], [4, 'play', null]);
  ok(g.hands[g.turn].indexOf('2C') >= 0);
  eq(E.legalPlays(g), ['2C']);
});

/* ---------------- Luật ra lá ---------------- */

const H0 = ['2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC'];

test('nước đầu phải mở bằng 2♣', () => {
  const g = E.exchange(E.newMatch({ seed: 3 }), E.newMatch({ seed: 3 }).hands.map((h) => h.slice(0, 3)));
  eq(E.legalPlays(g), ['2C']);
  const bad = g.hands[g.turn].find((id) => id !== '2C');
  throws(() => E.play(g, bad));
});

test('phải ra theo chất được mở', () => {
  const g = setup({
    hands: [['3D', '9S', 'KH'], ['5D', '2S', 'AH'], ['7D', '4S', '6H'], ['8S', '3H']],
    trick: [{ seat: 3, card: '9D' }],
    leader: 3,
    broken: true,
  });
  eq(g.turn, 0);
  eq(E.legalPlays(g), ['3D']);
  throws(() => E.play(g, '9S'));
});

test('hết chất thì đổ lá bất kỳ (sau nước đầu); máy ghi nhận chất trống', () => {
  const g = setup({
    hands: [['9S', 'KH', 'QS'], ['5D', '2S', 'AH'], ['7D', '4S', '6H'], ['8S', '3H']],
    trick: [{ seat: 3, card: '9D' }],
    leader: 3,
  });
  eq(sorted(E.legalPlays(g)), sorted(['9S', 'KH', 'QS']));
  const n = E.play(g, 'KH');
  eq(n.voids[0], ['D']);
  eq(n.broken, true, 'đổ cơ là vỡ cơ');
});

test('nước đầu: hết nhép thì không được đổ cơ hay Q♠', () => {
  const g = setup({
    hands: [
      ['QS', 'KH', 'AH', '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', '10D', 'JD'],
      ['3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC', '2S'],
      ['3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS', 'KS', 'AS', '2H', '3H'],
      ['4H', '5H', '6H', '7H', '8H', '9H', '10H', 'JH', 'QH', 'QD', 'KD', 'AD'],
    ],
    trick: [{ seat: 3, card: '2C' }],
    leader: 3,
  });
  eq(g.tricks, 0);
  eq(sorted(E.legalPlays(g)), sorted(['2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', '10D', 'JD']));
});

test('nước đầu: trên tay toàn lá điểm thì đổ được', () => {
  const g = setup({
    hands: [
      ['QS', '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', 'JH', 'QH', 'KH'],
      ['3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC', 'AH'],
      ['2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS', 'KS', 'AS', '2D'],
      ['3D', '4D', '5D', '6D', '7D', '8D', '9D', '10D', 'JD', 'QD', 'KD', 'AD'],
    ],
    trick: [{ seat: 3, card: '2C' }],
    leader: 3,
  });
  eq(E.legalPlays(g).length, 13);
});

test('không mở bằng cơ khi cơ chưa vỡ (trừ khi chỉ còn cơ); Q♠ mở được', () => {
  const base = { hands: [['2H', '9H', 'QS'], ['5D', '2S', 'AH'], ['7D', '4S', '6H'], ['9D', '8S', '3H']], leader: 0 };
  eq(E.legalPlays(setup(base)), ['QS']);
  eq(sorted(E.legalPlays(setup(Object.assign({}, base, { broken: true })))), sorted(['2H', '9H', 'QS']));
  const only = setup({ hands: [['2H', '9H', 'KH'], ['5D', '2S', 'AH'], ['7D', '4S', '6H'], ['9D', '8S', 'QS']], leader: 0 });
  eq(sorted(E.legalPlays(only)), sorted(['2H', '9H', 'KH']));
});

test('lá cao nhất của chất được mở ăn nước, ăn lá điểm, mở nước sau', () => {
  let g = setup({
    hands: [['9D', '2S'], ['QD', '3S'], ['AS', '4S'], ['QS', '5S']],
    leader: 0,
  });
  g = E.play(g, '9D');
  g = E.play(g, 'QD');
  g = E.play(g, 'AS'); // bích cao hơn nhưng không phải chất được mở
  g = E.play(g, 'QS');
  eq(g.last.winner, 1);
  eq([g.turn, g.leader, g.trick.length, g.tricks], [1, 1, 0, 12]);
  eq(g.taken[1], ['QS']);
  eq(g.voids[2], ['D']);
  eq(g.voids[3], ['D']);
});

test('ra lá sai lượt / sai luật thì báo lỗi, không đụng trạng thái cũ', () => {
  const g = setup({ hands: [['9D', '2S'], ['QD', '3S'], ['AS', '4S'], ['QS', '5S']], leader: 0 });
  const snap = JSON.stringify(g);
  throws(() => E.play(g, 'QD'), 'lá của người khác');
  throws(() => E.play(g, 'KH'), 'lá không có');
  E.play(g, '9D');
  eq(JSON.stringify(g), snap);
});

/* ---------------- Tính điểm ---------------- */

test('điểm lá: cơ 1, Q♠ 13, còn lại 0; cả bộ 26 điểm', () => {
  eq([E.cardPoints('2H'), E.cardPoints('AH'), E.cardPoints('QS'), E.cardPoints('KS'), E.cardPoints('QD')], [1, 1, 13, 0, 0]);
  eq(E.sumPoints(ALL), 26);
});

test('điểm ván thường và bắn trăng', () => {
  eq(E.roundPoints([['QS', '2H'], ['3H'], [], ['4H', '5H']]), { pts: [14, 1, 0, 2], moon: -1 });
  const hearts = ALL.filter((id) => suitOf(id) === 'H');
  eq(E.roundPoints([[], hearts.concat('QS'), [], []]), { pts: [26, 0, 26, 26], moon: 1 });
  // 13 cơ nhưng không có Q♠ thì không phải bắn trăng
  eq(E.roundPoints([['QS'], hearts, [], []]), { pts: [13, 13, 0, 0], moon: -1 });
});

test('hết ván: cộng điểm vào tổng và bảng điểm từng ván', () => {
  // Nước cuối: Bắc ăn 3♥, cả ván ai cũng đã ăn một ít
  const g0 = setup({
    hands: [['2D'], ['3D'], ['AD'], ['3H']],
    leader: 0,
    taken: [['QS'], ['2H', '4H'], [], ['5H', '6H', '7H', '8H', '9H', '10H', 'JH', 'QH', 'KH', 'AH']],
    scores: [10, 20, 30, 40],
    history: [{ pts: [10, 20, 30, 40], moon: -1 }],
    round: 2,
  });
  let g = E.play(E.play(E.play(g0, '2D'), '3D'), 'AD');
  g = E.play(g, '3H');
  eq(g.phase, 'round');
  eq(g.history[1], { pts: [13, 2, 1, 10], moon: -1 });
  eq(g.scores, [23, 22, 31, 50]);
  const n = E.nextRound(g);
  eq([n.round, n.phase, n.tricks, n.taken, n.scores], [3, 'pass', 0, [[], [], [], []], [23, 22, 31, 50]]);
  checkCards(n);
});

test('bắn trăng ở nước cuối: người bắn 0, ba người kia +26', () => {
  const hearts = ALL.filter((id) => suitOf(id) === 'H' && id !== 'AH');
  const g0 = setup({
    hands: [['AH'], ['2D'], ['3D'], ['4D']],
    leader: 0,
    broken: true,
    taken: [hearts.concat('QS'), [], [], []],
    scores: [5, 5, 5, 5],
    history: [{ pts: [5, 5, 5, 5], moon: -1 }],
    round: 2,
  });
  let g = g0;
  ['AH', '2D', '3D', '4D'].forEach((id) => (g = E.play(g, id)));
  eq(g.history[1], { pts: [0, 26, 26, 26], moon: 0 });
  eq(g.scores, [5, 31, 31, 31]);
});

test('hết trận khi có người ≥ 100; điểm thấp nhất thắng; đồng hạng thấp nhất thì đánh thêm', () => {
  ok(!E.isOver([99, 50, 20, 30]));
  ok(E.isOver([100, 50, 20, 30]));
  ok(!E.isOver([100, 20, 20, 30]), 'đồng hạng thấp nhất');
  ok(E.isOver([100, 20, 21, 20 + 1]));
  const g0 = setup({
    hands: [['2D'], ['3D'], ['AD'], ['3H']],
    leader: 0,
    taken: [[], [], ['QS'], ['2H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', 'JH', 'QH', 'KH', 'AH']],
    scores: [60, 70, 80, 90],
    history: [{ pts: [60, 70, 80, 90], moon: -1 }],
    round: 2,
  });
  let g = g0;
  ['2D', '3D', 'AD', '3H'].forEach((id) => (g = E.play(g, id)));
  eq(g.scores, [60, 70, 94, 102]);
  eq([g.phase, E.matchWinner(g)], ['over', 0]);
  throws(() => E.nextRound(g));
  // Bạn đồng hạng thấp nhất với Tây: chưa hết trận
  const tie = setup(Object.assign({}, { hands: g0.hands, leader: 0, taken: g0.taken, history: [{ pts: [70, 70, 80, 90], moon: -1 }], scores: [70, 70, 80, 90], round: 2 }));
  g = tie;
  ['2D', '3D', 'AD', '3H'].forEach((id) => (g = E.play(g, id)));
  eq([g.phase, E.matchWinner(g)], ['round', null]);
});

/* ---------------- Máy ---------------- */

test('máy mọi mức luôn chuyền và ra lá hợp lệ (300 trận ngẫu nhiên, mức trộn)', () => {
  const lv = E.LEVELS;
  let plays = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const levels = [0, 1, 2, 3].map((s) => lv[(seed + s) % 3]);
    const { g } = playMatch(seed, levels, (st, id) => {
      plays++;
      if (E.legalPlays(st).indexOf(id) < 0) throw new Error('máy ra lá sai luật ' + id + ' seed ' + seed);
    });
    checkCards(g);
    ok(g.scores.some((s) => s >= 100));
    eq(g.history.reduce((a, h) => a.map((x, i) => x + h.pts[i]), [0, 0, 0, 0]), g.scores);
    g.history.forEach((h) => ok(h.moon >= 0 ? h.pts.filter((p) => p === 26).length === 3 : h.pts.reduce((a, b) => a + b, 0) === 26));
  }
  ok(plays > 300 * 4 * 52, 'đủ số nước');
});

test('máy chuyền đúng 3 lá có trên tay ở mọi mức', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const g = E.newMatch({ seed });
    E.LEVELS.forEach((lv) => {
      for (let s = 0; s < 4; s++) {
        const p = E.aiPass(g, s, lv);
        eq(p.length, 3);
        eq(new Set(p).size, 3);
        p.forEach((id) => ok(g.hands[s].indexOf(id) >= 0));
      }
    });
  }
});

test('máy chọn tất định (cùng ván, cùng nước)', () => {
  const g = E.exchange(E.newMatch({ seed: 21 }), E.newMatch({ seed: 21 }).hands.map((h) => h.slice(0, 3)));
  let a = g;
  let b = g;
  for (let i = 0; i < 20; i++) {
    const x = E.aiPlay(a, 'easy');
    eq(x, E.aiPlay(b, 'easy'));
    a = E.play(a, x);
    b = E.play(b, x);
  }
});

test('máy Vừa / Khó đổ Q♠ khi hết chất (sau nước đầu)', () => {
  ['medium', 'hard'].forEach((lv) => {
    const g = setup({
      hands: [['QS', 'KH', '2C'], ['5D', '2S', 'AH'], ['7D', '4S', '6H'], ['8S', '3H']],
      trick: [{ seat: 3, card: '9D' }],
      leader: 3,
    });
    eq(E.aiPlay(g, lv), 'QS', lv);
  });
});

test('máy Vừa / Khó lọt dưới lá đang thắng (lá cao nhất không ăn)', () => {
  ['medium', 'hard'].forEach((lv) => {
    const g = setup({
      hands: [['3D', '8D', 'KD', '2S'], ['5D', '2C', 'AH', '3S'], ['7D', '4S', '6H', '5S'], ['9C', '8S', '3H']],
      trick: [{ seat: 3, card: '10D' }],
      leader: 3,
      broken: true,
    });
    eq(E.aiPlay(g, lv), '8D', lv);
  });
});

test('máy Vừa / Khó thả Q♠ dưới K♠ / A♠ của người khác', () => {
  ['medium', 'hard'].forEach((lv) => {
    const g = setup({
      hands: [['QS', '3S', '2D'], ['5D', '2C', 'AH'], ['7D', '4S', '6H'], ['9C', '3H']],
      trick: [{ seat: 3, card: 'KS' }],
      leader: 3,
    });
    eq(E.aiPlay(g, lv), 'QS', lv);
  });
});

test('máy Khó: người ra cuối, nước không điểm thì xả lá to (không phải Q♠)', () => {
  const g = setup({
    hands: [['10D', 'JD', 'AD', '5S'], ['9C', '2S', 'AH'], ['6C', '4S', '6H'], ['8C', '8S', '3H']],
    trick: [{ seat: 1, card: '9D' }, { seat: 2, card: '6D' }, { seat: 3, card: '8D' }],
    leader: 1,
  });
  eq(E.aiPlay(g, 'hard'), 'AD');
});

test('máy Khó chuyền Q♠ khi ít bích che, giữ khi có nhiều bích nhỏ', () => {
  const g = E.newMatch({ seed: 1 });
  const rest = ALL.filter((id) => ['QS', 'AS', '2C', '3C', '5D', '6D', '7D', '8D', '9H', '2H', '3H', '4H', '5H'].indexOf(id) < 0);
  const short = Object.assign({}, g, {
    hands: [['QS', 'AS', '2C', '3C', '5D', '6D', '7D', '8D', '9H', '2H', '3H', '4H', '5H'], rest.slice(0, 13), rest.slice(13, 26), rest.slice(26, 39)],
  });
  const p = E.aiPass(short, 0, 'hard');
  ok(p.indexOf('QS') >= 0 && p.indexOf('AS') >= 0, 'chuyền Q♠ và A♠: ' + p);
  const long = ['QS', '2S', '3S', '4S', '5S', '6S', 'AD', 'KD', 'QD', 'JD', '2H', '3H', '4H'];
  const rest2 = ALL.filter((id) => long.indexOf(id) < 0);
  const p2 = E.aiPass(Object.assign({}, g, { hands: [long, rest2.slice(0, 13), rest2.slice(13, 26), rest2.slice(26, 39)] }), 0, 'hard');
  ok(p2.indexOf('QS') < 0, 'giữ Q♠: ' + p2);
});

test('máy Vừa chuyền Q♠ / lá to; máy Dễ chuyền ngẫu nhiên', () => {
  const hand = ['QS', 'AS', '2C', '3C', '5D', '6D', '7D', '8D', 'AH', '2H', '3H', '4H', '5H'];
  const rest = ALL.filter((id) => hand.indexOf(id) < 0);
  const g = Object.assign({}, E.newMatch({ seed: 1 }), { hands: [hand, rest.slice(0, 13), rest.slice(13, 26), rest.slice(26, 39)] });
  eq(sorted(E.aiPass(g, 0, 'medium')), sorted(['QS', 'AS', 'AH']));
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) seen.add(sorted(E.aiPass(Object.assign({}, g, { rng: seed }), 0, 'easy')).join());
  ok(seen.size > 10, 'máy Dễ chuyền đa dạng');
});

test('máy Khó thử bắn trăng khi bài còn lại toàn lá chắc ăn', () => {
  // Bạn đã ăn Q♠ và vài lá cơ, chưa ai khác ăn điểm, trên tay toàn lá to nhất còn lại: mở lá to nhất để ăn tiếp
  const g = setup({
    hands: [['AH', 'KH', 'QH', 'AD'], ['2D', '3D', '4D', '5D'], ['6D', '7D', '8D', '2H'], ['9D', '10D', 'JD', '3H']],
    leader: 0,
    broken: true,
    taken: [['QS', '4H', '5H', '6H', '7H', '8H', '9H', '10H', 'JH'], [], [], []],
  });
  const id = E.aiPlay(g, 'hard');
  ok(id === 'AD' || id === 'AH' || id === 'KH' || id === 'QH', 'ra lá chắc ăn: ' + id);
  // Đi hết ván theo máy Khó (ba máy kia Dễ): bắn trăng thành công
  let st = g;
  while (st.phase === 'play') st = E.play(st, E.aiPlay(st, st.turn === 0 ? 'hard' : 'easy'));
  eq(st.history[st.history.length - 1].moon, 0);
});

test('máy Khó chặn bắn trăng: ăn nước có điểm của người đang bắn', () => {
  // Đông đã ăn hết 10 điểm đã ra, đang thắng nước có cơ: bạn có lá cao hơn thì ăn
  const g = setup({
    hands: [['KH', '2H', '5C', '2D'], ['3C', '4C', '6C'], ['8C', '9C', '10C'], ['JC', 'QC', 'KC']],
    trick: [{ seat: 1, card: '7H' }, { seat: 2, card: '9H' }, { seat: 3, card: 'QH' }],
    leader: 1,
    broken: true,
    taken: [[], [], [], ['3H', '4H', '5H', '6H', '8H', '10H', 'JH', 'AH', 'QS'].slice(0, 9)],
  });
  eq(E.moonThreat(g, 0), 3);
  eq(E.aiPlay(g, 'hard'), 'KH');
  eq(E.aiPlay(g, 'medium'), '2H', 'máy Vừa không chặn');
});

/** Điểm trung bình mỗi ván của ghế 0 (mức a) khi ba máy còn lại mức b, qua n trận. */
function duel(a, b, n) {
  let pts = 0;
  let rounds = 0;
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) {
    const { g } = playMatch(1000 + seed, [a, b, b, b]);
    g.history.forEach((h) => {
      pts += h.pts[0];
      rounds++;
    });
    if (E.matchWinner(g) === 0) wins++;
  }
  return { avg: pts / rounds, rate: wins / n };
}

const results = {};
test('máy Khó hơn hẳn máy Dễ (ngẫu nhiên): ít điểm hơn nhiều, thắng phần lớn trận', () => {
  const r = (results.hardEasy = duel('hard', 'easy', 200));
  ok(r.avg < 3.5, 'điểm trung bình ' + r.avg.toFixed(2));
  ok(r.rate > 0.75, 'tỉ lệ thắng ' + r.rate);
});

test('máy Vừa hơn máy Dễ', () => {
  const r = (results.medEasy = duel('medium', 'easy', 200));
  ok(r.avg < 5, 'điểm trung bình ' + r.avg.toFixed(2));
  ok(r.rate > 0.6, 'tỉ lệ thắng ' + r.rate);
});

test('máy Khó hơn máy Vừa', () => {
  const r = (results.hardMed = duel('hard', 'medium', 200));
  ok(r.avg < 6.5, 'điểm trung bình ' + r.avg.toFixed(2) + ' (một ghế ngang sức là 6,5)');
  ok(r.rate > 0.35, 'tỉ lệ thắng ' + r.rate + ' (ngang sức là 0,25)');
});

test('đối chứng: máy Dễ đấu máy Dễ ở mức ngang sức', () => {
  const r = (results.easyEasy = duel('easy', 'easy', 200));
  ok(r.avg > 5 && r.avg < 8, 'điểm trung bình ' + r.avg.toFixed(2));
});

/* ---------------- Lưu / khôi phục ---------------- */

function midGame() {
  let g = E.newMatch({ seed: 77, level: 'hard' });
  g = playRound(g, ['hard', 'hard', 'hard', 'hard']);
  g = E.nextRound(g);
  g = E.exchange(g, [0, 1, 2, 3].map((s) => E.aiPass(g, s)));
  for (let i = 0; i < 18; i++) g = E.play(g, E.aiPlay(g));
  return g;
}

test('lưu rồi khôi phục giữ nguyên ván (mọi giai đoạn)', () => {
  const g = midGame();
  ok(g.trick.length > 0 && g.tricks > 0);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g);
  const p = E.newMatch({ seed: 3 });
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(p)))), p, 'đang chuyền');
  let r = p;
  r = playRound(r, ['easy', 'easy', 'easy', 'easy']);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(r)))), r, 'hết ván');
  const { g: over } = playMatch(5, ['easy', 'easy', 'easy', 'easy']);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(over)))), over, 'hết trận');
});

test('từ chối dữ liệu hỏng', () => {
  const good = JSON.parse(JSON.stringify(E.toJSON(midGame())));
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const swap = (() => {
    const h = good.hands.map((x) => x.slice());
    h[0][0] = h[1][0];
    return h;
  })();
  [
    null, 1, 'x', [], {},
    bad({ v: 2 }),
    bad({ level: 'pro' }),
    bad({ phase: 'x' }),
    bad({ scores: [0, 0, 0] }),
    bad({ scores: [-1, 0, 0, 0] }),
    bad({ round: 0 }),
    bad({ turn: 4 }),
    bad({ hands: swap }),
    bad({ hands: good.hands.slice(0, 3) }),
    bad({ hands: good.hands.map((h, i) => (i ? h : h.concat('XX'))) }),
    bad({ played: good.played.slice(1) }),
    bad({ tricks: good.tricks + 1 }),
    bad({ trick: good.trick.map((p) => ({ seat: (p.seat + 1) % 4, card: p.card })) }),
    bad({ turn: (good.turn + 1) % 4 }),
    bad({ taken: [['2C'], [], [], []] }),
    bad({ broken: 'yes' }),
    bad({ history: [] }),
    bad({ humanMoves: good.moves + 1 }),
    bad({ passed: [['2C']] }),
    bad({ voids: [['X'], [], [], []] }),
  ].forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (results.hardEasy) {
  const f = (r) => r.avg.toFixed(2) + ' điểm/ván, thắng ' + Math.round(r.rate * 100) + '% trận';
  console.log('Khó vs 3 Dễ: ' + f(results.hardEasy));
  console.log('Vừa vs 3 Dễ: ' + f(results.medEasy));
  console.log('Khó vs 3 Vừa: ' + f(results.hardMed));
  console.log('Dễ vs 3 Dễ: ' + f(results.easyEasy));
}
if (failed) process.exit(1);
