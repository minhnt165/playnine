/* =====================================================================
 * Ô Trống (FreeCell) - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lá là số 0..51 theo cách đánh số của FreeCell cổ điển: lá = (bậc - 1) × 4 + chất,
 *     chất theo thứ tự C D H S (nhép, rô, cơ, bích); đổi sang lá của bộ bài chung bằng toCard / toId
 *   - Chia bài theo thuật toán công khai của "Microsoft FreeCell" (LCG 214013 / 2531011):
 *     ván #1..#32000 trùng với các ván nổi tiếng (ván #11982 không giải được)
 *   - Ván: { deal, cols: 8 cột, cells: 4 ô trống (-1 = trống), found: bậc cao nhất đã lên đích theo chất, hist }
 *   - Mã chồng lá: 't0'..'t7' cột, 'c0'..'c3' ô trống, 'f0'..'f3' ô đích (theo chất C D H S)
 *   - Nước đi { f, t, n }: chuyển n lá từ chồng f sang chồng t; hist là các nhóm nước
 *     (nước của người chơi + các nước tự đưa lên đích theo sau), hoàn tác từng nhóm
 *   - Có solver (tìm kiếm tốt nhất trước, chạy từng phần để không chặn giao diện) dùng cho gợi ý và test
 * ===================================================================== */
