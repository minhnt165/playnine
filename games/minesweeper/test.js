/* Kiểm tra engine Dò Mìn: chạy `node test.js`
 * - Đặt đúng số mìn, cú mở đầu tiên an toàn và mở ra vùng trống
 * - Ván hằng ngày: cùng ngày cùng đề, cú mở đầu được làm an toàn một cách tất định
 * - Loang vùng trống, không mở ô cắm cờ
 * - Mở nhanh (chording): đủ cờ thì mở, thiếu cờ thì chặn, cờ sai thì trúng mìn
 * - Phát hiện thắng / thua, cắm cờ / dấu ?, khôi phục ván từ JSON
 */
const M = require('./engine.js');

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

const sum = (arr) => arr.reduce((s, x) => s + x, 0);

/** Bàn từ sơ đồ chữ: '*' là mìn, ký tự khác là ô trống. */
function fromLayout(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const mines = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < w; c++) if (row[c] === '*') mines.push(r * w + c);
  });
  return M.fromMines(w, h, mines);
}

console.log('Dò Mìn - kiểm tra engine');

/* ---------------- Đặt mìn & cú mở đầu ---------------- */

test('đặt đúng số mìn ở mọi mức, cú mở đầu không trúng mìn và mở vùng trống', () => {
  const rng = M.seededRandom(12345);
  for (const key of Object.keys(M.LEVELS)) {
    const L = M.LEVELS[key];
    for (let round = 0; round < 200; round++) {
      const g = M.createGame({ w: L.w, h: L.h, mines: L.mines });
      eq(g.mine, null, 'chưa đặt mìn trước cú mở đầu');
      const idx = Math.floor(rng() * L.w * L.h);
      const res = M.reveal(g, idx, rng);
      eq(sum(g.mine), L.mines, `${key}: số mìn`);
      assert(!res.hit, `${key}: cú mở đầu trúng mìn`);
      eq(g.mine[idx], 0, 'ô được mở có mìn');
      for (const j of M.neighbors(L.w, L.h, idx)) eq(g.mine[j], 0, 'ô kề ô mở đầu có mìn');
      eq(g.adj[idx], 0, 'ô mở đầu phải là ô trống');
      assert(res.opened.length > 1, 'cú mở đầu phải loang ra vùng trống');
      assert(g.status === 'playing' || g.status === 'won', 'trạng thái sau cú mở đầu');
    }
  }
});

test('góc bàn: vùng an toàn chỉ gồm 4 ô', () => {
  eq(M.safeZone(9, 9, 10, 0).length, 4);
  eq(M.safeZone(9, 9, 10, 40).length, 9);
  eq(M.safeZone(9, 9, 10, 8).length, 4);
});

test('bàn dày mìn (Tùy chỉnh tối đa) vẫn đủ chỗ đặt mìn', () => {
  const c = M.clampCustom(5, 5, 999);
  eq(c.mines, 16, 'tối đa w*h-9 mìn');
  for (let k = 0; k < 50; k++) {
    const g = M.createGame(c);
    const res = M.reveal(g, 12, Math.random);
    eq(sum(g.mine), 16);
    assert(!res.hit, 'cú mở đầu trúng mìn');
    eq(g.status, 'won', 'mở ô giữa bàn 5x5 có 16 mìn quanh viền là thắng ngay');
  }
});

test('clampCustom giới hạn kích thước', () => {
  const c = M.clampCustom(1, 100, 0);
  eq(c.w, M.CUSTOM_LIMITS.minSide);
  eq(c.h, M.CUSTOM_LIMITS.maxSide);
  eq(c.mines, 1);
});

/* ---------------- Loang vùng trống ---------------- */

