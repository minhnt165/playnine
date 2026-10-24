/* Kiểm tra engine Bóng Bàn: chạy `node test.js`
 * - Vật lý bóng theo bước cố định, dội tường, chạm vợt và góc bật theo chỗ chạm, xoáy, trần tốc độ
 * - Ghi điểm, đổi giao, 11 điểm hơn 2, kết thúc ván
 * - Máy tôn trọng tốc độ vợt tối đa và độ trễ phản ứng theo mức; bot giỏi thắng được máy
 * - Tất định theo seed + chuỗi input; step không sửa trạng thái cũ
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
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
function near(a, b, eps, msg) {
  if (Math.abs(a - b) > (eps || 1e-6)) throw new Error((msg ? msg + ': ' : '') + a + ' ≉ ' + b);
}

const NONE = { target: null, dir: 0 };
const speedOf = (s) => Math.hypot(s.ball.vx, s.ball.vy);

/** Ván đang đánh: bóng ở (x, y) bay với vận tốc (vx, vy), không xoáy. */
function inPlay(opts) {
  const s = E.newGame({ level: opts.level || 'medium', seed: opts.seed || 1 });
  s.phase = 'play';
  s.served = true;
  s.ball = { x: opts.x, y: opts.y, vx: opts.vx, vy: opts.vy, spin: opts.spin || 0 };
  s.speed = opts.speed || Math.hypot(opts.vx, opts.vy);
  if (opts.pad0 != null) s.pads[0].x = opts.pad0;
  if (opts.pad1 != null) s.pads[1].x = opts.pad1;
  if (opts.score) s.score = opts.score.slice();
  return s;
}

/** Chạy tới khi có sự kiện `type` (hoặc hết n bước); trả { s, ev }. */
function runUntil(s, type, n, input) {
  for (let i = 0; i < (n || 5000); i++) {
    s = E.step(s, typeof input === 'function' ? input(s) : input || NONE);
    const ev = s.events.find((e) => e.type === type);
    if (ev) return { s, ev };
  }
  throw new Error('không thấy sự kiện ' + type);
}

/** Cho `who` ghi một điểm: bóng đang bay ra khỏi đầu bàn của đối thủ. */
function givePoint(s, who) {
  const t = inPlay({ x: E.W / 2, y: who === 0 ? -E.R : E.L + E.R, vx: 0, vy: who === 0 ? -400 : 400, score: s.score });
  t.first = s.first;
  t.level = s.level;
  return runUntil(t, 'point', 10).s;
}

/** Bot người chơi khá (trễ 0,18 s, đoán điểm rơi sai dần về 0 khi bóng tới gần, đánh bóng ra xa máy). */
function makeBot(seed, rt, P) {
  let a = (seed * 7919 + 13) >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hist = [];
  let x = E.W / 2;
  let offset = 0;
  let u = 0;
  let was = false;
  return (s) => {
    hist.push({ phase: s.phase, ball: Object.assign({}, s.ball) });
    if (hist.length > rt + 1) hist.shift();
    const snap = hist[0];
    const toward = snap.phase === 'play' && snap.ball.vy > 0;
    if (toward && !was) {
      const away = s.pads[1].x > E.W / 2 ? 1 : -1;
      offset = away * (0.2 + 0.5 * r()) * (E.PAD_W / 2);
      u = r() * 2 - 1;
    }
    was = toward;
    let want = E.W / 2;
    if (toward) {
      const tRem = Math.max(0, (E.CONTACT[0] - snap.ball.y) / snap.ball.vy);
      want = E.intercept(snap.ball, E.CONTACT[0]) + offset + u * P * tRem;
    }
    x += Math.max(-1500 * E.DT, Math.min(1500 * E.DT, want - x));
    return { target: x, dir: 0 };
  };
}

function playMatch(level, seed, bot, onStep) {
  let s = E.newGame({ level, seed });
  while (!E.isOver(s) && s.tick < E.HZ * 60 * 15) {
    const prev = s;
    s = E.step(s, bot(s));
    if (onStep) onStep(prev, s);
  }
  return s;
}

