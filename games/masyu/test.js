/* Kiểm tra engine Masyu: chạy `node test.js`
 * - Hình học lưới (đánh số cạnh / ô / mặt), PRNG có seed, khóa ngày
 * - Luật: hạt trắng / đen trên vòng vẽ tay, vòng con, rẽ nhánh, bỏ sót hạt
 * - Solver đếm nghiệm (dừng ở limit) trên đề tay 1 / 2 / 0 nghiệm và đối chiếu vét cạn trên bàn 4×4, 5×5
 * - Đề sinh ra: vòng hợp lệ, nghiệm duy nhất ở mọi mode (nhiều seed), tất định theo seed / ngày, thời gian sinh
 * - Thao tác: chạm đổi trống → đường → ×, nét kéo là một bước, hoàn tác / làm lại, phân tích lỗi, gợi ý, thắng
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
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
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

/** Hạt từ các dòng viết tay: 'o' trắng, '#' đen, '.' trống. */
function pearlsOf(rows) {
  const out = [];
  rows.forEach((r) => r.split('').forEach((ch) => out.push(ch === 'o' ? 1 : ch === '#' ? 2 : 0)));
  return out;
}

/** Vòng đi qua dãy ô [r, c] (khép lại về ô đầu) → mảng 0/1 theo cạnh. */
function path(n, cells) {
  const out = new Array(E.geom(n).E).fill(0);
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    const b = cells[(i + 1) % cells.length];
    const e = E.edgeBetween(n, a[0] * n + a[1], b[0] * n + b[1]);
    if (e < 0) throw new Error('hai ô không kề: ' + a + ' ' + b);
    out[e] = 1;
  }
  return out;
}

/** Vòng là biên của một tập mặt (mảng 0/1 theo mặt) → mảng 0/1 theo cạnh. */
function faceLoop(n, inside) {
  const G = E.geom(n);
  const out = new Array(G.E).fill(0);
  const val = (f) => (f === G.F ? 0 : inside[f]);
  for (let e = 0; e < G.E; e++) out[e] = val(G.ef[2 * e]) !== val(G.ef[2 * e + 1]) ? 1 : 0;
  return out;
}

/** Vòng quanh viền bàn n×n. */
function border(n) {
  const cells = [];
  for (let c = 0; c < n; c++) cells.push([0, c]);
  for (let r = 1; r < n; r++) cells.push([r, n - 1]);
  for (let c = n - 2; c >= 0; c--) cells.push([n - 1, c]);
  for (let r = n - 2; r > 0; r--) cells.push([r, 0]);
  return path(n, cells);
}

/* ---------------- Hình học, PRNG, ngày ---------------- */

test('hình học: số cạnh / ô / mặt, mỗi cạnh nối hai ô kề, hai mặt hai bên khác nhau', () => {
  [2, 3, 6, 8, 10].forEach((n) => {
    const G = E.geom(n);
    eq([G.E, G.V, G.F], [2 * n * (n - 1), n * n, (n - 1) * (n - 1)], 'n=' + n);
    for (let e = 0; e < G.E; e++) {
      const a = G.ea[e];
      const b = G.eb[e];
      const d = Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n));
      eq(d, 1, 'cạnh ' + e);
      eq(E.edgeBetween(n, a, b), e);
      eq(E.edgeBetween(n, b, a), e);
      ok(G.ef[2 * e] !== G.ef[2 * e + 1], 'mặt hai bên cạnh ' + e);
    }
    // Cạnh trên viền bàn có đúng một bên là "ngoài bàn"
    let outer = 0;
    for (let e = 0; e < G.E; e++) if (G.ef[2 * e] === G.F || G.ef[2 * e + 1] === G.F) outer++;
    eq(outer, 4 * (n - 1));
  });
  eq(E.edgeBetween(6, 0, 7), -1, 'hai ô chéo nhau');
  eq(E.edgeBetween(6, 5, 6), -1, 'cuối hàng và đầu hàng sau');
  eq([E.hEdge(6, 0, 0), E.vEdge(6, 0, 0)], [0, 30]);
});

