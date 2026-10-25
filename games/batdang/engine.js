/* =====================================================================
 * Bất Đẳng - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật (Futoshiki): lưới N×N, điền 1..N sao cho mỗi hàng / cột không trùng (hình vuông Latin);
 *   dấu < > (dọc ∧ ∨) giữa hai ô kề phải thỏa; vài ô cho sẵn số.
 *   - Dấu lưu theo cặp ô: hs[r*(N-1)+c] giữa (r,c) và (r,c+1); vs[r*N+c] giữa (r,c) và (r+1,c);
 *     0 = không dấu, LT = ô trước (trái / trên) nhỏ hơn, GT = ô trước lớn hơn
 *   - Sinh đề theo seed: hình vuông Latin ngẫu nhiên → đặt mọi dấu + mọi số → bớt dần từng manh mối
 *     (thứ tự ngẫu nhiên) khi đề vẫn giải được bằng suy luận (nên nghiệm duy nhất); test đếm nghiệm tới 2
 *   - Ván: số đã điền, ghi chú (bitmask), hoàn tác / làm lại không giới hạn, gợi ý; toJSON / fromJSON
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const LT = 1;
  const GT = 2;

  /*
   * Mode = cỡ + mức suy luận. level 1: loại trừ hàng / cột, số chỉ còn một chỗ, kẹp theo dấu (cả chuỗi dấu);
   * level 2 thêm cặp ẩn / cặp lộ trong hàng / cột, và đề phải CẦN tới mức 2 (không giải xong chỉ bằng mức 1).
   * keep: số ô cho sẵn giữ nguyên (đề Futoshiki luôn có vài số); extra: số dấu trả lại sau khi bớt tối đa
   * (đề dễ thở hơn); maxGivens: trần số ô cho sẵn (vượt thì sinh lại; dùng để tính min_time_ms).
   */
  const MODES = {
    5: { n: 5, level: 1, keep: 1, extra: 3, maxGivens: 4 },
    6: { n: 6, level: 1, keep: 2, extra: 0, maxGivens: 8 },
    7: { n: 7, level: 2, keep: 2, extra: 0, maxGivens: 9 },
    daily: { n: 6, level: 1, keep: 2, extra: 1, maxGivens: 8 },
  };
  const MODE_KEYS = ['5', '6', '7', 'daily'];

  /* ---------------- Số ngẫu nhiên có seed (mulberry32) ---------------- */

  /** Chuỗi (ví dụ ngày) → số 32 bit; số thì giữ nguyên phần 32 bit. */
  function hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function makeRng(seed) {
    let a = hashSeed(seed);
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

  /** Seed của đề hằng ngày: chỉ theo ngày (mọi người chơi cùng một đề). */
  const dailySeed = (date) => hashSeed('batdang:' + date);

  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }

  /* ---------------- Bitmask ---------------- */

  const bit = (v) => 1 << (v - 1);
  const popcount = (m) => {
    let c = 0;
    while (m) {
      m &= m - 1;
      c++;
    }
    return c;
  };
  /** Giá trị nhỏ nhất / lớn nhất trong bitmask (1..n). */
  const lowVal = (m) => 32 - Math.clz32(m & -m);
  const highVal = (m) => 32 - Math.clz32(m);

  /* ---------------- Cấu trúc lưới (nhớ đệm theo cỡ) ---------------- */

  const SHAPES = {};
  /** Hàng / cột (danh sách ô) và ô cùng hàng / cột của mỗi ô. */
  function shape(n) {
    if (SHAPES[n]) return SHAPES[n];
    const units = [];
    for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
    const peers = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const p = [];
      for (let x = 0; x < n; x++) {
        if (x !== c) p.push(r * n + x);
        if (x !== r) p.push(x * n + c);
      }
      peers.push(p);
    }
    SHAPES[n] = { units, peers };
    return SHAPES[n];
  }

  /** Hai ô của dấu ngang k / dấu dọc k. */
  const hCells = (n, k) => {
    const r = Math.floor(k / (n - 1));
    const c = k % (n - 1);
    return [r * n + c, r * n + c + 1];
  };
  const vCells = (n, k) => [k, k + n];

  /** Danh sách quan hệ [ô nhỏ, ô lớn] từ các dấu của đề. */
  function relations(p) {
    const n = p.n;
    const out = [];
    p.hs.forEach((s, k) => {
      if (!s) return;
      const [a, b] = hCells(n, k);
      out.push(s === LT ? [a, b] : [b, a]);
    });
    p.vs.forEach((s, k) => {
      if (!s) return;
      const [a, b] = vCells(n, k);
      out.push(s === LT ? [a, b] : [b, a]);
    });
    return out;
  }

  /** Dấu đúng theo hai giá trị (a trước, b sau). */
  const relOf = (a, b) => (a < b ? LT : GT);

  /** Mọi dấu ngang / dọc khớp một lưới đã điền kín. */
  function signsOf(n, sol) {
    const hs = [];
    const vs = [];
    for (let k = 0; k < n * (n - 1); k++) {
      const [a, b] = hCells(n, k);
      hs.push(relOf(sol[a], sol[b]));
    }
    for (let k = 0; k < (n - 1) * n; k++) vs.push(relOf(sol[k], sol[k + n]));
    return { hs, vs };
  }

  /* ---------------- Lan truyền ràng buộc ---------------- */

  /**
   * Lan truyền tới điểm dừng trên bảng ứng viên `cand` (Int32Array, sửa tại chỗ). Trả về false khi mâu thuẫn.
   * Mỗi vòng áp lần lượt các luật; `round` (tùy chọn) ghi vòng đầu tiên mà ô chỉ còn một ứng viên.
   *   - level 1: ô đã chốt loại số đó khỏi hàng / cột; số chỉ còn một chỗ trong hàng / cột; kẹp theo dấu
   *     (ô nhỏ < số lớn nhất của ô lớn, ô lớn > số nhỏ nhất của ô nhỏ; lặp lại nên lan dọc cả chuỗi dấu)
   *   - level 2: thêm cặp lộ (hai ô cùng chỉ còn cùng hai số) và cặp ẩn (hai số chỉ còn ở cùng hai ô)
   */
  function propagate(n, cand, rels, level, round) {
    const { units, peers } = shape(n);
    const N = n * n;
    const done = new Uint8Array(N); // ô đã dùng để loại trừ
    let r = 0;
    for (;;) {
      r++;
      let changed = false;
      // Ô đã chốt: loại khỏi ô cùng hàng / cột
      for (let i = 0; i < N; i++) {
        const m = cand[i];
        if (m === 0) return false;
        if (done[i] || (m & (m - 1))) continue;
        done[i] = 1;
        const ps = peers[i];
        for (let k = 0; k < ps.length; k++) {
          const j = ps[k];
          if (cand[j] & m) {
            cand[j] &= ~m;
            if (!cand[j]) return false;
            changed = true;
          }
        }
      }
      // Số chỉ còn một chỗ trong hàng / cột
      for (let u = 0; u < units.length; u++) {
        const cells = units[u];
        for (let v = 1; v <= n; v++) {
          const b = 1 << (v - 1);
          let where = -1;
          let cnt = 0;
          for (let k = 0; k < n; k++) {
            if (cand[cells[k]] & b) {
              cnt++;
              where = cells[k];
            }
          }
          if (cnt === 0) return false;
          if (cnt === 1 && cand[where] !== b) {
            cand[where] = b;
            changed = true;
          }
        }
      }
      // Kẹp theo dấu
      for (let k = 0; k < rels.length; k++) {
        const a = rels[k][0];
        const b = rels[k][1];
        const hiB = highVal(cand[b]);
        const capA = cand[a] & ((1 << (hiB - 1)) - 1);
        if (capA !== cand[a]) {
          if (!capA) return false;
          cand[a] = capA;
          changed = true;
        }
        const loA = lowVal(cand[a]);
        const capB = cand[b] & ~((1 << loA) - 1);
        if (capB !== cand[b]) {
          if (!capB) return false;
          cand[b] = capB;
          changed = true;
        }
      }
      if (level >= 2 && !changed) changed = pairs(n, cand, units);
      if (round) for (let i = 0; i < N; i++) if (round[i] === Infinity && cand[i] && !(cand[i] & (cand[i] - 1))) round[i] = r;
      if (!changed) return true;
    }
  }

  /** Cặp lộ và cặp ẩn trong từng hàng / cột (mức 2). Trả về true nếu loại được gì. */
  function pairs(n, cand, units) {
    let changed = false;
    for (let u = 0; u < units.length; u++) {
      const cells = units[u];
      // Cặp lộ
      for (let x = 0; x < n; x++) {
        const m = cand[cells[x]];
        if (popcount(m) !== 2) continue;
        for (let y = x + 1; y < n; y++) {
          if (cand[cells[y]] !== m) continue;
          for (let z = 0; z < n; z++) {
            if (z === x || z === y) continue;
            const c = cells[z];
            if (cand[c] & m) {
              cand[c] &= ~m;
              changed = true;
            }
          }
        }
      }
      // Cặp ẩn: chỗ của từng số trong hàng / cột (bitmask theo vị trí)
      const pos = [];
      for (let v = 1; v <= n; v++) {
        let p = 0;
        for (let k = 0; k < n; k++) if (cand[cells[k]] & bit(v)) p |= 1 << k;
        pos.push(p);
      }
      for (let v = 0; v < n; v++) {
        if (popcount(pos[v]) !== 2) continue;
        for (let w = v + 1; w < n; w++) {
          if (pos[w] !== pos[v]) continue;
          const keep = bit(v + 1) | bit(w + 1);
          for (let k = 0; k < n; k++) {
            if (!(pos[v] & (1 << k))) continue;
            const c = cells[k];
            if (cand[c] & ~keep) {
              cand[c] &= keep;
              changed = true;
            }
          }
        }
      }
    }
    return changed;
  }

  /** Bảng ứng viên ban đầu: ô cho sẵn (và ô trong `vals` nếu có) chỉ còn đúng số đó. */
  function initCand(p, vals) {
    const n = p.n;
    const full = (1 << n) - 1;
    const cand = new Int32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const v = p.givens[i] || (vals ? vals[i] : 0);
      cand[i] = v ? bit(v) : full;
    }
    return cand;
  }

  /**
   * Suy luận không đoán từ số cho sẵn (+ `vals`): { ok, cand, round } với round[i] = vòng lan truyền đầu tiên
   * mà ô i chỉ còn một khả năng (0 nếu đã có số từ đầu, Infinity nếu không suy ra được).
   */
  function deduce(p, level, vals) {
    const n = p.n;
    const cand = initCand(p, vals);
    const round = new Array(n * n).fill(Infinity);
    for (let i = 0; i < n * n; i++) if (p.givens[i] || (vals && vals[i])) round[i] = 0;
    const ok = propagate(n, cand, relations(p), level || 1, round);
    return { ok, cand: Array.from(cand), round };
  }

  /** Đề giải được hoàn toàn bằng suy luận mức `level` (kéo theo nghiệm duy nhất). */
  function logicSolvable(p, level) {
    const cand = initCand(p);
    if (!propagate(p.n, cand, relations(p), level || 1, null)) return false;
    for (let i = 0; i < cand.length; i++) if (cand[i] & (cand[i] - 1)) return false;
    return true;
  }

  /* ---------------- Bộ giải đếm nghiệm ---------------- */

  /**
   * Đếm nghiệm (dừng khi đủ `limit`, mặc định 2): lan truyền mức 1 rồi rẽ nhánh ở ô ít ứng viên nhất.
   * Trả về { count, solutions } (tối đa `limit` lời giải, mỗi lời giải là mảng n*n giá trị).
   */
  function solve(p, limit) {
    const n = p.n;
    const max = limit || 2;
    const rels = relations(p);
    const solutions = [];
    let count = 0;
    (function dfs(cand) {
      if (!propagate(n, cand, rels, 1, null)) return;
      let best = -1;
      let bestC = 99;
      for (let i = 0; i < cand.length; i++) {
        const c = popcount(cand[i]);
        if (c > 1 && c < bestC) {
          bestC = c;
          best = i;
        }
      }
      if (best < 0) {
        count++;
        if (solutions.length < max) solutions.push(Array.from(cand, lowVal));
        return;
      }
      let m = cand[best];
      while (m && count < max) {
        const b = m & -m;
        m &= m - 1;
        const next = cand.slice();
        next[best] = b;
        dfs(next);
      }
    })(initCand(p));
    return { count, solutions };
  }

  const countSolutions = (p, limit) => solve(p, limit || 2).count;

  /* ---------------- Sinh đề ---------------- */

  /** Hình vuông Latin ngẫu nhiên n×n (điền từng ô, thử số theo thứ tự ngẫu nhiên, quay lui khi kẹt). */
  function latinSquare(n, r) {
    const grid = new Array(n * n).fill(0);
    const rowM = new Int32Array(n);
    const colM = new Int32Array(n);
    const digits = Array.from({ length: n }, (_, i) => i + 1);
    (function fill(i) {
      if (i === n * n) return true;
      const row = Math.floor(i / n);
      const col = i % n;
      for (const v of shuffle(digits, r)) {
        const b = bit(v);
        if ((rowM[row] | colM[col]) & b) continue;
        rowM[row] |= b;
        colM[col] |= b;
        grid[i] = v;
        if (fill(i + 1)) return true;
        rowM[row] ^= b;
        colM[col] ^= b;
      }
      grid[i] = 0;
      return false;
    })(0);
    return grid;
  }

  const clueCount = (p) => ({
    givens: p.givens.filter(Boolean).length,
    signs: p.hs.filter(Boolean).length + p.vs.filter(Boolean).length,
  });

  /**
   * Sinh đề mode `mode` theo `seed` (tất định): { mode, n, seed, givens, hs, vs, sol }.
   * 1. Hình vuông Latin ngẫu nhiên; đặt đủ mọi số và mọi dấu.
   * 2. Bớt số cho sẵn (trừ `keep` ô, thứ tự ngẫu nhiên), rồi bớt dấu; mỗi lần chỉ giữ thay đổi nếu đề vẫn giải
   *    được bằng suy luận mức của mode (suy luận chỉ loại khả năng sai, nên giải kín được = nghiệm duy nhất).
   * 3. Mode dễ trả lại `extra` dấu ngẫu nhiên đã bớt (thêm manh mối không làm mất tính duy nhất).
   * 4. Kiểm độ khó: quá `maxGivens` số cho sẵn, hoặc mức 2 mà mức 1 đã giải xong, thì đục lại từ đầu.
   */
  function generate(mode, seed) {
    const spec = MODES[mode];
    if (!spec) throw new Error('mode');
    const n = spec.n;
    const s = hashSeed(seed);
    const r = makeRng((s ^ hashSeed('mode:' + mode)) >>> 0);
    for (let attempt = 0; ; attempt++) {
      const p = carve(spec, r);
      // Mức khó cần cặp ẩn / cặp lộ: đề giải xong chỉ bằng mức 1 thì sinh lại (tối đa vài lần)
      if (spec.level >= 2 && attempt < 7 && logicSolvable(p, 1)) continue;
      if (clueCount(p).givens > spec.maxGivens) continue;
      return { mode, n, seed: s, givens: p.givens, hs: p.hs, vs: p.vs, sol: p.sol };
    }
  }

  /** Một lần đục đề: lời giải mới, giữ `keep` số cho sẵn, bớt số rồi bớt dấu, trả lại `extra` dấu. */
  function carve(spec, r) {
    const n = spec.n;
    const sol = latinSquare(n, r);
    const full = signsOf(n, sol);
    const p = { n, givens: sol.slice(), hs: full.hs.slice(), vs: full.vs.slice(), sol };
    const tryRemove = (arr, k) => {
      const keep = arr[k];
      arr[k] = 0;
      if (logicSolvable(p, spec.level)) return true;
      arr[k] = keep;
      return false;
    };
    shuffle(Array.from({ length: n * n }, (_, i) => i), r).slice(spec.keep).forEach((i) => tryRemove(p.givens, i));
    const signs = shuffle(p.hs.map((_, k) => ['hs', k]).concat(p.vs.map((_, k) => ['vs', k])), r);
    const removed = signs.filter(([arr, k]) => tryRemove(p[arr], k));
    shuffle(removed, r).slice(0, spec.extra).forEach(([arr, k]) => { p[arr][k] = full[arr][k]; });
    return p;
  }

  /* ---------------- Ván chơi ---------------- */

  /** Ván mới: mode thường theo `seed`, đề hằng ngày theo `date` (YYYY-MM-DD). */
  function newGame(opts) {
    const mode = String(opts.mode);
    const date = mode === 'daily' ? opts.date : null;
    const p = generate(mode, mode === 'daily' ? dailySeed(date) : opts.seed);
    return fromPuzzle(Object.assign(p, { date }));
  }

  /** Ván từ một đề { mode, n, givens, hs, vs, sol, seed?, date? }; ô cho sẵn điền sẵn số. */
  function fromPuzzle(p) {
    const n = p.n;
    return {
      mode: p.mode,
      n,
      seed: (p.seed || 0) >>> 0,
      date: p.date || null,
      givens: p.givens.slice(),
      hs: p.hs.slice(),
      vs: p.vs.slice(),
      sol: p.sol.slice(),
      vals: p.givens.slice(),
      notes: new Array(n * n).fill(0),
      moves: 0,
      hints: 0,
      undo: [],
      redo: [],
    };
  }

  /** Áp một bản vá [[ô, số cũ, ghi chú cũ, số mới, ghi chú mới], ...]; `forward` = chiều mới. */
  function applyPatch(g, patch, forward) {
    const vals = g.vals.slice();
    const notes = g.notes.slice();
    patch.forEach((x) => {
      vals[x[0]] = forward ? x[3] : x[1];
      notes[x[0]] = forward ? x[4] : x[2];
    });
    return Object.assign({}, g, { vals, notes });
  }

  /** Ghi một nước: áp bản vá, đẩy vào lịch sử hoàn tác, xóa nhánh làm lại. */
  function commit(g, patch, extra) {
    if (!patch.length) return g;
    const next = applyPatch(g, patch, true);
    next.undo = g.undo.concat([patch]);
    next.redo = [];
    next.moves = g.moves + 1;
    return Object.assign(next, extra || {});
  }

  const editable = (g, i) => Number.isInteger(i) && i >= 0 && i < g.n * g.n && !g.givens[i];
  const validDigit = (g, v) => Number.isInteger(v) && v >= 1 && v <= g.n;

  /** Bản vá đặt số v vào ô i: xóa ghi chú của ô; `autoNotes` (mặc định bật) bỏ ghi chú số v ở ô cùng hàng / cột. */
  function placePatch(g, i, v, autoNotes) {
    const patch = [[i, g.vals[i], g.notes[i], v, 0]];
    if (v && autoNotes !== false) {
      shape(g.n).peers[i].forEach((j) => {
        if (g.notes[j] & bit(v)) patch.push([j, g.vals[j], g.notes[j], g.vals[j], g.notes[j] & ~bit(v)]);
      });
    }
    return patch;
  }

  /**
   * Điền số v vào ô i (opts.autoNotes = false: không tự xóa ghi chú ô cùng hàng / cột).
   * Điền lại đúng số đang có thì xóa ô. Ô cho sẵn / số ngoài 1..n / đề đã giải: không đổi gì.
   */
  function setValue(g, i, v, opts) {
    if (isSolved(g) || !editable(g, i) || !validDigit(g, v)) return g;
    if (g.vals[i] === v) return commit(g, [[i, v, g.notes[i], 0, g.notes[i]]]);
    return commit(g, placePatch(g, i, v, opts && opts.autoNotes));
  }

  /** Bật / tắt ghi chú số v ở ô trống i. */
  function toggleNote(g, i, v) {
    if (isSolved(g) || !editable(g, i) || !validDigit(g, v) || g.vals[i]) return g;
    return commit(g, [[i, 0, g.notes[i], 0, g.notes[i] ^ bit(v)]]);
  }

  /** Xóa số và ghi chú của ô i. */
  function erase(g, i) {
    if (isSolved(g) || !editable(g, i) || (!g.vals[i] && !g.notes[i])) return g;
    return commit(g, [[i, g.vals[i], g.notes[i], 0, 0]]);
  }

  /**
   * Gợi ý (ván sẽ tính là có trợ giúp):
   *   1. còn ô sai so với lời giải thì sửa ô đó (ưu tiên ô đang chọn `sel`): kind 'fix'
   *   2. không thì điền một ô trống suy ra được sớm nhất từ những gì đã có trên bàn (ưu tiên `sel`): kind 'deduce'
   * Trả về { game, cell, kind }, hoặc null khi đề đã giải. Số lần gợi ý không giảm khi hoàn tác.
   */
  function hint(g, sel, opts) {
    if (isSolved(g)) return null;
    const N = g.n * g.n;
    const wrong = (i) => !g.givens[i] && g.vals[i] && g.vals[i] !== g.sol[i];
    let cell = -1;
    let kind = 'fix';
    if (editable(g, sel) && wrong(sel)) cell = sel;
    for (let i = 0; i < N && cell < 0; i++) if (wrong(i)) cell = i;
    if (cell < 0) {
      kind = 'deduce';
      const spec = MODES[g.mode] || { level: 1 };
      const d = deduce(g, spec.level, g.vals);
      let best = Infinity;
      for (let i = 0; i < N; i++) {
        if (g.vals[i]) continue;
        const rd = d.ok ? d.round[i] : Infinity;
        if (cell < 0 || rd < best) {
          best = rd;
          cell = i;
        }
      }
      if (cell < 0) return null;
      // Ô đang chọn cũng suy ra được ở cùng vòng sớm nhất thì gợi ý luôn ô đó
      if (editable(g, sel) && !g.vals[sel] && d.ok && d.round[sel] === best) cell = sel;
    }
    const next = commit(g, placePatch(g, cell, g.sol[cell], opts && opts.autoNotes), { hints: g.hints + 1 });
    return { game: next, cell, kind };
  }

  const canUndo = (g) => g.undo.length > 0 && !isSolved(g);
  const canRedo = (g) => g.redo.length > 0 && !isSolved(g);

  function undo(g) {
    if (!canUndo(g)) return g;
    const patch = g.undo[g.undo.length - 1];
    const next = applyPatch(g, patch, false);
    next.undo = g.undo.slice(0, -1);
    next.redo = g.redo.concat([patch]);
    return next;
  }

  function redo(g) {
    if (!canRedo(g)) return g;
    const patch = g.redo[g.redo.length - 1];
    const next = applyPatch(g, patch, true);
    next.redo = g.redo.slice(0, -1);
    next.undo = g.undo.concat([patch]);
    return next;
  }

  /**
   * Vi phạm luật trên bàn (theo luật, không so với lời giải):
   * { dup: ô trùng số với ô khác cùng hàng / cột, badH / badV: dấu mà hai ô đã điền nhưng sai quan hệ }.
   */
  function check(g) {
    const n = g.n;
    const { peers } = shape(n);
    const dup = [];
    for (let i = 0; i < n * n; i++) {
      const v = g.vals[i];
      if (v && peers[i].some((j) => g.vals[j] === v)) dup.push(i);
    }
    // Hai số bằng nhau thì sai cả < lẫn >
    const bad = (s, a, b) => s && g.vals[a] && g.vals[b] && (s === LT ? g.vals[a] >= g.vals[b] : g.vals[a] <= g.vals[b]);
    const badH = [];
    const badV = [];
    g.hs.forEach((s, k) => {
      const [a, b] = hCells(n, k);
      if (bad(s, a, b)) badH.push(k);
    });
    g.vs.forEach((s, k) => {
      if (bad(s, k, k + n)) badV.push(k);
    });
    return { dup, badH, badV };
  }

  /** Thắng: đủ ô, không trùng hàng / cột, mọi dấu đúng (đề có nghiệm duy nhất nên đây là lời giải). */
  function isSolved(g) {
    if (g.vals.some((v) => !v)) return false;
    const st = check(g);
    return !st.dup.length && !st.badH.length && !st.badV.length;
  }

  const filledCount = (g) => g.vals.filter(Boolean).length;
  const emptyCount = (g) => g.vals.length - filledCount(g);
  /** Tiến độ cho thẻ "chơi tiếp": phần ô trống ban đầu đã điền. */
  function progress(g) {
    const open = g.givens.filter((v) => !v).length;
    return open ? (filledCount(g) - (g.givens.length - open)) / open : 1;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      v: VERSION,
      mode: g.mode,
      n: g.n,
      seed: g.seed,
      date: g.date,
      givens: g.givens.slice(),
      hs: g.hs.slice(),
      vs: g.vs.slice(),
      sol: g.sol.slice(),
      vals: g.vals.slice(),
      notes: g.notes.slice(),
      moves: g.moves,
      hints: g.hints,
      undo: g.undo.map((p) => p.map((x) => x.slice())),
      redo: g.redo.map((p) => p.map((x) => x.slice())),
    };
  }

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isArr = (a, len) => Array.isArray(a) && a.length === len;

  function isLatin(n, sq) {
    const full = (1 << n) - 1;
    for (let x = 0; x < n; x++) {
      let rm = 0;
      let cm = 0;
      for (let y = 0; y < n; y++) {
        rm |= bit(sq[x * n + y]);
        cm |= bit(sq[y * n + x]);
      }
      if (rm !== full || cm !== full) return false;
    }
    return true;
  }

  /** Đề hợp lệ: lời giải là hình vuông Latin, số cho sẵn và dấu khớp lời giải, nghiệm duy nhất. */
  function validPuzzle(raw, n) {
    const N = n * n;
    if (!isArr(raw.sol, N) || !raw.sol.every((v) => isInt(v, 1, n)) || !isLatin(n, raw.sol)) return false;
    if (!isArr(raw.givens, N) || !raw.givens.every((v, i) => v === 0 || v === raw.sol[i])) return false;
    if (!isArr(raw.hs, n * (n - 1)) || !isArr(raw.vs, (n - 1) * n)) return false;
    const okSign = (s, a, b) => s === 0 || ((s === LT || s === GT) && s === relOf(raw.sol[a], raw.sol[b]));
    if (!raw.hs.every((s, k) => okSign(s, hCells(n, k)[0], hCells(n, k)[1]))) return false;
    if (!raw.vs.every((s, k) => okSign(s, k, k + n))) return false;
    return countSolutions({ n, givens: raw.givens, hs: raw.hs, vs: raw.vs }) === 1;
  }

  function validPatchList(list, n) {
    const m = (1 << n) - 1;
    if (!Array.isArray(list) || list.length > 100000) return false;
    return list.every((p) => Array.isArray(p) && p.length > 0 && p.every((x) =>
      isArr(x, 5) && isInt(x[0], 0, n * n - 1) && isInt(x[1], 0, n) && isInt(x[3], 0, n) && isInt(x[2], 0, m) && isInt(x[4], 0, m)));
  }

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia đề mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (MODE_KEYS.indexOf(raw.mode) < 0 || raw.n !== MODES[raw.mode].n) return null;
    const n = raw.n;
    if (raw.mode === 'daily' ? !isDate(raw.date) : raw.date !== null) return null;
    if (!isInt(raw.seed, 0, 4294967295) || !isInt(raw.moves, 0, 1e7) || !isInt(raw.hints, 0, 1e5)) return null;
    if (!validPuzzle(raw, n)) return null;
    const m = (1 << n) - 1;
    if (!isArr(raw.vals, n * n) || !raw.vals.every((v, i) => isInt(v, 0, n) && (!raw.givens[i] || v === raw.givens[i]))) return null;
    if (!isArr(raw.notes, n * n) || !raw.notes.every((v) => isInt(v, 0, m))) return null;
    if (!validPatchList(raw.undo, n) || !validPatchList(raw.redo, n)) return null;
    return {
      mode: raw.mode,
      n,
      seed: raw.seed,
      date: raw.date,
      givens: raw.givens.slice(),
      hs: raw.hs.slice(),
      vs: raw.vs.slice(),
      sol: raw.sol.slice(),
      vals: raw.vals.slice(),
      notes: raw.notes.slice(),
      moves: raw.moves,
      hints: raw.hints,
      undo: raw.undo.map((p) => p.map((x) => x.slice())),
      redo: raw.redo.map((p) => p.map((x) => x.slice())),
    };
  }

  const api = {
    VERSION, LT, GT, MODES, MODE_KEYS,
    hashSeed, makeRng, dailySeed, isDate, bit,
    hCells, vCells, signsOf, relations,
    deduce, logicSolvable, solve, countSolutions, latinSquare, clueCount, generate,
    newGame, fromPuzzle, setValue, toggleNote, erase, hint, undo, redo, canUndo, canRedo,
    check, isSolved, filledCount, emptyCount, progress,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
