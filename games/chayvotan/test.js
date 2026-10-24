/* Kiểm tra engine Chạy Vô Tận: chạy `node test.js`
 * - Tốc độ tăng theo quãng đường rồi dừng ở trần
 * - Vật lý nhảy: giữ lâu nhảy cao hơn, coyote time, đệm nhảy, rơi nhanh, nhảy đôi khi có lông vũ
 * - Trượt (cúi chui dưới vật bay, tự cúi tiếp khi vật bay còn đè trên đầu)
 * - Va chạm: cột, vật bay, thành bậc, hố; hộp va chạm nhỏ hơn hình vẽ; hết ván thì đứng yên
 * - Xu, lông vũ, tính điểm
 * - Sinh khúc tất định theo seed, độ khó tăng theo quãng; luôn vượt được (bot hoàn hảo qua mọi kiểu khúc ở
 *   mọi mức tốc độ và qua hàng chục khúc liên tiếp ở đầu ván lẫn lúc tốc độ tối đa)
 * - Tất định (cùng seed + input → cùng kết quả, chia khung hình kiểu nào cũng vậy)
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
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg ? msg + ': ' : '') + a + ' không gần ' + b);
}

const J = { jump: true, down: false };
const D = { jump: false, down: true };
const N = { jump: false, down: false };

/** Lặp step với hàm input(i, g) tới khi điều kiện until(g) đúng hoặc hết max bước. */
function sim(g, input, until, max) {
  let s = g;
  for (let i = 0; i < (max == null ? 5000 : max) && s.phase === 'run'; i++) {
    s = E.step(s, input ? input(i, s) : N);
    if (until && until(s)) break;
  }
  return s;
}
/** Nhảy trên đường bằng, giữ h bước: trả { apex, ticks } (độ cao tối đa của chân, số bước trên không). */
function jumpProfile(h) {
  let g = E.newGame(7);
  let top = g.y;
  let t = 0;
  do {
    g = E.step(g, t < h ? J : N);
    top = Math.min(top, g.y);
    t++;
  } while (!g.grounded && t < 500);
  return { apex: E.GROUND_Y - top, ticks: t };
}
/** Khúc thứ k của đường dựng tay. */
const chunkOf = (key, k) => E.levelOf(key).chunks[k];
let levelId = 0;
/** Đường dựng tay một khúc kiểu `type` ngay sau đoạn bằng kết thúc ở x0; trả { key, ch, g } (g đứng ở đầu khúc). */
function single(type, x0, extra) {
  const key = 'T' + ++levelId;
  E.makeLevel(key, [Object.assign({ type, rng: 7 }, extra || {})], x0 == null ? 1000 : x0);
  return { key, ch: chunkOf(key, 1), g: E.startAt(key, 1) };
}

/* ---------------- Tốc độ ---------------- */
test('tốc độ tăng theo quãng đường rồi dừng ở trần', () => {
  eq(E.speedAt(0), E.V0);
  eq(E.speedAt(E.RAMP_X), E.VMAX);
  eq(E.speedAt(E.RAMP_X * 3), E.VMAX);
  let prev = 0;
  for (let x = 0; x <= E.RAMP_X; x += 1000) {
    ok(E.speedAt(x) >= prev, 'không giảm');
    prev = E.speedAt(x);
  }
  // x chỉ phụ thuộc số bước: xAtTick khớp từng bit với chạy thật
  const g = sim(E.newGame(5), null, null, 300);
  eq(g.x, E.xAtTick(g.tick));
});

/* ---------------- Nhảy ---------------- */
test('nhảy chạm nhẹ cao ≈ 76, bay ≈ 0,4 s', () => {
  const p = jumpProfile(1);
  near(p.apex, (E.JUMP_V * E.JUMP_V) / (2 * E.G_FALL), 4);
  near(p.ticks / E.HZ, 0.4, 0.02);
});

test('giữ lâu nhảy cao hơn, tới mức giữ tối đa thì thôi tăng', () => {
  const hs = [1, 6, 12, 18, 24, 36, 48].map((h) => jumpProfile(h).apex);
  for (let i = 1; i < hs.length; i++) ok(hs[i] > hs[i - 1] + 1, 'giữ ' + i + ': ' + hs.join(', '));
  eq(jumpProfile(E.MAX_HOLD + 30).apex, jumpProfile(E.MAX_HOLD).apex);
  ok(hs[hs.length - 1] > 140 && hs[hs.length - 1] < 160, 'nhảy cao nhất ' + hs[hs.length - 1]);
  // bay lâu hơn khi giữ
  ok(jumpProfile(48).ticks > jumpProfile(1).ticks * 1.5);
});

