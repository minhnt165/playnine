// Kiểm thử khối rules và ai của index.html. Chạy: node test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const block = id => {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  if (!m) throw new Error('Không tìm thấy khối script ' + id);
  return m[1];
};
const ctx = vm.createContext({});
vm.runInContext(block('rules'), ctx, { filename: 'rules.js' });
vm.runInContext(block('ai'), ctx, { filename: 'ai.js' });
const X = vm.runInContext(
  '({ RED, BLACK, EMPTY, KING, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, PAWN, SQ, idx, makePiece, colorOf, typeOf,' +
  ' createInitialBoard, makeMove, unmakeMove, genLegalMoves, isInCheck, getGameStatus, computeHash, hashMove,' +
  ' findBestMove, DIFFICULTY, NO_PROGRESS_LIMIT })',
  ctx,
);

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };

const CHAR_TYPE = { k: X.KING, a: X.ADVISOR, e: X.ELEPHANT, h: X.HORSE, r: X.ROOK, c: X.CANNON, p: X.PAWN };
// Dựng bàn cờ từ 10 dòng ký tự (chữ hoa = Đỏ, chữ thường = Đen, '.' = trống)
function boardFrom(rows) {
  const b = new Array(X.SQ).fill(X.EMPTY);
  rows.forEach((row, r) => {
    for (let c = 0; c < 9; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      b[X.idx(r, c)] = X.makePiece(ch === ch.toUpperCase() ? X.RED : X.BLACK, CHAR_TYPE[ch.toLowerCase()]);
    }
  });
  return b;
}
const mv = (fr, fc, tr, tc) => ({ from: X.idx(fr, fc), to: X.idx(tr, tc) });

// Chơi một chuỗi nước đi [fr, fc, tr, tc] và ghi lịch sử như UI làm
function playLine(b, turn, line, hist) {
  hist = hist || { hashes: [X.computeHash(b, turn)], checks: [], noCapture: 0 };
  for (const [fr, fc, tr, tc] of line) {
    const m = mv(fr, fc, tr, tc);
    ok(X.genLegalMoves(b, turn).some(x => x.from === m.from && x.to === m.to), `nước ${fr},${fc} -> ${tr},${tc} không hợp lệ`);
    const h = X.hashMove(hist.hashes[hist.hashes.length - 1], b, m);
    const cap = X.makeMove(b, m);
    turn = 1 - turn;
    hist.hashes.push(h);
    hist.checks.push(X.isInCheck(b, turn));
    hist.noCapture = cap ? 0 : hist.noCapture + 1;
  }
  return { hist, turn };
}

function perft(b, color, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of X.genLegalMoves(b, color)) {
    const cap = X.makeMove(b, m);
    n += perft(b, 1 - color, depth - 1);
    X.unmakeMove(b, m, cap);
  }
  return n;
}

// ---- Luật cơ bản ---------------------------------------------------------------
console.log('Luật cờ');
test('perft từ thế ban đầu: 44 / 1920 / 79666', () => {
  const b = X.createInitialBoard();
  eq(perft(b, X.RED, 1), 44);
  eq(perft(b, X.RED, 2), 1920);
  eq(perft(b, X.RED, 3), 79666);
});

// ---- Zobrist hash ------------------------------------------------------------
console.log('Zobrist hash');
test('hash phụ thuộc bên sắp đi', () => {
  const b = X.createInitialBoard();
  ok(X.computeHash(b, X.RED) !== X.computeHash(b, X.BLACK));
});
test('hash cập nhật dần khớp với hash tính lại, qua 40 nước ngẫu nhiên', () => {
  const b = X.createInitialBoard();
  let turn = X.RED, h = X.computeHash(b, turn);
  for (let i = 0; i < 40; i++) {
    const moves = X.genLegalMoves(b, turn);
    if (!moves.length) break;
    const m = moves[(i * 7919) % moves.length];
    h = X.hashMove(h, b, m);
    X.makeMove(b, m);
    turn = 1 - turn;
    eq(h, X.computeHash(b, turn), `sau nước ${i + 1}`);
  }
});

// ---- Luật lặp và hòa -----------------------------------------------------------
console.log('Luật lặp và hòa');
const QUIET = [
  'r...k....',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '...K....R',
];
const SHUFFLE = [[9, 8, 8, 8], [0, 0, 1, 0], [8, 8, 9, 8], [1, 0, 0, 0]];
test('lặp thế cờ lần 2 chưa kết thúc', () => {
  const b = boardFrom(QUIET);
  const { hist, turn } = playLine(b, X.RED, SHUFFLE);
  eq(X.getGameStatus(b, turn, hist).over, false);
});
test('lặp thế cờ lần 3 không chiếu: hòa', () => {
  const b = boardFrom(QUIET);
  const { hist, turn } = playLine(b, X.RED, SHUFFLE.concat(SHUFFLE));
  const st = X.getGameStatus(b, turn, hist);
  eq(st.over, true); eq(st.winner, null); eq(st.reason, 'repetition');
});

