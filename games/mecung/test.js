/* Kiểm tra engine Mê Cung: chạy `node test.js`
 * - Mê cung hoàn hảo: số lối thông = số ô - 1, liên thông, tường hai phía khớp nhau, không thủng ra ngoài
 * - Tất định theo seed (và theo ngày cho đề hằng ngày); lối vào hàng trên, lối ra hàng dưới, xa nhau theo đường đi
 * - Di chuyển: không xuyên tường, vết đi nối khi tiến / xóa khi lùi, kéo ngón tay chỉ đi qua ô kề hợp lệ
 * - Trượt tới ngã rẽ dừng đúng chỗ (bàn dựng tay + kiểm tra tính chất trên mê cung ngẫu nhiên)
 * - Gợi ý đúng đường ngắn nhất; đi theo gợi ý tới lối ra là thắng; sau khi thắng không đi tiếp được
 * - Lưu / khôi phục và từ chối dữ liệu hỏng; tốc độ sinh mê cung; ngưỡng min_time_ms trong game.json
 */
const E = require('./engine.js');
const manifest = require('./game.json');

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

function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

const SIZE_MODES = ['easy', 'medium', 'hard'];
const MODES_ALL = ['easy', 'medium', 'hard', 'daily'];
// Dấu vân tay của mê cung 10x15 seed 1 (khóa thuật toán sinh)
const FINGERPRINT = 2371214750;
const START1 = 2;
const GOAL1 = 143;
const seedsOf = (k) => Array.from({ length: k }, (_, i) => (i * 2654435761 + 7) >>> 0);
const roundTrip = (g) => E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
const same = (a, b) => JSON.stringify(Array.from(a)) === JSON.stringify(Array.from(b));

/** Mê cung dựng tay: danh sách [ô, hướng] được đào thông. */
function handMaze(w, h, edges, start, goal) {
  const m = { w, h, cells: new Uint8Array(w * h), start, goal, startSide: E.N, goalSide: E.S };
  edges.forEach(([i, d]) => {
    m.cells[i] |= d;
    m.cells[E.neighbor(m, i, d)] |= E.OPP[d];
  });
  return m;
}

/* ---------------- Mê cung hoàn hảo ---------------- */

test('mê cung hoàn hảo: số lối thông = số ô - 1 và mọi ô liên thông (mọi cỡ, 300 seed mỗi cỡ)', () => {
  SIZE_MODES.forEach((mode) => {
    const { w, h } = E.SIZES[mode];
    seedsOf(300).forEach((seed) => {
      const m = E.generate(w, h, seed);
      let bits = 0;
      for (let i = 0; i < w * h; i++) bits += E.degree(m, i);
      eq(bits / 2, w * h - 1, mode + ' seed ' + seed + ' số lối thông');
      const { dist } = E.bfs(m, m.start);
      ok(Array.from(dist).every((d) => d >= 0), mode + ' seed ' + seed + ' có ô không tới được');
    });
  });
});

test('tường hai phía khớp nhau và không có lối thủng ra ngoài khung', () => {
  SIZE_MODES.forEach((mode) => {
    const { w, h } = E.SIZES[mode];
    seedsOf(50).forEach((seed) => {
      const m = E.generate(w, h, seed);
      for (let i = 0; i < w * h; i++) {
        E.DIRS.forEach((d) => {
          const j = E.neighbor(m, i, d);
          if (j < 0) ok(!E.isOpen(m, i, d), 'thủng ra ngoài ở ô ' + i);
          else eq(E.isOpen(m, i, d), E.isOpen(m, j, E.OPP[d]), 'tường lệch giữa ô ' + i + ' và ' + j);
        });
      }
    });
  });
});

test('tất định theo seed: cùng seed cùng mê cung, khác seed khác mê cung', () => {
  SIZE_MODES.forEach((mode) => {
    const { w, h } = E.SIZES[mode];
    const a = E.generate(w, h, 12345);
    const b = E.generate(w, h, 12345);
    ok(same(a.cells, b.cells) && a.start === b.start && a.goal === b.goal, mode + ' cùng seed phải giống');
    const keys = new Set(seedsOf(40).map((s) => Array.from(E.generate(w, h, s).cells).join(',')));
    eq(keys.size, 40, mode + ' 40 seed phải ra 40 mê cung khác nhau');
  });
});

