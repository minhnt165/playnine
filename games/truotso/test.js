/* Kiểm tra engine Trượt Số: chạy `node test.js`
 * - Xáo bàn: luôn là hoán vị hợp lệ, giải được, chưa xếp xong, không quá gần đích (cả 3x3, 4x4, 5x5)
 * - Tính giải được: bàn sinh bằng nước đi hợp lệ luôn giải được, đổi chỗ hai ô thì không
 * - Nước đi: chỉ ô cùng hàng / cột với ô trống; trượt cả đoạn tính một nước; phím hướng
 * - Phát hiện thắng, bàn đã xong không đi tiếp được
 * - Lưu / khôi phục ván qua JSON và từ chối dữ liệu hỏng
 */
const T = require('./engine.js');

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
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg || 'khác nhau') + `: nhận ${x}, mong đợi ${y}`);
}

/** Đi ngẫu nhiên k nước hợp lệ từ bàn đã xếp (luôn giải được). */
function scramble(size, k, rng) {
  let s = T.fromTiles(size, T.solvedTiles(size));
  for (let i = 0; i < k; i++) {
    const dirs = T.DIRS.filter((d) => T.indexForDir(s, d) >= 0);
    const d = dirs[Math.floor(rng() * dirs.length)];
    const idx = T.indexForDir(s, d);
    // Đi thẳng trên mảng (moveAt từ chối bàn đã xong)
    const tiles = s.tiles.slice();
    const g = tiles.indexOf(0);
    tiles[g] = tiles[idx];
    tiles[idx] = 0;
    s = T.fromTiles(size, tiles);
  }
  return s;
}

// prettier-ignore
const B4 = [
  1, 2, 3, 4,
  5, 6, 7, 8,
  9, 10, 11, 12,
  13, 14, 0, 15,
];

console.log('Xáo bàn');
for (const size of T.SIZES) {
  test(`${size}x${size}: 300 bàn xáo đều hợp lệ, giải được, chưa xong`, () => {
    const rng = T.seededRandom(1000 + size);
    for (let i = 0; i < 300; i++) {
      const g = T.newGame(size, rng);
      eq(g.size, size);
      eq(g.moves, 0);
      assert(T.isPermutation(g.tiles, size), 'không phải hoán vị: ' + g.tiles);
      assert(T.isSolvable(g.tiles, size), 'không giải được: ' + g.tiles);
      assert(!T.isSolved(g.tiles), 'đã xếp xong ngay từ đầu');
      assert(T.manhattan(g.tiles, size) >= size * size, 'quá gần đích: ' + g.tiles);
    }
  });
}
test('kích thước lạ dùng 4x4', () => eq(T.newGame(7, T.seededRandom(1)).size, 4));
test('Math.random mặc định vẫn chạy', () => assert(T.isSolvable(T.newGame(4).tiles, 4)));
test('hàm ngẫu nhiên luôn trả 0 / gần 1 vẫn ra bàn hợp lệ', () => {
  for (const r of [() => 0, () => 0.999999]) {
    for (const size of T.SIZES) {
      const g = T.newGame(size, r);
      assert(T.isPermutation(g.tiles, size) && T.isSolvable(g.tiles, size) && !T.isSolved(g.tiles));
    }
  }
});
test('mode <-> kích thước', () => {
  eq(T.MODES, ['3x3', '4x4', '5x5']);
  eq(T.modeOf(5), '5x5');
  eq(T.sizeOf('3x3'), 3);
  eq(T.sizeOf('4x5'), 0);
  eq(T.sizeOf('6x6'), 0);
});

