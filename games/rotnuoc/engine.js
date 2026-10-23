/* =====================================================================
 * Rót Nước - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn là mảng ống, mỗi ống là mảng màu (số 0..11) từ đáy lên, tối đa CAP = 4 lớp
 *   - Rót: cả khối cùng màu trên cùng của ống nguồn sang ống đích nếu đích trống hoặc cùng màu trên cùng,
 *     rót tới khi hết khối hoặc đích đầy
 *   - Thắng: mọi ống trống hoặc đủ 4 lớp một màu
 *   - Màn sinh bằng cách xáo ngẫu nhiên (PRNG có seed) rồi chạy solver: chỉ nhận màn giải được, chưa xong sẵn
 *   - Trợ giúp mỗi màn: Hoàn tác 3 lần, +1 ống 1 lần (dùng +1 ống thì ván tính là có trợ giúp)
 *   - Mọi hàm trả ván mới, không sửa ván cũ; toJSON / fromJSON để lưu ván (từ chối dữ liệu hỏng)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const CAP = 4; // số lớp tối đa mỗi ống
  const MIN_COLOURS = 3;
  const MAX_COLOURS = 12;
  const EMPTY_TUBES = 2;
  const UNDO_USES = 3;
  const EXTRA_USES = 1;
  const SOLVE_LIMIT = 60000; // số trạng thái tối đa solver được duyệt khi sinh màn
  const MAX_TRIES = 200;

  /* ---------------- Cấp độ ---------------- */

  /** Số màu của cấp: 3 màu ở cấp 1-2, thêm 1 màu mỗi 2 cấp, tối đa 12 (từ cấp 19). */
  function colorsFor(level) {
    return Math.min(MAX_COLOURS, MIN_COLOURS + Math.floor((Math.max(1, level) - 1) / 2));
  }

  /** Cấp đầu tiên có đúng k màu. */
  function levelForColours(k) {
    return Math.max(1, (k - MIN_COLOURS) * 2 + 1);
  }

  /* ---------------- PRNG ---------------- */

  /** mulberry32: số ngẫu nhiên [0, 1) tái tạo được từ seed 32 bit. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Ống ---------------- */

  const top = (t) => t[t.length - 1];
  const copy = (tubes) => tubes.map((t) => t.slice());

  /** Số lớp cùng màu liên tiếp trên cùng. */
  function runLength(t) {
    let n = 0;
    for (let i = t.length - 1; i >= 0 && t[i] === top(t); i--) n++;
    return n;
  }

  const isUniform = (t) => t.length > 0 && runLength(t) === t.length;
  const isComplete = (t) => t.length === CAP && isUniform(t);

  /** Mọi ống trống hoặc đủ 4 lớp một màu. */
  const isSolved = (tubes) => tubes.every((t) => t.length === 0 || isComplete(t));

  /** Số lớp sẽ rót từ ống a sang ống b trên bàn tubes (0 = không rót được). */
  function pourCount(tubes, a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return 0;
    const src = tubes[a];
    const dst = tubes[b];
    if (!src || !dst || !src.length || dst.length >= CAP) return 0;
    if (dst.length && top(dst) !== top(src)) return 0;
    return Math.min(runLength(src), CAP - dst.length);
  }

  /** Rót n lớp từ a sang b (sửa trực tiếp mảng; chỉ dùng trên bản sao). */
  function move(tubes, a, b, n) {
    for (let i = 0; i < n; i++) tubes[b].push(tubes[a].pop());
  }

  /* ---------------- Ván ---------------- */

  /** Dựng ván với thứ tự khóa cố định (để so sánh / lưu ổn định). */
  function mk(level, seed, start, tubes, moves, history, undoLeft, extraLeft, assisted) {
    return { level, seed, start, tubes, moves, history, undoLeft, extraLeft, assisted };
  }

  const isWon = (g) => isSolved(g.tubes);

  /** Lịch sử chỉ cần giữ số nước còn hoàn tác được. */
  const trim = (history, left) => (left > 0 ? history.slice(-left) : []);

  function canPour(g, a, b) {
    if (isWon(g)) return 0;
    return pourCount(g.tubes, a, b);
  }

  /** Rót a -> b; không hợp lệ thì trả null. Lịch sử chỉ giữ số nước còn hoàn tác được. */
  function pour(g, a, b) {
    const n = canPour(g, a, b);
    if (!n) return null;
    const tubes = copy(g.tubes);
    move(tubes, a, b, n);
    const history = trim(g.history.concat([[a, b, n]]), g.undoLeft);
    return mk(g.level, g.seed, g.start, tubes, g.moves + 1, history, g.undoLeft, g.extraLeft, g.assisted);
  }

  /** Hoàn tác nước rót gần nhất (tốn một lượt); không còn lượt / không có gì để hoàn tác thì null. */
  function undo(g) {
    if (isWon(g) || g.undoLeft <= 0 || !g.history.length) return null;
    const [a, b, n] = g.history[g.history.length - 1];
    const tubes = copy(g.tubes);
    const dst = tubes[b];
    const src = tubes[a];
    // Kiểm tra lại cho chắc (ván lưu có thể bị sửa tay): đủ n lớp cùng màu trên cùng ở b, a còn chỗ
    if (!dst || !src || dst.length < n || src.length + n > CAP) return null;
    if (dst.slice(-n).some((c) => c !== top(dst))) return null;
    move(tubes, b, a, n);
    const left = g.undoLeft - 1;
    return mk(g.level, g.seed, g.start, tubes, g.moves, trim(g.history.slice(0, -1), left), left, g.extraLeft, g.assisted);
  }

  /** Thêm một ống trống (một lần mỗi màn); ván tính là có trợ giúp. */
  function addTube(g) {
    if (isWon(g) || g.extraLeft <= 0) return null;
    const tubes = copy(g.tubes);
    tubes.push([]);
    return mk(g.level, g.seed, g.start, tubes, g.moves, g.history.map((h) => h.slice()), g.undoLeft, g.extraLeft - 1, true);
  }

  /** Nước rót "có ích": mọi nước hợp lệ trừ dời ống chỉ một màu sang ống trống (đi mãi không tiến). */
  function usefulMoves(g) {
    const out = [];
    if (isWon(g)) return out;
    const tubes = g.tubes;
    for (let a = 0; a < tubes.length; a++) {
      for (let b = 0; b < tubes.length; b++) {
        const n = pourCount(tubes, a, b);
        if (!n) continue;
        if (!tubes[b].length && isUniform(tubes[a])) continue;
        out.push([a, b, n]);
      }
    }
    return out;
  }

  const hasMoves = (g) => usefulMoves(g).length > 0;
  const isStuck = (g) => !isWon(g) && !hasMoves(g);

  /* ---------------- Solver ---------------- */

  /**
   * Tìm một lời giải bằng DFS có nhớ trạng thái đã thăm (ống xếp lại theo thứ tự nên đổi chỗ ống không tính là mới).
   * Trả về mảng [từ, tới]; [] nếu đã xong; null nếu không có lời giải hoặc vượt quá `limit` trạng thái.
   * Cắt tỉa: không rót từ ống đã xong, không dời ống một màu sang ống trống, mỗi lượt chỉ thử một ống trống.
   */
  function solve(input, limit) {
    const max = limit || SOLVE_LIMIT * 5;
    const tubes = copy(input);
    const seen = new Set();
    const path = [];
    let nodes = 0;

    const key = () => tubes.map((t) => t.join(',')).sort().join('|');

    function candidates() {
      const list = [];
      for (let a = 0; a < tubes.length; a++) {
        const src = tubes[a];
        if (!src.length || isComplete(src)) continue;
        const uniform = isUniform(src);
        const run = runLength(src);
        let triedEmpty = false;
        for (let b = 0; b < tubes.length; b++) {
          const n = pourCount(tubes, a, b);
          if (!n) continue;
          const dst = tubes[b];
          let rank;
          if (!dst.length) {
            if (uniform || triedEmpty) continue;
            triedEmpty = true;
            rank = 3;
          } else if (n === run && isUniform(dst)) rank = 0; // gom vào ống một màu: tốt nhất
          else if (n === run) rank = 1;
          else rank = 2; // rót một phần
          list.push([rank, a, b, n]);
        }
      }
      list.sort((x, y) => x[0] - y[0]);
      return list;
    }

    function dfs() {
      if (isSolved(tubes)) return true;
      if (++nodes > max) return false;
      const k = key();
      if (seen.has(k)) return false;
      seen.add(k);
      const list = candidates();
      for (let i = 0; i < list.length; i++) {
        const [, a, b, n] = list[i];
        move(tubes, a, b, n);
        path.push([a, b]);
        if (dfs()) return true;
        path.pop();
        move(tubes, b, a, n);
        if (nodes > max) return false;
      }
      return false;
    }

    return dfs() ? path : null;
  }

  /* ---------------- Sinh màn ---------------- */

  /** Xáo 4 lớp mỗi màu vào k ống đầy + 2 ống trống; chỉ nhận màn chưa có ống nào xong sẵn và solver giải được. */
  function generate(level, seed) {
    const k = colorsFor(level);
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const rand = rng((seed + Math.imul(tries, 0x9e3779b1)) >>> 0);
      const pool = [];
      for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) pool.push(c);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const x = pool[i];
        pool[i] = pool[j];
        pool[j] = x;
      }
      const tubes = [];
      for (let c = 0; c < k; c++) tubes.push(pool.slice(c * CAP, c * CAP + CAP));
      for (let i = 0; i < EMPTY_TUBES; i++) tubes.push([]);
      if (tubes.some(isComplete)) continue;
      // Không để ống nào có 3 lớp cùng màu liền nhau ngay từ đầu (màn quá dễ)
      if (tubes.some((t) => runLength(t) >= 3)) continue;
      if (solve(tubes, SOLVE_LIMIT)) return tubes;
    }
    // Rất khó xảy ra: lùi về cách sinh bằng nước rót ngược từ trạng thái đích (luôn giải được)
    return scramble(k, seed);
  }

  /**
   * Dự phòng: từ bàn đã xong, đi ngẫu nhiên các bước "rót ngược" một lớp (lấy lớp trên cùng của P đặt lên Q)
   * sao cho rót xuôi Q -> P đúng một lớp sẽ trả lại trạng thái trước. Mọi trạng thái đi qua đều giải được.
   * Ưu tiên trạng thái "k ống đầy + 2 ống trống" giống màn xáo thường.
   */
  function scramble(k, seed) {
    const rand = rng((seed ^ 0x5bd1e995) >>> 0);
    const tubes = [];
    for (let c = 0; c < k; c++) tubes.push([c, c, c, c]);
    for (let i = 0; i < EMPTY_TUBES; i++) tubes.push([]);
    let best = null;
    for (let s = 0; s < k * 60; s++) {
      const steps = [];
      for (let p = 0; p < tubes.length; p++) {
        const P = tubes[p];
        if (!P.length) continue;
        const x = top(P);
        const rest = P.length - 1;
        // Sau khi lấy x đi, P phải trống hoặc có đỉnh x thì rót xuôi mới rơi lại vào P
        if (rest && P[rest - 1] !== x) continue;
        for (let q = 0; q < tubes.length; q++) {
          const Q = tubes[q];
          if (q === p || Q.length >= CAP) continue;
          // Rót xuôi Q -> P phải chuyển đúng một lớp: khối x trên Q dài 1, hoặc P chỉ còn một chỗ
          if (Q.length && top(Q) === x && P.length !== CAP) continue;
          steps.push([p, q]);
        }
      }
      if (!steps.length) break;
      const [p, q] = steps[Math.floor(rand() * steps.length)];
      move(tubes, p, q, 1);
      const shaped = tubes.every((t) => t.length === 0 || t.length === CAP) && !tubes.some(isComplete);
      if (s >= k * 10 && shaped) best = copy(tubes);
    }
    return best || copy(tubes);
  }

  /** Ván mới của cấp `level`; cùng seed cho cùng bố cục. */
  function newGame(level, seed) {
    const lv = Math.max(1, Math.floor(level) || 1);
    const sd = (Math.floor(seed) || 0) >>> 0;
    const tubes = generate(lv, sd);
    return mk(lv, sd, copy(tubes), tubes, 0, [], UNDO_USES, EXTRA_USES, false);
  }

  /** Chơi lại màn: bố cục ban đầu, trợ giúp đầy lại. */
  function restart(g) {
    return mk(g.level, g.seed, copy(g.start), copy(g.start), 0, [], UNDO_USES, EXTRA_USES, false);
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      v: VERSION,
      level: g.level,
      seed: g.seed,
      start: copy(g.start),
      tubes: copy(g.tubes),
      moves: g.moves,
      history: g.history.map((h) => h.slice()),
      undoLeft: g.undoLeft,
      extraLeft: g.extraLeft,
      assisted: g.assisted,
    };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /** Đúng `count` ống, mỗi ống ≤ 4 lớp màu 0..k-1, mỗi màu đúng 4 lớp. */
  function validTubes(tubes, k, count) {
    if (!Array.isArray(tubes) || tubes.length !== count) return false;
    const seen = new Array(k).fill(0);
    for (const t of tubes) {
      if (!Array.isArray(t) || t.length > CAP) return false;
      for (const c of t) {
        if (!isInt(c, 0, k - 1)) return false;
        seen[c]++;
      }
    }
    return seen.every((n) => n === CAP);
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { level, seed, start, tubes, moves, history, undoLeft, extraLeft, assisted } = raw;
    if (!isInt(level, 1, 1e6) || !isInt(seed, 0, 4294967295) || !isInt(moves, 0, 1e7)) return null;
    if (!isInt(undoLeft, 0, UNDO_USES) || !isInt(extraLeft, 0, EXTRA_USES) || typeof assisted !== 'boolean') return null;
    if (assisted !== extraLeft < EXTRA_USES) return null;
    const k = colorsFor(level);
    const count = k + EMPTY_TUBES + (EXTRA_USES - extraLeft);
    if (!validTubes(start, k, k + EMPTY_TUBES) || !validTubes(tubes, k, count)) return null;
    if (!Array.isArray(history) || history.length > undoLeft) return null;
    for (const h of history) {
      if (!Array.isArray(h) || h.length !== 3) return null;
      if (!isInt(h[0], 0, count - 1) || !isInt(h[1], 0, count - 1) || h[0] === h[1] || !isInt(h[2], 1, CAP)) return null;
    }
    return mk(level, seed, copy(start), copy(tubes), moves, history.map((h) => h.slice()), undoLeft, extraLeft, assisted);
  }

  const api = {
    CAP,
    MAX_COLOURS,
    UNDO_USES,
    EXTRA_USES,
    colorsFor,
    levelForColours,
    rng,
    runLength,
    isComplete,
    isSolved,
    isWon,
    canPour,
    pour,
    undo,
    addTube,
    usefulMoves,
    hasMoves,
    isStuck,
    solve,
    newGame,
    restart,
    toJSON,
    fromJSON,
    _scramble: scramble, // chỉ để test
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
