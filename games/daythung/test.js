/* Kiểm tra engine Đẩy Thùng: chạy `node test.js`
 * - Đọc màn: ký hiệu chuẩn, từ chối màn sai (không / nhiều người, thùng ≠ đích, hở tường, ký tự lạ)
 * - Luật: đi, đẩy một thùng, không đẩy hai thùng / thùng vào tường, không kéo; thắng khi mọi thùng trên đích
 * - Hoàn tác (lần đẩy gần nhất), chơi lại, đường đi tự động (BFS) không đẩy thùng
 * - Mọi màn hợp lệ và GIẢI ĐƯỢC: solver BFS tìm lời giải trong giới hạn thời gian, chạy lại lời giải bằng move() phải thắng
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

// Màn thử: người (2,1), thùng (3,1) và (2,2), đích (4,1) và (2,3)
//   ######
//   # @$.#
//   # $  #
//   # .  #
//   ######
const ROOM = '######|# @$.#|# $  #|# .  #|######';
const at = (g, x, y) => y * g.map.w + x;
const play = (g, s) => {
  for (const ch of s) g = E.move(g, ch);
  return g;
};

/* ---------------- Đọc màn ---------------- */

test('đọc màn: kích thước, người, thùng, đích', () => {
  const g = E.newGame(null, ROOM);
  eq([g.map.w, g.map.h], [6, 5]);
  eq(g.player, at(g, 2, 1));
  eq(g.boxes, [at(g, 3, 1), at(g, 2, 2)]);
  eq(g.map.goals, [at(g, 4, 1), at(g, 2, 3)]);
  eq([E.moves(g), E.pushes(g), E.onGoal(g), E.isWon(g)], [0, 0, 0, false]);
});

test('đọc màn: * là thùng trên đích, + là người trên đích', () => {
  const g = E.newGame(null, '#####|#+*$#|#   #|#####');
  eq(g.player, at(g, 1, 1));
  eq(g.map.goals, [at(g, 1, 1), at(g, 2, 1)]);
  eq(g.boxes, [at(g, 2, 1), at(g, 3, 1)]);
  eq(E.onGoal(g), 1);
});

test('từ chối màn sai', () => {
  const bad = {
    'không có người': '#####|# $.#|#####',
    'hai người': '######|#@$.@#|######',
    'thùng nhiều hơn đích': '######|#@$$.#|######',
    'không có thùng': '####|#@ #|####',
    'hở tường': '#####|#@$. |#####',
    'ký tự lạ': '######|#@$x.#|######',
    'rỗng': '',
  };
  Object.keys(bad).forEach((k) => ok(E.validateLevel(bad[k]) != null, k));
  eq(E.validateLevel(ROOM), null);
});

/* ---------------- Luật ---------------- */

test('đi vào sàn trống: tăng số bước, không tăng số lần đẩy', () => {
  const g = E.move(E.newGame(null, ROOM), 'l');
  eq(g.player, at(g, 1, 1));
  eq([E.moves(g), E.pushes(g), g.hist], [1, 0, 'l']);
});

test('không đi xuyên tường', () => {
  const g = E.newGame(null, ROOM);
  eq(E.move(g, 'u'), g);
  eq(E.move(g, 'x'), g, 'hướng lạ');
});

test('đẩy thùng: thùng tiến một ô, người vào chỗ thùng, ghi chữ hoa', () => {
  const g = E.move(E.newGame(null, ROOM), 'r');
  eq(g.player, at(g, 3, 1));
  eq(g.boxes[0], at(g, 4, 1));
  eq([E.moves(g), E.pushes(g), g.hist, E.onGoal(g)], [1, 1, 'R', 1]);
});

test('không đẩy thùng vào tường hay vào thùng khác', () => {
  const g = E.move(E.newGame(null, ROOM), 'r'); // thùng đã sát tường phải
  eq(E.move(g, 'r'), g, 'thùng sát tường');
  const h = E.newGame(null, '#######|#@$$ .#|#    .#|#######');
  eq(E.move(h, 'r'), h, 'hai thùng liền nhau');
});

