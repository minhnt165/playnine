/* Kiểm tra engine Vệt Sáng: chạy `node test.js`
 * - Đếm ngược, di chuyển theo ô, tốc độ tăng dần có trần, hàng đợi rẽ (không mất phím khi bấm nhanh)
 * - Đâm tường / vệt là thua hiệp, đâm đầu cùng lúc là hòa (hiệp đấu lại), ai thắng 3 hiệp trước thắng trận
 * - Máy: Dễ tránh ô ngay trước mặt, Vừa chọn vùng trống lớn nhất, Khó tránh ô đối thủ có thể lao vào; mức cao thắng mức thấp
 * - Tất định theo seed + chuỗi input; step không sửa trạng thái cũ; trận thắng nhanh nhất vẫn dài hơn min_duration_ms
 * - Lưu / khôi phục ván từ JSON (kể cả giữa hiệp) và từ chối dữ liệu hỏng
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
function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'điều kiện sai');
}

const [UP, RIGHT, DOWN, LEFT] = [0, 1, 2, 3];
const json = (s) => JSON.stringify(E.toJSON(s));

/** Chạy hết đếm ngược: trả trạng thái đầu pha play. */
function toPlay(s) {
  while (s.phase === 'countdown') s = E.step(s);
  return s;
}
/** Chạy tới bước có nước đi trên lưới (một tick); trả trạng thái sau tick. */
function nextTick(s, opts) {
  const t0 = s.ticks;
  for (let i = 0; i < 1000; i++) {
    s = E.step(s, opts);
    if (s.ticks !== t0 || s.phase !== 'play') return s;
  }
  throw new Error('không có tick');
}
/** Chạy tới khi có sự kiện `type`; trả { s, ev, steps }. */
function runUntil(s, type, max, opts) {
  for (let i = 1; i <= (max || 200000); i++) {
    s = E.step(s, opts);
    const ev = s.events.find((e) => e.type === type);
    if (ev) return { s, ev, steps: i };
  }
  throw new Error('không thấy sự kiện ' + type);
}

/**
 * Dựng ván đang chơi: a = [x, y, hướng] của người chơi, b = của máy, walls = các ô vệt có sẵn [[x, y], ...]
 * (gắn thẳng vào lưới, chỉ dùng trong test). Mặc định người chơi ở (10, 30) đi lên, máy ở (30, 10) đi xuống.
 */
function setup(o) {
  const s = toPlay(E.newGame({ level: o.level || 'medium', seed: o.seed || 1 }));
  const raw = E.toJSON(s);
  const a = o.a || [10, 30, UP];
  const b = o.b || [30, 10, DOWN];
  raw.bikes = [a, b].map((p) => ({ x: p[0], y: p[1], dir: p[2], alive: true, path: [p[0], p[1]] }));
  raw.hist = [[a.slice()], [b.slice()]];
  raw.queue = [];
  raw.ticks = 0;
  if (o.score) raw.score = o.score.slice();
  const g = E.fromJSON(raw);
  if (!g) throw new Error('ván dựng không hợp lệ');
  (o.walls || []).forEach((p) => {
    g.grid[p[0] + p[1] * E.W] = 2;
  });
  return g;
}
/** Dãy ô vệt ngang (y cố định, x0..x1) hoặc dọc. */
const hline = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
const vline = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i]);

/* ===================== Ván mới, đếm ngược, di chuyển ===================== */

test('ván mới: đếm ngược, hai xe đối xứng tâm, mỗi xe chiếm một ô', () => {
  const s = E.newGame({ level: 'easy', seed: 7 });
  eq([s.phase, s.score, s.started, s.winner, s.round], ['countdown', [0, 0], false, null, 1]);
  const [a, b] = s.bikes;
  eq([b.x, b.y], [E.W - 1 - a.x, E.H - 1 - a.y], 'đối xứng');
  eq([a.dir, b.dir], [UP, DOWN]);
  eq(Array.from(s.grid).filter((v) => v).length, 2);
});

