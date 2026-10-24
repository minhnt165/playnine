/* Kiểm tra engine Khúc Côn Cầu: chạy `node test.js`
 * - Vật lý đĩa theo bước cố định: ma sát, dội thành / cột khung, va chạm chày theo xung lượng, trần tốc độ, chống xuyên
 * - Giao đĩa, ghi bàn, chuyển quyền giao đĩa khi câu giờ, tới 7 bàn thì thắng
 * - Máy tôn trọng tốc độ chày và độ trễ phản ứng theo mức; mức cao mạnh dần (bot người và máy đấu máy)
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

const NONE = { target: null };
const R2 = E.PR + E.MR;
const FR = Math.exp(-E.FRICTION * E.DT); // hệ số ma sát mỗi bước
const speedOf = (s) => Math.hypot(s.puck.vx, s.puck.vy);
const hold = (s) => ({ target: { x: s.mallets[0].x, y: s.mallets[0].y } }); // giữ chày đứng yên

/**
 * Ván đang chơi với đĩa ở (x, y) vận tốc (vx, vy). Mặc định máy đứng im ở góc trên trái (mức "frozen", không chạm đĩa),
 * chày người chơi ở góc dưới trái; truyền m0 / m1 để đặt chỗ khác.
 */
function inPlay(o) {
  const s = E.newGame({ level: o.level || 'medium', seed: o.seed || 1 });
  s.phase = 'play';
  s.released = true;
  s.puck = { x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0 };
  s.half = o.y >= E.L / 2 ? 0 : 1;
  s.mallets[0] = Object.assign({ vx: 0, vy: 0 }, o.m0 || { x: E.MR, y: E.L - E.MR });
  s.mallets[1] = Object.assign({ vx: 0, vy: 0 }, o.m1 || { x: E.MR, y: E.MR });
  if (o.score) s.score = o.score.slice();
  if (o.level === 'frozen' || !o.level) s.level = 'frozen';
  return s;
}
// Mức giả cho test: máy đứng im (không di chuyển chày)
E.LEVELS.frozen = { reaction: 1, speed: 0, predict: 'none', attack: false, aim: 'direct', error: 0, spread: 0, defY: 60 };

/** Chạy tới khi có sự kiện `type` (hoặc hết n bước); trả { s, ev }. */
function runUntil(s, type, n, input) {
  for (let i = 0; i < (n || 5000); i++) {
    s = E.step(s, typeof input === 'function' ? input(s) : input || hold(s));
    const ev = s.events.find((e) => e.type === type);
    if (ev) return { s, ev };
  }
  throw new Error('không thấy sự kiện ' + type);
}

/** Cho `who` ghi một bàn: đĩa đang trượt thẳng vào khung của đối phương. */
function giveGoal(s, who) {
  const t = inPlay({ x: E.W / 2, y: who === 0 ? E.PR + 2 : E.L - E.PR - 2, vy: who === 0 ? -600 : 600, score: s.score });
  t.level = s.level;
  return runUntil(t, 'goal', 10).s;
}

// Bot "người chơi khá": phản ứng 0,25 s, chày nhanh, đoán được đường dội thành, sai số vừa (dùng bộ não của máy, lật sân)
const HUMAN = { reaction: 30, speed: 1100, predict: 'bounce', attack: true, aim: 'direct', error: 30, spread: 0.15, defY: 62 };

function playMatch(level, ctrl, seed, onStep) {
  let s = E.newGame({ level, seed });
  while (!E.isOver(s) && s.tick < E.HZ * 60 * 12) {
    const prev = s;
    s = E.step(s, ctrl(s));
    if (onStep) onStep(prev, s);
  }
  return s;
}

/* ---------------- Ván mới, giao đĩa ---------------- */
test('ván mới: 0-0, đĩa đứng yên ở nửa sân bên được giao, chày ở chỗ chờ, chưa thả đĩa', () => {
  const s = E.newGame({ level: 'easy', seed: 7 });
  eq([s.level, s.score, s.phase, s.timer, s.released, s.winner], ['easy', [0, 0], 'faceoff', E.FACEOFF, false, null]);
  eq([s.puck.x, s.puck.y, s.puck.vx, s.puck.vy], [E.W / 2, E.SPOT[s.receiver], 0, 0]);
  eq(s.mallets.map((m) => [m.x, m.y]), [[E.HOME[0].x, E.HOME[0].y], [E.HOME[1].x, E.HOME[1].y]]);
  ok(E.SPOT[0] > E.L / 2 && E.SPOT[1] < E.L / 2, 'chỗ giao đĩa nằm ở nửa sân của bên được giao');
});

