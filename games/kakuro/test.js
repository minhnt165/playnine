/* Kiểm tra engine Kakuro: chạy `node test.js`
 * - Tổ hợp: đúng tập chữ số cho (số ô, tổng), đánh dấu tổ hợp không còn hợp với số đã điền
 * - Khung: tìm đoạn, khung hợp lệ / không hợp lệ (ô lẻ, ô trắng ở hàng gợi ý, khung rời)
 * - Bộ giải: đếm nghiệm đúng trên đề dựng tay (một nghiệm, hai nghiệm, vô nghiệm)
 * - Sinh đề: theo seed, khung đúng cỡ và đối xứng, lời giải đúng luật và DUY NHẤT (bộ giải đếm tới 2)
 *   trên nhiều seed cho cả ba cỡ; đo thời gian sinh
 * - Luật chơi: điền số, ghi chú (tự gạch khi điền), xóa, hoàn tác / làm lại, gợi ý, báo lỗi, thắng
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

/** Khung dựng tay từ các dòng chữ: '#' ô đen, chữ số = ô trắng kèm lời giải. */
function hand(rows) {
  const n = rows.length;
  const white = [];
  const sol = [];
  rows.forEach((row) => row.split(' ').forEach((ch) => {
    white.push(ch === '#' ? 0 : 1);
    sol.push(ch === '#' ? 0 : Number(ch));
  }));
  const { runs } = E.findRuns(n, white);
  return { n, white, sol, runs, sums: E.sumsOf(runs, sol) };
}

const whites = (g) => g.white.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
/** Điền đúng toàn bộ lời giải (bỏ qua ô `skip`). */
function fillAll(g, skip) {
  return whites(g).reduce((x, i) => (i === skip ? x : E.setValue(x, i, x.sol[i])), g);
}

/* ---------------- Tổ hợp ---------------- */

