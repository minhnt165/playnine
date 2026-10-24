/* =====================================================================
 * Cờ Nhảy - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong
 *   Web Worker: toàn bộ engine nằm trong hàm CoNhayFactory để app.js dựng lại mã nguồn
 *   cho worker qua GameEngine.factory.toString().
 *
 * Bàn sao sáu cánh 121 lỗ, tọa độ khối (q, r, s = -q - r):
 *   - Bàn = hợp của hai tam giác lớn {q, r, s ≥ -4} và {q, r, s ≤ 4}; lục giác giữa |q|,|r|,|s| ≤ 4 (61 lỗ)
 *   - Sáu góc (10 lỗ mỗi góc) đánh số theo chiều kim đồng hồ từ dưới lên:
 *     0 dưới (r ≥ 5), 1 dưới trái (q ≤ -5), 2 trên trái (s ≥ 5), 3 trên (r ≤ -5), 4 trên phải (q ≥ 5), 5 dưới phải (s ≤ -5)
 *     Góc đích của góc k là góc đối diện (k + 3) % 6
 *   - Ô đánh số 0..120 theo hàng (r từ -8 xuống 8), trong hàng theo q tăng (trái sang phải)
 *   - Nước đi mã hóa thành một số: từ * 128 + đến
 *   - Luật: xem README.md. Tóm tắt: đi một bước sang lỗ kề trống, hoặc nhảy liên tiếp qua quân kề
 *     (của ai cũng được) sang lỗ trống ngay sau; quân đã vào góc đích chỉ đi trong góc đích
 *   - Thắng: lấp đầy góc đích; luật chống chiếm góc: từ lượt thứ 30 của một bên, quân bên đó còn
 *     nằm trong góc nhà được tính như quân của đối thủ khi xét góc đích của đối thủ đã đầy chưa
 *   - Hòa: mỗi bên đã đi 200 lượt mà chưa ai thắng, hoặc không bên nào còn nước đi
 *   - Máy: Dễ (tham lam), Vừa (nhìn trước hai nước của mình), Khó (alpha-beta, có cắt tỉa)
 * ===================================================================== */
