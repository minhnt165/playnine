/* Kiểm tra engine Ô Vuông (Dots and Boxes): chạy `node test.js` (thêm `--quick` để bỏ phần mô phỏng dài)
 * - Hình học lưới: đánh số cạnh / ô, cạnh nào thuộc ô nào
 * - Luật: kẻ cạnh trống, khép ô thì ghi điểm và đi tiếp, khép hai ô một lúc, hết cạnh thì kết thúc
 *   (thắng / thua / hòa), nước không hợp lệ bị từ chối
 * - Máy: luôn trả nước hợp lệ; Dễ ăn ô khi có thể; Vừa không cho ô cạnh thứ 3 khi còn nước an toàn;
 *   Khó giữ quyền kiểm soát (double-cross); bộ giải khớp tìm kiếm vét cạn trên nhiều thế ngẫu nhiên
 * - Mức mạnh dần: mô phỏng nhiều ván Khó vs Dễ, Khó vs Vừa, Vừa vs Dễ ở cả ba cỡ bàn
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
 * Bàn luôn trống lúc đầu nên không có phần "màn giải được".
 */
const E = require('./engine.js');

let passed = 0;
let failed = 0;
const QUICK = process.argv.includes('--quick');

function test(name, fn) {
  try {
    const t0 = Date.now();
    fn();
    passed++;
    const ms = Date.now() - t0;
    console.log('  ok   ' + name + (ms > 500 ? '  (' + (ms / 1000).toFixed(1) + ' s)' : ''));
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e));
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

/* Đánh số cạnh (xem engine.js): ngang h(r, c) = r*n + c; dọc v(r, c) = (n+1)*n + r*(n+1) + c */
const h = (n, r, c) => r * n + c;
const v = (n, r, c) => (n + 1) * n + r * (n + 1) + c;

/** Chơi lần lượt các cạnh, báo lỗi nếu engine từ chối */
function playAll(s, edges) {
  for (const e of edges) {
    const nx = E.play(s, e);
    if (!nx) throw new Error('nước không hợp lệ: ' + e);
    s = nx;
  }
  return s;
}

/** Dựng thế từ danh sách cạnh đã kẻ; ô đã khép chia theo owner(b) (mặc định người 1); lượt `turn` */
function pos(n, drawn, turn, owner) {
  const g = E.geometry(n);
  const lines = new Array(g.E).fill(0);
  drawn.forEach((e) => { lines[e] = 1; });
  const boxes = new Array(g.B).fill(0);
  for (let b = 0; b < g.B; b++) if (g.boxEdges[b].every((e) => lines[e])) boxes[b] = owner ? owner(b) : 1;
  const s = E.fromJSON({ v: 1, n, lines: lines.join(''), boxes: boxes.join(''), turn: turn || 1, last: -1 });
  if (!s) throw new Error('pos(): thế không hợp lệ');
  return s;
}
/** Như pos nhưng liệt kê các cạnh CÒN TRỐNG */
function posExcept(n, undrawn, turn, owner) {
  const g = E.geometry(n);
  const drawn = [];
  for (let e = 0; e < g.E; e++) if (undrawn.indexOf(e) < 0) drawn.push(e);
  return pos(n, drawn, turn, owner);
}

/** Tìm kiếm vét cạn không rút gọn (để đối chiếu): số ô hơn của bên đang đi trong phần còn lại */
function brute(lines, g, memo) {
  const key = lines.join('');
  if (memo.has(key)) return memo.get(key);
  let best = -Infinity;
  for (let e = 0; e < g.E; e++) {
    if (lines[e]) continue;
    lines[e] = 1;
    let c = 0;
    g.edgeBoxes[e].forEach((b) => { if (b >= 0 && g.boxEdges[b].every((x) => lines[x])) c++; });
    const val = c > 0 ? c + brute(lines, g, memo) : -brute(lines, g, memo);
    lines[e] = 0;
    if (val > best) best = val;
  }
  const res = best === -Infinity ? 0 : best;
  memo.set(key, res);
  return res;
}

