/* Kiểm tra engine Bất Đẳng: chạy `node test.js`
 * - Luật: trùng hàng / cột, dấu bất đẳng thức bị vi phạm, thắng khi đủ ô và đúng mọi luật
 * - Bộ giải: đếm nghiệm đúng trên đề dựng tay (một nghiệm, nhiều nghiệm, vô nghiệm) và khớp với
 *   phép đếm vét cạn trên toàn bộ 576 hình vuông Latin 4×4 với nhiều bộ manh mối ngẫu nhiên
 * - Sinh đề: tất định theo seed, lời giải là hình vuông Latin, manh mối khớp lời giải, nghiệm DUY NHẤT
 *   (bộ giải đếm tới 2) và giải được bằng suy luận trên nhiều seed cho mọi mode; đo thời gian sinh
 * - Chơi: điền số, ghi chú (tự xóa khi điền nếu bật), xóa, hoàn tác / làm lại, gợi ý (sửa lỗi / suy ra)
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
    console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e));
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

const { LT, GT } = E;

/** Đề dựng tay: lưới chữ (số = cho sẵn, '.' = trống), dấu ngang / dọc theo từng hàng. */
function hand(n, givens, hs, vs) {
  return {
    n,
    givens: givens.split('').filter((c) => c !== ' ').map((c) => (c === '.' ? 0 : Number(c))),
    hs: hs || new Array(n * (n - 1)).fill(0),
    vs: vs || new Array((n - 1) * n).fill(0),
  };
}

/** Hình vuông Latin có phải lời giải của đề không (đúng số cho sẵn và mọi dấu). */
function fits(p, sq) {
  const n = p.n;
  if (p.givens.some((v, i) => v && sq[i] !== v)) return false;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n - 1; c++) {
      const s = p.hs[r * (n - 1) + c];
      const a = sq[r * n + c];
      const b = sq[r * n + c + 1];
      if ((s === LT && !(a < b)) || (s === GT && !(a > b))) return false;
    }
  }
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n; c++) {
      const s = p.vs[r * n + c];
      const a = sq[r * n + c];
      const b = sq[(r + 1) * n + c];
      if ((s === LT && !(a < b)) || (s === GT && !(a > b))) return false;
    }
  }
  return true;
}

/** Mọi hình vuông Latin n×n (vét cạn, chỉ dùng cho n = 4: 576 hình). */
function allLatin(n) {
  const out = [];
  const g = new Array(n * n).fill(0);
  (function rec(i) {
    if (i === n * n) {
      out.push(g.slice());
      return;
    }
    const r = Math.floor(i / n);
    const c = i % n;
    for (let v = 1; v <= n; v++) {
      let bad = false;
      for (let x = 0; x < c && !bad; x++) if (g[r * n + x] === v) bad = true;
      for (let y = 0; y < r && !bad; y++) if (g[y * n + c] === v) bad = true;
      if (bad) continue;
      g[i] = v;
      rec(i + 1);
    }
    g[i] = 0;
  })(0);
  return out;
}

function isLatin(n, sq) {
  const full = (1 << n) - 1;
  for (let x = 0; x < n; x++) {
    let rm = 0;
    let cm = 0;
    for (let y = 0; y < n; y++) {
      rm |= 1 << (sq[x * n + y] - 1);
      cm |= 1 << (sq[y * n + x] - 1);
    }
    if (rm !== full || cm !== full) return false;
  }
  return true;
}

/** Điền đúng lời giải vào mọi ô trống (bỏ qua ô `skip`). */
function fillAll(g, skip) {
  let x = g;
  for (let i = 0; i < g.n * g.n; i++) if (i !== skip && !g.givens[i]) x = E.setValue(x, i, g.sol[i]);
  return x;
}

const empties = (g) => g.vals.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

/* ---------------- Luật ---------------- */

