// Kiểm thử engine và AI của Cờ Gánh. Chạy: node test.js
'use strict';
const G = require('./engine.js');
const { encode, idx } = G;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
const sorted = (a) => a.slice().sort((x, y) => x - y).join(',');

// Dựng thế cờ từ sơ đồ 5 dòng (dòng đầu là hàng trên cùng):
//   'X' quân bên 0 (bạn / Người 1), 'O' quân bên 1 (máy / Người 2), '.' trống
function mk(rows, o) {
  o = o || {};
  const s = G.createState({ openRule: o.openRule });
  s.board.fill(0);
  s.count[0] = s.count[1] = 0;
  rows.forEach((line, r) => {
    for (let c = 0; c < 5; c++) {
      const ch = line[c];
      if (ch === 'X') { s.board[idx(r, c)] = 1; s.count[0]++; }
      if (ch === 'O') { s.board[idx(r, c)] = 2; s.count[1]++; }
    }
  });
  s.turn = o.turn || 0;
  s.lastFrom = o.lastFrom != null ? o.lastFrom : -1;
  s.quiet = o.quiet || 0;
  s.rep = new Map([[G.posKey(s), 1]]);
  return s;
}
function run(s, m) { const ev = []; G.play(s, m, ev); return ev; }
const at = (s, r, c) => '.XO'[s.board[idx(r, c)]];
// Nước đi theo tọa độ hiển thị: mv('b2', 'c3')
const P = (name) => idx(5 - +name[1], 'abcde'.indexOf(name[0]));
const mv = (a, b) => encode(P(a), P(b));
const total = (s) => { let n = 0; for (let i = 0; i < 25; i++) if (s.board[i]) n++; return n; };

// ---- Bàn và bày quân ------------------------------------------------------------
console.log('Bàn và bày quân');
test('16 quân, 8 mỗi bên, đúng vị trí, 9 điểm trống', () => {
  const s = G.createState();
  eq(s.count[0], 8);
  eq(s.count[1], 8);
  eq(total(s), 16);
  for (const i of [20, 21, 22, 23, 24, 15, 19, 14]) eq(s.board[i], 1, 'quân dưới ở ' + G.coord(i));
  for (const i of [0, 1, 2, 3, 4, 5, 9, 10]) eq(s.board[i], 2, 'quân trên ở ' + G.coord(i));
  eq(sorted([6, 7, 8, 11, 12, 13, 16, 17, 18].filter((i) => s.board[i] === 0)), sorted([6, 7, 8, 11, 12, 13, 16, 17, 18]));
  eq(s.turn, 0);
  eq(G.createState({ first: 1 }).turn, 1);
});
test('tọa độ: cột a–e trái sang phải, hàng 1–5 dưới lên', () => {
  eq(G.coord(idx(4, 0)), 'a1');
  eq(G.coord(idx(0, 4)), 'e5');
  eq(G.coord(idx(2, 2)), 'c3');
  eq(P('b2'), idx(3, 1));
});
test('đầu ván mỗi bên có 12 nước đi', () => {
  eq(G.legalMoves(G.createState()).length, 12);
  eq(G.legalMoves(G.createState({ first: 1 })).length, 12);
});

// ---- Nước đi ----------------------------------------------------------------------
console.log('Nước đi');
test('đường chéo chỉ có ở điểm (hàng + cột) chẵn', () => {
  ok(G.hasDiag(idx(2, 2)) && G.hasDiag(idx(0, 0)) && !G.hasDiag(idx(1, 2)) && !G.hasDiag(idx(0, 1)));
  const lone = (r, c) => { const rows = ['.....', '.....', '.....', '.....', '....O']; const a = rows[r].split(''); a[c] = 'X'; rows[r] = a.join(''); return mk(rows); };
  eq(G.legalMoves(lone(2, 2)).length, 8, 'tâm bàn');
  eq(G.legalMoves(lone(0, 0)).length, 3, 'góc');
  eq(G.legalMoves(lone(1, 2)).length, 4, 'điểm lẻ không đi chéo');
  eq(sorted(G.legalMoves(lone(1, 2)).map(G.toOf)), sorted([2, 6, 8, 12]));
  eq(G.legalMoves(lone(0, 1)).length, 3, 'mép lẻ');
  eq(G.legalMoves(lone(1, 1)).length, 8, 'điểm chẵn trong bàn');
});
test('chỉ đi vào điểm trống kề bên, không đi quân đối thủ', () => {
  const s = G.createState();
  ok(!G.isLegal(s, encode(22, 12)), 'đi hai bước');
  ok(!G.isLegal(s, encode(21, 22)), 'điểm có quân');
  ok(!G.isLegal(s, encode(5, 6)), 'quân đối thủ');
  ok(!G.isLegal(s, encode(21, 17)), 'điểm lẻ đi chéo');
  ok(G.isLegal(s, encode(22, 16)), 'điểm chẵn đi chéo');
  let threw = false;
  try { G.applyMove(s, encode(22, 12)); } catch (e) { threw = true; }
  ok(threw, 'applyMove phải ném lỗi');
});

