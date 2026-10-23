/* Kiểm tra engine Ba Đỉnh: chạy `node test.js`
 * - Bố cục ba đỉnh: số lá mỗi hàng, quan hệ lá đè; hàng dưới ngửa, lá khác ngửa khi hết lá đè
 * - Luật đánh: liền bậc với lá đáy (K–A nối vòng), chỉ lá đã lộ; rút nọc
 * - Điểm: chuỗi (đứt khi rút), thưởng lá đỉnh, thưởng dọn sạch, thưởng lá nọc còn lại; điểm tối đa
 * - Hết ván: dọn sạch hoặc nọc hết mà không còn nước; trận 3 ván, điểm cộng dồn
 * - Chia bài theo seed; lưu / khôi phục và từ chối dữ liệu hỏng
 * - Bot tham lam chơi nhiều trận: trận nào cũng kết thúc, điểm không vượt tối đa, tốc độ điểm dưới ngưỡng trong game.json
 */
const E = require('./engine.js');
const C = require('../_kit/cards.js');
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
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

const ALL = C.newDeck().map(C.toId);
const rankOf = (id) => C.fromId(id).rank;

/**
 * Ván dựng tay. tableau: mảng 28 phần tử (id hoặc null); waste: id lá đáy (hoặc mảng);
 * stock: mảng id; lá còn thiếu của bộ 52 lá được nhét xuống dưới đáy để ván lưu vẫn hợp lệ.
 */
function make(tableau, waste, stock, extra) {
  const w = Array.isArray(waste) ? waste.slice() : [waste];
  const used = new Set(tableau.filter(Boolean).concat(w, stock));
  const rest = ALL.filter((id) => !used.has(id));
  const g = Object.assign(E.newGame(1), { tableau: tableau.slice(), stock: stock.slice(), waste: rest.concat(w) }, extra || {});
  return g;
}
/** Bàn đủ 28 lá lấy từ một danh sách id (không trùng với đáy / nọc). */
function fullTableau(exclude) {
  const ex = new Set(exclude);
  return ALL.filter((id) => !ex.has(id)).slice(0, 28);
}

/* ---------------- Bố cục ---------------- */

test('bố cục: 28 lá, hàng 3 / 6 / 9 / 10', () => {
  eq(E.POS.length, 28);
  eq([0, 1, 2, 3].map((r) => E.POS.filter((p) => p.row === r).length), [3, 6, 9, 10]);
  eq(E.PEAKS, [0, 1, 2]);
});

test('quan hệ lá đè: hàng dưới không bị đè, lá khác bị đúng hai lá hàng ngay dưới đè', () => {
  for (let i = 18; i < 28; i++) eq(E.COVERED_BY[i], [], 'lá ' + i);
  for (let i = 0; i < 18; i++) {
    eq(E.COVERED_BY[i].length, 2, 'lá ' + i);
    E.COVERED_BY[i].forEach((j) => eq(E.POS[j].row, E.POS[i].row + 1, 'lá ' + i + ' bị ' + j + ' đè'));
  }
  eq(E.COVERED_BY[0], [3, 4]);
  eq(E.COVERED_BY[1], [5, 6]);
  eq(E.COVERED_BY[2], [7, 8]);
  eq(E.COVERED_BY[3], [9, 10]);
  eq(E.COVERED_BY[4], [10, 11]);
  eq(E.COVERED_BY[5], [12, 13]);
  eq(E.COVERED_BY[8], [16, 17]);
  eq(E.COVERED_BY[9], [18, 19]);
  eq(E.COVERED_BY[17], [26, 27]);
});

test('ván mới: 28 lá trên bàn, 23 lá nọc, 1 lá đáy, đủ 52 lá không trùng; chỉ hàng dưới ngửa', () => {
  const g = E.newGame(42);
  eq([g.tableau.length, g.stock.length, g.waste.length], [28, 23, 1]);
  eq(new Set(g.tableau.concat(g.stock, g.waste)).size, 52);
  for (let i = 0; i < 28; i++) eq(E.faceUp(g, i), i >= 18, 'lá ' + i);
  eq([g.round, g.phase, g.score, g.streak, g.actions], [0, 'play', 0, 0, 0]);
});