test('mê cung theo seed đã khóa (đổi thuật toán là vỡ ván lưu và đề hằng ngày: phải tăng VERSION)', () => {
  const m = E.generate(10, 15, 1);
  // Dấu vân tay: tổng có trọng số của bit ô + lối vào / lối ra
  let sum = 0;
  for (let i = 0; i < m.cells.length; i++) sum = (sum * 31 + m.cells[i]) >>> 0;
  eq([E.VERSION, sum, m.start, m.goal], [1, FINGERPRINT, START1, GOAL1]);
});

test('lối vào ở hàng trên, lối ra ở hàng dưới, là cặp xa nhau nhất theo đường đi', () => {
  SIZE_MODES.forEach((mode) => {
    const { w, h } = E.SIZES[mode];
    seedsOf(60).forEach((seed) => {
      const m = E.generate(w, h, seed);
      ok(m.start >= 0 && m.start < w, 'lối vào phải ở hàng trên');
      ok(m.goal >= (h - 1) * w && m.goal < w * h, 'lối ra phải ở hàng dưới');
      const d = E.bfs(m, m.start).dist[m.goal];
      for (let x = 0; x < w; x++) {
        const dist = E.bfs(m, x).dist;
        for (let gx = 0; gx < w; gx++) ok(dist[(h - 1) * w + gx] <= d, mode + ' seed ' + seed + ': có cặp xa hơn');
      }
      ok(d >= h - 1, 'đường đi ít nhất bằng chiều cao');
    });
  });
});

test('đường đúng đủ dài: ≥ 30% số ô trên đa số mê cung, và luôn ≥ 18% (đào lại khi quá ngắn)', () => {
  SIZE_MODES.forEach((mode) => {
    const { w, h } = E.SIZES[mode];
    let longEnough = 0;
    seedsOf(300).forEach((seed) => {
      const m = E.generate(w, h, seed);
      const len = E.bfs(m, m.start).dist[m.goal];
      if (len >= 0.3 * w * h) longEnough++;
      ok(len >= 0.18 * w * h, mode + ' seed ' + seed + ' đường quá ngắn: ' + len);
    });
    ok(longEnough >= 270, mode + ': chỉ ' + longEnough + '/300 mê cung có đường ≥ 30% số ô');
  });
});

test('ít ngõ cụt cụt lủn: ngõ cụt ≤ 18% số ô, ngõ cụt dài 1 ô ≤ 45% số ngõ cụt', () => {
  SIZE_MODES.forEach((mode) => {
    const { w, h } = E.SIZES[mode];
    let dead = 0;
    let short = 0;
    seedsOf(100).forEach((seed) => {
      const m = E.generate(w, h, seed);
      for (let i = 0; i < w * h; i++) {
        if (E.degree(m, i) !== 1 || i === m.start || i === m.goal) continue;
        dead++;
        const d = E.DIRS.find((x) => E.isOpen(m, i, x));
        if (E.degree(m, E.neighbor(m, i, d)) >= 3) short++;
      }
    });
    ok(dead <= 0.18 * w * h * 100, mode + ' ngõ cụt ' + dead);
    ok(short <= 0.45 * dead, mode + ' ngõ cụt 1 ô ' + short + '/' + dead);
  });
});

/* ---------------- Ván mới, đề hằng ngày ---------------- */

test('ván mới: đứng ở lối vào, vết chỉ có ô đầu, chưa đi nước nào, đúng cỡ theo mode', () => {
  MODES_ALL.forEach((mode) => {
    const g = E.newGame({ mode, seed: 7, date: '2026-10-24' });
    eq([g.w, g.h], [E.SIZES[mode].w, E.SIZES[mode].h]);
    eq([g.pos, g.trail, g.moves, g.hints, E.isWon(g)], [g.maze.start, [g.maze.start], 0, 0, false]);
    eq(E.progress(g), 0);
  });
  eq(E.newGame({ mode: 'lạ', seed: 1 }).mode, 'easy', 'mode lạ thì về dễ');
});

