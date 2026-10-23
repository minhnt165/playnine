/* =====================================================================
 * Cờ Thú - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong
 *   Web Worker: toàn bộ engine nằm trong hàm CoThuFactory để app.js dựng lại mã nguồn
 *   cho worker qua GameEngine.factory.toString() (chạy được cả khi mở bằng file://).
 *
 * Bàn 7 cột × 9 hàng, ô = y * 7 + x; y = 0 là hàng trên cùng (phía Xanh), y = 8 là hàng dưới (phía Đỏ).
 *   - Quân: số có dấu, Đỏ dương, Xanh âm; trị tuyệt đối là bậc: 1 Chuột … 8 Voi
 *   - Nước đi mã hóa thành một số: từ * 64 + đến
 *   - Hai sông 3×2 (y 3..5, x 1-2 và 4-5), bẫy quanh mỗi hang, hang ở giữa hàng cuối
 *   - Luật: xem README.md. Hòa khi lặp lại thế cờ 3 lần hoặc 200 nước liền không ăn quân
 *   - Máy: Dễ (ngẫu nhiên, thích ăn quân), Vừa (alpha-beta độ sâu 3), Khó (đào sâu dần tới 5,
 *     sắp nước ăn quân / sát thủ / lịch sử, tìm kiếm tĩnh các nước ăn quân và đòn vào hang)
 * ===================================================================== */
