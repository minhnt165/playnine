/* Kiểm tra engine Đoán Mã: chạy `node test.js`
 * - Chấm điểm một lần đoán (đúng chỗ / sai chỗ), kể cả khi có màu lặp ở mã hoặc ở lần đoán
 * - Mã bí mật đúng luật từng mode (số chốt, số màu, có / không lặp), PRNG seed được
 * - Điền / xóa chốt, nộp lần đoán, thắng, thua khi hết lượt
 * - Mọi mã sinh ra đều giải được trong số lượt cho phép (solver chạy trong test)
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
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
  if (!v) throw new Error(msg || 'expected true');
}

/** Chấm bằng cách đếm thô, độc lập với engine: ghép cặp đúng chỗ trước, rồi ghép từng chốt còn lại với chốt cùng màu chưa dùng. */
function naiveScore(secret, guess) {
  const usedS = secret.map(() => false);
  const usedG = guess.map(() => false);
  let black = 0;
  let white = 0;
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      black++;
      usedS[i] = usedG[i] = true;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (usedG[i]) continue;
    for (let j = 0; j < secret.length; j++) {
      if (!usedS[j] && secret[j] === guess[i]) {
        white++;
        usedS[j] = true;
        break;
      }
    }
  }
  return { black, white };
}

/** Ván với mã bí mật cho trước (giữ nguyên mọi trường khác của newGame). */
function withSecret(mode, secret) {
  const g = E.newGame(mode, 1);
  return Object.assign({}, g, { secret: secret.slice() });
}

function enter(g, code) {
  code.forEach((c) => { g = E.place(g, c); });
  return g;
}

/* ---------------- Chấm điểm ---------------- */

test('chấm điểm: trùng hết là toàn đúng chỗ', () => {
  eq(E.score([0, 1, 2, 3], [0, 1, 2, 3]), { black: 4, white: 0 });
});

test('chấm điểm: đúng màu nhưng đảo hết chỗ', () => {
  eq(E.score([0, 1, 2, 3], [3, 2, 1, 0]), { black: 0, white: 4 });
  eq(E.score([0, 1, 2, 3], [1, 0, 2, 3]), { black: 2, white: 2 });
});

test('chấm điểm: không có màu nào trùng', () => {
  eq(E.score([0, 1, 2, 3], [4, 5, 4, 5]), { black: 0, white: 0 });
});

test('chấm điểm: lặp ở lần đoán không được tính hai lần', () => {
  // mã có một màu 0; đoán bốn màu 0 thì chỉ một đúng chỗ, không có sai chỗ
  eq(E.score([0, 1, 2, 3], [0, 0, 0, 0]), { black: 1, white: 0 });
  // mã có một màu 1 ở ô 2; đoán 1 ở ô 1 và 4: chỉ một sai chỗ
  eq(E.score([0, 1, 2, 3], [1, 4, 4, 1]), { black: 0, white: 1 });
});

test('chấm điểm: lặp ở mã bí mật', () => {
  // mã 0 0 1 1, đoán 0 1 0 1: ô 1 và 4 đúng chỗ; còn 0 và 1 đảo chỗ
  eq(E.score([0, 0, 1, 1], [0, 1, 0, 1]), { black: 2, white: 2 });
  // mã 0 0 0 1, đoán 1 0 2 2: ô 2 đúng chỗ, màu 1 sai chỗ
  eq(E.score([0, 0, 0, 1], [1, 0, 2, 2]), { black: 1, white: 1 });
  // mã 0 0 1 2, đoán 3 3 0 0: hai màu 0 đều sai chỗ
  eq(E.score([0, 0, 1, 2], [3, 3, 0, 0]), { black: 0, white: 2 });
});

test('chấm điểm: lặp ở cả hai bên, đúng chỗ được ưu tiên trước sai chỗ', () => {
  // mã 0 0 1 1 1, đoán 1 1 1 0 2: ô 3 đúng chỗ (1); còn lại mã {0,0,1,1}, đoán {1,1,0} → 3 sai chỗ
  eq(E.score([0, 0, 1, 1, 1], [1, 1, 1, 0, 2]), { black: 1, white: 3 });
  // mã 2 2 2 2 2, đoán 2 3 3 3 2: hai đúng chỗ, không còn gì sai chỗ dù còn ba chốt 2 trong mã
  eq(E.score([2, 2, 2, 2, 2], [2, 3, 3, 3, 2]), { black: 2, white: 0 });
  // mã 0 1 0 1 0, đoán 1 0 1 0 1: ba màu 0 trong mã nhưng đoán chỉ có hai 0 → 2 + hai 1 → 2 = 4 sai chỗ
  eq(E.score([0, 1, 0, 1, 0], [1, 0, 1, 0, 1]), { black: 0, white: 4 });
});

