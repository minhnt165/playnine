/* Kiểm tra engine Hạ Cánh: chạy `node test.js`
 * - Vật lý: trọng lực, đẩy theo hướng mũi tàu, xoay / giới hạn nghiêng / tự cân bằng, tiêu hao nhiên liệu,
 *   hết nhiên liệu không đẩy được, xuyên mép ngang, trần, gió
 * - Va chạm với đường gấp khúc: chân chạm bãi, chân ngoài bãi, thân chạm, đỉnh núi đâm vào giữa thân
 * - Đáp an toàn / nổ (rơi nhanh, trôi ngang, nghiêng, đất gồ ghề, thân), điểm + hệ số bãi, sang màn, mất tàu, hết ván
 * - Địa hình sinh ra luôn có 3 bãi phẳng ×2 ×3 ×5 đủ rộng, cột trời phía trên bãi trống; bot hạ cánh được vào mọi bãi
 * - Tất định theo seed + chuỗi input; lưu / khôi phục chạy tiếp y hệt; từ chối dữ liệu hỏng
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
function ok(v, msg) {
  if (!v) throw new Error(msg || 'điều kiện sai');
}
function near(a, b, eps, msg) {
  if (!(Math.abs(a - b) <= (eps || 1e-9))) throw new Error((msg ? msg + ': ' : '') + a + ' ≉ ' + b);
}

/* ---------------- Dụng cụ ---------------- */

/** Địa hình tự dựng: bãi ×3 phẳng ở [300, 360] cao 100, hai bên núi; off = 0. */
function flatTerrain() {
  const pts = [[0, 100], [200, 100], [250, 160], [300, 100], [360, 100], [380, 140], [400, 60], [800, 100]];
  return { off: 0, pts, pads: [{ mult: 3, x0: 300, w: 60, y: 100, cx: 330, notch: false }] };
}

/** Ván ở màn 1 với địa hình tự dựng, không gió, tàu đặt theo `ship`. */
function rig(ship, extra) {
  const g = E.newGame(42);
  g.terrain = flatTerrain();
  g.wind = 0;
  g.ship = Object.assign({ x: 330, y: 300, vx: 0, vy: 0, a: 0, thrusting: false }, ship);
  g.events = [];
  return Object.assign(g, extra || {});
}

/** Chạy tới khi có sự kiện loại `type` (hoặc hết số bước). */
function runUntil(g, type, input, max) {
  for (let i = 0; i < (max || 2000); i++) {
    E.step(g, typeof input === 'function' ? input(g) : input || {});
    if (g.events.some((e) => e.type === type)) return g.events.find((e) => e.type === type);
  }
  return null;
}

/**
 * Bot hạ cánh (bộ điều khiển PD): chỉ thấy trạng thái trễ `delay` bước (~200 ms phản xạ), tự dự đoán tới hiện tại
 * bằng các phím đã bấm, quyết định lại mỗi `period` bước rồi giữ phím. Bay theo hành lang trên núi tới bãi
 * `target` (hệ số; mặc định bãi cao điểm nhất), hãm dần theo độ cao, chạm thẳng đứng.
 */
