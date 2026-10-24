/* Kiểm tra engine Ghép Ba: chạy `node test.js`
 * - PRNG, dạng chữ của bàn, phát hiện hàng (ngang / dọc / L / T / 5), viên đặc biệt sinh ra và chỗ đặt
 * - Hiệu ứng viên đặc biệt (sọc, bom, cầu vồng, lan dây chuyền) và kết hợp hai viên đặc biệt
 * - Đổi chỗ hợp lệ / không hợp lệ, rơi + viên mới + dây chuyền nhân điểm
 * - Bàn mới không có hàng sẵn và có nước, xáo khi hết nước, hết 30 nước thì hết ván, chơi lại tất định
 * - Bàn hằng ngày theo ngày, lưu / khôi phục ván và từ chối dữ liệu hỏng
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
  if (!v) throw new Error(msg || 'điều kiện sai');
}

const { N, idx, make, SP, RAINBOW } = E;
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const rowOf = (r) => range(0, N).map((c) => idx(r, c));
const colOf = (c) => range(0, N).map((r) => idx(r, c));
const sorted = (a) => Array.from(new Set(a)).sort((x, y) => x - y);

/** Bàn từ 8 dòng chữ; '_' là ô nền chéo d / e / f theo (hàng + cột) % 3: không có hàng và không có nước nào
 *  (thay vài ô bằng a / b / c cũng không tạo hàng d / e / f), nên chỉ các ô đặt riêng quyết định kết quả. */
function B(rows) {
  const filled = rows.map((row, r) => row.trim().split(/\s+/).map((tok, c) => (tok === '_' ? 'def'[(r + c) % 3] : tok)).join(' '));
  return E.fromText(filled);
}
const BLANK = Array(8).fill('_ _ _ _ _ _ _ _');
/** Bàn nền với vài ô đặt riêng: { 'r,c': 'a-' }. */
function put(cells) {
  const rows = BLANK.map((row) => row.split(' '));
  Object.keys(cells).forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    rows[r][c] = cells[k];
  });
  return B(rows.map((r) => r.join(' ')));
}
const gameOf = (board, extra) => Object.assign({ mode: 'classic', date: null, seed: 1, rng: 12345, board, score: 0, moves: 0, maxChain: 0, made: 0 }, extra || {});
/** PRNG giả trả lần lượt các loại cho viên mới (hết dãy thì trả 0). */
const fakeRng = (seq) => ({ int: () => (seq.length ? seq.shift() : 0) });

/* ---------------- PRNG, dạng chữ ---------------- */
test('PRNG tất định theo seed và chạy tiếp đúng dãy từ trạng thái đã lưu', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const xs = range(0, 5).map(() => a.int(6));
  eq(range(0, 5).map(() => b.int(6)), xs);
  const s = a.getState();
  const next = a.int(1000);
  const c = E.rng(0);
  c.setState(s);
  eq(c.int(1000), next);
});

test('dạng chữ: đọc rồi viết lại giữ nguyên, nhận đủ loại viên đặc biệt', () => {
  const rows = ['a b c d e f a b', 'a- b| c* @ . a b c', 'a b c d e f a b', 'b c d e f a b c', 'c d e f a b c d', 'd e f a b c d e', 'e f a b c d e f', 'f a b c d e f a'];
  const bd = E.fromText(rows);
  eq(bd[8], make(0, SP.ROW));
  eq(bd[9], make(1, SP.COL));
  eq(bd[10], make(2, SP.BOMB));
  eq(bd[11], RAINBOW);
  eq(bd[12], E.EMPTY);
  eq(E.toText(bd), rows);
});

/* ---------------- Phát hiện hàng, viên đặc biệt sinh ra ---------------- */
test('hàng ngang 3 và dọc 3: hai nhóm riêng, không sinh viên đặc biệt', () => {
  const bd = put({ '0,0': 'a', '0,1': 'a', '0,2': 'a', '4,6': 'b', '5,6': 'b', '6,6': 'b' });
  const g = E.findGroups(bd);
  eq(g.length, 2);
  eq(g[0].cells, [0, 1, 2]);
  eq(g[0].spawn, null);
  eq(g[1].cells, [idx(4, 6), idx(5, 6), idx(6, 6)]);
  eq(g[1].spawn, null);
});