test('chấm điểm: khớp với cách đếm thô trên toàn bộ cặp 4 chốt / 4 màu và mẫu ngẫu nhiên 5 chốt / 8 màu', () => {
  const all = [];
  for (let n = 0; n < 256; n++) all.push([n & 3, (n >> 2) & 3, (n >> 4) & 3, (n >> 6) & 3]);
  for (const s of all) for (const g of all) eq(E.score(s, g), naiveScore(s, g), s + ' / ' + g);
  const rand = E.rng(42);
  for (let k = 0; k < 20000; k++) {
    const s = [0, 1, 2, 3, 4].map(() => Math.floor(rand() * 8));
    const g = [0, 1, 2, 3, 4].map(() => Math.floor(rand() * 8));
    eq(E.score(s, g), naiveScore(s, g), s + ' / ' + g);
  }
});

test('chấm điểm: đối xứng và black + white không vượt số chốt', () => {
  const rand = E.rng(7);
  for (let k = 0; k < 5000; k++) {
    const s = [0, 1, 2, 3, 4].map(() => Math.floor(rand() * 4));
    const g = [0, 1, 2, 3, 4].map(() => Math.floor(rand() * 4));
    const a = E.score(s, g);
    eq(a, E.score(g, s));
    ok(a.black + a.white <= 5);
  }
});

/* ---------------- Mode và mã bí mật ---------------- */

test('hai mode đúng thông số', () => {
  eq(E.MODES.easy, { pegs: 4, colors: 6, repeats: false, guesses: 10 });
  eq(E.MODES.hard, { pegs: 5, colors: 8, repeats: true, guesses: 12 });
  eq(E.MODE_KEYS, ['easy', 'hard']);
});

test('PRNG seed được: cùng seed cùng dãy, khác seed khác dãy', () => {
  const a = E.rng(123);
  const b = E.rng(123);
  const c = E.rng(124);
  const xa = [a(), a(), a()];
  eq(xa, [b(), b(), b()]);
  ok(JSON.stringify(xa) !== JSON.stringify([c(), c(), c()]));
  xa.forEach((x) => ok(x >= 0 && x < 1));
});

test('cùng seed sinh cùng mã', () => {
  eq(E.newGame('hard', 99).secret, E.newGame('hard', 99).secret);
});

test('mã Dễ: 4 chốt, màu 0–5, không lặp', () => {
  for (let s = 1; s <= 500; s++) {
    const code = E.newGame('easy', s).secret;
    eq(code.length, 4);
    code.forEach((c) => ok(Number.isInteger(c) && c >= 0 && c < 6, 'màu ' + c));
    eq(new Set(code).size, 4, 'lặp màu ở seed ' + s);
  }
});

test('mã Khó: 5 chốt, màu 0–7, có lúc lặp, dùng đủ 8 màu', () => {
  let repeats = 0;
  const seen = new Set();
  for (let s = 1; s <= 500; s++) {
    const code = E.newGame('hard', s).secret;
    eq(code.length, 5);
    code.forEach((c) => {
      ok(Number.isInteger(c) && c >= 0 && c < 8, 'màu ' + c);
      seen.add(c);
    });
    if (new Set(code).size < 5) repeats++;
  }
  ok(repeats > 100, 'mã lặp quá ít: ' + repeats);
  eq(seen.size, 8);
});

test('mode lạ thì báo lỗi', () => {
  let threw = false;
  try {
    E.newGame('nightmare', 1);
  } catch (e) {
    threw = true;
  }
  ok(threw);
});

/* ---------------- Điền / xóa chốt ---------------- */

test('ván mới: chưa đoán, hàng đang nhập trống, chưa bắt đầu', () => {
  const g = E.newGame('easy', 5);
  eq([g.mode, g.rows.length, g.current, g.started, E.status(g), E.guessesLeft(g)], ['easy', 0, [null, null, null, null], false, 'play', 10]);
});

test('chạm màu điền vào ô trống đầu tiên và đánh dấu đã bắt đầu', () => {
  let g = E.newGame('hard', 5);
  g = E.place(g, 3);
  eq([g.current, g.started], [[3, null, null, null, null], true]);
  g = E.place(g, 3);
  eq(g.current, [3, 3, null, null, null]);
});

test('chạm ô để xóa, chốt sau đó lấp vào ô trống đầu tiên', () => {
  let g = enter(E.newGame('hard', 5), [1, 2, 3]);
  g = E.clear(g, 1);
  eq(g.current, [1, null, 3, null, null]);
  g = E.place(g, 7);
  eq(g.current, [1, 7, 3, null, null]);
  eq(E.clear(g, 4), g, 'xóa ô trống không đổi gì');
  eq(E.clear(g, 9), g, 'ô ngoài hàng không đổi gì');
});

