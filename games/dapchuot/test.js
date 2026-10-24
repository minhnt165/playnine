/* Kiểm tra engine Đập Chuột: chạy `node test.js`
 * - Lịch trồi tất định theo hạt giống, không chồng hố, xong trước khi hết giờ, loại chuột xuất hiện dần
 * - Cửa sổ nhìn thấy, đập trúng / đập trượt, chuột đội mũ cần 2 cú, bom trừ điểm và gây choáng
 * - Hệ số combo (tối đa ×3) và reset khi đập trượt, đồng hồ 60 giây, điểm cuối ván, trần điểm
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
function ok(c, msg) {
  if (!c) throw new Error(msg || 'điều kiện sai');
}

/** Tiến tới đúng thời điểm `t` (ms tính từ đầu ván). */
const goTo = (g, t) => E.advance(g, t - g.t).game;
/** Lượt trồi đầu tiên có loại `kind`. */
const firstOf = (g, kind) => g.spawns.findIndex((s) => s.kind === kind);
/** Hố trống (không có gì đang trồi) tại thời điểm hiện tại. */
const emptyHole = (g) => [0, 1, 2, 3, 4, 5, 6, 7, 8].find((h) => E.visibleAt(g, h) < 0);

/* ---------------- Lịch trồi ---------------- */

test('cùng hạt giống thì cùng lịch trồi, khác hạt giống thì khác', () => {
  eq(E.schedule(42), E.schedule(42));
  ok(JSON.stringify(E.schedule(42)) !== JSON.stringify(E.schedule(43)), 'hai hạt giống cho cùng lịch');
});

test('lịch trồi: số lượt và số mỗi loại như nhau ở mọi hạt giống (công bằng, trần điểm cố định)', () => {
  const count = (s) => ['mole', 'gold', 'helmet', 'bomb'].map((k) => s.filter((x) => x.kind === k).length);
  const ref = count(E.schedule(1));
  for (let seed = 2; seed < 200; seed++) eq(count(E.schedule(seed)), ref, 'seed ' + seed);
  ok(ref[1] > 0 && ref[2] > 0 && ref[3] > 0, 'thiếu loại chuột đặc biệt');
});

test('lịch trồi: tăng dần, mỗi lượt nằm trọn trong ván, hố hợp lệ', () => {
  for (let seed = 1; seed < 100; seed++) {
    const s = E.schedule(seed);
    s.forEach((x, i) => {
      ok(Number.isInteger(x.at) && Number.isInteger(x.end) && x.end > x.at, 'mốc thời gian sai');
      ok(x.at > 0 && x.end + (x.kind === 'helmet' ? E.HELMET_GRACE_MS : 0) <= E.ROUND_MS, 'lượt ' + i + ' tràn khỏi ván');
      ok(x.hole >= 0 && x.hole < 9, 'hố sai');
      if (i) ok(x.at >= s[i - 1].at, 'không tăng dần');
    });
  }
});

test('lịch trồi: không bao giờ hai lượt chồng nhau ở cùng một hố (kể cả khi mũ kéo dài thời gian)', () => {
  for (let seed = 1; seed < 300; seed++) {
    const busy = new Array(9).fill(0);
    E.schedule(seed).forEach((x) => {
      ok(x.at >= busy[x.hole], 'seed ' + seed + ': hố ' + x.hole + ' bị chồng');
      busy[x.hole] = x.end + (x.kind === 'helmet' ? E.HELMET_GRACE_MS : 0);
    });
  }
});

test('nhịp độ tăng dần: cuối ván trồi dày hơn và nhanh lặn hơn đầu ván', () => {
  const s = E.schedule(7);
  const early = s.filter((x) => x.at < 15000);
  const late = s.filter((x) => x.at > 45000);
  ok(late.length > early.length, 'cuối ván không dày hơn: ' + early.length + ' / ' + late.length);
  const avg = (a) => a.reduce((n, x) => n + x.end - x.at, 0) / a.length;
  const moles = (a) => a.filter((x) => x.kind === 'mole');
  ok(avg(moles(late)) < avg(moles(early)) * 0.75, 'cuối ván không nhanh hơn');
});

test('chuột đặc biệt xuất hiện dần: 8 lượt đầu chỉ có chuột thường, vàng rồi mũ rồi bom', () => {
  for (let seed = 1; seed < 50; seed++) {
    const s = E.schedule(seed);
    const firstIdx = (k) => s.findIndex((x) => x.kind === k);
    ok(s.slice(0, 8).every((x) => x.kind === 'mole'), 'lượt đầu không phải chuột thường');
    ok(firstIdx('gold') >= 8 && firstIdx('helmet') >= 16 && firstIdx('bomb') >= 24, 'xuất hiện quá sớm');
  }
});

