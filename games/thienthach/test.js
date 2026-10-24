/* Kiểm tra engine Thiên Thạch: chạy `node test.js`
 * - Sân xuyên mép, quán tính / ma sát / trần tốc độ, đạn (tầm bay, giới hạn, nhịp bắn)
 * - Đá vỡ đôi kèm quán tính, va chạm hình tròn (cả qua mép, đạn nhanh không xuyên), điểm 20/50/100
 * - Đĩa bay (lớn bắn bừa, nhỏ nhắm, nhỏ chỉ xuất hiện về sau), đợt mới, mạng, thêm mạng mỗi 10.000
 * - Hồi sinh chỉ khi tâm sân trống, dịch chuyển rủi ro, hết ván
 * - Tất định theo seed + chuỗi input, lưu / khôi phục và từ chối dữ liệu hỏng
 * - Chơi được: bot nhắm bắn với phản xạ người thật dọn sạch đợt 1 trên nhiều seed
 */
const E = require('./engine.js');

const C = E.CONST;
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
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= (eps || 1e-9), (msg ? msg + ': ' : '') + a + ' ≉ ' + b);

/** Ván trống để dựng tình huống: không đá, không đĩa bay, tàu ở tâm hết bất tử. */
function blank(seed) {
  const g = E.newGame(seed == null ? 1 : seed);
  g.rocks = [];
  g.saucerT = 1e5;
  g.ship.inv = 0;
  g.waveT = 1e9; // sân trống không tự sang đợt mới (test về đợt đặt lại 0)
  g.events = [];
  return g;
}
function rock(s, x, y, vx, vy) {
  return { x, y, vx: vx || 0, vy: vy || 0, s, a: 0, spin: 0, shape: new Array(C.SHAPE_N).fill(90) };
}
const types = (g) => g.events.map((e) => e.type);

/* ---------------- Bot (dùng cho test "chơi được"; app không dùng) ---------------- */
/**
 * Bot nhắm bắn với giới hạn của người thật: chỉ "nhìn" sân mỗi REACT bước (200 ms), giữ quyết định giữa hai
 * lần nhìn; bắn bằng cách giữ nút (nhịp tối đa của game). Nhắm đón đầu mục tiêu gần nhất, né đá sắp đâm bằng đẩy.
 */
function makeBot(react) {
  const REACT = react || 12;
  let plan = {};
  return function (g, i) {
    if (i % REACT !== 0) return plan;
    plan = {};
    const s = g.ship;
    if (!s || s.hyper) return plan;
    const targets = g.rocks.map((r) => ({ x: r.x, y: r.y, vx: r.vx, vy: r.vy, r: E.rockRadius(r.s) }));
    if (g.saucer) targets.push({ x: g.saucer.x, y: g.saucer.y, vx: g.saucer.vx, vy: g.saucer.vy, r: E.saucerRadius(g.saucer.small), saucer: true });
    let best = null;
    let bestD = Infinity;
    for (const t of targets) {
      const dx = E.delta(s.x, t.x, C.W);
      const dy = E.delta(s.y, t.y, C.H);
      const d = Math.hypot(dx, dy) - (t.saucer ? 120 : 0); // ưu tiên đĩa bay
      if (d < bestD) {
        bestD = d;
        best = { t, dx, dy };
      }
    }
    if (!best) return plan;
    // Đón đầu: đạn bay BULLET_SPEED cộng vận tốc tàu, nên tính theo vận tốc tương đối
    let tt = Math.hypot(best.dx, best.dy) / C.BULLET_SPEED;
    let px = 0;
    let py = 0;
    for (let k = 0; k < 3; k++) {
      px = best.dx + (best.t.vx - s.vx) * (tt + REACT / 2);
      py = best.dy + (best.t.vy - s.vy) * (tt + REACT / 2);
      tt = Math.hypot(px, py) / C.BULLET_SPEED;
    }
    const aim = Math.atan2(py, px);
    plan.aim = aim;
    const diff = Math.abs(E.normAngle(aim - s.a));
    plan.fire = diff < 0.35 && tt < C.BULLET_LIFE;
    // Né: đá nào sắp tới gần trong ~0,7 giây thì đẩy theo hướng mũi tàu đang có (nếu không lao thẳng vào đá đó)
    for (const t of targets) {
      const dx = E.delta(s.x, t.x, C.W);
      const dy = E.delta(s.y, t.y, C.H);
      const rvx = t.vx - s.vx;
      const rvy = t.vy - s.vy;
      const v2 = rvx * rvx + rvy * rvy;
      const tc = v2 > 0 ? Math.max(0, Math.min(40, -(dx * rvx + dy * rvy) / v2)) : 0;
      const cx = dx + rvx * tc;
      const cy = dy + rvy * tc;
      if (Math.hypot(cx, cy) < t.r + C.SHIP_R + 18) {
        const facing = Math.cos(s.a) * dx + Math.sin(s.a) * dy;
        if (facing < 0) plan.thrust = true;
        else plan.aim = Math.atan2(-dy, -dx) + 0.6;
        break;
      }
    }
    return plan;
  };
}