test('hàng 4 ngang → sọc ngang, dọc → sọc dọc; ưu tiên ô vừa kéo tới, không thì ô thứ hai của hàng', () => {
  let bd = put({ '3,1': 'a', '3,2': 'a', '3,3': 'a', '3,4': 'a' });
  let g = E.findGroups(bd);
  eq(g.length, 1);
  eq(g[0].spawn, { i: idx(3, 2), v: make(0, SP.ROW) });
  g = E.findGroups(bd, [idx(2, 4), idx(3, 4)]);
  eq(g[0].spawn, { i: idx(3, 4), v: make(0, SP.ROW) });
  bd = put({ '1,5': 'c', '2,5': 'c', '3,5': 'c', '4,5': 'c' });
  g = E.findGroups(bd);
  eq(g[0].spawn, { i: idx(2, 5), v: make(2, SP.COL) });
});

test('hình L và T → bom ở ô giao (dây chuyền) hoặc ở ô vừa kéo tới', () => {
  // L: ngang (5,2)-(5,4) + dọc (3,2)-(5,2)
  let bd = put({ '5,2': 'a', '5,3': 'a', '5,4': 'a', '3,2': 'a', '4,2': 'a' });
  let g = E.findGroups(bd);
  eq(g.length, 1);
  eq(g[0].cells.length, 5);
  eq(g[0].spawn, { i: idx(5, 2), v: make(0, SP.BOMB) });
  // T: ngang (5,1)-(5,3) + dọc (5,2)-(7,2)
  bd = put({ '5,1': 'b', '5,2': 'b', '5,3': 'b', '6,2': 'b', '7,2': 'b' });
  g = E.findGroups(bd, [idx(5, 3), idx(5, 2)]);
  eq(g[0].spawn, { i: idx(5, 2), v: make(1, SP.BOMB) });
  g = E.findGroups(bd, [idx(4, 3), idx(5, 3)]);
  eq(g[0].spawn, { i: idx(5, 3), v: make(1, SP.BOMB) });
});

test('hàng 5 (kể cả 5 dính hàng dọc) → cầu vồng', () => {
  let bd = put({ '2,1': 'c', '2,2': 'c', '2,3': 'c', '2,4': 'c', '2,5': 'c' });
  let g = E.findGroups(bd);
  eq(g[0].spawn, { i: idx(2, 3), v: RAINBOW });
  bd = put({ '2,1': 'c', '2,2': 'c', '2,3': 'c', '2,4': 'c', '2,5': 'c', '3,3': 'c', '4,3': 'c' });
  g = E.findGroups(bd, [idx(1, 3), idx(2, 3)]);
  eq(g.length, 1);
  eq(g[0].spawn, { i: idx(2, 3), v: RAINBOW });
});

test('viên đặc biệt vẫn ghép hàng theo loại của nó; cầu vồng không ghép', () => {
  ok(E.hasMatch(put({ '0,0': 'a-', '0,1': 'a*', '0,2': 'a|' })));
  ok(!E.hasMatch(put({ '0,0': '@', '0,1': '@', '0,2': '@' })));
});

