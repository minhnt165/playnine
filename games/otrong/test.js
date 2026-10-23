/* Kiểm tra engine Ô Trống (FreeCell): chạy `node test.js`
 * - Chia bài đúng thuật toán FreeCell cổ điển (ván #1 và #617 khớp từng lá), bỏ ván #11982 khi chọn ngẫu nhiên
 * - Luật: xếp cột giảm dần xen màu, ô trống một lá, đích theo chất từ A, giới hạn chuyển nhiều lá (supermove)
 * - Tự đưa lá an toàn lên đích, hoàn tác không giới hạn, chạm lá tự tìm chỗ, xếp nốt, thắng
 * - Solver giải được một loạt ván trong giới hạn thời gian, chạy từng phần, giải tiếp từ giữa ván
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

function ok(v, msg) {
  if (!v) throw new Error(msg || 'điều kiện sai');
}

/** Lá theo id ('AS', '10H'), sai id thì báo lỗi. */
function c(id) {
  const x = E.fromId(id);
  if (x < 0) throw new Error('id lá sai: ' + id);
  return x;
}

/** Dựng ván tùy ý: cols là mảng các mảng id (dưới lên trên), cells mảng id hoặc null, found theo chất C D H S. */
function mk(cols, cells, found) {
  const pad = cols.concat([[], [], [], [], [], [], [], []]).slice(0, 8);
  return {
    deal: 1,
    cols: pad.map((col) => col.map(c)),
    cells: (cells || [null, null, null, null]).map((x) => (x ? c(x) : -1)),
    found: found || [0, 0, 0, 0],
    hist: [],
  };
}

/** Ván số n dạng chữ, từng hàng 8 lá như các bảng ván FreeCell công khai ('T' = 10). */
function layout(n) {
  const rows = [];
  E.dealOrder(n).forEach((x, i) => {
    if (i % 8 === 0) rows.push([]);
    rows[rows.length - 1].push(E.toId(x).replace('10', 'T'));
  });
  return rows.map((r) => r.join(' '));
}

/** Đi lần lượt các nước bằng move (đúng luật, không tự lên đích); nước sai luật thì báo lỗi. */
function replay(s, moves) {
  return moves.reduce((x, m, i) => {
    const y = E.move(x, m);
    if (!y) throw new Error('nước sai luật #' + i + ': ' + JSON.stringify(m));
    return y;
  }, s);
}

/** Tổng số lá trên bàn (cột + ô trống + đích) và không lá nào trùng. */
function conserved(s) {
  const seen = new Set();
  s.cols.forEach((col) => col.forEach((x) => seen.add(x)));
  s.cells.forEach((x) => { if (x >= 0) seen.add(x); });
  s.found.forEach((r, suit) => { for (let k = 1; k <= r; k++) seen.add((k - 1) * 4 + suit); });
  const n = s.cols.reduce((k, col) => k + col.length, 0) + s.cells.filter((x) => x >= 0).length + E.foundCount(s);
  return seen.size === 52 && n === 52;
}

/** PRNG nhỏ để đi bừa có lặp lại được (chỉ dùng trong test). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Chia bài ---------------- */

test('ván #1 khớp từng lá với bảng ván FreeCell cổ điển', () => {
  eq(layout(1), [
    'JD 2D 9H JC 5D 7H 7C 5H',
    'KD KC 9S 5S AD QC KH 3H',
    '2S KS 9D QD JS AS AH 3C',
    '4C 5C TS QH 4H AC 4D 7S',
    '3S TD 4S TH 8H 2C JH 7D',
    '6D 8S 8D QS 6C 3D 8C TC',
    '6S 9C 2H 6H',
  ]);
});

test('ván #617 khớp từng lá với bảng ván FreeCell cổ điển', () => {
  eq(layout(617), [
    '7D AD 5C 3S 5S 8C 2D AH',
    'TD 7S QD AC 6D 8H AS KH',
    'TH QC 3H 9D 6S 8D 3D TC',
    'KD 5H 9S 3C 8S 7H 4D JS',
    '4C QS 9C 9H 7C 6H 2C 2S',
    '4S TS 2H 5D JC 6C JH QH',
    'JD KS KC 4H',
  ]);
});

