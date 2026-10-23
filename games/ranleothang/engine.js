/* =====================================================================
 * Rắn Leo Thang - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn 10x10 đánh số zig-zag: ô 1 ở góc dưới trái, hàng chẵn (tính từ dưới) đi trái -> phải,
 *     hàng lẻ đi phải -> trái, ô 100 ở góc trên trái
 *   - Mấy bàn cố định (LAYOUTS), mỗi ván chọn ngẫu nhiên theo seed; validateLayout kiểm tra luật bàn
 *   - Người chơi 0 là người, 1..3 là máy; vị trí 0 = chưa vào bàn
 *   - Xúc xắc lấy từ PRNG mulberry32 nằm trong trạng thái ván (rng), nên lưu / khôi phục lặp lại được
 *   - Phải tung đúng số để về 100, thừa thì dội lại; tung 6 được tung tiếp (tùy chọn extraSix)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const N = 10; // cạnh bàn
  const GOAL = N * N;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;

  /* Bàn cố định: [đầu, cuối]. Rắn: đầu cao -> đuôi thấp; thang: chân thấp -> ngọn cao.
   * Mọi đầu mút khác nhau (không đầu rắn ở chân thang, không nối chuỗi), nằm trong 2..99, khác hàng. */
  const LAYOUTS = [
    {
      id: 'garden',
      ladders: [[4, 25], [13, 46], [33, 49], [42, 63], [50, 69], [62, 81], [74, 92]],
      snakes: [[27, 5], [40, 3], [43, 18], [54, 31], [66, 45], [76, 58], [89, 68], [99, 78]],
    },
    {
      id: 'jungle',
      ladders: [[2, 23], [8, 34], [21, 42], [28, 84], [51, 67], [71, 91], [80, 99]],
      snakes: [[17, 7], [47, 26], [49, 11], [62, 19], [64, 24], [93, 73], [95, 75]],
    },
    {
      id: 'desert',
      ladders: [[6, 27], [11, 49], [38, 57], [45, 65], [53, 72], [60, 78], [82, 97]],
      snakes: [[24, 16], [35, 12], [48, 30], [64, 41], [77, 55], [86, 63], [94, 68], [98, 79]],
    },
    {
      id: 'ocean',
      ladders: [[3, 39], [14, 32], [22, 41], [45, 65], [55, 73], [66, 87], [79, 96]],
      snakes: [[26, 8], [44, 24], [52, 29], [69, 47], [83, 61], [91, 70], [97, 77]],
    },
  ];

  /* ---------------- Bàn cờ ---------------- */

  const rowOf = (n) => Math.floor((n - 1) / N);

  /** Ô 1..100 -> { row (0 = hàng dưới), col (0 = cột trái) }. */
  function coord(n) {
    const row = rowOf(n);
    const i = (n - 1) % N;
    return { row, col: row % 2 === 0 ? i : N - 1 - i };
  }

  /** Ngược của coord. */
  function squareAt(row, col) {
    return row * N + (row % 2 === 0 ? col : N - 1 - col) + 1;
  }

  const isSquare = (n) => Number.isInteger(n) && n >= 2 && n <= GOAL - 1;

  /** Danh sách lỗi của một bàn (rỗng = hợp lệ). */
  function validateLayout(layout) {
    const errs = [];
    if (!layout || !Array.isArray(layout.ladders) || !Array.isArray(layout.snakes)) return ['thiếu ladders / snakes'];
    const ends = new Map(); // ô -> mô tả, để bắt hai đầu mút trùng ô
    const take = (n, what) => {
      if (ends.has(n)) errs.push(what + ' trùng ô ' + n + ' với ' + ends.get(n));
      else ends.set(n, what);
    };
    const check = (pair, kind) => {
      const name = kind + ' ' + JSON.stringify(pair);
      if (!Array.isArray(pair) || pair.length !== 2) return errs.push(name + ': sai dạng');
      const [a, b] = pair;
      if (kind === 'snake' && a === GOAL) errs.push(name + ': rắn ở ô 100');
      if (!isSquare(a) || !isSquare(b)) return errs.push(name + ': ngoài 2..99');
      if (kind === 'snake' ? a <= b : a >= b) errs.push(name + ': sai chiều');
      if (rowOf(a) === rowOf(b)) errs.push(name + ': cùng hàng');
      take(a, name);
      take(b, name);
    };
    layout.ladders.forEach((p) => check(p, 'ladder'));
    layout.snakes.forEach((p) => check(p, 'snake'));
    return errs;
  }

  /** Ô đích nếu `n` là chân thang / đầu rắn, ngược lại null. */
  function jumpAt(layout, n) {
    const hit = layout.ladders.concat(layout.snakes).find((p) => p[0] === n);
    return hit ? hit[1] : null;
  }

  /* ---------------- Xúc xắc ---------------- */

  /** Một bước mulberry32: trạng thái uint32 -> { rng: trạng thái mới, value: [0, 1) }. */
  function nextRandom(state) {
    const s = (state + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { rng: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  function nextDie(state) {
    const r = nextRandom(state);
    return { rng: r.rng, die: 1 + Math.floor(r.value * 6) };
  }

  /* ---------------- Đi quân ---------------- */

  /**
   * Đi `die` ô từ `from` (0 = ngoài bàn), từng ô một; chạm 100 mà còn bước thì quay đầu.
   * Trả { path: các ô đi qua, landed: ô dừng, to: ô cuối sau rắn / thang, jump, bounced }.
   */
  function planMove(layout, from, die) {
    const path = [];
    let s = from;
    let dir = 1;
    let bounced = false;
    for (let k = 0; k < die; k++) {
      if (s === GOAL) {
        dir = -1;
        bounced = true;
      }
      s += dir;
      path.push(s);
    }
    const to = jumpAt(layout, s);
    const jump = to == null ? null : { type: to > s ? 'ladder' : 'snake', from: s, to };
    return { path, landed: s, to: to == null ? s : to, jump, bounced };
  }

  /* ---------------- Ván ---------------- */

  /**
   * Ván mới. opts: { players (2..4, mặc định 4), seed, layout (chỉ số; bỏ trống thì chọn theo seed), extraSix }.
   * Người chơi 0 (người) đi trước.
   */
  function newGame(opts) {
    const o = opts || {};
    const players = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(o.players) || MAX_PLAYERS));
    let rng = (Number(o.seed) || 1) >>> 0;
    let layout = o.layout;
    if (!(Number.isInteger(layout) && layout >= 0 && layout < LAYOUTS.length)) {
      const r = nextRandom(rng);
      rng = r.rng;
      layout = Math.floor(r.value * LAYOUTS.length);
    }
    return {
      layout,
      players,
      pos: new Array(players).fill(0),
      turn: 0,
      rng,
      extraSix: o.extraSix !== false,
      winner: null,
      rolls: 0,
      counts: new Array(players).fill(0),
    };
  }

  const isOver = (g) => g.winner != null;

  /**
   * Người đang tới lượt đi `die` bước. Trả { game, move } với move:
   * { player, roll, from, path, landed, to, jump, bounced, extra (được tung tiếp), won }.
   * Ván đã xong thì trả nguyên ván, move = null.
   */
  function applyRoll(g, die) {
    if (!Number.isInteger(die) || die < 1 || die > 6) throw new Error('die must be 1..6');
    if (isOver(g)) return { game: g, move: null };
    const p = g.turn;
    const from = g.pos[p];
    const plan = planMove(LAYOUTS[g.layout], from, die);
    const won = plan.to === GOAL;
    const extra = !won && g.extraSix && die === 6;
    const pos = g.pos.slice();
    pos[p] = plan.to;
    const counts = g.counts.slice();
    counts[p]++;
    const game = Object.assign({}, g, {
      pos,
      counts,
      rolls: g.rolls + 1,
      turn: won || extra ? p : (p + 1) % g.players,
      winner: won ? p : null,
    });
    const move = Object.assign({ player: p, roll: die, from }, plan, { extra, won });
    return { game, move };
  }

  /** Tung xúc xắc từ PRNG của ván rồi đi. */
  function roll(g) {
    if (isOver(g)) return { game: g, move: null };
    const r = nextDie(g.rng);
    return applyRoll(Object.assign({}, g, { rng: r.rng }), r.die);
  }

  /* ---------------- Lưu ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    layout: g.layout,
    players: g.players,
    pos: g.pos.slice(),
    turn: g.turn,
    rng: g.rng,
    extraSix: g.extraSix,
    winner: g.winner,
    rolls: g.rolls,
    counts: g.counts.slice(),
  });

  const isIntIn = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { layout, players, pos, turn, rng, extraSix, winner, rolls, counts } = raw;
    if (!isIntIn(layout, 0, LAYOUTS.length - 1) || !isIntIn(players, MIN_PLAYERS, MAX_PLAYERS)) return null;
    if (!Array.isArray(pos) || pos.length !== players || !Array.isArray(counts) || counts.length !== players) return null;
    if (!isIntIn(turn, 0, players - 1) || !isIntIn(rng, 0, 4294967295) || typeof extraSix !== 'boolean') return null;
    if (!isIntIn(rolls, 0, 1e7) || !counts.every((c) => isIntIn(c, 0, 1e7)) || counts.reduce((a, b) => a + b, 0) !== rolls) return null;
    const L = LAYOUTS[layout];
    if (!pos.every((p) => isIntIn(p, 0, GOAL) && jumpAt(L, p) == null)) return null;
    // Ai đứng ở 100 thì người đó là người thắng, và chỉ một người
    const home = pos.map((p, i) => (p === GOAL ? i : -1)).filter((i) => i >= 0);
    if (winner === null) {
      if (home.length) return null;
    } else if (!isIntIn(winner, 0, players - 1) || home.length !== 1 || home[0] !== winner || turn !== winner) return null;
    return { layout, players, pos: pos.slice(), turn, rng, extraSix, winner, rolls, counts: counts.slice() };
  }

  const api = {
    N,
    GOAL,
    LAYOUTS,
    MIN_PLAYERS,
    MAX_PLAYERS,
    coord,
    squareAt,
    validateLayout,
    jumpAt,
    nextDie,
    planMove,
    newGame,
    isOver,
    applyRoll,
    roll,
    toJSON,
    fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