// ---- Gánh ----------------------------------------------------------------------
console.log('Gánh');
test('gánh một đường: hai quân kẹp hai bên đổi màu', () => {
  const s = mk(['O....', '.....', '.O.O.', '..X..', '.....']);
  const ev = run(s, mv('c2', 'c3'));
  eq(at(s, 2, 1), 'X');
  eq(at(s, 2, 3), 'X');
  eq(s.count[0], 3);
  eq(s.count[1], 1);
  eq(ev.filter((e) => e.t === 'ganh').length, 1);
  eq(s.quiet, 0);
  eq(s.turn, 1);
});
test('gánh hai đường cùng lúc', () => {
  const s = mk(['O....', '..O..', '.O.O.', '.XO..', '.....']);
  const ev = run(s, mv('b2', 'c3'));
  eq(ev.filter((e) => e.t === 'ganh').length, 2);
  eq(s.count[0], 5);
  eq(s.count[1], 1);
  for (const [r, c] of [[1, 2], [3, 2], [2, 1], [2, 3]]) eq(at(s, r, c), 'X', `điểm ${r},${c}`);
});
test('gánh trên đường chéo', () => {
  // X đi c4 -> c3; c3 nằm giữa b4 và d2 trên đường chéo lớn
  const s = mk(['....O', '.OX..', '.....', '...O.', '.....']);
  const ev = run(s, mv('c4', 'c3'));
  eq(ev.filter((e) => e.t === 'ganh').length, 1);
  eq(at(s, 1, 1), 'X');
  eq(at(s, 3, 3), 'X');
  eq(at(s, 0, 4), 'O');
});
test('điểm lẻ không có đường chéo nên không gánh chéo', () => {
  // X đi c3 -> c4 (điểm lẻ): b5 và d3 nằm chéo hai bên nhưng không có đường kẻ
  const s = mk(['.O...', '.....', '..XO.', '.....', '....O']);
  const ev = run(s, mv('c3', 'c4'));
  ok(ev.every((e) => e.t !== 'ganh'), 'không được gánh');
  eq(at(s, 0, 1), 'O');
  eq(at(s, 2, 3), 'O');
});
test('đi vào giữa hai quân địch không bị ăn, chỉ quân vừa đi mới gánh', () => {
  // X đi vào giữa: X gánh hai quân O, X không bị đổi màu
  const s = mk(['O....', '.....', '.O.O.', '..X..', '.....']);
  run(s, mv('c2', 'c3'));
  eq(at(s, 2, 2), 'X');
  // X đang nằm giữa O và điểm trống; O đi vào điểm còn lại không ăn được X (gánh chỉ ăn hai quân hai bên điểm đến)
  const t = mk(['.....', '...O.', '.OX..', '.....', 'X....'], { turn: 1 });
  run(t, encode(idx(1, 3), idx(2, 3)));
  eq(at(t, 2, 2), 'X', 'X bị kẹp giữa hai O vẫn là X');
  eq(t.count[0], 2);
});