/* ---------------- Đổi chỗ ---------------- */
test('đổi chỗ: chỉ hai ô kề nhau và phải tạo hàng; cầu vồng hoặc hai viên đặc biệt luôn đổi được', () => {
  const bd = put({ '3,0': 'a', '3,1': 'a', '2,2': 'a', '3,2': 'b', '6,6': '@', '0,6': 'c-', '0,7': 'b*' });
  ok(E.swapValid(bd, idx(2, 2), idx(3, 2)), 'tạo hàng a a a');
  ok(!E.swapValid(bd, idx(2, 2), idx(3, 3)), 'chéo');
  ok(!E.swapValid(bd, idx(2, 2), idx(2, 4)), 'không kề');
  ok(!E.swapValid(bd, idx(5, 5), idx(5, 4)), 'không tạo hàng');
  ok(!E.swapValid(bd, idx(0, 7), idx(0, 8)), 'ra ngoài bàn (sang hàng dưới)');
  ok(E.swapValid(bd, idx(6, 6), idx(6, 5)), 'cầu vồng');
  ok(E.swapValid(bd, idx(0, 6), idx(0, 7)), 'hai viên đặc biệt');
  const before = JSON.stringify(bd);
  E.findMoves(bd);
  eq(JSON.stringify(bd), before, 'kiểm tra nước không đổi bàn');
});

test('nước không hợp lệ trả null và không đụng ván', () => {
  const g = gameOf(put({ '3,0': 'a', '3,1': 'a', '2,2': 'a', '3,2': 'b' }));
  const snap = JSON.stringify(g);
  eq(E.swap(g, idx(5, 5), idx(5, 4)), null);
  eq(E.swap(g, idx(2, 2), idx(4, 2)), null);
  eq(JSON.stringify(g), snap);
});

test('nước hợp lệ: bậc 1 xóa đúng hàng, sinh sọc ở ô kéo tới, tính điểm, tăng số nước, ván cũ không đổi', () => {
  // a a b a ở hàng 3, 'a' ở (2,2) kéo xuống (3,2) → a a a a → sọc ngang tại (3,2)
  const g = gameOf(put({ '3,0': 'a', '3,1': 'a', '2,2': 'a', '3,2': 'b', '3,3': 'a' }));
  const snap = JSON.stringify(g);
  const res = E.swap(g, idx(2, 2), idx(3, 2));
  ok(res, 'phải hợp lệ');
  const s1 = res.steps[0];
  eq(s1.mult, 1);
  eq(s1.cleared, [idx(3, 0), idx(3, 1), idx(3, 2), idx(3, 3)]);
  eq(s1.spawned, [{ i: idx(3, 2), v: make(0, SP.ROW) }]);
  eq(s1.points, 4 * 10 + 20);
  eq(s1.after[idx(3, 2)], make(0, SP.ROW), 'sọc nằm lại ô (3,2) vì ô trên là b không bị xóa');
  eq(res.game.moves, 1);
  eq(res.game.score, res.steps.reduce((s, x) => s + x.points, 0));
  eq(res.gained, res.game.score);
  eq(JSON.stringify(g), snap);
});

/* ---------------- Rơi, viên mới, dây chuyền ---------------- */
test('rơi: viên trên rơi xuống lấp ô trống, viên mới theo PRNG vào từ trên (cột trái → phải, dưới → trên)', () => {
  const bd = put({});
  const top = bd[idx(0, 3)];
  const mid = bd[idx(5, 3)];
  bd[idx(6, 3)] = E.EMPTY;
  bd[idx(7, 3)] = E.EMPTY;
  bd[idx(0, 0)] = E.EMPTY;
  const fell = E.gravity(bd, fakeRng([1, 2, 3]));
  eq(fell.board[idx(0, 0)], 1, 'cột 0 trước');
  eq([fell.board[idx(1, 3)], fell.board[idx(0, 3)]], [2, 3], 'cột 3: viên mới dưới trước');
  eq(fell.board[idx(7, 3)], mid);
  eq(fell.board[idx(2, 3)], top);
  eq(fell.from[idx(7, 3)], 5);
  eq([fell.from[idx(0, 3)], fell.from[idx(1, 3)]], [-2, -1]);
  eq(fell.from[idx(0, 0)], -1);
  eq(fell.from[idx(4, 4)], 4, 'ô không rơi giữ nguyên hàng');
});

