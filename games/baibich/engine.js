/* =====================================================================
 * Bài Bích - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Spades 4 người theo cặp, bộ 52 lá: ghế 0 là bạn (Nam), 1 Tây, 2 Bắc (đồng đội của bạn), 3 Đông;
 *   đi theo chiều kim đồng hồ (0 → 1 → 2 → 3). Đội 0 = ghế 0 + 2, đội 1 = ghế 1 + 3.
 *   - Mỗi người 13 lá. Từ bên trái người chia, mỗi người báo số nước sẽ ăn (1–13) hoặc Nil (0 = không ăn nước nào)
 *   - Người bên trái người chia dẫn nước đầu. Phải ra theo chất được dẫn nếu có; hết chất thì ra lá bất kỳ
 *   - Bích là chủ: nước có bích thì bích to nhất ăn, không thì lá to nhất của chất được dẫn ăn (A to nhất)
 *   - Không được dẫn bích khi bích chưa "vỡ" (chưa ai ra bích), trừ khi trên tay chỉ còn bích
 *   - Tính điểm mỗi ván (theo đội): hợp đồng = tổng số báo (trừ Nil) của hai người, nước ăn = tổng nước cả hai
 *       đạt: +10 × hợp đồng, mỗi nước thừa là 1 "túi" (+1 điểm); trượt: −10 × hợp đồng
 *       Nil: +100 nếu người báo Nil không ăn nước nào, −100 nếu ăn (nước họ ăn vẫn tính cho đội)
 *       Gom đủ 10 túi: −100 và trừ 10 túi
 *   - Hết ván mà có đội chạm mốc (300 / 500) hoặc tụt tới −200 thì đội điểm cao hơn thắng trận; bằng điểm thì đánh tiếp
 *   Lá lưu bằng id của ../_kit/cards.js ('AS', '10H', 'KD'); hàm nào cũng trả trạng thái mới, không đụng trạng thái cũ.
 *   PRNG (mulberry32 của cards.js) nằm trong trạng thái (rng) nên tải lại trang vẫn ra đúng lá cũ.
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SEATS = 4;
  const HUMAN = 0;
  const PARTNER = 2;
  const HAND = 13;
  const FLOOR = -200; // đội tụt tới mức này thì trận kết thúc
  const LEVELS = ['easy', 'medium', 'hard'];
  const TARGETS = [300, 500];
  const PHASES = ['bid', 'play', 'hand', 'over'];
  const ALL = C.newDeck().map(C.toId); // thứ tự cố định: xáo từ mảng này

  // Tra nhanh chất + sức mạnh (A = 14) của từng lá: máy và mô phỏng gọi rất nhiều lần
  const INFO = {};
  ALL.forEach((id) => {
    const c = C.fromId(id);
    INFO[id] = { s: c.suit, v: c.rank === 1 ? 14 : c.rank };
  });
  const suitOf = (id) => INFO[id].s;
  const pow = (id) => INFO[id].v;
  const next = (seat) => (seat + 1) % SEATS;
  const partnerOf = (seat) => (seat + 2) % SEATS;
  const teamOf = (seat) => seat % 2;

  /** Bản sao trạng thái, thứ tự khóa cố định (lưu / so sánh dựa vào nó). */
  function clone(g) {
    return {
      level: g.level, // mức của hai máy đối thủ (đồng đội Bắc luôn chơi mức Khó)
      target: g.target,
      scores: g.scores.slice(), // điểm hai đội (đã gồm điểm túi)
      bags: g.bags.slice(), // số túi đang gom của hai đội (0–9)
      handNo: g.handNo, // ván thứ mấy trong trận
      dealer: g.dealer,
      rng: g.rng,
      hands: g.hands.map((h) => h.slice()),
      bids: g.bids.slice(), // null = chưa báo, 0 = Nil
      turn: g.turn,
      lead: g.lead, // người dẫn nước đang đánh
      trick: g.trick.slice(), // lá của nước đang đánh, theo thứ tự ra từ người dẫn
      tricks: g.tricks.slice(), // số nước mỗi người đã ăn trong ván
      broken: g.broken, // bích đã vỡ (đã có người ra bích)
      done: g.done.map((d) => ({ lead: d.lead, cards: d.cards.slice(), win: d.win })), // các nước đã xong trong ván
      phase: g.phase, // bid | play | hand (hết ván, chờ ván sau) | over (hết trận)
      result: g.result ? cloneResult(g.result) : null,
      moves: g.moves, // số nước cả bàn trong trận (báo + ra lá)
      humanMoves: g.humanMoves, // số nước của bạn (bỏ trận khi > 0 tính là thua)
    };
  }
  function cloneResult(r) {
    return { teams: r.teams.map((t) => Object.assign({}, t, { nils: t.nils.map((n) => Object.assign({}, n)) })), winner: r.winner };
  }

  /** Lấy PRNG từ trạng thái, chạy fn(r), ghi trạng thái PRNG mới vào g. */
  function withRng(g, fn) {
    const r = C.rng();
    r.setState(g.rng);
    const out = fn(r);
    g.rng = r.getState();
    return out;
  }

  /** Chia ván mới (trong g, đã là bản sao): xáo 52 lá, chia lần lượt từng lá từ bên trái người chia. */
  function deal(g) {
    withRng(g, (r) => {
      const deck = C.shuffle(ALL, r);
      const hands = [[], [], [], []];
      for (let k = 0; k < HAND * SEATS; k++) hands[(g.dealer + 1 + k) % SEATS].push(deck.pop());
      g.hands = hands;
    });
    g.bids = [null, null, null, null];
    g.turn = next(g.dealer);
    g.lead = g.turn;
    g.trick = [];
    g.tricks = [0, 0, 0, 0];
    g.broken = false;
    g.done = [];
    g.phase = 'bid';
    g.result = null;
    return g;
  }

  /**
   * Trận mới. opts: { seed, level: 'easy' | 'medium' | 'hard', target: 300 | 500 }.
   * Người chia ván 1 là ghế 3 nên bạn (ghế 0) báo trước và dẫn nước đầu.
   */
  function newMatch(opts) {
    const o = opts || {};
    const target = Number(o.target);
    const r = C.rng(o.seed);
    const g = clone({
      level: LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium',
      target: TARGETS.indexOf(target) >= 0 ? target : 300,
      scores: [0, 0],
      bags: [0, 0],
      handNo: 1,
      dealer: SEATS - 1,
      rng: r.getState(),
      hands: [[], [], [], []],
      bids: [null, null, null, null],
      turn: 0,
      lead: 0,
      trick: [],
      tricks: [0, 0, 0, 0],
      broken: false,
      done: [],
      phase: 'bid',
      result: null,
      moves: 0,
      humanMoves: 0,
    });
    return deal(g);
  }

  /* ---------------- Luật ---------------- */

  /** Ghế đã ra lá thứ i của nước đang đánh. */
  const seatAt = (g, i) => (g.lead + i) % SEATS;

  /** Lá a đè được lá b không (b là lá đang thắng nước): cùng chất thì to hơn, khác chất thì a phải là bích. */
  function beats(a, b) {
    const sa = suitOf(a);
    if (sa === suitOf(b)) return pow(a) > pow(b);
    return sa === 'S';
  }

  /** Chỉ số lá thắng trong một nước (mảng lá theo thứ tự ra). */
  function winningIndex(cards) {
    let w = 0;
    for (let i = 1; i < cards.length; i++) if (beats(cards[i], cards[w])) w = i;
    return w;
  }
  const trickWinner = (lead, cards) => (lead + winningIndex(cards)) % SEATS;

  /** Các lá người tới lượt được ra (đúng thứ tự trên tay). */
  function legalPlays(g) {
    if (!g || g.phase !== 'play') return [];
    const hand = g.hands[g.turn];
    if (g.trick.length) {
      const led = suitOf(g.trick[0]);
      const follow = hand.filter((id) => suitOf(id) === led);
      return follow.length ? follow : hand.slice();
    }
    if (!g.broken) {
      const side = hand.filter((id) => suitOf(id) !== 'S');
      if (side.length) return side;
    }
    return hand.slice();
  }
  const isLegal = (g, id) => legalPlays(g).indexOf(id) >= 0;

  const isBid = (n) => Number.isInteger(n) && n >= 0 && n <= HAND;

  /** Báo số nước (0 = Nil) cho người đang tới lượt. Sai luật thì ném lỗi. */
  function bid(g, n) {
    if (g.phase !== 'bid' || !isBid(n)) throw new Error('bad bid');
    const out = clone(g);
    out.bids[out.turn] = n;
    out.moves++;
    if (out.turn === HUMAN) out.humanMoves++;
    out.turn = next(out.turn);
    // Báo đủ bốn người: vòng báo bắt đầu từ bên trái người chia nên lượt đã quay về người dẫn nước đầu
    if (out.bids.every((b) => b !== null)) out.phase = 'play';
    return out;
  }

  /** Ra một lá. Đủ 4 lá thì xác định người ăn; hết 13 nước thì tính điểm ván. Sai luật thì ném lỗi. */
  function play(g, id) {
    if (g.phase !== 'play' || !isLegal(g, id)) throw new Error('illegal play');
    const out = clone(g);
    const seat = out.turn;
    out.hands[seat].splice(out.hands[seat].indexOf(id), 1);
    out.trick.push(id);
    if (suitOf(id) === 'S') out.broken = true;
    out.moves++;
    if (seat === HUMAN) out.humanMoves++;
    if (out.trick.length < SEATS) {
      out.turn = next(seat);
      return out;
    }
    const win = trickWinner(out.lead, out.trick);
    out.tricks[win]++;
    out.done.push({ lead: out.lead, cards: out.trick, win });
    out.trick = [];
    out.lead = win;
    out.turn = win;
    if (out.done.length === HAND) finishHand(out);
    return out;
  }

  /**
   * Điểm một ván cho hai đội (hàm thuần, test trực tiếp được).
   * bids / tricks: 4 ghế; bags: số túi đang có của hai đội. Trả mảng 2 phần tử:
   * { bid, took, made (null khi cả hai Nil), base, over, nils: [{ seat, ok }], nil, penalty, delta, bags }.
   */
  function scoreHand(bids, tricks, bags) {
    return [0, 1].map((t) => {
      const seats = [t, t + 2];
      const contract = seats.reduce((s, x) => s + (bids[x] > 0 ? bids[x] : 0), 0);
      const took = tricks[t] + tricks[t + 2];
      let made = null;
      let base = 0;
      let over = 0;
      if (contract > 0) {
        made = took >= contract;
        base = made ? 10 * contract : -10 * contract;
        over = made ? took - contract : 0;
      } else {
        over = took; // cả hai Nil: nước nào ăn được cũng là túi
      }
      const nils = seats.filter((x) => bids[x] === 0).map((x) => ({ seat: x, ok: tricks[x] === 0 }));
      const nil = nils.reduce((s, n) => s + (n.ok ? 100 : -100), 0);
      const all = bags[t] + over;
      const sets = Math.floor(all / 10);
      const penalty = -100 * sets;
      return { bid: contract, took, made, base, over, nils, nil, penalty, delta: base + over + nil + penalty, bags: all - 10 * sets };
    });
  }

  /** Đội thắng trận theo điểm hiện tại (0 / 1), chưa ai thắng thì null. */
  function winnerOf(scores, target) {
    const a = scores[0];
    const b = scores[1];
    const ended = Math.max(a, b) >= target || Math.min(a, b) <= FLOOR;
    if (!ended || a === b) return null;
    return a > b ? 0 : 1;
  }
  const matchWinner = (g) => winnerOf(g.scores, g.target);

  /** Hết 13 nước (trong g, đã là bản sao): cộng điểm, chuyển sang chờ ván sau hoặc hết trận. */
  function finishHand(g) {
    const teams = scoreHand(g.bids, g.tricks, g.bags);
    for (let t = 0; t < 2; t++) {
      g.scores[t] += teams[t].delta;
      g.bags[t] = teams[t].bags;
    }
    const winner = winnerOf(g.scores, g.target);
    g.result = { teams, winner };
    g.phase = winner === null ? 'hand' : 'over';
  }

  /** Sang ván sau: người chia xoay sang trái. */
  function nextHand(g) {
    if (g.phase !== 'hand') throw new Error('hand not over');
    const out = clone(g);
    out.handNo++;
    out.dealer = next(out.dealer);
    return deal(out);
  }

  /** Hợp đồng còn thiếu của một đội (âm = đã thừa). */
  function need(g, team) {
    const contract = (g.bids[team] > 0 ? g.bids[team] : 0) + (g.bids[team + 2] > 0 ? g.bids[team + 2] : 0);
    return contract - g.tricks[team] - g.tricks[team + 2];
  }
  /** Người này báo Nil và chưa ăn nước nào. */
  const nilAlive = (g, seat) => g.bids[seat] === 0 && g.tricks[seat] === 0;

  /* ---------------- Máy: báo ---------------- */

  /**
   * Ước lượng số nước một tay bài ăn được (số thực): đếm lá mạnh và bích.
   *   Bích: A chắc ăn, K có ít nhất 2 bích, Q có ít nhất 3, J có ít nhất 4; mỗi lá từ lá thứ 5 trở đi thêm 1.
   *   Chất phụ: A (chất không quá dài), K có lá che; chất ngắn + bích nhỏ còn thừa thì cắt được.
   */
  function estimate(hand) {
    const by = { S: [], H: [], D: [], C: [] };
    hand.forEach((id) => by[suitOf(id)].push(pow(id)));
    const sp = by.S;
    const ns = sp.length;
    let t = 0;
    let honors = 0;
    sp.forEach((v) => {
      if (v === 14) {
        t += 1;
        honors++;
      } else if (v === 13) {
        t += ns >= 2 ? 1 : 0.4;
        honors++;
      } else if (v === 12) {
        t += ns >= 3 ? 0.75 : 0.2;
        honors++;
      } else if (v === 11 && ns >= 4) t += 0.4;
    });
    if (ns > 4) t += ns - 4;
    let ruff = 0;
    ['H', 'D', 'C'].forEach((s) => {
      const a = by[s];
      const L = a.length;
      const hasA = a.indexOf(14) >= 0;
      const hasK = a.indexOf(13) >= 0;
      if (hasA) t += L <= 5 ? 1 : 0.6;
      if (hasK) t += L === 1 ? 0.1 : L <= 5 ? (hasA ? 0.85 : 0.55) : 0.3;
      if (a.indexOf(12) >= 0 && L >= 3 && L <= 5 && (hasA || hasK)) t += 0.3;
      if (L === 0) ruff += 1.6;
      else if (L === 1) ruff += 0.8;
      else if (L === 2) ruff += 0.3;
    });
    // Cắt bằng bích nhỏ còn thừa (bích lớn và bích dài đã tính ở trên)
    const spare = Math.max(0, Math.min(ns, 4) - honors);
    t += Math.min(ruff, spare * 0.85);
    return t;
  }

  /** Độ rủi ro nếu báo Nil (0 = rất an toàn): lá to, bích cao, chất ngắn có lá to. */
  function nilRisk(hand) {
    const by = { S: [], H: [], D: [], C: [] };
    hand.forEach((id) => by[suitOf(id)].push(pow(id)));
    let risk = 0;
    by.S.forEach((v) => {
      if (v >= 12) risk += 4;
      else if (v >= 10) risk += 1.5;
      else if (v >= 8) risk += 0.5;
    });
    if (by.S.length > 3) risk += (by.S.length - 3) * 1.5;
    ['H', 'D', 'C'].forEach((s) => {
      const a = by[s].slice().sort((x, y) => x - y);
      a.forEach((v, i) => {
        // lá to trong chất ngắn khó xả: có ít lá nhỏ hơn đi trước để lót
        if (v >= 13) risk += i < 2 ? 3 : 1.5;
        else if (v >= 11) risk += i < 2 ? 1.5 : 0.5;
      });
      if (a.length && a[0] >= 8) risk += 1; // chất không có lá nhỏ để lót
    });
    return risk;
  }

  /** Mức của máy ở ghế này (ghế 0 khi mô phỏng thì truyền level). */
  const seatLevel = (g, seat) => (seat === PARTNER ? 'hard' : g.level);

  /** PRNG riêng cho máy: suy từ trạng thái, không đổi g (cùng ván cùng nước thì cùng lựa chọn). */
  function pickRng(g) {
    return C.rng((g.rng ^ Math.imul(g.moves + 1, 0x9e3779b1) ^ Math.imul(g.turn + 1, 0x85ebca6b)) >>> 0);
  }

  const clampBid = (n) => Math.max(1, Math.min(HAND, n));

  /**
   * Gợi ý báo cho người đang tới lượt (như máy Khó): { bid, nil, est }.
   * nil = true khi bài đủ yếu để báo Nil (bid khi đó là 0).
   */
  function suggestBid(g) {
    const seat = g.turn;
    const hand = g.hands[seat];
    const est = estimate(hand);
    const partnerBid = g.bids[partnerOf(seat)];
    const nil = partnerBid !== 0 && est < 1.6 && nilRisk(hand) <= 3;
    let n = clampBid(Math.round(est + 0.3)); // đo bằng mô phỏng: ước lượng thô thấp hơn thực tế khoảng 0,6 nước mỗi người
    // Đồng đội đã báo Nil: phải che cho họ, ăn nhiều nước hơn bình thường một chút
    if (partnerBid === 0) n = clampBid(n + 1);
    // Bốn người báo vượt quá 13 nước thì bớt một nước (không thể cả bàn cùng đạt)
    const sum = g.bids.reduce((s, b) => s + (b || 0), 0);
    if (sum + n > HAND + 1 && n > 1) n--;
    return { bid: nil ? 0 : n, nil, est };
  }

  /** Máy báo cho người đang tới lượt. level: mức (mặc định theo ghế); 'random' = bot thử nghiệm, báo như máy Khó. */
  function aiBid(g, level) {
    const lvl = level || seatLevel(g, g.turn);
    const hand = g.hands[g.turn];
    if (lvl === 'easy') {
      // Dễ: đếm lá thô rồi ước sai lệch tới ±1,5 nước, không bao giờ báo Nil
      const r = pickRng(g);
      return clampBid(Math.round(estimate(hand) + (r() * 2 - 1) * 1.5));
    }
    if (lvl === 'medium') {
      const est = estimate(hand);
      if (g.bids[partnerOf(g.turn)] !== 0 && est < 1 && nilRisk(hand) <= 1.5) return 0;
      return clampBid(Math.round(est));
    }
    return suggestBid(g).bid;
  }

  /* ---------------- Máy: ra lá ---------------- */

  const byLow = (a, b) => pow(a) - pow(b) || (suitOf(a) === 'S') - (suitOf(b) === 'S');
  const lowest = (cards) => cards.slice().sort(byLow)[0];
  const highest = (cards) => cards.slice().sort(byLow)[cards.length - 1];

  /** Mọi lá đã lộ (các nước xong + nước đang đánh). */
  function seenCards(g) {
    const out = [];
    g.done.forEach((d) => out.push.apply(out, d.cards));
    return out.concat(g.trick);
  }

  /** Chất mỗi người đã lộ là hết (ra lá khác chất được dẫn): mảng 4 đối tượng { S: true, … }. */
  function voidsOf(g) {
    const v = [{}, {}, {}, {}];
    const scan = (lead, cards) => {
      const led = suitOf(cards[0]);
      cards.forEach((id, i) => {
        if (suitOf(id) !== led) v[(lead + i) % SEATS][led] = true;
      });
    };
    g.done.forEach((d) => scan(d.lead, d.cards));
    if (g.trick.length) scan(g.lead, g.trick);
    return v;
  }

  /**
   * Bộ nhớ của máy Khó cho một lượt: lá chưa lộ (không tính bài mình), chất đã hết của từng người,
   * số lá mỗi chất đã lộ. Máy Dễ / Vừa không đếm lá.
   */
  function memory(g, seat) {
    const known = {};
    g.hands[seat].forEach((id) => { known[id] = true; });
    const count = { S: 0, H: 0, D: 0, C: 0 };
    seenCards(g).forEach((id) => {
      known[id] = true;
      count[suitOf(id)]++;
    });
    return { unseen: ALL.filter((id) => !known[id]), voids: voidsOf(g), count };
  }

  /**
   * Lá `card` (sẽ là lá thắng nước sau khi ra) có giữ được trước các đối thủ còn phải ra sau không.
   * Khó: đếm lá chưa lộ; đối thủ đã lộ hết chất dẫn (hoặc chất dẫn đã ra gần hết) thì coi như cắt được bằng bích.
   * Vừa: không đếm lá, chỉ tin vào A (A♠ luôn chắc).
   */
  function holds(g, seat, card, led, lvl, mem) {
    const opps = [];
    for (let i = g.trick.length + 1; i < SEATS; i++) {
      const x = seatAt(g, i);
      if (teamOf(x) !== teamOf(seat)) opps.push(x);
    }
    if (!opps.length) return true;
    const cs = suitOf(card);
    if (lvl !== 'hard') return pow(card) === 14 && (cs === 'S' || cs === led);
    const myLen = g.hands[seat].filter((id) => suitOf(id) === led).length;
    return opps.every((x) => {
      const v = mem.voids[x];
      return !mem.unseen.some((u) => {
        const us = suitOf(u);
        if (us === cs) return pow(u) > pow(card) && !v[cs] && (cs === led || !!v[led]); // lá cùng chất to hơn mà họ ra được
        if (us === 'S') return !v.S && (!!v[led] || mem.count[led] + myLen >= 10); // cắt bằng bích
        return false;
      });
    });
  }

  /** Xả một lá khi không cần / không thể ăn: lá nhỏ nhất, giữ bích (máy Khó xả ở chất ngắn để sớm hết chất). */
  function discard(g, seat, legal, lvl) {
    const side = legal.filter((id) => suitOf(id) !== 'S');
    const pool = side.length ? side : legal;
    const following = g.trick.length && suitOf(pool[0]) === suitOf(g.trick[0]);
    if (lvl !== 'hard' || following) return lowest(pool);
    const len = {};
    g.hands[seat].forEach((id) => { len[suitOf(id)] = (len[suitOf(id)] || 0) + 1; });
    return pool.slice().sort((a, b) => len[suitOf(a)] - len[suitOf(b)] || pow(a) - pow(b))[0];
  }

  /** Máy có muốn ăn nước này không (chưa xét Nil). Dễ: luôn muốn; Vừa: tới khi đủ hợp đồng; Khó: thêm né túi / đánh trượt đối thủ. */
  function wantTrick(g, seat, lvl) {
    if (lvl === 'easy') return true;
    const team = teamOf(seat);
    if (need(g, team) > 0) return true;
    if (lvl !== 'hard') return false;
    // Đã đủ hợp đồng: chỉ ăn thêm khi có cơ hội làm đối thủ trượt
    const left = HAND - g.done.length;
    const opp = need(g, 1 - team);
    return opp > 0 && left - opp <= 1;
  }

  /** Máy chọn lá (luôn hợp lệ). level: mức (mặc định theo ghế), 'random' = bot ra lá ngẫu nhiên hợp lệ. */
  function aiPlay(g, level) {
    const seat = g.turn;
    const lvl = level || seatLevel(g, seat);
    const legal = legalPlays(g);
    if (legal.length <= 1) return legal[0];
    if (lvl === 'random') return legal[pickRng(g).int(legal.length)];
    // Dễ: gần một phần ba số lượt ra đại một lá hợp lệ
    if (lvl === 'easy') {
      const r = pickRng(g);
      if (r() < 0.3) return legal[r.int(legal.length)];
    }
    const mem = lvl === 'hard' ? memory(g, seat) : null;
    return g.trick.length ? follow(g, seat, legal, lvl, mem) : leadCard(g, seat, legal, lvl, mem);
  }

  /** Máy ra lá khi không phải người dẫn. */
  function follow(g, seat, legal, lvl, mem) {
    const led = suitOf(g.trick[0]);
    const wi = winningIndex(g.trick);
    const W = g.trick[wi];
    const ws = seatAt(g, wi);
    const p = partnerOf(seat);
    const pos = g.trick.length; // 1..3
    const winners = legal.filter((id) => beats(id, W));
    const losers = legal.filter((id) => !beats(id, W));
    const aware = lvl !== 'easy';

    // Mình báo Nil: ra lá to nhất mà vẫn thua; buộc phải ăn thì ra cuối bằng lá to nhất (xả lá nguy hiểm)
    if (aware && nilAlive(g, seat)) {
      if (losers.length) return highest(losers);
      return pos === 3 ? highest(legal) : lowest(legal);
    }
    // Đồng đội báo Nil: đồng đội đang thắng thì đè lên; đồng đội còn ra sau (mình ở vị trí 2) thì ra cao để che
    if (aware && nilAlive(g, p)) {
      if (ws === p) return winners.length ? lowest(winners) : discard(g, seat, legal, lvl);
      if (pos === 1) return winners.length ? highest(winners) : discard(g, seat, legal, lvl);
    }
    // Máy Khó: đối thủ báo Nil đang thắng nước thì lót dưới để họ phải ăn
    if (lvl === 'hard' && ws !== p && nilAlive(g, ws) && losers.length) return highest(losers);
    if (!wantTrick(g, seat, lvl)) {
      if (losers.length) return highest(losers);
      return pos === 3 ? highest(winners) : lowest(winners);
    }
    if (!winners.length) return discard(g, seat, legal, lvl);
    // Đồng đội đang thắng chắc thì không đè, xả lá nhỏ
    if (aware && ws === p && (pos === 3 || holds(g, seat, W, led, lvl, mem))) return discard(g, seat, legal, lvl);
    if (pos === 3) return lowest(winners);
    if (lvl === 'easy') return highest(winners); // Dễ: thấy ăn được là ra lá to nhất
    const sure = winners.filter((id) => holds(g, seat, id, led, lvl, mem));
    if (sure.length) return lowest(sure);
    const inSuit = winners.filter((id) => suitOf(id) === led);
    // Vị trí 3: ra lá to để ép; vị trí 2: theo chất thì ra nhỏ (đồng đội ra cuối lo), hết chất thì cắt bằng bích nhỏ nhất
    if (pos === 2) return inSuit.length ? highest(inSuit) : lowest(winners);
    if (inSuit.length) return lowest(legal);
    return lowest(winners);
  }

  /** Máy dẫn nước. */
  function leadCard(g, seat, legal, lvl, mem) {
    const p = partnerOf(seat);
    const aware = lvl !== 'easy';
    const side = legal.filter((id) => suitOf(id) !== 'S');
    if (aware && nilAlive(g, seat)) return lowest(legal);
    // Che Nil cho đồng đội: dẫn lá to để đồng đội lót dưới
    if (aware && nilAlive(g, p)) return highest(side.length ? side : legal);
    if (lvl === 'easy') return highest(legal); // Dễ: dẫn lá to nhất
    if (!wantTrick(g, seat, lvl)) return lowest(legal);
    if (lvl === 'hard') {
      // Lá chắc ăn (đếm lá: không còn lá nào to hơn chưa lộ, đối thủ không cắt được)
      const sure = legal.filter((id) => holds(g, seat, id, suitOf(id), lvl, mem));
      const sureSide = sure.filter((id) => suitOf(id) !== 'S');
      if (sureSide.length) return highest(sureSide);
      if (sure.length && g.hands[seat].filter((id) => suitOf(id) === 'S').length >= 3) return highest(sure);
      // Đồng đội đã hết một chất (còn bích) mà đối thủ chưa hết: dẫn chất đó cho đồng đội cắt
      const v = mem.voids;
      const feed = side.filter((id) => v[p][suitOf(id)] && !v[p].S && !v[next(seat)][suitOf(id)] && !v[(seat + 3) % SEATS][suitOf(id)]);
      if (feed.length) return lowest(feed);
    } else {
      const aces = side.filter((id) => pow(id) === 14);
      if (aces.length) return aces[0];
      const top = legal.find((id) => suitOf(id) === 'S' && pow(id) === 14);
      if (top) return top;
    }
    if (!side.length) return lowest(legal);
    // Còn bích: dẫn lá nhỏ ở chất ngắn nhất để sớm hết chất mà cắt; hết bích: dẫn ở chất dài nhất
    const len = {};
    side.forEach((id) => { len[suitOf(id)] = (len[suitOf(id)] || 0) + 1; });
    const hasSpades = g.hands[seat].some((id) => suitOf(id) === 'S');
    const pick = side.slice().sort((a, b) => (hasSpades ? len[suitOf(a)] - len[suitOf(b)] : len[suitOf(b)] - len[suitOf(a)]) || pow(a) - pow(b));
    // Không dẫn Q / K khi chưa chắc (dễ bị A ăn): ưu tiên lá nhỏ
    const low = pick.filter((id) => pow(id) < 12);
    return (low.length ? low : pick)[0];
  }

  /** Một bước của máy cho trạng thái hiện tại: báo / ra lá / sang ván. level như aiPlay. */
  function aiStep(g, level) {
    if (g.phase === 'bid') return bid(g, aiBid(g, level));
    if (g.phase === 'play') return play(g, aiPlay(g, level));
    if (g.phase === 'hand') return nextHand(g);
    return g;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => Object.assign({ v: VERSION }, clone(g));

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && (hi == null || x <= hi);
  const isId = (x) => typeof x === 'string' && Object.prototype.hasOwnProperty.call(INFO, x);
  const isIds = (a) => Array.isArray(a) && a.every(isId);

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia trận mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    try {
      const g = raw;
      if (LEVELS.indexOf(g.level) < 0 || TARGETS.indexOf(g.target) < 0 || PHASES.indexOf(g.phase) < 0) return null;
      if (!Array.isArray(g.scores) || g.scores.length !== 2 || !g.scores.every((s) => isInt(s, -100000, 100000))) return null;
      if (!Array.isArray(g.bags) || g.bags.length !== 2 || !g.bags.every((b) => isInt(b, 0, 9))) return null;
      if (!isInt(g.handNo, 1) || !isInt(g.dealer, 0, 3) || !isInt(g.turn, 0, 3) || !isInt(g.lead, 0, 3) || !isInt(g.rng, 0, 4294967295)) return null;
      if (!Array.isArray(g.bids) || g.bids.length !== SEATS || !g.bids.every((b) => b === null || isBid(b))) return null;
      if (!Array.isArray(g.tricks) || g.tricks.length !== SEATS || !g.tricks.every((n) => isInt(n, 0, HAND))) return null;
      if (!Array.isArray(g.hands) || g.hands.length !== SEATS || !g.hands.every(isIds) || !isIds(g.trick) || g.trick.length > 3) return null;
      if (typeof g.broken !== 'boolean' || !Array.isArray(g.done) || g.done.length > HAND) return null;
      if (!isInt(g.moves, 0) || !isInt(g.humanMoves, 0, g.moves)) return null;
      // Các nước đã xong: 4 lá, người ăn đúng luật, người dẫn nước sau là người ăn nước trước
      let lead = next(g.dealer);
      const won = [0, 0, 0, 0];
      const played = [];
      for (const d of g.done) {
        if (!d || typeof d !== 'object' || d.lead !== lead || !isIds(d.cards) || d.cards.length !== SEATS) return null;
        if (d.win !== trickWinner(d.lead, d.cards)) return null;
        won[d.win]++;
        lead = d.win;
        played.push.apply(played, d.cards);
      }
      if (won.some((n, i) => n !== g.tricks[i])) return null;
      const all = played.concat(g.trick, ...g.hands);
      if (all.length !== 52 || new Set(all).size !== 52) return null;
      if (g.broken !== played.concat(g.trick).some((id) => suitOf(id) === 'S')) return null;
      // Số lá trên tay từng người khớp với số nước đã đánh
      for (let s = 0; s < SEATS; s++) {
        const inTrick = (s - lead + SEATS) % SEATS < g.trick.length ? 1 : 0;
        if (g.hands[s].length !== HAND - g.done.length - inTrick) return null;
      }
      const nBids = g.bids.filter((b) => b !== null).length;
      if (g.phase === 'bid') {
        if (g.done.length || g.trick.length || g.lead !== next(g.dealer) || g.result !== null) return null;
        // Báo lần lượt từ bên trái người chia
        for (let i = 0; i < SEATS; i++) if ((g.bids[(g.dealer + 1 + i) % SEATS] !== null) !== i < nBids) return null;
        if (nBids === SEATS || g.turn !== (g.dealer + 1 + nBids) % SEATS) return null;
      } else if (nBids !== SEATS) return null;
      if (g.phase === 'play') {
        if (g.done.length === HAND || g.result !== null || g.lead !== lead || g.turn !== (lead + g.trick.length) % SEATS) return null;
        if (winnerOf(g.scores, g.target) !== null) return null;
      }
      if (g.phase === 'hand' || g.phase === 'over') {
        if (g.done.length !== HAND || g.trick.length || !g.result || typeof g.result !== 'object') return null;
        const w = winnerOf(g.scores, g.target);
        if (g.phase === 'hand' ? w !== null : w === null) return null;
        // Kết quả ván phải khớp đúng điểm tính lại từ báo / nước ăn (túi trước ván suy ngược từ túi sau)
        const r = g.result;
        if (!Array.isArray(r.teams) || r.teams.length !== 2 || r.winner !== w) return null;
        const before = r.teams.map((t, i) => (t && isInt(t.over, 0, HAND) && isInt(t.penalty, -200, 0) ? g.bags[i] - t.over - t.penalty / 10 : -1));
        if (!before.every((b) => isInt(b, 0, 9))) return null;
        if (JSON.stringify(r.teams) !== JSON.stringify(scoreHand(g.bids, g.tricks, before))) return null;
      }
      return clone(g);
    } catch (e) {
      return null;
    }
  }

  const api = {
    VERSION, SEATS, HUMAN, PARTNER, HAND, FLOOR, LEVELS, TARGETS,
    suitOf, pow, partnerOf, teamOf, beats, winningIndex, trickWinner,
    newMatch, legalPlays, isLegal, bid, play, scoreHand, winnerOf, matchWinner, nextHand, need, nilAlive,
    estimate, nilRisk, suggestBid, aiBid, aiPlay, aiStep, seatLevel, voidsOf, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
