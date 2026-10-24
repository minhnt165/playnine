/* Kiểm tra engine Cầu Nối: chạy `node test.js`
 * - PRNG theo seed, dựng cặp đảo nối được và cặp cầu cắt nhau
 * - Thêm cầu 0 → 1 → 2 → 0, chặn cầu cắt nhau, hoàn tác / làm lại / xóa hết
 * - Thắng: đủ cầu ở mọi đảo + liên thông; lỗi: đảo thừa cầu, nhóm đảo khép kín
 * - Solver đếm nghiệm (dừng ở giới hạn); đề sinh ra có lời giải duy nhất ở mọi mode, trên nhiều seed
 * - Gợi ý, lưu / khôi phục và từ chối dữ liệu hỏng
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

/** Dựng ván tay từ danh sách đảo [r, c, n] (lời giải = nghiệm đầu tiên solver tìm được, vô nghiệm thì null). */
const manual = (size, islands) => E.fromPuzzle('s', size, islands);
/** Cạnh nối hai đảo a, b (-1 nếu không có). */
const edgeOf = (g, a, b) => g.net.edges.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));

const ROW5 = [[0, 0, 1], [0, 2, 1], [0, 4, 1], [2, 0, 1], [2, 4, 1]];
const CROSS = [[0, 2, 1], [4, 2, 1], [2, 0, 1], [2, 4, 1]]; // cầu dọc và cầu ngang buộc phải cắt nhau ở (2,2)
const SQUARE = [[0, 0, 2], [0, 3, 2], [3, 0, 2], [3, 3, 2]]; // bốn đảo số 2 ở bốn góc: lời giải duy nhất là vòng cầu đơn

/* ---------------- PRNG ---------------- */

test('PRNG: cùng seed cùng dãy, khác seed khác dãy', () => {
  const a = E.rng(42);
  const b = E.rng(42);
  const c = E.rng(43);
  const xa = [a(), a(), a()];
  eq(xa, [b(), b(), b()]);
  ok(JSON.stringify(xa) !== JSON.stringify([c(), c(), c()]));
  const r = E.rng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.int(5);
    ok(v >= 0 && v < 5 && Number.isInteger(v));
  }
});

/* ---------------- Cạnh và cầu cắt nhau ---------------- */

test('cạnh: chỉ nối đảo gần nhất theo hàng / cột, không xuyên qua đảo', () => {
  const g = manual(5, ROW5);
  const pairs = g.net.edges.map(([a, b]) => [a, b].sort().join('-')).sort();
  // 0-1, 1-2 (không có 0-2 vì đảo 1 chắn giữa), 0-3, 2-4, 3-4
  eq(pairs, ['0-1', '0-3', '1-2', '2-4', '3-4']);
  eq(g.net.nb[1], [-1, edgeOf(g, 1, 2), -1, edgeOf(g, 0, 1)], 'cạnh theo hướng trên / phải / dưới / trái');
});

test('cạnh: cầu ngang và cầu dọc cắt nhau được đánh dấu', () => {
  const g = manual(5, CROSS);
  const v = edgeOf(g, 0, 1);
  const h = edgeOf(g, 2, 3);
  ok(v >= 0 && h >= 0);
  ok(g.net.cross[v].indexOf(h) >= 0 && g.net.cross[h].indexOf(v) >= 0);
});

/* ---------------- Luật thêm cầu ---------------- */

test('thêm cầu: 0 → 1 → 2 → 0, đếm nước', () => {
  let g = manual(4, SQUARE);
  const e = edgeOf(g, 0, 1);
  g = E.cycle(g, e);
  eq([g.br[e], g.moves], [1, 1]);
  g = E.cycle(g, e);
  eq([g.br[e], g.moves], [2, 2]);
  g = E.cycle(g, e);
  eq([g.br[e], g.moves], [0, 3]);
});

test('thêm cầu: không được cắt cầu đã có (trả lại đúng ván cũ)', () => {
  let g = manual(5, CROSS);
  const v = edgeOf(g, 0, 1);
  const h = edgeOf(g, 2, 3);
  g = E.cycle(g, v);
  const blocked = E.cycle(g, h);
  ok(blocked === g, 'phải trả lại chính ván cũ');
  ok(E.blockedBy(g, h).indexOf(v) >= 0);
  // Gỡ cầu dọc thì cầu ngang đặt được
  g = E.cycle(E.cycle(g, v), v);
  eq(g.br[v], 0);
  g = E.cycle(g, h);
  eq(g.br[h], 1);
});

