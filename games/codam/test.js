// Kiểm thử engine và AI của Cờ Đam. Chạy: node test.js
'use strict';
const D = require('./engine.js');
const { pathOf, moveText, setup } = D;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
// Danh sách nước hợp lệ dạng ký hiệu, sắp xếp để so sánh
const texts = (s) => D.legalMoves(s).map(moveText).sort().join(' ');
// Đi một nước theo ký hiệu "c3-d4" / "c3×e5", trả về diễn biến
function go(s, txt) {
  const m = D.findMove(s, pathOf(txt));
  ok(m, 'nước không hợp lệ: ' + txt + ' (hợp lệ: ' + texts(s) + ')');
  const ev = [];
  D.play(s, m, ev);
  return ev;
}
const at = (s, name) => s.board[D.parseSq(name)];
const RULESETS = ['intl', 'english'];

// ---- Trạng thái đầu -----------------------------------------------------------
console.log('Trạng thái đầu');
for (const rules of RULESETS) {
  test(`[${rules}] 12 quân mỗi bên trên ô tối, Đen đi trước, 7 nước mỗi bên`, () => {
    const s = D.createState({ rules });
    eq(D.countPieces(s.board, 0).total, 12, 'Đen');
    eq(D.countPieces(s.board, 1).total, 12, 'Trắng');
    for (let sq = 0; sq < 64; sq++) if (s.board[sq]) ok(D.isDark(sq), 'quân trên ô sáng ' + D.sqName(sq));
    eq(at(s, 'a1'), 1);
    eq(at(s, 'h8'), -1);
    eq(s.turn, 0);
    eq(texts(s), 'a3-b4 c3-b4 c3-d4 e3-d4 e3-f4 g3-f4 g3-h4');
    go(s, 'c3-d4');
    eq(s.turn, 1);
    eq(D.legalMoves(s).length, 7, 'Trắng');
    ok(D.legalMoves(s).every((m) => D.rowOf(m.to) === 4), 'Trắng đi xuống');
  });
}
test('ký hiệu ô và nước đi', () => {
  eq(D.sqName(0), 'a1');
  eq(D.sqName(63), 'h8');
  eq(D.parseSq('c3'), 18);
  eq(pathOf('c3×e5×g7').join(','), '18,36,54');
  eq(pathOf('c3-d4').join(','), '18,27');
  const s = D.createState();
  eq(moveText(D.findMove(s, pathOf('c3-d4'))), 'c3-d4');
});

