/* Kiểm tra engine 2048: chạy `node test.js`
 * - Luật trượt / gộp của một dãy, mỗi ô chỉ gộp một lần mỗi lượt
 * - Đủ bốn hướng trên lưới 4x4, cả lưới 3x3 và 5x5
 * - Nước đi không làm thay đổi gì thì không sinh ô mới
 * - Phát hiện hết nước đi, cộng điểm, chạm 2048
 * - Hoàn tác: khôi phục đúng, tối đa 3 lượt mỗi ván
 * - Tỉ lệ sinh ô 2 / 4, id ô không trùng, khôi phục state từ JSON
 */
const G = require('./engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL ' + name + '\n       ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'nhận ' + a + ', cần ' + b);
}

/** Hàm ngẫu nhiên trả lần lượt các giá trị cho trước (lặp lại khi hết). */
function seq(...vals) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

/** PRNG có seed (mulberry32) để chạy nhiều ván tự động. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bỏ ô vừa sinh ra khỏi kết quả để so sánh phần trượt / gộp. */
function withoutSpawn(res) {
  const v = G.values(res.state);
  if (res.spawned) v[res.spawned.at] = 0;
  return v;
}

console.log('Luật trượt và gộp một dãy');
test('[2,2,2,2] -> [4,4,0,0]', () => eq(G.slideLine([2, 2, 2, 2]).line, [4, 4, 0, 0]));
test('[2,2,4,4] -> [4,8,0,0]', () => eq(G.slideLine([2, 2, 4, 4]).line, [4, 8, 0, 0]));
test('[4,4,8,0] -> [8,8,0,0] (ô vừa gộp không gộp tiếp)', () => eq(G.slideLine([4, 4, 8, 0]).line, [8, 8, 0, 0]));
test('[2,2,4,0] -> [4,4,0,0] (không gộp dây chuyền thành 8)', () => eq(G.slideLine([2, 2, 4, 0]).line, [4, 4, 0, 0]));
test('[2,0,0,2] -> [4,0,0,0]', () => eq(G.slideLine([2, 0, 0, 2]).line, [4, 0, 0, 0]));
test('[2,2,2,0] -> [4,2,0,0] (gộp cặp gần phía trượt trước)', () => eq(G.slideLine([2, 2, 2, 0]).line, [4, 2, 0, 0]));
test('[0,0,0,2] -> [2,0,0,0]', () => eq(G.slideLine([0, 0, 0, 2]).line, [2, 0, 0, 0]));
test('[2,4,8,16] không đổi, moved = false', () => {
  const r = G.slideLine([2, 4, 8, 16]);
  eq(r.line, [2, 4, 8, 16]);
  assert(!r.moved, 'không được báo là đã di chuyển');
});
test('điểm của dãy = tổng các ô mới gộp', () => {
  eq(G.slideLine([2, 2, 2, 2]).score, 8);
  eq(G.slideLine([2, 2, 4, 4]).score, 12);
  eq(G.slideLine([8, 8, 0, 0]).score, 16);
});

console.log('Bốn hướng trên lưới');
// prettier-ignore
const BASE = [
  2, 2, 0, 4,
  0, 4, 4, 4,
  8, 0, 8, 2,
  2, 0, 0, 2,
];
test('trái', () => {
  const r = G.move(G.fromValues(4, BASE), 'left', seq(0));
  // prettier-ignore
  eq(withoutSpawn(r), [
    4, 4, 0, 0,
    8, 4, 0, 0,
    16, 2, 0, 0,
    4, 0, 0, 0,
  ]);
});
test('phải', () => {
  const r = G.move(G.fromValues(4, BASE), 'right', seq(0));
  // prettier-ignore
  eq(withoutSpawn(r), [
    0, 0, 4, 4,
    0, 0, 4, 8,
    0, 0, 16, 2,
    0, 0, 0, 4,
  ]);
});
test('lên', () => {
  const r = G.move(G.fromValues(4, BASE), 'up', seq(0));
  // prettier-ignore
  eq(withoutSpawn(r), [
    2, 2, 4, 8,
    8, 4, 8, 4,
    2, 0, 0, 0,
    0, 0, 0, 0,
  ]);
});
test('xuống', () => {
  const r = G.move(G.fromValues(4, BASE), 'down', seq(0));
  // prettier-ignore
  eq(withoutSpawn(r), [
    0, 0, 0, 0,
    2, 0, 0, 0,
    8, 2, 4, 8,
    2, 4, 8, 4,
  ]);
});
test('cột [2,2,2,2] đi lên -> [4,4,0,0]', () => {
  // prettier-ignore
  const s = G.fromValues(4, [
    2, 0, 0, 0,
    2, 0, 0, 0,
    2, 0, 0, 0,
    2, 0, 0, 0,
  ]);
  const v = withoutSpawn(G.move(s, 'up', seq(0.99)));
  eq([v[0], v[4], v[8], v[12]], [4, 4, 0, 0]);
});
test('lưới 3x3 và 5x5', () => {
  const r3 = G.move(G.fromValues(3, [2, 2, 2, 0, 4, 4, 8, 0, 8]), 'left', seq(0.99));
  eq(withoutSpawn(r3), [4, 2, 0, 8, 0, 0, 16, 0, 0]);
  const v5 = new Array(25).fill(0);
  [2, 2, 2, 2, 2].forEach((x, i) => (v5[i] = x));
  const r5 = G.move(G.fromValues(5, v5), 'right', seq(0.99));
  eq(withoutSpawn(r5).slice(0, 5), [0, 0, 2, 4, 4]);
});

