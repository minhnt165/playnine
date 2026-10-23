/* Kiểm tra engine Bắn Bóng: chạy `node test.js`
 * - Lưới lệch hàng: ô kề của hàng dài / hàng ngắn, đảo parity khi đẩy hàng
 * - Đường bay: thẳng lên trần, nảy tường, dính vào ô trống kề bóng bị chạm
 * - Nổ cụm từ 3 bóng (không nổ cụm 2), bóng lơ lửng rơi sau khi nổ
 * - Đẩy hàng sau N phát trượt, thua khi bóng chạm vạch nguy hiểm, dọn sạch bàn
 * - Chỉ chia màu còn trên bàn, tính điểm (nổ, chuỗi, rơi, thưởng dọn bàn)
 * - Lưu / khôi phục ván qua JSON và từ chối dữ liệu hỏng
 */
const B = require('./engine.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert thất bại');
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'khác nhau') + `: nhận ${JSON.stringify(a)}, mong đợi ${JSON.stringify(b)}`);
}

const sameSet = (a, b, msg) => {
  const s = (l) => l.map((p) => p.join(',')).sort().join(' | ');
  eq(s(a), s(b), msg);
};

/** Ván tự dựng: map là mảng chuỗi, mỗi ký tự một ô ('.' trống, '1'..'6' màu); hàng ngắn bỏ ô cuối. */
function gameOf(map, extra) {
  const g = B.newGame(7);
  g.parity = (extra && extra.parity) || 0;
  g.rows = map.map((s) => {
    const row = new Array(B.COLS).fill(0);
    for (let c = 0; c < s.length; c++) row[c] = s[c] === '.' ? 0 : Number(s[c]);
    return row;
  });
  g.current = 1;
  g.next = 1;
  g.score = 0;
  g.misses = 0;
  g.combo = 0;
  g.shots = 0;
  g.popped = 0;
  g.dropped = 0;
  g.bestCombo = 0;
  return Object.assign(g, extra || {});
}

/** Góc bắn để đường thẳng (không nảy) đi từ súng tới điểm (x, y). */
const angleTo = (x, y) => Math.atan2(x - B.SX, B.SY - y);

console.log('Bắn Bóng - kiểm tra engine');

/* ---------------- Lưới ---------------- */

test('kích thước: 11 ô hàng dài, 10 ô hàng ngắn; tâm ô lệch nửa ô ở hàng ngắn', () => {
  const g = gameOf([]);
  eq(B.rowLen(g, 0), 11);
  eq(B.rowLen(g, 1), 10);
  eq(B.cellXY(g, 0, 0).x, B.R);
  eq(B.cellXY(g, 1, 0).x, B.D);
  eq(B.cellXY(g, 0, 5).x, B.SX, 'cột giữa hàng dài thẳng súng');
  assert(Math.abs(B.cellXY(g, 2, 0).y - (B.R + 2 * B.RH)) < 1e-9);
});

test('ô kề của hàng dài (hàng chẵn): cột c-1 và c ở hàng trên / dưới', () => {
  const g = gameOf([]);
  sameSet(B.neighbors(g, 2, 4), [[2, 3], [2, 5], [1, 3], [1, 4], [3, 3], [3, 4]]);
  // Ô đầu hàng dài chỉ còn 3 ô kề (hàng 0 không có hàng trên)
  sameSet(B.neighbors(g, 0, 0), [[0, 1], [1, 0]]);
  // Ô cuối hàng dài: cột 10 không có ở hàng ngắn
  sameSet(B.neighbors(g, 2, 10), [[2, 9], [1, 9], [3, 9]]);
});

test('ô kề của hàng ngắn (hàng lẻ): cột c và c+1 ở hàng trên / dưới', () => {
  const g = gameOf([]);
  sameSet(B.neighbors(g, 1, 4), [[1, 3], [1, 5], [0, 4], [0, 5], [2, 4], [2, 5]]);
  sameSet(B.neighbors(g, 1, 9), [[1, 8], [0, 9], [0, 10], [2, 9], [2, 10]]);
});

test('parity = 1: hàng 0 là hàng ngắn và ô kề đổi theo', () => {
  const g = gameOf([], { parity: 1 });
  eq(B.rowLen(g, 0), 10);
  eq(B.rowLen(g, 1), 11);
  sameSet(B.neighbors(g, 1, 4), [[1, 3], [1, 5], [0, 3], [0, 4], [2, 3], [2, 4]]);
});

