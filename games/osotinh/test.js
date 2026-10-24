/* Kiểm tra engine Ô Số Tính: chạy `node test.js`
 * - Luật lồng (+ − × ÷), liệt kê bộ số của lồng, solver đếm nghiệm (đối chiếu với vét cạn mọi hình vuông Latin)
 * - Sinh đề: mọi cỡ, nhiều seed, đúng một nghiệm, đúng cấu hình cỡ lồng / số lồng 1 ô, tất định theo seed, đủ nhanh
 * - Ván: điền số, ghi chú, xóa, hoàn tác / làm lại, gợi ý, ô cố định, phát hiện lỗi hàng / cột / lồng, thắng
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

const clone = (x) => JSON.parse(JSON.stringify(x));

/* ---------------- Vét cạn: mọi hình vuông Latin n×n, đếm cái thỏa mọi lồng (để đối chiếu solver) ---------------- */
function bruteCount(p) {
  const n = p.size;
  const grid = new Array(n * n).fill(0);
  const rowM = new Array(n).fill(0);
  const colM = new Array(n).fill(0);
  let count = 0;
  (function fill(i) {
    if (i === n * n) {
      if (p.cages.every((cg) => E.cageHolds(cg.op, cg.target, cg.cells.map((c) => grid[c])))) count++;
      return;
    }
    const r = Math.floor(i / n);
    const c = i % n;
    for (let v = 1; v <= n; v++) {
      const b = 1 << (v - 1);
      if ((rowM[r] | colM[c]) & b) continue;
      rowM[r] |= b;
      colM[c] |= b;
      grid[i] = v;
      fill(i + 1);
      rowM[r] ^= b;
      colM[c] ^= b;
    }
  })(0);
  return count;
}

function isLatin(n, g) {
  for (let x = 0; x < n; x++) {
    const row = new Set();
    const col = new Set();
    for (let y = 0; y < n; y++) {
      row.add(g[x * n + y]);
      col.add(g[y * n + x]);
    }
    if (row.size !== n || col.size !== n) return false;
  }
  return g.every((v) => v >= 1 && v <= n);
}

// Đề 4×4 viết tay, nghiệm duy nhất (đã đối chiếu vét cạn bên dưới)
//   1 2 3 4
//   3 4 1 2
//   2 1 4 3
//   4 3 2 1
const SOL4 = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const HAND = {
  size: 4,
  seed: 1,
  solution: SOL4,
  cages: [
    { cells: [0, 1, 5], op: '+', target: 7 }, // 1, 2, 4
    { cells: [7, 11], op: '+', target: 5 }, // 2, 3
    { cells: [9, 10], op: '-', target: 3 }, // 1, 4
    { cells: [14, 15], op: '/', target: 2 }, // 2, 1
    { cells: [8, 12, 13], op: '+', target: 9 }, // 2, 4, 3
    { cells: [2, 3, 6], op: '*', target: 12 }, // 3, 4, 1
    { cells: [4], op: '=', target: 3 },
  ],
};

/* ---------------- Luật lồng ---------------- */

test('phép tính của lồng: + − × ÷ và lồng 1 ô', () => {
  eq([E.cageHolds('+', 7, [3, 4]), E.cageHolds('+', 7, [3, 3]), E.cageHolds('+', 9, [2, 3, 4])], [true, false, true]);
  eq([E.cageHolds('*', 24, [2, 3, 4]), E.cageHolds('*', 24, [1, 4, 6]), E.cageHolds('*', 12, [3, 3])], [true, true, false]);
  eq([E.cageHolds('-', 2, [1, 3]), E.cageHolds('-', 2, [3, 1]), E.cageHolds('-', 1, [3, 1])], [true, true, false], 'trừ: lớn trừ nhỏ, không phụ thuộc thứ tự');
  eq([E.cageHolds('/', 2, [2, 4]), E.cageHolds('/', 2, [4, 2]), E.cageHolds('/', 2, [3, 4])], [true, true, false], 'chia: lớn chia nhỏ, phải chia hết');
  eq([E.cageHolds('-', 1, [1, 2, 3]), E.cageHolds('/', 1, [1, 1, 1])], [false, false], '− và ÷ chỉ cho lồng 2 ô');
  eq([E.cageHolds('=', 3, [3]), E.cageHolds('=', 3, [2])], [true, false]);
});

