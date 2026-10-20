// Kiểm thử engine của Xếp Bài (Klondike). Chạy: node test.js
'use strict';
const X = require('./engine.js');

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
const same = (a, b, msg) => eq(JSON.stringify(a), JSON.stringify(b), msg);

// Lá theo tên ngắn: 'As' (Át bích), '10h' (10 cơ), 'Qd' (Đầm rô), 'Kc' (Già nhép)
const SUIT_CODE = { s: 0, h: 1, d: 2, c: 3 };
function C(name) {
  const suit = SUIT_CODE[name.slice(-1)];
  const rk = name.slice(0, -1);
  const rank = { A: 1, J: 11, Q: 12, K: 13 }[rk] || Number(rk);
  return suit * 13 + rank - 1;
}
// Dựng thế bài tùy ý. tab: mảng 7 cột (tên lá, dưới -> trên), down: số lá úp mỗi cột,
// found: 4 mảng tên lá, waste / stock: tên lá (lá trên cùng ở cuối).
function mk(o) {
  const s = X.blankState(o.draw || 1);
  (o.tab || []).forEach((col, i) => { s.tab[i] = col.map(C); });
  if (o.down) s.down = o.down.slice();
  (o.found || []).forEach((f, i) => { s.found[i] = f.map(C); });
  s.waste = (o.waste || []).map(C);
  s.stock = (o.stock || []).map(C);
  s.fan = s.waste.length ? 1 : 0;
  if (o.score) s.score = o.score;
  return s;
}
const mv = (from, n, to) => ({ t: 'move', from, n, to });
const DRAW = { t: 'draw' };
// Mọi lá trên bàn, dùng để kiểm tra bảo toàn 52 lá
function allCards(s) {
  return s.stock.concat(s.waste, ...s.found, ...s.tab);
}
function checkInvariant(s) {
  const cards = allCards(s);
  eq(cards.length, 52, 'tổng số lá');
  eq(new Set(cards).size, 52, 'số lá khác nhau');
  ok(cards.every((c) => Number.isInteger(c) && c >= 0 && c < 52), 'mã lá');
  for (let c = 0; c < 7; c++) {
    const t = s.tab[c];
    ok(s.down[c] >= 0 && (t.length === 0 ? s.down[c] === 0 : s.down[c] < t.length), `cột ${c}: lá trên cùng phải ngửa`);
    for (let i = s.down[c]; i < t.length - 1; i++) ok(X.canStack(t[i + 1], t[i]), `cột ${c}: phần ngửa xếp sai`);
  }
  for (let f = 0; f < 4; f++) {
    s.found[f].forEach((c, i) => {
      eq(X.rankOf(c), i + 1, 'bậc trên đích');
      eq(X.suitOf(c), X.suitOf(s.found[f][0]), 'cùng chất trên đích');
    });
  }
  ok(s.score >= 0, 'điểm không âm');
}

// ---- Chia bài -------------------------------------------------------------------
console.log('Chia bài');
test('28 lá trên 7 cột (1..7 lá), 24 lá chồng rút, chỉ lá trên cùng ngửa', () => {
  const s = X.deal(X.shuffledDeck(X.seededRandom(1)), 1);
  for (let c = 0; c < 7; c++) {
    eq(s.tab[c].length, c + 1, 'cột ' + c);
    eq(s.down[c], c, 'lá úp cột ' + c);
    eq(X.faceUpCount(s, c), 1, 'lá ngửa cột ' + c);
  }
  eq(s.tab.reduce((a, t) => a + t.length, 0), 28);
  eq(s.stock.length, 24);
  eq(s.waste.length, 0);
  eq(X.foundCount(s), 0);
  eq(s.score, 0);
  eq(s.moveCount, 0);
  checkInvariant(s);
});
test('chia theo hàng như ngoài đời: lá đầu bộ ở đáy cột 1, lá thứ 7 là lá ngửa duy nhất của hàng đầu', () => {
  const deck = [];
  for (let i = 0; i < 52; i++) deck.push(i);
  const s = X.deal(deck, 1);
  same(s.tab[0], [0]);
  same(s.tab[1], [1, 7]);
  same(s.tab[6], [6, 12, 17, 21, 24, 26, 27]);
  same(s.stock, deck.slice(28));
});
test('bộ bài xáo đủ 52 lá khác nhau, isDeck từ chối bộ thiếu / trùng', () => {
  const d = X.shuffledDeck();
  ok(X.isDeck(d));
  ok(!X.isDeck(d.slice(1)), 'thiếu lá');
  const dup = d.slice();
  dup[0] = dup[1];
  ok(!X.isDeck(dup), 'trùng lá');
  ok(!X.isDeck(null));
});

