/* Kiểm tra engine Cờ Lục Giác (Hex): chạy `node test.js`
 * - Hình học bàn (6 láng giềng, thứ tự vòng), union-find, phát hiện thắng, bàn đầy luôn đúng một bên thắng
 * - Nước hợp lệ / sai luật, luật đổi bên (đối xứng qua đường chéo dài), đường thắng
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
 * - Máy: luôn đi đúng luật, thắng ngay khi được, chặn đòn thắng, quyết định đổi bên, tất định theo seed
 * - Mức mạnh dần: Vừa thắng Dễ, Khó thắng Dễ, Khó thắng Vừa (in tỉ lệ để ghi vào README)
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
  if (!v) throw new Error(msg || 'expected true');
}

const { RED, BLUE, SWAP } = E;
const at = (n, r, c) => r * n + c;

/** Dựng ván từ danh sách nước (ô theo [r, c] hoặc 'swap'). */
function line(n, list, swap) {
  let g = E.newGame({ n, swap: !!swap });
  for (const m of list) {
    g = E.play(g, m === 'swap' ? SWAP : at(n, m[0], m[1]));
    if (!g) throw new Error('nước sai luật trong kịch bản: ' + JSON.stringify(m));
  }
  return g;
}

/** Bàn từ chuỗi: mỗi dòng một hàng, R / B / . ; khoảng trắng đầu dòng bỏ qua. */
function boardOf(rows) {
  const out = [];
  for (const row of rows) for (const ch of row.replace(/\s/g, '')) out.push(ch === 'R' ? RED : ch === 'B' ? BLUE : 0);
  return out;
}

/** Kiểm tra độc lập (BFS) xem bên col có nối hai cạnh không. */
function connects(board, n, col) {
  const { adj } = E.geo(n);
  const seen = new Set();
  const q = [];
  for (let i = 0; i < n * n; i++) if (board[i] === col && E.onEdge(i, n, col, 0)) { seen.add(i); q.push(i); }
  while (q.length) {
    const x = q.pop();
    if (E.onEdge(x, n, col, 1)) return true;
    for (const y of adj[x]) if (board[y] === col && !seen.has(y)) { seen.add(y); q.push(y); }
  }
  return false;
}

/* ================= Hình học ================= */
test('mỗi ô có đúng các láng giềng của bàn lục giác (góc tù 3, góc nhọn 2, giữa 6)', () => {
  const n = 7;
  const { adj, ring } = E.geo(n);
  eq(adj[at(n, 0, 0)].length, 2, 'góc nhọn (0,0)');
  eq(adj[at(n, 6, 6)].length, 2, 'góc nhọn (6,6)');
  eq(adj[at(n, 0, 6)].length, 3, 'góc tù (0,6)');
  eq(adj[at(n, 6, 0)].length, 3, 'góc tù (6,0)');
  eq(adj[at(n, 3, 3)].slice().sort((a, b) => a - b), [at(n, 2, 3), at(n, 2, 4), at(n, 3, 2), at(n, 3, 4), at(n, 4, 2), at(n, 4, 3)]);
  // quan hệ kề đối xứng; (r+1, c+1) không phải láng giềng
  for (let i = 0; i < n * n; i++) for (const j of adj[i]) ok(adj[j].indexOf(i) >= 0, 'đối xứng ' + i + '-' + j);
  ok(adj[at(n, 3, 3)].indexOf(at(n, 4, 4)) < 0, '(4,4) không kề (3,3)');
  // thứ tự vòng: hai láng giềng liền nhau trong ring cũng kề nhau
  const rg = ring[at(n, 3, 3)];
  for (let k = 0; k < 6; k++) ok(adj[rg[k]].indexOf(rg[(k + 1) % 6]) >= 0, 'vòng ' + k);
});

test('tên ô và ô đối xứng qua đường chéo dài', () => {
  eq(E.cellName(0, 11), 'a1');
  eq(E.cellName(at(11, 10, 10), 11), 'k11');
  eq(E.cellName(at(9, 2, 4), 9), 'e3');
  eq(E.mirror(at(9, 2, 4), 9), at(9, 4, 2));
  eq(E.mirror(at(9, 3, 3), 9), at(9, 3, 3));
});

