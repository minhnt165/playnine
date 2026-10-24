/* Kiểm tra engine Bi-a: chạy `node test.js`
 * - Ván mới: tam giác đúng chuẩn (bi 8 giữa, hai góc một trơn một sọc), tất định theo seed
 * - Vật lý: bảo toàn động lượng khi va chạm, va chạm đầu-đầu, bi dừng hẳn, không xuyên băng / xuyên bi khi
 *   đánh lực tối đa, bi vào lỗ, mô phỏng tất định, đường ngắm dự đoán khớp mô phỏng
 * - Luật: phá bi (vạch phát bi, bi 8 rơi khi phá), chia nhóm, đánh tiếp / đổi lượt, các lỗi, bi trong tay,
 *   thắng / thua bằng bi 8
 * - Máy: luôn đánh hợp lệ, tất định, chia nhỏ được; mức mạnh dần (Khó thắng Dễ, Vừa thắng bot ngẫu nhiên)
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');

let passed = 0;
let failed = 0;
const t0 = Date.now();

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e));
  }
}
function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}
function ok(c, msg) {
  if (!c) throw new Error(msg || 'điều kiện sai');
}
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg ? msg + ': ' : '') + a + ' không gần ' + b + ' (±' + tol + ')');
const clone = (x) => JSON.parse(JSON.stringify(x));
const { W, H, R, D } = E;

/**
 * Ván dựng tay: chỉ có bi cái + các bi trong `balls` ({ n: [x, y] }), còn lại đã rơi (bi 8 để ở góc xa nếu không ghi).
 * opts: { turn, groups, ballInHand, isBreak }
 */
function setup(cue, balls, opts) {
  const o = opts || {};
  const g = E.newGame({ seed: 1 });
  g.balls = g.balls.map(() => ({ x: 0, y: 0, on: false }));
  g.balls[0] = { x: cue[0], y: cue[1], on: true };
  g.balls[8] = { x: 700, y: 470, on: true };
  Object.keys(balls).forEach((n) => { g.balls[n] = { x: balls[n][0], y: balls[n][1], on: balls[n][2] !== false }; });
  g.isBreak = !!o.isBreak;
  g.kitchen = !!o.isBreak;
  g.ballInHand = !!o.ballInHand || !!o.isBreak;
  g.groups = o.groups === undefined ? ['solid', 'stripe'] : o.groups;
  g.turn = o.turn || 0;
  g.shots = o.isBreak ? 0 : 5;
  return g;
}
const angleTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
/** Kết quả mô phỏng giả (để kiểm luật không cần vật lý). */
function fakeSim(g, potted, firstHit, railAfter, moveCue) {
  const balls = clone(g.balls);
  potted.forEach((n) => { balls[n].on = false; });
  if (moveCue) balls[0] = { x: moveCue[0], y: moveCue[1], on: balls[0].on };
  return { balls, firstHit, railAfter: railAfter !== false, potted: potted.map((n, i) => ({ n, p: 0, t: i })), events: [], frames: [], time: 1 };
}

/* ===================== Ván mới ===================== */

test('xếp bi: 15 bi trong tam giác, bi 8 giữa hàng ba, hai góc cuối một trơn một sọc, bi cái sau vạch', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const g = E.newGame({ seed });
    const spots = E.rackSpots();
    const at = (i) => g.balls.findIndex((b, n) => n > 0 && Math.hypot(b.x - spots[i].x, b.y - spots[i].y) < 0.1);
    eq(at(4), 8, 'bi 8 ở giữa');
    const c1 = E.groupOf(at(10));
    const c2 = E.groupOf(at(14));
    ok(c1 && c2 && c1 !== c2, 'hai góc khác nhóm');
    const used = new Set(spots.map((_, i) => at(i)));
    eq(used.size, 15, 'mỗi ô một bi');
    ok(g.balls[0].x <= E.HEAD_X && g.isBreak && g.ballInHand && g.kitchen && g.groups === null && g.turn === 0, 'cú phá');
    for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) ok(Math.hypot(g.balls[i].x - g.balls[j].x, g.balls[i].y - g.balls[j].y) >= D - 0.01, 'không đè nhau');
  }
});

