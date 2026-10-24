/* Kiểm tra engine Mê Cung Ma: chạy `node test.js`
 * - Mê cung: đúng cỡ, đối xứng, liên thông, không ngõ cụt, không ô trống 2×2, đủ chuồng / cửa / đường hầm
 * - Di chuyển trên lưới, đệm hướng, quay đầu ngay, rẽ trễ tay, va tường, đường hầm
 * - Ăn đốm / đốm lớn / ăn ma (chuỗi điểm nhân đôi), trái cây, mạng thưởng
 * - Va ma mất mạng, hết mạng hết ván, ăn hết đốm sang màn (mê cung khác, nhanh hơn)
 * - AI ma: tính cách từng con, tản / đuổi xen kẽ, không đi xuyên tường, không quay đầu sai luật, mắt ma về chuồng
 * - Tất định theo seed + chuỗi lệnh, lưu / khôi phục chạy tiếp y hệt, từ chối dữ liệu hỏng
 * - Bot chơi giỏi qua được màn 1 (mê cung chơi được)
 */
const E = require('./engine.js');

const { U, COLS, ROWS } = E;
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
  if (!v) throw new Error(msg || 'sai');
}

/* ---------------- Tiện ích ---------------- */
const run = (g, n) => { for (let i = 0; i < n; i++) E.step(g); return g; };
/** Bỏ qua "Sẵn sàng" để vào chơi ngay. */
function playing(g) {
  while (g.phase !== 'play') E.step(g);
  E.drain(g);
  return g;
}
/** Nhốt cả 4 con ma trong chuồng (không bao giờ thả) để thử riêng đom đóm. */
function calm(g) {
  const m = E.mazeOf(g);
  g.ghosts.forEach((gh) => {
    gh.state = 'house';
    gh.x = m.house.c * U;
    gh.y = m.house.r * U;
  });
  g.lifeT = -1e9;
  return g;
}
function place(e, c, r, dir) {
  e.x = c * U;
  e.y = r * U;
  if (dir) e.dir = dir;
  return e;
}
/** PRNG nhỏ cho chuỗi lệnh ngẫu nhiên trong test. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/* ---------------- Bot (dùng cho test chơi được; cùng thuật toán với bot đo điểm/giây) ---------------- */
/** Hướng đi đầu tiên theo BFS tới mục tiêu gần nhất (ma sợ khi còn đủ thời gian, không thì đốm / trái cây), né ô quanh ma thường. */
function greedy(g) {
  const m = E.mazeOf(g);
  const p = g.player;
  const sc = E.tileC(p);
  const sr = E.tileR(p);
  const bad = new Set();
  const prey = new Set();
  g.ghosts.forEach((gh) => {
    if (gh.state !== 'active' && gh.state !== 'leave') return;
    const k = E.tileR(gh) * COLS + E.tileC(gh);
    if (gh.fright && g.frightT > 45) prey.add(k);
    else if (!gh.fright || g.frightT <= 45) {
      bad.add(k);
      for (const d of E.ORDER) bad.add(((E.tileR(gh) + E.DIRS[d][1]) * COLS) + ((E.tileC(gh) + E.DIRS[d][0] + COLS) % COLS));
    }
  });
  const fruitK = g.fruit ? m.fruit.r * COLS + m.fruit.c : -1;
  const isGoal = (k) => (prey.size ? prey.has(k) : g.dots[k] > 0 || k === fruitK);
  const seen = new Map([[sr * COLS + sc, null]]);
  let q = [[sc, sr, null]];
  while (q.length) {
    const nq = [];
    for (const [c, r, first] of q) {
      for (const d of E.ORDER) {
        const nc = (c + E.DIRS[d][0] + COLS) % COLS;
        const nr = r + E.DIRS[d][1];
        const k = nr * COLS + nc;
        if (seen.has(k) || !E.open(m, nc, nr) || bad.has(k)) continue;
        const f = first || d;
        seen.set(k, f);
        if (isGoal(k)) return f;
        nq.push([nc, nr, f]);
      }
    }
    q = nq;
  }
  return null;
}
/** Chạy bản sao c thêm n bước; lệnh tham lam khi `greedyOn`. Trả điểm đánh giá nếu chết / qua màn, không thì null. */
function sim(c, n, greedyOn, lives0, k0) {
  for (let k = 0; k < n; k++) {
    if (greedyOn && k % 6 === 0) {
      const gd = greedy(c);
      if (gd) E.input(c, gd);
    }
    E.step(c);
    if (c.phase === 'dying' || c.lives < lives0 || c.over) return -1e6 + k0 + k; // chết càng muộn càng đỡ
    if (c.phase === 'clear') return 1e5 - k0 - k;
  }
  return null;
}
/** Tìm hướng tốt nhất: thử 4 hướng giữ trong `seg` bước, lặp `depth` tầng, tầng cuối đi tham lam tới hết H bước. */
function search(g, depth, H, seg, k0) {
  const pref = greedy(g);
  let best = pref;
  let bestV = -Infinity;
  for (const d of E.ORDER) {
    const c = E.clone(g);
    E.input(c, d);
    const s0 = g.score;
    let v = sim(c, seg, false, g.lives, k0);
    if (v == null) {
      if (depth > 1) v = search(c, depth - 1, H, seg, k0 + seg)[1];
      else v = sim(c, H - k0 - seg, true, g.lives, k0 + seg);
      if (v == null) v = (c.score - s0) * 10;
    }
    if (d === pref && v > -1e5) v += 5;
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return [best, bestV];
}
/** Bot quyết định một lần: tìm 2 tầng (mỗi tầng 200 ms), nhìn trước H bước. */
function botChoose(g, H = 120) {
  return search(g, 2, H, 12, 0)[0];
}
/** Bot chơi một ván: quyết định mỗi `react` bước (200 ms = 12 bước), nhìn trước H bước. */
function botPlay(seed, { react = 12, H = 120, maxSteps = 60 * 60 * 3, untilLevel = 99 } = {}) {
  const g = E.newGame(seed);
  const trace = [];
  while (!g.over && g.t < maxSteps && g.level < untilLevel) {
    if (g.t % react === 0 && g.phase === 'play') {
      const d = botChoose(g, H);
      if (d) E.input(g, d);
    }
    E.step(g);
    E.drain(g);
    if (g.t % 60 === 0) trace.push(g.score);
  }
  return { g, trace };
}

// Script đo điểm / giây dùng lại bot qua require('./test.js'): chỉ chạy test khi gọi trực tiếp
module.exports = { botPlay, botChoose, greedy };
if (require.main !== module) return;

/* ---------------- Mê cung ---------------- */
test('3 mê cung đúng cỡ 19×21, đối xứng trái phải, đủ chỗ xuất phát / trái cây / chuồng / cửa', () => {
  eq(E.MAZES.length, 3);
  E.PARSED.forEach((m, i) => {
    eq(m.rows.length, ROWS, 'số hàng ' + i);
    m.rows.forEach((row, r) => {
      eq(row.length, COLS, 'mê cung ' + i + ' hàng ' + r);
      for (let c = 0; c < COLS; c++) {
        const a = row[c];
        const b = row[COLS - 1 - c];
        if ('PFG'.indexOf(a) < 0 && 'PFG'.indexOf(b) < 0) eq(a, b, 'đối xứng ' + i + ' ' + c + ',' + r);
      }
    });
    ok(m.start && m.fruit && m.exit && m.door, 'thiếu P/F/G/cửa ở mê cung ' + i);
    eq([m.exit.c, m.exit.r + 1], [m.door.c, m.door.r], 'cửa ra ngay trên cửa chuồng');
    eq(m.slots.length, 3, 'chuồng 3 ô');
    eq(m.house, { c: m.door.c, r: m.door.r + 1 });
    eq(m.dots.filter((d) => d === 2).length, 4, '4 đốm lớn');
    ok(m.total > 140, 'đủ nhiều đốm');
    ok(m.tunnelRows.length >= 1, 'có đường hầm');
    m.tunnelRows.forEach((r) => ok(m.rows[r][0] === 'T' && m.rows[r][COLS - 1] === 'T', 'hầm thông hai mép'));
    // không có hàng nào khác hở mép
    for (let r = 0; r < ROWS; r++) if (m.tunnelRows.indexOf(r) < 0) ok(m.rows[r][0] === '#' && m.rows[r][COLS - 1] === '#', 'mép kín ' + r);
    ok(m.rows[0].split('').every((ch) => ch === '#') && m.rows[ROWS - 1].split('').every((ch) => ch === '#'), 'mép trên / dưới kín');
  });
});

test('mê cung liên thông, không ngõ cụt, hành lang rộng đúng một ô (không có khối trống 2×2)', () => {
  E.PARSED.forEach((m, i) => {
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (E.open(m, c, r)) cells.push([c, r]);
    cells.forEach(([c, r]) => {
      const n = E.ORDER.filter((d) => E.open(m, c + E.DIRS[d][0], r + E.DIRS[d][1])).length;
      ok(n >= 2, 'ngõ cụt ở mê cung ' + i + ' ô ' + c + ',' + r);
      if (c + 1 < COLS) ok(!(E.open(m, c + 1, r) && E.open(m, c, r + 1) && E.open(m, c + 1, r + 1)), '2×2 ở ' + i + ' ' + c + ',' + r);
    });
    const seen = new Set([cells[0].join()]);
    const q = [cells[0]];
    while (q.length) {
      const [c, r] = q.pop();
      for (const d of E.ORDER) {
        const nc = (c + E.DIRS[d][0] + COLS) % COLS;
        const nr = r + E.DIRS[d][1];
        if (E.open(m, nc, nr) && !seen.has(nc + ',' + nr)) {
          seen.add(nc + ',' + nr);
          q.push([nc, nr]);
        }
      }
    }
    eq(seen.size, cells.length, 'liên thông mê cung ' + i);
  });
});

test('mê cung xoay vòng theo màn: 1→A, 2→B, 3→C, 4→A', () => {
  eq([1, 2, 3, 4, 5].map(E.mazeIndex), [0, 1, 2, 0, 1]);
});

test('ván mới: 3 mạng, 0 điểm, "Sẵn sàng" 2 giây rồi mới chạy', () => {
  const g = E.newGame(5);
  eq([g.lives, g.score, g.level, g.phase, g.over], [3, 0, 1, 'ready', false]);
  const x0 = g.player.x;
  run(g, E.START_STEPS - 1);
  eq([g.phase, g.player.x], ['ready', x0], 'chưa chạy');
  E.step(g);
  eq(g.phase, 'play');
  ok(E.drain(g).some((e) => e.type === 'go'));
});

test('chơi tiếp sau tạm dừng: "Sẵn sàng" 1,5 giây, đom đóm đứng yên rồi mới chạy', () => {
  const g = calm(playing(E.newGame(5)));
  E.getReady(g);
  eq([g.phase, g.phaseT], ['ready', E.READY_STEPS]);
  const x = g.player.x;
  run(g, E.READY_STEPS - 1);
  eq(g.player.x, x);
  E.step(g);
  eq(g.phase, 'play');
  // đang chết / qua màn thì không đổi pha
  g.phase = 'dying';
  g.phaseT = 10;
  E.getReady(g);
  eq([g.phase, g.phaseT], ['dying', 10]);
});

/* ---------------- Di chuyển ---------------- */
test('đi thẳng theo hành lang, ăn đốm dọc đường, dừng khi gặp tường', () => {
  const g = calm(playing(E.newGame(1)));
  const P = E.params(1);
  eq([E.tileC(g.player), E.tileR(g.player), g.player.dir], [9, 15, 'left']);
  E.step(g);
  eq(g.player.x, 9 * U - P.player, 'tốc độ đúng');
  run(g, 120);
  // hàng 15 của mê cung A: tường ở cột 3, đom đóm dừng ở cột 4 sau khi ăn 5 đốm
  eq([g.player.x, g.player.y, g.player.moving], [4 * U, 15 * U, false]);
  eq([g.score, g.dotsEaten], [50, 5]);
});

test('đệm hướng: bấm lên trước khi tới ngã rẽ thì rẽ đúng ở ngã rẽ gần nhất', () => {
  const g = calm(playing(E.newGame(1)));
  E.input(g, 'up');
  run(g, 4);
  eq(g.player.dir, 'left', 'chưa tới ngã rẽ thì vẫn đi thẳng');
  eq(g.player.want, 'up', 'lệnh còn được giữ');
  run(g, 30);
  eq(g.player.x, 8 * U, 'rẽ ở cột 8');
  ok(g.player.y < 15 * U && g.player.dir === 'up');
  eq(g.player.want, null);
});

test('đệm hướng giữ qua ngã rẽ không đi được, rẽ ở ngã rẽ đầu tiên đi được', () => {
  const g = calm(playing(E.newGame(1)));
  E.input(g, 'down'); // cột 8, 7 có tường bên dưới; cột 6 mới xuống được
  run(g, 60);
  eq(g.player.x, 6 * U);
  ok(g.player.y > 15 * U && g.player.dir === 'down');
});

test('đứng trước tường: hướng không đi được thì đứng yên, bấm hướng đi được thì đi tiếp', () => {
  const g = calm(playing(E.newGame(1)));
  run(g, 120);
  eq(g.player.moving, false);
  E.input(g, 'left');
  run(g, 10);
  eq([g.player.x, g.player.moving], [4 * U, false], 'vẫn kẹt tường');
  E.input(g, 'up');
  run(g, 10);
  ok(g.player.y < 15 * U && g.player.x === 4 * U, 'đi lên');
});

test('quay đầu ngay lập tức, không chờ ngã rẽ', () => {
  const g = calm(playing(E.newGame(1)));
  run(g, 3);
  const x = g.player.x;
  E.input(g, 'right');
  E.step(g);
  eq(g.player.dir, 'right');
  eq(g.player.x, x + E.params(1).player);
});

test('rẽ trễ tay: vừa lướt qua tâm ngã rẽ một chút vẫn rẽ được', () => {
  const g = calm(playing(E.newGame(1)));
  g.player.x = 8 * U - 200; // đã qua tâm cột 8 (có lối lên) 0,2 ô
  E.input(g, 'up');
  E.step(g);
  eq([g.player.x, g.player.dir], [8 * U, 'up']);
  ok(g.player.y < 15 * U);
  // quá xa thì không kéo lại
  const h = calm(playing(E.newGame(1)));
  h.player.x = 8 * U - E.CORNER - 100;
  E.input(h, 'up');
  E.step(h);
  eq(h.player.dir, 'left');
  eq(h.player.want, 'up');
});

test('đường hầm: ra mép trái vào lại từ mép phải (và ngược lại)', () => {
  const g = calm(playing(E.newGame(1)));
  place(g.player, 2, 9, 'left');
  run(g, 30);
  ok(g.player.x > 14 * U && g.player.y === 9 * U, 'đã sang phải: ' + g.player.x);
  E.input(g, 'right');
  run(g, 30);
  ok(g.player.x < 4 * U && g.player.x >= -U / 2, 'quay lại bên trái: ' + g.player.x);
});

test('đom đóm và ma không bao giờ đi vào tường, luôn nằm trên trục ô (chơi ngẫu nhiên nhiều seed)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = E.newGame(seed);
    const rnd = lcg(seed * 77);
    for (let t = 0; t < 4000 && !g.over; t++) {
      if (t % 9 === 0) E.input(g, E.ORDER[Math.floor(rnd() * 4)]);
      E.step(g);
      E.drain(g);
      const m = E.mazeOf(g);
      const p = g.player;
      ok(E.open(m, E.tileC(p), E.tileR(p)), 'đom đóm trong tường seed ' + seed);
      ok(p.x % U === 0 || p.y % U === 0, 'đom đóm lệch trục');
      g.ghosts.forEach((gh, i) => {
        ok(gh.x % U === 0 || gh.y % U === 0, 'ma lệch trục ' + i);
        if (gh.state === 'active' || gh.state === 'eyes') ok(E.open(m, E.tileC(gh), E.tileR(gh)), 'ma ' + i + ' trong tường seed ' + seed + ' t ' + g.t);
      });
    }
  }
});

