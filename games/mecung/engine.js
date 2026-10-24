/* =====================================================================
 * Mê Cung - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Mê cung hoàn hảo w x h (cây khung trên lưới: mọi ô thông nhau, giữa hai ô có đúng một đường),
 *     sinh tất định theo seed (PRNG mulberry32) bằng "growing tree" thiên về đào sâu (recursive backtracker):
 *     phần lớn bước đào tiếp từ ô mới nhất (hành lang dài, uốn lượn, ít ngõ cụt cụt lủn), thỉnh thoảng đào từ
 *     một ô ngẫu nhiên trên ngăn xếp để có thêm ngã rẽ, và hơi ưu tiên đi thẳng (hành lang thẳng hợp với "trượt").
 *   - Lối vào ở cạnh trên, lối ra ở cạnh dưới: cặp ô xa nhau nhất theo đường đi (đường đúng dài, hai đầu đối diện).
 *   - Ô lưu bằng bit hướng đã thông: N = 1, E = 2, S = 4, W = 8.
 *   - Ván: vị trí người chơi + vết đi (đi lùi xóa vết) + ô đã từng qua. Mê cung là cây nên vết đi luôn đúng bằng
 *     đường duy nhất từ lối vào tới vị trí hiện tại: ván lưu chỉ cần seed + vị trí.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu hoặc thuật toán / tham số sinh (ván lưu cũ sẽ bị bỏ)

  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;
  const DIRS = [N, E, S, W];
  const DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
  const DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
  const OPP = { 1: S, 2: W, 4: N, 8: E };
  const LEFT = { 1: W, 2: N, 4: E, 8: S };
  const RIGHT = { 1: E, 2: S, 4: W, 8: N };
  const isDir = (d) => d === N || d === E || d === S || d === W;

  /** Cỡ theo mode (rộng x cao); đề hằng ngày dùng cỡ vừa. Bàn dọc chữ nhật để vừa điện thoại cầm đứng. */
  const SIZES = {
    easy: { w: 10, h: 15 },
    medium: { w: 13, h: 21 },
    hard: { w: 17, h: 28 },
    daily: { w: 13, h: 21 },
  };
  const MODES = ['easy', 'medium', 'hard', 'daily'];

  // Tham số sinh (đổi là đổi mọi mê cung theo seed và đề hằng ngày: phải tăng VERSION)
  const BRANCH = 0.12; // xác suất đào từ một ô ngẫu nhiên trên ngăn xếp thay vì ô mới nhất
  const STRAIGHT = 0.35; // xác suất giữ nguyên hướng vừa đào khi còn đi thẳng được
  const PATH_MIN = 0.3; // đường đúng phải dài ít nhất ngần này phần số ô (không thì đào lại)
  const TRIES = 12; // số lần đào lại tối đa
  const HINT_LEN = 6; // số ô của một đoạn gợi ý
  const DRAG_REACH = 2; // kéo ngón tay: đi theo tối đa 2 ô mỗi lần (lướt nhanh bỏ qua một ô / cắt góc); ô kề bị tường cách ≥ 3 ô nên không vòng qua tường

  /* ---------------- PRNG ---------------- */

  /** Băm chuỗi thành số 32 bit (FNV-1a) để làm seed, ví dụ đề hằng ngày. */
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry32: trả hàm r() → [0, 1). */
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

  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  /** Seed đề hằng ngày theo ngày giờ địa phương 'YYYY-MM-DD': cả ngày chung một mê cung. */
  const dailySeed = (date) => hashString('mecung-daily-' + date);

  /* ---------------- Mê cung ---------------- */

  /** Ô kề theo hướng (không xét tường); ra ngoài bàn thì -1. */
  function neighbor(m, i, d) {
    const x = (i % m.w) + DX[d];
    const y = Math.floor(i / m.w) + DY[d];
    return x < 0 || y < 0 || x >= m.w || y >= m.h ? -1 : y * m.w + x;
  }

  /** Từ ô i đi được sang hướng d (không có tường) không. */
  const isOpen = (m, i, d) => (m.cells[i] & d) !== 0;

  /** Số lối thông của một ô (1 = ngõ cụt, 2 = hành lang / khúc quanh, ≥ 3 = ngã rẽ). */
  function degree(m, i) {
    const c = m.cells[i];
    return (c & 1) + ((c >> 1) & 1) + ((c >> 2) & 1) + ((c >> 3) & 1);
  }

  /** BFS từ ô `from`: khoảng cách và ô liền trước (về phía `from`) của mọi ô. */
  function bfs(m, from) {
    const n = m.w * m.h;
    const dist = new Int32Array(n).fill(-1);
    const prev = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    let head = 0;
    let tail = 0;
    q[tail++] = from;
    dist[from] = 0;
    while (head < tail) {
      const i = q[head++];
      for (let k = 0; k < 4; k++) {
        const d = DIRS[k];
        if (!(m.cells[i] & d)) continue;
        const j = neighbor(m, i, d);
        if (j < 0 || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        prev[j] = i;
        q[tail++] = j;
      }
    }
    return { dist, prev };
  }

  /**
   * Đào một mê cung hoàn hảo w x h bằng PRNG r (growing tree), rồi đặt lối vào / lối ra.
   * Ngăn xếp các ô còn đào được; mỗi bước lấy ô mới nhất (xác suất 1 - BRANCH) hoặc một ô ngẫu nhiên trên ngăn xếp,
   * đào sang một ô kề chưa thăm (giữ hướng cũ với xác suất STRAIGHT), hết ô kề thì bỏ ô đó khỏi ngăn xếp.
   * Mỗi lần đào nối một ô mới vào cây nên được đúng w*h - 1 lối thông, mọi ô liên thông.
   */
  function carve(w, h, r) {
    const n = w * h;
    const m = { w, h, cells: new Uint8Array(n), start: 0, goal: 0, startSide: N, goalSide: S };
    const seen = new Uint8Array(n);
    const lastDir = new Uint8Array(n); // hướng đã đào để tới ô này
    const stack = [];
    const first = Math.floor(r() * n);
    seen[first] = 1;
    stack.push(first);
    const opts = [];
    while (stack.length) {
      const k = r() < BRANCH ? Math.floor(r() * stack.length) : stack.length - 1;
      const i = stack[k];
      opts.length = 0;
      for (let t = 0; t < 4; t++) {
        const j = neighbor(m, i, DIRS[t]);
        if (j >= 0 && !seen[j]) opts.push(DIRS[t]);
      }
      if (!opts.length) {
        stack.splice(k, 1);
        continue;
      }
      let d = opts[Math.floor(r() * opts.length)];
      if (lastDir[i] && opts.indexOf(lastDir[i]) >= 0 && r() < STRAIGHT) d = lastDir[i];
      const j = neighbor(m, i, d);
      m.cells[i] |= d;
      m.cells[j] |= OPP[d];
      seen[j] = 1;
      lastDir[j] = d;
      stack.push(j);
    }
    // Lối vào ở hàng trên cùng, lối ra ở hàng dưới cùng (hai cạnh đối diện): chọn cặp xa nhau nhất theo đường đi.
    // Mỗi ô hàng trên một lần BFS (w lần O(w*h)), hòa thì lấy chỉ số nhỏ nhất (tất định).
    let best = -1;
    for (let x = 0; x < w; x++) {
      const dist = bfs(m, x).dist;
      for (let gx = 0; gx < w; gx++) {
        const g = (h - 1) * w + gx;
        if (dist[g] > best) {
          best = dist[g];
          m.start = x;
          m.goal = g;
        }
      }
    }
    m.len = best;
    return m;
  }

  /**
   * Sinh mê cung theo seed. Mê cung có đường đúng quá ngắn (đi gần như thẳng một mạch) thì đào lại bằng dòng số
   * tiếp theo của cùng PRNG, tối đa TRIES lần; không đạt thì lấy cái có đường dài nhất. Vẫn tất định theo seed.
   */
  function generate(w, h, seed) {
    const r = rng(seed);
    let best = null;
    for (let t = 0; t < TRIES; t++) {
      const m = carve(w, h, r);
      if (!best || m.len > best.len) best = m;
      if (m.len >= PATH_MIN * w * h) break;
    }
    return best;
  }

  /** Đường duy nhất từ a tới b (gồm cả hai đầu). */
  function pathBetween(m, a, b) {
    const { prev } = bfs(m, b);
    const out = [a];
    let i = a;
    while (i !== b) {
      i = prev[i];
      if (i < 0) return null;
      out.push(i);
    }
    return out;
  }

  /** Hướng đi từ ô i sang ô kề j (không kề thì 0). */
  function dirTo(m, i, j) {
    for (let k = 0; k < 4; k++) if (neighbor(m, i, DIRS[k]) === j) return DIRS[k];
    return 0;
  }

  /**
   * Trượt: vừa tới ô i theo hướng d thì có dừng ở đây không.
   * Dừng khi hết đường thẳng, có lối rẽ ngang (ngã rẽ / khúc quanh) hoặc đã tới lối ra.
   */
  function isStop(m, i, d) {
    return i === m.goal || !isOpen(m, i, d) || isOpen(m, i, LEFT[d]) || isOpen(m, i, RIGHT[d]);
  }

  /** Các ô đi qua khi trượt từ i theo hướng d (không gồm i; rỗng nếu có tường). */
  function slideCells(m, i, d) {
    const out = [];
    let cur = i;
    while (isOpen(m, cur, d)) {
      cur = neighbor(m, cur, d);
      out.push(cur);
      if (isStop(m, cur, d)) break;
    }
    return out;
  }

  /**
   * Số thao tác tối thiểu đi hết đường lối vào → lối ra khi trượt tới ngã rẽ: mỗi lần trượt dừng ở ngã rẽ / khúc
   * quanh đầu tiên, nên đi thẳng qua một ngã rẽ vẫn tốn thêm một lần. Trượt không bao giờ vượt chỗ đường đúng rẽ
   * (chỗ rẽ có lối ngang nên trượt dừng ở đó).
   */
  function minOps(m) {
    const p = pathBetween(m, m.start, m.goal);
    let ops = 0;
    let k = 0;
    while (k < p.length - 1) {
      k += slideCells(m, p[k], dirTo(m, p[k], p[k + 1])).length;
      ops++;
    }
    return ops;
  }

  /** Số đoạn thẳng của đường lối vào → lối ra (số lần đổi hướng + 1). */
  function segments(m) {
    const p = pathBetween(m, m.start, m.goal);
    let n = 0;
    let last = 0;
    for (let k = 0; k < p.length - 1; k++) {
      const d = dirTo(m, p[k], p[k + 1]);
      if (d !== last) n++;
      last = d;
    }
    return n;
  }

  /* ---------------- Ván ---------------- */

  /** Bọc mê cung đã sinh thành ván. */
  function build(mode, seed, date, maze) {
    const toGoal = bfs(maze, maze.goal); // prev[] = bước kế tiếp hướng về lối ra; dist[] = số ô còn phải đi
    const seen = new Uint8Array(maze.w * maze.h);
    seen[maze.start] = 1;
    return {
      mode,
      seed,
      date,
      w: maze.w,
      h: maze.h,
      maze,
      next: toGoal.prev,
      left: toGoal.dist,
      pos: maze.start,
      trail: [maze.start],
      seen,
      moves: 0,
      hints: 0,
    };
  }

  /** Ván mới: { mode, seed } hoặc đề hằng ngày { mode: 'daily', date: 'YYYY-MM-DD' } (seed theo ngày). */
  function newGame(opts) {
    const o = opts || {};
    const mode = SIZES.hasOwnProperty(o.mode) ? o.mode : 'easy';
    let date = null;
    let seed = Number.isInteger(o.seed) ? o.seed >>> 0 : 1;
    if (mode === 'daily') {
      date = isDate(o.date) ? o.date : '2026-01-01';
      seed = dailySeed(date);
    }
    const sz = SIZES[mode];
    return build(mode, seed, date, generate(sz.w, sz.h, seed));
  }

  const isWon = (g) => g.pos === g.maze.goal;

  /** Tiến độ 0..1 theo số ô còn phải đi tới lối ra. */
  function progress(g) {
    const total = g.left[g.maze.start];
    return total > 0 ? Math.max(0, Math.min(1, 1 - g.left[g.pos] / total)) : 1;
  }

  /** Sang ô kề j (đã biết là thông): quay về ô ngay trước trên vết thì xóa vết, không thì nối vết. */
  function enter(g, j) {
    const trail = g.trail.slice();
    if (trail.length >= 2 && trail[trail.length - 2] === j) trail.pop();
    else trail.push(j);
    const seen = g.seen[j] ? g.seen : g.seen.slice();
    seen[j] = 1;
    return Object.assign({}, g, { pos: j, trail, seen, moves: g.moves + 1 });
  }

  /** Đi một ô theo hướng d; có tường hoặc đã thắng thì trả lại đúng ván cũ. */
  function step(g, d) {
    if (isWon(g) || !isDir(d) || !isOpen(g.maze, g.pos, d)) return g;
    return enter(g, neighbor(g.maze, g.pos, d));
  }

  /** Trượt theo hướng d tới ngã rẽ tiếp theo. Trả { game, cells } (cells = các ô đi qua; rỗng nếu đụng tường). */
  function slide(g, d) {
    if (isWon(g) || !isDir(d)) return { game: g, cells: [] };
    const cells = slideCells(g.maze, g.pos, d);
    let out = g;
    cells.forEach((j) => { out = enter(out, j); });
    return { game: out, cells };
  }

  /**
   * Kéo ngón tay tới ô `target`: đi theo đường duy nhất nếu nó dài không quá `reach` ô (ngón tay lướt nhanh bỏ
   * qua ô hoặc cắt góc); xa hơn thì đứng yên (ngón tay đã rời đường). Trả { game, cells }.
   */
  function moveToward(g, target, reach) {
    const lim = reach == null ? DRAG_REACH : reach;
    if (isWon(g) || !Number.isInteger(target) || target < 0 || target >= g.w * g.h || target === g.pos) return { game: g, cells: [] };
    const prev = new Map([[g.pos, -1]]);
    let frontier = [g.pos];
    for (let depth = 0; depth < lim && frontier.length && !prev.has(target); depth++) {
      const nextF = [];
      frontier.forEach((i) => {
        DIRS.forEach((d) => {
          if (!isOpen(g.maze, i, d)) return;
          const j = neighbor(g.maze, i, d);
          if (prev.has(j)) return;
          prev.set(j, i);
          nextF.push(j);
        });
      });
      frontier = nextF;
    }
    if (!prev.has(target)) return { game: g, cells: [] };
    const route = [];
    for (let i = target; i !== g.pos; i = prev.get(i)) route.unshift(i);
    let out = g;
    const cells = [];
    for (const j of route) {
      out = enter(out, j);
      cells.push(j);
      if (isWon(out)) break;
    }
    return { game: out, cells };
  }

  /** Đoạn đường đúng tiếp theo từ vị trí hiện tại (tối đa `len` ô, không gồm ô đang đứng). */
  function nextCells(g, len) {
    const out = [];
    const lim = len || HINT_LEN;
    let i = g.pos;
    while (i !== g.maze.goal && out.length < lim) {
      i = g.next[i];
      out.push(i);
    }
    return out;
  }

  /** Gợi ý: { game (đếm thêm một gợi ý), cells }; đã thắng thì null. */
  function hint(g, len) {
    if (isWon(g)) return null;
    return { game: Object.assign({}, g, { hints: g.hints + 1 }), cells: nextCells(g, len) };
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  /** Bit ô đã qua → chuỗi hex (4 ô một ký tự). */
  function bitsToHex(bits) {
    let s = '';
    for (let i = 0; i < bits.length; i += 4) {
      s += ((bits[i] ? 1 : 0) | (bits[i + 1] ? 2 : 0) | (bits[i + 2] ? 4 : 0) | (bits[i + 3] ? 8 : 0)).toString(16);
    }
    return s;
  }
  function hexToBits(s, n) {
    if (typeof s !== 'string' || s.length !== Math.ceil(n / 4) || !/^[0-9a-f]*$/.test(s)) return null;
    const bits = new Uint8Array(n);
    for (let i = 0; i < n; i++) bits[i] = (parseInt(s[i >> 2], 16) >> (i & 3)) & 1;
    // Bit thừa sau ô cuối phải bằng 0
    for (let i = n; i < s.length * 4; i++) if ((parseInt(s[i >> 2], 16) >> (i & 3)) & 1) return null;
    return bits;
  }

  /** Ván lưu: seed + vị trí + ô đã qua (mê cung sinh lại từ seed, vết đi suy ra từ vị trí). */
  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    seed: g.seed,
    date: g.date,
    pos: g.pos,
    seen: bitsToHex(g.seen),
    moves: g.moves,
    hints: g.hints,
  });

  const isCount = (x) => Number.isInteger(x) && x >= 0 && x <= 1e9;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { mode, seed, date, pos, moves, hints } = raw;
    if (!SIZES.hasOwnProperty(mode) || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) return null;
    if (mode === 'daily' ? !isDate(date) || seed !== dailySeed(date) : date !== null) return null;
    if (!isCount(moves) || !isCount(hints)) return null;
    const sz = SIZES[mode];
    const n = sz.w * sz.h;
    if (!Number.isInteger(pos) || pos < 0 || pos >= n) return null;
    const seen = hexToBits(raw.seen, n);
    if (!seen) return null;
    const g = build(mode, seed, date, generate(sz.w, sz.h, seed));
    // Vết đi = đường duy nhất từ lối vào tới vị trí; mọi ô trên vết phải đã qua, số nước ít nhất bằng độ dài vết
    const trail = pathBetween(g.maze, g.maze.start, pos);
    if (!trail || trail.some((i) => !seen[i]) || moves < trail.length - 1) return null;
    return Object.assign(g, { pos, trail, seen, moves, hints });
  }

  const api = {
    VERSION, N, E, S, W, DIRS, DX, DY, OPP, LEFT, RIGHT, SIZES, MODES, HINT_LEN, DRAG_REACH,
    hashString, rng, dailySeed, isDate,
    generate, neighbor, isOpen, degree, bfs, pathBetween, dirTo, isStop, slideCells, minOps, segments,
    newGame, isWon, progress, step, slide, moveToward, nextCells, hint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