test('cùng seed thì cùng cách xếp, khác seed thì khác', () => {
  eq(E.toJSON(E.newGame({ seed: 77 })), E.toJSON(E.newGame({ seed: 77 })));
  ok(JSON.stringify(E.newGame({ seed: 77 }).balls) !== JSON.stringify(E.newGame({ seed: 78 }).balls), 'seed khác phải xếp khác');
  eq(E.newGame({ seed: 5, first: 1 }).turn, 1, 'chọn bên phá');
});

/* ===================== Vật lý ===================== */

test('va chạm đầu-đầu: bi đích nhận gần hết vận tốc, bi cái gần như dừng, động lượng bảo toàn', () => {
  const g = setup([300, 250], { 1: [500, 250] });
  const sim = E.simulate(g.balls, 1500, 0, 0, {});
  const ev = sim.events.find((e) => e.k === 'ball');
  ok(ev && ev.a === 0 && ev.b === 1, 'bi cái chạm bi 1');
  const [ax, ay, bx, by] = ev.before;
  const [cx, cy, dx, dy] = ev.after;
  near(ax + bx, cx + dx, 1e-9, 'động lượng x');
  near(ay + by, cy + dy, 1e-9, 'động lượng y');
  near(dx / ax, (1 + E.E_BALL) / 2, 1e-9, 'bi đích');
  near(cx / ax, (1 - E.E_BALL) / 2, 1e-9, 'bi cái');
  ok(Math.abs(dy) < 1e-9 && Math.abs(cy) < 1e-9, 'không lệch hướng');
  ok(sim.balls[0].x < 500 - D + 15, 'bi cái dừng gần chỗ chạm, không xuyên qua bi 1: ' + sim.balls[0].x);
});

test('bảo toàn động lượng ở mọi va chạm bi–bi (cú phá và các cú ngẫu nhiên)', () => {
  const rng = E.makeRng(11);
  let n = 0;
  for (let s = 1; s <= 25; s++) {
    let g = E.newGame({ seed: s });
    for (let k = 0; k < 4 && !E.isOver(g); k++) {
      const shot = { angle: rng() * 6.283, power: 0.3 + rng() * 0.7 };
      if (g.ballInHand) shot.cue = E.nearestFree(g, g.kitchen ? 200 : 300 + rng() * 400, 100 + rng() * 300);
      const out = E.shoot(g, shot);
      out.sim.events.filter((e) => e.k === 'ball' && e.before).forEach((e) => {
        n++;
        near(e.before[0] + e.before[2], e.after[0] + e.after[2], 1e-6, 'px');
        near(e.before[1] + e.before[3], e.after[1] + e.after[3], 1e-6, 'py');
        // không tạo thêm năng lượng
        const ke = (v) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3];
        ok(ke(e.after) <= ke(e.before) + 1e-6, 'động năng không tăng');
      });
      g = out.state;
    }
  }
  ok(n > 200, 'đủ nhiều va chạm: ' + n);
});

test('va chạm băng: bật ra đối xứng, mất bớt vận tốc theo hệ số nảy', () => {
  const g = setup([300, 250], {});
  g.balls[8].on = false;
  const sim = E.simulate(g.balls, 0, -800, 0, {});
  const rail = sim.events.find((e) => e.k === 'rail');
  ok(rail, 'có chạm băng');
  // quãng 235 với v0 = 800, giảm tốc ≈ 200 + 0,25·v ≈ 400: t = (800 − √(800² − 2·400·235)) / 400 ≈ 0,319 s
  near(rail.t, (800 - Math.sqrt(800 * 800 - 2 * 400 * (250 - R))) / 400, 0.01, 'thời điểm chạm băng (có ma sát)');
  near(rail.s, 800 - 400 * rail.t, 15, 'vận tốc tới băng');
  ok(sim.balls[0].x === 300, 'đi thẳng, không lệch ngang');
  // bật xiên: góc tới bằng góc ra (gần đúng, băng giữ 96% vận tốc dọc băng)
  const s2 = E.simulate(g.balls, 400, -400, 0, { record: true });
  const r2 = s2.events.find((e) => e.k === 'rail');
  const f = s2.frames[Math.ceil(r2.t * 60) + 6];
  const f0 = s2.frames[Math.ceil(r2.t * 60) + 1];
  const ang = Math.atan2(f[1] - f0[1], f[0] - f0[0]);
  near(Math.tan(ang), 0.75 / 0.96, 0.05, 'hướng bật ra');
});

