/* Kiểm tra engine Nhảy Cao: chạy `node test.js`
 * - Vật lý tất định với bước thời gian cố định: rơi, nảy, lái ngang, quấn ngang màn hình
 * - Chỉ nảy khi đang rơi xuống mặt trên bệ; lò xo; bệ vỡ; bệ di động; mây giông (dẫm / va)
 * - Camera chỉ đi lên, điểm = độ cao lớn nhất (m), rơi khỏi đáy màn hình là hết ván
 * - Bệ sinh ra luôn có đường đi lên (chứng minh trên nhiều seed, khoảng cách tính từ vật lý)
 * - Lưu / khôi phục chạy tiếp y hệt và từ chối dữ liệu hỏng
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
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg ? msg + ': ' : '') + a + ' không gần ' + b);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Ván "phòng thí nghiệm": không sinh bệ / mây, chỉ có những gì test đặt vào. */
function lab(platforms, opts) {
  const s = E.newGame(1);
  s.platforms = platforms.map((p, i) => Object.assign({ id: 1000 + i }, p));
  s.monsters = [];
  s.gen.y = Infinity; // tắt sinh màn
  Object.assign(s.player, (opts && opts.player) || {});
  return s;
}
const plat = (x, y, extra) => Object.assign({ k: 'n', x, y }, extra || {});
const run = (s, n, input) => {
  for (let i = 0; i < n; i++) E.step(s, typeof input === 'function' ? input(i, s) : input || 0);
  return s;
};
/** Chạy tới khi gặp sự kiện `kind` (trả về số bước) hoặc hết `max` bước (trả -1). */
function until(s, kind, max, input) {
  for (let i = 0; i < max; i++) {
    E.step(s, input || 0);
    if (s.ev.some((e) => e.k === kind)) return i + 1;
  }
  return -1;
}
const solid = (p) => p.k !== 'b';
const spanOf = (p) => (p.k === 'm' ? [p.lo, p.hi + E.PW] : [p.x, p.x + E.PW]);

/** Vị trí x của bệ di động sau t giây (chạy qua lại trong [lo, hi]). */
function predictX(q, t) {
  if (q.k !== 'm' || q.hi <= q.lo) return q.x;
  const span = q.hi - q.lo;
  const u = ((q.d > 0 ? q.x - q.lo : 2 * span - (q.x - q.lo)) + q.sp * t) % (2 * span);
  return q.lo + (u <= span ? u : 2 * span - u);
}

/**
 * Bot đơn giản: nhắm bệ đỡ được cao nhất còn kịp lái tới (ưu tiên lò xo, tránh bệ gần mây), lái kiểu PD.
 * Thời gian phản ứng 0,12 s được trừ khỏi thời gian bay khi xét bệ nào kịp tới.
 */
function bot(s) {
  const p = s.player;
  const apex = p.vy > 0 ? p.y + (p.vy * p.vy) / (2 * E.G) : p.y;
  const floor = s.cam - E.PH + 4;
  let best = null;
  let bestScore = -Infinity;
  for (const q of s.platforms) {
    if (q.k === 'b' || q.y > apex - 2 || q.y < floor || (p.vy <= 0 && q.y > p.y)) continue;
    const disc = p.vy * p.vy + 2 * E.G * (p.y - q.y);
    if (disc < 0) continue;
    const tl = (p.vy + Math.sqrt(disc)) / E.G;
    const cx = q.k === 's' ? q.x + q.sx + E.SPRING_W / 2 : predictX(q, tl) + E.PW / 2;
    const tol = q.k === 's' ? E.SPRING_W / 2 + E.PHW - 4 : E.PW / 2 + E.PHW - 6;
    if (Math.abs(E.wrapDelta(cx - p.x)) - tol > E.MAX_VX * Math.max(0, tl - 0.12)) continue;
    // Lò xo chỉ được ưu tiên khi nằm trong tầm cú nảy hiện tại (không quay xuống lò xo bên dưới)
    let sc = q.y + (q.k === 's' && q.y >= apex - E.H_MAX ? 400 : 0);
    for (const m of s.monsters) {
      if (m.y + E.MR > Math.min(p.y, q.y) && Math.abs(m.y - q.y) < 200 && Math.abs(E.wrapDelta(m.cx - cx)) < m.a + E.MR + E.PW / 2 + E.PHW) sc -= 2000;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = cx;
    }
  }
  // Đang lên mà có mây phía trên gần đường bay: né sang bên
  if (p.vy > 0) {
    for (const m of s.monsters) {
      const dx = E.wrapDelta(E.monsterX(m) - p.x);
      if (m.y > p.y - E.MR && m.y < apex + E.PH + E.MR && Math.abs(dx) < E.MR + E.PHW + 40) return dx > 0 ? -1 : 1;
    }
  }
  if (best == null) return 0;
  const dx = E.wrapDelta(best - p.x);
  return clamp((dx - p.vx * 0.12) / 12, -1, 1);
}

