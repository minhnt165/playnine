/* Kiểm tra engine Cờ Đơn: chạy `node test.js`
 * - Hình bàn: số lỗ, lỗ khởi đầu, số nước nhảy, phép đối xứng là hoán vị giữ nguyên tập nước nhảy
 * - Luật: nhảy qua quân kề vào lỗ trống, quân bị nhảy qua bị bỏ; nước sai không đổi gì; tam giác nhảy theo 3 phương
 * - Hoàn tác / chơi lại, thắng (còn một quân), kẹt (hết nước), hoàn hảo (Kiểu Anh, quân cuối ở tâm)
 * - Bộ giải: chứng minh thế đầu của cả ba bàn giải được về một quân (đi lại lời giải bằng luật của engine),
 *   Kiểu Anh giải được về tâm, bàn châu Âu bỏ trống ở tâm thì không giải được, thế chết báo 'dead',
 *   hết hạn mức báo 'unknown', gợi ý luôn dẫn tới lời giải
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

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'điều kiện sai');
}

/** Ván dựng tay: chỉ các lỗ (r, c) trong danh sách có quân. */
function handGame(id, cells) {
  const b = E.board(id);
  const pegs = new Array(b.n).fill(0);
  cells.forEach(([r, c]) => { pegs[b.at(r, c)] = 1; });
  return { board: id, pegs, history: [], made: 0, assisted: false };
}

/** Đi lần lượt các nước (chỉ số nước nhảy) bằng luật của engine; nước nào không hợp lệ thì lỗi. */
function play(g, moves) {
  return moves.reduce((s, k) => {
    const next = E.applyJump(s, k);
    ok(next !== s, 'nước ' + k + ' không hợp lệ');
    return next;
  }, g);
}

/* ---------------- Hình bàn ---------------- */

test('ba bàn: số lỗ, số nước nhảy, lỗ khởi đầu', () => {
  eq(E.BOARD_IDS, ['english', 'european', 'triangle']);
  const e = E.board('english');
  eq([e.n, e.jumps.length, e.holes[e.start].r, e.holes[e.start].c, e.start === e.centre], [33, 76, 3, 3, true]);
  const f = E.board('european');
  eq([f.n, f.jumps.length, f.holes[f.start].r, f.holes[f.start].c], [37, 92, 0, 2]);
  const t = E.board('triangle');
  eq([t.n, t.jumps.length, t.holes[t.start].r, t.holes[t.start].c, t.centre], [15, 36, 0, 0, -1]);
  eq(E.board('nope'), null);
  eq(E.board('toString'), null);
});

test('ván mới: đầy quân trừ lỗ khởi đầu', () => {
  E.BOARD_IDS.forEach((id) => {
    const g = E.newGame(id);
    const b = E.board(id);
    eq([E.pegCount(g), g.pegs[b.start], g.made, g.assisted, E.isOver(g)], [b.n - 1, 0, 0, false, false], id);
  });
  let threw = false;
  try { E.newGame('hex'); } catch (e) { threw = true; }
  ok(threw, 'bàn lạ phải báo lỗi');
});

test('phép đối xứng là hoán vị của các lỗ và giữ nguyên tập nước nhảy', () => {
  E.BOARD_IDS.forEach((id) => {
    const b = E.board(id);
    eq(b.syms.length, id === 'triangle' ? 6 : 8, id);
    const jumps = new Set(b.jumps.map((j) => j.join(',')));
    b.syms.forEach((p) => {
      eq(new Set(p).size, b.n, id + ' hoán vị');
      ok(p.every((x) => x >= 0), id + ' ảnh ra ngoài bàn');
      b.jumps.forEach((j) => ok(jumps.has(j.map((i) => p[i]).join(',')), id + ' nước nhảy không giữ nguyên'));
    });
  });
});

test('tọa độ vẽ nằm trong khung span x span', () => {
  E.BOARD_IDS.forEach((id) => {
    const b = E.board(id);
    b.holes.forEach((h) => ok(h.x >= 0.5 && h.x <= b.span - 0.5 && h.y >= 0.5 && h.y <= b.span - 0.5, id + ' ' + JSON.stringify(h)));
  });
});

/* ---------------- Luật ---------------- */

test('nhảy qua quân kề vào lỗ trống, quân bị nhảy qua bị bỏ', () => {
  const b = E.board('english');
  const g = E.newGame('english');
  // Từ (1, 3) qua (2, 3) vào tâm (3, 3)
  const from = b.at(1, 3);
  const over = b.at(2, 3);
  eq(E.targets(g, from), [b.centre]);
  const n = E.move(g, from, b.centre);
  eq([n.pegs[from], n.pegs[over], n.pegs[b.centre], E.pegCount(n), n.history.length, n.made], [0, 0, 1, 31, 1, 1]);
  eq(g.pegs[b.centre], 0, 'ván cũ không bị sửa');
});

test('thế đầu Kiểu Anh có đúng 4 nước, tam giác có 2 nước', () => {
  eq(E.legalMoves(E.newGame('english')).length, 4);
  eq(E.legalMoves(E.newGame('triangle')).length, 2);
  eq(E.legalMoves(E.newGame('european')).length, 2);
});

