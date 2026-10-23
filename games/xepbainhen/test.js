/* Kiểm tra engine Xếp Bài Nhện: chạy `node test.js`
 * - Chia bài: 104 lá đúng thành phần theo số chất, 4 cột 6 lá + 6 cột 5 lá, chỉ lá trên ngửa, chồng chia 50 lá
 * - Luật đi: bốc dãy cùng chất, đặt lên lá hơn 1 bậc (chất nào cũng được), cột trống nhận mọi lá, lật lá úp
 * - Dãy K→A cùng chất tự gỡ ra ô đích (cả khi vừa chia), luật chia (không chia khi có cột trống)
 * - Đi lại (mọi loại nước), thắng khi đủ 8 dãy, điểm cổ điển, gợi ý / tự đi
 * - Lưu / khôi phục ván (chơi lại từ hạt giống) và từ chối dữ liệu hỏng
 * - Bot đơn giản giải được phần lớn ván 1 chất (ván sinh ra chơi được tới thắng)
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
  if (!v) throw new Error(msg || 'expected truthy');
}

/** Dãy id từ bậc a xuống bậc b cùng chất: run('S', 13, 1) = ['KS', 'QS', ..., 'AS']. */
function run(suit, from, to) {
  const out = [];
  for (let r = from; r >= to; r--) out.push(C.rankLabel(r) + suit);
  return out;
}

/**
 * Dựng trạng thái tùy ý để thử luật: tab là 10 mảng id (dưới -> trên), down số lá úp mỗi cột,
 * stock mảng id (cuối mảng nằm trên), found số dãy đã gỡ (thêm dãy bích giả).
 */
function build({ tab, down, stock, found }) {
  const cards = [];
  const add = (id) => {
    cards.push(C.fromId(id));
    return cards.length - 1;
  };
  const cols = [];
  for (let c = 0; c < 10; c++) cols.push((tab[c] || []).map(add));
  const st = (stock || []).map(add);
  const fd = [];
  for (let k = 0; k < (found || 0); k++) fd.push(run('S', 13, 1).map(add));
  return {
    suits: 4,
    seed: 0,
    cards,
    tab: cols,
    down: cols.map((t, c) => (down && down[c] != null ? down[c] : Math.max(0, t.length - 1))),
    stock: st,
    found: fd,
    moves: 0,
    hist: [],
  };
}

/** Ảnh chụp phần bàn chơi (để so trước / sau khi đi lại). */
function snap(s) {
  return {
    tab: s.tab.map((t) => t.map((i) => C.toId(s.cards[i]))),
    down: s.down,
    stock: s.stock.map((i) => C.toId(s.cards[i])),
    found: s.found.map((f) => f.map((i) => C.toId(s.cards[i]))),
  };
}
const ids = (s, col) => s.tab[col].map((i) => C.toId(s.cards[i]));

/* ---------------- Chia bài ---------------- */

test('chia bài: 104 lá, đúng thành phần cho 1 / 2 / 4 chất', () => {
  [[1, ['S']], [2, ['S', 'H']], [4, ['S', 'H', 'D', 'C']]].forEach(([n, suits]) => {
    const s = E.newGame({ suits: n, seed: 42 });
    eq(s.cards.length, 104);
    const count = {};
    s.cards.forEach((c) => { count[C.toId(c)] = (count[C.toId(c)] || 0) + 1; });
    eq(Object.keys(count).length, 13 * suits.length, n + ' chất: số loại lá');
    suits.forEach((su) => C.RANKS.forEach((r) => eq(count[C.rankLabel(r) + su], 8 / suits.length, n + ' chất: ' + r + su)));
  });
});

