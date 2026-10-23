/* Kiểm tra engine Cá Ngựa: chạy `node test.js`
 * - Hình học bàn: đường đua 52 ô liền mạch, đối xứng xoay giữa 4 ghế, đường về đích, ô an toàn
 * - Xúc xắc seed được: tất định, đủ 1..6, phân bố đều
 * - Luật: ra quân bằng 6, 6 được tung thêm, ba lần 6 mất lượt, đá quân, ô an toàn, về đích đúng số, thắng
 * - Máy: ưu tiên đá quân > về đích > ra quân; tránh chỗ nguy hiểm; tất định theo trạng thái
 * - Mô phỏng hàng nghìn ván toàn máy: ván nào cũng kết thúc, đúng một người thắng, không trạng thái sai
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
function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'điều kiện sai');
}

/** Dựng ván với vị trí quân cho trước (các ghế không nêu thì ở chuồng). */
function board(pos, extra) {
  const g = E.newGame(1);
  Object.keys(pos).forEach((s) => { g.pos[s] = pos[s].slice(); });
  return Object.assign(g, extra || {});
}
const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
// Đường đua đi chéo qua 4 góc sát ô giữa (như bàn thật), nên hai ô kế tiếp chạm nhau cạnh hoặc góc
const touching = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;
const inCenter = (c) => c[0] >= 6 && c[0] <= 8 && c[1] >= 6 && c[1] <= 8;
const inYard = (c) => (c[0] <= 5 || c[0] >= 9) && (c[1] <= 5 || c[1] >= 9);

/* ---------------- Hình học ---------------- */

test('đường đua: 52 ô khác nhau, liền mạch (kể cả nối vòng), không đè chuồng / ô giữa', () => {
  eq(E.PATH.length, 52);
  eq(new Set(E.PATH.map((c) => c.join(','))).size, 52);
  let diagonal = 0;
  E.PATH.forEach((c, i) => {
    const next = E.PATH[(i + 1) % 52];
    ok(touching(c, next), 'ô ' + i + ' không liền ô kế tiếp');
    if (!adjacent(c, next)) diagonal++;
    ok(!inCenter(c) && !inYard(c), 'ô ' + i + ' nằm trong chuồng / ô giữa');
  });
  eq(diagonal, 4, 'số góc chéo');
});

test('4 ghế đối xứng: xoay 1/4 vòng thì ô của ghế này thành ô của ghế kế tiếp', () => {
  for (let i = 0; i < 52; i++) eq(E.rotCell(E.PATH[i], 1), E.PATH[(i + 13) % 52], 'ô ' + i);
  for (let s = 0; s < 4; s++) {
    for (let rel = 0; rel <= 55; rel++) eq(E.cellOf((s + 1) % 4, rel), E.rotCell(E.cellOf(s, rel), 1), 'ghế ' + s + ' rel ' + rel);
  }
});

test('ô xuất phát cạnh chuồng của mình; đường về đích nối từ ô cuối vào ô giữa', () => {
  for (let s = 0; s < 4; s++) {
    const start = E.cellOf(s, 0);
    const yard = E.pointOf(s, E.BASE, 0);
    // chuồng của ghế s là góc 6x6 chứa chỗ đứng đầu tiên
    const yr = yard[0] < 7.5 ? [0, 5] : [9, 14];
    const yc = yard[1] < 7.5 ? [0, 5] : [9, 14];
    const near = [[start[0] - 1, start[1]], [start[0] + 1, start[1]], [start[0], start[1] - 1], [start[0], start[1] + 1]];
    ok(near.some((c) => c[0] >= yr[0] && c[0] <= yr[1] && c[1] >= yc[0] && c[1] <= yc[1]), 'ô xuất phát ghế ' + s + ' không cạnh chuồng');
    ok(adjacent(E.cellOf(s, 50), E.cellOf(s, 51)), 'ghế ' + s + ': ô 50 không nối vào đường về đích');
    for (let rel = 51; rel < 55; rel++) ok(adjacent(E.cellOf(s, rel), E.cellOf(s, rel + 1)), 'đường về đích ghế ' + s + ' đứt ở ' + rel);
    const last = E.cellOf(s, 55);
    ok(!inCenter(last) && [[last[0] - 1, last[1]], [last[0] + 1, last[1]], [last[0], last[1] - 1], [last[0], last[1] + 1]].some(inCenter), 'ô 55 không sát ô giữa');
  }
  // 4 đường về đích không trùng nhau và không trùng đường đua
  const all = new Set(E.PATH.map((c) => c.join(',')));
  for (let s = 0; s < 4; s++) for (let rel = 51; rel <= 55; rel++) all.add(E.cellOf(s, rel).join(','));
  eq(all.size, 52 + 20);
});

