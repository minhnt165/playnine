/* Kiểm tra engine Qua Đường: chạy `node test.js`
 * - Nhảy từng ô, bị cây / mép bàn chắn, lệnh xếp hàng khi đang nhảy
 * - Xe đâm, đứng trên gỗ trôi theo và bị đưa ra khỏi màn, rơi xuống nước
 * - Đèn báo tàu sáng đúng WARN_STEPS bước trước khi tàu tới, tàu đâm
 * - Đứng yên quá lâu / lùi quá xa: đại bàng bắt; điểm = hàng xa nhất
 * - Sinh làn tất định theo seed; luôn có đường qua (sông có gỗ trong thời gian chờ giới hạn,
 *   cỏ không bị chắn kín, xe có khe đủ nhảy, độ khó tăng rồi dừng ở trần); bot tìm đường đi qua hơn 260 hàng
 * - Lưu / khôi phục (kể cả giữa cú nhảy) và từ chối dữ liệu hỏng
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
    console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       '));
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

const H = E.HOP_STEPS;

/** Chạy n bước. */
function run(g, n) {
  for (let i = 0; i < n && !g.over; i++) E.step(g);
  return g;
}
/** Nhảy một lần rồi chờ chạm đất. */
function hop(g, dir) {
  const okHop = E.input(g, dir);
  while (g.hop && !g.over) E.step(g);
  return okHop;
}
/** Thay làn ở hàng row bằng làn dựng tay (sinh trước cho đủ rồi ghi đè). */
function setLane(g, row, lane) {
  E.laneAt(g, row);
  g.gen.rows[row - E.LOW] = Object.assign({ row, reach: new Array(E.COLS).fill(true) }, lane);
}
const grass = (trees = []) => ({ type: 'grass', trees: Array.from({ length: E.COLS }, (_, c) => trees.includes(c)), deco: 0 });

/* ---------------- Bot tìm đường (BFS trên bản sao, môi trường tất định) ----------------
 * Mỗi quyết định: nhảy 1 trong 4 hướng hoặc đứng chờ; mọi lựa chọn kéo dài `gap` bước (gap ≥ HOP_STEPS:
 * nhịp bấm tối đa). Tìm chuỗi đến được hàng `y + ahead` (mặc định 4 hàng) mà không chết trong `horizon` bước, trả nước đầu tiên. */
function plan(g0, opts) {
  const gap = opts.gap || H;
  const horizon = opts.horizon || 420;
  const goal = g0.y + (opts.ahead || 4);
  const queue = [{ g: E.clone(g0), first: null }];
  const seen = new Set();
  let best = null; // sống lâu nhất nếu không tới đích
  for (let qi = 0; qi < queue.length; qi++) {
    const n = queue[qi];
    for (const a of ['up', 'left', 'right', 'wait', 'down']) {
      const c = E.clone(n.g);
      if (a !== 'wait') {
        if (!E.input(c, a)) continue;
      }
      for (let i = 0; i < gap && !c.over; i++) E.step(c);
      if (c.over) continue;
      const first = n.first || a;
      if (c.y >= goal) return first;
      if (!best || c.t > best.t) best = { t: c.t, first };
      if (c.t - g0.t >= horizon) continue;
      const key = c.y + ':' + Math.round(c.x * 8) + ':' + c.t;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ g: c, first });
    }
    if (queue.length > 40000) break;
  }
  return best ? best.first : 'wait';
}

/** Cho bot chơi một ván tới hàng `target` (hoặc tới khi chết / quá maxSteps). */
function botRun(seed, opts) {
  const g = E.newGame(seed);
  const gap = opts.gap || H;
  const target = opts.target || 100;
  const maxSteps = opts.maxSteps || 60 * 60 * 10;
  const samples = [];
  while (!g.over && g.best < target && g.t < maxSteps) {
    const a = plan(g, opts);
    if (a !== 'wait') E.input(g, a);
    for (let i = 0; i < gap && !g.over; i++) {
      E.step(g);
      if (g.t % 60 === 0) samples.push([g.t, g.best]);
    }
  }
  return { g, samples };
}