/* ---------------- Ván mới ---------------- */
test('ván mới: 3 mạng, 0 điểm, đợt 1 có 4 đá lớn cách xa tàu', () => {
  const g = E.newGame(7);
  eq([g.lives, g.score, g.wave, g.over, g.rocks.length], [3, 0, 1, false, 4]);
  g.rocks.forEach((r) => {
    eq(r.s, 3);
    ok(E.delta(g.ship.x, r.x, C.W) ** 2 + E.delta(g.ship.y, r.y, C.H) ** 2 >= C.SPAWN_CLEAR ** 2, 'đá quá gần tàu');
  });
  ok(g.ship.inv > 0, 'tàu bất tử lúc đầu');
});

test('cùng seed thì cùng ván, khác seed thì khác', () => {
  eq(E.toJSON(E.newGame(42)), E.toJSON(E.newGame(42)));
  eq(E.toJSON(E.newGame('2026-10-23')), E.toJSON(E.newGame('2026-10-23')));
  ok(JSON.stringify(E.toJSON(E.newGame(1))) !== JSON.stringify(E.toJSON(E.newGame(2))));
});

/* ---------------- Xuyên mép ---------------- */
test('xuyên mép: tàu, đá, đạn sang mép đối diện; khoảng cách tính đường ngắn nhất', () => {
  const g = blank();
  g.ship.x = C.W - 1;
  g.ship.vx = 3;
  g.rocks.push(rock(3, 2, 300, -4, 0));
  g.bullets.push({ x: 300, y: 1, vx: 0, vy: -5, life: 10 });
  E.step(g, {});
  ok(g.ship.x < 5, 'tàu sang mép trái: ' + g.ship.x);
  ok(g.rocks[0].x > C.W - 5, 'đá sang mép phải: ' + g.rocks[0].x);
  ok(g.bullets[0].y > C.H - 10, 'đạn sang mép dưới: ' + g.bullets[0].y);
  eq(E.delta(10, 710, 720), -20);
  eq(E.delta(710, 10, 720), 20);
  eq(E.wrap(-5, 720), 715);
});

test('va chạm hình tròn tính cả qua mép', () => {
  ok(E.circleHit(2, 100, 10, C.W - 3, 100, 10), 'hai bên mép trái / phải');
  ok(!E.circleHit(100, 100, 10, 125, 100, 10), 'cách 25 > 20');
  ok(E.circleHit(100, 100, 10, 120, 100, 10), 'cách đúng 20');
});

/* ---------------- Quán tính ---------------- */
test('quay: trái / phải mỗi bước đúng TURN; aim xoay dần tới đích rồi dừng', () => {
  const g = blank();
  const a0 = g.ship.a;
  E.step(g, { left: true });
  near(g.ship.a, a0 - C.TURN);
  E.step(g, { right: true });
  E.step(g, { right: true });
  near(g.ship.a, a0 + C.TURN);
  const target = 0; // sang phải
  let n = 0;
  while (Math.abs(g.ship.a - target) > 1e-9 && n < 100) {
    const before = g.ship.a;
    E.step(g, { aim: target });
    ok(Math.abs(E.normAngle(g.ship.a - before)) <= C.TURN + 1e-12, 'không quay quá TURN mỗi bước');
    n++;
  }
  near(g.ship.a, target);
  E.step(g, { aim: target });
  near(g.ship.a, target);
});

