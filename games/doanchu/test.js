/* Kiểm tra engine Đoán Chữ: chạy `node test.js`
 * - Danh sách từ: đáp án / từ hợp lệ đúng dạng, đáp án nào cũng đoán được
 * - Tô màu: đúng chỗ / có trong từ / không có, xử lý chữ lặp
 * - Luật lượt: từ hợp lệ, thắng, thua sau 6 lượt, chế độ khó, màu bàn phím
 * - Đề hằng ngày theo ngày địa phương (một đề một ngày, khóa đề), đề tự do theo seed
 * - Mọi đáp án giải được trong 6 lượt bằng solver (kể cả chế độ khó)
 * - Chia sẻ dạng ô màu, lưu / khôi phục và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');
const W = require('./words.js');

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

/** Ván thử với đáp án cho trước (đáp án không cần nằm trong danh sách; chỉ để kiểm luật). */
const freeWith = (answer, hard) => Object.assign(E.newGame({ mode: 'free', seed: 1, hard: !!hard }), { answer });
// Ván tự do thật: seed 12345 ra đáp án 'blame' (khóa ở test "khóa đề")
const seeded = (hard) => E.newGame({ mode: 'free', seed: 12345, hard: !!hard });
function play(g, words) {
  words.forEach((w) => {
    const r = E.guess(g, w);
    if (!r.ok) throw new Error('guess ' + w + ' rejected: ' + r.error);
    g = r.game;
  });
  return g;
}

/* ---------------- Danh sách từ ---------------- */

test('danh sách từ: 5 chữ a–z, không trùng, đáp án nằm trong từ hợp lệ', () => {
  const a = E.ANSWERS;
  ok(a.length >= 800 && a.length <= 1400, 'answers ' + a.length);
  ok(E.VALID.size >= 6000, 'valid ' + E.VALID.size);
  a.forEach((w) => ok(/^[a-z]{5}$/.test(w), w));
  eq(new Set(a).size, a.length, 'trùng đáp án');
  a.forEach((w) => ok(E.isValid(w), w + ' không hợp lệ'));
  W.valid.split(' ').forEach((w) => ok(/^[a-z]{5}$/.test(w), w));
});

test('đáp án đã lọc từ nhạy cảm và dạng số nhiều / quá khứ (vẫn đoán được)', () => {
  ['idiot', 'bigot', 'slave', 'books', 'asked', 'games'].forEach((w) => ok(E.ANSWERS.indexOf(w) < 0, w));
  ['about', 'house', 'breed', 'sheep', 'blame'].forEach((w) => ok(E.ANSWERS.indexOf(w) >= 0, w));
  ['books', 'asked', 'games'].forEach((w) => ok(E.isValid(w), w + ' vẫn đoán được'));
});

test('isValid nhận chữ hoa, từ chối từ lạ / sai độ dài / ký tự lạ', () => {
  ok(E.isValid('CRANE'));
  ok(!E.isValid('abcde'));
  ok(!E.isValid('cran'));
  ok(!E.isValid('cranes'));
  ok(!E.isValid('cr4ne'));
  ok(!E.isValid(null));
});

/* ---------------- Tô màu ---------------- */

test('tô màu cơ bản: đúng chỗ (c) / có trong từ (p) / không có (a)', () => {
  eq(E.score('crane', 'crane'), 'ccccc');
  eq(E.score('react', 'crane'), 'ppcpa');
  eq(E.score('moist', 'crane'), 'aaaaa');
  eq(E.score('trace', 'crane'), 'accpc');
});

test('chữ lặp trong lượt đoán: không tô nhiều hơn số lần có trong đáp án', () => {
  eq(E.score('geese', 'crane'), 'aaaac'); // ba chữ E, đáp án một E: chỉ ô đúng chỗ được tô
  eq(E.score('eerie', 'crane'), 'aapac');
  eq(E.score('speed', 'abide'), 'aapap'); // E thứ hai xám vì đáp án chỉ có một E
});

test('đúng chỗ được ưu tiên trước, chữ còn lại mới xét vàng', () => {
  eq(E.score('speed', 'creep'), 'apcca');
  eq(E.score('lolly', 'hello'), 'apcca');
  eq(E.score('lemon', 'hello'), 'pcapa');
  eq(E.score('abbey', 'babes'), 'ppcca');
});

/* ---------------- Lượt đoán ---------------- */

test('ván mới: chưa đoán, đang chơi; đáp án lấy theo mode', () => {
  const g = E.newGame({ mode: 'free', seed: 42 });
  eq([g.mode, g.guesses.length, E.status(g), g.hard], ['free', 0, 'play', false]);
  eq(g.answer, E.freeAnswer(42));
  const d = E.newGame({ mode: 'daily', date: '2026-10-24' });
  eq([d.mode, d.date, d.answer], ['daily', '2026-10-24', E.dailyAnswer('2026-10-24')]);
});

