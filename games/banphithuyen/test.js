/* Kiểm tra engine Bắn Phi Thuyền: chạy `node test.js`
 * - Đội hình: đi ngang, chạm mép thì xuống một nấc và quay đầu, càng ít địch càng nhanh
 * - Mỗi lần một viên đạn; va chạm đạn / địch / đĩa bay / bom / khiên (bào mòn) / tàu
 * - Mạng, mạng thưởng ở 1500 điểm, điểm theo hàng, qua đợt, địch xuống tới tàu là hết ván
 * - Tất định theo hạt giống + chuỗi input; một bot đơn giản qua được đợt 1 (ván chơi được)
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
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

const NONE = { dir: 0, target: null, fire: false };
/** Chạy n tick với cùng input, gom mọi sự kiện. */
function run(g, n, input) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...E.step(g, input || NONE));
  return all;
}
/** Ván "đứng yên" để thử va chạm: tắt nhịp đi, bom, đĩa bay. */
function frozen(seed) {
  const g = E.newGame({ seed: seed || 'frozen' });
  g.stepT = 1000;
  g.bombT = 1000;
  g.ufoT = 10000;
  return g;
}
const shieldCells = (g, s) => g.shields[s].reduce((a, b) => a + b, 0);
const idx = (r, c) => r * E.COLS + c;
/** Đặt đạn ngay dưới địch i (bước tới sẽ trúng). */
function bulletUnder(g, i) {
  const a = E.alienRect(g, i);
  g.bullet = { x: a.x + a.w / 2, y: a.y + a.h + 1 };
}

/* ---------------- Ván mới ---------------- */
test('ván mới: đợt 1, 3 mạng, 0 điểm, đủ 45 địch, 4 khiên nguyên', () => {
  const g = E.newGame({ seed: 1 });
  eq([g.wave, g.lives, g.score, g.phase, E.aliveCount(g)], [1, 3, 0, 'play', 45]);
  const full = E.SHIELD_SHAPE.split('').filter((c) => c === '#').length;
  eq(g.shields.map((s) => s.reduce((a, b) => a + b, 0)), [full, full, full, full]);
  eq(g.bullet, null);
  eq(g.bombs, []);
});

/* ---------------- Đội hình ---------------- */
test('đội hình đi ngang DX sau đúng một nhịp, đổi khung hình', () => {
  const g = E.newGame({ seed: 2 });
  g.bombT = 1000;
  const fx = g.fx;
  const n = g.stepT;
  run(g, n - 1);
  eq(g.fx, fx, 'chưa tới nhịp');
  const ev = run(g, 1);
  eq(g.fx, fx + E.DX);
  eq(g.anim, 1);
  ok(ev.some((e) => e.type === 'march'));
});

test('chạm mép phải: xuống DY, quay đầu, không đi ngang trong nhịp đó', () => {
  const g = E.newGame({ seed: 3 });
  g.bombT = 1000;
  const right = () => g.fx + (E.COLS - 1) * E.PITCH_X + E.CELL_W;
  g.fx = E.W - E.EDGE - E.CELL_W - (E.COLS - 1) * E.PITCH_X - 1; // còn 1px tới mép
  ok(right() + E.DX > E.W - E.EDGE);
  const fx = g.fx;
  const fy = g.fy;
  g.stepT = 1;
  const ev = run(g, 1);
  eq([g.fx, g.fy, g.dir], [fx, fy + E.DY, -1]);
  ok(ev.some((e) => e.type === 'descend'));
  g.stepT = 1;
  run(g, 1);
  eq(g.fx, fx - E.DX, 'nhịp sau đi sang trái');
});

test('chạm mép trái thì xuống và quay sang phải', () => {
  const g = frozen(4);
  g.dir = -1;
  g.fx = E.EDGE + 1;
  const fy = g.fy;
  g.stepT = 1;
  run(g, 1);
  eq([g.fy, g.dir], [fy + E.DY, 1]);
});

