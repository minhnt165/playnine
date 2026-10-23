/* Kiểm tra engine Xì Dách: chạy `node test.js`
 * - Điểm bài (át mềm / cứng, nhãn "7/17"), Xì Dách khác 21 thường, nhà cái rút tới 17 và dừng ở 17 mềm (S17)
 * - Trả thưởng: thắng 1:1, Xì Dách 3:2, hòa, nhà cái có Xì Dách, gấp đôi, tách (cả tách đôi át), quắc
 * - Hộp 6 bộ: đủ 312 lá, xáo có hạt giống, xáo lại khi còn dưới 25%, hộp bài đi tiếp sang phiên sau
 * - Phiên 10 ván, cháy chip kết thúc sớm, mức cược hợp lệ
 * - Lưu / khôi phục giữa ván và từ chối dữ liệu hỏng
 * - Bot chơi theo chiến thuật cơ bản nhiều phiên: lợi thế nhà cái khoảng 0,5%
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
    console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       '));
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

/** 'AS 10H KD' -> mảng lá. */
const cards = (s) => s.trim().split(/\s+/).map((id) => C.fromId(id));
const ids = (list) => list.map(C.toId).join(' ');
const filler = (n) => Array.from({ length: n }, () => ({ rank: 2, suit: 'S' }));

/**
 * Phiên có hộp bài sắp sẵn: các lá `order` ra trước (theo thứ tự chia: người, nhà cái, người, nhà cái, rồi các lá rút),
 * phần còn lại của hộp là lá 2 bích cho đủ 312 lá (để không chạm mốc xáo lại).
 */
function rigged(order, extra) {
  const g = E.newSession({ seed: 1 });
  const top = cards(order);
  return Object.assign({}, g, { shoe: top.concat(filler(E.SHOE_SIZE - top.length)), pos: 0 }, extra || {});
}

/* ---------------- Điểm bài ---------------- */

test('điểm bài: lá số, lá mặt = 10, át 1 hoặc 11', () => {
  eq(E.handValue(cards('10H 7S')), { total: 17, soft: false, hard: 17 });
  eq(E.handValue(cards('KH QS')), { total: 20, soft: false, hard: 20 });
  eq(E.handValue(cards('AS 6H')), { total: 17, soft: true, hard: 7 });
  eq(E.handValue(cards('AS 6H 10D')), { total: 17, soft: false, hard: 17 });
  eq(E.handValue(cards('AS AH')), { total: 12, soft: true, hard: 2 });
  eq(E.handValue(cards('AS AH 9D')), { total: 21, soft: true, hard: 11 });
  eq(E.handValue(cards('AS AH AD AC')), { total: 14, soft: true, hard: 4 });
  eq(E.handValue(cards('KS QH AD')), { total: 21, soft: false, hard: 21 });
  eq(E.handValue(cards('9S 8H 7D')), { total: 24, soft: false, hard: 24 });
  eq(E.handValue([]), { total: 0, soft: false, hard: 0 });
});

test('nhãn tổng điểm: bài mềm hiện cả hai cách tính ("A,6 = 7/17"), 21 và bài cứng hiện một số', () => {
  eq(E.totalLabel(cards('AS 6H')), '7/17');
  eq(E.totalLabel(cards('AS AH')), '2/12');
  eq(E.totalLabel(cards('AS 10H')), '21');
  eq(E.totalLabel(cards('AS AH 9D')), '21');
  eq(E.totalLabel(cards('AS 6H 10D')), '17');
  eq(E.totalLabel(cards('10S 6H')), '16');
  eq(E.totalLabel(cards('10S 6H 9C')), '25');
  eq(E.totalLabel([]), '');
});

