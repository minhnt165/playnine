/* Kiểm tra engine Nhớ Nhịp: chạy `node test.js`
 * - Chuỗi tất định theo hạt giống, tiền tố giữ nguyên, không ba bước trùng liền nhau
 * - Lịch phát nhanh dần nhưng không quá 3 lần sáng / giây (an toàn động kinh)
 * - Luật: máy phát → tới lượt → bấm đúng hết chuỗi được điểm, sang vòng dài hơn; bấm sai hết ván
 * - Bot bấm đúng chơi được tới vòng 25 ở cả hai mode; điểm không tăng nhanh hơn máy phát
 * - Ngưỡng chống gian lận trong game.json khớp với engine (biên ×2)
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');
const manifest = require('./game.json');

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

/** Tiến giờ tới lúc tới lượt người chơi; trả về ván và mọi sự kiện đã phát. */
function toTurn(g, step = 10) {
  const events = [];
  let guard = 0;
  while (g.phase === 'show') {
    const r = E.advance(g, step);
    g = r.game;
    events.push(...r.events);
    if (++guard > 100000) throw new Error('không tới lượt');
  }
  return { game: g, events };
}

/** Bấm đúng cả chuỗi của vòng hiện tại, mỗi lần bấm cách nhau gapMs. */
function playRound(g, gapMs = 0) {
  const n = g.n;
  for (let i = 0; i < n; i++) {
    if (gapMs) g = E.advance(g, gapMs).game;
    const r = E.press(g, g.seq[i]);
    g = r.game;
    eq(r.result.type, i === n - 1 ? 'round' : 'ok', 'bước ' + i);
  }
  return g;
}

/* ---------------- Chuỗi ---------------- */

test('chuỗi tất định theo hạt giống, khác hạt giống thì khác chuỗi', () => {
  eq(E.sequence(12345, 4, 30), E.sequence(12345, 4, 30));
  ok(JSON.stringify(E.sequence(1, 4, 30)) !== JSON.stringify(E.sequence(2, 4, 30)), 'hạt giống 1 và 2 ra cùng chuỗi');
  // Khóa kết quả: đổi thuật toán là vỡ ván lưu (ván lưu chỉ giữ hạt giống)
  eq(E.sequence(12345, 4, 12), [3, 1, 1, 3, 2, 1, 0, 3, 3, 1, 3, 3]);
  eq(E.sequence(12345, 6, 12), [5, 1, 2, 4, 3, 2, 0, 4, 5, 4, 2, 5]);
  eq(E.sequence(42, 4, 10).length, 10);
});

test('chuỗi dài hơn giữ nguyên các bước đầu (vòng sau chỉ nối thêm một bước)', () => {
  for (const pads of [4, 6]) {
    for (let seed = 0; seed < 50; seed++) {
      const long = E.sequence(seed, pads, 60);
      for (const n of [1, 2, 7, 33]) eq(E.sequence(seed, pads, n), long.slice(0, n), 'seed ' + seed + ' n ' + n);
    }
  }
});

test('mọi bước nằm trong 0..ô−1, đủ mọi ô, không ba bước trùng liền nhau', () => {
  for (const pads of [4, 6]) {
    const count = new Array(pads).fill(0);
    for (let seed = 0; seed < 300; seed++) {
      const s = E.sequence(seed * 7919 + 13, pads, 80);
      s.forEach((x, i) => {
        ok(Number.isInteger(x) && x >= 0 && x < pads, 'ô lạ ' + x);
        count[x]++;
        if (i >= 2) ok(!(s[i] === s[i - 1] && s[i] === s[i - 2]), 'ba bước trùng ở seed ' + seed);
      });
    }
    const avg = (300 * 80) / pads;
    count.forEach((c, p) => ok(c > avg * 0.85 && c < avg * 1.15, 'ô ' + p + ' lệch: ' + c + ' / ' + avg));
  }
});

