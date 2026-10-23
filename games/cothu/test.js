/* Kiểm tra engine Cờ Thú: chạy `node test.js`
 * - Bàn 7×9, bày quân ban đầu, đếm nước kiểu perft trên vài thế cờ đã đếm tay
 * - Đi một bước, sông chỉ Chuột xuống được, Sư Tử / Hổ nhảy sông và bị Chuột dưới nước chặn
 * - Ăn quân theo bậc, Chuột ăn Voi, Voi không ăn Chuột, ranh giới nước / cạn, bẫy hạ bậc về 0
 * - Hang: không vào hang mình, vào hang đối thủ là thắng; ăn hết quân, hết nước đi, hòa lặp lại / 200 nước không ăn
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 * - Máy: mọi mức luôn trả nước hợp lệ, vào hang khi được, chặn đòn vào hang; máy ngẫu nhiên đấu nhau luôn kết thúc
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

const { RED, BLUE, DRAW } = E;
const S = E.sq;
/** Các ô đích (dạng "x,y", đã sắp) của quân ở (x, y). */
const targets = (g, x, y) => E.movesFrom(g, S(x, y)).map((t) => E.xOf(t) + ',' + E.yOf(t)).sort();
const mv = (x1, y1, x2, y2) => E.encode(S(x1, y1), S(x2, y2));
/** Thế cờ tự bày: [chữ quân, x, y], chữ hoa là Đỏ, chữ thường là Xanh; mặc định Đỏ đi. */
const pos = (pieces, turn, opts) => {
  const g = E.fromPieces(pieces, turn == null ? RED : turn, opts);
  if (!g) throw new Error('thế cờ không hợp lệ: ' + JSON.stringify(pieces));
  return g;
};

/* ---------------- Bàn và bày quân ---------------- */

test('bàn 7×9: hai sông 3×2, bẫy quanh hang, hang giữa hàng cuối', () => {
  eq([E.W, E.H], [7, 9]);
  let water = 0;
  for (let s = 0; s < 63; s++) if (E.isWater(s)) water++;
  eq(water, 12, 'số ô nước');
  eq([1, 2, 4, 5].every((x) => [3, 4, 5].every((y) => E.isWater(S(x, y)))), true);
  eq([E.DEN[RED], E.DEN[BLUE]], [S(3, 8), S(3, 0)]);
  eq([S(2, 8), S(4, 8), S(3, 7)].map(E.trapOwner), [RED, RED, RED]);
  eq([S(2, 0), S(4, 0), S(3, 1)].map(E.trapOwner), [BLUE, BLUE, BLUE]);
  eq(E.trapOwner(S(3, 4)), -1);
});

test('bày quân ban đầu: Đỏ ở dưới đi trước, đối xứng tâm', () => {
  const g = E.newGame();
  eq(g.turn, RED);
  eq(g.winner, null);
  eq(E.boardString(g), 'l.....t' + '.d...c.' + 'r.p.w.e' + '.......' + '.......' + '.......' + 'E.W.P.R' + '.C...D.' + 'T.....L');
  for (let s = 0; s < 63; s++) eq(g.board[s], -g.board[62 - s], 'đối xứng ô ' + s);
});

test('perft thế đầu: 24 nước, 576 ở độ sâu 2 (đếm tay)', () => {
  const g = E.newGame();
  // Voi 3, Sói 3, Báo 3, Chuột 3, Mèo 4, Chó 4, Hổ 2, Sư Tử 2
  eq(E.legalMoves(g).length, 24);
  eq(E.perft(g, 1), 24);
  // Hai bên cách nhau ba hàng sông: nước của Đỏ không đổi số nước của Xanh
  eq(E.perft(g, 2), 576);
});

test('perft thế tự bày: Sư Tử giữa hai sông, Chuột dưới nước', () => {
  // Đỏ: Sư Tử (3,4), Chuột (1,4) ở sông trái. Xanh: Mèo (6,0).
  // Sư Tử: lên, xuống, nhảy phải sang (6,4); nhảy trái bị chính Chuột của mình chặn → 3
  // Chuột: lên (1,3), xuống (1,5), trái (0,4), phải (2,4) → 4
  const g = pos([['L', 3, 4], ['R', 1, 4], ['c', 6, 0]]);
  eq(targets(g, 3, 4), ['3,3', '3,5', '6,4']);
  eq(targets(g, 1, 4), ['0,4', '1,3', '1,5', '2,4']);
  eq(E.perft(g, 1), 7);
  // Xanh: Mèo ở góc (6,0) có 2 nước sau mọi nước của Đỏ → 7 × 2
  eq(E.perft(g, 2), 14);
});