test('ô kề luôn đối xứng (A kề B thì B kề A), ở cả hai parity', () => {
  [0, 1].forEach((parity) => {
    const g = gameOf([], { parity });
    for (let r = 0; r < B.MAX_ROWS; r++) {
      for (let c = 0; c < B.rowLen(g, r); c++) {
        B.neighbors(g, r, c).forEach(([nr, nc]) => {
          assert(B.neighbors(g, nr, nc).some(([a, b]) => a === r && b === c), `${r},${c} - ${nr},${nc}`);
          const p = B.cellXY(g, r, c);
          const q = B.cellXY(g, nr, nc);
          assert(Math.abs(Math.hypot(p.x - q.x, p.y - q.y) - B.D) < 1e-6, 'ô kề cách đúng một đường kính');
        });
      }
    }
  });
});

/* ---------------- Đường bay và chỗ dính ---------------- */

test('bàn trống ở giữa: bắn thẳng lên dính ở hàng 0, cột giữa', () => {
  const g = gameOf(['1..........']);
  const tr = B.trace(g, 0);
  eq(tr.bounces, 0);
  eq(tr.cell.r, 0);
  eq(tr.cell.c, 5);
});

test('chạm một bóng thì dính vào ô trống kề nó gần điểm chạm nhất', () => {
  // Bóng ở (0, 5); bắn lệch sang trái một chút: dính vào (1, 4) bên dưới - trái
  const g = gameOf(['.....1.....']);
  const tr = B.trace(g, -0.04);
  eq(tr.bounces, 0);
  eq(tr.cell.r, 1);
  eq(tr.cell.c, 4);
  const tr2 = B.trace(g, 0.04);
  eq(tr2.cell.r, 1);
  eq(tr2.cell.c, 5);
});

test('snapCell: điểm chạm sát cạnh trái của bóng thì dính cùng hàng bên trái', () => {
  const g = gameOf(['...........', '...........', '....2......']);
  const p = B.cellXY(g, 2, 4);
  const cell = B.snapCell(g, p.x - 28, p.y + 2, [2, 4]);
  eq(cell.r, 2);
  eq(cell.c, 3);
  const below = B.snapCell(g, p.x + 10, p.y + 26, [2, 4]);
  eq(below.r, 3);
  eq(below.c, 4);
});

test('nảy tường: góc nghiêng mạnh nảy ở tường rồi vẫn dính lên trần', () => {
  const g = gameOf(['1..........']);
  const tr = B.trace(g, 1.2);
  assert(tr.bounces >= 1, 'phải nảy ít nhất một lần');
  eq(tr.points[1][0], B.W - B.R, 'điểm nảy nằm trên tường phải');
  eq(tr.cell.r, 0);
  // Mọi điểm trên đường bay đều nằm trong sân
  tr.points.forEach(([x, y]) => assert(x >= B.R - 1e-9 && x <= B.W - B.R + 1e-9 && y >= B.R - 1e-9 && y <= B.SY));
});

test('góc ngắm bị kẹp ở ±80°', () => {
  const g = gameOf(['1..........']);
  const a = B.trace(g, 3);
  const b = B.trace(g, B.MAX_ANGLE);
  eq(JSON.stringify(a.cell), JSON.stringify(b.cell));
});

/* ---------------- Nổ cụm, bóng rơi ---------------- */

test('cụm 2 bóng cùng màu + bóng bắn vào = 3 thì nổ', () => {
  const g = gameOf(['22.........']);
  g.current = 2;
  g.next = 2;
  const p = B.cellXY(g, 0, 2);
  const ev = B.shoot(g, angleTo(p.x, p.y));
  eq(ev.cell.r, 0);
  eq(ev.cell.c, 2);
  eq(ev.popped.length, 3);
  eq(ev.missed, false);
  eq(ev.cleared, true, 'nổ hết bóng: dọn sạch bàn');
});

test('chỉ 2 bóng cùng màu thì không nổ, tính là một phát trượt', () => {
  const g = gameOf(['21.........', '3..........']);
  g.current = 2;
  g.next = 1;
  const p = B.cellXY(g, 0, 2);
  const ev = B.shoot(g, angleTo(p.x, p.y));
  eq(ev.cell.c, 2);
  eq(ev.popped.length, 0);
  eq(ev.missed, true);
  eq(g.misses, 1);
  eq(B.cellAt(g, 0, 2), 2);
});

test('findCluster loang theo 6 hướng, chỉ cùng màu', () => {
  const g = gameOf(['11.2.......', '.1.2......', '..1........']);
  sameSet(B.findCluster(g, 0, 0), [[0, 0], [0, 1], [1, 1], [2, 2]]);
  sameSet(B.findCluster(g, 0, 3), [[0, 3], [1, 3]]);
  eq(B.findCluster(g, 0, 2).length, 0);
});