/* ---------------- Vật lý ---------------- */

test('độ cao nảy tối đa tính từ vật lý (bước cố định) gần công thức v²/2g', () => {
  const h = E.riseHeight(E.JUMP_V);
  near(h, (E.JUMP_V * E.JUMP_V) / (2 * E.G), 6, 'nảy thường');
  ok(h <= E.H_MAX, 'H_MAX phải là chặn trên');
  const hs = E.riseHeight(E.SPRING_V);
  near(hs, (E.SPRING_V * E.SPRING_V) / (2 * E.G), 10, 'lò xo');
  ok(hs <= E.SPRING_H_MAX, 'SPRING_H_MAX phải là chặn trên');
  ok(hs > 2.5 * h, 'lò xo nảy cao hơn nhiều');
});

test('khoảng hở dọc tối đa nhỏ hơn độ cao nảy, và còn đủ thời gian lái ngang tới mọi chỗ', () => {
  const h = E.riseHeight(E.JUMP_V);
  ok(E.MAX_GAP < h - 30, 'MAX_GAP ' + E.MAX_GAP + ' phải thấp hơn hẳn độ cao nảy ' + h);
  // Thời gian từ lúc nảy tới lúc rơi xuống ngang bệ cách MAX_GAP; lái ngang từ vận tốc ngược chiều tối đa
  const tDown = E.descentTime(E.JUMP_V, E.MAX_GAP);
  ok(tDown > 0.6, 'thời gian bay ' + tDown);
  const need = E.W / 2 - (E.PW / 2 + E.PHW); // màn hình quấn ngang: xa nhất là nửa bề rộng
  ok(E.reachDistance(tDown) >= need, 'lái ngang được ' + E.reachDistance(tDown) + ' < cần ' + need);
  ok(E.descentTime(E.JUMP_V, h + 1) === null, 'cao hơn độ cao nảy thì không tới');
});

test('sau cú bật lò xo luôn còn một khoảng ≥ MAX_GAP bên dưới đỉnh để đáp trước khi rơi khỏi màn hình', () => {
  // Camera giữ đỉnh ở CAM_FRAC màn hình; chết khi chân thấp hơn đỉnh - CAM_FRAC*VIEW_H - PH
  const window = E.CAM_FRAC * E.VIEW_H + E.PH;
  ok(window >= E.MAX_GAP + 100, 'khoảng đáp ' + window);
  // Lúc rơi xuống tới đó đã bay ≥ thời gian lên đỉnh lò xo: dư thời gian lái ngang
  ok(E.reachDistance(E.SPRING_V / E.G) >= E.W / 2, 'lái kịp sau lò xo');
});

test('tất định: cùng seed + cùng chuỗi phím cho cùng kết quả, seed khác cho màn khác', () => {
  const input = (i) => (Math.floor(i / 50) % 3) - 1;
  const a = run(E.newGame(42), 3000, input);
  const b = run(E.newGame(42), 3000, input);
  eq(E.toJSON(a), E.toJSON(b));
  ok(JSON.stringify(E.newGame(42).platforms) !== JSON.stringify(E.newGame(43).platforms), 'seed khác phải khác');
});

