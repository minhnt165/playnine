/* Kiểm tra engine Tranh Ẩn: chạy `node test.js`
 * - Tính gợi ý số của hàng / cột
 * - Bộ giải theo dòng trên các dòng đã biết đáp án, phát hiện dòng mâu thuẫn
 * - Phát hiện nghiệm duy nhất / nhiều nghiệm
 * - Mọi tranh vẽ sẵn giải được bằng suy luận theo dòng và có đúng một nghiệm
 * - Tranh ngẫu nhiên luôn có nghiệm duy nhất, tranh hằng ngày tất định
 * - Gợi ý không bao giờ mở sai ô, hoàn tác / làm lại, tự đánh dấu X, khôi phục ván
 */
const N = require('./engine.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert thất bại');
}

function eq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'khác nhau') + `: nhận ${sa}, mong đợi ${sb}`);
}

const U = N.UNKNOWN;

/** Lưới 0/1 từ sơ đồ chữ: '#' là ô tô. */
function grid(rows) {
  const sol = [];
  rows.forEach((r) => { for (const ch of r) sol.push(ch === '#' ? 1 : 0); });
  return { w: rows[0].length, h: rows.length, sol };
}

console.log('Tranh Ẩn - kiểm tra engine');

/* ---------------- Gợi ý số ---------------- */

test('tính gợi ý của một dòng', () => {
  eq(N.lineClue([0, 0, 0]), []);
  eq(N.lineClue([1, 1, 1, 1, 1]), [5]);
  eq(N.lineClue([1, 0, 1, 1, 0, 0, 1, 1, 1]), [1, 2, 3]);
  eq(N.lineClue([0, 1, 1, 0]), [2]);
});

test('tính gợi ý hàng và cột của cả lưới', () => {
  const g = grid([
    '.#.#.',
    '#####',
    '#####',
    '.###.',
    '..#..',
  ]);
  const c = N.cluesOf(g.sol, g.w, g.h);
  eq(c.rows, [[1, 1], [5], [5], [3], [1]]);
  eq(c.cols, [[2], [4], [4], [4], [2]]);
});

/* ---------------- Bộ giải theo dòng ---------------- */

test('bộ giải theo dòng trên các dòng trống đã biết đáp án', () => {
  eq(N.solveLine([5], [U, U, U, U, U]), [1, 1, 1, 1, 1], 'đoạn đầy dòng');
  eq(N.solveLine([3], [U, U, U, U, U]), [U, U, 1, U, U], 'chồng lấn ở giữa');
  eq(N.solveLine([1, 1], [U, U, U]), [1, 0, 1], 'vừa khít có ô ngăn');
  eq(N.solveLine([2, 2], [U, U, U, U, U]), [1, 1, 0, 1, 1], 'hai đoạn vừa khít');
  eq(N.solveLine([], [U, U, U]), [0, 0, 0], 'dòng 0');
  eq(N.solveLine([4, 3], [U, U, U, U, U, U, U, U, U, U]), [U, U, 1, 1, U, U, U, 1, U, U], 'phương pháp chồng lấn');
  eq(N.solveLine([2, 1], [U, U, U, U, U, U]), [U, U, U, U, U, U], 'không suy ra được gì');
});

test('bộ giải theo dòng dùng ô đã biết', () => {
  eq(N.solveLine([1], [1, U, U]), [1, 0, 0], 'đoạn đã đủ thì phần còn lại trống');
  eq(N.solveLine([2], [U, 1, U, U, U]), [U, 1, U, 0, 0], 'đoạn 2 chứa ô thứ hai');
  eq(N.solveLine([3], [U, U, 0, U, U, U]), [0, 0, 0, 1, 1, 1], 'ô trống chặn chỗ');
  eq(N.solveLine([1, 3], [U, U, U, U, U, 1, U]), [U, U, U, U, 1, 1, U], 'ô 5 thuộc đoạn 3 nên ô 4 chắc chắn tô');
  eq(N.solveLine([1, 1], [U, 1, U, U, U]), [0, 1, 0, U, U]);
});