/* ---------------- Ăn ---------------- */
test('đốm 10 điểm, đốm lớn 50 điểm: ma sợ, con đang đi quay đầu ngay, ma trong chuồng cũng sợ', () => {
  const g = playing(E.newGame(3));
  const m = E.mazeOf(g);
  const s0 = g.score;
  run(g, 10);
  eq(g.score - s0, E.DOT, 'một đốm thường');
  // đom đóm sắp vào ô đốm lớn (1,15) của mê cung A; ma Lửa đang đi trái giữa hai tâm ô
  g.player.x = 2 * U - 400;
  g.player.y = 15 * U;
  g.player.dir = 'left';
  g.player.moving = true;
  const gh = g.ghosts[0];
  gh.x = 9 * U - 300;
  gh.y = 7 * U;
  gh.dir = 'left';
  const s1 = g.score;
  E.step(g);
  ok(E.drain(g).some((e) => e.type === 'power'), 'ăn đốm lớn');
  eq(g.score - s1, E.POWER);
  eq(g.frightT, E.params(1).frightSteps - 0);
  eq([gh.fright, gh.dir], [true, 'right'], 'sợ và quay đầu');
  eq(gh.x, 9 * U - 300 + E.params(1).fright, 'đi chậm khi sợ');
  eq(g.ghosts[3].fright, true, 'con trong chuồng cũng sợ');
  eq(m.dots[15 * COLS + 1], 2, 'mê cung gốc không bị đổi');
  eq(g.dots[15 * COLS + 1], 0);
});