test('Xì Dách: đúng 2 lá át + lá 10 điểm, không tính tay tách; 21 ba lá không phải Xì Dách', () => {
  ok(E.isBlackjack({ cards: cards('AS KD'), split: false }));
  ok(E.isBlackjack({ cards: cards('10H AC'), split: false }));
  ok(!E.isBlackjack({ cards: cards('7S 7H 7D'), split: false }), '7-7-7');
  ok(!E.isBlackjack({ cards: cards('AS 5H 5D'), split: false }), 'A-5-5');
  ok(!E.isBlackjack({ cards: cards('AS KD'), split: true }), 'tay tách');
  ok(E.isNatural(cards('QS AD')));
  ok(!E.isNatural(cards('QS 5D 6C')));
});

test('nhà cái (S17): rút tới khi đủ 17, dừng ở mọi 17 kể cả 17 mềm', () => {
  ok(E.dealerHits(cards('10S 6H')), '16 rút');
  ok(E.dealerHits(cards('AS 5H')), 'A,5 = 16 mềm rút');
  ok(!E.dealerHits(cards('AS 6H')), 'A,6 = 17 mềm dừng');
  ok(!E.dealerHits(cards('AS AH 5D')), 'A,A,5 = 17 mềm dừng');
  ok(!E.dealerHits(cards('10S 7H')), '17 cứng dừng');
  ok(E.dealerHits(cards('2S 3H')), '5 rút');
  ok(!E.dealerHits(cards('10S 6H 5C')), '21 dừng');
});

/* ---------------- Trả thưởng ---------------- */

test('chia bài: người, nhà cái, người, nhà cái; trừ cược vào chip', () => {
  const g = E.deal(rigged('10H 9S 8D 7C'), 50);
  eq(ids(g.hands[0].cards), '10H 8D');
  eq(ids(g.dealer), '9S 7C');
  eq([g.phase, g.round, g.chips, g.hands[0].bet, g.lastBet], ['play', 1, 950, 50, 50]);
});

test('thắng thường trả 1:1', () => {
  const g = E.stand(E.deal(rigged('10H 10S 9D 7C'), 50)); // 19 với 17
  eq([g.phase, g.hands[0].result, g.hands[0].net, g.chips], ['bet', 'win', 50, 1050]);
  eq(g.log, [[50, 'win']]);
});

test('Xì Dách trả 3:2 ngay sau khi chia (làm tròn xuống chip nguyên)', () => {
  let g = E.deal(rigged('AH 10S KD 7C'), 10);
  eq([g.phase, g.hands[0].result, g.hands[0].net, g.chips], ['bet', 'bj', 15, 1015]);
  g = E.deal(rigged('AH 10S KD 7C'), 25);
  eq([g.hands[0].result, g.hands[0].net, g.chips], ['bj', 37, 1037]);
  eq(g.log, [[37, 'bj']]);
  eq(g.dealer.length, 2, 'nhà cái không rút thêm');
});

test('hòa trả lại cược', () => {
  const g = E.stand(E.deal(rigged('10H 10S 8D 8C'), 50));
  eq([g.hands[0].result, g.hands[0].net, g.chips], ['push', 0, 1000]);
  eq(g.log, [[0, 'push']]);
});

test('thua mất cược; quắc (quá 21) thua ngay, nhà cái không rút thêm', () => {
  let g = E.stand(E.deal(rigged('10H 10S 7D 9C'), 50)); // 17 với 19
  eq([g.hands[0].result, g.hands[0].net, g.chips], ['lose', -50, 950]);
  g = E.hit(E.deal(rigged('10H 10S 6D 6C 9H'), 50)); // 16 rút 9 = 25; nhà cái 16 không rút
  eq([g.phase, g.hands[0].result, g.hands[0].net, g.chips, g.dealer.length], ['bet', 'bust', -50, 950, 2]);
});

test('nhà cái quắc: tay còn lại thắng; nhà cái rút theo S17', () => {
  let g = E.stand(E.deal(rigged('10H 10S 2D 6C 10D'), 50)); // 12 với 16: nhà cái rút 10 = 26
  eq(ids(g.dealer), '10S 6C 10D');
  eq([g.hands[0].result, g.chips], ['win', 1050]);
  g = E.stand(E.deal(rigged('10H AS 8D 6C'), 50)); // 18 với A,6 = 17 mềm: nhà cái dừng
  eq([g.dealer.length, g.hands[0].result], [2, 'win']);
});