test('PRNG có seed: cùng seed cùng dãy, khác seed khác dãy; khóa ngày và seed đề ngày', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const c = E.rng(43);
  const xa = [a(), a(), a()];
  eq(xa, [b(), b(), b()]);
  ok(JSON.stringify(xa) !== JSON.stringify([c(), c(), c()]));
  xa.forEach((x) => ok(x >= 0 && x < 1));
  eq(E.dateKey(new Date(2026, 9, 4)), '2026-10-04');
  ok(E.isDateKey('2026-02-28') && !E.isDateKey('2026-02-30') && !E.isDateKey('26-1-1') && !E.isDateKey(null));
  eq(E.dailySeed('2026-10-24'), E.dailySeed('2026-10-24'));
  ok(E.dailySeed('2026-10-24') !== E.dailySeed('2026-10-25'));
});

/* ---------------- Luật trên vòng vẽ tay ---------------- */

// Bàn 4×4, vòng hình chữ L ngược:
//   (0,0)-(0,1)-(0,2)-(0,3)
//     |                |
//   (1,0)            (1,3)
//     |                |
//   (2,0)-(2,1)      (2,3)
//           |          |
//         (3,1)-(3,2)-(3,3)
const N4 = 4;
const LOOP4 = path(N4, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1], [2, 0], [1, 0]]);
const at4 = (marks) => {
  const p = new Array(16).fill(0);
  Object.keys(marks).forEach((k) => { p[Number(k)] = marks[k]; });
  return p;
};

test('hạt trắng: phải đi thẳng qua ô, và rẽ ở ít nhất một ô kề', () => {
  ok(E.checkLoop(N4, at4({ 1: 1 }), LOOP4), '(0,1) thẳng, (0,0) rẽ');
  ok(E.checkLoop(N4, at4({ 7: 1 }), LOOP4), '(1,3) thẳng, (2,3) đi thẳng nhưng (0,3) rẽ');
  ok(!E.checkLoop(N4, at4({ 0: 1 }), LOOP4), '(0,0) là chỗ rẽ: sai luật trắng');
  // Vòng quanh viền 5×5: ô (0,2) đi thẳng nhưng cả (0,1) và (0,3) cũng đi thẳng
  const p5 = new Array(25).fill(0);
  p5[2] = 1;
  ok(!E.checkLoop(5, p5, border(5)), 'hai ô kề đều đi thẳng: sai luật trắng');
  p5[2] = 0;
  p5[1] = 1;
  ok(E.checkLoop(5, p5, border(5)), '(0,1): ô kề (0,0) rẽ');
});

test('hạt đen: phải rẽ tại ô, và đi thẳng qua ô kế tiếp ở cả hai nhánh', () => {
  ok(E.checkLoop(N4, at4({ 0: 2 }), LOOP4), '(0,0) rẽ; (0,1) và (1,0) đều đi thẳng');
  ok(E.checkLoop(N4, at4({ 15: 2 }), LOOP4), '(3,3) rẽ; (3,2) và (2,3) đi thẳng');
  ok(!E.checkLoop(N4, at4({ 1: 2 }), LOOP4), '(0,1) đi thẳng: sai luật đen');
  ok(!E.checkLoop(N4, at4({ 8: 2 }), LOOP4), '(2,0) rẽ nhưng (2,1) cũng rẽ: sai luật đen');
  ok(!E.checkLoop(N4, at4({ 13: 2 }), LOOP4), '(3,1) rẽ nhưng (2,1) rẽ: sai luật đen');
});