/* ================= Di chuyển ================= */
test('ván mới: vịt ở giữa hàng 0, điểm 0, chưa thua', () => {
  const g = E.newGame(1);
  eq([g.x, g.y, g.best, g.over, E.score(g)], [4.5, 0, 0, false, 0]);
});

test('nhảy lên mất đúng HOP_STEPS bước, rồi tăng điểm', () => {
  const g = E.newGame(1);
  setLane(g, 1, grass());
  ok(E.input(g, 'up'));
  run(g, H - 1);
  eq([g.y, g.best, !!g.hop], [0, 0, true], 'chưa chạm đất');
  E.step(g);
  eq([g.y, g.best, g.hop, g.x], [1, 1, null, 4.5]);
  const ev = E.drain(g).map((e) => e.type);
  eq(ev, ['hop', 'land', 'score']);
});

test('nhảy trái / phải một ô, không ra khỏi mép bàn', () => {
  const g = E.newGame(1);
  setLane(g, 0, grass());
  hop(g, 'left');
  eq(g.x, 3.5);
  hop(g, 'right');
  hop(g, 'right');
  eq(g.x, 5.5);
  g.x = 0.5;
  eq(E.input(g, 'left'), false, 'mép trái');
  g.x = E.COLS - 0.5;
  eq(E.input(g, 'right'), false, 'mép phải');
  eq(E.drain(g).filter((e) => e.type === 'bump').length, 2);
});

test('cây chắn: không nhảy được vào ô có cây, không mất lượt', () => {
  const g = E.newGame(1);
  setLane(g, 1, grass([4]));
  eq(E.input(g, 'up'), false);
  eq([g.y, g.hop], [0, null]);
  setLane(g, 0, grass([3]));
  eq(E.input(g, 'left'), false, 'cây bên trái');
  ok(E.input(g, 'right'), 'bên phải trống');
});

test('không lùi được ra sau hàng 0 (rừng cây)', () => {
  const g = E.newGame(1);
  eq(E.input(g, 'down'), false);
});

test('lệnh bấm khi đang nhảy được giữ lại và nhảy tiếp ngay khi chạm đất', () => {
  const g = E.newGame(1);
  setLane(g, 1, grass());
  setLane(g, 2, grass());
  E.input(g, 'up');
  run(g, 3);
  E.input(g, 'up');
  run(g, H - 3);
  eq([g.y, !!g.hop, g.hop && g.hop.y1], [1, true, 2]);
  run(g, H);
  eq(g.y, 2);
});

/* ================= Xe ================= */
test('xe đâm vịt đang đứng trên đường', () => {
  const g = E.newGame(1);
  // xe dài 1,5 ô, mép trái ở x = 0, chạy sang phải 3 ô / giây; vịt ở x = 4,5 (thân 4,2..4,8)
  setLane(g, 1, { type: 'road', speed: 3, loop: 30, objs: [{ x0: 0, len: 1.5, kind: 'car', color: 0 }] });
  hop(g, 'up');
  ok(!g.over, 'vừa nhảy lên còn sống');
  run(g, 200);
  eq([g.over, g.cause], [true, 'car']);
  // mép phải xe (x0 + 3t/60 + 1,5 - 0,08) chạm 4,2 lúc t ≈ 55,6 → chết ở bước 56
  eq(g.t, 56);
});

test('nhảy sang làn có xe đúng lúc xe tới cũng bị đâm (va chạm tính cả khi đang nhảy)', () => {
  const g = E.newGame(1);
  setLane(g, 1, { type: 'road', speed: 0, loop: 30, objs: [{ x0: 4, len: 1.5, kind: 'car', color: 0 }] });
  E.input(g, 'up');
  run(g, H);
  eq([g.over, g.cause], [true, 'car']);
});