test('quán tính: thả nút đẩy tàu vẫn trôi, chậm dần theo DRAG', () => {
  const g = blank();
  g.ship.a = 0;
  E.run(g, 10, { thrust: true });
  const v = g.ship.vx;
  ok(v > 0 && Math.abs(g.ship.vy) < 1e-9, 'đang bay sang phải');
  const x = g.ship.x;
  E.step(g, {});
  near(g.ship.vx, v * C.DRAG);
  ok(g.ship.x > x, 'vẫn trôi');
  E.run(g, 600, {});
  ok(g.ship.vx < 0.01, 'gần dừng hẳn sau 10 giây: ' + g.ship.vx);
});

test('trần tốc độ: đẩy mãi không vượt MAX_SPEED', () => {
  const g = blank();
  g.ship.a = 0.7;
  let max = 0;
  for (let i = 0; i < 600; i++) {
    E.step(g, { thrust: true });
    max = Math.max(max, Math.hypot(g.ship.vx, g.ship.vy));
  }
  ok(max <= C.MAX_SPEED + 1e-9, 'vượt trần: ' + max);
  near(max, C.MAX_SPEED, 1e-6, 'chạm trần');
});

/* ---------------- Đạn ---------------- */
test('đạn: nhịp FIRE_CD, tối đa MAX_BULLETS, hết tầm thì mất', () => {
  const g = blank();
  E.step(g, { fire: true });
  eq(g.bullets.length, 1);
  ok(types(g).includes('shot'));
  E.run(g, C.FIRE_CD - 1, { fire: true });
  eq(g.bullets.length, 1, 'chưa hồi nhịp');
  E.step(g, { fire: true });
  eq(g.bullets.length, 2);
  E.run(g, C.FIRE_CD * 6, { fire: true });
  eq(g.bullets.length, C.MAX_BULLETS, 'giới hạn số đạn');
  const h = blank();
  E.step(h, { fire: true }); // bước bắn cũng là bước bay đầu tiên
  E.run(h, C.BULLET_LIFE - 2, {});
  eq(h.bullets.length, 1, 'còn bay ở bước cuối của tầm');
  E.step(h, {});
  eq(h.bullets.length, 0, 'hết tầm');
});

test('đạn mang theo vận tốc tàu', () => {
  const g = blank();
  g.ship.a = 0;
  g.ship.vx = 4;
  E.step(g, { fire: true });
  const b = g.bullets[0];
  near(b.vx, C.BULLET_SPEED + 4 * C.DRAG, 1e-9);
});

test('đạn nhanh không xuyên qua đá nhỏ (xét cả đoạn đi trong bước)', () => {
  ok(E.segmentHit(100, 100, 30, 0, 115, 102, 4), 'giữa đoạn');
  ok(!E.segmentHit(100, 100, 30, 0, 140, 100, 4), 'ngoài đoạn');
  const g = blank();
  g.rocks.push(rock(1, 360 + 8, 360, 0, 0));
  g.bullets.push({ x: 352, y: 360, vx: 25, vy: 0, life: 5 }); // bước sau đã ở 377, quá đá
  E.step(g, {});
  eq(g.rocks.length, 0);
  eq(g.score, 100);
});

/* ---------------- Đá vỡ ---------------- */
test('đá lớn vỡ thành 2 vừa (+20), vừa thành 2 nhỏ (+50), nhỏ biến mất (+100)', () => {
  const g = blank();
  g.rocks.push(rock(3, 500, 360));
  g.bullets.push({ x: 450, y: 360, vx: 9, vy: 0, life: 20 });
  E.run(g, 3, {});
  eq([g.rocks.length, g.rocks.map((r) => r.s), g.score, g.kills.rocks], [2, [2, 2], 20, 1]);
  const h = blank();
  h.rocks.push(rock(2, 500, 360));
  h.bullets.push({ x: 470, y: 360, vx: 9, vy: 0, life: 20 });
  E.run(h, 3, {});
  eq([h.rocks.map((r) => r.s), h.score], [[1, 1], 50]);
  const k = blank();
  k.waveT = 0;
  k.rocks.push(rock(1, 500, 360));
  k.bullets.push({ x: 480, y: 360, vx: 9, vy: 0, life: 20 });
  E.run(k, 3, {});
  eq([k.rocks.length, k.score], [0, 100]);
  ok(k.waveT > 0, 'hết đá thì đếm ngược sang đợt mới');
});