/* ================= Union-find và phát hiện thắng ================= */
test('union-find: hợp, tìm gốc, nối bắc cầu', () => {
  const uf = new E.UnionFind(6);
  ok(!uf.connected(0, 1));
  uf.union(0, 1);
  uf.union(2, 3);
  ok(uf.connected(0, 1) && !uf.connected(1, 2));
  uf.union(1, 3);
  ok(uf.connected(0, 2), 'bắc cầu 0-1-3-2');
  ok(!uf.connected(0, 5));
});

test('Đỏ nối trên–dưới thì thắng, Xanh nối trái–phải thì thắng', () => {
  const n = 7;
  const red = new Array(49).fill(0);
  for (let r = 0; r < 7; r++) red[at(n, r, 3)] = RED;
  eq(E.winnerOf(red, n), RED);
  const blue = new Array(49).fill(0);
  for (let c = 0; c < 7; c++) blue[at(n, 2, c)] = BLUE;
  eq(E.winnerOf(blue, n), BLUE);
  // Xanh nối trên–dưới không tính; Đỏ nối trái–phải không tính
  const wrong = new Array(49).fill(0);
  for (let r = 0; r < 7; r++) wrong[at(n, r, 0)] = BLUE;
  for (let c = 0; c < 7; c++) wrong[at(n, 6, c)] = RED;
  eq(E.winnerOf(wrong, n), 0);
});

test('đường ngoằn ngoèo theo hướng lục giác thắng, theo hướng chéo (r+1, c+1) thì không', () => {
  const zig = boardOf([
    '. . R . .',
    '. R . . .',
    '. R R R .',
    '. . . R .',
    '. . R . .',
  ]);
  eq(E.winnerOf(zig, 5), RED, 'zigzag hợp lệ');
  const diag = boardOf([
    'R . . . .',
    '. R . . .',
    '. . R . .',
    '. . . R .',
    '. . . . R',
  ]);
  eq(E.winnerOf(diag, 5), 0, 'đường chéo không liền');
  const gap = boardOf([
    '. . R . .',
    '. . R . .',
    '. . . . .',
    '. . R . .',
    '. . R . .',
  ]);
  eq(E.winnerOf(gap, 5), 0, 'thiếu một ô');
});

test('bàn đầy luôn có đúng một bên thắng (không có hòa), mọi cỡ', () => {
  const rng = E.mulberry32(7);
  for (const n of E.SIZES) {
    for (let k = 0; k < 150; k++) {
      const b = [];
      for (let i = 0; i < n * n; i++) b.push(rng() < 0.5 ? RED : BLUE);
      const r = connects(b, n, RED), bl = connects(b, n, BLUE);
      ok(r !== bl, 'đúng một bên nối được');
      eq(E.winnerOf(b, n), r ? RED : BLUE);
    }
  }
});

/* ================= Nước đi ================= */
test('ván mới: bàn trống, Đỏ đi trước, cỡ mặc định 9, cỡ lạ về 9', () => {
  const g = E.newGame();
  eq([g.n, g.turn, g.winner, g.moves.length, g.board.every((v) => v === 0), g.swap], [9, RED, 0, 0, true, true]);
  eq(E.newGame({ n: 11 }).board.length, 121);
  eq(E.newGame({ n: 8 }).n, 9);
  eq(E.newGame({ swap: false }).swap, false);
});

test('đặt quân: lượt đổi, ô đã có quân / ngoài bàn / không phải số nguyên bị từ chối', () => {
  let g = E.newGame({ n: 7 });
  g = E.play(g, 10);
  eq([g.board[10], g.turn, g.last], [RED, BLUE, 10]);
  eq(E.play(g, 10), null, 'ô đã có quân');
  eq(E.play(g, -2), null);
  eq(E.play(g, 49), null);
  eq(E.play(g, 1.5), null);
  eq(E.play(g, '3'), null);
  const g2 = E.play(g, 11);
  eq([g2.board[11], g2.turn], [BLUE, RED]);
  eq(g.board[11], 0, 'không sửa ván cũ');
});

test('nước thắng kết thúc ván, sau đó không đi được nữa', () => {
  const n = 7;
  const list = [];
  for (let r = 0; r < 7; r++) {
    list.push([r, 0]);
    if (r < 6) list.push([r, 6]);
  }
  const g = line(n, list);
  eq(g.winner, RED);
  eq(E.legalMoves(g), []);
  eq(E.play(g, at(n, 0, 3)), null);
  const path = E.winningPath(g);
  eq(path.length, 7);
  eq(E.rowOf(path[0], n), 0);
  eq(E.rowOf(path[6], n), 6);
  for (let k = 1; k < path.length; k++) ok(E.geo(n).adj[path[k - 1]].indexOf(path[k]) >= 0, 'đường liền');
});

