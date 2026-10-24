/* =====================================================================
 * Ghép Ba - Engine thuần (không đụng DOM, chạy được trong Node để test và cho bot)
 *   - Bàn 8×8, 6 loại viên. Ô là số nguyên: loại (0..5) | (đặc biệt << 3); cầu vồng = 6; ô trống = -1
 *     đặc biệt: 1 sọc ngang (xóa cả hàng), 2 sọc dọc (xóa cả cột), 3 bom (nổ 3×3)
 *   - Đổi chỗ hai viên kề nhau: hợp lệ nếu tạo hàng ≥ 3, hoặc có viên cầu vồng, hoặc cả hai đều là viên đặc biệt
 *   - Hàng 4 → viên sọc (cùng hướng với hàng), hàng hình L / T → bom, hàng ≥ 5 → cầu vồng
 *   - Xóa → rơi → viên mới (PRNG mulberry32 theo seed, trạng thái lưu trong ván) → dây chuyền, điểm nhân theo bậc
 *   - Bàn mới không có hàng sẵn và luôn có nước; hết nước thì xáo (giữ không có hàng sẵn)
 *   - 30 nước mỗi ván; hết nước thì hết ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const N = 8; // cạnh bàn
  const KINDS = 6; // số loại viên thường
  const MOVES = 30; // số nước mỗi ván
  const RAINBOW = 6;
  const EMPTY = -1;
  const SP = { NONE: 0, ROW: 1, COL: 2, BOMB: 3 };
  const TILE_POINTS = 10; // mỗi viên bị xóa
  const BONUS = { 1: 20, 2: 20, 3: 30, rainbow: 50 }; // thưởng khi tạo viên đặc biệt (nhân theo bậc dây chuyền)
  const MODES = ['classic', 'daily'];
  const MAX_STEPS = 500; // chặn an toàn cho dây chuyền

  /* ---------------- Ô ---------------- */
  const make = (k, sp) => k | ((sp || 0) << 3);
  const kindOf = (v) => v & 7;
  const spOf = (v) => (v === RAINBOW || v < 0 ? 0 : v >> 3);
  const isRainbow = (v) => v === RAINBOW;
  /** Viên có hiệu ứng (sọc, bom, cầu vồng). */
  const isSpecial = (v) => v === RAINBOW || (v >= 8 && spOf(v) > 0);
  /** Viên thường hoặc đặc biệt của một loại (0..5) thì tham gia ghép hàng; cầu vồng và ô trống thì không. */
  const matchKind = (v) => (v >= 0 && v !== RAINBOW ? kindOf(v) : -1);
  const validCell = (v) => Number.isInteger(v) && (v === RAINBOW || (v >= 0 && v < 32 && kindOf(v) < KINDS));
  const rc = (i) => [Math.floor(i / N), i % N];
  const idx = (r, c) => r * N + c;
  const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  const adjacent = (a, b) => {
    const [ra, ca] = rc(a);
    const [rb, cb] = rc(b);
    return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
  };
  function range(a, b) {
    const out = [];
    for (let x = a; x < b; x++) out.push(x);
    return out;
  }

  /* ---------------- PRNG ---------------- */
  /** mulberry32: r() → [0, 1), r.int(n), r.getState() / r.setState(s) để lưu và chạy tiếp đúng dãy. */
  function rng(seed) {
    let s = seed >>> 0;
    const r = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.getState = () => s;
    r.setState = (v) => { s = v >>> 0; };
    return r;
  }

  /** Băm chuỗi FNV-1a 32 bit (seed của bàn hằng ngày). */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dailySeed = (date) => hashString('ghepba-daily-' + date);

  /* ---------------- Tìm hàng ---------------- */
  /** Mọi hàng ≥ 3 cùng loại: [{ dir: 'h' | 'v', kind, cells }]. */
  function findRuns(board) {
    const runs = [];
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const k = matchKind(board[idx(r, c)]);
        let e = c + 1;
        while (k >= 0 && e < N && matchKind(board[idx(r, e)]) === k) e++;
        if (k >= 0 && e - c >= 3) runs.push({ dir: 'h', kind: k, cells: range(c, e).map((x) => idx(r, x)) });
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const k = matchKind(board[idx(r, c)]);
        let e = r + 1;
        while (k >= 0 && e < N && matchKind(board[idx(e, c)]) === k) e++;
        if (k >= 0 && e - r >= 3) runs.push({ dir: 'v', kind: k, cells: range(r, e).map((x) => idx(x, c)) });
        r = e;
      }
    }
    return runs;
  }

  /**
   * Gom các hàng có chung ô (hình L / T / chữ thập) thành nhóm và quyết định viên đặc biệt sinh ra:
   * [{ kind, cells, runs, spawn: null | { i, v } }]. `swapCells` (2 ô vừa đổi) là chỗ ưu tiên đặt viên mới.
   */
  function findGroups(board, swapCells) {
    const runs = findRuns(board);
    const parent = runs.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const owner = new Map(); // ô → hàng đầu tiên chứa nó
    runs.forEach((run, ri) => {
      run.cells.forEach((i) => {
        if (owner.has(i)) parent[find(ri)] = find(owner.get(i));
        else owner.set(i, ri);
      });
    });
    const byRoot = new Map();
    runs.forEach((run, ri) => {
      const k = find(ri);
      if (!byRoot.has(k)) byRoot.set(k, []);
      byRoot.get(k).push(run);
    });
    const groups = [];
    byRoot.forEach((rs) => {
      const set = new Set();
      rs.forEach((run) => run.cells.forEach((i) => set.add(i)));
      const cells = Array.from(set).sort((a, b) => a - b);
      groups.push({ kind: rs[0].kind, cells, runs: rs, spawn: spawnOf(rs, cells, swapCells || []) });
    });
    groups.sort((a, b) => a.cells[0] - b.cells[0]);
    return groups;
  }

  /** Viên đặc biệt của một nhóm: ≥ 5 thẳng → cầu vồng; có cả ngang lẫn dọc → bom; 4 thẳng → sọc; 3 → không có. */
  function spawnOf(runs, cells, swapCells) {
    const k = runs[0].kind;
    const longest = runs.reduce((m, r) => (r.cells.length > m.cells.length ? r : m), runs[0]);
    const hasH = runs.some((r) => r.dir === 'h');
    const hasV = runs.some((r) => r.dir === 'v');
    let v;
    let at; // chỗ đặt mặc định (khi không có ô vừa đổi trong nhóm, tức trong dây chuyền)
    const mid = (run) => run.cells[Math.floor((run.cells.length - 1) / 2)];
    if (longest.cells.length >= 5) {
      v = RAINBOW;
      at = mid(longest);
    } else if (hasH && hasV) {
      v = make(k, SP.BOMB);
      // ô giao đầu tiên của một hàng ngang và một hàng dọc
      const hs = new Set();
      runs.filter((r) => r.dir === 'h').forEach((r) => r.cells.forEach((i) => hs.add(i)));
      at = cells.filter((i) => hs.has(i) && runs.some((r) => r.dir === 'v' && r.cells.indexOf(i) >= 0))[0];
    } else if (longest.cells.length === 4) {
      v = make(k, longest.dir === 'h' ? SP.ROW : SP.COL);
      at = mid(longest);
    } else {
      return null;
    }
    // Ô người chơi vừa kéo tới (b) được ưu tiên, rồi tới ô kia (a)
    for (let j = swapCells.length - 1; j >= 0; j--) if (cells.indexOf(swapCells[j]) >= 0) return { i: swapCells[j], v };
    return { i: at, v };
  }

  const hasMatch = (board) => findRuns(board).length > 0;

  /** Độ dài đoạn cùng loại k đi qua ô (r, c) theo hướng (dr, dc), kể cả ô đó. */
  function lineLen(board, r, c, dr, dc, k) {
    let n = 1;
    for (let s = 1; inside(r + dr * s, c + dc * s) && matchKind(board[idx(r + dr * s, c + dc * s)]) === k; s++) n++;
    for (let s = 1; inside(r - dr * s, c - dc * s) && matchKind(board[idx(r - dr * s, c - dc * s)]) === k; s++) n++;
    return n;
  }
  /** Ô i có nằm trong hàng ≥ 3 không (chỉ xét quanh ô đó). */
  function makesLine(board, i) {
    const k = matchKind(board[i]);
    if (k < 0) return false;
    const [r, c] = rc(i);
    return lineLen(board, r, c, 0, 1, k) >= 3 || lineLen(board, r, c, 1, 0, k) >= 3;
  }

  /** Hai viên kề nhau có đổi được không (không đổi bàn). */
  function swapValid(board, a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= N * N || b >= N * N || !adjacent(a, b)) return false;
    const va = board[a];
    const vb = board[b];
    if (va < 0 || vb < 0) return false;
    if (isRainbow(va) || isRainbow(vb)) return true;
    if (spOf(va) > 0 && spOf(vb) > 0) return true;
    if (matchKind(va) === matchKind(vb)) return false;
    board[a] = vb;
    board[b] = va;
    const ok = makesLine(board, a) || makesLine(board, b);
    board[a] = va;
    board[b] = vb;
    return ok;
  }

  /** Mọi nước đi hợp lệ [a, b] (b là ô bên phải hoặc bên dưới a), theo thứ tự đọc. */
  function findMoves(board) {
    const out = [];
    const b = board.slice();
    for (let i = 0; i < N * N; i++) {
      const [r, c] = rc(i);
      if (c + 1 < N && swapValid(b, i, i + 1)) out.push([i, i + 1]);
      if (r + 1 < N && swapValid(b, i, i + N)) out.push([i, i + N]);
    }
    return out;
  }
  function hasMove(board) {
    const b = board.slice();
    for (let i = 0; i < N * N; i++) {
      const [r, c] = rc(i);
      if (c + 1 < N && swapValid(b, i, i + 1)) return true;
      if (r + 1 < N && swapValid(b, i, i + N)) return true;
    }
    return false;
  }

  /* ---------------- Sinh bàn ---------------- */
  /** Bàn mới: không có hàng sẵn (mỗi ô tránh loại tạo hàng với hai ô bên trái / bên trên) và có ít nhất một nước. */
  function generateBoard(r) {
    for (;;) {
      const board = new Array(N * N);
      for (let i = 0; i < N * N; i++) {
        const [y, x] = rc(i);
        const ban = [];
        if (x >= 2 && board[i - 1] === board[i - 2]) ban.push(board[i - 1]);
        if (y >= 2 && board[i - N] === board[i - 2 * N]) ban.push(board[i - N]);
        const ok = range(0, KINDS).filter((k) => ban.indexOf(k) < 0);
        board[i] = ok[r.int(ok.length)];
      }
      if (hasMove(board)) return board;
    }
  }

  /** Xáo bàn hết nước: hoán vị các viên hiện có (giữ cả viên đặc biệt) tới khi không có hàng sẵn và có nước. */
  function shuffleBoard(board, r) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const b = board.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = r.int(i + 1);
        const t = b[i];
        b[i] = b[j];
        b[j] = t;
      }
      if (!hasMatch(b) && hasMove(b)) return b;
    }
    return generateBoard(r); // gần như không xảy ra: sinh bàn mới
  }

  /* ---------------- Xóa, hiệu ứng viên đặc biệt ---------------- */
  const rowCells = (i) => range(0, N).map((c) => idx(rc(i)[0], c));
  const colCells = (i) => range(0, N).map((r) => idx(r, rc(i)[1]));
  function boxCells(i, rad) {
    const [r, c] = rc(i);
    const out = [];
    for (let y = r - rad; y <= r + rad; y++) for (let x = c - rad; x <= c + rad; x++) if (inside(y, x)) out.push(idx(y, x));
    return out;
  }
  /** Loại có nhiều viên nhất còn trên bàn (trừ các ô đã bị xóa); bằng nhau lấy loại nhỏ nhất; không còn → -1. */
  function commonKind(board, skip) {
    const cnt = new Array(KINDS).fill(0);
    board.forEach((v, i) => {
      const k = matchKind(v);
      if (k >= 0 && !skip.has(i)) cnt[k]++;
    });
    let best = -1;
    for (let k = 0; k < KINDS; k++) if (cnt[k] > 0 && (best < 0 || cnt[k] > cnt[best])) best = k;
    return best;
  }

  /**
   * Xóa các ô `initial` và lan hiệu ứng của mọi viên đặc biệt bị xóa (dây chuyền trong cùng một bậc):
   *   sọc ngang → cả hàng; sọc dọc → cả cột; bom → 3×3; cầu vồng bị trúng → mọi viên của loại nhiều nhất.
   * `fired`: ô đặc biệt đã kích hoạt rồi (viên vừa đổi trong combo). Trả { cleared: Set, effects }.
   */
  function blast(board, initial, fired, effects) {
    const clear = new Set(initial);
    const done = new Set(fired || []);
    const queue = initial.filter((i) => isSpecial(board[i]) && !done.has(i));
    const out = effects || [];
    while (queue.length) {
      const i = queue.shift();
      if (done.has(i)) continue;
      done.add(i);
      const v = board[i];
      let targets;
      if (isRainbow(v)) {
        const k = commonKind(board, clear);
        targets = k < 0 ? [] : range(0, N * N).filter((j) => matchKind(board[j]) === k);
        out.push({ type: 'rainbow', i, k });
      } else if (spOf(v) === SP.ROW) {
        targets = rowCells(i);
        out.push({ type: 'row', i });
      } else if (spOf(v) === SP.COL) {
        targets = colCells(i);
        out.push({ type: 'col', i });
      } else {
        targets = boxCells(i, 1);
        out.push({ type: 'bomb', i, r: 1 });
      }
      targets.forEach((t) => {
        if (board[t] < 0 || clear.has(t)) return;
        clear.add(t);
        if (isSpecial(board[t]) && !done.has(t)) queue.push(t);
      });
    }
    return { cleared: clear, effects: out };
  }

  /**
   * Bậc đầu của nước đổi hai viên đặc biệt (hoặc có cầu vồng). `board` đã đổi chỗ: viên từ a nằm ở b.
   * Luật kết hợp (giống các game match-3 phổ biến, người chơi quen):
   *   cầu vồng + cầu vồng → xóa cả bàn; cầu vồng + viên thường → xóa mọi viên cùng loại;
   *   cầu vồng + sọc / bom → mọi viên cùng loại biến thành sọc (xen kẽ ngang / dọc) / bom rồi cùng nổ;
   *   sọc + sọc → hàng + cột qua ô b; sọc + bom → 3 hàng + 3 cột qua ô b; bom + bom → nổ 5×5 quanh ô b.
   * Trả { before, cleared, effects } (before: bàn sau khi biến viên, để giao diện vẽ). Sửa `board` tại chỗ.
   */
  function comboStep(board, a, b) {
    const va = board[b]; // viên người chơi kéo (từ a sang b)
    const vb = board[a];
    const effects = [];
    let initial;
    let fired = [a, b];
    if (isRainbow(va) && isRainbow(vb)) {
      initial = range(0, N * N).filter((i) => board[i] >= 0);
      effects.push({ type: 'all', i: b });
    } else if (isRainbow(va) || isRainbow(vb)) {
      const pr = isRainbow(va) ? b : a;
      const px = pr === b ? a : b;
      const vx = board[px];
      const k = kindOf(vx);
      const s = spOf(vx);
      const targets = range(0, N * N).filter((i) => matchKind(board[i]) === k);
      if (s === SP.ROW || s === SP.COL) {
        targets.forEach((i) => { board[i] = make(k, (rc(i)[0] + rc(i)[1]) % 2 ? SP.COL : SP.ROW); });
      } else if (s === SP.BOMB) {
        targets.forEach((i) => { board[i] = make(k, SP.BOMB); });
      }
      effects.push({ type: 'rainbow', i: pr, k });
      initial = [pr].concat(targets);
      // Cầu vồng đã dùng; viên kia: nếu là viên thường thì chỉ bị xóa, nếu là sọc / bom thì nổ cùng cả loại
      fired = s === SP.NONE ? [pr, px] : [pr];
    } else {
      const sa = spOf(va);
      const sb = spOf(vb);
      const [r, c] = rc(b);
      initial = [a, b];
      const add = [];
      if (sa !== SP.BOMB && sb !== SP.BOMB) {
        add.push(...rowCells(b), ...colCells(b));
        effects.push({ type: 'row', i: b }, { type: 'col', i: b });
      } else if (sa === SP.BOMB && sb === SP.BOMB) {
        add.push(...boxCells(b, 2));
        effects.push({ type: 'bomb', i: b, r: 2 });
      } else {
        for (let d = -1; d <= 1; d++) {
          if (inside(r + d, c)) {
            add.push(...rowCells(idx(r + d, c)));
            effects.push({ type: 'row', i: idx(r + d, c) });
          }
          if (inside(r, c + d)) {
            add.push(...colCells(idx(r, c + d)));
            effects.push({ type: 'col', i: idx(r, c + d) });
          }
        }
      }
      add.forEach((i) => { if (initial.indexOf(i) < 0) initial.push(i); });
    }
    const before = board.slice();
    const res = blast(board, initial, fired, effects);
    return { before, cleared: res.cleared, effects: res.effects };
  }

  /** Rơi: viên rơi xuống lấp ô trống, viên mới (r.int(6)) vào chỗ trống trên cùng; cột trái → phải, dưới → trên.
   *  Trả { board, from } với from[i] = hàng xuất phát của viên đang ở ô i (âm = rơi từ trên bàn xuống). */
  function gravity(board, r) {
    const out = new Array(N * N).fill(EMPTY);
    const from = new Array(N * N).fill(0);
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let y = N - 1; y >= 0; y--) {
        const v = board[idx(y, c)];
        if (v < 0) continue;
        out[idx(w, c)] = v;
        from[idx(w, c)] = y;
        w--;
      }
      const empties = w + 1;
      for (let y = w; y >= 0; y--) {
        out[idx(y, c)] = r.int(KINDS);
        from[idx(y, c)] = y - empties;
      }
    }
    return { board: out, from };
  }

  /**
   * Chạy hết một nước từ bàn đã đổi chỗ: các bậc xóa → rơi → dây chuyền tới khi bàn yên.
   * `swap` = [a, b] (ô vừa đổi, b là ô viên được kéo tới) hoặc null; `combo` = bậc đầu là kết hợp viên đặc biệt.
   * Mỗi bậc: { mult, points, cleared, effects, spawned, before, after, from }.
   */
  function resolve(board, r, swap, combo) {
    const steps = [];
    let cur = board.slice();
    for (let step = 1; step <= MAX_STEPS; step++) {
      let before;
      let cleared;
      let effects;
      let spawned = [];
      if (step === 1 && combo) {
        const res = comboStep(cur, swap[0], swap[1]);
        before = res.before;
        cleared = res.cleared;
        effects = res.effects;
      } else {
        const groups = findGroups(cur, step === 1 && swap ? swap : null);
        if (!groups.length) break;
        before = cur.slice();
        const init = [];
        groups.forEach((g) => g.cells.forEach((i) => init.push(i)));
        const res = blast(cur, init, [], []);
        cleared = res.cleared;
        effects = res.effects;
        spawned = groups.filter((g) => g.spawn).map((g) => g.spawn);
      }
      const bonus = spawned.reduce((s, x) => s + (isRainbow(x.v) ? BONUS.rainbow : BONUS[spOf(x.v)]), 0);
      const points = (cleared.size * TILE_POINTS + bonus) * step;
      const next = before.slice();
      cleared.forEach((i) => { next[i] = EMPTY; });
      spawned.forEach((s) => { next[s.i] = s.v; });
      const fell = gravity(next, r);
      steps.push({
        mult: step,
        points,
        cleared: Array.from(cleared).sort((x, y) => x - y),
        effects,
        spawned,
        before,
        after: fell.board,
        from: fell.from,
      });
      cur = fell.board;
    }
    return { board: cur, steps };
  }

  /* ---------------- Ván ---------------- */
  /** Ván mới: { mode: 'classic', seed } hoặc bàn hằng ngày { mode: 'daily', date: 'YYYY-MM-DD' } (seed theo ngày). */
  function newGame(opts) {
    const o = opts || {};
    const mode = MODES.indexOf(o.mode) >= 0 ? o.mode : 'classic';
    const date = mode === 'daily' ? (isDate(o.date) ? o.date : '1970-01-01') : null;
    const seed = mode === 'daily' ? dailySeed(date) : (Number.isInteger(o.seed) ? o.seed : Math.floor(Math.random() * 4294967296)) >>> 0;
    const r = rng(seed);
    const board = generateBoard(r);
    return { mode, date, seed, rng: r.getState(), board, score: 0, moves: 0, maxChain: 0, made: 0 };
  }

  const movesLeft = (g) => MOVES - g.moves;
  const isOver = (g) => g.moves >= MOVES;
  const canSwap = (g, a, b) => !isOver(g) && swapValid(g.board, a, b);

  /**
   * Đổi hai viên kề nhau (viên ở a kéo sang b). Không hợp lệ (không kề, không tạo hàng, hết ván) → null.
   * Hợp lệ → { game, swap: [a, b], steps, gained, shuffle: null | { before, after } }; ván cũ không bị đụng.
   */
  function swap(g, a, b) {
    if (!canSwap(g, a, b)) return null;
    const r = rng(0);
    r.setState(g.rng);
    const board = g.board.slice();
    const combo = isRainbow(board[a]) || isRainbow(board[b]) || (spOf(board[a]) > 0 && spOf(board[b]) > 0);
    const t = board[a];
    board[a] = board[b];
    board[b] = t;
    const res = resolve(board, r, [a, b], combo);
    const gained = res.steps.reduce((s, x) => s + x.points, 0);
    const made = res.steps.reduce((s, x) => s + x.spawned.length, 0);
    const game = {
      mode: g.mode,
      date: g.date,
      seed: g.seed,
      rng: 0,
      board: res.board,
      score: g.score + gained,
      moves: g.moves + 1,
      maxChain: Math.max(g.maxChain, res.steps.length),
      made: g.made + made,
    };
    let shuffle = null;
    if (!isOver(game) && !hasMove(game.board)) {
      const before = game.board;
      game.board = shuffleBoard(before, r);
      shuffle = { before, after: game.board };
    }
    game.rng = r.getState();
    return { game, swap: [a, b], steps: res.steps, gained, shuffle };
  }

  /* ---------------- Lưu ván ---------------- */
  const toJSON = (g) => ({ v: VERSION, mode: g.mode, date: g.date, seed: g.seed, rng: g.rng, board: g.board.slice(), score: g.score, moves: g.moves, maxChain: g.maxChain, made: g.made });

  const uint32 = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
  const nat = (x) => Number.isInteger(x) && x >= 0;
  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). Bàn phải đủ 64 ô hợp lệ, không có hàng sẵn,
   *  và còn nước nếu ván chưa hết. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { mode, date, seed, board, score, moves, maxChain, made } = raw;
    if (MODES.indexOf(mode) < 0) return null;
    if (mode === 'daily' ? !isDate(date) || seed !== dailySeed(date) : date !== null) return null;
    if (!uint32(seed) || !uint32(raw.rng)) return null;
    if (!Array.isArray(board) || board.length !== N * N || !board.every(validCell)) return null;
    if (!nat(score) || score % 10 !== 0 || !nat(moves) || moves > MOVES || !nat(maxChain) || !nat(made)) return null;
    if (moves === 0 && (score !== 0 || maxChain !== 0 || made !== 0)) return null;
    if (score < moves * 3 * TILE_POINTS || (moves > 0 && maxChain < 1)) return null; // mỗi nước ăn ít nhất 3 viên
    if (hasMatch(board)) return null;
    if (moves < MOVES && !hasMove(board)) return null;
    return { mode, date, seed, rng: raw.rng, board: board.slice(), score, moves, maxChain, made };
  }

  /* ---------------- Dạng chữ (test, gỡ lỗi) ---------------- */
  // Mỗi ô: chữ a–f là loại 0–5, thêm '-' sọc ngang, '|' sọc dọc, '*' bom; '@' cầu vồng; '.' ô trống. Cách nhau bằng dấu cách.
  function fromText(rows) {
    const cells = rows.join(' ').trim().split(/\s+/);
    if (cells.length !== N * N) throw new Error('cần ' + N * N + ' ô, có ' + cells.length);
    return cells.map((tok) => {
      if (tok === '@') return RAINBOW;
      if (tok === '.') return EMPTY;
      const k = tok.charCodeAt(0) - 97;
      const sp = tok[1] === '-' ? SP.ROW : tok[1] === '|' ? SP.COL : tok[1] === '*' ? SP.BOMB : SP.NONE;
      return make(k, sp);
    });
  }
  function toText(board) {
    const rows = [];
    for (let r = 0; r < N; r++) {
      rows.push(range(0, N).map((c) => {
        const v = board[idx(r, c)];
        if (v === RAINBOW) return '@';
        if (v < 0) return '.';
        return String.fromCharCode(97 + kindOf(v)) + ['', '-', '|', '*'][spOf(v)];
      }).join(' '));
    }
    return rows;
  }

  const api = {
    VERSION, N, KINDS, MOVES, RAINBOW, EMPTY, SP, TILE_POINTS, BONUS, MODES,
    make, kindOf, spOf, isRainbow, isSpecial, idx, rc, adjacent,
    rng, hashString, isDate, dailySeed,
    findRuns, findGroups, hasMatch, swapValid, findMoves, hasMove,
    generateBoard, shuffleBoard, blast, comboStep, gravity, resolve,
    newGame, movesLeft, isOver, canSwap, swap, toJSON, fromJSON, fromText, toText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
