/* =====================================================================
 * Poker Rút - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Video Poker luật Jacks or Better, bảng trả 9/6 (bản trả đủ, tỉ lệ trả lý thuyết 99,54% khi cược 5 xu):
 *   - Phiên 25 tay, vốn 100 xu; mỗi tay cược 1..5 xu, chia 5 lá từ một bộ 52 lá mới xáo (có hạt giống)
 *   - Giữ lá tùy ý, rút thay các lá còn lại từ CÙNG bộ bài đó, trả tiền theo bài cuối
 *   - Hết 25 tay hoặc hết xu thì xong phiên
 *   - holdEVs / bestHold: kỳ vọng chính xác của cả 32 cách giữ (đếm theo bộ bậc + sửa riêng phần thùng),
 *     dùng cho gợi ý giữ bài
 *   Hàm thuần: nhận trạng thái cũ, trả trạng thái mới; toJSON / fromJSON để lưu ván (từ chối dữ liệu hỏng).
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const START_CREDITS = 100;
  const HANDS = 25;
  const MAX_BET = 5;
  const CARDS_IN_HAND = 5;

  /** Loại tay ăn tiền, theo thứ tự bảng trả (cao xuống thấp). */
  const CATS = ['royal', 'sflush', 'quads', 'full', 'flush', 'straight', 'trips', 'twopair', 'jacks'];
  /** Tiền trả mỗi xu cược (bảng 9/6). Thùng phá sảnh lớn: 250 / xu, riêng cược đủ 5 xu là 800 / xu (= 4000). */
  const PAY = { royal: 250, sflush: 50, quads: 25, full: 9, flush: 6, straight: 4, trips: 3, twopair: 2, jacks: 1 };
  const ROYAL_MAX = 800;
  /** Xu tối đa cuối phiên: 25 tay, mỗi tay lãi tối đa 4000 − 5 (cược 5 ra thùng phá sảnh lớn). */
  const MAX_SCORE = START_CREDITS + HANDS * (ROYAL_MAX * MAX_BET - MAX_BET);

  /** Tiền trả mỗi xu khi cược `bet` xu. */
  const perCredit = (c, bet) => (c === 'royal' && bet === MAX_BET ? ROYAL_MAX : PAY[c] || 0);
  /** Tiền nhận về (đã gồm tiền cược) khi bài cuối là `c` (null = không ăn). */
  const payout = (c, bet) => (c ? perCredit(c, bet) * bet : 0);
  function payTable(bet) {
    const out = {};
    CATS.forEach((c) => { out[c] = payout(c, bet); });
    return out;
  }

  /* ---------------- Chấm bài ---------------- */

  /** Thứ hạng tính sảnh: A = 14 (A cao); sảnh A-2-3-4-5 xử lý riêng. */
  const hi = (r) => (r === 1 ? 14 : r);

  /** 5 bậc khác nhau (mảng 1..13) có phải sảnh không. Không vòng qua A (Q-K-A-2-3 không là sảnh). */
  function isStraightRanks(ranks) {
    const h = ranks.map(hi).sort((a, b) => a - b);
    if (h[4] - h[0] === 4) return true;
    return h[0] === 2 && h[1] === 3 && h[2] === 4 && h[3] === 5 && h[4] === 14; // A-2-3-4-5
  }

  /** Tiền mỗi xu theo bộ đếm bậc (counts[1..13]) khi bài KHÔNG đồng chất. */
  function nonFlushCat(counts) {
    let pairs = 0;
    let trips = 0;
    let quads = 0;
    let highPair = false;
    for (let r = 1; r <= 13; r++) {
      const n = counts[r];
      if (n === 2) {
        pairs++;
        if (r === 1 || r >= 11) highPair = true;
      } else if (n === 3) trips++;
      else if (n === 4) quads++;
    }
    if (quads) return 'quads';
    if (trips && pairs) return 'full';
    if (trips) return 'trips';
    if (pairs === 2) return 'twopair';
    if (pairs === 1) return highPair ? 'jacks' : null;
    const ranks = [];
    for (let r = 1; r <= 13; r++) if (counts[r]) ranks.push(r);
    return isStraightRanks(ranks) ? 'straight' : null;
  }

  /** Loại tay của 5 bậc khác nhau CÙNG chất. */
  function flushCat(ranks) {
    if (!isStraightRanks(ranks)) return 'flush';
    return ranks.indexOf(1) >= 0 && ranks.indexOf(13) >= 0 ? 'royal' : 'sflush';
  }

  /** Chấm 5 lá: trả một trong CATS hoặc null (không ăn). */
  function evaluate(cards) {
    const counts = new Array(14).fill(0);
    cards.forEach((c) => { counts[c.rank]++; });
    const flush = cards.every((c) => c.suit === cards[0].suit);
    if (flush) return flushCat(cards.map((c) => c.rank));
    return nonFlushCat(counts);
  }

  /** Chỉ số các lá làm nên tay ăn tiền (để tô sáng): đôi / sám / tứ quý chỉ các lá cùng bậc, còn lại cả 5 lá. */
  function winningCards(cards) {
    const c = evaluate(cards);
    if (!c) return [];
    const all = [0, 1, 2, 3, 4];
    if (c === 'quads' || c === 'trips' || c === 'twopair' || c === 'jacks') {
      const counts = new Array(14).fill(0);
      cards.forEach((x) => { counts[x.rank]++; });
      const min = c === 'jacks' || c === 'twopair' ? 2 : c === 'trips' ? 3 : 4;
      return all.filter((i) => counts[cards[i].rank] >= min);
    }
    return all;
  }

  /* ---------------- Kỳ vọng từng cách giữ ---------------- */

  const BINOM = [];
  for (let n = 0; n <= 52; n++) {
    BINOM[n] = [];
    for (let k = 0; k <= n; k++) BINOM[n][k] = k === 0 || k === n ? 1 : BINOM[n - 1][k - 1] + BINOM[n - 1][k];
  }

  // Bảng sảnh theo mặt nạ bậc (bit r = có bậc r, 1..13): 10 sảnh, kể cả A-2-3-4-5 và 10-J-Q-K-A
  const STRAIGHT = new Uint8Array(1 << 14);
  for (let low = 1; low <= 10; low++) {
    let m = 0;
    for (let r = low; r < low + 5; r++) m |= 1 << (r === 14 ? 1 : r);
    STRAIGHT[m] = 1;
  }
  const ROYAL_BITS = (1 << 1) | (1 << 10) | (1 << 11) | (1 << 12) | (1 << 13);

  // Bộ nhớ nháp dùng chung cho phép đếm (tránh cấp phát trong vòng lặp nóng)
  const av = new Int8Array(14); // số lá mỗi bậc còn trong 47 lá chưa chia
  const P = new Float64Array(CATS.length); // tiền mỗi xu theo chỉ số trong CATS
  const pools = [0, 1, 2, 3].map(() => new Int8Array(13)); // bậc còn lại của từng chất
  const poolLens = new Int8Array(4);
  let pool = pools[0];
  let poolLen = 0;
  let acc = 0;

  // Số lá giữ mỗi bậc, và phần đóng góp của các bậc từ r tới 13 khi chỉ có lá giữ (tính sẵn cho mỗi cách giữ)
  const hc = new Int8Array(15);
  const sufPairs = new Int8Array(15);
  const sufTrips = new Int8Array(15);
  const sufQuads = new Int8Array(15);
  const sufHigh = new Int8Array(15);
  const sufBits = new Int32Array(15);

  /** Tiền mỗi xu theo thống kê bậc của bài cuối (coi như không đồng chất). */
  function payOf(pairs, trips, quads, high, bm) {
    if (quads) return P[2];
    if (trips) return pairs ? P[3] : P[6];
    if (pairs === 2) return P[7];
    if (pairs === 1) return high ? P[8] : 0;
    return STRAIGHT[bm] ? P[5] : 0;
  }

  /**
   * Bước 1: duyệt số lá rút ở từng bậc r = 1..13 (k lá trong av[r] lá còn lại), trọng số w = tích C(av[r], k).
   * Thống kê đôi / sám / tứ quý / mặt nạ bậc được cộng dồn khi đi xuống, nên lá cuối chỉ tốn O(1).
   */
  function recRanks(r, left, w, pairs, trips, quads, high, bm) {
    if (left === 0) {
      acc += w * payOf(pairs + sufPairs[r], trips + sufTrips[r], quads + sufQuads[r], high | sufHigh[r], bm | sufBits[r]);
      return;
    }
    if (r > 13) return;
    const a = av[r];
    const max = left < a ? left : a;
    for (let k = r === 13 ? left : 0; k <= max; k++) {
      const n = hc[r] + k;
      if (n === 0) recRanks(r + 1, left, w, pairs, trips, quads, high, bm);
      else {
        recRanks(r + 1, left - k, w * BINOM[a][k],
          pairs + (n === 2 ? 1 : 0), trips + (n === 3 ? 1 : 0), quads + (n === 4 ? 1 : 0),
          high | (n === 2 && (r === 1 || r >= 11) ? 1 : 0), bm | (1 << r));
      }
    }
  }

  /** Bước 2: các tổ hợp rút cùng chất với mọi lá giữ; cộng (tiền thùng − tiền đã tính ở bước 1). */
  function recFlush(start, left, bm) {
    if (left === 0) {
      const st = STRAIGHT[bm];
      const flushPay = st ? (bm === ROYAL_BITS ? P[0] : P[1]) : P[4];
      acc += flushPay - (st ? P[5] : 0);
      return;
    }
    for (let i = start; i <= poolLen - left; i++) recFlush(i + 1, left - 1, bm | (1 << pool[i]));
  }

  /**
   * Kỳ vọng (tiền trả mỗi xu cược) của cả 32 cách giữ; bit i của chỉ số = giữ lá thứ i.
   * Tính chính xác, không lấy mẫu:
   *   1. Coi như không có thùng: duyệt mọi BỘ BẬC của các lá rút (bậc r lấy k lá trong số lá bậc r còn lại),
   *      trọng số = tích C(còn lại của bậc r, k). Rút 5 lá chỉ có 6175 bộ bậc thay vì 1.533.939 tổ hợp lá.
   *   2. Sửa phần thùng: khi mọi lá giữ cùng chất s, duyệt riêng các tổ hợp rút toàn chất s.
   * Lá đã bỏ không quay lại bộ: bộ rút là 47 lá chưa chia. Kết quả khớp duyệt hết từng lá (test.js).
   */
  function holdEVs(cards, bet) {
    const b = bet || MAX_BET;
    CATS.forEach((c, i) => { P[i] = perCredit(c, b); });
    av.fill(4);
    cards.forEach((c) => { av[c.rank]--; });
    C.SUITS.forEach((S, s) => {
      poolLens[s] = 0;
      for (let r = 1; r <= 13; r++) {
        if (!cards.some((c) => c.rank === r && c.suit === S)) pools[s][poolLens[s]++] = r;
      }
    });
    const out = new Array(32);
    for (let mask = 0; mask < 32; mask++) {
      hc.fill(0);
      let need = CARDS_IN_HAND;
      let suit = null; // chất chung của các lá giữ ('' nếu khác chất)
      let bm = 0;
      for (let i = 0; i < CARDS_IN_HAND; i++) {
        if (!(mask & (1 << i))) continue;
        const c = cards[i];
        hc[c.rank]++;
        bm |= 1 << c.rank;
        need--;
        suit = suit === null || suit === c.suit ? c.suit : '';
      }
      sufPairs[14] = sufTrips[14] = sufQuads[14] = sufHigh[14] = sufBits[14] = 0;
      for (let r = 13; r >= 1; r--) {
        const n = hc[r];
        sufPairs[r] = sufPairs[r + 1] + (n === 2 ? 1 : 0);
        sufTrips[r] = sufTrips[r + 1] + (n === 3 ? 1 : 0);
        sufQuads[r] = sufQuads[r + 1] + (n === 4 ? 1 : 0);
        sufHigh[r] = sufHigh[r + 1] | (n === 2 && (r === 1 || r >= 11) ? 1 : 0);
        sufBits[r] = sufBits[r + 1] | (n ? 1 << r : 0);
      }
      acc = 0;
      recRanks(1, need, 1, 0, 0, 0, 0, 0);
      for (let s = 0; s < 4; s++) {
        const S = C.SUITS[s];
        if (suit !== null && suit !== S) continue;
        pool = pools[s];
        poolLen = poolLens[s];
        recFlush(0, need, bm);
      }
      out[mask] = acc / BINOM[52 - CARDS_IN_HAND][need];
    }
    return out;
  }

  /** Cách giữ có kỳ vọng cao nhất: { mask, held: [bool × 5], ev }. Hòa thì chọn cách giữ nhiều lá hơn. */
  function bestHold(cards, bet) {
    const evs = holdEVs(cards, bet);
    const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1);
    let best = 0;
    for (let m = 1; m < 32; m++) {
      const d = evs[m] - evs[best];
      if (d > 1e-9 || (d > -1e-9 && bits(m) > bits(best))) best = m;
    }
    return { mask: best, held: [0, 1, 2, 3, 4].map((i) => !!(best & (1 << i))), ev: evs[best] };
  }

  /* ---------------- Luồng phiên ---------------- */

  const NO_HOLD = () => [false, false, false, false, false];

  /** Ván mới. seed: số nguyên 32 bit (app truyền số ngẫu nhiên). */
  function newGame(seed) {
    return {
      rng: (Number(seed) >>> 0),
      credits: START_CREDITS,
      bet: MAX_BET,
      hands: 0, // số tay đã xong
      phase: 'bet', // 'bet': chờ đặt cược / chia; 'hold': đã chia, chờ giữ lá rồi rút
      hand: [],
      held: NO_HOLD(),
      handRng: null, // trạng thái rng ngay trước khi xáo bộ bài của tay đang chơi
      deck: null, // bộ bài đã xáo của tay đang chơi (chỉ trong bộ nhớ, không lưu)
      last: null, // kết quả tay vừa xong: { cat, pay, bet, hand: [id] }
      best: null, // tay đẹp nhất của phiên
      assisted: false,
    };
  }

  const isOver = (g) => g.phase === 'bet' && (g.hands >= HANDS || g.credits <= 0);
  const started = (g) => g.hands > 0 || g.phase === 'hold';
  /** Số tay còn được chia (tay đang chơi dở đã tính là đã chia). */
  const handsLeft = (g) => HANDS - g.hands - (g.phase === 'hold' ? 1 : 0);
  const canDeal = (g) => g.phase === 'bet' && !isOver(g) && g.bet >= 1 && g.bet <= g.credits;

  /** Đặt cược n xu (kẹp vào 1..5 và không quá số xu đang có). Chỉ đổi được khi chưa chia. */
  function setBet(g, n) {
    if (g.phase !== 'bet' || isOver(g)) return g;
    const bet = Math.max(1, Math.min(MAX_BET, g.credits, Math.floor(n) || 1));
    return bet === g.bet ? g : Object.assign({}, g, { bet });
  }
  /** Bet One: tăng 1 xu, quá 5 (hoặc quá số xu) thì quay về 1. */
  const betOne = (g) => setBet(g, g.bet + 1 > Math.min(MAX_BET, g.credits) ? 1 : g.bet + 1);
  const betMax = (g) => setBet(g, MAX_BET);

  /** Xáo bộ bài của một tay từ trạng thái rng; trả { deck, after } (after = trạng thái rng sau khi xáo). */
  function shuffleFrom(state) {
    const r = C.rng(0);
    r.setState(state);
    const deck = C.shuffle(C.newDeck(), r);
    return { deck, after: r.getState() };
  }

  /** Chia: trừ cược, xáo bộ bài mới, lấy 5 lá đầu. */
  function deal(g) {
    if (!canDeal(g)) return g;
    const { deck, after } = shuffleFrom(g.rng);
    return Object.assign({}, g, {
      credits: g.credits - g.bet,
      phase: 'hold',
      hand: deck.slice(0, CARDS_IN_HAND),
      held: NO_HOLD(),
      handRng: g.rng,
      rng: after,
      deck,
      last: null,
    });
  }

  function toggleHold(g, i) {
    if (g.phase !== 'hold' || !(i >= 0 && i < CARDS_IN_HAND)) return g;
    const held = g.held.slice();
    held[i] = !held[i];
    return Object.assign({}, g, { held });
  }

  /** Đặt cả bộ lá giữ một lần (áp gợi ý). */
  function setHeld(g, held) {
    if (g.phase !== 'hold') return g;
    return Object.assign({}, g, { held: [0, 1, 2, 3, 4].map((i) => !!held[i]) });
  }

  /** Rút: thay các lá không giữ bằng lá kế tiếp trong bộ (lá thứ 6, 7, …), trả tiền, sang tay sau. */
  function draw(g) {
    if (g.phase !== 'hold') return g;
    const deck = g.deck || shuffleFrom(g.handRng).deck;
    let next = CARDS_IN_HAND;
    const hand = g.hand.map((c, i) => (g.held[i] ? c : deck[next++]));
    const cat = evaluate(hand);
    const pay = payout(cat, g.bet);
    const credits = g.credits + pay;
    const best = cat && (!g.best || CATS.indexOf(cat) < CATS.indexOf(g.best)) ? cat : g.best;
    return Object.assign({}, g, {
      credits,
      // Còn ít xu hơn mức cược thì hạ cược xuống số xu còn lại
      bet: credits > 0 ? Math.min(g.bet, credits) : g.bet,
      hands: g.hands + 1,
      phase: 'bet',
      hand,
      held: NO_HOLD(),
      handRng: null,
      deck: null,
      last: { cat, pay, bet: g.bet, hand: hand.map(C.toId) },
      best,
    });
  }

  const markAssisted = (g) => (g.assisted ? g : Object.assign({}, g, { assisted: true }));

  /* ---------------- Lưu / khôi phục ---------------- */

  /** Không lưu bộ bài: tay đang chơi được dựng lại từ handRng (không lộ sẵn các lá sắp rút trong localStorage). */
  function toJSON(g) {
    const o = {
      v: VERSION,
      rng: g.rng,
      credits: g.credits,
      bet: g.bet,
      hands: g.hands,
      phase: g.phase,
      held: g.held.slice(),
      last: g.last,
      best: g.best,
      assisted: g.assisted,
    };
    if (g.phase === 'hold') {
      o.handRng = g.handRng;
      o.hand = g.hand.map(C.toId);
    } else {
      o.hand = g.hand.map(C.toId);
    }
    return o;
  }

  const isU32 = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
  const isBools = (a) => Array.isArray(a) && a.length === CARDS_IN_HAND && a.every((x) => typeof x === 'boolean');
  const isCat = (c) => CATS.indexOf(c) >= 0;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    const { rng, credits, bet, hands, phase, held, last, best, assisted } = raw;
    if (!isU32(rng) || !Number.isInteger(credits) || credits < 0 || credits > MAX_SCORE) return null;
    if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) return null;
    if (!Number.isInteger(hands) || hands < 0 || hands > HANDS) return null;
    if (phase !== 'bet' && phase !== 'hold') return null;
    if (!isBools(held) || typeof assisted !== 'boolean') return null;
    if (best !== null && !isCat(best)) return null;
    // Xu không thể vượt mức lãi tối đa của số tay đã chơi
    if (credits > START_CREDITS + hands * (ROYAL_MAX * MAX_BET - MAX_BET)) return null;
    if (!Array.isArray(raw.hand)) return null;
    const hand = raw.hand.map(C.fromId);
    if (hand.some((c) => !c)) return null;
    if (new Set(raw.hand.map((id) => C.toId(C.fromId(id)))).size !== hand.length) return null;
    if (last !== null) {
      if (!last || typeof last !== 'object' || !Number.isInteger(last.bet) || last.bet < 1 || last.bet > MAX_BET) return null;
      if (last.cat !== null && !isCat(last.cat)) return null;
      if (last.pay !== payout(last.cat, last.bet)) return null;
      if (!Array.isArray(last.hand) || last.hand.length !== CARDS_IN_HAND || last.hand.some((id) => !C.fromId(id))) return null;
    }
    const g = Object.assign(newGame(0), { rng, credits, bet, hands, phase, held: held.slice(), last, best, assisted, hand });
    if (phase === 'hold') {
      // Tay đang chơi: phải khớp đúng bộ bài xáo từ handRng, và rng phải là trạng thái ngay sau lần xáo đó
      if (hands >= HANDS || !isU32(raw.handRng) || hand.length !== CARDS_IN_HAND) return null;
      const { deck, after } = shuffleFrom(raw.handRng);
      if (after !== rng || hand.some((c, i) => C.toId(c) !== C.toId(deck[i]))) return null;
      g.handRng = raw.handRng;
      g.deck = deck;
    } else {
      if (hand.length !== 0 && hand.length !== CARDS_IN_HAND) return null;
      if (held.some(Boolean)) return null;
      if (hands === 0 && (hand.length || last)) return null;
    }
    return g;
  }

  const api = {
    START_CREDITS, HANDS, MAX_BET, CATS, PAY, ROYAL_MAX, MAX_SCORE,
    evaluate, winningCards, payout, payTable, holdEVs, bestHold,
    newGame, isOver, started, handsLeft, canDeal, setBet, betOne, betMax, deal, toggleHold, setHeld, draw, markAssisted,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