// ---- Ván hằng ngày --------------------------------------------------------------
console.log('Ván hằng ngày');
test('cùng ngày cùng bộ bài, khác ngày khác bộ bài', () => {
  same(X.dailyDeck('2026-10-20'), X.dailyDeck('2026-10-20'));
  ok(JSON.stringify(X.dailyDeck('2026-10-20')) !== JSON.stringify(X.dailyDeck('2026-10-21')), 'hai ngày khác nhau');
  eq(X.dailySeed('2026-10-20'), X.hashString('playnine-xepbai-daily-2026-10-20'));
  ok(X.isDeck(X.dailyDeck('2026-10-20')));
});
test('ván hằng ngày tất định trên cả năm (chia hai lần ra cùng thế bài), không trùng nhau', () => {
  const seen = new Set();
  const d = new Date(2026, 0, 1);
  for (let i = 0; i < 365; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const a = X.deal(X.dailyDeck(key), X.DAILY_DRAW);
    const b = X.deal(X.dailyDeck(key), X.DAILY_DRAW);
    same(a, b, key);
    seen.add(JSON.stringify(a.tab));
    d.setDate(d.getDate() + 1);
  }
  eq(seen.size, 365, 'số đề khác nhau');
});

// ---- Nước đi trên cột -----------------------------------------------------------
console.log('Nước đi trên cột');
test('đặt lá nhỏ hơn 1 bậc, khác màu lên cột; cùng màu hoặc sai bậc thì không', () => {
  const s = mk({ tab: [['10h'], ['9s'], ['9d'], ['8s'], ['Jc'], [], []], down: [0, 0, 0, 0, 0, 0, 0] });
  ok(X.canMove(s, 't1', 1, 't0'), '9♠ lên 10♥');
  ok(!X.canMove(s, 't2', 1, 't0'), '9♦ cùng màu đỏ với 10♥');
  ok(!X.canMove(s, 't3', 1, 't0'), '8♠ sai bậc');
  ok(!X.canMove(s, 't0', 1, 't1'), 'lớn hơn không đặt lên nhỏ hơn');
  ok(X.canMove(s, 't0', 1, 't4'), '10♥ lên J♣');
  const r = X.apply(s, mv('t1', 1, 't0'));
  ok(r, 'apply hợp lệ');
  same(s.tab[0], [C('10h'), C('9s')]);
  eq(s.tab[1].length, 0);
  eq(X.apply(s, mv('t2', 1, 't0')), null, 'nước sai luật trả về null');
  same(s.tab[2], [C('9d')], 'nước sai luật không đổi trạng thái');
});
test('cột trống chỉ nhận Già (K), kể cả Già kèm dãy', () => {
  const s = mk({ tab: [['Qh'], ['Ks', 'Qh'], [], ['5c', 'Kd'], ['Jd'], ['2c'], ['3c']], down: [0, 0, 0, 1, 0, 0, 0] });
  ok(!X.canMove(s, 't0', 1, 't2'), 'Đầm không vào cột trống');
  ok(!X.canMove(s, 't4', 1, 't2'), 'Bồi không vào cột trống');
  ok(X.canMove(s, 't3', 1, 't2'), 'Già rô vào cột trống');
  ok(X.canMove(s, 't1', 2, 't2'), 'Già + Đầm vào cột trống');
  const s2 = mk({ waste: ['Kc'] });
  ok(X.canMove(s2, 'waste', 1, 't0'), 'Già từ chồng thải vào cột trống');
  ok(X.canMove(s2, 'waste', 1, 't6'));
});
test('chuyển dãy hợp lệ, không bốc lá úp, không bốc dãy sai thứ tự', () => {
  const s = mk({
    tab: [['2s', 'Kh', 'Qs', 'Jh', '10s'], ['Kc'], ['Qd'], ['5h', '9h', '8c'], [], [], []],
    down: [1, 0, 0, 1, 0, 0, 0],
  });
  ok(X.isRun(s, 0, 4), 'K♥ Q♠ J♥ 10♠ là dãy');
  ok(!X.isRun(s, 0, 5), 'không bốc lá úp');
  ok(X.canMove(s, 't0', 3, 't2') === false, 'Q♠ không lên Q♦');
  ok(X.canMove(s, 't0', 3, 't1') === false, 'Q♠ cùng màu đen với K♣');
  ok(!X.canMove(s, 't0', 2, 't2'), 'J♥ cùng màu đỏ với Q♦');
  ok(X.canMove(s, 't0', 4, 't4'), 'cả dãy từ Già vào cột trống');
  ok(X.isRun(s, 3, 2), 'cột 4: 9♥ 8♣ ngửa là dãy');
  ok(!X.isRun(s, 3, 3), 'cột 4: 5♥ còn úp');
});
test('dãy ngửa xếp sai (do dựng tay) thì không bốc được cả dãy', () => {
  const s = mk({ tab: [['9h', '8h'], ['10c'], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0] });
  ok(!X.isRun(s, 0, 2), '9♥ 8♥ cùng màu');
  ok(!X.canMove(s, 't0', 2, 't1'));
  ok(X.isRun(s, 0, 1));
});
test('chuyển dãy rồi tự lật lá úp vừa lộ ra (+5 điểm)', () => {
  const s = mk({ tab: [['2s', 'Kh', 'Qs', 'Jh'], [], ['Ad'], [], [], [], []], down: [1, 0, 0, 0, 0, 0, 0] });
  const r = X.apply(s, mv('t0', 3, 't1'));
  ok(r && r.flipped, 'có lật lá');
  eq(s.down[0], 0);
  same(s.tab[0], [C('2s')]);
  same(s.tab[1], [C('Kh'), C('Qs'), C('Jh')]);
  eq(s.score, X.SCORE.flip);
  eq(s.moveCount, 1);
});

