/* Kiểm tra engine Dãy Số: chạy `node test.js`
 * - Lưới: ô kề 8 hướng, đường đi qua mọi ô mở (kể cả khi có ô khoét), kiểm lời giải đúng luật
 * - Bộ giải: đếm nghiệm đúng trên đề dựng tay (một nghiệm, nhiều nghiệm, vô nghiệm); suy luận không đoán
 * - Sinh đề: theo seed, đúng cỡ, đúng số ô khoét / ô phải điền, 1 và N cho sẵn, lời giải đúng luật và
 *   DUY NHẤT (bộ giải đếm tới 2) trên nhiều seed cho cả ba cỡ; đo thời gian sinh
 * - Luật chơi: đặt số (dời số, không đổi được số cho sẵn), số tiếp theo cần đặt, ghi chú, xóa,
 *   hoàn tác / làm lại, gợi ý, báo lỗi theo luật, đường nối, thắng
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

/** Ván dựng tay từ các dòng chữ: '#' ô khoét, số = lời giải, thêm '*' sau số = số cho sẵn. */
function hand(rows, mode) {
  const n = rows.length;
  const open = [];
  const sol = [];
  const given = [];
  rows.forEach((row) => row.trim().split(/\s+/).forEach((tok) => {
    open.push(tok === '#' ? 0 : 1);
    sol.push(tok === '#' ? 0 : parseInt(tok, 10));
    given.push(tok.endsWith('*') ? 1 : 0);
  }));
  const raw = {
    v: E.VERSION, mode: mode || 's', seed: 1, n, open, sol, given,
    vals: sol.map((v, i) => (given[i] ? v : 0)), notes: sol.map(() => []), moves: 0, hints: 0, undo: [], redo: [],
  };
  return E.fromJSON(raw);
}

/** Đề 6x6 dựng tay (một ô khoét), lời giải là đường rắn bò; cho sẵn 1, 35 và vài số. */
const SNAKE = [
  '1*  2   3   4*  5   6',
  '12  11  10  9   8   7*',
  '13  14  15* 16  17  18',
  '24* 23  22  21  20  19',
  '25  26  27  28* 29  30',
  '#   35* 34  33  32  31',
];

const at = (g, k) => g.sol.indexOf(k);
const cluesOf = (p) => p.sol.map((v, i) => (p.given[i] ? v : 0));
/** Điền đúng toàn bộ lời giải (bỏ qua ô `skip`). */
function fillAll(g, skip) {
  const list = [];
  for (let i = 0; i < g.n * g.n; i++) if (E.isFree(g, i) && i !== skip) list.push([i, g.sol[i]]);
  return E.place(g, list);
}

/* ---------------- Lưới ---------------- */

test('ô kề 8 hướng, không tính chính nó, không quấn mép', () => {
  ok(E.adjacent(6, 0, 1) && E.adjacent(6, 0, 6) && E.adjacent(6, 0, 7), 'ngang, dọc, chéo');
  ok(!E.adjacent(6, 0, 0), 'chính nó');
  ok(!E.adjacent(6, 5, 6), 'cuối hàng trên không kề đầu hàng dưới');
  ok(!E.adjacent(6, 0, 2) && !E.adjacent(6, 0, 12), 'cách một ô');
  eq(E.neighbors(6, 0).sort((a, b) => a - b), [1, 6, 7]);
  eq(E.neighbors(6, 7).length, 8);
});

test('đường đi qua đúng mọi ô mở, bước kề nhau, kể cả khi có ô khoét', () => {
  for (let s = 0; s < 40; s++) {
    const n = 6 + (s % 3) * 2;
    const r = E.rng(s);
    const open = new Array(n * n).fill(1);
    for (let h = 0; h < 4; h++) open[r.int(n * n)] = 0;
    if (!E.connected(n, open)) continue;
    const path = E.makePath(n, open, r);
    if (!path) continue;
    eq(path.length, open.filter((x) => x).length, 'độ dài (seed ' + s + ')');
    eq(new Set(path).size, path.length, 'không lặp ô');
    path.forEach((c, k) => {
      ok(open[c], 'chỉ đi ô mở');
      if (k) ok(E.adjacent(n, path[k - 1], c), 'bước kề nhau');
    });
  }
});

