/* Kiểm tra engine Phá Gạch: chạy `node test.js`
 * - Góc nảy theo vị trí chạm thanh, nảy tường / trần, góc tối thiểu so với phương ngang
 * - Đập gạch từ bốn phía và vào góc, gạch nhiều lần đập, gạch thép không cần phá để qua màn
 * - Không xuyên gạch / thanh khi bóng cực nhanh (hàng nghìn bước ngẫu nhiên)
 * - Từng vật phẩm và lúc hết hạn, mất mạng, hết mạng, qua màn
 * - Dữ liệu 10 màn hợp lệ, lưu và khôi phục qua JSON
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

function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg ? msg + ': ' : '') + 'nhận ' + a + ', cần ' + b + ' ± ' + tol);
}

/** PRNG có seed (mulberry32) cho các phép thử ngẫu nhiên. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = E.BALL_R;
const deg = (r) => (r * 180) / Math.PI;

/** Ván không có gạch nào (thêm gạch bằng tay), bóng đang bay. */
function emptyGame(seed) {
  const s = E.newGame({ seed: seed || 1 });
  s.bricks = [];
  s.phase = 'play';
  s.balls = [];
  return s;
}
/** Gạch đơn ở toạ độ tuỳ ý (không theo lưới) để thử va chạm. */
function brick(x, y, kind, hp) {
  const k = kind || 'n';
  const max = k === 's' ? hp || 2 : 1;
  return { c: 0, r: 0, x, y, w: E.BRICK_W, h: E.BRICK_H, kind: k, color: k === 'n' ? 'r' : k, hp: max, max, drop: false };
}
/** Gạch cứng "không bao giờ vỡ" ở góc trên phải: giữ cho ván không qua màn khi chạy step. */
function keeper() {
  const k = brick(E.W - E.BRICK_W, 0, 's', 3);
  k.hp = 1e9;
  return k;
}
function ball(x, y, vx, vy) {
  return { x, y, vx, vy, stuck: false, off: 0, stall: 0 };
}
/** Một quả bóng đi dt giây không chuẩn hoá tốc độ (thử va chạm thuần). */
function fly(s, b, dt) {
  const ev = E.emptyEvents();
  E.advanceBall(s, b, dt, ev);
  return ev;
}
/** Chạy step nhiều lần cho tới khi điều kiện đúng (tối đa n bước). */
function runUntil(s, cond, n, input) {
  const all = [];
  for (let i = 0; i < (n || 2000); i++) {
    const ev = E.step(s, input || {});
    all.push(ev);
    if (cond(ev, s)) return all;
  }
  throw new Error('điều kiện không xảy ra sau ' + (n || 2000) + ' bước');
}

console.log('Phá Gạch - kiểm tra engine');

/* ---------------- Dữ liệu màn ---------------- */
test('10 màn: kích thước, ký tự hợp lệ, có gạch phá được, không có hàng thép kín', () => {
  assert(E.LEVELS.length >= 10, 'cần ít nhất 10 màn');
  eq(E.LEVEL_NAMES.length, E.LEVELS.length, 'mỗi màn một tên');
  E.LEVELS.forEach((rows, i) => {
    assert(rows.length >= 1 && rows.length <= E.MAX_ROWS, 'màn ' + (i + 1) + ': số hàng');
    rows.forEach((line, r) => {
      eq(line.length, E.COLS, 'màn ' + (i + 1) + ' hàng ' + r);
      assert(/^[.roygcbpROYGCBP23#]+$/.test(line), 'màn ' + (i + 1) + ' hàng ' + r + ': ký tự lạ');
      assert(line !== '#'.repeat(E.COLS), 'màn ' + (i + 1) + ': hàng thép kín');
    });
    const bricks = E.parseLevel(rows);
    assert(bricks.some((b) => b.kind !== 'x'), 'màn ' + (i + 1) + ': không có gạch phá được');
    // Gạch nằm trong sân, phía trên thanh đỡ khá xa
    bricks.forEach((b) => {
      assert(b.x >= 0 && b.x + b.w <= E.W && b.y >= E.GRID_Y, 'gạch ra ngoài sân');
      assert(b.y + b.h < E.PADDLE_Y - 150, 'gạch quá sát thanh đỡ');
    });
  });
});

test('mọi viên gạch phá được đều tới được (thép không bao kín ô nào)', () => {
  E.LEVELS.forEach((rows, i) => {
    // Loang từ hàng ngay dưới lưới, đi qua ô trống và ô gạch phá được (phá rồi thì thông), chặn ở thép
    const n = rows.length;
    const open = (r, c) => r >= 0 && r <= n && c >= 0 && c < E.COLS && (r === n || rows[r][c] !== '#');
    const seen = new Set();
    const queue = [];
    for (let c = 0; c < E.COLS; c++) {
      queue.push([n, c]);
      seen.add(n * 100 + c);
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
        const rr = r + dr;
        const cc = c + dc;
        if (!open(rr, cc) || seen.has(rr * 100 + cc)) return;
        seen.add(rr * 100 + cc);
        queue.push([rr, cc]);
      });
    }
    E.parseLevel(rows).forEach((b) => {
      if (b.kind !== 'x') assert(seen.has(b.r * 100 + b.c), 'màn ' + (i + 1) + ': gạch ở hàng ' + b.r + ' cột ' + b.c + ' bị bao kín');
    });
  });
});