test('bi dừng hẳn: mọi cú đánh mạnh nhất đều kết thúc trong vài giây', () => {
  const rng = E.makeRng(3);
  for (let s = 1; s <= 30; s++) {
    let g = E.newGame({ seed: 100 + s });
    const out = E.shoot(g, { angle: (rng() - 0.5) * 0.1, power: 1, cue: { x: 200, y: 250 + (rng() - 0.5) * 100 } });
    ok(out.sim.stopped && out.sim.time < 12, 'phá bi dừng: ' + out.sim.time);
    g = out.state;
    if (E.isOver(g)) continue;
    const shot = { angle: rng() * 6.283, power: 1 };
    if (g.ballInHand) shot.cue = E.nearestFree(g, 500, 250);
    const o2 = E.shoot(g, shot);
    ok(o2.sim.stopped && o2.sim.time < 12, 'cú mạnh dừng: ' + o2.sim.time);
  }
});

/** Kiểm từng khung hình: bi trên bàn nằm trong mặt bàn (trừ khi đang ở miệng lỗ) và không đè nhau. */
function checkFrames(sim, tolOverlap) {
  const nearPocket = (x, y) => E.POCKETS.some((P) => Math.hypot(x - P.x, y - P.y) < 70);
  sim.frames.forEach((f, k) => {
    for (let i = 0; i < 16; i++) {
      const x = f[i * 2];
      const y = f[i * 2 + 1];
      if (Number.isNaN(x)) continue;
      if (!nearPocket(x, y)) ok(x >= R - 0.5 && x <= W - R + 0.5 && y >= R - 0.5 && y <= H - R + 0.5, 'khung ' + k + ' bi ' + i + ' ra ngoài băng: ' + x + ',' + y);
      else ok(x > -45 && x < W + 45 && y > -45 && y < H + 45, 'bi ' + i + ' lọt khỏi lỗ');
      for (let j = i + 1; j < 16; j++) {
        if (Number.isNaN(f[j * 2])) continue;
        const d = Math.hypot(x - f[j * 2], y - f[j * 2 + 1]);
        ok(d >= D - tolOverlap, 'khung ' + k + ' bi ' + i + ' và ' + j + ' đè nhau: ' + d);
      }
    }
  });
}

test('không xuyên băng / xuyên bi khi đánh lực tối đa (kiểm mọi khung hình)', () => {
  const rng = E.makeRng(21);
  for (let s = 1; s <= 30; s++) {
    // bi rải ngẫu nhiên khắp bàn, đánh lực 100% theo hướng ngẫu nhiên
    const g = E.newGame({ seed: 200 + s });
    g.isBreak = false;
    g.kitchen = false;
    g.groups = ['solid', 'stripe'];
    g.shots = 3;
    for (let n = 0; n < 16; n++) {
      let p;
      do p = { x: 20 + rng() * (W - 40), y: 20 + rng() * (H - 40) };
      while (g.balls.some((b, m) => m < n && Math.hypot(b.x - p.x, b.y - p.y) < D + 1));
      g.balls[n] = { x: p.x, y: p.y, on: true };
    }
    const out = E.shoot(g, { angle: rng() * 6.283, power: 1 }, { record: true });
    checkFrames(out.sim, 0.05);
  }
  // cú phá lực tối đa: tiếp xúc mềm chỉ cho đè rất ít trong tích tắc
  for (let s = 1; s <= 10; s++) {
    const g = E.newGame({ seed: 300 + s });
    const out = E.shoot(g, { angle: 0, power: 1, cue: { x: 150, y: 250 } }, { record: true });
    checkFrames(out.sim, 0.5);
  }
  // thẳng vào băng và sát băng
  [[0, 1], [Math.PI / 2, 1], [0.03, 1], [Math.PI - 0.02, 1]].forEach(([a, p]) => {
    const g = setup([500, 120], {});
    const out = E.shoot(g, { angle: a, power: p }, { record: true });
    checkFrames(out.sim, 0.05);
  });
});

test('bi đi thẳng vào lỗ góc và lỗ giữa thì rơi đúng lỗ', () => {
  [[0, [60, 60]], [1, [500, 70]], [2, [W - 60, 60]], [3, [60, H - 60]], [4, [500, H - 70]], [5, [W - 60, H - 60]]].forEach(([k, pos]) => {
    const P = E.POCKETS[k];
    const ux = P.ax - pos[0];
    const uy = P.ay - pos[1];
    const L = Math.hypot(ux, uy);
    const cue = [pos[0] - (ux / L) * 200, pos[1] - (uy / L) * 200];
    const g = setup(cue, { 1: pos });
    const out = E.shoot(g, { angle: angleTo(cue, pos), power: 0.35 });
    const pot = out.sim.potted.find((x) => x.n === 1);
    ok(pot && pot.p === k, 'lỗ ' + k + ': ' + JSON.stringify(out.sim.potted));
  });
});