test('ván mới: đứng trên bệ đầu, đang bật lên, điểm 0, camera ở 0', () => {
  const s = E.newGame(7);
  eq([s.player.y, s.player.vy, s.score, s.cam, s.over], [E.START_Y, E.JUMP_V, 0, 0, false]);
  const first = s.platforms.find((p) => p.y === E.START_Y);
  ok(first && first.k === 'n' && Math.abs(first.x + E.PW / 2 - s.player.x) < 1, 'bệ đầu ngay dưới chân');
  ok(s.platforms.some((p) => p.y > E.VIEW_H), 'đã sinh bệ phía trên màn hình');
});

test('không bấm gì: nảy đều trên cùng một bệ, đỉnh nảy đúng độ cao vật lý', () => {
  const s = lab([plat(148, 40)], { player: { x: 180, y: 40, vy: E.JUMP_V } });
  let top = 0;
  let jumps = 0;
  for (let i = 0; i < 590; i++) {
    E.step(s, 0);
    top = Math.max(top, s.player.y);
    jumps += s.ev.filter((e) => e.k === 'jump').length;
  }
  near(top - 40, E.riseHeight(E.JUMP_V), 0.001, 'đỉnh');
  eq(jumps, 4, 'số lần nảy trong ~5 giây');
  eq(s.over, false);
});

test('chỉ nảy khi đang rơi xuống mặt trên bệ: đi lên xuyên qua bệ', () => {
  const s = lab([plat(148, 40), plat(148, 100)], { player: { x: 180, y: 40, vy: E.JUMP_V } });
  let crossedUp = false;
  for (let i = 0; i < 40; i++) {
    E.step(s, 0);
    ok(!s.ev.some((e) => e.k === 'jump'), 'không được nảy khi đang đi lên');
    if (s.player.y > 100) crossedUp = true;
  }
  ok(crossedUp, 'đã đi lên qua bệ');
  // Rơi xuống thì đáp lên chính bệ đó (không phải bệ dưới)
  ok(until(s, 'jump', 200) > 0, 'phải nảy khi rơi xuống');
  eq([s.player.y, s.player.vy], [100, E.JUMP_V]);
});

test('rơi lệch ngang khỏi bệ thì không nảy; chạm mép bệ vẫn tính (theo bề rộng chân)', () => {
  const miss = lab([plat(148, 40)], { player: { x: 180 - E.PW / 2 - E.PHW - 1, y: 60, vy: 0 } });
  run(miss, 30, 0);
  ok(miss.player.y < 40, 'phải rơi qua');
  const edge = lab([plat(148, 40)], { player: { x: 180 - E.PW / 2 - E.PHW + 1, y: 60, vy: 0 } });
  ok(until(edge, 'jump', 30) > 0, 'chạm mép thì nảy');
});

test('rơi rất nhanh vẫn không xuyên bệ (xét cả đoạn đi trong một bước)', () => {
  const s = lab([plat(148, 40)], { player: { x: 180, y: 150, vy: -2400 } });
  ok(until(s, 'jump', 30) > 0, 'phải nảy');
  eq(s.player.y, 40);
});

test('rơi qua hai bệ trong một bước thì đáp lên bệ cao hơn', () => {
  const s = lab([plat(148, 40), plat(148, 48)], { player: { x: 180, y: 60, vy: -2400 } });
  ok(until(s, 'jump', 5) > 0);
  eq(s.player.y, 48);
});

test('lò xo: đáp đúng lò xo thì bật siêu cao; đáp chỗ khác trên bệ thì nảy thường', () => {
  const s = lab([plat(148, 40, { k: 's', sx: 21, st: -1 })], { player: { x: 180, y: 60, vy: 0 } });
  ok(until(s, 'spring', 60) > 0, 'phải bật lò xo');
  eq(s.player.vy, E.SPRING_V);
  let top = 0;
  for (let i = 0; i < 240; i++) {
    E.step(s, 0);
    top = Math.max(top, s.player.y);
  }
  near(top - 40, E.riseHeight(E.SPRING_V), 0.001, 'đỉnh lò xo');
  const off = lab([plat(148, 40, { k: 's', sx: 0, st: -1 })], { player: { x: 205, y: 60, vy: 0 } });
  ok(until(off, 'jump', 60) > 0, 'nảy thường');
  eq(off.player.vy, E.JUMP_V);
});