test('gạch: thường 1 lần, cứng 2 / 3 lần, thép; chữ hoa chắc chắn rơi vật phẩm', () => {
  const [a, b, c, d, e] = E.parseLevel(['r23#R.....']);
  eq([a.kind, a.hp, a.drop], ['n', 1, false]);
  eq([b.kind, b.hp, b.max], ['s', 2, 2]);
  eq([c.kind, c.hp, c.max], ['s', 3, 3]);
  eq(d.kind, 'x');
  eq([e.kind, e.color, e.drop], ['n', 'r', true]);
  eq(E.parseLevel(['..........']).length, 0);
});

/* ---------------- Thanh đỡ và phóng bóng ---------------- */
test('ván mới: 3 mạng, màn 1, bóng chờ trên thanh, bóng đi theo thanh', () => {
  const s = E.newGame({ seed: 5 });
  eq([s.lives, s.level, s.phase, s.balls.length], [3, 1, 'serve', 1]);
  assert(s.balls[0].stuck, 'bóng phải chờ trên thanh');
  near(s.balls[0].y, E.PADDLE_Y - R - 0.5, 1e-9);
  E.step(s, { dir: 1 });
  assert(s.paddle.x > E.W / 2, 'thanh phải sang phải');
  near(s.balls[0].x - s.paddle.x, s.balls[0].off, 1e-9, 'bóng đi theo thanh');
  for (let i = 0; i < 300; i++) E.step(s, { dir: 1 });
  near(s.paddle.x, E.W - s.paddle.w / 2, 1e-9, 'thanh dừng ở tường phải');
  for (let i = 0; i < 300; i++) E.step(s, { target: -500 });
  near(s.paddle.x, s.paddle.w / 2, 1e-9, 'kéo quá tường trái thì dừng ở tường');
  eq(s.phase, 'serve', 'chưa phóng thì vẫn chờ');
});

test('phóng bóng bằng input.launch: đi lên, đúng tốc độ màn 1', () => {
  const s = E.newGame({ seed: 5 });
  const ev = E.step(s, { launch: true });
  assert(ev.launched && s.phase === 'play', 'phải phóng');
  const b = s.balls[0];
  assert(b.vy < 0 && b.vx > 0, 'phóng chéo lên bên phải');
  near(Math.hypot(b.vx, b.vy), E.BASE_SPEED, 1e-6);
  assert(!E.launch(s), 'không phóng lại khi bóng đang bay');
});

test('góc nảy theo vị trí chạm thanh: giữa đi thẳng, mép lệch 60°, đối xứng', () => {
  const center = E.bounceDir(0);
  near(center[0], 0, 1e-12);
  near(center[1], -1, 1e-12);
  const right = E.bounceDir(1);
  near(deg(Math.atan2(right[0], -right[1])), 60, 1e-9);
  const left = E.bounceDir(-1);
  near(left[0], -right[0], 1e-12);
  near(deg(Math.atan2(E.bounceDir(0.5)[0], -E.bounceDir(0.5)[1])), 30, 1e-9);
  near(E.bounceDir(5)[0], right[0], 1e-12, 'ngoài mép thì kẹp ở 60°');
  // Thực tế: bóng rơi thẳng xuống các điểm khác nhau trên thanh
  [-0.9, -0.5, 0, 0.4, 0.9].forEach((rel) => {
    const s = emptyGame();
    s.bricks = [brick(0, 0, 'x')]; // giữ ván không qua màn
    const px = s.paddle.x;
    const b = ball(px + rel * (s.paddle.w / 2), E.PADDLE_Y - 40, 0, 300);
    s.balls = [b];
    const ev = fly(s, b, 0.2);
    eq(ev.paddle, 1, 'phải chạm thanh');
    assert(b.vy < 0, 'phải nảy lên');
    const ang = deg(Math.atan2(b.vx, -b.vy));
    near(ang, rel * 60, 0.5, 'góc nảy ở rel ' + rel);
  });
});

test('chạm thanh: ngắt chuỗi và tăng tốc nhẹ có giới hạn', () => {
  const s = emptyGame();
  s.bricks = [brick(0, 0, 'x')];
  s.chain = 7;
  for (let i = 0; i < 40; i++) {
    const b = ball(s.paddle.x, E.PADDLE_Y - 20, 0, 300);
    s.balls = [b];
    fly(s, b, 0.1);
  }
  eq(s.chain, 0);
  near(s.ramp, E.RAMP_MAX, 1e-9);
  assert(E.ballSpeed(s) <= E.MAX_SPEED, 'không quá tốc độ tối đa');
});