test('mô phỏng tất định: cùng ván cùng cú đánh cho cùng kết quả', () => {
  const g = E.newGame({ seed: 42 });
  const shot = { angle: 0.01, power: 0.95, spin: 0.25, cue: { x: 210, y: 240 } };
  const a = E.shoot(g, shot, { record: true });
  const b = E.shoot(g, shot, { record: true });
  eq(E.toJSON(a.state), E.toJSON(b.state));
  eq(a.sim.events.length, b.sim.events.length);
  eq(Array.from(a.sim.frames[a.sim.frames.length - 1]), Array.from(b.sim.frames[b.sim.frames.length - 1]));
});

test('xoáy: đánh theo thì bi cái lăn tiếp, đánh kéo thì bi cái lùi lại', () => {
  const run = (spin) => {
    const g = setup([300, 250], { 1: [500, 250] });
    const out = E.shoot(g, { angle: 0, power: 0.3, spin });
    const ev = out.sim.events.find((e) => e.k === 'ball');
    return ev.after[0] / ev.before[0]; // vận tốc bi cái ngay sau chạm / trước chạm
  };
  near(run(0), (1 - E.E_BALL) / 2, 1e-9, 'không xoáy: gần như dừng');
  ok(run(1) > 0.35, 'theo: ' + run(1));
  ok(run(-1) < -0.35, 'kéo: ' + run(-1));
  ok(run(0.5) > run(0) && run(0.5) < run(1), 'xoáy một nửa');
});

test('đường ngắm dự đoán khớp chỗ chạm đầu tiên trong mô phỏng', () => {
  const rng = E.makeRng(5);
  for (let s = 0; s < 40; s++) {
    const g = setup([200 + rng() * 100, 100 + rng() * 300], { 1: [600 + rng() * 200, 100 + rng() * 300], 9: [500, 250] }, { groups: null });
    const a = rng() * 6.283;
    const pr = E.predict(g, a);
    const sim = E.simulate(g.balls, Math.cos(a) * 1500, Math.sin(a) * 1500, 0, {});
    const first = sim.events[0];
    if (pr.ball != null) {
      ok(first.k === 'ball' && first.b === pr.ball, 'chạm bi ' + pr.ball + ' trước: ' + JSON.stringify(first));
      // hướng bi đích sau va chạm trùng hướng dự đoán
      const vx = first.after[2];
      const vy = first.after[3];
      const l = Math.hypot(vx, vy);
      near(vx / l, pr.ox, 1e-6);
      near(vy / l, pr.oy, 1e-6);
    } else if (pr.pocket != null) ok(first.k === 'pot' && first.n === 0 && first.p === pr.pocket, 'lọt lỗ ' + pr.pocket);
    else ok(first.k === 'rail', 'chạm băng trước');
  }
});

/* ===================== Luật ===================== */

test('cú phá: chỉ đặt bi cái sau vạch phát bi; bi 8 rơi khi phá thì đặt lại, không thắng không thua', () => {
  const g = E.newGame({ seed: 9 });
  ok(!E.checkShot(g, { angle: 0, power: 1, cue: { x: E.HEAD_X + 20, y: 250 } }), 'vượt vạch');
  ok(E.checkShot(g, { angle: 0, power: 1, cue: { x: E.HEAD_X - 20, y: 250 } }), 'sau vạch');
  const next = E.applyRules(g, fakeSim(g, [8], 3, true));
  ok(next.balls[8].on && next.winner === null, 'bi 8 trở lại bàn');
  eq(next.last.eight, 'spot');
  ok(Math.hypot(next.balls[8].x - E.FOOT_X, next.balls[8].y - H / 2) < 80 && E.canPlace(next, next.balls[8].x, next.balls[8].y) === false, 'gần điểm đặt bi (chỗ đó giờ có bi 8)');
  ok(next.turn === 0 && !next.isBreak && !next.kitchen, 'người phá đánh tiếp');
  const scr = E.applyRules(g, fakeSim(g, [8, 0], 3, true));
  ok(scr.balls[8].on && scr.winner === null && scr.turn === 1 && scr.ballInHand && scr.last.foul === 'scratch', 'phá vào 8 kèm bi cái: phạm lỗi');
});