test('checkLoop từ chối: bỏ sót hạt, hai vòng rời, rẽ nhánh, không có cạnh; candidates khớp luật', () => {
  ok(!E.checkLoop(N4, at4({ 5: 1 }), LOOP4), 'ô (1,1) có hạt nhưng vòng không đi qua');
  const two = path(N4, [[0, 0], [0, 1], [1, 1], [1, 0]]).map((x, e) => x | path(N4, [[2, 2], [2, 3], [3, 3], [3, 2]])[e]);
  ok(!E.checkLoop(N4, at4({}), two), 'hai vòng rời');
  const branch = LOOP4.slice();
  branch[E.vEdge(N4, 0, 1)] = 1;
  ok(!E.checkLoop(N4, at4({}), branch), 'rẽ nhánh');
  ok(!E.checkLoop(N4, at4({}), new Array(E.geom(N4).E).fill(0)), 'không có cạnh');
  const cand = E.candidates(N4, LOOP4);
  // Mỗi hạt ứng viên đặt riêng lẻ đều thỏa vòng; ô không phải ứng viên mà đặt hạt (trắng hoặc đen) thì sai
  for (let v = 0; v < 16; v++) {
    for (const p of [1, 2]) {
      const pearls = new Array(16).fill(0);
      pearls[v] = p;
      eq(E.checkLoop(N4, pearls, LOOP4), cand[v] === p, 'ô ' + v + ' hạt ' + p);
    }
  }
});

/* ---------------- Solver ---------------- */

test('solver: bốn hạt đen ở góc bàn 3×3 → đúng 1 nghiệm (vòng quanh viền)', () => {
  const p = pearlsOf(['#.#', '...', '#.#']);
  eq(E.countSolutions(3, p, 3), 1);
  eq(E.solve(3, p), border(3));
});

test('solver: một hạt trắng giữa bàn 3×3 → 4 nghiệm (dừng ở 2 khi limit 2)', () => {
  const p = pearlsOf(['...', '.o.', '...']);
  eq(E.countSolutions(3, p, 9), 4);
  eq(E.countSolutions(3, p, 2), 2);
});

test('solver: hạt đen giữa bàn 3×3 → vô nghiệm; hai hạt mâu thuẫn → vô nghiệm', () => {
  eq(E.countSolutions(3, pearlsOf(['...', '.#.', '...']), 2), 0);
  eq(E.countSolutions(4, pearlsOf(['##..', '....', '....', '....']), 2), 0, 'hai hạt đen kề nhau ở góc');
});

test('solver: đề 6×6 chép tay có đúng 1 nghiệm, giải được bằng suy luận', () => {
  const p = pearlsOf(['.#....', '....oo', '.o..#.', '..#...', '....o.', '#.....']);
  eq(E.countSolutions(6, p, 3), 1);
  const s = E.solve(6, p);
  ok(s && E.checkLoop(6, p, s));
  eq(E.logicSolve(6, p, 1), s);
});

test('solver khớp vét cạn mọi vòng trên bàn 4×4 và 5×5 (mọi vòng = biên của một tập mặt), 400 đề ngẫu nhiên', () => {
  [4, 5].forEach((n) => {
    const F = (n - 1) * (n - 1);
    const none = new Array(n * n).fill(0);
    const loops = [];
    for (let mask = 1; mask < 1 << F; mask++) {
      const inside = [];
      for (let i = 0; i < F; i++) inside.push((mask >> i) & 1);
      const l = faceLoop(n, inside);
      if (E.checkLoop(n, none, l)) loops.push(l);
    }
    const r = E.rng(n * 101);
    for (let t = 0; t < 200; t++) {
      // Nửa số đề lấy hạt từ ứng viên của một vòng thật (có ≥ 1 nghiệm), nửa còn lại hạt ngẫu nhiên (thường vô nghiệm)
      let pearls;
      if (t % 2) {
        const cand = E.candidates(n, loops[Math.floor(r() * loops.length)]);
        const keep = 0.15 + r() * 0.6;
        pearls = cand.map((p) => (p && r() < keep ? p : 0));
      } else {
        pearls = none.map(() => (r() < 0.12 ? 1 + Math.floor(r() * 2) : 0));
      }
      if (!pearls.some((p) => p)) pearls[Math.floor(r() * n * n)] = 1;
      const brute = loops.filter((l) => E.checkLoop(n, pearls, l)).length;
      eq(E.countSolutions(n, pearls, 3), Math.min(brute, 3), 'n=' + n + ' đề ' + pearls.join(''));
    }
  });
});