/* ---------------- Lịch phát ---------------- */

test('nhanh dần theo vòng nhưng chu kỳ không dưới 340 ms (≤ 3 lần sáng / giây)', () => {
  for (const mode of E.MODE_KEYS) {
    let prev = Infinity;
    for (let n = 1; n <= 500; n++) {
      const tm = E.timing(mode, n);
      ok(tm.period >= E.MIN_PERIOD, mode + ' vòng ' + n + ': chu kỳ ' + tm.period);
      ok(1000 / tm.period <= 3, mode + ' vòng ' + n + ': quá 3 lần / giây');
      ok(tm.period <= prev, mode + ' vòng ' + n + ' chậm lại');
      ok(tm.on >= 200 && tm.gap >= 100, mode + ' vòng ' + n + ': sáng / tắt quá ngắn');
      prev = tm.period;
    }
    ok(E.timing(mode, 20).period < E.timing(mode, 1).period, mode + ' không nhanh dần');
  }
  ok(E.timing('hard', 1).period < E.timing('classic', 1).period, 'mức khó phải nhanh hơn');
  ok(E.timing('hard', 30).period <= E.timing('classic', 30).period, 'mức khó phải nhanh hơn (vòng cao)');
});

test('mode cổ điển 4 ô, mode khó 6 ô', () => {
  eq([E.MODES.classic.pads, E.MODES.hard.pads], [4, 6]);
  eq(E.padCount(E.newGame('hard', 1)), 6);
  let threw = false;
  try {
    E.newGame('nope', 1);
  } catch (e) {
    threw = true;
  }
  ok(threw, 'mode lạ phải ném lỗi');
});

/* ---------------- Luật ---------------- */

test('ván mới: máy phát chuỗi 1 bước, chưa có điểm, bấm lúc máy phát bị bỏ qua', () => {
  const g = E.newGame('classic', 7);
  eq([g.phase, g.score, g.n, g.seq.length, g.t], ['show', 0, 1, 1, 0]);
  eq(E.press(g, g.seq[0]).result.type, 'ignored');
  eq(E.press(g, g.seq[0]).game, g);
});

test('nốt phát đúng lịch, ô sáng đúng lúc, phát xong thì tới lượt', () => {
  let g = E.newGame('classic', 99);
  // Lên vòng 3 để có 3 nốt
  g = playRound(toTurn(g).game);
  g = playRound(toTurn(g).game);
  eq([g.score, g.n, g.phase], [2, 3, 'show']);
  const tm = E.timing('classic', 3);
  const startAt = g.showAt;
  const seen = [];
  const lit = [];
  while (g.phase === 'show') {
    const r = E.advance(g, 5);
    g = r.game;
    r.events.forEach((ev) => seen.push([ev.type, ev.type === 'note' ? ev.pad : null, g.t]));
    lit.push([g.t, E.litPad(g)]);
  }
  eq(seen.map((x) => x[0]), ['note', 'note', 'note', 'turn']);
  eq(seen.slice(0, 3).map((x) => x[1]), g.seq.slice(0, 3));
  seen.slice(0, 3).forEach((x, i) => eq(x[2], startAt + i * tm.period, 'nốt ' + i));
  eq(seen[3][2], startAt + 2 * tm.period + tm.on);
  // Giữa nốt thứ 2 ô đúng sáng, trong khoảng nghỉ không ô nào sáng
  const at = (time) => lit.find((x) => x[0] === time)[1];
  eq(at(startAt + tm.period + 100), g.seq[1]);
  eq(at(startAt + tm.on + 10), -1);
  eq([g.phase, g.pos, E.litPad(g)], ['input', 0, -1]);
});

test('advance nhảy cóc vẫn phát đủ nốt theo thứ tự', () => {
  let g = E.newGame('hard', 5);
  for (let i = 0; i < 4; i++) g = playRound(toTurn(g).game);
  const r = E.advance(g, 60000);
  eq(r.events.filter((e) => e.type === 'note').map((e) => e.pad), g.seq);
  eq(r.events[r.events.length - 1].type, 'turn');
  eq(r.game.phase, 'input');
});

