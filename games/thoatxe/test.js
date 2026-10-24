/* Kiểm tra engine Thoát Xe: chạy `node test.js`
 * - Đọc đề, luật trượt theo trục / chặn bởi xe khác / mép bàn, gộp nước, hoàn tác, thắng khi xe đỏ tới cửa
 * - BFS đúng số nước tối thiểu trên các đề tay biết trước đáp án; đề vô nghiệm
 * - Gợi ý luôn là nước trên một lời giải tối ưu
 * - Sinh đề tất định theo seed, đúng khoảng mức, giải được; bộ đề sinh sẵn đúng số nước tối thiểu (BFS)
 * - Đề hằng ngày tất định, không trùng trong một vòng
 * - Lưu / khôi phục ván + tiến độ bàn, từ chối dữ liệu hỏng
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

/** Đề viết theo 6 hàng cho dễ đọc. */
const P = (...rows) => rows.join('');

// Đề tay biết trước đáp án
const SOLVED = P('......', '......', '....AA', '......', '......', '......'); // 0 nước
const OPEN = P('......', '......', 'AA....', '......', '......', '......'); // 1 nước
const ONE_BLOCK = P('......', '...B..', 'AA.B..', '......', '......', '......'); // 2 nước: B xuống, A ra
const TRUCK = P('...B..', '...B..', 'AA.B..', '......', '......', '..CC..'); // 3 nước: C, B xuống, A
const CHAIN = P('....B.', '....B.', 'AA..B.', '..DCCE', '..D..E', '......'); // 4 nước: D, C trái, B xuống, A
const STUCK = P('....B.', '....B.', 'AA..B.', '....C.', '....C.', '....C.'); // vô nghiệm: hai xe tải chồng cột 4

const play = (puzzle) => E.newGame(puzzle, { level: 'easy', board: 0 });
/** Đi hết một lời giải (mảng [xe, vị trí]). */
const replay = (g, path) => path.reduce((x, m) => E.move(x, m[0], m[1]), g);

/* ---------------- Đọc đề ---------------- */

test('đọc đề: xe đỏ là xe 0, xe ngang / dọc, dài 2 / 3, vị trí ô đầu', () => {
  const p = E.parse(TRUCK);
  eq(p.cars.length, 3);
  eq(p.cars[0], { h: true, len: 2, fix: 2 });
  eq(p.start[0], 0);
  eq(p.cars[1], { h: false, len: 3, fix: 3 }); // B: dọc, cột 3
  eq(p.start[1], 0);
  eq(p.cars[2], { h: true, len: 2, fix: 5 }); // C: ngang, hàng 5
  eq(p.start[2], 2);
});

test('đọc rồi ghi lại cho cùng bàn (đổi tên xe theo thứ tự)', () => {
  const p = E.parse(CHAIN);
  const back = E.parse(E.format(p.cars, p.start));
  eq(back, p);
  eq(E.format(p.cars, p.start).replace(/[B-Z]/g, 'x'), CHAIN.replace(/[B-Z]/g, 'x'));
});

test('từ chối đề sai định dạng', () => {
  const bad = [
    null,
    123,
    OPEN.slice(1), // thiếu ô
    OPEN.replace('A', 'a'), // ký tự lạ
    P('......', '......', '..BB..', '......', '......', '......'), // thiếu xe đỏ
    P('A.....', 'A.....', '......', '......', '......', '......'), // xe đỏ dọc
    P('AA....', '......', '......', '......', '......', '......'), // xe đỏ sai hàng
    P('......', '......', 'AAA...', '......', '......', '......'), // xe đỏ dài 3
    P('......', '......', 'AA.B..', '......', '......', '......'), // xe dài 1
    P('...B..', '...B..', 'AA.B..', '...B..', '......', '......'), // xe dài 4
    P('......', '..BB..', 'AA.B..', '......', '......', '......'), // xe cong
    P('......', '......', 'AA..BB', '......', '......', '......'), // xe ngang khác trên hàng thoát
    P('......', '.....B', 'AAB...', '......', '......', '......'), // xe "ngang" vắt qua mép
    P('...B..', '......', 'AA.B..', '......', '......', '......'), // xe đứt đoạn
  ];
  bad.forEach((s) => eq(E.parse(s), null, JSON.stringify(s)));
});

/* ---------------- Luật trượt ---------------- */

