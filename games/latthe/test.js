/* Kiểm tra engine Lật Thẻ: chạy `node test.js`
 * - Chia bài: đủ số thẻ theo mức độ, mỗi hình đúng 2 thẻ, cùng seed thì cùng bàn
 * - Lật: thẻ đầu, ăn cặp, cặp sai, khóa khi cặp sai đang mở, úp lại
 * - Thắng khi ăn hết các cặp; đếm lượt và số lần lật
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
 */
const L = require('./engine.js');

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
  if (a !== b) throw new Error((msg || 'khác nhau') + `: nhận ${JSON.stringify(a)}, mong đợi ${JSON.stringify(b)}`);
}

/** Ván tự dựng với dãy hình cho trước (mode chỉ để ghi nhận). */
function gameOf(faces, mode) {
  return { mode: mode || 'easy', faces: faces.slice(), matched: faces.map(() => false), open: [], moves: 0, flips: 0, status: 'playing' };
}

/** Vị trí thẻ còn lại cùng hình với thẻ i. */
const partner = (g, i) => g.faces.findIndex((f, j) => j !== i && f === g.faces[i]);

/** Chơi hết bàn không sai lần nào (biết trước hình). */
function solve(g) {
  for (let i = 0; i < g.faces.length; i++) {
    if (g.matched[i]) continue;
    L.flip(g, i);
    L.flip(g, partner(g, i));
  }
}

console.log('Lật Thẻ - kiểm tra engine');

/* ---------------- Chia bài ---------------- */

test('mỗi mức độ có đúng số thẻ: dễ 12, vừa 16, khó 30', () => {
  eq(L.createGame('easy').faces.length, 12);
  eq(L.createGame('medium').faces.length, 16);
  eq(L.createGame('hard').faces.length, 30);
});

test('mỗi hình xuất hiện đúng 2 lần, số hình bằng số cặp', () => {
  const rng = L.seededRandom(11);
  L.MODE_KEYS.forEach((m) => {
    for (let k = 0; k < 50; k++) {
      const g = L.createGame(m, rng);
      const count = {};
      g.faces.forEach((f) => {
        assert(Number.isInteger(f) && f >= 0 && f < L.FACE_COUNT, 'hình ngoài bộ: ' + f);
        count[f] = (count[f] || 0) + 1;
      });
      eq(Object.keys(count).length, L.MODES[m].pairs, m + ' số hình');
      Object.values(count).forEach((n) => eq(n, 2, m + ' hình lẻ'));
    }
  });
});

test('lưới gợi ý của mỗi mức độ có đúng số ô', () => {
  L.MODE_KEYS.forEach((m) => {
    L.MODES[m].grids.forEach(([c, r]) => eq(c * r, L.MODES[m].pairs * 2, m + ' ' + c + 'x' + r));
  });
  assert(L.MODES.hard.pairs <= L.FACE_COUNT, 'đủ hình cho mức khó');
});

test('cùng seed thì cùng bàn, khác seed thì (gần như luôn) khác', () => {
  const a = L.createGame('hard', L.seededRandom(7)).faces.join();
  const b = L.createGame('hard', L.seededRandom(7)).faces.join();
  const c = L.createGame('hard', L.seededRandom(8)).faces.join();
  eq(a, b);
  assert(a !== c, 'seed khác ra bàn khác');
});

test('mode lạ thì về mức dễ; ván mới chưa có lượt nào', () => {
  const g = L.createGame('nope', L.seededRandom(1));
  eq(g.mode, 'easy');
  eq(g.faces.length, 12);
  eq(g.moves, 0);
  eq(g.flips, 0);
  eq(g.status, 'playing');
  eq(L.remainingPairs(g), 6);
});

/* ---------------- Lật thẻ ---------------- */

test('thẻ đầu mở ra, lật lại chính nó thì không được', () => {
  const g = gameOf([0, 1, 0, 1]);
  const r = L.flip(g, 0);
  eq(r.kind, 'first');
  eq(g.open.join(), '0');
  eq(L.flip(g, 0), null, 'không lật lại thẻ đang mở');
  eq(g.moves, 0);
  eq(g.flips, 1);
});

test('hai thẻ cùng hình thì ăn cặp, giữ mở, tính một lượt', () => {
  const g = gameOf([0, 1, 0, 1]);
  L.flip(g, 0);
  const r = L.flip(g, 2);
  eq(r.kind, 'match');
  eq(r.pair.join(), '0,2');
  eq(r.won, false);
  eq(g.matched[0] && g.matched[2], true);
  eq(g.open.length, 0);
  eq(g.moves, 1);
  eq(L.flip(g, 0), null, 'thẻ đã ăn không lật được');
  eq(L.matchedPairs(g), 1);
});

test('cặp sai thì khóa bàn tới khi úp lại', () => {
  const g = gameOf([0, 1, 0, 1]);
  L.flip(g, 0);
  const r = L.flip(g, 1);
  eq(r.kind, 'mismatch');
  eq(r.pair.join(), '0,1');
  eq(L.isLocked(g), true);
  eq(L.canFlip(g, 2), false);
  eq(L.flip(g, 2), null, 'đang khóa không lật được');
  eq(g.flips, 2);
  eq(g.moves, 1);
  eq(L.hide(g).join(), '0,1');
  eq(L.isLocked(g), false);
  eq(g.open.length, 0);
  eq(L.hide(g), null, 'không còn gì để úp');
  eq(L.flip(g, 2).kind, 'first');
});

