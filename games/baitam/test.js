/* Kiểm tra engine Bài Tám: chạy `node test.js`
 * - Chia bài, luật lá mở đầu (lá 8 thì trộn lại), luật đánh (cùng chất / cùng bậc / lá 8 + gọi chất)
 * - Rút / bỏ lượt, trộn lại chồng bài đã đánh khi hết nọc
 * - Tính điểm ván, sang ván, hết trận khi chạm mốc
 * - Máy (Dễ / Khó) luôn đi nước hợp lệ; máy Khó giữ lá 8, chọn chất nhiều nhất, nhớ chất đối thủ không theo được,
 *   xả lá to khi đối thủ sắp hết bài
 * - Mô phỏng hàng nghìn trận toàn máy: trận nào cũng kết thúc, 52 lá luôn đủ
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

const ALL = C.newDeck().map(C.toId);
const rankOf = (id) => C.fromId(id).rank;
const suitOf = (id) => C.fromId(id).suit;

/** Đủ 52 lá, không trùng, ở đúng các chỗ: nọc, chồng đã đánh, bốn tay. */
function checkCards(g) {
  const all = g.deck.concat(g.pile, g.hands[0], g.hands[1], g.hands[2], g.hands[3]);
  eq(all.length, 52, 'tổng số lá');
  eq(new Set(all).size, 52, 'lá trùng');
  all.forEach((id) => ok(ALL.indexOf(id) >= 0, 'lá lạ ' + id));
}

/**
 * Dựng ván tay để test luật: hands (4 mảng id), pile (mảng id, lá cuối là lá trên cùng), suit (mặc định chất lá trên).
 * deck bỏ trống = mọi lá còn lại; cho sẵn deck thì lá còn thừa nằm dưới đáy chồng đã đánh (để đủ 52 lá).
 */
function setup(o) {
  const g = E.newMatch({ seed: 1, level: o.level || 'easy', target: o.target || 100 });
  const hands = o.hands.map((h) => h.slice());
  const pile = o.pile.slice();
  const used = new Set([].concat(...hands, pile, o.deck || []));
  const rest = ALL.filter((id) => !used.has(id));
  const st = Object.assign({}, g, {
    hands,
    pile: (o.deck ? rest : []).concat(pile),
    deck: o.deck ? o.deck.slice() : rest,
    suit: o.suit || suitOf(pile[pile.length - 1]),
    turn: o.turn || 0,
    scores: o.scores || [0, 0, 0, 0],
    voids: o.voids || [[], [], [], []],
  });
  checkCards(st);
  return st;
}

/* ---------------- Điểm lá ---------------- */
test('điểm lá: 8 = 50, J/Q/K = 10, A = 1, còn lại theo số', () => {
  eq(['8S', 'KH', 'QD', 'JC', 'AS', '2H', '7C', '10D', '9S'].map(E.cardPoints), [50, 10, 10, 10, 1, 2, 7, 10, 9]);
  eq(E.handPoints(['8S', 'KH', 'AS']), 61);
  eq(E.handPoints([]), 0);
});

/* ---------------- Chia bài ---------------- */
test('trận mới: mỗi người 5 lá, một lá mở, 31 lá nọc, bạn đi trước ở ván 1', () => {
  const g = E.newMatch({ seed: 42, level: 'hard', target: 50 });
  eq(g.hands.map((h) => h.length), [5, 5, 5, 5]);
  eq(g.pile.length, 1);
  eq(g.deck.length, 31);
  checkCards(g);
  eq([g.turn, g.dealer, g.round, g.phase, g.level, g.target, g.scores], [0, 3, 1, 'play', 'hard', 50, [0, 0, 0, 0]]);
  ok(rankOf(E.top(g)) !== 8, 'lá mở không phải 8');
  eq(g.suit, suitOf(E.top(g)));
});

test('cùng hạt giống thì cùng ván; khác hạt giống thì khác', () => {
  eq(E.newMatch({ seed: 7 }), E.newMatch({ seed: 7 }));
  ok(JSON.stringify(E.newMatch({ seed: 7 }).hands) !== JSON.stringify(E.newMatch({ seed: 8 }).hands));
});

