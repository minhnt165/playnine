/* Kiểm tra engine Phòng Không: chạy `node test.js`
 * - Đạn chặn bay thẳng tới điểm ngắm rồi nổ; bán kính quả cầu nở - giữ - co theo thời gian
 * - Va chạm tên lửa / máy bay ném bom với quả cầu, nổ dây chuyền, điểm theo hệ số đợt
 * - Chọn bệ gần nhất còn đạn / bệ chỉ định; bệ, thành phố bị trúng; tên lửa tách đầu (MIRV)
 * - Hết đợt + thưởng đạn còn / thành phố còn, thành phố thưởng mỗi 10.000 điểm, hết ván
 * - Độ khó tăng theo đợt; tất định theo hạt giống + chuỗi input có thời điểm; bot chơi được nhiều đợt
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
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-6);

/** Chạy n tick (input chỉ dùng ở tick đầu), gom mọi sự kiện. */
function run(g, n, input) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...E.step(g, i === 0 ? input : null));
  return all;
}
const shoot = (x, y, base) => ({ shots: [{ x, y, base }] });
const types = (ev) => ev.map((e) => e.type);
/** Ván "đứng yên": không sinh thêm tên lửa / máy bay (nhưng đợt chưa hết vì còn tên lửa chờ phóng). */
function frozen(seed) {
  const g = E.newGame({ seed: seed == null ? 'frozen' : seed });
  g.spawnT = 1e6;
  g.bomberT = 1e6;
  return g;
}
/** Tên lửa đứng yên tại (x, y) (để thử va chạm với quả cầu). */
function still(g, x, y) {
  const m = E.spawnMissile(g, { x, y: 0, t: 0, speed: 1 });
  m.x = x;
  m.y = y;
  m.vx = 0;
  m.vy = 0;
  return m;
}
const mult1 = (g) => E.multiplier(g.wave);

/* ---------------- Ván mới ---------------- */
test('ván mới: đợt 1, 0 điểm, 6 thành phố, 3 bệ mỗi bệ 10 đạn', () => {
  const g = E.newGame({ seed: 1 });
  eq([g.wave, g.score, g.phase, g.cities, g.baseAlive, g.ammo], [1, 0, 'play', [1, 1, 1, 1, 1, 1], [1, 1, 1], [10, 10, 10]]);
  eq([g.toSpawn, g.missiles.length, g.shots.length, g.booms.length], [E.waveCount(1), 0, 0, 0]);
  eq([E.citiesAlive(g), E.ammoLeft(g), E.isOver(g)], [6, 30, false]);
});

/* ---------------- Quả cầu nổ ---------------- */
test('bán kính nổ: nở đều tới R, giữ, co về 0, hết thì 0', () => {
  const R = E.R_MAX;
  ok(near(E.radiusAt(0, R), R / E.GROW), 'tick đầu đã có bán kính');
  for (let a = 1; a < E.GROW; a++) ok(E.radiusAt(a, R) > E.radiusAt(a - 1, R), 'đang nở ' + a);
  eq(E.radiusAt(E.GROW - 1, R), R);
  for (let a = E.GROW; a < E.GROW + E.HOLD; a++) eq(E.radiusAt(a, R), R, 'giữ ' + a);
  for (let a = E.GROW + E.HOLD + 1; a < E.LIFE; a++) ok(E.radiusAt(a, R) < E.radiusAt(a - 1, R), 'đang co ' + a);
  ok(E.radiusAt(E.LIFE - 1, R) > 0);
  eq([E.radiusAt(E.LIFE, R), E.radiusAt(E.LIFE + 5, R), E.radiusAt(-1, R)], [0, 0, 0]);
});

test('quả cầu tự mất sau LIFE tick', () => {
  const g = frozen();
  g.booms.push({ x: 100, y: 100, age: 0, r: E.R_MAX });
  run(g, E.LIFE - 1);
  eq(g.booms.length, 1);
  run(g, 1);
  eq(g.booms.length, 0);
});