test('chia nhóm: bi đầu tiên vào (không phạm lỗi) quyết định nhóm, kể cả khi phá', () => {
  const open = setup([200, 250], { 3: [400, 250], 11: [600, 250] }, { groups: null });
  let n = E.applyRules(open, fakeSim(open, [3, 11], 3));
  eq(n.groups, ['solid', 'stripe']);
  ok(n.turn === 0 && n.last.cont && n.last.assigned === 'solid', 'đánh tiếp');
  const p1 = setup([200, 250], { 3: [400, 250], 11: [600, 250] }, { groups: null, turn: 1 });
  n = E.applyRules(p1, fakeSim(p1, [11], 11));
  eq(n.groups, ['solid', 'stripe'], 'bên 1 vào sọc → bên 0 trơn');
  eq(n.turn, 1);
  const brk = E.newGame({ seed: 4 });
  n = E.applyRules(brk, fakeSim(brk, [12, 2], 1));
  eq(n.groups, ['stripe', 'solid'], 'phá vào sọc trước');
  // phạm lỗi thì chưa chia nhóm
  n = E.applyRules(open, fakeSim(open, [3, 0], 3));
  eq(n.groups, null);
  ok(n.turn === 1 && n.ballInHand, 'đối phương có bi trong tay');
  // thật: đánh thẳng bi 3 vào lỗ góc
  const real = setup([700, 250], { 3: [850, 400], 11: [500, 100] }, { groups: null });
  const out = E.shoot(real, { angle: angleTo([700, 250], [850, 400]) + 0.035, power: 0.3 });
  ok(out.sim.potted.some((p) => p.n === 3), 'vào bi 3: ' + JSON.stringify(out.sim.potted));
  eq(out.state.groups, ['solid', 'stripe']);
});

test('vào bi nhóm mình thì đánh tiếp; không vào hoặc chỉ vào bi đối phương thì đổi lượt (không lỗi)', () => {
  const g = setup([200, 250], { 1: [400, 250], 9: [600, 250] });
  let n = E.applyRules(g, fakeSim(g, [1], 1));
  ok(n.turn === 0 && !n.ballInHand && !n.last.foul, 'vào bi mình');
  n = E.applyRules(g, fakeSim(g, [], 1));
  ok(n.turn === 1 && !n.ballInHand && !n.last.foul, 'không vào');
  n = E.applyRules(g, fakeSim(g, [9], 1));
  ok(n.turn === 1 && !n.ballInHand && !n.last.foul && !n.balls[9].on, 'chỉ vào bi đối phương');
  n = E.applyRules(g, fakeSim(g, [9, 1], 1));
  eq(n.turn, 0, 'vào cả hai: đánh tiếp');
});

test('phạm lỗi: bi cái rơi, không chạm bi, chạm sai bi trước, không bi nào chạm băng → đối phương có bi trong tay', () => {
  const g = setup([200, 250], { 1: [400, 250], 9: [600, 250] });
  const cases = [
    [fakeSim(g, [0], 1), 'scratch'],
    [fakeSim(g, [], null), 'miss'],
    [fakeSim(g, [], 9), 'wrong'],
    [fakeSim(g, [], 8), 'wrong'],
    [fakeSim(g, [], 1, false), 'norail'],
    [fakeSim(g, [1, 0], 1), 'scratch'],
  ];
  cases.forEach(([sim, foul]) => {
    const n = E.applyRules(g, sim);
    eq(n.last.foul, foul);
    ok(n.turn === 1 && n.ballInHand && !n.kitchen && n.balls[0].on, foul + ': bi trong tay cho bên 1');
    ok(E.canPlace(n, n.balls[0].x, n.balls[0].y), 'bi cái được đặt lại chỗ hợp lệ');
  });
  // vào bi lúc chạm sai bi trước vẫn là lỗi và không được đánh tiếp
  const n = E.applyRules(g, fakeSim(g, [1], 9));
  ok(n.last.foul === 'wrong' && n.turn === 1, 'chạm sai trước');
  // không chạm băng nhưng có bi vào: không lỗi
  eq(E.applyRules(g, fakeSim(g, [1], 1, false)).last.foul, null);
  // bàn mở: chạm bi 8 trước là lỗi, chạm bi nào khác cũng được
  const open = setup([200, 250], { 1: [400, 250], 9: [600, 250] }, { groups: null });
  eq(E.applyRules(open, fakeSim(open, [], 8)).last.foul, 'wrong');
  eq(E.applyRules(open, fakeSim(open, [], 9)).last.foul, null);
  // hết nhóm: phải chạm bi 8 trước
  const on8 = setup([200, 250], { 9: [600, 250] });
  ok(E.onEight(on8, 0), 'đang đánh bi 8');
  eq(E.applyRules(on8, fakeSim(on8, [], 9)).last.foul, 'wrong');
  eq(E.applyRules(on8, fakeSim(on8, [], 8)).last.foul, null);
});