test('lật lá: lá chỉ ngửa khi cả hai lá đè nó đã đi', () => {
  const t = fullTableau(['5S', '6H', '7D', '4C']);
  t[18] = '6H';
  t[19] = '4C';
  let g = make(t, '5S', ['KD']);
  ok(!E.faceUp(g, 9));
  const r1 = E.play(g, 18);
  ok(r1, 'đánh 6H lên 5S');
  eq(r1.flipped, []);
  ok(!E.faceUp(r1.game, 9), 'còn 19 đè');
  // Đáy giờ là 6H; 4C không liền bậc. Dựng lại đáy là 5S để đánh tiếp 4C.
  g = make(Object.assign(r1.game.tableau.slice()), ['6H', '5S'], ['KD']);
  const r2 = E.play(g, 19);
  ok(r2, 'đánh 4C lên 5S');
  eq(r2.flipped, [9]);
  ok(E.faceUp(r2.game, 9) && E.exposed(r2.game, 9));
});

test('lá đỉnh lộ khi hai lá hàng 1 đã đi', () => {
  const t = fullTableau(['9S']);
  [3, 4].forEach((i) => { t[i] = null; });
  for (let i = 9; i < 28; i++) t[i] = null;
  t[3] = '8H';
  const g = make(t, '9S', []);
  ok(!E.exposed(g, 0));
  const r = E.play(g, 3);
  ok(r);
  eq(r.flipped, [0]);
});

/* ---------------- Luật đánh ---------------- */

test('đánh được lá hơn / kém đáy một bậc, K–A nối vòng; lá không liền bậc thì không', () => {
  ok(E.adjacent(1, 13) && E.adjacent(13, 1) && E.adjacent(5, 6) && E.adjacent(6, 5));
  ok(!E.adjacent(5, 5) && !E.adjacent(5, 7) && !E.adjacent(1, 12) && !E.adjacent(2, 13));
  const t = fullTableau(['KS', 'AH', 'QD', '2C', '7S']);
  t[18] = 'AH';
  t[19] = 'QD';
  t[20] = '2C';
  t[21] = '7S';
  const g = make(t, 'KS', ['5D']);
  ok(E.canPlay(g, 18), 'A lên K');
  ok(E.canPlay(g, 19), 'Q lên K');
  ok(!E.canPlay(g, 20), '2 không lên K');
  ok(!E.canPlay(g, 21), '7 không lên K');
  eq(E.play(g, 20), null);
  const r = E.play(g, 18);
  ok(E.canPlay(r.game, 20), '2 lên A');
});

test('lá còn úp hoặc đã đi thì không đánh được, chỉ số sai trả null', () => {
  const t = fullTableau(['5S', '6H']);
  t[9] = '6H'; // bị 18, 19 đè
  const g = make(t, '5S', []);
  ok(!E.canPlay(g, 9));
  eq(E.play(g, 9), null);
  [-1, 28, 1.5, '18', null].forEach((i) => eq(E.play(g, i), null, String(i)));
  const g2 = make(Object.assign(t.slice(), { 18: null }), '5S', []);
  eq(E.play(g2, 18), null);
});

test('rút nọc: lá đầu nọc ra đáy, đứt chuỗi; nọc hết thì không rút được', () => {
  const g = Object.assign(E.newGame(7), { streak: 4 });
  const top = g.stock[g.stock.length - 1];
  const r = E.draw(g);
  eq(r.card, top);
  eq(r.game.waste[r.game.waste.length - 1], top);
  eq([r.game.stock.length, r.game.streak, r.game.actions], [22, 0, 1]);
  eq(g.stock.length, 23, 'không sửa trạng thái vào');
  const empty = make(fullTableau(['5S', '6H']).map((c, i) => (i === 18 ? '6H' : c)), '5S', []);
  eq(E.draw(empty), null);
});