/* ---------------- Đạn chặn ---------------- */
test('đạn chặn bay thẳng đúng tốc độ tới điểm ngắm rồi nổ đúng chỗ', () => {
  const g = frozen();
  const ty = E.BASE_Y - 100; // thẳng trên bệ giữa, 100px = 20 tick
  const ev = E.step(g, shoot(120, ty));
  eq(ev.filter((e) => e.type === 'launch').map((e) => [e.base, e.x, e.y]), [[1, 120, ty]]);
  eq([g.ammo, g.fired, g.shots.length], [[10, 9, 10], 1, 1]);
  ok(near(g.shots[0].y, E.BASE_Y - E.SHOT_SPEED), 'đã bay một bước ngay tick phóng');
  const all = run(g, 100 / E.SHOT_SPEED - 2);
  eq([g.shots.length, g.booms.length], [1, 0], 'chưa tới');
  all.push(...run(g, 1));
  eq([g.shots.length, g.booms.length], [0, 1], 'tới nơi ở tick thứ 20');
  eq([g.booms[0].x, g.booms[0].y, g.booms[0].r], [120, ty, E.R_MAX]);
  ok(types(all).indexOf('boom') >= 0, 'có sự kiện boom');
});

test('đạn chặn bay xiên vẫn nằm trên đường thẳng bệ → điểm ngắm', () => {
  const g = frozen();
  E.step(g, shoot(60, 80));
  const s = g.shots[0];
  eq(s.base, 0);
  const sx = E.BASE_X[0];
  const sy = E.BASE_Y;
  for (let i = 0; i < 10 && g.shots.length; i++) {
    const cross = (s.x - sx) * (80 - sy) - (s.y - sy) * (60 - sx);
    ok(Math.abs(cross) < 1e-6, 'lệch khỏi đường thẳng');
    E.step(g, null);
  }
  const d = Math.hypot(60 - sx, 80 - sy);
  const g2 = frozen();
  const ev = run(g2, Math.ceil(d / E.SHOT_SPEED), shoot(60, 80));
  eq(ev.filter((e) => e.type === 'boom').length, 1, 'nổ đúng tick ceil(d / v)');
  eq([g2.booms[0].x, g2.booms[0].y], [60, 80]);
});

test('điểm ngắm bị kẹp trong vùng trời (không bắn xuống đất / ra ngoài sân)', () => {
  const g = frozen();
  E.step(g, shoot(-30, 500));
  eq([g.shots[0].tx, g.shots[0].ty], [E.AIM_X_MIN, E.AIM_Y_MAX]);
  E.step(g, shoot(999, -40));
  eq([g.shots[1].tx, g.shots[1].ty], [E.AIM_X_MAX, E.AIM_Y_MIN]);
});

/* ---------------- Chọn bệ ---------------- */
test('chọn bệ gần nhất còn đạn; bệ hết đạn / bị phá thì sang bệ gần kế', () => {
  const g = frozen();
  eq([E.pickBase(g, 10, 100), E.pickBase(g, 120, 100), E.pickBase(g, 230, 100), E.pickBase(g, 75, 100)], [0, 1, 2, 1]);
  g.ammo[0] = 0;
  eq(E.pickBase(g, 10, 100), 1, 'bệ trái hết đạn');
  g.baseAlive[1] = 0;
  g.ammo[1] = 0;
  eq(E.pickBase(g, 10, 100), 2, 'chỉ còn bệ phải');
  g.ammo[2] = 0;
  eq(E.pickBase(g, 10, 100), -1);
  const ev = E.step(g, shoot(50, 50));
  eq([types(ev).indexOf('empty') >= 0, g.shots.length], [true, 0], 'hết đạn: không bắn, báo empty');
});

test('bắn bằng bệ chỉ định (phím 1/2/3); bệ đó hết đạn thì không bắn', () => {
  const g = frozen();
  E.step(g, shoot(10, 100, 2));
  eq([g.shots[0].base, g.ammo], [2, [10, 10, 9]]);
  g.ammo[0] = 0;
  const ev = E.step(g, shoot(10, 100, 0));
  eq([g.shots.length, ev.filter((e) => e.type === 'empty').map((e) => e.base)], [1, [0]]);
});