test('chỉ số sai hoặc ngoài bàn thì không lật', () => {
  const g = gameOf([0, 1, 0, 1]);
  eq(L.flip(g, -1), null);
  eq(L.flip(g, 4), null);
  eq(L.flip(g, 1.5), null);
  eq(L.flip(g, '1'), null);
  eq(g.flips, 0);
});

test('ăn hết các cặp thì thắng, thắng rồi không lật được nữa', () => {
  const g = gameOf([2, 5, 5, 2]);
  L.flip(g, 0);
  L.flip(g, 3);
  L.flip(g, 1);
  const r = L.flip(g, 2);
  eq(r.kind, 'match');
  eq(r.won, true);
  eq(g.status, 'won');
  eq(g.moves, 2);
  eq(L.progress(g), 1);
  eq(L.flip(g, 0), null);
});

test('ván thật: chơi không sai thì số lượt bằng số cặp', () => {
  L.MODE_KEYS.forEach((m) => {
    const g = L.createGame(m, L.seededRandom(3));
    solve(g);
    eq(g.status, 'won', m);
    eq(g.moves, L.MODES[m].pairs, m + ' số lượt');
    eq(g.flips, L.MODES[m].pairs * 2, m + ' số lần lật');
  });
});

/* ---------------- Lưu / khôi phục ---------------- */

test('khôi phục ván từ JSON giữ nguyên bàn, thẻ đã ăn, thẻ đang mở và số lượt', () => {
  const g = L.createGame('medium', L.seededRandom(5));
  L.flip(g, 0);
  L.flip(g, partner(g, 0));
  const other = g.faces.findIndex((f, i) => !g.matched[i]);
  L.flip(g, other);
  const back = L.fromJSON(JSON.parse(JSON.stringify(L.toJSON(g))));
  assert(back, 'phải khôi phục được');
  eq(back.mode, 'medium');
  eq(back.faces.join(), g.faces.join());
  eq(back.matched.join(), g.matched.join());
  eq(back.open.join(), String(other));
  eq(back.moves, 1);
  eq(back.flips, 3);
  eq(back.status, 'playing');
  // Chơi tiếp được trên ván đã khôi phục
  eq(L.flip(back, partner(back, other)).kind, 'match');
});

test('cặp sai đang chờ úp khi lưu thì khôi phục thành úp', () => {
  const g = gameOf([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
  L.flip(g, 0);
  L.flip(g, 1);
  const back = L.fromJSON(L.toJSON(g));
  assert(back);
  eq(back.open.length, 0);
  eq(L.isLocked(back), false);
  eq(back.moves, 1);
});

test('từ chối JSON hỏng hoặc sai luật', () => {
  const g = L.createGame('easy', L.seededRandom(9));
  L.flip(g, 0);
  const good = L.toJSON(g);
  assert(L.fromJSON(good), 'bản tốt phải qua');
  const bad = (patch) => L.fromJSON(Object.assign(JSON.parse(JSON.stringify(good)), patch));
  eq(L.fromJSON(null), null);
  eq(L.fromJSON('x'), null);
  eq(bad({ mode: 'insane' }), null, 'mode lạ');
  eq(bad({ faces: good.faces.slice(1) }), null, 'thiếu thẻ');
  eq(bad({ faces: good.faces.map((f, i) => (i === 0 ? 99 : f)) }), null, 'hình ngoài bộ');
  const three = good.faces.slice();
  three[three.findIndex((f) => f !== good.faces[0])] = good.faces[0];
  eq(bad({ faces: three }), null, 'một hình 3 thẻ');
  eq(bad({ matched: good.matched.slice(1) }), null, 'matched sai độ dài');
  eq(bad({ matched: good.matched.map((m, i) => (i === 0 ? 'x' : m)) }), null, 'matched sai kiểu');
  const half = good.matched.slice();
  half[0] = 1;
  eq(bad({ matched: half, open: [] }), null, 'chỉ một thẻ của cặp đã ăn');
  eq(bad({ open: [0, 1] }), null, 'hai thẻ mở');
  eq(bad({ open: [12] }), null, 'thẻ mở ngoài bàn');
  eq(bad({ moves: -1 }), null, 'số lượt âm');
  eq(bad({ moves: 1.5 }), null, 'số lượt lẻ');
  eq(bad({ flips: 0 }), null, 'số lần lật ít hơn thẻ đang mở');
  const done = L.createGame('easy', L.seededRandom(2));
  solve(done);
  eq(L.fromJSON(L.toJSON(done)), null, 'ván đã xong');
});

test('thẻ đang mở không được là thẻ đã ăn; số lượt không ít hơn số cặp đã ăn', () => {
  const g = gameOf([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
  L.flip(g, 0);
  L.flip(g, 6);
  const j = L.toJSON(g);
  eq(L.fromJSON(Object.assign({}, j, { open: [0], flips: 3 })), null, 'mở thẻ đã ăn');
  eq(L.fromJSON(Object.assign({}, j, { moves: 0, flips: 0 })), null, 'ăn cặp mà chưa có lượt');
  assert(L.fromJSON(j));
});

console.log(`\n${passed} ok, ${failed} lỗi`);
if (failed) {
  console.log('Lỗi: ' + failures.join(' | '));
  process.exit(1);
}