test('dây chuyền: viên mới tạo hàng thì xóa tiếp với hệ số ×2, ×3…', () => {
  // Hàng a a a ở trên cùng; ba viên mới b b b tạo hàng mới (bậc 2), rồi c d c thì yên
  const bd = put({ '0,0': 'a', '0,1': 'a', '0,2': 'a' });
  const res = E.resolve(bd, fakeRng([1, 1, 1, 2, 3, 2]), null, false);
  eq(res.steps.length, 2);
  eq(res.steps.map((s) => s.mult), [1, 2]);
  eq(res.steps.map((s) => s.points), [30, 60]);
  eq(res.steps[1].before.slice(0, 3), [1, 1, 1]);
  eq(res.board.slice(0, 3), [2, 3, 2]);
  ok(!E.hasMatch(res.board));
});

/* ---------------- Hiệu ứng viên đặc biệt ---------------- */
test('sọc ngang xóa cả hàng, sọc dọc xóa cả cột, bom xóa 3×3 (bị cắt ở góc)', () => {
  let bd = put({ '3,4': 'a-' });
  eq(sorted(Array.from(E.blast(bd, [idx(3, 4)], []).cleared)), rowOf(3));
  bd = put({ '3,4': 'a|' });
  eq(sorted(Array.from(E.blast(bd, [idx(3, 4)], []).cleared)), colOf(4));
  bd = put({ '0,0': 'a*' });
  eq(sorted(Array.from(E.blast(bd, [0], []).cleared)), [0, 1, 8, 9]);
  bd = put({ '4,4': 'a*' });
  eq(E.blast(bd, [idx(4, 4)], []).cleared.size, 9);
});

test('viên đặc biệt trúng hiệu ứng thì nổ tiếp (sọc → bom → sọc dọc)', () => {
  const bd = put({ '3,0': 'a-', '3,5': 'b*', '4,6': 'c|' });
  const res = E.blast(bd, [idx(3, 0)], []);
  const want = sorted(rowOf(3).concat([idx(2, 4), idx(2, 5), idx(2, 6), idx(4, 4), idx(4, 5), idx(4, 6)], colOf(6)));
  eq(sorted(Array.from(res.cleared)), want);
  eq(res.effects.map((e) => e.type), ['row', 'bomb', 'col']);
});

test('cầu vồng bị trúng hiệu ứng: xóa loại còn nhiều nhất trên bàn', () => {
  // Sọc ở (0,1) xóa hàng 0 trước, trúng cầu vồng ở (0,0); hàng 1–7 có nhiều f nhất (đặt thêm vài f)
  const bd = put({ '0,0': '@', '0,1': 'a-', '7,0': 'f', '7,3': 'f', '6,0': 'b' });
  const res = E.blast(bd, [idx(0, 1)], []);
  const fs = range(8, 64).filter((i) => bd[i] === 5);
  eq(sorted(Array.from(res.cleared)), sorted(rowOf(0).concat(fs)));
  eq(res.effects[1], { type: 'rainbow', i: 0, k: 5 });
});

test('hàng có viên sọc bị xóa thì sọc nổ; viên đặc biệt mới vẫn được đặt sau khi xóa', () => {
  // Hàng 4 ở hàng 6 có viên sọc dọc ở (6,1): nổ cả cột 1, rồi đặt sọc ngang mới ở (6,2)
  const g = gameOf(put({ '6,0': 'a', '6,1': 'a|', '5,2': 'a', '6,2': 'b', '6,3': 'a' }));
  const res = E.swap(g, idx(5, 2), idx(6, 2));
  const s1 = res.steps[0];
  eq(sorted(s1.cleared), sorted(colOf(1).concat([idx(6, 0), idx(6, 2), idx(6, 3)])));
  eq(s1.spawned, [{ i: idx(6, 2), v: make(0, SP.ROW) }]);
  eq(s1.points, (11 * 10 + 20) * 1);
});