test('đá vỡ giữ quán tính: trung bình vận tốc hai mảnh ≈ đá mẹ × SPLIT_KEEP + đạn × SPLIT_PUSH', () => {
  let sumX = 0;
  let sumY = 0;
  const N = 300;
  for (let seed = 1; seed <= N; seed++) {
    const g = blank(seed);
    g.rocks.push(rock(3, 500, 360, 3, 0));
    g.bullets.push({ x: 495, y: 300, vx: 0, vy: 9, life: 20 });
    E.run(g, 20, {});
    ok(g.rocks.length === 2, 'vỡ đôi');
    const mx = (g.rocks[0].vx + g.rocks[1].vx) / 2;
    const my = (g.rocks[0].vy + g.rocks[1].vy) / 2;
    g.rocks.forEach((r) => ok(Math.hypot(r.vx, r.vy) <= C.ROCK_MAX_SPEED + 1e-9, 'quá nhanh'));
    sumX += mx;
    sumY += my;
  }
  near(sumX / N, 3 * C.SPLIT_KEEP, 0.08, 'vx trung bình');
  near(sumY / N, 9 * C.SPLIT_PUSH, 0.08, 'vy trung bình');
});

/* ---------------- Tàu nổ, hồi sinh, hết ván ---------------- */
test('tàu đâm đá: mất mạng, đá vỡ có điểm, đạn của tàu bị xóa', () => {
  const g = blank();
  g.bullets.push({ x: 100, y: 100, vx: 1, vy: 0, life: 30 });
  g.rocks.push(rock(3, 360 + 30, 360));
  E.step(g, {});
  eq([g.ship, g.lives, g.score, g.bullets.length], [null, 2, 20, 0]);
  ok(types(g).includes('die'));
});

test('đang bất tử thì đâm đá không sao', () => {
  const g = blank();
  g.ship.inv = 30;
  g.rocks.push(rock(3, 360 + 30, 360));
  E.step(g, {});
  ok(g.ship, 'tàu còn');
  eq(g.lives, 3);
});

test('hồi sinh chỉ khi tâm sân trống; hồi sinh thì bất tử SPAWN_INV', () => {
  const g = blank();
  g.rocks.push(rock(3, 360 + 30, 360));
  E.step(g, {});
  ok(!g.ship);
  // Mảnh vỡ nằm yên ngay tâm: đợi bao lâu cũng không hồi sinh
  g.rocks = [rock(1, 360, 360 + C.SAFE_R)];
  E.run(g, C.RESPAWN_WAIT + 200, {});
  ok(!g.ship, 'không hồi sinh khi còn đá trong bán kính an toàn');
  g.rocks = [rock(1, 360, 360 + C.SAFE_R + 30)];
  E.step(g, {});
  ok(g.ship, 'tâm trống thì hồi sinh');
  eq([g.ship.x, g.ship.y, g.ship.vx, g.ship.vy, g.ship.inv], [360, 360, 0, 0, C.SPAWN_INV]);
  ok(types(g).includes('respawn'));
});

test('chưa hết thời gian chờ thì chưa hồi sinh dù tâm trống', () => {
  const g = blank();
  g.rocks.push(rock(1, 360 + 15, 360));
  E.step(g, {});
  ok(!g.ship);
  g.rocks.push(rock(3, 50, 50)); // vẫn còn đá để không sang đợt
  E.run(g, C.RESPAWN_WAIT - 1, {});
  ok(!g.ship, 'còn chờ');
  E.step(g, {});
  ok(g.ship, 'hồi sinh');
});

test('đạn đĩa bay trong vùng an toàn cũng chặn hồi sinh', () => {
  const g = blank();
  g.rocks.push(rock(3, 50, 50));
  g.ship = null;
  g.lives = 2;
  g.deadT = 1;
  g.sbullets.push({ x: 360, y: 360 + 50, vx: 0, vy: 0, life: 60 });
  E.step(g, {});
  ok(!g.ship);
  ok(!E.centerClear(g));
});

test('hết mạng: chờ OVER_WAIT bước rồi hết ván; sau đó step không đổi gì', () => {
  const g = blank();
  g.lives = 1;
  g.rocks.push(rock(3, 360 + 30, 360));
  E.step(g, {});
  eq([g.lives, g.over], [0, false]);
  E.run(g, C.OVER_WAIT - 1, {});
  eq(g.over, false);
  E.step(g, {});
  eq(g.over, true);
  ok(types(g).includes('over'));
  const snap = JSON.stringify(E.toJSON(g));
  E.run(g, 50, { fire: true, thrust: true });
  eq(JSON.stringify(E.toJSON(g)), snap);
});

