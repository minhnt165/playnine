/* Kiểm tra engine Chia Ô: chạy `node test.js`
 * - Luật: hình hợp lệ khi chứa đúng một số và diện tích bằng số đó; vẽ đè thì hình cũ bị gỡ
 * - Thắng: phủ kín lưới bằng các hình hợp lệ; ván đã thắng không đổi nữa
 * - Hoàn tác / làm lại, gợi ý (đếm số lần dùng)
 * - Sinh đề: mọi cỡ, nhiều hạt giống, lời giải duy nhất (solver đếm nghiệm dừng ở 2), đủ nhanh
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
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

const R = (r, c, h, w) => ({ r, c, h, w });

/* Đề 4x4 viết tay, lời giải duy nhất:
 *   . . 4 .      [4 4 4 4]
 *   . . 2 .      [6 6 2 2]
 *   . . . 4      [6 6 4 4]
 *   . 6 . .      [6 6 4 4]
 */
const TINY = {
  size: 4,
  clues: [{ r: 0, c: 2, n: 4 }, { r: 1, c: 2, n: 2 }, { r: 2, c: 3, n: 4 }, { r: 3, c: 1, n: 6 }],
};
const TINY_SOL = [R(0, 0, 1, 4), R(1, 2, 1, 2), R(2, 2, 2, 2), R(1, 0, 3, 2)];

function tinyGame() {
  return E.fromPuzzle({ mode: 's', size: 4, seed: 1, clues: TINY.clues });
}

/** Vẽ lần lượt mọi hình của lời giải. */
function solveByDrawing(g) {
  g.solution.forEach((rect) => { g = E.draw(g, rect); });
  return g;
}

/* ---------------- Solver ---------------- */

test('solver: đề viết tay có đúng một lời giải và tìm ra nó', () => {
  eq(E.countSolutions(TINY.size, TINY.clues, 2), 1);
  eq(E.solve(TINY.size, TINY.clues), TINY_SOL);
});

test('solver: đề nhiều lời giải dừng đếm ở giới hạn', () => {
  // 2x2 với hai số 2 ở đường chéo: chia ngang hoặc dọc đều được
  const clues = [{ r: 0, c: 0, n: 2 }, { r: 1, c: 1, n: 2 }];
  eq(E.countSolutions(2, clues, 2), 2);
  eq(E.countSolutions(2, clues, 1), 1);
});

test('solver: đề vô nghiệm trả 0 / null', () => {
  eq(E.countSolutions(2, [{ r: 0, c: 0, n: 3 }, { r: 1, c: 1, n: 1 }], 2), 0);
  eq(E.solve(2, [{ r: 0, c: 0, n: 3 }, { r: 1, c: 1, n: 1 }]), null);
  // tổng diện tích không khớp lưới
  eq(E.countSolutions(2, [{ r: 0, c: 0, n: 2 }], 2), 0);
});

/** Solver đối chứng, viết khác hẳn: lấy ô trống đầu tiên theo hàng làm góc trên trái của một hình. */
function bruteCount(n, clues, limit) {
  const at = new Map(clues.map((q) => [q.r * n + q.c, q.n]));
  const own = new Array(n * n).fill(false);
  let count = 0;
  function rec() {
    const i = own.indexOf(false);
    if (i < 0) { count++; return; }
    const r0 = Math.floor(i / n);
    const c0 = i % n;
    for (let h = 1; r0 + h <= n; h++) {
      for (let w = 1; c0 + w <= n; w++) {
        let free = true;
        const found = [];
        for (let r = r0; r < r0 + h && free; r++) {
          for (let c = c0; c < c0 + w; c++) {
            if (own[r * n + c]) { free = false; break; }
            if (at.has(r * n + c)) found.push(at.get(r * n + c));
          }
        }
        if (!free) break; // rộng hơn cũng đụng ô đã phủ
        if (found.length !== 1 || found[0] !== h * w) continue;
        for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) own[r * n + c] = true;
        rec();
        for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) own[r * n + c] = false;
        if (count >= limit) return;
      }
    }
  }
  rec();
  return Math.min(count, limit);
}