// ---- Ăn quân --------------------------------------------------------------------
console.log('Ăn quân');
for (const rules of RULESETS) {
  test(`[${rules}] ăn quân là bắt buộc`, () => {
    const s = setup({ c3: 'o', g3: 'o', d4: 'x', h8: 'x' }, { rules });
    eq(texts(s), 'c3×e5');
    const ev = go(s, 'c3×e5');
    eq(at(s, 'd4'), 0, 'quân bị ăn đã nhấc');
    eq(at(s, 'e5'), 1);
    eq(ev.filter((e) => e.t === 'step').length, 1);
    eq(ev.find((e) => e.t === 'remove').squares.join(','), String(D.parseSq('d4')));
  });
  test(`[${rules}] ăn liên tiếp trong cùng lượt, không được dừng giữa chừng`, () => {
    const s = setup({ c3: 'o', d4: 'x', f6: 'x', a7: 'x' }, { rules });
    eq(texts(s), 'c3×e5×g7');
    const ev = go(s, 'c3×e5×g7');
    eq(D.countPieces(s.board, 1).total, 1);
    eq(ev.filter((e) => e.t === 'step').map((e) => D.sqName(e.cap)).join(','), 'd4,f6');
    eq(s.turn, 1);
  });
}
test('[intl] quân thường ăn lùi', () => {
  const s = setup({ e5: 'o', d4: 'x', h8: 'x' }, { rules: 'intl' });
  eq(texts(s), 'e5×c3');
});
test('[english] quân thường không được ăn lùi', () => {
  const s = setup({ e5: 'o', d4: 'x', h8: 'x' }, { rules: 'english' });
  eq(texts(s), 'e5-d6 e5-f6');
  const t = setup({ d4: 'x', e3: 'o', h8: 'o' }, { rules: 'english', turn: 1 });
  eq(texts(t), 'd4×f2', 'Trắng ăn về phía trước (đi xuống)');
});
test('[intl] không nhảy qua một quân hai lần (vòng ăn quay về ô xuất phát)', () => {
  const s = setup({ c3: 'o', d4: 'x', f4: 'x', f2: 'x', d2: 'x', h8: 'x' }, { rules: 'intl' });
  const ms = D.legalMoves(s);
  eq(ms.length, 2, 'hai chiều vòng');
  for (const m of ms) {
    eq(m.caps.length, 4, moveText(m));
    eq(new Set(m.caps).size, 4, 'không trùng quân bị ăn');
    eq(D.sqName(m.to), 'c3', 'quay về ô xuất phát');
  }
  eq(texts(s), 'c3×e1×g3×e5×c3 c3×e5×g3×e1×c3');
  go(s, 'c3×e5×g3×e1×c3');
  eq(D.countPieces(s.board, 1).total, 1);
  eq(at(s, 'c3'), 1);
});
test('[english] cùng thế đó chỉ ăn được một quân về phía trước', () => {
  const s = setup({ c3: 'o', d4: 'x', f4: 'x', f2: 'x', d2: 'x', h8: 'x' }, { rules: 'english' });
  eq(texts(s), 'c3×e5');
});
test('[intl] quân bị ăn vẫn chắn đường tới hết chuỗi', () => {
  // Vua a1 ăn d4 đáp e5/f6; quân bị ăn d4 chưa nhấc nên không thể quay lại qua đường a1–h8
  const s = setup({ a1: 'O', d4: 'x', h8: 'x' }, { rules: 'intl' });
  eq(texts(s), 'a1×e5 a1×f6 a1×g7');
});

// ---- Vua ------------------------------------------------------------------------
console.log('Vua');
test('[intl] vua bay đi xa theo đường chéo', () => {
  const s = setup({ a1: 'O', h2: 'x' }, { rules: 'intl' });
  eq(D.legalMoves(s).length, 7);
  eq(texts(s), 'a1-b2 a1-c3 a1-d4 a1-e5 a1-f6 a1-g7 a1-h8');
});
test('[intl] vua ăn xa, chọn được nhiều ô đáp', () => {
  const s = setup({ a1: 'O', d4: 'x', b8: 'x' }, { rules: 'intl' });
  eq(texts(s), 'a1×e5 a1×f6 a1×g7 a1×h8');
  go(s, 'a1×g7');
  eq(at(s, 'g7'), 2);
  eq(at(s, 'd4'), 0);
});
test('[intl] vua phải đáp vào ô ăn tiếp được (luật Nga)', () => {
  const s = setup({ a1: 'O', d4: 'x', g5: 'x', a8: 'x' }, { rules: 'intl' });
  eq(texts(s), 'a1×f6×h4');
});
test('[english] vua đi và ăn một ô theo mọi hướng', () => {
  const s = setup({ d4: 'O', h8: 'x' }, { rules: 'english' });
  eq(texts(s), 'd4-c3 d4-c5 d4-e3 d4-e5');
  const t = setup({ d4: 'O', e3: 'x', b6: 'x', a1: 'x' }, { rules: 'english' });
  eq(texts(t), 'd4×f2', 'vua ăn lùi được, quân cách xa thì không');
  const u = setup({ a1: 'O', d4: 'x', h8: 'x' }, { rules: 'english' });
  eq(texts(u), 'a1-b2', 'vua không ăn xa');
});