/* ---------------- Điểm ---------------- */

test('chuỗi: lá thứ k trong chuỗi được k điểm; rút nọc đứt chuỗi', () => {
  const t = fullTableau(['5S', '6H', '7D', '8C', '9S', '4D', '3C']);
  t[18] = '6H';
  t[19] = '7D';
  t[20] = '8C';
  t[21] = '4D';
  t[22] = '3C';
  let g = make(t, '5S', ['9S', '5C']);
  let r = E.play(g, 18);
  eq([r.gained, r.streak, r.game.score], [1, 1, 1]);
  r = E.play(r.game, 19);
  eq([r.gained, r.streak, r.game.score], [2, 2, 3]);
  r = E.play(r.game, 20);
  eq([r.gained, r.streak, r.game.score], [3, 3, 6]);
  const d = E.draw(r.game); // 5C ra đáy
  eq(d.game.streak, 0);
  r = E.play(d.game, 21); // 4D lên 5C
  eq([r.gained, r.streak, r.game.score, r.game.bestStreak], [1, 1, 7, 3]);
});

test('lá đỉnh được thêm 15', () => {
  const t = new Array(28).fill(null);
  t[0] = '9H';
  t[1] = '2S';
  const g = make(t, '8S', ['KD'], { streak: 2 });
  const r = E.play(g, 0);
  eq([r.peak, r.gained, r.game.score], [true, 3 + 15, 18]);
});

test('dọn sạch ván: +30 và +5 mỗi lá còn trong nọc', () => {
  const t = new Array(28).fill(null);
  t[25] = '9H';
  const g = make(t, '8S', ['KD', '2C', '4H']);
  const r = E.play(g, 25);
  eq(r.end, { cleared: true, bonus: 30 + 15, stockLeft: 3, roundScore: 1 + 45, over: false });
  eq([r.game.score, r.game.phase, r.game.rounds], [46, 'roundEnd', [{ score: 46, cleared: true, stockLeft: 3 }]]);
});

test('điểm tối đa một ván = 596 (28 lá một chuỗi, 3 đỉnh, dọn sạch, 23 lá nọc), cả trận 1788; đạt được', () => {
  eq(E.MAX_ROUND, 406 + 45 + 30 + 5 * 23);
  eq(E.MAX_SCORE, 3 * 596);
  eq(manifest.server.modes[0].rules.max_score, E.MAX_SCORE, 'game.json max_score');
  // Thứ tự đánh: hàng dưới trái → phải, rồi hàng 2, hàng 1, đỉnh; bậc tăng dần từ lá đáy A
  const order = [];
  for (let i = 18; i < 28; i++) order.push(i);
  for (let i = 9; i < 18; i++) order.push(i);
  for (let i = 3; i < 9; i++) order.push(i);
  order.push(0, 1, 2);
  const seen = {};
  const card = (rank) => {
    seen[rank] = (seen[rank] || 0) + 1;
    return C.toId({ rank, suit: C.SUITS[seen[rank] - 1] });
  };
  const waste = card(1);
  const t = new Array(28).fill(null);
  order.forEach((i, k) => { t[i] = card(((k + 1) % 13) + 1); });
  const used = new Set(t.concat(waste));
  const stock = ALL.filter((id) => !used.has(id));
  let g = Object.assign(E.newGame(1), { tableau: t, waste: [waste], stock });
  eq(g.stock.length, 23);
  let r;
  order.forEach((i) => {
    r = E.play(g, i);
    ok(r, 'đánh được lá ' + i);
    g = r.game;
  });
  eq([g.score, g.rounds[0].score, g.rounds[0].cleared], [596, 596, true]);
});