test('chuột vàng hiện ngắn hơn chuột thường, chuột đội mũ hiện lâu hơn', () => {
  const s = E.schedule(9);
  const d = (x) => x.end - x.at;
  s.forEach((x, i) => {
    const m = s.slice(Math.max(0, i - 3), i + 4).find((y) => y.kind === 'mole' && Math.abs(y.at - x.at) < 2500);
    if (!m) return;
    if (x.kind === 'gold') ok(d(x) < d(m), 'vàng không ngắn hơn');
    if (x.kind === 'helmet') ok(d(x) > d(m), 'mũ không lâu hơn');
  });
});

/* ---------------- Cửa sổ nhìn thấy ---------------- */

test('ván mới: 0 điểm, đồng hồ 0, chưa có gì trồi', () => {
  const g = E.newGame(5);
  eq([g.t, g.score, g.streak, E.isOver(g), E.timeLeft(g)], [0, 0, 0, false, 60000]);
  for (let h = 0; h < 9; h++) eq(E.visibleAt(g, h), -1);
});

test('chuột chỉ thấy được trong [at, end): trước at và từ end trở đi thì không', () => {
  let g = E.newGame(5);
  const s = g.spawns[0];
  g = goTo(g, s.at - 1);
  eq(E.visibleAt(g, s.hole), -1, 'trước khi trồi');
  g = goTo(g, s.at);
  eq(E.visibleAt(g, s.hole), 0, 'đúng lúc trồi');
  g = goTo(g, s.end - 1);
  eq(E.visibleAt(g, s.hole), 0, 'ngay trước khi lặn');
  g = goTo(g, s.end);
  eq(E.visibleAt(g, s.hole), -1, 'đã lặn');
});

test('advance báo sự kiện trồi và trốn; chuột trốn không làm mất combo', () => {
  let g = E.newGame(5);
  const s = g.spawns[0];
  let r = E.advance(g, s.at);
  ok(r.events.some((e) => e.type === 'up' && e.i === 0), 'không có sự kiện trồi');
  g = Object.assign({}, r.game, { streak: 4 });
  r = E.advance(g, s.end - g.t);
  ok(r.events.some((e) => e.type === 'escape' && e.i === 0), 'không có sự kiện trốn');
  eq([r.game.escaped, r.game.streak], [1, 4]);
});

test('advance là hàm thuần: không đổi ván cũ; tiến từng bước nhỏ hay một lần đều như nhau', () => {
  const g = E.newGame(11);
  const before = JSON.stringify(E.toJSON(g));
  const once = E.advance(g, 20000).game;
  eq(JSON.stringify(E.toJSON(g)), before, 'ván cũ bị đổi');
  let step = g;
  for (let i = 0; i < 2000; i++) step = E.advance(step, 10).game;
  eq(E.toJSON(step), E.toJSON(once));
});

/* ---------------- Đập ---------------- */

test('đập trúng chuột thường: +1, chuột lặn, combo tăng; ván cũ không đổi', () => {
  let g = E.newGame(5);
  const s = g.spawns[0];
  g = goTo(g, s.at + 50);
  const before = JSON.stringify(E.toJSON(g));
  const r = E.whack(g, s.hole);
  eq(JSON.stringify(E.toJSON(g)), before, 'ván cũ bị đổi');
  eq([r.result.type, r.result.kind, r.result.points, r.result.mult, r.result.hole], ['hit', 'mole', 1, 1, s.hole]);
  eq([r.game.score, r.game.streak, r.game.whacked, E.visibleAt(r.game, s.hole)], [1, 1, 1, -1]);
  eq(E.whack(r.game, s.hole).result.type, 'miss', 'đập lại chỗ vừa đập là trượt');
});

test('đập vào hố trống: trượt, combo về 0, không trừ điểm', () => {
  let g = E.newGame(5);
  g = goTo(g, g.spawns[0].at + 10);
  g = Object.assign({}, g, { streak: 9, score: 20 });
  const r = E.whack(g, emptyHole(g));
  eq([r.result.type, r.game.streak, r.game.score, r.game.whiffs], ['miss', 0, 20, 1]);
});

test('hố ngoài 0..8 bị bỏ qua', () => {
  const g = goTo(E.newGame(5), 3000);
  [-1, 9, 1.5, 'a', null].forEach((h) => eq(E.whack(g, h).game, g));
});

