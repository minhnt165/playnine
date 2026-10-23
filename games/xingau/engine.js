/* =====================================================================
 * Xí Ngầu - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật họ "Yacht" chơi một mình: 13 vòng, mỗi vòng lắc 5 xúc xắc tối đa 3 lần (giữ viên tùy ý giữa
 *   các lần lắc), rồi ghi vào một ô trống trên bảng điểm (mỗi ô dùng một lần).
 *   - Phần trên: Một..Sáu = tổng các viên đúng mặt đó; tổng phần trên >= 63 thì thưởng +35
 *   - Phần dưới: bộ ba / tứ quý = tổng 5 viên, cù lũ 25, sảnh nhỏ 30, sảnh lớn 40, ngũ quý 50, cơ hội = tổng
 *   - Ngũ quý thêm khi ô ngũ quý đã ghi 50: +100 mỗi lần. Luật joker (bắt buộc, như luật chuẩn) áp dụng khi
 *     lắc ra ngũ quý mà ô ngũ quý đã dùng (50 hay 0):
 *       1. ô cùng mặt ở phần trên còn trống thì bắt buộc ghi vào đó;
 *       2. không thì ghi vào ô trống bất kỳ ở phần dưới, cù lũ / sảnh nhỏ / sảnh lớn được đủ 25 / 30 / 40;
 *       3. phần dưới cũng đầy thì ghi 0 vào một ô trống ở phần trên.
 *   - Ô ngũ quý còn trống thì ngũ quý chỉ là bộ xúc xắc thường (không phải cù lũ, không phải sảnh).
 *   Mọi hàm nhận trạng thái cũ, trả trạng thái mới (không sửa tại chỗ); nước không hợp lệ trả lại đúng đối tượng cũ.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'three', 'four', 'full', 'small', 'large', 'yacht', 'chance'];
  const UPPER = CATS.slice(0, 6);
  const LOWER = CATS.slice(6);
  const DICE = 5;
  const MAX_ROLLS = 3;
  const UPPER_TARGET = 63;
  const UPPER_BONUS = 35;
  const YACHT_BONUS = 100;
  const FIXED = { full: 25, small: 30, large: 40, yacht: 50 };
  // Điểm cao nhất mỗi ô có thể nhận (phần trên: 5 viên đúng mặt; bộ ba / tứ quý / cơ hội: năm con 6)
  const CAT_MAX = { ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30, three: 30, four: 30, full: 25, small: 30, large: 40, yacht: 50, chance: 30 };
  // Điểm tối đa của một ván: 340 (mọi ô tối đa) + 35 (thưởng phần trên) + 12 x 100 (ngũ quý thêm; ô ngũ quý
  // phải giữ 50 trước nên chỉ còn 12 ô cho ngũ quý thêm). Đạt được bằng 13 lần ngũ quý ghi đúng thứ tự joker.
  const MAX_SCORE = 1575;
  // Mốc "thắng" gửi cho cổng (won: true): khó với người chơi thường, bot đơn giản chỉ đạt vài phần trăm
  const WIN_SCORE = 250;

  /* ---------------- PRNG mulberry32: trạng thái là một số nguyên 32 bit, lưu được trong ván ---------------- */
  function nextRand(s) {
    const st = (s + 0x6d2b79f5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: st };
  }

  /* ---------------- Tính điểm một bộ xúc xắc ---------------- */
  function counts(dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach((d) => c[d]++);
    return c;
  }
  const sum = (dice) => dice.reduce((a, b) => a + b, 0);
  const isFive = (dice) => dice.every((d) => d === dice[0]);
  /** Có chuỗi `len` số liên tiếp (viên trùng không làm đứt chuỗi). */
  function hasRun(c, len) {
    let run = 0;
    for (let f = 1; f <= 6; f++) {
      run = c[f] ? run + 1 : 0;
      if (run >= len) return true;
    }
    return false;
  }

  /** Điểm của bộ `dice` ở ô `cat`; `joker` = ngũ quý được dùng như joker (cù lũ / sảnh tính đủ điểm). */
  function scoreDice(dice, cat, joker) {
    const c = counts(dice);
    const ui = UPPER.indexOf(cat);
    if (ui >= 0) return c[ui + 1] * (ui + 1);
    const max = Math.max.apply(null, c);
    switch (cat) {
      case 'three': return max >= 3 ? sum(dice) : 0;
      case 'four': return max >= 4 ? sum(dice) : 0;
      case 'full': return (joker && max === 5) || (max === 3 && c.indexOf(2) >= 0) ? FIXED.full : 0;
      case 'small': return (joker && max === 5) || hasRun(c, 4) ? FIXED.small : 0;
      case 'large': return (joker && max === 5) || hasRun(c, 5) ? FIXED.large : 0;
      case 'yacht': return max === 5 ? FIXED.yacht : 0;
      case 'chance': return sum(dice);
      default: return 0;
    }
  }

  /* ---------------- Trạng thái ván ---------------- */
  function emptyScores() {
    const s = {};
    CATS.forEach((c) => { s[c] = null; });
    return s;
  }

  /** Ván mới với seed (số nguyên). Xúc xắc ban đầu chỉ để hiển thị, chưa lắc (rolls = 0). */
  function newGame(seed) {
    const s = seed >>> 0;
    return { seed: s, rng: s, dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], rolls: 0, scores: emptyScores(), bonus: 0 };
  }

  const filled = (g) => CATS.filter((c) => g.scores[c] !== null).length;
  const isDone = (g) => filled(g) === CATS.length;
  /** Vòng hiện tại 1..13 (hết ván vẫn là 13). */
  const round = (g) => Math.min(CATS.length, filled(g) + 1);
  /** Đã đi ít nhất một nước (đã lắc hoặc đã ghi ô): bỏ ván lúc này tính là thua. */
  const started = (g) => g.rolls > 0 || filled(g) > 0;
  const canRoll = (g) => !isDone(g) && g.rolls < MAX_ROLLS;

  function clone(g) {
    return { seed: g.seed, rng: g.rng, dice: g.dice.slice(), held: g.held.slice(), rolls: g.rolls, scores: Object.assign({}, g.scores), bonus: g.bonus };
  }

  /** Lắc: lần đầu của vòng lắc cả 5 viên, các lần sau chỉ lắc viên không giữ. */
  function roll(g) {
    if (!canRoll(g)) return g;
    const n = clone(g);
    if (n.rolls === 0) n.held = [false, false, false, false, false];
    for (let i = 0; i < DICE; i++) {
      if (n.held[i]) continue;
      const r = nextRand(n.rng);
      n.rng = r.state;
      n.dice[i] = 1 + Math.floor(r.value * 6);
    }
    n.rolls++;
    return n;
  }

  /** Giữ / bỏ giữ viên `i`: chỉ có nghĩa khi đã lắc và còn lượt lắc. */
  function toggleHold(g, i) {
    if (!Number.isInteger(i) || i < 0 || i >= DICE || g.rolls < 1 || !canRoll(g)) return g;
    const n = clone(g);
    n.held[i] = !n.held[i];
    return n;
  }

  /** Ngũ quý được dùng như joker: ô ngũ quý đã dùng (50 hay 0). */
  const isJoker = (g) => g.rolls > 0 && isFive(g.dice) && g.scores.yacht !== null;

  /** Ô `cat` có ghi được với bộ xúc xắc hiện tại không (gồm ràng buộc joker). */
  function legal(g, cat) {
    if (CATS.indexOf(cat) < 0 || g.rolls < 1 || g.scores[cat] !== null) return false;
    if (!isJoker(g)) return true;
    const face = UPPER[g.dice[0] - 1];
    if (g.scores[face] === null) return cat === face;
    if (LOWER.some((c) => g.scores[c] === null)) return LOWER.indexOf(cat) >= 0;
    return true;
  }
  const legalCats = (g) => CATS.filter((c) => legal(g, c));

  /** Điểm sẽ nhận nếu ghi vào `cat` bây giờ (không tính +100); null nếu không ghi được. */
  const potential = (g, cat) => (legal(g, cat) ? scoreDice(g.dice, cat, isJoker(g)) : null);

  /** Ghi điểm vào `cat`, cộng +100 nếu là ngũ quý thêm, rồi sang vòng sau (chưa lắc, bỏ giữ hết). */
  function score(g, cat) {
    if (!legal(g, cat)) return g;
    const n = clone(g);
    if (isFive(g.dice) && g.scores.yacht === FIXED.yacht) n.bonus++;
    n.scores[cat] = scoreDice(g.dice, cat, isJoker(g));
    n.rolls = 0;
    n.held = [false, false, false, false, false];
    return n;
  }

  /* ---------------- Tổng điểm ---------------- */
  const part = (g, cats) => cats.reduce((a, c) => a + (g.scores[c] || 0), 0);
  const upperSum = (g) => part(g, UPPER);
  const upperBonus = (g) => (upperSum(g) >= UPPER_TARGET ? UPPER_BONUS : 0);
  const lowerSum = (g) => part(g, LOWER);
  const yachtBonus = (g) => g.bonus * YACHT_BONUS;
  const total = (g) => upperSum(g) + upperBonus(g) + lowerSum(g) + yachtBonus(g);

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (g) => ({ v: VERSION, seed: g.seed, rng: g.rng, dice: g.dice.slice(), held: g.held.slice(), rolls: g.rolls, scores: Object.assign({}, g.scores), bonus: g.bonus });

  const isU32 = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
  /** Điểm `v` có thể xuất hiện ở ô `cat` không. */
  function validScore(cat, v) {
    if (v === null) return true;
    if (!Number.isInteger(v) || v < 0 || v > CAT_MAX[cat]) return false;
    const ui = UPPER.indexOf(cat);
    if (ui >= 0) return v % (ui + 1) === 0;
    if (FIXED[cat]) return v === 0 || v === FIXED[cat];
    if (cat === 'chance') return v >= DICE;
    return v === 0 || v >= DICE; // bộ ba / tứ quý
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    const { seed, rng, dice, held, rolls, scores, bonus } = raw;
    if (!isU32(seed) || !isU32(rng)) return null;
    if (!Array.isArray(dice) || dice.length !== DICE || !dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) return null;
    if (!Array.isArray(held) || held.length !== DICE || !held.every((h) => typeof h === 'boolean')) return null;
    if (!Number.isInteger(rolls) || rolls < 0 || rolls > MAX_ROLLS) return null;
    if (rolls === 0 && held.some(Boolean)) return null;
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return null;
    const keys = Object.keys(scores);
    if (keys.length !== CATS.length || !CATS.every((c) => keys.indexOf(c) >= 0 && validScore(c, scores[c]))) return null;
    const g = { seed, rng, dice: dice.slice(), held: held.slice(), rolls, scores: Object.assign({}, scores), bonus };
    // +100 chỉ có sau khi ô ngũ quý giữ 50, mỗi lần chiếm thêm một ô khác
    if (!Number.isInteger(bonus) || bonus < 0) return null;
    if (bonus > 0 && (scores.yacht !== FIXED.yacht || bonus > filled(g) - 1)) return null;
    if (isDone(g) && rolls !== 0) return null;
    return g;
  }

  const api = {
    CATS, UPPER, LOWER, DICE, MAX_ROLLS, UPPER_TARGET, UPPER_BONUS, YACHT_BONUS, CAT_MAX, MAX_SCORE, WIN_SCORE,
    scoreDice, newGame, roll, toggleHold, isJoker, legal, legalCats, potential, score,
    filled, isDone, round, started, canRoll, upperSum, upperBonus, lowerSum, yachtBonus, total,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
