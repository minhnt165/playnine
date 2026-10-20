/* Kiểm tra engine Rắn Săn Mồi: chạy `node test.js`
 * - Đi đủ bốn hướng, bỏ qua lệnh quay ngược vào cổ, hàng đợi 2 lần đổi hướng
 * - Ăn mồi thì dài ra, cộng điểm; mồi thưởng hết hạn
 * - Đâm tường (Cổ điển), xuyên tường (Xuyên tường), đâm chướng ngại (Mê cung)
 * - Tự cắn mình, kể cả trường hợp đi vào ô đuôi vừa rời đi là hợp lệ
 * - Mồi không bao giờ sinh trên thân rắn hay chướng ngại
 * - Phủ kín bàn là thắng, lưu và khôi phục qua JSON
 */
const G = require('./engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL ' + name + '\n       ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'nhận ' + a + ', cần ' + b);
}

/** PRNG có seed (mulberry32) để chạy nhiều ván tự động. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rc = (s, i) => [Math.floor(i / s.size), i % s.size];
const head = (s) => rc(s, s.snake[0]);
const cls = { mode: 'classic', size: 15 };

console.log('Rắn Săn Mồi - kiểm tra engine');

/* ---------------- Di chuyển ---------------- */
test('ván mới: rắn dài 3 ở giữa bàn, đi sang phải, mồi không nằm trên rắn', () => {
  G.SIZES.forEach((size) => {
    const s = G.newGame({ size }, mulberry32(size));
    const mid = Math.floor(size / 2);
    eq(s.snake.map((i) => rc(s, i)), [[mid, mid], [mid, mid - 1], [mid, mid - 2]]);
    eq(s.dir, 'right');
    assert(s.food !== null && !s.snake.includes(s.food), 'mồi phải ở ô trống');
  });
});

test('đi đủ bốn hướng', () => {
  const cases = [
    ['right', [7, 8]],
    ['up', [6, 7]],
    ['down', [8, 7]],
  ];
  cases.forEach(([dir, want]) => {
    let s = G.fromSnake(cls, [[7, 7], [7, 6], [7, 5]], { dir: 'right' });
    s = G.turn(s, dir);
    const res = G.step(s);
    assert(res.moved, 'phải đi được');
    eq(head(res.state), want, 'hướng ' + dir);
    eq(res.state.snake.length, 3, 'không ăn thì giữ độ dài');
  });
  // Đi sang trái: rắn đang hướng lên
  let s = G.fromSnake(cls, [[7, 7], [8, 7], [9, 7]], { dir: 'up' });
  s = G.turn(s, 'left');
  const res = G.step(s);
  eq(head(res.state), [7, 6], 'hướng left');
  eq(res.state.dir, 'left');
  eq(res.state.snake.map((i) => rc(s, i)), [[7, 6], [7, 7], [8, 7]], 'thân đi theo đầu, đuôi rời đi');
});

test('bỏ qua lệnh quay ngược vào cổ và lệnh trùng hướng', () => {
  const s = G.fromSnake(cls, [[7, 7], [7, 6], [7, 5]], { dir: 'right' });
  assert(G.turn(s, 'left') === s, 'quay ngược phải bị bỏ qua');
  assert(G.turn(s, 'right') === s, 'trùng hướng phải bị bỏ qua');
  const res = G.step(G.turn(s, 'left'));
  eq(head(res.state), [7, 8], 'vẫn đi thẳng');
  assert(!res.died, 'không được chết vì quay ngược');
});