test('đếm ngược 3-2-1 rồi chạy, ván tính là đã bắt đầu', () => {
  let s = E.newGame({ level: 'easy', seed: 1 });
  const counts = [];
  let steps = 0;
  while (s.phase === 'countdown') {
    s = E.step(s);
    steps++;
    s.events.forEach((e) => e.type === 'count' && counts.push(e.n));
  }
  eq(counts, [3, 2, 1]);
  eq(steps, E.COUNTDOWN);
  eq([s.phase, s.started], ['play', true]);
  ok(s.events.some((e) => e.type === 'go'));
});

test('mỗi tick xe đi đúng một ô theo hướng, để lại vệt', () => {
  let s = toPlay(E.newGame({ level: 'easy', seed: 3 }));
  const a0 = { x: s.bikes[0].x, y: s.bikes[0].y };
  s = nextTick(s);
  eq([s.bikes[0].x, s.bikes[0].y], [a0.x, a0.y - 1]);
  eq(s.grid[a0.x + a0.y * E.W], 1, 'ô cũ thành vệt');
  eq(s.grid[a0.x + (a0.y - 1) * E.W], 1, 'đầu xe cũng là vệt');
  eq(s.ticks, 1);
});

test('tick đầu tiên sau 1/8 giây (tốc độ đầu 8 ô/giây)', () => {
  let s = toPlay(E.newGame({ level: 'easy', seed: 3 }));
  let n = 0;
  while (s.ticks === 0) {
    s = E.step(s);
    n++;
  }
  eq(n, 15);
});

test('tốc độ tăng dần theo thời gian của hiệp và có trần', () => {
  eq(E.speedAt(0), E.SPEED0);
  ok(E.speedAt(E.HZ * 10) > E.speedAt(E.HZ * 5));
  eq(E.speedAt(E.HZ * 600), E.SPEED_MAX);
});

/* ===================== Hàng đợi rẽ ===================== */

test('bấm hai lần rẽ trước một tick: cả hai được dùng ở hai tick liên tiếp', () => {
  let s = toPlay(E.newGame({ level: 'easy', seed: 4 }));
  const x = s.bikes[0].x;
  const y = s.bikes[0].y;
  s = E.turn(s, LEFT);
  s = E.turn(s, DOWN);
  eq(s.queue, [LEFT, DOWN]);
  s = nextTick(s);
  eq([s.bikes[0].x, s.bikes[0].y, s.bikes[0].dir], [x - 1, y, LEFT]);
  s = nextTick(s);
  eq([s.bikes[0].x, s.bikes[0].y, s.bikes[0].dir], [x - 1, y + 1, DOWN]);
  eq(s.queue, []);
});

test('quay đầu và rẽ trùng hướng bị bỏ qua, hàng đợi tối đa 3', () => {
  let s = toPlay(E.newGame({ level: 'easy', seed: 4 }));
  eq(E.turn(s, DOWN).queue, [], 'quay đầu');
  eq(E.turn(s, UP).queue, [], 'trùng hướng');
  s = E.turn(s, LEFT);
  eq(E.turn(s, RIGHT).queue, [LEFT], 'quay đầu so với lệnh rẽ cuối trong hàng');
  s = E.turn(E.turn(E.turn(s, UP), RIGHT), DOWN);
  eq(s.queue, [LEFT, UP, RIGHT]);
});

test('rẽ trái / phải tương đối theo lệnh rẽ cuối trong hàng', () => {
  let s = toPlay(E.newGame({ level: 'easy', seed: 4 }));
  s = E.turnRel(s, -1);
  eq(s.queue, [LEFT]);
  s = E.turnRel(s, -1);
  eq(s.queue, [LEFT, DOWN]);
  s = E.turnRel(s, 1);
  eq(s.queue, [LEFT, DOWN, LEFT]);
});