test('nhiều phát trong một tick: mỗi phát trừ một viên', () => {
  const g = frozen();
  E.step(g, { shots: [{ x: 20, y: 50 }, { x: 30, y: 60 }, { x: 200, y: 70 }] });
  eq([g.shots.length, g.ammo], [3, [8, 10, 9]]);
});

/* ---------------- Va chạm ---------------- */
test('tên lửa trong quả cầu thì nổ, cộng 25 × hệ số; ngoài quả cầu thì không sao', () => {
  const g = frozen();
  g.booms.push({ x: 100, y: 100, age: E.GROW, r: E.R_MAX });
  still(g, 100 + E.R_MAX - 1, 100);
  still(g, 100, 100 + E.R_MAX + 2);
  const ev = E.step(g, null);
  const kills = ev.filter((e) => e.type === 'kill');
  eq([kills.length, g.missiles.length, g.score, g.kills], [1, 1, E.MISSILE_PTS * mult1(g), 1]);
  eq(kills[0].pts, E.MISSILE_PTS);
});

test('va chạm theo bán kính lúc đó: quả cầu nở tới tên lửa mới nổ', () => {
  const g = frozen();
  g.booms.push({ x: 100, y: 100, age: 0, r: E.R_MAX });
  const d = 15;
  still(g, 100 + d, 100);
  let hitAt = -1;
  for (let i = 0; i < E.LIFE && hitAt < 0; i++) {
    const age = g.booms[0].age;
    const ev = E.step(g, null);
    if (ev.some((e) => e.type === 'kill')) hitAt = age;
  }
  let expect = 0;
  while (E.radiusAt(expect, E.R_MAX) < d) expect++;
  eq(hitAt, expect);
});

test('nổ dây chuyền: tên lửa bị hạ tạo quả cầu nhỏ, hạ tiếp tên lửa bên cạnh', () => {
  const g = frozen();
  g.booms.push({ x: 100, y: 100, age: E.GROW, r: E.R_MAX });
  still(g, 100 + E.R_MAX - 2, 100); // A: trong quả cầu đầu
  still(g, 100 + E.R_MAX - 2 + E.CHAIN_R - 2, 100); // B: ngoài quả cầu đầu, trong quả cầu của A
  let ev = E.step(g, null);
  eq([ev.filter((e) => e.type === 'kill').length, g.missiles.length], [1, 1], 'tick đầu chỉ hạ A');
  eq(g.booms.filter((b) => b.r === E.CHAIN_R).length, 1, 'A để lại quả cầu dây chuyền');
  ev = run(g, E.GROW);
  const k = ev.filter((e) => e.type === 'kill');
  eq([k.length, k[0].chain, g.missiles.length], [1, true, 0]);
});

test('máy bay ném bom chạm quả cầu thì nổ, cộng 100 × hệ số', () => {
  const g = frozen();
  const b = E.spawnBomber(g, { y: 80, dir: 1 });
  b.x = 60;
  g.booms.push({ x: 60 + E.R_MAX + E.BOMBER_R - 1, y: 80, age: E.GROW, r: E.R_MAX });
  const before = g.score;
  const ev = E.step(g, null);
  eq([ev.filter((e) => e.type === 'bomberKill').length, g.bombers.length, g.score - before], [1, 0, E.BOMBER_PTS * mult1(g)]);
});

/* ---------------- Bị trúng ---------------- */
test('tên lửa rơi trúng thành phố: thành phố mất', () => {
  const g = frozen();
  E.spawnMissile(g, { x: E.CITY_X[2], y: E.CITY_Y - 30, t: 2, speed: 2 });
  const ev = run(g, 20);
  eq([g.cities[2], g.missiles.length, g.lost], [0, 0, 1]);
  const hit = ev.find((e) => e.type === 'cityHit');
  eq([hit.t, hit.x, hit.y], [2, E.CITY_X[2], E.CITY_Y]);
});

test('tên lửa trúng bệ: bệ mất hết đạn đợt đó, bắn tự động bỏ qua bệ đó', () => {
  const g = frozen();
  E.spawnMissile(g, { x: E.BASE_X[0], y: E.BASE_Y - 10, t: 6, speed: 2 });
  const ev = run(g, 10);
  ok(types(ev).indexOf('baseHit') >= 0, 'có baseHit');
  eq([g.baseAlive, g.ammo], [[0, 1, 1], [0, 10, 10]]);
  eq(E.pickBase(g, 5, 100), 1);
  const ev2 = E.step(g, shoot(5, 100, 0));
  eq([g.shots.length, types(ev2).indexOf('empty') >= 0], [0, true]);
});

