/* Kiểm tra engine Phản Xạ: chạy `node test.js`
 * - Ngắm bắn: cỡ sân, sinh mục tiêu tất định (trong sân, không chồng nhau, đều bắn trúng được), vòng đời co / biến mất,
 *   trúng / trượt theo bán kính lúc chạm, điểm chính xác + tốc độ + hệ số chuỗi, mất chuỗi, nhịp tăng dần, hết 60 giây
 * - Đo phản ứng: đỏ → xanh trong 1,5–4 s, chạm sớm / đoán trước (< 100 ms) là lỗi và làm lại, quá chậm,
 *   đủ 5 lần thì xong, trung bình + phạt, điểm quy đổi, ngắt giữa chừng
 * - Tất định theo hạt giống + chuỗi chạm; lưu / khôi phục và từ chối dữ liệu hỏng
 * - Bot chơi giỏi không vượt ngưỡng chống gian lận trong game.json
 */
const E = require('./engine.js');
const manifest = require('./game.json');

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

/** Chạy ván ngắm bắn không chạm tới hết giờ, gom mọi sự kiện. */
function runIdle(seed, w, h) {
  let g = E.newGame(seed, { w: w || 100, h: h || 100 });
  const events = [];
  while (!E.isOver(g)) {
    const r = E.advance(g, g.t + 10);
    g = r.game;
    events.push(...r.events.map((e) => Object.assign({ at: g.t }, e)));
  }
  return { g, events };
}

/** Lấy ván ngắm bắn ngay khi mục tiêu đầu tiên vừa hiện. */
function firstTarget(seed) {
  const g = E.advance(E.newGame(seed, { w: 140, h: 100 }), E.FIRST_AT).game;
  return { g, o: g.targets[0] };
}

/* ======================== Cỡ sân ======================== */

test('cỡ sân: cạnh ngắn 100, cạnh dài theo tỉ lệ khung, kẹp 100–160', () => {
  eq(E.shape(390, 600), { w: 100, h: 154 });
  eq(E.shape(1000, 600), { w: 160, h: 100 });
  eq(E.shape(500, 500), { w: 100, h: 100 });
  eq(E.shape(700, 600), { w: 117, h: 100 });
  eq(E.shape(0, 0), { w: 100, h: 100 });
});

test('ván mới: sân lạ thì về 100×100, chưa có mục tiêu, đủ 60 giây', () => {
  const g = E.newGame(5, { w: 300, h: 100 });
  eq([g.w, g.h, g.t, g.targets.length, g.score, E.timeLeft(g), E.isOver(g)], [100, 100, 0, 0, 0, 60000, false]);
});

/* ======================== Sinh mục tiêu ======================== */

test('mục tiêu đầu tiên hiện đúng lúc FIRST_AT, cỡ và tuổi thọ theo nhịp đầu ván', () => {
  let g = E.newGame(1, { w: 100, h: 100 });
  g = E.advance(g, E.FIRST_AT - 1).game;
  eq(g.targets.length, 0);
  const { o } = firstTarget(1);
  eq([o.at, o.r, o.life], [E.FIRST_AT, E.radiusFor(E.FIRST_AT), E.lifeFor(E.FIRST_AT)]);
});

test('mục tiêu luôn nằm trọn trong sân, không chồng nhau, không quá MAX_LIVE (nhiều hạt giống, nhiều cỡ sân)', () => {
  [[100, 100], [100, 160], [160, 100], [133, 100]].forEach(([w, h]) => {
    for (let seed = 1; seed <= 40; seed++) {
      let g = E.newGame(seed * 7919, { w, h });
      while (!E.isOver(g)) {
        g = E.advance(g, g.t + 25).game;
        ok(g.targets.length <= E.MAX_LIVE, 'quá nhiều mục tiêu');
        g.targets.forEach((o, i) => {
          ok(o.x - o.r >= 0 && o.x + o.r <= w && o.y - o.r >= 0 && o.y + o.r <= h, 'ra ngoài sân ' + JSON.stringify(o));
          g.targets.slice(i + 1).forEach((p) => ok(Math.hypot(o.x - p.x, o.y - p.y) >= o.r + p.r, 'chồng nhau'));
        });
      }
    }
  });
});