test('mặc định: mức Dễ, mốc 100; giá trị lạ thì về mặc định; nhận mốc dạng chuỗi', () => {
  const g = E.newMatch({ seed: 1 });
  eq([g.level, g.target], ['easy', 100]);
  const h = E.newMatch({ seed: 1, level: 'x', target: 77 });
  eq([h.level, h.target], ['easy', 100]);
  eq(E.newMatch({ seed: 1, target: '200' }).target, 200);
});

test('lá mở đầu là 8 thì trộn lại vào nọc và lật lá khác', () => {
  const deck = ALL.filter((id) => id !== '8H' && id !== '8S').concat(['8S', '8H']); // hai lá trên cùng đều là 8
  const res = E.turnStarter(deck, C.rng(5));
  ok(rankOf(res.starter) !== 8, 'lá mở không phải 8: ' + res.starter);
  eq(res.deck.length, 51);
  eq(new Set(res.deck.concat(res.starter)).size, 52);
  ok(res.deck.indexOf('8H') >= 0 && res.deck.indexOf('8S') >= 0, 'hai lá 8 vẫn trong nọc');
  eq(deck.length, 52, 'không đụng mảng vào');
});

test('mọi ván chia (2000 hạt giống) đều có lá mở khác 8 và đủ 52 lá; luật trộn lại có chạy thật', () => {
  let saw8 = 0;
  for (let s = 0; s < 2000; s++) {
    const g = E.newMatch({ seed: s });
    ok(rankOf(E.top(g)) !== 8, 'seed ' + s);
    checkCards(g);
    // Lá lật ra đầu tiên (trước luật 8): chia 20 lá từ trên nọc rồi lật lá thứ 21
    const d = C.shuffle(ALL, C.rng(s));
    if (rankOf(d[d.length - 21]) === 8) saw8++;
  }
  ok(saw8 > 0, 'có ván lá lật đầu tiên là 8');
});

/* ---------------- Luật đánh ---------------- */
test('đánh được: cùng chất, cùng bậc, hoặc lá 8 bất kỳ', () => {
  const g = setup({ hands: [['5H', '9S', '8C', 'KD', '9C'], ['2S'], ['3S'], ['4S']], pile: ['9H'] });
  ok(E.isLegal(g, '5H'), 'cùng chất');
  ok(E.isLegal(g, '9S'), 'cùng bậc');
  ok(E.isLegal(g, '8C'), 'lá 8');
  ok(!E.isLegal(g, 'KD'), 'khác chất khác bậc');
  eq(E.legalPlays(g), ['5H', '9S', '8C', '9C']);
});

test('đánh lá không hợp lệ hoặc không có trên tay thì báo lỗi; hết ván thì không còn nước', () => {
  const g = setup({ hands: [['5H', 'KD'], ['2S'], ['3S'], ['4S']], pile: ['9H'] });
  throws(() => E.play(g, 'KD'));
  throws(() => E.play(g, '5C'));
  eq(E.legalPlays(Object.assign({}, g, { phase: 'round' })), []);
});

test('đánh lá thường: rời tay, lên đầu chồng, chất theo lá, chuyển lượt theo chiều kim đồng hồ', () => {
  const g = setup({ hands: [['5H', 'KD'], ['2S', '3C'], ['3S', '4C'], ['4S', '5C']], pile: ['9H'] });
  const n = E.play(g, '5H');
  eq(n.hands[0], ['KD']);
  eq(E.top(n), '5H');
  eq([n.suit, n.turn, n.humanMoves, n.moves], ['H', 1, 1, 1]);
  eq(n.last, { seat: 0, type: 'play', card: '5H' });
  eq(g.hands[0], ['5H', 'KD'], 'ván cũ không đổi');
  checkCards(n);
  const m = E.draw(n);
  eq([m.turn, m.humanMoves, m.moves], [1, 1, 2], 'nước của máy không tính là nước của bạn');
});

