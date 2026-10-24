/* Kiểm tra engine Xoay Cờ: chạy `node test.js`
 * - Bàn 6×6, 4 góc 3×3, 32 đường 5 ô
 * - Luật xoay: xoay phải / trái đúng chiều, chỉ đổi góc được chọn, bốn lần xoay về như cũ, quân vừa đặt xoay theo
 * - Đặt quân: chỉ ô trống, lượt đổi bên; thắng / thua / hòa chỉ xét sau khi xoay
 *   (5 trước khi xoay nhưng xoay phá thì chưa thắng; tự xoay ra 5 cho đối thủ là thua; cả hai cùng 5 là hòa; đầy bàn là hòa)
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 * - Máy: mọi mức luôn đi đúng luật, thắng ngay khi được, chặn thua ngay;
 *   mức mạnh dần (Vừa thắng Dễ, Khó thắng Dễ, Khó không thua Vừa phần lớn)
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

const { FIRST, SECOND, DRAW, CW, CCW } = E;
const I = E.idx;
/** Bàn từ 6 dòng chữ (hàng trên trước), '.' trống, 'W' Trắng, 'B' Đen. */
const rows = (...r) => r.join('');
const pos = (...r) => {
  const g = E.fromString(rows(...r));
  if (!g) throw new Error('thế không hợp lệ: ' + r.join('/'));
  return g;
};
/** Bàn dạng 6 dòng để so sánh dễ đọc. */
const lines6 = (g) => E.boardString(g).match(/.{6}/g);
const mv = (r, c, q, dir) => E.encode(I(r, c), q, dir);

/* ---------------- Bàn ---------------- */

test('bàn 6×6, bốn góc 3×3 đúng vị trí', () => {
  eq(E.quadCells(0), [0, 1, 2, 6, 7, 8, 12, 13, 14]);
  eq(E.quadCells(1), [3, 4, 5, 9, 10, 11, 15, 16, 17]);
  eq(E.quadCells(2), [18, 19, 20, 24, 25, 26, 30, 31, 32]);
  eq(E.quadCells(3), [21, 22, 23, 27, 28, 29, 33, 34, 35]);
  eq([E.quadOf(I(2, 2)), E.quadOf(I(2, 3)), E.quadOf(I(3, 2)), E.quadOf(I(5, 5))], [0, 1, 2, 3]);
});

test('32 đường 5 ô: 12 ngang, 12 dọc, 8 chéo, không trùng', () => {
  eq(E.LINES.length, 32);
  const keys = new Set(E.LINES.map((l) => l.join(',')));
  eq(keys.size, 32);
  const kind = (l) => (E.rowOf(l[0]) === E.rowOf(l[4]) ? 'h' : E.colOf(l[0]) === E.colOf(l[4]) ? 'v' : 'd');
  const n = { h: 0, v: 0, d: 0 };
  E.LINES.forEach((l) => { n[kind(l)]++; });
  eq(n, { h: 12, v: 12, d: 8 });
});

test('ván mới: bàn trống, Trắng đi trước, 288 nước hợp lệ', () => {
  const g = E.newGame();
  eq([g.turn, g.ply, g.winner, E.boardString(g)], [FIRST, 0, null, '.'.repeat(36)]);
  eq(E.legalMoves(g).length, 36 * 8);
});

/* ---------------- Luật xoay ---------------- */

test('xoay phải (theo kim đồng hồ): góc trên trái', () => {
  // Góc 0 có quân ở (0,0) W, (0,1) B; đặt Trắng ở (5,5) rồi xoay góc 0 sang phải
  const g = pos('WB....', '......', '......', '......', '......', '......');
  const n = E.play(g, mv(5, 5, 0, CW));
  eq(lines6(n), ['..W...', '..B...', '......', '......', '......', '.....W']);
});

test('xoay trái (ngược kim đồng hồ): góc dưới phải', () => {
  // Góc 3 (hàng 3–5, cột 3–5): W ở (3,3), B ở (3,4) → xoay trái: (i,j) -> (2-j, i)
  const g = pos('......', '......', '......', '...WB.', '......', '......');
  const n = E.play(g, mv(0, 0, 3, CCW));
  eq(lines6(n), ['W.....', '......', '......', '......', '...B..', '...W..']);
});

