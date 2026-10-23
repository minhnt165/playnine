/* Kiểm tra engine Cờ Chín Quân: chạy `node test.js`
 * - Bàn 24 điểm: đồ thị kề, 16 đường mill
 * - Đặt quân, đi quân sang điểm kề, bay khi còn 3 quân, ăn quân sau khi lập mill
 *   (không ăn quân đang nằm trong mill trừ khi mọi quân đối thủ đều nằm trong mill)
 * - Thắng (đối thủ còn dưới 3 quân / hết nước), hòa (50 nước mỗi bên không lập mill, lặp thế 3 lần)
 * - Máy: luôn trả nước hợp lệ ở mọi mức, đi nước thắng ngay, chặn mill; ván ngẫu nhiên luôn kết thúc
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
 * Game không sinh màn ngẫu nhiên (bàn luôn trống lúc đầu) nên không cần chứng minh "giải được".
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
  if (!v) throw new Error(msg || 'expected true');
}

const W = E.WHITE;
const B = E.BLACK;
const mv = (from, to, remove) => ({ from, to, remove: remove == null ? -1 : remove });
const key = (m) => m.from + '>' + m.to + 'x' + m.remove;
const keys = (list) => list.map(key).sort();

/** Dựng thế cờ: { w: [điểm trắng], b: [điểm đen], turn, hand: [trắng, đen], quiet } */
function pos({ w = [], b = [], turn = W, hand = [0, 0], quiet = 0 }) {
  const board = new Array(24).fill(0);
  w.forEach((p) => { board[p] = W; });
  b.forEach((p) => { board[p] = B; });
  const s = E.fromJSON({ v: 1, board, turn, hand, plies: 40, quiet, reps: [], last: null });
  if (!s) throw new Error('pos(): thế cờ không hợp lệ');
  return s;
}

/** Chơi một nước, báo lỗi nếu engine từ chối */
function play(s, m) {
  const n = E.play(s, m);
  if (!n) throw new Error('nước không hợp lệ: ' + key(m));
  return n;
}

/* ---------------- Bàn cờ ---------------- */

test('24 điểm, 32 cạnh, kề hai chiều, bậc 2–4', () => {
  eq(E.ADJ.length, 24);
  let edges = 0;
  E.ADJ.forEach((list, p) => {
    ok(list.length >= 2 && list.length <= 4, 'bậc của ' + p);
    list.forEach((q) => ok(E.ADJ[q].indexOf(p) >= 0, p + '-' + q + ' không đối xứng'));
    edges += list.length;
  });
  eq(edges / 2, 32);
});

test('kề đúng hình ba hình vuông lồng nhau', () => {
  eq(E.ADJ[0], [1, 9]);
  eq(E.ADJ[1], [0, 2, 4]);
  eq(E.ADJ[4], [1, 3, 5, 7]);
  eq(E.ADJ[10], [3, 9, 11, 18]);
  eq(E.ADJ[11], [6, 10, 15]);
  eq(E.ADJ[16], [15, 17, 19]);
  eq(E.ADJ[23], [14, 22]);
  ok(E.ADJ[11].indexOf(12) < 0, 'giữa bàn không có đường nối 11-12');
  ok(E.ADJ[7].indexOf(16) < 0, 'giữa bàn không có đường nối 7-16');
});

test('16 mill, mỗi điểm nằm trên đúng 2 mill, mill thẳng hàng và nối liền', () => {
  eq(E.MILLS.length, 16);
  const count = new Array(24).fill(0);
  E.MILLS.forEach((m) => {
    m.forEach((p) => count[p]++);
    const [a, b, c] = m.map((p) => E.COORDS[p]);
    ok((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]), 'mill thẳng hàng ' + m);
    ok(E.ADJ[m[0]].indexOf(m[1]) >= 0 && E.ADJ[m[1]].indexOf(m[2]) >= 0, 'mill nối liền ' + m);
  });
  ok(count.every((n) => n === 2));
});

/* ---------------- Đặt quân ---------------- */

test('ván mới: trắng đi trước, mỗi bên 9 quân trên tay, 24 nước đặt', () => {
  const s = E.newGame();
  eq([s.turn, s.hand, E.phase(s), s.over], [W, [9, 9], 'place', null]);
  eq(E.legalMoves(s).length, 24);
  ok(E.legalMoves(s).every((m) => m.from === -1 && m.remove === -1));
});

