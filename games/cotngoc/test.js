/* Kiểm tra engine Cột Ngọc: chạy `node test.js`
 * - Sinh khối tất định (túi 18 viên cân màu), ngọc ma thuật hiếm và không xuất hiện sớm
 * - Dịch / va tường / va ngọc, xoay vòng thứ tự, rơi theo cấp, rơi nhanh, trễ khóa, thả cứng
 * - Tìm hàng ≥ 3 ngang / dọc / hai đường chéo, hàng dài, hàng giao nhau, xóa cùng lúc, rơi trọng lực
 * - Dây chuyền + điểm, lên cấp, ngọc ma thuật, hết ván (ô xuất hiện bị chiếm, tràn miệng giếng)
 * - Tất định theo seed + chuỗi thao tác có thời điểm, chia khung hình khác nhau ra cùng kết quả
 * - Lưu / khôi phục (chạy tiếp ra đúng kết quả) và từ chối dữ liệu hỏng; bot tham lam chơi được lâu
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

const { COLS, TOTAL, HIDDEN, idx } = E;

/** Lưới từ các dòng chữ (căn đáy): '.' trống, '1'..'6' màu. */
function gridFrom(rows) {
  const g = new Array(E.CELLS).fill(0);
  const top = TOTAL - rows.length;
  rows.forEach((line, r) => {
    for (let x = 0; x < COLS; x++) {
      const ch = line[x];
      if (ch !== '.') g[idx(x, top + r)] = Number(ch);
    }
  });
  return g;
}
/** Ván dựng sẵn: lưới + khối đang rơi (bản sao an toàn qua toJSON/fromJSON không cần vì engine không sửa đầu vào). */
function make(rows, piece, extra) {
  const g = E.newGame(7);
  g.grid = gridFrom(rows);
  if (piece) g.piece = { x: piece.x, y: piece.y, c: piece.c.slice() };
  return Object.assign(g, extra || {});
}
/** Chạy step tới khi điều kiện đúng (tối đa n bước). */
function run(g, n, soft, until) {
  for (let i = 0; i < n; i++) {
    if (until && until(g)) return g;
    g = E.step(g, soft);
  }
  return g;
}
/** Chạy tới khi khối mới ra (hết pha xóa) hoặc hết ván. */
function settleSteps(g) {
  for (let i = 0; i < 2000 && g.phase === 'clear'; i++) g = E.step(g, false);
  return g;
}
/** Dịch khối về cột x, dừng khi bị chặn. */
function slide(g, x) {
  for (let i = 0; i < COLS && g.piece.x !== x; i++) {
    const n = E.move(g, g.piece.x < x ? 1 : -1);
    if (n === g) break;
    g = n;
  }
  return g;
}
const countColors = (cs) => {
  const n = [0, 0, 0, 0, 0, 0, 0];
  cs.forEach((c) => n[c]++);
  return n;
};

/* ---------------- Sinh khối ---------------- */
test('ván mới: khối ở cột giữa, viên dưới ở hàng nhìn thấy đầu tiên, lưới trống, cấp 1', () => {
  const g = E.newGame(42);
  eq([g.piece.x, g.piece.y, g.phase, g.level, g.score, g.pieces], [E.SPAWN_COL, HIDDEN, 'fall', 1, 0, 1]);
  ok(g.grid.every((v) => v === 0));
  eq(g.piece.c.length, 3);
  eq(g.next.length, 3);
});

/** Dãy n khối liên tiếp của một seed (giếng được dọn trống trước mỗi lần thả để không bao giờ hết ván). */
function pieceSeq(seed, n) {
  const out = [];
  let h = E.newGame(seed);
  for (let k = 0; k < n; k++) {
    out.push(h.piece.c.slice());
    h.grid = new Array(E.CELLS).fill(0);
    h = settleSteps(E.hardDrop(h));
    h.grid = new Array(E.CELLS).fill(0);
  }
  return out;
}

test('sinh khối tất định theo seed, seed khác ra dãy khác', () => {
  eq(pieceSeq(123, 60), pieceSeq(123, 60));
  ok(JSON.stringify(pieceSeq(123, 60)) !== JSON.stringify(pieceSeq(124, 60)));
});