test('xoay chỉ đổi góc được chọn; bốn lần xoay cùng chiều về như cũ', () => {
  const start = 'WB.W..' + '.B..W.' + 'B.W...' + '..B.W.' + 'W.....' + '.B...B';
  const b = start.split('');
  for (let q = 0; q < 4; q++) {
    for (const dir of [CW, CCW]) {
      let cells = b.slice();
      const quad = new Set(E.quadCells(q));
      const rot = () => {
        const next = cells.slice();
        for (const s of quad) next[E.rotateCell(s, q, dir)] = cells[s];
        cells = next;
      };
      rot();
      for (let s = 0; s < 36; s++) if (!quad.has(s)) eq(cells[s], b[s], 'ô ngoài góc ' + s);
      rot(); rot(); rot();
      eq(cells.join(''), start, 'bốn lần xoay góc ' + q);
    }
  }
  // Xoay phải rồi xoay trái cùng góc là như cũ
  for (let q = 0; q < 4; q++) for (let s = 0; s < 36; s++) eq(E.rotateCell(E.rotateCell(s, q, CW), q, CCW), s);
});

test('quân vừa đặt trong góc xoay theo góc; last.at là chỗ mới', () => {
  const g = E.newGame();
  const n = E.play(g, mv(0, 0, 0, CW)); // đặt góc trên trái rồi xoay phải: (0,0) -> (0,2)
  eq(lines6(n)[0], '..W...');
  eq(n.last, { side: FIRST, cell: I(0, 0), at: I(0, 2), q: 0, dir: CW });
  const m = E.play(g, mv(0, 0, 0, CCW)); // xoay trái: (0,0) -> (2,0)
  eq(lines6(m)[2], 'W.....');
  eq(m.last.at, I(2, 0));
  const k = E.play(g, mv(4, 4, 3, CW)); // ô giữa góc đứng yên
  eq(k.last.at, I(4, 4));
});

/* ---------------- Đặt quân và lượt ---------------- */

test('chỉ đặt vào ô trống; lượt đổi bên; ván cũ không đổi', () => {
  const g = E.play(E.newGame(), mv(1, 1, 3, CW));
  eq([g.turn, g.ply], [SECOND, 1]);
  const before = E.boardString(g);
  eq(E.play(g, mv(1, 1, 0, CW)), null, 'đặt chồng quân');
  eq(E.play(g, -1), null);
  eq(E.play(g, 36 * 8), null);
  eq(E.play(g, 1.5), null);
  eq(E.boardString(g), before);
  const h = E.play(g, mv(2, 2, 1, CCW));
  eq([h.turn, h.ply, h.board[I(2, 2)]], [FIRST, 2, 2]);
});

test('nước khác nhau thật sự: bàn trống còn 100, mọi nước trong đó đều hợp lệ', () => {
  const g = E.newGame();
  const u = E.uniqueMoves(g);
  eq(u.length, 100);
  const legal = new Set(E.legalMoves(g));
  u.forEach((m) => ok(legal.has(m)));
  // Mọi thế sau nước hợp lệ đều có trong các thế sau nước khác nhau thật sự
  const seen = new Set(u.map((m) => E.boardString(E.play(g, m))));
  E.legalMoves(g).forEach((m) => ok(seen.has(E.boardString(E.play(g, m))), 'thiếu thế của nước ' + m));
});

test('nước khác nhau thật sự giữa ván phủ đủ mọi thế', () => {
  const rng = E.mulberry32(9);
  let g = E.newGame();
  for (let i = 0; i < 12; i++) {
    const ms = E.legalMoves(g);
    g = E.play(g, ms[Math.floor(rng() * ms.length)]);
    if (g.winner != null) break;
    const want = new Set(E.legalMoves(g).map((m) => E.boardString(E.play(g, m))));
    const got = new Set(E.uniqueMoves(g).map((m) => E.boardString(E.play(g, m))));
    eq(got.size, want.size, 'ply ' + g.ply);
  }
});

/* ---------------- Thắng / thua / hòa ---------------- */

test('5 liền hàng ngang sau khi xoay là thắng', () => {
  // Trắng có (0,0)..(0,3); đặt (0,4) rồi xoay góc dưới trái (không chạm hàng 0)
  const g = pos('WWWW..', 'BB....', 'BB....', '......', '......', '......');
  const n = E.play(g, mv(0, 4, 2, CW));
  eq([n.winner, n.reason], [FIRST, 'five']);
  eq(n.lines.map((i) => E.LINES[i]), [[0, 1, 2, 3, 4]]);
  eq(E.legalMoves(n), [], 'hết ván không còn nước');
  eq(E.play(n, mv(5, 5, 3, CW)), null);
});