test('liệt kê bộ số của lồng: ô cùng hàng khác nhau, ô khác hàng khác cột được trùng', () => {
  const row = E.cageTuples(4, { cells: [0, 1], op: '+', target: 4 }).tuples.map((t) => t.vals);
  eq(row, [[1, 3], [3, 1]], '4+ trên một hàng: không có 2+2');
  // Lồng chữ L: ô 0 và ô 5 khác hàng khác cột nên 2,?,2 hợp lệ
  const l = E.cageTuples(4, { cells: [0, 1, 5], op: '+', target: 5 }).tuples.map((t) => t.vals.join(''));
  ok(l.indexOf('212') >= 0, 'L 5+: có 2,1,2');
  ok(l.every((s) => s[0] !== s[1] && s[1] !== s[2]), 'L 5+: ô kề nhau phải khác số');
  eq(E.cageTuples(6, { cells: [0, 1], op: '/', target: 3 }).tuples.map((t) => t.vals.join('')), ['13', '26', '31', '62']);
});

/* ---------------- Solver ---------------- */

test('solver: đề viết tay có đúng một nghiệm và đúng lời giải', () => {
  eq(bruteCount(HAND), 1, 'vét cạn');
  const res = E.solve(HAND, 2);
  eq(res.count, 1);
  eq(res.solutions[0], SOL4);
});

test('solver: đề nhiều nghiệm thì dừng ở 2', () => {
  // Chỉ có các lồng 2 ô "+" trên từng cặp hàng → đổi chỗ được nhiều cách
  const loose = { size: 4, cages: [] };
  for (let i = 0; i < 16; i += 2) loose.cages.push({ cells: [i, i + 1], op: '+', target: SOL4[i] + SOL4[i + 1] });
  ok(bruteCount(loose) > 2, 'đề này có nhiều nghiệm');
  eq(E.countSolutions(loose), 2);
  eq(E.solve(loose, 5).count, Math.min(5, bruteCount(loose)));
});

test('solver: vượt ngân sách nút tìm kiếm thì dừng và báo aborted', () => {
  const p = E.generate(7, 3);
  const full = E.solve(p, 2);
  eq([full.count, full.aborted], [1, false]);
  const cut = E.solve(p, 2, 1);
  eq(cut.aborted, true);
});

test('solver: đề vô nghiệm trả 0', () => {
  const bad = clone(HAND);
  bad.cages[6].target = 4; // ô cố định đổi thành 4: không còn cách điền nào
  eq([E.countSolutions(bad), bruteCount(bad)], [0, 0]);
});

test('solver khớp vét cạn trên đề sinh ngẫu nhiên đã bị làm lỏng (4×4)', () => {
  for (let s = 1; s <= 25; s++) {
    const p = E.generate(4, s);
    eq(E.countSolutions(p, 1000), bruteCount(p), 'seed ' + s);
    // Đổi phép của một lồng nhiều ô sang "+" để thường ra nhiều nghiệm
    const loose = clone(p);
    loose.cages.forEach((cg) => {
      if (cg.cells.length > 1) {
        cg.op = '+';
        cg.target = cg.cells.reduce((sum, i) => sum + p.solution[i], 0);
      }
    });
    eq(E.countSolutions(loose, 1000), bruteCount(loose), 'loose seed ' + s);
  }
});

test('solver khớp vét cạn trên vài đề 5×5', () => {
  for (let s = 1; s <= 3; s++) {
    const p = E.generate(5, 100 + s);
    eq(E.countSolutions(p, 1000), bruteCount(p), 'seed ' + s);
  }
});

