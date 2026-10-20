// Kiểm thử engine và AI của Cờ 9 Ô. Chạy: node test.js
'use strict';
const C = require('./engine.js');
const { X, O, DRAW, EMPTY } = C;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
const sameSet = (a, b, msg) => {
  const x = [...a].sort((p, q) => p - q).join(','), y = [...b].sort((p, q) => p - q).join(',');
  if (x !== y) throw new Error(`${msg || ''} mong đợi [${y}], nhận [${x}]`);
};
const M = (b, c) => b * 9 + c; // nước: bàn nhỏ b, vị trí c

// Dựng trạng thái tùy ý trực tiếp (không qua luật) rồi tính lại các trường phụ
function stateFrom(cellsByBoard, turn, forced) {
  const s = C.createState();
  for (let b = 0; b < 9; b++) {
    const row = (cellsByBoard[b] || '.........').replace(/\s/g, '');
    for (let c = 0; c < 9; c++) s.cells[b * 9 + c] = row[c] === 'X' ? X : row[c] === 'O' ? O : EMPTY;
  }
  recompute(s);
  s.turn = turn;
  s.forced = forced;
  return s;
}
function lineOwner(arr, off) {
  for (const l of C.LINES) {
    const v = arr[off + l[0]];
    if ((v === X || v === O) && arr[off + l[1]] === v && arr[off + l[2]] === v) return v;
  }
  return 0;
}
function recompute(s) {
  s.open = 0;
  for (let b = 0; b < 9; b++) {
    let f = 0;
    for (let c = 0; c < 9; c++) if (s.cells[b * 9 + c]) f++;
    s.fill[b] = f;
    const w = lineOwner(s.cells, b * 9);
    s.boards[b] = w || (f === 9 ? DRAW : EMPTY);
    if (!s.boards[b]) s.open++;
  }
  const big = lineOwner(s.boards, 0);
  s.winner = big || (s.open === 0 ? DRAW : 0);
}

// Kiểm tra độc lập mọi bất biến của một trạng thái
function checkInvariants(s, moves) {
  let nx = 0, no = 0;
  for (let i = 0; i < 81; i++) { if (s.cells[i] === X) nx++; else if (s.cells[i] === O) no++; else ok(s.cells[i] === EMPTY, 'giá trị ô lạ'); }
  ok(nx === no || nx === no + 1, `số quân lệch: X=${nx} O=${no}`);
  eq(s.turn, nx === no ? X : O, 'lượt đi');
  eq(s.ply, nx + no, 'số nước');
  for (let b = 0; b < 9; b++) {
    const owner = lineOwner(s.cells, b * 9);
    let f = 0;
    for (let c = 0; c < 9; c++) if (s.cells[b * 9 + c]) f++;
    eq(s.fill[b], f, 'đếm ô bàn ' + b);
    // Bàn đã thắng có thể bị đối thủ không bao giờ thêm quân; owner phải khớp
    if (s.boards[b] === X || s.boards[b] === O) eq(owner, s.boards[b], 'chủ bàn nhỏ ' + b);
    else if (s.boards[b] === DRAW) { eq(f, 9, 'bàn hòa phải đầy'); eq(owner, 0, 'bàn hòa không có đường thắng'); }
    else { eq(owner, 0, 'bàn mở không được có đường thắng'); ok(f < 9, 'bàn mở không được đầy'); }
  }
  // Mỗi nước phải nằm trong bàn còn mở và đúng bàn bắt buộc (phát lại để kiểm tra)
  if (moves) {
    const r = C.createState();
    for (const m of moves) {
      const b = (m / 9) | 0;
      ok(r.cells[m] === EMPTY, 'đánh vào ô đã có quân');
      ok(r.boards[b] === EMPTY, 'đánh vào bàn đã xong');
      if (r.forced >= 0) eq(b, r.forced, 'sai bàn bắt buộc');
      C.play(r, m);
    }
  }
  const big = lineOwner(s.boards, 0);
  if (s.winner === X || s.winner === O) eq(big, s.winner, 'người thắng ván');
  else if (s.winner === DRAW) { eq(big, 0); eq(C.legalMoves(s).length, 0, 'hòa nhưng còn nước'); }
  else { eq(big, 0, 'có 3 bàn thẳng hàng mà chưa kết thúc'); ok(C.legalMoves(s).length > 0, 'chưa kết thúc mà hết nước'); }
}