test('lá 8: bắt buộc gọi chất; chất gọi quyết định lá tiếp theo', () => {
  const g = setup({ hands: [['8C', 'KD'], ['2S', '3C'], ['3S', '4C'], ['4S', '5C']], pile: ['9H'] });
  throws(() => E.play(g, '8C'), 'thiếu chất');
  throws(() => E.play(g, '8C', 'X'), 'chất sai');
  const n = E.play(g, '8C', 'S');
  eq([E.top(n), n.suit, n.turn], ['8C', 'S', 1]);
  ok(E.isLegal(n, '2S'), 'bích được');
  ok(!E.isLegal(n, '3C'), 'nhép (chất của lá 8) không được');
  ok(E.isLegal(n, '8D'), 'lá 8 khác vẫn được');
  eq(n.last, { seat: 0, type: 'play', card: '8C', suit: 'S' });
});

test('rút bài: thêm một lá, chỉ lá vừa rút được đánh, sau đó được bỏ lượt', () => {
  const deck = ['2C', '3D', '7H']; // lá trên cùng của nọc là lá cuối: 7H
  const g = setup({ hands: [['5H', 'KD'], ['2S', '3C'], ['3S', '4C'], ['4S', '5C']], pile: ['9H'], deck });
  ok(E.canDraw(g), 'được rút dù đang có lá đánh được');
  ok(!E.canPass(g), 'chưa rút thì chưa được bỏ lượt');
  const d = E.draw(g);
  eq([d.hands[0], d.drawn, d.deck.length, d.turn, d.humanMoves], [['5H', 'KD', '7H'], '7H', 2, 0, 1]);
  eq(d.last, { seat: 0, type: 'draw', reshuffled: false });
  eq(E.legalPlays(d), ['7H'], 'chỉ lá vừa rút');
  ok(!E.canDraw(d), 'không rút lá thứ hai');
  ok(E.canPass(d), 'được bỏ lượt');
  throws(() => E.draw(d));
  throws(() => E.play(d, '5H'), 'lá cũ trên tay không đánh được sau khi rút');
  const p = E.play(d, '7H');
  eq([p.turn, p.drawn, E.top(p)], [1, null, '7H']);
  const q = E.pass(d);
  eq([q.turn, q.drawn, q.hands[0].length, q.humanMoves], [1, null, 3, 2]);
  eq(q.last, { seat: 0, type: 'pass' });
  throws(() => E.pass(q), 'máy chưa rút thì chưa bỏ lượt được');
  checkCards(q);
});

test('rút lá không đánh được thì chỉ còn bỏ lượt', () => {
  const g = setup({ hands: [['KD'], ['2S'], ['3S'], ['4S']], pile: ['9H'], deck: ['2C', '3D', '4C'] });
  const d = E.draw(g);
  eq(E.legalPlays(d), []);
  ok(E.canPass(d));
});

test('rút bài ghi nhận chất người đó không theo được (máy Khó dùng); đánh lại chất đó thì xóa', () => {
  const g = setup({ hands: [['KD', '2H'], ['2S'], ['3S'], ['4S']], pile: ['9C'], deck: ['5S', '6S', '7S'] });
  const d = E.pass(E.draw(g));
  eq(d.voids, [['C'], [], [], []]);
  const g2 = setup({ hands: [['KD', '2C'], ['2S'], ['3S'], ['4S']], pile: ['9C'], voids: [['C', 'H'], [], [], []] });
  eq(E.play(g2, '2C').voids[0], ['H']);
});

test('hết nọc: trộn chồng đã đánh (trừ lá trên cùng) làm nọc mới', () => {
  const hands = [['5H', 'KD'], ['2S', '3C'], ['3S', '4C'], ['4S', '5C']];
  const used = new Set([].concat(...hands, ['9H']));
  const pile = ALL.filter((id) => !used.has(id)).concat(['9H']);
  const g = setup({ hands, pile, deck: [] });
  ok(E.canDraw(g));
  const d = E.draw(g);
  eq(d.pile, ['9H']);
  eq(d.deck.length, pile.length - 2);
  eq(d.hands[0].length, 3);
  eq(d.last.reshuffled, true);
  ok(d.rng !== g.rng, 'PRNG chạy tiếp');
  checkCards(d);
  eq(E.draw(g).deck, d.deck, 'cùng ván thì cùng kết quả');
});