test('đường thắng của Xanh đi từ cột 0 tới cột n - 1 qua quân Xanh', () => {
  const n = 7;
  const list = [];
  for (let c = 0; c < 7; c++) {
    list.push([6, c === 6 ? 5 : c]); // Đỏ đặt hàng dưới (không nối được)
    list.push([3, c]);
  }
  // nước Đỏ cuối trùng ô (6,5): thay bằng ô khác
  list[12] = [0, 0];
  const g = line(n, list);
  eq(g.winner, BLUE);
  const path = E.winningPath(g);
  eq([E.colOf(path[0], n), E.colOf(path[path.length - 1], n)], [0, 6]);
  ok(path.every((i) => g.board[i] === BLUE));
});

/* ================= Luật đổi bên ================= */
test('đổi bên: quân Đỏ (r, c) thành quân Xanh (c, r), tới lượt Đỏ', () => {
  const n = 9;
  let g = line(n, [[2, 5]], true);
  ok(E.canSwap(g));
  ok(E.legalMoves(g).indexOf(SWAP) >= 0);
  g = E.play(g, SWAP);
  eq([g.board[at(n, 2, 5)], g.board[at(n, 5, 2)], g.turn, g.swapped, g.last], [0, BLUE, RED, true, at(n, 5, 2)]);
  eq(E.stoneCount(g), { red: 0, blue: 1 });
  eq(E.canSwap(g), false, 'không đổi lần hai');
  g = E.play(g, at(n, 4, 4));
  eq(g.turn, BLUE);
  // quân trên đường chéo dài: đổi màu tại chỗ
  const d = E.play(line(n, [[4, 4]], true), SWAP);
  eq(d.board[at(n, 4, 4)], BLUE);
});

test('đổi bên bị từ chối khi luật tắt, khi chưa đi nước nào hoặc đã quá nước thứ hai', () => {
  const n = 7;
  eq(E.play(line(n, [[1, 1]], false), SWAP), null, 'luật tắt');
  eq(E.play(E.newGame({ n }), SWAP), null, 'chưa có nước nào');
  eq(E.play(line(n, [[1, 1], [2, 2]], true), SWAP), null, 'đã qua nước hai');
  eq(E.legalMoves(line(n, [[1, 1]], false)).indexOf(SWAP), -1);
});

/* ================= Lưu / khôi phục ================= */
test('lưu rồi khôi phục giữ nguyên ván (kể cả nước đổi bên)', () => {
  const g = line(9, [[2, 5], 'swap', [4, 4], [3, 3], [5, 1]], true);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  const done = line(7, [[0, 0], [0, 6], [1, 0], [1, 6], [2, 0], [2, 6], [3, 0], [3, 6], [4, 0], [4, 6], [5, 0], [5, 6], [6, 0]]);
  eq(E.fromJSON(E.toJSON(done)).winner, RED);
});