test('xe chỉ trượt theo trục, dừng ở mép bàn và trước xe khác', () => {
  const g = play(CHAIN);
  const p = E.parse(CHAIN);
  // Thứ tự xe: A, B (dọc cột 4), D (dọc cột 2), C (ngang hàng 3), E (dọc cột 5)
  eq(p.cars.map((c) => (c.h ? 'h' : 'v') + c.len), ['h2', 'v3', 'v2', 'h2', 'v2']);
  eq(E.range(g, 0), [0, 2]); // A: phải tới cột 2 (chiếm cột 2..3, B ở cột 4)
  eq(E.range(g, 1), [0, 0]); // B: trên là mép, dưới là C
  eq(E.range(g, 2), [0, 4]); // D: lên tới hàng 0, xuống tới hàng 4
  eq(E.range(g, 3), [3, 3]); // C: kẹt giữa D và E
  eq(E.range(g, 4), [0, 4]);
});

test('nước sai luật trả nguyên ván (nhảy qua xe, ra khỏi bàn, sai xe, không đổi chỗ)', () => {
  const g = play(CHAIN);
  [[0, 3], [0, 4], [1, 1], [3, 1], [3, 4], [2, 5], [2, -1], [9, 0], [-1, 0], [0, 0], [0, 1.5], ['0', 1]].forEach(([i, to]) => {
    ok(E.move(g, i, to) === g, 'nước ' + i + '→' + to);
  });
});

test('trượt nhiều ô là một nước; trượt liền cùng xe được gộp, về chỗ cũ thì như chưa đi', () => {
  let g = play(CHAIN);
  g = E.move(g, 2, 0); // D lên hàng 0..1
  eq(E.moveCount(g), 1);
  g = E.move(g, 2, 4); // D xuống hẳn hàng 4..5: vẫn là một nước (cùng xe, liền nhau)
  eq([E.moveCount(g), g.pos[2], g.hist], [1, 4, [[2, 3, 4]]]);
  g = E.move(g, 3, 1); // C sang trái
  eq(E.moveCount(g), 2);
  g = E.move(g, 3, 2);
  g = E.move(g, 3, 3); // C về chỗ cũ: bỏ nước đó
  eq([E.moveCount(g), g.pos[3]], [1, 3]);
});

test('ván không đổi khi đi (hàm thuần)', () => {
  const g = play(ONE_BLOCK);
  const before = JSON.stringify(E.toJSON(g));
  E.move(g, 1, 3);
  eq(JSON.stringify(E.toJSON(g)), before);
});

test('thắng khi xe đỏ tới cột 4; đã thắng thì không đi thêm', () => {
  let g = play(ONE_BLOCK);
  ok(!E.isWon(g));
  g = E.move(g, 1, 3); // B xuống hàng 3..4
  ok(!E.isWon(g));
  g = E.move(g, 0, 3);
  ok(!E.isWon(g), 'cột 3 chưa tới cửa');
  g = E.move(g, 0, 4);
  ok(E.isWon(g));
  eq(E.moveCount(g), 2); // A trượt hai lần liền: một nước
  ok(E.move(g, 1, 0) === g);
  ok(E.isWon(play(SOLVED)));
});

test('hoàn tác lùi đúng một nước (cả cú trượt đã gộp); hết nước thì không đổi', () => {
  let g = play(CHAIN);
  g = E.move(g, 2, 4);
  g = E.move(g, 3, 2);
  g = E.move(g, 3, 1);
  g = E.undo(g);
  eq([g.pos, E.moveCount(g)], [[0, 0, 4, 3, 3], 1]);
  g = E.undo(g);
  eq([g.pos, E.moveCount(g)], [E.parse(CHAIN).start, 0]);
  ok(E.undo(g) === g);
});

/* ---------------- BFS ---------------- */

test('BFS: số nước tối thiểu đúng trên các đề tay', () => {
  [[SOLVED, 0], [OPEN, 1], [ONE_BLOCK, 2], [TRUCK, 3], [CHAIN, 4]].forEach(([s, n]) => {
    const p = E.parse(s);
    const r = E.solve(p.cars, p.start);
    eq(r.min, n, s);
    eq(r.path.length, n);
    const g = replay(play(s), r.path);
    ok(E.isWon(g), 'đi theo lời giải phải thắng');
    eq(E.moveCount(g), n);
  });
});