// ---- Phong vua --------------------------------------------------------------------
console.log('Phong vua');
test('[intl] lên vua giữa chuỗi ăn thì ăn tiếp như vua', () => {
  const s = setup({ b6: 'o', c7: 'x', f6: 'x', a1: 'x' }, { rules: 'intl' });
  eq(texts(s), 'b6×d8×g5 b6×d8×h4');
  const m = D.findMove(s, pathOf('b6×d8×h4'));
  eq(m.promoteAt, 1, 'lên vua ở bước 1');
  const ev = go(s, 'b6×d8×h4');
  eq(at(s, 'h4'), 2, 'kết thúc là vua');
  ok(ev.find((e) => e.t === 'step' && e.promote && D.sqName(e.to) === 'd8'), 'diễn biến lên vua ở d8');
  eq(D.countPieces(s.board, 1).total, 1);
});
test('[english] lên vua là hết lượt', () => {
  const s = setup({ b6: 'o', c7: 'x', e7: 'x', a1: 'x' }, { rules: 'english' });
  eq(texts(s), 'b6×d8');
  go(s, 'b6×d8');
  eq(at(s, 'd8'), 2);
  eq(at(s, 'e7'), -1, 'quân e7 chưa bị ăn');
  eq(s.turn, 1);
});
for (const rules of RULESETS) {
  test(`[${rules}] đi thường tới hàng cuối thì lên vua`, () => {
    const s = setup({ c7: 'o', a1: 'x' }, { rules });
    go(s, 'c7-d8');
    eq(at(s, 'd8'), 2);
    const t = setup({ d2: 'x', h8: 'o' }, { rules, turn: 1 });
    go(t, 'd2-e1');
    eq(at(t, 'e1'), -2, 'Trắng lên vua ở hàng 1');
  });
}

// ---- Hết ván --------------------------------------------------------------------
console.log('Hết ván');
for (const rules of RULESETS) {
  test(`[${rules}] thắng khi đối thủ hết quân`, () => {
    const s = setup({ c3: 'o', d4: 'x' }, { rules });
    const ev = go(s, 'c3×e5');
    ok(s.over);
    eq(s.winner, 0);
    eq(s.endReason, 'nopieces');
    eq(ev[ev.length - 1].t, 'over');
    eq(D.legalMoves(s).length, 0, 'hết ván không còn nước');
  });
  test(`[${rules}] thắng khi đối thủ hết nước đi`, () => {
    const s = setup({ b2: 'o', c1: 'o', h2: 'o', a3: 'x' }, { rules });
    ok(!s.over);
    go(s, 'h2-g3');
    ok(s.over);
    eq(s.winner, 0);
    eq(s.endReason, 'nomoves');
  });
  test(`[${rules}] hòa khi lặp thế 3 lần`, () => {
    const s = setup({ c1: 'O', f8: 'X' }, { rules });
    const cycle = ['c1-d2', 'f8-e7', 'd2-c1', 'e7-f8'];
    for (const m of cycle) go(s, m);
    ok(!s.over, 'lặp 2 lần chưa hòa');
    eq(D.repetitions(s), 2);
    for (const m of cycle.slice(0, 3)) go(s, m);
    ok(!s.over);
    go(s, cycle[3]);
    ok(s.over, 'lặp lần 3');
    eq(s.winner, D.DRAW);
    eq(s.endReason, 'repetition');
  });
  test(`[${rules}] hòa sau 30 nước mỗi bên chỉ đi vua, không ăn`, () => {
    const s = setup({ c1: 'O', a7: 'o', f8: 'X', h4: 'x' }, { rules });
    go(s, 'c1-d2');
    eq(s.quiet, 1, 'đi vua: đếm');
    go(s, 'h4-g3');
    eq(s.quiet, 0, 'đi quân thường: về 0');
    // Hai vua đi vòng không lặp thế: đặt sẵn bộ đếm rồi đi tiếp
    s.quiet = D.KING_DRAW_PLIES - 2;
    go(s, 'd2-e3');
    ok(!s.over);
    go(s, 'f8-e7');
    ok(s.over, 'đủ 60 lượt');
    eq(s.winner, D.DRAW);
    eq(s.endReason, 'kings');
  });
}
test('đếm lượt chỉ đi vua về 0 khi ăn quân', () => {
  const s = setup({ a1: 'O', h2: 'X', d4: 'x', b8: 'x' }, { rules: 'english' });
  go(s, 'a1-b2');
  go(s, 'h2-g3');
  eq(s.quiet, 2);
  go(s, 'b2-c3');
  go(s, 'd4×b2');
  eq(s.quiet, 0);
});