test('link(a, b): nối theo hai đảo, cặp không thấy nhau thì bỏ qua', () => {
  let g = manual(4, SQUARE);
  g = E.link(g, 0, 3);
  eq(g.moves, 0, 'đảo chéo nhau không nối được');
  g = E.link(g, 3, 1);
  eq(g.br[edgeOf(g, 1, 3)], 1);
});

test('hoàn tác / làm lại không giới hạn, nước mới xóa nhánh làm lại', () => {
  let g = manual(4, SQUARE);
  const e = edgeOf(g, 0, 1);
  const f = edgeOf(g, 0, 2);
  g = E.cycle(E.cycle(E.cycle(g, e), e), f);
  eq([g.br[e], g.br[f]], [2, 1]);
  g = E.undo(g);
  g = E.undo(g);
  eq([g.br[e], g.br[f], g.undo.length, g.redo.length], [1, 0, 1, 2]);
  g = E.redo(g);
  eq([g.br[e], g.br[f]], [2, 0]);
  g = E.cycle(g, f);
  eq(g.redo.length, 0);
  g = E.undo(E.undo(E.undo(g)));
  eq(g.br.every((x) => x === 0), true);
  ok(E.undo(g) === g, 'hết lịch sử thì không đổi');
  eq(g.moves, 10, 'hoàn tác / làm lại cũng tính là nước');
});

test('xóa hết là một bước, hoàn tác được', () => {
  let g = manual(4, SQUARE);
  g = E.cycle(E.cycle(g, 0), 1);
  const before = g.br.slice();
  g = E.clear(g);
  eq(g.br.every((x) => x === 0), true);
  g = E.undo(g);
  eq(g.br, before);
  const empty = manual(4, SQUARE);
  ok(E.clear(empty) === empty, 'bàn trống thì xóa hết không đổi gì');
});

/* ---------------- Thắng / lỗi ---------------- */

test('thắng: đủ cầu ở mọi đảo và liên thông', () => {
  let g = manual(4, SQUARE);
  ok(!E.isWon(g));
  g.net.edges.forEach((x, e) => { g = E.cycle(g, e); });
  eq(E.doneCount(g), 4);
  ok(E.isWon(g));
});

test('không thắng khi đủ số nhưng tách thành hai nhóm; nhóm khép kín là lỗi', () => {
  let g = manual(4, SQUARE);
  const top = edgeOf(g, 0, 1);
  const bottom = edgeOf(g, 2, 3);
  g = E.cycle(E.cycle(g, top), top);
  g = E.cycle(E.cycle(g, bottom), bottom);
  eq(E.doneCount(g), 4);
  ok(!E.isWon(g));
  eq(E.errors(g).closed.sort(), [0, 1, 2, 3]);
});

test('lỗi: đảo thừa cầu', () => {
  let g = manual(5, ROW5);
  const e = edgeOf(g, 0, 1);
  g = E.cycle(E.cycle(g, e), e);
  eq(E.count(g, 0), 2);
  eq(E.errors(g).over.sort(), [0, 1]);
  ok(!E.isComplete(g, 0));
});

/* ---------------- Solver ---------------- */

test('solver: vòng bốn đảo số 2 có đúng 1 nghiệm', () => {
  const r = E.solve(4, SQUARE, 2);
  eq(r.count, 1);
  eq(r.solution, [1, 1, 1, 1]);
});

test('solver: bốn đảo số 3 có 2 nghiệm (đề không duy nhất)', () => {
  eq(E.solve(4, [[0, 0, 3], [0, 3, 3], [3, 0, 3], [3, 3, 3]], 5).count, 2);
});

test('solver: dừng ở giới hạn và báo 0 khi vô nghiệm', () => {
  eq(E.solve(4, [[0, 0, 3], [0, 3, 3], [3, 0, 3], [3, 3, 3]], 1).count, 1);
  eq(E.solve(4, [[0, 0, 1], [0, 3, 1], [3, 0, 1], [3, 3, 1]], 2).count, 0, 'bốn đảo số 1 không liên thông được');
  eq(E.solve(5, CROSS, 2).count, 0, 'hai cầu buộc phải cắt nhau');
  eq(E.solve(3, [[0, 0, 3], [0, 2, 3]], 2).count, 0, 'một cặp tối đa 2 cầu');
});

test('solver: chuỗi có cầu đôi bắt buộc', () => {
  const r = E.solve(7, [[0, 0, 1], [0, 2, 3], [0, 4, 4], [0, 6, 2]], 3);
  eq(r.count, 1);
  eq(r.solution, [1, 2, 2]);
});