test('BFS: đề vô nghiệm trả null, newGame từ chối', () => {
  const p = E.parse(STUCK);
  eq(E.solve(p.cars, p.start), null);
  let threw = false;
  try {
    play(STUCK);
  } catch (e) {
    threw = true;
  }
  ok(threw);
});

test('BFS khớp phân tích cả cụm (BFS ngược từ thế giải) trên đề sinh', () => {
  for (let s = 0; s < 6; s++) {
    const r = E.generate('khop-' + s, [6, 14]);
    const p = E.parse(r.puzzle);
    const a = E.analyze(p.cars, p.start);
    eq(a.dist[0], r.min);
    eq(E.solve(p.cars, p.start).min, r.min);
  }
});

/* ---------------- Gợi ý ---------------- */

test('gợi ý là nước trên lời giải tối ưu (kể cả sau nước đi lệch); đi theo gợi ý tới thắng đúng số tối thiểu', () => {
  [['easy', 3], ['medium', 7], ['hard', 0]].forEach(([lv, n]) => {
    const b = E.boardPuzzle(lv, n);
    let g = E.newGame(b.puzzle, { level: lv, board: n }, b.min);
    // Đi lệch một nước ngẫu nhiên hợp lệ (không phải xe đỏ) rồi mới nhờ gợi ý
    const p = E.parse(b.puzzle);
    const wrong = E.movesOf(p.cars, g.pos).find((m) => m[0] !== 0);
    g = E.move(g, wrong[0], wrong[1]);
    const left = E.solve(g.cars, g.pos).min;
    let steps = 0;
    while (!E.isWon(g)) {
      const h = E.hint(g);
      const before = E.solve(g.cars, g.pos).min;
      g = E.move(g, h[0], h[1]);
      eq(E.solve(g.cars, g.pos).min, before - 1, lv + ' gợi ý phải bớt đúng một nước còn lại');
      steps++;
      ok(steps <= 80, 'quá nhiều bước');
    }
    eq(steps, left);
  });
  eq(E.hint(play(SOLVED)), null);
});

/* ---------------- Sinh đề ---------------- */

test('sinh đề tất định theo seed, đúng khoảng mức và giải được', () => {
  ['easy', 'medium'].forEach((lv) => {
    const [lo, hi] = E.BANDS[lv];
    for (let s = 0; s < 4; s++) {
      const a = E.generate(lv + '-test-' + s, lv);
      const b = E.generate(lv + '-test-' + s, lv);
      eq(a, b, 'cùng seed');
      ok(a.min >= lo && a.min <= hi, lv + ' ' + a.min);
      const p = E.parse(a.puzzle);
      ok(p, 'đề sinh đọc được');
      eq(E.solve(p.cars, p.start).min, a.min);
    }
  });
  ok(E.generate('x1', 'easy').puzzle !== E.generate('x2', 'easy').puzzle, 'seed khác thường ra đề khác');
});

test('PRNG: cùng seed cùng dãy, seed chuỗi băm ổn định', () => {
  const a = E.makeRng('2026-10-24');
  const b = E.makeRng('2026-10-24');
  eq([a(), a(), a.int(10)], [b(), b(), b.int(10)]);
  eq(E.hashString('thoatxe'), E.hashString('thoatxe'));
});

/** Đề thứ i trong vòng xoay đề hằng ngày (đọc thẳng từ puzzles.js). */
function dailyAt(i) {
  const [puzzle, min] = require('./puzzles.js').daily[i].split(':');
  return { puzzle, min: Number(min) };
}