test('ăn ma sợ liên tiếp: 200, 400, 800, 1600; ma thành mắt, game khựng nửa giây', () => {
  const g = calm(playing(E.newGame(4)));
  g.frightT = 600;
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const gh = g.ghosts[i];
    gh.state = 'active';
    gh.fright = true;
    gh.x = g.player.x;
    gh.y = g.player.y;
    gh.dir = 'right';
    const s0 = g.score;
    E.step(g);
    const ev = E.drain(g);
    const eaten = ev.filter((e) => e.type === 'ghost');
    eq(eaten.length, 1, 'ăn một con');
    pts.push(eaten[0].points);
    eq(g.score - s0, eaten[0].points + E.DOT * ev.filter((e) => e.type === 'dot').length, 'cộng đúng điểm');
    eq(gh.state, 'eyes');
    eq(g.phase, 'freeze');
    const x = g.player.x;
    run(g, E.EAT_STEPS - 1);
    eq(g.player.x, x, 'đứng yên khi khựng');
    E.step(g);
    eq(g.phase, 'play');
  }
  eq(pts, [200, 400, 800, 1600]);
  eq(g.chain, 4);
});

test('chuỗi ăn ma tính lại từ 200 ở đốm lớn tiếp theo', () => {
  const g = calm(playing(E.newGame(4)));
  g.chain = 3;
  place(g.player, 2, 15, 'left');
  run(g, 8);
  eq(g.chain, 0);
});

