/* Kiểm tra engine Xếp Gạch: chạy `node test.js`
 * - Túi 7: mỗi túi 7 khối có đủ I O T S Z J L, mỗi khối đúng một lần
 * - Va chạm với tường, đáy, ô đã có
 * - Xoay SRS và đá tường: khối I sát tường trái / phải, xoay kiểu T-spin vào khe
 * - Xóa 1..4 hàng, hàng phía trên dồn xuống (kể cả khi các hàng xóa không liền nhau)
 * - Điểm theo cấp, combo, xếp 4 hàng liên tiếp, lên cấp mỗi 10 hàng
 * - Thả thẳng: quãng rơi và điểm; thả nhanh +1 mỗi hàng
 * - Giữ khối: mỗi lượt rơi chỉ một lần, đổi chỗ với khối đang giữ
 * - Trễ khóa 500ms, đặt lại khi di chuyển, tối đa 15 lần
 * - Thua: chỗ xuất phát bị chiếm (block out), khóa hoàn toàn trong vùng ẩn (lock out)
 * - Lưu / khôi phục qua JSON, chơi tiếp ra đúng kết quả; dữ liệu hỏng bị từ chối
 * - Chơi ngẫu nhiên nhiều ván: bàn luôn hợp lệ
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

const W = E.COLS;
const H = E.TOTAL_ROWS;
const BOTTOM = H - 1;
const at = (x, y) => y * W + x;

/** Ván mới với bàn trống và khối hiện tại đặt sẵn. */
function gameWith(cur, opts) {
  const s = E.newGame(Object.assign({ seed: 42 }, opts));
  s.board.fill(0);
  if (cur) {
    s.cur = Object.assign({ r: 0 }, cur);
    s.lowestY = s.cur.y;
  }
  return s;
}

/** Lấp kín hàng y, chừa các cột trong `holes`. */
function fillRow(s, y, holes, id) {
  for (let x = 0; x < W; x++) s.board[at(x, y)] = holes && holes.includes(x) ? 0 : id || 7;
}

const sortCells = (cells) => cells.map((c) => c.join(',')).sort();

/* =====================================================================
 * Túi 7
 * ===================================================================== */
console.log('Túi 7 khối');
test('mỗi nhóm 7 khối liên tiếp có đủ 7 loại (20 seed x 140 khối)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = E.newGame({ seed });
    const seq = [s.cur.t];
    while (seq.length < 140) seq.push(E.takeNext(s));
    for (let i = 0; i < seq.length; i += 7) {
      const bag = seq.slice(i, i + 7).sort();
      eq(bag, E.PIECES.slice().sort(), 'seed ' + seed + ', túi ' + i / 7);
    }
  }
});
test('thứ tự trong túi thay đổi theo seed', () => {
  const first = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const s = E.newGame({ seed });
    first.add([s.cur.t].concat(s.queue.slice(0, 6)).join(''));
  }
  assert(first.size > 20, 'chỉ có ' + first.size + ' thứ tự khác nhau');
});
test('hàng chờ luôn đủ khối để xem trước 3 khối', () => {
  const s = E.newGame({ seed: 7 });
  for (let i = 0; i < 50; i++) {
    assert(s.queue.length >= E.NEXT_COUNT, 'hàng chờ chỉ còn ' + s.queue.length);
    E.hardDrop(s);
    if (s.over) break;
  }
});
test('cùng seed thì cùng thứ tự khối', () => {
  const a = E.newGame({ seed: 99 });
  const b = E.newGame({ seed: 99 });
  eq([a.cur.t].concat(a.queue), [b.cur.t].concat(b.queue));
});

/* =====================================================================
 * Sinh khối, va chạm, di chuyển
 * ===================================================================== */