test('phạm lỗi thật trong mô phỏng: bi cái vào lỗ, đánh trượt, chạm bi đối phương trước, đánh quá nhẹ', () => {
  // bi cái thẳng vào lỗ góc dưới phải
  let g = setup([700, 250], { 1: [300, 100], 9: [300, 400] });
  let out = E.shoot(g, { angle: angleTo([700, 250], [E.W - 10, E.H - 10]), power: 0.5 });
  eq(out.state.last.foul, 'scratch');
  ok(out.state.ballInHand && out.state.turn === 1 && out.state.balls[0].on, 'đặt lại bi cái');
  // đánh ra xa mọi bi
  g = setup([500, 250], { 1: [100, 100], 9: [100, 400] });
  out = E.shoot(g, { angle: 0, power: 0.3 });
  eq(out.state.last.foul, 'miss');
  // chạm bi sọc (đối phương) trước
  g = setup([200, 250], { 1: [300, 100], 9: [500, 250] });
  out = E.shoot(g, { angle: 0, power: 0.4 });
  eq(out.state.last.foul, 'wrong');
  // chạm nhẹ bi mình, không bi nào tới băng
  g = setup([200, 250], { 1: [260, 250], 9: [600, 100] });
  out = E.shoot(g, { angle: 0, power: 0.06 });
  eq(out.state.last.first, 1);
  eq(out.state.last.foul, 'norail');
});

test('bi trong tay: đặt bi cái ở đâu cũng được (trừ đè bi khác / ngoài bàn); không có bi trong tay thì không được đặt', () => {
  const g = setup([200, 250], { 1: [400, 250], 9: [600, 250] });
  const n = E.applyRules(g, fakeSim(g, [0], 1));
  ok(n.ballInHand && n.turn === 1, 'có bi trong tay');
  ok(E.checkShot(n, { angle: 0, power: 0.5, cue: { x: 800, y: 300 } }), 'đặt sau vạch phát bi cũng được');
  ok(!E.checkShot(n, { angle: 0, power: 0.5, cue: { x: 410, y: 255 } }), 'đè bi 1');
  ok(!E.checkShot(n, { angle: 0, power: 0.5, cue: { x: 5, y: 250 } }), 'ngoài bàn');
  const out = E.shoot(n, { angle: Math.PI, power: 0.4, cue: { x: 700, y: 250 } });
  ok(out && out.start[0].x === 700, 'đánh từ chỗ đã đặt');
  ok(!E.checkShot(g, { angle: 0, power: 0.5, cue: { x: 800, y: 300 } }), 'không có bi trong tay');
  ok(!out.state.ballInHand, 'hết bi trong tay sau cú đánh');
});

test('bi 8: hết nhóm vào 8 là thắng; vào sớm, hoặc vào cùng lúc phạm lỗi là thua', () => {
  const on8 = setup([200, 250], { 9: [600, 250] });
  let n = E.applyRules(on8, fakeSim(on8, [8], 8));
  ok(n.winner === 0 && n.last.eight === 'win' && E.isOver(n), 'thắng');
  n = E.applyRules(on8, fakeSim(on8, [8, 0], 8));
  ok(n.winner === 1 && n.last.eight === 'lose', 'vào 8 kèm bi cái: thua');
  n = E.applyRules(on8, fakeSim(on8, [8], 9));
  ok(n.winner === 1, 'vào 8 nhưng chạm sai bi trước: thua');
  const early = setup([200, 250], { 1: [400, 250], 9: [600, 250] });
  n = E.applyRules(early, fakeSim(early, [8], 1));
  ok(n.winner === 1 && n.last.eight === 'lose', 'còn bi nhóm: thua');
  n = E.applyRules(early, fakeSim(early, [1, 8], 1));
  ok(n.winner === 1, 'vào bi cuối nhóm cùng lúc với 8: vẫn là vào 8 sớm');
  const open = setup([200, 250], { 1: [400, 250], 9: [600, 250] }, { groups: null, turn: 1 });
  n = E.applyRules(open, fakeSim(open, [8], 1));
  eq(n.winner, 0, 'bàn mở vào 8: thua');
  ok(!E.shoot(n, { angle: 0, power: 0.5 }), 'ván xong không đánh được nữa');
  // thật: đánh thẳng bi 8 vào lỗ góc
  const real = setup([700, 250], { 8: [850, 400], 9: [300, 100] });
  const out = E.shoot(real, { angle: angleTo([700, 250], [850, 400]) + 0.035, power: 0.3 });
  eq(out.state.winner, 0, 'thắng thật: ' + JSON.stringify(out.state.last));
});