test('xóa lùi bỏ chốt cuối cùng đã điền', () => {
  let g = enter(E.newGame('hard', 5), [1, 2]);
  g = E.clear(g, 0);
  eq(E.backspace(g).current, [null, null, null, null, null]);
  g = E.place(E.newGame('hard', 5), 4);
  g = E.backspace(E.place(g, 5));
  eq(g.current, [4, null, null, null, null]);
  const empty = E.newGame('easy', 1);
  eq(E.backspace(empty), empty);
});

test('hàng đầy thì không điền thêm; màu ngoài bảng không điền', () => {
  const g = enter(E.newGame('easy', 5), [0, 1, 2, 3]);
  eq(E.isFull(g), true);
  eq(E.place(g, 4), g);
  const fresh = E.newGame('easy', 5);
  eq(E.place(fresh, 6), fresh, 'Dễ chỉ có 6 màu');
  eq(E.place(fresh, -1), fresh);
  eq(E.place(fresh, 1.5), fresh);
});

test('Dễ: không cho điền một màu hai lần trong cùng hàng', () => {
  let g = E.place(E.newGame('easy', 5), 2);
  eq(E.canPlace(g, 2), false);
  eq(E.place(g, 2), g);
  eq(E.canPlace(g, 3), true);
  g = E.clear(g, 0);
  eq(E.canPlace(g, 2), true, 'xóa đi thì dùng lại được');
});

test('không nộp khi hàng chưa đầy', () => {
  const g = enter(E.newGame('easy', 5), [0, 1, 2]);
  eq(E.isFull(g), false);
  eq(E.submit(g), g);
});

/* ---------------- Nộp, thắng, thua ---------------- */

test('nộp lần đoán: chấm điểm, xóa hàng đang nhập, trừ một lượt', () => {
  let g = withSecret('easy', [0, 1, 2, 3]);
  g = E.submit(enter(g, [1, 0, 2, 5]));
  eq(g.rows, [{ code: [1, 0, 2, 5], black: 1, white: 2 }]);
  eq([g.current, E.guessesLeft(g), E.status(g)], [[null, null, null, null], 9, 'play']);
});

test('đoán trúng thì thắng, sau đó không điền / nộp được nữa', () => {
  let g = withSecret('hard', [4, 4, 0, 7, 4]);
  g = E.submit(enter(g, [4, 4, 4, 4, 4]));
  eq(g.rows[0], { code: [4, 4, 4, 4, 4], black: 3, white: 0 });
  g = E.submit(enter(g, [4, 4, 0, 7, 4]));
  eq([E.status(g), E.isOver(g), g.rows.length], ['won', true, 2]);
  eq(E.place(g, 1), g);
  eq(E.clear(g, 0), g);
});

test('đoán trúng ngay lần đầu cũng thắng', () => {
  const g = E.submit(enter(withSecret('easy', [5, 4, 3, 2]), [5, 4, 3, 2]));
  eq(E.status(g), 'won');
});

test('hết lượt mà chưa trúng thì thua', () => {
  let g = withSecret('easy', [0, 1, 2, 3]);
  for (let i = 0; i < 9; i++) g = E.submit(enter(g, [5, 4, 3, 2]));
  eq([E.status(g), E.guessesLeft(g)], ['play', 1]);
  g = E.submit(enter(g, [3, 2, 1, 0]));
  eq([E.status(g), E.isOver(g), E.guessesLeft(g)], ['lost', true, 0]);
  eq(E.place(g, 0), g);
});

test('trúng ở lượt cuối vẫn là thắng', () => {
  let g = withSecret('easy', [0, 1, 2, 3]);
  for (let i = 0; i < 9; i++) g = E.submit(enter(g, [5, 4, 3, 2]));
  g = E.submit(enter(g, [0, 1, 2, 3]));
  eq(E.status(g), 'won');
});

test('hàm thuần: không sửa trạng thái cũ', () => {
  const g = E.newGame('easy', 3);
  const before = JSON.stringify(g);
  E.submit(enter(g, [0, 1, 2, 3]));
  E.clear(E.place(g, 1), 0);
  eq(JSON.stringify(g), before);
});

/* ---------------- Giải được ---------------- */

/** Mọi mã của một mode (theo đúng luật lặp / không lặp); nhớ lại để solver không sinh lại mỗi ván. */
const codeCache = {};
function allCodes(mode) {
  if (codeCache[mode]) return codeCache[mode];
  const { pegs, colors, repeats } = E.MODES[mode];
  const out = [];
  const cur = [];
  (function rec() {
    if (cur.length === pegs) return out.push(cur.slice());
    for (let c = 0; c < colors; c++) {
      if (!repeats && cur.indexOf(c) >= 0) continue;
      cur.push(c);
      rec();
      cur.pop();
    }
  })();
  return (codeCache[mode] = out);
}