/* ---------------- Hình học ---------------- */

test('số cạnh / ô theo cỡ bàn: 2n(n+1) cạnh, n² ô; cỡ 3, 4, 5', () => {
  eq(E.SIZES, [3, 4, 5]);
  E.SIZES.forEach((n) => {
    const g = E.geometry(n);
    eq([g.E, g.B], [2 * n * (n + 1), n * n], 'n=' + n);
  });
});

test('mỗi ô có đúng 4 cạnh; mỗi cạnh thuộc 1 ô (viền) hoặc 2 ô (trong)', () => {
  E.SIZES.forEach((n) => {
    const g = E.geometry(n);
    const count = new Array(g.E).fill(0);
    g.boxEdges.forEach((es, b) => {
      eq(es.length, 4);
      es.forEach((e) => {
        count[e]++;
        ok(g.edgeBoxes[e].indexOf(b) >= 0, 'cạnh ' + e + ' phải trỏ về ô ' + b);
      });
    });
    let border = 0;
    count.forEach((k, e) => {
      ok(k === 1 || k === 2, 'cạnh ' + e);
      eq(g.edgeBoxes[e].filter((b) => b >= 0).length, k, 'cạnh ' + e);
      if (k === 1) border++;
    });
    eq(border, 4 * n, 'số cạnh viền n=' + n);
  });
});

test('ô (r, c) gồm trên h(r,c), dưới h(r+1,c), trái v(r,c), phải v(r,c+1); tọa độ cạnh đúng', () => {
  const n = 4;
  const g = E.geometry(n);
  const sort = (a) => a.slice().sort((x, y) => x - y);
  eq(sort(g.boxEdges[1 * n + 2]), sort([h(n, 1, 2), h(n, 2, 2), v(n, 1, 2), v(n, 1, 3)]));
  eq(g.edgeXY[h(n, 2, 1)], [1, 2, 2, 2]);
  eq(g.edgeXY[v(n, 0, 4)], [4, 0, 4, 1]);
});

/* ---------------- Luật ---------------- */

test('ván mới: bàn trống, người 1 đi trước (hoặc người 2 khi chọn), 0–0', () => {
  const s = E.newGame(3);
  eq([s.n, s.turn, s.score, s.over, s.plies, s.last], [3, 1, [0, 0], null, 0, -1]);
  eq(s.lines.every((x) => x === 0), true);
  eq(E.newGame(4, 2).turn, 2);
  eq(E.legalMoves(s).length, 24);
});

test('kẻ cạnh không khép ô thì đổi lượt; cạnh đã kẻ / ngoài bàn bị từ chối', () => {
  const s = E.newGame(3);
  const a = E.play(s, h(3, 0, 0));
  eq([a.turn, a.lines[h(3, 0, 0)], a.last, a.plies], [2, 1, h(3, 0, 0), 1]);
  eq(E.play(a, h(3, 0, 0)), null);
  eq(E.play(a, -1), null);
  eq(E.play(a, 24), null);
  eq(E.play(a, 1.5), null);
  eq(E.play(a, '3'), null);
  eq(s.lines[h(3, 0, 0)], 0, 'không đụng trạng thái cũ');
});

test('khép ô thì ghi điểm cho bên vừa kẻ và đi tiếp', () => {
  const n = 3;
  let s = playAll(E.newGame(n), [h(n, 0, 0), h(n, 1, 0), v(n, 0, 0)]); // 1, 2, 1 → lượt 2
  eq(s.turn, 2);
  s = E.play(s, v(n, 0, 1)); // người 2 khép ô 0
  eq([s.boxes[0], s.score, s.turn, E.lastBoxes(s), s.lines[v(n, 0, 1)]], [2, [0, 1], 2, [0], 2]);
  s = E.play(s, h(n, 3, 2)); // không khép: sang lượt 1
  eq([s.turn, E.lastBoxes(s)], [1, []]);
});