test('tổ hợp: tổng 16 trong 2 ô chỉ có 7+9, tổng 6 trong 3 ô chỉ có 1+2+3', () => {
  eq(E.combos(2, 16).map((c) => c.digits), [[7, 9]]);
  eq(E.combos(3, 6).map((c) => c.digits), [[1, 2, 3]]);
  eq(E.combos(9, 45).map((c) => c.digits), [[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
});

test('tổ hợp: tổng 10 trong 2 ô có 4 cách; tổng không thể thì rỗng', () => {
  eq(E.combos(2, 10).map((c) => c.digits.join('+')).sort(), ['1+9', '2+8', '3+7', '4+6']);
  eq(E.combos(2, 2), []);
  eq(E.combos(2, 18), []);
  eq(E.combos(0, 0), []);
});

test('tổ hợp: đánh dấu tổ hợp không chứa số đã điền', () => {
  const c = E.combos(3, 12, [5]);
  eq(c.filter((x) => x.ok).map((x) => x.digits.join('')).sort(), ['156', '345']);
  eq(c.filter((x) => !x.ok).length, c.length - 2);
});

/* ---------------- Khung ---------------- */

test('findRuns: đoạn ngang / dọc, ô gợi ý và chỉ số đoạn của từng ô', () => {
  const p = hand(['# # #', '# 1 3', '# 2 4']);
  eq(p.runs.map((r) => [r.dir, r.clue, r.cells]), [['h', 3, [4, 5]], ['v', 1, [4, 7]], ['v', 2, [5, 8]], ['h', 6, [7, 8]]]);
  eq(p.sums, [4, 3, 7, 6]);
  const { cellRuns } = E.findRuns(3, p.white);
  eq([cellRuns[8], cellRuns[9]], [0, 1]); // ô 4: đoạn ngang 0, đoạn dọc 1
  eq([cellRuns[0], cellRuns[1]], [-1, -1]); // ô đen
});

test('validLayout: chấp nhận khung đúng, từ chối ô lẻ / ô trắng ở hàng gợi ý / khung rời', () => {
  ok(E.validLayout(3, hand(['# # #', '# 1 3', '# 2 4']).white));
  ok(!E.validLayout(3, [0, 0, 0, 0, 1, 0, 0, 0, 0]), 'ô lẻ');
  ok(!E.validLayout(3, [0, 1, 0, 0, 1, 1, 0, 1, 1]), 'ô trắng ở hàng 0');
  const split = hand(['# # # # #', '# 1 2 # #', '# 3 4 # #', '# # # 1 2', '# # # 3 4']).white;
  ok(!E.validLayout(5, split), 'hai khối rời');
  ok(!E.validLayout(3, [0, 0, 0, 0, 1, 1, 0, 1]), 'sai độ dài');
});

/* ---------------- Bộ giải ---------------- */

test('bộ giải: đề 2x2 tổng 4/6 ngang, 3/7 dọc có đúng một nghiệm', () => {
  const p = hand(['# # #', '# 1 3', '# 2 4']);
  const res = E.solve(p.n, p.white, p.sums, 2);
  eq(res.count, 1);
  eq(res.solution, p.sol);
});

test('bộ giải: 2x2 toàn tổng 3 có hai nghiệm (đổi chéo), tổng sai thì vô nghiệm', () => {
  const p = hand(['# # #', '# 1 2', '# 2 1']);
  const res = E.solve(p.n, p.white, p.sums, 2);
  eq(res.count, 2);
  ok(res.other && res.other[4] !== res.solution[4]);
  eq(E.solve(p.n, p.white, [3, 3, 3, 4], 2).count, 0);
  eq(E.solve(p.n, p.white, [2, 3, 3, 3], 2).count, 0); // tổng 2 trong 2 ô không có tổ hợp
});

test('bộ giải: dừng ở limit, chỉ lan truyền (limit -1) báo ô chưa suy ra được', () => {
  const p = hand(['# # # #', '# 1 2 3', '# 2 3 1', '# 3 1 2']);
  eq(E.solve(p.n, p.white, p.sums, 1).count, 1);
  ok(E.solve(p.n, p.white, p.sums, 5).count > 1);
  eq(E.solve(p.n, p.white, p.sums, -1).unresolved.length, 9);
  const u = hand(['# # #', '# 1 3', '# 2 4']);
  eq(E.solve(u.n, u.white, u.sums, -1).unresolved, []);
});

/* ---------------- Sinh đề ---------------- */

const SEEDS = { s: 60, m: 40, l: 25 };
E.MODE_KEYS.forEach((mode) => {
  test('sinh đề ' + mode + ': khung hợp lệ, đối xứng, đúng cỡ; lời giải đúng luật và duy nhất (' + SEEDS[mode] + ' seed)', () => {
    const cfg = E.MODES[mode];
    const n = cfg.n;
    for (let s = 1; s <= SEEDS[mode]; s++) {
      const p = E.generate(mode, 1000 * s + 7);
      eq(p.n, n);
      ok(E.validLayout(n, p.white), 'khung sai, seed ' + s);
      const count = p.white.reduce((a, b) => a + b, 0);
      ok(count >= cfg.minWhite && count <= cfg.maxWhite, 'số ô trắng ' + count);
      for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) eq(p.white[r * n + c], p.white[(n - r) * n + (n - c)], 'đối xứng');
      const { runs } = E.findRuns(n, p.white);
      runs.forEach((run) => {
        ok(run.cells.length >= 2 && run.cells.length <= cfg.maxRun, 'độ dài đoạn ' + run.cells.length);
        const ds = run.cells.map((i) => p.sol[i]);
        ok(ds.every((d) => d >= 1 && d <= 9) && new Set(ds).size === ds.length, 'lặp số trong đoạn');
      });
      const res = E.solve(n, p.white, E.sumsOf(runs, p.sol), 2);
      eq(res.count, 1, 'số nghiệm, seed ' + s);
      eq(res.solution, p.sol, 'nghiệm khác lời giải');
      // suy luận thuần (không đoán) cũng giải hết
      eq(E.solve(n, p.white, E.sumsOf(runs, p.sol), -1).unresolved.length, 0);
    }
  });
});

test('sinh đề: cùng seed ra cùng đề, khác seed ra đề khác; seed chuỗi được', () => {
  eq(E.generate('m', 42), E.generate('m', 42));
  ok(JSON.stringify(E.generate('m', 42).sol) !== JSON.stringify(E.generate('m', 43).sol));
  eq(E.generate('s', '2026-10-24'), E.generate('s', '2026-10-24'));
  let threw = false;
  try { E.generate('xl', 1); } catch (e) { threw = true; }
  ok(threw, 'mode sai phải báo lỗi');
});

test('sinh đề: đủ nhanh (in thời gian, cỡ lớn trung vị < 60 ms trong Node)', () => {
  const out = [];
  E.MODE_KEYS.forEach((mode) => {
    const times = [];
    for (let s = 0; s < 40; s++) {
      const t0 = process.hrtime.bigint();
      E.generate(mode, 'speed' + s);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    out.push(mode + ' p50 ' + times[20].toFixed(1) + ' / p90 ' + times[36].toFixed(1) + ' / max ' + times[39].toFixed(1) + ' ms');
    if (mode === 'l') ok(times[20] < 60, 'trung vị cỡ l ' + times[20]);
  });
  console.log('       ' + out.join(' · '));
});

/* ---------------- Luật chơi ---------------- */

const base = E.newGame({ mode: 's', seed: 12345 });
const cells = whites(base);
const c0 = cells[0];

test('ván mới: chưa điền gì, chưa thắng, đúng mode / seed', () => {
  eq([base.mode, base.seed, base.n, base.moves, base.hints, E.filledCount(base), E.isSolved(base)], ['s', 12345, 6, 0, 0, 0, false]);
  eq(E.whiteCount(base), cells.length);
  ok(base.runs.every((r) => r.sum >= 3 && r.sum <= 45));
  eq(E.newGame({ mode: 'l', seed: 7 }).n, 10);
});

test('điền số / xóa số; ô đen và số ngoài 0..9 bị bỏ qua (hàm thuần)', () => {
  const before = JSON.stringify(E.toJSON(base));
  const g = E.setValue(base, c0, 5);
  eq(JSON.stringify(E.toJSON(base)), before, 'không sửa ván cũ');
  eq([g.vals[c0], g.moves, E.filledCount(g)], [5, 1, 1]);
  eq(E.setValue(g, c0, 5), g, 'điền lại cùng số không đổi gì');
  eq(E.setValue(g, c0, 0).vals[c0], 0);
  eq(E.setValue(base, 0, 3), base, 'ô đen');
  eq(E.setValue(base, c0, 10), base);
  eq(E.setValue(base, c0, 1.5), base);
});

test('ghi chú: bật / tắt trên ô trống; ô đã có số thì không ghi chú; điền số xóa ghi chú của ô', () => {
  let g = E.toggleNote(base, c0, 3);
  g = E.toggleNote(g, c0, 7);
  eq(g.notes[c0], E.bit(3) | E.bit(7));
  eq(E.toggleNote(g, c0, 3).notes[c0], E.bit(7));
  g = E.setValue(g, c0, 4);
  eq([g.vals[c0], g.notes[c0]], [4, 0]);
  eq(E.toggleNote(g, c0, 2), g);
  eq(E.toggleNote(base, c0, 0), base);
});

test('điền số tự gạch ghi chú cùng chữ số ở các ô cùng đoạn (một lần hoàn tác)', () => {
  const peer = E.peers(base, c0)[0];
  const far = cells.find((i) => i !== c0 && E.peers(base, c0).indexOf(i) < 0);
  let g = E.toggleNote(base, peer, 6);
  g = E.toggleNote(g, far, 6);
  g = E.setValue(g, c0, 6);
  eq([g.notes[peer], g.notes[far]], [0, E.bit(6)]);
  g = E.undo(g);
  eq([g.vals[c0], g.notes[peer]], [0, E.bit(6)]);
});

test('xóa ô: bỏ cả số lẫn ghi chú', () => {
  let g = E.setValue(base, c0, 2);
  g = E.erase(g, c0);
  eq([g.vals[c0], g.notes[c0]], [0, 0]);
  const n = E.erase(E.toggleNote(base, c0, 1), c0);
  eq(n.notes[c0], 0);
  eq(E.erase(base, c0), base, 'ô trống sẵn: không đổi gì');
});

test('hoàn tác / làm lại không giới hạn; nước mới xóa ngăn làm lại', () => {
  let g = base;
  cells.slice(0, 6).forEach((i, k) => { g = E.setValue(g, i, (k % 9) + 1); });
  const full = g;
  for (let k = 0; k < 6; k++) g = E.undo(g);
  eq(E.filledCount(g), 0);
  eq(E.undo(g).vals, g.vals, 'hết hoàn tác');
  for (let k = 0; k < 6; k++) g = E.redo(g);
  eq(g.vals, full.vals);
  g = E.undo(g);
  eq(g.redo.length, 1);
  g = E.setValue(g, cells[7], 9);
  eq(g.redo.length, 0);
  eq(E.undo(E.setValue(base, c0, 3)).last, [c0]);
});

test('gợi ý: điền đúng số của lời giải, đếm số lần gợi ý; ô đã đúng thì bỏ qua', () => {
  const g = E.hint(base, c0);
  eq([g.vals[c0], g.hints], [base.sol[c0], 1]);
  eq(E.hint(g, c0), g);
  eq(E.hintCell(g, c0), cells[1], 'ô chọn đã đúng: lấy ô trống đầu tiên');
  eq(E.hintCell(base, -1), c0);
  const wrong = E.setValue(base, c0, base.sol[c0] === 9 ? 1 : base.sol[c0] + 1);
  eq(E.hintCell(wrong, cells[2]), cells[2]);
  eq(E.hintCell(wrong, -1), c0, 'ô sai cũng được gợi ý');
  eq(E.hint(wrong, c0).vals[c0], base.sol[c0]);
});

test('báo lỗi: lặp số trong đoạn, đoạn đầy sai tổng / chưa đầy đã vượt tổng, đoạn xong', () => {
  const run = base.runs.find((r) => r.cells.length >= 3) || base.runs[0];
  const k = base.runs.indexOf(run);
  const [a, b] = run.cells;
  let g = E.setValue(E.setValue(base, a, 1), b, 1);
  ok(E.check(g).dupCells.indexOf(a) >= 0 && E.check(g).dupCells.indexOf(b) >= 0, 'ô lặp');
  // chưa đầy mà đã đạt tổng → sai
  g = E.setValue(E.setValue(base, a, 9), b, 8);
  if (run.sum <= 17 && run.cells.length > 2) ok(E.check(g).badRuns.indexOf(k) >= 0, 'vượt tổng');
  // điền đúng cả đoạn → đoạn xong, không lỗi
  g = run.cells.reduce((x, i) => E.setValue(x, i, x.sol[i]), base);
  const st = E.check(g);
  ok(st.doneRuns.indexOf(k) >= 0 && st.badRuns.indexOf(k) < 0, 'đoạn xong');
  // đoạn đầy nhưng lệch tổng
  const two = base.runs.find((r) => r.cells.length === 2);
  const k2 = base.runs.indexOf(two);
  const [x, y] = two.cells;
  const alt = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== base.sol[y] && d !== base.sol[x] && d + base.sol[x] !== two.sum);
  g = E.setValue(E.setValue(base, x, base.sol[x]), y, alt);
  ok(E.check(g).badRuns.indexOf(k2) >= 0, 'đầy sai tổng');
});

test('thắng khi điền đủ đúng luật; sau khi thắng không sửa được nữa', () => {
  let g = fillAll(base, cells[cells.length - 1]);
  ok(!E.isSolved(g));
  g = E.setValue(g, cells[cells.length - 1], base.sol[cells[cells.length - 1]]);
  ok(E.isSolved(g));
  eq(E.check(g).doneRuns.length, g.runs.length);
  eq(E.setValue(g, c0, 0), g);
  eq(E.erase(g, c0), g);
  eq(E.undo(g), g);
  eq(E.hint(g, c0), g);
});

test('bảng tổ hợp của đoạn theo số đã điền', () => {
  const k = base.cellRuns[2 * c0];
  const run = base.runs[k];
  const all = E.runCombos(base, k);
  ok(all.length >= 1 && all.every((c) => c.ok && c.digits.length === run.cells.length));
  ok(all.some((c) => c.digits.indexOf(base.sol[c0]) >= 0));
  const g = E.setValue(base, c0, base.sol[c0]);
  ok(E.runCombos(g, k).filter((c) => c.ok).every((c) => c.digits.indexOf(base.sol[c0]) >= 0));
  eq(E.runCombos(base, 999), []);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả ghi chú, hoàn tác / làm lại)', () => {
  let g = E.toggleNote(base, cells[2], 4);
  g = E.setValue(g, c0, 7);
  g = E.setValue(g, cells[1], 3);
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'khôi phục được');
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.runs.map((r) => r.sum), g.runs.map((r) => r.sum));
  eq(E.redo(back).vals, E.redo(g).vals);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.setValue(base, c0, 2));
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const sol = good.sol.slice();
  const run = base.runs[0];
  sol[run.cells[1]] = sol[run.cells[0]]; // lời giải lặp số
  const solZero = good.sol.slice();
  solZero[c0] = 0;
  const valOnBlack = good.vals.slice();
  valOnBlack[0] = 3;
  const whiteTop = good.white.slice();
  whiteTop[1] = 1;
  [
    null, 1, 'x', {}, [],
    bad({ v: 2 }),
    bad({ mode: 'xl' }),
    bad({ n: 8 }),
    bad({ seed: -1 }),
    bad({ moves: 1.5 }),
    bad({ white: good.white.slice(1) }),
    bad({ sol }),
    bad({ sol: solZero }),
    bad({ vals: valOnBlack }),
    bad({ white: whiteTop }),
    bad({ notes: good.notes.map(() => 600) }),
    bad({ vals: good.vals.map((v) => (v ? 10 : 0)) }),
    bad({ undo: 'x' }),
    bad({ undo: [[[0, 1, 0]]] }), // vá vào ô đen
    bad({ undo: [[[c0, 1]]] }),
    bad({ redo: [[]] }),
  ].forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu ' + k));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
