/* Kiểm tra engine Kim Tự Tháp: chạy `node test.js`
 * - Kim tự tháp 7 hàng: lá bị đè / lá chơi được, cặp tổng 13 (K bỏ một mình), lá trên cùng của chồng rút và chồng bỏ
 * - Rút lá, quay vòng chồng bỏ tối đa 2 lần (3 lượt), thắng khi dọn hết tháp, thua khi hết nước và hết lượt
 * - Hoàn tác (3 lần mỗi ván), gợi ý đánh dấu ván có trợ giúp
 * - Bộ giải: chứng minh được ván dựng sẵn giải được / không giải được, tôn trọng giới hạn lượt,
 *   lời giải đi lại đúng luật engine; ván chia theo seed luôn giải được
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
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

/* ---------------- Dựng ván ---------------- */

const SUITS = ['S', 'H', 'D', 'C'];
/** Đổi danh sách bậc (52 số) thành 52 id khác nhau: mỗi bậc lấy lần lượt bích, cơ, rô, nhép. */
function idsFromRanks(ranks) {
  const used = {};
  return ranks.map((r) => {
    used[r] = (used[r] || 0) + 1;
    if (used[r] > 4) throw new Error('bậc ' + r + ' quá 4 lá');
    return C.toId({ rank: r, suit: SUITS[used[r] - 1] });
  });
}

/**
 * Ván dễ dựng sẵn: 4 lá K ở 4 ô trên cùng (0..3), 24 ô còn lại (4..27) mỗi bậc 1..12 hai lá;
 * chồng rút gồm lá bù 13 của các lá tháp theo thứ tự gỡ 27, 26, …, 4.
 * Lời giải: ghép lá tháp với lá trên cùng chồng rút 24 lần rồi bỏ 4 lá K (28 nước, không cần rút lá).
 */
function easyRanks() {
  const pyr = new Array(28);
  for (let p = 0; p < 4; p++) pyr[p] = 13;
  const twoEach = [];
  for (let r = 1; r <= 12; r++) twoEach.push(r, r);
  // Xếp xen kẽ để hàng dưới không toàn lá giống nhau (7 và 24 nguyên tố cùng nhau)
  for (let p = 4; p < 28; p++) pyr[p] = twoEach[(p * 7) % 24];
  const talon = [];
  for (let p = 27; p >= 4; p--) talon.push(13 - pyr[p]);
  return pyr.concat(talon);
}
const EASY = idsFromRanks(easyRanks());

/** Áp một nước của bộ giải vào ván bằng hàm của engine (để kiểm lời giải đúng luật). */
function apply(g, m) {
  let n = g;
  if (m.type === 'draw') n = E.draw(g);
  else if (m.type === 'recycle') n = E.recycle(g);
  else if (m.type === 'pair') n = E.remove(g, m.a, m.b);
  if (n === g) throw new Error('nước không hợp lệ: ' + JSON.stringify(m));
  return n;
}
function replay(g, moves) {
  return moves.reduce(apply, g);
}

/** Đặt tháp / chồng rút / chồng bỏ tùy ý (dùng cho test luật, không cần đủ 52 lá). */
function custom(pyramid, stock, waste, extra) {
  return Object.assign({ seed: 1, pyramid, stock: stock || [], waste: waste || [], recycles: 0, moves: 0, undoLeft: E.UNDO_LIMIT, assisted: false, history: [] }, extra || {});
}
const emptyPyr = () => new Array(28).fill(null);

/* ---------------- Hình kim tự tháp ---------------- */

test('tháp 7 hàng, 28 ô: hàng / cột, hai lá đè lên mỗi ô và vùng đè', () => {
  eq(E.PYRAMID, 28);
  eq(E.rowCol(0), [0, 0]);
  eq(E.rowCol(1), [1, 0]);
  eq(E.rowCol(2), [1, 1]);
  eq(E.rowCol(27), [6, 6]);
  eq(E.covers(0), [1, 2]);
  eq(E.covers(4), [7, 8]);
  eq(E.covers(21), []);
  eq(E.cone(0).length, 27);
  eq(E.cone(15), [21, 22]);
  eq(E.cone(27), []);
});