test('túi 18 viên: mỗi 6 khối đầu có đủ mỗi màu đúng 3 viên', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const cs = [].concat(...pieceSeq(seed, 6));
    eq(countColors(cs).slice(1), [3, 3, 3, 3, 3, 3], 'seed ' + seed);
  }
});

test('ngọc ma thuật: không có trong MAGIC_FROM khối đầu, sau đó hiếm (≈ 1/40)', () => {
  let magic = 0;
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    pieceSeq(seed, 120).forEach((c, k) => {
      const m = E.isMagic(c);
      if (k < E.MAGIC_FROM) ok(!m, 'ma thuật quá sớm ở khối ' + (k + 1));
      else {
        total++;
        if (m) magic++;
      }
    });
  }
  const rate = magic / total;
  ok(rate > 0.01 && rate < 0.05, 'tỉ lệ ' + rate);
});

/* ---------------- Dịch, xoay ---------------- */
test('dịch trái / phải, va tường hai bên', () => {
  let g = E.newGame(5);
  g = E.move(g, -1);
  eq(g.piece.x, 1);
  g = E.move(E.move(g, -1), -1);
  eq(g.piece.x, 0, 'dừng ở tường trái');
  const same = E.move(g, -1);
  ok(same === g, 'va tường trả lại đúng trạng thái vào');
  for (let i = 0; i < 10; i++) g = E.move(g, 1);
  eq(g.piece.x, COLS - 1, 'dừng ở tường phải');
});

test('va ngọc: không dịch vào cột có ngọc ngang tầm khối', () => {
  // Cột 1 cao tới hàng TOTAL-3; khối ở cột 2, viên dưới ở hàng TOTAL-1 → chạm cạnh
  const g = make(['.1....', '.2....', '.3....'], { x: 2, y: TOTAL - 1, c: [4, 5, 6] });
  ok(E.move(g, -1) === g, 'bị chặn bên trái');
  eq(E.move(g, 1).piece.x, 3);
  // Cao hơn chồng ngọc thì dịch qua được
  const h = make(['.1....'], { x: 2, y: TOTAL - 2, c: [4, 5, 6] });
  eq(E.move(h, -1).piece.x, 1);
});

test('xoay vòng thứ tự 3 viên hai chiều, ba lần thì về như cũ, không đổi vị trí', () => {
  const g = make([], { x: 2, y: 5, c: [1, 2, 3] });
  const a = E.rotate(g, 1);
  eq(a.piece.c, [3, 1, 2], 'cổ điển: viên dưới lên đầu');
  const b = E.rotate(g, -1);
  eq(b.piece.c, [2, 3, 1], 'ngược: viên trên xuống đáy');
  eq(E.rotate(E.rotate(a, 1), 1).piece.c, [1, 2, 3]);
  eq(E.rotate(b, 1).piece.c, [1, 2, 3]);
  eq([a.piece.x, a.piece.y], [2, 5]);
  eq(g.piece.c, [1, 2, 3], 'không sửa trạng thái vào');
});

/* ---------------- Rơi, khóa ---------------- */
test('rơi theo cấp: cấp 1 rơi 1 hàng sau gravityFor(1) bước, cấp cao rơi nhanh hơn', () => {
  eq(E.gravityFor(1), 48);
  for (let l = 2; l <= E.MAX_LEVEL; l++) ok(E.gravityFor(l) <= E.gravityFor(l - 1), 'không chậm lại ở cấp ' + l);
  ok(E.gravityFor(10) < E.gravityFor(5) && E.gravityFor(5) < E.gravityFor(1));
  eq(E.gravityFor(E.MAX_LEVEL), 2);
  let g = E.newGame(3);
  g = run(g, 47);
  eq(g.piece.y, HIDDEN);
  g = E.step(g, false);
  eq(g.piece.y, HIDDEN + 1);
  // Cấp 10
  let h = Object.assign(E.newGame(3), { level: 10, jewels: 270 });
  h = run(h, E.gravityFor(10));
  eq(h.piece.y, HIDDEN + 1);
});

