/* =====================================================================
 * Xếp Bài (Klondike) - Engine (chạy được cả trong trình duyệt lẫn Node, không đụng DOM)
 *   - Bộ bài 52 lá đánh số 0..51: chất = số / 13, bậc = số % 13 + 1
 *   - Xáo bài có seed (mulberry32 + băm FNV-1a), ván hằng ngày theo ngày
 *   - Chia 7 cột (28 lá) + 24 lá chồng rút; rút 1 hoặc 3 lá, chia lại không giới hạn
 *   - Kiểm tra nước đi, tính điểm kiểu Windows, tự lật lá úp vừa lộ ra
 *   - Thứ tự đích cho "chạm để đi", gợi ý nước có ích, tự hoàn thành
 *   - Ván lưu dưới dạng bộ bài + danh sách nước đi, dựng lại bằng replay
 *     nên Đi lại và khôi phục ván luôn khớp luật tuyệt đối
 * Trạng thái ván là object thuần (mảng số) nên JSON.stringify được ngay.
 * ===================================================================== */
const XepBai = (() => {
  /* Chất theo thứ tự số lá: 0..12 bích, 13..25 cơ, 26..38 rô, 39..51 nhép */
  const SUITS = ['bích', 'cơ', 'rô', 'nhép'];
  const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // Tên đọc cho trình đọc màn hình: A = Át, J = Bồi, Q = Đầm, K = Già
  const RANK_NAME = ['', 'Át', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Bồi', 'Đầm', 'Già'];

  /** Điểm kiểu Windows: thải xuống cột +5, lên đích +10, lật lá +5, từ đích xuống cột −15. */
  const SCORE = { wasteToTab: 5, toFound: 10, flip: 5, foundToTab: -15 };
  /** Ván hằng ngày luôn rút 1 lá để mọi người chơi cùng một đề. */
  const DAILY_DRAW = 1;

  const TAB = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
  const FOUND = ['f0', 'f1', 'f2', 'f3'];

  /* ---------------- Lá bài ---------------- */
  const suitOf = (c) => (c / 13) | 0;
  const rankOf = (c) => (c % 13) + 1;
  const isRed = (c) => {
    const s = suitOf(c);
    return s === 1 || s === 2;
  };
  const cardName = (c) => `${RANK_NAME[rankOf(c)]} ${SUITS[suitOf(c)]}`;

  /* ---------------- Ngẫu nhiên ---------------- */

  /** PRNG mulberry32: cùng seed thì cho cùng dãy số trên mọi máy. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Băm chuỗi thành số 32 bit không dấu (FNV-1a). */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Seed của ván hằng ngày, dateKey dạng 'YYYY-MM-DD'. */
  function dailySeed(dateKey) {
    return hashString('playnine-xepbai-daily-' + dateKey);
  }

  /** Bộ 52 lá đã xáo (Fisher-Yates). rng mặc định là Math.random. */
  function shuffledDeck(rng) {
    const r = rng || Math.random;
    const d = [];
    for (let i = 0; i < 52; i++) d.push(i);
    for (let i = 51; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = d[i];
      d[i] = d[j];
      d[j] = t;
    }
    return d;
  }

  /** Bộ bài của ván hằng ngày: cùng ngày thì mọi máy chia giống nhau. */
  function dailyDeck(dateKey) {
    return shuffledDeck(seededRandom(dailySeed(dateKey)));
  }

  /** Đúng 52 số nguyên 0..51 không trùng (dùng khi đọc ván đã lưu). */
  function isDeck(d) {
    if (!Array.isArray(d) || d.length !== 52) return false;
    const seen = new Array(52).fill(false);
    for (const c of d) {
      if (!Number.isInteger(c) || c < 0 || c > 51 || seen[c]) return false;
      seen[c] = true;
    }
    return true;
  }

  /* ---------------- Trạng thái ván ---------------- */
  // { draw: 1|3, stock: [] (lá trên cùng ở cuối mảng), waste: [], fan: số lá thải đang xòe (rút 3),
  //   found: [[],[],[],[]], tab: [[]x7], down: [số lá úp ở đáy mỗi cột], score, moveCount, redeals }

  function blankState(draw) {
    return {
      draw: draw === 3 ? 3 : 1,
      stock: [],
      waste: [],
      fan: 0,
      found: [[], [], [], []],
      tab: [[], [], [], [], [], [], []],
      down: [0, 0, 0, 0, 0, 0, 0],
      score: 0,
      moveCount: 0,
      redeals: 0,
    };
  }

  /**
   * Chia bài như ngoài đời: chia theo hàng, mỗi lượt một lá cho các cột từ cột hiện tại sang phải.
   * Cột i có i + 1 lá, chỉ lá trên cùng ngửa. 24 lá còn lại thành chồng rút.
   */
  function deal(deck, draw) {
    const s = blankState(draw);
    let k = 0;
    for (let r = 0; r < 7; r++) {
      for (let c = r; c < 7; c++) s.tab[c].push(deck[k++]);
    }
    for (let c = 0; c < 7; c++) s.down[c] = c;
    s.stock = deck.slice(28);
    return s;
  }

  function clone(s) {
    return {
      draw: s.draw,
      stock: s.stock.slice(),
      waste: s.waste.slice(),
      fan: s.fan,
      found: s.found.map((f) => f.slice()),
      tab: s.tab.map((t) => t.slice()),
      down: s.down.slice(),
      score: s.score,
      moveCount: s.moveCount,
      redeals: s.redeals,
    };
  }

  /** Mảng lá của chồng theo mã: 'stock', 'waste', 'f0'..'f3', 't0'..'t6'. */
  function pile(s, id) {
    if (id === 'stock') return s.stock;
    if (id === 'waste') return s.waste;
    if (typeof id !== 'string' || id.length !== 2) return null;
    const i = id.charCodeAt(1) - 48;
    if (id[0] === 'f' && i >= 0 && i < 4) return s.found[i];
    if (id[0] === 't' && i >= 0 && i < 7) return s.tab[i];
    return null;
  }
  const colOf = (id) => id.charCodeAt(1) - 48;
  const topOf = (arr) => arr[arr.length - 1];

  /* ---------------- Luật ---------------- */

  /** card đặt được lên onto trong cột: nhỏ hơn đúng 1 bậc và khác màu. */
  function canStack(card, onto) {
    return rankOf(onto) === rankOf(card) + 1 && isRed(onto) !== isRed(card);
  }

  /** n lá trên cùng của cột col đều ngửa và xếp đúng giảm dần xen kẽ màu. */
  function isRun(s, col, n) {
    const t = s.tab[col];
    if (!Number.isInteger(n) || n < 1 || n > t.length - s.down[col]) return false;
    for (let i = t.length - n; i < t.length - 1; i++) {
      if (!canStack(t[i + 1], t[i])) return false;
    }
    return true;
  }

  /** Số lá ngửa ở đầu cột (độ dài phần có thể bốc). */
  const faceUpCount = (s, col) => s.tab[col].length - s.down[col];

  /** Bốc được n lá từ chồng from không. */
  function movable(s, from, n) {
    if (from === 'waste') return n === 1 && s.waste.length > 0;
    const src = pile(s, from);
    if (!src || from === 'stock') return false;
    if (from[0] === 'f') return n === 1 && src.length > 0;
    return isRun(s, colOf(from), n);
  }

  function canDropTab(s, col, card) {
    const t = s.tab[col];
    if (!t.length) return rankOf(card) === 13; // cột trống chỉ nhận Già (K)
    if (s.down[col] >= t.length) return false;
    return canStack(card, topOf(t));
  }

  function canDropFound(s, f, card) {
    const F = s.found[f];
    if (!F.length) return rankOf(card) === 1;
    return suitOf(topOf(F)) === suitOf(card) && rankOf(card) === rankOf(topOf(F)) + 1;
  }

  /** Chuyển n lá từ from sang to có hợp lệ không. */
  function canMove(s, from, n, to) {
    if (from === to || !movable(s, from, n)) return false;
    const dst = pile(s, to);
    if (!dst || to === 'stock' || to === 'waste') return false;
    const src = pile(s, from);
    const card = src[src.length - n];
    if (to[0] === 'f') return from[0] !== 'f' && n === 1 && canDropFound(s, colOf(to), card);
    return canDropTab(s, colOf(to), card);
  }

  function isLegal(s, m) {
    if (!m) return false;
    if (m.t === 'draw') return s.stock.length > 0 || s.waste.length > 0;
    return m.t === 'move' && canMove(s, m.from, m.n, m.to);
  }

  /**
   * Đi một nước (sửa trực tiếp s). Nước sai luật thì không đổi gì và trả về null.
   * Trả về { points, flipped, drawn, redeal } để giao diện báo / làm hiệu ứng.
   */
  function apply(s, m) {
    if (!m) return null;
    if (m.t === 'draw') {
      if (s.stock.length) {
        const n = Math.min(s.draw, s.stock.length);
        for (let i = 0; i < n; i++) s.waste.push(s.stock.pop());
        s.fan = n;
        s.moveCount++;
        return { points: 0, flipped: false, drawn: n, redeal: false };
      }
      if (s.waste.length) {
        // Hết chồng rút: lật úp cả chồng thải lại, lá rút đầu tiên lại nằm trên cùng
        s.stock = s.waste.reverse();
        s.waste = [];
        s.fan = 0;
        s.redeals++;
        s.moveCount++;
        return { points: 0, flipped: false, drawn: 0, redeal: true };
      }
      return null;
    }
    if (m.t !== 'move' || !canMove(s, m.from, m.n, m.to)) return null;
    const src = pile(s, m.from);
    const dst = pile(s, m.to);
    const cards = src.splice(src.length - m.n, m.n);
    for (const c of cards) dst.push(c);
    let pts = 0;
    const fk = m.from[0];
    const tk = m.to[0];
    if (m.from === 'waste') {
      s.fan = s.waste.length ? Math.max(1, s.fan - 1) : 0;
      pts += tk === 't' ? SCORE.wasteToTab : SCORE.toFound;
    } else if (fk === 't' && tk === 'f') {
      pts += SCORE.toFound;
    } else if (fk === 'f' && tk === 't') {
      pts += SCORE.foundToTab;
    }
    let flipped = false;
    if (fk === 't') {
      const c = colOf(m.from);
      // Cột chỉ còn lá úp: tự lật lá trên cùng
      if (s.down[c] > 0 && s.down[c] >= s.tab[c].length) {
        s.down[c] = s.tab[c].length - 1;
        flipped = true;
        pts += SCORE.flip;
      }
    }
    s.score = Math.max(0, s.score + pts); // điểm không xuống dưới 0
    s.moveCount++;
    return { points: pts, flipped, drawn: 0, redeal: false };
  }

  /** Mọi nước hợp lệ (kể cả rút bài). Dùng cho test và kiểm tra hết nước. */
  function legalMoves(s) {
    const srcs = [];
    if (s.waste.length) srcs.push(['waste', 1]);
    FOUND.forEach((f, i) => {
      if (s.found[i].length) srcs.push([f, 1]);
    });
    TAB.forEach((t, c) => {
      for (let n = 1; n <= faceUpCount(s, c); n++) if (isRun(s, c, n)) srcs.push([t, n]);
    });
    const out = [];
    for (const [from, n] of srcs) {
      for (const to of FOUND.concat(TAB)) {
        if (canMove(s, from, n, to)) out.push({ t: 'move', from, n, to });
      }
    }
    if (s.stock.length || s.waste.length) out.push({ t: 'draw' });
    return out;
  }

  /**
   * Các đích hợp lệ cho n lá bốc từ from, theo thứ tự "chạm để đi":
   * ô đích trước (chỉ khi bốc 1 lá), rồi các cột có bài tính từ cột bên phải nguồn, cuối cùng là một cột trống.
   * Bỏ nước vô ích: chuyển cả cột (Già ở đáy) sang cột trống khác.
   */
  function destinations(s, from, n) {
    const out = [];
    if (!movable(s, from, n)) return out;
    if (n === 1 && from[0] !== 'f') {
      const f = FOUND.find((id) => canMove(s, from, 1, id));
      if (f) out.push(f);
    }
    const start = from[0] === 't' ? colOf(from) + 1 : 0;
    let empty = null;
    for (let k = 0; k < 7; k++) {
      const c = (start + k) % 7;
      const id = TAB[c];
      if (id === from || !canMove(s, from, n, id)) continue;
      if (!s.tab[c].length) {
        if (from[0] === 't' && s.tab[colOf(from)].length === n) continue;
        if (empty === null) empty = id;
        continue;
      }
      out.push(id);
    }
    if (empty) out.push(empty);
    return out;
  }

  /* ---------------- Kết thúc, tự hoàn thành ---------------- */

  const foundCount = (s) => s.found.reduce((a, f) => a + f.length, 0);
  const isWon = (s) => foundCount(s) === 52;
  const allFaceUp = (s) => s.down.every((d) => d === 0);

  /** Nước đưa lá nhỏ nhất (trên đầu cột hoặc chồng thải) lên đích, hoặc null. */
  function lowestToFoundation(s) {
    let best = null;
    let bestRank = 99;
    const srcs = s.waste.length ? ['waste'].concat(TAB) : TAB;
    for (const from of srcs) {
      const p = pile(s, from);
      if (!p.length) continue;
      const card = topOf(p);
      if (rankOf(card) >= bestRank) continue;
      const to = FOUND.find((f) => canMove(s, from, 1, f));
      if (to) {
        best = { t: 'move', from, n: 1, to };
        bestRank = rankOf(card);
      }
    }
    return best;
  }

  /**
   * Danh sách nước để tự xếp nốt khi mọi lá trên cột đã ngửa: luôn đưa lá nhỏ nhất lên đích,
   * không có thì rút bài. Rút hết một vòng mà không lên được lá nào (hiếm, chỉ với rút 3) thì trả về null.
   */
  function autoCompleteMoves(s) {
    if (!allFaceUp(s)) return null;
    const t = clone(s);
    const out = [];
    let idle = 0;
    const idleMax = 2 * (t.stock.length + t.waste.length + 2);
    while (!isWon(t)) {
      const m = lowestToFoundation(t);
      if (m) {
        apply(t, m);
        out.push(m);
        idle = 0;
        continue;
      }
      if ((!t.stock.length && !t.waste.length) || ++idle > idleMax) return null;
      const d = { t: 'draw' };
      apply(t, d);
      out.push(d);
    }
    return out;
  }
  const canAutoComplete = (s) => !isWon(s) && autoCompleteMoves(s) !== null;

  /* ---------------- Gợi ý ---------------- */

  /** Lá c (đang ở chồng rút / thải) có chỗ đặt ngay trên bàn hiện tại không. */
  function placeable(s, c) {
    for (let f = 0; f < 4; f++) if (canDropFound(s, f, c)) return true;
    for (let col = 0; col < 7; col++) if (canDropTab(s, col, c)) return true;
    return false;
  }

  /**
   * Gợi ý một nước có ích, theo thứ tự:
   *   1. lên đích (ưu tiên lá giúp lật lá úp), 2. chuyển cả dãy ngửa để lật lá úp,
   *   3. chồng thải xuống cột, 4. tách dãy để lá bên dưới lên đích,
   *   5. dọn trống cột khi có Già đang chờ, 6. rút bài nếu còn lá có thể dùng.
   * Không còn nước có ích thì trả về null.
   */
  function hint(s) {
    if (isWon(s)) return null;
    // 1. Lên đích
    const toF = [];
    TAB.forEach((from, c) => {
      if (!s.tab[c].length) return;
      const to = FOUND.find((f) => canMove(s, from, 1, f));
      if (to) toF.push({ m: { t: 'move', from, n: 1, to }, w: s.down[c] > 0 && s.tab[c].length - 1 === s.down[c] ? 0 : 2 });
    });
    if (s.waste.length) {
      const to = FOUND.find((f) => canMove(s, 'waste', 1, f));
      if (to) toF.push({ m: { t: 'move', from: 'waste', n: 1, to }, w: 1 });
    }
    if (toF.length) return toF.sort((a, b) => a.w - b.w)[0].m;

    // 2. Chuyển cả dãy ngửa để lật lá úp (cột nhiều lá úp trước)
    const order = TAB.map((t, c) => c).sort((a, b) => s.down[b] - s.down[a]);
    for (const c of order) {
      if (!s.down[c]) continue;
      const n = faceUpCount(s, c);
      const dest = destinations(s, TAB[c], n).find((d) => d[0] === 't');
      if (dest) return { t: 'move', from: TAB[c], n, to: dest };
    }

    // 3. Chồng thải xuống cột
    if (s.waste.length) {
      const dest = destinations(s, 'waste', 1).find((d) => d[0] === 't');
      if (dest) return { t: 'move', from: 'waste', n: 1, to: dest };
    }

    // 4. Tách dãy để lá ngay bên dưới lên đích
    for (let c = 0; c < 7; c++) {
      const t = s.tab[c];
      for (let n = 1; n < faceUpCount(s, c); n++) {
        const under = t[t.length - n - 1];
        if (!FOUND.some((f, i) => canDropFound(s, i, under))) continue;
        const dest = destinations(s, TAB[c], n).find((d) => d[0] === 't');
        if (dest) return { t: 'move', from: TAB[c], n, to: dest };
      }
    }

    // 5. Dọn trống một cột khi có Già (không nằm ở đáy cột) đang chờ chỗ
    const kingWaiting = (s.waste.length && rankOf(topOf(s.waste)) === 13) ||
      TAB.some((t, c) => {
        const tt = s.tab[c];
        for (let i = s.down[c]; i < tt.length; i++) if (rankOf(tt[i]) === 13 && i > 0 && isRun(s, c, tt.length - i)) return true;
        return false;
      });
    if (kingWaiting && !s.tab.some((t) => !t.length)) {
      for (let c = 0; c < 7; c++) {
        if (s.down[c] || !s.tab[c].length) continue;
        const n = s.tab[c].length;
        const dest = destinations(s, TAB[c], n).find((d) => d[0] === 't' && s.tab[colOf(d)].length);
        if (dest) return { t: 'move', from: TAB[c], n, to: dest };
      }
    }

    // 6. Rút bài, nếu trong chồng rút / thải còn lá đặt được ở đâu đó
    if (s.stock.length || s.waste.length) {
      const pool = s.stock.concat(s.waste);
      if (pool.some((c) => placeable(s, c))) return { t: 'draw' };
    }
    return null;
  }

  /* ---------------- Dựng lại ván ---------------- */

  /** Chuẩn hóa một nước đọc từ JSON; sai định dạng thì trả về null. */
  function normalizeMove(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.t === 'draw') return { t: 'draw' };
    if (m.t === 'move' && typeof m.from === 'string' && typeof m.to === 'string' && Number.isInteger(m.n)) {
      return { t: 'move', from: m.from, n: m.n, to: m.to };
    }
    return null;
  }

  /** Chia lại từ bộ bài rồi đi lần lượt các nước. Có nước sai luật thì trả về null. */
  function replay(deck, draw, moves) {
    if (!isDeck(deck)) return null;
    const s = deal(deck, draw);
    for (const raw of moves || []) {
      const m = normalizeMove(raw);
      if (!m || !apply(s, m)) return null;
    }
    return s;
  }

  return {
    SUITS,
    RANK_TEXT,
    RANK_NAME,
    SCORE,
    DAILY_DRAW,
    TAB,
    FOUND,
    suitOf,
    rankOf,
    isRed,
    cardName,
    seededRandom,
    hashString,
    dailySeed,
    shuffledDeck,
    dailyDeck,
    isDeck,
    blankState,
    deal,
    clone,
    pile,
    canStack,
    isRun,
    faceUpCount,
    movable,
    canMove,
    isLegal,
    apply,
    legalMoves,
    destinations,
    foundCount,
    isWon,
    allFaceUp,
    autoCompleteMoves,
    canAutoComplete,
    hint,
    normalizeMove,
    replay,
  };
})();

if (typeof window !== 'undefined') window.XepBai = XepBai;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XepBai;
}