/* ---------------- Tường, trần, góc tối thiểu ---------------- */
test('nảy tường trái, phải và trần', () => {
  const s = emptyGame();
  let b = ball(20, 300, -300, -100);
  fly(s, b, 0.1);
  assert(b.vx > 0 && b.x >= R, 'nảy tường trái');
  near(b.x, R + (300 * 0.1 - 14), 1e-3, 'đi tiếp phần thời gian còn lại');
  b = ball(E.W - 20, 300, 300, -100);
  fly(s, b, 0.1);
  assert(b.vx < 0 && b.x <= E.W - R, 'nảy tường phải');
  b = ball(200, 20, 100, -300);
  const ev = fly(s, b, 0.1);
  assert(b.vy > 0 && b.y >= R, 'nảy trần');
  eq(ev.wall, 1);
  // Góc vào tường phải ở góc sân: nảy cả hai trục
  b = ball(E.W - 10, 10, 300, -300);
  fly(s, b, 0.05);
  assert(b.vx < 0 && b.vy > 0, 'góc sân: nảy cả hai trục');
});

test('góc tối thiểu: bóng gần như ngang bị ép lệch ít nhất 15°', () => {
  const minY = Math.sin(E.MIN_ANGLE);
  [[1, 0], [-1, 0.01], [1, -0.05], [-1, 0.2]].forEach(([vx, vy]) => {
    const b = ball(200, 300, vx, vy);
    E.aim(b, 400);
    near(Math.hypot(b.vx, b.vy), 400, 1e-9, 'giữ độ lớn');
    assert(Math.abs(b.vy) / 400 >= minY - 1e-12, 'lệch ít nhất 15°');
    eq(Math.sign(b.vx), Math.sign(vx), 'giữ chiều ngang');
  });
  const b = ball(200, 300, 0, 0.5);
  E.aim(b, 400);
  near(b.vy, 400, 1e-9, 'bóng dọc thì giữ nguyên');
  // Chạy thật: bóng bay ngang giữa hai tường luôn bị ép góc trong step
  const s = emptyGame();
  s.bricks = [keeper()];
  s.balls = [ball(200, 300, 400, 0)];
  for (let i = 0; i < 1200; i++) {
    E.step(s, { target: s.balls.length ? s.balls[0].x + 20 : 200 });
    if (!s.balls.length) break;
    const v = s.balls[0];
    assert(Math.abs(v.vy) / Math.hypot(v.vx, v.vy) >= minY - 1e-9, 'bước ' + i + ': bóng quá ngang');
  }
});

test('bóng nảy mãi giữa thép và tường thì bị bẻ hướng', () => {
  const s = emptyGame(9);
  // Hộp thép kín (trừ đáy), bóng đi thẳng đứng nảy mãi giữa trần và thép
  s.bricks = [brick(100, 200, 'x'), keeper()];
  const b = ball(119, 100, 0, 300);
  s.balls = [b];
  let turned = false;
  for (let i = 0; i < 4000 && !turned; i++) {
    E.step(s, { target: 300 });
    if (Math.abs(s.balls[0].vx) > 1) turned = true;
  }
  assert(turned, 'bóng phải bị bẻ hướng sau ' + E.STALL_BOUNCES + ' lần nảy vô ích');
});

/* ---------------- Gạch ---------------- */
test('đập gạch từ dưới, trên, trái, phải', () => {
  const cases = [
    { name: 'dưới', b: [119, 260, 0, -300], check: (b) => b.vy > 0 && b.y >= 218 + R - 1e-6 },
    { name: 'trên', b: [119, 140, 0, 300], check: (b) => b.vy < 0 && b.y <= 200 - R + 1e-6 },
    { name: 'trái', b: [60, 209, 300, 10], check: (b) => b.vx < 0 && b.x <= 100 - R + 1e-6 },
    { name: 'phải', b: [180, 209, -300, 10], check: (b) => b.vx > 0 && b.x >= 138 + R - 1e-6 },
  ];
  cases.forEach((c) => {
    const s = emptyGame();
    s.bricks = [brick(100, 200), brick(0, 0, 'x')];
    const b = ball.apply(null, c.b);
    const ev = fly(s, b, 0.25);
    eq(ev.broken.length, 1, c.name + ': phải vỡ');
    assert(c.check(b), c.name + ': nảy sai, bóng ' + JSON.stringify(b));
    eq(E.breakableLeft(s), 0, c.name);
  });
});

