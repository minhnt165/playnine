/* Kiểm tra engine Mạt Chược Ghép: chạy `node test.js`
 * - Bàn: Rùa 144 / Tháp 84 / Nhỏ 36 quân, không hai quân cùng tầng chồng nhau, quân tầng trên luôn có quân đỡ
 * - Bộ quân chuẩn 144 quân; ghép: giống hệt, hoa với hoa, mùa với mùa
 * - Luật quân tự do (bị đè, bị chặn hai bên)
 * - Sinh đề luôn giải được (phát lại thứ tự gỡ trên nhiều seed, và bộ giải độc lập), tất định theo seed, đề ngày
 * - Gỡ cặp, hoàn tác, gợi ý đúng, hết nước, xáo vẫn giải được / không xáo được, thắng
 * - Lưu / khôi phục và từ chối dữ liệu hỏng / bị sửa
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
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || 'mong đợi true');
}

const LAYOUT_MODES = ['turtle', 'tower', 'mini'];
const SIZES = { turtle: 144, tower: 84, mini: 36 };
/** Vị trí theo tọa độ (x, y, z nửa ô) trên một bàn. */
const at = (L, x, y, z) => L.pos.findIndex((p) => p.x === x && p.y === y && p.z === z);
/** Ván dựng tay: chỉ các vị trí trong keep còn trên bàn, mặt quân theo faces (mảng đầy đủ). */
function custom(mode, faces, keep) {
  const n = E.layoutOf(mode).n;
  const gone = new Array(n).fill(1);
  keep.forEach((i) => { gone[i] = 0; });
  return { mode, seed: 7, date: null, faces, gone, history: [], moves: 1, hints: 0, shuffles: 0 };
}
/** Phát lại một chuỗi cặp: mỗi bước phải là nước hợp lệ. */
function replay(g, moves, label) {
  moves.forEach(([a, b], k) => {
    const next = E.match(g, a, b);
    if (next === g) throw new Error((label || '') + ' bước ' + k + ': cặp ' + a + '-' + b + ' không gỡ được');
    g = next;
  });
  return g;
}

/* ---------------- Bàn ---------------- */

test('bàn có đúng số quân: Rùa 144, Tháp 84, Nhỏ 36; daily dùng bàn Rùa', () => {
  LAYOUT_MODES.forEach((m) => eq(E.layoutOf(m).n, SIZES[m], m));
  eq(E.layoutOf('daily').key, 'turtle');
  eq(E.layoutOf('xyz'), null);
});

test('bàn Rùa đúng hình cổ điển: 87 / 36 / 16 / 4 / 1 quân mỗi tầng, rộng 15 × cao 8 quân', () => {
  const L = E.LAYOUTS.turtle;
  const per = [0, 0, 0, 0, 0];
  L.pos.forEach((p) => per[p.z]++);
  eq(per, [87, 36, 16, 4, 1]);
  eq([L.cols, L.rows, L.maxZ], [15, 8, 4]);
});

test('không hai quân cùng tầng chồng lên nhau; quân tầng trên luôn có quân tầng dưới đỡ', () => {
  LAYOUT_MODES.forEach((m) => {
    const L = E.layoutOf(m);
    L.pos.forEach((a, i) => {
      L.pos.forEach((b, j) => {
        if (i < j && a.z === b.z) ok(Math.abs(a.x - b.x) >= 2 || Math.abs(a.y - b.y) >= 2, m + ': chồng nhau ' + i + ', ' + j);
      });
      if (a.z > 0) ok(L.under[i].length > 0, m + ': quân ' + i + ' lơ lửng');
    });
  });
});

/* ---------------- Bộ quân và luật ghép ---------------- */

test('đề Rùa dùng đúng bộ 144 quân: 34 mặt × 4, mỗi hoa / mùa 1 quân', () => {
  [1, 2, 99].forEach((seed) => {
    const g = E.newGame({ mode: 'turtle', seed });
    const count = new Array(E.FACES).fill(0);
    g.faces.forEach((f) => count[f]++);
    for (let f = 0; f < E.FACES; f++) eq(count[f], f < E.FLOWER ? 4 : 1, 'mặt ' + f);
  });
});