/* ---------------- Sinh đề ---------------- */

test('sinh đề: mọi cỡ, 60 seed mỗi cỡ, đúng một nghiệm và đúng cấu hình', () => {
  E.SIZES.forEach((n) => {
    const spec = E.SPEC[n];
    for (let s = 0; s < 60; s++) {
      const seed = n * 100003 + s * 7919;
      const p = E.generate(n, seed);
      const where = n + 'x' + n + ' seed ' + seed;
      ok(isLatin(n, p.solution), where + ': lời giải không phải hình vuông Latin');
      const seen = new Array(n * n).fill(0);
      let singles = 0;
      p.cages.forEach((cg) => {
        cg.cells.forEach((i) => seen[i]++);
        ok(cg.cells.length <= spec.maxCage, where + ': lồng quá lớn');
        if (cg.cells.length === 1) singles++;
        ok((cg.op === '-' || cg.op === '/') ? cg.cells.length === 2 : true, where + ': − / ÷ phải là lồng 2 ô');
        ok(E.cageHolds(cg.op, cg.target, cg.cells.map((i) => p.solution[i])), where + ': lời giải không thỏa lồng');
      });
      ok(seen.every((x) => x === 1), where + ': lồng không phủ đúng mỗi ô một lần');
      ok(singles <= spec.maxSingles, where + ': nhiều lồng 1 ô quá');
      const res = E.solve(p, 2);
      eq(res.count, 1, where + ': số nghiệm');
      eq(res.solutions[0], p.solution, where + ': nghiệm duy nhất phải là lời giải');
      ok(E.fromJSON(E.toJSON(E.fromPuzzle(p))) !== null, where + ': đề sinh ra phải qua được kiểm tra ván lưu');
    }
  });
});

test('sinh đề tất định theo seed (số hoặc chuỗi ngày), seed khác cho đề khác', () => {
  eq(E.generate(6, 42), E.generate(6, 42));
  eq(E.generate(5, '2026-10-24'), E.generate(5, '2026-10-24'));
  ok(JSON.stringify(E.generate(6, 42).cages) !== JSON.stringify(E.generate(6, 43).cages));
  let threw = false;
  try {
    E.generate(8, 1);
  } catch (e) {
    threw = true;
  }
  ok(threw, 'cỡ không hỗ trợ phải báo lỗi');
});

test('sinh đề đủ nhanh: 7×7 trung bình < 30 ms trong Node', () => {
  const t0 = Date.now();
  for (let s = 0; s < 40; s++) E.generate(7, 9000 + s);
  const avg = (Date.now() - t0) / 40;
  ok(avg < 30, 'trung bình ' + avg.toFixed(1) + ' ms');
});

/* ---------------- Ván chơi ---------------- */

const fresh = () => E.fromPuzzle(HAND);

test('ván mới: lồng 1 ô điền sẵn và cố định, ô khác trống, chưa đi nước nào', () => {
  const g = fresh();
  eq(g.values[4], 3);
  eq(E.filledCount(g), 1);
  eq([g.moves, g.hints, g.undo.length, E.isSolved(g)], [0, 0, 0, false]);
  eq(E.setValue(g, 4, 1), g, 'ô cố định không sửa được');
  eq(E.clearCell(g, 4), g);
  eq(E.toggleNote(g, 4, 1), g);
});

test('điền số, điền lại cùng số thì xóa, số ngoài 1..n bị bỏ qua', () => {
  let g = fresh();
  g = E.setValue(g, 0, 1);
  eq([g.values[0], g.moves], [1, 1]);
  g = E.setValue(g, 0, 2);
  eq(g.values[0], 2);
  g = E.setValue(g, 0, 2);
  eq([g.values[0], g.moves], [0, 3]);
  eq(E.setValue(g, 0, 5), g, 'số 5 trên lưới 4×4');
  eq(E.setValue(g, 0, 0), g);
  eq(E.setValue(g, 16, 1), g, 'ô ngoài lưới');
});

