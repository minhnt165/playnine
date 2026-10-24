/* =====================================================================
 * Ô Vuông (Dots and Boxes) - Engine thuần (không đụng DOM)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong Web Worker
 *   (app.js dựng lại mã nguồn qua GameEngine.factory.toString()).
 *
 *   Bàn n×n ô (n = 3, 4, 5), tức (n+1)×(n+1) điểm. Đánh số:
 *   - ô (r, c) = r*n + c
 *   - cạnh ngang h(r, c) = r*n + c          (r = 0..n, c = 0..n-1): nối điểm (c, r) – (c+1, r)
 *   - cạnh dọc   v(r, c) = H + r*(n+1) + c  (r = 0..n-1, c = 0..n), H = (n+1)*n: nối (c, r) – (c, r+1)
 *   Luật:
 *   - Hai bên lần lượt kẻ một cạnh còn trống.
 *   - Kẻ cạnh thứ tư của một ô thì ô đó thuộc về mình (một cạnh có thể khép hai ô) và được đi tiếp.
 *   - Hết cạnh thì bên nhiều ô hơn thắng; bằng nhau là hòa (chỉ xảy ra ở bàn 4×4).
 *
 *   Máy:
 *   - Dễ: có ô khép được thì khép, còn lại kẻ bừa.
 *   - Vừa: khép ô khi được; không kẻ cạnh thứ ba cho ô nào khi còn cạnh an toàn; hết cạnh an toàn thì
 *     nhường phần ít ô nhất (luôn ăn hết chuỗi đối thủ nhường, không biết double-cross).
 *   - Khó: phần cuối dùng bộ giải đúng (negamax alpha-beta + bảng chuyển vị) trên mô hình "dây và xu":
 *     ăn ô "miễn phí" ngay, khi bị nhường chuỗi thì chỉ xét ăn tiếp hoặc double-deal (nhường 2 ô cuối /
 *     4 ô cuối của vòng để giữ quyền kiểm soát), chuỗi / vòng rời nhau thì tính thẳng bằng công thức
 *     đệ quy của tàn cuộc chuỗi đơn (đếm chuỗi). Bộ giải có giới hạn số nút: quá giới hạn (đầu ván bàn lớn)
 *     thì kẻ cạnh an toàn, ưu tiên theo luật chuỗi dài.
 * ===================================================================== */