test('hàng đợi: giữ tối đa 2 lần đổi hướng giữa hai tick', () => {
  let s = G.fromSnake(cls, [[7, 7], [7, 6], [7, 5]], { dir: 'right' });
  s = G.turn(s, 'up');
  s = G.turn(s, 'left'); // lên rồi trái: quay đầu chữ U nhanh không bị mất
  eq(s.queue, ['up', 'left']);
  const full = G.turn(s, 'down');
  assert(full === s, 'hàng đợi đầy thì bỏ qua');
  // Lệnh thứ hai so với lệnh trước trong hàng đợi, không so với hướng đang đi
  let t = G.fromSnake(cls, [[7, 7], [7, 6], [7, 5]], { dir: 'right' });
  t = G.turn(t, 'up');
  eq(G.turn(t, 'down').queue, ['up'], 'xuống ngay sau lên là quay ngược, bỏ qua');
  eq(G.turn(t, 'left').queue, ['up', 'left'], 'trái sau lên là hợp lệ dù ngược hướng đang đi');

  let r = G.step(s);
  eq(head(r.state), [6, 7], 'tick 1 đi lên');
  eq(r.state.queue, ['left']);
  r = G.step(r.state);
  eq(head(r.state), [6, 6], 'tick 2 đi trái');
  eq(r.state.queue, []);
  r = G.step(r.state);
  eq(head(r.state), [6, 5], 'hết hàng đợi thì giữ hướng');
});

/* ---------------- Ăn mồi ---------------- */
test('ăn mồi: dài thêm 1, cộng điểm, sinh mồi mới ở ô trống', () => {
  const s = G.fromSnake(cls, [[7, 7], [7, 6], [7, 5]], { dir: 'right', food: 7 * 15 + 8 });
  const res = G.step(s, mulberry32(1));
  eq(res.ate, 'food');
  eq(res.state.snake.length, 4);
  eq(res.state.snake.map((i) => rc(s, i)), [[7, 8], [7, 7], [7, 6], [7, 5]], 'đuôi đứng yên khi mọc');
  eq(res.state.score, G.FOOD_POINTS);
  eq(res.state.eaten, 1);
  assert(res.state.food !== null && !res.state.snake.includes(res.state.food), 'mồi mới ở ô trống');
  const next = G.step(res.state);
  eq(next.state.snake.length, 4, 'tick sau không mọc thêm');
});

test('mồi thưởng: cộng nhiều điểm hơn, dài thêm 2, hết hạn sau BONUS_MS', () => {
  const bonus = { at: 7 * 15 + 8, ms: G.BONUS_MS, total: G.BONUS_MS };
  const s = G.fromSnake(cls, [[7, 7], [7, 6], [7, 5]], { dir: 'right', food: 0, bonus });
  let res = G.step(s);
  eq(res.ate, 'bonus');
  assert(G.BONUS_POINTS > G.FOOD_POINTS, 'mồi thưởng phải đáng giá hơn');
  eq(res.state.score, G.BONUS_POINTS);
  eq(res.state.bonus, null);
  res = G.step(res.state);
  eq(res.state.snake.length, 5, 'mọc thêm đốt thứ hai ở tick sau');
  res = G.step(res.state);
  eq(res.state.snake.length, 5);

  // Hết hạn: mỗi tick trừ tickMs
  let t = G.fromSnake(Object.assign({ accel: false }, cls), [[7, 7], [7, 6], [7, 5]], {
    dir: 'up',
    food: 0,
    bonus: { at: 14 * 15 + 14, ms: 300, total: G.BONUS_MS },
  });
  const ms = G.tickMs(t);
  let ticks = 0;
  let expired = false;
  while (!expired && ticks < 10) {
    const r = G.step(t);
    t = r.state;
    expired = r.bonusExpired;
    ticks++;
  }
  assert(expired, 'mồi thưởng phải hết hạn');
  eq(ticks, Math.ceil(300 / ms), 'hết hạn đúng số tick');
  eq(t.bonus, null);
});

test('mồi thưởng xuất hiện sau 5..8 mồi thường', () => {
  const rng = mulberry32(7);
  let s = G.newGame({ size: 25, mode: 'wrap' }, rng);
  let foods = 0;
  let spawnedAt = -1;
  for (let k = 0; k < 20 && spawnedAt < 0; k++) {
    // Dịch mồi tới ngay trước đầu rắn để ăn liên tục
    const [r, c] = head(s);
    const v = G.VEC[s.dir];
    const ahead = ((r + v[0] + 25) % 25) * 25 + ((c + v[1] + 25) % 25);
    s = Object.assign({}, s, { food: ahead, bonus: null });
    const res = G.step(s, rng);
    s = res.state;
    foods++;
    if (res.bonusSpawned) spawnedAt = foods;
  }
  assert(spawnedAt >= 5 && spawnedAt <= 8, 'mồi thưởng ra sau ' + spawnedAt + ' mồi');
  assert(!s.snake.includes(s.bonus.at) && s.bonus.at !== s.food, 'mồi thưởng ở ô trống');
});