test('nhà cái có Xì Dách (đã xem lá úp): thua ngay, trừ khi mình cũng Xì Dách thì hòa', () => {
  let g = E.deal(rigged('10H AS 9D KC'), 50);
  eq([g.phase, g.hands[0].result, g.chips], ['bet', 'lose', 950]);
  g = E.deal(rigged('AH AS KD QC'), 50);
  eq([g.phase, g.hands[0].result, g.chips], ['bet', 'push', 1000]);
});

test('rút đến đúng 21 thì tự dừng', () => {
  const g = E.hit(E.deal(rigged('5H 10S 6D 7C 10D'), 20)); // 11 + 10 = 21
  eq([g.phase, g.hands[0].result, g.chips], ['bet', 'win', 1020]);
});

test('gấp đôi: cược x2, nhận đúng một lá rồi dừng; thắng và thua', () => {
  let g = E.deal(rigged('5H 10S 6D 6C 10D 10C'), 50); // 11 với 16, gấp đôi ra 10 = 21; nhà cái rút 10 = 26
  ok(E.canDouble(g));
  g = E.double(g);
  eq([g.hands[0].bet, g.hands[0].doubled, g.hands[0].cards.length], [100, true, 3]);
  eq([g.hands[0].result, g.hands[0].net, g.chips], ['win', 100, 1100]);
  g = E.double(E.deal(rigged('5H 10S 4D 9C 2D'), 50)); // 9 với 19, gấp đôi ra 2 = 11: thua 100
  eq([g.hands[0].result, g.hands[0].net, g.chips], ['lose', -100, 900]);
});

test('gấp đôi chỉ với 2 lá đầu và khi đủ chip', () => {
  const g = E.hit(E.deal(rigged('2H 10S 3D 6C 2D'), 50));
  ok(!E.canDouble(g), 'đã có 3 lá');
  eq(E.double(g), g, 'không đổi gì');
  const g2 = E.deal(rigged('5H 10S 6D 6C'), 150);
  ok(E.canDouble(g2));
  ok(!E.canDouble(Object.assign({}, g2, { chips: 149 })), 'thiếu chip');
});

test('tách đôi 8: hai tay chơi riêng, tính tiền riêng, được gấp đôi sau khi tách', () => {
  // 8,8 với 10,7. Tay 1: 8 + 3 = 11, gấp đôi ra 10 = 21. Tay 2: 8 + 10 = 18, dừng. Nhà cái 17.
  let g = E.deal(rigged('8H 10S 8D 7C 3D 10H 10C'), 50);
  ok(E.canSplit(g));
  g = E.split(g);
  eq([g.hands.length, g.active, g.chips], [2, 0, 900]);
  eq(ids(g.hands[0].cards), '8H 3D');
  eq(ids(g.hands[1].cards), '8D', 'tay 2 nhận lá thứ hai khi tới lượt');
  ok(!E.canSplit(g), 'chỉ tách một lần');
  ok(E.canDouble(g), 'được gấp đôi sau khi tách');
  g = E.double(g);
  eq([g.active, ids(g.hands[0].cards), ids(g.hands[1].cards)], [1, '8H 3D 10H', '8D 10C']);
  g = E.stand(g);
  eq(g.phase, 'bet');
  eq([g.hands[0].result, g.hands[0].net, g.hands[1].result, g.hands[1].net], ['win', 100, 'win', 50]);
  eq([g.chips, g.log], [1150, [[150, 'win']]]);
});

test('tách: một tay thắng một tay thua thì cộng gộp; tách hai lá 10 điểm khác bậc được', () => {
  let g = E.deal(rigged('KH 10S QD 8C 9D 6H'), 50); // K,Q với 18. Tay 1: K9 = 19 thắng. Tay 2: Q6 = 16 thua
  ok(E.canSplit(g), 'K và Q cùng 10 điểm');
  g = E.stand(E.stand(E.split(g)));
  eq([g.hands[0].result, g.hands[1].result, g.chips], ['win', 'lose', 1000]);
  eq(g.log, [[0, 'push']]);
});