test('mọi mục tiêu đều bắn trúng được: bot chạm tâm ngay khi hiện thì không sót cái nào', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let g = E.newGame(seed, { w: 150, h: 100 });
    while (!E.isOver(g)) {
      g = E.advance(g, g.t + 5).game;
      while (g.targets.length) {
        const o = g.targets[0];
        const r = E.tap(g, g.t, o.x, o.y);
        eq(r.result.type, 'hit');
        g = r.game;
      }
    }
    eq([g.expired, g.misses, g.hits > 100], [0, 0, true], 'hạt giống ' + seed);
  }
});

test('tất định: cùng hạt giống + cùng chuỗi chạm → cùng ván; khác hạt giống → khác vị trí', () => {
  const play = (seed, step) => {
    let g = E.newGame(seed, { w: 120, h: 100 });
    let k = 0;
    while (!E.isOver(g)) {
      g = E.advance(g, g.t + step).game;
      if (g.targets.length && ++k % 3) {
        const o = g.targets[0];
        g = E.tap(g, g.t + 120, o.x + 1, o.y - 1).game;
      } else if (k % 7 === 0) g = E.tap(g, g.t + 50, 3, 3).game;
    }
    return JSON.stringify(E.toJSON(g));
  };
  eq(play(42, 10), play(42, 10));
  ok(play(42, 10) !== play(43, 10), 'khác hạt giống mà giống nhau');
  // Mô phỏng theo sự kiện: bước đồng hồ khác nhau mà chạm ở cùng thời điểm vẫn ra cùng kết quả
  const a = runIdle(9).events.map((e) => [e.type, e.id, e.x, e.y]);
  let g = E.newGame(9, { w: 100, h: 100 });
  const b = [];
  while (!E.isOver(g)) {
    const r = E.advance(g, g.t + 37);
    g = r.game;
    b.push(...r.events.map((e) => [e.type, e.id, e.x, e.y]));
  }
  eq(a, b);
});

/* ======================== Vòng đời ======================== */

test('mục tiêu co đều từ bán kính ban đầu xuống 0 rồi biến mất, làm mất chuỗi', () => {
  const { g, o } = firstTarget(3);
  eq(E.radiusAt(o, o.at), o.r);
  ok(Math.abs(E.radiusAt(o, o.at + o.life / 2) - o.r / 2) < 1e-9, 'nửa đời phải còn nửa bán kính');
  eq(E.radiusAt(o, o.at + o.life), 0);
  // Có chuỗi 1 rồi để mục tiêu sau biến mất
  let n = E.tap(g, g.t + 100, o.x, o.y).game;
  eq(n.streak, 1);
  let r;
  do {
    r = E.advance(n, n.t + 10);
    n = r.game;
  } while (!r.events.some((e) => e.type === 'spawn'));
  const p = n.targets[0];
  r = E.advance(n, p.at + p.life);
  const ex = r.events.find((e) => e.type === 'expire');
  ok(ex && ex.id === p.id && ex.lost, 'phải có sự kiện biến mất làm mất chuỗi');
  eq([r.game.expired, r.game.streak, r.game.bestStreak], [1, 0, 1]);
});

test('trúng / trượt theo bán kính tại thời điểm chạm', () => {
  const { g, o } = firstTarget(11);
  const half = o.at + o.life / 2; // lúc này bán kính còn r/2
  eq(E.tap(g, o.at, o.x + o.r * 0.95, o.y).result.type, 'hit', 'mới hiện: sát mép vẫn trúng');
  eq(E.tap(g, half, o.x + o.r * 0.6, o.y).result.type, 'miss', 'đã co: cùng chỗ đó thành trượt');
  eq(E.tap(g, half, o.x, o.y + o.r * 0.45).result.type, 'hit');
  eq(E.tap(g, o.at + o.life + 1, o.x, o.y).result.type, 'miss', 'đã biến mất');
  const m = E.tap(g, o.at, o.x + o.r * 1.05, o.y);
  eq([m.result.type, m.game.misses, m.game.targets.length], ['miss', 1, 1], 'trượt không xóa mục tiêu');
});

test('chạm khi sân trống cũng tính là trượt', () => {
  const g = E.newGame(2, { w: 100, h: 100 });
  const r = E.tap(g, 100, 50, 50);
  eq([r.result.type, r.game.misses, r.game.t], ['miss', 1, 100]);
});

/* ======================== Điểm ======================== */

