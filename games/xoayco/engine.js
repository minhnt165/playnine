/* =====================================================================
 * Xoay Cờ - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong
 *   Web Worker: toàn bộ engine nằm trong hàm XoayCoFactory để app.js dựng lại mã nguồn
 *   cho worker qua GameEngine.factory.toString() (chạy được cả khi mở bằng file://).
 *
 * Bàn 6×6 gồm 4 góc 3×3, ô = hàng * 6 + cột (hàng 0 ở trên).
 *   - Góc: 0 trên trái, 1 trên phải, 2 dưới trái, 3 dưới phải
 *   - Bên: 0 = Trắng (đi trước), 1 = Đen; trên bàn quân Trắng là 1, quân Đen là 2, ô trống 0
 *   - Một nước = đặt một quân vào ô trống rồi xoay một góc 90°: mã hóa ô * 8 + góc * 2 + chiều
 *     (chiều 0 = theo kim đồng hồ / sang phải, 1 = ngược kim đồng hồ / sang trái)
 *   - Thắng / hòa chỉ xét SAU khi xoay: chỉ mình có 5 liền hàng (ngang, dọc, chéo) là thắng,
 *     chỉ đối thủ có 5 là thua (tự xoay ra 5 cho đối thủ), cả hai cùng có 5 là hòa,
 *     đầy bàn (36 quân) mà không ai có 5 là hòa
 *   - Máy: Dễ (thắng ngay / chặn thua ngay, còn lại ngẫu nhiên), Vừa (alpha-beta 2 nước),
 *     Khó (đào sâu dần, sắp nước theo đánh giá tĩnh, đánh giá chuỗi, giới hạn thời gian)
 * ===================================================================== */