test('được rẽ trước trong lúc đếm ngược; không nhận phím khi hiệp đã kết thúc', () => {
  let s = E.newGame({ level: 'easy', seed: 4 });
  s = E.turn(s, RIGHT);
  eq(s.queue, [RIGHT]);
  s = nextTick(toPlay(s));
  eq(s.bikes[0].dir, RIGHT);
  const r = runUntil(setup({ a: [5, 0, UP] }), 'round');
  eq(r.s.phase, 'crash');
  eq(E.turn(r.s, LEFT), r.s);
});

/* ===================== Va chạm, hiệp, trận ===================== */

test('đâm tường: thua hiệp, máy được 1 điểm', () => {
  const r = runUntil(setup({ a: [2, 1, UP] }), 'round');
  eq([r.ev.winner, r.s.score], [1, [0, 1]]);
  eq(r.s.events.find((e) => e.type === 'crash').who, [true, false]);
  eq([r.s.bikes[0].alive, r.s.bikes[0].x, r.s.bikes[0].y], [false, 2, 0]);
});

test('đâm vào vệt: thua hiệp', () => {
  const r = runUntil(setup({ a: [5, 10, UP], walls: [[5, 8]] }), 'round');
  eq(r.ev.winner, 1);
  eq([r.s.bikes[0].x, r.s.bikes[0].y], [5, 9]);
});

/** Máy kẹt trong ngõ cụt một ô: trái, phải, dưới đều là vệt. */
const TRAPPED = { b: [20, 20, DOWN], walls: [[19, 20], [21, 20], [20, 21]] };

test('máy đâm vào vệt: người chơi thắng hiệp', () => {
  ['easy', 'medium', 'hard'].forEach((level) => {
    const r = runUntil(setup(Object.assign({ level }, TRAPPED)), 'round');
    eq([r.ev.winner, r.s.score], [0, [1, 0]], level);
  });
});

test('hai xe lao vào cùng một ô: hòa, không ai được điểm, hiệp đấu lại từ đầu', () => {
  const s = setup({ a: [5, 5, RIGHT], b: [7, 5, LEFT], score: [1, 2] });
  const r = runUntil(s, 'round', 100, { pick: [null, () => LEFT] });
  eq([r.ev.winner, r.s.score, r.s.draws], [-1, [1, 2], 1]);
  eq(r.s.events.find((e) => e.type === 'crash').who, [true, true]);
  const next = runUntil(r.s, 'newround').s;
  eq([next.phase, Array.from(next.grid).filter((v) => v).length, next.round], ['countdown', 2, r.s.round + 1]);
});

test('hai xe đổi chỗ cho nhau (đối đầu sát nhau): hòa', () => {
  const r = runUntil(setup({ a: [5, 5, RIGHT], b: [6, 5, LEFT] }), 'round', 100, { pick: [null, () => LEFT] });
  eq(r.ev.winner, -1);
});

test('thắng 3 hiệp là thắng trận; sau khi xong step không đổi gì', () => {
  const r = runUntil(setup(Object.assign({ score: [2, 1] }, TRAPPED)), 'over');
  eq([r.s.phase, r.s.winner, r.s.score, E.isOver(r.s)], ['over', 0, [3, 1], true]);
  const again = E.step(r.s);
  eq(json(again), json(r.s));
  eq(again.events, []);
});

test('hết hiệp chưa đủ 3: nghỉ rồi sang hiệp mới, lưới sạch, giữ tỉ số', () => {
  const r = runUntil(setup({ a: [2, 0, UP], score: [1, 1] }), 'round');
  eq(r.s.phase, 'crash');
  const n = runUntil(r.s, 'newround');
  eq(n.steps, E.CRASH_PAUSE);
  eq([n.s.score, n.s.phase, n.s.bikes[0].alive, n.s.bikes[1].alive, n.s.queue], [[1, 2], 'countdown', true, true, []]);
});

/* ===================== Tất định, không sửa trạng thái cũ ===================== */