test('nước sai không đổi gì', () => {
  const b = E.board('english');
  const g = E.newGame('english');
  eq(E.move(g, b.at(3, 2), b.at(3, 4)), g); // nhảy hai ô qua tâm trống: không có quân để nhảy qua
  eq(E.move(g, b.at(0, 3), b.centre), g); // không kề
  eq(E.move(g, b.at(2, 2), b.centre), g); // chéo trên bàn vuông
  eq(E.move(g, b.centre, b.at(1, 3)), g); // lỗ trống không có quân
  eq(E.applyJump(g, 999), g);
  eq(E.findJump(g, b.at(1, 3), b.centre) >= 0, true);
  eq(E.findJump(g, b.at(3, 0), b.at(3, 2)), -1);
});

test('tam giác nhảy theo ngang và hai phương chéo, không theo phương còn lại', () => {
  const b = E.board('triangle');
  const rc = (g, from) => E.targets(g, b.at(from[0], from[1])).map((i) => [b.holes[i].r, b.holes[i].c]).sort();
  // (2, 1) giữa hàng 3: xuống trái tới (4, 1) qua (3, 1), xuống phải tới (4, 3) qua (3, 2); lên thì hết bàn
  eq(rc(handGame('triangle', [[2, 1], [3, 1], [3, 2], [2, 0], [1, 0], [1, 1]]), [2, 1]), [[4, 1], [4, 3]]);
  // (2, 2) lên chéo tới đỉnh (0, 0) qua (1, 1); (2, 0) lên tới đỉnh qua (1, 0)
  eq(rc(handGame('triangle', [[2, 2], [1, 1]]), [2, 2]), [[0, 0]]);
  eq(rc(handGame('triangle', [[2, 0], [1, 0]]), [2, 0]), [[0, 0]]);
  // Ngang trong hàng
  eq(rc(handGame('triangle', [[4, 0], [4, 1]]), [4, 0]), [[4, 2]]);
  // (4, 0) → (2, 2) qua (3, 1) không phải đường thẳng trên tam giác
  eq(rc(handGame('triangle', [[4, 0], [3, 1]]), [4, 0]), []);
});

test('hoàn tác trả lại thế trước (không giới hạn), giữ số nước đã đi', () => {
  const g0 = E.newGame('english');
  const s = E.createSolver('english');
  const moves = s.solve(g0.pegs).moves.slice(0, 6);
  let g = play(g0, moves);
  eq(g.made, 6);
  for (let i = 0; i < 6; i++) g = E.undo(g);
  eq([g.pegs, g.history, g.made], [g0.pegs, [], 6]);
  eq(E.undo(g), g, 'không còn gì để hoàn tác');
});

test('chơi lại về thế đầu, vẫn cùng ván (giữ made và assisted)', () => {
  let g = E.markAssisted(play(E.newGame('triangle'), [E.legalMoves(E.newGame('triangle'))[0]]));
  g = E.restart(g);
  eq([g.pegs, g.history, g.made, g.assisted], [E.newGame('triangle').pegs, [], 1, true]);
});

test('markAssisted chỉ bật cờ, không đổi bàn', () => {
  const g = E.newGame('english');
  const a = E.markAssisted(g);
  eq([a.assisted, a.pegs, g.assisted], [true, g.pegs, false]);
  eq(E.markAssisted(a), a);
});

test('thắng khi còn một quân; hoàn hảo khi quân cuối ở tâm bàn Kiểu Anh', () => {
  const b = E.board('english');
  const g = handGame('english', [[1, 3], [2, 3]]);
  ok(!E.isWon(g) && !E.isStuck(g));
  const w = E.move(g, b.at(1, 3), b.centre);
  ok(E.isWon(w) && E.isOver(w) && !E.isStuck(w) && E.isPerfect(w));
  const off = E.move(handGame('english', [[3, 3], [2, 3]]), b.centre, b.at(1, 3));
  ok(E.isWon(off) && !E.isPerfect(off), 'thắng nhưng không ở tâm');
  const f = E.board('european');
  const eu = E.move(handGame('european', [[1, 3], [2, 3]]), f.at(1, 3), f.at(3, 3));
  ok(E.isWon(eu) && !E.isPerfect(eu), 'hoàn hảo chỉ tính cho Kiểu Anh');
  eq(E.legalMoves(w), []);
});

test('kẹt khi còn nhiều quân mà hết nước nhảy', () => {
  const g = handGame('english', [[0, 2], [6, 4]]);
  ok(E.isStuck(g) && E.isOver(g) && !E.isWon(g));
  eq(E.pegCount(g), 2);
});

/* ---------------- Bộ giải ---------------- */