test('điểm: tâm + ngay khi hiện = 100; xa tâm ít điểm hơn; chạm muộn ít điểm hơn', () => {
  const { g, o } = firstTarget(21);
  const center0 = E.tap(g, o.at, o.x, o.y).result;
  eq([center0.points, center0.mult, center0.age], [100, 1, 0]);
  const edge0 = E.tap(g, o.at, o.x + o.r * 0.9, o.y).result;
  eq(edge0.points, 10 + Math.round(45 * 0.1) + 45);
  const centerLate = E.tap(g, o.at + o.life / 2, o.x, o.y).result;
  eq(centerLate.points, 10 + 45 + Math.round(45 * 0.5));
  ok(center0.points > centerLate.points && center0.points > edge0.points, 'thứ tự điểm sai');
});

test('chuỗi trúng nhân hệ số ×1 → ×5 mỗi 5 lần; trượt về ×1', () => {
  eq([0, 4, 5, 9, 10, 19, 20, 99].map(E.multiplier), [1, 1, 2, 2, 3, 4, 5, 5]);
  let g = E.newGame(8, { w: 100, h: 100 });
  const mults = [];
  while (mults.length < 7) {
    g = E.advance(g, g.t + 10).game;
    if (g.targets.length) {
      const o = g.targets[0];
      const r = E.tap(g, g.t, o.x, o.y);
      mults.push(r.result.mult);
      eq(r.result.points, 100 * r.result.mult);
      g = r.game;
    }
  }
  eq(mults, [1, 1, 1, 1, 1, 2, 2]);
  eq([g.streak, g.bestStreak, g.score], [7, 7, 900]);
  const m = E.tap(g, g.t + 1, -50, -50);
  eq([m.result.type, m.result.lost, m.game.streak, m.game.bestStreak], ['miss', true, 0, 7]);
});

test('dọn sạch sân thì đợt sau tới sớm (sau gap), không thì chờ hết nhịp', () => {
  const { g, o } = firstTarget(30);
  const hit = E.tap(g, o.at + 200, o.x, o.y).game;
  eq(hit.nextAt, o.at + 200 + E.gapFor(o.at + 200));
  eq(g.nextAt, o.at + E.intervalFor(o.at));
});

/* ======================== Nhịp tăng dần ======================== */

test('nhịp tăng dần: nhỏ hơn, sống ngắn hơn, đợt dày hơn, có đợt hai mục tiêu từ giây 15', () => {
  ok(E.radiusFor(0) > E.radiusFor(30000) && E.radiusFor(30000) > E.radiusFor(60000), 'bán kính');
  ok(E.lifeFor(0) > E.lifeFor(30000) && E.lifeFor(30000) > E.lifeFor(60000), 'tuổi thọ');
  ok(E.intervalFor(0) > E.intervalFor(60000) && E.gapFor(0) > E.gapFor(60000), 'nhịp');
  eq([E.pairChance(14000), E.pairChance(15000) > 0, E.pairChance(60000)], [0, true, 0.5]);
  let pairsEarly = 0;
  let pairsLate = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const spawns = runIdle(seed).events.filter((e) => e.type === 'spawn');
    const byTime = {};
    spawns.forEach((e) => { byTime[e.at] = (byTime[e.at] || 0) + 1; });
    Object.keys(byTime).forEach((t) => {
      if (byTime[t] < 2) return;
      if (+t < 15000) pairsEarly++;
      else pairsLate++;
    });
  }
  eq(pairsEarly, 0, 'không có đôi trước giây 15');
  ok(pairsLate > 30, 'phải có đợt hai mục tiêu: ' + pairsLate);
});

test('mục tiêu 36 px trên điện thoại: bán kính nhỏ nhất ≥ 5% cạnh ngắn', () => {
  ok(E.radiusFor(E.ROUND_MS) >= 5, 'bán kính cuối ' + E.radiusFor(E.ROUND_MS));
});

/* ======================== Hết giờ ======================== */

test('hết 60 giây: hết ván đúng một lần, xóa mục tiêu, chạm sau đó không đổi gì', () => {
  const { g, events } = runIdle(77);
  eq([g.t, g.over, g.targets.length, g.score], [60000, true, 0, 0]);
  eq(events.filter((e) => e.type === 'over').length, 1);
  ok(g.expired > 40, 'phải có nhiều mục tiêu biến mất: ' + g.expired);
  const r = E.tap(g, 61000, 50, 50);
  eq([r.result.type, r.game], ['over', g]);
  eq(E.advance(g, 70000).game, g);
  // Chạm sau 60 giây khi ván chưa cập nhật: tiến tới 60 giây rồi báo hết
  const live = E.advance(E.newGame(77, { w: 100, h: 100 }), 59990).game;
  const late = E.tap(live, 60500, 50, 50);
  eq([late.result.type, late.game.over, late.game.t, late.game.misses], ['over', true, 60000, 0]);
});