test('ô an toàn: 4 ô xuất phát + 4 ô sao, cách nhau đều', () => {
  eq(E.SAFE.length, 8);
  eq(E.START, [0, 13, 26, 39]);
  E.STARS.forEach((a, i) => eq(a, E.START[i] + 8));
  for (let a = 0; a < 52; a++) eq(E.isSafe(a), E.SAFE.indexOf(a) >= 0);
});

test('chỗ vẽ quân: 4 chỗ trong chuồng và 4 chỗ ở đích của mỗi ghế đều khác nhau', () => {
  const pts = new Set();
  for (let s = 0; s < 4; s++) for (let k = 0; k < 4; k++) {
    pts.add(E.pointOf(s, E.BASE, k).join(','));
    pts.add(E.pointOf(s, E.HOME, k).join(','));
  }
  eq(pts.size, 32);
});

/* ---------------- Xúc xắc ---------------- */

test('xúc xắc seed được: cùng seed cùng dãy, đủ 1..6 và gần đều', () => {
  const seq = (seed) => {
    let r = seed;
    const out = [];
    for (let i = 0; i < 20; i++) {
      const d = E.rollDie(r);
      out.push(d.value);
      r = d.rng;
    }
    return out;
  };
  eq(seq(42), seq(42));
  ok(JSON.stringify(seq(42)) !== JSON.stringify(seq(43)), 'seed khác phải ra dãy khác');
  const count = [0, 0, 0, 0, 0, 0, 0];
  let r = 7;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const d = E.rollDie(r);
    count[d.value]++;
    r = d.rng;
  }
  eq(count[0], 0);
  for (let v = 1; v <= 6; v++) ok(count[v] > N * 0.155 && count[v] < N * 0.178, 'mặt ' + v + ': ' + count[v]);
});

test('tung xúc xắc lấy số từ PRNG của ván và không đổi ván cũ', () => {
  const g = E.newGame(123);
  const a = E.roll(g);
  const b = E.roll(g);
  eq(a.dice, b.dice);
  eq(a.dice, E.rollDie(123).value);
  eq([g.dice, g.rolls, g.phase], [0, 0, 'roll']);
});

/* ---------------- Luật ---------------- */

test('ván mới: tất cả quân trong chuồng, người chơi tung trước', () => {
  const g = E.newGame(5);
  eq(g.pos, [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]);
  eq([g.turn, g.phase, g.winner, E.isOver(g)], [0, 'roll', -1, false]);
  ok(E.validate(g));
});

test('chưa có quân ngoài chuồng: tung khác 6 thì qua lượt', () => {
  const g = E.roll(E.newGame(5), 4);
  eq([g.turn, g.phase, g.dice, g.last.outcome], [1, 'roll', 4, 'nomove']);
});

test('tung 6: ra quân vào ô xuất phát rồi được tung tiếp', () => {
  let g = E.roll(E.newGame(5), 6);
  eq([g.phase, E.legalMoves(g).map((m) => [m.token, m.from, m.to])], ['move', [[0, -1, 0], [1, -1, 0], [2, -1, 0], [3, -1, 0]]]);
  g = E.move(g, 2);
  eq([g.pos[0], g.turn, g.phase, g.sixes], [[-1, -1, 0, -1], 0, 'roll', 1]);
  g = E.roll(g, 3);
  eq(E.legalMoves(g).map((m) => [m.token, m.to]), [[2, 3]]);
  g = E.move(g, 2);
  eq([g.pos[0][2], g.turn, g.sixes], [3, 1, 0]);
});

test('ba lần 6 liên tiếp: mất lượt, lần 6 thứ ba không được đi', () => {
  let g = E.move(E.roll(E.newGame(5), 6), 0);
  g = E.move(E.roll(g, 6), 0);
  eq([g.pos[0][0], g.sixes], [6, 2]);
  g = E.roll(g, 6);
  eq([g.turn, g.phase, g.sixes, g.pos[0][0], g.last.outcome], [1, 'roll', 0, 6, 'forfeit']);
});

