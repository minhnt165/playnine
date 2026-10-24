/* Kiểm tra engine Chim Bay: chạy `node test.js`
 * - Ván mới chờ cú vỗ đầu tiên; vỗ cánh, trọng lực, vận tốc rơi tối đa, trần chặn lại không chết
 * - Va chạm: thân tre trên / dưới, góc cột (hình tròn với hình chữ nhật), mặt đất; sau khi va chim rơi xuống đất
 * - Điểm +1 khi qua tâm cột, mỗi cột một lần, không tính ở bước va chạm
 * - Độ khó: khe và khoảng cách cột hẹp dần rồi dừng ở trần; cột sinh ra luôn trong giới hạn
 * - Tất định: cùng seed + cùng tick vỗ cánh → cùng kết quả, chia khung hình kiểu nào cũng vậy
 * - Bot lái giỏi sống 5 phút trên nhiều seed (màn luôn qua được); số cột / giây khớp tốc độ cuộn,
 *   điểm / giây không vượt MAX_SCORE_RATE
 * - Lưu / khôi phục ván (chạy tiếp ra đúng kết quả) và từ chối dữ liệu hỏng
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
function near(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error((msg ? msg + ': ' : '') + a + ' !≈ ' + b);
}

const R = E.BIRD_R;

/** Ván đang bay dựng tay: chỉ có các cột cho trước (nextX rất xa để không sinh thêm). */
function make(extra, pipes) {
  const g = E.flap(E.newGame(1));
  return Object.assign({}, g, { tick: 600, vy: 0, nextX: 1e9 }, extra || {}, { pipes: (pipes || []).map((p) => Object.assign({ passed: false }, p)) });
}

/** Chạy bot `autopilot` tối đa `ticks` bước; gọi onTick(g) sau mỗi bước. */
function botRun(seed, ticks, onTick, margin) {
  let g = E.flap(E.newGame(seed));
  for (let i = 0; i < ticks && g.phase === 'play'; i++) {
    if (E.autopilot(g, margin)) g = E.flap(g);
    g = E.step(g);
    if (onTick) onTick(g);
  }
  return g;
}

/* ---------------- Ván mới, vỗ cánh, trọng lực ---------------- */

test('ván mới: đang chờ, chim ở vị trí xuất phát, chưa điểm, đã có cột phía trước', () => {
  const g = E.newGame(7);
  eq([g.phase, g.y, g.vy, g.score, g.tick, g.cause], ['ready', E.START_Y, 0, 0, 0, null]);
  ok(g.pipes.length > 0, 'có cột');
  eq(g.pipes[0].x, E.FIRST_PIPE_X);
  ok(g.nextX >= E.LOOKAHEAD, 'sinh sẵn tới LOOKAHEAD');
});

test('đang chờ thì step không đổi gì; vỗ cánh thì bắt đầu bay với vận tốc FLAP_V', () => {
  const g = E.newGame(7);
  eq(E.step(g), g);
  const f = E.flap(g);
  eq([f.phase, f.vy, f.flaps], ['play', E.FLAP_V, 1]);
});

test('trọng lực kéo xuống, vận tốc rơi không quá MAX_FALL, quãng bay = tick × SPEED × DT', () => {
  let g = make({ y: 200, vy: 0, tick: 0 });
  g = E.step(g);
  near(g.vy, E.GRAVITY * E.DT, 1e-9);
  near(g.y, 200 + E.GRAVITY * E.DT * E.DT, 1e-9);
  for (let i = 0; i < 200; i++) g = Object.assign(E.step(g), { y: 200 }); // giữ chim giữa trời để rơi mãi
  eq(g.vy, E.MAX_FALL);
  near(E.distOf(g), 201 * E.SPEED * E.DT, 1e-9);
});

test('vỗ cánh đặt lại vận tốc (kể cả khi đang rơi nhanh)', () => {
  const g = E.flap(make({ vy: E.MAX_FALL }));
  eq(g.vy, E.FLAP_V);
});

test('trần: vỗ liên tục thì chim bị chặn ở y = R, vận tốc 0, vẫn sống', () => {
  let g = E.newGame(3);
  for (let i = 0; i < 240; i++) g = E.step(E.flap(g)); // 2 s, chưa tới cột đầu
  eq([g.phase, g.y, g.vy], ['play', R, 0]);
});

test('bay sát trần không lọt qua được: đâm vào thân tre phía trên', () => {
  let g = E.flap(E.newGame(3));
  for (let i = 0; i < 1200 && g.phase === 'play'; i++) g = E.step(E.flap(g));
  eq([g.phase, g.cause, g.score], ['over', 'pipe', 0]);
  ok(E.distOf(g) + R > E.FIRST_PIPE_X, 'va đúng lúc tới cột đầu');
});

