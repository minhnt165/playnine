/* =====================================================================
 * Đập Chuột - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Ván 60 giây trên lưới 3×3 hố. Lịch trồi (lúc nào, hố nào, loại gì, hiện bao lâu) sinh sẵn
 *     từ hạt giống: cùng hạt giống + cùng chuỗi cú đập (thời điểm, hố) thì cùng kết quả.
 *   - Loại: chuột thường (+1), chuột vàng (+5, hiện ngắn), chuột đội mũ (2 cú, +2), bom (đừng đập: −5 và choáng).
 *   - Combo: trúng liên tiếp không trượt thì nhân điểm ×1 → ×2 (từ cú thứ 6) → ×3 (từ cú thứ 11).
 *     Đập vào hố trống hoặc đập bom thì combo về 0; chuột tự trốn không làm mất combo.
 *   - Số lượt và số mỗi loại như nhau ở mọi hạt giống (chỉ đổi thứ tự, hố và lệch giờ nhỏ),
 *     nên trần điểm MAX_SCORE cố định và ván nào cũng công bằng như nhau.
 *   - Hàm thuần: advance / whack nhận ván cũ, trả ván mới (ván cũ không đổi).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu hoặc luật sinh lịch (ván lưu cũ sẽ bị bỏ)

  const ROUND_MS = 60000; // một ván
  const HOLES = 9;
  const STUN_MS = 1200; // choáng sau khi đập bom
  const BOMB_PENALTY = 5;
  const HELMET_GRACE_MS = 500; // hất mũ sát giờ lặn thì chuột ở lại tối đa thêm chừng này
  const HOLE_GAP_MS = 250; // nghỉ giữa hai lần trồi ở cùng một hố (đủ cho hình lặn xuống)
  const FIRST_AT = 900; // lượt đầu tiên
  const COMBO_STEP = 5; // mỗi 5 cú trúng liên tiếp tăng hệ số một bậc
  const MAX_MULT = 3;
  const GROUP = 8; // lịch chia nhóm 8 lượt, mỗi nhóm có thành phần cố định

  const BASE = { mole: 1, gold: 5, helmet: 2, bomb: 0 };
  // Thời gian hiện của từng loại so với chuột thường cùng lúc
  const DUR_FACTOR = { mole: 1, gold: 0.6, helmet: 1.3, bomb: 1.1 };
  // Kết quả của một lượt trồi
  const RES = { PENDING: 0, HIT: 1, ESCAPED: 2, BOMBED: 3, BOMB_GONE: 4 };

  // Nhịp độ tăng dần theo thời gian trong ván: khoảng cách giữa hai lượt và thời gian hiện
  const interval = (t) => 950 - 550 * (t / ROUND_MS); // 950 → 400 ms
  const baseDur = (t) => 1500 - 800 * (t / ROUND_MS); // 1500 → 700 ms
  const JITTER = 0.15; // lệch giờ ngẫu nhiên tối đa ±15% khoảng cách (không đổi thứ tự lượt)

  // Thành phần từng nhóm 8 lượt (M thường, G vàng, H đội mũ, B bom); nhóm cuối thiếu thì lấy phần đầu.
  // Loại đặc biệt xuất hiện dần: nhóm 1 có vàng, nhóm 2 có mũ, nhóm 3 có bom, về sau dày hơn.
  const MIXES = [
    'MMMMMMMM',
    'MMMMMMMG',
    'MMMMMHMG',
    'MMBMHMGM',
    'MMBMHMGM',
    'MBMHMGMB',
    'MBMHMGMB',
    'MBHMGBHM',
  ];
  const KIND_OF = { M: 'mole', G: 'gold', H: 'helmet', B: 'bomb' };
  const mixFor = (k) => MIXES[Math.min(k, MIXES.length - 1)];

  /* ---------------- PRNG ---------------- */

  /** mulberry32: hạt giống số nguyên 32 bit → hàm r() trong [0, 1). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const isSeed = (s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff;

  /* ---------------- Lịch trồi ---------------- */

  /** Mốc gốc của các lượt (không phụ thuộc hạt giống): lượt cuối, kể cả lệch giờ và mũ kéo dài, vẫn xong trước khi hết ván. */
  const BASE_TIMES = (function () {
    const out = [];
    let t = FIRST_AT;
    while (t + JITTER * interval(t) + baseDur(t) * DUR_FACTOR.helmet + HELMET_GRACE_MS + 1 <= ROUND_MS) {
      out.push(t);
      t += interval(t);
    }
    return out;
  })();

  /**
   * Lịch trồi của một ván: mảng { at, end, hole, kind } tăng dần theo `at`.
   * Hố được chọn trong các hố đang rảnh (không chồng lên lượt trước, kể cả phần mũ kéo dài).
   */
  function schedule(seed) {
    const r = rng(seed);
    const n = BASE_TIMES.length;
    // Loại: mỗi nhóm lấy thành phần cố định rồi xáo thứ tự trong nhóm
    const kinds = [];
    for (let k = 0; k * GROUP < n; k++) {
      const part = mixFor(k).slice(0, Math.min(GROUP, n - k * GROUP)).split('').map((c) => KIND_OF[c]);
      for (let i = part.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const x = part[i];
        part[i] = part[j];
        part[j] = x;
      }
      kinds.push.apply(kinds, part);
    }
    const free = new Array(HOLES).fill(0); // hố rảnh từ thời điểm này
    let last = -1;
    return BASE_TIMES.map((b, i) => {
      const kind = kinds[i];
      const at = Math.round(b + (r() * 2 - 1) * JITTER * interval(b));
      const end = at + Math.round(baseDur(b) * DUR_FACTOR[kind]);
      let opts = [];
      for (let h = 0; h < HOLES; h++) if (free[h] <= at && h !== last) opts.push(h);
      // Không thể xảy ra với nhịp hiện tại (tối đa ~4 hố bận cùng lúc); phòng hờ thì lấy hố rảnh sớm nhất
      if (!opts.length) opts = [free.indexOf(Math.min.apply(null, free))];
      const hole = opts[Math.floor(r() * opts.length)];
      free[hole] = end + (kind === 'helmet' ? HELMET_GRACE_MS : 0) + HOLE_GAP_MS;
      last = hole;
      return { at, end, hole, kind };
    });
  }

  /** Trần điểm: mọi mục tiêu (trừ bom) đều trúng ở hệ số ×3. Như nhau ở mọi hạt giống. */
  const MAX_SCORE = schedule(1).reduce((n, s) => n + BASE[s.kind] * MAX_MULT, 0);

  /* ---------------- Ván ---------------- */

  const multiplier = (streak) => Math.min(MAX_MULT, 1 + Math.floor(streak / COMBO_STEP));

  function newGame(seed) {
    const spawns = schedule(seed);
    return {
      seed,
      spawns, // lịch trồi (không lưu, dựng lại từ seed)
      t: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      whacked: 0, // số mục tiêu đã hạ
      whiffs: 0, // số cú đập vào hố trống
      bombs: 0, // số lần đập bom
      escaped: 0, // số mục tiêu tự trốn
      stunUntil: 0,
      res: spawns.map(() => RES.PENDING),
      hp: spawns.map(() => 0), // số cú đã nhận (chuột đội mũ)
      end: spawns.map((s) => s.end), // giờ lặn (mũ có thể kéo dài)
    };
  }

  const isOver = (g) => g.t >= ROUND_MS;
  const timeLeft = (g) => Math.max(0, ROUND_MS - g.t);
  const isStunned = (g) => g.t < g.stunUntil;

  /** Chỉ số lượt đang trồi ở hố `hole` tại thời điểm hiện tại, -1 nếu hố trống. */
  function visibleAt(g, hole) {
    for (let i = 0; i < g.spawns.length; i++) {
      const s = g.spawns[i];
      if (s.at > g.t) break;
      if (s.hole === hole && g.res[i] === RES.PENDING && g.t < g.end[i]) return i;
    }
    return -1;
  }

  const copy = (g) => Object.assign({}, g, { res: g.res.slice(), hp: g.hp.slice(), end: g.end.slice() });

  /**
   * Tiến `ms` mili giây. Trả { game, events } với events theo thứ tự thời gian:
   *   { type: 'up', i } lượt i trồi lên, { type: 'escape', i } mục tiêu i trốn mất (bom tự lặn không báo),
   *   { type: 'over' } hết giờ.
   */
  function advance(g, ms) {
    if (isOver(g) || !(ms > 0)) return { game: g, events: [] };
    const n = copy(g);
    const t0 = g.t;
    n.t = Math.min(ROUND_MS, t0 + Math.round(ms));
    const evs = [];
    for (let i = 0; i < n.spawns.length; i++) {
      const s = n.spawns[i];
      if (s.at > n.t) break;
      if (s.at > t0) evs.push({ at: s.at, type: 'up', i });
      if (n.res[i] === RES.PENDING && n.end[i] <= n.t) {
        if (s.kind === 'bomb') n.res[i] = RES.BOMB_GONE;
        else {
          n.res[i] = RES.ESCAPED;
          n.escaped++;
          evs.push({ at: n.end[i], type: 'escape', i });
        }
      }
    }
    evs.sort((a, b) => a.at - b.at);
    const events = evs.map((e) => ({ type: e.type, i: e.i }));
    if (isOver(n)) events.push({ type: 'over' });
    return { game: n, events };
  }

  /**
   * Đập hố `hole` (0..8, hàng trên trái sang phải) tại thời điểm hiện tại. Trả { game, result }:
   *   hit { kind, points, mult } · helmet (hất mũ, chưa có điểm) · bomb { penalty } · miss (hố trống)
   *   · stunned (đang choáng, không có tác dụng) · over (hết giờ).
   */
  function whack(g, hole) {
    if (!Number.isInteger(hole) || hole < 0 || hole >= HOLES) return { game: g, result: { type: 'none' } };
    if (isOver(g)) return { game: g, result: { type: 'over', hole } };
    if (isStunned(g)) return { game: g, result: { type: 'stunned', hole } };
    const i = visibleAt(g, hole);
    const n = copy(g);
    if (i < 0) {
      n.streak = 0;
      n.whiffs++;
      return { game: n, result: { type: 'miss', hole } };
    }
    const s = n.spawns[i];
    if (s.kind === 'bomb') {
      n.res[i] = RES.BOMBED;
      n.score = Math.max(0, n.score - BOMB_PENALTY);
      n.streak = 0;
      n.bombs++;
      n.stunUntil = n.t + STUN_MS;
      return { game: n, result: { type: 'bomb', hole, i, kind: s.kind, penalty: BOMB_PENALTY } };
    }
    if (s.kind === 'helmet' && n.hp[i] === 0) {
      n.hp[i] = 1;
      n.end[i] = Math.min(s.end + HELMET_GRACE_MS, Math.max(n.end[i], n.t + HELMET_GRACE_MS));
      n.streak++;
      n.bestStreak = Math.max(n.bestStreak, n.streak);
      return { game: n, result: { type: 'helmet', hole, i, kind: s.kind, points: 0, mult: multiplier(g.streak) } };
    }
    const mult = multiplier(n.streak);
    const points = BASE[s.kind] * mult;
    n.res[i] = RES.HIT;
    n.hp[i]++;
    n.score += points;
    n.streak++;
    n.bestStreak = Math.max(n.bestStreak, n.streak);
    n.whacked++;
    return { game: n, result: { type: 'hit', hole, i, kind: s.kind, points, mult } };
  }

  /** Điểm khi chơi hoàn hảo (đập mọi mục tiêu ngay khi trồi, không trượt, không đụng bom). */
  function perfectScore(seed) {
    let streak = 0;
    let score = 0;
    schedule(seed).forEach((s) => {
      if (s.kind === 'bomb') return;
      if (s.kind === 'helmet') streak++;
      score += BASE[s.kind] * multiplier(streak);
      streak++;
    });
    return score;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    seed: g.seed,
    t: g.t,
    score: g.score,
    streak: g.streak,
    bestStreak: g.bestStreak,
    whacked: g.whacked,
    whiffs: g.whiffs,
    bombs: g.bombs,
    escaped: g.escaped,
    stunUntil: g.stunUntil,
    res: g.res.slice(),
    hp: g.hp.slice(),
    end: g.end.slice(),
  });

  const isCount = (x, max) => Number.isInteger(x) && x >= 0 && x <= max;

  /** Ván lưu hỏng, khác phiên bản hoặc mâu thuẫn với lịch trồi thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !isSeed(raw.seed)) return null;
    const g = newGame(raw.seed);
    const n = g.spawns.length;
    if (!isCount(raw.t, ROUND_MS) || !isCount(raw.score, MAX_SCORE)) return null;
    if (!isCount(raw.streak, n * 2) || !isCount(raw.bestStreak, n * 2) || raw.bestStreak < raw.streak) return null;
    if (!isCount(raw.whacked, n) || !isCount(raw.whiffs, 1e6) || !isCount(raw.bombs, n) || !isCount(raw.escaped, n)) return null;
    if (!isCount(raw.stunUntil, ROUND_MS + STUN_MS)) return null;
    if (!Array.isArray(raw.res) || !Array.isArray(raw.hp) || !Array.isArray(raw.end)) return null;
    if (raw.res.length !== n || raw.hp.length !== n || raw.end.length !== n) return null;
    for (let i = 0; i < n; i++) {
      const s = g.spawns[i];
      const res = raw.res[i];
      const hp = raw.hp[i];
      const end = raw.end[i];
      if (!isCount(res, RES.BOMB_GONE) || !isCount(hp, 2) || !Number.isInteger(end)) return null;
      if (end < s.end || end > s.end + (s.kind === 'helmet' ? HELMET_GRACE_MS : 0)) return null;
      if (hp > (s.kind === 'helmet' ? 2 : 1)) return null;
      // Lượt đã hết giờ mà vẫn chờ, hoặc chưa trồi mà đã có kết quả: mâu thuẫn
      if (res === RES.PENDING && end <= raw.t) return null;
      if (res !== RES.PENDING && s.at > raw.t) return null;
      if ((res === RES.BOMBED || res === RES.BOMB_GONE) !== (s.kind === 'bomb' && res !== RES.PENDING)) return null;
    }
    ['t', 'score', 'streak', 'bestStreak', 'whacked', 'whiffs', 'bombs', 'escaped', 'stunUntil'].forEach((k) => { g[k] = raw[k]; });
    g.res = raw.res.slice();
    g.hp = raw.hp.slice();
    g.end = raw.end.slice();
    return g;
  }

  const api = {
    VERSION,
    ROUND_MS,
    HOLES,
    STUN_MS,
    BOMB_PENALTY,
    HELMET_GRACE_MS,
    BASE,
    RES,
    MAX_MULT,
    COMBO_STEP,
    MAX_SCORE,
    rng,
    schedule,
    multiplier,
    newGame,
    isOver,
    timeLeft,
    isStunned,
    visibleAt,
    advance,
    whack,
    perfectScore,
    toJSON,
    fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