test('rơi xuống mục tiêu đã mất: chỉ nổ trên đất, không mất thêm', () => {
  const g = frozen();
  g.cities[4] = 0;
  E.spawnMissile(g, { x: E.CITY_X[4], y: E.CITY_Y - 4, t: 4, speed: 2 });
  const ev = run(g, 4);
  eq([types(ev).indexOf('impact') >= 0, types(ev).indexOf('cityHit'), g.lost], [true, -1, 0]);
});

test('tên lửa chọn mục tiêu còn sống (thành phố hoặc bệ)', () => {
  const g = frozen(5);
  g.cities = [0, 0, 1, 0, 1, 0];
  g.baseAlive = [0, 1, 0];
  for (let i = 0; i < 200; i++) ok([2, 4, 7].indexOf(E.pickTarget(g)) >= 0, 'mục tiêu đã mất');
});

/* ---------------- Tên lửa tách đầu ---------------- */
test('MIRV: tới độ cao tách thì sinh thêm 1–2 đầu đạn từ đúng chỗ đó', () => {
  const g = frozen(9);
  const m = E.spawnMissile(g, { x: 100, y: 0, t: 1, speed: 2, split: 60 });
  let ev = [];
  let n = 0;
  while (!ev.some((e) => e.type === 'split') && n++ < 200) ev = E.step(g, null);
  const sp = ev.find((e) => e.type === 'split');
  ok(sp, 'có split');
  ok(m.y >= 60 && m.y < 62, 'tách khi vừa qua độ cao 60');
  ok(g.missiles.length >= 2 && g.missiles.length <= 3, 'thêm 1–2 đầu đạn: ' + g.missiles.length);
  eq(m.split, 0, 'đầu gốc không tách lần nữa');
  g.missiles.slice(1).forEach((w) => {
    eq([w.kind, w.split], [2, 0]);
    ok(near(w.sx, sp.x) && near(w.sy, sp.y), 'bắt đầu từ chỗ tách');
    ok(w.vy > 0, 'đầu đạn rơi xuống');
  });
  eq(sp.n, g.missiles.length - 1);
});

test('đầu đạn tách ra cũng bị quả cầu hạ được', () => {
  const g = frozen(9);
  E.spawnMissile(g, { x: 100, y: 59, t: 1, speed: 2, split: 60 });
  E.step(g, null);
  const n = g.missiles.length;
  ok(n >= 2);
  g.booms.push({ x: g.missiles[0].x, y: g.missiles[0].y, age: E.GROW, r: E.R_MAX });
  const ev = E.step(g, null);
  eq([ev.filter((e) => e.type === 'kill').length, g.missiles.length], [n, 0]);
});

/* ---------------- Hết đợt, thưởng ---------------- */
test('hết đợt: thưởng 5 / viên đạn còn + 100 / thành phố còn; bệ bị phá không tính đạn', () => {
  const g = E.newGame({ seed: 3 });
  g.toSpawn = 0;
  g.bombersLeft = 0;
  g.ammo = [10, 5, 0];
  g.baseAlive = [1, 1, 0];
  g.cities[0] = 0;
  g.score = 300;
  const ev = E.step(g, null);
  const c = ev.find((e) => e.type === 'waveClear');
  ok(c, 'có waveClear');
  eq([c.wave, c.ammo, c.cities, c.ammoPts, c.cityPts, c.mult, c.bonus], [1, 15, 5, 75, 500, 1, 575]);
  eq([g.score, g.phase], [875, 'bonus']);
  eq(types(E.step(g, shoot(100, 100))).indexOf('launch'), -1, 'đang đếm thưởng thì không bắn');
  const ev2 = run(g, E.BONUS_TICKS);
  ok(ev2.some((e) => e.type === 'wave' && e.wave === 2), 'sang đợt 2');
  eq([g.wave, g.phase, g.ammo, g.baseAlive, g.cities], [2, 'play', [10, 10, 10], [1, 1, 1], [0, 1, 1, 1, 1, 1]]);
  eq(g.toSpawn, E.waveCount(2));
});