test('mức lạ thì dùng Vừa; ai cầm đĩa trước tùy seed (có cả hai)', () => {
  eq(E.newGame({ level: 'xyz', seed: 1 }).level, 'medium');
  const firsts = new Set();
  for (let i = 0; i < 20; i++) firsts.add(E.newGame({ seed: i }).receiver);
  eq([...firsts].sort(), [0, 1]);
});

test('giao đĩa: đĩa đứng yên FACEOFF bước dù chày ép vào, chày không đè lên đĩa; hết giờ thì thả đĩa', () => {
  let s = E.newGame({ seed: 3 });
  s.receiver = 0;
  s.puck.y = E.SPOT[0];
  let drop = null;
  for (let i = 0; i < E.FACEOFF; i++) {
    s = E.step(s, { target: { x: E.W / 2, y: E.SPOT[0] } }); // chày lao thẳng vào đĩa
    ok(Math.hypot(s.puck.x - s.mallets[0].x, s.puck.y - s.mallets[0].y) >= R2 - 1e-6, 'chày đè lên đĩa ở bước ' + i);
    if (i < E.FACEOFF - 1) eq([s.phase, s.puck.vx, s.puck.vy, s.puck.y], ['faceoff', 0, 0, E.SPOT[0]]);
    drop = s.events.find((e) => e.type === 'drop') || drop;
  }
  eq([s.phase, s.released, drop && drop.who], ['play', true, 0]);
  // Bước sau chày đang ép vào đĩa thì đánh đĩa đi
  s = E.step(s, { target: { x: E.W / 2, y: E.SPOT[0] - 40 } });
  ok(s.puck.vy < 0, 'đĩa bị đánh lên');
});

/* ---------------- Vật lý ---------------- */
test('bước cố định 1/120 s: đĩa trượt thẳng đi đúng v × DT, ma sát nhẹ giảm tốc theo e^(-F·DT) mỗi bước', () => {
  eq(E.DT, 1 / 120);
  let s = inPlay({ x: 100, y: 300, vx: 120, vy: -360 });
  s = E.step(s, NONE);
  near(s.puck.x, 100 + 120 * E.DT, 1e-9);
  near(s.puck.y, 300 - 360 * E.DT, 1e-9);
  near(s.puck.vx, 120 * FR, 1e-9);
  // Sau 1 s trượt tự do tốc độ còn e^(-F) (ma sát nhẹ: > 70%)
  let t = inPlay({ x: 180, y: 600, vx: 0, vy: -300 });
  for (let i = 0; i < E.HZ; i++) t = E.step(t, NONE);
  near(speedOf(t), 300 * Math.exp(-E.FRICTION), 1e-6);
  ok(Math.exp(-E.FRICTION) > 0.7);
});

test('dội thành trái / phải: đổi chiều vx theo hệ số E_WALL, đĩa không ra ngoài bàn, có sự kiện wall', () => {
  let s = inPlay({ x: E.W - E.PR - 1, y: 300, vx: 600, vy: -100 });
  s = E.step(s, NONE);
  ok(s.events.some((e) => e.type === 'wall'));
  near(s.puck.vx, -600 * E.E_WALL * FR, 1e-9);
  near(s.puck.vy, -100 * FR, 1e-9);
  ok(s.puck.x <= E.W - E.PR && s.puck.x >= E.PR);
  let t = inPlay({ x: E.PR + 1, y: 300, vx: -600, vy: 100 });
  t = E.step(t, NONE);
  ok(t.puck.vx > 0 && t.puck.x >= E.PR);
});

