/* Kiểm tra engine Nối Màu: chạy `node test.js`
 * - Sinh màn: đúng kích thước, đủ số màu, mỗi đường ≥ 3 ô, lời giải của bộ sinh phủ kín bàn (nên luôn giải được)
 * - Kiểm tra thắng: nhận mọi lời giải đầy đủ hợp lệ (kể cả khác lời giải của bộ sinh), từ chối lời giải thiếu / cắt nhau / nhảy ô
 * - Luật vẽ: bắt đầu từ chấm hoặc đầu đường, đi ô kề, lùi lại, vẽ đè cắt đường khác, không đi qua chấm màu khác
 * - Đếm nước, xóa đoạn cuối, làm lại
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

function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

/** Bàn 3x3 một màu, hai chấm ở hai góc đối nhau: có ít nhất hai lời giải phủ kín (rắn theo hàng, rắn theo cột). */
const corner = { size: 3, dots: [[0, 8]] };
const byRows = [0, 1, 2, 5, 4, 3, 6, 7, 8];
const byCols = [0, 3, 6, 7, 4, 1, 2, 5, 8];

/** Bàn 3x3 ba màu theo hàng: màu k nối (k,0) với (k,2). */
const rows3 = { size: 3, dots: [[0, 2], [3, 5], [6, 8]] };

/** Vẽ một đường bằng các thao tác của người chơi: chạm ô đầu rồi kéo qua từng ô. */
function draw(g, cells) {
  const r = E.touch(g, cells[0]);
  g = r.game;
  for (let i = 1; i < cells.length; i++) g = E.extend(g, r.color, cells[i]);
  return g;
}

/* ---------------- Sinh màn ---------------- */

test('PRNG có seed: cùng seed cùng dãy, khác seed khác dãy', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const c = E.rng(43);
  const xs = [a(), a(), a()];
  eq(xs, [b(), b(), b()]);
  ok(xs[0] !== c(), 'seed khác phải cho số khác');
  ok(xs.every((x) => x >= 0 && x < 1), 'trong [0, 1)');
});

test('sinh màn: cùng seed ra cùng màn, khác seed ra màn khác', () => {
  eq(E.generate(7, 123), E.generate(7, 123));
  ok(JSON.stringify(E.generate(7, 123).dots) !== JSON.stringify(E.generate(7, 124).dots));
});

test('mọi màn sinh ra đều có lời giải phủ kín bàn (lời giải của bộ sinh), đủ màu, mỗi đường ≥ 3 ô', () => {
  Object.keys(E.MODES).forEach((mode) => {
    const { size, colors } = E.MODES[mode];
    for (let seed = 1; seed <= 150; seed++) {
      const p = E.generate(size, seed * 7919);
      const tag = mode + ' seed ' + seed;
      eq(p.size, size, tag);
      ok(p.dots.length >= colors[0] && p.dots.length <= colors[1], tag + ': số màu ' + p.dots.length);
      ok(p.solution.every((path) => path.length >= E.MIN_PATH), tag + ': có đường ngắn hơn ' + E.MIN_PATH);
      ok(E.checkSolution(p, p.solution), tag + ': lời giải của bộ sinh không hợp lệ');
      // Chấm là hai đầu của từng đường trong lời giải
      p.dots.forEach(([a, b], k) => eq([a, b], [p.solution[k][0], p.solution[k][p.solution[k].length - 1]], tag));
      // Hai chấm cùng màu không nằm sát nhau (đường đó sẽ quá dễ)
      ok(p.dots.every(([a, b]) => !E.adjacent(size, a, b)), tag + ': hai chấm cùng màu sát nhau');
    }
  });
});

test('newGame theo mode: bàn đúng cỡ, chưa vẽ gì, chưa đi nước nào', () => {
  const g = E.newGame('5x5', 99);
  eq(g.size, 5);
  eq(g.paths.every((p) => p.length === 0), true);
  eq([g.moves, g.last, E.isWon(g), E.connectedCount(g), E.filledCount(g)], [0, -1, false, 0, 0]);
  eq(g.dots, E.generate(5, 99).dots);
});

test('vẽ lại đúng lời giải của bộ sinh bằng thao tác người chơi thì thắng (mọi mode)', () => {
  Object.keys(E.MODES).forEach((mode) => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = E.newGame(mode, seed);
      const sol = E.generate(g.size, seed).solution;
      sol.forEach((path) => { g = draw(g, path); });
      ok(E.isWon(g), mode + ' seed ' + seed);
      eq([E.connectedCount(g), E.filledCount(g)], [g.dots.length, g.size * g.size]);
      eq(g.moves, g.dots.length, 'mỗi màu vẽ một lần = một nước');
    }
  });
});

/* ---------------- Kiểm tra thắng ---------------- */

