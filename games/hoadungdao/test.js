/* Kiểm tra engine Hoa Dung Đạo: chạy `node test.js`
 * - Đọc màn: chuỗi hình khối, cắt cặp V / H duy nhất, từ chối màn sai (khối hở, thiếu / thừa khối lớn, số ô trống ≠ 2)
 * - Luật: trượt qua ô trống, không đè khối khác / ra ngoài khay, rẽ góc trong một nước, gộp nước cùng khối,
 *   khối về chỗ cũ thì xóa nước, hoàn tác cả nước, thắng khi khối lớn tới lối ra và sau đó không đi được nữa
 * - Solver BFS (trạng thái chuẩn hóa theo hình, không theo danh tính): mọi màn GIẢI ĐƯỢC, `min` lưu trong màn đúng bằng
 *   số nước tối thiểu solver tính, lời giải chạy lại bằng moveTo() thắng đúng sau `min` nước; có thế cổ điển 81 nước
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

const CLASSIC = 'VBBV|VBBV|VHHV|VSSV|S..S';
const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;
const pos = (g, k) => [g.blocks[k].x, g.blocks[k].y];
/** Chỉ số khối ở ô (x, y). */
const at = (g, x, y) => E.occupancy(g.blocks)[y * E.W + x];

/* ---------------- Đọc màn ---------------- */

test('đọc thế cổ điển: 10 khối theo thứ tự đọc, đúng hình và vị trí', () => {
  const b = E.parseLayout(CLASSIC);
  eq(b.length, 10);
  eq(b.map((x) => x.t).join(''), 'VBVVHVSSSS');
  eq(b[1], { t: 'B', x: 1, y: 0 });
  eq(b[4], { t: 'H', x: 1, y: 2 });
  eq(b[8], { t: 'S', x: 0, y: 4 });
  eq(E.layoutOf(b), CLASSIC);
});

test('dãy V trong một cột cắt cặp từ trên xuống, dãy H trong một hàng cắt từ trái sang', () => {
  const b = E.parseLayout('VBBV|VBBV|VHHV|VHHV|S..S');
  ok(b, 'đọc được');
  eq(b.filter((x) => x.t === 'V').map((x) => [x.x, x.y]), [[0, 0], [3, 0], [0, 2], [3, 2]]);
  eq(b.filter((x) => x.t === 'H').map((x) => [x.x, x.y]), [[1, 2], [1, 3]]);
  const h = E.parseLayout('VBBV|VBBV|HHHH|SSSS|S..S');
  eq(h.filter((x) => x.t === 'H').map((x) => [x.x, x.y]), [[0, 2], [2, 2]]);
  ok(!E.parseLayout('HHHB|BB..|SSSS|SSSS|SSSS'), 'H lẻ / B gãy');
});

test('từ chối màn sai', () => {
  [
    null, 5, '', 'VBBV|VBBV|VHHV|VSSV', 'VBBV|VBBV|VHHV|VSSV|S..S|SSSS', 'VBBV|VBBV|VHHV|VSSV|S..SS',
    'VBBV|VBBV|VHHV|VSSV|S.SS', // một ô trống
    'VBBV|VBBV|VHHV|VS.V|S..S', // ba ô trống
    'VSSV|VSSV|VHHV|VSSV|S..S', // không có khối lớn
    'VBBV|VBBV|VHHV|VBBV|VBB.', // hai khối lớn (và V lẻ)
    'VBBV|VBBV|SHHV|VSSV|S..S', // V lẻ ở cột 0
    'VBBV|VBBV|VHSV|VSSV|S..S', // H một nửa
    'VBBX|VBBV|VHHV|VSSV|S..S', // ký tự lạ
  ].forEach((s) => eq(E.parseLayout(s), null, String(s)));
});

/* ---------------- Luật ---------------- */

test('thế cổ điển: chỉ bốn khối vuông nhỏ quanh hai ô trống đi được', () => {
  const g = E.fromLayout(0, CLASSIC);
  const movable = g.blocks.map((b, k) => (E.reach(g, k).length ? k : -1)).filter((k) => k >= 0);
  eq(movable, [6, 7, 8, 9]);
  eq(E.reach(g, 6), [[1, 4], [2, 4]], 'vuông (1,3) đi xuống rồi rẽ phải');
  eq(E.reach(g, 8), [[1, 4], [2, 4]], 'vuông (0,4) trượt phải một hoặc hai ô');
  ok(!E.canStep(g, 1, DOWN), 'khối lớn bị H chặn');
  ok(!E.canStep(g, 0, LEFT), 'không ra ngoài khay');
  ok(E.canStep(g, 8, RIGHT));
});