test('chia ván từ bộ bài: 28 lá đầu lên tháp, 24 lá sau thành chồng rút (lá 29 nằm trên cùng)', () => {
  const g = E.fromDeck(EASY, 5);
  eq(g.pyramid, EASY.slice(0, 28));
  eq(g.stock.length, 24);
  eq(g.stock[g.stock.length - 1], EASY[28]);
  eq([g.waste, g.recycles, g.moves, g.undoLeft, g.assisted, g.seed], [[], 0, 0, 3, false, 5]);
});

test('lá chơi được: hàng dưới cùng, lá không còn lá nào đè, và lá trên cùng của chồng rút / chồng bỏ', () => {
  const g = E.fromDeck(EASY, 1);
  eq(E.available(g).filter((p) => typeof p === 'number'), [21, 22, 23, 24, 25, 26, 27]);
  ok(E.isAvailable(g, 'stock'));
  ok(!E.isAvailable(g, 'waste'), 'chồng bỏ trống');
  ok(!E.isAvailable(g, 0));
  ok(!E.isAvailable(g, 99));
  // Gỡ ô 27 thì ô 20 vẫn bị ô 26 đè; gỡ thêm ô 26 thì ô 20 lộ ra
  const p = g.pyramid.slice();
  p[27] = null;
  ok(!E.isAvailable(custom(p), 20));
  p[26] = null;
  ok(E.isAvailable(custom(p), 20));
  ok(!E.isAvailable(custom(p), 27), 'ô đã gỡ không chơi được');
});

/* ---------------- Ghép cặp ---------------- */

test('ghép hai lá tổng 13 thì bỏ cả hai; J=11, Q=12, A=1', () => {
  const p = emptyPyr();
  p[21] = 'QS'; p[22] = 'AH'; p[23] = 'JD'; p[24] = '2C'; p[25] = '6S'; p[26] = '7H';
  let g = custom(p);
  ok(E.canPair(g, 21, 22));
  ok(E.canPair(g, 23, 24));
  ok(E.canPair(g, 25, 26));
  ok(!E.canPair(g, 21, 24), 'Q + 2 = 14');
  g = E.remove(g, 21, 22);
  eq([g.pyramid[21], g.pyramid[22], g.moves], [null, null, 1]);
  g = E.remove(g, 26, 25);
  eq([g.pyramid[25], g.pyramid[26], g.moves], [null, null, 2]);
});

test('K bỏ một mình; K không ghép với lá khác; lá khác K không bỏ một mình được', () => {
  const p = emptyPyr();
  p[21] = 'KS'; p[22] = 'AH';
  let g = custom(p, ['KH']);
  ok(E.canRemove(g, 21));
  ok(!E.canRemove(g, 22));
  ok(!E.canPair(g, 21, 22));
  eq(E.remove(g, 22), g, 'A một mình');
  g = E.remove(g, 21);
  eq(g.pyramid[21], null);
  g = E.remove(g, 'stock');
  eq(g.stock, []);
});

test('nước sai trả lại đúng ván cũ: lá bị đè, cùng một lá, tổng khác 13, ô trống', () => {
  const g = E.fromDeck(EASY, 1);
  eq(E.remove(g, 14, 27), g, 'ô 14 bị đè');
  eq(E.remove(g, 27, 27), g);
  eq(E.remove(g, 'waste', 27), g, 'chồng bỏ trống');
  const p = emptyPyr();
  p[21] = '5S'; p[22] = '9H';
  const h = custom(p);
  eq(E.remove(h, 21, 22), h);
  eq(E.remove(h, 21, 23), h);
});

test('ghép với lá trên cùng của chồng rút, chồng bỏ, và chồng rút với chồng bỏ', () => {
  const p = emptyPyr();
  p[21] = '4S'; p[22] = '3H';
  let g = custom(p, ['9D', '10C'], ['8C', '9H']);
  ok(E.canPair(g, 'waste', 21)); // 9 + 4
  ok(E.canPair(g, 22, 'stock')); // 3 + 10
  ok(!E.canPair(g, 'stock', 'waste')); // 10 + 9
  g = E.remove(g, 'waste', 21);
  eq([g.waste, g.pyramid[21]], [['8C'], null]);
  g = E.remove(g, 'stock', 22);
  eq(g.stock, ['9D']);
  // Lá trên cùng của hai chồng ghép với nhau: 5 + 8
  const q = emptyPyr();
  q[21] = 'QS';
  const h = custom(q, ['5D'], ['8C']);
  ok(E.canPair(h, 'stock', 'waste'));
  eq(E.remove(h, 'stock', 'waste').stock, []);
});