console.log('Sinh khối và va chạm');
test('khối xuất phát ở giữa, hạ 1 hàng để lộ ra hàng trên cùng', () => {
  for (const t of E.PIECES) {
    const s = gameWith(null);
    E.spawn(s, t);
    eq([s.cur.x, s.cur.y, s.cur.r], [t === 'O' ? 4 : 3, 1, 0], 'khối ' + t);
    const ys = E.pieceCells(s.cur).map((c) => c[1]);
    assert(Math.max(...ys) === E.HIDDEN, 'đáy khối ' + t + ' phải ở hàng nhìn thấy đầu tiên');
  }
});
test('va chạm với tường trái, phải, đáy và ô đã có', () => {
  const b = new Array(W * H).fill(0);
  assert(!E.collides(b, 'T', 0, 0, 5), 'T sát tường trái vẫn hợp lệ');
  assert(E.collides(b, 'T', 0, -1, 5), 'T lấn tường trái');
  assert(!E.collides(b, 'T', 0, 7, 5), 'T sát tường phải vẫn hợp lệ');
  assert(E.collides(b, 'T', 0, 8, 5), 'T lấn tường phải');
  assert(!E.collides(b, 'T', 0, 3, BOTTOM - 1), 'T sát đáy vẫn hợp lệ');
  assert(E.collides(b, 'T', 0, 3, BOTTOM), 'T lọt qua đáy');
  assert(E.collides(b, 'I', 0, 3, -2), 'I vượt lên trên vùng ẩn');
  b[at(4, 10)] = 3;
  assert(E.collides(b, 'O', 0, 3, 9), 'O đè lên ô đã có');
  assert(!E.collides(b, 'O', 0, 5, 9), 'O cạnh ô đã có vẫn hợp lệ');
});
test('di chuyển bị chặn bởi tường và ô đã có', () => {
  const s = gameWith({ t: 'O', x: 0, y: 10 });
  assert(!E.move(s, -1), 'đi xuyên tường trái');
  eq(s.cur.x, 0);
  s.board[at(2, 11)] = 1;
  assert(!E.move(s, 1), 'đi xuyên ô đã có');
  s.board[at(2, 11)] = 0;
  assert(E.move(s, 1), 'không đi được dù trống');
  eq(s.cur.x, 1);
  s.cur.x = 8;
  assert(!E.move(s, 1), 'đi xuyên tường phải');
});

/* =====================================================================
 * Xoay SRS
 * ===================================================================== */