test('ghi chú: bật / tắt, ô có số thì không ghi chú, điền số xóa ghi chú ô đó và số đó ở cùng hàng / cột', () => {
  let g = fresh();
  g = E.toggleNote(g, 0, 1);
  g = E.toggleNote(g, 0, 3);
  g = E.toggleNote(g, 1, 3); // cùng hàng với ô 0
  g = E.toggleNote(g, 8, 3); // cùng cột với ô 0
  g = E.toggleNote(g, 5, 3); // khác hàng khác cột
  eq([g.notes[0], g.notes[1], g.notes[8], g.notes[5]], [0b101, 0b100, 0b100, 0b100]);
  g = E.toggleNote(g, 0, 1);
  eq(g.notes[0], 0b100);
  g = E.setValue(g, 0, 3);
  eq([g.notes[0], g.notes[1], g.notes[8], g.notes[5]], [0, 0, 0, 0b100]);
  eq(E.toggleNote(g, 0, 2), g, 'ô đã có số');
  // Hoàn tác một lần trả lại toàn bộ ghi chú vừa bị xóa
  g = E.undo(g);
  eq([g.values[0], g.notes[0], g.notes[1], g.notes[8]], [0, 0b100, 0b100, 0b100]);
});

test('xóa ô: xóa cả số và ghi chú; ô trống không tính là nước đi', () => {
  let g = fresh();
  eq(E.clearCell(g, 0), g);
  g = E.toggleNote(g, 0, 2);
  g = E.clearCell(g, 0);
  eq([g.notes[0], g.moves], [0, 2]);
  g = E.setValue(g, 0, 1);
  g = E.clearCell(g, 0);
  eq(g.values[0], 0);
});

test('hoàn tác / làm lại không giới hạn; nước mới xóa nhánh làm lại', () => {
  let g = fresh();
  const cells = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  cells.forEach((i) => { g = E.setValue(g, i, 1 + (i % 4)); });
  const full = g;
  cells.forEach(() => { g = E.undo(g); });
  eq(g.values, fresh().values, 'hoàn tác hết về ván đầu');
  eq(E.undo(g), g, 'hết lịch sử');
  cells.forEach(() => { g = E.redo(g); });
  eq(g.values, full.values, 'làm lại hết');
  eq(E.redo(g), g);
  g = E.undo(E.undo(g));
  g = E.setValue(g, 0, 4);
  eq(g.redo.length, 0);
  eq(g.moves, full.moves + 1, 'hoàn tác / làm lại không tính là nước đi');
});

test('lỗi: trùng số cùng hàng / cột, lồng đủ ô mà sai phép tính', () => {
  let g = fresh();
  g = E.setValue(g, 0, 3); // trùng số 3 cho sẵn ở ô 4 (cùng cột)
  eq(E.conflicts(g).map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [0, 4]);
  g = E.setValue(g, 1, 3); // cùng hàng với ô 0
  eq(E.conflicts(g).map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [0, 1, 4]);
  eq(E.cageStates(g)[0], 'open', 'lồng còn ô trống');
  g = E.setValue(g, 5, 2);
  eq(E.cageStates(g)[0], 'bad', 'lồng 7+ có 3,3,2');
  g = E.setValue(g, 0, 1);
  g = E.setValue(g, 1, 2);
  g = E.setValue(g, 5, 4);
  eq(E.conflicts(g).some(Boolean), false);
  eq([0, 1, 6].map((k) => E.cageStates(g)[k]), ['ok', 'open', 'ok']);
});

test('thắng: điền đủ lời giải; sau khi thắng không đổi được gì', () => {
  let g = fresh();
  SOL4.forEach((v, i) => { g = E.setValue(g, i, v); });
  ok(E.isSolved(g));
  eq(g.moves, 15);
  eq(E.setValue(g, 0, 2), g);
  eq(E.undo(g), g);
  eq(E.hint(g).cell, -1);
});

