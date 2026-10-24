/* Kiểm tra engine Vòng Kín: chạy `node test.js`
 * - Hình học lưới (đánh số cạnh / điểm / ô), PRNG có seed
 * - Luật: đếm cạnh quanh ô, bậc của điểm, nhận ra vòng kín duy nhất thỏa mọi số = thắng
 * - Solver đếm nghiệm (dừng ở 2) trên đề tay; đề sinh ra có lời giải duy nhất ở mọi mode, nhiều seed
 * - Thao tác: chạm đổi trống → đường → ×, nét kéo là một bước, hoàn tác / làm lại, gợi ý
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

/** Dựng đề từ các dòng viết tay: chữ số hoặc dấu chấm (ô không có số). */
function parse(rows) {
  const clues = [];
  rows.forEach((r) => r.split('').forEach((ch) => clues.push(ch === '.' ? -1 : Number(ch))));
  return { n: rows.length, clues };
}

/** Vòng là biên của một vùng ô (mảng 0/1 theo ô) → mảng 0/1 theo cạnh. */
function loopOf(n, inside) {
  const G = E.geom(n);
  const out = new Array(G.E).fill(0);
  for (let e = 0; e < G.E; e++) {
    const a = G.ec[2 * e];
    const b = G.ec[2 * e + 1];
    out[e] = (a >= 0 ? inside[a] : 0) !== (b >= 0 ? inside[b] : 0) ? 1 : 0;
  }
  return out;
}

/* ---------------- Hình học, PRNG ---------------- */

test('hình học: số cạnh / điểm / ô, mỗi cạnh nối hai điểm kề, mỗi ô 4 cạnh', () => {
  [1, 2, 5, 7, 10].forEach((n) => {
    const G = E.geom(n);
    eq([G.E, G.V, G.C], [2 * n * (n + 1), (n + 1) * (n + 1), n * n], 'n=' + n);
    for (let e = 0; e < G.E; e++) {
      const a = G.ea[e];
      const b = G.eb[e];
      const d = Math.abs(Math.floor(a / (n + 1)) - Math.floor(b / (n + 1))) + Math.abs((a % (n + 1)) - (b % (n + 1)));
      eq(d, 1, 'cạnh ' + e);
      eq(E.edgeBetween(n, a, b), e);
      eq(E.edgeBetween(n, b, a), e);
    }
    for (let c = 0; c < G.C; c++) {
      for (let k = 0; k < 4; k++) {
        const e = G.cE[4 * c + k];
        ok(G.ec[2 * e] === c || G.ec[2 * e + 1] === c, 'ô ' + c + ' cạnh ' + e);
      }
    }
  });
  eq(E.edgeBetween(5, 0, 7), -1, 'hai điểm không kề');
  eq(E.hEdge(5, 0, 0), 0);
  eq(E.vEdge(5, 0, 0), 30);
});

test('PRNG có seed: cùng seed cùng dãy, khác seed khác dãy', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const c = E.rng(43);
  const xa = [a(), a(), a()];
  eq(xa, [b(), b(), b()]);
  ok(JSON.stringify(xa) !== JSON.stringify([c(), c(), c()]));
  xa.forEach((x) => ok(x >= 0 && x < 1));
});

/* ---------------- Luật ---------------- */

test('vòng quanh cả bàn 2x2 thỏa mọi số 2 → vòng hợp lệ, đề có đúng một nghiệm', () => {
  const sol = loopOf(2, [1, 1, 1, 1]);
  ok(E.checkLoop(2, [2, 2, 2, 2], sol));
  eq(E.countSolutions(2, [2, 2, 2, 2], 3), 1);
});

test('checkLoop từ chối: sai số, nhiều vòng rời, tự chạm ở một điểm, rẽ nhánh, không có cạnh', () => {
  const n = 3;
  const clues = new Array(9).fill(-1);
  const one = loopOf(n, [1, 0, 0, 0, 0, 0, 0, 0, 0]);
  ok(E.checkLoop(n, clues, one), 'vòng một ô');
  ok(!E.checkLoop(n, clues, loopOf(n, [1, 0, 1, 0, 0, 0, 1, 0, 1])), 'bốn vòng rời');
  const c3 = clues.slice();
  c3[0] = 3;
  ok(!E.checkLoop(n, c3, one), 'số 3 nhưng có 4 cạnh');
  ok(!E.checkLoop(n, clues, loopOf(n, [1, 0, 0, 0, 1, 0, 0, 0, 0])), 'tự chạm ở một điểm (bậc 4)');
  const t = one.slice();
  t[E.hEdge(n, 1, 1)] = 1;
  ok(!E.checkLoop(n, clues, t), 'rẽ nhánh');
  ok(!E.checkLoop(n, clues, new Array(E.geom(n).E).fill(0)), 'không có cạnh');
});

