/* Kiểm tra engine Nổ Khối: chạy `node test.js`
 * - Sinh bàn theo seed: đúng kích thước, đúng số màu, luôn có nước đi
 * - Tìm nhóm, nổ nhóm, khối rơi xuống, cột trống dồn sang trái
 * - Điểm (n - 2)², thưởng dọn sạch bàn, hết nước là hết ván
 * - Bot tham lam chơi hết ván trên nhiều seed (ván nào cũng chơi được tới cuối, điểm khớp công thức)
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
  if (!v) throw new Error(msg || 'expected truthy');
}

/** Dựng ván từ danh sách cột (mỗi cột là chuỗi màu từ dưới lên, ví dụ '1121'), qua fromJSON như ván lưu. */
function board(cols, opts) {
  const o = Object.assign({ w: 4, h: 4, k: 4, score: 0, pops: 0 }, opts || {});
  let id = 0;
  const raw = {
    v: 1, w: o.w, h: o.h, k: o.k, seed: 1, score: o.score, pops: o.pops,
    cols: cols.map((s) => s.split('').map((ch) => [id++, Number(ch)])),
  };
  const g = E.fromJSON(raw);
  if (!g) throw new Error('board() không hợp lệ: ' + JSON.stringify(cols));
  return g;
}
/** Màu các cột dạng chuỗi để so sánh dễ đọc. */
const colors = (g) => g.cols.map((col) => col.map((b) => b.c).join(''));

/* ---------------- Sinh bàn ---------------- */

test('ván mới: 10 cột × 12 hàng, 4 màu, chưa có điểm', () => {
  const g = E.newGame(42);
  eq([g.w, g.h, g.k, g.cols.length, g.score, g.pops], [10, 12, 4, 10, 0, 0]);
  g.cols.forEach((col) => eq(col.length, 12));
  eq(E.blocksLeft(g), 120);
});

test('cùng seed thì cùng bàn, khác seed thì khác bàn', () => {
  eq(colors(E.newGame(7)), colors(E.newGame(7)));
  ok(JSON.stringify(colors(E.newGame(7))) !== JSON.stringify(colors(E.newGame(8))), 'hai seed ra cùng bàn');
});

test('màu nằm trong 1..k, mã khối không trùng, đủ cả 4 màu', () => {
  const g = E.newGame(123);
  const ids = new Set();
  const seen = new Set();
  g.cols.forEach((col) => col.forEach((b) => {
    ok(b.c >= 1 && b.c <= 4, 'màu ' + b.c);
    ids.add(b.id);
    seen.add(b.c);
  }));
  eq([ids.size, seen.size], [120, 4]);
});

test('bàn sinh ra luôn có nước đi (500 seed)', () => {
  for (let s = 1; s <= 500; s++) ok(E.hasMoves(E.newGame(s)), 'seed ' + s + ' không có nước');
});

test('kích thước và số màu tùy chọn', () => {
  const g = E.newGame(5, { w: 6, h: 5, k: 3 });
  eq([g.w, g.h, g.k, g.cols.length, g.cols[0].length], [6, 5, 3, 6, 5]);
  g.cols.forEach((col) => col.forEach((b) => ok(b.c <= 3)));
});

/* ---------------- Nhóm ---------------- */

test('groupAt: nhóm nối theo cạnh, không tính đường chéo', () => {
  // cột 0: 1 1 2 (dưới lên), cột 1: 2 1 2, cột 2: 1 2 2
  const g = board(['112', '212', '122']);
  const grp = E.groupAt(g, 0, 0).map((p) => p.join(',')).sort();
  eq(grp, ['0,0', '0,1', '1,1']);
  eq(E.groupAt(g, 2, 0).length, 1, 'ô (2,0) chỉ chạm (1,1) theo đường chéo');
  eq(E.groupAt(g, 2, 1).map((p) => p.join(',')).sort(), ['0,2', '1,2', '2,1', '2,2']);
});

test('groupAt ô trống hoặc ngoài bàn trả về mảng rỗng', () => {
  const g = board(['11', '2']);
  eq([E.groupAt(g, 1, 1), E.groupAt(g, 5, 0), E.groupAt(g, -1, 0), E.groupAt(g, 0, 9)], [[], [], [], []]);
});

test('điểm nhóm: (n - 2)², nhóm 1 khối không có giá trị', () => {
  eq([E.points(1), E.points(2), E.points(3), E.points(5), E.points(12)], [0, 0, 1, 9, 100]);
});

test('groups liệt kê mọi nhóm từ 2 khối, mỗi khối một lần', () => {
  const g = board(['112', '212', '122']);
  const gs = E.groups(g).map((grp) => grp.length).sort();
  eq(gs, [3, 4]);
});

/* ---------------- Nổ, rơi, dồn cột ---------------- */

test('nổ nhóm: khối phía trên rơi xuống', () => {
  // cột 0: 2 2 1 3 (dưới lên) -> nổ 2 2 thì 1 3 rơi xuống đáy
  let g = board(['2213', '3']);
  g = E.pop(g, 0, 1);
  eq(colors(g), ['13', '3']);
  eq([g.score, g.pops], [0, 1]);
});

test('nổ nhóm: cột trống dồn sang trái', () => {
  let g = board(['3', '11', '2', '4']);
  g = E.pop(g, 1, 0);
  eq(colors(g), ['3', '2', '4']);
});

test('mã khối giữ nguyên khi rơi (để giao diện làm hiệu ứng)', () => {
  const g0 = board(['2213', '3']);
  const id = g0.cols[0][2].id;
  const g = E.pop(g0, 0, 0);
  eq(g.cols[0][0].id, id);
});