test('từ chối dữ liệu hỏng', () => {
  const good = { v: 1, n: 7, swap: true, moves: [10, -1, 3] };
  ok(E.fromJSON(good), 'mẫu hợp lệ');
  const bad = [
    null, 1, 'x', {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { n: 8 }),
    Object.assign({}, good, { n: '7' }),
    Object.assign({}, good, { swap: 1 }),
    Object.assign({}, good, { moves: 'abc' }),
    Object.assign({}, good, { moves: [10, 10] }), // ô đã có quân
    Object.assign({}, good, { moves: [10, 3, -1] }), // đổi bên sai lúc
    Object.assign({}, good, { swap: false }), // đổi bên khi luật tắt
    Object.assign({}, good, { moves: [49] }),
    Object.assign({}, good, { moves: [1.5] }),
    Object.assign({}, good, { moves: [null] }),
    Object.assign({}, good, { moves: [0, 6, 7, 13, 14, 20, 21, 27, 28, 34, 35, 41, 42, 48, 1] }), // đi tiếp sau khi thắng
    Object.assign({}, good, { moves: new Array(51).fill(0) }),
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

/* ================= Đánh giá hai-khoảng cách ================= */
test('hai-khoảng cách: bàn trống cân bằng, thêm quân giữa thì tốt hơn, nối xong thì "won"', () => {
  const n = 7;
  const empty = new Array(49).fill(0);
  const r = E.twoDistance(empty, n, RED), b = E.twoDistance(empty, n, BLUE);
  eq(r.pot, b.pot, 'đối xứng');
  ok(r.pot > 0 && r.pot < 200);
  const one = empty.slice();
  one[at(n, 3, 3)] = RED;
  ok(E.twoDistance(one, n, RED).pot < r.pot, 'quân giữa rút ngắn đường');
  ok(E.evaluate(one, n, RED) > 0 && E.evaluate(one, n, BLUE) < 0);
  const col = empty.slice();
  for (let k = 0; k < 7; k++) col[at(n, k, 2)] = RED;
  eq(E.twoDistance(col, n, RED).won, true);
  eq(E.twoDistance(col, n, BLUE).pot >= 200, true, 'Xanh hết đường');
});

/* ================= Máy ================= */
/** Một ván máy đấu máy; trả ván cuối. */
function selfPlay(n, red, blue, seed, opts) {
  const o = opts || {};
  let g = E.newGame({ n, swap: o.swap !== false });
  let ply = 0;
  while (!g.winner) {
    const lv = g.turn === RED ? red : blue;
    const res = E.chooseMove(g, { level: lv, seed: seed * 7919 + ply, iterations: o.iterations || 1500 });
    const next = E.play(g, res.move);
    if (!next) throw new Error(lv + ' đi sai luật: ' + res.move);
    g = next;
    ply++;
  }
  return g;
}

test('máy mọi mức luôn đi đúng luật tới hết ván (mọi cỡ, có / không đổi bên)', () => {
  for (const n of E.SIZES) {
    for (const lv of E.LEVELS) {
      const g = selfPlay(n, lv, 'easy', n + lv.length, { swap: n !== 9, iterations: 300 });
      ok(g.winner === RED || g.winner === BLUE);
    }
  }
});

test('máy thắng ngay khi có nước thắng (Vừa, Khó; Dễ đa số lần)', () => {
  const n = 7;
  // Đỏ có 6 quân cột 3 (thiếu hàng 6), Xanh rải rác; tới lượt Đỏ
  const g = line(n, [[0, 3], [0, 0], [1, 3], [1, 0], [2, 3], [2, 1], [3, 3], [5, 0], [4, 3], [6, 0], [5, 3], [6, 1]]);
  eq(g.turn, RED);
  const wins = E.winningCells(g.board, n, RED);
  eq(wins, [at(n, 6, 2), at(n, 6, 3)]);
  for (const lv of ['medium', 'hard']) ok(wins.indexOf(E.chooseMove(g, { level: lv, seed: 3, iterations: 200 }).move) >= 0, lv);
  let hits = 0;
  for (let s = 0; s < 40; s++) if (wins.indexOf(E.chooseMove(g, { level: 'easy', seed: s }).move) >= 0) hits++;
  ok(hits >= 25, 'Dễ thắng ngay ' + hits + '/40');
});

test('máy chặn đòn thắng duy nhất của đối thủ (Vừa, Khó)', () => {
  const n = 7;
  // Xanh có 6 quân hàng 3 (thiếu cột 6); tới lượt Đỏ
  const g = line(n, [[0, 0], [3, 0], [6, 6], [3, 1], [0, 6], [3, 2], [6, 0], [3, 3], [2, 6], [3, 4], [5, 1], [3, 5]]);
  eq([g.turn, g.winner], [RED, 0]);
  eq(E.winningCells(g.board, n, BLUE), [at(n, 3, 6)]);
  for (const lv of ['medium', 'hard']) eq(E.chooseMove(g, { level: lv, seed: 5, iterations: 200 }).move, at(n, 3, 6), lv);
});

test('máy đổi bên: Vừa / Khó đổi nước giữa bàn, không đổi nước trên cạnh; Dễ chỉ đổi nước sát tâm', () => {
  const n = 9;
  const mid = line(n, [[2, 6]], true);
  const edge = line(n, [[0, 4]], true);
  const center = line(n, [[4, 4]], true);
  for (const lv of ['medium', 'hard']) {
    eq(E.chooseMove(mid, { level: lv, seed: 1, iterations: 100 }).move, SWAP, lv + ' giữa bàn');
    ok(E.chooseMove(edge, { level: lv, seed: 1, iterations: 100 }).move !== SWAP, lv + ' trên cạnh');
  }
  eq(E.chooseMove(center, { level: 'easy', seed: 1 }).move, SWAP);
  ok(E.chooseMove(mid, { level: 'easy', seed: 1 }).move !== SWAP, 'Dễ không đổi nước xa tâm');
  // luật tắt: không bao giờ đổi
  ok(E.chooseMove(line(n, [[4, 4]], false), { level: 'hard', seed: 1, iterations: 100 }).move !== SWAP);
});

test('nước mở đầu của máy: có đổi bên thì đặt trên cạnh của Xanh, không có thì chiếm tâm', () => {
  for (const n of E.SIZES) {
    for (let s = 0; s < 10; s++) {
      const m = E.chooseMove(E.newGame({ n, swap: true }), { level: 'hard', seed: s }).move;
      const c = E.colOf(m, n), r = E.rowOf(m, n);
      ok((c === 0 || c === n - 1) && r > 0 && r < n - 1, 'mở đầu trên cạnh Xanh: ' + E.cellName(m, n));
    }
    eq(E.chooseMove(E.newGame({ n, swap: false }), { level: 'medium', seed: 1 }).move, ((n * n) - 1) / 2);
  }
});

test('máy tất định theo seed (Khó tính theo số vòng)', () => {
  const g = line(9, [[4, 4], [3, 5], [5, 2]], false);
  for (const lv of E.LEVELS) {
    const a = E.chooseMove(g, { level: lv, seed: 42, iterations: 800 }).move;
    const b = E.chooseMove(g, { level: lv, seed: 42, iterations: 800 }).move;
    eq(a, b, lv);
  }
});

test('MCTS chạy được từng khúc và dừng theo hạn giờ', () => {
  const g = line(9, [[4, 4], [3, 5]], false);
  const one = E.createSearch(g, { seed: 9 });
  one.run(1200, null);
  const parts = E.createSearch(g, { seed: 9 });
  parts.run(400, null);
  parts.run(400, null);
  parts.run(400, null);
  eq(parts.best(), one.best(), 'chia khúc cho cùng kết quả');
  eq(parts.iterations, 1200);
  let clock = 0;
  const timed = E.createSearch(g, { seed: 9 });
  const finished = timed.run(1e9, 50, () => (clock += 1)); // mỗi lần hỏi giờ trôi 1 ms
  ok(!finished && timed.iterations > 0 && timed.iterations < 5000, 'dừng theo hạn: ' + timed.iterations);
  ok(g.board[timed.best()] === 0, 'nước tốt nhất là ô trống');
});

/* ================= Mức mạnh dần ================= */
/** Đấu `games` ván, đổi màu xen kẽ; trả số ván `a` thắng. */
function match(a, b, n, games, iterations, swap) {
  let won = 0;
  for (let k = 0; k < games; k++) {
    const aRed = k % 2 === 0;
    const g = selfPlay(n, aRed ? a : b, aRed ? b : a, 1000 + k, { iterations, swap });
    if ((g.winner === RED) === aRed) won++;
  }
  return won;
}

const report = [];
test('Vừa thắng Dễ phần lớn (7×7 và 9×9, 20 ván mỗi cỡ)', () => {
  for (const n of [7, 9]) {
    const w = match('medium', 'easy', n, 20, 0, true);
    report.push('Vừa – Dễ ' + n + '×' + n + ': ' + w + '/20');
    ok(w >= 17, 'Vừa thắng ' + w + '/20');
  }
});

test('Khó thắng Dễ phần lớn (7×7, 20 ván, 3000 vòng MCTS mỗi nước)', () => {
  const w = match('hard', 'easy', 7, 20, 3000, true);
  report.push('Khó – Dễ 7×7: ' + w + '/20');
  ok(w >= 18, 'Khó thắng ' + w + '/20');
});

test('Khó thắng Vừa phần lớn (7×7, 12 ván, 20000 vòng MCTS mỗi nước, có đổi bên)', () => {
  const w = match('hard', 'medium', 7, 12, 20000, true);
  report.push('Khó – Vừa 7×7: ' + w + '/12');
  ok(w >= 8, 'Khó thắng ' + w + '/12');
});

console.log('\n' + report.join('\n'));
console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
