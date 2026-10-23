/* Kiểm tra engine Rót Nước: chạy `node test.js`
 * - Luật rót: rót cả khối cùng màu trên cùng, chỉ khi ống đích trống hoặc cùng màu trên cùng và còn chỗ
 * - Thắng (mọi ống trống hoặc đủ 4 lớp một màu), hết nước đi, Hoàn tác (3 lần), +1 ống (1 lần, tính là có trợ giúp)
 * - Sinh màn: đúng số màu / số ống, chưa xong sẵn, giải được (chạy solver rồi phát lại lời giải bằng luật thật)
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

/** Ván dựng tay (đáy ống trước); cấp độ suy từ số màu, chưa dùng trợ giúp. */
function make(tubes) {
  const colours = new Set();
  tubes.forEach((t) => t.forEach((c) => colours.add(c)));
  const g = E.fromJSON({
    v: 1,
    level: E.levelForColours(colours.size),
    seed: 1,
    start: tubes,
    tubes,
    moves: 0,
    history: [],
    undoLeft: 3,
    extraLeft: 1,
    assisted: false,
  });
  if (!g) throw new Error('ván dựng tay không hợp lệ: ' + JSON.stringify(tubes));
  return g;
}

/** Đếm số lớp mỗi màu trên toàn bàn. */
function counts(tubes) {
  const m = {};
  tubes.forEach((t) => t.forEach((c) => { m[c] = (m[c] || 0) + 1; }));
  return m;
}

/** Rót lần lượt theo danh sách [từ, tới]; nước sai thì báo lỗi. */
function play(g, moves) {
  let s = g;
  moves.forEach(([a, b]) => {
    const n = E.pour(s, a, b);
    if (!n) throw new Error('nước ' + a + '->' + b + ' không hợp lệ');
    s = n;
  });
  return s;
}

// Ván kẹt 4 màu: ống 0-2 đầy (đỉnh màu 3), ống 3-5 có đỉnh 0 / 1 / 2 riêng biệt: không ống nào nhận được
const STUCK = [[0, 1, 2, 3], [1, 2, 0, 3], [2, 0, 1, 3], [3, 0], [1], [2]];

/* ---------------- Cấp độ ---------------- */

test('số màu: cấp 1 có 3 màu, tăng dần, tối đa 12', () => {
  eq(E.colorsFor(1), 3);
  let prev = 0;
  for (let l = 1; l <= 60; l++) {
    const k = E.colorsFor(l);
    ok(k >= prev && k >= 3 && k <= 12, 'cấp ' + l + ' có ' + k + ' màu');
    prev = k;
  }
  eq(E.colorsFor(60), 12);
  eq(E.MAX_COLOURS, 12);
  eq(E.CAP, 4);
});

test('levelForColours trả về cấp có đúng số màu', () => {
  for (let k = 3; k <= 12; k++) eq(E.colorsFor(E.levelForColours(k)), k, k + ' màu');
});

/* ---------------- Luật rót ---------------- */

test('rót vào ống trống: cả khối cùng màu trên cùng chuyển sang, ván cũ không đổi', () => {
  const g = make([[0, 1, 1], [0, 0, 0, 2], [1, 1, 2, 2], [2], []]);
  eq(E.canPour(g, 0, 4), 2);
  const n = E.pour(g, 0, 4);
  eq([n.tubes[0], n.tubes[4]], [[0], [1, 1]]);
  eq(n.moves, 1);
  eq(n.history, [[0, 4, 2]]);
  eq(g.tubes[0], [0, 1, 1], 'ván cũ không đổi');
  eq(g.moves, 0);
});

test('rót vào ống cùng màu trên cùng', () => {
  const g = make([[0, 2, 2, 2], [1, 1, 1, 2], [0, 0, 0, 1], [], []]);
  const a = E.pour(g, 1, 3);
  eq(a.tubes[3], [2]);
  eq(E.canPour(a, 0, 3), 3);
  const b = E.pour(a, 0, 3);
  eq([b.tubes[0], b.tubes[3]], [[0], [2, 2, 2, 2]]);
});

test('đích chỉ còn ít chỗ: rót tới khi đầy, phần còn lại ở lại ống nguồn', () => {
  const g = make([[0, 1, 1, 1], [0, 0, 1], [2, 2, 2, 2], [0], []]);
  eq(E.canPour(g, 0, 1), 1);
  const n = E.pour(g, 0, 1);
  eq([n.tubes[0], n.tubes[1]], [[0, 1, 1], [0, 0, 1, 1]]);
  eq(n.history, [[0, 1, 1]]);
  eq(E.canPour(n, 0, 3), 0, 'khác màu');
  eq(E.canPour(n, 0, 4), 2, 'ống trống nhận cả khối');
});

