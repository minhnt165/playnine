/* Kiểm tra engine Tìm Chữ: chạy `node test.js`
 * - Bộ từ: chỉ a–z, dài 3–10, không đối xứng, có trong words.js, ≤ 300 KB
 * - Đường thẳng giữa hai ô (8 hướng), tìm mọi vị trí của một từ
 * - Sinh đề tất định theo seed; với nhiều seed mỗi mode: đúng số từ, đúng hướng của mode, mỗi từ xuất hiện đúng một lần
 *   theo cả 8 hướng (chữ lấp không tạo thêm bản nào), không từ nào chứa từ khác; tốc độ sinh đề
 * - Chọn từ (xuôi / ngược / sai / chọn lại), thắng khi tìm hết, gợi ý lộ chữ đầu
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
 */
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');
const W = require('./words.js');

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
  if (!v) throw new Error(msg || 'điều kiện sai');
}

const rev = (s) => s.split('').reverse().join('');
const SEEDS = 400;

/* ---------------- Bộ từ ---------------- */

test('bộ từ: chỉ a–z, dài 3–10, không đối xứng, không trùng trong một chủ đề', () => {
  const lists = Object.entries(W.themes).concat([['mixed', W.mixed]]);
  ok(lists.length >= 6, 'cần nhiều chủ đề');
  lists.forEach(([k, ws]) => {
    ok(ws.length >= 40, k + ' quá ít từ: ' + ws.length);
    eq(new Set(ws).size, ws.length, k + ' có từ trùng');
    ws.forEach((w) => {
      ok(/^[a-z]{3,10}$/.test(w), k + ': ' + w);
      ok(w !== rev(w), k + ' có từ đối xứng: ' + w);
    });
  });
  ok(W.mixed.length > 2000, 'trộn lẫn cần nhiều từ');
  ok(!W.mixed.includes('kill') && !W.mixed.includes('sex'), 'chưa lọc từ nhạy cảm');
});

test('words.js ≤ 300 KB và có giấy phép SCOWL đi kèm', () => {
  ok(fs.statSync(path.join(__dirname, 'words.js')).size <= 300 * 1024);
  ok(/Kevin Atkinson/.test(fs.readFileSync(path.join(__dirname, 'WORDS-LICENSE.txt'), 'utf8')));
});

test('chủ đề của engine = các chủ đề trong words.js + mixed', () => {
  eq(E.THEMES, Object.keys(W.themes).sort().concat('mixed'));
});

/* ---------------- Hình học ---------------- */

test('lineBetween: ngang, dọc, chéo, ngược chiều; không thẳng hàng / một ô thì null', () => {
  const n = 5;
  eq(E.lineBetween(n, 0, 4), [0, 1, 2, 3, 4]);
  eq(E.lineBetween(n, 4, 0), [4, 3, 2, 1, 0]);
  eq(E.lineBetween(n, 2, 22), [2, 7, 12, 17, 22]);
  eq(E.lineBetween(n, 0, 24), [0, 6, 12, 18, 24]);
  eq(E.lineBetween(n, 20, 4), [20, 16, 12, 8, 4]);
  eq(E.lineBetween(n, 24, 18), [24, 18]);
  eq(E.lineBetween(n, 0, 7), null);
  eq(E.lineBetween(n, 3, 3), null);
  eq(E.lineBetween(n, 0, 25), null);
  eq(E.lineBetween(n, -1, 3), null);
});

test('findAll: tìm theo 8 hướng', () => {
  // c a t x
  // a a x x
  // t x t x
  // x x x x
  const grid = 'catxaaxxtxtxxxxx';
  eq(E.findAll(grid, 4, 'cat'), [{ r: 0, c: 0, d: 0 }, { r: 0, c: 0, d: 1 }, { r: 0, c: 0, d: 2 }]); // ngang, dọc, chéo
  eq(E.findAll(grid, 4, 'tac'), [{ r: 0, c: 2, d: 4 }, { r: 2, c: 0, d: 5 }, { r: 2, c: 2, d: 6 }]); // ba hướng ngược
  eq(E.findAll(grid, 4, 'dog'), []);
});

test('clash: từ chứa từ kia (xuôi hoặc ngược)', () => {
  ok(E.clash('cat', 'catch'));
  ok(E.clash('star', 'rats'));
  ok(E.clash('tar', 'start'));
  ok(!E.clash('dog', 'cat'));
});

/* ---------------- Sinh đề ---------------- */