/* ---------------- Ván mới ---------------- */
test('ván mới: 0-0, đang đếm ngược quả giao đầu, bóng nằm trước vợt người giao', () => {
  const s = E.newGame({ level: 'easy', seed: 7 });
  eq([s.level, s.score, s.phase, s.timer, s.served, s.winner], ['easy', [0, 0], 'countdown', E.COUNTDOWN, false, null]);
  eq(s.server, s.first);
  near(s.ball.y, E.CONTACT[s.server]);
  near(s.ball.x, s.pads[s.server].x);
  eq(E.countdownNumber(s), 3);
});

test('mức lạ thì dùng Vừa; ai giao trước tùy seed (có cả hai)', () => {
  eq(E.newGame({ level: 'xyz', seed: 1 }).level, 'medium');
  const firsts = new Set();
  for (let i = 0; i < 20; i++) firsts.add(E.newGame({ seed: i }).first);
  eq([...firsts].sort(), [0, 1]);
});

test('đếm ngược 3-2-1 rồi giao bóng, bóng đi về phía đối thủ với tốc độ giao', () => {
  let s = E.newGame({ seed: 3 });
  const counts = [];
  let served = null;
  for (let i = 0; i < E.COUNTDOWN; i++) {
    s = E.step(s, NONE);
    s.events.forEach((e) => {
      if (e.type === 'count') counts.push(e.n);
      if (e.type === 'serve') served = e.who;
    });
  }
  eq(counts, [2, 1]);
  eq([served, s.phase, s.served], [s.server, 'play', true]);
  near(speedOf(s), E.SERVE_SPEED, 1e-6);
  ok(s.server === 0 ? s.ball.vy < 0 : s.ball.vy > 0, 'bóng phải đi về phía đối thủ');
  ok(Math.abs(Math.atan2(s.ball.vx, Math.abs(s.ball.vy))) <= E.SERVE_ANGLE + 1e-9, 'góc giao trong giới hạn');
});

test('trong lúc đếm ngược bóng đi theo vợt người giao', () => {
  let s = E.newGame({ seed: 2 });
  while (s.server !== 0) s = E.newGame({ seed: s.rng + 1 });
  s = E.step(s, { target: 300, dir: 0 });
  near(s.ball.x, s.pads[0].x);
  ok(s.pads[0].x > E.W / 2);
});

/* ---------------- Vật lý ---------------- */
test('bước cố định: bóng bay thẳng đi đúng v × DT mỗi bước', () => {
  let s = inPlay({ x: 100, y: 300, vx: 120, vy: -360 });
  for (let i = 0; i < 30; i++) s = E.step(s, NONE);
  near(s.ball.x, 100 + 120 * E.DT * 30, 1e-6);
  near(s.ball.y, 300 - 360 * E.DT * 30, 1e-6);
  eq(E.DT, 1 / 120);
});

test('dội tường trái / phải: đổi chiều vx, bóng không ra ngoài bàn, có sự kiện wall', () => {
  let s = inPlay({ x: E.W - E.R - 1, y: 300, vx: 600, vy: -100 });
  s = E.step(s, NONE);
  ok(s.events.some((e) => e.type === 'wall'));
  ok(s.ball.vx < 0, 'vx đổi chiều');
  ok(s.ball.x <= E.W - E.R && s.ball.x >= E.R);
  near(s.ball.x, 2 * (E.W - E.R) - (E.W - E.R - 1 + 600 * E.DT));
  let t = inPlay({ x: E.R + 1, y: 300, vx: -600, vy: 100 });
  t = E.step(t, NONE);
  ok(t.ball.vx > 0 && t.ball.x >= E.R);
  near(speedOf(t), Math.hypot(600, 100));
});

test('dội tường xóa xoáy', () => {
  let s = inPlay({ x: E.W - E.R - 1, y: 300, vx: 600, vy: -100, spin: 0.4 });
  s = E.step(s, NONE);
  eq(s.ball.spin, 0);
});

