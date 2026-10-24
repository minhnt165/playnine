/* Kiểm tra engine Xì Tố: chạy `node test.js`
 * - Chấm bài: bảng tay chuẩn (mọi loại tay, so kicker, sảnh A-2-3-4-5, chọn 5 lá tốt nhất từ 7),
 *   khớp duyệt hết 21 tổ hợp, tần suất loại tay trên 7 lá ngẫu nhiên đúng bảng xác suất chuẩn
 * - Chia bài tất định theo hạt giống; mù / nút / thứ tự nói (4 người và đấu tay đôi); mù tăng theo số ván
 * - Luật cược: check / call / bet / raise tối thiểu / all-in thiếu không mở lại quyền tố / nước sai bị từ chối
 * - Pot phụ, trả tiền cược không ai theo, chia pot hòa và chip lẻ, giữ nguyên tổng chip
 * - Giải: hết chip thì thua, ăn hết chip thì thắng, nút xoay qua người còn chip
 * - Máy luôn đi nước hợp lệ; mức mạnh dần (mô phỏng giải đấu): Khó / Vừa thắng Dễ, Khó thắng máy ngẫu nhiên
 * - Lưu / khôi phục giữa ván và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');
const C = require('../_kit/cards.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    passed++;
    const ms = Date.now() - t0;
    console.log('  ok   ' + name + (ms > 500 ? ' (' + (ms / 1000).toFixed(1) + ' s)' : ''));
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
  if (!v) throw new Error(msg || 'sai');
}

const ids = (s) => s.split(' ').map(E.fromId);
const sc = (s) => E.score(ids(s));
const cat = (s) => E.describe(sc(s)).cat;
const sum = (a) => a.reduce((x, y) => x + y, 0);

/* ---------------- Dựng ván thử ---------------- */

/** Ván giữa hai lượt chia với số chip và nút cho trước (qua fromJSON, như ván lưu), rồi chia ván kế. */
function table(chips, button, opts) {
  const o = opts || {};
  const g = E.fromJSON(Object.assign(E.toJSON(E.newTournament(o.seed || 1, o.level || 'medium')), { phase: 'done', handNo: o.handNo || 1, chips: [1000, 1000, 1000, 1000] }));
  if (!g) throw new Error('ván thử hỏng');
  g.chips = chips.slice();
  // nextHand chuyển nút sang người kế tiếp còn chip: lùi nút một ghế để nút rơi đúng chỗ muốn
  g.button = prevAlive(chips, button);
  return E.nextHand(g);
}
function prevAlive(chips, s) {
  for (let i = 1; i <= 4; i++) {
    const o = (s - i + 4) % 4;
    if (chips[o] > 0) return o;
  }
  return s;
}
/** Xếp lại bộ bài trong bộ nhớ: bài tẩy theo ghế ({ 0: 'AS KS' }), 5 lá chung. Chỉ để test. */
function rig(g, holes, board) {
  const deck = g.h.deck.slice();
  const place = (pos, id) => {
    const c = E.fromId(id);
    const j = deck.indexOf(c);
    const t = deck[pos];
    deck[pos] = c;
    deck[j] = t;
  };
  Object.keys(holes).forEach((s) => {
    const [a, b] = holes[s].split(' ');
    place(Number(s), a);
    place(Number(s) + 4, b);
  });
  if (board) board.split(' ').forEach((id, i) => place([9, 10, 11, 13, 15][i], id));
  g.h.deck = deck;
  return g;
}
function play(g, ...actions) {
  let cur = g;
  actions.forEach((a, i) => {
    const n = E.act(cur, a);
    if (!n) throw new Error('nước ' + i + ' bị từ chối: ' + JSON.stringify(a) + ' (ghế ' + cur.h.toAct + ')');
    cur = n;
  });
  return cur;
}
const F = { type: 'fold' };
const K = { type: 'check' };
const CALL = { type: 'call' };
const R = (to) => ({ type: 'raise', to });
const conserved = (g, total) => sum(g.chips) + (g.phase === 'bet' ? sum(g.h.committed) : 0) === (total || E.TOTAL);

/* ================= Chấm bài ================= */