/* ---------------- Rút lá và quay vòng ---------------- */

test('rút lá: lá trên cùng chồng rút sang chồng bỏ', () => {
  let g = E.fromDeck(EASY, 1);
  const top = g.stock[g.stock.length - 1];
  g = E.draw(g);
  eq([g.stock.length, g.waste, g.moves], [23, [top], 1]);
  ok(E.isAvailable(g, 'waste'));
});

test('chồng rút hết thì quay vòng chồng bỏ (giữ thứ tự rút), tối đa 2 lần = 3 lượt', () => {
  let g = custom(emptyPyr(), ['3C', '2C', 'AC']);
  g.pyramid[21] = 'QS';
  ok(E.canDraw(g));
  ok(!E.canRecycle(g), 'còn lá trong chồng rút');
  eq(E.recycle(g), g);
  eq([E.pass(g), E.passesLeft(g)], [1, 2]);
  g = E.draw(E.draw(E.draw(g)));
  eq([g.stock, g.waste], [[], ['AC', '2C', '3C']]);
  eq(E.draw(g), g, 'hết lá để rút');
  ok(E.canRecycle(g));
  g = E.recycle(g);
  eq([g.stock, g.waste, g.recycles, E.pass(g)], [['3C', '2C', 'AC'], [], 1, 2]);
  g = E.recycle(E.draw(E.draw(E.draw(g))));
  eq([g.recycles, E.pass(g), E.passesLeft(g)], [2, 3, 0]);
  g = E.draw(E.draw(E.draw(g)));
  ok(!E.canRecycle(g), 'đã quay vòng 2 lần');
  eq(E.recycle(g), g);
});

test('chồng bỏ trống thì không quay vòng', () => {
  const g = custom(emptyPyr(), [], []);
  g.pyramid[21] = 'QS';
  ok(!E.canRecycle(g));
});

/* ---------------- Thắng / thua ---------------- */

test('thắng khi dọn hết tháp (chồng rút còn lá cũng được)', () => {
  const p = emptyPyr();
  p[0] = 'QH';
  let g = custom(p, ['5S'], ['AS'], { moves: 3 });
  ok(!E.isWon(g));
  g = E.remove(g, 0, 'waste');
  ok(E.isWon(g));
  ok(E.isOver(g));
  ok(!E.isStuck(g));
  eq(E.draw(g), g, 'ván xong không đi tiếp');
});

test('thua khi hết nước: không còn cặp, chồng rút hết, hết lượt quay vòng', () => {
  const p = emptyPyr();
  p[0] = 'QH'; p[1] = 'AS'; // A đè lên Q: không bao giờ ghép được
  let g = custom(p, ['KS'], []);
  ok(!E.isStuck(g), 'còn K ở chồng rút');
  g = E.remove(g, 'stock');
  ok(E.isStuck(g));
  ok(E.isOver(g));
  ok(!E.isWon(g));
  // Còn lượt quay vòng thì chưa thua; hết lượt thì thua
  ok(!E.isStuck(custom(p, [], ['5C'], { recycles: 1 })));
  ok(E.isStuck(custom(p, [], ['5C'], { recycles: 2 })));
  // Còn lá để rút thì chưa thua
  ok(!E.isStuck(custom(p, ['5C'], [], { recycles: 2 })));
});

test('removals: liệt kê các nước bỏ lá đang có', () => {
  const g = E.fromDeck(EASY, 1);
  ok(E.removals(g).length > 0);
  eq(E.removals(custom(emptyPyr())), []);
  const p = emptyPyr();
  p[21] = 'KS'; p[22] = '6H'; p[23] = '7D';
  eq(E.removals(custom(p)), [{ type: 'pair', a: 21 }, { type: 'pair', a: 22, b: 23 }]);
});

/* ---------------- Hoàn tác ---------------- */