test('đặt quân: giảm quân trên tay, đổi lượt, không đặt lên điểm đã có quân', () => {
  let s = play(E.newGame(), mv(-1, 4));
  eq([s.board[4], s.hand, s.turn], [W, [8, 9], B]);
  eq(E.play(s, mv(-1, 4)), null, 'điểm đã có quân');
  eq(E.play(s, mv(4, 5)), null, 'còn quân trên tay thì không được đi quân');
  s = play(s, mv(-1, 0));
  eq([s.board[0], s.hand, s.turn, E.phase(s)], [B, [8, 8], W, 'place']);
  eq(E.legalMoves(s).length, 22);
});

test('hết quân trên tay thì sang giai đoạn đi quân', () => {
  let s = E.newGame();
  // 18 điểm đặt xen kẽ trắng / đen mà không bên nào lập mill
  const order = [0, 1, 9, 4, 3, 2, 5, 10, 7, 6, 8, 11, 12, 13, 15, 16, 14, 17];
  order.forEach((p) => { s = play(s, mv(-1, p)); });
  eq([s.hand, s.turn, E.phase(s)], [[0, 0], W, 'move']);
  ok(E.legalMoves(s).length > 0);
  ok(E.legalMoves(s).every((m) => m.from >= 0 && E.ADJ[m.from].indexOf(m.to) >= 0));
});

/* ---------------- Mill và ăn quân ---------------- */

test('lập mill khi đặt: nước nào cũng kèm ăn một quân, chỉ quân không nằm trong mill', () => {
  const s = pos({ w: [0, 1], b: [3, 4, 5, 22], turn: W, hand: [5, 5] });
  ok(E.formsMill(s, -1, 2));
  ok(!E.formsMill(s, -1, 14));
  eq(E.removable(s, -1, 2), [22], 'đen 3-4-5 đang là mill nên chỉ ăn được 22');
  eq(E.removable(s, -1, 14), [], 'không lập mill thì không ăn');
  eq(keys(E.legalMoves(s).filter((m) => m.to === 2)), keys([mv(-1, 2, 22)]));
  eq(E.play(s, mv(-1, 2)), null, 'lập mill mà không ăn');
  eq(E.play(s, mv(-1, 2, 3)), null, 'ăn quân trong mill');
  eq(E.play(s, mv(-1, 14, 22)), null, 'không lập mill thì không được ăn');
  const n = play(s, mv(-1, 2, 22));
  eq([n.board[22], n.board[2], n.turn, n.hand], [0, W, B, [4, 5]]);
  eq(n.last, { from: -1, to: 2, remove: 22, by: W });
});

test('mọi quân đối thủ đều nằm trong mill thì ăn được quân bất kỳ', () => {
  const s = pos({ w: [0, 1], b: [3, 4, 5], turn: W, hand: [5, 5] });
  eq(E.removable(s, -1, 2), [3, 4, 5]);
  eq(keys(E.legalMoves(s).filter((m) => m.to === 2)), keys([mv(-1, 2, 3), mv(-1, 2, 4), mv(-1, 2, 5)]));
});

test('lập mill khi đối thủ chưa có quân trên bàn thì không ăn gì', () => {
  const s = pos({ w: [0, 1], b: [], turn: W, hand: [4, 4] });
  ok(E.formsMill(s, -1, 2));
  eq(E.removable(s, -1, 2), []);
  eq(keys(E.legalMoves(s).filter((m) => m.to === 2)), keys([mv(-1, 2)]));
  eq(play(s, mv(-1, 2)).over, null);
});

test('lập hai mill một lúc vẫn chỉ ăn một quân', () => {
  // Trắng 0, 1 và 14, 23: đặt vào 2 lập cả 0-1-2 và 2-14-23
  const s = pos({ w: [0, 1, 14, 23], b: [9, 10, 18], turn: W, hand: [3, 3] });
  const n = play(s, mv(-1, 2, 9));
  eq([n.board.filter((x) => x === B).length, n.turn], [2, B]);
});

