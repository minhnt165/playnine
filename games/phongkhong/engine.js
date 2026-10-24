/* =====================================================================
 * Phòng Không - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Sân logic 240 x 360 (y hướng xuống), mô phỏng theo bước cố định 60 bước / giây (STEP_MS)
 *   - step(game, input) đổi trực tiếp trạng thái và trả mảng sự kiện cho giao diện;
 *     input = { shots: [{ x, y, base? }] } (base 0 | 1 | 2 = bệ chỉ định, bỏ trống = bệ gần nhất còn đạn)
 *   - Tất định: cùng hạt giống + cùng chuỗi input (theo tick) thì ra cùng ván (PRNG mulberry32 nằm trong trạng thái)
 *   - Luật: tên lửa địch rơi xiên từ mép trên xuống 6 thành phố và 3 bệ phóng; chạm một điểm thì bệ gần nhất
 *     còn đạn bắn đạn chặn bay thẳng tới đó rồi nổ thành quả cầu nở - giữ - co; tên lửa / máy bay chạm quả cầu
 *     thì nổ và để lại quả cầu nhỏ (nổ dây chuyền). Mỗi bệ 10 đạn mỗi đợt, bệ bị trúng mất đạn tới hết đợt.
 *     Đợt sau nhanh hơn, nhiều hơn; từ đợt 3 có tên lửa tách đầu (MIRV), từ đợt 4 có máy bay thả bom.
 *     Hết đợt: thưởng đạn còn + thành phố còn (nhân hệ số đợt); mỗi 10.000 điểm được một thành phố thưởng.
 *     Mất hết thành phố (và không còn thành phố thưởng) là hết ván.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số sân chơi (đơn vị: px logic, tick = 1/60 giây) ---------------- */
  const W = 240;
  const H = 360;
  const STEP_MS = 1000 / 60;

  const GROUND_Y = 334; // mặt đất
  const BASE_X = [18, 120, 222]; // 3 bệ phóng: trái, giữa, phải
  const BASE_Y = 322; // đỉnh bệ: nơi đạn chặn rời bệ, cũng là điểm tên lửa nhắm vào bệ
  const CITY_X = [44, 68, 92, 148, 172, 196]; // 6 thành phố, 3 mỗi bên bệ giữa
  const CITY_Y = 330; // điểm tên lửa nhắm vào thành phố
  const CITY_W = 18;
  const N_CITY = CITY_X.length;
  const N_BASE = BASE_X.length;

  // Đạn chặn
  const AMMO = 10; // mỗi bệ, mỗi đợt
  const SHOT_SPEED = 5; // px / tick
  const AIM_X_MIN = 2;
  const AIM_X_MAX = W - 2;
  const AIM_Y_MIN = 8;
  const AIM_Y_MAX = 300; // không ngắm thấp hơn (quả cầu sát đất sẽ đè lên thành phố)

  // Quả cầu nổ: nở GROW tick, giữ HOLD tick, co SHRINK tick
  const R_MAX = 20;
  const CHAIN_R = 15; // quả cầu do tên lửa / máy bay bị hạ để lại
  const GROW = 18;
  const HOLD = 12;
  const SHRINK = 24;
  const LIFE = GROW + HOLD + SHRINK;

  // Máy bay ném bom
  const BOMBER_R = 6; // bán kính va chạm
  const BOMBER_MAX_DROPS = 3;

  // Điểm
  const MISSILE_PTS = 25;
  const BOMBER_PTS = 100;
  const AMMO_PTS = 5;
  const CITY_PTS = 100;
  const BONUS_CITY_EVERY = 10000;
  const MAX_BANK = 9;

  const GRACE = 90; // đầu đợt: chờ chừng này tick mới phóng tên lửa đầu
  const BONUS_TICKS = 180; // đếm thưởng giữa hai đợt
  const PHASES = ['play', 'bonus', 'over'];

  /* ---------------- Tiện ích ---------------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Hạt giống: số hoặc chuỗi (băm FNV-1a) → số nguyên 32 bit. */
  function seedOf(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const s = String(seed == null ? '' : seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry32: trạng thái nằm ở g.rng nên lưu / khôi phục ván là chạy tiếp đúng dãy số. */
  function rand(g) {
    let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (g, n) => Math.floor(rand(g) * n);

  /* ---------------- Độ khó theo đợt ---------------- */
  /** Tốc độ tên lửa địch (px / tick dọc theo đường bay). */
  const waveSpeed = (w) => Math.min(0.55 + 0.09 * (w - 1), 1.9);
  /** Số tên lửa phóng từ mép trên trong một đợt (chưa kể đầu đạn tách và bom của máy bay). */
  const waveCount = (w) => Math.min(12 + 3 * (w - 1), 40);
  /** Hệ số điểm: ×1 đợt 1–2, ×2 đợt 3–4… tối đa ×6. */
  const multiplier = (w) => Math.min(6, 1 + ((w - 1) >> 1));
  /** Xác suất một tên lửa là loại tách đầu. */
  const mirvChance = (w) => (w < 3 ? 0 : Math.min(0.4, 0.12 + 0.04 * (w - 3)));
  /** Số máy bay ném bom trong đợt. */
  const bomberCount = (w) => (w < 4 ? 0 : Math.min(3, 1 + Math.floor((w - 4) / 3)));
  /** Khoảng nghỉ trung bình giữa hai loạt phóng (tick). */
  const salvoGap = (w) => Math.max(36, 150 - 12 * (w - 1));
  /** Số tên lửa tối đa trên trời cùng lúc (đủ rồi thì hoãn loạt kế). */
  const maxAlive = (w) => Math.min(4 + w, 14);

  /* ---------------- Mục tiêu ---------------- */
  /** Toạ độ mục tiêu: 0..5 thành phố, 6..8 bệ. */
  function targetPos(t) {
    return t < N_CITY ? { x: CITY_X[t], y: CITY_Y } : { x: BASE_X[t - N_CITY], y: BASE_Y };
  }
  const citiesAlive = (g) => g.cities.reduce((a, b) => a + b, 0);
  const ammoLeft = (g) => g.ammo.reduce((a, b, i) => a + (g.baseAlive[i] ? b : 0), 0);
  const isOver = (g) => g.phase === 'over';

  /** Chọn ngẫu nhiên một mục tiêu còn sống (thành phố hoặc bệ); hết cả thì nhắm vào nền thành phố cũ. */
  function pickTarget(g) {
    const list = [];
    for (let i = 0; i < N_CITY; i++) if (g.cities[i]) list.push(i);
    for (let j = 0; j < N_BASE; j++) if (g.baseAlive[j]) list.push(N_CITY + j);
    return list.length ? list[randInt(g, list.length)] : randInt(g, N_CITY);
  }

  /** Bệ gần điểm ngắm nhất còn đạn (bằng nhau thì bệ bên trái); không còn bệ nào thì -1. */
  function pickBase(g, x, y) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < N_BASE; j++) {
      if (!g.baseAlive[j] || g.ammo[j] <= 0) continue;
      const d = Math.hypot(BASE_X[j] - x, BASE_Y - y);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  }

  /** Bán kính quả cầu ở tuổi `age` (tick): nở đều, giữ, co đều; ngoài khoảng sống là 0. */
  function radiusAt(age, r) {
    if (age < 0 || age >= LIFE) return 0;
    if (age < GROW) return (r * (age + 1)) / GROW;
    if (age < GROW + HOLD) return r;
    return (r * (LIFE - age)) / SHRINK;
  }

  /* ---------------- Sinh vật bay ---------------- */
  /** Tên lửa địch từ (x, y) tới mục tiêu t. kind: 0 phóng từ trên, 1 bom của máy bay, 2 đầu đạn tách. */
  function spawnMissile(g, o) {
    const p = targetPos(o.t);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    const m = {
      id: g.nextId++,
      born: g.tick,
      sx: o.x,
      sy: o.y,
      x: o.x,
      y: o.y,
      vx: (dx / d) * o.speed,
      vy: (dy / d) * o.speed,
      t: o.t,
      tx: p.x,
      ty: p.y,
      split: o.split || 0,
      kind: o.kind || 0,
    };
    g.missiles.push(m);
    return m;
  }

  /** Máy bay ném bom bay ngang ở độ cao y, từ mép trái (dir 1) hoặc phải (dir -1). */
  function spawnBomber(g, o) {
    const b = {
      id: g.nextId++,
      x: o.dir > 0 ? -12 : W + 12,
      y: o.y,
      vx: o.dir * Math.min(0.6 + 0.04 * (g.wave - 4), 1),
      dropT: 40 + randInt(g, 40),
      drops: 0,
    };
    g.bombers.push(b);
    return b;
  }

  /* ---------------- Ván, đợt ---------------- */
  function newGame(opts) {
    const g = {
      rng: seedOf(opts && opts.seed),
      tick: 0,
      wave: 1,
      score: 0,
      phase: 'play',
      timer: 0,
      cities: [1, 1, 1, 1, 1, 1],
      baseAlive: [1, 1, 1],
      ammo: [AMMO, AMMO, AMMO],
      bank: 0,
      nextBonus: BONUS_CITY_EVERY,
      toSpawn: 0,
      spawnT: 0,
      bombersLeft: 0,
      bomberT: 0,
      nextId: 1,
      missiles: [],
      bombers: [],
      shots: [],
      booms: [],
      kills: 0,
      fired: 0,
      lost: 0,
    };
    startWave(g, 1, []);
    return g;
  }

  /** Vào đợt w: bệ được dựng lại đủ đạn, dùng thành phố thưởng để dựng thành phố đã mất. */
  function startWave(g, w, ev) {
    g.wave = w;
    g.phase = 'play';
    g.timer = 0;
    g.baseAlive = [1, 1, 1];
    g.ammo = [AMMO, AMMO, AMMO];
    while (g.bank > 0 && citiesAlive(g) < N_CITY) {
      const dead = [];
      for (let i = 0; i < N_CITY; i++) if (!g.cities[i]) dead.push(i);
      const t = dead[randInt(g, dead.length)];
      g.cities[t] = 1;
      g.bank--;
      ev.push({ type: 'rebuild', t, x: CITY_X[t], y: CITY_Y });
    }
    g.toSpawn = waveCount(w);
    g.spawnT = GRACE;
    g.bombersLeft = bomberCount(w);
    g.bomberT = 240 + randInt(g, 360);
    g.missiles = [];
    g.bombers = [];
    g.shots = [];
    g.booms = [];
  }

  function addScore(g, pts, ev) {
    g.score += pts;
    while (g.score >= g.nextBonus) {
      g.nextBonus += BONUS_CITY_EVERY;
      if (g.bank < MAX_BANK) g.bank++;
      ev.push({ type: 'bonusCity', bank: g.bank });
    }
  }

  /** Bắn một phát về (x, y); base < 0 / bỏ trống = bệ gần nhất còn đạn. */
  function fire(g, shot, ev) {
    if (!shot || typeof shot.x !== 'number' || typeof shot.y !== 'number' || !Number.isFinite(shot.x) || !Number.isFinite(shot.y)) return;
    const tx = clamp(shot.x, AIM_X_MIN, AIM_X_MAX);
    const ty = clamp(shot.y, AIM_Y_MIN, AIM_Y_MAX);
    let b = Number.isInteger(shot.base) && shot.base >= 0 && shot.base < N_BASE ? shot.base : -1;
    if (b >= 0) {
      if (!g.baseAlive[b] || g.ammo[b] <= 0) {
        ev.push({ type: 'empty', base: b });
        return;
      }
    } else {
      b = pickBase(g, tx, ty);
      if (b < 0) {
        ev.push({ type: 'empty', base: -1 });
        return;
      }
    }
    g.ammo[b]--;
    g.fired++;
    g.shots.push({ sx: BASE_X[b], sy: BASE_Y, x: BASE_X[b], y: BASE_Y, tx, ty, base: b });
    ev.push({ type: 'launch', base: b, x: tx, y: ty, ammo: g.ammo[b] });
  }

  /** Một loạt tên lửa từ mép trên; MIRV theo xác suất của đợt. */
  function spawnSalvo(g, ev) {
    const w = g.wave;
    const n = Math.min(g.toSpawn, 1 + randInt(g, Math.min(4, 1 + (w >> 1))));
    for (let i = 0; i < n; i++) {
      const x = 4 + rand(g) * (W - 8);
      const t = pickTarget(g);
      const split = rand(g) < mirvChance(w) ? 100 + randInt(g, 90) : 0;
      const m = spawnMissile(g, { x, y: 0, t, speed: waveSpeed(w), split });
      ev.push({ type: 'spawn', x: m.x, y: m.y, mirv: split > 0 });
    }
    g.toSpawn -= n;
  }

  /** Quả cầu dây chuyền + điểm khi hạ một tên lửa. */
  function killMissile(g, m, chain, ev) {
    const mult = multiplier(g.wave);
    g.kills++;
    addScore(g, MISSILE_PTS * mult, ev);
    g.booms.push({ x: m.x, y: m.y, age: 0, r: CHAIN_R });
    ev.push({ type: 'kill', x: m.x, y: m.y, kind: m.kind, pts: MISSILE_PTS, mult, chain });
  }

  /* ---------------- Một bước mô phỏng ---------------- */
  function step(g, input) {
    const ev = [];
    if (g.phase === 'over') return ev;
    g.tick++;

    if (g.phase === 'bonus') {
      if (--g.timer <= 0) {
        startWave(g, g.wave + 1, ev);
        ev.push({ type: 'wave', wave: g.wave });
      }
      return ev;
    }

    // 1. Bắn
    if (input && Array.isArray(input.shots)) input.shots.forEach((s) => fire(g, s, ev));

    // 2. Đạn chặn bay; tới điểm ngắm thì nổ
    for (let i = g.shots.length - 1; i >= 0; i--) {
      const s = g.shots[i];
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d <= SHOT_SPEED) {
        g.shots.splice(i, 1);
        g.booms.push({ x: s.tx, y: s.ty, age: 0, r: R_MAX });
        ev.push({ type: 'boom', x: s.tx, y: s.ty, base: s.base });
      } else {
        s.x += (dx / d) * SHOT_SPEED;
        s.y += (dy / d) * SHOT_SPEED;
      }
    }

    // 3. Phóng tên lửa / gọi máy bay
    if (g.toSpawn > 0 && --g.spawnT <= 0) {
      if (g.missiles.length >= maxAlive(g.wave)) g.spawnT = 20;
      else {
        spawnSalvo(g, ev);
        const gap = salvoGap(g.wave);
        g.spawnT = Math.max(12, Math.floor(gap * (0.6 + 0.8 * rand(g))));
      }
    }
    if (g.bombersLeft > 0 && g.bombers.length === 0 && --g.bomberT <= 0) {
      const b = spawnBomber(g, { y: 46 + randInt(g, 70), dir: rand(g) < 0.5 ? 1 : -1 });
      g.bombersLeft--;
      g.bomberT = 300 + randInt(g, 300);
      ev.push({ type: 'bomber', x: b.x, y: b.y, dir: b.vx > 0 ? 1 : -1 });
    }

    // 4. Máy bay bay ngang, thả bom
    for (let i = g.bombers.length - 1; i >= 0; i--) {
      const b = g.bombers[i];
      b.x += b.vx;
      if ((b.vx > 0 && b.x > W + 14) || (b.vx < 0 && b.x < -14)) {
        g.bombers.splice(i, 1);
        ev.push({ type: 'bomberGone' });
        continue;
      }
      if (b.drops < BOMBER_MAX_DROPS && --b.dropT <= 0) {
        if (b.x > 16 && b.x < W - 16) {
          spawnMissile(g, { x: b.x, y: b.y + 4, t: pickTarget(g), speed: waveSpeed(g.wave) * 1.1, kind: 1 });
          b.drops++;
          b.dropT = 80 + randInt(g, 60);
          ev.push({ type: 'drop', x: b.x, y: b.y + 4 });
        } else b.dropT = 10;
      }
    }

    // 5. Tên lửa rơi; MIRV tới độ cao tách thì sinh thêm đầu đạn
    const nM = g.missiles.length;
    for (let i = 0; i < nM; i++) {
      const m = g.missiles[i];
      m.x += m.vx;
      m.y += m.vy;
      if (m.split > 0 && m.y >= m.split && m.y < m.ty) {
        m.split = 0;
        const k = 1 + randInt(g, g.wave >= 7 ? 3 : 2);
        const spd = Math.hypot(m.vx, m.vy);
        for (let j = 0; j < k; j++) spawnMissile(g, { x: m.x, y: m.y, t: pickTarget(g), speed: spd, kind: 2 });
        ev.push({ type: 'split', x: m.x, y: m.y, n: k });
      }
    }

    // 6. Quả cầu: hạ tên lửa / máy bay trong bán kính, quả cầu mới (dây chuyền) bắt đầu tính từ tick sau
    const nB = g.booms.length;
    for (let i = 0; i < nB; i++) {
      const bm = g.booms[i];
      const r = radiusAt(bm.age, bm.r);
      if (r <= 0) continue;
      const chain = bm.r !== R_MAX;
      for (let j = g.missiles.length - 1; j >= 0; j--) {
        const m = g.missiles[j];
        const dx = m.x - bm.x;
        const dy = m.y - bm.y;
        if (dx * dx + dy * dy <= r * r) {
          g.missiles.splice(j, 1);
          killMissile(g, m, chain, ev);
        }
      }
      for (let j = g.bombers.length - 1; j >= 0; j--) {
        const b = g.bombers[j];
        if (Math.hypot(b.x - bm.x, b.y - bm.y) <= r + BOMBER_R) {
          g.bombers.splice(j, 1);
          const mult = multiplier(g.wave);
          g.kills++;
          addScore(g, BOMBER_PTS * mult, ev);
          g.booms.push({ x: b.x, y: b.y, age: 0, r: CHAIN_R + 4 });
          ev.push({ type: 'bomberKill', x: b.x, y: b.y, pts: BOMBER_PTS, mult });
        }
      }
    }
    for (let i = 0; i < nB; i++) g.booms[i].age++;
    g.booms = g.booms.filter((bm) => bm.age < LIFE);

    // 7. Tên lửa chạm mục tiêu
    for (let i = g.missiles.length - 1; i >= 0; i--) {
      const m = g.missiles[i];
      if (m.y < m.ty) continue;
      g.missiles.splice(i, 1);
      const t = m.t;
      if (t < N_CITY && g.cities[t]) {
        g.cities[t] = 0;
        g.lost++;
        ev.push({ type: 'cityHit', t, x: m.tx, y: m.ty });
      } else if (t >= N_CITY && g.baseAlive[t - N_CITY]) {
        const j = t - N_CITY;
        g.baseAlive[j] = 0;
        g.ammo[j] = 0;
        ev.push({ type: 'baseHit', base: j, x: m.tx, y: m.ty });
      } else {
        ev.push({ type: 'impact', x: m.tx, y: m.ty });
      }
    }

    // 8. Hết thành phố (không còn thành phố thưởng) → hết ván
    if (citiesAlive(g) === 0 && g.bank === 0) {
      g.phase = 'over';
      ev.push({ type: 'over', score: g.score, wave: g.wave });
      return ev;
    }

    // 9. Hết đợt → thưởng
    if (g.toSpawn === 0 && g.bombersLeft === 0 && !g.missiles.length && !g.bombers.length && !g.shots.length && !g.booms.length) {
      const mult = multiplier(g.wave);
      const ammo = ammoLeft(g);
      const cities = citiesAlive(g);
      const ammoPts = ammo * AMMO_PTS * mult;
      const cityPts = cities * CITY_PTS * mult;
      g.phase = 'bonus';
      g.timer = BONUS_TICKS;
      ev.push({ type: 'waveClear', wave: g.wave, ammo, cities, ammoPts, cityPts, mult, bonus: ammoPts + cityPts });
      addScore(g, ammoPts + cityPts, ev);
    }
    return ev;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      v: VERSION,
      rng: g.rng,
      tick: g.tick,
      wave: g.wave,
      score: g.score,
      phase: g.phase,
      timer: g.timer,
      cities: g.cities.join(''),
      baseAlive: g.baseAlive.join(''),
      ammo: g.ammo.slice(),
      bank: g.bank,
      nextBonus: g.nextBonus,
      toSpawn: g.toSpawn,
      spawnT: g.spawnT,
      bombersLeft: g.bombersLeft,
      bomberT: g.bomberT,
      nextId: g.nextId,
      missiles: g.missiles.map((m) => ({ id: m.id, born: m.born, sx: m.sx, sy: m.sy, x: m.x, y: m.y, vx: m.vx, vy: m.vy, t: m.t, tx: m.tx, ty: m.ty, split: m.split, kind: m.kind })),
      bombers: g.bombers.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, dropT: b.dropT, drops: b.drops })),
      shots: g.shots.map((s) => ({ sx: s.sx, sy: s.sy, x: s.x, y: s.y, tx: s.tx, ty: s.ty, base: s.base })),
      booms: g.booms.map((b) => ({ x: b.x, y: b.y, age: b.age, r: b.r })),
      kills: g.kills,
      fired: g.fired,
      lost: g.lost,
    };
  }

  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const isBits = (s, n) => typeof s === 'string' && s.length === n && /^[01]*$/.test(s);
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const isArr = (a, max, fn) => Array.isArray(a) && a.length <= max && a.every((x) => isObj(x) && fn(x));
  const BIG = 1e9;

  const okMissile = (m) =>
    isInt(m.id, 0, BIG) && isInt(m.born, 0, BIG) &&
    isNum(m.sx, -20, W + 20) && isNum(m.sy, -20, H) && isNum(m.x, -20, W + 20) && isNum(m.y, -20, H) &&
    isNum(m.vx, -5, 5) && isNum(m.vy, 0, 5) && isInt(m.t, 0, N_CITY + N_BASE - 1) &&
    m.tx === targetPos(m.t).x && m.ty === targetPos(m.t).y &&
    isNum(m.split, 0, H) && isInt(m.kind, 0, 2);
  const okBomber = (b) =>
    isInt(b.id, 0, BIG) && isNum(b.x, -20, W + 20) && isNum(b.y, 0, H) && isNum(b.vx, -2, 2) && b.vx !== 0 &&
    isInt(b.dropT, -5, 1000) && isInt(b.drops, 0, BOMBER_MAX_DROPS);
  const okShot = (s) =>
    isInt(s.base, 0, N_BASE - 1) && s.sx === BASE_X[s.base] && s.sy === BASE_Y &&
    isNum(s.x, 0, W) && isNum(s.y, 0, H) && isNum(s.tx, AIM_X_MIN, AIM_X_MAX) && isNum(s.ty, AIM_Y_MIN, AIM_Y_MAX);
  const okBoom = (b) => isNum(b.x, -20, W + 20) && isNum(b.y, -20, H) && isInt(b.age, 0, LIFE - 1) && (b.r === R_MAX || b.r === CHAIN_R || b.r === CHAIN_R + 4);

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!isObj(raw) || raw.v !== VERSION) return null;
    const ok =
      isInt(raw.rng, 0, 4294967295) &&
      isInt(raw.tick, 0, BIG) &&
      isInt(raw.wave, 1, 9999) &&
      isInt(raw.score, 0, BIG) &&
      PHASES.indexOf(raw.phase) >= 0 &&
      isInt(raw.timer, 0, BONUS_TICKS) &&
      isBits(raw.cities, N_CITY) &&
      isBits(raw.baseAlive, N_BASE) &&
      Array.isArray(raw.ammo) && raw.ammo.length === N_BASE && raw.ammo.every((a) => isInt(a, 0, AMMO)) &&
      isInt(raw.bank, 0, MAX_BANK) &&
      isInt(raw.nextBonus, BONUS_CITY_EVERY, BIG + BONUS_CITY_EVERY) && raw.nextBonus % BONUS_CITY_EVERY === 0 &&
      isInt(raw.toSpawn, 0, 100) &&
      isInt(raw.spawnT, -5, 1000) &&
      isInt(raw.bombersLeft, 0, 10) &&
      isInt(raw.bomberT, -5, 1000) &&
      isInt(raw.nextId, 1, BIG) &&
      isArr(raw.missiles, 200, okMissile) &&
      isArr(raw.bombers, 5, okBomber) &&
      isArr(raw.shots, 3 * AMMO, okShot) &&
      isArr(raw.booms, 300, okBoom) &&
      isInt(raw.kills, 0, BIG) &&
      isInt(raw.fired, 0, BIG) &&
      isInt(raw.lost, 0, BIG);
    if (!ok) return null;
    // Không nhất quán: còn chơi mà hết thành phố lẫn thành phố thưởng; điểm đã qua mốc thành phố thưởng kế
    if (raw.phase !== 'over' && raw.cities.indexOf('1') < 0 && raw.bank === 0) return null;
    if (raw.score >= raw.nextBonus) return null;
    return {
      rng: raw.rng,
      tick: raw.tick,
      wave: raw.wave,
      score: raw.score,
      phase: raw.phase,
      timer: raw.timer,
      cities: Array.from(raw.cities, Number),
      baseAlive: Array.from(raw.baseAlive, Number),
      ammo: raw.ammo.slice(),
      bank: raw.bank,
      nextBonus: raw.nextBonus,
      toSpawn: raw.toSpawn,
      spawnT: raw.spawnT,
      bombersLeft: raw.bombersLeft,
      bomberT: raw.bomberT,
      nextId: raw.nextId,
      missiles: raw.missiles.map((m) => ({ id: m.id, born: m.born, sx: m.sx, sy: m.sy, x: m.x, y: m.y, vx: m.vx, vy: m.vy, t: m.t, tx: m.tx, ty: m.ty, split: m.split, kind: m.kind })),
      bombers: raw.bombers.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, dropT: b.dropT, drops: b.drops })),
      shots: raw.shots.map((s) => ({ sx: s.sx, sy: s.sy, x: s.x, y: s.y, tx: s.tx, ty: s.ty, base: s.base })),
      booms: raw.booms.map((b) => ({ x: b.x, y: b.y, age: b.age, r: b.r })),
      kills: raw.kills,
      fired: raw.fired,
      lost: raw.lost,
    };
  }

  const api = {
    VERSION, W, H, STEP_MS,
    GROUND_Y, BASE_X, BASE_Y, CITY_X, CITY_Y, CITY_W, N_CITY, N_BASE,
    AMMO, SHOT_SPEED, AIM_X_MIN, AIM_X_MAX, AIM_Y_MIN, AIM_Y_MAX,
    R_MAX, CHAIN_R, GROW, HOLD, SHRINK, LIFE, BOMBER_R,
    MISSILE_PTS, BOMBER_PTS, AMMO_PTS, CITY_PTS, BONUS_CITY_EVERY, GRACE, BONUS_TICKS,
    seedOf, newGame, startWave, step, isOver, citiesAlive, ammoLeft, pickBase, pickTarget, targetPos, radiusAt,
    waveSpeed, waveCount, multiplier, mirvChance, bomberCount,
    spawnMissile, spawnBomber, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