test('xe đi qua rồi thì nhảy vào chỗ trống an toàn', () => {
  const g = E.newGame(1);
  setLane(g, 1, { type: 'road', speed: 3, loop: 30, objs: [{ x0: 6, len: 1.5, kind: 'car', color: 0 }] });
  setLane(g, 2, grass());
  hop(g, 'up');
  hop(g, 'up');
  eq([g.over, g.y], [false, 2]);
});

/* ================= Sông ================= */
test('nhảy xuống nước (không có gỗ) là thua', () => {
  const g = E.newGame(1);
  setLane(g, 1, { type: 'river', speed: 1, loop: 30, objs: [{ x0: 10, len: 3, kind: 'log', color: 0 }] });
  hop(g, 'up');
  eq([g.over, g.cause], [true, 'water']);
});

test('đứng trên gỗ trôi theo gỗ, bị đưa ra khỏi màn là thua', () => {
  const g = E.newGame(1);
  // gỗ x 3..6 chạy sang phải 1 ô / giây
  setLane(g, 1, { type: 'river', speed: 1, loop: 30, objs: [{ x0: 3, len: 3, kind: 'log', color: 0 }] });
  hop(g, 'up');
  eq([g.over, g.x], [false, 4.5]);
  run(g, 60);
  ok(Math.abs(g.x - 5.5) < 1e-9, 'trôi 1 ô sau 1 giây: ' + g.x);
  run(g, 60 * 10);
  eq([g.over, g.cause], [true, 'off']);
  ok(g.x > E.COLS);
});

test('trên gỗ vẫn nhảy ngang được; nhảy khỏi mép gỗ là rơi', () => {
  const g = E.newGame(1);
  setLane(g, 1, { type: 'river', speed: 0, loop: 30, objs: [{ x0: 3.5, len: 2, kind: 'log', color: 0 }] });
  hop(g, 'up');
  hop(g, 'right'); // 5,5: vẫn trên gỗ (3,5..5,5)
  eq([g.over, g.x], [false, 5.5]);
  hop(g, 'right'); // 6,5: nước
  eq([g.over, g.cause], [true, 'water']);
});

test('từ gỗ nhảy lên bờ thì rơi đúng ô đang đứng', () => {
  const g = E.newGame(1);
  setLane(g, 1, { type: 'river', speed: 0.6, loop: 30, objs: [{ x0: 3, len: 3, kind: 'log', color: 0 }] });
  setLane(g, 2, grass());
  hop(g, 'up');
  run(g, 40); // trôi 0,4 ô: x ≈ 4,9, vẫn trong ô 4
  hop(g, 'up');
  eq([g.over, g.y, g.x], [false, 2, 4.5]);
});

/* ================= Tàu ================= */
test('đèn báo sáng đúng WARN_STEPS bước trước khi tàu tới, tàu chưa có trong lúc báo', () => {
  const lane = { row: 1, type: 'rail', period: 400, offset: 0, pass: Math.ceil(((E.COLS + E.TRAIN_LEN) / E.TRAIN_SPEED) * 60), dir: 1 };
  const arrive = lane.period - lane.pass;
  let firstWarn = -1;
  let firstTrain = -1;
  for (let t = 0; t < lane.period; t++) {
    const s = E.train(lane, t);
    if (s.warn && firstWarn < 0) firstWarn = t;
    if (s.x0 != null && firstTrain < 0) firstTrain = t;
    if (t < firstWarn || firstWarn < 0) ok(s.x0 == null, 'không có tàu khi chưa báo');
  }
  eq(firstTrain - firstWarn, E.WARN_STEPS);
  eq(firstTrain, arrive);
  ok(E.WARN_STEPS >= 60, 'báo trước ít nhất 1 giây');
  // hết chu kỳ: tắt đèn, tàu đã đi khỏi màn
  const end = E.train(lane, lane.period - 1);
  ok(end.x0 >= E.COLS - 1, 'tàu gần ra khỏi màn ở cuối chu kỳ');
  const after = E.train(lane, lane.period);
  eq([after.warn, after.x0], [false, null]);
});