test('mắt ma chạy về chuồng, vào chuồng rồi hồi sinh và ra lại (không còn sợ)', () => {
  const g = calm(playing(E.newGame(6)));
  const gh = g.ghosts[0];
  gh.state = 'eyes';
  gh.fright = false;
  place(gh, 1, 19, 'right');
  gh.lc = -1;
  const seen = new Set();
  for (let i = 0; i < 900 && gh.state !== 'active'; i++) {
    E.step(g);
    seen.add(gh.state);
  }
  ok(seen.has('enter') && seen.has('leave'), 'đi qua enter → leave: ' + [...seen]);
  eq([gh.state, gh.fright], ['active', false]);
  const m = E.mazeOf(g);
  eq([E.tileC(gh), E.tileR(gh)], [m.exit.c, m.exit.r]);
});

test('trái cây hiện khi ăn 30% số đốm, ăn được điểm theo màn, tự biến mất sau 9,5 giây', () => {
  const g = calm(playing(E.newGame(7)));
  const m = E.mazeOf(g);
  g.dotsEaten = Math.floor(m.total * 0.3) - 1;
  run(g, 8); // đi tiếp trên hàng 15, ăn đốm (8,15)
  const ev = E.drain(g);
  ok(g.fruit && ev.some((e) => e.type === 'fruitShow'), 'trái cây hiện');
  eq(g.fruit.k, 0);
  place(g.player, m.fruit.c + 1, m.fruit.r, 'left');
  const s0 = g.score;
  run(g, 10);
  ok(E.drain(g).some((e) => e.type === 'fruit' && e.points === 100), 'ăn trái cây');
  eq(g.score - s0, 100);
  eq(g.fruit, null);
  // để yên thì biến mất
  const h = calm(playing(E.newGame(7)));
  h.fruit = { k: 2, t: E.FRUIT_STEPS };
  run(h, 120); // đom đóm kẹt tường ở hàng 15, không tới trái cây
  ok(h.fruit && h.fruit.t === E.FRUIT_STEPS - 120);
  run(h, E.FRUIT_STEPS);
  eq(h.fruit, null);
  // màn càng cao trái cây càng nhiều điểm, từ màn 8 giữ 5000
  const k = calm(playing(E.newGame(7)));
  k.level = 10; // màn 10 dùng lại mê cung A
  k.dotsEaten = Math.floor(E.mazeOf(k).total * 0.3) - 1;
  run(k, 8);
  eq([k.fruit && k.fruit.k, E.FRUITS[k.fruit.k]], [7, 5000]);
});

