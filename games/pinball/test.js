/* Kiểm tra engine Pinball: chạy `node test.js`
 * - Vật lý: rơi tự do đúng trọng lực, nảy tường theo hệ số, flipper đứng yên / đang đánh truyền vận tốc đúng hướng,
 *   không xuyên flipper / tường / bumper ở tốc độ tối đa (kiểm từng nhịp, rất nhiều cú)
 * - Luật: bumper / slingshot đẩy ra và cộng điểm, hạ hết target → thưởng + chế độ, sáng hết rollover → hệ số,
 *   flipper đổi làn sáng, ramp (đủ lực / thiếu lực), multiball, ball save, mất bi, hết 3 bi → hết ván,
 *   lò xo: lực theo thời gian nén (phím) / theo độ kéo (cảm ứng)
 * - Tất định theo seed + chuỗi input, lưu / khôi phục chạy tiếp y hệt, từ chối dữ liệu hỏng
 */
const E = require('./engine.js');

const C = E.CONST;
const T = E.TABLE;
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
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg ? msg + ': ' : '') + a + ' ≉ ' + b + ' (±' + tol + ')');
}

/** Ván thử: một bi đặt sẵn ở (x, y) với vận tốc cho trước, đã qua làn phóng (không ball save, không skill shot). */
function withBall(x, y, vx, vy, seed) {
  const g = E.newGame(seed == null ? 7 : seed);
  g.balls = [E.makeBall(x, y, vx, vy)];
  g.saveArmed = false;
  g.skill = -1;
  return g;
}
function run(g, n, input) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    E.step(g, typeof input === 'function' ? input(i) : input || {});
    evs.push(...g.events);
  }
  return evs;
}
const has = (evs, type) => evs.some((e) => e.type === type);
const count = (evs, type) => evs.filter((e) => e.type === type).length;

/** Khoảng cách từ điểm tới đoạn thẳng. */
function segDist(px, py, s) {
  const t = Math.max(0, Math.min(s.L, (px - s.ax) * s.ux + (py - s.ay) * s.uy));
  return Math.hypot(px - (s.ax + s.ux * t), py - (s.ay + s.uy * t));
}

/** Kiểm bi không lấn vào bất kỳ vật nào của bàn (sai số 0,5 đơn vị). */
function assertClear(g, where) {
  for (const b of g.balls) {
    if (b.ramp) continue;
    for (const sh of T.SHAPES) {
      if (sh.kind === 'target' && !g.targets[sh.id]) continue;
      if (sh.kind === 'plunger' || sh.kind === 'gate') continue;
      const d = sh.t === 1 ? Math.hypot(b.x - sh.x, b.y - sh.y) - sh.r : segDist(b.x, b.y, sh);
      if (d < C.R - 0.5) throw new Error(where + ': bi lấn vào ' + sh.kind + ' (' + d.toFixed(2) + ') tại ' + b.x.toFixed(1) + ',' + b.y.toFixed(1));
    }
    for (let i = 0; i < 2; i++) {
      const d = E.flipperDist(T.FLIPPERS[i], g.flips[i].a, b.x, b.y).d;
      if (d < C.R - 0.5) throw new Error(where + ': bi lấn vào flipper ' + i + ' (' + d.toFixed(2) + ')');
    }
    // Không ra ngoài khung bàn
    if (b.x < 12 + C.R - 0.5 || b.x > 590 - C.R + 0.5) throw new Error(where + ': bi ra ngoài tường ' + b.x.toFixed(1));
    if (b.y < T.ARC.y && Math.hypot(b.x - T.ARC.x, b.y - T.ARC.y) > T.ARC.r - C.R + 1) throw new Error(where + ': bi ra ngoài vòm');
  }
}