function makeBot(opts) {
  const o = Object.assign({ delay: 12, period: 3, target: 5 }, opts || {});
  const hist = [];
  const inputs = [];
  let cmd = {};
  let acc = 0;
  let key = '';
  let pad = null;
  function predict(g, snap, ins) {
    const s = Object.assign({}, snap);
    for (const i of ins) {
      if (i.left && !i.right) s.a -= C.ROT * C.DT;
      else if (i.right && !i.left) s.a += C.ROT * C.DT;
      s.a = Math.max(-C.MAX_TILT, Math.min(C.MAX_TILT, s.a));
      const th = i.thrust && g.fuel > 0 ? C.THRUST : 0;
      s.vx += (g.wind + th * Math.sin(s.a)) * C.DT;
      s.vy += (th * Math.cos(s.a) - g.gravity) * C.DT;
      s.x = (((s.x + s.vx * C.DT) % C.W) + C.W) % C.W;
      s.y += s.vy * C.DT;
    }
    return s;
  }
  function decide(g) {
    const back = Math.min(o.delay, hist.length - 1);
    const P = predict(g, hist[hist.length - 1 - back], inputs.slice(inputs.length - back));
    const T = g.terrain;
    const dx = E.wrapDelta(P.x, pad.cx);
    const adx = Math.abs(dx);
    const margin = pad.w / 2 - 13;
    const ab = (C.THRUST * 0.92 - g.gravity) * 0.75;
    const feet = P.y - C.FOOT;
    let vxDes = adx < 12 ? dx * 1.2 : Math.sign(dx) * Math.min(80, Math.sqrt(24 * Math.max(0, adx - 2)));
    let vyDes;
    if (adx > margin) {
      let hmax = -1;
      const n = Math.ceil(adx / 6);
      for (let k = 0; k <= n; k++) {
        const x = P.x + (dx * k) / n;
        if (!(E.padAt(T, x) === pad && Math.abs(E.wrapDelta(x, pad.cx)) < margin)) hmax = Math.max(hmax, E.maxHeight(T, x, 16));
      }
      const hf = feet - Math.max(hmax + 28, pad.y + 10);
      vyDes = hf > 0 ? -Math.min(90, 0.8 * Math.sqrt(2 * ab * hf)) : Math.min(50, -hf * 2.5);
    } else {
      const h = feet - pad.y;
      vyDes = -Math.max(C.VY_SAFE * 0.45, Math.min(110, 0.85 * Math.sqrt(2 * ab * Math.max(0, h))));
      if (h < 45 && Math.abs(P.vx) > 7) vyDes = Math.max(vyDes, -4);
    }
    const ax = (vxDes - P.vx) * 1.5 - E.windAt(g);
    const ay = Math.max(0, (vyDes - P.vy) * 2 + g.gravity);
    const lim = adx <= margin + 6 && feet - pad.y < 35 ? 0.06 : 0.9;
    const target = Math.max(-lim, Math.min(lim, Math.atan2(ax, Math.max(ay, g.gravity * 0.5))));
    const tol = C.ROT * C.DT * o.period * 0.6;
    cmd = { left: P.a > target + tol, right: P.a < target - tol, thrust: false };
    acc += Math.max(0, Math.min(1, (ax * Math.sin(P.a) + ay * Math.cos(P.a)) / C.THRUST));
    if (acc >= 0.5) {
      cmd.thrust = true;
      acc -= 1;
    }
  }
  return function (g) {
    if (g.phase !== 'fly') {
      key = '';
      return {};
    }
    const k = g.level + ':' + g.ships;
    if (k !== key) {
      key = k;
      hist.length = 0;
      inputs.length = 0;
      acc = 0;
      cmd = {};
      pad = g.terrain.pads.find((p) => p.mult === o.target) || g.terrain.pads[0];
    }
    hist.push({ x: g.ship.x, y: g.ship.y, vx: g.ship.vx, vy: g.ship.vy, a: g.ship.a });
    if ((hist.length - 1) % o.period === 0) decide(g);
    const inp = { left: !!cmd.left, right: !!cmd.right, thrust: !!cmd.thrust };
    inputs.push(inp);
    return inp;
  };
}

/** Ván bắt đầu ở màn `level` (dựng qua toJSON / fromJSON như ván lưu). */
function atLevel(seed, level) {
  const j = E.toJSON(E.newGame(seed));
  j.level = level;
  j.lvSeed = seed * 7919;
  return E.fromJSON(j);
}

/* ================================================================
 * Ván mới
 * ================================================================ */