test('bảng tay chuẩn: mỗi loại tay nhận đúng tên', () => {
  eq(cat('AS KS QS JS 10S'), 'royal');
  eq(cat('9H 8H 7H 6H 5H'), 'sflush');
  eq(cat('AD 2D 3D 4D 5D'), 'sflush');
  eq(cat('7C 7D 7H 7S 2C'), 'quads');
  eq(cat('KC KD KH 4S 4C'), 'full');
  eq(cat('AH 9H 7H 4H 2H'), 'flush');
  eq(cat('10C 9D 8H 7S 6C'), 'straight');
  eq(cat('AC 2D 3H 4S 5C'), 'straight');
  eq(cat('AC KD QH JS 10C'), 'straight');
  eq(cat('QC QD QH 7S 2C'), 'trips');
  eq(cat('JC JD 4H 4S 9C'), 'twopair');
  eq(cat('10C 10D 8H 4S 2C'), 'pair');
  eq(cat('AC JD 8H 4S 2C'), 'high');
  eq(cat('QC KD AH 2S 3C'), 'high', 'Q-K-A-2-3 không vòng thành sảnh');
});

test('bảng tay chuẩn: thứ tự các loại tay và so kicker', () => {
  const order = [
    'AC JD 8H 4S 2C', '2C 2D 8H 4S 3C', '3C 3D 2H 2S 4C', '2C 2D 2H 4S 3C', 'AC 2D 3H 4S 5C', '6C 2C 3C 4C 8C',
    '2C 2D 2H 3S 3C', '2C 2D 2H 2S 3C', 'AD 2D 3D 4D 5D', 'AS KS QS JS 10S',
  ];
  for (let i = 1; i < order.length; i++) ok(sc(order[i]) > sc(order[i - 1]), order[i] + ' > ' + order[i - 1]);
  ok(sc('AC KD 8H 4S 2C') > sc('AC QD JH 9S 8C'), 'mậu thầu so lá thứ hai');
  ok(sc('9C 9D AH 4S 2C') > sc('9C 9D KH QS JC'), 'đôi bằng nhau so kicker');
  ok(sc('KC KD 2H 2S 3C') > sc('QC QD JH JS AC'), 'thú: đôi lớn quyết định');
  ok(sc('8C 8D 5H 5S AC') > sc('8H 8S 5C 5D KC'), 'thú bằng nhau so kicker');
  ok(sc('6C 5D 4H 3S 2C') > sc('AC 2D 3H 4S 5C'), 'sảnh 6 hơn sảnh A-5');
  ok(sc('3C 3D 3H AS AC') < sc('4C 4D 4H 2S 2C'), 'cù lũ so bộ ba');
  ok(sc('AH QH 9H 6H 3H') > sc('AD QD 9D 6D 2D'), 'thùng so tới lá cuối');
  eq(sc('AC KD 8H 4S 2C'), sc('AD KH 8S 4C 2D'), 'khác chất cùng bậc thì hòa');
});

test('7 lá: chọn đúng 5 lá tốt nhất (ba đôi, hai bộ ba, thùng 6 lá, sảnh có đôi, bàn chơi)', () => {
  ok(sc('AC AD KH KS QC QD 2H') === sc('AC AD KH KS QC'), 'ba đôi: hai đôi lớn + kicker lá đôi thứ ba');
  eq(cat('9C 9D 9H 5S 5C 5D 2H'), 'full');
  ok(sc('9C 9D 9H 5S 5C 5D 2H') === sc('9C 9D 9H 5S 5C'), 'hai bộ ba: bộ lớn + đôi từ bộ nhỏ');
  ok(sc('AH KH 9H 6H 3H 2H 4C') === sc('AH KH 9H 6H 3H'), 'thùng 6 lá lấy 5 lá lớn');
  eq(cat('5C 6D 7H 8S 9C 9D 2H'), 'straight');
  eq(cat('8H 9H 10H JH QH KH 2C'), 'sflush');
  ok(sc('8H 9H 10H JH QH KH 2C') === sc('9H 10H JH QH KH'), 'thùng phá sảnh lấy dãy cao nhất');
  ok(sc('7C 7D 7H 7S AC KD QH') === sc('7C 7D 7H 7S AC'), 'tứ quý + kicker A');
  eq(E.bestFive(ids('2C 3D 10H JH QH KH AH')).map(E.toId).sort(), ['10H', 'AH', 'JH', 'KH', 'QH']);
});