/** Mulberry nhỏ cho test (độc lập với engine). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chuỗi input ngẫu nhiên có seed (bấm flipper, giữ lò xo). */
function inputs(seed, n) {
  const r = rng(seed);
  const out = [];
  let l = false;
  let rr = false;
  let p = false;
  for (let i = 0; i < n; i++) {
    if (r() < 0.04) l = !l;
    if (r() < 0.04) rr = !rr;
    if (r() < 0.02) p = !p;
    out.push({ left: l, right: rr, plunge: p });
  }
  return out;
}

console.log('Vật lý');

test('trọng lực theo độ nghiêng bàn: g·sin 6,5° với 1 m = 1200 đơn vị', () => {
  near(C.G, 9.81 * Math.sin((6.5 * Math.PI) / 180) * 1200, 1e-9);
  ok(C.G > 1300 && C.G < 1360);
});

test('bi rơi tự do đúng ½·g·t² và v = g·t', () => {
  const g = withBall(150, 200, 0, 0);
  run(g, 60); // 0,5 giây
  const t = 0.5;
  const b = g.balls[0];
  near(b.y, 200 + 0.5 * C.G * t * t, 1e-6, 'vị trí');
  near(b.vy, C.G * t, 1e-6, 'vận tốc');
  near(b.x, 150, 1e-9, 'không trôi ngang');
});

test('bi ném ngang: quỹ đạo parabol (x đều, y theo trọng lực)', () => {
  const g = withBall(60, 220, 80, -300);
  run(g, 48);
  const t = 0.4;
  near(g.balls[0].x, 60 + 80 * t, 1e-6);
  near(g.balls[0].y, 220 - 300 * t + 0.5 * C.G * t * t, 1e-6);
});

test('nảy tường theo hệ số: vận tốc pháp tuyến đổi chiều × 0,45', () => {
  const g = withBall(100, 600, -800, 0);
  let vyBefore = 0;
  for (let i = 0; i < 30 && g.balls[0].vx < 0; i++) {
    vyBefore = g.balls[0].vy;
    E.step(g, {});
  }
  near(g.balls[0].vx, 800 * C.E_WALL, 1e-6, 'vx sau va');
  ok(g.balls[0].vy > vyBefore * (1 - C.F_WALL) - 1 && g.balls[0].vy < vyBefore + C.G * C.DT + 1, 'vy chỉ mất phần ma sát');
});

test('cột cao su nảy mạnh hơn tường (hệ số 0,7)', () => {
  // Cột đầu thanh dẫn inlane trái (r = 5): bi rơi thẳng từ trên xuống đỉnh cột (pháp tuyến thẳng đứng)
  const g = withBall(T.GUIDES[0][0][0], 600, 0, 700);
  let before = 0;
  for (let i = 0; i < 30 && g.balls[0].vy > 0; i++) {
    before = g.balls[0].vy;
    E.step(g, {});
  }
  near(-g.balls[0].vy / before, C.E_RUBBER, 0.03, 'hệ số nảy (sai số trọng lực trong một nhịp)');
  near(g.balls[0].vx, 0, 1e-9, 'nảy thẳng đứng');
});

test('bi rơi vào flipper đứng yên: nảy theo pháp tuyến mặt flipper, hệ số 0,4', () => {
  const f = T.FLIPPERS[0];
  const g = withBall(222, 830, 0, 700);
  let before = null;
  for (let i = 0; i < 60; i++) {
    const b = g.balls[0];
    const v0 = { vx: b.vx, vy: b.vy };
    E.step(g, {});
    if (g.events.some((e) => e.type === 'flipHit') || b.vy < 0) {
      before = v0;
      break;
    }
  }
  ok(before, 'không chạm flipper');
  const b = g.balls[0];
  const n = E.flipperDist(f, g.flips[0].a, b.x, b.y);
  ok(n.ny < -0.8, 'pháp tuyến hướng lên');
  const vnIn = before.vx * n.nx + before.vy * n.ny;
  const vnOut = b.vx * n.nx + b.vy * n.ny;
  ok(vnIn < 0, 'đang lao vào');
  near(vnOut / -vnIn, C.E_FLIP, 0.05, 'hệ số nảy');
  ok(b.vx > 0, 'flipper trái dốc xuống phải: bi nảy lệch sang phải');
});

