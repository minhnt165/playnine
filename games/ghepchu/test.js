/* Kiểm tra engine Ghép Chữ: chạy `node test.js`
 * - Bộ từ: chỉ a–z, đúng độ dài, đã sắp xếp, không có từ bị chặn; từ gốc 6–7 chữ
 * - Vòng sinh tất định theo hạt giống; MỌI từ gốc cho ≥ MIN_WORDS từ hợp lệ và chứa chính nó; trần điểm
 * - Luật gửi từ: ngắn, sai chữ, không phải từ, trùng, hợp lệ (điểm theo độ dài), hết giờ
 * - Đồng hồ 90 giây, xáo chữ giữ đúng bộ chữ
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
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
function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'điều kiện sai');
}

const sorted = (s) => s.split('').sort().join('');
/** Một từ hợp lệ của vòng có độ dài n (dùng cho test). */
const wordOf = (g, n) => E.allWords(g).find((w) => w.length === n);
/** Một chuỗi đúng chữ của vòng nhưng không phải từ. */
function nonWord(g) {
  const all = new Set(E.allWords(g));
  const l = g.letters;
  for (let i = 0; i < l.length; i++) {
    for (let j = 0; j < l.length; j++) {
      for (let k = 0; k < l.length; k++) {
        if (i === j || j === k || i === k) continue;
        const w = l[i] + l[j] + l[k];
        if (!all.has(w)) return w;
      }
    }
  }
  throw new Error('không tìm được chuỗi vô nghĩa');
}

/* ---------------- Bộ từ ---------------- */
test('bộ từ: mỗi nhóm chỉ a–z, đúng độ dài, sắp xếp tăng, không trùng', () => {
  for (const n of [3, 4, 5, 6, 7]) {
    const s = W.words[n];
    ok(/^[a-z]*$/.test(s), 'nhóm ' + n + ' có ký tự lạ');
    eq(s.length % n, 0, 'nhóm ' + n);
    for (let i = n; i < s.length; i += n) ok(s.slice(i - n, i) < s.slice(i, i + n), 'nhóm ' + n + ' không tăng ở ' + s.slice(i, i + n));
  }
  ok(E.WORD_COUNT > 5000, 'quá ít từ: ' + E.WORD_COUNT);
});

test('bộ từ: không có từ bị chặn, có các từ thường gặp', () => {
  ['fuck', 'shit', 'cunt', 'sex', 'sexy', 'nigger', 'whore', 'hes', 'nth'].forEach((w) => eq(E.isWord(w), false, w));
  ['cat', 'tea', 'rate', 'stone', 'garden', 'printed', 'notes'].forEach((w) => eq(E.isWord(w), true, w));
});

test('từ gốc: 6–7 chữ, đều là từ hợp lệ, không trùng bộ chữ', () => {
  ok(E.BASES.length >= 500, 'quá ít từ gốc: ' + E.BASES.length);
  const keys = new Set();
  E.BASES.forEach((b) => {
    ok(b.length === 6 || b.length === 7, b);
    ok(E.isWord(b), b + ' không phải từ hợp lệ');
    ok(!keys.has(sorted(b)), 'trùng bộ chữ ' + b);
    keys.add(sorted(b));
  });
  ok(E.BASES.some((b) => b.length === 6) && E.BASES.some((b) => b.length === 7), 'phải có cả 6 và 7 chữ');
});

test('MỌI từ gốc cho ≥ MIN_WORDS (25) từ hợp lệ, tổng điểm ≤ MAX_SCORE; MAX_SCORE đúng bằng vòng lớn nhất', () => {
  let max = 0;
  let minWords = Infinity;
  E.BASES.forEach((b) => {
    const words = E.wordsFor(b);
    ok(words.length >= E.MIN_WORDS, b + ': ' + words.length + ' từ');
    ok(words.includes(b), b + ' không có trong danh sách của chính nó');
    const total = E.totalPoints(words);
    ok(total <= E.MAX_SCORE, b + ': ' + total);
    max = Math.max(max, total);
    minWords = Math.min(minWords, words.length);
  });
  eq(max, E.MAX_SCORE, 'trần điểm');
  eq(E.MIN_WORDS, 25);
  ok(minWords >= 25, 'ít nhất 25 từ mỗi vòng, thấp nhất: ' + minWords);
});