test('chạm giữa vợt: bóng bật thẳng ngược lại, nhanh thêm SPEED_INC', () => {
  const s0 = inPlay({ x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: 400, pad0: 180 });
  const s = E.step(s0, NONE);
  const ev = s.events.find((e) => e.type === 'hit');
  ok(ev && ev.who === 0, 'phải có cú đánh của người chơi');
  near(s.ball.vx, 0, 1e-9);
  ok(s.ball.vy < 0);
  near(speedOf(s), 400 + E.SPEED_INC);
  near(s.ball.y, E.CONTACT[0]);
  eq(s.rally, 1);
});

test('góc bật theo chỗ chạm: mép vợt lệch MAX_ANGLE, càng xa tâm càng lệch, quá mép thì kẹp', () => {
  near(E.hitAngle(100, 100), 0);
  near(E.hitAngle(100 + E.REACH, 100), E.MAX_ANGLE);
  near(E.hitAngle(100 - E.REACH, 100), -E.MAX_ANGLE);
  near(E.hitAngle(100 + E.REACH * 3, 100), E.MAX_ANGLE);
  ok(E.hitAngle(110, 100) < E.hitAngle(120, 100));
  // Máy chạm bóng bên phải tâm vợt → bóng bay xuống, lệch sang phải
  const s0 = inPlay({ x: 200, y: E.CONTACT[1] + 2, vx: 0, vy: -400, pad1: 180 });
  const s = E.step(s0, NONE);
  ok(s.events.some((e) => e.type === 'hit' && e.who === 1));
  ok(s.ball.vy > 0 && s.ball.vx > 0);
  const off = (200 - s.pads[1].x) / E.REACH;
  near(Math.atan2(s.ball.vx, s.ball.vy), off * E.MAX_ANGLE, 1e-9);
});

test('bóng bay nhanh không xuyên qua vợt (kiểm tra cắt đường chạm trong bước)', () => {
  const s0 = inPlay({ x: 180, y: E.CONTACT[0] - 1, vx: 0, vy: E.MAX_SPEED, speed: E.MAX_SPEED, pad0: 180 });
  ok(E.step(s0, NONE).events.some((e) => e.type === 'hit'));
});

test('ngoài tầm vợt thì bóng đi qua và máy ghi điểm', () => {
  let s = inPlay({ x: 40, y: E.CONTACT[0] - 40, vx: 0, vy: 400, pad0: E.W - E.PAD_W / 2 });
  const r = runUntil(s, 'point', 200);
  eq([r.ev.who, r.s.score, r.s.phase], [1, [0, 1], 'point']);
  ok(!r.s.events.some((e) => e.type === 'hit'));
});

test('xoáy: vợt đang lia sang phải khi chạm → bóng cong dần sang phải, tốc độ giữ nguyên', () => {
  const s0 = inPlay({ x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: 400, pad0: 180 });
  s0.pads[0].v = 600;
  let s = E.step(s0, NONE);
  ok(s.ball.spin > 0 && s.ball.spin <= E.SPIN_MAX, 'có xoáy dương');
  const v0 = s.ball.vx;
  const sp = speedOf(s);
  for (let i = 0; i < 30; i++) s = E.step(s, NONE);
  ok(s.ball.vx > v0, 'vx tăng dần (cong sang phải)');
  near(speedOf(s), sp, 1e-6);
  // Lia rất nhanh thì xoáy bị kẹp ở SPIN_MAX
  const f = inPlay({ x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: 400, pad0: 180 });
  f.pads[0].v = -50000;
  near(E.step(f, NONE).ball.spin, -E.SPIN_MAX);
});

test('xoáy không bẻ bóng quá MAX_FLIGHT', () => {
  let s = inPlay({ x: 180, y: 320, vx: 400 * Math.sin(E.MAX_FLIGHT - 0.001), vy: -400 * Math.cos(E.MAX_FLIGHT - 0.001), spin: E.SPIN_MAX });
  for (let i = 0; i < 5; i++) s = E.step(s, NONE);
  ok(Math.atan2(Math.abs(s.ball.vx), Math.abs(s.ball.vy)) <= E.MAX_FLIGHT + 1e-9);
});

