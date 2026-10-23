/* =====================================================================
 * Cờ Đơn - Engine thuần (không đụng DOM, chạy được trong Node để test, nạp được trong Web Worker)
 *   - Ba bàn (= mode): 'english' (chữ thập 33 lỗ), 'european' (bát giác 37 lỗ), 'triangle' (tam giác 15 lỗ)
 *   - Một nước: quân nhảy qua một quân kề (theo các hướng của bàn) vào lỗ trống ngay sau, quân bị nhảy qua bị bỏ
 *   - Thắng khi còn đúng một quân; hết nước nhảy mà còn nhiều quân là kẹt
 *   - Ván lưu chỉ giữ lịch sử nước đi, khôi phục bằng cách đi lại từ thế đầu (ván lưu hỏng bị phát hiện)
 *   - Bộ giải: DFS, nhớ các thế "chết" theo dạng chuẩn hóa đối xứng (8 phép cho bàn vuông, 6 cho tam giác);
 *     có giới hạn số nút / thời gian để gợi ý không treo trình duyệt, gọi lại thì đi tiếp nhờ bộ nhớ thế chết
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // Tam giác (hàng r, cột c với 0 ≤ c ≤ r): 3 phương = ngang, chéo xuống trái (r+1, c), chéo xuống phải (r+1, c+1)
  const TRI_DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1]];

  /** Bàn vuông 7x7 theo khoảng cột của từng hàng; 8 phép đối xứng quanh tâm (3, 3). */
  function squareBoard(id, ranges, startRC) {
    const holes = [];
    ranges.forEach(([c0, c1], r) => {
      for (let c = c0; c <= c1; c++) holes.push({ r, c, x: c + 0.5, y: r + 0.5 });
    });
    const tf = [
      (r, c) => [r, c], (r, c) => [c, 6 - r], (r, c) => [6 - r, 6 - c], (r, c) => [6 - c, r],
      (r, c) => [r, 6 - c], (r, c) => [6 - r, c], (r, c) => [c, r], (r, c) => [6 - c, 6 - r],
    ];
    return finish({ id, span: 7, holes, dirs: ORTHO, tf, start: startRC, centre: [3, 3] });
  }

  /** Tam giác 5 hàng (lỗ cách nhau 1 đơn vị); 6 phép đối xứng = hoán vị ba tọa độ (c, r − c, 4 − r). */
  function triangleBoard(id, startRC) {
    const holes = [];
    const h = Math.sqrt(3) / 2;
    // Khung vẽ 5.4 x 5.4 (rộng hơn 5 lỗ một chút để viền gỗ quanh lỗ góc không tràn), căn giữa
    const top = (5.4 - 4 * h) / 2;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c <= r; c++) holes.push({ r, c, x: c - r / 2 + 2.7, y: top + r * h });
    }
    const fromBary = (a, b, z) => [4 - z, a]; // (a = c, b = r − c, z = 4 − r) → (r, c)
    const tf = [
      (r, c) => fromBary(c, r - c, 4 - r), (r, c) => fromBary(r - c, c, 4 - r),
      (r, c) => fromBary(4 - r, r - c, c), (r, c) => fromBary(c, 4 - r, r - c),
      (r, c) => fromBary(r - c, 4 - r, c), (r, c) => fromBary(4 - r, c, r - c),
    ];
    return finish({ id, span: 5.4, holes, dirs: TRI_DIRS, tf, start: startRC, centre: null });
  }

  /** Tính danh sách nước nhảy [từ, qua, tới] và hoán vị đối xứng theo chỉ số lỗ. */
  function finish(b) {
    const index = new Map(b.holes.map((h, i) => [h.r + ',' + h.c, i]));
    const at = (r, c) => (index.has(r + ',' + c) ? index.get(r + ',' + c) : -1);
    const jumps = [];
    b.holes.forEach((h, i) => {
      b.dirs.forEach(([dr, dc]) => {
        const over = at(h.r + dr, h.c + dc);
        const to = at(h.r + 2 * dr, h.c + 2 * dc);
        if (over >= 0 && to >= 0) jumps.push([i, over, to]);
      });
    });
    const syms = b.tf.map((f) => b.holes.map((h) => {
      const [r, c] = f(h.r, h.c);
      return at(r, c);
    }));
    return {
      id: b.id,
      n: b.holes.length,
      span: b.span,
      holes: b.holes,
      jumps,
      syms,
      start: at(b.start[0], b.start[1]),
      centre: b.centre ? at(b.centre[0], b.centre[1]) : -1,
      at,
    };
  }

  const ARM = [2, 4];
  const FULL = [0, 6];
  const BOARDS = {
    english: squareBoard('english', [ARM, ARM, FULL, FULL, FULL, ARM, ARM], [3, 3]),
    // Bàn châu Âu bỏ trống ở tâm thì không giải được về một quân (bất biến lớp chẵn lẻ);
    // bỏ trống lỗ góc trái của hàng trên cùng (0, 2) thì giải được (test.js chứng minh bằng bộ giải)
    european: squareBoard('european', [ARM, [1, 5], FULL, FULL, FULL, [1, 5], ARM], [0, 2]),
    triangle: triangleBoard('triangle', [0, 0]),
  };
  const BOARD_IDS = Object.keys(BOARDS);

  const board = (id) => (Object.prototype.hasOwnProperty.call(BOARDS, id) ? BOARDS[id] : null);

  /* ---------------- Luật ---------------- */

  function startPegs(b) {
    const pegs = new Array(b.n).fill(1);
    pegs[b.start] = 0;
    return pegs;
  }

  /** Ván mới: mọi lỗ có quân trừ lỗ khởi đầu. made = số nước đã đi (kể cả đã hoàn tác), assisted = đã xem gợi ý. */
  function newGame(boardId) {
    const b = board(boardId);
    if (!b) throw new Error('unknown board ' + boardId);
    return { board: b.id, pegs: startPegs(b), history: [], made: 0, assisted: false };
  }

  const pegCount = (g) => g.pegs.reduce((n, p) => n + p, 0);
  const canJump = (pegs, j) => pegs[j[0]] === 1 && pegs[j[1]] === 1 && pegs[j[2]] === 0;

  /** Các nước hợp lệ (chỉ số trong board.jumps); có `from` thì chỉ các nước của quân ở lỗ đó. */
  function legalMoves(g, from) {
    const out = [];
    board(g.board).jumps.forEach((j, k) => {
      if ((from == null || j[0] === from) && canJump(g.pegs, j)) out.push(k);
    });
    return out;
  }

  /** Lỗ đích hợp lệ của quân ở `from`. */
  const targets = (g, from) => legalMoves(g, from).map((k) => board(g.board).jumps[k][2]);

  /** Nước nhảy hợp lệ từ `from` tới `to` (chỉ số trong board.jumps) hoặc -1. */
  function findJump(g, from, to) {
    const jumps = board(g.board).jumps;
    for (let k = 0; k < jumps.length; k++) {
      if (jumps[k][0] === from && jumps[k][2] === to) return canJump(g.pegs, jumps[k]) ? k : -1;
    }
    return -1;
  }

  const isWon = (g) => pegCount(g) === 1;
  const isStuck = (g) => !isWon(g) && legalMoves(g).length === 0;
  const isOver = (g) => isWon(g) || isStuck(g);
  /** Kết thúc hoàn hảo: bàn Kiểu Anh và quân cuối cùng nằm ở tâm. */
  function isPerfect(g) {
    const b = board(g.board);
    return b.id === 'english' && isWon(g) && g.pegs[b.centre] === 1;
  }

  /** Đi nước số k; nước không hợp lệ thì trả lại đúng g. */
  function applyJump(g, k) {
    const j = board(g.board).jumps[k];
    if (!j || !canJump(g.pegs, j)) return g;
    const pegs = g.pegs.slice();
    pegs[j[0]] = 0;
    pegs[j[1]] = 0;
    pegs[j[2]] = 1;
    return { board: g.board, pegs, history: g.history.concat(k), made: g.made + 1, assisted: g.assisted };
  }

  /** Nhảy quân ở `from` tới lỗ `to`. */
  function move(g, from, to) {
    const k = findJump(g, from, to);
    return k < 0 ? g : applyJump(g, k);
  }

  /** Hoàn tác nước cuối (không giới hạn, không tính là trợ giúp). */
  function undo(g) {
    if (!g.history.length) return g;
    const j = board(g.board).jumps[g.history[g.history.length - 1]];
    const pegs = g.pegs.slice();
    pegs[j[0]] = 1;
    pegs[j[1]] = 1;
    pegs[j[2]] = 0;
    return { board: g.board, pegs, history: g.history.slice(0, -1), made: g.made, assisted: g.assisted };
  }

  /** Về thế đầu, vẫn là cùng ván (giữ made / assisted). */
  function restart(g) {
    return { board: g.board, pegs: startPegs(board(g.board)), history: [], made: g.made, assisted: g.assisted };
  }

  const markAssisted = (g) => (g.assisted ? g : Object.assign({}, g, { assisted: true }));

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({ v: VERSION, board: g.board, history: g.history.slice(), made: g.made, assisted: g.assisted });

  /** Đi lại lịch sử từ thế đầu; nước nào không hợp lệ hoặc dữ liệu hỏng thì trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const b = board(raw.board);
    if (!b || !Array.isArray(raw.history) || typeof raw.assisted !== 'boolean') return null;
    if (!Number.isInteger(raw.made) || raw.made < raw.history.length) return null;
    let g = newGame(b.id);
    for (const k of raw.history) {
      if (!Number.isInteger(k)) return null;
      const next = applyJump(g, k);
      if (next === g) return null;
      g = next;
    }
    g.made = raw.made;
    g.assisted = raw.assisted;
    return g;
  }

  /* ---------------- Bộ giải ---------------- */

  const ABORT = {};

  /**
   * Bộ giải cho một bàn, nhớ thế chết qua các lần gọi (chỉ ghi thế chết khi đã duyệt hết nhánh, nên dừng giữa
   * chừng vì hết hạn mức vẫn an toàn và lần gọi sau đi tiếp được).
   * solve(pegs, { maxNodes, maxMs, now, end }) →
   *   { status: 'solved', moves: [k...] } | { status: 'dead' } | { status: 'unknown', nodes }
   * `end` (tùy chọn): bắt buộc quân cuối nằm ở lỗ đó (dùng để chứng minh có ván hoàn hảo).
   * hint(pegs, opts) → { status: 'solved', move: k } | { status: 'dead' } | { status: 'unknown' }: nước đầu của một
   *   lời giải; mọi thế trên lời giải tìm được đều được nhớ, nên đi theo gợi ý thì lần gợi ý sau trả lời ngay.
   * solverOpts.maxMemo: số thế chết tối đa được nhớ (vượt thì xóa, để bộ nhớ trình duyệt có giới hạn).
   */
  function createSolver(boardId, solverOpts) {
    const maxMemo = (solverOpts && solverOpts.maxMemo) || 1500000;
    const b = board(boardId);
    if (!b) throw new Error('unknown board ' + boardId);
    const n = b.n;
    const J = b.jumps.length;
    // Thứ tự thử nước cố định: ưu tiên nước dọn quân ở xa tâm bàn và đáp gần tâm (giảm nhiều nhất tổng bình phương
    // khoảng cách tới tâm). Thứ tự này giúp DFS tìm ra lời giải bàn châu Âu nhanh hơn hàng chục lần.
    const cx = b.holes.reduce((s, h) => s + h.x, 0) / n;
    const cy = b.holes.reduce((s, h) => s + h.y, 0) / n;
    const w = b.holes.map((h) => (h.x - cx) * (h.x - cx) + (h.y - cy) * (h.y - cy));
    const delta = (j) => w[j[2]] - w[j[0]] - w[j[1]];
    const order = b.jumps.map((j, k) => k).sort((p, q) => delta(b.jumps[p]) - delta(b.jumps[q]) || p - q);
    const JK = Int16Array.from(order);
    const JA = Int16Array.from(order, (k) => b.jumps[k][0]);
    const JB = Int16Array.from(order, (k) => b.jumps[k][1]);
    const JC = Int16Array.from(order, (k) => b.jumps[k][2]);
    // Khóa của thế = tổng 2^(chỉ số lỗ có quân), ≤ 2^37 nên vẫn là số nguyên chính xác trong double
    const pow2 = [];
    for (let i = 0; i < n; i++) pow2.push(Math.pow(2, i));
    const syms = b.syms.map((s) => Int16Array.from(s));
    const deadByEnd = new Map(); // end → Set khóa chuẩn hóa của thế chết

    function solve(start, opts) {
      const o = opts || {};
      const maxNodes = o.maxNodes || Infinity;
      const now = o.now || null;
      const deadline = now && o.maxMs ? now() + o.maxMs : Infinity;
      const end = o.end == null ? -1 : o.end;
      // Ràng buộc lỗ cuối phá đối xứng: chỉ giữ các phép giữ nguyên lỗ đó
      const useSyms = end < 0 ? syms : syms.filter((s) => s[end] === end);
      if (!deadByEnd.has(end)) deadByEnd.set(end, new Set());
      const dead = deadByEnd.get(end);
      if (dead.size > maxMemo) dead.clear();
      const pegs = Uint8Array.from(start);
      let count = 0;
      for (let i = 0; i < n; i++) count += pegs[i];
      const path = [];
      let nodes = 0;

      /** Khóa nhỏ nhất trong các ảnh đối xứng của thế hiện tại. */
      function canon() {
        let best = Infinity;
        for (let s = 0; s < useSyms.length; s++) {
          const p = useSyms[s];
          let k = 0;
          for (let i = 0; i < n; i++) if (pegs[i]) k += pow2[p[i]];
          if (k < best) best = k;
        }
        return best;
      }

      function dfs() {
        if (count === 1) return end < 0 || pegs[end] === 1;
        nodes++;
        if (nodes > maxNodes) throw ABORT;
        if ((nodes & 1023) === 0 && now && now() > deadline) throw ABORT;
        const key = canon();
        if (dead.has(key)) return false;
        for (let q = 0; q < J; q++) {
          const a = JA[q];
          const m = JB[q];
          const c = JC[q];
          if (pegs[a] && pegs[m] && !pegs[c]) {
            pegs[a] = 0; pegs[m] = 0; pegs[c] = 1; count--;
            path.push(JK[q]);
            if (dfs()) return true;
            path.pop();
            pegs[a] = 1; pegs[m] = 1; pegs[c] = 0; count++;
          }
        }
        dead.add(key);
        return false;
      }

      if (count === 0) return { status: 'dead' };
      try {
        return dfs() ? { status: 'solved', moves: path.slice() } : { status: 'dead' };
      } catch (e) {
        if (e !== ABORT) throw e;
        return { status: 'unknown', nodes };
      }
    }

    // Thế (khóa chính xác, không chuẩn hóa) → nước tiếp theo của một lời giải đã biết
    const known = new Map();
    const exactKey = (pegs) => Array.prototype.reduce.call(pegs, (k, p, i) => (p ? k + pow2[i] : k), 0);

    function hint(start, opts) {
      const key = exactKey(start);
      if (known.has(key)) return { status: 'solved', move: known.get(key) };
      const r = solve(start, opts);
      if (r.status !== 'solved') return { status: r.status };
      if (!r.moves.length) return { status: 'dead' }; // đã còn một quân: không còn gì để gợi ý
      let pegs = Array.from(start);
      r.moves.forEach((k) => {
        known.set(exactKey(pegs), k);
        const j = b.jumps[k];
        pegs = pegs.slice();
        pegs[j[0]] = 0;
        pegs[j[1]] = 0;
        pegs[j[2]] = 1;
      });
      return { status: 'solved', move: r.moves[0] };
    }

    return { board: b.id, solve, hint, deadCount: () => Array.from(deadByEnd.values()).reduce((s, d) => s + d.size, 0) };
  }

  const api = {
    VERSION, BOARD_IDS, board, newGame, pegCount, legalMoves, targets, findJump, isWon, isStuck, isOver, isPerfect,
    applyJump, move, undo, restart, markAssisted, toJSON, fromJSON, createSolver,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