console.log('Xoay SRS và đá tường');
test('T xoay phải 4 lần quay về hình gốc, các hướng đúng SRS', () => {
  const s = gameWith({ t: 'T', x: 4, y: 8 });
  const cells0 = sortCells(E.pieceCells(s.cur));
  eq(E.rotate(s, 1), 0);
  eq(sortCells(E.pieceCells(s.cur)), sortCells([[5, 8], [5, 9], [6, 9], [5, 10]]), 'hướng R');
  E.rotate(s, 1);
  eq(sortCells(E.pieceCells(s.cur)), sortCells([[4, 9], [5, 9], [6, 9], [5, 10]]), 'hướng 2');
  E.rotate(s, 1);
  eq(sortCells(E.pieceCells(s.cur)), sortCells([[5, 8], [4, 9], [5, 9], [5, 10]]), 'hướng L');
  E.rotate(s, 1);
  eq(sortCells(E.pieceCells(s.cur)), cells0, 'quay về hướng 0');
});
test('xoay trái là nghịch đảo của xoay phải', () => {
  for (const t of E.PIECES) {
    const s = gameWith({ t, x: 3, y: 8 });
    const before = JSON.stringify(s.cur);
    E.rotate(s, 1);
    E.rotate(s, -1);
    eq(JSON.stringify(s.cur), before, 'khối ' + t);
  }
});
test('O xoay không đổi ô', () => {
  const s = gameWith({ t: 'O', x: 4, y: 8 });
  const c = sortCells(E.pieceCells(s.cur));
  eq(E.rotate(s, 1), 0);
  eq(sortCells(E.pieceCells(s.cur)), c);
});
test('I dọc sát tường trái xoay ngang: đá sang phải 1 ô (độ đá thứ 2 của bảng I)', () => {
  // Hướng L (r=3) chiếm cột 1 của khung 4x4; x = -1 nghĩa là sát tường trái
  const s = gameWith({ t: 'I', r: 3, x: -1, y: 10 });
  eq(E.pieceCells(s.cur).map((c) => c[0]), [0, 0, 0, 0], 'I phải nằm ở cột 0');
  const k = E.rotate(s, 1); // L -> 0: (0,0) (+1,0) (-2,0) ...
  eq(k, 1, 'độ đá');
  eq([s.cur.r, s.cur.x, s.cur.y], [0, 0, 10]);
  eq(E.pieceCells(s.cur).map((c) => c[0]).sort(), [0, 1, 2, 3]);
});
test('I dọc sát tường phải xoay ngang: đá sang trái 1 ô (độ đá thứ 3 của bảng I)', () => {
  // Hướng R (r=1) chiếm cột 2 của khung; x = 7 nghĩa là sát tường phải
  const s = gameWith({ t: 'I', r: 1, x: 7, y: 10 });
  eq(E.pieceCells(s.cur).map((c) => c[0]), [9, 9, 9, 9]);
  const k = E.rotate(s, -1); // R -> 0: (0,0) (+2,0) (-1,0) ...
  eq(k, 2, 'độ đá');
  eq([s.cur.r, s.cur.x], [0, 6]);
  eq(E.pieceCells(s.cur).map((c) => c[0]).sort(), [6, 7, 8, 9]);
});
test('I xoay khác bảng với J L S T Z (cùng vị trí, khác kết quả)', () => {
  eq(E.KICKS_I['0>1'][1], [-2, 0]);
  eq(E.KICKS_JLSTZ['0>1'][1], [-1, 0]);
  // y đã đổi sang trục hướng xuống: (-1,+1) lên trên thành (-1,-1)
  eq(E.KICKS_JLSTZ['0>1'][2], [-1, -1]);
});
test('T xoay vào khe kiểu T-spin bằng độ đá cuối (-1, xuống 2), rồi xóa 3 hàng', () => {
  // T đứng trên khe, quanh khe kín hết; chỉ độ đá thứ 5 vừa
  const s = gameWith({ t: 'T', r: 0, x: 3, y: 16 });
  const curCells = E.pieceCells(s.cur).map((c) => c.join(','));
  const target = [[3, 18], [3, 19], [4, 19], [3, 20]].map((c) => c.join(','));
  for (let y = 16; y <= BOTTOM; y++) {
    for (let x = 0; x < W; x++) {
      const key = x + ',' + y;
      if (!curCells.includes(key) && !target.includes(key)) s.board[at(x, y)] = 6;
    }
  }
  s.board[at(0, BOTTOM)] = 0; // hàng đáy chưa kín
  const k = E.rotate(s, 1);
  eq(k, 4, 'độ đá');
  eq([s.cur.r, s.cur.x, s.cur.y], [1, 2, 18]);
  eq(sortCells(E.pieceCells(s.cur)), target.slice().sort());
  const res = E.hardDrop(s);
  eq(res.drop, 0, 'không còn chỗ rơi');
  eq(res.lines, 3);
  eq(res.rows, [18, 19, 20]);
});
test('bị kẹt hoàn toàn thì không xoay, khối giữ nguyên', () => {
  const s = gameWith({ t: 'T', x: 3, y: 16 });
  const cur = E.pieceCells(s.cur).map((c) => c.join(','));
  for (let y = 14; y <= BOTTOM; y++)
    for (let x = 0; x < W; x++) if (!cur.includes(x + ',' + y)) s.board[at(x, y)] = 2;
  const before = JSON.stringify(s.cur);
  eq(E.rotate(s, 1), -1);
  eq(E.rotate(s, -1), -1);
  eq(JSON.stringify(s.cur), before);
});

/* =====================================================================
 * Xóa hàng
 * ===================================================================== */