test('tổng kết: điểm, độ chính xác, phản ứng trung bình, chuỗi dài nhất', () => {
  const { g, o } = firstTarget(5);
  let n = E.tap(g, o.at + 300, o.x, o.y).game;
  n = E.tap(n, n.t + 10, -9, -9).game;
  const s = E.summary(n);
  eq([s.hits, s.misses, s.accuracy, s.avgMs, s.bestStreak, s.score], [1, 1, 0.5, 300, 1, n.score]);
  eq(E.summary(E.newGame(1, {})).accuracy, null);
  eq(E.score(n), n.score);
});

test('hasProgress: chưa chạm và chưa tới 1 giây thì chưa tính ván', () => {
  const g = E.newGame(1, { w: 100, h: 100 });
  eq(E.hasProgress(E.advance(g, 999).game), false);
  eq(E.hasProgress(E.advance(g, 1000).game), true);
  eq(E.hasProgress(E.tap(g, 10, 1, 1).game), true);
  eq(E.hasProgress(runIdle(1).g), false, 'ván đã xong');
});

/* ======================== Đo phản ứng ======================== */

const R = E.REACTION;
const newR = (seed) => E.newGame(seed, { mode: 'reaction' });

test('đo phản ứng: đỏ chờ ngẫu nhiên 1,5–4 s rồi xanh, theo hạt giống', () => {
  const waits = [];
  for (let seed = 1; seed <= 200; seed++) {
    const g = newR(seed);
    eq(g.phase, 'red');
    ok(g.greenAt >= R.WAIT_MIN && g.greenAt <= R.WAIT_MAX, 'chờ ' + g.greenAt);
    waits.push(g.greenAt);
  }
  ok(Math.min(...waits) < 1800 && Math.max(...waits) > 3700, 'chờ phải trải đều');
  eq(newR(5).greenAt, newR(5).greenAt);
  const g = newR(5);
  eq(E.advance(g, g.greenAt - 1).game.phase, 'red');
  const r = E.advance(g, g.greenAt);
  eq([r.game.phase, r.events.map((e) => e.type)], ['green', ['green']]);
});

test('đo phản ứng: chạm khi đỏ là lỗi "quá sớm", lần đó làm lại với giờ chờ mới', () => {
  const g = newR(9);
  const r = E.press(g, 1000);
  eq([r.result.type, r.game.fouls, r.game.trials.length, r.game.phase, r.game.phaseEnd], ['early', 1, 0, 'foul', 1000 + R.FOUL_MS]);
  eq(E.press(r.game, 1500).result.type, 'none', 'đang báo lỗi: chạm không tính');
  const back = E.advance(r.game, 1000 + R.FOUL_MS);
  eq(back.game.phase, 'red');
  ok(back.game.greenAt >= 1000 + R.FOUL_MS + R.WAIT_MIN, 'giờ chờ mới tính từ lúc làm lại');
});

test('đo phản ứng: < 100 ms sau khi xanh là đoán trước (lỗi), từ 100 ms là hợp lệ', () => {
  const g = newR(12);
  const guess = E.press(g, g.greenAt + 99);
  eq([guess.result.type, guess.result.ms, guess.game.fouls, guess.game.trials], ['guess', 99, 1, []]);
  const okR = E.press(g, g.greenAt + 100);
  eq([okR.result.type, okR.result.ms, okR.game.trials, okR.game.phase], ['ok', 100, [100], 'result']);
  const fast = E.press(g, g.greenAt + 237.4);
  eq(fast.game.trials, [237]);
});

test('đo phản ứng: xanh quá lâu không chạm thì ghi "quá chậm"', () => {
  const g = newR(14);
  const r = E.advance(g, g.greenAt + R.TIMEOUT);
  eq([r.game.trials, r.game.last, r.game.phase], [[R.TIMEOUT], { kind: 'slow', ms: R.TIMEOUT }, 'result']);
});

/** Bot đo phản ứng: mỗi lần chạm sau `ms` kể từ khi xanh; `early` = số lần chạm sớm ở đầu ván. */
function reactionRun(seed, msList, early) {
  let g = newR(seed);
  let fouls = early || 0;
  let i = 0;
  while (!E.isOver(g)) {
    if (g.phase === 'red') {
      if (fouls > 0) {
        fouls--;
        g = E.press(g, g.t + 200).game;
      } else g = E.press(g, g.greenAt + msList[i++ % msList.length]).game;
    } else g = E.advance(g, g.t + 10).game;
  }
  return g;
}