test('đi quân ra rồi về lại mill thì lập mill lần nữa', () => {
  const s = pos({ w: [0, 1, 2, 20], b: [9, 21, 22, 15], turn: W });
  let n = play(s, mv(2, 14)); // phá mill 0-1-2
  n = play(n, mv(15, 16));
  ok(E.formsMill(n, 14, 2));
  n = play(n, mv(14, 2, 22));
  eq(n.board[22], 0);
});

/* ---------------- Đi quân và bay ---------------- */

test('đi quân: chỉ sang điểm kề còn trống, chỉ quân của mình', () => {
  const s = pos({ w: [0, 4, 10, 20], b: [1, 9, 3, 23], turn: W });
  eq(E.phase(s), 'move');
  eq(E.targets(s, 0), [], '0 bị chặn bởi 1 và 9');
  eq(E.targets(s, 4), [5, 7]);
  eq(E.targets(s, 10), [11, 18]);
  eq(E.targets(s, 1), [], 'quân đối thủ');
  eq(E.targets(s, 6), [], 'điểm trống');
  eq(E.play(s, mv(4, 6)), null, 'không kề');
  eq(E.play(s, mv(4, 3)), null, 'điểm đã có quân');
  eq(E.play(s, mv(-1, 6)), null, 'hết quân trên tay thì không đặt');
  eq(E.play(s, mv(1, 2)), null, 'quân đối thủ');
  const n = play(s, mv(4, 7));
  eq([n.board[4], n.board[7], n.turn], [0, W, B]);
});

test('còn đúng 3 quân thì bay tới điểm trống bất kỳ, đối thủ 4 quân thì không', () => {
  const s = pos({ w: [0, 4, 10], b: [1, 9, 3, 23], turn: W });
  eq(E.phase(s), 'fly');
  eq(E.targets(s, 0).length, 24 - 7);
  const n = play(s, mv(0, 16));
  eq([n.board[16], E.phase(n)], [W, 'move'], 'đen 4 quân vẫn đi thường');
  eq(E.play(n, mv(23, 15)), null);
});

test('còn quân trên tay thì vẫn đặt dù trên bàn chỉ có 3 quân', () => {
  const s = pos({ w: [0, 4, 10], b: [1, 9, 3], turn: W, hand: [2, 2] });
  eq(E.phase(s), 'place');
});

test('quân đã chọn: danh sách quân đi được', () => {
  const s = pos({ w: [0, 4, 10, 20], b: [1, 9, 3, 23], turn: W });
  eq(E.movable(s), [4, 10, 20]);
});

/* ---------------- Thắng / hòa ---------------- */

test('thắng khi đối thủ còn dưới 3 quân', () => {
  const s = pos({ w: [0, 1, 14, 20], b: [9, 10, 22], turn: W });
  const n = play(s, mv(14, 2, 22));
  eq(n.over, { winner: W, reason: 'pieces' });
  eq(E.legalMoves(n), []);
  eq(E.play(n, mv(9, 21)), null, 'ván đã xong');
});

test('quân trên tay vẫn được tính: 2 trên bàn + 1 trên tay chưa thua', () => {
  const s = pos({ w: [0, 1, 7, 20], b: [9, 10, 22], turn: W, hand: [1, 1] });
  const n = play(s, mv(-1, 2, 22));
  eq(n.over, null);
});

test('thắng khi đối thủ hết nước đi', () => {
  // Đen 0, 1, 2, 9 chỉ còn lối ra 14; trắng đi 13→14 là vây kín
  const s = pos({ w: [4, 13, 21, 10, 12], b: [0, 1, 2, 9], turn: W });
  const n = play(s, mv(13, 14));
  eq(n.over, { winner: W, reason: 'blocked' });
});

test('hòa sau 50 nước mỗi bên không lập mill', () => {
  let s = pos({ w: [0, 4, 10, 20], b: [2, 9, 22, 23], turn: W, quiet: 99 });
  s = play(s, mv(4, 5));
  eq([s.over, s.quiet], [{ winner: 0, reason: 'fifty' }, 100]);
  // Ăn quân thì đếm lại từ 0
  const t = pos({ w: [0, 1, 14, 20], b: [9, 10, 22, 5], turn: W, quiet: 99 });
  const n = play(t, mv(14, 2, 22));
  eq([n.over, n.quiet], [null, 0]);
});