test('luật: phát hiện trùng hàng, trùng cột', () => {
  let g = E.newGame({ mode: '5', seed: 11 });
  const free = empties(g);
  // Hai ô trống cùng hàng: điền cùng một số
  const a = free[0];
  const r = Math.floor(a / 5);
  const b = free.find((i) => i !== a && Math.floor(i / 5) === r);
  ok(b != null, 'cần hai ô trống cùng hàng');
  const v = g.sol[a];
  g = E.setValue(g, a, v);
  g = E.setValue(g, b, v);
  const st = E.check(g);
  ok(st.dup.indexOf(a) >= 0 && st.dup.indexOf(b) >= 0, 'phải báo trùng hàng');
  // Trùng cột: một ô cùng cột với a
  let h = E.newGame({ mode: '5', seed: 11 });
  const c = a % 5;
  const d = empties(h).find((i) => i !== a && i % 5 === c);
  if (d != null) {
    h = E.setValue(h, a, 3);
    h = E.setValue(h, d, 3);
    ok(E.check(h).dup.indexOf(d) >= 0, 'phải báo trùng cột');
  }
});

test('luật: trùng với số cho sẵn cũng tính là trùng', () => {
  const g0 = E.newGame({ mode: '6', seed: 4 });
  const gi = g0.givens.findIndex((v) => v);
  ok(gi >= 0, 'đề cần ít nhất một số cho sẵn');
  const n = g0.n;
  const r = Math.floor(gi / n);
  const j = empties(g0).find((i) => Math.floor(i / n) === r);
  ok(j != null);
  const g = E.setValue(g0, j, g0.givens[gi]);
  const st = E.check(g);
  ok(st.dup.indexOf(j) >= 0 && st.dup.indexOf(gi) >= 0);
});

test('luật: dấu bị vi phạm khi cả hai ô đã điền và sai quan hệ; chưa đủ hai ô thì không báo', () => {
  const p = hand(4, '.... .... .... ....');
  p.hs[0] = LT; // ô (0,0) < ô (0,1)
  p.vs[0] = GT; // ô (0,0) > ô (1,0)
  const g0 = E.fromPuzzle(Object.assign({ mode: null, sol: [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3] }, p));
  let g = E.setValue(g0, 0, 3);
  eq(E.check(g).badH, [], 'mới một ô');
  g = E.setValue(g, 1, 2);
  eq(E.check(g).badH, [0]);
  g = E.setValue(g, 4, 1);
  eq(E.check(g).badV, [], '3 > 1 đúng');
  g = E.setValue(g, 4, 4);
  eq(E.check(g).badV, [0]);
  // Hai số bằng nhau sai cả < lẫn >
  g = E.setValue(g, 1, 3);
  eq(E.check(g).badH, [0], '3 < 3 sai');
  g = E.setValue(g, 4, 3);
  eq(E.check(g).badV, [0], '3 > 3 sai');
});

test('luật: thắng khi điền đủ, đúng hàng / cột / dấu; còn một ô trống thì chưa', () => {
  const g0 = E.newGame({ mode: '5', seed: 7 });
  const last = empties(g0).pop();
  const almost = fillAll(g0, last);
  ok(!E.isSolved(almost));
  const done = E.setValue(almost, last, g0.sol[last]);
  ok(E.isSolved(done));
  eq(E.check(done).dup, []);
  // Đã thắng thì không sửa được nữa
  eq(E.setValue(done, last, (g0.sol[last] % 5) + 1), done);
  eq(E.erase(done, last), done);
});

test('luật: đủ ô nhưng vi phạm dấu thì chưa thắng', () => {
  // Đề 4×4 rỗng có một dấu; điền hình vuông Latin không thỏa dấu
  const sq = [1, 2, 3, 4, 2, 1, 4, 3, 3, 4, 1, 2, 4, 3, 2, 1];
  const p = hand(4, '.... .... .... ....');
  p.hs[0] = GT;
  const g0 = E.fromPuzzle(Object.assign({ mode: null, sol: [2, 1, 4, 3, 1, 2, 3, 4, 3, 4, 1, 2, 4, 3, 2, 1] }, p));
  let g = g0;
  sq.forEach((v, i) => { g = E.setValue(g, i, v); });
  ok(!E.isSolved(g), '1 > 2 sai');
  eq(E.check(g).badH, [0]);
});

/* ---------------- Bộ giải ---------------- */