test('đầu bàn: ngoài miệng khung thì dội lại, trong miệng khung thì vào lưới', () => {
  let s = inPlay({ x: 40, y: E.PR + 2, vx: 0, vy: -500 });
  s = E.step(s, NONE);
  ok(s.puck.vy > 0 && s.puck.y >= E.PR, 'dội đầu bàn của máy');
  eq(s.score, [0, 0]);
  const r = runUntil(inPlay({ x: E.W / 2, y: 40, vx: 0, vy: -500 }), 'goal', 30, NONE);
  eq([r.ev.who, r.s.score, r.s.phase], [0, [1, 0], 'goal']);
  const r2 = runUntil(inPlay({ x: E.W / 2 + 20, y: E.L - 40, vx: 0, vy: 500 }), 'goal', 30, NONE);
  eq([r2.ev.who, r2.s.score], [1, [0, 1]]);
});

test('cột khung thành: đĩa lao vào cột thì bật ra, không vào lưới', () => {
  // Đĩa đi thẳng xuống đúng cột trái của khung người chơi
  let s = inPlay({ x: E.GOAL_L, y: E.L - 60, vx: 0, vy: 500 });
  let hitPost = false;
  for (let i = 0; i < 60; i++) {
    s = E.step(s, NONE);
    if (s.events.some((e) => e.type === 'wall') && s.puck.vy < 0) hitPost = true;
    eq(s.score, [0, 0]);
  }
  ok(hitPost, 'đĩa phải bật ra khỏi cột');
});

test('va chạm chày: đĩa đứng yên, chày lao tới với vận tốc u → đĩa bay ra (1 + e)·M/(M + m)·u (bảo toàn động lượng có hệ số)', () => {
  const y0 = 450;
  const s0 = inPlay({ x: 180, y: y0, m0: { x: 180, y: y0 + R2 + 1 } });
  const u = 6 * E.HZ; // chày đi 6 đơn vị trong một bước = 720 đơn vị / giây
  const s = E.step(s0, { target: { x: 180, y: y0 + R2 + 1 - 6 } });
  const ev = s.events.find((e) => e.type === 'hit');
  ok(ev && ev.who === 0, 'phải có cú chạm của người chơi');
  near(s.puck.vx, 0, 1e-9);
  near(s.puck.vy, -(1 + E.E_MALLET) * (E.MALLET_MASS / (E.MALLET_MASS + E.PUCK_MASS)) * u * FR, 1e-6);
  // Kiểm động lượng: nếu chày tự do thì Δp đĩa + Δp chày = 0 và vận tốc tương đối sau = -e × trước
  const vp = -(1 + E.E_MALLET) * E.MASS_K * u; // đĩa (trước ma sát)
  const vm = -u - (E.PUCK_MASS * vp) / E.MALLET_MASS; // chày tự do nhận xung lượng ngược lại
  near(E.PUCK_MASS * vp + E.MALLET_MASS * vm, E.MALLET_MASS * -u, 1e-6);
  near(vp - vm, -E.E_MALLET * u, 1e-6);
});

test('đĩa đập vào chày đứng yên: thành phần pháp tuyến đổi chiều theo hệ số, thành phần tiếp tuyến giữ nguyên', () => {
  // Đĩa lao chéo vào chày đứng yên, chạm lệch 45°
  const c = { x: 180, y: 500 };
  const d = R2 + 3;
  const s0 = inPlay({ x: c.x - d / Math.SQRT2, y: c.y - d / Math.SQRT2, vx: 300, vy: 300, m0: c });
  const r = runUntil(s0, 'hit', 10, (s) => ({ target: c }));
  const n = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  const vn = r.s.puck.vx * n.x + r.s.puck.vy * n.y;
  const vt = r.s.puck.vx * -n.y + r.s.puck.vy * n.x;
  const k = Math.pow(FR, 1); // ma sát của bước va chạm
  near(vn, ((1 + E.E_MALLET) * E.MASS_K - 1) * 300 * Math.SQRT2 * Math.pow(FR, r.s.tick - s0.tick - 1) * k, 1e-3);
  near(vt, 0, 1e-6);
});