test('đặt quân không tính vào 50 nước', () => {
  let s = play(E.newGame(), mv(-1, 0));
  s = play(s, mv(-1, 1));
  eq(s.quiet, 0);
});

test('hòa khi một thế cờ lặp lại 3 lần', () => {
  let s = pos({ w: [0, 4, 10, 20], b: [2, 9, 22, 23], turn: W });
  const shuffle = [mv(4, 5), mv(22, 19), mv(5, 4), mv(19, 22)];
  shuffle.forEach((m) => { s = play(s, m); });
  eq(s.over, null, 'lần thứ 2 chưa hòa');
  shuffle.forEach((m) => { s = play(s, m); });
  eq(s.over, { winner: 0, reason: 'repetition' }, 'lần thứ 3 về thế ban đầu');
});

/* ---------------- Máy ---------------- */

/** Ván ngẫu nhiên (PRNG seed được) để lấy các thế cờ thử máy */
function randomGame(seed, maxPlies) {
  const rng = E.mulberry32(seed);
  let s = E.newGame();
  const seen = [s];
  while (!s.over && s.plies < maxPlies) {
    const moves = E.legalMoves(s);
    s = play(s, moves[Math.floor(rng() * moves.length)]);
    seen.push(s);
  }
  return { final: s, seen };
}

test('ván ngẫu nhiên luôn kết thúc theo luật', () => {
  const reasons = {};
  for (let seed = 1; seed <= 150; seed++) {
    const { final } = randomGame(seed, 5000);
    ok(final.over, 'ván ' + seed + ' không kết thúc sau ' + final.plies + ' nước');
    reasons[final.over.reason] = (reasons[final.over.reason] || 0) + 1;
  }
  ok(Object.keys(reasons).length >= 2, 'nhiều kiểu kết thúc: ' + JSON.stringify(reasons));
});

test('nước đi sinh ra khớp với luật viết tay (đặt / đi / bay / ăn quân)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { seen } = randomGame(seed, 200);
    seen.forEach((s) => {
      if (s.over) return;
      const me = s.turn;
      const op = 3 - me;
      const empty = [];
      s.board.forEach((x, p) => { if (!x) empty.push(p); });
      const ph = E.phase(s);
      const steps = [];
      if (ph === 'place') empty.forEach((to) => steps.push([-1, to]));
      else s.board.forEach((x, p) => {
        if (x !== me) return;
        (ph === 'fly' ? empty : E.ADJ[p].filter((q) => !s.board[q])).forEach((to) => steps.push([p, to]));
      });
      const want = [];
      steps.forEach(([from, to]) => {
        const b = s.board.slice();
        if (from >= 0) b[from] = 0;
        b[to] = me;
        const inMill = (bd, p) => E.MILLS.some((m) => m.indexOf(p) >= 0 && m.every((q) => bd[q] === bd[p]));
        if (!E.MILLS.some((m) => m.indexOf(to) >= 0 && m.every((q) => b[q] === me))) return want.push(mv(from, to));
        const opp = [];
        b.forEach((x, p) => { if (x === op) opp.push(p); });
        const free = opp.filter((p) => !inMill(b, p));
        if (!opp.length) return want.push(mv(from, to));
        (free.length ? free : opp).forEach((r) => want.push(mv(from, to, r)));
      });
      eq(keys(E.legalMoves(s)), keys(want), 'seed ' + seed + ' ply ' + s.plies);
    });
  }
});

test('máy luôn trả nước hợp lệ ở mọi mức (đặt, đi, bay, ăn quân)', () => {
  const samples = [];
  for (let seed = 1; seed <= 12; seed++) {
    const { seen } = randomGame(seed * 7, 400);
    [3, 12, 17, 18, 25, 40, 60].forEach((i) => { if (seen[i] && !seen[i].over) samples.push(seen[i]); });
  }
  samples.push(pos({ w: [0, 4, 10], b: [1, 9, 3, 23, 22], turn: W }));
  samples.push(pos({ w: [0, 1], b: [3, 4, 5], turn: W, hand: [5, 5] }));
  ok(samples.length > 40);
  ['easy', 'medium', 'hard'].forEach((level) => {
    samples.forEach((s, i) => {
      const r = E.chooseMove(s, { level, rng: E.mulberry32(i + 1), timeMs: 150 });
      ok(E.isLegal(s, r), level + ' #' + i + ' trả nước sai ' + JSON.stringify(r));
    });
  });
});