/* ---------------- Kết hợp hai viên đặc biệt ---------------- */
test('cầu vồng + viên thường: xóa mọi viên cùng loại', () => {
  const g = gameOf(put({ '3,3': '@', '3,4': 'a', '0,0': 'a', '7,7': 'a', '5,1': 'a*' }));
  const res = E.swap(g, idx(3, 4), idx(3, 3));
  const s1 = res.steps[0];
  // a ở (0,0), (7,7), (3,4→3,3 sau đổi), bom a ở (5,1) nổ thêm 3×3, cộng ô cầu vồng
  const bomb = [idx(4, 0), idx(4, 1), idx(4, 2), idx(5, 0), idx(5, 1), idx(5, 2), idx(6, 0), idx(6, 1), idx(6, 2)];
  eq(sorted(s1.cleared), sorted([0, 63, idx(3, 3), idx(3, 4)].concat(bomb)));
  eq(s1.effects[0], { type: 'rainbow', i: idx(3, 4), k: 0 });
});

test('cầu vồng + sọc: mọi viên cùng loại thành sọc (xen kẽ ngang / dọc) rồi cùng nổ', () => {
  const g = gameOf(put({ '3,3': '@', '3,4': 'a-', '0,0': 'a', '7,6': 'a' }));
  const res = E.swap(g, idx(3, 3), idx(3, 4));
  const s1 = res.steps[0];
  eq(s1.before[0], make(0, SP.ROW), '(0,0) chẵn → ngang');
  eq(s1.before[idx(7, 6)], make(0, SP.COL), '(7,6) lẻ → dọc');
  eq(s1.before[idx(3, 3)], make(0, SP.ROW), 'viên sọc vừa kéo sang (3,3) cũng đổi theo ô của nó');
  const want = sorted(rowOf(0).concat(colOf(6), rowOf(3), [idx(3, 4)]));
  eq(sorted(s1.cleared), want);
});

test('cầu vồng + bom: mọi viên cùng loại thành bom và cùng nổ', () => {
  const g = gameOf(put({ '3,3': '@', '3,4': 'b*', '0,0': 'b' }));
  const res = E.swap(g, idx(3, 4), idx(3, 3));
  const s1 = res.steps[0];
  eq(s1.before[0], make(1, SP.BOMB));
  const box = (r, c) => [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => [r + dr, c + dc])).filter(([y, x]) => y >= 0 && x >= 0 && y < 8 && x < 8).map(([y, x]) => idx(y, x));
  eq(sorted(s1.cleared), sorted(box(0, 0).concat(box(3, 3), [idx(3, 4)])));
});

test('cầu vồng + cầu vồng: xóa cả bàn', () => {
  const g = gameOf(put({ '3,3': '@', '3,4': '@' }));
  const res = E.swap(g, idx(3, 3), idx(3, 4));
  eq(res.steps[0].cleared.length, 64);
  eq(res.steps[0].points, 640);
});

test('sọc + sọc: hàng + cột qua ô kéo tới', () => {
  const g = gameOf(put({ '3,3': 'a-', '3,4': 'b|' }));
  const res = E.swap(g, idx(3, 3), idx(3, 4));
  eq(sorted(res.steps[0].cleared), sorted(rowOf(3).concat(colOf(4))));
  eq(res.steps[0].points, 15 * 10);
});

test('sọc + bom: ba hàng + ba cột; bom + bom: nổ 5×5', () => {
  let g = gameOf(put({ '3,3': 'a-', '3,4': 'b*' }));
  let res = E.swap(g, idx(3, 3), idx(3, 4));
  eq(sorted(res.steps[0].cleared), sorted([2, 3, 4].flatMap(rowOf).concat([3, 4, 5].flatMap(colOf))));
  eq(res.steps[0].cleared.length, 39);
  g = gameOf(put({ '3,3': 'a*', '3,4': 'b*' }));
  res = E.swap(g, idx(3, 3), idx(3, 4));
  const want = [1, 2, 3, 4, 5].flatMap((r) => [2, 3, 4, 5, 6].map((c) => idx(r, c)));
  eq(sorted(res.steps[0].cleared), sorted(want));
});