/* ---------------- Mạng thưởng ---------------- */
test('thêm mạng mỗi 10.000 điểm (một lần mỗi mốc)', () => {
  const g = blank();
  g.score = 9950;
  g.rocks.push(rock(1, 500, 360), rock(1, 500, 200));
  g.bullets.push({ x: 480, y: 360, vx: 9, vy: 0, life: 20 });
  E.run(g, 3, {});
  eq([g.score, g.lives, g.nextLife], [10050, 4, 20000]);
  g.bullets.push({ x: 480, y: 200, vx: 9, vy: 0, life: 20 });
  E.run(g, 3, {});
  eq([g.score, g.lives], [10150, 4], 'không thêm lần nữa');
});

/* ---------------- Đợt ---------------- */
test('dọn sạch sân: chờ WAVE_DELAY rồi sang đợt mới nhiều đá hơn (tối đa 12)', () => {
  const g = blank();
  g.waveT = 0;
  g.rocks = [];
  E.step(g, {});
  eq(g.waveT, C.WAVE_DELAY);
  ok(types(g).includes('clear'));
  E.run(g, C.WAVE_DELAY - 1, {});
  eq(g.wave, 1, 'còn chờ');
  E.step(g, {});
  eq([g.wave, g.rocks.length], [2, 6]);
  ok(types(g).includes('wave'));
  eq([1, 2, 3, 4, 5, 6, 10].map(E.waveCount), [4, 6, 8, 10, 12, 12, 12]);
});

test('đá đợt mới không xuất hiện sát tàu', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = blank(seed);
    g.ship.x = 100 + seed * 17;
    g.ship.y = 640 - seed * 13;
    g.rocks = [];
    g.waveT = 0;
    E.run(g, C.WAVE_DELAY + 1, {});
    ok(g.wave === 2, 'sang đợt 2');
    ok(g.rocks.length === 6, 'đợt 2');
    g.rocks.forEach((r) => ok(Math.hypot(E.delta(g.ship.x, r.x, C.W), E.delta(g.ship.y, r.y, C.H)) >= C.SPAWN_CLEAR - 1e-9, 'seed ' + seed));
  }
});

/* ---------------- Đĩa bay ---------------- */
test('đĩa bay xuất hiện khi hết hẹn giờ; đợt 1 chỉ có đĩa lớn', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = blank(seed);
    g.rocks.push(rock(3, 50, 50));
    g.waveT = 0;
    g.saucerT = 2;
    E.step(g, {});
    ok(!g.saucer, 'chưa tới giờ');
    E.step(g, {});
    ok(g.saucer, 'xuất hiện');
    ok(!g.saucer.small, 'đợt 1 không có đĩa nhỏ');
    ok(g.saucer.x < 0 || g.saucer.x > C.W, 'vào từ mép ngang');
  }
  eq(E.smallChance({ wave: 1, score: 0 }), 0);
  eq(E.smallChance({ wave: 2, score: 9990 }), 0);
  ok(E.smallChance({ wave: 3, score: 0 }) > 0);
  ok(E.smallChance({ wave: 1, score: 10000 }) > 0);
});

test('về sau có đĩa nhỏ', () => {
  let small = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const g = blank(seed);
    g.wave = 6;
    g.rocks.push(rock(3, 50, 50));
    E.spawnSaucer(g);
    if (g.saucer.small) small++;
  }
  ok(small > 40 && small < 100, 'tỉ lệ đĩa nhỏ ở đợt 6: ' + small);
});