test('bộ giải: đề dựng tay có đúng một nghiệm', () => {
  // Hàng đầu 1<2<3<4 và cột đầu tăng dần, thêm hai số cho sẵn
  const p = hand(4, '.... .1.. .... ...2');
  p.hs[0] = LT; p.hs[1] = LT; p.hs[2] = LT;
  p.vs[0] = LT; p.vs[4] = LT; p.vs[8] = LT;
  const latin = allLatin(4).filter((sq) => fits(p, sq));
  eq(latin.length, 1, 'vét cạn');
  const res = E.solve(p, 2);
  eq(res.count, 1);
  eq(res.solutions[0], latin[0]);
});

test('bộ giải: đề thiếu manh mối có nhiều nghiệm (dừng ở 2)', () => {
  const p = hand(4, '.... .... .... ....');
  eq(E.solve(p, 2).count, 2);
  p.hs[0] = LT;
  eq(E.countSolutions(p), 2);
  eq(E.countSolutions(p, 10), 10);
});

test('bộ giải: đề mâu thuẫn không có nghiệm', () => {
  // Ô (0,0) = 4 mà phải nhỏ hơn ô bên phải
  const p = hand(4, '4... .... .... ....');
  p.hs[0] = LT;
  eq(E.countSolutions(p), 0);
  // Vòng dấu: a < b < d < c < a
  const q = hand(4, '.... .... .... ....');
  q.hs[0] = LT; q.vs[1] = LT; q.hs[3] = GT; q.vs[0] = GT;
  eq(E.countSolutions(q), 0);
  // Hai số trùng hàng
  eq(E.countSolutions(hand(4, '1..1 .... .... ....')), 0);
});

test('bộ giải: khớp phép đếm vét cạn với 300 bộ manh mối ngẫu nhiên trên lưới 4×4', () => {
  const all = allLatin(4);
  eq(all.length, 576);
  const r = E.makeRng(99);
  const seen = { 0: 0, 1: 0, 2: 0 };
  for (let k = 0; k < 300; k++) {
    const base = all[r.int(all.length)];
    const p = hand(4, '.... .... .... ....');
    // Manh mối lấy từ một hình vuông thật (thường có nghiệm), đôi khi lật dấu để có đề vô nghiệm
    for (let i = 0; i < 16; i++) if (r() < 0.12) p.givens[i] = base[i];
    for (let i = 0; i < 12; i++) if (r() < 0.35) p.hs[i] = base[Math.floor(i / 3) * 4 + (i % 3)] < base[Math.floor(i / 3) * 4 + (i % 3) + 1] ? LT : GT;
    for (let i = 0; i < 12; i++) if (r() < 0.35) p.vs[i] = base[i] < base[i + 4] ? LT : GT;
    if (r() < 0.15) p.hs[r.int(12)] = 1 + r.int(2);
    const brute = Math.min(2, all.filter((sq) => fits(p, sq)).length);
    eq(E.countSolutions(p), brute, 'bộ thứ ' + k);
    seen[brute]++;
  }
  ok(seen[0] > 0 && seen[1] > 0 && seen[2] > 0, 'cần đủ cả ba loại: ' + JSON.stringify(seen));
});

test('suy luận: đề dựng tay giải được bằng lan truyền, đề nhiều nghiệm thì không', () => {
  const p = hand(4, '.... .1.. .... ...2');
  p.hs[0] = LT; p.hs[1] = LT; p.hs[2] = LT;
  p.vs[0] = LT; p.vs[4] = LT; p.vs[8] = LT;
  ok(E.logicSolvable(p, 1));
  ok(!E.logicSolvable(hand(4, '.... .... .... ....'), 2));
});

/* ---------------- Sinh đề ---------------- */

const SEEDS = { 5: 60, 6: 40, 7: 30, daily: 15 };