test('chưa hết đợt khi còn tên lửa / máy bay / đạn đang bay / quả cầu', () => {
  const mk = () => {
    const g = E.newGame({ seed: 3 });
    g.toSpawn = 0;
    g.bombersLeft = 0;
    return g;
  };
  let g = mk();
  E.spawnMissile(g, { x: 50, y: 0, t: 0, speed: 0.5 });
  ok(!E.step(g, null).some((e) => e.type === 'waveClear'), 'còn tên lửa');
  g = mk();
  E.spawnBomber(g, { y: 60, dir: 1 });
  ok(!E.step(g, null).some((e) => e.type === 'waveClear'), 'còn máy bay');
  g = mk();
  g.booms.push({ x: 50, y: 50, age: 0, r: E.R_MAX });
  ok(!E.step(g, null).some((e) => e.type === 'waveClear'), 'còn quả cầu');
  g = mk();
  ok(!E.step(g, shoot(120, 40)).some((e) => e.type === 'waveClear'), 'còn đạn bay');
  g = mk();
  g.bombersLeft = 1;
  ok(!E.step(g, null).some((e) => e.type === 'waveClear'), 'còn máy bay chờ xuất hiện');
});

test('hệ số điểm: ×1 đợt 1–2, ×2 đợt 3–4 … tối đa ×6', () => {
  eq([1, 2, 3, 4, 5, 10, 11, 12, 30].map(E.multiplier), [1, 1, 2, 2, 3, 5, 6, 6, 6]);
  const g = frozen();
  g.wave = 5;
  g.booms.push({ x: 100, y: 100, age: E.GROW, r: E.R_MAX });
  still(g, 100, 100);
  E.step(g, null);
  eq(g.score, E.MISSILE_PTS * 3);
});

test('thành phố thưởng mỗi 10.000 điểm: dựng lại thành phố đã mất khi sang đợt', () => {
  const g = E.newGame({ seed: 4 });
  g.score = E.BONUS_CITY_EVERY - 10;
  g.cities[1] = 0;
  g.cities[3] = 0;
  g.booms.push({ x: 100, y: 100, age: E.GROW, r: E.R_MAX });
  still(g, 100, 100);
  g.toSpawn = 0;
  g.bombersLeft = 0;
  const ev = run(g, E.LIFE + 2);
  eq([ev.filter((e) => e.type === 'bonusCity').length, g.bank, g.nextBonus], [1, 1, 2 * E.BONUS_CITY_EVERY]);
  ok(types(ev).indexOf('waveClear') >= 0);
  const ev2 = run(g, E.BONUS_TICKS);
  const rb = ev2.filter((e) => e.type === 'rebuild');
  eq(rb.length, 1);
  ok(rb[0].t === 1 || rb[0].t === 3, 'dựng lại một thành phố đã mất');
  eq([E.citiesAlive(g), g.bank], [5, 0]);
});

test('thành phố thưởng để dành khi đủ 6 thành phố; thưởng cuối đợt cũng có thể vượt mốc', () => {
  const g = E.newGame({ seed: 4 });
  g.score = E.BONUS_CITY_EVERY - 100;
  g.toSpawn = 0;
  g.bombersLeft = 0;
  const ev = E.step(g, null); // thưởng 30 × 5 + 6 × 100 = 750
  ok(types(ev).indexOf('bonusCity') >= 0);
  run(g, E.BONUS_TICKS);
  eq([g.wave, g.bank, E.citiesAlive(g)], [2, 1, 6]);
});

/* ---------------- Hết ván ---------------- */
test('mất thành phố cuối (không còn thành phố thưởng): hết ván; sau đó step không đổi gì', () => {
  const g = frozen();
  g.cities = [0, 0, 0, 0, 0, 1];
  E.spawnMissile(g, { x: E.CITY_X[5], y: E.CITY_Y - 4, t: 5, speed: 2 });
  const ev = run(g, 4);
  ok(types(ev).indexOf('over') >= 0, 'có over');
  eq([g.phase, E.isOver(g)], ['over', true]);
  const snap = JSON.stringify(E.toJSON(g));
  eq(E.step(g, shoot(100, 100)), []);
  eq(JSON.stringify(E.toJSON(g)), snap);
});