/** Solver "đoán mã còn khớp": mỗi lượt chọn một mã còn khớp với mọi phản hồi trước, chơi qua engine. */
function solve(game, rand) {
  let cands = allCodes(game.mode);
  let g = game;
  while (E.status(g) === 'play') {
    const guess = cands[Math.floor(rand() * cands.length)];
    g = E.submit(enter(g, guess));
    const last = g.rows[g.rows.length - 1];
    cands = cands.filter((c) => {
      const s = E.score(c, guess);
      return s.black === last.black && s.white === last.white;
    });
  }
  return g;
}

test('số mã: Dễ 360, Khó 32768', () => {
  eq(allCodes('easy').length, 360);
  eq(allCodes('hard').length, 32768);
});

test('giải được: mọi mã Dễ đều phá được trong 10 lượt', () => {
  const rand = E.rng(2026);
  for (const code of allCodes('easy')) {
    const g = solve(withSecret('easy', code), rand);
    eq(E.status(g), 'won', 'mã ' + code + ' sau ' + g.rows.length + ' lượt');
  }
});

test('giải được: 300 mã Khó sinh từ seed đều phá được trong 12 lượt', () => {
  const rand = E.rng(77);
  for (let s = 1; s <= 300; s++) {
    const g = solve(E.newGame('hard', s), rand);
    eq(E.status(g), 'won', 'seed ' + s + ' sau ' + g.rows.length + ' lượt');
  }
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván', () => {
  let g = withSecret('hard', [1, 1, 2, 3, 7]);
  g = E.submit(enter(g, [1, 2, 3, 4, 5]));
  g = enter(g, [6, 6]);
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))), g);
  const fresh = E.newGame('easy', 8);
  eq(E.fromJSON(E.toJSON(fresh)), fresh);
});

test('khôi phục chấm lại phản hồi, không tin phản hồi trong ván lưu', () => {
  const g = E.submit(enter(withSecret('easy', [0, 1, 2, 3]), [1, 0, 2, 5]));
  const raw = E.toJSON(g);
  eq(raw.rows, [[1, 0, 2, 5]]);
  eq(E.fromJSON(raw).rows[0], { code: [1, 0, 2, 5], black: 1, white: 2 });
});

test('khôi phục ván đã thắng / đã thua vẫn đúng trạng thái', () => {
  const won = E.submit(enter(withSecret('easy', [0, 1, 2, 3]), [0, 1, 2, 3]));
  eq(E.status(E.fromJSON(E.toJSON(won))), 'won');
  let lost = withSecret('easy', [0, 1, 2, 3]);
  for (let i = 0; i < 10; i++) lost = E.submit(enter(lost, [5, 4, 3, 2]));
  eq(E.status(E.fromJSON(E.toJSON(lost))), 'lost');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.place(E.submit(enter(withSecret('easy', [0, 1, 2, 3]), [5, 4, 3, 2])), 1));
  ok(E.fromJSON(good), 'ván mẫu phải hợp lệ');
  const bad = (patch) => Object.assign({}, JSON.parse(JSON.stringify(good)), patch);
  const won = E.toJSON(E.submit(enter(withSecret('easy', [0, 1, 2, 3]), [0, 1, 2, 3])));
  const cases = [
    null,
    1,
    'x',
    {},
    bad({ v: 2 }),
    bad({ mode: 'medium' }),
    bad({ mode: 'constructor' }),
    bad({ secret: [0, 1, 2] }), // thiếu chốt
    bad({ secret: [0, 1, 2, 6] }), // màu ngoài bảng Dễ
    bad({ secret: [0, 1, 1, 3] }), // Dễ không được lặp
    bad({ secret: [0, 1, '2', 3] }),
    bad({ rows: 'abc' }),
    bad({ rows: [[5, 4, 3]] }),
    bad({ rows: [[5, 4, 3, 9]] }),
    bad({ rows: [[0, 1, 2, 3], [5, 4, 3, 2]] }), // còn đoán sau khi đã trúng
    bad({ rows: Array.from({ length: 11 }, () => [5, 4, 3, 2]) }), // quá số lượt
    bad({ current: [1, null, null] }),
    bad({ current: [1, null, null, 7] }),
    bad({ current: [1, 1, null, null] }), // Dễ: lặp trong hàng đang nhập
    bad({ started: 'yes' }),
    bad({ started: false }), // đã có lần đoán mà chưa bắt đầu
    Object.assign({}, won, { current: [1, null, null, null] }), // ván xong mà còn hàng đang nhập
  ];
  cases.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