test('bộ giải theo dòng phát hiện dòng mâu thuẫn', () => {
  eq(N.solveLine([3], [U, 0, U, 0, U]), null, 'không đủ chỗ');
  eq(N.solveLine([1], [1, U, 1]), null, 'thừa ô tô');
  eq(N.solveLine([], [U, 1]), null, 'dòng 0 có ô tô');
  eq(N.solveLine([6], [U, U, U, U, U]), null, 'đoạn dài hơn dòng');
});

/* ---------------- Nghiệm duy nhất ---------------- */

test('phát hiện đề có nghiệm duy nhất', () => {
  const g = grid([
    '.#.#.',
    '#####',
    '#####',
    '.###.',
    '..#..',
  ]);
  const clues = N.cluesOf(g.sol, g.w, g.h);
  const res = N.countSolutions(clues, g.w, g.h, 5);
  eq(res.count, 1, 'số nghiệm');
  eq(res.solution, g.sol, 'nghiệm tìm được');
  assert(N.isUnique(g.sol, g.w, g.h), 'isUnique');
  assert(N.isLineSolvable(g.sol, g.w, g.h), 'giải được bằng suy luận theo dòng');
});

test('phát hiện đề có nhiều nghiệm', () => {
  const diag = grid(['#.', '.#']);
  eq(N.countSolutions(N.cluesOf(diag.sol, 2, 2), 2, 2, 5).count, 2, 'đường chéo 2x2');
  assert(!N.isUnique(diag.sol, 2, 2), 'isUnique phải false');
  assert(!N.isLineSolvable(diag.sol, 2, 2), 'không giải được bằng suy luận theo dòng');
  const many = grid([
    '#..#.',
    '.#..#',
    '..#..',
    '#..#.',
    '.#..#',
  ]);
  const c = N.countSolutions(N.cluesOf(many.sol, 5, 5), 5, 5, 3).count;
  assert(c >= 2, 'lưới rải rác phải có nhiều nghiệm, nhận ' + c);
  assert(!N.isUnique(many.sol, 5, 5), 'isUnique phải false');
});

test('đề duy nhất nhưng cần đoán thì bộ giải theo dòng bị kẹt, bộ đếm vẫn ra 1', () => {
  // Tìm một lưới 6x6 ngẫu nhiên có nghiệm duy nhất nhưng không giải được chỉ bằng suy luận theo dòng
  const rng = N.seededRandom(99);
  let found = null;
  for (let t = 0; t < 20000 && !found; t++) {
    const sol = N.randomGrid(6, 6, rng, 0.5);
    if (!N.isLineSolvable(sol, 6, 6) && N.isUnique(sol, 6, 6)) found = sol;
  }
  assert(found, 'không tìm được ví dụ');
  const clues = N.cluesOf(found, 6, 6);
  const ls = N.lineSolve(clues, 6, 6);
  assert(ls.ok && !ls.done, 'suy luận theo dòng phải dừng giữa chừng');
  const res = N.countSolutions(clues, 6, 6, 5);
  eq(res.count, 1, 'số nghiệm');
  eq(res.solution, found, 'đúng nghiệm');
});

/* ---------------- Bộ tranh vẽ sẵn ---------------- */