/* ---------------- Đi quân ---------------- */

test('đi một ô theo hàng / cột, không đi chéo, không ra ngoài bàn', () => {
  const g = pos([['D', 0, 8], ['c', 6, 0]]);
  eq(targets(g, 0, 8), ['0,7', '1,8']);
  const h = pos([['D', 3, 4], ['c', 6, 0]]);
  eq(targets(h, 3, 4), ['3,3', '3,5'], 'giữa hai sông: hai bên là nước');
});

test('chỉ Chuột xuống nước; Chuột đi lại được dưới nước và lên bờ', () => {
  for (const L of ['C', 'D', 'W', 'P', 'E']) {
    const g = pos([[L, 0, 4], ['c', 6, 0]]);
    eq(targets(g, 0, 4), ['0,3', '0,5'], L + ' không xuống nước');
  }
  const r = pos([['R', 0, 4], ['c', 6, 0]]);
  eq(targets(r, 0, 4), ['0,3', '0,5', '1,4']);
  const w = pos([['R', 2, 3], ['c', 6, 0]]);
  eq(targets(w, 2, 3), ['1,3', '2,2', '2,4', '3,3']);
});

test('không vào hang của mình', () => {
  const g = pos([['D', 3, 7], ['c', 6, 0]]);
  eq(targets(g, 3, 7), ['2,7', '3,6', '4,7']);
  const b = pos([['d', 2, 0], ['C', 6, 8]], BLUE);
  eq(targets(b, 2, 0), ['1,0', '2,1']);
});

/* ---------------- Nhảy sông ---------------- */

test('Sư Tử và Hổ nhảy ngang qua sông', () => {
  for (const L of ['L', 'T']) {
    const g = pos([[L, 0, 4], ['c', 6, 0]]);
    eq(targets(g, 0, 4), ['0,3', '0,5', '3,4'], L + ' từ bờ trái');
    const h = pos([[L, 6, 3], ['c', 6, 0]]);
    eq(targets(h, 6, 3), ['3,3', '6,2', '6,4'], L + ' từ bờ phải');
    const m = pos([[L, 3, 5], ['c', 6, 0]]);
    eq(targets(m, 3, 5), ['0,5', '3,4', '3,6', '6,5'], L + ' giữa hai sông nhảy cả hai phía');
  }
});

test('Sư Tử và Hổ nhảy dọc qua sông (qua 3 ô nước)', () => {
  for (const L of ['L', 'T']) {
    const g = pos([[L, 1, 6], ['c', 6, 0]]);
    eq(targets(g, 1, 6), ['0,6', '1,2', '1,7', '2,6'], L + ' từ dưới lên');
    const h = pos([[L, 5, 2], ['c', 6, 8]]);
    eq(targets(h, 5, 2), ['4,2', '5,1', '5,6', '6,2'], L + ' từ trên xuống');
  }
});

test('quân khác không nhảy sông', () => {
  const g = pos([['P', 1, 6], ['c', 6, 0]]);
  eq(targets(g, 1, 6), ['0,6', '1,7', '2,6']);
});

test('Chuột (bên nào cũng vậy) dưới nước trên đường nhảy chặn Sư Tử / Hổ', () => {
  // Ngang: Chuột ở (1,4) hoặc (2,4) chặn (0,4) → (3,4)
  eq(targets(pos([['L', 0, 4], ['r', 1, 4]]), 0, 4), ['0,3', '0,5']);
  eq(targets(pos([['L', 0, 4], ['r', 2, 4]]), 0, 4), ['0,3', '0,5']);
  eq(targets(pos([['T', 0, 4], ['R', 2, 4], ['c', 6, 0]]), 0, 4), ['0,3', '0,5'], 'Chuột phe mình cũng chặn');
  // Chuột không nằm trên đường nhảy thì không chặn
  eq(targets(pos([['L', 0, 4], ['r', 1, 3]]), 0, 4), ['0,3', '0,5', '3,4']);
  eq(targets(pos([['L', 3, 4], ['r', 1, 4]]), 3, 4), ['3,3', '3,5', '6,4'], 'chỉ chặn phía có Chuột');
  // Dọc: Chuột ở (1,3), (1,4) hoặc (1,5) chặn (1,6) → (1,2)
  for (const y of [3, 4, 5]) eq(targets(pos([['T', 1, 6], ['r', 1, y]]), 1, 6), ['0,6', '1,7', '2,6'], 'Chuột ở 1,' + y);
  eq(targets(pos([['T', 1, 6], ['r', 2, 4]]), 1, 6), ['0,6', '1,2', '1,7', '2,6'], 'Chuột ở cột khác');
});