test('không rót được: cùng ống, ống nguồn trống, khác màu, đích đầy, chỉ số sai', () => {
  const g = make([[0, 1], [0, 0, 0, 1], [1, 1, 2, 2], [2, 2], []]);
  eq(E.canPour(g, 0, 0), 0);
  eq(E.canPour(g, 4, 0), 0);
  eq(E.canPour(g, 2, 0), 0);
  eq(E.canPour(g, 0, 1), 0);
  eq(E.canPour(g, 0, 9), 0);
  eq(E.canPour(g, -1, 0), 0);
  eq(E.canPour(g, '0', 4), 0);
  eq(E.pour(g, 2, 0), null);
  eq(E.canPour(g, 2, 3), 2, 'cùng màu 2, còn 2 chỗ');
});

/* ---------------- Thắng / hết nước ---------------- */

test('thắng khi mọi ống trống hoặc đủ 4 lớp một màu', () => {
  ok(E.isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1], [2, 2, 2, 2], []]));
  ok(!E.isSolved([[0, 0, 0], [0], [1, 1, 1, 1], [2, 2, 2, 2], []]), 'hai nửa cùng màu chưa tính');
  ok(!E.isSolved([[0, 0, 0, 1], [1, 1, 1, 0], [2, 2, 2, 2], [], []]));
  const g = make([[0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2], [0], []]);
  ok(!E.isWon(g));
  const w = E.pour(g, 3, 0);
  ok(E.isWon(w));
  eq(E.pour(w, 0, 4), null, 'đã thắng thì không rót nữa');
  eq(E.undo(w), null, 'đã thắng thì không hoàn tác');
  ok(!E.isStuck(w), 'thắng không phải hết nước');
});

test('hết nước đi: không ống nào nhận được nước', () => {
  const g = make(STUCK);
  ok(!E.hasMoves(g));
  ok(E.isStuck(g));
  ok(!E.isWon(g));
});