/** Đặt bi nằm sát mặt trên flipper ở khoảng cách r từ chốt (flipper đang ở góc nghỉ). */
function ballOnFlipper(side, r) {
  const f = T.FLIPPERS[side];
  const a = f.rest;
  // điểm phía trên trục flipper (theo hướng vuông góc), rồi chiếu về vỏ tới khi cách đúng R + 0,01
  let px = Math.sin(a);
  let py = -Math.cos(a);
  if (py > 0) {
    px = -px;
    py = -py;
  }
  let x = f.px + Math.cos(a) * r + px * 40;
  let y = f.py + Math.sin(a) * r + py * 40;
  for (let k = 0; k < 60; k++) {
    const d = E.flipperDist(f, a, x, y);
    x -= d.nx * (d.d - C.R - 0.01);
    y -= d.ny * (d.d - C.R - 0.01);
  }
  return withBall(x, y, 0, 0);
}

test('flipper đang đánh truyền vận tốc: bi bay lên, lệch về phía đối diện, nhanh hơn ở gần đầu', () => {
  const speeds = [];
  [0, 1].forEach((side) => {
    [30, 55, 80].forEach((r) => {
      const g = ballOnFlipper(side, r);
      const inp = side ? { right: true } : { left: true };
      const evs = run(g, 1, inp);
      const b = g.balls[0];
      ok(has(evs, 'flipHit'), 'có va flipper');
      ok(b.vy < -500, 'bay lên (vy = ' + b.vy.toFixed(0) + ')');
      ok(side ? b.vx < 0 : b.vx > 0, 'flipper ' + side + ' đẩy bi về phía đối diện');
      const s = Math.hypot(b.vx, b.vy);
      // va đầu tiên: mặt flipper đi tới với ω·r', bi bật ra ≈ (1 + e)·ω·r' (r' = khoảng cách điểm chạm tới chốt, < r)
      const f = T.FLIPPERS[side];
      const rc = Math.hypot(b.x - f.px, b.y - f.py) - C.R;
      ok(s > C.W_UP * rc * 0.9 && s < C.W_UP * (rc + C.R) * (1 + C.E_FLIP) * 1.1, 'tốc độ ' + s.toFixed(0) + ' so với ω·r');
      speeds.push(s);
    });
  });
  ok(speeds[0] < speeds[1] && speeds[1] < speeds[2], 'đánh ở gần đầu flipper nhanh hơn');
  eq(speeds.slice(0, 3).map(Math.round), speeds.slice(3).map(Math.round), 'hai flipper đối xứng');
});

test('flipper đứng yên ở góc bật: bi lăn trên flipper về gốc rồi nằm yên (giữ bi)', () => {
  const g = withBall(232, 790, 0, 0);
  run(g, 360, { left: true });
  const b = g.balls[0];
  ok(b, 'bi còn trên bàn');
  ok(Math.hypot(b.vx, b.vy) < 30, 'nằm yên');
  ok(b.y > 840 && b.y < 880 && b.x > 150 && b.x < 230, 'nằm ở khe giữa ray và flipper: ' + b.x.toFixed(0) + ',' + b.y.toFixed(0));
});