(function (root) {
  'use strict';

  const PN = typeof require === 'function' ? require('../_kit/cards.js') : root.PNCards;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const MAX_DEAL = 32000;
  const UNSOLVABLE = [11982]; // ván cổ điển duy nhất trong 1..32000 không giải được
  const SUIT_CH = 'CDHS';
  const MAX_HIST = 4000; // số nhóm nước tối đa trong ván lưu (chống dữ liệu phình to)

  /* ---------------- Lá ---------------- */
  const rankOf = (c) => (c >> 2) + 1;
  const suitOf = (c) => c & 3;
  const isRed = (c) => (c & 3) === 1 || (c & 3) === 2;
  const cardInt = (rank, suit) => (rank - 1) * 4 + suit;
  const toCard = (c) => ({ rank: rankOf(c), suit: SUIT_CH[c & 3] });
  const toId = (c) => PN.toId(toCard(c));
  /** 'AS' -> số lá; chỉ nhận đúng dạng chuẩn ('10H', không nhận 'TH' hay chữ thường), sai trả -1. */
  function fromId(id) {
    const k = PN.fromId(id);
    if (!k || PN.toId(k) !== id) return -1;
    return cardInt(k.rank, SUIT_CH.indexOf(k.suit));
  }
  /** a đặt lên b được ở cột: bậc nhỏ hơn đúng 1, khác màu. */
  const fits = (a, b) => rankOf(b) === rankOf(a) + 1 && isRed(a) !== isRed(b);

  /* ---------------- Chia bài ---------------- */

  /** Thứ tự 52 lá của ván số n (lá thứ i vào cột i % 8), đúng như FreeCell cổ điển. */
  function dealOrder(n) {
    let seed = n >>> 0;
    const rnd = () => {
      seed = (seed * 214013 + 2531011) % 2147483648;
      return Math.floor(seed / 65536);
    };
    const t = [];
    for (let i = 0; i < 52; i++) t[i] = 51 - i;
    for (let i = 0; i < 51; i++) {
      const j = 51 - (rnd() % (52 - i));
      const x = t[i];
      t[i] = t[j];
      t[j] = x;
    }
    return t;
  }

  const validDeal = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_DEAL;

  /** Ván mới số n: 8 cột 7,7,7,7,6,6,6,6 lá, mọi lá ngửa. */
  function newGame(n) {
    if (!validDeal(n)) throw new Error('newGame: số ván phải là số nguyên 1..' + MAX_DEAL);
    const cols = [[], [], [], [], [], [], [], []];
    dealOrder(n).forEach((c, i) => cols[i % 8].push(c));
    return { deal: n, cols, cells: [-1, -1, -1, -1], found: [0, 0, 0, 0], hist: [] };
  }

  /** Số ván ngẫu nhiên 1..32000, bỏ các ván không giải được. rand: hàm [0, 1). */
  function randomDeal(rand) {
    const r = rand || Math.random;
    for (;;) {
      const n = 1 + Math.floor(r() * MAX_DEAL);
      if (UNSOLVABLE.indexOf(n) < 0) return n;
    }
  }

  /* ---------------- Trạng thái ---------------- */

  const clone = (s) => ({ deal: s.deal, cols: s.cols.map((c) => c.slice()), cells: s.cells.slice(), found: s.found.slice(), hist: s.hist });
  const freeCells = (s) => s.cells.reduce((k, c) => k + (c < 0 ? 1 : 0), 0);
  const emptyCols = (s) => s.cols.reduce((k, c) => k + (c.length ? 0 : 1), 0);
  const foundCount = (s) => s.found[0] + s.found[1] + s.found[2] + s.found[3];
  const isWon = (s) => foundCount(s) === 52;

  /** 'tN' | 'cN' | 'fN' -> { k, i }; sai trả null. */
  function parsePile(id) {
    const m = /^([tcf])([0-7])$/.exec(id);
    if (!m) return null;
    const i = +m[2];
    if (m[1] !== 't' && i > 3) return null;
    return { k: m[1], i };
  }

  /** Các lá của chồng (cột: dưới lên trên; ô trống: 0 hoặc 1 lá; đích: A..lá trên cùng). */
  function pile(s, id) {
    const p = parsePile(id);
    if (!p) return [];
    if (p.k === 't') return s.cols[p.i].slice();
    if (p.k === 'c') return s.cells[p.i] < 0 ? [] : [s.cells[p.i]];
    const out = [];
    for (let r = 1; r <= s.found[p.i]; r++) out.push(cardInt(r, p.i));
    return out;
  }

  /** Số lá trên cùng của cột tạo thành dãy hợp lệ (giảm dần, xen màu). */
  function runLength(col) {
    if (!col.length) return 0;
    let n = 1;
    for (let i = col.length - 1; i > 0 && fits(col[i], col[i - 1]); i--) n++;
    return n;
  }

  /** Số lá chuyển được một lần: (ô trống + 1) × 2^(cột trống); chuyển vào cột trống thì cột đó không tính. */
  function maxMove(s, toEmpty) {
    const e = emptyCols(s) - (toEmpty ? 1 : 0);
    return (freeCells(s) + 1) * Math.pow(2, Math.max(0, e));
  }

  /** Lá dưới cùng của nhóm sẽ chuyển (lá đặt xuống đích), -1 nếu không có. */
  function movingCard(s, m) {
    const p = parsePile(m.f);
    if (!p) return -1;
    if (p.k === 't') {
      const col = s.cols[p.i];
      return m.n >= 1 && m.n <= col.length ? col[col.length - m.n] : -1;
    }
    if (p.k === 'c') return m.n === 1 ? s.cells[p.i] : -1;
    return -1;
  }

  /** Nước đi có hợp luật không (kể cả giới hạn chuyển nhiều lá). */
  function canMove(s, m) {
    if (!m || typeof m !== 'object' || !Number.isInteger(m.n) || m.n < 1) return false;
    const a = parsePile(m.f);
    const b = parsePile(m.t);
    if (!a || !b || a.k === 'f' || m.f === m.t) return false;
    if (a.k === 't' && m.n > runLength(s.cols[a.i])) return false;
    const c = movingCard(s, m);
    if (c < 0) return false;
    if (b.k === 'f') return m.n === 1 && suitOf(c) === b.i && s.found[b.i] === rankOf(c) - 1;
    if (b.k === 'c') return m.n === 1 && a.k !== 'c' && s.cells[b.i] < 0;
    const dst = s.cols[b.i];
    if (!dst.length) return m.n <= maxMove(s, true);
    return fits(c, dst[dst.length - 1]) && m.n <= maxMove(s, false);
  }

  /** Chuyển n lá từ f sang t, không kiểm luật (dùng sau canMove và khi hoàn tác). Trả ván mới. */
  function transfer(s, f, t, n) {
    const x = clone(s);
    const a = parsePile(f);
    const b = parsePile(t);
    let cards;
    if (a.k === 't') cards = x.cols[a.i].splice(x.cols[a.i].length - n, n);
    else if (a.k === 'c') {
      cards = [x.cells[a.i]];
      x.cells[a.i] = -1;
    } else {
      cards = [cardInt(x.found[a.i], a.i)];
      x.found[a.i]--;
    }
    if (b.k === 't') x.cols[b.i].push.apply(x.cols[b.i], cards);
    else if (b.k === 'c') x.cells[b.i] = cards[0];
    else x.found[b.i] = rankOf(cards[0]);
    return x;
  }

  /** Đi một nước (không ghi lịch sử); sai luật trả null. */
  function move(s, m) {
    return canMove(s, m) ? transfer(s, m.f, m.t, m.n) : null;
  }

  /**
   * Lá c lên đích có an toàn không: A, 2 luôn an toàn; lá khác an toàn khi hai chất khác màu
   * đã lên tới bậc c - 1 (không còn lá nào cần đặt lên c nữa).
   */
  function isSafe(s, c) {
    const r = rankOf(c);
    if (s.found[suitOf(c)] !== r - 1) return false;
    if (r <= 2) return true;
    const opp = isRed(c) ? [0, 3] : [1, 2];
    return s.found[opp[0]] >= r - 1 && s.found[opp[1]] >= r - 1;
  }

  /** Một nước tự đưa lá an toàn lên đích (ô trống trước, rồi các cột), không có trả null. */
  function safeAutoMove(s) {
    for (let i = 0; i < 4; i++) {
      const c = s.cells[i];
      if (c >= 0 && isSafe(s, c)) return { f: 'c' + i, t: 'f' + suitOf(c), n: 1 };
    }
    for (let i = 0; i < 8; i++) {
      const col = s.cols[i];
      if (col.length && isSafe(s, col[col.length - 1])) return { f: 't' + i, t: 'f' + suitOf(col[col.length - 1]), n: 1 };
    }
    return null;
  }

  /** Đưa hết lá an toàn lên đích: { state, moves }. */
  function autoMoves(s) {
    const moves = [];
    let x = s;
    for (let m = safeAutoMove(x); m; m = safeAutoMove(x)) {
      x = transfer(x, m.f, m.t, m.n);
      moves.push(m);
    }
    return { state: x, moves };
  }

  /**
   * Nước của người chơi: kiểm luật, đi, rồi (nếu opts.auto, mặc định bật) tự đưa lá an toàn lên đích.
   * Ghi cả nhóm vào hist để hoàn tác một lần. Sai luật trả null.
   */
  function play(s, m, opts) {
    if (!canMove(s, m)) return null;
    let x = transfer(s, m.f, m.t, m.n);
    const group = [{ f: m.f, t: m.t, n: m.n }];
    if (!opts || opts.auto !== false) {
      const a = autoMoves(x);
      x = a.state;
      group.push.apply(group, a.moves);
    }
    x.hist = s.hist.concat([group]);
    return x;
  }

  /** Đi một nhóm nước có sẵn (ví dụ "xếp nốt"), ghi thành một nhóm. Nước nào sai luật thì trả null. */
  function playGroup(s, moves) {
    let x = s;
    for (let i = 0; i < moves.length; i++) {
      x = move(x, moves[i]);
      if (!x) return null;
    }
    if (x === s) return s;
    x.hist = s.hist.concat([moves.map((m) => ({ f: m.f, t: m.t, n: m.n }))]);
    return x;
  }

  /** Hoàn tác nhóm nước gần nhất (không giới hạn số lần). Không còn gì để hoàn tác thì trả lại s. */
  function undo(s) {
    if (!s.hist.length) return s;
    const group = s.hist[s.hist.length - 1];
    let x = s;
    for (let i = group.length - 1; i >= 0; i--) x = transfer(x, group[i].t, group[i].f, group[i].n);
    x.hist = s.hist.slice(0, -1);
    return x;
  }

  /** Mọi nước hợp luật (bỏ nước ô trống -> ô trống vì vô nghĩa; cột trống / ô trống chỉ xét cái đầu tiên). */
  function legalMoves(s) {
    const out = [];
    const firstEmpty = s.cols.findIndex((c) => !c.length);
    const firstCell = s.cells.indexOf(-1);
    const tryAdd = (m) => { if (canMove(s, m)) out.push(m); };
    for (let i = 0; i < 4; i++) {
      const c = s.cells[i];
      if (c < 0) continue;
      tryAdd({ f: 'c' + i, t: 'f' + suitOf(c), n: 1 });
      for (let j = 0; j < 8; j++) if (s.cols[j].length || j === firstEmpty) tryAdd({ f: 'c' + i, t: 't' + j, n: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const col = s.cols[i];
      if (!col.length) continue;
      const top = col[col.length - 1];
      tryAdd({ f: 't' + i, t: 'f' + suitOf(top), n: 1 });
      if (firstCell >= 0) out.push({ f: 't' + i, t: 'c' + firstCell, n: 1 });
      const run = runLength(col);
      for (let j = 0; j < 8; j++) {
        if (j === i) continue;
        const dst = s.cols[j];
        if (dst.length) {
          // cột có lá: số lá phải chuyển là cố định (lá dưới cùng của nhóm khớp lá trên cùng của đích)
          const n = rankOf(dst[dst.length - 1]) - rankOf(top);
          if (n >= 1 && n <= run) tryAdd({ f: 't' + i, t: 't' + j, n });
        } else if (j === firstEmpty) {
          for (let n = Math.min(run, maxMove(s, true)); n >= 1; n--) if (n < col.length) out.push({ f: 't' + i, t: 't' + j, n });
        }
      }
    }
    return out;
  }

  /**
   * Chạm một lá: tìm chỗ tốt nhất cho n lá trên cùng của chồng from.
   * Thứ tự: đích -> cột có lá -> cột trống -> ô trống. Không có chỗ trả null.
   */
  function tapTarget(s, from, n) {
    const a = parsePile(from);
    if (!a || a.k === 'f') return null;
    const c = movingCard(s, { f: from, n });
    if (c < 0) return null;
    const cand = [];
    if (n === 1) cand.push({ f: from, t: 'f' + suitOf(c), n });
    for (let j = 0; j < 8; j++) if (s.cols[j].length) cand.push({ f: from, t: 't' + j, n });
    // cột trống: không chuyển cả cột sang cột trống (vô nghĩa)
    const whole = a.k === 't' && n === s.cols[a.i].length;
    if (!whole) for (let j = 0; j < 8; j++) if (!s.cols[j].length) cand.push({ f: from, t: 't' + j, n });
    if (n === 1 && a.k === 't') for (let j = 0; j < 4; j++) cand.push({ f: from, t: 'c' + j, n });
    for (let i = 0; i < cand.length; i++) if (canMove(s, cand[i])) return cand[i];
    return null;
  }

  /** Mọi cột đã xếp giảm dần từ dưới lên: xếp nốt chắc chắn được (lá nhỏ nhất luôn lên đích được). */
  function canFinish(s) {
    if (isWon(s)) return false;
    return s.cols.every((col) => {
      for (let i = 1; i < col.length; i++) if (rankOf(col[i]) > rankOf(col[i - 1])) return false;
      return true;
    });
  }

  /** Các nước xếp nốt lên đích (khi canFinish): mỗi lần đưa lá bậc nhỏ nhất đang lộ ra. Kẹt thì trả null. */
  function finishMoves(s) {
    const moves = [];
    let x = s;
    while (!isWon(x)) {
      let best = null;
      let bestRank = 99;
      const consider = (from, c) => {
        if (c >= 0 && x.found[suitOf(c)] === rankOf(c) - 1 && rankOf(c) < bestRank) {
          bestRank = rankOf(c);
          best = { f: from, t: 'f' + suitOf(c), n: 1 };
        }
      };
      x.cells.forEach((c, i) => consider('c' + i, c));
      x.cols.forEach((col, i) => { if (col.length) consider('t' + i, col[col.length - 1]); });
      if (!best) return null;
      moves.push(best);
      x = transfer(x, best.f, best.t, best.n);
    }
    return moves;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const encMove = (m) => m.f + m.t + m.n;
  function decMove(str) {
    const k = /^([tcf][0-7])([tcf][0-7])(\d{1,2})$/.exec(str);
    return k ? { f: k[1], t: k[2], n: +k[3] } : null;
  }

  /** Ván lưu chỉ gồm số ván và lịch sử nước đi; khôi phục bằng cách chơi lại từ đầu. */
  const toJSON = (s) => ({ v: VERSION, deal: s.deal, hist: s.hist.map((g) => g.map(encMove)) });

  /** Ván lưu hỏng, khác phiên bản hoặc có nước sai luật thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !validDeal(raw.deal)) return null;
    if (!Array.isArray(raw.hist) || raw.hist.length > MAX_HIST) return null;
    let s = newGame(raw.deal);
    const hist = [];
    for (let g = 0; g < raw.hist.length; g++) {
      const group = raw.hist[g];
      if (!Array.isArray(group) || !group.length || group.length > 60) return null;
      const moves = [];
      for (let i = 0; i < group.length; i++) {
        const m = typeof group[i] === 'string' ? decMove(group[i]) : null;
        if (!m) return null;
        s = move(s, m);
        if (!s) return null;
        moves.push(m);
      }
      hist.push(moves);
    }
    s.hist = hist;
    return s;
  }

  /* ---------------- Solver ---------------- */

  /** Khóa trạng thái bỏ thứ tự cột và ô trống (hai ván chỉ khác thứ tự cột là một). */
  function canonKey(s) {
    const cols = s.cols.map((c) => String.fromCharCode.apply(null, c.map((x) => x + 48)));
    cols.sort();
    const cells = s.cells.filter((c) => c >= 0).sort((a, b) => a - b);
    return cols.join('|') + '#' + String.fromCharCode.apply(null, cells.map((x) => x + 48));
  }

  /** Khóa trạng thái đúng vị trí (dùng để dò lại kế hoạch gợi ý). */
  const exactKey = (s) => s.cols.map((c) => c.join(',')).join('|') + '#' + s.cells.join(',');

  /**
   * Ước lượng độ xa đích (càng nhỏ càng gần):
   *   - số lá chưa lên đích
   *   - số lá đè lên một lá bậc nhỏ hơn nằm dưới nó trong cùng cột (phải dời đi trước)
   *   - số lá đè lên lá kế tiếp cần lên đích của mỗi chất
   *   - ô trống đang bị chiếm, thiếu cột trống
   */
  function heuristic(s) {
    let blockers = 0;
    let depth = 0;
    for (let i = 0; i < 8; i++) {
      const col = s.cols[i];
      let minR = 99;
      for (let j = 0; j < col.length; j++) {
        const c = col[j];
        const r = rankOf(c);
        if (r > minR) blockers++;
        else minR = r;
        if (s.found[suitOf(c)] === r - 1) depth += col.length - 1 - j;
      }
    }
    return (52 - foundCount(s)) + blockers * 3 + depth + (4 - freeCells(s)) - emptyCols(s) * 3;
  }

  /** Hàng đợi ưu tiên (đống nhị phân), phần tử [ưu tiên, thứ tự, giá trị]; ưu tiên bằng nhau thì vào sau ra trước. */
  function Heap() {
    const a = [];
    const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] > y[1]);
    return {
      get size() { return a.length; },
      push(x) {
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (!less(a[i], a[p])) break;
          const t = a[i];
          a[i] = a[p];
          a[p] = t;
          i = p;
        }
      },
      pop() {
        const top = a[0];
        const last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            const t = a[i];
            a[i] = a[m];
            a[m] = t;
            i = m;
          }
        }
        return top;
      },
    };
  }

  /** Nước ứng viên cho solver: như legalMoves nhưng bỏ nước phá dãy vô cớ (dời nhóm đang nằm đúng chỗ sang cột trống). */
  function solverMoves(s) {
    return legalMoves(s).filter((m) => {
      if (m.f[0] !== 't' || m.t[0] !== 't' || s.cols[+m.t[1]].length) return true;
      const col = s.cols[+m.f[1]];
      return !(col.length > m.n && fits(col[col.length - m.n], col[col.length - m.n - 1]));
    });
  }

  /**
   * Một lượt tìm kiếm tốt nhất trước với trọng số đường đi gw (ưu tiên = ước lượng + gw × số nước), tối đa maxNodes nút.
   * Trả { step(budget) -> { done, moves, nodes } }.
   */
  function search(start, gw, maxNodes) {
    const heap = Heap();
    const seen = new Set();
    let expanded = 0;
    let seq = 0;
    let result;
    const first = autoMoves(clone(start));
    first.state.hist = [];
    seen.add(canonKey(first.state));
    heap.push([heuristic(first.state), seq++, { s: first.state, parent: null, moves: first.moves, g: 0 }]);

    function path(node) {
      const groups = [];
      for (let n = node; n; n = n.parent) groups.push(n.moves);
      const out = [];
      for (let i = groups.length - 1; i >= 0; i--) out.push.apply(out, groups[i]);
      return out;
    }

    function step(budget) {
      if (result !== undefined) return { done: true, moves: result, nodes: expanded };
      let left = budget;
      while (left-- > 0) {
        if (!heap.size || expanded >= maxNodes) {
          result = null;
          return { done: true, moves: null, nodes: expanded };
        }
        const node = heap.pop()[2];
        if (isWon(node.s)) {
          result = path(node);
          return { done: true, moves: result, nodes: expanded };
        }
        expanded++;
        const cand = solverMoves(node.s);
        for (let i = 0; i < cand.length; i++) {
          const m = cand[i];
          const a = autoMoves(transfer(node.s, m.f, m.t, m.n));
          const k = canonKey(a.state);
          if (seen.has(k)) continue;
          seen.add(k);
          const child = { s: a.state, parent: node, moves: [m].concat(a.moves), g: node.g + 1 };
          heap.push([heuristic(a.state) + child.g * gw, seq++, child]);
        }
        node.s = null; // nút đã mở chỉ cần giữ nước đi và nút cha (đỡ tốn bộ nhớ)
      }
      return { done: false, moves: null, nodes: expanded };
    }
    return { step };
  }

  // Các lượt thử lần lượt: [trọng số đường đi, số nút tối đa]. Ván khó với trọng số này thường dễ với trọng số khác.
  const ATTEMPTS = [[1, 40000], [0.3, 40000], [2, 80000], [1, 250000]];

  /**
   * Solver chạy từng phần: createSolver(state, { attempts }) -> { step(nodes) }.
   *   step(nodes) mở tối đa `nodes` trạng thái rồi trả { done, moves, nodes }:
   *   done false: chưa xong (gọi tiếp); moves: mảng nước (kể cả nước tự lên đích) dẫn tới thắng, null nếu bó tay.
   * Lời giải chỉ gồm nước hợp luật theo canMove (giới hạn chuyển nhiều lá); sau mỗi nước tự đưa lá an toàn lên đích.
   */
  function createSolver(start, opts) {
    const attempts = (opts && opts.attempts) || ATTEMPTS;
    let k = 0;
    let cur = search(start, attempts[0][0], attempts[0][1]);
    let before = 0; // số nút của các lượt thử trước
    let last = null;
    function step(budget) {
      if (last) return last;
      const r = cur.step(budget || 2000);
      const nodes = before + r.nodes;
      if (!r.done) return { done: false, moves: null, nodes };
      if (r.moves || k + 1 >= attempts.length) {
        last = { done: true, moves: r.moves, nodes };
        return last;
      }
      // lượt này bó tay: thử trọng số kế tiếp
      before = nodes;
      k++;
      cur = search(start, attempts[k][0], attempts[k][1]);
      return { done: false, moves: null, nodes };
    }
    return { step };
  }

  /** Giải một mạch (dùng trong test): trả mảng nước hoặc null. */
  function solve(s, opts) {
    const sv = createSolver(s, opts);
    for (;;) {
      const r = sv.step(5000);
      if (r.done) return r.moves;
    }
  }

  const api = {
    VERSION, MAX_DEAL, UNSOLVABLE, SUIT_CH,
    rankOf, suitOf, isRed, toCard, toId, fromId, fits,
    dealOrder, newGame, randomDeal, validDeal,
    pile, parsePile, runLength, freeCells, emptyCols, foundCount, maxMove, canMove, move, play, playGroup, undo,
    isSafe, safeAutoMove, autoMoves, legalMoves, tapTarget, canFinish, finishMoves, isWon,
    toJSON, fromJSON, exactKey, canonKey, createSolver, solve,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
