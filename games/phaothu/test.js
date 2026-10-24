/* Kiểm tra engine Pháo Thủ: chạy `node test.js`
 * - Địa hình sinh theo seed (tất định, trong khung, nền pháo phẳng), hai bên luôn tìm được phát trúng nhau
 * - Vật lý quỹ đạo (trọng lực, gió, bước cố định), khoét địa hình, sát thương theo khoảng cách, pháo rơi
 * - Lượt, gió đổi mỗi lượt, đạn có hạn, thắng / thua / hòa, giới hạn số phát
 * - Máy mọi mức bắn hợp lệ, tất định, không tự bắn vào mình; Khó học từ phát trượt; mức cao thắng phần lớn mức thấp
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
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

/** Ván có địa hình phẳng ở độ cao h, hai pháo ở x0 / x1, gió w, tới lượt `turn`. */
function flatGame(h, x0, x1, w, turn) {
  const raw = E.toJSON(E.newGame({ seed: 7 }));
  raw.terrain = Array(E.COLS).fill(h);
  raw.tanks[0].x = x0;
  raw.tanks[1].x = x1;
  raw.wind = w || 0;
  raw.turn = turn || 0;
  const s = E.fromJSON(raw);
  ok(s, 'ván phẳng hợp lệ');
  return s;
}
// Phát "bỏ lượt" trên đất phẳng: bắn ngược ra mép bản đồ gần nhất, không trúng gì
const PASS = [{ angle: 160, power: 100, weapon: 'shell' }, { angle: 20, power: 100, weapon: 'shell' }];

/* ===================== Sinh địa hình ===================== */

test('cùng seed thì cùng địa hình, vị trí pháo và gió; khác seed thì khác', () => {
  eq(E.toJSON(E.newGame({ seed: 123 })), E.toJSON(E.newGame({ seed: 123 })));
  ok(JSON.stringify(E.newGame({ seed: 123 }).terrain) !== JSON.stringify(E.newGame({ seed: 124 }).terrain), 'seed khác phải ra địa hình khác');
});

test('địa hình nằm trong khung, pháo ở hai bên và đứng trên mặt đất', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const g = E.newGame({ seed });
    eq(g.terrain.length, E.COLS);
    for (const h of g.terrain) ok(h >= E.BEDROCK && h <= E.H * 0.65, 'độ cao ' + h + ' (seed ' + seed + ')');
    const [t0, t1] = g.tanks;
    ok(t0.x >= 50 && t0.x <= 170 && t1.x >= 630 && t1.x <= 750, 'vị trí pháo ' + t0.x + ' ' + t1.x);
    ok(t1.x - t0.x >= E.MIN_GAP, 'hai pháo đủ xa');
    for (const t of g.tanks) {
      near(t.y, E.restY(g.terrain, t.x), 1e-9, 'pháo đứng trên đất');
      eq(t.hp, E.MAX_HP);
    }
    ok(Math.abs(g.wind) <= E.MAX_WIND && Number.isInteger(g.wind), 'gió nguyên trong khoảng');
  }
});

test('nền pháo phẳng (chênh dưới 1 đơn vị trên bề rộng pháo)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const g = E.newGame({ seed });
    for (const t of g.tanks) {
      const hs = [-14, -7, 0, 7, 14].map((d) => E.groundAt(g.terrain, t.x + d));
      ok(Math.max(...hs) - Math.min(...hs) < 1, 'nền pháo không phẳng ở seed ' + seed);
    }
  }
});

test('màn giải được: 200 seed, mỗi bên đều tìm được phát trúng đối thủ với gió -max, 0, +max', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g0 = E.newGame({ seed });
    for (const wind of [-E.MAX_WIND, 0, E.MAX_WIND]) {
      for (const side of [0, 1]) {
        const g = Object.assign({}, g0, { wind, turn: side });
        const plan = E.planShot(g, side, { wind, weapon: 'shell' });
        ok(plan, 'không có phát nào (seed ' + seed + ', gió ' + wind + ', bên ' + side + ')');
        const out = E.fire(g, { angle: plan.angle, power: plan.power, weapon: 'shell' });
        ok(out.damage[1 - side] >= 20, 'phát tốt nhất gây ' + out.damage[1 - side] + ' (seed ' + seed + ', gió ' + wind + ', bên ' + side + ')');
      }
    }
  }
});

