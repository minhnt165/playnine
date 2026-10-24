/* =====================================================================
 * Cầu Nối - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật Hashiwokakero: đảo có số; nối đảo bằng cầu thẳng ngang / dọc, mỗi cặp tối đa 2 cầu,
 *   cầu không cắt nhau, số cầu ở mỗi đảo bằng số của đảo, mọi đảo liên thông.
 *   - Đảo: [hàng, cột, số]; cạnh = cặp đảo gần nhất theo hàng / cột (chỉ những cặp này nối được)
 *   - Ván là đối tượng bất biến: mỗi nước trả ván mới (cùng chung `net` đã tính sẵn)
 *   - Sinh đề theo seed (mulberry32): mọc đảo dần từ một đảo, rồi giữ đề khi solver đếm đúng 1 nghiệm
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /** Mode = cỡ bàn; số đảo chọn ngẫu nhiên trong khoảng `islands`. */
  const MODES = {
    s: { size: 7, islands: [10, 13] },
    m: { size: 10, islands: [20, 25] },
    l: { size: 13, islands: [32, 40] },
  };

  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // trên, phải, dưới, trái

  /* ---------------- PRNG ---------------- */

  /** mulberry32: r() → [0, 1), r.int(n) → 0..n-1. */
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

  /* ---------------- Mạng cạnh ---------------- */

  /**
   * Từ vị trí đảo dựng: edges [a, b, ngang?] (a ở trên / trái b), nb[i][hướng] = cạnh (-1 nếu không có),
   * byIsland[i] = các cạnh của đảo i, cross[e] = các cạnh cắt e.
   */
  function buildNet(size, islands) {
    const at = new Int16Array(size * size).fill(-1);
    islands.forEach(([r, c], i) => { at[r * size + c] = i; });
    const edges = [];
    const nb = islands.map(() => [-1, -1, -1, -1]);
    islands.forEach(([r, c], i) => {
      [1, 2].forEach((d) => {
        const [dr, dc] = DIRS[d];
        for (let k = 1; r + dr * k < size && c + dc * k < size; k++) {
          const j = at[(r + dr * k) * size + c + dc * k];
          if (j < 0) continue;
          nb[i][d] = edges.length;
          nb[j][(d + 2) % 4] = edges.length;
          edges.push([i, j, d === 1]);
          break;
        }
      });
    });
    const cross = edges.map(() => []);
    edges.forEach(([a, b, horiz], h) => {
      if (!horiz) return;
      const row = islands[a][0];
      const c1 = islands[a][1];
      const c2 = islands[b][1];
      edges.forEach(([x, y, hz], v) => {
        if (hz) return;
        const col = islands[x][1];
        if (col > c1 && col < c2 && islands[x][0] < row && islands[y][0] > row) {
          cross[h].push(v);
          cross[v].push(h);
        }
      });
    });
    const byIsland = nb.map((a) => a.filter((e) => e >= 0));
    return { size, at, edges, nb, cross, byIsland };
  }

  /** Gộp nhóm (union-find) theo các cạnh thỏa `use(e)`; trả mảng nhóm của từng đảo và số nhóm. */
  function groups(net, n, use) {
    const p = Array.from({ length: n }, (x, i) => i);
    const find = (x) => {
      while (p[x] !== x) {
        p[x] = p[p[x]];
        x = p[x];
      }
      return x;
    };
    net.edges.forEach(([a, b], e) => {
      if (!use(e)) return;
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) p[ra] = rb;
    });
    const id = new Array(n);
    let k = 0;
    const map = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!map.has(r)) map.set(r, k++);
      id[i] = map.get(r);
    }
    return { id, count: k };
  }

  /* ---------------- Solver đếm nghiệm ---------------- */

  /**
   * Đếm nghiệm (dừng khi đủ `limit`). Mỗi cạnh có khoảng [lo, hi] trong 0..2; suy luận:
   *   - tổng ở mỗi đảo: lo ≥ số − (tổng hi các cạnh khác), hi ≤ số − (tổng lo các cạnh khác)
   *   - cạnh đã chắc có cầu thì các cạnh cắt nó phải bằng 0
   *   - liên thông: mạng cạnh còn khả dĩ phải nối hết đảo; nhóm đã chắc nối mà không còn lối ra là chết;
   *     nhóm chỉ còn đúng một lối ra thì lối đó phải có cầu
   * Rồi rẽ nhánh ở cạnh chưa chốt của đảo có ít cạnh chưa chốt nhất.
   */
  function solveNet(net, nums, limit) {
    const N = nums.length;
    const M = net.edges.length;
    const { edges, cross, byIsland } = net;
    let count = 0;
    let first = null;

    const lo0 = new Int8Array(M);
    const hi0 = new Int8Array(M);
    edges.forEach(([a, b], e) => {
      let h = Math.min(2, nums[a], nums[b]);
      // Hai đảo 1–1 hoặc cầu đôi giữa hai đảo 2–2 sẽ tự khép thành nhóm riêng
      if (N > 2 && nums[a] === 1 && nums[b] === 1) h = 0;
      if (N > 2 && nums[a] === 2 && nums[b] === 2) h = Math.min(h, 1);
      hi0[e] = h;
    });

    function propagate(lo, hi) {
      for (;;) {
        let changed = false;
        // Cầu cắt nhau
        for (let e = 0; e < M; e++) {
          if (!lo[e]) continue;
          const cs = cross[e];
          for (let k = 0; k < cs.length; k++) {
            const c = cs[k];
            if (lo[c]) return false;
            if (hi[c]) {
              hi[c] = 0;
              changed = true;
            }
          }
        }
        // Tổng ở mỗi đảo
        for (let i = 0; i < N; i++) {
          const es = byIsland[i];
          const n = nums[i];
          let sl = 0;
          let sh = 0;
          for (let k = 0; k < es.length; k++) {
            sl += lo[es[k]];
            sh += hi[es[k]];
          }
          if (sl > n || sh < n) return false;
          if (sl === sh) continue;
          for (let k = 0; k < es.length; k++) {
            const e = es[k];
            const nl = Math.max(lo[e], n - (sh - hi[e]));
            const nh = Math.min(hi[e], n - (sl - lo[e]));
            if (nl > nh) return false;
            if (nl !== lo[e] || nh !== hi[e]) {
              sl += nl - lo[e];
              sh += nh - hi[e];
              lo[e] = nl;
              hi[e] = nh;
              changed = true;
            }
          }
        }
        if (changed) continue;
        // Liên thông
        if (groups(net, N, (e) => hi[e] > 0).count > 1) return false;
        const g = groups(net, N, (e) => lo[e] > 0);
        if (g.count === 1) return true;
        const exits = new Array(g.count).fill(0);
        const lastExit = new Array(g.count).fill(-1);
        for (let e = 0; e < M; e++) {
          if (!hi[e]) continue;
          const ga = g.id[edges[e][0]];
          const gb = g.id[edges[e][1]];
          if (ga === gb) continue;
          exits[ga]++;
          exits[gb]++;
          lastExit[ga] = e;
          lastExit[gb] = e;
        }
        for (let k = 0; k < g.count; k++) {
          if (!exits[k]) return false;
          if (exits[k] === 1 && !lo[lastExit[k]]) {
            lo[lastExit[k]] = 1;
            changed = true;
          }
        }
        if (!changed) return true;
      }
    }

    function pick(lo, hi) {
      let best = -1;
      let bestU = 99;
      for (let i = 0; i < N; i++) {
        const es = byIsland[i];
        let u = 0;
        let cand = -1;
        for (let k = 0; k < es.length; k++) {
          if (lo[es[k]] < hi[es[k]]) {
            u++;
            if (cand < 0) cand = es[k];
          }
        }
        if (u && u < bestU) {
          bestU = u;
          best = cand;
          if (u === 1) break;
        }
      }
      return best;
    }

    function rec(lo, hi) {
      if (count >= limit || !propagate(lo, hi)) return;
      const e = pick(lo, hi);
      if (e < 0) {
        if (groups(net, N, (x) => lo[x] > 0).count !== 1) return;
        count++;
        if (!first) first = Array.from(lo);
        return;
      }
      for (let v = hi[e]; v >= lo[e] && count < limit; v--) {
        const l2 = lo.slice();
        const h2 = hi.slice();
        l2[e] = v;
        h2[e] = v;
        rec(l2, h2);
      }
    }

    if (N === 0) return { count: 0, solution: null };
    rec(lo0, hi0);
    return { count, solution: first };
  }

  /** Đếm nghiệm của đề (size, đảo [r, c, n]) tới `limit` (mặc định 2). */
  function solve(size, islands, limit) {
    return solveNet(buildNet(size, islands), islands.map((x) => x[2]), limit || 2);
  }

  /* ---------------- Sinh đề ---------------- */

  const P_DOUBLE = 0.35; // xác suất cầu đôi
  const P_LOOP = 0.45; // xác suất nối thêm tới đảo đã có (tạo vòng) khi hướng đó gặp đảo

  /**
   * Một lần thử: đặt đảo đầu ngẫu nhiên, rồi lặp: chọn đảo + hướng chưa có cầu, đặt đảo mới cách ≥ 2 ô
   * (không đè cầu, không kề đảo khác) và nối bằng 1–2 cầu; thỉnh thoảng nối thẳng tới đảo đã có trên đường.
   * Số của đảo = tổng cầu, nên cấu hình cầu là một lời giải (liên thông vì mọc từ một đảo).
   */
  function grow(size, target, r) {
    const at = new Int16Array(size * size).fill(-1);
    const occ = new Uint8Array(size * size); // ô có cầu đi qua
    const pos = [];
    const used = [];
    const links = [];
    const near = (rr, cc) => DIRS.some(([dr, dc]) => {
      const y = rr + dr;
      const x = cc + dc;
      return y >= 0 && x >= 0 && y < size && x < size && at[y * size + x] >= 0;
    });
    const place = (rr, cc) => {
      at[rr * size + cc] = pos.length;
      pos.push([rr, cc]);
      used.push([0, 0, 0, 0]);
      return pos.length - 1;
    };
    const link = (a, b, d, k) => {
      const [dr, dc] = DIRS[d];
      for (let j = 1; j < k; j++) occ[(pos[a][0] + dr * j) * size + pos[a][1] + dc * j] = 1;
      used[a][d] = 1;
      used[b][(d + 2) % 4] = 1;
      links.push([a, b, r() < P_DOUBLE ? 2 : 1]);
    };
    place(r.int(size), r.int(size));
    for (let tries = 0; pos.length < target && tries < target * 40; tries++) {
      const a = r.int(pos.length);
      const d = r.int(4);
      if (used[a][d]) continue;
      const [dr, dc] = DIRS[d];
      const cand = [];
      let hit = -1;
      let k = 1;
      for (; ; k++) {
        const rr = pos[a][0] + dr * k;
        const cc = pos[a][1] + dc * k;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) break;
        const idx = rr * size + cc;
        if (at[idx] >= 0) {
          hit = at[idx];
          break;
        }
        if (occ[idx]) break;
        if (k >= 2 && !near(rr, cc)) cand.push(k);
      }
      if (hit >= 0 && k >= 2 && !used[hit][(d + 2) % 4] && r() < P_LOOP) {
        link(a, hit, d, k);
        continue;
      }
      if (!cand.length) continue;
      // Ưu tiên cầu ngắn để đảo dày, đều khắp bàn
      const kk = cand[Math.min(r.int(cand.length), r.int(cand.length))];
      const b = place(pos[a][0] + dr * kk, pos[a][1] + dc * kk);
      link(a, b, d, kk);
    }
    const nums = pos.map(() => 0);
    links.forEach(([a, b, n]) => {
      nums[a] += n;
      nums[b] += n;
    });
    // Sắp đảo theo hàng rồi cột cho thứ tự cạnh ổn định
    return pos.map(([rr, cc], i) => [rr, cc, nums[i]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  }

  /** Sinh đề có lời giải duy nhất cho mode theo seed: { islands, sol }. */
  function generate(mode, seed) {
    const conf = MODES[mode];
    const r = rng(seed);
    for (let attempt = 0; attempt < 5000; attempt++) {
      const target = conf.islands[0] + r.int(conf.islands[1] - conf.islands[0] + 1);
      const islands = grow(conf.size, target, r);
      if (islands.length < conf.islands[0]) continue;
      const res = solve(conf.size, islands, 2);
      if (res.count === 1) return { islands, sol: res.solution };
    }
    throw new Error('Cầu Nối: không sinh được đề');
  }

  /* ---------------- Ván ---------------- */

  function make(mode, size, islands, sol, net) {
    const n = net || buildNet(size, islands);
    return {
      mode,
      size,
      islands,
      sol,
      br: new Array(n.edges.length).fill(0),
      undo: [],
      redo: [],
      moves: 0,
      assisted: false,
      net: n,
    };
  }

  function newGame(mode, seed) {
    const { islands, sol } = generate(mode, seed);
    return make(mode, MODES[mode].size, islands, sol);
  }

  /** Ván từ đề cho sẵn (test, ván dựng tay): lời giải = nghiệm đầu tiên, vô nghiệm thì null. */
  function fromPuzzle(mode, size, islands) {
    const net = buildNet(size, islands);
    const res = solveNet(net, islands.map((x) => x[2]), 1);
    return make(mode, size, islands, res.solution, net);
  }

  const with_ = (g, patch) => Object.assign({}, g, patch);

  /** Áp một nhóm thay đổi [[cạnh, từ, tới]…] thành một nước (xóa nhánh làm lại). */
  function applyChanges(g, changes, extra) {
    const br = g.br.slice();
    changes.forEach(([e, , to]) => { br[e] = to; });
    return with_(g, Object.assign({ br, undo: g.undo.concat([changes]), redo: [], moves: g.moves + 1 }, extra || {}));
  }

  /** Các cạnh đang có cầu cắt cạnh e (khác rỗng thì không đặt cầu lên e được). */
  const blockedBy = (g, e) => g.net.cross[e].filter((c) => g.br[c] > 0);

  /** Thêm cầu trên cạnh e theo vòng 0 → 1 → 2 → 0; cắt cầu khác thì trả lại chính ván cũ. */
  function cycle(g, e) {
    if (e < 0 || e >= g.br.length) return g;
    const to = (g.br[e] + 1) % 3;
    if (to > 0 && blockedBy(g, e).length) return g;
    return applyChanges(g, [[e, g.br[e], to]]);
  }

  /** Cạnh nối hai đảo a, b (-1 nếu hai đảo không thấy nhau). */
  function edgeBetween(g, a, b) {
    const d = g.net.nb[a].findIndex((e) => e >= 0 && (g.net.edges[e][0] === b || g.net.edges[e][1] === b));
    return d < 0 ? -1 : g.net.nb[a][d];
  }

  /** Thêm cầu giữa hai đảo (chạm / kéo từ đảo này sang đảo kia). */
  const link = (g, a, b) => {
    const e = edgeBetween(g, a, b);
    return e < 0 ? g : cycle(g, e);
  };

  /** Đảo bên kia của cạnh e tính từ đảo i. */
  const other = (g, e, i) => (g.net.edges[e][0] === i ? g.net.edges[e][1] : g.net.edges[e][0]);

  function undo(g) {
    if (!g.undo.length) return g;
    const changes = g.undo[g.undo.length - 1];
    const br = g.br.slice();
    for (let k = changes.length - 1; k >= 0; k--) br[changes[k][0]] = changes[k][1];
    return with_(g, { br, undo: g.undo.slice(0, -1), redo: g.redo.concat([changes]), moves: g.moves + 1 });
  }

  function redo(g) {
    if (!g.redo.length) return g;
    const changes = g.redo[g.redo.length - 1];
    const br = g.br.slice();
    changes.forEach(([e, , to]) => { br[e] = to; });
    return with_(g, { br, undo: g.undo.concat([changes]), redo: g.redo.slice(0, -1), moves: g.moves + 1 });
  }

  /** Gỡ mọi cầu trong một nước (hoàn tác được). */
  function clear(g) {
    const changes = [];
    g.br.forEach((k, e) => { if (k) changes.push([e, k, 0]); });
    return changes.length ? applyChanges(g, changes) : g;
  }

  /**
   * Gợi ý: đưa một cạnh về đúng lời giải. Ưu tiên gỡ cầu thừa / sai (cũng là thứ đang chặn cầu đúng),
   * rồi tới cạnh thiếu cầu ở đảo gần xong nhất. Trả { game, edge } hoặc null nếu đã đúng hết / không có lời giải.
   */
  function hint(g) {
    if (!g.sol) return null;
    let e = g.br.findIndex((k, i) => k > g.sol[i]);
    if (e < 0) {
      let best = 99;
      g.br.forEach((k, i) => {
        if (k >= g.sol[i] || blockedBy(g, i).length) return;
        const [a, b] = g.net.edges[i];
        const left = Math.min(g.islands[a][2] - count(g, a), g.islands[b][2] - count(g, b));
        if (left < best) {
          best = left;
          e = i;
        }
      });
    }
    if (e < 0) return null;
    return { game: applyChanges(g, [[e, g.br[e], g.sol[e]]], { assisted: true }), edge: e };
  }

  /* ---------------- Trạng thái ---------------- */

  function count(g, i) {
    let s = 0;
    g.net.byIsland[i].forEach((e) => { s += g.br[e]; });
    return s;
  }
  const isComplete = (g, i) => count(g, i) === g.islands[i][2];
  const doneCount = (g) => g.islands.reduce((s, x, i) => s + (isComplete(g, i) ? 1 : 0), 0);

  /**
   * Lỗi để tô đỏ: over = đảo thừa cầu; closed = đảo thuộc nhóm đã nối xong (mọi đảo đủ cầu)
   * nhưng tách khỏi phần còn lại, nên không thể thành lời giải.
   */
  function errors(g) {
    const N = g.islands.length;
    const over = [];
    for (let i = 0; i < N; i++) if (count(g, i) > g.islands[i][2]) over.push(i);
    const closed = [];
    const gr = groups(g.net, N, (e) => g.br[e] > 0);
    if (gr.count > 1) {
      const full = new Array(gr.count).fill(true);
      for (let i = 0; i < N; i++) if (!isComplete(g, i)) full[gr.id[i]] = false;
      for (let i = 0; i < N; i++) if (full[gr.id[i]]) closed.push(i);
    }
    return { over, closed };
  }

  function isWon(g) {
    const N = g.islands.length;
    for (let i = 0; i < N; i++) if (!isComplete(g, i)) return false;
    return groups(g.net, N, (e) => g.br[e] > 0).count === 1;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    size: g.size,
    islands: g.islands.map((x) => x.slice()),
    sol: g.sol ? g.sol.slice() : null,
    br: g.br.slice(),
    undo: g.undo,
    redo: g.redo,
    moves: g.moves,
    assisted: g.assisted,
  });

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /** Mảng số cầu hợp lệ: đúng độ dài, 0..2, không có cặp cạnh cắt nhau cùng có cầu. */
  function validBridges(arr, net) {
    if (!Array.isArray(arr) || arr.length !== net.edges.length || !arr.every((x) => isInt(x, 0, 2))) return false;
    return arr.every((k, e) => !k || net.cross[e].every((c) => !arr[c]));
  }

  function validHistory(list, M) {
    return Array.isArray(list) && list.length <= 100000 && list.every((ch) =>
      Array.isArray(ch) && ch.length > 0 && ch.length <= M &&
      ch.every((x) => Array.isArray(x) && x.length === 3 && isInt(x[0], 0, M - 1) && isInt(x[1], 0, 2) && isInt(x[2], 0, 2)));
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const conf = MODES[raw.mode];
    if (!conf || !Object.prototype.hasOwnProperty.call(MODES, raw.mode) || raw.size !== conf.size) return null;
    const size = conf.size;
    const isl = raw.islands;
    if (!Array.isArray(isl) || isl.length < 2 || isl.length > size * size) return null;
    const seen = new Set();
    for (const x of isl) {
      if (!Array.isArray(x) || x.length !== 3 || !isInt(x[0], 0, size - 1) || !isInt(x[1], 0, size - 1) || !isInt(x[2], 1, 8)) return null;
      const key = x[0] * size + x[1];
      if (seen.has(key)) return null;
      seen.add(key);
    }
    for (const [r, c] of isl) {
      if (seen.has((r + 1) * size + c) || (c + 1 < size && seen.has(r * size + c + 1))) return null;
    }
    const islands = isl.map((x) => x.slice());
    const net = buildNet(size, islands);
    // Lời giải phải hợp luật: đúng số ở mọi đảo, không cắt nhau, liên thông
    if (!validBridges(raw.sol, net)) return null;
    const sol = raw.sol.slice();
    const probe = { islands, net, br: sol };
    if (!isWon(probe)) return null;
    if (!validBridges(raw.br, net)) return null;
    const M = net.edges.length;
    if (!validHistory(raw.undo, M) || !validHistory(raw.redo, M)) return null;
    if (!isInt(raw.moves, 0, Number.MAX_SAFE_INTEGER) || typeof raw.assisted !== 'boolean') return null;
    const g = make(raw.mode, size, islands, sol, net);
    g.br = raw.br.slice();
    g.undo = raw.undo.map((ch) => ch.map((x) => x.slice()));
    g.redo = raw.redo.map((ch) => ch.map((x) => x.slice()));
    g.moves = raw.moves;
    g.assisted = raw.assisted;
    return g;
  }

  const api = {
    VERSION, MODES, DIRS, rng, buildNet, solve, grow, generate, newGame, fromPuzzle,
    cycle, link, edgeBetween, other, blockedBy, undo, redo, clear, hint,
    count, isComplete, doneCount, errors, isWon, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