test('game.json: max_score khớp trần điểm của engine, max_score_per_sec không chặn ván hợp lệ dài ≥ min_duration', () => {
  const rules = require('./game.json').server.modes[0].rules;
  eq(rules.max_score, E.MAX_SCORE);
  ok(rules.min_duration_ms <= E.ROUND_MS, 'min_duration_ms phải ≤ độ dài vòng');
  ok(rules.max_score_per_sec * (rules.min_duration_ms / 1000) >= E.MAX_SCORE, 'ván đạt trần ở đúng min_duration vẫn phải hợp lệ');
});

test('điểm theo độ dài: 3 = 100, 4 = 400, 5 = 1200, 6 = 2000, 7 = 3000', () => {
  eq(['cat', 'rate', 'stone', 'garden', 'planets'].map(E.pointsFor), [100, 400, 1200, 2000, 3000]);
});

test('wordsFor / canForm: chỉ từ ghép được (tính cả chữ lặp), dài trước rồi theo ABC', () => {
  const words = E.wordsFor('letters');
  ok(words.includes('letters') && words.includes('settle') && words.includes('test'), 'thiếu từ');
  ok(words.every((w) => E.canForm('letters', w)), 'có từ không ghép được');
  eq(E.canForm('letters', 'sett'), true, 'có 2 chữ t, 2 chữ e');
  eq(E.canForm('letters', 'less'), false, 'chỉ có 1 chữ s');
  eq(E.canForm('letters', 'tote'), false, 'không có chữ o');
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1];
    const b = words[i];
    ok(a.length > b.length || (a.length === b.length && a < b), 'sai thứ tự ' + a + ' ' + b);
  }
});

/* ---------------- Vòng mới ---------------- */
test('vòng mới tất định theo hạt giống, chữ là hoán vị của từ gốc và khác thứ tự từ gốc', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const a = E.newGame(seed);
    const b = E.newGame(seed);
    eq(a, b, 'seed ' + seed);
    ok(E.BASES.includes(a.base), a.base);
    eq(sorted(a.letters), sorted(a.base));
    ok(a.letters !== a.base, 'chữ chưa xáo: ' + a.letters);
    eq([a.found, a.score, a.t], [[], 0, 0]);
  }
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) seen.add(E.newGame(seed).base);
  ok(seen.size > 200, 'hạt giống khác nhau phải ra vòng khác nhau: ' + seen.size);
  ok(E.newGame(0xffffffff).base, 'hạt giống lớn nhất');
});

/* ---------------- Gửi từ ---------------- */
test('gửi từ hợp lệ: cộng điểm, ghi vào danh sách; gửi lại thì trùng, không cộng', () => {
  let g = E.newGame(42);
  const w4 = wordOf(g, 4);
  let r = E.submit(g, w4);
  eq([r.result.type, r.result.points], ['ok', 400]);
  g = r.game;
  eq([g.found, g.score], [[w4], 400]);
  r = E.submit(g, w4.toUpperCase());
  eq([r.result.type, r.result.points], ['dup', 0]);
  eq(r.game.score, 400);
  eq(r.game.found.length, 1);
});

test('gửi từ dùng hết chữ: result.all = true và điểm đầy đủ', () => {
  const g = E.newGame(7);
  const r = E.submit(g, g.base);
  eq([r.result.type, r.result.all, r.result.points], ['ok', true, E.pointsFor(g.base)]);
  eq(E.submit(g, wordOf(g, 3)).result.all, false);
});