/* ===================== Vật lý quỹ đạo ===================== */

test('không gió, đất phẳng: tầm bay khớp công thức ném xiên (sai số bước nhỏ)', () => {
  const g = flatGame(100, 100, 700, 0);
  for (const [angle, power] of [[45, 50], [30, 70], [60, 60], [45, 80]]) {
    const r = E.trace(g.terrain, g.tanks, 0, angle, power, 0);
    const m = E.muzzle(g.tanks[0], angle);
    const v = (power / 100) * E.VMAX;
    const a = (angle * Math.PI) / 180;
    const vx = v * Math.cos(a);
    const vy = v * Math.sin(a);
    // Rơi từ miệng nòng (m.y) về mặt đất (100)
    const tf = (vy + Math.sqrt(vy * vy + 2 * E.G * (m.y - 100))) / E.G;
    ok(!r.out && r.hit < 0, 'phát ' + angle + '/' + power + ' phải chạm đất');
    near(r.x, m.x + vx * tf, 4, 'điểm rơi ' + angle + '/' + power);
    near(r.steps * E.DT, tf, 3 * E.DT, 'thời gian bay');
  }
});

test('quỹ đạo đối xứng: bắn sang trái và sang phải đi xa như nhau', () => {
  const g = flatGame(100, 400, 700, 0);
  const g2 = flatGame(100, 100, 400, 0, 1);
  const r = E.trace(g.terrain, g.tanks, 0, 50, 40, 0);
  const l = E.trace(g2.terrain, g2.tanks, 1, 130, 40, 0);
  near(r.x - 400, 400 - l.x, 1e-3);
});

test('gió xuôi đẩy đạn xa hơn, gió ngược kéo gần lại, đúng gia tốc gió', () => {
  const g = flatGame(100, 100, 700, 0);
  const calm = E.trace(g.terrain, g.tanks, 0, 45, 55, 0);
  const tail = E.trace(g.terrain, g.tanks, 0, 45, 55, 6);
  const head = E.trace(g.terrain, g.tanks, 0, 45, 55, -6);
  ok(tail.x > calm.x + 20 && head.x < calm.x - 20, 'gió phải đổi điểm rơi: ' + head.x + ' ' + calm.x + ' ' + tail.x);
  // Lệch ≈ ½·a·t² (gió chỉ có gia tốc ngang)
  const tf = calm.steps * E.DT;
  near(tail.x - calm.x, 0.5 * 6 * E.WIND_ACC * tf * tf, 6, 'lệch do gió');
});

test('trọng lực: bắn thẳng đứng lên thì rơi về chính pháo mình, đỉnh đúng v²/2g', () => {
  const g = flatGame(100, 400, 700, 0);
  const r = E.trace(g.terrain, g.tanks, 0, 90, 40, 0);
  eq(r.hit, 0, 'rơi trúng chính mình');
  const v = 0.4 * E.VMAX;
  near(r.top, E.muzzle(g.tanks[0], 90).y + (v * v) / (2 * E.G), 3, 'đỉnh quỹ đạo');
});

test('đạn ra ngoài mép bản đồ thì mất, không nổ, không đổi địa hình', () => {
  const g = flatGame(100, 100, 700, 0);
  ok(E.trace(g.terrain, g.tanks, 0, 160, 100, 0).out, 'phải bay ra ngoài');
  const out = E.fire(g, PASS[0]);
  eq(out.explosions.length, 0);
  eq(out.damage, [0, 0]);
  eq(out.state.terrain, g.terrain);
});

test('đồi chắn đường: đạn bắn thấp nổ vào sườn đồi trước khi tới đích', () => {
  const raw = E.toJSON(flatGame(100, 100, 700, 0));
  for (let i = 0; i < E.COLS; i++) raw.terrain[i] = 100 + Math.max(0, 220 - Math.abs(i * E.STEP - 400) * 2);
  const hill = E.fromJSON(raw);
  const r = E.trace(hill.terrain, hill.tanks, 0, 15, 90, 0);
  ok(r.hit < 0 && !r.out && r.x > 250 && r.x < 400, 'nổ ở sườn đồi bên trái: ' + r.x);
});

