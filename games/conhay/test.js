/* Kiểm tra engine Cờ Nhảy: chạy `node test.js`
 * - Bàn sao 121 lỗ: số lỗ từng hàng, sáu góc 10 lỗ, láng giềng đối xứng, bày quân 2 / 3 người
 * - Nước đi: bước sang lỗ kề, nhảy một lần, nhảy chuỗi (đổi hướng giữa chừng), nhảy qua quân của ai cũng được,
 *   không nhảy qua lỗ trống / qua hai quân liền, không bước rồi mới nhảy, đường đi từng bước cho hoạt cảnh
 * - Quân đã vào góc đích chỉ đi trong góc đích; bỏ lượt khi hết nước
 * - Thắng: lấp đầy góc đích; luật chống chiếm góc (sau lượt 30 của bên chiếm góc); hòa khi hết 200 lượt
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 * - Máy: mọi mức luôn đi đúng luật, tất định theo hạt giống, đi nước thắng ngay;
 *   mức mạnh dần (Khó thắng Dễ, Vừa thắng Dễ, Khó thắng Vừa phần lớn ván); ván ba người luôn kết thúc
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

/** Lỗ theo tọa độ (q, r); sai tọa độ thì ném lỗi để test không âm thầm sai. */
const C = (q, r) => {
  const c = E.cellAt(q, r);
  if (c < 0) throw new Error('không có lỗ (' + q + ',' + r + ')');
  return c;
};
const qr = (c) => E.qOf(c) + ',' + E.rOf(c);
/** Các lỗ đến được của quân ở (q, r), dạng "q,r" đã sắp. */
const dests = (g, q, r) => E.movesFrom(g, C(q, r)).map(qr).sort();
const sorted = (list) => list.slice().sort();
/** Thế cờ tự bày: pieces = [[q, r, người], ...]. */
const pos = (pieces, opts) => E.setup(Object.assign({ pieces: pieces.map(([q, r, p]) => [C(q, r), p]) }, opts || {}));
const mv = (q1, r1, q2, r2) => E.encode(C(q1, r1), C(q2, r2));

/* ---------------- Bàn ---------------- */

test('bàn sao 121 lỗ: 17 hàng 1-2-3-4-13-12-11-10-9-10-11-12-13-4-3-2-1', () => {
  eq(E.N, 121);
  const rows = [];
  for (let r = -8; r <= 8; r++) {
    let n = 0;
    for (let q = -8; q <= 8; q++) if (E.cellAt(q, r) >= 0) n++;
    rows.push(n);
  }
  eq(rows, [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]);
});

test('sáu góc 10 lỗ, lục giác giữa 61 lỗ, đỉnh góc cách tâm 8', () => {
  eq(E.CORNERS.map((c) => c.length), [10, 10, 10, 10, 10, 10]);
  let mid = 0;
  for (let c = 0; c < E.N; c++) if (E.CORNER[c] < 0) mid++;
  eq(mid, 61);
  const centre = C(0, 0);
  eq(E.APEX.map((a) => E.dist(a, centre)), [8, 8, 8, 8, 8, 8]);
  // Góc 0 ở dưới, góc 3 ở trên; các góc theo chiều kim đồng hồ
  eq(qr(E.APEX[0]), '-4,8');
  eq(qr(E.APEX[3]), '4,-8');
  ok(E.yOf(E.APEX[1]) > 0 && E.xOf(E.APEX[1]) < 0, 'góc 1 dưới trái');
  ok(E.yOf(E.APEX[2]) < 0 && E.xOf(E.APEX[2]) < 0, 'góc 2 trên trái');
  ok(E.yOf(E.APEX[4]) < 0 && E.xOf(E.APEX[4]) > 0, 'góc 4 trên phải');
  ok(E.yOf(E.APEX[5]) > 0 && E.xOf(E.APEX[5]) > 0, 'góc 5 dưới phải');
});

test('láng giềng đối xứng; lỗ giữa có 6 láng giềng, đỉnh góc có 2', () => {
  for (let c = 0; c < E.N; c++) {
    for (let d = 0; d < 6; d++) {
      const n = E.neighbor(c, d);
      if (n >= 0) eq(E.neighbor(n, (d + 3) % 6), c, 'ô ' + c + ' hướng ' + d);
    }
  }
  const deg = (c) => [0, 1, 2, 3, 4, 5].filter((d) => E.neighbor(c, d) >= 0).length;
  eq(deg(C(0, 0)), 6);
  eq(E.APEX.map(deg), [2, 2, 2, 2, 2, 2]);
});