test('không tách được khi hai lá khác điểm hoặc thiếu chip', () => {
  const g = E.deal(rigged('8H 10S 9D 7C'), 50);
  ok(!E.canSplit(g));
  eq(E.split(g), g);
  const g2 = E.deal(rigged('8H 10S 8D 7C'), 200);
  ok(E.canSplit(g2));
  ok(!E.canSplit(Object.assign({}, g2, { chips: 199 })));
});

test('tách đôi át: mỗi tay nhận đúng một lá rồi dừng; át + 10 là 21 thường (trả 1:1)', () => {
  const g = E.split(E.deal(rigged('AH 10S AD 7C KD 5C'), 50));
  // Hai tay đã đủ lá, không còn nước đi: nhà cái 17 dừng, tính tiền luôn
  eq(g.phase, 'bet');
  eq(ids(g.hands[0].cards), 'AH KD');
  eq(ids(g.hands[1].cards), 'AD 5C');
  eq([g.hands[0].result, g.hands[0].net], ['win', 50], 'không phải Xì Dách');
  eq([g.hands[1].result, g.hands[1].net], ['lose', -50], '16 thua 17');
  eq(g.chips, 1000);
});

test('tay tách chạm 21 thì tự dừng và chuyển sang tay sau', () => {
  const g = E.split(E.deal(rigged('KH 10S KD 7C AS 9H'), 50)); // tay 1: K + A = 21, tay 2 nhận 9 = 19
  ok(g.hands[0].done);
  eq([g.phase, g.active, ids(g.hands[1].cards)], ['play', 1, 'KD 9H']);
  ok(!E.isBlackjack(g.hands[0]));
});

test('mọi tay đều quắc thì nhà cái chỉ lật lá úp, không rút', () => {
  let g = E.split(E.deal(rigged('8H 10S 8D 6C 7D 10H 10C 9C'), 50)); // tay 1: 8 + 7 = 15
  g = E.hit(g); // +10 = 25 quắc -> tay 2: 8 + 10 = 18
  eq([g.active, ids(g.hands[1].cards)], [1, '8D 10C']);
  g = E.hit(g); // +9 = 27 quắc
  eq([g.phase, g.dealer.length, g.chips], ['bet', 2, 900]);
  eq(g.log, [[-100, 'lose']]);
});

test('nước đi không hợp lệ không đổi gì (ngoài lượt chơi, sau khi dừng)', () => {
  const g = rigged('10H 10S 9D 7C');
  eq(E.hit(g), g);
  eq(E.stand(g), g);
  eq(E.double(g), g);
  eq(E.split(g), g);
  const done = E.stand(E.deal(g, 10));
  eq(E.hit(done), done);
  eq(E.double(done), done);
  eq(E.actions(done), { hit: false, stand: false, double: false, split: false });
  eq(E.actions(E.deal(g, 10)), { hit: true, stand: true, double: true, split: false });
});

/* ---------------- Mức cược ---------------- */

test('mức cược: 10..200, số nguyên, không quá số chip, chỉ khi đang chờ cược', () => {
  const g = E.newSession({ seed: 3 });
  [9, 0, -10, 201, 12.5, '50', null, NaN, undefined].forEach((b) => ok(!E.canDeal(g, b), 'cược ' + b));
  [10, 25, 35, 200].forEach((b) => ok(E.canDeal(g, b), 'cược ' + b));
  eq(E.deal(g, 300), g);
  ok(!E.canDeal(Object.assign({}, g, { chips: 40 }), 50), 'quá số chip');
  ok(E.canDeal(Object.assign({}, g, { chips: 40 }), 40));
  ok(!E.canDeal(E.deal(g, 10), 10), 'đang chơi');
  eq(E.maxBet(g), 200);
  eq(E.maxBet(Object.assign({}, g, { chips: 75 })), 75);
});