test('rơi nhanh: 1 hàng mỗi SOFT_TICKS bước, +1 điểm mỗi hàng', () => {
  let g = E.newGame(3);
  g = run(g, 10, true);
  eq(g.piece.y, HIDDEN + 5);
  eq(g.score, 5);
});

test('trễ khóa: chạm đáy đếm LOCK_TICKS bước rồi khóa, ghi 3 viên vào lưới đúng thứ tự', () => {
  let g = make([], { x: 0, y: TOTAL - 1, c: [1, 2, 3] });
  g = run(g, E.LOCK_TICKS - 1);
  ok(g.piece && g.piece.y === TOTAL - 1, 'chưa khóa');
  g = E.step(g, false);
  eq([g.grid[idx(0, TOTAL - 3)], g.grid[idx(0, TOTAL - 2)], g.grid[idx(0, TOTAL - 1)]], [1, 2, 3]);
  eq(g.piece.y, HIDDEN, 'khối mới đã ra');
  eq(g.pieces, 2);
});

test('trễ khóa: dịch / xoay khi đang chạm đặt lại bộ đếm, tối đa MAX_RESETS lần', () => {
  let g = make([], { x: 0, y: TOTAL - 1, c: [1, 2, 3] });
  g = run(g, 20);
  g = E.rotate(g, 1);
  eq(g.lock, 0);
  g = run(g, 20);
  ok(g.piece && g.piece.x === 0, 'chưa khóa vì vừa xoay');
  // Xoay liên tục: chỉ đặt lại MAX_RESETS lần
  let h = make([], { x: 0, y: TOTAL - 1, c: [1, 2, 3] });
  let t = 0;
  while (h.piece && h.piece.x === 0 && h.pieces === 1 && t < 2000) {
    h = E.rotate(h, 1);
    h = E.step(h, false);
    t++;
  }
  ok(t >= E.MAX_RESETS && t <= E.MAX_RESETS + E.LOCK_TICKS + 1, 'khóa sau ' + t + ' bước');
});

test('thả cứng: rơi thẳng, +2 điểm mỗi hàng, khóa ngay', () => {
  const g = E.hardDrop(make([], { x: 4, y: HIDDEN, c: [1, 2, 3] }));
  const rows = TOTAL - 1 - HIDDEN;
  eq(g.score, rows * E.HARD_POINTS);
  eq(g.grid[idx(4, TOTAL - 1)], 3);
  ok(g.fx.some((f) => f.type === 'hard' && f.rows === rows));
  eq(E.ghostY(make(['....1.'], { x: 4, y: HIDDEN, c: [1, 2, 3] })), TOTAL - 2);
});

/* ---------------- Tìm hàng ---------------- */
test('tìm hàng 3 viên: ngang, dọc, chéo xuống phải, chéo lên phải', () => {
  eq(E.findMatches(gridFrom(['111...'])).length, 3);
  eq(E.findMatches(gridFrom(['2.....', '2.....', '2.....'])).length, 3);
  eq(E.findMatches(gridFrom(['3.....', '43....', '453...'])).length, 3, 'chéo \\');
  eq(E.findMatches(gridFrom(['..4...', '.45...', '456...'])).length, 3, 'chéo /');
  eq(E.findMatches(gridFrom(['11.1..', '22.2..'])).length, 0, 'hai viên / bị ngắt không tính');
  eq(E.findMatches(gridFrom(['12....', '21....', '12....'])).length, 0);
});

test('hàng dài hơn 3 lấy trọn; hàng giao nhau mỗi ô tính một lần', () => {
  eq(E.findMatches(gridFrom(['11111.'])).length, 5);
  eq(E.findMatches(gridFrom(['111111'])).length, 6);
  // Chữ thập: ngang 5 + dọc 3 chung một ô = 7 ô
  const cross = E.findMatches(gridFrom(['..1...', '11111.', '..1...']));
  eq(cross.length, 7);
  // Chữ X: hai đường chéo dài 3 chung tâm = 5 ô
  eq(E.findMatches(gridFrom(['1.1...', '.1....', '1.1...'])).length, 5);
});