test('nổ cụm thì các bóng chỉ treo vào cụm đó rơi xuống', () => {
  // Cột bóng màu 3 treo dưới cụm màu 1 ở trần; bóng màu 4 ở (0, 8) vẫn bám trần
  const g = gameOf(['.11.....4..', '..3.......', '..3........', '..5.......']);
  sameSet(B.findFloating(g), []);
  g.rows[0][1] = 0;
  g.rows[0][2] = 0;
  sameSet(B.findFloating(g), [[1, 2], [2, 2], [3, 2]]);
});

test('bắn nổ cụm treo cả nhánh: nhánh rơi, điểm rơi tính đúng', () => {
  // Nhánh 3 - 4 chỉ treo vào hai bóng màu 1 trên trần; bóng 5 bám trần riêng
  const g = gameOf(['11.......5.', '3.........', '4..........']);
  g.current = 1;
  g.next = 4;
  const p = B.cellXY(g, 0, 2);
  const ev = B.shoot(g, angleTo(p.x, p.y));
  eq(ev.cell.c, 2);
  eq(ev.popped.length, 3, 'ba bóng màu 1 trên trần nổ');
  sameSet(ev.dropped.map((d) => [d.r, d.c]), [[1, 0], [2, 0]]);
  eq(B.bubbleCount(g), 1, 'chỉ còn bóng 5');
  eq(ev.dropPoints, B.dropPoints(2));
  eq(ev.popPoints, 30);
  eq(g.dropped, 2);
});

/* ---------------- Đẩy hàng, thua, dọn bàn ---------------- */

test('đẩy hàng: hàng mới ở trên cùng, hàng cũ tụt xuống, parity đảo nên ô cũ giữ đúng toạ độ ngang', () => {
  const g = gameOf(['.....3.....', '....4.....']);
  const x0 = B.cellXY(g, 0, 5).x;
  const x1 = B.cellXY(g, 1, 4).x;
  B.pushRow(g);
  eq(g.parity, 1);
  eq(B.cellAt(g, 1, 5), 3);
  eq(B.cellAt(g, 2, 4), 4);
  eq(B.cellXY(g, 1, 5).x, x0);
  eq(B.cellXY(g, 2, 4).x, x1);
  eq(B.rowLen(g, 0), 10, 'hàng mới là hàng ngắn');
  for (let c = 0; c < 10; c++) assert(B.cellAt(g, 0, c) > 0, 'hàng mới đầy bóng');
  eq(g.rows[0][10], 0, 'ô thừa cuối hàng ngắn để trống');
});

test('sau đủ N phát trượt thì bàn bị đẩy xuống một hàng, bộ đếm về 0', () => {
  const g = gameOf(['12121212121', '3434343434']);
  const limit = B.missLimit(0);
  eq(limit, 6);
  let pushed = 0;
  for (let i = 0; i < limit; i++) {
    // Xen kẽ màu để các bóng bắn lên không tự tạo cụm 3
    g.current = i % 4 < 2 ? 5 : 6;
    g.next = g.current;
    const ev = B.shoot(g, i % 2 ? 0.3 : -0.3);
    eq(ev.missed, true);
    if (ev.pushed) pushed++;
    eq(ev.pushed, i === limit - 1, 'chỉ đẩy ở phát thứ N');
  }
  eq(pushed, 1);
  eq(g.misses, 0);
});

test('N phát trượt giảm dần theo điểm', () => {
  assert(B.missLimit(0) > B.missLimit(3000));
  assert(B.missLimit(3000) > B.missLimit(7000));
  assert(B.missLimit(7000) > B.missLimit(50000));
  eq(B.missLimit(1e9), 3);
});

test('bóng dính chạm vạch nguy hiểm thì thua', () => {
  // 12 hàng đầy màu 1 (hàng 0..11), bắn màu 2 thẳng lên: dính ở hàng 12 = vạch nguy hiểm
  const rows = [];
  for (let r = 0; r < B.DANGER_ROW; r++) rows.push(r % 2 ? '1111111111' : '11111111111');
  const g = gameOf(rows);
  g.current = 2;
  g.next = 2;
  eq(B.crossed(g), false);
  const ev = B.shoot(g, 0);
  eq(ev.cell.r, B.DANGER_ROW);
  eq(ev.over, true);
  eq(g.over, true);
  eq(B.shoot(g, 0), null, 'hết ván thì không bắn được nữa');
});

