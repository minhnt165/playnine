/* Kiểm tra engine Gin Rummy: chạy `node test.js`
 * - Bộ (meld), lá lẻ, xếp tay tối ưu (so với vét cạn trên hàng trăm tay ngẫu nhiên 10 và 11 lá)
 * - Chia bài, lá mời (nhặt / bỏ qua, cả hai bỏ qua thì rút nọc), rút / bỏ lá, không bỏ lại lá vừa nhặt
 * - Knock (≤ 10), gin, big gin (tùy chọn), ghép lá (lay off, cả dây chuyền), undercut, ván hòa khi nọc còn 2 lá
 * - Điểm ván, hết trận ở 100, tổng kết (thưởng trận, thưởng ván, thắng trắng)
 * - Máy Dễ / Vừa / Khó luôn đi nước hợp lệ; thắng đậm bot ngẫu nhiên; mức cao thắng mức thấp phần lớn
 * - Lưu / khôi phục ở mọi pha, từ chối dữ liệu hỏng
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
const ids = (s) => s.split(' ').filter(Boolean);
const sorted = (a) => a.slice().sort();

/** Đủ 52 lá, không trùng: nọc, chồng bỏ, hai tay. */
function checkCards(g) {
  const all = g.stock.concat(g.discard, g.hands[0], g.hands[1]);
  eq(all.length, 52, 'tổng số lá');
  eq(new Set(all).size, 52, 'lá trùng');
}

/**
 * Dựng ván tay để test luật. o: { hands: [chuỗi, chuỗi], discard: chuỗi (lá cuối là lá trên cùng), stock?: số lá nọc,
 * phase, turn, ... }. Lá còn thừa vào nọc (nọc dài o.stock lá thì phần dư nằm dưới đáy chồng bỏ).
 */
function mk(o) {
  const g = E.newMatch({ seed: 1, level: o.level || 'easy', bigGin: o.bigGin !== false });
  const hands = o.hands.map(ids);
  const discard = ids(o.discard || '');
  const used = new Set(hands[0].concat(hands[1], discard));
  let rest = ALL.filter((id) => !used.has(id));
  let stock = rest;
  if (o.stock != null) {
    stock = rest.slice(0, o.stock);
    rest = rest.slice(o.stock);
    discard.unshift(...rest);
  }
  Object.assign(g, { hands, discard, stock, phase: o.phase || 'draw', turn: o.turn || 0, taken: o.taken || null, passes: 0, mustStock: false });
  if (o.extra) Object.assign(g, o.extra);
  checkCards(g);
  return g;
}

/* ---------------- Vét cạn: lá lẻ nhỏ nhất (độc lập với solver của engine) ---------------- */
function bruteDeadwood(hand) {
  const n = hand.length;
  const valid = new Uint8Array(1 << n);
  for (let m = 1; m < 1 << n; m++) {
    const sub = hand.filter((_, i) => m & (1 << i));
    if (sub.length >= 3 && E.isMeld(sub)) valid[m] = 1;
  }
  const memo = new Int8Array(1 << n).fill(-1);
  function can(mask) {
    if (!mask) return true;
    if (memo[mask] >= 0) return memo[mask] === 1;
    const low = mask & -mask;
    let res = false;
    // mọi tập con của mask chứa lá thấp nhất
    for (let sub = mask; sub && !res; sub = (sub - 1) & mask) {
      if ((sub & low) && valid[sub] && can(mask ^ sub)) res = true;
    }
    memo[mask] = res ? 1 : 0;
    return res;
  }
  let best = Infinity;
  for (let m = 0; m < 1 << n; m++) {
    if (!can(m)) continue;
    let s = 0;
    for (let i = 0; i < n; i++) if (!(m & (1 << i))) s += E.cardValue(hand[i]);
    if (s < best) best = s;
  }
  return best;
}