test('nhảy sông ăn quân ở bờ bên kia theo bậc, không đáp lên quân mình', () => {
  eq(targets(pos([['L', 0, 4], ['t', 3, 4]]), 0, 4), ['0,3', '0,5', '3,4'], 'Sư Tử ăn Hổ');
  eq(targets(pos([['T', 0, 4], ['l', 3, 4]]), 0, 4), ['0,3', '0,5'], 'Hổ không ăn Sư Tử');
  eq(targets(pos([['L', 0, 4], ['e', 3, 4]]), 0, 4), ['0,3', '0,5'], 'Sư Tử không ăn Voi');
  eq(targets(pos([['L', 0, 4], ['D', 3, 4], ['c', 6, 0]]), 0, 4), ['0,3', '0,5'], 'không đáp lên quân mình');
  const g = E.play(pos([['T', 1, 6], ['w', 1, 2], ['c', 6, 0]]), mv(1, 6, 1, 2));
  eq([g.board[S(1, 2)], g.board[S(1, 6)], g.last.captured], [E.TIGER, 0, -E.WOLF]);
});

/* ---------------- Ăn quân ---------------- */

test('ăn quân bậc bằng hoặc thấp hơn, không ăn quân bậc cao hơn', () => {
  eq(targets(pos([['W', 0, 7], ['w', 0, 6]]), 0, 7), ['0,6', '0,8', '1,7'], 'bằng bậc');
  eq(targets(pos([['W', 0, 7], ['d', 0, 6]]), 0, 7), ['0,6', '0,8', '1,7'], 'thấp hơn');
  eq(targets(pos([['W', 0, 7], ['p', 0, 6]]), 0, 7), ['0,8', '1,7'], 'cao hơn');
  eq(targets(pos([['E', 0, 7], ['l', 0, 6]]), 0, 7), ['0,6', '0,8', '1,7'], 'Voi ăn Sư Tử');
  eq(targets(pos([['C', 0, 7], ['r', 0, 6]]), 0, 7), ['0,6', '0,8', '1,7'], 'Mèo ăn Chuột');
  // Không ăn quân mình
  eq(targets(pos([['E', 0, 7], ['R', 0, 6], ['c', 6, 0]]), 0, 7), ['0,8', '1,7']);
  for (const [a, d] of [[8, 1], [1, 8], [7, 6], [6, 7], [3, 3], [2, 1], [1, 2], [8, 8], [5, 4]]) {
    const g = pos([[E.LETTERS[a], 0, 7], [E.LETTERS[d].toLowerCase(), 0, 6]]);
    const want = (a === 1 && d === 8) || (a >= d && !(a === 8 && d === 1));
    eq(E.canCapture(g.board, S(0, 7), S(0, 6)), want, a + ' ăn ' + d);
  }
});

test('Chuột ăn Voi, Voi không ăn Chuột', () => {
  eq(targets(pos([['R', 0, 7], ['e', 0, 6]]), 0, 7), ['0,6', '0,8', '1,7']);
  eq(targets(pos([['E', 0, 7], ['r', 0, 6]]), 0, 7), ['0,8', '1,7']);
  const g = E.play(pos([['R', 0, 7], ['e', 0, 6], ['c', 6, 0]]), mv(0, 7, 0, 6));
  eq([g.board[S(0, 6)], g.last.captured], [E.RAT, -E.ELEPHANT]);
});

test('Chuột dưới nước không ăn quân trên cạn và ngược lại; Chuột nước ăn Chuột nước', () => {
  eq(targets(pos([['R', 1, 3], ['e', 1, 2]]), 1, 3), ['0,3', '1,4', '2,3'], 'Chuột nước không ăn Voi trên bờ');
  eq(targets(pos([['R', 1, 3], ['r', 1, 2]]), 1, 3), ['0,3', '1,4', '2,3'], 'Chuột nước không ăn Chuột trên bờ');
  eq(targets(pos([['R', 1, 2], ['r', 1, 3]]), 1, 2), ['0,2', '1,1', '2,2'], 'Chuột bờ không ăn Chuột nước');
  eq(targets(pos([['R', 1, 3], ['r', 2, 3]]), 1, 3), ['0,3', '1,2', '1,4', '2,3'], 'Chuột nước ăn Chuột nước');
  eq(targets(pos([['R', 0, 3], ['r', 0, 2]]), 0, 3), ['0,2', '0,4', '1,3'], 'Chuột bờ ăn Chuột bờ');
});

