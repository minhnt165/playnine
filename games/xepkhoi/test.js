/* Kiểm tra engine Xếp Khối: chạy `node test.js`
 * - Bộ khối: hình dạng hợp lệ, không trùng, đủ họ (đơn, thẳng tới 5, vuông 2x2 / 3x3, L, T, S)
 * - PRNG seed được: cùng seed thì cùng chuỗi khối
 * - Đặt khối: trong bàn, không đè ô đã có; ăn hàng / cột; điểm = số ô + 10 × số đường × số đường ăn cùng lúc
 * - Đặt hết ba khối thì chia ba khối mới; hết chỗ cho mọi khối còn lại thì thua
 * - Bộ đầu luôn đặt được hết (solver vét cạn trên nhiều seed); bộ sau luôn có ít nhất một khối đặt được
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
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
  if (!v) throw new Error(msg || 'expected truthy');
}

const N = E.SIZE;
const idx = (r, c) => r * N + c;

/** Ván dựng tay: bàn từ danh sách ô đã lấp (màu 1), ba khối cho trước. */
function make(filled, pieces, extra) {
  const g = E.newGame(1);
  const board = new Array(N * N).fill(0);
  filled.forEach(([r, c]) => { board[idx(r, c)] = 1; });
  return Object.assign({}, g, { board, pieces: pieces.slice() }, extra || {});
}

/** Bàn kín trừ các ô (r + c) % 3 === 0: không hàng / cột nào đầy, không có hai ô trống liền nhau. */
function sparse(extraEmpty) {
  const filled = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r + c) % 3 === 0) continue;
    if (extraEmpty && extraEmpty.some(([a, b]) => a === r && b === c)) continue;
    filled.push([r, c]);
  }
  return filled;
}

/** Solver: còn cách đặt hết các khối trong `pieces` (theo thứ tự bất kỳ) lên bàn không. */
function canPlaceAll(g) {
  const slots = [0, 1, 2].filter((s) => g.pieces[s]);
  if (!slots.length) return true;
  for (const s of slots) {
    const p = E.PIECES[g.pieces[s]];
    for (let r = 0; r + p.h <= N; r++) {
      for (let c = 0; c + p.w <= N; c++) {
        if (!E.canPlace(g.board, g.pieces[s], r, c)) continue;
        // Đặt thẳng trên bàn (không chia bộ mới) để chỉ xét bộ hiện tại
        const res = E.applyPiece(g.board, g.pieces[s], r, c);
        const pieces = g.pieces.slice();
        pieces[s] = null;
        if (canPlaceAll({ board: res.board, pieces })) return true;
      }
    }
  }
  return false;
}

/* ---------------- Bộ khối ---------------- */

test('bộ khối: mỗi khối có ô hợp lệ, w/h khớp, ô liền nhau, không trùng hình', () => {
  const seen = new Set();
  Object.keys(E.PIECES).forEach((k) => {
    const p = E.PIECES[k];
    ok(p.cells.length >= 1 && p.cells.length <= 9, k + ' số ô');
    eq(Math.max(...p.cells.map((x) => x[0])) + 1, p.h, k + ' h');
    eq(Math.max(...p.cells.map((x) => x[1])) + 1, p.w, k + ' w');
    eq(Math.min(...p.cells.map((x) => x[0])), 0, k + ' sát trên');
    eq(Math.min(...p.cells.map((x) => x[1])), 0, k + ' sát trái');
    ok(p.color >= 1 && p.color <= E.COLORS, k + ' màu');
    ok(p.weight > 0, k + ' trọng số');
    const sig = p.cells.map((x) => x.join(',')).sort().join(';');
    ok(!seen.has(sig), k + ' trùng hình');
    seen.add(sig);
    // liền nhau: loang từ ô đầu phải tới hết
    const set = new Set(p.cells.map((x) => x.join(',')));
    const stack = [p.cells[0]];
    const got = new Set([p.cells[0].join(',')]);
    while (stack.length) {
      const [r, c] = stack.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
        const s = r + dr + ',' + (c + dc);
        if (set.has(s) && !got.has(s)) { got.add(s); stack.push([r + dr, c + dc]); }
      });
    }
    eq(got.size, p.cells.length, k + ' liền nhau');
  });
});