test('mô phỏng tất định: cùng ván cùng phát cho cùng kết quả', () => {
  const g = E.newGame({ seed: 99 });
  const a = E.fire(g, { angle: 55, power: 63, weapon: 'shell' });
  const b = E.fire(E.fromJSON(clone(E.toJSON(g))), { angle: 55, power: 63, weapon: 'shell' });
  eq(E.toJSON(a.state), E.toJSON(b.state));
  eq(a.shells, b.shells);
});

/* ===================== Khoét địa hình ===================== */

test('khoét: hố tròn bán kính r, đất phía trên sập xuống, ngoài bán kính giữ nguyên', () => {
  const t = Array(E.COLS).fill(200);
  const c = E.carve(t, 400, 200, 30);
  near(E.groundAt(c, 400), 170, 0.01, 'đáy hố ở tâm');
  near(E.groundAt(c, 418), 200 - Math.sqrt(30 * 30 - 18 * 18), 0.01, 'thành hố');
  eq(E.groundAt(c, 440), 200, 'ngoài hố');
  eq(t[200], 200, 'không đụng mảng cũ');
  // Nổ trong lòng đất: lớp đất phía trên sập xuống, mặt đất hạ đúng bằng phần bị khoét
  near(E.groundAt(E.carve(t, 400, 150, 30), 400), 140, 0.01, 'nổ ngầm');
  // Nổ trên không (cao hơn mặt đất quá bán kính): không khoét
  eq(E.carve(t, 400, 260, 30), t);
});

test('khoét không xuống dưới lớp đá đáy', () => {
  let t = Array(E.COLS).fill(E.BEDROCK + 10);
  for (let i = 0; i < 5; i++) t = E.carve(t, 400, E.groundAt(t, 400), 40);
  ok(Math.min(...t) >= E.BEDROCK, 'đá đáy');
});

test('phát nổ khoét địa hình trong ván, số được làm tròn để lưu', () => {
  const g = flatGame(150, 100, 700, 0);
  const out = E.fire(g, { angle: 45, power: 45, weapon: 'shell' });
  eq(out.explosions.length, 1);
  ok(E.groundAt(out.state.terrain, out.explosions[0].x) < 150 - 20, 'có hố ở chỗ nổ');
  for (const h of out.state.terrain) eq(Math.round(h * 100) / 100, h, 'làm tròn 0,01');
});

/* ===================== Sát thương, pháo rơi ===================== */

test('sát thương giảm theo khoảng cách, tối đa khi trúng thẳng, 0 ngoài bán kính', () => {
  const W = E.WEAPONS.shell;
  const tank = { x: 400, y: 100 };
  const c = E.tankCenter(tank);
  eq(E.blastDamage(tank, c.x, c.y, W), W.damage, 'trúng thẳng');
  const d1 = E.blastDamage(tank, c.x + E.TANK_R + 10, c.y, W);
  const d2 = E.blastDamage(tank, c.x + E.TANK_R + 20, c.y, W);
  ok(W.damage > d1 && d1 > d2 && d2 > 0, 'giảm dần: ' + d1 + ' ' + d2);
  eq(E.blastDamage(tank, c.x + E.TANK_R + W.radius + 1, c.y, W), 0, 'ngoài bán kính');
});

test('trúng đối thủ: trừ máu đúng sát thương, đổi lượt, đếm phát', () => {
  const g = flatGame(100, 100, 600, 0);
  const plan = E.planShot(g, 0, { wind: 0, weapon: 'shell' });
  const out = E.fire(g, { angle: plan.angle, power: plan.power, weapon: 'shell' });
  ok(out.damage[1] >= E.WEAPONS.shell.damage - 6, 'sát thương ' + out.damage[1]);
  eq(out.damage[0], 0);
  eq(out.state.tanks[1].hp, E.MAX_HP - out.damage[1]);
  eq([out.state.turn, out.state.shots], [1, 1]);
});