test('quân đứng trong bẫy của đối thủ có bậc 0: quân nào cũng ăn được', () => {
  // Sư Tử Xanh đứng trong bẫy của Đỏ (2,8): Mèo Đỏ ăn được
  eq(targets(pos([['C', 1, 8], ['l', 2, 8]]), 1, 8), ['0,8', '1,7', '2,8']);
  // Cùng Sư Tử đứng ngoài bẫy (2,7) thì không
  eq(targets(pos([['C', 1, 7], ['l', 2, 7]]), 1, 7), ['0,7', '1,6', '1,8']);
  // Bẫy (3,7) và (4,8) cũng vậy
  eq(targets(pos([['R', 3, 6], ['e', 3, 7]]), 3, 6).includes('3,7'), true);
  eq(targets(pos([['C', 5, 8], ['t', 4, 8]]), 5, 8).includes('4,8'), true);
  // Voi ăn được cả Chuột đứng trong bẫy của bên Voi (bậc 0)
  eq(targets(pos([['E', 1, 8], ['r', 2, 8]]), 1, 8).includes('2,8'), true);
  // Bên Xanh: quân Đỏ trong bẫy Xanh (3,1)
  eq(targets(pos([['L', 3, 1], ['r', 3, 2]], BLUE), 3, 2).includes('3,1'), true);
});

test('quân đứng trong bẫy của mình giữ nguyên bậc', () => {
  // Sư Tử Đỏ ở bẫy Đỏ (2,8): Mèo Xanh không ăn được
  eq(targets(pos([['L', 2, 8], ['c', 1, 8]], BLUE), 1, 8), ['0,8', '1,7']);
});

test('quân trong bẫy đối thủ vẫn ăn quân khác theo bậc của nó', () => {
  // Sư Tử Đỏ đứng ở bẫy Xanh (2,0), cạnh Hổ Xanh (1,0): vẫn ăn được (bậc 0 chỉ tính khi bị ăn)
  eq(targets(pos([['L', 2, 0], ['t', 1, 0]]), 2, 0), ['1,0', '2,1', '3,0']);
});

/* ---------------- Thắng / hòa ---------------- */

test('vào hang đối thủ là thắng ngay', () => {
  const g = E.play(pos([['D', 3, 1], ['c', 6, 2]]), mv(3, 1, 3, 0));
  eq([g.winner, g.reason], [RED, 'den']);
  eq(E.legalMoves(g), [], 'hết ván thì không còn nước');
  eq(E.play(g, mv(6, 2, 6, 1)), null);
  const b = E.play(pos([['r', 4, 8], ['C', 0, 0]], BLUE), mv(4, 8, 3, 8));
  eq([b.winner, b.reason], [BLUE, 'den']);
});

test('ăn hết quân đối thủ là thắng', () => {
  const g = E.play(pos([['E', 0, 7], ['l', 0, 6]]), mv(0, 7, 0, 6));
  eq([g.winner, g.reason], [RED, 'wipe']);
});

test('bên phải đi mà không còn nước hợp lệ thì thua', () => {
  // Mèo Xanh ở góc (0,0) bị Chó Đỏ (1,0) chặn; Sói Đỏ lên (0,1) thì Xanh hết nước
  const g = pos([['c', 0, 0], ['D', 1, 0], ['W', 0, 2], ['R', 6, 8]]);
  eq(g.winner, null);
  const h = E.play(g, mv(0, 2, 0, 1));
  eq([h.winner, h.reason], [RED, 'stuck']);
  eq(E.legalMoves(h), []);
});

test('200 nước liền không ăn quân là hòa', () => {
  const g = pos([['L', 6, 8], ['l', 0, 0]], RED, { quiet: 199 });
  const h = E.play(g, mv(6, 8, 6, 7));
  eq([h.winner, h.reason, h.quiet], [DRAW, 'quiet', 200]);
  // Ăn quân thì đếm lại từ 0
  const c = E.play(pos([['L', 6, 8], ['c', 6, 7], ['l', 0, 0]], RED, { quiet: 199 }), mv(6, 8, 6, 7));
  eq([c.winner, c.quiet], [null, 0]);
});