test('không xuyên flipper: hàng trăm cú tốc độ tối đa vào flipper đứng yên / đang bật / đang hạ', () => {
  const r = rng(11);
  let shots = 0;
  for (let k = 0; k < 360; k++) {
    const side = k % 2;
    const mode = Math.floor(k / 2) % 3; // 0: nghỉ, 1: đang bật, 2: giữ bật rồi hạ
    const f = T.FLIPPERS[side];
    const along = 8 + r() * 82;
    const a = f.rest;
    const tx = f.px + Math.cos(a) * along;
    const ty = f.py + Math.sin(a) * along;
    const ang = -Math.PI / 2 + (r() - 0.5) * 2.2; // hướng tới từ phía trên, lệch tối đa ±63°
    const dist = 60 + r() * 60;
    const bx = tx + Math.cos(ang) * dist;
    const by = ty + Math.sin(ang) * dist;
    if (bx < 120 || bx > 440 || by < 770) continue;
    const g = withBall(bx, by, -Math.cos(ang) * C.VMAX, -Math.sin(ang) * C.VMAX);
    const key = side ? 'right' : 'left';
    if (mode === 2) {
      g.flips[side].a = f.up;
      g.held[side] = true;
    }
    try {
      assertClear(g, 'xuất phát');
    } catch (e) {
      continue;
    }
    shots++;
    // Toạ độ bi trong hệ của flipper: lx dọc thân, ly vuông góc (dấu cho biết bi ở mặt trên hay dưới)
    const local = () => {
      const b = g.balls[0];
      const fa = g.flips[side].a;
      const dx = b.x - f.px;
      const dy = b.y - f.py;
      return { lx: dx * Math.cos(fa) + dy * Math.sin(fa), ly: -dx * Math.sin(fa) + dy * Math.cos(fa) };
    };
    let prev = local();
    for (let i = 0; i < 36 && g.balls.length; i++) {
      const inp = {};
      if (mode === 1) inp[key] = true;
      if (mode === 2 && i < 2) inp[key] = true; // giữ bật 2 nhịp rồi thả: flipper đang hạ khi bi tới
      E.step(g, inp);
      if (!g.balls.length) break;
      assertClear(g, 'cú ' + k + ' nhịp ' + i);
      // Đi xuyên thân flipper = đổi mặt (ly đổi dấu) trong một nhịp mà vẫn ở trong khoảng thân, sát flipper
      const cur = local();
      const inBody = (p) => p.lx > 0 && p.lx < f.L - 6 && Math.abs(p.ly) < 40;
      ok(!(inBody(prev) && inBody(cur) && Math.sign(prev.ly) !== Math.sign(cur.ly)), 'cú ' + k + ' nhịp ' + i + ': bi xuyên qua thân flipper');
      prev = cur;
    }
  }
  ok(shots > 250, 'đủ số cú thử (' + shots + ')');
});

test('không xuyên tường, vòm, bumper, slingshot, target ở tốc độ tối đa (mọi hướng)', () => {
  const r = rng(5);
  let n = 0;
  for (let k = 0; k < 400; k++) {
    // điểm xuất phát ngẫu nhiên trong vùng chơi, không lấn vật nào
    const g = withBall(40 + r() * 490, 60 + r() * 700, 0, 0);
    try {
      assertClear(g, 'xuất phát');
    } catch (e) {
      continue;
    }
    const ang = r() * Math.PI * 2;
    g.balls[0].vx = Math.cos(ang) * C.VMAX;
    g.balls[0].vy = Math.sin(ang) * C.VMAX;
    n++;
    for (let i = 0; i < 90 && g.balls.length && !g.balls[0].ramp; i++) {
      E.step(g, {});
      assertClear(g, 'cú ' + k + ' nhịp ' + i);
    }
  }
  ok(n > 250, 'đủ số cú thử (' + n + ')');
});

test('chơi ngẫu nhiên dài (bấm flipper liên tục, multiball): không lúc nào bi lấn vào vật nào', () => {
  let ticks = 0;
  for (let s = 0; s < 6; s++) {
    const g = E.newGame(100 + s);
    const ins = inputs(200 + s, 5000);
    g.ramps = 2;
    for (let i = 0; i < ins.length && !g.over; i++) {
      E.step(g, ins[i]);
      assertClear(g, 'ván ' + s + ' nhịp ' + i);
      ticks++;
    }
  }
  ok(ticks > 6000, 'đủ dài (' + ticks + ' nhịp)');
});