test('pháo rơi theo địa hình khi đất dưới chân bị khoét; rơi cao thì mất máu (có trần)', () => {
  const raw = E.toJSON(flatGame(200, 100, 600, 0));
  // Pháo phải đứng trên mỏm hẹp cao 200, xung quanh thấp 60: nổ sát chân làm pháo tụt xuống
  for (let i = 0; i < E.COLS; i++) raw.terrain[i] = Math.abs(i * E.STEP - 600) <= 30 ? 200 : 60;
  const s = E.fromJSON(raw);
  const crater = E.carve(s.terrain, 600, 200, 60);
  const r = E.settle(crater, s.tanks);
  near(r.tanks[1].y, E.restY(crater, 600), 1e-9, 'đứng trên đất mới');
  ok(r.fall[1] > 30 && r.fallDamage[1] > 0 && r.fallDamage[1] <= E.FALL_MAX, 'rơi ' + r.fall[1] + ', mất ' + r.fallDamage[1]);
  eq(r.fallDamage[0], 0);
  // Tụt vài đơn vị không mất máu
  const flat = flatGame(200, 100, 600, 0);
  eq(E.settle(E.carve(flat.terrain, 600, 212, 18), flat.tanks).fallDamage[1], 0);
});

test('một lượt không bao giờ hạ được pháo đầy máu (thắng cần ít nhất hai phát)', () => {
  const W = E.WEAPONS;
  const best = Math.max(W.shell.damage, W.heavy.damage, W.triple.damage * W.triple.count) + E.FALL_MAX;
  ok(best < E.MAX_HP, 'sát thương lớn nhất một lượt ' + best);
});

/* ===================== Lượt, gió, đạn, thắng thua ===================== */

test('gió đổi theo lượt, tất định theo seed', () => {
  const run = () => {
    let g = flatGame(100, 100, 700, 0);
    const winds = [g.wind];
    for (let i = 0; i < 12; i++) {
      g = E.fire(g, PASS[g.turn]).state;
      winds.push(g.wind);
    }
    return winds;
  };
  const a = run();
  ok(new Set(a).size >= 4, 'gió phải đổi: ' + a.join(','));
  eq(run(), a);
});

test('đạn đặc biệt có hạn, hết thì từ chối; đạn chùm bắn 3 viên', () => {
  let g = flatGame(100, 100, 700, 0);
  eq(g.tanks[0].ammo, { heavy: E.WEAPONS.heavy.ammo, triple: E.WEAPONS.triple.ammo });
  const out = E.fire(g, { angle: 45, power: 50, weapon: 'triple' });
  eq(out.shells.length, 3);
  eq(out.explosions.length, 3);
  eq(out.state.tanks[0].ammo.triple, E.WEAPONS.triple.ammo - 1);
  g = out.state;
  g = E.fire(g, PASS[1]).state;
  for (let i = 0; i < E.WEAPONS.heavy.ammo; i++) {
    g = E.fire(g, Object.assign({}, PASS[0], { weapon: 'heavy' })).state;
    g = E.fire(g, PASS[1]).state;
  }
  eq(g.tanks[0].ammo.heavy, 0);
  eq(E.fire(g, { angle: 45, power: 50, weapon: 'heavy' }), null, 'hết đạn nặng');
  ok(E.canUse(g, 'shell') && !E.canUse(g, 'heavy'));
});

test('từ chối phát bắn sai: góc / lực ngoài khoảng, không phải số, loại đạn lạ, ván đã xong', () => {
  const g = flatGame(100, 100, 700, 0);
  for (const s of [{ angle: -1, power: 50, weapon: 'shell' }, { angle: 181, power: 50, weapon: 'shell' }, { angle: 45, power: 101, weapon: 'shell' },
    { angle: NaN, power: 50, weapon: 'shell' }, { angle: '45', power: 50, weapon: 'shell' }, { angle: 45, power: 50, weapon: 'nuke' }, null]) {
    eq(E.fire(g, s), null, JSON.stringify(s));
  }
  const raw = E.toJSON(g);
  raw.tanks[1].hp = 0;
  raw.winner = 0;
  eq(E.fire(E.fromJSON(raw), { angle: 45, power: 50, weapon: 'shell' }), null);
});