test('solver khớp solver đối chứng trên 400 đề ngẫu nhiên (có đề nhiều nghiệm, vô nghiệm)', () => {
  const rand = E.rng(99);
  const tally = [0, 0, 0];
  for (let t = 0; t < 400; t++) {
    const n = 3 + rand.int(3);
    // chia lưới thô: các hình 1..3 x 1..3 quét theo hàng, đặt số ở ô ngẫu nhiên
    const own = new Array(n * n).fill(false);
    const clues = [];
    for (let i = 0; i < n * n; i++) {
      if (own[i]) continue;
      const r0 = Math.floor(i / n);
      const c0 = i % n;
      let w = 1 + rand.int(3);
      let h = 1 + rand.int(3);
      while (c0 + w > n || own[r0 * n + c0 + w - 1]) w--;
      while (r0 + h > n) h--;
      let okRect = false;
      while (!okRect) {
        okRect = true;
        for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (own[r * n + c]) okRect = false;
        if (!okRect) h--;
      }
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) own[r * n + c] = true;
      clues.push({ r: r0 + rand.int(h), c: c0 + rand.int(w), n: h * w });
    }
    if (t % 10 === 0) clues[0] = Object.assign({}, clues[0], { n: clues[0].n + 1 }); // thỉnh thoảng làm hỏng tổng
    const want = bruteCount(n, clues, 3);
    tally[Math.min(want, 2)]++;
    eq(E.countSolutions(n, clues, 3), want, 'n=' + n + ' ' + JSON.stringify(clues));
  }
  ok(tally[0] > 0 && tally[1] > 0 && tally[2] > 0, 'đủ cả 3 loại: ' + tally);
});

test('đề 7x7 sinh ra: solver đối chứng cũng thấy đúng một nghiệm', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = E.newGame({ mode: 's', seed });
    eq(bruteCount(7, g.clues, 2), 1, 'seed ' + seed);
  }
});

/* ---------------- Luật ---------------- */

test('rectFrom chuẩn hóa hai góc bất kỳ', () => {
  eq(E.rectFrom({ r: 3, c: 1 }, { r: 1, c: 2 }), R(1, 1, 3, 2));
  eq(E.rectFrom({ r: 0, c: 0 }, { r: 0, c: 0 }), R(0, 0, 1, 1));
});

test('trạng thái hình: ok / sai diện tích / không có số / nhiều số', () => {
  const g = tinyGame();
  eq(E.rectStatus(g, R(0, 0, 1, 4)), 'ok');
  eq(E.rectStatus(g, R(0, 0, 1, 3)), 'area');
  eq(E.rectStatus(g, R(0, 1, 1, 1)), 'empty');
  eq(E.rectStatus(g, R(0, 0, 2, 3)), 'many');
  eq(E.rectStatus(g, R(2, 2, 2, 2)), 'ok');
  // hợp lệ cục bộ (một số, đúng diện tích) dù không phải hình của lời giải
  eq(E.rectStatus(g, R(2, 0, 2, 3)), 'ok');
  eq(E.rectOk(g, R(2, 0, 2, 3)), true);
  eq(E.rectOk(g, R(0, 1, 1, 1)), false);
});

test('vẽ hình: thêm vào bàn, đếm nước', () => {
  let g = tinyGame();
  g = E.draw(g, R(0, 0, 1, 4));
  eq(g.rects, [R(0, 0, 1, 4)]);
  eq(g.moves, 1);
  eq(E.rectAt(g, 0, 3), 0);
  eq(E.rectAt(g, 1, 0), -1);
  eq(E.coverage(g), 4);
});

test('vẽ đè gỡ mọi hình chồng lên; vẽ trùng hình cũ không đổi gì', () => {
  let g = tinyGame();
  g = E.draw(g, R(0, 0, 1, 2));
  g = E.draw(g, R(1, 2, 1, 2));
  const same = E.draw(g, R(1, 2, 1, 2));
  ok(same === g, 'vẽ trùng trả nguyên ván');
  g = E.draw(g, R(0, 1, 2, 2)); // chồng cả hai hình
  eq(g.rects, [R(0, 1, 2, 2)]);
  eq(g.moves, 3);
});

test('vẽ ngoài lưới hoặc kích thước sai bị bỏ qua', () => {
  const g = tinyGame();
  ok(E.draw(g, R(3, 3, 2, 1)) === g);
  ok(E.draw(g, R(-1, 0, 1, 1)) === g);
  ok(E.draw(g, R(0, 0, 0, 1)) === g);
  ok(E.draw(g, R(0, 0, 1.5, 1)) === g);
});

test('xóa hình tại ô; ô trống thì không đổi', () => {
  let g = E.draw(tinyGame(), R(0, 0, 1, 4));
  ok(E.erase(g, 2, 2) === g);
  g = E.erase(g, 0, 2);
  eq(g.rects, []);
  eq(g.moves, 2);
});

test('xóa hết là một nước, hoàn tác được', () => {
  let g = E.draw(E.draw(tinyGame(), R(0, 0, 1, 4)), R(1, 2, 1, 2));
  g = E.clear(g);
  eq(g.rects, []);
  eq(g.moves, 3);
  g = E.undo(g);
  eq(g.rects.length, 2);
  const empty = tinyGame();
  ok(E.clear(empty) === empty, 'bàn trống thì không có nước');
});

