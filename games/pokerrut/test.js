/* Kiểm tra engine Poker Rút (Video Poker, luật Jacks or Better, bảng trả 9/6): chạy `node test.js`
 * - Chấm bài: mọi loại tay và case biên (sảnh A thấp, thùng phá sảnh lớn vs thùng phá sảnh, thú vs cù lũ,
 *   đôi nhỏ không ăn, sảnh vòng Q-K-A-2-3 không tính)
 * - Tiền trả ở mọi mức cược, kể cả thùng phá sảnh lớn cược 5 xu = 4000
 * - Chia / rút từ cùng một bộ bài không trùng lá, giữ lá, xu và số tay còn lại
 * - Hết 25 tay hoặc hết xu thì xong; lưu / khôi phục và từ chối dữ liệu hỏng
 * - Kỳ vọng từng cách giữ (đếm theo bộ bậc + sửa thùng) khớp với duyệt hết mọi lá rút
 * - Monte Carlo với cách giữ tối ưu ra gần 99,54% (tỉ lệ trả lý thuyết của bảng 9/6)
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
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || 'điều kiện sai');
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg ? msg + ': ' : '') + a + ' không gần ' + b + ' (±' + tol + ')');
}

/** 'AS KS QS JS 10S' -> mảng lá. */
const hand = (s) => s.split(/\s+/).map((id) => {
  const c = C.fromId(id);
  if (!c) throw new Error('lá sai: ' + id);
  return c;
});
const cat = (s) => E.evaluate(hand(s));

/* ---------------- Chấm bài ---------------- */

test('chấm đủ 9 loại tay ăn tiền và bài không ăn', () => {
  eq(cat('AS KS QS JS 10S'), 'royal');
  eq(cat('9H 8H 7H 6H 5H'), 'sflush');
  eq(cat('7C 7D 7H 7S 2D'), 'quads');
  eq(cat('3C 3D 3H 9S 9D'), 'full');
  eq(cat('2D 7D 9D JD KD'), 'flush');
  eq(cat('5C 6D 7H 8S 9D'), 'straight');
  eq(cat('QC QD QH 4S 9D'), 'trips');
  eq(cat('4C 4D 9H 9S KD'), 'twopair');
  eq(cat('JC JD 2H 5S 9D'), 'jacks');
  eq(cat('2C 5D 8H JS KD'), null);
});

test('thứ tự lá không ảnh hưởng kết quả', () => {
  eq(cat('10S JS AS QS KS'), 'royal');
  eq(cat('9D 3H 9S 3C 3D'), 'full');
  eq(cat('9D 5C 8S 6D 7H'), 'straight');
});

test('sảnh A thấp (A-2-3-4-5) là sảnh; cùng chất là thùng phá sảnh, không phải thùng phá sảnh lớn', () => {
  eq(cat('AC 2D 3H 4S 5D'), 'straight');
  eq(cat('AH 2H 3H 4H 5H'), 'sflush');
  eq(cat('AC KD QH JS 10D'), 'straight', 'sảnh A cao khác chất');
});

test('sảnh không vòng qua A: Q-K-A-2-3 và K-A-2-3-4 không ăn', () => {
  eq(cat('QC KD AH 2S 3D'), null);
  eq(cat('KC AD 2H 3S 4D'), null);
  eq(cat('QH KH AH 2H 3H'), 'flush', 'cùng chất thì chỉ là thùng');
});

test('thùng phá sảnh lớn khác thùng phá sảnh: 9-K cùng chất là thùng phá sảnh', () => {
  eq(cat('KD QD JD 10D 9D'), 'sflush');
  eq(cat('AD KD QD JD 10D'), 'royal');
  eq(cat('AD KD QD JD 9D'), 'flush');
});

test('thú vs cù lũ vs sám vs tứ quý: chỉ đúng 3 + 2 mới là cù lũ', () => {
  eq(cat('8C 8D KH KS 2D'), 'twopair');
  eq(cat('8C 8D KH KS KD'), 'full');
  eq(cat('8C 8D 8H KS 2D'), 'trips');
  eq(cat('8C 8D 8H 8S KD'), 'quads');
  eq(cat('2C 2D 3H 3S 4D'), 'twopair', 'thú đôi nhỏ vẫn ăn');
});

