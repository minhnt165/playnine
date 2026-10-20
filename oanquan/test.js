// Kiểm thử engine và AI của Ô Ăn Quan. Chạy: node test.js
'use strict';
const Q = require('./engine.js');
const { encode, QL, QR } = Q;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
const arr = (ta) => Array.from(ta).join(',');

// Dựng thế cờ tùy ý. bot / top: số dân 5 ô theo thứ tự trái -> phải trên màn hình
// (hàng dưới là ô 11,10,9,8,7; hàng trên là ô 1..5).
function mk(o) {
  const s = Q.createState({ quanNon: o.quanNon, quanValue: o.quanValue });
  const bot = o.bot || [5, 5, 5, 5, 5];
  const top = o.top || [5, 5, 5, 5, 5];
  for (let i = 0; i < 5; i++) { s.board[Q.ROW_LTR[0][i]] = bot[i]; s.board[Q.ROW_LTR[1][i]] = top[i]; }
  s.board[QL] = o.ql || 0;
  s.board[QR] = o.qr || 0;
  if (o.quan) { s.quan[0] = o.quan[0]; s.quan[1] = o.quan[1]; }
  if (o.capDan) { s.capDan[0] = o.capDan[0]; s.capDan[1] = o.capDan[1]; }
  if (o.capQuan) { s.capQuan[0] = o.capQuan[0]; s.capQuan[1] = o.capQuan[1]; }
  s.turn = o.turn || 0;
  return s;
}
function run(s, m) { const ev = []; Q.play(s, m, ev); return ev; }
const stopOf = (ev) => (ev.find((e) => e.t === 'stop') || {}).why;
const caps = (ev) => ev.filter((e) => e.t === 'capture');

// ---- Trạng thái đầu -----------------------------------------------------------
console.log('Trạng thái đầu');
test('5 dân mỗi ô dân, 1 quan mỗi ô quan, 10 nước hợp lệ', () => {
  const s = Q.createState();
  eq(arr(s.board), '0,5,5,5,5,5,0,5,5,5,5,5');
  eq(arr(s.quan), '1,1');
  eq(Q.totalDan(s), 50);
  eq(Q.legalMoves(s).length, 10);
  ok(Q.legalMoves(s).every((m) => Q.ownerOf(Q.houseOf(m)) === 0), 'chỉ ô hàng dưới');
});
test('chọn người đi trước, không được đi ô quan / ô trống / ô đối thủ', () => {
  const s = Q.createState({ first: 1 });
  eq(s.turn, 1);
  ok(Q.legalMoves(s).every((m) => Q.ownerOf(Q.houseOf(m)) === 1));
  ok(!Q.isLegal(s, encode(9, 1)), 'ô đối thủ');
  ok(!Q.isLegal(s, encode(QL, 1)), 'ô quan');
  const t = mk({ bot: [0, 5, 5, 5, 5] });
  ok(!Q.isLegal(t, encode(11, 1)), 'ô trống');
  let threw = false;
  try { Q.applyMove(t, encode(11, 1)); } catch (e) { threw = true; }
  ok(threw, 'applyMove phải ném lỗi');
});

// ---- Rải quân -------------------------------------------------------------------
console.log('Rải quân');
test('rải theo chiều kim đồng hồ (+1)', () => {
  const s = mk({ bot: [0, 0, 0, 0, 2], top: [3, 0, 0, 0, 0] });
  const ev = run(s, encode(7, 1));
  eq(arr(s.board), '0,3,0,0,0,0,0,0,1,1,0,0');
  eq(stopOf(ev), 'empty2');
  eq(s.turn, 1);
  eq(s.capDan[0], 0);
});
test('rải ngược chiều kim đồng hồ (-1), đi qua ô quan cũng thả quân', () => {
  const s = mk({ bot: [0, 0, 0, 0, 2], top: [3, 0, 0, 0, 0] });
  const ev = run(s, encode(7, -1));
  eq(s.board[QR], 1, 'ô quan phải nhận 1 dân');
  eq(s.board[5], 1);
  eq(s.board[7], 0);
  eq(stopOf(ev), 'empty2');
  eq(ev.filter((e) => e.t === 'drop').map((e) => e.h).join(','), '6,5');
});
test('rải tiếp khi ô kế tiếp là ô dân còn quân', () => {
  const s = mk({ bot: [0, 0, 0, 3, 1], top: [0, 0, 0, 0, 2] });
  const ev = run(s, encode(7, -1));
  eq(ev.filter((e) => e.t === 'pick').length, 2, 'bốc 2 lần');
  eq(s.board[QR], 1);
  eq(s.board[5], 0);
  eq(s.board[4], 1);
  eq(s.board[3], 1);
  eq(stopOf(ev), 'empty2');
  eq(caps(ev).length, 0);
});
test('rải tiếp sang cả hàng đối thủ rồi quay về hàng mình', () => {
  const s = Q.createState();
  // Ô 9 (+1): 10,11,QL,1,2 -> ô 3 còn quân: bốc 6 -> 4,5,QR,7,8,9 -> ô 10 có 6: bốc tiếp ...
  const ev = run(s, encode(9, 1));
  ok(ev.filter((e) => e.t === 'pick').length >= 2);
  eq(Q.totalDan(s), 50);
});