test('chống xuyên: đĩa ở trần tốc độ lao vào chày, chày quét nhanh qua đĩa đứng yên, đều phải chạm', () => {
  const c = { x: 180, y: 500 };
  const s0 = inPlay({ x: 180, y: c.y - R2 - 1, vx: 0, vy: E.PUCK_MAX, m0: c });
  ok(E.step(s0, { target: c }).events.some((e) => e.type === 'hit'), 'đĩa nhanh xuyên qua chày');
  // Chày đi một bước PLAYER_SPEED·DT = 20 đơn vị, đĩa nằm giữa quãng đó
  const s1 = inPlay({ x: 180, y: 480, m0: { x: 180, y: 480 + R2 + 2 } });
  const s2 = E.step(s1, { target: { x: 180, y: 480 + R2 + 2 - E.PLAYER_SPEED * E.DT } });
  ok(s2.puck.vy < 0, 'chày quét qua mà đĩa không bị đánh');
  ok(Math.hypot(s2.puck.x - s2.mallets[0].x, s2.puck.y - s2.mallets[0].y) >= R2 - 1e-6, 'chày đè lên đĩa');
});

test('trần tốc độ: cú đánh mạnh nhất không vượt PUCK_MAX; cả trận đĩa luôn trong bàn và không vượt trần', () => {
  const s0 = inPlay({ x: 180, y: 450, vx: 0, vy: 900, m0: { x: 180, y: 450 + R2 + 1 } });
  const s = E.step(s0, { target: { x: 180, y: 300 } });
  ok(s.events.some((e) => e.type === 'hit'));
  near(speedOf(s), E.PUCK_MAX * FR, 1e-6);
  let top = 0;
  const ctrl = E.makeController(HUMAN, 5);
  playMatch('hard', ctrl, 5, (p, t) => {
    top = Math.max(top, speedOf(t));
    const q = t.puck;
    if (t.phase === 'play') {
      ok(q.x >= E.PR - 1e-6 && q.x <= E.W - E.PR + 1e-6, 'đĩa ra ngoài thành bên: ' + q.x);
      const mouth = q.x > E.GOAL_L && q.x < E.GOAL_R;
      ok(mouth || (q.y >= E.PR - 1e-6 && q.y <= E.L - E.PR + 1e-6), 'đĩa xuyên đầu bàn: ' + q.x + ',' + q.y);
      for (let i = 0; i < 2; i++) ok(Math.hypot(q.x - t.mallets[i].x, q.y - t.mallets[i].y) >= R2 - 0.5, 'chày ' + i + ' đè lên đĩa');
    }
  });
  ok(top <= E.PUCK_MAX + 1e-6, 'tốc độ lớn nhất ' + top);
  ok(top > E.PUCK_MAX * 0.9, 'trận đấu phải có cú đánh mạnh');
});

test('đĩa kẹt giữa chày và góc bàn: không được bơm thêm năng lượng, chày không đè lên đĩa', () => {
  // Chày người chơi ép đĩa vào góc dưới phải liên tục
  let s = inPlay({ x: E.W - E.PR - 1, y: E.L - E.PR - 1, vx: 50, vy: 50, m0: { x: E.W - 80, y: E.L - 80 } });
  let top = 0;
  for (let i = 0; i < E.HZ * 2; i++) {
    s = E.step(s, { target: { x: E.W, y: E.L } });
    top = Math.max(top, speedOf(s));
    ok(Math.hypot(s.puck.x - s.mallets[0].x, s.puck.y - s.mallets[0].y) >= R2 - 1e-6, 'chày đè lên đĩa ở bước ' + i);
  }
  ok(top < 2 * 500, 'đĩa bị bơm năng lượng: ' + top);
  ok(speedOf(s) < 50, 'đĩa phải nằm yên trong góc, tốc độ ' + speedOf(s));
});