test('sinh đề tất định theo seed', () => {
  ['s', 'm', 'l'].forEach((m) => {
    const a = E.newGame({ mode: m, seed: 12345 });
    const b = E.newGame({ mode: m, seed: 12345 });
    eq(E.toJSON(a), E.toJSON(b), m);
    ok(E.newGame({ mode: m, seed: 12346 }).grid !== a.grid, m + ': seed khác phải ra đề khác');
  });
});

function checkPuzzle(g) {
  const cfg = E.MODES[g.mode];
  const n = cfg.n;
  eq(g.n, n);
  eq(g.grid.length, n * n);
  ok(/^[a-z]+$/.test(g.grid), 'lưới chỉ chữ thường');
  eq(g.words.length, cfg.count, 'số từ');
  const pool = g.theme === 'mixed' ? W.mixed : W.themes[g.theme];
  ok(pool, 'chủ đề lạ ' + g.theme);
  const ws = g.words.map((p) => p.w);
  eq(ws.slice().sort(), ws, 'danh sách theo thứ tự chữ');
  eq(new Set(ws).size, ws.length, 'từ trùng');
  g.words.forEach((p, i) => {
    ok(pool.includes(p.w), p.w + ' không thuộc chủ đề ' + g.theme);
    ok(p.w.length >= cfg.min && p.w.length <= cfg.max, 'độ dài ' + p.w);
    ok(p.d >= 0 && p.d < cfg.dirs, 'hướng ' + p.d + ' không có trong mode ' + g.mode);
    const cells = E.wordCells(g, i);
    ok(cells, 'từ ra ngoài lưới');
    eq(cells.map((c) => g.grid[c]).join(''), p.w, 'chữ trên lưới');
    // Đúng một lần theo cả 8 hướng (kể cả ngược), dù mode chỉ đặt ngang / dọc
    eq(E.findAll(g.grid, n, p.w), [{ r: p.r, c: p.c, d: p.d }], 'số lần xuất hiện của ' + p.w);
    ws.forEach((o) => { if (o !== p.w) ok(!E.clash(o, p.w), o + ' đụng ' + p.w); });
  });
}

['s', 'm', 'l'].forEach((m) => {
  test('mode ' + m + ': ' + SEEDS + ' đề, mọi từ xuất hiện đúng một lần, đúng hướng và số từ', () => {
    const themes = new Set();
    const dirs = new Set();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = E.newGame({ mode: m, seed });
      checkPuzzle(g);
      themes.add(g.theme);
      g.words.forEach((p) => dirs.add(p.d));
    }
    eq(themes.size, E.THEMES.length, 'mọi chủ đề đều được dùng');
    eq(dirs.size, E.MODES[m].dirs, 'mọi hướng của mode đều được dùng');
  });
});

test('sinh đề đủ nhanh (14x14 trung bình < 30 ms trong Node)', () => {
  const out = [];
  ['s', 'm', 'l'].forEach((m) => {
    const t0 = process.hrtime.bigint();
    let worst = 0;
    for (let seed = 1000; seed < 1200; seed++) {
      const a = process.hrtime.bigint();
      E.newGame({ mode: m, seed });
      worst = Math.max(worst, Number(process.hrtime.bigint() - a) / 1e6);
    }
    const avg = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
    out.push(m + ' ' + avg.toFixed(2) + ' ms (chậm nhất ' + worst.toFixed(1) + ')');
    if (m === 'l') ok(avg < 30, 'quá chậm: ' + avg);
  });
  console.log('       ' + out.join(' · '));
});

/* ---------------- Luật chơi ---------------- */

test('chọn đúng từ (xuôi hoặc ngược) thì tìm được, chọn lại không tính thêm', () => {
  let g = E.newGame({ mode: 'm', seed: 7 });
  const c0 = E.wordCells(g, 0);
  let res = E.select(g, c0[0], c0[c0.length - 1]);
  eq([res.hit, res.already], [0, -1]);
  g = res.game;
  eq([g.found, g.tries], [[0], 1]);
  res = E.select(g, c0[c0.length - 1], c0[0]);
  eq([res.hit, res.already, res.game.found, res.game.tries], [-1, 0, [0], 2]);
  const c1 = E.wordCells(g, 1);
  res = E.select(g, c1[c1.length - 1], c1[0]);
  eq([res.hit, res.game.found], [1, [0, 1]]);
});