test('mép tính theo cột còn địch: hết cột phải thì đi xa hơn mới quay đầu', () => {
  const g = frozen(5);
  for (let r = 0; r < E.ROWS; r++) g.alive[idx(r, E.COLS - 1)] = 0;
  g.fx = E.W - E.EDGE - E.CELL_W - (E.COLS - 1) * E.PITCH_X - 1; // đủ đội hình thì đã phải quay
  const fx = g.fx;
  g.stepT = 1;
  run(g, 1);
  eq([g.fx, g.dir], [fx + E.DX, 1]);
});

test('càng ít địch càng nhanh; còn một con thì đi mỗi tick; đợt sau nhanh hơn', () => {
  const g = frozen(6);
  const full = E.stepInterval(g);
  eq(full, E.baseInterval(1));
  for (let i = 0; i < 25; i++) g.alive[i] = 0;
  const mid = E.stepInterval(g);
  for (let i = 0; i < E.TOTAL - 1; i++) g.alive[i] = 0;
  const one = E.stepInterval(g);
  ok(full > mid && mid > one, [full, mid, one].join(' > '));
  eq(one, 1);
  ok(E.baseInterval(2) < E.baseInterval(1));
  ok(E.baseInterval(50) >= 6, 'có sàn');
});

test('hạ địch thì nhịp đang đếm rút ngắn ngay', () => {
  const g = frozen(7);
  for (let i = 0; i < E.TOTAL - 2; i++) g.alive[i] = 0;
  g.stepT = 20;
  bulletUnder(g, E.TOTAL - 1);
  run(g, 1);
  eq(E.aliveCount(g), 1);
  ok(g.stepT <= 1, 'stepT ' + g.stepT);
});

/* ---------------- Đạn ---------------- */
test('mỗi lần chỉ một viên đạn; đạn ra khỏi sân thì bắn tiếp được', () => {
  const g = frozen(8);
  g.alive.fill(0);
  g.alive[idx(0, 0)] = 1; // một con ở góc trái, đạn bắn giữa sân không trúng
  g.px = E.W / 2;
  const fire = { dir: 0, target: null, fire: true };
  let ev = run(g, 1, fire);
  eq(ev.filter((e) => e.type === 'shoot').length, 1);
  ev = run(g, 10, fire);
  eq(ev.filter((e) => e.type === 'shoot').length, 0, 'đạn còn bay thì không bắn thêm');
  eq(g.shots, 1);
  let n = 0;
  while (g.bullet && n++ < 200) E.step(g, NONE);
  eq(g.bullet, null);
  run(g, 1, fire);
  eq(g.shots, 2);
});

test('đạn bay thẳng từ tàu lên, đúng tốc độ', () => {
  const g = frozen(9);
  g.px = 50;
  E.step(g, { dir: 0, target: null, fire: true });
  eq(g.bullet.x, 50);
  const y = g.bullet.y;
  E.step(g, NONE);
  eq(Math.round((y - g.bullet.y) * 1000) / 1000, E.BULLET_SPEED);
});

test('đạn trúng địch: địch chết, đạn mất, cộng điểm theo hàng 30 / 20 / 20 / 10 / 10', () => {
  const pts = [];
  for (let r = 0; r < E.ROWS; r++) {
    const g = frozen(10);
    const i = idx(r, 4);
    bulletUnder(g, i);
    const ev = run(g, 1);
    eq(g.alive[i], 0, 'hàng ' + r);
    eq(g.bullet, null);
    eq(ev.filter((e) => e.type === 'kill').length, 1);
    pts.push(g.score);
  }
  eq(pts, [30, 20, 20, 10, 10]);
});

test('đạn chỉ hạ con thấp nhất trên đường bay', () => {
  const g = frozen(11);
  const a = E.alienRect(g, idx(4, 2));
  g.bullet = { x: a.x + a.w / 2, y: a.y + 40 };
  let n = 0;
  while (g.bullet && n++ < 50) E.step(g, NONE);
  eq(g.alive[idx(4, 2)], 0);
  eq(g.alive[idx(3, 2)], 1);
  eq(g.kills, 1);
});