/* ---------------- Va chạm ---------------- */

test('mặt đất: không vỗ thì rơi xuống đất, hết ván, chim nằm trên mặt đất', () => {
  const g = E.simulate(5, [0], 5000);
  eq([g.phase, g.cause, g.y, g.score], ['over', 'ground', E.GROUND_Y - R, 0]);
});

test('thân tre trên / dưới: chạm là hết ván, giữa khe thì không', () => {
  const d = 600 * E.SPEED * E.DT;
  const pipe = { k: 0, x: d - 10, y: 300, gap: 150 }; // khe 225..375
  eq(E.step(make({ y: 215 }, [pipe])).cause, 'pipe', 'chạm thân trên');
  eq(E.step(make({ y: 385 }, [pipe])).cause, 'pipe', 'chạm thân dưới');
  const mid = E.step(make({ y: 300 }, [pipe]));
  eq([mid.phase, mid.cause], ['play', null], 'giữa khe');
  // Sát mép khe nhưng chưa chạm
  eq(E.step(make({ y: 225 + R + 0.5 }, [pipe])).phase, 'play', 'sát mép trên');
  eq(E.step(make({ y: 375 - R - 1 }, [pipe])).phase, 'play', 'sát mép dưới');
});

test('va chạm hình tròn: gần góc cột nhưng ngoài bán kính thì không chạm', () => {
  const p = { k: 0, x: 100, y: 300, gap: 150 }; // góc dưới-trái của thân trên: (100, 225)
  ok(!E.hitsPipe(p, 100 - 10, 225 + 10), 'cách góc 14,14 > R');
  ok(E.hitsPipe(p, 100 - 9, 225 + 9), 'cách góc 12,7 < R');
  ok(!E.hitsPipe(p, 100 - R, 100), 'vừa chạm mép trái thì chưa tính');
  ok(E.hitsPipe(p, 100 - R + 0.5, 100), 'lấn vào mép trái');
  ok(!E.hitsPipe(p, 100 + E.PIPE_W + R, 100), 'đã qua hẳn cột');
  ok(E.hitsPipe(p, 130, -500), 'thân trên kéo dài lên vô cực');
});

test('sau khi va cột chim rơi xuống đất, không cuộn, không thêm điểm, vỗ cánh vô tác dụng', () => {
  const d = 600 * E.SPEED * E.DT;
  let g = E.step(make({ y: 215, score: 3 }, [{ k: 0, x: d - 10, y: 300, gap: 150 }]));
  eq([g.phase, g.cause], ['over', 'pipe']);
  const tick = g.tick;
  eq(E.flap(g), g);
  for (let i = 0; i < 600; i++) g = E.step(g);
  eq([g.y, g.tick, g.score], [E.GROUND_Y - R, tick, 3]);
});

/* ---------------- Điểm ---------------- */

test('điểm +1 đúng bước chim qua tâm cột, mỗi cột một lần', () => {
  const d = 600 * E.SPEED * E.DT;
  const step1 = E.SPEED * E.DT;
  // Tâm cột nằm giữa vị trí bước 601 và 602
  const x = d + step1 * 1.5 - E.PIPE_W / 2;
  let g = make({ y: 300 }, [{ k: 0, x, y: 300, gap: 190 }]);
  g = E.step(g);
  eq(g.score, 0, 'chưa tới tâm');
  g = E.step(g);
  eq([g.score, g.pipes[0].passed], [1, true], 'qua tâm');
  for (let i = 0; i < 60; i++) g = Object.assign(E.step(g), { vy: 0, y: 300 });
  eq(g.score, 1, 'không cộng lại');
});

test('bước va chạm không được tính điểm dù chim vừa qua tâm', () => {
  const d = 600 * E.SPEED * E.DT;
  const x = d + E.SPEED * E.DT * 0.5 - E.PIPE_W / 2;
  const g = E.step(make({ y: 385 }, [{ k: 0, x, y: 300, gap: 150 }]));
  eq([g.phase, g.score], ['over', 0]);
});

/* ---------------- Độ khó và sinh cột ---------------- */

test('đường cong độ khó: khe và khoảng cách giảm dần, chạm trần ở cột 40 rồi giữ nguyên', () => {
  eq([E.gapFor(0), E.spacingFor(0)], [E.GAP_START, E.SPACE_START]);
  for (let k = 1; k < 500; k++) {
    ok(E.gapFor(k) <= E.gapFor(k - 1) && E.gapFor(k) >= E.GAP_MIN, 'khe k=' + k);
    ok(E.spacingFor(k) <= E.spacingFor(k - 1) && E.spacingFor(k) >= E.SPACE_MIN, 'khoảng cách k=' + k);
  }
  eq([E.gapFor(39) > E.GAP_MIN, E.gapFor(40), E.gapFor(10000)], [true, E.GAP_MIN, E.GAP_MIN]);
  eq([E.spacingFor(39) > E.SPACE_MIN, E.spacingFor(40), E.spacingFor(10000)], [true, E.SPACE_MIN, E.SPACE_MIN]);
});