test('tàu đâm vịt đứng trên ray', () => {
  const g = E.newGame(1);
  const pass = Math.ceil(((E.COLS + E.TRAIN_LEN) / E.TRAIN_SPEED) * 60);
  setLane(g, 1, { type: 'rail', period: 600, offset: 0, pass, dir: -1 });
  hop(g, 'up');
  ok(!g.over);
  run(g, 600);
  eq([g.over, g.cause], [true, 'train']);
  // tàu vào từ bên phải lúc t = 600 - pass, chạy 20 ô / giây; vịt ở 4,5 (thân tới 4,8): thêm ~4,2/20 giây
  ok(g.t >= 600 - pass && g.t <= 600 - pass + 16, 't = ' + g.t);
});

test('tàu chạy hết thì qua ray an toàn', () => {
  const g = E.newGame(1);
  const pass = Math.ceil(((E.COLS + E.TRAIN_LEN) / E.TRAIN_SPEED) * 60);
  setLane(g, 1, { type: 'rail', period: 300, offset: 0, pass, dir: 1 });
  setLane(g, 2, grass());
  run(g, 10);
  hop(g, 'up');
  hop(g, 'up');
  eq([g.over, g.y], [false, 2]);
});

/* ================= Đại bàng / điểm ================= */
test('đứng yên quá lâu: đại bàng bắt (màn hình đuổi kịp)', () => {
  const g = E.newGame(1);
  run(g, 60 * 60);
  eq([g.over, g.cause], [true, 'eagle']);
  // bờ đuổi từ -4,5 với 0,4 hàng / giây: vượt hàng 0 sau 11,25 giây
  const expect = ((E.BACK_LIMIT + 0.5) / E.params(0).edgeSpeed) * 60;
  ok(Math.abs(g.t - expect) <= 2, 't = ' + g.t + ', mong ' + expect);
  ok(g.t > 60 * 10, 'không bắt quá sớm: ' + g.t);
});

test('cứ tiến lên đều thì đại bàng không bắt', () => {
  const g = E.newGame(1);
  for (let r = 1; r <= 20; r++) setLane(g, r, grass());
  for (let r = 0; r < 20; r++) {
    hop(g, 'up');
    run(g, 60 * 2);
  }
  eq([g.over, g.best], [false, 20]);
});

test('lùi quá BACK_LIMIT hàng so với kỷ lục là đại bàng bắt; lùi trong giới hạn thì không', () => {
  const g = E.newGame(1);
  for (let r = 1; r <= 10; r++) setLane(g, r, grass());
  for (let r = 0; r < 10; r++) hop(g, 'up');
  for (let r = 0; r < E.BACK_LIMIT; r++) hop(g, 'down');
  eq([g.over, g.y, g.best], [false, 10 - E.BACK_LIMIT, 10]);
  hop(g, 'down');
  run(g, 1);
  eq([g.over, g.cause], [true, 'eagle']);
});

test('điểm là hàng xa nhất từng tới, lùi lại không giảm', () => {
  const g = E.newGame(1);
  for (let r = 1; r <= 5; r++) setLane(g, r, grass());
  for (let r = 0; r < 5; r++) hop(g, 'up');
  hop(g, 'down');
  hop(g, 'down');
  hop(g, 'up');
  eq([g.y, E.score(g)], [4, 5]);
});

test('điểm không vượt số bước nhảy có thể (≤ t / HOP_STEPS) dù bấm liên tục', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = E.newGame(seed);
    const r = E.rng(seed * 7);
    while (!g.over && g.t < 3000) {
      E.input(g, r() < 0.8 ? 'up' : ['left', 'right', 'down'][r.int(3)]);
      E.step(g);
      ok(g.best <= Math.floor(g.t / H), 'seed ' + seed + ': ' + g.best + ' > ' + g.t / H);
    }
  }
  ok(1000 / (H * E.STEP_MS) < 7, 'trần 6,67 hàng / giây');
});