/* ---------------- Hộp bài ---------------- */

test('hộp 6 bộ: 312 lá, mỗi lá đúng 6 lần; cùng hạt giống thì cùng thứ tự', () => {
  const g = E.newSession({ seed: 'abc' });
  eq(g.shoe.length, 312);
  const count = {};
  g.shoe.forEach((c) => { count[C.toId(c)] = (count[C.toId(c)] || 0) + 1; });
  eq(Object.keys(count).length, 52);
  ok(Object.values(count).every((n) => n === 6));
  eq(ids(E.newSession({ seed: 'abc' }).shoe), ids(g.shoe));
  ok(ids(E.newSession({ seed: 'abd' }).shoe) !== ids(g.shoe));
  eq([g.pos, E.remaining(g), g.shuffles], [0, 312, 0]);
});

test('xáo lại khi chia mà hộp còn dưới 25% (78 lá); còn đúng 78 thì chưa xáo', () => {
  const g = E.newSession({ seed: 9 });
  const d1 = E.deal(Object.assign({}, g, { pos: 312 - 78 }), 10);
  eq([d1.shuffles, d1.pos], [0, 312 - 78 + 4]);
  const d2 = E.deal(Object.assign({}, g, { pos: 312 - 77 }), 10);
  eq([d2.shuffles, d2.pos, d2.shoe.length], [1, 4, 312], 'chia từ đầu hộp mới');
  ok(ids(d2.shoe) !== ids(g.shoe), 'thứ tự mới');
  // Hộp mới cũng dựng lại được từ ván lưu
  eq(ids(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(d2)))).shoe), ids(d2.shoe));
});

test('phiên mới đi tiếp hộp bài của phiên trước (không xáo lại mỗi phiên)', () => {
  const g = E.stand(E.deal(E.newSession({ seed: 5 }), 10));
  const next = E.newSession({ prev: g });
  eq([next.pos, next.chips, next.round, next.phase, next.log], [g.pos, 1000, 0, 'bet', []]);
  eq(ids(next.shoe), ids(g.shoe));
});

/* ---------------- Phiên 10 ván ---------------- */

/** Chơi một ván: cược `bet`, rồi dừng ngay (hoặc theo hàm `act`). */
function playHand(g, bet, act) {
  g = E.deal(g, bet);
  let guard = 0;
  while (g.phase === 'play' && guard++ < 50) g = act ? act(g) : E.stand(g);
  return g;
}

test('phiên 10 ván: hết 10 ván thì kết thúc, không chia thêm; chip = 1000 + tổng thắng thua', () => {
  let g = E.newSession({ seed: 42 });
  ok(!E.started(g) && !E.isOver(g));
  for (let i = 0; i < 10; i++) {
    ok(!E.isOver(g), 'chưa hết ở ván ' + i);
    g = playHand(g, 10);
    eq(g.round, i + 1);
    ok(E.started(g));
  }
  ok(E.isOver(g));
  eq([g.phase, g.log.length], ['over', 10]);
  eq(g.chips, 1000 + g.log.reduce((s, x) => s + x[0], 0));
  eq(E.won(g), g.chips > 1000);
  ok(!E.canDeal(g, 10));
  eq(E.deal(g, 10), g);
});

test('thắng / thua phiên: hơn 1000 là thắng, bằng 1000 là không thắng, chưa xong thì chưa thắng', () => {
  const g = E.newSession({ seed: 1 });
  ok(E.won(Object.assign({}, g, { phase: 'over', round: 10, chips: 1005 })));
  ok(!E.won(Object.assign({}, g, { phase: 'over', round: 10, chips: 1000 })));
  ok(!E.won(Object.assign({}, g, { phase: 'bet', round: 3, chips: 1500 })));
});

