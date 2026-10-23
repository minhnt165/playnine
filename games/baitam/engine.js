/* =====================================================================
 * Bài Tám - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Crazy Eights 4 người, bộ 52 lá: ghế 0 là bạn, ghế 1–3 là máy, đi theo chiều kim đồng hồ (0 → 1 → 2 → 3).
 *   - Mỗi người 5 lá; lật một lá mở chồng bài (lá 8 thì trộn lại vào nọc, lật lá khác)
 *   - Đánh lá cùng chất hoặc cùng bậc với lá trên cùng, hoặc lá 8 bất kỳ (rồi gọi chất)
 *   - Không đánh (hoặc không muốn đánh): rút một lá; lá đó hợp lệ thì được đánh ngay, không thì bỏ lượt
 *   - Hết nọc: trộn chồng đã đánh (trừ lá trên cùng) làm nọc mới
 *   - Hết bài trước thì thắng ván, ăn điểm bài trên tay đối thủ (8 = 50, J/Q/K = 10, A = 1, còn lại theo số)
 *   - Chạm mốc (50 / 100 / 200) trước thì thắng trận
 *   Lá lưu bằng id của ../_kit/cards.js ('AS', '10H', 'KD'); hàm nào cũng trả trạng thái mới, không đụng trạng thái cũ.
 *   PRNG (mulberry32 của cards.js) nằm trong trạng thái (rng) nên tải lại trang vẫn ra đúng lá cũ.
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SEATS = 4;
  const HUMAN = 0;
  const HAND = 5;
  const LEVELS = ['easy', 'hard'];
  const TARGETS = [50, 100, 200];
  const PHASES = ['play', 'round', 'over'];
  const SUITS = C.SUITS;
  const ALL = C.newDeck().map(C.toId); // thứ tự cố định: xáo từ mảng này

  const rankOf = (id) => C.fromId(id).rank;
  const suitOf = (id) => C.fromId(id).suit;
  const next = (seat) => (seat + 1) % SEATS;

  /** Điểm một lá khi còn trên tay lúc người khác hết bài. */
  function cardPoints(id) {
    const r = rankOf(id);
    if (r === 8) return 50;
    if (r >= 11) return 10;
    return r;
  }
  const handPoints = (hand) => hand.reduce((s, id) => s + cardPoints(id), 0);

  /** Bản sao trạng thái, thứ tự khóa cố định (lưu / so sánh dựa vào nó). */
  function clone(g) {
    return {
      level: g.level,
      target: g.target,
      scores: g.scores.slice(),
      round: g.round,
      dealer: g.dealer,
      rng: g.rng,
      deck: g.deck.slice(), // lá cuối mảng là lá trên cùng của nọc
      pile: g.pile.slice(), // lá cuối mảng là lá trên cùng của chồng đã đánh
      hands: g.hands.map((h) => h.slice()),
      suit: g.suit, // chất phải theo (chất lá trên cùng, hoặc chất vừa gọi bằng lá 8)
      turn: g.turn,
      drawn: g.drawn, // lá người đang tới lượt vừa rút (chỉ lá này được đánh), null nếu chưa rút
      voids: g.voids.map((v) => v.slice()), // chất mỗi người đã lộ là không theo được (ai cũng thấy: họ phải rút)
      phase: g.phase, // play | round (hết ván, chờ sang ván) | over (hết trận)
      result: g.result ? { winner: g.result.winner, points: g.result.points.slice(), gain: g.result.gain } : null,
      moves: g.moves, // số nước cả bàn trong trận
      humanMoves: g.humanMoves, // số nước của bạn (bỏ trận khi > 0 tính là thua)
      last: g.last ? Object.assign({}, g.last) : null, // nước vừa đi: { seat, type, card?, suit?, reshuffled? }
    };
  }

  /** Lấy PRNG từ trạng thái, chạy fn(r), ghi trạng thái PRNG mới vào g. */
  function withRng(g, fn) {
    const r = C.rng();
    r.setState(g.rng);
    const out = fn(r);
    g.rng = r.getState();
    return out;
  }

  /**
   * Lật lá mở đầu từ trên nọc; gặp lá 8 thì trộn lá đó lại vào nọc và lật lá khác.
   * Trả { deck, starter } (mảng mới).
   */
  function turnStarter(deck, r) {
    let d = deck.slice();
    let starter = d.pop();
    while (rankOf(starter) === 8) {
      d.push(starter);
      d = C.shuffle(d, r);
      starter = d.pop();
    }
    return { deck: d, starter };
  }

  /** Chia ván mới (trong g, đã là bản sao): xáo 52 lá, chia 5 lá mỗi người từ bên trái người chia, lật lá mở. */
  function deal(g) {
    withRng(g, (r) => {
      const deck = C.shuffle(ALL, r);
      const hands = [[], [], [], []];
      for (let k = 0; k < HAND; k++) {
        for (let i = 1; i <= SEATS; i++) hands[(g.dealer + i) % SEATS].push(deck.pop());
      }
      const t = turnStarter(deck, r);
      g.deck = t.deck;
      g.pile = [t.starter];
      g.hands = hands;
      g.suit = suitOf(t.starter);
    });
    g.turn = next(g.dealer);
    g.drawn = null;
    g.voids = [[], [], [], []];
    g.phase = 'play';
    g.result = null;
    g.last = null;
    return g;
  }

  /**
   * Trận mới. opts: { seed, level: 'easy' | 'hard', target: 50 | 100 | 200 }.
   * Người chia ván 1 là ghế 3 nên bạn (ghế 0) đi trước.
   */
  function newMatch(opts) {
    const o = opts || {};
    const target = Number(o.target);
    const r = C.rng(o.seed);
    const g = clone({
      level: LEVELS.indexOf(o.level) >= 0 ? o.level : 'easy',
      target: TARGETS.indexOf(target) >= 0 ? target : 100,
      scores: [0, 0, 0, 0],
      round: 1,
      dealer: SEATS - 1,
      rng: r.getState(),
      deck: [],
      pile: [],
      hands: [[], [], [], []],
      suit: 'S',
      turn: 0,
      drawn: null,
      voids: [[], [], [], []],
      phase: 'play',
      result: null,
      moves: 0,
      humanMoves: 0,
      last: null,
    });
    return deal(g);
  }

  const top = (g) => g.pile[g.pile.length - 1];

  /** Lá này đánh được lên chồng không (lá 8 luôn được; không xét lá có trên tay ai). */
  function isLegal(g, id) {
    const c = C.fromId(id);
    if (!c) return false;
    return c.rank === 8 || c.suit === g.suit || c.rank === rankOf(top(g));
  }

  /** Các lá người đang tới lượt đánh được (đã rút thì chỉ lá vừa rút). */
  function legalPlays(g) {
    if (g.phase !== 'play') return [];
    if (g.drawn) return isLegal(g, g.drawn) ? [g.drawn] : [];
    return g.hands[g.turn].filter((id) => isLegal(g, id));
  }

  /** Còn lá để rút (nọc còn lá, hoặc chồng đã đánh còn lá để trộn lại) và chưa rút lượt này. */
  const canDraw = (g) => g.phase === 'play' && !g.drawn && (g.deck.length > 0 || g.pile.length > 1);
  /** Bỏ lượt: sau khi rút, hoặc khi không rút được mà cũng không có lá nào đánh được. */
  const canPass = (g) => g.phase === 'play' && (!!g.drawn || (!canDraw(g) && legalPlays(g).length === 0));

  function countMove(g, seat) {
    g.moves++;
    if (seat === HUMAN) g.humanMoves++;
  }

  function markVoid(g, seat, suit) {
    if (g.voids[seat].indexOf(suit) < 0) g.voids[seat].push(suit);
  }

  /** Đánh lá id của người đang tới lượt; lá 8 phải kèm chất gọi (suit). */
  function play(g0, id, suit) {
    if (legalPlays(g0).indexOf(id) < 0) throw new Error('play: lá không đánh được ' + id);
    const is8 = rankOf(id) === 8;
    if (is8 && SUITS.indexOf(suit) < 0) throw new Error('play: lá 8 phải gọi chất');
    const g = clone(g0);
    const seat = g.turn;
    const hand = g.hands[seat];
    hand.splice(hand.indexOf(id), 1);
    g.pile.push(id);
    g.suit = is8 ? suit : suitOf(id);
    g.drawn = null;
    // Đã đánh chất này: thông tin "không theo được" cũ không còn đúng
    const s = suitOf(id);
    g.voids[seat] = g.voids[seat].filter((x) => x !== s);
    g.last = is8 ? { seat, type: 'play', card: id, suit } : { seat, type: 'play', card: id };
    countMove(g, seat);
    if (!hand.length) return endRound(g, seat);
    g.turn = next(seat);
    return g;
  }

  /** Rút một lá; hết nọc thì trộn chồng đã đánh (trừ lá trên cùng) làm nọc mới. */
  function draw(g0) {
    if (!canDraw(g0)) throw new Error('draw: không rút được');
    const g = clone(g0);
    const seat = g.turn;
    let reshuffled = false;
    if (!g.deck.length) {
      const t = g.pile.pop();
      g.deck = withRng(g, (r) => C.shuffle(g.pile, r));
      g.pile = [t];
      reshuffled = true;
    }
    const id = g.deck.pop();
    g.hands[seat].push(id);
    g.drawn = id;
    // Phải rút nghĩa là (thường) không theo được chất đang đòi: ai cũng thấy, máy Khó ghi nhớ
    markVoid(g, seat, g.suit);
    g.last = { seat, type: 'draw', reshuffled };
    countMove(g, seat);
    return g;
  }

  /** Bỏ lượt (sau khi rút, hoặc không rút được và không có lá đánh được). */
  function pass(g0) {
    if (!canPass(g0)) throw new Error('pass: chưa được bỏ lượt');
    const g = clone(g0);
    const seat = g.turn;
    markVoid(g, seat, g.suit);
    g.drawn = null;
    g.last = { seat, type: 'pass' };
    countMove(g, seat);
    g.turn = next(seat);
    return g;
  }

  /** Người `winner` hết bài: ăn điểm bài trên tay ba người còn lại; chạm mốc thì hết trận. */
  function endRound(g, winner) {
    const points = g.hands.map(handPoints);
    const gain = points.reduce((a, b) => a + b, 0) - points[winner];
    g.scores[winner] += gain;
    g.result = { winner, points, gain };
    g.phase = g.scores[winner] >= g.target ? 'over' : 'round';
    g.drawn = null;
    return g;
  }

  /** Sang ván sau: người chia xoay sang trái, giữ điểm. */
  function nextRound(g0) {
    if (g0.phase !== 'round') throw new Error('nextRound: chưa hết ván hoặc đã hết trận');
    const g = clone(g0);
    g.round++;
    g.dealer = next(g.dealer);
    return deal(g);
  }

  const matchWinner = (g) => (g.phase === 'over' && g.result ? g.result.winner : null);

  /** Áp một hành động { type: 'play', card, suit? } | { type: 'draw' } | { type: 'pass' }. */
  function apply(g, a) {
    if (!a || typeof a !== 'object') throw new Error('apply: hành động lạ');
    if (a.type === 'play') return play(g, a.card, a.suit);
    if (a.type === 'draw') return draw(g);
    if (a.type === 'pass') return pass(g);
    throw new Error('apply: hành động lạ ' + a.type);
  }

  /* ---------------- Máy ---------------- */

  /** Chất có nhiều lá nhất trên tay (không tính lá 8); hòa thì ưu tiên chất người kế tiếp không theo được. */
  function bestSuit(hand, voidsNext) {
    const n = { S: 0, H: 0, D: 0, C: 0 };
    hand.forEach((id) => {
      if (rankOf(id) !== 8) n[suitOf(id)]++;
    });
    let best = SUITS[0];
    let bestScore = -1;
    SUITS.forEach((s) => {
      const sc = n[s] * 10 + (voidsNext && voidsNext.indexOf(s) >= 0 ? 1 : 0);
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    });
    return best;
  }

  /** PRNG riêng cho lựa chọn của máy Dễ: suy ra từ trạng thái (không đổi rng của ván), cùng ván thì cùng nước. */
  function pickRng(g) {
    return C.rng((g.rng ^ Math.imul(g.moves + 1, 0x9e3779b1) ^ Math.imul(g.turn + 1, 0x85ebca6b)) >>> 0);
  }

  /**
   * Máy Khó chấm điểm một lá đánh được (lá 8 xét riêng):
   *   +10 cho mỗi lá còn lại cùng chất mới (đánh xong vẫn còn đường đi)
   *   +6 nếu người kế tiếp đã lộ là không có chất mới, +2 cho mỗi đối thủ khác như vậy
   *   + điểm lá × 4 khi có đối thủ chỉ còn 1–2 lá (xả lá to trước khi bị ăn điểm), × 0,3 lúc bình thường
   */
  function scorePlay(g, seat, id) {
    const hand = g.hands[seat];
    const s = suitOf(id);
    let sc = 0;
    hand.forEach((x) => {
      if (x !== id && rankOf(x) !== 8 && suitOf(x) === s) sc += 10;
    });
    let close = false;
    for (let k = 1; k < SEATS; k++) {
      const o = (seat + k) % SEATS;
      if (g.voids[o].indexOf(s) >= 0) sc += k === 1 ? 6 : 2;
      if (g.hands[o].length <= 2) close = true;
    }
    return sc + cardPoints(id) * (close ? 4 : 0.3);
  }

  /** Nước của máy cho người đang tới lượt. level bỏ trống = mức của trận. */
  function aiAction(g, level) {
    const lv = level || g.level;
    const seat = g.turn;
    const plays = legalPlays(g);
    if (!plays.length) {
      if (canDraw(g)) return { type: 'draw' };
      return { type: 'pass' };
    }
    const hand = g.hands[seat];
    const voidsNext = g.voids[next(seat)];
    let card;
    let suit;
    if (lv === 'hard') {
      // Giữ lá 8 tới cuối: chỉ đánh 8 khi không còn lá nào khác đánh được
      const plain = plays.filter((id) => rankOf(id) !== 8);
      if (plain.length) {
        let best = -Infinity;
        plain.forEach((id) => {
          const sc = scorePlay(g, seat, id);
          if (sc > best) {
            best = sc;
            card = id;
          }
        });
      } else {
        card = plays[0];
        suit = bestSuit(hand.filter((x) => x !== card), voidsNext);
      }
    } else {
      const r = pickRng(g);
      card = plays[r.int(plays.length)];
      if (rankOf(card) === 8) suit = SUITS[r.int(SUITS.length)];
    }
    return suit ? { type: 'play', card, suit } : { type: 'play', card };
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => Object.assign({ v: VERSION }, clone(g));

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && (hi == null || x <= hi);
  const isId = (x) => typeof x === 'string' && !!C.fromId(x) && C.toId(C.fromId(x)) === x;
  const isIds = (a) => Array.isArray(a) && a.every(isId);

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia trận mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    try {
      const g = raw;
      if (LEVELS.indexOf(g.level) < 0 || TARGETS.indexOf(g.target) < 0) return null;
      if (!Array.isArray(g.scores) || g.scores.length !== SEATS || !g.scores.every((s) => isInt(s, 0))) return null;
      if (!isInt(g.round, 1) || !isInt(g.dealer, 0, 3) || !isInt(g.turn, 0, 3) || !isInt(g.rng, 0, 4294967295)) return null;
      if (!isIds(g.deck) || !isIds(g.pile) || !Array.isArray(g.hands) || g.hands.length !== SEATS || !g.hands.every(isIds)) return null;
      const all = g.deck.concat(g.pile, ...g.hands);
      if (all.length !== 52 || new Set(all).size !== 52) return null;
      if (!g.pile.length || SUITS.indexOf(g.suit) < 0) return null;
      // Lá trên cùng không phải 8 thì chất phải theo đúng chất lá đó
      if (rankOf(top(g)) !== 8 && g.suit !== suitOf(top(g))) return null;
      if (PHASES.indexOf(g.phase) < 0) return null;
      if (!Array.isArray(g.voids) || g.voids.length !== SEATS || !g.voids.every((v) => Array.isArray(v) && v.every((s) => SUITS.indexOf(s) >= 0))) return null;
      if (!isInt(g.moves, 0) || !isInt(g.humanMoves, 0, g.moves)) return null;
      if (g.phase === 'play') {
        if (g.result !== null || g.scores.some((s) => s >= g.target)) return null;
        if (g.hands.some((h) => !h.length)) return null;
        if (g.drawn !== null && (!isId(g.drawn) || g.hands[g.turn].indexOf(g.drawn) < 0)) return null;
      } else {
        const r = g.result;
        if (!r || typeof r !== 'object' || !isInt(r.winner, 0, 3) || !isInt(r.gain, 0)) return null;
        if (!Array.isArray(r.points) || r.points.length !== SEATS || !r.points.every((p) => isInt(p, 0))) return null;
        if (g.drawn !== null || g.hands[r.winner].length) return null;
        const reached = g.scores.filter((s) => s >= g.target).length;
        if (g.phase === 'over' ? reached !== 1 || g.scores[r.winner] < g.target : reached) return null;
      }
      const l = g.last;
      if (l !== null) {
        if (!l || typeof l !== 'object' || !isInt(l.seat, 0, 3) || ['play', 'draw', 'pass'].indexOf(l.type) < 0) return null;
        if (l.card != null && !isId(l.card)) return null;
        if (l.suit != null && SUITS.indexOf(l.suit) < 0) return null;
        if (l.reshuffled != null && typeof l.reshuffled !== 'boolean') return null;
      }
      const out = clone(g);
      if (out.last) {
        // Chỉ giữ các khóa đã biết
        const x = { seat: l.seat, type: l.type };
        if (l.card != null) x.card = l.card;
        if (l.suit != null) x.suit = l.suit;
        if (l.reshuffled != null) x.reshuffled = l.reshuffled;
        out.last = x;
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  const api = {
    VERSION, SEATS, HUMAN, LEVELS, TARGETS,
    cardPoints, handPoints, newMatch, turnStarter, top, isLegal, legalPlays, canDraw, canPass,
    play, draw, pass, nextRound, matchWinner, apply, aiAction, bestSuit, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