test('ván mới: màn 1, 3 tàu, đầy nhiên liệu, tàu ở trên cao đang bay, không gió', () => {
  const g = E.newGame(7);
  eq([g.level, g.ships, g.fuel, g.score, g.phase], [1, 3, C.FUEL_MAX, 0, 'fly']);
  eq(g.ship.y, C.SPAWN_Y);
  ok(g.ship.y - C.FOOT > C.GROUND_MAX + 100, 'tàu cách đỉnh núi cao nhất > 100');
  ok(Math.abs(g.ship.vx) >= 15 && Math.abs(g.ship.vx) <= 45, 'tàu trôi ngang lúc xuất hiện');
  eq([g.ship.vy, g.ship.a, g.wind, g.gravity], [0, 0, 0, C.G0]);
  ok(g.events.some((e) => e.type === 'level' && e.n === 1));
});

/* ================================================================
 * Vật lý
 * ================================================================ */
test('trọng lực: không bấm gì thì vận tốc dọc giảm g·dt mỗi bước, vận tốc ngang giữ nguyên', () => {
  const g = rig({ vx: 6 });
  E.step(g, {});
  near(g.ship.vy, -C.G0 * C.DT);
  near(g.ship.y, 300 - C.G0 * C.DT * C.DT);
  near(g.ship.x, 330 + 6 * C.DT);
  E.step(g, {});
  near(g.ship.vy, -2 * C.G0 * C.DT);
  eq(g.ship.vx, 6);
  eq(g.fuel, C.FUEL_MAX);
});

test('đẩy thẳng đứng: gia tốc (THRUST - g) hướng lên, tốn BURN nhiên liệu mỗi bước', () => {
  const g = rig();
  E.step(g, { thrust: true });
  near(g.ship.vy, (C.THRUST - C.G0) * C.DT);
  eq(g.ship.vx, 0);
  eq(g.fuel, C.FUEL_MAX - C.BURN);
  eq(g.ship.thrusting, true);
  for (let i = 0; i < 9; i++) E.step(g, { thrust: true });
  eq(g.fuel, C.FUEL_MAX - 10 * C.BURN);
});

test('đẩy theo hướng mũi tàu: nghiêng phải thì đẩy sang phải, nghiêng trái thì sang trái', () => {
  const a = Math.PI / 6;
  const g = rig({ a });
  E.step(g, { thrust: true });
  near(g.ship.vx, C.THRUST * Math.sin(a) * C.DT);
  near(g.ship.vy, (C.THRUST * Math.cos(a) - C.G0) * C.DT);
  const h = rig({ a: -a });
  E.step(h, { thrust: true });
  near(h.ship.vx, -C.THRUST * Math.sin(a) * C.DT);
});

test('xoay: phải tăng góc, trái giảm góc ROT·dt mỗi bước; giữ cả hai thì đứng yên; nghiêng tối đa 90°', () => {
  const g = rig();
  E.step(g, { right: true });
  near(g.ship.a, C.ROT * C.DT);
  E.step(g, { left: true });
  E.step(g, { left: true });
  near(g.ship.a, -C.ROT * C.DT);
  E.step(g, { left: true, right: true });
  near(g.ship.a, -C.ROT * C.DT);
  for (let i = 0; i < 200; i++) E.step(g, { left: true });
  eq(g.ship.a, -C.MAX_TILT);
});

test('tự cân bằng góc: không xoay thì mũi tàu quay về thẳng đứng cùng tốc độ xoay, đang xoay thì không can thiệp', () => {
  const g = rig({ a: 0.5 });
  E.step(g, { assist: true });
  near(g.ship.a, 0.5 - C.ROT * C.DT);
  E.step(g, { assist: true, right: true });
  near(g.ship.a, 0.5);
  for (let i = 0; i < 30; i++) E.step(g, { assist: true, thrust: true });
  eq(g.ship.a, 0);
  const h = rig({ a: 0.5 });
  E.step(h, {});
  eq(h.ship.a, 0.5, 'không bật thì góc giữ nguyên');
});