test('trần tốc độ: cú đánh không vượt MAX_SPEED; cả trận tốc độ bóng không vượt trần', () => {
  const s0 = inPlay({ x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: E.MAX_SPEED - 5, speed: E.MAX_SPEED - 5, pad0: 180 });
  near(E.step(s0, NONE).speed, E.MAX_SPEED);
  const s1 = inPlay({ x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: E.MAX_SPEED, speed: E.MAX_SPEED, pad0: 180 });
  near(speedOf(E.step(s1, NONE)), E.MAX_SPEED);
  let top = 0;
  playMatch('hard', 5, makeBot(5, 20, 150), (p, s) => { top = Math.max(top, speedOf(s), s.speed); });
  ok(top <= E.MAX_SPEED + 1e-6, 'tốc độ lớn nhất ' + top);
  ok(top > E.SERVE_SPEED, 'bóng có nhanh dần');
});

test('tốc độ vợt người chơi: theo chuột / chạm có trần PLAYER_SPEED, phím đi KEY_SPEED, không ra khỏi bàn', () => {
  let s = E.newGame({ seed: 1 });
  const x0 = s.pads[0].x;
  s = E.step(s, { target: 0, dir: 0 });
  near(x0 - s.pads[0].x, Math.min(E.PLAYER_SPEED * E.DT, x0 - E.PAD_W / 2));
  const k = E.step(E.newGame({ seed: 1 }), { target: null, dir: 1 });
  near(k.pads[0].x - x0, E.KEY_SPEED * E.DT);
  for (let i = 0; i < 200; i++) s = E.step(s, { target: -500, dir: 0 });
  eq(s.pads[0].x, E.PAD_W / 2);
});

/* ---------------- Điểm và ván ---------------- */
test('11 điểm hơn 2 mới thắng', () => {
  eq(E.winnerOf([11, 9]), 0);
  eq(E.winnerOf([11, 10]), null);
  eq(E.winnerOf([10, 10]), null);
  eq(E.winnerOf([12, 10]), 0);
  eq(E.winnerOf([11, 13]), 1);
  eq(E.winnerOf([3, 11]), 1);
  eq(E.winnerOf([15, 14]), null);
});

test('đổi giao mỗi 2 điểm, từ 10-10 đổi mỗi điểm', () => {
  const seq = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]].map((sc) => E.serverFor(sc, 0));
  eq(seq, [0, 0, 1, 1, 0, 0]);
  eq(E.serverFor([0, 0], 1), 1);
  eq([[10, 10], [11, 10], [11, 11], [12, 11]].map((sc) => E.serverFor(sc, 0)), [0, 1, 0, 1]);
  eq([E.serverFor([9, 10], 0), E.serverFor([10, 9], 0)], [1, 1]);
});

test('sau điểm: nghỉ POINT_PAUSE, đếm ngược COUNTDOWN rồi người giao đúng luật giao bóng', () => {
  let s = E.newGame({ seed: 4 });
  s = givePoint(s, 0);
  s = givePoint(s, 1);
  eq([s.score, s.phase, s.timer], [[1, 1], 'point', E.POINT_PAUSE]);
  for (let i = 0; i < E.POINT_PAUSE; i++) s = E.step(s, NONE);
  eq([s.phase, s.server, s.timer], ['countdown', E.serverFor([1, 1], s.first), E.COUNTDOWN]);
  for (let i = 0; i < E.COUNTDOWN; i++) s = E.step(s, NONE);
  eq(s.phase, 'play');
});

test('10-10 → 11-10 chưa xong, 11-11, rồi 13-11 thì người chơi thắng; sau khi xong step không đổi gì', () => {
  let s = inPlay({ x: 180, y: 300, vx: 0, vy: 0, score: [10, 10] });
  s = givePoint(s, 0);
  eq([s.score, s.phase, s.winner], [[11, 10], 'point', null]);
  s = givePoint(s, 1);
  s = givePoint(s, 0);
  eq(s.phase, 'point');
  s = givePoint(s, 0);
  eq([s.score, s.phase, s.winner, E.isOver(s)], [[13, 11], 'over', 0, true]);
  const again = E.step(s, { target: 10, dir: 0 });
  eq(E.toJSON(again), E.toJSON(s));
});