test('đo phản ứng: đủ 5 lần thì xong; trung bình + 50 ms phạt mỗi lỗi; điểm = 1000 − trung bình', () => {
  const g = reactionRun(3, [200, 250, 300, 210, 240]);
  eq([g.over, g.phase, g.trials, E.reactionAvg(g), E.score(g)], [true, 'done', [200, 250, 300, 210, 240], 240, 760]);
  const f = reactionRun(3, [200, 250, 300, 210, 240], 2);
  eq([f.fouls, E.reactionAvg(f), E.score(f)], [2, 340, 660]);
  eq(E.press(g, g.t + 5000).result.type, 'none', 'xong rồi thì chạm không đổi gì');
  eq(E.score(reactionRun(4, [1500])), 0, 'quá chậm hết thì điểm 0, không âm');
  eq(E.score(newR(1)), 0, 'chưa xong: điểm 0');
  eq(E.score(reactionRun(5, [100])), 900, 'trần điểm = 1000 − 100');
});

test('đo phản ứng: thời gian ván ngắn nhất ≥ 5 × (1,5 s + 100 ms) + 4 × 1 s', () => {
  let min = Infinity;
  for (let seed = 1; seed <= 200; seed++) min = Math.min(min, reactionRun(seed, [100]).t);
  ok(min >= 5 * (R.WAIT_MIN + R.TOO_FAST) + 4 * R.RESULT_MS, 'ván ngắn nhất ' + min);
});

test('đo phản ứng: ngắt khi đang đỏ / xanh thì đo lại lần đó, không tính lỗi', () => {
  const g = E.advance(newR(20), 1000).game;
  const i = E.interrupt(g);
  eq([i.phase, i.fouls, i.trials.length], ['red', 0, 0]);
  ok(i.greenAt >= 1000 + R.WAIT_MIN && i.greenAt !== g.greenAt, 'giờ chờ mới');
  const green = E.advance(g, g.greenAt + 50).game;
  eq(E.interrupt(green).phase, 'red');
  const res = E.press(green, green.t + 200).game;
  eq(E.interrupt(res), res, 'đang hiện kết quả: không đổi');
});

test('đo phản ứng: hasProgress và lệnh của chế độ khác không có tác dụng', () => {
  const g = newR(2);
  eq(E.hasProgress(g), false);
  eq(E.hasProgress(E.press(g, 300).game), true);
  eq(E.tap(g, 100, 1, 1).result.type, 'none');
  const c = E.newGame(2, {});
  eq(E.press(c, 100).game, c);
  eq(E.interrupt(c), c);
});

test('đo phản ứng tất định theo hạt giống + chuỗi chạm', () => {
  eq(JSON.stringify(E.toJSON(reactionRun(31, [180, 220], 1))), JSON.stringify(E.toJSON(reactionRun(31, [180, 220], 1))));
  ok(reactionRun(31, [180]).t !== reactionRun(32, [180]).t, 'khác hạt giống phải khác giờ chờ');
});

/* ======================== Lưu / khôi phục ======================== */

test('lưu rồi khôi phục giữ nguyên ván (ngắm bắn giữa chừng, đo phản ứng các pha) và chơi tiếp giống hệt', () => {
  let g = E.advance(E.newGame(99, { w: 160, h: 100 }), 20000).game;
  if (g.targets.length) g = E.tap(g, g.t + 50, g.targets[0].x, g.targets[0].y).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.advance(back, 40000).game, E.advance(g, 40000).game);
  const over = runIdle(4).g;
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(over)))), over);
  let r = newR(7);
  const states = [r];
  r = E.press(r, 500).game; // lỗi
  states.push(r);
  r = E.advance(r, r.phaseEnd + 10).game;
  states.push(r);
  r = E.advance(r, r.greenAt + 20).game; // xanh
  states.push(r);
  r = E.press(r, r.t + 200).game; // kết quả
  states.push(r);
  states.push(reactionRun(7, [190]));
  states.forEach((s) => eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s)))), s, s.phase));
});