test('đề hằng ngày: seed theo ngày, cùng ngày cùng mê cung, khác ngày khác mê cung', () => {
  const a = E.newGame({ mode: 'daily', date: '2026-10-24', seed: 99 });
  const b = E.newGame({ mode: 'daily', date: '2026-10-24', seed: 5 });
  const c = E.newGame({ mode: 'daily', date: '2026-10-25' });
  eq(a.seed, E.dailySeed('2026-10-24'));
  eq(a.date, '2026-10-24');
  ok(same(a.maze.cells, b.maze.cells), 'cùng ngày phải giống (seed truyền vào bị bỏ qua)');
  ok(!same(a.maze.cells, c.maze.cells), 'khác ngày phải khác');
  eq(E.newGame({ mode: 'easy', seed: 3 }).date, null);
});

/* ---------------- Di chuyển ---------------- */

test('không xuyên tường: đi vào tường trả lại đúng ván cũ, đi vào lối thông thì sang ô kề', () => {
  seedsOf(30).forEach((seed) => {
    const g = E.newGame({ mode: 'medium', seed });
    // Thử mọi hướng ở 40 ô dọc đường đi
    let cur = g;
    for (let k = 0; k < 40 && !E.isWon(cur); k++) {
      E.DIRS.forEach((d) => {
        const n = E.step(cur, d);
        if (E.isOpen(cur.maze, cur.pos, d)) {
          eq(n.pos, E.neighbor(cur.maze, cur.pos, d));
          eq(n.moves, cur.moves + 1);
        } else ok(n === cur, 'đi vào tường phải không đổi');
      });
      cur = E.step(cur, E.dirTo(cur.maze, cur.pos, cur.next[cur.pos]));
    }
  });
  const g = E.newGame({ mode: 'easy', seed: 1 });
  ok(E.step(g, 3) === g && E.step(g, 'N') === g, 'hướng không hợp lệ không đi');
});

test('vết đi: tiến thì nối, lùi thì xóa; ô đã qua vẫn được đánh dấu', () => {
  const g0 = E.newGame({ mode: 'easy', seed: 11 });
  const m = g0.maze;
  const d1 = E.DIRS.find((d) => E.isOpen(m, m.start, d));
  const g1 = E.step(g0, d1);
  eq(g1.trail, [m.start, g1.pos]);
  const d2 = E.DIRS.find((d) => d !== E.OPP[d1] && E.isOpen(m, g1.pos, d));
  const g2 = d2 ? E.step(g1, d2) : g1;
  if (d2) eq(g2.trail, [m.start, g1.pos, g2.pos]);
  const back = d2 ? E.step(E.step(g2, E.OPP[d2]), E.OPP[d1]) : E.step(g1, E.OPP[d1]);
  eq(back.pos, m.start);
  eq(back.trail, [m.start]);
  ok(back.seen[g1.pos] === 1, 'ô đã qua vẫn đánh dấu sau khi lùi');
  eq(back.moves, d2 ? 4 : 2);
  // Ván cũ không bị sửa (hàm thuần)
  eq(g0.trail, [m.start]);
  eq(g0.seen[g1.pos], 0);
});

test('vết đi luôn là đường duy nhất từ lối vào tới vị trí (đi ngẫu nhiên 400 bước)', () => {
  const r = E.rng(5);
  let g = E.newGame({ mode: 'hard', seed: 77 });
  for (let k = 0; k < 400 && !E.isWon(g); k++) {
    g = E.step(g, E.DIRS[Math.floor(r() * 4)]);
    eq(g.trail, E.pathBetween(g.maze, g.maze.start, g.pos), 'bước ' + k);
  }
});

test('kéo ngón tay: đi qua ô kề hợp lệ, bỏ qua tối đa 1 ô, không vòng qua tường, không nhảy xa', () => {
  seedsOf(20).forEach((seed) => {
    const g = E.newGame({ mode: 'medium', seed });
    const m = g.maze;
    // Ô kề có tường: đường vòng ít nhất 3 ô nên không đi
    E.DIRS.forEach((d) => {
      const j = E.neighbor(m, g.pos, d);
      if (j < 0) return;
      const r = E.moveToward(g, j);
      if (E.isOpen(m, g.pos, d)) eq([r.game.pos, r.cells], [j, [j]]);
      else eq([r.game === g, r.cells], [true, []]);
    });
    // Hai ô dọc đường đúng: ngón tay lướt nhanh bỏ qua một ô thì vẫn đi đủ hai bước
    const p = E.pathBetween(m, m.start, m.goal);
    const r2 = E.moveToward(g, p[2]);
    eq([r2.game.pos, r2.cells, r2.game.moves], [p[2], [p[1], p[2]], 2]);
    // Xa 3 ô trở lên: không đi
    ok(E.moveToward(g, p[3]).game === g, 'xa 3 ô không đi');
    ok(E.moveToward(g, -1).game === g && E.moveToward(g, 1e6).game === g && E.moveToward(g, g.pos).game === g, 'ô không hợp lệ');
  });
});

