/* =====================================================================
 * Cá Ngựa - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Luật Ludo quốc tế, 4 màu x 4 quân, người chơi ghế 0, máy ghế 1..3 (theo chiều kim đồng hồ).
 *   - Vị trí quân theo từng ghế (rel): -1 = trong chuồng, 0..50 = trên đường đua (0 = ô xuất phát),
 *     51..55 = đường về đích riêng của màu, 56 = về đích.
 *   - Đường đua chung 52 ô; ô xuất phát của ghế s là 13*s. Ô an toàn: 4 ô xuất phát + 4 ô sao.
 *   - Tung 6 mới được ra quân; 6 được tung thêm; ba lần 6 liên tiếp thì mất lượt.
 *   - Đá quân đối thủ (về chuồng) khi đứng vào ô của nó, trừ ô an toàn. Về đích phải đúng số.
 *   - Ai đưa đủ 4 quân về đích trước thì thắng, ván kết thúc ngay.
 *   Xúc xắc dùng PRNG seed được (mulberry32), trạng thái PRNG nằm trong ván: tung lại sau khi tải
 *   lại trang vẫn ra đúng số cũ. Máy chọn nước bằng heuristic + ngẫu nhiên seed theo trạng thái ván.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SEATS = 4;
  const TOKENS = 4;
  const HUMAN = 0;
  const BASE = -1;
  const LAST_TRACK = 50; // ô cuối trên đường đua (tính theo ghế)
  const HOME = 56; // về đích
  const TRACK = 52;
  const START = [0, 13, 26, 39]; // ô xuất phát (chỉ số trên đường đua chung)
  const STARS = [8, 21, 34, 47]; // ô sao: an toàn
  const SAFE = START.concat(STARS);
  const PHASES = ['roll', 'move', 'over'];

  /* ---------------- Hình học bàn 15x15 (hàng, cột) ---------------- */

  // Đường đua của ghế 0 (chuồng góc dưới trái), bắt đầu ở ô xuất phát (13,6) đi lên, theo chiều kim đồng hồ
  const PATH = (() => {
    const p = [];
    const run = (r, c, dr, dc, n) => { for (let i = 0; i < n; i++) p.push([r + dr * i, c + dc * i]); };
    run(13, 6, -1, 0, 5); // lên cột 6
    run(8, 5, 0, -1, 6); // sang trái hàng 8
    p.push([7, 0]);
    run(6, 0, 0, 1, 6); // sang phải hàng 6
    run(5, 6, -1, 0, 6); // lên cột 6
    p.push([0, 7]);
    run(0, 8, 1, 0, 6); // xuống cột 8
    run(6, 9, 0, 1, 6); // sang phải hàng 6
    p.push([7, 14]);
    run(8, 14, 0, -1, 6); // sang trái hàng 8
    run(9, 8, 1, 0, 6); // xuống cột 8
    p.push([14, 7]);
    p.push([14, 6]);
    return p;
  })();
  const HOME_COL0 = [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]; // rel 51..55 của ghế 0
  const YARD0 = [[11, 2], [11, 4], [13, 2], [13, 4]]; // tâm chỗ đứng trong chuồng (tọa độ liên tục)
  const NEST0 = [[8.62, 6.9], [8.62, 7.5], [8.62, 8.1], [8.12, 7.5]]; // chỗ đứng khi đã về đích (tam giác giữa)

  /** Xoay một điểm liên tục (y, x) trên bàn 15x15 một phần tư vòng theo chiều kim đồng hồ, `times` lần. */
  function rot(pt, times) {
    let [y, x] = pt;
    for (let i = 0; i < times; i++) [y, x] = [x, 15 - y];
    return [y, x];
  }
  /** Ô (hàng, cột) xoay theo ghế (dùng tâm ô rồi đổi lại). */
  function rotCell(cell, times) {
    const [y, x] = rot([cell[0] + 0.5, cell[1] + 0.5], times);
    return [y - 0.5, x - 0.5];
  }

  /** Chỉ số ô trên đường đua chung của quân ghế `seat` ở vị trí `rel`; -1 nếu không ở trên đường đua. */
  const absOf = (seat, rel) => (rel >= 0 && rel <= LAST_TRACK ? (START[seat] + rel) % TRACK : -1);
  const isSafe = (abs) => SAFE.indexOf(abs) >= 0;

  /** Ô (hàng, cột) của quân trên đường đua hoặc đường về đích; null nếu đang ở chuồng / đã về đích. */
  function cellOf(seat, rel) {
    if (rel >= 0 && rel <= LAST_TRACK) return PATH[absOf(seat, rel)].slice();
    if (rel > LAST_TRACK && rel < HOME) return rotCell(HOME_COL0[rel - LAST_TRACK - 1], seat);
    return null;
  }

  /** Tâm (y, x) để vẽ quân thứ k của ghế ở vị trí rel, đơn vị = cạnh ô. */
  function pointOf(seat, rel, k) {
    if (rel === BASE) return rot(YARD0[k], seat);
    if (rel === HOME) return rot(NEST0[k], seat);
    const c = cellOf(seat, rel);
    return [c[0] + 0.5, c[1] + 0.5];
  }

  /* ---------------- Xúc xắc seed được ---------------- */

  /** mulberry32: trả [số thực 0..1, trạng thái mới]. */
  function rand(state) {
    const s = (state + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
  }
  /** Tung một con xúc xắc: { value: 1..6, rng: trạng thái mới }. */
  function rollDie(rng) {
    const [r, next] = rand(rng);
    return { value: 1 + Math.floor(r * 6), rng: next };
  }

  /* ---------------- Ván ---------------- */

  function newGame(seed) {
    return {
      rng: seed >>> 0,
      turn: HUMAN, // người chơi đi trước
      phase: 'roll',
      dice: 0, // lần tung gần nhất (0 = chưa tung)
      sixes: 0, // số lần 6 liên tiếp trong lượt hiện tại
      pos: Array.from({ length: SEATS }, () => new Array(TOKENS).fill(BASE)),
      winner: -1,
      rolls: 0, // tổng số lần tung của cả bàn
      caps: new Array(SEATS).fill(0), // số quân mỗi ghế đã đá
      last: null, // sự kiện vừa xảy ra (không lưu)
    };
  }

  const clone = (g) => ({
    rng: g.rng, turn: g.turn, phase: g.phase, dice: g.dice, sixes: g.sixes,
    pos: g.pos.map((p) => p.slice()), winner: g.winner, rolls: g.rolls, caps: g.caps.slice(), last: null,
  });
  const nextSeat = (s) => (s + 1) % SEATS;
  const isOver = (g) => g.phase === 'over';
  const homeCount = (g, seat) => g.pos[seat].filter((r) => r === HOME).length;
  const progress = (rel) => (rel === BASE ? 0 : rel + 1); // 0..57, để so quân nào đi xa hơn

  /** Vị trí đích khi đi `d` bước từ `rel`; null nếu không đi được (chưa có 6 để ra quân, quá đích). */
  function targetRel(rel, d) {
    if (rel === BASE) return d === 6 ? 0 : null;
    if (rel === HOME) return null;
    return rel + d <= HOME ? rel + d : null;
  }

  /** Các quân đối thủ bị đá nếu quân ghế `seat` đứng ở `rel` (ô an toàn / đường về đích thì không ai). */
  function capturesAt(g, seat, rel) {
    const abs = absOf(seat, rel);
    if (abs < 0 || isSafe(abs)) return [];
    const out = [];
    for (let s = 0; s < SEATS; s++) {
      if (s === seat) continue;
      for (let k = 0; k < TOKENS; k++) if (absOf(s, g.pos[s][k]) === abs) out.push({ seat: s, token: k });
    }
    return out;
  }

  /** Nước đi hợp lệ của ghế `seat` với số xúc xắc `dice`. */
  function movesFor(g, seat, dice) {
    const out = [];
    for (let k = 0; k < TOKENS; k++) {
      const from = g.pos[seat][k];
      const to = targetRel(from, dice);
      if (to === null) continue;
      out.push({ token: k, from, to, captures: capturesAt(g, seat, to) });
    }
    return out;
  }
  /** Nước đi hợp lệ của người đang tới lượt với số vừa tung (rỗng nếu chưa tới bước đi quân). */
  const legalMoves = (g) => (g.phase === 'move' ? movesFor(g, g.turn, g.dice) : []);

  /** Tung xúc xắc (value cho test; bỏ trống thì lấy từ PRNG của ván). */
  function roll(g, value) {
    if (g.phase !== 'roll') return g;
    const n = clone(g);
    let v = value;
    if (v === undefined) {
      const r = rollDie(g.rng);
      v = r.value;
      n.rng = r.rng;
    }
    const seat = g.turn;
    n.dice = v;
    n.rolls++;
    const sixes = v === 6 ? g.sixes + 1 : 0;
    if (sixes === 3) {
      // Ba lần 6 liên tiếp: mất lượt, không đi lần này
      n.turn = nextSeat(seat);
      n.sixes = 0;
      n.last = { type: 'roll', seat, value: v, outcome: 'forfeit' };
      return n;
    }
    n.sixes = sixes;
    if (movesFor(n, seat, v).length) {
      n.phase = 'move';
      n.last = { type: 'roll', seat, value: v, outcome: 'move' };
    } else {
      // Không quân nào đi được: tung 6 thì vẫn được tung lại, không thì qua lượt
      if (v !== 6) {
        n.turn = nextSeat(seat);
        n.sixes = 0;
      }
      n.last = { type: 'roll', seat, value: v, outcome: 'nomove' };
    }
    return n;
  }

  /** Đi quân `token` của người đang tới lượt; nước không hợp lệ thì trả nguyên ván. */
  function move(g, token) {
    const m = legalMoves(g).find((x) => x.token === token);
    if (!m) return g;
    const n = clone(g);
    const seat = g.turn;
    n.pos[seat][token] = m.to;
    m.captures.forEach((c) => { n.pos[c.seat][c.token] = BASE; });
    n.caps[seat] += m.captures.length;
    n.last = { type: 'move', seat, token, from: m.from, to: m.to, captures: m.captures };
    n.phase = 'roll';
    if (homeCount(n, seat) === TOKENS) {
      n.phase = 'over';
      n.winner = seat;
      n.sixes = 0;
    } else if (g.dice !== 6) {
      n.turn = nextSeat(seat); // 6 thì tung tiếp, không thì qua lượt
      n.sixes = 0;
    }
    return n;
  }

  /* ---------------- Máy chọn nước ---------------- */

  /** Số quân đối thủ có thể đá quân ghế `seat` đứng ở `rel` trong một lần tung (đứng sau 1..6 ô). */
  function threats(g, seat, rel) {
    const abs = absOf(seat, rel);
    if (abs < 0 || isSafe(abs)) return 0;
    let n = 0;
    for (let s = 0; s < SEATS; s++) {
      if (s === seat) continue;
      for (let k = 0; k < TOKENS; k++) {
        const r = g.pos[s][k];
        const a = absOf(s, r);
        if (a < 0) continue;
        const d = (abs - a + TRACK) % TRACK;
        if (d >= 1 && d <= 6 && r + d <= LAST_TRACK) n++; // quân đối thủ còn chạy trên đường đua tới được
      }
    }
    return n;
  }

  /** Điểm heuristic của một nước: đá quân > về đích > ra quân bằng 6 > cứu quân đang bị dọa; tránh đứng chỗ nguy hiểm. */
  function scoreMove(g, m) {
    const seat = g.turn;
    let s = m.to / 20; // đi xa hơn một chút thì tốt hơn
    if (m.captures.length) s += 100 + m.captures.reduce((a, c) => a + progress(g.pos[c.seat][c.token]), 0) / 2;
    if (m.to === HOME) s += 80;
    if (m.from === BASE) s += 60;
    if (m.from <= LAST_TRACK && m.to > LAST_TRACK && m.to < HOME) s += 35; // vào đường về đích: an toàn
    const after = clone(g);
    after.pos[seat][m.token] = m.to;
    m.captures.forEach((c) => { after.pos[c.seat][c.token] = BASE; });
    const before = m.from === BASE ? 0 : threats(g, seat, m.from);
    const danger = threats(after, seat, m.to);
    if (before) s += 25 + progress(m.from) / 3; // quân đang bị dọa: càng đi xa càng đáng cứu
    if (danger) s -= 40 + progress(m.to) / 3 + 10 * (danger - 1);
    const abs = absOf(seat, m.to);
    if (abs >= 0 && isSafe(abs)) s += 12;
    return s;
  }

  /** Nước máy chọn cho người đang tới lượt (null nếu không có nước). Ngẫu nhiên nhẹ, seed theo trạng thái ván. */
  function chooseMove(g) {
    const moves = legalMoves(g);
    if (!moves.length) return null;
    let r = (g.rng ^ 0x9e3779b9 ^ Math.imul(g.rolls, 2654435761)) >>> 0;
    let best = null;
    let bestScore = -Infinity;
    moves.forEach((m) => {
      const [x, nr] = rand(r);
      r = nr;
      const sc = scoreMove(g, m) + x * 4;
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    });
    return best;
  }

  /* ---------------- Kiểm tra trạng thái + lưu ---------------- */

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /** Trạng thái hợp lệ không (dùng cho fromJSON và test). */
  function validate(g) {
    if (!g || typeof g !== 'object') return false;
    if (!isInt(g.rng, 0, 4294967295) || !isInt(g.turn, 0, SEATS - 1) || PHASES.indexOf(g.phase) < 0) return false;
    if (!isInt(g.dice, 0, 6) || !isInt(g.sixes, 0, 2) || !isInt(g.rolls, 0, 1e9) || !isInt(g.winner, -1, SEATS - 1)) return false;
    if (!Array.isArray(g.caps) || g.caps.length !== SEATS || !g.caps.every((c) => isInt(c, 0, 1e6))) return false;
    if (!Array.isArray(g.pos) || g.pos.length !== SEATS) return false;
    for (let s = 0; s < SEATS; s++) {
      if (!Array.isArray(g.pos[s]) || g.pos[s].length !== TOKENS || !g.pos[s].every((r) => isInt(r, BASE, HOME))) return false;
    }
    // Hai màu khác nhau không thể cùng đứng trên một ô thường (người đến sau đã đá người trước)
    const seen = {};
    for (let s = 0; s < SEATS; s++) {
      for (let k = 0; k < TOKENS; k++) {
        const a = absOf(s, g.pos[s][k]);
        if (a < 0 || isSafe(a)) continue;
        if (seen[a] !== undefined && seen[a] !== s) return false;
        seen[a] = s;
      }
    }
    const finished = [0, 1, 2, 3].filter((s) => homeCount(g, s) === TOKENS);
    if (g.phase === 'over') {
      if (finished.length !== 1 || finished[0] !== g.winner) return false;
    } else if (finished.length || g.winner !== -1) return false;
    if (g.phase === 'move') {
      if (g.dice < 1 || (g.dice === 6) !== (g.sixes > 0) || !movesFor(g, g.turn, g.dice).length) return false;
    }
    if (g.rolls === 0 && (g.dice !== 0 || g.phase !== 'roll')) return false;
    return true;
  }

  const toJSON = (g) => ({
    v: VERSION, rng: g.rng, turn: g.turn, phase: g.phase, dice: g.dice, sixes: g.sixes,
    pos: g.pos.map((p) => p.slice()), winner: g.winner, rolls: g.rolls, caps: g.caps.slice(),
  });

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const g = {
      rng: raw.rng, turn: raw.turn, phase: raw.phase, dice: raw.dice, sixes: raw.sixes,
      pos: Array.isArray(raw.pos) ? raw.pos.map((p) => (Array.isArray(p) ? p.slice() : p)) : raw.pos,
      winner: raw.winner, rolls: raw.rolls, caps: Array.isArray(raw.caps) ? raw.caps.slice() : raw.caps, last: null,
    };
    return validate(g) ? g : null;
  }

  const api = {
    VERSION, SEATS, TOKENS, HUMAN, BASE, LAST_TRACK, HOME, TRACK, START, STARS, SAFE, PATH, HOME_COL0,
    rot, rotCell, absOf, isSafe, cellOf, pointOf, rand, rollDie, targetRel,
    newGame, isOver, homeCount, capturesAt, legalMoves, roll, move, threats, scoreMove, chooseMove,
    validate, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
