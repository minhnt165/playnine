/* =====================================================================
 * Thiên Thạch - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Sân vuông W x H đơn vị logic, mọi thứ đi xuyên mép sang mép đối diện (đĩa bay chỉ xuyên mép trên / dưới)
 *   - Mô phỏng theo bước cố định 1/60 giây: step(state, input) SỬA TRỰC TIẾP state rồi trả lại nó
 *     (60 bước mỗi giây nên không sao chép state mỗi bước); app vẽ theo state, nghe state.events
 *   - Input mỗi bước: { left, right, thrust, fire, hyper, aim }; aim (radian, có thể bỏ trống) là hướng
 *     cần xoay tới của chế độ cần điều khiển: tàu vẫn xoay với tốc độ thường, không quay tức thời
 *   - Số ngẫu nhiên lấy từ PRNG mulberry32 lưu trong state: cùng seed + cùng chuỗi input thì
 *     ra đúng cùng một ván (test và bot đo điểm dựa vào điều này)
 *   - State là object thuần, JSON.stringify được; toJSON / fromJSON (từ chối dữ liệu hỏng) để lưu ván dở
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Sân và thời gian ---------------- */
  const W = 720;
  const H = 720;
  const FPS = 60; // số bước mỗi giây
  const TAU = Math.PI * 2;

  /* ---------------- Tàu ---------------- */
  const SHIP_R = 11; // bán kính va chạm
  const TURN = 0.075; // radian mỗi bước (~258°/giây)
  const THRUST = 0.13; // gia tốc khi đẩy (đơn vị / bước²)
  const DRAG = 0.988; // vận tốc nhân với hệ số này mỗi bước (quán tính có ma sát nhẹ)
  const MAX_SPEED = 7; // trần tốc độ tàu (đơn vị / bước)
  const SPAWN_INV = 150; // số bước bất tử sau khi hồi sinh (2,5 giây)
  const START_INV = 90; // bất tử lúc vào ván
  const RESPAWN_WAIT = 120; // chờ tối thiểu sau khi nổ rồi mới hồi sinh
  const SAFE_R = 120; // chỉ hồi sinh khi trong bán kính này quanh tâm không có đá / đĩa bay / đạn địch
  const OVER_WAIT = 100; // nổ mạng cuối, chờ chừng ấy bước rồi mới hết ván
  const START_LIVES = 3;
  const MAX_LIVES = 9;
  const EXTRA_LIFE = 10000; // mỗi 10.000 điểm thêm một mạng

  /* ---------------- Dịch chuyển (hyperspace) ---------------- */
  const HYPER_TIME = 36; // số bước tàu "biến mất" (không điều khiển, không va chạm)
  const HYPER_CD = 45; // hiện lại rồi phải chờ chừng ấy bước mới dịch chuyển tiếp được
  const HYPER_FAIL_BASE = 0.08; // xác suất nổ khi hiện lại...
  const HYPER_FAIL_ROCK = 0.005; // ...cộng thêm theo số đá trên sân...
  const HYPER_FAIL_MAX = 0.25; // ...nhưng không quá mức này

  /* ---------------- Đạn của tàu ---------------- */
  const BULLET_SPEED = 9; // cộng thêm vận tốc tàu
  const BULLET_LIFE = 48; // số bước (tầm ~430 đơn vị)
  const MAX_BULLETS = 4;
  const FIRE_CD = 9; // giữ nút bắn: tối đa ~6,7 phát mỗi giây

  /* ---------------- Đá ---------------- */
  const ROCK_R = [0, 10, 20, 36]; // theo cỡ: 1 nhỏ, 2 vừa, 3 lớn
  const ROCK_POINTS = [0, 100, 50, 20];
  const ROCK_SPEED = [[0, 0], [1.5, 2.8], [1, 1.9], [0.6, 1.2]]; // [min, max] mỗi cỡ, ở đợt 1
  const ROCK_MAX_SPEED = 4.5;
  const SPLIT_KEEP = 0.6; // hai mảnh giữ trung bình 60% vận tốc đá mẹ...
  const SPLIT_PUSH = 0.06; // ...cộng một phần vận tốc vật bắn trúng (quán tính khi vỡ)
  const SHAPE_N = 11; // số đỉnh của đường viền đá
  const WAVE_START = 4; // đợt 1 có 4 đá lớn, mỗi đợt thêm 2...
  const WAVE_MAX = 12; // ...tối đa 12
  const WAVE_DELAY = 90; // dọn sạch sân, chờ 1,5 giây rồi sang đợt mới
  const SPAWN_CLEAR = 220; // đá mới xuất hiện cách tàu ít nhất chừng này

  /* ---------------- Đĩa bay ---------------- */
  const SAUCER = {
    big: { r: 16, speed: 1.6, fire: 54, points: 200 },
    small: { r: 9, speed: 2.4, fire: 42, points: 1000 },
  };
  const SAUCER_FIRST = [900, 1300]; // lần đầu sau 15–22 giây
  const SAUCER_GAP = [600, 1100]; // các lần sau (rút ngắn dần theo đợt)
  const SAUCER_MIN_GAP = 360;
  const SMALL_WAVE = 3; // đĩa nhỏ (bắn nhắm) chỉ xuất hiện từ đợt 3...
  const SMALL_SCORE = 10000; // ...hoặc khi đã có 10.000 điểm
  const SBULLET_SPEED = 5.5;
  const SBULLET_LIFE = 70;
  const MAX_SBULLETS = 3;

  /* ---------------- PRNG ---------------- */
  /** mulberry32 trên g.rng: trả số trong [0, 1) và cập nhật g.rng. */
  function rand(g) {
    g.rng = (g.rng + 0x6d2b79f5) | 0;
    let t = g.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const range = (g, a, b) => a + (b - a) * rand(g);

  /** Seed số dùng thẳng; chuỗi băm FNV-1a; bỏ trống thì ngẫu nhiên. */
  function seedOf(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed | 0;
    const s = String(seed == null ? Date.now() + ':' + Math.random() : seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h | 0;
  }

  /* ---------------- Hình học trên sân xuyên mép ---------------- */
  const wrap = (v, size) => ((v % size) + size) % size;
  /** Hiệu tọa độ ngắn nhất trên sân xuyên mép (ví dụ x = 10 và x = 710 cách nhau 20). */
  function delta(a, b, size) {
    let d = b - a;
    if (d > size / 2) d -= size;
    else if (d < -size / 2) d += size;
    return d;
  }
  function dist2(ax, ay, bx, by) {
    const dx = delta(ax, bx, W);
    const dy = delta(ay, by, H);
    return dx * dx + dy * dy;
  }
  /** Hai hình tròn chạm nhau (tính cả qua mép). */
  const circleHit = (ax, ay, ar, bx, by, br) => dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);
  /** Đoạn đi của viên đạn trong một bước (từ x,y theo vx,vy) có cắt hình tròn không: đạn nhanh không xuyên đá nhỏ. */
  function segmentHit(x, y, vx, vy, cx, cy, r) {
    const dx = delta(x, cx, W);
    const dy = delta(y, cy, H);
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? (dx * vx + dy * vy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = dx - vx * t;
    const py = dy - vy * t;
    return px * px + py * py <= r * r;
  }
  function capSpeed(o, max) {
    const s = Math.hypot(o.vx, o.vy);
    if (s > max) {
      o.vx *= max / s;
      o.vy *= max / s;
    }
  }
  /** Góc đưa về (-π, π]. */
  function normAngle(a) {
    const r = wrap(a + Math.PI, TAU) - Math.PI;
    return r === -Math.PI ? Math.PI : r;
  }
  const saucerKind = (u) => SAUCER[u.small ? 'small' : 'big'];

  /* ---------------- Tạo đối tượng ---------------- */
  function newShip(inv) {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv, cd: 0, hyper: 0, hyperCd: 0, thrusting: false };
  }

  const waveSpeedMul = (wave) => Math.min(1.5, 1 + 0.05 * (wave - 1));

  function makeRock(g, size, x, y, vx, vy) {
    const shape = [];
    for (let i = 0; i < SHAPE_N; i++) shape.push(Math.round(range(g, 72, 108))); // % bán kính ở mỗi đỉnh
    return { x: wrap(x, W), y: wrap(y, H), vx, vy, s: size, a: range(g, -Math.PI, Math.PI), spin: range(g, -0.03, 0.03), shape };
  }

  const waveCount = (wave) => Math.min(WAVE_MAX, WAVE_START + 2 * (wave - 1));

  /** Rải đá lớn của một đợt gần mép sân, cách tàu (hoặc tâm nếu tàu đang nổ) ít nhất SPAWN_CLEAR. */
  function spawnWave(g) {
    const n = waveCount(g.wave);
    const cx = g.ship ? g.ship.x : W / 2;
    const cy = g.ship ? g.ship.y : H / 2;
    const mul = waveSpeedMul(g.wave);
    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      for (let k = 0; k < 40; k++) {
        const edge = Math.floor(rand(g) * 4); // 0 trên, 1 dưới, 2 trái, 3 phải
        const along = rand(g) * W;
        const inset = rand(g) * 90;
        x = edge < 2 ? along : edge === 2 ? inset : W - inset;
        y = edge === 0 ? inset : edge === 1 ? H - inset : along;
        if (dist2(x, y, cx, cy) >= SPAWN_CLEAR * SPAWN_CLEAR) break;
        // Hết lượt thử (gần như không xảy ra): đặt đối xứng với tàu qua tâm sân, luôn cách tàu nửa sân
        if (k === 39) {
          x = wrap(cx + W / 2, W);
          y = wrap(cy + H / 2, H);
        }
      }
      const dir = range(g, 0, TAU);
      const sp = range(g, ROCK_SPEED[3][0], ROCK_SPEED[3][1]) * mul;
      g.rocks.push(makeRock(g, 3, x, y, Math.cos(dir) * sp, Math.sin(dir) * sp));
    }
    g.events.push({ type: 'wave', n: g.wave });
  }

  /** Ván mới. seed: số hoặc chuỗi (bỏ trống = ngẫu nhiên). */
  function newGame(seed) {
    const s = seedOf(seed);
    const g = {
      v: VERSION,
      seed: s,
      rng: s,
      tick: 0,
      score: 0,
      lives: START_LIVES,
      nextLife: EXTRA_LIFE,
      wave: 1,
      over: false,
      ship: newShip(START_INV),
      deadT: 0, // tàu đã nổ: đếm ngược tới lúc được hồi sinh / hết ván
      rocks: [],
      bullets: [],
      saucer: null,
      sbullets: [],
      saucerT: 0, // đếm ngược tới đĩa bay kế tiếp
      waveT: 0, // > 0: đã dọn sạch sân, đếm ngược tới đợt mới
      prevHyper: false, // phím dịch chuyển ở bước trước (chỉ dịch chuyển khi vừa nhấn)
      kills: { rocks: 0, saucers: 0 },
      events: [],
    };
    g.saucerT = Math.round(range(g, SAUCER_FIRST[0], SAUCER_FIRST[1]));
    spawnWave(g);
    return g;
  }

  /* ---------------- Điểm, mạng, nổ ---------------- */
  function addScore(g, pts) {
    g.score += pts;
    while (g.score >= g.nextLife) {
      g.nextLife += EXTRA_LIFE;
      if (g.lives < MAX_LIVES) {
        g.lives++;
        g.events.push({ type: 'life' });
      }
    }
  }

  /** Đá thứ i vỡ: cỡ 3 → hai cỡ 2, cỡ 2 → hai cỡ 1, cỡ 1 biến mất. pvx/pvy: vận tốc vật đâm vào (quán tính). */
  function breakRock(g, i, pvx, pvy, byPlayer) {
    const r = g.rocks[i];
    g.rocks.splice(i, 1);
    if (byPlayer) {
      addScore(g, ROCK_POINTS[r.s]);
      g.kills.rocks++;
    }
    g.events.push({ type: 'rock', s: r.s, x: r.x, y: r.y, byPlayer: !!byPlayer });
    if (r.s <= 1) return;
    const size = r.s - 1;
    const mul = waveSpeedMul(g.wave);
    const bx = r.vx * SPLIT_KEEP + pvx * SPLIT_PUSH;
    const by = r.vy * SPLIT_KEEP + pvy * SPLIT_PUSH;
    const dir = range(g, 0, TAU);
    for (let k = 0; k < 2; k++) {
      // Hai mảnh tách về hai phía ngược nhau (lệch ngẫu nhiên một chút) quanh vận tốc chung
      const d = dir + k * Math.PI + range(g, -0.4, 0.4);
      const sp = range(g, ROCK_SPEED[size][0], ROCK_SPEED[size][1]) * mul * 0.7;
      const c = makeRock(g, size, r.x, r.y, bx + Math.cos(d) * sp, by + Math.sin(d) * sp);
      capSpeed(c, ROCK_MAX_SPEED);
      g.rocks.push(c);
    }
  }

  function killShip(g, cause) {
    const s = g.ship;
    g.events.push({ type: 'die', x: s.x, y: s.y, cause });
    g.ship = null;
    g.lives--;
    g.deadT = g.lives > 0 ? RESPAWN_WAIT : OVER_WAIT;
    g.bullets.length = 0;
  }

  function nextSaucerGap(g) {
    const cut = 40 * (g.wave - 1);
    return Math.max(SAUCER_MIN_GAP, Math.round(range(g, SAUCER_GAP[0], SAUCER_GAP[1]) - cut));
  }

  function killSaucer(g, byPlayer) {
    const u = g.saucer;
    if (byPlayer) {
      addScore(g, saucerKind(u).points);
      g.kills.saucers++;
    }
    g.events.push({ type: 'saucer', x: u.x, y: u.y, small: u.small, byPlayer: !!byPlayer });
    g.saucer = null;
    g.saucerT = nextSaucerGap(g);
  }

  /* ---------------- Đĩa bay ---------------- */
  /** Xác suất gặp đĩa nhỏ: 0 trước đợt 3 / 10.000 điểm, sau đó tăng dần. */
  function smallChance(g) {
    if (g.wave < SMALL_WAVE && g.score < SMALL_SCORE) return 0;
    return Math.min(0.85, 0.3 + 0.1 * Math.max(0, g.wave - SMALL_WAVE) + g.score / 40000);
  }

  /** Độ lệch tối đa (radian) khi đĩa nhỏ nhắm bắn: điểm càng cao bắn càng chuẩn. */
  const aimSpread = (g) => Math.max(0.06, 0.35 - g.score / 60000);

  function spawnSaucer(g) {
    const small = rand(g) < smallChance(g);
    const k = SAUCER[small ? 'small' : 'big'];
    const fromLeft = rand(g) < 0.5;
    g.saucer = {
      x: fromLeft ? -k.r : W + k.r,
      y: range(g, H * 0.1, H * 0.9),
      vx: fromLeft ? k.speed : -k.speed,
      vy: 0,
      small,
      fireT: Math.round(k.fire * 0.6),
      turnT: Math.round(range(g, 40, 90)),
    };
    g.events.push({ type: 'saucerIn', small });
  }

  function saucerFire(g) {
    const u = g.saucer;
    if (g.sbullets.length >= MAX_SBULLETS) return;
    let dir;
    if (u.small && g.ship && !g.ship.hyper) {
      // Đĩa nhỏ: nhắm vào tàu theo đường ngắn nhất qua mép, lệch ngẫu nhiên trong ±aimSpread
      dir = Math.atan2(delta(u.y, g.ship.y, H), delta(u.x, g.ship.x, W)) + range(g, -1, 1) * aimSpread(g);
    } else {
      dir = range(g, -Math.PI, Math.PI); // đĩa lớn: bắn hướng ngẫu nhiên
    }
    g.sbullets.push({ x: wrap(u.x, W), y: u.y, vx: Math.cos(dir) * SBULLET_SPEED, vy: Math.sin(dir) * SBULLET_SPEED, life: SBULLET_LIFE });
    g.events.push({ type: 'saucerShot', small: u.small });
  }

  /** Tâm sân đủ trống để hồi sinh: không đá, đĩa bay hay đạn địch nào trong SAFE_R. */
  function centerClear(g) {
    const cx = W / 2;
    const cy = H / 2;
    for (const r of g.rocks) if (circleHit(cx, cy, SAFE_R, r.x, r.y, ROCK_R[r.s])) return false;
    if (g.saucer && circleHit(cx, cy, SAFE_R, g.saucer.x, g.saucer.y, saucerKind(g.saucer).r)) return false;
    for (const b of g.sbullets) if (circleHit(cx, cy, SAFE_R, b.x, b.y, 0)) return false;
    return true;
  }

  /* ---------------- Một bước mô phỏng ---------------- */
  const NO_INPUT = {};

  function controlShip(g, s, inp, hyperPress) {
    if (s.inv > 0) s.inv--;
    if (s.cd > 0) s.cd--;
    if (s.hyperCd > 0) s.hyperCd--;
    s.thrusting = false;
    if (s.hyper > 0) {
      if (--s.hyper === 0) {
        // Hiện lại ở chỗ ngẫu nhiên; có xác suất nổ (rủi ro của dịch chuyển)
        s.x = range(g, 0, W);
        s.y = range(g, 0, H);
        s.hyperCd = HYPER_CD;
        g.events.push({ type: 'hyperOut', x: s.x, y: s.y });
        const fail = Math.min(HYPER_FAIL_MAX, HYPER_FAIL_BASE + HYPER_FAIL_ROCK * g.rocks.length);
        if (rand(g) < fail) killShip(g, 'hyper');
      }
      return;
    }
    if (typeof inp.aim === 'number' && Number.isFinite(inp.aim)) {
      const diff = normAngle(inp.aim - s.a);
      s.a += Math.abs(diff) <= TURN ? diff : Math.sign(diff) * TURN;
    } else {
      if (inp.left) s.a -= TURN;
      if (inp.right) s.a += TURN;
    }
    s.a = normAngle(s.a);
    if (inp.thrust) {
      s.vx += Math.cos(s.a) * THRUST;
      s.vy += Math.sin(s.a) * THRUST;
      s.thrusting = true;
    }
    s.vx *= DRAG;
    s.vy *= DRAG;
    capSpeed(s, MAX_SPEED);
    s.x = wrap(s.x + s.vx, W);
    s.y = wrap(s.y + s.vy, H);
    if (inp.fire && s.cd === 0 && g.bullets.length < MAX_BULLETS) {
      const nx = Math.cos(s.a);
      const ny = Math.sin(s.a);
      g.bullets.push({ x: wrap(s.x + nx * 14, W), y: wrap(s.y + ny * 14, H), vx: nx * BULLET_SPEED + s.vx, vy: ny * BULLET_SPEED + s.vy, life: BULLET_LIFE });
      s.cd = FIRE_CD;
      g.events.push({ type: 'shot' });
    }
    if (hyperPress && s.hyperCd === 0) {
      s.hyper = HYPER_TIME;
      s.vx = 0;
      s.vy = 0;
      g.events.push({ type: 'hyperIn', x: s.x, y: s.y });
    }
  }

  function moveSaucer(g) {
    const u = g.saucer;
    u.x += u.vx;
    u.y = wrap(u.y + u.vy, H);
    if (--u.turnT <= 0) {
      // Đổi hướng dọc: lên chéo, ngang, xuống chéo
      u.vy = Math.abs(u.vx) * [-0.8, 0, 0.8][Math.floor(rand(g) * 3)];
      u.turnT = Math.round(range(g, 40, 90));
    }
    const r = saucerKind(u).r;
    if ((u.vx > 0 && u.x > W + r) || (u.vx < 0 && u.x < -r)) {
      // Bay hết bề ngang thì rời sân (không tính điểm)
      g.saucer = null;
      g.saucerT = nextSaucerGap(g);
    } else if (--u.fireT <= 0) {
      u.fireT = saucerKind(u).fire;
      saucerFire(g);
    }
  }

  /** Đạn bay một bước; trúng thì xử lý bằng onHit (trả true nếu trúng) và xóa viên đạn. */
  function moveBullets(list, onHit) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (onHit(b)) {
        list.splice(i, 1);
        continue;
      }
      b.x = wrap(b.x + b.vx, W);
      b.y = wrap(b.y + b.vy, H);
      if (--b.life <= 0) list.splice(i, 1);
    }
  }

  function hitRock(g, b, byPlayer) {
    for (let j = 0; j < g.rocks.length; j++) {
      const r = g.rocks[j];
      if (segmentHit(b.x, b.y, b.vx, b.vy, r.x, r.y, ROCK_R[r.s])) {
        breakRock(g, j, b.vx, b.vy, byPlayer);
        return true;
      }
    }
    return false;
  }

  /**
   * Chạy một bước 1/60 giây. input: { left, right, thrust, fire, hyper, aim } (thiếu = không bấm).
   * Sửa trực tiếp g, trả về g; g.events chứa các sự kiện của bước này (âm thanh / hiệu ứng).
   */
  function step(g, input) {
    g.events = [];
    if (g.over) return g;
    const inp = input || NO_INPUT;
    g.tick++;
    const wasDead = !g.ship; // bước tàu vừa nổ chưa tính vào thời gian chờ
    const hyperPress = !!inp.hyper && !g.prevHyper;
    g.prevHyper = !!inp.hyper;

    if (g.ship) controlShip(g, g.ship, inp, hyperPress);

    for (const r of g.rocks) {
      r.x = wrap(r.x + r.vx, W);
      r.y = wrap(r.y + r.vy, H);
      r.a = normAngle(r.a + r.spin);
    }
    if (g.saucer) moveSaucer(g);

    // Đạn của tàu: trúng đá (có điểm) hoặc đĩa bay
    moveBullets(g.bullets, (b) => {
      if (hitRock(g, b, true)) return true;
      const u = g.saucer;
      if (u && segmentHit(b.x, b.y, b.vx, b.vy, u.x, u.y, saucerKind(u).r)) {
        killSaucer(g, true);
        return true;
      }
      return false;
    });

    // Đạn đĩa bay: làm vỡ đá (không ai được điểm) hoặc trúng tàu
    moveBullets(g.sbullets, (b) => {
      if (hitRock(g, b, false)) return true;
      const s = g.ship;
      if (s && !s.hyper && s.inv === 0 && segmentHit(b.x, b.y, b.vx, b.vy, s.x, s.y, SHIP_R)) {
        killShip(g, 'shot');
        return true;
      }
      return false;
    });

    // Tàu đâm đá / đĩa bay: cả hai cùng nổ, vẫn được điểm (như máy arcade xưa)
    const s = g.ship;
    if (s && !s.hyper && s.inv === 0) {
      for (let j = 0; j < g.rocks.length; j++) {
        const r = g.rocks[j];
        if (circleHit(s.x, s.y, SHIP_R, r.x, r.y, ROCK_R[r.s])) {
          breakRock(g, j, s.vx, s.vy, true);
          killShip(g, 'rock');
          break;
        }
      }
      const u = g.saucer;
      if (g.ship && u && circleHit(s.x, s.y, SHIP_R, u.x, u.y, saucerKind(u).r)) {
        killSaucer(g, true);
        killShip(g, 'saucer');
      }
    }

    // Đĩa bay đâm đá: đĩa nổ, đá vỡ, không ai được điểm
    if (g.saucer) {
      const u = g.saucer;
      for (let j = 0; j < g.rocks.length; j++) {
        const r = g.rocks[j];
        if (circleHit(u.x, u.y, saucerKind(u).r, r.x, r.y, ROCK_R[r.s])) {
          breakRock(g, j, u.vx, u.vy, false);
          killSaucer(g, false);
          break;
        }
      }
    }

    // Đĩa bay mới: chỉ khi trên sân còn đá (không xuất hiện lúc chuyển đợt)
    if (!g.saucer && g.waveT === 0 && g.rocks.length > 0 && --g.saucerT <= 0) spawnSaucer(g);

    // Hồi sinh (chờ đủ lâu và tâm sân trống) / hết ván
    if (!g.ship) {
      if (wasDead && g.deadT > 0) g.deadT--;
      if (g.deadT === 0) {
        if (g.lives <= 0) {
          g.over = true;
          g.events.push({ type: 'over' });
          return g;
        }
        if (centerClear(g)) {
          g.ship = newShip(SPAWN_INV);
          g.events.push({ type: 'respawn' });
        }
      }
    }

    // Dọn sạch đá: chờ một chút rồi sang đợt mới
    if (g.rocks.length === 0) {
      if (g.waveT === 0) {
        g.waveT = WAVE_DELAY;
        g.events.push({ type: 'clear', n: g.wave });
      } else if (--g.waveT === 0) {
        g.wave++;
        spawnWave(g);
      }
    }
    return g;
  }

  /** Chạy n bước; input là object cố định hoặc hàm (g, i) → input. Dừng sớm khi hết ván. */
  function run(g, n, input) {
    for (let i = 0; i < n && !g.over; i++) step(g, typeof input === 'function' ? input(g, i) : input);
    return g;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const KEYS = ['seed', 'rng', 'tick', 'score', 'lives', 'nextLife', 'wave', 'deadT', 'saucerT', 'waveT', 'over', 'prevHyper'];
  const copyBullet = (b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life });
  const copyRock = (r) => ({ x: r.x, y: r.y, vx: r.vx, vy: r.vy, s: r.s, a: r.a, spin: r.spin, shape: r.shape.slice() });
  const copyShip = (s) => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, a: s.a, inv: s.inv, cd: s.cd, hyper: s.hyper, hyperCd: s.hyperCd, thrusting: !!s.thrusting });
  const copySaucer = (u) => ({ x: u.x, y: u.y, vx: u.vx, vy: u.vy, small: u.small, fireT: u.fireT, turnT: u.turnT });

  function toJSON(g) {
    const out = { v: VERSION };
    KEYS.forEach((k) => { out[k] = g[k]; });
    out.ship = g.ship ? copyShip(g.ship) : null;
    out.rocks = g.rocks.map(copyRock);
    out.bullets = g.bullets.map(copyBullet);
    out.saucer = g.saucer ? copySaucer(g.saucer) : null;
    out.sbullets = g.sbullets.map(copyBullet);
    out.kills = { rocks: g.kills.rocks, saucers: g.kills.saucers };
    return out;
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const inField = (o) => isNum(o.x) && isNum(o.y) && o.x >= 0 && o.x < W && o.y >= 0 && o.y < H;
  const okVel = (o, max) => isNum(o.vx) && isNum(o.vy) && Math.hypot(o.vx, o.vy) <= max + 1e-6;
  const I32 = 2147483647;

  function okShip(s) {
    return isObj(s) && inField(s) && okVel(s, MAX_SPEED) && isNum(s.a) && Math.abs(s.a) <= Math.PI + 1e-9 &&
      isInt(s.inv, 0, SPAWN_INV) && isInt(s.cd, 0, FIRE_CD) && isInt(s.hyper, 0, HYPER_TIME) && isInt(s.hyperCd, 0, HYPER_CD);
  }
  function okRock(r) {
    return isObj(r) && inField(r) && okVel(r, ROCK_MAX_SPEED * 1.5) && isInt(r.s, 1, 3) && isNum(r.a) && isNum(r.spin) && Math.abs(r.spin) <= 0.05 &&
      Array.isArray(r.shape) && r.shape.length === SHAPE_N && r.shape.every((v) => isInt(v, 50, 120));
  }
  const okBullet = (b, life) => isObj(b) && inField(b) && okVel(b, 30) && isInt(b.life, 1, life);
  function okSaucer(u) {
    return isObj(u) && typeof u.small === 'boolean' && isNum(u.x) && u.x >= -40 && u.x <= W + 40 && isNum(u.y) && u.y >= 0 && u.y < H &&
      okVel(u, 5) && isInt(u.fireT, -1, 200) && isInt(u.turnT, -1, 200);
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!isObj(raw) || raw.v !== VERSION) return null;
    if (!isInt(raw.seed, -I32 - 1, I32) || !isInt(raw.rng, -I32 - 1, I32)) return null;
    if (!isInt(raw.tick, 0, 1e9) || !isInt(raw.score, 0, 1e9) || !isInt(raw.lives, 0, MAX_LIVES) || !isInt(raw.wave, 1, 1e5)) return null;
    if (!isInt(raw.nextLife, EXTRA_LIFE, 2e9) || raw.nextLife % EXTRA_LIFE !== 0 || raw.nextLife <= raw.score) return null;
    if (!isInt(raw.deadT, 0, Math.max(RESPAWN_WAIT, OVER_WAIT)) || !isInt(raw.saucerT, -1e6, 1e6) || !isInt(raw.waveT, 0, WAVE_DELAY)) return null;
    if (typeof raw.over !== 'boolean' || typeof raw.prevHyper !== 'boolean') return null;
    if (!isObj(raw.kills) || !isInt(raw.kills.rocks, 0, 1e9) || !isInt(raw.kills.saucers, 0, 1e9)) return null;
    if (raw.ship !== null && !okShip(raw.ship)) return null;
    if (raw.ship && raw.deadT !== 0) return null; // tàu còn sống thì không đếm ngược hồi sinh
    if (!raw.ship && raw.lives === 0 && !raw.over && raw.deadT === 0) return null; // hết mạng mà chưa hết ván
    if (!Array.isArray(raw.rocks) || raw.rocks.length > 400 || !raw.rocks.every(okRock)) return null;
    if (!Array.isArray(raw.bullets) || raw.bullets.length > MAX_BULLETS || !raw.bullets.every((b) => okBullet(b, BULLET_LIFE))) return null;
    if (!Array.isArray(raw.sbullets) || raw.sbullets.length > MAX_SBULLETS || !raw.sbullets.every((b) => okBullet(b, SBULLET_LIFE))) return null;
    if (raw.saucer !== null && !okSaucer(raw.saucer)) return null;

    const g = { v: VERSION };
    KEYS.forEach((k) => { g[k] = raw[k]; });
    g.ship = raw.ship ? copyShip(raw.ship) : null;
    g.rocks = raw.rocks.map(copyRock);
    g.bullets = raw.bullets.map(copyBullet);
    g.saucer = raw.saucer ? copySaucer(raw.saucer) : null;
    g.sbullets = raw.sbullets.map(copyBullet);
    g.kills = { rocks: raw.kills.rocks, saucers: raw.kills.saucers };
    g.events = [];
    return g;
  }

  /** Thời gian đã chơi (ms) theo số bước mô phỏng. */
  const elapsedMs = (g) => Math.round((g.tick * 1000) / FPS);
  const rockRadius = (s) => ROCK_R[s];
  const saucerRadius = (small) => SAUCER[small ? 'small' : 'big'].r;

  const CONST = {
    W, H, FPS, SHIP_R, TURN, THRUST, DRAG, MAX_SPEED, SPAWN_INV, START_INV, RESPAWN_WAIT, SAFE_R, OVER_WAIT,
    START_LIVES, MAX_LIVES, EXTRA_LIFE, HYPER_TIME, HYPER_CD, BULLET_SPEED, BULLET_LIFE, MAX_BULLETS, FIRE_CD,
    ROCK_R, ROCK_POINTS, ROCK_MAX_SPEED, SPLIT_KEEP, SPLIT_PUSH, SHAPE_N, WAVE_DELAY, SPAWN_CLEAR, SAUCER,
    SMALL_WAVE, SMALL_SCORE, SBULLET_SPEED, SBULLET_LIFE, MAX_SBULLETS,
  };

  const api = {
    VERSION, CONST, newGame, step, run, toJSON, fromJSON, elapsedMs, waveCount, smallChance, aimSpread,
    rockRadius, saucerRadius, centerClear, spawnSaucer, delta, wrap, normAngle, circleHit, segmentHit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