test('chày người chơi: theo chuột có trần PLAYER_SPEED, phím đi KEY_SPEED, không ra khỏi nửa sân mình', () => {
  let s = inPlay({ x: 180, y: 100, m0: { x: 180, y: 500 } });
  s = E.step(s, { target: { x: 180, y: 0 } });
  near(500 - s.mallets[0].y, E.PLAYER_SPEED * E.DT, 1e-9);
  const k = E.step(inPlay({ x: 180, y: 100, m0: { x: 180, y: 500 } }), { target: null, dx: 1, dy: 0 });
  near(k.mallets[0].x - 180, E.KEY_SPEED * E.DT, 1e-9);
  const diag = E.step(inPlay({ x: 180, y: 100, m0: { x: 180, y: 500 } }), { dx: 1, dy: 1 });
  near(Math.hypot(diag.mallets[0].x - 180, diag.mallets[0].y - 500), E.KEY_SPEED * E.DT, 1e-9);
  for (let i = 0; i < 100; i++) s = E.step(s, { target: { x: -500, y: -500 } });
  eq([s.mallets[0].x, s.mallets[0].y], [E.MR, E.L / 2 + E.MR]);
  for (let i = 0; i < 100; i++) s = E.step(s, { target: { x: 9999, y: 9999 } });
  eq([s.mallets[0].x, s.mallets[0].y], [E.W - E.MR, E.L - E.MR]);
});

/* ---------------- Bàn thắng, giao đĩa lại, kết thúc ---------------- */
test('sau bàn thắng: nghỉ GOAL_PAUSE, rồi bên thủng lưới được giao đĩa ở nửa sân mình', () => {
  let s = giveGoal(E.newGame({ seed: 4 }), 0);
  eq([s.score, s.phase, s.timer, s.receiver], [[1, 0], 'goal', E.GOAL_PAUSE, 1]);
  for (let i = 0; i < E.GOAL_PAUSE; i++) s = E.step(s, hold(s));
  eq([s.phase, s.receiver, s.timer, s.puck.y], ['faceoff', 1, E.FACEOFF, E.SPOT[1]]);
  s = giveGoal(s, 1);
  eq([s.score, s.receiver], [[1, 1], 0]);
});

test('ai tới 7 bàn trước thắng; sau khi xong step không đổi gì', () => {
  let s = inPlay({ x: 180, y: 300, score: [6, 6] });
  s = giveGoal(s, 1);
  eq([s.score, s.phase, s.winner, E.isOver(s)], [[6, 7], 'over', 1, true]);
  ok(s.events.some((e) => e.type === 'over' && e.winner === 1));
  const again = E.step(s, { target: { x: 10, y: 600 } });
  eq(E.toJSON(again), E.toJSON(s));
  const w = giveGoal(inPlay({ x: 180, y: 300, score: [6, 0] }), 0);
  eq([w.score, w.winner], [[7, 0], 0]);
});

test('chống câu giờ: đĩa nằm một nửa sân quá STALL bước thì bên kia được giao đĩa', () => {
  let s = inPlay({ x: 100, y: 500 });
  let ev = null;
  for (let i = 0; i < E.STALL && !ev; i++) {
    s = E.step(s, hold(s));
    ev = s.events.find((e) => e.type === 'stall');
    if (!ev) eq(s.phase, 'play');
  }
  ok(ev && ev.who === 0, 'phải chuyển quyền khi người chơi giữ đĩa quá lâu');
  eq([s.phase, s.receiver, s.puck.y, s.score], ['faceoff', 1, E.SPOT[1], [0, 0]]);
  ok(E.STALL / E.HZ >= 5 && E.STALL / E.HZ <= 10);
});

test('trận 7-0 không thể xong trước 15 s (cơ sở cho min_duration_ms)', () => {
  const bound = E.fastestWin();
  ok(bound > 15, 'cận dưới ' + bound.toFixed(1) + ' s');
  // Mọi trận bot thắng trong mô phỏng đều lâu hơn cận dưới
  let fastest = Infinity;
  ['easy', 'medium'].forEach((lv) => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = playMatch(lv, E.makeController('hard', seed), seed);
      if (s.winner === 0) fastest = Math.min(fastest, s.tick / E.HZ);
    }
  });
  ok(fastest >= bound, 'trận nhanh nhất ' + fastest.toFixed(1) + ' s < ' + bound.toFixed(1));
});