test('kiểm tra thắng nhận mọi lời giải phủ kín hợp lệ, không chỉ lời giải của bộ sinh', () => {
  ok(E.checkSolution(corner, [byRows]), 'rắn theo hàng');
  ok(E.checkSolution(corner, [byCols]), 'rắn theo cột');
  ok(E.checkSolution(corner, [byCols.slice().reverse()]), 'vẽ từ chấm kia');
  ok(E.isWon(draw(E.fromPuzzle(corner), byCols)), 'vẽ bằng thao tác');
  ok(E.isWon(draw(E.fromPuzzle(corner), byRows)), 'vẽ bằng thao tác');
});

test('kiểm tra thắng từ chối lời giải thiếu ô, chưa nối, cắt nhau, nhảy ô, đi chéo', () => {
  // Nối được nhưng chưa phủ kín bàn
  eq(E.checkSolution(corner, [[0, 1, 2, 5, 8]]), false);
  // Đường chưa tới chấm thứ hai
  eq(E.checkSolution(corner, [byRows.slice(0, 8)]), false);
  // Thiếu đường của một màu
  eq(E.checkSolution(rows3, [[0, 1, 2], [3, 4, 5]]), false);
  eq(E.checkSolution(rows3, [[0, 1, 2], [3, 4, 5], []]), false);
  // Hai đường cắt nhau (dùng chung ô 4)
  eq(E.checkSolution(rows3, [[0, 1, 4, 5, 2], [3, 4, 5], [6, 7, 8]]), false);
  // Đường đi qua chấm màu khác
  eq(E.checkSolution(rows3, [[0, 3, 4, 1, 2], [3, 4, 5], [6, 7, 8]]), false);
  // Nhảy ô / đi chéo / quay lại ô cũ / ra ngoài bàn
  eq(E.checkSolution(corner, [[0, 2, 1, 5, 4, 3, 6, 7, 8]]), false);
  eq(E.checkSolution(corner, [[0, 4, 8]]), false);
  eq(E.checkSolution(corner, [[0, 1, 0, 3, 6, 7, 4, 5, 8]]), false);
  eq(E.checkSolution(corner, [[0, 1, 2, 5, 4, 3, 6, 7, 9, 8]]), false);
  // Dữ liệu hỏng
  eq(E.checkSolution(corner, null), false);
  eq(E.checkSolution(corner, [null]), false);
  eq(E.checkSolution(corner, [['0', 1]]), false);
  // Lời giải đúng của bàn ba màu
  ok(E.checkSolution(rows3, [[0, 1, 2], [5, 4, 3], [6, 7, 8]]));
});

/* ---------------- Luật vẽ ---------------- */

test('chạm ô trống thì không bắt đầu vẽ', () => {
  const g = E.fromPuzzle(rows3);
  const r = E.touch(draw(g, [0, 1, 2]), 4);
  eq(r.color, -1);
  eq(E.touch(g, 4).color, -1);
});

test('chạm chấm thì bắt đầu đường từ chấm đó; kéo sang ô kề thì nối dài', () => {
  const r = E.touch(E.fromPuzzle(rows3), 2);
  eq([r.color, r.game.paths[0]], [0, [2]]);
  let g = E.extend(r.game, 0, 1);
  eq(g.paths[0], [2, 1]);
  eq(E.filledCount(g), 2);
  g = E.extend(g, 0, 0);
  eq(g.paths[0], [2, 1, 0]);
  eq([E.isConnected(g, 0), E.connectedCount(g)], [true, 1]);
});

test('không đi tới ô không kề, ô ngoài bàn, chấm màu khác', () => {
  const g = E.touch(E.fromPuzzle(rows3), 0).game;
  eq(E.extend(g, 0, 2), g, 'không kề');
  eq(E.extend(g, 0, 4), g, 'chéo');
  eq(E.extend(g, 0, -1), g, 'ngoài bàn');
  eq(E.extend(g, 0, 3), g, 'chấm màu khác');
  eq(E.extend(g, 1, 4), g, 'màu chưa có đường');
});

test('đường đã nối xong thì không kéo dài thêm, chỉ lùi lại', () => {
  const g = draw(E.fromPuzzle(corner), [0, 1, 2, 5, 8]);
  ok(E.isConnected(g, 0));
  eq(E.extend(g, 0, 7), g);
  eq(E.extend(g, 0, 5).paths[0], [0, 1, 2, 5]);
});

test('kéo lùi về ô đã vẽ của chính đường đó thì cắt bớt tới ô đó', () => {
  let g = draw(E.fromPuzzle(corner), [0, 1, 2, 5, 4]);
  g = E.extend(g, 0, 1); // 4 kề 1: quay về ô 1, bỏ 2, 5, 4
  eq(g.paths[0], [0, 1]);
});

test('vẽ đè lên đường màu khác thì cắt đường đó từ ô bị đè', () => {
  const big = { size: 4, dots: [[0, 3], [12, 15]] };
  let g = draw(E.fromPuzzle(big), [0, 4, 5, 6, 2, 3]);
  ok(E.isConnected(g, 0));
  g = draw(g, [12, 8, 9, 5]); // màu 1 đi vào ô 5 của màu 0
  eq(g.paths[0], [0, 4]);
  eq(g.paths[1], [12, 8, 9, 5]);
  eq(E.isConnected(g, 0), false);
  // Cắt sát chấm thì đường kia mất hẳn
  g = E.extend(g, 1, 4);
  eq(g.paths[0], []);
  eq(g.paths[1], [12, 8, 9, 5, 4]);
});

