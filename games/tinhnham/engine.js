/* =====================================================================
 * Tính Nhẩm - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Ván 60 giây: lần lượt hỏi phép tính + − × ÷ số nguyên dương, người chơi gõ đáp án
 *   - Tự chấm khi gõ đủ số chữ số của đáp án (Enter chấm sớm); đúng thì cộng điểm, sang câu mới
 *   - Độ khó theo chuỗi đúng liên tiếp: cứ 3 câu đúng lên một mức (0..MAX_LEVEL); sai thì chuỗi về 0
 *     nên câu sau về mức 0. Sai không trừ điểm, không trừ giờ (ván luôn đủ 60 giây)
 *   - Điểm mỗi câu = (mức + 1) × hệ số chuỗi (×1, ×2 từ 5 câu, ×3 từ 10 câu)
 *   - Tất định: cùng hạt giống + cùng chuỗi phím và thời điểm thì cùng dãy câu, cùng điểm
 *   Hàm thuần: nhận ván cũ, trả ván mới (không sửa ván cũ); toJSON / fromJSON để lưu ván.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const ROUND_MS = 60000;
  const OPS = ['+', '-', '×', '÷'];
  const MAX_DIGITS = 4;
  const ALL = OPS; // mức cao: đủ bốn phép, tỉ lệ đều

  /**
   * Bảng mức: ops = túi phép tính (lặp lại để tăng tỉ lệ), add = phạm vi hai số hạng của phép cộng
   * (phép trừ: số trừ và hiệu cùng phạm vi này), mul = [phạm vi thừa số thứ nhất, thứ hai]
   * (phép chia: số chia theo phạm vi thứ nhất, thương theo phạm vi thứ hai).
   */
  const LEVELS = [
    { ops: ['+', '+', '-'], add: [1, 9], mul: null },
    { ops: ['+', '-', '×'], add: [2, 15], mul: [[2, 5], [2, 9]] },
    { ops: ['+', '-', '×', '÷'], add: [5, 25], mul: [[2, 9], [2, 9]] },
    { ops: ALL, add: [10, 49], mul: [[2, 9], [3, 12]] },
    { ops: ALL, add: [10, 99], mul: [[3, 12], [3, 12]] },
    { ops: ALL, add: [20, 199], mul: [[4, 15], [6, 15]] },
    { ops: ALL, add: [50, 299], mul: [[6, 19], [6, 19]] },
    { ops: ALL, add: [100, 499], mul: [[11, 25], [3, 25]] },
    { ops: ALL, add: [100, 999], mul: [[12, 40], [3, 30]] },
  ];
  const MAX_LEVEL = LEVELS.length - 1;
  const STREAK_PER_LEVEL = 3;

  /* ---------------- Số ngẫu nhiên có hạt giống (mulberry32, trạng thái là số nguyên 32 bit) ---------------- */

  /** Hạt giống (số hoặc chuỗi) → trạng thái đầu (FNV-1a). */
  function seedState(seed) {
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h | 0;
  }

  /** Bộ rút số chạy trên một bản sao trạng thái: r.int(lo, hi) (gồm cả hai đầu), r.state đọc trạng thái mới. */
  function cursor(state) {
    let s = state | 0;
    const next = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      get state() { return s; },
    };
  }

  /* ---------------- Phép tính ---------------- */

  /** Đáp án của câu; câu không hợp lệ (chia không hết, hiệu không dương…) thì NaN. */
  function answerOf(q) {
    if (q.op === '+') return q.a + q.b;
    if (q.op === '-') return q.a > q.b ? q.a - q.b : NaN;
    if (q.op === '×') return q.a * q.b;
    if (q.op === '÷') return q.b > 0 && q.a % q.b === 0 ? q.a / q.b : NaN;
    return NaN;
  }

  const levelOf = (streak) => Math.min(MAX_LEVEL, Math.floor(streak / STREAK_PER_LEVEL));
  /** Hệ số cho câu đúng tiếp theo khi đang có chuỗi `streak` câu đúng. */
  const multiplier = (streak) => (streak >= 10 ? 3 : streak >= 5 ? 2 : 1);
  /** Điểm của câu đúng tiếp theo khi đang có chuỗi `streak` câu đúng. */
  const pointsFor = (streak) => (levelOf(streak) + 1) * multiplier(streak);
  const MAX_POINTS = pointsFor(1e9);

  /**
   * Sinh một câu ở mức `level` từ trạng thái rng; không trùng đúng câu `prev`.
   * Trả { q: { a, op, b, level }, rng: trạng thái mới }.
   */
  function makeQuestion(rng, level, prev) {
    const L = LEVELS[level];
    const r = cursor(rng);
    let q = null;
    for (let tries = 0; tries < 20; tries++) {
      const op = r.pick(L.ops);
      if (op === '+') q = { a: r.int(L.add[0], L.add[1]), op, b: r.int(L.add[0], L.add[1]), level };
      else if (op === '-') {
        const b = r.int(L.add[0], L.add[1]);
        q = { a: b + r.int(L.add[0], L.add[1]), op, b, level };
      } else if (op === '×') q = { a: r.int(L.mul[0][0], L.mul[0][1]), op, b: r.int(L.mul[1][0], L.mul[1][1]), level };
      else {
        const b = r.int(L.mul[0][0], L.mul[0][1]);
        q = { a: b * r.int(L.mul[1][0], L.mul[1][1]), op, b, level };
      }
      if (!prev || q.a !== prev.a || q.op !== prev.op || q.b !== prev.b) break;
    }
    return { q, rng: r.state };
  }

  /* ---------------- Ván ---------------- */

  function newGame(seed) {
    const first = makeQuestion(seedState(seed), 0, null);
    return {
      seed,
      rng: first.rng,
      t: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      wrong: 0,
      maxLevel: 0,
      q: first.q,
      input: '',
    };
  }

  const isOver = (g) => g.t >= ROUND_MS;
  const timeLeft = (g) => Math.max(0, ROUND_MS - g.t);

  /** Tiến đồng hồ `ms`; hết giờ thì báo sự kiện { type: 'over' } đúng một lần. */
  function advance(g, ms) {
    if (isOver(g)) return { game: g, events: [] };
    const t = Math.min(ROUND_MS, g.t + Math.max(0, Math.floor(ms) || 0));
    const game = Object.assign({}, g, { t });
    return { game, events: t >= ROUND_MS ? [{ type: 'over' }] : [] };
  }

  /** Chấm chuỗi số `s` cho câu hiện tại, sang câu mới. */
  function check(g, s) {
    const answer = answerOf(g.q);
    const given = Number(s);
    if (given === answer) {
      const points = (g.q.level + 1) * multiplier(g.streak);
      const streak = g.streak + 1;
      const next = makeQuestion(g.rng, levelOf(streak), g.q);
      const game = Object.assign({}, g, {
        rng: next.rng,
        score: g.score + points,
        streak,
        bestStreak: Math.max(g.bestStreak, streak),
        correct: g.correct + 1,
        maxLevel: Math.max(g.maxLevel, next.q.level),
        q: next.q,
        input: '',
      });
      return { game, result: { type: 'correct', points, level: g.q.level, mult: multiplier(g.streak), streak, q: g.q, answer } };
    }
    const next = makeQuestion(g.rng, 0, g.q);
    const game = Object.assign({}, g, { rng: next.rng, streak: 0, wrong: g.wrong + 1, q: next.q, input: '' });
    return { game, result: { type: 'wrong', q: g.q, answer, given, lost: g.streak } };
  }

  /**
   * Một phím: '0'..'9', 'back' (xóa lùi), 'enter' (chấm sớm).
   * Trả { game, result } với result.type: 'none' | 'digit' | 'back' | 'correct' | 'wrong'.
   */
  function press(g, key) {
    const none = { game: g, result: { type: 'none' } };
    if (isOver(g)) return none;
    const len = String(answerOf(g.q)).length;
    if (typeof key === 'string' && /^[0-9]$/.test(key)) {
      if ((g.input === '' && key === '0') || g.input.length >= len) return none;
      const input = g.input + key;
      if (input.length >= len) return check(g, input);
      return { game: Object.assign({}, g, { input }), result: { type: 'digit', input } };
    }
    if (key === 'back') {
      if (!g.input) return none;
      const input = g.input.slice(0, -1);
      return { game: Object.assign({}, g, { input }), result: { type: 'back', input } };
    }
    if (key === 'enter') return g.input ? check(g, g.input) : none;
    return none;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const FIELDS = ['seed', 'rng', 't', 'score', 'streak', 'bestStreak', 'correct', 'wrong', 'maxLevel', 'q', 'input'];

  function toJSON(g) {
    const o = { v: VERSION };
    FIELDS.forEach((k) => { o[k] = k === 'q' ? Object.assign({}, g.q) : g[k]; });
    return o;
  }

  const isNat = (x) => Number.isInteger(x) && x >= 0;

  function validQ(q) {
    if (!q || typeof q !== 'object' || OPS.indexOf(q.op) < 0) return false;
    if (!Number.isInteger(q.a) || !Number.isInteger(q.b) || q.a <= 0 || q.b <= 0) return false;
    if (!Number.isInteger(q.level) || q.level < 0 || q.level > MAX_LEVEL) return false;
    const ans = answerOf(q);
    return Number.isInteger(ans) && ans > 0 && String(ans).length <= MAX_DIGITS;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    const { seed, rng, t, score, streak, bestStreak, correct, wrong, maxLevel, q, input } = raw;
    if (!isNat(seed) || seed > 0xffffffff) return null;
    if (!Number.isInteger(rng) || rng < -0x80000000 || rng > 0x7fffffff) return null;
    if (!isNat(t) || t > ROUND_MS) return null;
    if (![score, streak, bestStreak, correct, wrong].every(isNat)) return null;
    if (bestStreak < streak || correct < bestStreak) return null;
    if (!isNat(maxLevel) || maxLevel > MAX_LEVEL) return null;
    if (!validQ(q) || q.level !== levelOf(streak) || q.level > maxLevel) return null;
    if (typeof input !== 'string' || !/^([1-9][0-9]*)?$/.test(input) || input.length >= String(answerOf(q)).length) return null;
    return { seed, rng, t, score, streak, bestStreak, correct, wrong, maxLevel, q: { a: q.a, op: q.op, b: q.b, level: q.level }, input };
  }

  const api = {
    ROUND_MS, OPS, MAX_DIGITS, LEVELS, MAX_LEVEL, STREAK_PER_LEVEL, MAX_POINTS,
    seedState, makeQuestion, answerOf, levelOf, multiplier, pointsFor,
    newGame, isOver, timeLeft, advance, press, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