/* ---------------- Bộ và xếp tay ---------------- */
test('điểm lá: A = 1, số theo số, J / Q / K = 10', () => {
  eq(['AS', '2H', '9D', '10C', 'JS', 'QH', 'KD'].map(E.cardValue), [1, 2, 9, 10, 10, 10, 10]);
});

test('bộ hợp lệ: sám, tứ, sảnh cùng chất liên tiếp; A thấp, không vòng K-A', () => {
  ok(E.isMeld(ids('7S 7H 7D')));
  ok(E.isMeld(ids('7S 7H 7D 7C')));
  ok(E.isMeld(ids('AH 2H 3H')));
  ok(E.isMeld(ids('9C JC 10C QC KC')));
  ok(!E.isMeld(ids('7S 7H')));
  ok(!E.isMeld(ids('QS KS AS')), 'không vòng');
  ok(!E.isMeld(ids('4H 5H 6D')), 'khác chất');
  ok(!E.isMeld(ids('4H 5H 7H')), 'không liên tiếp');
});

test('xếp tay: chọn cách lá lẻ nhỏ nhất khi sám và sảnh tranh lá', () => {
  // 7♥ dùng cho sám 7 hoặc sảnh 5-6-7♥: dùng cho sảnh và sám 7 còn 3 lá khác thì tốt nhất
  const a = E.analyze(ids('5H 6H 7H 7S 7D 7C KS KD 2C 3D'));
  eq(a.dw, 25);
  eq(a.melds.length, 2);
  // Sảnh 5-9♥ (lá lẻ 7♠ 7♦ K♠ K♦ Q♣ = 44) tốt hơn sám 7 (lá lẻ 5 6 8 9 ♥ + 30 = 58)
  const b = E.analyze(ids('5H 6H 7H 7S 7D 8H 9H KS KD QC'));
  eq([b.dw, b.melds], [44, [['5H', '6H', '7H', '8H', '9H']]]);
});

test('xếp tay khớp vét cạn trên 400 tay ngẫu nhiên 10 / 11 lá (cả tay "dày bộ")', () => {
  const r = C.rng('melds');
  for (let k = 0; k < 400; k++) {
    let pool = ALL;
    // nửa số tay rút từ 2 chất × 7 bậc để có nhiều bộ chồng chéo
    if (k % 2) {
      const s1 = 'SHDC'[r.int(4)];
      const s2 = 'SHDC'[r.int(4)];
      const lo = 1 + r.int(7);
      pool = ALL.filter((id) => {
        const c = C.fromId(id);
        return (c.suit === s1 || c.suit === s2 || r() < 0.15) && c.rank >= lo && c.rank < lo + 7;
      });
    }
    const n = k % 4 < 2 ? 10 : 11;
    if (pool.length < n) continue;
    const hand = C.shuffle(pool, r).slice(0, n);
    const a = E.analyze(hand);
    const brute = bruteDeadwood(hand);
    eq(a.dw, brute, hand.join(' '));
    eq(E.deadwood(hand), brute);
    // Cách xếp trả về đúng là các bộ hợp lệ, rời nhau, phủ đủ tay
    a.melds.forEach((m) => ok(E.isMeld(m), 'bộ sai ' + m.join(' ')));
    eq(sorted([].concat(...a.melds, a.deadwood)), sorted(hand));
    eq(a.deadwood.reduce((s, id) => s + E.cardValue(id), 0), a.dw);
  }
});

/* ---------------- Chia bài và lá mời ---------------- */
test('chia bài: 10 lá mỗi người, 1 lá mời, nọc 31 lá; cùng seed thì cùng bài', () => {
  const g = E.newMatch({ seed: 42 });
  eq([g.hands[0].length, g.hands[1].length, g.discard.length, g.stock.length], [10, 10, 1, 31]);
  checkCards(g);
  eq([g.phase, g.turn, g.dealer], ['upcard', E.HUMAN, E.CPU]);
  eq(E.newMatch({ seed: 42 }), g);
  ok(JSON.stringify(E.newMatch({ seed: 43 }).hands) !== JSON.stringify(g.hands));
});