console.log('Cờ 9 Ô - kiểm thử engine');

// ---- Luật ------------------------------------------------------------------
test('ván mới: X đi trước, đánh được cả 81 ô', () => {
  const s = C.createState();
  eq(s.turn, X); eq(s.forced, -1); eq(s.winner, 0);
  eq(C.legalMoves(s).length, 81);
});

test('bàn bắt buộc: vị trí vừa đánh gửi đối thủ sang bàn tương ứng', () => {
  const s = C.fromMoves([M(4, 2)]); // X đánh ô trên-phải của bàn giữa
  eq(s.forced, 2); eq(s.turn, O);
  sameSet(C.legalMoves(s), [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => M(2, c)));
  ok(!C.isLegal(s, M(4, 0)), 'không được đánh ngoài bàn bắt buộc');
  ok(C.isLegal(s, M(2, 4)));
  const t = C.applyMove(s, M(2, 4)); // O đánh ô giữa của bàn 2 -> X phải đánh bàn 4
  eq(t.forced, 4);
  ok(!C.legalMoves(t).includes(M(4, 2)), 'ô đã có quân vẫn được liệt kê');
  eq(C.legalMoves(t).length, 8);
  let threw = false;
  try { C.applyMove(t, M(0, 0)); } catch (e) { threw = true; }
  ok(threw, 'applyMove phải ném lỗi với nước sai bàn');
});

test('chọn tự do khi bàn đích đã có người thắng', () => {
  // Bàn 0 do X thắng; X đánh vị trí 0 ở bàn 5 -> đích là bàn 0 đã xong
  const t = stateFrom({ 0: 'XXX OO. ...', 3: 'O.. ... ...' }, X, 5);
  eq(t.boards[0], X);
  C.play(t, M(5, 0));
  eq(t.forced, -1, 'bàn đích đã thắng thì phải được chọn tự do');
  const moves = C.legalMoves(t);
  ok(moves.every((m) => ((m / 9) | 0) !== 0), 'không được đánh vào bàn đã thắng');
  const expected = [];
  for (let b = 1; b < 9; b++) for (let c = 0; c < 9; c++) if (!t.cells[M(b, c)]) expected.push(M(b, c));
  sameSet(moves, expected);
});

test('chọn tự do khi bàn đích đã đầy (hòa)', () => {
  const s = stateFrom({ 7: 'XOX XOO OXX' }, X, 1);
  eq(s.boards[7], DRAW, 'bàn 7 phải là hòa');
  C.play(s, M(1, 7)); // gửi O sang bàn 7 đã đầy
  eq(s.forced, -1);
  ok(C.legalMoves(s).every((m) => ((m / 9) | 0) !== 7), 'không được đánh vào bàn đã đầy');
  eq(C.legalMoves(s).length, 81 - 9 - 1);
});

test('thắng bàn nhỏ theo hàng, cột, chéo', () => {
  for (const line of C.LINES) {
    const s = C.createState();
    s.cells[M(6, line[0])] = X; s.cells[M(6, line[1])] = X; s.fill[6] = 2;
    s.turn = X; s.forced = 6;
    C.play(s, M(6, line[2]));
    eq(s.boards[6], X, 'đường ' + line.join('-'));
    const wl = C.smallWinLine(s, 6);
    sameSet(wl, line);
    eq(s.winner, 0);
  }
});

test('bàn nhỏ đầy mà không ai thắng thì hòa, không tính cho ai', () => {
  // Bàn 4 còn ô 8 trống; X đánh vào đó thì đầy và không có đường
  const s = stateFrom({ 4: 'XOX XOO OX.' }, X, 4);
  eq(s.boards[4], EMPTY);
  C.play(s, M(4, 8));
  eq(s.boards[4], DRAW);
  const cnt = C.countBoards(s);
  eq(cnt.x, 0); eq(cnt.o, 0); eq(cnt.draw, 1);
  eq(s.forced, 8, 'vị trí 8 gửi sang bàn 8 còn mở');
});

test('nước thắng bàn nhỏ gửi đối thủ đúng bàn tương ứng', () => {
  const s = stateFrom({ 4: 'XX. OO. ...' }, X, 4);
  C.play(s, M(4, 2));
  eq(s.boards[4], X);
  eq(s.forced, 2);
});