test('khối ô mở liền / rời', () => {
  ok(E.connected(3, [1, 1, 1, 1, 1, 1, 1, 1, 1]));
  ok(E.connected(3, [1, 0, 0, 0, 1, 0, 0, 0, 1]), 'nối chéo vẫn liền');
  ok(!E.connected(3, [1, 0, 1, 0, 0, 0, 1, 0, 1]), 'bốn góc rời nhau');
});

test('kiểm lời giải: đủ 1..N, k kề k + 1, ô khoét không có số', () => {
  const open = [1, 1, 1, 1, 1, 1, 1, 1, 1];
  ok(E.validSolution(3, open, [1, 2, 3, 6, 5, 4, 7, 8, 9]));
  ok(!E.validSolution(3, open, [1, 2, 3, 6, 5, 4, 9, 8, 7]), '6 không kề 7');
  ok(!E.validSolution(3, open, [1, 2, 3, 6, 5, 4, 7, 8, 8]), 'trùng số');
  ok(!E.validSolution(3, [1, 1, 1, 1, 1, 1, 1, 1, 0], [1, 2, 3, 6, 5, 4, 7, 8, 9]), 'số ở ô khoét');
});

/* ---------------- Bộ giải ---------------- */

test('bộ giải: đề đủ gợi ý có đúng một nghiệm và trùng lời giải', () => {
  const open = new Array(9).fill(1);
  const sol = [1, 2, 3, 6, 5, 4, 7, 8, 9];
  const res = E.solve(3, open, [1, 0, 3, 0, 5, 0, 7, 0, 9], 2);
  eq(res.count, 1);
  eq(res.sol, sol);
});

test('bộ giải: chỉ cho 1 và 9 thì nhiều nghiệm (dừng ở 2)', () => {
  const res = E.solve(3, new Array(9).fill(1), [1, 0, 0, 0, 0, 0, 0, 0, 9], 2);
  eq(res.count, 2);
  ok(res.guesses > 0, 'phải đoán');
  eq(E.deduce(3, new Array(9).fill(1), [1, 0, 0, 0, 0, 0, 0, 0, 9]).status, 'stuck');
});

test('bộ giải: vô nghiệm khi 1 và 2 không kề nhau, hoặc gợi ý sai luật', () => {
  const open = new Array(9).fill(1);
  eq(E.solve(3, open, [1, 0, 0, 0, 0, 0, 0, 0, 2], 2).count, 0);
  eq(E.deduce(3, open, [1, 0, 0, 0, 0, 0, 0, 0, 2]).status, 'none');
  eq(E.solve(3, open, [1, 0, 0, 0, 1, 0, 0, 0, 9], 2).count, 0, 'trùng số');
  eq(E.solve(3, open, [1, 0, 0, 0, 10, 0, 0, 0, 9], 2).count, 0, 'số vượt N');
  eq(E.solve(3, [1, 1, 1, 1, 1, 1, 1, 1, 0], [1, 0, 0, 0, 0, 0, 0, 8, 0], 2).count > 0, true, 'có ô khoét');
  eq(E.solve(3, [1, 1, 1, 1, 1, 1, 1, 1, 0], [1, 0, 0, 0, 0, 0, 0, 0, 8], 2).count, 0, 'số nằm ở ô khoét');
});

test('bộ giải: đề dựng tay 6x6 có ô khoét', () => {
  const g = hand(SNAKE);
  const res = E.solve(6, g.open, cluesOf(g), 2);
  ok(res.count >= 1, 'có nghiệm');
  ok(E.validSolution(6, g.open, res.sol), 'nghiệm đúng luật');
});

test('suy luận: đề sinh ra giải kín bằng lan truyền (không đoán)', () => {
  const p = E.generate('m', 77);
  const d = E.deduce(p.n, p.open, cluesOf(p));
  eq(d.status, 'solved');
  eq(d.sol, p.sol);
});