test('đôi nhỏ (2..10) không ăn, đôi J / Q / K / A ăn', () => {
  ['2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((r) => eq(cat(r + 'C ' + r + 'D AH KS QD'), null, 'đôi ' + r));
  ['J', 'Q', 'K', 'A'].forEach((r) => eq(cat(r + 'C ' + r + 'D 2H 7S 4D'), 'jacks', 'đôi ' + r));
});

test('lá ăn tiền: đôi chỉ sáng hai lá đôi, sảnh / thùng sáng cả năm', () => {
  eq(E.winningCards(hand('JC 2D JH 5S 9D')), [0, 2]);
  eq(E.winningCards(hand('4C 9D 4H 9S KD')), [0, 1, 2, 3]);
  eq(E.winningCards(hand('5C 6D 7H 8S 9D')), [0, 1, 2, 3, 4]);
  eq(E.winningCards(hand('7C 7D 7H 7S 2D')), [0, 1, 2, 3]);
  eq(E.winningCards(hand('8C 8D KH KS KD')), [0, 1, 2, 3, 4]);
  eq(E.winningCards(hand('2C 2D 8H JS KD')), [], 'đôi nhỏ không sáng');
});

/* ---------------- Tiền trả ---------------- */

test('bảng trả 9/6: tiền theo mức cược 1..5', () => {
  const row = (c) => [1, 2, 3, 4, 5].map((b) => E.payout(c, b));
  eq(row('jacks'), [1, 2, 3, 4, 5]);
  eq(row('twopair'), [2, 4, 6, 8, 10]);
  eq(row('trips'), [3, 6, 9, 12, 15]);
  eq(row('straight'), [4, 8, 12, 16, 20]);
  eq(row('flush'), [6, 12, 18, 24, 30]);
  eq(row('full'), [9, 18, 27, 36, 45]);
  eq(row('quads'), [25, 50, 75, 100, 125]);
  eq(row('sflush'), [50, 100, 150, 200, 250]);
  eq(row(null), [0, 0, 0, 0, 0]);
});

test('thùng phá sảnh lớn: 250 / xu, riêng cược 5 xu được 4000 (800 / xu)', () => {
  eq([1, 2, 3, 4, 5].map((b) => E.payout('royal', b)), [250, 500, 750, 1000, 4000]);
});

test('bảng trả đầy đủ theo thứ tự hiển thị', () => {
  eq(E.CATS, ['royal', 'sflush', 'quads', 'full', 'flush', 'straight', 'trips', 'twopair', 'jacks']);
  eq(E.payTable(5).royal, 4000);
  eq(E.payTable(1).jacks, 1);
});

/* ---------------- Luồng tay bài ---------------- */

/** Ván đã chia một tay với hạt giống cố định. */
function dealt(seed, bet) {
  let g = E.newGame(seed);
  if (bet) g = E.setBet(g, bet);
  return E.deal(g);
}

test('ván mới: 100 xu, cược 5, 25 tay, chưa chia', () => {
  const g = E.newGame(1);
  eq([g.credits, g.bet, g.hands, g.phase, E.handsLeft(g), E.started(g), E.isOver(g)], [100, 5, 0, 'bet', 25, false, false]);
  eq([E.START_CREDITS, E.HANDS, E.MAX_BET], [100, 25, 5]);
});

test('đặt cược: Bet One xoay 1..5 rồi về 1, Bet Max lên 5, không quá số xu', () => {
  let g = E.newGame(1);
  const seen = [];
  for (let i = 0; i < 6; i++) {
    g = E.betOne(g);
    seen.push(g.bet);
  }
  eq(seen, [1, 2, 3, 4, 5, 1]);
  g = E.betMax(g);
  eq(g.bet, 5);
  eq(E.setBet(g, 9).bet, 5);
  eq(E.setBet(g, 0).bet, 1);
  const poor = Object.assign({}, E.newGame(1), { credits: 3, bet: 3 });
  eq(E.betOne(poor).bet, 1, 'chỉ còn 3 xu: 3 -> 1');
  eq(E.betMax(poor).bet, 3);
});

test('chia: trừ cược, 5 lá khác nhau, chưa giữ lá nào; giữa tay không đổi cược, không chia lại', () => {
  const g = dealt(42, 3);
  eq([g.credits, g.bet, g.phase, g.held], [97, 3, 'hold', [false, false, false, false, false]]);
  eq(g.hand.length, 5);
  eq(new Set(g.hand.map(C.toId)).size, 5);
  ok(g.hand.every(C.isCard));
  eq(E.betOne(g), g);
  eq(E.betMax(g), g);
  eq(E.deal(g), g);
  ok(E.started(g));
  eq(E.handsLeft(g), 24);
});

test('giữ lá: chạm lần nữa bỏ giữ; chỉ giữ được khi đang chờ rút', () => {
  let g = dealt(7);
  g = E.toggleHold(g, 1);
  g = E.toggleHold(g, 3);
  eq(g.held, [false, true, false, true, false]);
  g = E.toggleHold(g, 3);
  eq(g.held, [false, true, false, false, false]);
  eq(E.toggleHold(g, 9), g);
  eq(E.toggleHold(E.newGame(1), 0).held, [false, false, false, false, false]);
});

test('rút: lá giữ ở nguyên chỗ, lá thay lấy từ cùng bộ bài, không trùng lá nào đã chia (300 tay)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    let g = dealt(seed);
    const before = g.hand.map(C.toId);
    const mask = seed % 32;
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) g = E.toggleHold(g, i);
    const after = E.draw(g);
    for (let i = 0; i < 5; i++) {
      const id = C.toId(after.hand[i]);
      if (mask & (1 << i)) eq(id, before[i], 'lá giữ ' + i);
      else ok(before.indexOf(id) < 0, 'lá thay không được là lá đã chia (seed ' + seed + ')');
    }
    let replaced = 5;
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) replaced--;
    eq(new Set(before.concat(after.hand.map(C.toId))).size, 5 + replaced, 'seed ' + seed);
  }
});

