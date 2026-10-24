/* =====================================================================
 * Thoát Xe - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn 6×6, ô đánh số r*6+c. Cửa ra ở mép phải hàng 2 (hàng thứ ba từ trên xuống).
 *   - Đề lưu dạng chuỗi 36 ký tự theo hàng: '.' ô trống, 'A' xe đỏ (ngang, dài 2, hàng 2),
 *     chữ cái khác là xe con (dài 2) hoặc xe tải (dài 3), ngang hoặc dọc.
 *   - Xe chỉ trượt theo trục của mình; một nước = trượt một xe bao nhiêu ô cũng được.
 *     Trượt cùng một xe nhiều lần liền nhau được gộp thành một nước (đẩy từng ô bằng phím vẫn tính 1).
 *   - Thắng khi xe đỏ tới cột 4 (sát cửa ra).
 *   - solve(): BFS theo số nước, trả lời giải tối ưu; dùng cho Gợi ý, kiểm tra đề và khôi phục ván.
 *   - generate(seed, band): xếp xe ngẫu nhiên tất định theo seed, duyệt cả cụm trạng thái (mọi nước
 *     đều đảo được) rồi BFS ngược nhiều nguồn từ các thế đã giải (đi ngược từ thế giải) để chọn thế
 *     có số nước tối thiểu nằm trong khoảng mong muốn.
 *   - Hàm thuần: nhận ván cũ, trả ván mới; toJSON / fromJSON lưu ván bằng đề + danh sách nước đi.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const N = 6; // cạnh bàn
  const CELLS = N * N;
  const EXIT_ROW = 2; // hàng của xe đỏ và cửa ra
  const GOAL = N - 2; // xe đỏ (dài 2) ở cột 4 là thoát
  const LEVELS = ['easy', 'medium', 'hard'];
  // Khoảng số nước tối thiểu của từng mức (sinh đề + test). Đề hằng ngày giữ ở tầm Vừa.
  const BANDS = { easy: [5, 12], medium: [13, 24], hard: [25, 60], daily: [14, 22] };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Bộ đề sinh sẵn (puzzles.js, do tools/build-puzzles.js sinh): trong Node đọc bằng require
  let BANK = null;
  if (typeof module !== 'undefined' && module.exports) {
    try {
      BANK = require('./puzzles.js');
    } catch (e) {
      BANK = null; // lúc chạy script sinh đề lần đầu chưa có file
    }
  } else BANK = root.THOATXE_PUZZLES || null;

  /* ---------------- PRNG ---------------- */

  /** Băm chuỗi thành số 32 bit (FNV-1a) để làm seed từ ngày / tên bàn. */
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** PRNG mulberry32: cùng seed thì cùng dãy số trên mọi máy. Trả hàm r() → [0, 1) kèm r.int(n). */
  function makeRng(seed) {
    let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
    const r = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    return r;
  }

  /* ---------------- Đọc / ghi đề ---------------- */

  /** Ô thứ k của xe đặt ở vị trí p. */
  const cellOf = (car, p, k) => (car.h ? car.fix * N + p + k : (p + k) * N + car.fix);

  /**
   * Đọc chuỗi đề thành { cars, start }. cars[i] = { h: ngang?, len: 2|3, fix: hàng (xe ngang) / cột (xe dọc) },
   * start[i] = vị trí ô đầu (cột trái nhất với xe ngang, hàng trên nhất với xe dọc). Xe đỏ luôn là cars[0].
   * Sai định dạng (xe cong / đứt, dài sai, thiếu xe đỏ, xe ngang khác nằm trên hàng thoát…) trả null.
   */
  function parse(str) {
    if (typeof str !== 'string' || str.length !== CELLS || !/^[.A-Z]+$/.test(str)) return null;
    const seen = {};
    const order = [];
    for (let i = 0; i < CELLS; i++) {
      const ch = str[i];
      if (ch === '.') continue;
      if (!seen[ch]) {
        seen[ch] = [];
        order.push(ch);
      }
      seen[ch].push(i);
    }
    if (!seen.A) return null;
    order.sort((a, b) => (a === 'A' ? -1 : b === 'A' ? 1 : 0));
    const cars = [];
    const start = [];
    for (const ch of order) {
      const cells = seen[ch];
      const len = cells.length;
      if (len !== 2 && len !== 3) return null;
      const r0 = Math.floor(cells[0] / N);
      const c0 = cells[0] % N;
      const h = Math.floor(cells[1] / N) === r0;
      if (h && c0 + len > N) return null;
      const car = { h, len, fix: h ? r0 : c0 };
      for (let k = 0; k < len; k++) if (cells[k] !== cellOf(car, h ? c0 : r0, k)) return null;
      cars.push(car);
      start.push(h ? c0 : r0);
    }
    const red = cars[0];
    if (!red.h || red.len !== 2 || red.fix !== EXIT_ROW) return null;
    // Xe ngang khác trên hàng thoát không bao giờ rời hàng: bên phải xe đỏ thì vô nghiệm, bên trái thì vô dụng
    for (let i = 1; i < cars.length; i++) if (cars[i].h && cars[i].fix === EXIT_ROW) return null;
    return { cars, start };
  }

  /** Ghi { cars, pos } thành chuỗi đề (xe đỏ 'A', các xe khác 'B', 'C'… theo thứ tự trong mảng). */
  function format(cars, pos) {
    const out = new Array(CELLS).fill('.');
    cars.forEach((car, i) => {
      for (let k = 0; k < car.len; k++) out[cellOf(car, pos[i], k)] = LETTERS[i];
    });
    return out.join('');
  }

  /** Bàn chiếm chỗ: grid[ô] = số thứ tự xe, -1 là trống. */
  function fill(cars, pos, grid) {
    const g = grid || new Int8Array(CELLS);
    g.fill(-1);
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      for (let k = 0; k < car.len; k++) g[cellOf(car, pos[i], k)] = i;
    }
    return g;
  }

  /** Khoảng vị trí [lo, hi] xe i trượt tới được (không nhảy qua xe khác, không ra khỏi bàn). */
  function rangeOf(cars, pos, i, grid) {
    const g = grid || fill(cars, pos);
    const car = cars[i];
    const p = pos[i];
    let lo = p;
    while (lo > 0 && g[cellOf(car, lo - 1, 0)] < 0) lo--;
    let hi = p;
    while (hi + car.len < N && g[cellOf(car, hi + 1, car.len - 1)] < 0) hi++;
    return [lo, hi];
  }

  /** Mọi nước đi được từ thế pos: mảng [xe, vị trí mới]. */
  function movesOf(cars, pos, grid) {
    const g = fill(cars, pos, grid);
    const out = [];
    for (let i = 0; i < cars.length; i++) {
      const [lo, hi] = rangeOf(cars, pos, i, g);
      for (let p = lo; p <= hi; p++) if (p !== pos[i]) out.push([i, p]);
    }
    return out;
  }

  /* ---------------- Tìm kiếm ---------------- */

  // Khóa trạng thái là một số: vị trí xe i (0..4) là chữ số thứ i trong hệ cơ số 5.
  // Bàn 6×6 có tối đa 18 xe nên khóa < 5^18 ≈ 3,8·10^12, nằm gọn trong số nguyên an toàn của JS.
  const POW = [];
  for (let i = 0, m = 1; i <= CELLS / 2; i++, m *= 5) POW.push(m);
  function keyOf(pos) {
    let k = 0;
    for (let i = 0; i < pos.length; i++) k += pos[i] * POW[i];
    return k;
  }
  function decode(key, out) {
    for (let i = 0; i < out.length; i++) out[i] = Math.floor(key / POW[i]) % 5;
    return out;
  }

  /**
   * Gọi fn(xe, vị trí mới, khóa mới) cho mọi nước từ thế `pos` (khóa `key`).
   * Dùng chung cho solve / analyze để không phải dựng mảng nước đi ở mỗi trạng thái.
   */
  function eachMove(cars, pos, key, grid, fn) {
    fill(cars, pos, grid);
    for (let i = 0; i < cars.length; i++) {
      const [lo, hi] = rangeOf(cars, pos, i, grid);
      const p = pos[i];
      for (let q = lo; q <= hi; q++) if (q !== p) fn(i, q, key + (q - p) * POW[i]);
    }
  }

  /**
   * BFS từ thế pos tới thế gần nhất có xe đỏ ở cửa. Trả { min, path: [[xe, vị trí], ...], states }
   * hoặc null nếu vô nghiệm / vượt `limit` trạng thái.
   */
  function solve(cars, pos, limit) {
    const max = limit || 300000;
    if (pos[0] === GOAL) return { min: 0, path: [], states: 1 };
    const keys = [keyOf(pos)];
    const parent = [-1];
    const viaCar = [-1];
    const viaTo = [-1];
    const seen = new Set(keys);
    const grid = new Int8Array(CELLS);
    const cur = pos.slice();
    let found = -1;
    let over = false;
    const visit = (head) => (i, q, k) => {
      if (found >= 0 || over || seen.has(k)) return;
      seen.add(k);
      keys.push(k);
      parent.push(head);
      viaCar.push(i);
      viaTo.push(q);
      if (i === 0 && q === GOAL) found = keys.length - 1;
      else if (keys.length > max) over = true;
    };
    for (let head = 0; head < keys.length && found < 0 && !over; head++) {
      decode(keys[head], cur);
      eachMove(cars, cur, keys[head], grid, visit(head));
    }
    if (found < 0) return null;
    const path = [];
    for (let at = found; at > 0; at = parent[at]) path.push([viaCar[at], viaTo[at]]);
    path.reverse();
    return { min: path.length, path, states: keys.length };
  }

  /**
   * Duyệt cả cụm trạng thái chứa thế pos (mọi nước đảo được nên cụm = các thế đi tới được),
   * rồi BFS ngược nhiều nguồn từ các thế đã giải. Trả { keys, dist (Int16Array, -1 = không tới được cửa), max }
   * hoặc null nếu cụm lớn hơn `cap` trạng thái.
   */
  function analyze(cars, pos, cap) {
    const max = cap || 40000;
    const keys = [keyOf(pos)];
    const index = new Map([[keys[0], 0]]);
    const adjStart = [0];
    const adj = [];
    const grid = new Int8Array(CELLS);
    const cur = pos.slice();
    let over = false;
    const add = (i, q, k) => {
      let j = index.get(k);
      if (j === undefined) {
        j = keys.length;
        index.set(k, j);
        keys.push(k);
        if (keys.length > max) over = true;
      }
      adj.push(j);
    };
    for (let head = 0; head < keys.length; head++) {
      decode(keys[head], cur);
      eachMove(cars, cur, keys[head], grid, add);
      if (over) return null;
      adjStart.push(adj.length);
    }
    const dist = new Int16Array(keys.length).fill(-1);
    const queue = [];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] % 5 === GOAL) {
        dist[i] = 0;
        queue.push(i);
      }
    }
    let far = queue.length ? 0 : -1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      for (let e = adjStart[i]; e < adjStart[i + 1]; e++) {
        const j = adj[e];
        if (dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        if (dist[j] > far) far = dist[j];
        queue.push(j);
      }
    }
    return { keys, dist, max: far };
  }

  /** Xếp ngẫu nhiên xe đỏ + tối đa `count` xe khác (không chồng nhau, không xe ngang nào khác trên hàng thoát). */
  function randomLayout(rng, count) {
    const cars = [{ h: true, len: 2, fix: EXIT_ROW }];
    const pos = [rng.int(GOAL)]; // cột 0..3: chưa thoát sẵn
    const grid = fill(cars, pos);
    for (let tries = 0; cars.length - 1 < count && tries < count * 40; tries++) {
      const h = rng() < 0.5;
      const len = rng() < 0.28 ? 3 : 2;
      const fix = rng.int(N);
      const p = rng.int(N - len + 1);
      if (h && fix === EXIT_ROW) continue;
      const car = { h, len, fix };
      let free = true;
      for (let k = 0; k < len; k++) if (grid[cellOf(car, p, k)] >= 0) free = false;
      if (!free) continue;
      for (let k = 0; k < len; k++) grid[cellOf(car, p, k)] = cars.length;
      cars.push(car);
      pos.push(p);
    }
    return { cars, pos };
  }

  /**
   * Sinh một đề có số nước tối thiểu trong [lo, hi] (band là tên mức hoặc mảng [lo, hi]), tất định theo seed.
   * Mỗi lượt thử: xếp ngẫu nhiên, duyệt cụm; cụm có thế xa nhất nằm trong khoảng thì lấy thế xa nhất,
   * cụm sâu hơn thì lấy một thế ở đầu trên của khoảng. Trả { puzzle, min, tries } hoặc null nếu hết `maxTries`.
   */
  function generate(seed, band, opts) {
    const [lo, hi] = Array.isArray(band) ? band : BANDS[band];
    const o = opts || {};
    const rng = makeRng(seed);
    const minCars = o.minCars || (lo >= 20 ? 11 : lo >= 10 ? 9 : 6);
    const maxCars = o.maxCars || (lo >= 20 ? 14 : lo >= 10 ? 13 : 11);
    const maxTries = o.maxTries || 4000;
    for (let tries = 1; tries <= maxTries; tries++) {
      const count = minCars + rng.int(maxCars - minCars + 1);
      const { cars, pos } = randomLayout(rng, count);
      if (cars.length - 1 < minCars) continue;
      const a = analyze(cars, pos, o.cap);
      if (!a || a.max < lo) continue;
      const want = Math.min(a.max, hi);
      const pool = [];
      for (let i = 0; i < a.keys.length; i++) if (a.dist[i] === want) pool.push(i);
      const pick = pool[rng.int(pool.length)];
      return { puzzle: format(cars, decode(a.keys[pick], new Array(cars.length))), min: want, tries };
    }
    return null;
  }

  /* ---------------- Ván chơi ---------------- */

  /**
   * Ván mới từ chuỗi đề. meta: { level, board } (mức + số bàn đếm từ 0, hoặc level 'daily' + ngày 'YYYY-MM-DD').
   * min: số nước tối thiểu (bỏ trống thì tự giải bằng BFS). Đề sai / vô nghiệm thì ném lỗi.
   */
  function newGame(puzzle, meta, min) {
    const p = parse(puzzle);
    if (!p) throw new Error('bad puzzle');
    let m = min;
    if (!Number.isInteger(m)) {
      const s = solve(p.cars, p.start);
      if (!s) throw new Error('unsolvable puzzle');
      m = s.min;
    }
    return {
      puzzle,
      cars: p.cars,
      start: p.start.slice(),
      pos: p.start.slice(),
      hist: [], // mỗi nước: [xe, từ, tới]
      min: m,
      assisted: false,
      level: meta ? meta.level : undefined,
      board: meta ? meta.board : undefined,
    };
  }

  const isWon = (g) => g.pos[0] === GOAL;
  const moveCount = (g) => g.hist.length;
  const range = (g, i) => rangeOf(g.cars, g.pos, i);

  /** Trượt xe i tới vị trí to; không hợp lệ thì trả nguyên ván. Trượt liền cùng một xe được gộp thành một nước. */
  function move(g, i, to) {
    if (isWon(g) || !Number.isInteger(i) || i < 0 || i >= g.cars.length || !Number.isInteger(to)) return g;
    const from = g.pos[i];
    if (to === from) return g;
    const [lo, hi] = rangeOf(g.cars, g.pos, i);
    if (to < lo || to > hi) return g;
    const pos = g.pos.slice();
    pos[i] = to;
    const hist = g.hist.slice();
    const last = hist[hist.length - 1];
    if (last && last[0] === i) {
      if (last[1] === to) hist.pop(); // trượt về chỗ cũ: như chưa đi
      else hist[hist.length - 1] = [i, last[1], to];
    } else hist.push([i, from, to]);
    return Object.assign({}, g, { pos, hist });
  }

  /** Hoàn tác nước gần nhất (cả cú trượt đã gộp). */
  function undo(g) {
    if (!g.hist.length) return g;
    const hist = g.hist.slice();
    const [i, from] = hist.pop();
    const pos = g.pos.slice();
    pos[i] = from;
    return Object.assign({}, g, { pos, hist });
  }

  /** Nước tiếp theo trên một lời giải tối ưu từ thế hiện tại: [xe, vị trí] (đã thắng / vô nghiệm thì null). */
  function hint(g) {
    if (isWon(g)) return null;
    const s = solve(g.cars, g.pos);
    return s && s.path.length ? s.path[0] : null;
  }

  /** Sao theo số nước: đúng số tối thiểu 3 sao, không quá 1,5 lần tối thiểu 2 sao, còn lại 1 sao. */
  function stars(moves, min) {
    if (moves <= min) return 3;
    if (moves <= Math.ceil(min * 1.5)) return 2;
    return 1;
  }

  /* ---------------- Bàn theo mức + đề hằng ngày ---------------- */

  /** Số bàn của mỗi mức. */
  const boardCount = (level) => (BANK && BANK[level] ? BANK[level].length : 0);

  /** Đề của bàn n (đếm từ 0) trong mức: { puzzle, min }; ngoài khoảng thì null. */
  function boardPuzzle(level, n) {
    const list = BANK && BANK[level];
    if (!list || !Number.isInteger(n) || n < 0 || n >= list.length) return null;
    const [puzzle, min] = list[n].split(':');
    return { puzzle, min: Number(min) };
  }

  const DAY0 = Date.UTC(2026, 0, 1);
  /** Số thứ tự ngày 'YYYY-MM-DD' tính từ 2026-01-01 (ngày 2026-01-01 là 0); sai định dạng thì NaN. */
  function dayIndex(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!m) return NaN;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - DAY0) / 86400000);
  }

  /**
   * Đề hằng ngày: vòng xoay `daily` trong bộ đề sinh sẵn (sinh lúc chạy quá chậm trên điện thoại).
   * Mỗi vòng dài bằng số đề, thứ tự trong vòng là hoán vị Fisher–Yates theo PRNG seed 'thoatxe-daily-<vòng>',
   * nên cùng ngày thì cùng đề trên mọi máy và trong một vòng không ngày nào trùng đề. Trả { puzzle, min, no }.
   */
  function dailyPuzzle(date) {
    const list = BANK && BANK.daily;
    const d = dayIndex(date);
    if (!list || !list.length || Number.isNaN(d)) return null;
    const len = list.length;
    const cycle = Math.floor(d / len);
    const rng = makeRng('thoatxe-daily-' + cycle);
    const perm = [];
    for (let i = 0; i < len; i++) perm.push(i);
    for (let i = len - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    const [puzzle, min] = list[perm[d - cycle * len]].split(':');
    return { puzzle, min: Number(min), no: d + 1 };
  }

  /* ---------------- Tiến độ (thống kê lưu ở playnine-thoatxe-stats-v1) ---------------- */

  const int0 = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

  /**
   * Làm sạch thống kê đọc từ máy: { played, won, moves, hints, best: { easy: { '<bàn>': { m, s } }, … },
   * current: { level, board }, daily: { 'YYYY-MM-DD': { m, s, a } } }. Mục hỏng bị bỏ, không ném lỗi.
   */
  function cleanStats(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = { played: int0(r.played), won: int0(r.won), moves: int0(r.moves), hints: int0(r.hints), best: {}, current: { level: 'easy', board: 0 }, daily: {} };
    LEVELS.forEach((lv) => {
      s.best[lv] = {};
      const src = r.best && typeof r.best === 'object' ? r.best[lv] : null;
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach((k) => {
        const n = Number(k);
        const b = src[k];
        if (Number.isInteger(n) && n >= 0 && n < boardCount(lv) && b && Number.isInteger(b.m) && b.m > 0 && [1, 2, 3].indexOf(b.s) >= 0) s.best[lv][n] = { m: b.m, s: b.s };
      });
    });
    const c = r.current;
    if (c && LEVELS.indexOf(c.level) >= 0 && Number.isInteger(c.board) && c.board >= 0 && c.board < boardCount(c.level)) s.current = { level: c.level, board: c.board };
    if (r.daily && typeof r.daily === 'object') {
      Object.keys(r.daily).forEach((k) => {
        const d = r.daily[k];
        if (!Number.isNaN(dayIndex(k)) && d && Number.isInteger(d.m) && d.m > 0 && [1, 2, 3].indexOf(d.s) >= 0) s.daily[k] = { m: d.m, s: d.s, a: !!d.a };
      });
    }
    return s;
  }

  const isSolved = (stats, level, n) => !!(stats.best[level] && stats.best[level][n]);

  /** Bàn chưa giải có số nhỏ nhất của mức (giải hết thì -1). */
  function frontier(stats, level) {
    for (let n = 0; n < boardCount(level); n++) if (!isSolved(stats, level, n)) return n;
    return -1;
  }

  /** Mở: mọi bàn đã giải + bàn chưa giải đầu tiên. */
  const isUnlocked = (stats, level, n) => isSolved(stats, level, n) || n === frontier(stats, level);

  /**
   * Ghi một lần giải bàn (hoặc đề ngày khi level 'daily', board = ngày). Dùng gợi ý thì vẫn tính đã giải
   * nhưng chỉ 1 sao. Giữ kết quả tốt nhất (nhiều sao hơn, bằng sao thì ít nước hơn). Trả thống kê mới.
   */
  function recordWin(stats, level, board, moves, min, assisted) {
    const s = JSON.parse(JSON.stringify(stats));
    const st = assisted ? 1 : stars(moves, min);
    const cur = { m: moves, s: st };
    const better = (old) => !old || cur.s > old.s || (cur.s === old.s && cur.m < old.m);
    if (level === 'daily') {
      if (better(s.daily[board])) s.daily[board] = { m: moves, s: st, a: !!assisted };
    } else if (better(s.best[level][board])) s.best[level][board] = cur;
    s.played++;
    s.won++;
    s.moves += moves;
    return s;
  }

  /** Số sao đã đạt của một mức (tổng) và tối đa. */
  function levelStars(stats, level) {
    let got = 0;
    Object.keys(stats.best[level] || {}).forEach((k) => { got += stats.best[level][k].s; });
    return { got, max: boardCount(level) * 3 };
  }

  /** Chuỗi ngày giải đề hằng ngày liên tiếp tính tới hôm nay (hôm nay chưa giải thì tính tới hôm qua). */
  function dailyStreak(stats, today) {
    const d0 = dayIndex(today);
    if (Number.isNaN(d0)) return 0;
    const keyOfDay = (d) => new Date(DAY0 + d * 86400000).toISOString().slice(0, 10);
    let d = stats.daily[today] ? d0 : d0 - 1;
    let n = 0;
    while (stats.daily[keyOfDay(d)]) {
      n++;
      d--;
    }
    return n;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    level: g.level,
    board: g.board,
    puzzle: g.puzzle,
    min: g.min,
    hist: g.hist.map((h) => h.slice()),
    assisted: !!g.assisted,
  });

  const validMeta = (level, board) =>
    (LEVELS.indexOf(level) >= 0 && Number.isInteger(board) && board >= 0) ||
    (level === 'daily' && typeof board === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(board));

  /** Ván lưu hỏng / khác phiên bản / sai số nước tối thiểu / có nước sai thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (!validMeta(raw.level, raw.board) || !Array.isArray(raw.hist) || raw.hist.length > 5000) return null;
    if (typeof raw.assisted !== 'boolean') return null;
    // Đề phải đúng là đề của bàn / ngày đó (không nhận đề lạ chèn vào ván lưu)
    const want = raw.level === 'daily' ? dailyPuzzle(raw.board) : boardPuzzle(raw.level, raw.board);
    if (!want || want.puzzle !== raw.puzzle) return null;
    const p = parse(raw.puzzle);
    if (!p) return null;
    const s = solve(p.cars, p.start);
    if (!s || raw.min !== s.min) return null;
    const g = newGame(raw.puzzle, { level: raw.level, board: raw.board }, s.min);
    for (const h of raw.hist) {
      if (!Array.isArray(h) || h.length !== 3 || isWon(g)) return null;
      const [i, from, to] = h;
      if (!Number.isInteger(i) || i < 0 || i >= g.cars.length || g.pos[i] !== from) return null;
      // Đi lại đúng từng nước đã lưu (không gộp), nước nào sai luật thì bỏ cả ván
      const [lo, hi] = rangeOf(g.cars, g.pos, i);
      if (!Number.isInteger(to) || to === from || to < lo || to > hi) return null;
      g.pos[i] = to;
      g.hist.push([i, from, to]);
    }
    g.assisted = raw.assisted;
    return g;
  }

  const api = {
    VERSION, N, EXIT_ROW, GOAL, LEVELS, BANDS,
    hashString, makeRng, parse, format, fill, rangeOf, movesOf, solve, analyze, generate,
    newGame, isWon, moveCount, range, move, undo, hint, stars,
    boardCount, boardPuzzle, dayIndex, dailyPuzzle, cleanStats, isSolved, frontier, isUnlocked, recordWin,
    levelStars, dailyStreak, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