test('bệ vỡ: đáp lên thì vỡ, không nảy, rơi tiếp xuống bệ dưới; đi lên xuyên qua không làm vỡ', () => {
  const s = lab([plat(148, 40), plat(148, 150, { k: 'b', br: false, fv: 0 })], { player: { x: 180, y: 40, vy: E.JUMP_V } });
  const brk = s.platforms[1];
  run(s, 30, 0); // đi lên qua bệ vỡ
  ok(s.player.y > 150 && !brk.br, 'đi lên không làm vỡ');
  ok(until(s, 'break', 200) > 0, 'đáp xuống thì vỡ');
  ok(brk.br && s.player.vy < 0, 'đã vỡ, không nảy');
  ok(until(s, 'jump', 200) > 0, 'rơi xuống bệ thường bên dưới');
  eq(s.player.y, 40);
  ok(brk.y < 150, 'bệ vỡ rơi xuống');
  // Bệ đã vỡ không đỡ ai nữa: lần nảy sau đi xuyên qua nó
  let again = false;
  for (let i = 0; i < 240; i++) {
    E.step(s, 0);
    if (s.ev.some((e) => e.k === 'break')) again = true;
  }
  ok(!again, 'không vỡ lần hai');
});

test('bệ di động: chạy qua lại trong khoảng của nó, vẫn đỡ người chơi', () => {
  const s = lab([plat(100, 40, { k: 'm', lo: 60, hi: 200, sp: 100, d: 1 })], { player: { x: 50, y: 200, vy: 0 } });
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 1200; i++) {
    s.player.y = 200; // giữ người chơi trên cao, chỉ xem bệ
    s.player.vy = 0;
    E.step(s, 0);
    const p = s.platforms[0];
    min = Math.min(min, p.x);
    max = Math.max(max, p.x);
  }
  near(min, 60, 1);
  near(max, 200, 1);
  const r = lab([plat(148, 40, { k: 'm', lo: 100, hi: 200, sp: 60, d: 1 })], { player: { x: 190, y: 60, vy: 0 } });
  ok(until(r, 'jump', 60) > 0, 'đáp lên bệ di động thì nảy');
});

test('lái ngang: tăng tốc tới tối đa rồi giữ, nhả phím thì dừng dần', () => {
  const s = lab([], { player: { x: 100, y: 5000, vy: 0 } });
  const hover = (n, input) => {
    for (let i = 0; i < n; i++) {
      s.player.y = 5000;
      s.player.vy = 0;
      E.step(s, input);
    }
  };
  hover(60, 1);
  eq(s.player.vx, E.MAX_VX);
  hover(60, -0.5);
  eq(s.player.vx, -E.MAX_VX / 2);
  hover(60, 0);
  eq(s.player.vx, 0);
  hover(30, 5); // đầu vào ngoài khoảng bị kẹp về [-1, 1]
  eq(s.player.vx, E.MAX_VX);
  eq(s.over, false);
});

test('quấn ngang: đi qua mép trái hiện ở mép phải và ngược lại', () => {
  const s = lab([], { player: { x: 1, y: 300, vy: 600, vx: -E.MAX_VX } });
  E.step(s, -1);
  ok(s.player.x > E.W - 10 && s.player.x < E.W, 'qua mép trái: ' + s.player.x);
  s.player.vx = E.MAX_VX;
  run(s, 3, 1);
  ok(s.player.x >= 0 && s.player.x < 10, 'qua mép phải: ' + s.player.x);
});

test('quấn ngang: đứng vắt qua mép vẫn đáp được bệ sát mép bên kia', () => {
  const s = lab([plat(E.W - E.PW, 40)], { player: { x: 2, y: 60, vy: 0 } });
  ok(until(s, 'jump', 60) > 0);
});