console.log('Tính giải được');
test('bàn đã xếp xong là giải được', () => T.SIZES.forEach((n) => assert(T.isSolvable(T.solvedTiles(n), n))));
test('bàn sinh bằng nước đi hợp lệ luôn giải được (cả cạnh chẵn lẫn lẻ)', () => {
  const rng = T.seededRandom(7);
  for (const size of T.SIZES) {
    for (let i = 0; i < 200; i++) {
      const s = scramble(size, 1 + Math.floor(rng() * 80), rng);
      assert(T.isSolvable(s.tiles, size), size + 'x' + size + ': ' + s.tiles);
    }
  }
});
test('đổi chỗ hai ô số thì không giải được (bài 14-15 kinh điển)', () => {
  const t = T.solvedTiles(4);
  t[13] = 15;
  t[14] = 14;
  assert(!T.isSolvable(t, 4));
  const t3 = T.solvedTiles(3);
  t3[0] = 2;
  t3[1] = 1;
  assert(!T.isSolvable(t3, 3));
});

console.log('Nước đi');
test('chạm ô kề ô trống: ô trượt vào ô trống, tính 1 nước', () => {
  const s = T.fromTiles(4, B4, 5);
  const r = T.moveAt(s, 15);
  assert(r.moved);
  eq(r.slides, [{ v: 15, from: 15, to: 14 }]);
  eq(r.dir, 'left');
  eq(r.state.moves, 6);
  assert(r.solved, 'phải thắng');
  eq(s.tiles, B4, 'không sửa state cũ');
});
test('chạm ô không cùng hàng / cột: không đi', () => {
  const s = T.fromTiles(4, B4);
  // Ô trống ở chỉ số 14 (hàng 3, cột 2)
  for (const idx of [0, 5, 7, 11]) assert(!T.moveAt(s, idx).moved, 'ô ' + idx);
  assert(!T.moveAt(s, 14).moved, 'chạm chính ô trống');
  assert(!T.moveAt(s, -1).moved && !T.moveAt(s, 16).moved && !T.moveAt(s, 1.5).moved);
});
test('trượt cả hàng về phía ô trống (một nước)', () => {
  const s = T.fromTiles(4, B4);
  const r = T.moveAt(s, 12); // ô trống ở 14, chạm ô 12: 13, 14 trượt sang phải
  assert(r.moved);
  eq(r.state.tiles.slice(12), [0, 13, 14, 15]);
  eq(r.slides, [{ v: 14, from: 13, to: 14 }, { v: 13, from: 12, to: 13 }]);
  eq(r.dir, 'right');
  eq(r.state.moves, 1);
});
test('trượt cả cột về phía ô trống (một nước)', () => {
  const s = T.fromTiles(4, B4);
  const r = T.moveAt(s, 2); // cột 2: 3, 7, 11 trượt xuống
  assert(r.moved);
  eq([r.state.tiles[2], r.state.tiles[6], r.state.tiles[10], r.state.tiles[14]], [0, 3, 7, 11]);
  eq(r.dir, 'down');
  eq(r.slides.length, 3);
  const back = T.moveAt(r.state, 14); // trượt ngược lên
  eq(back.state.tiles, B4);
  eq(back.dir, 'up');
  eq(back.state.moves, 2);
});
test('phím hướng: ô phía đối diện trượt vào ô trống', () => {
  const s = T.fromTiles(4, B4); // ô trống ở hàng 3, cột 2
  eq(T.indexForDir(s, 'left'), 15);
  eq(T.indexForDir(s, 'right'), 13);
  eq(T.indexForDir(s, 'down'), 10);
  eq(T.indexForDir(s, 'up'), -1, 'ô trống ở hàng cuối');
  assert(!T.moveDir(s, 'up').moved);
  eq(T.moveDir(s, 'right').state.tiles.slice(12), [13, 0, 14, 15]);
  const win = T.moveDir(s, 'left');
  assert(win.solved && T.isSolved(win.state.tiles));
});
test('hướng không hợp lệ ném lỗi', () => {
  let threw = false;
  try {
    T.moveDir(T.fromTiles(3, T.solvedTiles(3)), 'diagonal');
  } catch (e) {
    threw = true;
  }
  assert(threw);
});
test('bàn đã xếp xong không đi tiếp được', () => {
  const s = T.fromTiles(4, T.solvedTiles(4));
  assert(T.isSolved(s.tiles));
  assert(!T.moveAt(s, 14).moved);
  assert(!T.moveDir(s, 'right').moved);
});
test('đi ngẫu nhiên giữ bàn là hoán vị giải được, ô đúng chỗ đếm đúng', () => {
  const rng = T.seededRandom(99);
  let s = T.newGame(5, rng);
  for (let i = 0; i < 500; i++) {
    const r = T.moveAt(s, Math.floor(rng() * 25));
    if (r.moved) s = r.state;
    assert(T.isPermutation(s.tiles, 5) && T.isSolvable(s.tiles, 5));
  }
  eq(T.inPlace(T.solvedTiles(5)), 24);
  eq(T.inPlace(B4), 14);
});
test('giải xong bàn 3x3 bằng cách đi ngược lại các nước xáo', () => {
  const rng = T.seededRandom(5);
  let s = T.fromTiles(3, T.solvedTiles(3));
  const gaps = [];
  for (let i = 0; i < 30; i++) {
    const dirs = T.DIRS.filter((d) => T.indexForDir(s, d) >= 0);
    gaps.push(s.tiles.indexOf(0));
    const tiles = s.tiles.slice();
    const g = tiles.indexOf(0);
    const idx = T.indexForDir(s, dirs[Math.floor(rng() * dirs.length)]);
    tiles[g] = tiles[idx];
    tiles[idx] = 0;
    s = T.fromTiles(3, tiles);
  }
  let solved = T.isSolved(s.tiles);
  while (gaps.length && !solved) {
    const r = T.moveAt(s, gaps.pop());
    assert(r.moved);
    s = r.state;
    solved = r.solved;
  }
  assert(solved && T.isSolved(s.tiles));
});