function playScript(seed, level) {
  let s = E.newGame({ level, seed });
  const dirs = [LEFT, UP, RIGHT, UP];
  for (let i = 0; i < 4000 && !E.isOver(s); i++) {
    if (i % 97 === 0) s = E.turn(s, dirs[(i / 97) % 4]);
    s = E.step(s);
  }
  return s;
}

test('tất định: cùng seed + cùng input ra cùng ván, khác seed thì khác', () => {
  eq(json(playScript(11, 'hard')), json(playScript(11, 'hard')));
  eq(json(playScript(5, 'easy')), json(playScript(5, 'easy')));
  ok(json(playScript(11, 'medium')) !== json(playScript(12, 'medium')), 'khác seed');
});

test('step / turn không sửa trạng thái cũ', () => {
  let s = toPlay(E.newGame({ level: 'hard', seed: 2 }));
  for (let i = 0; i < 40; i++) s = E.step(s);
  const before = json(s);
  const grid = Array.from(s.grid).join('');
  for (let i = 0; i < 60; i++) E.step(s);
  E.turn(s, LEFT);
  E.resume(s);
  eq(json(s), before);
  eq(Array.from(s.grid).join(''), grid);
});

/* ===================== Máy ===================== */

test('Dễ: ô trước mặt là tường thì rẽ (trừ khi lỡ phản ứng, hiếm)', () => {
  let turned = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = setup({ level: 'easy', seed, b: [20, E.H - 1, DOWN] });
    if (E.decide(s, 1, 'easy') !== DOWN) turned++;
  }
  ok(turned >= 170 && turned < 200, 'rẽ ' + turned + '/200');
});

test('Vừa: không chui vào ngõ cụt khi có vùng rộng hơn', () => {
  // Chỉ còn đường phải
  const s1 = setup({ b: [5, 1, DOWN], walls: [[4, 0], [4, 1], [4, 2], [5, 2]] });
  eq(E.decide(s1, 1, 'medium'), RIGHT);
  // Đi trái là ngõ cụt 5 ô giữa hai bức tường; lên / xuống ra phần còn lại của bàn
  for (let seed = 1; seed <= 20; seed++) {
    const s2 = setup({ seed, b: [5, 3, LEFT], walls: hline(2, 0, 4).concat(hline(4, 0, 4)) });
    const d = E.decide(s2, 1, 'medium');
    ok(d === UP || d === DOWN, 'chui vào ngõ cụt (seed ' + seed + ')');
  }
});

test('Khó: không đi vào ô đối thủ có thể lao vào cùng lúc khi còn lối khác', () => {
  // Máy ở (10,10) đi phải; người chơi ở (11,11) đi lên: ô (11,10) trước mặt máy cũng là ô trước mặt người chơi
  for (let seed = 1; seed <= 10; seed++) {
    const s = setup({ level: 'hard', seed, a: [11, 11, UP], b: [10, 10, RIGHT] });
    ok(E.decide(s, 1, 'hard') !== RIGHT, 'máy Khó đi thẳng vào ô nguy hiểm (seed ' + seed + ')');
  }
});

test('Khó: bị tách vùng thì chọn vùng lớn hơn', () => {
  // Bức tường dọc x = 20 chia đôi bàn, có khe ở (20, 5). Máy ở (21, 5) đi trái: đi thẳng vào khe sang nửa trái
  // đang có người chơi; rẽ lên / xuống ở lại nửa phải trống. Cả hai đều sống; đây chỉ kiểm tra không tự sát.
  const walls = vline(20, 0, 4).concat(vline(20, 6, E.H - 1));
  const s = setup({ level: 'hard', a: [5, 30, UP], b: [21, 5, LEFT], walls });
  const d = E.decide(s, 1, 'hard');
  ok(d === LEFT || d === UP || d === DOWN);
  // Ngăn bên dưới nhỏ (y 6..8) bị chặn: máy không rẽ xuống
  const walls2 = walls.concat(hline(9, 21, E.W - 1));
  const s2 = setup({ level: 'hard', a: [5, 30, UP], b: [21, 5, LEFT], walls: walls2.concat(hline(4, 21, E.W - 1)) });
  ok(E.decide(s2, 1, 'hard') !== DOWN, 'chui vào ngăn nhỏ');
});