test('hạ máu đối thủ về 0 thì thắng; tự bắn chết mình thì thua', () => {
  const raw = E.toJSON(flatGame(100, 100, 600, 0));
  raw.tanks[1].hp = 5;
  const s = E.fromJSON(raw);
  const plan = E.planShot(s, 0, { wind: 0, weapon: 'shell' });
  const win = E.fire(s, { angle: plan.angle, power: plan.power, weapon: 'shell' }).state;
  eq([win.winner, win.tanks[1].hp, E.isOver(win)], [0, 0, true]);
  raw.tanks[1].hp = 100;
  raw.tanks[0].hp = 5;
  eq(E.fire(E.fromJSON(raw), { angle: 90, power: 30, weapon: 'shell' }).state.winner, 1, 'tự nổ chết thì đối thủ thắng');
});

test('hết giới hạn số phát: bên nhiều máu hơn thắng, bằng máu thì hòa', () => {
  const raw = E.toJSON(flatGame(100, 100, 700, 0));
  raw.shots = E.MAX_SHOTS - 1;
  raw.tanks[0].hp = 60;
  raw.tanks[1].hp = 40;
  eq(E.fire(E.fromJSON(raw), PASS[0]).state.winner, 0);
  raw.tanks[1].hp = 60;
  eq(E.fire(E.fromJSON(raw), PASS[0]).state.winner, E.DRAW);
});

test('ghi lại phát trước của mỗi bên (để vẽ dấu điểm rơi)', () => {
  const s = E.fire(flatGame(100, 100, 700, 3), { angle: 45, power: 50, weapon: 'shell' }).state;
  const l = s.last[0];
  eq([l.angle, l.power, l.weapon, l.wind], [45, 50, 'shell', 3]);
  ok(l.x > 300 && l.x < 600, 'điểm rơi ' + l.x);
  eq(s.last[1], null);
});

/* ===================== Máy ===================== */

test('máy mọi mức luôn bắn hợp lệ, tất định theo ván, không tự gây sát thương cho mình', () => {
  for (const level of E.LEVELS) {
    for (let seed = 1; seed <= 25; seed++) {
      let g = E.newGame({ seed });
      for (let k = 0; k < 6 && !E.isOver(g); k++) {
        const a = E.chooseShot(g, level);
        eq(E.chooseShot(E.fromJSON(clone(E.toJSON(g))), level), a, 'tất định');
        const me = g.turn;
        const out = E.fire(g, a);
        ok(out, 'máy bắn sai luật: ' + JSON.stringify(a));
        eq(out.damage[me], 0, 'máy ' + level + ' tự bắn vào mình (seed ' + seed + ')');
        g = out.state;
      }
    }
  }
});

test('Khó học từ phát trượt: lệch hệ thống được bù dần (đối thủ đứng yên)', () => {
  let first = 0;
  let third = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const g0 = E.newGame({ seed: seed * 7919 });
    let g = E.fromJSON(Object.assign(E.toJSON(g0), { turn: 1 }));
    const miss = [];
    for (let k = 0; k < 3; k++) {
      const shot = Object.assign({}, E.chooseShot(g, 'hard'), { weapon: 'shell' });
      const out = E.fire(g, shot);
      const l = out.state.last[1];
      miss.push(l.out ? 400 : Math.abs(l.x - g0.tanks[0].x));
      // Dựng lại thế cũ (địa hình, máu) nhưng giữ trí nhớ của máy; gió mới, lại tới lượt máy
      const back = E.toJSON(out.state);
      back.terrain = E.toJSON(g0).terrain;
      back.tanks = E.toJSON(g0).tanks;
      back.winner = null;
      back.turn = 1;
      back.wind = ((seed * 7 + k * 5) % (2 * E.MAX_WIND + 1)) - E.MAX_WIND;
      g = E.fromJSON(back);
    }
    first += miss[0];
    third += miss[2];
  }
  ok(third < first * 0.6, 'trượt trung bình phát 1: ' + (first / N).toFixed(1) + ', phát 3: ' + (third / N).toFixed(1));
  console.log('       (trượt trung bình phát 1: ' + (first / N).toFixed(1) + ', phát 3: ' + (third / N).toFixed(1) + ')');
});