test('lá mời: người không chia nhặt được hoặc bỏ qua; nhặt rồi không được bỏ lại chính lá đó', () => {
  const g = E.newMatch({ seed: 7 });
  const up = E.top(g);
  eq(E.legalActions(g), [{ type: 'draw', from: 'discard' }, { type: 'pass' }]);
  ok(!E.isLegal(g, { type: 'draw', from: 'stock' }), 'chưa được rút nọc');
  const t = E.apply(g, { type: 'draw', from: 'discard' });
  eq([t.phase, t.turn, t.taken, t.hands[0].length, t.discard.length], ['discard', 0, up, 11, 0]);
  ok(!E.isLegal(t, { type: 'discard', card: up }), 'bỏ lại lá vừa nhặt');
  const other = t.hands[0].find((id) => id !== up);
  const d = E.apply(t, { type: 'discard', card: other });
  eq([d.phase, d.turn, E.top(d), d.humanMoves], ['draw', 1, other, 2]);
});

test('lá mời: hai người bỏ qua thì người không chia buộc rút nọc', () => {
  let g = E.newMatch({ seed: 8 });
  g = E.apply(g, { type: 'pass' });
  eq([g.phase, g.turn, g.passes], ['upcard', 1, 1]);
  g = E.apply(g, { type: 'pass' });
  eq([g.phase, g.turn, g.mustStock], ['draw', 0, true]);
  eq(E.legalActions(g), [{ type: 'draw', from: 'stock' }]);
  g = E.apply(g, { type: 'draw', from: 'stock' });
  eq([g.phase, g.hands[0].length, g.stock.length, g.mustStock, g.taken], ['discard', 11, 30, false, null]);
});

test('lá mời: người chia nhặt sau khi người kia bỏ qua', () => {
  let g = E.newMatch({ seed: 9 });
  const up = E.top(g);
  g = E.apply(g, { type: 'pass' });
  g = E.apply(g, { type: 'draw', from: 'discard' });
  eq([g.turn, g.phase, g.taken, g.took[1]], [1, 'discard', up, [up]]);
});

test('rút nọc thì bỏ được bất kỳ lá nào, kể cả lá vừa rút', () => {
  const g = mk({ hands: ['AS 2S 3S 4H 5H 6H 9C 9D KC QD', 'AH 2H 3H 4S 5S 6S 8C 8D JC JD'], discard: '10D', stock: 20 });
  const s = E.apply(g, { type: 'draw', from: 'stock' });
  const drawn = s.hands[0][10];
  ok(E.isLegal(s, { type: 'discard', card: drawn }));
  eq(E.legalActions(s).filter((a) => a.type === 'discard').length, 11);
});

/* ---------------- Knock / gin / lay off / undercut ---------------- */
test('knock chỉ khi lá lẻ sau khi bỏ ≤ 10', () => {
  // Sau khi rút: 3 bộ + 9♣ + K♣ → bỏ K♣ còn 9, bỏ 9♣ còn 10: knock được; bỏ lá trong bộ thì không
  const g = mk({ hands: ['AS 2S 3S 4H 5H 6H 7D 8D 9D 9C KC', 'AH 2H 3H 4S 5S 6S 8C 7C JC JD'], discard: 'QH', stock: 20, phase: 'discard' });
  eq(E.legalActions(g).filter((a) => a.type === 'knock').map((a) => a.card), ['9C', 'KC']);
  ok(!E.isLegal(g, { type: 'knock', card: 'AS' }));
  const g2 = mk({ hands: ['AS 2S 3S 4H 5H 6H 7D 8D 9C QC KC', 'AH 2H 3H 4S 5S 6S 8C 7C JC JD'], discard: 'QH', stock: 20, phase: 'discard' });
  eq(E.legalActions(g2).filter((a) => a.type === 'knock').length, 0, 'lá lẻ ít nhất 7 + 8 + 9 + 10 > 10');
});