/* ---------------- Bàn mới, xáo ---------------- */
test('bàn mới (300 seed): 64 viên thường, không có hàng sẵn, luôn có nước', () => {
  for (let s = 1; s <= 300; s++) {
    const g = E.newGame({ seed: s });
    eq(g.board.length, 64);
    ok(g.board.every((v) => Number.isInteger(v) && v >= 0 && v < 6), 'seed ' + s + ': viên lạ');
    ok(!E.hasMatch(g.board), 'seed ' + s + ': có hàng sẵn');
    ok(E.hasMove(g.board), 'seed ' + s + ': hết nước');
  }
});

test('cùng seed cùng bàn; seed khác bàn khác', () => {
  eq(E.newGame({ seed: 7 }).board, E.newGame({ seed: 7 }).board);
  ok(JSON.stringify(E.newGame({ seed: 7 }).board) !== JSON.stringify(E.newGame({ seed: 8 }).board));
});

test('xáo bàn hết nước: cùng các viên (giữ viên đặc biệt), không có hàng sẵn, có nước', () => {
  const dead = E.fromText(['a b c d e f a b', 'b c d e f a b c', 'c d e f a b c d', 'd e f a b c d e', 'e f a b c d e f', 'f a b c d e f a', 'a b c d e f a b', 'b c d e f a b c']);
  dead[idx(4, 4)] = make(2, SP.BOMB); // một viên đặc biệt lẻ loi vẫn chưa có nước
  ok(!E.hasMatch(dead) && !E.hasMove(dead), 'bàn mẫu phải hết nước');
  for (let s = 1; s <= 30; s++) {
    const out = E.shuffleBoard(dead, E.rng(s));
    eq(out.slice().sort((x, y) => x - y), dead.slice().sort((x, y) => x - y), 'seed ' + s);
    ok(!E.hasMatch(out) && E.hasMove(out), 'seed ' + s);
  }
});

/* ---------------- Cả ván ---------------- */
/** Chơi hết ván theo một cách chọn nước; kiểm tra bất biến sau mỗi nước. */
function playOut(game, pick) {
  let g = game;
  let shuffles = 0;
  let score = 0;
  while (!E.isOver(g)) {
    const moves = E.findMoves(g.board);
    ok(moves.length > 0, 'ván chưa hết thì phải còn nước');
    const [a, b] = pick(moves, g);
    const res = E.swap(g, a, b);
    ok(res, 'nước từ findMoves phải hợp lệ');
    ok(res.steps.length >= 1, 'nước hợp lệ phải xóa ít nhất một bậc');
    res.steps.forEach((s, i) => {
      eq(s.mult, i + 1);
      ok(s.points > 0 && s.points % 10 === 0);
      ok(s.after.every((v) => v >= 0), 'sau khi rơi không còn ô trống');
    });
    score += res.gained;
    eq(res.game.score, score);
    eq(res.game.moves, g.moves + 1);
    ok(!E.hasMatch(res.game.board), 'bàn sau nước phải yên');
    if (res.shuffle) {
      shuffles++;
      ok(!E.hasMove(res.shuffle.before), 'chỉ xáo khi hết nước');
      eq(res.shuffle.after.slice().sort((x, y) => x - y), res.shuffle.before.slice().sort((x, y) => x - y));
    }
    if (!E.isOver(res.game)) ok(E.hasMove(res.game.board), 'bàn sau nước phải còn nước');
    g = res.game;
  }
  return { g, shuffles };
}

test('chơi hết 30 nước (100 seed): bất biến giữ đúng, hết nước thì hết ván và không đổi được nữa', () => {
  for (let s = 1; s <= 100; s++) {
    const { g } = playOut(E.newGame({ seed: s }), (m) => m[(s * 7) % m.length]);
    eq(g.moves, 30);
    eq(E.movesLeft(g), 0);
    ok(E.isOver(g));
    ok(g.score > 0 && g.maxChain >= 1);
    const m = E.findMoves(g.board)[0];
    if (m) eq(E.swap(g, m[0], m[1]), null);
  }
});

test('ván tất định: cùng seed + cùng chuỗi nước → cùng bàn, cùng điểm', () => {
  const pick = (m) => m[m.length - 1];
  const a = playOut(E.newGame({ seed: 99 }), pick).g;
  const b = playOut(E.newGame({ seed: 99 }), pick).g;
  eq(E.toJSON(a), E.toJSON(b));
});