test('5 liền hàng dọc và chéo đều thắng', () => {
  const v = pos('W.....', 'W.....', 'W.....', 'W.....', '......', 'BBBB..');
  // Đen đang tới lượt? Trắng 4, Đen 4 → Trắng đi
  eq(v.turn, FIRST);
  eq(E.play(v, mv(4, 0, 1, CW)).winner, FIRST);
  const d = pos('W.....', '.W....', '..W...', '...W..', '......', 'BB..BB');
  eq(E.play(d, mv(4, 4, 1, CW)).winner, FIRST);
  const a = pos('.....W', '....W.', '...W..', '..W...', '......', 'BB..BB');
  eq(E.play(a, mv(4, 1, 0, CW)).winner, FIRST); // góc 1 chứa ba quân của đường chéo: xoay góc 0
});

test('5 nhờ xoay: đặt quân rồi xoay góc đưa quân vào hàng là thắng', () => {
  // Góc 0 có W ở (0,0),(1,0),(2,0) (cột trái); xoay phải góc 0 thì cột trái thành hàng trên (0,0),(0,1),(0,2)
  // Trắng đã có (0,3); đặt (0,4) rồi xoay phải góc 0 → hàng 0 có 5: (0,0)..(0,4)
  const g = pos('W..W..', 'W.....', 'W.....', '......', 'BBBB..', '......');
  const n = E.play(g, mv(0, 4, 0, CW));
  eq(lines6(n)[0], 'WWWWW.');
  eq(n.winner, FIRST);
});

test('5 trước khi xoay nhưng xoay phá mất thì chưa thắng', () => {
  // Trắng đặt (0,4) có 5 ở hàng 0, nhưng xoay góc 1 (chứa (0,3),(0,4)) làm vỡ hàng
  const g = pos('WWWW..', 'BB....', 'BB....', '......', '......', '......');
  const n = E.play(g, mv(0, 4, 1, CW));
  eq(n.winner, null);
  eq(lines6(n)[0], 'WWW..W');
});

test('tự xoay ra 5 cho đối thủ là thua', () => {
  // Đen có (3,0),(3,1),(3,2) và ở góc 3 cột trái (4,3),(5,3). Xoay phải góc 3: (i,j)->(j,2-i): (1,0)->(0,1), (2,0)->(0,0)
  //   → (3,3),(3,4) thành Đen: hàng 3 có (3,0)..(3,4) = 5 quân Đen.
  const g = pos('W.W.W.', '.W....', '......', 'BBB...', '...B..', '...B.W');
  eq(g.turn, FIRST);
  const n = E.play(g, mv(0, 1, 3, CW)); // Trắng đặt (0,1) rồi (dại dột) xoay phải góc 3
  eq(lines6(n)[3], 'BBBBB.');
  eq([n.winner, n.reason], [SECOND, 'five']);
});

test('cả hai cùng có 5 sau một lần xoay là hòa', () => {
  // Trắng đặt (0,4) đủ 5 ở hàng 0, rồi xoay trái góc 3 (không chạm hàng 0):
  //   Đen hàng 5 có (5,0),(5,1),(5,2); cột trái góc 3 (3,3),(4,3) xoay trái (i,j)->(2-j,i) thành (5,3),(5,4)
  const g = pos('WWWW..', '.W....', '......', '...B..', '...B..', 'BBB...');
  eq(g.turn, FIRST);
  const n = E.play(g, mv(0, 4, 3, CCW));
  eq(lines6(n)[0], 'WWWWW.');
  eq(lines6(n)[5], 'BBBBB.');
  eq([n.winner, n.reason], [DRAW, 'both']);
  eq(n.lines.length, 2);
});