test('một cạnh khép hai ô cùng lúc: được 2 điểm, vẫn đi tiếp', () => {
  const n = 3;
  const s = pos(n, [h(n, 0, 0), h(n, 1, 0), v(n, 0, 0), h(n, 0, 1), h(n, 1, 1), v(n, 0, 2)], 1);
  eq(E.completes(s, v(n, 0, 1)), 2);
  const a = E.play(s, v(n, 0, 1));
  eq([a.boxes[0], a.boxes[1], a.score, a.turn], [1, 1, [2, 0], 1]);
  eq(E.lastBoxes(a), [0, 1]);
});

test('hết cạnh thì kết thúc: nhiều ô hơn thắng, bằng nhau là hòa', () => {
  const rng = E.mulberry32(7);
  let s = E.newGame(3);
  while (!s.over) {
    const ms = E.legalMoves(s);
    s = E.play(s, ms[Math.floor(rng() * ms.length)]);
  }
  eq(s.score[0] + s.score[1], 9);
  eq(s.over.winner, s.score[0] > s.score[1] ? 1 : 2);
  eq(E.legalMoves(s), []);
  eq(E.play(s, 0), null, 'ván xong không đi tiếp');
  // 4×4 hòa 8–8: còn một cạnh, người 2 khép ô cuối thành 8–8
  const n = 4;
  const d = posExcept(n, [h(n, 4, 3)], 2, (b) => (b < 8 ? 1 : 2));
  eq(d.score, [8, 7]);
  const end = E.play(d, h(n, 4, 3));
  eq([end.score, end.over], [[8, 8], { winner: 0 }]);
  // Người 1 khép ô cuối thì thắng 9–7
  const w = E.play(posExcept(n, [h(n, 4, 3)], 1, (b) => (b < 8 ? 1 : 2)), h(n, 4, 3));
  eq([w.score, w.over], [[9, 7], { winner: 1 }]);
});

test('ván ngẫu nhiên luôn kết thúc đúng 2n(n+1) nước, tổng điểm n²', () => {
  const rng = E.mulberry32(99);
  E.SIZES.forEach((n) => {
    for (let k = 0; k < 20; k++) {
      let s = E.newGame(n, 1 + (k % 2));
      while (!s.over) {
        const ms = E.legalMoves(s);
        s = E.play(s, ms[Math.floor(rng() * ms.length)]);
      }
      eq([s.plies, s.score[0] + s.score[1]], [2 * n * (n + 1), n * n]);
    }
  });
});

test('cạnh an toàn: không tạo ô 3 cạnh', () => {
  const n = 3;
  const s = pos(n, [h(n, 0, 0), h(n, 1, 0)], 1); // ô 0 có 2 cạnh
  const safe = E.safeMoves(s);
  ok(safe.indexOf(v(n, 0, 0)) < 0 && safe.indexOf(v(n, 0, 1)) < 0, 'cạnh của ô 0 không an toàn');
  ok(safe.indexOf(h(n, 3, 2)) >= 0);
  eq(safe.length, 24 - 2 - 2);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (cả điểm, lượt, ai kẻ cạnh nào, cạnh vừa kẻ)', () => {
  const rng = E.mulberry32(3);
  E.SIZES.forEach((n) => {
    let s = E.newGame(n, 2);
    for (let i = 0; i < 2 * n * n; i++) {
      const ms = E.legalMoves(s);
      s = E.play(s, ms[Math.floor(rng() * ms.length)]);
    }
    eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s)))), s, 'n=' + n);
  });
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(playAll(E.newGame(3), [0, 1]));
  ok(E.fromJSON(good), 'dữ liệu tốt phải nhận');
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { n: 6 }),
    Object.assign({}, good, { n: 2 }),
    Object.assign({}, good, { n: '3' }),
    Object.assign({}, good, { lines: good.lines.slice(1) }),
    Object.assign({}, good, { lines: '3' + good.lines.slice(1) }),
    Object.assign({}, good, { lines: 5 }),
    Object.assign({}, good, { boxes: '100000000' }), // ô có chủ khi chưa đủ 4 cạnh
    Object.assign({}, good, { boxes: '0000000' }),
    Object.assign({}, good, { boxes: 'a00000000' }),
    Object.assign({}, good, { turn: 3 }),
    Object.assign({}, good, { turn: '1' }),
    Object.assign({}, good, { last: 7 }), // cạnh vừa kẻ phải là cạnh đã kẻ
    Object.assign({}, good, { last: 99 }),
    Object.assign({}, good, { last: 0.5 }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + i));
  // Ô đủ 4 cạnh mà chưa có chủ cũng là hỏng
  const n = 3;
  const lines = new Array(24).fill(0);
  [h(n, 0, 0), h(n, 1, 0), v(n, 0, 0), v(n, 0, 1)].forEach((e) => { lines[e] = 1; });
  eq(E.fromJSON({ v: 1, n, lines: lines.join(''), boxes: '000000000', turn: 1, last: -1 }), null);
});