test('không kéo được thùng: lùi ra xa thì thùng đứng yên', () => {
  const g0 = E.newGame(null, ROOM);
  eq(E.move(g0, 'l').boxes, g0.boxes);
});

test('thắng khi mọi thùng trên đích; đã thắng thì không đi tiếp', () => {
  const g = play(E.newGame(null, ROOM), 'rld'); // đẩy phải, lùi về trên thùng 2, đẩy xuống
  eq(g.hist, 'RlD');
  ok(E.isWon(g), 'phải thắng');
  eq(E.move(g, 'u'), g, 'thắng rồi thì đứng yên');
});

/* ---------------- Hoàn tác, chơi lại, đường đi ---------------- */

test('hoàn tác: bỏ lần đẩy gần nhất và các bước sau nó', () => {
  let g = play(E.newGame(null, ROOM), 'rll');
  eq(g.hist, 'Rll');
  g = E.undo(g);
  eq([g.hist, g.player, E.pushes(g)], ['', at(g, 2, 1), 0]);
  eq(g.boxes, E.newGame(null, ROOM).boxes);
});

test('hoàn tác giữ các bước đi trước lần đẩy', () => {
  // đi trái rồi phải (về chỗ cũ), đẩy phải: hoàn tác còn 'lr'
  const g = E.undo(play(E.newGame(null, ROOM), 'lrr'));
  eq(g.hist, 'lr');
});

test('hoàn tác khi chưa đẩy: về chỗ xuất phát; ván trống thì không đổi', () => {
  const g0 = E.newGame(null, ROOM);
  eq(E.undo(g0), g0);
  const g = E.undo(play(g0, 'ld'));
  eq([g.hist, g.player], ['', at(g, 2, 1)]);
});

test('hoàn tác không giới hạn, mỗi lần một lần đẩy', () => {
  let g = E.newGame(8);
  g = play(g, E.solve(g));
  ok(E.isWon(g));
  for (let i = E.pushes(g) - 1; i >= 0; i--) {
    g = E.undo(g);
    eq(E.pushes(g), i);
  }
  ok(/^[urdl]*$/.test(g.hist), 'chỉ còn các bước đi trước lần đẩy đầu');
  eq(E.undo(g).hist, '');
});

test('chơi lại: về trạng thái đầu màn', () => {
  const g = E.restart(play(E.newGame(null, ROOM), 'rll'));
  const s = E.newGame(null, ROOM);
  eq([g.hist, g.player, g.boxes], [s.hist, s.player, s.boxes]);
});

test('đường đi tự động: ngắn nhất, vòng qua thùng, không đẩy', () => {
  const g = E.newGame(null, ROOM);
  const p = E.pathTo(g, at(g, 4, 2));
  eq(p.length, 7); // (2,1) → (1,1) → (1,2) → (1,3) → (2,3) → (3,3) → … → (4,2)
  ok(/^[urdl]+$/.test(p), 'chỉ có bước đi');
  const h = play(g, p);
  eq([h.player, E.pushes(h), h.boxes], [at(g, 4, 2), 0, g.boxes]);
  eq(E.pathTo(g, at(g, 3, 1)), null, 'ô có thùng');
  eq(E.pathTo(g, at(g, 0, 0)), null, 'tường');
  eq(E.pathTo(g, g.player), '');
});

test('đường đi tự động: ô bị thùng chắn lối thì không tới được', () => {
  const g = E.newGame(null, '#######|#@$ . #|#######');
  eq(E.pathTo(g, at(g, 3, 1)), null);
});

/* ---------------- Mọi màn hợp lệ và giải được ---------------- */

test('có ít nhất 30 màn, không trùng nhau', () => {
  ok(E.LEVELS.length >= 30, 'chỉ có ' + E.LEVELS.length);
  eq(new Set(E.LEVELS).size, E.LEVELS.length);
});