test('chuột vàng +5', () => {
  let g = E.newGame(5);
  const i = firstOf(g, 'gold');
  g = goTo(g, g.spawns[i].at);
  const r = E.whack(g, g.spawns[i].hole);
  eq([r.result.type, r.result.kind, r.result.points], ['hit', 'gold', 5]);
});

test('chuột đội mũ: cú đầu hất mũ (0 điểm, vẫn tính combo), cú thứ hai mới hạ (+2)', () => {
  let g = E.newGame(5);
  const i = firstOf(g, 'helmet');
  const s = g.spawns[i];
  g = goTo(g, s.at);
  let r = E.whack(g, s.hole);
  eq([r.result.type, r.result.points, r.game.score, r.game.streak, r.game.hp[i], E.visibleAt(r.game, s.hole)], ['helmet', 0, 0, 1, 1, i]);
  r = E.whack(r.game, s.hole);
  eq([r.result.type, r.result.kind, r.result.points, r.game.score, r.game.streak], ['hit', 'helmet', 2, 2, 2]);
});

test('chuột đội mũ bị hất mũ sát giờ lặn thì ở lại thêm một chút (không quá HELMET_GRACE_MS)', () => {
  let g = E.newGame(5);
  const i = firstOf(g, 'helmet');
  const s = g.spawns[i];
  g = goTo(g, s.end - 10);
  const r = E.whack(g, s.hole);
  ok(r.game.end[i] > s.end && r.game.end[i] <= s.end + E.HELMET_GRACE_MS, 'không kéo dài đúng');
  g = goTo(r.game, s.end + 100);
  eq(E.visibleAt(g, s.hole), i, 'chưa lặn');
  g = goTo(g, r.game.end[i]);
  eq(E.visibleAt(g, s.hole), -1, 'đã lặn');
});

test('đập bom: −5 (không âm), combo về 0, choáng STUN_MS; trong lúc choáng đập không có tác dụng', () => {
  let g = E.newGame(5);
  const i = firstOf(g, 'bomb');
  const s = g.spawns[i];
  g = goTo(g, s.at);
  g = Object.assign({}, g, { score: 12, streak: 7 });
  let r = E.whack(g, s.hole);
  eq([r.result.type, r.result.penalty, r.game.score, r.game.streak, r.game.bombs, r.game.stunUntil], ['bomb', 5, 7, 0, 1, s.at + E.STUN_MS]);
  eq([r.game.res[i], E.visibleAt(r.game, s.hole), E.isStunned(r.game)], [E.RES.BOMBED, -1, true]);
  // Choáng: cú đập (kể cả vào chuột đang trồi) không đổi gì
  const busy = E.advance(r.game, 500).game;
  for (let h = 0; h < 9; h++) {
    const w = E.whack(busy, h);
    eq(w.result.type, 'stunned');
    eq(E.toJSON(w.game), E.toJSON(busy));
  }
  // Hết choáng thì đập lại được
  const after = E.advance(r.game, E.STUN_MS).game;
  eq(E.isStunned(after), false);
  ok(E.whack(after, emptyHole(after)).result.type !== 'stunned', 'vẫn còn choáng');
  // Điểm không âm
  r = E.whack(Object.assign({}, g, { score: 2 }), s.hole);
  eq(r.game.score, 0);
});

test('bom không bị đập thì tự lặn, không tính là trốn', () => {
  let g = E.newGame(5);
  const i = firstOf(g, 'bomb');
  g = goTo(g, g.spawns[i].end);
  eq(g.res[i], E.RES.BOMB_GONE);
});

/* ---------------- Combo ---------------- */

test('hệ số combo: ×1 cho 5 cú đầu, ×2 từ cú thứ 6, ×3 từ cú thứ 11, tối đa ×3', () => {
  eq([0, 4, 5, 9, 10, 50, 1000].map(E.multiplier), [1, 1, 2, 2, 3, 3, 3]);
});

test('combo nhân điểm: chuỗi trúng liên tiếp nhân đúng hệ số, trượt thì về ×1', () => {
  let g = E.newGame(21);
  const got = [];
  for (let i = 0; i < 12; i++) {
    const s = g.spawns[i];
    g = goTo(g, Math.max(g.t, s.at));
    let r = E.whack(g, s.hole);
    if (r.result.type === 'helmet') r = E.whack(r.game, s.hole);
    if (r.result.type !== 'hit') break;
    got.push(r.result.mult);
    g = r.game;
  }
  eq(got, [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]);
  eq(g.bestStreak, 12);
  const miss = E.whack(g, emptyHole(g));
  eq([miss.game.streak, miss.game.bestStreak, E.multiplier(miss.game.streak)], [0, 12, 1]);
});