test('trọng lực: ngọc lơ lửng rơi xuống, giữ thứ tự', () => {
  const g = gridFrom(['1.....', '2.....', '......', '3.....', '......']);
  E.collapse(g);
  eq([g[idx(0, TOTAL - 3)], g[idx(0, TOTAL - 2)], g[idx(0, TOTAL - 1)]], [1, 2, 3]);
  eq(g[idx(0, TOTAL - 4)], 0);
});

/* ---------------- Xóa, dây chuyền, điểm ---------------- */
test('khóa tạo hàng: xóa cùng lúc mọi hàng (dọc + ngang), chờ CLEAR_TICKS rồi rơi', () => {
  // Khối [1,2,3] đáp cột 0: viên 3 ở đáy nối ngang "333", viên 1 trên cùng nối dọc? không — chỉ ngang
  let g = make(['.33...'], { x: 0, y: TOTAL - 1, c: [5, 6, 3] });
  g = E.hardDrop(g);
  eq(g.phase, 'clear');
  eq(g.marked.length, 3);
  eq(g.score, 3 * 10 * 1 * 1);
  g = run(g, E.CLEAR_TICKS);
  eq(g.phase, 'fall');
  eq([g.grid[idx(0, TOTAL - 1)], g.grid[idx(0, TOTAL - 2)], g.grid[idx(1, TOTAL - 1)]], [6, 5, 0], '5,6 rơi xuống đáy');
});

test('dây chuyền: đợt 2 nhân 2, đợt 3 nhân 3; điểm = viên × 10 × cấp × bậc', () => {
  // Khối [2,1,1] thả vào cột 0 (đáy cột 0 có sẵn viên 1):
  //   cột 0 thành dọc "111" → xóa 3 (bậc 1); viên 2 rơi xuống đáy
  //   hàng đáy thành "2224" → xóa 3 viên 2 (bậc 2); hai viên 4 ở cột 1, 2 rơi xuống
  //   hàng đáy thành ".444" → xóa 3 (bậc 3), giếng trống
  const rows = [
    '.44...',
    '1224..',
  ];
  let g = make(rows, { x: 0, y: HIDDEN, c: [2, 1, 1] }, { level: 1 });
  g = E.hardDrop(g);
  const hard = (TOTAL - 2 - HIDDEN) * 2;
  eq(g.score, hard + 3 * 10 * 1 * 1);
  eq(g.chain, 1);
  g = settleSteps(g);
  eq(g.score, hard + 30 + 3 * 10 * 2 + 3 * 10 * 3);
  eq(g.maxChain, 3);
  ok(g.grid.every((v) => v === 0), 'giếng trống');
  eq(g.jewels, 9);
  // Cùng ván ở cấp 4: mọi đợt nhân 4
  let h = make(rows, { x: 0, y: HIDDEN, c: [2, 1, 1] }, { level: 4, jewels: 90 });
  h = settleSteps(E.hardDrop(h));
  eq(h.score, hard + 4 * (30 + 60 + 90));
});

test('settle (tính nhanh cho bot) cho cùng kết quả với chạy từng bước', () => {
  for (let seed = 1; seed <= 30; seed++) {
    let g = E.newGame(seed);
    for (let k = 0; k < 40 && g.phase !== 'over'; k++) {
      const x = (k * 7 + seed) % COLS;
      const s = E.settle(g.grid, x, g.piece.c, g.level, g.jewels, g.piece.y);
      let h = slide(g, x);
      if (h.piece.x !== x) break;
      const before = h.score;
      h = E.hardDrop(h);
      const rows = h.fx.find((f) => f.type === 'hard').rows;
      h = settleSteps(h);
      eq(h.score - before - rows * 2, s.points, 'điểm seed ' + seed + ' khối ' + k);
      eq(h.grid.join(''), s.grid.join(''), 'lưới');
      eq(h.phase === 'over', s.over || false || h.cause === 'blocked', 'hết ván');
      g = h;
    }
  }
});