/* ---------------- Sinh đề ---------------- */

const SEEDS = { s: 60, m: 40, l: 30 };
E.MODE_KEYS.forEach((mode) => {
  test('sinh đề ' + mode + ': đúng cỡ, 1 và N cho sẵn, lời giải đúng luật và DUY NHẤT (' + SEEDS[mode] + ' seed)', () => {
    const cfg = E.MODES[mode];
    let maxGuess = 0;
    for (let s = 0; s < SEEDS[mode]; s++) {
      const p = E.generate(mode, 1000 + s);
      const n = p.n;
      eq(n, cfg.n, 'cạnh');
      const holes = p.open.filter((x) => !x).length;
      ok(holes >= cfg.holes[0] && holes <= cfg.holes[1], 'số ô khoét ' + holes);
      const N = n * n - holes;
      ok(E.validSolution(n, p.open, p.sol), 'lời giải sai luật (seed ' + s + ')');
      ok(p.given[at(p, 1)] && p.given[at(p, N)], '1 và N phải cho sẵn');
      const empty = p.open.reduce((a, o, i) => a + (o && !p.given[i] ? 1 : 0), 0);
      eq(empty, cfg.empty, 'số ô phải điền');
      const res = E.solve(n, p.open, cluesOf(p), 2);
      eq(res.count, 1, 'số nghiệm (seed ' + (1000 + s) + ')');
      eq(res.sol, p.sol, 'nghiệm khác lời giải');
      maxGuess = Math.max(maxGuess, res.guesses);
    }
    eq(maxGuess, 0, 'đề nào cũng giải được không cần đoán');
  });
});

test('sinh đề tất định theo seed, seed khác ra đề khác', () => {
  eq(E.generate('m', 42), E.generate('m', 42));
  eq(E.newGame({ mode: 's', seed: 'abc' }).sol, E.newGame({ mode: 's', seed: 'abc' }).sol);
  ok(JSON.stringify(E.generate('m', 42).sol) !== JSON.stringify(E.generate('m', 43).sol));
});