console.log('Xóa hàng');
for (let n = 1; n <= 4; n++) {
  test('xóa ' + n + ' hàng bằng I dọc, các ô phía trên dồn xuống ' + n + ' hàng', () => {
    const s = gameWith({ t: 'I', r: 3, x: -1, y: 5 }); // I dọc ở cột 0
    for (let y = BOTTOM - n + 1; y <= BOTTOM; y++) fillRow(s, y, [0], 4);
    s.board[at(5, BOTTOM - n)] = 2; // ô đánh dấu ngay trên các hàng sẽ xóa
    s.board[at(7, BOTTOM - n - 1)] = 3;
    const res = E.hardDrop(s);
    eq(res.lines, n, 'số hàng');
    eq(res.rows.length, n);
    eq(s.board[at(5, BOTTOM)], 2, 'ô đánh dấu dồn xuống đáy');
    eq(s.board[at(7, BOTTOM - 1)], 3, 'ô phía trên nữa cũng dồn xuống');
    // Phần còn lại của I (4 - n ô) nằm ở cột 0 ngay trên đáy
    let col0 = 0;
    for (let y = 0; y < H; y++) if (s.board[at(0, y)]) col0++;
    eq(col0, 4 - n, 'ô còn lại của I');
    for (let y = BOTTOM - (4 - n) + 1; y <= BOTTOM; y++) assert(s.board[at(0, y)] === E.PIECE_ID.I, 'I ở hàng ' + y);
    eq(res.boardBefore[at(1, BOTTOM)], 4, 'boardBefore giữ bàn trước khi xóa');
  });
}
test('xóa hai hàng không liền nhau: hàng ở giữa dồn đúng chỗ', () => {
  const s = gameWith({ t: 'I', r: 3, x: -1, y: 5 });
  fillRow(s, BOTTOM, [0], 4);
  fillRow(s, BOTTOM - 1, [0, 5], 4); // hàng này còn lỗ ở cột 5 nên không xóa
  fillRow(s, BOTTOM - 2, [0], 4);
  fillRow(s, BOTTOM - 3, [0, 1, 2], 4);
  const res = E.hardDrop(s);
  eq(res.rows, [BOTTOM - 2, BOTTOM]);
  // Hàng có lỗ cột 5 giờ ở đáy, hàng có lỗ cột 1,2 ở ngay trên
  eq(s.board[at(5, BOTTOM)], 0);
  eq(s.board[at(4, BOTTOM)], 4);
  eq(s.board[at(1, BOTTOM - 1)], 0);
  eq(s.board[at(3, BOTTOM - 1)], 4);
  eq(s.board[at(0, BOTTOM)], E.PIECE_ID.I);
});
test('fullRows và removeRows trên bàn rỗng không đổi gì', () => {
  const b = new Array(W * H).fill(0);
  eq(E.fullRows(b), []);
  E.removeRows(b, []);
  assert(b.every((v) => v === 0), 'bàn phải còn trống');
});

/* =====================================================================
 * Điểm
 * ===================================================================== */
console.log('Điểm và cấp');
test('điểm cơ bản 100/300/500/800 x cấp', () => {
  for (const lv of [1, 5, 10]) {
    eq([1, 2, 3, 4].map((n) => E.lineScore(n, lv)), [100, 300, 500, 800].map((v) => v * lv), 'cấp ' + lv);
  }
  eq(E.lineScore(0, 7), 0);
});
function clearWithI(s, n) {
  // Đặt I dọc ở cột 0 và chuẩn bị n hàng chờ xóa ở đáy
  s.board.fill(0);
  s.cur = { t: 'I', r: 3, x: -1, y: 2 };
  s.lowestY = 2;
  s.canHold = true;
  for (let y = BOTTOM - n + 1; y <= BOTTOM; y++) fillRow(s, y, [0], 5);
  return E.hardDrop(s);
}
for (const lv of [1, 5, 10]) {
  test('ván bắt đầu cấp ' + lv + ': xóa 1..4 hàng được đúng điểm, cộng điểm thả thẳng', () => {
    for (let n = 1; n <= 4; n++) {
      const s = E.newGame({ seed: 3, startLevel: lv });
      const before = s.score;
      const res = clearWithI(s, n);
      eq(res.points, [100, 300, 500, 800][n - 1] * lv, n + ' hàng');
      eq(s.score - before, res.points + res.drop * 2, 'tổng điểm');
    }
  });
}
test('combo: xóa liên tiếp được thêm 50 x combo x cấp; khối không xóa hàng thì mất chuỗi', () => {
  const s = E.newGame({ seed: 5, startLevel: 5 });
  let r = clearWithI(s, 1);
  eq([r.points, r.combo], [500, 0]);
  r = clearWithI(s, 1);
  eq([r.points, r.combo], [500 + 50 * 1 * 5, 1]);
  r = clearWithI(s, 2);
  eq([r.points, r.combo], [1500 + 50 * 2 * 5, 2]);
  r = clearWithI(s, 0);
  eq([r.points, r.combo, s.combo], [0, 0, -1]);
});
test('xếp 4 hàng liên tiếp được x1.5; xóa 1..3 hàng làm mất chuỗi', () => {
  const s = E.newGame({ seed: 5 });
  let r = clearWithI(s, 4);
  eq([r.points, r.b2b], [800, false]);
  s.combo = -1; // bỏ combo để chỉ kiểm tra thưởng liên tiếp
  r = clearWithI(s, 4);
  eq([r.points, r.b2b], [1200, true]);
  s.combo = -1;
  r = clearWithI(s, 1);
  eq([r.points, r.b2b, s.b2b], [100, false, false]);
  s.combo = -1;
  r = clearWithI(s, 4);
  eq([r.points, r.b2b], [800, false]);
  eq(s.quads, 3);
});
test('lên cấp mỗi 10 hàng, tính từ cấp bắt đầu', () => {
  let s = E.newGame({ seed: 1 });
  s.lines = 9;
  let r = clearWithI(s, 1);
  eq([s.lines, s.level, r.levelUp], [10, 2, true]);
  r = clearWithI(s, 4);
  eq([s.lines, s.level, r.levelUp], [14, 2, false]);
  s = E.newGame({ seed: 1, startLevel: 10 });
  s.lines = 8;
  clearWithI(s, 4);
  eq([s.lines, s.level], [12, 11]);
});
test('trọng lực nhanh dần theo cấp, chặn ở 1 khung hình', () => {
  eq(Math.round(E.gravityMs(1)), 1000);
  let prev = Infinity;
  for (let lv = 1; lv <= 20; lv++) {
    const g = E.gravityMs(lv);
    assert(g <= prev, 'cấp ' + lv + ' chậm hơn cấp trước');
    assert(g >= 1000 / 60 - 1e-9, 'cấp ' + lv + ' nhanh hơn 1 khung hình');
    prev = g;
  }
  assert(E.gravityMs(5) < 400 && E.gravityMs(5) > 300, 'cấp 5 khoảng 355ms');
  eq(E.gravityMs(40), E.gravityMs(20));
});