test('tăng tốc dần theo số mồi, có giới hạn; tắt tăng tốc thì giữ nguyên', () => {
  const s = G.newGame({ speed: 'normal' });
  eq(G.tickMs(s), G.BASE_MS.normal);
  const later = Object.assign({}, s, { eaten: 10 });
  assert(G.tickMs(later) < G.tickMs(s), 'phải nhanh hơn');
  const max = Object.assign({}, s, { eaten: 1000 });
  eq(G.tickMs(max), Math.round(G.BASE_MS.normal * G.ACCEL_MIN));
  eq(G.tickMs(Object.assign({}, later, { accel: false })), G.BASE_MS.normal);
  assert(G.BASE_MS.slow > G.BASE_MS.normal && G.BASE_MS.normal > G.BASE_MS.fast, 'thứ tự mức tốc độ');
});

/* ---------------- Va chạm ---------------- */
test('Cổ điển: đâm tường là thua, cả bốn cạnh', () => {
  const cases = [
    [[[0, 5], [1, 5], [2, 5]], 'up'],
    [[[14, 5], [13, 5], [12, 5]], 'down'],
    [[[5, 0], [5, 1], [5, 2]], 'left'],
    [[[5, 14], [5, 13], [5, 12]], 'right'],
  ];
  cases.forEach(([cells, dir]) => {
    const s = G.fromSnake(cls, cells, { dir });
    const res = G.step(s);
    assert(res.died && res.state.over, 'phải chết khi đi ' + dir);
    eq(res.state.cause, 'wall');
    eq(res.state.snake, s.snake, 'rắn đứng yên khi chết');
    assert(!G.step(res.state).moved, 'ván đã xong thì không đi nữa');
  });
});

test('Xuyên tường: đi qua mép sang phía đối diện, cả bốn cạnh', () => {
  const w = { mode: 'wrap', size: 15 };
  const cases = [
    [[[0, 5], [1, 5], [2, 5]], 'up', [14, 5]],
    [[[14, 5], [13, 5], [12, 5]], 'down', [0, 5]],
    [[[5, 0], [5, 1], [5, 2]], 'left', [5, 14]],
    [[[5, 14], [5, 13], [5, 12]], 'right', [5, 0]],
  ];
  cases.forEach(([cells, dir, want]) => {
    const s = G.fromSnake(w, cells, { dir });
    const res = G.step(s);
    assert(!res.died, 'không được chết khi đi ' + dir);
    eq(head(res.state), want, 'xuyên tường ' + dir);
  });
});

test('Mê cung: đâm chướng ngại là thua; mọi bản đồ chừa chỗ xuất phát và thông nhau', () => {
  G.SIZES.forEach((size) => {
    for (let map = 0; map < G.MAPS.length; map++) {
      const obs = G.obstaclesFor('maze', size, map);
      assert(obs.length >= 8, 'bản đồ ' + map + ' phải có chướng ngại');
      const s = G.newGame({ mode: 'maze', size, map }, mulberry32(map));
      s.snake.forEach((i) => assert(!obs.includes(i), 'rắn xuất phát trên chướng ngại'));
      // Ô trống thông nhau (BFS từ đầu rắn)
      const blocked = new Set(obs);
      const seen = new Set([s.snake[0]]);
      const stack = [s.snake[0]];
      while (stack.length) {
        const i = stack.pop();
        const r = Math.floor(i / size);
        const c = i % size;
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([a, b]) => {
          const j = a * size + b;
          if (a >= 0 && a < size && b >= 0 && b < size && !blocked.has(j) && !seen.has(j)) {
            seen.add(j);
            stack.push(j);
          }
        });
      }
      eq(seen.size, size * size - obs.length, 'bản đồ ' + map + ' cỡ ' + size + ' phải thông nhau');
    }
  });
  eq(G.obstaclesFor('classic', 20, 0), [], 'Cổ điển không có chướng ngại');
  eq(G.obstaclesFor('wrap', 20, 0), [], 'Xuyên tường không có chướng ngại');

  // Đi thẳng vào chướng ngại đầu tiên của bản đồ Hành lang (hàng q)
  const size = 20;
  const q = Math.floor(size / 4);
  const s = G.fromSnake({ mode: 'maze', size, map: 1 }, [[q + 1, 8], [q + 2, 8], [q + 3, 8]], { dir: 'up' });
  assert(s.obstacles.includes(q * size + 8), 'ô phía trước phải là chướng ngại');
  const res = G.step(s);
  assert(res.died, 'phải chết');
  eq(res.state.cause, 'obstacle');
  // Mê cung vẫn có tường
  const edge = G.fromSnake({ mode: 'maze', size, map: 1 }, [[10, 19], [10, 18], [10, 17]], { dir: 'right' });
  eq(G.step(edge).state.cause, 'wall');
});