test('đoán thiếu chữ / không có trong danh sách bị từ chối, không tốn lượt', () => {
  const g = freeWith('crane');
  eq(E.guess(g, 'cran'), { ok: false, error: 'short' });
  eq(E.guess(g, 'qzxvw'), { ok: false, error: 'unknown' });
  eq(g.guesses.length, 0);
});

test('đoán đúng thì thắng, không đoán thêm được', () => {
  const g = play(freeWith('crane'), ['moist', 'CRANE']);
  eq([E.status(g), g.guesses, E.isOver(g), E.isWon(g)], ['won', ['moist', 'crane'], true, true]);
  eq(E.guess(g, 'house'), { ok: false, error: 'over' });
});

test('hết 6 lượt chưa đúng thì thua', () => {
  const g = play(freeWith('crane'), ['moist', 'house', 'dutch', 'about', 'light', 'pizza']);
  eq([E.status(g), E.isOver(g), E.isWon(g)], ['lost', true, false]);
  eq(E.guess(g, 'crane'), { ok: false, error: 'over' });
});

test('đúng ở lượt thứ 6 vẫn thắng', () => {
  eq(E.status(play(freeWith('crane'), ['moist', 'house', 'dutch', 'about', 'light', 'crane'])), 'won');
});

test('guess không sửa ván cũ (hàm thuần)', () => {
  const g = freeWith('crane');
  const r = E.guess(g, 'moist');
  eq(g.guesses.length, 0);
  eq(r.game.guesses, ['moist']);
});

test('bàn phím: màu tốt nhất của mỗi chữ (xanh > vàng > xám)', () => {
  const k = E.keyStates(play(freeWith('crane'), ['react', 'trace']));
  eq([k.r, k.e, k.a, k.c, k.t, k.z], ['c', 'c', 'c', 'p', 'a', undefined]);
});

/* ---------------- Chế độ khó ---------------- */

test('chế độ khó: chữ xanh phải giữ đúng chỗ (báo trước), rồi chữ vàng phải có', () => {
  const g = play(freeWith('crane', true), ['trace']); // R, A, E xanh; C vàng
  eq(E.hardCheck(g, 'brine'), { error: 'hardPos', letter: 'a', pos: 2 });
  eq(E.hardCheck(g, 'grade'), { error: 'hardHas', letter: 'c' });
  eq(E.hardCheck(g, 'crane'), null);
  const r = E.guess(g, 'brave');
  eq([r.ok, r.error, r.letter], [false, 'hardHas', 'c']);
  ok(E.guess(g, 'crane').ok);
});

test('chế độ khó: chữ lặp đã lộ phải có đủ số lần', () => {
  const g = play(freeWith('sheep', true), ['geese']);
  eq(E.score('geese', 'sheep'), 'apcpa'); // lộ hai chữ E và một chữ S
  eq(E.hardCheck(g, 'shell'), { error: 'hardHas', letter: 'e' });
  eq(E.hardCheck(g, 'steep'), null);
});

test('chế độ thường không kiểm tra gợi ý', () => {
  const g = play(freeWith('crane'), ['trace']);
  eq(E.hardCheck(g, 'moist'), null);
  ok(E.guess(g, 'moist').ok);
});

test('bật / tắt chế độ khó chỉ được khi chưa đoán', () => {
  let g = E.setHard(freeWith('crane'), true);
  eq(g.hard, true);
  g = play(g, ['trace']);
  eq(E.setHard(g, false).hard, true);
});

/* ---------------- Đề hằng ngày / tự do ---------------- */

test('ngày địa phương: dateKey theo giờ máy, số đề tăng mỗi ngày (kể cả qua đổi giờ)', () => {
  eq(E.dateKey(new Date(2026, 9, 24, 0, 0, 1)), '2026-10-24');
  eq(E.dateKey(new Date(2026, 9, 24, 23, 59, 59)), '2026-10-24');
  eq(E.dateKey(new Date(2027, 0, 5)), '2027-01-05');
  eq(E.dayNumber('2026-10-24'), 1);
  eq(E.dayNumber('2026-10-25'), 2);
  eq(E.dayNumber('2027-10-24'), 366);
  eq(E.dayNumber('2027-03-29') - E.dayNumber('2027-03-28'), 1);
  eq(E.dayNumber('2026-10-23'), 0);
});

test('đề hằng ngày: cùng ngày cùng từ, không lặp trong cả vòng danh sách', () => {
  eq(E.dailyAnswer('2026-10-24'), E.dailyAnswer('2026-10-24'));
  const seen = new Set();
  for (let i = 0; i < E.ANSWERS.length; i++) seen.add(E.dailyAnswer(E.dateKey(new Date(2026, 9, 24 + i))));
  eq(seen.size, E.ANSWERS.length);
  ok(E.ANSWERS.indexOf(E.dailyAnswer('2020-01-01')) >= 0, 'ngày trước khi ra mắt vẫn có đề');
});

test('khóa đề: đổi thuật toán hoặc danh sách từ là đổi đề đã phát', () => {
  // Đỏ vì cố ý đổi danh sách từ: cập nhật giá trị ở đây VÀ đáp án seed 12345 trong e2e.spec.ts
  eq([E.dailyAnswer('2026-10-24'), E.dailyAnswer('2026-10-25'), E.freeAnswer(12345)], ['vital', 'brown', 'blame']);
});