/** Đấu máy với máy: tỉ lệ thắng của `strong`. Đổi bên và đổi người đi trước luân phiên. */
function duel(strong, weak, games) {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const strongSide = i % 2;
    let g = E.newGame({ seed: 1000 + i * 31, first: Math.floor(i / 2) % 2 });
    while (!E.isOver(g)) g = E.fire(g, E.chooseShot(g, g.turn === strongSide ? strong : weak)).state;
    if (g.winner === strongSide) wins++;
  }
  return wins / games;
}

const RATES = {};
const GAMES = 60;
test('mức mạnh dần: Vừa thắng Dễ phần lớn', () => {
  RATES['Vừa–Dễ'] = duel('medium', 'easy', GAMES);
  ok(RATES['Vừa–Dễ'] >= 0.65, 'Vừa thắng Dễ ' + (RATES['Vừa–Dễ'] * 100).toFixed(0) + '%');
});
test('mức mạnh dần: Khó thắng Dễ gần như mọi ván', () => {
  RATES['Khó–Dễ'] = duel('hard', 'easy', GAMES);
  ok(RATES['Khó–Dễ'] >= 0.85, 'Khó thắng Dễ ' + (RATES['Khó–Dễ'] * 100).toFixed(0) + '%');
});
test('mức mạnh dần: Khó thắng Vừa phần lớn', () => {
  RATES['Khó–Vừa'] = duel('hard', 'medium', GAMES);
  ok(RATES['Khó–Vừa'] >= 0.6, 'Khó thắng Vừa ' + (RATES['Khó–Vừa'] * 100).toFixed(0) + '%');
});

/* ===================== Lưu / khôi phục ===================== */

test('lưu rồi khôi phục giữ nguyên ván (giữa ván, cả trí nhớ của máy)', () => {
  let g = E.newGame({ seed: 42 });
  for (let i = 0; i < 5 && !E.isOver(g); i++) g = E.fire(g, E.chooseShot(g, 'hard')).state;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  if (!E.isOver(g)) eq(E.chooseShot(back, 'hard'), E.chooseShot(g, 'hard'));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame({ seed: 3 }));
  const bad = [null, 1, 'x', {}, []];
  const mut = (fn) => {
    const r = clone(good);
    fn(r);
    bad.push(r);
  };
  mut((r) => { r.v = 99; });
  mut((r) => { r.terrain = r.terrain.slice(1); });
  mut((r) => { r.terrain[5] = 'a'; });
  mut((r) => { r.terrain[5] = -3; });
  mut((r) => { r.terrain[5] = 1e9; });
  mut((r) => { r.tanks = [r.tanks[0]]; });
  mut((r) => { r.tanks[0].x = -5; });
  mut((r) => { r.tanks[1].x = 900; });
  mut((r) => { r.tanks[0].hp = 120; });
  mut((r) => { r.tanks[0].hp = 1.5; });
  mut((r) => { r.tanks[0].angle = 200; });
  mut((r) => { r.tanks[0].power = -1; });
  mut((r) => { r.tanks[0].ammo.heavy = 9; });
  mut((r) => { delete r.tanks[0].ammo; });
  mut((r) => { r.turn = 2; });
  mut((r) => { r.wind = 50; });
  mut((r) => { r.wind = 1.5; });
  mut((r) => { r.shots = -1; });
  mut((r) => { r.winner = 7; });
  mut((r) => { r.winner = 1; }); // còn đủ máu mà đã có người thắng
  mut((r) => { r.rng = 'x'; });
  mut((r) => { r.seed = null; });
  mut((r) => { r.last = [{ angle: 'a' }, null]; });
  mut((r) => { r.mem = [{ corr: 'x' }, null]; });
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i + ' ' + JSON.stringify(raw).slice(0, 60)));
  ok(E.fromJSON(good), 'mẫu tốt vẫn nhận');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (Object.keys(RATES).length) {
  console.log('Tỉ lệ thắng của mức cao (' + GAMES + ' ván mỗi cặp): ' + Object.entries(RATES).map(([k, v]) => k + ' ' + (v * 100).toFixed(0) + '%').join(', '));
}
if (failed) process.exit(1);
