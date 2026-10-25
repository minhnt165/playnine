/* =====================================================================
 * Pinball - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn dọc 600 × 1000 đơn vị, chủ đề "Tinh vân": bi bán kính 13, lò xo phóng bi ở làn phải,
 *     2 flipper, 3 bumper (hành tinh), 2 slingshot, 4 target hạ được (thiên thạch), 3 làn rollover trên
 *     (U F O), 1 ramp vòng quanh bàn (đường quỹ đạo), inlane / outlane, ball save, multiball 2 bi
 *   - Vật lý 2D tự viết: một nhịp 1/120 s (đọc input) chia 4 bước con 1/480 s. Trong mỗi bước con tìm va chạm
 *     sớm nhất theo thời gian tiếp xúc: tường (đoạn thẳng, đầu đoạn) và bumper / cột (hình tròn) giải đúng
 *     bằng phương trình bậc hai; flipper (đang quay) dùng "tiến bảo thủ" (conservative advancement) với
 *     khoảng cách chính xác tới vỏ hai hình tròn của flipper nên bi không xuyên flipper / tường dù rất nhanh
 *   - Trọng lực theo độ nghiêng bàn 6,5° (g · sin 6,5°, 1 m = 1200 đơn vị), tích phân kiểu leapfrog
 *     (nửa cú hích trọng lực đầu / cuối bước con) nên rơi tự do đúng công thức ½·g·t²
 *   - Flipper là vật quay khối lượng vô hạn: vận tốc điểm tiếp xúc ω × r truyền vào bi khi va chạm
 *   - Tất định: PRNG mulberry32 lưu trong ván; cùng seed + cùng chuỗi input (theo nhịp) ra cùng một ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Kích thước và hằng số vật lý ---------------- */
  const W = 600;
  const H = 1000;
  const CX = 280; // trục giữa vùng chơi (làn phóng bi chiếm mép phải)
  const R = 13; // bán kính bi
  const TPS = 120; // nhịp / giây (input đọc mỗi nhịp)
  const SUB = 4; // bước con mỗi nhịp
  const DT = 1 / TPS;
  const HS = DT / SUB;
  const SLOPE_DEG = 6.5;
  const UNITS_PER_M = 1200;
  const G = 9.81 * Math.sin((SLOPE_DEG * Math.PI) / 180) * UNITS_PER_M; // ≈ 1333 đơn vị / s²
  const VMAX = 3200; // trần tốc độ bi
  const REST_V = 40; // va chạm chậm hơn thế thì không nảy (bi lăn êm trên mặt nghiêng, không rung)
  const MAX_EV = 24; // số va chạm tối đa trong một bước con (chặn vòng lặp kẹt)
  const CONTACT = 0.05; // coi là chạm flipper khi cách vỏ ít hơn thế

  const E_WALL = 0.45; // hệ số nảy tường
  const F_WALL = 0.02; // phần vận tốc tiếp tuyến mất khi chạm tường
  const E_RUBBER = 0.7; // cột cao su, cạnh slingshot
  const E_FLIP = 0.4; // mặt cao su flipper
  const F_FLIP = 0.03;
  const E_TARGET = 0.4;
  const E_BALL = 0.9;
  const BUMPER_KICK = 950; // bumper đẩy bi ra ít nhất tốc độ này
  const SLING_KICK = 820;
  const SLING_MIN = 120; // va mạnh hơn thế slingshot mới bật
  const TARGET_MIN = 60;

  const W_UP = 30; // rad/s khi bật flipper
  const W_DOWN = 14; // rad/s khi thả
  const PULL_TIME = 1; // giữ 1 giây thì nén hết lò xo
  const PULL_DIST = 34;
  const PLUNGE_MIN = 500;
  const PLUNGE_MAX = 2400;
  const AUTO_POWER = 0.82; // lực tự phóng (ball save, multiball)
  const PLUNGER_Y = 965;
  const LANE_X0 = 556;
  const LANE_X1 = 590;
  const LANE_CX = (LANE_X0 + LANE_X1) / 2;
  const LANE_TOP = 330;

  const BALLS = 3;
  const SAVE_TICKS = 8 * TPS; // ball save sau khi phóng
  const MB_SAVE_TICKS = 10 * TPS;
  const SERVE_TICKS = Math.round(0.6 * TPS); // chờ trước khi tự phóng
  const SUPER_TICKS = 20 * TPS; // chế độ "Siêu hành tinh"
  const BANK_RESET_TICKS = Math.round(1.2 * TPS);
  const SKILL_TICKS = 5 * TPS;
  const STILL_TICKS = 5 * TPS; // bi đứng im quá lâu (ngoài flipper / làn phóng) thì "tìm bi": đẩy nhẹ
  const RAMPS_FOR_MB = 3;
  const MAX_MULT = 5;
  const RAMP_DRAG = 0.35; // cản trên ramp (1/s)
  const RAMP_EXIT_MAX = 820;

  const SCORE = {
    bumper: 100,
    superBumper: 500,
    sling: 50,
    target: 750,
    bank: 10000,
    lane: 500,
    laneLit: 100,
    lanesDone: 5000,
    maxMult: 20000,
    inlane: 1000,
    outlane: 2500,
    ramp: 5000,
    jackpot: 25000,
    skill: 15000,
  };

  /* ---------------- Hình học bàn ---------------- */
  const mx = (x) => 2 * CX - x; // đối xứng qua trục giữa vùng chơi
  const SHAPES = [];
  function seg(ax, ay, bx, by, kind, extra) {
    const L = Math.hypot(bx - ax, by - ay);
    const s = Object.assign({ t: 0, ax, ay, bx, by, ux: (bx - ax) / L, uy: (by - ay) / L, L, kind, id: 0, oneWay: 0 }, extra || {});
    s.x0 = Math.min(ax, bx);
    s.x1 = Math.max(ax, bx);
    s.y0 = Math.min(ay, by);
    s.y1 = Math.max(ay, by);
    SHAPES.push(s);
    return s;
  }
  function circ(x, y, r, kind, extra) {
    const c = Object.assign({ t: 1, x, y, r, kind, id: 0 }, extra || {});
    c.x0 = x - r;
    c.x1 = x + r;
    c.y0 = y - r;
    c.y1 = y + r;
    SHAPES.push(c);
    return c;
  }

  // Vòm trên: cung tâm (301, 290) bán kính 289 nối tường trái (x = 12) với tường phải (x = 590)
  const ARC = { x: 301, y: 290, r: 289, n: 32 };
  const ARC_PTS = [];
  for (let i = 0; i <= ARC.n; i++) {
    const a = Math.PI + (Math.PI * i) / ARC.n;
    ARC_PTS.push([ARC.x + ARC.r * Math.cos(a), ARC.y + ARC.r * Math.sin(a)]);
  }
  for (let i = 0; i < ARC.n; i++) seg(ARC_PTS[i][0], ARC_PTS[i][1], ARC_PTS[i + 1][0], ARC_PTS[i + 1][1], 'wall');
  seg(12, 290, 12, 1060, 'wall'); // tường trái
  seg(590, 290, 590, 1060, 'wall'); // tường phải (mép ngoài làn phóng)
  // Vách ngăn làn phóng: dày 8, đỉnh tròn
  seg(548, 1060, 548, LANE_TOP, 'wall');
  seg(LANE_X0, LANE_TOP, LANE_X0, 1060, 'wall');
  circ(552, LANE_TOP, 4, 'wall');
  // Cửa một chiều ở đầu làn phóng: bi đi lên qua được, rơi từ trên xuống thì bị hắt vào bàn
  const GATE = seg(552, LANE_TOP - 4, 590, LANE_TOP - 32, 'gate', { oneWay: -1 }); // pháp tuyến (-uy, ux) hướng xuống: chặn phía trên
  // Mặt lò xo (y đổi theo độ nén, đọc từ ván khi tính va chạm)
  const PLUNGER = seg(LANE_X0, PLUNGER_Y, LANE_X1, PLUNGER_Y, 'plunger');

  // Phía dưới: thanh dẫn inlane / outlane, ray dẫn xuống flipper, slingshot (trái rồi đối xứng sang phải)
  const SLINGS = [];
  const GUIDES = [];
  [0, 1].forEach((side) => {
    const X = side ? mx : (x) => x;
    GUIDES.push([[X(54), 700], [X(54), 812], [X(181), 882.8]]);
    circ(X(54), 700, 5, 'rubber');
    seg(X(54), 700, X(54), 812, 'wall');
    seg(X(54), 812, X(181), 882.8, 'wall'); // ray chạm gốc flipper (lọt vào hình tròn gốc một chút): bi lăn liền mạch lên flipper, không có hõm
    const A = [X(108), 690];
    const B = [X(108), 800];
    const C = [X(160), 830];
    SLINGS.push([A, B, C]);
    seg(A[0], A[1], C[0], C[1], 'sling', { id: side }); // mặt đá bóng
    seg(A[0], A[1], B[0], B[1], 'rubber');
    seg(B[0], B[1], C[0], C[1], 'rubber');
  });

  // Làn rollover trên: 3 làn rộng 55 giữa 4 thanh dẫn
  const LANES = [0, 1, 2].map((i) => CX - 55 + 55 * i);
  const LANE_GUIDES = [0, 1, 2, 3].map((k) => CX - 82.5 + 55 * k);
  LANE_GUIDES.forEach((x) => seg(x, 130, x, 190, 'wall'));

  // Bumper (hành tinh)
  const BUMPERS = [
    { x: CX - 62, y: 285, r: 28 },
    { x: CX + 62, y: 285, r: 28 },
    { x: CX, y: 372, r: 28 },
  ];
  BUMPERS.forEach((b, i) => circ(b.x, b.y, b.r, 'bumper', { id: i }));

  // Dãy target hạ được ở tường trái (mặt quay sang phải)
  const TARGETS = [0, 1, 2, 3].map((i) => ({ x: 34, y0: 384 + i * 34, y1: 414 + i * 34 }));
  TARGETS.forEach((tg, i) => seg(tg.x, tg.y0, tg.x, tg.y1, 'target', { id: i }));

  // Miệng ramp: khe giữa hai cột, hướng lên phải; bi bị "bắt" lên ramp ngay khi tâm qua vạch miệng.
  // Khối đế ramp bịt kín phía sau miệng tới vách làn phóng; mái nghiêng xuống trái để bi rơi từ trên không nằm kẹt.
  const MOUTH = { ax: 444, ay: 455, bx: 496, by: 485, nx: 0.5, ny: -Math.sqrt(3) / 2 };
  circ(MOUTH.ax, MOUTH.ay, 6, 'rubber');
  circ(MOUTH.bx, MOUTH.by, 6, 'rubber');
  const RAMP_BASE = [[MOUTH.ax, MOUTH.ay], [474, 403], [548, 360], [548, 472], [MOUTH.bx, MOUTH.by]];
  seg(MOUTH.ax, MOUTH.ay, 474, 403, 'wall');
  seg(474, 403, 548, 360, 'wall');
  seg(MOUTH.bx, MOUTH.by, 548, 472, 'wall');

  // Flipper: chốt (px, py), dài L, bán kính gốc r0, đầu r1; góc theo hướng (cos a, sin a), y hướng xuống
  const D30 = Math.PI / 6;
  const DUP = (28 * Math.PI) / 180;
  const FLIPPERS = [
    { px: CX - 105, py: 893, L: 88, r0: 12, r1: 6.5, rest: D30, up: -DUP },
    { px: CX + 105, py: 893, L: 88, r0: 12, r1: 6.5, rest: Math.PI - D30, up: Math.PI + DUP },
  ];
  FLIPPERS.forEach((f) => {
    f.k = (f.r0 - f.r1) / f.L;
    f.c = Math.sqrt(1 - f.k * f.k);
    f.lo = Math.min(f.rest, f.up);
    f.hi = Math.max(f.rest, f.up);
    f.reach = f.L + f.r1;
  });

  // Cảm biến (hình chữ nhật, tính khi tâm bi đi vào)
  const SENSORS = [];
  LANES.forEach((x, i) => SENSORS.push({ k: 'lane', i, x0: x - 20, x1: x + 20, y0: 148, y1: 172 }));
  [0, 1].forEach((side) => {
    const r = (a, b) => (side ? [mx(b), mx(a)] : [a, b]);
    const [ix0, ix1] = r(56, 106);
    const [ox0, ox1] = r(14, 52);
    SENSORS.push({ k: 'inlane', i: side, x0: ix0, x1: ix1, y0: 735, y1: 765 });
    SENSORS.push({ k: 'outlane', i: side, x0: ox0, x1: ox1, y0: 735, y1: 765 });
  });

  /* ---------------- Ramp: đường cong (Catmull-Rom) lấy mẫu đều ---------------- */
  const RAMP_CTRL = [
    [470, 470], [500, 418], [520, 330], [522, 240], [500, 160], [450, 105], [380, 78], [280, 70],
    [180, 78], [110, 105], [62, 160], [42, 260], [40, 360], [44, 470], [58, 560], [78, 610], [85, 645], [85, 662],
  ];
  const RAMP = (function () {
    const dense = [];
    const P = RAMP_CTRL;
    const n = P.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[Math.max(0, i - 1)];
      const p1 = P[i];
      const p2 = P[i + 1];
      const p3 = P[Math.min(n - 1, i + 2)];
      for (let k = 0; k < 24; k++) {
        const t = k / 24;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    dense.push(P[n - 1]);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const len = cum[cum.length - 1];
    const ds = 4;
    const m = Math.floor(len / ds) + 1;
    const x = new Array(m);
    const y = new Array(m);
    let j = 0;
    for (let i = 0; i < m; i++) {
      const s = Math.min(len, i * ds);
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      x[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
      y[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    }
    const tx = new Array(m);
    const ty = new Array(m);
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(m - 1, i + 1);
      const l = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
      tx[i] = (x[b] - x[a]) / l;
      ty[i] = (y[b] - y[a]) / l;
    }
    return { x, y, tx, ty, ds, n: m, len: (m - 1) * ds };
  })();
  function rampAt(s) {
    const f = Math.max(0, Math.min(RAMP.n - 1, s / RAMP.ds));
    const i = Math.min(RAMP.n - 2, Math.floor(f));
    const u = f - i;
    return {
      x: RAMP.x[i] + (RAMP.x[i + 1] - RAMP.x[i]) * u,
      y: RAMP.y[i] + (RAMP.y[i + 1] - RAMP.y[i]) * u,
      tx: RAMP.tx[i] + (RAMP.tx[i + 1] - RAMP.tx[i]) * u,
      ty: RAMP.ty[i] + (RAMP.ty[i + 1] - RAMP.ty[i]) * u,
    };
  }

  /* ---------------- PRNG ---------------- */
  function mulberry(state) {
    let a = state >>> 0;
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { state: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }
  function rand(g) {
    const r = mulberry(g.rng);
    g.rng = r.state;
    return r.value;
  }
  function seedOf(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const s = String(seed == null ? Date.now() : seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /* ---------------- Ván ---------------- */
  function makeBall(x, y, vx, vy) {
    return { x, y, vx: vx || 0, vy: vy || 0, ramp: null, lane: x > LANE_X0 - 4 && y > LANE_TOP - 10, sens: 0, still: 0 };
  }
  const laneBall = () => makeBall(LANE_CX, PLUNGER_Y - R, 0, 0);

  function newGame(seed) {
    const s = seedOf(seed);
    const g = {
      seed: s,
      rng: s,
      tick: 0,
      score: 0,
      ball: 1,
      over: false,
      balls: [laneBall()],
      flips: [{ a: FLIPPERS[0].rest, w: 0 }, { a: FLIPPERS[1].rest, w: 0 }],
      held: [false, false],
      plunger: 0,
      pulling: false,
      queue: 0,
      serveT: 0,
      saveArmed: true,
      saveT: 0,
      multi: false,
      ramps: 0,
      mult: 1,
      lanes: [false, false, false],
      skill: -1,
      skillT: 0,
      targets: [true, true, true, true],
      bankT: 0,
      superT: 0,
      fx: { bumper: [-99, -99, -99], sling: [-99, -99], target: [-99, -99, -99, -99], lane: [-99, -99, -99], ramp: -99, flip: [-99, -99] },
      count: { ramps: 0, banks: 0, jackpots: 0, multiballs: 0, bumpers: 0 },
      events: [],
    };
    g.skill = Math.floor(rand(g) * 3);
    return g;
  }

  function addScore(g, base) {
    g.score += base * g.mult;
    return base * g.mult;
  }

  /* ---------------- Khoảng cách tới flipper ---------------- */
  /**
   * Khoảng cách có dấu từ điểm (x, y) tới vỏ flipper f ở góc a (vỏ lồi của hai hình tròn r0 ở chốt, r1 ở đầu),
   * kèm pháp tuyến ngoài (nx, ny) tại điểm gần nhất. Hàm 1-Lipschitz nên dùng được cho tiến bảo thủ.
   */
  function flipperDist(f, a, x, y) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dx = x - f.px;
    const dy = y - f.py;
    const lx = dx * ca + dy * sa;
    const ly = -dx * sa + dy * ca;
    const ay = Math.abs(ly);
    const sy = ly < 0 ? -1 : 1;
    const s = lx * f.c - ay * f.k;
    let d;
    let nlx;
    let nly;
    if (s <= 0) {
      const l = Math.hypot(lx, ly) || 1e-9;
      d = l - f.r0;
      nlx = lx / l;
      nly = ly / l;
    } else if (s >= f.L * f.c) {
      const ex = lx - f.L;
      const l = Math.hypot(ex, ly) || 1e-9;
      d = l - f.r1;
      nlx = ex / l;
      nly = ly / l;
    } else {
      d = lx * f.k + ay * f.c - f.r0;
      nlx = f.k;
      nly = f.c * sy;
    }
    return { d, nx: nlx * ca - nly * sa, ny: nlx * sa + nly * ca };
  }

  /* ---------------- Va chạm ---------------- */
  /** Điểm (qx, qy) tương đối tâm, vận tốc (vx, vy), chạm khi cách tâm rr. Trả { t, nx, ny } hoặc null. */
  function circleTOI(qx, qy, vx, vy, rr, tmax) {
    const b = qx * vx + qy * vy;
    if (b >= 0) return null; // không lại gần
    const c = qx * qx + qy * qy - rr * rr;
    let t;
    if (c <= 0) t = 0;
    else {
      const a = vx * vx + vy * vy;
      const disc = b * b - a * c;
      if (disc < 0) return null;
      t = (-b - Math.sqrt(disc)) / a;
      if (t < 0) t = 0;
    }
    if (t > tmax) return null;
    const cx = qx + vx * t;
    const cy = qy + vy * t;
    const l = Math.hypot(cx, cy) || 1;
    return { t, nx: cx / l, ny: cy / l };
  }

  /** Thời điểm sớm nhất (≤ tmax) bi b chạm hình tĩnh sh, hoặc null. Trả { t, nx, ny } (pháp tuyến hướng về bi). */
  function staticTOI(g, b, sh, tmax) {
    const vx = b.vx;
    const vy = b.vy;
    const reach = Math.hypot(vx, vy) * tmax + R + 1;
    let y0 = sh.y0;
    let y1 = sh.y1;
    let ay = sh.ay;
    let by = sh.by;
    if (sh.kind === 'plunger') {
      ay = by = y0 = y1 = PLUNGER_Y + PULL_DIST * g.plunger;
    }
    if (b.x < sh.x0 - reach || b.x > sh.x1 + reach || b.y < y0 - reach || b.y > y1 + reach) return null;
    if (sh.kind === 'target' && !g.targets[sh.id]) return null;
    if (sh.t === 1) return circleTOI(b.x - sh.x, b.y - sh.y, vx, vy, R + sh.r, tmax);
    let best = null;
    const rx = b.x - sh.ax;
    const ry = b.y - ay;
    const nx = -sh.uy;
    const ny = sh.ux;
    let dn = rx * nx + ry * ny;
    let sgn = 1;
    if (dn < 0) {
      dn = -dn;
      sgn = -1;
    }
    if (sh.oneWay && sgn !== sh.oneWay) return null; // cửa một chiều: chỉ chặn từ phía pháp tuyến
    const vn = (vx * nx + vy * ny) * sgn;
    if (vn < 0) {
      const t = dn <= R ? 0 : (dn - R) / -vn;
      if (t <= tmax) {
        const sh2 = rx * sh.ux + ry * sh.uy + t * (vx * sh.ux + vy * sh.uy);
        if (sh2 >= 0 && sh2 <= sh.L) best = { t, nx: nx * sgn, ny: ny * sgn };
      }
    }
    if (sh.oneWay) return best;
    // Hai đầu đoạn: điểm, va khi cách tâm bi đúng R
    for (let e = 0; e < 2; e++) {
      const lim = best ? best.t : tmax;
      const h = circleTOI(b.x - (e ? sh.bx : sh.ax), b.y - (e ? by : ay), vx, vy, R, lim);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  /**
   * Va chạm bi – flipper đang quay bằng tiến bảo thủ: mỗi lần tiến một khoảng thời gian không thể
   * vượt quá khoảng cách hiện tại (tốc độ lại gần tối đa = |v| + |ω|·tầm với của flipper).
   * Trả { t, nx, ny, ux, uy (vận tốc mặt flipper ở điểm chạm), pen } hoặc null.
   */
  function flipperTOI(b, f, fs, tmax) {
    const bound = Math.hypot(b.vx, b.vy) + Math.abs(fs.w) * f.reach + 1e-9;
    const minAdv = HS / 48;
    let t = 0;
    for (let it = 0; it < 96; it++) {
      const x = b.x + b.vx * t;
      const y = b.y + b.vy * t;
      const a = fs.a + fs.w * t;
      const h = flipperDist(f, a, x, y);
      const d = h.d - R;
      if (d < CONTACT) {
        const cx = x - h.nx * h.d;
        const cy = y - h.ny * h.d;
        const ux = -fs.w * (cy - f.py);
        const uy = fs.w * (cx - f.px);
        const vn = (b.vx - ux) * h.nx + (b.vy - uy) * h.ny;
        if (vn < -1e-6) return { t, nx: h.nx, ny: h.ny, ux, uy, pen: d };
        t += minAdv;
      } else t += Math.max(d / bound, 1e-7);
      if (t > tmax) return null;
    }
    return null;
  }

  function capSpeed(b) {
    const s = Math.hypot(b.vx, b.vy);
    if (s > VMAX) {
      b.vx *= VMAX / s;
      b.vy *= VMAX / s;
    }
  }

  /**
   * Phản xạ vận tốc tương đối (so với mặt chạm đang chuyển động u) theo pháp tuyến n: thành phần pháp tuyến
   * đổi chiều nhân hệ số nảy e; tiếp tuyến mất phần fr; kick = tốc độ bật ra tối thiểu. Va chậm (bi đang lăn
   * trên mặt) thì không nảy, không mất tiếp tuyến: bi lăn theo dốc như thật thay vì bị hãm mỗi bước con.
   * Trả tốc độ va (pháp tuyến, dương = lao vào).
   */
  function bounce(b, nx, ny, ux, uy, e, fr, kick) {
    const rx = b.vx - ux;
    const ry = b.vy - uy;
    const vn = rx * nx + ry * ny;
    if (vn >= 0 && !kick) return 0;
    const soft = -vn < REST_V;
    const keep = soft ? 1 : 1 - fr;
    const tx = (rx - vn * nx) * keep;
    const ty = (ry - vn * ny) * keep;
    let out = vn < 0 ? (soft ? 0 : -vn * e) : vn;
    if (kick) out = Math.max(out, kick);
    b.vx = ux + tx + out * nx;
    b.vy = uy + ty + out * ny;
    capSpeed(b);
    return -vn;
  }

  /* ---------------- Sự kiện luật ---------------- */
  function ev(g, type, extra) {
    g.events.push(Object.assign({ type }, extra || {}));
  }

  function hitShape(g, b, sh, n) {
    const kind = sh.kind;
    if (kind === 'bumper') {
      bounce(b, n.nx, n.ny, 0, 0, E_RUBBER, 0, BUMPER_KICK);
      const pts = addScore(g, g.superT > 0 ? SCORE.superBumper : SCORE.bumper);
      g.fx.bumper[sh.id] = g.tick;
      g.count.bumpers++;
      ev(g, 'bumper', { i: sh.id, x: sh.x, y: sh.y, pts });
      return;
    }
    if (kind === 'sling') {
      const vin = -(b.vx * n.nx + b.vy * n.ny);
      if (vin > SLING_MIN && g.tick - g.fx.sling[sh.id] > 6) {
        bounce(b, n.nx, n.ny, 0, 0, E_RUBBER, 0, SLING_KICK);
        g.fx.sling[sh.id] = g.tick;
        const pts = addScore(g, SCORE.sling);
        ev(g, 'sling', { i: sh.id, x: b.x, y: b.y, pts });
      } else bounce(b, n.nx, n.ny, 0, 0, E_RUBBER, F_WALL, 0);
      return;
    }
    if (kind === 'target') {
      const vin = bounce(b, n.nx, n.ny, 0, 0, E_TARGET, F_WALL, 0);
      if (vin > TARGET_MIN && g.targets[sh.id]) {
        g.targets[sh.id] = false;
        g.fx.target[sh.id] = g.tick;
        const pts = addScore(g, SCORE.target);
        ev(g, 'target', { i: sh.id, x: sh.x, y: (sh.ay + sh.by) / 2, pts });
        if (g.targets.every((x) => !x)) {
          const bonus = addScore(g, SCORE.bank);
          g.superT = SUPER_TICKS;
          g.bankT = BANK_RESET_TICKS;
          g.count.banks++;
          ev(g, 'bank', { pts: bonus });
        }
      }
      return;
    }
    const e = kind === 'rubber' ? E_RUBBER : E_WALL;
    const vin = bounce(b, n.nx, n.ny, 0, 0, e, F_WALL, 0);
    if (vin > 500 && kind !== 'plunger') ev(g, 'wall', { v: vin });
  }

  function sensorEnter(g, s) {
    if (s.k === 'lane') {
      g.fx.lane[s.i] = g.tick;
      if (g.skillT > 0) {
        if (s.i === g.skill) {
          const pts = addScore(g, SCORE.skill);
          ev(g, 'skill', { pts });
        }
        g.skillT = 0;
      }
      if (!g.lanes[s.i]) {
        g.lanes[s.i] = true;
        const pts = addScore(g, SCORE.lane);
        ev(g, 'lane', { i: s.i, pts });
        if (g.lanes.every(Boolean)) {
          g.lanes = [false, false, false];
          const max = g.mult >= MAX_MULT;
          const pts2 = addScore(g, max ? SCORE.maxMult : SCORE.lanesDone);
          if (!max) g.mult++;
          ev(g, 'mult', { mult: g.mult, pts: pts2, max });
        }
      } else addScore(g, SCORE.laneLit);
    } else if (s.k === 'inlane') {
      const pts = addScore(g, SCORE.inlane);
      ev(g, 'inlane', { i: s.i, pts });
    } else if (s.k === 'outlane') {
      const pts = addScore(g, SCORE.outlane);
      ev(g, 'outlane', { i: s.i, pts });
    }
  }

  function checkSensors(g, b) {
    for (let i = 0; i < SENSORS.length; i++) {
      const s = SENSORS[i];
      const inside = b.x >= s.x0 && b.x <= s.x1 && b.y >= s.y0 && b.y <= s.y1;
      const bit = 1 << i;
      if (inside && !(b.sens & bit)) {
        b.sens |= bit;
        sensorEnter(g, s);
      } else if (!inside && b.sens & bit) b.sens &= ~bit;
    }
    // Rời làn phóng: bắt đầu ball save (một lần mỗi bi) và cửa sổ skill shot
    const inLane = b.x > LANE_X0 - 4 && b.y > LANE_TOP - 10;
    if (b.lane && !inLane) {
      b.lane = false;
      if (g.saveArmed) {
        g.saveArmed = false;
        g.saveT = Math.max(g.saveT, SAVE_TICKS);
        if (g.skill >= 0 && !g.multi) g.skillT = SKILL_TICKS;
      }
      ev(g, 'launched');
    } else if (!b.lane && inLane) b.lane = true;
  }

  /** Tâm bi đi qua vạch miệng ramp theo chiều vào (từ (ox, oy) tới vị trí hiện tại): bắt lên ramp. */
  function checkMouth(g, b, ox, oy) {
    const m = MOUTH;
    const vin = b.vx * m.nx + b.vy * m.ny;
    if (vin <= 0) return false;
    const dx = b.x - ox;
    const dy = b.y - oy;
    const sx = m.bx - m.ax;
    const sy = m.by - m.ay;
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-12) return false;
    const qx = m.ax - ox;
    const qy = m.ay - oy;
    const t = (qx * sy - qy * sx) / den; // phần quãng đi của bi
    const u = (qx * dy - qy * dx) / den; // vị trí trên vạch miệng
    if (t < 0 || t > 1 || u < 0 || u > 1) return false;
    b.ramp = { s: 0, v: vin };
    const p = rampAt(0);
    b.x = p.x;
    b.y = p.y;
    b.vx = 0;
    b.vy = 0;
    ev(g, 'rampIn', { v: vin });
    return true;
  }

  /** Bi trên ramp: đi theo đường cong, tăng / giảm tốc theo thành phần trọng lực dọc đường, có cản nhẹ. */
  function stepRamp(g, b, h) {
    const p0 = rampAt(b.ramp.s);
    b.ramp.v += (G * p0.ty - RAMP_DRAG * b.ramp.v) * h;
    b.ramp.s += b.ramp.v * h;
    if (b.ramp.s >= RAMP.len) {
      const p = rampAt(RAMP.len);
      const v = Math.min(b.ramp.v, RAMP_EXIT_MAX);
      b.ramp = null;
      b.x = p.x;
      b.y = p.y;
      b.vx = p.tx * v;
      b.vy = p.ty * v;
      b.sens = 0;
      rampMade(g);
      return;
    }
    if (b.ramp.s <= 0) {
      // Không đủ lực: bi lăn ngược ra miệng
      const p = rampAt(0);
      const v = b.ramp.v;
      b.ramp = null;
      b.x = p.x;
      b.y = p.y;
      b.vx = p.tx * v;
      b.vy = p.ty * v;
      ev(g, 'rampFail');
      return;
    }
    const p = rampAt(b.ramp.s);
    b.x = p.x;
    b.y = p.y;
  }

  function rampMade(g) {
    g.fx.ramp = g.tick;
    g.count.ramps++;
    if (g.multi) {
      const pts = addScore(g, SCORE.jackpot);
      g.count.jackpots++;
      ev(g, 'jackpot', { pts });
      return;
    }
    const pts = addScore(g, SCORE.ramp);
    g.ramps++;
    ev(g, 'ramp', { pts, n: g.ramps });
    if (g.ramps >= RAMPS_FOR_MB) {
      g.ramps = 0;
      g.multi = true;
      g.queue++;
      g.serveT = SERVE_TICKS;
      g.saveT = Math.max(g.saveT, MB_SAVE_TICKS);
      g.count.multiballs++;
      ev(g, 'multiball');
    }
  }

  /* ---------------- Một bước con ---------------- */
  function substep(g) {
    const h = HS;
    // Flipper: vận tốc góc không đổi trong bước con, dừng đúng ở góc giới hạn
    for (let i = 0; i < 2; i++) {
      const f = FLIPPERS[i];
      const fs = g.flips[i];
      const target = g.held[i] ? f.up : f.rest;
      const diff = target - fs.a;
      const wmax = g.held[i] ? W_UP : W_DOWN;
      fs.w = Math.abs(diff) < 1e-12 ? 0 : Math.max(-wmax, Math.min(wmax, diff / h));
    }
    const balls = g.balls;
    for (const b of balls.slice()) {
      if (b.ramp) stepRamp(g, b, h);
      else b.vy += (G * h) / 2;
    }
    let rem = h;
    let guard = 0;
    while (rem > 1e-12) {
      let tmin = rem;
      let hit = null;
      if (guard < MAX_EV) {
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (b.ramp) continue;
          for (let k = 0; k < SHAPES.length; k++) {
            const c = staticTOI(g, b, SHAPES[k], tmin);
            if (c && c.t < tmin) {
              tmin = c.t;
              hit = { kind: 0, b, sh: SHAPES[k], n: c };
            }
          }
          for (let j = i + 1; j < balls.length; j++) {
            const o = balls[j];
            if (o.ramp) continue;
            const c = circleTOI(b.x - o.x, b.y - o.y, b.vx - o.vx, b.vy - o.vy, 2 * R, tmin);
            if (c && c.t < tmin) {
              tmin = c.t;
              hit = { kind: 1, b, o, n: c };
            }
          }
        }
        for (const b of balls) {
          if (b.ramp || b.y < 760 || b.y > 990 || b.x > 440 || b.x < 120) continue;
          for (let i = 0; i < 2; i++) {
            const c = flipperTOI(b, FLIPPERS[i], g.flips[i], tmin);
            if (c && c.t < tmin) {
              tmin = c.t;
              hit = { kind: 2, b, fi: i, n: c };
            }
          }
        }
      }
      // Đi tới thời điểm va chạm (hoặc hết bước con)
      if (tmin > 0) {
        for (const b of balls) {
          if (b.ramp) continue;
          const ox = b.x;
          const oy = b.y;
          b.x += b.vx * tmin;
          b.y += b.vy * tmin;
          if (checkMouth(g, b, ox, oy)) {
            if (hit && (hit.b === b || hit.o === b)) hit = null;
            continue;
          }
          checkSensors(g, b);
        }
        for (let i = 0; i < 2; i++) {
          const f = FLIPPERS[i];
          const fs = g.flips[i];
          fs.a = Math.max(f.lo, Math.min(f.hi, fs.a + fs.w * tmin));
        }
      }
      rem -= tmin;
      if (!hit) continue;
      guard++;
      const b = hit.b;
      if (hit.kind === 0) hitShape(g, b, hit.sh, hit.n);
      else if (hit.kind === 1) {
        // Bi – bi: đàn hồi, khối lượng bằng nhau
        const o = hit.o;
        const nx = hit.n.nx;
        const ny = hit.n.ny;
        const un = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
        if (un < 0) {
          const j = ((1 + E_BALL) * un) / 2;
          b.vx -= j * nx;
          b.vy -= j * ny;
          o.vx += j * nx;
          o.vy += j * ny;
          capSpeed(b);
          capSpeed(o);
        }
      } else {
        const n = hit.n;
        const vin = bounce(b, n.nx, n.ny, n.ux, n.uy, E_FLIP, F_FLIP, 0);
        if (n.pen < 0) {
          b.x -= n.nx * n.pen;
          b.y -= n.ny * n.pen;
        }
        if (vin > 600) ev(g, 'flipHit', { side: hit.fi, v: vin });
      }
    }
    for (const b of balls) if (!b.ramp) b.vy += (G * h) / 2;
    // Bi rơi khỏi bàn
    for (let i = balls.length - 1; i >= 0; i--) {
      if (!balls[i].ramp && balls[i].y > H + 2 * R) {
        balls.splice(i, 1);
        drain(g);
      }
    }
  }

  /** Một bi rơi xuống lỗ thoát. */
  function drain(g) {
    const inPlay = g.balls.length + g.queue;
    if (g.saveT > 0) {
      g.queue++;
      if (g.serveT <= 0) g.serveT = SERVE_TICKS;
      ev(g, 'save');
      return;
    }
    if (inPlay > 0) {
      if (inPlay === 1 && g.multi) {
        g.multi = false;
        ev(g, 'multiEnd');
      }
      ev(g, 'drainOne');
      return;
    }
    // Mất bi
    g.multi = false;
    g.mult = 1;
    g.lanes = [false, false, false];
    g.superT = 0;
    g.skillT = 0;
    if (g.ball >= BALLS) {
      g.over = true;
      ev(g, 'drain', { ball: g.ball });
      ev(g, 'over', { score: g.score });
      return;
    }
    g.ball++;
    g.balls.push(laneBall());
    g.saveArmed = true;
    g.saveT = 0;
    g.skill = Math.floor(rand(g) * 3);
    ev(g, 'drain', { ball: g.ball });
  }

  const laneHasBall = (g) => g.balls.some((b) => !b.ramp && b.x > LANE_X0 && b.y > LANE_TOP);
  /** Bi đang nằm trên (hoặc sát) mặt lò xo, hoặc null. */
  function restingBall(g) {
    for (const b of g.balls) {
      if (!b.ramp && b.x > LANE_X0 && b.y > PLUNGER_Y - R - 6) return b;
    }
    return null;
  }
  const launchSpeed = (c) => PLUNGE_MIN + (PLUNGE_MAX - PLUNGE_MIN) * Math.max(0, Math.min(1, c));

  /* ---------------- Một nhịp ---------------- */
  /**
   * input: { left, right, plunge } — left / right: giữ flipper; plunge: true (giữ phím: nén dần tới hết)
   * hoặc số 0..1 (kéo trên màn cảm ứng: nén dần tới mức đó, cùng tốc độ). Thả (plunge falsy) thì phóng,
   * lực theo độ nén lúc thả.
   */
  function step(g, input) {
    g.events = [];
    if (g.over) return g;
    const inp = input || {};
    const left = !!inp.left;
    const right = !!inp.right;
    // Bấm flipper: đổi làn sáng (như máy thật)
    if (left && !g.held[0]) {
      g.lanes = [g.lanes[1], g.lanes[2], g.lanes[0]];
      g.fx.flip[0] = g.tick;
      ev(g, 'flip', { side: 0 });
    }
    if (right && !g.held[1]) {
      g.lanes = [g.lanes[2], g.lanes[0], g.lanes[1]];
      g.fx.flip[1] = g.tick;
      ev(g, 'flip', { side: 1 });
    }
    g.held = [left, right];

    // Lò xo
    let target = 0;
    if (inp.plunge === true) target = 1;
    else if (typeof inp.plunge === 'number' && Number.isFinite(inp.plunge)) target = Math.max(0, Math.min(1, inp.plunge));
    if (target > 0) {
      g.pulling = true;
      const r = DT / PULL_TIME;
      if (g.plunger < target) g.plunger = Math.min(target, g.plunger + r);
      else g.plunger = Math.max(target, g.plunger - r);
    } else if (g.pulling) {
      g.pulling = false;
      const c = g.plunger;
      const b = restingBall(g);
      g.plunger = 0;
      if (b && c > 0.02) {
        b.y = PLUNGER_Y - R;
        b.vx = 0;
        b.vy = -launchSpeed(c);
        ev(g, 'launch', { power: c });
      } else if (b && b.y > PLUNGER_Y - R) {
        // Lò xo bật về chỗ cũ: bi không được nằm dưới mặt lò xo
        b.y = PLUNGER_Y - R;
        b.vy = Math.min(b.vy, 0);
      }
    }

    // Tự phóng bi (ball save, multiball)
    if (g.queue > 0) {
      if (g.serveT > 0) g.serveT--;
      if (g.serveT <= 0 && !laneHasBall(g)) {
        const b = laneBall();
        b.vy = -launchSpeed(AUTO_POWER);
        g.balls.push(b);
        g.queue--;
        g.serveT = g.queue > 0 ? SERVE_TICKS : 0;
        ev(g, 'serve');
      }
    }

    for (let s = 0; s < SUB && !g.over; s++) substep(g);

    // Đồng hồ
    if (g.saveT > 0) g.saveT--;
    if (g.superT > 0) g.superT--;
    if (g.skillT > 0) g.skillT--;
    if (g.bankT > 0) {
      g.bankT--;
      // Dựng lại dãy target khi không có bi sát dãy
      if (g.bankT === 0) {
        if (g.balls.some((b) => !b.ramp && b.x < 34 + R + 4 && b.y > 370 && b.y < 532)) g.bankT = 1;
        else {
          g.targets = [true, true, true, true];
          ev(g, 'bankReset');
        }
      }
    }
    // Tìm bi: bi đứng yên lâu ở chỗ không phải flipper / làn phóng thì đẩy ra
    for (const b of g.balls) {
      if (b.ramp || b.lane) {
        b.still = 0;
        continue;
      }
      const onFlip = b.y > 800 && b.x > 120 && b.x < 440;
      if (!onFlip && Math.hypot(b.vx, b.vy) < 25) {
        b.still++;
        if (b.still >= STILL_TICKS) {
          b.still = 0;
          b.vx = (rand(g) - 0.5) * 600;
          b.vy = -700 - rand(g) * 300;
          ev(g, 'search');
        }
      } else b.still = 0;
    }
    g.tick++;
    return g;
  }

  /* ---------------- Truy vấn cho giao diện / bot ---------------- */
  const isOver = (g) => g.over;
  /** Có bi nằm chờ trên lò xo để người chơi phóng (không phải bi tự phóng). */
  function ballWaiting(g) {
    const b = restingBall(g);
    return !!b && Math.abs(b.vy) < 120 && g.queue === 0;
  }
  const hasProgress = (g) => g.score > 0 || g.tick >= TPS;

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION,
      seed: g.seed,
      rng: g.rng,
      tick: g.tick,
      score: g.score,
      ball: g.ball,
      over: g.over,
      balls: g.balls.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, ramp: b.ramp ? { s: b.ramp.s, v: b.ramp.v } : null, lane: b.lane, sens: b.sens, still: b.still })),
      flips: g.flips.map((f) => ({ a: f.a, w: f.w })),
      held: g.held.slice(),
      plunger: g.plunger,
      pulling: g.pulling,
      queue: g.queue,
      serveT: g.serveT,
      saveArmed: g.saveArmed,
      saveT: g.saveT,
      multi: g.multi,
      ramps: g.ramps,
      mult: g.mult,
      lanes: g.lanes.slice(),
      skill: g.skill,
      skillT: g.skillT,
      targets: g.targets.slice(),
      bankT: g.bankT,
      superT: g.superT,
      fx: { bumper: g.fx.bumper.slice(), sling: g.fx.sling.slice(), target: g.fx.target.slice(), lane: g.fx.lane.slice(), ramp: g.fx.ramp, flip: g.fx.flip.slice() },
      count: Object.assign({}, g.count),
    };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isNum = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const isBool = (x) => x === true || x === false;
  const intArr = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => Number.isInteger(x));
  const boolArr = (a, n) => Array.isArray(a) && a.length === n && a.every(isBool);
  const COUNT_KEYS = ['ramps', 'banks', 'jackpots', 'multiballs', 'bumpers'];

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    try {
      if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
      const r = raw;
      if (!isInt(r.seed, 0, 0xffffffff) || !isInt(r.rng, 0, 0xffffffff) || !isInt(r.tick, 0, 1e9)) return null;
      if (!isInt(r.score, 0, 1e12) || !isInt(r.ball, 1, BALLS) || !isBool(r.over)) return null;
      if (!Array.isArray(r.balls) || r.balls.length > 4) return null;
      const balls = [];
      for (const b of r.balls) {
        if (!b || typeof b !== 'object') return null;
        if (!isNum(b.x, -50, W + 50) || !isNum(b.y, -50, H + 2 * R + 1) || !isNum(b.vx, -VMAX - 1, VMAX + 1) || !isNum(b.vy, -VMAX - 1, VMAX + 1)) return null;
        if (Math.hypot(b.vx, b.vy) > VMAX + 1 || !isBool(b.lane) || !isInt(b.sens, 0, 1023) || !isInt(b.still, 0, STILL_TICKS)) return null;
        let ramp = null;
        if (b.ramp !== null) {
          if (!b.ramp || typeof b.ramp !== 'object' || !isNum(b.ramp.s, 0, RAMP.len) || !isNum(b.ramp.v, -VMAX, VMAX)) return null;
          ramp = { s: b.ramp.s, v: b.ramp.v };
        }
        balls.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, ramp, lane: b.lane, sens: b.sens, still: b.still });
      }
      if (!Array.isArray(r.flips) || r.flips.length !== 2) return null;
      const flips = [];
      for (let i = 0; i < 2; i++) {
        const f = r.flips[i];
        if (!f || !isNum(f.a, FLIPPERS[i].lo - 1e-6, FLIPPERS[i].hi + 1e-6) || !isNum(f.w, -W_UP - 1, W_UP + 1)) return null;
        flips.push({ a: f.a, w: f.w });
      }
      if (!boolArr(r.held, 2) || !isNum(r.plunger, 0, 1) || !isBool(r.pulling)) return null;
      if (!isInt(r.queue, 0, 4) || !isInt(r.serveT, 0, SERVE_TICKS) || !isBool(r.saveArmed) || !isInt(r.saveT, 0, MB_SAVE_TICKS)) return null;
      if (!isBool(r.multi) || !isInt(r.ramps, 0, RAMPS_FOR_MB - 1) || !isInt(r.mult, 1, MAX_MULT)) return null;
      if (!boolArr(r.lanes, 3) || !isInt(r.skill, -1, 2) || !isInt(r.skillT, 0, SKILL_TICKS)) return null;
      if (!boolArr(r.targets, 4) || !isInt(r.bankT, 0, BANK_RESET_TICKS) || !isInt(r.superT, 0, SUPER_TICKS)) return null;
      if (!r.over && balls.length + r.queue === 0) return null;
      const fx = r.fx;
      if (!fx || !intArr(fx.bumper, 3) || !intArr(fx.sling, 2) || !intArr(fx.target, 4) || !intArr(fx.lane, 3) || !Number.isInteger(fx.ramp) || !intArr(fx.flip, 2)) return null;
      const c = r.count;
      if (!c || typeof c !== 'object' || !COUNT_KEYS.every((k) => isInt(c[k], 0, 1e9))) return null;
      const count = {};
      COUNT_KEYS.forEach((k) => { count[k] = c[k]; });
      return {
        seed: r.seed,
        rng: r.rng,
        tick: r.tick,
        score: r.score,
        ball: r.ball,
        over: r.over,
        balls,
        flips,
        held: r.held.slice(),
        plunger: r.plunger,
        pulling: r.pulling,
        queue: r.queue,
        serveT: r.serveT,
        saveArmed: r.saveArmed,
        saveT: r.saveT,
        multi: r.multi,
        ramps: r.ramps,
        mult: r.mult,
        lanes: r.lanes.slice(),
        skill: r.skill,
        skillT: r.skillT,
        targets: r.targets.slice(),
        bankT: r.bankT,
        superT: r.superT,
        fx: { bumper: fx.bumper.slice(), sling: fx.sling.slice(), target: fx.target.slice(), lane: fx.lane.slice(), ramp: fx.ramp, flip: fx.flip.slice() },
        count,
        events: [],
      };
    } catch (e) {
      return null;
    }
  }

  /** Bản sao độc lập (bot mô phỏng thử trước). */
  const clone = (g) => fromJSON(toJSON(g));

  const CONST = {
    W, H, CX, R, TPS, SUB, DT, HS, G, VMAX, SLOPE_DEG, UNITS_PER_M, BALLS, PULL_TIME, PULL_DIST, PLUNGE_MIN, PLUNGE_MAX,
    PLUNGER_Y, LANE_X0, LANE_X1, LANE_CX, LANE_TOP, E_WALL, E_RUBBER, E_FLIP, F_WALL, BUMPER_KICK, SLING_KICK, W_UP, W_DOWN,
    SAVE_TICKS, MB_SAVE_TICKS, SUPER_TICKS, RAMPS_FOR_MB, MAX_MULT, SKILL_TICKS, STILL_TICKS, AUTO_POWER,
  };
  const TABLE = { ARC, ARC_PTS, SHAPES, FLIPPERS, BUMPERS, SLINGS, GUIDES, LANES, LANE_GUIDES, TARGETS, MOUTH, RAMP_BASE, SENSORS, RAMP, GATE, PLUNGER };

  const api = {
    VERSION, CONST, SCORE, TABLE, newGame, step, makeBall, laneBall, flipperDist, rampAt, launchSpeed, restingBall,
    ballWaiting, isOver, hasProgress, toJSON, fromJSON, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