/* ================= Sinh làn ================= */
const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 13);
const ROWS = 400;

test('tất định theo seed: cùng seed cùng đường, khác seed khác đường', () => {
  const dump = (seed) => {
    const g = E.newGame(seed);
    const out = [];
    for (let r = E.LOW; r < 300; r++) out.push(E.laneAt(g, r));
    return JSON.stringify(out);
  };
  eq(dump(42) === dump(42), true);
  eq(dump(42) === dump(43), false);
  // sinh theo thứ tự nào cũng như nhau (bản sao dùng chung bộ sinh)
  const g = E.newGame(42);
  E.laneAt(g, 250);
  const a = JSON.stringify(E.laneAt(g, 120));
  const b = E.newGame(42);
  for (let r = 0; r <= 120; r++) E.laneAt(b, r);
  eq(JSON.stringify(E.laneAt(b, 120)), a);
});

test('tất định theo seed + chuỗi lệnh: hai lần chạy cho cùng kết quả', () => {
  const play = () => {
    const g = E.newGame(2024);
    const r = E.rng(5);
    while (!g.over && g.t < 4000) {
      if (g.t % 11 === 0) E.input(g, r() < 0.7 ? 'up' : 'left');
      E.step(g);
    }
    return JSON.stringify(E.toJSON(g));
  };
  eq(play(), play());
});

test('đầu ván: hàng 0..2 là cỏ, sau lưng là rừng cây', () => {
  for (const seed of SEEDS) {
    const g = E.newGame(seed);
    for (let r = 0; r < 3; r++) eq(E.laneAt(g, r).type, 'grass');
    eq(E.laneAt(g, 0).trees.some(Boolean), false, 'hàng 0 trống');
    ok(E.laneAt(g, -1).trees.every(Boolean), 'hàng -1 kín cây');
  }
});

test('cỏ không bao giờ bị chắn kín và luôn nối được với làn cỏ liền trước', () => {
  for (const seed of SEEDS) {
    const g = E.newGame(seed);
    for (let r = 0; r < ROWS; r++) {
      const lane = E.laneAt(g, r);
      if (lane.type !== 'grass') continue;
      ok(lane.trees.filter((v) => !v).length >= 3, 'ít nhất 3 ô trống, hàng ' + r);
      const prev = E.laneAt(g, r - 1);
      // tự loang lại: từ vùng đi được của làn trước (hoặc mọi cột nếu làn trước không phải cỏ)
      const entry = prev.type === 'grass' && r > 0 ? prev.reach : new Array(E.COLS).fill(true);
      const reach = entry.map((v, c) => v && !lane.trees[c]);
      for (let k = 0; k < E.COLS; k++) for (let c = 0; c < E.COLS; c++) {
        if (!lane.trees[c] && ((c > 0 && reach[c - 1]) || (c < E.COLS - 1 && reach[c + 1]))) reach[c] = true;
      }
      ok(reach.some(Boolean), 'seed ' + seed + ' hàng ' + r + ' không có lối đi lên');
      eq(reach, lane.reach, 'vùng đi được ghi đúng');
    }
  }
});

