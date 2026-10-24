/* Kiểm tra engine Gõ Nhanh: chạy `node test.js`
 * - Danh sách từ: chỉ a–z, đủ lớn, không trùng, không có từ bị loại
 * - Sinh dãy từ tất định theo hạt giống, không lặp liền nhau, đủ dài cho mọi tốc độ người thật
 * - Gõ: đúng / sai / thừa, Space chuyển từ (bỏ dở = thiếu ký tự), Backspace chỉ sửa trong từ hiện tại
 * - Đồng hồ: chạy từ phím đầu, hết giờ thì dừng nhận phím, lịch sử theo giây
 * - WPM = ký tự đúng / 5 / phút, độ chính xác, điểm làm tròn, biểu đồ
 * - Chặn gõ tự động (ký tự đến đồng loạt, tốc độ vượt người thật), người gõ nhanh thật không bị chặn
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');
const WORDS = require('./words.js');

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
function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'điều kiện sai');
}

/** Gõ một chuỗi (mỗi ký tự cách nhau `gap` ms) bắt đầu ở thời điểm `at`; '\b' = Backspace. Trả { g, at }. */
function typeStr(g, s, at, gap) {
  for (const ch of s) {
    g = ch === '\b' ? E.backspace(g, at).game : E.type(g, ch, at).game;
    at += gap;
  }
  return { g, at };
}

/** Ván với dãy từ cho trước (để test luật không phụ thuộc vào hạt giống). */
function fixed(words, mode) {
  const g = E.newGame(1, mode || '60s', WORDS);
  return Object.assign({}, g, { words: words.slice() });
}

/* ---------------- Danh sách từ ---------------- */
test('danh sách từ: chỉ a–z, dài 1–7, không trùng, đủ lớn', () => {
  ok(WORDS.length > 2000, 'quá ít từ: ' + WORDS.length);
  ok(WORDS.every((w) => /^[a-z]{1,7}$/.test(w)), 'có từ ngoài a–z hoặc quá dài');
  eq(new Set(WORDS).size, WORDS.length, 'có từ trùng');
  ['the', 'and', 'people', 'water'].forEach((w) => ok(WORDS.includes(w), 'thiếu từ phổ biến ' + w));
  ['sex', 'kill', 'hes', 'cs', 're'].forEach((w) => ok(!WORDS.includes(w), 'còn từ bị loại ' + w));
});

/* ---------------- Sinh dãy từ ---------------- */
test('sinh dãy từ tất định theo hạt giống, khác hạt giống thì khác dãy', () => {
  const a = E.newGame(12345, '60s', WORDS);
  const b = E.newGame(12345, '60s', WORDS);
  const c = E.newGame(12346, '60s', WORDS);
  eq(a.words, b.words);
  ok(a.words.join(' ') !== c.words.join(' '), 'hai hạt giống khác nhau ra cùng dãy');
});

test('dãy từ: lấy từ danh sách, không lặp liền nhau, đủ dài cho 2 mode', () => {
  for (let seed = 1; seed <= 200; seed++) {
    ['60s', '30s'].forEach((mode) => {
      const g = E.newGame(seed, mode, WORDS);
      eq(g.words.length, (E.MODES[mode] / 1000) * E.WORDS_PER_SEC, 'số từ ' + mode);
      g.words.forEach((w, i) => {
        if (WORDS.indexOf(w) < 0) throw new Error('từ lạ ' + w);
        if (i > 0 && w === g.words[i - 1]) throw new Error('lặp liền nhau ' + w + ' (seed ' + seed + ')');
      });
    });
  }
  // 6 từ / giây ≈ 6 × 6,46 ký tự × 12 ≈ 465 WPM: không người nào gõ hết
  const g = E.newGame(7, '60s', WORDS);
  const chars = g.words.reduce((s, w) => s + w.length + 1, 0);
  ok(chars / 5 > 400, 'dãy từ quá ngắn: ' + chars + ' ký tự');
});