/** Solver ngây thơ độc lập (thử lần lượt 0..2 cho từng cạnh, chỉ cắt nhánh khi tổng vượt số) để đối chiếu. */
function naiveCount(size, islands, limit) {
  const net = E.buildNet(size, islands);
  const M = net.edges.length;
  const br = new Array(M).fill(0);
  const sum = new Array(islands.length).fill(0);
  // Cạnh cuối cùng chạm tới mỗi đảo: gán xong cạnh đó thì tổng của đảo phải đúng bằng số
  const lastEdge = islands.map((x, i) => Math.max.apply(null, net.byIsland[i].concat([-1])));
  let found = 0;
  function connected() {
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const i = stack.pop();
      net.byIsland[i].forEach((e) => {
        if (!br[e]) return;
        const j = net.edges[e][0] === i ? net.edges[e][1] : net.edges[e][0];
        if (!seen.has(j)) { seen.add(j); stack.push(j); }
      });
    }
    return seen.size === islands.length;
  }
  function rec(e) {
    if (found >= limit) return;
    if (e === M) {
      if (islands.every((x, i) => sum[i] === x[2]) && connected()) found++;
      return;
    }
    const [a, b] = net.edges[e];
    for (let v = 0; v <= 2; v++) {
      if (v && net.cross[e].some((c) => c < e && br[c])) break;
      if (sum[a] + v > islands[a][2] || sum[b] + v > islands[b][2]) break;
      br[e] = v; sum[a] += v; sum[b] += v;
      const okA = lastEdge[a] !== e || sum[a] === islands[a][2];
      const okB = lastEdge[b] !== e || sum[b] === islands[b][2];
      if (okA && okB) rec(e + 1);
      br[e] = 0; sum[a] -= v; sum[b] -= v;
    }
  }
  if (islands.some((x, i) => !net.byIsland[i].length)) return 0;
  rec(0);
  return found;
}

test('solver khớp solver ngây thơ trên đề sinh ra và trên bố cục ngẫu nhiên (cả đề nhiều nghiệm)', () => {
  let multi = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = E.newGame('s', seed);
    eq(naiveCount(g.size, g.islands, 3), 1, 'đề s seed ' + seed);
    // Bố cục mọc ngẫu nhiên chưa lọc: số nghiệm của hai solver phải bằng nhau
    const islands = E.grow(7, 9 + (seed % 4), E.rng(seed * 31));
    const a = E.solve(7, islands, 3).count;
    eq(naiveCount(7, islands, 3), a, 'bố cục seed ' + seed);
    if (a > 1) multi++;
  }
  ok(multi > 0, 'phải gặp ít nhất một bố cục nhiều nghiệm');
});

/* ---------------- Sinh đề ---------------- */

const SEEDS = { s: 60, m: 40, l: 25 };
Object.keys(E.MODES).forEach((mode) => {
  test('sinh đề ' + mode + ': lời giải duy nhất, hợp luật, trên ' + SEEDS[mode] + ' seed', () => {
    const conf = E.MODES[mode];
    for (let seed = 1; seed <= SEEDS[mode]; seed++) {
      const g = E.newGame(mode, seed * 7919);
      eq(g.size, conf.size);
      ok(g.islands.length >= conf.islands[0] && g.islands.length <= conf.islands[1], 'số đảo ' + g.islands.length);
      const seen = new Set();
      g.islands.forEach(([r, c, n]) => {
        ok(r >= 0 && c >= 0 && r < g.size && c < g.size && n >= 1 && n <= 8);
        seen.add(r * g.size + c);
      });
      eq(seen.size, g.islands.length, 'hai đảo trùng ô');
      // Không có hai đảo kề nhau theo hàng / cột
      g.islands.forEach(([r, c]) => {
        ok(!seen.has((r + 1) * g.size + c), 'đảo kề nhau theo cột');
        ok(c + 1 >= g.size || !seen.has(r * g.size + c + 1), 'đảo kề nhau theo hàng');
      });
      const r = E.solve(g.size, g.islands, 2);
      eq(r.count, 1, 'seed ' + seed * 7919 + ' phải có đúng 1 nghiệm');
      eq(r.solution, g.sol, 'nghiệm duy nhất trùng lời giải lưu');
      // Đặt lời giải lên bàn thì thắng
      let w = g;
      g.sol.forEach((k, e) => { for (let i = 0; i < k; i++) w = E.cycle(w, e); });
      ok(E.isWon(w), 'lời giải phải thắng');
    }
  });
});