function OVuongFactory() {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SIZES = [3, 4, 5];
  const LEVELS = ['easy', 'medium', 'hard'];
  const BUDGET = 120000; // số nút tối đa mỗi lần Khó gọi bộ giải

  /* ---------------- Hình học (tính một lần cho mỗi cỡ) ---------------- */
  const GEO = {};
  function geometry(n) {
    if (GEO[n]) return GEO[n];
    const H = (n + 1) * n;
    const E = 2 * n * (n + 1);
    const B = n * n;
    const boxEdges = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) boxEdges.push([r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1]);
    }
    const edgeBoxes = [];
    const edgeXY = [];
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        edgeBoxes.push([r > 0 ? (r - 1) * n + c : -1, r < n ? r * n + c : -1]);
        edgeXY.push([c, r, c + 1, r]);
      }
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n; c++) {
        edgeBoxes.push([c > 0 ? r * n + c - 1 : -1, c < n ? r * n + c : -1]);
        edgeXY.push([c, r, c, r + 1]);
      }
    }
    GEO[n] = { n, H, E, B, boxEdges, edgeBoxes, edgeXY };
    return GEO[n];
  }

  /* ---------------- Luật ---------------- */
  function newGame(n, first) {
    const g = geometry(n);
    return {
      n,
      lines: new Array(g.E).fill(0), // 0 = trống, 1 / 2 = bên đã kẻ
      boxes: new Array(g.B).fill(0), // 0 = chưa khép, 1 / 2 = chủ ô
      turn: first === 2 ? 2 : 1,
      score: [0, 0],
      last: -1, // cạnh vừa kẻ
      plies: 0, // số cạnh đã kẻ
      over: null, // { winner: 0 | 1 | 2 } khi hết cạnh (0 = hòa)
    };
  }

  const sidesOf = (s, b) => geometry(s.n).boxEdges[b].reduce((k, e) => k + (s.lines[e] ? 1 : 0), 0);
  const isLegal = (s, e) => !s.over && Number.isInteger(e) && e >= 0 && e < s.lines.length && !s.lines[e];
  function legalMoves(s) {
    if (s.over) return [];
    const out = [];
    for (let e = 0; e < s.lines.length; e++) if (!s.lines[e]) out.push(e);
    return out;
  }
  /** Số ô cạnh e khép được (0, 1, 2) */
  function completes(s, e) {
    let c = 0;
    geometry(s.n).edgeBoxes[e].forEach((b) => { if (b >= 0 && sidesOf(s, b) === 3) c++; });
    return c;
  }
  /** Cạnh an toàn: kẻ xong không ô nào có đúng 3 cạnh */
  function safeMoves(s) {
    const g = geometry(s.n);
    return legalMoves(s).filter((e) => g.edgeBoxes[e].every((b) => b < 0 || sidesOf(s, b) < 2));
  }
  /** Các ô vừa được khép bởi cạnh cuối cùng (ô kề cạnh đó mà đã khép thì chính cạnh đó khép) */
  function lastBoxes(s) {
    if (s.last < 0) return [];
    return geometry(s.n).edgeBoxes[s.last].filter((b) => b >= 0 && s.boxes[b] !== 0);
  }

  function judge(score) {
    return { winner: score[0] > score[1] ? 1 : score[1] > score[0] ? 2 : 0 };
  }

  /** Kẻ cạnh e cho bên đang đi. Trả trạng thái mới, hoặc null nếu không hợp lệ. */
  function play(s, e) {
    if (!isLegal(s, e)) return null;
    const g = geometry(s.n);
    const lines = s.lines.slice();
    const boxes = s.boxes.slice();
    const score = s.score.slice();
    lines[e] = s.turn;
    let closed = 0;
    g.edgeBoxes[e].forEach((b) => {
      if (b >= 0 && g.boxEdges[b].every((x) => lines[x])) {
        boxes[b] = s.turn;
        closed++;
      }
    });
    score[s.turn - 1] += closed;
    const plies = s.plies + 1;
    const over = plies === g.E ? judge(score) : null;
    return { n: s.n, lines, boxes, turn: closed || over ? s.turn : 3 - s.turn, score, last: e, plies, over };
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (s) => ({ v: VERSION, n: s.n, lines: s.lines.join(''), boxes: s.boxes.join(''), turn: s.turn, last: s.last });

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || SIZES.indexOf(raw.n) < 0) return null;
    const g = geometry(raw.n);
    if (typeof raw.lines !== 'string' || !/^[012]*$/.test(raw.lines) || raw.lines.length !== g.E) return null;
    if (typeof raw.boxes !== 'string' || !/^[012]*$/.test(raw.boxes) || raw.boxes.length !== g.B) return null;
    if (raw.turn !== 1 && raw.turn !== 2) return null;
    const lines = raw.lines.split('').map(Number);
    const boxes = raw.boxes.split('').map(Number);
    // Ô có chủ khi và chỉ khi đủ 4 cạnh
    for (let b = 0; b < g.B; b++) if ((boxes[b] !== 0) !== g.boxEdges[b].every((e) => lines[e])) return null;
    const last = raw.last;
    if (!Number.isInteger(last) || last < -1 || last >= g.E || (last >= 0 && !lines[last])) return null;
    const plies = lines.reduce((k, x) => k + (x ? 1 : 0), 0);
    const score = [0, 0];
    boxes.forEach((o) => { if (o) score[o - 1]++; });
    return { n: raw.n, lines, boxes, turn: raw.turn, score, last, plies, over: plies === g.E ? judge(score) : null };
  }

  /* ---------------- PRNG ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (list, rng) => list[Math.floor(rng() * list.length)];
  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* =====================================================================
   * Bàn làm việc cho máy: mảng sửa tại chỗ (kẻ / xóa cạnh) để tìm kiếm nhanh.
   * Giá trị một thế = số ô hơn (của bên đang đi) trong phần còn lại, chỉ phụ thuộc tập cạnh đã kẻ.
   * ===================================================================== */
  function Work(s) {
    const g = geometry(s.n);
    const drawn = new Uint8Array(g.E);
    const sides = new Uint8Array(g.B);
    let lo = 0; // bit cạnh 0..29
    let hi = 0; // bit cạnh 30..59
    let left = 0; // số ô chưa khép
    for (let e = 0; e < g.E; e++) {
      if (!s.lines[e]) continue;
      drawn[e] = 1;
      if (e < 30) lo |= 1 << e;
      else hi |= 1 << (e - 30);
    }
    for (let b = 0; b < g.B; b++) {
      sides[b] = g.boxEdges[b].reduce((k, e) => k + drawn[e], 0);
      if (sides[b] < 4) left++;
    }
    const w = {
      g, drawn, sides,
      key: () => lo + ':' + hi,
      left: () => left,
      /** Kẻ cạnh e, trả số ô khép được */
      draw(e) {
        drawn[e] = 1;
        if (e < 30) lo ^= 1 << e;
        else hi ^= 1 << (e - 30);
        let c = 0;
        const eb = g.edgeBoxes[e];
        for (let i = 0; i < 2; i++) {
          const b = eb[i];
          if (b >= 0 && ++sides[b] === 4) c++;
        }
        left -= c;
        return c;
      },
      undraw(e) {
        drawn[e] = 0;
        if (e < 30) lo ^= 1 << e;
        else hi ^= 1 << (e - 30);
        const eb = g.edgeBoxes[e];
        for (let i = 0; i < 2; i++) {
          const b = eb[i];
          if (b >= 0 && sides[b]-- === 4) left++;
        }
      },
      /** Cạnh còn trống của ô b (khác cạnh `not`) */
      freeEdge(b, not) {
        const es = g.boxEdges[b];
        for (let i = 0; i < 4; i++) if (!drawn[es[i]] && es[i] !== not) return es[i];
        return -1;
      },
      other(e, b) {
        const eb = g.edgeBoxes[e];
        return eb[0] === b ? eb[1] : eb[0];
      },
      /** Ô ăn "miễn phí": khép được mà không làm ô bên kia thành 3 cạnh (ô bên kia là viền, đã 3 cạnh hoặc ≤ 1 cạnh).
       *  Ăn những ô này luôn không thiệt nên bộ giải ăn ngay, không rẽ nhánh. Trả cạnh, hoặc -1. */
      freeCapture() {
        for (let b = 0; b < g.B; b++) {
          if (sides[b] !== 3) continue;
          const e = w.freeEdge(b, -1);
          const o = w.other(e, b);
          if (o < 0 || sides[o] !== 2) return e;
        }
        return -1;
      },
      safe(e) {
        const eb = g.edgeBoxes[e];
        return (eb[0] < 0 || sides[eb[0]] < 2) && (eb[1] < 0 || sides[eb[1]] < 2);
      },
    };
    return w;
  }

  /** Phân tích "dây và xu": các thành phần liên thông của ô chưa khép (nối qua cạnh trống giữa hai ô).
   *  Thành phần đơn: mọi ô đúng 2 cạnh trống → chuỗi (2 đầu ra viền) hoặc vòng. Còn lại là phức tạp.
   *  Trả { capturable, comps: [{ type: 'chain'|'loop'|'complex', size, boxes, edges }] }. */
  function analyze(w) {
    const { g, drawn, sides } = w;
    const comp = new Int16Array(g.B).fill(-1);
    const comps = [];
    let capturable = false;
    for (let b0 = 0; b0 < g.B; b0++) {
      if (sides[b0] === 4 || comp[b0] >= 0) continue;
      const id = comps.length;
      const boxes = [];
      const edges = [];
      const stack = [b0];
      comp[b0] = id;
      let simple = true;
      let ground = 0;
      while (stack.length) {
        const b = stack.pop();
        boxes.push(b);
        if (sides[b] !== 2) simple = false;
        if (sides[b] === 3) capturable = true;
        const es = g.boxEdges[b];
        for (let i = 0; i < 4; i++) {
          const e = es[i];
          if (drawn[e]) continue;
          const o = w.other(e, b);
          if (o < 0) {
            ground++;
            edges.push(e);
          } else {
            if (b < o) edges.push(e); // cạnh giữa hai ô: ghi một lần
            if (comp[o] < 0) {
              comp[o] = id;
              stack.push(o);
            }
          }
        }
      }
      const type = !simple ? 'complex' : ground === 2 ? 'chain' : ground === 0 ? 'loop' : 'complex';
      comps.push({ type, size: boxes.length, boxes, edges });
    }
    return { capturable, comps };
  }

  /* ---------------- Tàn cuộc chuỗi đơn (chỉ còn chuỗi / vòng rời nhau, không ô nào ăn được) ----------------
   * gval = số ô hơn của bên PHẢI mở một chuỗi / vòng, hai bên chơi đúng:
   *   mở chuỗi k: đối thủ chọn max(ăn hết k rồi tự mở tiếp: k + g(R),  ăn k-2 rồi nhường 2: k - 4 - g(R)) (k ≥ 3)
   *               chuỗi 1, 2 (2 thì mở ở giữa) đối thủ chỉ ăn hết: k + g(R)
   *   mở vòng k:  max(k + g(R), k - 8 - g(R))
   */
  const GMEMO = new Map();
  function gval(chains, loops) {
    if (!chains.length && !loops.length) return 0;
    const key = chains.join(',') + '|' + loops.join(',');
    const hit = GMEMO.get(key);
    if (hit !== undefined) return hit;
    let best = -Infinity;
    for (let i = 0; i < chains.length; i++) {
      if (i > 0 && chains[i] === chains[i - 1]) continue;
      const k = chains[i];
      const r = gval(chains.slice(0, i).concat(chains.slice(i + 1)), loops);
      const opp = k <= 2 ? k + r : Math.max(k + r, k - 4 - r);
      if (-opp > best) best = -opp;
    }
    for (let i = 0; i < loops.length; i++) {
      if (i > 0 && loops[i] === loops[i - 1]) continue;
      const k = loops[i];
      const r = gval(chains, loops.slice(0, i).concat(loops.slice(i + 1)));
      const opp = Math.max(k + r, k - 8 - r);
      if (-opp > best) best = -opp;
    }
    GMEMO.set(key, best);
    return best;
  }

  /** Nước đáng xét ở một thế (đã ăn hết ô miễn phí). Trả { list, simpleVal }:
   *  simpleVal != null khi thế chỉ còn chuỗi / vòng đơn (giá trị tính thẳng bằng gval). */
  function candidates(w, needList) {
    const { g, sides } = w;
    const a = analyze(w);
    if (a.capturable) {
      // Bị nhường chuỗi: ăn tiếp, hoặc double-deal (kẻ cạnh còn lại của ô kế tiếp, nhường hai ô cuối)
      const list = [];
      for (let b = 0; b < g.B; b++) {
        if (sides[b] !== 3) continue;
        const e = w.freeEdge(b, -1);
        if (list.indexOf(e) < 0) list.push(e);
        const o = w.other(e, b);
        if (o >= 0 && sides[o] === 2) {
          const d = w.freeEdge(o, e);
          if (d >= 0 && list.indexOf(d) < 0) list.push(d);
        }
      }
      return { list, simpleVal: null };
    }
    if (a.comps.every((c) => c.type !== 'complex')) {
      const ch = [];
      const lp = [];
      a.comps.forEach((c) => (c.type === 'chain' ? ch : lp).push(c.size));
      ch.sort((x, y) => x - y);
      lp.sort((x, y) => x - y);
      const val = gval(ch, lp);
      if (!needList) return { list: null, simpleVal: val };
    }
    // Danh sách nước: chuỗi đơn chỉ cần mở ở một đầu (chuỗi 2 thêm cạnh giữa), vòng chỉ cần một cạnh,
    // thành phần phức tạp xét mọi cạnh (cạnh an toàn trước)
    const safe = [];
    const rest = [];
    a.comps.forEach((c) => {
      if (c.type === 'chain') {
        const end = c.edges.find((e) => g.edgeBoxes[e][0] < 0 || g.edgeBoxes[e][1] < 0);
        rest.push(end);
        if (c.size === 2) rest.push(c.edges.find((e) => g.edgeBoxes[e][0] >= 0 && g.edgeBoxes[e][1] >= 0));
      } else if (c.type === 'loop') rest.push(c.edges[0]);
      else c.edges.forEach((e) => (w.safe(e) ? safe : rest).push(e));
    });
    return { list: safe.concat(rest), simpleVal: null };
  }

  const ABORT = { abort: true };
  const EXACT = 0;
  const LOWER = 1;
  const UPPER = 2;

  /** Bộ giải: negamax alpha-beta + bảng chuyển vị. ctx: { w, tt, nodes, budget } */
  function search(ctx, alpha, beta) {
    const w = ctx.w;
    if (++ctx.nodes > ctx.budget) throw ABORT;
    // Ăn hết ô miễn phí trước (không rẽ nhánh)
    let gained = 0;
    const forced = [];
    for (let e = w.freeCapture(); e >= 0; e = w.freeCapture()) {
      gained += w.draw(e);
      forced.push(e);
    }
    let val;
    try {
      val = gained + inner(ctx, alpha - gained, beta - gained);
    } finally {
      for (let i = forced.length - 1; i >= 0; i--) w.undraw(forced[i]);
    }
    return val;
  }

  function inner(ctx, alpha, beta) {
    const w = ctx.w;
    if (w.left() === 0) return 0;
    const key = w.key();
    const hit = ctx.tt.get(key);
    if (hit) {
      if (hit.f === EXACT) return hit.v;
      if (hit.f === LOWER && hit.v >= beta) return hit.v;
      if (hit.f === UPPER && hit.v <= alpha) return hit.v;
    }
    const cand = candidates(w, false);
    if (cand.simpleVal != null) return cand.simpleVal;
    const a0 = alpha;
    let best = -Infinity;
    for (const e of cand.list) {
      const c = w.draw(e);
      let v;
      try {
        v = c > 0 ? c + search(ctx, alpha - c, beta - c) : -search(ctx, -beta, -alpha);
      } finally {
        w.undraw(e);
      }
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    ctx.tt.set(key, { v: best, f: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT });
    return best;
  }

  /**
   * Giải đúng thế s cho bên đang đi. opts: { budget, rng }.
   * Trả { move, value } (value = số ô hơn trong phần còn lại), hoặc null nếu vượt giới hạn số nút.
   */
  function solve(s, opts) {
    if (s.over) return null;
    const o = opts || {};
    const w = Work(s);
    const ctx = { w, tt: new Map(), nodes: 0, budget: o.budget || BUDGET };
    const free = w.freeCapture();
    let list;
    if (free >= 0) list = [free];
    else {
      list = candidates(w, true).list;
      if (o.rng) {
        // Xáo để nước bằng điểm nhau không lặp lại; vẫn giữ nước ăn / an toàn lên trước cho cắt tỉa tốt
        const order = (e) => (w.g.edgeBoxes[e].some((b) => b >= 0 && w.sides[b] === 3) ? 0 : w.safe(e) ? 1 : 2);
        list = shuffle(list, o.rng).sort((x, y) => order(x) - order(y));
      }
    }
    let best = -Infinity;
    let move = list[0];
    try {
      for (const e of list) {
        const c = w.draw(e);
        let v;
        try {
          v = c > 0 ? c + search(ctx, best - c, Infinity) : -search(ctx, -Infinity, -best);
        } finally {
          w.undraw(e);
        }
        if (v > best) {
          best = v;
          move = e;
        }
      }
    } catch (err) {
      if (err === ABORT) return null;
      throw err;
    }
    return { move, value: best, nodes: ctx.nodes };
  }

  /* ---------------- Máy theo mức ---------------- */

  /** Kẻ e rồi để đối thủ tham lam ăn liên tục: trả số ô đối thủ ăn được */
  function giveaway(w, e) {
    const done = [e];
    w.draw(e);
    let n = 0;
    for (;;) {
      let found = -1;
      for (let b = 0; b < w.g.B && found < 0; b++) if (w.sides[b] === 3) found = w.freeEdge(b, -1);
      if (found < 0) break;
      n += w.draw(found);
      done.push(found);
    }
    for (let i = done.length - 1; i >= 0; i--) w.undraw(done[i]);
    return n;
  }

  /** Cạnh khép được ô (bất kỳ) */
  function captureEdges(w) {
    const out = [];
    for (let b = 0; b < w.g.B; b++) {
      if (w.sides[b] !== 3) continue;
      const e = w.freeEdge(b, -1);
      if (out.indexOf(e) < 0) out.push(e);
    }
    return out;
  }
  function freeList(w) {
    const out = [];
    for (let e = 0; e < w.g.E; e++) if (!w.drawn[e]) out.push(e);
    return out;
  }

  /** Hết cạnh an toàn: nhường phần ít ô nhất (chuỗi 2 thì nhường ở giữa) */
  function leastGiveaway(w, rng) {
    let best = Infinity;
    let pool = [];
    for (const e of freeList(w)) {
      const k = giveaway(w, e);
      if (k < best) {
        best = k;
        pool = [e];
      } else if (k === best) pool.push(e);
    }
    // Cùng số ô: ưu tiên cạnh nối hai ô (nhường chuỗi 2 ở giữa thì đối thủ không double-cross được)
    const mid = pool.filter((e) => w.g.edgeBoxes[e][0] >= 0 && w.g.edgeBoxes[e][1] >= 0 && best === 2);
    return pick(mid.length ? mid : pool, rng);
  }

  function easyMove(w, rng) {
    const cap = captureEdges(w);
    return pick(cap.length ? cap : freeList(w), rng);
  }

  function mediumMove(w, rng) {
    const cap = captureEdges(w);
    if (cap.length) return pick(cap, rng);
    const safe = freeList(w).filter((e) => w.safe(e));
    if (safe.length) return pick(safe, rng);
    return leastGiveaway(w, rng);
  }

  /** Số chuỗi dài (≥ 3 ô) và vòng của thế hiện tại (ước lượng cho luật chuỗi dài) */
  function longChains(w) {
    return analyze(w).comps.filter((c) => (c.type === 'chain' && c.size >= 3) || c.type === 'loop').length;
  }

  /** Khó khi bộ giải bỏ cuộc (đầu ván bàn lớn) */
  function hardFallback(w, s, rng) {
    const cap = captureEdges(w);
    if (cap.length) {
      // Bị nhường chuỗi: còn đúng 2 ô cuối mà nơi khác còn chuỗi dài / vòng thì double-deal, không thì ăn
      for (const e of cap) {
        const b = w.g.edgeBoxes[e].find((x) => x >= 0 && w.sides[x] === 3);
        const o = w.other(e, b);
        if (o < 0 || w.sides[o] !== 2) return e; // miễn phí
        const d = w.freeEdge(o, e);
        const beyond = w.other(d, o);
        if (beyond >= 0 && w.sides[beyond] === 2) return e; // chuỗi còn dài: ăn tiếp
        // Thử ăn hết 2 ô rồi đếm chuỗi dài còn lại
        w.draw(e);
        w.draw(d);
        const longLeft = longChains(w);
        w.undraw(d);
        w.undraw(e);
        return longLeft > 0 ? d : e;
      }
    }
    const safe = freeList(w).filter((e) => w.safe(e));
    if (!safe.length) return leastGiveaway(w, rng);
    // Luật chuỗi dài, tính từ thế hiện tại: còn R cạnh, B ô, L chuỗi dài thì số lần đổi lượt còn lại
    // ≈ R - B + (L - 1) (mỗi chuỗi dài trừ chuỗi cuối sinh một double-cross). Bên đang đi giành quyền kiểm soát
    // khi số đó chẵn. Sau khi kẻ một cạnh an toàn tới lượt đối thủ: chọn cạnh làm đối thủ rơi vào số lẻ.
    // L chỉ ước lượng từ chuỗi đã thành hình nên đây là gợi ý thô; gần cuối phần an toàn bộ giải sẽ thay.
    const R = freeList(w).length - 1;
    const good = safe.filter((e) => {
      w.draw(e);
      const ok = (R - w.left() + longChains(w)) % 2 === 0;
      w.undraw(e);
      return ok;
    });
    return pick(good.length && good.length < safe.length ? good : safe, rng);
  }

  function hardMove(w, s, rng) {
    const free = w.freeCapture();
    if (free >= 0) return free;
    let safeCount = 0;
    for (let e = 0; e < w.g.E; e++) if (!w.drawn[e] && w.safe(e)) safeCount++;
    // Bộ giải: luôn thử khi hết cạnh an toàn; còn cạnh an toàn thì thử khi đã ít
    if (safeCount === 0 || safeCount <= 10) {
      const r = solve(s, { budget: BUDGET, rng });
      if (r) return r.move;
    }
    return hardFallback(w, s, rng);
  }

  /**
   * Chọn nước cho bên đang đi. opts: { level: 'easy'|'medium'|'hard', rng }
   * Tất định theo rng (mulberry32 với seed) để test được.
   */
  function chooseMove(s, opts) {
    if (s.over) return -1;
    const o = opts || {};
    const rng = o.rng || Math.random;
    const w = Work(s);
    if (o.level === 'hard') return hardMove(w, s, rng);
    if (o.level === 'medium') return mediumMove(w, rng);
    return easyMove(w, rng);
  }

  return {
    VERSION, SIZES, LEVELS,
    geometry, newGame, isLegal, legalMoves, play, completes, safeMoves, sidesOf, lastBoxes,
    toJSON, fromJSON, chooseMove, solve, mulberry32,
  };
}

(function (root) {
  const api = OVuongFactory();
  api.factory = OVuongFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