/* ---------------- Trượt tới ngã rẽ ---------------- */

// Bàn 4x3 dựng tay (lối vào 0, lối ra 9):
//   0 ─ 1 ─ 2 ─ 3
//           │   │
//   4 ─ 5   6   7
//   │           │
//   8 ─ 9 ─10 ─11
const HAND = handMaze(4, 3, [[0, E.E], [1, E.E], [2, E.E], [2, E.S], [3, E.S], [7, E.S], [11, E.W], [10, E.W], [9, E.W], [8, E.N], [4, E.E]], 0, 9);

test('trượt dừng ở ngã rẽ, khúc quanh, chân tường và lối ra (bàn dựng tay)', () => {
  eq(E.slideCells(HAND, 0, E.E), [1, 2], 'dừng ở ngã ba ô 2');
  eq(E.slideCells(HAND, 2, E.E), [3], 'dừng ở khúc quanh ô 3');
  eq(E.slideCells(HAND, 3, E.S), [7, 11], 'dừng ở khúc quanh ô 11');
  eq(E.slideCells(HAND, 11, E.W), [10, 9], 'dừng ở lối ra ô 9');
  eq(E.slideCells(HAND, 9, E.W), [8], 'dừng ở khúc quanh ô 8');
  eq(E.slideCells(HAND, 4, E.E), [5], 'dừng ở ngõ cụt ô 5');
  eq(E.slideCells(HAND, 0, E.W), [], 'tường: không đi');
  eq(E.slideCells(HAND, 0, E.S), [], 'tường: không đi');
  eq(E.slideCells(HAND, 2, E.S), [6], 'ngõ cụt ô 6');
  // Thao tác tối thiểu: 0→2 (dừng ở ngã ba dù đường đi thẳng tiếp), 2→3, 3→11, 11→9 = 4 lần; 3 đoạn thẳng
  eq(E.minOps(HAND), 4);
  eq(E.segments(HAND), 3);
});

test('trượt trên mê cung ngẫu nhiên: ô giữa là hành lang thẳng, ô cuối là chỗ dừng', () => {
  seedsOf(40).forEach((seed) => {
    const g = E.newGame({ mode: 'hard', seed });
    const m = g.maze;
    for (let i = 0; i < m.w * m.h; i += 7) {
      E.DIRS.forEach((d) => {
        const cells = E.slideCells(m, i, d);
        if (!E.isOpen(m, i, d)) return eq(cells, []);
        ok(cells.length >= 1, 'đi được ít nhất một ô');
        let prev = i;
        cells.forEach((c, k) => {
          eq(c, E.neighbor(m, prev, d), 'đi thẳng theo hướng');
          const last = k === cells.length - 1;
          ok(E.isStop(m, c, d) === last, 'ô ' + c + (last ? ' phải là chỗ dừng' : ' không được dừng'));
          prev = c;
        });
      });
    }
  });
});

test('slide trên ván: đi qua các ô, cập nhật vết và số nước; đụng tường thì không đổi', () => {
  const g = E.newGame({ mode: 'easy', seed: 3 });
  const d = E.DIRS.find((x) => E.isOpen(g.maze, g.pos, x));
  const r = E.slide(g, d);
  eq(r.cells, E.slideCells(g.maze, g.pos, d));
  eq([r.game.pos, r.game.moves, r.game.trail.length], [r.cells[r.cells.length - 1], r.cells.length, r.cells.length + 1]);
  const wall = E.DIRS.find((x) => !E.isOpen(g.maze, g.pos, x));
  const w = E.slide(g, wall);
  ok(w.game === g && w.cells.length === 0, 'đụng tường');
});