test('mạng thưởng một lần ở 10.000 điểm', () => {
  const g = calm(playing(E.newGame(8)));
  g.score = E.BONUS_LIFE - 5;
  run(g, 10);
  eq(g.lives, 4);
  ok(E.drain(g).some((e) => e.type === 'life'));
  g.score = 2 * E.BONUS_LIFE - 5;
  E.input(g, 'right');
  run(g, 30);
  eq(g.lives, 4, 'chỉ một lần');
});

/* ---------------- Mất mạng / hết ván / sang màn ---------------- */
test('va ma thường: mất mạng, về chỗ cũ, "Sẵn sàng" rồi chơi tiếp; hết 3 mạng là hết ván', () => {
  const g = playing(E.newGame(9));
  for (let life = 3; life >= 1; life--) {
    const gh = g.ghosts[0];
    gh.state = 'active';
    gh.fright = false;
    gh.x = g.player.x;
    gh.y = g.player.y;
    E.step(g);
    ok(E.drain(g).some((e) => e.type === 'die'), 'chết');
    eq(g.phase, 'dying');
    const score = g.score;
    run(g, E.DIE_STEPS);
    if (life > 1) {
      eq([g.lives, g.phase, g.over], [life - 1, 'ready', false]);
      const m = E.mazeOf(g);
      eq([E.tileC(g.player), E.tileR(g.player)], [m.start.c, m.start.r], 'về chỗ xuất phát');
      eq(g.ghosts.map((x) => x.state), ['active', 'house', 'house', 'house']);
      playing(g);
    } else {
      eq([g.lives, g.phase, g.over, g.score], [0, 'over', true, score]);
      ok(E.drain(g).some((e) => e.type === 'over'));
    }
  }
  const t = g.t;
  E.input(g, 'up');
  run(g, 10);
  eq(g.t, t, 'hết ván thì đứng yên');
});