test('lên cấp theo số viên đã xóa (mỗi LEVEL_JEWELS viên), cấp nhân điểm', () => {
  eq([E.levelFor(0), E.levelFor(29), E.levelFor(30), E.levelFor(59), E.levelFor(60)], [1, 1, 2, 2, 3]);
  eq(E.levelFor(100000), E.MAX_LEVEL);
  let g = make(['.33...'], { x: 0, y: TOTAL - 1, c: [5, 6, 3] }, { jewels: 28, level: 1 });
  g = E.hardDrop(g);
  eq(g.level, 2);
  ok(g.fx.some((f) => f.type === 'level' && f.level === 2));
  eq(g.score, 30, 'điểm tính theo cấp lúc xóa');
  let h = make(['.33...'], { x: 0, y: TOTAL - 1, c: [5, 6, 3] }, { jewels: 150, level: 6 });
  h = E.hardDrop(h);
  eq(h.score, 3 * 10 * 6);
});

test('ngọc ma thuật: đáp lên viên màu c thì xóa mọi viên màu c; đáp xuống đáy thì biến mất', () => {
  const M = E.MAGIC;
  let g = make(['4.4..4', '1.2.34', '2.4.44'.replace(/4/g, '5')], { x: 1, y: HIDDEN, c: [M, M, M] });
  // Cột 1 trống tới đáy → đáp đáy, không xóa gì
  g = E.hardDrop(g);
  ok(g.fx.some((f) => f.type === 'magic' && f.color === 0));
  eq(g.jewels, 0);
  eq(g.phase, 'fall');
  // Đáp lên viên màu 4 ở cột 0 → xóa mọi viên màu 4
  let h = make(['4.4..4', '1.2.34'], { x: 0, y: HIDDEN, c: [M, M, M] });
  h = E.hardDrop(h);
  eq(h.phase, 'clear');
  eq(h.marked.length, 4);
  eq(h.score, (TOTAL - 1 - 2 - HIDDEN) * 2 + 4 * 10);
  h = settleSteps(h);
  ok(!h.grid.some((v) => v === 4), 'không còn màu 4');
  eq(E.rotate(make([], { x: 0, y: 5, c: [M, M, M] }), 1).piece.c, [M, M, M]);
});

/* ---------------- Hết ván ---------------- */
test('hết ván: ô xuất hiện bị chiếm khi ra khối mới', () => {
  // Cột giữa cao tới sát miệng giếng (hàng nhìn thấy đầu tiên bị chiếm sau khi khóa ở cột 0)
  const rows = [];
  for (let r = 0; r < E.ROWS; r++) rows.push('..' + (r % 2 ? '1' : '2') + '...');
  let g = make(rows, { x: 0, y: HIDDEN, c: [3, 4, 5] });
  g = E.hardDrop(g);
  eq([g.phase, g.cause], ['over', 'blocked']);
  ok(g.piece === null);
  // Hết ván rồi thì không đổi gì nữa
  ok(E.step(g, false) === g && E.move(g, 1) === g && E.hardDrop(g) === g);
});

test('hết ván: khóa xong còn ngọc nằm trên miệng giếng', () => {
  const rows = [];
  for (let r = 0; r < E.ROWS - 1; r++) rows.push((r % 2 ? '1' : '2') + '.....');
  let g = make(rows, { x: 0, y: HIDDEN, c: [3, 4, 5] }); // cột 0 chỉ còn một ô trống
  g = E.hardDrop(g);
  eq([g.phase, g.cause], ['over', 'top']);
});

test('hàng xóa được cứu khối khóa chạm miệng giếng (không thua)', () => {
  const rows = [];
  for (let r = 0; r < E.ROWS - 1; r++) rows.push((r % 2 ? '1' : '2') + '.....');
  rows[0] = '3.....'; // hai viên trên cùng của cột 0 màu 3: viên dưới của khối (màu 3) nối dọc "333"
  rows[1] = '3.....';
  let g = make(rows, { x: 0, y: HIDDEN, c: [4, 5, 3] });
  g = E.hardDrop(g);
  eq(g.phase, 'clear', 'khối chạm miệng giếng nhưng tạo hàng');
  g = settleSteps(g);
  ok(g.phase !== 'over', 'vẫn chơi tiếp');
  eq([g.grid[idx(0, HIDDEN + 1)], g.grid[idx(0, HIDDEN + 2)]], [4, 5], 'hai viên trên rơi xuống vào giếng');
});