console.log('Luật');

test('bumper: đẩy bi ra mạnh, cộng 100 điểm (×hệ số), đèn sáng', () => {
  const bp = T.BUMPERS[2];
  const g = withBall(bp.x, bp.y - 120, 0, 300);
  const evs = run(g, 30);
  ok(has(evs, 'bumper'), 'có trúng bumper');
  const e = evs.find((x) => x.type === 'bumper');
  eq(e.i, 2);
  ok(g.score >= 100, 'điểm');
  eq(g.fx.bumper[2] >= 0, true, 'đèn');
  const b = g.balls[0];
  ok(b.vy < -500, 'bật ngược lên');
});

test('bumper ở chế độ Siêu hành tinh: 500 điểm', () => {
  const bp = T.BUMPERS[2];
  const g = withBall(bp.x, bp.y - 120, 0, 300);
  g.superT = 600;
  const evs = run(g, 40);
  eq(evs.find((x) => x.type === 'bumper').pts, 500);
});

test('slingshot: va đủ mạnh thì đá bi ra (≥ lực đá), cộng điểm; chạm nhẹ thì không', () => {
  const [A, , Cc] = T.SLINGS[0];
  const mxp = (A[0] + Cc[0]) / 2;
  const myp = (A[1] + Cc[1]) / 2;
  const nx = 0.937;
  const ny = -0.348;
  const g = withBall(mxp + nx * 80, myp + ny * 80, -nx * 600, -ny * 600);
  let kicked = null;
  for (let i = 0; i < 40 && !kicked; i++) {
    E.step(g, {});
    if (has(g.events, 'sling')) kicked = { vx: g.balls[0].vx, vy: g.balls[0].vy };
  }
  ok(kicked, 'có đá');
  ok(Math.hypot(kicked.vx, kicked.vy) >= C.SLING_KICK * 0.95, 'lực đá');
  ok(kicked.vx > 0, 'đá về phía giữa bàn');
  eq(g.score, 50);
  // Chạm nhẹ
  const g2 = withBall(mxp + nx * 14, myp + ny * 14, -nx * 40, -ny * 40);
  const evs2 = run(g2, 6);
  ok(!has(evs2, 'sling'), 'không đá khi chạm nhẹ');
});

test('target: trúng thì hạ, cộng 750; hạ hết dãy → thưởng 10.000 + bật Siêu hành tinh, rồi dựng lại', () => {
  const g = withBall(120, 500, -900, -120);
  g.targets = [false, false, false, true];
  const evs = run(g, 40);
  ok(has(evs, 'target'), 'trúng target');
  ok(has(evs, 'bank'), 'hạ hết dãy');
  eq(g.score, 750 + 10000);
  ok(g.superT > 0, 'bật chế độ');
  eq(g.count.banks, 1);
  const evs2 = run(g, 200);
  ok(has(evs2, 'bankReset'), 'dựng lại');
  eq(g.targets, [true, true, true, true]);
});

test('target: bi chạm quá nhẹ không hạ', () => {
  const g = withBall(34 + 13.5, 400, -30, 0);
  g.balls[0].vy = 0;
  const evs = run(g, 4);
  ok(!has(evs, 'target'));
  eq(g.targets, [true, true, true, true]);
});

test('rollover: qua làn chưa sáng +500, sáng hết 3 làn → hệ số +1 (+5.000), các làn tắt', () => {
  const g = withBall(T.LANES[2], 110, 0, 200);
  g.lanes = [true, true, false];
  const evs = run(g, 20);
  ok(has(evs, 'lane'), 'qua làn');
  ok(has(evs, 'mult'), 'tăng hệ số');
  eq(g.mult, 2);
  eq(g.lanes, [false, false, false]);
  eq(g.score, 500 + 5000);
  // hệ số nhân mọi điểm sau đó
  const bp = T.BUMPERS[2];
  g.balls = [E.makeBall(bp.x, bp.y - 120, 0, 300)];
  const evs2 = run(g, 40);
  eq(evs2.find((x) => x.type === 'bumper').pts, 200, 'bumper ×2');
});