test('đập vào góc gạch: pháp tuyến chéo, nảy ra xa góc', () => {
  // Bóng bay chéo lên trái trúng góc dưới phải của viên gạch [100,138]x[200,218]
  const hit = E.sweepRect(150, 230, -20, -20, R, 100, 200, 138, 218);
  assert(hit && hit.corner, 'phải trúng góc');
  near(hit.nx, Math.SQRT1_2, 1e-6);
  near(hit.ny, Math.SQRT1_2, 1e-6);
  const s = emptyGame();
  s.bricks = [brick(100, 200), brick(0, 0, 'x')];
  const b = ball(150, 230, -300, -300);
  const ev = fly(s, b, 0.2);
  eq(ev.broken.length, 1);
  assert(b.vx > 0 && b.vy > 0, 'trúng thẳng góc thì bật ngược lại');
  // Sượt qua góc: không chạm
  // Đường thẳng x + y = 367 đi qua ô vuông góc của hình nở r nhưng cách đỉnh góc 7,8 > r
  eq(E.sweepRect(160, 207, -20, 20, R, 100, 200, 138, 218), null, 'sượt qua góc');
  eq(E.sweepRect(127, 240, 20, -20, R, 100, 200, 138, 218), null, 'sượt qua góc (chiều ngược)');
});

test('khe giữa hai viên kề nhau: nảy phẳng, chỉ vỡ một viên', () => {
  const s = emptyGame();
  s.bricks = [brick(100, 200), brick(138, 200), brick(0, 0, 'x')];
  const b = ball(138, 260, 0.0001, -300);
  const ev = fly(s, b, 0.15);
  eq(ev.broken.length, 1, 'chỉ một viên vỡ');
  assert(b.vy > 0, 'nảy xuống');
  assert(Math.abs(b.vx) < 1, 'không bị bẻ chéo ở khe');
});

test('góc trong (hai viên vuông góc): nảy cả hai trục, vỡ cả hai', () => {
  const s = emptyGame();
  // Viên trên [100,138]x[200,218], viên trái [62,100]x[218,236]
  s.bricks = [brick(100, 200), brick(62, 218), brick(0, 0, 'x')];
  const b = ball(125, 250, -200, -200);
  const ev = fly(s, b, 0.3);
  eq(ev.broken.length, 2);
  assert(b.vx > 0 && b.vy > 0, 'bật ngược ra khỏi góc trong');
});

test('gạch cứng: 2 và 3 lần đập, nứt rồi mới vỡ, cộng điểm đúng', () => {
  [2, 3].forEach((n) => {
    const s = emptyGame();
    const k = brick(100, 200, 's', n);
    s.bricks = [k, brick(0, 0, 'x')];
    for (let i = 1; i <= n; i++) {
      const b = ball(119, 260, 0, -300);
      const ev = fly(s, b, 0.2);
      if (i < n) {
        eq([ev.cracked.length, ev.broken.length, k.hp], [1, 0, n - i], 'lần đập ' + i);
        assert(b.vy > 0, 'gạch chưa vỡ thì bóng nảy lại');
      } else {
        eq([ev.broken.length, E.breakableLeft(s)], [1, 0], 'lần cuối phải vỡ');
      }
    }
    eq(s.score, E.HIT_POINTS * (n - 1) + E.BREAK_POINTS[n], 'điểm gạch ' + n + ' lần');
  });
});

test('gạch thép: không vỡ, không tính khi qua màn', () => {
  const s = emptyGame();
  s.bricks = [brick(100, 200, 'x'), brick(300, 100)];
  for (let i = 0; i < 5; i++) {
    const b = ball(119, 260, 0, -300);
    const ev = fly(s, b, 0.2);
    eq([ev.steel, ev.broken.length], [1, 0]);
    assert(b.vy > 0, 'thép làm bóng nảy');
  }
  eq(s.bricks.length, 2);
  eq(E.breakableLeft(s), 1, 'chỉ đếm gạch phá được');
  // Phá viên thường cuối cùng: qua màn dù thép còn
  s.balls = [ball(319, 160, 0, -300)];
  const evs = runUntil(s, (ev) => ev.cleared, 200);
  const last = evs[evs.length - 1];
  eq(s.phase, 'clear');
  eq(last.bonus, E.CLEAR_BONUS * s.level);
  eq(s.bricks.length, 1, 'thép vẫn còn');
});

test('chuỗi: nhân điểm tăng theo số lần đập liên tiếp, tối đa x5', () => {
  eq([1, 4, 5, 8, 9, 13, 17, 100].map(E.multFor), [1, 1, 2, 2, 3, 4, 5, 5]);
  const s = emptyGame();
  s.chain = 4; // lần đập kế là thứ 5: x2
  s.bricks = [brick(100, 200), brick(0, 0, 'x')];
  const ev = fly(s, ball(119, 260, 0, -300), 0.2);
  eq(ev.broken[0].mult, 2);
  eq(ev.broken[0].points, E.BREAK_POINTS[1] * 2);
  eq(s.bestChain, 5);
});