test('rút: tính tiền theo bài cuối, cộng xu, sang tay sau', () => {
  let g = dealt(5);
  for (let i = 0; i < 5; i++) g = E.toggleHold(g, i);
  const fin = E.draw(g);
  const c = E.evaluate(g.hand);
  eq(fin.credits, 95 + E.payout(c, 5));
  eq([fin.phase, fin.hands, fin.last.cat, fin.last.pay, fin.last.bet], ['bet', 1, c, E.payout(c, 5), 5]);
  eq(E.handsLeft(fin), 24);
  eq(E.draw(fin), fin, 'chưa chia thì không rút');
});

test('mỗi tay một bộ bài mới xáo: lá có thể lặp lại giữa các tay', () => {
  let g = E.newGame(99);
  const all = new Set();
  let repeats = 0;
  while (!E.isOver(g)) {
    g = E.draw(E.deal(E.setBet(g, 1)));
    g.hand.forEach((c) => {
      const id = C.toId(c);
      if (all.has(id)) repeats++;
      all.add(id);
    });
  }
  ok(repeats > 0, 'tới 125 lá > 52 nên phải có lá lặp lại');
});

test('cùng hạt giống thì cùng dãy bài (seeded)', () => {
  const a = dealt(2026);
  const b = dealt(2026);
  eq(a.hand.map(C.toId), b.hand.map(C.toId));
  eq(E.draw(a).hand.map(C.toId), E.draw(b).hand.map(C.toId));
  ok(dealt(2027).hand.map(C.toId).join() !== a.hand.map(C.toId).join());
});

test('phiên: đủ 25 tay thì xong, không chia thêm được', () => {
  let g = E.newGame(3);
  let n = 0;
  while (!E.isOver(g)) {
    g = E.draw(E.deal(E.setBet(g, 1)));
    n++;
  }
  eq([n, g.hands, E.handsLeft(g)], [25, 25, 0]);
  eq(E.deal(g), g, 'hết phiên không chia được');
  eq(E.canDeal(g), false);
});

test('hết xu: phiên kết thúc sớm (vỡ nợ)', () => {
  let done = null;
  for (let seed = 1; seed < 2000 && !done; seed++) {
    let g = Object.assign({}, E.newGame(seed), { credits: 10 });
    g = E.draw(E.deal(g));
    if (g.credits === 5) g = E.draw(E.deal(g));
    if (g.credits === 0) done = g;
  }
  ok(done, 'phải có hạt giống thua 2 tay liên tiếp');
  eq([done.credits, E.isOver(done), E.canDeal(done), done.hands], [0, true, false, 2]);
});