/* ---------------- Máy ---------------- */

test('máy luôn trả nước hợp lệ ở mọi mức, mọi cỡ', () => {
  const rng = E.mulberry32(11);
  E.SIZES.forEach((n) => {
    E.LEVELS.forEach((level) => {
      let s = E.newGame(n);
      let k = 0;
      while (!s.over) {
        const ms = E.legalMoves(s);
        const m = k % 2 ? E.chooseMove(s, { level, rng }) : ms[Math.floor(rng() * ms.length)];
        ok(E.isLegal(s, m), level + ' n=' + n + ': nước ' + m);
        s = E.play(s, m);
        k++;
      }
    });
  });
});

test('Dễ: có ô ăn được thì ăn', () => {
  const n = 3;
  const s = pos(n, [h(n, 0, 0), h(n, 1, 0), v(n, 0, 0)], 1);
  for (let i = 0; i < 10; i++) eq(E.chooseMove(s, { level: 'easy', rng: E.mulberry32(i) }), v(n, 0, 1));
});

test('Vừa: còn cạnh an toàn thì không tạo ô 3 cạnh; có ô ăn được thì ăn', () => {
  const rng = E.mulberry32(5);
  for (let k = 0; k < 30; k++) {
    let s = E.newGame(4);
    while (!s.over) {
      const safe = E.safeMoves(s);
      const capture = E.legalMoves(s).filter((e) => E.completes(s, e) > 0);
      const m = E.chooseMove(s, { level: 'medium', rng });
      if (capture.length) ok(capture.indexOf(m) >= 0, 'phải ăn ô, đi ' + m);
      else if (safe.length) ok(safe.indexOf(m) >= 0, 'nước ' + m + ' không an toàn');
      s = E.play(s, m);
    }
  }
});

// 3×3: ô 0 (góc) là chuỗi 1 ô; 8 ô còn lại là một chuỗi rắn 1-2-5-4-3-6-7-8 hai đầu ra viền
const n3 = 3;
const SNAKE = [
  h(n3, 0, 0), v(n3, 0, 0), // hai cạnh viền của ô góc
  v(n3, 0, 2), h(n3, 1, 2), v(n3, 1, 2), v(n3, 1, 1), h(n3, 2, 0), v(n3, 2, 1), v(n3, 2, 2), // trong chuỗi
  h(n3, 0, 1), v(n3, 2, 3), // hai đầu chuỗi
];

test('Vừa và Khó: hết cạnh an toàn thì nhường chuỗi ngắn nhất', () => {
  const s = posExcept(n3, SNAKE, 1);
  eq(E.safeMoves(s), [], 'thế phải hết cạnh an toàn');
  ['medium', 'hard'].forEach((level) => {
    for (let i = 0; i < 6; i++) {
      const m = E.chooseMove(s, { level, rng: E.mulberry32(i) });
      ok(m === h(n3, 0, 0) || m === v(n3, 0, 0), level + ': phải mở ô góc, được ' + m);
    }
  });
  eq(E.solve(s).value, 8 - 1, 'mở ô góc: mất 1 ô, đối thủ phải mở chuỗi 8');
});