E.MODE_KEYS.forEach((m) => {
  test('sinh đề mode ' + m + ': lời giải Latin, manh mối khớp, nghiệm duy nhất, giải được bằng suy luận (' + SEEDS[m] + ' seed)', () => {
    const spec = E.MODES[m];
    for (let s = 0; s < SEEDS[m]; s++) {
      const seed = m === 'daily' ? E.dailySeed('2026-11-' + String(s + 1).padStart(2, '0')) : 1000 + s * 7919;
      const p = E.generate(m, seed);
      const n = spec.n;
      eq(p.n, n);
      ok(isLatin(n, p.sol), 'lời giải không phải Latin, seed ' + seed);
      ok(fits(p, p.sol), 'manh mối không khớp lời giải, seed ' + seed);
      const res = E.solve(p, 2);
      eq(res.count, 1, 'số nghiệm, seed ' + seed);
      eq(res.solutions[0], p.sol, 'nghiệm khác lời giải, seed ' + seed);
      ok(E.logicSolvable(p, spec.level), 'không giải được bằng suy luận mức ' + spec.level + ', seed ' + seed);
      const cc = E.clueCount(p);
      ok(cc.givens <= spec.maxGivens, 'quá nhiều số cho sẵn: ' + cc.givens + ', seed ' + seed);
      ok(cc.signs >= 1, 'đề phải có dấu');
    }
  });
});

test('sinh đề: tất định theo seed, seed khác cho đề khác', () => {
  E.MODE_KEYS.forEach((m) => {
    eq(E.generate(m, 123), E.generate(m, 123), 'mode ' + m);
    ok(JSON.stringify(E.generate(m, 123)) !== JSON.stringify(E.generate(m, 124)), 'mode ' + m);
  });
  eq(E.dailySeed('2026-10-24'), E.dailySeed('2026-10-24'));
  ok(E.dailySeed('2026-10-24') !== E.dailySeed('2026-10-25'));
  const a = E.newGame({ mode: 'daily', seed: 5, date: '2026-10-24' });
  const b = E.newGame({ mode: 'daily', seed: 9, date: '2026-10-24' });
  eq(a.givens, b.givens, 'đề hằng ngày chỉ theo ngày');
  eq(a.hs, b.hs);
  eq(a.date, '2026-10-24');
});

test('sinh đề: độ khó tăng dần (mức suy luận, độ sâu suy luận)', () => {
  eq([E.MODES['5'].level, E.MODES['6'].level, E.MODES['7'].level], [1, 1, 2]);
  const depth = (m) => {
    let sum = 0;
    for (let s = 0; s < 30; s++) {
      const p = E.generate(m, 500 + s);
      const d = E.deduce(p, E.MODES[m].level);
      sum += Math.max.apply(null, d.round);
      // Mức khó phải cần tới cặp ẩn / cặp lộ
      if (E.MODES[m].level === 2) ok(!E.logicSolvable(p, 1), 'đề 7×7 giải xong bằng mức 1, seed ' + (500 + s));
    }
    return sum / 30;
  };
  const d5 = depth('5');
  const d6 = depth('6');
  const d7 = depth('7');
  console.log('       số vòng suy luận trung bình: 5×5 ' + d5.toFixed(1) + ', 6×6 ' + d6.toFixed(1) + ', 7×7 ' + d7.toFixed(1));
  ok(d5 < d6 && d6 < d7, 'độ sâu suy luận phải tăng theo độ khó');
});