test('knock: người bị knock ghép lá lẻ vào bộ, ghép dây chuyền; người knock thắng chênh lệch', () => {
  // Bạn knock: sảnh 4-5-6♥, sám 9, sảnh A-2-3♠, lá lẻ 2♦ = 2. Máy: 7♥ 8♥ ghép dây chuyền vào sảnh ♥, 9♣? không (sám 9 đã 3 lá → ghép 9♣ thành tứ)
  const g = mk({ hands: ['4H 5H 6H 9S 9H 9D AS 2S 3S 2D KC', '7H 8H 9C KS KH QD JD 10C 5C 3C'], discard: 'QH', stock: 20, phase: 'discard' });
  const k = E.apply(g, { type: 'knock', card: 'KC' });
  const r = k.result;
  eq([k.phase, r.kind, r.knocker, r.winner, r.kdw], ['round', 'knock', 0, 0, 2]);
  eq(sorted(r.d.laid.map((l) => l.card)), ['7H', '8H', '9C']);
  eq(r.ddwBefore, 7 + 8 + 9 + 10 + 10 + 10 + 10 + 10 + 5 + 3);
  eq(r.ddw, 10 + 10 + 10 + 10 + 10 + 5 + 3);
  eq(r.points, r.ddw - 2);
  eq(k.scores, [r.points, 0]);
  eq(k.boxes, [1, 0]);
  // Bộ của người knock cộng lá ghép vẫn là bộ hợp lệ
  const ext = r.k.melds.map((m) => m.slice());
  r.d.laid.forEach((l) => ext[l.meld].push(l.card));
  ext.forEach((m) => ok(E.isMeld(m), m.join(' ')));
});

test('undercut: người bị knock có lá lẻ ≤ người knock thì thắng chênh lệch + 25 (bằng nhau cũng là undercut)', () => {
  // Bạn knock với lá lẻ 5♣ = 5; máy có 7-8-9♣, J J J, Q Q Q + 4♦ = 4 → undercut: 5 − 4 + 25
  const g = mk({ hands: ['4H 5H 6H 9S 9H 9D AS 2S 3S 5C KC', '7C 8C 9C JS JH JD QS QH QD 4D'], discard: 'QC', stock: 20, phase: 'discard' });
  const k = E.apply(g, { type: 'knock', card: 'KC' });
  const r = k.result;
  eq([r.kind, r.winner, r.kdw, r.ddw], ['undercut', 1, 5, 4]);
  eq(r.points, 5 - 4 + 25);
  eq(k.scores, [0, 26]);
  eq(k.boxes, [0, 1]);
  const g2 = mk({ hands: ['4H 5H 6H 9S 9H 9D AS 2S 3S 4C KC', '7C 8C 9C JS JH JD QS QH QD 4D'], discard: 'QC', stock: 20, phase: 'discard' });
  const r2 = E.apply(g2, { type: 'knock', card: 'KC' }).result;
  eq([r2.kind, r2.kdw, r2.ddw, r2.points], ['undercut', 4, 4, 25]);
});

test('gin: lá lẻ 0 → 25 + lá lẻ đối thủ, không được ghép lá', () => {
  const g = mk({ hands: ['4H 5H 6H 9S 9H 9D AS 2S 3S 4S KC', '7H 8H 9C KS KH QD JD 10C 5C 3C'], discard: 'QH', stock: 20, phase: 'discard' });
  const k = E.apply(g, { type: 'knock', card: 'KC' });
  const r = k.result;
  eq([r.kind, r.winner, r.kdw, r.d.laid.length], ['gin', 0, 0, 0]);
  eq(r.ddw, 7 + 8 + 9 + 10 + 10 + 10 + 10 + 10 + 5 + 3);
  eq(r.points, 25 + r.ddw);
});