test('tự cắn mình là thua', () => {
  // Rắn dài 5 cuộn lại: đầu (7,7) quay xuống cắn đốt (8,7)
  const s = G.fromSnake(cls, [[7, 7], [7, 8], [8, 8], [8, 7], [8, 6]], { dir: 'left' });
  const res = G.step(G.turn(s, 'down'));
  assert(res.died, 'phải chết');
  eq(res.state.cause, 'self');
});

test('đi vào ô đuôi đang rời đi là hợp lệ; nếu đang mọc dài thì là cắn đuôi', () => {
  // Vòng 2x2: đầu (7,7), đuôi (8,7). Đi xuống vào đúng ô đuôi vừa rời
  const cells = [[7, 7], [7, 8], [8, 8], [8, 7]];
  const s = G.fromSnake(cls, cells, { dir: 'left' });
  const res = G.step(G.turn(s, 'down'));
  assert(!res.died, 'không được chết');
  eq(head(res.state), [8, 7]);
  eq(res.state.snake.length, 4);
  // Chạy vòng tròn mãi không chết
  let t = res.state;
  const loop = ['right', 'up', 'left', 'down'];
  for (let k = 0; k < 12; k++) {
    const r = G.step(G.turn(t, loop[k % 4]));
    assert(!r.died, 'vòng tròn tick ' + k);
    t = r.state;
  }
  // Đang chờ mọc thêm đốt: đuôi không rời đi nên đâm vào là chết
  const growing = G.fromSnake(cls, cells, { dir: 'left', grow: 1 });
  const g = G.step(G.turn(growing, 'down'));
  assert(g.died, 'đang mọc dài thì đuôi đứng yên');
  eq(g.state.cause, 'self');
});