test('đầy bàn mà không ai có 5 là hòa', () => {
  // Bàn 35 quân không có 5; quân cuối đặt vào ô trống, xoay góc giữ không có 5
  const full = 'WWBBWW' + 'BBWWBB' + 'WWBBWW' + 'BBWWBB' + 'WWBBWW' + 'BBWWB.';
  const g = E.fromString(full);
  ok(g && g.winner == null && g.ply === 35 && g.turn === SECOND);
  // Thử mọi nước: không nước nào cho 5 thì ván hòa vì đầy bàn
  let drawFull = 0;
  for (const m of E.legalMoves(g)) {
    const n = E.play(g, m);
    if (n.reason === 'full') {
      eq(n.winner, DRAW);
      drawFull++;
    }
  }
  ok(drawFull > 0, 'phải có nước hòa vì đầy bàn');
});

test('ván ngẫu nhiên luôn kết thúc trong 36 nước', () => {
  const reasons = {};
  for (let seed = 1; seed <= 200; seed++) {
    const rng = E.mulberry32(seed * 7919);
    let g = E.newGame();
    while (g.winner == null) {
      const ms = E.legalMoves(g);
      ok(ms.length > 0);
      g = E.play(g, ms[Math.floor(rng() * ms.length)]);
    }
    ok(g.ply <= 36);
    reasons[g.reason] = (reasons[g.reason] || 0) + 1;
  }
  ok(reasons.five > 0);
  console.log('       (200 ván ngẫu nhiên: ' + JSON.stringify(reasons) + ')');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả nước vừa đi)', () => {
  let g = E.newGame();
  [mv(0, 0, 0, CW), mv(3, 3, 3, CCW), mv(1, 4, 1, CW)].forEach((m) => { g = E.play(g, m); });
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.fromJSON(E.toJSON(E.newGame())), E.newGame());
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.play(E.newGame(), mv(0, 0, 0, CW)));
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { board: '.'.repeat(35) }),
    Object.assign({}, good, { board: 'X' + '.'.repeat(35) }),
    Object.assign({}, good, { board: 'BB' + '.'.repeat(34), last: null }), // Đen nhiều quân hơn
    Object.assign({}, good, { board: 'WWW' + '.'.repeat(33), last: null }), // Trắng hơn hai quân
    Object.assign({}, good, { last: { cell: 36, q: 0, dir: 0 } }),
    Object.assign({}, good, { last: { cell: 0, q: 4, dir: 0 } }),
    Object.assign({}, good, { last: { cell: 0, q: 0, dir: 2 } }),
    Object.assign({}, good, { last: { cell: 5, q: 0, dir: 0 } }), // quân vừa đặt không ở đó
    Object.assign({}, good, { last: 'x' }),
    { v: 1, board: '.'.repeat(36), last: { cell: 0, q: 0, dir: 0 } }, // bàn trống mà có nước vừa đi
    // Ván đã kết thúc (Trắng có 5) không được mở lại
    { v: 1, board: 'WWWWW.' + 'BBBB..' + '.'.repeat(24), last: null },
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

/* ---------------- Máy ---------------- */

const LEVELS = E.LEVELS;
// Khó trong test: độ sâu cố định, không giới hạn giờ, để kết quả tất định trên mọi máy
const HARD_TEST = { maxDepth: 3, timeMs: Infinity };
const opt = (level, seed) => Object.assign({ level, seed }, level === 'hard' ? HARD_TEST : {});

function randomPosition(seed, n) {
  const rng = E.mulberry32(seed);
  let g = E.newGame();
  for (let i = 0; i < n; i++) {
    const ms = E.uniqueMoves(g);
    const next = E.play(g, ms[Math.floor(rng() * ms.length)]);
    if (next.winner != null) break;
    g = next;
  }
  return g;
}

test('máy mọi mức luôn trả nước hợp lệ (thế đầu và giữa ván)', () => {
  const positions = [E.newGame()];
  for (let seed = 1; positions.length < 6; seed++) positions.push(randomPosition(seed, 4 + seed * 3));
  for (const g of positions) {
    for (const level of LEVELS) {
      const r = E.chooseMove(g, opt(level, 7));
      ok(E.legalMoves(g).includes(r.move), level + ' trả nước sai ở ' + E.boardString(g));
    }
  }
});

test('máy mọi mức thắng ngay khi có thể', () => {
  const g = pos('WWWW..', 'BB....', 'BB....', '......', '......', '......');
  for (const level of LEVELS) {
    const n = E.play(g, E.chooseMove(g, opt(level, 3)).move);
    eq(n.winner, FIRST, level);
  }
  // Thắng nhờ xoay (không có ô trống nào tự thành 5)
  const r = pos('W..W..', 'W.....', 'W.....', '......', 'BBBB..', '......');
  for (const level of LEVELS) eq(E.play(r, E.chooseMove(r, opt(level, 4)).move).winner, FIRST, level + ' (xoay)');
});