test('cháy chip: còn dưới 10 chip thì phiên kết thúc sớm, tính thua', () => {
  // 5 ván thua 200: người 10 + 7 = 17, nhà cái 10 + 9 = 19
  let g = E.newSession({ seed: 1 });
  g = Object.assign({}, g, { shoe: cards('10H 10S 7D 9C '.repeat(5)).concat(filler(292)), pos: 0 });
  for (let i = 0; i < 5; i++) g = playHand(g, 200);
  eq([g.chips, g.round, g.phase], [0, 5, 'over']);
  ok(E.isOver(g) && !E.won(g));
  // Còn 5 chip (dưới cược tối thiểu) cũng hết phiên
  const h = playHand(rigged('10H 10S 7D 9C', { chips: 105 }), 100);
  eq([h.chips, h.round, h.phase], [5, 1, 'over']);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữa ván: giữ nguyên ván, chơi tiếp ra cùng kết quả', () => {
  let g = E.newSession({ seed: 77 });
  for (let i = 0; i < 3; i++) g = playHand(g, 25);
  g = E.deal(g, 50);
  while (g.phase !== 'play') g = E.deal(g, 50); // ván có Xì Dách thì chia tiếp
  const r = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(r, 'khôi phục được');
  eq(E.toJSON(r), E.toJSON(g));
  eq(ids(r.shoe), ids(g.shoe), 'dựng lại hộp bài từ hạt giống');
  eq(E.toJSON(E.stand(r)), E.toJSON(E.stand(g)));
  eq(E.toJSON(E.hit(r)), E.toJSON(E.hit(g)));
});

test('lưu / khôi phục ván vừa tách, phiên chờ cược và phiên đã xong', () => {
  const g = E.split(E.deal(rigged('8H 10S 8D 7C 3D 10H 10C'), 50));
  const r = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  // Hộp sắp sẵn không dựng lại được từ hạt giống: so phần trạng thái ván
  eq([r.hands.length, r.active, r.chips, ids(r.hands[0].cards), ids(r.hands[1].cards), ids(r.dealer)], [2, 0, 900, '8H 3D', '8D', '10S 7C']);
  let s = E.newSession({ seed: 8 });
  eq(E.toJSON(E.fromJSON(E.toJSON(s))), E.toJSON(s));
  for (let i = 0; i < 10 && !E.isOver(s); i++) s = playHand(s, 100);
  const o = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s))));
  ok(E.isOver(o));
  eq(E.toJSON(o), E.toJSON(s));
});

test('từ chối dữ liệu hỏng', () => {
  let g = E.newSession({ seed: 77 });
  g = playHand(g, 10);
  g = E.deal(g, 50);
  while (g.phase !== 'play') g = E.deal(g, 50);
  const good = E.toJSON(g);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const hand = (c, bet) => ({ c, bet, dbl: false, sp: false, done: false, res: null, net: 0 });
  const cases = [
    null, 1, 'x', [], {},
    bad({ v: 2 }),
    bad({ chips: -1 }), bad({ chips: 10.5 }), bad({ chips: '1000' }),
    bad({ round: 11 }), bad({ round: -1 }), bad({ round: 0 }),
    bad({ phase: 'win' }),
    bad({ pos: 400 }), bad({ pos: -1 }), bad({ pos: 2 }),
    bad({ shoeRng: 'x' }), bad({ rng: null }), bad({ shuffles: -1 }),
    bad({ dealer: ['ZZ', '10H'] }), bad({ dealer: ['10H'] }),
    bad({ hands: [] }), bad({ hands: [hand(['10H', 'XX'], 50)] }), bad({ hands: [hand(['10H', '9H'], 5)] }),
    bad({ hands: [hand(['10H', '9H'], 50), hand(['10D', '9D'], 50), hand(['10C', '9C'], 50)] }),
    bad({ active: 3 }),
    bad({ log: [[10, 'x']] }), bad({ log: 'x' }), bad({ log: [[10, 'win'], [0, 'push']] }), bad({ log: [[1.5, 'win']] }),
    bad({ lastBet: 500 }),
  ];
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'case ' + i + ' ' + JSON.stringify(raw).slice(0, 80)));
  ok(E.fromJSON(good), 'bản gốc vẫn khôi phục được');
});

/* ---------------- Bot chiến thuật cơ bản ---------------- */