test('chọn sai (đoạn thẳng không phải từ) tính một lượt; không thẳng hàng / một ô thì bỏ qua', () => {
  const g = E.newGame({ mode: 's', seed: 3 });
  const c0 = E.wordCells(g, 0);
  // Đoạn ngắn hơn từ một chữ: sai
  let res = E.select(g, c0[0], c0[c0.length - 2]);
  eq([res.hit, res.already, res.game.found, res.game.tries], [-1, -1, [], 1]);
  res = E.select(g, 0, 10); // (0,0) → (1,2): không thẳng hàng
  ok(res.game === g);
  res = E.select(g, 5, 5);
  ok(res.game === g);
});

test('tìm hết từ thì thắng; sau khi thắng không chọn thêm được', () => {
  let g = E.newGame({ mode: 'l', seed: 99 });
  g.words.forEach((p, i) => {
    ok(!E.isWon(g));
    const c = E.wordCells(g, i);
    const res = i % 2 ? E.select(g, c[c.length - 1], c[0]) : E.select(g, c[0], c[c.length - 1]);
    eq(res.hit, i);
    g = res.game;
  });
  ok(E.isWon(g));
  eq(E.progress(g), 1);
  const c = E.wordCells(g, 0);
  ok(E.select(g, c[0], c[c.length - 1]).game === g);
  eq(E.hint(g), null);
});

test('gợi ý: lộ từ chưa tìm đầu danh sách, mỗi từ một lần, hết thì null', () => {
  let g = E.newGame({ mode: 's', seed: 5 });
  const c0 = E.wordCells(g, 0);
  g = E.select(g, c0[0], c0[c0.length - 1]).game;
  const h = E.hint(g);
  eq(h.index, 1);
  eq(h.game.hinted, [1]);
  eq(E.hints(h.game), 1);
  eq(g.hinted, [], 'không đổi ván cũ');
  g = h.game;
  for (let i = 2; i < g.words.length; i++) g = E.hint(g).game;
  eq(E.hints(g), g.words.length - 1);
  eq(E.hint(g), null);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván', () => {
  let g = E.newGame({ mode: 'l', seed: 2024 });
  const c = E.wordCells(g, 3);
  g = E.select(g, c[0], c[c.length - 1]).game;
  g = E.hint(g).game;
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g);
});

test('từ chối dữ liệu hỏng', () => {
  const g = E.newGame({ mode: 's', seed: 11 });
  const good = E.toJSON(g);
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const c0 = E.wordCells(g, 0);
  const brokeWord = good.grid.split('');
  brokeWord[c0[1]] = brokeWord[c0[1]] === 'q' ? 'j' : 'q';
  // Chép từ đầu thêm một lần ở chỗ khác → xuất hiện hai lần
  const dup = good.grid.split('');
  const w0 = good.words[0][0];
  const used = new Set();
  g.words.forEach((p, i) => E.wordCells(g, i).forEach((x) => used.add(x)));
  let placedDup = false;
  for (let r = 0; r < 8 && !placedDup; r++) {
    for (let c = 0; c + w0.length <= 8 && !placedDup; c++) {
      const cells = E.cellsOf(8, r, c, 0, w0.length);
      if (cells.every((x) => !used.has(x))) {
        cells.forEach((x, k) => { dup[x] = w0[k]; });
        placedDup = true;
      }
    }
  }
  const cases = [
    null, 1, 'x', {}, bad({ v: 2 }), bad({ mode: 'xl' }), bad({ seed: -1 }), bad({ seed: 1.5 }), bad({ theme: 'cars' }),
    bad({ grid: good.grid.slice(1) }), bad({ grid: good.grid.toUpperCase() }), bad({ grid: brokeWord.join('') }),
    bad({ words: good.words.slice(1) }), bad({ words: good.words.map((p, i) => (i ? p : [p[0], p[1], p[2], 2])) }),
    bad({ words: good.words.map((p, i) => (i ? p : [p[0], 9, p[2], p[3]])) }), bad({ words: 'abc' }),
    bad({ found: [0, 0] }), bad({ found: [6] }), bad({ found: [0], tries: 0 }), bad({ hinted: [-1] }), bad({ tries: 'x' }),
  ];
  ok(placedDup, 'dựng được ca từ xuất hiện hai lần');
  cases.push(bad({ grid: dup.join('') }));
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'ca ' + i + ' ' + JSON.stringify(raw).slice(0, 80)));
  ok(E.fromJSON(good), 'ván lành phải nhận');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
