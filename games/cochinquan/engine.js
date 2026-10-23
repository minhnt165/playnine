/* =====================================================================
 * Cờ Chín Quân (Mill / Nine men's morris) - Engine thuần (không đụng DOM)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong Web Worker
 *   (app.js dựng lại mã nguồn qua GameEngine.factory.toString()).
 *
 *   Bàn 24 điểm trên ba hình vuông lồng nhau (đánh số trái → phải, trên → dưới):
 *     0-----------1-----------2
 *     |   3-------4-------5   |
 *     |   |   6---7---8   |   |
 *     9---10--11      12--13--14
 *     |   |   15--16--17  |   |
 *     |   18------19------20  |
 *     21----------22----------23
 *   Luật:
 *   - Trắng đi trước. Giai đoạn 1: lần lượt đặt 9 quân mỗi bên vào điểm trống.
 *   - Giai đoạn 2: đi một quân theo đường kẻ sang điểm kề còn trống.
 *     Còn đúng 3 quân (hết quân trên tay) thì được "bay" tới điểm trống bất kỳ.
 *   - Lập mill (3 quân thẳng hàng trên một đường) thì ăn một quân đối thủ không nằm trong mill;
 *     mọi quân đối thủ đều nằm trong mill thì ăn quân nào cũng được.
 *   - Thua khi còn dưới 3 quân (tính cả quân trên tay) hoặc đến lượt mà không còn nước đi.
 *   - Hòa: 50 nước mỗi bên (100 nửa nước) ở giai đoạn đi / bay không ai ăn quân, hoặc một thế lặp lại 3 lần.
 *
 *   Một nước = { from, to, remove }: from = -1 khi đặt quân, remove = -1 khi không lập mill.
 *   Máy: negamax alpha-beta, đào sâu dần, bảng chuyển vị, sắp xếp nước (ăn quân, chặn mill),
 *   lượng giá theo số quân, mill, mill mở, quân bị chặn, độ linh hoạt, "mill kép" (đóng mở liên tục).
 * ===================================================================== */