/** Chiến thuật cơ bản 6 bộ, S17, được gấp đôi sau khi tách, không đầu hàng. u: điểm lá ngửa nhà cái (2..11). */
function basic(g) {
  const h = g.hands[g.active];
  const u = g.dealer[0].rank === 1 ? 11 : Math.min(10, g.dealer[0].rank);
  const v = E.handValue(h.cards);
  if (E.canSplit(g)) {
    const p = Math.min(10, h.cards[0].rank);
    const doSplit =
      p === 1 || p === 8 ||
      ((p === 2 || p === 3 || p === 7) && u <= 7) ||
      (p === 4 && (u === 5 || u === 6)) ||
      (p === 6 && u <= 6) ||
      (p === 9 && u !== 7 && u <= 9);
    if (doSplit) return E.split(g);
  }
  const dbl = E.canDouble(g);
  const t = v.total;
  if (v.soft && t < 21) {
    if (dbl) {
      if ((t === 13 || t === 14) && (u === 5 || u === 6)) return E.double(g);
      if ((t === 15 || t === 16) && u >= 4 && u <= 6) return E.double(g);
      if ((t === 17 || t === 18) && u >= 3 && u <= 6) return E.double(g);
    }
    if (t >= 19) return E.stand(g);
    if (t === 18) return u >= 9 ? E.hit(g) : E.stand(g);
    return E.hit(g);
  }
  if (dbl) {
    if (t === 11 && u <= 10) return E.double(g);
    if (t === 10 && u <= 9) return E.double(g);
    if (t === 9 && u >= 3 && u <= 6) return E.double(g);
  }
  if (t >= 17) return E.stand(g);
  if (t >= 13) return u <= 6 ? E.stand(g) : E.hit(g);
  if (t === 12) return u >= 4 && u <= 6 ? E.stand(g) : E.hit(g);
  return E.hit(g);
}

test('bot chiến thuật cơ bản: lợi thế nhà cái khoảng 0,5% (mô phỏng 100 000 phiên, cược 10)', () => {
  const SESSIONS = 100000; // 1 000 000 ván
  let g = E.newSession({ seed: 2026 });
  let wagered = 0;
  let net = 0;
  let sessionsUp = 0;
  let bjs = 0;
  let shuffles = 0;
  const t0 = Date.now();
  for (let s = 0; s < SESSIONS; s++) {
    if (s) g = E.newSession({ prev: g });
    const before = g.shuffles;
    while (!E.isOver(g)) {
      g = E.deal(g, 10);
      let guard = 0;
      while (g.phase === 'play' && guard++ < 40) g = basic(g);
      ok(g.phase !== 'play', 'ván bị kẹt');
      g.hands.forEach((h) => { wagered += h.bet; });
      if (g.hands[0].result === 'bj') bjs++;
    }
    shuffles += g.shuffles - before;
    net += g.chips - E.START_CHIPS;
    if (E.won(g)) sessionsUp++;
  }
  const hands = SESSIONS * 10;
  const edge = -net / (hands * 10); // theo cược ban đầu mỗi ván
  console.log('       ' + hands + ' ván trong ' + (Date.now() - t0) + ' ms: lợi thế nhà cái ' + (edge * 100).toFixed(2) +
    '% cược ban đầu (' + (-net / wagered * 100).toFixed(2) + '% tổng tiền cược); phiên lãi ' + (sessionsUp / SESSIONS * 100).toFixed(1) +
    '%; Xì Dách ' + (bjs / hands * 100).toFixed(2) + '% ván; xáo lại ' + shuffles + ' lần');
  ok(edge > 0 && edge < 0.012, 'lợi thế nhà cái ' + (edge * 100).toFixed(2) + '% nằm ngoài khoảng (0; 1,2%)');
  ok(bjs / hands > 0.042 && bjs / hands < 0.052, 'tỉ lệ Xì Dách ~4,7%');
  ok(shuffles > SESSIONS / 6, 'hộp bài được xáo lại định kỳ');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
