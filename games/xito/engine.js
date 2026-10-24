/* =====================================================================
 * Xì Tố - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Texas Hold'em no-limit, giải đấu 4 người (ghế 0 = người chơi, ghế 1..3 = máy), mỗi người 1000 chip ảo.
 *   - Mù tăng mỗi 6 ván (10/20, 15/30, 20/40 …) để giải kết thúc trong khoảng 10–20 phút
 *   - Nút dealer xoay theo người còn chip; còn 2 người thì nút đặt mù nhỏ và nói trước lúc pre-flop
 *   - Đủ luật cược: check / call / bet / raise (tối thiểu bằng lần tố trước) / fold / all-in;
 *     all-in thiếu không mở lại quyền tố cho người đã nói; tiền cược không ai theo được trả lại
 *   - Pot phụ theo từng mức góp, so bài 5 lá tốt nhất từ 7 lá, chia pot lẻ: chip dư cho người gần bên trái nút trước
 *   - Bài: lá là số 0..51 (bậc 2..14 × 4 chất), bộ bài của ván xáo bằng PNCards từ hạt giống (handRng)
 *   - Máy: easy (lỏng, dễ đoán), medium (Monte Carlo + pot odds), hard (thêm vị thế, đoán dải bài đối thủ,
 *     bluff có tần suất theo tỉ lệ bỏ bài của đối thủ, sizing theo pot / stack); tất định theo hạt giống `ai`
 *   Hàm thuần: nhận trạng thái cũ, trả trạng thái mới; toJSON / fromJSON để lưu ván (từ chối dữ liệu hỏng).
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SEATS = 4;
  const HUMAN = 0;
  const START_CHIPS = 1000;
  const TOTAL = SEATS * START_CHIPS;
  const HANDS_PER_LEVEL = 6;
  /** Mù nhỏ theo cấp; mù lớn = 2 × mù nhỏ. Cấp cuối giữ nguyên tới hết giải. */
  const SMALL_BLINDS = [10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000];
  const LEVELS = ['easy', 'medium', 'hard'];
  /** Loại tay từ thấp tới cao (thùng phá sảnh tới A là "royal" khi hiển thị). */
  const CATS = ['high', 'pair', 'twopair', 'trips', 'straight', 'flush', 'full', 'quads', 'sflush'];
  const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const BOARD_N = [0, 3, 4, 5, 5];
  /** Vị trí 5 lá chung trong bộ đã xáo (8 lá đầu là bài tẩy, có đốt 1 lá trước mỗi vòng). */
  const BOARD_POS = [9, 10, 11, 13, 15];
  const SUIT_IDX = { S: 0, H: 1, D: 2, C: 3 };

  /* ---------------- Lá bài ---------------- */

  const rankOf = (x) => (x >> 2) + 2; // 2..14 (A = 14)
  const cardInt = (c) => ((c.rank === 1 ? 14 : c.rank) - 2) * 4 + SUIT_IDX[c.suit];
  function toCard(x) {
    const r = rankOf(x);
    return { rank: r === 14 ? 1 : r, suit: C.SUITS[x & 3] };
  }
  const toId = (x) => C.toId(toCard(x));
  function fromId(id) {
    const c = C.fromId(id);
    return c ? cardInt(c) : -1;
  }

  /* ---------------- Chấm bài ---------------- */

  // Điểm một tay = loại × 2^20 + 5 bậc quyết định (4 bit mỗi bậc): so điểm là so tay
  const pack = (cat, a, b, c, d, e) => cat * 1048576 + (a << 16) + ((b || 0) << 12) + ((c || 0) << 8) + ((d || 0) << 4) + (e || 0);
  const catOf = (sc) => Math.floor(sc / 1048576);

  /** Bậc cao nhất của sảnh trong mặt nạ bậc (bit r = có bậc r), 0 nếu không có. A dùng được làm 1 (A-2-3-4-5). */
  function straightHigh(mask) {
    if (mask & (1 << 14)) mask |= 2;
    for (let h = 14; h >= 5; h--) if (((mask >> (h - 4)) & 31) === 31) return h;
    return 0;
  }

  const cnt = new Int8Array(15);
  const suitMask = new Int32Array(4);
  const suitCnt = new Int8Array(4);
  const kick = [0, 0, 0, 0, 0];

  /** Lấy tối đa n bậc lớn nhất (khác nhau) trong mặt nạ, bỏ các bậc x1, x2. */
  function topRanks(mask, n, x1, x2) {
    let k = 0;
    for (let r = 14; r >= 2 && k < n; r--) {
      if ((mask & (1 << r)) && r !== x1 && r !== x2) kick[k++] = r;
    }
    for (; k < 5; k++) kick[k] = 0;
    return kick;
  }

  /**
   * Điểm tay tốt nhất từ `n` lá đầu của mảng (5..7 lá; ít hơn vẫn chấm được đôi / sám / thú).
   * Chấm trực tiếp theo bộ đếm bậc / chất, không duyệt 21 tổ hợp: đủ nhanh cho Monte Carlo.
   */
  function score(cards, n) {
    const len = n == null ? cards.length : n;
    cnt.fill(0);
    suitMask[0] = suitMask[1] = suitMask[2] = suitMask[3] = 0;
    suitCnt[0] = suitCnt[1] = suitCnt[2] = suitCnt[3] = 0;
    let mask = 0;
    for (let i = 0; i < len; i++) {
      const x = cards[i];
      const r = (x >> 2) + 2;
      const s = x & 3;
      cnt[r]++;
      suitMask[s] |= 1 << r;
      suitCnt[s]++;
      mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) fs = s;
    if (fs >= 0) {
      const sh = straightHigh(suitMask[fs]);
      if (sh) return pack(8, sh);
    }
    let quad = 0;
    let t1 = 0;
    let t2 = 0;
    let p1 = 0;
    let p2 = 0;
    for (let r = 14; r >= 2; r--) {
      const c = cnt[r];
      if (c === 4) quad = r;
      else if (c === 3) {
        if (!t1) t1 = r;
        else if (!t2) t2 = r;
      } else if (c === 2) {
        if (!p1) p1 = r;
        else if (!p2) p2 = r;
      }
    }
    if (quad) return pack(7, quad, topRanks(mask, 1, quad)[0]);
    if (t1 && (t2 || p1)) return pack(6, t1, Math.max(t2, p1));
    if (fs >= 0) {
      const k = topRanks(suitMask[fs], 5);
      return pack(5, k[0], k[1], k[2], k[3], k[4]);
    }
    const sh = straightHigh(mask);
    if (sh) return pack(4, sh);
    if (t1) {
      const k = topRanks(mask, 2, t1);
      return pack(3, t1, k[0], k[1]);
    }
    if (p1 && p2) return pack(2, p1, p2, topRanks(mask, 1, p1, p2)[0]);
    if (p1) {
      const k = topRanks(mask, 3, p1);
      return pack(1, p1, k[0], k[1], k[2]);
    }
    const k = topRanks(mask, 5);
    return pack(0, k[0], k[1], k[2], k[3], k[4]);
  }

  /** Mô tả điểm: { cat: 'pair' | … | 'royal', a, b } (a, b: bậc chính, A = 14) để giao diện ghi tên tay. */
  function describe(sc) {
    const i = catOf(sc);
    const a = (sc >> 16) & 15;
    const b = (sc >> 12) & 15;
    return { cat: i === 8 && a === 14 ? 'royal' : CATS[i], a, b };
  }

  /** 5 lá làm nên tay tốt nhất trong 5..7 lá (để tô sáng khi so bài). */
  function bestFive(cards) {
    const target = score(cards);
    const n = cards.length;
    const pick = [0, 0, 0, 0, 0];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
      for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
        pick[0] = cards[a];
        pick[1] = cards[b];
        pick[2] = cards[c];
        pick[3] = cards[d];
        pick[4] = cards[e];
        if (score(pick, 5) === target) return pick.slice();
      }
    }
    return cards.slice(0, 5);
  }

  /* ---------------- Độ mạnh bài tẩy (công thức Chen) → phân vị trong 1326 cặp ---------------- */

  function chen(x, y) {
    let hi = rankOf(x);
    let lo = rankOf(y);
    if (lo > hi) {
      const t = hi;
      hi = lo;
      lo = t;
    }
    const pts = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
    let s = pts(hi);
    if (hi === lo) return Math.max(5, s * 2);
    if ((x & 3) === (y & 3)) s += 2;
    const gap = hi - lo - 1;
    s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && hi < 12) s += 1;
    return s;
  }
  /** PCT[x * 52 + y]: tỉ lệ cặp bài tẩy yếu hơn cặp (x, y) (0..1). */
  const PCT = new Float32Array(52 * 52);
  (function buildPct() {
    const all = [];
    for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) all.push([x, y, chen(x, y)]);
    all.sort((p, q) => p[2] - q[2]);
    let i = 0;
    while (i < all.length) {
      let j = i;
      while (j < all.length && all[j][2] === all[i][2]) j++;
      const v = (i + (j - i) / 2) / all.length;
      for (let k = i; k < j; k++) PCT[all[k][0] * 52 + all[k][1]] = PCT[all[k][1] * 52 + all[k][0]] = v;
      i = j;
    }
  })();
  const pct = (x, y) => PCT[x * 52 + y];

  /* ---------------- Bộ bài của ván ---------------- */

  /** Xáo bộ bài từ trạng thái rng; trả { deck (mảng số 0..51), after (trạng thái rng sau khi xáo) }. */
  function shuffleFrom(state) {
    const r = C.rng(0);
    r.setState(state);
    const deck = C.shuffle(C.newDeck(), r).map(cardInt);
    return { deck, after: r.getState() };
  }
  const holeOf = (h, s) => [h.deck[s], h.deck[s + SEATS]];
  const boardOf = (h) => BOARD_POS.slice(0, BOARD_N[h.street]).map((p) => h.deck[p]);

  /** Mù của ván thứ `index` (0 = ván đầu). */
  function blindsFor(index) {
    const level = Math.min(SMALL_BLINDS.length - 1, Math.floor(index / HANDS_PER_LEVEL));
    return { level, sb: SMALL_BLINDS[level], bb: 2 * SMALL_BLINDS[level] };
  }

  /* ---------------- Trạng thái ---------------- */

  function nextSeat(from, pred) {
    for (let i = 1; i <= SEATS; i++) {
      const s = (from + i) % SEATS;
      if (pred(s)) return s;
    }
    return -1;
  }
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  function clone(g) {
    const n = Object.assign({}, g);
    n.chips = g.chips.slice();
    n.profile = g.profile.map((p) => Object.assign({}, p));
    if (g.h) {
      const h = Object.assign({}, g.h);
      ['inHand', 'folded', 'bets', 'committed', 'acted', 'raises', 'aggr'].forEach((k) => { h[k] = g.h[k].slice(); });
      h.log = g.h.log.slice();
      n.h = h;
    }
    return n;
  }

  const newProfile = () => ({ acts: 0, raises: 0, faced: 0, folds: 0 });

  /** Giải mới. seed: số nguyên 32 bit; level: 'easy' | 'medium' | 'hard'. Ván đầu được chia luôn. */
  function newTournament(seed, level) {
    const r = C.rng(Number(seed) >>> 0);
    const button = r.int(SEATS);
    const ai = Math.floor(r() * 4294967296) >>> 0;
    const g = {
      level: LEVELS.indexOf(level) >= 0 ? level : 'medium',
      rng: r.getState(),
      ai,
      chips: new Array(SEATS).fill(START_CHIPS),
      button,
      handNo: 0, // số ván đã chia
      humanActed: false,
      phase: 'done', // 'bet': đang cược; 'done': ván vừa xong (xem kết quả)
      h: null,
      profile: Array.from({ length: SEATS }, newProfile),
    };
    dealHand(g);
    return g;
  }

  const canAct = (g, s) => g.h.inHand[s] && !g.h.folded[s] && g.chips[s] > 0;
  const liveSeats = (h) => [0, 1, 2, 3].filter((s) => h.inHand[s] && !h.folded[s]);
  function othersCanAct(g, s) {
    let n = 0;
    for (let o = 0; o < SEATS; o++) if (o !== s && canAct(g, o)) n++;
    return n;
  }
  /** Người s còn phải nói ở vòng này không. */
  function needsAction(g, s) {
    const h = g.h;
    if (!canAct(g, s)) return false;
    if (h.bets[s] < h.cur) return true;
    return !h.acted[s] && othersCanAct(g, s) > 0;
  }
  const potOf = (h) => sum(h.committed);

  function put(g, s, n) {
    const x = Math.min(n, g.chips[s]);
    g.chips[s] -= x;
    g.h.bets[s] += x;
    g.h.committed[s] += x;
    return x;
  }

  /** Chia ván mới cho g (đã clone): đặt mù, chia bài, tìm người nói đầu. */
  function dealHand(g) {
    const { sb, bb } = blindsFor(g.handNo);
    const handRng = g.rng;
    const { deck, after } = shuffleFrom(handRng);
    g.rng = after;
    const inHand = g.chips.map((c) => c > 0);
    const liveCount = inHand.filter(Boolean).length;
    const sbSeat = liveCount === 2 ? g.button : nextSeat(g.button, (s) => inHand[s]);
    const bbSeat = nextSeat(sbSeat, (s) => inHand[s]);
    const zero = () => new Array(SEATS).fill(0);
    const no = () => new Array(SEATS).fill(false);
    g.h = {
      handRng, deck, sb, bb, sbSeat, bbSeat, inHand,
      folded: no(), bets: zero(), committed: zero(), acted: no(), raises: zero(), aggr: new Array(SEATS).fill(-1),
      street: 0, cur: bb, minRaise: bb, toAct: -1, log: [], result: null,
    };
    g.phase = 'bet';
    g.handNo++;
    g.h.log.push({ s: sbSeat, a: 'sb', n: put(g, sbSeat, sb) });
    g.h.log.push({ s: bbSeat, a: 'bb', n: put(g, bbSeat, bb) });
    proceed(g, liveCount === 2 ? sbSeat : (bbSeat + 1) % SEATS);
  }

  /** Tìm người nói tiếp từ ghế `from` (tính cả ghế đó); không còn ai thì sang vòng sau / kết thúc ván. */
  function proceed(g, from) {
    const h = g.h;
    if (liveSeats(h).length === 1) return finishHand(g);
    for (let i = 0; i < SEATS; i++) {
      const s = (from + i) % SEATS;
      if (needsAction(g, s)) {
        h.toAct = s;
        return;
      }
    }
    h.toAct = -1;
    let bettors = 0;
    for (let s = 0; s < SEATS; s++) if (canAct(g, s)) bettors++;
    if (bettors <= 1 || h.street === 3) {
      // Hết vòng cược cuối, hoặc không còn ai cược được nữa: chia nốt bài chung rồi so bài
      while (h.street < 3) {
        h.street++;
        h.log.push({ a: STREETS[h.street] });
      }
      return finishHand(g);
    }
    h.street++;
    h.bets.fill(0);
    h.acted.fill(false);
    h.cur = 0;
    h.minRaise = h.bb;
    h.log.push({ a: STREETS[h.street] });
    proceed(g, (g.button + 1) % SEATS);
  }

  /** Các pot (chính + phụ) theo từng mức góp: { amount, eligible: [ghế còn bài đã góp đủ mức] }. */
  function buildPots(h) {
    const levels = Array.from(new Set(h.committed.filter((x) => x > 0))).sort((a, b) => a - b);
    const live = liveSeats(h);
    const pots = [];
    let prev = 0;
    levels.forEach((L) => {
      let amount = 0;
      for (let s = 0; s < SEATS; s++) amount += Math.max(0, Math.min(h.committed[s], L) - prev);
      prev = L;
      let elig = live.filter((s) => h.committed[s] >= L);
      if (!elig.length) {
        if (pots.length) {
          pots[pots.length - 1].amount += amount;
          return;
        }
        elig = live;
      }
      const last = pots[pots.length - 1];
      if (last && last.eligible.join() === elig.join()) last.amount += amount;
      else pots.push({ amount, eligible: elig });
    });
    return pots;
  }

  /** Kết thúc ván: trả tiền cược không ai theo, chia pot (so bài nếu còn từ 2 người). */
  function finishHand(g) {
    const h = g.h;
    // Tiền cược vượt mức góp cao thứ hai không ai theo được: trả lại
    let top = 0;
    for (let s = 1; s < SEATS; s++) if (h.committed[s] > h.committed[top]) top = s;
    const second = Math.max(...h.committed.filter((x, s) => s !== top));
    if (h.committed[top] > second) {
      const back = h.committed[top] - second;
      h.committed[top] -= back;
      h.bets[top] = Math.max(0, h.bets[top] - back);
      g.chips[top] += back;
    }
    const live = liveSeats(h);
    const won = new Array(SEATS).fill(0);
    const scores = new Array(SEATS).fill(null);
    let pots;
    if (live.length === 1) {
      const amount = potOf(h);
      won[live[0]] = amount;
      pots = [{ amount, eligible: live, winners: live }];
    } else {
      h.street = 4;
      const board = boardOf(h);
      live.forEach((s) => { scores[s] = score(holeOf(h, s).concat(board)); });
      // Thứ tự nhận chip lẻ: bắt đầu từ người ngồi ngay bên trái nút
      const order = (s) => (s - g.button - 1 + SEATS) % SEATS;
      pots = buildPots(h).map((p) => {
        const best = Math.max(...p.eligible.map((s) => scores[s]));
        const winners = p.eligible.filter((s) => scores[s] === best).sort((a, b) => order(a) - order(b));
        const share = Math.floor(p.amount / winners.length);
        let rest = p.amount - share * winners.length;
        winners.forEach((s) => {
          won[s] += share + (rest > 0 ? 1 : 0);
          rest--;
        });
        return { amount: p.amount, eligible: p.eligible, winners };
      });
    }
    for (let s = 0; s < SEATS; s++) {
      g.chips[s] += won[s];
      if (won[s] > 0) h.log.push({ s, a: 'win', n: won[s] });
    }
    h.result = { pots, won, scores, uncontested: live.length === 1 };
    h.toAct = -1;
    g.phase = 'done';
  }

  /* ---------------- Hành động ---------------- */

  /**
   * Nước được phép của người đang nói: { seat, canFold, canCheck, canCall, toCall, canRaise, minTo, maxTo, pot, potIfCall, owe }.
   * `to` của raise / bet là tổng số chip người đó đặt ở vòng này sau khi tố; all-in = maxTo.
   */
  function legal(g) {
    if (!g || g.phase !== 'bet' || !g.h || g.h.toAct < 0) return null;
    const h = g.h;
    const s = h.toAct;
    const stack = g.chips[s];
    const owe = Math.max(0, h.cur - h.bets[s]);
    const maxTo = h.bets[s] + stack;
    // Pot thật sự giành được nếu theo: phần cược vượt quá số mình theo được sẽ bị trả lại
    const cap = h.committed[s] + Math.min(owe, stack);
    let potIfCall = 0;
    for (let o = 0; o < SEATS; o++) potIfCall += o === s ? cap : Math.min(h.committed[o], cap);
    // Đã nói rồi mà chỉ gặp all-in thiếu (không đủ một lần tố) thì không được tố lại
    const canRaise = !h.acted[s] && maxTo > h.cur && othersCanAct(g, s) > 0;
    return {
      seat: s,
      canFold: owe > 0,
      canCheck: owe === 0,
      canCall: owe > 0,
      toCall: Math.min(owe, stack),
      canRaise,
      minTo: Math.min(h.cur + h.minRaise, maxTo),
      maxTo,
      pot: potOf(h),
      potIfCall,
      owe,
    };
  }

  /**
   * Áp nước đi của người đang nói: { type: 'fold' | 'check' | 'call' | 'raise', to }.
   * Nước không hợp lệ thì trả null (trạng thái cũ không đổi).
   */
  function act(g0, action) {
    const L = legal(g0);
    if (!L || !action) return null;
    const g = clone(g0);
    const h = g.h;
    const s = L.seat;
    const p = g.profile[s];
    let entry;
    switch (action.type) {
      case 'fold':
        if (!L.canFold) return null;
        h.folded[s] = true;
        p.folds++;
        entry = { s, a: 'fold' };
        break;
      case 'check':
        if (!L.canCheck) return null;
        entry = { s, a: 'check' };
        break;
      case 'call':
        if (!L.canCall) return null;
        put(g, s, L.toCall);
        entry = { s, a: g.chips[s] === 0 ? 'allin' : 'call', n: h.bets[s] };
        break;
      case 'raise': {
        const to = action.to;
        if (!L.canRaise || !Number.isInteger(to) || to < L.minTo || to > L.maxTo) return null;
        const isBet = h.cur === 0;
        const inc = to - h.cur;
        // Tố đủ mức: mở lại quyền nói cho mọi người; all-in thiếu thì không
        if (inc >= h.minRaise) {
          h.minRaise = inc;
          h.acted.fill(false);
        }
        h.cur = to;
        put(g, s, to - h.bets[s]);
        h.raises[s]++;
        h.aggr[s] = h.street;
        p.raises++;
        entry = { s, a: g.chips[s] === 0 ? 'allin' : isBet ? 'bet' : 'raise', n: to };
        break;
      }
      default:
        return null;
    }
    if (L.owe > 0) p.faced++;
    h.acted[s] = true;
    p.acts++;
    if (s === HUMAN) g.humanActed = true;
    h.log.push(entry);
    proceed(g, (s + 1) % SEATS);
    return g;
  }

  /** Giải đã kết thúc với người chơi chưa (hết chip, hoặc ăn hết chip). Chỉ xét giữa hai ván. */
  const isOver = (g) => g.phase === 'done' && (g.chips[HUMAN] === 0 || g.chips[HUMAN] === TOTAL);
  const won = (g) => isOver(g) && g.chips[HUMAN] === TOTAL;
  /** Đã "chơi" chưa (bỏ giải lúc này tính thua): đã nói ít nhất một lần, hoặc xong ít nhất một ván. */
  const started = (g) => g.humanActed || g.handNo > 1 || g.phase === 'done';
  /** Số máy còn chip. */
  const botsLeft = (g) => g.chips.filter((c, s) => s !== HUMAN && c > 0).length;

  /** Sang ván sau: nút sang người còn chip kế tiếp, chia bài. */
  function nextHand(g0) {
    if (!g0 || g0.phase !== 'done' || isOver(g0)) return g0;
    const g = clone(g0);
    g.button = nextSeat(g.button, (s) => g.chips[s] > 0);
    dealHand(g);
    return g;
  }

  /* ---------------- Máy ---------------- */

  const ITERS = { medium: 300, hard: 800 };
  const POOL = new Int8Array(52);
  const H7 = new Int8Array(7);
  const B5 = new Int8Array(5);

  /**
   * Xác suất thắng (hòa chia đều) của ghế s trước các đối thủ còn bài, ước lượng bằng Monte Carlo.
   * range (tùy chọn, đoán dải bài): bài tẩy của đối thủ o được rút lại (tối đa 8 lần) nếu phân vị Chen thấp hơn
   * range.pre[o], và — với xác suất range.post[o] — nếu chưa thành bộ (đôi trở lên có dùng bài tẩy) với lá chung.
   */
  function equity(g, s, iters, r, range) {
    const h = g.h;
    const mine = holeOf(h, s);
    const board = boardOf(h);
    const opp = liveSeats(h).filter((o) => o !== s);
    if (!opp.length) return 1;
    const used = new Uint8Array(52);
    mine.forEach((c) => { used[c] = 1; });
    board.forEach((c) => { used[c] = 1; });
    let n = 0;
    for (let c = 0; c < 52; c++) if (!used[c]) POOL[n++] = c;
    for (let i = 0; i < board.length; i++) B5[i] = board[i];
    const opc = new Int8Array(opp.length * 2);
    const boardCat = board.length ? catOf(score(board)) : 0;
    const T6 = board.slice();
    const made = (a, b) => {
      T6[board.length] = a;
      T6[board.length + 1] = b;
      return catOf(score(T6, board.length + 2)) > boardCat;
    };
    const draw = (k) => {
      const j = k + r.int(n - k);
      const t = POOL[k];
      POOL[k] = POOL[j];
      POOL[j] = t;
    };
    let total = 0;
    for (let it = 0; it < iters; it++) {
      let k = 0;
      for (let j = 0; j < opp.length; j++) {
        const min = range ? range.pre[opp[j]] : 0;
        const needMade = range && board.length >= 3 && range.post[opp[j]] > 0 && r() < range.post[opp[j]];
        draw(k);
        draw(k + 1);
        for (let tries = 0; tries < 8 && ((min > 0 && pct(POOL[k], POOL[k + 1]) < min) || (needMade && !made(POOL[k], POOL[k + 1]))); tries++) {
          draw(k);
          draw(k + 1);
        }
        opc[2 * j] = POOL[k];
        opc[2 * j + 1] = POOL[k + 1];
        k += 2;
      }
      for (let b = board.length; b < 5; b++) {
        draw(k);
        B5[b] = POOL[k++];
      }
      for (let b = 0; b < 5; b++) H7[b] = B5[b];
      H7[5] = mine[0];
      H7[6] = mine[1];
      const ms = score(H7, 7);
      let ties = 1;
      let lose = false;
      for (let j = 0; j < opp.length; j++) {
        H7[5] = opc[2 * j];
        H7[6] = opc[2 * j + 1];
        const os = score(H7, 7);
        if (os > ms) {
          lose = true;
          break;
        }
        if (os === ms) ties++;
      }
      if (!lose) total += 1 / ties;
    }
    return total / iters;
  }

  /** Làm tròn mức tố về bội số mù nhỏ, kẹp vào [minTo, maxTo]; còn ít chip sau khi tố thì all-in luôn. */
  function raiseTo(g, L, to) {
    const unit = g.h.sb;
    let t = Math.round(to / unit) * unit;
    t = Math.max(L.minTo, Math.min(L.maxTo, t));
    const bet = t - g.h.bets[L.seat];
    if (L.maxTo - t < bet * 0.4) t = L.maxTo;
    return { type: 'raise', to: t };
  }
  const passive = (L) => (L.canCheck ? { type: 'check' } : { type: 'call' });
  const giveUp = (L) => (L.canCheck ? { type: 'check' } : { type: 'fold' });
  /** Mức tố pre-flop: `mult` lần mức đang theo, cộng thêm 1 mù lớn cho mỗi người đã theo (limp). */
  function preflopRaise(g, L, mult) {
    const h = g.h;
    let limpers = 0;
    if (h.cur === h.bb) {
      for (let o = 0; o < SEATS; o++) if (o !== L.seat && o !== h.bbSeat && h.bets[o] === h.bb && !h.folded[o]) limpers++;
    }
    return raiseTo(g, L, h.cur * mult + limpers * h.bb);
  }

  /** Dễ: không tính toán, theo rộng, chỉ tố khi bài rất đẹp (dễ đoán), bỏ khi bị tố lớn mà chưa có gì. */
  function decideEasy(g, L, r) {
    const h = g.h;
    const s = L.seat;
    const hole = holeOf(h, s);
    const stack = g.chips[s] + h.bets[s];
    if (h.street === 0) {
      const p = pct(hole[0], hole[1]);
      if (p > 0.93 && L.canRaise && r() < 0.85) return raiseTo(g, L, h.cur + Math.max(h.minRaise, 2 * h.bb));
      if (L.canCheck) return { type: 'check' };
      const cost = L.toCall / stack;
      if (cost <= 0.12 && p > 0.2) return { type: 'call' };
      if (cost <= 0.4 && p > 0.6) return { type: 'call' };
      return p > 0.85 ? { type: 'call' } : { type: 'fold' };
    }
    const board = boardOf(h);
    const cat = catOf(score(hole.concat(board)));
    const boardCat = catOf(score(board));
    const strong = cat >= 2 && cat > boardCat;
    const made = cat >= 1 && cat > boardCat;
    if (L.canCheck) {
      if (strong && L.canRaise && r() < 0.75) return raiseTo(g, L, L.pot * 0.5);
      if (made && L.canRaise && r() < 0.2) return raiseTo(g, L, L.pot * 0.33);
      return { type: 'check' };
    }
    const frac = L.toCall / L.pot;
    if (strong) return L.canRaise && r() < 0.3 ? raiseTo(g, L, h.cur + h.minRaise) : { type: 'call' };
    if (made) return frac <= 1.2 || r() < 0.3 ? { type: 'call' } : { type: 'fold' };
    return frac <= 0.4 && r() < 0.6 ? { type: 'call' } : { type: 'fold' };
  }

  const M = { val: 0.45, valF: 1.2, call: 0.02, open: 1.4, pf: 0.04 }; // ngưỡng máy Vừa
  /** Vừa: xác suất thắng (Monte Carlo, đối thủ bài bất kỳ) so với tỉ lệ pot; không bluff. */
  function decideMedium(g, L, r) {
    const h = g.h;
    const s = L.seat;
    const n = liveSeats(h).length - 1;
    const e = equity(g, s, ITERS.medium, r, null);
    const fair = 1 / (n + 1);
    const odds = L.toCall / L.potIfCall;
    if (h.street === 0) {
      if (e >= Math.max(0.5, fair * M.open) && L.canRaise) return preflopRaise(g, L, 3);
      if (L.canCheck) return { type: 'check' };
      return e >= odds + M.pf && e >= fair * 0.95 ? { type: 'call' } : { type: 'fold' };
    }
    if (L.canCheck) {
      if (e >= Math.max(M.val, fair * M.valF) && L.canRaise) return raiseTo(g, L, L.pot * 0.66);
      return { type: 'check' };
    }
    if (e >= Math.max(0.68, fair * 2) && L.canRaise) return raiseTo(g, L, h.cur + (L.pot + L.toCall) * 0.75);
    return e >= odds + M.call ? { type: 'call' } : { type: 'fold' };
  }

  /** Ghế s nói sau cùng ở các vòng sau flop không (đúng vị thế). */
  function inPosition(g, s) {
    const h = g.h;
    let last = -1;
    for (let i = 1; i <= SEATS; i++) {
      const o = (g.button + i) % SEATS;
      if (h.inHand[o] && !h.folded[o]) last = o;
    }
    return last === s;
  }

  /**
   * Dải bài đoán cho từng đối thủ, theo mức hung hăng cả giải (ít tố = chặt = tố là có bài):
   *   pre[o]: phân vị bài tẩy tối thiểu nếu o từng tố trong ván; post[o]: xác suất o đã thành bộ nếu o cược / tố ở vòng này.
   */
  function rangeOf(g, s) {
    const h = g.h;
    const pre = [0, 0, 0, 0];
    const post = [0, 0, 0, 0];
    for (let o = 0; o < SEATS; o++) {
      if (o === s || !h.raises[o]) continue;
      const p = g.profile[o];
      const aggr = (p.raises + 1) / (p.acts + 5);
      const tight = Math.max(0, Math.min(1, (0.4 - aggr) / 0.3));
      pre[o] = tight * Math.min(0.8, 0.45 + 0.15 * (h.raises[o] - 1));
      if (h.aggr[o] === h.street && h.street > 0) post[o] = tight * 0.85;
    }
    return { pre, post };
  }
  /** Tỉ lệ bỏ bài khi bị cược của các đối thủ còn bài (để quyết bluff). */
  function foldRate(g, s) {
    const opp = liveSeats(g.h).filter((o) => o !== s);
    if (!opp.length) return 0;
    return opp.reduce((a, o) => a + (g.profile[o].folds + 1) / (g.profile[o].faced + 3), 0) / opp.length;
  }

  const BLUFF = [0, 0.3, 0.25, 0.2];

  /** Khó: Monte Carlo có đoán dải bài, vị thế, push/fold khi ngắn chip, bluff theo tần suất, sizing theo pot / stack. */
  // Ngưỡng của máy Khó (chỉnh bằng mô phỏng giải đấu với máy Dễ / Vừa / ngẫu nhiên, xem README)
  const T = { riskM: 0.15, riskH: 0.1, openF: 1.25, valPre: 1.6, valPre3: 1.9, valPost: 0.4, valPostF: 1.1, raiseE: 0.7, bluffK: 0.4, callAdj: -0.02, riverAdj: 0.03, semi: 0.35, lead: 0.1, pfCall: 0.08, pfCall3: 0.05 };
  function decideHard(g, L, r) {
    const h = g.h;
    const s = L.seat;
    const live = liveSeats(h);
    const n = live.length - 1;
    const e = equity(g, s, ITERS.hard, r, rangeOf(g, s));
    const fair = 1 / (n + 1);
    const odds = L.toCall / L.potIfCall;
    const ip = inPosition(g, s);
    const pos = ip ? 0.04 : 0;
    const stack = g.chips[s] + h.bets[s];
    const eff = Math.min(stack, Math.max(...live.filter((o) => o !== s).map((o) => g.chips[o] + h.bets[o])));
    const effBB = eff / h.bb;
    // Giải đấu: còn nhiều người thì mất cả stack đắt hơn lợi khi thắng (sống sót), nên đòi lợi thế lớn hơn
    // khi đã / sắp bỏ phần lớn chip vào pot
    const alive = g.chips.filter((c, o) => c > 0 || h.committed[o] > 0).length;
    const risk = (alive > 2 ? T.riskM : T.riskH) * Math.min(1, (h.committed[s] + L.toCall) / (g.chips[s] + h.committed[s]));

    if (h.street === 0) {
      // Mình ngắn chip (hoặc cả hai cùng rất ngắn): chỉ all-in hoặc bỏ. Đang dẫn chip thì all-in đòi bài chắc hơn
      if (stack / h.bb <= 12 || effBB <= 6) {
        const need = L.canCheck ? 0 : odds;
        const lead = g.chips[s] > eff ? T.lead * Math.min(1, eff / g.chips[s]) : 0;
        if (L.canRaise && e >= Math.max(need + 0.04, fair * 1.08 - pos) + lead) return { type: 'raise', to: L.maxTo };
        if (L.canCall && e >= need + 0.02 + risk) return { type: 'call' };
        return giveUp(L);
      }
      const raised = h.cur > h.bb;
      if (e >= Math.max(0.52, fair * (raised ? T.valPre3 : T.valPre)) - pos && L.canRaise) return preflopRaise(g, L, 3);
      if (!raised && e >= fair * T.openF - pos * 1.5 && L.canRaise) return preflopRaise(g, L, 2.5);
      if (L.canCheck) return { type: 'check' };
      return e >= odds + (raised ? T.pfCall3 : T.pfCall) + risk && e >= fair * 0.9 ? { type: 'call' } : { type: 'fold' };
    }

    const fr = foldRate(g, s);
    if (L.canCheck) {
      if (e >= Math.max(T.valPost, fair * T.valPostF) - pos && L.canRaise) {
        const size = L.pot * (e > 0.8 ? 0.75 : 0.6);
        return raiseTo(g, L, size >= g.chips[s] * 0.6 ? L.maxTo : size);
      }
      if (!L.canRaise) return { type: 'check' };
      // Semi-bluff với bài đang chờ (flop / turn, đấu tay đôi)
      if (h.street <= 2 && n === 1 && e >= 0.3 && e < 0.5 && r() < T.semi * Math.min(1.3, fr * 2.2)) return raiseTo(g, L, L.pot * 0.6);
      // Bluff: ít đối thủ, có vị thế (ngoài vị thế thì nửa tần suất), nhân theo tỉ lệ bỏ bài của đối thủ
      const freq = T.bluffK * BLUFF[h.street] * (ip ? 1 : 0.5) * Math.min(1.3, fr * 2.2);
      if (n <= 2 && e < 0.42 && r() < freq) return raiseTo(g, L, L.pot * (h.street === 3 ? 0.66 : 0.5));
      return { type: 'check' };
    }
    if (e >= Math.max(T.raiseE, fair * 2) - pos && L.canRaise) {
      const to = h.cur + (L.pot + L.toCall) * 0.8;
      return raiseTo(g, L, to - h.bets[s] >= g.chips[s] * 0.55 ? L.maxTo : to);
    }
    // Pot odds, cộng chút implied odds ở flop / turn
    if (e >= odds + (h.street < 3 ? T.callAdj : T.riverAdj) + risk) return { type: 'call' };
    if (L.canRaise && h.street <= 2 && n === 1 && ip && e >= 0.25 && r() < 0.08 * T.bluffK * Math.min(1.3, fr * 2.2)) {
      return raiseTo(g, L, h.cur + (L.pot + L.toCall) * 0.7);
    }
    return { type: 'fold' };
  }

  const DECIDE = { easy: decideEasy, medium: decideMedium, hard: decideHard };

  /** Nước máy chọn cho người đang nói, theo mức `level`; r: rng (PNCards.rng). */
  function decide(g, level, r) {
    const L = legal(g);
    if (!L) return null;
    const a = (DECIDE[level] || decideMedium)(g, L, r);
    if (a.type === 'raise' && !L.canRaise) return passive(L);
    return a;
  }

  /** Máy (người đang nói) đi một nước theo mức của giải (hoặc `level`), dùng và cập nhật rng `ai` của ván. */
  function botAct(g, level) {
    const r = C.rng(0);
    r.setState(g.ai);
    const L = legal(g);
    if (!L) return g;
    const n = act(g, decide(g, level || g.level, r)) || act(g, giveUp(L));
    n.ai = r.getState();
    return n;
  }

  /* ---------------- Đọc cho giao diện ---------------- */

  /** Bài tẩy của ghế s (lá PNCards). */
  const holeCards = (g, s) => (g.h ? holeOf(g.h, s).map(toCard) : []);
  /** Lá chung đã lật (lá PNCards). */
  const boardCards = (g) => (g.h ? boardOf(g.h).map(toCard) : []);
  /** Tay hiện tại của ghế s (bài tẩy + lá chung đã lật): { score, cat, a, b, best: [id] }; null trước flop. */
  function handInfo(g, s) {
    if (!g.h) return null;
    const cards = holeOf(g.h, s).concat(boardOf(g.h));
    if (cards.length < 5) return null;
    const sc = score(cards);
    return Object.assign({ score: sc, best: bestFive(cards).map(toId) }, describe(sc));
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const ACTS = ['sb', 'bb', 'fold', 'check', 'call', 'bet', 'raise', 'allin', 'win', 'flop', 'turn', 'river'];

  /** Không lưu bộ bài: dựng lại từ handRng (không lộ bài máy / bài sắp lật trong localStorage). */
  function toJSON(g) {
    const o = {
      v: VERSION,
      level: g.level,
      rng: g.rng,
      ai: g.ai,
      chips: g.chips.slice(),
      button: g.button,
      handNo: g.handNo,
      humanActed: g.humanActed,
      phase: g.phase,
      profile: g.profile.map((p) => [p.acts, p.raises, p.faced, p.folds]),
    };
    if (g.phase === 'bet') {
      const h = g.h;
      o.h = {
        handRng: h.handRng, sbSeat: h.sbSeat, bbSeat: h.bbSeat, inHand: h.inHand.slice(), folded: h.folded.slice(),
        bets: h.bets.slice(), committed: h.committed.slice(), acted: h.acted.slice(), raises: h.raises.slice(), aggr: h.aggr.slice(),
        street: h.street, cur: h.cur, minRaise: h.minRaise, toAct: h.toAct, log: h.log.slice(-40),
      };
    }
    return o;
  }

  const isU32 = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
  const isNat = (x) => Number.isInteger(x) && x >= 0;
  const arr = (a, test) => Array.isArray(a) && a.length === SEATS && a.every(test);
  const isBool = (x) => typeof x === 'boolean';
  const isSeat = (x) => Number.isInteger(x) && x >= 0 && x < SEATS;

  /**
   * Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia giải mới).
   * Ván lưu giữa hai ván (phase 'done') không giữ kết quả ván vừa xong: app chia ván sau luôn.
   */
  function fromJSON(raw) {
    try {
      return parse(raw);
    } catch (e) {
      return null;
    }
  }
  function parse(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    const { level, rng, ai, chips, button, handNo, humanActed, phase, profile } = raw;
    if (LEVELS.indexOf(level) < 0 || !isU32(rng) || !isU32(ai) || !arr(chips, isNat) || !isSeat(button)) return null;
    if (!Number.isInteger(handNo) || handNo < 1 || handNo > 100000 || !isBool(humanActed)) return null;
    if (!arr(profile, (p) => Array.isArray(p) && p.length === 4 && p.every(isNat) && p[1] <= p[0] && p[3] <= p[2])) return null;
    const g = {
      level, rng, ai, chips: chips.slice(), button, handNo, humanActed, phase, h: null,
      profile: profile.map((p) => ({ acts: p[0], raises: p[1], faced: p[2], folds: p[3] })),
    };
    if (phase === 'done') {
      if (sum(chips) !== TOTAL || chips[button] <= 0 || chips[HUMAN] === 0 || chips[HUMAN] === TOTAL) return null;
      return g;
    }
    if (phase !== 'bet' || !raw.h || typeof raw.h !== 'object') return null;
    const r = raw.h;
    if (!isU32(r.handRng) || !isSeat(r.sbSeat) || !isSeat(r.bbSeat) || r.sbSeat === r.bbSeat) return null;
    if (!arr(r.inHand, isBool) || !arr(r.folded, isBool) || !arr(r.acted, isBool)) return null;
    if (!arr(r.bets, isNat) || !arr(r.committed, isNat) || !arr(r.raises, isNat)) return null;
    if (!arr(r.aggr, (x) => Number.isInteger(x) && x >= -1 && x <= r.street)) return null;
    if ([0, 1, 2, 3].indexOf(r.street) < 0 || !isNat(r.cur) || !Number.isInteger(r.minRaise) || r.minRaise < 1 || !isSeat(r.toAct)) return null;
    if (!Array.isArray(r.log) || r.log.length > 40) return null;
    const log = r.log.map((x) => {
      if (!x || typeof x !== 'object' || ACTS.indexOf(x.a) < 0) throw new Error('log');
      const e = {};
      if (x.s !== undefined) {
        if (!isSeat(x.s)) throw new Error('log');
        e.s = x.s;
      }
      e.a = x.a;
      if (x.n !== undefined) {
        if (!isNat(x.n)) throw new Error('log');
        e.n = x.n;
      }
      return e;
    });
    // Bộ bài phải đúng là bộ xáo từ handRng, và rng phải là trạng thái ngay sau lần xáo đó
    const { deck, after } = shuffleFrom(r.handRng);
    if (after !== rng) return null;
    const { sb, bb } = blindsFor(handNo - 1);
    if (sum(chips) + sum(r.committed) !== TOTAL || !r.inHand[button] || !r.inHand[r.sbSeat] || !r.inHand[r.bbSeat]) return null;
    for (let s = 0; s < SEATS; s++) {
      if (r.bets[s] > r.committed[s] || r.bets[s] > r.cur) return null;
      if (!r.inHand[s] && (r.committed[s] || r.folded[s] || r.acted[s] || chips[s])) return null;
    }
    if (r.folded.filter((f, s) => r.inHand[s] && !f).length < 2) return null;
    g.h = {
      handRng: r.handRng, deck, sb, bb, sbSeat: r.sbSeat, bbSeat: r.bbSeat, inHand: r.inHand.slice(), folded: r.folded.slice(),
      bets: r.bets.slice(), committed: r.committed.slice(), acted: r.acted.slice(), raises: r.raises.slice(), aggr: r.aggr.slice(),
      street: r.street, cur: r.cur, minRaise: r.minRaise, toAct: r.toAct, log, result: null,
    };
    if (!needsAction(g, r.toAct)) return null;
    return g;
  }

  const api = {
    VERSION, SEATS, HUMAN, START_CHIPS, TOTAL, HANDS_PER_LEVEL, SMALL_BLINDS, LEVELS, CATS, STREETS, ITERS,
    cardInt, toCard, toId, fromId, score, describe, bestFive, chen, pct, shuffleFrom, blindsFor,
    newTournament, legal, act, nextHand, isOver, won, started, botsLeft, decide, botAct, equity,
    holeCards, boardCards, handInfo, buildPots,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
