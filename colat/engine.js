/* =====================================================================
 * Cờ Lật - Engine
 * Chạy được trong trình duyệt (window.CoLat), trong Node (module.exports)
 * và trong Web Worker (self.CoLat). Không đụng tới DOM.
 *
 * Bàn 8 x 8, ô đánh số 0..63 theo hàng: sq = hàng * 8 + cột.
 *   - Cột a..h từ trái sang phải, hàng 1..8 từ trên xuống (hàng 1 ở trên cùng)
 *   - Quân trên bàn: -1 trống, 0 Đen, 1 Trắng (trùng số thứ tự người chơi)
 *   - Đầu ván: d4, e5 Trắng; e4, d5 Đen. Đen đi trước.
 *   - Luật: đặt quân phải kẹp được ít nhất một hàng quân đối thủ (8 hướng),
 *     lật hết mọi hàng bị kẹp; không có nước thì mất lượt; cả hai bên không
 *     đi được thì hết ván, nhiều quân hơn thắng, bằng nhau là hòa
 *   - Nước đi là số ô (0..63). Mất lượt xảy ra tự động trong play(), không
 *     cần ghi vào danh sách nước nên ván lưu chỉ là mảng số ô
 *   - AI: negamax cắt tỉa alpha-beta, đánh giá theo bảng trọng số vị trí +
 *     độ cơ động + quân ổn định ở góc / cạnh; cuối ván (ít ô trống) giải đúng
 *
 * Toàn bộ engine nằm trong hàm CoLatFactory để app.js dựng lại mã nguồn cho
 * Web Worker qua CoLat.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function CoLatFactory() {
  'use strict';

  const N = 8;
  const SIZE = 64;
  const EMPTY = -1;
  const BLACK = 0;
  const WHITE = 1;
  const DRAW = 2; // winner = 2 khi hòa
  const COLS = 'abcdefgh';
  const COLOR_NAME = ['Đen', 'Trắng'];

  // Cấu hình các mức máy
  //   depth: độ sâu tìm kiếm cố định; depthMin: độ sâu thấp nhất (chọn ngẫu nhiên)
  //   noise: nhiễu cộng vào điểm từng nước ở gốc; timeMs: trần thời gian (đào sâu dần)
  //   exact: còn từ chừng này ô trống trở xuống thì giải đúng tới hết ván
  const LEVELS = {
    easy: { label: 'Dễ', depthMin: 1, depth: 2, noise: 90 },
    medium: { label: 'Vừa', depth: 4, noise: 0 },
    hard: { label: 'Khó', depth: 60, noise: 0, timeMs: 1500, exact: 14 },
  };

  const rowOf = (sq) => sq >> 3;
  const colOf = (sq) => sq & 7;
  const sqOf = (r, c) => r * N + c;
  // Tên ô theo ký hiệu quen dùng: cột a..h + hàng 1..8, ví dụ "d3"
  const sqName = (sq) => COLS[colOf(sq)] + (rowOf(sq) + 1);
  function parseSq(name) {
    const m = /^([a-h])([1-8])$/.exec(String(name).trim().toLowerCase());
    return m ? sqOf(+m[2] - 1, COLS.indexOf(m[1])) : -1;
  }

  // RAYS[sq]: các tia từ ô sq theo 8 hướng (bỏ tia ngắn hơn 2 ô vì không kẹp được gì)
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const RAYS = [];
  for (let sq = 0; sq < SIZE; sq++) {
    const rays = [];
    for (const [dr, dc] of DIRS) {
      const ray = [];
      let r = rowOf(sq) + dr, c = colOf(sq) + dc;
      while (r >= 0 && r < N && c >= 0 && c < N) { ray.push(sqOf(r, c)); r += dr; c += dc; }
      if (ray.length >= 2) rays.push(ray);
    }
    RAYS.push(rays);
  }

  /* ---------------- Trạng thái ván ---------------- */
  // board[64]: -1 trống, 0 Đen, 1 Trắng
  // discs[2]: số quân của từng bên (giữ đồng bộ với board)
  // turn: bên đang đi; passes: số lần mất lượt trong ván; last: ô vừa đặt (-1 nếu chưa)
  // over: hết ván; winner: -1 đang chơi, 0 / 1 bên thắng, 2 hòa
  function createState() {
    const s = {
      board: new Int8Array(SIZE).fill(EMPTY),
      discs: new Int16Array([2, 2]),
      turn: BLACK,
      over: false,
      winner: -1,
      ply: 0,
      passes: 0,
      last: -1,
    };
    s.board[sqOf(3, 3)] = WHITE; // d4
    s.board[sqOf(3, 4)] = BLACK; // e4
    s.board[sqOf(4, 3)] = BLACK; // d5
    s.board[sqOf(4, 4)] = WHITE; // e5
    return s;
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      discs: s.discs.slice(),
      turn: s.turn,
      over: s.over,
      winner: s.winner,
      ply: s.ply,
      passes: s.passes,
      last: s.last,
    };
  }

  // Đếm lại số quân từ board (dùng khi dựng thế cờ tùy ý trong test)
  function recount(s) {
    s.discs[0] = 0;
    s.discs[1] = 0;
    for (let i = 0; i < SIZE; i++) if (s.board[i] !== EMPTY) s.discs[s.board[i]]++;
    return s;
  }

  /* ---------------- Luật (làm việc trực tiếp trên mảng board) ---------------- */
  // Số quân bị lật nếu bên p đặt ở ô sq; out (tùy chọn) nhận danh sách ô bị lật
  function flipsAt(b, sq, p, out) {
    if (b[sq] !== EMPTY) return 0;
    const o = 1 - p;
    const rays = RAYS[sq];
    let total = 0;
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i];
      let k = 0;
      while (k < ray.length && b[ray[k]] === o) k++;
      if (k > 0 && k < ray.length && b[ray[k]] === p) {
        if (out) for (let j = 0; j < k; j++) out.push(ray[j]);
        total += k;
      }
    }
    return total;
  }

  // Bên p đặt được ở ô sq không (dừng ngay khi thấy một hàng kẹp được)
  function canPlayAt(b, sq, p) {
    if (b[sq] !== EMPTY) return false;
    const o = 1 - p;
    const rays = RAYS[sq];
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i];
      if (b[ray[0]] !== o) continue;
      let k = 1;
      while (k < ray.length && b[ray[k]] === o) k++;
      if (k < ray.length && b[ray[k]] === p) return true;
    }
    return false;
  }

  function hasMove(b, p) {
    for (let sq = 0; sq < SIZE; sq++) if (canPlayAt(b, sq, p)) return true;
    return false;
  }
  function countMoves(b, p) {
    let n = 0;
    for (let sq = 0; sq < SIZE; sq++) if (canPlayAt(b, sq, p)) n++;
    return n;
  }

  function legalMoves(s) {
    const res = [];
    if (s.over) return res;
    for (let sq = 0; sq < SIZE; sq++) if (canPlayAt(s.board, sq, s.turn)) res.push(sq);
    return res;
  }

  function isLegal(s, m) {
    if (s.over || typeof m !== 'number' || m !== (m | 0) || m < 0 || m >= SIZE) return false;
    return canPlayAt(s.board, m, s.turn);
  }

  // Các ô bị lật nếu bên đang đi đặt ở ô m (rỗng nếu không hợp lệ)
  function flipsOf(s, m) {
    const out = [];
    if (!s.over) flipsAt(s.board, m, s.turn, out);
    return out;
  }

  // Khoảng cách theo số bước vua từ a tới b: dùng để lật lan dần từ ô vừa đặt
  const dist = (a, b) => Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));

  // Đi nước m cho bên đang đi, sửa trực tiếp s. ev (mảng, tùy chọn) nhận diễn biến
  // để giao diện vẽ lại từng bước:
  //   { t: 'place', sq, p }            bên p đặt quân ở ô sq
  //   { t: 'flip', sqs, p }            các ô bị lật sang màu p (gần ô vừa đặt trước)
  //   { t: 'pass', p }                 bên p không có nước, mất lượt
  //   { t: 'over', winner, discs }     hết ván
  function play(s, m, ev) {
    const p = s.turn;
    const b = s.board;
    const fl = [];
    flipsAt(b, m, p, fl);
    b[m] = p;
    for (let i = 0; i < fl.length; i++) b[fl[i]] = p;
    s.discs[p] += 1 + fl.length;
    s.discs[1 - p] -= fl.length;
    s.ply++;
    s.last = m;
    if (ev) {
      ev.push({ t: 'place', sq: m, p });
      ev.push({ t: 'flip', p, sqs: fl.slice().sort((x, y) => dist(m, x) - dist(m, y) || x - y) });
    }
    const q = 1 - p;
    if (hasMove(b, q)) s.turn = q;
    else if (hasMove(b, p)) {
      // Đối thủ không có nước: mất lượt, bên vừa đi đi tiếp
      s.turn = p;
      s.passes++;
      if (ev) ev.push({ t: 'pass', p: q });
    } else finish(s, ev);
    return s;
  }

  // Hết ván: không bên nào đi được (bàn đầy hoặc bị chặn hết)
  function finish(s, ev) {
    s.over = true;
    const a = s.discs[0], c = s.discs[1];
    s.winner = a > c ? 0 : c > a ? 1 : DRAW;
    if (ev) ev.push({ t: 'over', winner: s.winner, discs: [a, c] });
  }

  // Đi nước m trên bản sao, ném lỗi nếu nước không hợp lệ
  function applyMove(s, m, ev) {
    if (!isLegal(s, m)) throw new Error('Nước đi không hợp lệ: ' + m);
    return play(cloneState(s), m, ev);
  }

  // Dựng lại ván từ danh sách nước (khôi phục ván đã lưu, Đi lại, Worker)
  function fromMoves(moves) {
    const s = createState();
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

  /* ---------------- AI: đánh giá thế cờ ---------------- */
  // Bảng trọng số vị trí kinh điển: góc rất quý, ô chéo sát góc (X) và ô cạnh
  // sát góc (C) rất xấu khi góc còn trống, cạnh khá tốt, vùng giữa trung tính.
  const W = new Int16Array([
    100, -25, 10, 5, 5, 10, -25, 100,
    -25, -45, -2, -2, -2, -2, -45, -25,
    10, -2, 3, 1, 1, 3, -2, 10,
    5, -2, 1, 0, 0, 1, -2, 5,
    5, -2, 1, 0, 0, 1, -2, 5,
    10, -2, 3, 1, 1, 3, -2, 10,
    -25, -45, -2, -2, -2, -2, -45, -25,
    100, -25, 10, 5, 5, 10, -25, 100,
  ]);
  const CORNERS = [0, 7, 56, 63];
  // Ba ô sát mỗi góc (C, C, X): khi góc đã có quân, các ô này hết nguy hiểm
  const NEAR = { 0: [1, 8, 9], 7: [6, 15, 14], 56: [57, 48, 49], 63: [62, 55, 54] };
  const NEAR_OK = 4; // trọng số thay thế cho ô sát góc khi góc đã có quân
  // Hai cạnh đi ra từ mỗi góc (để đếm quân ổn định nối liền từ góc)
  const EDGES = {
    0: [[1, 2, 3, 4, 5, 6, 7], [8, 16, 24, 32, 40, 48, 56]],
    7: [[6, 5, 4, 3, 2, 1, 0], [15, 23, 31, 39, 47, 55, 63]],
    56: [[57, 58, 59, 60, 61, 62, 63], [48, 40, 32, 24, 16, 8, 0]],
    63: [[62, 61, 60, 59, 58, 57, 56], [55, 47, 39, 31, 23, 15, 7]],
  };
  // Thứ tự xét ô khi sinh nước: ô trọng số cao trước để cắt tỉa nhiều hơn
  const ORDER = Array.from({ length: SIZE }, (_, i) => i).sort((a, b) => W[b] - W[a] || a - b);

  const WIN_SCALE = 10000; // hết ván: hiệu số quân * WIN_SCALE, luôn lớn hơn mọi điểm đánh giá giữa ván
  const MOB_WEIGHT = 90;
  const STABLE_WEIGHT = 18;

  // Quân ổn định gần đúng: quân nối liền từ một góc đã chiếm dọc theo hai cạnh.
  // Không đếm trùng (dùng bit đánh dấu). Trả về hiệu số ổn định của p so với đối thủ.
  function stableDiff(b, p) {
    let mine = 0, theirs = 0;
    let seenLo = 0, seenHi = 0; // 64 bit đánh dấu, tách hai nửa cho số 32 bit
    const mark = (sq) => {
      if (sq < 32) { if (seenLo & (1 << sq)) return false; seenLo |= 1 << sq; }
      else { if (seenHi & (1 << (sq - 32))) return false; seenHi |= 1 << (sq - 32); }
      return true;
    };
    for (let i = 0; i < 4; i++) {
      const c = CORNERS[i];
      const owner = b[c];
      if (owner === EMPTY) continue;
      if (mark(c)) { if (owner === p) mine++; else theirs++; }
      const edges = EDGES[c];
      for (let e = 0; e < 2; e++) {
        const line = edges[e];
        for (let k = 0; k < line.length && b[line[k]] === owner; k++) {
          if (mark(line[k])) { if (owner === p) mine++; else theirs++; }
        }
      }
    }
    return mine - theirs;
  }

  // Điểm thế cờ theo góc nhìn bên p (dương là p đang hơn)
  function evalBoard(b, p) {
    let empties = 0, mine = 0, theirs = 0, pos = 0;
    for (let sq = 0; sq < SIZE; sq++) {
      const v = b[sq];
      if (v === EMPTY) empties++;
      else if (v === p) { mine++; pos += W[sq]; }
      else { theirs++; pos -= W[sq]; }
    }
    // Góc đã có quân: ô sát góc không còn là ô xấu
    for (let i = 0; i < 4; i++) {
      const c = CORNERS[i];
      if (b[c] === EMPTY) continue;
      const near = NEAR[c];
      for (let k = 0; k < 3; k++) {
        const v = b[near[k]];
        if (v === EMPTY) continue;
        const d = NEAR_OK - W[near[k]];
        pos += v === p ? d : -d;
      }
    }
    const myMob = countMoves(b, p);
    const opMob = countMoves(b, 1 - p);
    if (myMob === 0 && opMob === 0) return (mine - theirs) * WIN_SCALE; // hết ván
    if (mine === 0) return -64 * WIN_SCALE;
    if (theirs === 0) return 64 * WIN_SCALE;
    const mob = Math.round((MOB_WEIGHT * (myMob - opMob)) / (myMob + opMob + 2));
    const stab = STABLE_WEIGHT * stableDiff(b, p);
    // Cuối ván số quân mới thật sự quan trọng
    const disc = empties < 20 ? ((mine - theirs) * (20 - empties)) >> 2 : 0;
    return pos + mob + stab + disc;
  }

  function evaluate(s, p) {
    if (s.over) return (s.discs[p] - s.discs[1 - p]) * WIN_SCALE;
    return evalBoard(s.board, p == null ? s.turn : p);
  }

  /* ---------------- AI: tìm kiếm ---------------- */
  function Aborted() {}

  // Sinh nước cho bên p theo thứ tự ORDER (ô tốt trước)
  function genMoves(b, p) {
    const res = [];
    for (let i = 0; i < SIZE; i++) { const sq = ORDER[i]; if (canPlayAt(b, sq, p)) res.push(sq); }
    return res;
  }

  // Cuối ván: ưu tiên nước khiến đối thủ ít lựa chọn nhất (fastest-first) để cắt tỉa sớm
  function sortEndgame(b, p, moves) {
    if (moves.length < 3) return moves;
    const fl = [];
    const keyed = moves.map((m) => {
      fl.length = 0;
      flipsAt(b, m, p, fl);
      b[m] = p;
      for (let i = 0; i < fl.length; i++) b[fl[i]] = p;
      const k = countMoves(b, 1 - p) * 8 - (CORNERS.includes(m) ? 4 : 0);
      b[m] = EMPTY;
      for (let i = 0; i < fl.length; i++) b[fl[i]] = 1 - p;
      return { m, k };
    });
    keyed.sort((x, y) => x.k - y.k);
    return keyed.map((x) => x.m);
  }

  // Negamax trên mảng board b (đặt rồi gỡ quân tại chỗ, không sao chép).
  // ctx: { deadline, maxNodes, nodes, cutoff, endgame }
  function negamax(b, p, depth, alpha, beta, ctx, empties) {
    ctx.nodes++;
    if ((ctx.nodes & 1023) === 0 && (now() >= ctx.deadline || ctx.nodes >= ctx.maxNodes)) throw new Aborted();
    if (depth <= 0) {
      const v = evalBoard(b, p);
      if (Math.abs(v) < WIN_SCALE) ctx.cutoff = true; // chưa phải thế hết ván
      return v;
    }
    let moves = genMoves(b, p);
    if (!moves.length) {
      if (!hasMove(b, 1 - p)) { // cả hai bên hết nước: hết ván, tính đúng hiệu số quân
        let d = 0;
        for (let sq = 0; sq < SIZE; sq++) if (b[sq] !== EMPTY) d += b[sq] === p ? 1 : -1;
        return d * WIN_SCALE;
      }
      return -negamax(b, 1 - p, depth, -beta, -alpha, ctx, empties); // mất lượt: không trừ độ sâu
    }
    if (ctx.endgame && empties > 5) moves = sortEndgame(b, p, moves);
    const o = 1 - p;
    const fl = [];
    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      fl.length = 0;
      flipsAt(b, m, p, fl);
      b[m] = p;
      for (let j = 0; j < fl.length; j++) b[fl[j]] = p;
      let v;
      try { v = -negamax(b, o, depth - 1, -beta, -alpha, ctx, empties - 1); }
      finally { // gỡ nước kể cả khi bị ngắt giữa chừng để board không bị hỏng
        b[m] = EMPTY;
        for (let j = 0; j < fl.length; j++) b[fl[j]] = o;
      }
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Tìm ở gốc với độ sâu cho trước, trả về điểm từng nước (theo thứ tự order).
  // exact: tính đúng điểm mọi nước (cần khi cộng nhiễu); không thì nước kém hơn
  // nước tốt nhất chỉ cần biết là "không hơn" (cắt tỉa nhiều hơn).
  function searchRoot(b, p, order, depth, ctx, exact, empties) {
    const vals = [];
    let alpha = -Infinity;
    const fl = [];
    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      fl.length = 0;
      flipsAt(b, m, p, fl);
      b[m] = p;
      for (let j = 0; j < fl.length; j++) b[fl[j]] = p;
      let v;
      try { v = -negamax(b, 1 - p, depth - 1, -Infinity, exact ? Infinity : -alpha, ctx, empties - 1); }
      finally {
        b[m] = EMPTY;
        for (let j = 0; j < fl.length; j++) b[fl[j]] = 1 - p;
      }
      vals.push(v);
      if (v > alpha) alpha = v;
    }
    return vals;
  }

  // Chọn nước cho bên đang đi.
  // opts: { level, depth, timeMs, noise, seed, rng, exact }
  // Trả về { move, depth, nodes, value, timeMs, reason }
  function chooseMove(s, opts) {
    opts = opts || {};
    const t0 = now();
    const lv = LEVELS[opts.level] || LEVELS.medium;
    const rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const done = (move, reason, extra) => Object.assign({ move, reason, depth: 0, nodes: 0, value: null, timeMs: Math.round(now() - t0) }, extra || {});
    if (s.over) return done(-1, 'over');
    const moves = legalMoves(s);
    if (!moves.length) return done(-1, 'none');
    if (moves.length === 1) return done(moves[0], 'only');

    const p = s.turn;
    const b = s.board.slice(); // tìm trên bản sao, không đụng ván thật
    let empties = 0;
    for (let i = 0; i < SIZE; i++) if (b[i] === EMPTY) empties++;
    const noise = opts.noise != null ? opts.noise : lv.noise;
    const timeMs = opts.timeMs != null ? opts.timeMs : lv.timeMs;
    const exactAt = opts.exact != null ? opts.exact : lv.exact || 0;
    let maxDepth = opts.depth != null ? opts.depth : lv.depth;
    if (opts.depth == null && lv.depthMin) maxDepth = lv.depthMin + Math.floor(rng() * (lv.depth - lv.depthMin + 1));
    // Có trần thời gian: đào sâu dần. Không có: tìm thẳng ở độ sâu cố định
    const timed = timeMs != null;
    const ctx = {
      deadline: timed ? t0 + timeMs : Infinity,
      // Trần số nút: phòng khi đồng hồ không chạy (môi trường giả lập thời gian)
      maxNodes: timed ? Math.max(50000, timeMs * 3000) : Infinity,
      nodes: 0,
      cutoff: false,
      endgame: false,
    };

    // Thứ tự ban đầu: theo đánh giá tĩnh sau một nước
    const fl = [];
    let order = moves.map((m) => {
      fl.length = 0;
      flipsAt(b, m, p, fl);
      b[m] = p;
      for (let j = 0; j < fl.length; j++) b[fl[j]] = p;
      const k = -evalBoard(b, 1 - p);
      b[m] = EMPTY;
      for (let j = 0; j < fl.length; j++) b[fl[j]] = 1 - p;
      return { m, k };
    }).sort((x, y) => y.k - x.k).map((x) => x.m);

    const pick = (list, reason, depth) => {
      // Chọn nước có điểm cao nhất (cộng nhiễu ở mức Dễ)
      let best = null, bestScore = -Infinity;
      for (const x of list) {
        const sc = x.v + (noise > 0 ? rng() * noise : 0);
        if (sc > bestScore) { bestScore = sc; best = x; }
      }
      return done(best.m, reason, { depth, nodes: ctx.nodes, value: best.v });
    };

    // Cuối ván (mức Khó): tìm tới hết ván, kết quả là hiệu số quân chính xác
    if (exactAt && empties <= exactAt && noise === 0) {
      ctx.endgame = true;
      try {
        const ord = sortEndgame(b, p, order);
        const vals = searchRoot(b, p, ord, 99, ctx, false, empties);
        return pick(ord.map((m, i) => ({ m, v: vals[i] })), 'exact', empties);
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
        // Hết giờ: tìm nông để vẫn có nước hợp lý
        ctx.endgame = false;
        ctx.deadline = Infinity;
        ctx.maxNodes = Infinity;
        const vals = searchRoot(b, p, order, 3, ctx, false, empties);
        return pick(order.map((m, i) => ({ m, v: vals[i] })), 'fallback', 3);
      }
    }

    let bestVals = null;
    let reached = 0;
    for (let depth = timed ? 1 : maxDepth; depth <= maxDepth; depth++) {
      ctx.cutoff = false;
      let vals;
      try { vals = searchRoot(b, p, order, depth, ctx, noise > 0, empties); } catch (e) {
        if (e instanceof Aborted) break;
        throw e;
      }
      bestVals = order.map((m, i) => ({ m, v: vals[i] }));
      reached = depth;
      // Đưa nước tốt nhất lên đầu cho lần đào sâu sau
      order = bestVals.slice().sort((x, y) => y.v - x.v).map((x) => x.m);
      if (!ctx.cutoff) break; // mọi nhánh đã tới hết ván: không cần đào sâu thêm
      if (timed && now() - t0 > timeMs * 0.45) break; // lần sau gần chắc chắn không kịp
    }
    if (!bestVals) return done(order[0], 'static', { nodes: ctx.nodes }); // hết giờ ngay từ độ sâu 1
    return pick(bestVals, 'search', reached);
  }

  return {
    N, SIZE, EMPTY, BLACK, WHITE, DRAW, COLS, COLOR_NAME, LEVELS, RAYS, W,
    rowOf, colOf, sqOf, sqName, parseSq,
    createState, cloneState, recount, legalMoves, isLegal, flipsOf, play, finish, applyMove, fromMoves,
    hasMove: (s, p) => hasMove(s.board, p), countMoves: (s, p) => countMoves(s.board, p),
    evaluate, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = CoLatFactory();
  api.factory = CoLatFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CoLat = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