function XoayCoFactory() {
  'use strict';

  const SIZE = 6, N = 36;
  const FIRST = 0, SECOND = 1, DRAW = 2; // winner = 2 khi hòa
  const CW = 0, CCW = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const CHARS = '.WB'; // chữ trong chuỗi bàn: ô trống, quân Trắng, quân Đen
  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const idx = (r, c) => r * SIZE + c;
  const rowOf = (s) => (s / SIZE) | 0;
  const colOf = (s) => s % SIZE;
  const quadOf = (s) => (rowOf(s) >= 3 ? 2 : 0) + (colOf(s) >= 3 ? 1 : 0);
  const encode = (cell, q, dir) => cell * 8 + q * 2 + dir;
  const cellOf = (m) => m >> 3;
  const quadOfMove = (m) => (m >> 1) & 3;
  const dirOf = (m) => m & 1;

  /* ---------------- Bảng dựng sẵn ---------------- */

  // QC[q*9 + k]: ô thứ k (hàng i = k / 3, cột j = k % 3) của góc q
  const QC = new Int8Array(36);
  for (let q = 0; q < 4; q++) {
    const r0 = (q >> 1) * 3, c0 = (q & 1) * 3;
    for (let k = 0; k < 9; k++) QC[q * 9 + k] = idx(r0 + ((k / 3) | 0), c0 + (k % 3));
  }
  // DEST[(q*2 + chiều)*9 + k]: ô thứ k của góc q đi tới ô nào sau khi xoay
  //   theo kim đồng hồ (i, j) -> (j, 2 - i); ngược kim đồng hồ (i, j) -> (2 - j, i)
  const DEST = new Int8Array(72);
  for (let q = 0; q < 4; q++) {
    for (let k = 0; k < 9; k++) {
      const i = (k / 3) | 0, j = k % 3;
      DEST[(q * 2 + CW) * 9 + k] = QC[q * 9 + j * 3 + (2 - i)];
      DEST[(q * 2 + CCW) * 9 + k] = QC[q * 9 + (2 - j) * 3 + i];
    }
  }
  /** Ô s đi tới đâu khi xoay góc q theo chiều dir (ô ngoài góc đứng yên). */
  function rotateCell(s, q, dir) {
    for (let k = 0; k < 9; k++) if (QC[q * 9 + k] === s) return DEST[(q * 2 + dir) * 9 + k];
    return s;
  }

  // 32 đường 5 ô: ngang 12, dọc 12, chéo 8. LF: phẳng, đường i chiếm LF[i*5 .. i*5+4]
  const LINES = [];
  const five = (f) => [0, 1, 2, 3, 4].map(f);
  for (let r = 0; r < SIZE; r++) for (let c = 0; c <= 1; c++) LINES.push(five((k) => idx(r, c + k)));
  for (let c = 0; c < SIZE; c++) for (let r = 0; r <= 1; r++) LINES.push(five((k) => idx(r + k, c)));
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c <= 1; c++) {
      LINES.push(five((k) => idx(r + k, c + k)));
      LINES.push(five((k) => idx(r + k, 5 - c - k)));
    }
  }
  const NL = LINES.length;
  const LF = new Int8Array(NL * 5);
  LINES.forEach((l, i) => l.forEach((s, k) => { LF[i * 5 + k] = s; }));

  /* ---------------- PRNG ---------------- */

  /** mulberry32: dãy số [0, 1) tất định theo hạt giống. */
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

  /* ---------------- Luật ---------------- */

  /** Xoay góc q tại chỗ trên mảng bàn b (mảng thường hoặc Int8Array). */
  const TMP = new Int8Array(9);
  function rotateInPlace(b, q, dir) {
    const base = q * 9, d = (q * 2 + dir) * 9;
    for (let k = 0; k < 9; k++) TMP[k] = b[QC[base + k]];
    for (let k = 0; k < 9; k++) b[DEST[d + k]] = TMP[k];
  }

  /** Bit 1: Trắng có 5 liền hàng, bit 2: Đen có 5 (3 = cả hai). */
  function fivesMask(b) {
    let m = 0;
    for (let o = 0; o < NL * 5; o += 5) {
      const v = b[LF[o]];
      if (v && b[LF[o + 1]] === v && b[LF[o + 2]] === v && b[LF[o + 3]] === v && b[LF[o + 4]] === v) {
        m |= v;
        if (m === 3) break;
      }
    }
    return m;
  }

  /** Các đường 5 đã đủ của bên side (chỉ số trong LINES). */
  function fiveLines(b, side) {
    const v = side + 1, out = [];
    for (let i = 0; i < NL; i++) {
      const o = i * 5;
      if (b[LF[o]] === v && b[LF[o + 1]] === v && b[LF[o + 2]] === v && b[LF[o + 3]] === v && b[LF[o + 4]] === v) out.push(i);
    }
    return out;
  }

  function newGame() {
    return { board: new Array(N).fill(0), turn: FIRST, ply: 0, winner: null, reason: null, lines: [], last: null };
  }

  /** Xét kết thúc trên bàn b sau ply nước. */
  function judge(b, ply) {
    const m = fivesMask(b);
    if (m === 3) return { winner: DRAW, reason: 'both', lines: fiveLines(b, 0).concat(fiveLines(b, 1)) };
    if (m) {
      const w = m === 1 ? FIRST : SECOND;
      return { winner: w, reason: 'five', lines: fiveLines(b, w) };
    }
    if (ply >= N) return { winner: DRAW, reason: 'full', lines: [] };
    return { winner: null, reason: null, lines: [] };
  }

  const isMove = (m) => Number.isInteger(m) && m >= 0 && m < N * 8;

  /** Mọi nước hợp lệ: mọi ô trống × 4 góc × 2 chiều (có nước cho cùng một thế, ví dụ xoay góc trống). */
  function legalMoves(g) {
    if (g.winner != null) return [];
    const out = [];
    for (let s = 0; s < N; s++) if (!g.board[s]) for (let k = 0; k < 8; k++) out.push(s * 8 + k);
    return out;
  }

  /** Góc q xoay có đổi gì không: 0 = có, 2 = xoay trái và phải như nhau (đối xứng 180°), 1 = xoay như không (đối xứng 90°). */
  function quadSymmetry(b, q) {
    const o = q * 9;
    const a0 = b[QC[o]], a2 = b[QC[o + 2]], a6 = b[QC[o + 6]], a8 = b[QC[o + 8]];
    const e1 = b[QC[o + 1]], e3 = b[QC[o + 3]], e5 = b[QC[o + 5]], e7 = b[QC[o + 7]];
    if (a0 === a2 && a2 === a8 && a8 === a6 && e1 === e5 && e5 === e7 && e7 === e3) return 1;
    if (a0 === a8 && a2 === a6 && e1 === e7 && e3 === e5) return 2;
    return 0;
  }

  /**
   * Nước khác nhau thật sự (cho máy): bỏ nước cho ra cùng thế cờ.
   * Xoay một góc đối xứng 90° (trống, chỉ có quân giữa…) = không đổi gì: giữ một nước như vậy cho mỗi ô;
   * góc đối xứng 180°: xoay trái = xoay phải, giữ một chiều.
   */
  function uniqueMovesOf(b, side, out) {
    const v = side + 1;
    out.length = 0;
    const symOther = [quadSymmetry(b, 0), quadSymmetry(b, 1), quadSymmetry(b, 2), quadSymmetry(b, 3)];
    for (let s = 0; s < N; s++) {
      if (b[s]) continue;
      b[s] = v;
      const qs = quadOf(s);
      let noop = false;
      for (let q = 0; q < 4; q++) {
        const sym = q === qs ? quadSymmetry(b, q) : symOther[q];
        if (sym === 1) {
          if (!noop) { noop = true; out.push(s * 8 + q * 2); }
        } else if (sym === 2) out.push(s * 8 + q * 2);
        else out.push(s * 8 + q * 2, s * 8 + q * 2 + 1);
      }
      b[s] = 0;
    }
    return out;
  }
  const uniqueMoves = (g) => (g.winner != null ? [] : uniqueMovesOf(g.board.slice(), g.turn, []));

  /** Đi nước m (đặt rồi xoay); nước sai luật hoặc ván đã xong thì trả null. Ván cũ không đổi. */
  function play(g, m) {
    if (g.winner != null || !isMove(m)) return null;
    const cell = cellOf(m), q = quadOfMove(m), dir = dirOf(m);
    if (g.board[cell]) return null;
    const board = g.board.slice();
    board[cell] = g.turn + 1;
    rotateInPlace(board, q, dir);
    const ply = g.ply + 1;
    const j = judge(board, ply);
    return {
      board,
      turn: 1 - g.turn,
      ply,
      winner: j.winner,
      reason: j.reason,
      lines: j.lines,
      last: { side: g.turn, cell, at: rotateCell(cell, q, dir), q, dir },
    };
  }

  /** Bàn dạng chuỗi 36 ký tự (hàng trên trước): '.' trống, 'W' Trắng, 'B' Đen. */
  const boardString = (g) => g.board.map((v) => CHARS[v]).join('');

  /** Dựng ván từ chuỗi bàn (cho test, e2e, ván lưu); lượt suy ra từ số quân. Chuỗi sai thì trả null. */
  function fromString(str) {
    if (typeof str !== 'string' || str.length !== N || !/^[.WB]+$/.test(str)) return null;
    const board = str.split('').map((ch) => CHARS.indexOf(ch));
    let w = 0, k = 0;
    for (const v of board) { if (v === 1) w++; else if (v === 2) k++; }
    if (w !== k && w !== k + 1) return null; // Trắng đi trước nên luôn bằng hoặc hơn Đen một quân
    const ply = w + k;
    const j = judge(board, ply);
    return { board, turn: ply % 2, ply, winner: j.winner, reason: j.reason, lines: j.lines, last: null };
  }

  const toJSON = (g) => ({ v: VERSION, board: boardString(g), last: g.last ? { cell: g.last.cell, q: g.last.q, dir: g.last.dir } : null });

  /** Ván lưu hỏng, khác phiên bản hoặc đã kết thúc thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const g = fromString(raw.board);
    if (!g || g.winner != null) return null;
    if (raw.last != null) {
      const l = raw.last;
      if (typeof l !== 'object' || !Number.isInteger(l.cell) || l.cell < 0 || l.cell >= N ||
        !Number.isInteger(l.q) || l.q < 0 || l.q > 3 || (l.dir !== CW && l.dir !== CCW) || g.ply === 0) return null;
      const at = rotateCell(l.cell, l.q, l.dir);
      if (g.board[at] !== 2 - (g.ply % 2)) return null; // quân vừa đặt phải là của bên vừa đi
      g.last = { side: 1 - g.turn, cell: l.cell, at, q: l.q, dir: l.dir };
    }
    return g;
  }

  /* ---------------- Đánh giá ---------------- */

  // Trọng số theo số quân trên một đường 5 còn sống (chưa có quân đối thủ)
  const LW = [0, 1, 6, 32, 180];
  const WIN = 100000;
  const SOON = 20000; // bên tới lượt có 4 quân trên một đường còn ô trống: gần như thắng ngay

  /** Điểm thế cờ cho bên `toMove` (bên sắp đi). Đánh giá chuỗi: đếm quân trên 32 đường 5 ô. */
  function evaluate(b, toMove) {
    const me = toMove + 1;
    let sc = 0, oppFour = 0;
    for (let o = 0; o < NL * 5; o += 5) {
      let a = 0, c = 0;
      for (let k = 0; k < 5; k++) {
        const v = b[LF[o + k]];
        if (v === me) a++;
        else if (v) c++;
      }
      if (a && c) continue;
      if (a === 4) return SOON; // đặt ô còn lại rồi xoay một góc không chạm đường này
      if (c === 4) oppFour++;
      sc += LW[a] - LW[c];
    }
    // Đối thủ có từ hai đường 4 thì một nước khó chặn hết
    if (oppFour >= 2) sc -= SOON >> 2;
    return sc;
  }

  /* ---------------- Máy ---------------- */

  /**
   * Máy chọn nước cho bên tới lượt. opts: { level, seed, timeMs, maxDepth }.
   * Trả { move, depth, nodes, score, reason }.
   */
  function chooseMove(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    const rng = mulberry32(o.seed != null ? o.seed : (Math.random() * 4294967296) >>> 0);
    if (g.winner != null) return { move: null, depth: 0, nodes: 0, reason: 'over' };
    const b = Int8Array.from(g.board);
    const moves = uniqueMovesOf(b, g.turn, []);
    if (level === 'easy') return easyMove(b, g.turn, moves, rng);
    const maxDepth = o.maxDepth || (level === 'medium' ? 2 : 6);
    const timeMs = o.timeMs != null ? o.timeMs : level === 'medium' ? Infinity : 1500;
    return searchMove(b, g.turn, g.ply, moves, level, rng, timeMs, maxDepth);
  }

  /** Kết quả của nước m với bên side: 1 thắng, -1 thua (tự xoay ra 5 cho đối thủ), 0.5 hòa, 0 chưa xong. */
  function outcome(b, side, m) {
    const cell = cellOf(m), q = quadOfMove(m), dir = dirOf(m);
    b[cell] = side + 1;
    rotateInPlace(b, q, dir);
    const f = fivesMask(b);
    rotateInPlace(b, q, 1 - dir);
    b[cell] = 0;
    if (f === 3) return 0.5;
    if (f) return f === side + 1 ? 1 : -1;
    return 0;
  }

  /** Bên side có nước thắng ngay trên bàn b không. */
  function hasWin(b, side) {
    const ms = uniqueMovesOf(b, side, []);
    for (const m of ms) if (outcome(b, side, m) === 1) return true;
    return false;
  }

  /** Dễ: có nước thắng thì đi; tránh nước tự thua; đối thủ đang dọa thắng thì chặn; còn lại ngẫu nhiên. */
  function easyMove(b, side, moves, rng) {
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const safe = [];
    for (const m of moves) {
      const r = outcome(b, side, m);
      if (r === 1) return { move: m, depth: 1, nodes: moves.length, reason: 'win' };
      if (r === 0) safe.push(m);
    }
    const pool = safe.length ? safe : moves;
    if (hasWin(b, 1 - side)) {
      // Thử từng nước: sau nước đó đối thủ còn thắng ngay được không
      const blocks = pool.filter((m) => {
        const cell = cellOf(m), q = quadOfMove(m), dir = dirOf(m);
        b[cell] = side + 1;
        rotateInPlace(b, q, dir);
        const bad = hasWin(b, 1 - side);
        rotateInPlace(b, q, 1 - dir);
        b[cell] = 0;
        return !bad;
      });
      if (blocks.length) return { move: pick(blocks), depth: 2, nodes: 0, reason: 'block' };
    }
    return { move: pick(pool), depth: 0, nodes: 0, reason: 'random' };
  }

  const STOP = { stop: true };

  /**
   * Vừa / Khó: negamax alpha-beta trên bàn Int8Array (đi / hoàn tác tại chỗ).
   *   Vừa: độ sâu 2 (nước mình + nước đáp), cộng nhiễu nhỏ ở gốc nên đôi khi chọn nước kém hơn chút.
   *   Khó: đào sâu dần 1..maxDepth trong giới hạn thời gian; mọi nút từ độ sâu 2 sắp nước theo
   *        đánh giá tĩnh của thế con (nước thắng lên đầu), gốc xếp theo kết quả độ sâu trước.
   */
  function searchMove(b, side, ply0, rootMoves, level, rng, timeMs, maxDepth) {
    const deadline = Date.now() + (Number.isFinite(timeMs) ? timeMs : 1e12);
    let nodes = 0;
    let stones = ply0;

    function make(m, s) {
      b[cellOf(m)] = s + 1;
      rotateInPlace(b, quadOfMove(m), dirOf(m));
      stones++;
    }
    function unmake(m) {
      rotateInPlace(b, quadOfMove(m), 1 - dirOf(m));
      b[cellOf(m)] = 0;
      stones--;
    }
    /** Điểm (cho bên s vừa đi) nếu thế hiện tại đã kết thúc, ngược lại null. Thắng sớm hơn được điểm cao hơn. */
    function terminal(s, ply) {
      const f = fivesMask(b);
      if (f === 3) return 0;
      if (f) return f === s + 1 ? WIN - ply : -(WIN - ply);
      if (stones >= N) return 0;
      return null;
    }
    /** Chấm nhanh từng nước (đi, đánh giá tĩnh, hoàn tác) rồi xếp giảm dần. */
    function ordered(moves, s, ply) {
      const sc = new Map();
      for (const m of moves) {
        make(m, s);
        const t = terminal(s, ply);
        sc.set(m, t != null ? t : -evaluate(b, 1 - s));
        unmake(m);
      }
      return moves.slice().sort((x, y) => sc.get(y) - sc.get(x));
    }

    const bufs = [];
    function negamax(depth, alpha, beta, s, ply) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) throw STOP;
      const buf = bufs[ply] || (bufs[ply] = []);
      let moves = uniqueMovesOf(b, s, buf);
      if (!moves.length) return 0;
      if (depth >= 2) moves = ordered(moves, s, ply);
      let best = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        make(m, s);
        let v = terminal(s, ply);
        if (v == null) v = depth <= 1 ? -evaluate(b, 1 - s) : -negamax(depth - 1, -beta, -alpha, 1 - s, ply + 1);
        unmake(m);
        if (v > best) {
          best = v;
          if (v > alpha) {
            alpha = v;
            if (alpha >= beta) break;
          }
        }
      }
      return best;
    }

    /** Giá trị nước gốc m ở độ sâu depth (bên side đi m). */
    function rootValue(m, depth, alpha, beta) {
      make(m, side);
      let v = terminal(side, 0);
      if (v == null) v = depth <= 1 ? -evaluate(b, 1 - side) : -negamax(depth - 1, -beta, -alpha, 1 - side, 1);
      unmake(m);
      return v;
    }

    // Trộn gốc theo hạt giống để các nước ngang điểm không luôn ra cùng một nước
    const root = rootMoves.slice();
    for (let i = root.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = root[i]; root[i] = root[j]; root[j] = tmp;
    }

    if (level === 'medium') {
      const NOISE = 12;
      let best = root[0], bestVal = -Infinity, alpha = -Infinity;
      for (const m of ordered(root, side, 0)) {
        // Cửa sổ hạ thêm NOISE: nước kém hơn chút vẫn có điểm đúng để nhiễu chọn
        const v = rootValue(m, maxDepth, alpha - NOISE, Infinity);
        const s = v + (Math.abs(v) < SOON / 2 ? rng() * NOISE : 0);
        if (s > bestVal) { bestVal = s; best = m; }
        if (v > alpha) alpha = v;
        if (v >= WIN - 100) break;
      }
      return { move: best, depth: maxDepth, nodes, score: bestVal, reason: 'search' };
    }

    // Khó: đào sâu dần, nước tốt nhất của độ sâu trước xét trước
    let order = ordered(root, side, 0);
    let best = order[0], bestVal = 0, done = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const vals = new Map();
      let alpha = -Infinity, cur = order[0], curVal = -Infinity, stopped = false;
      try {
        for (const m of order) {
          const v = rootValue(m, depth, alpha, Infinity);
          vals.set(m, v);
          if (v > curVal) { curVal = v; cur = m; }
          if (v > alpha) alpha = v;
          if (v >= WIN - 100) break;
        }
      } catch (e) {
        if (e !== STOP) throw e;
        stopped = true;
      }
      // Hết giờ giữa chừng: nếu nước tốt nhất cũ đã xét xong ở độ sâu này thì nước tốt nhất đã xét là đáng tin
      if (stopped) {
        if (vals.has(order[0])) { best = cur; bestVal = curVal; }
        break;
      }
      best = cur;
      bestVal = curVal;
      done = depth;
      if (curVal >= WIN - 100 || curVal <= -(WIN - 100)) break; // đã thấy kết cục
      if (stones + depth >= N) break; // đã tìm tới đầy bàn
      order = order.slice().sort((x, y) => (vals.has(y) ? vals.get(y) : -Infinity) - (vals.has(x) ? vals.get(x) : -Infinity));
    }
    return { move: best, depth: done, nodes, score: bestVal, reason: 'search' };
  }

  return {
    SIZE, N, FIRST, SECOND, DRAW, CW, CCW, LEVELS, LINES, VERSION, WIN,
    idx, rowOf, colOf, quadOf, encode, cellOf, quadOfMove, dirOf, rotateCell,
    quadCells: (q) => Array.from(QC.subarray(q * 9, q * 9 + 9)),
    newGame, legalMoves, uniqueMoves, play, fromString, boardString, toJSON, fromJSON,
    fivesMask, evaluate, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = XoayCoFactory();
  api.factory = XoayCoFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