test('ván 2 người: bạn ở góc dưới, máy ở góc trên, mỗi bên 10 quân, bạn đi trước', () => {
  const g = E.newGame({ players: 2, seed: 7 });
  eq(g.seats, [0, 3]);
  eq([g.turn, g.ply, g.turns, g.winner], [0, 0, [0, 0], null]);
  eq(E.CORNERS[0].every((c) => g.board[c] === 0), true);
  eq(E.CORNERS[3].every((c) => g.board[c] === 1), true);
  eq(Array.from(g.board).filter((v) => v >= 0).length, 20);
  eq([E.targetOf(g, 0), E.targetOf(g, 1)], [3, 0]);
});

test('ván 3 người: các góc 0, 2, 4 (góc đích 3, 5, 1 đều trống)', () => {
  const g = E.newGame({ players: 3, seed: 7 });
  eq(g.seats, [0, 2, 4]);
  eq([0, 1, 2].map((p) => E.targetOf(g, p)), [3, 5, 1]);
  for (const k of [1, 3, 5]) eq(E.CORNERS[k].every((c) => g.board[c] < 0), true, 'góc ' + k);
  eq([0, 1, 2].map((p) => E.inHome(g, p)), [10, 10, 10]);
});

/* ---------------- Nước đi ---------------- */

test('nước mở đầu: 14 nước (8 bước của hàng đầu + 6 nhảy của hàng thứ hai, đếm tay)', () => {
  const g = E.newGame({ players: 2, seed: 1 });
  eq(E.legalMoves(g).length, 14);
  eq(dests(g, -2, 6), sorted(['-2,4', '0,4'])); // nhảy qua (-2,5) và (-1,5)
  eq(dests(g, -1, 5), sorted(['-1,4', '0,4']));
  eq(dests(g, -4, 8), []); // đỉnh góc bị vây
  const g1 = Object.assign({}, g, { turn: 1 });
  eq(E.legalMoves(g1).length, 14, 'đối xứng cho bên trên');
});

test('bước: quân đứng một mình giữa bàn đi được 6 lỗ kề', () => {
  const g = pos([[0, 0, 0]]);
  eq(dests(g, 0, 0), sorted(['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1']));
});

test('nhảy một lần qua quân kề sang lỗ trống ngay sau; không bước lên quân', () => {
  const g = pos([[0, 0, 0], [1, 0, 1]]);
  const d = dests(g, 0, 0);
  ok(d.indexOf('2,0') >= 0, 'nhảy qua quân đối thủ');
  ok(d.indexOf('1,0') < 0, 'không bước lên quân');
  eq(d.length, 6);
});

test('nhảy chuỗi nhiều lần, đổi hướng giữa chừng, dừng ở bất kỳ lỗ nào trên đường', () => {
  // (0,0) qua (1,0) tới (2,0), qua (3,0) tới (4,0), rồi rẽ Đông Bắc qua (5,-1) tới (6,-2)
  const g = pos([[0, 0, 0], [1, 0, 0], [3, 0, 1], [5, -1, 1]]);
  const d = dests(g, 0, 0);
  for (const x of ['2,0', '4,0', '6,-2']) ok(d.indexOf(x) >= 0, 'đến được ' + x);
  eq(E.pathOf(g, C(0, 0), C(6, -2)).map(qr), ['0,0', '2,0', '4,0', '6,-2']);
  eq(E.pathOf(g, C(0, 0), C(1, -1)).map(qr), ['0,0', '1,-1'], 'bước thường');
  eq(E.pathOf(g, C(0, 0), C(0, -3)), null);
});

test('không nhảy qua lỗ trống, không nhảy qua hai quân liền, không bước rồi mới nhảy', () => {
  const gap = pos([[0, 0, 0], [2, 0, 1]]);
  ok(dests(gap, 0, 0).indexOf('4,0') < 0 && dests(gap, 0, 0).indexOf('3,0') < 0, 'qua lỗ trống');
  const two = pos([[0, 0, 0], [1, 0, 1], [2, 0, 1]]);
  ok(dests(two, 0, 0).indexOf('3,0') < 0, 'qua hai quân');
  // Bước sang (-1,0) rồi nhảy qua (-2,0) tới (-3,0) là sai luật
  const step = pos([[0, 0, 0], [-2, 0, 1]]);
  ok(dests(step, 0, 0).indexOf('-3,0') < 0, 'bước rồi nhảy');
});