test('chạm giữa đường thì cắt tới đó rồi vẽ tiếp; chạm đầu đường thì vẽ tiếp', () => {
  const g = draw(E.fromPuzzle(corner), [0, 1, 2, 5, 4]);
  let r = E.touch(g, 4);
  eq([r.color, r.game.paths[0]], [0, [0, 1, 2, 5, 4]]);
  r = E.touch(g, 2);
  eq([r.color, r.game.paths[0]], [0, [0, 1, 2]]);
  eq(E.extend(r.game, 0, 5).paths[0], [0, 1, 2, 5]);
});

test('chạm lại chấm thì xóa đường cũ và vẽ lại từ chấm đó', () => {
  const g = draw(E.fromPuzzle(rows3), [0, 1, 2]);
  eq(E.touch(g, 2).game.paths[0], [2]);
  eq(E.touch(g, 0).game.paths[0], [0]);
});

test('đếm nước: mỗi lần chuyển sang vẽ màu khác là một nước; vẽ tiếp cùng màu không tính thêm', () => {
  let g = E.fromPuzzle(rows3);
  g = draw(g, [0, 1]);
  eq(g.moves, 1);
  g = draw(g, [1, 2]); // vẽ tiếp đường màu 0
  eq(g.moves, 1);
  g = draw(g, [3, 4]);
  eq(g.moves, 2);
  // Chạm mà không đổi gì thì không tính
  eq(E.touch(g, 4).game.moves, 2);
  g = draw(g, [2, 1]); // quay lại màu 0 (cắt bớt)
  eq(g.moves, 3);
});

test('xóa đoạn cuối (Backspace) và làm lại (R)', () => {
  let g = draw(E.fromPuzzle(rows3), [0, 1, 2]);
  g = draw(g, [3, 4]);
  g = E.undo(g, 1);
  eq(g.paths[1], []);
  eq(E.undo(g, 1), g, 'không còn gì để xóa');
  g = E.undo(g, 0);
  eq(g.paths[0], [0, 1]);
  const moves = g.moves;
  g = E.reset(g);
  eq([g.paths, g.last, g.moves], [[[], [], []], -1, moves]);
});

test('thắng khi mọi cặp nối và mọi ô được phủ; nối hết nhưng còn ô trống thì chưa thắng', () => {
  let g = draw(E.fromPuzzle(corner), [0, 1, 2, 5, 8]);
  ok(E.isConnected(g, 0));
  eq(E.isWon(g), false);
  eq(E.filledCount(g), 5);
  g = draw(g, [5, 4, 3, 6, 7, 8]);
  eq(g.paths[0], [0, 1, 2, 5, 4, 3, 6, 7, 8]);
  ok(E.isWon(g));
  // Đã thắng thì mọi thao tác không đổi gì
  eq(E.touch(g, 0).color, -1);
  eq(E.extend(g, 0, 7), g);
  eq(E.undo(g, 0), g);
  eq(E.reset(g), g);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván', () => {
  let g = E.newGame('7x7', 5);
  const sol = E.generate(7, 5).solution;
  g = draw(g, sol[0]);
  g = draw(g, sol[1].slice(0, 2));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  // Lưu giữa lúc đang vẽ (đường chỉ có chấm) cũng khôi phục được
  const mid = E.touch(g, sol[2][0]).game;
  eq(E.fromJSON(E.toJSON(mid)), mid);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(draw(E.fromPuzzle(rows3), [0, 1]));
  ok(E.fromJSON(good), 'dữ liệu tốt phải nhận');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  [
    null, 1, 'x', {},
    bad({ v: 99 }),
    bad({ size: 1 }), bad({ size: 13 }), bad({ size: '3' }),
    bad({ dots: [] }),
    bad({ dots: [[0, 2], [3, 5], [6]] }),
    bad({ dots: [[0, 2], [3, 5], [6, 6]] }),
    bad({ dots: [[0, 2], [2, 5], [6, 8]] }),
    bad({ dots: [[0, 2], [3, 5], [6, 9]] }),
    bad({ paths: [[0, 1]] }),
    bad({ paths: [[1, 0], [], []] }), // không bắt đầu ở chấm
    bad({ paths: [[0, 2], [], []] }), // nhảy ô
    bad({ paths: [[0, 1, 4], [3, 4], []] }), // hai đường chung ô
    bad({ paths: [[0, 3], [], []] }), // đi qua chấm màu khác
    bad({ paths: [[0, 1, 2, 1], [], []] }), // quay lại ô cũ
    bad({ paths: [[0, 1, 2, 5], [], []] }), // đi tiếp sau khi tới chấm thứ hai
    bad({ paths: [[0, 1.5], [], []] }),
    bad({ moves: -1 }), bad({ moves: 1.5 }),
    bad({ last: 3 }), bad({ last: -2 }),
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