/* ---------------- Sinh đề ---------------- */

const SEEDS = { s: 60, m: 40, l: 20 };
const genStats = {};
['s', 'm', 'l'].forEach((mode) => {
  const n = E.MODES[mode].n;
  test('sinh đề ' + mode + ' (' + n + '×' + n + '): vòng hợp lệ, hạt đúng luật, nghiệm duy nhất trên ' + SEEDS[mode] + ' seed', () => {
    const times = [];
    let minLen = Infinity;
    let minRuns = Infinity;
    let pearls = 0;
    for (let k = 1; k <= SEEDS[mode]; k++) {
      const seed = k * 7919;
      const t0 = process.hrtime.bigint();
      const p = E.generate(mode, seed);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      eq([p.n, p.pearls.length, p.sol.length], [n, n * n, E.geom(n).E]);
      ok(p.pearls.some((x) => x), 'seed ' + seed + ': có hạt');
      ok(E.checkLoop(n, p.pearls, p.sol), 'seed ' + seed + ': lời giải là một vòng hợp lệ với mọi hạt');
      eq(E.countSolutions(n, p.pearls, 2), 1, 'seed ' + seed + ': nghiệm duy nhất');
      minLen = Math.min(minLen, p.sol.reduce((a, b) => a + b, 0));
      minRuns = Math.min(minRuns, turnsOf(n, p.sol));
      pearls += p.pearls.filter((x) => x).length;
    }
    times.sort((a, b) => a - b);
    genStats[mode] = {
      median: times[times.length >> 1],
      p95: times[Math.floor(times.length * 0.95)],
      worst: times[times.length - 1],
      minLen,
      minRuns,
      pearls: Math.round((pearls / SEEDS[mode]) * 10) / 10,
    };
  });
});

/** Số chỗ rẽ của vòng = số đoạn thẳng (một nét kéo phải đổi hướng ở mỗi chỗ rẽ). */
function turnsOf(n, sol) {
  const G = E.geom(n);
  let k = 0;
  for (let v = 0; v < G.V; v++) {
    const on = (d) => G.dirE[4 * v + d] >= 0 && sol[G.dirE[4 * v + d]] === 1;
    if ((on(0) || on(1)) && (on(2) || on(3))) k++;
  }
  return k;
}

test('đề hằng ngày: theo ngày, tất định, nghiệm duy nhất; ngày khác đề khác', () => {
  ['2026-10-24', '2026-10-25', '2027-01-01', '2026-02-28'].forEach((d) => {
    const g = E.newGame({ mode: 'daily', date: d });
    eq([g.mode, g.n, g.date, g.seed], ['daily', 8, d, E.dailySeed(d)]);
    eq(E.countSolutions(8, g.pearls, 2), 1, d);
  });
  eq(E.newGame({ mode: 'daily', date: '2026-10-24' }).pearls, E.newGame({ mode: 'daily', date: '2026-10-24' }).pearls);
  ok(E.newGame({ mode: 'daily', date: '2026-10-24' }).pearls.join('') !== E.newGame({ mode: 'daily', date: '2026-10-25' }).pearls.join(''));
});

test('sinh đề tất định theo seed, seed khác cho đề khác', () => {
  eq(E.generate('m', 123), E.generate('m', 123));
  ok(JSON.stringify(E.generate('m', 123).pearls) !== JSON.stringify(E.generate('m', 124).pearls));
});