function CoThuFactory() {
  'use strict';

  const W = 7, H = 9, N = 63;
  const RED = 0, BLUE = 1, DRAW = 2; // winner = 2 khi hòa
  const RAT = 1, CAT = 2, DOG = 3, WOLF = 4, LEOPARD = 5, TIGER = 6, LION = 7, ELEPHANT = 8;
  const LETTERS = '.RCDWPTLE'; // chữ của quân theo bậc; Đỏ chữ hoa, Xanh chữ thường
  const NAMES = ['', 'rat', 'cat', 'dog', 'wolf', 'leopard', 'tiger', 'lion', 'elephant'];
  const QUIET_LIMIT = 200; // số nước liền không ăn quân thì hòa
  const REPEAT_LIMIT = 3; // cùng thế cờ (kể cả bên đi) xuất hiện 3 lần thì hòa
  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const sq = (x, y) => y * W + x;
  const xOf = (s) => s % W;
  const yOf = (s) => (s / W) | 0;
  const encode = (from, to) => from * 64 + to;
  const fromOf = (m) => (m / 64) | 0;
  const toOf = (m) => m % 64;
  const sideOf = (p) => (p > 0 ? RED : BLUE);
  const rankOf = (p) => (p < 0 ? -p : p);

  const DEN = [sq(3, 8), sq(3, 0)]; // DEN[bên]: hang của bên đó
  const WATER = new Uint8Array(N);
  for (let y = 3; y <= 5; y++) for (const x of [1, 2, 4, 5]) WATER[sq(x, y)] = 1;
  const TRAP = new Int8Array(N).fill(-1); // TRAP[ô]: bẫy của bên nào, -1 nếu không phải bẫy
  for (const s of [sq(2, 8), sq(4, 8), sq(3, 7)]) TRAP[s] = RED;
  for (const s of [sq(2, 0), sq(4, 0), sq(3, 1)]) TRAP[s] = BLUE;
  const isWater = (s) => WATER[s] === 1;
  const trapOwner = (s) => TRAP[s];

  // Ô kề theo 4 hướng (lên, xuống, trái, phải); -1 nếu ra ngoài bàn
  const DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0];
  const NB = new Int8Array(N * 4).fill(-1);
  // Nhảy sông: từ ô cạn kề sông theo một hướng, các ô nước đi qua và ô cạn đáp xuống
  const JUMP_TO = new Int8Array(N * 4).fill(-1);
  const JUMP_PATH = new Array(N * 4).fill(null);
  for (let s = 0; s < N; s++) {
    for (let d = 0; d < 4; d++) {
      const x = xOf(s) + DX[d], y = yOf(s) + DY[d];
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      NB[s * 4 + d] = sq(x, y);
      if (WATER[s] || !WATER[sq(x, y)]) continue;
      const path = [];
      let cx = x, cy = y;
      while (WATER[sq(cx, cy)]) {
        path.push(sq(cx, cy));
        cx += DX[d];
        cy += DY[d];
      }
      JUMP_TO[s * 4 + d] = sq(cx, cy);
      JUMP_PATH[s * 4 + d] = path;
    }
  }

  // Bày quân ban đầu (đối xứng tâm): Xanh ở trên, Đỏ ở dưới
  const START = [
    ['l', 0, 0], ['t', 6, 0], ['d', 1, 1], ['c', 5, 1], ['r', 0, 2], ['p', 2, 2], ['w', 4, 2], ['e', 6, 2],
    ['E', 0, 6], ['W', 2, 6], ['P', 4, 6], ['R', 6, 6], ['C', 1, 7], ['D', 5, 7], ['T', 0, 8], ['L', 6, 8],
  ];

  /* ---------------- PRNG ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Luật ---------------- */

  /** Quân ở `from` ăn được quân ở `to` không (chỉ xét bậc, nước / cạn, bẫy; không xét đường đi). */
  function canCapture(board, from, to) {
    const a = board[from], d = board[to];
    if (!a || !d || (a > 0) === (d > 0)) return false;
    // Chuột dưới nước không ăn quân trên cạn và ngược lại (Chuột nước ăn Chuột nước được)
    if (WATER[from] !== WATER[to]) return false;
    // Quân đứng trong bẫy của bên ăn có bậc 0: quân nào cũng ăn được
    if (TRAP[to] === sideOf(a)) return true;
    const ra = rankOf(a), rd = rankOf(d);
    if (ra === ELEPHANT && rd === RAT) return false;
    if (ra === RAT && rd === ELEPHANT) return true;
    return ra >= rd;
  }

  /** Ô đích hợp lệ của quân ở ô s (không xét ván đã kết thúc hay chưa). */
  function targetsOf(board, s, out) {
    const p = board[s];
    if (!p) return out;
    const side = sideOf(p), r = rankOf(p);
    for (let d = 0; d < 4; d++) {
      let n = NB[s * 4 + d];
      if (n < 0 || n === DEN[side]) continue;
      if (WATER[n] && r !== RAT) {
        if (r !== LION && r !== TIGER) continue;
        const path = JUMP_PATH[s * 4 + d];
        if (!path) continue;
        let blocked = false;
        for (let i = 0; i < path.length; i++) if (board[path[i]]) { blocked = true; break; }
        if (blocked) continue;
        n = JUMP_TO[s * 4 + d];
      }
      const t = board[n];
      if (t && ((t > 0) === (p > 0) || !canCapture(board, s, n))) continue;
      out.push(n);
    }
    return out;
  }

  /** Mọi nước của bên `side` trên bàn (mảng số đã mã hóa). */
  function genMoves(board, side, out) {
    for (let s = 0; s < N; s++) {
      const p = board[s];
      if (!p || sideOf(p) !== side) continue;
      const start = out.length;
      targetsOf(board, s, out);
      for (let i = start; i < out.length; i++) out[i] = s * 64 + out[i];
    }
    return out;
  }

  function hasMove(board, side) {
    const tmp = [];
    for (let s = 0; s < N; s++) {
      const p = board[s];
      if (!p || sideOf(p) !== side) continue;
      if (targetsOf(board, s, tmp).length) return true;
    }
    return false;
  }

  const letterOf = (p) => (p > 0 ? LETTERS[p] : LETTERS[-p].toLowerCase());
  function pieceOf(ch) {
    const i = LETTERS.indexOf(ch.toUpperCase());
    if (i <= 0 || ch === '.') return null;
    return ch === ch.toUpperCase() ? i : -i;
  }
  const boardStr = (board) => {
    let s = '';
    for (let i = 0; i < N; i++) s += board[i] ? letterOf(board[i]) : '.';
    return s;
  };
  const keyOf = (board, turn) => boardStr(board) + turn;
  const boardString = (g) => boardStr(g.board);

  /** Tính kết quả ván: vào hang, ăn hết quân, hết nước đi, lặp lại, 200 nước không ăn. */
  function settle(g) {
    g.winner = null;
    g.reason = null;
    const b = g.board;
    if (b[DEN[RED]] < 0) return Object.assign(g, { winner: BLUE, reason: 'den' });
    if (b[DEN[BLUE]] > 0) return Object.assign(g, { winner: RED, reason: 'den' });
    let red = 0, blue = 0;
    for (let s = 0; s < N; s++) {
      if (b[s] > 0) red++;
      else if (b[s] < 0) blue++;
    }
    if (!red) return Object.assign(g, { winner: BLUE, reason: 'wipe' });
    if (!blue) return Object.assign(g, { winner: RED, reason: 'wipe' });
    if (!hasMove(b, g.turn)) return Object.assign(g, { winner: 1 - g.turn, reason: 'stuck' });
    const key = keyOf(b, g.turn);
    let reps = 0;
    for (let i = 0; i < g.seen.length; i++) if (g.seen[i] === key) reps++;
    if (reps >= REPEAT_LIMIT) return Object.assign(g, { winner: DRAW, reason: 'repeat' });
    if (g.quiet >= QUIET_LIMIT) return Object.assign(g, { winner: DRAW, reason: 'quiet' });
    return g;
  }

  /**
   * Dựng ván từ danh sách quân [chữ, x, y] (chữ hoa Đỏ, chữ thường Xanh). Trả null nếu sai:
   * trùng ô, trùng quân, quân không phải Chuột ở dưới nước, quân trong hang mình.
   * opts: { quiet, ply }.
   */
  function fromPieces(pieces, turn, opts) {
    if (!Array.isArray(pieces) || (turn !== RED && turn !== BLUE)) return null;
    const board = new Array(N).fill(0);
    for (const it of pieces) {
      if (!Array.isArray(it)) return null;
      const [ch, x, y] = it;
      const p = typeof ch === 'string' && ch.length === 1 ? pieceOf(ch) : null;
      if (!p || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= W || y < 0 || y >= H) return null;
      if (board[sq(x, y)]) return null;
      board[sq(x, y)] = p;
    }
    return fromBoardArray(board, turn, opts);
  }

  function validBoard(board) {
    const seen = new Set();
    for (let s = 0; s < N; s++) {
      const p = board[s];
      if (!p) continue;
      if (seen.has(p)) return false; // mỗi bên mỗi loại chỉ một con
      seen.add(p);
      if (WATER[s] && rankOf(p) !== RAT) return false;
      if (s === DEN[sideOf(p)]) return false;
    }
    return true;
  }

  function fromBoardArray(board, turn, opts) {
    if (!validBoard(board)) return null;
    const o = opts || {};
    const g = {
      board,
      turn,
      ply: o.ply || 0,
      quiet: o.quiet || 0,
      seen: o.seen ? o.seen.slice() : [keyOf(board, turn)],
      last: o.last || null,
      winner: null,
      reason: null,
    };
    return settle(g);
  }

  function newGame() {
    return fromPieces(START, RED);
  }

  /** Ô đích hợp lệ của quân ở ô s (rỗng nếu không phải quân của bên đang đi hoặc ván đã xong). */
  function movesFrom(g, s) {
    if (g.winner != null || !g.board[s] || sideOf(g.board[s]) !== g.turn) return [];
    return targetsOf(g.board, s, []);
  }

  function legalMoves(g) {
    if (g.winner != null) return [];
    return genMoves(g.board, g.turn, []);
  }

  /** Đi nước m; trả ván mới (ván cũ giữ nguyên) hoặc null nếu nước sai luật. */
  function play(g, m) {
    if (!g || g.winner != null || !Number.isInteger(m)) return null;
    const from = fromOf(m), to = toOf(m);
    if (from < 0 || from >= N || to < 0 || to >= N) return null;
    if (movesFrom(g, from).indexOf(to) < 0) return null;
    const board = g.board.slice();
    const piece = board[from];
    const captured = board[to];
    board[to] = piece;
    board[from] = 0;
    const turn = 1 - g.turn;
    const seen = captured ? [] : g.seen.slice(); // ăn quân rồi thì không thể lặp lại thế cũ
    seen.push(keyOf(board, turn));
    return settle({
      board,
      turn,
      ply: g.ply + 1,
      quiet: captured ? 0 : g.quiet + 1,
      seen,
      last: { from, to, piece, captured },
      winner: null,
      reason: null,
    });
  }

  /** Đếm số chuỗi nước tới độ sâu depth (dừng ở thế đã kết thúc). */
  function perft(g, depth) {
    if (depth <= 0 || g.winner != null) return 1;
    const ms = legalMoves(g);
    if (depth === 1) return ms.length;
    let n = 0;
    for (const m of ms) n += perft(play(g, m), depth - 1);
    return n;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    board: boardStr(g.board),
    turn: g.turn,
    ply: g.ply,
    quiet: g.quiet,
    seen: g.seen.slice(),
    last: g.last ? { from: g.last.from, to: g.last.to, piece: g.last.piece, captured: g.last.captured } : null,
  });

  const SEEN_RE = /^[.RCDWPTLErcdwptle]{63}[01]$/;
  const isSq = (v) => Number.isInteger(v) && v >= 0 && v < N;
  const isPiece = (v) => Number.isInteger(v) && v >= -8 && v <= 8;

  /** Ván lưu hỏng, khác phiên bản hoặc đã kết thúc thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    const { board, turn, ply, quiet, seen, last } = raw;
    if (typeof board !== 'string' || board.length !== N) return null;
    if (turn !== RED && turn !== BLUE) return null;
    if (!Number.isInteger(ply) || ply < 0 || !Number.isInteger(quiet) || quiet < 0 || quiet >= QUIET_LIMIT) return null;
    if (!Array.isArray(seen) || seen.length > QUIET_LIMIT + 1 || !seen.every((k) => typeof k === 'string' && SEEN_RE.test(k))) return null;
    let lastOk = null;
    if (last != null) {
      if (typeof last !== 'object' || !isSq(last.from) || !isSq(last.to) || !isPiece(last.piece) || !isPiece(last.captured)) return null;
      lastOk = { from: last.from, to: last.to, piece: last.piece, captured: last.captured };
    }
    const arr = new Array(N).fill(0);
    for (let s = 0; s < N; s++) {
      const ch = board[s];
      if (ch === '.') continue;
      const p = pieceOf(ch);
      if (!p) return null;
      arr[s] = p;
    }
    const key = keyOf(arr, turn);
    const seenOk = seen.length && seen[seen.length - 1] === key ? seen : seen.concat([key]);
    const g = fromBoardArray(arr, turn, { ply, quiet, seen: seenOk, last: lastOk });
    if (!g || g.winner != null) return null;
    return g;
  }

  /* ---------------- Máy ---------------- */

  const LEVELS = ['easy', 'medium', 'hard'];
  const WIN = 100000;
  const HARD_DEPTH = 5; // độ sâu tối đa của mức Khó (đào sâu dần, có giới hạn thời gian)
  const VAL = [0, 450, 250, 300, 400, 500, 800, 900, 1000]; // giá trị quân theo bậc
  const ADV = [0, 2, 3, 3, 4, 5, 8, 8, 6]; // thưởng tiến gần hang đối thủ (mỗi ô)
  const DEN_NEAR = [];
  for (const side of [RED, BLUE]) {
    const den = DEN[side];
    DEN_NEAR[side] = [];
    for (let d = 0; d < 4; d++) if (NB[den * 4 + d] >= 0) DEN_NEAR[side].push(NB[den * 4 + d]);
  }
  // Khoảng cách Manhattan tới hang mỗi bên
  const DIST = [new Int8Array(N), new Int8Array(N)];
  for (let s = 0; s < N; s++) {
    for (const side of [RED, BLUE]) DIST[side][s] = Math.abs(xOf(s) - 3) + Math.abs(yOf(s) - yOf(DEN[side]));
  }

  /** Điểm thế cờ theo góc nhìn của Đỏ: giá trị quân, tiến gần hang địch, giữ bẫy / hang nhà. */
  function evaluateRed(board) {
    let sc = 0;
    const near = [0, 0]; // số quân địch sát hang mỗi bên (cách ≤ 2 ô)
    const guard = [0, 0]; // số quân giữ nhà mỗi bên (cách hang mình ≤ 2 ô)
    for (let s = 0; s < N; s++) {
      const p = board[s];
      if (!p) continue;
      const side = p > 0 ? RED : BLUE, r = p > 0 ? p : -p;
      const enemyDen = 1 - side;
      const d = DIST[enemyDen][s];
      let v = VAL[r] + ADV[r] * (11 - d);
      if (d === 1) v += 160; // đứng sát hang địch: dọa vào hang ngay nước sau
      else if (d === 2) v += 45;
      if (d <= 2) near[enemyDen]++;
      if (DIST[side][s] <= 2 && r >= DOG) guard[side]++;
      if (r === RAT && WATER[s]) v += 15; // Chuột dưới sông chặn đường nhảy
      if (TRAP[s] === enemyDen) v -= VAL[r] >> 2; // đứng trong bẫy địch dễ bị ăn
      sc += side === RED ? v : -v;
    }
    // Giữ nhà: có địch áp sát mà không có quân phòng thủ thì bị trừ
    for (const side of [RED, BLUE]) {
      const v = Math.min(guard[side], 2) * 20 + (near[side] ? Math.min(guard[side], 2) * 30 - near[side] * 40 : 0);
      sc += side === RED ? v : -v;
    }
    return sc;
  }

  /** Chọn nước cho bên đang đi. opts: { level: 'easy'|'medium'|'hard', seed, timeMs }. */
  function chooseMove(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    const rng = mulberry32(o.seed != null ? o.seed : (Math.random() * 4294967296) >>> 0);
    const moves = legalMoves(g);
    if (!moves.length) return { move: null, depth: 0, nodes: 0 };
    const side = g.turn;
    const enemyDen = DEN[1 - side];
    // Vào được hang thì vào ngay (mức nào cũng thấy)
    for (const m of moves) if (toOf(m) === enemyDen) return { move: m, depth: 1, nodes: 0, reason: 'den' };
    if (moves.length === 1) return { move: moves[0], depth: 0, nodes: 0, reason: 'only' };
    if (level === 'easy') return easyMove(g, moves, rng);
    return searchMove(g, moves, level, rng, o.timeMs, o.maxDepth || HARD_DEPTH);
  }

  // Dễ: hay ăn quân (ưu tiên quân to), còn lại đi ngẫu nhiên, hơi thích tiến lên
  function easyMove(g, moves, rng) {
    const b = g.board;
    const caps = moves.filter((m) => b[toOf(m)]);
    if (caps.length && rng() < 0.8) {
      caps.sort((a, c) => rankOf(b[toOf(c)]) - rankOf(b[toOf(a)]));
      const pick = rng() < 0.6 ? caps[0] : caps[Math.floor(rng() * caps.length)];
      return { move: pick, depth: 0, nodes: 0, reason: 'capture' };
    }
    if (rng() < 0.35) {
      const fwd = moves.filter((m) => DIST[1 - g.turn][toOf(m)] < DIST[1 - g.turn][fromOf(m)]);
      if (fwd.length) return { move: fwd[Math.floor(rng() * fwd.length)], depth: 0, nodes: 0, reason: 'random' };
    }
    return { move: moves[Math.floor(rng() * moves.length)], depth: 0, nodes: 0, reason: 'random' };
  }

  function searchMove(g, rootMoves, level, rng, timeMs, maxDepth) {
    const board = g.board.slice();
    const count = [0, 0];
    for (let s = 0; s < N; s++) if (board[s]) count[sideOf(board[s])]++;
    const limit = timeMs || (level === 'hard' ? 3500 : 2000);
    const t0 = Date.now();
    const STOP = {};
    let nodes = 0;
    const killers = [];
    const history = new Int32Array(64 * 64);

    const evalSide = (side) => (side === RED ? evaluateRed(board) : -evaluateRed(board));

    // Điểm sắp nước: vào hang > ăn quân to bằng quân nhỏ > nước sát thủ > lịch sử
    function orderScore(m, ply, pv) {
      if (m === pv) return 1e9;
      const to = toOf(m), from = fromOf(m);
      const p = board[from];
      if (to === DEN[1 - sideOf(p)]) return 9e8;
      const v = board[to];
      if (v) return 1e8 + VAL[rankOf(v)] * 16 - rankOf(p);
      const k = killers[ply];
      if (k && (k[0] === m || k[1] === m)) return 5e7;
      return history[(from << 6) | to];
    }
    function sortMoves(ms, ply, pv) {
      const sc = ms.map((m) => orderScore(m, ply, pv));
      // sắp chèn: ổn định, giữ thứ tự xáo trộn ở gốc cho các nước ngang điểm
      for (let i = 1; i < ms.length; i++) {
        const m = ms[i], s = sc[i];
        let j = i - 1;
        while (j >= 0 && sc[j] < s) { ms[j + 1] = ms[j]; sc[j + 1] = sc[j]; j--; }
        ms[j + 1] = m;
        sc[j + 1] = s;
      }
      return ms;
    }

    function tick() {
      if ((++nodes & 1023) === 0 && Date.now() - t0 > limit) throw STOP;
    }

    // Bên `side` có quân sát hang địch: nước sau vào hang
    function threatens(side) {
      const near = DEN_NEAR[1 - side];
      for (let i = 0; i < near.length; i++) {
        const p = board[near[i]];
        if (p && sideOf(p) === side) return true;
      }
      return false;
    }

    // Tìm kiếm tĩnh: chỉ xét nước ăn quân; bị dọa vào hang thì không được "đứng yên"
    function quiesce(side, alpha, beta, ply, qd) {
      tick();
      if (threatens(side)) return WIN - ply - 1;
      const danger = threatens(1 - side);
      let best = danger ? -WIN + ply + 2 : evalSide(side);
      if (best >= beta) return best;
      if (best > alpha) alpha = best;
      if (qd >= 6) return best;
      const ms = genMoves(board, side, []);
      const caps = [];
      for (let i = 0; i < ms.length; i++) if (board[toOf(ms[i])]) caps.push(ms[i]);
      sortMoves(caps, ply, -1);
      for (let i = 0; i < caps.length; i++) {
        const m = caps[i], from = fromOf(m), to = toOf(m);
        const cap = board[to];
        board[to] = board[from];
        board[from] = 0;
        count[1 - side]--;
        const v = count[1 - side] === 0 ? WIN - ply - 1 : -quiesce(1 - side, -beta, -alpha, ply + 1, qd + 1);
        count[1 - side]++;
        board[from] = board[to];
        board[to] = cap;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best;
    }

    function negamax(side, depth, alpha, beta, ply) {
      if (depth <= 0) return quiesce(side, alpha, beta, ply, 0);
      tick();
      const ms = genMoves(board, side, []);
      if (!ms.length) return -WIN + ply; // hết nước đi là thua
      sortMoves(ms, ply, -1);
      const den = DEN[1 - side];
      let best = -Infinity;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i], from = fromOf(m), to = toOf(m);
        if (to === den) return WIN - ply - 1;
        const cap = board[to];
        board[to] = board[from];
        board[from] = 0;
        if (cap) count[1 - side]--;
        const v = cap && count[1 - side] === 0 ? WIN - ply - 1 : -negamax(1 - side, depth - 1, -beta, -alpha, ply + 1);
        if (cap) count[1 - side]++;
        board[from] = board[to];
        board[to] = cap;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) {
          if (!cap) {
            const k = killers[ply] || (killers[ply] = [0, 0]);
            if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
            history[(from << 6) | to] += depth * depth;
          }
          break;
        }
      }
      return best;
    }

    /** Điểm một nước ở gốc (đã đi xong, tới lượt đối thủ). */
    function rootValue(m, side, depth, alpha, beta) {
      const from = fromOf(m), to = toOf(m);
      const cap = board[to];
      board[to] = board[from];
      board[from] = 0;
      if (cap) count[1 - side]--;
      let v;
      try {
        if (cap && count[1 - side] === 0) v = WIN - 1;
        else if (to === DEN[1 - side]) v = WIN - 1;
        else if (!cap && (reps(keyOf(board, 1 - side)) >= REPEAT_LIMIT - 1 || g.quiet + 1 >= QUIET_LIMIT)) v = 0; // nước này làm ván hòa
        else {
          v = -negamax(1 - side, depth - 1, -beta, -alpha, 1);
          // Đang hơn thì tránh đi lại thế cũ (đỡ hòa vì lặp), đang kém thì kệ
          if (!cap && v > 0 && reps(keyOf(board, 1 - side))) v -= 25;
        }
      } finally {
        if (cap) count[1 - side]++;
        board[from] = board[to];
        board[to] = cap;
      }
      return v;
    }

    /** Số lần thế cờ (khóa key) đã xuất hiện trong ván thật. */
    function reps(key) {
      let n = 0;
      for (let i = 0; i < g.seen.length; i++) if (g.seen[i] === key) n++;
      return n;
    }

    const side = g.turn;
    // Xáo trộn nước gốc để các nước ngang điểm không lần nào cũng giống nhau
    const root = rootMoves.slice();
    for (let i = root.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = root[i]; root[i] = root[j]; root[j] = t;
    }

    if (level === 'medium') {
      // Vừa: độ sâu 3, chấm đủ từng nước gốc rồi cộng nhiễu nhỏ (đôi khi chọn nước kém hơn chút)
      const NOISE = 40;
      let pick = root[0], bestScore = -Infinity, bestVal = 0;
      try {
        for (const m of root) {
          const v = rootValue(m, side, 3, -WIN - 1, WIN + 1);
          const s = v + (Math.abs(v) < WIN - 1000 ? rng() * NOISE : 0);
          if (s > bestScore) { bestScore = s; pick = m; bestVal = v; }
        }
      } catch (e) {
        if (e !== STOP) throw e;
      }
      return { move: pick, depth: 3, nodes, score: bestVal, reason: 'search' };
    }

    // Khó: đào sâu dần 1..5, nước tốt nhất của lượt trước xét trước; hết giờ thì dùng kết quả độ sâu đã xong
    let best = root[0], bestVal = 0, done = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      sortMoves(root, 0, best);
      let alpha = -WIN - 1, cur = root[0], curVal = -Infinity;
      try {
        for (const m of root) {
          const v = rootValue(m, side, depth, alpha, WIN + 1);
          if (v > curVal) { curVal = v; cur = m; }
          if (v > alpha) alpha = v;
        }
      } catch (e) {
        if (e !== STOP) throw e;
        break;
      }
      best = cur;
      bestVal = curVal;
      done = depth;
      if (curVal >= WIN - 100) break; // đã thấy đường thắng
    }
    return { move: best, depth: done, nodes, score: bestVal, reason: 'search' };
  }

  return {
    W, H, N, RED, BLUE, DRAW, RAT, CAT, DOG, WOLF, LEOPARD, TIGER, LION, ELEPHANT,
    LETTERS, NAMES, QUIET_LIMIT, REPEAT_LIMIT, LEVELS, DEN, VERSION,
    sq, xOf, yOf, encode, fromOf, toOf, sideOf, rankOf, isWater, trapOwner,
    canCapture, newGame, fromPieces, movesFrom, legalMoves, play, perft, boardString,
    toJSON, fromJSON, evaluateRed, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = CoThuFactory();
  api.factory = CoThuFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