/* ---------------- Sinh mồi ---------------- */
test('mồi không bao giờ sinh trên thân rắn hay chướng ngại (2.000 lần, bàn gần kín)', () => {
  const rng = mulberry32(42);
  for (let k = 0; k < 2000; k++) {
    // Mồi của ván mới (mọi chế độ / bản đồ) không nằm trên rắn / chướng ngại
    const base = G.newGame({ mode: G.MODES[k % 3], size: G.SIZES[k % 3], map: k % G.MAPS.length }, rng);
    assert(!base.snake.includes(base.food) && !base.obstacles.includes(base.food), 'mồi ván mới');

    // Bàn gần kín: rắn chạy theo đường zic-zắc, chỉ còn `keep` ô trống sau khi ăn mồi.
    // Mồi mới và mồi thưởng (bonusIn = 1 nên ra ngay) phải nằm đúng trong các ô còn trống.
    const n = G.SIZES[k % 3];
    const path = [];
    for (let r = 0; r < n; r++) for (let j = 0; j < n; j++) path.push(r * n + (r % 2 ? n - 1 - j : j));
    const keep = 1 + Math.floor(rng() * 4);
    const L = n * n - 1 - keep;
    const a = path[L - 1];
    const b = path[L];
    const dir = b === a + 1 ? 'right' : b === a - 1 ? 'left' : 'down';
    const s = G.fromSnake({ mode: 'classic', size: n }, path.slice(0, L).reverse(), { dir, food: b, bonusIn: 1 });
    const res = G.step(s, rng);
    eq(res.ate, 'food');
    const free = path.slice(L + 1);
    assert(free.includes(res.state.food), 'mồi mới phải ở ô trống: ' + res.state.food);
    if (keep >= 2) {
      assert(res.bonusSpawned, 'còn chỗ thì ra mồi thưởng');
      assert(free.includes(res.state.bonus.at) && res.state.bonus.at !== res.state.food, 'mồi thưởng phải ở ô trống');
    } else {
      eq(res.state.bonus, null, 'hết chỗ thì không ra mồi thưởng');
    }
  }
  // Ăn liên tục trên bàn nhỏ: mọi mồi / mồi thưởng sinh ra đều ở ô trống
  for (let seed = 1; seed <= 30; seed++) {
    const r2 = mulberry32(seed);
    let s = G.newGame({ mode: 'maze', size: 15, map: seed % 4 }, r2);
    for (let k = 0; k < 400 && !s.over; k++) {
      // Chọn hướng an toàn ngẫu nhiên (ưu tiên hướng về phía mồi)
      const n = s.size;
      const [r, c] = head(s);
      const opts = G.DIRS.filter((d) => {
        if (d === G.OPPOSITE[s.dir]) return false;
        const a = r + G.VEC[d][0];
        const b = c + G.VEC[d][1];
        if (a < 0 || a >= n || b < 0 || b >= n) return false;
        const j = a * n + b;
        return !s.obstacles.includes(j) && !s.snake.slice(0, -1).includes(j);
      });
      if (!opts.length) break;
      const fr = Math.floor(s.food / n);
      const fc = s.food % n;
      const toward = opts.filter((d) => (d === 'up' && fr < r) || (d === 'down' && fr > r) || (d === 'left' && fc < c) || (d === 'right' && fc > c));
      const pool = toward.length && r2() < 0.8 ? toward : opts;
      const d = pool[Math.floor(r2() * pool.length)];
      const res = G.step(G.turn(s, d), r2);
      s = res.state;
      if (s.over) break;
      const body = new Set(s.snake);
      assert(s.food === null || (!body.has(s.food) && !s.obstacles.includes(s.food)), 'mồi trên rắn / chướng ngại');
      if (s.bonus) assert(!body.has(s.bonus.at) && !s.obstacles.includes(s.bonus.at) && s.bonus.at !== s.food, 'mồi thưởng sai chỗ');
      eq(new Set(s.snake).size, s.snake.length, 'thân rắn không trùng ô');
    }
  }
});

/* ---------------- Thắng ---------------- */
test('phủ kín bàn là thắng', () => {
  // Đường zic-zắc qua toàn bộ bàn 15x15; rắn chiếm 224 ô, mồi ở ô cuối
  const n = 15;
  const path = [];
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) path.push(r * n + (r % 2 ? n - 1 - k : k));
  }
  const last = path[path.length - 1];
  const snake = path.slice(0, -1).reverse(); // đầu rắn là ô kề ô cuối
  const s = G.fromSnake(cls, snake, { dir: 'right', food: last });
  eq(G.freeCells(Object.assign({}, s, { food: null })).length, 1, 'chỉ còn một ô trống');
  const res = G.step(s);
  assert(res.won && res.state.won && res.state.over, 'phải thắng');
  eq(res.state.snake.length, n * n);
  eq(res.state.food, null);
  eq(res.state.cause, null);

  // Mê cung: kín mọi ô không phải chướng ngại cũng là thắng
  const m = G.fromSnake({ mode: 'maze', size: 15, map: 1 }, [0]);
  eq(G.capacity(m), 15 * 15 - m.obstacles.length);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu và khôi phục qua JSON', () => {
  const rng = mulberry32(99);
  let s = G.newGame({ mode: 'maze', speed: 'fast', size: 25, map: 3, accel: false }, rng);
  s = G.turn(s, 'up');
  for (let k = 0; k < 3; k++) s = G.step(s, rng).state;
  s = Object.assign({}, s, { bonus: { at: G.freeCells(s)[5], ms: 2100, total: G.BONUS_MS }, score: 1240, eaten: 7, grow: 1 });
  s = G.turn(s, 'left');
  const back = G.restore(JSON.parse(JSON.stringify(s)));
  eq(back, s, 'khôi phục y nguyên');
  // Hai state đi tiếp giống hệt nhau
  eq(G.step(back, mulberry32(5)).state, G.step(s, mulberry32(5)).state, 'đi tiếp giống nhau');

  // Xuyên tường: thân rắn nối qua mép vẫn hợp lệ
  const w = G.fromSnake({ mode: 'wrap', size: 15 }, [[7, 0], [7, 14], [7, 13]], { dir: 'right', food: 0 });
  assert(G.restore(JSON.parse(JSON.stringify(w))), 'thân nối qua mép khi xuyên tường');
  const c2 = Object.assign({}, w, { mode: 'classic' });
  eq(G.restore(JSON.parse(JSON.stringify(c2))), null, 'Cổ điển thì thân đứt là dữ liệu hỏng');
});