test('giữ phím không tự nhảy lại khi chạm đất (phải buông rồi bấm lại)', () => {
  let g = E.newGame(7);
  g = sim(g, () => J, (s) => s.grounded, 400);
  eq(g.jumps, 1);
  g = sim(g, () => J, null, 30);
  eq([g.jumps, g.grounded], [1, true]);
});

test('coyote time: vừa rời mép hố vẫn nhảy được trong COYOTE bước, trễ hơn thì rơi', () => {
  const tryAt = (k) => {
    const { g } = single('pitWide');
    let s = sim(g, null, (q) => !q.grounded, 2000); // chạy tới khi hụt chân
    eq(s.coyote, E.COYOTE);
    s = sim(s, null, null, k);
    s = E.step(s, J);
    return s;
  };
  ok(tryAt(0).vy < 0, 'nhảy ngay khi hụt chân');
  ok(tryAt(E.COYOTE - 2).vy < 0, 'nhảy ở bước coyote cuối');
  const late = tryAt(E.COYOTE + 1);
  ok(late.vy > 0 && late.jumps === 0, 'quá coyote thì không nhảy');
});

test('đệm nhảy: bấm sớm trước khi chạm đất (≤ BUFFER bước) thì nhảy ngay khi chạm', () => {
  const land = jumpProfile(1).ticks; // bước chạm đất của cú nhảy chạm nhẹ
  const second = (early) => {
    let g = E.newGame(7);
    for (let t = 0; t < land + 4; t++) g = E.step(g, t === 0 || t === land - early ? J : N);
    return g.jumps;
  };
  eq(second(E.BUFFER - 2), 2, 'bấm sớm trong đệm');
  eq(second(1), 2, 'bấm ngay trước khi chạm');
  eq(second(E.BUFFER + 6), 1, 'bấm quá sớm thì bỏ');
});

test('giữ xuống trên không thì rơi nhanh hơn', () => {
  const air = (down) => {
    let g = E.newGame(7);
    let t = 0;
    do {
      g = E.step(g, t < 30 ? J : down && t > 40 ? D : N);
      t++;
    } while (!g.grounded && t < 500);
    return t;
  };
  ok(air(true) < air(false) - 6, air(true) + ' vs ' + air(false));
});

test('nhảy đôi chỉ khi có lông vũ, một lần mỗi lượt bay', () => {
  const mid = (dj) => {
    let g = Object.assign(E.newGame(7), { dj });
    g = sim(g, (i) => (i < 2 ? J : N), null, 30); // đang bay
    g = E.step(g, J);
    return g;
  };
  near(mid(500).vy, -E.DJ_V + E.G_HOLD * E.DT, 1e-9, 'có lông vũ');
  ok(mid(0).vy > 0, 'không có lông vũ');
  // bấm lần ba không có tác dụng
  let g = mid(500);
  g = sim(g, () => N, null, 10);
  const vy = g.vy;
  g = E.step(g, J);
  near(g.vy, vy + E.G_FALL * E.DT, 1e-6, 'lần ba');
});

test('nhặt lông vũ được nhảy đôi DJ_TICKS bước', () => {
  const { key, g } = single('post', 1000, { feather: true });
  const it = chunkOf(key, 1).item;
  ok(it, 'có lông vũ');
  // đặt nhân vật ngay dưới lông vũ (đang bay) rồi bước một bước
  const s = E.step(Object.assign({}, g, { x: it.x - 8, y: it.y + 30, grounded: false, vy: 0 }), N);
  eq([s.dj, s.taken.indexOf(it.id) >= 0], [E.DJ_TICKS, true]);
});

/* ---------------- Trượt ---------------- */
test('giữ xuống thì trượt (hộp thấp), buông thì đứng', () => {
  let g = E.newGame(7);
  g = E.step(g, D);
  eq(g.sliding, true);
  const b = E.body(g);
  eq(b[3] - b[1], E.H_SLIDE);
  g = E.step(g, N);
  eq(g.sliding, false);
  eq(E.body(g)[3] - E.body(g)[1], E.H_STAND);
});