/* ---------------- Không xuyên gạch khi bóng nhanh ---------------- */
test('không xuyên gạch / thanh: 300 lần thả bóng cực nhanh, kiểm tra từng bước', () => {
  const rng = mulberry32(42);
  let hits = 0;
  for (let round = 0; round < 300; round++) {
    const s = E.newGame({ seed: round + 1, level: 1 + (round % 10) });
    s.phase = 'play';
    // Mọi gạch thành thép để bóng nảy mãi trong lưới mà không làm đổi hình
    s.bricks.forEach((k) => (k.kind = 'x'));
    // Thêm sàn thép kín bề ngang để bóng bị nhốt giữa lưới gạch và sàn
    s.bricks.push({ c: 0, r: 0, x: 0, y: 470, w: E.W, h: 18, kind: 'x', color: 'x', hp: 1, max: 1, drop: false });
    // Đặt bóng ở chỗ trống phía dưới lưới, hướng ngẫu nhiên, tốc độ 2.000–30.000 px/s
    const speed = 2000 + rng() * 28000;
    const a = rng() * Math.PI * 2;
    const b = ball(R + rng() * (E.W - 2 * R), 220 + rng() * 240, Math.cos(a) * speed, Math.sin(a) * speed);
    s.balls = [b];
    for (let i = 0; i < 120; i++) {
      const ev = fly(s, b, 1 / 120);
      hits += ev.steel;
      assert(b.x >= R - 1e-6 && b.x <= E.W - R + 1e-6 && b.y >= R - 1e-6, 'bóng ra ngoài tường');
      s.bricks.forEach((k) => {
        assert(!E.overlaps(b.x, b.y, R - 0.01, k.x, k.y, k.x + k.w, k.y + k.h), 'bóng lọt vào gạch (vòng ' + round + ', bước ' + i + ')');
      });
      const pr = E.paddleRect(s);
      assert(!E.overlaps(b.x, b.y, R - 0.01, pr[0], pr[1], pr[2], pr[3]), 'bóng lọt vào thanh');
      assert(b.y < 470, 'bóng xuyên qua sàn thép');
    }
  }
  assert(hits > 3000, 'phải có nhiều lần chạm gạch để phép thử có ý nghĩa');
});

test('bóng lao cực nhanh xuống thanh (500 hướng ngẫu nhiên) luôn nảy lên, không xuyên', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const s = emptyGame();
    s.bricks = [];
    s.paddle.x = 60 + rng() * 280;
    const pr = E.paddleRect(s);
    // Chọn điểm đáp trên mặt thanh rồi lùi ngược lên theo hướng ngẫu nhiên (lệch tối đa 50°)
    const land = pr[0] + rng() * (pr[2] - pr[0]);
    const a = (rng() - 0.5) * (100 * Math.PI) / 180;
    const ux = Math.sin(a);
    const uy = Math.cos(a);
    const dist = 30 + rng() * 150;
    const speed = 1000 + rng() * 59000;
    const b = ball(land - ux * dist, pr[1] - R - uy * dist, ux * speed, uy * speed);
    if (b.x < R || b.x > E.W - R) continue;
    let bounced = false;
    for (let k = 0; k < 400 && !bounced; k++) {
      const ev = fly(s, b, 1 / 120);
      assert(!E.overlaps(b.x, b.y, R - 0.01, pr[0], pr[1], pr[2], pr[3]), 'bóng lọt vào thanh');
      if (ev.paddle) bounced = true;
      assert(b.y < E.H, 'lần ' + i + ': bóng xuyên qua thanh (tốc độ ' + Math.round(speed) + ')');
    }
    assert(bounced, 'lần ' + i + ': phải chạm thanh');
  }
});

test('thanh trượt ngang vào bóng đang rơi sát mặt thanh: bóng được đẩy lên và nảy', () => {
  const s = emptyGame();
  s.bricks = [brick(0, 0, 'x')];
  s.paddle.x = 100;
  // Bóng đã lấn vào nửa trên của thanh ở chỗ thanh sắp trượt tới
  s.balls = [ball(150, E.PADDLE_Y + 2, 0, 200)];
  E.step(s, { target: 140 });
  const b = s.balls[0];
  assert(b.y <= E.PADDLE_Y - R + 1e-6 && b.vy < 0, 'bóng phải ở trên thanh và đi lên');
});

/* ---------------- Vật phẩm ---------------- */
function catchPower(type, setup) {
  const s = emptyGame(3);
  s.bricks = [keeper()];
  if (setup) setup(s);
  // Bóng đi thẳng đứng trên giữa thanh: thanh bám theo bóng là đỡ mãi không rơi
  s.balls = [ball(s.paddle.x, 300, 0, 300)];
  s.drops = [{ x: s.paddle.x, y: E.PADDLE_Y - 30, type }];
  const evs = runUntil(s, (ev) => ev.caught.length > 0, 200, { target: s.paddle.x });
  eq(evs[evs.length - 1].caught, [type]);
  return s;
}