test('bấm đúng hết chuỗi: được điểm bằng độ dài chuỗi, vòng sau dài thêm một bước, giữ các bước cũ', () => {
  let g = toTurn(E.newGame('classic', 2024)).game;
  const first = g.seq.slice();
  const r = E.press(g, g.seq[0]);
  eq(r.result, { type: 'round', pad: first[0], score: 1 });
  g = r.game;
  eq([g.score, g.n, g.phase, g.pos], [1, 2, 'show', 0]);
  eq(g.seq.slice(0, 1), first);
  eq(g.showAt, g.t + E.MODES.classic.pause);
  g = toTurn(g).game;
  let x = E.press(g, g.seq[0]);
  eq([x.result.type, x.game.pos, x.game.score], ['ok', 1, 1]);
  x = E.press(x.game, g.seq[1]);
  eq([x.result.type, x.game.score, x.game.n], ['round', 2, 3]);
});

test('bấm sai là hết ván, báo ô đúng; sau đó mọi thao tác không đổi gì', () => {
  let g = toTurn(E.newGame('classic', 3)).game;
  g = playRound(g);
  g = toTurn(g).game;
  const right = g.seq[0];
  const wrong = (right + 1) % 4;
  const r = E.press(g, wrong);
  eq(r.result, { type: 'wrong', pad: wrong, expected: right });
  eq([r.game.phase, r.game.score, E.isOver(r.game)], ['over', 1, true]);
  eq(r.game.wrong, { pad: wrong, expected: right, at: 0 });
  eq(E.press(r.game, right).result.type, 'ignored');
  eq(E.advance(r.game, 1000).game, r.game);
  eq(E.replay(r.game), r.game);
});

test('sai ở giữa chuỗi vẫn giữ điểm của vòng trước', () => {
  let g = E.newGame('hard', 77);
  for (let i = 0; i < 5; i++) g = playRound(toTurn(g).game);
  g = toTurn(g).game;
  eq(g.n, 6);
  g = E.press(g, g.seq[0]).game;
  g = E.press(g, g.seq[1]).game;
  const r = E.press(g, (g.seq[2] + 3) % 6);
  eq([r.result.type, r.game.score], ['wrong', 5]);
});

test('bấm ô không tồn tại bị bỏ qua', () => {
  const g = toTurn(E.newGame('classic', 1)).game;
  [-1, 4, 6, 1.5, '0', null].forEach((p) => eq(E.press(g, p).result.type, 'ignored', String(p)));
  ok(E.press(toTurn(E.newGame('hard', 1)).game, 5).result.type !== 'ignored', 'ô 5 của mức khó phải bấm được');
});

test('bot bấm đúng chơi được tới vòng 25 ở cả hai mode, nhiều hạt giống', () => {
  for (const mode of E.MODE_KEYS) {
    for (let seed = 1; seed <= 40; seed++) {
      let g = E.newGame(mode, seed * 2654435761);
      for (let i = 0; i < 25; i++) g = playRound(toTurn(g).game, 150);
      eq(g.score, 25, mode + ' seed ' + seed);
      ok(g.t >= E.minTimeForScore(mode, 25), 'đạt điểm nhanh hơn máy phát');
    }
  }
});

test('điểm không tăng nhanh hơn máy phát: bấm tức thì vẫn đúng bằng minTimeForScore', () => {
  for (const mode of E.MODE_KEYS) {
    let g = E.newGame(mode, 11);
    for (let s = 1; s <= 30; s++) {
      g = toTurn(g, 1).game;
      g = playRound(g, 0);
      eq(g.score, s);
      eq(g.t, E.minTimeForScore(mode, s), mode + ' điểm ' + s);
    }
  }
});