test('bộ tranh có ít nhất 30 tranh ở cỡ 5x5, 10x10, 15x15, id không trùng, có tên', () => {
  const pics = N.pictures();
  assert(pics.length >= 30, 'số tranh ' + pics.length);
  const ids = new Set();
  for (const p of pics) {
    assert(!ids.has(p.id), 'trùng id ' + p.id);
    ids.add(p.id);
    assert(N.SIZES.indexOf(p.size) >= 0 && p.w === p.size && p.h === p.size, `${p.id}: cỡ ${p.w}x${p.h}`);
    assert(typeof p.title === 'string' && p.title.length > 1, `${p.id}: thiếu tên`);
    assert(p.sol.some((x) => x === 1), `${p.id}: tranh trống`);
    p.colors.forEach((col) => assert(col === null || /^#[0-9a-f]{6}$/i.test(col), `${p.id}: màu sai ${col}`));
  }
  N.SIZES.forEach((s) => assert(N.pack(s).length >= 6, `bộ ${s}x${s} quá ít tranh`));
});

test('mọi tranh vẽ sẵn giải được bằng suy luận theo dòng và có đúng một nghiệm', () => {
  const bad = [];
  for (const p of N.pictures()) {
    const clues = N.cluesOf(p.sol, p.w, p.h);
    const ls = N.lineSolve(clues, p.w, p.h);
    if (!ls.done) bad.push(p.id + ' (kẹt)');
    else if (JSON.stringify(ls.grid) !== JSON.stringify(p.sol)) bad.push(p.id + ' (sai nghiệm)');
    else if (N.countSolutions(clues, p.w, p.h, 2).count !== 1) bad.push(p.id + ' (nhiều nghiệm)');
  }
  eq(bad, [], 'tranh lỗi');
});

/* ---------------- Tranh ngẫu nhiên & hằng ngày ---------------- */

test('tranh ngẫu nhiên luôn có nghiệm duy nhất (mọi cỡ, 150 tranh mỗi cỡ)', () => {
  for (const size of N.SIZES) {
    const rng = N.seededRandom(1000 + size);
    for (let i = 0; i < 150; i++) {
      const g = N.generate(size, size, rng);
      eq([g.w, g.h], [size, size], 'cỡ');
      assert(!g.fallback, `${size}x${size}: phải dùng tranh dự phòng`);
      assert(N.isLineSolvable(g.sol, size, size), `${size}x${size} #${i}: không giải được bằng suy luận`);
      if (i < 40) eq(N.countSolutions(N.cluesOf(g.sol, size, size), size, size, 2).count, 1, `${size}x${size} #${i}: số nghiệm`);
    }
  }
});

test('tranh hằng ngày tất định: cùng ngày cùng tranh, khác ngày khác tranh', () => {
  const a = N.dailyPuzzle('2026-10-20');
  const b = N.dailyPuzzle('2026-10-20');
  eq(a.sol, b.sol, 'cùng ngày');
  eq([a.w, a.h], [N.DAILY_SIZE, N.DAILY_SIZE], 'cỡ');
  eq(N.dailySeed('2026-10-20'), N.hashString('playnine-tranhan-daily-2026-10-20'), 'seed');
  const seen = new Set();
  for (let d = 1; d <= 28; d++) {
    const key = `2026-02-${String(d).padStart(2, '0')}`;
    const p = N.dailyPuzzle(key);
    assert(N.isLineSolvable(p.sol, p.w, p.h), key + ': không giải được');
    seen.add(p.sol.join(''));
  }
  eq(seen.size, 28, 'mỗi ngày một tranh khác nhau');
});

/* ---------------- Gợi ý ---------------- */

/** Kiểm tra một gợi ý khớp lời giải. */
function checkHint(game, hnt, where) {
  assert(hnt, where + ': không có gợi ý');
  const want = game.sol[hnt.idx] === 1 ? N.FILL : N.CROSS;
  eq(hnt.value, want, where + ': gợi ý sai ô ' + hnt.idx);
  assert(game.cells[hnt.idx] !== hnt.value, where + ': gợi ý ô đã đúng');
}

test('gợi ý không bao giờ mở sai ô và tự giải hết được tranh', () => {
  const rng = N.seededRandom(4242);
  const puzzles = N.pictures().slice();
  for (const size of N.SIZES) for (let i = 0; i < 6; i++) puzzles.push(N.generate(size, size, rng));
  puzzles.forEach((pz, k) => {
    const game = N.createGame(pz);
    // Trạng thái ngẫu nhiên: vài ô đúng, vài ô sai
    const n = game.sol.length;
    for (let t = 0; t < n / 3; t++) {
      const i = Math.floor(rng() * n);
      const r = rng();
      game.cells[i] = r < 0.45 ? N.FILL : r < 0.8 ? N.CROSS : N.EMPTY;
    }
    let steps = 0;
    while (!N.isSolved(game)) {
      const hnt = N.hint(game);
      checkHint(game, hnt, `${pz.id || 'ngẫu nhiên #' + k} bước ${steps}`);
      game.cells[hnt.idx] = hnt.value;
      steps++;
      assert(steps <= n * 2, 'gợi ý lặp vô hạn');
    }
    eq(N.hint(game), null, 'giải xong thì không còn gợi ý');
  });
});

test('gợi ý sửa ô sai trước, rồi mới suy luận', () => {
  const pz = N.pictureById('tim');
  const game = N.createGame(pz);
  game.cells[0] = N.FILL; // ô (0,0) của trái tim là ô trống
  const h1 = N.hint(game);
  eq([h1.idx, h1.value, h1.fix], [0, N.CROSS, true]);
  game.cells[0] = N.CROSS;
  const h2 = N.hint(game);
  eq(h2.fix, false, 'không còn ô sai');
  eq(h2.value, N.FILL, 'ưu tiên ô cần tô');
  assert([5, 6, 7, 8, 9, 10, 11, 12, 13, 14].indexOf(h2.idx) >= 0, 'hàng 5 ô là chỗ suy luận được trước, nhận ' + h2.idx);
});

/* ---------------- Ván chơi ---------------- */

test('tô, hoàn tác, làm lại và phát hiện giải xong', () => {
  const pz = N.pictureById('tim');
  const game = N.createGame(pz);
  assert(!N.hasActions(game), 'ván mới chưa có thao tác');
  const ch = N.setCells(game, [[5, N.FILL], [6, N.FILL]]);
  N.commit(game, ch);
  eq(game.past.length, 1, 'một thao tác');
  assert(N.hasActions(game));
  eq(N.undo(game).length, 2, 'hoàn tác 2 ô');
  eq(game.cells[5], N.EMPTY);
  eq(game.cells[6], N.EMPTY);
  N.redo(game);
  eq(game.cells[6], N.FILL, 'làm lại');
  // Tô hết lời giải
  const rest = [];
  pz.sol.forEach((v, i) => { if (v) rest.push([i, N.FILL]); });
  N.commit(game, N.setCells(game, rest));
  assert(game.solved && N.isSolved(game), 'đã giải');
  eq(N.progress(game), 1, 'tiến độ 100%');
  eq(N.undo(game), null, 'giải xong thì khóa hoàn tác');
});

test('dòng xong thì xám gợi ý, tự đánh dấu X phần còn lại', () => {
  const pz = N.pictureById('tim');
  const game = N.createGame(pz);
  // Hàng 0 là "1 1": tô ô 1 và 3
  N.setCells(game, [[1, N.FILL]]);
  assert(!N.isLineDone(game, 'row', 0), 'chưa xong');
  N.setCells(game, [[3, N.FILL]]);
  assert(N.isLineDone(game, 'row', 0), 'xong hàng 0');
  const ch = N.autoCross(game, [3]);
  eq(ch.map((c) => c[0]).sort((a, b) => a - b), [0, 2, 4], 'X các ô trống còn lại của hàng 0');
  eq(game.cells[0], N.CROSS);
  // Dòng xong theo gợi ý dù đặt sai chỗ
  const g2 = N.createGame(pz);
  N.setCells(g2, [[0, N.FILL], [2, N.FILL]]);
  assert(N.isLineDone(g2, 'row', 0), 'đúng dãy gợi ý thì coi là xong');
});

test('khôi phục ván từ JSON và từ chối dữ liệu hỏng', () => {
  const pz = N.pictureById('non-la');
  const game = N.createGame(pz);
  N.commit(game, N.setCells(game, [[4, N.FILL], [0, N.CROSS], [1, N.MISS]]));
  game.mistakes = 1;
  const back = N.restore(JSON.parse(JSON.stringify(game)));
  assert(back, 'khôi phục được');
  eq(back.cells, game.cells, 'ô');
  eq(back.past, game.past, 'lịch sử');
  eq(back.mistakes, 1, 'số lỗi');
  eq(N.restore(null), null);
  eq(N.restore({ v: 2 }), null, 'sai phiên bản');
  eq(N.restore(Object.assign({}, game, { cells: game.cells.slice(1) })), null, 'thiếu ô');
  eq(N.restore(Object.assign({}, game, { sol: game.sol.map(() => 2) })), null, 'lời giải hỏng');
  const badPast = N.restore(Object.assign({}, game, { past: [[[999, 0, 1]]] }));
  eq(badPast.past, [], 'lịch sử hỏng thì bỏ');
});

console.log(`\n${passed} ok, ${failed} lỗi`);
if (failed) {
  console.log('Lỗi: ' + failures.join(', '));
  process.exit(1);
}