test('đánh ô giữa gửi đối thủ về chính bàn đó', () => {
  // Bàn 4 còn mở: đối thủ phải đánh tiếp trong bàn 4
  const s = C.fromMoves([M(4, 4)]);
  eq(s.forced, 4);
  // Thắng bàn 4 bằng ô giữa: đích là bàn vừa thắng nên được chọn tự do
  const t = stateFrom({ 4: 'X.. O.O ..X' }, X, 4);
  C.play(t, M(4, 4));
  eq(t.boards[4], X);
  eq(t.forced, -1);
  ok(C.legalMoves(t).every((m) => ((m / 9) | 0) !== 4), 'không được đánh vào bàn vừa thắng');
});

test('thắng bàn lớn khi có 3 bàn nhỏ thẳng hàng', () => {
  // X đã thắng bàn 0 và 4; bàn 8 còn thiếu một ô
  const s = stateFrom({ 0: 'XXX OO. ...', 4: 'XXX .O. O..', 8: 'XX. OO. ...' }, X, 8);
  eq(s.boards[0], X); eq(s.boards[4], X); eq(s.winner, 0);
  C.play(s, M(8, 2));
  eq(s.winner, X);
  sameSet(C.bigWinLine(s), [0, 4, 8]);
  eq(C.legalMoves(s).length, 0, 'hết ván thì không còn nước');
  eq(s.forced, -1);
});

test('bàn hòa không tính vào đường thắng bàn lớn', () => {
  // Bàn 0, 1 của O, bàn 2 hòa: không ai thắng ván
  const s = stateFrom({ 0: 'OOO XX. X..', 1: 'OOO XX. ..X', 2: 'XOX XOO OX.' }, X, 2);
  C.play(s, M(2, 8));
  eq(s.boards[2], DRAW);
  eq(s.winner, 0, 'bàn hòa không được tính cho O');
});

test('hòa cả ván khi không còn nước đi', () => {
  // 8 bàn đã xong, không ai có 3 bàn thẳng hàng; bàn 8 còn đúng một ô
  // Bố cục bàn lớn: X O X / X O O / O X ?  (bàn 8 sẽ hòa)
  const W = { X: 'XXX OO. ...', O: 'OOO XX. ...' };
  const layout = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X'];
  const spec = {};
  layout.forEach((p, b) => { spec[b] = W[p]; });
  spec[8] = 'XOX XOO OX.';
  const s = stateFrom(spec, X, 8);
  eq(s.winner, 0); eq(s.open, 1);
  eq(C.legalMoves(s).length, 1);
  C.play(s, M(8, 8));
  eq(s.boards[8], DRAW);
  eq(s.winner, DRAW);
  eq(C.legalMoves(s).length, 0);
  eq(C.bigWinLine(s), null);
});

test('fromMoves từ chối ván có nước sai luật', () => {
  let threw = false;
  try { C.fromMoves([M(4, 2), M(5, 0)]); } catch (e) { threw = true; }
  ok(threw, 'O phải đánh bàn 2');
  threw = false;
  try { C.fromMoves([M(4, 4), M(4, 4)]); } catch (e) { threw = true; }
  ok(threw, 'không được đánh trùng ô');
});

test('200 ván ngẫu nhiên không bao giờ sinh trạng thái sai luật', () => {
  const rng = C.mulberry32(12345);
  const results = { 1: 0, 2: 0, 3: 0 };
  for (let g = 0; g < 200; g++) {
    const s = C.createState();
    const moves = [];
    while (!s.winner) {
      const legal = C.legalMoves(s);
      ok(legal.length > 0, 'chưa kết thúc mà hết nước');
      for (const m of legal) ok(C.isLegal(s, m), 'legalMoves trả nước không hợp lệ');
      // isLegal phải từ chối mọi nước ngoài danh sách
      const set = new Set(legal);
      for (let m = 0; m < 81; m++) if (!set.has(m)) ok(!C.isLegal(s, m), 'isLegal chấp nhận nước ngoài danh sách: ' + m);
      const m = legal[(rng() * legal.length) | 0];
      moves.push(m);
      C.play(s, m);
      checkInvariants(s);
    }
    checkInvariants(s, moves);
    // Phát lại phải ra cùng trạng thái
    const r = C.fromMoves(moves);
    eq(r.winner, s.winner); eq(r.cells.join(), s.cells.join());
    results[s.winner]++;
  }
  ok(results[1] > 0 && results[2] > 0, 'phải có cả ván X thắng và O thắng');
  console.log(`       X thắng ${results[1]}, O thắng ${results[2]}, hòa ${results[3]}`);
});