test('newGame từ chối mode lạ và danh sách rỗng', () => {
  let threw = 0;
  try { E.newGame(1, '15s', WORDS); } catch (e) { threw++; }
  try { E.newGame(1, '60s', []); } catch (e) { threw++; }
  eq(threw, 2);
});

/* ---------------- Gõ ---------------- */
test('ván mới: chưa bắt đầu, đủ giờ, chưa có ký tự nào', () => {
  const g = E.newGame(3, '30s', WORDS);
  eq([g.started, g.over, g.i, g.cur, g.keys, g.errors, E.timeLeft(g)], [false, false, 0, '', 0, 0, 30000]);
  eq(E.wpm(g), 0);
  eq(E.accuracy(g), null);
});

test('gõ đúng: tô đúng, Space chuyển sang từ sau, tính ký tự đúng gồm cả dấu cách', () => {
  const { g } = typeStr(fixed(['the', 'cat', 'sat']), 'the cat', 0, 100);
  eq([g.started, g.i, g.typed, g.cur], [true, 1, ['the'], 'cat']);
  eq(E.letterStates(g, 0), ['ok', 'ok', 'ok']);
  eq(E.letterStates(g, 1), ['ok', 'ok', 'ok']);
  eq(E.letterStates(g, 2), ['todo', 'todo', 'todo']);
  eq(E.correctChars(g), 3 + 1 + 3);
  eq([g.keys, g.errors], [7, 0]);
  eq(E.accuracy(g), 1);
});

test('gõ sai và gõ thừa: tô sai / thừa, không tính là ký tự đúng, giới hạn số ký tự thừa', () => {
  let { g } = typeStr(fixed(['dog', 'run']), 'dxgzz', 0, 100);
  eq(E.letterStates(g, 0), ['ok', 'bad', 'ok', 'extra', 'extra']);
  eq(E.correctChars(g), 2);
  eq([g.keys, g.errors], [5, 3]);
  g = typeStr(g, 'zzzzzzzzzz', 1000, 100).g; // vượt giới hạn thừa thì bỏ qua
  eq(g.cur.length, 3 + E.MAX_EXTRA);
  eq(g.keys, 5 + E.MAX_EXTRA - 2);
  // Từ sai sau khi Space: không cộng dấu cách
  g = E.type(g, ' ', 3000).game;
  eq([g.i, E.wordOk(g, 0)], [1, false]);
  eq(E.correctChars(g), 2);
});

test('Space giữa chừng: bỏ dở từ, phần thiếu tính là lỗi; Space khi từ trống thì bỏ qua', () => {
  let g = fixed(['house', 'tree']);
  g = E.type(g, ' ', 0).game;
  eq([g.started, g.i, g.keys], [false, 0, 0], 'Space đầu tiên không bắt đầu ván');
  g = typeStr(g, 'ho ', 0, 100).g;
  eq([g.i, g.typed[0], g.keys, g.errors], [1, 'ho', 3, 1]);
  eq(E.letterStates(g, 0), ['ok', 'ok', 'miss', 'miss', 'miss']);
  eq(E.charStats(g), { correct: 2, incorrect: 0, extra: 0, missed: 3 });
  g = E.type(g, ' ', 500).game;
  eq([g.i, g.keys], [1, 3], 'Space khi từ đang trống');
});

test('Backspace chỉ sửa trong từ hiện tại; Ctrl+Backspace xóa cả từ; lỗi đã gõ vẫn tính vào độ chính xác', () => {
  let g = typeStr(fixed(['one', 'two']), 'one tx\bw', 0, 100).g;
  eq([g.i, g.cur], [1, 'tw']);
  eq([g.keys, g.errors], [7, 1]);
  eq(E.letterStates(g, 1), ['ok', 'ok', 'todo']);
  g = typeStr(g, '\b\b\b\b', 1000, 100).g;
  eq([g.i, g.cur, g.typed], [1, '', ['one']], 'không lùi về từ trước');
  g = typeStr(g, 'twx', 2000, 100).g;
  g = E.clearWord(g, 2400).game;
  eq(g.cur, '');
  eq(E.accuracy(g), (g.keys - g.errors) / g.keys);
});