test('từ chối dữ liệu hỏng', () => {
  let g = E.advance(E.newGame(99, { w: 100, h: 140 }), 9000).game;
  while (!g.targets.length) g = E.advance(g, g.t + 10).game;
  const good = JSON.parse(JSON.stringify(E.toJSON(g)));
  const bad = (patch) => Object.assign({}, good, patch);
  const badT = (patch) => bad({ targets: [Object.assign({}, good.targets[0], patch)] });
  [
    null, 1, 'x', {}, bad({ v: 2 }), bad({ mode: 'zen' }), bad({ seed: -1 }), bad({ rng: 1.5 }),
    bad({ w: 200 }), bad({ w: 120, h: 120 }), bad({ t: 60001 }), bad({ t: -1 }), bad({ score: -5 }), bad({ score: 1e9 }),
    bad({ streak: 1e6 }), bad({ bestStreak: 0, streak: 1 }), bad({ over: true }), bad({ targets: 'x' }),
    bad({ targets: [good.targets[0], good.targets[0]] }), bad({ hits: good.nextId + 1 }), bad({ misses: '0' }),
    badT({ r: 50 }), badT({ life: 99999 }), badT({ x: -3 }), badT({ y: 500 }), badT({ at: g.t + 10 }), badT({ at: 0 }), badT({ id: 999 }),
  ].forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i + ' ' + JSON.stringify(raw)));
  const rg = JSON.parse(JSON.stringify(E.toJSON(newR(3))));
  const rb = (patch) => Object.assign({}, rg, patch);
  [
    rb({ phase: 'blue' }), rb({ trials: [50] }), rb({ trials: [200, 200, 200, 200, 200, 200] }), rb({ trials: [200, 200, 200, 200, 200] }),
    rb({ over: true }), rb({ fouls: -1 }), rb({ greenAt: 0 }), rb({ greenAt: 99999 }), rb({ phase: 'green' }), rb({ last: { kind: 'x' } }),
    rb({ phase: 'result', phaseEnd: 0 }),
  ].forEach((raw, i) => eq(E.fromJSON(raw), null, 'phản ứng mẫu ' + i));
});

/* ======================== Ngưỡng chống gian lận ======================== */

/** Bot ngắm bắn tất định: phản ứng `rt` ms + thời gian di chuột theo Fitts, sai số vị trí `err` × bán kính. */
function aimBot(seed, rt, err) {
  let s = seed * 2654435761 >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  let g = E.newGame(seed, { w: 140, h: 100 });
  let cx = 70;
  let cy = 50;
  let ready = 0; // bot rảnh tay từ lúc này
  while (!E.isOver(g)) {
    const live = g.targets.filter((o) => E.radiusAt(o, Math.max(g.t, ready)) > 0);
    if (!live.length) {
      g = E.advance(g, g.t + 5).game;
      continue;
    }
    const o = live.reduce((a, b) => (Math.hypot(a.x - cx, a.y - cy) <= Math.hypot(b.x - cx, b.y - cy) ? a : b));
    const d = Math.hypot(o.x - cx, o.y - cy);
    const at = Math.max(ready, o.at + rt) + 60 + 90 * Math.log2(1 + d / (2 * o.r));
    const rr = E.radiusAt(o, at);
    const x = o.x + gauss() * err * rr;
    const y = o.y + gauss() * err * rr;
    g = E.tap(g, at, x, y).game;
    cx = x;
    cy = y;
    ready = at;
  }
  return g;
}

test('bot ngắm rất giỏi (phản ứng 150 ms, sai số nhỏ) không vượt max_score / max_score_per_sec; ván đủ dài', () => {
  const mode = manifest.server.modes.find((m) => m.key === 'classic');
  let best = 0;
  for (let seed = 1; seed <= 30; seed++) best = Math.max(best, aimBot(seed, 150, 0.2).score);
  ok(best <= mode.rules.max_score, 'bot ' + best + ' > max_score ' + mode.rules.max_score);
  ok(best / (E.ROUND_MS / 1000) <= mode.rules.max_score_per_sec, 'tốc độ điểm vượt ngưỡng');
  ok(mode.rules.min_duration_ms <= E.ROUND_MS, 'min_duration_ms phải ≤ 60 giây');
  const rx = manifest.server.modes.find((m) => m.key === 'reaction');
  eq(rx.rules.max_score, R.BASE - R.TOO_FAST);
  let min = Infinity;
  for (let seed = 1; seed <= 100; seed++) min = Math.min(min, reactionRun(seed, [100]).t);
  ok(rx.rules.min_duration_ms <= min, 'min_duration_ms của reaction ' + rx.rules.min_duration_ms + ' > ván nhanh nhất ' + min);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