test('vật bay ở tầm đầu: đứng thì va, trượt thì chui qua', () => {
  const a = single('flyer');
  const hit = sim(a.g, null, null, 3000);
  eq([hit.phase, hit.cause], ['over', 'flyer']);
  const b = single('flyer');
  const slid = sim(b.g, () => D, (s) => s.x > b.ch.x1, 3000);
  eq(slid.phase, 'run');
});

test('buông trượt khi vật bay còn trên đầu thì vẫn cúi tới khi qua hẳn', () => {
  const { g, ch } = single('flyer');
  const f = ch.hz[0];
  let s = sim(g, () => D, (q) => q.x > f.x, 3000); // đang ở ngay dưới vật bay
  s = E.step(s, N);
  eq([s.phase, s.sliding], ['run', true]);
  s = sim(s, null, (q) => q.x - E.HW > f.x1 + 2, 500);
  eq([s.phase, s.sliding], ['run', false]);
});

/* ---------------- Va chạm ---------------- */
test('cột thấp: không nhảy thì va, nhảy đúng lúc thì qua', () => {
  const a = single('post');
  eq(sim(a.g, null, null, 3000).cause, 'post');
  const b = single('post');
  const p = b.ch.hz[0];
  const s = sim(b.g, (i, q) => (q.x > p.x - 60 && q.x < p.x - 50 ? J : N), (q) => q.x > b.ch.x1, 3000);
  eq(s.phase, 'run');
});

test('hộp va chạm nhỏ hơn hình vẽ (công bằng)', () => {
  const S = E.SPRITE;
  ok(E.HW * 2 < S.runW && E.H_STAND < S.runH && E.HW_SLIDE * 2 < S.slideW && E.H_SLIDE < S.slideH, 'nhân vật');
  ok(E.POST_HW * 2 < S.postW && E.POST_H < S.postH, 'cột');
  ok(E.FLY_HW * 2 < S.flyW && E.FLY_TOP - E.FLY_BOTTOM < S.flyH, 'vật bay');
  // Hình nhân vật chạm mép hình cột (lấn 3 đơn vị) mà hộp va chạm chưa chạm: không chết
  const { g, ch } = single('post');
  const p = ch.hz[0];
  const x = p.x - S.postW / 2 - S.runW / 2 + 3 - E.speedAt(p.x) * E.DT;
  const s = E.step(Object.assign({}, g, { x }), N);
  eq(s.phase, 'run');
});

test('hố: không nhảy thì rơi; hố rộng cần giữ nhảy lâu', () => {
  const a = single('pit');
  eq(sim(a.g, null, null, 3000).cause, 'pit');
  // Hố rộng ở tốc độ đầu: nhảy chạm nhẹ không qua được dù nhảy ở mép, giữ hết thì qua
  const jumpAtEdge = (hold) => {
    const b = single('pitWide', 1000);
    const edge = b.ch.blocks[0].x1; // mép hố
    let started = -1;
    return sim(b.g, (i, q) => {
      if (started < 0 && q.x + E.HW >= edge - 2) started = i;
      return started >= 0 && i - started < hold ? J : N;
    }, (q) => q.x > b.ch.x1, 3000);
  };
  eq(jumpAtEdge(1).cause, 'pit');
  eq(jumpAtEdge(E.MAX_HOLD).phase, 'run');
});

test('bậc: đâm vào thành thì thua, nhảy lên được thì chạy trên mặt bậc rồi xuống', () => {
  const a = single('stepLow');
  eq(sim(a.g, null, null, 3000).cause, 'wall');
  const b = single('stepLow');
  const st = b.ch.blocks.find((k) => k.top < E.GROUND_Y);
  let s = sim(b.g, (i, q) => (q.x > st.x0 - 70 && q.x < st.x0 - 60 ? J : N), (q) => q.grounded && q.x > st.x0 + 40, 3000);
  eq([s.phase, s.y], ['run', E.GROUND_Y - E.STEP_LOW]);
  s = sim(s, null, (q) => q.x > st.x1 + 80, 3000);
  eq([s.phase, s.y, s.grounded], ['run', E.GROUND_Y, true]);
  const c = single('stepHigh');
  eq(sim(c.g, null, null, 3000).cause, 'wall');
});

test('hết ván thì step không đổi gì', () => {
  const { g } = single('post');
  const s = sim(g, null, null, 3000);
  eq(s.phase, 'over');
  ok(E.step(s, J) === s);
});