test('nhiên liệu: báo sắp hết khi xuống dưới mức thấp, báo hết khi về 0; hết rồi bấm đẩy không có tác dụng', () => {
  const g = rig({ y: 600 }, { fuel: C.FUEL_LOW + 0.5 });
  E.step(g, { thrust: true });
  ok(g.events.some((e) => e.type === 'low'), 'báo sắp hết');
  g.fuel = 1;
  E.step(g, { thrust: true });
  eq(g.fuel, 0);
  ok(g.events.some((e) => e.type === 'empty'), 'báo hết');
  const vy = g.ship.vy;
  E.step(g, { thrust: true });
  near(g.ship.vy, vy - C.G0 * C.DT, 1e-9, 'chỉ còn trọng lực');
  eq([g.fuel, g.ship.thrusting], [0, false]);
});

test('xuyên mép ngang và trần trên', () => {
  const g = rig({ x: 799.9, y: 700, vx: 30 });
  E.step(g, {});
  ok(g.ship.x >= 0 && g.ship.x < 1, 'sang mép trái: ' + g.ship.x);
  const h = rig({ x: 0.1, y: 700, vx: -30 });
  E.step(h, {});
  ok(h.ship.x > 799, 'sang mép phải: ' + h.ship.x);
  const k = rig({ y: C.CEIL - 0.1, vy: 80 });
  E.step(k, {});
  eq([k.ship.y, k.ship.vy], [C.CEIL, 0]);
});

test('gió: gia tốc ngang theo mức của màn, giật ±40% theo thời gian', () => {
  const g = rig({ y: 600 });
  g.wind = 5;
  g.windPhase = 0;
  g.tick = 0;
  E.step(g, {});
  near(g.ship.vx, E.windAt(g) * C.DT, 1e-9);
  const ws = [];
  for (let t = 0; t < 300; t++) ws.push(E.windAt({ wind: 5, windPhase: 0, tick: t }));
  near(Math.max(...ws), 5 * (1 + C.GUST), 0.01);
  near(Math.min(...ws), 5 * (1 - C.GUST), 0.01);
});

/* ================================================================
 * Địa hình và va chạm
 * ================================================================ */
test('độ cao mặt đất: nội suy trên đường gấp khúc, tuần hoàn theo x, đỉnh giữa hai mẫu vẫn được tính', () => {
  const T = flatTerrain();
  eq(E.heightAt(T, 100), 100);
  eq(E.heightAt(T, 225), 130);
  eq(E.heightAt(T, 250), 160);
  eq(E.heightAt(T, 330), 100);
  eq(E.heightAt(T, 1050), 160, 'x + W');
  eq(E.heightAt(T, -550), 160, 'x - W');
  eq(E.maxHeight(T, 250, 5), 160);
  eq(E.maxHeight(T, 380, 1), 140);
  eq(E.padAt(T, 300).mult, 3);
  eq(E.padAt(T, 360).mult, 3);
  eq(E.padAt(T, 361), null);
  const W = { off: 780, pts: [[0, 50], [40, 50], [800, 50]], pads: [{ mult: 2, x0: 780, w: 40, y: 50, cx: 0, notch: false }] };
  eq(E.padAt(W, 5).mult, 2, 'bãi vắt qua mép');
  eq(E.padAt(W, 790).mult, 2);
});

test('va chạm: tàu trên không thì chưa chạm; hai chân trên bãi; một chân ngoài bãi', () => {
  const T = flatTerrain();
  eq(E.contact(T, { x: 330, y: 112, a: 0 }), null);
  const c = E.contact(T, { x: 330, y: 110.5, a: 0 });
  eq([c.hull, c.pad && c.pad.mult], [false, 3]);
  const d = E.contact(T, { x: 305, y: 110, a: 0 });
  eq([d.hull, d.pad], [false, null], 'chân trái ngoài bãi (trên sườn núi)');
});

test('va chạm: thân tàu chạm sườn núi; đỉnh núi nhọn đâm vào giữa thân dù các đỉnh của thân còn ở trên', () => {
  const T = flatTerrain();
  // Nghiêng mạnh sát sườn núi bên trái bãi
  const c = E.contact(T, { x: 262, y: 150, a: -1.2 });
  eq(c && c.hull, true);
  // Đỉnh nhọn cao 160 tại x = 250, thân tàu (chân ở 146) bọc quanh đỉnh: không đỉnh nào của thân nằm dưới đất
  const s = { x: 250, y: 158.5, a: 0 };
  const poly = E.shipPoly(s);
  ok(poly.every(([x, y]) => y > E.heightAt(T, x)), 'mọi đỉnh của thân ở trên mặt đất');
  eq(E.contact(T, s), { hull: true, pad: null });
});