test('đạn đi qua khe giữa hai cột không trúng ai', () => {
  const g = frozen(12);
  g.alive.fill(0);
  g.alive[idx(4, 2)] = 1;
  g.alive[idx(4, 3)] = 1;
  const a = E.alienRect(g, idx(4, 2));
  g.bullet = { x: g.fx + 2 * E.PITCH_X + E.CELL_W + 3, y: a.y + 20 }; // giữa ô cột 2 và cột 3
  let n = 0;
  while (g.bullet && n++ < 80) E.step(g, NONE);
  eq(E.aliveCount(g), 2);
});

test('đạn trúng đĩa bay: cộng 50–300 điểm, đĩa biến mất', () => {
  const g = frozen(13);
  g.ufo = { x: 100, dir: 1 };
  g.bullet = { x: 108, y: E.UFO_Y + E.UFO_H + 1 };
  const ev = run(g, 1);
  const k = ev.find((e) => e.type === 'ufoKill');
  ok(k, 'có sự kiện ufoKill');
  ok(E.UFO_POINTS.indexOf(k.pts) >= 0 && k.pts >= 50 && k.pts <= 300);
  eq([g.score, g.ufo], [k.pts, null]);
});

test('đạn bắn trúng bom: cả hai biến mất', () => {
  const g = frozen(14);
  g.alive.fill(0);
  g.alive[idx(0, 0)] = 1;
  g.bombs = [{ x: 120, y: 200, k: 0 }];
  g.bullet = { x: 120, y: 212 };
  const ev = run(g, 2);
  ok(ev.some((e) => e.type === 'bombShot'));
  eq([g.bullet, g.bombs.length], [null, 0]);
});

/* ---------------- Khiên ---------------- */
test('đạn trúng khiên: bào mất ô, đạn mất, không có điểm', () => {
  const g = frozen(15);
  const before = shieldCells(g, 0);
  g.px = 30;
  E.step(g, { dir: 0, target: null, fire: true });
  let n = 0;
  let ev = [];
  while (g.bullet && n++ < 30) ev = ev.concat(E.step(g, NONE));
  ok(ev.some((e) => e.type === 'shield' && e.by === 'bullet'));
  ok(shieldCells(g, 0) < before, 'khiên mòn');
  eq(g.score, 0);
});

test('bom trúng khiên: bào mòn, bom mất, tàu không sao', () => {
  const g = frozen(16);
  const before = shieldCells(g, 0);
  g.px = 120;
  g.bombs = [{ x: 30, y: E.SHIELD_Y - 10, k: 1 }];
  const ev = run(g, 20);
  ok(ev.some((e) => e.type === 'shield' && e.by === 'bomb'));
  ok(shieldCells(g, 0) < before);
  eq([g.bombs.length, g.lives], [0, 3]);
});

test('bắn mãi một chỗ thì thủng khiên rồi đạn bay qua', () => {
  const g = frozen(17);
  g.alive.fill(0);
  g.alive[idx(0, 8)] = 1;
  g.px = 30;
  let through = false;
  for (let k = 0; k < 40 && !through; k++) {
    E.step(g, { dir: 0, target: null, fire: true });
    let n = 0;
    while (g.bullet && n++ < 80) {
      E.step(g, NONE);
      if (g.bullet && g.bullet.y < E.SHIELD_Y - 10) through = true;
    }
  }
  ok(through, 'sau nhiều phát phải thủng');
});

test('địch xuống tới khiên thì xóa ô khiên dưới thân', () => {
  const g = frozen(18);
  const before = shieldCells(g, 1);
  g.fy = E.SHIELD_Y - 4 * E.PITCH_Y + 2; // hàng dưới cùng lấn vào khiên 2px
  run(g, 1);
  ok(shieldCells(g, 1) < before);
});