/** Mô phỏng một trận: xe 0 do máy mức a, xe 1 là máy mức b của engine. */
function duel(a, b, seed) {
  let s = E.newGame({ level: b, seed });
  const pick = [(st) => E.decide(st, 0, a), null];
  let steps = 0;
  while (!E.isOver(s) && steps < 400000) {
    s = E.step(s, { pick });
    steps++;
  }
  return { winner: s.winner, ms: (steps * 1000) / E.HZ, rounds: s.round, draws: s.draws };
}
const stats = {};
function rate(a, b, n) {
  let wins = 0;
  let ms = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = duel(a, b, seed * 101);
    if (r.winner === 0) wins++;
    ms += r.ms;
  }
  stats[a + '-' + b] = { rate: wins / n, avgMs: ms / n };
  return wins / n;
}

test('Vừa thắng Dễ phần lớn số trận', () => {
  const r = rate('medium', 'easy', 30);
  ok(r >= 0.75, 'Vừa thắng Dễ ' + r);
});
test('Khó thắng Dễ gần như mọi trận', () => {
  const r = rate('hard', 'easy', 20);
  ok(r >= 0.9, 'Khó thắng Dễ ' + r);
});
test('Khó thắng Vừa phần lớn số trận', () => {
  const r = rate('hard', 'medium', 30);
  ok(r >= 0.7, 'Khó thắng Vừa ' + r);
});

/* ===================== Chống gian lận: thời lượng tối thiểu ===================== */

test('trận thắng nhanh nhất có thể (máy tự đâm sau 4 tick mỗi hiệp) vẫn dài hơn 9 giây', () => {
  // Xe không thể đâm sớm hơn tick thứ 4: quanh ô xuất phát trống, tường cách ≥ 5 ô, đối thủ cách ≥ 25 ô.
  // Máy đi vòng chữ U về ô xuất phát (trái, lên, phải, xuống); người chơi đi thẳng.
  const suicide = [LEFT, UP, RIGHT, DOWN];
  let s = E.newGame({ level: 'easy', seed: 9 });
  let steps = 0;
  while (!E.isOver(s)) {
    s = E.step(s, { pick: [null, (st) => suicide[st.ticks % 4]] });
    steps++;
  }
  eq([s.winner, s.score], [0, [3, 0]]);
  const ms = (steps * 1000) / E.HZ;
  ok(ms > 9000, 'trận nhanh nhất ' + ms + ' ms');
  stats.fastest = ms;
});

/* ===================== Lưu / khôi phục ===================== */

test('lưu rồi khôi phục giữa hiệp giữ nguyên ván, chơi tiếp ra cùng kết quả', () => {
  let s = E.newGame({ level: 'hard', seed: 21 });
  for (let i = 0; i < 900; i++) s = E.step(s);
  s = E.turn(s, LEFT);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s))));
  ok(back, 'khôi phục được');
  eq(json(back), json(s));
  eq(Array.from(back.grid).join(''), Array.from(s.grid).join(''), 'lưới dựng lại từ đường đi');
  let a = s;
  let b = back;
  for (let i = 0; i < 1500; i++) {
    a = E.step(a);
    b = E.step(b);
  }
  eq(json(a), json(b));
});

