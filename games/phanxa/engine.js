/* =====================================================================
 * Phản Xạ - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Hai chế độ:
 *   - 'classic' (ngắm bắn 60 giây): mục tiêu tròn hiện ở vị trí ngẫu nhiên theo hạt giống, co dần rồi biến mất.
 *     Chạm trúng (khoảng cách tới tâm ≤ bán kính lúc chạm) được điểm chính xác + điểm tốc độ, nhân hệ số chuỗi.
 *     Chạm ra ngoài hoặc để mục tiêu biến mất thì mất chuỗi. Nhịp tăng dần: nhỏ hơn, sống ngắn hơn, đôi khi hai cái.
 *   - 'reaction' (đo phản ứng 5 lần): đỏ → chờ ngẫu nhiên 1,5–4 s → xanh, chạm càng nhanh càng tốt.
 *     Chạm khi còn đỏ hoặc < 100 ms sau khi xanh (đoán trước) là phạm lỗi: làm lại lần đó và cộng 50 ms phạt.
 *   - Sân tính bằng đơn vị: cạnh ngắn = 100, cạnh dài 100–160 (chốt theo khung lúc bắt đầu ván, ghi trong ván).
 *   - Mô phỏng theo sự kiện, đúng tới từng ms: cùng hạt giống + cùng chuỗi (thời điểm, tọa độ) chạm → cùng kết quả,
 *     dù app tiến đồng hồ theo bước nào. Hàm thuần: advance / tap / press / interrupt nhận ván cũ, trả ván mới.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu hoặc luật sinh (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Ngắm bắn ---------------- */
  const ROUND_MS = 60000; // một ván ngắm bắn
  const SHORT = 100; // cạnh ngắn của sân (đơn vị)
  const MAX_LONG = 160; // cạnh dài tối đa
  const FIRST_AT = 700; // mục tiêu đầu tiên (cho người chơi đặt tay)
  const MAX_LIVE = 3; // tối đa bấy nhiêu mục tiêu cùng lúc
  const MARGIN = 2; // chừa mép sân
  const SPACING = 3; // khe tối thiểu giữa hai mục tiêu cùng lúc
  const COMBO_STEP = 5; // mỗi 5 lần trúng liên tiếp tăng hệ số một bậc
  const MAX_MULT = 5;
  const PTS_BASE = 10; // điểm một lần trúng (trước hệ số): 10 + tối đa 45 chính xác + tối đa 45 tốc độ
  const PTS_ACC = 45;
  const PTS_SPEED = 45;
  const MAX_HIT = PTS_BASE + PTS_ACC + PTS_SPEED;

  // Nhịp độ theo thời gian trong ván (0 → 60 s)
  const level = (t) => Math.max(0, Math.min(1, t / ROUND_MS));
  const radiusFor = (t) => Math.round((9.5 - 4 * level(t)) * 100) / 100; // bán kính lúc hiện: 9,5 → 5,5
  const lifeFor = (t) => Math.round(1500 - 700 * level(t)); // sống 1500 → 800 ms
  const intervalFor = (t) => Math.round(1000 - 450 * level(t)); // đợt sau chậm nhất sau 1000 → 550 ms
  const gapFor = (t) => Math.round(260 - 100 * level(t)); // dọn sạch sân thì đợt sau tới sớm: 260 → 160 ms
  /** Xác suất một đợt có hai mục tiêu: không có trong 15 giây đầu, rồi tăng dần tới 50%. */
  function pairChance(t) {
    const d = level(t);
    return d < 0.25 ? 0 : Math.round((0.12 + (0.38 * (d - 0.25)) / 0.75) * 1e6) / 1e6;
  }

  /* ---------------- Đo phản ứng ---------------- */
  const REACTION = {
    TRIALS: 5, // số lần đo
    WAIT_MIN: 1500, // chờ đỏ ngẫu nhiên trong [WAIT_MIN, WAIT_MAX] ms
    WAIT_MAX: 4000,
    TOO_FAST: 100, // dưới mức này là đoán trước
    TIMEOUT: 1500, // xanh quá lâu không chạm: ghi "quá chậm" bằng chừng này ms
    RESULT_MS: 1000, // hiện kết quả một lần đo rồi tự sang lần sau
    FOUL_MS: 1200, // hiện "quá sớm" rồi làm lại
    PENALTY: 50, // mỗi lần phạm lỗi cộng chừng này ms vào trung bình
    BASE: 1000, // điểm gửi cổng = BASE − trung bình (ms), không âm
  };

  /* ---------------- PRNG (mulberry32, trạng thái lưu trong ván) ---------------- */
  function rand(g) {
    const a = (g.rng + 0x6d2b79f5) | 0;
    g.rng = a >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const isSeed = (s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff;
  const isCount = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
  const isNum = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

  /** Cỡ sân (đơn vị) theo khung px: cạnh ngắn 100, cạnh dài theo tỉ lệ khung, kẹp 100–160. */
  function shape(px, py) {
    const pw = px > 0 ? px : 1;
    const ph = py > 0 ? py : 1;
    const long = Math.round(Math.min(MAX_LONG / SHORT, Math.max(1, Math.max(pw, ph) / Math.min(pw, ph))) * SHORT);
    return pw >= ph ? { w: long, h: SHORT } : { w: SHORT, h: long };
  }
  const validShape = (w, h) => Number.isInteger(w) && Number.isInteger(h) && Math.min(w, h) === SHORT && Math.max(w, h) <= MAX_LONG;

  /* ---------------- Tạo ván ---------------- */

  /** Ván mới. opts.mode: 'classic' (mặc định) | 'reaction'; opts.w / opts.h: cỡ sân ngắm bắn (xem shape). */
  function newGame(seed, opts) {
    const o = opts || {};
    const s = isSeed(seed) ? seed : 1;
    if (o.mode === 'reaction') {
      const g = { mode: 'reaction', seed: s, rng: s, t: 0, phase: 'red', greenAt: 0, phaseEnd: 0, trials: [], fouls: 0, last: null, over: false };
      startRed(g);
      return g;
    }
    const sh = validShape(o.w, o.h) ? { w: o.w, h: o.h } : { w: SHORT, h: SHORT };
    return {
      mode: 'classic', seed: s, rng: s, w: sh.w, h: sh.h, t: 0, nextAt: FIRST_AT, nextId: 0, targets: [],
      score: 0, streak: 0, bestStreak: 0, hits: 0, misses: 0, expired: 0, reactSum: 0, over: false,
    };
  }

  function clone(g) {
    const n = Object.assign({}, g);
    if (g.targets) n.targets = g.targets.map((o) => Object.assign({}, o));
    if (g.trials) n.trials = g.trials.slice();
    if (g.last) n.last = Object.assign({}, g.last);
    return n;
  }

  /* ---------------- Ngắm bắn: vòng đời mục tiêu ---------------- */

  /** Bán kính mục tiêu o lúc t: co đều từ o.r xuống 0 trong o.life ms. */
  function radiusAt(o, t) {
    const age = t - o.at;
    if (age < 0 || age >= o.life) return 0;
    return o.r * (1 - age / o.life);
  }

  const multiplier = (streak) => Math.min(MAX_MULT, 1 + Math.floor(streak / COMBO_STEP));

  /** Chọn chỗ cho mục tiêu mới: trong sân, không chồng lên mục tiêu đang có (thử tối đa 12 lần). */
  function place(g, r) {
    let x = 0;
    let y = 0;
    for (let k = 0; k < 12; k++) {
      x = Math.round((r + MARGIN + rand(g) * (g.w - 2 * (r + MARGIN))) * 100) / 100;
      y = Math.round((r + MARGIN + rand(g) * (g.h - 2 * (r + MARGIN))) * 100) / 100;
      if (g.targets.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r + SPACING)) break;
    }
    return { x, y };
  }

  function spawnWave(g, events) {
    const t = g.t;
    let size = rand(g) < pairChance(t) ? 2 : 1;
    size = Math.min(size, MAX_LIVE - g.targets.length);
    if (size <= 0) {
      // Sân đầy: chờ mục tiêu sớm nhất biến mất rồi mới ra đợt mới
      g.nextAt = Math.min.apply(null, g.targets.map((o) => o.at + o.life));
      return;
    }
    const r = radiusFor(t);
    const life = lifeFor(t);
    for (let i = 0; i < size; i++) {
      const p = place(g, r);
      const o = { id: g.nextId++, x: p.x, y: p.y, r, at: t, life };
      g.targets.push(o);
      events.push({ type: 'spawn', id: o.id, x: o.x, y: o.y, r });
    }
    g.nextAt = t + intervalFor(t);
  }

  function advanceClassic(g, toT, events) {
    const end = Math.min(toT, ROUND_MS);
    for (;;) {
      let exp = Infinity;
      let ei = -1;
      g.targets.forEach((o, i) => {
        if (o.at + o.life < exp) {
          exp = o.at + o.life;
          ei = i;
        }
      });
      const next = Math.min(exp, g.nextAt);
      if (next > end || next >= ROUND_MS) break;
      g.t = next;
      if (exp <= g.nextAt) {
        const o = g.targets.splice(ei, 1)[0];
        g.expired++;
        events.push({ type: 'expire', id: o.id, x: o.x, y: o.y, r: o.r, lost: g.streak > 0 });
        g.streak = 0;
      } else spawnWave(g, events);
    }
    g.t = Math.max(g.t, end);
    if (g.t >= ROUND_MS && !g.over) {
      g.over = true;
      g.targets = [];
      events.push({ type: 'over' });
    }
  }

  /* ---------------- Đo phản ứng: các pha ---------------- */

  function startRed(g) {
    g.phase = 'red';
    g.greenAt = g.t + REACTION.WAIT_MIN + Math.floor(rand(g) * (REACTION.WAIT_MAX - REACTION.WAIT_MIN + 1));
    g.phaseEnd = 0;
  }

  function record(g, ms, kind, events) {
    g.trials.push(ms);
    g.last = { kind, ms };
    events.push({ type: 'trial', kind, ms });
    if (g.trials.length >= REACTION.TRIALS) {
      g.over = true;
      g.phase = 'done';
      events.push({ type: 'over' });
    } else {
      g.phase = 'result';
      g.phaseEnd = g.t + REACTION.RESULT_MS;
    }
  }

  function advanceReaction(g, toT, events) {
    while (!g.over) {
      if (g.phase === 'red' && g.greenAt <= toT) {
        g.t = g.greenAt;
        g.phase = 'green';
        events.push({ type: 'green' });
      } else if (g.phase === 'green' && g.greenAt + REACTION.TIMEOUT <= toT) {
        g.t = g.greenAt + REACTION.TIMEOUT;
        record(g, REACTION.TIMEOUT, 'slow', events);
      } else if ((g.phase === 'result' || g.phase === 'foul') && g.phaseEnd <= toT) {
        g.t = g.phaseEnd;
        startRed(g);
        events.push({ type: 'red' });
      } else break;
    }
    if (!g.over) g.t = Math.max(g.t, toT);
  }

  /* ---------------- API chung ---------------- */

  /** Tiến đồng hồ tới thời điểm toT (ms tính từ đầu ván, làm tròn ms). Trả { game, events }. */
  function advance(g, toT) {
    const events = [];
    const to = Math.round(toT);
    if (g.over || !(to > g.t)) return { game: g, events };
    const n = clone(g);
    if (n.mode === 'reaction') advanceReaction(n, to, events);
    else advanceClassic(n, to, events);
    return { game: n, events };
  }

  /**
   * Ngắm bắn: chạm ở (x, y) (đơn vị sân) lúc tapT. Trả { game, result, events }.
   * result.type: 'hit' (kèm điểm), 'miss', 'over' (đã hết giờ), 'none' (không phải ván ngắm bắn).
   */
  function tap(g, tapT, x, y) {
    if (g.mode !== 'classic' || g.over) return { game: g, result: { type: g.over ? 'over' : 'none' }, events: [] };
    const r0 = advance(g, Math.max(g.t, tapT));
    const n = r0.game === g ? clone(g) : r0.game;
    const events = r0.events;
    if (n.over) return { game: n, result: { type: 'over' }, events };
    let best = -1;
    let bestK = Infinity;
    let bestD = 0;
    n.targets.forEach((o, i) => {
      const rr = radiusAt(o, n.t);
      const d = Math.hypot(x - o.x, y - o.y);
      if (rr > 0 && d <= rr && d / rr < bestK) {
        best = i;
        bestK = d / rr;
        bestD = d;
      }
    });
    if (best < 0) {
      const lost = n.streak > 0;
      n.misses++;
      n.streak = 0;
      return { game: n, result: { type: 'miss', x, y, lost }, events };
    }
    const o = n.targets.splice(best, 1)[0];
    const age = n.t - o.at;
    const acc = 1 - bestD / o.r;
    const speed = 1 - age / o.life;
    const mult = multiplier(n.streak);
    const points = (PTS_BASE + Math.round(PTS_ACC * acc) + Math.round(PTS_SPEED * speed)) * mult;
    n.score += points;
    n.streak++;
    n.bestStreak = Math.max(n.bestStreak, n.streak);
    n.hits++;
    n.reactSum += age;
    // Dọn sạch sân thì đợt sau tới sớm hơn (thưởng người nhanh tay)
    if (!n.targets.length) n.nextAt = Math.min(n.nextAt, n.t + gapFor(n.t));
    return { game: n, result: { type: 'hit', id: o.id, x: o.x, y: o.y, r: o.r, points, mult, acc, age }, events };
  }

  /**
   * Đo phản ứng: chạm lúc tapT. Trả { game, result, events }.
   * result.type: 'ok' (kèm ms), 'early' (còn đỏ), 'guess' (< 100 ms), 'none' (đang hiện kết quả / không phải ván đo).
   */
  function press(g, tapT) {
    if (g.mode !== 'reaction' || g.over) return { game: g, result: { type: 'none' }, events: [] };
    const r0 = advance(g, Math.max(g.t, tapT));
    const n = r0.game === g ? clone(g) : r0.game;
    const events = r0.events;
    if (n.over) return { game: n, result: { type: 'none' }, events };
    if (n.phase === 'red' || (n.phase === 'green' && n.t - n.greenAt < REACTION.TOO_FAST)) {
      const kind = n.phase === 'red' ? 'early' : 'guess';
      const ms = n.phase === 'red' ? null : n.t - n.greenAt;
      n.fouls++;
      n.last = { kind, ms };
      n.phase = 'foul';
      n.phaseEnd = n.t + REACTION.FOUL_MS;
      events.push({ type: 'foul', kind, ms });
      return { game: n, result: { type: kind, ms }, events };
    }
    if (n.phase === 'green') {
      const ms = n.t - n.greenAt;
      record(n, ms, 'ok', events);
      return { game: n, result: { type: 'ok', ms }, events };
    }
    return { game: n, result: { type: 'none' }, events };
  }

  /** Đo phản ứng bị ngắt (tạm dừng, ẩn trang): lần đang đo bắt đầu lại từ đỏ, không tính lỗi. */
  function interrupt(g) {
    if (g.mode !== 'reaction' || g.over || (g.phase !== 'red' && g.phase !== 'green')) return g;
    const n = clone(g);
    startRed(n);
    return n;
  }

  const isOver = (g) => !!g.over;
  const timeLeft = (g) => (g.mode === 'classic' ? Math.max(0, ROUND_MS - g.t) : 0);

  /** Trung bình phản ứng (ms) của ván đo, đã cộng phạt; chưa đo lần nào thì null. */
  function reactionAvg(g) {
    if (!g.trials || !g.trials.length) return null;
    const sum = g.trials.reduce((a, b) => a + b, 0);
    return Math.round(sum / g.trials.length + g.fouls * REACTION.PENALTY);
  }

  /** Điểm của ván: ngắm bắn = tổng điểm; đo phản ứng = 1000 − trung bình (chỉ khi đã đo đủ). */
  function score(g) {
    if (g.mode === 'classic') return g.score;
    return g.over ? Math.max(0, REACTION.BASE - reactionAvg(g)) : 0;
  }

  /** Số liệu tổng kết ván ngắm bắn. */
  function summary(g) {
    const taps = g.hits + g.misses;
    return {
      score: g.score,
      hits: g.hits,
      misses: g.misses,
      expired: g.expired,
      accuracy: taps ? g.hits / taps : null,
      avgMs: g.hits ? Math.round(g.reactSum / g.hits) : null,
      bestStreak: g.bestStreak,
    };
  }

  /** Đã chơi đủ để tính là một ván (bỏ giữa chừng thì báo cổng): đã chạm, hoặc đã chơi ≥ 1 giây. */
  function hasProgress(g) {
    if (g.over) return false;
    if (g.mode === 'classic') return g.score > 0 || g.hits + g.misses > 0 || g.t >= 1000;
    return g.trials.length > 0 || g.fouls > 0 || g.t >= 1000;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return Object.assign({ v: VERSION }, clone(g));
  }

  function fromClassic(raw) {
    if (!validShape(raw.w, raw.h)) return null;
    if (!isCount(raw.t, ROUND_MS) || !isCount(raw.nextAt, ROUND_MS + 2000) || !isCount(raw.nextId, 1000)) return null;
    if (!isCount(raw.hits, raw.nextId) || !isCount(raw.expired, raw.nextId)) return null;
    if (!isCount(raw.misses, 1e6) || !isCount(raw.streak, raw.hits) || !isCount(raw.bestStreak, raw.hits) || raw.bestStreak < raw.streak) return null;
    if (!isCount(raw.score, raw.hits * MAX_HIT * MAX_MULT) || !isCount(raw.reactSum, raw.hits * lifeFor(0))) return null;
    if (typeof raw.over !== 'boolean' || raw.over !== (raw.t >= ROUND_MS)) return null;
    if (!Array.isArray(raw.targets) || raw.targets.length > MAX_LIVE || (raw.over && raw.targets.length)) return null;
    if (raw.hits + raw.expired + raw.targets.length > raw.nextId) return null;
    const ids = new Set();
    for (const o of raw.targets) {
      if (!o || typeof o !== 'object' || !isCount(o.id, raw.nextId - 1) || ids.has(o.id)) return null;
      ids.add(o.id);
      if (!isCount(o.at, raw.t) || o.r !== radiusFor(o.at) || o.life !== lifeFor(o.at) || o.at + o.life <= raw.t) return null;
      if (!isNum(o.x, o.r, raw.w - o.r) || !isNum(o.y, o.r, raw.h - o.r)) return null;
    }
    const g = newGame(raw.seed, { w: raw.w, h: raw.h });
    ['rng', 't', 'nextAt', 'nextId', 'score', 'streak', 'bestStreak', 'hits', 'misses', 'expired', 'reactSum', 'over'].forEach((k) => { g[k] = raw[k]; });
    g.targets = raw.targets.map((o) => ({ id: o.id, x: o.x, y: o.y, r: o.r, at: o.at, life: o.life }));
    return g;
  }

  function fromReaction(raw) {
    const R = REACTION;
    if (!isCount(raw.t, 1e8) || !isCount(raw.fouls, 1e4) || typeof raw.over !== 'boolean') return null;
    if (!Array.isArray(raw.trials) || raw.trials.length > R.TRIALS || !raw.trials.every((ms) => isCount(ms, R.TIMEOUT) && ms >= R.TOO_FAST)) return null;
    if (raw.over !== (raw.trials.length === R.TRIALS)) return null;
    const phases = raw.over ? ['done'] : ['red', 'green', 'result', 'foul'];
    if (phases.indexOf(raw.phase) < 0 || !isCount(raw.greenAt, 1e8 + R.WAIT_MAX) || !isCount(raw.phaseEnd, 1e8 + R.FOUL_MS)) return null;
    if (raw.phase === 'red' && (raw.greenAt <= raw.t || raw.greenAt > raw.t + R.WAIT_MAX)) return null;
    if (raw.phase === 'green' && (raw.greenAt > raw.t || raw.t >= raw.greenAt + R.TIMEOUT)) return null;
    if ((raw.phase === 'result' || raw.phase === 'foul') && (raw.phaseEnd <= raw.t || raw.phaseEnd > raw.t + R.FOUL_MS)) return null;
    const last = raw.last;
    if (last !== null && (!last || typeof last !== 'object' || ['ok', 'slow', 'early', 'guess'].indexOf(last.kind) < 0)) return null;
    const g = newGame(raw.seed, { mode: 'reaction' });
    ['rng', 't', 'phase', 'greenAt', 'phaseEnd', 'fouls', 'over'].forEach((k) => { g[k] = raw[k]; });
    g.trials = raw.trials.slice();
    g.last = last ? { kind: last.kind, ms: Number.isInteger(last.ms) ? last.ms : null } : null;
    return g;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !isSeed(raw.seed) || !isSeed(raw.rng)) return null;
    if (raw.mode === 'classic') return fromClassic(raw);
    if (raw.mode === 'reaction') return fromReaction(raw);
    return null;
  }

  const api = {
    VERSION,
    ROUND_MS,
    SHORT,
    MAX_LONG,
    FIRST_AT,
    MAX_LIVE,
    MAX_MULT,
    COMBO_STEP,
    MAX_HIT,
    REACTION,
    shape,
    radiusFor,
    lifeFor,
    intervalFor,
    gapFor,
    pairChance,
    newGame,
    radiusAt,
    multiplier,
    advance,
    tap,
    press,
    interrupt,
    isOver,
    timeLeft,
    reactionAvg,
    score,
    summary,
    hasProgress,
    toJSON,
    fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