test('ván mới: 8 cột 7,7,7,7,6,6,6,6 lá, ô trống và đích trống, đủ 52 lá', () => {
  const s = E.newGame(1);
  eq(s.cols.map((col) => col.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  eq(s.cells, [-1, -1, -1, -1]);
  eq(s.found, [0, 0, 0, 0]);
  ok(conserved(s), 'thiếu / trùng lá');
  eq(E.toId(s.cols[0][0]), 'JD');
  eq(E.toId(s.cols[7][5]), '10C');
});

test('số ván ngoài 1..32000 bị từ chối', () => {
  [0, -1, 32001, 1.5, '5', null].forEach((n) => {
    let threw = false;
    try { E.newGame(n); } catch (e) { threw = true; }
    ok(threw, 'nhận ván ' + n);
  });
});

test('ván ngẫu nhiên nằm trong 1..32000 và bỏ ván #11982 không giải được', () => {
  // rand trả đúng giá trị để ra ván 11982 trước, rồi ra ván 7
  const vals = [(11982 - 1 + 0.5) / 32000, (7 - 1 + 0.5) / 32000];
  let i = 0;
  eq(E.randomDeal(() => vals[i++]), 7);
  const r = rng(3);
  for (let k = 0; k < 2000; k++) {
    const n = E.randomDeal(r);
    ok(n >= 1 && n <= 32000 && n !== 11982, 'ván ' + n);
  }
});

test('đổi lá: số <-> id của bộ bài chung', () => {
  eq([E.toId(0), E.toId(1), E.toId(2), E.toId(3), E.toId(51)], ['AC', 'AD', 'AH', 'AS', 'KS']);
  eq(E.fromId('10H'), 9 * 4 + 2);
  eq(E.toCard(c('QD')), { rank: 12, suit: 'D' });
  eq([E.fromId('TH'), E.fromId('ah'), E.fromId('1S'), E.fromId(null)], [-1, -1, -1, -1]);
});

/* ---------------- Luật ---------------- */

test('cột: đặt lá nhỏ hơn 1 bậc, khác màu; cùng màu hay sai bậc thì không', () => {
  const s = mk([['9S'], ['8H'], ['8C'], ['7D']]);
  ok(E.canMove(s, { f: 't1', t: 't0', n: 1 }), '8♥ lên 9♠');
  ok(!E.canMove(s, { f: 't2', t: 't0', n: 1 }), '8♣ lên 9♠ cùng màu');
  ok(!E.canMove(s, { f: 't3', t: 't0', n: 1 }), '7♦ lên 9♠ sai bậc');
  ok(!E.canMove(s, { f: 't0', t: 't0', n: 1 }), 'cùng cột');
  ok(!E.canMove(s, { f: 't4', t: 't0', n: 1 }), 'cột trống không có lá để đi');
});

test('ô trống: mỗi ô một lá, ô trống sang ô trống không được', () => {
  const s = mk([['9S', '8H']], ['KD', null, null, null]);
  ok(!E.canMove(s, { f: 't0', t: 'c0', n: 1 }), 'ô đã có lá');
  ok(E.canMove(s, { f: 't0', t: 'c1', n: 1 }), 'ô trống nhận lá');
  ok(!E.canMove(s, { f: 't0', t: 'c1', n: 2 }), 'ô trống chỉ nhận một lá');
  ok(!E.canMove(s, { f: 'c0', t: 'c1', n: 1 }), 'ô sang ô');
  ok(E.canMove(s, { f: 'c0', t: 't1', n: 1 }), 'ô xuống cột trống');
});

test('đích: theo chất, từ A lên K; không lấy lá từ đích xuống', () => {
  const s = mk([['2H'], ['AH'], ['AS']], null, [0, 0, 0, 0]);
  ok(!E.canMove(s, { f: 't0', t: 'f2', n: 1 }), '2♥ khi chưa có A♥');
  ok(!E.canMove(s, { f: 't1', t: 'f3', n: 1 }), 'A♥ lên đích bích');
  ok(E.canMove(s, { f: 't1', t: 'f2', n: 1 }), 'A♥ lên đích cơ');
  const x = E.move(s, { f: 't1', t: 'f2', n: 1 });
  eq(x.found, [0, 0, 1, 0]);
  ok(E.canMove(x, { f: 't0', t: 'f2', n: 1 }), '2♥ sau A♥');
  ok(!E.canMove(x, { f: 'f2', t: 't1', n: 1 }), 'lấy lá từ đích');
  eq(E.pile(x, 'f2').map(E.toId), ['AH']);
});

test('chỉ chuyển được dãy giảm dần xen màu ở trên cùng cột', () => {
  const s = mk([['10S', '9H', '8C', '7D'], ['5S', '9D', '8S', '7H'], ['8D'], ['8H', '10C']], [null, null, null, null]);
  eq(E.runLength(s.cols[0]), 4);
  eq(E.runLength(s.cols[1]), 3);
  ok(!E.canMove(s, { f: 't0', t: 't2', n: 1 }), '7♦ lên 8♦ cùng màu');
  ok(!E.canMove(s, { f: 't1', t: 't3', n: 4 }), 'dãy bị gãy ở 5♠');
  ok(E.canMove(s, { f: 't0', t: 't4', n: 3 }), 'dãy 9♥ 8♣ 7♦ xuống cột trống');
});

test('giới hạn chuyển nhiều lá: (ô trống + 1) × 2^(cột trống), vào cột trống thì cột đó không tính', () => {
  // cột 0: dãy 7 lá K♦ Q♠ J♥ 10♠ 9♥ 8♠ 7♥; cột 1 K♥ nhận 6 lá (từ Q♠), cột 2 10♣ nhận 3 lá (từ 9♥)
  const run = ['KD', 'QS', 'JH', '10S', '9H', '8S', '7H'];
  const base = (cells, empties) => {
    const cols = [run.slice(), ['KH'], ['10C'], ['5D'], ['4D'], ['4H'], ['3D'], ['3H']];
    for (let i = 0; i < empties; i++) cols[7 - i] = [];
    return mk(cols, cells);
  };
  const full = ['2C', '2D', '2H', '2S'];
  // không ô trống, không cột trống: 1 lá
  let s = base(full, 0);
  eq(E.runLength(s.cols[0]), 7);
  eq(E.maxMove(s, false), 1);
  ok(!E.canMove(s, { f: 't0', t: 't2', n: 3 }), '3 lá khi chỉ được 1');
  // 2 ô trống, không cột trống: 3 lá
  s = base(['2C', '2D', null, null], 0);
  eq(E.maxMove(s, false), 3);
  ok(E.canMove(s, { f: 't0', t: 't2', n: 3 }), '3 lá 9♥ 8♠ 7♥ lên 10♣');
  ok(!E.canMove(s, { f: 't0', t: 't1', n: 6 }), '6 lá khi chỉ được 3');
  // 4 ô trống, 1 cột trống: 10 lá; vào cột trống: 5 lá
  s = base([null, null, null, null], 1);
  eq([E.maxMove(s, false), E.maxMove(s, true)], [10, 5]);
  ok(E.canMove(s, { f: 't0', t: 't1', n: 6 }), '6 lá lên K♥');
  ok(E.canMove(s, { f: 't0', t: 't7', n: 5 }), '5 lá vào cột trống');
  ok(!E.canMove(s, { f: 't0', t: 't7', n: 6 }), '6 lá vào cột trống là quá');
  // 1 ô trống, 2 cột trống: 8 lá sang cột có lá, 4 lá vào cột trống
  s = base(['2C', '2D', '2H', null], 2);
  eq([E.maxMove(s, false), E.maxMove(s, true)], [8, 4]);
  ok(E.canMove(s, { f: 't0', t: 't1', n: 6 }), '6 lá lên K♥');
  ok(E.canMove(s, { f: 't0', t: 't6', n: 4 }), '4 lá vào cột trống');
  ok(!E.canMove(s, { f: 't0', t: 't6', n: 5 }), '5 lá vào cột trống là quá');
  // không ô trống, 1 cột trống: 2 lá sang cột có lá, 1 lá vào cột trống
  s = base(full, 1);
  eq([E.maxMove(s, false), E.maxMove(s, true)], [2, 1]);
  ok(!E.canMove(s, { f: 't0', t: 't2', n: 3 }), '3 lá khi chỉ được 2');
  ok(E.canMove(s, { f: 't0', t: 't7', n: 1 }), '1 lá vào cột trống');
  ok(!E.canMove(s, { f: 't0', t: 't7', n: 2 }), '2 lá vào cột trống là quá');
});

test('lá an toàn: A, 2 luôn an toàn; lá khác khi hai chất khác màu đã lên tới bậc dưới', () => {
  const s = mk([['3H']], null, [1, 0, 2, 2]); // ♣ A, ♥ A2, ♠ A2
  ok(!E.isSafe(s, c('3H')), '3♥ khi 2♣ chưa lên');
  ok(E.isSafe(mk([['3H']], null, [2, 0, 2, 1]), c('3H')) === false, '3♥ khi 2♠ chưa lên');
  ok(E.isSafe(mk([['3H']], null, [2, 0, 2, 2]), c('3H')), '3♥ khi 2♣ 2♠ đã lên');
  ok(E.isSafe(s, c('AD')) === true, 'A♦ luôn an toàn');
  ok(E.isSafe(mk([], null, [1, 1, 0, 0]), c('2C')), '2♣ luôn an toàn');
  ok(!E.isSafe(s, c('5H')), 'chưa tới lượt');
});

test('tự đưa lá an toàn lên đích, giữ lại lá còn cần', () => {
  const a = E.autoMoves(mk([['AC', 'AS'], ['2S', 'AH'], ['3H', '2C']], null));
  eq(a.state.found, [2, 0, 1, 2]);
  eq(a.moves.length, 5);
  // A♣ A♠ đã lên: A♥ 2♥ lên được, 3♥ phải chờ 2♣ 2♠ (còn có thể cần để đỡ 2 đen)
  const b = E.autoMoves(mk([['3H', '2H', 'AH']], null, [1, 0, 0, 1]));
  eq(b.state.found, [1, 0, 2, 1]);
  eq(b.state.cols[0].map(E.toId), ['3H']);
});

test('play: nước sai luật trả null, nước đúng kèm tự lên đích và ghi một nhóm', () => {
  const s0 = E.newGame(1);
  ok(E.play(s0, { f: 't0', t: 't1', n: 1 }) === null, '6♠ lên 6♥');
  // ván #1: 6♥ (cột 3, trên cùng) xuống ô trống
  const s1 = E.play(s0, { f: 't3', t: 'c0', n: 1 });
  eq(s1.hist.length, 1);
  eq(E.toId(s1.cells[0]), '6H');
  ok(conserved(s1));
  ok(s0.cells[0] === -1, 'ván cũ không bị đổi');
});

test('hoàn tác không giới hạn: trả đúng ván trước, kể cả nước tự lên đích', () => {
  const s0 = E.newGame(1);
  const moves = E.solve(s0).slice(0, 40);
  let s = s0;
  const states = [s];
  moves.forEach((m) => {
    s = E.play(s, m, { auto: false });
    states.push(s);
  });
  for (let i = states.length - 1; i > 0; i--) {
    s = E.undo(s);
    eq([s.cols, s.cells, s.found, s.hist.length], [states[i - 1].cols, states[i - 1].cells, states[i - 1].found, i - 1], 'bước ' + i);
  }
  eq(E.undo(s), s, 'hết lịch sử thì không đổi');
  // một nhóm có nước tự lên đích: hoàn tác một lần là về trước nước của người chơi
  const t0 = mk([['5D', 'AS'], ['3C', 'AH']], null);
  const t1 = E.play(t0, { f: 't0', t: 'c0', n: 1 });
  ok(t1.hist[0].length >= 2, 'có nước tự lên đích');
  const back = E.undo(t1);
  eq([back.cols, back.cells, back.found], [t0.cols, t0.cells, t0.found]);
});

test('chạm lá: ưu tiên đích, rồi cột có lá, rồi cột trống, rồi ô trống', () => {
  const s = mk([['KS', 'AD'], ['9C', '8H'], ['9H'], [], ['4S', '7C']], null);
  eq(E.tapTarget(s, 't0', 1), { f: 't0', t: 'f1', n: 1 });
  eq(E.tapTarget(s, 't1', 1), { f: 't1', t: 't3', n: 1 });
  eq(E.tapTarget(s, 't4', 1), { f: 't4', t: 't1', n: 1 }, '7♣ lên 8♥');
  eq(E.tapTarget(mk([['KS', '5H'], ['9C', '8H'], ['9H'], ['2S'], ['4S', '7C'], ['3D'], ['3C'], ['2D']], null), 't0', 1), { f: 't0', t: 'c0', n: 1 });
  eq(E.tapTarget(s, 't1', 2), null, 'cả cột 9♣ 8♥ không sang cột trống');
  eq(E.tapTarget(mk([['KS'], ['5D', '9C', '8H'], ['9H']]), 't1', 2), { f: 't1', t: 't3', n: 2 }, '9♣ 8♥ xuống cột trống');
  eq(E.tapTarget(s, 't2', 1), { f: 't2', t: 'c0', n: 1 }, 'cả cột 9♥ không sang cột trống mà vào ô trống');
  eq(E.tapTarget(mk([['KS'], ['9C'], ['8D']], ['2C', null, null, null]), 'c0', 1), { f: 'c0', t: 't3', n: 1 }, 'ô trống xuống cột trống');
});

test('chạm lá không có chỗ: trả null', () => {
  const full = ['2C', '2D', '2H', '2S'];
  const s = mk([['KS', '5H'], ['9C'], ['9D'], ['2S'], ['4S'], ['3S'], ['3C'], ['10D']], full);
  eq(E.tapTarget(s, 't0', 1), null);
  eq(E.tapTarget(s, 'f0', 1), null);
});

test('xếp nốt: cột đã giảm dần thì đưa hết lên đích và thắng', () => {
  const s = mk([['KS', 'QS', 'JS'], ['KH', 'QH', 'JH', '10H'], ['KD', 'QD', 'JD'], ['KC', 'QC', 'JC']], ['10S', '10D', null, '10C'], [9, 9, 9, 9]);
  ok(E.canFinish(s));
  const moves = E.finishMoves(s);
  const w = E.playGroup(s, moves);
  ok(E.isWon(w), 'chưa thắng');
  eq(w.hist.length, 1, 'một nhóm');
  ok(!E.canFinish(w), 'đã thắng thì không xếp nốt');
  ok(!E.canFinish(E.newGame(1)), 'ván mới chưa xếp nốt được');
});

test('legalMoves chỉ gồm nước hợp luật, ván mới có nước đi', () => {
  for (let d = 1; d <= 30; d++) {
    const s = E.newGame(d);
    const ms = E.legalMoves(s);
    ok(ms.length > 0, 'ván ' + d + ' không có nước');
    ms.forEach((m) => ok(E.canMove(s, m), 'ván ' + d + ' nước sai ' + JSON.stringify(m)));
  }
});

test('đi bừa rồi hoàn tác: luôn đủ 52 lá, về đúng ván đầu', () => {
  const r = rng(11);
  for (let d = 1; d <= 20; d++) {
    const s0 = E.newGame(d);
    let s = s0;
    for (let k = 0; k < 60; k++) {
      const ms = E.legalMoves(s);
      if (!ms.length) break;
      s = E.play(s, ms[Math.floor(r() * ms.length)]);
      ok(conserved(s), 'ván ' + d + ' bước ' + k);
    }
    while (s.hist.length) s = E.undo(s);
    eq([s.cols, s.cells, s.found], [s0.cols, s0.cells, s0.found], 'ván ' + d);
  }
});

/* ---------------- Solver ---------------- */

test('solver giải 40 ván (1..30, 617, 1941, 6240, 31112…) trong giới hạn thời gian, lời giải đúng luật', () => {
  const deals = [];
  for (let d = 1; d <= 30; d++) deals.push(d);
  deals.push(617, 1941, 5979, 6240, 11987, 25904, 31112, 31465, 32000, 1234);
  const t0 = Date.now();
  let worst = 0;
  deals.forEach((d) => {
    const t1 = Date.now();
    const moves = E.solve(E.newGame(d));
    worst = Math.max(worst, Date.now() - t1);
    ok(moves, 'không giải được ván ' + d);
    ok(E.isWon(replay(E.newGame(d), moves)), 'ván ' + d + ' chưa thắng');
  });
  const total = Date.now() - t0;
  console.log('       (' + deals.length + ' ván, tổng ' + total + ' ms, chậm nhất ' + worst + ' ms)');
  ok(total < 30000, 'tổng ' + total + ' ms');
  ok(worst < 8000, 'chậm nhất ' + worst + ' ms');
});

test('solver chạy từng phần: mỗi bước mở không quá số nút cho phép', () => {
  const sv = E.createSolver(E.newGame(617));
  let r;
  let steps = 0;
  let last = 0;
  do {
    r = sv.step(200);
    ok(r.nodes - last <= 200, 'bước mở ' + (r.nodes - last) + ' nút');
    last = r.nodes;
    steps++;
  } while (!r.done);
  ok(steps > 1, 'xong ngay một bước');
  ok(r.moves && E.isWon(replay(E.newGame(617), r.moves)), 'lời giải sai');
  eq(sv.step(200).done, true, 'gọi lại sau khi xong');
});

test('gợi ý giữa ván: solver giải tiếp từ thế cờ đang dở (kể cả khi đã đi bừa vài nước)', () => {
  const r = rng(5);
  [3, 8, 21].forEach((d) => {
    let s = E.newGame(d);
    for (let k = 0; k < 6; k++) {
      const ms = E.legalMoves(s).filter((m) => m.t[0] !== 'c');
      if (!ms.length) break;
      s = E.play(s, ms[Math.floor(r() * ms.length)]);
    }
    const moves = E.solve(s);
    ok(moves, 'ván ' + d + ' bó tay');
    ok(E.isWon(replay(s, moves)), 'ván ' + d + ' lời giải sai');
  });
});

test('ván đã thắng: solver trả lời giải rỗng', () => {
  const s = mk([], null, [13, 13, 13, 13]);
  eq(E.solve(s), []);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván và lịch sử hoàn tác', () => {
  let s = E.newGame(1);
  const moves = E.solve(s);
  for (let i = 0; i < 30; i++) s = E.play(s, moves[i], { auto: false });
  s = E.play(s, moves[30]); // nhóm có tự lên đích (nếu có)
  const raw = JSON.parse(JSON.stringify(E.toJSON(s)));
  const back = E.fromJSON(raw);
  eq([back.deal, back.cols, back.cells, back.found, back.hist], [s.deal, s.cols, s.cells, s.found, s.hist]);
  eq(E.undo(back).cols, E.undo(s).cols);
  eq(E.fromJSON(E.toJSON(E.newGame(32000))).deal, 32000);
});

test('khôi phục ván đã thắng (lời giải đầy đủ) cho đúng trạng thái thắng', () => {
  const s0 = E.newGame(2);
  const w = E.solve(s0).reduce((s, m) => E.play(s, m, { auto: false }), s0);
  ok(E.isWon(E.fromJSON(E.toJSON(w))));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.play(E.newGame(1), { f: 't3', t: 'c0', n: 1 }));
  ok(E.fromJSON(good), 'ván tốt bị từ chối');
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { deal: 0 }),
    Object.assign({}, good, { deal: 32001 }),
    Object.assign({}, good, { deal: 1.5 }),
    Object.assign({}, good, { deal: '1' }),
    Object.assign({}, good, { hist: 'x' }),
    Object.assign({}, good, { hist: [[]] }),
    Object.assign({}, good, { hist: ['t3c01'] }),
    Object.assign({}, good, { hist: [['t3c0']] }),
    Object.assign({}, good, { hist: [['t9c01']] }),
    Object.assign({}, good, { hist: [['t3c41']] }),
    Object.assign({}, good, { hist: [[{ f: 't3', t: 'c0', n: 1 }]] }),
    Object.assign({}, good, { hist: [['t0f01']] }), // 6♠ không lên đích được
    Object.assign({}, good, { hist: [['t3c01'], ['t3c01']] }), // ô 0 đã có lá
    Object.assign({}, good, { hist: [['t0t13']] }), // không phải dãy
    Object.assign({}, good, { hist: new Array(5000).fill(['t3c01']) }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

test('ván lưu dựng sẵn của e2e.spec.ts hợp lệ: ván #1, xếp nốt được rồi thắng', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'e2e.spec.ts'), 'utf8');
  const block = /const DEAL1_NEAR_WIN = \[([\s\S]*?)\];/.exec(src);
  ok(block, 'không thấy DEAL1_NEAR_WIN');
  const hist = block[1].match(/'[^']+'/g).map((x) => [x.slice(1, -1)]);
  const s = E.fromJSON({ v: E.VERSION, deal: 1, hist });
  ok(s, 'ván lưu bị từ chối');
  ok(E.canFinish(s), 'chưa xếp nốt được');
  ok(E.isWon(E.playGroup(s, E.finishMoves(s))), 'xếp nốt không thắng');
  ok(E.solve(s), 'gợi ý không giải được');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