test('hoàn tác / làm lại không giới hạn, kể cả vẽ đè', () => {
  let g = tinyGame();
  g = E.draw(g, R(0, 0, 1, 2));
  g = E.draw(g, R(0, 1, 2, 2));
  eq(g.rects, [R(0, 1, 2, 2)]);
  ok(E.canUndo(g) && !E.canRedo(g));
  g = E.undo(g);
  eq(g.rects, [R(0, 0, 1, 2)]);
  g = E.undo(g);
  eq(g.rects, []);
  ok(!E.canUndo(g) && E.canRedo(g));
  ok(E.undo(g) === g, 'hết lịch sử thì không đổi');
  g = E.redo(E.redo(g));
  eq(g.rects, [R(0, 1, 2, 2)]);
  ok(E.redo(g) === g);
  // nước mới sau hoàn tác xóa nhánh làm lại
  g = E.draw(E.undo(g), R(3, 0, 1, 2));
  ok(!E.canRedo(g));
  // 200 nước rồi hoàn tác hết
  let h = tinyGame();
  for (let i = 0; i < 200; i++) h = E.draw(h, R(i % 4, 0, 1, 1 + (i % 3)));
  for (let i = 0; i < 200; i++) h = E.undo(h);
  eq(h.rects, []);
  ok(!E.canUndo(h));
});

test('thắng khi phủ kín bằng hình hợp lệ; ván thắng không đổi nữa', () => {
  let g = tinyGame();
  ok(!E.isSolved(g));
  g = E.draw(g, R(0, 0, 1, 4));
  g = E.draw(g, R(1, 2, 1, 2));
  g = E.draw(g, R(2, 2, 2, 2));
  ok(!E.isSolved(g));
  g = E.draw(g, R(1, 0, 3, 2));
  ok(E.isSolved(g));
  ok(E.draw(g, R(0, 0, 1, 1)) === g);
  ok(E.erase(g, 0, 0) === g);
  ok(E.clear(g) === g);
  ok(E.undo(g) === g);
  ok(E.hint(g) === g);
});

test('phủ kín nhưng có hình sai thì chưa thắng', () => {
  let g = tinyGame();
  g = E.draw(g, R(0, 0, 2, 2)); // không có số
  g = E.draw(g, R(0, 2, 2, 2)); // chứa số 2, diện tích 4: sai
  g = E.draw(g, R(2, 0, 2, 4));
  eq(E.coverage(g), 16);
  ok(!E.isSolved(g));
});

test('gợi ý đặt một hình của lời giải, ưu tiên sửa hình sai, đếm số lần', () => {
  let g = tinyGame();
  g = E.draw(g, R(0, 1, 1, 3)); // hình sai chứa số 4 đầu tiên
  g = E.hint(g);
  eq(g.hints, 1);
  ok(g.rects.some((x) => x.r === 0 && x.c === 0 && x.h === 1 && x.w === 4), 'đã đặt hình đúng cho số bị đè');
  ok(!g.rects.some((x) => x.h === 1 && x.w === 3), 'hình sai bị gỡ');
  let guard = 0;
  while (!E.isSolved(g) && guard++ < 10) g = E.hint(g);
  ok(E.isSolved(g));
  eq(g.hints, TINY.clues.length);
});

test('màu: hai hình kề nhau của lời giải không trùng màu', () => {
  ['s', 'm', 'l'].forEach((mode) => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = E.newGame({ mode, seed });
      const col = E.colors(g, 8);
      eq(col.length, g.clues.length);
      const own = E.ownerGrid(g.size, g.solution);
      const n = g.size;
      for (let i = 0; i < n * n; i++) {
        const r = Math.floor(i / n);
        const c = i % n;
        if (c + 1 < n && own[i] !== own[i + 1]) ok(col[own[i]] !== col[own[i + 1]], mode + ' seed ' + seed);
        if (r + 1 < n && own[i] !== own[i + n]) ok(col[own[i]] !== col[own[i + n]], mode + ' seed ' + seed);
      }
      col.forEach((x) => ok(Number.isInteger(x) && x >= 0 && x < 8));
    }
  });
});

/* ---------------- Sinh đề ---------------- */

function checkPuzzle(g) {
  const n = g.size;
  eq(n, E.SIZES[g.mode]);
  // số nằm trong lưới, không trùng ô, tổng bằng diện tích lưới
  const seen = new Set();
  let sum = 0;
  g.clues.forEach((q) => {
    ok(q.r >= 0 && q.r < n && q.c >= 0 && q.c < n && Number.isInteger(q.n) && q.n >= 1);
    ok(!seen.has(q.r * n + q.c), 'trùng ô');
    seen.add(q.r * n + q.c);
    sum += q.n;
  });
  eq(sum, n * n, 'tổng các số');
  // lời giải phủ kín, mỗi hình đúng số của nó
  const own = E.ownerGrid(n, g.solution);
  ok(own.every((x) => x >= 0), 'phủ kín');
  g.solution.forEach((rect, k) => {
    eq(rect.h * rect.w, g.clues[k].n);
    eq(E.rectStatus(g, rect), 'ok');
    ok(own[g.clues[k].r * n + g.clues[k].c] === k);
  });
  eq(E.countSolutions(n, g.clues, 2), 1, 'lời giải duy nhất');
  ok(E.isSolved(solveByDrawing(g)), 'vẽ lời giải là thắng');
}