test('máy mọi mức chặn đòn thắng ngay của đối thủ', () => {
  // Đen tới lượt; Trắng dọa (0,4) ở hàng 0. Sau nước của máy, Trắng không còn nước thắng ngay
  const g = pos('WWWW..', '......', '......', '...B..', '...B..', 'B.....');
  eq(g.turn, SECOND);
  for (const level of LEVELS) {
    for (let seed = 1; seed <= 4; seed++) {
      const n = E.play(g, E.chooseMove(g, opt(level, seed)).move);
      ok(n.winner == null, level + ' tự kết thúc ván');
      const win = E.uniqueMoves(n).some((m) => E.play(n, m).winner === FIRST);
      ok(!win, level + ' (seed ' + seed + ') không chặn được');
    }
  }
});

test('máy không tự xoay ra 5 cho đối thủ', () => {
  // Như thế ở test "tự xoay ra 5": xoay phải góc 3 là tự thua
  const g = pos('W.W.W.', '.W....', '......', 'BBB...', '...B..', '...B.W');
  for (const level of LEVELS) {
    for (let seed = 1; seed <= 6; seed++) {
      const n = E.play(g, E.chooseMove(g, opt(level, seed)).move);
      ok(n.winner !== SECOND, level + ' tự xoay ra 5 cho Đen');
    }
  }
});

test('máy Khó (có giới hạn giờ) đi xong thế đầu và giữa ván đúng hạn', () => {
  for (const g of [E.newGame(), randomPosition(3, 8)]) {
    const t0 = Date.now();
    const r = E.chooseMove(g, { level: 'hard', seed: 1, timeMs: 1500 });
    const ms = Date.now() - t0;
    ok(E.legalMoves(g).includes(r.move));
    ok(ms < 3000, 'quá chậm: ' + ms + 'ms');
    console.log('       (Khó ply ' + g.ply + ': độ sâu ' + r.depth + ', ' + r.nodes + ' nút, ' + ms + 'ms)');
  }
});

/** Đấu n ván, đổi bên đi trước mỗi ván; trả số ván thắng / thua / hòa của mức a. */
function match(a, b, n, seed0) {
  const res = { win: 0, loss: 0, draw: 0 };
  for (let i = 0; i < n; i++) {
    const aSide = i % 2; // ván chẵn a cầm Trắng (đi trước), ván lẻ cầm Đen
    let g = E.newGame();
    // Hai nước đầu ngẫu nhiên theo hạt giống để các ván khác nhau
    const rng = E.mulberry32(seed0 + i * 31);
    for (let k = 0; k < 2; k++) {
      const ms = E.uniqueMoves(g);
      g = E.play(g, ms[Math.floor(rng() * ms.length)]);
    }
    while (g.winner == null) {
      const level = g.turn === aSide ? a : b;
      const r = E.chooseMove(g, opt(level, seed0 + i * 977 + g.ply));
      g = E.play(g, r.move);
      ok(g, 'nước sai');
    }
    if (g.winner === DRAW) res.draw++;
    else if (g.winner === aSide) res.win++;
    else res.loss++;
  }
  return res;
}

test('mức mạnh dần: Vừa thắng Dễ phần lớn', () => {
  const r = match('medium', 'easy', 20, 100);
  console.log('       (Vừa vs Dễ, 20 ván: ' + JSON.stringify(r) + ')');
  ok(r.win >= 16, 'Vừa thắng quá ít');
});

test('mức mạnh dần: Khó thắng Dễ phần lớn', () => {
  const r = match('hard', 'easy', 20, 200);
  console.log('       (Khó vs Dễ, 20 ván: ' + JSON.stringify(r) + ')');
  ok(r.win >= 18, 'Khó thắng quá ít');
});

test('mức mạnh dần: Khó hơn Vừa', () => {
  const r = match('hard', 'medium', 20, 300);
  console.log('       (Khó vs Vừa, 20 ván: ' + JSON.stringify(r) + ')');
  ok(r.win > r.loss * 2, 'Khó không hơn Vừa rõ rệt');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