test('mây giông: va từ dưới thì gục và rơi tới hết ván, dẫm từ trên thì mây tan và nảy lên', () => {
  const hit = lab([plat(148, 40)], { player: { x: 180, y: 40, vy: E.JUMP_V } });
  hit.monsters = [{ id: 1, cx: 180, y: 160, a: 0, w: 0, ph: 0 }];
  ok(until(hit, 'hit', 60) > 0, 'đi lên đụng mây');
  eq(hit.dead, true);
  let bounced = false;
  for (let i = 0; i < 600 && !hit.over; i++) {
    E.step(hit, 1);
    if (hit.ev.some((e) => e.k === 'jump')) bounced = true;
  }
  ok(hit.over && !bounced, 'gục thì rơi xuyên bệ khỏi màn hình');

  const side = lab([], { player: { x: 100, y: 300, vy: 0, vx: E.MAX_VX } });
  side.monsters = [{ id: 1, cx: 150, y: 320, a: 0, w: 0, ph: 0 }];
  for (let i = 0; i < 20 && !side.dead; i++) {
    side.player.y = 300;
    side.player.vy = 0;
    E.step(side, 1);
  }
  ok(side.dead, 'đụng ngang cũng gục');

  const stomp = lab([], { player: { x: 180, y: 300, vy: -200 } });
  stomp.monsters = [{ id: 1, cx: 180, y: 260, a: 0, w: 0, ph: 0 }];
  ok(until(stomp, 'stomp', 60) > 0, 'dẫm lên mây');
  eq([stomp.dead, stomp.monsters.length, stomp.player.vy], [false, 0, E.JUMP_V]);
});

test('mây giông trôi qua lại quanh tâm trong biên độ của nó', () => {
  const s = lab([], { player: { x: 0, y: 5000, vy: 0 } });
  s.monsters = [{ id: 1, cx: 180, y: 5300, a: 60, w: 2, ph: 0 }];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 1200; i++) {
    s.player.y = 5000;
    s.player.vy = 0;
    E.step(s, 0);
    const x = E.monsterX(s.monsters[0]);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  near(lo, 120, 0.1);
  near(hi, 240, 0.1);
});

/* ---------------- Camera, điểm, hết ván ---------------- */

test('camera chỉ đi lên; điểm = độ cao lớn nhất (m), không giảm khi rơi', () => {
  const s = E.newGame(5);
  let lastCam = 0;
  let lastScore = 0;
  for (let i = 0; i < 9000 && !s.over; i++) {
    E.step(s, bot(s));
    ok(s.cam >= lastCam, 'camera đi xuống');
    ok(s.score >= lastScore, 'điểm giảm');
    eq(s.score, Math.floor((s.maxY - E.START_Y) / E.UNIT), 'điểm theo độ cao');
    ok(s.maxY >= s.player.y || s.dead, 'maxY là độ cao lớn nhất');
    lastCam = s.cam;
    lastScore = s.score;
  }
  ok(lastScore > 50, 'phải lên cao: ' + lastScore);
});

test('camera giữ đỉnh cao nhất ở CAM_FRAC màn hình khi lên cao', () => {
  const s = lab([plat(148, 40, { k: 's', sx: 21, st: -1 })], { player: { x: 180, y: 40, vy: E.SPRING_V } });
  run(s, 60, 0);
  near(s.cam, s.maxY - E.CAM_FRAC * E.VIEW_H, 1e-9);
  ok(s.cam > 0);
});

test('rơi khỏi đáy màn hình là hết ván; hết ván thì step không đổi gì', () => {
  const s = lab([], { player: { x: 180, y: 300, vy: 0 } });
  s.cam = 200;
  ok(until(s, 'over', 300) > 0, 'phải hết ván');
  ok(s.over && s.player.y + E.PH < s.cam, 'cả người đã ra khỏi đáy');
  const snap = JSON.stringify(E.toJSON(s));
  run(s, 10, 1);
  eq(JSON.stringify(E.toJSON(s)), snap);
  ok(E.isOver(s));
});

test('ván thật không bấm gì: cứ nảy, không thua; thời gian chơi tính theo số bước', () => {
  const s = E.newGame(9);
  run(s, 1200, 0);
  ok(!s.over && s.score >= Math.floor(E.riseHeight(E.JUMP_V) / E.UNIT), 'điểm ' + s.score);
  eq(E.elapsedMs(s), 10000);
});