const PERPETUAL = [
  '....k...r',
  'R........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '...K.....',
];
const CHECK_CYCLE = [[1, 0, 0, 0], [0, 4, 1, 4], [0, 0, 1, 0], [1, 4, 0, 4]];
test('chiếu mãi: bên chiếu thua', () => {
  const b = boardFrom(PERPETUAL);
  const { hist, turn } = playLine(b, X.RED, CHECK_CYCLE.concat(CHECK_CYCLE));
  const st = X.getGameStatus(b, turn, hist);
  eq(st.over, true); eq(st.winner, X.BLACK); eq(st.reason, 'perpetual-check');
});
test('60 nước đôi không ăn quân: hòa', () => {
  const b = X.createInitialBoard();
  const hist = { hashes: [X.computeHash(b, X.RED)], checks: [], noCapture: X.NO_PROGRESS_LIMIT - 1 };
  eq(X.getGameStatus(b, X.RED, hist).over, false);
  hist.noCapture = X.NO_PROGRESS_LIMIT;
  const st = X.getGameStatus(b, X.RED, hist);
  eq(st.over, true); eq(st.winner, null); eq(st.reason, 'no-progress');
});
test('hai bên không còn quân tấn công: hòa', () => {
  const rows = ['...ak....', '....a....', '.........', '.........', '.........', '.........', '.........', '.........', '....A....', '...KA....'];
  const st = X.getGameStatus(boardFrom(rows), X.RED);
  eq(st.over, true); eq(st.winner, null); eq(st.reason, 'material');
  const rows2 = rows.slice(); rows2[5] = '....P....';
  eq(X.getGameStatus(boardFrom(rows2), X.RED).over, false);
});
test('không có lịch sử vẫn phát hiện chiếu bí như cũ', () => {
  const rows = ['....k....', 'R........', '.........', '........R', '.........', '.........', '.........', '.........', '.........', '...K.....'];
  const b = boardFrom(rows);
  X.makeMove(b, mv(3, 8, 0, 8));
  const st = X.getGameStatus(b, X.BLACK);
  eq(st.over, true); eq(st.winner, X.RED); eq(st.reason, 'checkmate');
});

// ---- AI ---------------------------------------------------------------------
console.log('AI');
test('có đủ ba mức độ khó với thời gian và độ sâu', () => {
  for (const k of ['easy', 'medium', 'hard']) {
    ok(X.DIFFICULTY[k], 'thiếu mức ' + k);
    ok(X.DIFFICULTY[k].maxDepth >= 1 && X.DIFFICULTY[k].timeMs > 0);
  }
});
test('tìm kiếm sâu dần tôn trọng giới hạn thời gian và trả nước hợp lệ', () => {
  const b = X.createInitialBoard();
  const t0 = Date.now();
  const res = X.findBestMove(b, X.RED, { maxDepth: 30, timeMs: 300 });
  const ms = Date.now() - t0;
  ok(ms < 700, `mất ${ms}ms`);
  ok(res.depth >= 2, `độ sâu ${res.depth}`);
  ok(X.genLegalMoves(b, X.RED).some(m => m.from === res.move.from && m.to === res.move.to), 'nước không hợp lệ');
  ok(res.nodes > 0);
});
test('tìm thấy nước thắng ngay (chiếu bí hoặc bí nước)', () => {
  const rows = ['....k....', 'R........', '.........', '........R', '.........', '.........', '.........', '.........', '.........', '...K.....'];
  const b = boardFrom(rows);
  const hist = { hashes: [X.computeHash(b, X.RED)], checks: [], noCapture: 0 };
  const res = X.findBestMove(b, X.RED, { maxDepth: 2, timeMs: 1000, hist });
  X.makeMove(b, res.move);
  const st = X.getGameStatus(b, X.BLACK);
  eq(st.over, true); eq(st.winner, X.RED);
});
test('không đi nước thua vì chiếu mãi', () => {
  // Xe bắt đầu ở hàng 2 để thế sau nước chiếu đầu tiên (chứ không phải thế
  // xuất phát) là thế đạt 3 lần: nước chiếu thứ 3 của Đỏ sẽ bị xử thua.
  const rows = PERPETUAL.slice(); rows[1] = '.........'; rows[2] = 'R........';
  const b = boardFrom(rows);
  const { hist } = playLine(b, X.RED, [[2, 0, 0, 0]].concat(CHECK_CYCLE.slice(1), CHECK_CYCLE));
  eq(X.getGameStatus(b, X.RED, hist).over, false, 'thế trước nước đi');
  // Xác nhận nước chiếu lần 3 thực sự bị xử thua
  const bad = mv(1, 0, 0, 0);
  const b2 = b.slice(), h2 = { hashes: hist.hashes.concat(X.hashMove(hist.hashes.at(-1), b2, bad)), checks: hist.checks.concat(true), noCapture: hist.noCapture + 1 };
  X.makeMove(b2, bad);
  const st = X.getGameStatus(b2, X.BLACK, h2);
  eq(st.over, true, 'nước chiếu lần 3'); eq(st.winner, X.BLACK); eq(st.reason, 'perpetual-check');
  for (let i = 0; i < 5; i++) { // lặp vài lần vì nước ở gốc được xáo trộn ngẫu nhiên
    const res = X.findBestMove(b, X.RED, { maxDepth: 1, timeMs: 500, hist });
    ok(!(res.move.from === bad.from && res.move.to === bad.to), 'vẫn chiếu lần thứ 3');
    ok(X.genLegalMoves(b, X.RED).some(m => m.from === res.move.from && m.to === res.move.to), 'nước không hợp lệ');
  }
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
process.exit(failed ? 1 : 0);
