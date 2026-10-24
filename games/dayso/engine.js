/* =====================================================================
 * Dãy Số - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới n x n, có thể có ô bị khoét (không dùng). N = số ô dùng được; điền 1..N vào các ô
 *     sao cho mỗi số k + 1 nằm kề số k theo 8 hướng (ngang, dọc, chéo). Số 1 và N luôn cho sẵn.
 *   - Sinh đề: khoét vài ô → tìm đường đi qua mọi ô còn lại (Warnsdorff, rồi xáo bằng "backbite")
 *     → đánh số theo đường → bỏ dần số cho sẵn theo thứ tự ngẫu nhiên, chỉ giữ việc bỏ nếu
 *     suy luận (không đoán) vẫn giải kín bàn, nên đề có đúng một lời giải và giải được bằng suy luận
 *   - Bộ giải đếm nghiệm (dừng ở `limit`): mỗi số k giữ tập ô còn có thể (mặt nạ bit theo hàng);
 *     lan truyền "k phải kề k - 1 và k + 1", số chỉ còn một ô, ô chỉ còn một số; rồi quay lui ở số
 *     ít khả năng nhất. Test dùng nó để chứng minh đề sinh ra có đúng một nghiệm.
 *   - Hàm thuần: nhận ván cũ, trả ván mới (hoàn tác / làm lại lưu dạng vá); toJSON / fromJSON để lưu ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /*
   * Ba cỡ (mode). n: cạnh lưới; holes: số ô khoét [ít nhất, nhiều nhất];
   * empty: số ô người chơi phải điền (đề nào của cỡ đó cũng đúng bằng số này).
   */
  const MODES = {
    s: { n: 6, holes: [0, 3], empty: 18 },
    m: { n: 8, holes: [2, 6], empty: 36 },
    l: { n: 10, holes: [3, 9], empty: 56 },
  };
  const MODE_KEYS = Object.keys(MODES);
  const isMode = (m) => MODE_KEYS.indexOf(m) >= 0;
  const MAX_NOTES = 4; // ghi chú tối đa mỗi ô

  /* ---------------- PRNG ---------------- */

  /** Băm chuỗi / số thành seed 32 bit (FNV-1a cho chuỗi). */
  function toSeed(x) {
    if (typeof x === 'number' && isFinite(x)) return x >>> 0;
    const s = String(x);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** PRNG mulberry32: cùng seed ra cùng dãy số trong [0, 1); r.int(n) → 0..n-1. */
  function rng(seed) {
    let a = toSeed(seed);
    const r = function () {
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
    for (let i = arr.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      const x = arr[i];
      arr[i] = arr[j];
      arr[j] = x;
    }
    return arr;
  }

  /* ---------------- Lưới ---------------- */

  /** Hai ô kề nhau theo 8 hướng (khác nhau). */
  function adjacent(n, a, b) {
    if (a === b || a < 0 || b < 0) return false;
    return Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;
  }

  /** Các ô kề ô i (8 hướng) trong lưới n x n. */
  function neighbors(n, i) {
    const r = Math.floor(i / n);
    const c = i % n;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
      }
    }
    return out;
  }

  const NB = {}; // bảng ô kề theo cỡ lưới (tính một lần)
  function nbTable(n) {
    if (!NB[n]) {
      NB[n] = [];
      for (let i = 0; i < n * n; i++) NB[n].push(neighbors(n, i));
    }
    return NB[n];
  }

  /**
   * Đường đi qua mọi ô mở (open[i] = 1) đúng một lần, bước theo 8 hướng.
   * Warnsdorff (luôn đi tới ô còn ít lối ra nhất, hòa thì bốc ngẫu nhiên), rồi xáo bằng nhiều bước
   * "backbite" (nối đầu đường vào một ô kề trên đường và đảo đoạn sau) cho hình dạng bớt đều.
   * Trả mảng chỉ số ô theo thứ tự, hoặc null nếu không tìm được.
   */
  function makePath(n, open, r) {
    const nb = nbTable(n);
    const cells = [];
    for (let i = 0; i < n * n; i++) if (open[i]) cells.push(i);
    const total = cells.length;
    if (!total) return null;
    let path = null;
    for (let tries = 0; tries < 12 && !path; tries++) {
      const used = new Uint8Array(n * n);
      const freeDeg = (i) => nb[i].reduce((s, j) => s + (open[j] && !used[j] ? 1 : 0), 0);
      let cur = cells[r.int(total)];
      const p = [cur];
      used[cur] = 1;
      while (p.length < total) {
        let best = Infinity;
        let pick = [];
        nb[cur].forEach((j) => {
          if (!open[j] || used[j]) return;
          const d = freeDeg(j);
          if (d < best) {
            best = d;
            pick = [j];
          } else if (d === best) pick.push(j);
        });
        if (!pick.length) break;
        cur = pick[r.int(pick.length)];
        used[cur] = 1;
        p.push(cur);
      }
      if (p.length === total) path = p;
    }
    if (!path) return null;
    // Backbite: chọn một đầu, nối nó với ô kề ngẫu nhiên trên đường, đảo phần đường sau ô đó
    const pos = new Int32Array(n * n).fill(-1);
    path.forEach((c, k) => { pos[c] = k; });
    const steps = total * 12;
    for (let s = 0; s < steps; s++) {
      if (r() < 0.5) {
        path.reverse();
        path.forEach((c, k) => { pos[c] = k; });
      }
      const end = path[total - 1];
      const opts = nb[end].filter((j) => open[j] && pos[j] !== total - 2);
      if (!opts.length) continue;
      const j = pos[opts[r.int(opts.length)]];
      // path[0..j] + đảo(path[j+1..total-1])
      for (let a = j + 1, b = total - 1; a < b; a++, b--) {
        const x = path[a];
        path[a] = path[b];
        path[b] = x;
      }
      for (let k = j + 1; k < total; k++) pos[path[k]] = k;
    }
    return path;
  }

  /* ---------------- Bộ giải ---------------- */
  // Tập ô của một số k: n mặt nạ hàng (bit c của hàng r = ô r * n + c), nằm ở cand[k * n + r].

  const POPC = (x) => {
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  };
  const lowBit = (x) => 31 - Math.clz32(x & -x);

  /**
   * Dựng bài toán: clues[i] = số cho sẵn ở ô i (0 = trống). Trả null nếu đầu vào sai luật hiển nhiên
   * (số ngoài 1..N, trùng số, số nằm ở ô khoét).
   */
  function setup(n, open, clues) {
    let N = 0;
    for (let i = 0; i < n * n; i++) if (open[i]) N++;
    const rowOpen = new Int32Array(n);
    for (let i = 0; i < n * n; i++) if (open[i]) rowOpen[Math.floor(i / n)] |= 1 << (i % n);
    const at = new Int32Array(N + 2).fill(-1);
    for (let i = 0; i < n * n; i++) {
      const v = clues[i] | 0;
      if (!v) continue;
      if (!open[i] || v < 1 || v > N || at[v] >= 0) return null;
      at[v] = i;
    }
    const cand = new Int32Array((N + 2) * n);
    const givenRows = new Int32Array(n);
    for (let k = 1; k <= N; k++) if (at[k] >= 0) givenRows[Math.floor(at[k] / n)] |= 1 << (at[k] % n);
    for (let k = 1; k <= N; k++) {
      for (let r = 0; r < n; r++) {
        if (at[k] >= 0) cand[k * n + r] = Math.floor(at[k] / n) === r ? 1 << (at[k] % n) : 0;
        else cand[k * n + r] = rowOpen[r] & ~givenRows[r];
      }
    }
    return { n, N, rowOpen, cand };
  }

  /**
   * Lan truyền tới điểm dừng. Trả false nếu mâu thuẫn. Sửa `cand` tại chỗ.
   *   1. Quét xuôi / ngược: ô của k phải kề một ô còn có thể của k - 1 và của k + 1
   *   2. Số chỉ còn một ô: gạch ô đó khỏi mọi số khác
   *   3. Ô mở chỉ còn đúng một số có thể đặt vào: số đó phải nằm ở ô này
   */
  function propagate(P, cand) {
    const { n, N, rowOpen } = P;
    const full = (1 << n) - 1;
    const D = new Int32Array(n);
    const taken = new Int32Array(n);
    const once = new Int32Array(n);
    const twice = new Int32Array(n);
    /** D = các ô kề (không gồm chính nó) của tập ô của số k. */
    const dilate = (k) => {
      const b = k * n;
      for (let r = 0; r < n; r++) {
        const s = cand[b + r];
        let d = ((s << 1) | (s >>> 1)) & full;
        if (r > 0) {
          const u = cand[b + r - 1];
          d |= u | (u << 1) | (u >>> 1);
        }
        if (r < n - 1) {
          const w = cand[b + r + 1];
          d |= w | (w << 1) | (w >>> 1);
        }
        D[r] = d & rowOpen[r];
      }
    };
    /** cand[k] &= D; trả -1 nếu rỗng, 1 nếu đổi, 0 nếu không đổi. */
    const restrict = (k) => {
      const b = k * n;
      let any = 0;
      let ch = 0;
      for (let r = 0; r < n; r++) {
        const v = cand[b + r] & D[r];
        if (v !== cand[b + r]) {
          cand[b + r] = v;
          ch = 1;
        }
        any |= v;
      }
      return any ? ch : -1;
    };
    const count = (k) => {
      let cnt = 0;
      for (let r = 0; r < n && cnt < 2; r++) cnt += POPC(cand[k * n + r]);
      return cnt;
    };
    for (;;) {
      let changed = false;
      for (let k = 2; k <= N; k++) {
        dilate(k - 1);
        const x = restrict(k);
        if (x < 0) return false;
        if (x) changed = true;
      }
      for (let k = N - 1; k >= 1; k--) {
        dilate(k + 1);
        const x = restrict(k);
        if (x < 0) return false;
        if (x) changed = true;
      }
      // Số chỉ còn một ô: ô đó không dành cho số nào khác
      taken.fill(0);
      for (let k = 1; k <= N; k++) {
        if (count(k) !== 1) continue;
        for (let r = 0; r < n; r++) {
          if (taken[r] & cand[k * n + r]) return false; // hai số cùng chỉ còn một ô, trùng nhau
          taken[r] |= cand[k * n + r];
        }
      }
      for (let k = 1; k <= N; k++) {
        if (count(k) === 1) continue;
        const b = k * n;
        let any = 0;
        for (let r = 0; r < n; r++) {
          const v = cand[b + r] & ~taken[r];
          if (v !== cand[b + r]) {
            cand[b + r] = v;
            changed = true;
          }
          any |= v;
        }
        if (!any) return false;
      }
      // Ô chỉ còn một số có thể vào (mọi ô mở phải có số)
      once.fill(0);
      twice.fill(0);
      for (let k = 1; k <= N; k++) {
        const b = k * n;
        for (let r = 0; r < n; r++) {
          twice[r] |= once[r] & cand[b + r];
          once[r] |= cand[b + r];
        }
      }
      for (let r = 0; r < n; r++) {
        if (rowOpen[r] & ~once[r]) return false; // có ô không số nào vào được
        once[r] &= ~twice[r];
      }
      for (let k = 1; k <= N; k++) {
        const b = k * n;
        let hit = -1;
        let hits = 0;
        let cnt = 0;
        for (let r = 0; r < n; r++) {
          const own = cand[b + r] & once[r];
          cnt += POPC(cand[b + r]);
          if (own) {
            hits += POPC(own);
            hit = r * n + lowBit(own);
          }
        }
        if (hits > 1) return false; // một số phải nằm ở hai ô
        if (hits === 1 && cnt > 1) {
          for (let r = 0; r < n; r++) cand[b + r] = Math.floor(hit / n) === r ? 1 << (hit % n) : 0;
          changed = true;
        }
      }
      if (!changed) return true;
    }
  }

  /** Lời giải từ tập ô đã chốt (mỗi số đúng một ô); null nếu chưa chốt hết. */
  function readSolution(P, cand) {
    const { n, N } = P;
    const sol = new Array(n * n).fill(0);
    for (let k = 1; k <= N; k++) {
      let cell = -1;
      for (let r = 0; r < n; r++) {
        const v = cand[k * n + r];
        if (!v) continue;
        if (cell >= 0 || POPC(v) !== 1) return null;
        cell = r * n + lowBit(v);
      }
      if (cell < 0) return null;
      sol[cell] = k;
    }
    return sol;
  }

  /**
   * Chỉ suy luận (không đoán): 'solved' kèm lời giải nếu lan truyền chốt được mọi số,
   * 'stuck' nếu còn số chưa chốt, 'none' nếu mâu thuẫn.
   */
  function deduce(n, open, clues) {
    const P = setup(n, open, clues);
    if (!P) return { status: 'none' };
    if (!propagate(P, P.cand)) return { status: 'none' };
    const sol = readSolution(P, P.cand);
    return sol ? { status: 'solved', sol } : { status: 'stuck' };
  }

  /**
   * Đếm nghiệm (dừng khi đạt `limit`, mặc định 2): lan truyền rồi quay lui ở số còn ít ô nhất.
   * Trả { count, sol, guesses }: sol = nghiệm đầu tiên tìm thấy, guesses = số lần phải đoán.
   */
  function solve(n, open, clues, limit) {
    const lim = limit || 2;
    const P = setup(n, open, clues);
    const out = { count: 0, sol: null, guesses: 0 };
    if (!P) return out;
    const { N } = P;
    (function dfs(cand) {
      if (out.count >= lim || !propagate(P, cand)) return;
      let bestK = -1;
      let best = Infinity;
      for (let k = 1; k <= N; k++) {
        let cnt = 0;
        for (let r = 0; r < n; r++) cnt += POPC(cand[k * n + r]);
        if (cnt > 1 && cnt < best) {
          best = cnt;
          bestK = k;
        }
      }
      if (bestK < 0) {
        out.count++;
        if (!out.sol) out.sol = readSolution(P, cand);
        return;
      }
      out.guesses++;
      for (let r = 0; r < n && out.count < lim; r++) {
        let v = cand[bestK * n + r];
        while (v && out.count < lim) {
          const b = v & -v;
          v ^= b;
          const next = cand.slice();
          for (let rr = 0; rr < n; rr++) next[bestK * n + rr] = rr === r ? b : 0;
          dfs(next);
        }
      }
    })(P.cand);
    return out;
  }

  /* ---------------- Sinh đề ---------------- */

  /** Lời giải có đúng luật không: 1..N mỗi số một lần trên các ô mở, k kề k + 1. */
  function validSolution(n, open, sol) {
    let N = 0;
    for (let i = 0; i < n * n; i++) {
      if (open[i]) N++;
      else if (sol[i]) return false;
    }
    if (N < 2) return false;
    const pos = new Array(N + 1).fill(-1);
    for (let i = 0; i < n * n; i++) {
      if (!open[i]) continue;
      const v = sol[i];
      if (!Number.isInteger(v) || v < 1 || v > N || pos[v] >= 0) return false;
      pos[v] = i;
    }
    for (let k = 1; k < N; k++) if (!adjacent(n, pos[k], pos[k + 1])) return false;
    return true;
  }

  /** Các ô mở có liền một khối (theo 8 hướng) không. */
  function connected(n, open) {
    const nb = nbTable(n);
    let start = -1;
    let total = 0;
    for (let i = 0; i < n * n; i++) {
      if (open[i]) {
        total++;
        if (start < 0) start = i;
      }
    }
    if (start < 0) return false;
    const seen = new Uint8Array(n * n);
    const stack = [start];
    seen[start] = 1;
    let cnt = 0;
    while (stack.length) {
      const i = stack.pop();
      cnt++;
      nb[i].forEach((j) => {
        if (open[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      });
    }
    return cnt === total;
  }

  /**
   * Sinh một đề theo cỡ và seed (tất định). Trả { n, open, sol, given }:
   * open[i] = 1 nếu ô dùng được; sol[i] = số của lời giải; given[i] = 1 nếu số cho sẵn.
   */
  function generate(mode, seed) {
    const cfg = MODES[mode];
    const n = cfg.n;
    const r = rng(seed);
    for (let attempt = 0; attempt < 200; attempt++) {
      // 1. Khoét ô
      const open = new Array(n * n).fill(1);
      const h = cfg.holes[0] + r.int(cfg.holes[1] - cfg.holes[0] + 1);
      shuffle(Array.from({ length: n * n }, (_, i) => i), r).slice(0, h).forEach((i) => { open[i] = 0; });
      if (!connected(n, open)) continue;
      // 2. Đường đi qua mọi ô mở
      const path = makePath(n, open, r);
      if (!path) continue;
      const N = path.length;
      const sol = new Array(n * n).fill(0);
      path.forEach((c, k) => { sol[c] = k + 1; });
      // 3. Bỏ dần số cho sẵn (giữ 1 và N) khi suy luận vẫn giải kín bàn; thử vài thứ tự bỏ
      for (let pass = 0; pass < 3; pass++) {
        const clues = sol.slice();
        const order = shuffle(path.slice(1, N - 1), r);
        let empty = 0;
        for (let j = 0; j < order.length && empty < cfg.empty; j++) {
          const c = order[j];
          clues[c] = 0;
          if (deduce(n, open, clues).status === 'solved') empty++;
          else clues[c] = sol[c];
        }
        if (empty === cfg.empty) return { n, open, sol, given: clues.map((v) => (v ? 1 : 0)) };
      }
    }
    throw new Error('dayso: không sinh được đề');
  }

  /* ---------------- Ván chơi ---------------- */

  /** Gắn N (số ô mở). */
  function build(base) {
    return Object.assign({}, base, { N: base.open.reduce((a, b) => a + b, 0) });
  }

  /** Ván mới: { mode, seed } → ván chỉ có các số cho sẵn. */
  function newGame(opts) {
    const mode = opts && isMode(opts.mode) ? opts.mode : 's';
    const seed = opts && opts.seed != null ? toSeed(opts.seed) : (Math.random() * 4294967296) >>> 0;
    const p = generate(mode, seed);
    return build({
      mode,
      seed,
      n: p.n,
      open: p.open,
      sol: p.sol,
      given: p.given,
      vals: p.sol.map((v, i) => (p.given[i] ? v : 0)),
      notes: p.sol.map(() => []),
      moves: 0,
      hints: 0,
      undo: [],
      redo: [],
    });
  }

  const isOpen = (g, i) => Number.isInteger(i) && i >= 0 && i < g.n * g.n && g.open[i] === 1;
  /** Ô người chơi được điền (mở, không cho sẵn). */
  const isFree = (g, i) => isOpen(g, i) && !g.given[i];
  const emptyCount = (g) => g.vals.reduce((a, v, i) => a + (g.open[i] && !v ? 1 : 0), 0);
  /** Số ô người chơi phải điền (cố định theo đề). */
  const freeCount = (g) => g.given.reduce((a, v, i) => a + (g.open[i] && !v ? 1 : 0), 0);

  /** pos[k] = ô đang chứa số k (-1 nếu chưa có trên bàn). */
  function positions(g) {
    const pos = new Array(g.N + 2).fill(-1);
    g.vals.forEach((v, i) => { if (v) pos[v] = i; });
    return pos;
  }
  /** Số k có phải số cho sẵn không. */
  function isGivenNumber(g, k) {
    for (let i = 0; i < g.n * g.n; i++) if (g.given[i] && g.sol[i] === k) return true;
    return false;
  }
  /** Số nhỏ nhất chưa có trên bàn lớn hơn k (quay vòng về 1); -1 nếu bàn đã đủ số. */
  function nextMissing(g, k) {
    const pos = positions(g);
    for (let d = 1; d <= g.N; d++) {
      const x = (((((k || 0) + d - 1) % g.N) + g.N) % g.N) + 1;
      if (pos[x] < 0) return x;
    }
    return -1;
  }
  /** Số lớn nhất chưa có trên bàn nhỏ hơn k (quay vòng về N); -1 nếu bàn đã đủ số. */
  function prevMissing(g, k) {
    const pos = positions(g);
    for (let d = 1; d <= g.N; d++) {
      const x = (((((k || 1) - d - 1) % g.N) + g.N) % g.N) + 1;
      if (pos[x] < 0) return x;
    }
    return -1;
  }

  const sameNotes = (a, b) => a.length === b.length && a.every((x, j) => x === b[j]);

  /** Chốt một nước: so với ván cũ, lưu bản ngược vào undo, xóa redo. Không đổi gì thì trả ván cũ. */
  function commit(g, vals, notes) {
    const back = [];
    for (let i = 0; i < g.n * g.n; i++) {
      if (vals[i] !== g.vals[i] || !sameNotes(notes[i], g.notes[i])) back.push([i, g.vals[i], g.notes[i].slice()]);
    }
    if (!back.length) return g;
    return Object.assign({}, g, { vals, notes, moves: g.moves + 1, undo: g.undo.concat([back]), redo: [] });
  }

  /**
   * Đặt nhiều số trong một nước (một lần hoàn tác): list = [[ô, số], ...]; số 0 = xóa ô.
   * Ô cho sẵn và số cho sẵn không đổi được (bỏ qua). Số đã nằm ở ô khác thì dời sang ô mới.
   * Đặt số thì xóa ghi chú của ô đó và gạch số đó khỏi ghi chú các ô khác.
   */
  function place(g, list) {
    if (isSolved(g)) return g;
    const vals = g.vals.slice();
    const notes = g.notes.slice();
    list.forEach(([i, k]) => {
      if (!isFree(g, i) || !Number.isInteger(k) || k < 0 || k > g.N) return;
      if (k && isGivenNumber(g, k)) return;
      if (k) {
        const j = vals.indexOf(k);
        if (j >= 0 && j !== i) vals[j] = 0;
        notes.forEach((m, c) => { if (m.indexOf(k) >= 0) notes[c] = m.filter((x) => x !== k); });
        notes[i] = [];
      }
      vals[i] = k;
    });
    return commit(g, vals, notes);
  }
  const setValue = (g, i, k) => place(g, [[i, k]]);

  /** Xóa cả số và ghi chú của ô i. */
  function erase(g, i) {
    if (!isFree(g, i) || isSolved(g)) return g;
    const vals = g.vals.slice();
    const notes = g.notes.slice();
    vals[i] = 0;
    notes[i] = [];
    return commit(g, vals, notes);
  }

  /** Bật / tắt ghi chú số k ở ô trống i (tối đa MAX_NOTES số mỗi ô; đầy thì không đổi). */
  function toggleNote(g, i, k) {
    if (!isFree(g, i) || g.vals[i] || !Number.isInteger(k) || k < 1 || k > g.N || isSolved(g)) return g;
    const cur = g.notes[i];
    let next;
    if (cur.indexOf(k) >= 0) next = cur.filter((x) => x !== k);
    else if (cur.length >= MAX_NOTES || isGivenNumber(g, k)) return g;
    else next = cur.concat([k]).sort((a, b) => a - b);
    const notes = g.notes.slice();
    notes[i] = next;
    return commit(g, g.vals.slice(), notes);
  }

  /** Hoàn tác / làm lại: chuyển bản vá giữa hai ngăn xếp. Trả ván mới, kèm `last` = các ô vừa đổi. */
  function shift(g, from, to) {
    if (!g[from].length || isSolved(g)) return g;
    const patch = g[from][g[from].length - 1];
    const vals = g.vals.slice();
    const notes = g.notes.slice();
    const back = patch.map(([i]) => [i, g.vals[i], g.notes[i].slice()]);
    patch.forEach(([i, v, m]) => {
      vals[i] = v;
      notes[i] = m.slice();
    });
    const out = Object.assign({}, g, { vals, notes, moves: g.moves + 1 });
    out[from] = g[from].slice(0, -1);
    out[to] = g[to].concat([back]);
    out.last = patch.map(([i]) => i);
    return out;
  }
  const undo = (g) => shift(g, 'undo', 'redo');
  const redo = (g) => shift(g, 'redo', 'undo');

  /**
   * Ô nên gợi ý: nếu số `cur` chưa có trên bàn thì ô đúng của nó; không thì ô trống / sai đầu tiên.
   * -1 nếu bàn đã đúng hết.
   */
  function hintCell(g, cur) {
    if (Number.isInteger(cur) && cur >= 1 && cur <= g.N && positions(g)[cur] < 0) {
      const i = g.sol.indexOf(cur);
      if (i >= 0 && !g.given[i]) return i;
    }
    for (let i = 0; i < g.n * g.n; i++) if (isFree(g, i) && g.vals[i] !== g.sol[i]) return i;
    return -1;
  }

  /** Gợi ý: đặt đúng số của lời giải vào ô i (ván tính là có trợ giúp). */
  function hint(g, i) {
    if (!isFree(g, i) || g.vals[i] === g.sol[i]) return g;
    const next = setValue(g, i, g.sol[i]);
    return next === g ? g : Object.assign({}, next, { hints: g.hints + 1 });
  }

  /**
   * Trạng thái theo luật (không nhìn lời giải):
   *   links: các số k mà k và k + 1 đều có trên bàn và kề nhau (để vẽ đường nối);
   *   bad: ô người chơi điền số k mà k - 1 hoặc k + 1 đã có trên bàn nhưng không kề.
   */
  function check(g) {
    const pos = positions(g);
    const links = [];
    const bad = [];
    for (let k = 1; k < g.N; k++) if (pos[k] >= 0 && pos[k + 1] >= 0 && adjacent(g.n, pos[k], pos[k + 1])) links.push(k);
    for (let i = 0; i < g.n * g.n; i++) {
      const k = g.vals[i];
      if (!k || g.given[i]) continue;
      const a = k > 1 && pos[k - 1] >= 0 && !adjacent(g.n, i, pos[k - 1]);
      const b = k < g.N && pos[k + 1] >= 0 && !adjacent(g.n, i, pos[k + 1]);
      if (a || b) bad.push(i);
    }
    return { links, bad };
  }

  /** Thắng: mọi ô mở đã có số và mọi số k kề k + 1. */
  function isSolved(g) {
    for (let i = 0; i < g.n * g.n; i++) if (g.open[i] && !g.vals[i]) return false;
    const pos = positions(g);
    for (let k = 1; k < g.N; k++) if (pos[k] < 0 || !adjacent(g.n, pos[k], pos[k + 1])) return false;
    return true;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    seed: g.seed,
    n: g.n,
    open: g.open.slice(),
    sol: g.sol.slice(),
    given: g.given.slice(),
    vals: g.vals.slice(),
    notes: g.notes.map((m) => m.slice()),
    moves: g.moves,
    hints: g.hints,
    undo: g.undo,
    redo: g.redo,
  });

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /** Ghi chú của một ô: tối đa MAX_NOTES số trong 1..N, tăng dần. */
  function validNotes(m, N) {
    if (!Array.isArray(m) || m.length > MAX_NOTES) return false;
    for (let j = 0; j < m.length; j++) if (!isInt(m[j], 1, N) || (j && m[j] <= m[j - 1])) return false;
    return true;
  }

  function validPatchList(list, size, free, N) {
    return Array.isArray(list) && list.every((p) => Array.isArray(p) && p.length > 0 && p.every((e) =>
      Array.isArray(e) && e.length === 3 && isInt(e[0], 0, size - 1) && free[e[0]] && isInt(e[1], 0, N) && validNotes(e[2], N)));
  }

  /** Ván lưu hỏng, khác phiên bản hoặc lời giải sai luật thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !isMode(raw.mode)) return null;
    const n = MODES[raw.mode].n;
    const size = n * n;
    if (raw.n !== n || !isInt(raw.seed, 0, 4294967295) || !isInt(raw.moves, 0, 1e7) || !isInt(raw.hints, 0, 1e6)) return null;
    const arr = (a, lo, hi) => Array.isArray(a) && a.length === size && a.every((x) => isInt(x, lo, hi));
    if (!arr(raw.open, 0, 1) || !arr(raw.sol, 0, size) || !arr(raw.given, 0, 1) || !arr(raw.vals, 0, size)) return null;
    if (!Array.isArray(raw.notes) || raw.notes.length !== size) return null;
    if (!validSolution(n, raw.open, raw.sol)) return null;
    const N = raw.open.reduce((a, b) => a + b, 0);
    const seen = new Uint8Array(N + 1);
    const free = [];
    for (let i = 0; i < size; i++) {
      free.push(raw.open[i] && !raw.given[i] ? 1 : 0);
      if (!validNotes(raw.notes[i], N)) return null;
      if (!raw.open[i]) {
        if (raw.given[i] || raw.vals[i] || raw.notes[i].length) return null;
        continue;
      }
      const v = raw.vals[i];
      if (v > N) return null;
      if (raw.given[i] && v !== raw.sol[i]) return null;
      if (v) {
        if (seen[v]) return null;
        seen[v] = 1;
      }
    }
    // 1 và N luôn cho sẵn
    if (!raw.given[raw.sol.indexOf(1)] || !raw.given[raw.sol.indexOf(N)]) return null;
    if (!validPatchList(raw.undo, size, free, N) || !validPatchList(raw.redo, size, free, N)) return null;
    return build({
      mode: raw.mode,
      seed: raw.seed,
      n,
      open: raw.open.slice(),
      sol: raw.sol.slice(),
      given: raw.given.slice(),
      vals: raw.vals.slice(),
      notes: raw.notes.map((m) => m.slice()),
      moves: raw.moves,
      hints: raw.hints,
      undo: raw.undo.map((p) => p.map((e) => [e[0], e[1], e[2].slice()])),
      redo: raw.redo.map((p) => p.map((e) => [e[0], e[1], e[2].slice()])),
    });
  }

  const api = {
    VERSION,
    MODES,
    MODE_KEYS,
    MAX_NOTES,
    rng,
    toSeed,
    adjacent,
    neighbors,
    makePath,
    connected,
    validSolution,
    deduce,
    solve,
    generate,
    newGame,
    isOpen,
    isFree,
    emptyCount,
    freeCount,
    positions,
    isGivenNumber,
    nextMissing,
    prevMissing,
    place,
    setValue,
    erase,
    toggleNote,
    undo,
    redo,
    hintCell,
    hint,
    check,
    isSolved,
    toJSON,
    fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