test('cột sinh ra: đúng khe / khoảng cách theo độ khó, khe trong giới hạn, tâm hai cột lệch ≤ MAX_SHIFT', () => {
  [1, 2, 42, 999, 123456].forEach((seed) => {
    const pipes = E.generate(seed, 600);
    pipes.forEach((p, i) => {
      eq([p.k, p.gap], [i, E.gapFor(i)], 'cột ' + i);
      const [lo, hi] = E.gapRange(p.gap);
      ok(p.y >= lo && p.y <= hi, 'tâm khe trong giới hạn: ' + p.y);
      ok(p.y - p.gap / 2 >= E.EDGE && p.y + p.gap / 2 <= E.GROUND_Y - E.EDGE, 'khe cách trần / đất');
      if (i > 0) {
        near(p.x - pipes[i - 1].x, E.spacingFor(i - 1), 1e-9, 'khoảng cách cột ' + i);
        ok(Math.abs(p.y - pipes[i - 1].y) <= E.MAX_SHIFT + 0.01, 'lệch tâm cột ' + i);
      }
    });
  });
});

test('seed khác nhau cho dãy cột khác nhau, cùng seed thì giống hệt', () => {
  eq(E.generate(11, 50), E.generate(11, 50));
  ok(JSON.stringify(E.generate(11, 50)) !== JSON.stringify(E.generate(12, 50)), 'khác seed');
  eq(E.newGame(11).pipes.map((p) => p.y), E.generate(11, E.newGame(11).pipes.length).map((p) => p.y));
});

/* ---------------- Tất định, bước cố định ---------------- */

test('tất định: cùng seed + cùng tick vỗ cánh thì cùng kết quả', () => {
  const flaps = [0, 30, 70, 95, 140, 170, 230, 260, 300];
  const a = E.simulate(77, flaps, 3000);
  const b = E.simulate(77, flaps, 3000);
  eq(E.toJSON(a), E.toJSON(b));
  ok(a.tick > 0, 'đã bay');
  // Lệch một tick vỗ cánh là đường bay khác
  ok(E.simulate(77, flaps.map((t, i) => (i === 3 ? t + 1 : t)), 3000).y !== a.y || E.simulate(77, flaps.map((t, i) => (i === 3 ? t + 1 : t)), 3000).tick !== a.tick, 'nhạy với input');
});

test('bước cố định: chia khung hình kiểu nào (30 / 60 / 144 Hz, giật) cũng ra cùng số bước và cùng trạng thái', () => {
  function play(frames) {
    let acc = 0;
    let tick = 0;
    let g = E.flap(E.newGame(31));
    for (const ms of frames) {
      const r = E.ticksFor(acc, ms);
      acc = r.acc;
      for (let i = 0; i < r.ticks; i++, tick++) {
        if (g.phase === 'play' && E.autopilot(g)) g = E.flap(g);
        g = E.step(g);
      }
    }
    return { tick, g: E.toJSON(g) };
  }
  const total = 20000;
  const at = (ms) => Array.from({ length: Math.round(total / ms) }, () => ms);
  const jerky = [];
  for (let s = 0, i = 0; s < total; i++) {
    const ms = Math.min([4, 9, 33, 17, 60][i % 5], total - s);
    jerky.push(ms);
    s += ms;
  }
  const base = play(at(1000 / 60));
  eq(base.tick, 20000 / E.TICK_MS);
  eq(play(at(1000 / 30)), base, '30 Hz');
  eq(play(at(1000 / 144).concat([total - Math.round(total / (1000 / 144)) * (1000 / 144)])), base, '144 Hz');
  eq(play(jerky), base, 'khung giật');
});

test('khung hình quá dài (tab vừa quay lại) chỉ tính MAX_FRAME_MS', () => {
  eq(E.ticksFor(0, 5000).ticks, Math.floor(E.MAX_FRAME_MS / E.TICK_MS));
  eq(E.ticksFor(0, -50).ticks, 0);
});

/* ---------------- Bot, độ qua được, tốc độ điểm ---------------- */

test('bot lái giỏi sống 5 phút trên 30 seed (màn sinh ra luôn qua được)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = botRun(seed * 7919, 300 * E.HZ);
    ok(g.phase === 'play', 'seed ' + seed * 7919 + ' chết ở điểm ' + g.score + ' (' + g.cause + ')');
    ok(g.score > 180, 'điểm ' + g.score);
  }
});