test('tung 6 mà không quân nào đi được: vẫn được tung lại', () => {
  // Quân duy nhất ngoài chuồng ở ô 52 của đường về đích, còn lại đã về đích → 6 không đi được
  const g = E.roll(board({ 0: [52, 56, 56, 56] }), 6);
  eq([g.turn, g.phase, g.sixes, g.last.outcome], [0, 'roll', 1, 'nomove']);
});

test('đá quân đối thủ về chuồng (kể cả hai quân chồng nhau), cộng số quân đã đá', () => {
  // Ghế 1 có hai quân ở ô chung 14 (rel 1 của ghế 1); ghế 0 ở rel 10, tung 4 → ô 14
  let g = board({ 0: [10, -1, -1, -1], 1: [1, 1, -1, -1] });
  g = E.roll(g, 4);
  eq(E.legalMoves(g)[0].captures, [{ seat: 1, token: 0 }, { seat: 1, token: 1 }]);
  g = E.move(g, 0);
  eq([g.pos[0][0], g.pos[1], g.caps], [14, [-1, -1, -1, -1], [2, 0, 0, 0]]);
  ok(E.validate(g));
});

test('ô an toàn: ô xuất phát và ô sao không bị đá, hai màu đứng chung được', () => {
  // Ghế 1 đứng ở ô xuất phát của nó (ô chung 13) và ô sao 21; ghế 0 ở rel 10 và rel 18
  let g = board({ 0: [10, 18, -1, -1], 1: [0, 8, -1, -1] });
  g = E.roll(g, 3);
  E.legalMoves(g).forEach((m) => eq(m.captures, []));
  g = E.move(g, 0);
  eq([g.pos[0][0], g.pos[1]], [13, [0, 8, -1, -1]]);
  ok(E.validate(g));
  ok(E.capturesAt(board({ 1: [8, -1, -1, -1] }), 0, 21).length === 0, 'ô sao 21');
});

test('quân ra chuồng vào ô xuất phát có đối thủ đứng: không đá (ô an toàn)', () => {
  // Ghế 3 (xuất phát ô 39) đã đi vòng tới ô chung 0 = rel 13 của ghế 3
  let g = E.roll(board({ 3: [13, -1, -1, -1] }), 6);
  eq(E.legalMoves(g)[0].captures, []);
  g = E.move(g, 0);
  eq([g.pos[0][0], g.pos[3][0]], [0, 13]);
});

test('quân đối thủ đi qua ô (không dừng) thì không bị đá', () => {
  let g = board({ 0: [10, -1, -1, -1], 1: [1, -1, -1, -1] });
  g = E.move(E.roll(g, 5), 0);
  eq([g.pos[0][0], g.pos[1][0]], [15, 1]);
});

test('đường về đích riêng: không ai đá được, về đích phải đúng số', () => {
  ok(E.absOf(0, 51) === -1 && E.capturesAt(board({ 1: [10, -1, -1, -1] }), 0, 53).length === 0);
  // Quân ở 53: tung 4 quá đích (không đi được), tung 3 vừa về đích
  let g = E.roll(board({ 0: [53, -1, -1, -1] }), 4);
  eq([g.turn, g.last.outcome], [1, 'nomove']);
  g = E.roll(board({ 0: [53, -1, -1, -1] }), 3);
  eq(E.legalMoves(g).map((m) => [m.token, m.to]), [[0, 56]]);
  g = E.move(g, 0);
  eq([g.pos[0][0], E.homeCount(g, 0)], [56, 1]);
  // Từ ô 50 trên đường đua đi thẳng vào đường về đích
  eq(E.legalMoves(E.roll(board({ 0: [48, -1, -1, -1] }), 5)).map((m) => m.to), [53]);
  eq(E.targetRel(56, 1), null);
  eq(E.targetRel(55, 2), null);
});