test('ván lưu dựng sẵn của e2e: chơi tiếp không lái cho đúng kết quả', () => {
  // Giống hệt WIN / LOSE / MID trong e2e.spec.ts
  const base = { v: 1, level: 'easy', rng: 12345, round: 3, draws: 0, started: true, winner: null, last: 0, phase: 'play', timer: 0, time: 600, move: 0, ticks: 10, queue: [] };
  const freeA = { x: 10, y: 30, dir: 0, alive: true, path: [10, 34, 10, 30] };
  const freeB = { x: 29, y: 9, dir: 2, alive: true, path: [29, 5, 29, 9] };
  const trapB = { x: 21, y: 7, dir: 2, alive: true, path: [20, 4, 20, 8, 22, 8, 22, 6, 21, 6, 21, 7] };
  const trapA = { x: 18, y: 32, dir: 0, alive: true, path: [19, 35, 19, 31, 17, 31, 17, 33, 18, 33, 18, 32] };
  const make = (a, b, score) => Object.assign({}, base, { score, bikes: [a, b], hist: [[[a.x, a.y, a.dir]], [[b.x, b.y, b.dir]]] });
  const play = (raw) => {
    let s = E.fromJSON(raw);
    ok(s, 'ván lưu hợp lệ');
    s = E.resume(s);
    let steps = 0;
    while (!E.isOver(s) && steps < E.HZ * 5) {
      s = E.step(s);
      steps++;
    }
    return { s, steps };
  };
  const win = play(make(freeA, trapB, [2, 0]));
  eq([win.s.winner, win.s.score], [0, [3, 0]]);
  ok(win.steps < E.HZ * 3, 'thắng trong 3 s');
  const lose = play(make(trapA, freeB, [0, 2]));
  eq([lose.s.winner, lose.s.score], [1, [0, 3]]);
  const mid = play(make(freeA, freeB, [1, 1]));
  eq([E.isOver(mid.s), mid.s.started], [false, true], 'trận giữa chừng vẫn đang chơi');
});

test('resume: hiệp đang chạy dừng lại đếm ngược, giữ nguyên vệt', () => {
  let s = toPlay(E.newGame({ level: 'medium', seed: 8 }));
  for (let i = 0; i < 100; i++) s = E.step(s);
  const r = E.resume(s);
  eq([r.phase, r.timer], ['countdown', E.COUNTDOWN]);
  eq(Array.from(r.grid).join(''), Array.from(s.grid).join(''));
  const p = toPlay(r);
  eq([p.phase, p.ticks], ['play', s.ticks]);
});

test('từ chối dữ liệu hỏng', () => {
  let s = E.newGame({ level: 'medium', seed: 3 });
  for (let i = 0; i < 700; i++) s = E.step(s);
  const good = E.toJSON(s);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const bike = (i, patch) => {
    const b = good.bikes.map((x) => Object.assign({}, x));
    Object.assign(b[i], patch);
    return b;
  };
  const cases = [
    null,
    1,
    {},
    bad({ v: 99 }),
    bad({ level: 'insane' }),
    bad({ score: [4, 0] }),
    bad({ score: [1] }),
    bad({ phase: 'dance' }),
    bad({ move: 1.5 }),
    bad({ queue: [0, 1, 3, 1] }),
    bad({ queue: [7] }),
    bad({ rng: -1 }),
    bad({ bikes: [good.bikes[0]] }),
    bad({ bikes: bike(0, { x: 99 }) }),
    bad({ bikes: bike(0, { path: [1, 1, 2, 2] }) }), // đoạn chéo
    bad({ bikes: bike(1, { path: good.bikes[0].path.slice(), x: good.bikes[0].x, y: good.bikes[0].y }) }), // trùng ô
    bad({ hist: [[], []] }),
    bad({ phase: 'over', winner: null }),
    bad({ score: [3, 0], phase: 'play' }),
  ];
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'case ' + i));
  ok(E.fromJSON(good), 'dữ liệu tốt vẫn nhận');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
const pct = (k) => (stats[k] ? Math.round(stats[k].rate * 100) + '% (trận TB ' + Math.round(stats[k].avgMs / 1000) + ' s)' : '–');
console.log('Tỉ lệ thắng: Vừa–Dễ ' + pct('medium-easy') + ', Khó–Dễ ' + pct('hard-easy') + ', Khó–Vừa ' + pct('hard-medium') + '; trận thắng nhanh nhất ' + Math.round(stats.fastest || 0) + ' ms');
if (failed) process.exit(1);