test('nọc rỗng và chồng chỉ còn một lá: không rút được; không đánh được thì bỏ lượt; đánh được thì phải đánh', () => {
  const used = new Set(['KD', 'KH', '2S', '3S', '4S', '9H']);
  const rest = ALL.filter((id) => !used.has(id));
  const g = setup({ hands: [['KD'], rest.concat('2S', 'KH'), ['3S'], ['4S']], pile: ['9H'], deck: [] });
  eq(g.pile.length, 1);
  ok(!E.canDraw(g));
  ok(E.canPass(g), 'không đánh được, không rút được: bỏ lượt');
  const p = E.pass(g);
  eq([p.turn, p.voids[0]], [1, ['H']]);
  const h = setup({ hands: [['KH'], rest.concat('2S', 'KD'), ['3S'], ['4S']], pile: ['9H'], deck: [] });
  ok(!E.canPass(h), 'có lá đánh được thì không bỏ lượt');
  throws(() => E.pass(h));
});

/* ---------------- Hết ván, hết trận ---------------- */
test('đánh lá cuối cùng: thắng ván, ăn điểm bài còn trên tay đối thủ', () => {
  const g = setup({ hands: [['5H'], ['8S', 'KD'], ['AS', '2C'], ['10D']], pile: ['9H'], scores: [10, 20, 0, 5] });
  const n = E.play(g, '5H');
  eq(n.phase, 'round');
  eq(n.result, { winner: 0, points: [0, 60, 3, 10], gain: 73 });
  eq(n.scores, [83, 20, 0, 5]);
  eq(E.matchWinner(n), null);
  ok(!E.canDraw(n) && !E.canPass(n), 'hết ván thì không rút / bỏ lượt');
});

test('lá cuối là 8 vẫn phải gọi chất và vẫn thắng ván', () => {
  const g = setup({ hands: [['8H'], ['KD'], ['2C'], ['10D']], pile: ['9S'] });
  throws(() => E.play(g, '8H'));
  const n = E.play(g, '8H', 'C');
  eq([n.phase, n.result.winner, n.result.gain], ['round', 0, 22]);
});

test('sang ván: người chia xoay vòng, người bên trái người chia đi trước, giữ điểm', () => {
  const g = setup({ hands: [['5H'], ['KD'], ['2C'], ['10D']], pile: ['9H'] });
  const r = E.play(g, '5H');
  throws(() => E.play(r, 'KD'), 'hết ván thì không đánh nữa');
  const n = E.nextRound(r);
  eq([n.round, n.dealer, n.turn, n.phase, n.result, n.drawn], [2, 0, 1, 'play', null, null]);
  eq(n.scores, r.scores);
  eq(n.voids, [[], [], [], []]);
  eq(n.hands.map((h) => h.length), [5, 5, 5, 5]);
  ok(rankOf(E.top(n)) !== 8);
  checkCards(n);
  throws(() => E.nextRound(n), 'đang chơi thì không sang ván');
  const r2 = E.play(Object.assign(setup({ hands: [['5H'], ['KD'], ['2C'], ['10D']], pile: ['9H'] }), { dealer: 2, round: 4 }), '5H');
  const n2 = E.nextRound(r2);
  eq([n2.round, n2.dealer, n2.turn], [5, 3, 0]);
});

test('chạm mốc điểm thì hết trận; bạn chạm trước là thắng trận', () => {
  const g = setup({ hands: [['5H'], ['KD'], ['2C'], ['10D']], pile: ['9H'], scores: [80, 90, 0, 0], target: 100 });
  const n = E.play(g, '5H');
  eq([n.phase, n.scores[0], E.matchWinner(n)], ['over', 102, 0]);
  throws(() => E.nextRound(n), 'hết trận thì không sang ván');
  ok(!E.canDraw(n) && !E.canPass(n));
});

test('máy chạm mốc trước thì máy thắng trận', () => {
  const g = setup({ hands: [['KD', 'QC'], ['5H'], ['2C'], ['10D']], pile: ['9H'], scores: [45, 40, 0, 0], target: 50, turn: 1 });
  const n = E.play(g, '5H');
  eq([n.phase, E.matchWinner(n), n.scores[1], n.humanMoves], ['over', 1, 72, 0]);
});