/* ---------------- Xu và điểm ---------------- */
test('xu: chạy qua hàng xu nhặt đủ, không nhặt trùng; điểm = mét + 5 × xu', () => {
  const { g, ch } = single('run');
  eq(ch.coins.length, 6);
  let s = sim(g, null, (q) => q.x > ch.x1 + 300, 3000);
  eq([s.phase, s.coins], ['run', 6]);
  eq(E.scoreOf(s), Math.floor(s.x / E.UNITS_PER_M) + E.COIN_PTS * 6);
  s = sim(s, null, null, 200);
  eq(s.coins, 6);
});

test('ván không bấm gì thì sớm hết ván với điểm dương', () => {
  const s = sim(E.newGame(123), null, null, 120 * 60);
  eq(s.phase, 'over');
  ok(E.scoreOf(s) > 0 && E.meters(s) > 20);
});

test('số mét mỗi giây không vượt VMAX / UNITS_PER_M', () => {
  const t = 120 * 300;
  ok(E.xAtTick(t) / E.UNITS_PER_M / 300 <= E.VMAX / E.UNITS_PER_M);
});

/* ---------------- Sinh khúc ---------------- */
test('sinh khúc tất định theo seed, seed khác ra đường khác', () => {
  const strip = (cs) => JSON.stringify(cs);
  const a = strip(E.generate(4242, 80));
  // đẩy seed 4242 ra khỏi cache rồi sinh lại từ đầu
  for (let s = 1; s <= 20; s++) E.generate(900000 + s, 2);
  eq(strip(E.generate(4242, 80)), a);
  ok(strip(E.generate(4243, 80)) !== a);
});

test('khúc nối liền, mặt đất ở hai đầu khúc, đầu khúc là đoạn bằng', () => {
  const cs = E.generate(31, 300);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (i > 0) eq(c.x0, cs[i - 1].x1, 'nối liền ' + i);
    const ground = c.blocks.filter((k) => k.top === E.GROUND_Y);
    eq(ground[0].x0, c.x0);
    eq(ground[ground.length - 1].x1, c.x1);
    const lead = E.leadFor(c.d) * c.v;
    ok(c.hz.every((h) => h.x0 > c.x0 + lead - 1), 'chướng ngại sau đoạn nghỉ');
    ok(c.coins.every((k, j) => j === 0 || k.x >= c.coins[j - 1].x), 'xu sắp theo x');
  }
});

test('độ khó tăng theo quãng: đầu ván chỉ khúc dễ, càng xa càng nhiều kiểu khó, đoạn nghỉ ngắn dần', () => {
  const cs = E.generate(77, 400);
  const minD = {};
  E.CATALOG.forEach((c) => { minD[c[0]] = c[1]; });
  cs.forEach((c) => ok(minD[c.type] <= c.d + 1e-9, c.type + ' xuất hiện sớm ở d=' + c.d));
  const early = new Set(cs.filter((c) => c.d < 0.1).map((c) => c.type));
  const late = new Set(cs.filter((c) => c.d >= 1).map((c) => c.type));
  ok(early.size <= 5 && late.size >= 12, early.size + ' / ' + late.size);
  ok(E.leadFor(1) < E.leadFor(0));
});

test('mọi kiểu khúc vượt được ở mọi mức tốc độ (bot hoàn hảo, 4 biến thể mỗi kiểu)', () => {
  const xs = [1000, 22500, 52000, 90000]; // ≈ V0, giữa, gần tối đa, tối đa (độ khó tối đa)
  E.TYPES.forEach((type) => {
    xs.forEach((x0) => {
      for (let r = 1; r <= 4; r++) {
        const key = 'P-' + type + '-' + x0 + '-' + r;
        E.makeLevel(key, [{ type, rng: r * 977, feather: r === 2 }], x0);
        const end = chunkOf(key, 1).x1 + 50;
        const g = E.startAt(key, 1);
        const path = E.plan(g, end);
        ok(path, type + ' ở x=' + x0 + ' (v=' + E.speedAt(x0).toFixed(0) + ') rng ' + r);
        const s = E.run(g, path);
        ok(s.phase === 'run' && s.x >= end, 'chạy lại đường của bot ' + type);
      }
    });
  });
});

test('bot hoàn hảo qua 60 khúc liên tiếp ở đầu ván và 60 khúc lúc tốc độ tối đa (4 seed)', () => {
  [1, 2, 3, 4].forEach((seed) => {
    [1, 160].forEach((k) => {
      const cs = E.generate(seed, k + 60);
      const g = E.startAt(seed, k);
      const end = cs[k + 58].x1;
      const path = E.plan(g, end);
      ok(path, 'seed ' + seed + ' từ khúc ' + k);
      const s = E.run(g, path);
      ok(s.phase === 'run' && s.x >= end, 'chạy lại seed ' + seed);
      if (k === 160) eq(E.speedAt(g.x), E.VMAX);
    });
  });
});