test('bộ khối: có đơn, thẳng dài 5 hai chiều, vuông 2x2 và 3x3, L, T, S', () => {
  const sizes = (k) => [E.PIECES[k].h, E.PIECES[k].w, E.PIECES[k].cells.length];
  eq(sizes('o1'), [1, 1, 1]);
  eq(sizes('i5h'), [1, 5, 5]);
  eq(sizes('i5v'), [5, 1, 5]);
  eq(sizes('o2'), [2, 2, 4]);
  eq(sizes('o3'), [3, 3, 9]);
  ['l4a', 't4a', 's4a', 'c3a', 'c5a'].forEach((k) => ok(E.PIECES[k], k));
  ok(Object.keys(E.PIECES).every((k) => E.PIECES[k].w <= 5 && E.PIECES[k].h <= 5), 'không quá 5');
});

/* ---------------- PRNG / chia khối ---------------- */

test('cùng seed thì cùng ván, khác seed thì (gần như luôn) khác', () => {
  eq(E.newGame(42), E.newGame(42));
  let diff = 0;
  for (let s = 1; s <= 20; s++) if (JSON.stringify(E.newGame(s).pieces) !== JSON.stringify(E.newGame(s + 1000).pieces)) diff++;
  ok(diff >= 15, 'khác seed ra khối khác: ' + diff);
});

test('ván mới: bàn trống, ba khối, điểm 0, chưa thua', () => {
  const g = E.newGame(7);
  eq(g.board.length, 100);
  ok(g.board.every((v) => v === 0));
  eq(g.pieces.length, 3);
  ok(g.pieces.every((k) => E.PIECES[k]));
  eq([g.score, g.moves, g.lines, g.over], [0, 0, 0, false]);
});

test('bộ khối đầu luôn đặt được hết (solver, 300 seed)', () => {
  for (let s = 1; s <= 300; s++) {
    const g = E.newGame(s);
    ok(canPlaceAll(g), 'seed ' + s + ': ' + g.pieces.join(','));
  }
});

test('chia khối theo trọng số: mọi khối đều xuất hiện', () => {
  const count = {};
  let g = E.newGame(99);
  for (let i = 0; i < 400; i++) {
    g.pieces.forEach((k) => { count[k] = (count[k] || 0) + 1; });
    g = E.deal(Object.assign({}, g, { pieces: [null, null, null] }));
  }
  Object.keys(E.PIECES).forEach((k) => ok(count[k] > 0, 'thiếu ' + k));
});

test('bộ mới luôn có ít nhất một khối đặt được khi bàn còn chỗ', () => {
  // Mỗi hàng, mỗi cột chỉ còn đúng một ô trống, không ô trống nào kề nhau: chỉ ô đơn vừa
  const filled = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (c !== (r * 3) % N) filled.push([r, c]);
  for (let s = 1; s <= 50; s++) {
    const g = E.deal(make(filled, [null, null, null], { rng: s * 7919 }));
    ok(g.pieces.every((k) => E.PIECES[k]), 'đủ ba khối');
    ok(g.pieces.some((k) => E.fitsAnywhere(g.board, k)), 'seed ' + s + ': ' + g.pieces.join(','));
  }
});

/* ---------------- Đặt khối ---------------- */

test('canPlace: trong bàn và không đè ô đã có', () => {
  const g = make([[0, 1]], ['i3h', 'o1', 'o1']);
  ok(!E.canPlace(g.board, 'i3h', 0, 0), 'đè ô (0,1)');
  ok(E.canPlace(g.board, 'i3h', 1, 0));
  ok(E.canPlace(g.board, 'i3h', 0, 7));
  ok(!E.canPlace(g.board, 'i3h', 0, 8), 'tràn phải');
  ok(!E.canPlace(g.board, 'i3h', -1, 0), 'tràn trên');
  ok(!E.canPlace(g.board, 'i3h', 10, 0), 'tràn dưới');
  ok(!E.canPlace(g.board, 'nope', 0, 0), 'khối lạ');
  // chỉ ô có trong hình mới cần trống: góc ##/#. ôm ô đã có ở (1,1)
  const h = make([[1, 1]], ['c3a', 'o1', 'o1']);
  ok(E.canPlace(h.board, 'c3a', 0, 0), 'c3a chừa (1,1)');
});

