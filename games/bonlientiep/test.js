// Kiểm thử engine và AI của Bốn Liên Tiếp. Chạy: node test.js
'use strict';
const B = require('./engine.js');
const { COLS, ROWS, idxOf } = B;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
// Nước đi theo số cột 1..7 trên màn hình (dễ đọc hơn 0..6)
const cols = (str) => str.split('').map((ch) => +ch - 1);
const mk = (str, first) => B.fromMoves(cols(str), { first });
// Ván 42 nước kín bàn mà không ai thắng (người chơi 0 đi trước).
// Từ dưới lên, cột 1, 2, 5, 6 xếp 0 1 0 1 0 1; cột 3, 4, 7 xếp 1 0 1 0 1 0.
const DRAW_GAME = '111111' + '222222' + '5' + '333333' + '55555' + '6' + '444444' + '777777' + '66666';

// ---- Thả quân -----------------------------------------------------------------
console.log('Thả quân');
test('bàn trống 7 cột, đủ 7 nước hợp lệ, người chơi 0 đi trước', () => {
  const s = B.createState();
  eq(s.board.length, 42);
  eq(B.legalMoves(s).join(','), '0,1,2,3,4,5,6');
  eq(s.turn, 0);
  eq(B.createState({ first: 1 }).turn, 1);
});
test('quân rơi xuống ô trống thấp nhất và chồng lên nhau', () => {
  const s = B.createState();
  const a = B.play(s, 3);
  eq(a.row, 0); eq(a.idx, idxOf(0, 3));
  const b = B.play(s, 3);
  eq(b.row, 1); eq(b.idx, idxOf(1, 3));
  B.play(s, 3);
  eq(s.board[idxOf(0, 3)], 1, 'đáy là quân người 0');
  eq(s.board[idxOf(1, 3)], 2, 'trên là quân người 1');
  eq(s.board[idxOf(2, 3)], 1);
  eq(s.heights[3], 3);
  eq(s.last, idxOf(2, 3));
  eq(s.turn, 1);
});
test('cột đầy không được thả, applyMove ném lỗi', () => {
  const s = mk('444444');
  eq(s.heights[3], ROWS);
  ok(!B.isLegal(s, 3), 'cột 4 đầy');
  ok(!B.legalMoves(s).includes(3));
  ok(!B.isLegal(s, 7) && !B.isLegal(s, -1) && !B.isLegal(s, 1.5), 'ngoài bàn');
  let threw = false;
  try { B.applyMove(s, 3); } catch (e) { threw = true; }
  ok(threw, 'applyMove phải ném lỗi');
});
test('applyMove không sửa trạng thái gốc', () => {
  const s = mk('44');
  const t = B.applyMove(s, 0);
  eq(s.ply, 2); eq(t.ply, 3);
  eq(s.board[idxOf(0, 0)], 0);
});

// ---- Thắng / hòa ----------------------------------------------------------------
console.log('Thắng và hòa');
// Ô ghi theo (hàng, cột), hàng 0 ở dưới cùng
test('thắng hàng ngang', () => {
  const s = mk('1122334');
  ok(s.over); eq(s.winner, 0);
  eq(s.win.cells.join(','), [0, 1, 2, 3].join(','));
  eq(s.win.segs.length, 1); eq(s.win.segs[0].dir, 0);
  eq(s.win.segs[0].from, idxOf(0, 0)); eq(s.win.segs[0].to, idxOf(0, 3));
});
test('thắng hàng dọc (người chơi 1)', () => {
  const s = mk('1212321');
  ok(!s.over, 'chưa thắng');
  B.play(s, 1);
  ok(s.over); eq(s.winner, 1);
  eq(s.win.segs[0].dir, 1);
  eq(s.win.segs[0].from, idxOf(0, 1)); eq(s.win.segs[0].to, idxOf(3, 1));
  eq(s.win.cells.join(','), [idxOf(0, 1), idxOf(1, 1), idxOf(2, 1), idxOf(3, 1)].join(','));
});
test('thắng đường chéo lên phải (/)', () => {
  // Người 0: (0,0) (1,1) (2,2) (3,3); quân người 1 làm bệ ở dưới
  const s = mk('1223733474644');
  ok(s.over, 'hết ván'); eq(s.winner, 0); eq(s.ply, 13);
  eq(s.win.segs[0].dir, 2);
  eq(s.win.segs[0].from, idxOf(0, 0)); eq(s.win.segs[0].to, idxOf(3, 3));
});
test('thắng đường chéo xuống phải', () => {
  // Đối xứng gương của ván trên. Người 0: (3,3) (2,4) (1,5) (0,6)
  const s = mk('7665155414244');
  ok(s.over); eq(s.winner, 0); eq(s.ply, 13);
  eq(s.win.segs[0].dir, 3);
  eq(s.win.segs[0].from, idxOf(3, 3)); eq(s.win.segs[0].to, idxOf(0, 6));
});
test('năm quân liền nhau gộp thành một đoạn', () => {
  // Người 0: cột 1 2 _ 4 5 hàng đáy (người 1 chồng lên trên), rồi thả cột 3 thành 5 quân
  const s = mk('11224455');
  ok(!s.over);
  B.play(s, 2);
  ok(s.over); eq(s.winner, 0);
  eq(s.win.segs.length, 1); eq(s.win.cells.length, 5);
  eq(s.win.segs[0].from, idxOf(0, 0)); eq(s.win.segs[0].to, idxOf(0, 4));
});
test('kín bàn không ai có 4 là hòa', () => {
  const moves = cols(DRAW_GAME);
  eq(moves.length, 42);
  const s = B.createState();
  for (let i = 0; i < 42; i++) {
    ok(!s.over, 'hết ván sớm ở nước ' + i);
    B.play(s, moves[i]);
  }
  ok(s.over); eq(s.winner, B.DRAW); eq(s.win, null);
  eq(B.legalMoves(s).length, 0);
});
test('không đi tiếp được sau khi hết ván', () => {
  const s = mk('1122334');
  ok(!B.isLegal(s, 4));
  eq(B.legalMoves(s).length, 0);
});