/* ---------------- Tất định ---------------- */
test('tất định: cùng seed + chuỗi input ra cùng trạng thái', () => {
  const inputs = [];
  let r = 99;
  for (let i = 0; i < 2400; i++) {
    r = (r * 1103515245 + 12345) % 2147483648;
    inputs.push({ jump: r % 7 === 0, down: r % 11 === 0 });
  }
  const a = E.run(E.newGame(555), inputs);
  for (let s = 1; s <= 20; s++) E.generate(800000 + s, 2); // đẩy cache
  const b = E.run(E.newGame(555), inputs);
  eq(E.toJSON(a), E.toJSON(b));
});

test('đổi thời gian thật thành bước: 30 / 60 / 144 Hz và khung giật ra cùng số bước', () => {
  const count = (frames) => {
    let acc = 0;
    let n = 0;
    frames.forEach((ms) => {
      const r = E.ticksFor(acc, ms);
      acc = r.acc;
      n += r.ticks;
    });
    return n;
  };
  const make = (ms, total) => Array.from({ length: Math.round(total / ms) }, () => ms);
  eq(count(make(1000 / 30, 3000)), 360);
  eq(count(make(1000 / 60, 3000)), 360);
  eq(count(make(1000 / 144, 3000)), 360);
  eq(count([5, 40, 3, 50, 2, 25, 75]), 24);
  eq(E.ticksFor(0, 5000).ticks, 12, 'khung quá dài chỉ tính MAX_FRAME_MS');
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván, chạy tiếp ra cùng kết quả', () => {
  const { path } = (() => {
    const cs = E.generate(8, 12);
    const g = E.newGame(8);
    return { path: E.plan(g, cs[11].x1) };
  })();
  ok(path);
  const mid = E.run(E.newGame(8), path.slice(0, 1500));
  ok(mid.phase === 'run' && mid.coins > 0);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(mid))));
  ok(back, 'khôi phục được');
  eq(E.toJSON(back), E.toJSON(mid));
  eq(E.toJSON(E.run(back, path.slice(1500))), E.toJSON(E.run(mid, path.slice(1500))));
  // ván đã hết cũng khôi phục được
  const dead = sim(E.newGame(8), null, null, 9000);
  eq(E.toJSON(E.fromJSON(E.toJSON(dead))), E.toJSON(dead));
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.run(E.newGame(8), E.plan(E.newGame(8), E.generate(8, 6)[5].x1).slice(0, 900));
  const base = E.toJSON(g);
  const bad = (patch) => Object.assign({}, base, patch);
  const cases = [
    null,
    1,
    'x',
    {},
    bad({ v: 2 }),
    bad({ seed: 0 }),
    bad({ seed: -3 }),
    bad({ seed: 1.5 }),
    bad({ phase: 'win' }),
    bad({ tick: -1 }),
    bad({ x: base.x + 1 }), // quãng không khớp số bước
    bad({ tick: base.tick + 1 }),
    bad({ y: NaN }),
    bad({ vy: 1e9 }),
    bad({ grounded: 'yes' }),
    bad({ sliding: true, grounded: false }),
    bad({ coins: 100000 }),
    bad({ coins: -1 }),
    bad({ taken: 'a' }),
    bad({ taken: [999999] }),
    bad({ taken: base.taken.length > 1 ? base.taken.slice().reverse() : [base.taken[0], base.taken[0]] }),
    bad({ cause: 'post' }), // còn chạy mà có nguyên nhân thua
    bad({ phase: 'over', cause: null }),
    bad({ phase: 'over', cause: 'lava' }),
    bad({ dj: E.DJ_TICKS + 1 }),
    bad({ hold: 1000 }),
  ];
  ok(base.taken.length >= 1, 'ván mẫu có xu');
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'case ' + i + ' ' + JSON.stringify(raw && raw.v !== undefined ? Object.keys(raw).filter((k) => raw[k] !== base[k]) : raw)));
  const missing = Object.assign({}, base);
  delete missing.coins;
  eq(E.fromJSON(missing), null, 'thiếu trường');
  ok(E.fromJSON(base), 'ván gốc hợp lệ');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