// ---- Vây ----------------------------------------------------------------------
console.log('Vây');
test('vây một quân ở góc', () => {
  const s = mk(['OX...', 'X.X..', '.....', '.....', '....O']);
  const ev = run(s, encode(idx(1, 2), idx(1, 1)));
  const v = ev.filter((e) => e.t === 'vay');
  eq(v.length, 1);
  eq(sorted(v[0].pts), '0');
  eq(at(s, 0, 0), 'X');
  eq(s.count[1], 1);
});
test('vây cả nhóm quân', () => {
  // Nhóm O ở a5, b5 chỉ còn đường thoát b4; X đi vào b4 thì cả nhóm đổi màu
  const s = mk(['OOX..', 'X.X..', '.....', '.....', '....O']);
  const ev = run(s, encode(idx(1, 2), idx(1, 1)));
  const v = ev.filter((e) => e.t === 'vay');
  eq(v.length, 1);
  eq(sorted(v[0].pts), '0,1');
  eq(s.count[0], 5);
  eq(s.count[1], 1);
});
test('gánh xong mới xét vây', () => {
  // X vào c3 gánh b3, d3; sau đó quân O ở a3 hết đường thoát nên bị vây
  const s = mk(['X...O', 'XX...', 'OO.O.', 'XXX..', '.....']);
  const ev = run(s, encode(idx(3, 2), idx(2, 2)));
  eq(ev.findIndex((e) => e.t === 'ganh') < ev.findIndex((e) => e.t === 'vay'), true, 'gánh trước vây');
  eq(at(s, 2, 0), 'X');
  eq(s.count[1], 1);
});
test('không xét vây quân của bên vừa đi; lượt sau mới bị vây', () => {
  const s = mk(['XO...', 'OO...', '.....', '.....', '...X.']);
  run(s, encode(idx(4, 3), idx(4, 2)));
  eq(at(s, 0, 0), 'X', 'quân X ở a5 bị kẹt nhưng không đổi màu sau nước của X');
  run(s, encode(idx(1, 1), idx(2, 1)));
  // O đi: b4 trống nên X ở a5 có đường thoát, vẫn là X
  eq(at(s, 0, 0), 'X');
  const t = mk(['XO...', 'OO...', '.....', '.....', '...X.'], { turn: 1 });
  run(t, encode(idx(1, 1), idx(2, 2)));
  // O đi b4 -> c3 làm a5 có đường thoát b4: X không bị vây
  eq(at(t, 0, 0), 'X');
  const u = mk(['XO...', 'OO...', '.....', '.O...', '...X.'], { turn: 1 });
  run(u, encode(idx(3, 1), idx(2, 1)));
  eq(at(u, 0, 0), 'O', 'sau nước của O, quân X kẹt ở a5 bị vây');
});

// ---- Luật Mở --------------------------------------------------------------------
console.log('Luật Mở');
test('Luật Mở BẬT: bắt buộc đi vào điểm vừa mở nếu gánh được', () => {
  const s = mk(['O....', '..O..', '.XXX.', '.....', '.....'], { openRule: true });
  run(s, encode(idx(2, 2), idx(3, 2))); // X rời c3, mở c3 giữa b3 và d3
  eq(s.lastFrom, idx(2, 2));
  const lm = G.legalMoves(s);
  eq(lm.length, 1);
  eq(lm[0], encode(idx(1, 2), idx(2, 2)));
  eq(G.forcedMoves(s).length, 1);
  ok(!G.isLegal(s, encode(0, 1)), 'nước khác không hợp lệ');
  const ev = run(s, lm[0]);
  ok(ev[0].forced, 'đánh dấu nước bắt buộc');
  eq(at(s, 2, 1), 'O');
  eq(at(s, 2, 3), 'O');
});
test('Luật Mở TẮT: được đi tự do', () => {
  const s = mk(['O....', '..O..', '.XXX.', '.....', '.....'], { openRule: false });
  run(s, encode(idx(2, 2), idx(3, 2)));
  eq(G.forcedMoves(s).length, 0);
  ok(G.legalMoves(s).length > 1);
  ok(G.isLegal(s, encode(0, 1)));
});
test('Luật Mở không bắt khi đi vào điểm vừa mở mà không gánh được', () => {
  const s = mk(['O....', '..O..', '.X.X.', '..X..', '.....'], { openRule: true });
  run(s, encode(idx(3, 2), idx(4, 2))); // mở c2: O không tới được c2
  eq(G.forcedMoves(s).length, 0);
  ok(G.legalMoves(s).length > 1);
});