test('đề mọi mức giải được bằng suy luận (6×6: luật cơ bản; 8×8 / 10×10: thêm thử-sai một bước)', () => {
  ['s', 'm', 'l'].forEach((mode) => {
    for (let seed = 1; seed <= (mode === 'l' ? 5 : 10); seed++) {
      const p = E.generate(mode, seed);
      eq(E.logicSolve(p.n, p.pearls, E.MODES[mode].logic), p.sol, mode + ' seed ' + seed);
    }
  });
});

/* ---------------- Thao tác trên ván ---------------- */

/** Ván trên đề tay 4×4 (lời giải LOOP4, hạt đen ở 2 góc). */
const fresh4 = () => E.fromPuzzle({ mode: 's', n: N4, seed: 1, pearls: at4({ 0: 2, 15: 2, 1: 1 }), sol: LOOP4 });

test('ván mới: chưa có cạnh, chưa đi nước nào, chưa thắng', () => {
  const g = E.newGame({ mode: 's', seed: 5 });
  eq([g.mode, g.n, g.date, g.moves, g.hints, E.isSolved(g)], ['s', 6, null, 0, 0, false]);
  ok(g.edges.every((x) => x === 0));
});

test('chạm cạnh: trống → đường → × → trống (dấu ×: trống → × → trống), mỗi lần một nước', () => {
  let g = E.newGame({ mode: 's', seed: 5 });
  g = E.cycle(g, 3);
  eq([g.edges[3], g.moves], [1, 1]);
  g = E.cycle(g, 3);
  eq(g.edges[3], 2);
  g = E.cycle(g, 3);
  eq([g.edges[3], g.moves], [0, 3]);
  g = E.cycle(g, 3, true);
  eq(g.edges[3], 2);
  g = E.cycle(g, 3, true);
  eq(g.edges[3], 0);
  g = E.cycle(E.cycle(g, 3), 3, true);
  eq(g.edges[3], 2, 'đánh × lên đường');
});

test('nét kéo nhiều cạnh là một bước hoàn tác; làm lại; nước mới xóa nhánh làm lại', () => {
  let g = E.newGame({ mode: 's', seed: 5 });
  g = E.apply(g, [[0, 1], [1, 1], [2, 1]]);
  eq([g.edges.slice(0, 3), g.moves], [[1, 1, 1], 1]);
  g = E.cycle(g, 10);
  g = E.undo(g);
  eq(g.edges[10], 0);
  g = E.undo(g);
  eq(g.edges.slice(0, 3), [0, 0, 0]);
  eq(E.undo(g), g, 'hết hoàn tác thì không đổi');
  g = E.redo(g);
  eq(g.edges.slice(0, 3), [1, 1, 1]);
  g = E.cycle(g, 20);
  eq(E.redo(g), g, 'nước mới xóa nhánh làm lại');
  eq(E.apply(g, [[0, 1]]), g, 'không đổi gì thì không thành nước');
  eq(E.apply(g, [[-1, 1], [9999, 1], [0, 5]]), g, 'cạnh / trạng thái lạ bị bỏ qua');
});

test('vẽ đúng vòng → thắng (× không ảnh hưởng); thiếu một cạnh thì chưa; thao tác sau khi thắng bị bỏ qua', () => {
  let g = E.newGame({ mode: 's', seed: 9 });
  g = E.apply(g, g.sol.map((x, e) => [e, x ? 1 : 2]));
  ok(E.isSolved(g));
  eq(E.cycle(g, 0), g);
  eq(E.undo(g), g);
  eq(E.useHint(g), g);
  let h = E.newGame({ mode: 's', seed: 9 });
  h = E.apply(h, h.sol.map((x, e) => [e, x]).filter((c) => c[1]));
  ok(E.isSolved(h), 'chỉ vẽ đường, không đánh ×');
  h = E.newGame({ mode: 's', seed: 9 });
  const firstOn = h.sol.indexOf(1);
  h = E.apply(h, h.sol.map((x, e) => [e, x]).filter((c) => c[1] && c[0] !== firstOn));
  ok(!E.isSolved(h), 'thiếu một cạnh thì chưa thắng');
});