test('mất thành phố cuối nhưng còn thành phố thưởng: chơi tiếp, dựng lại khi sang đợt', () => {
  const g = E.newGame({ seed: 8 });
  g.cities = [0, 0, 0, 0, 0, 1];
  g.bank = 1;
  g.toSpawn = 0;
  g.bombersLeft = 0;
  E.spawnMissile(g, { x: E.CITY_X[5], y: E.CITY_Y - 4, t: 5, speed: 2 });
  const ev = run(g, 4 + E.BONUS_TICKS);
  eq(types(ev).indexOf('over'), -1);
  ok(types(ev).indexOf('rebuild') >= 0);
  eq([g.wave, g.phase, E.citiesAlive(g), g.bank], [2, 'play', 1, 0]);
});

/* ---------------- Đợt và độ khó ---------------- */
test('đợt sau nhanh hơn, nhiều hơn; MIRV từ đợt 3, máy bay ném bom từ đợt 4', () => {
  for (let w = 2; w <= 20; w++) {
    ok(E.waveSpeed(w) >= E.waveSpeed(w - 1), 'tốc độ ' + w);
    ok(E.waveCount(w) >= E.waveCount(w - 1), 'số lượng ' + w);
  }
  ok(E.waveSpeed(6) > E.waveSpeed(1) && E.waveCount(6) > E.waveCount(1));
  eq([E.mirvChance(1), E.mirvChance(2), E.mirvChance(3) > 0], [0, 0, true]);
  eq([E.bomberCount(1), E.bomberCount(3), E.bomberCount(4) > 0], [0, 0, true]);
});

/** Chạy hết một đợt với thành phố "bất tử" (dựng lại sau mỗi tick), gom sự kiện. */
function fullWave(seed, wave) {
  const g = E.newGame({ seed });
  if (wave > 1) E.startWave(g, wave, []);
  const ev = [];
  for (let i = 0; i < 60 * 300 && !ev.some((e) => e.type === 'waveClear'); i++) {
    ev.push(...E.step(g, null));
    g.cities = [1, 1, 1, 1, 1, 1];
  }
  return { g, ev };
}

test('đợt 1: phóng đúng số tên lửa của đợt, từ mép trên, không MIRV, không máy bay', () => {
  const { ev } = fullWave(11, 1);
  const sp = ev.filter((e) => e.type === 'spawn');
  eq(sp.length, E.waveCount(1));
  ok(sp.every((e) => e.y === 0 && e.x >= 0 && e.x <= E.W), 'từ mép trên');
  eq([types(ev).indexOf('split'), types(ev).indexOf('bomber')], [-1, -1]);
  ok(types(ev).indexOf('waveClear') >= 0, 'đợt kết thúc');
});

test('đợt giữa: có tên lửa tách đầu và máy bay thả bom', () => {
  let splits = 0;
  let bombers = 0;
  let drops = 0;
  for (let s = 1; s <= 6; s++) {
    const { ev } = fullWave(s, 7);
    splits += ev.filter((e) => e.type === 'split').length;
    bombers += ev.filter((e) => e.type === 'bomber').length;
    drops += ev.filter((e) => e.type === 'drop').length;
  }
  ok(splits > 0 && bombers > 0 && drops > 0, 'split ' + splits + ' bomber ' + bombers + ' drop ' + drops);
});