test('hết từ trong dãy thì ván kết thúc sớm', () => {
  const g = typeStr(fixed(['a', 'b']), 'a b ', 0, 100).g;
  eq([g.over, g.end], [true, 'words']);
  eq(E.type(g, 'x', 600).result.type, 'over');
});

/* ---------------- Đồng hồ ---------------- */
test('đồng hồ: hết giờ thì kết thúc, phím sau đó bị bỏ qua, lịch sử đủ số giây', () => {
  let g = E.newGame(5, '30s', WORDS);
  g = E.type(g, g.words[0][0], 0).game;
  g = E.advance(g, 12345);
  eq([g.t, g.over, g.cum.length], [12345, false, 12]);
  eq(E.timeLeft(g), 30000 - 12345);
  g = E.advance(g, 31000);
  eq([g.t, g.over, g.end, g.cum.length, E.timeLeft(g)], [30000, true, 'time', 30, 0]);
  const r = E.type(g, 'a', 30001);
  eq([r.result.type, r.game.keys], ['over', 1]);
});

test('chưa gõ phím nào thì đồng hồ không chạy', () => {
  const g = E.advance(E.newGame(5, '60s', WORDS), 5000);
  eq([g.t, g.started], [0, false]);
});

/* ---------------- Điểm ---------------- */
test('WPM = ký tự đúng / 5 / phút, điểm làm tròn theo trọn thời lượng mode', () => {
  // 30 giây, gõ đúng 50 từ 3 chữ + dấu cách: 200 ký tự đúng
  let g = fixed(new Array(180).fill(0).map((_, i) => (i % 2 ? 'the' : 'and')), '30s');
  let at = 0;
  for (let i = 0; i < 50; i++) {
    const r = typeStr(g, g.words[i] + ' ', at, 100);
    g = r.g;
    at = r.at;
  }
  eq(E.correctChars(g), 200);
  g = E.advance(g, 30000);
  eq(E.wpm(g), 200 / 5 / 0.5);
  eq(E.score(g), 80);
  eq(E.rawWpm(g), 200 / 5 / 0.5);
});

test('điểm khi bỏ ván giữa chừng tính theo thời gian đã gõ', () => {
  let g = typeStr(fixed(['abcd', 'efgh', 'ijk']), 'abcd efgh ', 0, 100).g;
  g = E.advance(g, 6000);
  // 10 ký tự đúng trong 6 giây = 10 / 5 / 0,1 = 20 WPM
  eq(E.score(g), 20);
});

test('biểu đồ theo giây: WPM cộng dồn, raw và lỗi mỗi giây', () => {
  let g = fixed(['ab', 'cd', 'ef', 'gh'], '30s');
  g = typeStr(g, 'ab cx ', 0, 100).g; // 6 phím trong giây đầu, 1 lỗi
  g = typeStr(g, 'ef ', 1500, 100).g; // 3 phím trong giây 2
  g = E.advance(g, 2000);
  const ch = E.chart(g);
  eq(ch.length, 2);
  eq(ch[0], { s: 1, wpm: 4 / 5 / (1 / 60), raw: 6 * 12, err: 1 });
  eq(ch[1], { s: 2, wpm: 7 / 5 / (2 / 60), raw: 3 * 12, err: 0 });
});

/* ---------------- Chống gian lận ---------------- */
test('ký tự đến đồng loạt (dán / gõ tự động) thì ván bị gắn cờ và kết thúc', () => {
  let g = fixed(['interest', 'between']);
  let flagged = null;
  for (const ch of 'interest') {
    const r = E.type(g, ch, 1000); // cùng một thời điểm
    g = r.game;
    if (r.result.type === 'flagged') flagged = g.flagged;
  }
  eq([flagged, g.over, g.end], ['burst', true, 'flagged']);
  eq(E.score(g), 0);
});