function CoChinQuanFactory() {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const WHITE = 1;
  const BLACK = 2;
  const PIECES = 9;
  const N = 24;
  const FULL = 0xffffff; // 24 bit, mỗi bit một điểm
  const QUIET_LIMIT = 100; // 50 nước mỗi bên không ăn quân thì hòa
  const REP_LIMIT = 3;
  const NONE = 31; // trong mã nước: "đặt quân" (from) / "không ăn" (remove)
  const WIN = 100000;
  const REASONS = ['pieces', 'blocked', 'fifty', 'repetition'];

  // Tọa độ trên lưới 7x7 (để vẽ và để test kiểm tra mill thẳng hàng)
  const COORDS = [
    [0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
    [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6],
  ];
  // 16 đường mill: 8 hàng ngang, 8 hàng dọc
  const MILLS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
    [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
  ];
  // Hai điểm kề nhau khi đứng liền nhau trên một đường mill
  const ADJ = Array.from({ length: N }, () => []);
  MILLS.forEach(([a, b, c]) => {
    ADJ[a].push(b); ADJ[b].push(a);
    ADJ[b].push(c); ADJ[c].push(b);
  });
  ADJ.forEach((l) => l.sort((x, y) => x - y));

  const bit = (p) => 1 << p;
  const maskOf = (list) => list.reduce((m, p) => m | bit(p), 0);
  const ADJ_MASK = ADJ.map(maskOf);
  const MILL_MASK = MILLS.map(maskOf);
  const MILLS_AT = Array.from({ length: N }, (_, p) => MILL_MASK.filter((m) => m & bit(p))); // đúng 2 mill mỗi điểm

  // Cấu hình máy. depth: độ sâu tối đa (nửa nước); minDepth: luôn tìm xong độ sâu này;
  // timeMs: thời gian nghĩ; noise: nhiễu cộng vào điểm từng nước; mistake: xác suất đi bừa
  const LEVELS = {
    easy: { depth: 2, minDepth: 1, timeMs: 300, noise: 90, mistake: 0.2 },
    medium: { depth: 4, minDepth: 4, timeMs: 1200, noise: 0, mistake: 0 },
    hard: { depth: 14, minDepth: 6, timeMs: 1500, noise: 0, mistake: 0 },
  };

  /* ---------------- Bit ---------------- */
  function popcount(x) {
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
  }
  const low = (x) => 31 - Math.clz32(x & -x); // chỉ số bit thấp nhất
  const listOf = (x) => {
    const out = [];
    for (; x; x &= x - 1) out.push(low(x));
    return out;
  };

  /** Hợp các mill đã đủ 3 quân của x */
  function closedMills(x) {
    let m = 0;
    for (let i = 0; i < 16; i++) if ((x & MILL_MASK[i]) === MILL_MASK[i]) m |= MILL_MASK[i];
    return m;
  }
  /** Quân x vừa tới điểm `to` có lập mill không */
  function makesMill(x, to) {
    const a = MILLS_AT[to];
    return (x & a[0]) === a[0] || (x & a[1]) === a[1];
  }
  /** Quân của op ăn được: ngoài mill; nếu mọi quân đều trong mill thì quân nào cũng được */
  function removableMask(op) {
    const free = op & ~closedMills(op);
    return free || op;
  }
  /** Khóa thế cờ (số nguyên < 2^53): hai bàn 24 bit + quân trên tay của trắng + lượt
   *  (quân trên tay của đen suy ra được: bằng trắng khi trắng đi, hơn 1 khi đen đi, 0 khi đã đặt hết) */
  const posKey = (w, b, h1, turn) => (w + b * 16777216) * 20 + h1 * 2 + (turn - 1);

  /* ---------------- Sinh nước (mã số: from | to << 5 | remove << 10) ----------------
   * Lập mill khi đối thủ chưa có quân nào trên bàn (mới đặt, đã bị ăn hết) thì không ăn gì. */
  function gen(me, op, hand) {
    const out = [];
    const empty = FULL & ~(me | op);
    const rem = removableMask(op);
    if (hand > 0) {
      for (let e = empty; e; e &= e - 1) {
        const to = low(e);
        const head = NONE | (to << 5);
        if (rem && makesMill(me | bit(to), to)) for (let r = rem; r; r &= r - 1) out.push(head | (low(r) << 10));
        else out.push(head | (NONE << 10));
      }
      return out;
    }
    const fly = popcount(me) === 3;
    for (let f = me; f; f &= f - 1) {
      const from = low(f);
      const rest = me & ~bit(from);
      for (let d = fly ? empty : ADJ_MASK[from] & empty; d; d &= d - 1) {
        const to = low(d);
        const head = from | (to << 5);
        if (rem && makesMill(rest | bit(to), to)) for (let r = rem; r; r &= r - 1) out.push(head | (low(r) << 10));
        else out.push(head | (NONE << 10));
      }
    }
    return out;
  }
  const decode = (c) => {
    const f = c & 31;
    const r = (c >> 10) & 31;
    return { from: f === NONE ? -1 : f, to: (c >> 5) & 31, remove: r === NONE ? -1 : r };
  };

  /* ---------------- Trạng thái ván ---------------- */
  // { board[24]: 0 trống / 1 trắng / 2 đen, turn, hand: [trắng, đen] quân chưa đặt, plies: số nửa nước đã đi,
  //   quiet: số nửa nước liên tiếp ở giai đoạn đi / bay không ăn quân, reps: khóa các thế từ lần đổi không đảo ngược
  //   được gần nhất (đặt hoặc ăn quân) đến thế hiện tại, last: nước vừa đi, over: null | { winner (0 = hòa), reason } }

  function bitsOf(board) {
    let w = 0;
    let b = 0;
    for (let p = 0; p < N; p++) {
      if (board[p] === WHITE) w |= bit(p);
      else if (board[p] === BLACK) b |= bit(p);
    }
    return { w, b };
  }
  const keyOf = (s) => {
    const { w, b } = bitsOf(s.board);
    return posKey(w, b, s.hand[0], s.turn);
  };
  const count = (board, p) => board.reduce((n, x) => n + (x === p ? 1 : 0), 0);
  /** Quân của bên đi và bên kia dạng bit */
  function sides(s) {
    const { w, b } = bitsOf(s.board);
    return s.turn === WHITE ? { me: w, op: b } : { me: b, op: w };
  }

  /** Kết quả ván tại thế s (null khi chưa xong); xét bên sắp đi */
  function judge(s) {
    const mover = s.turn;
    const other = 3 - mover;
    if (count(s.board, mover) + s.hand[mover - 1] < 3) return { winner: other, reason: 'pieces' };
    const { me, op } = sides(s);
    if (!gen(me, op, s.hand[mover - 1]).length) return { winner: other, reason: 'blocked' };
    if (s.quiet >= QUIET_LIMIT) return { winner: 0, reason: 'fifty' };
    const k = s.reps[s.reps.length - 1];
    if (s.reps.filter((x) => x === k).length >= REP_LIMIT) return { winner: 0, reason: 'repetition' };
    return null;
  }

  function make(board, turn, hand, plies, quiet, reps, last) {
    const s = { board, turn, hand, plies, quiet, reps, last, over: null };
    s.over = judge(s);
    return s;
  }

  function newGame() {
    const board = new Array(N).fill(0);
    return make(board, WHITE, [PIECES, PIECES], 0, 0, [posKey(0, 0, PIECES, WHITE)], null);
  }

  /** Giai đoạn của bên p (mặc định bên đang đi): 'place' | 'move' | 'fly' */
  function phase(s, p) {
    const pl = p || s.turn;
    if (s.hand[pl - 1] > 0) return 'place';
    return count(s.board, pl) === 3 ? 'fly' : 'move';
  }

  function legalMoves(s) {
    if (s.over) return [];
    const { me, op } = sides(s);
    return gen(me, op, s.hand[s.turn - 1]).map(decode);
  }
  const sameMove = (a, b) => a.from === b.from && a.to === b.to && a.remove === b.remove;
  function isLegal(s, m) {
    if (!m || typeof m !== 'object') return false;
    return legalMoves(s).some((x) => sameMove(x, m));
  }

  /** Các điểm quân ở `from` đi tới được (from = -1: các điểm đặt được) */
  function targets(s, from) {
    if (s.over) return [];
    const ph = phase(s);
    if (ph === 'place') return from === -1 ? s.board.map((x, p) => (x ? -1 : p)).filter((p) => p >= 0) : [];
    if (from < 0 || s.board[from] !== s.turn) return [];
    const empty = s.board.map((x, p) => (x ? -1 : p)).filter((p) => p >= 0);
    return ph === 'fly' ? empty : ADJ[from].filter((q) => !s.board[q]);
  }
  /** Các quân của bên đang đi còn nước đi (giai đoạn đi / bay) */
  function movable(s) {
    if (s.over || phase(s) === 'place') return [];
    const out = [];
    s.board.forEach((x, p) => { if (x === s.turn && targets(s, p).length) out.push(p); });
    return out;
  }
  /** Bàn cờ sau khi quân đi from → to (from = -1: đặt), chưa ăn quân */
  function previewBoard(s, from, to) {
    const b = s.board.slice();
    if (from >= 0) b[from] = 0;
    b[to] = s.turn;
    return b;
  }
  /** Bước from → to có lập mill không */
  function formsMill(s, from, to) {
    if (to < 0 || to >= N) return false;
    const { me } = sides(s);
    const rest = from >= 0 ? me & ~bit(from) : me;
    return makesMill(rest | bit(to), to);
  }
  /** Các quân đối thủ ăn được sau bước from → to (rỗng nếu bước đó không lập mill) */
  function removable(s, from, to) {
    if (!formsMill(s, from, to)) return [];
    return listOf(removableMask(sides(s).op));
  }

  /** Đi một nước; trả trạng thái mới, hoặc null nếu nước không hợp lệ / ván đã xong */
  function play(s, m) {
    if (!isLegal(s, m)) return null;
    const me = s.turn;
    const board = s.board.slice();
    if (m.from >= 0) board[m.from] = 0;
    board[m.to] = me;
    if (m.remove >= 0) board[m.remove] = 0;
    const hand = s.hand.slice();
    const placing = m.from < 0;
    if (placing) hand[me - 1]--;
    const turn = 3 - me;
    const irreversible = placing || m.remove >= 0;
    const quiet = irreversible ? 0 : s.quiet + 1;
    const { w, b } = bitsOf(board);
    const k = posKey(w, b, hand[0], turn);
    const reps = irreversible ? [k] : s.reps.concat(k);
    return make(board, turn, hand, s.plies + 1, quiet, reps, { from: m.from, to: m.to, remove: m.remove, by: me });
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (s) => ({ v: VERSION, board: s.board.slice(), turn: s.turn, hand: s.hand.slice(), plies: s.plies, quiet: s.quiet, reps: s.reps.slice(), last: s.last ? Object.assign({}, s.last) : null });

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). Kết quả ván được tính lại. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { board, turn, hand, plies, quiet, reps, last } = raw;
    if (!Array.isArray(board) || board.length !== N || !board.every((x) => x === 0 || x === 1 || x === 2)) return null;
    if (turn !== WHITE && turn !== BLACK) return null;
    if (!Array.isArray(hand) || hand.length !== 2 || !hand.every((h) => isInt(h, 0, PIECES))) return null;
    if (count(board, WHITE) + hand[0] > PIECES || count(board, BLACK) + hand[1] > PIECES) return null;
    // Trắng đặt trước: còn đặt quân thì đến lượt trắng hai bên còn bằng nhau, đến lượt đen thì đen còn hơn 1
    if ((hand[0] || hand[1]) && hand[1] !== hand[0] + (turn === BLACK ? 1 : 0)) return null;
    if (!isInt(plies, 0, 1e7) || !isInt(quiet, 0, QUIET_LIMIT)) return null;
    if (!Array.isArray(reps) || reps.length > 1000 || !reps.every((k) => isInt(k, 0, Number.MAX_SAFE_INTEGER))) return null;
    let lastMove = null;
    if (last != null) {
      if (typeof last !== 'object') return null;
      if (!isInt(last.from, -1, N - 1) || !isInt(last.to, 0, N - 1) || !isInt(last.remove, -1, N - 1) || (last.by !== WHITE && last.by !== BLACK)) return null;
      lastMove = { from: last.from, to: last.to, remove: last.remove, by: last.by };
    }
    const { w, b } = bitsOf(board);
    const k = posKey(w, b, hand[0], turn);
    const r = reps.slice();
    if (r[r.length - 1] !== k) r.push(k); // lịch sử luôn kết thúc bằng thế hiện tại
    return make(board.slice(), turn, hand.slice(), plies, quiet, r, lastMove);
  }

  /* ---------------- Máy ---------------- */

  // Số nước gặp lỗi thời gian: ném ra để thoát khỏi đệ quy
  const ABORT = { abort: true };
  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  /** Điểm theo thế cờ của một bên x (đối thủ y); ghi số "dọa mill thật" vào feat.threats */
  const feat = { threats: 0 };
  function sideScore(x, y, empty, hand) {
    let s = 0;
    let threats = 0;
    const cnt = popcount(x);
    const placing = hand > 0;
    const fly = !placing && cnt === 3;
    const closed = closedMills(x);
    for (let i = 0; i < 16; i++) {
      const m = MILL_MASK[i];
      const mine = x & m;
      if (mine === m) s += 14;
      else if (!(y & m) && popcount(mine) === 2) {
        // Mill mở: hai quân + một điểm trống; là lời dọa thật nếu có quân bước / đặt / bay vào được
        const hole = low(m & ~mine);
        if (placing || fly || ADJ_MASK[hole] & x & ~m) {
          s += 16;
          threats++;
        } else s += 5;
      }
    }
    if (!placing && !fly) {
      let mob = 0;
      let blocked = 0;
      for (let f = x; f; f &= f - 1) {
        const p = low(f);
        const d = ADJ_MASK[p] & empty;
        if (!d) {
          blocked++;
          continue;
        }
        mob += popcount(d);
        // Mill kép: quân trong mill bước ra là lập ngay mill khác, cứ thế đóng mở liên tục
        if (closed & bit(p)) for (let e = d; e; e &= e - 1) if (makesMill((x & ~bit(p)) | bit(low(e)), low(e))) s += 40;
      }
      s += 3 * mob - 8 * blocked;
      if (mob === 0) s -= 400; // hết nước là thua
    }
    feat.threats = threats;
    return s;
  }
  /** Lượng giá theo bên sắp đi */
  function evaluate(me, op, hMe, hOp) {
    const empty = FULL & ~(me | op);
    let s = 120 * (popcount(me) + hMe - popcount(op) - hOp);
    s += sideScore(me, op, empty, hMe);
    const myThreats = feat.threats;
    s -= sideScore(op, me, empty, hOp);
    const opThreats = feat.threats;
    if (myThreats) s += 60; // tới lượt mà có mill sắp thành: gần như chắc ăn được quân
    else if (opThreats >= 2) s -= 70; // đối thủ dọa hai mill một lúc: chỉ chặn được một
    return s;
  }

  /** Điểm sắp xếp nước: nước tốt ở bảng chuyển vị, ăn quân, chặn mill của đối thủ, tạo mill mở */
  function orderScore(c, me, op, ttMove) {
    if (c === ttMove) return 1000000;
    const to = (c >> 5) & 31;
    const f = c & 31;
    let s = 0;
    if (((c >> 10) & 31) !== NONE) s += 10000;
    if (makesMill(op | bit(to), to)) s += 5000; // chiếm điểm đối thủ đang chờ lập mill
    const nm = (f === NONE ? me : me & ~bit(f)) | bit(to);
    const a = MILLS_AT[to];
    for (let i = 0; i < 2; i++) if (!(op & a[i]) && popcount(nm & a[i]) === 2) s += 100;
    if (f !== NONE && makesMill(op | bit(f), f)) s -= 200; // bỏ trống điểm đang chặn mill của đối thủ
    return s;
  }
  function ordered(moves, me, op, ttMove) {
    const keyed = moves.map((c) => (orderScore(c, me, op, ttMove) + 1000) * 32768 + c);
    keyed.sort((a, b) => b - a);
    return keyed.map((k) => k % 32768);
  }

  /** Thế con sau nước c: [me', op', hMe'] (me' là quân của bên vừa đi) */
  function child(c, me, op, hMe) {
    const f = c & 31;
    const to = (c >> 5) & 31;
    const r = (c >> 10) & 31;
    const nm = (f === NONE ? me : me & ~bit(f)) | bit(to);
    const no = r === NONE ? op : op & ~bit(r);
    return [nm, no, f === NONE ? hMe - 1 : hMe];
  }

  const EXACT = 0;
  const LOWER = 1;
  const UPPER = 2;

  function negamax(ctx, me, op, hMe, hOp, side, depth, alpha, beta, ply, quiet) {
    if ((++ctx.nodes & 1023) === 0) {
      const t = now();
      if ((t > ctx.hard && ctx.depth > 1) || (t > ctx.soft && ctx.depth > ctx.minDepth)) throw ABORT;
    }
    if (popcount(me) + hMe < 3) return -WIN + ply;
    const moves = gen(me, op, hMe);
    if (!moves.length) return -WIN + ply;
    if (quiet >= QUIET_LIMIT) return 0;
    const key = side === WHITE ? posKey(me, op, hMe, WHITE) : posKey(op, me, hOp, BLACK);
    const seen = ctx.reps.get(key) || 0;
    if (seen >= REP_LIMIT - 1) return 0; // lần lặp thứ 3
    if (depth <= 0) return evaluate(me, op, hMe, hOp);

    const e = ctx.tt.get(key);
    let ttMove = -1;
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        if (e.flag === EXACT) return e.score;
        if (e.flag === LOWER && e.score >= beta) return e.score;
        if (e.flag === UPPER && e.score <= alpha) return e.score;
      }
    }
    const a0 = alpha;
    let best = -Infinity;
    let bestMove = moves[0];
    ctx.reps.set(key, seen + 1);
    const list = ordered(moves, me, op, ttMove);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const [nm, no, nh] = child(c, me, op, hMe);
      const irreversible = (c & 31) === NONE || ((c >> 10) & 31) !== NONE;
      const v = -negamax(ctx, no, nm, hOp, nh, 3 - side, depth - 1, -beta, -alpha, ply + 1, irreversible ? 0 : quiet + 1);
      if (v > best) {
        best = v;
        bestMove = c;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
    }
    ctx.reps.set(key, seen);
    // Điểm thắng / thua phụ thuộc độ sâu: chỉ giữ nước tốt, không giữ điểm
    if (ctx.tt.size > 400000) ctx.tt.clear();
    if (Math.abs(best) > WIN - 1000) ctx.tt.set(key, { depth: -1, score: 0, flag: EXACT, move: bestMove });
    else ctx.tt.set(key, { depth, score: best, flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, move: bestMove });
    return best;
  }

  /** Mulberry32: PRNG seed được */
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

  /**
   * Chọn nước cho bên đang đi. opts: { level: 'easy'|'medium'|'hard', rng, timeMs, maxDepth }
   * Trả { from, to, remove, depth, score, nodes }.
   */
  function chooseMove(s, opts) {
    const o = opts || {};
    const lv = LEVELS[o.level] || LEVELS.medium;
    const rng = o.rng || Math.random;
    const timeMs = o.timeMs != null ? o.timeMs : lv.timeMs;
    const maxDepth = Math.max(1, Math.min(lv.depth, o.maxDepth || lv.depth));
    const t0 = now();
    const { me, op } = sides(s);
    const side = s.turn;
    const hMe = s.hand[side - 1];
    const hOp = s.hand[2 - side];
    const moves = gen(me, op, hMe);
    if (s.over || !moves.length) return null;
    // Xáo trộn trước khi sắp xếp: các nước ngang điểm được chọn khác nhau giữa các ván
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = moves[i];
      moves[i] = moves[j];
      moves[j] = tmp;
    }
    const pack = (c, extra) => Object.assign(decode(c), extra);
    if (moves.length === 1) return pack(moves[0], { depth: 0, score: 0, nodes: 0 });
    if (lv.mistake && rng() < lv.mistake) return pack(moves[Math.floor(rng() * moves.length)], { depth: 0, score: 0, nodes: 0 });

    // Số lần mỗi thế đã xuất hiện trong ván (gồm cả thế hiện tại) để máy thấy trước hòa do lặp thế
    const reps = new Map();
    s.reps.forEach((k) => reps.set(k, (reps.get(k) || 0) + 1));
    const ctx = {
      tt: new Map(), reps, nodes: 0, depth: 1,
      minDepth: Math.min(lv.minDepth, maxDepth),
      soft: t0 + timeMs,
      hard: t0 + Math.max(timeMs * 3, timeMs + 200),
    };
    const quiet0 = s.quiet;
    const score = (c, depth, alpha, beta) => {
      const [nm, no, nh] = child(c, me, op, hMe);
      const irreversible = (c & 31) === NONE || ((c >> 10) & 31) !== NONE;
      return -negamax(ctx, no, nm, hOp, nh, 3 - side, depth - 1, -beta, -alpha, 1, irreversible ? 0 : quiet0 + 1);
    };

    // Dễ: mỗi nước một điểm đầy đủ ở độ sâu nông, cộng nhiễu rồi lấy nước cao nhất
    if (lv.noise) {
      ctx.depth = maxDepth;
      ctx.minDepth = maxDepth;
      let best = moves[0];
      let bestV = -Infinity;
      moves.forEach((c) => {
        const v = score(c, maxDepth, -Infinity, Infinity) + (rng() * 2 - 1) * lv.noise;
        if (v > bestV) {
          bestV = v;
          best = c;
        }
      });
      return pack(best, { depth: maxDepth, score: Math.round(bestV), nodes: ctx.nodes });
    }

    // Vừa / khó: đào sâu dần, nước tốt nhất của lần trước được xét đầu tiên
    let order = ordered(moves, me, op, -1);
    let result = { move: order[0], score: 0, depth: 0 };
    for (let depth = 1; depth <= maxDepth; depth++) {
      ctx.depth = depth;
      let alpha = -Infinity;
      let bestMove = order[0];
      try {
        for (let i = 0; i < order.length; i++) {
          const v = score(order[i], depth, alpha, Infinity);
          if (v > alpha) {
            alpha = v;
            bestMove = order[i];
          }
        }
      } catch (e) {
        if (e !== ABORT) throw e;
        break; // hết giờ: dùng kết quả của độ sâu trước
      }
      result = { move: bestMove, score: alpha, depth };
      order = [bestMove].concat(order.filter((c) => c !== bestMove));
      if (Math.abs(alpha) > WIN - 1000) break; // đã thấy thắng / thua chắc
      if (depth >= ctx.minDepth && now() - t0 > timeMs * 0.45) break; // độ sâu sau chắc chắn quá giờ
    }
    return pack(result.move, { depth: result.depth, score: result.score, nodes: ctx.nodes });
  }

  return {
    VERSION, WHITE, BLACK, PIECES, QUIET_LIMIT, REP_LIMIT, REASONS, COORDS, MILLS, ADJ, LEVELS,
    newGame, phase, legalMoves, isLegal, targets, movable, previewBoard, formsMill, removable, play, judge,
    toJSON, fromJSON, chooseMove, mulberry32, keyOf,
  };
}

(function (root) {
  const api = CoChinQuanFactory();
  api.factory = CoChinQuanFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