console.log('Lưu / khôi phục');
test('khôi phục từ JSON giữ nguyên bàn và số nước', () => {
  const g = T.newGame(4, T.seededRandom(3));
  const r = T.moveAt(g, T.indexForDir(g, T.DIRS.find((d) => T.indexForDir(g, d) >= 0))).state;
  const back = T.restore(JSON.parse(JSON.stringify(r)));
  eq(back, r);
});
test('từ chối dữ liệu hỏng', () => {
  const good = T.fromTiles(4, B4, 3);
  eq(T.restore(null), null);
  eq(T.restore('x'), null);
  eq(T.restore(Object.assign({}, good, { v: 2 })), null, 'sai phiên bản');
  eq(T.restore(Object.assign({}, good, { size: 6 })), null, 'sai kích thước');
  eq(T.restore(Object.assign({}, good, { tiles: B4.slice(0, 15) })), null, 'thiếu ô');
  const dup = B4.slice();
  dup[0] = 2;
  eq(T.restore(Object.assign({}, good, { tiles: dup })), null, 'trùng số');
  const big = B4.slice();
  big[0] = 16;
  eq(T.restore(Object.assign({}, good, { tiles: big })), null, 'số ngoài phạm vi');
  const str = B4.slice();
  str[0] = '1';
  eq(T.restore(Object.assign({}, good, { tiles: str })), null, 'không phải số');
  const unsolvable = T.solvedTiles(4);
  unsolvable[13] = 15;
  unsolvable[14] = 14;
  eq(T.restore(Object.assign({}, good, { tiles: unsolvable })), null, 'không giải được');
  eq(T.restore(Object.assign({}, good, { tiles: T.solvedTiles(4) })), null, 'đã xếp xong');
});
test('số nước hỏng thì về 0', () => {
  eq(T.restore(Object.assign(T.fromTiles(4, B4), { moves: -3 })).moves, 0);
  eq(T.restore(Object.assign(T.fromTiles(4, B4), { moves: 'a' })).moves, 0);
});

console.log(`\n${passed} ok, ${failed} lỗi`);
if (failed) {
  console.log('Lỗi: ' + failures.join(' | '));
  process.exit(1);
}