test('11-0 nhanh nhất vẫn lâu hơn 30 s (cơ sở cho min_duration_ms)', () => {
  // Một điểm nhanh nhất = đếm ngược + quả giao bay thẳng hết bàn với tốc độ giao, cộng thời gian nghỉ giữa các điểm
  const fastestPoint = E.COUNTDOWN / E.HZ + (E.L + 2 * E.R - E.CONTACT[1]) / E.SERVE_SPEED;
  const bound = 11 * fastestPoint + 10 * (E.POINT_PAUSE / E.HZ);
  ok(bound > 40, 'cận dưới ' + bound.toFixed(1) + ' s');
  // Mô phỏng: máy đứng im ở mép trái, người chơi đánh mọi quả sang phải
  E.LEVELS.frozen = { reaction: 1, speed: 0, predict: false, error: 0, aim: false };
  try {
    let s = E.newGame({ level: 'frozen', seed: 9 });
    s.pads[1].x = E.PAD_W / 2;
    const bot = (st) => ({ target: st.phase === 'play' && st.ball.vy > 0 ? E.intercept(st.ball, E.CONTACT[0]) - E.REACH * 0.8 : E.W - E.PAD_W / 2, dir: 0 });
    while (!E.isOver(s)) s = E.step(s, bot(s));
    eq([s.score, s.winner], [[11, 0], 0]);
    ok(s.tick / E.HZ >= bound - 1e-6 && s.tick / E.HZ > 30, 'trận 11-0 mất ' + (s.tick / E.HZ).toFixed(1) + ' s');
  } finally {
    delete E.LEVELS.frozen;
  }
});

/* ---------------- Máy ---------------- */
test('máy không bao giờ đi vợt nhanh hơn tốc độ tối đa của mức', () => {
  ['easy', 'medium', 'hard'].forEach((lv, i) => {
    const lim = E.LEVELS[lv].speed * E.DT + 1e-9;
    let worst = 0;
    playMatch(lv, 11 + i, makeBot(11 + i, 22, 180), (p, s) => { worst = Math.max(worst, Math.abs(s.pads[1].x - p.pads[1].x)); });
    ok(worst <= lim, lv + ': ' + worst + ' > ' + lim);
    ok(worst > lim * 0.9, lv + ': máy phải có lúc chạy hết tốc độ');
  });
});

test('máy phản ứng trễ: sau cú đánh của người chơi, đích của máy giữ nguyên đúng `reaction` bước', () => {
  ['easy', 'medium', 'hard'].forEach((lv) => {
    const rt = E.LEVELS[lv].reaction;
    let s = inPlay({ level: lv, x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: 400, pad0: 150 });
    s.ai.target = 60;
    s.ai.wait = 0;
    s = E.step(s, NONE); // người chơi đánh bóng lệch sang phải
    ok(s.events.some((e) => e.type === 'hit' && e.who === 0));
    const target = s.ai.target;
    for (let i = 0; i < rt; i++) {
      s = E.step(s, NONE);
      eq(s.ai.target, target, lv + ' bước ' + (i + 1));
    }
    s = E.step(s, NONE);
    ok(s.ai.target !== target, lv + ': hết thời gian trễ thì máy phải quyết định lại');
  });
});

test('mức khó hơn có phản ứng nhanh hơn, vợt nhanh hơn, sai số nhỏ hơn', () => {
  const { easy, medium, hard } = E.LEVELS;
  ok(easy.reaction > medium.reaction && medium.reaction > hard.reaction);
  ok(easy.speed < medium.speed && medium.speed < hard.speed);
  ok(easy.error > medium.error && medium.error > hard.error);
});

test('thắng được máy: bot khá thắng hết mức Dễ, thắng phần lớn mức Vừa, thắng được mức Khó; mức khó thắng ít hơn', () => {
  const wins = {};
  ['easy', 'medium', 'hard'].forEach((lv) => {
    wins[lv] = 0;
    for (let seed = 1; seed <= 8; seed++) if (playMatch(lv, seed, makeBot(seed, 22, 180)).winner === 0) wins[lv]++;
  });
  ok(wins.easy === 8, 'Dễ ' + wins.easy + '/8');
  ok(wins.medium >= 5, 'Vừa ' + wins.medium + '/8');
  ok(wins.hard >= 1, 'Khó ' + wins.hard + '/8');
  ok(wins.easy >= wins.medium && wins.medium > wins.hard, JSON.stringify(wins));
});

