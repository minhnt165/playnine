/* =====================================================================
 * Pháo Thủ - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bản đồ W × H đơn vị, trục y hướng lên; địa hình là mảng độ cao theo cột (mỗi cột rộng STEP)
 *   - Địa hình, vị trí pháo, gió sinh từ seed (mulberry32); gió đổi mỗi lượt theo rng lưu trong ván
 *   - Đạn bay theo bước cố định DT: trọng lực G kéo xuống, gió là gia tốc ngang; nổ thì khoét hố tròn,
 *     đất phía trên sập xuống; sát thương giảm dần theo khoảng cách tới tâm nổ; pháo rơi theo địa hình
 *   - Máy 3 mức: Dễ (công thức thô, sai số lớn), Vừa (mô phỏng vài phát, chọn tốt nhất, sai số vừa),
 *     Khó (dò góc / lực gần tối ưu có tính gió, sai số nhỏ, tự bù lệch sau phát trượt)
 *   - Mọi hàm nhận trạng thái cũ, trả trạng thái mới; toJSON / fromJSON để lưu ván (từ chối dữ liệu hỏng)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số thế giới ---------------- */
  const W = 800; // bề ngang bản đồ
  const H = 500; // chiều cao tham chiếu (trời cao hơn vẫn bay được)
  const STEP = 2; // bề rộng một cột địa hình
  const COLS = W / STEP + 1;
  const BEDROCK = 8; // lớp đá đáy, không khoét được
  const G = 250; // trọng lực (đơn vị / s²)
  const VMAX = 490; // vận tốc đầu nòng ở lực 100
  const DT = 1 / 120; // bước mô phỏng cố định
  const MAX_STEPS = 20 * 120; // đạn bay tối đa 20 s
  const OUT = 40; // ra ngoài mép quá chừng này là mất đạn
  const WIND_ACC = 3; // gia tốc ngang ứng với 1 nấc gió
  const MAX_WIND = 10;
  const MAX_HP = 100;
  const TANK_R = 10; // bán kính thân pháo (tính sát thương)
  const HIT_R = 13; // đạn vào gần tâm pháo chừng này là trúng thẳng
  const CENTER_H = 7; // tâm thân pháo cao hơn mặt đất
  const PIVOT_H = 10; // gốc nòng
  const BARREL = 16; // dài nòng
  const FOOT = 10; // pháo tựa trên điểm cao nhất trong ±FOOT quanh tâm
  const FALL_SAFE = 12; // rơi thấp hơn chừng này không mất máu
  const FALL_K = 0.3; // máu mất mỗi đơn vị rơi vượt ngưỡng
  const FALL_MAX = 15; // trần sát thương do rơi
  const MAX_SHOTS = 60; // quá số phát này thì phân thắng thua theo máu
  const MIN_GAP = 460; // hai pháo cách nhau ít nhất chừng này
  const DRAW = 2;
  const LEVELS = ['easy', 'medium', 'hard'];

  // Loại đạn: bán kính nổ, sát thương tối đa (trúng thẳng), số viên mỗi ván (null = không giới hạn)
  const WEAPONS = {
    shell: { id: 'shell', radius: 30, damage: 35, ammo: null, count: 1, spread: 0 },
    heavy: { id: 'heavy', radius: 46, damage: 50, ammo: 2, count: 1, spread: 0 },
    triple: { id: 'triple', radius: 20, damage: 22, ammo: 2, count: 3, spread: 4 },
  };
  const WEAPON_IDS = Object.keys(WEAPONS);

  const round2 = (v) => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /* ---------------- Số ngẫu nhiên có seed ---------------- */
  /** Một bước mulberry32: trả [số trong [0,1), trạng thái mới]. */
  function mbStep(s) {
    const a = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
  }
  function rng(seed) {
    let s = seed >>> 0;
    const r = () => {
      const o = mbStep(s);
      s = o[1];
      return o[0];
    };
    r.state = () => s;
    return r;
  }
  /** Trộn vài số thành một seed 32 bit. */
  function hash(a, b, c) {
    let h = (a >>> 0) ^ Math.imul((b | 0) + 1, 0x9e3779b1) ^ Math.imul((c | 0) + 1, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function nextWind(state) {
    const o = mbStep(state);
    return { wind: Math.round((o[0] * 2 - 1) * MAX_WIND), rng: o[1] };
  }

  /* ---------------- Địa hình ---------------- */
  /** Độ cao mặt đất tại x (nội suy tuyến tính giữa hai cột). */
  function groundAt(t, x) {
    const f = clamp(x, 0, W) / STEP;
    const i = Math.floor(f);
    if (i >= COLS - 1) return t[COLS - 1];
    const k = f - i;
    return t[i] + (t[i + 1] - t[i]) * k;
  }
  /** Độ cao pháo đứng ở x: điểm cao nhất dưới bánh xích. */
  const restY = (t, x) => Math.max(groundAt(t, x - FOOT), groundAt(t, x), groundAt(t, x + FOOT));
  const tankCenter = (tank) => ({ x: tank.x, y: tank.y + CENTER_H });
  function muzzle(tank, angle) {
    const a = (angle * Math.PI) / 180;
    return { x: tank.x + Math.cos(a) * BARREL, y: tank.y + PIVOT_H + Math.sin(a) * BARREL };
  }

  /** Sinh địa hình đồi núi: tổng vài sóng sin + một đồi (hoặc thung lũng) giữa bản đồ; san phẳng nền hai pháo. */
  function generate(r) {
    const base = H * (0.2 + 0.12 * r());
    const comps = [[1, 2.2, 0.1], [2.2, 4.5, 0.055], [4.5, 8, 0.025], [9, 14, 0.01]].map(([lo, hi, a]) => ({
      f: lo + (hi - lo) * r(),
      amp: H * a * (0.6 + 0.8 * r()),
      ph: r() * Math.PI * 2,
    }));
    const xc = W * (0.38 + 0.24 * r());
    const hw = W * (0.07 + 0.08 * r());
    const hh = H * (-0.06 + 0.32 * r());
    const xs = [50 + Math.floor(r() * 121), 630 + Math.floor(r() * 121)];
    const t = new Array(COLS);
    for (let i = 0; i < COLS; i++) {
      const x = i * STEP;
      let h = base + hh * Math.exp(-((x - xc) / hw) * ((x - xc) / hw));
      for (const c of comps) h += c.amp * Math.sin((2 * Math.PI * c.f * x) / W + c.ph);
      t[i] = clamp(h, H * 0.08, H * 0.62);
    }
    // Nền pháo: phẳng trong ±22, chuyển dần tới ±40
    for (const px of xs) {
      // Nền không trũng quá sâu (pháo kẹt đáy hố thì khó bắn ra)
      const ph = Math.max(t[Math.round(px / STEP)], base - H * 0.04);
      for (let i = 0; i < COLS; i++) {
        const d = Math.abs(i * STEP - px);
        if (d <= 22) t[i] = ph;
        else if (d < 40) {
          const k = (d - 22) / 18;
          t[i] = ph + (t[i] - ph) * k * k * (3 - 2 * k);
        }
      }
    }
    for (let i = 0; i < COLS; i++) t[i] = round2(t[i]);
    return { terrain: t, xs };
  }

  /** Khoét hố tròn tâm (ex, ey) bán kính r: phần đất trong hố biến mất, đất phía trên sập xuống. Trả mảng mới. */
  function carve(t, ex, ey, r) {
    const out = t.slice();
    const i0 = Math.max(0, Math.ceil((ex - r) / STEP));
    const i1 = Math.min(COLS - 1, Math.floor((ex + r) / STEP));
    for (let i = i0; i <= i1; i++) {
      const dx = i * STEP - ex;
      const dy2 = r * r - dx * dx;
      if (dy2 <= 0) continue;
      const dy = Math.sqrt(dy2);
      const bottom = ey - dy;
      const h = out[i];
      if (h <= bottom) continue;
      const removed = Math.min(h, ey + dy) - bottom;
      out[i] = round2(Math.max(BEDROCK, h - removed));
    }
    return out;
  }

  /** Sát thương của một vụ nổ lên một pháo: tối đa khi tâm nổ chạm thân, giảm tuyến tính tới 0 ở mép bán kính. */
  function blastDamage(tank, ex, ey, weapon) {
    const c = tankCenter(tank);
    const d = Math.hypot(ex - c.x, ey - c.y) - TANK_R;
    if (d <= 0) return weapon.damage;
    if (d >= weapon.radius) return 0;
    return Math.round(weapon.damage * (1 - d / weapon.radius));
  }

  /** Pháo rơi xuống mặt đất mới; rơi quá FALL_SAFE thì mất máu (tối đa FALL_MAX). */
  function settle(t, tanks) {
    const fall = [0, 0];
    const fallDamage = [0, 0];
    const next = tanks.map((tk, i) => {
      const ny = restY(t, tk.x);
      fall[i] = Math.max(0, tk.y - ny);
      if (fall[i] > FALL_SAFE) fallDamage[i] = Math.min(FALL_MAX, Math.round((fall[i] - FALL_SAFE) * FALL_K));
      return Object.assign({}, tk, { y: ny });
    });
    return { tanks: next, fall, fallDamage };
  }

  /* ---------------- Đường bay ---------------- */
  /** Một viên đạn đang bay. */
  function launch(tank, angle, power) {
    const m = muzzle(tank, angle);
    const a = (angle * Math.PI) / 180;
    const v = (power / 100) * VMAX;
    return { x: m.x, y: m.y, vx: v * Math.cos(a), vy: v * Math.sin(a), top: m.y };
  }

  /**
   * Bay thêm một bước. Trả null nếu còn bay, hoặc { x, y, hit (chỉ số pháo bị trúng thẳng | -1), out } khi dừng.
   * Chạm đất thì nội suy điểm cắt giữa hai bước để chỗ nổ không phụ thuộc bước.
   */
  function advance(p, t, tanks, ax, ghost) {
    const px = p.x;
    const py = p.y;
    p.vx += ax * DT;
    p.vy -= G * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (p.y > p.top) p.top = p.y;
    if (p.x < -OUT || p.x > W + OUT || p.y < -50) return { x: p.x, y: p.y, hit: -1, out: true };
    for (let i = 0; i < 2; i++) {
      if (i === ghost) continue;
      const c = tankCenter(tanks[i]);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return { x: p.x, y: p.y, hit: i, out: false };
    }
    if (p.x >= 0 && p.x <= W) {
      const cg = p.y - groundAt(t, p.x);
      if (cg <= 0) {
        const pg = px >= 0 && px <= W ? py - groundAt(t, px) : 1;
        const k = pg > 0 ? pg / (pg - cg) : 1;
        const x = px + (p.x - px) * k;
        return { x, y: groundAt(t, x), hit: -1, out: false };
      }
    }
    return null;
  }

  /** Bay một viên đạn trên địa hình cố định (cho máy dò và cho test). Trả { x, y, hit, out, steps, top, path? }. */
  function trace(t, tanks, shooter, angle, power, wind, record, ghost) {
    const p = launch(tanks[shooter], angle, power);
    const ax = wind * WIND_ACC;
    const path = record ? [p.x, p.y] : null;
    for (let s = 1; s <= MAX_STEPS; s++) {
      const e = advance(p, t, tanks, ax, ghost == null ? -1 : ghost);
      if (path) path.push(e ? e.x : p.x, e ? e.y : p.y);
      if (e) return Object.assign(e, { steps: s, top: p.top, path });
    }
    return { x: p.x, y: p.y, hit: -1, out: true, steps: MAX_STEPS, top: p.top, path };
  }

  /* ---------------- Ván ---------------- */
  /**
   * Ván mới theo seed. Màn sinh ra phải bắn trúng được: với gió mạnh nhất hai chiều, mỗi bên đều phải có
   * một phát (máy dò) gây sát thương cho đối thủ; không thì sinh lại từ dãy số tiếp theo (hiếm, vài phần nghìn).
   */
  function newGame(opts) {
    const o = opts || {};
    const seed = Number.isInteger(o.seed) ? o.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    const r = rng(seed);
    let g = null;
    for (let tries = 0; tries < 12; tries++) {
      const { terrain, xs } = generate(r);
      g = {
        seed,
        terrain,
        tanks: xs.map((x, i) => ({
          x,
          y: restY(terrain, x),
          hp: MAX_HP,
          angle: i === 0 ? 45 : 135,
          power: 60,
          ammo: { heavy: WEAPONS.heavy.ammo, triple: WEAPONS.triple.ammo },
        })),
        turn: o.first === 1 ? 1 : 0,
        wind: 0,
        rng: 0,
        shots: 0,
        winner: null,
        last: [null, null],
        mem: [null, null],
      };
      if (playable(g)) break;
    }
    const w = nextWind(r.state());
    g.wind = w.wind;
    g.rng = w.rng;
    return g;
  }

  /** Mỗi bên, với gió -MAX và +MAX, đều có phát trúng đối thủ (sát thương ≥ 20). */
  function playable(g) {
    for (const wind of [-MAX_WIND, MAX_WIND]) {
      for (const side of [0, 1]) {
        const p = planShot(g, side, { wind });
        if (!p || p.dmg < 20 || p.self > 0) return false;
      }
    }
    return true;
  }

  const isOver = (g) => g.winner != null;
  function canUse(g, weapon) {
    if (!WEAPONS[weapon]) return false;
    return WEAPONS[weapon].ammo == null || g.tanks[g.turn].ammo[weapon] > 0;
  }

  function validShot(g, s) {
    return isObj(s) && !isOver(g) && isNum(s.angle) && s.angle >= 0 && s.angle <= 180 &&
      isNum(s.power) && s.power >= 0 && s.power <= 100 && canUse(g, s.weapon);
  }

  /**
   * Bắn một phát của bên tới lượt. shot: { angle (0 = sang phải, 90 = thẳng lên, 180 = sang trái), power 0–100,
   * weapon, mem? (trí nhớ của máy, lưu kèm) }. Trả null nếu phát bắn sai luật, ngược lại:
   * { state, shells: [{ path: [x, y, …] mỗi bước DT, end }], explosions: [{ x, y, r, step }], damage, fall, fallDamage }.
   */
  function fire(g, shot) {
    if (!validShot(g, shot)) return null;
    const me = g.turn;
    const wpn = WEAPONS[shot.weapon];
    const ax = g.wind * WIND_ACC;
    const angles = wpn.count === 1 ? [shot.angle] : [-1, 0, 1].map((k) => clamp(shot.angle + k * wpn.spread, 0, 180));
    const tanks = g.tanks;
    let terrain = g.terrain;
    const live = angles.map((a) => ({ p: launch(tanks[me], a, shot.power), path: null, end: null }));
    live.forEach((s) => { s.path = [round2(s.p.x), round2(s.p.y)]; });
    const explosions = [];
    const blast = [0, 0];
    let left = live.length;
    for (let step = 1; step <= MAX_STEPS && left; step++) {
      for (const s of live) {
        if (s.end) continue;
        const e = advance(s.p, terrain, tanks, ax, -1);
        s.path.push(round2(e ? e.x : s.p.x), round2(e ? e.y : s.p.y));
        if (!e) continue;
        s.end = { x: round2(e.x), y: round2(e.y), hit: e.hit, out: e.out, step };
        left--;
        if (e.out) continue;
        explosions.push({ x: s.end.x, y: s.end.y, r: wpn.radius, step });
        terrain = carve(terrain, e.x, e.y, wpn.radius);
        for (let i = 0; i < 2; i++) blast[i] += blastDamage(tanks[i], e.x, e.y, wpn);
      }
    }
    live.forEach((s) => { if (!s.end) s.end = { x: round2(s.p.x), y: round2(s.p.y), hit: -1, out: true, step: MAX_STEPS }; });

    const st = settle(terrain, tanks);
    const damage = [0, 1].map((i) => blast[i] + st.fallDamage[i]);
    const nextTanks = st.tanks.map((tk, i) => {
      const n = { x: tk.x, y: tk.y, hp: Math.max(0, tk.hp - damage[i]), angle: tk.angle, power: tk.power, ammo: Object.assign({}, tk.ammo) };
      if (i === me) {
        n.angle = round2(shot.angle);
        n.power = round2(shot.power);
        if (wpn.ammo != null) n.ammo[wpn.id]--;
      }
      return n;
    });
    const shots = g.shots + 1;
    let winner = null;
    const dead = nextTanks.map((tk) => tk.hp <= 0);
    if (dead[0] && dead[1]) winner = DRAW;
    else if (dead[0]) winner = 1;
    else if (dead[1]) winner = 0;
    else if (shots >= MAX_SHOTS) {
      const a = nextTanks[0].hp;
      const b = nextTanks[1].hp;
      winner = a > b ? 0 : b > a ? 1 : DRAW;
    }
    const center = live[(live.length - 1) >> 1].end;
    const last = g.last.slice();
    last[me] = { angle: round2(shot.angle), power: round2(shot.power), weapon: wpn.id, wind: g.wind, x: center.x, out: center.out, shot: g.shots };
    const mem = g.mem.slice();
    if (shot.mem !== undefined) mem[me] = shot.mem;
    const w = nextWind(g.rng);
    const state = {
      seed: g.seed,
      terrain,
      tanks: nextTanks,
      turn: 1 - me,
      wind: w.wind,
      rng: w.rng,
      shots,
      winner,
      last,
      mem,
    };
    return { state, shells: live.map((s) => ({ path: s.path, end: s.end })), explosions, damage, blast, fall: st.fall, fallDamage: st.fallDamage };
  }

  /* ---------------- Máy ---------------- */
  // Sai số theo mức (đơn vị: lực 0–100, góc độ): lệch tay cả ván (bias, máy không biết) + nhiễu mỗi phát
  const AI = {
    easy: { bias: 8, power: 9, angle: 5 },
    medium: { bias: 5, power: 4.5, angle: 2.5 },
    hard: { bias: 4, power: 0.8, angle: 0.4 },
  };

  /**
   * Điểm rơi của một phát khi coi đối thủ như không có (rơi xuống đất ngay dưới đối thủ nếu trúng),
   * đo theo hướng bắn: âm = rơi trước mục tiêu, dương = bay quá. Dùng để máy chỉnh lực.
   */
  function landMiss(g, side, angle, power, wind, tx, dir) {
    return (trace(g.terrain, g.tanks, side, angle, power, wind, false, 1 - side).x - tx) * dir;
  }

  /** Lực ước lượng bằng công thức ném xiên trên đất phẳng, không gió. */
  function flatPower(dx, elev) {
    const s = Math.sin((2 * elev * Math.PI) / 180);
    if (s <= 0.05) return 100;
    return clamp((Math.sqrt((Math.abs(dx) * G) / s) / VMAX) * 100, 5, 100);
  }

  /** Đánh giá một phát (bay trên địa hình hiện tại): sát thương lên đối thủ và lên chính mình. */
  function judge(g, side, angle, power, wind, wpn) {
    const r = trace(g.terrain, g.tanks, side, angle, power, wind);
    if (r.out) return { dmg: 0, self: 0 };
    const dmg = r.hit === 1 - side ? wpn.damage : blastDamage(g.tanks[1 - side], r.x, r.y, wpn);
    const self = r.hit === side ? wpn.damage : blastDamage(g.tanks[side], r.x, r.y, wpn);
    return { dmg, self };
  }

  /** Chia đôi lực trong [lo, hi] cho tới khi f(p) đổi dấu (f tăng theo lực); trả lực ở giữa khoảng cuối. */
  function bisect(f, lo, hi, iters) {
    for (let k = 0; k < iters; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Dò phát gần tối ưu: mỗi góc nâng 10°–84° (bước 2°), chia đôi lực cho tới khi điểm rơi trùng đối thủ
   * (tính cả gió và địa hình), chấm theo sát thương thật, phạt tự gây sát thương, hơi thích góc vừa.
   * opts: { wind, weapon }. Trả { angle, power, dmg, self } hoặc null.
   */
  function planShot(g, side, opts) {
    const o = opts || {};
    const wind = o.wind == null ? g.wind : o.wind;
    const wpn = WEAPONS[o.weapon] || WEAPONS.shell;
    const tx = g.tanks[1 - side].x;
    const dir = tx >= g.tanks[side].x ? 1 : -1;
    let best = null;
    for (let elev = 10; elev <= 84; elev += 2) {
      const angle = dir > 0 ? elev : 180 - elev;
      const f = (p) => landMiss(g, side, angle, p, wind, tx, dir);
      if (f(100) < 0) continue; // không với tới
      const p = bisect(f, 0, 100, 16);
      const j = judge(g, side, angle, p, wind, wpn);
      const score = j.dmg - 3 * j.self - 0.02 * Math.abs(elev - 45);
      if (!best || score > best.score) best = { angle, power: p, dmg: j.dmg, self: j.self, score };
    }
    return best;
  }

  /** Vừa: thử vài góc ngẫu nhiên, mỗi góc chỉnh lực bằng vài phát mô phỏng (phương pháp dây cung), chọn tốt nhất. */
  function sampleShot(g, side, wpn, R) {
    const tx = g.tanks[1 - side].x;
    const dir = tx >= g.tanks[side].x ? 1 : -1;
    let best = null;
    for (let k = 0; k < 6; k++) {
      const elev = 25 + R() * 47;
      const angle = dir > 0 ? elev : 180 - elev;
      const f = (p) => landMiss(g, side, angle, p, g.wind, tx, dir);
      let p0 = flatPower(tx - g.tanks[side].x, elev);
      let p1 = clamp(p0 * 1.06, 5, 100);
      let m0 = f(p0);
      let m1 = f(p1);
      for (let i = 0; i < 4 && Math.abs(m1) > 2 && m1 !== m0; i++) {
        const p2 = clamp(p1 - (m1 * (p1 - p0)) / (m1 - m0), 3, 100);
        p0 = p1;
        m0 = m1;
        p1 = p2;
        m1 = f(p1);
      }
      const j = judge(g, side, angle, p1, g.wind, wpn);
      const score = j.dmg - 3 * j.self - Math.abs(m1) * 0.05;
      if (!best || score > best.score) best = { angle, power: p1, score };
    }
    return best;
  }

  /** Lực (ở góc và gió đã cho) cho điểm rơi tại x — để máy Khó đọc lại phát trước của mình. null nếu không khớp. */
  function powerFor(g, side, angle, wind, x, loose) {
    const dir = angle <= 90 ? 1 : -1;
    const f = (p) => landMiss(g, side, angle, p, wind, x, dir);
    if (f(0) > 0 || f(100) < 0) return null;
    const p = bisect(f, 0, 100, 16);
    return loose || Math.abs(f(p)) < 10 ? p : null;
  }

  function pickWeapon(g, side, level, R, mem) {
    const ammo = g.tanks[side].ammo;
    if (level === 'easy') {
      if (ammo.heavy > 0 && R() < 0.3) return 'heavy';
      if (ammo.triple > 0 && R() < 0.2) return 'triple';
      return 'shell';
    }
    if (level === 'medium') return ammo.heavy > 0 && R() < 0.5 ? 'heavy' : 'shell';
    // Khó: phát đầu bắn thử bằng đạn thường để chỉnh ngắm, sau đó dùng đạn nặng, rồi đạn chùm
    if (!mem || !mem.n) return 'shell';
    if (ammo.heavy > 0) return 'heavy';
    if (ammo.triple > 0) return 'triple';
    return 'shell';
  }

  /**
   * Máy chọn phát bắn cho bên tới lượt. Tất định theo ván (seed, số phát, bên). Trả { angle, power, weapon, mem }:
   * mem là trí nhớ của máy (lệch ước lượng, phát vừa ngắm) — truyền nguyên vào fire để lưu kèm ván.
   */
  function chooseShot(g, level) {
    const lv = AI[level] ? level : 'medium';
    const P = AI[lv];
    const side = g.turn;
    const tx = g.tanks[1 - side].x;
    const dir = tx >= g.tanks[side].x ? 1 : -1;
    const R = rng(hash(g.seed, g.shots, side + 7));
    const biasUnit = rng(hash(g.seed, -1, side + 11))() * 2 - 1;
    const prev = g.mem[side];
    const mem = { bias: prev ? prev.bias : 0, n: prev ? prev.n : 0, aim: null };

    // Khó: đọc lại phát trước (góc đã ngắm, gió lúc đó, điểm rơi thật) để ước lượng lệch tay, rồi bù vào.
    // Đạn bay khỏi bản đồ thì chỉ biết lực thật ít nhất bằng lực rơi đúng mép: lấy mép làm ước lượng.
    const last = g.last[side];
    if (lv === 'hard' && prev && prev.aim && last && last.shot === prev.aim.shot) {
      const x = last.out ? (last.x > W / 2 ? W : 0) : last.x;
      const pObs = powerFor(g, side, prev.aim.angle, last.wind, x, last.out);
      if (pObs != null) {
        const e = pObs - prev.aim.power + (last.out ? 1 : 0);
        mem.bias = mem.n ? mem.bias * 0.3 + e * 0.7 : e;
        mem.n++;
      }
    }

    const weapon = pickWeapon(g, side, lv, R, prev);
    const wpn = WEAPONS[weapon];
    let plan = null;
    if (lv === 'hard') plan = planShot(g, side, { wind: g.wind, weapon });
    else if (lv === 'medium') plan = sampleShot(g, side, wpn, R);
    if (!plan) {
      const elev = lv === 'easy' ? 35 + R() * 30 : 55;
      plan = { angle: dir > 0 ? elev : 180 - elev, power: flatPower(tx - g.tanks[side].x, elev) };
    }
    const aimPower = clamp(plan.power - (lv === 'hard' ? mem.bias : 0), 0, 100);
    mem.aim = { angle: round2(plan.angle), power: round2(aimPower), shot: g.shots };

    // Tay máy: lệch hệ thống + nhiễu tam giác; không bắn phát nào làm chính mình mất máu
    const noisy = () => {
      const n = R() + R() - 1;
      const m = R() + R() - 1;
      return {
        angle: round2(clamp(plan.angle + m * P.angle, 0, 180)),
        power: round2(clamp(aimPower + biasUnit * P.bias + n * P.power, 0, 100)),
      };
    };
    const safe = (s) => fire(g, { angle: s.angle, power: s.power, weapon }).damage[side] === 0;
    let s = noisy();
    for (let k = 0; k < 6 && !safe(s); k++) s = noisy();
    if (!safe(s)) {
      // Phương án dự phòng: phát cầu vồng cao về phía đối thủ, chọn lực đầu tiên không tự gây hại
      const lobs = [plan.power, 100, 90, 80, 70, 60].map((p) => ({ angle: round2(dir > 0 ? 70 : 110), power: p }));
      s = lobs.find(safe) || s;
    }
    return { angle: s.angle, power: s.power, weapon, mem };
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION,
      seed: g.seed,
      terrain: g.terrain.slice(),
      tanks: g.tanks.map((t) => ({ x: t.x, hp: t.hp, angle: t.angle, power: t.power, ammo: { heavy: t.ammo.heavy, triple: t.ammo.triple } })),
      turn: g.turn,
      wind: g.wind,
      rng: g.rng,
      shots: g.shots,
      winner: g.winner,
      last: g.last.map((l) => (l ? Object.assign({}, l) : null)),
      mem: g.mem.map((m) => (m ? { bias: m.bias, n: m.n, aim: m.aim ? Object.assign({}, m.aim) : null } : null)),
    };
  }

  const isU32 = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  function okTank(t) {
    return isObj(t) && isNum(t.x) && t.x >= 20 && t.x <= W - 20 && Number.isInteger(t.hp) && t.hp >= 0 && t.hp <= MAX_HP &&
      isNum(t.angle) && t.angle >= 0 && t.angle <= 180 && isNum(t.power) && t.power >= 0 && t.power <= 100 &&
      isObj(t.ammo) && WEAPON_IDS.filter((w) => WEAPONS[w].ammo != null).every((w) => Number.isInteger(t.ammo[w]) && t.ammo[w] >= 0 && t.ammo[w] <= WEAPONS[w].ammo);
  }
  function okLast(l) {
    return l === null || (isObj(l) && isNum(l.angle) && isNum(l.power) && !!WEAPONS[l.weapon] && Number.isInteger(l.wind) &&
      isNum(l.x) && typeof l.out === 'boolean' && Number.isInteger(l.shot) && l.shot >= 0);
  }
  function okMem(m) {
    if (m === null) return true;
    if (!isObj(m) || !isNum(m.bias) || Math.abs(m.bias) > 100 || !Number.isInteger(m.n) || m.n < 0) return false;
    return m.aim === null || (isObj(m.aim) && isNum(m.aim.angle) && isNum(m.aim.power) && Number.isInteger(m.aim.shot) && m.aim.shot >= 0);
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!isObj(raw) || raw.v !== VERSION) return null;
    if (!isU32(raw.seed) || !isU32(raw.rng)) return null;
    if (!Array.isArray(raw.terrain) || raw.terrain.length !== COLS) return null;
    if (!raw.terrain.every((h) => isNum(h) && h >= BEDROCK && h <= H)) return null;
    if (!Array.isArray(raw.tanks) || raw.tanks.length !== 2 || !raw.tanks.every(okTank)) return null;
    if (raw.turn !== 0 && raw.turn !== 1) return null;
    if (!Number.isInteger(raw.wind) || Math.abs(raw.wind) > MAX_WIND) return null;
    if (!Number.isInteger(raw.shots) || raw.shots < 0 || raw.shots > MAX_SHOTS) return null;
    const anyDead = raw.tanks.some((t) => t.hp === 0);
    if (raw.winner === null) {
      if (anyDead || raw.shots >= MAX_SHOTS) return null;
    } else if ([0, 1, DRAW].indexOf(raw.winner) < 0 || !(anyDead || raw.shots >= MAX_SHOTS)) return null;
    if (!Array.isArray(raw.last) || raw.last.length !== 2 || !raw.last.every(okLast)) return null;
    if (!Array.isArray(raw.mem) || raw.mem.length !== 2 || !raw.mem.every(okMem)) return null;
    const terrain = raw.terrain.slice();
    return {
      seed: raw.seed,
      terrain,
      tanks: raw.tanks.map((t) => ({ x: t.x, y: restY(terrain, t.x), hp: t.hp, angle: t.angle, power: t.power, ammo: { heavy: t.ammo.heavy, triple: t.ammo.triple } })),
      turn: raw.turn,
      wind: raw.wind,
      rng: raw.rng,
      shots: raw.shots,
      winner: raw.winner,
      last: raw.last.map((l) => (l ? Object.assign({}, l) : null)),
      mem: raw.mem.map((m) => (m ? { bias: m.bias, n: m.n, aim: m.aim ? Object.assign({}, m.aim) : null } : null)),
    };
  }

  const api = {
    VERSION, W, H, STEP, COLS, BEDROCK, G, VMAX, DT, WIND_ACC, MAX_WIND, MAX_HP, TANK_R, HIT_R, CENTER_H, PIVOT_H, BARREL,
    FALL_SAFE, FALL_MAX, MAX_SHOTS, MIN_GAP, DRAW, LEVELS, WEAPONS, WEAPON_IDS,
    rng, groundAt, restY, tankCenter, muzzle, carve, blastDamage, settle, trace,
    newGame, isOver, canUse, fire, planShot, chooseShot, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