/* =====================================================================
 * Thả nhanh / thả thẳng
 * ===================================================================== */
console.log('Thả nhanh và thả thẳng');
test('thả thẳng trên bàn trống: rơi 19 hàng, +38 điểm, nằm sát đáy', () => {
  const s = gameWith(null);
  E.spawn(s, 'T');
  const res = E.hardDrop(s);
  eq(res.drop, 19);
  eq(s.score, 38);
  eq(Math.max(...res.cells.map((c) => c[1])), BOTTOM);
  eq(res.lines, 0);
});
test('thả thẳng dừng trên ô đã có; quãng rơi bằng hiệu với bóng khối', () => {
  const s = gameWith(null);
  E.spawn(s, 'O'); // cột 4, 5
  s.board[at(5, 15)] = 1;
  const gy = E.ghostY(s);
  const from = s.cur.y;
  const res = E.hardDrop(s);
  eq(res.drop, gy - from);
  eq(sortCells(res.cells), sortCells([[4, 13], [5, 13], [4, 14], [5, 14]]));
  eq(s.score, res.drop * 2);
});
test('thả nhanh +1 điểm mỗi hàng, không xuyên đáy', () => {
  const s = gameWith({ t: 'O', x: 4, y: BOTTOM - 3 });
  assert(E.softDrop(s), 'hạ 1 hàng');
  assert(E.softDrop(s), 'hạ thêm 1 hàng');
  assert(!E.softDrop(s), 'đã chạm đáy');
  eq(s.score, 2);
});
test('giữ thả nhanh khi cập nhật: rơi nhanh hơn và cộng điểm từng hàng', () => {
  const s = gameWith({ t: 'T', x: 3, y: 2 });
  E.update(s, E.SOFT_MS * 5, true);
  eq(s.cur.y, 7);
  eq(s.score, 5);
  E.update(s, 500, false); // trọng lực thường cấp 1: chưa đủ 1 giây
  eq(s.cur.y, 7);
});

/* =====================================================================
 * Giữ khối
 * ===================================================================== */