test('số cột / giây của bot khớp tốc độ cuộn sau khi độ khó chạm trần (SPEED / SPACE_MIN)', () => {
  let s90 = null;
  const g = botRun(2024, 300 * E.HZ, (x) => { if (x.tick === 90 * E.HZ) s90 = x.score; });
  const expected = (210 * E.SPEED) / E.SPACE_MIN;
  ok(Math.abs(g.score - s90 - expected) <= 1, 'được ' + (g.score - s90) + ', mong đợi ' + expected.toFixed(2));
  near(E.MAX_SCORE_RATE, E.SPEED / E.SPACE_MIN, 1e-12);
});

test('điểm / giây không bao giờ vượt MAX_SCORE_RATE (xét từ giây thứ 5), điểm ≤ maxScoreAt', () => {
  ok(E.FIRST_PIPE_X + E.PIPE_W / 2 >= E.SPACE_MIN, 'cột đầu đủ xa để chặn trên đúng');
  let worst = 0;
  for (let seed = 1; seed <= 10; seed++) {
    botRun(seed, 200 * E.HZ, (g) => {
      ok(g.score <= E.maxScoreAt(g.tick), 'vượt maxScoreAt ở tick ' + g.tick);
      if (g.tick >= 5 * E.HZ) worst = Math.max(worst, g.score / (g.tick * E.DT));
    });
  }
  ok(worst <= E.MAX_SCORE_RATE, 'worst ' + worst);
  ok(worst > E.MAX_SCORE_RATE * 0.85, 'bot đạt gần trần: ' + worst);
});

/* ---------------- Huy chương ---------------- */

test('huy chương: đồng 10, bạc 20, vàng 40, bạch kim 80', () => {
  eq([0, 9, 10, 19, 20, 39, 40, 79, 80, 500].map(E.medalFor), [null, null, 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'platinum', 'platinum']);
  eq([E.nextMedal(0), E.nextMedal(10), E.nextMedal(45), E.nextMedal(80)], [{ name: 'bronze', at: 10 }, { name: 'silver', at: 20 }, { name: 'platinum', at: 80 }, null]);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữa ván: chạy tiếp ra đúng kết quả như không gián đoạn', () => {
  let mid = null;
  const full = botRun(555, 9000, (g) => { if (g.tick === 4000) mid = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))); });
  ok(mid, 'đã lưu');
  eq(mid.tick, 4000);
  let g = mid;
  while (g.tick < full.tick && g.phase === 'play') {
    if (E.autopilot(g)) g = E.flap(g);
    g = E.step(g);
  }
  eq(E.toJSON(g), E.toJSON(full));
});

test('khôi phục ván mới chờ bay và ván đã hết', () => {
  const r = E.newGame(9);
  eq(E.fromJSON(E.toJSON(r)), E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(r)))));
  eq(E.toJSON(E.fromJSON(E.toJSON(r))), E.toJSON(r));
  const o = E.simulate(9, [0], 3000);
  eq(E.toJSON(E.fromJSON(E.toJSON(o))), E.toJSON(o));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(botRun(8, 3000));
  ok(E.fromJSON(good), 'ván tốt');
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { rng: 1.5 }),
    Object.assign({}, good, { phase: 'fly' }),
    Object.assign({}, good, { tick: -1 }),
    Object.assign({}, good, { y: NaN }),
    Object.assign({}, good, { y: E.GROUND_Y + 50 }),
    Object.assign({}, good, { vy: 99999 }),
    Object.assign({}, good, { score: -1 }),
    Object.assign({}, good, { score: 9999 }), // nhiều hơn số cột có thể qua
    Object.assign({}, good, { score: '3' }),
    Object.assign({}, good, { cause: 'pipe' }), // đang bay mà có nguyên nhân chết
    Object.assign({}, good, { phase: 'over' }), // hết ván mà không có nguyên nhân
    Object.assign({}, good, { phase: 'ready' }), // chờ bay mà đã có tick
    Object.assign({}, good, { pipes: 'x' }),
    Object.assign({}, good, { pipes: [null] }),
    Object.assign({}, good, { pipes: good.pipes.map((p, i) => (i ? p : Object.assign({}, p, { gap: 10 }))) }),
    Object.assign({}, good, { pipes: good.pipes.map((p, i) => (i ? p : Object.assign({}, p, { y: 5 }))) }),
    Object.assign({}, good, { pipes: good.pipes.map((p, i) => (i ? p : Object.assign({}, p, { passed: 1 }))) }),
    Object.assign({}, good, { pipes: good.pipes.slice(1).concat(good.pipes.slice(0, 1)) }), // sai thứ tự
    Object.assign({}, good, { nextK: good.nextK + 3 }),
    Object.assign({}, good, { nextX: Infinity }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
