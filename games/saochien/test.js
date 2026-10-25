/* Kiểm tra engine Sao Chiến: chạy `node test.js`
 * - Luật: kiểm sao đúng luật (hàng / cột / vùng đủ k sao, không kề nhau kể cả chéo)
 * - Bộ đếm nghiệm: đề tay biết trước (1 / 2 / 0 nghiệm), so với vét cạn trên nhiều bảng vùng ngẫu nhiên, dừng ở giới hạn
 * - Sinh đề: mọi cỡ + đề hằng ngày, nhiều seed, đề có đúng một nghiệm; tất định theo seed; bộ đề 10x10 sinh sẵn; tốc độ
 * - Chơi: xoay vòng dấu (hai thứ tự), bật / tắt, chấm tự động quanh sao, kéo chấm, hoàn tác / làm lại, lỗi, thắng
 * - Gợi ý: sửa lỗi trước, rồi sao suy ra được / sao của lời giải; dùng gợi ý tới hết thì thắng
 * - Lưu / khôi phục ván và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');
const P = require('./puzzles.js');

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

/** Bảng vùng từ chuỗi các hàng ("0001", "0111" → [0,0,0,1,0,1,1,1]). */
const regionsOf = (rows) => rows.join('').split('').map(Number);
/** Mảng sao (0/1) từ danh sách ô sao. */
const starsAt = (size, cells) => Array.from({ length: size }, (_, i) => (cells.indexOf(i) >= 0 ? 1 : 0));
const cellsOf = (arr) => arr.reduce((out, v, i) => (v ? out.concat(i) : out), []);

// Đề tay 4x4 một sao. Lưới 4x4 chỉ có hai cách đặt sao đúng luật hàng / cột / kề:
//   A = cột 1, 3, 0, 2 (ô 1, 7, 8, 14)   B = cột 2, 0, 3, 1 (ô 2, 4, 11, 13)
const SOL_A = [1, 7, 8, 14];
const SOL_B = [2, 4, 11, 13];
const ONE = regionsOf(['0001', '0111', '2233', '2233']); // vùng 0 chứa hai sao của B, vùng 1 không có sao nào của B
const TWO = regionsOf(['0000', '1111', '2222', '3333']); // vùng = hàng: cả A và B đều đúng
const ZERO = regionsOf(['0000', '1332', '1332', '1122']); // vùng 3 (2x2 giữa) không chứa sao nào của A hay B

/**
 * Vét cạn: thử mọi cách chọn k cột cho từng hàng (bỏ sớm nhánh kề nhau / thừa sao theo cột),
 * cuối cùng kiểm bằng định nghĩa luật đầy đủ.
 */