test('sinh đề: cùng seed cùng đề, khác seed khác đề', () => {
  const a = E.newGame('m', 12345);
  const b = E.newGame('m', 12345);
  const c = E.newGame('m', 12346);
  eq(a.islands, b.islands);
  ok(JSON.stringify(a.islands) !== JSON.stringify(c.islands));
});

test('sinh đề: đủ nhanh (in thời gian trung bình / chậm nhất)', () => {
  Object.keys(E.MODES).forEach((mode) => {
    const N = 60;
    let total = 0;
    let worst = 0;
    for (let i = 0; i < N; i++) {
      const t0 = process.hrtime.bigint();
      E.newGame(mode, 1000003 * (i + 1));
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      total += ms;
      worst = Math.max(worst, ms);
    }
    console.log('       ' + mode + ': trung bình ' + (total / N).toFixed(1) + ' ms, chậm nhất ' + worst.toFixed(1) + ' ms');
    ok(total / N < 75, 'trung bình quá chậm');
  });
});

/* ---------------- Gợi ý ---------------- */

test('gợi ý: sửa cầu sai trước, đánh dấu trợ giúp, gợi ý mãi thì thắng', () => {
  let g = E.newGame('s', 99);
  const wrong = g.sol.findIndex((k, e) => k === 0 && !E.blockedBy(g, e).length);
  ok(wrong >= 0);
  g = E.cycle(g, wrong);
  ok(!g.assisted);
  const h = E.hint(g);
  ok(h && h.game !== g);
  ok(h.game.assisted);
  eq(h.edge, wrong, 'sửa cầu sai trước');
  eq(h.game.br[wrong], 0);
  g = h.game;
  for (let i = 0; i < 200 && !E.isWon(g); i++) g = E.hint(g).game;
  ok(E.isWon(g));
  eq(E.hint(g), null);
  ok(!E.isWon(E.undo(g)), 'hoàn tác được gợi ý');
  ok(E.undo(g).assisted, 'hoàn tác không xóa dấu trợ giúp');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván', () => {
  let g = E.newGame('m', 2024);
  g = E.cycle(g, 0);
  g = E.cycle(g, 0);
  g = E.undo(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back);
  eq(E.toJSON(back), E.toJSON(g));
  eq(back.net.edges, g.net.edges);
  eq([back.mode, back.moves, back.br, back.redo, back.assisted], [g.mode, g.moves, g.br, g.redo, false]);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.cycle(E.newGame('s', 5), 0));
  ok(E.fromJSON(good), 'mẫu tốt phải đọc được');
  const bad = [
    null,
    1,
    {},
    Object.assign({}, good, { v: 99 }),
    Object.assign({}, good, { mode: 'xl' }),
    Object.assign({}, good, { size: 10 }), // không khớp mode
    Object.assign({}, good, { islands: good.islands.slice(1) }), // lời giải không còn khớp
    Object.assign({}, good, { islands: [[0, 0, 9]].concat(good.islands.slice(1)) }),
    Object.assign({}, good, { islands: good.islands.map((x, i) => (i === 0 ? [x[0], x[1], x[2] + 1] : x)) }),
    Object.assign({}, good, { islands: good.islands.map((x) => [x[0] + 20, x[1], x[2]]) }),
    Object.assign({}, good, { islands: good.islands.concat([good.islands[0]]) }),
    Object.assign({}, good, { br: good.br.slice(1) }),
    Object.assign({}, good, { br: good.br.map(() => 3) }),
    Object.assign({}, good, { br: good.br.map(() => '1') }),
    Object.assign({}, good, { sol: good.sol.map(() => 0) }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { moves: 1.5 }),
    Object.assign({}, good, { assisted: 'yes' }),
    Object.assign({}, good, { undo: [[[0, 1]]] }),
    Object.assign({}, good, { undo: [[[999, 0, 1]]] }),
    Object.assign({}, good, { undo: [[]] }),
    Object.assign({}, good, { redo: 'x' }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
});

test('từ chối ván lưu có hai cầu cắt nhau', () => {
  const g = E.newGame('l', 77);
  const raw = E.toJSON(g);
  const pair = g.net.cross.findIndex((c) => c.length > 0);
  ok(pair >= 0, 'đề 13x13 phải có cặp cạnh cắt nhau');
  raw.br = raw.br.slice();
  raw.br[pair] = 1;
  raw.br[g.net.cross[pair][0]] = 1;
  eq(E.fromJSON(raw), null);
});

test('fromPuzzle: đề vô nghiệm vẫn dựng được (không có lời giải, không gợi ý)', () => {
  const g = manual(5, CROSS);
  eq(g.sol, null);
  eq(E.hint(g), null);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