test('loang vùng trống mở đúng các ô và dừng ở viền số', () => {
  const g = fromLayout([
    '.....',
    '.....',
    '...**',
    '.....',
    '*....',
  ]);
  const res = M.reveal(g, 0);
  assert(!res.hit);
  // Vùng trống từ góc trên trái: hai hàng đầu (trừ cột 2-4 hàng 1 là số) ...
  const open = (r, c) => g.state[r * 5 + c] === M.OPEN;
  assert(open(0, 0) && open(0, 4) && open(1, 0), 'phải mở hàng đầu và góc');
  assert(open(1, 2) && open(1, 3) && open(1, 4), 'ô số ở viền vùng trống phải được mở');
  assert(open(2, 0) && open(2, 1) && open(2, 2) && open(3, 0), 'phải loang xuống bên trái');
  assert(!open(4, 1) || g.adj[4 * 5 + 1] >= 0, 'ô cạnh mìn chỉ mở nếu kề ô trống');
  for (let i = 0; i < 25; i++) if (g.mine[i]) assert(g.state[i] !== M.OPEN, 'không được mở ô mìn');
  eq(g.revealed, res.opened.length, 'đếm số ô mở');
  eq(new Set(res.opened).size, res.opened.length, 'không mở trùng ô');
  // Ô (4,4) cách vùng trống bởi các ô số: kiểm tra tất cả ô đã mở hoặc là số kề vùng trống
  for (const i of res.opened) {
    if (g.adj[i] > 0) {
      const touchesZero = M.neighbors(5, 5, i).some((j) => g.state[j] === M.OPEN && g.adj[j] === 0);
      assert(touchesZero, 'ô số được mở phải kề một ô trống đã mở');
    }
  }
});

test('loang không mở ô đã cắm cờ', () => {
  const g = fromLayout([
    '....*',
    '.....',
    '.....',
  ]);
  M.toggleFlag(g, 5, false); // cờ sai trong vùng trống
  M.reveal(g, 10);
  eq(g.state[5], M.FLAG, 'ô cắm cờ phải giữ nguyên');
  eq(g.status, 'playing', 'chưa thắng vì còn ô cắm cờ chưa mở');
});

test('mở ô số chỉ mở đúng một ô', () => {
  const g = fromLayout([
    '*..',
    '...',
    '...',
  ]);
  const res = M.reveal(g, 1);
  eq(res.opened.length, 1);
  eq(g.adj[1], 1);
});

test('mở trúng mìn: thua và ghi lại ô nổ', () => {
  const g = fromLayout([
    '*..',
    '...',
    '..*',
  ]);
  const res = M.reveal(g, 8);
  assert(res.hit, 'phải trúng mìn');
  eq(g.status, 'lost');
  eq(g.exploded, 8);
  eq(M.reveal(g, 4).opened.length, 0, 'ván đã thua thì không mở được nữa');
});

test('wrongFlags trả về cờ cắm sai', () => {
  const g = fromLayout([
    '*..',
    '...',
    '...',
  ]);
  M.toggleFlag(g, 0, false);
  M.toggleFlag(g, 4, false);
  const wrong = M.wrongFlags(g);
  eq(wrong.length, 1);
  eq(wrong[0], 4);
});

/* ---------------- Chording ---------------- */

test('chording: đủ cờ đúng thì mở các ô kề', () => {
  const g = fromLayout([
    '*....',
    '.....',
    '.....',
    '.....',
    '....*',
  ]);
  M.reveal(g, 1); // ô số 1
  eq(g.state[1], M.OPEN);
  eq(g.adj[1], 1);
  M.toggleFlag(g, 0, false);
  const res = M.chord(g, 1);
  assert(res && !res.blocked && !res.hit, 'phải mở được');
  assert(res.opened.length > 3, 'phải mở các ô kề và loang tiếp');
  eq(g.state[5], M.OPEN);
  eq(g.state[0], M.FLAG, 'ô cắm cờ giữ nguyên');
});

test('chording: thiếu cờ thì không mở gì', () => {
  const g = fromLayout([
    '*.*',
    '...',
    '...',
  ]);
  M.reveal(g, 1);
  eq(g.adj[1], 2);
  M.toggleFlag(g, 0, false);
  const before = g.revealed;
  const res = M.chord(g, 1);
  assert(res && res.blocked, 'phải bị chặn');
  eq(g.revealed, before);
});

