/* =====================================================================
 * Xếp Gạch - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Không đụng tới DOM. State là object thuần (JSON hóa được để lưu ván)
 *   - Khác 2048: các hàm thao tác SỬA TRỰC TIẾP state truyền vào, vì game chạy
 *     60 khung hình/giây (muốn giữ bản cũ thì gọi clone() trước)
 *   - Bàn 10 cột x 20 hàng nhìn thấy + 2 hàng ẩn phía trên (hàng 0, 1)
 *   - 7 khối I O T S Z J L, chia theo túi 7 (mỗi túi đủ 7 khối, xáo ngẫu nhiên)
 *   - Xoay SRS kèm bảng đá tường (wall kick), khối I có bảng riêng
 *   - Trễ khóa 500ms, đặt lại khi di chuyển / xoay, tối đa 15 lần mỗi độ cao
 *   - Ngẫu nhiên bằng PRNG có seed lưu trong state: lưu / khôi phục ván vẫn ra
 *     đúng thứ tự khối, và test chạy được tất định
 * ===================================================================== */
(function (root) {
  'use strict';

  const COLS = 10;
  const ROWS = 20; // số hàng nhìn thấy
  const HIDDEN = 2; // số hàng ẩn phía trên
  const TOTAL_ROWS = ROWS + HIDDEN;
  const PIECES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const NEXT_COUNT = 3; // số khối xem trước
  const LOCK_MS = 500; // trễ khóa
  const MAX_RESETS = 15; // số lần đặt lại trễ khóa tối đa (mỗi độ cao mới)
  const SOFT_MS = 35; // thả nhanh: 1 hàng mỗi 35ms (hoặc nhanh hơn nếu trọng lực đã nhanh hơn)
  const START_LEVELS = [1, 5, 10];
  const LINES_PER_LEVEL = 10;
  const MAX_LEVEL = 99;
  const LINE_SCORES = [0, 100, 300, 500, 800]; // x cấp
  const COMBO_SCORE = 50; // x số combo x cấp
  const B2B_MULT = 1.5; // xếp 4 hàng liên tiếp
  const MIN_GRAVITY_MS = 1000 / 60; // nhanh nhất 1 hàng mỗi khung hình

  /* ---------------- Hình khối (hướng 0, trục y hướng xuống) ---------------- */
  const BASE = {
    I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  // Mã ô trên bàn: 0 = trống, 1..7 theo thứ tự PIECES
  const PIECE_ID = {};
  PIECES.forEach((t, i) => (PIECE_ID[t] = i + 1));

  // SHAPES[t][r] = danh sách [x, y] trong khung n x n, r = 0 (gốc), 1 (phải), 2 (ngược), 3 (trái)
  const SHAPES = {};
  PIECES.forEach((t) => {
    const { n, cells } = BASE[t];
    const rots = [cells];
    for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x]));
    SHAPES[t] = rots;
  });

  /* ---------------- Bảng đá tường SRS ----------------
   * Viết theo quy ước gốc (y hướng LÊN), đổi sang y hướng xuống khi nạp.
   * Khóa 'a>b': xoay từ hướng a sang hướng b. */
  const KICKS_JLSTZ_UP = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I_UP = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  const flipY = (table) => {
    const out = {};
    Object.keys(table).forEach((k) => (out[k] = table[k].map(([x, y]) => [x, -y])));
    return out;
  };
  const KICKS_JLSTZ = flipY(KICKS_JLSTZ_UP);
  const KICKS_I = flipY(KICKS_I_UP);
  const NO_KICK = [[0, 0]];

  function kicksFor(t, from, to) {
    if (t === 'O') return NO_KICK;
    return (t === 'I' ? KICKS_I : KICKS_JLSTZ)[from + '>' + to];
  }

  /* ---------------- Tiện ích ---------------- */
  const idx = (x, y) => y * COLS + x;
  const isInt = (v) => Number.isInteger(v);

  /** Ô của khối t hướng r (tọa độ trong khung). */
  function shapeCells(t, r) {
    return SHAPES[t][((r % 4) + 4) % 4];
  }

  /** Ô tuyệt đối của khối { t, r, x, y } trên bàn. */
  function pieceCells(p) {
    return shapeCells(p.t, p.r).map(([cx, cy]) => [p.x + cx, p.y + cy]);
  }

  /** Khối t hướng r đặt tại (x, y) có chạm tường / đáy / ô đã có không. */
  function collides(board, t, r, x, y) {
    const cells = shapeCells(t, r);
    for (let i = 0; i < cells.length; i++) {
      const X = x + cells[i][0];
      const Y = y + cells[i][1];
      if (X < 0 || X >= COLS || Y < 0 || Y >= TOTAL_ROWS) return true;
      if (board[idx(X, Y)]) return true;
    }
    return false;
  }

  /** PRNG mulberry32, trạng thái lưu ở s.seed (số nguyên 32 bit). */
  function rand(s) {
    s.seed = (s.seed + 0x6d2b79f5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Một túi 7 khối đã xáo (Fisher-Yates). */
  function shuffledBag(s) {
    const bag = PIECES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    return bag;
  }

  /** Giữ hàng chờ luôn có ít nhất 7 khối (thêm nguyên túi nên ranh giới túi không đổi). */
  function fillQueue(s) {
    while (s.queue.length < PIECES.length) s.queue.push.apply(s.queue, shuffledBag(s));
  }

  /** Lấy khối kế tiếp khỏi hàng chờ. */
  function takeNext(s) {
    fillQueue(s);
    const t = s.queue.shift();
    fillQueue(s);
    return t;
  }

  /** Thời gian rơi 1 hàng (ms) theo cấp, công thức kiểu guideline, chặn ở 1 khung hình. */
  function gravityMs(level) {
    const l = Math.max(1, Math.min(level, 20));
    return Math.max(MIN_GRAVITY_MS, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000);
  }

  /** Điểm cơ bản khi xóa n hàng ở cấp level (chưa tính combo / liên tiếp). */
  function lineScore(n, level) {
    return (LINE_SCORES[n] || 0) * level;
  }

  /* ---------------- Tạo ván / sinh khối ---------------- */
  function newGame(opts) {
    const o = opts || {};
    const startLevel = START_LEVELS.includes(o.startLevel) ? o.startLevel : 1;
    const seed = isInt(o.seed) ? o.seed | 0 : Math.floor(Math.random() * 4294967296) | 0;
    const s = {
      v: 1,
      board: new Array(COLS * TOTAL_ROWS).fill(0),
      cur: null, // { t, r, x, y }
      queue: [],
      hold: null,
      canHold: true,
      score: 0,
      lines: 0,
      level: startLevel,
      startLevel,
      combo: -1, // số lần xóa hàng liên tiếp - 1 (-1 = chưa có chuỗi)
      b2b: false, // lần xóa gần nhất là xếp 4 hàng
      seed,
      gravAcc: 0,
      lockTimer: 0,
      lockResets: 0,
      lowestY: 0,
      over: false,
      pieces: 0, // số khối đã khóa
      quads: 0, // số lần xếp 4 hàng
      time: 0, // ms đã chơi
    };
    spawn(s, takeNext(s));
    return s;
  }

  /**
   * Đưa khối t vào bàn ở vị trí xuất phát (hàng ẩn), rồi hạ ngay 1 hàng nếu được.
   * Trả về false nếu chỗ xuất phát đã bị chiếm (thua: block out).
   */
  function spawn(s, t) {
    const p = { t, r: 0, x: t === 'O' ? 4 : 3, y: 0 };
    s.cur = p;
    s.gravAcc = 0;
    s.lockTimer = 0;
    s.lockResets = 0;
    if (collides(s.board, t, 0, p.x, p.y)) {
      s.over = true;
      s.lowestY = p.y;
      return false;
    }
    if (!collides(s.board, t, 0, p.x, p.y + 1)) p.y += 1;
    s.lowestY = p.y;
    return true;
  }

  const active = (s) => !s.over && !!s.cur;

  function grounded(s) {
    const p = s.cur;
    return collides(s.board, p.t, p.r, p.x, p.y + 1);
  }

  /** Hàng y mà khối sẽ rơi tới (dùng cho bóng khối và thả thẳng). */
  function ghostY(s) {
    const p = s.cur;
    if (!p) return 0;
    let y = p.y;
    while (!collides(s.board, p.t, p.r, p.x, y + 1)) y++;
    return y;
  }

  /** Khối vừa xuống tới độ cao mới: đặt lại bộ đếm trễ khóa. */
  function noteFall(s) {
    s.lockTimer = 0;
    if (s.cur.y > s.lowestY) {
      s.lowestY = s.cur.y;
      s.lockResets = 0;
    }
  }

  /** Sau khi di chuyển / xoay thành công: nếu khối đang chạm đáy thì đặt lại trễ khóa (có giới hạn). */
  function noteShift(s, wasGrounded) {
    if (wasGrounded && s.lockResets < MAX_RESETS) {
      s.lockTimer = 0;
      s.lockResets++;
    }
  }

  /* ---------------- Thao tác ---------------- */
  /** Dịch ngang dx ô. Trả về true nếu dịch được. */
  function move(s, dx) {
    if (!active(s)) return false;
    const p = s.cur;
    if (collides(s.board, p.t, p.r, p.x + dx, p.y)) return false;
    const was = grounded(s);
    p.x += dx;
    noteShift(s, was);
    return true;
  }

  /**
   * Xoay theo SRS: dir = 1 (phải / chiều kim đồng hồ) hoặc -1 (trái).
   * Thử lần lượt các độ đá trong bảng, trả về chỉ số độ đá dùng được (0..4), hoặc -1 nếu không xoay được.
   */
  function rotate(s, dir) {
    if (!active(s)) return -1;
    const p = s.cur;
    const from = p.r;
    const to = (from + (dir < 0 ? 3 : 1)) % 4;
    const kicks = kicksFor(p.t, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const nx = p.x + kicks[i][0];
      const ny = p.y + kicks[i][1];
      if (!collides(s.board, p.t, to, nx, ny)) {
        const was = grounded(s);
        p.r = to;
        p.x = nx;
        p.y = ny;
        if (ny > s.lowestY) noteFall(s);
        noteShift(s, was);
        return i;
      }
    }
    return -1;
  }

  /** Thả nhanh 1 hàng: +1 điểm. Trả về true nếu hạ được. */
  function softDrop(s) {
    if (!active(s) || grounded(s)) return false;
    s.cur.y++;
    s.score += 1;
    noteFall(s);
    return true;
  }

  /** Thả thẳng xuống đáy và khóa ngay: +2 điểm mỗi hàng. Trả về kết quả khóa kèm drop (số hàng rơi). */
  function hardDrop(s) {
    if (!active(s)) return null;
    const p = s.cur;
    const from = p.y;
    const gy = ghostY(s);
    const dist = gy - from;
    p.y = gy;
    s.score += dist * 2;
    const res = lock(s);
    res.drop = dist;
    res.dropFrom = from;
    return res;
  }

  /** Giữ khối: mỗi lượt rơi chỉ giữ được một lần. Trả về true nếu giữ được. */
  function hold(s) {
    if (!active(s) || !s.canHold) return false;
    const t = s.cur.t;
    const h = s.hold;
    s.hold = t;
    spawn(s, h || takeNext(s));
    s.canHold = false;
    return true;
  }

  /**
   * Tiến thời gian dt (ms): trọng lực + trễ khóa. soft = đang giữ thả nhanh.
   * Trả về kết quả khóa nếu khối bị khóa trong lượt này, ngược lại null.
   */
  function update(s, dt, soft) {
    if (!active(s) || !(dt > 0)) return null;
    s.time += dt;
    const g = gravityMs(s.level);
    const interval = soft ? Math.min(g, SOFT_MS) : g;
    s.gravAcc += dt;
    while (s.gravAcc >= interval) {
      if (grounded(s)) {
        s.gravAcc = 0;
        break;
      }
      s.gravAcc -= interval;
      s.cur.y++;
      if (soft) s.score += 1;
      noteFall(s);
    }
    if (grounded(s)) {
      s.lockTimer += dt;
      if (s.lockTimer >= LOCK_MS) return lock(s);
    } else {
      s.lockTimer = 0;
    }
    return null;
  }

  /** Chỉ số các hàng đã kín (từ trên xuống). */
  function fullRows(board) {
    const rows = [];
    for (let y = 0; y < TOTAL_ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (!board[idx(x, y)]) {
          full = false;
          break;
        }
      }
      if (full) rows.push(y);
    }
    return rows;
  }

  /** Xóa các hàng (SỬA TRỰC TIẾP board), các hàng phía trên dồn xuống. */
  function removeRows(board, rows) {
    if (!rows.length) return;
    const gone = new Set(rows);
    const kept = [];
    for (let y = 0; y < TOTAL_ROWS; y++) if (!gone.has(y)) kept.push(board.slice(y * COLS, (y + 1) * COLS));
    const out = new Array(rows.length * COLS).fill(0);
    kept.forEach((row) => out.push.apply(out, row));
    for (let i = 0; i < out.length; i++) board[i] = out[i];
  }

  /**
   * Khóa khối hiện tại vào bàn, xóa hàng, tính điểm, sinh khối mới.
   * Trả về {
   *   piece, cells,            // khối vừa khóa và các ô của nó
   *   rows, lines,             // các hàng bị xóa (chỉ số trước khi xóa) và số hàng
   *   boardBefore,             // bàn ngay trước khi xóa hàng (để chạy hiệu ứng), null nếu không xóa
   *   points, combo, b2b,      // điểm từ xóa hàng, chuỗi combo hiện tại, có thưởng liên tiếp không
   *   levelUp, over
   * }
   */
  function lock(s) {
    const p = s.cur;
    const cells = pieceCells(p);
    const id = PIECE_ID[p.t];
    let allHidden = true;
    cells.forEach(([x, y]) => {
      s.board[idx(x, y)] = id;
      if (y >= HIDDEN) allHidden = false;
    });
    s.pieces++;

    const rows = fullRows(s.board);
    const n = rows.length;
    const boardBefore = n ? s.board.slice() : null;
    removeRows(s.board, rows);

    let points = 0;
    let b2bBonus = false;
    if (n) {
      points = lineScore(n, s.level);
      const quad = n === 4;
      if (quad && s.b2b) {
        points = Math.floor(points * B2B_MULT);
        b2bBonus = true;
      }
      s.b2b = quad;
      if (quad) s.quads++;
      s.combo++;
      if (s.combo > 0) points += COMBO_SCORE * s.combo * s.level;
    } else {
      s.combo = -1;
    }
    s.score += points;
    s.lines += n;
    const oldLevel = s.level;
    s.level = Math.min(MAX_LEVEL, s.startLevel + Math.floor(s.lines / LINES_PER_LEVEL));

    const res = {
      piece: p.t,
      cells,
      rows,
      lines: n,
      boardBefore,
      points,
      combo: Math.max(0, s.combo),
      b2b: b2bBonus,
      levelUp: s.level > oldLevel,
      over: false,
      drop: 0,
      dropFrom: p.y,
    };

    // Khóa hoàn toàn trong vùng ẩn mà không xóa được hàng nào: thua (lock out)
    if (allHidden && !n) {
      s.over = true;
      s.cur = null;
      res.over = true;
      return res;
    }
    s.canHold = true;
    if (!spawn(s, takeNext(s))) res.over = true;
    return res;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function clone(s) {
    return JSON.parse(JSON.stringify(s));
  }

  const validPiece = (t) => PIECES.includes(t);

  /** Kiểm tra và chuẩn hóa state đọc từ bộ nhớ. Dữ liệu hỏng hoặc ván đã kết thúc thì trả về null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1 || obj.over === true) return null;
    const b = obj.board;
    if (!Array.isArray(b) || b.length !== COLS * TOTAL_ROWS) return null;
    for (let i = 0; i < b.length; i++) if (!isInt(b[i]) || b[i] < 0 || b[i] > PIECES.length) return null;
    const c = obj.cur;
    if (!c || !validPiece(c.t) || !isInt(c.r) || c.r < 0 || c.r > 3 || !isInt(c.x) || !isInt(c.y)) return null;
    if (collides(b, c.t, c.r, c.x, c.y)) return null;
    if (!Array.isArray(obj.queue) || obj.queue.length < NEXT_COUNT || obj.queue.length > 2 * PIECES.length) return null;
    if (!obj.queue.every(validPiece)) return null;
    if (obj.hold !== null && !validPiece(obj.hold)) return null;
    if (!START_LEVELS.includes(obj.startLevel)) return null;
    const nonNeg = (v) => isInt(v) && v >= 0;
    if (!nonNeg(obj.score) || !nonNeg(obj.lines) || !isInt(obj.level) || obj.level < 1 || obj.level > MAX_LEVEL) return null;
    if (!isInt(obj.seed)) return null;
    const num = (v, def) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : def);
    const s = {
      v: 1,
      board: b.slice(),
      cur: { t: c.t, r: c.r, x: c.x, y: c.y },
      queue: obj.queue.slice(),
      hold: obj.hold,
      canHold: obj.canHold !== false,
      score: obj.score,
      lines: obj.lines,
      level: obj.level,
      startLevel: obj.startLevel,
      combo: isInt(obj.combo) && obj.combo >= -1 ? obj.combo : -1,
      b2b: obj.b2b === true,
      seed: obj.seed | 0,
      gravAcc: Math.min(num(obj.gravAcc, 0), 1000),
      lockTimer: Math.min(num(obj.lockTimer, 0), LOCK_MS),
      lockResets: Math.min(nonNeg(obj.lockResets) ? obj.lockResets : 0, MAX_RESETS),
      lowestY: isInt(obj.lowestY) ? obj.lowestY : c.y,
      over: false,
      pieces: nonNeg(obj.pieces) ? obj.pieces : 0,
      quads: nonNeg(obj.quads) ? obj.quads : 0,
      time: num(obj.time, 0),
    };
    fillQueue(s);
    return s;
  }

  const api = {
    COLS,
    ROWS,
    HIDDEN,
    TOTAL_ROWS,
    PIECES,
    PIECE_ID,
    NEXT_COUNT,
    LOCK_MS,
    MAX_RESETS,
    SOFT_MS,
    START_LEVELS,
    LINES_PER_LEVEL,
    LINE_SCORES,
    COMBO_SCORE,
    B2B_MULT,
    KICKS_I,
    KICKS_JLSTZ,
    shapeCells,
    pieceCells,
    collides,
    gravityMs,
    lineScore,
    newGame,
    spawn,
    takeNext,
    move,
    rotate,
    softDrop,
    hardDrop,
    hold,
    update,
    lock,
    ghostY,
    grounded,
    fullRows,
    removeRows,
    clone,
    restore,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.XepGach = api;
})(typeof window !== 'undefined' ? window : null);