test('trượt một ô: khối khác bị chặn thì trả nguyên ván', () => {
  const g = E.fromLayout(0, CLASSIC);
  eq(E.step(g, 1, DOWN), g);
  eq(E.step(g, 0, UP), g);
  const n = E.step(g, 8, RIGHT);
  eq(pos(n, 8), [1, 4]);
  eq(E.moves(n), 1);
  eq(pos(g, 8), [0, 4], 'ván cũ không đổi');
});

test('một khối trượt xa hoặc rẽ góc trong một lần kéo vẫn là một nước', () => {
  let g = E.fromLayout(0, CLASSIC);
  g = E.moveTo(g, 6, 2, 4); // vuông (1,3) xuống (1,4) rồi sang (2,4)
  eq(pos(g, 6), [2, 4]);
  eq(E.moves(g), 1);
  const far = E.moveTo(E.fromLayout(0, CLASSIC), 8, 2, 4); // trượt hai ô sang phải
  eq([pos(far, 8), E.moves(far)], [[2, 4], 1]);
  eq(E.moveTo(E.fromLayout(0, CLASSIC), 8, 3, 4).hist.length, 0, 'không tới được ô đang có khối');
});

test('đi tiếp cùng khối thì gộp vào nước trước; khác khối thì thêm nước', () => {
  let g = E.fromLayout(0, CLASSIC);
  g = E.step(g, 8, RIGHT);
  g = E.step(g, 8, RIGHT);
  eq([pos(g, 8), E.moves(g)], [[2, 4], 1]);
  g = E.step(g, 6, DOWN);
  eq(E.moves(g), 2);
  g = E.step(g, 6, UP);
  eq(E.moves(g), 1, 'khối về chỗ cũ thì nước đó bị xóa');
  eq(pos(g, 6), [1, 3]);
});

test('hoàn tác lấy lại nguyên một nước (cả nước đã gộp)', () => {
  let g = E.fromLayout(0, CLASSIC);
  g = E.step(E.step(g, 8, RIGHT), 8, RIGHT);
  g = E.step(g, 6, DOWN);
  g = E.undo(g);
  eq([pos(g, 6), E.moves(g)], [[1, 3], 1]);
  g = E.undo(g);
  eq([pos(g, 8), E.moves(g)], [[0, 4], 0]);
  eq(E.undo(g), g, 'hết nước thì không đổi');
});

test('thắng khi khối lớn tới lối ra; sau đó không đi được nữa', () => {
  // Khối lớn ở (1,2), lối ra bên dưới trống
  let g = E.fromLayout(0, 'VSSV|VHHV|VBBV|VBBV|S..S');
  ok(!E.isWon(g));
  const big = E.bigIndex(g);
  g = E.step(g, big, DOWN);
  ok(E.isWon(g), 'thắng');
  eq(E.moves(g), 1);
  eq(E.step(g, 0, DOWN), g);
  eq(E.moveTo(g, big, 1, 2), g);
  eq(E.reach(g, at(g, 0, 4)), []);
  ok(E.keyWon(E.keyOf(g.blocks)));
});

/* ---------------- Solver và các màn ---------------- */

test('solver: thế cổ điển (Hoành đao lập mã) cần đúng 81 nước', () => {
  const r = E.solve(CLASSIC);
  eq(r.min, 81);
  eq(r.keys.length, 82);
});

test('solver: chuẩn hóa theo hình nên hai khối cùng hình đổi chỗ là một trạng thái', () => {
  const g = E.fromLayout(0, CLASSIC);
  const swapped = g.blocks.slice();
  [swapped[0], swapped[3]] = [swapped[3], swapped[0]]; // đổi danh tính hai khối V
  eq(E.keyOf(swapped), E.keyOf(g.blocks));
  eq(E.solve('VBBV|VBBV|VHHV|VSSV|SS..').min > 0, true);
  eq(E.solve('VSSV|VHHV|VBBV|VBBV|S..S').min, 1);
  eq(E.solve('VSSV|VHHV|SBBV|VBBV|...S'), null, 'màn sai');
});

test('solver: thế không giải được trả null', () => {
  // Hai hàng H nằm ngang chắn dưới khối lớn: H chỉ dịch ngang, khối lớn không bao giờ xuống được
  eq(E.solve('VBBV|VBBV|HHHH|HHHH|S..S'), null);
  eq(E.solve('HHHH|HHHH|HHHH|BB..|BBHH'), null);
  eq(E.solve('VVHH|VVHH|HHHH|BBSS|BB..').min, 2);
});

test('có ít nhất 20 màn, mỗi màn đúng luật: một khối lớn, hai ô trống, chưa thắng sẵn', () => {
  ok(E.LEVELS.length >= 20, 'số màn ' + E.LEVELS.length);
  E.LEVELS.forEach((L, i) => {
    const g = E.newGame(i);
    ok(g, 'màn ' + (i + 1) + ' đọc được');
    ok(!E.isWon(g), 'màn ' + (i + 1) + ' chưa thắng sẵn');
    ok(Number.isInteger(L.min) && L.min > 0, 'màn ' + (i + 1) + ' có min');
  });
});