test('big gin: 11 lá thành bộ (tùy chọn bật) → 31 + lá lẻ đối thủ; tắt thì phải bỏ lá rồi gin', () => {
  const hands = ['4H 5H 6H 9S 9H 9D AS 2S 3S 4S 5S', '7H 8H 9C KS KH QD JD 10C 5C 3C'];
  const g = mk({ hands, discard: 'QH', stock: 20, phase: 'discard' });
  ok(E.isLegal(g, { type: 'bigGin' }));
  const k = E.apply(g, { type: 'bigGin' });
  eq([k.result.kind, k.result.points, k.hands[0].length], ['bigGin', 31 + k.result.ddw, 11]);
  const off = mk({ hands, discard: 'QH', stock: 20, phase: 'discard', bigGin: false });
  ok(!E.isLegal(off, { type: 'bigGin' }));
  eq(E.apply(off, { type: 'knock', card: '5S' }).result.kind, 'gin');
});

test('nọc còn 2 lá sau một lần bỏ mà chưa ai knock: ván hòa, không ai được điểm, người chia chia lại', () => {
  const g = mk({ hands: ['AS 2S 3S 4H 5H 6H 9C 9D KC QD JH', 'AH 2H 3H 4S 5S 6S 8C 7C JC JD'], discard: 'QH', stock: 2, phase: 'discard' });
  const d = E.apply(g, { type: 'discard', card: 'JH' });
  eq([d.phase, d.result.kind, d.scores, d.boxes], ['round', 'draw', [0, 0], [0, 0]]);
  const n = E.nextRound(d);
  eq([n.round, n.dealer, n.phase], [2, d.dealer, 'upcard']);
  // Ván có người thắng thì đổi người chia
  const g2 = mk({ hands: ['4H 5H 6H 9S 9H 9D AS 2S 3S 4S KC', '7C 8C 9C KS KH KD JD 10D 5C 3C'], discard: 'QH', stock: 20, phase: 'discard' });
  const k = E.nextRound(E.apply(g2, { type: 'knock', card: 'KC' }));
  eq([k.round, k.dealer, k.turn], [2, 1 - g2.dealer, g2.dealer]);
  checkCards(k);
});

test('hết trận khi chạm 100; tổng kết cộng 100 thưởng trận, 25 mỗi ván thắng, thắng trắng ×2', () => {
  const g = mk({ hands: ['4H 5H 6H 9S 9H 9D AS 2S 3S 4S KC', '7H 8H 9C KS KH QD JD 10C 5C 3C'], discard: 'QH', stock: 20, phase: 'discard', extra: { scores: [60, 0], boxes: [2, 0] } });
  const k = E.apply(g, { type: 'knock', card: 'KC' });
  eq(k.phase, 'over');
  eq(E.matchWinner(k), E.HUMAN);
  const f = E.finalScores(k);
  eq(f[0], { base: k.scores[0], game: 100, box: 75, shutout: true, total: (k.scores[0] + 175) * 2 });
  eq(f[1].total, 0);
  eq(E.nextRound(k), k, 'hết trận thì không sang ván');
  ok(!E.legalActions(k).length);
  throws(() => E.apply(k, { type: 'draw', from: 'stock' }));
});

test('nước sai luật bị từ chối (sai pha, sai lượt, lá không có trên tay)', () => {
  const g = mk({ hands: ['AS 2S 3S 4H 5H 6H 9C 9D KC QD', 'AH 2H 3H 4S 5S 6S 8C 7C JC JD'], discard: 'QH', stock: 20 });
  throws(() => E.apply(g, { type: 'discard', card: 'AS' }), 'chưa rút đã bỏ');
  throws(() => E.apply(g, { type: 'pass' }), 'bỏ qua ngoài pha lá mời');
  const d = E.apply(g, { type: 'draw', from: 'discard' });
  throws(() => E.apply(d, { type: 'discard', card: 'AH' }), 'lá của máy');
  throws(() => E.apply(d, { type: 'draw', from: 'stock' }), 'rút hai lần');
  throws(() => E.apply(d, null));
});