test('còn ít xu hơn mức cược: cược tự hạ xuống số xu còn lại', () => {
  let found = false;
  for (let seed = 1; seed < 500 && !found; seed++) {
    const g = E.draw(E.deal(Object.assign({}, E.newGame(seed), { credits: 7 })));
    if (g.credits === 2) {
      eq(g.bet, 2);
      ok(E.canDeal(g));
      found = true;
    }
  }
  ok(found);
});

test('trợ giúp: đánh dấu assisted một lần là giữ tới hết phiên, qua lưu / khôi phục', () => {
  let g = E.markAssisted(dealt(11));
  ok(g.assisted);
  g = E.draw(g);
  ok(g.assisted);
  ok(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))).assisted);
  ok(!E.newGame(1).assisted);
});

test('tay đẹp nhất của phiên được ghi lại', () => {
  let g = E.deal(E.newGame(1));
  g = Object.assign({}, g, { hand: hand('7C 7D 7H 7S 2D'), held: [true, true, true, true, true] });
  g = E.draw(g);
  g = E.deal(g);
  g = Object.assign({}, g, { hand: hand('JC JD 2H 5S 9D'), held: [true, true, true, true, true] });
  g = E.draw(g);
  eq(g.best, 'quads');
});

/* ---------------- Lưu / khôi phục ---------------- */

const roundTrip = (g) => E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
const strip = (g) => Object.assign({}, g, { deck: null });

test('lưu rồi khôi phục: lúc chờ chia, lúc đang giữ lá; sau đó rút ra cùng bài', () => {
  let g = E.newGame(77);
  g = E.draw(E.deal(g));
  eq(strip(roundTrip(g)), strip(g));
  g = E.toggleHold(E.deal(g), 2);
  const r = roundTrip(g);
  eq(strip(r), strip(g));
  eq(E.draw(r).hand.map(C.toId), E.draw(g).hand.map(C.toId), 'rút sau khi khôi phục ra đúng bài cũ');
  eq(E.deal(E.draw(r)).hand.map(C.toId), E.deal(E.draw(g)).hand.map(C.toId), 'tay kế tiếp cũng như cũ');
});

test('ván lưu không chứa sẵn các lá sắp rút', () => {
  const g = dealt(123);
  const saved = JSON.stringify(E.toJSON(g));
  ok(!/deck/.test(saved));
  ok(g.deck.slice(5, 10).map(C.toId).every((id) => saved.indexOf('"' + id + '"') < 0), 'không lộ lá sẽ rút');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.toggleHold(dealt(9), 0));
  const between = E.toJSON(E.draw(dealt(9)));
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { credits: -1 }),
    Object.assign({}, good, { credits: 1.5 }),
    Object.assign({}, good, { credits: E.MAX_SCORE + 1 }),
    Object.assign({}, good, { bet: 0 }),
    Object.assign({}, good, { bet: 6 }),
    Object.assign({}, good, { hands: 25 }),
    Object.assign({}, good, { hands: -1 }),
    Object.assign({}, good, { phase: 'draw' }),
    Object.assign({}, good, { rng: 'abc' }),
    Object.assign({}, good, { held: [true, false] }),
    Object.assign({}, good, { held: [1, 0, 0, 0, 0] }),
    Object.assign({}, good, { hand: ['AS', 'KS', 'QS', 'JS', '10S'] }), // bài không khớp bộ đã xáo
    Object.assign({}, good, { hand: ['AS', 'AS', 'QS', 'JS', 'ZZ'] }),
    Object.assign({}, good, { handRng: (good.handRng + 1) >>> 0 }),
    Object.assign({}, good, { assisted: 'yes' }),
    Object.assign({}, between, { hands: 26 }),
    Object.assign({}, between, { best: 'five' }),
    Object.assign({}, between, { last: { cat: 'five', pay: 1, bet: 5, hand: between.last.hand } }),
    Object.assign({}, between, { last: { cat: 'jacks', pay: 7, bet: 5, hand: between.last.hand } }),
    Object.assign({}, between, { credits: 100 + between.hands * 3995 + 1 }), // nhiều xu hơn mức có thể
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i + ' ' + JSON.stringify(raw)));
  ok(E.fromJSON(good) && E.fromJSON(between), 'dữ liệu tốt vẫn nhận');
});