/* ---------------- Máy ---------------- */
test('máy: không có lá đánh được thì rút; rút được lá hợp lệ thì đánh; không thì bỏ lượt', () => {
  ['easy', 'hard'].forEach((lv) => {
    const g = setup({ hands: [['KD'], ['2S', '3C'], ['3S'], ['4S']], pile: ['9H'], deck: ['5C', '7H'], turn: 1 });
    eq(E.aiAction(g, lv), { type: 'draw' }, lv);
    eq(E.aiAction(E.draw(g), lv), { type: 'play', card: '7H' }, lv);
    const g2 = setup({ hands: [['KD'], ['2S', '3C'], ['3S'], ['4S']], pile: ['9H'], deck: ['7H', '5C'], turn: 1 });
    eq(E.aiAction(E.draw(g2), lv), { type: 'pass' }, lv);
  });
});

test('máy Khó: còn lá khác đánh được thì giữ lá 8', () => {
  const g = setup({ level: 'hard', hands: [['KD', 'QD', 'JD'], ['8S', '3H', '2C'], ['3S', '4S', '5S'], ['4D', '5D', '6D']], pile: ['9H'], turn: 1 });
  eq(E.aiAction(g), { type: 'play', card: '3H' });
});

test('máy Khó: đánh sang chất mình có nhiều nhất', () => {
  // Đầu chồng 9H; đánh được 9C (sang nhép, còn 3 nhép) hoặc 4H (giữ cơ, không còn cơ)
  const g = setup({ level: 'hard', hands: [['KD', 'QD', 'JD'], ['4H', '9C', 'JC', '2C', 'AC'], ['3S', '4S', '5S'], ['4D', '5D', '6D']], pile: ['9H'], turn: 1 });
  eq(E.aiAction(g).card, '9C');
});

test('máy Khó: chỉ còn lá 8 thì đánh 8 và gọi chất mình có nhiều nhất', () => {
  const g = setup({ level: 'hard', hands: [['KD', 'QD', 'JD'], ['8S', 'KC', '2D', '5D', 'AD'], ['3S', '4S', '5S'], ['4C', '5C', '6C']], pile: ['9H'], turn: 1 });
  eq(E.aiAction(g), { type: 'play', card: '8S', suit: 'D' });
});

test('máy Khó: đối thủ sắp hết bài thì xả lá điểm cao', () => {
  // Đầu chồng KH: KS (10 điểm, sang bích, không còn bích) hoặc 2H / 4H (giữ cơ, còn một cơ)
  const hand = ['KS', '2H', '4H', '6D'];
  const calm = setup({ level: 'hard', hands: [['KD', 'QD', 'JD'], hand, ['3S', '4S', '5S'], ['4C', '5C', '6C']], pile: ['KH'], turn: 1 });
  eq(E.aiAction(calm).card, '4H', 'bình thường: giữ chất có nhiều lá');
  const close = setup({ level: 'hard', hands: [['KD', 'QD', 'JD'], hand, ['3S'], ['4C', '5C', '6C', '5S', '4S']], pile: ['KH'], turn: 1 });
  eq(E.aiAction(close).card, 'KS', 'đối thủ còn 1 lá: xả lá 10 điểm');
});

test('máy Khó: ưu tiên chất người kế tiếp không theo được', () => {
  // Đánh 9C (sang nhép) hoặc 9S (sang bích), mỗi chất còn 1 lá; người kế tiếp (ghế 2) đã bị ghi không có nhép / bích
  const g = setup({ level: 'hard', hands: [['KD', 'QD', 'JD'], ['9C', '9S', '2C', '3S'], ['3D', '4D', '5D'], ['4H', '5H', '6H']], pile: ['9H'], turn: 1, voids: [[], [], ['C'], []] });
  eq(E.aiAction(g).card, '9C');
  eq(E.aiAction(Object.assign({}, g, { voids: [[], [], ['S'], []] })).card, '9S');
});