test('chording: cờ cắm sai thì trúng mìn', () => {
  const g = fromLayout([
    '*..',
    '...',
    '...',
  ]);
  M.reveal(g, 1);
  M.toggleFlag(g, 2, false); // cắm nhầm
  const res = M.chord(g, 1);
  assert(res.hit, 'phải trúng mìn');
  eq(g.status, 'lost');
  eq(g.exploded, 0);
});

test('chording: không áp dụng cho ô chưa mở hoặc ô trống', () => {
  const g = fromLayout([
    '*....',
    '.....',
    '.....',
  ]);
  eq(M.chord(g, 1), null, 'ô chưa mở');
  M.reveal(g, 14);
  eq(M.chord(g, 14), null, 'ô trống (số 0)');
});

/* ---------------- Thắng ---------------- */

test('thắng khi mở hết ô an toàn, tự cắm cờ lên mìn', () => {
  const g = fromLayout([
    '*.*',
    '.*.',
    '*.*',
  ]);
  [1, 3, 5].forEach((i) => eq(M.reveal(g, i).opened.length, 1, 'ô số chỉ mở một ô'));
  eq(g.status, 'playing', 'còn ô 7');
  M.reveal(g, 7);
  eq(g.status, 'won');
  [0, 2, 4, 6, 8].forEach((i) => eq(g.state[i], M.FLAG, 'mìn được tự cắm cờ'));
  eq(M.minesLeft(g), 0);
  eq(M.progress(g), 1);
});

test('thắng không cần cắm cờ', () => {
  const g = fromLayout([
    '*....',
    '.....',
    '.....',
  ]);
  M.reveal(g, 14);
  eq(g.status, 'won', 'loang mở hết ô an toàn là thắng');
});

test('ván chơi ngẫu nhiên bằng "người chơi hoàn hảo" luôn thắng', () => {
  const rng = M.seededRandom(7);
  for (let round = 0; round < 30; round++) {
    const L = M.LEVELS.medium;
    const g = M.createGame(L);
    M.reveal(g, Math.floor(rng() * L.w * L.h), rng);
    let guard = 0;
    while (g.status === 'playing' && guard++ < 1000) {
      const next = g.state.findIndex((s, i) => s !== M.OPEN && !g.mine[i]);
      M.reveal(g, next);
    }
    eq(g.status, 'won');
    eq(g.revealed, L.w * L.h - L.mines);
  }
});

/* ---------------- Cờ & dấu ? ---------------- */

test('cắm cờ: trống → cờ → trống; bật dấu ? thì trống → cờ → ? → trống', () => {
  const g = M.createGame({ w: 9, h: 9, mines: 10 });
  eq(M.toggleFlag(g, 0, false), M.FLAG);
  eq(g.flags, 1);
  eq(M.minesLeft(g), 9);
  eq(M.toggleFlag(g, 0, false), M.HIDDEN);
  eq(g.flags, 0);
  eq(M.toggleFlag(g, 0, true), M.FLAG);
  eq(M.toggleFlag(g, 0, true), M.QUESTION);
  eq(g.flags, 0, 'dấu ? không tính là cờ');
  eq(M.toggleFlag(g, 0, true), M.HIDDEN);
});

test('không cắm cờ lên ô đã mở, mở ô cắm cờ không có tác dụng', () => {
  const g = fromLayout([
    '*..',
    '...',
    '...',
  ]);
  M.reveal(g, 1);
  eq(M.toggleFlag(g, 1, false), null);
  M.toggleFlag(g, 0, false);
  eq(M.reveal(g, 0).opened.length, 0);
  eq(g.status, 'playing');
});

/* ---------------- Ván hằng ngày ---------------- */