/* ---------------- Điểm tối đa ---------------- */

test('MAX_SCORE = 100 + 25 × (4000 − 5) = 99975; phiên toàn thùng phá sảnh lớn đạt đúng mức đó', () => {
  eq(E.MAX_SCORE, 99975);
  // Lãi tối đa một tay: cược 5 ăn 4000 (tay khác hoặc cược nhỏ hơn đều lãi ít hơn)
  E.CATS.forEach((c) => [1, 2, 3, 4, 5].forEach((b) => ok(E.payout(c, b) - b <= 3995)));
  let g = E.newGame(1);
  for (let h = 0; h < E.HANDS; h++) {
    g = E.deal(g);
    // Thay bài trước khi rút (engine chấm theo bài cuối): mô phỏng 25 lần ra thùng phá sảnh lớn
    g = Object.assign({}, g, { hand: hand('AS KS QS JS 10S'), held: [true, true, true, true, true] });
    g = E.draw(g);
  }
  eq([g.credits, E.isOver(g)], [E.MAX_SCORE, true]);
});

/* ---------------- Kỳ vọng từng cách giữ ---------------- */

/** Duyệt hết mọi lá rút (chậm, để đối chiếu). Trả kỳ vọng tính theo 1 xu cược. */
function bruteEV(cards, mask, bet) {
  const used = new Set(cards.map(C.toId));
  const rest = C.newDeck().filter((c) => !used.has(C.toId(c)));
  const held = cards.filter((_, i) => mask & (1 << i));
  const need = 5 - held.length;
  let sum = 0;
  let n = 0;
  const pick = [];
  (function rec(start) {
    if (pick.length === need) {
      sum += E.payout(E.evaluate(held.concat(pick)), bet);
      n++;
      return;
    }
    for (let i = start; i < rest.length; i++) {
      pick.push(rest[i]);
      rec(i + 1);
      pick.pop();
    }
  })(0);
  return sum / n / bet;
}

test('kỳ vọng nhanh khớp duyệt hết lá rút (mọi cách giữ rút ≤ 3 lá, 6 tay mẫu, cược 5 và 1)', () => {
  const samples = ['AS KS QS JS 2D', '2H 3H 4H 5H 9C', 'JC JD 4H 9S 2D', 'AH KD 7C 3S 2H', '8C 8D 8H 8S KD', '10H JH QH 4C 4D'];
  samples.forEach((s) => {
    const cards = hand(s);
    [5, 1].forEach((bet) => {
      const evs = E.holdEVs(cards, bet);
      for (let m = 0; m < 32; m++) {
        let k = 0;
        for (let i = 0; i < 5; i++) if (m & (1 << i)) k++;
        if (5 - k > 3) continue;
        near(evs[m], bruteEV(cards, m, bet), 1e-9, s + ' cược ' + bet + ' giữ ' + m);
      }
    });
  });
});

test('kỳ vọng nhanh khớp duyệt hết lá rút khi rút 4 và 5 lá (2 tay mẫu)', () => {
  ['AH KD 7C 3S 2H', '9C 5D 2H 7S 3D'].forEach((s) => {
    const cards = hand(s);
    const evs = E.holdEVs(cards, 5);
    near(evs[0], bruteEV(cards, 0, 5), 1e-9, s + ' bỏ hết');
    near(evs[1], bruteEV(cards, 1, 5), 1e-9, s + ' giữ lá đầu');
  });
});

test('gợi ý giữ theo kỳ vọng: các tình huống kinh điển của chiến thuật 9/6', () => {
  const best = (s) => E.bestHold(hand(s), 5).held.map((h) => (h ? 1 : 0)).join('');
  eq(best('AS KS QS JS 10S'), '11111', 'thùng phá sảnh lớn: giữ cả');
  eq(best('AS KS QS JS 2D'), '11110', '4 lá royal');
  eq(best('AS KS QS JS JD'), '11110', '4 lá royal hơn đôi J');
  eq(best('AS KS QS JS 10D'), '11110', '4 lá royal hơn sảnh có sẵn');
  eq(best('5H 6H 7H 8H 8C'), '11110', '4 lá thùng phá sảnh hơn đôi nhỏ');
  eq(best('3C 3D 9H JS 5D'), '11000', 'đôi nhỏ hơn giữ một lá cao');
  eq(best('QH JH 10H 3C 3D'), '11100', '3 lá royal hơn đôi nhỏ');
  eq(best('KC KD 7H 7S 2D'), '11110', 'thú: giữ 4 lá');
  eq(best('2C 5D 8H 9S 3D'), '00000', 'bài rác: bỏ hết');
  eq(best('9C 9D 9H 9S KD'), '11111', 'tứ quý: hòa kỳ vọng thì giữ cả 5');
  eq(best('6C 7D 8H 9S 2D'), '11110', '4 lá sảnh hở hai đầu');
  near(E.bestHold(hand('AS KS QS JS 10S'), 5).ev, 800, 1e-9);
  near(E.bestHold(hand('AS KS QS JS 10S'), 1).ev, 250, 1e-9);
});