// ---- Hết ván --------------------------------------------------------------------
console.log('Hết ván');
test('ăn hết quân đối thủ thì thắng', () => {
  const s = mk(['.....', '.....', '.O.O.', '..X..', '.....']);
  const ev = run(s, mv('c2', 'c3'));
  ok(s.over);
  eq(s.winner, 0);
  eq(s.endReason, 'wipe');
  ok(ev.some((e) => e.t === 'over'));
  eq(G.legalMoves(s).length, 0);
});
test('đến lượt mà không còn nước đi thì thua', () => {
  const s = mk(['XO...', 'OO...', '.....', '.....', '.....'], { turn: 0 });
  eq(G.allMoves(s).length, 0);
  G.resolveEnd(s);
  ok(s.over);
  eq(s.winner, 1);
  eq(s.endReason, 'stuck');
});
test('hòa khi một thế cờ (cùng bên đi) lặp lại 3 lần', () => {
  const s = G.createState();
  const loop = [mv('c1', 'c2'), mv('c5', 'c4'), mv('c2', 'c1'), mv('c4', 'c5')];
  for (let k = 0; k < 2; k++) for (const m of loop) { ok(!s.over, 'chưa hết ván'); G.play(s, m); }
  ok(s.over, 'hết ván');
  eq(s.winner, G.DRAW);
  eq(s.endReason, 'repeat');
  eq(s.ply, 8);
});
test('hòa khi 60 nước liên tiếp không ăn quân; ăn quân thì đếm lại', () => {
  const s = mk(['O....', '.....', '.....', '.....', '....X'], { quiet: 59 });
  run(s, encode(24, 23));
  ok(s.over);
  eq(s.winner, G.DRAW);
  eq(s.endReason, 'quiet');
  const t = mk(['O....', '.....', '.O.O.', '..X..', '....X'], { quiet: 59 });
  run(t, mv('c2', 'c3'));
  ok(!t.over);
  eq(t.quiet, 0);
  const u = mk(['O....', '.....', '.....', '.....', '....X'], { quiet: 30 });
  run(u, encode(24, 23));
  eq(u.quiet, 31);
});
test('fromMoves dựng lại đúng ván (kể cả Luật Mở)', () => {
  const rng = G.mulberry32(7);
  for (const openRule of [false, true]) {
    const s = G.createState({ first: 1, openRule });
    const moves = [];
    for (let i = 0; i < 40 && !s.over; i++) {
      const ms = G.legalMoves(s);
      const m = ms[(rng() * ms.length) | 0];
      moves.push(m);
      G.play(s, m);
    }
    const t = G.fromMoves(moves, { first: 1, openRule });
    eq(t.board.join(','), s.board.join(','));
    eq(t.count.join(','), s.count.join(','));
    eq(t.turn, s.turn);
    eq(t.quiet, s.quiet);
    eq(t.lastFrom, s.lastFrom);
    eq(t.rep.size, s.rep.size);
    eq(t.over, s.over);
  }
  let threw = false;
  try { G.fromMoves([encode(22, 12)]); } catch (e) { threw = true; }
  ok(threw, 'nước sai phải ném lỗi');
});