test('đặt khối: +1 điểm mỗi ô, bỏ khối khỏi khay, tăng số nước, không sửa ván cũ', () => {
  const g = E.newGame(3);
  const k = g.pieces[1];
  const p = E.PIECES[k];
  const res = E.place(g, 1, 2, 2);
  ok(res, 'đặt được');
  eq(res.gained, p.cells.length);
  eq(res.game.score, p.cells.length);
  eq(res.game.moves, 1);
  eq(res.game.pieces[1], null);
  eq(res.game.pieces[0], g.pieces[0]);
  p.cells.forEach(([r, c]) => eq(res.game.board[idx(2 + r, 2 + c)], p.color));
  eq(res.cells, p.cells.map(([r, c]) => idx(2 + r, 2 + c)));
  eq(g.moves, 0, 'ván cũ không đổi');
  ok(g.board.every((v) => v === 0), 'bàn cũ không đổi');
});

test('đặt sai (đè, tràn, ô khay trống, ván đã thua) trả về null', () => {
  const g = make([[0, 0]], ['o1', null, 'i2h']);
  eq(E.place(g, 0, 0, 0), null);
  eq(E.place(g, 1, 5, 5), null);
  eq(E.place(g, 2, 0, 9), null);
  eq(E.place(g, 3, 0, 0), null);
  eq(E.place(Object.assign({}, g, { over: true }), 0, 5, 5), null);
});

test('ăn một hàng: +10, hàng trống lại', () => {
  const filled = [];
  for (let c = 0; c < 9; c++) filled.push([4, c]);
  const g = make(filled, ['o1', 'o1', 'o1']);
  const res = E.place(g, 0, 4, 9);
  eq(res.rows, [4]);
  eq(res.cols, []);
  eq(res.lines, 1);
  eq(res.gained, 1 + 10);
  eq(res.game.lines, 1);
  eq(res.cleared.length, 10);
  ok(res.game.board.every((v) => v === 0), 'hàng đã xóa');
});

test('ăn hàng và cột cùng lúc: 2 đường → +40, ô giao chỉ tính một lần', () => {
  const filled = [];
  for (let c = 0; c < N; c++) if (c !== 3) filled.push([5, c]);
  for (let r = 0; r < N; r++) if (r !== 5) filled.push([r, 3]);
  filled.push([0, 0]);
  const g = make(filled, ['o1', 'o2', 'o2']);
  const res = E.place(g, 0, 5, 3);
  eq([res.rows, res.cols, res.lines], [[5], [3], 2]);
  eq(res.gained, 1 + 10 * 2 * 2);
  eq(res.cleared.length, 19);
  eq(res.game.board.filter((v) => v).length, 1, 'chỉ còn ô (0,0)');
  eq(res.game.board[0], 1);
});

test('ăn ba hàng bằng thanh dọc: +3 ô + 90', () => {
  const filled = [];
  for (let r = 0; r < 3; r++) for (let c = 1; c < N; c++) filled.push([r, c]);
  const g = make(filled, ['i3v', 'o1', 'o1']);
  const res = E.place(g, 0, 0, 0);
  eq(res.rows, [0, 1, 2]);
  eq(res.gained, 3 + 10 * 3 * 3);
});

test('preview: báo ô, hàng / cột sẽ ăn; vị trí sai trả null', () => {
  const filled = [];
  for (let c = 0; c < 8; c++) filled.push([9, c]);
  const g = make(filled, ['i2h', 'o1', 'o1']);
  const pv = E.preview(g, 0, 9, 8);
  eq(pv.cells, [idx(9, 8), idx(9, 9)]);
  eq([pv.rows, pv.cols], [[9], []]);
  eq(E.preview(g, 0, 9, 7), null);
  eq(E.preview(g, 0, 9, 9), null);
  eq(E.preview(g, 3, 9, 9), null, 'ô khay không có');
});

test('đặt hết ba khối thì chia ba khối mới (từ PRNG của ván)', () => {
  let g = make([], ['o1', 'o1', 'o1'], { rng: 12345 });
  g = E.place(g, 0, 0, 0).game;
  g = E.place(g, 2, 0, 2).game;
  eq(g.pieces, [null, 'o1', null]);
  const res = E.place(g, 1, 0, 4);
  ok(res.dealt, 'báo đã chia');
  ok(res.game.pieces.every((k) => E.PIECES[k]), 'ba khối mới');
  ok(res.game.rng !== g.rng, 'PRNG chạy tiếp');
});