/* ---------------- Tất định ---------------- */
function scripted(seed) {
  // Chuỗi thao tác cố định có thời điểm
  const ev = [];
  for (let k = 0; k < 120; k++) {
    const t = k * 37;
    ev.push({ t, a: ['left', 'right', 'rotate', 'rotateBack'][k % 4] });
    if (k % 3 === 0) ev.push({ t: t + 5, a: 'softOn' }, { t: t + 20, a: 'softOff' });
    if (k % 5 === 4) ev.push({ t: t + 30, a: 'hard' });
  }
  return E.simulate(seed, ev, 5000);
}
test('tất định: cùng seed + chuỗi thao tác ra cùng ván; seed khác ra ván khác', () => {
  eq(E.toJSON(scripted(9)), E.toJSON(scripted(9)));
  ok(JSON.stringify(E.toJSON(scripted(9))) !== JSON.stringify(E.toJSON(scripted(10))));
});

test('bước cố định: chia khung hình 30 / 60 / 144 Hz / giật ra cùng số bước và cùng ván', () => {
  const play = (frames) => {
    let g = E.newGame(77);
    let acc = 0;
    let ticks = 0;
    for (const ms of frames) {
      const r = E.ticksFor(acc, ms);
      acc = r.acc;
      for (let i = 0; i < r.ticks; i++) {
        if (ticks % 90 === 45) g = E.hardDrop(g);
        g = E.step(g, false);
        ticks++;
      }
    }
    return { ticks, g: JSON.stringify(E.toJSON(g)) };
  };
  const total = 20000; // 20 s
  const mk = (ms) => Array.from({ length: Math.round(total / ms) }, () => ms);
  const a = play(mk(1000 / 30));
  const b = play(mk(1000 / 60));
  const c = play(mk(1000 / 144));
  const jitter = [];
  let s = 0;
  for (let i = 0; s < total; i++) {
    const ms = [5, 31, 12, 17, 9, 26][i % 6];
    jitter.push(Math.min(ms, total - s));
    s += ms;
  }
  const d = play(jitter);
  eq([a.ticks, b.ticks, c.ticks, d.ticks], [1200, 1200, 1200, 1200]);
  ok(a.g === b.g && b.g === c.g && c.g === d.g);
  // Khung hình dài (tab quay lại) chỉ tính MAX_FRAME_MS
  eq(E.ticksFor(0, 5000).ticks, Math.floor(E.MAX_FRAME_MS / E.TICK_MS));
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván (đang rơi và đang xóa), chạy tiếp ra cùng kết quả', () => {
  let g = scripted(21);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'khôi phục được');
  eq(E.toJSON(back), E.toJSON(g));
  let h = make(['.33...'], { x: 0, y: TOTAL - 1, c: [5, 6, 3] });
  h = E.hardDrop(h);
  eq(h.phase, 'clear');
  const hb = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(h))));
  ok(hb, 'khôi phục pha xóa');
  eq(E.toJSON(run(hb, 40)), E.toJSON(run(h, 40)));
  // Ván đang chơi giữa chừng: chạy tiếp 600 bước có thả cứng
  let p = E.newGame(5);
  for (let i = 0; i < 400; i++) p = E.step(i % 50 === 10 ? E.hardDrop(p) : p, i % 7 === 0);
  let q = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(p))));
  for (let i = 0; i < 600; i++) {
    p = E.step(i % 40 === 3 ? E.hardDrop(p) : p, false);
    q = E.step(i % 40 === 3 ? E.hardDrop(q) : q, false);
  }
  eq(E.toJSON(q), E.toJSON(p));
});