/* ---------------- Máy ---------------- */
test('máy không bao giờ đi chày nhanh hơn tốc độ của mức và không rời nửa sân của mình', () => {
  ['easy', 'medium', 'hard'].forEach((lv, i) => {
    const lim = E.LEVELS[lv].speed * E.DT + 1e-9;
    let worst = 0;
    playMatch(lv, E.makeController(HUMAN, 11 + i), 11 + i, (p, s) => {
      worst = Math.max(worst, Math.hypot(s.mallets[1].x - p.mallets[1].x, s.mallets[1].y - p.mallets[1].y));
      const m = s.mallets[1];
      ok(m.y <= E.L / 2 - E.MR + 1e-9 && m.y >= E.MR - 1e-9 && m.x >= E.MR - 1e-9 && m.x <= E.W - E.MR + 1e-9, lv + ': chày máy ra khỏi sân');
    });
    ok(worst <= lim, lv + ': ' + worst + ' > ' + lim);
    ok(worst > lim * 0.9, lv + ': máy phải có lúc chạy hết tốc độ');
  });
});

test('máy phản ứng trễ: đĩa đổi hướng về phía máy thì đích của máy giữ nguyên đúng `reaction` bước', () => {
  ['easy', 'medium', 'hard'].forEach((lv) => {
    const rt = E.LEVELS[lv].reaction;
    // Đĩa đang bay xuống, chày người chơi đánh ngược lên
    let s = inPlay({ level: lv, x: 180, y: 520, vx: 0, vy: 300, m0: { x: 180, y: 520 + R2 + 2 }, m1: { x: 180, y: 60 } });
    s.ai.sign = 1;
    s.ai.wait = 1000; // đang giữ quyết định cũ
    s.ai.tx = 30;
    s.ai.ty = 40;
    s = E.step(s, { target: { x: 180, y: 520 + R2 + 1 } }); // đỡ nhẹ: đĩa bay lên chậm, chưa tới sân máy trong lúc chờ
    ok(s.puck.vy < -30, lv + ': đĩa phải bay lên');
    const target = [s.ai.tx, s.ai.ty];
    // Máy thấy đĩa đổi hướng từ bước sau cú đánh, rồi giữ nguyên đích thêm đúng `reaction` bước
    for (let i = 0; i < rt; i++) {
      s = E.step(s, hold(s));
      eq([s.ai.tx, s.ai.ty], target, lv + ' bước ' + (i + 1));
    }
    s = E.step(s, hold(s));
    ok(s.ai.tx !== target[0] || s.ai.ty !== target[1], lv + ': hết thời gian trễ thì máy phải quyết định lại');
  });
});

test('mức khó hơn: phản ứng nhanh hơn, chày nhanh hơn, sai số nhỏ hơn; Dễ chỉ đỡ, Vừa phản công, Khó đoán dội thành và đánh góc', () => {
  const { easy, medium, hard } = E.LEVELS;
  ok(easy.reaction > medium.reaction && medium.reaction > hard.reaction);
  ok(easy.speed < medium.speed && medium.speed < hard.speed);
  ok(easy.error > medium.error && medium.error > hard.error);
  eq([easy.attack, medium.attack, hard.attack], [false, true, true]);
  eq([easy.predict, medium.predict, hard.predict], ['none', 'straight', 'bounce']);
  eq(hard.aim, 'bank');
});