test('địa hình sinh ra: 3 bãi ×2 ×3 ×5 phẳng, đủ rộng, không chồng nhau, cột trời trên bãi trống (500 seed)', () => {
  const span = 2 * C.FOOT;
  for (let seed = 1; seed <= 500; seed++) {
    const T = E.makeTerrain(seed * 2654435761);
    eq(T.pads.map((p) => p.mult).sort(), [2, 3, 5], 'seed ' + seed);
    const w = {};
    T.pads.forEach((p) => { w[p.mult] = p.w; });
    ok(w[2] > w[3] && w[3] > w[5], 'bãi điểm cao hẹp hơn');
    ok(T.pts[0][0] === 0 && T.pts[T.pts.length - 1][0] === C.W && T.pts[0][1] === T.pts[T.pts.length - 1][1], 'khép vòng');
    for (let i = 1; i < T.pts.length; i++) ok(T.pts[i][0] >= T.pts[i - 1][0], 'pts tăng dần');
    ok(T.pts.every(([, h]) => h >= C.GROUND_MIN && h <= C.GROUND_MAX), 'độ cao trong khoảng');
    for (const p of T.pads) {
      ok(p.w >= span + 12, 'bãi rộng hơn tàu ít nhất 12');
      for (let x = p.x0; x <= p.x0 + p.w; x += 3) near(E.heightAt(T, x), p.y, 1e-9, 'bãi phẳng');
      // Tàu thẳng đứng đặt giữa bãi chạm được mặt bãi mà thân không chạm gì
      eq(E.maxHeight(T, p.cx, C.FOOT + 4), p.y, 'cột trời trên bãi trống (seed ' + seed + ')');
      const c = E.contact(T, { x: p.cx, y: p.y + C.FOOT - 0.01, a: 0 });
      eq([c.hull, c.pad && c.pad.mult], [false, p.mult]);
      for (const q of T.pads) if (q !== p) ok(Math.abs(E.wrapDelta(p.cx, q.cx)) > (p.w + q.w) / 2 + 40, 'bãi cách nhau');
    }
  }
});

test('địa hình tất định theo hạt giống màn; có cả bãi ×5 trên cao và trong khe', () => {
  eq(E.makeTerrain(123), E.makeTerrain(123));
  ok(JSON.stringify(E.makeTerrain(123)) !== JSON.stringify(E.makeTerrain(124)));
  let notch = 0;
  for (let s = 1; s <= 200; s++) if (E.makeTerrain(s).pads.find((p) => p.mult === 5).notch) notch++;
  ok(notch > 50 && notch < 150, 'khe: ' + notch);
});

/* ================================================================
 * Đáp / nổ và điểm
 * ================================================================ */
test('điểm một lần đáp: cơ bản × hệ số + thưởng độ êm + thưởng nhiên liệu', () => {
  eq(E.landingScore(5, { vx: 0, vy: 0, a: 0 }, C.FUEL_MAX), { mult: 5, base: 250, soft: 50, fuel: 50, total: 350 });
  eq(E.landingScore(2, { vx: 0, vy: -C.VY_SAFE, a: 0 }, 0), { mult: 2, base: 100, soft: 0, fuel: 0, total: 100 });
  eq(E.landingScore(3, { vx: C.VX_SAFE / 2, vy: -5, a: 0 }, 399), { mult: 3, base: 150, soft: 25, fuel: 19, total: 194 });
  eq(E.landingScore(3, { vx: 0, vy: 3, a: -C.ANG_SAFE / 5 }, 100).soft, 40, 'đang bay lên thì không tính rơi');
});