test('đề tự do: tất định theo seed, seed khác thường ra từ khác', () => {
  eq(E.freeAnswer(7), E.freeAnswer(7));
  const set = new Set();
  for (let s = 1; s <= 300; s++) set.add(E.freeAnswer(s));
  ok(set.size > 200, 'chỉ ' + set.size + ' từ khác nhau');
  const r = E.rng(99);
  const a = [r(), r(), r()];
  const r2 = E.rng(99);
  eq([r2(), r2(), r2()], a);
  a.forEach((x) => ok(x >= 0 && x < 1));
});

/* ---------------- Giải được ---------------- */

/** Solver: lượt đầu 'raise', sau đó đoán một từ còn khả dĩ chia ứng viên thành nhiều nhóm nhất; trả số lượt. */
function solve(g) {
  let cands = E.ANSWERS.slice();
  while (!E.isOver(g)) {
    const pick = g.guesses.length === 0 ? 'raise' : bestSplit(cands);
    const r = E.guess(g, pick);
    if (!r.ok) throw new Error('solver guess rejected: ' + pick + ' ' + r.error);
    g = r.game;
    const pat = E.score(pick, g.answer);
    cands = cands.filter((w) => w !== pick && E.score(pick, w) === pat);
  }
  if (!E.isWon(g)) throw new Error('solver thua: ' + g.answer + ' ' + g.guesses.join(','));
  return g.guesses.length;
}
function bestSplit(cands) {
  let best = cands[0];
  let bestN = -1;
  if (cands.length <= 2) return best;
  cands.forEach((w) => {
    const n = new Set(cands.map((x) => E.score(w, x))).size;
    if (n > bestN) {
      bestN = n;
      best = w;
    }
  });
  return best;
}

test('mọi đáp án giải được trong 6 lượt bằng solver, lượt nào cũng hợp lệ ở chế độ khó', () => {
  let worst = 0;
  let total = 0;
  E.ANSWERS.forEach((answer) => {
    const g = Object.assign(E.newGame({ mode: 'free', seed: 1, hard: true }), { answer });
    const n = solve(g);
    worst = Math.max(worst, n);
    total += n;
  });
  ok(worst <= 6, 'lâu nhất ' + worst + ' lượt');
  console.log('       solver: trung bình ' + (total / E.ANSWERS.length).toFixed(2) + ' lượt, lâu nhất ' + worst);
});

/* ---------------- Chia sẻ ---------------- */

test('chia sẻ: ô màu từng lượt, giao diện sáng / tối / mù màu, nhãn kết quả', () => {
  const g = play(freeWith('crane'), ['moist', 'trace', 'crane']);
  eq(E.shareGrid(g, {}), '⬜⬜⬜⬜⬜\n⬜🟩🟩🟨🟩\n🟩🟩🟩🟩🟩');
  eq(E.shareGrid(g, { dark: true }).split('\n')[0], '⬛⬛⬛⬛⬛');
  eq(E.shareGrid(g, { contrast: true }).split('\n')[1], '⬜🟧🟧🟦🟧');
  eq(E.resultLabel(g), '3/6');
  eq(E.resultLabel(play(freeWith('crane', true), ['trace', 'crane'])), '2/6*');
  eq(E.resultLabel(play(freeWith('crane'), ['moist', 'house', 'dutch', 'about', 'light', 'pizza'])), 'X/6');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (tự do và hằng ngày)', () => {
  const g = play(seeded(true), ['trace']);
  eq(g.answer, 'blame');
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g);
  const d = play(E.newGame({ mode: 'daily', date: '2026-11-02' }), ['moist']);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(d)))), d);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(play(seeded(true), ['trace'])); // đáp án 'blame': lộ A, E xanh
  const with_ = (patch) => Object.assign({}, good, patch);
  const daily = E.toJSON(E.newGame({ mode: 'daily', date: '2026-10-24' }));
  const bad = [
    null,
    1,
    'x',
    {},
    with_({ v: 2 }),
    with_({ mode: 'blitz' }),
    with_({ seed: -1 }),
    with_({ seed: 1.5 }),
    with_({ answer: 'house' }), // không khớp seed
    with_({ guesses: 'trace' }),
    with_({ guesses: ['qzxvw'] }),
    with_({ guesses: ['moist', 'house', 'dutch', 'about', 'light', 'pizza', 'eight'], hard: false }),
    with_({ guesses: ['blame', 'moist'], hard: false }), // đã thắng mà còn đoán tiếp
    with_({ guesses: ['trace', 'moist'] }), // vi phạm chế độ khó
    with_({ hard: 'yes' }),
    Object.assign({}, daily, { date: '2026-13-01' }),
    Object.assign({}, daily, { date: '2026-10-24x' }),
    Object.assign({}, daily, { answer: 'zzzzz' }),
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