test('ăn hết đốm: mê cung nhấp nháy rồi sang màn 2 với mê cung khác, đủ đốm, nhanh hơn', () => {
  const g = calm(playing(E.newGame(10)));
  g.dots = g.dots.map(() => 0);
  g.dots[15 * COLS + 8] = 1; // còn đúng một đốm ngay bên trái
  g.dotsLeft = 1;
  run(g, 10);
  eq(g.phase, 'clear');
  ok(E.drain(g).some((e) => e.type === 'clear'));
  run(g, E.CLEAR_STEPS);
  eq([g.level, g.phase, E.mazeIndex(g.level)], [2, 'ready', 1]);
  eq(g.dotsLeft, E.PARSED[1].total);
  const m = E.PARSED[1];
  eq([E.tileC(g.player), E.tileR(g.player)], [m.start.c, m.start.r]);
  const a = E.params(1);
  const b = E.params(2);
  ok(b.player > a.player && b.ghost > a.ghost && b.frightSteps < a.frightSteps, 'màn sau nhanh hơn, sợ ngắn hơn');
  ok(E.params(20).ghost > E.params(20).player, 'màn cao ma nhanh hơn đom đóm');
  ok(E.params(99).frightSteps >= 2 * E.SPS, 'vẫn còn thời gian sợ tối thiểu');
});

/* ---------------- AI ma ---------------- */
test('tính cách ma khi đuổi: Lửa đuổi thẳng, Rình chặn trước 4 ô, Sương phối hợp với Lửa, Lơ Ngơ gần thì bỏ đi', () => {
  const g = playing(E.newGame(11));
  g.modeIdx = 1; // đang đuổi
  place(g.player, 9, 15, 'left');
  place(g.ghosts[0], 9, 7, 'left');
  eq(E.targetOf(g, 0), [9, 15]);
  eq(E.targetOf(g, 1), [5, 15]);
  eq(E.targetOf(g, 2), [2 * 7 - 9, 2 * 15 - 7]);
  g.ghosts[3].state = 'active';
  place(g.ghosts[3], 1, 1, 'right');
  eq(E.targetOf(g, 3), [9, 15], 'xa thì đuổi');
  place(g.ghosts[3], 6, 13, 'right');
  eq(E.targetOf(g, 3), E.CORNERS[3], 'gần thì về góc');
  // đang tản: mỗi con về góc riêng
  g.modeIdx = 0;
  [0, 1, 2, 3].forEach((i) => eq(E.targetOf(g, i), E.CORNERS[i]));
  eq(new Set(E.CORNERS.map(String)).size, 4, 'bốn góc khác nhau');
  // mắt ma luôn nhắm cửa chuồng
  g.ghosts[2].state = 'eyes';
  const m = E.mazeOf(g);
  eq(E.targetOf(g, 2), [m.exit.c, m.exit.r]);
});

