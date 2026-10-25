/* =====================================================================
 * Cột Ngọc - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Giếng COLS × ROWS ô nhìn thấy + HIDDEN hàng ẩn phía trên (lưới phẳng, chỉ số = hàng * COLS + cột,
 *     hàng 0 ở trên cùng). Mã ô: 0 = trống, 1..6 = màu ngọc
 *   - Khối rơi: cột dọc 3 viên { x, y, c: [trên, giữa, dưới] }, y là hàng của viên dưới cùng.
 *     Xuất hiện ở cột SPAWN_COL, viên dưới ở hàng nhìn thấy đầu tiên (hai viên trên còn khuất)
 *   - Sinh ngọc: túi 18 viên (6 màu × 3) xáo bằng PRNG mulberry32, mỗi khối rút 3 viên → màu luôn cân.
 *     Từ khối thứ MAGIC_FROM + 1, mỗi khối có xác suất MAGIC_CHANCE là khối ngọc ma thuật (mã 7)
 *   - Mô phỏng theo bước cố định 1/60 s: cùng seed + cùng chuỗi thao tác theo tick thì ra cùng kết quả
 *     (app chỉ đổi thời gian thật thành số bước bằng ticksFor)
 *   - Khóa: chạm đáy / đè lên ngọc thì đếm LOCK_TICKS bước rồi khóa; dịch / xoay khi đang chạm đặt lại bộ
 *     đếm (tối đa MAX_RESETS lần mỗi độ cao mới). Thả cứng khóa ngay
 *   - Xóa: mọi hàng ≥ 3 viên cùng màu theo ngang, dọc, hai đường chéo bị xóa cùng lúc (pha 'clear'
 *     kéo dài CLEAR_TICKS), viên phía trên rơi xuống, xét tiếp → dây chuyền
 *   - Điểm mỗi đợt xóa = số viên × JEWEL_POINTS × cấp × bậc dây chuyền (1, 2, 3…);
 *     rơi nhanh +1 mỗi hàng, thả cứng +2 mỗi hàng. Cấp = 1 + ⌊viên đã xóa / LEVEL_JEWELS⌋ (tối đa MAX_LEVEL)
 *   - Hết ván: ô xuất hiện bị chiếm khi ra khối mới ('blocked'), hoặc xóa xong vẫn còn ngọc nằm
 *     trong vùng ẩn trên miệng giếng ('top')
 *   - Hàm thuần: nhận trạng thái cũ, trả trạng thái mới (không sửa trạng thái vào); `fx` của trạng thái
 *     trả về liệt kê sự kiện vừa xảy ra (cho âm thanh / hiệu ứng), không lưu vào ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số ---------------- */
  const COLS = 6;
  const ROWS = 13; // số hàng nhìn thấy
  const HIDDEN = 2; // hàng ẩn phía trên (chứa hai viên trên của khối vừa ra)
  const TOTAL = ROWS + HIDDEN;
  const CELLS = COLS * TOTAL;
  const COLORS = 6;
  const MAGIC = 7; // mã viên ngọc ma thuật (chỉ có trong khối rơi, không nằm lại trên lưới)
  const SPAWN_COL = 2;
  const HZ = 60;
  const TICK_MS = 1000 / HZ;
  const MAX_FRAME_MS = 100; // khung hình dài hơn (tab vừa quay lại, máy khựng) chỉ tính bằng chừng này
  const LOCK_TICKS = 30; // trễ khóa 0,5 s
  const MAX_RESETS = 15;
  const SOFT_TICKS = 2; // rơi nhanh: 1 hàng mỗi 2 bước (30 hàng / giây)
  const CLEAR_TICKS = 24; // mỗi đợt xóa trong dây chuyền 0,4 s
  const LEVEL_JEWELS = 30;
  const MAX_LEVEL = 20;
  const JEWEL_POINTS = 10;
  const SOFT_POINTS = 1;
  const HARD_POINTS = 2;
  const MAGIC_FROM = 20; // khối thứ 21 trở đi mới có thể là ngọc ma thuật
  const MAGIC_CHANCE = 1 / 40;
  const BAG = 3; // mỗi màu 3 viên trong một túi
  const PHASES = ['fall', 'clear', 'over'];
  const CAUSES = ['blocked', 'top'];
  // Bốn hướng xét hàng: ngang, dọc, chéo xuống phải, chéo lên phải
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  const idx = (x, y) => y * COLS + x;
  /** Số bước để khối rơi một hàng ở cấp `level` (cấp 1: 0,8 s / hàng, cấp 20: 2 bước). */
  const gravityFor = (level) => Math.max(2, Math.round(48 * Math.pow(0.82, level - 1)));
  const levelFor = (jewels) => Math.min(MAX_LEVEL, 1 + Math.floor(jewels / LEVEL_JEWELS));
  const isMagic = (c) => c[0] === MAGIC;

  /* ---------------- PRNG mulberry32 (trạng thái 32 bit lưu trong ván) ---------------- */
  function rand(s) {
    const state = (s + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { state, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }
  /** Số ngẫu nhiên [0, 1) kế tiếp, ghi trạng thái PRNG vào g (chỉ gọi trên bản sao). */
  function nextRand(g) {
    const r = rand(g.rng);
    g.rng = r.state;
    return r.value;
  }

  /* ---------------- Lưới: va chạm, tìm hàng, rơi ---------------- */
  /** Khối 3 viên có viên dưới ở (x, y) nằm vừa lưới không. */
  function fits(grid, x, y) {
    if (x < 0 || x >= COLS || y < 2 || y >= TOTAL) return false;
    return !grid[idx(x, y)] && !grid[idx(x, y - 1)] && !grid[idx(x, y - 2)];
  }

  /** Hàng thấp nhất khối ở cột x rơi tới được (tính từ hàng y). */
  function dropY(grid, x, y) {
    while (fits(grid, x, y + 1)) y++;
    return y;
  }

  /**
   * Mọi ô thuộc một hàng ≥ 3 viên cùng màu (ngang, dọc, hai đường chéo), trả mảng chỉ số tăng dần.
   * Hàng dài hơn 3 lấy trọn; các hàng giao nhau chỉ tính mỗi ô một lần.
   */
  function findMatches(grid) {
    const mark = new Uint8Array(CELLS);
    let any = false;
    for (let y = 0; y < TOTAL; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = grid[idx(x, y)];
        if (!v) continue;
        for (let d = 0; d < 4; d++) {
          const dx = DIRS[d][0];
          const dy = DIRS[d][1];
          // Chỉ đếm từ đầu hàng (ô liền trước theo hướng này khác màu hoặc ngoài lưới)
          const px = x - dx;
          const py = y - dy;
          if (px >= 0 && px < COLS && py >= 0 && py < TOTAL && grid[idx(px, py)] === v) continue;
          let n = 1;
          for (;;) {
            const nx = x + dx * n;
            const ny = y + dy * n;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= TOTAL || grid[idx(nx, ny)] !== v) break;
            n++;
          }
          if (n >= 3) {
            any = true;
            for (let k = 0; k < n; k++) mark[idx(x + dx * k, y + dy * k)] = 1;
          }
        }
      }
    }
    if (!any) return [];
    const out = [];
    for (let i = 0; i < CELLS; i++) if (mark[i]) out.push(i);
    return out;
  }

  /** Mọi ô cùng màu `color` (ngọc ma thuật). */
  function cellsOfColor(grid, color) {
    const out = [];
    for (let i = 0; i < CELLS; i++) if (grid[i] === color) out.push(i);
    return out;
  }

  /** Dồn ngọc mỗi cột xuống đáy, giữ thứ tự (sửa thẳng `grid`). */
  function collapse(grid) {
    for (let x = 0; x < COLS; x++) {
      let w = TOTAL - 1;
      for (let y = TOTAL - 1; y >= 0; y--) {
        const v = grid[idx(x, y)];
        if (v) {
          if (w !== y) {
            grid[idx(x, w)] = v;
            grid[idx(x, y)] = 0;
          }
          w--;
        }
      }
    }
    return grid;
  }

  /** Còn ngọc trong vùng ẩn không (tràn miệng giếng). */
  function overflow(grid) {
    for (let i = 0; i < HIDDEN * COLS; i++) if (grid[i]) return true;
    return false;
  }

  /**
   * Đặt khối `c` ở cột x (thả từ hàng y, mặc định chỗ xuất hiện) rồi xóa hết dây chuyền, tính ngay
   * không qua pha 'clear'. Cho bot / test: cùng luật với step nhưng không có thời gian. Trả
   * { grid, points, jewels, chains, over, y } (points chưa gồm điểm rơi nhanh / thả cứng).
   */
  function settle(grid, x, c, level, jewels, y) {
    const g = grid.slice();
    const by = dropY(g, x, y == null ? HIDDEN : y);
    let lv = level;
    let jw = jewels;
    let points = 0;
    let chain = 0;
    let marked;
    if (isMagic(c)) {
      const below = by + 1 < TOTAL ? g[idx(x, by + 1)] : 0;
      marked = below ? cellsOfColor(g, below) : [];
    } else {
      g[idx(x, by - 2)] = c[0];
      g[idx(x, by - 1)] = c[1];
      g[idx(x, by)] = c[2];
      marked = findMatches(g);
    }
    while (marked.length) {
      chain++;
      points += marked.length * JEWEL_POINTS * lv * chain;
      jw += marked.length;
      lv = levelFor(jw);
      for (const i of marked) g[i] = 0;
      collapse(g);
      marked = findMatches(g);
    }
    return { grid: g, points, jewels: jw - jewels, chains: chain, over: overflow(g), y: by };
  }

  /* ---------------- Sinh khối ---------------- */
  function refill(g) {
    const bag = [];
    for (let c = 1; c <= COLORS; c++) for (let k = 0; k < BAG; k++) bag.push(c);
    // Fisher–Yates
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand(g) * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    g.bag = bag;
  }

  /** Rút khối kế tiếp (ghi thẳng vào g: chỉ gọi trên bản sao). */
  function draw(g) {
    g.drawn++;
    if (g.drawn > MAGIC_FROM && nextRand(g) < MAGIC_CHANCE) return [MAGIC, MAGIC, MAGIC];
    const c = [];
    for (let i = 0; i < 3; i++) {
      if (!g.bag.length) refill(g);
      c.push(g.bag.pop());
    }
    return c;
  }

  /* ---------------- Trạng thái ---------------- */
  function clone(g) {
    return {
      seed: g.seed, rng: g.rng, bag: g.bag.slice(), grid: g.grid.slice(),
      piece: g.piece ? { x: g.piece.x, y: g.piece.y, c: g.piece.c.slice() } : null,
      next: g.next.slice(), phase: g.phase, tick: g.tick, grav: g.grav, lock: g.lock, resets: g.resets, low: g.low,
      clearT: g.clearT, marked: g.marked.slice(), chain: g.chain, score: g.score, level: g.level, jewels: g.jewels,
      pieces: g.pieces, drawn: g.drawn, maxChain: g.maxChain, cause: g.cause, fx: [],
    };
  }

  /** Ra khối mới từ `next`; ô xuất hiện bị chiếm thì hết ván. */
  function spawn(g) {
    g.chain = 0;
    if (g.grid[idx(SPAWN_COL, HIDDEN)]) {
      g.piece = null;
      g.phase = 'over';
      g.cause = 'blocked';
      g.fx.push({ type: 'over', cause: 'blocked' });
      return;
    }
    g.piece = { x: SPAWN_COL, y: HIDDEN, c: g.next };
    g.next = draw(g);
    g.pieces++;
    g.phase = 'fall';
    g.grav = 0;
    g.lock = 0;
    g.resets = 0;
    g.low = HIDDEN;
    g.fx.push({ type: 'spawn' });
  }

  function newGame(seed) {
    seed = seed >>> 0 || 1;
    const g = {
      seed, rng: seed, bag: [], grid: new Array(CELLS).fill(0), piece: null, next: null, phase: 'fall',
      tick: 0, grav: 0, lock: 0, resets: 0, low: HIDDEN, clearT: 0, marked: [], chain: 0,
      score: 0, level: 1, jewels: 0, pieces: 0, drawn: 0, maxChain: 0, cause: null, fx: [],
    };
    g.next = draw(g);
    spawn(g);
    g.fx = [];
    return g;
  }

  /** Bắt đầu một đợt xóa trong dây chuyền: cộng điểm, lên cấp, chờ CLEAR_TICKS rồi mới gỡ ngọc. */
  function startClear(g, marked, magic) {
    g.chain++;
    const points = marked.length * JEWEL_POINTS * g.level * g.chain;
    g.score += points;
    g.jewels += marked.length;
    if (g.chain > g.maxChain) g.maxChain = g.chain;
    g.phase = 'clear';
    g.marked = marked;
    g.clearT = CLEAR_TICKS;
    g.fx.push({ type: 'clear', chain: g.chain, count: marked.length, points, magic: !!magic });
    const lv = levelFor(g.jewels);
    if (lv > g.level) {
      g.level = lv;
      g.fx.push({ type: 'level', level: lv });
    }
  }

  /** Hết dây chuyền: tràn miệng giếng thì thua, không thì ra khối mới. */
  function finishTurn(g) {
    g.marked = [];
    g.clearT = 0;
    if (overflow(g.grid)) {
      g.piece = null;
      g.phase = 'over';
      g.cause = 'top';
      g.chain = 0;
      g.fx.push({ type: 'over', cause: 'top' });
      return;
    }
    spawn(g);
  }

  /** Khóa khối đang rơi tại chỗ (ghi thẳng vào g: chỉ gọi trên bản sao). */
  function lockPiece(g) {
    const p = g.piece;
    g.piece = null;
    g.chain = 0;
    if (isMagic(p.c)) {
      const below = p.y + 1 < TOTAL ? g.grid[idx(p.x, p.y + 1)] : 0;
      g.fx.push({ type: 'magic', x: p.x, y: p.y, color: below });
      const marked = below ? cellsOfColor(g.grid, below) : [];
      if (marked.length) startClear(g, marked, true);
      else finishTurn(g);
      return;
    }
    g.grid[idx(p.x, p.y - 2)] = p.c[0];
    g.grid[idx(p.x, p.y - 1)] = p.c[1];
    g.grid[idx(p.x, p.y)] = p.c[2];
    g.fx.push({ type: 'lock', x: p.x, y: p.y });
    const marked = findMatches(g.grid);
    if (marked.length) startClear(g, marked, false);
    else finishTurn(g);
  }

  const grounded = (g) => !fits(g.grid, g.piece.x, g.piece.y + 1);

  /** Sau khi dịch / xoay thành công: đang chạm đáy (trước hoặc sau) thì đặt lại trễ khóa, có giới hạn. */
  function touch(g, wasGrounded) {
    if ((wasGrounded || grounded(g)) && g.resets < MAX_RESETS) {
      g.lock = 0;
      g.resets++;
    }
  }

  /** Dịch khối sang trái (-1) / phải (+1). Không dịch được thì trả lại đúng trạng thái vào. */
  function move(g, dir) {
    if (g.phase !== 'fall' || !g.piece) return g;
    const p = g.piece;
    if (!fits(g.grid, p.x + dir, p.y)) return g;
    const n = clone(g);
    const was = grounded(n);
    n.piece.x += dir;
    touch(n, was);
    n.fx.push({ type: 'move', dir });
    return n;
  }

  /**
   * Xoay vòng thứ tự 3 viên. dir = +1 (kiểu cổ điển): mỗi viên xuống một ô, viên dưới cùng lên đầu;
   * dir = -1: ngược lại. Khối ngọc ma thuật không đổi gì.
   */
  function rotate(g, dir) {
    if (g.phase !== 'fall' || !g.piece || isMagic(g.piece.c)) return g;
    const n = clone(g);
    const c = n.piece.c;
    n.piece.c = dir > 0 ? [c[2], c[0], c[1]] : [c[1], c[2], c[0]];
    touch(n, grounded(n));
    n.fx.push({ type: 'rotate', dir });
    return n;
  }

  /** Thả cứng: rơi thẳng xuống, +HARD_POINTS mỗi hàng, khóa ngay. */
  function hardDrop(g) {
    if (g.phase !== 'fall' || !g.piece) return g;
    const n = clone(g);
    const y = dropY(n.grid, n.piece.x, n.piece.y);
    const rows = y - n.piece.y;
    n.piece.y = y;
    n.score += rows * HARD_POINTS;
    n.fx.push({ type: 'hard', rows, x: n.piece.x, y });
    lockPiece(n);
    return n;
  }

  /** Hàng viên dưới cùng sẽ đáp nếu thả cứng (vẽ bóng rơi). */
  const ghostY = (g) => (g.piece ? dropY(g.grid, g.piece.x, g.piece.y) : 0);

  /** Một bước 1/60 s. `soft` = đang giữ rơi nhanh. */
  function step(g, soft) {
    if (g.phase === 'over') return g;
    const n = clone(g);
    n.tick++;
    if (n.phase === 'clear') {
      n.clearT--;
      if (n.clearT <= 0) {
        for (const i of n.marked) n.grid[i] = 0;
        collapse(n.grid);
        n.fx.push({ type: 'collapse' });
        const marked = findMatches(n.grid);
        n.marked = [];
        if (marked.length) startClear(n, marked, false);
        else finishTurn(n);
      }
      return n;
    }
    const p = n.piece;
    if (fits(n.grid, p.x, p.y + 1)) {
      const g0 = gravityFor(n.level);
      const interval = soft ? Math.min(SOFT_TICKS, g0) : g0;
      n.grav++;
      if (n.grav >= interval) {
        n.grav = 0;
        p.y++;
        if (soft) n.score += SOFT_POINTS;
        if (p.y > n.low) {
          n.low = p.y;
          n.resets = 0;
        }
        n.lock = 0;
        if (grounded(n)) n.fx.push({ type: 'land' });
      }
    } else {
      n.grav = 0;
      n.lock++;
      if (n.lock >= LOCK_TICKS) lockPiece(n);
    }
    return n;
  }

  /** Đổi thời gian thật thành số bước cố định: trả { ticks, acc } (acc là ms dư chưa đủ một bước). */
  function ticksFor(acc, frameMs) {
    const total = acc + Math.min(Math.max(0, frameMs), MAX_FRAME_MS);
    const ticks = Math.floor(total / TICK_MS + 1e-9);
    return { ticks, acc: Math.max(0, total - ticks * TICK_MS) };
  }

  /** Áp một thao tác theo tên: 'left' 'right' 'rotate' 'rotateBack' 'hard'. */
  function act(g, a) {
    if (a === 'left') return move(g, -1);
    if (a === 'right') return move(g, 1);
    if (a === 'rotate') return rotate(g, 1);
    if (a === 'rotateBack') return rotate(g, -1);
    if (a === 'hard') return hardDrop(g);
    return g;
  }

  /**
   * Mô phỏng từ seed với chuỗi thao tác có thời điểm [{ t, a }] (a như act, thêm 'softOn' / 'softOff';
   * thao tác ở tick t chạy ngay trước bước thứ t, đếm từ 0), tối đa maxTicks bước.
   */
  function simulate(seed, events, maxTicks) {
    const list = events.slice().sort((p, q) => p.t - q.t);
    let g = newGame(seed);
    let soft = false;
    let k = 0;
    for (let i = 0; i < maxTicks && g.phase !== 'over'; i++) {
      while (k < list.length && list[k].t <= i) {
        const a = list[k++].a;
        if (a === 'softOn') soft = true;
        else if (a === 'softOff') soft = false;
        else g = act(g, a);
      }
      g = step(g, soft);
    }
    return g;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION, seed: g.seed, rng: g.rng, bag: g.bag.slice(), grid: g.grid.slice(),
      piece: g.piece ? { x: g.piece.x, y: g.piece.y, c: g.piece.c.slice() } : null,
      next: g.next.slice(), phase: g.phase, tick: g.tick, grav: g.grav, lock: g.lock, resets: g.resets, low: g.low,
      clearT: g.clearT, marked: g.marked.slice(), chain: g.chain, score: g.score, level: g.level, jewels: g.jewels,
      pieces: g.pieces, drawn: g.drawn, maxChain: g.maxChain, cause: g.cause,
    };
  }

  const isUint = (v) => Number.isInteger(v) && v >= 0;
  const isUint32 = (v) => isUint(v) && v <= 0xffffffff;
  const isColor = (v) => Number.isInteger(v) && v >= 1 && v <= COLORS;
  /** Bộ ba viên của một khối: 3 màu thường, hoặc cả 3 là ngọc ma thuật. */
  const isPieceColors = (c) => Array.isArray(c) && c.length === 3 && (c.every(isColor) || c.every((v) => v === MAGIC));

  /** Ván lưu hỏng, khác phiên bản hoặc mâu thuẫn thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const r = raw;
    if (!isUint32(r.seed) || r.seed === 0 || !isUint32(r.rng)) return null;
    if (PHASES.indexOf(r.phase) < 0) return null;
    const counters = [r.tick, r.grav, r.lock, r.resets, r.low, r.clearT, r.chain, r.score, r.jewels, r.pieces, r.drawn, r.maxChain];
    if (!counters.every(isUint)) return null;
    if (!Number.isInteger(r.level) || r.level !== levelFor(r.jewels)) return null;
    if (r.lock > LOCK_TICKS || r.resets > MAX_RESETS || r.grav > 48 || r.clearT > CLEAR_TICKS || r.chain > r.maxChain) return null;
    if (r.pieces < 1 || r.pieces > r.drawn || r.drawn > r.pieces + 1) return null;
    // Túi: mỗi màu không quá BAG viên
    if (!Array.isArray(r.bag) || r.bag.length > COLORS * BAG || !r.bag.every(isColor)) return null;
    const count = new Array(COLORS + 1).fill(0);
    for (const v of r.bag) if (++count[v] > BAG) return null;
    if (!Array.isArray(r.grid) || r.grid.length !== CELLS || !r.grid.every((v) => v === 0 || isColor(v))) return null;
    if (!isPieceColors(r.next) || !Array.isArray(r.marked)) return null;
    const grid = r.grid.slice();
    let piece = null;
    if (r.phase === 'fall') {
      const p = r.piece;
      if (!p || typeof p !== 'object' || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !isPieceColors(p.c)) return null;
      if (!fits(grid, p.x, p.y) || r.low < p.y || r.low >= TOTAL) return null;
      if (overflow(grid) || r.marked.length || r.clearT || r.cause !== null) return null;
      piece = { x: p.x, y: p.y, c: p.c.slice() };
    } else if (r.piece !== null) return null;
    const marked = [];
    for (const i of r.marked) {
      if (!Number.isInteger(i) || i < 0 || i >= CELLS || !grid[i] || (marked.length && i <= marked[marked.length - 1])) return null;
      marked.push(i);
    }
    if (r.phase === 'clear' && (!marked.length || !r.clearT || !r.chain || r.cause !== null)) return null;
    if (r.phase === 'over' && (CAUSES.indexOf(r.cause) < 0 || marked.length)) return null;
    return {
      seed: r.seed, rng: r.rng, bag: r.bag.slice(), grid, piece, next: r.next.slice(), phase: r.phase,
      tick: r.tick, grav: r.grav, lock: r.lock, resets: r.resets, low: r.low, clearT: r.clearT, marked,
      chain: r.chain, score: r.score, level: r.level, jewels: r.jewels, pieces: r.pieces, drawn: r.drawn,
      maxChain: r.maxChain, cause: r.cause, fx: [],
    };
  }

  const api = {
    VERSION, COLS, ROWS, HIDDEN, TOTAL, CELLS, COLORS, MAGIC, SPAWN_COL, HZ, TICK_MS, MAX_FRAME_MS, LOCK_TICKS,
    MAX_RESETS, SOFT_TICKS, CLEAR_TICKS, LEVEL_JEWELS, MAX_LEVEL, JEWEL_POINTS, SOFT_POINTS, HARD_POINTS,
    MAGIC_FROM, MAGIC_CHANCE,
    idx, gravityFor, levelFor, isMagic, fits, dropY, findMatches, collapse, overflow, settle,
    newGame, move, rotate, hardDrop, ghostY, step, ticksFor, act, simulate, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