/* ---------------- Tàu, mạng ---------------- */
test('bom trúng tàu: mất một mạng, chờ rồi hồi sinh giữa sân', () => {
  const g = frozen(19);
  g.px = 60;
  g.bombs = [{ x: 60, y: E.PLAYER_Y - 8, k: 0 }];
  let ev = [];
  for (let k = 0; k < 10 && !ev.some((e) => e.type === 'hit'); k++) ev = E.step(g, NONE);
  ok(ev.some((e) => e.type === 'hit'));
  eq([g.lives, g.phase, g.bombs.length], [2, 'dying', 0]);
  const fx = g.fx;
  run(g, E.DEATH_TICKS - 1);
  eq(g.phase, 'dying');
  eq(g.fx, fx, 'đội hình đứng yên khi tàu nổ');
  const ev2 = run(g, 1);
  ok(ev2.some((e) => e.type === 'respawn'));
  eq([g.phase, g.px], ['play', E.W / 2]);
});

test('bom rơi sát bên tàu nhưng không chạm thì không sao', () => {
  const g = frozen(20);
  g.px = 60;
  g.bombs = [{ x: 60 + E.PLAYER_W / 2 + E.BOMB_W / 2 + 0.5, y: E.PLAYER_Y - 8, k: 0 }];
  run(g, 20);
  eq([g.lives, g.phase], [3, 'play']);
});

test('mất mạng cuối thì hết ván; hết ván thì step không đổi gì', () => {
  const g = frozen(21);
  g.lives = 1;
  g.bombs = [{ x: g.px, y: E.PLAYER_Y - 8, k: 0 }];
  const ev = run(g, 6);
  ok(ev.some((e) => e.type === 'over'));
  eq([g.lives, g.phase, E.isOver(g)], [0, 'over', true]);
  const snap = JSON.stringify(E.toJSON(g));
  eq(run(g, 50, { dir: 1, target: null, fire: true }), []);
  eq(JSON.stringify(E.toJSON(g)), snap);
});

test('địch xuống tới hàng của tàu: hết ván ngay dù còn mạng', () => {
  const g = frozen(22);
  g.fy = E.PLAYER_Y - 4 * E.PITCH_Y - E.ALIEN_H - 2;
  g.stepT = 1;
  g.dir = 1;
  g.fx = E.W; // đang ở mép phải: nhịp tới sẽ xuống một nấc
  const ev = run(g, 1);
  ok(ev.some((e) => e.type === 'over' && e.reason === 'invaded'));
  eq([g.phase, g.lives], ['over', 0]);
});

test('mạng thưởng ở 1500 điểm, chỉ một lần', () => {
  const g = frozen(23);
  g.score = 1495;
  bulletUnder(g, idx(4, 0));
  const ev = run(g, 1);
  ok(ev.some((e) => e.type === 'extraLife'));
  eq([g.score, g.lives, g.extra], [1505, 4, true]);
  g.score = 2995;
  bulletUnder(g, idx(4, 1));
  run(g, 1);
  eq(g.lives, 4);
});

test('tàu: phím đi đúng tốc độ, đích chuột đi tối đa PLAYER_SPEED, không ra khỏi sân', () => {
  const g = frozen(24);
  const x = g.px;
  E.step(g, { dir: 1, target: null, fire: false });
  eq(g.px, x + E.PLAYER_SPEED);
  E.step(g, { dir: 0, target: x + 1, fire: false });
  eq(g.px, x + 1);
  run(g, 300, { dir: -1, target: null, fire: false });
  eq(g.px, E.PX_MIN);
  run(g, 300, { dir: 0, target: 9999, fire: false });
  eq(g.px, E.PX_MAX);
});