test('đĩa lớn bắn hướng ngẫu nhiên, đĩa nhỏ nhắm vào tàu (lệch tối đa aimSpread)', () => {
  const dirsBig = [];
  for (let seed = 1; seed <= 80; seed++) {
    for (const small of [false, true]) {
      const g = blank(seed);
      g.rocks.push(rock(3, 50, 50));
      g.ship.inv = 999;
      g.ship.x = 360;
      g.ship.y = 400;
      g.saucer = { x: 100, y: 200, vx: small ? 2.4 : 1.6, vy: 0, small, fireT: 1, turnT: 999 };
      E.step(g, {});
      eq(g.sbullets.length, 1, 'bắn một phát');
      const b = g.sbullets[0];
      const dir = Math.atan2(b.vy, b.vx);
      if (small) {
        const want = Math.atan2(400 - 200, 360 - (100 + 2.4));
        ok(Math.abs(E.normAngle(dir - want)) <= E.aimSpread(g) + 1e-9, 'nhắm lệch quá');
      } else dirsBig.push(dir);
    }
  }
  // Đĩa lớn: hướng phủ cả bốn góc phần tư
  const quads = new Set(dirsBig.map((d) => Math.floor(((d + Math.PI) / (Math.PI * 2)) * 4)));
  eq(quads.size, 4);
  ok(E.aimSpread({ score: 50000 }) < E.aimSpread({ score: 0 }), 'điểm cao bắn chuẩn hơn');
});

test('đĩa bay hết bề ngang thì rời sân, không điểm, hẹn lần sau', () => {
  const g = blank();
  g.rocks.push(rock(3, 50, 50));
  g.saucer = { x: C.W + 15, y: 300, vx: 1.6, vy: 0, small: false, fireT: 999, turnT: 999 };
  E.step(g, {});
  eq([g.saucer, g.score], [null, 0]);
  ok(g.saucerT >= 300, 'hẹn lần sau');
});

test('bắn trúng đĩa lớn +200, đĩa nhỏ +1000', () => {
  for (const [small, pts] of [[false, 200], [true, 1000]]) {
    const g = blank();
    g.rocks.push(rock(3, 50, 50));
    g.saucer = { x: 500, y: 360, vx: 0.0001, vy: 0, small, fireT: 999, turnT: 999 };
    g.bullets.push({ x: 470, y: 360, vx: 9, vy: 0, life: 20 });
    E.run(g, 4, {});
    eq([g.saucer, g.score, g.kills.saucers], [null, pts, 1]);
  }
});

test('đạn đĩa bay làm tàu nổ và làm vỡ đá (không ai được điểm)', () => {
  const g = blank();
  g.rocks.push(rock(3, 50, 50));
  g.sbullets.push({ x: 360, y: 330, vx: 0, vy: 5.5, life: 30 });
  E.run(g, 6, {});
  eq([g.ship, g.lives], [null, 2]);
  const h = blank();
  h.rocks.push(rock(2, 200, 200), rock(3, 600, 600));
  h.sbullets.push({ x: 200, y: 160, vx: 0, vy: 5.5, life: 30 });
  E.run(h, 6, {});
  eq([h.rocks.length, h.score], [3, 0]);
});

test('đĩa bay đâm đá: đĩa nổ, đá vỡ, không điểm', () => {
  const g = blank();
  g.rocks.push(rock(3, 200, 200), rock(3, 600, 600));
  g.saucer = { x: 160, y: 200, vx: 1.6, vy: 0, small: false, fireT: 999, turnT: 999 };
  E.step(g, {});
  eq([g.saucer, g.score, g.rocks.length], [null, 0, 3]);
});

/* ---------------- Dịch chuyển ---------------- */
test('dịch chuyển: biến mất HYPER_TIME bước (không va chạm), hiện lại chỗ khác; giữ phím không dịch tiếp', () => {
  const g = blank();
  g.rocks.push(rock(3, 50, 50));
  E.step(g, { hyper: true });
  eq(g.ship.hyper, C.HYPER_TIME);
  ok(types(g).includes('hyperIn'));
  g.rocks.push(rock(3, 360, 360)); // đá ngay chỗ tàu cũ: đang dịch chuyển thì không sao
  E.run(g, C.HYPER_TIME - 1, { hyper: true });
  ok(g.ship && g.ship.hyper === 1);
  g.rocks.pop();
  E.step(g, { hyper: true });
  ok(types(g).includes('hyperOut'));
  if (g.ship) {
    eq(g.ship.hyper, 0);
    E.run(g, C.HYPER_CD + 5, { hyper: true });
    ok(g.ship && g.ship.hyper === 0, 'giữ phím không dịch chuyển lại');
  }
});