test('vật phẩm rơi và đỡ được bằng thanh, rơi mất nếu không đỡ', () => {
  const s = catchPower('life');
  eq(s.drops.length, 0);
  const t = emptyGame();
  t.bricks = [brick(0, 0, 'x'), brick(300, 60)];
  t.balls = [ball(200, 200, 100, -300)];
  t.drops = [{ x: 20, y: E.PADDLE_Y - 30, type: 'wide' }];
  t.paddle.x = 300;
  const evs = runUntil(t, (ev) => ev.missed > 0, 400, { target: 300 });
  eq(evs.some((ev) => ev.caught.length), false);
  eq(t.paddle.w, E.PADDLE_W, 'không đỡ được thì không có tác dụng');
});

test('Mở rộng thanh: thanh rộng ra rồi trở lại khi hết hạn', () => {
  const s = catchPower('wide', (g) => (g.paddle.x = g.paddle.w / 2));
  eq(s.paddle.w, E.WIDE_W);
  assert(s.paddle.x - s.paddle.w / 2 >= -1e-9, 'thanh rộng ra vẫn nằm trong sân');
  const steps = Math.ceil(E.POWER_MS.wide / E.STEP_MS);
  let expiredAt = -1;
  for (let i = 0; i < steps + 5; i++) {
    const ev = E.step(s, { target: s.balls[0].x });
    eq(ev.lifeLost, false, 'bóng không được rơi');
    if (ev.expired.includes('wide')) expiredAt = i;
  }
  assert(Math.abs(expiredAt - steps) <= 2, 'hết hạn sau đúng 15 giây (bước ' + expiredAt + ', cần ' + steps + ')');
  eq([s.paddle.w, s.effects.wide], [E.PADDLE_W, 0]);
});

test('Bóng chậm: tốc độ còn 65%, hết hạn thì trở lại', () => {
  const s = catchPower('slow');
  const full = Math.min(E.MAX_SPEED, E.levelSpeed(s.level) * s.ramp);
  E.step(s, {});
  near(Math.hypot(s.balls[0].vx, s.balls[0].vy), full * E.SLOW_FACTOR, 1e-6);
  s.effects.slow = 1;
  const ev = E.step(s, {});
  eq(ev.expired, ['slow']);
  E.step(s, {});
  near(Math.hypot(s.balls[0].vx, s.balls[0].vy), full, 1e-6);
});

test('Bóng xuyên: phá ngay gạch cứng không nảy, vẫn nảy ở thép, hết hạn thì thôi', () => {
  const s = emptyGame();
  s.effects.fire = 5000;
  s.bricks = [brick(100, 300, 's', 3), brick(100, 200), brick(100, 100, 'x'), brick(300, 60)];
  const b = ball(119, 400, 0, -300);
  s.balls = [b];
  const ev = fly(s, b, 1.2);
  eq(ev.broken.length, 2, 'xuyên qua hai viên');
  eq(ev.steel, 1, 'nảy ở thép');
  assert(b.vy > 0, 'thép làm bóng quay xuống');
  eq(ev.broken[0].points, E.BREAK_POINTS[3], 'gạch cứng vỡ ngay, đủ điểm');
  s.effects.fire = 1;
  s.balls = [ball(200, 300, 0, -300)];
  eq(E.step(s, {}).expired, ['fire']);
  const t = emptyGame();
  t.bricks = [brick(100, 200, 's', 2), brick(0, 0, 'x')];
  const c = ball(119, 260, 0, -300);
  eq(fly(t, c, 0.2).cracked.length, 1, 'không có bóng xuyên: chỉ nứt');
});

test('Nhiều bóng: mỗi bóng tách thành 3, tối đa 12, mất bóng phụ không mất mạng', () => {
  const s = catchPower('multi');
  eq(s.balls.length, 3);
  const speeds = s.balls.map((b) => Math.hypot(b.vx, b.vy));
  speeds.forEach((v) => near(v, speeds[0], 1e-6, 'cùng tốc độ'));
  const dirs = new Set(s.balls.map((b) => Math.round(Math.atan2(b.vy, b.vx) * 1000)));
  eq(dirs.size, 3, 'ba hướng khác nhau');
  for (let i = 0; i < 5; i++) E.applyPower(s, 'multi', E.emptyEvents());
  eq(s.balls.length, E.MAX_BALLS);
  // Hai bóng rơi khỏi sân: không mất mạng
  const lives = s.lives;
  s.balls = s.balls.slice(0, 3);
  s.balls[0].y = E.H + 50;
  s.balls[1].y = E.H + 50;
  s.balls[2] = ball(200, 200, 100, -300);
  const ev = E.step(s, {});
  eq([ev.ballLost, ev.lifeLost, s.lives, s.balls.length], [2, false, lives, 1]);
});