['s', 'm', 'l'].forEach((mode) => {
  test('sinh đề ' + mode + ' (' + E.SIZES[mode] + 'x' + E.SIZES[mode] + '): 40 hạt giống, lời giải duy nhất', () => {
    const counts = [];
    for (let seed = 1; seed <= 40; seed++) {
      const g = E.newGame({ mode, seed: seed * 7919 });
      checkPuzzle(g);
      counts.push(g.clues.length);
    }
    console.log('       số hình: ' + Math.min(...counts) + '–' + Math.max(...counts) + ', trung bình ' + (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1));
  });
});

test('sinh đề tất định theo hạt giống', () => {
  eq(E.newGame({ mode: 'm', seed: 42 }).clues, E.newGame({ mode: 'm', seed: 42 }).clues);
  ok(JSON.stringify(E.newGame({ mode: 'm', seed: 42 }).clues) !== JSON.stringify(E.newGame({ mode: 'm', seed: 43 }).clues));
});

test('sinh đề cỡ lớn đủ nhanh (trung bình < 60 ms trong Node)', () => {
  let worst = 0;
  const N = 30;
  const t0 = Date.now();
  for (let s = 0; s < N; s++) {
    const t = Date.now();
    E.newGame({ mode: 'l', seed: 1000 + s });
    worst = Math.max(worst, Date.now() - t);
  }
  const avg = (Date.now() - t0) / N;
  console.log('       13x13: trung bình ' + avg.toFixed(1) + ' ms / đề, chậm nhất ' + worst + ' ms');
  ok(avg < 60, 'chậm: ' + avg);
});

test('mode lạ rơi về s', () => {
  eq(E.newGame({ mode: 'x', seed: 1 }).mode, 's');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử hoàn tác)', () => {
  let g = E.newGame({ mode: 'm', seed: 5 });
  g = E.draw(g, g.solution[0]);
  g = E.draw(g, g.solution[1]);
  g = E.undo(g);
  g = E.hint(g);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'khôi phục được');
  eq(back, g);
  eq(E.redo(E.undo(back)).rects, g.rects);
});

test('từ chối dữ liệu hỏng', () => {
  const base = E.newGame({ mode: 's', seed: 3 });
  const g = E.draw(E.draw(base, base.solution[0]), base.solution[1]);
  const good = E.toJSON(g);
  eq(!!E.fromJSON(JSON.parse(JSON.stringify(good))), true, 'bản gốc hợp lệ');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const clues = good.clues;
  const s0 = good.rects[0];
  const diag = Array.from({ length: 7 }, (_, i) => [i, i, 7]); // 7 hàng hoặc 7 cột đều được: hai lời giải
  [
    null, 1, 'x', {}, [],
    bad({ v: 2 }),
    bad({ mode: 'xl' }),
    bad({ mode: 'm' }), // cỡ lưới không khớp mode
    bad({ clues: clues.slice(1) }), // tổng không khớp
    bad({ clues: clues.map((q, i) => (i ? q : [q[0], q[1], String(q[2])])) }),
    bad({ clues: clues.map((q, i) => (i === 1 ? [clues[0][0], clues[0][1], q[2]] : q)) }), // trùng ô
    bad({ clues: clues.map((q, i) => (i ? q : [7, q[1], q[2]])) }), // ngoài lưới
    bad({ clues: diag, rects: [], undo: [], redo: [] }), // không có lời giải duy nhất
    bad({ rects: [[0, 0, 1, 1], [0, 0, 1, 1]] }), // chồng nhau
    bad({ rects: [[0, 0, 1, 8]] }), // ra ngoài
    bad({ rects: [[0, 0, 1]] }),
    bad({ moves: -1 }),
    bad({ moves: 1 }), // ít hơn số nước trong lịch sử
    bad({ hints: 1.5 }),
    bad({ seed: 'x' }),
    bad({ undo: good.undo.concat([[[[6, 6, 1, 1], [5, 5, 1, 1]], []]]), moves: 3 }), // lịch sử không khớp bàn
    bad({ redo: [[[[s0[0], s0[1], 1, 1]], []]], moves: 3 }), // làm lại đè lên hình đang có mà không gỡ
    bad({ undo: 'x' }),
  ].forEach((raw, i) => {
    eq(E.fromJSON(raw), null, '#' + i + ' ' + JSON.stringify(raw));
  });
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