test('chấm 7 lá trực tiếp khớp duyệt hết 21 tổ hợp 5 lá (3000 tay ngẫu nhiên)', () => {
  const r = C.rng(42);
  for (let i = 0; i < 3000; i++) {
    const deck = C.shuffle(C.newDeck(), r).map(E.cardInt).slice(0, 7);
    let best = 0;
    for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
      const five = deck.filter((x, k) => k !== a && k !== b);
      best = Math.max(best, E.score(five));
    }
    if (E.score(deck) !== best) throw new Error(deck.map(E.toId).join(' '));
  }
});

test('tần suất loại tay trên 7 lá khớp bảng xác suất chuẩn (40.000 tay)', () => {
  // Xác suất chuẩn của Texas Hold'em (7 lá): mậu thầu 17,4 %, đôi 43,8 %, thú 23,5 %, sám 4,83 %, sảnh 4,62 %,
  // thùng 3,03 %, cù lũ 2,60 %, tứ quý 0,168 %, thùng phá sảnh (gồm royal) 0,0311 %
  const want = { high: 0.174, pair: 0.438, twopair: 0.235, trips: 0.0483, straight: 0.0462, flush: 0.0303, full: 0.026, quads: 0.00168 };
  const n = 40000;
  const count = {};
  const r = C.rng(7);
  for (let i = 0; i < n; i++) {
    const seven = C.shuffle(C.newDeck(), r).map(E.cardInt).slice(0, 7);
    const c = E.describe(E.score(seven)).cat;
    count[c] = (count[c] || 0) + 1;
  }
  Object.keys(want).forEach((c) => {
    const p = (count[c] || 0) / n;
    const tol = Math.max(0.0015, want[c] * 0.12);
    ok(Math.abs(p - want[c]) < tol, c + ': ' + p.toFixed(4) + ' vs ' + want[c]);
  });
});

/* ================= Chia bài, mù, thứ tự nói ================= */

test('chia bài tất định theo hạt giống, lá không trùng', () => {
  const a = E.newTournament(123, 'easy');
  const b = E.newTournament(123, 'easy');
  eq(a.h.deck, b.h.deck);
  eq(a.button, b.button);
  ok(JSON.stringify(E.newTournament(124, 'easy').h.deck) !== JSON.stringify(a.h.deck), 'hạt khác thì bài khác');
  eq(new Set(a.h.deck).size, 52);
  const seen = new Set();
  for (let s = 0; s < 4; s++) E.holeCards(a, s).forEach((c) => seen.add(C.toId(c)));
  eq(seen.size, 8);
});

test('4 người: mù nhỏ / mù lớn sau nút, người sau mù lớn nói trước; sau flop người sau nút nói trước', () => {
  let g = table([1000, 1000, 1000, 1000], 2);
  eq([g.button, g.h.sbSeat, g.h.bbSeat, g.h.toAct], [2, 3, 0, 1]);
  eq(g.h.bets, [20, 0, 0, 10]);
  eq(g.chips, [980, 1000, 1000, 990]);
  eq(E.legal(g).toCall, 20);
  g = play(g, CALL, CALL, CALL); // ghế 1, 2 theo, ghế 3 (mù nhỏ) bù
  eq(g.h.toAct, 0, 'mù lớn được quyền nói tiếp (option)');
  const L = E.legal(g);
  ok(L.canCheck && L.canRaise && !L.canFold, 'mù lớn: check hoặc tố, không được bỏ');
  g = play(g, K);
  eq([g.h.street, g.h.toAct, E.boardCards(g).length], [1, 3, 3]);
  eq(g.h.bets, [0, 0, 0, 0]);
});

test('đấu tay đôi: nút đặt mù nhỏ, nói trước lúc pre-flop và nói sau ở các vòng sau', () => {
  let g = table([2000, 0, 2000, 0], 2);
  eq([g.button, g.h.sbSeat, g.h.bbSeat, g.h.toAct], [2, 2, 0, 2]);
  g = play(g, CALL, K);
  eq([g.h.street, g.h.toAct], [1, 0]);
  g = play(g, K, K);
  eq([g.h.street, g.h.toAct], [2, 0]);
});