test('gõ nhanh hơn người thật nhiều (máy gõ đều 10 ms) thì bị gắn cờ', () => {
  let g = E.newGame(9, '60s', WORDS);
  let at = 0;
  for (let i = 0; i < 20 && !g.over; i++) {
    const r = typeStr(g, g.words[i] + ' ', at, 10);
    g = r.g;
    at = r.at;
  }
  eq([g.over, g.flagged], [true, 'rate']);
});

/** Người gõ rất nhanh: khoảng cách phím ngẫu nhiên quanh `mean` ms, đôi khi hai phím gần như cùng lúc (rollover), thỉnh thoảng gõ sai rồi sửa. */
function human(seed, mode, mean, opts) {
  const o = Object.assign({ rollover: 0.03, typo: 0.02 }, opts || {});
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let g = E.newGame(seed, mode, WORDS);
  let at = 0;
  const step = () => (rnd() < o.rollover ? rnd() * 2.5 : Math.max(25, mean * (0.55 + rnd() * 0.9)));
  const key = (ch) => {
    g = E.type(g, ch, at).game;
    at += step();
  };
  while (!g.over) {
    const w = g.words[g.i];
    for (let j = 0; j < w.length && !g.over; j++) {
      if (rnd() < o.typo) {
        key('q');
        if (g.over) break;
        g = E.backspace(g, at).game;
        at += step();
      }
      key(w[j]);
    }
    if (!g.over) key(' ');
    g = E.advance(g, at);
  }
  return g;
}

test('người gõ rất nhanh thật (~200–250 WPM, có rollover và sửa lỗi) không bị gắn cờ', () => {
  for (let seed = 1; seed <= 60; seed++) {
    ['60s', '30s'].forEach((mode) => {
      const g = human(seed, mode, 48);
      if (g.flagged) throw new Error('gắn cờ nhầm: ' + g.flagged + ' (seed ' + seed + ', ' + mode + ')');
      eq(g.end, 'time');
    });
  }
  const g = human(3, '60s', 48);
  ok(E.score(g) > 180 && E.score(g) < 260, 'điểm người gõ ~48 ms/phím: ' + E.score(g));
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván (cả đồng hồ, lịch sử, bộ đếm chống gian lận)', () => {
  let g = typeStr(E.newGame(42, '60s', WORDS), 'xyz \b', 0, 120).g;
  g = typeStr(g, g.words[1] + ' ' + g.words[2].slice(0, 2), 700, 90).g;
  g = E.advance(g, 2500);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  // chơi tiếp ra cùng kết quả
  eq(E.type(back, 'a', 2600).game, E.type(g, 'a', 2600).game);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(typeStr(E.newGame(42, '30s', WORDS), 'ab', 0, 100).g);
  const bad = [
    null, 1, 'x', {}, Object.assign({}, good, { v: 99 }), Object.assign({}, good, { mode: '15s' }),
    Object.assign({}, good, { words: [] }), Object.assign({}, good, { words: good.words.map((w, i) => (i === 3 ? 'Ab1' : w)) }),
    Object.assign({}, good, { i: -1 }), Object.assign({}, good, { i: good.words.length + 1 }),
    Object.assign({}, good, { typed: ['a', 'b'] }), Object.assign({}, good, { cur: 5 }),
    Object.assign({}, good, { cur: 'x'.repeat(40) }), Object.assign({}, good, { t: -5 }), Object.assign({}, good, { t: 30001 }),
    Object.assign({}, good, { keys: 1.5 }), Object.assign({}, good, { errors: good.keys + 1 }),
    Object.assign({}, good, { cum: [1, 2, 3] }), Object.assign({}, good, { kps: 'x' }), Object.assign({}, good, { eps: [] }),
    Object.assign({}, good, { started: 'yes' }), Object.assign({}, good, { flagged: 'hack' }), Object.assign({}, good, { recent: [1, 'a'] }),
  ];
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + k));
  ok(E.fromJSON(good) !== null, 'mẫu tốt bị từ chối');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