test('xáo tự động khi nước đi để lại bàn hết nước (tìm trong nhiều ván)', () => {
  let total = 0;
  for (let s = 1; s <= 400 && total < 3; s++) total += playOut(E.newGame({ seed: s }), (m) => m[0]).shuffles;
  ok(total > 0, 'phải gặp ít nhất một lần xáo');
});

/* ---------------- Hằng ngày ---------------- */
test('bàn hằng ngày: seed theo ngày, cùng ngày cùng bàn', () => {
  const a = E.newGame({ mode: 'daily', date: '2026-10-24', seed: 5 });
  const b = E.newGame({ mode: 'daily', date: '2026-10-24' });
  const c = E.newGame({ mode: 'daily', date: '2026-10-25' });
  eq(a.seed, E.dailySeed('2026-10-24'));
  eq(a.board, b.board);
  ok(JSON.stringify(a.board) !== JSON.stringify(c.board));
  eq([a.mode, a.date], ['daily', '2026-10-24']);
  eq(E.newGame({ seed: 3 }).date, null);
});

/* ---------------- Lưu ván ---------------- */
test('lưu rồi khôi phục giữ nguyên ván và chơi tiếp ra cùng kết quả', () => {
  let g = E.newGame({ seed: 5 });
  for (let i = 0; i < 4; i++) {
    const [a, b] = E.findMoves(g.board)[0];
    g = E.swap(g, a, b).game;
  }
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  const [a, b] = E.findMoves(g.board)[0];
  eq(E.toJSON(E.swap(back, a, b).game), E.toJSON(E.swap(g, a, b).game));
  const d = E.newGame({ mode: 'daily', date: '2026-10-24' });
  eq(E.fromJSON(E.toJSON(d)), d);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame({ seed: 5 }));
  const daily = E.toJSON(E.newGame({ mode: 'daily', date: '2026-10-24' }));
  const withMatch = good.board.slice();
  withMatch[0] = withMatch[1] = withMatch[2] = 3;
  const dead = E.fromText(['a b c d e f a b', 'b c d e f a b c', 'c d e f a b c d', 'd e f a b c d e', 'e f a b c d e f', 'f a b c d e f a', 'a b c d e f a b', 'b c d e f a b c']);
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { mode: 'endless' }),
    Object.assign({}, good, { date: '2026-10-24' }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { seed: 1.5 }),
    Object.assign({}, good, { rng: 2 ** 32 }),
    Object.assign({}, good, { rng: '1' }),
    Object.assign({}, good, { board: good.board.slice(0, 63) }),
    Object.assign({}, good, { board: good.board.map((v, i) => (i === 5 ? 7 : v)) }),
    Object.assign({}, good, { board: good.board.map((v, i) => (i === 5 ? -1 : v)) }),
    Object.assign({}, good, { board: good.board.map((v, i) => (i === 5 ? 'a' : v)) }),
    Object.assign({}, good, { board: withMatch }),
    Object.assign({}, good, { board: dead }),
    Object.assign({}, good, { score: -10 }),
    Object.assign({}, good, { score: 15, moves: 1 }),
    Object.assign({}, good, { score: 30, moves: 0 }),
    Object.assign({}, good, { score: 20, moves: 1, maxChain: 1 }),
    Object.assign({}, good, { score: 300, moves: 2, maxChain: 0 }),
    Object.assign({}, good, { moves: 31 }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { maxChain: -1 }),
    Object.assign({}, good, { made: null }),
    Object.assign({}, daily, { seed: daily.seed + 1 }),
    Object.assign({}, daily, { date: '24/10/2026' }),
    Object.assign({}, daily, { date: null }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
  ok(E.fromJSON(Object.assign({}, good, { board: dead, moves: 30, score: 900, maxChain: 2 })), 'ván đã hết nước đi được nhận dù bàn chết');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