test('lặp lại cùng thế cờ ba lần là hòa', () => {
  let g = E.newGame();
  const loop = [mv(6, 8, 6, 7), mv(0, 0, 0, 1), mv(6, 7, 6, 8), mv(0, 1, 0, 0)];
  for (let i = 0; i < 8; i++) {
    eq(g.winner, null, 'nước ' + i);
    g = E.play(g, loop[i % 4]);
    ok(g, 'nước ' + i + ' hợp lệ');
  }
  eq([g.winner, g.reason, g.ply], [DRAW, 'repeat', 8]);
});

test('play từ chối nước sai luật và không đổi ván cũ', () => {
  const g = E.newGame();
  const before = E.boardString(g);
  eq(E.play(g, mv(0, 0, 0, 1)), null, 'quân của bên kia');
  eq(E.play(g, mv(0, 6, 0, 4)), null, 'đi hai ô');
  eq(E.play(g, mv(0, 6, 1, 5)), null, 'đi chéo');
  eq(E.play(g, mv(2, 6, 2, 5)), null, 'Sói xuống nước');
  eq(E.play(g, mv(3, 3, 3, 4)), null, 'ô trống');
  eq(E.play(g, 'x'), null);
  const h = E.play(g, mv(0, 6, 0, 5));
  ok(h);
  eq(E.boardString(g), before, 'ván cũ giữ nguyên');
  eq([h.turn, h.ply, h.quiet, h.last.from, h.last.to], [BLUE, 1, 1, S(0, 6), S(0, 5)]);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử lặp lại)', () => {
  let g = E.newGame();
  for (const m of [mv(6, 8, 6, 7), mv(0, 0, 0, 1), mv(6, 7, 6, 8), mv(0, 1, 0, 0), mv(6, 8, 6, 7)]) g = E.play(g, m);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back);
  eq(E.toJSON(back), E.toJSON(g));
  eq([back.turn, back.ply, back.quiet, back.last], [g.turn, g.ply, g.quiet, g.last]);
  // Lặp tiếp đủ ba lần trên ván khôi phục vẫn hòa đúng lúc
  let h = back;
  for (const m of [mv(0, 0, 0, 1), mv(6, 7, 6, 8), mv(0, 1, 0, 0)]) h = E.play(h, m);
  eq([h.winner, h.reason], [DRAW, 'repeat']);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.play(E.newGame(), mv(0, 6, 0, 5)));
  ok(E.fromJSON(good));
  const noW = good.board.replace('W', '.');
  const noC = good.board.replace('C', '.');
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { board: good.board.slice(1) }),
    Object.assign({}, good, { board: 'X' + good.board.slice(1) }),
    Object.assign({}, good, { board: 'E' + good.board.slice(1) }), // hai con Voi Đỏ
    Object.assign({}, good, { board: noW.slice(0, 22) + 'W' + noW.slice(23) }), // Sói xuống nước (1,3)
    Object.assign({}, good, { board: noC.slice(0, 59) + 'C' + noC.slice(60) }), // quân Đỏ trong hang Đỏ
    Object.assign({}, good, { board: good.board.toLowerCase() }), // hai con mỗi loại bên Xanh
    Object.assign({}, good, { board: good.board.replace(/[A-Z]/g, '.') }), // hết quân Đỏ
    Object.assign({}, good, { turn: 2 }),
    Object.assign({}, good, { quiet: -1 }),
    Object.assign({}, good, { quiet: 200 }),
    Object.assign({}, good, { ply: 1.5 }),
    Object.assign({}, good, { seen: 'abc' }),
    Object.assign({}, good, { seen: [1, 2] }),
    Object.assign({}, good, { last: { from: 99, to: 1 } }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i + ': ' + JSON.stringify(raw)));
});

test('ván lưu đã kết thúc (quân trong hang) bị từ chối', () => {
  const g = E.play(pos([['D', 3, 1], ['c', 6, 2]]), mv(3, 1, 3, 0));
  eq(E.fromJSON(E.toJSON(g)), null);
});

/* ---------------- Máy ---------------- */

const LEVELS = ['easy', 'medium', 'hard'];