test('bộ đề sinh sẵn: 60 bàn mỗi mức, đúng khoảng, xếp tăng dần, không trùng, BFS đúng số nước tối thiểu', () => {
  const all = new Set();
  const t0 = Date.now();
  let slowest = 0;
  ['easy', 'medium', 'hard', 'daily'].forEach((lv) => {
    const n = lv === 'daily' ? 120 : 60;
    const [lo, hi] = E.BANDS[lv];
    const list = [];
    for (let i = 0; i < n; i++) {
      const b = lv === 'daily' ? dailyAt(i) : E.boardPuzzle(lv, i);
      ok(b, lv + ' bàn ' + i);
      const p = E.parse(b.puzzle);
      ok(p, lv + ' ' + i + ' đọc được');
      const t = Date.now();
      const r = E.solve(p.cars, p.start);
      slowest = Math.max(slowest, Date.now() - t);
      ok(r, lv + ' ' + i + ' giải được');
      eq(r.min, b.min, lv + ' bàn ' + i + ' số nước tối thiểu');
      ok(b.min >= lo && b.min <= hi, lv + ' ' + i + ': ' + b.min + ' ngoài khoảng');
      ok(!all.has(b.puzzle), 'trùng đề ' + b.puzzle);
      all.add(b.puzzle);
      list.push(b.min);
    }
    if (lv !== 'daily') {
      eq(E.boardCount(lv), n);
      eq(list.slice().sort((a, b) => a - b), list, lv + ' xếp tăng dần');
    }
  });
  eq(E.boardPuzzle('easy', 60), null);
  eq(E.boardPuzzle('nope', 0), null);
  console.log('       (giải 300 đề mất ' + (Date.now() - t0) + ' ms, đề chậm nhất ' + slowest + ' ms)');
});

/* ---------------- Đề hằng ngày ---------------- */

test('đề hằng ngày: tất định theo ngày, không trùng trong một vòng 120 ngày, đúng khoảng', () => {
  eq(E.dailyPuzzle('2026-10-24'), E.dailyPuzzle('2026-10-24'));
  const seen = new Set();
  for (let d = 0; d < 120; d++) {
    const key = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
    const x = E.dailyPuzzle(key);
    eq(x.no, d + 1);
    ok(x.min >= E.BANDS.daily[0] && x.min <= E.BANDS.daily[1]);
    seen.add(x.puzzle);
  }
  eq(seen.size, 120);
  eq(E.dailyPuzzle('24/10/2026'), null);
  eq(E.dayIndex('2026-01-02'), 1);
});

/* ---------------- Sao + tiến độ ---------------- */

test('sao theo số nước: tối ưu 3, ≤ 1,5 lần 2, còn lại 1', () => {
  eq([E.stars(10, 10), E.stars(11, 10), E.stars(15, 10), E.stars(16, 10), E.stars(5, 5), E.stars(8, 5), E.stars(9, 5)], [3, 2, 2, 1, 3, 2, 1]);
});

test('tiến độ bàn: mở bàn đã giải + bàn chưa giải đầu tiên; giữ kết quả tốt nhất; gợi ý chỉ 1 sao', () => {
  let s = E.cleanStats(null);
  ok(E.isUnlocked(s, 'easy', 0) && !E.isUnlocked(s, 'easy', 1));
  eq(E.frontier(s, 'hard'), 0);
  s = E.recordWin(s, 'easy', 0, 10, 6, false);
  eq(s.best.easy[0], { m: 10, s: 1 });
  ok(E.isUnlocked(s, 'easy', 1) && !E.isUnlocked(s, 'easy', 2));
  s = E.recordWin(s, 'easy', 0, 6, 6, false);
  eq(s.best.easy[0], { m: 6, s: 3 });
  s = E.recordWin(s, 'easy', 0, 6, 6, true); // dùng gợi ý: không hạ kết quả cũ
  eq(s.best.easy[0], { m: 6, s: 3 });
  s = E.recordWin(s, 'easy', 1, 5, 5, true);
  eq(s.best.easy[1], { m: 5, s: 1 });
  eq([s.played, s.won, s.moves], [4, 4, 27]);
  eq(E.levelStars(s, 'easy'), { got: 4, max: 180 });
  eq(E.frontier(s, 'easy'), 2);
  s = E.recordWin(s, 'daily', '2026-10-23', 15, 15, false);
  s = E.recordWin(s, 'daily', '2026-10-24', 20, 15, false);
  eq(s.daily['2026-10-24'], { m: 20, s: 2, a: false });
  eq([E.dailyStreak(s, '2026-10-24'), E.dailyStreak(s, '2026-10-25'), E.dailyStreak(s, '2026-10-26')], [2, 2, 0]);
});