test('đủ 4 quân về đích thì thắng, ván dừng hẳn', () => {
  let g = E.roll(board({ 0: [56, 56, 56, 54] }), 2);
  g = E.move(g, 3);
  eq([g.phase, g.winner, E.isOver(g)], ['over', 0, true]);
  ok(E.validate(g));
  eq(E.roll(g, 3), g);
  eq(E.move(g, 0), g);
  // Máy thắng cũng dừng ván
  let h = E.roll(board({ 2: [56, 56, 56, 50] }, { turn: 2 }), 6);
  h = E.move(h, 3);
  eq([h.phase, h.winner], ['over', 2]);
});

test('nước sai bị bỏ qua: chưa tung, quân không đi được, sai số quân', () => {
  const g = E.newGame(5);
  eq(E.move(g, 0), g);
  const r = E.roll(board({ 0: [10, -1, -1, -1] }), 3);
  eq(E.move(r, 1), r);
  eq(E.move(r, 9), r);
  eq(E.roll(r, 2), r); // đang chờ đi quân thì không tung được
});

/* ---------------- Máy ---------------- */

/** Ván đang ở bước đi quân của ghế `seat` với số `dice`. */
function at(pos, seat, dice) {
  return Object.assign(board(pos), { turn: seat, phase: 'move', dice, sixes: dice === 6 ? 1 : 0, rolls: 9 });
}

test('máy ưu tiên đá quân hơn đi thường', () => {
  // Ghế 1: quân 1 ở rel 20 (ô chung 33) + 3 = ô 36, nơi quân ghế 0 (rel 36) đang đứng
  const g = at({ 1: [5, 20, -1, -1], 0: [36, -1, -1, -1] }, 1, 3);
  eq(E.chooseMove(g).token, 1);
});

test('máy ưu tiên về đích hơn đi thường, ra quân bằng 6 hơn đi thường', () => {
  eq(E.chooseMove(at({ 2: [20, 52, -1, 56] }, 2, 4)).token, 1);
  eq(E.chooseMove(at({ 2: [20, -1, 56, 56] }, 2, 6)).token, 1);
});

test('máy tránh đứng ngay trước quân đối thủ, và cứu quân đang bị dọa', () => {
  const g = at({ 1: [10, 30, -1, -1], 0: [22, -1, -1, -1] }, 1, 2);
  // quân 0: rel 10 (ô 23) → rel 12 (ô 25), đối thủ ở ô 22 sau 3 ô → nguy hiểm; quân 1: ô 43 → ô 45, an toàn
  eq(E.chooseMove(g).token, 1);
  // Quân đang bị dọa thì chạy trốn tới ô an toàn: quân 0 ở rel 5 (ô 18), đối thủ ô 16; tung 3 → ô 21 (sao)
  const h = at({ 1: [5, 30, -1, -1], 0: [16, -1, -1, -1] }, 1, 3);
  eq(E.chooseMove(h).token, 0);
});

test('máy chọn tất định theo trạng thái ván', () => {
  const g = at({ 3: [4, 9, 15, 30] }, 3, 2);
  eq(E.chooseMove(g), E.chooseMove(JSON.parse(JSON.stringify(g))));
  eq(E.chooseMove(E.newGame(1)), null);
});

/* ---------------- Mô phỏng ---------------- */

/** Chơi hết một ván, `pick(g)` chọn số quân. Kiểm tra trạng thái sau mỗi bước. */
function playOut(seed, pick) {
  let g = E.newGame(seed);
  let steps = 0;
  while (!E.isOver(g)) {
    if (++steps > 20000) throw new Error('ván ' + seed + ' không kết thúc');
    const before = g;
    if (g.phase === 'roll') g = E.roll(g);
    else {
      const moves = E.legalMoves(g);
      const k = pick(g, moves);
      ok(moves.some((m) => m.token === k), 'ván ' + seed + ': chọn nước không hợp lệ');
      g = E.move(g, k);
    }
    if (g === before) throw new Error('ván ' + seed + ' đứng yên ở bước ' + steps);
    if (!E.validate(g)) throw new Error('ván ' + seed + ' có trạng thái sai ở bước ' + steps + ': ' + JSON.stringify(E.toJSON(g)));
  }
  return g;
}
const aiPick = (g) => E.chooseMove(g).token;

