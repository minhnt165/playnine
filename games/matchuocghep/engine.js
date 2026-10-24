/* =====================================================================
 * Mạt Chược Ghép - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn: các vị trí quân { x, y, z } theo nửa ô (một quân chiếm 2×2 nửa ô), z là tầng
 *   - Quân tự do: không quân nào đè lên (tầng z+1 chồng lên dù một phần) và trống cạnh trái hoặc cạnh phải
 *   - Mặt quân (42 loại): 0–8 tròn 1–9, 9–17 văn 1–9, 18–26 vạn 1–9, 27–30 gió Đông/Nam/Tây/Bắc,
 *     31–33 rồng đỏ/xanh/trắng, 34–37 hoa (ghép với hoa bất kỳ), 38–41 mùa (ghép với mùa bất kỳ)
 *   - Sinh đề luôn giải được: gỡ ngược từng cặp vị trí đang tự do trên bàn "trắng" (tìm sâu có quay lui),
 *     rồi gán từng cặp mặt quân vào cặp vị trí đó; thứ tự gỡ chính là một lời giải. Tất định theo seed.
 *   - Xáo lại (khi hết nước): tìm thứ tự gỡ mới cho các vị trí còn lại rồi gán lại mặt quân theo cặp,
 *     nên bàn sau khi xáo vẫn giải được; vị trí còn lại không gỡ hết được bằng bất kỳ cách gán nào thì trả null
 *   - Hàm thuần: nhận ván cũ, trả ván mới (ván không đổi thì trả lại đúng đối tượng cũ); toJSON / fromJSON để lưu
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const FACES = 42;
  const FLOWER = 34;
  const SEASON = 38;
  const MODES = ['turtle', 'tower', 'mini', 'daily'];
  const LAYOUT_OF = { turtle: 'turtle', tower: 'tower', mini: 'mini', daily: 'turtle' };

  /* ---------------- PRNG theo seed (mulberry32) + băm chuỗi (FNV-1a) ---------------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  const randInt = (rng, n) => Math.floor(rng() * n);

  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* ---------------- Bàn (layout) ---------------- */

  /** Hàng quân liền nhau ở tầng z, hàng y (nửa ô), từ cột c0 tới c1 (theo quân). */
  function row(out, z, y, c0, c1) {
    for (let c = c0; c <= c1; c++) out.push([c * 2, y, z]);
  }
  /** Khối chữ nhật quân ở tầng z: cột c0..c1, hàng r0..r1 (theo quân). */
  function block(out, z, c0, c1, r0, r1) {
    for (let r = r0; r <= r1; r++) row(out, z, r * 2, c0, c1);
  }

  /** Rùa (Turtle) cổ điển 144 quân: 87 + 36 + 16 + 4 + 1. */
  function turtlePositions() {
    const p = [];
    const rows0 = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
    rows0.forEach(([a, b], r) => row(p, 0, r * 2, a, b));
    p.push([0, 7, 0], [26, 7, 0], [28, 7, 0]); // một quân đầu bên trái, hai quân đuôi bên phải (lệch nửa hàng)
    block(p, 1, 4, 9, 1, 6);
    block(p, 2, 5, 8, 2, 5);
    block(p, 3, 6, 7, 3, 4);
    p.push([13, 7, 4]); // quân đỉnh nằm giữa bốn quân tầng 3
    return p;
  }

  /** Tháp 84 quân: dáng đứng (6 × 8), hợp màn hình dọc điện thoại. */
  function towerPositions() {
    const p = [];
    block(p, 0, 0, 5, 0, 7);
    block(p, 1, 1, 4, 1, 6);
    block(p, 2, 2, 3, 2, 5);
    block(p, 3, 2, 3, 3, 4);
    return p;
  }

  /** Nhỏ 36 quân: ván nhanh (4 × 6, ba tầng). */
  function miniPositions() {
    const p = [];
    block(p, 0, 0, 3, 0, 5);
    block(p, 1, 1, 2, 1, 4);
    block(p, 2, 1, 2, 2, 3);
    return p;
  }

  /**
   * Dựng bàn từ danh sách [x, y, z]: sắp theo z, x, y (đúng thứ tự vẽ: quân sau che mép quân trước),
   * tính sẵn quân đè lên (above), quân sát trái / phải cùng tầng, và trọng số cho bộ giải.
   */
  function buildLayout(key, raw) {
    const pos = raw.map(([x, y, z]) => ({ x, y, z })).sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
    const n = pos.length;
    const above = [];
    const left = [];
    const right = [];
    const under = []; // quân bị quân này đè
    for (let i = 0; i < n; i++) {
      above.push([]);
      left.push([]);
      right.push([]);
      under.push([]);
    }
    for (let i = 0; i < n; i++) {
      const a = pos[i];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = pos[j];
        const dx = b.x - a.x;
        const dy = Math.abs(b.y - a.y);
        if (b.z === a.z + 1 && Math.abs(dx) < 2 && dy < 2) {
          above[i].push(j);
          under[j].push(i);
        } else if (b.z === a.z && dy < 2) {
          if (dx === -2) left[i].push(j);
          else if (dx === 2) right[i].push(j);
        }
      }
    }
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    pos.forEach((p) => {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    });
    // Trọng số: quân càng cao, càng đè / chặn nhiều quân thì càng nên gỡ sớm
    const weight = pos.map((p, i) => p.z * 4 + under[i].length * 2 + left[i].length + right[i].length);
    return { key, n, pos, above, left, right, under, weight, cols: maxX / 2 + 1, rows: maxY / 2 + 1, maxZ };
  }

  const LAYOUTS = {
    turtle: buildLayout('turtle', turtlePositions()),
    tower: buildLayout('tower', towerPositions()),
    mini: buildLayout('mini', miniPositions()),
  };

  const layoutOf = (mode) => LAYOUTS[LAYOUT_OF[mode]] || null;

  /** Quân i có tự do không, với present[j] = quân j còn trên bàn. */
  function freeIn(L, present, i) {
    if (!present[i]) return false;
    const up = L.above[i];
    for (let k = 0; k < up.length; k++) if (present[up[k]]) return false;
    let blocked = false;
    const lf = L.left[i];
    for (let k = 0; k < lf.length; k++) if (present[lf[k]]) { blocked = true; break; }
    if (!blocked) return true;
    const rt = L.right[i];
    for (let k = 0; k < rt.length; k++) if (present[rt[k]]) return false;
    return true;
  }

  function freeList(L, present) {
    const out = [];
    for (let i = 0; i < L.n; i++) if (freeIn(L, present, i)) out.push(i);
    return out;
  }

  /* ---------------- Mặt quân ---------------- */

  const matchClass = (f) => (f >= SEASON ? SEASON : f >= FLOWER ? FLOWER : f);
  const isFace = (f) => Number.isInteger(f) && f >= 0 && f < FACES;
  /** Hai mặt ghép được: giống hệt, hoặc cùng là hoa, hoặc cùng là mùa. */
  const canMatch = (a, b) => isFace(a) && isFace(b) && matchClass(a) === matchClass(b);

  /** Loại quân để vẽ / đọc tên: { suit: 'dots'|'bamboo'|'chars'|'wind'|'dragon'|'flower'|'season', rank } (rank từ 1). */
  function faceInfo(f) {
    if (f < 9) return { suit: 'dots', rank: f + 1 };
    if (f < 18) return { suit: 'bamboo', rank: f - 8 };
    if (f < 27) return { suit: 'chars', rank: f - 17 };
    if (f < 31) return { suit: 'wind', rank: f - 26 };
    if (f < 34) return { suit: 'dragon', rank: f - 30 };
    if (f < 38) return { suit: 'flower', rank: f - 33 };
    return { suit: 'season', rank: f - 37 };
  }

  /** 72 cặp của bộ 144 quân chuẩn: mỗi mặt thường hai cặp; bốn hoa ghép ngẫu nhiên thành hai cặp, bốn mùa cũng vậy. */
  function pairPool(rng) {
    const pairs = [];
    for (let f = 0; f < FLOWER; f++) pairs.push([f, f], [f, f]);
    [FLOWER, SEASON].forEach((base) => {
      const s = shuffled([base, base + 1, base + 2, base + 3], rng);
      pairs.push([s[0], s[1]], [s[2], s[3]]);
    });
    return pairs;
  }

  /* ---------------- Thứ tự gỡ trên bàn trắng ---------------- */

  /**
   * Tìm thứ tự gỡ hết các vị trí present (chưa quan tâm mặt quân): mỗi bước gỡ hai vị trí đang tự do.
   * Tìm sâu ngẫu nhiên có quay lui, nhớ các tập vị trí đã biết là bế tắc; quá maxNodes thì bỏ (null).
   * Trả mảng cặp [a, b] theo thứ tự gỡ, hoặc null nếu không gỡ hết được.
   */
  function removalOrder(L, present0, rng, maxNodes) {
    const present = present0.slice();
    let left = 0;
    for (let i = 0; i < L.n; i++) if (present[i]) left++;
    if (left % 2) return null;
    const limit = maxNodes || 20000;
    const dead = new Set();
    const order = [];
    let nodes = 0;
    function rec() {
      if (left === 0) return true;
      if (++nodes > limit) return false;
      const key = present.map((p) => (p ? 1 : 0)).join('');
      if (dead.has(key)) return false;
      const free = shuffled(freeList(L, present), rng);
      if (free.length >= 2) {
        // Thử vài cặp đầu theo thứ tự ngẫu nhiên (đủ để thoát bế tắc, không vét hết mọi cặp)
        let tries = 0;
        for (let a = 0; a < free.length && tries < 24; a++) {
          for (let b = a + 1; b < free.length && tries < 24; b++, tries++) {
            const i = free[a];
            const j = free[b];
            present[i] = present[j] = false;
            left -= 2;
            order.push([i, j]);
            if (rec()) return true;
            order.pop();
            present[i] = present[j] = true;
            left += 2;
            if (nodes > limit) return false;
          }
        }
      }
      dead.add(key);
      return false;
    }
    return rec() ? order : null;
  }

  /** Chia bài: mặt quân theo vị trí + một lời giải (thứ tự gỡ). Tất định theo layout + seed. */
  function deal(layoutKey, seed) {
    const L = LAYOUTS[layoutKey];
    const rng = mulberry32(seed);
    let order = null;
    for (let attempt = 0; !order && attempt < 50; attempt++) order = removalOrder(L, new Array(L.n).fill(true), rng);
    if (!order) throw new Error('deal: không sinh được thứ tự gỡ');
    const pool = shuffled(pairPool(rng), rng).slice(0, L.n / 2);
    const faces = new Array(L.n).fill(-1);
    order.forEach(([a, b], k) => {
      const [fa, fb] = rng() < 0.5 ? pool[k] : [pool[k][1], pool[k][0]];
      faces[a] = fa;
      faces[b] = fb;
    });
    return { faces, order };
  }

  /* ---------------- Ngày (đề hằng ngày) ---------------- */

  const pad2 = (n) => String(n).padStart(2, '0');
  /** 'YYYY-MM-DD' theo giờ máy. */
  const dateKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dailySeed = (key) => hashString('matchuocghep-daily-v1-' + key);
  /** Số thứ tự đề ngày: 2026-10-24 là #1. */
  function dayNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 9, 24)) / 86400000) + 1;
  }

  /* ---------------- Ván ---------------- */

  /**
   * Ván mới. opts: { mode, seed } (seed số nguyên 0..2^32-1); mode 'daily' cần { date: 'YYYY-MM-DD' } và tự lấy seed theo ngày.
   * Trạng thái: { mode, seed, date, faces[], gone[] (0/1), history[], moves, hints, shuffles }
   *   history: [a, b] = cặp đã gỡ; { s: faces[] } = lần xáo (mặt quân trước khi xáo) để hoàn tác
   */
  function newGame(opts) {
    const mode = MODES.indexOf(opts && opts.mode) >= 0 ? opts.mode : 'turtle';
    const date = mode === 'daily' ? opts.date : null;
    if (mode === 'daily' && !isDateKey(date)) throw new Error('newGame: daily cần date YYYY-MM-DD');
    const seed = mode === 'daily' ? dailySeed(date) : (Number(opts && opts.seed) >>> 0);
    const L = layoutOf(mode);
    const { faces } = deal(L.key, seed);
    return { mode, seed, date, faces, gone: new Array(L.n).fill(0), history: [], moves: 0, hints: 0, shuffles: 0 };
  }

  const presentOf = (g) => g.gone.map((x) => !x);
  const isFree = (g, i) => freeIn(layoutOf(g.mode), presentOf(g), i);
  const freeTiles = (g) => freeList(layoutOf(g.mode), presentOf(g));
  const remaining = (g) => g.gone.reduce((s, x) => s + (x ? 0 : 1), 0);
  const isWon = (g) => remaining(g) === 0;
  const progress = (g) => 1 - remaining(g) / g.gone.length;

  /** Mọi cặp đang gỡ được [a, b] (a < b). */
  function availablePairs(g) {
    const free = freeTiles(g);
    const out = [];
    for (let a = 0; a < free.length; a++) {
      for (let b = a + 1; b < free.length; b++) if (canMatch(g.faces[free[a]], g.faces[free[b]])) out.push([free[a], free[b]]);
    }
    return out;
  }
  const hasMoves = (g) => availablePairs(g).length > 0;
  /** Hết nước: còn quân nhưng không cặp nào gỡ được. */
  const isStuck = (g) => !isWon(g) && !hasMoves(g);

  const copy = (g, patch) => Object.assign({ mode: g.mode, seed: g.seed, date: g.date, faces: g.faces, gone: g.gone, history: g.history, moves: g.moves, hints: g.hints, shuffles: g.shuffles }, patch);

  /** Gỡ cặp (a, b): cả hai còn trên bàn, tự do, khác nhau và ghép được; không hợp lệ thì trả lại ván cũ. */
  function match(g, a, b) {
    const n = g.gone.length;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 || a >= n || b >= n) return g;
    if (!canMatch(g.faces[a], g.faces[b]) || !isFree(g, a) || !isFree(g, b)) return g;
    const gone = g.gone.slice();
    gone[a] = gone[b] = 1;
    return copy(g, { gone, history: g.history.concat([[a, b]]), moves: g.moves + 1 });
  }

  const canUndo = (g) => g.history.length > 0;

  /** Hoàn tác bước cuối (một cặp đã gỡ, hoặc một lần xáo). Số gợi ý / số lần xáo / số nước không giảm. */
  function undo(g) {
    if (!canUndo(g)) return g;
    const last = g.history[g.history.length - 1];
    const history = g.history.slice(0, -1);
    if (Array.isArray(last)) {
      const gone = g.gone.slice();
      gone[last[0]] = gone[last[1]] = 0;
      return copy(g, { gone, history });
    }
    return copy(g, { faces: last.s.slice(), history });
  }

  /* ---------------- Bộ giải (gợi ý, test) ---------------- */

  /** b nằm (trực tiếp hoặc gián tiếp) trên a: a không thể tự do khi b còn. */
  function coveredBy(L, a, b) {
    const stack = [a];
    const seen = new Set();
    while (stack.length) {
      const x = stack.pop();
      for (const y of L.above[x]) {
        if (y === b) return true;
        if (!seen.has(y)) {
          seen.add(y);
          stack.push(y);
        }
      }
    }
    return false;
  }

  /**
   * Một lượt tìm sâu với ngân sách maxNodes; noise > 0 trộn ngẫu nhiên thứ tự thử (cho các lượt khởi động lại).
   *   - Nước "an toàn" (mọi quân còn lại của một loại đều đang tự do) đi ngay, không rẽ nhánh
   *   - Cắt nhánh chắc chắn bế tắc: loại còn đúng 2 quân mà quân này nằm trên quân kia
   *   - Còn lại thử các cặp theo điểm: số quân được giải phóng × 10 + trọng số vị trí (+ nhiễu)
   *   - Nhớ trạng thái đã biết là bế tắc (chỉ khi vét hết nhánh, không tính nhánh dừng vì hết ngân sách)
   */
  function solveRun(g, maxNodes, rng, noise) {
    const L = layoutOf(g.mode);
    const faces = g.faces;
    const present = presentOf(g);
    const remain = new Array(FACES).fill(0);
    const members = new Map(); // loại → các vị trí ban đầu còn trên bàn
    let left = 0;
    for (let i = 0; i < L.n; i++) {
      if (!present[i]) continue;
      const c = matchClass(faces[i]);
      remain[c]++;
      left++;
      if (!members.has(c)) members.set(c, []);
      members.get(c).push(i);
    }
    const dead = new Set();
    const coverMemo = new Map();
    const path = [];
    let nodes = 0;
    let aborted = false;
    const take = (i, j) => {
      present[i] = present[j] = false;
      remain[matchClass(faces[i])] -= 2;
      left -= 2;
      path.push([i, j]);
    };
    const put = (i, j) => {
      present[i] = present[j] = true;
      remain[matchClass(faces[i])] += 2;
      left += 2;
      path.pop();
    };
    function hopeless() {
      for (const [c, list] of members) {
        if (remain[c] !== 2) continue;
        const two = list.filter((i) => present[i]);
        const k = two[0] * 4096 + two[1];
        let v = coverMemo.get(k);
        if (v === undefined) {
          v = coveredBy(L, two[0], two[1]) || coveredBy(L, two[1], two[0]);
          coverMemo.set(k, v);
        }
        if (v) return true;
      }
      return false;
    }
    function freed(i, j) {
      present[i] = present[j] = false;
      const near = new Set(L.under[i].concat(L.under[j], L.left[i], L.right[i], L.left[j], L.right[j]));
      let n = 0;
      near.forEach((k) => { if (freeIn(L, present, k)) n++; });
      present[i] = present[j] = true;
      return n;
    }
    function rec() {
      if (left === 0) return true;
      if (++nodes > maxNodes) {
        aborted = true;
        return false;
      }
      const key = present.map((p) => (p ? 1 : 0)).join('');
      if (dead.has(key)) return false;
      if (hopeless()) {
        dead.add(key);
        return false;
      }
      const byClass = new Map();
      freeList(L, present).forEach((i) => {
        const c = matchClass(faces[i]);
        if (!byClass.has(c)) byClass.set(c, []);
        byClass.get(c).push(i);
      });
      for (const [c, list] of byClass) {
        if (list.length === remain[c] && list.length >= 2) {
          take(list[0], list[1]);
          if (list.length === 4) take(list[2], list[3]);
          if (rec()) return true;
          if (list.length === 4) put(list[2], list[3]);
          put(list[0], list[1]);
          if (!aborted) dead.add(key);
          return false;
        }
      }
      const cand = [];
      byClass.forEach((list) => {
        for (let a = 0; a < list.length; a++) {
          for (let b = a + 1; b < list.length; b++) {
            const i = list[a];
            const j = list[b];
            cand.push({ i, j, s: freed(i, j) * 10 + L.weight[i] + L.weight[j] + (noise ? rng() * noise : 0) });
          }
        }
      });
      cand.sort((p, q) => q.s - p.s || p.i - q.i || p.j - q.j);
      for (const { i, j } of cand) {
        take(i, j);
        if (rec()) return true;
        put(i, j);
        if (aborted) return false;
      }
      dead.add(key);
      return false;
    }
    const solved = rec();
    return { solved, moves: solved ? path.slice() : [], exhausted: !solved && !aborted, nodes };
  }

  /**
   * Tìm cách gỡ hết từ ván hiện tại: nhiều lượt tìm sâu ngắn, lượt sau trộn ngẫu nhiên thứ tự thử (khởi động lại
   * hiệu quả hơn một lượt dài với bài toán này). opts: { budget = 800 nút mỗi lượt, restarts = 30, noise = 30 }.
   * Trả { solved, moves: [[a, b]…], exhausted } (exhausted = một lượt đã vét hết mà không có lời giải, tức chắc chắn bế tắc;
   * solved và exhausted cùng false = chưa rõ, hết ngân sách). Tất định theo ván.
   */
  function solve(g, opts) {
    const o = Object.assign({ budget: 800, restarts: 30, noise: 30 }, opts || {});
    const rng = mulberry32(hashString('solve:' + g.seed + ':' + remaining(g)));
    for (let r = 0; r < o.restarts; r++) {
      const res = solveRun(g, o.budget, rng, r ? o.noise : 0);
      if (res.solved || res.exhausted) return { solved: res.solved, moves: res.moves, exhausted: res.exhausted };
    }
    return { solved: false, moves: [], exhausted: false };
  }

  /**
   * Gợi ý một cặp gỡ được, ưu tiên cặp nằm trên một đường gỡ hết (theo bộ giải); bộ giải chưa tìm ra thì lấy cặp
   * có trọng số lớn nhất. Trả { a, b, solvable (true / false / null = chưa rõ), game (đã cộng 1 gợi ý) } hoặc null nếu hết nước.
   */
  function hint(g, opts) {
    const pairs = availablePairs(g);
    if (!pairs.length) return null;
    const L = layoutOf(g.mode);
    const r = solve(g, opts);
    let pair;
    if (r.solved) pair = r.moves[0];
    else pair = pairs.slice().sort((p, q) => L.weight[q[0]] + L.weight[q[1]] - L.weight[p[0]] - L.weight[p[1]])[0];
    const [a, b] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
    return { a, b, solvable: r.solved ? true : r.exhausted ? false : null, game: copy(g, { hints: g.hints + 1 }) };
  }

  /**
   * Xáo lại các quân còn trên bàn sao cho vẫn gỡ hết được: tìm thứ tự gỡ cho các vị trí còn lại, ghép mặt quân còn lại
   * thành cặp (cùng loại) rồi gán từng cặp vào thứ tự đó. Tất định theo seed + số lần xáo. Không gỡ hết được → null.
   */
  function shuffle(g) {
    if (isWon(g)) return null;
    const L = layoutOf(g.mode);
    const present = presentOf(g);
    const left = remaining(g);
    const rng = mulberry32(hashString(g.seed + ':' + g.shuffles + ':' + left + ':' + g.moves));
    let order = null;
    for (let attempt = 0; !order && attempt < 6; attempt++) order = removalOrder(L, present, rng, 8000);
    if (!order) return null;
    const byClass = new Map();
    for (let i = 0; i < L.n; i++) {
      if (!present[i]) continue;
      const c = matchClass(g.faces[i]);
      if (!byClass.has(c)) byClass.set(c, []);
      byClass.get(c).push(g.faces[i]);
    }
    const pairs = [];
    for (const list of byClass.values()) {
      if (list.length % 2) return null; // không thể xảy ra với ván hợp lệ
      const s = shuffled(list, rng);
      for (let k = 0; k < s.length; k += 2) pairs.push([s[k], s[k + 1]]);
    }
    const mixed = shuffled(pairs, rng);
    const faces = g.faces.slice();
    order.forEach(([a, b], k) => {
      faces[a] = mixed[k][0];
      faces[b] = mixed[k][1];
    });
    return copy(g, { faces, history: g.history.concat([{ s: g.faces.slice() }]), shuffles: g.shuffles + 1 });
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    seed: g.seed,
    date: g.date,
    faces: g.faces.slice(),
    gone: g.gone.slice(),
    history: g.history.map((h) => (Array.isArray(h) ? h.slice() : { s: h.s.slice() })),
    moves: g.moves,
    hints: g.hints,
    shuffles: g.shuffles,
  });

  const sortedKey = (arr) => arr.slice().sort((a, b) => a - b).join(',');
  const isCount = (x) => Number.isInteger(x) && x >= 0 && x < 1e6;

  /**
   * Ván lưu hỏng, khác phiên bản hoặc bị sửa thì trả null (app chia ván mới). Kiểm tra cả: bộ mặt quân phải đúng bộ đã chia
   * theo seed (xáo chỉ hoán vị), lịch sử khớp với các quân đã gỡ, mỗi cặp trong lịch sử ghép được.
   */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { mode, seed, date, faces, gone, history, moves, hints, shuffles } = raw;
    if (MODES.indexOf(mode) < 0) return null;
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) return null;
    if (mode === 'daily' ? !isDateKey(date) || seed !== dailySeed(date) : date !== null) return null;
    if (!isCount(moves) || !isCount(hints) || !isCount(shuffles)) return null;
    const L = layoutOf(mode);
    const n = L.n;
    const validFaces = (f) => Array.isArray(f) && f.length === n && f.every(isFace);
    if (!validFaces(faces) || !Array.isArray(gone) || gone.length !== n || !gone.every((x) => x === 0 || x === 1)) return null;
    if (!Array.isArray(history) || history.length > n + shuffles) return null;
    let dealt;
    try {
      dealt = deal(L.key, seed).faces;
    } catch (e) {
      return null;
    }
    const bag = sortedKey(dealt);
    if (sortedKey(faces) !== bag) return null;
    const used = new Array(n).fill(0);
    let pairs = 0;
    let shuf = 0;
    for (const h of history) {
      if (Array.isArray(h)) {
        if (h.length !== 2 || !h.every((i) => Number.isInteger(i) && i >= 0 && i < n) || h[0] === h[1]) return null;
        if (used[h[0]] || used[h[1]] || !canMatch(faces[h[0]], faces[h[1]])) return null;
        used[h[0]] = used[h[1]] = 1;
        pairs++;
      } else if (h && typeof h === 'object' && validFaces(h.s) && sortedKey(h.s) === bag) {
        shuf++;
      } else {
        return null;
      }
    }
    if (!gone.every((x, i) => x === used[i]) || pairs > moves || shuf > shuffles) return null;
    return {
      mode,
      seed,
      date: mode === 'daily' ? date : null,
      faces: faces.slice(),
      gone: gone.slice(),
      history: history.map((h) => (Array.isArray(h) ? h.slice() : { s: h.s.slice() })),
      moves,
      hints,
      shuffles,
    };
  }

  const api = {
    VERSION,
    MODES,
    FACES,
    FLOWER,
    SEASON,
    LAYOUTS,
    layoutOf,
    buildLayout,
    freeIn,
    matchClass,
    canMatch,
    faceInfo,
    mulberry32,
    hashString,
    removalOrder,
    deal,
    dateKey,
    dailySeed,
    dayNumber,
    newGame,
    isFree,
    freeTiles,
    remaining,
    isWon,
    progress,
    availablePairs,
    hasMoves,
    isStuck,
    match,
    canUndo,
    undo,
    solve,
    hint,
    shuffle,
    toJSON,
    fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
