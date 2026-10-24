/* =====================================================================
 * Ghép Hình - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn n x n mảnh (Dễ 4x4, Vừa 6x6, Khó 8x8; đề hằng ngày 6x6). Tọa độ tính theo "đơn vị mảnh":
 *     mảnh (c, r) đúng chỗ khi góc trên trái của ô lõi nằm ở (c, r).
 *   - Đường cắt sinh tất định theo seed (PRNG mulberry32): mỗi cạnh trong là 3 đoạn Bezier bậc ba kiểu jigsaw
 *     (cổ thắt + đầu tròn), hướng tai và độ lệch ngẫu nhiên. Hai mảnh kề dùng chung đúng một cạnh (đi ngược chiều)
 *     nên tai bên này luôn khớp lõm bên kia; cạnh ngoài của bàn là đoạn thẳng.
 *   - Mảnh ở một trong ba chỗ: khay (tray, có thứ tự), rời trên bàn (loose, theo nhóm), đã khóa (done).
 *     Nhóm rời = các mảnh đã ghép với nhau, cùng độ lệch (dx, dy) so với chỗ đúng; thứ tự mảng = thứ tự chồng (cuối = trên cùng).
 *   - Thả (drop): độ lệch tới chỗ đúng ≤ SNAP thì hút vào và khóa cả nhóm; không thì ghép với nhóm rời có mảnh kề
 *     mà độ lệch tương đối ≤ SNAP (căn thẳng theo nhóm đó, có thể nối nhiều nhóm một lần); còn lại nằm rời chỗ thả.
 *   - Không xoay mảnh: trên màn hình cảm ứng nhỏ, xoay cần thêm cử chỉ (hai ngón / chạm đúp) dễ nhầm với kéo và
 *     làm ván 64 mảnh dài gấp mấy lần; ghép hình trên máy hầu hết cũng mặc định không xoay.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu hoặc thuật toán / tham số sinh (ván lưu cũ sẽ bị bỏ)

  const SIZES = { easy: 4, medium: 6, hard: 8, daily: 6 };
  const MODES = ['easy', 'medium', 'hard', 'daily'];
  const SCENES = 10; // số cảnh trong scenes.js (test kiểm tra khớp)
  const SNAP = 0.3; // dung sai hút / ghép: 30% cạnh mảnh
  const MARGIN = 0.36; // lề quanh ô lõi đủ chứa tai (tai cao tối đa 3·TAB + JITTER = 0,34)
  const TAB = 0.1; // cỡ tai (theo cạnh mảnh)
  const JITTER = 0.04; // độ lệch ngẫu nhiên của tai
  const MIN_MS_PER_PIECE = 400; // thời gian kéo thả tối thiểu mỗi mảnh (min_time_ms = số mảnh × ngần này)
  const LIMIT = 40; // độ lệch tối đa hợp lệ của nhóm rời trong ván lưu (đơn vị mảnh)

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
  /** Seed đề hằng ngày theo ngày giờ địa phương 'YYYY-MM-DD': cả ngày chung một đề. */
  const dailySeed = (date) => hashString('ghephinh-daily-' + date);
  const pieceCount = (mode) => SIZES[mode] * SIZES[mode];
  const isSeed = (s) => Number.isInteger(s) && s >= 0 && s < 4294967296;

  /* ---------------- Đường cắt ---------------- */

  /** Tham số một cạnh trong: s = hướng tai (±1), a..e = độ lệch. */
  function makeEdge(r) {
    const j = () => (r() * 2 - 1) * JITTER;
    return { s: r() < 0.5 ? 1 : -1, a: j(), b: j(), c: j(), d: j(), e: j() };
  }

  /**
   * 10 điểm (u dọc cạnh 0..1, v vuông góc) của một cạnh jigsaw: đầu, 3 x (điều khiển, điều khiển, cuối).
   * v dương = phía tai lồi ra (đã nhân hướng s).
   */
  function edgeLocal(e) {
    const t = TAB;
    const pts = [
      [0, 0],
      [0.2, e.a],
      [0.5 + e.b + e.d, -t + e.c],
      [0.5 - t + e.b, t + e.c],
      [0.5 - 2 * t + e.b - e.d, 3 * t + e.c],
      [0.5 + 2 * t + e.b - e.d, 3 * t + e.c],
      [0.5 + t + e.b, t + e.c],
      [0.5 + e.b + e.d, -t + e.c],
      [0.8, e.e],
      [1, 0],
    ];
    return pts.map(([u, v]) => [u, v * e.s]);
  }

  /** Dựng toàn bộ cạnh trong: h[r][c] là cạnh ngang y = r (1..rows-1), v[c][r] là cạnh dọc x = c (1..cols-1). */
  function makeEdges(cols, rows, r) {
    const h = [];
    const v = [];
    for (let y = 1; y < rows; y++) {
      h[y] = [];
      for (let x = 0; x < cols; x++) h[y][x] = makeEdge(r);
    }
    for (let x = 1; x < cols; x++) {
      v[x] = [];
      for (let y = 0; y < rows; y++) v[x][y] = makeEdge(r);
    }
    return { h, v };
  }

  /** Điểm tuyệt đối của cạnh ngang y = row, ô cột col, đi từ trái sang phải; tai dương lồi xuống dưới. */
  const hPoints = (g, col, row) => edgeLocal(g.edges.h[row][col]).map(([u, v]) => [col + u, row + v]);
  /** Điểm tuyệt đối của cạnh dọc x = col, ô hàng row, đi từ trên xuống; tai dương lồi sang phải. */
  const vPoints = (g, col, row) => edgeLocal(g.edges.v[col][row]).map(([u, v]) => [col + v, row + u]);

  const validId = (g, id) => Number.isInteger(id) && id >= 0 && id < g.cols * g.rows;
  const cellOf = (g, id) => ({ c: id % g.cols, r: Math.floor(id / g.cols) });
  function isEdge(g, id) {
    const { c, r } = cellOf(g, id);
    return c === 0 || r === 0 || c === g.cols - 1 || r === g.rows - 1;
  }

  /** Kiểu bốn cạnh [trên, phải, dưới, trái]: 1 = tai lồi ra, -1 = lõm vào, 0 = phẳng (viền). */
  function sides(g, id) {
    const { c, r } = cellOf(g, id);
    return [
      r === 0 ? 0 : -g.edges.h[r][c].s,
      c === g.cols - 1 ? 0 : g.edges.v[c + 1][r].s,
      r === g.rows - 1 ? 0 : g.edges.h[r + 1][c].s,
      c === 0 ? 0 : -g.edges.v[c][r].s,
    ];
  }

  /**
   * Đường viền mảnh theo chiều kim đồng hồ, tọa độ tính từ góc trên trái ô lõi (đơn vị mảnh):
   * [['M', x, y], ['C', x1, y1, x2, y2, x, y] | ['L', x, y], ...]; điểm cuối trùng điểm đầu.
   * Trên → phải → dưới → trái; cạnh trong 3 đoạn C, cạnh viền 1 đoạn L.
   */
  function piecePath(g, id) {
    const { c, r } = cellOf(g, id);
    const out = [['M', 0, 0]];
    const add = (pts) => {
      for (let k = 1; k < pts.length; k += 3) {
        const [p1, p2, p3] = [pts[k], pts[k + 1], pts[k + 2]];
        out.push(['C', p1[0] - c, p1[1] - r, p2[0] - c, p2[1] - r, p3[0] - c, p3[1] - r]);
      }
    };
    if (r === 0) out.push(['L', 1, 0]);
    else add(hPoints(g, c, r));
    if (c === g.cols - 1) out.push(['L', 1, 1]);
    else add(vPoints(g, c + 1, r));
    if (r === g.rows - 1) out.push(['L', 0, 1]);
    else add(hPoints(g, c, r + 1).reverse());
    if (c === 0) out.push(['L', 0, 0]);
    else add(vPoints(g, c, r).reverse());
    return out;
  }

  /** Chỉ số đoạn [từ, tới) của từng cạnh [trên, phải, dưới, trái] trong piecePath. */
  function sideSegments(g, id) {
    const s = sides(g, id);
    const out = [];
    let k = 1;
    s.forEach((t) => {
      const n = t === 0 ? 1 : 3;
      out.push([k, k + n]);
      k += n;
    });
    return out;
  }

  /* ---------------- Ván ---------------- */

  /** Ván mới. opts: { mode, seed, date } (đề hằng ngày: seed lấy theo date). Mọi mảnh nằm trong khay, xáo theo seed. */
  function newGame(opts) {
    const mode = MODES.indexOf(opts && opts.mode) >= 0 ? opts.mode : 'easy';
    const date = mode === 'daily' && isDate(opts.date) ? opts.date : null;
    const seed = mode === 'daily' ? dailySeed(date || '') : (Number(opts && opts.seed) >>> 0);
    const n = SIZES[mode];
    const r = rng(seed);
    const scene = Math.floor(r() * SCENES);
    const sceneSeed = Math.floor(r() * 4294967296);
    const edges = makeEdges(n, n, r);
    const tray = [];
    for (let i = 0; i < n * n; i++) tray.push(i);
    for (let i = tray.length - 1; i > 0; i--) {
      const k = Math.floor(r() * (i + 1));
      [tray[i], tray[k]] = [tray[k], tray[i]];
    }
    return { mode, seed, date, cols: n, rows: n, scene, sceneSeed, edges, tray, loose: [], done: new Array(n * n).fill(false), moves: 0 };
  }

  const isWon = (g) => g.done.every(Boolean);
  const progress = (g) => g.done.filter(Boolean).length / g.done.length;

  /** Nhóm rời chứa mảnh id ({ id, dx, dy, members }) hoặc null. */
  function groupOf(g, id) {
    for (let i = 0; i < g.loose.length; i++) if (g.loose[i].members.indexOf(id) >= 0) return g.loose[i];
    return null;
  }

  /** Vị trí góc trên trái ô lõi của mảnh (đơn vị mảnh): đã khóa = chỗ đúng, rời = chỗ đúng + độ lệch nhóm, trong khay = null. */
  function positionOf(g, id) {
    const { c, r } = cellOf(g, id);
    if (g.done[id]) return { x: c, y: r };
    const grp = groupOf(g, id);
    return grp ? { x: c + grp.dx, y: r + grp.dy } : null;
  }

  /** Hai tập mảnh có cặp nào kề nhau qua cạnh (không tính chéo góc). */
  function touching(g, a, b) {
    for (let i = 0; i < a.length; i++) {
      const p = cellOf(g, a[i]);
      for (let k = 0; k < b.length; k++) {
        const q = cellOf(g, b[k]);
        if (Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1) return true;
      }
    }
    return false;
  }

  const copy = (g) => Object.assign({}, g, { tray: g.tray.slice(), loose: g.loose.slice(), done: g.done.slice() });
  const sortNum = (a) => a.slice().sort((x, y) => x - y);

  /**
   * Thả mảnh id (đang ở khay, hoặc kéo cả nhóm rời chứa nó) sao cho góc trên trái ô lõi của nó nằm ở (x, y).
   * Trả { game, result: 'none' | 'lock' | 'merge' | 'move', members } (members = các mảnh của khối sau khi thả).
   */
  function drop(g, id, x, y) {
    const none = { game: g, result: 'none', members: [] };
    if (!validId(g, id) || g.done[id] || !Number.isFinite(x) || !Number.isFinite(y) || isWon(g)) return none;
    const { c, r } = cellOf(g, id);
    let dx = x - c;
    let dy = y - r;
    const next = copy(g);
    let members;
    const ti = next.tray.indexOf(id);
    if (ti >= 0) {
      next.tray.splice(ti, 1);
      members = [id];
    } else {
      const grp = groupOf(g, id);
      if (!grp) return none;
      next.loose = next.loose.filter((q) => q !== grp);
      members = grp.members.slice();
    }
    next.moves = g.moves + 1;

    let result = 'move';
    if (Math.hypot(dx, dy) > SNAP) {
      // Ghép với các nhóm rời có mảnh kề và độ lệch gần bằng; căn theo nhóm đầu tiên rồi xét tiếp
      let again = true;
      while (again) {
        again = false;
        for (let i = 0; i < next.loose.length; i++) {
          const q = next.loose[i];
          if (Math.hypot(q.dx - dx, q.dy - dy) <= SNAP && touching(g, members, q.members)) {
            dx = q.dx;
            dy = q.dy;
            members = members.concat(q.members);
            next.loose.splice(i, 1);
            result = 'merge';
            again = true;
            break;
          }
        }
      }
    }
    members = sortNum(members);
    if (Math.hypot(dx, dy) <= SNAP) {
      members.forEach((m) => { next.done[m] = true; });
      result = 'lock';
    } else {
      next.loose.push({ id: members[0], dx, dy, members });
    }
    return { game: next, result, members };
  }

  /** Đem mảnh rời (đứng một mình) về khay ở vị trí index. Nhóm nhiều mảnh / mảnh đã khóa thì không. */
  function toTray(g, id, index) {
    const grp = validId(g, id) && !g.done[id] ? groupOf(g, id) : null;
    if (!grp || grp.members.length !== 1) return { game: g, ok: false };
    const next = copy(g);
    next.loose = next.loose.filter((q) => q !== grp);
    const at = Number.isInteger(index) ? Math.max(0, Math.min(next.tray.length, index)) : next.tray.length;
    next.tray.splice(at, 0, id);
    next.moves = g.moves + 1;
    return { game: next, ok: true };
  }

  /* ---------------- Lưu ván ---------------- */

  const r4 = (v) => Math.round(v * 10000) / 10000;

  function toJSON(g) {
    const done = [];
    g.done.forEach((d, i) => { if (d) done.push(i); });
    return {
      v: VERSION,
      mode: g.mode,
      seed: g.seed,
      date: g.date,
      tray: g.tray.slice(),
      loose: g.loose.map((q) => ({ dx: r4(q.dx), dy: r4(q.dy), m: q.members.slice() })),
      done,
      moves: g.moves,
    };
  }

  /** Nhóm liền: mọi mảnh nối nhau qua cạnh kề. */
  function connected(g, ids) {
    const seen = new Set([ids[0]]);
    const queue = [ids[0]];
    while (queue.length) {
      const a = queue.shift();
      ids.forEach((b) => {
        if (!seen.has(b) && touching(g, [a], [b])) {
          seen.add(b);
          queue.push(b);
        }
      });
    }
    return seen.size === ids.length;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return null;
    if (MODES.indexOf(raw.mode) < 0 || !isSeed(raw.seed)) return null;
    if (raw.mode === 'daily') {
      if (!isDate(raw.date) || raw.seed !== dailySeed(raw.date)) return null;
    } else if (raw.date !== null) return null;
    if (!Number.isInteger(raw.moves) || raw.moves < 0) return null;
    if (!Array.isArray(raw.tray) || !Array.isArray(raw.done) || !Array.isArray(raw.loose)) return null;
    const g = newGame({ mode: raw.mode, seed: raw.seed, date: raw.date });
    const n = g.cols * g.rows;
    const seen = new Array(n).fill(false);
    const claim = (id) => {
      if (!validId(g, id) || seen[id]) return false;
      seen[id] = true;
      return true;
    };
    if (!raw.tray.every(claim) || !raw.done.every(claim)) return null;
    const loose = [];
    for (let i = 0; i < raw.loose.length; i++) {
      const q = raw.loose[i];
      if (!q || typeof q !== 'object' || !Array.isArray(q.m) || !q.m.length) return null;
      if (!Number.isFinite(q.dx) || !Number.isFinite(q.dy) || Math.abs(q.dx) > LIMIT || Math.abs(q.dy) > LIMIT) return null;
      if (!q.m.every(claim) || !connected(g, q.m)) return null;
      const members = sortNum(q.m);
      loose.push({ id: members[0], dx: q.dx, dy: q.dy, members });
    }
    if (!seen.every(Boolean)) return null;
    g.tray = raw.tray.slice();
    g.loose = loose;
    g.done = new Array(n).fill(false);
    raw.done.forEach((id) => { g.done[id] = true; });
    g.moves = raw.moves;
    return g;
  }

  const api = {
    VERSION, SIZES, MODES, SCENES, SNAP, MARGIN, MIN_MS_PER_PIECE,
    hashString, rng, isDate, dailySeed, pieceCount,
    newGame, cellOf, isEdge, sides, piecePath, sideSegments,
    groupOf, positionOf, drop, toTray, isWon, progress,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
