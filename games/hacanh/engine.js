/* =====================================================================
 * Hạ Cánh - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Thế giới rộng W đơn vị, xuyên mép ngang (bay ra mép phải hiện lại ở mép trái); trục y hướng LÊN
 *     (y = độ cao so với đáy); địa hình là đường gấp khúc tuần hoàn theo x
 *   - Mô phỏng theo bước cố định 1/60 giây: step(state, input) SỬA TRỰC TIẾP state rồi trả lại nó;
 *     app vẽ theo state và nghe state.events (âm thanh, chữ, hạt)
 *   - Input mỗi bước: { left, right, thrust, assist }; assist = tự cân bằng góc (không xoay thì mũi tàu
 *     tự quay về thẳng đứng với cùng tốc độ xoay)
 *   - Số ngẫu nhiên lấy từ PRNG mulberry32: g.rng cho chỗ xuất hiện của tàu và hạt giống màn kế tiếp;
 *     địa hình + gió của một màn sinh lại được hoàn toàn từ g.lvSeed (ván lưu không phải chép địa hình)
 *   - Cùng seed + cùng chuỗi input thì ra đúng cùng một ván (test và bot đo điểm dựa vào điều này)
 *   - Pha: fly (đang bay) → landed (đáp an toàn, chờ rồi sang màn) | crashed (nổ, chờ rồi tàu mới / hết ván) → over
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Thế giới và thời gian ---------------- */
  const W = 800; // bề rộng thế giới (tuần hoàn)
  const FPS = 60;
  const DT = 1 / FPS;
  const TAU = Math.PI * 2;
  const SPAWN_Y = 560; // độ cao tàu xuất hiện
  const CEIL = 720; // trần: bay cao hơn thì bị chặn lại
  const GROUND_MIN = 20; // địa hình nằm trong [GROUND_MIN, GROUND_MAX]
  const GROUND_MAX = 380;

  /* ---------------- Tàu ---------------- */
  const THRUST = 44; // gia tốc động cơ chính (đơn vị / giây²), theo hướng mũi tàu
  const ROT = 2.4; // tốc độ xoay (radian / giây, ~138°/giây)
  const MAX_TILT = Math.PI / 2; // nghiêng tối đa 90° mỗi bên
  const FOOT = 11; // chân tàu ở (±FOOT, -FOOT) so với tâm
  // Đa giác va chạm (lồi, ngược chiều kim đồng hồ, hệ tọa độ thân tàu, y lên): hai đỉnh đầu là hai chân
  const HULL = [[-11, -11], [11, -11], [9, 3], [5, 10], [-5, 10], [-9, 3]];

  /* ---------------- Nhiên liệu ---------------- */
  const FUEL_MAX = 1000;
  const BURN = 1; // mỗi bước đẩy (60 / giây: đầy bình đẩy được ~17 giây)
  const REFILL = 400; // nạp thêm mỗi lần đáp an toàn (không vượt FUEL_MAX)
  const FUEL_LOW = 200; // xuống dưới mức này thì báo sắp hết

  /* ---------------- Đáp an toàn ---------------- */
  const VY_SAFE = 20; // tốc độ rơi tối đa khi chạm
  const VX_SAFE = 12; // tốc độ trôi ngang tối đa
  const ANG_SAFE = (10 * Math.PI) / 180; // lệch khỏi thẳng đứng tối đa 10°

  /* ---------------- Bãi đáp và điểm ---------------- */
  // Bãi càng hẹp hệ số càng cao; bãi ×5 còn có thể nằm trong khe giữa hai vách
  const PADS = [{ mult: 2, w: 80 }, { mult: 3, w: 54 }, { mult: 5, w: 36 }];
  const BASE = 50; // điểm cơ bản, nhân với hệ số bãi
  const SOFT_MAX = 50; // thưởng độ êm (chạm càng nhẹ, càng thẳng càng nhiều)
  const FUEL_DIV = 20; // thưởng nhiên liệu = nhiên liệu còn lúc chạm ÷ 20 (tối đa 50)

  /* ---------------- Màn ---------------- */
  const G0 = 16; // trọng lực màn 1 (đơn vị / giây²)
  const G_STEP = 0.1; // mỗi màn nặng thêm 10% trọng lực gốc...
  const G_MAX = 1.6; // ...tối đa gấp 1,6 lần (màn 7 trở đi)
  const WIND_BASE = 2; // gió từ màn 2 (đơn vị / giây²), mỗi màn thêm WIND_STEP, tối đa WIND_MAX
  const WIND_STEP = 1.2;
  const WIND_MAX = 6;
  const GUST = 0.4; // gió giật ±40% quanh mức của màn...
  const GUST_PERIOD = 5 * FPS; // ...theo chu kỳ 5 giây
  const SHIPS = 3;
  const LAND_WAIT = 120; // đáp xong chờ 2 giây rồi sang màn
  const CRASH_WAIT = 100; // nổ xong chờ ~1,7 giây rồi ra tàu mới (hoặc hết ván)

  /* ---------------- PRNG ---------------- */
  /** mulberry32 trên o.rng: trả số trong [0, 1) và cập nhật o.rng. */
  function rand(o) {
    o.rng = (o.rng + 0x6d2b79f5) | 0;
    let t = o.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (o) => Math.floor(rand(o) * 2147483647);

  /** Seed là số hoặc chuỗi → số nguyên 32 bit. */
  function hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed | 0;
    const s = String(seed == null ? Date.now() + ':' + Math.random() : seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h | 0;
  }

  const mod = (x, m) => ((x % m) + m) % m;
  /** Khoảng cách có dấu ngắn nhất từ a tới b trên vòng W. */
  const wrapDelta = (a, b) => mod(b - a + W / 2, W) - W / 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* ================================================================
   * Địa hình
   *   terrain = { off, pts: [[u, h], ...], pads: [{ mult, x0, w, y, cx, notch }] }
   *   pts theo tọa độ cục bộ u ∈ [0, W] (u = 0 là mép trái bãi đầu tiên), điểm cuối cao bằng điểm đầu;
   *   x thế giới = (u + off) mod W
   * ================================================================ */

  /** Chia đoạn (u0, u1) thành núi gồ ghề kiểu dịch điểm giữa; đẩy các điểm (không gồm hai đầu) vào out. */
  function mountains(r, u0, h0, u1, h1, out) {
    const len = u1 - u0;
    if (len <= 16 + rand(r) * 14) return;
    const um = u0 + len / 2 + (rand(r) - 0.5) * len * 0.2;
    const hm = clamp((h0 + h1) / 2 + (rand(r) - 0.5) * len * 0.9, GROUND_MIN, GROUND_MAX);
    mountains(r, u0, h0, um, hm, out);
    out.push([um, hm]);
    mountains(r, um, hm, u1, h1, out);
  }

  /** Sinh địa hình từ hạt giống của màn (tất định). */
  function makeTerrain(lvSeed) {
    const r = { rng: lvSeed | 0 };
    // Thứ tự ba bãi quanh vòng: xáo [×2, ×3, ×5]
    const order = PADS.map((p) => Object.assign({}, p));
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand(r) * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    // Vị trí: chia vòng thành 3 phần đều, mỗi bãi lệch ngẫu nhiên trong phần của mình (bãi đầu bắt đầu ở u = 0)
    const third = W / 3;
    const pads = order.map((p, i) => {
      const u0 = i === 0 ? 0 : Math.round(i * third + (rand(r) - 0.5) * 70);
      let y;
      let notch = false;
      if (p.mult === 2) y = 40 + rand(r) * 110;
      else if (p.mult === 3) y = 70 + rand(r) * 170;
      else if (rand(r) < 0.5) y = 200 + rand(r) * 120; // ×5 trên cao
      else {
        y = 40 + rand(r) * 90; // ×5 trong khe giữa hai vách
        notch = true;
      }
      return { mult: p.mult, u0, w: p.w, y: Math.round(y), notch };
    });
    const pts = [];
    pads.forEach((p, i) => {
      const next = pads[(i + 1) % pads.length];
      const endU = i === pads.length - 1 ? W : next.u0;
      pts.push([p.u0, p.y], [p.u0 + p.w, p.y]);
      // Vách hai bên khe: dựng sát mép bãi (vẫn ngoài bãi nên tàu thẳng đứng chui vừa)
      let su = p.u0 + p.w;
      let sh = p.y;
      if (p.notch) {
        su += 4 + rand(r) * 4;
        sh = Math.min(GROUND_MAX, p.y + 35 + rand(r) * 45);
        pts.push([su, sh]);
      }
      let eu = endU;
      let eh = next.y;
      let wall = null;
      if (next.notch) {
        eu = endU - (4 + rand(r) * 4);
        eh = Math.min(GROUND_MAX, next.y + 35 + rand(r) * 45);
        wall = [eu, eh];
      }
      mountains(r, su, sh, eu, eh, pts);
      if (wall) pts.push(wall);
    });
    pts.push([W, pads[0].y]);
    const off = Math.floor(rand(r) * W);
    return {
      off,
      pts: pts.map(([u, h]) => [Math.round(u * 100) / 100, Math.round(h * 10) / 10]),
      pads: pads.map((p) => ({ mult: p.mult, x0: mod(p.u0 + off, W), w: p.w, y: p.y, cx: mod(p.u0 + p.w / 2 + off, W), notch: p.notch })),
    };
  }

  /** Chỉ số đoạn chứa u (pts[i][0] <= u <= pts[i + 1][0]). */
  function segIndex(pts, u) {
    let lo = 0;
    let hi = pts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid][0] <= u) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Độ cao mặt đất tại x (thế giới). */
  function heightAt(terrain, x) {
    const u = mod(x - terrain.off, W);
    const pts = terrain.pts;
    const i = segIndex(pts, u);
    const a = pts[i];
    const b = pts[i + 1];
    const span = b[0] - a[0];
    return span <= 0 ? Math.max(a[1], b[1]) : a[1] + ((b[1] - a[1]) * (u - a[0])) / span;
  }

  /** Mặt đất cao nhất trong đoạn [x - half, x + half] (tính cả đỉnh gấp khúc). */
  function maxHeight(terrain, x, half) {
    let m = Math.max(heightAt(terrain, x - half), heightAt(terrain, x + half));
    for (const [u, h] of terrain.pts) {
      if (h > m && Math.abs(wrapDelta(x, u + terrain.off)) <= half) m = h;
    }
    return m;
  }

  /** Bãi đáp chứa x (thế giới), hoặc null. */
  function padAt(terrain, x) {
    for (const p of terrain.pads) {
      if (mod(x - p.x0, W) <= p.w) return p;
    }
    return null;
  }

  /* ================================================================
   * Va chạm tàu với địa hình
   * ================================================================ */

  /** Các đỉnh đa giác va chạm của tàu theo tọa độ thế giới (x chưa quấn về [0, W)). */
  function shipPoly(s) {
    const c = Math.cos(s.a);
    const n = Math.sin(s.a);
    // a > 0: nghiêng sang phải (mũi chỉ về +x), tức quay theo chiều kim đồng hồ khi y hướng lên
    return HULL.map(([bx, by]) => [s.x + bx * c + by * n, s.y - bx * n + by * c]);
  }

  /** Điểm (px, py) nằm hẳn trong đa giác lồi (đỉnh ngược chiều kim đồng hồ). */
  function insideConvex(poly, px, py) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) <= 0) return false;
    }
    return true;
  }

  /**
   * Tàu chạm đất chưa: null nếu chưa; { hull: true } nếu thân tàu chạm (đỉnh thân xuống dưới mặt đất hoặc
   * đỉnh núi đâm vào thân); { hull: false, pad } nếu chỉ chân chạm, pad = bãi chứa cả hai chân (null nếu chân ngoài bãi).
   */
  function contact(terrain, s) {
    const poly = shipPoly(s);
    let feet = false;
    for (let i = 0; i < poly.length; i++) {
      const [px, py] = poly[i];
      if (py <= heightAt(terrain, px)) {
        if (i >= 2) return { hull: true, pad: null };
        feet = true;
      }
    }
    // Đỉnh nhọn của đường gấp khúc lọt vào trong đa giác (giữa hai đỉnh): cao hơn đường chân 3 đơn vị là
    // đâm vào thân; sát đường chân (mép bãi, mô đất giữa hai chân) thì coi như chân chạm đất
    const c = Math.cos(s.a);
    const n = Math.sin(s.a);
    for (const [u, h] of terrain.pts) {
      const dx = wrapDelta(s.x, u + terrain.off);
      if (Math.abs(dx) < 17 && insideConvex(poly, s.x + dx, h)) {
        if (dx * n + (h - s.y) * c > -FOOT + 3) return { hull: true, pad: null };
        feet = true;
      }
    }
    if (!feet) return null;
    const pl = padAt(terrain, poly[0][0]);
    const pr = padAt(terrain, poly[1][0]);
    return { hull: false, pad: pl && pl === pr ? pl : null };
  }

  /* ================================================================
   * Màn chơi
   * ================================================================ */

  /** Trọng lực, gió của màn n (chiều gió và pha giật lấy từ hạt giống màn). */
  function levelParams(level, lvSeed) {
    const r = { rng: (lvSeed ^ 0x5bd1e995) | 0 };
    const gravity = G0 * Math.min(G_MAX, 1 + G_STEP * (level - 1));
    const sign = rand(r) < 0.5 ? -1 : 1;
    const wind = level <= 1 ? 0 : sign * Math.min(WIND_MAX, WIND_BASE + WIND_STEP * (level - 2));
    return { gravity, wind, windPhase: rand(r) * TAU };
  }

  /** Gió (gia tốc ngang) ở bước hiện tại. */
  const windAt = (g) => g.wind * (1 + GUST * Math.sin((TAU * g.tick) / GUST_PERIOD + g.windPhase));

  /** Dựng địa hình + thông số của màn hiện tại từ g.level, g.lvSeed (không đụng g.rng). */
  function buildLevel(g) {
    g.terrain = makeTerrain(g.lvSeed);
    const p = levelParams(g.level, g.lvSeed);
    g.gravity = p.gravity;
    g.wind = p.wind;
    g.windPhase = p.windPhase;
  }

  /** Tàu mới ở trên cao, trôi ngang về một phía. */
  function spawn(g) {
    const dir = rand(g) < 0.5 ? -1 : 1;
    const speed = Math.min(45, (15 + rand(g) * 20) * (1 + 0.05 * (g.level - 1)));
    g.ship = { x: Math.floor(rand(g) * W), y: SPAWN_Y, vx: dir * speed, vy: 0, a: 0, thrusting: false };
    g.phase = 'fly';
    g.timer = 0;
    g.wreck = null;
    g.events.push({ type: 'spawn' });
  }

  function newGame(seed) {
    const g = {
      v: VERSION,
      seed: hashSeed(seed),
      rng: 0,
      tick: 0,
      level: 1,
      score: 0,
      ships: SHIPS,
      fuel: FUEL_MAX,
      phase: 'fly',
      timer: 0,
      lvSeed: 0,
      lands: [0, 0, 0], // số lần đáp bãi ×2, ×3, ×5
      ship: null,
      wreck: null,
      events: [],
    };
    g.rng = g.seed;
    g.lvSeed = randInt(g);
    buildLevel(g);
    spawn(g);
    g.events.push({ type: 'level', n: 1 });
    return g;
  }

  function nextLevel(g) {
    g.level++;
    g.lvSeed = randInt(g);
    buildLevel(g);
    spawn(g);
    g.events.push({ type: 'level', n: g.level });
  }

  /* ================================================================
   * Đáp / nổ và điểm
   * ================================================================ */

  /** Ba điều kiện an toàn theo vận tốc, góc hiện tại (HUD tô màu theo đây). */
  function safety(s) {
    return { vy: s.vy >= -VY_SAFE, vx: Math.abs(s.vx) <= VX_SAFE, angle: Math.abs(s.a) <= ANG_SAFE };
  }

  /** Điểm một lần đáp: cơ bản × hệ số + thưởng độ êm + thưởng nhiên liệu. */
  function landingScore(mult, s, fuel) {
    const worst = Math.max(Math.max(0, -s.vy) / VY_SAFE, Math.abs(s.vx) / VX_SAFE, Math.abs(s.a) / ANG_SAFE);
    const soft = Math.round(SOFT_MAX * clamp(1 - worst, 0, 1));
    const fuelBonus = Math.floor(clamp(fuel, 0, FUEL_MAX) / FUEL_DIV);
    const base = BASE * mult;
    return { mult, base, soft, fuel: fuelBonus, total: base + soft + fuelBonus };
  }

  function land(g, pad) {
    const s = g.ship;
    const pts = landingScore(pad.mult, s, g.fuel);
    g.score += pts.total;
    g.lands[PADS.findIndex((p) => p.mult === pad.mult)]++;
    g.fuel = Math.min(FUEL_MAX, g.fuel + REFILL);
    s.y = pad.y + FOOT;
    s.a = 0;
    s.vx = 0;
    s.vy = 0;
    s.thrusting = false;
    g.phase = 'landed';
    g.timer = LAND_WAIT;
    g.events.push(Object.assign({ type: 'land', x: s.x, y: pad.y }, pts));
  }

  function crash(g, reason) {
    const s = g.ship;
    g.ships--;
    g.wreck = { x: s.x, y: s.y, a: s.a };
    g.ship = null;
    g.phase = 'crashed';
    g.timer = CRASH_WAIT;
    g.events.push({ type: 'crash', x: s.x, y: s.y, reason, last: g.ships <= 0 || g.fuel <= 0 });
  }

  /* ================================================================
   * Một bước mô phỏng
   * ================================================================ */
  function step(g, input) {
    g.events = [];
    if (g.phase === 'over') return g;
    g.tick++;
    if (g.phase !== 'fly') {
      g.timer--;
      if (g.timer <= 0) {
        g.timer = 0;
        if (g.phase === 'landed') nextLevel(g);
        else if (g.ships <= 0 || g.fuel <= 0) {
          g.phase = 'over';
          g.events.push({ type: 'over' });
        } else spawn(g);
      }
      return g;
    }

    const s = g.ship;
    const inp = input || {};
    const turn = ROT * DT;
    if (inp.left && !inp.right) s.a -= turn;
    else if (inp.right && !inp.left) s.a += turn;
    else if (inp.assist) s.a = Math.abs(s.a) <= turn ? 0 : s.a - Math.sign(s.a) * turn;
    s.a = clamp(s.a, -MAX_TILT, MAX_TILT);

    let ax = windAt(g);
    let ay = -g.gravity;
    s.thrusting = false;
    if (inp.thrust && g.fuel > 0) {
      ax += THRUST * Math.sin(s.a);
      ay += THRUST * Math.cos(s.a);
      const before = g.fuel;
      g.fuel = Math.max(0, Math.round((g.fuel - BURN) * 1000) / 1000);
      s.thrusting = true;
      if (before > FUEL_LOW && g.fuel <= FUEL_LOW) g.events.push({ type: 'low' });
      if (g.fuel === 0) g.events.push({ type: 'empty' });
    }
    // Euler bán ẩn: vận tốc trước, vị trí theo vận tốc mới
    s.vx += ax * DT;
    s.vy += ay * DT;
    s.x = mod(s.x + s.vx * DT, W);
    s.y += s.vy * DT;
    if (s.y > CEIL) {
      s.y = CEIL;
      if (s.vy > 0) s.vy = 0;
    }

    const c = contact(g.terrain, s);
    if (c) {
      if (c.hull) crash(g, 'hull');
      else if (!c.pad) crash(g, 'rough');
      else {
        const ok = safety(s);
        if (ok.vy && ok.vx && ok.angle) land(g, c.pad);
        else crash(g, !ok.angle ? 'tilt' : !ok.vy ? 'fast' : 'drift');
      }
    }
    return g;
  }

  /** Độ cao của chân tàu so với mặt đất ngay bên dưới (HUD). */
  function altitude(g) {
    const s = g.ship;
    if (!s) return 0;
    return Math.max(0, s.y - FOOT - maxHeight(g.terrain, s.x, FOOT));
  }

  /* ================================================================
   * Lưu / khôi phục
   * ================================================================ */
  const PHASES = ['fly', 'landed', 'crashed', 'over'];
  const KEYS = ['seed', 'rng', 'tick', 'level', 'score', 'ships', 'fuel', 'phase', 'timer', 'lvSeed'];

  function toJSON(g) {
    const out = { v: VERSION };
    KEYS.forEach((k) => { out[k] = g[k]; });
    out.lands = g.lands.slice();
    out.ship = g.ship ? { x: g.ship.x, y: g.ship.y, vx: g.ship.vx, vy: g.ship.vy, a: g.ship.a } : null;
    out.wreck = g.wreck ? { x: g.wreck.x, y: g.wreck.y, a: g.wreck.a } : null;
    return out;
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const I32 = 2147483647;

  function okShip(s) {
    return isObj(s) && isNum(s.x) && s.x >= 0 && s.x < W && isNum(s.y) && s.y >= 0 && s.y <= CEIL &&
      isNum(s.vx) && isNum(s.vy) && Math.abs(s.vx) <= 2000 && Math.abs(s.vy) <= 2000 && isNum(s.a) && Math.abs(s.a) <= MAX_TILT + 1e-9;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app bỏ ván lưu). */
  function fromJSON(raw) {
    if (!isObj(raw) || raw.v !== VERSION) return null;
    if (!isInt(raw.seed, -I32 - 1, I32) || !isInt(raw.rng, -I32 - 1, I32) || !isInt(raw.lvSeed, -I32 - 1, I32)) return null;
    if (!isInt(raw.tick, 0, 1e9) || !isInt(raw.level, 1, 1e5) || !isInt(raw.score, 0, 1e9) || !isInt(raw.ships, 0, SHIPS)) return null;
    if (!isNum(raw.fuel) || raw.fuel < 0 || raw.fuel > FUEL_MAX) return null;
    if (PHASES.indexOf(raw.phase) < 0 || !isInt(raw.timer, 0, Math.max(LAND_WAIT, CRASH_WAIT))) return null;
    if (!Array.isArray(raw.lands) || raw.lands.length !== 3 || !raw.lands.every((n) => isInt(n, 0, 1e5))) return null;
    // Mỗi màn đã qua là một lần đáp; màn hiện tại chỉ tính khi vừa đáp xong
    if (raw.lands[0] + raw.lands[1] + raw.lands[2] > raw.level - (raw.phase === 'landed' ? 0 : 1)) return null;
    const withShip = raw.phase === 'fly' || raw.phase === 'landed';
    if (withShip ? !okShip(raw.ship) : raw.ship !== null) return null;
    if (raw.wreck != null && !(isObj(raw.wreck) && isNum(raw.wreck.x) && isNum(raw.wreck.y) && isNum(raw.wreck.a))) return null;
    if (raw.phase === 'fly' && (raw.timer !== 0 || raw.ships < 1)) return null;
    if (raw.phase === 'landed' && (raw.timer < 1 || raw.ships < 1)) return null;
    if (raw.phase === 'crashed' && raw.timer < 1) return null;

    const g = { v: VERSION };
    KEYS.forEach((k) => { g[k] = raw[k]; });
    g.lands = raw.lands.slice();
    g.ship = raw.ship ? { x: raw.ship.x, y: raw.ship.y, vx: raw.ship.vx, vy: raw.ship.vy, a: raw.ship.a, thrusting: false } : null;
    g.wreck = raw.wreck ? { x: raw.wreck.x, y: raw.wreck.y, a: raw.wreck.a } : null;
    g.events = [];
    buildLevel(g);
    return g;
  }

  const CONST = {
    W, FPS, DT, SPAWN_Y, CEIL, GROUND_MIN, GROUND_MAX, THRUST, ROT, MAX_TILT, FOOT, HULL, FUEL_MAX, BURN, REFILL, FUEL_LOW,
    VY_SAFE, VX_SAFE, ANG_SAFE, PADS, BASE, SOFT_MAX, FUEL_DIV, G0, G_STEP, G_MAX, WIND_BASE, WIND_STEP, WIND_MAX, GUST,
    SHIPS, LAND_WAIT, CRASH_WAIT,
  };
  const api = {
    CONST, newGame, step, makeTerrain, heightAt, maxHeight, padAt, shipPoly, contact, levelParams, windAt, safety,
    landingScore, altitude, wrapDelta, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
