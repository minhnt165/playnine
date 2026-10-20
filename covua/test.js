// Kiểm thử engine và AI của Cờ Vua. Chạy: node test.js
'use strict';
const C = require('./engine.js');

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };

const uciList = (s) => C.legalMoves(s).map(C.moveToUci);
const has = (s, u) => uciList(s).includes(u);
// Đi một loạt nước UCI cách nhau bằng dấu cách, trả về các bản ghi
function go(s, line) {
  return line.split(' ').filter(Boolean).map((u) => {
    const m = C.parseUci(s, u);
    if (!m) throw new Error('nước không hợp lệ: ' + u + ' ở ' + C.toFEN(s));
    return C.play(s, m);
  });
}
const sanOf = (fen, u) => { const s = C.fromFEN(fen); return C.san(s, C.parseUci(s, u)); };

// ---- Sinh nước (perft) -------------------------------------------------------
console.log('Sinh nước (perft)');
test('thế đầu: 20 / 400 / 8902', () => {
  const s = C.createState();
  eq(C.perft(s, 1), 20);
  eq(C.perft(s, 2), 400);
  eq(C.perft(s, 3), 8902);
  eq(C.toFEN(s), C.START_FEN, 'perft không làm đổi thế cờ');
});
test('Kiwipete: 48 / 2039 / 97862', () => {
  const s = C.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  eq(C.perft(s, 1), 48);
  eq(C.perft(s, 2), 2039);
  eq(C.perft(s, 3), 97862);
});
test('thế 3 (bắt tốt qua đường, ghim ngang): 14 / 191 / 2812 / 43238', () => {
  const s = C.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  eq(C.perft(s, 1), 14);
  eq(C.perft(s, 2), 191);
  eq(C.perft(s, 3), 2812);
  eq(C.perft(s, 4), 43238);
});
test('thế 4 (phong cấp, nhập thành): 6 / 264 / 9467', () => {
  const s = C.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  eq(C.perft(s, 1), 6);
  eq(C.perft(s, 2), 264);
  eq(C.perft(s, 3), 9467);
});
test('thế 5: 44 / 1486 / 62379', () => {
  const s = C.fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  eq(C.perft(s, 1), 44);
  eq(C.perft(s, 2), 1486);
  eq(C.perft(s, 3), 62379);
});
test('FEN đọc rồi ghi lại không đổi', () => {
  for (const f of [C.START_FEN, 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', '8/8/8/K2pP2r/8/8/8/4k3 w - d6 0 1']) {
    eq(C.toFEN(C.fromFEN(f)), f);
  }
});

// ---- Nhập thành -------------------------------------------------------------
console.log('Nhập thành');
test('nhập thành hai cánh khi đủ điều kiện, xe đổi chỗ đúng', () => {
  const s = C.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  ok(has(s, 'e1g1') && has(s, 'e1c1'), 'Trắng nhập thành được');
  const [r] = go(s, 'e1g1');
  eq(r.san, 'O-O');
  eq(C.toFEN(s).split(' ')[0], 'r3k2r/8/8/8/8/8/8/R4RK1');
  eq(C.toFEN(s).split(' ')[2], 'kq', 'Trắng mất quyền nhập thành');
  const [r2] = go(s, 'e8c8');
  eq(r2.san, 'O-O-O');
  eq(C.toFEN(s).split(' ')[0], '2kr3r/8/8/8/8/8/8/R4RK1');
});
test('không nhập thành khi đang bị chiếu', () => {
  const s = C.fromFEN('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
  ok(!has(s, 'e1g1') && !has(s, 'e1c1'));
});
test('không nhập thành đi qua ô bị tấn công hoặc vào ô bị tấn công', () => {
  ok(!has(C.fromFEN('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1'), 'e1g1'), 'f1 bị xe f2 khống chế');
  ok(!has(C.fromFEN('4k3/8/8/8/8/8/6r1/4K2R w K - 0 1'), 'e1g1'), 'g1 bị xe g2 khống chế');
  ok(!has(C.fromFEN('4k3/8/8/8/8/8/3r4/R3K3 w Q - 0 1'), 'e1c1'), 'd1 bị xe d2 khống chế');
  ok(has(C.fromFEN('4k3/8/8/8/8/8/1r6/R3K3 w Q - 0 1'), 'e1c1'), 'b1 bị khống chế vẫn nhập thành cánh hậu được');
});
test('không nhập thành khi có quân chắn giữa', () => {
  ok(!has(C.fromFEN('4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1'), 'e1c1'));
  ok(!has(C.fromFEN('4k3/8/8/8/8/8/8/4K1NR w K - 0 1'), 'e1g1'));
});
test('mất quyền khi vua đi, xe đi, hoặc xe bị ăn', () => {
  const s = C.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  go(s, 'e1e2 e8e7 e2e1 e7e8');
  ok(!has(s, 'e1g1') && !has(s, 'e1c1'), 'vua đã đi');
  const t = C.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  go(t, 'h1h2 a8a7 h2h1 a7a8');
  ok(!has(t, 'e1g1') && has(t, 'e1c1'), 'xe h1 đã đi');
  eq(C.toFEN(t).split(' ')[2], 'Qk');
  const u = C.fromFEN('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1');
  go(u, 'g2h1');
  eq(C.toFEN(u).split(' ')[2], 'Qkq', 'xe h1 bị ăn');
});

// ---- Bắt tốt qua đường ---------------------------------------------------------
console.log('Bắt tốt qua đường');
test('bắt ngay sau khi tốt đối phương đi hai ô, tốt bị bắt biến mất', () => {
  const s = C.createState();
  go(s, 'e2e4 a7a6 e4e5 d7d5');
  ok(has(s, 'e5d6'), 'có nước e5d6');
  const [r] = go(s, 'e5d6');
  eq(r.san, 'exd6');
  eq(r.captured, -C.PAWN);
  eq(s.b[C.parseSq('d5')], 0, 'tốt d5 đã bị bắt');
  eq(s.b[C.parseSq('d6')], C.PAWN);
});
test('chỉ được bắt ngay nước kế tiếp', () => {
  const s = C.createState();
  go(s, 'e2e4 a7a6 e4e5 d7d5 h2h3 h7h6');
  ok(!has(s, 'e5d6'));
});
test('không bắt qua đường khi làm lộ vua (ghim theo hàng)', () => {
  const s = C.fromFEN('8/8/8/K2pP2r/8/8/8/4k3 w - d6 0 1');
  ok(!has(s, 'e5d6'));
});
test('ô bắt qua đường không bắt được thì không làm thế cờ khác đi (lặp thế)', () => {
  // Tốt e đi hai ô cạnh tốt đen d4, nhưng bắt qua đường sẽ lộ vua a4 trước xe h4
  const s = C.fromFEN('8/8/8/8/k2p3R/8/4P3/4K3 w - - 0 1');
  go(s, 'e2e4');
  eq(s.ep, -1, 'không ghi ô bắt qua đường khi bắt không hợp lệ');
});

// ---- Phong cấp ------------------------------------------------------------------
console.log('Phong cấp');
test('4 lựa chọn phong cấp, ký hiệu =Q, =N', () => {
  const s = C.fromFEN('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  const ms = uciList(s).filter((u) => u.startsWith('a7a8'));
  eq(ms.sort().join(','), 'a7a8b,a7a8n,a7a8q,a7a8r');
  eq(sanOf('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q'), 'a8=Q+');
  eq(sanOf('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8n'), 'a8=N');
  const [r] = go(s, 'a7a8n');
  eq(s.b[C.parseSq('a8')], C.KNIGHT);
  eq(r.promo, C.KNIGHT);
});
test('ăn quân kèm phong cấp, đi lại trả đúng tốt', () => {
  const s = C.fromFEN('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
  const m = C.parseUci(s, 'a7b8q');
  eq(C.san(s, m), 'axb8=Q+');
  C.makeMove(s, m);
  C.undo(s);
  eq(C.toFEN(s), '1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
});
test('Đen phong cấp ở hàng 1', () => {
  const s = C.fromFEN('k7/8/8/8/8/8/p7/7K b - - 0 1');
  go(s, 'a2a1q');
  eq(s.b[C.parseSq('a1')], -C.QUEEN);
});

// ---- Kết thúc ván -------------------------------------------------------------------
console.log('Kết thúc ván');
test('chiếu hết (Fool\'s mate): Đen thắng, ký hiệu #', () => {
  const s = C.createState();
  const recs = go(s, 'f2f3 e7e5 g2g4 d8h4');
  eq(recs[3].san, 'Qh4#');
  ok(recs[3].mate);
  ok(s.over);
  eq(s.reason, 'checkmate');
  eq(s.winner, C.BLACK);
  eq(C.legalMoves(s).length, 0);
});
test('hết nước đi (pat) là hòa', () => {
  const s = C.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  ok(s.over);
  eq(s.reason, 'stalemate');
  eq(s.winner, C.DRAW);
  ok(!s.check);
  const t = C.fromFEN('7k/8/5QK1/8/8/8/8/8 w - - 0 1');
  ok(!t.over);
  go(t, 'f6f7');
  eq(t.reason, 'stalemate');
});
test('lặp lại 3 lần là hòa (không sớm hơn)', () => {
  const s = C.createState();
  go(s, 'g1f3 g8f6 f3g1 f6g8');
  ok(!s.over, 'mới lặp 2 lần');
  eq(C.repetitions(s), 2);
  go(s, 'g1f3 g8f6 f3g1');
  ok(!s.over);
  go(s, 'f6g8');
  ok(s.over);
  eq(s.reason, 'threefold');
  eq(s.winner, C.DRAW);
});
test('quyền nhập thành khác nhau thì không tính là lặp thế', () => {
  const s = C.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  go(s, 'e1f1 e8f8 f1e1 f8e8 e1f1 e8f8 f1e1 f8e8');
  ok(!s.over, 'thế đầu còn quyền nhập thành, các thế sau thì không');
  go(s, 'e1f1 e8f8');
  ok(s.over);
  eq(s.reason, 'threefold');
});
test('luật 50 nước: nửa nước thứ 100 không ăn quân, không đi tốt là hòa', () => {
  const s = C.fromFEN('4k3/8/8/8/8/8/8/4K2R w - - 98 80');
  go(s, 'h1h2');
  ok(!s.over);
  go(s, 'e8d8');
  ok(s.over);
  eq(s.reason, 'fifty');
});
test('luật 50 nước: chiếu hết ở nửa nước thứ 100 vẫn là chiếu hết', () => {
  const s = C.fromFEN('7k/8/6K1/8/8/8/8/R7 w - - 99 80');
  const [r] = go(s, 'a1a8');
  eq(r.san, 'Ra8#');
  eq(s.reason, 'checkmate');
  eq(s.winner, C.WHITE);
});
test('ăn quân hoặc đi tốt đặt lại bộ đếm 50 nước', () => {
  const s = C.fromFEN('4k3/8/8/8/8/8/4P3/4K2R w - - 60 80');
  go(s, 'e2e3');
  eq(s.half, 0);
});
test('không đủ quân chiếu hết', () => {
  const draw = ['4k3/8/8/8/8/8/8/4K3 w - - 0 1', '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', '4k3/8/8/8/8/8/8/1N2K3 b - - 0 1'];
  for (const f of draw) { const s = C.fromFEN(f); ok(s.over && s.reason === 'material', f); }
  ok(C.fromFEN('5b1k/8/8/8/8/8/8/2B1K3 w - - 0 1').over, 'Tượng c1 và f8 cùng màu ô đen');
  ok(!C.fromFEN('2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1').over, 'Tượng c1 (ô đen) và c8 (ô trắng) khác màu');
  ok(!C.fromFEN('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1').over, 'hai Mã: chưa coi là hết');
  ok(!C.fromFEN('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1').over, 'còn tốt');
  ok(!C.fromFEN('4k3/8/8/8/8/8/8/1n2KB2 w - - 0 1').over, 'Tượng đấu Mã');
  // Ăn quân cuối cùng của đối phương thành Vua đấu Vua
  const s = C.fromFEN('4k3/8/8/8/8/8/3q4/4K3 w - - 0 1');
  go(s, 'e1d2');
  eq(s.reason, 'material');
});

// ---- Ký hiệu SAN ----------------------------------------------------------------
console.log('Ký hiệu SAN');
test('các nước khai cuộc: e4, Nf3, exd5, Bb5+, O-O', () => {
  const s = C.createState();
  const sans = go(s, 'e2e4 d7d5 e4d5 d8d5 g1f3 c8g4 f1e2 b8c6 e1g1 e8c8').map((r) => r.san);
  eq(sans.join(' '), 'e4 d5 exd5 Qxd5 Nf3 Bg4 Be2 Nc6 O-O O-O-O');
  eq(sanOf('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'f1b5'), 'Bb5+');
});
test('phân biệt quân cùng loại theo cột, theo hàng, cả hai', () => {
  eq(sanOf('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', 'b1d2'), 'Nbd2');
  eq(sanOf('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', 'f1d2'), 'Nfd2');
  eq(sanOf('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a1a3'), 'R1a3');
  eq(sanOf('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a5a3'), 'R5a3');
  eq(sanOf('8/7k/8/8/8/Q7/8/Q1Q1K3 w - - 0 1', 'a1b2'), 'Qa1b2');
  eq(sanOf('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'b1c3'), 'Nc3', 'một Mã thì không ghi thêm');
});
test('quân bị ghim không gây phân biệt thừa', () => {
  // Mã d2 và h2 cùng tới được f3, nhưng Mã d2 bị Tượng e1 ghim vào Vua a5
  eq(sanOf('4k3/8/8/K7/8/8/3N3N/4b3 w - - 0 1', 'h2f3'), 'Nf3');
  eq(sanOf('4k3/8/8/K7/8/8/3N3N/8 w - - 0 1', 'h2f3'), 'Nhf3', 'không ghim thì phải ghi cột');
});
test('chiếu (+) và phong cấp chiếu (e8=Q+)', () => {
  eq(sanOf('3k4/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7e8q'), 'e8=Q+');
  eq(sanOf('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', 'a1a8'), 'Ra8+');
  eq(sanOf('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', 'e1c1'), 'O-O-O');
});

// ---- Dựng lại ván, đi / gỡ nước --------------------------------------------------------
console.log('Dựng lại ván');
test('fromMoves dựng lại đúng ván ngẫu nhiên, makeMove/undo trả lại đúng thế', () => {
  const rng = C.mulberry32(7);
  for (let g = 0; g < 20; g++) {
    const s = C.createState();
    const moves = [];
    for (let i = 0; i < 160 && !s.over; i++) {
      const legal = C.legalMoves(s);
      // makeMove + undo mọi nước phải trả lại đúng FEN và khóa
      const fen = C.toFEN(s), key = C.keyOf(s), ev = C.evaluate(s);
      for (const m of legal) { C.makeMove(s, m); C.undo(s); }
      eq(C.toFEN(s), fen, 'undo');
      eq(C.keyOf(s), key, 'khóa sau undo');
      eq(C.evaluate(s), ev, 'điểm sau undo');
      const m = legal[(rng() * legal.length) | 0];
      moves.push(C.moveToUci(m));
      C.play(s, m);
    }
    const t = C.fromMoves(moves);
    eq(C.toFEN(t), C.toFEN(s));
    eq(C.keyOf(t), C.keyOf(s));
    eq(t.over, s.over);
    eq(t.reason, s.reason);
    eq(t.history.map((r) => r.san).join(' '), s.history.map((r) => r.san).join(' '));
  }
});
test('khóa cộng dồn khớp khóa tính lại từ FEN', () => {
  const s = C.createState();
  go(s, 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1e3 e7e5 d4b3 c8e6 f2f3 f8e7 d1d2 e8g8 e1c1');
  eq(C.keyOf(s), C.keyOf(C.fromFEN(C.toFEN(s))));
});
test('fromMoves ném lỗi khi gặp nước sai luật', () => {
  let threw = false;
  try { C.fromMoves(['e2e4', 'e7e5', 'e1e3']); } catch (e) { threw = true; }
  ok(threw);
  threw = false;
  try { C.fromMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4', 'a2a3']); } catch (e) { threw = true; }
  ok(threw, 'không đi tiếp sau khi hết ván');
});
test('chênh lệch quân theo thang 1-3-3-5-9', () => {
  const s = C.createState();
  eq(C.material(s), 0);
  go(s, 'e2e4 d7d5 e4d5 d8d5');
  eq(C.material(s), 0);
  eq(C.material(C.fromFEN('4k3/8/8/8/8/8/8/RN2K3 w - - 0 1')), 8);
});

// ---- AI ------------------------------------------------------------------------------
console.log('AI');
test('mọi mức trả nước hợp lệ ở thế đầu và không làm đổi thế cờ', () => {
  const s = C.createState();
  for (const level of ['easy', 'medium', 'hard']) {
    const r = C.chooseMove(s, { level, timeMs: level === 'hard' ? 300 : undefined });
    ok(C.legalMoves(s).includes(r.move), level);
    eq(C.toFEN(s), C.START_FEN);
    eq(s.stack.length, 0);
  }
});
test('mọi mức trả nước hợp lệ ở thế giữa ván, Vừa đủ nhanh', () => {
  const rng = C.mulberry32(99);
  for (let k = 0; k < 5; k++) {
    const s = C.createState();
    for (let i = 0; i < 10 + k * 6 && !s.over; i++) { const ms = C.legalMoves(s); C.play(s, ms[(rng() * ms.length) | 0]); }
    if (s.over) continue;
    const fen = C.toFEN(s);
    for (const level of ['easy', 'medium', 'hard']) {
      const t0 = Date.now();
      const r = C.chooseMove(s, { level, timeMs: level === 'hard' ? 300 : undefined });
      ok(C.legalMoves(s).includes(r.move), level + ' nước hợp lệ');
      eq(C.toFEN(s), fen, level + ' không đổi thế');
      if (level === 'medium') ok(Date.now() - t0 < 2000, 'Vừa mất ' + (Date.now() - t0) + ' ms');
    }
  }
});
test('Khó trả lời trong khoảng 2 giây (thế Kiwipete)', () => {
  const s = C.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const t0 = Date.now();
  const r = C.chooseMove(s, { level: 'hard' });
  const ms = Date.now() - t0;
  ok(C.legalMoves(s).includes(r.move), 'nước hợp lệ');
  ok(ms <= 2000, 'mất ' + ms + ' ms');
  console.log(`       độ sâu ${r.depth}, ${r.nodes} nút, ${ms} ms, nước ${r.uci}`);
});
test('Khó thấy chiếu hết một nước (cả hai bên)', () => {
  const a = C.fromFEN('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  eq(C.chooseMove(a, { level: 'hard' }).uci, 'd1d8');
  const b = C.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  eq(C.chooseMove(b, { level: 'hard' }).uci, 'h5f7', 'Scholar\'s mate');
  const c = C.fromFEN('3r2k1/8/8/8/8/8/5PPP/6K1 b - - 0 1');
  eq(C.chooseMove(c, { level: 'hard' }).uci, 'd8d1');
});
test('Vừa và Khó ăn Hậu bị bỏ không', () => {
  const t = C.fromFEN('4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1');
  for (const level of ['medium', 'hard']) eq(C.chooseMove(t, { level, timeMs: 400 }).uci, 'c3d5', level);
});
test('Khó chiếu hết được Vua + Hậu đấu Vua trong 30 nước', () => {
  const s = C.fromFEN('8/8/8/4k3/8/8/8/K6Q w - - 0 1');
  for (let i = 0; i < 60 && !s.over; i++) {
    const r = C.chooseMove(s, { level: s.turn === C.WHITE ? 'hard' : 'medium', timeMs: 250 });
    C.play(s, r.move);
  }
  ok(s.over && s.reason === 'checkmate', 'kết quả: ' + (s.reason || 'chưa xong') + ' ' + C.toFEN(s));
});
test('sách khai cuộc: Vừa / Khó đi nước trong sách ở thế đầu, Dễ thì không dùng sách', () => {
  const s = C.createState();
  const r = C.chooseMove(s, { level: 'medium' });
  eq(r.reason, 'book');
  ok(['e2e4', 'd2d4', 'c2c4', 'g1f3'].includes(r.uci));
  eq(C.chooseMove(s, { level: 'easy', seed: 1 }).reason, 'search');
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