/* ---------------- Hết ván / trận ---------------- */

test('nọc hết và không còn nước: hết ván, không thưởng; còn nọc thì chưa hết', () => {
  const t = new Array(28).fill(null);
  t[20] = '9H';
  const g = make(t, '2S', ['5C']);
  ok(!E.roundDone(g), 'còn nọc');
  eq(E.playable(g), []);
  const r = E.draw(g);
  eq(r.end, { cleared: false, bonus: 0, stockLeft: 0, roundScore: 0, over: false });
  eq(r.game.phase, 'roundEnd');
  eq(E.draw(r.game), null, 'không rút khi ván đã hết');
  eq(E.playable(r.game), []);
});

test('nọc hết nhưng còn nước thì vẫn chơi tiếp', () => {
  const t = new Array(28).fill(null);
  t[20] = '9H';
  t[21] = '3D';
  const g = make(t, '5C', ['2S']);
  const r = E.draw(g); // 2S ra đáy, 3D đánh được
  eq([r.end, r.game.phase], [null, 'play']);
  const r2 = E.play(r.game, 21);
  // 3D lên 2S: còn 9H, không liền 3 -> hết ván
  eq([r2.end && r2.end.cleared, r2.game.phase], [false, 'roundEnd']);
});

test('trận 3 ván: sang ván chia bài mới, điểm cộng dồn, chuỗi về 0; ván 3 xong là hết trận', () => {
  const t = new Array(28).fill(null);
  t[22] = '9H';
  let g = make(t, '8S', ['KD'], { streak: 5, score: 100, roundScore: 100 });
  eq(E.nextRound(g), null, 'chưa xong ván');
  let r = E.play(g, 22);
  eq(r.game.phase, 'roundEnd');
  eq(r.game.score, 100 + 6 + 30 + 5);
  g = E.nextRound(r.game);
  eq([g.round, g.phase, g.streak, g.roundScore, g.score, g.tableau.length, g.stock.length, g.waste.length], [1, 'play', 0, 0, 141, 28, 23, 1]);
  eq(new Set(g.tableau.concat(g.stock, g.waste)).size, 52);
  eq(E.nextRound(g), null);
  // Ván 2: hết nước luôn (dựng tay), ván 3: dọn sạch
  const t2 = new Array(28).fill(null);
  t2[18] = 'QH';
  g = Object.assign(make(t2, '5S', ['7C']), { round: 1, rounds: g.rounds, score: g.score, rng: g.rng });
  r = E.draw(g);
  eq([r.game.phase, r.game.rounds.length, r.game.rounds[1].cleared], ['roundEnd', 2, false]);
  g = E.nextRound(r.game);
  eq(g.round, 2);
  const t3 = new Array(28).fill(null);
  t3[27] = '4C';
  g = Object.assign(make(t3, '3H', []), { round: 2, rounds: g.rounds, score: g.score, rng: g.rng });
  r = E.play(g, 27);
  eq([r.end.over, r.game.phase, r.game.rounds.length], [true, 'over', 3]);
  eq(E.nextRound(r.game), null);
  eq(E.draw(r.game), null);
  ok(!E.perfect(r.game), 'ván 2 không dọn sạch');
  const all = Object.assign({}, r.game, { rounds: r.game.rounds.map((x) => Object.assign({}, x, { cleared: true })) });
  ok(E.perfect(all));
});

/* ---------------- Seed ---------------- */