console.log('Sinh ô mới');
test('nước đi không thay đổi gì: không sinh ô, state giữ nguyên', () => {
  // prettier-ignore
  const s = G.fromValues(4, [
    2, 4, 0, 0,
    8, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const r = G.move(s, 'left', seq(0));
  assert(!r.moved, 'không được báo là đã di chuyển');
  assert(r.spawned === null, 'không được sinh ô');
  assert(r.state === s, 'phải trả lại đúng state cũ');
  eq(r.state.moves, 0);
  eq(G.move(s, 'up', seq(0)).moved, false, 'đi lên cũng không đổi gì');
});
test('nước đi hợp lệ sinh đúng một ô vào ô trống', () => {
  const s = G.fromValues(4, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const r = G.move(s, 'right', seq(0, 0.5));
  assert(r.moved && r.spawned, 'phải có ô mới');
  eq(r.state.cells.filter(Boolean).length, 2);
  eq(r.spawned.at, 0, 'ô trống đầu tiên khi rng = 0');
  eq(r.spawned.v, 2);
});
test('rng >= 0.9 sinh ô 4, rng < 0.9 sinh ô 2', () => {
  const s = G.fromValues(4, new Array(16).fill(0));
  eq(G.spawnTile(s, seq(0, 0.95)).v, 4);
  eq(G.spawnTile(s, seq(0, 0.89)).v, 2);
});
test('tỉ lệ ô 4 xấp xỉ 10%', () => {
  const rng = mulberry32(42);
  let fours = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const s = G.fromValues(4, new Array(16).fill(0));
    if (G.spawnTile(s, rng).v === 4) fours++;
  }
  const pct = fours / N;
  assert(pct > 0.085 && pct < 0.115, 'tỉ lệ ô 4 = ' + pct.toFixed(3));
});
test('ván mới có đúng 2 ô, mỗi ô là 2 hoặc 4', () => {
  for (const size of G.SIZES) {
    const s = G.newGame(size, mulberry32(size));
    eq(s.cells.length, size * size);
    const tiles = s.cells.filter(Boolean);
    eq(tiles.length, 2);
    assert(tiles.every((t) => t.v === 2 || t.v === 4), 'giá trị ô đầu không hợp lệ');
    eq(s.undoLeft, 3);
  }
});

console.log('Id ô (dùng cho hiệu ứng)');
test('ô trượt giữ id, ô gộp có id mới, slides chỉ đúng đích', () => {
  const s = G.fromValues(4, [2, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [a, b, , c] = s.cells;
  const r = G.move(s, 'left', seq(0.99));
  eq(r.merges.length, 1);
  const m = r.merges[0];
  eq(m.from, [a.id, b.id]);
  eq(m.at, 0);
  eq(m.v, 4);
  assert(m.id !== a.id && m.id !== b.id, 'ô gộp phải có id mới');
  eq(r.state.cells[0].id, m.id);
  eq(r.state.cells[1].id, c.id, 'ô 4 giữ nguyên id');
  eq(r.slides.find((x) => x.id === c.id), { id: c.id, from: 3, to: 1 });
  eq(r.slides.find((x) => x.id === b.id).to, 0);
});
test('id không bao giờ trùng sau nhiều nước', () => {
  let s = G.newGame(4, mulberry32(7));
  const rng = mulberry32(8);
  for (let i = 0; i < 300 && !s.over; i++) {
    s = G.move(s, G.DIRS[Math.floor(rng() * 4)], rng).state;
    const ids = s.cells.filter(Boolean).map((t) => t.id);
    assert(new Set(ids).size === ids.length, 'trùng id ở nước ' + i);
    assert(ids.every((id) => id < s.nextId), 'id phải nhỏ hơn nextId');
  }
});

console.log('Điểm');
test('điểm cộng đúng tổng các ô gộp trong lượt', () => {
  // prettier-ignore
  const s = G.fromValues(4, [
    2, 2, 4, 4,
    8, 8, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], { score: 100 });
  const r = G.move(s, 'left', seq(0.99));
  eq(r.gained, 4 + 8 + 16);
  eq(r.state.score, 128);
  eq(s.score, 100, 'state cũ không bị sửa');
});
test('nước đi không gộp thì không cộng điểm', () => {
  const r = G.move(G.fromValues(4, [0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'left', seq(0.99));
  assert(r.moved, 'phải di chuyển');
  eq(r.gained, 0);
  eq(r.state.score, 0);
});
test('điểm cộng dồn qua nhiều nước = tổng gained', () => {
  let s = G.newGame(4, mulberry32(99));
  const rng = mulberry32(100);
  let sum = 0;
  for (let i = 0; i < 200 && !s.over; i++) {
    const r = G.move(s, G.DIRS[i % 4], rng);
    sum += r.gained;
    s = r.state;
  }
  eq(s.score, sum);
});

console.log('Hết nước đi và thắng');
test('lưới đầy, không có cặp kề nhau: hết nước', () => {
  // prettier-ignore
  const s = G.fromValues(4, [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ]);
  assert(!G.canMove(s), 'canMove phải là false');
  assert(s.over, 'over phải là true');
  for (const d of G.DIRS) assert(!G.move(s, d, seq(0)).moved, 'không được đi ' + d);
});
test('lưới đầy nhưng còn cặp kề nhau (dọc hoặc ngang): chưa hết nước', () => {
  // prettier-ignore
  const vertical = G.fromValues(4, [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 4,
  ]);
  assert(G.canMove(vertical), 'cặp 4-4 ở hàng cuối');
  // prettier-ignore
  const col = G.fromValues(4, [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    2, 8, 4, 2,
  ]);
  assert(G.canMove(col), 'cặp 2-2 ở cột đầu');
});
test('nước đi cuối làm đầy lưới thì đánh dấu over', () => {
  // prettier-ignore
  const s = G.fromValues(4, [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    8, 16, 32, 0,
  ]);
  // Đi sang phải: hàng cuối thành [0,8,16,32], ô mới 4 sinh vào góc trái dưới (rng >= 0.9)
  const r = G.move(s, 'right', seq(0, 0.95));
  assert(r.moved, 'phải di chuyển');
  eq(r.spawned, { id: r.spawned.id, v: 4, at: 12 });
  assert(r.state.over, 'phải hết nước: hàng cuối 4,8,16,32 không kề cặp nào');
});
test('chạm 2048 lần đầu báo reached, lần sau không báo nữa', () => {
  const s = G.fromValues(4, [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert(!s.won, 'chưa thắng');
  const r = G.move(s, 'left', seq(0.99));
  assert(r.reached && r.state.won, 'phải báo đạt 2048');
  eq(r.state.cells[0].v, 2048);
  const cont = G.continuePlaying(r.state);
  assert(cont.keepPlaying, 'keepPlaying');
  const r2 = G.move(cont, 'right', seq(0.99));
  assert(r2.moved && !r2.reached, 'không báo lại');
});

console.log('Hoàn tác');
test('hoàn tác khôi phục lưới, điểm, số nước', () => {
  const s = G.fromValues(4, [2, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 10 });
  const r = G.move(s, 'left', seq(0.5));
  const u = G.undo(r.state);
  assert(u, 'phải hoàn tác được');
  eq(G.values(u), G.values(s));
  eq(u.cells.map((t) => t && t.id), s.cells.map((t) => t && t.id), 'id ô khôi phục như cũ');
  eq(u.score, 10);
  eq(u.moves, 0);
  eq(u.undoLeft, 2);
  assert(u.nextId >= r.state.nextId, 'nextId không lùi để không trùng id');
});
test('tối đa 3 lần hoàn tác mỗi ván', () => {
  let s = G.newGame(4, mulberry32(5));
  const rng = mulberry32(6);
  let made = 0;
  for (let i = 0; made < 6; i++) {
    const r = G.move(s, G.DIRS[i % 4], rng);
    if (r.moved) made++;
    s = r.state;
  }
  eq(s.history.length, 3, 'chỉ giữ 3 ảnh chụp');
  for (let k = 0; k < 3; k++) {
    s = G.undo(s);
    assert(s, 'lần hoàn tác thứ ' + (k + 1));
  }
  eq(s.undoLeft, 0);
  eq(s.moves, 3);
  assert(G.undo(s) === null, 'lần thứ 4 phải bị từ chối');
  assert(!G.canUndo(s), 'canUndo phải là false');
  // Đi tiếp vẫn không hoàn tác được nữa
  for (let i = 0; i < 4; i++) s = G.move(s, G.DIRS[i], rng).state;
  eq(s.history.length, 0);
  assert(G.undo(s) === null, 'đã hết lượt hoàn tác');
});
test('hoàn tác sau khi hết nước thì chơi tiếp được', () => {
  // prettier-ignore
  const s = G.fromValues(4, [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    8, 16, 32, 0,
  ]);
  const r = G.move(s, 'right', seq(0, 0.95));
  assert(r.state.over, 'hết nước');
  const u = G.undo(r.state);
  assert(u && !u.over, 'sau hoàn tác phải còn nước');
});
test('không có nước nào thì không hoàn tác được', () => {
  assert(G.undo(G.newGame(4, mulberry32(1))) === null, 'ván mới không có gì để hoàn tác');
});

console.log('Lưu / khôi phục');
test('state đi qua JSON khôi phục y nguyên', () => {
  let s = G.newGame(5, mulberry32(11));
  const rng = mulberry32(12);
  for (let i = 0; i < 20; i++) s = G.move(s, G.DIRS[i % 4], rng).state;
  const back = G.restore(JSON.parse(JSON.stringify(s)));
  assert(back, 'phải khôi phục được');
  eq(back, s);
});
test('dữ liệu hỏng trả về null', () => {
  assert(G.restore(null) === null, 'null');
  assert(G.restore({ v: 1, size: 6, cells: [] }) === null, 'kích thước lạ');
  assert(G.restore({ v: 1, size: 3, cells: [null, null] }) === null, 'thiếu ô');
  const bad = new Array(9).fill(null);
  bad[0] = { id: 1, v: 3 };
  assert(G.restore({ v: 1, size: 3, cells: bad }) === null, 'giá trị không phải lũy thừa của 2');
  const dup = new Array(9).fill(null);
  dup[0] = { id: 1, v: 2 };
  dup[1] = { id: 1, v: 2 };
  assert(G.restore({ v: 1, size: 3, cells: dup }) === null, 'trùng id');
});

console.log('Chơi tự động');
test('500 ván ngẫu nhiên: luôn hợp lệ và kết thúc', () => {
  const rng = mulberry32(2048);
  for (let g = 0; g < 500; g++) {
    const size = G.SIZES[g % 3];
    let s = G.newGame(size, rng);
    let steps = 0;
    while (!s.over) {
      const r = G.move(s, G.DIRS[Math.floor(rng() * 4)], rng);
      if (r.moved) {
        assert(r.spawned, 'nước đi hợp lệ phải sinh ô');
        const before = s.cells.filter(Boolean).reduce((a, t) => a + t.v, 0);
        const after = r.state.cells.filter(Boolean).reduce((a, t) => a + t.v, 0);
        eq(after, before + r.spawned.v, 'tổng giá trị chỉ tăng bằng ô mới sinh');
      }
      s = r.state;
      assert(++steps < 100000, 'lặp vô hạn');
    }
    assert(!G.canMove(s), 'over nhưng vẫn còn nước');
  }
});

console.log(`\n${passed} test đạt, ${failed} test lỗi`);
if (failed) process.exitCode = 1;