test('hoàn tác 3 lần mỗi ván, trả đúng trạng thái trước nước đi', () => {
  const g0 = E.fromDeck(EASY, 1);
  const g1 = E.draw(g0);
  const g2 = E.draw(g1);
  const g3 = E.remove(g2, 26, 'waste');
  ok(g3 !== g2, 'ô 26 ghép với lá trên cùng chồng bỏ');
  const g4 = E.draw(g3);
  ok(E.canUndo(g4));
  let u = E.undo(g4);
  eq([u.pyramid, u.stock, u.waste, u.recycles, u.undoLeft], [g3.pyramid, g3.stock, g3.waste, g3.recycles, 2]);
  u = E.undo(E.undo(u));
  eq([u.pyramid, u.stock, u.waste, u.undoLeft], [g1.pyramid, g1.stock, g1.waste, 0]);
  ok(!E.canUndo(u));
  eq(E.undo(u), u, 'hết lượt hoàn tác');
  eq(u.moves, 4, 'hoàn tác không xóa số nước đã đi');
});

test('hoàn tác: chưa đi nước nào thì không hoàn tác; quay vòng cũng hoàn tác được', () => {
  const g0 = custom(emptyPyr(), [], ['AC', '2C'], { recycles: 1 });
  g0.pyramid[21] = 'QS';
  ok(!E.canUndo(g0));
  const u = E.undo(E.recycle(g0));
  eq([u.stock, u.waste, u.recycles], [[], ['AC', '2C'], 1]);
});

test('không hoàn tác sau khi ván đã xong', () => {
  const p = emptyPyr();
  p[0] = 'KH';
  const g = E.remove(custom(p), 0);
  ok(E.isWon(g));
  ok(!E.canUndo(g));
  eq(E.undo(g), g);
});

/* ---------------- Gợi ý ---------------- */

test('gợi ý: chỉ nước đầu của lời giải; markAssisted đánh dấu ván có trợ giúp', () => {
  const g = E.fromDeck(EASY, 1);
  const h = E.hint(g);
  eq(h.solvable, true);
  eq(h.move.type, 'pair');
  ok(E.remove(g, h.move.a, h.move.b) !== g, 'nước gợi ý hợp lệ');
  ok(!g.assisted);
  ok(E.markAssisted(g).assisted);
  eq(E.markAssisted(g).moves, g.moves);
});

test('gợi ý khi hết đường thắng: báo không giải được, vẫn trả về một nước đi được', () => {
  const p = emptyPyr();
  p[0] = 'QH'; p[1] = 'AS'; p[2] = '7C';
  const d = E.hint(custom(p, ['6D'], []));
  eq(d.solvable, false);
  eq(d.move, { type: 'pair', a: 2, b: 'stock' });
  const e = E.hint(custom(p, ['5D', '6D'], []));
  eq(e.move, { type: 'pair', a: 2, b: 'stock' });
  const f = E.hint(custom(p, ['6D', '5D'], []));
  eq(f.move, { type: 'draw' });
});

/* ---------------- Bộ giải ---------------- */

test('bộ giải: ván dễ dựng sẵn giải được, lời giải đi lại đúng luật và dọn sạch tháp', () => {
  const g = E.fromDeck(EASY, 1);
  const res = E.solve(g);
  eq(res.solvable, true);
  ok(E.isWon(replay(g, res.moves)));
});

test('bộ giải: chồng rút đảo ngược thì phải rút hết rồi ghép với chồng bỏ', () => {
  const ranks = easyRanks();
  const g = E.fromDeck(idsFromRanks(ranks.slice(0, 28).concat(ranks.slice(28).reverse())), 1);
  const res = E.solve(g);
  eq(res.solvable, true);
  ok(res.moves.some((m) => m.type === 'draw'));
  ok(E.isWon(replay(g, res.moves)));
});