test('đoán quỹ đạo: cách "bounce" (mức Khó) tính đúng chỗ đĩa cắt hàng thủ sau khi dội thành, cách "straight" thì sai', () => {
  // Đĩa bay chéo, sẽ dội thành phải một lần trước khi tới hàng y = 60
  const p = { x: 300, y: 300, vx: 260, vy: -520 };
  const y = 60;
  let s = inPlay({ x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  let real = null;
  for (let i = 0; i < 300 && real == null; i++) {
    const prev = s;
    s = E.step(s, NONE);
    if (prev.puck.y > y && s.puck.y <= y) real = prev.puck.x + ((s.puck.x - prev.puck.x) * (prev.puck.y - y)) / (prev.puck.y - s.puck.y);
  }
  ok(s.events.length >= 0 && real != null);
  near(E.interceptX(p, y, 'bounce'), real, 6, 'bounce');
  ok(Math.abs(E.interceptX(p, y, 'straight') - real) > 40, 'straight không tính dội thành');
  eq(E.interceptX(p, y, 'none'), p.x);
});

// Mô phỏng nhiều trận: bot người (phản ứng 0,25 s) đấu từng mức, và máy đấu máy (mức cao điều khiển chày dưới)
function series(ctrlFor, level, n) {
  const r = { won: 0, gf: 0, ga: 0, time: 0 };
  for (let seed = 1; seed <= n; seed++) {
    const s = playMatch(level, ctrlFor(seed), seed);
    if (s.winner === 0) r.won++;
    r.gf += s.score[0];
    r.ga += s.score[1];
    r.time += s.tick / E.HZ;
  }
  return r;
}
const N = 16;
const human = {};
['easy', 'medium', 'hard'].forEach((lv) => (human[lv] = series((seed) => E.makeController(HUMAN, seed * 31), lv, N)));
const fmtR = (r) => r.won + '/' + N + ' (' + r.gf + '-' + r.ga + ', ~' + Math.round(r.time / N) + ' s/trận)';

test('mức mạnh dần với bot người: Dễ thua gần hết, Vừa thua phần lớn, Khó thắng phần lớn', () => {
  console.log('       bot người thắng: Dễ ' + fmtR(human.easy) + ', Vừa ' + fmtR(human.medium) + ', Khó ' + fmtR(human.hard));
  ok(human.easy.won >= N - 1, 'Dễ');
  ok(human.medium.won >= N / 2 && human.medium.won < human.easy.won, 'Vừa');
  ok(human.hard.won >= 1 && human.hard.won < N / 2, 'Khó: bot người vẫn thắng được nhưng thua nhiều hơn');
  ok(human.easy.ga < human.medium.ga && human.medium.ga < human.hard.ga, 'máy mạnh hơn thì ghi nhiều bàn hơn');
});

test('máy đấu máy: Khó thắng Dễ, Vừa thắng Dễ, Khó thắng Vừa (phần lớn)', () => {
  const he = series((seed) => E.makeController('hard', seed), 'easy', N);
  const me = series((seed) => E.makeController('medium', seed), 'easy', N);
  const hm = series((seed) => E.makeController('hard', seed), 'medium', N);
  console.log('       Khó-Dễ ' + fmtR(he) + ', Vừa-Dễ ' + fmtR(me) + ', Khó-Vừa ' + fmtR(hm));
  ok(he.won >= N - 1, 'Khó vs Dễ');
  ok(me.won >= N - 1, 'Vừa vs Dễ');
  ok(hm.won >= (N * 2) / 3, 'Khó vs Vừa');
});

/* ---------------- Tất định ---------------- */
test('tất định: cùng seed + cùng chuỗi input cho cùng kết quả; seed khác thì khác', () => {
  const run = (seed) => {
    let s = E.newGame({ level: 'medium', seed });
    for (let i = 0; i < 3000; i++) s = E.step(s, { target: { x: 180 + 120 * Math.sin(i / 37), y: 520 + 60 * Math.cos(i / 23) } });
    return JSON.stringify(E.toJSON(s));
  };
  eq(run(42), run(42));
  ok(run(42) !== run(43));
  const a = playMatch('hard', E.makeController(HUMAN, 3), 3);
  const b = playMatch('hard', E.makeController(HUMAN, 3), 3);
  eq([a.score, a.tick], [b.score, b.tick]);
});

test('step không sửa trạng thái cũ', () => {
  const s = inPlay({ x: 180, y: 450, vy: 300, m0: { x: 180, y: 450 + R2 + 1 } });
  const before = JSON.stringify(E.toJSON(s));
  E.step(s, { target: { x: 10, y: 400 } });
  eq(JSON.stringify(E.toJSON(s)), before);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván và chạy tiếp y hệt', () => {
  let s = E.newGame({ level: 'hard', seed: 8 });
  const ctrl = E.makeController(HUMAN, 8);
  for (let i = 0; i < 2000; i++) s = E.step(s, ctrl(s));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s))));
  ok(back, 'khôi phục được');
  eq(E.toJSON(back), E.toJSON(s));
  let a = s;
  let b = back;
  for (let i = 0; i < 600; i++) {
    a = E.step(a, { target: { x: 120, y: 500 } });
    b = E.step(b, { target: { x: 120, y: 500 } });
  }
  eq(E.toJSON(a), E.toJSON(b));
});