test('ma chọn ô kề gần đích nhất ở ngã rẽ, không chọn quay đầu', () => {
  const g = playing(E.newGame(12));
  g.modeIdx = 1;
  const gh = g.ghosts[0];
  // ngã tư (4,13) mê cung A: đi lên / trái / phải / xuống đều được; đang đi xuống
  place(gh, 4, 13, 'down');
  place(g.player, 4, 3, 'left'); // đích ở trên: lên là gần nhất nhưng là quay đầu
  const d = E.chooseDir(g, 0);
  ok(d !== 'up', 'không quay đầu');
  place(g.player, 8, 13, 'left');
  eq(E.chooseDir(g, 0), 'right');
  place(g.player, 4, 19, 'left');
  eq(E.chooseDir(g, 0), 'down');
});

test('tản / đuổi xen kẽ theo lịch, đổi chế độ thì ma đang đi quay đầu', () => {
  const g = calm(playing(E.newGame(13)));
  const P = E.params(1);
  eq(E.scattering(g), true, 'đầu mạng là tản');
  const gh = g.ghosts[0];
  gh.state = 'active';
  place(gh, 4, 7, 'down');
  gh.y += 300;
  g.modeT = P.modes[0] - 1;
  E.step(g);
  const ev = E.drain(g);
  ok(ev.some((e) => e.type === 'mode' && e.scatter === false), 'chuyển sang đuổi');
  eq(gh.dir, 'up', 'quay đầu');
  eq(E.scattering(g), false);
  g.modeT = P.modes[1] - 1;
  E.step(g);
  eq(E.scattering(g), true, 'lại tản');
  // hết lịch thì đuổi mãi
  calm(g);
  g.modeIdx = P.modes.length;
  run(g, 3000);
  eq(E.scattering(g), false);
  eq(g.modeIdx, P.modes.length);
});

test('đồng hồ tản / đuổi đứng lại khi ma đang sợ', () => {
  const g = calm(playing(E.newGame(14)));
  g.frightT = 100;
  const t0 = g.modeT;
  run(g, 50);
  eq(g.modeT, t0);
  run(g, 60);
  ok(g.modeT > t0);
});

test('ma ra khỏi chuồng lần lượt theo giờ, đi qua cửa rồi mới vào mê cung', () => {
  const g = playing(E.newGame(15));
  const P = E.params(1);
  eq(g.ghosts.map((x) => x.state), ['active', 'house', 'house', 'house']);
  const out = [0, 0, 0, 0];
  for (let i = 0; i < P.release[3] + 240; i++) {
    E.step(g);
    if (g.phase !== 'play') break;
    g.ghosts.forEach((gh, k) => { if (!out[k] && gh.state !== 'house') out[k] = g.lifeT; });
  }
  ok(out[1] >= P.release[1] && out[2] >= P.release[2] && out[3] >= P.release[3], 'đúng giờ: ' + out);
  ok(out[1] < out[2] && out[2] < out[3]);
});

test('ma không quay đầu trừ khi đổi chế độ / đốm lớn (chơi ngẫu nhiên nhiều seed)', () => {
  let reversals = 0;
  for (let seed = 21; seed <= 32; seed++) {
    const g = E.newGame(seed);
    const rnd = lcg(seed);
    for (let t = 0; t < 5000 && !g.over; t++) {
      if (t % 11 === 0) E.input(g, E.ORDER[Math.floor(rnd() * 4)]);
      const before = g.ghosts.map((gh) => ({ dir: gh.dir, state: gh.state, rev: gh.rev }));
      E.step(g);
      const ev = E.drain(g);
      const flip = ev.some((e) => ['mode', 'power', 'respawn', 'level'].indexOf(e.type) >= 0); // về chỗ cũ cũng tính
      g.ghosts.forEach((gh, i) => {
        const b = before[i];
        if (gh.state !== b.state || (b.state !== 'active' && b.state !== 'eyes')) return;
        if (gh.dir === E.OPP[b.dir]) {
          reversals++;
          ok(flip || b.rev, 'ma ' + i + ' quay đầu sai luật seed ' + seed + ' t ' + g.t);
        }
      });
    }
  }
  ok(reversals > 0, 'có quay đầu khi đổi chế độ');
});