test('phát lại: vòng hiện tại phát lại từ đầu, nhập lại từ bước đầu, không mất điểm', () => {
  let g = E.newGame('classic', 8);
  for (let i = 0; i < 3; i++) g = playRound(toTurn(g).game);
  g = toTurn(g).game;
  g = E.press(g, g.seq[0]).game;
  eq(g.pos, 1);
  const r = E.replay(g);
  eq([r.phase, r.pos, r.score, r.n, r.showAt], ['show', 0, 3, 4, g.t + E.MODES.classic.lead]);
  const back = toTurn(r);
  eq(back.events.filter((e) => e.type === 'note').map((e) => e.pad), g.seq);
  eq(playRound(back.game).score, 4);
});

/* ---------------- Ngưỡng chống gian lận trong game.json ---------------- */

test('game.json: score_high, mode classic + hard, ngưỡng khớp engine với biên ×2', () => {
  const s = manifest.server;
  eq([s.metric, s.modes.map((m) => m.key)], ['score_high', ['classic', 'hard']]);
  for (const m of s.modes) {
    const r = m.rules;
    // Không từ chối ván thật nào: lần bấm sớm nhất có thể là lúc nốt đầu tắt
    const earliest = E.MODES[m.key].lead + E.timing(m.key, 1).on;
    ok(r.min_duration_ms > 0 && r.min_duration_ms <= earliest, m.key + ': min_duration_ms ' + r.min_duration_ms + ' > ' + earliest);
    const cap = E.maxScorePerSec(m.key, r.min_duration_ms);
    ok(r.max_score_per_sec >= 2 * cap, m.key + ': max_score_per_sec ' + r.max_score_per_sec + ' < 2 × ' + cap.toFixed(3));
    ok(r.max_score_per_sec <= 2 * cap + 0.1, m.key + ': max_score_per_sec quá rộng so với 2 × ' + cap.toFixed(3));
    ok(!('max_score' in r), m.key + ': điểm không có trần');
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục: cùng mode, hạt giống, giờ, điểm; phát lại vòng đang dở', () => {
  let g = E.newGame('hard', 31337);
  for (let i = 0; i < 4; i++) g = playRound(toTurn(g).game, 200);
  g = toTurn(g).game;
  g = E.press(g, g.seq[0]).game;
  const raw = JSON.parse(JSON.stringify(E.toJSON(g)));
  eq(raw, { v: 1, mode: 'hard', seed: 31337, t: g.t, score: 4 });
  const back = E.fromJSON(raw);
  eq([back.mode, back.seed, back.t, back.score, back.n, back.phase, back.pos], ['hard', 31337, g.t, 4, 5, 'show', 0]);
  eq(back.seq, g.seq);
  eq(back.showAt, g.t + E.MODES.hard.lead);
  eq(playRound(toTurn(back).game).score, 5);
});

test('khôi phục ván mới chưa có điểm', () => {
  const g = E.advance(E.newGame('classic', 5), 300).game;
  const back = E.fromJSON(E.toJSON(g));
  eq([back.score, back.t, back.phase], [0, 300, 'show']);
});

test('từ chối dữ liệu hỏng', () => {
  const good = { v: 1, mode: 'classic', seed: 5, t: 20000, score: 3 };
  ok(E.fromJSON(good), 'ván lưu tốt bị từ chối');
  [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { mode: 'easy' }),
    Object.assign({}, good, { mode: 'toString' }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { seed: 2 ** 32 }),
    Object.assign({}, good, { seed: '5' }),
    Object.assign({}, good, { t: -5 }),
    Object.assign({}, good, { t: 1.5 }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: 2.5 }),
    Object.assign({}, good, { score: '3' }),
    // Điểm 3 cần ít nhất minTimeForScore('classic', 3) ms
    Object.assign({}, good, { t: 1000 }),
    Object.assign({}, good, { score: 50 }),
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
