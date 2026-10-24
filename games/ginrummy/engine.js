/* =====================================================================
 * Gin Rummy - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Gin Rummy chuẩn 2 người, bộ 52 lá: ghế 0 là bạn, ghế 1 là máy.
 *   - Mỗi người 10 lá, lật một lá mở chồng bỏ (lá mời). Người không chia được nhặt lá mời trước hoặc bỏ qua,
 *     rồi tới người chia; cả hai bỏ qua thì người không chia rút nọc.
 *   - Mỗi lượt: rút một lá (nọc hoặc lá trên cùng chồng bỏ), rồi bỏ một lá (không được bỏ lại lá vừa nhặt từ chồng bỏ)
 *   - Bộ (meld): sám / tứ cùng bậc, hoặc sảnh ≥ 3 lá cùng chất liên tiếp (A thấp, không vòng K-A)
 *   - Lá lẻ (deadwood): lá không nằm trong bộ; A = 1, J/Q/K = 10, còn lại theo số
 *   - Knock khi lá lẻ ≤ 10 (sau khi bỏ lá); gin khi 0. Big gin (tùy chọn): cả 11 lá thành bộ, không cần bỏ lá
 *   - Bị knock (không phải gin): người kia được ghép lá lẻ vào bộ của người knock (lay off)
 *   - Điểm: knock thắng = chênh lệch lá lẻ; undercut (người bị knock ≤ người knock) = chênh lệch + 25;
 *     gin = 25 + lá lẻ đối thủ; big gin = 31 + lá lẻ đối thủ. Nọc còn 2 lá mà chưa ai knock: ván hòa
 *   - Chạm 100 điểm trước thì thắng trận; tổng kết cộng 100 thưởng trận, 25 mỗi ván thắng, thắng trắng ×2
 *   Lá lưu bằng id của ../_kit/cards.js ('AS', '10H', 'KD'); hàm nào cũng trả trạng thái mới, không đụng trạng thái cũ.
 *   PRNG (mulberry32 của cards.js) nằm trong trạng thái (rng) nên tải lại trang vẫn chia đúng lá cũ.
 *   Bên trong, phần tìm bộ dùng số nguyên 0..51 (chất × 13 + bậc − 1) và mặt nạ bit cho nhanh.
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const HUMAN = 0;
  const CPU = 1;
  const HAND = 10;
  const KNOCK_MAX = 10;
  const TARGET = 100;
  // Hệ số của máy (dò bằng mô phỏng hàng nghìn trận, xem README):
  //   md / mo: trọng số "lá nguy hiểm" / "lá ăn" của máy Vừa; hd / ho: của máy Khó
  //   kEarly: nọc còn ≥ chừng này lá thì máy Khó knock ngay; est0 / estT / estK / kMargin / kTook: ước lượng lá lẻ đối thủ
  const AI = { md: 2, mo: 0.5, hd: 0.7, ho: 1.1, kEarly: 22, kMargin: 6, kTook: 2, est0: 35, estT: 3.4, estK: 7 };
  const BONUS = { gin: 25, bigGin: 31, undercut: 25, box: 25, game: 100 };
  const STOCK_LEFT = 2; // nọc còn chừng này lá sau một lần bỏ lá mà chưa ai knock: ván hòa
  const LEVELS = ['easy', 'medium', 'hard'];
  const PHASES = ['upcard', 'draw', 'discard', 'round', 'over'];
  const KINDS = ['knock', 'gin', 'bigGin', 'draw'];
  const SUITS = C.SUITS;
  const ALL = C.newDeck().map(C.toId); // thứ tự cố định S H D C × A..K: chỉ số trong mảng chính là số nguyên của lá

  /* ---------------- Lá ↔ số ---------------- */
  const toInt = (id) => {
    const c = C.fromId(id);
    return SUITS.indexOf(c.suit) * 13 + c.rank - 1;
  };
  const toId = (n) => ALL[n];
  const rankI = (n) => (n % 13) + 1;
  const suitI = (n) => Math.floor(n / 13);
  const valI = (n) => Math.min(rankI(n), 10);
  /** Điểm lá lẻ của một lá. */
  const cardValue = (id) => Math.min(C.fromId(id).rank, 10);
  const ctz = (m) => 31 - Math.clz32(m & -m);
  const sumI = (a) => a.reduce((t, c) => t + valI(c), 0);

  /* ---------------- Tìm bộ ---------------- */

  /** Mọi bộ có thể trong tay (mảng số nguyên), dạng mặt nạ bit theo vị trí trong mảng. */
  function meldMasks(cards) {
    const out = [];
    const byRank = [];
    const pos = new Int8Array(52).fill(-1);
    cards.forEach((c, i) => {
      pos[c] = i;
      const r = c % 13;
      (byRank[r] = byRank[r] || []).push(i);
    });
    // Sám / tứ: tứ thì thêm cả 4 bộ sám con (để nhả một lá cho sảnh)
    byRank.forEach((g) => {
      if (!g || g.length < 3) return;
      const full = g.reduce((m, i) => m | (1 << i), 0);
      out.push(full);
      if (g.length === 4) g.forEach((i) => out.push(full & ~(1 << i)));
    });
    // Sảnh: mọi đoạn con dài ≥ 3 của các dãy liên tiếp cùng chất
    for (let s = 0; s < 4; s++) {
      for (let a = 0; a < 13; a++) {
        let m = 0;
        for (let b = a; b < 13 && pos[s * 13 + b] >= 0; b++) {
          m |= 1 << pos[s * 13 + b];
          if (b - a >= 2) out.push(m);
        }
      }
    }
    return out;
  }

  /**
   * Bộ giải cho một tay (≤ 11 lá): f(mask) = lá lẻ nhỏ nhất của các lá trong mask (quy hoạch động theo mặt nạ,
   * luôn xét lá có chỉ số nhỏ nhất: hoặc là lá lẻ, hoặc thuộc một bộ mà nó là lá nhỏ nhất).
   * arrange(mask) dựng lại cách xếp tối ưu: { melds: [[chỉ số]], dead: [chỉ số] }.
   */
  function solver(cards) {
    const n = cards.length;
    const vals = cards.map(valI);
    const melds = meldMasks(cards);
    const byLow = [];
    for (let i = 0; i < n; i++) byLow.push([]);
    melds.forEach((m) => byLow[ctz(m)].push(m));
    const memo = new Int16Array(1 << n).fill(-1);
    const pick = new Int32Array(1 << n);
    function f(mask) {
      if (!mask) return 0;
      if (memo[mask] >= 0) return memo[mask];
      const i = ctz(mask);
      let best = vals[i] + f(mask & ~(1 << i));
      let ch = 0;
      const list = byLow[i];
      for (let k = 0; k < list.length; k++) {
        const m = list[k];
        if ((m & mask) !== m) continue;
        const v = f(mask ^ m);
        if (v < best) {
          best = v;
          ch = m;
        }
      }
      memo[mask] = best;
      pick[mask] = ch;
      return best;
    }
    function arrange(mask) {
      const res = { melds: [], dead: [] };
      let m = mask;
      while (m) {
        f(m);
        const ch = pick[m];
        if (ch) {
          const idx = [];
          for (let i = 0; i < n; i++) if (ch & (1 << i)) idx.push(i);
          res.melds.push(idx);
          m ^= ch;
        } else {
          const i = ctz(m);
          res.dead.push(i);
          m &= ~(1 << i);
        }
      }
      return res;
    }
    return { n, full: (1 << n) - 1, f, arrange, melds, cards };
  }

  /** Sắp xếp hiển thị: sám theo chất, sảnh / lá lẻ theo chất rồi bậc. */
  const byRankSuit = (x, y) => (rankI(x) - rankI(y)) || (suitI(x) - suitI(y));
  const bySuitRank = (x, y) => (suitI(x) - suitI(y)) || (rankI(x) - rankI(y));
  const isSetInts = (a) => a.every((c) => c % 13 === a[0] % 13);
  const sortMeld = (a) => a.slice().sort(isSetInts(a) ? byRankSuit : bySuitRank);
  const meldOrder = (x, y) => byRankSuit(x[0], y[0]);

  /**
   * Xếp tay bài tối ưu: { melds: [[id]], deadwood: [id], dw: số điểm lá lẻ }.
   * Bộ xếp theo lá nhỏ nhất, lá lẻ xếp theo chất rồi bậc.
   */
  function analyze(hand) {
    const ints = hand.map(toInt);
    const s = solver(ints);
    const a = s.arrange(s.full);
    const melds = a.melds.map((idx) => sortMeld(idx.map((i) => ints[i]))).sort(meldOrder);
    const dead = a.dead.map((i) => ints[i]).sort(bySuitRank);
    return { melds: melds.map((m) => m.map(toId)), deadwood: dead.map(toId), dw: sumI(dead) };
  }
  const deadwood = (hand) => solver(hand.map(toInt)).f((1 << hand.length) - 1);

  /** Một nhóm lá có phải bộ hợp lệ không. */
  function isMeld(ids) {
    if (!Array.isArray(ids) || ids.length < 3) return false;
    const a = ids.map(toInt);
    if (new Set(a).size !== a.length) return false;
    if (isSetInts(a)) return a.length <= 4;
    if (!a.every((c) => suitI(c) === suitI(a[0]))) return false;
    const r = a.map(rankI).sort((x, y) => x - y);
    return r.every((x, i) => i === 0 || x === r[i - 1] + 1);
  }

  /** Mọi cách chọn tập bộ rời nhau (kể cả không chọn bộ nào), dạng mảng mặt nạ. */
  function allArrangements(melds) {
    const out = [];
    const cur = [];
    (function rec(start, used) {
      out.push(cur.slice());
      for (let k = start; k < melds.length; k++) {
        if (melds[k] & used) continue;
        cur.push(melds[k]);
        rec(k + 1, used | melds[k]);
        cur.pop();
      }
    })(0, 0);
    return out;
  }

  /**
   * Ghép lá lẻ (số nguyên) vào bộ của người knock (mảng các bộ số nguyên). Ghép dây chuyền tới khi không ghép được nữa;
   * lá vừa nối được sảnh vừa thành tứ thì nối sảnh (sảnh còn nối tiếp được, tứ thì đã đủ, nên không bao giờ thiệt).
   * Trả { laid: [{ card, meld }], rest: [số nguyên] }.
   */
  function layOffInts(melds, dead) {
    const ms = melds.map((m) => (isSetInts(m)
      ? { set: true, rank: m[0] % 13, size: m.length }
      : { set: false, suit: suitI(m[0]), lo: Math.min.apply(null, m) % 13, hi: Math.max.apply(null, m) % 13 }));
    let rest = dead.slice();
    const laid = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < rest.length; i++) {
        const c = rest[i];
        const r = c % 13;
        let k = ms.findIndex((m) => !m.set && m.suit === suitI(c) && (r === m.lo - 1 || r === m.hi + 1));
        if (k >= 0) {
          if (r < ms[k].lo) ms[k].lo = r;
          else ms[k].hi = r;
        } else {
          k = ms.findIndex((m) => m.set && m.rank === r && m.size < 4);
          if (k < 0) continue;
          ms[k].size++;
        }
        laid.push({ card: c, meld: k });
        rest = rest.slice(0, i).concat(rest.slice(i + 1));
        i--;
        changed = true;
      }
    }
    return { laid, rest };
  }

  /**
   * Tính điểm khi một người knock / gin. hands: tay hai người lúc lật bài (người knock 10 lá, big gin 11 lá).
   * Người knock bày cách xếp tối ưu (trong các cách cùng lá lẻ nhỏ nhất, chọn cách ít bị ghép nhất);
   * người bị knock chọn cách xếp + ghép lá để lá lẻ còn lại nhỏ nhất. Gin / big gin thì không được ghép.
   * Trả { kind: knock | undercut | gin | bigGin, knocker, winner, points, kdw, ddw, ddwBefore,
   *       k: { melds, dead }, d: { melds, dead, laid: [{ card, meld }] } } (lá là id).
   */
  function settle(hands, knocker, big) {
    const def = 1 - knocker;
    const ki = hands[knocker].map(toInt);
    const di = hands[def].map(toInt);
    const ks = solver(ki);
    const ds = solver(di);
    const kdw = ks.f(ks.full);
    const dmin = ds.f(ds.full);
    const meldsOf = (ints, masks) => masks.map((m) => sortMeld(ints.filter((_, i) => m & (1 << i)))).sort(meldOrder);
    const deadOf = (ints, masks) => {
      const used = masks.reduce((a, m) => a | m, 0);
      return ints.filter((_, i) => !(used & (1 << i))).sort(bySuitRank);
    };
    const asMasks = (s, a) => a.melds.map((idx) => idx.reduce((m, i) => m | (1 << i), 0));
    let kMasks;
    let dMasks;
    let laid = [];
    let dDead;
    if (kdw === 0) {
      // Gin: không ghép lá
      kMasks = asMasks(ks, ks.arrange(ks.full));
      dMasks = asMasks(ds, ds.arrange(ds.full));
      dDead = deadOf(di, dMasks);
    } else {
      const kOpts = allArrangements(ks.melds).filter((arr) => sumI(deadOf(ki, arr)) === kdw);
      const dOpts = allArrangements(ds.melds);
      let best = null;
      kOpts.forEach((ka) => {
        const km = meldsOf(ki, ka);
        let dBest = null;
        dOpts.forEach((da) => {
          const lo = layOffInts(km, deadOf(di, da));
          const left = sumI(lo.rest);
          if (!dBest || left < dBest.left || (left === dBest.left && lo.laid.length < dBest.lo.laid.length)) dBest = { left, da, lo };
        });
        if (!best || dBest.left > best.d.left) best = { ka, d: dBest };
      });
      kMasks = best.ka;
      dMasks = best.d.da;
      laid = best.d.lo.laid;
      dDead = best.d.lo.rest.slice().sort(bySuitRank);
    }
    const ddw = sumI(dDead);
    let kind;
    let winner;
    let points;
    if (kdw === 0) {
      kind = big ? 'bigGin' : 'gin';
      winner = knocker;
      points = (big ? BONUS.bigGin : BONUS.gin) + ddw;
    } else if (kdw < ddw) {
      kind = 'knock';
      winner = knocker;
      points = ddw - kdw;
    } else {
      kind = 'undercut';
      winner = def;
      points = kdw - ddw + BONUS.undercut;
    }
    const ids = (a) => a.map(toId);
    const kMelds = meldsOf(ki, kMasks);
    return {
      kind,
      knocker,
      winner,
      points,
      kdw,
      ddw,
      ddwBefore: dmin,
      k: { melds: kMelds.map(ids), dead: ids(deadOf(ki, kMasks)) },
      d: {
        melds: meldsOf(di, dMasks).map(ids),
        dead: ids(dDead),
        laid: laid.map((l) => ({ card: toId(l.card), meld: l.meld })),
      },
    };
  }

  /* ---------------- Trạng thái ---------------- */

  /** Bản sao trạng thái, thứ tự khóa cố định (lưu / so sánh dựa vào nó). */
  function clone(g) {
    return {
      level: g.level,
      bigGin: g.bigGin, // bật điểm big gin (31) hay không
      scores: g.scores.slice(),
      boxes: g.boxes.slice(), // số ván thắng của mỗi người trong trận
      round: g.round,
      dealer: g.dealer,
      rng: g.rng,
      stock: g.stock.slice(), // nọc: lá cuối mảng là lá trên cùng
      discard: g.discard.slice(), // chồng bỏ: lá cuối mảng là lá trên cùng
      hands: g.hands.map((h) => h.slice()),
      turn: g.turn,
      phase: g.phase, // upcard | draw | discard | round (hết ván, chờ sang ván) | over (hết trận)
      passes: g.passes, // số người đã bỏ qua lá mời (pha upcard)
      mustStock: g.mustStock, // cả hai bỏ qua lá mời: người đi đầu buộc rút nọc
      taken: g.taken, // lá vừa nhặt từ chồng bỏ (không được bỏ lại ngay), null nếu rút nọc / chưa rút
      took: g.took.map((a) => a.slice()), // lá mỗi người đã nhặt từ chồng bỏ trong ván (ai cũng thấy)
      threw: g.threw.map((a) => a.slice()), // lá mỗi người đã bỏ trong ván
      passed: g.passed.map((a) => a.slice()), // lá mời / lá trên chồng bỏ mỗi người đã không nhặt
      end: g.end ? { kind: g.end.kind, knocker: g.end.knocker } : null, // cách ván kết thúc (kết quả tính lại từ tay bài)
      result: g.result || null, // kết quả ván (settle), dựng lại từ end + hands khi mở ván lưu
      moves: g.moves,
      humanMoves: g.humanMoves, // số nước của bạn trong trận (bỏ trận khi > 0 tính là thua)
      last: g.last ? Object.assign({}, g.last) : null, // nước vừa đi: { seat, type, card?, from? }
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

  /** Chia ván mới (trong g, đã là bản sao): xáo 52 lá, chia 10 lá mỗi người bắt đầu từ người không chia, lật lá mời. */
  function deal(g) {
    withRng(g, (r) => {
      const deck = C.shuffle(ALL, r);
      const hands = [[], []];
      for (let k = 0; k < HAND; k++) {
        hands[1 - g.dealer].push(deck.pop());
        hands[g.dealer].push(deck.pop());
      }
      g.discard = [deck.pop()];
      g.stock = deck;
      g.hands = hands;
    });
    g.turn = 1 - g.dealer;
    g.phase = 'upcard';
    g.passes = 0;
    g.mustStock = false;
    g.taken = null;
    g.took = [[], []];
    g.threw = [[], []];
    g.passed = [[], []];
    g.end = null;
    g.result = null;
    g.last = null;
    return g;
  }

  /** Trận mới. opts: { seed, level: 'easy' | 'medium' | 'hard', bigGin: true }. Máy chia ván 1 nên bạn đi trước. */
  function newMatch(opts) {
    const o = opts || {};
    const r = C.rng(o.seed);
    const g = clone({
      level: LEVELS.indexOf(o.level) >= 0 ? o.level : 'easy',
      bigGin: o.bigGin !== false,
      scores: [0, 0],
      boxes: [0, 0],
      round: 1,
      dealer: CPU,
      rng: r.getState(),
      stock: [],
      discard: [],
      hands: [[], []],
      turn: HUMAN,
      phase: 'upcard',
      passes: 0,
      mustStock: false,
      taken: null,
      took: [[], []],
      threw: [[], []],
      passed: [[], []],
      end: null,
      result: null,
      moves: 0,
      humanMoves: 0,
      last: null,
    });
    return deal(g);
  }

  const top = (g) => (g.discard.length ? g.discard[g.discard.length - 1] : null);
  const playing = (g) => g.phase === 'upcard' || g.phase === 'draw' || g.phase === 'discard';

  /** Lá lẻ còn lại nếu người đang tới lượt (11 lá) bỏ lá `id`. */
  function deadwoodAfter(g, id) {
    const h = g.hands[g.turn];
    const i = h.indexOf(id);
    if (i < 0) return null;
    return deadwood(h.slice(0, i).concat(h.slice(i + 1)));
  }

  /** Mọi nước hợp lệ của người đang tới lượt. */
  function legalActions(g) {
    if (g.phase === 'upcard') return [{ type: 'draw', from: 'discard' }, { type: 'pass' }];
    if (g.phase === 'draw') {
      const out = [];
      if (g.stock.length) out.push({ type: 'draw', from: 'stock' });
      if (!g.mustStock && g.discard.length) out.push({ type: 'draw', from: 'discard' });
      return out;
    }
    if (g.phase !== 'discard') return [];
    const h = g.hands[g.turn];
    const s = solver(h.map(toInt));
    const out = [];
    h.forEach((id, i) => {
      if (id === g.taken) return;
      out.push({ type: 'discard', card: id });
      if (s.f(s.full & ~(1 << i)) <= KNOCK_MAX) out.push({ type: 'knock', card: id });
    });
    if (g.bigGin && s.f(s.full) === 0) out.push({ type: 'bigGin' });
    return out;
  }

  const sameAction = (a, b) => a.type === b.type && (a.card || null) === (b.card || null) && (a.from || null) === (b.from || null);
  function isLegal(g, a) {
    if (!a || typeof a !== 'object') return false;
    return legalActions(g).some((b) => sameAction(a, b));
  }

  /** Kết thúc ván: lưu cách kết thúc, tính điểm, cộng vào trận. */
  function finishRound(g, kind, knocker) {
    g.end = { kind, knocker };
    g.taken = null;
    if (kind === 'draw') {
      g.result = { kind: 'draw', knocker: null, winner: null, points: 0 };
    } else {
      g.result = settle(g.hands, knocker, kind === 'bigGin');
      g.scores[g.result.winner] += g.result.points;
      g.boxes[g.result.winner]++;
    }
    g.phase = g.scores.some((s) => s >= TARGET) ? 'over' : 'round';
  }

  /** Áp một nước (phải hợp lệ), trả trạng thái mới. Nước sai luật thì ném lỗi. */
  function apply(g0, a) {
    if (!isLegal(g0, a)) throw new Error('illegal action ' + JSON.stringify(a));
    const g = clone(g0);
    const p = g.turn;
    g.moves++;
    if (p === HUMAN) g.humanMoves++;
    if (a.type === 'pass') {
      g.passed[p].push(top(g));
      g.passes++;
      g.last = { seat: p, type: 'pass', card: top(g) };
      if (g.passes >= 2) {
        // Cả hai bỏ qua lá mời: người không chia rút nọc
        g.phase = 'draw';
        g.mustStock = true;
        g.turn = 1 - g.dealer;
      } else {
        g.turn = 1 - p;
      }
      return g;
    }
    if (a.type === 'draw') {
      let card;
      if (a.from === 'discard') {
        card = g.discard.pop();
        g.taken = card;
        g.took[p].push(card);
      } else {
        if (g.discard.length && !g.mustStock) g.passed[p].push(top(g));
        card = g.stock.pop();
        g.taken = null;
      }
      g.hands[p].push(card);
      g.phase = 'discard';
      g.mustStock = false;
      g.last = { seat: p, type: 'draw', from: a.from, card: a.from === 'discard' ? card : null };
      return g;
    }
    if (a.type === 'bigGin') {
      g.last = { seat: p, type: 'bigGin' };
      finishRound(g, 'bigGin', p);
      return g;
    }
    // discard / knock: bỏ một lá lên chồng bỏ
    const h = g.hands[p];
    h.splice(h.indexOf(a.card), 1);
    g.discard.push(a.card);
    g.threw[p].push(a.card);
    g.taken = null;
    if (a.type === 'knock') {
      g.last = { seat: p, type: 'knock', card: a.card };
      finishRound(g, deadwood(h) === 0 ? 'gin' : 'knock', p);
      return g;
    }
    g.last = { seat: p, type: 'discard', card: a.card };
    if (g.stock.length <= STOCK_LEFT) {
      finishRound(g, 'draw', null);
      return g;
    }
    g.turn = 1 - p;
    g.phase = 'draw';
    return g;
  }

  /** Sang ván sau: ván hòa thì người chia cũ chia lại, không thì đổi người chia. */
  function nextRound(g0) {
    if (g0.phase !== 'round') return g0;
    const g = clone(g0);
    if (g.end.kind !== 'draw') g.dealer = 1 - g.dealer;
    g.round++;
    return deal(g);
  }

  const matchWinner = (g) => (g.phase === 'over' ? (g.scores[HUMAN] >= TARGET ? HUMAN : CPU) : null);

  /** Tổng kết trận: điểm ván + 100 thưởng trận + 25 mỗi ván thắng; người thua không thắng ván nào thì ×2. */
  function finalScores(g) {
    const w = matchWinner(g);
    if (w === null) return null;
    return [0, 1].map((p) => {
      const base = g.scores[p];
      const game = p === w ? BONUS.game : 0;
      const box = g.boxes[p] * BONUS.box;
      const shutout = p === w && g.boxes[1 - p] === 0;
      return { base, game, box, shutout, total: (base + game + box) * (shutout ? 2 : 1) };
    });
  }

  /* ---------------- Máy ----------------
   * Máy chỉ dùng thông tin công khai: tay mình, chồng bỏ, lá đối thủ đã nhặt / đã bỏ / đã không nhặt.
   *   Dễ: nhặt lá mời / lá bỏ chỉ khi nó vào bộ ngay; bỏ lá lẻ cao nhất; knock ngay khi được.
   *   Vừa: thêm nhặt lá giúp knock ngay; theo dõi lá đối thủ nhặt / bỏ, tránh bỏ lá họ cần; giữ cặp còn nhiều lá ăn.
   *   Khó: thêm đếm lá "ăn" còn chưa thấy (xác suất cải thiện), ước lượng xác suất đối thủ ghép được lá mình bỏ,
   *        knock theo thời điểm (đầu ván knock ngay, về sau cảnh giác undercut).
   */

  /** Lá đối thủ của p chắc chắn đang giữ: đã nhặt từ chồng bỏ và chưa bỏ ra lại (chỉ dựa vào thông tin công khai). */
  function knownOpp(g, p) {
    const q = 1 - p;
    const out = [];
    g.took[q].forEach((id) => {
      const n = g.took[q].filter((x) => x === id).length - g.threw[q].filter((x) => x === id).length;
      if (n > 0 && out.indexOf(toInt(id)) < 0) out.push(toInt(id));
    });
    return out;
  }

  /** Lá chưa thấy với người chơi p (1 = chưa thấy): không ở tay mình, không trên chồng bỏ, không phải lá đối thủ đang giữ đã lộ. */
  function unseenFor(g, p) {
    const u = new Uint8Array(52).fill(1);
    g.hands[p].forEach((id) => { u[toInt(id)] = 0; });
    g.discard.forEach((id) => { u[toInt(id)] = 0; });
    knownOpp(g, p).forEach((c) => { u[c] = 0; });
    return u;
  }

  /**
   * Số lá "ăn" (outs) của một cách xếp: lá chưa thấy mà rút được sẽ nối vào bộ hoặc ghép thành bộ mới với lá lẻ.
   * Mỗi lá đếm một lần.
   */
  function outsOf(ints, arr, unseen) {
    const outs = new Set();
    const add = (c) => {
      if (unseen[c]) outs.add(c);
    };
    const near = (c, d) => {
      const r = (c % 13) + d;
      if (r >= 0 && r < 13) add(suitI(c) * 13 + r);
    };
    arr.melds.forEach((idx) => {
      const m = idx.map((i) => ints[i]);
      if (isSetInts(m)) {
        for (let s = 0; s < 4; s++) add(s * 13 + (m[0] % 13));
      } else {
        near(Math.min.apply(null, m), -1);
        near(Math.max.apply(null, m), 1);
      }
    });
    const dead = arr.dead.map((i) => ints[i]);
    for (let i = 0; i < dead.length; i++) {
      for (let j = i + 1; j < dead.length; j++) {
        const a = dead[i];
        const b = dead[j];
        if (a % 13 === b % 13) {
          for (let s = 0; s < 4; s++) add(s * 13 + (a % 13));
        } else if (suitI(a) === suitI(b)) {
          const lo = Math.min(a, b);
          const d = Math.abs(a - b);
          if (d === 1) {
            near(lo, -1);
            near(lo, 2);
          } else if (d === 2) near(lo, 1);
        }
      }
    }
    return outs.size;
  }

  /**
   * Mức nguy hiểm khi p bỏ lá c (số càng lớn càng dễ giúp đối thủ thành bộ).
   * Vừa: dựa vào lá đối thủ đã nhặt (đang giữ) và đã bỏ / không nhặt.
   * Khó: thêm xác suất thô đối thủ đang giữ cả hai lá của một cặp ghép được với c.
   */
  function danger(g, p, c, level, unseen, known) {
    const q = 1 - p;
    const r = c % 13;
    const s = suitI(c);
    let d = 0;
    known.forEach((t) => {
      if (t % 13 === r) d += 1.2;
      else if (suitI(t) === s && Math.abs(t - c) <= 2) d += Math.abs(t - c) === 1 ? 1.2 : 0.8;
    });
    g.threw[q].concat(g.passed[q]).forEach((id) => {
      const t = toInt(id);
      if (t % 13 === r) d -= 0.35;
      else if (suitI(t) === s && Math.abs(t - c) === 1) d -= 0.25;
    });
    if (level !== 'hard') return d;
    let U = 0;
    for (let i = 0; i < 52; i++) U += unseen[i];
    const hidden = g.hands[q].length - known.length;
    const pr = U ? Math.min(1, hidden / U) : 0;
    const has = (rr) => (rr >= 0 && rr < 13 ? unseen[s * 13 + rr] : 0);
    let same = 0;
    for (let k = 0; k < 4; k++) if (k !== s) same += unseen[k * 13 + r];
    // Lá đối thủ đang giữ đã lộ cũng tính là "có chắc"
    const held = (rr) => (rr >= 0 && rr < 13 && known.indexOf(s * 13 + rr) >= 0 ? 1 : 0);
    const one = (rr) => held(rr) + has(rr) * pr;
    let combos = (same * (same - 1) / 2) * pr * pr;
    combos += one(r - 2) * one(r - 1) + one(r - 1) * one(r + 1) + one(r + 1) * one(r + 2);
    return d + combos * 3;
  }

  /** Ước lượng lá lẻ của đối thủ (máy Khó dùng để tránh bị undercut). */
  function estimateOpp(g, p, known) {
    const turns = g.threw[1 - p].length;
    return Math.max(4, AI.est0 - turns * AI.estT - known.length * AI.estK);
  }

  /** Có nên nhặt lá c (lá mời / lá trên chồng bỏ) không. */
  function wantCard(g, p, c, level) {
    const hand = g.hands[p];
    const cur = deadwood(hand);
    const ints = hand.concat([c]).map(toInt);
    const s = solver(ints);
    const ci = ints.length - 1;
    let best = Infinity;
    let bestMask = 0;
    for (let i = 0; i < ci; i++) {
      const m = s.full & ~(1 << i);
      const v = s.f(m);
      if (v < best) {
        best = v;
        bestMask = m;
      }
    }
    const inMeld = s.arrange(bestMask).melds.some((idx) => idx.indexOf(ci) >= 0);
    if (inMeld && best < cur) return true;
    if (level === 'easy') return false;
    // Nhặt được rồi knock ngay (mọi điều kiện nhặt đều làm lá lẻ giảm hẳn: hai máy không thể đổi lá qua lại mãi)
    if (best <= KNOCK_MAX && cur > KNOCK_MAX) return true;
    // Khó: lá rất nhỏ thay lá to đầu ván (giảm lá lẻ mạnh, đỡ bị undercut)
    return level === 'hard' && cur - best >= 8 && valI(toInt(c)) <= 2 && g.stock.length > 20;
  }

  /** Có nên knock với lá lẻ dw (đã ≤ 10) không. */
  function shouldKnock(g, p, dw, level) {
    if (dw === 0 || level !== 'hard') return true;
    const stock = g.stock.length;
    if (stock <= 6) return true; // sắp hết nọc: knock kẻo ván hòa
    const known = knownOpp(g, p);
    if (stock >= AI.kEarly && known.length < 2) return true; // đầu ván: knock ngay
    return dw <= Math.min(KNOCK_MAX, estimateOpp(g, p, known) - AI.kMargin - known.length * AI.kTook);
  }

  /** Chọn lá bỏ (không knock) trong các vị trí `cands` của tay 11 lá (solver s). */
  function chooseDiscard(g, p, level, s, cands) {
    const ints = s.cards;
    const unseen = level === 'easy' ? null : unseenFor(g, p);
    const known = level === 'easy' ? null : knownOpp(g, p);
    let best = null;
    cands.forEach((i) => {
      const m = s.full & ~(1 << i);
      const dw = s.f(m);
      const c = ints[i];
      let score;
      if (level === 'easy') score = dw * 10 - valI(c) * 0.1;
      else if (level === 'medium') score = dw - outsOf(ints, s.arrange(m), unseen) * AI.mo + danger(g, p, c, level, unseen, known) * AI.md - valI(c) * 0.01;
      else score = dw - outsOf(ints, s.arrange(m), unseen) * AI.ho + danger(g, p, c, level, unseen, known) * AI.hd - valI(c) * 0.01;
      if (!best || score < best.score) best = { score, i };
    });
    return ints[best.i];
  }

  /** Nước của máy cho người đang tới lượt theo mức (mặc định mức của trận). Luôn là nước hợp lệ. */
  function aiAction(g, level) {
    const lv = level || g.level;
    const p = g.turn;
    if (g.phase === 'upcard') return wantCard(g, p, top(g), lv) ? { type: 'draw', from: 'discard' } : { type: 'pass' };
    if (g.phase === 'draw') {
      const canTake = !g.mustStock && g.discard.length;
      if (canTake && (!g.stock.length || wantCard(g, p, top(g), lv))) return { type: 'draw', from: 'discard' };
      return { type: 'draw', from: 'stock' };
    }
    if (g.phase !== 'discard') return null;
    const hand = g.hands[p];
    const ints = hand.map(toInt);
    const s = solver(ints);
    if (g.bigGin && s.f(s.full) === 0) return { type: 'bigGin' };
    const cands = [];
    for (let i = 0; i < hand.length; i++) if (hand[i] !== g.taken) cands.push(i);
    // Lá bỏ để knock: lá lẻ còn lại nhỏ nhất (bằng nhau thì bỏ lá to)
    let kBest = null;
    cands.forEach((i) => {
      const dw = s.f(s.full & ~(1 << i));
      if (!kBest || dw < kBest.dw || (dw === kBest.dw && valI(ints[i]) > valI(ints[kBest.i]))) kBest = { dw, i };
    });
    if (kBest.dw <= KNOCK_MAX && shouldKnock(g, p, kBest.dw, lv)) return { type: 'knock', card: hand[kBest.i] };
    return { type: 'discard', card: toId(chooseDiscard(g, p, lv, s, cands)) };
  }

  /** Bot ngẫu nhiên hợp lệ (chỉ để test so sánh). rnd: hàm → [0, 1). */
  function randomAction(g, rnd) {
    const acts = legalActions(g);
    return acts[Math.floor(rnd() * acts.length)];
  }

  /* ---------------- Lưu ---------------- */
  /** Dạng lưu: mọi khóa của clone trừ result (dựng lại từ end + hands khi mở). */
  function toJSON(g) {
    const o = clone(g);
    delete o.result;
    return Object.assign({ v: VERSION }, o);
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && (hi === undefined || x <= hi);
  const isId = (x) => typeof x === 'string' && !!C.fromId(x) && C.toId(C.fromId(x)) === x;
  const isIds = (a) => Array.isArray(a) && a.every(isId);
  const isPair = (a, f) => Array.isArray(a) && a.length === 2 && a.every(f);

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia trận mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    try {
      const g = raw;
      if (LEVELS.indexOf(g.level) < 0 || typeof g.bigGin !== 'boolean') return null;
      if (!isPair(g.scores, (s) => isInt(s, 0, 1000)) || !isPair(g.boxes, (s) => isInt(s, 0, 1000))) return null;
      if (!isInt(g.round, 1) || !isInt(g.dealer, 0, 1) || !isInt(g.turn, 0, 1) || !isInt(g.rng, 0, 4294967295)) return null;
      if (!isIds(g.stock) || !isIds(g.discard) || !isPair(g.hands, isIds)) return null;
      const all = g.stock.concat(g.discard, g.hands[0], g.hands[1]);
      if (all.length !== 52 || new Set(all).size !== 52) return null;
      if (PHASES.indexOf(g.phase) < 0 || !isInt(g.passes, 0, 2) || typeof g.mustStock !== 'boolean') return null;
      if (!isPair(g.took, isIds) || !isPair(g.threw, isIds) || !isPair(g.passed, isIds)) return null;
      if (!isInt(g.moves, 0) || !isInt(g.humanMoves, 0, g.moves)) return null;
      if (g.taken !== null && !isId(g.taken)) return null;
      const len = g.hands.map((h) => h.length);
      const over = g.scores.filter((s) => s >= TARGET).length;
      let out;
      if (playing(g)) {
        if (g.end !== null || over) return null;
        const t = g.turn;
        if (len[t] !== (g.phase === 'discard' ? 11 : HAND) || len[1 - t] !== HAND) return null;
        if (g.phase !== 'discard' && !g.discard.length) return null;
        if (g.phase === 'upcard' && (g.passes > 1 || g.mustStock || g.taken !== null || g.stock.length !== 31)) return null;
        if (g.phase === 'draw' && (g.taken !== null || g.stock.length <= STOCK_LEFT)) return null;
        if (g.phase === 'discard' && (g.mustStock || (g.taken !== null && g.hands[t].indexOf(g.taken) < 0))) return null;
        out = clone(Object.assign({}, g, { end: null, result: null }));
      } else {
        const e = g.end;
        if (!e || typeof e !== 'object' || KINDS.indexOf(e.kind) < 0 || g.taken !== null) return null;
        if (e.kind === 'draw') {
          if (e.knocker !== null || len[0] !== HAND || len[1] !== HAND || g.stock.length > STOCK_LEFT) return null;
        } else {
          if (!isInt(e.knocker, 0, 1)) return null;
          const k = e.knocker;
          if (len[1 - k] !== HAND || len[k] !== (e.kind === 'bigGin' ? 11 : HAND)) return null;
          const dw = deadwood(g.hands[k]);
          if (dw > KNOCK_MAX || (e.kind !== 'knock') !== (dw === 0)) return null;
          if (e.kind === 'bigGin' && !g.bigGin) return null;
        }
        if (g.phase === 'over' ? over !== 1 : over) return null;
        out = clone(Object.assign({}, g, { result: null }));
        out.result = e.kind === 'draw' ? { kind: 'draw', knocker: null, winner: null, points: 0 } : settle(out.hands, e.knocker, e.kind === 'bigGin');
      }
      const l = g.last;
      if (l !== null) {
        if (!l || typeof l !== 'object' || !isInt(l.seat, 0, 1) || ['pass', 'draw', 'discard', 'knock', 'bigGin'].indexOf(l.type) < 0) return null;
        if (l.card != null && !isId(l.card)) return null;
        if (l.from != null && l.from !== 'stock' && l.from !== 'discard') return null;
        const x = { seat: l.seat, type: l.type };
        if (l.from != null) x.from = l.from;
        if (l.card !== undefined) x.card = l.card;
        out.last = x;
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  const api = {
    VERSION, HUMAN, CPU, HAND, KNOCK_MAX, TARGET, BONUS, LEVELS, STOCK_LEFT,
    cardValue, analyze, deadwood, deadwoodAfter, isMeld, settle, newMatch, top, playing,
    legalActions, isLegal, apply, nextRound, matchWinner, finalScores,
    aiAction, randomAction, toJSON, fromJSON,
    _internal: { toInt, toId, solver, meldMasks, layOffInts, outsOf, unseenFor, knownOpp },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