// ---- Ván ngẫu nhiên ---------------------------------------------------------------
console.log('Ván ngẫu nhiên');
test('300 ván ngẫu nhiên: luôn đủ 16 quân, đếm quân khớp bàn, ván luôn kết thúc', () => {
  const rng = G.mulberry32(2024);
  const reasons = { wipe: 0, stuck: 0, repeat: 0, quiet: 0 };
  let plies = 0, ganh = 0, vay = 0, forced = 0;
  for (let g = 0; g < 300; g++) {
    const s = G.createState({ first: g % 2, openRule: g % 2 === 1 });
    for (let i = 0; i < 20000 && !s.over; i++) {
      const ms = G.legalMoves(s);
      ok(ms.length > 0, 'ván chưa hết thì phải có nước đi');
      const ev = [];
      G.play(s, ms[(rng() * ms.length) | 0], ev);
      plies++;
      for (const e of ev) {
        if (e.t === 'ganh') ganh++;
        if (e.t === 'vay') vay++;
        if (e.t === 'move' && e.forced) forced++;
      }
      eq(total(s), 16, 'tổng quân trên bàn');
      eq(s.count[0] + s.count[1], 16, 'tổng đếm quân');
      let c0 = 0;
      for (let k = 0; k < 25; k++) if (s.board[k] === 1) c0++;
      eq(c0, s.count[0], 'đếm quân bên 0');
    }
    ok(s.over, 'ván phải kết thúc');
    reasons[s.endReason]++;
    if (s.endReason === 'wipe') eq(s.count[s.winner], 16);
  }
  ok(ganh > 0 && vay > 0 && forced > 0, `phải gặp đủ tình huống (gánh ${ganh}, vây ${vay}, bắt buộc ${forced})`);
  eq(reasons.stuck, 0, 'nhờ luật vây, bên sắp đi không bao giờ hết nước');
  console.log(`       ${plies} nước, ${ganh} lần gánh, ${vay} lần vây, ${forced} nước bắt buộc · kết thúc: ${JSON.stringify(reasons)}`);
});

// ---- AI ------------------------------------------------------------------------
console.log('AI');
test('mọi mức trả nước hợp lệ (cả hai bên, có Luật Mở)', () => {
  const rng = G.mulberry32(99);
  for (let k = 0; k < 6; k++) {
    const s = G.createState({ first: k % 2, openRule: k >= 3 });
    for (let i = 0; i < 4 + k * 3 && !s.over; i++) { const ms = G.legalMoves(s); G.play(s, ms[(rng() * ms.length) | 0]); }
    if (s.over) continue;
    for (const level of ['easy', 'medium', 'hard']) {
      const t0 = Date.now();
      const r = G.chooseMove(s, { level, timeMs: level === 'hard' ? 300 : undefined });
      ok(G.isLegal(s, r.move), level + ' nước hợp lệ');
      if (level === 'medium') ok(Date.now() - t0 < 1500, 'Vừa mất ' + (Date.now() - t0) + ' ms');
    }
  }
});
test('AI chọn nước gánh hai đường (Vừa, Khó)', () => {
  const s = mk(['O....', '..O..', '.O.O.', '.XO..', '.....']);
  const want = encode(idx(3, 1), idx(2, 2));
  for (const level of ['medium', 'hard']) {
    const r = G.chooseMove(s, { level, timeMs: level === 'hard' ? 500 : undefined });
    eq(r.move, want, level);
  }
});
test('AI mức Khó trả nước hợp lệ trong khoảng 2 giây', () => {
  const s = G.createState();
  const t0 = Date.now();
  const r = G.chooseMove(s, { level: 'hard' });
  const ms = Date.now() - t0;
  ok(G.isLegal(s, r.move), 'nước hợp lệ');
  ok(ms <= 2000, 'mất ' + ms + ' ms');
  console.log(`       độ sâu ${r.depth}, ${r.nodes} nút, ${ms} ms`);
});
test('Khó không thua Dễ trong 4 ván (đổi bên, đổi lượt đi trước)', () => {
  let ok2 = 0, wins = 0;
  const res = [];
  for (let g = 0; g < 4; g++) {
    const s = G.createState({ first: g % 2 });
    const hardSide = g < 2 ? 0 : 1;
    for (let i = 0; i < 400 && !s.over; i++) {
      const level = s.turn === hardSide ? 'hard' : 'easy';
      const r = G.chooseMove(s, { level, seed: g * 1000 + i, timeMs: level === 'hard' ? 150 : undefined });
      G.play(s, r.move);
    }
    res.push(s.over ? (s.winner === hardSide ? 'thắng' : s.winner === G.DRAW ? 'hòa' : 'thua') + '/' + s.ply : 'dở');
    if (!s.over || s.winner === hardSide || s.winner === G.DRAW) ok2++;
    if (s.over && s.winner === hardSide) wins++;
  }
  console.log(`       Khó: ${res.join(', ')}`);
  eq(ok2, 4, 'Khó không thua ván nào');
  ok(wins >= 2, 'Khó thắng ít nhất 2/4 ván');
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
