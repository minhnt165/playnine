/* =====================================================================
 * Rắn Săn Mồi - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Không đụng tới DOM: mọi hàm nhận state và trả về state mới (không sửa state cũ)
 *   - Bàn chơi là lưới n x n, ô đánh số idx = hàng * n + cột
 *   - Thân rắn là mảng idx, phần tử đầu tiên là đầu rắn
 *   - Chạy theo nhịp (tick): mỗi tick rắn đi một ô. Độ dài một tick do tickMs() tính
 *   - Hàng đợi hướng: giữ tối đa MAX_QUEUE lần đổi hướng giữa hai tick
 *   - Hàm ngẫu nhiên truyền vào được (để test)
 * ===================================================================== */
(function (root) {
  'use strict';

  const MODES = ['classic', 'wrap', 'maze'];
  const SPEEDS = ['slow', 'normal', 'fast'];
  const BASE_MS = { slow: 170, normal: 125, fast: 88 }; // độ dài một tick ở đầu ván
  const ACCEL_STEP = 0.018; // mỗi mồi ăn được rút ngắn tick 1,8%...
  const ACCEL_MIN = 0.55; // ...nhưng không nhanh hơn 55% tốc độ ban đầu
  const SIZES = [15, 20, 25];
  const DEFAULT_SIZE = 20;
  const MAPS = ['corners', 'corridor', 'pillars', 'fortress']; // mã bản đồ; tên hiển thị nằm trong i18n.js
  const DIRS = ['up', 'down', 'left', 'right'];
  const VEC = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }; // [dHàng, dCột]
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const MAX_QUEUE = 2;
  const START_LENGTH = 3;
  const FOOD_POINTS = 10;
  const BONUS_POINTS = 50;
  const BONUS_GROW = 2; // mồi thưởng dài thêm 2 đốt
  const BONUS_MS = 5000; // mồi thưởng tồn tại 5 giây
  const BONUS_EVERY_MIN = 5; // mồi thưởng xuất hiện sau mỗi 5..8 mồi thường
  const BONUS_EVERY_MAX = 8;

  /* ---------------- Tiện ích ---------------- */
  const int = (v, min, def) => (Number.isInteger(v) && v >= min ? v : def);
  const pick = (arr, rng) => arr[Math.min(arr.length - 1, Math.floor((rng || Math.random)() * arr.length))];
  const bonusGap = (rng) =>
    BONUS_EVERY_MIN + Math.min(BONUS_EVERY_MAX - BONUS_EVERY_MIN, Math.floor((rng || Math.random)() * (BONUS_EVERY_MAX - BONUS_EVERY_MIN + 1)));

  /* ---------------- Bản đồ Mê cung ---------------- */
  /**
   * Danh sách ô chướng ngại (idx, tăng dần) cho chế độ + kích thước + bản đồ.
   * Các bản đồ tính theo n nên dùng được cho mọi kích thước, và luôn chừa
   * hàng giữa bàn (chỗ rắn xuất phát) cùng đường chạy thẳng về bên phải.
   */
  function obstaclesFor(mode, size, map) {
    if (mode !== 'maze') return [];
    const n = size;
    const q = Math.floor(n / 4);
    const mid = Math.floor(n / 2);
    const set = new Set();
    const add = (r, c) => {
      if (r >= 0 && r < n && c >= 0 && c < n) set.add(r * n + c);
    };
    const m = ((map % MAPS.length) + MAPS.length) % MAPS.length;
    if (m === 0) {
      // Bốn góc: bốn khung chữ L ở bốn góc
      const L = q + 1;
      for (let k = 0; k < L; k++) {
        add(2, 2 + k); add(2 + k, 2);
        add(2, n - 3 - k); add(2 + k, n - 3);
        add(n - 3, 2 + k); add(n - 3 - k, 2);
        add(n - 3, n - 3 - k); add(n - 3 - k, n - 3);
      }
    } else if (m === 1) {
      // Hành lang: hai thanh ngang dài
      for (let c = 3; c <= n - 4; c++) { add(q, c); add(n - 1 - q, c); }
    } else if (m === 2) {
      // Cột đôi: hai cột dọc, chừa khe ở giữa
      for (let r = 2; r <= n - 3; r++) {
        if (Math.abs(r - mid) <= 1) continue;
        add(r, q); add(r, n - 1 - q);
      }
    } else {
      // Pháo đài: khung vuông bên trong, mỗi cạnh có cửa rộng 3 ô ở giữa
      const a = q;
      const b = n - 1 - q;
      for (let k = a; k <= b; k++) {
        if (Math.abs(k - mid) <= 1) continue;
        add(a, k); add(b, k); add(k, a); add(k, b);
      }
    }
    return Array.from(set).sort((x, y) => x - y);
  }

  /* ---------------- Tạo state ---------------- */
  function normOpts(opts) {
    const o = opts || {};
    return {
      mode: MODES.includes(o.mode) ? o.mode : 'classic',
      speed: SPEEDS.includes(o.speed) ? o.speed : 'normal',
      size: SIZES.includes(o.size) ? o.size : DEFAULT_SIZE,
      map: Number.isInteger(o.map) && o.map >= 0 && o.map < MAPS.length ? o.map : 0,
      accel: o.accel !== false,
    };
  }

  function blankState(opts) {
    const o = normOpts(opts);
    return {
      v: 1,
      mode: o.mode,
      speed: o.speed,
      size: o.size,
      map: o.map,
      accel: o.accel,
      obstacles: obstaclesFor(o.mode, o.size, o.map),
      snake: [],
      dir: 'right',
      queue: [],
      grow: 0, // số đốt còn chờ mọc thêm
      food: null,
      bonus: null, // { at, ms, total }
      bonusIn: BONUS_EVERY_MIN, // còn bao nhiêu mồi thường nữa thì ra mồi thưởng
      score: 0,
      eaten: 0, // số mồi đã ăn (cả mồi thưởng)
      ticks: 0,
      over: false,
      won: false,
      cause: null, // 'wall' | 'self' | 'obstacle' | null
    };
  }

  /** Các ô trống: không có thân rắn, chướng ngại, mồi, mồi thưởng. */
  function freeCells(state, snake) {
    const body = snake || state.snake;
    const used = new Set(body);
    state.obstacles.forEach((i) => used.add(i));
    if (state.food !== null && state.food !== undefined) used.add(state.food);
    if (state.bonus) used.add(state.bonus.at);
    const out = [];
    for (let i = 0; i < state.size * state.size; i++) if (!used.has(i)) out.push(i);
    return out;
  }

  /** Số ô rắn có thể chiếm (cả bàn trừ chướng ngại). Rắn dài bằng số này là thắng. */
  const capacity = (state) => state.size * state.size - state.obstacles.length;

  function newGame(opts, rng) {
    const s = blankState(opts);
    const n = s.size;
    const mid = Math.floor(n / 2);
    for (let k = 0; k < START_LENGTH; k++) s.snake.push(mid * n + (mid - k));
    s.bonusIn = bonusGap(rng);
    const free = freeCells(s);
    s.food = free.length ? pick(free, rng) : null;
    return s;
  }

  /**
   * Tạo state với thân rắn cho trước (dùng cho test).
   * cells: mảng [hàng, cột] hoặc idx, phần tử đầu là đầu rắn.
   * extra: ghi đè trường bất kỳ (dir, food, bonus, obstacles...).
   */
  function fromSnake(opts, cells, extra) {
    const s = blankState(opts);
    s.snake = cells.map((p) => (Array.isArray(p) ? p[0] * s.size + p[1] : p));
    s.food = null;
    if (extra) Object.assign(s, extra);
    return s;
  }

  /* ---------------- Tốc độ ---------------- */
  /** Độ dài một tick (ms) hiện tại: theo mức tốc độ, nhanh dần theo số mồi nếu bật tăng tốc. */
  function tickMs(state) {
    const base = BASE_MS[state.speed] || BASE_MS.normal;
    if (!state.accel) return base;
    return Math.round(base * Math.max(ACCEL_MIN, 1 - ACCEL_STEP * state.eaten));
  }

  /* ---------------- Đổi hướng ---------------- */
  /**
   * Thêm một lần đổi hướng vào hàng đợi. So với hướng cuối cùng trong hàng đợi
   * (hoặc hướng đang đi): trùng hướng hoặc quay ngược vào cổ thì bỏ qua.
   * Hàng đợi đầy (MAX_QUEUE) thì bỏ qua. Trả về state mới, hoặc chính state cũ nếu bỏ qua.
   */
  function turn(state, dir) {
    if (!DIRS.includes(dir) || state.over) return state;
    const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    if (dir === last || dir === OPPOSITE[last]) return state;
    if (state.queue.length >= MAX_QUEUE) return state;
    return Object.assign({}, state, { queue: state.queue.concat([dir]) });
  }

  /* ---------------- Một tick ---------------- */
  /**
   * Rắn đi một ô. Trả về {
   *   state,             // state mới
   *   moved,             // rắn có đi được không (false khi chết hoặc ván đã xong)
   *   ate: 'food' | 'bonus' | null,
   *   gained,            // điểm cộng thêm
   *   died, won,
   *   bonusSpawned, bonusExpired
   * }
   * Ô đuôi đang rời đi trong tick này là ô hợp lệ để đầu đi vào (trừ khi rắn đang mọc dài).
   */
  function step(state, rng) {
    const none = { state, moved: false, ate: null, gained: 0, died: false, won: false, bonusSpawned: false, bonusExpired: false };
    if (state.over) return none;

    const n = state.size;
    const queue = state.queue.slice();
    const dir = queue.length ? queue.shift() : state.dir;
    const head = state.snake[0];
    let r = Math.floor(head / n) + VEC[dir][0];
    let c = (head % n) + VEC[dir][1];

    const die = (cause) => {
      const dead = Object.assign({}, state, { dir, queue: [], over: true, cause });
      return Object.assign({}, none, { state: dead, died: true });
    };

    if (r < 0 || r >= n || c < 0 || c >= n) {
      if (state.mode !== 'wrap') return die('wall');
      r = (r + n) % n;
      c = (c + n) % n;
    }
    const next = r * n + c;
    if (state.obstacles.includes(next)) return die('obstacle');

    const eatsFood = next === state.food;
    const eatsBonus = !!state.bonus && next === state.bonus.at;
    let grow = state.grow + (eatsFood ? 1 : 0) + (eatsBonus ? BONUS_GROW : 0);
    const keepTail = grow > 0;
    if (keepTail) grow--;

    // Đuôi rời đi trong tick này (khi không mọc dài) nên không tính là va chạm
    const body = keepTail ? state.snake : state.snake.slice(0, -1);
    if (body.includes(next)) return die('self');

    const snake = [next].concat(body);
    const ms = tickMs(state);
    let gained = 0;
    let food = state.food;
    let bonus = state.bonus;
    let bonusIn = state.bonusIn;
    let bonusSpawned = false;
    let bonusExpired = false;
    let ate = null;

    if (eatsBonus) {
      gained += BONUS_POINTS;
      bonus = null;
      ate = 'bonus';
    } else if (bonus) {
      const left = bonus.ms - ms;
      if (left <= 0) {
        bonus = null;
        bonusExpired = true;
      } else {
        bonus = { at: bonus.at, ms: left, total: bonus.total };
      }
    }
    if (eatsFood) {
      gained += FOOD_POINTS;
      food = null;
      ate = 'food';
      bonusIn--;
    }

    const next_ = Object.assign({}, state, {
      snake,
      dir,
      queue,
      grow,
      food,
      bonus,
      bonusIn,
      score: state.score + gained,
      eaten: state.eaten + (eatsFood ? 1 : 0) + (eatsBonus ? 1 : 0),
      ticks: state.ticks + 1,
    });

    // Rắn phủ kín mọi ô trống: thắng
    if (snake.length >= capacity(next_)) {
      next_.food = null;
      next_.bonus = null;
      next_.over = true;
      next_.won = true;
      return { state: next_, moved: true, ate, gained, died: false, won: true, bonusSpawned: false, bonusExpired };
    }

    // Sinh mồi mới (cũng sinh lại nếu lần trước hết chỗ)
    if (next_.food === null) {
      const free = freeCells(next_);
      if (free.length) next_.food = pick(free, rng);
    }
    // Đủ số mồi thường thì ra mồi thưởng (nếu còn chỗ)
    if (eatsFood && next_.bonusIn <= 0) {
      next_.bonusIn = bonusGap(rng);
      if (!next_.bonus) {
        const free = freeCells(next_);
        if (free.length) {
          next_.bonus = { at: pick(free, rng), ms: BONUS_MS, total: BONUS_MS };
          bonusSpawned = true;
        }
      }
    }
    return { state: next_, moved: true, ate, gained, died: false, won: false, bonusSpawned, bonusExpired };
  }

  /* ---------------- Khôi phục từ localStorage ---------------- */
  /** Hai ô có kề nhau không (tính cả xuyên tường khi wrap). */
  function adjacent(a, b, n, wrap) {
    const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n));
    const dc = Math.abs((a % n) - (b % n));
    const okR = dr === 0 || dr === 1 || (wrap && dr === n - 1);
    const okC = dc === 0 || dc === 1 || (wrap && dc === n - 1);
    return okR && okC && (dr === 0) !== (dc === 0);
  }

  /** Kiểm tra và chuẩn hóa state đọc từ bộ nhớ. Dữ liệu hỏng thì trả về null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    if (!MODES.includes(obj.mode) || !SPEEDS.includes(obj.speed) || !SIZES.includes(obj.size)) return null;
    const s = blankState({ mode: obj.mode, speed: obj.speed, size: obj.size, map: obj.map, accel: obj.accel });
    const n = s.size;
    const total = n * n;
    const blocked = new Set(s.obstacles);
    const isCell = (i) => Number.isInteger(i) && i >= 0 && i < total && !blocked.has(i);

    if (!Array.isArray(obj.snake) || obj.snake.length < 1 || obj.snake.length > total) return null;
    const seen = new Set();
    for (let k = 0; k < obj.snake.length; k++) {
      const i = obj.snake[k];
      if (!isCell(i) || seen.has(i)) return null;
      if (k > 0 && !adjacent(obj.snake[k - 1], i, n, s.mode === 'wrap')) return null;
      seen.add(i);
    }
    if (!DIRS.includes(obj.dir)) return null;
    const queue = Array.isArray(obj.queue) ? obj.queue.filter((d) => DIRS.includes(d)).slice(0, MAX_QUEUE) : [];

    let food = null;
    if (obj.food !== null && obj.food !== undefined) {
      if (!isCell(obj.food) || seen.has(obj.food)) return null;
      food = obj.food;
    }
    let bonus = null;
    if (obj.bonus) {
      const b = obj.bonus;
      if (!isCell(b.at) || seen.has(b.at) || b.at === food) return null;
      const t = int(b.total, 1, BONUS_MS);
      bonus = { at: b.at, ms: Math.min(t, int(b.ms, 1, t)), total: t };
    }

    s.snake = obj.snake.slice();
    s.dir = obj.dir;
    s.queue = queue;
    s.grow = Math.min(int(obj.grow, 0, 0), total);
    s.food = food;
    s.bonus = bonus;
    s.bonusIn = Math.min(BONUS_EVERY_MAX, int(obj.bonusIn, 0, BONUS_EVERY_MIN));
    s.score = int(obj.score, 0, 0);
    s.eaten = int(obj.eaten, 0, 0);
    s.ticks = int(obj.ticks, 0, 0);
    s.over = obj.over === true;
    s.won = s.over && obj.won === true;
    s.cause = s.over && ['wall', 'self', 'obstacle'].includes(obj.cause) ? obj.cause : null;
    if (!s.over && s.food === null) {
      const free = freeCells(s);
      if (free.length) s.food = free[0];
    }
    return s;
  }

  const api = {
    MODES,
    SPEEDS,
    BASE_MS,
    ACCEL_STEP,
    ACCEL_MIN,
    SIZES,
    DEFAULT_SIZE,
    MAPS,
    DIRS,
    VEC,
    OPPOSITE,
    MAX_QUEUE,
    START_LENGTH,
    FOOD_POINTS,
    BONUS_POINTS,
    BONUS_GROW,
    BONUS_MS,
    obstaclesFor,
    newGame,
    fromSnake,
    freeCells,
    capacity,
    tickMs,
    turn,
    step,
    adjacent,
    restore,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GameRan = api;
})(typeof window !== 'undefined' ? window : null);