function CoNhayFactory() {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const EMPTY = -1;
  const DRAW = -1; // winner = -1 khi hòa
  const PIECES = 10; // số quân mỗi bên
  const HOME_LIMIT = 30; // luật chống chiếm góc áp dụng từ lượt thứ 30 của bên chiếm góc
  const TURN_LIMIT = 200; // mỗi bên đã đi 200 lượt mà chưa ai thắng thì hòa
  const LEVELS = ['easy', 'medium', 'hard'];
  const SEATS = { 2: [0, 3], 3: [0, 2, 4] }; // góc nhà của từng người theo số người chơi

  /* ---------------- Ô, láng giềng, góc, khoảng cách ---------------- */
  const Q = [];
  const R = [];
  const ID = new Int16Array(17 * 17).fill(-1);
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const s = -q - r;
      if ((q >= -4 && r >= -4 && s >= -4) || (q <= 4 && r <= 4 && s <= 4)) {
        ID[(q + 8) * 17 + r + 8] = Q.length;
        Q.push(q);
        R.push(r);
      }
    }
  }
  const N = Q.length; // 121
  const cellAt = (q, r) => (q < -8 || q > 8 || r < -8 || r > 8 ? -1 : ID[(q + 8) * 17 + r + 8]);

  // Sáu hướng: Đông, Đông Bắc, Tây Bắc, Tây, Tây Nam, Đông Nam; hướng ngược của d là (d + 3) % 6
  const DQ = [1, 1, 0, -1, -1, 0];
  const DR = [0, -1, -1, 0, 1, 1];
  const NB = new Int16Array(N * 6);
  for (let c = 0; c < N; c++) for (let d = 0; d < 6; d++) NB[c * 6 + d] = cellAt(Q[c] + DQ[d], R[c] + DR[d]);

  function cornerOf(q, r) {
    const s = -q - r;
    if (r >= 5) return 0;
    if (q <= -5) return 1;
    if (s >= 5) return 2;
    if (r <= -5) return 3;
    if (q >= 5) return 4;
    if (s <= -5) return 5;
    return -1;
  }
  const CORNER = new Int8Array(N);
  const CORNERS = [[], [], [], [], [], []];
  const APEX = [0, 0, 0, 0, 0, 0]; // đỉnh nhọn của mỗi góc (lỗ xa tâm nhất)
  for (let c = 0; c < N; c++) {
    const k = cornerOf(Q[c], R[c]);
    CORNER[c] = k;
    if (k < 0) continue;
    CORNERS[k].push(c);
    if (Math.max(Math.abs(Q[c]), Math.abs(R[c]), Math.abs(Q[c] + R[c])) === 8) APEX[k] = c;
  }
  const DIST = new Uint8Array(N * N);
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      const dq = Q[a] - Q[b];
      const dr = R[a] - R[b];
      DIST[a * N + b] = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    }
  }
  const dist = (a, b) => DIST[a * N + b];
  // Tọa độ vẽ (đơn vị = khoảng cách hai lỗ kề): x sang phải, y xuống dưới
  const xOf = (c) => Q[c] + R[c] / 2;
  const yOf = (c) => (R[c] * Math.sqrt(3)) / 2;
  const qOf = (c) => Q[c];
  const rOf = (c) => R[c];

  const encode = (from, to) => from * 128 + to;
  const fromOf = (m) => m >> 7;
  const toOf = (m) => m & 127;

  const homeOf = (g, p) => g.seats[p];
  const targetOf = (g, p) => (g.seats[p] + 3) % 6;

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

  /* ---------------- Sinh nước đi ---------------- */
  // Mảng nháp dùng chung (một luồng): đánh dấu đã thăm theo "tem" để khỏi xóa mảng mỗi lần
  const seen = new Int32Array(N);
  const dseen = new Int32Array(N);
  const queue = new Int16Array(N);
  const par = new Int16Array(N);
  let stamp = 0;

  /**
   * Các lỗ đến được của quân ở `from`: bước sang lỗ kề trống, hoặc chuỗi nhảy (BFS, par[] giữ đường ngắn nhất).
   * Trong lúc nhảy lỗ xuất phát coi như trống (quân đã nhấc lên). lockT ≥ 0: quân đang ở góc đích lockT
   * thì chỉ được dừng trong góc đó. Đẩy vào `out` (mã nước nếu withFrom, không thì số lỗ).
   */
  function reach(board, from, lockT, out, withFrom) {
    stamp++;
    const locked = lockT >= 0 && CORNER[from] === lockT;
    const me = board[from];
    board[from] = EMPTY;
    seen[from] = stamp;
    dseen[from] = stamp;
    const base = withFrom ? from * 128 : 0;
    for (let d = 0; d < 6; d++) {
      const n = NB[from * 6 + d];
      if (n >= 0 && board[n] === EMPTY && (!locked || CORNER[n] === lockT)) {
        dseen[n] = stamp;
        par[n] = from;
        out.push(base + n);
      }
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = from;
    while (head < tail) {
      const c = queue[head++];
      for (let d = 0; d < 6; d++) {
        const m = NB[c * 6 + d];
        if (m < 0 || board[m] === EMPTY) continue;
        const l = NB[m * 6 + d];
        if (l < 0 || board[l] !== EMPTY || seen[l] === stamp) continue;
        seen[l] = stamp;
        queue[tail++] = l;
        if (dseen[l] !== stamp) {
          dseen[l] = stamp;
          par[l] = c;
          if (!locked || CORNER[l] === lockT) out.push(base + l);
        }
      }
    }
    board[from] = me;
  }

  /** Mọi nước của người p trên bàn (mảng mã nước). */
  function genMoves(board, p, tgt, out) {
    for (let c = 0; c < N; c++) if (board[c] === p) reach(board, c, tgt, out, true);
    return out;
  }

  const legalMoves = (g) => (g.winner != null ? [] : genMoves(g.board, g.turn, targetOf(g, g.turn), []));

  /** Các lỗ quân ở `from` đi tới được (quân của bên đang tới lượt); không phải quân đó thì []. */
  function movesFrom(g, from) {
    if (g.winner != null || from < 0 || from >= N || g.board[from] !== g.turn) return [];
    const out = [];
    reach(g.board, from, targetOf(g, g.turn), out, false);
    return out;
  }

  /** Đường đi từng bước của nước from → to (mảng lỗ, gồm cả hai đầu); không đi được thì null. */
  function pathOf(g, from, to) {
    const p = g.board[from];
    if (p == null || p < 0) return null;
    const out = [];
    reach(g.board, from, targetOf(g, p), out, false);
    if (out.indexOf(to) < 0) return null;
    const path = [to];
    let c = to;
    while (c !== from) {
      c = par[c];
      path.push(c);
    }
    return path.reverse();
  }

  /* ---------------- Thắng ---------------- */
  /**
   * Người p đã thắng chưa: mọi lỗ góc đích đều có quân, và quân lạ trong đó chỉ có thể là quân của
   * chủ góc (người có góc nhà ở đó) khi chủ góc đã đi đủ HOME_LIMIT lượt (luật chống chiếm góc).
   * Trả 0 (chưa), 1 (về đủ 10 quân), 2 (thắng nhờ luật chống chiếm góc).
   */
  function wonBy(board, seats, turns, p) {
    const T = (seats[p] + 3) % 6;
    const owner = seats.indexOf(T);
    const cells = CORNERS[T];
    let own = 0;
    for (let i = 0; i < cells.length; i++) {
      const v = board[cells[i]];
      if (v === p) own++;
      else if (v === EMPTY || v !== owner || turns[owner] < HOME_LIMIT) return 0;
    }
    return own === PIECES ? 1 : 2;
  }

  /* ---------------- Ván ---------------- */
  function newGame(opts) {
    const o = opts || {};
    const n = o.players === 3 ? 3 : 2;
    const seats = SEATS[n].slice();
    const board = new Int8Array(N).fill(EMPTY);
    seats.forEach((k, p) => CORNERS[k].forEach((c) => { board[c] = p; }));
    return {
      seats,
      board,
      turn: 0,
      ply: 0,
      turns: seats.map(() => 0),
      last: null,
      winner: null,
      reason: null,
      seed: (o.seed != null ? o.seed : (Math.random() * 4294967296)) >>> 0,
    };
  }

  /** Thế cờ tự bày (cho test): pieces = mảng [lỗ, người]; không kiểm số quân. */
  function setup(o) {
    const n = o.players === 3 ? 3 : 2;
    const board = new Int8Array(N).fill(EMPTY);
    o.pieces.forEach(([c, p]) => { board[c] = p; });
    return {
      seats: SEATS[n].slice(),
      board,
      turn: o.turn || 0,
      ply: o.ply || 0,
      turns: o.turns ? o.turns.slice() : SEATS[n].map(() => 0),
      last: null,
      winner: null,
      reason: null,
      seed: (o.seed || 1) >>> 0,
    };
  }

  /** Đi nước m (mã nước) cho bên đang tới lượt; sai luật thì trả null. Trả ván mới (không đụng ván cũ). */
  function play(g, m) {
    if (g.winner != null || !Number.isInteger(m)) return null;
    const p = g.turn;
    const from = fromOf(m);
    const to = toOf(m);
    if (from >= N || to >= N || g.board[from] !== p) return null;
    const path = pathOf(g, from, to);
    if (!path) return null;
    const board = Int8Array.from(g.board);
    board[from] = EMPTY;
    board[to] = p;
    const turns = g.turns.slice();
    turns[p]++;
    const next = { seats: g.seats, board, turn: p, ply: g.ply + 1, turns, last: { p, path }, winner: null, reason: null, seed: g.seed };
    settle(next, p);
    return next;
  }

  /** Sau nước của p: xét thắng (p trước, rồi lần lượt người sau), hết lượt thì hòa, rồi chuyển lượt (bỏ lượt người hết nước). */
  function settle(g, p) {
    const n = g.seats.length;
    for (let i = 0; i < n; i++) {
      const q = (p + i) % n;
      const w = wonBy(g.board, g.seats, g.turns, q);
      if (w) {
        g.winner = q;
        g.reason = w === 1 ? 'home' : 'squat';
        return;
      }
    }
    if (g.turns.every((t) => t >= TURN_LIMIT)) {
      g.winner = DRAW;
      g.reason = 'limit';
      return;
    }
    for (let i = 1; i <= n; i++) {
      const q = (p + i) % n;
      if (genMoves(g.board, q, (g.seats[q] + 3) % 6, []).length) {
        g.turn = q;
        return;
      }
      g.turns[q]++; // hết nước: bỏ lượt (vẫn tính là một lượt)
    }
    g.winner = DRAW;
    g.reason = 'stuck';
  }

  /** Số quân của p đã nằm trong góc đích / còn trong góc nhà. */
  function inTarget(g, p) {
    const T = targetOf(g, p);
    return CORNERS[T].reduce((a, c) => a + (g.board[c] === p ? 1 : 0), 0);
  }
  function inHome(g, p) {
    const H = homeOf(g, p);
    return CORNERS[H].reduce((a, c) => a + (g.board[c] === p ? 1 : 0), 0);
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const boardString = (g) => Array.from(g.board, (v) => (v < 0 ? '.' : String(v))).join('');

  function toJSON(g) {
    return {
      v: VERSION,
      players: g.seats.length,
      board: boardString(g),
      turn: g.turn,
      ply: g.ply,
      turns: g.turns.slice(),
      last: g.last ? { p: g.last.p, path: g.last.path.slice() } : null,
      winner: g.winner,
      reason: g.reason,
      seed: g.seed,
    };
  }

  const isNat = (v) => Number.isInteger(v) && v >= 0;
  const REASONS = ['home', 'squat', 'limit', 'stuck'];

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const n = raw.players;
    if (n !== 2 && n !== 3) return null;
    if (typeof raw.board !== 'string' || raw.board.length !== N) return null;
    const board = new Int8Array(N);
    const count = [0, 0, 0];
    for (let c = 0; c < N; c++) {
      const ch = raw.board[c];
      if (ch === '.') {
        board[c] = EMPTY;
        continue;
      }
      const p = ch.charCodeAt(0) - 48;
      if (!(p >= 0 && p < n)) return null;
      board[c] = p;
      count[p]++;
    }
    for (let p = 0; p < n; p++) if (count[p] !== PIECES) return null;
    if (!Number.isInteger(raw.turn) || raw.turn < 0 || raw.turn >= n) return null;
    if (!isNat(raw.ply) || !isNat(raw.seed) || raw.seed > 0xffffffff) return null;
    if (!Array.isArray(raw.turns) || raw.turns.length !== n || !raw.turns.every(isNat)) return null;
    let last = null;
    if (raw.last != null) {
      const l = raw.last;
      if (typeof l !== 'object' || !Number.isInteger(l.p) || l.p < 0 || l.p >= n) return null;
      if (!Array.isArray(l.path) || l.path.length < 2 || !l.path.every((c) => Number.isInteger(c) && c >= 0 && c < N)) return null;
      if (board[l.path[l.path.length - 1]] !== l.p) return null;
      last = { p: l.p, path: l.path.slice() };
    }
    let winner = null;
    let reason = null;
    if (raw.winner != null) {
      if (!Number.isInteger(raw.winner) || raw.winner < DRAW || raw.winner >= n || REASONS.indexOf(raw.reason) < 0) return null;
      winner = raw.winner;
      reason = raw.reason;
    }
    const g = { seats: SEATS[n].slice(), board, turn: raw.turn, ply: raw.ply, turns: raw.turns.slice(), last, winner, reason, seed: raw.seed };
    // Ván đang chơi mà bên tới lượt hết nước là dữ liệu sai (settle đã bỏ lượt khi đi)
    if (winner == null && !legalMoves(g).length) return null;
    return g;
  }

  /* ---------------- Máy ---------------- */
  const WIN = 100000;
  const free = new Int16Array(PIECES);
  const outs = new Int16Array(PIECES);

  /**
   * Chi phí về đích của người p (càng nhỏ càng gần thắng): quân trong góc đích tính khoảng cách tới
   * đỉnh góc; quân ngoài tính đường ngắn nhất qua một lỗ đích còn trống / có quân lạ (khoảng cách tới
   * lỗ + độ sâu của lỗ). Lỗ đích đang bị chủ góc chiếm sau lượt 30 coi như đã lấp (luật chống chiếm
   * góc): bỏ chi phí của bấy nhiêu quân ngoài xa nhất (thừa). Về đủ thì chi phí = 20 (hoặc ít hơn khi có
   * quân chiếm góc). full: cộng phạt quân tụt lại và quân còn ở nhà.
   */
  function cost(board, p, seats, turns, full) {
    const T = (seats[p] + 3) % 6;
    const H = seats[p];
    const apex = APEX[T];
    const cells = CORNERS[T];
    const owner = seats.indexOf(T);
    const squatter = owner >= 0 && turns[owner] >= HOME_LIMIT ? owner : -2;
    let nf = 0;
    let held = 0;
    for (let i = 0; i < cells.length; i++) {
      const v = board[cells[i]];
      if (v === squatter) held++;
      else if (v !== p) free[nf++] = cells[i];
    }
    let sum = 0;
    let no = 0;
    let home = 0;
    for (let c = 0; c < N; c++) {
      if (board[c] !== p) continue;
      let v;
      if (CORNER[c] === T) {
        v = DIST[c * N + apex];
      } else {
        v = 99;
        const row = c * N;
        for (let i = 0; i < nf; i++) {
          const h = free[i];
          const x = DIST[row + h] + DIST[h * N + apex];
          if (x < v) v = x;
        }
        outs[no++] = v;
        if (CORNER[c] === H) home++;
      }
      sum += v;
    }
    let worst = 0;
    if (no) {
      // Sắp giảm dần (≤ 10 phần tử); bỏ `held` quân xa nhất vì lỗ của chúng đã được tính là lấp
      for (let i = 1; i < no; i++) {
        const x = outs[i];
        let j = i - 1;
        while (j >= 0 && outs[j] < x) {
          outs[j + 1] = outs[j];
          j--;
        }
        outs[j + 1] = x;
      }
      for (let i = 0; i < held && i < no; i++) sum -= outs[i];
      worst = held < no ? outs[held] : 0;
    }
    if (!full) return sum;
    // Phạt quân tụt lại: quân xa nhất còn xa hơn mức trung bình nhiều thì khó có "thang" để nhảy về sau
    const avg = sum / PIECES;
    let pen = Math.max(0, worst - avg - 3) * 0.8;
    // Phạt quân còn trong góc nhà: càng gần lượt 30 (luật chống chiếm góc) phạt càng nặng
    const t = turns[p];
    if (home && t >= 12) pen += home * (3 + (t - 12) * 0.8);
    return sum + pen;
  }

  /**
   * Thứ tự xét nước: nước làm giảm chi phí của chính quân được đi nhiều nhất trước (chi phí một lỗ như
   * trong cost(), tính với các lỗ đích còn trống của thế hiện tại). Dùng để sắp và cắt tỉa trong tìm kiếm.
   */
  const ofree = new Int16Array(PIECES);
  function ordered(moves, board, p, seats, turns) {
    const T = (seats[p] + 3) % 6;
    const apex = APEX[T];
    const cells = CORNERS[T];
    const owner = seats.indexOf(T);
    const squatter = owner >= 0 && turns[owner] >= HOME_LIMIT ? owner : -2;
    let nf = 0;
    for (let i = 0; i < cells.length; i++) {
      const v = board[cells[i]];
      if (v !== p && v !== squatter) ofree[nf++] = cells[i];
    }
    const val = (c) => {
      if (CORNER[c] === T) return DIST[c * N + apex];
      let v = 99;
      for (let i = 0; i < nf; i++) {
        const h = ofree[i];
        const x = DIST[c * N + h] + DIST[h * N + apex];
        if (x < v) v = x;
      }
      return v;
    };
    const keyed = moves.map((m) => [val(fromOf(m)) - val(toOf(m)), m]);
    keyed.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return keyed.map((k) => k[1]);
  }

  /** Mức Dễ: tham lam, chọn nước giảm chi phí nhiều nhất (bằng nhau thì ngẫu nhiên theo hạt giống). */
  function greedy(g, moves, rng) {
    const b = Int8Array.from(g.board);
    const p = g.turn;
    let best = [];
    let bestV = -Infinity;
    for (const m of moves) {
      const f = fromOf(m);
      const t = toOf(m);
      b[f] = EMPTY;
      b[t] = p;
      const v = -cost(b, p, g.seats, g.turns, false);
      b[t] = EMPTY;
      b[f] = p;
      if (v > bestV + 1e-9) {
        bestV = v;
        best = [m];
      } else if (v > bestV - 1e-9) {
        best.push(m);
      }
    }
    return best[Math.floor(rng() * best.length)];
  }

  /**
   * Nhìn trước hai nước của mình (coi như đối thủ đứng yên): điểm của nước đầu = chi phí sau nước tiếp
   * theo tốt nhất (xét MED_BEAM nước giảm chi phí nhiều nhất), cộng chút chi phí sau nước đầu để phân định.
   * full: dùng chi phí có phạt (mức Khó khi ba người chơi).
   */
  const MED_BEAM = 14;
  function lookahead(g, moves, rng, full) {
    const b = Int8Array.from(g.board);
    const p = g.turn;
    const T = targetOf(g, p);
    const turns = g.turns.slice();
    let best = moves[0];
    let bestV = Infinity;
    for (const m of moves) {
      const f = fromOf(m);
      const t = toOf(m);
      b[f] = EMPTY;
      b[t] = p;
      turns[p]++;
      let v;
      if (wonBy(b, g.seats, turns, p)) {
        v = -WIN;
      } else {
        const c1 = cost(b, p, g.seats, turns, full);
        let c2 = c1;
        const next = ordered(genMoves(b, p, T, []), b, p, g.seats, turns);
        const lim = Math.min(next.length, MED_BEAM);
        for (let i = 0; i < lim; i++) {
          const m2 = next[i];
          const f2 = fromOf(m2);
          const t2 = toOf(m2);
          b[f2] = EMPTY;
          b[t2] = p;
          turns[p]++;
          const c = wonBy(b, g.seats, turns, p) ? -WIN / 2 : cost(b, p, g.seats, turns, full);
          turns[p]--;
          b[t2] = EMPTY;
          b[f2] = p;
          if (c < c2) c2 = c;
        }
        v = c2 + c1 * 0.05 + rng() * 0.3;
      }
      turns[p]--;
      b[t] = EMPTY;
      b[f] = p;
      if (v < bestV) {
        bestV = v;
        best = m;
      }
    }
    return best;
  }

  /**
   * Mức Khó (hai người): negamax alpha-beta độ sâu HARD_DEPTH (mình - đối thủ - mình - đối thủ), gốc xét mọi nước,
   * nút trong chỉ xét HARD_BEAM nước giảm chi phí nhiều nhất (cắt tỉa). Đánh giá = OPP_W × chi phí có phạt của đối thủ - chi phí có phạt của mình.
   */
  const HARD_DEPTH = 4;
  const HARD_BEAM = 10;
  // Trọng số chi phí của đối thủ < 1: máy ưu tiên tự tiến hơn là đứng chặn (tránh hai bên cùng chặn nhau mãi)
  const OPP_W = 0.85;
  function negamax(ctx, p, depth, alpha, beta) {
    const { b, seats, turns } = ctx;
    const o = 1 - p;
    if (depth === 0) return OPP_W * cost(b, o, seats, turns, true) - cost(b, p, seats, turns, true);
    ctx.nodes++;
    const T = (seats[p] + 3) % 6;
    let moves = ordered(genMoves(b, p, T, []), b, p, seats, turns);
    if (!moves.length) return -negamax(ctx, o, depth - 1, -beta, -alpha);
    if (moves.length > HARD_BEAM) moves = moves.slice(0, HARD_BEAM);
    let best = -Infinity;
    for (const m of moves) {
      const f = fromOf(m);
      const t = toOf(m);
      b[f] = EMPTY;
      b[t] = p;
      turns[p]++;
      const v = wonBy(b, seats, turns, p) ? WIN + depth : -negamax(ctx, o, depth - 1, -beta, -alpha);
      turns[p]--;
      b[t] = EMPTY;
      b[f] = p;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  function hardSearch(g, moves, rng) {
    const p = g.turn;
    const ctx = { b: Int8Array.from(g.board), seats: g.seats, turns: g.turns.slice(), nodes: 0 };
    const list = ordered(moves, ctx.b, p, g.seats, ctx.turns);
    let best = list[0];
    let bestV = -Infinity;
    let alpha = -Infinity;
    for (const m of list) {
      const f = fromOf(m);
      const t = toOf(m);
      ctx.b[f] = EMPTY;
      ctx.b[t] = p;
      ctx.turns[p]++;
      // Nhiễu rất nhỏ để các nước ngang nhau không luôn chọn giống hệt
      const v = wonBy(ctx.b, g.seats, ctx.turns, p) ? WIN + HARD_DEPTH : -negamax(ctx, 1 - p, HARD_DEPTH - 1, -Infinity, -alpha + 0.05) + rng() * 0.05;
      ctx.turns[p]--;
      ctx.b[t] = EMPTY;
      ctx.b[f] = p;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
      if (v > alpha) alpha = v;
    }
    return best;
  }

  /** Máy chọn nước cho bên đang tới lượt. opts: { level, seed }. Trả { move } (null nếu hết nước). */
  function chooseMove(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    const seed = o.seed != null ? o.seed : (g.seed ^ Math.imul(g.ply + 1, 0x9e3779b1));
    const rng = mulberry32(seed);
    const moves = legalMoves(g);
    if (!moves.length) return { move: null };
    // Mức nào cũng đi nước thắng ngay nếu có
    const b = Int8Array.from(g.board);
    const turns = g.turns.slice();
    const p = g.turn;
    turns[p]++;
    for (const m of moves) {
      const f = fromOf(m);
      const t = toOf(m);
      b[f] = EMPTY;
      b[t] = p;
      const w = wonBy(b, g.seats, turns, p);
      b[t] = EMPTY;
      b[f] = p;
      if (w) return { move: m };
    }
    if (level === 'easy') return { move: greedy(g, moves, rng) };
    if (level === 'medium') return { move: lookahead(g, moves, rng, false) };
    if (g.seats.length !== 2) return { move: lookahead(g, moves, rng, true) };
    return { move: hardSearch(g, moves, rng) };
  }

  return {
    VERSION, EMPTY, DRAW, PIECES, HOME_LIMIT, TURN_LIMIT, LEVELS, SEATS, N, CORNERS, APEX, CORNER,
    cellAt, qOf, rOf, xOf, yOf, dist, neighbor: (c, d) => NB[c * 6 + d],
    encode, fromOf, toOf, homeOf, targetOf, mulberry32,
    newGame, setup, legalMoves, movesFrom, pathOf, play, inTarget, inHome, boardString,
    toJSON, fromJSON, cost: (g, p, full) => cost(g.board, p, g.seats, g.turns, !!full), chooseMove,
    wonBy: (g, p) => wonBy(g.board, g.seats, g.turns, p),
  };
}

(function (root) {
  const api = CoNhayFactory();
  api.factory = CoNhayFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
