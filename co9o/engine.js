/* =====================================================================
 * Cờ 9 Ô (Ultimate Tic-Tac-Toe) - Engine
 * Chạy được trong trình duyệt (window.Co9o), trong Node (module.exports)
 * và trong Web Worker (self.Co9o). Không đụng tới DOM.
 *   - Biểu diễn ván: 81 ô, ô m = bàn nhỏ b * 9 + vị trí c trong bàn nhỏ
 *   - Luật: bàn bắt buộc, chọn tự do khi bàn đích đã xong, thắng / hòa bàn nhỏ,
 *     thắng bàn lớn, hòa khi hết nước
 *   - AI: Monte Carlo Tree Search (UCT) có giới hạn thời gian, luôn đi nước
 *     thắng ngay, tránh nước để đối thủ thắng ngay
 *
 * Toàn bộ engine nằm trong hàm Co9oFactory để app.js dựng lại được mã nguồn
 * cho Web Worker qua Co9o.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function Co9oFactory() {
  'use strict';

  const EMPTY = 0;
  const X = 1;
  const O = 2;
  const DRAW = 3; // bàn nhỏ hòa (đầy mà không ai thắng) hoặc cả ván hòa

  // 8 đường thẳng hàng trong lưới 3x3 (dùng cho cả bàn nhỏ lẫn bàn lớn)
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  // Các đường đi qua từng vị trí: chỉ cần xét chúng sau mỗi nước
  const LINES_AT = [];
  for (let i = 0; i < 9; i++) LINES_AT.push(LINES.filter((l) => l.indexOf(i) >= 0));

  // Cấu hình các mức máy. timeMs: thời gian nghĩ; mistake: xác suất đi bừa
  const LEVELS = {
    easy: { label: 'Dễ', timeMs: 200, mistake: 0.3 },
    medium: { label: 'Vừa', timeMs: 800, mistake: 0 },
    hard: { label: 'Khó', timeMs: 2000, mistake: 0 },
  };

  /* ---------------- Trạng thái ván ---------------- */
  // cells[81]: 0 trống, 1 X, 2 O
  // boards[9]: 0 còn mở, 1 X thắng, 2 O thắng, 3 hòa
  // fill[9]: số ô đã đánh trong mỗi bàn nhỏ
  // forced: bàn nhỏ bắt buộc phải đánh, -1 nếu được chọn bất kỳ bàn còn mở
  // winner: 0 đang chơi, 1 X thắng, 2 O thắng, 3 hòa
  function createState() {
    return {
      cells: new Int8Array(81),
      boards: new Int8Array(9),
      fill: new Int8Array(9),
      open: 9, // số bàn nhỏ còn mở
      turn: X,
      forced: -1,
      winner: 0,
      last: -1,
      ply: 0,
    };
  }

  function cloneState(s) {
    return {
      cells: s.cells.slice(),
      boards: s.boards.slice(),
      fill: s.fill.slice(),
      open: s.open,
      turn: s.turn,
      forced: s.forced,
      winner: s.winner,
      last: s.last,
      ply: s.ply,
    };
  }

  // Chép src vào dst có sẵn (không cấp phát, dùng trong vòng lặp MCTS)
  function copyInto(dst, src) {
    dst.cells.set(src.cells);
    dst.boards.set(src.boards);
    dst.fill.set(src.fill);
    dst.open = src.open;
    dst.turn = src.turn;
    dst.forced = src.forced;
    dst.winner = src.winner;
    dst.last = src.last;
    dst.ply = src.ply;
    return dst;
  }

  /* ---------------- Luật ---------------- */
  // Bàn nhỏ b có thể đánh được ở lượt này không
  function boardPlayable(s, b) {
    if (s.winner || s.boards[b] !== EMPTY) return false;
    return s.forced < 0 || s.forced === b;
  }

  // Danh sách nước hợp lệ. out: mảng tùy chọn để ghi vào (trả về số nước)
  function legalMoves(s, out) {
    const res = out || [];
    let n = 0;
    if (!s.winner) {
      const from = s.forced >= 0 ? s.forced : 0;
      const to = s.forced >= 0 ? s.forced : 8;
      for (let b = from; b <= to; b++) {
        if (s.boards[b] !== EMPTY) continue;
        const base = b * 9;
        for (let c = 0; c < 9; c++) if (s.cells[base + c] === EMPTY) res[n++] = base + c;
      }
    }
    if (out) return n;
    return res;
  }

  function isLegal(s, m) {
    if (typeof m !== 'number' || m < 0 || m > 80 || m !== (m | 0)) return false;
    if (s.cells[m] !== EMPTY) return false;
    return boardPlayable(s, (m / 9) | 0);
  }

  // Có đường thẳng hàng nào qua vị trí pos thuộc về p không (arr[off + i])
  function winsAt(arr, off, pos, p) {
    const ls = LINES_AT[pos];
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (arr[off + l[0]] === p && arr[off + l[1]] === p && arr[off + l[2]] === p) return true;
    }
    return false;
  }

  // Đánh nước m (giả định hợp lệ), sửa trực tiếp s
  function play(s, m) {
    const p = s.turn;
    const b = (m / 9) | 0;
    const c = m - b * 9;
    s.cells[m] = p;
    s.fill[b]++;
    if (winsAt(s.cells, b * 9, c, p)) {
      s.boards[b] = p;
      s.open--;
      if (winsAt(s.boards, 0, b, p)) s.winner = p;
    } else if (s.fill[b] === 9) {
      s.boards[b] = DRAW;
      s.open--;
    }
    if (!s.winner && s.open === 0) s.winner = DRAW; // hết nước đi mà không ai có 3 bàn thẳng hàng
    // Vị trí c gửi đối thủ sang bàn nhỏ c; bàn đó đã xong thì được chọn tự do
    s.forced = s.winner || s.boards[c] !== EMPTY ? -1 : c;
    s.turn = 3 - p;
    s.last = m;
    s.ply++;
    return s;
  }

  // Đánh nước m trên bản sao, ném lỗi nếu nước không hợp lệ
  function applyMove(s, m) {
    if (!isLegal(s, m)) throw new Error('Nước đi không hợp lệ: ' + m);
    return play(cloneState(s), m);
  }

  // Dựng lại ván từ danh sách nước (dùng khi khôi phục ván đã lưu, Đi lại, Worker)
  function fromMoves(moves) {
    const s = createState();
    for (let i = 0; i < moves.length; i++) {
      if (!isLegal(s, moves[i])) throw new Error('Nước thứ ' + (i + 1) + ' không hợp lệ: ' + moves[i]);
      play(s, moves[i]);
    }
    return s;
  }

  // Đường thắng trên bàn lớn (3 chỉ số bàn nhỏ) hoặc null
  function bigWinLine(s) {
    if (s.winner !== X && s.winner !== O) return null;
    for (const l of LINES) {
      if (s.boards[l[0]] === s.winner && s.boards[l[1]] === s.winner && s.boards[l[2]] === s.winner) return l.slice();
    }
    return null;
  }

  // Đường thắng trong bàn nhỏ b (3 vị trí 0..8) hoặc null
  function smallWinLine(s, b) {
    const p = s.boards[b];
    if (p !== X && p !== O) return null;
    for (const l of LINES) {
      if (s.cells[b * 9 + l[0]] === p && s.cells[b * 9 + l[1]] === p && s.cells[b * 9 + l[2]] === p) return l.slice();
    }
    return null;
  }

  // Đếm số bàn nhỏ mỗi bên đã thắng
  function countBoards(s) {
    let x = 0, o = 0, d = 0;
    for (let b = 0; b < 9; b++) {
      if (s.boards[b] === X) x++;
      else if (s.boards[b] === O) o++;
      else if (s.boards[b] === DRAW) d++;
    }
    return { x, o, draw: d };
  }

  /* ---------------- Số ngẫu nhiên ---------------- */
  // mulberry32: PRNG có seed để test chạy lặp lại được
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

  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  /* ---------------- Phân tích nhanh ---------------- */
  // Nước thắng cả ván ngay lập tức cho bên đang đi, hoặc -1
  function findImmediateWin(s) {
    const moves = legalMoves(s);
    const p = s.turn;
    const t = createState();
    for (const m of moves) {
      copyInto(t, s);
      play(t, m);
      if (t.winner === p) return m;
    }
    return -1;
  }

  // Các nước không để đối thủ thắng cả ván ngay ở nước sau.
  // Nếu nước nào cũng thua thì trả về toàn bộ nước hợp lệ.
  function safeMoves(s) {
    const moves = legalMoves(s);
    const p = s.turn;
    const t = createState();
    const safe = [];
    for (const m of moves) {
      copyInto(t, s);
      play(t, m);
      if (t.winner || findImmediateWin(t) < 0) safe.push(m);
    }
    return safe.length ? safe : moves;
  }

  /* ---------------- AI: Monte Carlo Tree Search (UCT) ---------------- */
  // Mỗi nút giữ nước dẫn tới nó, bên vừa đi (pjm), số lần thăm và tổng điểm
  // (thắng 1, hòa 0,5) tính theo góc nhìn của pjm.
  function Node(parent, move, pjm) {
    this.parent = parent;
    this.move = move;
    this.pjm = pjm;
    this.children = [];
    this.untried = null; // nước chưa mở rộng, tạo khi nút được chọn lần đầu
    this.visits = 0;
    this.score = 0;
  }

  const UCT_C = 1.25;

  function selectChild(node) {
    const logN = Math.log(node.visits);
    let best = null;
    let bestVal = -Infinity;
    const ch = node.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      const v = c.score / c.visits + UCT_C * Math.sqrt(logN / c.visits);
      if (v > bestVal) { bestVal = v; best = c; }
    }
    return best;
  }

  // Chạy MCTS từ trạng thái s trên tập nước gốc rootMoves.
  // opts: { timeMs, iterations, rng }. Trả về { move, iterations, value }
  function mcts(s, rootMoves, opts) {
    const rng = opts.rng || Math.random;
    const timeMs = opts.timeMs != null ? opts.timeMs : 800;
    // Trần số lượt mô phỏng theo thời gian (~5 lần tốc độ đo được trên máy thường):
    // phòng khi đồng hồ không chạy (môi trường giả lập thời gian) thì vẫn dừng được
    const maxIter = opts.iterations || Math.max(2000, Math.round(timeMs * 250));
    const deadline = now() + timeMs;

    const root = new Node(null, -1, 3 - s.turn);
    root.untried = rootMoves.slice();
    const sim = createState();
    const buf = new Int16Array(81);
    let iter = 0;

    while (iter < maxIter) {
      // Kiểm tra thời gian theo lô để đỡ tốn chi phí gọi đồng hồ
      if ((iter & 31) === 0 && iter > 0 && now() >= deadline) break;
      iter++;
      copyInto(sim, s);
      let node = root;

      // 1. Chọn: đi xuống theo UCT khi nút đã mở rộng hết
      while (node.untried !== null && node.untried.length === 0 && node.children.length > 0) {
        node = selectChild(node);
        play(sim, node.move);
      }

      // 2. Mở rộng: thêm một nút con chưa thử
      if (!sim.winner) {
        if (node.untried === null) node.untried = legalMoves(sim);
        if (node.untried.length > 0) {
          const k = (rng() * node.untried.length) | 0;
          const m = node.untried[k];
          node.untried[k] = node.untried[node.untried.length - 1];
          node.untried.pop();
          const pjm = sim.turn;
          play(sim, m);
          const child = new Node(node, m, pjm);
          node.children.push(child);
          node = child;
        }
      }

      // 3. Mô phỏng: đánh ngẫu nhiên tới hết ván
      while (!sim.winner) {
        const n = legalMoves(sim, buf);
        play(sim, buf[(rng() * n) | 0]);
      }

      // 4. Lan truyền ngược kết quả
      const w = sim.winner;
      while (node !== null) {
        node.visits++;
        if (w === DRAW) node.score += 0.5;
        else if (w === node.pjm) node.score += 1;
        node = node.parent;
      }
    }

    // Chọn nước được thăm nhiều nhất (ổn định hơn chọn tỉ lệ thắng cao nhất)
    let best = null;
    for (const c of root.children) {
      if (!best || c.visits > best.visits || (c.visits === best.visits && c.score > best.score)) best = c;
    }
    const move = best ? best.move : rootMoves[(rng() * rootMoves.length) | 0];
    return { move, iterations: iter, value: best && best.visits ? best.score / best.visits : 0.5 };
  }

  // Chọn nước cho bên đang đi.
  // opts: { level: 'easy'|'medium'|'hard', timeMs, iterations, mistake, seed }
  // Trả về { move, reason, iterations, value, timeMs }
  function chooseMove(s, opts) {
    opts = opts || {};
    const t0 = now();
    const lv = LEVELS[opts.level] || LEVELS.medium;
    const timeMs = opts.timeMs != null ? opts.timeMs : lv.timeMs;
    const mistake = opts.mistake != null ? opts.mistake : lv.mistake;
    const rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const done = (move, reason, extra) => Object.assign({ move, reason, iterations: 0, value: null, timeMs: Math.round(now() - t0) }, extra || {});

    if (s.winner) return done(-1, 'over');
    const all = legalMoves(s);
    if (all.length === 1) return done(all[0], 'only');

    // Mọi mức đều đi ngay nước thắng cả ván
    const win = findImmediateWin(s);
    if (win >= 0) return done(win, 'win');

    const safe = safeMoves(s);
    if (safe.length === 1) return done(safe[0], 'only');

    // Mức Dễ: thỉnh thoảng đi bừa (nhưng vẫn không tự dâng thắng cho đối thủ)
    if (mistake > 0 && rng() < mistake) {
      return done(safe[(rng() * safe.length) | 0], 'random');
    }

    const r = mcts(s, safe, { timeMs: Math.max(10, timeMs - (now() - t0)), iterations: opts.iterations, rng });
    return done(r.move, 'mcts', { iterations: r.iterations, value: r.value });
  }

  return {
    EMPTY, X, O, DRAW, LINES, LEVELS,
    createState, cloneState, copyInto,
    legalMoves, isLegal, boardPlayable, play, applyMove, fromMoves,
    bigWinLine, smallWinLine, countBoards,
    findImmediateWin, safeMoves, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = Co9oFactory();
  api.factory = Co9oFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Co9o = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