test('thời gian sinh đề (Node)', () => {
  const out = [];
  E.MODE_KEYS.forEach((mode) => {
    const ts = [];
    for (let s = 0; s < 60; s++) {
      const t0 = process.hrtime.bigint();
      E.generate(mode, 5000 + s);
      ts.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    ts.sort((a, b) => a - b);
    out.push(mode + ' trung vị ' + ts[30].toFixed(1) + ' / p90 ' + ts[54].toFixed(1) + ' / chậm nhất ' + ts[59].toFixed(1) + ' ms');
    ok(ts[54] < 150, 'sinh đề ' + mode + ' quá chậm');
  });
  console.log('       ' + out.join('\n       '));
});

/* ---------------- Luật chơi ---------------- */

test('ván mới: chỉ có số cho sẵn, chưa đi nước nào', () => {
  const g = E.newGame({ mode: 's', seed: 9 });
  eq([g.mode, g.n, g.moves, g.hints], ['s', 6, 0, 0]);
  eq(E.emptyCount(g), E.MODES.s.empty);
  eq(E.freeCount(g), E.MODES.s.empty);
  ok(!E.isSolved(g));
  g.vals.forEach((v, i) => eq(v, g.given[i] ? g.sol[i] : 0));
});

test('số tiếp theo cần đặt: nhỏ nhất chưa có sau k, quay vòng', () => {
  const g = hand(SNAKE);
  eq(E.nextMissing(g, 0), 2);
  eq(E.nextMissing(g, 1), 2);
  eq(E.nextMissing(g, 3), 5, '4 cho sẵn');
  eq(E.nextMissing(g, 34), 2, 'quay vòng');
  eq(E.prevMissing(g, 5), 3);
  eq(E.prevMissing(g, 2), 34, 'quay vòng về cuối');
  const full = fillAll(g);
  eq(E.nextMissing(full, 1), -1);
});

test('đặt số: dời số đã có, không đổi ô / số cho sẵn, xóa ghi chú liên quan', () => {
  let g = hand(SNAKE);
  const a = at(g, 2);
  const b = at(g, 3);
  g = E.toggleNote(g, b, 2);
  g = E.toggleNote(g, b, 5);
  eq(g.notes[b], [2, 5]);
  g = E.setValue(g, a, 2);
  eq(g.vals[a], 2);
  eq(g.notes[b], [5], 'gạch 2 khỏi ghi chú ô khác');
  g = E.setValue(g, b, 2);
  eq([g.vals[a], g.vals[b]], [0, 2], 'dời 2 sang ô mới');
  eq(g.notes[b], [], 'đặt số xóa ghi chú của ô');
  const g2 = E.setValue(g, at(g, 1), 5);
  eq(g2, g, 'ô cho sẵn không đổi');
  eq(E.setValue(g, a, 4), g, 'số cho sẵn (4) không đặt lại được');
  eq(E.setValue(g, a, 99), g, 'số ngoài 1..N');
  eq(g.moves, 4);
});

test('đặt nhiều số trong một nước (vẽ đường) là một lần hoàn tác', () => {
  let g = hand(SNAKE);
  g = E.place(g, [[at(g, 2), 2], [at(g, 3), 3]]);
  eq([g.vals[at(g, 2)], g.vals[at(g, 3)], g.undo.length, g.moves], [2, 3, 1, 1]);
  g = E.undo(g);
  eq([g.vals[at(g, 2)], g.vals[at(g, 3)]], [0, 0]);
  eq(g.last.sort(), [at(g, 2), at(g, 3)].sort());
});

test('ghi chú: chỉ ô trống, tối đa 4 số, không ghi số cho sẵn, bật lại thì tắt', () => {
  let g = hand(SNAKE);
  const c = at(g, 20);
  [3, 9, 6, 20].forEach((k) => { g = E.toggleNote(g, c, k); });
  eq(g.notes[c], [3, 6, 9, 20]);
  eq(E.toggleNote(g, c, 21), g, 'đầy 4 số');
  eq(E.toggleNote(g, c, 7), g, '7 là số cho sẵn');
  g = E.toggleNote(g, c, 6);
  eq(g.notes[c], [3, 9, 20]);
  g = E.setValue(g, c, 20);
  eq(E.toggleNote(g, c, 3), g, 'ô đã có số');
  eq(E.toggleNote(g, at(g, 1), 3), g, 'ô cho sẵn');
});

test('xóa ô, hoàn tác / làm lại không giới hạn', () => {
  let g = hand(SNAKE);
  const c = at(g, 2);
  g = E.setValue(g, c, 2);
  g = E.setValue(g, at(g, 3), 3);
  g = E.erase(g, c);
  eq(g.vals[c], 0);
  eq(E.erase(g, at(g, 1)), g, 'không xóa ô cho sẵn');
  g = E.undo(g);
  eq(g.vals[c], 2);
  g = E.undo(g);
  g = E.undo(g);
  eq(E.emptyCount(g), E.freeCount(g));
  eq(E.undo(g), g, 'hết hoàn tác');
  g = E.redo(E.redo(E.redo(g)));
  eq([g.vals[c], g.vals[at(g, 3)]], [0, 3]);
  eq(E.redo(g), g, 'hết làm lại');
  g = E.undo(g);
  g = E.setValue(g, at(g, 5), 5);
  eq(g.redo.length, 0, 'nước mới xóa ngăn làm lại');
});

test('gợi ý: đặt số tiếp theo vào đúng ô, không thì sửa ô trống / sai đầu tiên', () => {
  let g = hand(SNAKE);
  eq(E.hintCell(g, 5), at(g, 5));
  g = E.hint(g, at(g, 5));
  eq([g.vals[at(g, 5)], g.hints], [5, 1]);
  g = E.setValue(g, at(g, 2), 3);
  eq(E.hintCell(g, 5), at(g, 2), '5 đã có: ô sai đầu tiên');
  g = E.hint(g, at(g, 2));
  eq([g.vals[at(g, 2)], g.vals[at(g, 3)], g.hints], [2, 0, 2]);
  eq(E.hint(g, at(g, 2)), g, 'ô đã đúng thì thôi');
  eq(E.hintCell(fillAll(g), 1), -1);
});

test('báo lỗi theo luật và đường nối giữa hai số liên tiếp kề nhau', () => {
  let g = hand(SNAKE);
  // 2 đặt ở ô xa số 1
  const far = at(g, 33);
  g = E.setValue(g, far, 2);
  eq(E.check(g).bad, [far], '2 không kề 1');
  g = E.setValue(g, at(g, 2), 2);
  eq(E.check(g).bad, []);
  ok(E.check(g).links.indexOf(1) >= 0, 'nối 1-2');
  g = E.setValue(g, at(g, 6), 6);
  ok(E.check(g).links.indexOf(6) >= 0, 'nối 6-7 (7 cho sẵn)');
  g = E.setValue(g, at(g, 31), 29);
  eq(E.check(g).bad, [at(g, 31)], '29 không kề 28 (cho sẵn)');
});

test('thắng khi điền đủ và đúng; ván đã thắng không đổi nữa', () => {
  let g = hand(SNAKE);
  const last = at(g, 20);
  g = fillAll(g, last);
  ok(!E.isSolved(g));
  eq(E.emptyCount(g), 1);
  g = E.setValue(g, last, 20);
  ok(E.isSolved(g));
  eq(E.check(g).links.length, g.N - 1);
  eq(E.setValue(g, last, 0), g);
  eq(E.undo(g), g);
  eq(E.erase(g, last), g);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả ghi chú, hoàn tác / làm lại)', () => {
  let g = E.newGame({ mode: 'm', seed: 3 });
  const free = g.vals.map((v, i) => (E.isFree(g, i) ? i : -1)).filter((i) => i >= 0);
  g = E.setValue(g, free[0], g.sol[free[0]]);
  g = E.toggleNote(g, free[1], g.sol[free[1]]);
  g = E.setValue(g, free[2], g.sol[free[2]]);
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.N, g.N);
  eq(E.redo(back).vals, E.redo(g).vals);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(hand(SNAKE));
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const swap = good.sol.slice();
  [swap[0], swap[1]] = [swap[1], swap[0]]; // 2 không kề 3 nữa
  const dupVals = good.vals.slice();
  dupVals[at(good, 2)] = 1;
  const holeVal = good.vals.slice();
  holeVal[30] = 3;
  const givenWrong = good.vals.slice();
  givenWrong[0] = 0;
  const notesBad = good.notes.slice();
  notesBad[1] = [5, 3];
  const notesLong = good.notes.slice();
  notesLong[1] = [2, 3, 5, 6, 8];
  const noOne = good.given.slice();
  noOne[0] = 0;
  [
    null, 1, 'x', {},
    bad({ v: 2 }),
    bad({ mode: 'x' }),
    bad({ n: 8 }),
    bad({ seed: -1 }),
    bad({ moves: 1.5 }),
    bad({ open: good.open.slice(1) }),
    bad({ sol: swap }),
    bad({ vals: dupVals }),
    bad({ vals: holeVal }),
    bad({ vals: givenWrong }),
    bad({ notes: notesBad }),
    bad({ notes: notesLong }),
    bad({ notes: 'x' }),
    bad({ given: noOne, vals: good.vals.map((v, i) => (i === 0 ? 0 : v)) }),
    bad({ undo: [[[0, 1, []]]] }), // ô 0 là ô cho sẵn
    bad({ undo: [[]] }),
    bad({ redo: [[[1, 99, []]]] }),
    bad({ redo: 5 }),
  ].forEach((raw, j) => eq(E.fromJSON(raw), null, 'mẫu ' + j));
  ok(E.fromJSON(good), 'mẫu tốt vẫn nhận');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