// ---- Dựng lại ván ----------------------------------------------------------------
console.log('Dựng lại ván');
test('fromMoves khớp với đi từng nước, kể cả khi máy đi trước', () => {
  for (const first of [0, 1]) {
    const moves = cols('4435261');
    const a = B.createState({ first });
    for (const m of moves) B.play(a, m);
    const b = B.fromMoves(moves, { first });
    eq(Array.from(a.board).join(''), Array.from(b.board).join(''));
    eq(a.turn, b.turn); eq(a.ply, b.ply); eq(a.h, b.h); eq(a.hl, b.hl); eq(a.hh, b.hh);
    eq(b.board[idxOf(0, 3)], first + 1, 'quân đầu thuộc người đi trước');
  }
});
test('fromMoves ném lỗi khi gặp nước sai luật', () => {
  let threw = false;
  try { B.fromMoves(cols('4444444')); } catch (e) { threw = true; }
  ok(threw);
});
test('500 ván ngẫu nhiên: điểm tĩnh, khóa và số quân luôn khớp khi dựng lại', () => {
  const rng = B.mulberry32(7);
  for (let g = 0; g < 500; g++) {
    const s = B.createState({ first: g % 2 });
    const moves = [];
    while (!s.over) { const ms = B.legalMoves(s); const m = ms[(rng() * ms.length) | 0]; moves.push(m); B.play(s, m); }
    const t = B.fromMoves(moves, { first: g % 2 });
    eq(t.winner, s.winner); eq(t.h, s.h); eq(t.hl, s.hl);
    eq(s.h, B.scoreFromScratch(s), 'điểm cập nhật dần khớp điểm tính lại');
    let discs = 0;
    for (let i = 0; i < 42; i++) if (s.board[i]) discs++;
    eq(discs, s.ply);
    if (s.winner === B.DRAW) eq(s.ply, 42);
  }
});