E.BOARD_IDS.forEach((id) => {
  test('bộ giải chứng minh thế đầu bàn ' + id + ' giải được về một quân', () => {
    const s = E.createSolver(id);
    const g0 = E.newGame(id);
    const r = s.solve(g0.pegs);
    eq(r.status, 'solved');
    eq(r.moves.length, E.board(id).n - 2, 'mỗi nước bỏ một quân');
    const end = play(g0, r.moves);
    ok(E.isWon(end), 'đi lại lời giải phải còn đúng một quân');
  });
});

test('Kiểu Anh giải được về đúng tâm (có ván hoàn hảo)', () => {
  const b = E.board('english');
  const r = E.createSolver('english').solve(E.newGame('english').pegs, { end: b.centre });
  eq(r.status, 'solved');
  ok(E.isPerfect(play(E.newGame('english'), r.moves)));
});

test('bàn châu Âu bỏ trống ở tâm: thế chết (bất biến lớp chẵn lẻ)', () => {
  const f = E.board('european');
  const pegs = new Array(f.n).fill(1);
  pegs[f.at(3, 3)] = 0;
  // Bất biến: số quân theo 3 lớp (r + c) mod 3 và (r − c) mod 3, xét chẵn lẻ; mỗi nước đảo chẵn lẻ cả 3 lớp
  const cls = (p) => {
    const A = [0, 0, 0];
    const B = [0, 0, 0];
    p.forEach((x, i) => {
      if (!x) return;
      const { r, c } = f.holes[i];
      A[(r + c) % 3] ^= 1;
      B[(r - c + 6) % 3] ^= 1;
    });
    return [A[0] ^ A[1], A[1] ^ A[2], B[0] ^ B[1], B[1] ^ B[2]].join('');
  };
  const single = (i) => f.holes.map((h, j) => (j === i ? 1 : 0));
  ok(f.holes.every((h, i) => cls(single(i)) !== cls(pegs)), 'không lỗ nào có thể là quân cuối');
  ok(f.holes.some((h, i) => cls(single(i)) === cls(E.newGame('european').pegs)), 'thế đầu đã chọn hợp lớp');
});

test('thế chết nhỏ: bộ giải báo dead, gợi ý báo dead', () => {
  const s = E.createSolver('english');
  const g = handGame('english', [[0, 2], [0, 3], [6, 4]]);
  eq(s.solve(g.pegs).status, 'dead');
  eq(s.hint(g.pegs).status, 'dead');
});

test('hết hạn mức báo unknown, gọi lại vẫn giải được nhờ bộ nhớ thế chết', () => {
  const s = E.createSolver('european');
  const pegs = E.newGame('european').pegs;
  eq(s.solve(pegs, { maxNodes: 50 }).status, 'unknown');
  let ticks = 0;
  eq(s.solve(pegs, { maxMs: 1, now: () => (ticks++ ? 1e9 : 0), maxNodes: 5000 }).status, 'unknown');
  eq(s.solve(pegs).status, 'solved');
});

test('gợi ý: đi theo gợi ý từ đầu tới cuối luôn thắng (cả ba bàn)', () => {
  E.BOARD_IDS.forEach((id) => {
    const s = E.createSolver(id);
    let g = E.newGame(id);
    while (!E.isWon(g)) {
      const h = s.hint(g.pegs);
      eq(h.status, 'solved', id);
      g = play(g, [h.move]);
    }
  });
});

test('gợi ý từ thế giữa ván (lệch khỏi lời giải) vẫn dẫn tới một quân', () => {
  const s = E.createSolver('english');
  let g = E.newGame('english');
  // Đi 5 nước đầu theo thứ tự nước hợp lệ cuối cùng (khác thứ tự của bộ giải)
  for (let i = 0; i < 5; i++) {
    const m = E.legalMoves(g);
    g = play(g, [m[m.length - 1]]);
  }
  const h = s.hint(g.pegs);
  eq(h.status, 'solved');
  const rest = s.solve(E.applyJump(g, h.move).pegs);
  eq(rest.status, 'solved');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (đi lại lịch sử)', () => {
  const s = E.createSolver('european');
  const g0 = E.newGame('european');
  let g = play(g0, s.solve(g0.pegs).moves.slice(0, 7));
  g = E.markAssisted(E.undo(g));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq([back.made, back.history.length, back.assisted], [7, 6, true]);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(play(E.newGame('triangle'), [E.legalMoves(E.newGame('triangle'))[0]]));
  const k = good.history[0];
  [
    null, 1, 'x', {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { board: 'hex' }),
    Object.assign({}, good, { board: '__proto__' }),
    Object.assign({}, good, { history: 'abc' }),
    Object.assign({}, good, { history: [k, k] }), // nước thứ hai không hợp lệ
    Object.assign({}, good, { history: [999] }),
    Object.assign({}, good, { history: [-1] }),
    Object.assign({}, good, { history: [1.5] }),
    Object.assign({}, good, { history: ['0'] }),
    Object.assign({}, good, { made: 0 }), // ít hơn số nước trong lịch sử
    Object.assign({}, good, { made: '1' }),
    Object.assign({}, good, { assisted: 'no' }),
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
  ok(E.fromJSON(good) !== null, 'ván lưu tốt phải khôi phục được');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