test('dịch chuyển có rủi ro: đôi khi nổ khi hiện lại, phần lớn thì sống', () => {
  let dead = 0;
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const g = blank(seed);
    g.rocks.push(rock(3, 50, 50));
    E.step(g, { hyper: true });
    E.run(g, C.HYPER_TIME, {});
    if (!g.ship && g.events.some((e) => e.type === 'die' && e.cause === 'hyper')) dead++;
  }
  ok(dead > N * 0.03 && dead < N * 0.2, 'tỉ lệ nổ: ' + dead + '/' + N);
});

/* ---------------- Tất định, lưu / khôi phục ---------------- */
function scripted(i) {
  // Chuỗi input cố định nhưng đa dạng
  const k = (i * 2654435761) >>> 0;
  return { left: (k & 7) === 1, right: (k & 7) === 2, thrust: (k & 3) === 0, fire: (k & 1) === 1, hyper: i % 997 === 500 };
}

test('tất định: cùng seed + cùng chuỗi input thì ra đúng cùng ván', () => {
  const a = E.run(E.newGame(99), 4000, (g, i) => scripted(i));
  const b = E.run(E.newGame(99), 4000, (g, i) => scripted(i));
  eq(E.toJSON(a), E.toJSON(b));
  ok(a.tick > 100);
});

test('lưu giữa chừng rồi chạy tiếp ra đúng như không lưu', () => {
  const a = E.newGame(5);
  const bot = makeBot();
  for (let i = 0; i < 1500; i++) E.step(a, bot(a, i));
  const saved = JSON.parse(JSON.stringify(E.toJSON(a)));
  const b = E.fromJSON(saved);
  ok(b, 'khôi phục được');
  eq(E.toJSON(b), E.toJSON(a));
  for (let i = 0; i < 1500; i++) {
    const inp = scripted(i);
    E.step(a, inp);
    E.step(b, inp);
  }
  eq(E.toJSON(b), E.toJSON(a));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.run(E.newGame(3), 200, (g, i) => scripted(i)));
  ok(E.fromJSON(JSON.parse(JSON.stringify(good))), 'ván tốt');
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: 1.5 }),
    Object.assign({}, good, { lives: 99 }),
    Object.assign({}, good, { wave: 0 }),
    Object.assign({}, good, { nextLife: 15000 }),
    Object.assign({}, good, { rocks: 'x' }),
    Object.assign({}, good, { rocks: [{ x: 1, y: 1, vx: 0, vy: 0, s: 4, a: 0, spin: 0, shape: new Array(C.SHAPE_N).fill(90) }] }),
    Object.assign({}, good, { rocks: [{ x: 1, y: 1, vx: 0, vy: 0, s: 2, a: 0, spin: 0, shape: [1, 2] }] }),
    Object.assign({}, good, { rocks: [{ x: 9999, y: 1, vx: 0, vy: 0, s: 2, a: 0, spin: 0, shape: new Array(C.SHAPE_N).fill(90) }] }),
    Object.assign({}, good, { bullets: new Array(C.MAX_BULLETS + 1).fill({ x: 1, y: 1, vx: 0, vy: 0, life: 5 }) }),
    Object.assign({}, good, { ship: Object.assign({}, good.ship || {}, { vx: 99 }) }),
    Object.assign({}, good, { ship: Object.assign({}, good.ship || {}, { x: NaN }) }),
    Object.assign({}, good, { saucer: { x: 1, y: 1, vx: 0, vy: 0, small: 'yes', fireT: 1, turnT: 1 } }),
    Object.assign({}, good, { over: 'no' }),
    Object.assign({}, good, { kills: null }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

/* ---------------- Chơi được ---------------- */
test('chơi được: bot phản xạ 200 ms dọn sạch đợt 1 trên mọi seed thử', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = E.newGame(seed);
    const bot = makeBot();
    let i = 0;
    while (g.wave === 1 && !g.over && i < 60 * 120) {
      E.step(g, bot(g, i));
      i++;
    }
    ok(g.wave >= 2, 'seed ' + seed + ' kẹt ở đợt 1 (over=' + g.over + ', còn ' + g.rocks.length + ' đá)');
    ok(g.score >= 4 * (20 + 2 * 50 + 4 * 100) - 1000, 'điểm hợp lý: ' + g.score);
  }
});

module.exports = { makeBot };
if (require.main === module) {
  console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
  if (failed) process.exit(1);
}