test('đáp an toàn: chạm bãi nhẹ, thẳng → cộng điểm theo hệ số bãi, nạp nhiên liệu, chờ rồi sang màn 2', () => {
  const g = rig({ y: 112, vy: -8, vx: 3 }, { fuel: 500 });
  const ev = runUntil(g, 'land');
  ok(ev, 'có sự kiện đáp');
  eq([ev.mult, ev.base, ev.fuel], [3, 150, 25]);
  eq(g.score, ev.total);
  ok(ev.soft > 0 && ev.soft < 50);
  eq([g.phase, g.fuel, g.lands, g.ship.y, g.ship.vy], ['landed', 500 + C.REFILL - C.BURN * 0, [0, 1, 0], 100 + C.FOOT, 0]);
  const seed0 = g.lvSeed;
  for (let i = 0; i < C.LAND_WAIT - 1; i++) E.step(g, {});
  eq([g.phase, g.level], ['landed', 1]);
  E.step(g, {});
  eq([g.phase, g.level, g.ships], ['fly', 2, 3]);
  ok(g.lvSeed !== seed0, 'địa hình mới');
  ok(g.events.some((e) => e.type === 'level' && e.n === 2));
  eq(g.ship.y, C.SPAWN_Y);
});

test('nạp nhiên liệu không vượt bình đầy', () => {
  const g = rig({ y: 111.2, vy: -2 }, { fuel: 900 });
  runUntil(g, 'land');
  eq(g.fuel, C.FUEL_MAX);
});

test('nổ: rơi quá nhanh, trôi ngang quá nhanh, nghiêng quá, chân ngoài bãi, thân chạm núi', () => {
  const cases = [
    [{ y: 112, vy: -(C.VY_SAFE + 2) }, 'fast'],
    [{ y: 111.5, vy: -5, vx: C.VX_SAFE + 2 }, 'drift'],
    [{ y: 112, vy: -5, a: C.ANG_SAFE + 0.05 }, 'tilt'],
    [{ x: 230, y: 160, vy: -5 }, 'rough'],
    [{ x: 262, y: 160, vy: -5, a: -1.2 }, 'hull'],
  ];
  for (const [ship, reason] of cases) {
    const g = rig(ship);
    const ev = runUntil(g, 'crash', {}, 200);
    ok(ev, 'có nổ: ' + reason);
    eq([ev.reason, g.phase, g.ships, g.score, g.ship], [reason, 'crashed', 2, 0, null], reason);
  }
});

test('ngay ở ngưỡng vẫn an toàn: rơi đúng tốc độ giới hạn, nghiêng đúng góc giới hạn', () => {
  // Đặt sát mặt bãi để bước tới chạm ngay; vy sau bước = vy - g·dt nên bù trước phần đó
  const g = rig({ y: 111.2, vy: -C.VY_SAFE + C.G0 * C.DT + 1e-6, a: 0 });
  ok(runUntil(g, 'land', {}, 5), 'đúng ngưỡng rơi');
  const h = rig({ y: 111.2 + 1.9, vy: -5, a: C.ANG_SAFE - 1e-6 });
  ok(runUntil(h, 'land', {}, 50), 'đúng ngưỡng góc');
});

test('nổ khi còn tàu và nhiên liệu: chờ rồi ra tàu mới trên cùng địa hình', () => {
  const g = rig({ y: 112, vy: -40 });
  runUntil(g, 'crash');
  const seed0 = g.lvSeed;
  for (let i = 0; i < C.CRASH_WAIT; i++) E.step(g, {});
  eq([g.phase, g.ships, g.level, g.lvSeed], ['fly', 2, 1, seed0]);
  eq(g.ship.y, C.SPAWN_Y);
});