test('mù tăng mỗi 6 ván', () => {
  eq(E.blindsFor(0), { level: 0, sb: 10, bb: 20 });
  eq(E.blindsFor(5).sb, 10);
  eq(E.blindsFor(6), { level: 1, sb: 15, bb: 30 });
  eq(E.blindsFor(12).bb, 40);
  eq(E.blindsFor(10000).sb, E.SMALL_BLINDS[E.SMALL_BLINDS.length - 1]);
  const g = table([1000, 1000, 1000, 1000], 0, { handNo: 6 }); // ván thứ 7
  eq([g.handNo, g.h.sb, g.h.bb], [7, 15, 30]);
});

/* ================= Luật cược ================= */

test('nước sai bị từ chối: bỏ khi được check, check khi phải theo, tố dưới mức tối thiểu / quá stack', () => {
  let g = table([1000, 1000, 1000, 1000], 2); // ghế 1 nói trước, phải theo 20
  eq(E.act(g, K), null);
  eq(E.act(g, R(30)), null, 'tố tối thiểu là 40');
  eq(E.act(g, R(1001)), null, 'quá stack');
  eq(E.act(g, R(40.5)), null);
  eq(E.act(g, { type: 'dance' }), null);
  eq(E.act(g, null), null);
  ok(E.act(g, R(40)), 'tố lên 40 được');
  g = play(g, CALL, CALL, CALL, K);
  eq(E.act(g, F), null, 'không ai cược thì không được bỏ');
  eq(E.act(g, CALL), null);
  ok(E.act(g, R(20)), 'cược tối thiểu = mù lớn');
  eq(E.act(g, R(19)), null);
});

test('tố tối thiểu bằng lần tố trước; tố đủ mức mở lại quyền nói', () => {
  let g = table([1000, 1000, 1000, 1000], 2);
  g = play(g, R(60)); // ghế 1 tố thêm 40
  eq(E.legal(g).minTo, 100);
  g = play(g, R(150)); // ghế 2 tố thêm 90
  eq(E.legal(g).minTo, 240);
  g = play(g, F, F); // ghế 3, ghế 0 bỏ
  eq(g.h.toAct, 1);
  ok(E.legal(g).canRaise, 'ghế 1 được tố lại');
  g = play(g, CALL);
  eq(g.h.street, 1);
  eq(sum(g.h.committed), 330);
});

test('all-in thiếu không mở lại quyền tố cho người đã nói', () => {
  let g = table([1000, 1000, 130, 1000], 2); // ghế 2 (nút) chỉ có 130
  g = play(g, R(100)); // ghế 1 tố lên 100
  g = play(g, R(130)); // ghế 2 all-in 130: chỉ thêm 30 < 80, không đủ một lần tố
  eq(g.h.log[g.h.log.length - 1].a, 'allin');
  g = play(g, F, CALL); // ghế 3 bỏ, ghế 0 (mù lớn, chưa nói) theo
  eq(g.h.toAct, 1);
  const L = E.legal(g);
  ok(!L.canRaise && L.canCall && L.toCall === 30, 'ghế 1 chỉ được theo hoặc bỏ');
});

test('theo khi không đủ chip là all-in; hết người cược thì lật hết bài và so', () => {
  let g = table([1000, 300, 1000, 1000], 2);
  rig(g, { 0: 'AS AH', 1: 'KS KH', 2: '2C 7D', 3: '3C 8D' }, '2D 5S 9C JD QH');
  g = play(g, CALL, F, F, R(800)); // ghế 1 theo 20, 2, 3 bỏ, ghế 0 tố lên 800
  g = play(g, CALL); // ghế 1 theo 280 còn lại: all-in
  eq(g.phase, 'done');
  eq(g.h.street, 4);
  eq(E.boardCards(g).length, 5);
  // Tiền cược không ai theo (800 - 300) trả về ghế 0; pot = 300 + 300 + 10
  eq(g.chips, [1000 - 300 + 610, 0, 1000, 990]);
  eq(g.h.result.won, [610, 0, 0, 0]);
  ok(conserved(g, 3300));
});

/* ================= Pot phụ, hòa, chip lẻ ================= */