test('đẩy hàng làm bóng tụt qua vạch nguy hiểm thì thua', () => {
  const rows = [];
  for (let r = 0; r < B.DANGER_ROW; r++) rows.push(r % 2 ? '.1........' : '.1.........');
  const g = gameOf(rows, { misses: B.missLimit(0) - 1 });
  g.current = 3;
  g.next = 3;
  const ev = B.shoot(g, -0.6);
  eq(ev.missed, true);
  eq(ev.pushed, true);
  eq(ev.over, true);
});

test('dọn sạch bàn: thưởng lớn, sang bàn 2 dày hơn, bộ đếm trượt về 0', () => {
  const g = gameOf(['22.........'], { misses: 3 });
  g.current = 2;
  g.next = 2;
  const p = B.cellXY(g, 0, 2);
  const ev = B.shoot(g, angleTo(p.x, p.y));
  eq(ev.cleared, true);
  eq(ev.clearBonus, 500);
  eq(g.level, 2);
  eq(g.misses, 0);
  eq(g.score, 30 + 500);
  eq(g.rows.length, B.levelConfig(2).rows);
  assert(B.bubbleCount(g) > 50, 'bàn mới đầy bóng');
  eq(B.colorsOnBoard(g).length <= B.levelConfig(2).colors, true);
});

test('bàn sau dày hơn và nhiều màu hơn, không vượt quá giới hạn', () => {
  assert(B.levelConfig(2).rows > B.levelConfig(1).rows);
  assert(B.levelConfig(3).colors > B.levelConfig(1).colors);
  eq(B.levelConfig(50).rows, 8);
  eq(B.levelConfig(50).colors, 6);
  assert(B.levelConfig(50).rows < B.DANGER_ROW - 2);
});

/* ---------------- Chia bóng ---------------- */

test('chỉ chia màu còn trên bàn', () => {
  const g = gameOf(['3.....5....']);
  for (let i = 0; i < 200; i++) {
    const c = B.deal(g);
    assert(c === 3 || c === 5, 'màu ' + c);
  }
});

test('nổ hết một màu thì bóng đang chờ / bóng kế mang màu đó được chia lại', () => {
  const g = gameOf(['22....4....']);
  g.current = 2;
  g.next = 2;
  const p = B.cellXY(g, 0, 2);
  B.shoot(g, angleTo(p.x, p.y));
  eq(g.current, 4);
  eq(g.next, 4);
});

test('ván mới: bóng chờ và bóng kế đều là màu có trên bàn; cùng seed thì cùng bàn', () => {
  for (let s = 1; s <= 30; s++) {
    const g = B.newGame(s);
    const cs = B.colorsOnBoard(g);
    assert(cs.includes(g.current) && cs.includes(g.next));
    eq(g.rows.length, 5);
    eq(B.findFloating(g).length, 0, 'bàn mới không có bóng lơ lửng');
  }
  eq(JSON.stringify(B.newGame(42)), JSON.stringify(B.newGame(42)));
});

test('đổi bóng: hoán đổi bóng chờ và bóng kế', () => {
  const g = gameOf(['12.........']);
  g.current = 1;
  g.next = 2;
  eq(B.swap(g), true);
  eq(g.current, 2);
  eq(g.next, 1);
  g.next = 2;
  eq(B.swap(g), false, 'cùng màu thì không cần đổi');
});

/* ---------------- Điểm ---------------- */

test('điểm nổ: 10 mỗi bóng, chuỗi thêm 5 mỗi bậc (tối đa 2 bậc)', () => {
  eq(B.popPoints(3, 1), 30);
  eq(B.popPoints(3, 2), 45);
  eq(B.popPoints(4, 3), 4 * 20);
  eq(B.popPoints(3, 5), 60);
  eq(B.popPoints(3, 50), 60);
});

test('điểm rơi: 20, 40, rồi 60 mỗi bóng', () => {
  eq(B.dropPoints(0), 0);
  eq(B.dropPoints(1), 20);
  eq(B.dropPoints(2), 60);
  eq(B.dropPoints(3), 120);
  eq(B.dropPoints(4), 180);
  eq(B.dropPoints(10), 540);
});

test('thưởng dọn bàn: 500, 750, ... tối đa 2000', () => {
  eq(B.clearBonus(1), 500);
  eq(B.clearBonus(2), 750);
  eq(B.clearBonus(7), 2000);
  eq(B.clearBonus(40), 2000);
});

test('chuỗi: các phát nổ liên tiếp tăng combo, phát trượt về 0', () => {
  const g2 = gameOf(['22.33.44...']);
  const shot = (color, c) => {
    g2.current = color;
    g2.next = 1;
    const p = B.cellXY(g2, 0, c);
    return B.shoot(g2, angleTo(p.x, p.y));
  };
  eq(shot(2, 2).combo, 1);
  eq(shot(3, 5).combo, 2);
  const third = shot(4, 8);
  eq(third.combo, 3);
  eq(third.popPoints, B.popPoints(3, 3));
  eq(g2.bestCombo, 3);
});