test('đề nhỏ lấy cặp từ bộ chuẩn: mỗi loại số chẵn quân, không quá 4', () => {
  ['tower', 'mini'].forEach((mode) => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = E.newGame({ mode, seed });
      const cls = {};
      const face = new Array(E.FACES).fill(0);
      g.faces.forEach((f) => {
        cls[E.matchClass(f)] = (cls[E.matchClass(f)] || 0) + 1;
        face[f]++;
      });
      Object.keys(cls).forEach((c) => ok(cls[c] % 2 === 0 && cls[c] <= 4, mode + ' loại ' + c));
      face.forEach((n, f) => ok(n <= (f < E.FLOWER ? 4 : 1), mode + ' mặt ' + f));
    }
  });
});

test('ghép: giống hệt thì được, khác thì không; hoa với hoa bất kỳ, mùa với mùa bất kỳ, hoa không ghép mùa', () => {
  ok(E.canMatch(4, 4));
  ok(!E.canMatch(4, 5));
  ok(!E.canMatch(4, 13)); // tròn 5 với văn 5
  ok(E.canMatch(27, 27));
  ok(!E.canMatch(27, 28));
  ok(E.canMatch(31, 31));
  for (let a = 34; a < 38; a++) for (let b = 34; b < 38; b++) ok(E.canMatch(a, b), 'hoa ' + a + ' ' + b);
  for (let a = 38; a < 42; a++) for (let b = 38; b < 42; b++) ok(E.canMatch(a, b), 'mùa ' + a + ' ' + b);
  for (let a = 34; a < 38; a++) for (let b = 38; b < 42; b++) ok(!E.canMatch(a, b), 'hoa ' + a + ' mùa ' + b);
  ok(!E.canMatch(-1, -1));
  ok(!E.canMatch(42, 42));
});

test('faceInfo: đủ 7 nhóm quân', () => {
  eq(E.faceInfo(0), { suit: 'dots', rank: 1 });
  eq(E.faceInfo(17), { suit: 'bamboo', rank: 9 });
  eq(E.faceInfo(18), { suit: 'chars', rank: 1 });
  eq(E.faceInfo(30), { suit: 'wind', rank: 4 });
  eq(E.faceInfo(33), { suit: 'dragon', rank: 3 });
  eq(E.faceInfo(34), { suit: 'flower', rank: 1 });
  eq(E.faceInfo(41), { suit: 'season', rank: 4 });
});

/* ---------------- Luật quân tự do ---------------- */

test('Rùa lúc đầu: quân đỉnh và các quân đầu hàng tự do; quân bị đè hoặc kẹt giữa hàng thì không', () => {
  const g = E.newGame({ mode: 'turtle', seed: 5 });
  const L = E.LAYOUTS.turtle;
  const free = (x, y, z) => E.isFree(g, at(L, x, y, z));
  ok(free(13, 7, 4), 'quân đỉnh');
  ok(!free(12, 6, 3) && !free(14, 8, 3), 'tầng 3 bị quân đỉnh đè');
  ok(free(0, 7, 0), 'quân đầu trái');
  ok(free(28, 7, 0), 'quân đuôi phải ngoài cùng');
  ok(!free(26, 7, 0), 'quân đuôi trong: kẹt giữa hàng 12 và quân ngoài cùng');
  ok(!free(2, 6, 0), 'hàng 3 cột 1: bị quân đầu trái chặn trái, quân bên cạnh chặn phải');
  ok(free(2, 0, 0) && free(24, 0, 0), 'hai đầu hàng 0');
  ok(!free(4, 0, 0), 'giữa hàng 0');
  ok(free(8, 2, 1) && !free(10, 2, 1), 'tầng 1: đầu hàng tự do, giữa hàng không');
  ok(!free(8, 2, 0), 'tầng 0 dưới quân tầng 1');
  eq(E.freeTiles(g).every((i) => E.isFree(g, i)), true);
});

test('gỡ quân chặn thì quân bên cạnh / bên dưới thành tự do', () => {
  const L = E.LAYOUTS.turtle;
  const faces = new Array(L.n).fill(0);
  const all = L.pos.map((_, i) => i);
  let g = custom('turtle', faces, all);
  const end = at(L, 0, 7, 0);
  const r3 = at(L, 2, 6, 0);
  const r4 = at(L, 2, 8, 0);
  ok(!E.isFree(g, r3) && !E.isFree(g, r4));
  g = custom('turtle', faces, all.filter((i) => i !== end));
  ok(E.isFree(g, r3) && E.isFree(g, r4), 'bỏ quân đầu trái: hai quân hàng 3, 4 tự do');
  const top = at(L, 13, 7, 4);
  const t3 = [at(L, 12, 6, 3), at(L, 14, 6, 3), at(L, 12, 8, 3), at(L, 14, 8, 3)];
  g = custom('turtle', faces, all.filter((i) => i !== top));
  t3.forEach((i) => ok(E.isFree(g, i), 'bỏ quân đỉnh: quân tầng 3 ' + i + ' tự do'));
  // Quân chỉ bị đè một phần (quân tầng trên lệch nửa ô) vẫn không tự do
  ok(!E.isFree(custom('turtle', faces, [top, t3[0]]), t3[0]), 'bị đè một phần');
  ok(E.isFree(custom('turtle', faces, [t3[0]]), t3[0]));
});