test('rollover: hệ số tối đa ×5, sáng hết khi đã ×5 thì thưởng 20.000', () => {
  const g = withBall(T.LANES[0], 110, 0, 200);
  g.mult = 5;
  g.lanes = [false, true, true];
  run(g, 20);
  eq(g.mult, 5);
  eq(g.score, (500 + 20000) * 5);
});

test('bấm flipper đổi làn sáng (trái: xoay trái, phải: xoay phải)', () => {
  const g = withBall(150, 200, 0, 0);
  g.lanes = [true, false, false];
  E.step(g, { left: true });
  eq(g.lanes, [false, false, true]);
  E.step(g, { left: true }); // giữ nguyên: không đổi tiếp
  eq(g.lanes, [false, false, true]);
  E.step(g, {});
  E.step(g, { right: true });
  eq(g.lanes, [true, false, false]);
});

test('lò xo: phím giữ lâu hơn bắn mạnh hơn, tỉ lệ thời gian nén, tối đa sau 1 giây', () => {
  const speeds = [0.25, 0.5, 1, 2].map((sec) => {
    const g = E.newGame(1);
    run(g, Math.round(sec * C.TPS), { plunge: true });
    near(g.plunger, Math.min(1, sec / C.PULL_TIME), 1e-9, 'độ nén');
    const evs = run(g, 1, {});
    const e = evs.find((x) => x.type === 'launch');
    ok(e, 'có phóng');
    return -g.balls[0].vy + C.G * C.DT; // bỏ phần trọng lực của nhịp vừa chạy
  });
  near(speeds[0], C.PLUNGE_MIN + (C.PLUNGE_MAX - C.PLUNGE_MIN) * 0.25, 2);
  near(speeds[1], C.PLUNGE_MIN + (C.PLUNGE_MAX - C.PLUNGE_MIN) * 0.5, 2);
  near(speeds[2], C.PLUNGE_MAX, 2);
  near(speeds[3], C.PLUNGE_MAX, 2, 'không vượt tối đa');
});

test('lò xo cảm ứng: kéo tới mức nào nén tới mức đó (cùng tốc độ nén), thả ra thì phóng', () => {
  const g = E.newGame(1);
  run(g, 30, { plunge: 0.6 });
  near(g.plunger, 0.25, 1e-9, 'chưa kịp nén tới 0,6');
  run(g, 60, { plunge: 0.6 });
  near(g.plunger, 0.6, 1e-9);
  run(g, 12, { plunge: 0.5 });
  near(g.plunger, 0.5, 1e-9, 'kéo lùi thì nhả bớt');
  const evs = run(g, 1, {});
  near(evs.find((x) => x.type === 'launch').power, 0.5, 1e-9);
});

test('phóng đủ mạnh: bi qua cửa một chiều vào bàn; yếu: rơi lại xuống lò xo', () => {
  const strong = E.newGame(1);
  run(strong, 100, { plunge: true });
  const evs = run(strong, 240, {});
  ok(has(evs, 'launched'), 'ra khỏi làn phóng');
  ok(strong.saveT > 0, 'bắt đầu ball save');
  const weak = E.newGame(1);
  run(weak, 20, { plunge: true });
  const evs2 = run(weak, 400, {});
  ok(!has(evs2, 'launched'), 'không ra khỏi làn');
  ok(E.ballWaiting(weak), 'bi lại nằm trên lò xo');
});

test('cửa một chiều: bi rơi từ trên xuống không lọt lại vào làn phóng', () => {
  const g = withBall(575, 240, 0, 200);
  run(g, 120);
  ok(g.balls[0].x < C.LANE_X0 - 4 || g.balls[0].y < C.LANE_TOP - 20, 'bị hắt vào bàn');
});

