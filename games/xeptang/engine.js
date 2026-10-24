/* =====================================================================
 * Xếp Tầng - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Tháp nhìn từ trên xuống là các khối chữ nhật { x, z, w, d }: tâm (x, z), rộng w theo trục x, sâu d theo trục z
 *   - Khối mới trượt qua lại trên tầng trên cùng, lần lượt theo trục x rồi z; thả thì phần chìa ra bị cắt rơi,
 *     phần chồng lên thành tầng mới; lệch trong dung sai thì hít khớp ("hoàn hảo"), trượt hẳn là hết ván
 *   - Thời gian chạy theo bước cố định (STEP_MS); vị trí khối trượt là hàm của thời gian kể từ lúc khối hiện ra,
 *     nên ván tất định theo seed + thời điểm thả
 *   - Hàm thuần: nhận ván cũ, trả ván mới (không sửa ván cũ); toJSON / fromJSON để lưu ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const BASE = 100; // cỡ đế (đơn vị thế giới); khối không bao giờ to hơn
  const SPAN = 125; // khối trượt từ -SPAN tới +SPAN quanh tâm tầng trên; > BASE nên lúc hiện ra luôn nằm ngoài tháp
  const PERFECT_TOL = 3; // lệch không quá chừng này (và không quá 1/4 cỡ khối) thì hít khớp
  const REGROW_FROM = 3; // từ lần hoàn hảo liên tiếp thứ mấy thì khối mọc lại
  const GROW = 6; // mỗi lần mọc thêm bao nhiêu (theo trục vừa trượt)
  const V0 = 100; // tốc độ trượt ban đầu (đơn vị / giây)
  const V_GAIN = 2; // mỗi tầng nhanh thêm
  const V_MAX = 220; // tốc độ trần (đạt ở tầng 60)
  const MIN_DROP_MS = 400; // khối phải trượt ít nhất chừng này mới thả được (giới hạn tốc độ ghi điểm)
  const STEP_MS = 8; // bước mô phỏng cố định (125 bước / giây)
  const HUE_STEP = 7; // mỗi tầng đổi sắc độ màu bấy nhiêu độ

  /* ---------------- PRNG có seed (mulberry32), trạng thái là một số nguyên 32 bit ---------------- */
  function rngNext(state) {
    const s = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  /* ---------------- Luật thuần ---------------- */

  /** Tốc độ trượt (đơn vị / giây) của khối thứ n + 1 (n = số tầng đã xếp): tăng chậm, có trần. */
  const speedFor = (n) => Math.min(V_MAX, V0 + V_GAIN * Math.max(0, n));

  /** Dung sai hoàn hảo cho khối cỡ `size` trên trục trượt: khối hẹp thì dung sai nhỏ lại. */
  const perfectTol = (size) => Math.min(PERFECT_TOL, size * 0.25);

  /** Cỡ mới trên trục trượt sau một lần hoàn hảo, `streak` là độ dài chuỗi tính cả lần này. */
  const regrow = (size, streak) => (streak >= REGROW_FROM ? Math.min(BASE, size + GROW) : size);

  /** Điểm thưởng cho một lần hoàn hảo có chuỗi `streak` (tính cả lần này). */
  const bonusFor = (streak) => (streak >= 2 ? 1 : 0);

  const sizeKey = (axis) => (axis === 'x' ? 'w' : 'd');

  /**
   * Thả khối `mov` lên khối `top`, cắt theo trục `axis` ('x' | 'z').
   * Trả { kind: 'perfect' | 'place' | 'miss', placed, cut, side }:
   *   placed = tầng mới (null nếu hụt), cut = phần rơi (null nếu hoàn hảo), side = phía phần rơi (-1 | 1 | 0).
   */
  function slice(top, mov, axis) {
    const k = sizeKey(axis);
    const off = mov[axis] - top[axis];
    const side = Math.sign(off);
    if (Math.abs(off) <= perfectTol(top[k])) {
      return { kind: 'perfect', placed: Object.assign({}, mov, { [axis]: top[axis] }), cut: null, side: 0 };
    }
    const lo = Math.max(top[axis] - top[k] / 2, mov[axis] - mov[k] / 2);
    const hi = Math.min(top[axis] + top[k] / 2, mov[axis] + mov[k] / 2);
    if (hi - lo <= 1e-9) return { kind: 'miss', placed: null, cut: Object.assign({}, mov), side };
    const placed = Object.assign({}, mov, { [axis]: (lo + hi) / 2, [k]: hi - lo });
    // Phần rơi: từ mép tầng dưới tới mép xa của khối thả, ở phía khối bị lệch
    const a = side > 0 ? hi : mov[axis] - mov[k] / 2;
    const b = side > 0 ? mov[axis] + mov[k] / 2 : lo;
    const cut = Object.assign({}, mov, { [axis]: (a + b) / 2, [k]: b - a });
    return { kind: 'place', placed, cut, side };
  }

  /* ---------------- Ván ---------------- */

  const top = (g) => g.layers[g.layers.length - 1];
  /** Trục trượt của khối hiện tại: tầng chẵn theo x, lẻ theo z. */
  const axisOf = (g) => (g.blocks % 2 === 0 ? 'x' : 'z');

  /** Khối mới hiện ra ở một phía (ngẫu nhiên theo seed) với tốc độ theo số tầng. */
  function spawn(g) {
    const r = rngNext(g.rng);
    g.rng = r.state;
    g.cur = { side: r.value < 0.5 ? -1 : 1, v: speedFor(g.blocks), spawnT: g.t };
    return g;
  }

  function newGame(seed) {
    let s = Number(seed);
    if (!Number.isFinite(s)) s = Math.floor(Math.random() * 4294967296);
    const r = rngNext(s | 0);
    const g = {
      seed: s,
      rng: r.state,
      hue0: Math.floor(r.value * 360),
      t: 0,
      layers: [{ x: 0, z: 0, w: BASE, d: BASE }],
      blocks: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      perfects: 0,
      over: false,
      cur: null,
    };
    return spawn(g);
  }

  /** Độ lệch hiện tại của khối trượt so với tâm tầng trên, theo trục trượt (sóng tam giác giữa ±SPAN). */
  function offsetAt(g) {
    const c = g.cur;
    const s = (c.v * (g.t - c.spawnT)) / 1000; // quãng đã đi
    const u = s % (4 * SPAN);
    return u <= 2 * SPAN ? c.side * (SPAN - u) : c.side * (u - 3 * SPAN);
  }

  /** Khối đang trượt: cùng cỡ tầng trên, lệch theo trục trượt. */
  function moving(g) {
    const axis = axisOf(g);
    const tp = top(g);
    return Object.assign({}, tp, { [axis]: tp[axis] + offsetAt(g) });
  }

  const canDrop = (g) => !g.over && g.t - g.cur.spawnT >= MIN_DROP_MS;

  /** Cho thời gian trôi `ms` (mặc định một bước STEP_MS). Ván đã hết thì giữ nguyên. */
  function step(g, ms) {
    if (g.over) return g;
    return Object.assign({}, g, { t: g.t + (ms === undefined ? STEP_MS : ms) });
  }

  /**
   * Thả khối đang trượt. Trả { game, event }; event.kind:
   *   'perfect' | 'place' (tầng mới), 'miss' (hết ván), 'early' (chưa đủ MIN_DROP_MS, bỏ qua), 'over' (ván đã hết).
   */
  function drop(g) {
    if (g.over) return { game: g, event: { kind: 'over' } };
    if (!canDrop(g)) return { game: g, event: { kind: 'early' } };
    const axis = axisOf(g);
    const mov = moving(g);
    const r = slice(top(g), mov, axis);
    const n = Object.assign({}, g);
    const event = { kind: r.kind, axis, side: r.side, cut: r.cut, placed: null, streak: 0, bonus: 0, grew: false, layer: g.layers.length };
    if (r.kind === 'miss') {
      n.over = true;
      n.streak = 0;
      return { game: n, event };
    }
    let placed = r.placed;
    if (r.kind === 'perfect') {
      n.streak = g.streak + 1;
      n.perfects = g.perfects + 1;
      n.bestStreak = Math.max(g.bestStreak, n.streak);
      const k = sizeKey(axis);
      const size = regrow(placed[k], n.streak);
      if (size > placed[k]) {
        placed = Object.assign({}, placed, { [k]: size });
        event.grew = true;
      }
      event.bonus = bonusFor(n.streak);
    } else {
      n.streak = 0;
    }
    event.streak = n.streak;
    event.placed = placed;
    n.layers = g.layers.concat([placed]);
    n.blocks = g.blocks + 1;
    n.score = g.score + 1 + event.bonus;
    return { game: spawn(n), event };
  }

  /**
   * Chạy cả ván từ seed với các thời điểm thả (ms tính từ đầu ván, tăng dần), theo bước cố định:
   * thả ở bước đầu tiên có t >= thời điểm đó. Trả { game, events } (mỗi thời điểm một event). Dùng cho test và bot.
   */
  function play(seed, dropTimes) {
    let g = newGame(seed);
    const events = [];
    dropTimes.forEach((at) => {
      while (!g.over && g.t < at) g = step(g);
      const r = drop(g);
      g = r.game;
      events.push(r.event);
    });
    return { game: g, events };
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    seed: g.seed,
    rng: g.rng,
    hue0: g.hue0,
    t: g.t,
    layers: g.layers.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
    blocks: g.blocks,
    score: g.score,
    streak: g.streak,
    bestStreak: g.bestStreak,
    perfects: g.perfects,
    over: g.over,
    cur: { side: g.cur.side, v: g.cur.v, spawnT: g.cur.spawnT },
  });

  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const okBlock = (b) =>
    b && typeof b === 'object' && num(b.x) && num(b.z) && num(b.w) && num(b.d) &&
    b.w > 0 && b.d > 0 && b.w <= BASE && b.d <= BASE && Math.abs(b.x) <= BASE && Math.abs(b.z) <= BASE;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { layers, cur } = raw;
    if (!Array.isArray(layers) || layers.length < 1 || !layers.every(okBlock)) return null;
    if (!int(raw.blocks, 0, 1e7) || layers.length !== raw.blocks + 1) return null;
    if (!int(raw.score, raw.blocks, 2 * raw.blocks)) return null;
    if (!int(raw.streak, 0, raw.blocks) || !int(raw.bestStreak, raw.streak, raw.blocks) || !int(raw.perfects, raw.bestStreak, raw.blocks)) return null;
    if (!num(raw.t) || raw.t < 0 || !num(raw.seed) || !int(raw.rng, -2147483648, 2147483647) || !int(raw.hue0, 0, 359)) return null;
    if (typeof raw.over !== 'boolean') return null;
    if (!cur || typeof cur !== 'object' || (cur.side !== 1 && cur.side !== -1)) return null;
    if (!num(cur.v) || cur.v < V0 || cur.v > V_MAX || !num(cur.spawnT) || cur.spawnT < 0 || cur.spawnT > raw.t) return null;
    return {
      seed: raw.seed,
      rng: raw.rng,
      hue0: raw.hue0,
      t: raw.t,
      layers: layers.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
      blocks: raw.blocks,
      score: raw.score,
      streak: raw.streak,
      bestStreak: raw.bestStreak,
      perfects: raw.perfects,
      over: raw.over,
      cur: { side: cur.side, v: cur.v, spawnT: cur.spawnT },
    };
  }

  const api = {
    VERSION, BASE, SPAN, PERFECT_TOL, REGROW_FROM, GROW, V0, V_GAIN, V_MAX, MIN_DROP_MS, STEP_MS, HUE_STEP,
    speedFor, perfectTol, regrow, bonusFor, slice,
    newGame, top, axisOf, offsetAt, moving, canDrop, step, drop, play, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