test('quân trống cả hai bên hoặc chỉ một bên đều tự do; bị chặn cả hai bên thì không', () => {
  const L = E.LAYOUTS.mini;
  const faces = new Array(L.n).fill(0);
  const a = at(L, 0, 0, 0);
  const b = at(L, 2, 0, 0);
  const c = at(L, 4, 0, 0);
  ok(E.isFree(custom('mini', faces, [b]), b), 'một mình');
  ok(E.isFree(custom('mini', faces, [a, b]), b), 'chỉ bị chặn trái');
  ok(E.isFree(custom('mini', faces, [b, c]), b), 'chỉ bị chặn phải');
  ok(!E.isFree(custom('mini', faces, [a, b, c]), b), 'bị chặn hai bên');
  ok(!E.isFree(custom('mini', faces, [a, c]), b), 'quân đã gỡ không tự do');
});

/* ---------------- Sinh đề ---------------- */

test('đề luôn giải được: phát lại thứ tự gỡ của lúc sinh trên 150 seed mỗi bàn', () => {
  LAYOUT_MODES.forEach((mode) => {
    const L = E.layoutOf(mode);
    for (let seed = 0; seed < 150; seed++) {
      const { faces, order } = E.deal(L.key, seed);
      eq(order.length, L.n / 2, mode + ' seed ' + seed);
      let g = { mode, seed, date: null, faces, gone: new Array(L.n).fill(0), history: [], moves: 0, hints: 0, shuffles: 0 };
      eq(E.newGame({ mode, seed }).faces, faces, 'newGame khớp deal');
      g = replay(g, order, mode + ' seed ' + seed);
      ok(E.isWon(g), mode + ' seed ' + seed + ' chưa sạch bàn');
    }
  });
});

test('bộ giải độc lập tìm được lời giải cho đề mới (Nhỏ, Tháp 60 seed; Rùa 40 seed, cho phép ≤ 2 seed chưa rõ)', () => {
  [['mini', 60, 0], ['tower', 60, 0], ['turtle', 40, 2]].forEach(([mode, count, slack]) => {
    let unknown = 0;
    for (let seed = 1000; seed < 1000 + count; seed++) {
      const g = E.newGame({ mode, seed });
      const r = E.solve(g);
      ok(!r.exhausted, mode + ' seed ' + seed + ' bị coi là bế tắc');
      if (!r.solved) {
        unknown++;
        continue;
      }
      ok(E.isWon(replay(g, r.moves, mode + ' seed ' + seed)), mode + ' seed ' + seed);
    }
    ok(unknown <= slack, mode + ': ' + unknown + ' seed chưa rõ');
  });
});

test('sinh đề tất định theo seed; seed khác cho đề khác', () => {
  LAYOUT_MODES.forEach((mode) => {
    eq(E.newGame({ mode, seed: 42 }), E.newGame({ mode, seed: 42 }), mode);
    ok(JSON.stringify(E.newGame({ mode, seed: 42 }).faces) !== JSON.stringify(E.newGame({ mode, seed: 43 }).faces), mode + ' seed khác');
  });
});

test('đề ngày: cùng ngày cùng đề (bàn Rùa), ngày khác đề khác; dateKey / dayNumber', () => {
  const a = E.newGame({ mode: 'daily', date: '2026-10-24' });
  const b = E.newGame({ mode: 'daily', date: '2026-10-24', seed: 123 });
  const c = E.newGame({ mode: 'daily', date: '2026-10-25' });
  eq(a, b);
  eq(a.seed, E.dailySeed('2026-10-24'));
  eq(a.faces.length, 144);
  ok(JSON.stringify(a.faces) !== JSON.stringify(c.faces));
  eq(E.dateKey(new Date(2026, 0, 5)), '2026-01-05');
  eq(E.dayNumber('2026-10-24'), 1);
  eq(E.dayNumber('2026-11-24'), 32);
  let threw = false;
  try {
    E.newGame({ mode: 'daily' });
  } catch (e) {
    threw = true;
  }
  ok(threw, 'daily thiếu ngày phải báo lỗi');
});