test('chia bài theo seed: cùng seed cùng bài (cả các ván sau), khác seed khác bài, nhận seed chuỗi', () => {
  const finish = (g) => {
    while (g.phase === 'play') g = E.playable(g).length ? E.play(g, E.playable(g)[0]).game : E.draw(g).game;
    return g;
  };
  const a = E.newGame(123);
  const b = E.newGame(123);
  eq(a, b);
  const a2 = E.nextRound(finish(a));
  const b2 = E.nextRound(finish(b));
  ok(a2 && b2);
  eq(a2.tableau, b2.tableau);
  ok(JSON.stringify(a2.tableau) !== JSON.stringify(a.tableau), 'ván 2 chia bài khác ván 1');
  ok(JSON.stringify(E.newGame(124).tableau) !== JSON.stringify(a.tableau));
  eq(E.newGame('2026-10-23').tableau, E.newGame('2026-10-23').tableau);
  eq(E.newGame('2026-10-23').seed, '2026-10-23');
  ok(JSON.stringify(E.newGame().tableau) !== JSON.stringify(E.newGame().tableau), 'không seed thì ngẫu nhiên');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (đang chơi, giữa hai ván, hết trận)', () => {
  let g = E.newGame(99);
  const rt = (x) => E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(x))));
  eq(rt(g), g);
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 1000) {
    const p = E.playable(g);
    if (g.phase === 'roundEnd') {
      eq(rt(g), g, 'giữa hai ván');
      g = E.nextRound(g);
    } else g = p.length ? E.play(g, p[0]).game : E.draw(g).game;
    eq(rt(g), g, 'sau nước ' + g.actions);
  }
  eq(g.phase, 'over');
  // Khôi phục xong chơi tiếp đúng như ván gốc
  const h = E.newGame(5);
  const h1 = E.draw(h).game;
  eq(E.draw(rt(h1)).game, E.draw(h1).game);
});

test('từ chối dữ liệu hỏng hoặc không nhất quán', () => {
  const g = E.newGame(3);
  const good = E.toJSON(g);
  const bad = (patch) => Object.assign({}, good, patch);
  const dupTab = good.tableau.slice();
  dupTab[0] = dupTab[1];
  const nullTab = good.tableau.slice();
  nullTab[5] = null; // thiếu một lá trong bộ 52
  const done = (() => {
    let x = g;
    while (x.phase === 'play') x = E.playable(x).length ? E.play(x, E.playable(x)[0]).game : E.draw(x).game;
    return E.toJSON(x);
  })();
  const cases = [
    null, 1, 'x', [], {},
    bad({ v: 2 }),
    bad({ seed: -1 }), bad({ seed: 1.5 }), bad({ seed: null }),
    bad({ rng: -1 }), bad({ rng: '1' }),
    bad({ round: 3 }), bad({ round: -1 }),
    bad({ phase: 'won' }),
    bad({ tableau: good.tableau.slice(1) }), bad({ tableau: 'x' }),
    bad({ tableau: dupTab }), bad({ tableau: nullTab }),
    bad({ tableau: good.tableau.map((c, i) => (i === 0 ? 'ZZ' : c)) }),
    bad({ tableau: good.tableau.map((c, i) => (i === 0 ? 'ah' : c)) }),
    bad({ stock: good.stock.slice(1) }), bad({ stock: null }),
    bad({ waste: [] }), bad({ waste: 'AS' }),
    bad({ stock: good.stock.concat(good.waste), waste: [good.tableau[27]], tableau: good.tableau.map((c, i) => (i === 27 ? null : c)) }), // nọc 24 lá
    bad({ score: -1 }), bad({ score: 1.5 }), bad({ score: E.MAX_SCORE + 1 }),
    bad({ roundScore: 5, score: 2 }),
    bad({ streak: -1 }), bad({ streak: 29 }), bad({ streak: 3, bestStreak: 2 }),
    bad({ actions: -1 }),
    bad({ rounds: null }), bad({ rounds: [{ score: 0, cleared: false, stockLeft: 0 }] }),
    bad({ phase: 'over' }), // ván 1 chưa xong mà báo hết trận
    bad({ phase: 'roundEnd' }), // chưa hết ván mà báo xong
    Object.assign({}, done, { phase: 'play', rounds: [] }), // đã hết nước mà báo đang chơi
    Object.assign({}, done, { rounds: [{ score: 'x', cleared: false, stockLeft: 0 }] }),
    Object.assign({}, done, { rounds: [{ score: 0, cleared: 1, stockLeft: 0 }] }),
    Object.assign({}, done, { round: 2, phase: 'roundEnd', rounds: [done.rounds[0], done.rounds[0], done.rounds[0]] }),
  ];
  cases.forEach((raw, k) => eq(E.fromJSON(raw), null, 'case ' + k + ': ' + JSON.stringify(raw).slice(0, 80)));
  ok(E.fromJSON(done), 'ván vừa xong hợp lệ');
});

