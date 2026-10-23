/* =====================================================================
 * Xì Dách - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật Blackjack chuẩn sòng bài, một người chơi với nhà cái:
 *   - Hộp 6 bộ (312 lá), xáo có hạt giống; chia ván mới mà hộp còn dưới 25% (78 lá) thì xáo lại
 *   - Hộp bài đi tiếp từ phiên này sang phiên sau (như bàn thật), ván lưu chỉ ghi hạt giống + vị trí
 *   - Nhà cái rút tới khi đủ 17 và dừng ở mọi 17 (kể cả 17 mềm: S17); xem lá úp khi chia, có Xì Dách thì kết thúc ngay
 *   - Xì Dách trả 3:2 (làm tròn xuống chip nguyên); gấp đôi với 2 lá đầu bất kỳ (cả sau khi tách);
 *     tách đôi một lần (hai lá cùng điểm), tách át thì mỗi tay nhận đúng một lá; không đầu hàng, không bảo hiểm
 *   - Phiên: 1000 chip, 10 ván, cược 10..200; còn dưới 10 chip thì hết phiên sớm
 *   Trạng thái là đối tượng thường; mọi hàm nhận trạng thái cũ và trả trạng thái mới (hộp bài dùng chung, không sửa)
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const DECKS = 6;
  const SHOE_SIZE = 52 * DECKS;
  const CUT = SHOE_SIZE / 4; // còn ít hơn số lá này khi chia ván mới thì xáo lại
  const START_CHIPS = 1000;
  const HANDS = 10;
  const MIN_BET = 10;
  const MAX_BET = 200;
  const CHIPS = [10, 25, 50, 100];
  const RESULTS = ['win', 'bj', 'push', 'lose', 'bust'];

  /* ---------------- Điểm bài ---------------- */

  /** Điểm một lá: át 1 (tính 11 ở handValue), J / Q / K 10. */
  const points = (c) => (c.rank >= 10 ? 10 : c.rank);

  /** { total, soft, hard }: soft = có một át đang tính 11 mà không quá 21; hard = tính mọi át là 1. */
  function handValue(cards) {
    let hard = 0;
    let ace = false;
    for (let i = 0; i < cards.length; i++) {
      hard += points(cards[i]);
      if (cards[i].rank === 1) ace = true;
    }
    const soft = ace && hard + 10 <= 21;
    return { total: soft ? hard + 10 : hard, soft, hard };
  }

  /** Nhãn tổng điểm: bài mềm dưới 21 hiện cả hai cách ("7/17"), còn lại một số. */
  function totalLabel(cards) {
    if (!cards.length) return '';
    const v = handValue(cards);
    return v.soft && v.total < 21 ? v.hard + '/' + v.total : String(v.total);
  }

  /** Hai lá đầu ra 21 (át + lá 10 điểm). */
  const isNatural = (cards) => cards.length === 2 && handValue(cards).total === 21;
  /** Xì Dách của người chơi: 21 hai lá đầu, không phải tay tách (tách rồi ra 21 chỉ là 21 thường). */
  const isBlackjack = (hand) => !hand.split && isNatural(hand.cards);
  /** Nhà cái rút khi dưới 17; dừng ở mọi 17, kể cả 17 mềm (S17). */
  const dealerHits = (cards) => handValue(cards).total < 17;

  /* ---------------- Hộp bài ---------------- */

  /** Hộp bài mới xáo từ trạng thái rng `state`; trả { shoe, rng: trạng thái sau khi xáo }. */
  function buildShoe(state) {
    const r = C.rng();
    r.setState(state);
    const shoe = C.shuffle(C.newDeck({ decks: DECKS }), r);
    return { shoe, rng: r.getState() };
  }

  /** Xáo hộp mới (sửa trực tiếp `n`, là bản sao đang dựng trong một hàm). */
  function reshuffle(n) {
    const b = buildShoe(n.rng);
    n.shoeRng = n.rng;
    n.shoe = b.shoe;
    n.rng = b.rng;
    n.pos = 0;
    n.shuffles++;
  }

  function draw(n) {
    if (n.pos >= n.shoe.length) reshuffle(n); // phòng hờ: một ván không bao giờ dùng hết 78 lá
    return n.shoe[n.pos++];
  }

  const remaining = (g) => g.shoe.length - g.pos;

  /* ---------------- Phiên ---------------- */

  function seedState(seed) {
    return C.rng(seed).getState();
  }

  /**
   * Phiên mới: 1000 chip, chưa chia ván nào.
   *   opts.prev: phiên trước (đi tiếp hộp bài của nó); không có thì opts.seed (số / chuỗi / bỏ trống = ngẫu nhiên)
   */
  function newSession(opts) {
    const o = opts || {};
    let shoe;
    let shoeRng;
    let rng;
    let pos = 0;
    let shuffles = 0;
    if (o.prev && o.prev.shoe) {
      ({ shoe, shoeRng, rng, pos, shuffles } = o.prev);
    } else {
      shoeRng = seedState(o.seed);
      const b = buildShoe(shoeRng);
      shoe = b.shoe;
      rng = b.rng;
    }
    return {
      shoe, shoeRng, rng, pos, shuffles,
      chips: START_CHIPS,
      round: 0, // số ván đã chia (1..10)
      phase: 'bet', // 'bet' chờ cược | 'play' đang chơi | 'over' hết phiên
      lastBet: 0,
      dealer: [],
      hands: [],
      active: 0,
      log: [], // mỗi ván đã xong: [lãi / lỗ, 'win' | 'bj' | 'push' | 'lose']
    };
  }

  /** Bản sao để sửa trong một hàm (hộp bài dùng chung, không bao giờ sửa mảng hộp). */
  function clone(g) {
    return Object.assign({}, g, {
      dealer: g.dealer.slice(),
      hands: g.hands.map((h) => Object.assign({}, h, { cards: h.cards.slice() })),
      log: g.log.slice(),
    });
  }

  const started = (g) => g.round > 0;
  const isOver = (g) => g.phase === 'over';
  const won = (g) => g.phase === 'over' && g.chips > START_CHIPS;
  const maxBet = (g) => Math.min(MAX_BET, g.chips);

  function canDeal(g, bet) {
    return g.phase === 'bet' && g.round < HANDS && Number.isInteger(bet) && bet >= MIN_BET && bet <= maxBet(g);
  }

  function newHand(bet, split) {
    return { cards: [], bet, split: !!split, doubled: false, done: false, result: null, net: 0 };
  }

  /** Chia ván mới với mức cược `bet`: người, nhà cái, người, nhà cái (lá thứ hai của nhà cái úp). */
  function deal(g, bet) {
    if (!canDeal(g, bet)) return g;
    const n = clone(g);
    if (remaining(n) < CUT) reshuffle(n);
    n.chips -= bet;
    n.lastBet = bet;
    n.round++;
    n.phase = 'play';
    n.dealer = [];
    n.hands = [newHand(bet)];
    n.active = 0;
    n.hands[0].cards.push(draw(n));
    n.dealer.push(draw(n));
    n.hands[0].cards.push(draw(n));
    n.dealer.push(draw(n));
    // Nhà cái xem lá úp: có Xì Dách thì lật luôn; người chơi Xì Dách thì cũng tính tiền ngay
    if (isNatural(n.dealer) || isBlackjack(n.hands[0])) {
      n.hands[0].done = true;
      settle(n);
    }
    return n;
  }

  const current = (g) => (g.phase === 'play' ? g.hands[g.active] : null);

  function canHit(g) {
    const h = current(g);
    return !!h && !h.done;
  }
  function canDouble(g) {
    const h = current(g);
    return !!h && !h.done && h.cards.length === 2 && g.chips >= h.bet;
  }
  function canSplit(g) {
    const h = current(g);
    return !!h && !h.done && g.hands.length === 1 && h.cards.length === 2 &&
      points(h.cards[0]) === points(h.cards[1]) && g.chips >= h.bet;
  }
  /** Nước đi được ở lượt hiện tại (để bật / tắt nút). */
  function actions(g) {
    return { hit: canHit(g), stand: canHit(g), double: canDouble(g), split: canSplit(g) };
  }

  /** Tay vừa nhận lá: quá 21 hoặc đúng 21 thì xong. */
  function checkHand(h) {
    if (handValue(h.cards).total >= 21) h.done = true;
  }

  /** Chuyển sang tay kế (tay tách nhận lá thứ hai khi tới lượt); hết tay thì nhà cái chơi và tính tiền. */
  function advance(n) {
    while (n.hands[n.active].done) {
      if (n.active + 1 >= n.hands.length) {
        dealerPlay(n);
        settle(n);
        return;
      }
      n.active++;
      const h = n.hands[n.active];
      if (h.cards.length < 2) {
        h.cards.push(draw(n));
        checkHand(h);
      }
    }
  }

  function hit(g) {
    if (!canHit(g)) return g;
    const n = clone(g);
    const h = n.hands[n.active];
    h.cards.push(draw(n));
    checkHand(h);
    advance(n);
    return n;
  }

  function stand(g) {
    if (!canHit(g)) return g;
    const n = clone(g);
    n.hands[n.active].done = true;
    advance(n);
    return n;
  }

  /** Gấp đôi: thêm một khoản cược bằng cược đang có, nhận đúng một lá rồi dừng. */
  function double(g) {
    if (!canDouble(g)) return g;
    const n = clone(g);
    const h = n.hands[n.active];
    n.chips -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(n));
    h.done = true;
    advance(n);
    return n;
  }

  /** Tách đôi: hai tay, mỗi tay một lá + cược bằng cược gốc. Tay 1 nhận lá ngay; tách át thì cả hai nhận một lá rồi dừng. */
  function split(g) {
    if (!canSplit(g)) return g;
    const n = clone(g);
    const h = n.hands[0];
    const aces = h.cards[0].rank === 1;
    n.chips -= h.bet;
    const a = newHand(h.bet, true);
    const b = newHand(h.bet, true);
    a.cards.push(h.cards[0]);
    b.cards.push(h.cards[1]);
    n.hands = [a, b];
    n.active = 0;
    a.cards.push(draw(n));
    if (aces) {
      b.cards.push(draw(n));
      a.done = true;
      b.done = true;
    } else {
      checkHand(a);
    }
    advance(n);
    return n;
  }

  /** Nhà cái rút theo S17; mọi tay đều quắc thì chỉ lật lá úp. */
  function dealerPlay(n) {
    if (n.hands.every((h) => handValue(h.cards).total > 21)) return;
    while (dealerHits(n.dealer)) n.dealer.push(draw(n));
  }

  /** Tính tiền từng tay, ghi kết quả ván, sang chờ cược hoặc hết phiên. */
  function settle(n) {
    const d = handValue(n.dealer).total;
    const dealerBJ = isNatural(n.dealer);
    let net = 0;
    let anyBJ = false;
    n.hands.forEach((h) => {
      const p = handValue(h.cards).total;
      let pay; // tiền trả lại (gồm cả cược)
      if (isBlackjack(h) && !dealerBJ) {
        h.result = 'bj';
        pay = h.bet + Math.floor(h.bet * 1.5);
        anyBJ = true;
      } else if (dealerBJ) {
        h.result = isBlackjack(h) ? 'push' : 'lose';
        pay = isBlackjack(h) ? h.bet : 0;
      } else if (p > 21) {
        h.result = 'bust';
        pay = 0;
      } else if (d > 21 || p > d) {
        h.result = 'win';
        pay = 2 * h.bet;
      } else if (p === d) {
        h.result = 'push';
        pay = h.bet;
      } else {
        h.result = 'lose';
        pay = 0;
      }
      h.done = true;
      h.net = pay - h.bet;
      net += h.net;
      n.chips += pay;
    });
    n.log.push([net, anyBJ ? 'bj' : net > 0 ? 'win' : net < 0 ? 'lose' : 'push']);
    n.phase = n.round >= HANDS || n.chips < MIN_BET ? 'over' : 'bet';
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toIds = (cards) => cards.map(C.toId);

  function toJSON(g) {
    return {
      v: VERSION,
      shoeRng: g.shoeRng,
      rng: g.rng,
      pos: g.pos,
      shuffles: g.shuffles,
      chips: g.chips,
      round: g.round,
      phase: g.phase,
      lastBet: g.lastBet,
      dealer: toIds(g.dealer),
      hands: g.hands.map((h) => ({ c: toIds(h.cards), bet: h.bet, dbl: h.doubled, sp: h.split, done: h.done, res: h.result, net: h.net })),
      active: g.active,
      log: g.log.map((x) => x.slice()),
    };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isU32 = (x) => isInt(x, 0, 4294967295);

  function cardsFrom(list) {
    if (!Array.isArray(list)) return null;
    const out = list.map((id) => (typeof id === 'string' ? C.fromId(id) : null));
    return out.every(Boolean) ? out : null;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app mở phiên mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    const { shoeRng, rng, pos, shuffles, chips, round, phase, lastBet, active, log } = raw;
    if (!isU32(shoeRng) || !isU32(rng) || !isInt(pos, 0, SHOE_SIZE) || !isInt(shuffles, 0, 1e9)) return null;
    if (!isInt(chips, 0, 1e9) || !isInt(round, 0, HANDS) || !isInt(lastBet, 0, MAX_BET)) return null;
    if (['bet', 'play', 'over'].indexOf(phase) < 0) return null;
    if (phase === 'play' && round < 1) return null;
    if (phase === 'over' && round < 1) return null;
    // Nhật ký: một dòng mỗi ván đã tính tiền
    if (!Array.isArray(log) || log.length !== (phase === 'play' ? round - 1 : round)) return null;
    if (!log.every((x) => Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && ['win', 'bj', 'push', 'lose'].indexOf(x[1]) >= 0)) return null;
    const dealer = cardsFrom(raw.dealer);
    if (!dealer || !Array.isArray(raw.hands) || raw.hands.length > 2) return null;
    const hands = [];
    for (let i = 0; i < raw.hands.length; i++) {
      const h = raw.hands[i];
      if (!h || typeof h !== 'object') return null;
      const cards = cardsFrom(h.c);
      if (!cards || !cards.length || !isInt(h.bet, MIN_BET, 2 * MAX_BET)) return null;
      if (typeof h.dbl !== 'boolean' || typeof h.sp !== 'boolean' || typeof h.done !== 'boolean') return null;
      if (!(h.res === null || RESULTS.indexOf(h.res) >= 0) || !Number.isInteger(h.net)) return null;
      hands.push({ cards, bet: h.bet, split: h.sp, doubled: h.dbl, done: h.done, result: h.res, net: h.net });
    }
    if (round > 0 && (!hands.length || dealer.length < 2)) return null;
    if (round === 0 && (hands.length || dealer.length)) return null;
    if (hands.length === 2 && !(hands[0].split && hands[1].split)) return null;
    if (!isInt(active, 0, Math.max(0, hands.length - 1))) return null;
    // Đang chơi: nhà cái đúng 2 lá, tay đang tới lượt có ít nhất 2 lá và chưa xong
    if (phase === 'play' && (dealer.length !== 2 || hands[active].done || hands[active].cards.length < 2)) return null;
    if (phase === 'play' && (pos < 4 || hands.some((h) => h.result !== null))) return null;
    const b = buildShoe(shoeRng);
    return {
      shoe: b.shoe, shoeRng, rng, pos, shuffles, chips, round, phase, lastBet,
      dealer, hands, active,
      log: log.map((x) => x.slice()),
    };
  }

  const api = {
    VERSION, DECKS, SHOE_SIZE, CUT, START_CHIPS, HANDS, MIN_BET, MAX_BET, CHIPS,
    points, handValue, totalLabel, isNatural, isBlackjack, dealerHits,
    newSession, remaining, started, isOver, won, maxBet,
    canDeal, deal, canHit, canDouble, canSplit, actions, hit, stand, double, split,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
