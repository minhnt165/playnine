/* =====================================================================
 * Kim Tự Tháp - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Luật Pyramid chuẩn: 28 lá xếp tháp 7 hàng (lá hàng dưới đè lên hai lá hàng trên), 24 lá còn lại là chồng rút
 *   - Lá chơi được: lá tháp không còn lá nào đè, lá trên cùng của chồng rút và của chồng bỏ
 *   - Bỏ hai lá chơi được có tổng 13 (A = 1, J = 11, Q = 12); K = 13 bỏ một mình
 *   - Rút lá: lá trên cùng chồng rút sang chồng bỏ. Hết chồng rút thì quay vòng chồng bỏ, tối đa 2 lần (3 lượt)
 *   - Thắng khi dọn hết tháp; thua khi không còn cặp, không rút được và hết lượt quay vòng
 *   - Hoàn tác 3 lần mỗi ván; gợi ý dùng bộ giải
 *   - Chỉ chia ván giải được: xáo theo seed rồi giữ ván đầu tiên mà bộ giải (DFS có nhớ trạng thái) dọn được tháp
 *   - Lá là id chuỗi của ../_kit/cards.js ('AS', '10H', 'KD'); chồng rút / chồng bỏ: phần tử cuối là lá trên cùng
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const ROWS = 7;
  const PYRAMID = 28;
  const MAX_RECYCLES = 2; // quay vòng tối đa 2 lần = 3 lượt qua chồng rút
  const UNDO_LIMIT = 3;
  const GEN_LIMIT = 40000; // số trạng thái tối đa bộ giải duyệt khi chia ván (quá thì bỏ ván, xáo ván khác)
  const GEN_TRIES = 80;

  /* ---------------- Hình tháp ---------------- */

  const ROW = [];
  const COL = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c <= r; c++) { ROW.push(r); COL.push(c); }
  const idx = (r, c) => (r * (r + 1)) / 2 + c;
  /** Hai ô ở hàng dưới đè lên ô p (hàng cuối: không có). */
  const COVERS = ROW.map((r, p) => (r < ROWS - 1 ? [idx(r + 1, COL[p]), idx(r + 1, COL[p] + 1)] : []));
  const COVER_MASK = COVERS.map((a) => a.reduce((m, q) => m | (1 << q), 0));
  /** Vùng đè của ô p: mọi ô phải gỡ trước thì p mới lộ ra (hàng r' > r, cột c..c + (r' - r)). */
  const CONE = ROW.map((r, p) => {
    const out = [];
    for (let r2 = r + 1; r2 < ROWS; r2++) for (let c2 = COL[p]; c2 <= COL[p] + (r2 - r); c2++) out.push(idx(r2, c2));
    return out;
  });
  const CONE_MASK = CONE.map((a) => a.reduce((m, q) => m | (1 << q), 0));
  /** Hai ô tháp có thể cùng chơi được (không ô nào nằm trong vùng đè của ô kia). */
  const compatible = (p, q) => !((CONE_MASK[p] >> q) & 1) && !((CONE_MASK[q] >> p) & 1);

  /* ---------------- Lá ---------------- */

  const RANK = {}; // id chuẩn -> bậc (id lạ không có trong bảng)
  C.newDeck().forEach((c) => { RANK[C.toId(c)] = c.rank; });
  const isId = (x) => typeof x === 'string' && Object.prototype.hasOwnProperty.call(RANK, x);
  const top = (a) => (a.length ? a[a.length - 1] : null);

  /* ---------------- Trạng thái ---------------- */

  /** Ván từ bộ bài 52 id đã xáo: 28 lá đầu lên tháp (theo hàng), lá thứ 29 nằm trên cùng chồng rút. */
  function fromDeck(ids, seed) {
    return {
      seed: seed >>> 0,
      pyramid: ids.slice(0, PYRAMID),
      stock: ids.slice(PYRAMID).reverse(),
      waste: [],
      recycles: 0,
      moves: 0,
      undoLeft: UNDO_LIMIT,
      assisted: false,
      history: [],
    };
  }

  function cardAt(g, pos) {
    if (pos === 'stock') return top(g.stock);
    if (pos === 'waste') return top(g.waste);
    return Number.isInteger(pos) && pos >= 0 && pos < PYRAMID ? g.pyramid[pos] : null;
  }

  function isAvailable(g, pos) {
    if (pos === 'stock') return g.stock.length > 0;
    if (pos === 'waste') return g.waste.length > 0;
    if (!Number.isInteger(pos) || pos < 0 || pos >= PYRAMID || !g.pyramid[pos]) return false;
    return COVERS[pos].every((q) => !g.pyramid[q]);
  }

  /** Mọi chỗ chơi được: ô tháp (số) rồi 'stock', 'waste'. */
  function available(g) {
    const out = [];
    for (let p = 0; p < PYRAMID; p++) if (isAvailable(g, p)) out.push(p);
    if (g.stock.length) out.push('stock');
    if (g.waste.length) out.push('waste');
    return out;
  }

  const rankAt = (g, pos) => RANK[cardAt(g, pos)] || 0;
  const isWon = (g) => g.pyramid.every((x) => !x);
  const canRemove = (g, a) => isAvailable(g, a) && rankAt(g, a) === 13;
  const canPair = (g, a, b) => a !== b && isAvailable(g, a) && isAvailable(g, b) && rankAt(g, a) + rankAt(g, b) === 13;
  const canDraw = (g) => !isWon(g) && g.stock.length > 0;
  const canRecycle = (g) => !isWon(g) && !g.stock.length && g.waste.length > 0 && g.recycles < MAX_RECYCLES;

  /** Các nước bỏ lá đang có: K trước, rồi cặp trong tháp, cặp tháp + chồng, cặp hai chồng. */
  function removals(g) {
    const av = available(g);
    const out = [];
    av.forEach((a) => { if (rankAt(g, a) === 13) out.push({ type: 'pair', a }); });
    for (let i = 0; i < av.length; i++) {
      for (let j = i + 1; j < av.length; j++) {
        if (rankAt(g, av[i]) + rankAt(g, av[j]) === 13) out.push({ type: 'pair', a: av[i], b: av[j] });
      }
    }
    return out;
  }

  const isStuck = (g) => !isWon(g) && !canDraw(g) && !canRecycle(g) && removals(g).length === 0;
  const isOver = (g) => isWon(g) || isStuck(g);
  /** Lượt đang chơi (1..3) và số lần quay vòng còn lại. */
  const pass = (g) => g.recycles + 1;
  const passesLeft = (g) => MAX_RECYCLES - g.recycles;

  const snapshot = (g) => ({ pyramid: g.pyramid.slice(), stock: g.stock.slice(), waste: g.waste.slice(), recycles: g.recycles });

  /** Bản sao để đi một nước: lưu trạng thái cũ cho hoàn tác (giữ tối đa UNDO_LIMIT bản), tăng số nước. */
  function step(g) {
    const history = g.history.concat([snapshot(g)]).slice(-UNDO_LIMIT);
    return Object.assign({}, g, { pyramid: g.pyramid.slice(), stock: g.stock.slice(), waste: g.waste.slice(), moves: g.moves + 1, history });
  }

  function take(n, pos) {
    if (pos === 'stock') n.stock.pop();
    else if (pos === 'waste') n.waste.pop();
    else n.pyramid[pos] = null;
  }

  /** Bỏ lá: remove(g, a) cho K, remove(g, a, b) cho cặp tổng 13. Nước sai trả lại đúng g. */
  function remove(g, a, b) {
    if (isOver(g)) return g;
    if (b == null ? !canRemove(g, a) : !canPair(g, a, b)) return g;
    const n = step(g);
    take(n, a);
    if (b != null) take(n, b);
    return n;
  }

  function draw(g) {
    if (isOver(g) || !canDraw(g)) return g;
    const n = step(g);
    n.waste.push(n.stock.pop());
    return n;
  }

  /** Quay vòng: chồng bỏ úp lại thành chồng rút, lá rút đầu tiên lại nằm trên cùng. */
  function recycle(g) {
    if (isOver(g) || !canRecycle(g)) return g;
    const n = step(g);
    n.stock = n.waste.reverse();
    n.waste = [];
    n.recycles++;
    return n;
  }

  const canUndo = (g) => !isOver(g) && g.undoLeft > 0 && g.history.length > 0;

  function undo(g) {
    if (!canUndo(g)) return g;
    const prev = g.history[g.history.length - 1];
    return Object.assign({}, g, snapshot(prev), { undoLeft: g.undoLeft - 1, history: g.history.slice(0, -1) });
  }

  const markAssisted = (g) => (g.assisted ? g : Object.assign({}, g, { assisted: true }));

  /* ---------------- Bộ giải ---------------- */

  /**
   * DFS có nhớ trạng thái đã duyệt. Trạng thái nén: mặt nạ lá tháp còn lại (28 bit), mặt nạ lá chồng còn lại
   * (theo thứ tự rút: chồng bỏ từ đáy lên rồi chồng rút từ trên xuống), vị trí lá trên cùng chồng rút, số lần
   * quay vòng còn lại. Cắt nhánh:
   *   - K chơi được thì bỏ ngay (không bao giờ thiệt), không thử nước khác
   *   - với mỗi cặp bậc (r, 13 - r): mọi lá tháp phải ghép được với một lá bù riêng không nằm trong vùng đè
   *     của nó (và nó không nằm trong vùng đè của lá bù); lá ở chồng coi như ghép được với mọi lá (nới lỏng)
   * opts: { limit = 200000 trạng thái, recycles = 2 (tổng số lần quay vòng cho phép, tính cả số lần đã quay) }
   * Trả { solvable: true | false | null (quá giới hạn), moves: [{ type: 'pair', a, b? } | { type: 'draw' } | { type: 'recycle' }], nodes }
   */
  function solve(g, opts) {
    const o = opts || {};
    const limit = o.limit || 200000;
    const maxRec = o.recycles == null ? MAX_RECYCLES : o.recycles;
    const prune = o.prune !== false; // chỉ test mới tắt (để đối chiếu)
    const pr = new Array(PYRAMID).fill(0);
    let pm0 = 0;
    for (let p = 0; p < PYRAMID; p++) if (g.pyramid[p]) { pr[p] = RANK[g.pyramid[p]]; pm0 |= 1 << p; }
    const talon = g.waste.concat(g.stock.slice().reverse());
    const tr = talon.map((id) => RANK[id]);
    const n = talon.length;
    const nW = g.waste.length;
    // Vị trí lá tháp / lá chồng theo bậc (để kiểm cắt nhánh nhanh)
    const pyrOf = [];
    const talOf = [];
    for (let r = 0; r <= 13; r++) { pyrOf.push([]); talOf.push([]); }
    pr.forEach((r, p) => { if (r) pyrOf[r].push(p); });
    tr.forEach((r, i) => talOf[r].push(i));

    const nextSet = (tm, i) => {
      const m = i >= 32 ? 0 : tm & ~((1 << i) - 1);
      return m ? 31 - Math.clz32(m & -m) : n;
    };
    const prevSet = (tm, i) => {
      const m = i >= 32 ? tm : tm & ((1 << i) - 1);
      return m ? 31 - Math.clz32(m) : -1;
    };

    /** Còn ghép đủ cho mọi lá tháp bậc r và 13 - r không (ghép cặp hai phía, tối đa 4 x 4). */
    function feasible(L, R, tL, tR) {
      function rec(i, used, tRleft) {
        if (i === L.length) {
          let free = 0;
          for (let j = 0; j < R.length; j++) if (!((used >> j) & 1)) free++;
          return free <= tL;
        }
        if (tRleft > 0 && rec(i + 1, used, tRleft - 1)) return true;
        for (let j = 0; j < R.length; j++) {
          if (!((used >> j) & 1) && compatible(L[i], R[j]) && rec(i + 1, used | (1 << j), tRleft)) return true;
        }
        return false;
      }
      return rec(0, 0, tR);
    }
    function dead(pm, tm) {
      for (let r = 1; r <= 6; r++) {
        const L = pyrOf[r].filter((p) => (pm >> p) & 1);
        const R = pyrOf[13 - r].filter((p) => (pm >> p) & 1);
        if (!L.length && !R.length) continue;
        const tL = talOf[r].filter((i) => (tm >> i) & 1).length;
        const tR = talOf[13 - r].filter((i) => (tm >> i) & 1).length;
        if (L.length > R.length + tR || R.length > L.length + tL) return true;
        if (!feasible(L, R, tL, tR)) return true;
      }
      return false;
    }

    const seen = new Set();
    const path = [];
    let nodes = 0;
    let aborted = false;

    function dfs(pm, tm, ptr, rl) {
      if (pm === 0) return true;
      if (aborted) return false;
      if (++nodes > limit) {
        aborted = true;
        return false;
      }
      const key = pm + ',' + tm + ',' + ptr + ',' + rl;
      if (seen.has(key)) return false;
      seen.add(key);
      if (prune && dead(pm, tm)) return false;

      const st = ptr < n ? ptr : -1; // lá trên cùng chồng rút
      const wt = prevSet(tm, ptr); // lá trên cùng chồng bỏ
      const av = [];
      for (let p = PYRAMID - 1; p >= 0; p--) if ((pm >> p) & 1 && !(pm & COVER_MASK[p])) av.push(p);

      const tryMove = (move, pm2, tm2, ptr2, rl2) => {
        path.push(move);
        if (dfs(pm2, tm2, ptr2, rl2)) return true;
        path.pop();
        return false;
      };
      const offStock = (tm2) => nextSet(tm2, st);

      // K: bỏ ngay, không thử nước khác
      for (let i = 0; i < av.length; i++) {
        if (pr[av[i]] === 13) return tryMove({ type: 'pair', a: av[i] }, pm & ~(1 << av[i]), tm, ptr, rl);
      }
      if (st >= 0 && tr[st] === 13) { const tm2 = tm & ~(1 << st); return tryMove({ type: 'pair', a: 'stock' }, pm, tm2, offStock(tm2), rl); }
      if (wt >= 0 && tr[wt] === 13) return tryMove({ type: 'pair', a: 'waste' }, pm, tm & ~(1 << wt), ptr, rl);

      // Cặp trong tháp (hàng dưới trước)
      for (let i = 0; i < av.length; i++) {
        for (let j = i + 1; j < av.length; j++) {
          if (pr[av[i]] + pr[av[j]] === 13 && tryMove({ type: 'pair', a: av[i], b: av[j] }, pm & ~(1 << av[i]) & ~(1 << av[j]), tm, ptr, rl)) return true;
        }
      }
      // Cặp tháp + lá trên cùng của chồng rút / chồng bỏ
      for (let i = 0; i < av.length; i++) {
        const p = av[i];
        if (st >= 0 && pr[p] + tr[st] === 13) {
          const tm2 = tm & ~(1 << st);
          if (tryMove({ type: 'pair', a: p, b: 'stock' }, pm & ~(1 << p), tm2, offStock(tm2), rl)) return true;
        }
        if (wt >= 0 && pr[p] + tr[wt] === 13) {
          if (tryMove({ type: 'pair', a: p, b: 'waste' }, pm & ~(1 << p), tm & ~(1 << wt), ptr, rl)) return true;
        }
      }
      // Cặp hai chồng
      if (st >= 0 && wt >= 0 && tr[st] + tr[wt] === 13) {
        const tm2 = tm & ~(1 << st) & ~(1 << wt);
        if (tryMove({ type: 'pair', a: 'stock', b: 'waste' }, pm, tm2, offStock(tm2), rl)) return true;
      }
      // Rút lá / quay vòng
      if (st >= 0) return tryMove({ type: 'draw' }, pm, tm, nextSet(tm, st + 1), rl);
      if (rl > 0 && wt >= 0) return tryMove({ type: 'recycle' }, pm, tm, nextSet(tm, 0), rl - 1);
      return false;
    }

    const tm0 = n ? (n >= 32 ? -1 : (1 << n) - 1) : 0;
    const found = dfs(pm0, tm0, nextSet(tm0, nW), Math.max(0, maxRec - g.recycles));
    return { solvable: found ? true : aborted ? null : false, moves: found ? path.slice() : [], nodes };
  }

  /**
   * Gợi ý: nước đầu của lời giải từ trạng thái hiện tại. Bộ giải không tìm được (hết đường thắng hoặc quá giới hạn)
   * thì trả một nước đi được: cặp / K, rút lá, quay vòng. Trả { move | null, solvable: true | false | null }.
   */
  function hint(g, opts) {
    if (isOver(g)) return { move: null, solvable: isWon(g) };
    const res = solve(g, { limit: (opts && opts.limit) || 60000 });
    if (res.solvable) return { move: res.moves[0], solvable: true };
    const any = removals(g)[0] || (canDraw(g) ? { type: 'draw' } : canRecycle(g) ? { type: 'recycle' } : null);
    return { move: any, solvable: res.solvable };
  }

  /* ---------------- Chia ván ---------------- */

  // Ván dự phòng (bậc của 52 lá, 28 lá tháp rồi 24 lá chồng theo thứ tự rút), bộ giải dọn được; chỉ dùng khi xáo
  // GEN_TRIES lần đều không ra ván giải được trong giới hạn. Luật chỉ dựa vào bậc nên đổi chất vẫn giải được.
  const FALLBACK = [
    12, 6, 11, 11, 5, 6, 12, 3, 7, 4, 10, 10, 2, 9, 12, 4, 11, 8, 9, 2, 5, 2, 7, 13, 5, 8, 9, 4,
    13, 2, 11, 12, 13, 9, 3, 5, 1, 10, 3, 6, 8, 7, 4, 6, 13, 3, 1, 8, 10, 1, 1, 7,
  ];

  function fallbackDeal(seed) {
    const r = C.rng('kimtuthap-' + (seed >>> 0));
    const suits = {};
    for (let k = 1; k <= 13; k++) suits[k] = C.shuffle(C.SUITS, r);
    const used = {};
    const ids = FALLBACK.map((k) => {
      used[k] = (used[k] || 0) + 1;
      return C.toId({ rank: k, suit: suits[k][used[k] - 1] });
    });
    return fromDeck(ids, seed);
  }

  /** Ván mới giải được theo seed (bỏ trống = ngẫu nhiên): xáo, giữ ván đầu tiên bộ giải chứng minh dọn được tháp. */
  function newGame(opts) {
    const o = opts || {};
    const seed = Number.isInteger(o.seed) ? o.seed >>> 0 : Math.floor(Math.random() * 4294967296);
    const r = C.rng(seed);
    for (let i = 0; i < GEN_TRIES; i++) {
      const g = fromDeck(C.shuffle(C.newDeck(), r).map(C.toId), seed);
      if (solve(g, { limit: GEN_LIMIT }).solvable === true) return g;
    }
    return fallbackDeal(seed);
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      v: VERSION,
      seed: g.seed,
      pyramid: g.pyramid.slice(),
      stock: g.stock.slice(),
      waste: g.waste.slice(),
      recycles: g.recycles,
      moves: g.moves,
      undoLeft: g.undoLeft,
      assisted: g.assisted,
      history: g.history.map(snapshot),
    };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /**
   * Bố cục lá có thể xảy ra: đủ dạng, id chuẩn không trùng, ô đã gỡ thì hai ô đè lên nó cũng đã gỡ,
   * và lá đã bỏ cân theo cặp (số lá bậc r đã bỏ = số lá bậc 13 - r đã bỏ).
   */
  function validLayout(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.pyramid) || s.pyramid.length !== PYRAMID) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.waste) || !isInt(s.recycles, 0, MAX_RECYCLES)) return false;
    if (!s.pyramid.every((x) => x === null || isId(x)) || !s.stock.every(isId) || !s.waste.every(isId)) return false;
    const present = s.pyramid.filter(Boolean).concat(s.stock, s.waste);
    if (new Set(present).size !== present.length) return false;
    for (let p = 0; p < PYRAMID; p++) if (!s.pyramid[p] && COVERS[p].some((q) => s.pyramid[q])) return false;
    const gone = new Array(14).fill(4);
    present.forEach((id) => { gone[RANK[id]]--; });
    for (let r = 1; r <= 6; r++) if (gone[r] !== gone[13 - r]) return false;
    return true;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (!isInt(raw.seed, 0, 4294967295) || !isInt(raw.moves, 0, 1e6) || !isInt(raw.undoLeft, 0, UNDO_LIMIT)) return null;
    if (typeof raw.assisted !== 'boolean' || !validLayout(raw)) return null;
    if (!Array.isArray(raw.history) || raw.history.length > UNDO_LIMIT || !raw.history.every(validLayout)) return null;
    return {
      seed: raw.seed,
      pyramid: raw.pyramid.slice(),
      stock: raw.stock.slice(),
      waste: raw.waste.slice(),
      recycles: raw.recycles,
      moves: raw.moves,
      undoLeft: raw.undoLeft,
      assisted: raw.assisted,
      history: raw.history.map(snapshot),
    };
  }

  const api = {
    VERSION, ROWS, PYRAMID, MAX_RECYCLES, UNDO_LIMIT,
    rowCol: (p) => [ROW[p], COL[p]],
    covers: (p) => COVERS[p].slice(),
    cone: (p) => CONE[p].slice(),
    rankOf: (id) => RANK[id] || 0,
    fromDeck, newGame, fallbackDeal,
    cardAt, isAvailable, available, canRemove, canPair, canDraw, canRecycle, removals,
    remove, draw, recycle, canUndo, undo, markAssisted,
    isWon, isStuck, isOver, pass, passesLeft,
    solve, hint,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
