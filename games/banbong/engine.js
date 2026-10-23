/* =====================================================================
 * Bắn Bóng - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Không đụng tới DOM. Các hàm thao tác (shoot, swap, pushRow...) SỬA TRỰC TIẾP state
 *   - Lưới lục giác dạng lệch hàng: hàng "dài" có COLS ô, hàng "ngắn" có COLS - 1 ô và lệch phải nửa ô.
 *     Hàng r ngắn khi (r + parity) lẻ; đẩy thêm hàng từ trên xuống thì parity đảo để các hàng cũ giữ dáng
 *   - Sân logic cố định W x H (px logic), app co giãn khi vẽ
 *   - shoot() tính trọn một phát bắn ngay lập tức (đường bay, ô dính, nổ, rơi, điểm, đẩy hàng, thua,
 *     dọn sạch bàn) và trả về sự kiện để app diễn hoạt; nhờ vậy state lúc nào cũng nhất quán, lưu được
 *   - Số ngẫu nhiên lấy từ PRNG có seed lưu trong state: test chạy tất định, ván khôi phục chia bóng
 *     giống ván gốc
 *   - State là object thuần, JSON.stringify được
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------- Kích thước (px logic) ---------------- */
  const COLS = 11; // số ô của hàng dài
  const R = 16; // bán kính bóng
  const D = R * 2; // đường kính = khoảng cách tâm hai ô kề nhau
  const RH = R * Math.sqrt(3); // khoảng cách tâm hai hàng
  const W = COLS * D; // 352
  const H = 440;
  const DANGER_ROW = 12; // còn bóng ở hàng này (hoặc thấp hơn) là thua
  const MAX_ROWS = DANGER_ROW + 1; // số hàng tối đa state có thể giữ
  const DANGER_Y = R + (DANGER_ROW - 0.5) * RH; // vạch nguy hiểm vẽ trên sân
  const SX = W / 2; // tâm bóng chờ bắn
  const SY = H - 44;
  const MAX_ANGLE = (80 * Math.PI) / 180; // góc ngắm tối đa so với phương thẳng đứng
  const COLLIDE = D * 0.84; // hai tâm gần hơn ngần này là chạm (nhỏ hơn đường kính một chút để lách khe dễ hơn)
  const TRACE_STEP = 2; // bước quét đường bay (px logic)
  const NCOLORS = 6; // số màu tối đa
  const CLUSTER = 0.45; // xác suất một ô lấy màu ô kề khi sinh bàn (cao thì cụm to, bàn dễ)

  /* ---------------- Điểm ---------------- */
  const POP_POINTS = 10; // mỗi bóng nổ
  const COMBO_STEP_POINTS = 5; // mỗi bậc chuỗi thêm 5 điểm cho mỗi bóng nổ...
  const COMBO_MAX_STEPS = 2; // ...tối đa 2 bậc (bóng nổ đáng 20 điểm)
  const DROP_BASE = 10; // bóng rơi thứ i đáng 10 x 2^i: 20, 40, 60, 60...
  const DROP_CAP = 60; // ...nhưng không quá 60 điểm mỗi bóng
  const CLEAR_BASE = 500; // dọn sạch bàn: 500 + 250 x (bàn - 1), tối đa 2000
  const CLEAR_STEP = 250;
  const CLEAR_CAP = 2000;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isInt = (v) => Number.isInteger(v);
  const isNat = (v) => Number.isInteger(v) && v >= 0;

  /* ---------------- PRNG (mulberry32, trạng thái nằm trong state) ---------------- */
  function rand(g) {
    g.seed = (g.seed + 0x6d2b79f5) >>> 0;
    let t = g.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (g, n) => Math.floor(rand(g) * n);

  /* ---------------- Hình học lưới ---------------- */
  /** Hàng r là hàng ngắn (lệch phải nửa ô)? */
  const isShort = (g, r) => (r + g.parity) % 2 === 1;
  const rowLen = (g, r) => (isShort(g, r) ? COLS - 1 : COLS);
  const inGrid = (g, r, c) => r >= 0 && r < MAX_ROWS && c >= 0 && c < rowLen(g, r);
  const cellAt = (g, r, c) => (r >= 0 && r < g.rows.length && c >= 0 && c < COLS ? g.rows[r][c] : 0);

  /** Tâm ô (r, c) theo px logic. */
  function cellXY(g, r, c) {
    return { x: R + c * D + (isShort(g, r) ? R : 0), y: R + r * RH };
  }

  /** Các ô kề (tối đa 6) còn nằm trong lưới. Hàng ngắn lệch phải nên kề cột c, c+1 của hàng trên/dưới;
   *  hàng dài kề cột c-1, c. */
  function neighbors(g, r, c) {
    const d = isShort(g, r) ? 0 : -1;
    const out = [
      [r, c - 1],
      [r, c + 1],
      [r - 1, c + d],
      [r - 1, c + d + 1],
      [r + 1, c + d],
      [r + 1, c + d + 1],
    ];
    return out.filter(([rr, cc]) => inGrid(g, rr, cc));
  }

  function emptyRow() {
    return new Array(COLS).fill(0);
  }
  function ensureRows(g, n) {
    while (g.rows.length < n) g.rows.push(emptyRow());
  }
  /** Bỏ các hàng trống ở cuối. */
  function trim(g) {
    while (g.rows.length && g.rows[g.rows.length - 1].every((v) => v === 0)) g.rows.pop();
  }

  function bubbleCount(g) {
    let n = 0;
    g.rows.forEach((row) => row.forEach((v) => v && n++));
    return n;
  }

  /** Các màu còn trên bàn, tăng dần. */
  function colorsOnBoard(g) {
    const seen = new Set();
    g.rows.forEach((row) => row.forEach((v) => v && seen.add(v)));
    return Array.from(seen).sort((a, b) => a - b);
  }

  /* ---------------- Bàn chơi ---------------- */
  /** Bàn N: số hàng và số màu tăng dần (bàn sau dày hơn, nhiều màu hơn). */
  function levelConfig(level) {
    return { rows: Math.min(4 + level, 8), colors: Math.min(3 + level, NCOLORS) };
  }

  /** Tô một hàng: mỗi ô có CLUSTER (45%) cơ hội lấy màu một ô kề đã có bóng (tạo cụm), còn lại chọn ngẫu nhiên. */
  function fillRow(g, r, ncolors) {
    for (let c = 0; c < rowLen(g, r); c++) {
      const near = neighbors(g, r, c)
        .map(([rr, cc]) => cellAt(g, rr, cc))
        .filter((v) => v > 0 && v <= ncolors);
      g.rows[r][c] = near.length && rand(g) < CLUSTER ? near[randInt(g, near.length)] : 1 + randInt(g, ncolors);
    }
  }

  function makeBoard(g) {
    const cfg = levelConfig(g.level);
    g.rows = [];
    g.parity = 0;
    ensureRows(g, cfg.rows);
    for (let r = 0; r < cfg.rows; r++) fillRow(g, r, cfg.colors);
  }

  /** Chia một bóng: chỉ lấy màu còn trên bàn (bàn trống thì lấy theo bộ màu của bàn hiện tại). */
  function deal(g) {
    const cs = colorsOnBoard(g);
    if (!cs.length) return 1 + randInt(g, levelConfig(g.level).colors);
    return cs[randInt(g, cs.length)];
  }

  /** Bóng đang chờ / bóng kế mang màu đã hết trên bàn thì chia lại. */
  function refreshHand(g) {
    const cs = colorsOnBoard(g);
    if (!cs.length) return;
    if (!cs.includes(g.current)) g.current = deal(g);
    if (!cs.includes(g.next)) g.next = deal(g);
  }

  function newGame(seed) {
    const g = {
      v: 1,
      rows: [],
      parity: 0,
      current: 1,
      next: 1,
      score: 0,
      misses: 0, // số phát trượt liên tiếp tính tới lần đẩy hàng kế tiếp
      combo: 0, // số phát nổ liên tiếp
      level: 1, // bàn thứ mấy (dọn sạch bàn thì tăng)
      shots: 0,
      popped: 0,
      dropped: 0,
      bestCombo: 0,
      over: false,
      seed: (isInt(seed) ? seed : Math.floor(Math.random() * 4294967296)) >>> 0,
    };
    makeBoard(g);
    g.current = deal(g);
    g.next = deal(g);
    return g;
  }

  /** Số phát trượt trước khi bàn bị đẩy xuống một hàng: giảm dần theo điểm. */
  function missLimit(score) {
    return score < 2000 ? 6 : score < 5000 ? 5 : score < 10000 ? 4 : 3;
  }

  /** Đẩy một hàng mới vào từ trên cùng (mọi hàng cũ tụt xuống một hàng). */
  function pushRow(g) {
    g.parity = 1 - g.parity;
    g.rows.unshift(emptyRow());
    fillRow(g, 0, levelConfig(g.level).colors);
    trim(g);
  }

  /** Còn bóng chạm vạch nguy hiểm? */
  function crossed(g) {
    for (let r = DANGER_ROW; r < g.rows.length; r++) if (g.rows[r].some((v) => v)) return true;
    return false;
  }

  /* ---------------- Cụm và bóng lơ lửng ---------------- */
  /** Cụm cùng màu liền nhau chứa ô (r, c) (loang theo 6 hướng). */
  function findCluster(g, r, c) {
    const color = cellAt(g, r, c);
    if (!color) return [];
    const seen = new Set([r + ',' + c]);
    const out = [];
    const stack = [[r, c]];
    while (stack.length) {
      const [rr, cc] = stack.pop();
      out.push([rr, cc]);
      neighbors(g, rr, cc).forEach(([nr, nc]) => {
        const k = nr + ',' + nc;
        if (seen.has(k) || cellAt(g, nr, nc) !== color) return;
        seen.add(k);
        stack.push([nr, nc]);
      });
    }
    return out;
  }

  /** Các bóng không còn nối (trực tiếp hay gián tiếp) với trần. */
  function findFloating(g) {
    const seen = new Set();
    const stack = [];
    if (g.rows.length) {
      g.rows[0].forEach((v, c) => {
        if (v && c < rowLen(g, 0)) {
          seen.add('0,' + c);
          stack.push([0, c]);
        }
      });
    }
    while (stack.length) {
      const [r, c] = stack.pop();
      neighbors(g, r, c).forEach(([nr, nc]) => {
        const k = nr + ',' + nc;
        if (seen.has(k) || !cellAt(g, nr, nc)) return;
        seen.add(k);
        stack.push([nr, nc]);
      });
    }
    const out = [];
    g.rows.forEach((row, r) => row.forEach((v, c) => v && !seen.has(r + ',' + c) && out.push([r, c])));
    return out;
  }

  /* ---------------- Đường bay và chỗ dính ---------------- */
  /** Ô trống gần điểm (x, y) nhất để bóng dính vào. Chạm trần: ô trống hàng 0. Chạm bóng (hit):
   *  ô trống kề bóng đó. Không có thì lấy ô trống gần nhất còn bám được (hàng 0 hoặc kề một bóng). */
  function snapCell(g, x, y, hit) {
    let cands;
    if (hit) {
      cands = neighbors(g, hit[0], hit[1]).filter(([r, c]) => !cellAt(g, r, c));
    } else {
      cands = [];
      for (let c = 0; c < rowLen(g, 0); c++) if (!cellAt(g, 0, c)) cands.push([0, c]);
    }
    if (!cands.length) {
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < rowLen(g, r); c++) {
          if (cellAt(g, r, c)) continue;
          if (r === 0 || neighbors(g, r, c).some(([nr, nc]) => cellAt(g, nr, nc))) cands.push([r, c]);
        }
      }
    }
    let best = null;
    let bestD = Infinity;
    cands.forEach(([r, c]) => {
      const p = cellXY(g, r, c);
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = { r, c };
      }
    });
    return best;
  }

  /** Bóng ở (x, y) chạm bóng nào trên bàn (chỉ xét các hàng gần y)? */
  function hitAt(g, x, y) {
    const r0 = Math.max(0, Math.floor((y - R) / RH) - 1);
    const r1 = Math.min(g.rows.length - 1, r0 + 3);
    let best = null;
    let bestD = COLLIDE * COLLIDE;
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < rowLen(g, r); c++) {
        if (!g.rows[r][c]) continue;
        const p = cellXY(g, r, c);
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bestD) {
          bestD = d;
          best = [r, c];
        }
      }
    }
    return best;
  }

  /** Quét đường bay theo góc (radian, 0 = thẳng lên, dương = sang phải), nảy ở hai tường bên.
   *  Trả về { points: [[x, y], ...các điểm nảy, điểm chạm], bounces, cell: {r, c} } */
  function trace(g, angle) {
    const a = clamp(Number(angle) || 0, -MAX_ANGLE, MAX_ANGLE);
    let x = SX;
    let y = SY;
    let dx = Math.sin(a);
    const dy = -Math.cos(a);
    const points = [[x, y]];
    let bounces = 0;
    const maxSteps = Math.ceil((H * 8) / TRACE_STEP);
    for (let i = 0; i < maxSteps; i++) {
      let nx = x + dx * TRACE_STEP;
      let ny = y + dy * TRACE_STEP;
      // Nảy tường: tính đúng điểm chạm tường rồi phản xạ phần đi quá
      if (nx < R || nx > W - R) {
        const wx = nx < R ? R : W - R;
        const k = (wx - x) / (nx - x);
        const by = y + (ny - y) * k;
        points.push([wx, by]);
        bounces++;
        nx = 2 * wx - nx;
        dx = -dx;
      }
      x = nx;
      y = ny;
      if (y <= R) {
        y = R;
        points.push([x, y]);
        return { points, bounces, cell: snapCell(g, x, y, null) };
      }
      const hit = hitAt(g, x, y);
      if (hit) {
        points.push([x, y]);
        return { points, bounces, cell: snapCell(g, x, y, hit) };
      }
    }
    // Không thể xảy ra với góc đã kẹp; phòng hờ: dính lên trần
    points.push([x, R]);
    return { points, bounces, cell: snapCell(g, x, R, null) };
  }

  /* ---------------- Điểm ---------------- */
  /** Điểm khi nổ n bóng ở phát nổ liên tiếp thứ combo (1 = phát đầu tiên). */
  function popPoints(n, combo) {
    return n * (POP_POINTS + COMBO_STEP_POINTS * clamp(combo - 1, 0, COMBO_MAX_STEPS));
  }
  /** Điểm khi m bóng rơi: bóng thứ i đáng 10 x 2^i, tối đa 60. */
  function dropPoints(m) {
    let s = 0;
    for (let i = 1; i <= m; i++) s += Math.min(DROP_BASE * Math.pow(2, i), DROP_CAP);
    return s;
  }
  function clearBonus(level) {
    return Math.min(CLEAR_BASE + CLEAR_STEP * (level - 1), CLEAR_CAP);
  }

  /* ---------------- Một phát bắn ---------------- */
  /** Bắn bóng đang chờ theo góc angle. Sửa state, trả về sự kiện (null nếu ván đã kết thúc). */
  function shoot(g, angle) {
    if (g.over) return null;
    const tr = trace(g, angle);
    const color = g.current;
    const ev = {
      path: tr.points,
      bounces: tr.bounces,
      cell: null,
      color,
      popped: [],
      dropped: [],
      popPoints: 0,
      dropPoints: 0,
      combo: 0,
      points: 0,
      missed: false,
      pushed: false,
      cleared: false,
      clearBonus: 0,
      level: g.level,
      over: false,
    };
    g.shots++;
    const cell = tr.cell;
    if (!cell) {
      // Không còn chỗ nào để dính (bàn đầy tới đáy): thua
      g.over = true;
      ev.over = true;
      return ev;
    }
    ensureRows(g, cell.r + 1);
    g.rows[cell.r][cell.c] = color;
    const p = cellXY(g, cell.r, cell.c);
    ev.cell = { r: cell.r, c: cell.c, x: p.x, y: p.y };
    ev.path.push([p.x, p.y]);

    const cluster = findCluster(g, cell.r, cell.c);
    const take = (list) =>
      list.map(([r, c]) => {
        const q = cellXY(g, r, c);
        const v = g.rows[r][c];
        g.rows[r][c] = 0;
        return { r, c, x: q.x, y: q.y, color: v };
      });
    if (cluster.length >= 3) {
      ev.popped = take(cluster);
      ev.dropped = take(findFloating(g));
      g.combo++;
      if (g.combo > g.bestCombo) g.bestCombo = g.combo;
      ev.combo = g.combo;
      ev.popPoints = popPoints(ev.popped.length, g.combo);
      ev.dropPoints = dropPoints(ev.dropped.length);
      ev.points = ev.popPoints + ev.dropPoints;
      g.popped += ev.popped.length;
      g.dropped += ev.dropped.length;
      g.score += ev.points;
    } else {
      g.combo = 0;
      g.misses++;
      ev.missed = true;
    }
    trim(g);

    // Bóng kế lên thay, chia bóng mới
    g.current = g.next;
    g.next = deal(g);

    if (!bubbleCount(g)) {
      // Dọn sạch bàn: thưởng lớn, sang bàn mới dày hơn
      ev.cleared = true;
      ev.clearBonus = clearBonus(g.level);
      g.score += ev.clearBonus;
      ev.points += ev.clearBonus;
      g.level++;
      g.misses = 0;
      makeBoard(g);
    } else if (ev.missed && g.misses >= missLimit(g.score)) {
      g.misses = 0;
      pushRow(g);
      ev.pushed = true;
    }
    refreshHand(g);
    if (crossed(g)) {
      g.over = true;
      ev.over = true;
    }
    return ev;
  }

  /** Đổi bóng đang chờ với bóng kế. */
  function swap(g) {
    if (g.over || g.current === g.next) return false;
    const t = g.current;
    g.current = g.next;
    g.next = t;
    return true;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return JSON.parse(JSON.stringify(g));
  }

  /** Dựng lại state từ dữ liệu đã lưu; dữ liệu hỏng / sai luật trả về null. */
  function restore(o) {
    try {
      if (!o || typeof o !== 'object' || o.v !== 1) return null;
      if (o.parity !== 0 && o.parity !== 1) return null;
      if (!Array.isArray(o.rows) || o.rows.length > MAX_ROWS) return null;
      // Cùng thứ tự khóa với newGame() để JSON của ván khôi phục giống hệt ván gốc
      const g = { v: 1, rows: [], parity: o.parity, current: 1, next: 1 };
      for (let r = 0; r < o.rows.length; r++) {
        const row = o.rows[r];
        if (!Array.isArray(row) || row.length !== COLS) return null;
        for (let c = 0; c < COLS; c++) {
          const v = row[c];
          if (!isInt(v) || v < 0 || v > NCOLORS) return null;
          if (v && c >= rowLen(g, r)) return null; // ô thừa ở cuối hàng ngắn
        }
        g.rows.push(row.slice());
      }
      trim(g);
      if (!bubbleCount(g)) return null;
      const color = (v) => isInt(v) && v >= 1 && v <= NCOLORS;
      if (!color(o.current) || !color(o.next)) return null;
      const nats = ['score', 'misses', 'combo', 'shots', 'popped', 'dropped', 'bestCombo'];
      if (!nats.every((k) => isNat(o[k]))) return null;
      if (!isInt(o.level) || o.level < 1 || o.level > 9999) return null;
      if (!isInt(o.seed) || o.seed < 0 || o.seed > 4294967295) return null;
      if (typeof o.over !== 'boolean') return null;
      g.current = o.current;
      g.next = o.next;
      g.score = o.score;
      g.misses = Math.min(o.misses, missLimit(o.score) - 1);
      g.combo = o.combo;
      g.level = o.level;
      g.shots = o.shots;
      g.popped = o.popped;
      g.dropped = o.dropped;
      g.bestCombo = o.bestCombo;
      g.over = o.over || crossed(g);
      g.seed = o.seed >>> 0;
      return g;
    } catch (e) {
      return null;
    }
  }

  const api = {
    COLS,
    R,
    D,
    RH,
    W,
    H,
    DANGER_ROW,
    MAX_ROWS,
    DANGER_Y,
    SX,
    SY,
    MAX_ANGLE,
    COLLIDE,
    NCOLORS,
    isShort,
    rowLen,
    cellXY,
    cellAt,
    neighbors,
    levelConfig,
    newGame,
    makeBoard,
    fillRow,
    deal,
    colorsOnBoard,
    bubbleCount,
    missLimit,
    pushRow,
    crossed,
    findCluster,
    findFloating,
    snapCell,
    trace,
    popPoints,
    dropPoints,
    clearBonus,
    shoot,
    swap,
    toJSON,
    restore,
    rand,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BanBong = api;
})(typeof window !== 'undefined' ? window : null);