test('mở lại ván dở: giao đĩa lại ở tỉ số hiện tại cho bên đang giữ đĩa, chày về chỗ chờ', () => {
  const s = inPlay({ level: 'easy', x: 100, y: 200, vx: 50, vy: -500, score: [4, 3] });
  const r = E.resume(s);
  eq([r.score, r.phase, r.timer, r.receiver, r.puck.y, r.puck.vy], [[4, 3], 'faceoff', E.FACEOFF, 1, E.SPOT[1], 0]);
  eq(r.mallets.map((m) => [m.x, m.y]), [[E.HOME[0].x, E.HOME[0].y], [E.HOME[1].x, E.HOME[1].y]]);
  const g = giveGoal(inPlay({ level: 'easy', x: 0, y: 0, score: [2, 2] }), 1); // máy vừa ghi bàn: người chơi được giao
  eq(E.resume(g).receiver, 0);
  const over = giveGoal(inPlay({ level: 'easy', x: 180, y: 300, score: [6, 2] }), 0);
  eq(E.resume(over).phase, 'over');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(giveGoal(inPlay({ level: 'medium', x: 180, y: 300 }), 0));
  ok(E.fromJSON(JSON.parse(JSON.stringify(good))), 'ván hợp lệ phải đọc được');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  [
    null, 1, 'x', {}, [],
    bad({ v: 2 }),
    bad({ level: 'insane' }),
    bad({ phase: 'warmup' }),
    bad({ score: [1] }),
    bad({ score: ['1', 0] }),
    bad({ score: [-1, 0] }),
    bad({ score: [7, 2] }), // đã đủ 7 bàn mà chưa kết thúc
    bad({ score: [8, 2], phase: 'over', winner: 0 }),
    bad({ phase: 'over', winner: 0 }), // kết thúc mà chưa ai đủ bàn
    bad({ released: false }), // có bàn mà chưa thả đĩa lần nào
    bad({ receiver: 2 }),
    bad({ timer: -1 }),
    bad({ timer: 1.5 }),
    bad({ stall: E.STALL + 1 }),
    bad({ rng: -3 }),
    bad({ touch: [0] }),
    bad({ puck: { x: NaN, y: 0, vx: 0, vy: 0 } }),
    bad({ puck: { x: 900, y: 0, vx: 0, vy: 0 } }),
    bad({ puck: { x: 10, y: 10, vx: E.PUCK_MAX, vy: E.PUCK_MAX } }),
    bad({ mallets: [{ x: 180, y: 100, vx: 0, vy: 0 }, { x: 180, y: 60, vx: 0, vy: 0 }] }), // chày người chơi ở sân máy
    bad({ mallets: [{ x: 180, y: 600, vx: 0, vy: 0 }] }),
    bad({ ai: { wait: 0, tx: 'a', ty: 0, err: 0, aimX: 0, aimErr: 0, sign: 0, bank: 0 } }),
    bad({ ai: null }),
  ].forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw).slice(0, 90)));
});

test('ván lưu dựng sẵn của e2e.spec.ts: không điều khiển, mức Dễ, ván WIN thắng 7-2 và ván LOSE thua 2-7 trong vài giây', () => {
  const base = {
    v: 1, level: 'easy', phase: 'faceoff', timer: 120, tick: 6000, released: true, winner: null, receiver: 1, half: 1, stall: 0, shots: 0,
    touch: [-1, -1], puck: { x: 180, y: 190, vx: 0, vy: 0 },
    mallets: [{ x: 180, y: 576, vx: 0, vy: 0 }, { x: 180, y: 64, vx: 0, vy: 0 }],
    ai: { wait: 0, tx: 180, ty: 64, err: 0, aimX: 0, aimErr: 0, sign: 0, bank: 0 },
  };
  [[[6, 2], 1831566652, 0, [7, 2]], [[2, 6], 1831565927, 1, [2, 7]]].forEach(([score, rng, winner, final]) => {
    let s = E.fromJSON(Object.assign({}, base, { score, rng }));
    ok(s, 'ván lưu e2e phải hợp lệ');
    s = E.resume(s); // app mở lại ván lưu bằng resume
    let n = 0;
    while (!E.isOver(s) && n < E.HZ * 12) {
      s = E.step(s, { target: null });
      n++;
    }
    eq([s.winner, s.score], [winner, final]);
  });
});

delete E.LEVELS.frozen;
console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