test('từ chối cú đánh sai: lực ngoài khoảng, góc / xoáy không phải số, ván đã xong', () => {
  const g = setup([200, 250], { 1: [400, 250] });
  [{ angle: 0, power: 0 }, { angle: 0, power: 1.1 }, { angle: NaN, power: 0.5 }, { angle: 0, power: 0.5, spin: 2 }, { angle: 0, power: '0.5' }, null].forEach((s) => {
    ok(!E.shoot(g, s), JSON.stringify(s));
  });
});

/* ===================== Máy ===================== */

function randomShot(g, rng) {
  const shot = { angle: rng() * Math.PI * 2, power: 0.15 + rng() * 0.85, spin: 0 };
  if (g.ballInHand) {
    for (let i = 0; i < 500; i++) {
      const x = 16 + rng() * ((g.kitchen ? E.HEAD_X : W - R) - 16);
      const y = 16 + rng() * (H - 32);
      if (E.canPlace(g, x, y)) {
        shot.cue = { x, y };
        break;
      }
    }
  }
  return shot;
}
/** Một ván máy đấu máy: levels[bên] là mức hoặc 'random'. Trả bên thắng (null nếu quá 300 cú). */
function play(seed, levels, check) {
  let g = E.newGame({ seed, first: seed % 2 });
  const rng = E.makeRng(seed * 31 + 7);
  while (!E.isOver(g) && g.shots < 300) {
    const lv = levels[g.turn];
    const shot = lv === 'random' ? randomShot(g, rng) : E.chooseShot(g, lv);
    if (check) check(g, shot, lv);
    const out = E.shoot(g, shot);
    ok(out, 'cú đánh hợp lệ (' + lv + ')');
    g = out.state;
  }
  return g.winner;
}
/** Thắng / tổng của mức A trước B, đổi bên và đổi người phá luân phiên. */
function match(A, B, n, base) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const winner = play(base + i, swap ? [B, A] : [A, B]);
    if (winner === (swap ? 1 : 0)) w++;
  }
  return w;
}

test('máy mọi mức luôn đánh hợp lệ (cả cú phá và bi trong tay), tất định theo ván', () => {
  let n = 0;
  let hands = 0;
  E.LEVELS.forEach((lv, k) => {
    for (let s = 1; s <= 3; s++) {
      play(700 + k * 10 + s, [lv, lv], (g, shot) => {
        n++;
        if (g.ballInHand) hands++;
        ok(E.checkShot(g, shot), 'cú hợp lệ');
        ok(!!shot.cue === g.ballInHand, 'chỉ đặt bi khi có bi trong tay');
        if (n % 7 === 0) eq(E.chooseShot(g, lv), shot, 'tất định');
      });
    }
  });
  ok(n > 80 && hands > 3, 'đủ nhiều cú: ' + n + ', bi trong tay ' + hands);
});

test('máy chia nhỏ được: planner.step(1) chạy từng phần, kết quả như chọn một lần', () => {
  let g = E.newGame({ seed: 31 });
  g = E.shoot(g, E.chooseShot(g, 'hard')).state;
  const pl = E.createPlanner(g, 'hard');
  let steps = 0;
  while (!pl.step(1)) steps++;
  ok(steps > 5, 'nhiều phần: ' + steps);
  eq(pl.result(), E.chooseShot(g, 'hard'));
});

