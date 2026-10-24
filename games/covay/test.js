/* Kiểm tra engine Cờ Vây (Go): chạy `node test.js`
 * - Hình học, tên điểm, điểm sao
 * - Luật: bắt quân (một quân, cả nhóm, ở góc), cấm tự sát (trừ khi bắt được quân), ko / siêu ko, bỏ lượt, hết ván
 * - Tính điểm khu vực + komi, vùng trống trung lập (dame), đầu hàng, thế "đã xong"
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
 * - Bàn mô phỏng nhanh khớp với luật thật trên nhiều ván ngẫu nhiên (bàn, khí, atari, nước hợp lệ)
 * - Máy: luôn đi đúng luật, bắt nhóm bị atari, không lấp mắt mình, bỏ lượt / đầu hàng đúng lúc,
 *   tất định theo seed, chạy từng khúc và dừng theo hạn giờ
 * - Mức mạnh dần: Vừa thắng máy ngẫu nhiên, Khó thắng Dễ, Vừa thắng Dễ (in tỉ lệ để ghi vào README)
 */
const E = require('./engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    passed++;
    const ms = Date.now() - t0;
    console.log('  ok   ' + name + (ms > 500 ? '  (' + (ms / 1000).toFixed(1) + ' s)' : ''));
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
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

const { BLACK, WHITE, PASS, RESIGN } = E;
const at = (n, r, c) => r * n + c;

/** Dựng ván từ sơ đồ: X Đen, O Trắng, . trống (khoảng trắng bỏ qua). */
function setup(rows, turn, extra) {
  const cells = rows.join('').replace(/\s/g, '');
  const n = Math.round(Math.sqrt(cells.length));
  if (n * n !== cells.length) throw new Error('sơ đồ không vuông');
  const g = E.newGame({ n });
  g.board = Array.from(cells, (ch) => (ch === 'X' ? BLACK : ch === 'O' ? WHITE : 0));
  g.turn = turn || BLACK;
  g.seen = new Set([g.board.join('')]);
  return Object.assign(g, extra || {});
}

/** Đi lần lượt các nước, báo lỗi nếu có nước sai luật. */
function line(n, moves) {
  let g = E.newGame({ n });
  for (const m of moves) {
    const ng = E.play(g, m);
    if (!ng) throw new Error('nước sai luật trong kịch bản: ' + m + ' (' + E.tryMove(g, m).error + ')');
    g = ng;
  }
  return g;
}

/** Người chơi ngẫu nhiên: nước hợp lệ bất kỳ, không lấp mắt mình; hết nước thì bỏ lượt. */
function randomMove(g, rng) {
  const sim = new E.Sim(g.n);
  sim.load(g);
  const cand = [];
  for (let i = 0; i < g.board.length; i++) {
    if (!g.board[i] && !sim.eyeish(E.toSim(i, g.n), g.turn) && !E.tryMove(g, i).error) cand.push(i);
  }
  return cand.length ? cand[(rng() * cand.length) | 0] : PASS;
}

/** Một ván giữa hai người chơi { level, iters } (level 'random' = ngẫu nhiên); a cầm Đen. Trả màu thắng. */
function playGame(n, a, b, seed) {
  let g = E.newGame({ n });
  const rng = E.mulberry32(seed);
  let k = 0;
  while (!g.over && g.moves.length < n * n * 3) {
    const p = g.turn === BLACK ? a : b;
    const m = p.level === 'random' ? randomMove(g, rng) : E.chooseMove(g, { level: p.level, seed: seed * 7919 + k, iterations: p.iters }).move;
    k++;
    if (m === RESIGN) {
      g = E.resign(g, g.turn);
      break;
    }
    const ng = E.play(g, m);
    if (!ng) throw new Error('máy đi sai luật: ' + m + ' (' + E.tryMove(g, m).error + ')');
    g = ng;
  }
  ok(g.over, 'ván phải kết thúc');
  return g.result.winner;
}

/** Đấu `games` ván, đổi màu xen kẽ; trả số ván a thắng. */
function match(n, a, b, games) {
  let wins = 0;
  for (let s = 1; s <= games; s++) {
    const aBlack = s % 2 === 1;
    const w = aBlack ? playGame(n, a, b, s) : playGame(n, b, a, s);
    if (w === (aBlack ? BLACK : WHITE)) wins++;
  }
  return wins;
}

/* ---------------- Hình học ---------------- */
test('hình học: góc có 2 láng giềng, cạnh 3, giữa 4; kề đối xứng', () => {
  for (const n of E.SIZES) {
    const { adj } = E.geo(n);
    eq(adj[0].length, 2);
    eq(adj[n - 1].length, 2);
    eq(adj[1].length, 3);
    eq(adj[at(n, 4, 4)].length, 4);
    for (let i = 0; i < n * n; i++) for (const j of adj[i]) ok(adj[j].indexOf(i) >= 0, 'kề đối xứng');
  }
});

test('tên điểm (bỏ chữ I, hàng đếm từ dưới) và điểm sao', () => {
  eq(E.pointName(at(9, 8, 0), 9), 'A1');
  eq(E.pointName(at(9, 0, 0), 9), 'A9');
  eq(E.pointName(at(9, 0, 8), 9), 'J9');
  eq(E.pointName(at(13, 12, 12), 13), 'N1');
  eq(E.hoshi(9).sort((a, b) => a - b), [20, 24, 40, 56, 60]);
  eq(E.hoshi(13).length, 5);
  ok(E.hoshi(13).indexOf(at(13, 3, 3)) >= 0 && E.hoshi(13).indexOf(at(13, 6, 6)) >= 0);
});

/* ---------------- Luật ---------------- */
test('ván mới: bàn trống, Đen đi trước, komi 6,5', () => {
  const g = E.newGame({ n: 9 });
  eq([g.n, g.turn, g.komi, g.moves.length, g.over, g.board.every((v) => v === 0)], [9, BLACK, 6.5, 0, false, true]);
  eq(E.newGame({ n: 13 }).board.length, 169);
  eq(E.newGame({ n: 7 }).n, 9, 'cỡ lạ thì về 9');
});

test('đặt quân: đổi lượt, ô đã có quân thì sai luật', () => {
  const g = line(9, [40]);
  eq([g.board[40], g.turn, g.last], [BLACK, WHITE, 40]);
  eq(E.play(g, 40), null);
  eq(E.tryMove(g, 40).error, 'occupied');
  eq(E.play(g, 81), null);
  eq(E.play(g, -5), null);
});

test('bắt một quân hết khí và đếm quân bị bắt', () => {
  // Trắng ở giữa bị Đen vây ba phía, Đen đặt nốt khí cuối
  const g = setup([
    '.........',
    '.........',
    '.........',
    '....X....',
    '...XO....',
    '....X....',
    '.........',
    '.........',
    '.........',
  ], BLACK);
  const g2 = E.play(g, at(9, 4, 5));
  eq(g2.board[at(9, 4, 4)], 0, 'quân Trắng bị nhấc');
  eq(g2.caps[BLACK], 1);
});

test('bắt cả nhóm, kể cả nhóm ở góc', () => {
  const h = setup([
    'OO.......',
    'XXX......',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], BLACK);
  const h2 = E.play(h, at(9, 0, 2));
  eq([h2.board[0], h2.board[1], h2.caps[BLACK]], [0, 0, 2]);
  // nhóm giữa bàn 3 quân, khí cuối ở (3,6)
  const m = setup([
    '.........',
    '.........',
    '...XXX...',
    '..XOOO...',
    '...XXX...',
    '.........',
    '.........',
    '.........',
    '.........',
  ], BLACK);
  eq(E.chainAt(m.board, 9, at(9, 3, 4)).libs.size, 1);
  const m2 = E.play(m, at(9, 3, 6));
  eq([m2.board[at(9, 3, 3)], m2.board[at(9, 3, 4)], m2.board[at(9, 3, 5)], m2.caps[BLACK]], [0, 0, 0, 3]);
});

test('cấm tự sát; đặt vào chỗ không khí mà bắt được quân thì hợp lệ', () => {
  const g = setup([
    '.X.......',
    'X........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], WHITE);
  eq(E.tryMove(g, 0).error, 'suicide');
  eq(E.play(g, 0), null);
  // Tự sát cả nhóm: Trắng nối vào nhóm mình chỉ còn một khí
  const s = setup([
    'O.X......',
    'XX.......',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], WHITE);
  eq(E.tryMove(s, 1).error, 'suicide');
  // Bắt được thì không phải tự sát
  const c = setup([
    '.XO......',
    'XO.......',
    'O........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], WHITE);
  const c2 = E.play(c, 0);
  ok(c2, 'đặt vào góc bắt hai quân Đen');
  eq([c2.board[0], c2.board[1], c2.board[9], c2.caps[WHITE]], [WHITE, 0, 0, 2]);
});

test('ko: không được bắt lại ngay; đi chỗ khác một lượt rồi mới được bắt lại', () => {
  const g = setup([
    '.XO......',
    'XO.O.....',
    '.XO......',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], BLACK);
  const g1 = E.play(g, at(9, 1, 2)); // Đen bắt quân Trắng ở (1,1)
  eq([g1.board[at(9, 1, 1)], g1.caps[BLACK]], [0, 1]);
  eq(E.tryMove(g1, at(9, 1, 1)).error, 'ko');
  eq(E.play(g1, at(9, 1, 1)), null);
  const g2 = E.play(E.play(g1, 80), 72); // Trắng đi chỗ khác (dọa ko), Đen đáp
  const g3 = E.play(g2, at(9, 1, 1));
  ok(g3, 'được bắt lại');
  eq([g3.board[at(9, 1, 2)], g3.caps[WHITE]], [0, 1]);
  // Trắng bỏ lượt, Đen đi thêm một quân: bàn sau khi bắt lại khác mọi thế cũ nên được bắt lại
  const p = E.play(E.play(g1, PASS), 72);
  eq(E.tryMove(p, at(9, 1, 1)).error, undefined);
});

test('siêu ko: cấm mọi nước tạo lại một thế cờ đã có, không chỉ thế ngay trước', () => {
  const g = line(9, [40, 41]);
  // giả lập: thế cờ sau nước Đen ở 0 đã xuất hiện từ trước trong ván
  const b = g.board.slice();
  b[0] = BLACK;
  g.seen.add(b.join(''));
  eq(E.tryMove(g, 0).error, 'ko');
  ok(E.tryMove(g, 1).error === undefined);
});

test('bỏ lượt: đổi lượt, đi quân thì đếm lại; hai lần liên tiếp là hết ván', () => {
  let g = line(9, [40, PASS]);
  eq([g.passes, g.turn, g.over], [1, BLACK, false]);
  g = E.play(g, 30);
  eq(g.passes, 0);
  g = E.play(E.play(g, PASS), PASS);
  ok(g.over);
  eq(g.result.reason, 'score');
  eq(E.play(g, 50), null, 'hết ván không đi tiếp');
  eq(E.legalMoves(g), []);
});

test('nước hợp lệ: bàn trống có 81 điểm + bỏ lượt', () => {
  const ms = E.legalMoves(E.newGame({ n: 9 }));
  eq(ms.length, 82);
  ok(ms.indexOf(PASS) >= 0);
});

/* ---------------- Tính điểm ---------------- */
const WALLS = [
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
];

test('tính điểm khu vực: bàn trống thì Trắng thắng nhờ komi', () => {
  const s = E.score(E.newGame({ n: 9 }));
  eq([s.black, s.white, s.winner, s.margin], [0, 0, WHITE, 6.5]);
});

test('tính điểm khu vực: quân + đất, komi 6,5 cho Trắng', () => {
  const s = E.score(setup(WALLS));
  eq([s.black, s.white, s.winner, s.margin], [45, 36, BLACK, 2.5]);
  eq(s.owner[0], BLACK);
  eq(s.owner[8], WHITE);
});

test('vùng trống giáp cả hai màu (dame) không tính cho ai', () => {
  // Đen cột 3, cột 4 trống, Trắng cột 5
  const s = E.score(setup(Array(9).fill('...X.O...')));
  eq([s.black, s.white, s.winner], [36, 36, WHITE]);
  eq(s.owner[4], 0);
});

test('hết ván bằng hai lần bỏ lượt ghi kết quả tính điểm', () => {
  const g = E.play(E.play(setup(WALLS, BLACK), PASS), PASS);
  eq(g.result, { reason: 'score', winner: BLACK, black: 45, white: 36, komi: 6.5, margin: 2.5 });
});

test('đầu hàng', () => {
  const g = E.resign(line(9, [40]), WHITE);
  eq([g.over, g.result.reason, g.result.winner], [true, 'resign', BLACK]);
  eq(E.resign(g, BLACK), null);
  eq(E.play(g, 1), null);
});

// Thế đã xong: Đen 45 (hai vùng 16), Trắng 36 (hai vùng 12) → Đen thắng 2,5
const SETTLED = [
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
  'XXXXXOOOO',
  '....XO...',
  '....XO...',
  '....XO...',
  '....XO...',
];

test('thế đã xong: mọi vùng chỉ giáp một màu, không quá lớn, không nhóm nào một khí', () => {
  ok(E.isSettled(setup(SETTLED)));
  ok(!E.isSettled(setup(WALLS)), 'vùng 36 điểm còn lớn');
  ok(!E.isSettled(E.newGame({ n: 9 })), 'bàn trống');
  ok(!E.isSettled(line(9, [40])), 'mới có một màu');
  const dame = setup(SETTLED.map((r, k) => (k === 0 ? '....X.O..' : r)));
  ok(!E.isSettled(dame), 'còn điểm trung lập');
  eq(E.score(setup(SETTLED)).winner, BLACK);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván (cả quân bị bắt, bỏ lượt, siêu ko)', () => {
  const g = line(9, [1, 0, 9, 2, PASS, 40]);
  ok(g.board[0] === 0 && g.caps[BLACK] === 1, 'Đen đã bắt quân ở góc');
  const r = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq([r.board, r.turn, r.caps, r.passes, r.moves, r.komi, r.last], [g.board, g.turn, g.caps, g.passes, g.moves, g.komi, g.last]);
  eq(r.seen.size, g.seen.size);
  const p = E.fromJSON(E.toJSON(line(13, [PASS])));
  eq([p.n, p.passes, p.turn], [13, 1, WHITE]);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(line(9, [40, 41]));
  const bad = [
    null, 1, 'x', {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { n: 11 }),
    Object.assign({}, good, { komi: '6.5' }),
    Object.assign({}, good, { komi: 6.3 }),
    Object.assign({}, good, { komi: 999 }),
    Object.assign({}, good, { moves: 'abc' }),
    Object.assign({}, good, { moves: [40, 40] }),
    Object.assign({}, good, { moves: [40, 1.5] }),
    Object.assign({}, good, { moves: [81] }),
    Object.assign({}, good, { moves: [-3] }),
    Object.assign({}, good, { moves: [PASS, PASS, 40] }),
    Object.assign({}, good, { moves: [1, 40, 9, 0] }), // Trắng tự sát ở góc
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
  ok(E.fromJSON(good), 'ván tốt vẫn nhận');
});

/* ---------------- Bàn mô phỏng nhanh khớp luật thật ---------------- */
test('bàn mô phỏng khớp luật thật trên ván ngẫu nhiên (bàn, atari, khí, nước hợp lệ, nạp lại)', () => {
  for (const n of E.SIZES) {
    for (let s = 1; s <= (n === 9 ? 25 : 8); s++) {
      const rng = E.mulberry32(s * 31 + n);
      let g = E.newGame({ n });
      const sim = new E.Sim(n);
      sim.load(g);
      for (let k = 0; k < n * n * 2 && !g.over; k++) {
        // so khớp tính hợp lệ của mọi điểm trống
        for (let i = 0; i < n * n; i++) {
          if (g.board[i]) continue;
          const err = E.tryMove(g, i).error;
          const sl = sim.legal(E.toSim(i, n), g.turn);
          if (!err) ok(sl, 'hợp lệ theo luật thật thì mô phỏng cũng hợp lệ');
          if (err === 'suicide') ok(!sl, 'tự sát thì mô phỏng cũng cấm');
        }
        const legal = E.legalMoves(g).filter((m) => m !== PASS);
        const m = legal.length && rng() < 0.97 ? legal[(rng() * legal.length) | 0] : PASS;
        g = E.play(g, m);
        sim.play(m === PASS ? PASS : E.toSim(m, n));
        const fresh = new E.Sim(n);
        fresh.load(g);
        for (let i = 0; i < n * n; i++) {
          const p = E.toSim(i, n);
          if (sim.b[p] !== g.board[i]) throw new Error('bàn lệch ở ' + i + ' (ván ' + s + ', nước ' + k + ')');
          if (!g.board[i]) continue;
          const ch = E.chainAt(g.board, n, i);
          const at1 = ch.libs.size === 1;
          eq(sim.atari(sim.head[p]), at1, 'atari ở ' + i);
          eq(fresh.atari(fresh.head[p]), at1, 'atari (nạp lại) ở ' + i);
          if (at1) eq(sim.libOf(sim.head[p]), E.toSim([...ch.libs][0], n), 'khí còn lại');
          eq(sim.sz[sim.head[p]], ch.stones.length, 'số quân của nhóm');
        }
        eq(sim.ne, g.board.filter((v) => !v).length, 'danh sách điểm trống');
      }
    }
  }
});

const FINAL = Array.from({ length: 9 }, (_, r) => (r % 2 ? 'X.X.XO.O.' : 'XXXXXOOOO'));

test('mô phỏng: điểm giống mắt và đếm điểm cuối', () => {
  const g = setup([
    '.X.......',
    'X.X......',
    '.X.......',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], BLACK);
  const sim = new E.Sim(9);
  sim.load(g);
  ok(sim.eyeish(E.toSim(at(9, 1, 1), 9), BLACK), 'mắt giữa');
  ok(sim.eyeish(E.toSim(0, 9), BLACK), 'mắt ở góc');
  ok(!sim.eyeish(E.toSim(0, 9), WHITE));
  ok(!sim.eyeish(E.toSim(at(9, 4, 4), 9), BLACK));
  // thế cuối mô phỏng: mọi điểm trống là mắt (Đen 45, Trắng 36)
  const w = new E.Sim(9);
  w.load(setup(FINAL));
  eq(w.winner(6.5), BLACK);
  eq(w.winner(9.5), WHITE);
});

/* ---------------- Máy ---------------- */
test('máy mọi mức luôn đi đúng luật (9×9 và 13×13, gặp máy ngẫu nhiên)', () => {
  const levels = [['easy', 60], ['medium', 150], ['hard', 150]];
  for (const n of E.SIZES) {
    for (const [lv, iters] of levels) {
      playGame(n, { level: lv, iters }, { level: 'random' }, n + iters);
      if (n === 9) playGame(n, { level: 'random' }, { level: lv, iters }, n + iters + 1);
    }
  }
});

test('máy bắt nhóm đang bị atari', () => {
  const g = setup([
    '.........',
    '.........',
    '.........',
    'OOOOO....',
    'XXXXX.O..',
    'OOOOO....',
    '.........',
    '.........',
    '.........',
  ], WHITE);
  // nhóm Đen 5 quân chỉ còn khí ở (4,5)
  // (Dễ mô phỏng ngẫu nhiên thuần nên có thể bỏ lỡ; chỉ đòi Vừa / Khó)
  for (const lv of ['medium', 'hard']) eq(E.chooseMove(g, { level: lv, seed: 3, iterations: 800 }).move, at(9, 4, 5), lv);
});

test('máy không lấp mắt mình: chỉ còn mắt thì bỏ lượt', () => {
  const g = setup(Array.from({ length: 9 }, (_, r) => (r === 0 ? '.OOOOOOOO' : r === 8 ? 'OOOOOOOO.' : 'OOOOOOOOO')), WHITE);
  const r = E.chooseMove(g, { level: 'hard', seed: 1, iterations: 100 });
  eq([r.move, r.reason], [PASS, 'nomove']);
});

test('máy bỏ lượt khi thế đã xong, hoặc khi đối thủ bỏ lượt và tính ngay thì máy thắng', () => {
  // Thế đã xong, Trắng (máy) tới lượt: bỏ lượt dù đang thua
  const s = setup(SETTLED, WHITE);
  eq(E.chooseMove(s, { level: 'medium', seed: 1, iterations: 50 }).reason, 'settled');
  ok(E.aiWouldPass(s));
  // Bàn chưa xong: Đen vừa bỏ lượt, Trắng đang dẫn (komi) → Trắng bỏ lượt, hết ván Trắng thắng
  const g = line(9, [PASS]);
  const r = E.chooseMove(g, { level: 'hard', seed: 1, iterations: 50 });
  eq([r.move, r.reason], [PASS, 'score']);
  ok(E.aiWouldPass(g));
  // Đen vừa bỏ lượt nhưng Đen đang dẫn → Trắng không bỏ lượt
  const w = setup(WALLS, WHITE, { passes: 1 });
  ok(!E.aiWouldPass(w), 'Trắng đang thua 2,5: không bỏ lượt');
  const r2 = E.chooseMove(w, { level: 'medium', seed: 1, iterations: 100 });
  ok(r2.move !== PASS && r2.move !== RESIGN, 'đi tiếp');
});

test('máy đầu hàng khi thua gần chắc và ván đã đi quá nửa bàn', () => {
  // Đen có bốn hàng quân chia bàn thành dải một hàng, Trắng toàn bỏ lượt (36 nước Đen + 35 lượt bỏ = 71 nước)
  const moves = [];
  const blacks = [];
  for (const r of [1, 3, 5, 7]) for (let c = 0; c < 9; c++) blacks.push(at(9, r, c));
  blacks.forEach((p, k) => {
    if (k) moves.push(PASS);
    moves.push(p);
  });
  const g = line(9, moves);
  eq(g.turn, WHITE);
  const r = E.chooseMove(g, { level: 'medium', seed: 2, iterations: 1500 });
  eq(r.move, RESIGN);
  ok(r.winrate < 0.05);
  // cùng thế nhưng ván còn ngắn (dựng thẳng, không có lịch sử nước) → không đầu hàng
  const short = setup(Array.from({ length: 9 }, (_, k) => (k % 2 ? 'XXXXXXXXX' : '.........')), WHITE);
  ok(E.chooseMove(short, { level: 'medium', seed: 2, iterations: 600 }).move !== RESIGN);
});

test('máy tất định theo seed (cùng số mô phỏng thì cùng nước)', () => {
  const g = line(9, [40, 30, 50]);
  for (const lv of E.LEVELS) {
    const a = E.chooseMove(g, { level: lv, seed: 99, iterations: 400 });
    const b = E.chooseMove(g, { level: lv, seed: 99, iterations: 400 });
    eq(a.move, b.move, lv);
    eq(a.iterations, 400);
  }
});

test('tìm kiếm chạy được từng khúc và dừng theo hạn giờ', () => {
  const g = line(13, [84]);
  const plan = E.planMove(g, { level: 'hard', seed: 5 });
  ok(plan.search, 'cần tìm kiếm');
  plan.search.run(100);
  plan.search.run(50);
  eq(plan.search.iterations, 150);
  const t0 = Date.now();
  plan.search.run(1e9, Date.now() + 120, Date.now);
  const dt = Date.now() - t0;
  ok(dt >= 110 && dt < 400, 'dừng gần hạn giờ: ' + dt + ' ms');
  const res = plan.search.result();
  ok(E.isLegal(g, res.move), 'nước hợp lệ');
  // chooseMove theo thời gian
  const t1 = Date.now();
  const r = E.chooseMove(line(9, [40]), { level: 'hard', seed: 1, timeMs: 150 });
  ok(Date.now() - t1 < 500 && r.iterations > 50, 'theo thời gian: ' + r.iterations + ' vòng');
});

test('ước lượng chủ đất bằng mô phỏng', () => {
  const own = E.ownership(setup(FINAL), 16, 1);
  eq([own[0], own[at(9, 1, 1)], own[8], own[at(9, 1, 8)]], [1, 1, -1, -1]);
  eq(own.length, 81);
});

/* ---------------- Mức mạnh dần ---------------- */
const RATES = [];
test('mức mạnh dần: Vừa thắng máy ngẫu nhiên gần như luôn luôn (9×9)', () => {
  const games = 6;
  const w = match(9, { level: 'medium' }, { level: 'random' }, games);
  RATES.push('Vừa – ngẫu nhiên: ' + w + '/' + games);
  ok(w >= games - 1, 'Vừa thắng ' + w + '/' + games);
});

test('mức mạnh dần: Khó (3.000 mô phỏng) thắng Dễ phần lớn (9×9)', () => {
  const games = 6;
  const w = match(9, { level: 'hard', iters: 3000 }, { level: 'easy' }, games);
  RATES.push('Khó (3.000) – Dễ: ' + w + '/' + games);
  ok(w >= games - 1, 'Khó thắng ' + w + '/' + games);
});

test('mức mạnh dần: Vừa thắng Dễ (9×9)', () => {
  const games = 4;
  const w = match(9, { level: 'medium' }, { level: 'easy' }, games);
  RATES.push('Vừa – Dễ: ' + w + '/' + games);
  ok(w >= games - 1, 'Vừa thắng ' + w + '/' + games);
});

if (RATES.length) console.log('\n  Tỉ lệ: ' + RATES.join(' · '));
console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