/* ---------------- Sinh màn: luôn có đường đi ---------------- */

const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7919 + 13);
const TOP = 40000; // ~1600 m
const gens = SEEDS.map((seed) => E.generateTo(E.newGame(seed), TOP));

test('mọi seed: khoảng hở dọc giữa hai bệ đỡ được liên tiếp ≤ MAX_GAP (bệ vỡ không tính)', () => {
  const H = E.riseHeight(E.JUMP_V);
  gens.forEach((s, i) => {
    const ys = s.platforms.filter(solid).map((p) => p.y).sort((a, b) => a - b);
    eq(ys[0], E.START_Y, 'bệ thấp nhất là bệ xuất phát');
    ok(ys[ys.length - 1] >= TOP, 'sinh đủ cao');
    for (let j = 1; j < ys.length; j++) {
      const gap = ys[j] - ys[j - 1];
      ok(gap <= E.MAX_GAP && gap < H, 'seed ' + SEEDS[i] + ' khoảng hở ' + gap + ' ở ' + ys[j - 1]);
    }
  });
});

test('mọi seed: bệ nằm trong màn hình, bệ di động chạy trong khoảng của nó và chậm hơn người chơi, lò xo nằm trên bệ', () => {
  gens.forEach((s) => {
    s.platforms.forEach((p) => {
      ok(p.x >= 0 && p.x <= E.W - E.PW, 'bệ ra ngoài: ' + JSON.stringify(p));
      if (p.k === 'm') {
        ok(p.lo >= 0 && p.hi <= E.W - E.PW && p.lo <= p.x && p.x <= p.hi, 'khoảng chạy: ' + JSON.stringify(p));
        ok(p.sp > 0 && p.sp < E.MAX_VX / 2, 'tốc độ bệ: ' + p.sp);
      }
      if (p.k === 's') ok(p.sx >= 0 && p.sx + E.SPRING_W <= E.PW, 'lò xo: ' + JSON.stringify(p));
    });
  });
});

test('mọi seed: quanh mỗi mây giông có làn bệ tĩnh ngoài tầm mây, không lò xo nào bắn vào mây', () => {
  const H = E.riseHeight(E.JUMP_V);
  const HS = E.riseHeight(E.SPRING_V);
  let count = 0;
  gens.forEach((s, i) => {
    // Chỉ xét mây đã sinh đủ vùng phía trên (màn sinh dừng ở TOP)
    const mons = s.monsters.filter((m) => m.y + E.MR + 2 * E.MAX_GAP < s.gen.y).sort((a, b) => a.y - b.y);
    mons.forEach((m, k) => {
      count++;
      const where = 'seed ' + SEEDS[i] + ' mây ở ' + Math.round(m.y);
      // Vùng nguy hiểm theo phương ngang: cả tầm trôi + bán kính mây + nửa thân người chơi
      const dLo = m.cx - m.a - E.MR - E.PHW;
      const dHi = m.cx + m.a + E.MR + E.PHW;
      ok(dLo >= 0 && dHi <= E.W, where + ': vùng nguy hiểm không vắt qua mép');
      const inLane = (p) => {
        const [a, b] = spanOf(p);
        return b <= dLo || a >= dHi;
      };
      // Nảy từ bệ thấp hơn lo thì đầu không chạm tới mây; từ lo trở lên đi trong làn an toàn (quấn ngang
      // qua mép nên hai phía trái / phải là một làn liền) tới khi đứng trên một bệ cao hơn hẳn mây (hi)
      const lo = m.y - E.MR - H - E.PH;
      const hi = m.y + E.MR;
      const sol = s.platforms.filter(solid);
      const below = sol.filter((p) => p.y < lo);
      const lane = sol.filter((p) => p.y >= lo && inLane(p)).sort((a, b) => a.y - b.y);
      ok(below.length > 0, where);
      let cur = Math.max(...below.map((p) => p.y));
      let reachedAbove = false;
      for (const p of lane) {
        if (p.y - cur > E.MAX_GAP) break;
        cur = Math.max(cur, p.y);
        if (p.y > hi) {
          reachedAbove = true;
          break;
        }
      }
      ok(reachedAbove, where + ': làn an toàn đứt ở ' + Math.round(cur));
      s.platforms.forEach((p) => {
        if (p.k === 's') ok(p.y + HS + E.PH < m.y - E.MR || p.y > hi, where + ': lò xo ở ' + p.y);
      });
      if (k > 0) ok(mons[k - 1].y + E.MR < lo - E.MAX_GAP, where + ': quá gần mây trước');
    });
  });
  ok(count > SEEDS.length, 'phải có mây giông ở trên cao (' + count + ')');
});