console.log('Giữ khối');
test('giữ lần đầu: cất khối hiện tại, lấy khối kế tiếp; lần hai trong cùng lượt bị từ chối', () => {
  const s = E.newGame({ seed: 11 });
  const first = s.cur.t;
  const next = s.queue[0];
  assert(E.hold(s), 'không giữ được');
  eq([s.hold, s.cur.t, s.canHold], [first, next, false]);
  assert(!E.hold(s), 'giữ được 2 lần trong một lượt');
  eq([s.hold, s.cur.t], [first, next]);
});
test('sau khi khóa được giữ lại; đổi chỗ với khối đang giữ, khối ra ở vị trí xuất phát', () => {
  const s = E.newGame({ seed: 11 });
  const first = s.cur.t;
  E.hold(s);
  E.hardDrop(s);
  assert(s.canHold, 'phải giữ lại được sau khi khóa');
  const cur = s.cur.t;
  E.rotate(s, 1);
  E.move(s, -1);
  assert(E.hold(s), 'không đổi được');
  eq([s.hold, s.cur.t], [cur, first]);
  eq([s.cur.r, s.cur.x], [0, first === 'O' ? 4 : 3]);
});

/* =====================================================================
 * Trễ khóa
 * ===================================================================== */
console.log('Trễ khóa');
test('chạm đáy 499ms chưa khóa, đủ 500ms thì khóa', () => {
  const s = gameWith({ t: 'O', x: 4, y: BOTTOM - 1 });
  eq(E.update(s, 499, false), null);
  const res = E.update(s, 1, false);
  assert(res && res.lines === 0, 'phải khóa');
  eq(s.pieces, 1);
});
test('di chuyển / xoay khi chạm đáy đặt lại trễ khóa, tối đa 15 lần', () => {
  const s = gameWith({ t: 'T', x: 3, y: BOTTOM - 1 });
  for (let i = 0; i < E.MAX_RESETS; i++) {
    eq(E.update(s, 400, false), null, 'lần ' + i);
    assert(E.move(s, i % 2 ? 1 : -1), 'không di chuyển được');
  }
  eq(s.lockResets, E.MAX_RESETS);
  eq(E.update(s, 400, false), null);
  E.move(s, 1); // hết lượt đặt lại: không đặt lại nữa
  const res = E.update(s, 100, false);
  assert(res, 'phải khóa sau khi hết lượt đặt lại');
});
test('rơi xuống độ cao mới thì được đặt lại bộ đếm', () => {
  const s = gameWith({ t: 'T', x: 0, y: 10 });
  s.board[at(0, 12)] = 1; // gờ dưới cạnh trái
  assert(E.grounded(s), 'phải đang chạm gờ');
  E.update(s, 300, false);
  E.move(s, 1);
  E.move(s, 1); // rời gờ
  assert(!E.grounded(s), 'đã rời gờ');
  E.update(s, 1000, false); // rơi 1 hàng
  eq(s.cur.y, 11);
  eq(s.lockResets, 0);
});

/* =====================================================================
 * Thua
 * ===================================================================== */
console.log('Kết thúc ván');
test('block out: khối mới không có chỗ xuất phát thì thua', () => {
  const s = E.newGame({ seed: 2 });
  s.board.fill(0);
  E.spawn(s, 'T');
  [[3, 1], [5, 1], [6, 1]].forEach(([x, y]) => (s.board[at(x, y)] = 7));
  // T xuất phát ở hàng 1-2, không đè lên các ô trên
  E.move(s, 0);
  const res = E.hardDrop(s);
  assert(res.over && s.over, 'phải thua');
  assert(!E.move(s, -1) && E.rotate(s, 1) === -1 && !E.hold(s), 'thao tác sau khi thua phải bị chặn');
  eq(E.update(s, 1000, false), null);
  eq(E.hardDrop(s), null);
});
test('lock out: khóa hoàn toàn trong vùng ẩn thì thua', () => {
  const s = gameWith(null);
  for (let y = E.HIDDEN; y <= BOTTOM; y++) fillRow(s, y, [9], 4);
  E.spawn(s, 'T');
  eq(s.cur.y, 0, 'không hạ được');
  const res = E.hardDrop(s);
  eq(res.drop, 0);
  assert(res.over && s.over, 'phải thua');
  eq(s.cur, null);
});
test('khóa một phần trên vùng ẩn nhưng có ô nhìn thấy thì chưa thua', () => {
  const s = gameWith(null);
  for (let y = E.HIDDEN + 1; y <= BOTTOM; y++) fillRow(s, y, [9], 4);
  E.spawn(s, 'I');
  E.move(s, -3);
  const res = E.hardDrop(s);
  assert(!res.over && !s.over, 'chưa được thua');
});