test('Thêm mạng: +1, tối đa 5; đủ 5 mạng thì không rơi "Thêm mạng"', () => {
  const s = catchPower('life');
  eq(s.lives, 4);
  E.applyPower(s, 'life', E.emptyEvents());
  E.applyPower(s, 'life', E.emptyEvents());
  eq(s.lives, E.MAX_LIVES);
  // Phá nhiều gạch đánh dấu khi đủ mạng: không bao giờ ra 'life'
  for (let i = 0; i < 200; i++) {
    const t = emptyGame(i + 1);
    t.lives = E.MAX_LIVES;
    const k = brick(100, 200);
    k.drop = true;
    t.bricks = [k, brick(0, 0, 'x')];
    t.balls = [ball(119, 260, 0, -300)];
    fly(t, t.balls[0], 0.2);
    eq(t.drops.length, 1, 'gạch đánh dấu phải rơi vật phẩm');
    assert(t.drops[0].type !== 'life', 'không rơi Thêm mạng khi đủ mạng');
  }
});

test('vật phẩm rơi ngẫu nhiên khoảng 12% và đủ 5 loại', () => {
  const seen = {};
  let drops = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const t = emptyGame(i * 7 + 1);
    t.bricks = [brick(100, 200), brick(0, 0, 'x')];
    t.balls = [ball(119, 260, 0, -300)];
    fly(t, t.balls[0], 0.2);
    t.drops.forEach((d) => {
      drops++;
      seen[d.type] = true;
    });
  }
  near(drops / N, E.DROP_CHANCE, 0.02, 'tỉ lệ rơi');
  eq(Object.keys(seen).sort(), E.POWERS.slice().sort());
});

/* ---------------- Mất mạng, hết mạng, qua màn ---------------- */
test('rơi hết bóng: mất một mạng, xóa vật phẩm, bóng mới chờ trên thanh', () => {
  const s = E.newGame({ seed: 2 });
  E.step(s, { launch: true });
  s.effects.wide = 5000;
  s.paddle.w = E.WIDE_W;
  s.drops = [{ x: 50, y: 300, type: 'slow' }];
  s.balls = [ball(200, E.H + R - 1, 0, 400)];
  s.paddle.x = 350;
  const ev = E.step(s, { target: 350 });
  eq([ev.lifeLost, ev.gameOver, s.lives, s.phase], [true, false, 2, 'serve']);
  eq([s.drops.length, s.effects.wide, s.paddle.w, s.balls.length], [0, 0, E.PADDLE_W, 1]);
  assert(s.balls[0].stuck, 'bóng mới phải chờ');
});

test('hết mạng: kết thúc ván, step không còn tác dụng', () => {
  const s = E.newGame({ seed: 2 });
  for (let life = 3; life >= 1; life--) {
    E.step(s, { launch: true });
    s.balls = [ball(200, E.H + R - 1, 0, 400)];
    s.paddle.x = 350;
    const ev = E.step(s, { target: 350 });
    eq(ev.lifeLost, true);
    eq(ev.gameOver, life === 1, 'mạng ' + life);
  }
  eq([s.phase, s.lives, s.balls.length], ['over', 0, 0]);
  const score = s.score;
  const ev = E.step(s, { launch: true, dir: 1 });
  eq([ev.launched, s.score], [false, score]);
});

test('qua màn: thưởng điểm, sang màn kế, giữ điểm và mạng, quay vòng sau màn 10', () => {
  const s = E.newGame({ seed: 4 });
  s.lives = 2;
  s.score = 1000;
  E.step(s, { launch: true });
  s.bricks = [brick(100, 200), brick(0, 0, 'x')];
  s.balls = [ball(119, 260, 0, -300)];
  const evs = runUntil(s, (ev) => ev.cleared, 100);
  eq(evs[evs.length - 1].bonus, E.CLEAR_BONUS);
  eq(s.phase, 'clear');
  const ev = E.step(s, { launch: true });
  eq(ev.launched, false, 'đang chuyển màn thì không phóng');
  assert(E.nextLevel(s), 'phải sang màn');
  eq([s.level, s.lives, s.phase, s.cleared], [2, 2, 'serve', 1]);
  eq(s.score, 1000 + E.BREAK_POINTS[1] + E.CLEAR_BONUS);
  eq(E.breakableLeft(s), E.parseLevel(E.LEVELS[1]).filter((b) => b.kind !== 'x').length);
  assert(!E.nextLevel(s), 'chưa qua màn thì không sang được');
  // Màn 11 dùng lại màn 1 nhưng nhanh hơn
  eq(E.levelRows(11), E.LEVELS[0]);
  eq([E.loopOf(10), E.loopOf(11)], [1, 2]);
  assert(E.levelSpeed(11) > E.levelSpeed(10) || E.levelSpeed(10) === E.MAX_SPEED, 'màn sau không chậm hơn');
});