test('sông: luôn có gỗ, mọi cột có gỗ trôi tới trong thời gian chờ giới hạn', () => {
  let rivers = 0;
  for (const seed of SEEDS) {
    const g = E.newGame(seed);
    for (let r = 0; r < ROWS; r++) {
      const lane = E.laneAt(g, r);
      if (lane.type !== 'river') continue;
      rivers++;
      ok(lane.objs.length >= 2, 'ít nhất 2 khúc gỗ');
      ok(lane.objs.every((o) => o.len >= 2 && o.len <= E.PAD), 'gỗ dài 2..PAD ô');
      ok(lane.loop >= E.COLS + E.PAD, 'vòng đủ dài để quay vòng không lộ');
      ok(Math.abs(lane.speed) >= 0.9, 'gỗ không đứng yên');
      const period = Math.ceil((lane.loop / Math.abs(lane.speed)) * 60);
      for (let c = 0; c < E.COLS; c++) {
        let gapRun = 0;
        let maxRun = 0;
        for (let t = 0; t < period * 2; t++) {
          if (E.floatAt(lane, c + 0.5, t)) gapRun = 0;
          else maxRun = Math.max(maxRun, ++gapRun);
        }
        ok(maxRun <= E.MAX_RIVER_WAIT * 60, 'seed ' + seed + ' hàng ' + r + ' cột ' + c + ' chờ ' + maxRun + ' bước');
      }
      // hai làn sông liền nhau trôi ngược chiều
      const prev = E.laneAt(g, r - 1);
      if (prev.type === 'river') ok(Math.sign(prev.speed) !== Math.sign(lane.speed), 'ngược chiều');
    }
  }
  ok(rivers > 100, 'có đủ làn sông để kiểm: ' + rivers);
});

test('đường: khe giữa hai xe đủ rộng để nhảy qua (≥ 3 lần thời gian một cú nhảy)', () => {
  for (const seed of SEEDS) {
    const g = E.newGame(seed);
    for (let r = 0; r < ROWS; r++) {
      const lane = E.laneAt(g, r);
      if (lane.type !== 'road') continue;
      ok(lane.loop >= E.COLS + E.PAD && lane.objs.every((o) => o.len <= E.PAD));
      for (const o of lane.objs) {
        // ô trống ở một cột kéo dài (khe - bề ngang vịt) / tốc độ giây
        const window = (o.gap + 0.16 - 2 * E.HALF_W) / Math.abs(lane.speed);
        ok(window >= (3 * H) / 60, 'seed ' + seed + ' hàng ' + r + ' khe ' + window.toFixed(2) + ' s');
      }
    }
  }
});

test('ray: giữa hai chuyến tàu có quãng an toàn đủ dài, đèn báo trước', () => {
  for (const seed of SEEDS) {
    const g = E.newGame(seed);
    for (let r = 0; r < ROWS; r++) {
      const lane = E.laneAt(g, r);
      if (lane.type !== 'rail') continue;
      ok(lane.period - lane.pass - E.WARN_STEPS >= 90, 'yên ít nhất 1,5 giây');
    }
  }
});

test('độ khó tăng theo quãng đường rồi dừng ở trần', () => {
  let prev = -1;
  for (let r = 0; r < 1000; r++) {
    const d = E.difficulty(r);
    ok(d >= prev && d >= 0 && d <= 1);
    prev = d;
  }
  eq(E.difficulty(E.CAP_ROW + 4), 1);
  eq(E.difficulty(5000), 1);
  const a = E.params(0);
  const b = E.params(1);
  ok(b.roadSpeed[1] > a.roadSpeed[1] && b.riverSpeed[0] > a.riverSpeed[0] && b.tree > a.tree && b.edgeSpeed > a.edgeSpeed);
  ok(b.roadGap[0] < a.roadGap[0] && b.trainPeriod[0] < a.trainPeriod[0] && b.logGap[1] > a.logGap[1]);
  eq(E.params(E.difficulty(9999)), b, 'quá trần không khó hơn');
  // làn sinh ra luôn nằm trong biên của trần
  for (const seed of SEEDS.slice(0, 8)) {
    const g = E.newGame(seed);
    for (let r = 0; r < 800; r++) {
      const lane = E.laneAt(g, r);
      if (lane.type === 'road') ok(Math.abs(lane.speed) <= b.roadSpeed[1] * 1.25 + 0.05, 'xe không nhanh quá trần');
      if (lane.type === 'river') ok(Math.abs(lane.speed) <= b.riverSpeed[1] + 0.05);
    }
  }
  // tốc độ xe trung bình đoạn đầu chậm hơn đoạn sau
  const avg = (from, to) => {
    let s = 0;
    let n = 0;
    for (const seed of SEEDS) {
      const g = E.newGame(seed);
      for (let r = from; r < to; r++) {
        const lane = E.laneAt(g, r);
        if (lane.type === 'road') {
          s += Math.abs(lane.speed);
          n++;
        }
      }
    }
    return s / n;
  };
  ok(avg(3, 50) < avg(200, 300), 'xe nhanh dần');
});