// ---- Ô đích ---------------------------------------------------------------------
console.log('Ô đích');
test('ô đích trống chỉ nhận Át, sau đó cùng chất tăng dần', () => {
  const s = mk({ tab: [['2h'], ['As'], ['2s'], ['3s'], ['Ah'], [], []], down: [0, 0, 0, 0, 0, 0, 0] });
  ok(!X.canMove(s, 't0', 1, 'f0'), '2♥ không vào ô trống');
  ok(X.apply(s, mv('t1', 1, 'f0')), 'Át bích');
  ok(!X.canMove(s, 't0', 1, 'f0'), '2♥ khác chất');
  ok(!X.canMove(s, 't3', 1, 'f0'), '3♠ nhảy bậc');
  ok(X.apply(s, mv('t2', 1, 'f0')), '2♠');
  ok(X.apply(s, mv('t3', 1, 'f0')), '3♠');
  ok(X.apply(s, mv('t4', 1, 'f1')), 'Át cơ vào ô khác');
  ok(X.canMove(s, 't0', 1, 'f1'), '2♥ lên Át cơ');
  eq(X.foundCount(s), 4);
});
test('chỉ đưa từng lá lên đích; không chuyển đích sang đích', () => {
  const s = mk({ tab: [['2s', 'Ah'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], found: [['As']] });
  ok(!X.canMove(s, 't0', 2, 'f1'), 'không đưa 2 lá');
  ok(!X.canMove(s, 'f0', 1, 'f1'), 'đích sang đích');
});
test('từ đích xuống cột hợp lệ (−15 điểm)', () => {
  const s = mk({ tab: [['3h'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], found: [['As', '2s']], score: 40 });
  ok(X.canMove(s, 'f0', 1, 't0'));
  X.apply(s, mv('f0', 1, 't0'));
  eq(s.score, 25);
  same(s.tab[0], [C('3h'), C('2s')]);
});

// ---- Rút bài --------------------------------------------------------------------
console.log('Rút bài');
test('rút 1 lá: hết chồng thì chia lại, thứ tự giữ nguyên qua các vòng', () => {
  const deck = X.shuffledDeck(X.seededRandom(7));
  const s = X.deal(deck, 1);
  const first = [];
  for (let i = 0; i < 24; i++) {
    X.apply(s, DRAW);
    first.push(s.waste[s.waste.length - 1]);
    eq(s.fan, 1);
  }
  eq(s.stock.length, 0);
  eq(s.waste.length, 24);
  const r = X.apply(s, DRAW);
  ok(r && r.redeal, 'chia lại');
  eq(s.stock.length, 24);
  eq(s.waste.length, 0);
  eq(s.redeals, 1);
  const second = [];
  for (let i = 0; i < 24; i++) { X.apply(s, DRAW); second.push(s.waste[s.waste.length - 1]); }
  same(second, first, 'vòng 2 giống vòng 1');
  eq(s.moveCount, 49);
  eq(s.score, 0, 'chia lại không trừ điểm');
});
test('rút 3 lá: lá thứ 3 nằm trên, vòng cuối rút phần lẻ, chia lại không giới hạn', () => {
  const deck = X.shuffledDeck(X.seededRandom(9));
  const s = X.deal(deck, 3);
  const stock0 = s.stock.slice();
  X.apply(s, DRAW);
  eq(s.waste.length, 3);
  eq(s.fan, 3);
  eq(s.waste[2], stock0[stock0.length - 3], 'lá thứ 3 nằm trên cùng');
  // Lấy lá trên cùng ra cột (hợp lệ hay không đều không quan trọng): giả lập bằng cách mở rộng kiểm tra fan
  for (let i = 0; i < 7; i++) X.apply(s, DRAW);
  eq(s.waste.length, 24);
  for (let round = 0; round < 5; round++) {
    ok(X.apply(s, DRAW).redeal, 'chia lại vòng ' + round);
    for (let i = 0; i < 8; i++) X.apply(s, DRAW);
    eq(s.stock.length, 0);
  }
  eq(s.redeals, 5);
  // Còn 7 lá: rút 3, 3, 1
  const t = mk({ draw: 3, stock: ['As', '2s', '3s', '4s', '5s', '6s', '7s'] });
  X.apply(t, DRAW); X.apply(t, DRAW);
  eq(t.stock.length, 1);
  const r = X.apply(t, DRAW);
  eq(r.drawn, 1);
  eq(t.fan, 1);
  eq(t.waste.length, 7);
});
test('rút 3: lấy lá thải thì phần xòe giảm dần, chồng rút + thải trống thì không rút được', () => {
  const s = mk({ draw: 3, tab: [['Kc'], ['Ks'], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], stock: ['Qd', 'Qh', '5c'] });
  X.apply(s, DRAW);
  same(s.waste, [C('5c'), C('Qh'), C('Qd')]);
  ok(X.apply(s, mv('waste', 1, 't0')), 'Q♦ lên K♣');
  eq(s.fan, 2);
  ok(X.apply(s, mv('waste', 1, 't1')), 'Q♥ lên K♠');
  eq(s.fan, 1);
  const e = mk({});
  ok(!X.isLegal(e, DRAW));
  eq(X.apply(e, DRAW), null);
});

// ---- Điểm ---------------------------------------------------------------------
console.log('Điểm');
test('thải xuống cột +5, thải lên đích +10, cột lên đích +10, cột sang cột 0, lật +5, đích xuống −15, không âm', () => {
  const s = mk({
    tab: [['8c'], ['As', '9h'], ['2d'], [], [], [], []],
    down: [0, 1, 0, 0, 0, 0, 0],
    waste: ['Ad', '7h'],
  });
  X.apply(s, mv('waste', 1, 't0'));
  eq(s.score, 5, 'thải xuống cột');
  X.apply(s, mv('waste', 1, 'f0'));
  eq(s.score, 15, 'thải lên đích');
  X.apply(s, mv('t2', 1, 'f0'));
  eq(s.score, 25, 'cột lên đích');
  X.apply(s, mv('t0', 2, 't1'));
  eq(s.score, 25, 'cột sang cột không điểm');
  const t = mk({ tab: [['As', 'Kh'], [], [], [], [], [], []], down: [1, 0, 0, 0, 0, 0, 0] });
  X.apply(t, mv('t0', 1, 't3'));
  eq(t.score, 5, 'lật lá');
  const u = mk({ tab: [['3c'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], found: [['Ah', '2h']], score: 10 });
  const r = X.apply(u, mv('f0', 1, 't0'));
  eq(r.points, -15);
  eq(u.score, 0, 'điểm dừng ở 0');
});

// ---- Đi lại ----------------------------------------------------------------------
console.log('Đi lại');
test('dựng lại từ danh sách nước bỏ nước cuối ra đúng trạng thái trước đó (cả điểm, lá lật, xòe)', () => {
  for (let g = 0; g < 40; g++) {
    const rng = X.seededRandom(100 + g);
    const deck = X.shuffledDeck(rng);
    const draw = g % 2 ? 3 : 1;
    const s = X.deal(deck, draw);
    const moves = [];
    const snaps = [JSON.stringify(s)];
    for (let i = 0; i < 120; i++) {
      const legal = X.legalMoves(s);
      if (!legal.length) break;
      const m = legal[Math.floor(rng() * legal.length)];
      ok(X.apply(s, m), 'nước hợp lệ');
      moves.push(m);
      snaps.push(JSON.stringify(s));
    }
    // Đi lại từng nước một tới đầu ván
    for (let k = moves.length; k >= 0; k--) {
      const r = X.replay(deck, draw, moves.slice(0, k));
      eq(JSON.stringify(r), snaps[k], `ván ${g} sau ${k} nước`);
    }
  }
});
test('replay từ chối bộ bài hỏng và nước sai luật / sai định dạng', () => {
  const deck = X.shuffledDeck(X.seededRandom(3));
  eq(X.replay(deck.slice(1), 1, []), null);
  eq(X.replay(deck, 1, [{ t: 'move', from: 't0', n: 1, to: 'stock' }]), null);
  eq(X.replay(deck, 1, [{ t: 'xyz' }]), null);
  eq(X.replay(deck, 1, [{ t: 'move', from: 't9', n: 1, to: 't0' }]), null);
  ok(X.replay(deck, 1, [{ t: 'draw' }]), 'nước rút hợp lệ');
});

// ---- Kết thúc ván ---------------------------------------------------------------
console.log('Kết thúc ván');
const fullSuit = (s) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((r) => r + s);
test('nhận biết thắng khi đủ 52 lá trên đích', () => {
  const s = mk({ found: [fullSuit('s'), fullSuit('h'), fullSuit('d'), fullSuit('c').slice(0, 12)], tab: [['Kc'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0] });
  ok(!X.isWon(s));
  X.apply(s, mv('t0', 1, 'f3'));
  ok(X.isWon(s));
  eq(X.hint(s), null, 'thắng rồi thì không gợi ý');
  ok(!X.canAutoComplete(s), 'thắng rồi thì không tự xếp');
});
test('tự hoàn thành khi mọi lá trên cột đã ngửa (kể cả còn chồng rút, rút 1)', () => {
  const s = mk({
    tab: [['Kh', 'Qs', 'Jh'], ['Kc', 'Qd'], ['10h', '9s'], ['Ks', 'Qh'], ['Kd'], [], []],
    down: [0, 0, 0, 0, 0, 0, 0],
    found: [fullSuit('s').slice(0, 8), fullSuit('h').slice(0, 8), fullSuit('d').slice(0, 11), fullSuit('c').slice(0, 12)],
    stock: ['Js', '9h', '10s'],
  });
  checkInvariant(s);
  ok(X.allFaceUp(s));
  ok(X.canAutoComplete(s), 'tự xếp được');
  const moves = X.autoCompleteMoves(s);
  const t = X.clone(s);
  for (const m of moves) ok(X.apply(t, m), 'nước tự xếp hợp lệ');
  ok(X.isWon(t), 'tự xếp xong là thắng');
  // Còn lá úp thì không tự xếp
  const u = X.clone(s);
  u.down[0] = 1;
  ok(!X.canAutoComplete(u), 'còn lá úp');
});
test('ván ngẫu nhiên rút 1: hễ mọi lá ngửa là tự xếp xong (300 ván chơi bằng gợi ý)', () => {
  let reached = 0;
  for (let g = 0; g < 300; g++) {
    const s = X.deal(X.shuffledDeck(X.seededRandom(5000 + g)), 1);
    for (let i = 0; i < 600 && !X.isWon(s); i++) {
      if (X.allFaceUp(s)) {
        reached++;
        const moves = X.autoCompleteMoves(s);
        ok(moves, 'ván ' + g + ' có chuỗi tự xếp');
        for (const m of moves) X.apply(s, m);
        ok(X.isWon(s), 'ván ' + g + ' thắng sau tự xếp');
        break;
      }
      const h = X.hint(s);
      if (!h) break;
      ok(X.isLegal(s, h), 'gợi ý hợp lệ');
      X.apply(s, h);
    }
    checkInvariant(s);
  }
  ok(reached > 10, 'có đủ ván lật hết bài để kiểm tra: ' + reached);
});

// ---- Chạm để đi, gợi ý -----------------------------------------------------------
console.log('Chạm để đi, gợi ý');
test('thứ tự đích: ô đích trước, rồi cột có bài từ bên phải nguồn, cột trống sau cùng', () => {
  const s = mk({
    tab: [['10s'], ['Ah'], ['10c'], ['2s'], [], ['Kd'], []],
    down: [0, 0, 0, 0, 0, 0, 0],
    waste: ['9h'],
    found: [['As']],
  });
  same(X.destinations(s, 'waste', 1), ['t0', 't2'], '9♥ lên hai lá 10 đen');
  same(X.destinations(s, 't3', 1), ['f0'], '2♠ lên đích');
  same(X.destinations(s, 't1', 1), ['f1', 't3'], 'Át lên ô đích trống đầu tiên, rồi lên 2♠');
  same(X.destinations(s, 't5', 1), [], 'Già đã ở đáy cột thì không sang cột trống');
  const t = mk({ tab: [['5c', 'Kd'], [], ['Ks'], [], ['9s'], [], []], down: [1, 0, 0, 0, 0, 0, 0], waste: ['Qc'] });
  same(X.destinations(t, 't0', 1), ['t1'], 'Già có lá úp bên dưới: chỉ một cột trống');
  same(X.destinations(t, 'waste', 1), ['t0'], 'Q♣ lên K♦');
});
test('gợi ý ưu tiên lên đích, rồi lật lá úp, rồi thải xuống cột, cuối cùng rút bài', () => {
  const a = mk({ tab: [['As'], ['Qh'], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], waste: ['Jc'] });
  same(X.hint(a), mv('t0', 1, 'f0'));
  const b = mk({ tab: [['3d', '2h', '9s'], ['10h'], ['Jc'], [], [], [], []], down: [2, 0, 0, 0, 0, 0, 0], waste: ['10d'], stock: ['4c'] });
  same(X.hint(b), mv('t0', 1, 't1'), 'chuyển 9♠ để lật lá');
  const c = mk({ tab: [['Jc'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], waste: ['10d'], stock: ['4c'] });
  same(X.hint(c), mv('waste', 1, 't0'));
  const d = mk({ tab: [['Jc'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], stock: ['10h'] });
  same(X.hint(d), DRAW);
  const e = mk({ tab: [['Jc'], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], stock: ['5h'] });
  eq(X.hint(e), null, 'không còn nước có ích');
});
test('gợi ý tách dãy để lá bên dưới lên đích', () => {
  // 2♠ nằm dưới 9♥ 8♣: chuyển 9♥ 8♣ sang 10♠ để 2♠ lên đích
  const s = mk({ tab: [['2s', '9h', '8c'], ['10s'], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], found: [['As']] });
  same(X.hint(s), mv('t0', 2, 't1'));
});

// ---- Bảo toàn lá bài --------------------------------------------------------------
console.log('Bảo toàn lá bài');
test('2000 ván ngẫu nhiên, nước đi ngẫu nhiên: luôn đủ 52 lá khác nhau, cột luôn hợp lệ', () => {
  for (let g = 0; g < 2000; g++) {
    const rng = X.seededRandom(g * 31 + 7);
    const s = X.deal(X.shuffledDeck(rng), g % 2 ? 3 : 1);
    for (let i = 0; i < 150; i++) {
      const legal = X.legalMoves(s);
      if (!legal.length) break;
      // Bớt ưu tiên rút bài để bài trên bàn được xáo trộn nhiều hơn
      const nonDraw = legal.filter((m) => m.t !== 'draw');
      const pool = nonDraw.length && rng() < 0.7 ? nonDraw : legal;
      const m = pool[Math.floor(rng() * pool.length)];
      const before = JSON.stringify(s);
      ok(X.apply(s, m), 'nước hợp lệ phải áp được');
      ok(JSON.stringify(s) !== before, 'nước đi phải đổi trạng thái');
      if (i % 10 === 0) checkInvariant(s);
    }
    checkInvariant(s);
  }
});
test('nước sai luật ngẫu nhiên không bao giờ làm đổi trạng thái', () => {
  const rng = X.seededRandom(42);
  const ids = ['stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 'x1'];
  for (let g = 0; g < 200; g++) {
    const s = X.deal(X.shuffledDeck(rng), 1);
    for (let i = 0; i < 60; i++) {
      const m = { t: 'move', from: ids[(rng() * ids.length) | 0], to: ids[(rng() * ids.length) | 0], n: 1 + ((rng() * 4) | 0) };
      const before = JSON.stringify(s);
      const legal = X.isLegal(s, m);
      const r = X.apply(s, m);
      eq(!!r, legal, 'apply khớp isLegal');
      if (!r) eq(JSON.stringify(s), before, 'không đổi khi sai luật');
      checkInvariant(s);
    }
  }
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