test('khôi phục: dữ liệu hỏng trả về null', () => {
  const s = G.newGame({}, mulberry32(3));
  const bad = [
    null,
    42,
    'abc',
    Object.assign({}, s, { v: 2 }),
    Object.assign({}, s, { mode: 'x' }),
    Object.assign({}, s, { size: 17 }),
    Object.assign({}, s, { speed: 'turbo' }),
    Object.assign({}, s, { dir: 'north' }),
    Object.assign({}, s, { snake: [] }),
    Object.assign({}, s, { snake: [0, 0, 1] }),
    Object.assign({}, s, { snake: [0, 5] }),
    Object.assign({}, s, { snake: [-1] }),
    Object.assign({}, s, { food: s.snake[1] }),
    Object.assign({}, s, { food: 99999 }),
    Object.assign({}, s, { bonus: { at: s.snake[0], ms: 100, total: 5000 } }),
  ];
  bad.forEach((b, k) => eq(G.restore(b), null, 'trường hợp ' + k));
  // Mê cung: rắn trên chướng ngại là dữ liệu hỏng
  const m = G.newGame({ mode: 'maze', map: 1 }, mulberry32(3));
  eq(G.restore(Object.assign({}, m, { snake: [m.obstacles[0]] })), null, 'rắn trên chướng ngại');
  // Hàng đợi quá dài bị cắt bớt, giá trị lạ bị bỏ
  const q = G.restore(Object.assign({}, s, { queue: ['up', 'bad', 'left', 'down'] }));
  eq(q.queue, ['up', 'left']);
});

/* ---------------- Chơi ngẫu nhiên ---------------- */
test('300 ván chơi ngẫu nhiên luôn hợp lệ', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = mulberry32(seed * 31);
    const mode = G.MODES[seed % 3];
    let s = G.newGame({ mode, size: G.SIZES[seed % 3], map: seed % 4, speed: G.SPEEDS[seed % 3] }, rng);
    for (let k = 0; k < 500 && !s.over; k++) {
      if (rng() < 0.3) s = G.turn(s, G.DIRS[Math.floor(rng() * 4)]);
      if (rng() < 0.1) s = G.turn(s, G.DIRS[Math.floor(rng() * 4)]);
      assert(s.queue.length <= G.MAX_QUEUE, 'hàng đợi quá dài');
      const prevLen = s.snake.length;
      const res = G.step(s, rng);
      s = res.state;
      if (res.moved) {
        assert(s.snake.length === prevLen || s.snake.length === prevLen + 1, 'mỗi tick dài thêm tối đa 1');
        for (let i = 1; i < s.snake.length; i++) {
          assert(G.adjacent(s.snake[i - 1], s.snake[i], s.size, mode === 'wrap'), 'thân rắn phải liền');
        }
      }
      assert(G.restore(JSON.parse(JSON.stringify(s))) !== null, 'state phải khôi phục được');
    }
  }
});

console.log('\n' + passed + ' đạt, ' + failed + ' lỗi');
if (failed) process.exit(1);