test('tiến độ: lưu rồi đọc lại giữ nguyên; mục hỏng bị bỏ', () => {
  let s = E.cleanStats({});
  s = E.recordWin(s, 'medium', 4, 20, 14, false);
  s.current = { level: 'medium', board: 5 };
  eq(E.cleanStats(JSON.parse(JSON.stringify(s))), s);
  const dirty = E.cleanStats({
    played: -3, won: 'x', moves: 1.5,
    best: { easy: { 0: { m: 5, s: 3 }, 1: { m: 0, s: 3 }, 2: { m: 5, s: 4 }, 999: { m: 5, s: 1 }, x: { m: 5, s: 1 } }, hard: 'bad' },
    current: { level: 'hard', board: 99 },
    daily: { '2026-10-24': { m: 12, s: 2 }, 'hôm nay': { m: 1, s: 1 }, '2026-10-25': { m: -1, s: 1 } },
  });
  eq(dirty.played, 0);
  eq(dirty.best.easy, { 0: { m: 5, s: 3 } });
  eq(dirty.best.hard, {});
  eq(dirty.current, { level: 'easy', board: 0 });
  eq(dirty.daily, { '2026-10-24': { m: 12, s: 2, a: false } });
});

/* ---------------- Lưu / khôi phục ván ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (nước đi, cờ gợi ý)', () => {
  const b = E.boardPuzzle('medium', 2);
  let g = E.newGame(b.puzzle, { level: 'medium', board: 2 }, b.min);
  const ms = E.movesOf(g.cars, g.pos);
  g = E.move(g, ms[0][0], ms[0][1]);
  const h = E.hint(g);
  g = E.move(g, h[0], h[1]);
  g.assisted = true;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.pos, g.pos);
  const d = E.dailyPuzzle('2026-10-24');
  const gd = E.newGame(d.puzzle, { level: 'daily', board: '2026-10-24' }, d.min);
  eq(E.toJSON(E.fromJSON(E.toJSON(gd))), E.toJSON(gd));
});

test('từ chối ván lưu hỏng', () => {
  const b = E.boardPuzzle('easy', 5);
  let g = E.newGame(b.puzzle, { level: 'easy', board: 5 }, b.min);
  const m = E.movesOf(g.cars, g.pos)[0];
  g = E.move(g, m[0], m[1]);
  const good = E.toJSON(g);
  ok(E.fromJSON(good), 'ván tốt phải đọc được');
  const mut = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  // Lời giải đầy đủ của bàn: dùng để dựng ván đã thắng
  const sol = E.solve(E.parse(b.puzzle).cars, E.parse(b.puzzle).start).path;
  const hist = [];
  let x = E.newGame(b.puzzle, { level: 'easy', board: 5 }, b.min);
  sol.forEach((s) => { const n = E.move(x, s[0], s[1]); hist.push(n.hist[n.hist.length - 1]); x = n; });
  [
    null, 1, 'x', {},
    mut({ v: 2 }),
    mut({ level: 'insane' }),
    mut({ board: -1 }),
    mut({ board: 1.5 }),
    mut({ board: 6 }), // đề không khớp bàn 6
    mut({ level: 'daily', board: '2026-10-24' }), // đề không khớp đề ngày
    mut({ board: 999 }),
    mut({ puzzle: b.puzzle.slice(1) + '.' }),
    mut({ min: b.min + 1 }),
    mut({ hist: 'abc' }),
    mut({ hist: [[0, 0]] }),
    mut({ hist: [[good.hist[0][0], good.hist[0][1] + 1, good.hist[0][2]]] }), // sai vị trí cũ
    mut({ hist: [[good.hist[0][0], good.hist[0][1], 9]] }), // ra khỏi bàn
    mut({ hist: [[99, 0, 1]] }),
    mut({ hist: hist.concat([hist[0]]) }), // còn nước sau khi đã thắng
    mut({ assisted: 'yes' }),
  ].forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu ' + k));
  const finished = E.fromJSON(mut({ hist }));
  ok(finished && E.isWon(finished), 'ván đã thắng vẫn đọc được');
});

/* ---------------- Tốc độ (ghi vào README) ---------------- */

test('tốc độ: gợi ý trên bàn Khó khó nhất', () => {
  const n = E.boardCount('hard') - 1;
  const b = E.boardPuzzle('hard', n);
  const g = E.newGame(b.puzzle, { level: 'hard', board: n }, b.min);
  const t = process.hrtime.bigint();
  const h = E.hint(g);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  ok(h);
  console.log('       (gợi ý bàn Khó ' + (n + 1) + ', ' + b.min + ' nước: ' + ms.toFixed(1) + ' ms)');
  ok(ms < 300, 'gợi ý quá chậm');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