/* ---------------- Tất định ---------------- */
test('tất định: cùng seed + cùng chuỗi input cho cùng kết quả; seed khác thì khác', () => {
  const run = (seed) => {
    let s = E.newGame({ level: 'medium', seed });
    for (let i = 0; i < 3000; i++) s = E.step(s, { target: 180 + 120 * Math.sin(i / 37), dir: 0 });
    return JSON.stringify(E.toJSON(s));
  };
  eq(run(42), run(42));
  ok(run(42) !== run(43));
  eq(playMatch('hard', 3, makeBot(3, 22, 180)).score, playMatch('hard', 3, makeBot(3, 22, 180)).score);
});

test('step không sửa trạng thái cũ', () => {
  const s = inPlay({ x: 180, y: E.CONTACT[0] - 2, vx: 0, vy: 400, pad0: 180 });
  const before = JSON.stringify(E.toJSON(s));
  E.step(s, { target: 10, dir: 0 });
  eq(JSON.stringify(E.toJSON(s)), before);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván và chạy tiếp y hệt', () => {
  let s = E.newGame({ level: 'hard', seed: 8 });
  for (let i = 0; i < 700; i++) s = E.step(s, { target: 200, dir: 0 });
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s))));
  ok(back, 'khôi phục được');
  eq(E.toJSON(back), E.toJSON(s));
  let a = s;
  let b = back;
  for (let i = 0; i < 500; i++) {
    a = E.step(a, { target: 120, dir: 0 });
    b = E.step(b, { target: 120, dir: 0 });
  }
  eq(E.toJSON(a), E.toJSON(b));
});

test('mở lại ván dở: quả đang đánh được giao lại ở tỉ số hiện tại', () => {
  const s = inPlay({ x: 100, y: 300, vx: 50, vy: -500, score: [4, 3] });
  const r = E.resume(s);
  eq([r.score, r.phase, r.timer, r.server], [[4, 3], 'countdown', E.COUNTDOWN, E.serverFor([4, 3], s.first)]);
  near(r.ball.y, E.CONTACT[r.server]);
  eq([r.ball.vx, r.ball.vy], [0, 0]);
  const over = givePoint(inPlay({ x: 0, y: 0, vx: 0, vy: 0, score: [10, 2] }), 0);
  eq(E.resume(over).phase, 'over');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(givePoint(E.newGame({ seed: 5 }), 0));
  ok(E.fromJSON(good), 'ván hợp lệ phải đọc được');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  [
    null, 1, 'x', {},
    bad({ v: 2 }),
    bad({ level: 'insane' }),
    bad({ phase: 'warmup' }),
    bad({ score: [1] }),
    bad({ score: ['1', 0] }),
    bad({ score: [-1, 0] }),
    bad({ score: [11, 2] }), // đã thắng mà chưa kết thúc
    bad({ phase: 'over', winner: 0 }), // kết thúc mà chưa ai đủ điểm
    bad({ served: false }), // có điểm mà chưa giao quả nào
    bad({ first: 2 }),
    bad({ timer: -1 }),
    bad({ timer: 1.5 }),
    bad({ speed: E.MAX_SPEED + 1 }),
    bad({ rng: -3 }),
    bad({ ball: { x: NaN, y: 0, vx: 0, vy: 0, spin: 0 } }),
    bad({ ball: { x: 900, y: 0, vx: 0, vy: 0, spin: 0 } }),
    bad({ ball: { x: 10, y: 10, vx: 0, vy: 0, spin: 5 } }),
    bad({ pads: [{ x: 0, v: 0 }, { x: 180, v: 0 }] }),
    bad({ pads: [{ x: 180, v: 0 }] }),
    bad({ ai: { wait: 0, target: 'a', offset: 0, toward: false } }),
    bad({ ai: null }),
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw).slice(0, 80)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