test('pot phụ: ba người all-in khác mức, mỗi pot về đúng người thắng trong số người đủ điều kiện', () => {
  let g = table([1000, 100, 300, 1000], 0); // nút 0, mù nhỏ 1, mù lớn 2, ghế 3 nói trước
  // Bài: ghế 1 (100 chip) mạnh nhất, ghế 2 (300 chip) nhì, ghế 3 ba, ghế 0 yếu nhất
  rig(g, { 0: '2C 7D', 1: 'AS AH', 2: 'KS KH', 3: 'QS QH' }, '3D 4S 9C JD 8H');
  g = play(g, R(1000), CALL, CALL, CALL); // 3 all-in, 0 theo, 1 all-in 100, 2 all-in 300
  eq(g.phase, 'done');
  const pots = g.h.result.pots;
  eq(pots.map((p) => p.amount), [400, 600, 1400]);
  eq(pots.map((p) => p.winners), [[1], [2], [3]]);
  eq(g.chips, [0, 400, 600, 1400]);
  ok(conserved(g, 2400));
});

test('người bỏ bài giữa chừng vẫn để lại phần đã góp trong pot', () => {
  let g = table([500, 500, 500, 500], 0);
  rig(g, { 0: '2C 7D', 1: 'AS AH', 2: 'KS KH', 3: 'QS QH' }, '3D 4S 9C JD 8H');
  g = play(g, R(60), CALL, CALL, CALL); // pre-flop: mỗi người 60
  g = play(g, R(100), F, CALL, CALL); // flop: ghế 1 cược 100, ghế 2 bỏ, 3, 0 theo
  ok(g.phase === 'bet' && g.h.street === 2);
  g = play(g, K, K, K); // turn: ghế 1, 3, 0 check
  eq(g.h.street, 3);
  g = play(g, K, K, K);
  eq(g.phase, 'done');
  eq(g.h.result.won, [0, 60 * 4 + 300, 0, 0]);
  ok(conserved(g, 2000));
});

test('hòa thì chia đều pot, chip lẻ cho người ngồi gần bên trái nút trước', () => {
  let g = table([1000, 1000, 1000, 1000], 0);
  // Ghế 1 và 3 cùng sảnh 8 tới Q (bằng nhau); ghế 0 sám 2, ghế 2 bỏ bài sau khi góp
  rig(g, { 0: '2C 2D', 1: '8S 3H', 2: '4C 5D', 3: '8H 3D' }, '9C 10D JH QS 2S');
  g = play(g, R(45), CALL, CALL, CALL); // ghế 3 tố 45, 0, 1, 2 theo -> pot 180
  g = play(g, K, K, K, R(25)); // flop: ghế 1, 2, 3 check, ghế 0 cược 25
  g = play(g, CALL, F, CALL); // ghế 1 theo, 2 bỏ, 3 theo -> pot 255 lẻ
  g = play(g, K, K, K, K, K, K);
  eq(g.phase, 'done');
  eq(sum(g.h.result.won), 255);
  eq(g.h.result.won[1] - g.h.result.won[3], 1, 'chip lẻ cho ghế 1 (ngay bên trái nút 0)');
  ok(conserved(g));
});

test('mọi người bỏ thì người còn lại ăn pot, không lật bài', () => {
  let g = table([1000, 1000, 1000, 1000], 2);
  g = play(g, R(60), F, F, F);
  eq(g.phase, 'done');
  ok(g.h.result.uncontested);
  eq(g.h.street, 0);
  eq(g.chips, [980, 1030, 1000, 990]);
});

/* ================= Giải đấu ================= */

test('giải: người chơi hết chip là thua, ăn hết chip là thắng; nút bỏ qua người đã hết chip', () => {
  let g = table([200, 0, 3800, 0], 0);
  rig(g, { 0: '2C 7D', 2: 'AS AH' }, '3D 4S 9C JD KH');
  g = play(g, R(200), CALL);
  ok(E.isOver(g) && !E.won(g), 'thua');
  g = table([3800, 0, 200, 0], 0);
  rig(g, { 0: 'AS AH', 2: '2C 7D' }, '3D 4S 9C JD KH');
  g = play(g, R(3800), CALL);
  ok(E.isOver(g) && E.won(g), 'thắng');
  g = table([1000, 0, 1500, 1500], 0);
  g = play(g, F, F); // ghế 2 (mù nhỏ) và ... ván kết thúc
  const n = E.nextHand(g);
  eq(n.button, 2, 'nút nhảy qua ghế 1 đã hết chip');
  eq(n.h.inHand, [true, false, true, true]);
});