test('chia bài: 4 cột đầu 6 lá, 6 cột sau 5 lá, chỉ lá trên ngửa, chồng chia 50 lá, mỗi lá đúng một chỗ', () => {
  const s = E.newGame({ suits: 4, seed: 7 });
  eq(s.tab.map((t) => t.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
  eq(s.down, [5, 5, 5, 5, 4, 4, 4, 4, 4, 4]);
  eq(s.stock.length, 50);
  eq(s.found.length, 0);
  const all = [].concat(...s.tab, s.stock).sort((a, b) => a - b);
  eq(all, Array.from({ length: 104 }, (_, i) => i));
  eq([E.isWon(s), E.score(s), s.moves], [false, 500, 0]);
});

test('chia bài theo hạt giống: cùng hạt giống cùng ván, khác hạt giống khác ván', () => {
  const a = E.newGame({ suits: 4, seed: 123 });
  const b = E.newGame({ suits: 4, seed: 123 });
  const c = E.newGame({ suits: 4, seed: 124 });
  eq(snap(a), snap(b));
  ok(JSON.stringify(snap(a)) !== JSON.stringify(snap(c)), 'hạt giống khác phải ra ván khác');
  // Khớp với bộ bài của kit: xáo newDeck({ decks: 2, suits }) bằng rng(seed)
  eq(a.cards.map(C.toId), C.shuffle(C.newDeck({ decks: 2, suits: 4 }), C.rng(123)).map(C.toId));
});

test('chia bài: số chất lạ hoặc hạt giống sai thì dùng mặc định (1 chất, hạt giống ngẫu nhiên)', () => {
  const s = E.newGame({ suits: 3, seed: -5 });
  eq(s.suits, 1);
  ok(Number.isInteger(s.seed) && s.seed >= 0);
});

/* ---------------- Bốc và đặt ---------------- */

test('bốc được dãy giảm dần cùng chất; lá úp, dãy khác chất, dãy đứt bậc thì không', () => {
  const s = build({
    tab: [['2D', '9S', '8S', '7S'], ['KH', '9H', '8S'], ['5C', '4C', '2C']],
    down: [1, 1, 0],
  });
  ok(E.canPick(s, 0, 1) && E.canPick(s, 0, 2) && E.canPick(s, 0, 3), 'dãy 9-8-7 bích');
  ok(!E.canPick(s, 0, 0), 'lá úp');
  ok(!E.canPick(s, 1, 1), '9 cơ - 8 bích khác chất');
  ok(E.canPick(s, 1, 2), 'một lá trên cùng luôn bốc được');
  ok(!E.canPick(s, 2, 0) && !E.canPick(s, 2, 1), '4 - 2 đứt bậc');
  ok(!E.canPick(s, 0, 4) && !E.canPick(s, 0, -1) && !E.canPick(s, 10, 0), 'ngoài phạm vi');
  eq([E.runStart(s, 0), E.runStart(s, 1), E.runStart(s, 2), E.runStart(s, 3)], [1, 2, 2, -1]);
});

test('đặt lên lá hơn đúng 1 bậc, chất nào cũng được; sai bậc hoặc cùng cột thì không', () => {
  const s = build({ tab: [['9S', '8S'], ['9H'], ['10D'], ['7C'], ['KS']] , down: [0, 0, 0, 0, 0] });
  ok(E.canMove(s, 0, 1, 1), '8 bích lên 9 cơ (khác chất)');
  ok(E.canMove(s, 0, 0, 2), '9-8 bích lên 10 rô');
  ok(!E.canMove(s, 0, 1, 3), '8 lên 7: sai chiều');
  ok(!E.canMove(s, 0, 0, 1), '9 lên 9');
  ok(!E.canMove(s, 0, 1, 0), 'cùng cột');
  ok(!E.canMove(s, 4, 0, 0), 'K không lên được lá nào');
});

test('cột trống nhận mọi lá và mọi dãy cùng chất', () => {
  const s = build({ tab: [['KS', 'QS'], [], ['3H'], ['10D', '9D', '8D']], down: [0, 0, 0, 1] });
  ok(E.canMove(s, 0, 0, 1) && E.canMove(s, 2, 0, 1) && E.canMove(s, 3, 1, 1));
});

test('đi chồng: lá chuyển đúng thứ tự, lật lá úp lộ ra, trạng thái cũ không đổi', () => {
  const s = build({ tab: [['4C', '9S', '8S'], ['3D', '9H', '10H']], down: [1, 2] });
  const before = snap(s);
  const g = E.move(s, 0, 1, 1);
  eq(ids(g, 0), ['4C']);
  eq(ids(g, 1), ['3D', '9H', '10H', '9S', '8S']);
  eq(g.down[0], 0, 'lá 4 nhép đã lật');
  eq(g.down[1], 2);
  eq(g.moves, 1);
  eq(E.score(g), 499);
  eq(snap(s), before, 'trạng thái cũ giữ nguyên');
  eq(E.move(s, 0, 2, 0), null, 'nước sai luật trả null');
});

test('đi cả cột sang chỗ khác để trống cột', () => {
  const s = build({ tab: [['5H'], ['6S']], down: [0, 0] });
  const g = E.move(s, 0, 0, 1);
  eq([g.tab[0].length, g.down[0]], [0, 0]);
});

/* ---------------- Dãy K→A ---------------- */

test('dãy K→A cùng chất hoàn chỉnh tự gỡ ra ô đích và lật lá úp bên dưới', () => {
  const s = build({ tab: [['7D'].concat(run('H', 13, 2)), ['AH']], down: [1, 0] });
  const g = E.move(s, 1, 0, 0);
  eq(g.found.length, 1);
  eq(g.found[0].map((i) => C.toId(g.cards[i])), run('H', 13, 1));
  eq(ids(g, 0), ['7D']);
  eq(g.down[0], 0, 'lá 7 rô lộ ra và được lật');
  eq(E.score(g), 500 - 1 + 100);
});

test('K→A lẫn chất hoặc có lá úp chen vào thì không gỡ', () => {
  const mixed = run('H', 13, 7).concat(run('S', 6, 2));
  const s = build({ tab: [mixed, ['AS']], down: [0, 0] });
  const g = E.move(s, 1, 0, 0);
  eq(g.found.length, 0);
  eq(g.tab[0].length, 13);
  // K úp nằm dưới dãy Q→2 ngửa: chưa đủ 13 lá ngửa nên chưa gỡ
  const t = build({ tab: [run('C', 13, 2), ['AC']], down: [1, 0] });
  eq(E.move(t, 1, 0, 0).found.length, 0);
});

test('thắng khi gỡ đủ 8 dãy', () => {
  const s = build({ tab: [run('S', 13, 2), ['AS']], down: [0, 0], found: 7 });
  ok(!E.isWon(s));
  const g = E.move(s, 1, 0, 0);
  ok(E.isWon(g));
  eq(E.tableauCount(g), 0);
  eq(E.score(g), 500 - 1 + 800);
});

/* ---------------- Chia thêm ---------------- */

test('chia: mỗi cột một lá ngửa từ trên chồng chia, trái sang phải', () => {
  const s = E.newGame({ suits: 2, seed: 9 });
  const top10 = s.stock.slice(-10).reverse();
  const g = E.deal(s);
  eq(g.stock.length, 40);
  for (let c = 0; c < 10; c++) {
    eq(g.tab[c][g.tab[c].length - 1], top10[c], 'cột ' + c);
    eq(g.down[c], s.down[c], 'lá úp không đổi');
  }
  eq(g.moves, 1);
});

test('không chia khi có cột trống hoặc hết bài; bàn còn dưới 10 lá thì được chia', () => {
  const stock = Array.from({ length: 10 }, () => '5D');
  const full = build({ tab: Array.from({ length: 10 }, () => ['2C']), stock });
  ok(E.canDeal(full));
  const empty = build({ tab: [[], ['2C'], ['3C'], ['4C'], ['5C'], ['6C'], ['7C'], ['8C'], ['9C'], ['10C', 'JC']], stock });
  ok(!E.canDeal(empty), 'có cột trống');
  eq(E.deal(empty), null);
  const few = build({ tab: [['2C'], ['3C'], [], [], [], [], [], [], [], []], stock });
  ok(E.canDeal(few), 'bàn còn 2 lá: không lấp được hết cột nên vẫn được chia');
  const none = build({ tab: Array.from({ length: 10 }, () => ['2C']), stock: [] });
  ok(!E.canDeal(none), 'hết bài');
});

test('lá vừa chia thành dãy K→A thì gỡ luôn', () => {
  const tab = Array.from({ length: 10 }, () => ['9C']);
  tab[3] = ['4D'].concat(run('D', 13, 2));
  // Lá trên cùng của chồng chia đi cột 0; lá cho cột 3 là lá thứ 4 tính từ trên
  const stock = ['3S', '3S', '3S', '3S', '3S', '3S', 'AD', '3S', '3S', '3S'];
  const s = build({ tab, down: tab.map((t, c) => (c === 3 ? 1 : 0)), stock });
  const g = E.deal(s);
  eq(g.found.length, 1);
  eq(ids(g, 3), ['4D']);
  eq(g.down[3], 0);
});

/* ---------------- Đi lại ---------------- */

test('đi lại: nước đi thường, nước có lật lá, nước gỡ dãy, lần chia, lần chia gỡ dãy', () => {
  const tab = Array.from({ length: 10 }, () => ['9C']);
  tab[0] = ['4D'].concat(run('H', 13, 3));
  tab[1] = ['JC', '2H'];
  tab[2] = ['6S', '10C'];
  tab[3] = ['4D'].concat(run('D', 13, 2));
  const stock = ['3S', '3S', '3S', '3S', '3S', '3S', 'AD', '3S', '3S', 'AH'];
  let s = build({ tab, down: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0], stock });
  const states = [s];
  s = E.move(s, 9, 0, 2); // 9 nhép lên 10 nhép, cột 9 trống
  states.push(s);
  s = E.move(s, 1, 1, 0); // 2 cơ lên 3 cơ, lật JC
  states.push(s);
  s = E.move(s, 2, 1, 1); // 10-9 nhép lên J nhép, lật 6 bích
  states.push(s);
  s = E.move(s, 4, 0, 9); // 9 nhép sang cột trống 9
  states.push(s);
  s = E.move(s, 4 + 1, 0, 4); // lấp lại cột 4 để chia được
  states.push(s);
  ok(s, 'chuỗi nước hợp lệ');
  // Lấp cột trống còn lại (cột 5) bằng 9 nhép của cột 6
  s = E.move(s, 6, 0, 5);
  states.push(s);
  s = E.move(s, 7, 0, 6);
  states.push(s);
  s = E.move(s, 8, 0, 7);
  states.push(s);
  s = E.move(s, 1, 2, 8); // 9 nhép (trên 10 nhép) sang cột trống 8: tách dãy, vẫn hợp lệ
  states.push(s);
  ok(E.canDeal(s), 'đủ cột để chia');
  s = E.deal(s); // AH lên cột 0 thành K→A cơ, AD lên cột 3 thành K→A rô
  states.push(s);
  eq(s.found.length, 2);
  for (let k = states.length - 1; k > 0; k--) {
    const u = E.undo(states[k]);
    eq(snap(u), snap(states[k - 1]), 'đi lại bước ' + k);
    eq(u.moves, states[k].moves + 1, 'đi lại cũng tính một lần đi');
    eq(u.hist.length, states[k - 1].hist.length);
  }
  eq(E.undo(states[0]), null, 'hết nước để đi lại');
});

test('đi lại liên tiếp về tận đầu ván chia ngẫu nhiên', () => {
  let s = E.newGame({ suits: 4, seed: 99 });
  const start = snap(s);
  const seen = [snap(s)];
  for (let k = 0; k < 40; k++) {
    const h = E.hint(s);
    if (!h) break;
    s = h.t === 'deal' ? E.deal(s) : E.move(s, h.col, h.idx, h.to);
    seen.push(snap(s));
  }
  ok(seen.length > 5, 'có đi được vài nước');
  while (s.hist.length) {
    seen.pop();
    s = E.undo(s);
    eq(snap(s), seen[seen.length - 1]);
  }
  eq(snap(s), start);
});

/* ---------------- Tự đi và gợi ý ---------------- */

test('chạm để tự đi: ưu tiên cùng chất (dãy dài hơn), rồi khác chất, cuối cùng cột trống', () => {
  const s = build({
    tab: [['2C', '5S'], ['6H'], ['6S'], [], ['8S', '7S', '6S'], ['9D']],
    down: [1, 0, 0, 0, 0, 0],
  });
  eq(E.targets(s, 0, 1), [4, 2, 1, 3]);
  eq(E.targets(s, 1, 0), [], 'cả cột không đưa sang cột trống, không có 7 nào');
  eq(E.targets(s, 0, 0), [], 'lá úp');
});

test('gợi ý: ưu tiên nước lật lá úp, rồi ghép cùng chất; không gợi ý đi ngang', () => {
  const s = build({
    tab: [['3C', '7H'], ['8S'], ['8H'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD']],
    down: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
  // 7 cơ lên 8 bích hoặc 8 cơ: lật được 3 nhép, cùng chất (8 cơ) tốt hơn
  eq(E.hint(s), { t: 'move', col: 0, idx: 1, to: 2 });
  // Không còn nước lật: 7 bích (đã nằm đúng chất trên 8 bích) không được gợi ý sang 8 cơ
  const t = build({ tab: [['8S', '7S'], ['8H'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD']] });
  t.down = t.tab.map(() => 0);
  eq(E.hint(t), null);
});

test('gợi ý chia bài khi không còn nước có ích', () => {
  const s = build({ tab: Array.from({ length: 10 }, () => ['KD']), stock: Array.from({ length: 10 }, () => '2C') });
  eq(E.hint(s), { t: 'deal' });
});

test('gợi ý tách dãy cùng chất khi nhờ đó gỡ được dãy K→A', () => {
  const s = build({ tab: [run('S', 13, 2), ['3S', '2S', 'AS'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD'], ['KD']] });
  s.down = s.tab.map(() => 0);
  eq(E.hint(s), { t: 'move', col: 1, idx: 2, to: 0 });
});

/* ---------------- Lưu / khôi phục ---------------- */

/** Chơi theo gợi ý vài nước, có cả đi lại, để có ván dở thật. */
function played(seed, n) {
  let s = E.newGame({ suits: 2, seed });
  for (let k = 0; k < n; k++) {
    const h = E.hint(s);
    if (!h) break;
    s = h.t === 'deal' ? E.deal(s) : E.move(s, h.col, h.idx, h.to);
    if (k % 7 === 6) s = E.undo(s);
  }
  return s;
}

test('lưu rồi khôi phục giữ nguyên ván (bàn, ô đích, số lần đi, lịch sử đi lại)', () => {
  const s = played(5, 60);
  ok(s.hist.length > 10);
  const raw = JSON.parse(JSON.stringify(E.toJSON(s)));
  const r = E.fromJSON(raw);
  eq(snap(r), snap(s));
  eq([r.moves, r.suits, r.seed, r.hist.length], [s.moves, s.suits, s.seed, s.hist.length]);
  eq(snap(E.undo(r)), snap(E.undo(s)), 'đi lại sau khi khôi phục');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(played(6, 20));
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { suits: 3 }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { seed: 1.5 }),
    Object.assign({}, good, { moves: good.acts.length - 1 }),
    Object.assign({}, good, { moves: '5' }),
    Object.assign({}, good, { acts: 'd' }),
    Object.assign({}, good, { acts: good.acts.concat([[0, 0, 0]]) }),
    Object.assign({}, good, { acts: good.acts.concat([[0, 99, 1]]) }),
    Object.assign({}, good, { acts: good.acts.concat([[0, 1]]) }),
    Object.assign({}, good, { acts: good.acts.concat(['x']) }),
    Object.assign({}, good, { acts: good.acts.concat([['0', 0, 1]]) }),
    Object.assign({}, good, { acts: [[0, 0, 1]] }), // lá úp
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
  ok(E.fromJSON(good), 'mẫu tốt vẫn nhận');
});

/* ---------------- Ván sinh ra giải được: bot tìm kiếm ---------------- */

/**
 * Bot: tìm kiếm theo chiều sâu, thử nước có ích trước (thứ tự như gợi ý), nhớ trạng thái đã gặp,
 * giới hạn số nút. Trả { won, moves } (moves = số nước của lời giải tìm được).
 */
function solve(start, budget) {
  const seen = new Set();
  const key = (s) => s.tab.map((t, c) => s.down[c] + ':' + t.slice(s.down[c]).map((i) => s.cards[i].rank + s.cards[i].suit).join(',')).join('|') + '#' + s.stock.length;
  function candidates(s) {
    const out = [];
    let firstEmpty = -1;
    for (let c = 0; c < 10; c++) if (!s.tab[c].length) { firstEmpty = c; break; }
    for (let col = 0; col < 10; col++) {
      const t = s.tab[col];
      const rs = E.runStart(s, col);
      for (let idx = rs; idx >= 0 && idx < t.length; idx++) {
        const c = s.cards[t[idx]];
        const belowUp = idx > s.down[col];
        const below = idx > 0 ? s.cards[t[idx - 1]] : null;
        const natural = belowUp && below.rank === c.rank + 1;
        for (let to = 0; to < 10; to++) {
          if (!E.canMove(s, col, idx, to)) continue;
          const empty = !s.tab[to].length;
          if (empty && (to !== firstEmpty || idx === 0 || natural || idx !== rs)) continue;
          const g = E.move(s, col, idx, to);
          let v;
          if (g.found.length > s.found.length) v = 5000;
          else if (natural && below.suit === c.suit) continue;
          else if (empty) v = belowUp ? 50 : 150;
          else {
            const same = s.cards[E.topIdx(s, to)].suit === c.suit;
            if (idx === s.down[col] && idx > 0) v = 1000;
            else if (idx === 0) v = 800;
            else if (same) v = 600;
            else if (!natural) v = 300;
            else continue;
            if (same) v += 100;
          }
          out.push({ g, v });
        }
      }
    }
    out.sort((a, b) => b.v - a.v);
    if (E.canDeal(s)) out.push({ g: E.deal(s), v: 0 });
    return out.map((x) => x.g);
  }
  let nodes = 0;
  const stack = [[start]];
  const path = [];
  // DFS lặp (tránh tràn ngăn xếp): mỗi tầng giữ danh sách nước còn chưa thử
  let cur = start;
  seen.add(key(start));
  stack[0] = candidates(start);
  path.push(start);
  while (stack.length) {
    if (E.isWon(cur)) return { won: true, moves: cur.hist.length, nodes };
    if (++nodes > budget) break;
    const list = stack[stack.length - 1];
    let next = null;
    while (list.length) {
      const g = list.shift();
      const k = key(g);
      if (!seen.has(k)) {
        seen.add(k);
        next = g;
        break;
      }
    }
    if (next) {
      cur = next;
      path.push(next);
      stack.push(candidates(next));
    } else {
      stack.pop();
      path.pop();
      cur = path[path.length - 1];
    }
  }
  return { won: false, moves: 0, nodes };
}

test('ván 1 chất: bot giải được phần lớn ván (ván sinh ra chơi được tới thắng)', () => {
  const N = 20;
  let won = 0;
  let minMoves = Infinity;
  let sum = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = solve(E.newGame({ suits: 1, seed }), 20000);
    if (r.won) {
      won++;
      sum += r.moves;
      minMoves = Math.min(minMoves, r.moves);
    }
  }
  console.log('       bot thắng ' + won + '/' + N + ' ván 1 chất, ít nhất ' + minMoves + ' nước, trung bình ' + Math.round(sum / Math.max(1, won)) + ' nước');
  ok(won >= N * 0.7, 'bot phải thắng ít nhất 70% ván');
  // Lời giải ngắn nhất bot tìm được vẫn dài (cơ sở cho min_time_ms)
  ok(minMoves >= 90, 'ván thắng cần nhiều nước');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
