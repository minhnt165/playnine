/* =====================================================================
 * Phá Gạch - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Không đụng tới DOM. Các hàm thao tác (step, launch, nextLevel...) SỬA TRỰC TIẾP
 *     state truyền vào vì game chạy 120 bước vật lý mỗi giây
 *   - Sân chơi logic cố định W x H (đơn vị px logic), app co giãn khi vẽ
 *   - Va chạm: quét hình tròn với hình chữ nhật (tổng Minkowski: 4 cạnh dịch ra r + 4 cung tròn
 *     ở góc), lấy va chạm sớm nhất rồi đi tiếp phần thời gian còn lại, nên bóng nhanh mấy
 *     cũng không xuyên qua gạch
 *   - Số ngẫu nhiên lấy từ PRNG có seed lưu trong state: test chạy tất định, ván khôi phục
 *     rơi vật phẩm giống ván gốc
 *   - State là object thuần, JSON.stringify được
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------- Kích thước sân (px logic) ---------------- */
  const W = 400;
  const H = 560;
  const COLS = 10; // số cột gạch
  const MAX_ROWS = 12; // số hàng gạch tối đa của một màn
  const BRICK_W = 38;
  const BRICK_H = 18;
  const GRID_X = (W - COLS * BRICK_W) / 2; // lề trái của lưới gạch
  const GRID_Y = 48; // phía trên chừa chỗ cho dải mạng / vật phẩm
  const PADDLE_Y = 508; // mép trên của thanh đỡ
  const PADDLE_H = 12;
  const PADDLE_W = 72;
  const WIDE_W = 112; // thanh đỡ khi ăn "Mở rộng thanh"
  const BALL_R = 6;

  /* ---------------- Tốc độ (px logic mỗi giây) ---------------- */
  const STEP_MS = 1000 / 120; // một bước vật lý
  const BASE_SPEED = 320; // tốc độ bóng ở màn 1
  const LEVEL_STEP = 0.06; // mỗi màn nhanh hơn 6%...
  const MAX_SPEED = 640; // ...nhưng không quá mức này
  const RAMP_STEP = 0.006; // mỗi lần chạm thanh bóng nhanh thêm 0,6% (trong một màn)
  const RAMP_MAX = 1.12; // tối đa +12% so với tốc độ đầu màn
  const SLOW_FACTOR = 0.65; // "Bóng chậm": còn 65% tốc độ
  const KEY_SPEED = 620; // thanh đỡ đi bằng phím
  const DRAG_SPEED = 4200; // thanh đỡ đuổi theo ngón tay / chuột (giới hạn để không "dịch chuyển tức thời")
  const MIN_ANGLE = (15 * Math.PI) / 180; // bóng luôn lệch khỏi phương ngang ít nhất 15°
  const MAX_BOUNCE = (60 * Math.PI) / 180; // chạm mép thanh: nảy lệch 60° so với phương thẳng đứng
  const LAUNCH_REL = 0.3; // bóng chờ phóng nằm lệch phải 30% nửa thanh (phóng chéo nhẹ)
  const STALL_BOUNCES = 24; // nảy chừng ấy lần mà không chạm thanh / gạch phá được thì bẻ hướng
  const MAX_ITERS = 8; // số lần va chạm tối đa xử lý trong một bước cho một quả bóng
  const EPS = 1e-6;

  /* ---------------- Mạng, điểm, vật phẩm ---------------- */
  const START_LIVES = 3;
  const MAX_LIVES = 5;
  const MAX_BALLS = 12;
  const BREAK_POINTS = { 1: 10, 2: 30, 3: 50 }; // theo số lần đập của viên gạch
  const HIT_POINTS = 5; // đập nứt gạch cứng (chưa vỡ)
  const CATCH_POINTS = 25; // đỡ được vật phẩm
  const CLEAR_BONUS = 100; // thưởng qua màn = 100 x số màn
  const COMBO_STEP = 4; // chuỗi 1–4 viên: x1, 5–8: x2, ...
  const MAX_MULT = 5;
  const DROP_CHANCE = 0.12; // gạch thường vỡ có 12% rơi vật phẩm (gạch đánh dấu thì luôn rơi)
  const MAX_DROPS = 3; // tối đa số vật phẩm đang rơi
  const DROP_SPEED = 130;
  const DROP_W = 30;
  const DROP_H = 14;
  const POWERS = ['wide', 'multi', 'slow', 'fire', 'life'];
  const POWER_NAMES = {
    wide: 'Mở rộng thanh',
    multi: 'Nhiều bóng',
    slow: 'Bóng chậm',
    fire: 'Bóng xuyên',
    life: 'Thêm mạng',
  };
  const POWER_WEIGHT = { wide: 28, multi: 24, slow: 22, fire: 14, life: 12 };
  const POWER_MS = { wide: 15000, slow: 12000, fire: 8000 }; // vật phẩm có thời hạn
  const TIMED = ['wide', 'slow', 'fire'];
  const MULTI_SPREAD = (25 * Math.PI) / 180; // bóng tách ra lệch ±25°

  /* ---------------- Màn chơi ----------------
   * Mỗi màn là mảng chuỗi dài COLS, mỗi ký tự một ô:
   *   .        ô trống
   *   r o y g c b p   gạch thường (1 lần đập), màu đỏ / cam / vàng / lục / ngọc / chàm / tím
   *   R O Y G C B P   như trên nhưng chắc chắn rơi vật phẩm
   *   2 3      gạch cứng 2 / 3 lần đập (hiện vết nứt)
   *   #        gạch thép: không phá được, không cần phá để qua màn
   */
  const COLORS = ['r', 'o', 'y', 'g', 'c', 'b', 'p'];
  const LEVEL_NAMES = [
    'Khởi động',
    'Kim tự tháp',
    'Gạch cứng',
    'Tường thép',
    'Bàn cờ',
    'Pháo đài',
    'Mắt lưới',
    'Trái tim',
    'Hành lang',
    'Thành trì',
  ];
  const LEVELS = [
    [
      'rrrrrrrrrr',
      'oooOoooOoo',
      'yyyyyyyyyy',
      'ggggggGggg',
      'cccccccccc',
    ],
    [
      '....pp....',
      '...bbbb...',
      '..cccCcc..',
      '.gggggggg.',
      'yyyYyyyyyy',
      'oooooooooo',
      'rrrrrrRrrr',
    ],
    [
      '2222222222',
      'rroOyygGcc',
      'rrooyyggcc',
      '..........',
      'bb22bb22bb',
      'bbbbBbbbbb',
    ],
    [
      'pppppppppp',
      'pPppppppPp',
      '2222222222',
      '##..##..##',
      'cccCcccccc',
      'gggggggggg',
      'yyyyyyYyyy',
    ],
    [
      'r.r.r.r.r.',
      '.o.o.o.o.o',
      'y.Y.y.y.y.',
      '.g.g.g.G.g',
      'c.c.c.c.c.',
      '.b.b.b.b.b',
      'p.p.P.p.p.',
    ],
    [
      '#22222222#',
      '#yyyYyyyy#',
      '#oooooooo#',
      '#rrrrRrrr#',
      '#........#',
      '###....###',
      '..........',
      'gggGgggggg',
    ],
    [
      '3333333333',
      'c3cc33cc3c',
      'cCcccccCcc',
      '..........',
      'b.b3bb3b.b',
      'bbbbBbbbbb',
      'gggggggggg',
    ],
    [
      '.rrr..rrr.',
      'rrrrrrrrrr',
      'rrRrrrrRrr',
      'pppppppppp',
      '.pppppppp.',
      '..ppP2pp..',
      '...p22p...',
      '....pp....',
    ],
    [
      'yyyyyyyyyy',
      'yYyy##yyYy',
      '2222##2222',
      '....##....',
      'oooo##oooo',
      'oOoo##ooOo',
      '##......##',
      'cccccccccc',
    ],
    [
      '3333333333',
      'p##pppp##p',
      'pPpp33ppPp',
      '3333333333',
      '##.#..#.##',
      'bbbbBbbbbb',
      'ggg3gg3ggg',
      'rrrrrrrrrr',
    ],
  ];

  /* ---------------- Tiện ích ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const int = (v, min, max, def) => (Number.isInteger(v) && v >= min && v <= max ? v : def);

  /** PRNG mulberry32, trạng thái nằm trong s.seed (sửa trực tiếp). */
  function rand(s) {
    s.seed = (s.seed + 0x6d2b79f5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Dữ liệu màn n (n tính từ 1). Hết 10 màn thì quay vòng, bóng nhanh hơn. */
  const levelRows = (n) => LEVELS[(n - 1) % LEVELS.length];
  const levelName = (n) => LEVEL_NAMES[(n - 1) % LEVELS.length];
  const loopOf = (n) => Math.floor((n - 1) / LEVELS.length) + 1;

  /** Tạo một viên gạch từ ký tự ở cột c, hàng r. Ô trống / ký tự lạ trả về null. */
  function makeBrick(ch, c, r) {
    const base = { c, r, x: GRID_X + c * BRICK_W, y: GRID_Y + r * BRICK_H, w: BRICK_W, h: BRICK_H };
    if (ch === '#') return Object.assign(base, { kind: 'x', color: 'x', hp: 1, max: 1, drop: false });
    if (ch === '2' || ch === '3') {
      const n = Number(ch);
      return Object.assign(base, { kind: 's', color: 's', hp: n, max: n, drop: false });
    }
    const lower = ch.toLowerCase();
    if (COLORS.includes(lower)) return Object.assign(base, { kind: 'n', color: lower, hp: 1, max: 1, drop: ch !== lower });
    return null;
  }

  function parseLevel(rows) {
    const out = [];
    rows.forEach((line, r) => {
      for (let c = 0; c < COLS; c++) {
        const b = makeBrick(line[c], c, r);
        if (b) out.push(b);
      }
    });
    return out;
  }

  /* ---------------- Tốc độ bóng ---------------- */
  const levelSpeed = (n) => Math.min(MAX_SPEED, BASE_SPEED * (1 + LEVEL_STEP * (n - 1)));

  /** Tốc độ bóng hiện tại: theo màn, tăng dần theo số lần chạm thanh, giảm khi có "Bóng chậm". */
  function ballSpeed(s) {
    const v = Math.min(MAX_SPEED, levelSpeed(s.level) * s.ramp);
    return s.effects.slow > 0 ? v * SLOW_FACTOR : v;
  }

  /** Hướng nảy khi chạm thanh: rel từ -1 (mép trái) tới 1 (mép phải). Trả về vector đơn vị đi lên. */
  function bounceDir(rel) {
    const a = clamp(rel, -1, 1) * MAX_BOUNCE;
    return [Math.sin(a), -Math.cos(a)];
  }

  /**
   * Đặt độ lớn vận tốc bóng bằng speed, giữ hướng nhưng ép góc lệch khỏi phương ngang
   * tối thiểu MIN_ANGLE (không để bóng chạy gần như ngang mãi giữa hai tường).
   */
  function aim(b, speed) {
    let len = Math.hypot(b.vx, b.vy);
    if (len < EPS) {
      b.vx = 0;
      b.vy = -1;
      len = 1;
    }
    let ux = b.vx / len;
    let uy = b.vy / len;
    const minY = Math.sin(MIN_ANGLE);
    if (Math.abs(uy) < minY) {
      uy = uy > 0 ? minY : -minY; // đang ngang hẳn thì cho đi lên
      ux = (ux < 0 ? -1 : 1) * Math.cos(MIN_ANGLE);
    }
    b.vx = ux * speed;
    b.vy = uy * speed;
  }

  /* ---------------- Quét hình tròn vào hình chữ nhật ---------------- */
  /**
   * Bóng tâm (px, py) bán kính r đi một đoạn (dx, dy). Tìm thời điểm sớm nhất t trong [0, 1]
   * bóng chạm hình chữ nhật [L, R] x [T, B]. Hình mà tâm bóng không được lọt vào là hình chữ nhật
   * nở thêm r với 4 góc bo tròn (tổng Minkowski), nên xét 4 cạnh dịch ra r và 4 cung tròn ở góc.
   * Chỉ tính khi bóng đang đi VÀO bề mặt. Trả về { t, nx, ny, corner } (pháp tuyến hướng ra ngoài) hoặc null.
   */
  function sweepRect(px, py, dx, dy, r, L, T, R, B) {
    let best = null;
    const take = (t, nx, ny, corner) => {
      if (t < -EPS || t > 1) return;
      if (dx * nx + dy * ny >= 0) return; // đang đi ra xa bề mặt
      t = Math.max(0, t);
      // Hòa thời điểm: ưu tiên cạnh phẳng hơn góc (đường nối giữa hai viên gạch kề nhau)
      if (!best || t < best.t - 1e-9 || (Math.abs(t - best.t) <= 1e-9 && best.corner && !corner)) {
        best = { t, nx, ny, corner };
      }
    };
    // Bốn cạnh
    if (dy > 0) {
      const t = (T - r - py) / dy;
      const x = px + dx * t;
      if (x >= L && x <= R) take(t, 0, -1, false);
    } else if (dy < 0) {
      const t = (B + r - py) / dy;
      const x = px + dx * t;
      if (x >= L && x <= R) take(t, 0, 1, false);
    }
    if (dx > 0) {
      const t = (L - r - px) / dx;
      const y = py + dy * t;
      if (y >= T && y <= B) take(t, -1, 0, false);
    } else if (dx < 0) {
      const t = (R + r - px) / dx;
      const y = py + dy * t;
      if (y >= T && y <= B) take(t, 1, 0, false);
    }
    // Bốn góc: giao tia với đường tròn bán kính r quanh đỉnh góc
    const a = dx * dx + dy * dy;
    if (a > 0) {
      const corners = [
        [L, T],
        [R, T],
        [L, B],
        [R, B],
      ];
      for (let i = 0; i < 4; i++) {
        const cx = corners[i][0];
        const cy = corners[i][1];
        const ox = px - cx;
        const oy = py - cy;
        const bq = ox * dx + oy * dy;
        const cq = ox * ox + oy * oy - r * r;
        const disc = bq * bq - a * cq;
        if (disc < 0) continue;
        const t = (-bq - Math.sqrt(disc)) / a;
        const hx = px + dx * t;
        const hy = py + dy * t;
        // Điểm chạm phải nằm đúng phần tư của góc đó (ngoài cạnh)
        const inX = cx === L ? hx <= L : hx >= R;
        const inY = cy === T ? hy <= T : hy >= B;
        if (!inX || !inY) continue;
        take(t, (hx - cx) / r, (hy - cy) / r, true);
      }
    }
    return best;
  }

  /** Bóng có đang chồng lên hình chữ nhật không (khoảng cách từ tâm tới hình < r). */
  function overlaps(x, y, r, L, T, R, B) {
    const qx = clamp(x, L, R);
    const qy = clamp(y, T, B);
    const ddx = x - qx;
    const ddy = y - qy;
    return ddx * ddx + ddy * ddy < r * r - EPS;
  }

  /* ---------------- Tạo state ---------------- */
  function emptyEffects() {
    return { wide: 0, slow: 0, fire: 0 };
  }

  function emptyEvents() {
    return {
      broken: [], // gạch vỡ: { x, y, w, h, color, points, mult }
      cracked: [], // gạch cứng bị nứt: { x, y, points, mult, hp }
      steel: 0, // số lần chạm thép
      wall: 0,
      paddle: 0,
      gained: 0, // tổng điểm cộng trong bước này
      caught: [], // vật phẩm đỡ được
      missed: 0, // vật phẩm rơi mất
      expired: [], // vật phẩm hết hạn
      launched: false,
      ballLost: 0, // số bóng rơi (khi còn bóng khác)
      lifeLost: false,
      gameOver: false,
      cleared: false, // vừa phá hết gạch
      bonus: 0, // điểm thưởng qua màn
    };
  }

  const paddleRect = (s) => [s.paddle.x - s.paddle.w / 2, PADDLE_Y, s.paddle.x + s.paddle.w / 2, PADDLE_Y + PADDLE_H];

  /** Đặt bóng mới nằm chờ trên thanh. */
  function serve(s) {
    s.phase = 'serve';
    const off = (s.paddle.w / 2) * LAUNCH_REL;
    s.balls = [{ x: s.paddle.x + off, y: PADDLE_Y - BALL_R - 0.5, vx: 0, vy: 0, stuck: true, off, stall: 0 }];
  }

  function resetPowers(s) {
    s.effects = emptyEffects();
    s.paddle.w = PADDLE_W;
    s.paddle.x = clamp(s.paddle.x, PADDLE_W / 2, W - PADDLE_W / 2);
  }

  /** Nạp màn n: gạch mới, xóa vật phẩm, tốc độ về đầu màn, bóng chờ trên thanh. */
  function loadLevel(s, n) {
    s.level = n;
    s.bricks = parseLevel(levelRows(n));
    s.drops = [];
    s.ramp = 1;
    s.chain = 0;
    resetPowers(s);
    serve(s);
  }

  function newGame(opts) {
    const o = opts || {};
    const s = {
      v: 1,
      seed: Number.isInteger(o.seed) ? o.seed | 0 : (Math.random() * 4294967296) | 0,
      level: 1,
      score: 0,
      lives: START_LIVES,
      phase: 'serve', // 'serve' (bóng chờ phóng) | 'play' | 'clear' (vừa qua màn) | 'over'
      paddle: { x: W / 2, w: PADDLE_W },
      balls: [],
      drops: [],
      bricks: [],
      effects: emptyEffects(),
      ramp: 1,
      chain: 0, // số lần đập gạch liên tiếp chưa chạm thanh
      bestChain: 0,
      broken: 0, // số gạch đã phá trong ván
      cleared: 0, // số màn đã qua trong ván
    };
    loadLevel(s, int(o.level, 1, 9999, 1));
    return s;
  }

  /* ---------------- Truy vấn ---------------- */
  const breakableLeft = (s) => s.bricks.reduce((n, b) => n + (b.kind === 'x' ? 0 : 1), 0);
  const multFor = (chain) => Math.min(MAX_MULT, 1 + Math.floor(Math.max(0, chain - 1) / COMBO_STEP));
  const comboMult = (s) => multFor(s.chain);

  /* ---------------- Phóng bóng ---------------- */
  /** Phóng bóng đang chờ. Hướng phóng theo vị trí bóng trên thanh. Trả về true nếu phóng được. */
  function launch(s) {
    if (s.phase !== 'serve') return false;
    const speed = ballSpeed(s);
    s.balls.forEach((b) => {
      if (!b.stuck) return;
      const d = bounceDir(b.off / (s.paddle.w / 2));
      b.vx = d[0] * speed;
      b.vy = d[1] * speed;
      b.stuck = false;
      b.stall = 0;
    });
    s.phase = 'play';
    return true;
  }

  /* ---------------- Thanh đỡ ---------------- */
  /** input: { dir: -1 | 0 | 1 } (phím) hoặc { target: x } (kéo / chuột, x theo px logic). */
  function movePaddle(s, input, dt) {
    const p = s.paddle;
    let x = p.x;
    if (input && isNum(input.target)) {
      const lim = DRAG_SPEED * dt;
      x += clamp(input.target - x, -lim, lim);
    } else if (input && input.dir) {
      x += Math.sign(input.dir) * KEY_SPEED * dt;
    }
    p.x = clamp(x, p.w / 2, W - p.w / 2);
  }

  /** Bóng chờ phóng đi theo thanh. */
  function followPaddle(s) {
    const lim = s.paddle.w / 2 - 2;
    s.balls.forEach((b) => {
      if (!b.stuck) return;
      b.off = clamp(b.off, -lim, lim);
      b.x = s.paddle.x + b.off;
      b.y = PADDLE_Y - BALL_R - 0.5;
    });
  }

  /** Bóng chạm mặt trên thanh: nảy theo vị trí chạm, ngắt chuỗi, tăng tốc nhẹ. */
  function paddleBounce(s, b, ev) {
    const d = bounceDir((b.x - s.paddle.x) / (s.paddle.w / 2));
    const speed = Math.hypot(b.vx, b.vy) || ballSpeed(s);
    b.vx = d[0] * speed;
    b.vy = d[1] * speed;
    b.stall = 0;
    s.chain = 0;
    s.ramp = Math.min(RAMP_MAX, s.ramp + RAMP_STEP);
    ev.paddle++;
  }

  /** Bóng bị thanh đè lên (thanh vừa trượt vào bóng): đẩy bóng ra ngoài. */
  function resolvePaddle(s, b, ev) {
    const [L, T, R, B] = paddleRect(s);
    if (!overlaps(b.x, b.y, BALL_R, L, T, R, B)) return;
    if (b.y <= T + PADDLE_H / 2) {
      b.y = T - BALL_R - EPS;
      if (b.vy > 0) paddleBounce(s, b, ev);
    } else {
      // Bóng đã xuống thấp hơn mặt thanh: chỉ gạt sang bên, bóng vẫn rơi
      if (b.x < s.paddle.x) {
        b.x = L - BALL_R - EPS;
        b.vx = -Math.abs(b.vx);
      } else {
        b.x = R + BALL_R + EPS;
        b.vx = Math.abs(b.vx);
      }
    }
  }

  /* ---------------- Gạch ---------------- */
  function pickPower(s) {
    const list = POWERS.filter((k) => !(k === 'life' && s.lives >= MAX_LIVES) && !(k === 'multi' && s.balls.length >= MAX_BALLS));
    const total = list.reduce((n, k) => n + POWER_WEIGHT[k], 0);
    let x = rand(s) * total;
    for (let i = 0; i < list.length; i++) {
      x -= POWER_WEIGHT[list[i]];
      if (x < 0) return list[i];
    }
    return list[list.length - 1];
  }

  /**
   * Bóng đập vào gạch k. fire: bóng xuyên (phá ngay gạch phá được).
   * Trả về true nếu bóng phải nảy lại (gạch thép, hoặc bóng thường).
   */
  function hitBrick(s, k, ev, fire) {
    if (k.kind === 'x') {
      ev.steel++;
      return true;
    }
    s.chain++;
    if (s.chain > s.bestChain) s.bestChain = s.chain;
    const mult = multFor(s.chain);
    k.hp = fire ? 0 : k.hp - 1;
    const cx = k.x + k.w / 2;
    const cy = k.y + k.h / 2;
    if (k.hp > 0) {
      const pts = HIT_POINTS * mult;
      s.score += pts;
      ev.gained += pts;
      ev.cracked.push({ x: cx, y: cy, points: pts, mult, hp: k.hp });
      return true;
    }
    const pts = BREAK_POINTS[k.max] * mult;
    s.score += pts;
    ev.gained += pts;
    s.broken++;
    s.bricks.splice(s.bricks.indexOf(k), 1);
    ev.broken.push({ x: k.x, y: k.y, w: k.w, h: k.h, color: k.color, points: pts, mult });
    // Rơi vật phẩm (luôn rút số ngẫu nhiên để chuỗi ngẫu nhiên không phụ thuộc số vật phẩm đang rơi)
    const roll = rand(s);
    if ((k.drop || roll < DROP_CHANCE) && (k.drop || s.drops.length < MAX_DROPS)) {
      s.drops.push({ x: cx, y: cy, type: pickPower(s) });
    }
    return !fire;
  }

  /* ---------------- Di chuyển một quả bóng ---------------- */
  function reflect(b, nx, ny) {
    const d = b.vx * nx + b.vy * ny;
    if (d < 0) {
      b.vx -= 2 * d * nx;
      b.vy -= 2 * d * ny;
    }
  }

  /** Bẻ hướng ngẫu nhiên 8–16° khi bóng nảy mãi giữa tường / thép mà không có tiến triển. */
  function unstick(s, b) {
    const a = (8 + rand(s) * 8) * (Math.PI / 180) * (rand(s) < 0.5 ? -1 : 1);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const vx = b.vx * c - b.vy * sn;
    const vy = b.vx * sn + b.vy * c;
    b.vx = vx;
    b.vy = vy;
    b.stall = 0;
  }

  /**
   * Đi hết quãng thời gian dt (giây) với vận tốc hiện tại, xử lý lần lượt từng va chạm sớm nhất
   * (tường, trần, gạch, thanh). Không đổi độ lớn vận tốc (trừ khi chạm thanh).
   */
  function advanceBall(s, b, dt, ev) {
    let tLeft = dt;
    const speed = Math.hypot(b.vx, b.vy);
    for (let iter = 0; iter < MAX_ITERS && tLeft > 1e-9; iter++) {
      const dx = b.vx * tLeft;
      const dy = b.vy * tLeft;
      let best = null;
      const consider = (hit, what, brick) => {
        if (!hit) return;
        if (!best || hit.t < best.t - 1e-9 || (Math.abs(hit.t - best.t) <= 1e-9 && best.corner && !hit.corner)) {
          best = { t: hit.t, nx: hit.nx, ny: hit.ny, corner: hit.corner, what, brick };
        }
      };
      // Tường trái / phải, trần (bóng chưa chạm thì t >= 0; lỡ lấn vào thì coi như chạm ngay)
      if (dx < 0) consider({ t: clamp((BALL_R - b.x) / dx, 0, Infinity), nx: 1, ny: 0 }, 'wall');
      if (dx > 0) consider({ t: clamp((W - BALL_R - b.x) / dx, 0, Infinity), nx: -1, ny: 0 }, 'wall');
      if (dy < 0) consider({ t: clamp((BALL_R - b.y) / dy, 0, Infinity), nx: 0, ny: 1 }, 'wall');
      if (best && best.t > 1) best = null;
      // Gạch: chỉ xét các viên nằm trong hộp bao quãng đường đi
      const minX = Math.min(b.x, b.x + dx) - BALL_R;
      const maxX = Math.max(b.x, b.x + dx) + BALL_R;
      const minY = Math.min(b.y, b.y + dy) - BALL_R;
      const maxY = Math.max(b.y, b.y + dy) + BALL_R;
      for (let i = 0; i < s.bricks.length; i++) {
        const k = s.bricks[i];
        if (k.x > maxX || k.x + k.w < minX || k.y > maxY || k.y + k.h < minY) continue;
        consider(sweepRect(b.x, b.y, dx, dy, BALL_R, k.x, k.y, k.x + k.w, k.y + k.h), 'brick', k);
      }
      // Thanh đỡ
      const pr = paddleRect(s);
      consider(sweepRect(b.x, b.y, dx, dy, BALL_R, pr[0], pr[1], pr[2], pr[3]), 'paddle');

      if (!best) {
        b.x += dx;
        b.y += dy;
        break;
      }
      b.x += dx * best.t;
      b.y += dy * best.t;
      tLeft *= 1 - best.t;

      if (best.what === 'brick') {
        const bounce = hitBrick(s, best.brick, ev, s.effects.fire > 0);
        if (!bounce) continue; // bóng xuyên: gạch đã vỡ, đi tiếp như không có gì
        if (best.brick.kind === 'x') b.stall++;
        else b.stall = 0;
        reflect(b, best.nx, best.ny);
      } else if (best.what === 'paddle') {
        if (best.ny < -0.5) {
          paddleBounce(s, b, ev);
        } else {
          reflect(b, best.nx, best.ny); // chạm cạnh bên thanh
        }
      } else {
        ev.wall++;
        b.stall++;
        reflect(b, best.nx, best.ny);
      }
      if (b.stall >= STALL_BOUNCES) unstick(s, b);
      if (speed > 0) aim(b, speed);
      // Lùi ra khỏi bề mặt một chút để lần quét sau không dính lại
      b.x += best.nx * EPS * 10;
      b.y += best.ny * EPS * 10;
    }

    // Lưới an toàn: giữ bóng trong sân, đẩy ra nếu lỡ lấn vào gạch / thanh
    if (b.x < BALL_R) {
      b.x = BALL_R;
      b.vx = Math.abs(b.vx);
    } else if (b.x > W - BALL_R) {
      b.x = W - BALL_R;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < BALL_R) {
      b.y = BALL_R;
      b.vy = Math.abs(b.vy);
    }
    for (let i = 0; i < s.bricks.length; i++) {
      const k = s.bricks[i];
      if (!overlaps(b.x, b.y, BALL_R, k.x, k.y, k.x + k.w, k.y + k.h)) continue;
      pushOut(b, k.x, k.y, k.x + k.w, k.y + k.h);
    }
    resolvePaddle(s, b, ev);
  }

  /** Đẩy bóng ra khỏi hình chữ nhật theo hướng lấn ít nhất, rồi cho nảy ra. */
  function pushOut(b, L, T, R, B) {
    const opts = [
      [b.x + BALL_R - L, -1, 0],
      [R - (b.x - BALL_R), 1, 0],
      [b.y + BALL_R - T, 0, -1],
      [B - (b.y - BALL_R), 0, 1],
    ];
    opts.sort((p, q) => p[0] - q[0]);
    const [d, nx, ny] = opts[0];
    b.x += nx * (d + EPS);
    b.y += ny * (d + EPS);
    reflect(b, nx, ny);
  }

  /* ---------------- Vật phẩm ---------------- */
  function applyPower(s, type, ev) {
    if (type === 'wide') {
      s.effects.wide = POWER_MS.wide;
      s.paddle.w = WIDE_W;
      s.paddle.x = clamp(s.paddle.x, WIDE_W / 2, W - WIDE_W / 2);
    } else if (type === 'slow' || type === 'fire') {
      s.effects[type] = POWER_MS[type];
    } else if (type === 'life') {
      s.lives = Math.min(MAX_LIVES, s.lives + 1);
    } else if (type === 'multi') {
      const moving = s.balls.filter((b) => !b.stuck);
      for (let i = 0; i < moving.length; i++) {
        const b = moving[i];
        for (const sign of [-1, 1]) {
          if (s.balls.length >= MAX_BALLS) break;
          const a = MULTI_SPREAD * sign;
          const nb = {
            x: b.x,
            y: b.y,
            vx: b.vx * Math.cos(a) - b.vy * Math.sin(a),
            vy: b.vx * Math.sin(a) + b.vy * Math.cos(a),
            stuck: false,
            off: 0,
            stall: 0,
          };
          aim(nb, Math.hypot(b.vx, b.vy) || ballSpeed(s));
          s.balls.push(nb);
        }
      }
    }
    s.score += CATCH_POINTS;
    ev.gained += CATCH_POINTS;
    ev.caught.push(type);
  }

  function moveDrops(s, dt, ev) {
    const [L, T, R, B] = paddleRect(s);
    const keep = [];
    for (let i = 0; i < s.drops.length; i++) {
      const d = s.drops[i];
      d.y += DROP_SPEED * dt;
      const caught = d.x + DROP_W / 2 >= L && d.x - DROP_W / 2 <= R && d.y + DROP_H / 2 >= T && d.y - DROP_H / 2 <= B;
      if (caught) applyPower(s, d.type, ev);
      else if (d.y - DROP_H / 2 > H) ev.missed++;
      else keep.push(d);
    }
    s.drops = keep;
  }

  function tickEffects(s, ms, ev) {
    TIMED.forEach((k) => {
      if (s.effects[k] <= 0) return;
      s.effects[k] -= ms;
      if (s.effects[k] > 0) return;
      s.effects[k] = 0;
      ev.expired.push(k);
      if (k === 'wide') {
        s.paddle.w = PADDLE_W;
        s.paddle.x = clamp(s.paddle.x, PADDLE_W / 2, W - PADDLE_W / 2);
      }
    });
  }

  /* ---------------- Mất mạng, qua màn ---------------- */
  function loseLife(s, ev) {
    s.lives--;
    ev.lifeLost = true;
    s.drops = [];
    s.chain = 0;
    if (s.lives <= 0) {
      s.lives = 0;
      s.phase = 'over';
      s.balls = [];
      ev.gameOver = true;
      return;
    }
    s.ramp = 1;
    resetPowers(s);
    serve(s);
  }

  function clearLevel(s, ev) {
    s.phase = 'clear';
    const bonus = CLEAR_BONUS * s.level;
    s.score += bonus;
    s.cleared++;
    s.drops = [];
    ev.cleared = true;
    ev.bonus = bonus;
    ev.gained += bonus;
  }

  /** Sang màn kế (gọi sau hiệu ứng qua màn). Trả về true nếu sang được. */
  function nextLevel(s) {
    if (s.phase !== 'clear') return false;
    loadLevel(s, s.level + 1);
    return true;
  }

  /* ---------------- Một bước vật lý ---------------- */
  /**
   * Chạy một bước dtMs (mặc định STEP_MS). input: { dir, target, launch }.
   * Trả về các sự kiện trong bước (xem emptyEvents) để app chạy hiệu ứng.
   */
  function step(s, input, dtMs) {
    const ev = emptyEvents();
    if (s.phase === 'over' || s.phase === 'clear') return ev;
    const ms = isNum(dtMs) && dtMs > 0 ? dtMs : STEP_MS;
    const dt = ms / 1000;

    movePaddle(s, input, dt);
    if (s.phase === 'serve') {
      followPaddle(s);
      if (!(input && input.launch)) return ev;
      launch(s);
      ev.launched = true;
    }

    tickEffects(s, ms, ev);
    const speed = ballSpeed(s);
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i];
      resolvePaddle(s, b, ev); // thanh vừa trượt vào bóng
      aim(b, speed);
      advanceBall(s, b, dt, ev);
    }
    const before = s.balls.length;
    s.balls = s.balls.filter((b) => b.y - BALL_R <= H);
    moveDrops(s, dt, ev);

    if (breakableLeft(s) === 0) {
      clearLevel(s, ev);
    } else if (!s.balls.length) {
      loseLife(s, ev);
    } else if (s.balls.length < before) {
      ev.ballLost = before - s.balls.length;
    }
    return ev;
  }

  /* ---------------- Khôi phục từ localStorage ---------------- */
  const PHASES = ['serve', 'play', 'clear', 'over'];

  /** Kiểm tra và chuẩn hóa state đọc từ bộ nhớ. Dữ liệu hỏng thì trả về null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    if (!PHASES.includes(obj.phase)) return null;
    const level = int(obj.level, 1, 9999, 0);
    const lives = int(obj.lives, 0, MAX_LIVES, -1);
    if (!level || lives < 0 || (lives === 0 && obj.phase !== 'over')) return null;
    if (!Number.isInteger(obj.seed) || !Number.isInteger(obj.score) || obj.score < 0) return null;
    if (!obj.paddle || !isNum(obj.paddle.x)) return null;

    const s = newGame({ seed: obj.seed, level });
    s.score = obj.score;
    s.lives = lives;
    s.phase = obj.phase;
    s.ramp = isNum(obj.ramp) ? clamp(obj.ramp, 1, RAMP_MAX) : 1;
    s.chain = int(obj.chain, 0, 1e6, 0);
    s.bestChain = Math.max(s.chain, int(obj.bestChain, 0, 1e6, 0));
    s.broken = int(obj.broken, 0, 1e9, 0);
    s.cleared = int(obj.cleared, 0, 1e6, 0);

    // Vật phẩm có thời hạn
    const eff = obj.effects && typeof obj.effects === 'object' ? obj.effects : {};
    TIMED.forEach((k) => {
      s.effects[k] = isNum(eff[k]) ? clamp(eff[k], 0, POWER_MS[k]) : 0;
    });
    s.paddle.w = s.effects.wide > 0 ? WIDE_W : PADDLE_W;
    s.paddle.x = clamp(obj.paddle.x, s.paddle.w / 2, W - s.paddle.w / 2);

    // Gạch: dựng lại từ cột / hàng / loại, không tin toạ độ lưu
    if (!Array.isArray(obj.bricks) || obj.bricks.length > COLS * MAX_ROWS) return null;
    const seen = new Set();
    const bricks = [];
    for (let i = 0; i < obj.bricks.length; i++) {
      const o = obj.bricks[i];
      if (!o || !Number.isInteger(o.c) || !Number.isInteger(o.r)) return null;
      if (o.c < 0 || o.c >= COLS || o.r < 0 || o.r >= MAX_ROWS) return null;
      const key = o.r * COLS + o.c;
      if (seen.has(key)) return null;
      seen.add(key);
      let ch;
      if (o.kind === 'x') ch = '#';
      else if (o.kind === 's' && (o.max === 2 || o.max === 3)) ch = String(o.max);
      else if (o.kind === 'n' && COLORS.includes(o.color)) ch = o.drop ? o.color.toUpperCase() : o.color;
      else return null;
      const b = makeBrick(ch, o.c, o.r);
      if (b.kind === 's') {
        if (!Number.isInteger(o.hp) || o.hp < 1 || o.hp > b.max) return null;
        b.hp = o.hp;
      }
      bricks.push(b);
    }
    s.bricks = bricks;

    // Bóng
    if (!Array.isArray(obj.balls) || obj.balls.length > MAX_BALLS) return null;
    const balls = [];
    for (let i = 0; i < obj.balls.length; i++) {
      const o = obj.balls[i];
      if (!o || !isNum(o.x) || !isNum(o.y) || !isNum(o.vx) || !isNum(o.vy)) return null;
      balls.push({
        x: clamp(o.x, BALL_R, W - BALL_R),
        y: clamp(o.y, BALL_R, H + BALL_R),
        vx: o.vx,
        vy: o.vy,
        stuck: o.stuck === true,
        off: isNum(o.off) ? o.off : 0,
        stall: 0,
      });
    }
    // Vật phẩm đang rơi
    const drops = [];
    if (Array.isArray(obj.drops)) {
      obj.drops.slice(0, MAX_DROPS + 8).forEach((d) => {
        if (d && isNum(d.x) && isNum(d.y) && POWERS.includes(d.type)) drops.push({ x: clamp(d.x, 0, W), y: clamp(d.y, -H, H), type: d.type });
      });
    }
    s.drops = drops;

    if (s.phase === 'over') {
      s.balls = [];
      s.drops = [];
    } else if (s.phase === 'clear') {
      s.drops = [];
      s.balls = balls;
    } else if (s.phase === 'serve' || !balls.length || balls.every((b) => b.stuck)) {
      serve(s);
      followPaddle(s);
    } else {
      s.balls = balls.filter((b) => !b.stuck);
      const speed = ballSpeed(s);
      s.balls.forEach((b) => aim(b, speed));
    }
    // Hết gạch phá được mà chưa sang màn: coi như vừa qua màn
    if (s.phase !== 'over' && breakableLeft(s) === 0) s.phase = 'clear';
    return s;
  }

  const api = {
    W,
    H,
    COLS,
    MAX_ROWS,
    BRICK_W,
    BRICK_H,
    GRID_X,
    GRID_Y,
    PADDLE_Y,
    PADDLE_H,
    PADDLE_W,
    WIDE_W,
    BALL_R,
    STEP_MS,
    BASE_SPEED,
    LEVEL_STEP,
    MAX_SPEED,
    RAMP_STEP,
    RAMP_MAX,
    SLOW_FACTOR,
    KEY_SPEED,
    DRAG_SPEED,
    MIN_ANGLE,
    MAX_BOUNCE,
    STALL_BOUNCES,
    START_LIVES,
    MAX_LIVES,
    MAX_BALLS,
    BREAK_POINTS,
    HIT_POINTS,
    CATCH_POINTS,
    CLEAR_BONUS,
    COMBO_STEP,
    MAX_MULT,
    DROP_CHANCE,
    MAX_DROPS,
    DROP_SPEED,
    DROP_W,
    DROP_H,
    POWERS,
    POWER_NAMES,
    POWER_MS,
    TIMED,
    COLORS,
    LEVELS,
    LEVEL_NAMES,
    levelRows,
    levelName,
    loopOf,
    parseLevel,
    levelSpeed,
    ballSpeed,
    bounceDir,
    aim,
    sweepRect,
    overlaps,
    newGame,
    loadLevel,
    nextLevel,
    launch,
    step,
    advanceBall,
    applyPower,
    breakableLeft,
    comboMult,
    multFor,
    paddleRect,
    restore,
    emptyEvents,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PhaGach = api;
})(typeof window !== 'undefined' ? window : null);