test('skill shot: rơi vào làn đang nhấp nháy ngay sau khi phóng thì +15.000', () => {
  const g = withBall(T.LANES[1], 100, 0, 150);
  g.skill = 1;
  g.skillT = 300;
  const evs = run(g, 40);
  ok(has(evs, 'skill'));
  eq(g.score, 15000 + 500);
  const g2 = withBall(T.LANES[0], 100, 0, 150);
  g2.skill = 1;
  g2.skillT = 300;
  const evs2 = run(g2, 40);
  ok(!has(evs2, 'skill'), 'sai làn thì không có');
  eq(g2.skillT, 0, 'hết cơ hội');
});

/** Bi lao vào miệng ramp theo hướng ramp với tốc độ v. */
function intoMouth(v) {
  const m = T.MOUTH;
  const cx = (m.ax + m.bx) / 2;
  const cy = (m.ay + m.by) / 2;
  return withBall(cx - m.nx * 40, cy - m.ny * 40, m.nx * v, m.ny * v);
}

test('ramp: đủ lực thì chạy hết đường quỹ đạo, ra ở inlane trái, +5.000', () => {
  const g = intoMouth(2200);
  const evs = run(g, 4 * C.TPS);
  ok(has(evs, 'rampIn'), 'vào ramp');
  ok(has(evs, 'ramp'), 'hết ramp');
  eq(g.ramps, 1);
  ok(g.score >= 5000, 'điểm ramp');
  ok(has(evs, 'inlane'), 'đi xuống inlane trái');
});

test('ramp: thiếu lực thì lăn ngược ra miệng, không có điểm', () => {
  const g = intoMouth(700);
  const evs = run(g, 3 * C.TPS);
  ok(has(evs, 'rampIn'));
  ok(has(evs, 'rampFail'));
  ok(!has(evs, 'ramp'));
  eq(g.ramps, 0);
});

test('3 lần ramp → multiball 2 bi (tự phóng bi thứ hai), ramp trong multiball là jackpot', () => {
  const g = intoMouth(2200);
  g.ramps = 2;
  const evs = run(g, 4 * C.TPS);
  ok(has(evs, 'multiball'), 'bắt đầu multiball');
  ok(has(evs, 'serve'), 'tự phóng bi thứ hai');
  ok(g.multi);
  ok(g.balls.length + g.queue === 2, 'có 2 bi');
  ok(g.saveT > 0, 'ball save multiball');
  // jackpot
  const m = T.MOUTH;
  g.balls[0] = E.makeBall((m.ax + m.bx) / 2 - m.nx * 40, (m.ay + m.by) / 2 - m.ny * 40, m.nx * 2200, m.ny * 2200);
  const s0 = g.score;
  const evs2 = run(g, 3 * C.TPS);
  ok(has(evs2, 'jackpot'), 'jackpot');
  ok(g.score - s0 >= 25000);
});

test('multiball: hết ball save, một bi rơi thì về một bi, chưa mất lượt', () => {
  const g = withBall(150, 300, 0, 0);
  g.balls.push(E.makeBall(280, 960, 0, 400));
  g.multi = true;
  const evs = run(g, 30);
  ok(has(evs, 'multiEnd'));
  eq(g.multi, false);
  eq(g.ball, 1);
  eq(g.balls.length, 1);
});

test('ball save: bi rơi trong thời gian bảo vệ thì được trả bi (tự phóng), không mất lượt', () => {
  const g = E.newGame(3);
  run(g, 100, { plunge: true });
  run(g, 120, {});
  ok(g.saveT > 0, 'đang bảo vệ');
  g.balls = [E.makeBall(280, 970, 0, 600)];
  const evs = run(g, 2 * C.TPS);
  ok(has(evs, 'save'), 'cứu bi');
  ok(has(evs, 'serve'), 'tự phóng lại');
  eq(g.ball, 1);
  ok(!has(evs, 'drain'));
});