test('trượt theo đường đúng tới lối ra: đúng minOps lần và thắng', () => {
  seedsOf(30).forEach((seed) => {
    let g = E.newGame({ mode: 'medium', seed });
    let ops = 0;
    while (!E.isWon(g) && ops < 1000) {
      g = E.slide(g, E.dirTo(g.maze, g.pos, g.next[g.pos])).game;
      ops++;
    }
    ok(E.isWon(g), 'tới lối ra');
    eq(ops, E.minOps(g.maze));
    ok(E.segments(g.maze) <= ops, 'số đoạn thẳng ≤ số lần trượt');
  });
});

/* ---------------- Gợi ý, thắng ---------------- */

test('gợi ý: đoạn kế tiếp nằm trên đường ngắn nhất tới lối ra, đếm số lần gợi ý', () => {
  seedsOf(30).forEach((seed) => {
    let g = E.newGame({ mode: 'hard', seed });
    // Lạc vào một nhánh sai rồi mới xin gợi ý: gợi ý phải dẫn quay ra
    const wrong = E.DIRS.find((d) => E.isOpen(g.maze, g.pos, d) && E.neighbor(g.maze, g.pos, d) !== g.next[g.pos]);
    if (wrong) g = E.step(g, wrong);
    const h = E.hint(g);
    eq(h.game.hints, 1);
    ok(h.cells.length === Math.min(E.HINT_LEN, g.left[g.pos]), 'đủ ' + E.HINT_LEN + ' ô (hoặc tới lối ra)');
    let prev = g.pos;
    h.cells.forEach((c) => {
      ok(E.dirTo(g.maze, prev, c) && E.isOpen(g.maze, prev, E.dirTo(g.maze, prev, c)), 'ô gợi ý phải kề và thông');
      eq(g.left[c], g.left[prev] - 1, 'mỗi ô gợi ý gần lối ra thêm một bước');
      prev = c;
    });
    eq(h.game.pos, g.pos, 'gợi ý không tự đi');
  });
});

test('đi theo gợi ý tới hết thì thắng; đã thắng thì không đi, không gợi ý nữa', () => {
  let g = E.newGame({ mode: 'easy', seed: 42 });
  let guard = 0;
  while (!E.isWon(g) && guard++ < 500) {
    const h = E.hint(g);
    g = h.game;
    h.cells.forEach((c) => { g = E.moveToward(g, c).game; });
  }
  ok(E.isWon(g), 'tới lối ra');
  eq(g.pos, g.maze.goal);
  eq(E.progress(g), 1);
  ok(g.hints > 0, 'đã dùng gợi ý');
  eq(g.trail, E.pathBetween(g.maze, g.maze.start, g.maze.goal), 'vết đi là đường đúng');
  E.DIRS.forEach((d) => ok(E.step(g, d) === g && E.slide(g, d).game === g, 'đã thắng không đi tiếp'));
  eq(E.hint(g), null);
});

test('thắng khi tới đích: bước cuối vào lối ra; tiến độ tăng dần', () => {
  const g0 = E.newGame({ mode: 'medium', seed: 8 });
  const p = E.pathBetween(g0.maze, g0.maze.start, g0.maze.goal);
  let g = g0;
  let last = 0;
  for (let k = 1; k < p.length; k++) {
    ok(!E.isWon(g), 'chưa thắng trước bước cuối');
    g = E.step(g, E.dirTo(g.maze, g.pos, p[k]));
    ok(E.progress(g) > last, 'tiến độ tăng');
    last = E.progress(g);
  }
  ok(E.isWon(g), 'thắng');
  eq(g.moves, p.length - 1);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (vị trí, vết, ô đã qua, số nước, gợi ý) ở mọi mode', () => {
  MODES_ALL.forEach((mode) => {
    const r = E.rng(9);
    let g = E.newGame({ mode, seed: 2024, date: '2026-10-24' });
    for (let k = 0; k < 150; k++) g = E.step(g, E.DIRS[Math.floor(r() * 4)]);
    g = E.hint(g).game;
    const back = roundTrip(g);
    ok(back, mode + ' khôi phục được');
    eq([back.mode, back.seed, back.date, back.pos, back.trail, back.moves, back.hints], [g.mode, g.seed, g.date, g.pos, g.trail, g.moves, g.hints]);
    ok(same(back.seen, g.seen) && same(back.maze.cells, g.maze.cells), mode + ' ô đã qua và mê cung giống');
    // Chơi tiếp được sau khi khôi phục
    const d = E.dirTo(back.maze, back.pos, back.next[back.pos]);
    eq(E.step(back, d).pos, back.next[back.pos]);
  });
});

