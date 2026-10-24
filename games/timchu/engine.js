/* =====================================================================
 * Tìm Chữ - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới n x n chữ cái giấu một danh sách từ tiếng Anh (theo chủ đề hoặc trộn lẫn), đề sinh tất định theo seed
 *   - Mode: 's' 8x8 (6 từ, ngang / dọc), 'm' 11x11 (10 từ, thêm chéo xuôi), 'l' 14x14 (15 từ, cả 8 hướng)
 *   - Đề hợp lệ: mỗi từ xuất hiện đúng một lần trên lưới khi đọc theo cả 8 hướng (chữ lấp không tạo thêm bản nào)
 *   - Chọn từ: một đoạn thẳng (8 hướng) từ ô đầu tới ô cuối của từ, chiều nào cũng được
 *   - Hàm thuần: trạng thái cũ vào, trạng thái mới ra; toJSON / fromJSON cho ván lưu (từ chối dữ liệu hỏng)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const DATA = typeof module !== 'undefined' && module.exports ? require('./words.js') : root.TIMCHU_WORDS;

  // 8 hướng [dòng, cột]: 0 phải, 1 xuống, 2 chéo xuống phải, 3 chéo lên phải, 4–7 là hướng ngược của 0–3
  const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];

  /** Cấu hình từng mode: cỡ lưới, số từ, số hướng đặt từ (lấy từ đầu DIRS), độ dài từ. */
  const MODES = {
    s: { n: 8, count: 6, dirs: 2, min: 3, max: 7 },
    m: { n: 11, count: 10, dirs: 4, min: 3, max: 9 },
    l: { n: 14, count: 15, dirs: 8, min: 4, max: 10 },
  };
  const MIXED = 'mixed';
  const THEMES = Object.keys(DATA.themes).sort().concat(MIXED);

  // Tần suất chữ cái tiếng Anh (phần nghìn) cho chữ lấp ô trống: lưới trông "như thật", khó nhận ra từ bằng mắt
  const FREQ = 'e127t91a82o75i70n67s63h61r60d43l40c28u28m24w24f22g20y20p19b15v10k8j2x2q1z1';
  const LETTERS = [];
  FREQ.replace(/([a-z])(\d+)/g, (m, ch, k) => {
    for (let i = 0; i < Number(k); i++) LETTERS.push(ch);
    return m;
  });

  /** PRNG mulberry32: tất định theo seed (số nguyên 32 bit). */
  function rng(seed) {
    let a = seed >>> 0;
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    return r;
  }

  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      const x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }

  const rev = (s) => s.split('').reverse().join('');

  /** Hai từ "đụng" nhau nếu từ này chứa từ kia (xuôi hoặc ngược): khi đó từ ngắn sẽ xuất hiện hai lần. */
  function clash(a, b) {
    return a.includes(b) || b.includes(a) || a.includes(rev(b)) || b.includes(rev(a));
  }

  /** Các ô (chỉ số) của đoạn dài len bắt đầu ở (r, c) theo hướng d; ra ngoài lưới thì null. */
  function cellsOf(n, r, c, d, len) {
    const [dr, dc] = DIRS[d];
    const er = r + dr * (len - 1);
    const ec = c + dc * (len - 1);
    if (r < 0 || c < 0 || r >= n || c >= n || er < 0 || ec < 0 || er >= n || ec >= n) return null;
    const out = [];
    for (let k = 0; k < len; k++) out.push((r + dr * k) * n + c + dc * k);
    return out;
  }

  /**
   * Đoạn thẳng từ ô a tới ô b (cùng hàng, cột hoặc đường chéo 45°), gồm cả hai đầu.
   * a === b hoặc không thẳng hàng thì null.
   */
  function lineBetween(n, a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n * n || b >= n * n || a === b) return null;
    const r0 = Math.floor(a / n);
    const c0 = a % n;
    const dr = Math.floor(b / n) - r0;
    const dc = (b % n) - c0;
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
    const d = DIRS.findIndex(([x, y]) => x === Math.sign(dr) && y === Math.sign(dc));
    return cellsOf(n, r0, c0, d, Math.max(Math.abs(dr), Math.abs(dc)) + 1);
  }

  /** Mọi vị trí đọc được từ w trên lưới theo 8 hướng: [{ r, c, d }]. */
  function findAll(grid, n, w) {
    const out = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid[r * n + c] !== w[0]) continue;
        for (let d = 0; d < 8; d++) {
          const cells = cellsOf(n, r, c, d, w.length);
          if (cells && cells.every((i, k) => grid[i] === w[k])) out.push({ r, c, d });
        }
      }
    }
    return out;
  }

  /** Kho từ của một chủ đề cho mode (lọc theo độ dài). */
  function poolFor(theme, cfg) {
    const words = theme === MIXED ? DATA.mixed : DATA.themes[theme];
    return words.filter((w) => w.length >= cfg.min && w.length <= cfg.max);
  }

  /** Một lần thử dựng đề; không được thì null (hàm gọi thử tiếp với dãy số ngẫu nhiên kế tiếp). */
  function tryBuild(cfg, theme, r) {
    const n = cfg.n;
    const grid = new Array(n * n).fill('');
    const placed = [];
    for (const w of shuffle(poolFor(theme, cfg), r)) {
      if (placed.length === cfg.count) break;
      if (placed.some((p) => clash(p.w, w))) continue;
      // Liệt kê mọi chỗ đặt được; một nửa số lần ưu tiên chỗ dùng chung chữ với từ đã đặt (lưới đan xen hơn)
      const fits = [];
      const crosses = [];
      for (let d = 0; d < cfg.dirs; d++) {
        for (let rr = 0; rr < n; rr++) {
          for (let cc = 0; cc < n; cc++) {
            const cells = cellsOf(n, rr, cc, d, w.length);
            if (!cells) continue;
            let shared = 0;
            let fit = true;
            for (let k = 0; k < cells.length && fit; k++) {
              const ch = grid[cells[k]];
              if (ch === w[k]) shared++;
              else if (ch) fit = false;
            }
            if (!fit) continue;
            fits.push([rr, cc, d]);
            if (shared) crosses.push([rr, cc, d]);
          }
        }
      }
      if (!fits.length) continue;
      const pick = crosses.length && r() < 0.5 ? crosses[r.int(crosses.length)] : fits[r.int(fits.length)];
      cellsOf(n, pick[0], pick[1], pick[2], w.length).forEach((i, k) => { grid[i] = w[k]; });
      placed.push({ w, r: pick[0], c: pick[1], d: pick[2] });
    }
    if (placed.length < cfg.count) return null;

    // Chữ lấp; nếu vô tình tạo thêm một bản của từ nào đó thì lấp lại các ô lấp nằm trên bản thừa
    const used = new Uint8Array(n * n);
    placed.forEach((p) => cellsOf(n, p.r, p.c, p.d, p.w.length).forEach((i) => { used[i] = 1; }));
    for (let i = 0; i < n * n; i++) if (!used[i]) grid[i] = LETTERS[r.int(LETTERS.length)];
    for (let round = 0; round < 40; round++) {
      let extra = false;
      for (const p of placed) {
        for (const o of findAll(grid, n, p.w)) {
          if (o.r === p.r && o.c === p.c && o.d === p.d) continue;
          const free = cellsOf(n, o.r, o.c, o.d, p.w.length).filter((i) => !used[i]);
          if (!free.length) return null; // bản thừa nằm trọn trong chữ của các từ đã đặt: bỏ lần thử này
          free.forEach((i) => { grid[i] = LETTERS[r.int(LETTERS.length)]; });
          extra = true;
        }
      }
      if (!extra) {
        placed.sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : 0)); // danh sách hiện theo thứ tự chữ cái
        return { grid: grid.join(''), words: placed };
      }
    }
    return null;
  }

  /** Sinh đề cho mode theo seed: { theme, grid, words }. */
  function generate(mode, seed) {
    const cfg = MODES[mode];
    if (!cfg) throw new Error('mode không hợp lệ: ' + mode);
    const r = rng(seed);
    for (let attempt = 0; attempt < 200; attempt++) {
      const theme = THEMES[r.int(THEMES.length)];
      const built = tryBuild(cfg, theme, r);
      if (built) return { theme, grid: built.grid, words: built.words };
    }
    throw new Error('không sinh được đề'); // không xảy ra với kho từ hiện có (test chạy nhiều trăm seed mỗi mode)
  }

  /** Ván mới: { mode, seed } (seed bỏ trống thì ngẫu nhiên). */
  function newGame(opts) {
    const mode = opts && MODES[opts.mode] ? opts.mode : 's';
    const seed = opts && Number.isInteger(opts.seed) ? opts.seed >>> 0 : Math.floor(Math.random() * 4294967296);
    const p = generate(mode, seed);
    return { mode, n: MODES[mode].n, seed, theme: p.theme, grid: p.grid, words: p.words, found: [], hinted: [], tries: 0 };
  }

  /** Các ô của từ thứ i (theo thứ tự chữ của từ). */
  function wordCells(g, i) {
    const p = g.words[i];
    return cellsOf(g.n, p.r, p.c, p.d, p.w.length);
  }

  const isWon = (g) => g.found.length === g.words.length;
  const isFound = (g, i) => g.found.indexOf(i) >= 0;
  const progress = (g) => g.found.length / g.words.length;
  const hints = (g) => g.hinted.length;

  /**
   * Chọn đoạn thẳng từ ô a tới ô b. Trả { game, hit, already }:
   *   hit = chỉ số từ vừa tìm được (-1 nếu không trúng); already = chỉ số từ đã tìm trước đó nếu chọn lại đúng nó.
   *   Đoạn hợp lệ nào cũng tính một lượt (tries); không thẳng hàng hoặc chỉ một ô thì bỏ qua (game giữ nguyên).
   */
  function select(g, a, b) {
    const line = lineBetween(g.n, a, b);
    if (!line || isWon(g)) return { game: g, hit: -1, already: -1 };
    const tries = g.tries + 1;
    for (let i = 0; i < g.words.length; i++) {
      const cells = wordCells(g, i);
      const last = cells.length - 1;
      if (cells.length !== line.length) continue;
      if (!((cells[0] === a && cells[last] === b) || (cells[0] === b && cells[last] === a))) continue;
      if (isFound(g, i)) return { game: Object.assign({}, g, { tries }), hit: -1, already: i };
      return { game: Object.assign({}, g, { found: g.found.concat(i), tries }), hit: i, already: -1 };
    }
    return { game: Object.assign({}, g, { tries }), hit: -1, already: -1 };
  }

  /** Gợi ý: lộ chữ đầu của từ chưa tìm, chưa gợi ý, đứng đầu danh sách. Hết từ để gợi ý thì null. */
  function hint(g) {
    if (isWon(g)) return null;
    for (let i = 0; i < g.words.length; i++) {
      if (!isFound(g, i) && g.hinted.indexOf(i) < 0) return { game: Object.assign({}, g, { hinted: g.hinted.concat(i) }), index: i };
    }
    return null;
  }

  function toJSON(g) {
    return {
      v: VERSION,
      mode: g.mode,
      seed: g.seed,
      theme: g.theme,
      grid: g.grid,
      words: g.words.map((p) => [p.w, p.r, p.c, p.d]),
      found: g.found.slice(),
      hinted: g.hinted.slice(),
      tries: g.tries,
    };
  }

  /** Danh sách chỉ số không trùng, trong [0, max). */
  const indexList = (a, max) => Array.isArray(a) && a.every((i) => Number.isInteger(i) && i >= 0 && i < max) && new Set(a).size === a.length;

  /**
   * Ván lưu hỏng, khác phiên bản hoặc lưới không còn đúng luật (chữ trên lưới không khớp từ, hướng không có
   * trong mode, từ xuất hiện nhiều hơn một lần…) thì trả null (app chia ván mới).
   */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (!Object.prototype.hasOwnProperty.call(MODES, raw.mode)) return null;
    const cfg = MODES[raw.mode];
    const n = cfg.n;
    if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 4294967295) return null;
    if (THEMES.indexOf(raw.theme) < 0) return null;
    if (typeof raw.grid !== 'string' || raw.grid.length !== n * n || !/^[a-z]+$/.test(raw.grid)) return null;
    if (!Array.isArray(raw.words) || raw.words.length !== cfg.count) return null;
    const words = [];
    for (const p of raw.words) {
      if (!Array.isArray(p) || p.length !== 4) return null;
      const [w, r, c, d] = p;
      if (typeof w !== 'string' || !/^[a-z]+$/.test(w) || w.length < cfg.min || w.length > cfg.max) return null;
      if (![r, c, d].every(Number.isInteger) || d < 0 || d >= cfg.dirs) return null;
      const cells = cellsOf(n, r, c, d, w.length);
      if (!cells || !cells.every((i, k) => raw.grid[i] === w[k])) return null;
      if (findAll(raw.grid, n, w).length !== 1) return null;
      words.push({ w, r, c, d });
    }
    if (new Set(words.map((p) => p.w)).size !== words.length) return null;
    if (!indexList(raw.found, words.length) || !indexList(raw.hinted, words.length)) return null;
    if (!Number.isInteger(raw.tries) || raw.tries < raw.found.length) return null;
    return { mode: raw.mode, n, seed: raw.seed, theme: raw.theme, grid: raw.grid, words, found: raw.found.slice(), hinted: raw.hinted.slice(), tries: raw.tries };
  }

  const api = {
    VERSION, DIRS, MODES, THEMES, MIXED,
    rng, clash, cellsOf, lineBetween, findAll, generate, newGame,
    wordCells, isWon, isFound, progress, hints, select, hint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
