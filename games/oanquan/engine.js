/* =====================================================================
 * Ô Ăn Quan - Engine
 * Chạy được trong trình duyệt (window.OanQuan), trong Node (module.exports)
 * và trong Web Worker (self.OanQuan). Không đụng tới DOM.
 *
 * Bàn có 12 ô xếp thành vòng, đánh số theo chiều kim đồng hồ khi nhìn màn hình:
 *
 *            1   2   3   4   5          <- hàng trên: người chơi 1 (máy / Người 2)
 *      (0)                       (6)    <- ô quan trái 0, ô quan phải 6
 *           11  10   9   8   7          <- hàng dưới: người chơi 0 (bạn / Người 1)
 *
 *   - Hướng d = +1: chiều kim đồng hồ (0 -> 1 -> ... -> 11 -> 0), d = -1: ngược lại
 *   - Nước đi mã hóa thành một số: m = ô * 2 + (d > 0 ? 1 : 0)
 *   - Luật: rải quân, rải tiếp, ăn, ăn dây, gặp ô quan / hai ô trống thì hết
 *     lượt, quan non (tùy chọn), rải quân khi hết dân (có vay), hết quan thì
 *     thu quân và tính điểm
 *   - AI: minimax cắt tỉa alpha-beta trên hiệu số điểm
 *
 * Toàn bộ engine nằm trong hàm OanQuanFactory để app.js dựng lại mã nguồn cho
 * Web Worker qua OanQuan.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function OanQuanFactory() {
  'use strict';

  const N = 12;
  const QL = 0; // ô quan trái
  const QR = 6; // ô quan phải
  const DAN_PER_SQUARE = 5;
  const TOTAL_DAN = DAN_PER_SQUARE * 10;
  const DRAW = 2; // winner = 2 khi hòa
  // Ô dân của từng người chơi, theo thứ tự từ trái sang phải trên màn hình
  const ROW_LTR = [[11, 10, 9, 8, 7], [1, 2, 3, 4, 5]];
  // Trần số lần "rải tiếp" trong một lượt: phòng vòng lặp vô tận (rất hiếm)
  const MAX_RELAYS = 120;

  // Cấu hình các mức máy
  //   depth: độ sâu tìm kiếm cố định; depthMin: độ sâu thấp nhất (chọn ngẫu nhiên)
  //   noise: nhiễu cộng vào điểm từng nước ở gốc; timeMs: trần thời gian (đào sâu dần)
  const LEVELS = {
    easy: { label: 'Dễ', depthMin: 1, depth: 2, noise: 7 },
    medium: { label: 'Vừa', depth: 4, noise: 0 },
    hard: { label: 'Khó', depth: 40, noise: 0, timeMs: 1500 },
  };

  const isQuan = (h) => h === QL || h === QR;
  const qIdx = (h) => (h === QL ? 0 : 1);
  const next = (h, d) => (h + d + N) % N;
  // Chủ của ô: 0 hàng dưới, 1 hàng trên, -1 ô quan
  const ownerOf = (h) => (h >= 7 ? 0 : h >= 1 && h <= 5 ? 1 : -1);
  const encode = (h, d) => h * 2 + (d > 0 ? 1 : 0);
  const houseOf = (m) => m >> 1;
  const dirOf = (m) => (m & 1 ? 1 : -1);

  /* ---------------- Trạng thái ván ---------------- */
  // board[12]: số dân trong từng ô (kể cả dân nằm trong ô quan)
  // quan[2]: ô quan trái / phải còn viên quan hay không (1 / 0)
  // capDan[2], capQuan[2]: số dân và số quan mỗi bên đã ăn
  // debt[2]: số dân mỗi bên đang nợ đối thủ (vay khi rải quân), trả khi hết ván
  // turn: bên đang đi (0 hàng dưới, 1 hàng trên)
  // over: hết ván; winner: -1 đang chơi, 0 / 1 bên thắng, 2 hòa
  // endReason: 'quan' (hết quan) | 'stuck' (không còn quân để rải)
  function createState(opts) {
    opts = opts || {};
    const s = {
      board: new Int16Array(N),
      quan: new Int8Array([1, 1]),
      capDan: new Int16Array(2),
      capQuan: new Int8Array(2),
      debt: new Int16Array(2),
      turn: opts.first === 1 ? 1 : 0,
      over: false,
      winner: -1,
      endReason: '',
      ply: 0,
      quanValue: opts.quanValue > 0 ? opts.quanValue | 0 : 10,
      quanNon: opts.quanNon !== false,
    };
    for (let h = 0; h < N; h++) if (!isQuan(h)) s.board[h] = DAN_PER_SQUARE;
    return s;
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      quan: s.quan.slice(),
      capDan: s.capDan.slice(),
      capQuan: s.capQuan.slice(),
      debt: s.debt.slice(),
      turn: s.turn,
      over: s.over,
      winner: s.winner,
      endReason: s.endReason,
      ply: s.ply,
      quanValue: s.quanValue,
      quanNon: s.quanNon,
    };
  }

  /* ---------------- Tiện ích ---------------- */
  // Ô có quân không (với ô quan: còn viên quan hoặc còn dân)
  function hasStones(s, h) {
    return s.board[h] > 0 || (isQuan(h) && s.quan[qIdx(h)] === 1);
  }
  function rowSum(s, p) {
    const r = ROW_LTR[p];
    return s.board[r[0]] + s.board[r[1]] + s.board[r[2]] + s.board[r[3]] + s.board[r[4]];
  }
  function quanEmpty(s) {
    return !hasStones(s, QL) && !hasStones(s, QR);
  }
  // Điểm hiện tại của bên p: dân đã ăn + quan đã ăn * giá trị quan, đã trừ / cộng nợ
  function score(s, p) {
    return s.capDan[p] + s.capQuan[p] * s.quanValue - s.debt[p] + s.debt[1 - p];
  }
  // Tổng số dân trên bàn và trong tay hai bên: luôn bằng 50 (kiểm tra bảo toàn)
  function totalDan(s) {
    let t = s.capDan[0] + s.capDan[1];
    for (let h = 0; h < N; h++) t += s.board[h];
    return t;
  }

  /* ---------------- Luật ---------------- */
  function legalMoves(s) {
    const res = [];
    if (s.over) return res;
    const r = ROW_LTR[s.turn];
    for (let i = 0; i < 5; i++) {
      if (s.board[r[i]] > 0) { res.push(r[i] * 2, r[i] * 2 + 1); }
    }
    return res;
  }

  function isLegal(s, m) {
    if (s.over || typeof m !== 'number' || m !== (m | 0) || m < 0 || m >= N * 2) return false;
    const h = houseOf(m);
    return ownerOf(h) === s.turn && s.board[h] > 0;
  }

  // Đi nước m cho bên đang đi, sửa trực tiếp s. ev (mảng, tùy chọn) nhận diễn biến
  // để giao diện vẽ lại từng bước:
  //   { t: 'pick', h, n }                 bốc n quân ở ô h
  //   { t: 'drop', h }                    thả một quân vào ô h
  //   { t: 'capture', h, dan, quan, p }   bên p ăn ô h (dan dân, quan 0/1)
  //   { t: 'stop', why, h }               hết lượt: 'quan' | 'empty2' | 'quannon' | 'done' | 'loop'
  //   { t: 'scatter', p, own, borrow, houses }  bên p hết dân, rải lại quân
  //   { t: 'collect', p, h, n }           hết ván, bên p thu n dân ở ô h
  //   { t: 'over', reason, winner }
  function play(s, m, ev) {
    const p = s.turn;
    let h = houseOf(m);
    const d = dirOf(m);
    let relays = 0;
    for (;;) {
      let n = s.board[h];
      s.board[h] = 0;
      if (ev) ev.push({ t: 'pick', h, n });
      let pos = h;
      while (n > 0) {
        pos = next(pos, d);
        s.board[pos]++;
        n--;
        if (ev) ev.push({ t: 'drop', h: pos });
      }
      const h1 = next(pos, d);
      // Gặp ô quan (dù còn hay hết quân): hết lượt, không bao giờ bốc ô quan để rải
      if (isQuan(h1)) { if (ev) ev.push({ t: 'stop', why: 'quan', h: h1 }); break; }
      // Ô dân kế tiếp còn quân: bốc lên rải tiếp
      if (s.board[h1] > 0) {
        if (++relays > MAX_RELAYS) { if (ev) ev.push({ t: 'stop', why: 'loop', h: h1 }); break; }
        h = h1;
        continue;
      }
      // Ô kế tiếp trống: xét ô sau đó, ăn được thì ăn tiếp theo dây
      let gap = h1;
      let ate = false;
      for (;;) {
        const tg = next(gap, d);
        if (!hasStones(s, tg)) { if (ev) ev.push({ t: 'stop', why: ate ? 'done' : 'empty2', h: tg }); break; }
        if (isQuan(tg) && s.quanNon && s.quan[qIdx(tg)] === 1 && s.board[tg] < DAN_PER_SQUARE) {
          if (ev) ev.push({ t: 'stop', why: 'quannon', h: tg });
          break;
        }
        const dan = s.board[tg];
        let q = 0;
        if (isQuan(tg) && s.quan[qIdx(tg)] === 1) { q = 1; s.quan[qIdx(tg)] = 0; s.capQuan[p]++; }
        s.board[tg] = 0;
        s.capDan[p] += dan;
        ate = true;
        if (ev) ev.push({ t: 'capture', h: tg, dan, quan: q, p });
        gap = next(tg, d);
        // Ăn dây chỉ tiếp tục khi ô kế là ô dân trống (ô quan không dùng làm ô trống)
        if (isQuan(gap) || s.board[gap] > 0) { if (ev) ev.push({ t: 'stop', why: 'done', h: gap }); break; }
      }
      break;
    }
    s.ply++;
    s.turn = 1 - p;
    if (quanEmpty(s)) finish(s, 'quan', ev);
    else beginTurn(s, ev);
    return s;
  }

  // Đầu lượt: bên sắp đi hết dân trên hàng thì rải lại 5 dân đã ăn (thiếu thì vay)
  function beginTurn(s, ev) {
    if (s.over) return;
    const q = s.turn;
    if (rowSum(s, q) > 0) return;
    const o = 1 - q;
    const own = Math.min(DAN_PER_SQUARE, s.capDan[q]);
    const borrow = Math.min(DAN_PER_SQUARE - own, s.capDan[o]);
    if (own + borrow === 0) { finish(s, 'stuck', ev); return; }
    s.capDan[q] -= own;
    s.capDan[o] -= borrow;
    s.debt[q] += borrow;
    const k = Math.min(s.debt[0], s.debt[1]); // nợ qua lại thì trừ bù cho nhau
    s.debt[0] -= k;
    s.debt[1] -= k;
    const houses = ROW_LTR[q].slice(0, own + borrow);
    for (const h of houses) s.board[h]++;
    if (ev) ev.push({ t: 'scatter', p: q, own, borrow, houses });
  }

  // Hết ván: mỗi bên thu dân còn trên hàng của mình, nợ được trừ vào điểm
  function finish(s, reason, ev) {
    for (let p = 0; p < 2; p++) {
      for (const h of ROW_LTR[p]) {
        const n = s.board[h];
        if (!n) continue;
        s.capDan[p] += n;
        s.board[h] = 0;
        if (ev) ev.push({ t: 'collect', p, h, n });
      }
    }
    s.over = true;
    s.endReason = reason;
    const a = score(s, 0), b = score(s, 1);
    s.winner = a > b ? 0 : b > a ? 1 : DRAW;
    if (ev) ev.push({ t: 'over', reason, winner: s.winner });
  }

  // Đi nước m trên bản sao, ném lỗi nếu nước không hợp lệ
  function applyMove(s, m, ev) {
    if (!isLegal(s, m)) throw new Error('Nước đi không hợp lệ: ' + m);
    return play(cloneState(s), m, ev);
  }

  // Dựng lại ván từ danh sách nước (khôi phục ván đã lưu, Đi lại, Worker)
  function fromMoves(moves, opts) {
    const s = createState(opts);
    for (let i = 0; i < moves.length; i++) {
      if (!isLegal(s, moves[i])) throw new Error('Nước thứ ' + (i + 1) + ' không hợp lệ: ' + moves[i]);
      play(s, moves[i]);
    }
    return s;
  }

  /* ---------------- Số ngẫu nhiên ---------------- */
  // mulberry32: PRNG có seed để test chạy lặp lại được
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

  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  /* ---------------- AI: minimax + alpha-beta ---------------- */
  const WIN_BONUS = 1000;
  const ROW_WEIGHT = 0.3; // dân còn trên hàng mình: cuối ván sẽ thu, nhưng có thể bị ăn

  // Điểm của thế cờ theo góc nhìn bên p
  function evaluate(s, p) {
    const diff = score(s, p) - score(s, 1 - p);
    if (s.over) return diff + (diff > 0 ? WIN_BONUS : diff < 0 ? -WIN_BONUS : 0);
    return diff + ROW_WEIGHT * (rowSum(s, p) - rowSum(s, 1 - p));
  }

  function Aborted() {}

  // Tìm kiếm negamax. ctx: { deadline, maxNodes, nodes, cutoff }
  function negamax(s, depth, alpha, beta, ctx) {
    ctx.nodes++;
    if ((ctx.nodes & 255) === 0 && (now() >= ctx.deadline || ctx.nodes >= ctx.maxNodes)) throw new Aborted();
    if (s.over) return evaluate(s, s.turn);
    if (depth === 0) { ctx.cutoff = true; return evaluate(s, s.turn); }
    const moves = legalMoves(s);
    const kids = [];
    for (let i = 0; i < moves.length; i++) {
      const c = play(cloneState(s), moves[i]);
      kids.push({ c, k: -evaluate(c, c.turn) }); // sắp thứ tự: nước tốt trước để cắt tỉa nhiều hơn
    }
    kids.sort((a, b) => b.k - a.k);
    let best = -Infinity;
    for (let i = 0; i < kids.length; i++) {
      const v = -negamax(kids[i].c, depth - 1, -beta, -alpha, ctx);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Tìm ở gốc với độ sâu cho trước, trả về điểm từng nước (theo thứ tự order).
  // exact: tính đúng điểm mọi nước (cần khi cộng nhiễu); không thì nước kém hơn
  // nước tốt nhất chỉ cần biết là "không hơn" (cắt tỉa nhiều hơn).
  function searchRoot(s, order, depth, ctx, exact) {
    const vals = [];
    let alpha = -Infinity;
    for (let i = 0; i < order.length; i++) {
      const c = play(cloneState(s), order[i]);
      const v = -negamax(c, depth - 1, -Infinity, exact ? Infinity : -alpha, ctx);
      vals.push(v);
      if (v > alpha) alpha = v;
    }
    return vals;
  }

  // Chọn nước cho bên đang đi.
  // opts: { level, depth, timeMs, noise, seed, rng }
  // Trả về { move, depth, nodes, value, timeMs, reason }
  function chooseMove(s, opts) {
    opts = opts || {};
    const t0 = now();
    const lv = LEVELS[opts.level] || LEVELS.medium;
    const rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const done = (move, reason, extra) => Object.assign({ move, reason, depth: 0, nodes: 0, value: null, timeMs: Math.round(now() - t0) }, extra || {});
    if (s.over) return done(-1, 'over');
    const moves = legalMoves(s);
    if (moves.length === 1) return done(moves[0], 'only');

    const noise = opts.noise != null ? opts.noise : lv.noise;
    const timeMs = opts.timeMs != null ? opts.timeMs : lv.timeMs;
    let maxDepth = opts.depth != null ? opts.depth : lv.depth;
    if (opts.depth == null && lv.depthMin) maxDepth = lv.depthMin + Math.floor(rng() * (lv.depth - lv.depthMin + 1));
    // Có trần thời gian: đào sâu dần. Không có: tìm thẳng ở độ sâu cố định
    const timed = timeMs != null;
    const ctx = {
      deadline: timed ? t0 + timeMs : Infinity,
      // Trần số nút: phòng khi đồng hồ không chạy (môi trường giả lập thời gian)
      maxNodes: timed ? Math.max(20000, timeMs * 1000) : Infinity,
      nodes: 0,
      cutoff: false,
    };

    // Thứ tự ban đầu: theo đánh giá tĩnh sau một nước
    let order = moves.map((m) => ({ m, k: -evaluate(play(cloneState(s), m), 1 - s.turn) }))
      .sort((a, b) => b.k - a.k).map((x) => x.m);
    let bestVals = null;
    let reached = 0;
    for (let depth = timed ? 1 : maxDepth; depth <= maxDepth; depth++) {
      ctx.cutoff = false;
      let vals;
      try { vals = searchRoot(s, order, depth, ctx, noise > 0); } catch (e) {
        if (e instanceof Aborted) break;
        throw e;
      }
      bestVals = order.map((m, i) => ({ m, v: vals[i] }));
      reached = depth;
      // Đưa nước tốt nhất lên đầu cho lần đào sâu sau
      const sorted = bestVals.slice().sort((a, b) => b.v - a.v);
      order = sorted.map((x) => x.m);
      if (!ctx.cutoff) break; // mọi nhánh đã tới hết ván: không cần đào sâu thêm
      if (timed && now() - t0 > timeMs * 0.55) break; // lần sau gần chắc chắn không kịp
    }
    if (!bestVals) { // hết giờ ngay từ độ sâu 1: dùng đánh giá tĩnh
      return done(order[0], 'static', { nodes: ctx.nodes });
    }
    // Chọn nước có điểm cao nhất (cộng nhiễu ở mức Dễ)
    let best = null, bestScore = -Infinity;
    for (const x of bestVals) {
      const sc = x.v + (noise > 0 ? rng() * noise : 0);
      if (sc > bestScore) { bestScore = sc; best = x; }
    }
    return done(best.m, 'search', { depth: reached, nodes: ctx.nodes, value: best.v });
  }

  return {
    N, QL, QR, DRAW, TOTAL_DAN, DAN_PER_SQUARE, ROW_LTR, LEVELS, MAX_RELAYS,
    isQuan, ownerOf, next, encode, houseOf, dirOf,
    createState, cloneState, hasStones, rowSum, quanEmpty, score, totalDan,
    legalMoves, isLegal, play, beginTurn, finish, applyMove, fromMoves,
    evaluate, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = OanQuanFactory();
  api.factory = OanQuanFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OanQuan = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