test('started: chưa nói lần nào ở ván đầu thì chưa tính; nói rồi thì tính', () => {
  let g = E.newTournament(5, 'easy');
  while (g.phase === 'bet' && g.h.toAct !== 0) g = E.botAct(g);
  if (g.phase === 'bet') {
    ok(!E.started(g));
    g = E.act(g, E.legal(g).canCheck ? K : F);
  }
  ok(E.started(g));
});

/* ================= Máy ================= */

/** Máy ngẫu nhiên: chọn đều giữa bỏ (khi đang bị cược) / check-theo / tố tối thiểu. */
function randomAct(g, r) {
  const L = E.legal(g);
  const opts = [];
  if (L.canFold) opts.push(F);
  opts.push(L.canCheck ? K : CALL);
  if (L.canRaise) opts.push(R(L.minTo));
  return opts[r.int(opts.length)];
}

/** Một giải 4 máy; levels[s] cho từng ghế ('random' = máy ngẫu nhiên). Trả ghế 0 có thắng không. */
function tourney(levels, seed, check) {
  let g = E.newTournament(seed, 'medium');
  const r = C.rng(seed ^ 0x5bd1e995);
  for (;;) {
    while (g.phase === 'bet') {
      const lv = levels[g.h.toAct];
      let n;
      if (lv === 'random') n = E.act(g, randomAct(g, r));
      else if (check) {
        const ai = C.rng(0);
        ai.setState(g.ai);
        const a = E.decide(g, lv, ai);
        n = E.act(g, a);
        if (!n) throw new Error('máy ' + lv + ' đi sai: ' + JSON.stringify(a) + ' / ' + JSON.stringify(E.legal(g)));
        n.ai = ai.getState();
      } else n = E.botAct(g, lv);
      g = n;
      if (check && !conserved(g)) throw new Error('lệch tổng chip');
    }
    if (E.isOver(g)) return E.won(g);
    g = E.nextHand(g);
  }
}
function rate(levels, n, seed0) {
  let w = 0;
  for (let i = 0; i < n; i++) if (tourney(levels, (seed0 || 1000) + i)) w++;
  return w / n;
}
const pctStr = (x) => Math.round(x * 100) + ' %';

test('máy mọi mức luôn đi nước hợp lệ và giữ nguyên tổng chip (giải hỗn hợp)', () => {
  const mixes = [['easy', 'medium', 'hard', 'random'], ['hard', 'hard', 'easy', 'random'], ['medium', 'random', 'random', 'hard']];
  for (let i = 0; i < 24; i++) tourney(mixes[i % 3], 7000 + i, true);
});

test('máy tất định theo hạt giống của ván', () => {
  const run = () => {
    let g = E.newTournament(99, 'hard');
    for (let k = 0; k < 40 && !E.isOver(g); k++) {
      while (g.phase === 'bet') g = E.botAct(g, 'hard');
      if (!E.isOver(g)) g = E.nextHand(g);
    }
    return E.toJSON(g);
  };
  eq(run(), run());
});

test('mức mạnh dần: Khó / Vừa thắng giải trước 3 máy Dễ nhiều hơn hẳn 25 %, Dễ gần như không thắng 3 máy Khó', () => {
  const hardEasy = rate(['hard', 'easy', 'easy', 'easy'], 150);
  const medEasy = rate(['medium', 'easy', 'easy', 'easy'], 150);
  const easyHard = rate(['easy', 'hard', 'hard', 'hard'], 150);
  const hardMed = rate(['hard', 'medium', 'medium', 'medium'], 120);
  console.log('       Khó vs 3 Dễ ' + pctStr(hardEasy) + ', Vừa vs 3 Dễ ' + pctStr(medEasy) + ', Dễ vs 3 Khó ' + pctStr(easyHard) + ', Khó vs 3 Vừa ' + pctStr(hardMed));
  ok(hardEasy >= 0.42, 'Khó vs Dễ ' + hardEasy);
  ok(medEasy >= 0.32, 'Vừa vs Dễ ' + medEasy);
  ok(hardEasy > medEasy, 'Khó hơn Vừa trước Dễ');
  ok(easyHard <= 0.15, 'Dễ vs Khó ' + easyHard);
  ok(hardMed >= 0.38, 'Khó vs Vừa ' + hardMed);
});