/* ---------------- Bom, đĩa bay ---------------- */
test('bom rơi từ con thấp nhất của một cột, không quá số bom tối đa', () => {
  const g = E.newGame({ seed: 25 });
  g.stepT = 100000;
  let max = 0;
  for (let k = 0; k < 2000 && g.phase === 'play'; k++) {
    const ev = E.step(g, { dir: 0, target: null, fire: false });
    ev.filter((e) => e.type === 'bomb').forEach((e) => {
      // điểm thả nằm đúng mép dưới hàng 4 (hàng thấp nhất, chưa ai chết)
      eq(e.y, g.fy + 4 * E.PITCH_Y + E.ALIEN_H);
    });
    max = Math.max(max, g.bombs.length);
  }
  ok(max >= 1 && max <= E.maxBombs(1), 'max ' + max);
});

test('đĩa bay xuất hiện theo thời gian, bay ngang hết sân rồi biến mất', () => {
  const g = frozen(26);
  g.ufoT = 1;
  let ev = run(g, 1);
  ok(ev.some((e) => e.type === 'ufo'));
  ok(g.ufo);
  ev = run(g, Math.ceil((E.W + 2 * E.UFO_W) / E.UFO_SPEED) + 2);
  ok(ev.some((e) => e.type === 'ufoGone'));
  eq(g.ufo, null);
});

/* ---------------- Qua đợt ---------------- */
test('hạ con cuối: qua đợt, chờ rồi sang đợt 2 thấp hơn và nhanh hơn, khiên mới', () => {
  const g = frozen(27);
  g.alive.fill(0);
  g.alive[idx(2, 5)] = 1;
  g.shields[0].fill(0);
  bulletUnder(g, idx(2, 5));
  const ev = run(g, 1);
  ok(ev.some((e) => e.type === 'clear'));
  eq([g.phase, g.score], ['clear', 20]);
  run(g, E.CLEAR_TICKS - 1);
  eq(g.phase, 'clear');
  const ev2 = run(g, 1);
  ok(ev2.some((e) => e.type === 'wave' && e.wave === 2));
  eq([g.wave, g.phase, E.aliveCount(g), g.fy], [2, 'play', 45, E.FY0 + 8]);
  ok(shieldCells(g, 0) > 0);
  ok(E.stepInterval(g) < E.baseInterval(1));
  eq([g.score, g.lives], [20, 3], 'giữ điểm và mạng');
});

/* ---------------- Tất định, chơi được ---------------- */
/** Chuỗi input giả lập người chơi: đổi hướng ngẫu nhiên theo hạt giống riêng, bắn liên tục. */
function scripted(seed, n) {
  let s = seed >>> 0;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [];
  let dir = 0;
  for (let i = 0; i < n; i++) {
    if (i % 20 === 0) dir = Math.floor(r() * 3) - 1;
    out.push({ dir, target: null, fire: r() < 0.8 });
  }
  return out;
}

test('tất định: cùng hạt giống + cùng input thì ra cùng ván', () => {
  const inputs = scripted(99, 4000);
  const a = E.newGame({ seed: 'abc' });
  const b = E.newGame({ seed: 'abc' });
  const evA = [];
  const evB = [];
  inputs.forEach((inp) => {
    evA.push(E.step(a, inp));
    evB.push(E.step(b, inp));
  });
  eq(E.toJSON(a), E.toJSON(b));
  eq(evA, evB);
  const c = E.newGame({ seed: 'abd' });
  inputs.forEach((inp) => E.step(c, inp));
  ok(JSON.stringify(E.toJSON(c)) !== JSON.stringify(E.toJSON(a)), 'hạt giống khác thì ván khác');
});

/**
 * Bot: nhắm đón đầu con thấp nhất của cột gần nhất (tính trước đội hình trôi bao xa khi đạn bay tới),
 * không đi xuyên qua chỗ bom sắp rơi, đang bị bom nhắm thì né trước.
 */