// ---- AI ---------------------------------------------------------------------------
console.log('AI');
test('mọi mức thắng ngay khi có thể', () => {
  // Người 0 có 3 quân hàng đáy cột 1-3, đến lượt người 0: phải thả cột 4
  const s = mk('152535');
  eq(s.turn, 0);
  eq(B.winningCols(s, 0).join(','), '3');
  for (const level of ['easy', 'medium', 'hard']) {
    for (let seed = 1; seed <= 5; seed++) {
      const r = B.chooseMove(s, { level, seed, timeMs: level === 'hard' ? 300 : undefined });
      eq(r.move, 3, level + ' seed ' + seed);
    }
  }
});
test('Vừa và Khó chặn nước thắng trước mắt của đối thủ', () => {
  // Người 0 có 3 quân hàng đáy cột 2-4, cột 5 đã bị chặn: người 1 phải thả cột 1
  const u = mk('25364');
  eq(u.turn, 1);
  eq(B.winningCols(u, 0).join(','), '0', 'người 0 dọa cột 1');
  eq(B.winningCols(u, 1).join(','), '', 'người 1 chưa thắng ngay được');
  for (const level of ['medium', 'hard']) {
    const r = B.chooseMove(u, { level, seed: 3, timeMs: level === 'hard' ? 400 : undefined });
    eq(r.move, 0, level);
  }
});
test('Vừa và Khó chặn đe dọa hàng dọc và đường chéo', () => {
  // Dọc: người 0 có 3 quân cột 1, người 1 phải thả cột 1
  const v = mk('12131');
  eq(B.winningCols(v, 0).join(','), '0');
  // Chéo: người 0 có (0,0) (1,1) (2,2), cột 4 đã có 3 quân nên ô (3,3) thả tới được
  const d = mk('12235334744');
  eq(d.turn, 1);
  eq(B.winningCols(d, 0).join(','), '3', 'người 0 dọa cột 4');
  eq(B.winningCols(d, 1).join(','), '', 'người 1 chưa thắng ngay được');
  for (const level of ['medium', 'hard']) {
    eq(B.chooseMove(v, { level, seed: 1, timeMs: level === 'hard' ? 300 : undefined }).move, 0, 'dọc ' + level);
    eq(B.chooseMove(d, { level, seed: 1, timeMs: level === 'hard' ? 300 : undefined }).move, 3, 'chéo ' + level);
  }
});
test('Vừa và Khó không thả ngay dưới ô thắng của đối thủ', () => {
  // Người 0 có (1,0) (1,1) (1,2); ô (1,3) chỉ tới được khi cột 4 đã có 1 quân.
  // Người 1 đến lượt: thả cột 4 là mở đường cho người 0.
  const s = mk('3112273');
  eq(s.turn, 1);
  eq(B.winningCols(s, 0).join(','), '', 'chưa dọa trực tiếp');
  for (const level of ['medium', 'hard']) {
    const r = B.chooseMove(s, { level, seed: 2, timeMs: level === 'hard' ? 400 : undefined });
    ok(r.move !== 3, level + ' không được thả cột 4');
  }
});
test('Dễ thỉnh thoảng bỏ sót đe dọa, Vừa thì không bao giờ', () => {
  const u = mk('25364');
  let miss = 0;
  for (let seed = 1; seed <= 40; seed++) if (B.chooseMove(u, { level: 'easy', seed }).move !== 0) miss++;
  ok(miss > 0 && miss < 40, 'Dễ bỏ sót ' + miss + '/40 lần');
  console.log('       Dễ bỏ sót ' + miss + '/40 lần');
  for (let seed = 1; seed <= 10; seed++) eq(B.chooseMove(u, { level: 'medium', seed }).move, 0, 'Vừa seed ' + seed);
});
test('AI cho người chơi 1 đi trước vẫn hợp lệ, mở ván ở cột giữa', () => {
  const s = B.createState({ first: 1 });
  for (const level of ['medium', 'hard']) eq(B.chooseMove(s, { level, timeMs: level === 'hard' ? 400 : undefined }).move, 3, level);
  const r = B.chooseMove(s, { level: 'easy', seed: 4 });
  ok(B.isLegal(s, r.move));
});
test('mọi mức trả nước hợp lệ ở thế giữa ván, Vừa đủ nhanh', () => {
  const rng = B.mulberry32(99);
  for (let k = 0; k < 8; k++) {
    const s = B.createState({ first: k % 2 });
    for (let i = 0; i < 4 + k * 3 && !s.over; i++) { const ms = B.legalMoves(s); B.play(s, ms[(rng() * ms.length) | 0]); }
    if (s.over) continue;
    for (const level of ['easy', 'medium', 'hard']) {
      const t0 = Date.now();
      const r = B.chooseMove(s, { level, timeMs: level === 'hard' ? 300 : undefined });
      ok(B.isLegal(s, r.move), level + ' nước hợp lệ');
      if (level === 'medium') ok(Date.now() - t0 < 1000, 'Vừa mất ' + (Date.now() - t0) + ' ms');
    }
  }
});
test('Khó trả nước trong khoảng 1,5 giây (trần 2 giây)', () => {
  for (const moves of ['4', '44', '4453', '4435']) {
    const s = mk(moves);
    const t0 = Date.now();
    const r = B.chooseMove(s, { level: 'hard' });
    const ms = Date.now() - t0;
    ok(B.isLegal(s, r.move), 'nước hợp lệ');
    ok(ms <= 2000, 'mất ' + ms + ' ms');
    console.log(`       "${moves}": cột ${r.move + 1}, độ sâu ${r.depth}, ${r.nodes} nút, ${ms} ms`);
  }
});
test('Khó thắng Dễ ở hầu hết 4 ván (đổi lượt đi trước)', () => {
  let hardWins = 0, games = 0;
  for (let g = 0; g < 4; g++) {
    const s = B.createState({ first: g % 2 });
    const hardSide = g < 2 ? 0 : 1;
    while (!s.over) {
      const level = s.turn === hardSide ? 'hard' : 'easy';
      const r = B.chooseMove(s, level === 'hard' ? { level, nodes: 300000 } : { level, seed: g * 1000 + s.ply });
      B.play(s, r.move);
    }
    games++;
    if (s.winner === hardSide) hardWins++;
  }
  ok(hardWins >= games - 1, `Khó thắng ${hardWins}/${games}`);
  console.log(`       Khó thắng ${hardWins}/${games}`);
});
test('Khó đi trước thắng Vừa với 3 cách đáp nước đầu', () => {
  // Trần số nút thay cho trần thời gian để kết quả không phụ thuộc tốc độ máy
  let wins = 0;
  for (const reply of [3, 2, 4]) {
    B.clearTT();
    const s = B.createState();
    B.play(s, B.chooseMove(s, { level: 'hard', nodes: 800000 }).move);
    B.play(s, reply);
    while (!s.over) {
      const r = s.turn === 0 ? B.chooseMove(s, { level: 'hard', nodes: 800000 }) : B.chooseMove(s, { level: 'medium', seed: s.ply });
      B.play(s, r.move);
    }
    if (s.winner === 0) wins++;
  }
  ok(wins >= 2, 'Khó thắng ' + wins + '/3');
  console.log('       Khó thắng ' + wins + '/3');
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