/* ---------------- Đồng hồ và kết thúc ---------------- */

test('đồng hồ: hết 60 giây thì kết thúc, không vượt quá, sau đó đập hay tiến đều không đổi gì', () => {
  const g0 = E.newGame(3);
  let r = E.advance(g0, 59990);
  eq([E.isOver(r.game), E.timeLeft(r.game)], [false, 10]);
  r = E.advance(r.game, 500);
  ok(r.events.some((e) => e.type === 'over'), 'không báo hết giờ');
  eq([E.isOver(r.game), r.game.t, E.timeLeft(r.game)], [true, 60000, 0]);
  const g = r.game;
  eq(E.whack(g, 0).result.type, 'over');
  eq(E.whack(g, 0).game, g);
  eq(E.advance(g, 1000).game, g);
  eq(E.advance(g, 1000).events, []);
  // Hết giờ thì mọi lượt đều đã xong (không còn chuột lơ lửng)
  ok(g.res.every((x) => x !== E.RES.PENDING), 'còn lượt chưa xong');
});

test('tất định: cùng hạt giống + cùng chuỗi thao tác cho cùng điểm cuối', () => {
  const play = (seed) => {
    let g = E.newGame(seed);
    // thao tác cố định: mỗi 137 ms đập hố (t / 137) % 9
    while (!E.isOver(g)) {
      g = E.advance(g, 137).game;
      g = E.whack(g, Math.floor(g.t / 137) % 9).game;
    }
    return E.toJSON(g);
  };
  const a = play(77);
  eq(a, play(77));
  ok(a.score >= 0 && a.whiffs > 0, 'chuỗi thao tác không có tác dụng');
});

test('chơi hoàn hảo: điểm cuối bằng perfectScore và không vượt trần MAX_SCORE (mọi mục tiêu ×3)', () => {
  for (let seed = 1; seed < 60; seed++) {
    let g = E.newGame(seed);
    g.spawns.forEach((s, i) => {
      if (s.kind === 'bomb') return;
      g = goTo(g, Math.max(g.t, s.at));
      g = E.whack(g, s.hole).game;
      if (s.kind === 'helmet') g = E.whack(g, s.hole).game;
      eq(g.res[i], E.RES.HIT);
    });
    g = goTo(g, E.ROUND_MS);
    ok(E.isOver(g));
    eq(g.score, E.perfectScore(seed), 'seed ' + seed);
    ok(g.score <= E.MAX_SCORE, 'vượt trần');
  }
});

test('MAX_SCORE = tổng điểm gốc của mọi mục tiêu × 3, như nhau ở mọi hạt giống', () => {
  const base = { mole: 1, gold: 5, helmet: 2, bomb: 0 };
  for (let seed = 1; seed < 100; seed++) {
    eq(E.schedule(seed).reduce((n, s) => n + base[s.kind] * 3, 0), E.MAX_SCORE);
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả mũ đã hất, choáng, chuột đã trốn)', () => {
  let g = E.newGame(5);
  const i = firstOf(g, 'helmet');
  g = goTo(g, g.spawns[i].at);
  g = E.whack(g, g.spawns[i].hole).game;
  const b = firstOf(g, 'bomb');
  g = goTo(g, g.spawns[b].at);
  g = E.whack(g, g.spawns[b].hole).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.spawns, g.spawns);
  // Chơi tiếp như nhau
  eq(E.toJSON(E.advance(back, 5000).game), E.toJSON(E.advance(g, 5000).game));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.advance(E.newGame(5), 15000).game);
  ok(E.fromJSON(good), 'ván tốt bị từ chối');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const n = good.res.length;
  [
    null,
    1,
    'x',
    {},
    bad({ v: 99 }),
    bad({ seed: 'a' }),
    bad({ seed: -1 }),
    bad({ t: -5 }),
    bad({ t: 60001 }),
    bad({ t: 1.5 }),
    bad({ score: -1 }),
    bad({ score: E.MAX_SCORE + 1 }),
    bad({ streak: -1 }),
    bad({ stunUntil: 'x' }),
    bad({ res: good.res.slice(1) }),
    bad({ res: good.res.map(() => 9) }),
    bad({ hp: new Array(n).fill(5) }),
    bad({ end: good.end.map((x) => x + 99999) }),
    bad({ res: new Array(n).fill(0) }), // lượt đã qua mà vẫn "đang chờ"
  ].forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu ' + k + ': ' + String(JSON.stringify(raw)).slice(0, 60)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