test('máy Dễ: chọn ngẫu nhiên trong các lá hợp lệ (cùng ván cùng nước, nhiều ván thì đủ kiểu)', () => {
  const g = setup({ hands: [['KD'], ['4H', '9C', 'JH', '8C', 'AC'], ['3S'], ['4S']], pile: ['9H'], turn: 1 });
  eq(E.aiAction(g), E.aiAction(g));
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const a = E.aiAction(Object.assign({}, g, { rng: i * 7919 }));
    ok(a.type === 'play' && E.isLegal(g, a.card), JSON.stringify(a));
    if (rankOf(a.card) === 8) ok(C.SUITS.indexOf(a.suit) >= 0, 'lá 8 có chất');
    seen.add(a.card);
  }
  eq(seen.size, 4, 'đủ 4 lá hợp lệ');
});

test('gợi ý chất cho lá 8: chất có nhiều lá nhất (không tính lá 8)', () => {
  eq(E.bestSuit(['8S', 'KC', '2D', '5D', 'AD']), 'D');
  eq(E.bestSuit(['8S', '8D', 'KC']), 'C');
  ok(C.SUITS.indexOf(E.bestSuit(['8S'])) >= 0);
});

/* ---------------- Mô phỏng ---------------- */
/** Chạy một trận toàn máy; levels: mức của từng ghế. */
function simulate(seed, levels, target, check) {
  let g = E.newMatch({ seed, level: 'easy', target });
  let steps = 0;
  let machine = 0;
  while (g.phase !== 'over') {
    if (g.phase === 'round') {
      g = E.nextRound(g);
      continue;
    }
    if (g.turn !== 0) machine++;
    const a = E.aiAction(g, levels[g.turn]);
    g = E.apply(g, a);
    if (check) checkCards(g);
    if (++steps > 200000) throw new Error('trận không kết thúc, seed ' + seed);
  }
  return { g, steps, machine };
}

test('3000 trận toàn máy (mọi mức, mọi mốc) đều kết thúc, đúng một người chạm mốc, 52 lá luôn đủ', () => {
  const targets = [50, 100, 200];
  const lv = [['easy', 'easy', 'easy', 'easy'], ['hard', 'hard', 'hard', 'hard'], ['hard', 'easy', 'hard', 'easy']];
  let maxRound = 0;
  let maxSteps = 0;
  for (let s = 0; s < 3000; s++) {
    const { g, steps } = simulate(1000 + s, lv[s % 3], targets[s % 3], s < 150);
    const w = E.matchWinner(g);
    ok(w != null && g.scores[w] >= g.target, 'seed ' + s);
    eq(g.scores.filter((x) => x >= g.target).length, 1, 'chỉ một người chạm mốc');
    checkCards(g);
    eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g, 'lưu trận đã xong');
    maxRound = Math.max(maxRound, g.round);
    maxSteps = Math.max(maxSteps, steps);
  }
  ok(maxRound >= 2);
  console.log('       (nhiều ván nhất trong một trận: ' + maxRound + ', nhiều nước nhất: ' + maxSteps + ')');
});

test('máy Khó thắng nhiều hơn hẳn máy Dễ (400 trận, ghế 0 Khó đấu 3 Dễ)', () => {
  let hard = 0;
  let base = 0;
  for (let s = 0; s < 400; s++) {
    if (E.matchWinner(simulate(50000 + s, ['hard', 'easy', 'easy', 'easy'], 100).g) === 0) hard++;
    if (E.matchWinner(simulate(50000 + s, ['easy', 'easy', 'easy', 'easy'], 100).g) === 0) base++;
  }
  console.log('       (ghế 0 Khó thắng ' + hard + '/400, ghế 0 Dễ thắng ' + base + '/400)');
  ok(hard >= 150, 'Khó thắng ít nhất 37%: ' + hard);
  ok(hard > base + 40, 'Khó hơn Dễ rõ rệt');
});