/* ---------------- Máy ---------------- */
/** Chơi hết một trận: lv0 / lv1 là mức của ghế 0 / 1 ('random' = bot ngẫu nhiên hợp lệ). Kiểm luật mỗi nước. */
function playMatch(lv0, lv1, seed, check) {
  let g = E.newMatch({ seed, level: 'hard' });
  const rnd = C.rng('r' + seed);
  let guard = 0;
  while (g.phase !== 'over') {
    if (g.phase === 'round') {
      g = E.nextRound(g);
      continue;
    }
    const lv = g.turn === 0 ? lv0 : lv1;
    const a = lv === 'random' ? E.randomAction(g, rnd) : E.aiAction(g, lv);
    if (check && !E.isLegal(g, a)) throw new Error('máy ' + lv + ' đi sai luật ' + JSON.stringify(a));
    g = E.apply(g, a);
    if (check) checkCards(g);
    if (++guard > 20000) throw new Error('trận không kết thúc');
  }
  return g;
}
/** Tỉ lệ trận thắng của mức a trước mức b, đổi ghế xen kẽ (ghế 0 luôn đi trước ván 1). */
function winRate(a, b, n, tag) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const g = playMatch(swap ? b : a, swap ? a : b, tag + ':' + (i >> 1));
    if (E.matchWinner(g) === (swap ? 1 : 0)) w++;
  }
  return w / n;
}

test('máy Dễ / Vừa / Khó luôn đi nước hợp lệ (60 trận, mọi nước được kiểm), 52 lá luôn đủ', () => {
  const lv = ['easy', 'medium', 'hard', 'random'];
  for (let i = 0; i < 60; i++) {
    const g = playMatch(lv[i % 4], lv[(i + 1 + (i >> 2)) % 3], 'legal' + i, true);
    ok(g.scores.some((s) => s >= 100));
  }
});

test('máy Dễ: nhặt lá vào bộ, bỏ lá lẻ cao nhất, knock ngay khi được', () => {
  // Máy tới lượt rút: lá trên chồng bỏ 7♥ nối sảnh 4-5-6♥ → nhặt
  const g = mk({ hands: ['AH 2H 3H 4S 5S 6S 8C 7C JC JD', '4H 5H 6H 9S 9H 9D AS 2S KC QD'], discard: '7H', stock: 20, turn: 1, level: 'easy' });
  eq(E.aiAction(g), { type: 'draw', from: 'discard' });
  // Lá trên chồng không vào bộ → rút nọc
  const g2 = mk({ hands: ['AH 2H 3H 4S 5S 6S 8C 7C JC JD', '4H 5H 6H 9S 9H 9D AS 2S KC QD'], discard: '10C', stock: 20, turn: 1, level: 'easy' });
  eq(E.aiAction(g2), { type: 'draw', from: 'stock' });
  // Bỏ lá lẻ cao nhất (giữ bộ)
  const g3 = mk({ hands: ['AH 2H 3H 4S 5S 6S 8C 7C JC JD', '4H 5H 6H 9S 9H 9D AS 2S KC QD 8S'], discard: '10C', stock: 20, turn: 1, phase: 'discard', level: 'easy' });
  const a = E.aiAction(g3);
  eq(a.type, 'discard');
  ok(['KC', 'QD'].indexOf(a.card) >= 0, a.card);
  // Knock ngay khi lá lẻ ≤ 10
  const g4 = mk({ hands: ['AH 2H 3H 4S 5S 6S 8C 7C JC JD', '4H 5H 6H 9S 9H 9D AS 2S 3S QD 2D'], discard: '10C', stock: 20, turn: 1, phase: 'discard', level: 'easy' });
  eq(E.aiAction(g4), { type: 'knock', card: 'QD' });
});