test('tốc độ sinh đề Rùa: trung bình dưới 10 ms trong Node', () => {
  const t0 = Date.now();
  for (let seed = 0; seed < 100; seed++) E.newGame({ mode: 'turtle', seed: seed * 7919 });
  const avg = (Date.now() - t0) / 100;
  ok(avg < 10, 'trung bình ' + avg + ' ms');
});

/* ---------------- Gỡ, hoàn tác ---------------- */

test('gỡ cặp hợp lệ; từ chối quân bị chặn, không khớp, cùng một quân, quân đã gỡ, chỉ số sai', () => {
  const g = E.newGame({ mode: 'mini', seed: 3 });
  const [a, b] = E.availablePairs(g)[0];
  const g2 = E.match(g, a, b);
  ok(g2 !== g);
  eq([g2.gone[a], g2.gone[b], g2.moves, E.remaining(g2)], [1, 1, 1, 34]);
  eq(g2.history, [[a, b]]);
  eq(g.gone[a], 0, 'ván cũ không đổi');
  ok(E.match(g2, a, b) === g2, 'quân đã gỡ');
  ok(E.match(g, a, a) === g, 'cùng một quân');
  ok(E.match(g, -1, a) === g && E.match(g, a, 999) === g && E.match(g, a, 1.5) === g, 'chỉ số sai');
  // Không khớp: hai quân tự do khác loại
  const free = E.freeTiles(g);
  const pairOff = free.flatMap((i) => free.map((j) => [i, j])).find(([i, j]) => i !== j && !E.canMatch(g.faces[i], g.faces[j]));
  ok(E.match(g, pairOff[0], pairOff[1]) === g, 'không khớp');
  // Bị chặn: một quân không tự do cùng loại với một quân tự do
  const blocked = g.faces.findIndex((f, i) => !E.isFree(g, i) && free.some((j) => E.canMatch(f, g.faces[j])));
  if (blocked >= 0) {
    const mate = free.find((j) => E.canMatch(g.faces[blocked], g.faces[j]));
    ok(E.match(g, blocked, mate) === g, 'quân bị chặn');
  }
});

test('hoàn tác trả lại cặp vừa gỡ; số nước không giảm; ván mới không hoàn tác được', () => {
  const g = E.newGame({ mode: 'tower', seed: 8 });
  ok(!E.canUndo(g) && E.undo(g) === g);
  const [a, b] = E.availablePairs(g)[0];
  const g2 = E.match(g, a, b);
  const g3 = E.undo(g2);
  eq(g3.gone, g.gone);
  eq(g3.history, []);
  eq(g3.moves, 1);
  ok(!E.canUndo(g3));
});

test('thắng khi gỡ hết; ván thắng không còn nước và không tính là hết nước', () => {
  const { faces, order } = E.deal('mini', 11);
  let g = Object.assign(E.newGame({ mode: 'mini', seed: 11 }), { faces });
  g = replay(g, order);
  ok(E.isWon(g) && !E.isStuck(g) && !E.hasMoves(g));
  eq(E.progress(g), 1);
  eq(E.shuffle(g), null);
});

/* ---------------- Gợi ý ---------------- */

test('gợi ý: luôn là cặp đang gỡ được, cộng 1 gợi ý, và giữ ván giải được (60 đề)', () => {
  LAYOUT_MODES.forEach((mode) => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = E.newGame({ mode, seed });
      // đi vài nước theo lời giải gốc rồi mới xin gợi ý
      g = replay(g, E.deal(E.layoutOf(mode).key, seed).order.slice(0, 3));
      const h = E.hint(g);
      ok(h, mode + ' seed ' + seed + ' không có gợi ý');
      ok(E.availablePairs(g).some(([a, b]) => a === h.a && b === h.b), 'cặp gợi ý phải gỡ được');
      eq(h.game.hints, 1);
      eq(h.game.gone, g.gone, 'gợi ý không tự gỡ');
      if (mode !== 'turtle') {
        eq(h.solvable, true, mode + ' seed ' + seed);
        ok(E.solve(E.match(g, h.a, h.b)).solved, mode + ' seed ' + seed + ': sau gợi ý vẫn giải được');
      } else {
        ok(h.solvable !== false, 'turtle seed ' + seed);
      }
    }
  });
});