test('máy (vừa, khó) đi nước thắng ngay', () => {
  const s = pos({ w: [0, 1, 14, 20], b: [9, 10, 22], turn: W });
  ['medium', 'hard'].forEach((level) => {
    const n = play(s, E.chooseMove(s, { level, rng: E.mulberry32(3) }));
    eq(n.over && n.over.winner, W, level);
  });
});

test('máy (vừa, khó) chặn mill của đối thủ khi đặt quân', () => {
  // Trắng 0, 1 dọa đặt vào 2; đen (máy) phải đặt vào 2
  const s = pos({ w: [0, 1, 16], b: [9, 13], turn: B, hand: [6, 7] });
  ['medium', 'hard'].forEach((level) => {
    eq(E.chooseMove(s, { level, rng: E.mulberry32(5) }).to, 2, level);
  });
});

test('máy khó tìm đủ sâu (≥ 6 nửa nước) ở đầu ván, không nghĩ quá lâu', () => {
  const s = play(E.newGame(), mv(-1, 4));
  const t0 = Date.now();
  const r = E.chooseMove(s, { level: 'hard', rng: E.mulberry32(9) });
  const ms = Date.now() - t0;
  ok(r.depth >= 6, 'depth ' + r.depth);
  ok(ms < 4000, 'nghĩ quá lâu: ' + ms + 'ms');
});

test('máy thắng người chơi ngẫu nhiên, máy đấu máy luôn kết thúc', () => {
  for (let g = 0; g < 2; g++) {
    const rng = E.mulberry32(100 + g);
    let s = E.newGame();
    const ai = g === 0 ? W : B;
    while (!s.over) {
      const moves = E.legalMoves(s);
      const m = s.turn === ai ? E.chooseMove(s, { level: 'hard', rng, timeMs: 60, maxDepth: 4 }) : moves[Math.floor(rng() * moves.length)];
      s = play(s, m);
    }
    eq(s.over.winner, ai, 'ván ' + g + ' ' + JSON.stringify(s.over));
  }
  const rng = E.mulberry32(7);
  let s = E.newGame();
  while (!s.over && s.plies < 1000) s = play(s, E.chooseMove(s, { level: s.turn === W ? 'easy' : 'medium', rng, timeMs: 40, maxDepth: 3 }));
  ok(s.over, 'máy đấu máy chưa kết thúc sau ' + s.plies + ' nước');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (kể cả lịch sử lặp thế)', () => {
  const { seen } = randomGame(42, 80);
  seen.forEach((s) => {
    const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s))));
    eq(back, s);
  });
});

test('khôi phục tính lại kết quả ván, không tin trường over đã lưu', () => {
  const s = pos({ w: [0, 1, 14, 20], b: [9, 10, 22], turn: W });
  const raw = E.toJSON(s);
  raw.over = { winner: B, reason: 'pieces' };
  eq(E.fromJSON(raw).over, null);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(play(E.newGame(), mv(-1, 4)));
  ok(E.fromJSON(good), 'mẫu tốt');
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { board: good.board.slice(0, 23) }),
    Object.assign({}, good, { board: good.board.map((x, i) => (i === 0 ? 3 : x)) }),
    Object.assign({}, good, { board: good.board.map((x, i) => (i === 4 ? '1' : x)) }),
    Object.assign({}, good, { turn: 3 }),
    Object.assign({}, good, { turn: 1 }), // trắng vừa đặt: phải đến lượt đen
    Object.assign({}, good, { hand: [9, 10] }), // trên bàn 1 + trên tay 9 > 9
    Object.assign({}, good, { hand: [8] }),
    Object.assign({}, good, { hand: [-1, 0] }),
    Object.assign({}, good, { plies: -1 }),
    Object.assign({}, good, { quiet: 101 }),
    Object.assign({}, good, { reps: 'x' }),
    Object.assign({}, good, { reps: [1.5] }),
    Object.assign({}, good, { last: { from: 30, to: 4, remove: -1, by: 1 } }),
    Object.assign({}, good, { board: new Array(24).fill(1) }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
