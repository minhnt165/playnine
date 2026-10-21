// Kiểm thử engine và AI của Cờ Lật. Chạy: node test.js
'use strict';
const C = require('./engine.js');
const { BLACK, WHITE, EMPTY, DRAW, parseSq: sq, sqName } = C;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
const names = (list) => list.map(sqName).sort().join(',');

// Dựng thế cờ tùy ý từ 8 dòng chữ (hàng 1 ở trên): '.' trống, 'X' Đen, 'O' Trắng
function mk(rows, turn) {
  const s = C.createState();
  s.board.fill(EMPTY);
  rows.forEach((line, r) => {
    for (let c = 0; c < 8; c++) {
      const ch = line[c];
      s.board[r * 8 + c] = ch === 'X' ? BLACK : ch === 'O' ? WHITE : EMPTY;
    }
  });
  s.turn = turn == null ? BLACK : turn;
  return C.recount(s);
}
function run(s, m) { const ev = []; C.play(s, m, ev); return ev; }
const countBoard = (s, p) => s.board.reduce((n, v) => n + (v === p ? 1 : 0), 0);
const E8 = '........';

// ---- Trạng thái đầu -----------------------------------------------------------
console.log('Trạng thái đầu');
test('4 quân ở giữa, Đen đi trước, 4 nước hợp lệ d3 c4 f5 e6', () => {
  const s = C.createState();
  eq(s.board[sq('d4')], WHITE);
  eq(s.board[sq('e5')], WHITE);
  eq(s.board[sq('e4')], BLACK);
  eq(s.board[sq('d5')], BLACK);
  eq(s.discs[0] + s.discs[1], 4);
  eq(s.turn, BLACK);
  eq(names(C.legalMoves(s)), 'c4,d3,e6,f5');
});
test('ký hiệu ô: cột a–h, hàng 1–8, hàng 1 ở trên', () => {
  eq(sq('a1'), 0);
  eq(sq('h1'), 7);
  eq(sq('a8'), 56);
  eq(sq('h8'), 63);
  eq(sqName(sq('d3')), 'd3');
  eq(sq('z9'), -1);
});
test('nước đầu d3 lật d4, Trắng có 3 nước', () => {
  const s = C.createState();
  const ev = run(s, sq('d3'));
  eq(s.board[sq('d4')], BLACK);
  eq(s.discs[0], 4);
  eq(s.discs[1], 1);
  eq(s.turn, WHITE);
  eq(ev[0].t, 'place');
  eq(names(ev[1].sqs), 'd4');
  eq(names(C.legalMoves(s)), 'c3,c5,e3');
});

