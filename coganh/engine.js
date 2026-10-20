/* =====================================================================
 * Cờ Gánh - Engine
 * Chạy được trong trình duyệt (window.CoGanh), trong Node (module.exports)
 * và trong Web Worker (self.CoGanh). Không đụng tới DOM.
 *
 * Bàn 5 x 5 giao điểm, đánh số i = hàng * 5 + cột (hàng 0 ở trên cùng):
 *
 *      0 — 1 — 2 — 3 — 4        <- hàng 0: quân người chơi 1 (máy / Người 2)
 *      | \ | / | \ | / |
 *      5 — 6 — 7 — 8 — 9
 *      | / | \ | / | \ |
 *     10 —11 —12 —13 —14
 *      | \ | / | \ | / |
 *     15 —16 —17 —18 —19
 *      | / | \ | / | \ |
 *     20 —21 —22 —23 —24        <- hàng 4: quân người chơi 0 (bạn / Người 1)
 *
 *   - Đường chéo chỉ đi qua các điểm có (hàng + cột) chẵn (kiểu bàn Alquerque)
 *   - Ô bàn: 0 trống, 1 quân của người chơi 0, 2 quân của người chơi 1
 *   - Nước đi mã hóa thành một số: m = từ * 25 + đến
 *   - Luật: đi một bước theo đường kẻ, gánh (đổi màu hai quân kẹp hai bên),
 *     vây (nhóm quân địch hết đường thoát thì đổi màu), Luật Mở (tùy chọn),
 *     hết quân / hết nước thì thua, lặp thế 3 lần hoặc 60 nước không ăn thì hòa
 *   - AI: minimax cắt tỉa alpha-beta, đánh giá theo số quân + độ cơ động + an toàn
 *
 * Toàn bộ engine nằm trong hàm CoGanhFactory để app.js dựng lại mã nguồn cho
 * Web Worker qua CoGanh.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function CoGanhFactory() {
  'use strict';

  const SIZE = 5;
  const N = SIZE * SIZE;
  const PIECES = 8; // số quân mỗi bên đầu ván
  const DRAW = 2; // winner = 2 khi hòa
  const QUIET_LIMIT = 60; // số nước liên tiếp không ăn quân thì hòa
  const REPEAT_LIMIT = 3; // một thế cờ (cùng bên đi) lặp lại chừng này lần thì hòa
  // Vị trí quân đầu ván: người chơi 0 ở dưới, người chơi 1 ở trên
  const START = [
    [20, 21, 22, 23, 24, 15, 19, 14], // hàng 4, (3,0), (3,4), (2,4)
    [0, 1, 2, 3, 4, 5, 9, 10], // hàng 0, (1,0), (1,4), (2,0)
  ];

  // Cấu hình các mức máy
  //   depth: độ sâu tìm kiếm cố định; depthMin: độ sâu thấp nhất (chọn ngẫu nhiên)
  //   noise: nhiễu cộng vào điểm từng nước ở gốc (100 = một quân); timeMs: trần thời gian (đào sâu dần)
  const LEVELS = {
    easy: { label: 'Dễ', depthMin: 1, depth: 2, noise: 240 },
    medium: { label: 'Vừa', depth: 4, noise: 0 },
    hard: { label: 'Khó', depth: 40, noise: 0, timeMs: 1500 },
  };

  const rowOf = (i) => (i / SIZE) | 0;
  const colOf = (i) => i % SIZE;
  const idx = (r, c) => r * SIZE + c;
  const hasDiag = (i) => ((rowOf(i) + colOf(i)) & 1) === 0;
  const encode = (from, to) => from * N + to;
  const fromOf = (m) => (m / N) | 0;
  const toOf = (m) => m % N;
  // Tọa độ hiển thị: cột a–e từ trái sang phải, hàng 1–5 từ dưới lên
  const coord = (i) => 'abcde'[colOf(i)] + (SIZE - rowOf(i));

  /* ---------------- Đường kẻ trên bàn ---------------- */
  // ADJ[i]: các điểm kề i theo đường kẻ. LINES[i]: các cặp [a, b] nằm hai phía của i
  // trên cùng một đường thẳng (dùng để xét gánh).
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const ADJ = [];
  const LINES = [];
  for (let i = 0; i < N; i++) {
    const r = rowOf(i), c = colOf(i);
    const adj = [], lines = [];
    for (let k = 0; k < DIRS.length; k++) {
      if (k >= 2 && !hasDiag(i)) continue; // điểm lẻ không có đường chéo
      const [dr, dc] = DIRS[k];
      const inside = (rr, cc) => rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE;
      const a = inside(r - dr, c - dc) ? idx(r - dr, c - dc) : -1;
      const b = inside(r + dr, c + dc) ? idx(r + dr, c + dc) : -1;
      if (a >= 0) adj.push(a);
      if (b >= 0) adj.push(b);
      if (a >= 0 && b >= 0) lines.push([a, b]);
    }
    ADJ.push(adj);
    LINES.push(lines);
  }

  /* ---------------- Trạng thái ván ---------------- */
  // board[25]: 0 trống, 1 quân bên 0, 2 quân bên 1
  // count[2]: số quân mỗi bên; turn: bên đang đi (0 dưới, 1 trên)
  // over / winner: -1 đang chơi, 0 / 1 bên thắng, 2 hòa
  // endReason: 'wipe' (hết quân) | 'stuck' (hết nước) | 'repeat' (lặp thế) | 'quiet' (60 nước không ăn)
  // quiet: số nước liên tiếp không ăn quân; lastFrom: điểm nước trước vừa bỏ trống (Luật Mở)
  // openRule: bật Luật Mở; rep: số lần xuất hiện của từng thế cờ (null trong lúc AI tìm kiếm)
  function createState(opts) {
    opts = opts || {};
    const s = {
      board: new Int8Array(N),
      count: new Int8Array([PIECES, PIECES]),
      turn: opts.first === 1 ? 1 : 0,
      over: false,
      winner: -1,
      endReason: '',
      ply: 0,
      quiet: 0,
      lastFrom: -1,
      openRule: opts.openRule === true,
      rep: new Map(),
    };
    for (let p = 0; p < 2; p++) for (const i of START[p]) s.board[i] = p + 1;
    s.rep.set(posKey(s), 1);
    return s;
  }

  // light = true: bỏ bảng lặp thế (bản sao dùng trong tìm kiếm)
  function cloneState(s, light) {
    return {
      board: s.board.slice(),
      count: s.count.slice(),
      turn: s.turn,
      over: s.over,
      winner: s.winner,
      endReason: s.endReason,
      ply: s.ply,
      quiet: s.quiet,
      lastFrom: s.lastFrom,
      openRule: s.openRule,
      rep: light || !s.rep ? null : new Map(s.rep),
    };
  }

  // Khóa số của thế cờ (bàn + bên đi), chính xác tuyệt đối: 2 bit / điểm, < 2^51
  function posKey(s) {
    const b = s.board;
    let lo = 0, hi = 0;
    for (let i = 14; i >= 0; i--) lo = lo * 4 + b[i];
    for (let i = 24; i >= 15; i--) hi = hi * 4 + b[i];
    return (hi * 1073741824 + lo) * 2 + s.turn;
  }

  /* ---------------- Luật ---------------- */
  // Các điểm sẽ bị gánh nếu bên p đi một quân vào điểm `to` (trống)
  function ganhTargets(s, to, p) {
    const foe = 2 - p; // giá trị ô của quân đối thủ
    const b = s.board;
    const out = [];
    const L = LINES[to];
    for (let k = 0; k < L.length; k++) {
      if (b[L[k][0]] === foe && b[L[k][1]] === foe) out.push(L[k][0], L[k][1]);
    }
    return out;
  }

  // Mọi nước đi một bước của bên đang đi (chưa xét Luật Mở)
  function allMoves(s) {
    const res = [];
    const me = s.turn + 1;
    const b = s.board;
    for (let i = 0; i < N; i++) {
      if (b[i] !== me) continue;
      const A = ADJ[i];
      for (let k = 0; k < A.length; k++) if (b[A[k]] === 0) res.push(i * N + A[k]);
    }
    return res;
  }

  // Luật Mở: nước trước vừa bỏ trống điểm P, bên đang đi có nước vào P mà gánh được
  // thì bắt buộc chọn một trong các nước đó. Trả về [] nếu không bị bắt.
  function forcedMoves(s) {
    if (!s.openRule || s.over || s.lastFrom < 0) return [];
    const P = s.lastFrom;
    const me = s.turn + 1;
    if (s.board[P] !== 0 || ganhTargets(s, P, s.turn).length === 0) return [];
    const res = [];
    for (const q of ADJ[P]) if (s.board[q] === me) res.push(q * N + P);
    return res;
  }

  function legalMoves(s) {
    if (s.over) return [];
    const forced = forcedMoves(s);
    return forced.length ? forced : allMoves(s);
  }

  function isLegal(s, m) {
    if (s.over || typeof m !== 'number' || m !== (m | 0) || m < 0 || m >= N * N) return false;
    return legalMoves(s).includes(m);
  }

  // Đi nước m cho bên đang đi, sửa trực tiếp s. ev (mảng, tùy chọn) nhận diễn biến
  // để giao diện vẽ lại từng bước:
  //   { t: 'move', from, to, p, forced }   quân của bên p đi từ from tới to
  //   { t: 'ganh', pts: [a, b], p }         hai quân a, b bị gánh, đổi sang màu bên p
  //   { t: 'vay', pts: [...], p }            một nhóm quân bị vây, đổi sang màu bên p
  //   { t: 'over', reason, winner }
  function play(s, m, ev) {
    const p = s.turn;
    const me = p + 1;
    const foe = 2 - p;
    const from = fromOf(m), to = toOf(m);
    const b = s.board;
    const forced = s.openRule && s.lastFrom === to && forcedMoves(s).length > 0;
    b[from] = 0;
    b[to] = me;
    if (ev) ev.push({ t: 'move', from, to, p, forced });
    let taken = 0;

    // Gánh: chỉ quân vừa đi mới gánh, xét mọi đường thẳng qua điểm đến
    const g = ganhTargets(s, to, p);
    for (let k = 0; k < g.length; k += 2) {
      b[g[k]] = me;
      b[g[k + 1]] = me;
      if (ev) ev.push({ t: 'ganh', pts: [g[k], g[k + 1]], p });
    }
    taken += g.length;

    // Vây: mọi nhóm quân đối thủ không còn điểm trống kề bên thì đổi màu
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (b[i] !== foe || seen[i]) continue;
      const group = [i];
      seen[i] = 1;
      let free = false;
      for (let k = 0; k < group.length; k++) {
        const A = ADJ[group[k]];
        for (let j = 0; j < A.length; j++) {
          const q = A[j];
          if (b[q] === 0) free = true;
          else if (b[q] === foe && !seen[q]) { seen[q] = 1; group.push(q); }
        }
      }
      if (free) continue;
      for (const q of group) b[q] = me;
      taken += group.length;
      if (ev) ev.push({ t: 'vay', pts: group, p });
    }

    s.count[p] += taken;
    s.count[1 - p] -= taken;
    s.quiet = taken ? 0 : s.quiet + 1;
    s.lastFrom = from;
    s.ply++;
    s.turn = 1 - p;
    if (s.rep) {
      const key = posKey(s);
      s.rep.set(key, (s.rep.get(key) || 0) + 1);
    }
    resolveEnd(s, ev);
    return s;
  }

  // Xét hết ván cho bên sắp đi (thứ tự ưu tiên: hết quân, hết nước, lặp thế, 60 nước không ăn)
  function resolveEnd(s, ev) {
    if (s.over) return s;
    const q = s.turn;
    let reason = '', winner = -1;
    if (s.count[q] === 0) { reason = 'wipe'; winner = 1 - q; }
    else if (allMoves(s).length === 0) { reason = 'stuck'; winner = 1 - q; }
    else if (s.rep && (s.rep.get(posKey(s)) || 0) >= REPEAT_LIMIT) { reason = 'repeat'; winner = DRAW; }
    else if (s.quiet >= QUIET_LIMIT) { reason = 'quiet'; winner = DRAW; }
    if (!reason) return s;
    s.over = true;
    s.winner = winner;
    s.endReason = reason;
    if (ev) ev.push({ t: 'over', reason, winner });
    return s;
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
  const WIN = 100000;
  const PIECE_W = 100; // một quân
  const MOB_W = 4; // mỗi nước đi được
  const THREAT_NOW = 70; // mỗi quân bên sắp đi gánh được ngay
  const THREAT_LATER = 22; // mỗi quân bên kia đang dọa gánh (bên sắp đi còn kịp đỡ)
  const POS_W = 3; // mỗi đường kẻ đi qua điểm quân đang đứng (điểm nhiều đường mạnh hơn)
  const CONTEMPT = 35; // máy coi hòa là hơi thiệt để chủ động tìm nước ăn thay vì đi lòng vòng

  // Điểm của thế cờ theo góc nhìn bên p: hiệu số quân là chính, cộng độ cơ động
  // và độ an toàn (quân đang bị dọa gánh)
  function evaluate(s, p) {
    if (s.over) return s.winner === p ? WIN : s.winner === DRAW ? 0 : -WIN;
    const b = s.board;
    const mob = [0, 0];
    const pos = [0, 0];
    const gain = [0, 0]; // số quân gánh được nhiều nhất trong một nước của mỗi bên
    for (let P = 0; P < N; P++) {
      if (b[P] !== 0) { pos[b[P] - 1] += ADJ[P].length; continue; }
      const A = ADJ[P];
      let near0 = false, near1 = false;
      for (let k = 0; k < A.length; k++) {
        const v = b[A[k]];
        if (v === 1) { mob[0]++; near0 = true; } else if (v === 2) { mob[1]++; near1 = true; }
      }
      if (!near0 && !near1) continue;
      const L = LINES[P];
      let g0 = 0, g1 = 0;
      for (let k = 0; k < L.length; k++) {
        const x = b[L[k][0]], y = b[L[k][1]];
        if (x === y) { if (x === 2) g0 += 2; else if (x === 1) g1 += 2; }
      }
      if (near0 && g0 > gain[0]) gain[0] = g0;
      if (near1 && g1 > gain[1]) gain[1] = g1;
    }
    const o = 1 - p;
    const stm = s.turn;
    const threat = THREAT_NOW * gain[stm] - THREAT_LATER * gain[1 - stm];
    // Lợi thế thế cờ nhạt dần khi sắp tới mốc 60 nước không ăn (hòa): máy phải sớm biến nó thành quân
    const edge = (MOB_W * (mob[p] - mob[o]) + POS_W * (pos[p] - pos[o]) + (stm === p ? threat : -threat)) * (QUIET_LIMIT - s.quiet) / QUIET_LIMIT;
    return PIECE_W * (s.count[p] - s.count[o]) + edge;
  }

  function Aborted() {}

  // Điểm của thế hòa theo góc nhìn bên sắp đi: máy (ctx.side) coi hòa là hơi thiệt
  const drawValue = (s, ctx) => (s.turn === ctx.side ? -CONTEMPT : CONTEMPT);

  // Tìm kiếm negamax. ctx: { deadline, maxNodes, nodes, cutoff, rootPly, side, rep, path }
  function negamax(s, depth, alpha, beta, ctx) {
    ctx.nodes++;
    if ((ctx.nodes & 255) === 0 && (now() >= ctx.deadline || ctx.nodes >= ctx.maxNodes)) throw new Aborted();
    if (s.over) {
      if (s.winner === DRAW) return drawValue(s, ctx);
      const v = evaluate(s, s.turn);
      return v > 0 ? v - (s.ply - ctx.rootPly) : v + (s.ply - ctx.rootPly); // thắng nhanh / thua chậm
    }
    // Thế cờ đã gặp trong ván hoặc trên nhánh đang tính: coi như hòa
    const key = posKey(s);
    if (ctx.path.includes(key) || (ctx.rep && ctx.rep.has(key))) return drawValue(s, ctx);
    if (depth === 0) { ctx.cutoff = true; return evaluate(s, s.turn); }
    const moves = legalMoves(s);
    const kids = [];
    for (let i = 0; i < moves.length; i++) {
      const c = play(cloneState(s, true), moves[i]);
      kids.push({ c, k: -evaluate(c, c.turn) }); // sắp thứ tự: nước tốt trước để cắt tỉa nhiều hơn
    }
    kids.sort((a, b) => b.k - a.k);
    ctx.path.push(key);
    let best = -Infinity;
    for (let i = 0; i < kids.length; i++) {
      const v = -negamax(kids[i].c, depth - 1, -beta, -alpha, ctx);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    ctx.path.pop();
    return best;
  }

  // Tìm ở gốc với độ sâu cho trước, trả về điểm từng nước (theo thứ tự order).
  // exact: tính đúng điểm mọi nước (cần khi cộng nhiễu); không thì nước kém hơn
  // nước tốt nhất chỉ cần biết là "không hơn" (cắt tỉa nhiều hơn).
  function searchRoot(s, order, depth, ctx, exact) {
    const vals = [];
    let alpha = -Infinity;
    ctx.path.length = 0;
    for (let i = 0; i < order.length; i++) {
      const c = play(cloneState(s, true), order[i]);
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
    if (moves.length === 0) return done(-1, 'none');
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
      maxNodes: timed ? Math.max(20000, timeMs * 400) : Infinity,
      nodes: 0,
      cutoff: false,
      rootPly: s.ply,
      side: s.turn,
      rep: s.rep,
      path: [],
    };

    // Thứ tự ban đầu: theo đánh giá tĩnh sau một nước
    let order = moves.map((m) => ({ m, k: -evaluate(play(cloneState(s, true), m), 1 - s.turn) }))
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
      if (sorted[0].v >= WIN - 1000) break; // đã thấy đường thắng chắc
      if (timed && now() - t0 > timeMs * 0.45) break; // lần sau gần chắc chắn không kịp
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
    SIZE, N, PIECES, DRAW, QUIET_LIMIT, REPEAT_LIMIT, START, LEVELS, ADJ, LINES,
    rowOf, colOf, idx, hasDiag, encode, fromOf, toOf, coord,
    createState, cloneState, posKey, ganhTargets, allMoves, forcedMoves, legalMoves, isLegal,
    play, resolveEnd, applyMove, fromMoves,
    evaluate, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = CoGanhFactory();
  api.factory = CoGanhFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CoGanh = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