test('luôn có đường qua: bot tìm đường đi hết 260 hàng (quá trần độ khó) trên nhiều seed', () => {
  for (const seed of [1, 2, 3, 77, 1234, 99991, 424242, 8675309]) {
    const { g } = botRun(seed, { target: 260 });
    ok(!g.over && g.best >= 260, 'seed ' + seed + ': chết vì ' + g.cause + ' ở hàng ' + g.best);
  }
});

/* ================= Lưu / khôi phục ================= */
test('lưu rồi khôi phục (kể cả giữa cú nhảy) chạy tiếp y hệt', () => {
  const { g } = botRun(31337, { target: 15 });
  ok(!g.over, 'bot tới hàng 15');
  // chờ tới lúc bot muốn nhảy, nhảy rồi lưu giữa chừng
  for (let i = 0; i < 100 && !g.hop; i++) {
    const a = plan(g, {});
    if (a !== 'wait') E.input(g, a);
    else E.step(g);
  }
  E.step(g);
  E.step(g);
  ok(g.hop && !g.over, 'đang nhảy');
  const saved = JSON.parse(JSON.stringify(E.toJSON(g)));
  const a = E.fromJSON(saved);
  const b = E.fromJSON(saved);
  ok(a && b);
  eq(E.toJSON(a), saved);
  const r2 = E.rng(11);
  const r3 = E.rng(11);
  for (let i = 0; i < 1500; i++) {
    if (i % 10 === 0) E.input(a, r2() < 0.7 ? 'up' : 'left');
    if (i % 10 === 0) E.input(b, r3() < 0.7 ? 'up' : 'left');
    E.step(a);
    E.step(b);
  }
  eq(E.toJSON(a), E.toJSON(b));
  const c = E.clone(g);
  const r4 = E.rng(11);
  for (let i = 0; i < 1500; i++) {
    if (i % 10 === 0) E.input(c, r4() < 0.7 ? 'up' : 'left');
    E.step(c);
  }
  eq(E.toJSON(c), E.toJSON(a), 'khớp với ván không lưu');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame(5));
  ok(E.fromJSON(good), 'bản lưu tốt');
  const bad = [
    null, 1, 'x', {}, Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { seed: -1 }), Object.assign({}, good, { seed: 1.5 }),
    Object.assign({}, good, { t: -1 }), Object.assign({}, good, { x: 99 }), Object.assign({}, good, { x: NaN }),
    Object.assign({}, good, { y: 3 }), // y > best
    Object.assign({}, good, { best: 20, y: 2 }), // lùi quá xa
    Object.assign({}, good, { edge: 5 }), Object.assign({}, good, { edge: 'a' }),
    Object.assign({}, good, { over: 'no' }), Object.assign({}, good, { over: true }), // thua mà không có lý do
    Object.assign({}, good, { cause: 'lava', over: true }),
    Object.assign({}, good, { queue: 'jump' }),
    Object.assign({}, good, { hop: { x0: 4.5, y0: 0, x1: 4.5, y1: 1, k: 99, dir: 'up' } }),
    Object.assign({}, good, { hop: { x0: 4.5, y0: 0, x1: 4.5, y1: 3, k: 1, dir: 'up' } }),
    Object.assign({}, good, { hop: { x0: 1, y0: 0, x1: 4.5, y1: 1, k: 1, dir: 'up' } }),
    Object.assign({}, good, { hop: 'up' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