test('tốc độ tăng dần theo màn, có trần', () => {
  for (let n = 2; n <= 30; n++) assert(E.levelSpeed(n) >= E.levelSpeed(n - 1), 'màn ' + n);
  near(E.levelSpeed(1), E.BASE_SPEED, 1e-9);
  near(E.levelSpeed(2) / E.levelSpeed(1), 1 + E.LEVEL_STEP, 1e-9, 'tăng nhẹ mỗi màn');
  eq(E.levelSpeed(999), E.MAX_SPEED);
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu và khôi phục qua JSON: chơi tiếp giống hệt ván gốc', () => {
  const s = E.newGame({ seed: 77, level: 3 });
  E.step(s, { launch: true });
  for (let i = 0; i < 700; i++) E.step(s, { target: s.balls.length ? s.balls[0].x : 200 });
  s.effects.slow = 3000;
  const copy = E.restore(JSON.parse(JSON.stringify(s)));
  assert(copy, 'khôi phục được');
  for (let i = 0; i < 600; i++) {
    const input = { target: s.balls.length ? s.balls[0].x : 200, launch: true };
    E.step(s, input);
    E.step(copy, { target: copy.balls.length ? copy.balls[0].x : 200, launch: true });
  }
  eq(JSON.stringify(copy), JSON.stringify(s), 'hai ván phải giống hệt');
});

test('dữ liệu hỏng trả về null', () => {
  const s = E.newGame({ seed: 1 });
  const bad = [
    null,
    {},
    Object.assign({}, s, { v: 2 }),
    Object.assign({}, s, { phase: 'xyz' }),
    Object.assign({}, s, { lives: 9 }),
    Object.assign({}, s, { lives: 0 }),
    Object.assign({}, s, { score: -1 }),
    Object.assign({}, s, { bricks: [{ c: 99, r: 0, kind: 'n', color: 'r' }] }),
    Object.assign({}, s, { bricks: [{ c: 1, r: 0, kind: 's', max: 2, hp: 5 }] }),
    Object.assign({}, s, { bricks: [{ c: 1, r: 0, kind: 'n', color: 'r' }, { c: 1, r: 0, kind: 'x' }] }),
    Object.assign({}, s, { balls: [{ x: NaN, y: 1, vx: 0, vy: 0 }] }),
  ];
  bad.forEach((b, i) => eq(E.restore(b), null, 'mẫu ' + i));
  const ok = E.restore(JSON.parse(JSON.stringify(s)));
  assert(ok && ok.phase === 'serve' && ok.balls[0].stuck, 'state hợp lệ khôi phục được');
});

/* ---------------- Chơi tự động ---------------- */
test('200 ván tự chơi (thanh bám bóng) luôn hợp lệ và có qua màn', () => {
  let clearedTotal = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = mulberry32(seed);
    const s = E.newGame({ seed, level: 1 + (seed % 10) });
    let prevBroken = 0;
    for (let i = 0; i < 6000 && s.phase !== 'over'; i++) {
      if (s.phase === 'clear') {
        E.nextLevel(s);
        continue;
      }
      // Bám quả bóng thấp nhất, lệch ngẫu nhiên để góc nảy đa dạng; đôi khi bỏ lỡ
      const low = s.balls.reduce((m, b) => (!m || b.y > m.y ? b : m), null);
      const target = low ? low.x + (rng() - 0.5) * s.paddle.w * 0.9 + (rng() < 0.002 ? 300 : 0) : 200;
      const ev = E.step(s, { target, launch: true });
      // Bất biến
      assert(s.lives >= 0 && s.lives <= E.MAX_LIVES, 'số mạng');
      assert(s.balls.length <= E.MAX_BALLS, 'số bóng');
      assert(s.paddle.x - s.paddle.w / 2 >= -1e-9 && s.paddle.x + s.paddle.w / 2 <= E.W + 1e-9, 'thanh trong sân');
      assert(s.broken >= prevBroken, 'số gạch phá không giảm');
      prevBroken = s.broken;
      s.balls.forEach((b) => {
        assert(Number.isFinite(b.x) && Number.isFinite(b.y), 'toạ độ bóng hỏng');
        if (!b.stuck) assert(Math.abs(b.vy) / Math.hypot(b.vx, b.vy) >= Math.sin(E.MIN_ANGLE) - 1e-9, 'bóng quá ngang');
        s.bricks.forEach((k) => assert(!E.overlaps(b.x, b.y, R - 0.01, k.x, k.y, k.x + k.w, k.y + k.h), 'bóng trong gạch'));
      });
      if (ev.cleared) clearedTotal++;
    }
    assert(E.restore(JSON.parse(JSON.stringify(s))) !== null || s.phase === 'over', 'state phải khôi phục được');
  }
  assert(clearedTotal > 20, 'tự chơi phải qua được màn (' + clearedTotal + ')');
});

console.log('\n' + passed + ' đạt, ' + failed + ' lỗi');
if (failed) process.exit(1);