test('lỗ xuất phát coi như trống khi nhảy: không quay về chỗ cũ, không nhảy qua chỗ cũ', () => {
  // (0,0) nhảy qua (1,0) tới (2,0); từ đó nhảy ngược qua (1,0) về (0,0) không tính là một nước.
  // (-1,0) có quân: nếu lỗ xuất phát còn "có quân" thì từ (1,... ) ... không có đường qua (0,0).
  const g = pos([[0, 0, 0], [1, 0, 1], [-1, 0, 1]]);
  const d = dests(g, 0, 0);
  ok(d.indexOf('0,0') < 0);
  ok(d.indexOf('2,0') >= 0 && d.indexOf('-2,0') >= 0);
  eq(new Set(d).size, d.length, 'không trùng lỗ');
});

test('quân đã vào góc đích chỉ đi trong góc đích', () => {
  // Quân của bạn (góc đích 3) ở hàng đáy góc (2,-5): bước ra (2,-4) / (1,-4) không được
  const g = pos([[2, -5, 0], [-4, 8, 1]]);
  eq(dests(g, 2, -5), sorted(['1,-5', '3,-5', '2,-6', '3,-6']));
  ok(E.play(g, mv(2, -5, 2, -4)) === null, 'ra khỏi góc đích');
  // Nhảy ra ngoài rồi quay lại trong góc vẫn được (chỉ xét lỗ dừng)
  const h = pos([[2, -5, 0], [2, -4, 1], [3, -4, 1], [3, -5, 1]]);
  ok(dests(h, 2, -5).indexOf('2,-3') < 0, 'không dừng ngoài góc');
});

test('đi quân: ván cũ không đổi, chuyển lượt, ghi đường đi; nước sai luật trả null', () => {
  const g = E.newGame({ players: 2, seed: 1 });
  const before = E.boardString(g);
  const m = mv(-2, 6, 0, 4);
  const n = E.play(g, m);
  eq(E.boardString(g), before, 'ván cũ giữ nguyên');
  eq([n.turn, n.ply, n.turns], [1, 1, [1, 0]]);
  eq(n.last.path.map(qr), ['-2,6', '0,4']);
  eq(n.board[C(0, 4)], 0);
  eq(n.board[C(-2, 6)], -1);
  eq(E.play(g, mv(-2, 6, 0, 3)), null, 'không tới được');
  eq(E.play(g, mv(4, -8, 4, -9 + 2)), null, 'quân đối thủ');
  eq(E.play(g, mv(0, 0, 1, 0)), null, 'lỗ trống');
  eq(E.play(g, 'x'), null);
});

test('bỏ lượt khi bên tới lượt không còn nước (vẫn tính là một lượt)', () => {
  // Quân máy ở đỉnh (4,-8) bị vây kín bởi quân bạn: không bước, không nhảy được
  const g = pos([[4, -8, 1], [3, -7, 0], [4, -7, 0], [2, -6, 0], [4, -6, 0], [0, 0, 0]]);
  const n = E.play(g, mv(0, 0, 0, -1));
  eq([n.turn, n.turns, n.winner], [0, [1, 1], null]);
});

/* ---------------- Thắng / hòa ---------------- */

/** 9 quân bạn trong góc 3 (trừ lỗ `hole`), quân thứ 10 ở `last`; máy có quân ở `extra`. */
function nearlyHome(hole, last, extra, turns) {
  const pieces = [];
  for (const c of E.CORNERS[3]) if (c !== C(hole[0], hole[1])) pieces.push([E.qOf(c), E.rOf(c), 0]);
  pieces.push([last[0], last[1], 0]);
  for (const x of extra) pieces.push([x[0], x[1], 1]);
  return pos(pieces, { turns });
}

test('thắng: đưa đủ 10 quân vào góc đích', () => {
  const g = nearlyHome([2, -5], [2, -4], [[-4, 8], [0, 0]], [20, 20]);
  const n = E.play(g, mv(2, -4, 2, -5));
  eq([n.winner, n.reason], [0, 'home']);
  eq(E.legalMoves(n), []);
  eq(E.play(n, mv(-4, 8, -4, 7)), null, 'hết ván không đi tiếp');
});