test('hết ván: nổ tàu cuối cùng, hoặc nổ khi đã hết nhiên liệu dù còn tàu', () => {
  const g = rig({ y: 112, vy: -40 }, { ships: 1 });
  const ev = runUntil(g, 'crash');
  eq(ev.last, true);
  const over = runUntil(g, 'over', {}, C.CRASH_WAIT + 1);
  ok(over, 'hết ván');
  eq([g.phase, g.ships], ['over', 0]);
  const h = rig({ y: 112, vy: -40 }, { fuel: 0 });
  eq(runUntil(h, 'crash').last, true);
  ok(runUntil(h, 'over', {}, C.CRASH_WAIT + 1), 'hết nhiên liệu là hết ván');
  eq(h.ships, 2);
  // Hết ván rồi thì không đổi gì nữa
  const tick = h.tick;
  E.step(h, { thrust: true });
  eq([h.tick, h.phase], [tick, 'over']);
});

test('hết nhiên liệu giữa trời nhưng vẫn đáp được: nạp lại và chơi tiếp', () => {
  const g = rig({ y: 113, vy: -3 }, { fuel: 0 });
  ok(runUntil(g, 'land'), 'đáp');
  eq(g.fuel, C.REFILL);
  for (let i = 0; i < C.LAND_WAIT; i++) E.step(g, {});
  eq([g.phase, g.level], ['fly', 2]);
});

test('màn sau khó hơn: trọng lực tăng 10% mỗi màn (tối đa ×1,6), gió từ màn 2 tăng dần (tối đa 6)', () => {
  eq(E.levelParams(1, 5).gravity, C.G0);
  eq(E.levelParams(1, 5).wind, 0);
  near(E.levelParams(2, 5).gravity, C.G0 * 1.1, 1e-9);
  near(Math.abs(E.levelParams(2, 5).wind), C.WIND_BASE, 1e-9);
  near(Math.abs(E.levelParams(4, 5).wind), C.WIND_BASE + 2 * C.WIND_STEP, 1e-9);
  near(E.levelParams(50, 5).gravity, C.G0 * C.G_MAX, 1e-9);
  eq(Math.abs(E.levelParams(50, 5).wind), C.WIND_MAX);
  const signs = new Set();
  for (let s = 1; s < 40; s++) signs.add(Math.sign(E.levelParams(3, s).wind));
  eq([...signs].sort(), [-1, 1], 'gió có cả hai chiều');
});

/* ================================================================
 * Bãi đáp đến được: bot người thật (phản xạ 200 ms) hạ cánh vào từng bãi
 * ================================================================ */
test('bot phản xạ 200 ms hạ cánh được vào cả ba bãi ở màn 1 (30 seed × 3 bãi)', () => {
  for (const target of [2, 3, 5]) {
    for (let seed = 1; seed <= 30; seed++) {
      const g = E.newGame(seed);
      const bot = makeBot({ target });
      while (g.phase === 'fly') E.step(g, bot(g));
      eq([g.phase, g.events[0].mult], ['landed', target], 'seed ' + seed + ' bãi ×' + target);
    }
  }
});

test('ở độ khó tối đa (trọng lực ×1,6, gió 6 có giật) bot vẫn đáp được bãi ×2 và ×3 (20 seed)', () => {
  for (const target of [2, 3]) {
    for (let seed = 1; seed <= 20; seed++) {
      const g = atLevel(seed, 30);
      const bot = makeBot({ target });
      while (g.phase === 'fly') E.step(g, bot(g));
      eq(g.phase, 'landed', 'seed ' + seed + ' bãi ×' + target);
    }
  }
});

test('cả ván với bot: qua nhiều màn, điểm tăng dần, rồi hết ván vì nhiên liệu cạn dần', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = E.newGame(seed);
    const bot = makeBot({ target: 5 });
    let lands = 0;
    while (g.phase !== 'over' && g.tick < 60 * 900) {
      E.step(g, bot(g));
      if (g.events.some((e) => e.type === 'land')) lands++;
    }
    eq(g.phase, 'over', 'seed ' + seed);
    ok(lands >= 3 && g.level === lands + 1, 'qua ' + lands + ' màn');
    ok(g.score >= lands * 250, 'điểm ' + g.score);
  }
});

/* ================================================================
 * Tất định, lưu / khôi phục
 * ================================================================ */