test('có thế cổ điển Hoành đao lập mã (81 nước)', () => {
  const c = E.LEVELS.filter((L) => L.classic);
  eq(c.length, 1);
  eq([c[0].layout, c[0].min], [CLASSIC, 81]);
});

test('các màn khác nhau (kể cả lật gương) và khó dần theo số nước tối thiểu', () => {
  const mirror = (s) => s.split('|').map((r) => r.split('').reverse().join('')).join('|');
  const seen = new Set();
  E.LEVELS.forEach((L, i) => {
    ok(!seen.has(L.layout) && !seen.has(mirror(L.layout)), 'màn ' + (i + 1) + ' trùng');
    seen.add(L.layout);
    if (i) ok(L.min > E.LEVELS[i - 1].min, 'màn ' + (i + 1) + ' phải khó hơn màn trước');
  });
});

test('mọi màn GIẢI ĐƯỢC, min đúng bằng BFS, lời giải chạy lại bằng moveTo() thắng sau đúng min nước', () => {
  const t0 = Date.now();
  E.LEVELS.forEach((L, i) => {
    const r = E.solve(L.layout);
    ok(r, 'màn ' + (i + 1) + ' không giải được');
    eq(r.min, L.min, 'màn ' + (i + 1) + ' min');
    // Đổi dãy khóa (không danh tính) thành nước đi của từng khối trong ván thật
    let g = E.newGame(i);
    for (let s = 1; s < r.keys.length; s++) {
      let next = null;
      for (let k = 0; k < g.blocks.length && !next; k++) {
        for (const [x, y] of E.reach(g, k)) {
          const n = E.moveTo(g, k, x, y);
          if (E.keyOf(n.blocks) === r.keys[s]) {
            next = n;
            break;
          }
        }
      }
      ok(next, 'màn ' + (i + 1) + ' bước ' + s + ' không đi được');
      g = next;
    }
    ok(E.isWon(g), 'màn ' + (i + 1) + ' thắng');
    // Lời giải tối thiểu không bao giờ đi cùng khối hai nước liền (nếu có thì gộp được, ít hơn min): số nước = min
    eq(E.moves(g), L.min, 'màn ' + (i + 1) + ' số nước khi chạy lại');
  });
  console.log('       (giải ' + E.LEVELS.length + ' màn trong ' + (Date.now() - t0) + ' ms)');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (khối, số nước, hoàn tác được)', () => {
  let g = E.newGame(17);
  g = E.step(E.step(g, 8, RIGHT), 8, RIGHT);
  g = E.moveTo(g, 6, 1, 4);
  g = E.moveTo(g, 6, 1, 3); // về chỗ cũ: nước bị xóa
  g = E.step(g, 3, DOWN); // V (0,2) xuống
  const raw = JSON.parse(JSON.stringify(E.toJSON(g)));
  eq(raw, { v: 1, level: 17, hist: [[8, 2, 4], [3, 0, 3]] });
  const r = E.fromJSON(raw);
  eq(r, g);
  eq(E.undo(r), E.undo(g));
});

test('khôi phục ván chưa đi nước nào', () => {
  eq(E.fromJSON({ v: 1, level: 3, hist: [] }), E.newGame(3));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.step(E.newGame(17), 8, RIGHT));
  [
    null, 1, 'x', {}, [],
    { v: 2, level: 0, hist: [] },
    { v: 1, level: -1, hist: [] },
    { v: 1, level: E.LEVELS.length, hist: [] },
    { v: 1, level: 1.5, hist: [] },
    { v: 1, level: '1', hist: [] },
    { v: 1, level: 17, hist: null },
    { v: 1, level: 17, hist: [[8, 3, 4]] }, // ô đang có khối
    { v: 1, level: 17, hist: [[1, 1, 1]] }, // khối lớn bị chặn
    { v: 1, level: 17, hist: [[99, 0, 0]] }, // không có khối
    { v: 1, level: 17, hist: [[8, 1]] },
    { v: 1, level: 17, hist: [[8, '1', 4]] },
    { v: 1, level: 17, hist: [[8, 1, 4], [8, 2, 4]] }, // hai nước cùng khối liền nhau (đã phải gộp)
    { v: 1, level: 17, hist: [[8, 1, 4], [8, 0, 4]] }, // về chỗ cũ
    { v: 1, level: 17, hist: new Array(6000).fill([8, 1, 4]) },
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw).slice(0, 60)));
  ok(E.fromJSON(good), 'ván tốt vẫn đọc được');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