test('ma sợ rẽ ngẫu nhiên nhưng tất định theo seed', () => {
  const paths = [1, 1, 2].map((seed) => {
    const g = calm(playing(E.newGame(seed)));
    const gh = g.ghosts[0];
    gh.state = 'active';
    gh.fright = true;
    place(gh, 9, 7, 'left');
    g.frightT = 10000;
    const out = [];
    for (let i = 0; i < 600; i++) {
      E.step(g);
      if (g.phase !== 'play') break;
      if (i % 20 === 0) out.push(E.tileC(gh) + ',' + E.tileR(gh));
    }
    return out.join(' ');
  });
  eq(paths[0], paths[1], 'cùng seed cùng đường');
  ok(paths[0] !== paths[2], 'khác seed khác đường');
});

/* ---------------- Tất định / lưu ---------------- */
function scripted(seed, steps, saveAt) {
  let g = E.newGame(seed);
  const rnd = lcg(seed ^ 0xabc);
  for (let t = 0; t < steps && !g.over; t++) {
    if (t % 13 === 0) E.input(g, E.ORDER[Math.floor(rnd() * 4)]);
    E.step(g);
    E.drain(g);
    if (t === saveAt) g = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  }
  return g;
}

test('tất định: cùng seed + cùng chuỗi lệnh cho cùng kết quả', () => {
  for (const seed of [1, 99, 12345]) {
    eq(E.toJSON(scripted(seed, 3000, -1)), E.toJSON(scripted(seed, 3000, -1)), 'seed ' + seed);
  }
  ok(JSON.stringify(E.toJSON(scripted(1, 3000, -1))) !== JSON.stringify(E.toJSON(scripted(2, 3000, -1))), 'seed khác');
});

test('lưu giữa ván rồi khôi phục: chơi tiếp y hệt như không lưu', () => {
  for (const seed of [3, 4, 5]) {
    eq(E.toJSON(scripted(seed, 3000, 1234)), E.toJSON(scripted(seed, 3000, -1)), 'seed ' + seed);
  }
});

test('lưu / khôi phục giữ nguyên mọi trường (cả trái cây, ma sợ, mắt ma)', () => {
  const g = playing(E.newGame(42));
  g.fruit = { k: 1, t: 77 };
  g.frightT = 200;
  g.ghosts[0].fright = true;
  g.ghosts[1].state = 'eyes';
  g.score = 1230;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.dotsLeft, g.dotsLeft);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(playing(E.newGame(5)));
  ok(E.fromJSON(JSON.parse(JSON.stringify(good))), 'ván tốt đọc được');
  const bad = [
    null, 1, 'x', {},
    { ...good, v: 2 },
    { ...good, seed: -1 },
    { ...good, level: 0 },
    { ...good, lives: 9 },
    { ...good, lives: 0 }, // hết mạng mà chưa hết ván
    { ...good, phase: 'nope' },
    { ...good, score: -5 },
    { ...good, score: 1.5 },
    { ...good, dots: good.dots.slice(1) },
    { ...good, dots: '2' + good.dots.slice(1) }, // đốm ở chỗ tường
    { ...good, dotsEaten: 3 },
    { ...good, chain: 7 },
    { ...good, fruit: { k: 99, t: 5 } },
    { ...good, fruit: { k: 1, t: 0 } },
    { ...good, player: { ...good.player, x: 0, y: 0 } }, // trong tường
    { ...good, player: { ...good.player, x: 9 * U + 1, y: 15 * U + 1 } }, // lệch trục
    { ...good, player: { ...good.player, dir: 'diag' } },
    { ...good, player: { ...good.player, want: 'x' } },
    { ...good, ghosts: good.ghosts.slice(0, 3) },
    { ...good, ghosts: good.ghosts.map((x, i) => (i ? x : { ...x, state: 'zombie' })) },
    { ...good, ghosts: good.ghosts.map((x, i) => (i ? x : { ...x, x: 'a' })) },
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
});

/* ---------------- Chơi được ---------------- */
test('bot chơi giỏi (phản xạ 200 ms) qua được màn 1 trên nhiều seed', () => {
  let cleared = 0;
  const seeds = [1, 2, 3, 4, 5, 6];
  for (const seed of seeds) {
    const { g } = botPlay(seed, { untilLevel: 2, maxSteps: 60 * 120 });
    if (g.level >= 2) cleared++;
  }
  ok(cleared >= 5, 'bot qua màn 1: ' + cleared + '/' + seeds.length);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);