// ---- Dựng lại ván + ván ngẫu nhiên ---------------------------------------------
console.log('Dựng lại ván, ván ngẫu nhiên');
for (const rules of RULESETS) {
  test(`[${rules}] fromMoves dựng lại đúng ván, ném lỗi khi gặp nước sai`, () => {
    const rng = D.mulberry32(rules === 'intl' ? 7 : 8);
    const s = D.createState({ rules });
    const paths = [];
    for (let i = 0; i < 80 && !s.over; i++) {
      const ms = D.legalMoves(s);
      const m = ms[(rng() * ms.length) | 0];
      paths.push(m.path.slice());
      D.play(s, m);
    }
    const t = D.fromMoves(JSON.parse(JSON.stringify(paths)), { rules });
    eq(Array.from(t.board).join(','), Array.from(s.board).join(','), 'bàn');
    eq(t.turn, s.turn);
    eq(t.quiet, s.quiet);
    eq(t.over, s.over);
    eq(t.hist.join(','), s.hist.join(','), 'lịch sử thế cờ');
    let threw = false;
    try { D.fromMoves([pathOf('c3-c4')], { rules }); } catch (e) { threw = true; }
    ok(threw, 'nước sai phải ném lỗi');
    threw = false;
    try { D.applyMove(D.createState({ rules }), pathOf('d6-c5')); } catch (e) { threw = true; }
    ok(threw, 'đi quân đối thủ phải ném lỗi');
  });
  test(`[${rules}] 300 ván ngẫu nhiên: số quân luôn khớp, ván nào cũng kết thúc`, () => {
    const rng = D.mulberry32(rules === 'intl' ? 2024 : 2025);
    const R = D.RULES[rules];
    let plies = 0, multi = 0, promos = 0, flying = 0;
    const reasons = {};
    for (let g = 0; g < 300; g++) {
      const s = D.createState({ rules });
      for (let i = 0; i < 4000 && !s.over; i++) {
        const ms = D.legalMoves(s);
        ok(ms.length > 0, 'ván chưa hết thì phải có nước đi');
        const side = s.turn;
        const m = ms[(rng() * ms.length) | 0];
        const before = [D.countPieces(s.board, 0), D.countPieces(s.board, 1)];
        if (m.caps.length > 1) multi++;
        if (m.promoteAt >= 0) promos++;
        if (D.isKing(m.piece) && Math.abs(D.rowOf(m.to) - D.rowOf(m.path[m.path.length - 2] !== undefined ? m.path[m.path.length - 2] : m.from)) > 2) flying++;
        D.play(s, m);
        plies++;
        const after = [D.countPieces(s.board, 0), D.countPieces(s.board, 1)];
        eq(after[side].total, before[side].total, 'bên đi không mất quân');
        eq(after[1 - side].total, before[1 - side].total - m.caps.length, 'bên kia mất đúng số quân bị ăn');
        eq(after[side].kings, before[side].kings + (m.promoteAt >= 0 ? 1 : 0), 'số vua');
        eq(new Set(m.caps).size, m.caps.length, 'không ăn một quân hai lần');
        for (const sq of D.DARK) {
          const v = s.board[sq];
          if (v === 1) ok(D.rowOf(sq) !== 7, 'quân thường Đen ở hàng cuối phải là vua');
          if (v === -1) ok(D.rowOf(sq) !== 0, 'quân thường Trắng ở hàng cuối phải là vua');
        }
        for (let sq = 0; sq < 64; sq++) if (!D.isDark(sq)) eq(s.board[sq], 0, 'ô sáng');
      }
      ok(s.over, 'ván phải kết thúc');
      reasons[s.endReason] = (reasons[s.endReason] || 0) + 1;
    }
    ok(multi > 0 && promos > 0, `phải gặp ăn liên tiếp (${multi}) và lên vua (${promos})`);
    if (R.flyingKing) ok(flying > 0, 'phải gặp vua bay');
    console.log(`       ${plies} lượt, ${multi} chuỗi ăn, ${promos} lần lên vua, kết thúc: ${JSON.stringify(reasons)}`);
  });
}