test('phát trượt làm chuỗi về 0', () => {
  const g = gameOf(['22.........', '..........', '...........', '.......6...']);
  g.current = 2;
  g.next = 1;
  const p = B.cellXY(g, 0, 2);
  eq(B.shoot(g, angleTo(p.x, p.y)).combo, 1);
  g.current = 1;
  const ev = B.shoot(g, 0.5);
  eq(ev.missed, true);
  eq(g.combo, 0);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu và khôi phục qua JSON: chơi tiếp giống hệt ván gốc', () => {
  const g = B.newGame(123);
  for (let i = 0; i < 5; i++) B.shoot(g, (i - 2) * 0.25);
  const copy = B.restore(JSON.parse(JSON.stringify(B.toJSON(g))));
  assert(copy, 'khôi phục được');
  eq(JSON.stringify(copy), JSON.stringify(g));
  for (let i = 0; i < 20 && !g.over; i++) {
    const a = (Math.sin(i * 1.7) * 1.2);
    const e1 = B.shoot(g, a);
    const e2 = B.shoot(copy, a);
    eq(JSON.stringify(e1), JSON.stringify(e2), 'phát thứ ' + i);
  }
  eq(JSON.stringify(copy), JSON.stringify(g));
});

test('từ chối dữ liệu hỏng', () => {
  const good = B.toJSON(B.newGame(5));
  assert(B.restore(good), 'dữ liệu tốt phải khôi phục được');
  const bad = [
    null,
    42,
    'x',
    {},
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { parity: 2 }),
    Object.assign({}, good, { rows: 'abc' }),
    Object.assign({}, good, { rows: [] }), // bàn trống
    Object.assign({}, good, { rows: good.rows.map((r) => r.slice(0, 5)) }),
    Object.assign({}, good, { rows: good.rows.map((r) => r.map(() => 9)) }),
    Object.assign({}, good, { rows: good.rows.map((r) => r.map(() => 1.5)) }),
    Object.assign({}, good, { rows: new Array(B.MAX_ROWS + 1).fill(good.rows[0]) }),
    Object.assign({}, good, { current: 0 }),
    Object.assign({}, good, { next: 7 }),
    Object.assign({}, good, { score: -5 }),
    Object.assign({}, good, { score: '100' }),
    Object.assign({}, good, { level: 0 }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { over: 'no' }),
    Object.assign({}, good, { misses: undefined }),
  ];
  // Ô thừa cuối hàng ngắn (hàng 1) có bóng
  const extra = B.toJSON(B.newGame(5));
  extra.rows[1][10] = 1;
  bad.push(extra);
  bad.forEach((o, i) => eq(B.restore(o), null, 'dữ liệu hỏng #' + i));
});

test('khôi phục ván có bóng đã qua vạch thì coi là đã thua', () => {
  const rows = [];
  for (let r = 0; r <= B.DANGER_ROW; r++) rows.push(r % 2 ? '1111111111' : '11111111111');
  const g = gameOf(rows);
  const copy = B.restore(B.toJSON(g));
  eq(copy.over, true);
});

/* ---------------- Tự chơi ---------------- */

test('300 ván tự chơi ngẫu nhiên: state luôn hợp lệ, điểm không giảm, ván nào cũng kết thúc', () => {
  for (let s = 1; s <= 300; s++) {
    const g = B.newGame(s * 7919);
    let last = 0;
    let n = 0;
    while (!g.over && n < 3000) {
      const a = (B.rand({ seed: s * 31 + n }) * 2 - 1) * B.MAX_ANGLE;
      const ev = B.shoot(g, a);
      n++;
      assert(g.score >= last, 'điểm giảm');
      last = g.score;
      assert(ev.cell === null || ev.cell.r <= B.DANGER_ROW, 'dính quá vạch');
      if (!g.over) {
        const cs = B.colorsOnBoard(g);
        assert(cs.includes(g.current) && cs.includes(g.next), 'chia màu không có trên bàn');
        eq(B.findFloating(g).length, 0, 'còn bóng lơ lửng');
        assert(B.restore(B.toJSON(g)), 'state không khôi phục được');
      }
    }
    assert(g.over, 'ván ' + s + ' không kết thúc');
  }
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) {
  console.log('Lỗi: ' + failures.join('; '));
  process.exit(1);
}
