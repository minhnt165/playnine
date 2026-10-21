/* =====================================================================
 * Dò Mìn - Engine (chạy được cả trong trình duyệt lẫn Node, không đụng DOM)
 *   - Bộ sinh số ngẫu nhiên có seed (mulberry32) + băm chuỗi (FNV-1a)
 *   - Đặt mìn sau cú mở đầu tiên, loại ô được mở và 8 ô xung quanh
 *   - Ván hằng ngày: mìn cố định theo seed, cú mở đầu tiên được làm an toàn
 *     bằng cách dời mìn ra khỏi vùng mở theo một dãy ngẫu nhiên cũng có seed
 *   - Bộ giải logic: chỉ chọn bàn giải được hết mà không phải đoán (no-guess)
 *   - Mở ô (loang vùng trống), cắm cờ / dấu ?, mở nhanh (chording)
 *   - Phát hiện thắng / thua, khôi phục ván từ JSON
 * Trạng thái ván là object thuần (mảng số) nên JSON.stringify được ngay.
 * ===================================================================== */
const Minesweeper = (() => {
  /* Trạng thái từng ô */
  const HIDDEN = 0;
  const OPEN = 1;
  const FLAG = 2;
  const QUESTION = 3;

  // Tên hiển thị của từng mức nằm ở i18n.js (khóa level.<key>)
  const LEVELS = {
    easy: { key: 'easy', w: 9, h: 9, mines: 10 },
    medium: { key: 'medium', w: 16, h: 16, mines: 40 },
    hard: { key: 'hard', w: 30, h: 16, mines: 99 },
  };
  /** Ván hằng ngày luôn chơi ở mức Vừa. */
  const DAILY_LEVEL = 'medium';
  /** Giới hạn cho mức Tùy chỉnh. */
  const CUSTOM_LIMITS = { minSide: 5, maxSide: 40, minMines: 1 };

  /* ---------------- Ngẫu nhiên ---------------- */

  /** PRNG mulberry32: cùng seed thì cho cùng dãy số trên mọi máy. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Băm chuỗi thành số 32 bit không dấu (FNV-1a). */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Seed của ván hằng ngày, dateKey dạng 'YYYY-MM-DD'. */
  function dailySeed(dateKey) {
    return hashString('playnine-minesweeper-daily-' + dateKey);
  }

  /* ---------------- Hình học bàn mìn ---------------- */

  /** Các ô kề (tối đa 8) của ô idx trên bàn rộng w, cao h. */
  function neighbors(w, h, idx) {
    const r = Math.floor(idx / w);
    const c = idx % w;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= h) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const cc = c + dc;
        if (cc < 0 || cc >= w) continue;
        out.push(rr * w + cc);
      }
    }
    return out;
  }

  /**
   * Vùng an toàn của cú mở đầu tiên: ô được mở và các ô kề.
   * Nếu bàn quá dày mìn không đủ chỗ thì chỉ giữ an toàn cho đúng ô được mở.
   */
  function safeZone(w, h, mines, idx) {
    const zone = [idx].concat(neighbors(w, h, idx));
    if (w * h - zone.length < mines) return [idx];
    return zone;
  }

  /** Chuẩn hóa kích thước cho mức Tùy chỉnh (luôn chừa ít nhất 9 ô không mìn). */
  function clampCustom(w, h, mines) {
    const L = CUSTOM_LIMITS;
    const cw = Math.min(L.maxSide, Math.max(L.minSide, Math.round(Number(w) || 0)));
    const ch = Math.min(L.maxSide, Math.max(L.minSide, Math.round(Number(h) || 0)));
    const maxMines = cw * ch - 9;
    const cm = Math.min(maxMines, Math.max(L.minMines, Math.round(Number(mines) || 0)));
    return { w: cw, h: ch, mines: cm };
  }

  /* ---------------- Bộ giải logic ---------------- */

  const neighborCache = {};

  /** Bảng ô kề của mọi ô trên bàn w x h (lưu lại để dùng chung). */
  function neighborTable(w, h) {
    const key = w + 'x' + h;
    if (!neighborCache[key]) {
      const table = [];
      for (let i = 0; i < w * h; i++) table.push(neighbors(w, h, i));
      neighborCache[key] = table;
    }
    return neighborCache[key];
  }

  /** Giới hạn số nút khi liệt kê cấu hình mìn ở một lượt; vượt quá thì coi như bí. */
  const ENUM_NODE_LIMIT = 200000;

  /**
   * Bàn có giải được hoàn toàn bằng suy luận (không phải đoán) khi mở đầu ở ô start không?
   * Người giải chỉ biết những gì người chơi thấy: số trên ô đã mở và tổng số mìn.
   * Suy luận theo ba tầng, tầng sau chỉ chạy khi tầng trước bí:
   *   1. Từng ô số: đủ mìn thì các ô kề còn lại an toàn, đủ ô thì tất cả là mìn.
   *   2. Từng cặp ô số chồng nhau: phần riêng của ô này buộc phải toàn mìn / toàn an toàn.
   *   3. Liệt kê mọi cấu hình mìn hợp lệ trên viền (theo từng cụm độc lập) kết hợp tổng số mìn:
   *      ô không là mìn ở mọi cấu hình thì an toàn, là mìn ở mọi cấu hình thì là mìn.
   */
  function isSolvable(w, h, mine, start, totalMines) {
    const n = w * h;
    const nb = neighborTable(w, h);
    if (mine[start]) return false;
    const adj = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      if (mine[i]) for (const j of nb[i]) adj[j]++;
    }
    const known = new Int8Array(n).fill(-1); // -1 chưa biết, 0 đã mở, 1 đã biết là mìn
    let safeLeft = n - totalMines;
    let unknownCount = n;
    let flagged = 0;

    function open(s) {
      const stack = [s];
      while (stack.length) {
        const i = stack.pop();
        if (known[i] !== -1) continue;
        if (mine[i]) throw new Error('isSolvable: suy luận sai, mở trúng mìn');
        known[i] = 0;
        safeLeft--;
        unknownCount--;
        if (adj[i] === 0) for (const j of nb[i]) if (known[j] === -1) stack.push(j);
      }
    }

    function flag(i) {
      if (known[i] !== -1) return;
      if (!mine[i]) throw new Error('isSolvable: suy luận sai, cắm cờ ô không có mìn');
      known[i] = 1;
      flagged++;
      unknownCount--;
    }

    /** Ràng buộc của các ô số đang có ô kề chưa biết: { cells, need }. */
    function constraints() {
      const out = [];
      for (let i = 0; i < n; i++) {
        if (known[i] !== 0 || adj[i] === 0) continue;
        const cells = [];
        let need = adj[i];
        for (const j of nb[i]) {
          if (known[j] === -1) cells.push(j);
          else if (known[j] === 1) need--;
        }
        if (cells.length) out.push({ cells, need });
      }
      return out;
    }

    /** Áp kết quả suy luận; trả về true nếu có ô mới được biết. */
    function apply(safe, mines) {
      let changed = false;
      for (const i of mines) if (known[i] === -1) { flag(i); changed = true; }
      for (const i of safe) if (known[i] === -1) { open(i); changed = true; }
      return changed;
    }

    function singlePass(cons) {
      const safe = [];
      const mines = [];
      for (const c of cons) {
        if (c.need === 0) safe.push(...c.cells);
        else if (c.need === c.cells.length) mines.push(...c.cells);
      }
      return apply(safe, mines);
    }

    function pairPass(cons) {
      const byCell = new Map();
      cons.forEach((c, k) => {
        for (const i of c.cells) {
          if (!byCell.has(i)) byCell.set(i, []);
          byCell.get(i).push(k);
        }
      });
      const safe = [];
      const mines = [];
      const inA = new Set();
      for (let a = 0; a < cons.length; a++) {
        const A = cons[a];
        inA.clear();
        A.cells.forEach((i) => inA.add(i));
        const seen = new Set();
        for (const i of A.cells) {
          for (const b of byCell.get(i)) {
            if (b <= a || seen.has(b)) continue;
            seen.add(b);
            const B = cons[b];
            const onlyB = B.cells.filter((j) => !inA.has(j));
            const onlyA = A.cells.filter((j) => B.cells.indexOf(j) < 0);
            // Phần riêng của A chứa ít nhất need_A - need_B mìn; nếu bằng đúng số ô thì toàn mìn
            // và khi đó phần chung đã đủ mìn cho B nên phần riêng của B an toàn. Xét cả hai chiều.
            if (A.need - B.need === onlyA.length) { mines.push(...onlyA); safe.push(...onlyB); }
            if (B.need - A.need === onlyB.length) { mines.push(...onlyB); safe.push(...onlyA); }
          }
        }
      }
      return apply(safe, mines);
    }

    function enumPass(cons) {
      // Gom ràng buộc thành các cụm độc lập (không chung ô chưa biết nào)
      const parent = cons.map((_, k) => k);
      const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
      const owner = new Map();
      cons.forEach((c, k) => {
        for (const i of c.cells) {
          if (owner.has(i)) parent[find(k)] = find(owner.get(i));
          else owner.set(i, k);
        }
      });
      const groups = new Map();
      cons.forEach((c, k) => {
        const r = find(k);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(k);
      });

      let nodes = 0;
      const comps = [];
      for (const ks of groups.values()) {
        // Thứ tự ô theo ràng buộc để cắt nhánh sớm
        const cells = [];
        const local = new Map();
        for (const k of ks) {
          for (const i of cons[k].cells) {
            if (!local.has(i)) { local.set(i, cells.length); cells.push(i); }
          }
        }
        const m = cells.length;
        const cellCons = cells.map(() => []);
        const need = [];
        const size = [];
        ks.forEach((k, ci) => {
          need.push(cons[k].need);
          size.push(cons[k].cells.length);
          for (const i of cons[k].cells) cellCons[local.get(i)].push(ci);
        });
        const minesIn = new Array(ks.length).fill(0);
        const assigned = new Array(ks.length).fill(0);
        const value = new Int8Array(m);
        const stats = new Map(); // số mìn k -> { mineSeen, safeSeen }
        let aborted = false;
        let mineCount = 0;

        const ok = (ci) => minesIn[ci] <= need[ci] && minesIn[ci] + (size[ci] - assigned[ci]) >= need[ci];
        const step = (p) => {
          if (aborted) return;
          if (++nodes > ENUM_NODE_LIMIT) { aborted = true; return; }
          if (p === m) {
            let s = stats.get(mineCount);
            if (!s) { s = { mineSeen: new Uint8Array(m), safeSeen: new Uint8Array(m) }; stats.set(mineCount, s); }
            for (let q = 0; q < m; q++) {
              if (value[q]) s.mineSeen[q] = 1;
              else s.safeSeen[q] = 1;
            }
            return;
          }
          for (let v = 0; v <= 1; v++) {
            value[p] = v;
            mineCount += v;
            let good = true;
            for (const ci of cellCons[p]) {
              assigned[ci]++;
              minesIn[ci] += v;
            }
            for (const ci of cellCons[p]) if (!ok(ci)) { good = false; break; }
            if (good) step(p + 1);
            for (const ci of cellCons[p]) {
              assigned[ci]--;
              minesIn[ci] -= v;
            }
            mineCount -= v;
          }
        };
        step(0);
        if (aborted) return false;
        const counts = [...stats.keys()];
        comps.push({ cells, stats, counts, min: Math.min(...counts), max: Math.max(...counts) });
      }

      // Kết hợp với tổng số mìn: R mìn chưa biết, chia cho viền và I ô bên trong (không kề ô số nào)
      const R = totalMines - flagged;
      const frontier = owner.size;
      const I = unknownCount - frontier;
      const sumMin = comps.reduce((s, c) => s + c.min, 0);
      const sumMax = comps.reduce((s, c) => s + c.max, 0);
      const safe = [];
      const mines = [];
      let fMin = 0;
      let fMax = 0;
      for (const c of comps) {
        // Số mìn k của cụm khả thi nếu phần còn lại của viền + bên trong bù được cho đủ R
        const feasible = c.counts.filter((k) => k + sumMax - c.max >= R - I && k + sumMin - c.min <= R);
        fMin += Math.min(...feasible);
        fMax += Math.max(...feasible);
        c.cells.forEach((cell, q) => {
          if (feasible.every((k) => !c.stats.get(k).mineSeen[q])) safe.push(cell);
          else if (feasible.every((k) => !c.stats.get(k).safeSeen[q])) mines.push(cell);
        });
      }
      if (I > 0 && (fMin >= R || fMax <= R - I)) {
        const interiorSafe = fMin >= R;
        for (let i = 0; i < n; i++) {
          if (known[i] !== -1 || owner.has(i)) continue;
          (interiorSafe ? safe : mines).push(i);
        }
      }
      return apply(safe, mines);
    }

    open(start);
    while (safeLeft > 0) {
      const cons = constraints();
      if (singlePass(cons)) continue;
      if (pairPass(cons)) continue;
      if (enumPass(cons)) continue;
      return false;
    }
    return true;
  }

  /* ---------------- Tạo ván ---------------- */

  /** Chọn ngẫu nhiên `count` phần tử khác nhau từ mảng (Fisher-Yates từng phần, sửa tại chỗ). */
  function pickSome(arr, count, rng) {
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (arr.length - i));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr.slice(0, count);
  }

  /**
   * Tạo ván mới. opts: { w, h, mines, seed? }.
   * Không có seed: mìn chưa đặt, sẽ đặt khi mở ô đầu tiên.
   * Có seed (ván hằng ngày): mìn đặt ngay theo seed, cú mở đầu sẽ dời mìn khỏi vùng an toàn.
   */
  function createGame(opts) {
    const w = opts.w;
    const h = opts.h;
    const n = w * h;
    const mines = Math.min(opts.mines, n - 1);
    const game = {
      v: 1,
      w,
      h,
      mines,
      state: new Array(n).fill(HIDDEN),
      mine: null, // mảng 0/1, null khi chưa đặt mìn
      adj: null, // số mìn kề từng ô
      status: 'ready', // ready | playing | won | lost
      revealed: 0,
      flags: 0,
      exploded: -1,
      firstIdx: -1,
      seed: typeof opts.seed === 'number' ? opts.seed >>> 0 : null,
    };
    if (game.seed !== null) {
      const rng = seededRandom(game.seed);
      const all = [];
      for (let i = 0; i < n; i++) all.push(i);
      game.mine = new Array(n).fill(0);
      pickSome(all, mines, rng).forEach((i) => { game.mine[i] = 1; });
    }
    return game;
  }

  /** Tạo ván hằng ngày của ngày dateKey ('YYYY-MM-DD'). */
  function createDaily(dateKey) {
    const L = LEVELS[DAILY_LEVEL];
    return createGame({ w: L.w, h: L.h, mines: L.mines, seed: dailySeed(dateKey) });
  }

  /** Tạo ván với vị trí mìn cho sẵn (dùng cho test). Ván ở trạng thái đang chơi. */
  function fromMines(w, h, mineList) {
    const game = createGame({ w, h, mines: mineList.length });
    game.mine = new Array(w * h).fill(0);
    mineList.forEach((i) => { game.mine[i] = 1; });
    game.mines = mineList.length;
    computeAdj(game);
    game.status = 'playing';
    return game;
  }

  function computeAdj(game) {
    const { w, h, mine } = game;
    const adj = new Array(w * h).fill(0);
    for (let i = 0; i < w * h; i++) {
      if (!mine[i]) continue;
      for (const j of neighbors(w, h, i)) adj[j]++;
    }
    game.adj = adj;
  }

  /** Ván thường: thời gian tối đa dành cho việc tìm bàn không phải đoán. */
  const NO_GUESS_BUDGET_MS = 250;
  /** Ván có seed: số lần thử tối đa (đếm theo lần thử chứ không theo giờ để luôn tất định). */
  const NO_GUESS_SEEDED_ATTEMPTS = 300;

  /** Rải `count` mìn ngẫu nhiên lên các ô `free`, trả về mảng 0/1. */
  function scatter(n, free, count, rng) {
    const mine = new Array(n).fill(0);
    pickSome(free, count, rng).forEach((i) => { mine[i] = 1; });
    return mine;
  }

  /**
   * Đặt mìn sau cú mở đầu tiên, tránh vùng an toàn quanh ô idx, và chọn bàn giải được
   * hoàn toàn bằng logic (isSolvable). Bàn quá dày mìn có thể không tìm được trong thời gian
   * cho phép, khi đó giữ bàn cuối cùng (vẫn chơi được, chỉ là có thể phải đoán).
   */
  function placeMines(game, idx, rng) {
    const { w, h, mines } = game;
    const n = w * h;
    const zone = new Set(safeZone(w, h, mines, idx));
    const free = [];
    for (let i = 0; i < n; i++) if (!zone.has(i)) free.push(i);
    const deadline = Date.now() + NO_GUESS_BUDGET_MS;
    do {
      game.mine = scatter(n, free, mines, rng || Math.random);
    } while (!isSolvable(w, h, game.mine, idx, mines) && Date.now() < deadline);
  }

  /**
   * Ván có seed: dời các mìn đang nằm trong vùng an toàn quanh idx sang ô trống khác.
   * Nếu bàn sau khi dời vẫn phải đoán thì rải lại toàn bộ mìn (ngoài vùng an toàn) cho tới
   * khi giải được bằng logic. Mọi lựa chọn đều dùng PRNG lấy seed từ seed của ván, nên
   * cùng đề + cùng ô mở đầu thì luôn ra cùng một bàn.
   */
  function makeSafe(game, idx) {
    const { w, h, mines, mine } = game;
    const n = w * h;
    const zoneList = safeZone(w, h, mines, idx);
    const zone = new Set(zoneList);
    let moving = 0;
    for (const i of zoneList) {
      if (mine[i]) {
        mine[i] = 0;
        moving++;
      }
    }
    const rng = seededRandom((game.seed ^ 0x9e3779b9) >>> 0);
    if (moving) {
      const free = [];
      for (let i = 0; i < n; i++) if (!mine[i] && !zone.has(i)) free.push(i);
      pickSome(free, moving, rng).forEach((i) => { mine[i] = 1; });
    }
    if (isSolvable(w, h, mine, idx, mines)) return;
    const free = [];
    for (let i = 0; i < n; i++) if (!zone.has(i)) free.push(i);
    for (let attempt = 0; attempt < NO_GUESS_SEEDED_ATTEMPTS; attempt++) {
      game.mine = scatter(n, free, mines, rng);
      if (isSolvable(w, h, game.mine, idx, mines)) return;
    }
  }

  /** Chuẩn bị bàn trước cú mở đầu tiên (đặt mìn hoặc dời mìn), chuyển sang 'playing'. */
  function startAt(game, idx, rng) {
    if (game.mine) makeSafe(game, idx);
    else placeMines(game, idx, rng);
    computeAdj(game);
    game.status = 'playing';
    game.firstIdx = idx;
  }

  /* ---------------- Mở ô ---------------- */

  /** Mở ô i (không phải mìn) và loang qua các ô trống. Ghi các ô vừa mở vào `opened`. */
  function flood(game, start, opened) {
    const { w, h, state, adj, mine } = game;
    const stack = [start];
    while (stack.length) {
      const i = stack.pop();
      if (state[i] === OPEN || state[i] === FLAG || mine[i]) continue;
      state[i] = OPEN;
      game.revealed++;
      opened.push(i);
      if (adj[i] === 0) {
        for (const j of neighbors(w, h, i)) {
          if (state[j] !== OPEN && state[j] !== FLAG) stack.push(j);
        }
      }
    }
  }

  /** Kiểm tra thắng: mọi ô không có mìn đã mở. Thắng thì tự cắm cờ lên mọi mìn. */
  function checkWin(game) {
    if (game.status !== 'playing') return false;
    if (game.revealed !== game.w * game.h - game.mines) return false;
    game.status = 'won';
    for (let i = 0; i < game.state.length; i++) {
      if (game.mine[i]) game.state[i] = FLAG;
    }
    game.flags = game.mines;
    return true;
  }

  function lose(game, idx) {
    game.status = 'lost';
    game.exploded = idx;
  }

  /**
   * Mở ô idx. Trả về { opened: [chỉ số ô vừa mở], hit: trúng mìn? }.
   * Ô đã mở / đã cắm cờ / ván đã kết thúc thì không làm gì.
   */
  function reveal(game, idx, rng) {
    const res = { opened: [], hit: false };
    if (game.status === 'won' || game.status === 'lost') return res;
    const st = game.state[idx];
    if (st === OPEN || st === FLAG) return res;
    if (game.status === 'ready') startAt(game, idx, rng);
    if (game.mine[idx]) {
      game.state[idx] = OPEN;
      res.opened.push(idx);
      res.hit = true;
      lose(game, idx);
      return res;
    }
    flood(game, idx, res.opened);
    checkWin(game);
    return res;
  }

  /** Số cờ cắm quanh ô idx. */
  function flagsAround(game, idx) {
    let k = 0;
    for (const j of neighbors(game.w, game.h, idx)) if (game.state[j] === FLAG) k++;
    return k;
  }

  /**
   * Mở nhanh (chording): ô số đã mở có số cờ xung quanh đúng bằng số đó thì mở mọi ô kề
   * chưa cắm cờ. Trả về null nếu không áp dụng được, { opened, hit, blocked } nếu áp dụng.
   * blocked = true khi số cờ chưa khớp (không mở gì).
   */
  function chord(game, idx) {
    if (game.status !== 'playing') return null;
    if (game.state[idx] !== OPEN || game.mine[idx] || game.adj[idx] === 0) return null;
    const res = { opened: [], hit: false, blocked: false };
    if (flagsAround(game, idx) !== game.adj[idx]) {
      res.blocked = true;
      return res;
    }
    let firstHit = -1;
    for (const j of neighbors(game.w, game.h, idx)) {
      const st = game.state[j];
      if (st === OPEN || st === FLAG) continue;
      if (game.mine[j]) {
        game.state[j] = OPEN;
        res.opened.push(j);
        if (firstHit < 0) firstHit = j;
      } else {
        flood(game, j, res.opened);
      }
    }
    if (firstHit >= 0) {
      res.hit = true;
      lose(game, firstHit);
    } else {
      checkWin(game);
    }
    return res;
  }

  /**
   * Đổi dấu ô chưa mở: trống → cờ → (?) → trống. Dấu ? chỉ có khi allowQuestion.
   * Trả về trạng thái mới của ô, hoặc null nếu không đổi được.
   */
  function toggleFlag(game, idx, allowQuestion) {
    if (game.status !== 'ready' && game.status !== 'playing') return null;
    const st = game.state[idx];
    if (st === OPEN) return null;
    let next;
    if (st === HIDDEN) next = FLAG;
    else if (st === FLAG) next = allowQuestion ? QUESTION : HIDDEN;
    else next = HIDDEN;
    if (st === FLAG) game.flags--;
    if (next === FLAG) game.flags++;
    game.state[idx] = next;
    return next;
  }

  /* ---------------- Tiện ích ---------------- */

  /** Số mìn còn lại hiển thị trên bộ đếm: tổng mìn trừ số cờ (có thể âm). */
  function minesLeft(game) {
    return game.mines - game.flags;
  }

  /** Tỉ lệ ô an toàn đã mở (0..1). */
  function progress(game) {
    const safe = game.w * game.h - game.mines;
    return safe > 0 ? game.revealed / safe : 0;
  }

  /** Các ô cắm cờ sai (không có mìn). */
  function wrongFlags(game) {
    const out = [];
    if (!game.mine) return out;
    for (let i = 0; i < game.state.length; i++) {
      if (game.state[i] === FLAG && !game.mine[i]) out.push(i);
    }
    return out;
  }

  const isBits = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => x === 0 || x === 1);

  /** Khôi phục ván từ object đã lưu (JSON.parse). Dữ liệu hỏng thì trả về null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    const w = obj.w;
    const h = obj.h;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2 || w * h > 4000) return null;
    const n = w * h;
    if (!Number.isInteger(obj.mines) || obj.mines < 1 || obj.mines >= n) return null;
    if (!Array.isArray(obj.state) || obj.state.length !== n || !obj.state.every((x) => x >= 0 && x <= 3)) return null;
    if (['ready', 'playing', 'won', 'lost'].indexOf(obj.status) < 0) return null;
    if (obj.mine !== null && !isBits(obj.mine, n)) return null;
    if (obj.status !== 'ready' && !obj.mine) return null;
    if (obj.mine && obj.mine.reduce((s, x) => s + x, 0) !== obj.mines) return null;
    const game = {
      v: 1,
      w,
      h,
      mines: obj.mines,
      state: obj.state.slice(),
      mine: obj.mine ? obj.mine.slice() : null,
      adj: null,
      status: obj.status,
      revealed: 0,
      flags: 0,
      exploded: Number.isInteger(obj.exploded) ? obj.exploded : -1,
      firstIdx: Number.isInteger(obj.firstIdx) ? obj.firstIdx : -1,
      seed: typeof obj.seed === 'number' ? obj.seed >>> 0 : null,
    };
    for (let i = 0; i < n; i++) {
      if (game.state[i] === OPEN) game.revealed++;
      else if (game.state[i] === FLAG) game.flags++;
    }
    if (game.mine && game.status !== 'ready') computeAdj(game);
    if (game.status === 'ready' && game.revealed) return null;
    return game;
  }

  return {
    HIDDEN,
    OPEN,
    FLAG,
    QUESTION,
    LEVELS,
    DAILY_LEVEL,
    CUSTOM_LIMITS,
    seededRandom,
    hashString,
    dailySeed,
    neighbors,
    safeZone,
    clampCustom,
    createGame,
    createDaily,
    fromMines,
    reveal,
    chord,
    toggleFlag,
    flagsAround,
    checkWin,
    minesLeft,
    progress,
    wrongFlags,
    restore,
    isSolvable,
  };
})();

if (typeof window !== 'undefined') window.Minesweeper = Minesweeper;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Minesweeper;
}