test('mọi màn hợp lệ: một người, số thùng bằng số đích, kín tường, chưa thắng sẵn', () => {
  E.LEVELS.forEach((s, i) => {
    const err = E.validateLevel(s);
    if (err) throw new Error('màn ' + (i + 1) + ': ' + err);
    eq((s.match(/[@+]/g) || []).length, 1, 'màn ' + (i + 1) + ' số người');
    eq((s.match(/[$*]/g) || []).length, (s.match(/[.*+]/g) || []).length, 'màn ' + (i + 1) + ' thùng / đích');
    ok(!E.isWon(E.newGame(i)), 'màn ' + (i + 1) + ' đã thắng sẵn');
  });
});

test('solver: thùng kẹt góc không phải đích thì trả null', () => {
  eq(E.solve('#####|#$ .#|#@  #|#####'), null);
  eq(E.solve('######|#  $ #|#@  .#|######'), null); // thùng sát tường trên, đích ở hàng dưới
});

const BUDGET_MS = 5000; // mỗi màn
let totalMs = 0;
const pushesPerLevel = [];
E.LEVELS.forEach((s, i) => {
  test('màn ' + (i + 1) + ' giải được trong ' + BUDGET_MS / 1000 + ' giây (chạy lại lời giải phải thắng)', () => {
    const stats = {};
    const t0 = Date.now();
    const sol = E.solve(E.newGame(i), { stats, maxStates: 2000000 });
    const ms = Date.now() - t0;
    totalMs += ms;
    ok(sol != null, 'không tìm được lời giải');
    ok(ms < BUDGET_MS, 'quá lâu: ' + ms + ' ms');
    let g = E.newGame(i);
    for (const ch of sol) {
      const next = E.move(g, ch);
      if (next === g) throw new Error('lời giải có nước sai ở bước ' + E.moves(g));
      g = next;
    }
    ok(E.isWon(g), 'chạy lại lời giải không thắng');
    eq(E.pushes(g), stats.pushes);
    pushesPerLevel.push(stats.pushes);
  });
});

test('độ khó tăng dần: số thùng không giảm, màn cuối cần nhiều lần đẩy hơn hẳn màn đầu', () => {
  const boxes = E.LEVELS.map((s, i) => E.newGame(i).boxes.length);
  for (let i = 1; i < boxes.length; i++) ok(boxes[i] >= boxes[i - 1], 'màn ' + (i + 1) + ' ít thùng hơn màn trước');
  ok(pushesPerLevel[pushesPerLevel.length - 1] > pushesPerLevel[0] * 5, 'màn cuối quá dễ');
  console.log('       (giải cả ' + E.LEVELS.length + ' màn mất ' + totalMs + ' ms)');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván', () => {
  const g0 = E.newGame(5);
  const g = play(g0, E.solve(g0).slice(0, 9));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq([back.level, back.hist, back.player, back.boxes], [g.level, g.hist, g.player, g.boxes]);
});

test('từ chối dữ liệu hỏng', () => {
  const sol = E.solve(E.newGame(0));
  [
    null, 1, 'x', {},
    { v: 2, level: 0, hist: '' },
    { v: 1, level: -1, hist: '' },
    { v: 1, level: E.LEVELS.length, hist: '' },
    { v: 1, level: '0', hist: '' },
    { v: 1, level: 0, hist: 5 },
    { v: 1, level: 0, hist: 'xyz' },
    { v: 1, level: 0, hist: 'uuuuuuuuuu' }, // đi xuyên tường
    { v: 1, level: 0, hist: sol.toLowerCase() }, // nước đẩy ghi chữ thường
    { v: 1, level: 0, hist: sol + 'u' }, // đi tiếp sau khi thắng
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
  ok(E.fromJSON({ v: 1, level: 0, hist: sol }) != null, 'lời giải đúng phải khôi phục được');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
