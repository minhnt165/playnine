/* =====================================================================
 * Tính 24 - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Một ván = một "bộ" 5 đề liên tiếp, tính tổng thời gian; mode 'easy' (đề nhiều lời giải) | 'hard' (ít lời giải / cần phân số)
 *   - Mỗi đề 4 số 1–13 nằm ở 4 ô; một bước: ô a (phép tính) ô b → kết quả vào ô b, ô a trống. Còn một ô bằng 24 là xong đề
 *   - Số là phân số tối giản [tử, mẫu] (mẫu > 0) nên 8 ÷ 3 = 8/3 giữ đúng giá trị, không sai số dấu phẩy động
 *   - Bộ giải: vét mọi cách ghép, đếm số biểu thức khác nhau (chuẩn hóa giao hoán / kết hợp) để phân loại độ khó,
 *     tìm các bước cho gợi ý; đề sinh theo seed (PRNG mulberry32, trạng thái lưu cùng ván để bỏ qua đề vẫn tất định)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const TARGET = 24;
  const SET_SIZE = 5; // số đề trong một bộ
  const MODES = ['easy', 'hard'];
  const OPS = ['+', '-', '*', '/'];
  const MIN_N = 1;
  const MAX_N = 13;
  const SKIP_MS = 30000; // phạt thời gian khi bỏ qua một đề (app cộng vào đồng hồ)

  /* ---------------- Phân số ---------------- */

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }
  /** Phân số tối giản [tử, mẫu], mẫu luôn dương. */
  function frac(n, d) {
    if (d === undefined) d = 1;
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    return [n / g + 0, d / g]; // + 0 đổi -0 thành 0
  }
  const isZero = (x) => x[0] === 0;
  const isInt = (x) => x[1] === 1;
  const eqNum = (x, n) => x[1] === 1 && x[0] === n;

  /** a op b; chia cho 0 trả null. */
  function calc(a, op, b) {
    if (op === '+') return frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
    if (op === '-') return frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
    if (op === '*') return frac(a[0] * b[0], a[1] * b[1]);
    if (op === '/') return isZero(b) ? null : frac(a[0] * b[1], a[1] * b[0]);
    return null;
  }

  /** "8", "-3", "8/3" */
  const fracText = (x) => (x[1] === 1 ? String(x[0]) : x[0] + '/' + x[1]);

  /* ---------------- PRNG mulberry32 (trạng thái là một số 32 bit để lưu ván) ---------------- */

  function rngNext(state) {
    const s = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s >>> 0 };
  }

  /** Seed số hoặc chuỗi → trạng thái đầu. */
  function seedState(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(Math.abs(seed)) >>> 0;
    let h = 2166136261;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /* ---------------- Bộ giải ---------------- */

  /*
   * Biểu thức chuẩn hóa để đếm "lời giải khác nhau":
   *   - tổng / hiệu gộp thành một danh sách hạng tử có dấu, sắp xếp: a+b = b+a, (a+b)-c = a-(c-b)…
   *   - tích / thương gộp thành danh sách thừa số (nhân / chia), sắp xếp: a×b = b×a, a÷(b÷c) = a×c÷b…
   *   - số giữ nguyên. Hai cách ghép cho cùng một chuỗi chuẩn hóa là một lời giải.
   */
  function node(kind, parts) {
    const str = (p) => p[0] + p[1];
    const ps = parts.slice().sort((x, y) => (str(x) < str(y) ? -1 : str(x) > str(y) ? 1 : 0));
    return { kind, parts: ps, key: kind + '(' + ps.map(str).join(',') + ')' };
  }
  const terms = (x) => (x.kind === 'S' ? x.parts : [['+', x.key]]);
  const factors = (x) => (x.kind === 'P' ? x.parts : [['*', x.key]]);
  const flip = (parts, a, b) => parts.map((p) => [p[0] === a ? b : a, p[1]]);

  /** Chuỗi chuẩn hóa của một cây biểu thức { v } | { v, op, l, r } (chỉ dựng khi cây ra 24, cho nhanh). */
  function canon(t) {
    if (!t.op) return { kind: 'N', key: fracText(t.v) };
    const a = canon(t.l);
    const b = canon(t.r);
    if (t.op === '+') return node('S', terms(a).concat(terms(b)));
    if (t.op === '-') return node('S', terms(a).concat(flip(terms(b), '+', '-')));
    if (t.op === '*') return node('P', factors(a).concat(factors(b)));
    return node('P', factors(a).concat(flip(factors(b), '*', '/')));
  }
  /** Cây có đi qua số không nguyên không. */
  const usesFrac = (t) => !isInt(t.v) || (!!t.op && (usesFrac(t.l) || usesFrac(t.r)));

  /**
   * Phân tích một đề (mảng số nguyên): số biểu thức khác nhau ra 24 (`count`),
   * có lời giải chỉ đi qua số nguyên không (`intPath`), và một lời giải mẫu (`example`, dạng chuẩn hóa).
   * Duyệt chỉ bằng giá trị (rẻ), chuỗi chuẩn hóa chỉ dựng cho cây ra 24.
   */
  function analyze(nums) {
    const found = new Set();
    let intPath = false;
    function go(items) {
      if (items.length === 1) {
        const x = items[0];
        if (eqNum(x.v, TARGET)) {
          found.add(canon(x).key);
          if (!usesFrac(x)) intPath = true;
        }
        return;
      }
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const rest = items.filter((_, k) => k !== i && k !== j);
          const a = items[i];
          const b = items[j];
          const pairs = [[a, '+', b], [a, '*', b], [a, '-', b], [b, '-', a], [a, '/', b], [b, '/', a]];
          for (const [l, op, r] of pairs) {
            const v = calc(l.v, op, r.v);
            if (v) {
              rest.push({ v, op, l, r });
              go(rest);
              rest.pop();
            }
          }
        }
      }
    }
    go(nums.map((n) => ({ v: frac(n) })));
    return { count: found.size, intPath, example: found.size ? found.values().next().value : null };
  }

  /**
   * Phân loại độ khó theo bộ giải:
   *   - 'easy': ít nhất EASY_MIN biểu thức khác nhau và có cách giải chỉ dùng số nguyên
   *   - 'hard': chỉ HARD_MAX biểu thức (một lời giải), hoặc bắt buộc đi qua phân số
   *   - null: không giải được, hoặc ở giữa hai mức (không dùng)
   */
  const EASY_MIN = 5;
  const HARD_MAX = 1;
  function classify(nums) {
    const a = analyze(nums);
    if (a.count === 0) return null;
    if (!a.intPath || a.count <= HARD_MAX) return 'hard';
    if (a.count >= EASY_MIN) return 'easy';
    return null;
  }

  /**
   * Tìm các bước giải từ các ô hiện có (mảng 4 phần tử: phân số hoặc null).
   * Mỗi bước { a, op, b }: ô a op ô b, kết quả vào ô b. Ưu tiên lời giải ít số âm / phân số nhất (gợi ý dễ hiểu).
   * Trả null nếu không còn cách nào ra 24.
   */
  function findSteps(slots) {
    let best = null;
    let bestCost = Infinity;
    const path = [];
    function go(cur, cost) {
      if (cost >= bestCost) return;
      const live = [];
      cur.forEach((x, i) => { if (x) live.push(i); });
      if (live.length === 1) {
        if (eqNum(cur[live[0]], TARGET)) {
          best = path.slice();
          bestCost = cost;
        }
        return;
      }
      for (const i of live) {
        for (const j of live) {
          if (i === j) continue;
          for (const op of OPS) {
            // + và × giao hoán: chỉ thử một chiều
            if ((op === '+' || op === '*') && i > j) continue;
            const v = calc(cur[i], op, cur[j]);
            if (!v) continue;
            const next = cur.slice();
            next[j] = v;
            next[i] = null;
            path.push({ a: i, op, b: j });
            go(next, cost + (isInt(v) ? 0 : 2) + (v[0] < 0 ? 1 : 0));
            path.pop();
            if (bestCost === 0) return;
          }
        }
      }
    }
    if (!slots.some(Boolean)) return null;
    go(slots, 0);
    return best;
  }

  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

  /**
   * Viết lời giải (các bước trên 4 ô) thành một biểu thức, ngoặc tối thiểu: [3,3,8,8] + bước → "8 ÷ (3 − 8 ÷ 3)".
   * Trả null nếu các bước không gộp được về một ô.
   */
  function exprText(values, steps) {
    const ex = values.map((v) => (v ? { s: fracText(v).replace('-', '−'), p: v[1] === 1 && v[0] >= 0 ? 3 : 2 } : null));
    for (const st of steps) {
      const l = ex[st.a];
      const r = ex[st.b];
      if (!l || !r) return null;
      const p = PREC[st.op];
      const ls = l.p < p ? '(' + l.s + ')' : l.s;
      const rs = r.p < p || (r.p === p && (st.op === '-' || st.op === '/')) ? '(' + r.s + ')' : r.s;
      ex[st.b] = { s: ls + ' ' + SYM[st.op] + ' ' + rs, p };
      ex[st.a] = null;
    }
    const live = ex.filter(Boolean);
    return live.length === 1 ? live[0].s : null;
  }

  /** Một lời giải của đề (mảng số nguyên) dạng chữ, hoặc null. */
  function solutionText(nums) {
    const values = nums.map((n) => frac(n));
    const steps = findSteps(values);
    return steps ? exprText(values, steps) : null;
  }

  /* ---------------- Sinh đề ---------------- */

  const sortedKey = (nums) => nums.slice().sort((x, y) => x - y).join(',');

  /**
   * Rút đề mới cho mode từ trạng thái PRNG: 4 số ngẫu nhiên 1–13, giữ thứ tự rút (không sắp xếp),
   * loại đề đã có trong bộ (`used`, so theo tập số), nhận khi bộ giải xếp đúng mức.
   */
  function deal(mode, state, used) {
    const seen = new Set((used || []).map(sortedKey));
    let s = state >>> 0;
    for (let tries = 0; tries < 100000; tries++) {
      const nums = [];
      for (let k = 0; k < 4; k++) {
        const r = rngNext(s);
        s = r.state;
        nums.push(MIN_N + Math.floor(r.value * (MAX_N - MIN_N + 1)));
      }
      if (seen.has(sortedKey(nums))) continue;
      if (classify(nums) === mode) return { nums, state: s };
    }
    throw new Error('tinh24: cannot deal a puzzle'); // không xảy ra: mỗi mức có hàng trăm tập số
  }

  /* ---------------- Ván ---------------- */

  /**
   * Ván mới: { mode, seed }.
   * Trạng thái: mode, rng (trạng thái PRNG sau đề vừa rút), deck (mọi đề đã rút, kể cả đề bỏ qua; đề hiện tại là đề cuối),
   * done (số đề đã giải), skips, hints, moves (số phép tính + bỏ qua trong cả bộ), steps (các bước của đề hiện tại).
   */
  function newGame(opts) {
    const o = opts || {};
    const mode = MODES.indexOf(o.mode) >= 0 ? o.mode : 'easy';
    const d = deal(mode, seedState(o.seed == null ? Date.now() : o.seed), []);
    return { mode, rng: d.state, deck: [d.nums], done: 0, skips: 0, hints: 0, moves: 0, steps: [] };
  }

  const isWon = (g) => g.done >= SET_SIZE;
  const current = (g) => g.deck[g.deck.length - 1];

  /** Áp một bước lên 4 ô { values, orig } (orig = ô còn là số gốc của đề). Bước sai trả null. */
  function stepSlots(slots, a, op, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || OPS.indexOf(op) < 0) return null;
    if (!slots.values[a] || !slots.values[b]) return null;
    const v = calc(slots.values[a], op, slots.values[b]);
    if (!v) return null;
    const values = slots.values.slice();
    const orig = slots.orig.slice();
    values[b] = v;
    values[a] = null;
    orig[b] = false;
    orig[a] = false;
    return { values, orig };
  }

  /** 4 ô của đề hiện tại sau các bước đã làm. */
  function slotsOf(g) {
    let s = { values: current(g).map((n) => frac(n)), orig: [true, true, true, true] };
    for (const st of g.steps) s = stepSlots(s, st.a, st.op, st.b) || s;
    return s;
  }

  const liveCount = (s) => s.values.filter(Boolean).length;

  /** Đề hiện tại đã ghép hết mà không ra 24 (phải hoàn tác / làm lại). */
  function isStuck(g) {
    if (isWon(g)) return false;
    return liveCount(slotsOf(g)) === 1;
  }

  /** Sang đề kế: rút đề mới nếu bộ chưa xong. */
  function advance(g, patch) {
    const n = Object.assign({}, g, patch, { steps: [] });
    if (isWon(n)) return n;
    const d = deal(n.mode, n.rng, n.deck);
    n.rng = d.state;
    n.deck = n.deck.concat([d.nums]);
    return n;
  }

  /**
   * Một phép tính: ô a op ô b → ô b. Ô trống, chia cho 0, ván đã xong: trả lại chính g.
   * Còn một ô bằng 24 thì đề xong (done + 1) và rút đề kế.
   */
  function combine(g, a, op, b) {
    if (isWon(g)) return g;
    const s = stepSlots(slotsOf(g), a, op, b);
    if (!s) return g;
    const moved = Object.assign({}, g, { steps: g.steps.concat([{ a, op, b }]), moves: g.moves + 1 });
    if (liveCount(s) === 1 && eqNum(s.values[b], TARGET)) return advance(moved, { done: g.done + 1 });
    return moved;
  }

  const canUndo = (g) => !isWon(g) && g.steps.length > 0;
  function undo(g) {
    return canUndo(g) ? Object.assign({}, g, { steps: g.steps.slice(0, -1) }) : g;
  }
  /** Làm lại đề từ đầu (giữ đề, bỏ mọi bước). */
  function reset(g) {
    return canUndo(g) ? Object.assign({}, g, { steps: [] }) : g;
  }

  /** Bỏ qua đề hiện tại: rút đề khác cùng mức (app cộng SKIP_MS vào đồng hồ). Bỏ qua không làm tăng số đề đã giải. */
  function skip(g) {
    if (isWon(g)) return g;
    return advance(g, { skips: g.skips + 1, moves: g.moves + 1 });
  }

  /**
   * Gợi ý: bước kế tiếp của một lời giải từ các ô hiện có. Đường đang đi không tới được 24 thì gợi ý làm lại đề
   * (trả bước đầu của lời giải từ đề gốc kèm reset: true). Mỗi lần gợi ý tăng hints (ván thành assisted).
   */
  function hint(g) {
    if (isWon(g)) return null;
    const used = Object.assign({}, g, { hints: g.hints + 1 });
    const here = findSteps(slotsOf(g).values);
    if (here && here.length) return { game: used, step: here[0], reset: false };
    const fresh = findSteps(current(g).map((n) => frac(n)));
    return fresh && fresh.length ? { game: used, step: fresh[0], reset: true } : null;
  }

  /** Tiến độ cả bộ 0..1 (tính cả bước trong đề hiện tại). */
  function progress(g) {
    if (isWon(g)) return 1;
    return Math.min(1, (g.done + g.steps.length / 4) / SET_SIZE);
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    rng: g.rng,
    deck: g.deck.map((d) => d.slice()),
    done: g.done,
    skips: g.skips,
    hints: g.hints,
    moves: g.moves,
    steps: g.steps.map((s) => [s.a, s.op, s.b]),
  });

  const isCount = (x) => Number.isInteger(x) && x >= 0 && x < 1e6;

  /** Ván lưu hỏng / khác phiên bản / đề không giải được / bước không hợp lệ thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { mode, rng, deck, done, skips, hints, moves, steps } = raw;
    if (MODES.indexOf(mode) < 0) return null;
    if (!Number.isInteger(rng) || rng < 0 || rng > 4294967295) return null;
    if (![done, skips, hints, moves].every(isCount) || done > SET_SIZE) return null;
    if (!Array.isArray(deck) || deck.length !== done + skips + (done >= SET_SIZE ? 0 : 1)) return null;
    if (!deck.every((d) => Array.isArray(d) && d.length === 4 && d.every((n) => Number.isInteger(n) && n >= MIN_N && n <= MAX_N))) return null;
    if (!Array.isArray(steps) || steps.length > 3) return null;
    const g = { mode, rng, deck: deck.map((d) => d.slice()), done, skips, hints, moves, steps: [] };
    if (isWon(g)) return steps.length ? null : g;
    if (!analyze(current(g)).count) return null;
    let s = slotsOf(g);
    for (const st of steps) {
      if (!Array.isArray(st) || st.length !== 3) return null;
      const next = stepSlots(s, st[0], st[1], st[2]);
      if (!next) return null;
      s = next;
      g.steps.push({ a: st[0], op: st[1], b: st[2] });
    }
    // Ván lưu không bao giờ dừng ở đề đã ra 24 (combine đã sang đề kế)
    if (liveCount(s) === 1 && s.values.some((x) => x && eqNum(x, TARGET))) return null;
    if (moves < g.steps.length + skips) return null;
    return g;
  }

  const api = {
    VERSION, TARGET, SET_SIZE, MODES, OPS, SKIP_MS, EASY_MIN, HARD_MAX,
    frac, calc, fracText, isInt, rngNext, seedState,
    analyze, classify, findSteps, exprText, solutionText, deal,
    newGame, isWon, isStuck, current, slotsOf, stepSlots, combine, canUndo, undo, reset, skip, hint, progress,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