// ---- Ăn quân --------------------------------------------------------------------
console.log('Ăn quân');
test('ăn một ô: ô kế trống, ô sau có quân', () => {
  const s = mk({ bot: [0, 0, 0, 3, 1], top: [4, 0, 0, 0, 2] });
  const ev = run(s, encode(7, -1));
  const c = caps(ev);
  eq(c.length, 1);
  eq(c[0].h, 1);
  eq(c[0].dan, 4);
  eq(s.capDan[0], 4);
  eq(s.board[1], 0);
  eq(stopOf(ev), 'done', 'sau ô vừa ăn là ô quan: dừng');
  eq(Q.score(s, 0), 4);
});
test('ăn dây: ăn liên tiếp quan + 2 ô dân', () => {
  const s = mk({ bot: [2, 0, 1, 0, 0], top: [1, 3, 0, 2, 0], qr: 6 });
  const ev = run(s, encode(9, -1));
  eq(caps(ev).map((e) => e.h).join(','), '6,4,2');
  eq(s.capDan[0], 11);
  eq(s.capQuan[0], 1);
  eq(s.quan[1], 0);
  eq(Q.score(s, 0), 21);
  eq(s.board[1], 1, 'ô 1 còn quân nên dừng');
});
test('ăn quân trên hàng mình (hướng +1)', () => {
  const s = mk({ bot: [3, 0, 0, 1, 0], top: [1, 1, 1, 1, 1] });
  const ev = run(s, encode(8, 1));
  eq(caps(ev).length, 1);
  eq(caps(ev)[0].h, 11);
  eq(s.capDan[0], 3);
  eq(stopOf(ev), 'done');
});
test('hai ô trống liền nhau thì hết lượt, không ăn', () => {
  const s = mk({ bot: [0, 0, 0, 1, 0], top: [1, 1, 1, 1, 1] });
  const ev = run(s, encode(8, 1));
  eq(stopOf(ev), 'empty2');
  eq(caps(ev).length, 0);
});

