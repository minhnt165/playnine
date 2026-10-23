/* =====================================================================
 * Xếp Bài Nhện - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - 104 lá (2 bộ) lấy từ ../_kit/cards.js, xáo bằng rng có hạt giống: cùng hạt giống + số chất = cùng ván
 *   - Trạng thái bất biến: move / deal / undo trả trạng thái MỚI (nước sai luật trả null)
 *   - Lá gọi bằng chỉ số 0..103 trong mảng `cards` (thứ tự sau khi xáo); cột, chồng chia, ô đích là mảng chỉ số
 *   - Ván lưu chỉ gồm hạt giống + các nước còn hiệu lực: khôi phục bằng cách chơi lại từ đầu,
 *     nước nào sai luật thì coi như dữ liệu hỏng (trả null)
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const COLS = 10;
  const RUNS = 8; // 104 lá = 8 dãy K→A
  const DEAL_COUNT = 54; // lá chia ra bàn lúc đầu: 4 cột × 6 + 6 cột × 5
  const SUIT_MODES = [1, 2, 4];
  const MAX_SEED = 4294967295;

  /* ---------------- Tạo ván ---------------- */

  const validSeed = (x) => Number.isInteger(x) && x >= 0 && x <= MAX_SEED;

  /**
   * Ván mới. opts: { suits: 1 | 2 | 4, seed: số nguyên 32 bit (bỏ trống = ngẫu nhiên) }.
   * Chia vòng từ trái sang phải: 54 lá đầu ra bàn (4 cột đầu 6 lá, 6 cột sau 5 lá, chỉ lá trên cùng ngửa),
   * 50 lá còn lại là chồng chia (cuối mảng là lá trên cùng).
   */
  function newGame(opts) {
    const o = opts || {};
    const suits = SUIT_MODES.indexOf(o.suits) >= 0 ? o.suits : 1;
    const seed = validSeed(o.seed) ? o.seed : Math.floor(Math.random() * (MAX_SEED + 1));
    const cards = C.shuffle(C.newDeck({ decks: 2, suits }), C.rng(seed));
    const tab = [];
    for (let c = 0; c < COLS; c++) tab.push([]);
    for (let i = 0; i < DEAL_COUNT; i++) tab[i % COLS].push(i);
    const stock = [];
    for (let i = DEAL_COUNT; i < cards.length; i++) stock.push(i);
    return {
      suits,
      seed,
      cards,
      tab,
      down: tab.map((t) => t.length - 1), // số lá úp ở đáy mỗi cột
      stock,
      found: [], // các dãy K→A đã gỡ (mỗi dãy 13 chỉ số, K trước)
      moves: 0, // số lần đi (kể cả chia bài và đi lại), dùng cho điểm cổ điển
      hist: [], // các nước còn hiệu lực (để đi lại và để lưu ván)
    };
  }

  /** Bản sao đủ để sửa mà không đụng trạng thái cũ (cards không bao giờ đổi nên dùng chung). */
  function clone(s) {
    return {
      suits: s.suits,
      seed: s.seed,
      cards: s.cards,
      tab: s.tab.map((t) => t.slice()),
      down: s.down.slice(),
      stock: s.stock.slice(),
      found: s.found.slice(),
      moves: s.moves,
      hist: s.hist.slice(),
    };
  }

  /* ---------------- Tra cứu ---------------- */

  const topIdx = (s, col) => {
    const t = s.tab[col];
    return t.length ? t[t.length - 1] : -1;
  };
  const tableauCount = (s) => s.tab.reduce((n, t) => n + t.length, 0);

  /** Lá b nằm được ngay trên lá a trong một dãy (cùng chất, kém 1 bậc). */
  function suited(s, a, b) {
    const x = s.cards[a];
    const y = s.cards[b];
    return x.suit === y.suit && y.rank === x.rank - 1;
  }

  /** Từ vị trí idx của cột col lên tới đỉnh là dãy giảm dần cùng chất, toàn lá ngửa (bốc được). */
  function canPick(s, col, idx) {
    if (!(col >= 0 && col < COLS) || !Number.isInteger(col)) return false;
    const t = s.tab[col];
    if (!Number.isInteger(idx) || idx < s.down[col] || idx >= t.length) return false;
    for (let k = idx; k < t.length - 1; k++) if (!suited(s, t[k], t[k + 1])) return false;
    return true;
  }

  /** Vị trí thấp nhất bốc được của cột (đầu dãy cùng chất ở đỉnh); cột trống trả -1. */
  function runStart(s, col) {
    const t = s.tab[col];
    if (!t.length) return -1;
    let k = t.length - 1;
    while (k > s.down[col] && suited(s, t[k - 1], t[k])) k--;
    return k;
  }

  /** Chồng từ idx của cột col đặt được lên cột to: cột trống nhận mọi lá; không thì lá đỉnh phải hơn đúng 1 bậc (chất nào cũng được). */
  function canMove(s, col, idx, to) {
    if (!Number.isInteger(to) || to < 0 || to >= COLS || to === col || !canPick(s, col, idx)) return false;
    const top = topIdx(s, to);
    if (top < 0) return true;
    return s.cards[top].rank === s.cards[s.tab[col][idx]].rank + 1;
  }

  /** Chia được: còn bài và không có cột trống (trừ khi trên bàn chưa tới 10 lá, không thể lấp hết cột). */
  function canDeal(s) {
    if (!s.stock.length) return false;
    return s.tab.every((t) => t.length > 0) || tableauCount(s) < COLS;
  }

  const isWon = (s) => s.found.length === RUNS;
  /** Điểm cổ điển: 500, trừ 1 mỗi lần đi, cộng 100 mỗi dãy đã gỡ. */
  const score = (s) => 500 - s.moves + 100 * s.found.length;

  /* ---------------- Đi bài (sửa trên bản sao) ---------------- */

  /** Cột lộ ra lá úp ở đỉnh thì lật lên; trả 1 nếu có lật. */
  function flipTop(s, col) {
    const t = s.tab[col];
    if (t.length && s.down[col] >= t.length) {
      s.down[col] = t.length - 1;
      return 1;
    }
    return 0;
  }

  /** 13 lá trên cùng của cột là K→A cùng chất, đều ngửa: gỡ ra ô đích. Trả 0 (không), 1 (gỡ), 2 (gỡ và lật lá lộ ra). */
  function takeRun(s, col) {
    const t = s.tab[col];
    const n = t.length;
    if (n < 13 || s.down[col] > n - 13 || s.cards[t[n - 13]].rank !== 13) return 0;
    for (let k = n - 13; k < n - 1; k++) if (!suited(s, t[k], t[k + 1])) return 0;
    s.found.push(t.splice(n - 13, 13));
    return 1 + flipTop(s, col);
  }

  /** Đi chồng từ idx của cột col sang cột to. Trả trạng thái mới, sai luật trả null. */
  function move(s, col, idx, to) {
    if (!canMove(s, col, idx, to)) return null;
    const g = clone(s);
    const moved = g.tab[col].splice(idx);
    g.tab[to].push(...moved);
    const fl = flipTop(g, col);
    const run = takeRun(g, to);
    g.moves++;
    g.hist.push({ t: 'm', from: col, idx, to, n: moved.length, fl, run });
    return g;
  }

  /** Chia mỗi cột một lá ngửa từ chồng chia (trái sang phải), rồi gỡ các dãy K→A vừa thành. */
  function deal(s) {
    if (!canDeal(s)) return null;
    const g = clone(s);
    for (let c = 0; c < COLS; c++) g.tab[c].push(g.stock.pop());
    const runs = [];
    for (let c = 0; c < COLS; c++) {
      const r = takeRun(g, c);
      if (r) runs.push({ col: c, fl: r === 2 ? 1 : 0 });
    }
    g.moves++;
    g.hist.push({ t: 'd', runs });
    return g;
  }

  /** Trả dãy K→A cuối cùng ở ô đích về cột col (ngược với takeRun). */
  function putRunBack(g, col, flipped) {
    if (flipped) g.down[col]++;
    g.tab[col].push(...g.found.pop());
  }

  /** Đi lại nước gần nhất (không giới hạn, kể cả lần chia và nước gỡ dãy). Vẫn tính một lần đi cho điểm. Hết nước trả null. */
  function undo(s) {
    if (!s.hist.length) return null;
    const g = clone(s);
    const h = g.hist.pop();
    if (h.t === 'm') {
      if (h.run) putRunBack(g, h.to, h.run === 2);
      if (h.fl) g.down[h.from]++;
      g.tab[h.from].push(...g.tab[h.to].splice(g.tab[h.to].length - h.n));
    } else {
      for (let k = h.runs.length - 1; k >= 0; k--) putRunBack(g, h.runs[k].col, h.runs[k].fl);
      // Lá chia sau cùng (cột phải nhất) trả về trước để chồng chia đúng thứ tự cũ
      for (let c = COLS - 1; c >= 0; c--) g.stock.push(g.tab[c].pop());
    }
    g.moves++;
    return g;
  }

  /* ---------------- Tự đi và gợi ý ---------------- */

  /** Độ dài dãy cùng chất ở đỉnh cột. */
  function topRunLength(s, col) {
    const k = runStart(s, col);
    return k < 0 ? 0 : s.tab[col].length - k;
  }

  /**
   * Các cột đích hợp lệ cho chồng từ idx của cột col, tốt nhất trước (chạm lá để tự đi; chạm lại thì sang đích kế):
   * cùng chất hơn 1 bậc (dãy ở đích càng dài càng tốt) > khác chất hơn 1 bậc > cột trống.
   * Chỉ lấy cột trống đầu tiên (các cột trống như nhau) và không đưa cả cột sang cột trống (vô ích).
   */
  function targets(s, col, idx) {
    if (!canPick(s, col, idx)) return [];
    const c = s.cards[s.tab[col][idx]];
    const out = [];
    let emptyUsed = false;
    for (let to = 0; to < COLS; to++) {
      if (!canMove(s, col, idx, to)) continue;
      const top = topIdx(s, to);
      let v;
      if (top < 0) {
        if (idx === 0 || emptyUsed) continue;
        emptyUsed = true;
        v = 1;
      } else if (s.cards[top].suit === c.suit) v = 300 + topRunLength(s, to);
      else v = 200;
      out.push({ to, v });
    }
    out.sort((a, b) => b.v - a.v || a.to - b.to);
    return out.map((x) => x.to);
  }

  /**
   * Giá trị một nước để gợi ý (0 = không đáng gợi ý). Thứ tự: gỡ được dãy K→A > lật lá úp > làm trống cột >
   * ghép về cùng chất > lộ lá ngửa bên dưới > sang cột trống. Bỏ nước "đi ngang" (chồng đang nằm trên lá hơn
   * 1 bậc chuyển sang lá khác chất) và nước tách dãy cùng chất (trừ khi nhờ đó gỡ được dãy), tránh gợi ý vòng vo.
   */
  function moveValue(s, col, idx, to) {
    const t = s.tab[col];
    const c = s.cards[t[idx]];
    const belowUp = idx > s.down[col];
    const below = idx > 0 ? s.cards[t[idx - 1]] : null;
    const natural = belowUp && below.rank === c.rank + 1;
    const top = topIdx(s, to);
    if (top < 0) {
      if (idx === 0 || natural) return 0;
      return belowUp ? 100 : 150;
    }
    const same = s.cards[top].suit === c.suit;
    const after = move(s, col, idx, to);
    if (after.found.length > s.found.length) return 5000;
    let v;
    if (natural && below.suit === c.suit) return 0;
    if (idx === s.down[col] && idx > 0) v = 1000;
    else if (idx === 0) v = 800;
    else if (same) v = 600;
    else if (!natural) v = 300;
    else return 0;
    return same ? v + 100 + topRunLength(s, to) : v;
  }

  /** Một nước có ích để gợi ý: { t: 'move', col, idx, to } hoặc { t: 'deal' }; không còn gì thì null. */
  function hint(s) {
    let best = null;
    let bestV = 0;
    for (let col = 0; col < COLS; col++) {
      const len = s.tab[col].length;
      for (let idx = runStart(s, col); idx >= 0 && idx < len; idx++) {
        for (let to = 0; to < COLS; to++) {
          if (!canMove(s, col, idx, to)) continue;
          const v = moveValue(s, col, idx, to);
          if (v > bestV) {
            bestV = v;
            best = { t: 'move', col, idx, to };
          }
        }
      }
    }
    if (best && bestV >= 300) return best;
    if (canDeal(s)) return { t: 'deal' };
    return best;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  /** Ván lưu: số chất + hạt giống + các nước còn hiệu lực ([cột, vị trí, đích] hoặc 'd' = chia) + số lần đi. */
  function toJSON(s) {
    return {
      v: VERSION,
      suits: s.suits,
      seed: s.seed,
      moves: s.moves,
      acts: s.hist.map((h) => (h.t === 'm' ? [h.from, h.idx, h.to] : 'd')),
    };
  }

  /** Chơi lại các nước từ đầu; dữ liệu hỏng, sai phiên bản hoặc có nước sai luật thì trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (SUIT_MODES.indexOf(raw.suits) < 0 || !validSeed(raw.seed)) return null;
    if (!Array.isArray(raw.acts) || raw.acts.length > 5000) return null;
    if (!Number.isInteger(raw.moves) || raw.moves < raw.acts.length || raw.moves > 100000) return null;
    let s = newGame({ suits: raw.suits, seed: raw.seed });
    for (const a of raw.acts) {
      if (a === 'd') s = deal(s);
      else if (Array.isArray(a) && a.length === 3 && a.every(Number.isInteger)) s = move(s, a[0], a[1], a[2]);
      else return null;
      if (!s) return null;
    }
    s.moves = raw.moves;
    return s;
  }

  const api = {
    VERSION, COLS, RUNS, SUIT_MODES,
    newGame, topIdx, tableauCount, canPick, runStart, canMove, canDeal, isWon, score,
    move, deal, undo, targets, hint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