test('kỳ vọng 4 lá royal: 872/47 khi cược 5, 322/47 khi cược 1 (royal 250)', () => {
  // 1 lá ra royal, 8 lá bích khác ra thùng, 3 lá 10 khác chất ra sảnh, 12 lá A/K/Q/J khác chất ra đôi J+
  near(E.holdEVs(hand('AS KS QS JS 2D'), 5)[15], (800 + 8 * 6 + 3 * 4 + 12) / 47, 1e-12);
  near(E.holdEVs(hand('AS KS QS JS 2D'), 1)[15], (250 + 8 * 6 + 3 * 4 + 12) / 47, 1e-12);
});

/* ---------------- Monte Carlo ---------------- */

test('Monte Carlo cách giữ tối ưu: tỉ lệ trả ≈ 99,54% (bảng 9/6, cược 5)', () => {
  // Ước lượng không chệch: trung bình kỳ vọng của cách giữ tốt nhất trên các tay chia ngẫu nhiên.
  // Tầng "chia ra ngay thùng phá sảnh lớn" (xác suất 4 / C(52,5), kỳ vọng 800) tính thẳng bằng công thức thay vì
  // lấy mẫu (lấy mẫu phân tầng): một tay 800 trong vài chục nghìn tay làm phương sai vọt lên.
  // Độ lệch chuẩn mỗi tay còn ≈ 1,03 nên 20000 tay cho sai số chuẩn ≈ 0,73%; ngưỡng ±2% ≈ 2,7 sai số chuẩn.
  // (Duyệt đủ 134.459 lớp tay theo hoán vị chất ra đúng 99,54%: xem README.)
  const r = C.rng('pokerrut-montecarlo');
  const N = 20000;
  const pRoyal = 4 / 2598960;
  let sum = 0;
  let n = 0;
  const t0 = Date.now();
  while (n < N) {
    const cards = C.shuffle(C.newDeck(), r).slice(0, 5);
    if (E.evaluate(cards) === 'royal') continue;
    sum += E.bestHold(cards, 5).ev;
    n++;
  }
  const ret = pRoyal * 800 + (1 - pRoyal) * (sum / N);
  console.log('       tỉ lệ trả ước lượng ' + (ret * 100).toFixed(2) + '% trên ' + N + ' tay (' + (Date.now() - t0) + ' ms)');
  near(ret, 0.9954, 0.02, 'tỉ lệ trả');
});

test('phiên mô phỏng chơi theo gợi ý: kết thúc đúng luật, xu không âm, trung bình gần mức vốn', () => {
  let total = 0;
  let broke = 0;
  let wins = 0;
  const S = 400;
  for (let s = 1; s <= S; s++) {
    let g = E.newGame(s * 7919);
    while (!E.isOver(g)) {
      g = E.deal(g);
      E.bestHold(g.hand, g.bet).held.forEach((h, i) => { if (h) g = E.toggleHold(g, i); });
      g = E.draw(g);
      ok(g.credits >= 0 && g.credits <= E.MAX_SCORE);
    }
    ok(g.hands === 25 || g.credits === 0);
    if (g.credits === 0) broke++;
    if (g.credits > E.START_CREDITS) wins++;
    total += g.credits;
  }
  const avg = total / S;
  console.log('       ' + S + ' phiên: trung bình ' + avg.toFixed(1) + ' xu, thắng (> 100) ' + wins + ', vỡ nợ ' + broke);
  ok(avg > 80 && avg < 125, 'trung bình ' + avg);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