test('Khó thắng máy ngẫu nhiên: giải 4 người và đấu tay đôi', () => {
  const four = rate(['hard', 'random', 'random', 'random'], 150);
  let hu = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    let g = table([2000, 2000, 0, 0], i % 2, { seed: 300 + i });
    const r = C.rng(i * 77 + 1);
    for (;;) {
      while (g.phase === 'bet') g = g.h.toAct === 0 ? E.botAct(g, 'hard') : E.act(g, randomAct(g, r));
      if (E.isOver(g)) break;
      g = E.nextHand(g);
    }
    if (E.won(g)) hu++;
  }
  console.log('       Khó vs 3 ngẫu nhiên ' + pctStr(four) + ', Khó vs 1 ngẫu nhiên (tay đôi) ' + pctStr(hu / N));
  ok(four >= 0.65, 'giải 4 người ' + four);
  ok(hu / N >= 0.78, 'tay đôi ' + hu / N);
});

/* ================= Lưu / khôi phục ================= */

test('lưu rồi khôi phục giữa ván giữ nguyên trạng thái và máy đi tiếp y hệt', () => {
  let g = E.newTournament(321, 'hard');
  let checked = 0;
  for (let step = 0; step < 300 && !E.isOver(g); step++) {
    if (g.phase === 'done') {
      g = E.nextHand(g);
      continue;
    }
    const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
    ok(back, 'khôi phục được ở bước ' + step);
    eq(E.toJSON(back), E.toJSON(g));
    eq(back.h.deck, g.h.deck);
    eq(E.toJSON(E.botAct(back)), E.toJSON(E.botAct(g)));
    checked++;
    g = E.botAct(g);
  }
  ok(checked > 50);
});

test('lưu giữa hai ván: khôi phục rồi chia ván sau như cũ', () => {
  let g = E.newTournament(55, 'easy');
  while (g.phase === 'bet') g = E.botAct(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back.phase, 'done');
  eq(E.toJSON(E.nextHand(back)), E.toJSON(E.nextHand(g)));
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.newTournament(77, 'medium');
  const good = E.toJSON(g);
  const bad = (f) => {
    const x = JSON.parse(JSON.stringify(good));
    f(x);
    return x;
  };
  [
    null, 1, 'x', [], {},
    bad((x) => { x.v = 2; }),
    bad((x) => { x.level = 'expert'; }),
    bad((x) => { x.chips[0] += 10; }), // lệch tổng chip
    bad((x) => { x.chips = [1000, 1000, 1000]; }),
    bad((x) => { x.chips[1] = -5; x.chips[2] += 5; }),
    bad((x) => { x.h.handRng = (x.h.handRng + 1) >>> 0; }), // bộ bài không khớp rng
    bad((x) => { x.rng = 5; }),
    bad((x) => { x.h.toAct = x.h.bbSeat; x.h.acted = [true, true, true, true]; }), // người không còn phải nói
    bad((x) => { x.h.street = 7; }),
    bad((x) => { x.h.log = [{ a: 'hack' }]; }),
    bad((x) => { x.h.log = [{ a: 'call', s: 9 }]; }),
    bad((x) => { x.h.bets[0] = 5000; }),
    bad((x) => { x.phase = 'over'; }),
    bad((x) => { x.profile = [[1, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; }),
    bad((x) => { x.handNo = 0; }),
    bad((x) => { delete x.h; }),
  ].forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
  ok(E.fromJSON(good), 'dữ liệu tốt vẫn nhận');
  // Giữa hai ván mà người chơi đã hết chip (giải đã xong) thì không nhận
  eq(E.fromJSON(Object.assign({}, good, { phase: 'done', h: undefined, chips: [0, 2000, 1000, 1000] })), null);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