/** Chơi ngẫu nhiên n nước (PRNG seed) để có thế cờ giữa ván. */
function randomPosition(seed, n) {
  const rng = E.mulberry32(seed);
  let g = E.newGame();
  for (let i = 0; i < n && g.winner == null; i++) {
    const ms = E.legalMoves(g);
    g = E.play(g, ms[Math.floor(rng() * ms.length)]);
  }
  return g;
}

test('máy mọi mức luôn trả nước hợp lệ (thế đầu và thế giữa ván)', () => {
  const positions = [E.newGame()];
  for (let seed = 1; positions.length < 7; seed++) {
    const g = randomPosition(seed, 10 + seed * 7);
    if (g.winner == null) positions.push(g);
  }
  for (const g of positions) {
    for (const level of LEVELS) {
      const r = E.chooseMove(g, { level, seed: 7, timeMs: 1500 });
      ok(E.legalMoves(g).includes(r.move), level + ' trả nước sai: ' + r.move + ' ở ' + E.boardString(g));
    }
  }
});

test('máy mọi mức vào hang khi có thể', () => {
  // Đỏ có Chó ở bẫy Xanh (3,1): đi (3,0) là thắng
  const g = pos([['D', 3, 1], ['E', 0, 6], ['c', 6, 2], ['l', 0, 0]]);
  for (const level of LEVELS) eq(E.chooseMove(g, { level, seed: 3 }).move, mv(3, 1, 3, 0), level);
});

test('máy mức Vừa / Khó chặn đòn vào hang (ăn quân đứng ở bẫy)', () => {
  // Hổ Xanh đứng ở bẫy Đỏ (3,7): nếu không ăn thì Xanh vào hang. Mèo Đỏ (2,7) ăn được vì Hổ có bậc 0.
  const g = pos([['C', 2, 7], ['E', 0, 6], ['t', 3, 7], ['l', 0, 0]]);
  for (const level of ['medium', 'hard']) eq(E.chooseMove(g, { level, seed: 5 }).move, mv(2, 7, 3, 7), level);
});

test('máy mức Khó ăn quân không được bảo vệ', () => {
  // Sư Tử Đỏ (3,6) cạnh Sói Xanh (3,5) không ai bảo vệ
  const g = pos([['L', 3, 6], ['R', 6, 8], ['w', 3, 5], ['e', 6, 0]]);
  eq(E.chooseMove(g, { level: 'hard', seed: 1 }).move, mv(3, 6, 3, 5));
});

test('máy mức Khó đi xong thế đầu trong thời gian cho phép', () => {
  const t0 = Date.now();
  const r = E.chooseMove(E.newGame(), { level: 'hard', seed: 1 });
  const ms = Date.now() - t0;
  ok(E.legalMoves(E.newGame()).includes(r.move));
  ok(ms < 6000, 'quá chậm: ' + ms + 'ms');
  console.log('       (Khó: độ sâu ' + r.depth + ', ' + r.nodes + ' nút, ' + ms + 'ms)');
});

test('máy ngẫu nhiên đấu nhau: 40 ván đều kết thúc', () => {
  const reasons = {};
  for (let seed = 1; seed <= 40; seed++) {
    const rng = E.mulberry32(seed * 101);
    let g = E.newGame();
    let n = 0;
    while (g.winner == null) {
      const ms = E.legalMoves(g);
      ok(ms.length > 0, 'ván chưa kết thúc mà không có nước');
      g = E.play(g, ms[Math.floor(rng() * ms.length)]);
      ok(++n < 20000, 'ván ' + seed + ' không kết thúc');
    }
    reasons[g.reason] = (reasons[g.reason] || 0) + 1;
  }
  console.log('       (kết thúc: ' + JSON.stringify(reasons) + ')');
});

test('máy Dễ đấu máy Vừa: ván kết thúc, nước nào cũng hợp lệ', () => {
  let g = E.newGame();
  let n = 0;
  while (g.winner == null && n < 400) {
    const level = g.turn === RED ? 'easy' : 'medium';
    const r = E.chooseMove(g, { level, seed: n + 1 });
    const next = E.play(g, r.move);
    ok(next, 'nước sai ở ply ' + n);
    g = next;
    n++;
  }
  ok(g.winner != null, 'ván dài quá 400 ply');
  console.log('       (' + n + ' ply, thắng: ' + ['Đỏ', 'Xanh', 'hòa'][g.winner] + ', ' + g.reason + ')');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