function bruteCount(n, k, regions) {
  const combos = [];
  const pick = (start, acc) => {
    if (acc.length === k) return void combos.push(acc.slice());
    for (let c = start; c < n; c++) {
      acc.push(c);
      pick(c + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  let count = 0;
  const rows = [];
  const col = new Array(n).fill(0);
  function rec(r) {
    if (r === n) {
      const stars = new Array(n * n).fill(0);
      rows.forEach((cs, rr) => cs.forEach((c) => { stars[rr * n + c] = 1; }));
      if (E.isValidStars(n, k, regions, stars)) count++;
      return;
    }
    for (const cs of combos) {
      if (cs.some((c, x) => x > 0 && c - cs[x - 1] < 2)) continue;
      if (r > 0 && cs.some((c) => rows[r - 1].some((p) => Math.abs(p - c) <= 1))) continue;
      if (cs.some((c) => col[c] >= k)) continue;
      cs.forEach((c) => col[c]++);
      rows[r] = cs;
      rec(r + 1);
      cs.forEach((c) => col[c]--);
    }
  }
  rec(0);
  return count;
}

/** Bảng vùng ngẫu nhiên (n vùng liên thông lớn dần từ n hạt ngẫu nhiên) cho test so với vét cạn. */
function randomRegions(n, rand) {
  const { nb4 } = E.geometry(n);
  const reg = new Array(n * n).fill(-1);
  const cells = Array.from({ length: n * n }, (_, i) => i);
  for (let id = 0; id < n; id++) {
    let c;
    do c = cells[Math.floor(rand() * cells.length)]; while (reg[c] >= 0);
    reg[c] = id;
  }
  for (;;) {
    const front = cells.filter((i) => reg[i] < 0 && nb4[i].some((j) => reg[j] >= 0));
    if (!front.length) break;
    const c = front[Math.floor(rand() * front.length)];
    const ids = nb4[c].filter((j) => reg[j] >= 0);
    reg[c] = reg[ids[Math.floor(rand() * ids.length)]];
  }
  return reg;
}

/** Ván nhỏ dựng tay từ đề 4x4 một nghiệm (để test luật chơi không phụ thuộc bộ sinh). */
function handGame() {
  const g = E.newGame({ mode: '5', seed: 1 });
  return Object.assign({}, g, { n: 4, k: 1, regions: ONE, solution: starsAt(16, SOL_A), marks: new Array(16).fill(0) });
}

/** Đặt toàn bộ sao của lời giải (mỗi sao một nước). */
function solve(g) {
  let x = g;
  for (let i = 0; i < x.n * x.n; i++) if (x.solution[i] && x.marks[i] !== E.STAR) x = E.setMark(x, i, E.STAR);
  return x;
}

/* ===================== Luật ===================== */

test('luật: lời giải A, B của lưới 4x4 đúng với vùng = hàng; sai khi thiếu / thừa sao hoặc kề nhau', () => {
  ok(E.isValidStars(4, 1, TWO, starsAt(16, SOL_A)), 'A');
  ok(E.isValidStars(4, 1, TWO, starsAt(16, SOL_B)), 'B');
  ok(!E.isValidStars(4, 1, TWO, starsAt(16, [1, 7, 8])), 'thiếu một sao');
  ok(!E.isValidStars(4, 1, TWO, starsAt(16, [1, 7, 8, 14, 3])), 'thừa sao');
  ok(!E.isValidStars(4, 1, TWO, starsAt(16, [0, 5, 10, 15])), 'kề chéo');
  ok(!E.isValidStars(4, 1, TWO, starsAt(16, [0, 4, 11, 13])), 'cột 0 hai sao, kề dọc');
});

test('luật: vùng phải đủ k sao (A đúng hàng / cột nhưng sai vùng với bảng ZERO)', () => {
  ok(!E.isValidStars(4, 1, ZERO, starsAt(16, SOL_A)));
  ok(E.isValidStars(4, 1, ONE, starsAt(16, SOL_A)));
  ok(!E.isValidStars(4, 1, ONE, starsAt(16, SOL_B)));
});

test('bảng vùng: kiểm đủ ô, id hợp lệ và mỗi vùng liên thông', () => {
  ok(E.isValidRegions(4, ONE) && E.isValidRegions(4, TWO) && E.isValidRegions(4, ZERO));
  ok(!E.isValidRegions(4, ONE.slice(1)), 'thiếu ô');
  ok(!E.isValidRegions(4, ONE.map((v) => (v === 3 ? 4 : v))), 'id ngoài 0..n-1');
  ok(!E.isValidRegions(4, regionsOf(['0101', '0101', '2233', '2233'])), 'vùng 0 rời');
  ok(!E.isValidRegions(4, regionsOf(['0000', '0000', '2222', '2222'])), 'thiếu vùng 1, 3');
});

/* ===================== Bộ đếm nghiệm ===================== */

test('đếm nghiệm đề tay: ONE có 1 nghiệm (đúng lời giải A), TWO có 2, ZERO có 0', () => {
  const one = E.countSolutions(4, 1, ONE, 2);
  eq(one.count, 1);
  eq(cellsOf(one.solutions[0]), SOL_A);
  const two = E.countSolutions(4, 1, TWO, 5);
  eq(two.count, 2);
  eq(two.solutions.map(cellsOf).sort(), [SOL_A, SOL_B].sort());
  eq(E.countSolutions(4, 1, ZERO, 2).count, 0);
});

test('đếm nghiệm dừng ở giới hạn; ô cho trước được tôn trọng', () => {
  const free = new Array(25).fill(0).map((_, i) => Math.floor(i / 5)); // vùng = hàng
  eq(bruteCount(5, 1, free), 14);
  eq(E.countSolutions(5, 1, free, 2).count, 2);
  eq(E.countSolutions(5, 1, free, 100).count, 14);
  // Cố định sao ở ô 0 (hàng 0 cột 0): còn đúng các nghiệm bắt đầu bằng cột 0
  const fixed = new Array(25).fill(0);
  fixed[0] = 1;
  const r = E.countSolutions(5, 1, free, 100, fixed);
  ok(r.count > 0 && r.solutions.every((s) => s[0] === 1));
  fixed[1] = 1; // hai sao kề nhau: mâu thuẫn ngay
  eq(E.countSolutions(5, 1, free, 100, fixed).count, 0);
});

test('đếm nghiệm khớp vét cạn trên 300 bảng vùng ngẫu nhiên (5x5 và 6x6 một sao, 6x6 / 7x7 hai sao)', () => {
  const rand = E.rng(2026);
  const cases = [[5, 1, 100], [6, 1, 80], [6, 2, 60], [7, 2, 60]];
  const seen = { 0: 0, 1: 0, many: 0 };
  for (const [n, k, times] of cases) {
    for (let t = 0; t < times; t++) {
      const regions = randomRegions(n, rand);
      const want = bruteCount(n, k, regions);
      const got = E.countSolutions(n, k, regions, 1000).count;
      eq(got, want, n + 'x' + n + ' k' + k + ' ' + regions.join(''));
      seen[want > 1 ? 'many' : want]++;
    }
  }
  ok(seen[0] > 0 && seen[1] > 0 && seen.many > 0, 'có đủ ba loại 0 / 1 / nhiều nghiệm: ' + JSON.stringify(seen));
});

/* ===================== Sinh đề ===================== */

function checkPuzzle(g, label) {
  ok(E.isValidRegions(g.n, g.regions), label + ': vùng hỏng');
  ok(E.isValidStars(g.n, g.k, g.regions, g.solution), label + ': lời giải sai luật');
  const r = E.countSolutions(g.n, g.k, g.regions, 2);
  eq(r.count, 1, label + ': số nghiệm');
  eq(r.solutions[0], g.solution, label + ': lời giải');
}

test('sinh đề 5x5 một sao: 300 seed đều có đúng một nghiệm', () => {
  for (let s = 1; s <= 300; s++) checkPuzzle(E.newGame({ mode: '5', seed: s * 7919 }), '5/' + s);
});

test('sinh đề 8x8 một sao: 200 seed đều có đúng một nghiệm', () => {
  for (let s = 1; s <= 200; s++) checkPuzzle(E.newGame({ mode: '8', seed: s * 104729 }), '8/' + s);
});

test('đề 10x10 hai sao: 200 seed đều có đúng một nghiệm', () => {
  for (let s = 1; s <= 200; s++) checkPuzzle(E.newGame({ mode: '10', seed: s * 15485863 }), '10/' + s);
});

test('bộ đề sinh sẵn: 400 đề 10x10, mỗi đề hợp lệ, một nghiệm, không trùng (kể cả sau xoay / lật)', () => {
  const list = P['10x2'];
  ok(Array.isArray(list) && list.length >= 300, 'đủ đề');
  const keys = new Set();
  list.forEach((s, x) => {
    ok(/^[0-9]{100}$/.test(s), 'định dạng đề ' + x);
    const regions = s.split('').map(Number);
    ok(E.isValidRegions(10, regions), 'vùng đề ' + x);
    eq(E.countSolutions(10, 2, regions, 2).count, 1, 'số nghiệm đề ' + x);
    let key = null;
    for (let t = 0; t < 8; t++) {
      const k = E.transformRegions(10, regions, t).join('');
      if (key === null || k < key) key = k;
    }
    ok(!keys.has(key), 'đề trùng ' + x);
    keys.add(key);
  });
});

test('xoay / lật giữ một nghiệm (8 phép trên đề tay ONE)', () => {
  const seen = new Set();
  for (let t = 0; t < 8; t++) {
    const r = E.transformRegions(4, ONE, t);
    ok(E.isValidRegions(4, r));
    eq(E.countSolutions(4, 1, r, 2).count, 1, 'phép ' + t);
    seen.add(r.join(''));
  }
  eq(seen.size, 8, 'tám bảng khác nhau');
});

test('đề hằng ngày: 8x8, cùng ngày cùng đề, khác ngày khác đề, một nghiệm', () => {
  const a = E.newGame({ mode: 'daily', date: '2026-10-24' });
  const b = E.newGame({ mode: 'daily', date: '2026-10-24', seed: 99 }); // seed truyền vào bị bỏ qua
  eq([a.n, a.k, a.date, a.seed], [8, 1, '2026-10-24', E.dailySeed('2026-10-24')]);
  eq(a.regions, b.regions);
  const days = new Set();
  for (let d = 1; d <= 30; d++) {
    const g = E.newGame({ mode: 'daily', date: '2026-11-' + String(d).padStart(2, '0') });
    checkPuzzle(g, 'daily ' + d);
    days.add(g.regions.join(''));
  }
  eq(days.size, 30, '30 ngày 30 đề khác nhau');
});

test('tất định theo seed: cùng seed cùng đề, seed khác ra đề khác', () => {
  for (const mode of ['5', '8', '10']) {
    const a = E.newGame({ mode, seed: 12345 });
    const b = E.newGame({ mode, seed: 12345 });
    eq(a.regions, b.regions, mode);
    eq(a.solution, b.solution, mode);
    const set = new Set();
    for (let s = 1; s <= 20; s++) set.add(E.newGame({ mode, seed: s }).regions.join(''));
    ok(set.size >= 18, mode + ': đề đa dạng (' + set.size + '/20)');
  }
  eq(E.generate(8, 1, 77), E.generate(8, 1, 77));
});

test('tốc độ sinh đề (ghi trong README): 5x5, 8x8 sinh ngay; 10x10 lấy từ bộ đề', () => {
  const report = [];
  for (const [mode, times] of [['5', 1000], ['8', 300], ['10', 300]]) {
    let total = 0;
    let worst = 0;
    for (let s = 0; s < times; s++) {
      const t0 = process.hrtime.bigint();
      E.newGame({ mode, seed: 5000 + s });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      total += ms;
      worst = Math.max(worst, ms);
    }
    report.push(mode + ': tb ' + (total / times).toFixed(2) + ' ms, chậm nhất ' + worst.toFixed(1) + ' ms');
    // Máy test (máy bàn) phải dưới 30 ms ở đề chậm nhất để điện thoại chậm (~10 lần) vẫn dưới 300 ms
    ok(worst < 30, mode + ' quá chậm: ' + worst.toFixed(1) + ' ms');
  }
  console.log('       ' + report.join(' · '));
});

/* ===================== Chơi ===================== */

test('chạm xoay vòng: thứ tự "chấm trước" trống → chấm → sao → trống; "sao trước" trống → sao → chấm → trống', () => {
  let g = handGame();
  const seq = [];
  for (let x = 0; x < 3; x++) {
    g = E.tap(g, 5, 'dot', false);
    seq.push(g.marks[5]);
  }
  eq(seq, [E.DOT, E.STAR, E.EMPTY]);
  eq(g.moves, 3);
  let h = handGame();
  const seq2 = [];
  for (let x = 0; x < 3; x++) {
    h = E.tap(h, 5, 'star', false);
    seq2.push(h.marks[5]);
  }
  eq(seq2, [E.STAR, E.DOT, E.EMPTY]);
});

test('bật / tắt dấu: X bật chấm rồi về trống; S trên ô chấm thành sao; ô ngoài lưới không đổi gì', () => {
  let g = handGame();
  g = E.toggle(g, 3, E.DOT, false);
  eq(g.marks[3], E.DOT);
  g = E.toggle(g, 3, E.DOT, false);
  eq(g.marks[3], E.EMPTY);
  g = E.toggle(g, 3, E.DOT, false);
  g = E.toggle(g, 3, E.STAR, false);
  eq(g.marks[3], E.STAR);
  eq(E.toggle(g, 99, E.STAR, false), g);
  eq(E.setMark(g, 3, E.STAR), g, 'đặt dấu trùng không tính nước');
});

test('chấm tự động quanh sao: đặt sao chấm 8 ô quanh (một nước), gỡ sao thì gỡ chấm không còn kề sao nào', () => {
  let g = handGame();
  g = E.setMark(g, 0, E.DOT); // chấm tay
  g = E.setMark(g, 5, E.STAR, { auto: true });
  eq(g.moves, 2);
  eq([0, 1, 2, 4, 6, 8, 9, 10].map((i) => g.marks[i]), [E.DOT, E.AUTO, E.AUTO, E.AUTO, E.AUTO, E.AUTO, E.AUTO, E.AUTO]);
  eq(g.history[1].length, 8, 'một bước gồm sao + 7 chấm tự động');
  g = E.setMark(g, 15, E.STAR, { auto: true }); // ô 10 kề cả hai sao
  g = E.setMark(g, 5, E.EMPTY);
  eq(g.marks[0], E.DOT, 'chấm tay giữ nguyên');
  eq([1, 2, 4, 6, 8, 9].map((i) => g.marks[i]), [0, 0, 0, 0, 0, 0]);
  eq(g.marks[10], E.AUTO, 'ô 10 còn kề sao 15');
  // Chạm ô chấm tự động: tính như chấm (thứ tự "chấm trước" → sao)
  g = E.tap(g, 10, 'dot', false);
  eq(g.marks[10], E.STAR);
  // Không bật chấm tự động thì không chấm gì thêm
  const h = E.setMark(handGame(), 5, E.STAR, { auto: false });
  eq(h.marks.filter((m) => m !== 0).length, 1);
});

test('kéo chấm: chấm các ô trống trong đường kéo (một nước), không đụng sao; kéo từ ô chấm thì xóa chấm', () => {
  let g = handGame();
  g = E.setMark(g, 2, E.STAR);
  g = E.paint(g, [0, 1, 2, 3, 1], E.DOT);
  eq(g.marks.slice(0, 4), [E.DOT, E.DOT, E.STAR, E.DOT]);
  eq(g.moves, 2);
  eq(g.history[1].length, 3);
  g = E.paint(g, [0, 1, 2], E.EMPTY);
  eq(g.marks.slice(0, 4), [E.EMPTY, E.EMPTY, E.STAR, E.DOT]);
  eq(E.paint(g, [0, 1], E.EMPTY), g, 'không có gì để xóa: không tính nước');
  eq(E.paint(g, [0], E.STAR), g, 'kéo không đặt sao');
});

test('hoàn tác / làm lại theo từng nước (cả nước nhiều ô), nước mới xóa nhánh làm lại', () => {
  let g = handGame();
  g = E.setMark(g, 5, E.STAR, { auto: true });
  g = E.paint(g, [12, 13], E.DOT);
  const after = g.marks.slice();
  g = E.undo(g);
  eq(g.marks[12], E.EMPTY);
  eq(g.marks[5], E.STAR);
  g = E.undo(g);
  eq(g.marks, new Array(16).fill(0), 'về trống hết');
  ok(!E.canUndo(g) && E.canRedo(g));
  eq(E.undo(g), g);
  g = E.redo(E.redo(g));
  eq(g.marks, after);
  eq(g.moves, 2, 'hoàn tác / làm lại không đổi số nước');
  g = E.undo(g);
  g = E.setMark(g, 15, E.DOT);
  ok(!E.canRedo(g), 'nước mới xóa nhánh làm lại');
});

test('trạng thái: đếm sao còn thiếu theo hàng / cột, sao kề nhau, hàng / cột / vùng thừa sao, đơn vị bị chấm kín', () => {
  let g = handGame();
  g = E.setMark(g, 0, E.STAR);
  g = E.setMark(g, 5, E.STAR); // kề chéo với ô 0
  g = E.setMark(g, 2, E.STAR); // hàng 0 và vùng 0 (ô 0, 1, 2, 4) thừa sao; ô 2 cũng kề chéo ô 5
  let st = E.status(g);
  eq(st.rowLeft, [-1, 0, 1, 1]);
  eq(st.colLeft, [0, 0, 0, 1]);
  eq(st.adjacent, [0, 2, 5]);
  eq(st.over.rows, [0]);
  eq(st.over.regions, [0]);
  eq(st.bad, [0, 2, 5]);
  // Chấm kín hàng 3 và cột 3: không còn chỗ đặt sao
  g = E.paint(g, [12, 13, 14, 15, 3, 7, 11], E.DOT);
  st = E.status(g);
  eq(st.blocked.rows, [3]);
  eq(st.blocked.cols, [3]);
  eq(st.blocked.regions, [], 'vùng 3 còn ô 10 trống');
  g = E.setMark(g, 10, E.DOT);
  eq(E.status(g).blocked.regions, [3]);
});

test('thắng: đặt đúng các sao của lời giải là thắng (chấm không ảnh hưởng); sau khi thắng không đổi được nữa', () => {
  let g = handGame();
  g = E.paint(g, [0, 3], E.DOT);
  g = E.setMark(g, 1, E.STAR);
  g = E.setMark(g, 7, E.STAR);
  g = E.setMark(g, 8, E.STAR);
  ok(!E.isWon(g), 'còn thiếu một sao');
  g = E.setMark(g, 14, E.STAR);
  ok(E.isWon(g), 'thắng');
  eq(E.setMark(g, 0, E.STAR), g);
  eq(E.tap(g, 1, 'dot', false), g);
  eq(E.paint(g, [5], E.DOT), g);
  ok(!E.canUndo(g));
  eq(E.hint(g), null);
  eq(E.progress(g), 1);
});

test('thắng trên đề sinh của mọi cỡ: đặt đúng lời giải là thắng, thiếu một sao chưa thắng', () => {
  for (const mode of E.MODE_KEYS) {
    const g = E.newGame({ mode, seed: 42, date: '2026-10-24' });
    const s = solve(g);
    ok(E.isWon(s), mode);
    const last = s.history[s.history.length - 1][0][0];
    const almost = E.setMark(Object.assign({}, s), last, E.EMPTY);
    eq(almost, s, 'đã thắng thì không gỡ được');
    let partial = g;
    for (let i = 0; i < g.n * g.n; i++) if (g.solution[i] && i !== last) partial = E.setMark(partial, i, E.STAR);
    ok(!E.isWon(partial), mode + ': thiếu một sao');
  }
});

/* ===================== Gợi ý ===================== */

test('gợi ý sửa lỗi trước: sao sai → chấm, chấm che sao của lời giải → sao; mỗi gợi ý tính một nước + một gợi ý', () => {
  let g = handGame();
  g = E.setMark(g, 0, E.STAR); // sai (lời giải A: 1, 7, 8, 14)
  g = E.setMark(g, 7, E.DOT); // che sao 7
  let h = E.hint(g);
  eq([h.cell, h.kind, h.game.marks[0], h.game.hints, h.game.moves], [0, 'fix', E.DOT, 1, 3]);
  h = E.hint(h.game);
  eq([h.cell, h.kind, h.game.marks[7]], [7, 'fix', E.STAR]);
});

test('gợi ý suy luận: sau sao 7 và 14, các sao còn lại suy ra được bằng lan truyền', () => {
  let g = handGame();
  g = E.setMark(g, 7, E.STAR);
  g = E.setMark(g, 14, E.STAR);
  const h = E.hint(g, { auto: true });
  eq(h.kind, 'deduce');
  ok(g.solution[h.cell] === 1 && h.game.marks[h.cell] === E.STAR);
  ok(h.game.marks.some((m) => m === E.AUTO), 'gợi ý theo cài đặt chấm tự động');
});

test('gợi ý tới hết thì thắng trên đề sinh của mọi cỡ, kể cả khi đang có lỗi', () => {
  for (const mode of E.MODE_KEYS) {
    let g = E.newGame({ mode, seed: 7, date: '2026-10-25' });
    // vài dấu sai: sao ở ô không phải lời giải, chấm lên một sao của lời giải
    const wrong = g.solution.indexOf(0);
    const right = g.solution.indexOf(1);
    g = E.setMark(g, wrong, E.STAR);
    g = E.setMark(g, right, E.DOT);
    let guard = 0;
    while (!E.isWon(g) && guard++ < 200) {
      const h = E.hint(g, { auto: guard % 2 === 0 });
      ok(h && h.game !== g, mode + ': gợi ý không đổi gì');
      g = h.game;
    }
    ok(E.isWon(g), mode + ': chưa thắng sau ' + guard + ' gợi ý');
    ok(g.hints > 0 && g.hints <= g.moves);
  }
});

/* ===================== Lưu / khôi phục ===================== */

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử, chấm tự động, đề hằng ngày)', () => {
  for (const mode of E.MODE_KEYS) {
    let g = E.newGame({ mode, seed: 31337, date: '2026-10-24' });
    g = E.setMark(g, g.solution.indexOf(1), E.STAR, { auto: true });
    g = E.paint(g, [g.n * g.n - 1, g.n * g.n - 2], E.DOT);
    g = E.undo(g);
    const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
    ok(back, mode);
    eq(back, g, mode);
  }
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.setMark(E.newGame({ mode: '5', seed: 3 }), 0, E.DOT);
  const good = E.toJSON(g);
  ok(E.fromJSON(good), 'bản gốc đọc được');
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const twoSol = new Array(25).fill(0).map((_, i) => Math.floor(i / 5)); // vùng = hàng: 14 nghiệm
  const daily = E.toJSON(E.newGame({ mode: 'daily', date: '2026-10-24' }));
  const cases = [
    null, 1, 'x', [], {},
    bad({ v: 2 }),
    bad({ mode: '7' }),
    bad({ mode: 5 }),
    bad({ seed: -1 }), bad({ seed: 1.5 }), bad({ seed: '3' }),
    bad({ date: '2026-10-24' }), // mode thường không có ngày
    Object.assign({}, daily, { date: '2026-10-25' }), // ngày không khớp seed
    Object.assign({}, daily, { date: 'hôm nay' }),
    bad({ regions: good.regions.slice(1) }),
    bad({ regions: good.regions.map((v) => (v === 4 ? 5 : v)) }),
    bad({ regions: twoSol }), // nhiều nghiệm
    bad({ regions: regionsOf(['01010', '01010', '22222', '33333', '44444']) }), // vùng rời
    bad({ marks: good.marks.slice(1) }),
    bad({ marks: good.marks.map((m, i) => (i === 0 ? 4 : m)) }),
    bad({ marks: good.marks.map((m, i) => (i === 0 ? '1' : m)) }),
    bad({ moves: -1 }), bad({ hints: 2 }), bad({ moves: 1.5 }),
    bad({ history: 'x' }),
    bad({ history: [[]] }),
    bad({ history: [[[0, 0]]] }),
    bad({ history: [[[25, 0, 1]]] }),
    bad({ history: [[[0, 1, 1]]] }),
    bad({ history: [[[0, 0, 7]]] }),
    bad({ future: [5] }),
  ];
  cases.forEach((raw, x) => eq(E.fromJSON(raw), null, 'trường hợp ' + x + ': ' + JSON.stringify(raw).slice(0, 80)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