// ---- Lật quân -------------------------------------------------------------------
console.log('Lật quân');
test('lật đủ 8 hướng trong một nước', () => {
  const s = mk([
    E8,
    '.X.X.X..',
    '..OOO...',
    '.XO.OX..',
    '..OOO...',
    '.X.X.X..',
    E8, E8,
  ]);
  const m = sq('d4');
  eq(C.flipsOf(s, m).length, 8);
  run(s, m);
  for (const n of ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5']) eq(s.board[sq(n)], BLACK, n);
  eq(s.discs[1], 0);
  eq(s.discs[0], 17);
});
test('từng hướng riêng lẻ đều lật được', () => {
  // Đặt ở d4, một hàng Trắng dài 2 theo hướng (dr, dc) rồi tới quân Đen
  const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  for (const [dr, dc] of dirs) {
    const s = mk([E8, E8, E8, E8, E8, E8, E8, E8]);
    const r0 = 3, c0 = 3;
    let len = 0;
    for (let k = 1; k <= 3; k++) {
      const r = r0 + dr * k, c = c0 + dc * k;
      if (r < 0 || r > 7 || c < 0 || c > 7) break;
      len = k;
    }
    for (let k = 1; k < len; k++) s.board[(r0 + dr * k) * 8 + c0 + dc * k] = WHITE;
    s.board[(r0 + dr * len) * 8 + c0 + dc * len] = BLACK;
    C.recount(s);
    eq(C.flipsOf(s, sq('d4')).length, len - 1, `hướng ${dr},${dc}`);
  }
});
test('lật nhiều hàng cùng lúc, mỗi hàng dài khác nhau', () => {
  const s = mk([
    'X..X....',
    '.O.O....',
    '..OO....',
    'XOO.OOOX',
    E8, E8, E8, E8,
  ]);
  const flips = C.flipsOf(s, sq('d4'));
  eq(flips.length, 2 + 2 + 3 + 2, 'chéo 2 + dọc 2 + phải 3 + trái 2');
  const ev = run(s, sq('d4'));
  eq(ev[1].sqs.length, 9);
  eq(ev[1].sqs.map((x) => Math.max(Math.abs((x >> 3) - 3), Math.abs((x & 7) - 3))).join(','), '1,1,1,1,2,2,2,2,3', 'lật gần trước, xa sau');
  eq(s.discs[1], 0);
});
test('không lật hàng không bị kẹp (đầu kia trống hoặc là mép bàn)', () => {
  const s = mk([
    E8, E8, E8,
    '.OO.OO..',
    '....X...',
    E8, E8, E8,
  ]);
  // d4: bên trái là O O rồi tới mép trống, bên phải O O rồi trống: không kẹp. Chỉ e5 không phải O.
  eq(C.flipsOf(s, sq('d4')).length, 0);
  ok(!C.isLegal(s, sq('d4')));
  const t = mk(['OOOO....', E8, E8, E8, E8, E8, E8, E8]);
  ok(!C.isLegal(t, sq('e1')), 'chạm mép bàn không lật');
});
test('không vòng qua mép bàn (a4 không kẹp được g3 h3)', () => {
  const s = mk([E8, E8, '......XO', E8, E8, E8, E8, E8]);
  ok(!C.isLegal(s, sq('a4')), 'a4 nằm ngay sau h3 trong mảng 1 chiều nhưng không liền kề');
  eq(C.flipsOf(s, sq('a4')).length, 0);
});

// ---- Nước không hợp lệ ----------------------------------------------------------
console.log('Nước không hợp lệ');
test('ô đã có quân, ô không lật được gì, số ngoài bàn đều bị từ chối', () => {
  const s = C.createState();
  ok(!C.isLegal(s, sq('d4')), 'ô có quân');
  ok(!C.isLegal(s, sq('a1')), 'không lật gì');
  ok(!C.isLegal(s, sq('d6')), 'ô kề quân mình');
  ok(!C.isLegal(s, -1));
  ok(!C.isLegal(s, 64));
  ok(!C.isLegal(s, 2.5));
  ok(!C.isLegal(s, '19'));
  let threw = false;
  try { C.applyMove(s, sq('a1')); } catch (e) { threw = true; }
  ok(threw, 'applyMove phải ném lỗi');
  threw = false;
  try { C.fromMoves([sq('d3'), sq('a1')]); } catch (e) { threw = true; }
  ok(threw, 'fromMoves phải ném lỗi khi gặp nước sai');
});
test('applyMove không sửa trạng thái gốc', () => {
  const s = C.createState();
  const t = C.applyMove(s, sq('f5'));
  eq(s.discs[0], 2);
  eq(t.discs[0], 4);
  eq(s.board[sq('f5')], EMPTY);
});

// ---- Mất lượt -------------------------------------------------------------------
console.log('Mất lượt');
test('đối thủ không có nước thì mất lượt, bên vừa đi đi tiếp', () => {
  const s = mk([
    'XO......',
    E8, E8, E8, E8, E8,
    '.......O',
    '.......X',
  ]);
  const ev = run(s, sq('c1'));
  const pass = ev.find((e) => e.t === 'pass');
  ok(pass, 'có sự kiện mất lượt');
  eq(pass.p, WHITE);
  eq(s.turn, BLACK);
  eq(s.passes, 1);
  ok(!s.over);
  eq(names(C.legalMoves(s)), 'h6');
});
test('cả hai bên hết nước dù bàn chưa đầy: hết ván', () => {
  const s = mk([
    'XXX.....',
    E8, E8, E8, E8, E8,
    '.......O',
    '.......X',
  ]);
  const ev = run(s, sq('h6'));
  ok(s.over, 'hết ván');
  eq(s.winner, BLACK);
  eq(s.discs[0], 6);
  eq(s.discs[1], 0);
  const over = ev.find((e) => e.t === 'over');
  ok(over && over.winner === BLACK);
  eq(C.legalMoves(s).length, 0);
  ok(!C.isLegal(s, sq('a8')));
});

// ---- Hết ván và tính điểm -------------------------------------------------------
console.log('Hết ván');
// Bàn còn đúng một ô h8; Đen đi h8 lật g8. Đen có `black` quân, Trắng còn lại.
function nearlyFull(black) {
  const s = mk([E8, E8, E8, E8, E8, E8, E8, E8]);
  const fixed = { [sq('h7')]: BLACK, [sq('g7')]: BLACK, [sq('f8')]: BLACK, [sq('g8')]: WHITE, [sq('h8')]: EMPTY };
  let b = 3;
  for (let i = 0; i < 64; i++) {
    if (fixed[i] !== undefined) { s.board[i] = fixed[i]; continue; }
    s.board[i] = b < black ? BLACK : WHITE;
    if (s.board[i] === BLACK) b++;
  }
  return C.recount(s);
}
test('bàn đầy: nhiều quân hơn thắng', () => {
  const s = nearlyFull(40);
  eq(s.discs[0] + s.discs[1], 63);
  ok(C.isLegal(s, sq('h8')));
  eq(C.flipsOf(s, sq('h8')).length, 1);
  run(s, sq('h8'));
  ok(s.over);
  eq(s.discs[0], 42);
  eq(s.discs[1], 22);
  eq(s.winner, BLACK);
});
test('bằng quân là hòa (32 – 32)', () => {
  const s = nearlyFull(30);
  eq(s.discs[0], 30);
  eq(s.discs[1], 33);
  const ev = run(s, sq('h8'));
  ok(s.over);
  eq(s.discs[0], 32);
  eq(s.discs[1], 32);
  eq(s.winner, DRAW);
  eq(ev.find((e) => e.t === 'over').winner, DRAW);
});
test('Trắng thắng khi nhiều quân hơn', () => {
  const s = nearlyFull(10);
  run(s, sq('h8'));
  ok(s.over);
  eq(s.winner, WHITE);
});

// ---- Dựng lại ván ---------------------------------------------------------------
console.log('Dựng lại ván');
test('fromMoves dựng lại đúng ván (kể cả có mất lượt)', () => {
  const rng = C.mulberry32(7);
  let checked = 0;
  for (let g = 0; g < 40; g++) {
    const s = C.createState();
    const moves = [];
    while (!s.over) {
      const ms = C.legalMoves(s);
      const m = ms[(rng() * ms.length) | 0];
      moves.push(m);
      C.play(s, m);
      if (moves.length === 25 || s.over) {
        const t = C.fromMoves(moves);
        eq(Array.from(t.board).join(','), Array.from(s.board).join(','));
        eq(t.turn, s.turn);
        eq(t.discs[0], s.discs[0]);
        eq(t.passes, s.passes);
        eq(t.over, s.over);
        eq(t.winner, s.winner);
        checked++;
      }
    }
  }
  ok(checked >= 40);
});

// ---- Ván ngẫu nhiên -------------------------------------------------------------
console.log('Ván ngẫu nhiên');
test('500 ván ngẫu nhiên: số quân = 4 + số nước, nước hợp lệ khớp isLegal, ván kết thúc', () => {
  const rng = C.mulberry32(2024);
  let plies = 0, passes = 0, draws = 0, early = 0, wins = [0, 0];
  for (let g = 0; g < 500; g++) {
    const s = C.createState();
    let n = 0;
    while (!s.over) {
      const ms = C.legalMoves(s);
      ok(ms.length > 0, 'ván chưa hết thì bên đang đi phải có nước');
      if (n % 7 === 0) {
        const set = new Set(ms);
        for (let i = 0; i < 64; i++) eq(C.isLegal(s, i), set.has(i), 'isLegal ô ' + i);
      }
      const m = ms[(rng() * ms.length) | 0];
      const before = s.discs[s.turn];
      const flips = C.flipsOf(s, m).length;
      ok(flips > 0, 'mỗi nước phải lật ít nhất một quân');
      const p = s.turn;
      C.play(s, m);
      n++;
      plies++;
      eq(s.discs[p], before + 1 + flips, 'số quân bên đi');
      eq(s.discs[0] + s.discs[1], 4 + n, 'tổng quân = 4 + số nước');
      eq(countBoard(s, BLACK), s.discs[0], 'đếm Đen');
      eq(countBoard(s, WHITE), s.discs[1], 'đếm Trắng');
      ok(n <= 60, 'không quá 60 nước');
    }
    passes += s.passes;
    if (s.winner === DRAW) draws++; else wins[s.winner]++;
    if (s.discs[0] + s.discs[1] < 64) early++;
    eq(s.winner, s.discs[0] > s.discs[1] ? BLACK : s.discs[1] > s.discs[0] ? WHITE : DRAW, 'người thắng');
  }
  ok(passes > 0 && early > 0, `phải gặp mất lượt (${passes}) và ván dừng sớm (${early})`);
  console.log(`       ${plies} nước, ${passes} lần mất lượt, ${early} ván dừng khi bàn chưa đầy, Đen ${wins[0]} – Trắng ${wins[1]} – hòa ${draws}`);
});

// ---- AI ------------------------------------------------------------------------
console.log('AI');
test('mọi mức trả nước hợp lệ ở nhiều thế cờ, Vừa đủ nhanh', () => {
  const rng = C.mulberry32(99);
  for (let k = 0; k < 8; k++) {
    const s = C.createState();
    for (let i = 0; i < 4 + k * 7 && !s.over; i++) { const ms = C.legalMoves(s); C.play(s, ms[(rng() * ms.length) | 0]); }
    if (s.over) continue;
    for (const level of ['easy', 'medium', 'hard']) {
      const t0 = Date.now();
      const r = C.chooseMove(s, { level, seed: k, timeMs: level === 'hard' ? 200 : undefined });
      ok(C.isLegal(s, r.move), level + ' nước hợp lệ');
      if (level === 'medium') ok(Date.now() - t0 < 1500, 'Vừa mất ' + (Date.now() - t0) + ' ms');
    }
  }
});
test('AI chiếm góc khi có thể (Vừa, Khó)', () => {
  // Đen đi a1 lật b2; các nước khác đều tầm thường
  const s = mk([
    '........',
    '.O......',
    '..OX....',
    '...XO...',
    '....X...',
    E8, E8, E8,
  ]);
  ok(C.isLegal(s, sq('a1')));
  for (const level of ['medium', 'hard']) eq(sqName(C.chooseMove(s, { level, timeMs: 300 }).move), 'a1', level);
});
test('chooseMove không sửa trạng thái gốc', () => {
  const s = C.fromMoves([sq('d3'), sq('c5'), sq('f6')]);
  const snap = Array.from(s.board).join(',');
  C.chooseMove(s, { level: 'hard', timeMs: 150 });
  eq(Array.from(s.board).join(','), snap);
});
test('Khó trả nước hợp lệ trong khoảng 1,5 giây (đầu ván, giữa ván)', () => {
  const rng = C.mulberry32(3);
  for (const plies of [0, 24]) {
    const s = C.createState();
    for (let i = 0; i < plies && !s.over; i++) { const ms = C.legalMoves(s); C.play(s, ms[(rng() * ms.length) | 0]); }
    const t0 = Date.now();
    const r = C.chooseMove(s, { level: 'hard' });
    const ms = Date.now() - t0;
    ok(C.isLegal(s, r.move), 'nước hợp lệ');
    ok(ms <= 2000, 'mất ' + ms + ' ms');
    console.log(`       sau ${plies} nước: độ sâu ${r.depth}, ${r.nodes} nút, ${ms} ms`);
  }
});
test('Khó giải đúng cuối ván: tìm tới hết ván, khớp tìm vét cạn', () => {
  // Đi tới khi còn 10 ô trống bằng máy Vừa, so với tìm kiếm vét cạn không cắt tỉa
  const s = C.createState();
  while (!s.over && 64 - s.discs[0] - s.discs[1] > 10) C.play(s, C.chooseMove(s, { level: 'medium' }).move);
  ok(!s.over, 'chưa hết ván');
  const t0 = Date.now();
  const r = C.chooseMove(s, { level: 'hard' });
  const ms = Date.now() - t0;
  eq(r.reason === 'exact' || r.reason === 'only', true, 'phải giải đúng, nhận ' + r.reason);
  // Vét cạn minimax (không cắt tỉa): hiệu số quân cuối ván theo góc nhìn bên p
  function minimax(st, p) {
    if (st.over) return st.discs[p] - st.discs[1 - p];
    let best = st.turn === p ? -Infinity : Infinity;
    for (const m of C.legalMoves(st)) {
      const v = minimax(C.applyMove(st, m), p);
      best = st.turn === p ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  const want = minimax(s, s.turn);
  eq(minimax(C.applyMove(s, r.move), s.turn), want, 'nước của Khó phải đạt hiệu số tối ưu');
  if (r.value != null) eq(r.value / 10000, want, 'giá trị trả về là hiệu số chính xác');
  console.log(`       10 ô trống: hiệu số tối ưu ${want}, ${r.nodes} nút, ${ms} ms`);
});
test('Khó thắng Dễ phần lớn các ván (đổi màu)', () => {
  let hardWins = 0, games = 0;
  for (let g = 0; g < 4; g++) {
    const s = C.createState();
    const hardSide = g % 2;
    let i = 0;
    while (!s.over) {
      const level = s.turn === hardSide ? 'hard' : 'easy';
      const r = C.chooseMove(s, { level, seed: g * 1000 + i++, timeMs: level === 'hard' ? 100 : undefined });
      C.play(s, r.move);
    }
    games++;
    if (s.winner === hardSide) hardWins++;
  }
  ok(hardWins >= 3, `Khó thắng ${hardWins}/${games}`);
  console.log(`       Khó thắng ${hardWins}/${games} ván`);
});
test('Vừa thắng Dễ phần lớn các ván', () => {
  let wins = 0;
  for (let g = 0; g < 4; g++) {
    const s = C.createState();
    const side = g % 2;
    let i = 0;
    while (!s.over) {
      const r = C.chooseMove(s, { level: s.turn === side ? 'medium' : 'easy', seed: 500 + g * 1000 + i++ });
      C.play(s, r.move);
    }
    if (s.winner === side) wins++;
  }
  ok(wins >= 3, `Vừa thắng ${wins}/4`);
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