test('bộ giải: không giải được khi đỉnh là Q và cả 4 lá A đều nằm trong tháp (đều đè lên đỉnh)', () => {
  const all = easyRanks();
  const swap = (i, j) => { const t = all[i]; all[i] = all[j]; all[j] = t; };
  swap(0, all.indexOf(12, 1));
  let k = 1;
  for (let i = 28; i < 52; i++) {
    if (all[i] !== 1) continue;
    while (all[k] === 1 || all[k] === 12) k++;
    swap(i, k);
  }
  eq(all[0], 12);
  eq(all.slice(0, 28).filter((r) => r === 1).length, 4);
  eq(E.solve(E.fromDeck(idsFromRanks(all), 1)).solvable, false);
});

test('bộ giải: không giải được khi hai lá A tranh nhau lá Q duy nhất không nằm trên chúng', () => {
  // Hai lá A ở ô 23, 24 (hàng dưới); ba lá Q ở ô 0, 4, 12 đều nằm trên cả hai lá A (bị chúng đè);
  // lá Q thứ tư ở chồng rút. Mỗi lá A chỉ ghép được với lá Q đó: hai lá A cần hai lá Q -> không giải được,
  // dù riêng từng lá A vẫn còn lá bù.
  const ranks = new Array(52).fill(0);
  ranks[0] = 12; ranks[4] = 12; ranks[12] = 12; ranks[23] = 1; ranks[24] = 1;
  ranks[28] = 12; ranks[29] = 1; ranks[30] = 1;
  const pool = [];
  for (let r = 2; r <= 11; r++) for (let n = 0; n < 4; n++) pool.push(r);
  for (let n = 0; n < 4; n++) pool.push(13);
  let j = 0;
  for (let i = 0; i < 52; i++) if (!ranks[i]) ranks[i] = pool[(j++ * 13) % 44];
  [0, 4, 12].forEach((q) => ok(E.cone(q).indexOf(23) >= 0 && E.cone(q).indexOf(24) >= 0, 'ô 23, 24 đè lên ô ' + q));
  eq(E.solve(E.fromDeck(idsFromRanks(ranks), 1)).solvable, false);
});

test('bộ giải tôn trọng giới hạn quay vòng: có ván cần quay vòng mới giải được', () => {
  let found = null;
  for (let s = 1; s <= 400 && !found; s++) {
    const g = E.fromDeck(C.shuffle(C.newDeck(), C.rng(s)).map(C.toId), s);
    const all = E.solve(g, { limit: 60000 });
    if (all.solvable !== true) continue;
    if (E.solve(g, { limit: 60000, recycles: 0 }).solvable === false) found = { g, all };
  }
  ok(found, 'không tìm được ván cần quay vòng');
  ok(found.all.moves.some((m) => m.type === 'recycle'), 'lời giải có quay vòng');
  const end = replay(found.g, found.all.moves);
  ok(E.isWon(end));
  ok(end.recycles <= 2);
});

test('cắt nhánh không làm sai kết quả: đối chiếu với tìm kiếm không cắt nhánh', () => {
  const seen = { true: 0, false: 0 };
  for (let s = 1; s <= 24; s++) {
    const g = E.fromDeck(C.shuffle(C.newDeck(), C.rng(s)).map(C.toId), s);
    [0, 2].forEach((rc) => {
      const a = E.solve(g, { limit: 50000, recycles: rc });
      const b = E.solve(g, { limit: 50000, recycles: rc, prune: false });
      if (a.solvable === null || b.solvable === null) return;
      eq(a.solvable, b.solvable, 'seed ' + s + ', quay vòng ' + rc);
      seen[a.solvable]++;
    });
  }
  ok(seen.true >= 5 && seen.false >= 2, 'đủ ván để đối chiếu ' + JSON.stringify(seen));
});

test('bộ giải chạy từ giữa ván (đã rút vài lá, có chồng bỏ)', () => {
  let g = E.newGame({ seed: 77 });
  g = E.draw(E.draw(E.draw(g)));
  const res = E.solve(g);
  ok(res.solvable === true, 'rút lá không làm mất đường thắng khi còn quay vòng được');
  ok(E.isWon(replay(g, res.moves)));
});

/* ---------------- Chia ván ---------------- */