test('còn nước: có ống trống hoặc đỉnh cùng màu còn chỗ', () => {
  ok(E.hasMoves(make([[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []])));
  ok(E.hasMoves(make([[0, 1, 0, 1], [1, 0, 1, 0], [2, 2], [2, 2], []])), 'gộp hai ống [2,2]');
});

test('dời ống một màu sang ống trống không tính là nước đi có ích', () => {
  // Bàn đã gần xong: ống [2,2] chỉ dời được sang ống trống (vô ích) hoặc gộp với [2,2] (có ích)
  const g = make([[0, 0, 0, 0], [1, 1, 1, 1], [2, 2], [2, 2], []]);
  ok(E.hasMoves(g));
  eq(E.usefulMoves(g).filter(([, b]) => b === 4), [], 'không gợi ý dời sang ống trống');
});

/* ---------------- Trợ giúp ---------------- */

test('hoàn tác: 3 lần mỗi màn, trả lại đúng trạng thái, không tính là trợ giúp', () => {
  const g = make([[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []]);
  eq(E.undo(g), null, 'chưa đi nước nào');
  const moves = [[0, 3], [1, 4], [1, 3], [0, 1], [0, 4]];
  let s = play(g, moves);
  s = E.undo(s);
  eq(s.undoLeft, 2);
  s = E.undo(E.undo(s));
  eq(s.undoLeft, 0);
  eq(s.tubes, play(g, moves.slice(0, 2)).tubes);
  eq(E.undo(s), null, 'hết lượt');
  ok(!s.assisted);
  eq(s.moves, 5, 'số nước không giảm');
});

test('hoàn tác nước rót một phần trả đúng số lớp', () => {
  const g = make([[0, 1, 1, 1], [0, 0, 1], [2, 2, 2, 2], [0], []]);
  const u = E.undo(E.pour(g, 0, 1));
  eq(u.tubes, g.tubes);
  eq(u.history, []);
});

test('+1 ống: một lần mỗi màn, thêm ống trống, đánh dấu có trợ giúp', () => {
  const g = make(STUCK);
  const a = E.addTube(g);
  eq(a.tubes.length, 7);
  eq(a.tubes[6], []);
  eq([a.extraLeft, a.assisted], [0, true]);
  eq(E.addTube(a), null);
  ok(!E.isStuck(a));
  ok(!g.assisted, 'ván cũ không đổi');
  // Hoàn tác vẫn chạy sau khi thêm ống
  const b = E.pour(a, 0, 6);
  eq(E.undo(b).tubes, a.tubes);
});

test('chơi lại màn: về bố cục ban đầu, trợ giúp đầy lại', () => {
  const g0 = E.newGame(2, 42);
  const mv = E.solve(g0.tubes);
  const g = E.addTube(E.pour(g0, mv[0][0], mv[0][1]));
  const r = E.restart(g);
  eq(r.tubes, g0.tubes);
  eq([r.moves, r.undoLeft, r.extraLeft, r.assisted, r.history], [0, 3, 1, false, []]);
  eq([r.level, r.seed], [2, g0.seed]);
});

/* ---------------- Sinh màn ---------------- */

test('màn sinh ra: đúng số màu, đủ 4 lớp mỗi màu, 2 ống trống, chưa xong sẵn', () => {
  for (let level = 1; level <= 22; level++) {
    const g = E.newGame(level, 1000 + level);
    const k = E.colorsFor(level);
    eq(g.tubes.length, k + 2, 'số ống cấp ' + level);
    eq(g.tubes.filter((t) => t.length === 0).length, 2, 'ống trống cấp ' + level);
    const m = counts(g.tubes);
    eq(Object.keys(m).length, k);
    Object.keys(m).forEach((c) => eq(m[c], 4, 'màu ' + c));
    ok(!E.isSolved(g.tubes), 'chưa xong sẵn');
    ok(!g.tubes.some((t) => t.length === 4 && t.every((c) => c === t[0])), 'không có ống xong sẵn');
    ok(E.hasMoves(g));
    eq([g.moves, g.undoLeft, g.extraLeft, g.assisted], [0, 3, 1, false]);
  }
});

test('màn sinh ra phụ thuộc seed và tái tạo được', () => {
  eq(E.newGame(5, 77).tubes, E.newGame(5, 77).tubes);
  ok(JSON.stringify(E.newGame(5, 77).tubes) !== JSON.stringify(E.newGame(5, 78).tubes));
});

test('mọi màn sinh ra đều giải được (solver + phát lại bằng luật thật, 24 cấp x 12 seed)', () => {
  let n = 0;
  const t0 = Date.now();
  for (let level = 1; level <= 24; level++) {
    for (let s = 0; s < 12; s++) {
      const g = E.newGame(level, s * 7919 + level);
      const sol = E.solve(g.tubes);
      ok(sol && sol.length > 0, 'cấp ' + level + ' seed ' + s + ' không giải được');
      ok(E.isWon(play(g, sol)), 'cấp ' + level + ' seed ' + s + ': lời giải không thắng');
      n++;
    }
  }
  console.log('       (' + n + ' màn, ' + (Date.now() - t0) + ' ms)');
});

test('sinh màn đủ nhanh cho trình duyệt (12 màu < 400 ms mỗi màn)', () => {
  for (let s = 0; s < 10; s++) {
    const t0 = Date.now();
    E.newGame(40, 900 + s);
    const ms = Date.now() - t0;
    ok(ms < 400, 'seed ' + s + ': ' + ms + ' ms');
  }
});

test('cách sinh dự phòng (rót ngược từ bàn đã xong) luôn cho màn giải được', () => {
  for (let k = 3; k <= 12; k++) {
    for (let s = 0; s < 8; s++) {
      const tubes = E._scramble(k, s);
      ok(!E.isSolved(tubes), k + ' màu seed ' + s + ' đã xong sẵn');
      ok(E.solve(tubes), k + ' màu seed ' + s + ' không giải được');
    }
  }
});

test('solver: ván đã xong trả mảng rỗng, ván không lối thoát trả null', () => {
  eq(E.solve([[0, 0, 0, 0], [1, 1, 1, 1], [], []]), []);
  eq(E.solve([[0, 1, 0, 1], [1, 0, 1, 0]]), null);
  eq(E.solve(STUCK), null);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (kể cả lịch sử hoàn tác và +1 ống)', () => {
  const g0 = E.newGame(4, 9);
  const sol = E.solve(g0.tubes);
  const g = E.addTube(play(g0, sol.slice(0, 2)));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.undo(back).tubes, E.undo(g).tubes);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.pour(make([[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []]), 0, 3));
  ok(E.fromJSON(good), 'bản gốc hợp lệ');
  const w = (patch) => Object.assign({}, good, patch);
  const bad = [
    null, 1, 'x', {},
    w({ v: 2 }),
    w({ level: 0 }),
    w({ level: 1.5 }),
    w({ seed: 'x' }),
    w({ tubes: [[0, 1, 2], [1, 2, 0, 1], [2, 0, 1, 2], [0], [0]] }), // thừa màu 0
    w({ tubes: [[0, 1, 2], [1, 2, 0, 1], [2, 0, 1, 2], [5], []] }), // màu lạ
    w({ tubes: [[0, 1, 2, 0, 1], [2, 0, 1], [2, 0, 1, 2], [], []] }), // quá 4 lớp
    w({ tubes: [[0, 1, 2], [1, 2, 0, 1], [2, 0, 1, 2], [0]] }), // thiếu ống
    w({ tubes: [[0, 1, 2], [1, 2, 0, 1], [2, 0, 1, 2], [0], [], []] }), // thêm ống mà chưa dùng +1
    w({ tubes: [[0, 1, 2], [1, 2, 0, 1], [2, 0, 1, '2'], [0], []] }),
    w({ tubes: 'x' }),
    w({ start: [[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], [0]] }),
    w({ moves: -1 }),
    w({ undoLeft: 4 }),
    w({ extraLeft: 2 }),
    w({ extraLeft: 0, assisted: false, tubes: good.tubes.concat([[]]) }),
    w({ assisted: 'no' }),
    w({ history: [[0, 9, 1]] }),
    w({ history: [[0, 3, 0]] }),
    w({ history: [[0, 0, 1]] }),
    w({ history: 'x' }),
    w({ history: [[0, 3, 1], [0, 3, 1], [0, 3, 1], [0, 3, 1]] }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
  const used = w({ extraLeft: 0, assisted: true, tubes: good.tubes.concat([[]]) });
  ok(E.fromJSON(used), 'ván đã +1 ống hợp lệ');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