/* =====================================================================
 * Lưu / khôi phục
 * ===================================================================== */
console.log('Lưu và khôi phục');
function playSome(s, steps, seedActs) {
  let a = seedActs;
  for (let i = 0; i < steps && !s.over; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const k = a % 9;
    if (k === 0) E.move(s, -1);
    else if (k === 1) E.move(s, 1);
    else if (k === 2) E.rotate(s, 1);
    else if (k === 3) E.rotate(s, -1);
    else if (k === 4) E.hold(s);
    else if (k === 5) E.softDrop(s);
    else if (k === 6) E.hardDrop(s);
    else E.update(s, 120, k === 7);
  }
  return a;
}
test('JSON hóa rồi khôi phục được state y hệt', () => {
  const s = E.newGame({ seed: 1234, startLevel: 5 });
  playSome(s, 60, 9);
  assert(!s.over, 'ván thử đã thua sớm');
  const r = E.restore(JSON.parse(JSON.stringify(s)));
  assert(r, 'khôi phục thất bại');
  eq(r, s);
});
test('ván khôi phục chơi tiếp ra đúng như ván gốc (cùng thứ tự khối)', () => {
  const s = E.newGame({ seed: 77 });
  playSome(s, 50, 3);
  assert(!s.over, 'ván thử đã thua sớm');
  const r = E.restore(JSON.parse(JSON.stringify(s)));
  playSome(s, 400, 5);
  playSome(r, 400, 5);
  eq(r, s);
});
test('dữ liệu hỏng bị từ chối', () => {
  const s = E.newGame({ seed: 8 });
  const ok = () => JSON.parse(JSON.stringify(s));
  eq(E.restore(null), null);
  eq(E.restore({}), null);
  let o = ok();
  o.board = o.board.slice(1);
  eq(E.restore(o), null, 'bàn sai kích thước');
  o = ok();
  o.board[5] = 9;
  eq(E.restore(o), null, 'mã ô lạ');
  o = ok();
  o.cur.t = 'X';
  eq(E.restore(o), null, 'khối lạ');
  o = ok();
  E.pieceCells(o.cur).forEach(([x, y]) => (o.board[at(x, y)] = 1));
  eq(E.restore(o), null, 'khối hiện tại đè lên ô đã có');
  o = ok();
  o.queue = ['I'];
  eq(E.restore(o), null, 'hàng chờ quá ngắn');
  o = ok();
  o.hold = 'Q';
  eq(E.restore(o), null, 'khối giữ lạ');
  o = ok();
  o.score = -5;
  eq(E.restore(o), null, 'điểm âm');
  o = ok();
  o.over = true;
  eq(E.restore(o), null, 'ván đã kết thúc');
  o = ok();
  o.startLevel = 3;
  eq(E.restore(o), null, 'cấp bắt đầu không hợp lệ');
});

/* =====================================================================
 * Chơi ngẫu nhiên
 * ===================================================================== */
console.log('Chơi ngẫu nhiên');
test('200 ván ngẫu nhiên: không đè ô, không vượt bàn, điểm và cấp hợp lệ', () => {
  for (let g = 1; g <= 200; g++) {
    const s = E.newGame({ seed: g * 31, startLevel: E.START_LEVELS[g % 3] });
    let a = g;
    let lastScore = 0;
    for (let step = 0; step < 3000 && !s.over; step++) {
      a = playSome(s, 1, a);
      assert(s.score >= lastScore, 'điểm giảm');
      lastScore = s.score;
      if (s.cur && !s.over) {
        assert(!E.collides(s.board, s.cur.t, s.cur.r, s.cur.x, s.cur.y), 'khối đè lên bàn (ván ' + g + ')');
      }
      assert(s.board.length === W * H && s.board.every((v) => v >= 0 && v <= 7), 'bàn hỏng');
      eq(s.level, Math.min(99, s.startLevel + Math.floor(s.lines / 10)), 'cấp');
      assert(E.fullRows(s.board).length === 0, 'còn hàng kín chưa xóa');
    }
  }
});

console.log('\n' + passed + ' đạt, ' + failed + ' lỗi');
if (failed) process.exit(1);