/* ---------------- Tất định, bot ---------------- */
/** Bot ngắm đón đầu có độ trễ phản ứng: chỉ "thấy" tên lửa đã bay ≥ react tick, mỗi gap tick một phát. */
function botInput(g, mem, react, gap) {
  if (g.phase !== 'play' || g.tick - mem.last < gap) return null;
  let best = null;
  g.missiles.forEach((m) => {
    if (g.tick - m.born < react || mem.marked.has(m.id)) return;
    if (!best || m.y > best.y) best = m;
  });
  if (!best) return null;
  const b = E.pickBase(g, best.x, best.y);
  if (b < 0) return null;
  // Đón đầu: thời gian bay của đạn + nửa thời gian nở
  let px = best.x;
  let py = best.y;
  for (let k = 0; k < 4; k++) {
    const t = Math.hypot(px - E.BASE_X[b], py - E.BASE_Y) / E.SHOT_SPEED + E.GROW / 2;
    px = best.x + best.vx * t;
    py = best.y + best.vy * t;
  }
  if (py > E.AIM_Y_MAX) return null;
  mem.marked.add(best.id);
  mem.last = g.tick;
  return shoot(px, py);
}

test('tất định: cùng hạt giống + cùng chuỗi input có thời điểm thì ra cùng ván', () => {
  const play = (seed) => {
    const g = E.newGame({ seed });
    const inputs = [];
    for (let i = 0; i < 60 * 40; i++) {
      if (i % 50 === 7) inputs.push({ tick: i, x: (i * 37) % E.W, y: 60 + ((i * 13) % 200) });
    }
    let k = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const inp = k < inputs.length && inputs[k].tick === i ? shoot(inputs[k].x, inputs[k++].y) : null;
      E.step(g, inp);
    }
    return JSON.stringify(E.toJSON(g));
  };
  eq(play('abc'), play('abc'));
  ok(play('abc') !== play('xyz'), 'hạt giống khác thì ván khác');
});

test('ván chơi được: bot có độ trễ phản ứng qua được 3 đợt đầu trên nhiều hạt giống', () => {
  for (let s = 1; s <= 8; s++) {
    const g = E.newGame({ seed: 'bot' + s });
    const mem = { last: -99, marked: new Set() };
    for (let i = 0; i < 60 * 400 && g.wave < 4 && !E.isOver(g); i++) E.step(g, botInput(g, mem, 15, 12));
    ok(g.wave >= 4 && !E.isOver(g), 'hạt giống ' + s + ' dừng ở đợt ' + g.wave);
    ok(g.score > 0);
  }
});

/* ---------------- Lưu / khôi phục ---------------- */
function midGame() {
  const g = E.newGame({ seed: 'save' });
  E.startWave(g, 7, []);
  const mem = { last: -99, marked: new Set() };
  for (let i = 0; i < 60 * 25; i++) E.step(g, botInput(g, mem, 15, 12));
  return g;
}

test('lưu rồi khôi phục giữ nguyên ván và chơi tiếp y hệt', () => {
  const g = midGame();
  ok(g.missiles.length + g.booms.length + g.shots.length > 0, 'ván đang có vật bay');
  const r = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(r, 'khôi phục được');
  eq(E.toJSON(r), E.toJSON(g));
  for (let i = 0; i < 600; i++) {
    const inp = i % 40 === 3 ? shoot(40 + (i % 160), 90) : null;
    E.step(g, inp);
    E.step(r, inp);
  }
  eq(E.toJSON(r), E.toJSON(g));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(midGame());
  ok(E.fromJSON(good), 'mẫu tốt phải nhận');
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { wave: 0 }),
    Object.assign({}, good, { score: -5 }),
    Object.assign({}, good, { score: 1.5 }),
    Object.assign({}, good, { phase: 'win' }),
    Object.assign({}, good, { cities: '11111' }),
    Object.assign({}, good, { cities: '000000', bank: 0, phase: 'play' }),
    Object.assign({}, good, { ammo: [10, 10] }),
    Object.assign({}, good, { ammo: [11, 0, 0] }),
    Object.assign({}, good, { baseAlive: '1x1' }),
    Object.assign({}, good, { missiles: [{ x: 'a' }] }),
    Object.assign({}, good, { missiles: null }),
    Object.assign({}, good, { booms: [{ x: 1, y: 1, age: 0, r: 999 }] }),
    Object.assign({}, good, { shots: [{ sx: 0, sy: 0, x: 0, y: 0, tx: 0, ty: 0, base: 5 }] }),
    Object.assign({}, good, { bombers: [{ x: 0 }] }),
    Object.assign({}, good, { rng: -1 }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng ' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
