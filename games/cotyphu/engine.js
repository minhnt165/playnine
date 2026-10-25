/* =====================================================================
 * Cờ Tỷ Phú - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn vòng 28 ô tự thiết kế: 4 góc (Xuất phát, Trại giam, Trạm nghỉ, Bị bắt), 16 ô đất chia 7 nhóm
 *     màu (2–3 ô / nhóm), 2 cảng (thuê theo số cảng sở hữu), 2 xưởng (thuê theo xúc xắc), 1 ô thuế,
 *     3 ô thẻ (Cơ hội ×2, Vận may ×1). Tiền ảo ký hiệu ¤.
 *   - 4 ghế: ghế 0 là người chơi, 1..3 là máy (engine không phân biệt, app quyết định ai điều khiển).
 *   - Trạng thái là đối tượng JSON thuần; mọi thao tác qua act(g, action) → trạng thái MỚI (không sửa g)
 *     hoặc null nếu không hợp lệ. Mỗi trạng thái mới có g.ev = danh sách sự kiện của thao tác vừa làm
 *     (để app vẽ hoạt cảnh / nhật ký, và để test đối chiếu dòng tiền).
 *   - Xúc xắc và xáo thẻ dùng PRNG mulberry32 lưu trong ván (g.rng): tất định theo seed, tải lại không
 *     gieo lại được. Test được ép mặt xúc xắc bằng { type: 'roll', dice: [a, b] }.
 *   - Pha: roll (phải gieo) · end (được kết thúc lượt) · jail (đầu lượt trong trại giam) · buy (đứng trên
 *     đất trống) · debt (đang nợ, phải xoay tiền) · over. Xây / bán nhà / cầm cố / chuộc làm được trong
 *     lượt của mình (pha buy / debt chỉ được bán nhà và cầm cố để xoay tiền).
 *   - Máy: aiAction(g, level) trả MỘT thao tác hợp lệ cho người đang tới lượt (easy / medium / hard).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const N = 28; // số ô
  const SEATS = 4;
  const JAIL = 7;
  const GOTO = 21;
  const START_CASH = 1500;
  const SALARY = 200;
  const JAIL_FEE = 50;
  const MAX_ROUNDS = 30; // ván ngắn: hết 30 vòng thì tính tài sản (chỉnh theo mô phỏng, xem README)
  const LEVELS = ['easy', 'medium', 'hard'];
  const MAX_OFFERS = 2; // số lần đề nghị mua đất của người khác trong một lượt
  const ASK_KEEP = 24; // số đề nghị gần nhất còn nhớ (để máy không hỏi dồn dập, và trả giá cao dần)
  const PHASES = ['roll', 'end', 'jail', 'buy', 'debt', 'over'];

  /* ---------------- Bàn ---------------- */
  // Nhóm đất: màu (để vẽ) + giá một nhà
  const GROUPS = [
    { color: '#2dd4bf', house: 50 },
    { color: '#a3e635', house: 50 },
    { color: '#38bdf8', house: 100 },
    { color: '#fbbf24', house: 100 },
    { color: '#ef4444', house: 150 },
    { color: '#6366f1', house: 150 },
    { color: '#e879f9', house: 200 },
  ];
  // k: start | lot | port | util | tax | chance | fortune | jail | rest | goto
  // lot: g nhóm, price, rent [không nhà, 1..4 nhà, khách sạn]
  const BOARD = [
    { k: 'start' },
    { k: 'lot', id: 'sapa', g: 0, price: 60, rent: [4, 20, 60, 180, 320, 450] },
    { k: 'chance' },
    { k: 'lot', id: 'hagiang', g: 0, price: 70, rent: [6, 30, 90, 270, 400, 550] },
    { k: 'tax', amt: 150 },
    { k: 'lot', id: 'hue', g: 1, price: 100, rent: [8, 40, 100, 300, 450, 600] },
    { k: 'lot', id: 'hoian', g: 1, price: 120, rent: [10, 50, 150, 450, 625, 750] },
    { k: 'jail' },
    { k: 'lot', id: 'dalat', g: 2, price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { k: 'util', id: 'solar', price: 150 },
    { k: 'port', id: 'saigon', price: 200 },
    { k: 'lot', id: 'nhatrang', g: 2, price: 150, rent: [12, 60, 180, 500, 700, 900] },
    { k: 'fortune' },
    { k: 'lot', id: 'phuquoc', g: 2, price: 160, rent: [14, 70, 200, 550, 750, 950] },
    { k: 'rest' },
    { k: 'lot', id: 'bangkok', g: 3, price: 180, rent: [16, 80, 220, 600, 800, 1000] },
    { k: 'chance' },
    { k: 'lot', id: 'singapore', g: 3, price: 200, rent: [18, 90, 250, 700, 875, 1050] },
    { k: 'lot', id: 'seoul', g: 4, price: 220, rent: [20, 100, 300, 750, 925, 1100] },
    { k: 'util', id: 'water', price: 150 },
    { k: 'lot', id: 'tokyo', g: 4, price: 240, rent: [22, 110, 330, 800, 975, 1150] },
    { k: 'goto' },
    { k: 'lot', id: 'paris', g: 5, price: 260, rent: [24, 120, 360, 850, 1025, 1200] },
    { k: 'lot', id: 'roma', g: 5, price: 270, rent: [24, 120, 360, 850, 1025, 1200] },
    { k: 'port', id: 'haiphong', price: 200 },
    { k: 'lot', id: 'london', g: 5, price: 280, rent: [26, 130, 390, 900, 1100, 1275] },
    { k: 'lot', id: 'dubai', g: 6, price: 320, rent: [30, 150, 450, 1000, 1200, 1400] },
    { k: 'lot', id: 'newyork', g: 6, price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
  ];
  const PORT_RENT = [0, 50, 100]; // theo số cảng cùng chủ
  const UTIL_MULT = [0, 4, 10]; // tiền thuê xưởng = tổng xúc xắc × hệ số theo số xưởng cùng chủ
  const GROUP_LOTS = GROUPS.map((_, gi) => BOARD.map((sq, i) => (sq.k === 'lot' && sq.g === gi ? i : -1)).filter((i) => i >= 0));
  const PORTS = BOARD.map((sq, i) => (sq.k === 'port' ? i : -1)).filter((i) => i >= 0);
  const UTILS = BOARD.map((sq, i) => (sq.k === 'util' ? i : -1)).filter((i) => i >= 0);
  const buyable = (i) => {
    const sq = BOARD[i];
    return !!sq && (sq.k === 'lot' || sq.k === 'port' || sq.k === 'util');
  };
  const BUYABLE = BOARD.map((_, i) => i).filter(buyable);

  /* ---------------- Thẻ (nội dung tự viết; chữ nằm trong i18n.js theo khóa card.c<id> / card.f<id>) ----------------
   * go: đi tới ô (qua Xuất phát nhận lương) · port: tới cảng gần nhất phía trước · back: lùi n ô
   * jail: vào trại giam · free: thẻ ra trại (giữ tới khi dùng) · gain / pay: nhận / trả ngân hàng
   * repair: trả theo số nhà / khách sạn */
  const CARDS = {
    c: [
      { go: 0 },
      { go: 20 },
      { go: 8 },
      { go: 22 },
      { port: true },
      { back: 3 },
      { jail: true },
      { free: true },
      { repair: [20, 90] },
      { pay: 25 },
      { gain: 120 },
      { gain: 60 },
    ],
    f: [
      { gain: 100 },
      { pay: 60 },
      { gain: 50 },
      { free: true },
      { jail: true },
      { gain: 30 },
      { gain: 120 },
      { pay: 80 },
      { repair: [30, 120] },
      { gain: 25 },
      { go: 0 },
      { pay: 40 },
    ],
  };
  const DECK_OF = { chance: 'c', fortune: 'f' };

  /* ---------------- PRNG ---------------- */
  function hashSeed(seed) {
    if (typeof seed === 'number') return seed >>> 0;
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  /** mulberry32: r() → [0, 1), r.int(n), r.getState(), r.setState(s). Bỏ trống seed = ngẫu nhiên. */
  function rng(seed) {
    let a = seed === undefined ? (Math.random() * 4294967296) >>> 0 : hashSeed(seed);
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.getState = () => a;
    r.setState = (s) => {
      a = s >>> 0;
    };
    return r;
  }
  /** Lấy một số ngẫu nhiên từ PRNG của ván (đẩy s.rng tiến lên). */
  function next(s) {
    const r = rng(0);
    r.setState(s.rng);
    const v = r();
    s.rng = r.getState();
    return v;
  }
  const die = (s) => 1 + Math.floor(next(s) * 6);
  function shuffled(s, n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(next(s) * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* ---------------- Ván mới / sao chép ---------------- */
  function newPlayer() {
    return { cash: START_CASH, pos: 0, jail: false, tries: 0, cards: [], out: false };
  }
  /** opts: { seed, maxRounds = 30, endSeat = -1 (ghế này phá sản thì kết thúc ván ngay; app dùng 0) } */
  function newGame(opts) {
    const o = opts || {};
    const s = {
      v: VERSION,
      rng: hashSeed(o.seed === undefined ? (Math.random() * 4294967296) >>> 0 : o.seed),
      maxRounds: Number.isInteger(o.maxRounds) && o.maxRounds > 0 ? o.maxRounds : MAX_ROUNDS,
      endSeat: Number.isInteger(o.endSeat) ? o.endSeat : -1,
      round: 1,
      turn: 0,
      phase: 'roll',
      dice: null,
      doubles: 0,
      again: false,
      debt: null,
      card: null,
      players: Array.from({ length: SEATS }, newPlayer),
      own: new Array(N).fill(-1),
      houses: new Array(N).fill(0),
      mort: new Array(N).fill(false),
      decks: { c: [], f: [] },
      outOrder: [],
      offers: [],
      asked: [],
      turns: 0,
      acts: 0,
      over: false,
      ev: [],
    };
    s.decks.c = shuffled(s, CARDS.c.length);
    s.decks.f = shuffled(s, CARDS.f.length);
    return s;
  }

  function clone(g) {
    return {
      v: g.v,
      rng: g.rng,
      maxRounds: g.maxRounds,
      endSeat: g.endSeat,
      round: g.round,
      turn: g.turn,
      phase: g.phase,
      dice: g.dice ? g.dice.slice() : null,
      doubles: g.doubles,
      again: g.again,
      debt: g.debt ? { amt: g.debt.amt, to: g.debt.to, why: g.debt.why, pos: g.debt.pos, then: g.debt.then ? { move: g.debt.then.move } : null } : null,
      card: g.card ? { d: g.card.d, id: g.card.id } : null,
      players: g.players.map((p) => ({ cash: p.cash, pos: p.pos, jail: p.jail, tries: p.tries, cards: p.cards.slice(), out: p.out })),
      own: g.own.slice(),
      houses: g.houses.slice(),
      mort: g.mort.slice(),
      decks: { c: g.decks.c.slice(), f: g.decks.f.slice() },
      outOrder: g.outOrder.slice(),
      offers: g.offers.slice(),
      asked: g.asked.map((x) => x.slice()),
      turns: g.turns,
      acts: g.acts,
      over: g.over,
      ev: [],
    };
  }

  /* ---------------- Tra cứu ---------------- */
  const ownsGroup = (g, p, gi) => GROUP_LOTS[gi].every((i) => g.own[i] === p);
  const countOwned = (g, p, list) => list.reduce((n, i) => n + (g.own[i] === p ? 1 : 0), 0);
  const houseCost = (i) => GROUPS[BOARD[i].g].house;
  const mortValue = (i) => BOARD[i].price / 2;
  const unmortCost = (i) => Math.ceil((BOARD[i].price * 0.55) / 5) * 5; // nửa giá + 10% lãi, làm tròn 5
  const alive = (g) => g.players.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);

  /** Tiền thuê ô i khi chủ p đang thu (không xét cầm cố); diceSum dùng cho xưởng. */
  function rentFor(g, o, i, diceSum) {
    const sq = BOARD[i];
    if (sq.k === 'port') return PORT_RENT[countOwned(g, o, PORTS)];
    if (sq.k === 'util') return (diceSum || 0) * UTIL_MULT[countOwned(g, o, UTILS)];
    const h = g.houses[i];
    if (h > 0) return sq.rent[h];
    return sq.rent[0] * (ownsGroup(g, o, sq.g) ? 2 : 1);
  }
  /** Tiền thuê ô i (diceSum dùng cho xưởng). 0 nếu không có chủ / đang cầm cố. */
  function rentOf(g, i, diceSum) {
    const o = g.own[i];
    if (o < 0 || g.mort[i]) return 0;
    return rentFor(g, o, i, diceSum);
  }

  /** Tổng tài sản: tiền + giá đất (cầm cố tính nửa giá) + nhà theo giá xây. */
  function netWorth(g, p) {
    const pl = g.players[p];
    if (pl.out) return 0;
    let w = pl.cash;
    for (const i of BUYABLE) {
      if (g.own[i] !== p) continue;
      w += g.mort[i] ? mortValue(i) : BOARD[i].price;
      if (g.houses[i]) w += g.houses[i] * houseCost(i);
    }
    return w;
  }

  /** Số tiền tối đa xoay được nếu bán hết nhà (nửa giá) và cầm cố hết đất. */
  function maxRaise(g, p) {
    let m = g.players[p].cash;
    for (const i of BUYABLE) {
      if (g.own[i] !== p) continue;
      if (g.houses[i]) m += (g.houses[i] * houseCost(i)) / 2;
      if (!g.mort[i]) m += mortValue(i);
    }
    return m;
  }

  /** Xếp hạng: còn sống theo tài sản ↓, tiền ↓, ghế ↑; phá sản xếp sau (phá sản muộn hơn xếp trên). */
  function ranking(g) {
    const live = alive(g).sort((a, b) => netWorth(g, b) - netWorth(g, a) || g.players[b].cash - g.players[a].cash || a - b);
    return live.concat(g.outOrder.slice().reverse());
  }

  /* ---------------- Điều kiện thao tác quản lý ---------------- */
  const MANAGE_ALL = { roll: 1, end: 1, jail: 1 };
  const MANAGE_RAISE = { roll: 1, end: 1, jail: 1, buy: 1, debt: 1 };

  function canBuild(g, p, i) {
    if (!MANAGE_ALL[g.phase] || g.turn !== p || !BOARD[i] || BOARD[i].k !== 'lot' || g.own[i] !== p) return false;
    const gi = BOARD[i].g;
    const lots = GROUP_LOTS[gi];
    if (!ownsGroup(g, p, gi) || lots.some((j) => g.mort[j])) return false;
    const h = g.houses[i];
    if (h >= 5 || h > Math.min(...lots.map((j) => g.houses[j]))) return false; // xây đều
    return g.players[p].cash >= GROUPS[gi].house;
  }
  function canSell(g, p, i) {
    if (!MANAGE_RAISE[g.phase] || g.turn !== p || !BOARD[i] || BOARD[i].k !== 'lot' || g.own[i] !== p) return false;
    const h = g.houses[i];
    return h > 0 && h >= Math.max(...GROUP_LOTS[BOARD[i].g].map((j) => g.houses[j])); // bán đều
  }
  function canMortgage(g, p, i) {
    if (!MANAGE_RAISE[g.phase] || g.turn !== p || !buyable(i) || g.own[i] !== p || g.mort[i]) return false;
    if (BOARD[i].k === 'lot' && GROUP_LOTS[BOARD[i].g].some((j) => g.houses[j] > 0)) return false; // nhóm còn nhà
    return true;
  }
  function canUnmortgage(g, p, i) {
    return !!MANAGE_ALL[g.phase] && g.turn === p && buyable(i) && g.own[i] === p && g.mort[i] && g.players[p].cash >= unmortCost(i);
  }

  /** Ô i mua lại qua thỏa thuận được không: có chủ, nhóm chưa có nhà. */
  function tradeable(g, i) {
    if (!buyable(i) || g.own[i] < 0) return false;
    return BOARD[i].k !== 'lot' || GROUP_LOTS[BOARD[i].g].every((j) => g.houses[j] === 0);
  }
  /** p đề nghị mua ô i của người khác với giá amt (trong lượt của mình, tối đa MAX_OFFERS lần, mỗi ô một lần). */
  function canOffer(g, p, i, amt) {
    return !!MANAGE_ALL[g.phase] && g.turn === p && Number.isInteger(i) && tradeable(g, i) && g.own[i] !== p &&
      g.offers.length < MAX_OFFERS && g.offers.indexOf(i) < 0 && Number.isInteger(amt) && amt >= 1 && amt <= g.players[p].cash;
  }

  /* ---------------- Thao tác trên bản sao s (có sửa s) ---------------- */
  function emit(s, e) {
    s.ev.push(e);
  }
  /** Chuyển tiền; -1 = ngân hàng. */
  function transfer(s, from, to, amt, why, pos) {
    if (amt <= 0) return;
    if (from >= 0) s.players[from].cash -= amt;
    if (to >= 0) s.players[to].cash += amt;
    emit(s, { t: 'pay', from, to, amt, why, pos: pos === undefined ? -1 : pos });
  }
  /** Đòi tiền người p: đủ thì trả ngay rồi làm tiếp `then`; thiếu thì vào pha nợ. */
  function charge(s, p, amt, to, why, pos, then) {
    if (s.players[p].cash >= amt) {
      transfer(s, p, to, amt, why, pos);
      runThen(s, p, then);
      return;
    }
    s.debt = { amt, to, why, pos: pos === undefined ? -1 : pos, then: then || null };
    s.phase = 'debt';
    emit(s, { t: 'debt', p, amt, to, why });
  }
  function runThen(s, p, then) {
    if (then && then.move) moveBy(s, p, then.move, 'roll');
  }
  /** Sau khi xong một bước di chuyển / mua / trả: tới pha roll (được gieo tiếp vì đôi) hoặc end. */
  function settle(s) {
    if (s.phase !== 'moving') return;
    const pl = s.players[s.turn];
    s.phase = !pl.jail && s.again ? 'roll' : 'end';
  }

  function goJail(s, p, why) {
    const pl = s.players[p];
    emit(s, { t: 'jail', p, why, from: pl.pos });
    pl.pos = JAIL;
    pl.jail = true;
    pl.tries = 0;
    s.again = false;
    s.doubles = 0;
    s.phase = 'end';
  }

  function moveBy(s, p, n, via) {
    const pl = s.players[p];
    const from = pl.pos;
    const to = (from + n) % N;
    pl.pos = to;
    emit(s, { t: 'move', p, from, to, n, via });
    if (from + n >= N) transfer(s, -1, p, SALARY, 'salary');
    land(s, p);
  }
  function moveBack(s, p, n) {
    const pl = s.players[p];
    const from = pl.pos;
    pl.pos = (from - n + N) % N;
    emit(s, { t: 'move', p, from, to: pl.pos, n: -n, via: 'card' });
    land(s, p);
  }

  /** Xử lý ô vừa đến. */
  function land(s, p) {
    const pl = s.players[p];
    const i = pl.pos;
    const sq = BOARD[i];
    if (buyable(i)) {
      const o = s.own[i];
      if (o < 0) {
        s.phase = 'buy';
        emit(s, { t: 'forsale', p, pos: i });
        return;
      }
      if (o === p || s.mort[i]) return;
      const sum = s.dice ? s.dice[0] + s.dice[1] : 7;
      charge(s, p, rentOf(s, i, sum), o, 'rent', i, null);
      return;
    }
    if (sq.k === 'tax') charge(s, p, sq.amt, -1, 'tax', i, null);
    else if (sq.k === 'goto') goJail(s, p, 'square');
    else if (sq.k === 'chance' || sq.k === 'fortune') drawCard(s, p, DECK_OF[sq.k]);
  }

  function drawCard(s, p, d) {
    const deck = s.decks[d];
    const id = deck.shift();
    const c = CARDS[d][id];
    s.card = { d, id };
    emit(s, { t: 'card', p, d, id });
    if (c.free) s.players[p].cards.push(d + id);
    else deck.push(id);
    const pl = s.players[p];
    if (c.go !== undefined) moveBy(s, p, (c.go - pl.pos + N) % N, 'card');
    else if (c.port) {
      let k = 1;
      while (BOARD[(pl.pos + k) % N].k !== 'port') k++;
      moveBy(s, p, k, 'card');
    } else if (c.back) moveBack(s, p, c.back);
    else if (c.jail) goJail(s, p, 'card');
    else if (c.gain) transfer(s, -1, p, c.gain, 'card');
    else if (c.pay) charge(s, p, c.pay, -1, 'card', -1, null);
    else if (c.repair) {
      let amt = 0;
      for (const i of BUYABLE) {
        if (s.own[i] !== p || !s.houses[i]) continue;
        amt += s.houses[i] === 5 ? c.repair[1] : s.houses[i] * c.repair[0];
      }
      if (amt > 0) charge(s, p, amt, -1, 'repair', -1, null);
    }
  }

  function returnCard(s, code) {
    s.decks[code[0]].push(Number(code.slice(1)));
  }

  function finishGame(s) {
    s.over = true;
    s.phase = 'over';
    s.again = false;
    s.debt = null;
    emit(s, { t: 'over', rank: ranking(s) });
  }

  /** Sang lượt người kế (bỏ qua người đã phá sản); hết vòng cuối hoặc còn ≤ 1 người thì kết thúc. */
  function nextTurn(s) {
    s.again = false;
    s.doubles = 0;
    s.debt = null;
    s.offers = [];
    if (alive(s).length <= 1) {
      finishGame(s);
      return;
    }
    let i = s.turn;
    do {
      i++;
      if (i >= SEATS) {
        i = 0;
        s.round++;
      }
    } while (s.players[i].out);
    if (s.round > s.maxRounds) {
      s.round = s.maxRounds;
      finishGame(s);
      return;
    }
    s.turn = i;
    s.turns++;
    s.phase = s.players[i].jail ? 'jail' : 'roll';
    emit(s, { t: 'turn', p: i, round: s.round });
  }

  function bankrupt(s, p) {
    const pl = s.players[p];
    const to = s.debt ? s.debt.to : -1;
    // Nhà bán lại cho ngân hàng nửa giá (tiền về người phá sản rồi chuyển hết cho chủ nợ)
    for (const i of BUYABLE) {
      if (s.own[i] === p && s.houses[i]) {
        transfer(s, -1, p, (s.houses[i] * houseCost(i)) / 2, 'liquidate', i);
        s.houses[i] = 0;
      }
    }
    transfer(s, p, to, pl.cash, 'bankrupt');
    for (const i of BUYABLE) {
      if (s.own[i] !== p) continue;
      if (to >= 0) s.own[i] = to; // đất (kể cả đang cầm cố) về chủ nợ
      else {
        s.own[i] = -1; // về ngân hàng: thành đất trống
        s.mort[i] = false;
      }
    }
    for (const c of pl.cards) {
      if (to >= 0) s.players[to].cards.push(c);
      else returnCard(s, c);
    }
    pl.cards = [];
    pl.cash = 0;
    pl.out = true;
    pl.jail = false;
    pl.tries = 0;
    s.outOrder.push(p);
    s.debt = null;
    emit(s, { t: 'bankrupt', p, to });
    if (p === s.endSeat) finishGame(s);
    else nextTurn(s);
  }

  /* ---------------- act ---------------- */
  const validDice = (d) => Array.isArray(d) && d.length === 2 && d.every((v) => Number.isInteger(v) && v >= 1 && v <= 6);
  const validPos = (i) => Number.isInteger(i) && i >= 0 && i < N;

  /** Thực hiện thao tác của người đang tới lượt. Trả trạng thái mới hoặc null nếu không hợp lệ. */
  function act(g, a) {
    if (!g || g.over || !a || typeof a.type !== 'string') return null;
    const p = g.turn;
    const pl = g.players[p];
    const i = a.pos;
    let s;
    switch (a.type) {
      case 'roll': {
        if (g.phase !== 'roll' && g.phase !== 'jail') return null;
        if (a.dice !== undefined && !validDice(a.dice)) return null;
        s = clone(g);
        const d = a.dice ? a.dice.slice() : [die(s), die(s)];
        s.dice = d;
        const sum = d[0] + d[1];
        const dbl = d[0] === d[1];
        emit(s, { t: 'roll', p, dice: d.slice() });
        const me = s.players[p];
        if (g.phase === 'jail') {
          me.tries++;
          s.again = false;
          if (dbl) {
            me.jail = false;
            me.tries = 0;
            emit(s, { t: 'free', p, how: 'double' });
            s.phase = 'moving';
            moveBy(s, p, sum, 'roll');
          } else if (me.tries >= 3) {
            me.jail = false;
            me.tries = 0;
            emit(s, { t: 'free', p, how: 'forced' });
            s.phase = 'moving';
            charge(s, p, JAIL_FEE, -1, 'jail', -1, { move: sum });
          } else {
            emit(s, { t: 'stay', p, tries: me.tries });
            s.phase = 'end';
          }
        } else if (dbl && s.doubles + 1 >= 3) {
          s.doubles = 0;
          goJail(s, p, 'doubles');
        } else {
          s.doubles = dbl ? s.doubles + 1 : 0;
          s.again = dbl;
          s.phase = 'moving';
          moveBy(s, p, sum, 'roll');
        }
        settle(s);
        break;
      }
      case 'buy': {
        const at = pl.pos;
        if (g.phase !== 'buy' || g.own[at] >= 0 || pl.cash < BOARD[at].price) return null;
        s = clone(g);
        transfer(s, p, -1, BOARD[at].price, 'buy', at);
        s.own[at] = p;
        emit(s, { t: 'buy', p, pos: at });
        s.phase = 'moving';
        settle(s);
        break;
      }
      case 'skip': {
        if (g.phase !== 'buy') return null;
        s = clone(g);
        emit(s, { t: 'skip', p, pos: pl.pos });
        s.phase = 'moving';
        settle(s);
        break;
      }
      case 'build': {
        if (!validPos(i) || !canBuild(g, p, i)) return null;
        s = clone(g);
        transfer(s, p, -1, houseCost(i), 'build', i);
        s.houses[i]++;
        emit(s, { t: 'build', p, pos: i, h: s.houses[i] });
        break;
      }
      case 'sell': {
        if (!validPos(i) || !canSell(g, p, i)) return null;
        s = clone(g);
        s.houses[i]--;
        transfer(s, -1, p, houseCost(i) / 2, 'sell', i);
        emit(s, { t: 'sell', p, pos: i, h: s.houses[i] });
        break;
      }
      case 'mortgage': {
        if (!validPos(i) || !canMortgage(g, p, i)) return null;
        s = clone(g);
        s.mort[i] = true;
        transfer(s, -1, p, mortValue(i), 'mortgage', i);
        emit(s, { t: 'mortgage', p, pos: i });
        break;
      }
      case 'unmortgage': {
        if (!validPos(i) || !canUnmortgage(g, p, i)) return null;
        s = clone(g);
        s.mort[i] = false;
        transfer(s, p, -1, unmortCost(i), 'unmortgage', i);
        emit(s, { t: 'unmortgage', p, pos: i });
        break;
      }
      case 'payJail': {
        if (g.phase !== 'jail' || pl.cash < JAIL_FEE) return null;
        s = clone(g);
        transfer(s, p, -1, JAIL_FEE, 'jail');
        s.players[p].jail = false;
        s.players[p].tries = 0;
        emit(s, { t: 'free', p, how: 'pay' });
        s.phase = 'roll';
        break;
      }
      case 'useCard': {
        if (g.phase !== 'jail' || !pl.cards.length) return null;
        s = clone(g);
        const me = s.players[p];
        const code = me.cards.shift();
        returnCard(s, code);
        me.jail = false;
        me.tries = 0;
        emit(s, { t: 'free', p, how: 'card', card: code });
        s.phase = 'roll';
        break;
      }
      case 'pay': {
        if (g.phase !== 'debt' || pl.cash < g.debt.amt) return null;
        s = clone(g);
        const d = s.debt;
        s.debt = null;
        transfer(s, p, d.to, d.amt, d.why, d.pos);
        s.phase = 'moving';
        runThen(s, p, d.then);
        settle(s);
        break;
      }
      case 'bankrupt': {
        if (g.phase !== 'debt' || maxRaise(g, p) >= g.debt.amt) return null;
        s = clone(g);
        bankrupt(s, p);
        break;
      }
      case 'offer': {
        // ok: chủ đất đồng ý hay không (app / test hỏi máy bằng aiAccept, hoặc hỏi người chơi)
        if (!canOffer(g, p, i, a.amt) || typeof a.ok !== 'boolean') return null;
        s = clone(g);
        const o = s.own[i];
        s.offers.push(i);
        s.asked.push([p, i, s.round, a.amt]);
        if (s.asked.length > ASK_KEEP) s.asked.shift();
        emit(s, { t: 'offer', p, to: o, pos: i, amt: a.amt, ok: a.ok });
        if (a.ok) {
          transfer(s, p, o, a.amt, 'trade', i);
          s.own[i] = p; // đất đang cầm cố thì vẫn cầm cố
        }
        break;
      }
      case 'end': {
        if (g.phase !== 'end') return null;
        s = clone(g);
        nextTurn(s);
        break;
      }
      default:
        return null;
    }
    s.acts++;
    return s;
  }

  /** Mọi thao tác hợp lệ của người đang tới lượt (cho bot ngẫu nhiên và test). */
  function legalActions(g) {
    if (!g || g.over) return [];
    const p = g.turn;
    const pl = g.players[p];
    const out = [];
    const ph = g.phase;
    if (ph === 'roll' || ph === 'jail') out.push({ type: 'roll' });
    if (ph === 'end') out.push({ type: 'end' });
    if (ph === 'jail') {
      if (pl.cash >= JAIL_FEE) out.push({ type: 'payJail' });
      if (pl.cards.length) out.push({ type: 'useCard' });
    }
    if (ph === 'buy') {
      if (pl.cash >= BOARD[pl.pos].price) out.push({ type: 'buy' });
      out.push({ type: 'skip' });
    }
    if (ph === 'debt') {
      if (pl.cash >= g.debt.amt) out.push({ type: 'pay' });
      if (maxRaise(g, p) < g.debt.amt) out.push({ type: 'bankrupt' });
    }
    for (const i of BUYABLE) {
      if (g.own[i] !== p) continue;
      if (canBuild(g, p, i)) out.push({ type: 'build', pos: i });
      if (canSell(g, p, i)) out.push({ type: 'sell', pos: i });
      if (canMortgage(g, p, i)) out.push({ type: 'mortgage', pos: i });
      if (canUnmortgage(g, p, i)) out.push({ type: 'unmortgage', pos: i });
    }
    return out;
  }

  /* ---------------- Xác suất đáp ô (cho máy Khó) ----------------
   * Chuỗi Markov theo vị trí: gieo 2 xúc xắc, ô Bị bắt → Trại giam, thẻ dịch chuyển theo tỉ lệ trong bộ.
   * Lặp lũy thừa tới phân bố dừng; LAND[i] = tỉ lệ số lần dừng ở ô i (tổng = 1). */
  const PSUM = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((x) => x / 36);
  const LAND = (function () {
    const dest = (y) => {
      if (y === GOTO) return [[JAIL, 1]];
      const k = BOARD[y].k;
      if (k !== 'chance' && k !== 'fortune') return [[y, 1]];
      const deck = CARDS[DECK_OF[k]];
      const w = 1 / deck.length;
      return deck.map((c) => {
        if (c.go !== undefined) return [c.go, w];
        if (c.port) {
          let j = 1;
          while (BOARD[(y + j) % N].k !== 'port') j++;
          return [(y + j) % N, w];
        }
        if (c.back) return [(y - c.back + N) % N, w];
        if (c.jail) return [JAIL, w];
        return [y, w];
      });
    };
    let v = new Array(N).fill(1 / N);
    for (let it = 0; it < 150; it++) {
      const nv = new Array(N).fill(0);
      for (let x = 0; x < N; x++) {
        for (let k = 2; k <= 12; k++) {
          for (const [z, w] of dest((x + k) % N)) nv[z] += v[x] * PSUM[k] * w;
        }
      }
      v = nv;
    }
    return v;
  })();

  /* ---------------- Máy ---------------- */
  /** Số ngẫu nhiên tất định theo trạng thái (không đổi g.rng): cùng ván, cùng thao tác thì cùng kết quả. */
  function aiRand(g, salt) {
    let h = (g.rng ^ Math.imul(g.acts + 1, 0x9e3779b1) ^ Math.imul((salt || 0) + 7, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

  /** Tiền thuê ước lượng của ô i nếu đang thu (xưởng lấy tổng 7; đất cầm cố tính như đã chuộc). */
  const estRentFor = (g, o, i) => rentFor(g, o, i, 7);
  const estRent = (g, i) => (g.own[i] < 0 || g.mort[i] ? 0 : estRentFor(g, g.own[i], i));
  /** Số lần MỖI đối thủ dừng ở ô i trong phần còn lại của ván (~1,2 lần dừng / lượt vì đôi). */
  function landingsLeft(g, i) {
    const rounds = Math.max(0.5, g.maxRounds - g.round + 0.5);
    return LAND[i] * 1.2 * rounds;
  }
  const oppCount = (g, p) => alive(g).length - 1;
  const incomeOf = (g, p, i, rent) => rent * landingsLeft(g, i) * oppCount(g, p);

  /** Tiền thuê kỳ vọng phải trả trong một vòng bàn (~4 lần dừng), tiền thuê lớn nhất và kỳ vọng trong tầm 2..12 ô. */
  function exposure(g, p) {
    let lap = 0;
    for (const i of BUYABLE) {
      const o = g.own[i];
      if (o < 0 || o === p) continue;
      lap += estRent(g, i) * LAND[i] * 4;
    }
    let worst = 0;
    let near = 0;
    const pos = g.players[p].pos;
    for (let k = 2; k <= 12; k++) {
      const j = (pos + k) % N;
      const o = g.own[j];
      if (o < 0 || o === p) continue;
      const r = BOARD[j].k === 'util' ? rentOf(g, j, k) : estRent(g, j);
      worst = Math.max(worst, r);
      near += r * PSUM[k];
    }
    return { lap, worst, near };
  }

  /** Tiền mặt muốn giữ lại. */
  function reserveFor(g, p, level) {
    if (level === 'easy') return 0;
    if (level === 'medium') return 150;
    const ex = exposure(g, p);
    return Math.max(60 + ex.lap * 1.5, ex.worst * 0.5, ex.near * 2);
  }

  /** Mua ô i: hoàn thành nhóm / chặn một đối thủ đủ nhóm / tiến gần tới đủ nhóm. */
  function strategic(g, p, i) {
    const sq = BOARD[i];
    if (sq.k !== 'lot') {
      const list = sq.k === 'port' ? PORTS : UTILS;
      return { completes: list.every((j) => j === i || g.own[j] === p), blocks: false, progress: false };
    }
    const others = GROUP_LOTS[sq.g].filter((j) => j !== i);
    const completes = others.every((j) => g.own[j] === p);
    const owners = others.map((j) => g.own[j]);
    const blocks = owners.every((o) => o >= 0 && o !== p && o === owners[0]);
    const progress = others.some((j) => g.own[j] === p) && others.every((j) => g.own[j] === p || g.own[j] < 0);
    return { completes, blocks, progress };
  }

  /** Bước xoay tiền tiếp theo (bán nhà / cầm cố) theo mức; null nếu hết cách. */
  function raiseStep(g, p, level) {
    const acts = legalActions(g).filter((a) => a.type === 'sell' || a.type === 'mortgage');
    if (!acts.length) return null;
    if (level === 'easy') return pick(acts, aiRand(g, 11));
    const score = (a) => {
      const i = a.pos;
      if (level === 'medium') {
        // cầm cố đất lẻ rẻ trước, rồi bán nhà nhóm rẻ, rồi cầm cố đất trong nhóm đủ bộ
        if (a.type === 'mortgage') return (BOARD[i].k === 'lot' && ownsGroup(g, p, BOARD[i].g) ? 2000 : 0) + BOARD[i].price;
        return 1000 + houseCost(i);
      }
      // hard: mất ít giá trị nhất trên mỗi đồng thu được (cầm cố không mất tài sản, bán nhà mất nửa giá)
      if (a.type === 'mortgage') return incomeOf(g, p, i, estRent(g, i)) / mortValue(i);
      const h = g.houses[i];
      const after = h - 1 > 0 ? BOARD[i].rent[h - 1] : BOARD[i].rent[0] * 2;
      return (houseCost(i) / 2 + incomeOf(g, p, i, BOARD[i].rent[h] - after)) / (houseCost(i) / 2);
    };
    let best = acts[0];
    let bs = score(best);
    for (const a of acts) {
      const v = score(a);
      if (v < bs) {
        best = a;
        bs = v;
      }
    }
    return best;
  }

  /** Bước xoay tiền cho người chơi (nút "Tự xoay tiền"): dùng cách của máy Vừa. */
  function autoRaise(g) {
    if (!g || g.phase !== 'debt' || g.players[g.turn].cash >= g.debt.amt) return null;
    return raiseStep(g, g.turn, 'medium');
  }

  const groupScore = (g, p, i) => (BOARD[i].k === 'lot' && ownsGroup(g, p, BOARD[i].g) ? 1000 : 0) + BOARD[i].price;

  /** Thao tác xây / chuộc của máy ở pha roll / end / jail; null nếu không muốn làm gì thêm. */
  function manageStep(g, p, level) {
    const pl = g.players[p];
    const acts = legalActions(g);
    const builds = acts.filter((a) => a.type === 'build');
    const unm = acts.filter((a) => a.type === 'unmortgage');
    if (level === 'easy') {
      // xây bừa, không giữ tiền dự trữ; không bao giờ chuộc
      if (builds.length && aiRand(g, 21) < 0.6) return pick(builds, aiRand(g, 22));
      return null;
    }
    const R = reserveFor(g, p, level);
    if (level === 'medium') {
      const u = unm.filter((a) => pl.cash - unmortCost(a.pos) >= R + 150).sort((a, b) => groupScore(g, p, b.pos) - groupScore(g, p, a.pos))[0];
      if (u) return u;
      const b = builds
        .filter((a) => pl.cash - houseCost(a.pos) >= R)
        .sort((a, b2) => BOARD[b2.pos].rent[g.houses[b2.pos] + 1] - BOARD[a.pos].rent[g.houses[a.pos] + 1])[0];
      return b || null;
    }
    // hard: theo thu nhập kỳ vọng còn lại trên mỗi đồng bỏ ra
    let best = null;
    let bv = 0;
    for (const i of buildSpots(g, p)) {
      const cost = houseCost(i);
      const v = incomeOf(g, p, i, BOARD[i].rent[g.houses[i] + 1] - estRent(g, i)) / cost;
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    if (best !== null && bv > 0.15) {
      const cost = houseCost(best);
      if (pl.cash - cost >= R && canBuild(g, p, best)) return { type: 'build', pos: best };
      // thiếu tiền: cầm cố đất lẻ (không thuộc nhóm đủ bộ) để xây, vì cầm cố không làm giảm tài sản
      const singles = acts.filter((a) => a.type === 'mortgage' && !(BOARD[a.pos].k === 'lot' && ownsGroup(g, p, BOARD[a.pos].g)));
      if (singles.length) {
        const loss = (i) => incomeOf(g, p, i, estRent(g, i));
        singles.sort((a, b) => loss(a.pos) / mortValue(a.pos) - loss(b.pos) / mortValue(b.pos));
        const cap = singles.reduce((sum, a) => sum + mortValue(a.pos), pl.cash);
        if (cap - cost >= R && loss(singles[0].pos) < bv * cost) return singles[0];
      }
      return null;
    }
    best = null;
    bv = 0;
    for (const a of unm) {
      const i = a.pos;
      const cost = unmortCost(i);
      if (pl.cash - cost < R + 50) continue;
      const v = incomeOf(g, p, i, estRentFor(g, p, i)) - (cost - mortValue(i));
      if (v > bv) {
        bv = v;
        best = a;
      }
    }
    return best;
  }

  /** Các ô p xây thêm được một nhà nếu đủ tiền (bỏ qua điều kiện tiền). */
  function buildSpots(g, p) {
    const out = [];
    for (let gi = 0; gi < GROUPS.length; gi++) {
      const lots = GROUP_LOTS[gi];
      if (!ownsGroup(g, p, gi) || lots.some((j) => g.mort[j])) continue;
      const lo = Math.min(...lots.map((j) => g.houses[j]));
      for (const i of lots) if (g.houses[i] === lo && lo < 5) out.push(i);
    }
    return out;
  }

  /* ---------------- Mua lại đất qua thỏa thuận ---------------- */
  function withOwner(g, i, o) {
    const own = g.own.slice();
    own[i] = o;
    return Object.assign({}, g, { own });
  }
  const setOf = (i) => (BOARD[i].k === 'lot' ? GROUP_LOTS[BOARD[i].g] : BOARD[i].k === 'port' ? PORTS : UTILS);
  /** Thu nhập kỳ vọng còn lại của p từ nhóm (hoặc bộ cảng / xưởng) chứa ô i, kể cả tiềm năng xây nhà khi đủ nhóm. */
  function setIncome(g, p, i) {
    const list = setOf(i);
    let v = 0;
    for (const j of list) if (g.own[j] === p && !g.mort[j]) v += incomeOf(g, p, j, rentFor(g, p, j, 7));
    if (BOARD[i].k === 'lot' && ownsGroup(g, p, BOARD[i].g)) {
      // đủ nhóm: coi như lên 3 nhà trong khoảng nửa thời gian còn lại
      for (const j of list) v += 0.5 * incomeOf(g, p, j, Math.max(0, BOARD[j].rent[3] - rentFor(g, p, j, 7)));
    }
    return v;
  }
  const asset = (g, i) => (g.mort[i] ? mortValue(i) : BOARD[i].price);
  /** Giá trị ô i với người mua b (tài sản + thu nhập tăng thêm). */
  const valueToBuyer = (g, b, i) => asset(g, i) + setIncome(withOwner(g, i, b), b, i) - setIncome(g, b, i);
  /** Giá trị ô i với chủ hiện tại (tài sản + thu nhập mất đi). */
  const valueToSeller = (g, i) => asset(g, i) + setIncome(g, g.own[i], i) - setIncome(withOwner(g, i, -1), g.own[i], i);
  /** Phần thiệt của người bán khi người mua mạnh lên (chia đều cho các đối thủ của người mua). */
  function dangerShare(g, b, i) {
    const gain = setIncome(withOwner(g, i, b), b, i) - setIncome(g, b, i);
    return Math.max(0, gain) / Math.max(1, oppCount(g, b));
  }
  /** Giá máy (chủ ô i) chấp nhận khi người đang tới lượt đề nghị mua với giá amt. */
  function aiAccept(g, i, amt, level) {
    if (!g || !tradeable(g, i)) return false;
    const o = g.own[i];
    const b = g.turn;
    const price = BOARD[i].price;
    if (level === 'easy') return amt >= price * 1.25; // chỉ nhìn giá, không lường người mua đủ nhóm
    const lotGroup = BOARD[i].k === 'lot';
    if (level === 'medium') {
      if (lotGroup && ownsGroup(g, o, BOARD[i].g)) return false; // không phá nhóm của mình
      return amt >= price * (strategic(g, b, i).completes ? 3 : 1.6);
    }
    return amt >= valueToSeller(g, i) + dangerShare(g, b, i) + 0.05 * price;
  }
  /** Các lần p đã hỏi mua ô i (còn trong bộ nhớ), cũ trước mới sau. */
  const asksOf = (g, p, i) => g.asked.filter((x) => x[0] === p && x[1] === i);
  /** Máy đề nghị mua ô hoàn thành nhóm của mình (Vừa: giá gấp đôi; Khó: tính giá người bán chịu, trả cao dần). */
  function offerStep(g, p, level) {
    if (level === 'easy' || g.offers.length >= MAX_OFFERS || !MANAGE_ALL[g.phase]) return null;
    const pl = g.players[p];
    const R = reserveFor(g, p, level);
    let best = null;
    let bestGain = 0;
    for (const i of BUYABLE) {
      const o = g.own[i];
      if (o < 0 || o === p || g.offers.indexOf(i) >= 0 || !tradeable(g, i)) continue;
      if (!strategic(g, p, i).completes) continue;
      if (level === 'medium' && BOARD[i].k !== 'lot') continue;
      const asks = asksOf(g, p, i);
      const last = asks[asks.length - 1];
      if (asks.length >= 2 || (last && g.round - last[2] < 3)) continue; // không hỏi dồn dập cùng một ô
      const price = BOARD[i].price;
      const W = valueToBuyer(g, p, i);
      let amt;
      if (level === 'medium') amt = price * (last ? 2.6 : 2);
      else {
        amt = Math.max(valueToSeller(g, i) + dangerShare(g, p, i) + 0.05 * price, price * 1.25);
        if (last) amt = Math.max(amt, last[3] * 1.3);
        if (amt > W * 0.85) continue;
      }
      amt = Math.ceil(amt / 10) * 10;
      if (pl.cash - amt < (level === 'medium' ? R : R * 0.5)) continue;
      if (W - amt > bestGain || !best) {
        bestGain = W - amt;
        best = { type: 'offer', pos: i, amt };
      }
    }
    return best;
  }

  /** Máy chọn MỘT thao tác hợp lệ cho người đang tới lượt. */
  function aiAction(g, level) {
    if (!g || g.over) return null;
    const lv = LEVELS.indexOf(level) >= 0 ? level : 'medium';
    const p = g.turn;
    const pl = g.players[p];
    switch (g.phase) {
      case 'debt': {
        if (pl.cash >= g.debt.amt) return { type: 'pay' };
        if (maxRaise(g, p) < g.debt.amt) return { type: 'bankrupt' };
        return raiseStep(g, p, lv);
      }
      case 'buy': {
        const i = pl.pos;
        const price = BOARD[i].price;
        if (lv === 'easy') return pl.cash >= price && aiRand(g, 1) < 0.75 ? { type: 'buy' } : { type: 'skip' };
        const st = strategic(g, p, i);
        const R = reserveFor(g, p, lv);
        const key = st.completes || st.blocks;
        let want;
        if (lv === 'medium') want = pl.cash - price >= R / 2 || (key && pl.cash >= price);
        else {
          const keep = Math.min(R, 120);
          want = pl.cash - price >= keep || ((key || st.progress) && pl.cash - price >= keep / 3) || (st.completes && maxRaise(g, p) - price >= R / 2);
        }
        if (!want) return { type: 'skip' };
        if (pl.cash >= price) return { type: 'buy' };
        // thiếu tiền cho ô hoàn thành nhóm: cầm cố đất lẻ (không đụng nhóm đủ bộ / chính nhóm này)
        if (st.completes && BOARD[i].k === 'lot') {
          const m = legalActions(g).filter((a) => a.type === 'mortgage' && !(BOARD[a.pos].k === 'lot' && (ownsGroup(g, p, BOARD[a.pos].g) || BOARD[a.pos].g === BOARD[i].g)));
          const can = m.reduce((sum, a) => sum + mortValue(a.pos), pl.cash);
          if (can >= price && m.length) return m.sort((a, b) => BOARD[a.pos].price - BOARD[b.pos].price)[0];
        }
        return { type: 'skip' };
      }
      case 'jail': {
        const ms = manageStep(g, p, lv);
        if (ms) return ms;
        if (lv === 'easy') {
          if (pl.cards.length) return { type: 'useCard' };
          return pl.cash >= JAIL_FEE && aiRand(g, 3) < 0.5 ? { type: 'payJail' } : { type: 'roll' };
        }
        const R = reserveFor(g, p, lv);
        if (lv === 'medium') {
          if (pl.cards.length) return { type: 'useCard' };
          if (g.round <= g.maxRounds * 0.4 && pl.cash >= JAIL_FEE + R) return { type: 'payJail' };
          return { type: 'roll' };
        }
        // hard: bàn đã nguy hiểm hoặc hết đất trống thì ngồi trong trại (gieo tìm đôi) cho an toàn
        const ex = exposure(g, p);
        const unowned = BUYABLE.filter((i) => g.own[i] < 0).length;
        if (ex.lap >= 120 || unowned < 3) return { type: 'roll' };
        if (pl.cards.length) return { type: 'useCard' };
        if (pl.cash >= JAIL_FEE + R * 0.5) return { type: 'payJail' };
        return { type: 'roll' };
      }
      case 'roll':
      case 'end': {
        const ms = manageStep(g, p, lv) || offerStep(g, p, lv);
        if (ms) return ms;
        return { type: g.phase };
      }
      default:
        return null;
    }
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    const s = clone(g);
    delete s.ev;
    return s;
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isSeat = (x) => isInt(x, 0, SEATS - 1);
  const isBank = (x) => isInt(x, -1, SEATS - 1);
  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    try {
      if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
      const g = raw;
      if (!isInt(g.rng, 0, 4294967295) || !isInt(g.maxRounds, 1, 200) || !isInt(g.endSeat, -1, SEATS - 1)) return null;
      if (!isInt(g.round, 1, g.maxRounds) || !isSeat(g.turn) || PHASES.indexOf(g.phase) < 0) return null;
      if (!isInt(g.doubles, 0, 2) || typeof g.again !== 'boolean' || typeof g.over !== 'boolean') return null;
      if (!isInt(g.turns, 0, 1e7) || !isInt(g.acts, 0, 1e8)) return null;
      if (g.dice !== null && !validDice(g.dice)) return null;
      if (g.over !== (g.phase === 'over')) return null;
      if (!Array.isArray(g.players) || g.players.length !== SEATS) return null;
      for (const p of g.players) {
        if (!p || typeof p !== 'object') return null;
        if (!isInt(p.cash, 0, 1e9) || !isInt(p.pos, 0, N - 1) || typeof p.jail !== 'boolean' || !isInt(p.tries, 0, 2) || typeof p.out !== 'boolean') return null;
        if (!Array.isArray(p.cards) || p.cards.some((c) => typeof c !== 'string' || !/^[cf]\d{1,2}$/.test(c))) return null;
        if (p.jail && p.pos !== JAIL) return null;
        if (p.out && (p.cash !== 0 || p.cards.length || p.jail)) return null;
      }
      const arr = (a, ok) => Array.isArray(a) && a.length === N && a.every(ok);
      if (!arr(g.own, isBank) || !arr(g.houses, (h) => isInt(h, 0, 5)) || !arr(g.mort, (m) => typeof m === 'boolean')) return null;
      for (let i = 0; i < N; i++) {
        const o = g.own[i];
        if (!buyable(i) && (o !== -1 || g.houses[i] || g.mort[i])) return null;
        if (o >= 0 && g.players[o].out) return null;
        if (o < 0 && (g.houses[i] || g.mort[i])) return null;
        if (g.houses[i] && (BOARD[i].k !== 'lot' || !ownsGroup(g, o, BOARD[i].g) || GROUP_LOTS[BOARD[i].g].some((j) => g.mort[j]))) return null;
      }
      for (let gi = 0; gi < GROUPS.length; gi++) {
        const hs = GROUP_LOTS[gi].map((i) => g.houses[i]);
        if (Math.max(...hs) - Math.min(...hs) > 1) return null; // xây đều
      }
      // Bộ thẻ: phần trong chồng + thẻ ra trại đang giữ = đủ bộ, không trùng
      if (!g.decks || typeof g.decks !== 'object') return null;
      for (const d of ['c', 'f']) {
        const deck = g.decks[d];
        if (!Array.isArray(deck) || !deck.every((x) => isInt(x, 0, CARDS[d].length - 1))) return null;
        const held = [];
        for (const p of g.players) for (const c of p.cards) if (c[0] === d) held.push(Number(c.slice(1)));
        if (held.some((x) => !isInt(x, 0, CARDS[d].length - 1) || !CARDS[d][x].free)) return null;
        const all = deck.concat(held).sort((a, b) => a - b);
        if (all.length !== CARDS[d].length || all.some((x, k) => x !== k)) return null;
      }
      if (g.card !== null) {
        if (typeof g.card !== 'object' || (g.card.d !== 'c' && g.card.d !== 'f') || !isInt(g.card.id, 0, CARDS[g.card.d].length - 1)) return null;
      }
      if (!Array.isArray(g.outOrder) || g.outOrder.some((x) => !isSeat(x) || !g.players[x].out)) return null;
      if (!Array.isArray(g.offers) || g.offers.length > MAX_OFFERS || g.offers.some((x) => !buyable(x)) || new Set(g.offers).size !== g.offers.length) return null;
      if (!Array.isArray(g.asked) || g.asked.length > ASK_KEEP) return null;
      if (g.asked.some((x) => !Array.isArray(x) || x.length !== 4 || !isSeat(x[0]) || !buyable(x[1]) || !isInt(x[2], 1, g.maxRounds) || !isInt(x[3], 1, 1e9))) return null;
      if (new Set(g.outOrder).size !== g.outOrder.length || g.outOrder.length !== g.players.filter((p) => p.out).length) return null;
      if (!g.over) {
        const cur = g.players[g.turn];
        if (cur.out || alive(g).length < 2) return null;
        if (g.phase === 'jail' && !cur.jail) return null;
        if (cur.jail && g.phase !== 'jail' && g.phase !== 'end') return null;
        if (g.phase === 'buy' && (!buyable(cur.pos) || g.own[cur.pos] >= 0)) return null;
      }
      if (g.phase === 'debt') {
        const d = g.debt;
        if (!d || typeof d !== 'object' || !isInt(d.amt, 1, 1e9) || !isBank(d.to) || typeof d.why !== 'string' || !isInt(d.pos, -1, N - 1)) return null;
        if (d.to === g.turn || (d.to >= 0 && g.players[d.to].out)) return null;
        if (d.then !== null && (!d.then || typeof d.then !== 'object' || !isInt(d.then.move, 2, 12))) return null;
      } else if (g.debt !== null) return null;
      return clone(g);
    } catch (e) {
      return null;
    }
  }

  const api = {
    VERSION, N, SEATS, JAIL, GOTO, START_CASH, SALARY, JAIL_FEE, MAX_ROUNDS, LEVELS,
    BOARD, GROUPS, GROUP_LOTS, PORTS, UTILS, BUYABLE, CARDS, PORT_RENT, UTIL_MULT, LAND,
    rng, newGame, act, legalActions, aiAction, autoRaise,
    rentOf, netWorth, maxRaise, ranking, alive, ownsGroup, houseCost, mortValue, unmortCost,
    MAX_OFFERS, canBuild, canSell, canMortgage, canUnmortgage, canOffer, tradeable, buyable, aiAccept, valueToBuyer, valueToSeller,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