test('sinh đề: thời gian (mục tiêu < 300 ms cho cỡ lớn nhất)', () => {
  const report = [];
  E.MODE_KEYS.forEach((m) => {
    const times = [];
    for (let s = 0; s < 40; s++) {
      const t0 = process.hrtime.bigint();
      E.generate(m, 77777 + s * 31);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    const max = times[times.length - 1];
    report.push(m + ': trung vị ' + med.toFixed(1) + ' ms, chậm nhất ' + max.toFixed(1) + ' ms');
    ok(max < 300, 'mode ' + m + ' quá chậm: ' + max.toFixed(1) + ' ms');
  });
  console.log('       ' + report.join(' · '));
});

/* ---------------- Chơi ---------------- */

test('điền số: ô cho sẵn không sửa được, số ngoài 1..n bị bỏ qua, điền lại đúng số thì xóa', () => {
  const g0 = E.newGame({ mode: '5', seed: 21 });
  const gi = g0.givens.findIndex((v) => v);
  if (gi >= 0) eq(E.setValue(g0, gi, 1), g0);
  const i = empties(g0)[0];
  eq(E.setValue(g0, i, 0), g0);
  eq(E.setValue(g0, i, 6), g0);
  const g1 = E.setValue(g0, i, 2);
  eq(g1.vals[i], 2);
  eq(g1.moves, 1);
  const g2 = E.setValue(g1, i, 2);
  eq(g2.vals[i], 0, 'điền lại đúng số thì xóa');
  eq(g2.moves, 2);
});

test('ghi chú: bật / tắt, không ghi lên ô đã có số; điền số xóa ghi chú của ô đó', () => {
  let g = E.newGame({ mode: '6', seed: 3 });
  const [i, j] = empties(g);
  g = E.toggleNote(g, i, 2);
  g = E.toggleNote(g, i, 5);
  eq(g.notes[i], E.bit(2) | E.bit(5));
  g = E.toggleNote(g, i, 2);
  eq(g.notes[i], E.bit(5));
  g = E.setValue(g, j, 1);
  eq(E.toggleNote(g, j, 3), g, 'ô đã có số');
  g = E.setValue(g, i, 4);
  eq(g.notes[i], 0, 'điền số thì ghi chú của ô mất');
  g = E.undo(g);
  eq([g.vals[i], g.notes[i]], [0, E.bit(5)], 'hoàn tác trả lại ghi chú');
});

test('ghi chú: tự xóa số vừa điền khỏi ghi chú cùng hàng / cột (tắt được)', () => {
  const g0 = E.newGame({ mode: '6', seed: 8 });
  const n = g0.n;
  const free = empties(g0);
  const a = free[0];
  const rowPeer = free.find((x) => x !== a && Math.floor(x / n) === Math.floor(a / n));
  const colPeer = free.find((x) => x !== a && x % n === a % n);
  const other = free.find((x) => Math.floor(x / n) !== Math.floor(a / n) && x % n !== a % n);
  let g = g0;
  [rowPeer, colPeer, other].forEach((x) => { if (x != null) g = E.toggleNote(g, x, 3); });
  const auto = E.setValue(g, a, 3);
  if (rowPeer != null) eq(auto.notes[rowPeer], 0, 'cùng hàng');
  if (colPeer != null) eq(auto.notes[colPeer], 0, 'cùng cột');
  if (other != null) eq(auto.notes[other], E.bit(3), 'ô khác giữ nguyên');
  const manual = E.setValue(g, a, 3, { autoNotes: false });
  if (rowPeer != null) eq(manual.notes[rowPeer], E.bit(3), 'tắt tự xóa');
  // Một nước = một bước hoàn tác, kể cả khi xóa ghi chú nhiều ô
  eq(E.undo(auto).notes, g.notes);
});

test('xóa ô: xóa cả số và ghi chú; ô trống thì không đổi', () => {
  let g = E.newGame({ mode: '5', seed: 5 });
  const [i, j] = empties(g);
  eq(E.erase(g, i), g);
  g = E.setValue(g, i, 3);
  g = E.erase(g, i);
  eq(g.vals[i], 0);
  g = E.toggleNote(g, j, 1);
  g = E.erase(g, j);
  eq(g.notes[j], 0);
});

test('hoàn tác / làm lại không giới hạn; nước mới xóa nhánh làm lại', () => {
  const g0 = E.newGame({ mode: '7', seed: 1 });
  const free = empties(g0);
  let g = g0;
  for (let k = 0; k < 12; k++) g = E.setValue(g, free[k], g0.sol[free[k]]);
  ok(E.canUndo(g) && !E.canRedo(g));
  let u = g;
  for (let k = 0; k < 12; k++) u = E.undo(u);
  eq(u.vals, g0.vals);
  ok(!E.canUndo(u) && E.canRedo(u));
  eq(E.undo(u), u);
  let r = u;
  for (let k = 0; k < 12; k++) r = E.redo(r);
  eq(r.vals, g.vals);
  const branch = E.setValue(E.undo(g), free[20], 1);
  ok(!E.canRedo(branch), 'nước mới xóa nhánh làm lại');
});

test('gợi ý: sửa ô sai trước (ưu tiên ô đang chọn), tính số lần gợi ý', () => {
  let g = E.newGame({ mode: '5', seed: 31 });
  const free = empties(g);
  const a = free[0];
  const b = free[1];
  const wrong = (i) => (g.sol[i] % 5) + 1;
  g = E.setValue(g, a, wrong(a));
  g = E.setValue(g, b, wrong(b));
  const h1 = E.hint(g, b);
  eq([h1.cell, h1.kind], [b, 'fix']);
  eq(h1.game.vals[b], g.sol[b]);
  eq(h1.game.hints, 1);
  const h2 = E.hint(h1.game, -1);
  eq([h2.cell, h2.kind], [a, 'fix']);
  eq(h2.game.hints, 2);
});

test('gợi ý: không có lỗi thì điền một ô suy ra được ngay (đúng lời giải)', () => {
  const g = E.newGame({ mode: '6', seed: 41 });
  const h = E.hint(g, -1);
  eq(h.kind, 'deduce');
  ok(!g.vals[h.cell] && h.game.vals[h.cell] === g.sol[h.cell]);
  // Ô đó phải được suy ra ở bước lan truyền sớm nhất
  const d = E.deduce(g, E.MODES[g.mode].level, g.vals);
  const minRound = Math.min.apply(null, empties(g).map((i) => d.round[i]));
  eq(d.round[h.cell], minRound);
});

test('gợi ý liên tục giải xong đề; đề đã giải thì gợi ý trả null', () => {
  let g = E.newGame({ mode: '7', seed: 13 });
  let guard = 0;
  while (!E.isSolved(g) && guard++ < 60) g = E.hint(g, -1).game;
  ok(E.isSolved(g));
  eq(g.hints, empties(E.newGame({ mode: '7', seed: 13 })).length);
  eq(E.hint(g, -1), null);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (số, ghi chú, lịch sử, gợi ý, ngày)', () => {
  let g = E.newGame({ mode: 'daily', seed: 1, date: '2026-10-24' });
  const free = empties(g);
  g = E.setValue(g, free[0], 1);
  g = E.toggleNote(g, free[1], 2);
  g = E.hint(g, -1).game;
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'phải khôi phục được');
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.date, '2026-10-24');
  eq(E.redo(back).vals, E.redo(g).vals);
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.newGame({ mode: '5', seed: 2 });
  const base = E.toJSON(E.setValue(g, empties(g)[0], 1));
  const n = 5;
  const bad = [
    null, 1, 'x', {},
    Object.assign({}, base, { v: 99 }),
    Object.assign({}, base, { mode: 'x' }),
    Object.assign({}, base, { n: 6 }),
    Object.assign({}, base, { sol: base.sol.slice(0, 24) }),
    Object.assign({}, base, { sol: base.sol.map((v, i) => (i === 0 ? base.sol[1] : v)) }), // không còn Latin
    Object.assign({}, base, { givens: base.givens.map((v) => (v ? (v % n) + 1 : v)) }), // số cho sẵn sai lời giải
    Object.assign({}, base, { hs: base.hs.map((s) => (s === LT ? GT : s === GT ? LT : s)) }), // dấu ngược lời giải
    Object.assign({}, base, { hs: base.hs.map((s, i) => (i === 0 ? 3 : s)) }),
    Object.assign({}, base, { vs: base.vs.slice(1) }),
    Object.assign({}, base, { givens: base.givens.map(() => 0), hs: base.hs.map(() => 0), vs: base.vs.map(() => 0) }), // nhiều nghiệm
    Object.assign({}, base, { vals: base.vals.map((v, i) => (i === 3 ? 9 : v)) }),
    Object.assign({}, base, { vals: base.vals.map((v, i) => (base.givens[i] ? 0 : v)) }), // xóa số cho sẵn
    Object.assign({}, base, { notes: base.notes.map((v, i) => (i === 0 ? 1 << n : v)) }),
    Object.assign({}, base, { moves: -1 }),
    Object.assign({}, base, { hints: 1.5 }),
    Object.assign({}, base, { undo: [[[0, 0, 0, 9, 0]]] }),
    Object.assign({}, base, { redo: 'x' }),
    Object.assign({}, base, { mode: 'daily', n: 6 }),
    Object.assign({}, base, { date: '2026-13-01' }),
  ];
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mục ' + k));
  ok(E.fromJSON(base), 'bản gốc phải hợp lệ');
});

test('ngày hợp lệ', () => {
  ok(E.isDate('2026-10-24'));
  ok(E.isDate('2028-02-29'));
  ok(!E.isDate('2026-02-30'));
  ok(!E.isDate('2026-1-01'));
  ok(!E.isDate(20261024));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