test('máy Khó vào bi rõ nhiều hơn máy Dễ', () => {
  const rate = (lv) => {
    let shots = 0;
    let cont = 0;
    for (let s = 1; s <= 6; s++) {
      let g = E.newGame({ seed: 400 + s });
      while (!E.isOver(g) && g.shots < 200) {
        const out = E.shoot(g, E.chooseShot(g, lv));
        if (!g.isBreak) {
          shots++;
          if (out.state.last.cont) cont++;
        }
        g = out.state;
      }
    }
    return cont / shots;
  };
  const easy = rate('easy');
  const hard = rate('hard');
  console.log('       tỉ lệ cú vào bi (được đánh tiếp): Dễ ' + (easy * 100).toFixed(0) + '%, Khó ' + (hard * 100).toFixed(0) + '%');
  ok(hard > easy + 0.2, 'Khó ' + hard + ' vs Dễ ' + easy);
});

test('mức mạnh dần: Khó thắng Dễ rõ rệt', () => {
  const n = 30;
  const w = match('hard', 'easy', n, 1000);
  console.log('       Khó thắng Dễ ' + w + '/' + n);
  ok(w >= n * 0.75, 'Khó thắng Dễ ' + w + '/' + n);
});

test('mức mạnh dần: Vừa thắng Dễ phần lớn, Khó thắng Vừa phần lớn', () => {
  const n = 30;
  const a = match('medium', 'easy', n, 2000);
  const b = match('hard', 'medium', n, 3000);
  console.log('       Vừa thắng Dễ ' + a + '/' + n + ', Khó thắng Vừa ' + b + '/' + n);
  ok(a >= n * 0.6, 'Vừa–Dễ ' + a);
  ok(b >= n * 0.6, 'Khó–Vừa ' + b);
});

test('mức mạnh dần: Vừa thắng bot ngẫu nhiên gần như mọi ván', () => {
  const n = 30;
  const w = match('medium', 'random', n, 4000);
  console.log('       Vừa thắng ngẫu nhiên ' + w + '/' + n);
  ok(w >= n - 2, 'Vừa–ngẫu nhiên ' + w + '/' + n);
});

/* ===================== Lưu / khôi phục ===================== */

test('lưu rồi khôi phục giữ nguyên ván (giữa ván, có nhóm, bi trong tay)', () => {
  let g = E.newGame({ seed: 55 });
  for (let i = 0; i < 6 && !E.isOver(g); i++) {
    g = E.shoot(g, E.chooseShot(g, 'medium')).state;
    const raw = JSON.parse(JSON.stringify(E.toJSON(g)));
    const back = E.fromJSON(raw);
    ok(back, 'khôi phục được');
    eq(E.toJSON(back), E.toJSON(g));
    // chơi tiếp từ ván khôi phục cho cùng kết quả
    if (!E.isOver(g)) eq(E.chooseShot(back, 'easy'), E.chooseShot(g, 'easy'));
  }
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.shoot(E.newGame({ seed: 8 }), { angle: 0, power: 0.9, cue: { x: 200, y: 250 } }).state);
  ok(E.fromJSON(clone(good)), 'ván tốt');
  const bad = [];
  const mut = (fn) => {
    const r = clone(good);
    fn(r);
    bad.push(r);
  };
  bad.push(null, 1, 'x', {}, []);
  mut((r) => { r.v = 2; });
  mut((r) => { r.seed = -1; });
  mut((r) => { r.balls = r.balls.slice(0, 15); });
  mut((r) => { r.balls[3] = [1, 2]; });
  mut((r) => { r.balls[3][0] = 'a'; });
  mut((r) => { r.balls[3][2] = 2; });
  mut((r) => { r.balls[3] = [5000, 100, 1]; });
  mut((r) => { r.balls[3] = r.balls[4].slice(); }); // đè nhau
  mut((r) => { r.turn = 2; });
  mut((r) => { r.groups = ['solid', 'solid']; });
  mut((r) => { r.groups = ['x', 'y']; });
  mut((r) => { r.isBreak = 'no'; });
  mut((r) => { r.isBreak = true; }); // đã đánh mà còn là cú phá
  mut((r) => { r.shots = -1; });
  mut((r) => { r.winner = 3; });
  mut((r) => { r.balls[8][2] = 0; }); // bi 8 rơi mà chưa có kết quả
  mut((r) => { r.balls[0][2] = 0; }); // bi cái không có trên bàn
  mut((r) => { r.last = 5; });
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'dữ liệu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
if (failed) process.exit(1);
