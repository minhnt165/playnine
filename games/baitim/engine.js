/* =====================================================================
 * Bài Tim - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Hearts 4 người, bộ 52 lá: ghế 0 là bạn (Nam), ghế 1–3 là máy Tây, Bắc, Đông; đi theo chiều kim đồng hồ 0 → 1 → 2 → 3.
 *   - Mỗi ván chia 13 lá; trước khi đánh, mỗi người chuyền 3 lá: ván 1 sang trái (ghế + 1), ván 2 sang phải (ghế + 3),
 *     ván 3 sang người đối diện (ghế + 2), ván 4 không chuyền, rồi lặp lại
 *   - Ai cầm 2♣ mở nước đầu bằng 2♣; phải ra theo chất được mở, hết chất thì đổ lá bất kỳ
 *   - Nước đầu không được đổ cơ hay Q♠ (trừ khi trên tay chỉ toàn lá điểm)
 *   - Không được mở bằng cơ cho tới khi cơ "vỡ" (đã có người đổ cơ), trừ khi trên tay chỉ còn cơ
 *   - Lá cao nhất của chất được mở ăn nước (A cao nhất) và mở nước sau
 *   - Mỗi lá cơ 1 điểm, Q♠ 13 điểm; ăn đủ 26 điểm ("bắn trăng") thì mình 0, ba người kia mỗi người +26
 *   - Hết ván mà có người ≥ 100 điểm thì hết trận, điểm thấp nhất thắng; nếu đồng hạng thấp nhất thì đánh thêm ván
 *     cho tới khi chỉ còn một người thấp nhất
 *   Lá lưu bằng id của ../_kit/cards.js ('AS', '10H', 'QS'); hàm nào cũng trả trạng thái mới, không đụng trạng thái cũ.
 *   PRNG (mulberry32 của cards.js) nằm trong trạng thái (rng) nên tải lại trang vẫn ra đúng lá cũ.
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SEATS = 4;
  const HUMAN = 0;
  const HAND = 13;
  const TARGET = 100;
  const MOON = 26;
  const QS = 'QS';
  const LEVELS = ['easy', 'medium', 'hard'];
  const PHASES = ['pass', 'play', 'round', 'over'];
  const SUITS = C.SUITS;
  const ALL = C.newDeck().map(C.toId); // thứ tự cố định: xáo từ mảng này
  // Hướng chuyền theo ván: độ lệch ghế người nhận (1 trái, 3 phải, 2 đối diện, 0 không chuyền)
  const DIRS = [1, 3, 2, 0];

  const suitOf = (id) => C.fromId(id).suit;
  /** Bậc trong Hearts: A cao nhất (14). */
  const val = (id) => {
    const r = C.fromId(id).rank;
    return r === 1 ? 14 : r;
  };
  const next = (seat) => (seat + 1) % SEATS;
  const passOffset = (round) => DIRS[(round - 1) % 4];

  /** Điểm phạt của một lá: cơ 1, Q♠ 13, còn lại 0. */
  const cardPoints = (id) => (id === QS ? 13 : suitOf(id) === 'H' ? 1 : 0);
  const isPenalty = (id) => cardPoints(id) > 0;
  const sumPoints = (ids) => ids.reduce((s, id) => s + cardPoints(id), 0);

  /** Bản sao trạng thái, thứ tự khóa cố định (lưu / so sánh dựa vào nó). */
  function clone(g) {
    return {
      level: g.level,
      scores: g.scores.slice(),
      round: g.round,
      rng: g.rng,
      phase: g.phase, // pass (chọn lá chuyền) | play | round (hết ván, chờ sang ván) | over (hết trận)
      hands: g.hands.map((h) => h.slice()),
      passed: g.passed ? g.passed.map((p) => p.slice()) : null, // 3 lá mỗi người đã chuyền ván này (null: chưa / không chuyền)
      trick: g.trick.map((p) => ({ seat: p.seat, card: p.card })), // nước đang đánh, theo thứ tự ra lá
      leader: g.leader, // người mở nước đang đánh
      turn: g.turn,
      tricks: g.tricks, // số nước đã xong trong ván (0..13)
      broken: g.broken, // cơ đã vỡ chưa
      taken: g.taken.map((t) => t.slice()), // lá điểm mỗi người đã ăn trong ván
      played: g.played.slice(), // các lá đã ra ở những nước đã xong (ai cũng thấy: máy Khó đếm lá)
      voids: g.voids.map((v) => v.slice()), // chất mỗi người đã lộ là hết (không ra theo được)
      last: g.last ? { cards: g.last.cards.map((p) => ({ seat: p.seat, card: p.card })), winner: g.last.winner } : null, // nước vừa xong
      history: g.history.map((h) => ({ pts: h.pts.slice(), moon: h.moon })), // điểm từng ván; moon = ghế bắn trăng hoặc -1
      moves: g.moves, // số nước cả bàn trong trận (chuyền + ra lá)
      humanMoves: g.humanMoves, // số nước của bạn (bỏ trận khi > 0 tính là thua)
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

  /** Ai đang cầm lá id (-1 nếu không ai). */
  const holder = (g, id) => g.hands.findIndex((h) => h.indexOf(id) >= 0);

  /** Bắt đầu đánh: người cầm 2♣ mở. */
  function startPlay(g) {
    g.phase = 'play';
    g.leader = holder(g, '2C');
    g.turn = g.leader;
    return g;
  }

  /** Chia ván (trong g, đã là bản sao): xáo 52 lá, chia 13 lá mỗi người; ván không chuyền thì đánh luôn. */
  function deal(g) {
    withRng(g, (r) => {
      const deck = C.shuffle(ALL, r);
      g.hands = [0, 1, 2, 3].map((s) => deck.slice(s * HAND, (s + 1) * HAND));
    });
    g.passed = null;
    g.trick = [];
    g.tricks = 0;
    g.broken = false;
    g.taken = [[], [], [], []];
    g.played = [];
    g.voids = [[], [], [], []];
    g.last = null;
    if (passOffset(g.round) === 0) return startPlay(g);
    g.phase = 'pass';
    g.leader = 0;
    g.turn = 0;
    return g;
  }

  /** Trận mới. opts: { seed, level: 'easy' | 'medium' | 'hard' }. */
  function newMatch(opts) {
    const o = opts || {};
    const r = C.rng(o.seed);
    const g = clone({
      level: LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium',
      scores: [0, 0, 0, 0],
      round: 1,
      rng: r.getState(),
      phase: 'pass',
      hands: [[], [], [], []],
      passed: null,
      trick: [],
      leader: 0,
      turn: 0,
      tricks: 0,
      broken: false,
      taken: [[], [], [], []],
      played: [],
      voids: [[], [], [], []],
      last: null,
      history: [],
      moves: 0,
      humanMoves: 0,
    });
    return deal(g);
  }

  /* ---------------- Chuyền bài ---------------- */

  /** Ghế nhận lá của seat ở ván này (null nếu không chuyền). */
  function passTarget(g, seat) {
    const d = passOffset(g.round);
    return d ? (seat + d) % SEATS : null;
  }
  /** Ghế chuyền lá cho seat ở ván này (null nếu không chuyền). */
  function passSource(g, seat) {
    const d = passOffset(g.round);
    return d ? (seat - d + SEATS) % SEATS : null;
  }
  /** Lá seat nhận được ván này, [] nếu chưa / không chuyền. */
  function received(g, seat) {
    if (!g.passed) return [];
    return g.passed[passSource(g, seat)].slice();
  }

  function validPick(hand, ids) {
    return Array.isArray(ids) && ids.length === 3 && new Set(ids).size === 3 && ids.every((id) => hand.indexOf(id) >= 0);
  }

  /** Cả bốn người chuyền cùng lúc: picks[s] là 3 lá của ghế s. */
  function exchange(g0, picks) {
    if (g0.phase !== 'pass') throw new Error('exchange: không phải lúc chuyền bài');
    if (!Array.isArray(picks) || picks.length !== SEATS) throw new Error('exchange: cần 4 bộ lá');
    picks.forEach((p, s) => {
      if (!validPick(g0.hands[s], p)) throw new Error('exchange: ghế ' + s + ' chọn sai lá');
    });
    const g = clone(g0);
    g.hands = g.hands.map((h, s) => h.filter((id) => picks[s].indexOf(id) < 0));
    for (let s = 0; s < SEATS; s++) g.hands[passTarget(g, s)].push(...picks[s]);
    g.passed = picks.map((p) => p.slice());
    g.moves += SEATS;
    g.humanMoves++;
    return startPlay(g);
  }

  /* ---------------- Ra lá ---------------- */

  const ledSuit = (g) => (g.trick.length ? suitOf(g.trick[0].card) : null);

  /** Lá đang thắng nước (cao nhất của chất được mở) dạng { seat, card }, null nếu nước còn trống. */
  function winning(g) {
    if (!g.trick.length) return null;
    const led = ledSuit(g);
    let best = g.trick[0];
    g.trick.forEach((p) => {
      if (suitOf(p.card) === led && val(p.card) > val(best.card)) best = p;
    });
    return best;
  }

  /** Các lá người đang tới lượt được ra. */
  function legalPlays(g) {
    if (g.phase !== 'play') return [];
    const hand = g.hands[g.turn];
    if (!g.trick.length) {
      if (g.tricks === 0) return hand.indexOf('2C') >= 0 ? ['2C'] : [];
      if (!g.broken) {
        const plain = hand.filter((id) => suitOf(id) !== 'H');
        if (plain.length) return plain;
      }
      return hand.slice();
    }
    const led = ledSuit(g);
    const follow = hand.filter((id) => suitOf(id) === led);
    if (follow.length) return follow;
    if (g.tricks === 0) {
      // Nước đầu: không đổ lá điểm, trừ khi trên tay chỉ toàn lá điểm
      const safe = hand.filter((id) => !isPenalty(id));
      if (safe.length) return safe;
    }
    return hand.slice();
  }

  /** Người đang tới lượt ra lá id. Đủ 4 lá thì tính nước; đủ 13 nước thì tính điểm ván. */
  function play(g0, id) {
    if (legalPlays(g0).indexOf(id) < 0) throw new Error('play: lá không ra được ' + id);
    const g = clone(g0);
    const seat = g.turn;
    const hand = g.hands[seat];
    const led = ledSuit(g);
    hand.splice(hand.indexOf(id), 1);
    if (led && suitOf(id) !== led && g.voids[seat].indexOf(led) < 0) g.voids[seat].push(led);
    g.trick.push({ seat, card: id });
    if (suitOf(id) === 'H') g.broken = true;
    g.moves++;
    if (seat === HUMAN) g.humanMoves++;
    if (g.trick.length < SEATS) {
      g.turn = next(seat);
      return g;
    }
    // Đủ bốn lá: người thắng ăn lá điểm và mở nước sau
    const w = winning(g).seat;
    const cards = g.trick.map((p) => p.card);
    g.taken[w].push(...cards.filter(isPenalty));
    g.played.push(...cards);
    g.last = { cards: g.trick, winner: w };
    g.trick = [];
    g.tricks++;
    g.leader = w;
    g.turn = w;
    if (g.tricks === HAND) return endRound(g);
    return g;
  }

  /** Điểm ván theo lá đã ăn; ai ăn đủ 26 điểm thì bắn trăng: mình 0, ba người kia +26. */
  function roundPoints(taken) {
    const pts = taken.map(sumPoints);
    const moon = pts.indexOf(MOON);
    if (moon < 0) return { pts, moon: -1 };
    return { pts: pts.map((_, s) => (s === moon ? 0 : MOON)), moon };
  }

  /** Hết trận khi có người ≥ 100 và chỉ một người thấp nhất. */
  function isOver(scores) {
    if (Math.max(...scores) < TARGET) return false;
    const lo = Math.min(...scores);
    return scores.filter((s) => s === lo).length === 1;
  }

  function endRound(g) {
    const r = roundPoints(g.taken);
    g.scores = g.scores.map((s, i) => s + r.pts[i]);
    g.history.push(r);
    g.phase = isOver(g.scores) ? 'over' : 'round';
    return g;
  }

  /** Sang ván sau, giữ điểm. */
  function nextRound(g0) {
    if (g0.phase !== 'round') throw new Error('nextRound: chưa hết ván hoặc đã hết trận');
    const g = clone(g0);
    g.round++;
    return deal(g);
  }

  /** Người thắng trận (điểm thấp nhất), null khi chưa hết trận. */
  function matchWinner(g) {
    if (g.phase !== 'over') return null;
    return g.scores.indexOf(Math.min(...g.scores));
  }

  /* ---------------- Máy ---------------- */

  /** PRNG riêng cho lựa chọn ngẫu nhiên của máy: suy ra từ trạng thái (không đổi rng của ván), cùng ván thì cùng nước. */
  function pickRng(g, seat) {
    return C.rng((g.rng ^ Math.imul(g.moves + 1, 0x9e3779b1) ^ Math.imul(seat + 1, 0x85ebca6b)) >>> 0);
  }

  const bySuit = (ids, s) => ids.filter((id) => suitOf(id) === s);
  const highest = (ids) => ids.reduce((a, b) => (val(b) > val(a) ? b : a));
  const lowest = (ids) => ids.reduce((a, b) => (val(b) < val(a) ? b : a));

  /** Các lá seat chưa thấy: không trên tay mình, chưa ra (máy Khó đếm lá). */
  function unseen(g, seat) {
    const seen = new Set(g.hands[seat].concat(g.played, g.trick.map((p) => p.card)));
    return ALL.filter((id) => !seen.has(id));
  }

  /* --- Chuyền --- */

  /** Máy chọn 3 lá chuyền cho ghế seat theo mức (bỏ trống = mức của trận). */
  function aiPass(g, seat, level) {
    const lv = level || g.level;
    const hand = g.hands[seat];
    if (lv === 'easy') return C.shuffle(hand, pickRng(g, seat)).slice(0, 3);
    const score = {};
    if (lv === 'medium') {
      // Vừa: chuyền lá to nhất, ưu tiên Q♠ / K♠ / A♠ rồi cơ to
      hand.forEach((id) => {
        score[id] = val(id) + (id === QS ? 40 : 0) + (id === 'KS' || id === 'AS' ? 25 : 0) + (suitOf(id) === 'H' ? 2 : 0);
      });
    } else {
      // Khó: tay rất mạnh thì giữ lá to để thử bắn trăng (chuyền ba lá nhỏ nhất)
      const big = hand.filter((id) => val(id) >= 11).length;
      const bigHearts = bySuit(hand, 'H').filter((id) => val(id) >= 11).length;
      if (big >= 9 && bigHearts >= 3) return hand.slice().sort((a, b) => val(a) - val(b) || a.localeCompare(b)).slice(0, 3);
      const lowSpades = bySuit(hand, 'S').filter((id) => val(id) < 12).length;
      const hasQ = hand.indexOf(QS) >= 0;
      // Chất ngắn nhất trong nhép / rô (≤ 3 lá): chuyền hết để tạo chất trống
      let voidSuit = null;
      ['D', 'C'].forEach((s) => {
        const n = bySuit(hand, s).length;
        if (n > 0 && n <= 3 && (!voidSuit || n < bySuit(hand, voidSuit).length)) voidSuit = s;
      });
      hand.forEach((id) => {
        const s = suitOf(id);
        const v = val(id);
        let sc = v;
        if (id === QS) sc = lowSpades >= 4 ? 5 : 100; // đủ bích nhỏ che thì giữ Q♠
        else if (id === 'KS' || id === 'AS') sc = hasQ ? (lowSpades >= 4 ? 8 : 70) : lowSpades >= 3 ? 12 : 80;
        else if (s === 'S') sc = 0; // bích nhỏ: giữ để che / ép Q♠
        else if (s === 'H') sc = v >= 10 ? 30 + v : v <= 5 ? -5 : v;
        if (s === voidSuit && id !== '2C') sc += 25;
        score[id] = sc;
      });
    }
    return hand.slice().sort((a, b) => score[b] - score[a] || val(b) - val(a) || a.localeCompare(b)).slice(0, 3);
  }

  /* --- Ra lá --- */

  /** Máy Vừa: luật ngón tay cái, chỉ nhìn nước đang đánh (không nhớ lá đã ra). */
  function playMedium(g, legal) {
    const hand = g.hands[g.turn];
    if (!g.trick.length) {
      // Mở: lá nhỏ nhất, tránh cơ và bích khi đang cầm Q♠ / K♠ / A♠
      const hasQ = hand.indexOf(QS) >= 0;
      let best = null;
      let bestSc = Infinity;
      legal.forEach((id) => {
        const s = suitOf(id);
        let sc = val(id) + bySuit(hand, s).length * 0.2;
        if (s === 'H') sc += 6;
        if (s === 'S' && (hasQ || val(id) > 12)) sc += 20;
        if (id === QS) sc += 40;
        if (sc < bestSc) {
          bestSc = sc;
          best = id;
        }
      });
      return best;
    }
    const led = ledSuit(g);
    const cur = winning(g).card;
    if (suitOf(legal[0]) === led) {
      const ducks = legal.filter((id) => val(id) < val(cur));
      if (ducks.length) return highest(ducks);
      if (g.trick.length === SEATS - 1 && sumPoints(g.trick.map((p) => p.card)) === 0) {
        const noQ = legal.filter((id) => id !== QS);
        return highest(noQ.length ? noQ : legal);
      }
      return lowest(legal);
    }
    // Hết chất: đổ Q♠, rồi cơ to nhất, rồi lá to nhất
    if (legal.indexOf(QS) >= 0) return QS;
    const hearts = bySuit(legal, 'H');
    if (hearts.length) return highest(hearts);
    return highest(legal);
  }

  /** Số lá không chắc ăn trên tay: còn lá chưa thấy cao hơn cùng chất. */
  function sureLosers(hand, out) {
    return hand.filter((id) => out.some((x) => suitOf(x) === suitOf(id) && val(x) > val(id))).length;
  }

  /** Người (khác seat) có thể đang bắn trăng: một mình ăn hết lá điểm đã ra, đã ≥ 8 điểm. -1 nếu không có. */
  function moonThreat(g, seat) {
    const pts = g.taken.map(sumPoints);
    const owners = [0, 1, 2, 3].filter((s) => pts[s] > 0);
    if (owners.length !== 1 || owners[0] === seat) return -1;
    return pts[owners[0]] >= 8 ? owners[0] : -1;
  }

  /** Máy Khó thử bắn trăng: chưa ai khác ăn điểm, bài còn lại đều là lá chắc ăn và đã có điểm / đã qua vài nước. */
  function shooting(g, seat, out) {
    const pts = g.taken.map(sumPoints);
    if (pts.some((p, s) => s !== seat && p > 0)) return false;
    const hand = g.hands[seat];
    return sureLosers(hand, out) === 0 && (pts[seat] > 0 || g.tricks >= 4 || hand.indexOf(QS) >= 0);
  }

  /** Máy Khó: đếm lá, nhớ chất trống, ép Q♠, thử bắn trăng và chặn người đang bắn trăng. */
  function playHard(g, legal) {
    const seat = g.turn;
    const hand = g.hands[seat];
    const out = unseen(g, seat);
    const qsOut = out.indexOf(QS) >= 0;
    const others = [1, 2, 3].map((k) => (seat + k) % SEATS);
    const after = others.slice(0, SEATS - 1 - g.trick.length); // người còn ra sau mình trong nước này
    const trickPts = sumPoints(g.trick.map((p) => p.card));
    const outIn = (s) => bySuit(out, s);

    /* Thử bắn trăng: ra lá chắc ăn từ cao xuống */
    if (shooting(g, seat, out)) {
      if (!g.trick.length) {
        const plain = legal.filter((id) => suitOf(id) !== 'H');
        return highest(plain.length ? plain : legal);
      }
      const win = legal.filter((id) => suitOf(id) === ledSuit(g) && val(id) > val(winning(g).card));
      if (win.length) return highest(win);
      const plain = legal.filter((id) => !isPenalty(id));
      return lowest(plain.length ? plain : legal);
    }

    const threat = moonThreat(g, seat);

    /* Mở nước: chọn lá ít rủi ro ăn điểm nhất */
    if (!g.trick.length) {
      let best = null;
      let bestSc = Infinity;
      legal.forEach((id) => {
        const s = suitOf(id);
        const so = outIn(s);
        const higher = so.filter((x) => val(x) > val(id)).length;
        const voidOthers = others.filter((o) => g.voids[o].indexOf(s) >= 0).length;
        // Khả năng ăn nước: không ai cao hơn thì chắc ăn; càng nhiều lá cao hơn ở ngoài càng an toàn
        const pWin = higher === 0 ? 1 : 1 / (1 + higher * 1.5);
        let cost = 1;
        if (s === 'H') cost += Math.min(3, so.length);
        if (s === 'S' && qsOut && val(id) > 12) cost += 13;
        if (id === QS) cost += 13;
        cost += voidOthers * (4 + (qsOut ? 6 : 0));
        let sc = pWin * cost + val(id) * 0.02;
        if (s === 'S' && qsOut && val(id) < 12) sc -= 0.6; // ép Q♠ bằng bích nhỏ
        if (bySuit(hand, s).length <= 2 && higher > 0) sc -= 0.2; // mở chất ngắn để sớm trống
        if (threat >= 0 && s === 'H' && higher === 0) sc -= 1; // ăn một lá cơ để chặn bắn trăng
        if (sc < bestSc) {
          bestSc = sc;
          best = id;
        }
      });
      return best;
    }

    const led = ledSuit(g);
    const curP = winning(g);
    const cur = curP.card;

    /* Ra theo chất */
    if (suitOf(legal[0]) === led) {
      // Chặn bắn trăng: người đang bắn đang thắng nước có điểm, mình có lá cao hơn thì ăn lấy
      if (threat >= 0 && curP.seat === threat && trickPts > 0) {
        const win = legal.filter((id) => val(id) > val(cur) && id !== QS);
        if (win.length) return lowest(win);
      }
      const ducks = legal.filter((id) => val(id) < val(cur));
      if (ducks.length) return highest(ducks); // Q♠ lọt dưới K♠ / A♠ cũng là lá cao nhất không ăn
      const noQ = legal.filter((id) => id !== QS);
      const pool = noQ.length ? noQ : legal;
      if (!after.length) return highest(pool); // ra cuối, đằng nào cũng ăn: xả lá to
      // Phải ăn khi còn người ra sau: an toàn (chưa ai trống chất, chất còn nhiều, không phải cơ / bích khi Q♠ ở ngoài) thì xả lá to
      const safe = trickPts === 0 && led !== 'H' && !(led === 'S' && qsOut) &&
        after.every((o) => g.voids[o].indexOf(led) < 0) && outIn(led).length >= after.length * 2;
      return safe ? highest(pool) : lowest(pool);
    }

    /* Hết chất: đổ lá nguy hiểm nhất */
    if (threat >= 0 && curP.seat === threat) {
      // Đừng cho người đang bắn trăng thêm điểm: đổ lá không điểm to nhất
      const plain = legal.filter((id) => !isPenalty(id));
      if (plain.length) return highest(plain);
    }
    if (legal.indexOf(QS) >= 0) return QS;
    const bigS = legal.filter((id) => id === 'AS' || id === 'KS');
    if (qsOut && bigS.length) return highest(bigS);
    let best = null;
    let bestSc = -Infinity;
    legal.forEach((id) => {
      const s = suitOf(id);
      const lower = outIn(s).filter((x) => val(x) < val(id)).length; // càng nhiều lá nhỏ hơn ở ngoài càng dễ phải ăn
      let sc = lower + val(id) * 0.15;
      if (s === 'H') sc += 3;
      if (bySuit(hand, s).length === 1) sc += 1.5; // xả lá cuối của chất để trống
      if (sc > bestSc) {
        bestSc = sc;
        best = id;
      }
    });
    return best;
  }

  /** Lá máy chọn cho người đang tới lượt. level bỏ trống = mức của trận. */
  function aiPlay(g, level) {
    const lv = level || g.level;
    const legal = legalPlays(g);
    if (!legal.length) throw new Error('aiPlay: không có lá nào ra được');
    if (legal.length === 1) return legal[0];
    if (lv === 'easy') return legal[pickRng(g, g.turn).int(legal.length)];
    if (lv === 'medium') return playMedium(g, legal);
    return playHard(g, legal);
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => Object.assign({ v: VERSION }, clone(g));

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && (hi == null || x <= hi);
  const isId = (x) => typeof x === 'string' && !!C.fromId(x) && C.toId(C.fromId(x)) === x;
  const isIds = (a) => Array.isArray(a) && a.every(isId);
  const isSeatCards = (a) => Array.isArray(a) && a.every((p) => !!p && typeof p === 'object' && isInt(p.seat, 0, 3) && isId(p.card));

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia trận mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    try {
      const g = raw;
      if (LEVELS.indexOf(g.level) < 0 || PHASES.indexOf(g.phase) < 0) return null;
      if (!Array.isArray(g.scores) || g.scores.length !== SEATS || !g.scores.every((s) => isInt(s, 0))) return null;
      if (!isInt(g.round, 1) || !isInt(g.rng, 0, 4294967295) || !isInt(g.leader, 0, 3) || !isInt(g.turn, 0, 3)) return null;
      if (!isInt(g.tricks, 0, HAND) || typeof g.broken !== 'boolean') return null;
      if (!Array.isArray(g.hands) || g.hands.length !== SEATS || !g.hands.every(isIds)) return null;
      if (!isSeatCards(g.trick) || g.trick.length > 3 || !isIds(g.played)) return null;
      if (!Array.isArray(g.taken) || g.taken.length !== SEATS || !g.taken.every(isIds)) return null;
      if (!Array.isArray(g.voids) || g.voids.length !== SEATS || !g.voids.every((v) => Array.isArray(v) && v.every((s) => SUITS.indexOf(s) >= 0))) return null;
      if (!isInt(g.moves, 0) || !isInt(g.humanMoves, 0, g.moves)) return null;
      // Đủ 52 lá, không trùng: trên tay + nước đang đánh + đã ra
      const all = g.played.concat(g.trick.map((p) => p.card), ...g.hands);
      if (all.length !== 52 || new Set(all).size !== 52) return null;
      if (g.played.length !== g.tricks * SEATS) return null;
      // Mỗi người cầm đúng số lá còn lại của mình
      for (let s = 0; s < SEATS; s++) {
        const inTrick = g.trick.some((p) => p.seat === s) ? 1 : 0;
        if (g.hands[s].length !== HAND - g.tricks - inTrick) return null;
      }
      // Lá điểm đã ăn đúng bằng các lá điểm đã ra ở những nước đã xong
      const takenAll = [].concat(...g.taken);
      if (new Set(takenAll).size !== takenAll.length || !takenAll.every((id) => isPenalty(id) && g.played.indexOf(id) >= 0)) return null;
      if (takenAll.length !== g.played.filter(isPenalty).length) return null;
      // Nước đang đánh: theo chiều kim đồng hồ từ người mở, tới lượt người kế tiếp
      for (let i = 0; i < g.trick.length; i++) if (g.trick[i].seat !== (g.leader + i) % SEATS) return null;
      if (g.phase === 'play' && g.turn !== (g.leader + g.trick.length) % SEATS) return null;
      if (g.passed !== null) {
        if (!Array.isArray(g.passed) || g.passed.length !== SEATS || !g.passed.every((p) => isIds(p) && p.length === 3)) return null;
      }
      const done = g.phase === 'round' || g.phase === 'over';
      if (!Array.isArray(g.history) || g.history.length !== (done ? g.round : g.round - 1)) return null;
      let sums = [0, 0, 0, 0];
      for (const h of g.history) {
        if (!h || typeof h !== 'object' || !Array.isArray(h.pts) || h.pts.length !== SEATS || !h.pts.every((p) => isInt(p, 0, MOON))) return null;
        if (!isInt(h.moon, -1, 3)) return null;
        sums = sums.map((x, i) => x + h.pts[i]);
      }
      if (sums.some((x, i) => x !== g.scores[i])) return null;
      const l = g.last;
      if (l !== null && (!l || typeof l !== 'object' || !isSeatCards(l.cards) || l.cards.length !== SEATS || !isInt(l.winner, 0, 3))) return null;
      if (g.phase === 'pass') {
        if (g.tricks || g.trick.length || g.passed !== null || passOffset(g.round) === 0) return null;
      } else if (g.phase === 'play') {
        if (g.tricks === HAND || isOver(g.scores) || (passOffset(g.round) !== 0) !== (g.passed !== null)) return null;
      } else if (g.tricks !== HAND || (g.phase === 'over') !== isOver(g.scores)) {
        return null;
      }
      return clone(g);
    } catch (e) {
      return null;
    }
  }

  const api = {
    VERSION, SEATS, HUMAN, HAND, TARGET, LEVELS, QS,
    val, suitOf, cardPoints, sumPoints, passOffset, passTarget, passSource, received,
    newMatch, exchange, legalPlays, ledSuit, winning, play, roundPoints, isOver, nextRound, matchWinner,
    unseen, aiPass, aiPlay, moonThreat, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