// ---- Ô quan ---------------------------------------------------------------------
console.log('Ô quan');
test('gặp ô quan còn quan thì hết lượt', () => {
  const s = mk({ bot: [1, 1, 1, 1, 0], top: [1, 1, 1, 1, 1] });
  const ev = run(s, encode(8, -1));
  eq(s.board[7], 1);
  eq(stopOf(ev), 'quan');
  eq(caps(ev).length, 0);
});
test('gặp ô quan đã hết quân cũng hết lượt (không coi là ô trống)', () => {
  const s = mk({ bot: [1, 1, 1, 1, 0], top: [3, 1, 1, 1, 1], quan: [1, 0] });
  const ev = run(s, encode(8, -1));
  eq(stopOf(ev), 'quan');
  eq(caps(ev).length, 0);
});
test('quan non BẬT: ô quan còn quan và dưới 5 dân không ăn được', () => {
  const s = mk({ bot: [1, 0, 1, 0, 0], top: [1, 1, 1, 1, 1], qr: 3, quanNon: true });
  const ev = run(s, encode(9, -1));
  eq(stopOf(ev), 'quannon');
  eq(caps(ev).length, 0);
  eq(s.quan[1], 1);
  eq(s.board[QR], 3);
});
test('quan non TẮT: ăn được quan non', () => {
  const s = mk({ bot: [1, 0, 1, 0, 0], top: [1, 1, 1, 1, 1], qr: 3, quanNon: false });
  const ev = run(s, encode(9, -1));
  eq(caps(ev).length, 1);
  eq(s.capQuan[0], 1);
  eq(s.capDan[0], 3);
  eq(Q.score(s, 0), 13);
});
test('quan non BẬT nhưng đủ 5 dân thì ăn được', () => {
  const s = mk({ bot: [1, 0, 1, 0, 0], top: [1, 1, 1, 1, 1], qr: 5, quanNon: true });
  run(s, encode(9, -1));
  eq(s.capQuan[0], 1);
  eq(s.capDan[0], 5);
});
test('quan đã bị ăn: ô quan chỉ còn dân (dưới 5) vẫn ăn được', () => {
  const s = mk({ bot: [1, 0, 1, 0, 0], top: [1, 1, 1, 1, 1], qr: 2, quan: [1, 0], quanNon: true });
  run(s, encode(9, -1));
  eq(s.capDan[0], 2);
  eq(s.capQuan[0], 0);
});
test('giá trị quan đổi được', () => {
  const s = mk({ bot: [1, 0, 1, 0, 0], top: [1, 1, 1, 1, 1], qr: 5, quanValue: 5 });
  run(s, encode(9, -1));
  eq(Q.score(s, 0), 10);
});

// ---- Rải quân khi hết dân -------------------------------------------------------
console.log('Rải quân khi hết dân');
test('hết dân: lấy 5 dân đã ăn rải lại mỗi ô một viên', () => {
  // Bạn đi ô 9 (+1): thả vào ô 10, ô 11 trống, ô quan trái đã hết -> dừng. Máy hết dân.
  const s = mk({ bot: [0, 0, 1, 0, 0], top: [0, 0, 0, 0, 0], quan: [0, 1], qr: 4, capDan: [0, 8] });
  const ev = run(s, encode(9, 1));
  const sc = ev.find((e) => e.t === 'scatter');
  ok(sc, 'có sự kiện rải quân');
  eq(sc.p, 1);
  eq(sc.own, 5);
  eq(sc.borrow, 0);
  eq(arr(s.board.slice(1, 6)), '1,1,1,1,1');
  eq(s.capDan[1], 3);
  eq(s.debt[1], 0);
  eq(Q.legalMoves(s).length, 10);
});
test('không đủ 5 dân: vay đối thủ, cuối ván trả', () => {
  const s = mk({ bot: [0, 0, 1, 0, 0], top: [0, 0, 0, 0, 0], quan: [0, 1], qr: 4, capDan: [10, 2] });
  const before = Q.totalDan(s);
  const ev = run(s, encode(9, 1));
  const sc = ev.find((e) => e.t === 'scatter');
  eq(sc.own, 2);
  eq(sc.borrow, 3);
  eq(s.capDan[1], 0);
  eq(s.capDan[0], 7);
  eq(s.debt[1], 3);
  eq(Q.totalDan(s), before);
  eq(Q.score(s, 1), -3, 'điểm bên vay trừ nợ');
  eq(Q.score(s, 0), 10, 'điểm bên cho vay cộng nợ');
  // Hết ván: nợ vẫn được tính vào điểm cuối
  Q.finish(s, 'quan');
  eq(Q.score(s, 1), 5 - 3);
  eq(Q.score(s, 0), 7 + 1 + 3);
});
test('vay qua lại thì trừ bù nợ', () => {
  const s = mk({ bot: [0, 0, 1, 0, 0], top: [0, 0, 0, 0, 0], quan: [0, 1], qr: 4, capDan: [10, 2] });
  s.debt[0] = 2;
  run(s, encode(9, 1));
  eq(s.debt[0], 0);
  eq(s.debt[1], 1);
});
test('cả hai bên không còn dân để rải: hết ván', () => {
  const s = mk({ bot: [0, 0, 1, 0, 0], top: [0, 0, 0, 0, 0], quan: [0, 1], qr: 4, capDan: [0, 0], capQuan: [1, 0] });
  const ev = run(s, encode(9, 1));
  ok(s.over, 'hết ván');
  eq(s.endReason, 'stuck');
  ok(ev.some((e) => e.t === 'over'));
});