test('máy Vừa / Khó: không bỏ lá đối thủ vừa nhặt để ghép (theo dõi lá nhặt / bỏ)', () => {
  // Đối thủ (ghế 0) đã nhặt 9♣ và 8♣ từ chồng bỏ. Máy có ba lá lẻ cùng 10 điểm: 10♣ (đối thủ ghép thành sảnh 8-9-10♣),
  // 10♠, Q♥. Dễ không theo dõi nên bỏ lá đầu tiên (10♣); Vừa / Khó tránh 10♣
  const base = { hands: ['9C 8C 2H 3H 4H 5D 6D 7D KS KH', '4S 5S 6S 9S 9H 9D AC 2C 10C 10S QH'], discard: 'JD', stock: 20, turn: 1, phase: 'discard' };
  const extra = { took: [['9C', '8C'], []], threw: [[], []], passed: [[], []] };
  const easy = mk(Object.assign({ level: 'easy', extra }, base));
  const med = mk(Object.assign({ level: 'medium', extra }, base));
  const hard = mk(Object.assign({ level: 'hard', extra }, base));
  eq(E.aiAction(easy).card, '10C', 'Dễ: không theo dõi');
  ok(E.aiAction(med).card !== '10C', 'Vừa không bỏ 10♣');
  ok(E.aiAction(hard).card !== '10C', 'Khó không bỏ 10♣');
});

test('máy Khó: đầu ván knock ngay, cuối ván cảnh giác undercut khi đối thủ đã nhặt nhiều lá', () => {
  const hands = ['AH 2H 3H 4S 5S 6S 8C 7C JC JD', '4H 5H 6H 9S 9H 9D AS 2S 3S 8D 2D'];
  const early = mk({ hands, discard: '10C', stock: 28, turn: 1, phase: 'discard', level: 'hard' });
  eq(E.aiAction(early), { type: 'knock', card: '8D' });
  const late = mk({ hands, discard: '10C', stock: 12, turn: 1, phase: 'discard', level: 'hard',
    extra: { took: [['8C', '7C', 'JC'], []], threw: [ids('KS QS KD QC 10H 10S 10D 9C'), []], passed: [[], []] } });
  eq(E.aiAction(late).type, 'discard', 'đối thủ nhặt 3 lá, đã 8 lượt: chưa knock với 2');
  // Sắp hết nọc: knock để khỏi hòa
  const end = mk({ hands, discard: '10C', stock: 5, turn: 1, phase: 'discard', level: 'hard',
    extra: { took: [['8C', '7C', 'JC'], []], threw: [ids('KS QS KD QC 10H 10S 10D 9C'), []], passed: [[], []] } });
  eq(E.aiAction(end).type, 'knock');
  // Gin thì luôn knock
  const gin = mk({ hands: ['AH 2H 3H 4S 5S 6S 8C 7C JC JD', '4H 5H 6H 9S 9H 9D AS 2S 3S 7H KD'], discard: '10C', stock: 12, turn: 1, phase: 'discard', level: 'hard', bigGin: false,
    extra: { took: [['8C', '7C', 'JC'], []], threw: [[], []], passed: [[], []] } });
  eq(E.aiAction(gin).type, 'knock');
});

test('máy chơi hợp lý: mọi mức thắng bot ngẫu nhiên hợp lệ ≥ 95% (40 trận mỗi mức)', () => {
  ['easy', 'medium', 'hard'].forEach((lv) => {
    const r = winRate(lv, 'random', 40, 'rnd-' + lv);
    console.log('       ' + lv + ' vs ngẫu nhiên: ' + Math.round(r * 100) + '%');
    ok(r >= 0.95, lv + ' ' + r);
  });
});

test('mức mạnh dần: Vừa > Dễ, Khó > Vừa, Khó > Dễ (600 trận mỗi cặp, đổi ghế xen kẽ)', () => {
  const me = winRate('medium', 'easy', 600, 'me');
  const hm = winRate('hard', 'medium', 600, 'hm');
  const he = winRate('hard', 'easy', 600, 'he');
  console.log('       Vừa vs Dễ ' + (me * 100).toFixed(1) + '%, Khó vs Vừa ' + (hm * 100).toFixed(1) + '%, Khó vs Dễ ' + (he * 100).toFixed(1) + '%');
  ok(me >= 0.53, 'Vừa vs Dễ ' + me);
  ok(hm >= 0.53, 'Khó vs Vừa ' + hm);
  ok(he >= 0.58, 'Khó vs Dễ ' + he);
});