test('mất bi: hết ball save thì sang bi tiếp theo, bi mới nằm trên lò xo, hệ số về ×1', () => {
  const g = withBall(280, 970, 0, 600);
  g.mult = 3;
  g.lanes = [true, false, true];
  const evs = run(g, 30);
  ok(has(evs, 'drain'));
  eq(g.ball, 2);
  eq(g.mult, 1);
  eq(g.lanes, [false, false, false]);
  ok(E.ballWaiting(g), 'bi mới chờ phóng');
  ok(g.saveArmed, 'ball save cho bi mới');
});

test('hết 3 bi → hết ván, step không đổi gì nữa', () => {
  const g = withBall(280, 970, 0, 600);
  g.ball = 3;
  g.score = 1234;
  const evs = run(g, 30);
  ok(has(evs, 'over'));
  ok(E.isOver(g));
  const snap = JSON.stringify(E.toJSON(g));
  run(g, 50, { left: true, plunge: true });
  eq(JSON.stringify(E.toJSON(g)), snap);
});

test('ván đầy đủ: thả mặc bi (không bấm gì) thì hết 3 bi, hết ván', () => {
  const g = E.newGame(42);
  let launches = 0;
  for (let i = 0; i < 120 * 300 && !g.over; i++) {
    const waiting = E.ballWaiting(g);
    E.step(g, { plunge: waiting && i % 200 < 90 });
    if (has(g.events, 'launch')) launches++;
  }
  ok(g.over, 'hết ván');
  ok(launches >= 3, 'đã phóng ' + launches + ' lần');
});

console.log('Tất định, lưu / khôi phục');

test('tất định: cùng seed + cùng chuỗi input → cùng ván', () => {
  const ins = inputs(9, 6000);
  const a = E.newGame(123);
  const b = E.newGame(123);
  ins.forEach((x) => E.step(a, x));
  ins.forEach((x) => E.step(b, Object.assign({}, x)));
  eq(E.toJSON(a), E.toJSON(b));
  ok(a.tick > 1000);
});

test('seed khác nhau → làn skill shot khác nhau (ít nhất có khác)', () => {
  const s = new Set();
  for (let i = 0; i < 12; i++) s.add(E.newGame(i).skill);
  ok(s.size >= 2);
});

test('lưu giữa chừng rồi khôi phục: chạy tiếp y hệt ván gốc', () => {
  const ins = inputs(4, 5000);
  const a = E.newGame(77);
  ins.slice(0, 2500).forEach((x) => E.step(a, x));
  const b = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(a))));
  ok(b, 'khôi phục được');
  ins.slice(2500).forEach((x) => {
    E.step(a, x);
    E.step(b, x);
  });
  eq(E.toJSON(a), E.toJSON(b));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame(5));
  ok(E.fromJSON(good), 'ván tốt');
  const bad = [
    null,
    1,
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: 1.5 }),
    Object.assign({}, good, { ball: 4 }),
    Object.assign({}, good, { mult: 9 }),
    Object.assign({}, good, { balls: 'x' }),
    Object.assign({}, good, { balls: [] }),
    Object.assign({}, good, { balls: [Object.assign({}, good.balls[0], { x: NaN })] }),
    Object.assign({}, good, { balls: [Object.assign({}, good.balls[0], { vx: 5000 })] }),
    Object.assign({}, good, { balls: [Object.assign({}, good.balls[0], { ramp: { s: -5, v: 0 } })] }),
    Object.assign({}, good, { flips: [{ a: 3, w: 0 }, good.flips[1]] }),
    Object.assign({}, good, { lanes: [true, false] }),
    Object.assign({}, good, { targets: [1, 1, 1, 1] }),
    Object.assign({}, good, { plunger: 2 }),
    Object.assign({}, good, { fx: null }),
    Object.assign({}, good, { count: { ramps: 1 } }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