test('phân tích: ô 3 đường, đầu cụt, hạt vi phạm / đã thỏa, vòng con khép sớm', () => {
  const n = N4;
  // Ô (1,1) có 3 đường
  let g = E.apply(fresh4(), [[E.hEdge(n, 1, 0), 1], [E.hEdge(n, 1, 1), 1], [E.vEdge(n, 0, 1), 1]]);
  eq(E.analyze(g).cell[5], 'branch');
  // Đầu cụt: (0,3) có một đường, hướng còn lại bị ×
  g = E.apply(fresh4(), [[E.hEdge(n, 0, 2), 1], [E.vEdge(n, 0, 3), 2]]);
  eq(E.analyze(g).cell[3], 'dead');
  // Hạt đen (0,0) đi thẳng... không thể (góc); đen rẽ nhưng ô kế tiếp rẽ → vi phạm
  g = E.apply(fresh4(), [[E.hEdge(n, 0, 0), 1], [E.vEdge(n, 0, 1), 1]]);
  eq(E.analyze(g).pearl[0], 'bad', 'đen: ô kề (0,1) rẽ');
  g = E.apply(fresh4(), [[E.hEdge(n, 0, 0), 1], [E.hEdge(n, 0, 1), 1], [E.vEdge(n, 0, 0), 1], [E.vEdge(n, 1, 0), 1]]);
  eq(E.analyze(g).pearl[0], 'ok', 'đen: hai nhánh đều đi thẳng');
  g = E.apply(fresh4(), [[E.hEdge(n, 0, 1), 2]]);
  eq(E.analyze(g).pearl[0], 'bad', 'đen: nhánh phải bị chặn sau ô kề');
  // Hạt trắng (0,1): rẽ tại hạt → vi phạm; đi thẳng có ô kề rẽ → đã thỏa
  g = E.apply(fresh4(), [[E.hEdge(n, 0, 0), 1], [E.vEdge(n, 0, 1), 1]]);
  eq(E.analyze(g).pearl[1], 'bad', 'trắng: rẽ tại hạt');
  g = E.apply(fresh4(), [[E.hEdge(n, 0, 0), 1], [E.hEdge(n, 0, 1), 1], [E.vEdge(n, 0, 0), 1]]);
  eq(E.analyze(g).pearl[1], 'ok', 'trắng: đi thẳng, (0,0) rẽ');
  // Trắng ở giữa hàng viền 5×5 với hai ô kề đều đi thẳng
  const p5 = new Array(25).fill(0);
  p5[2] = 1;
  const g5 = E.apply(E.fromPuzzle({ mode: 's', n: 5, seed: 1, pearls: p5, sol: border(5) }), [[0, 1], [1, 1], [2, 1], [3, 1]]);
  eq(E.analyze(g5).pearl[2], 'bad', 'trắng: hai ô kề đều đi thẳng');
  eq(E.analyze(fresh4()).pearl, new Array(16).fill(''), 'chưa vẽ gì: không lỗi');
  // Vòng con 2×2 khép kín khi chưa thắng
  g = E.apply(fresh4(), path(n, [[1, 1], [1, 2], [2, 2], [2, 1]]).map((x, e) => [e, x]).filter((c) => c[1]));
  const a = E.analyze(g);
  ok(a.badLoop && !a.solved, 'vòng con');
  eq(a.loopEdges.length, 4);
  eq(a.lines, 4);
});