test('thua khi không khối nào còn lại đặt vừa; ván thua không đặt được nữa', () => {
  const g = make(sparse(), ['o1', 'i3h', 'o3']);
  eq(E.isOver(g), false, 'còn ô đơn');
  ok(E.fitsAnywhere(g.board, 'o1'));
  ok(!E.fitsAnywhere(g.board, 'i3h'));
  eq(E.playable(g), [true, false, false]);
  const res = E.place(g, 0, 0, 0);
  ok(res, 'đặt ô đơn');
  eq(res.lines, 0);
  ok(res.game.over, 'hết chỗ cho i3h và o3');
  eq(E.isOver(res.game), true);
  eq(E.place(res.game, 1, 0, 3), null);
});

test('playable: khối nào còn chỗ', () => {
  const g = make(sparse([[0, 1]]), ['i2h', 'i3h', null]);
  eq(E.playable(g), [true, false, false]);
});

test('chơi ngẫu nhiên tới thua: điểm luôn khớp, bàn không bao giờ có hàng / cột đầy', () => {
  for (let s = 1; s <= 30; s++) {
    let g = E.newGame(s);
    let rnd = s;
    const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
    let guard = 0;
    while (!g.over && guard++ < 2000) {
      const moves = [];
      g.pieces.forEach((k, slot) => {
        if (!k) return;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (E.canPlace(g.board, k, r, c)) moves.push([slot, r, c]);
      });
      ok(moves.length, 'chưa thua thì phải còn nước');
      const [slot, r, c] = moves[Math.floor(rand() * moves.length)];
      const before = g.score;
      const res = E.place(g, slot, r, c);
      eq(res.game.score, before + res.gained);
      for (let i = 0; i < N; i++) {
        ok(!res.game.board.slice(i * N, i * N + N).every(Boolean), 'hàng đầy ' + i);
        ok(!Array.from({ length: N }, (_, r2) => res.game.board[r2 * N + i]).every(Boolean), 'cột đầy ' + i);
      }
      g = res.game;
    }
    ok(g.over, 'seed ' + s + ' phải kết thúc');
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván, chơi tiếp ra cùng kết quả', () => {
  let g = E.newGame(5);
  g = E.place(g, 0, 0, 0).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  const a = E.place(E.place(g, 1, 5, 0).game, 2, 0, 5);
  const b = E.place(E.place(back, 1, 5, 0).game, 2, 0, 5);
  eq(a, b);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.place(E.newGame(5), 0, 0, 0).game);
  ok(E.fromJSON(good), 'bản tốt');
  const bad = [
    null, 1, 'x', {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { board: good.board.slice(1) }),
    Object.assign({}, good, { board: good.board.map((v, i) => (i === 0 ? 99 : v)) }),
    Object.assign({}, good, { board: good.board.map((v, i) => (i === 0 ? 1.5 : v)) }),
    Object.assign({}, good, { board: good.board.map((v, i) => (i < 10 ? 1 : v)) }), // hàng đầy
    Object.assign({}, good, { board: good.board.map((v, i) => (i % 10 === 9 ? 1 : v)) }), // cột đầy
    Object.assign({}, good, { pieces: ['o1', 'o1'] }),
    Object.assign({}, good, { pieces: ['zz', 'o1', 'o1'] }),
    Object.assign({}, good, { pieces: [null, null, null] }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: '5' }),
    Object.assign({}, good, { moves: 1.2 }),
    Object.assign({}, good, { lines: -3 }),
    Object.assign({}, good, { rng: -1 }),
    Object.assign({}, good, { rng: 2 ** 32 }),
    Object.assign({}, good, { seed: 'a' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

test('khôi phục tính lại cờ thua theo bàn (không tin cờ trong dữ liệu)', () => {
  const g = E.newGame(5);
  eq(E.fromJSON(Object.assign(E.toJSON(g), { over: true })).over, false);
  const lost = E.place(make(sparse(), ['o1', 'i3h', 'o3']), 0, 0, 0).game;
  eq(E.fromJSON(Object.assign(E.toJSON(lost), { over: false })).over, true);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