test('3000 ván toàn máy: ván nào cũng kết thúc với đúng một người thắng', () => {
  const wins = [0, 0, 0, 0];
  let minRolls = Infinity;
  let total = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const g = playOut(seed * 7919, aiPick);
    const done = [0, 1, 2, 3].filter((s) => E.homeCount(g, s) === 4);
    eq(done, [g.winner], 'ván ' + seed);
    wins[g.winner]++;
    minRolls = Math.min(minRolls, g.rolls);
    total += g.rolls;
  }
  // Mỗi ghế đều thắng được một phần đáng kể (không ghế nào bị kẹt)
  wins.forEach((w, s) => ok(w > 450, 'ghế ' + s + ' chỉ thắng ' + w));
  console.log('       số lần tung / ván: trung bình ' + Math.round(total / 3000) + ', ít nhất ' + minRolls + '; thắng theo ghế ' + wins.join(' / '));
});

test('máy heuristic thắng máy chọn ngẫu nhiên rõ rệt', () => {
  let won = 0;
  const N = 800;
  for (let seed = 1; seed <= N; seed++) {
    let r = seed * 2654435761 >>> 0;
    const g = playOut(seed * 104729, (gg, moves) => {
      if (gg.turn === 0) return aiPick(gg);
      const [x, nr] = E.rand(r);
      r = nr;
      return moves[Math.floor(x * moves.length)].token;
    });
    if (g.winner === 0) won++;
  }
  ok(won / N > 0.38, 'tỉ lệ thắng ' + (won / N).toFixed(3));
  console.log('       heuristic (ghế 0) thắng ' + won + '/' + N + ' ván trước 3 máy ngẫu nhiên');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữa ván: giữ nguyên ván và đi tiếp ra cùng kết quả', () => {
  let g = E.newGame(2024);
  for (let i = 0; i < 300 && !E.isOver(g); i++) g = g.phase === 'roll' ? E.roll(g) : E.move(g, aiPick(g));
  ok(!E.isOver(g), 'ván kết thúc quá sớm');
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  const finish = (x) => {
    while (!E.isOver(x)) x = x.phase === 'roll' ? E.roll(x) : E.move(x, aiPick(x));
    return E.toJSON(x);
  };
  eq(finish(back), finish(g));
});

test('khôi phục được ván đang chờ đi quân và ván đã xong', () => {
  const m = E.roll(E.newGame(5), 6);
  eq(E.toJSON(E.fromJSON(E.toJSON(m))), E.toJSON(m));
  const o = E.move(E.roll(board({ 0: [56, 56, 56, 55] }, { rolls: 50 }), 1), 3);
  eq(E.fromJSON(E.toJSON(o)).winner, 0);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame(5));
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const pos = (p) => bad({ pos: p, rolls: 10 });
  [
    null, 1, 'x', {}, [],
    bad({ v: 2 }),
    bad({ rng: -1 }), bad({ rng: 1.5 }), bad({ rng: '5' }),
    bad({ turn: 4 }), bad({ turn: -1 }),
    bad({ phase: 'wait' }),
    bad({ dice: 7 }), bad({ dice: 3 }), // chưa tung lần nào mà đã có số
    bad({ sixes: 3 }),
    bad({ winner: 0 }), // chưa xong mà có người thắng
    bad({ caps: [0, 0, 0] }), bad({ caps: [0, -1, 0, 0] }),
    pos([[-1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]),
    pos([[57, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]),
    pos([[-2, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]),
    pos([['1', -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]),
    pos('nope'),
    // hai màu cùng đứng trên ô thường 14
    pos([[14, -1, -1, -1], [1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]),
    // xong ván nhưng không ai đủ 4 quân, hoặc người thắng ghi sai
    bad({ phase: 'over', winner: 0, rolls: 10 }),
    bad({ phase: 'over', winner: 1, rolls: 10, pos: [[56, 56, 56, 56], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] }),
    // đủ 4 quân về đích mà ván chưa xong
    bad({ rolls: 10, pos: [[56, 56, 56, 56], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] }),
    // chờ đi quân mà không có nước nào
    bad({ phase: 'move', dice: 3, rolls: 1 }),
    // số 6 đang chờ đi nhưng không ghi lần 6
    bad({ phase: 'move', dice: 6, sixes: 0, rolls: 1 }),
  ].forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i + ': ' + JSON.stringify(raw)));
  ok(E.fromJSON(good) !== null, 'ván mới hợp lệ phải khôi phục được');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