/** Chuỗi input giả ngẫu nhiên theo seed (để so hai lần chạy). */
function randomInputs(seed, n) {
  let s = seed;
  const r = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out = [];
  for (let i = 0; i < n; i++) out.push({ left: r() < 0.2, right: r() < 0.2, thrust: r() < 0.45, assist: r() < 0.5 });
  return out;
}

test('tất định: cùng seed + cùng chuỗi input ra đúng cùng một ván; seed khác ra ván khác', () => {
  const run = (seed) => {
    const g = E.newGame(seed);
    const bot = makeBot({ target: 3 });
    for (let i = 0; i < 3000; i++) E.step(g, bot(g));
    return JSON.stringify(E.toJSON(g));
  };
  eq(run(11), run(11));
  ok(run(11) !== run(12));
  const a = E.newGame('abc');
  const b = E.newGame('abc');
  for (const inp of randomInputs(5, 1500)) {
    E.step(a, inp);
    E.step(b, inp);
  }
  eq(E.toJSON(a), E.toJSON(b));
});

test('lưu rồi khôi phục giữa chừng: chạy tiếp ra đúng như ván gốc (cả địa hình sinh lại từ hạt giống màn)', () => {
  const g = E.newGame(99);
  const bot = makeBot({ target: 2 });
  ok(runUntil(g, 'land', bot, 3000), 'đáp lần đầu');
  for (let i = 0; i < 300; i++) E.step(g, bot(g)); // đang bay ở màn 2
  eq([g.level, g.phase], [2, 'fly']);
  const r = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(r, 'khôi phục được');
  eq(r.terrain, g.terrain);
  eq([r.gravity, r.wind, r.windPhase], [g.gravity, g.wind, g.windPhase]);
  for (const inp of randomInputs(9, 1200)) {
    E.step(g, inp);
    E.step(r, inp);
  }
  eq(E.toJSON(r), E.toJSON(g));
});

test('lưu / khôi phục ở mọi pha: đang bay, vừa đáp, vừa nổ, hết ván', () => {
  const fly = E.newGame(3);
  const landed = rig({ y: 112, vy: -5 });
  runUntil(landed, 'land');
  const crashed = rig({ y: 112, vy: -40 });
  runUntil(crashed, 'crash');
  const over = rig({ y: 112, vy: -40 }, { ships: 1 });
  runUntil(over, 'over');
  for (const g of [fly, landed, crashed, over]) {
    const j = E.toJSON(g);
    eq(E.toJSON(E.fromJSON(JSON.parse(JSON.stringify(j)))), j, g.phase);
  }
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame(5));
  ok(E.fromJSON(good), 'ván tốt');
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { seed: 1.5 }),
    Object.assign({}, good, { rng: '1' }),
    Object.assign({}, good, { lvSeed: null }),
    Object.assign({}, good, { level: 0 }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: 10.5 }),
    Object.assign({}, good, { ships: 4 }),
    Object.assign({}, good, { ships: 0 }),
    Object.assign({}, good, { fuel: C.FUEL_MAX + 1 }),
    Object.assign({}, good, { fuel: NaN }),
    Object.assign({}, good, { phase: 'win' }),
    Object.assign({}, good, { timer: 5 }),
    Object.assign({}, good, { lands: [0, 0] }),
    Object.assign({}, good, { lands: [1, 0, 0] }),
    Object.assign({}, good, { ship: null }),
    Object.assign({}, good, { ship: Object.assign({}, good.ship, { x: C.W }) }),
    Object.assign({}, good, { ship: Object.assign({}, good.ship, { y: -1 }) }),
    Object.assign({}, good, { ship: Object.assign({}, good.ship, { a: 2 }) }),
    Object.assign({}, good, { ship: Object.assign({}, good.ship, { vx: Infinity }) }),
    Object.assign({}, good, { phase: 'crashed', timer: 10 }),
    Object.assign({}, good, { phase: 'landed', timer: 0 }),
    Object.assign({}, good, { wreck: { x: 1 } }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i + ': ' + JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