/* ---------------- Bot tham lam ---------------- */

/** Chuỗi dài nhất đánh được liên tiếp từ g (không rút), giới hạn số nút để chạy nhanh. */
function longest(g, budget) {
  if (budget.n-- <= 0) return 0;
  let best = 0;
  for (const i of E.playable(g)) {
    const r = E.play(g, i);
    best = Math.max(best, 1 + longest(r.game, budget));
  }
  return best;
}
/** Nước của bot: lá mở chuỗi dài nhất (hòa thì lá lật được nhiều lá hơn, rồi lá hàng cao hơn); không có thì rút. */
function botMove(g) {
  const p = E.playable(g);
  if (!p.length) return -1;
  let best = p[0];
  let key = -1;
  for (const i of p) {
    const r = E.play(g, i);
    const k = (1 + longest(r.game, { n: 400 })) * 100 + r.flipped.length * 10 + (3 - E.POS[i].row);
    if (k > key) {
      key = k;
      best = i;
    }
  }
  return best;
}

/** Chơi cả trận bằng bot, mỗi thao tác (đánh, rút, sang ván) mất `step` giây; trả điểm, số thao tác, tốc độ điểm cao nhất sau `after` giây. */
function simulate(seed, step, after) {
  let g = E.newGame(seed);
  let t = 0;
  let maxRate = 0;
  let guard = 0;
  while (g.phase !== 'over') {
    if (guard++ > 500) throw new Error('trận không kết thúc, seed ' + seed);
    if (g.phase === 'roundEnd') g = E.nextRound(g);
    else {
      const i = botMove(g);
      const r = i < 0 ? E.draw(g) : E.play(g, i);
      ok(r, 'nước hợp lệ');
      g = r.game;
      ok(g.tableau.filter(Boolean).length + g.stock.length + g.waste.length === 52, 'giữ đủ 52 lá');
    }
    t += step;
    if (t >= after) maxRate = Math.max(maxRate, g.score / t);
  }
  return { score: g.score, actions: g.actions, t, maxRate, cleared: g.rounds.filter((x) => x.cleared).length };
}

test('bot tham lam: 300 trận đều kết thúc, điểm trong giới hạn, tốc độ điểm dưới ngưỡng game.json', () => {
  const rules = manifest.server.modes[0].rules;
  let maxRate = 0;
  let maxScore = 0;
  let total = 0;
  let clearedRounds = 0;
  for (let s = 1; s <= 300; s++) {
    const r = simulate(s, 0.35, rules.min_duration_ms / 1000);
    ok(r.score >= 0 && r.score <= E.MAX_SCORE, 'điểm ' + r.score);
    maxRate = Math.max(maxRate, r.maxRate);
    maxScore = Math.max(maxScore, r.score);
    total += r.score;
    clearedRounds += r.cleared;
  }
  console.log('       bot: trung bình ' + Math.round(total / 300) + ' điểm, cao nhất ' + maxScore + ', dọn sạch ' + clearedRounds + '/900 ván, tốc độ cao nhất ' + maxRate.toFixed(2) + ' điểm/s');
  ok(clearedRounds > 0, 'bot dọn sạch được ít nhất một ván');
  ok(maxRate < rules.max_score_per_sec, 'tốc độ bot ' + maxRate.toFixed(2) + ' < ' + rules.max_score_per_sec);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