// ---- AI ------------------------------------------------------------------------
console.log('AI');
for (const rules of RULESETS) {
  test(`[${rules}] mọi mức trả nước hợp lệ, cả khi máy cầm Trắng`, () => {
    const rng = D.mulberry32(rules === 'intl' ? 99 : 98);
    for (let k = 0; k < 4; k++) {
      const s = D.createState({ rules });
      for (let i = 0; i < 4 + k * 7 && !s.over; i++) { const ms = D.legalMoves(s); D.play(s, ms[(rng() * ms.length) | 0]); }
      if (s.over) continue;
      for (const level of ['easy', 'medium', 'hard']) {
        const t0 = Date.now();
        const r = D.chooseMove(s, { level, timeMs: level === 'hard' ? 300 : undefined });
        ok(D.isLegal(s, r.move), level + ' nước hợp lệ');
        if (level === 'medium') ok(Date.now() - t0 < 2500, 'Vừa mất ' + (Date.now() - t0) + ' ms');
      }
    }
  });
  test(`[${rules}] AI chọn chuỗi ăn hai quân thắng ngay thay vì ăn một`, () => {
    // Đen có hai nước ăn: c3×e5×g7 (2 quân, thắng ngay) hoặc e3×c5 (1 quân)
    const s = setup({ c3: 'o', e3: 'o', d4: 'x', f6: 'x' }, { rules });
    eq(texts(s), 'c3×e5×g7 e3×c5');
    for (const level of ['medium', 'hard']) {
      const r = D.chooseMove(s, { level, timeMs: level === 'hard' ? 400 : undefined });
      eq(moveText(D.findMove(s, r.move)), 'c3×e5×g7', level);
    }
  });
}
test('AI mức Khó trả nước hợp lệ trong khoảng 2 giây', () => {
  for (const rules of RULESETS) {
    const s = D.createState({ rules });
    const t0 = Date.now();
    const r = D.chooseMove(s, { level: 'hard' });
    const ms = Date.now() - t0;
    ok(D.isLegal(s, r.move), 'nước hợp lệ');
    ok(ms <= 2000, 'mất ' + ms + ' ms');
    console.log(`       [${rules}] độ sâu ${r.depth}, ${r.nodes} nút, ${ms} ms`);
  }
});
test('Khó thắng Dễ trong phần lớn các ván (đổi bên, cả hai luật)', () => {
  let hardWins = 0, draws = 0, games = 0;
  for (let g = 0; g < 4; g++) {
    const rules = RULESETS[g >> 1];
    const hardSide = g % 2;
    const s = D.createState({ rules });
    for (let i = 0; i < 400 && !s.over; i++) {
      const level = s.turn === hardSide ? 'hard' : 'easy';
      const r = D.chooseMove(s, { level, seed: g * 1000 + i, timeMs: level === 'hard' ? 150 : undefined });
      D.play(s, D.findMove(s, r.move));
    }
    games++;
    if (s.over && s.winner === hardSide) hardWins++;
    else if (!s.over || s.winner === D.DRAW) draws++;
  }
  console.log(`       Khó thắng ${hardWins}/${games}, hòa ${draws}`);
  ok(hardWins >= games - 1, `Khó thắng ${hardWins}/${games}`);
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) process.exit(1);