function simpleBot(g) {
  const px = g.px;
  const reach = E.PLAYER_W / 2 + E.BOMB_W / 2 + 2;
  const sp = E.bombSpeed(g.wave);
  const danger = (x) =>
    g.bombs.some((m) => {
      const t = (E.PLAYER_Y - (m.y + E.BOMB_H)) / sp;
      return Math.abs(m.x - x) < reach && t > -3 && t < 45;
    });
  const pathOk = (x) => {
    for (let q = Math.min(px, x); q <= Math.max(px, x); q += 2) if (danger(q)) return false;
    return !danger(x);
  };
  if (danger(px)) {
    for (let d = 6; d < 120; d += 6) {
      if (px - d > E.PX_MIN && !danger(px - d)) return { dir: 0, target: px - d, fire: false };
      if (px + d < E.PX_MAX && !danger(px + d)) return { dir: 0, target: px + d, fire: false };
    }
  }
  const interval = E.stepInterval(g);
  const cand = [];
  for (let c = 0; c < E.COLS; c++) {
    for (let r = E.ROWS - 1; r >= 0; r--) {
      if (!g.alive[r * E.COLS + c]) continue;
      const a = E.alienRect(g, r * E.COLS + c);
      const t = (E.PLAYER_Y - a.y - a.h) / E.BULLET_SPEED;
      cand.push(a.x + a.w / 2 + (g.dir * E.DX * t) / interval);
      break;
    }
  }
  cand.sort((p, q) => Math.abs(p - px) - Math.abs(q - px));
  const target = cand.find(pathOk);
  if (target == null) return { dir: 0, target: px, fire: false };
  return { dir: 0, target, fire: Math.abs(target - px) < 3 };
}

test('ván chơi được: bot đón đầu qua đợt 1 trên nhiều hạt giống', () => {
  let cleared = 0;
  const seeds = [1, 2, 3, 4, 5];
  seeds.forEach((seed) => {
    const g = E.newGame({ seed });
    for (let k = 0; k < 60 * 240 && g.phase !== 'over' && g.wave === 1; k++) E.step(g, simpleBot(g));
    if (g.wave >= 2) cleared++;
  });
  ok(cleared >= 4, 'qua đợt ' + cleared + '/' + seeds.length);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván và chơi tiếp y hệt', () => {
  const inputs = scripted(7, 3000);
  const g = E.newGame({ seed: 'save' });
  inputs.slice(0, 1500).forEach((inp) => E.step(g, inp));
  const raw = JSON.parse(JSON.stringify(E.toJSON(g)));
  const h = E.fromJSON(raw);
  ok(h, 'khôi phục được');
  eq(E.toJSON(h), E.toJSON(g));
  inputs.slice(1500).forEach((inp) => {
    E.step(g, inp);
    E.step(h, inp);
  });
  eq(E.toJSON(h), E.toJSON(g));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame({ seed: 1 }));
  ok(E.fromJSON(JSON.parse(JSON.stringify(good))), 'ván tốt');
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { wave: 0 }),
    Object.assign({}, good, { lives: 9 }),
    Object.assign({}, good, { lives: 0 }),
    Object.assign({}, good, { score: -5 }),
    Object.assign({}, good, { score: 1.5 }),
    Object.assign({}, good, { px: 999 }),
    Object.assign({}, good, { alive: '1'.repeat(44) }),
    Object.assign({}, good, { alive: '0'.repeat(45) }),
    Object.assign({}, good, { alive: '2'.repeat(45) }),
    Object.assign({}, good, { dir: 0 }),
    Object.assign({}, good, { fy: NaN }),
    Object.assign({}, good, { shields: good.shields.slice(0, 3) }),
    Object.assign({}, good, { shields: ['x'.repeat(96), good.shields[1], good.shields[2], good.shields[3]] }),
    Object.assign({}, good, { bullet: { x: 'a', y: 3 } }),
    Object.assign({}, good, { bombs: [{ x: 10, y: 10, k: 7 }] }),
    Object.assign({}, good, { bombs: 'none' }),
    Object.assign({}, good, { ufo: { x: 10, dir: 2 } }),
    Object.assign({}, good, { phase: 'win' }),
    Object.assign({}, good, { extra: 'no' }),
    Object.assign({}, good, { rng: -1 }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