test('chống chiếm góc: chưa tới lượt 30 của bên chiếm góc thì quân chiếm góc còn chặn', () => {
  // Máy để một quân ở góc nhà (2,-5) = góc đích của bạn; bạn lấp nốt 9 lỗ còn lại
  const g = nearlyHome([2, -5], [5, -5 + 1], [[2, -5], [-4, 8]], [28, 28]);
  // Quân thứ 10 của bạn đứng sẵn ngoài góc; bạn đi một nước khác (quân ngoài), máy tới lượt 29
  const n = E.play(g, mv(5, -4, 5, -3));
  eq(n.winner, null);
  const n2 = E.play(n, mv(-4, 8, -4, 7)); // lượt 29 của máy: chưa áp dụng
  eq(n2.winner, null);
  const n3 = E.play(n2, mv(5, -3, 5, -4));
  eq(n3.winner, null, 'máy mới đi 29 lượt');
  // Lượt thứ 30 của máy mà quân vẫn nằm trong góc nhà: bạn thắng ngay
  const n4 = E.play(n3, mv(-4, 7, -4, 8));
  eq([n4.winner, n4.reason], [0, 'squat']);
});

test('chống chiếm góc: sau lượt 30, bạn lấp 9 lỗ còn lại là thắng', () => {
  const g = nearlyHome([3, -5], [3, -4], [[2, -5], [-4, 8]], [40, 40]);
  // Thiếu một lỗ (3,-5) và máy chiếm (2,-5): chưa đầy nên chưa thắng
  eq(E.wonBy(g, 0), 0);
  const n = E.play(g, mv(3, -4, 3, -5));
  eq([n.winner, n.reason], [0, 'squat']);
});

test('chống chiếm góc chỉ tính quân của chủ góc: quân người khác vẫn chặn (3 người)', () => {
  // Người 1 (góc 2) có góc đích 5; quân của người 0 nằm trong góc 5 không phải quân chủ góc (góc 5 không ai ở)
  const pieces = [];
  const T = E.CORNERS[5];
  T.slice(0, 9).forEach((c) => pieces.push([E.qOf(c), E.rOf(c), 1]));
  pieces.push([E.qOf(T[9]), E.rOf(T[9]), 0]);
  const g = pos(pieces, { players: 3, turns: [50, 50, 50] });
  eq(E.wonBy(g, 1), 0);
});