// ---- Hết ván --------------------------------------------------------------------
console.log('Hết ván');
test('ăn quan cuối cùng: hết ván, mỗi bên thu dân trên hàng mình', () => {
  const s = mk({ bot: [4, 0, 1, 0, 0], top: [2, 0, 0, 3, 1], quan: [0, 1], qr: 5, capDan: [6, 9], capQuan: [1, 0] });
  const before = Q.totalDan(s);
  const ev = run(s, encode(9, -1));
  ok(s.over, 'hết ván');
  eq(s.endReason, 'quan');
  eq(Q.totalDan(s), before);
  for (let h = 0; h < 12; h++) eq(s.board[h], 0, 'ô ' + h + ' phải trống');
  // Bạn: 6 + 5 (ô quan) + thu 4 (ô 11) + 1 (ô 8) = 16 dân, 2 quan
  eq(s.capDan[0], 16);
  eq(s.capQuan[0], 2);
  // Máy: 9 + thu 2 + 3 + 1 = 15
  eq(s.capDan[1], 15);
  eq(Q.score(s, 0), 36);
  eq(Q.score(s, 1), 15);
  eq(s.winner, 0);
  ok(ev.filter((e) => e.t === 'collect').length >= 4);
  eq(Q.legalMoves(s).length, 0);
});
test('hòa khi bằng điểm', () => {
  const s = mk({ bot: [0, 0, 0, 0, 0], top: [0, 0, 0, 0, 0], quan: [0, 0], capDan: [20, 30], capQuan: [1, 0] });
  Q.finish(s, 'quan');
  eq(s.winner, Q.DRAW);
});
test('fromMoves dựng lại đúng ván', () => {
  const rng = Q.mulberry32(7);
  const s = Q.createState({ first: 1, quanNon: false });
  const moves = [];
  for (let i = 0; i < 12 && !s.over; i++) {
    const ms = Q.legalMoves(s);
    const m = ms[(rng() * ms.length) | 0];
    moves.push(m);
    Q.play(s, m);
  }
  const t = Q.fromMoves(moves, { first: 1, quanNon: false });
  eq(arr(t.board), arr(s.board));
  eq(arr(t.capDan), arr(s.capDan));
  eq(t.turn, s.turn);
});

// ---- Bảo toàn số quân ----------------------------------------------------------
console.log('Ván ngẫu nhiên');
test('500 ván ngẫu nhiên: bảo toàn số dân và quan, luôn có nước đi, ván kết thúc', () => {
  const rng = Q.mulberry32(2024);
  let ended = 0, plies = 0, scatters = 0, borrows = 0, stuck = 0, quanNonStops = 0;
  for (let g = 0; g < 500; g++) {
    const opts = { first: g % 2, quanNon: g % 3 !== 0, quanValue: [5, 10, 15][g % 3] };
    const s = Q.createState(opts);
    for (let i = 0; i < 3000 && !s.over; i++) {
      const ms = Q.legalMoves(s);
      ok(ms.length > 0, 'ván chưa hết thì phải có nước đi');
      const ev = [];
      Q.play(s, ms[(rng() * ms.length) | 0], ev);
      plies++;
      for (const e of ev) {
        if (e.t === 'scatter') { scatters++; if (e.borrow) borrows++; }
        if (e.t === 'stop' && e.why === 'quannon') quanNonStops++;
      }
      eq(Q.totalDan(s), Q.TOTAL_DAN, 'tổng dân');
      eq(s.quan[0] + s.quan[1] + s.capQuan[0] + s.capQuan[1], 2, 'tổng quan');
      for (let h = 0; h < 12; h++) ok(s.board[h] >= 0, 'số âm');
      ok(s.capDan[0] >= 0 && s.capDan[1] >= 0, 'dân đã ăn âm');
      ok(s.debt[0] === 0 || s.debt[1] === 0, 'nợ phải trừ bù');
    }
    if (s.over) {
      ended++;
      const sum = Q.score(s, 0) + Q.score(s, 1);
      if (s.endReason === 'quan') eq(sum, Q.TOTAL_DAN + 2 * s.quanValue, 'tổng điểm cuối ván');
      else { stuck++; ok(sum <= Q.TOTAL_DAN + 2 * s.quanValue); }
    }
  }
  eq(ended, 500, 'số ván kết thúc');
  ok(scatters > 0 && borrows > 0 && quanNonStops > 0, `phải gặp đủ tình huống (rải ${scatters}, vay ${borrows}, quan non ${quanNonStops})`);
  console.log(`       ${plies} lượt, ${scatters} lần rải quân (${borrows} lần vay), ${quanNonStops} lần gặp quan non, ${stuck} ván kẹt`);
});