test('Khó: bị mở chuỗi dài mà còn chuỗi dài khác thì ăn hết trừ 2 ô (double-cross)', () => {
  // Hàng 0 là chuỗi 3 ô đã bị mở ở đầu trái (ô 0 có 3 cạnh); hàng 1 + 2 là chuỗi 6 ô 3-4-5-8-7-6
  const n = 3;
  let s = posExcept(n, [
    v(n, 0, 1), v(n, 0, 2), v(n, 0, 3),
    v(n, 1, 0), v(n, 1, 1), v(n, 1, 2), h(n, 2, 2), v(n, 2, 2), v(n, 2, 1), v(n, 2, 0),
  ], 1);
  const seq = [];
  for (let i = 0; i < 4 && s.turn === 1 && !s.over; i++) {
    const m = E.chooseMove(s, { level: 'hard', rng: E.mulberry32(1) });
    seq.push(m);
    s = E.play(s, m);
  }
  eq(seq, [v(n, 0, 1), v(n, 0, 3)], 'ăn ô 0 rồi kẻ cạnh nhường 2 ô cuối');
  eq([s.score, s.turn], [[1, 0], 2]);
  // Vừa thì ăn hết cả 3 ô (rồi phải mở chuỗi 6)
  let m = posExcept(n, [
    v(n, 0, 1), v(n, 0, 2), v(n, 0, 3),
    v(n, 1, 0), v(n, 1, 1), v(n, 1, 2), h(n, 2, 2), v(n, 2, 2), v(n, 2, 1), v(n, 2, 0),
  ], 1);
  while (m.turn === 1) m = E.play(m, E.chooseMove(m, { level: 'medium', rng: E.mulberry32(1) }));
  eq(m.score, [3, 0]);
});

test('Khó: chuỗi cuối cùng thì ăn hết', () => {
  const n = 3;
  let s = posExcept(n, [v(n, 0, 1), v(n, 0, 2), v(n, 0, 3)], 1, (b) => (b % 2 ? 1 : 2));
  let k = 0;
  while (!s.over && k++ < 5) s = E.play(s, E.chooseMove(s, { level: 'hard', rng: E.mulberry32(2) }));
  ok(s.over, 'phải ăn hết');
  eq(s.turn, 1);
});

test('bộ giải khớp tìm kiếm vét cạn trên thế ngẫu nhiên (bàn 2×2 và 3×3)', () => {
  const rng = E.mulberry32(2024);
  let checked = 0;
  const runs = [[2, 150, 4, 12], [3, 80, 8, 13]];
  runs.forEach(([n, count, minLeft, maxLeft]) => {
    const g = E.geometry(n);
    for (let k = 0; k < count; k++) {
      const left = minLeft + Math.floor(rng() * (maxLeft - minLeft + 1));
      let s = E.newGame(n);
      while (!s.over && E.legalMoves(s).length > left) {
        const ms = E.legalMoves(s);
        s = E.play(s, ms[Math.floor(rng() * ms.length)]);
      }
      if (s.over) continue;
      const lines = s.lines.map((x) => (x ? 1 : 0));
      const want = brute(lines, g, new Map());
      const got = E.solve(s, { budget: 1e7, rng: E.mulberry32(k) });
      ok(got, 'bộ giải bỏ cuộc');
      eq(got.value, want, 'giá trị thế #' + k + ' n=' + n + ' ' + s.lines.join(''));
      // Nước bộ giải chọn phải đạt đúng giá trị đó
      const c = E.completes(s, got.move);
      const after = E.play(s, got.move).lines.map((x) => (x ? 1 : 0));
      const mv = c > 0 ? c + brute(after, g, new Map()) : -brute(after, g, new Map());
      eq(mv, want, 'nước ' + got.move + ' của thế #' + k + ' n=' + n + ' ' + s.lines.join(''));
      checked++;
    }
  });
  ok(checked > 150, 'quá ít thế được kiểm: ' + checked);
});