test('hòa khi mỗi bên đã đi 200 lượt mà chưa ai thắng', () => {
  const g = pos([[0, 0, 0], [-4, 8, 1]], { turns: [199, 199] });
  const n = E.play(g, mv(0, 0, 1, 0));
  eq(n.winner, null);
  const n2 = E.play(n, mv(-4, 8, -4, 7));
  eq([n2.winner, n2.reason], [E.DRAW, 'limit']);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lượt, số lượt, nước vừa đi, hạt giống)', () => {
  let g = E.newGame({ players: 3, seed: 99 });
  for (let i = 0; i < 7; i++) g = E.play(g, E.chooseMove(g, { level: 'easy' }).move);
  const raw = JSON.parse(JSON.stringify(E.toJSON(g)));
  const back = E.fromJSON(raw);
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.seed, 99);
  eq(E.legalMoves(back), E.legalMoves(g));
  const done = E.fromJSON(Object.assign({}, raw, { winner: 0, reason: 'home' }));
  eq(done.winner, 0);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.play(E.newGame({ players: 2, seed: 5 }), mv(-2, 6, 0, 4)));
  ok(E.fromJSON(good), 'ván tốt');
  const bad = [
    null, 1, 'x', {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { players: 4 }),
    Object.assign({}, good, { board: good.board.slice(1) }),
    Object.assign({}, good, { board: good.board.replace('0', '2') }), // người 2 không có trong ván 2 người
    Object.assign({}, good, { board: good.board.replace('0', '.') }), // thiếu một quân
    Object.assign({}, good, { board: good.board.replace('.', 'x') }),
    Object.assign({}, good, { turn: 2 }),
    Object.assign({}, good, { turn: -1 }),
    Object.assign({}, good, { ply: -1 }),
    Object.assign({}, good, { ply: 1.5 }),
    Object.assign({}, good, { turns: [1] }),
    Object.assign({}, good, { turns: [1, '0'] }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { seed: 2 ** 32 }),
    Object.assign({}, good, { last: { p: 0, path: [1] } }),
    Object.assign({}, good, { last: { p: 0, path: [200, 3] } }),
    Object.assign({}, good, { last: { p: 1, path: good.last.path } }), // lỗ cuối không phải quân người 1
    Object.assign({}, good, { winner: 3, reason: 'home' }),
    Object.assign({}, good, { winner: 0, reason: 'nope' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

/* ---------------- Máy ---------------- */

/** Chơi một ván máy đấu máy; levels[i] là mức của người i. Trả ván cuối. */
function selfPlay(levels, seed) {
  let g = E.newGame({ players: levels.length, seed });
  while (g.winner == null) {
    const r = E.chooseMove(g, { level: levels[g.turn] });
    const n = E.play(g, r.move);
    if (!n) throw new Error('máy đi sai luật: ' + r.move + ' (' + levels[g.turn] + ')');
    g = n;
  }
  return g;
}

test('máy mọi mức luôn trả nước hợp lệ và tất định theo hạt giống', () => {
  let g = E.newGame({ players: 2, seed: 3 });
  for (let i = 0; i < 24; i++) {
    for (const level of E.LEVELS) {
      const a = E.chooseMove(g, { level, seed: 11 + i });
      const b = E.chooseMove(g, { level, seed: 11 + i });
      eq(a, b, 'tất định ' + level);
      ok(E.legalMoves(g).indexOf(a.move) >= 0, level + ' đi sai luật ở nước ' + i);
    }
    g = E.play(g, E.chooseMove(g, { level: E.LEVELS[i % 3] }).move);
  }
});

test('máy mọi mức đi nước thắng ngay khi có (kể cả nước nhảy chuỗi)', () => {
  // Quân thứ 10 của máy ở (-2,2), nhảy (-2,3)→(-2,4)... : bày thang để tới lỗ còn trống (-2,6)
  const pieces = [];
  for (const c of E.CORNERS[0]) if (c !== C(-2, 6)) pieces.push([E.qOf(c), E.rOf(c), 1]);
  pieces.push([-2, 2, 1], [-2, 3, 0], [4, -8, 0], [3, -7, 0]);
  const g = pos(pieces, { turn: 1, turns: [20, 20] });
  // (-2,2) qua (-2,3) tới (-2,4), qua (-2,5) [quân máy] tới (-2,6)
  ok(E.movesFrom(g, C(-2, 2)).indexOf(C(-2, 6)) >= 0, 'có đường thắng');
  for (const level of E.LEVELS) {
    const n = E.play(g, E.chooseMove(g, { level, seed: 1 }).move);
    eq(n.winner, 1, level);
  }
});

/** Đấu `games` ván giữa hai mức, đổi bên đi trước mỗi ván. Trả [thắng của a, thắng của b, hòa]. */
function match(a, b, games, base) {
  const res = [0, 0, 0];
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1;
    const g = selfPlay(swap ? [b, a] : [a, b], base + i);
    const ai = swap ? 1 : 0;
    if (g.winner === E.DRAW) res[2]++;
    else if (g.winner === ai) res[0]++;
    else res[1]++;
  }
  return res;
}

const GAMES = 12;
test('mức mạnh dần: Khó thắng Dễ phần lớn ván (' + GAMES + ' ván, đổi bên đi trước)', () => {
  const r = match('hard', 'easy', GAMES, 100);
  console.log('       Khó - Dễ: ' + r.join(' - '));
  ok(r[0] >= GAMES * 0.75, 'Khó chỉ thắng ' + r[0]);
});

test('mức mạnh dần: Vừa thắng Dễ phần lớn ván', () => {
  const r = match('medium', 'easy', GAMES, 200);
  console.log('       Vừa - Dễ: ' + r.join(' - '));
  ok(r[0] >= GAMES * 0.7, 'Vừa chỉ thắng ' + r[0]);
});

test('mức mạnh dần: Khó thắng Vừa phần lớn ván', () => {
  const r = match('hard', 'medium', GAMES, 300);
  console.log('       Khó - Vừa: ' + r.join(' - '));
  ok(r[0] >= GAMES * 0.6, 'Khó chỉ thắng ' + r[0]);
});

test('ván 3 người (máy cả ba) mọi mức đều kết thúc', () => {
  for (const level of E.LEVELS) {
    const g = selfPlay([level, level, level], 400);
    ok(g.winner != null, level);
  }
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