test('ván hằng ngày: cùng ngày thì cùng đề, khác ngày thì khác đề', () => {
  const a = M.createDaily('2026-10-20');
  const b = M.createDaily('2026-10-20');
  const c = M.createDaily('2026-10-21');
  eq(a.mine.join(''), b.mine.join(''), 'cùng ngày phải cùng mìn');
  assert(a.mine.join('') !== c.mine.join(''), 'khác ngày phải khác mìn');
  eq(sum(a.mine), 40);
  eq(a.w, 16);
  eq(a.h, 16);
  eq(M.dailySeed('2026-10-20'), M.hashString('playnine-minesweeper-daily-2026-10-20'));
});

test('ván hằng ngày: cú mở đầu an toàn, dời mìn tất định, giữ nguyên số mìn', () => {
  for (let day = 1; day <= 28; day++) {
    const key = '2026-02-' + String(day).padStart(2, '0');
    for (const idx of [0, 17, 120, 255]) {
      const a = M.createDaily(key);
      const b = M.createDaily(key);
      const ra = M.reveal(a, idx, Math.random); // rng ngoài không được ảnh hưởng tới ván có seed
      const rb = M.reveal(b, idx, () => 0.5);
      assert(!ra.hit, 'cú mở đầu ván hằng ngày trúng mìn');
      eq(sum(a.mine), 40, 'số mìn sau khi dời');
      eq(a.adj[idx], 0, 'ô mở đầu phải là ô trống');
      eq(a.mine.join(''), b.mine.join(''), 'cùng ngày + cùng ô mở đầu phải cùng bàn');
      eq(ra.opened.join(','), rb.opened.join(','), 'cùng vùng mở');
    }
  }
});

test('ván hằng ngày: mìn ngoài vùng an toàn không bị dời', () => {
  const key = '2026-10-20';
  const orig = M.createDaily(key).mine.slice();
  const g = M.createDaily(key);
  const idx = 100;
  M.reveal(g, idx);
  const zone = new Set(M.safeZone(16, 16, 40, idx));
  for (let i = 0; i < 256; i++) {
    if (orig[i] && !zone.has(i)) eq(g.mine[i], 1, 'mìn ngoài vùng an toàn phải giữ nguyên');
  }
});

test('seededRandom tất định và nằm trong [0, 1)', () => {
  const a = M.seededRandom(42);
  const b = M.seededRandom(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    eq(x, b());
    assert(x >= 0 && x < 1);
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('khôi phục ván từ JSON giữ nguyên trạng thái và chơi tiếp được', () => {
  const g = M.createDaily('2026-10-20');
  M.reveal(g, 120);
  const flagIdx = g.mine.indexOf(1);
  M.toggleFlag(g, flagIdx, false);
  const back = M.restore(JSON.parse(JSON.stringify(g)));
  assert(back, 'phải khôi phục được');
  eq(back.revealed, g.revealed);
  eq(back.flags, 1);
  eq(back.status, 'playing');
  eq(back.adj.join(','), g.adj.join(','));
  const next = back.state.findIndex((s, i) => s === M.HIDDEN && !back.mine[i]);
  assert(!M.reveal(back, next).hit);
});

test('khôi phục ván chưa mở ô nào (mìn chưa đặt)', () => {
  const g = M.createGame({ w: 9, h: 9, mines: 10 });
  const back = M.restore(JSON.parse(JSON.stringify(g)));
  assert(back && back.status === 'ready' && back.mine === null);
});

test('dữ liệu hỏng thì restore trả về null', () => {
  eq(M.restore(null), null);
  eq(M.restore({ v: 1, w: 9, h: 9 }), null);
  const g = M.createDaily('2026-10-20');
  M.reveal(g, 0);
  const bad = JSON.parse(JSON.stringify(g));
  bad.mine[bad.mine.indexOf(0)] = 1; // sai số mìn
  eq(M.restore(bad), null);
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
if (failed) {
  console.log('Lỗi: ' + failures.join('; '));
  process.exitCode = 1;
}