// ---- AI ------------------------------------------------------------------------
console.log('AI');
test('AI chọn nước ăn dây được quan (mọi mức trừ Dễ)', () => {
  const s = mk({ bot: [2, 0, 1, 0, 0], top: [1, 3, 0, 2, 0], qr: 6 });
  const want = encode(9, -1);
  for (const level of ['medium', 'hard']) {
    const r = Q.chooseMove(s, { level, seed: 1, timeMs: level === 'hard' ? 600 : undefined });
    eq(r.move, want, level);
  }
});
test('AI mức Dễ vẫn thường chọn nước ăn lớn rõ ràng', () => {
  const s = mk({ bot: [2, 0, 1, 0, 0], top: [1, 3, 0, 2, 0], qr: 6 });
  let hit = 0;
  for (let seed = 1; seed <= 20; seed++) if (Q.chooseMove(s, { level: 'easy', seed }).move === encode(9, -1)) hit++;
  ok(hit >= 14, 'Dễ chọn đúng ' + hit + '/20 lần');
});
test('AI cho bên trên (lượt 1) cũng chọn nước hợp lệ', () => {
  const s = Q.createState({ first: 1 });
  const r = Q.chooseMove(s, { level: 'medium' });
  ok(Q.isLegal(s, r.move));
});
test('AI mức Khó trả nước hợp lệ trong trần ~1,5 giây', () => {
  const s = Q.createState();
  const t0 = Date.now();
  const r = Q.chooseMove(s, { level: 'hard' });
  const ms = Date.now() - t0;
  ok(Q.isLegal(s, r.move), 'nước hợp lệ');
  ok(ms <= 1500 + 300, 'mất ' + ms + ' ms');
  console.log(`       độ sâu ${r.depth}, ${r.nodes} nút, ${ms} ms`);
});
test('mọi mức trả nước hợp lệ ở thế giữa ván, Vừa đủ nhanh', () => {
  const rng = Q.mulberry32(99);
  for (let k = 0; k < 6; k++) {
    const s = Q.createState({ first: k % 2 });
    for (let i = 0; i < 6 + k * 3 && !s.over; i++) { const ms = Q.legalMoves(s); Q.play(s, ms[(rng() * ms.length) | 0]); }
    if (s.over) continue;
    for (const level of ['easy', 'medium', 'hard']) {
      const t0 = Date.now();
      const r = Q.chooseMove(s, { level, timeMs: level === 'hard' ? 400 : undefined });
      ok(Q.isLegal(s, r.move), level + ' nước hợp lệ');
      if (level === 'medium') ok(Date.now() - t0 < 1500, 'Vừa mất ' + (Date.now() - t0) + ' ms');
    }
  }
});
test('Khó không thua Dễ trong 4 ván (đổi lượt đi trước)', () => {
  let hardWins = 0, games = 0;
  for (let g = 0; g < 4; g++) {
    const s = Q.createState({ first: g % 2 });
    const hardSide = g < 2 ? 0 : 1;
    for (let i = 0; i < 400 && !s.over; i++) {
      const level = s.turn === hardSide ? 'hard' : 'easy';
      const r = Q.chooseMove(s, { level, seed: g * 1000 + i, timeMs: level === 'hard' ? 120 : undefined });
      Q.play(s, r.move);
    }
    if (!s.over) continue;
    games++;
    if (s.winner === hardSide || s.winner === Q.DRAW) hardWins++;
  }
  ok(games > 0 && hardWins >= games - 1, `Khó thắng/hòa ${hardWins}/${games}`);
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