test('gợi ý tránh cặp dẫn vào ngõ cụt khi có lựa chọn', () => {
  // Bốn quân A (tròn 1): a1, a2 tự do lẻ loi; a3 tự do nhưng đè lên c2; a4 bị c1 đè. Hai quân C (tròn 6): c1 tự do, c2 dưới a3.
  // Gỡ a1-a2 trước là kẹt (a3 + a4 bị c1 đè, c1 + c2 bị a3 đè); gợi ý phải chọn cặp có a3.
  const L = E.LAYOUTS.mini;
  const a1 = at(L, 0, 0, 0);
  const a2 = at(L, 6, 10, 0);
  const a3 = at(L, 2, 2, 1);
  const c2 = at(L, 2, 2, 0);
  const c1 = at(L, 4, 8, 1);
  const a4 = at(L, 4, 8, 0);
  const faces = new Array(L.n).fill(20);
  [a1, a2, a3, a4].forEach((i) => { faces[i] = 0; });
  [c1, c2].forEach((i) => { faces[i] = 5; });
  const g = custom('mini', faces, [a1, a2, a3, a4, c1, c2]);
  eq(E.availablePairs(g).length, 3);
  ok(E.isStuck(E.match(g, a1, a2)), 'a1-a2 là ngõ cụt');
  const h = E.hint(g);
  ok(h.a === a3 || h.b === a3, 'gợi ý phải dùng a3');
  eq(h.solvable, true);
  ok(E.isWon(replay(E.match(g, h.a, h.b), E.solve(E.match(g, h.a, h.b)).moves)));
  eq(E.hint(E.match(g, a1, a2)), null, 'hết nước thì không có gợi ý');
});

/* ---------------- Hết nước và xáo ---------------- */

test('hết nước: còn quân nhưng không cặp nào gỡ được (hàng X Y X Y)', () => {
  const L = E.LAYOUTS.tower;
  const row = [0, 2, 4, 6, 8, 10].map((x) => at(L, x, 0, 0));
  const faces = new Array(L.n).fill(20);
  [0, 1, 0, 1, 2, 2].forEach((f, k) => { faces[row[k]] = f; });
  // Hai đầu tự do là X (vị trí 0) và Z (vị trí 5): khác loại; Z còn lại nằm giữa
  const g = custom('tower', faces, row);
  const free = E.freeTiles(g);
  eq(free.sort((a, b) => a - b), [row[0], row[5]].sort((a, b) => a - b));
  ok(!E.hasMoves(g) && E.isStuck(g) && !E.isWon(g));
  eq(E.availablePairs(g), []);
});

test('xáo khi hết nước: cùng bộ quân, cùng vị trí còn lại, có nước đi và gỡ hết được; tất định; hoàn tác được', () => {
  const L = E.LAYOUTS.tower;
  const row = [0, 2, 4, 6, 8, 10].map((x) => at(L, x, 0, 0));
  const faces = new Array(L.n).fill(20);
  [0, 1, 0, 1, 2, 2].forEach((f, k) => { faces[row[k]] = f; });
  const g = custom('tower', faces, row);
  ok(E.isStuck(g));
  const s = E.shuffle(g);
  ok(s, 'phải xáo được');
  eq(s.gone, g.gone);
  eq(s.shuffles, 1);
  const bag = (x) => row.map((i) => x.faces[i]).sort((a, b) => a - b);
  eq(bag(s), bag(g));
  ok(E.hasMoves(s));
  ok(E.solve(s).solved, 'sau khi xáo phải giải được');
  eq(E.shuffle(g), s, 'tất định');
  const u = E.undo(s);
  eq(u.faces, g.faces);
  eq(u.shuffles, 1, 'hoàn tác không xóa lần xáo');
});

test('xáo vẫn giải được trên nhiều ván dở thật (đi nước ngẫu nhiên tới khi kẹt)', () => {
  let stuckSeen = 0;
  ['turtle', 'tower', 'mini'].forEach((mode) => {
    for (let seed = 1; seed <= 25; seed++) {
      let g = E.newGame({ mode, seed });
      const rng = E.mulberry32(seed * 31 + 7);
      while (!E.isWon(g) && E.hasMoves(g)) {
        const pairs = E.availablePairs(g);
        const [a, b] = pairs[Math.floor(rng() * pairs.length)];
        g = E.match(g, a, b);
      }
      if (E.isWon(g)) continue;
      stuckSeen++;
      const s = E.shuffle(g);
      if (!s) {
        // chỉ chấp nhận không xáo được khi các vị trí còn lại thật sự không gỡ hết được
        const blank = E.removalOrder(E.layoutOf(mode), g.gone.map((x) => !x), E.mulberry32(1), 200000);
        eq(blank, null, mode + ' seed ' + seed + ' lẽ ra xáo được');
        continue;
      }
      ok(E.hasMoves(s), mode + ' seed ' + seed);
      const r = E.solve(s);
      ok(!r.exhausted, mode + ' seed ' + seed + ' xáo xong lại bế tắc');
      if (r.solved) ok(E.isWon(replay(s, r.moves)));
    }
  });
  ok(stuckSeen > 10, 'cần đủ ván kẹt để thử, chỉ có ' + stuckSeen);
});