test('độ khó tăng dần: đầu ván chỉ có bệ thường, lên cao mới có lò xo, bệ vỡ, bệ di động, mây giông', () => {
  const first = { m: Infinity, b: Infinity, s: Infinity };
  let firstMon = Infinity;
  gens.forEach((s) => {
    s.platforms.forEach((p) => { if (p.k in first) first[p.k] = Math.min(first[p.k], p.y); });
    s.monsters.forEach((m) => { firstMon = Math.min(firstMon, m.y); });
  });
  const m = (y) => (y - E.START_Y) / E.UNIT;
  ok(m(first.s) >= 15 && m(first.s) < 100, 'lò xo đầu tiên ' + m(first.s));
  ok(m(first.b) >= 25 && m(first.b) < 100, 'bệ vỡ đầu tiên ' + m(first.b));
  ok(m(first.m) >= 50 && m(first.m) < 200, 'bệ di động đầu tiên ' + m(first.m));
  ok(m(firstMon) >= 150 && m(firstMon) < 600, 'mây đầu tiên ' + m(firstMon));
});

test('mô phỏng đầy đủ: bot đơn giản leo được cao trên nhiều seed', () => {
  let total = 0;
  const seeds = SEEDS.slice(0, 20);
  seeds.forEach((seed) => {
    const s = E.newGame(seed);
    for (let i = 0; i < 120 * 60 && !s.over; i++) E.step(s, bot(s));
    total += s.score;
    ok(s.score >= 150, 'seed ' + seed + ' bot chỉ lên ' + s.score + ' m');
  });
  ok(total / seeds.length >= 300, 'trung bình ' + total / seeds.length);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu giữa ván rồi khôi phục: chạy tiếp y hệt ván gốc', () => {
  const a = E.newGame(77);
  run(a, 2000, () => bot(a));
  const b = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(a))));
  ok(b, 'khôi phục được');
  for (let i = 0; i < 1500; i++) {
    const inp = bot(a);
    E.step(a, inp);
    E.step(b, inp);
  }
  eq(E.toJSON(b), E.toJSON(a));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(run(E.newGame(3), 500, 1));
  ok(E.fromJSON(good), 'bản tốt phải nhận');
  const P = (patch) => Object.assign({}, good, { player: Object.assign({}, good.player, patch) });
  const bad = [
    null,
    1,
    'x',
    [],
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { rng: 1.5 }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { player: null }),
    P({ y: NaN }),
    P({ x: E.W + 5 }),
    P({ vx: 9999 }),
    P({ face: 0 }),
    Object.assign({}, good, { platforms: 'x' }),
    Object.assign({}, good, { platforms: [{ k: 'z', x: 0, y: 0, id: 1 }] }),
    Object.assign({}, good, { platforms: [{ k: 'm', x: 0, y: 0, id: 1 }] }),
    Object.assign({}, good, { platforms: [{ k: 'n', x: -5, y: 0, id: 1 }] }),
    Object.assign({}, good, { platforms: [{ k: 'n', x: 0, y: 0, id: 1e9 }] }),
    Object.assign({}, good, { monsters: [{ id: 1, cx: 'a', y: 0, a: 0, w: 0, ph: 0 }] }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: good.score + 5 }),
    Object.assign({}, good, { t: -3 }),
    Object.assign({}, good, { gen: null }),
    Object.assign({}, good, { gen: Object.assign({}, good.gen, { arc: 5 }) }),
    Object.assign({}, good, { over: 'no' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