test('gợi ý: sửa đường sai, rồi sửa × sai, rồi một cạnh suy ra được; tăng hints và dẫn tới thắng', () => {
  let g = E.newGame({ mode: 'm', seed: 4 });
  const wrong = g.sol.indexOf(0);
  g = E.apply(g, [[wrong, 1]]);
  let h = E.hint(g);
  eq([h.e, h.to], [wrong, 2]);
  g = E.useHint(g);
  eq([g.edges[wrong], g.hints], [2, 1]);
  const right = g.sol.indexOf(1);
  g = E.apply(g, [[right, 2]]);
  h = E.hint(g);
  eq([h.e, h.to], [right, 1], 'dấu × trên cạnh của lời giải');
  g = E.useHint(g);
  h = E.hint(g);
  eq([g.sol[h.e], h.to], [1, 1], 'gợi ý thêm là cạnh của lời giải');
  for (let i = 0; i < 300 && !E.isSolved(g); i++) g = E.useHint(g);
  ok(E.isSolved(g), 'gợi ý dẫn tới thắng');
  eq(E.hint(g), null);
});

test('gợi ý khi chưa có lỗi là cạnh suy ra được bằng luật cơ bản từ những gì đã vẽ', () => {
  for (let seed = 21; seed < 26; seed++) {
    const g = E.newGame({ mode: 's', seed });
    const h = E.hint(g);
    eq(h.to, 1);
    eq(E.deduce(g.n, g.pearls, [], 0)[h.e], 1, 'seed ' + seed);
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử hoàn tác / làm lại, đề ngày)', () => {
  let g = E.newGame({ mode: 'm', seed: 77 });
  g = E.apply(g, [[1, 1], [2, 1]]);
  g = E.cycle(g, 5);
  g = E.undo(g);
  g = E.useHint(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.undo(back).edges, E.undo(g).edges);
  const d = E.cycle(E.newGame({ mode: 'daily', date: '2026-10-24' }), 0);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(d)))), d);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.cycle(E.newGame({ mode: 's', seed: 3 }), 0));
  const daily = E.toJSON(E.cycle(E.newGame({ mode: 'daily', date: '2026-10-24' }), 0));
  const firstPearl = good.pearls.search(/[12]/);
  const swap = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
  const bad = [
    null,
    1,
    'x',
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { mode: 'xl' }),
    Object.assign({}, good, { n: 8 }),
    Object.assign({}, good, { pearls: good.pearls.slice(1) }),
    Object.assign({}, good, { pearls: swap(good.pearls, 0, '3') }),
    Object.assign({}, good, { pearls: swap(good.pearls, firstPearl, good.pearls[firstPearl] === '1' ? '2' : '1') }),
    Object.assign({}, good, { pearls: good.pearls.replace(/[12]/g, '0') }),
    Object.assign({}, good, { sol: swap(good.sol, good.sol.indexOf('1'), '0') }),
    Object.assign({}, good, { sol: good.sol + '0' }),
    Object.assign({}, good, { edges: swap(good.edges, 0, '7') }),
    Object.assign({}, good, { edges: good.edges.slice(1) }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { hints: 1.5 }),
    Object.assign({}, good, { seed: 'a' }),
    Object.assign({}, good, { date: '2026-10-24' }),
    Object.assign({}, good, { undo: [[[0, 0]]] }),
    Object.assign({}, good, { undo: [[[9999, 0, 1]]] }),
    Object.assign({}, good, { undo: [[[0, 0, 3]]] }),
    Object.assign({}, good, { redo: 'x' }),
    Object.assign({}, daily, { date: '2026-13-01' }),
    Object.assign({}, daily, { date: '2026-10-25' }),
    Object.assign({}, daily, { date: null }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
  ok(E.fromJSON(good), 'mẫu tốt vẫn nhận');
  ok(E.fromJSON(daily), 'mẫu đề ngày tốt vẫn nhận');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
Object.keys(genStats).forEach((m) => {
  const s = genStats[m];
  const f = (x) => x.toFixed(1);
  console.log('  sinh đề ' + m + ': trung vị ' + f(s.median) + ' ms, p95 ' + f(s.p95) + ' ms, chậm nhất ' + f(s.worst) + ' ms; vòng ngắn nhất ' + s.minLen +
    ' cạnh, ít chỗ rẽ nhất ' + s.minRuns + '; trung bình ' + s.pearls + ' hạt');
});
if (failed) process.exit(1);