test('chia ván theo seed: cố định, đủ 52 lá khác nhau, seed khác ván khác', () => {
  const a = E.newGame({ seed: 12345 });
  const b = E.newGame({ seed: 12345 });
  eq(E.toJSON(a), E.toJSON(b));
  const ids = a.pyramid.concat(a.stock);
  eq(ids.length, 52);
  eq(new Set(ids).size, 52);
  ok(ids.every((id) => C.fromId(id)));
  ok(E.newGame({ seed: 54321 }).pyramid.join() !== a.pyramid.join());
  ok(Number.isInteger(E.newGame().seed), 'không truyền seed thì tự chọn');
});

test('ván chia theo seed luôn giải được: lời giải của bộ giải đi lại đúng luật engine (60 seed)', () => {
  const t0 = Date.now();
  for (let s = 1; s <= 60; s++) {
    const g = E.newGame({ seed: s * 7919 });
    const res = E.solve(g);
    eq(res.solvable, true, 'seed ' + s);
    const end = replay(g, res.moves);
    ok(E.isWon(end), 'seed ' + s + ' dọn sạch tháp');
    ok(end.recycles <= 2);
  }
  console.log('       (60 ván: ' + (Date.now() - t0) + ' ms)');
});

test('ván dự phòng (khi xáo mãi không ra ván giải được) cũng giải được, với mọi cách đổi chất', () => {
  for (let s = 1; s <= 6; s++) {
    const g = E.fallbackDeal(s);
    const ids = g.pyramid.concat(g.stock);
    eq(new Set(ids).size, 52);
    ok(ids.every((id) => E.rankOf(id) > 0), 'id hợp lệ');
    const res = E.solve(g);
    eq(res.solvable, true);
    ok(E.isWon(replay(g, res.moves)));
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (kể cả lịch sử hoàn tác)', () => {
  let g = E.newGame({ seed: 99 });
  g = E.markAssisted(E.draw(E.draw(g)));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back);
  eq(E.toJSON(back), E.toJSON(g));
  eq(E.toJSON(E.undo(back)), E.toJSON(E.undo(g)));
});

test('khôi phục ván dựng tay (ván gần thắng của e2e)', () => {
  const p = emptyPyr();
  p[0] = 'QH';
  const g = E.fromJSON({ v: 1, seed: 1, pyramid: p, stock: [], waste: ['AS'], recycles: 0, moves: 40, undoLeft: 3, assisted: false, history: [] });
  ok(g);
  ok(E.isWon(E.remove(g, 0, 'waste')));
  const q = emptyPyr();
  q[0] = 'QH'; q[1] = 'AS';
  const s = E.fromJSON({ v: 1, seed: 1, pyramid: q, stock: ['KS'], waste: [], recycles: 0, moves: 40, undoLeft: 3, assisted: false, history: [] });
  ok(s);
  ok(E.isStuck(E.remove(s, 'stock')));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.draw(E.newGame({ seed: 3 })));
  const nonK = good.stock.findIndex((id) => id[0] !== 'K');
  const holed = good.pyramid.slice();
  holed[0] = null; // ô đã gỡ nhưng lá đè lên nó còn: không thể xảy ra
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { pyramid: good.pyramid.slice(1) }),
    Object.assign({}, good, { pyramid: ['ZZ'].concat(good.pyramid.slice(1)) }),
    Object.assign({}, good, { pyramid: ['as'].concat(good.pyramid.slice(1)) }),
    Object.assign({}, good, { stock: good.stock.slice(1).concat([good.pyramid[0]]) }), // lá trùng
    Object.assign({}, good, { stock: good.stock.filter((x, i) => i !== nonK) }), // mất một lá: bậc đã bỏ không cân
    Object.assign({}, good, { pyramid: holed, stock: good.stock.concat([good.pyramid[0]]) }),
    Object.assign({}, good, { recycles: 3 }),
    Object.assign({}, good, { recycles: -1 }),
    Object.assign({}, good, { undoLeft: 4 }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { moves: 1.5 }),
    Object.assign({}, good, { assisted: 'no' }),
    Object.assign({}, good, { seed: 'a' }),
    Object.assign({}, good, { history: 'x' }),
    Object.assign({}, good, { history: [{ pyramid: [] }] }),
    Object.assign({}, good, { history: [1, 2, 3, 4] }),
    Object.assign({}, good, { stock: 'AS' }),
    Object.assign({}, good, { waste: [5] }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i + ': ' + JSON.stringify(raw).slice(0, 80)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