test('từ chối dữ liệu hỏng', () => {
  const base = E.toJSON(E.newGame(3));
  const bad = [
    null, 1, 'x', {}, Object.assign({}, base, { v: 2 }),
    Object.assign({}, base, { seed: 0 }), Object.assign({}, base, { seed: -1 }), Object.assign({}, base, { rng: 1.5 }),
    Object.assign({}, base, { phase: 'win' }), Object.assign({}, base, { score: -5 }), Object.assign({}, base, { score: '10' }),
    Object.assign({}, base, { level: 3 }), Object.assign({}, base, { jewels: 31 }), // cấp không khớp số viên
    Object.assign({}, base, { grid: base.grid.slice(1) }), Object.assign({}, base, { grid: base.grid.map((v, i) => (i === 50 ? 9 : v)) }),
    Object.assign({}, base, { grid: base.grid.map((v, i) => (i === 1 ? 2 : v)) }), // ngọc trong vùng ẩn khi đang rơi
    Object.assign({}, base, { piece: null }), Object.assign({}, base, { piece: { x: 7, y: 2, c: [1, 2, 3] } }),
    Object.assign({}, base, { piece: { x: 0, y: 1, c: [1, 2, 3] } }), Object.assign({}, base, { piece: { x: 0, y: 5, c: [1, 7, 3] } }),
    Object.assign({}, base, { piece: { x: 2, y: TOTAL - 1, c: [1, 2, 3] }, grid: base.grid.map((v, i) => (i === idx(2, TOTAL - 1) ? 1 : v)) }),
    Object.assign({}, base, { next: [1, 2] }), Object.assign({}, base, { next: [0, 1, 2] }),
    Object.assign({}, base, { bag: [1, 1, 1, 1] }), Object.assign({}, base, { bag: 'abc' }),
    Object.assign({}, base, { lock: 999 }), Object.assign({}, base, { pieces: 0 }),
    Object.assign({}, base, { phase: 'clear', piece: null, marked: [] }),
    Object.assign({}, base, { phase: 'clear', piece: null, marked: [3], clearT: 5, chain: 1, maxChain: 1 }), // ô đánh dấu trống
    Object.assign({}, base, { phase: 'over', piece: null, cause: 'win' }),
    Object.assign({}, base, { phase: 'over', piece: null, cause: null }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
  ok(E.fromJSON(base), 'ván mới hợp lệ');
  ok(E.fromJSON(Object.assign({}, base, { phase: 'over', piece: null, cause: 'blocked' })), 'ván đã hết hợp lệ');
});

/* ---------------- Chơi được: bot tham lam ---------------- */
/** Chọn nước đặt tốt nhất (cột × 3 cách xoay) theo điểm + độ cao, rồi thả cứng. */
function greedy(g) {
  let best = null;
  const cs = E.isMagic(g.piece.c) ? [g.piece.c] : [g.piece.c, [g.piece.c[2], g.piece.c[0], g.piece.c[1]], [g.piece.c[1], g.piece.c[2], g.piece.c[0]]];
  for (let x = 0; x < COLS; x++) {
    if (!E.fits(g.grid, x, HIDDEN)) continue;
    cs.forEach((c, r) => {
      const s = E.settle(g.grid, x, c, g.level, g.jewels, HIDDEN);
      let h = 0;
      let filled = 0;
      for (let i = 0; i < E.CELLS; i++) if (s.grid[i]) { filled++; h += TOTAL - Math.floor(i / COLS); }
      const v = (s.over ? -1e9 : 0) + s.points * 2 - h - filled * 3 - (s.grid[idx(E.SPAWN_COL, HIDDEN + 2)] ? 500 : 0);
      if (!best || v > best.v) best = { v, x, r };
    });
  }
  return best;
}
test('bot tham lam chơi được lâu trên nhiều seed (luồng sinh khối công bằng)', () => {
  const res = [];
  for (let seed = 1; seed <= 6; seed++) {
    let g = E.newGame(seed);
    let n = 0;
    while (g.phase !== 'over' && n < 400) {
      if (g.phase === 'clear') { g = settleSteps(g); continue; }
      const b = greedy(g);
      if (!b) break;
      for (let k = 0; k < b.r; k++) g = E.rotate(g, 1);
      g = slide(g, b.x);
      g = E.hardDrop(g);
      n++;
    }
    res.push(n);
  }
  ok(res.every((n) => n >= 150), 'số khối: ' + res.join(', '));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