test('bộ giải khớp vét cạn ở thế tàn cuộc chỉ toàn chuỗi / vòng (dùng công thức đếm chuỗi)', () => {
  // Thế SNAKE (chuỗi 1 + chuỗi 8) và vài thế cắt từ ván Vừa vs Vừa khi vừa hết cạnh an toàn
  const g = E.geometry(3);
  const check = (s, label) => {
    const want = brute(s.lines.map((x) => (x ? 1 : 0)), g, new Map());
    eq(E.solve(s, { budget: 1e7 }).value, want, label);
  };
  check(posExcept(n3, SNAKE, 1), 'snake');
  const rng = E.mulberry32(8);
  let done = 0;
  for (let k = 0; k < 200 && done < 25; k++) {
    let s = E.newGame(3);
    while (!s.over && E.safeMoves(s).length) s = E.play(s, E.chooseMove(s, { level: 'medium', rng }));
    if (s.over || E.legalMoves(s).length > 15) continue;
    check(s, 'tàn cuộc #' + k + ' ' + s.lines.join(''));
    done++;
  }
  ok(done >= 10, 'quá ít thế: ' + done);
});

test('máy tất định theo seed', () => {
  const s = playAll(E.newGame(4), [0, 7, 12, 30]);
  E.LEVELS.forEach((level) => {
    const a = E.chooseMove(s, { level, rng: E.mulberry32(42) });
    const b = E.chooseMove(s, { level, rng: E.mulberry32(42) });
    eq(a, b, level);
  });
});

test('Khó nghĩ đủ nhanh: mỗi nước ≤ 400 ms trong Node ở mọi cỡ', () => {
  const rng = E.mulberry32(77);
  let worst = 0;
  E.SIZES.forEach((n) => {
    for (let k = 0; k < (QUICK ? 1 : 4); k++) {
      let s = E.newGame(n, 1 + (k % 2));
      while (!s.over) {
        let m;
        if (s.turn === 2) {
          const t0 = Date.now();
          m = E.chooseMove(s, { level: 'hard', rng });
          worst = Math.max(worst, Date.now() - t0);
        } else m = E.chooseMove(s, { level: k % 2 ? 'medium' : 'hard', rng });
        s = E.play(s, m);
      }
    }
  });
  console.log('       nước lâu nhất của Khó: ' + worst + ' ms');
  ok(worst <= 400, 'quá chậm: ' + worst + ' ms');
});

/* ---------------- Mức mạnh dần ---------------- */

/** Đấu `games` ván; a cầm người 1 (đi trước) ở ván chẵn, người 2 ở ván lẻ. Trả thắng / hòa / thua của a */
function match(a, b, n, games, seed) {
  const rng = E.mulberry32(seed);
  const r = { win: 0, draw: 0, loss: 0 };
  for (let k = 0; k < games; k++) {
    const aSide = 1 + (k % 2);
    let s = E.newGame(n, 1);
    while (!s.over) s = E.play(s, E.chooseMove(s, { level: s.turn === aSide ? a : b, rng }));
    const w = s.over.winner;
    if (w === 0) r.draw++;
    else if (w === aSide) r.win++;
    else r.loss++;
  }
  return r;
}
const pct = (r, games) => Math.round((100 * r.win) / games) + '% thắng' + (r.draw ? ', ' + r.draw + ' hòa' : '');

if (!QUICK) {
  [[3, 100], [4, 100], [5, 60]].forEach(([n, games]) => {
    test('mức mạnh dần trên bàn ' + n + '×' + n + ' (' + games + ' ván mỗi cặp, đổi bên đi trước)', () => {
      const he = match('hard', 'easy', n, games, 100 + n);
      const hm = match('hard', 'medium', n, games, 200 + n);
      const me = match('medium', 'easy', n, games, 300 + n);
      console.log('       Khó vs Dễ: ' + pct(he, games) + ' · Khó vs Vừa: ' + pct(hm, games) + ' · Vừa vs Dễ: ' + pct(me, games));
      ok(he.win >= games * 0.9, 'Khó vs Dễ');
      ok(me.win >= games * 0.75, 'Vừa vs Dễ');
      ok(hm.win >= games * 0.6, 'Khó vs Vừa');
    });
  });
}

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