test('gửi từ sai: ngắn, sai chữ, không phải từ, rỗng — không đổi ván', () => {
  const g = E.newGame(42);
  const missing = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !g.letters.includes(c));
  const cases = [
    ['', 'short'],
    [g.letters.slice(0, 2), 'short'],
    [missing + missing + missing, 'letters'],
    [g.letters + g.letters[0], 'letters'],
    [nonWord(g), 'invalid'],
    ['a1b', 'letters'],
    [null, 'short'],
  ];
  cases.forEach(([w, type]) => {
    const r = E.submit(g, w);
    eq(r.result.type, type, JSON.stringify(w));
    eq(r.result.points, 0);
    ok(r.game === g, 'ván phải giữ nguyên với ' + JSON.stringify(w));
  });
});

test('điểm cuối = tổng điểm các từ đã tìm; tìm hết thì bằng điểm tối đa của vòng', () => {
  let g = E.newGame(2026);
  const all = E.allWords(g);
  all.forEach((w) => { g = E.submit(g, w).game; });
  eq(g.score, E.roundMax(g));
  eq(g.score, E.totalPoints(all));
  eq(g.found.length, all.length);
  eq(E.missed(g), []);
  const h = E.submit(E.newGame(2026), all[all.length - 1]).game;
  eq(E.missed(h).length, all.length - 1);
});

/* ---------------- Đồng hồ ---------------- */
test('đồng hồ 90 giây: advance cộng dồn, chặn ở 90 s; hết giờ thì không gửi được nữa', () => {
  let g = E.newGame(5);
  eq([E.ROUND_MS, E.timeLeft(g), E.isOver(g)], [90000, 90000, false]);
  g = E.advance(g, 30000);
  eq([g.t, E.timeLeft(g)], [30000, 60000]);
  g = E.advance(g, -50);
  eq(g.t, 30000, 'thời gian âm bị bỏ qua');
  g = E.advance(g, 59999);
  eq(E.isOver(g), false);
  const w = wordOf(g, 3);
  g = E.advance(g, 5000);
  eq([g.t, E.timeLeft(g), E.isOver(g)], [90000, 0, true]);
  const r = E.submit(g, w);
  eq([r.result.type, r.game.score], ['over', 0]);
  ok(E.advance(g, 100) === g, 'hết giờ thì advance không đổi gì');
});

test('xáo chữ: giữ đúng bộ chữ, đổi thứ tự, không đụng điểm / giờ / từ đã tìm', () => {
  let g = E.newGame(11);
  g = E.submit(g, wordOf(g, 3)).game;
  g = E.advance(g, 1234);
  const rnd = E.rng(99);
  for (let i = 0; i < 50; i++) {
    const s = E.shuffle(g, rnd);
    eq(sorted(s.letters), sorted(g.letters));
    ok(s.letters !== g.letters, 'xáo phải đổi thứ tự');
    eq([s.found, s.score, s.t, s.base, s.seed], [g.found, g.score, g.t, g.base, g.seed]);
    g = s;
  }
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván', () => {
  let g = E.newGame(321);
  g = E.shuffle(g, E.rng(1));
  g = E.submit(g, wordOf(g, 4)).game;
  g = E.submit(g, wordOf(g, 3)).game;
  g = E.advance(g, 45678);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
});

test('lưu khi đồng hồ lẻ mili giây (rAF): làm tròn, vẫn khôi phục được', () => {
  const g = E.advance(E.newGame(77), 1234.567);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'phải khôi phục được');
  eq(back.t, 1235);
});

test('từ chối dữ liệu hỏng', () => {
  const g0 = E.newGame(321);
  const g = E.submit(g0, wordOf(g0, 3)).game;
  const good = E.toJSON(g);
  ok(E.fromJSON(good), 'bản tốt phải khôi phục được');
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { seed: 1.5 }),
    Object.assign({}, good, { base: 'zzzzzzz' }), // không khớp từ gốc của hạt giống
    Object.assign({}, good, { letters: good.letters.slice(1) + 'q' }),
    Object.assign({}, good, { letters: 123 }),
    Object.assign({}, good, { found: 'abc' }),
    Object.assign({}, good, { found: ['qqq'] }),
    Object.assign({}, good, { found: [good.found[0], good.found[0]] }),
    Object.assign({}, good, { t: -1 }),
    Object.assign({}, good, { t: 90001 }),
    Object.assign({}, good, { t: '5' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