test('độ dài trận (cho min_duration_ms): số nước tối thiểu của ghế 0 trong trận ghế 0 thắng', () => {
  let minHuman = Infinity;
  let minAll = Infinity;
  let total = 0;
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const g = playMatch('hard', ['easy', 'medium', 'hard'][i % 3], 'len' + i);
    if (E.matchWinner(g) !== 0) continue;
    minHuman = Math.min(minHuman, g.humanMoves);
    minAll = Math.min(minAll, g.moves);
    total += g.humanMoves;
    n++;
  }
  console.log('       ' + n + ' trận thắng: ít nhất ' + minHuman + ' nước của bạn / ' + minAll + ' nước cả bàn, trung bình ' + Math.round(total / n) + ' nước của bạn');
  ok(minHuman >= 4);
});

/* ---------------- Lưu / khôi phục ---------------- */
const roundTrip = (g) => E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));

test('lưu rồi khôi phục giữ nguyên ván ở mọi pha (kể cả hết ván: kết quả dựng lại đúng)', () => {
  let g = E.newMatch({ seed: 99, level: 'medium' });
  let seen = new Set();
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 5000) {
    seen.add(g.phase);
    const back = roundTrip(g);
    ok(back, 'pha ' + g.phase);
    eq(back, g, 'pha ' + g.phase);
    g = g.phase === 'round' ? E.nextRound(g) : E.apply(g, E.aiAction(g));
  }
  seen.add(g.phase);
  eq(roundTrip(g), g, 'hết trận');
  ['upcard', 'draw', 'discard', 'round', 'over'].forEach((p) => ok(seen.has(p), 'chưa thử pha ' + p));
  // Seed của máy (PRNG) cũng được lưu: chia ván sau giống hệt
  const r = E.newMatch({ seed: 5 });
  eq(E.fromJSON(E.toJSON(r)).rng, r.rng);
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.newMatch({ seed: 3 });
  const good = E.toJSON(g);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const cases = [
    null, 1, 'x', [], {},
    bad({ v: 2 }),
    bad({ level: 'insane' }),
    bad({ bigGin: 'yes' }),
    bad({ scores: [0] }),
    bad({ scores: [-1, 0] }),
    bad({ round: 0 }),
    bad({ dealer: 2 }),
    bad({ rng: -5 }),
    bad({ phase: 'play' }),
    bad({ hands: [good.hands[0].slice(1), good.hands[1]] }), // thiếu lá
    bad({ hands: [good.hands[0].slice(0, 9).concat([good.hands[1][0]]), good.hands[1]] }), // trùng lá
    bad({ hands: [good.hands[0].slice(0, 9).concat(['ZZ']), good.hands[1]] }),
    bad({ stock: good.stock.slice(1), discard: good.discard.concat([good.stock[0]]) }), // lá mời nhưng nọc 30 lá
    bad({ phase: 'discard' }), // pha bỏ mà tay 10 lá
    bad({ phase: 'round', end: null }),
    bad({ phase: 'round', end: { kind: 'gin', knocker: 0 } }), // tay không gin
    bad({ phase: 'round', end: { kind: 'undercut', knocker: 0 } }),
    bad({ end: { kind: 'draw', knocker: null } }), // đang chơi mà có kết quả
    bad({ scores: [100, 0] }), // đang chơi mà đã chạm 100
    bad({ humanMoves: 5, moves: 2 }),
    bad({ took: [[], ['XX']] }),
    bad({ last: { seat: 3, type: 'pass' } }),
    bad({ taken: 'AS' }),
  ];
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'ca ' + i + ': ' + JSON.stringify(raw).slice(0, 80)));
  ok(E.fromJSON(good), 'ván lành vẫn mở được');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