test('từ chối dữ liệu hỏng', () => {
  const g0 = E.newGame({ mode: 'easy', seed: 5 });
  const g = E.step(g0, E.DIRS.find((d) => E.isOpen(g0.maze, g0.pos, d)));
  const good = E.toJSON(g);
  ok(E.fromJSON(good), 'ván tốt phải nhận');
  const daily = E.toJSON(E.newGame({ mode: 'daily', date: '2026-10-24' }));
  ok(E.fromJSON(daily), 'đề ngày tốt phải nhận');
  const far = E.pathBetween(g.maze, g.maze.start, g.maze.goal)[5];
  const bad = [
    null, 1, 'x', [], {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { mode: 'huge' }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { seed: 1.5 }),
    Object.assign({}, good, { seed: '5' }),
    Object.assign({}, good, { date: '2026-10-24' }),
    Object.assign({}, daily, { seed: daily.seed + 1 }),
    Object.assign({}, daily, { date: '24/10/2026' }),
    Object.assign({}, daily, { date: null }),
    Object.assign({}, good, { pos: -1 }),
    Object.assign({}, good, { pos: 150 }),
    Object.assign({}, good, { pos: '3' }),
    Object.assign({}, good, { moves: -1 }),
    Object.assign({}, good, { moves: 0 }), // đã rời lối vào mà số nước = 0
    Object.assign({}, good, { hints: 1.5 }),
    Object.assign({}, good, { seen: good.seen.slice(1) }),
    Object.assign({}, good, { seen: good.seen.replace(/^./, 'g') }),
    Object.assign({}, good, { seen: 123 }),
    Object.assign({}, good, { seen: '0'.repeat(good.seen.length) }), // ô trên vết chưa đánh dấu đã qua
    Object.assign({}, good, { seen: good.seen.slice(0, -1) + 'f' }), // bit thừa sau ô cuối (150 ô = 37,5 ký tự)
    Object.assign({}, good, { pos: far, moves: 2 }), // ô xa hơn số nước đã đi
  ];
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + k + ' ' + JSON.stringify(raw)));
});

/* ---------------- Tốc độ, ngưỡng điểm ---------------- */

test('tốc độ sinh mê cung cỡ lớn nhất (17x28): trung bình < 20 ms, chậm nhất < 100 ms', () => {
  const seeds = seedsOf(300);
  let max = 0;
  const t0 = process.hrtime.bigint();
  seeds.forEach((s) => {
    const a = process.hrtime.bigint();
    E.newGame({ mode: 'hard', seed: s });
    max = Math.max(max, Number(process.hrtime.bigint() - a) / 1e6);
  });
  const avg = Number(process.hrtime.bigint() - t0) / 1e6 / seeds.length;
  console.log('       (ván 17x28: trung bình ' + avg.toFixed(2) + ' ms, chậm nhất ' + max.toFixed(2) + ' ms)');
  ok(avg < 20 && max < 100, 'quá chậm');
});

test('min_time_ms trong game.json ≤ số đoạn thẳng ít nhất × 120 ms (đo trên 2000 seed / 2 năm đề ngày)', () => {
  const modes = {};
  manifest.server.modes.forEach((m) => { modes[m.key] = m; });
  eq(Object.keys(modes).sort(), ['daily', 'easy', 'hard', 'medium']);
  MODES_ALL.forEach((mode) => {
    let minSeg = Infinity;
    if (mode === 'daily') {
      const d = new Date(2026, 9, 1);
      for (let k = 0; k < 730; k++) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        minSeg = Math.min(minSeg, E.segments(E.newGame({ mode, date: key }).maze));
        d.setDate(d.getDate() + 1);
      }
    } else {
      seedsOf(2000).forEach((s) => { minSeg = Math.min(minSeg, E.segments(E.generate(E.SIZES[mode].w, E.SIZES[mode].h, s))); });
    }
    const rule = modes[mode].rules.min_time_ms;
    console.log('       (' + mode + ': ít nhất ' + minSeg + ' đoạn thẳng → ' + minSeg * 120 + ' ms; min_time_ms ' + rule + ')');
    ok(rule <= minSeg * 120, mode + ' min_time_ms quá cao');
  });
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