test('điểm cộng (n - 2)² cho nhóm n khối', () => {
  // nhóm 5 khối màu 1 hình chữ L
  const g = E.pop(board(['1112', '11', '2', '3']), 0, 0);
  eq([g.score, colors(g)], [9, ['2', '2', '3']]);
});

test('chạm khối lẻ, ô trống hoặc ngoài bàn không làm gì (trả lại chính ván cũ)', () => {
  const g = board(['12', '21']);
  eq(E.pop(g, 0, 0) === g, true);
  eq(E.pop(g, 3, 0) === g, true);
  eq(E.pop(g, 0, 3) === g, true);
});

test('không sửa ván cũ (hàm thuần)', () => {
  const g = board(['2213', '3']);
  const before = JSON.stringify(E.toJSON(g));
  E.pop(g, 0, 0);
  eq(JSON.stringify(E.toJSON(g)), before);
});

test('dọn sạch bàn: thưởng 1000 điểm, hết ván, isCleared đúng', () => {
  let g = board(['11', '1'], { score: 7, pops: 2 });
  g = E.pop(g, 0, 0);
  eq([g.score, E.blocksLeft(g), E.isOver(g), E.isCleared(g)], [7 + 1 + E.CLEAR_BONUS, 0, true, true]);
  eq(E.CLEAR_BONUS, 1000);
});

test('hết nhóm 2 khối là hết ván, khối còn lại không bị trừ điểm', () => {
  let g = board(['112', '3'], { score: 4 });
  ok(!E.isOver(g));
  g = E.pop(g, 0, 0);
  eq([colors(g), g.score, E.hasMoves(g), E.isOver(g), E.isCleared(g)], [['2', '3'], 4, false, true, false]);
});

test('nổ sau khi hết ván không làm gì', () => {
  const g = board(['12', '21']);
  ok(E.isOver(g));
  eq(E.pop(g, 0, 0) === g, true);
});

/* ---------------- Chơi hết ván ---------------- */

/** Bot tham lam: luôn nổ nhóm lớn nhất. Trả về ván cuối và tổng điểm tự cộng để đối chiếu. */
function greedy(g) {
  let expect = 0;
  let guard = 0;
  while (!E.isOver(g)) {
    const gs = E.groups(g);
    ok(gs.length > 0, 'chưa hết ván mà không có nhóm');
    gs.sort((a, b) => b.length - a.length);
    const [x, y] = gs[0][0];
    const before = E.blocksLeft(g);
    g = E.pop(g, x, y);
    eq(before - E.blocksLeft(g), gs[0].length, 'số khối mất đi');
    expect += E.points(gs[0].length);
    if (++guard > 200) throw new Error('ván không kết thúc');
  }
  if (E.isCleared(g)) expect += E.CLEAR_BONUS;
  return { g, expect };
}

test('bot tham lam chơi hết ván trên 300 seed: luôn kết thúc, điểm khớp công thức', () => {
  let cleared = 0;
  for (let s = 1; s <= 300; s++) {
    const { g, expect } = greedy(E.newGame(s));
    eq(g.score, expect, 'seed ' + s);
    ok(g.pops > 0);
    if (E.isCleared(g)) cleared++;
  }
  ok(cleared < 300, 'không phải ván nào cũng dọn sạch được');
});

test('bàn nhỏ dọn sạch được: ván dựng sẵn thắng sau đúng các nước', () => {
  let g = board(['1221', '1221']);
  g = E.pop(g, 0, 1); // nổ 4 khối màu 2 ở giữa, hai cột còn 11 / 11
  eq(colors(g), ['11', '11']);
  g = E.pop(g, 0, 0);
  eq([E.isCleared(g), g.score], [true, 4 + 4 + E.CLEAR_BONUS]);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả sau vài nước)', () => {
  let g = E.newGame(99);
  for (let i = 0; i < 5 && !E.isOver(g); i++) {
    const [x, y] = E.groups(g)[0][0];
    g = E.pop(g, x, y);
  }
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.toJSON(back), E.toJSON(g));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame(3));
  const mut = (fn) => {
    const r = JSON.parse(JSON.stringify(good));
    fn(r);
    return r;
  };
  const bad = [
    null, 1, 'x', [], {},
    mut((r) => { r.v = 2; }),
    mut((r) => { r.w = 0; }),
    mut((r) => { r.h = '12'; }),
    mut((r) => { r.k = 1; }),
    mut((r) => { r.k = 9; }),
    mut((r) => { r.score = -1; }),
    mut((r) => { r.score = 1.5; }),
    mut((r) => { r.pops = null; }),
    mut((r) => { r.cols = 'abc'; }),
    mut((r) => { r.cols.push([[999, 1]]); }), // nhiều cột hơn bề ngang
    mut((r) => { r.cols[0].push([998, 1]); }), // cột cao hơn bề cao
    mut((r) => { r.cols[1] = []; }), // cột rỗng phải được dồn đi
    mut((r) => { r.cols[0][0] = [r.cols[0][1][0], 1]; }), // trùng mã khối
    mut((r) => { r.cols[0][0] = [0, 5]; }), // màu ngoài 1..k
    mut((r) => { r.cols[0][0] = [0, 0]; }),
    mut((r) => { r.cols[0][0] = [-1, 1]; }),
    mut((r) => { r.cols[0][0] = [0]; }),
    mut((r) => { r.cols[0][0] = { id: 0, c: 1 }; }),
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw).slice(0, 80)));
});

test('ván đã dọn sạch vẫn khôi phục được (0 cột)', () => {
  const g = E.pop(board(['11']), 0, 0);
  eq(E.fromJSON(E.toJSON(g)), g);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