// ---- AI --------------------------------------------------------------------
test('AI đi ngay nước thắng cả ván (mọi mức)', () => {
  // O đã có bàn 2 và 6; bàn 4 còn thiếu ô 8 để thắng chéo 2-4-6
  const s = stateFrom({ 2: 'OOO XX. X..', 6: 'O.. O.. O.X', 4: 'O.X .O. X..' }, O, -1);
  ok(C.findImmediateWin(s) === M(4, 8), 'findImmediateWin phải tìm thấy ô 4/8');
  for (const level of ['easy', 'medium', 'hard']) {
    for (let i = 0; i < 5; i++) {
      const r = C.chooseMove(s, { level, timeMs: 150 });
      eq(r.move, M(4, 8), 'mức ' + level);
      eq(r.reason, 'win');
    }
  }
});

test('AI chặn nước thắng ngay của đối thủ khi có thể', () => {
  // X có bàn 0 và 1, cần bàn 2. O đang đi, được chọn tự do.
  // Nếu O gửi X vào bàn 2 (đánh vị trí 2 ở bất kỳ bàn nào) X sẽ thắng bằng ô 2/2.
  const s = stateFrom({ 0: 'XXX OO. ...', 1: 'XXX .OO ...', 2: 'XX. .O. ..O' }, O, -1);
  for (let i = 0; i < 10; i++) {
    const r = C.chooseMove(s, { level: 'easy', timeMs: 80, mistake: 1 });
    const t = C.applyMove(s, r.move);
    eq(C.findImmediateWin(t), -1, 'AI để X thắng ngay bằng nước ' + r.move);
  }
});

test('AI trả nước hợp lệ trong thời gian cho phép', () => {
  const budgets = { easy: 200, medium: 800, hard: 2000 };
  for (const level of Object.keys(budgets)) {
    const s = C.fromMoves([M(4, 4), M(4, 0)]); // giữa ván sớm, nhiều lựa chọn
    const t0 = Date.now();
    const r = C.chooseMove(s, { level, mistake: 0 });
    const dt = Date.now() - t0;
    ok(C.isLegal(s, r.move), 'nước không hợp lệ: ' + r.move);
    ok(dt <= budgets[level] + 250, `mức ${level} nghĩ ${dt} ms, vượt ${budgets[level]} ms`);
    console.log(`       ${level}: ${dt} ms, ${r.iterations} lượt mô phỏng`);
  }
});

test('AI trả nước hợp lệ ở nhiều thế cờ ngẫu nhiên', () => {
  const rng = C.mulberry32(777);
  for (let g = 0; g < 30; g++) {
    const s = C.createState();
    const n = (rng() * 40) | 0;
    for (let i = 0; i < n && !s.winner; i++) {
      const legal = C.legalMoves(s);
      C.play(s, legal[(rng() * legal.length) | 0]);
    }
    if (s.winner) continue;
    const r = C.chooseMove(s, { timeMs: 30, seed: g });
    ok(C.isLegal(s, r.move), 'nước không hợp lệ ở thế ' + g);
  }
});

test('AI (MCTS ngắn) thắng áp đảo người chơi ngẫu nhiên', () => {
  const rng = C.mulberry32(99);
  let aiWins = 0, aiLosses = 0;
  for (let g = 0; g < 4; g++) {
    const s = C.createState();
    const ai = g % 2 === 0 ? X : O;
    while (!s.winner) {
      let m;
      if (s.turn === ai) m = C.chooseMove(s, { timeMs: 50, mistake: 0, seed: g * 100 + s.ply }).move;
      else { const legal = C.legalMoves(s); m = legal[(rng() * legal.length) | 0]; }
      ok(C.isLegal(s, m));
      C.play(s, m);
    }
    if (s.winner === ai) aiWins++;
    else if (s.winner !== DRAW) aiLosses++;
  }
  ok(aiWins >= 3 && aiLosses === 0, `AI thắng ${aiWins}/4, thua ${aiLosses}`);
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
process.exit(failed ? 1 : 0);
