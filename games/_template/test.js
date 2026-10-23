/* Kiểm tra engine {{nameVi}}: chạy `node test.js`
 * - Ván mới, chạm đến đủ số lần thì xong, chạm sau khi xong không đổi gì
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
 * (Đây là engine mẫu của _template: thay bằng luật của game thật.)
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

test('ván mới: chưa chạm lần nào, chưa xong', () => {
  const g = E.newGame(10);
  eq([g.target, g.taps, E.isDone(g)], [10, 0, false]);
});

test('chạm đủ số lần thì xong', () => {
  let g = E.newGame(3);
  g = E.tap(g);
  g = E.tap(g);
  eq(E.isDone(g), false);
  g = E.tap(g);
  eq([g.taps, E.isDone(g)], [3, true]);
});

test('chạm sau khi xong không đổi gì', () => {
  let g = E.newGame(1);
  g = E.tap(g);
  eq(E.tap(g), g);
});

test('lưu rồi khôi phục giữ nguyên ván', () => {
  const g = E.tap(E.newGame(10));
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g);
});

test('từ chối dữ liệu hỏng', () => {
  [null, 1, {}, { v: 2, target: 10, taps: 0 }, { v: 1, target: 0, taps: 0 }, { v: 1, target: 10, taps: 11 }, { v: 1, target: 10, taps: -1 }, { v: 1, target: '10', taps: 0 }].forEach((raw) => {
    eq(E.fromJSON(raw), null, JSON.stringify(raw));
  });
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