test('solver: đề đủ số có đúng 1 nghiệm và tìm đúng vòng; không số → nhiều nghiệm; toàn 0 → vô nghiệm', () => {
  const n = 4;
  const sol = loopOf(n, [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
  const full = E.cluesOf(n, sol);
  eq(E.countSolutions(n, full, 2), 1);
  eq(E.solve(n, full), sol);
  eq(E.countSolutions(n, new Array(16).fill(-1), 2), 2);
  eq(E.countSolutions(n, new Array(16).fill(0), 2), 0);
});

test('solver: đề 5x5 chép tay có đúng 1 nghiệm, giải được bằng lan truyền; bỏ hết số thì nhiều nghiệm', () => {
  const p = parse(['012..', '11221', '...3.', '1.0.1', '.33..']);
  eq(E.countSolutions(p.n, p.clues, 3), 1);
  const s = E.solve(p.n, p.clues);
  ok(s && E.checkLoop(p.n, p.clues, s));
  eq(E.logicSolve(p.n, p.clues, 0), s);
  eq(E.countSolutions(p.n, new Array(25).fill(-1), 2), 2);
});

test('solver: đề 3x3 chỉ có số 2 ở giữa (nhiều vòng thỏa) thì đếm dừng ở 2', () => {
  const clues = [-1, -1, -1, -1, 2, -1, -1, -1, -1];
  eq(E.countSolutions(3, clues, 2), 2);
});

test('solver khớp với vét cạn trên bàn 3x3 và 4x4 (mọi vòng = biên của một tập ô), 400 đề ngẫu nhiên', () => {
  [3, 4].forEach((n) => {
    // Liệt kê mọi vòng: biên của mỗi tập ô, giữ biên nào là đúng một vòng kín (checkLoop đi dọc vòng, độc lập với solver)
    const C = n * n;
    const loops = [];
    const none = new Array(C).fill(-1);
    for (let mask = 1; mask < 1 << C; mask++) {
      const inside = [];
      for (let i = 0; i < C; i++) inside.push((mask >> i) & 1);
      const l = loopOf(n, inside);
      if (E.checkLoop(n, none, l)) loops.push({ l, clues: E.cluesOf(n, l) });
    }
    const r = E.rng(n * 101);
    for (let t = 0; t < 200; t++) {
      // Nửa số đề lấy số từ một vòng thật (có ≥ 1 nghiệm), nửa còn lại số ngẫu nhiên (thường vô nghiệm)
      const base = loops[Math.floor(r() * loops.length)].clues;
      const keep = 0.2 + r() * 0.7;
      const clues = base.map((c) => (r() < keep ? (t % 2 ? c : Math.floor(r() * 4)) : -1));
      const brute = loops.filter((x) => clues.every((c, i) => c < 0 || c === x.clues[i])).length;
      eq(E.countSolutions(n, clues, 3), Math.min(brute, 3), 'n=' + n + ' đề ' + JSON.stringify(clues));
    }
  });
});

/* ---------------- Sinh đề ---------------- */

const SEEDS = { s: 60, m: 30, l: 15 };
const genStats = {};
Object.keys(E.MODES).forEach((mode) => {
  const n = E.MODES[mode].n;
  test('sinh đề ' + mode + ' (' + n + 'x' + n + '): vòng hợp lệ, số khớp vòng, nghiệm duy nhất trên ' + SEEDS[mode] + ' seed', () => {
    let ms = 0;
    let worst = 0;
    let minLen = Infinity;
    let given = 0;
    for (let k = 1; k <= SEEDS[mode]; k++) {
      const seed = k * 7919;
      const t0 = Date.now();
      const p = E.generate(mode, seed);
      const dt = Date.now() - t0;
      ms += dt;
      worst = Math.max(worst, dt);
      eq([p.n, p.clues.length, p.sol.length], [n, n * n, E.geom(n).E]);
      ok(E.checkLoop(n, p.clues, p.sol), 'seed ' + seed + ': lời giải phải là một vòng hợp lệ');
      const truth = E.cluesOf(n, p.sol);
      p.clues.forEach((c, i) => ok(c === -1 || c === truth[i], 'seed ' + seed + ': số ở ô ' + i));
      p.clues.forEach((c) => ok(c >= -1 && c <= 3, 'số 0–3'));
      eq(E.countSolutions(n, p.clues, 2), 1, 'seed ' + seed + ': nghiệm duy nhất');
      minLen = Math.min(minLen, p.sol.reduce((a, b) => a + b, 0));
      given += p.clues.filter((c) => c >= 0).length;
    }
    genStats[mode] = { avg: Math.round(ms / SEEDS[mode]), worst, minLen, clues: Math.round((given / SEEDS[mode]) * 10) / 10 };
  });
});

test('sinh đề tất định theo seed, seed khác cho đề khác', () => {
  eq(E.generate('m', 123), E.generate('m', 123));
  ok(JSON.stringify(E.generate('m', 123).clues) !== JSON.stringify(E.generate('m', 124).clues));
});

test('đề mọi mức giải được bằng suy luận (Dễ: luật cơ bản; Vừa / Khó: thêm thử-sai một bước)', () => {
  Object.keys(E.MODES).forEach((mode) => {
    for (let seed = 1; seed <= (mode === 'l' ? 4 : 10); seed++) {
      const p = E.generate(mode, seed);
      eq(E.logicSolve(p.n, p.clues, E.MODES[mode].logic), p.sol, mode + ' seed ' + seed);
    }
  });
});

/* ---------------- Thao tác trên ván ---------------- */

test('ván mới: chưa có cạnh, chưa đi nước nào, chưa thắng', () => {
  const g = E.newGame({ mode: 's', seed: 5 });
  eq([g.mode, g.n, g.moves, g.hints, E.isSolved(g)], ['s', 5, 0, 0, false]);
  ok(g.edges.every((x) => x === 0));
});

test('chạm cạnh: trống → đường → × → trống (chạm ngược: trống → × → trống), mỗi lần một nước', () => {
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
  eq(g.edges[3], 2, 'chạm ngược trên đường → ×');
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
  eq(E.apply(g, [[-1, 1]]), g, 'cạnh ngoài bàn bị bỏ qua');
});

test('vẽ đúng vòng → thắng (× không ảnh hưởng); thao tác sau khi thắng bị bỏ qua', () => {
  let g = E.newGame({ mode: 's', seed: 9 });
  g = E.apply(g, g.sol.map((x, e) => [e, x ? 1 : 2]));
  ok(E.isSolved(g));
  eq(E.cycle(g, 0), g);
  eq(E.undo(g), g);
  let h = E.newGame({ mode: 's', seed: 9 });
  h = E.apply(h, h.sol.map((x, e) => [e, x]).filter((c) => c[1]));
  ok(E.isSolved(h), 'chỉ vẽ đường, không đánh ×');
  h = E.newGame({ mode: 's', seed: 9 });
  h = E.apply(h, h.sol.map((x, e) => [e, x]).filter((c, i) => c[1] && i !== h.sol.indexOf(1)));
  ok(!E.isSolved(h), 'thiếu một cạnh thì chưa thắng');
});

test('phân tích: số đủ cạnh / thừa / không thể đủ, điểm 3 đường, đầu cụt, vòng con khép sớm', () => {
  const n = 3;
  const clues = [1, -1, -1, -1, 2, -1, -1, -1, 0];
  const sol = loopOf(n, [0, 0, 0, 0, 1, 1, 0, 0, 0]);
  const fresh = () => E.fromPuzzle({ mode: 's', n, seed: 1, clues, sol });
  let g = E.apply(fresh(), [[E.hEdge(n, 0, 0), 1]]);
  eq(E.analyze(g).cell[0], 'done');
  g = E.apply(g, [[E.vEdge(n, 0, 0), 1]]);
  eq(E.analyze(g).cell[0], 'over');
  g = E.apply(g, [[E.hEdge(n, 1, 1), 2], [E.hEdge(n, 2, 1), 2], [E.vEdge(n, 1, 1), 2]]);
  eq(E.analyze(g).cell[4], 'short');
  eq(E.analyze(fresh()).cell[8], '', 'số 0 chưa đánh dấu gì: chưa mờ');
  g = E.apply(fresh(), [[E.hEdge(n, 2, 2), 2], [E.hEdge(n, 3, 2), 2], [E.vEdge(n, 2, 2), 2], [E.vEdge(n, 2, 3), 2]]);
  eq(E.analyze(g).cell[8], 'done', 'số 0 đủ 4 dấu × thì mờ');
  g = E.apply(fresh(), [[E.hEdge(n, 1, 0), 1], [E.hEdge(n, 1, 1), 1], [E.vEdge(n, 0, 1), 1]]);
  eq(E.analyze(g).vertex[1 * (n + 1) + 1], 'branch');
  g = E.apply(fresh(), [[E.hEdge(n, 0, 0), 1], [E.vEdge(n, 0, 1), 2], [E.hEdge(n, 0, 1), 2]]);
  eq(E.analyze(g).vertex[1], 'dead');
  g = E.apply(fresh(), loopOf(n, [1, 0, 0, 0, 0, 0, 0, 0, 0]).map((x, e) => [e, x]).filter((c) => c[1]));
  const a = E.analyze(g);
  ok(a.badLoop && !a.solved, 'vòng con sai');
  ok(a.loopEdges.length === 4, 'đánh dấu 4 cạnh của vòng con');
});

test('gợi ý: sửa đường sai trước, rồi chỉ một cạnh của lời giải; gợi ý tăng hints và dẫn tới thắng', () => {
  let g = E.newGame({ mode: 's', seed: 4 });
  const wrong = g.sol.indexOf(0);
  g = E.apply(g, [[wrong, 1]]);
  let h = E.hint(g);
  eq([h.e, h.to], [wrong, 2]);
  g = E.useHint(g);
  eq([g.edges[wrong], g.hints], [2, 1]);
  h = E.hint(g);
  eq([g.sol[h.e], h.to], [1, 1]);
  for (let i = 0; i < 300 && !E.isSolved(g); i++) g = E.useHint(g);
  ok(E.isSolved(g), 'gợi ý dẫn tới thắng');
  eq(E.hint(g), null);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử hoàn tác / làm lại)', () => {
  let g = E.newGame({ mode: 'm', seed: 77 });
  g = E.apply(g, [[1, 1], [2, 1]]);
  g = E.cycle(g, 5);
  g = E.undo(g);
  g = E.useHint(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.undo(back).edges, E.undo(g).edges);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.cycle(E.newGame({ mode: 's', seed: 3 }), 0));
  const firstClue = good.clues.findIndex((x) => x >= 0);
  const bad = [
    null,
    1,
    'x',
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { mode: 'xl' }),
    Object.assign({}, good, { n: 6 }),
    Object.assign({}, good, { clues: good.clues.slice(1) }),
    Object.assign({}, good, { clues: good.clues.map((c, i) => (i === 0 ? 4 : c)) }),
    Object.assign({}, good, { clues: good.clues.map((c, i) => (i === firstClue ? (c + 1) % 4 : c)) }),
    Object.assign({}, good, { sol: good.sol.replace(/^./, (c) => (c === '1' ? '0' : '1')) }),
    Object.assign({}, good, { sol: good.sol + '0' }),
    Object.assign({}, good, { edges: good.edges.replace(/^./, '7') }),
    Object.assign({}, good, { edges: good.edges.slice(1) }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { hints: 1.5 }),
    Object.assign({}, good, { seed: 'a' }),
    Object.assign({}, good, { undo: [[[0, 0]]] }),
    Object.assign({}, good, { undo: [[[9999, 0, 1]]] }),
    Object.assign({}, good, { undo: [[[0, 0, 3]]] }),
    Object.assign({}, good, { redo: 'x' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
  ok(E.fromJSON(good), 'mẫu tốt vẫn nhận');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
Object.keys(genStats).forEach((m) => {
  const s = genStats[m];
  console.log('  sinh đề ' + m + ': trung bình ' + s.avg + ' ms, chậm nhất ' + s.worst + ' ms, vòng ngắn nhất ' + s.minLen + ' cạnh, trung bình ' + s.clues + ' số');
});
if (failed) process.exit(1);
