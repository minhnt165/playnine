/* =====================================================================
 * Ba Đỉnh - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật Tri Peaks: 28 lá xếp thành ba đỉnh chồng nhau (hàng 3 / 6 / 9 / 10), hàng dưới ngửa,
 *   lá khác tự ngửa khi không còn lá nào đè. Bộ 52 lá: 28 lá trên bàn, 24 lá còn lại thành nọc,
 *   lật lá đầu nọc ra làm lá đáy (còn 23 lá úp trong nọc).
 *   - Đánh lá ngửa trên bàn hơn / kém lá đáy đúng một bậc (K và A nối vòng) lên đáy; hết nước thì rút nọc
 *   - Ván kết thúc khi dọn sạch 28 lá (thưởng) hoặc nọc hết mà không còn nước
 *   - Một trận 3 ván, mỗi ván chia bài mới, điểm cộng dồn
 *   - Điểm: mỗi lá dọn = độ dài chuỗi hiện tại (rút nọc là đứt chuỗi), +15 mỗi lá đỉnh,
 *     +30 khi dọn sạch ván, +5 mỗi lá còn trong nọc lúc dọn sạch
 *   Mọi hàm nhận trạng thái cũ, trả trạng thái mới (không sửa trạng thái vào).
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const ROUNDS = 3;
  const TABLEAU = 28;
  const STOCK = 52 - TABLEAU - 1; // 23 lá úp trong nọc sau khi lật lá đáy
  const PEAK_BONUS = 15;
  const CLEAR_BONUS = 30;
  const STOCK_BONUS = 5;

  /* ---------------- Bố cục ba đỉnh ----------------
   * Chỉ số 0..27: hàng 0 (3 lá đỉnh) 0..2, hàng 1 (6 lá) 3..8, hàng 2 (9 lá) 9..17, hàng 3 (10 lá) 18..27.
   * x là mép trái tính theo bề rộng lá: hàng 3 ở 0..9, hàng 2 ở 0,5..8,5 (mỗi lá bị hai lá hàng 3 đè nửa),
   * hàng 1 ở 1, 2 · 4, 5 · 7, 8, hàng 0 ở 1,5 · 4,5 · 7,5. Lá bị đè bởi các lá hàng ngay dưới lệch nửa lá.
   */
  const POS = [];
  [1.5, 4.5, 7.5].forEach((x) => POS.push({ row: 0, x }));
  [1, 2, 4, 5, 7, 8].forEach((x) => POS.push({ row: 1, x }));
  for (let j = 0; j < 9; j++) POS.push({ row: 2, x: j + 0.5 });
  for (let j = 0; j < 10; j++) POS.push({ row: 3, x: j });

  /** COVERED_BY[i]: các lá đè lên lá i. */
  const COVERED_BY = POS.map((p) => {
    const out = [];
    POS.forEach((q, j) => {
      if (q.row === p.row + 1 && Math.abs(q.x - p.x) === 0.5) out.push(j);
    });
    return out;
  });
  const PEAKS = [0, 1, 2];

  /* ---------------- Luật ---------------- */

  /** Hai bậc liền nhau (K–A nối vòng). */
  function adjacent(a, b) {
    const d = Math.abs(a - b);
    return d === 1 || d === 12;
  }

  const rankOf = (id) => C.fromId(id).rank;
  const wasteTop = (g) => g.waste[g.waste.length - 1];

  /** Lá i còn trên bàn và không bị lá nào đè (cũng chính là lá đang ngửa). */
  function exposed(g, i) {
    return g.tableau[i] != null && COVERED_BY[i].every((j) => g.tableau[j] == null);
  }

  function legal(g, i) {
    return exposed(g, i) && adjacent(rankOf(g.tableau[i]), rankOf(wasteTop(g)));
  }
  /** Lá i đánh được ngay (đang trong ván, đã lộ, liền bậc với lá đáy). */
  const canPlay = (g, i) => g.phase === 'play' && legal(g, i);

  /** Các lá đánh được ngay (chỉ số trên bàn), theo thứ tự chỉ số. */
  function playable(g) {
    const out = [];
    for (let i = 0; i < TABLEAU; i++) if (canPlay(g, i)) out.push(i);
    return out;
  }

  const cleared = (g) => g.tableau.every((c) => c == null);
  /** Ván đã hết: dọn sạch, hoặc nọc hết và không còn lá nào đánh được. */
  function roundDone(g) {
    if (cleared(g)) return true;
    if (g.stock.length) return false;
    for (let i = 0; i < TABLEAU; i++) if (legal(g, i)) return false;
    return true;
  }

  /* ---------------- Chia bài ---------------- */

  /** Chia một ván từ rng: 28 lá đầu lên bàn theo chỉ số, lá kế ra đáy, 23 lá còn lại vào nọc (cuối mảng là đầu nọc). */
  function dealCards(r) {
    const ids = C.shuffle(C.newDeck(), r).map(C.toId);
    return { tableau: ids.slice(0, TABLEAU), waste: [ids[TABLEAU]], stock: ids.slice(TABLEAU + 1) };
  }

  /** Trận mới. seed: số hoặc chuỗi (ví dụ ngày); bỏ trống thì ngẫu nhiên. */
  function newGame(seed) {
    const s = typeof seed === 'string' ? seed : typeof seed === 'number' && isFinite(seed) ? seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    const r = C.rng(s);
    const d = dealCards(r);
    return {
      seed: s,
      rng: r.getState(),
      round: 0,
      phase: 'play', // 'play' | 'roundEnd' (chờ sang ván kế) | 'over' (hết trận)
      tableau: d.tableau,
      stock: d.stock,
      waste: d.waste,
      score: 0,
      roundScore: 0,
      streak: 0,
      bestStreak: 0,
      actions: 0, // số lần đánh + rút (ván đã "đi nước" khi > 0)
      rounds: [], // kết quả các ván đã xong: { score, cleared, stockLeft }
    };
  }

  const clone = (g) => Object.assign({}, g, {
    tableau: g.tableau.slice(),
    stock: g.stock.slice(),
    waste: g.waste.slice(),
    rounds: g.rounds.map((x) => Object.assign({}, x)),
  });

  /** Ván vừa hết thì cộng thưởng, ghi kết quả, đổi pha; trả thông tin kết thúc (null nếu ván chưa hết). Sửa trực tiếp g (bản sao). */
  function settle(g) {
    if (!roundDone(g)) return null;
    const clear = cleared(g);
    const stockLeft = clear ? g.stock.length : 0;
    const bonus = clear ? CLEAR_BONUS + STOCK_BONUS * stockLeft : 0;
    g.score += bonus;
    g.roundScore += bonus;
    g.rounds.push({ score: g.roundScore, cleared: clear, stockLeft });
    g.phase = g.round >= ROUNDS - 1 ? 'over' : 'roundEnd';
    return { cleared: clear, bonus, stockLeft, roundScore: g.roundScore, over: g.phase === 'over' };
  }

  /**
   * Đánh lá i trên bàn lên đáy. Không hợp lệ thì trả null.
   * Trả { game, card, gained, streak, peak, flipped: [chỉ số lá vừa lộ], end: null | { cleared, bonus, stockLeft, roundScore, over } }.
   */
  function play(g0, i) {
    if (!Number.isInteger(i) || i < 0 || i >= TABLEAU || !canPlay(g0, i)) return null;
    const g = clone(g0);
    const id = g.tableau[i];
    g.tableau[i] = null;
    g.waste.push(id);
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    const peak = PEAKS.indexOf(i) >= 0;
    const gained = g.streak + (peak ? PEAK_BONUS : 0);
    g.score += gained;
    g.roundScore += gained;
    g.actions += 1;
    // Lá vừa lộ: lá mà i đang đè và nay không còn lá nào đè
    const flipped = [];
    for (let j = 0; j < TABLEAU; j++) if (COVERED_BY[j].indexOf(i) >= 0 && exposed(g, j)) flipped.push(j);
    const end = settle(g);
    return { game: g, card: id, gained, streak: g.streak, peak, flipped, end };
  }

  /** Rút một lá nọc ra đáy (đứt chuỗi). Nọc hết hoặc không trong ván thì trả null. Trả { game, card, end }. */
  function draw(g0) {
    if (g0.phase !== 'play' || !g0.stock.length) return null;
    const g = clone(g0);
    const id = g.stock.pop();
    g.waste.push(id);
    g.streak = 0;
    g.actions += 1;
    const end = settle(g);
    return { game: g, card: id, end };
  }

  /** Sang ván kế (chỉ khi vừa xong một ván chưa phải ván cuối): chia bài mới tiếp dãy rng đã lưu, điểm giữ nguyên. */
  function nextRound(g0) {
    if (g0.phase !== 'roundEnd') return null;
    const g = clone(g0);
    const r = C.rng(0);
    r.setState(g.rng);
    const d = dealCards(r);
    g.rng = r.getState();
    g.round += 1;
    g.phase = 'play';
    g.tableau = d.tableau;
    g.stock = d.stock;
    g.waste = d.waste;
    g.streak = 0;
    g.roundScore = 0;
    return g;
  }

  /** Trận trọn vẹn: cả 3 ván đều dọn sạch. */
  const perfect = (g) => g.phase === 'over' && g.rounds.length === ROUNDS && g.rounds.every((x) => x.cleared);

  /** Điểm tối đa một ván: 28 lá trong một chuỗi không rút (1 + 2 + … + 28), 3 lá đỉnh, dọn sạch, 23 lá nọc còn nguyên. */
  const MAX_ROUND = (TABLEAU * (TABLEAU + 1)) / 2 + PEAKS.length * PEAK_BONUS + CLEAR_BONUS + STOCK_BONUS * STOCK;
  const MAX_SCORE = ROUNDS * MAX_ROUND;

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      v: VERSION,
      seed: g.seed,
      rng: g.rng,
      round: g.round,
      phase: g.phase,
      tableau: g.tableau.slice(),
      stock: g.stock.slice(),
      waste: g.waste.slice(),
      score: g.score,
      roundScore: g.roundScore,
      streak: g.streak,
      bestStreak: g.bestStreak,
      actions: g.actions,
      rounds: g.rounds.map((x) => ({ score: x.score, cleared: x.cleared, stockLeft: x.stockLeft })),
    };
  }

  const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const validId = (id) => typeof id === 'string' && !!C.fromId(id) && C.toId(C.fromId(id)) === id;

  /** Ván lưu hỏng, khác phiên bản hoặc không nhất quán thì trả null (app chia trận mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, rng, round, phase, tableau, stock, waste, score, roundScore, streak, bestStreak, actions, rounds } = raw;
    if (!(typeof seed === 'string' || isInt(seed, 0, 4294967295))) return null;
    if (!isInt(rng, 0, 4294967295) || !isInt(round, 0, ROUNDS - 1)) return null;
    if (['play', 'roundEnd', 'over'].indexOf(phase) < 0) return null;
    if (!Array.isArray(tableau) || tableau.length !== TABLEAU || !Array.isArray(stock) || !Array.isArray(waste) || !waste.length) return null;
    if (tableau.some((c) => c !== null && !validId(c)) || !stock.every(validId) || !waste.every(validId)) return null;
    // Bàn + nọc + đáy phải đúng một bộ 52 lá, không trùng
    const all = tableau.filter((c) => c !== null).concat(stock, waste);
    if (all.length !== 52 || new Set(all).size !== 52 || stock.length > STOCK) return null;
    if (!isInt(score, 0, MAX_SCORE) || !isInt(roundScore, 0, MAX_ROUND) || roundScore > score) return null;
    if (!isInt(streak, 0, TABLEAU) || !isInt(bestStreak, streak, TABLEAU) || !isInt(actions, 0, 1e6)) return null;
    // Số ván đã xong khớp với pha: đang chơi ván k thì đã xong k ván; vừa xong thì k + 1; hết trận chỉ ở ván cuối
    if (!Array.isArray(rounds) || rounds.length !== (phase === 'play' ? round : round + 1)) return null;
    if (phase === 'over' && round !== ROUNDS - 1) return null;
    if (phase === 'roundEnd' && round === ROUNDS - 1) return null;
    for (const x of rounds) {
      if (!x || typeof x !== 'object' || !isInt(x.score, 0, MAX_ROUND) || typeof x.cleared !== 'boolean' || !isInt(x.stockLeft, 0, STOCK)) return null;
    }
    const g = {
      seed, rng, round, phase,
      tableau: tableau.slice(), stock: stock.slice(), waste: waste.slice(),
      score, roundScore, streak, bestStreak, actions,
      rounds: rounds.map((x) => ({ score: x.score, cleared: x.cleared, stockLeft: x.stockLeft })),
    };
    // Đang chơi mà ván đã hết, hoặc báo xong mà ván chưa hết: không nhất quán
    if ((phase === 'play') === roundDone(g)) return null;
    return g;
  }

  const api = {
    VERSION, ROUNDS, TABLEAU, STOCK, PEAK_BONUS, CLEAR_BONUS, STOCK_BONUS, MAX_ROUND, MAX_SCORE,
    POS, COVERED_BY, PEAKS,
    adjacent, exposed, faceUp: exposed, canPlay, playable, roundDone, perfect,
    newGame, play, draw, nextRound, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