test('không xáo được khi vị trí còn lại không thể gỡ hết (hai quân chồng lên nhau)', () => {
  const L = E.LAYOUTS.mini;
  const top = L.pos.findIndex((p) => p.z === 2);
  const below = L.above.findIndex((up) => up.indexOf(top) >= 0);
  const faces = new Array(L.n).fill(5);
  const g = custom('mini', faces, [top, below]);
  ok(E.isStuck(g), 'chỉ quân trên tự do');
  eq(E.shuffle(g), null);
  eq(E.solve(g).exhausted, true, 'bộ giải chứng minh bế tắc');
});

/* ---------------- Lưu / khôi phục ---------------- */

/** Ván dở có đủ: vài cặp đã gỡ, một gợi ý, một lần xáo. */
function playedGame() {
  let g = E.newGame({ mode: 'tower', seed: 21 });
  const order = E.deal('tower', 21).order;
  g = replay(g, order.slice(0, 5));
  g = E.hint(g).game;
  g = E.shuffle(g);
  g = replay(g, E.solve(g).moves.slice(0, 2));
  return g;
}

test('lưu rồi khôi phục giữ nguyên ván (cả lịch sử xáo, gợi ý); ván ngày cũng vậy', () => {
  const g = playedGame();
  eq(g.shuffles, 1);
  eq(g.history.length, 8);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.undo(E.undo(E.undo(back))).faces, E.undo(E.undo(E.undo(g))).faces);
  const d = E.match(E.newGame({ mode: 'daily', date: '2026-10-24' }), ...E.deal('turtle', E.dailySeed('2026-10-24')).order[0]);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(d)))), d);
});

test('từ chối dữ liệu hỏng hoặc bị sửa', () => {
  const good = E.toJSON(playedGame());
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const swapFace = () => {
    const f = good.faces.slice();
    const i = good.gone.indexOf(0);
    f[i] = (f[i] + 1) % 34;
    return f;
  };
  const daily = E.toJSON(E.newGame({ mode: 'daily', date: '2026-10-24' }));
  const cases = [
    null,
    1,
    'x',
    {},
    bad({ v: 2 }),
    bad({ mode: 'pyramid' }),
    bad({ seed: -1 }),
    bad({ seed: 1.5 }),
    bad({ date: '2026-10-24' }),
    bad({ faces: good.faces.slice(1) }),
    bad({ faces: good.faces.map((f, i) => (i === 0 ? 42 : f)) }),
    bad({ faces: swapFace() }), // đổi một mặt quân: sai bộ quân của seed
    bad({ seed: good.seed + 1 }), // seed khác → bộ quân khác
    bad({ gone: good.gone.map((x, i) => (i === good.gone.indexOf(0) ? 1 : x)) }), // gỡ lẻ một quân
    bad({ gone: good.gone.map((x) => (x ? 2 : 0)) }),
    bad({ history: good.history.slice(0, -1) }), // lịch sử không khớp quân đã gỡ
    bad({ history: good.history.concat([[0, 0]]) }),
    bad({ history: good.history.map((h) => (Array.isArray(h) ? h : { s: [1, 2] })) }),
    bad({ history: 'x' }),
    bad({ moves: 1 }), // ít nước hơn số cặp trong lịch sử
    bad({ hints: -1 }),
    bad({ shuffles: 0 }), // có lần xáo trong lịch sử mà shuffles = 0
    Object.assign({}, daily, { seed: daily.seed + 1 }),
    Object.assign({}, daily, { date: '24-10-2026' }),
    Object.assign({}, daily, { date: null }),
  ];
  cases.forEach((raw, k) => eq(E.fromJSON(raw), null, 'trường hợp ' + k));
  ok(E.fromJSON(daily), 'ván ngày hợp lệ');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