test('trận bạn thắng nhanh nhất (mốc 50) vẫn có ít nhất 12 lượt máy', () => {
  let min = Infinity;
  for (let s = 0; s < 1500; s++) {
    const r = simulate(90000 + s, ['hard', 'easy', 'easy', 'easy'], 50);
    if (E.matchWinner(r.g) === 0) min = Math.min(min, r.machine);
  }
  console.log('       (ít lượt máy nhất trong trận bạn thắng, mốc 50: ' + min + ')');
  ok(min >= 12 && min < Infinity);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván (giữa ván, sau khi rút, lúc hết ván)', () => {
  let g = E.newMatch({ seed: 99, level: 'hard', target: 200 });
  const snaps = [g];
  for (let i = 0; i < 600 && g.phase !== 'over'; i++) {
    g = g.phase === 'round' ? E.nextRound(g) : E.apply(g, E.aiAction(g));
    snaps.push(g);
  }
  ok(snaps.some((s) => s.drawn), 'có lúc vừa rút');
  ok(snaps.some((s) => s.phase === 'round'), 'có lúc hết ván');
  snaps.forEach((s, i) => eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s)))), s, 'bước ' + i));
});

test('ván khôi phục chạy tiếp đúng như ván gốc (PRNG trong ván lưu)', () => {
  let a = E.newMatch({ seed: 3 });
  for (let i = 0; i < 30; i++) a = a.phase === 'round' ? E.nextRound(a) : E.apply(a, E.aiAction(a));
  let b = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(a))));
  for (let i = 0; i < 300 && a.phase !== 'over'; i++) {
    a = a.phase === 'round' ? E.nextRound(a) : E.apply(a, E.aiAction(a));
    b = b.phase === 'round' ? E.nextRound(b) : E.apply(b, E.aiAction(b));
  }
  eq(b, a);
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.newMatch({ seed: 11 });
  const good = E.toJSON(g);
  eq(E.fromJSON(good), g);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const h0 = good.hands[0];
  const other = C.SUITS.find((s) => s !== good.suit);
  const cases = {
    null: null,
    số: 1,
    rỗng: {},
    mảng: [],
    'sai phiên bản': bad({ v: 99 }),
    'mức lạ': bad({ level: 'pro' }),
    'mốc lạ': bad({ target: 75 }),
    'điểm âm': bad({ scores: [-1, 0, 0, 0] }),
    'điểm lẻ': bad({ scores: [1.5, 0, 0, 0] }),
    'thiếu điểm': bad({ scores: [0, 0, 0] }),
    'đang chơi mà đã chạm mốc': bad({ scores: [100, 0, 0, 0] }),
    'lượt ngoài bàn': bad({ turn: 4 }),
    'người chia lạ': bad({ dealer: -1 }),
    'ván số 0': bad({ round: 0 }),
    'rng lạ': bad({ rng: 'x' }),
    'lá trùng': bad({ hands: [h0.slice(0, 4).concat(good.hands[1][0]), good.hands[1], good.hands[2], good.hands[3]] }),
    'thiếu lá': bad({ deck: good.deck.slice(1) }),
    'lá sai định dạng': bad({ deck: good.deck.slice(1).concat('ZZ') }),
    'lá viết thường': bad({ deck: good.deck.slice(1).concat(good.deck[0].toLowerCase()) }),
    'tay không phải mảng': bad({ hands: 'x' }),
    'chồng rỗng': bad({ pile: [], deck: good.deck.concat(good.pile) }),
    'chất lạ': bad({ suit: 'X' }),
    'chất không khớp lá trên cùng': bad({ suit: other }),
    'lá vừa rút không trên tay': bad({ drawn: good.deck[0] }),
    'tay rỗng khi đang chơi': bad({ hands: [[], good.hands[1], good.hands[2], good.hands[3]], deck: good.deck.concat(h0) }),
    'giai đoạn lạ': bad({ phase: 'x' }),
    'hết ván thiếu kết quả': bad({ phase: 'round' }),
    'kết quả lạ': bad({ phase: 'round', result: { winner: 7, points: [0, 0, 0, 0], gain: 0 } }),
    'void lạ': bad({ voids: [['X'], [], [], []] }),
    'số nước âm': bad({ humanMoves: -1 }),
    'nước cuối lạ': bad({ last: { seat: 9, type: 'play' } }),
  };
  Object.keys(cases).forEach((k) => eq(E.fromJSON(cases[k]), null, k));
});

test('apply: hành động lạ báo lỗi', () => {
  const g = E.newMatch({ seed: 2 });
  throws(() => E.apply(g, { type: 'fly' }));
  throws(() => E.apply(g, null));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