test('gợi ý: điền đúng ô chọn nếu ô đó trống / sai, không thì ô trống đầu tiên; đếm số gợi ý', () => {
  let g = fresh();
  g = E.setValue(g, 5, 1); // sai (đúng là 4)
  let h = E.hint(g, 5);
  eq([h.cell, h.game.values[5], h.game.hints], [5, 4, 1]);
  h = E.hint(h.game, 4); // ô cố định → ô trống đầu tiên
  eq([h.cell, h.game.values[0], h.game.hints], [0, 1, 2]);
  g = h.game;
  g = E.undo(g);
  eq([g.values[0], g.hints], [0, 2], 'hoàn tác gợi ý không giảm số gợi ý');
  // Chỉ còn ô sai: gợi ý sửa ô sai
  let s = fresh();
  SOL4.forEach((v, i) => { s = E.setValue(s, i, i === 15 ? 2 : v); });
  ok(!E.isSolved(s));
  h = E.hint(s);
  eq(h.cell, 15);
  ok(E.isSolved(h.game));
});

test('giải đề sinh ngẫu nhiên bằng cách điền lời giải ở mọi cỡ', () => {
  E.SIZES.forEach((n) => {
    let g = E.newGame({ size: n, seed: 77 });
    g.solution.forEach((v, i) => { if (!g.values[i]) g = E.setValue(g, i, v); });
    ok(E.isSolved(g), n + 'x' + n);
  });
});

test('nhãn lồng', () => {
  eq(HAND.cages.map(E.cageLabel), ['7+', '5+', '3−', '2÷', '9+', '12×', '3']);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả ghi chú, lịch sử, gợi ý)', () => {
  let g = E.newGame({ size: 6, seed: 5 });
  g = E.toggleNote(g, g.values.indexOf(0), 2);
  g = E.setValue(g, g.values.indexOf(0), 3);
  g = E.hint(g).game;
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.redo(back).values, E.redo(g).values);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.setValue(fresh(), 0, 1));
  ok(E.fromJSON(clone(good)) !== null, 'ván tốt phải đọc được');
  const bad = [];
  const mut = (fn) => {
    const x = clone(good);
    fn(x);
    bad.push(x);
  };
  bad.push(null, 1, 'x', {}, []);
  mut((x) => { x.v = 2; });
  mut((x) => { x.size = 8; });
  mut((x) => { x.size = 5; });
  mut((x) => { x.seed = -1; });
  mut((x) => { x.moves = 1.5; });
  mut((x) => { x.hints = '0'; });
  mut((x) => { x.solution[0] = 2; }); // không còn là Latin
  mut((x) => { x.solution = x.solution.slice(1); });
  mut((x) => { x.cages[1].target = 6; }); // lời giải không thỏa lồng
  mut((x) => { x.cages[1].op = '%'; });
  mut((x) => { x.cages[0].op = '-'; }); // − cho lồng 3 ô
  mut((x) => { x.cages[6].op = '+'; }); // lồng 1 ô phải là '='
  mut((x) => { x.cages[1].cells = [7, 7]; }); // trùng ô
  mut((x) => { x.cages.pop(); }); // thiếu ô
  mut((x) => { x.cages[1] = { cells: [7, 14], op: '+', target: 4 }; x.cages[3] = { cells: [11, 15], op: '+', target: 4 }; }); // lồng không liền
  mut((x) => { x.values[1] = 5; });
  mut((x) => { x.values[4] = 1; }); // sửa ô cố định
  mut((x) => { x.values = x.values.slice(1); });
  mut((x) => { x.notes[0] = 16; });
  mut((x) => { x.undo = [[[0, 0, 0, 9, 0]]]; });
  mut((x) => { x.undo = [[]]; });
  mut((x) => { x.redo = 'x'; });
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + k));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
