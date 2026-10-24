/* =====================================================================
 * Cờ Vây (Go) - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong
 *   Web Worker: toàn bộ engine nằm trong hàm GoFactory để app.js dựng lại mã nguồn
 *   cho worker qua GameEngine.factory.toString() (chạy được cả khi mở bằng file://).
 *
 * Bàn n × n (n = 9 hoặc 13), điểm = r * n + c (r hàng tính từ trên, c cột tính từ trái).
 *   - Đen (BLACK = 1) đi trước, Trắng (WHITE = 2) được komi 6,5
 *   - Một nhóm hết khí thì bị bắt; đặt quân làm nhóm mình hết khí mà không bắt được gì là tự sát (cấm)
 *   - Ko: siêu ko theo thế cờ (positional superko): cấm mọi nước tạo lại một thế cờ đã có trong ván.
 *     Bao luôn ko đơn, và chặn cả các vòng lặp hiếm (ko ba, ko bốn…) để ván không bao giờ lặp vô tận
 *   - Bỏ lượt (PASS = -1); hai lần bỏ lượt liên tiếp thì hết ván
 *   - Tính điểm khu vực (luật Trung Quốc / Tromp-Taylor): quân trên bàn + điểm trống chỉ giáp một màu.
 *     Không đánh dấu quân chết: quân còn trên bàn đều tính là sống, nên phải bắt hết quân chết trước khi bỏ lượt
 *     (luật khu vực không phạt việc đi vào đất mình, nên bắt quân chết không mất điểm)
 *   - Đầu hàng: resign(g, màu)
 *   - Máy: MCTS nhẹ (UCT, Vừa / Khó thêm RAVE), mô phỏng ngẫu nhiên không lấp mắt mình;
 *     Vừa / Khó ưu tiên bắt nhóm bị atari và cứu nhóm mình bị atari trong mô phỏng.
 *     Dễ ít mô phỏng, mô phỏng ngẫu nhiên thuần. Chạy được từng khúc (search.run) cho Web Worker / setTimeout.
 * ===================================================================== */
function GoFactory() {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2, EDGE = 4; // viền = 4 để phép OR các điểm kề rồi & 3 không lẫn với màu
  const PASS = -1;
  const RESIGN = -2;
  const SIZES = [9, 13];
  const LEVELS = ['easy', 'medium', 'hard'];
  const KOMI = 6.5;
  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const LETTERS = 'ABCDEFGHJKLMNOPQRST'; // tọa độ cờ vây bỏ chữ I

  /* ---------------- Hình học (lưu sẵn theo cỡ) ---------------- */
  const geoCache = {};
  function geo(n) {
    if (geoCache[n]) return geoCache[n];
    const N = n * n;
    const adj = [];
    for (let i = 0; i < N; i++) {
      const r = (i / n) | 0, c = i % n;
      const a = [];
      if (r > 0) a.push(i - n);
      if (c > 0) a.push(i - 1);
      if (c < n - 1) a.push(i + 1);
      if (r < n - 1) a.push(i + n);
      adj.push(a);
    }
    return (geoCache[n] = { n, N, adj });
  }

  /** Điểm sao (hoshi): 9×9 ở dòng 3 và tâm, 13×13 ở dòng 4 và tâm. */
  function hoshi(n) {
    const e = n >= 13 ? 3 : 2, f = n - 1 - e, m = (n - 1) / 2;
    return [[e, e], [e, f], [f, e], [f, f], [m, m]].map(([r, c]) => r * n + c);
  }

  /** Tên điểm kiểu cờ vây: chữ là cột (bỏ I), số là hàng tính từ dưới lên (A1 ở góc dưới trái). */
  const pointName = (i, n) => LETTERS[i % n] + (n - ((i / n) | 0));

  /* ---------------- Luật trên bàn thường (dùng cho ván thật) ---------------- */
  const keyOf = (board) => board.join('');

  /** Nhóm chứa điểm i: { stones, libs (Set các khí) }. */
  function chainAt(board, n, i) {
    const { adj } = geo(n);
    const col = board[i];
    const stones = [i];
    const seen = new Set(stones);
    const libs = new Set();
    for (let k = 0; k < stones.length; k++) {
      for (const j of adj[stones[k]]) {
        const v = board[j];
        if (v === EMPTY) libs.add(j);
        else if (v === col && !seen.has(j)) {
          seen.add(j);
          stones.push(j);
        }
      }
    }
    return { stones, libs };
  }

  function newGame(opts) {
    const o = opts || {};
    const n = SIZES.indexOf(o.n) >= 0 ? o.n : 9;
    const komi = typeof o.komi === 'number' && isFinite(o.komi) ? o.komi : KOMI;
    const board = new Array(n * n).fill(EMPTY);
    return { n, komi, board, turn: BLACK, moves: [], caps: [0, 0, 0], passes: 0, last: -1, seen: new Set([keyOf(board)]), over: false, result: null };
  }

  /**
   * Thử đặt quân của bên tới lượt ở điểm i.
   * Trả { board, captured, key } nếu hợp lệ, hoặc { error: 'over' | 'range' | 'occupied' | 'suicide' | 'ko' }.
   */
  function tryMove(g, i) {
    if (g.over) return { error: 'over' };
    if (!Number.isInteger(i) || i < 0 || i >= g.board.length) return { error: 'range' };
    if (g.board[i] !== EMPTY) return { error: 'occupied' };
    const n = g.n, me = g.turn, opp = 3 - me;
    const { adj } = geo(n);
    const b = g.board.slice();
    b[i] = me;
    let captured = 0;
    for (const j of adj[i]) {
      if (b[j] !== opp) continue;
      const ch = chainAt(b, n, j);
      if (ch.libs.size) continue;
      for (const s of ch.stones) b[s] = EMPTY;
      captured += ch.stones.length;
    }
    if (!captured && !chainAt(b, n, i).libs.size) return { error: 'suicide' };
    const key = keyOf(b);
    if (g.seen.has(key)) return { error: 'ko' };
    return { board: b, captured, key };
  }

  const isLegal = (g, m) => !g.over && (m === PASS || !tryMove(g, m).error);

  function legalMoves(g) {
    if (g.over) return [];
    const out = [];
    for (let i = 0; i < g.board.length; i++) if (g.board[i] === EMPTY && !tryMove(g, i).error) out.push(i);
    out.push(PASS);
    return out;
  }

  /** Đi nước m (điểm hoặc PASS). Trả trạng thái mới, hoặc null nếu sai luật / ván đã xong. */
  function play(g, m) {
    if (!g || g.over) return null;
    const me = g.turn;
    if (m === PASS) {
      const ng = { n: g.n, komi: g.komi, board: g.board, turn: 3 - me, moves: g.moves.concat(PASS), caps: g.caps, passes: g.passes + 1, last: -1, seen: g.seen, over: false, result: null };
      if (ng.passes >= 2) {
        ng.over = true;
        ng.result = scoreResult(ng);
      }
      return ng;
    }
    const r = tryMove(g, m);
    if (r.error) return null;
    const caps = g.caps.slice();
    caps[me] += r.captured;
    const seen = new Set(g.seen);
    seen.add(r.key);
    return { n: g.n, komi: g.komi, board: r.board, turn: 3 - me, moves: g.moves.concat(m), caps, passes: 0, last: m, seen, over: false, result: null };
  }

  /** Bên `color` đầu hàng. */
  function resign(g, color) {
    if (!g || g.over) return null;
    const c = color === WHITE ? WHITE : BLACK;
    return Object.assign({}, g, { over: true, result: { reason: 'resign', winner: 3 - c, resigned: c } });
  }

  /**
   * Tính điểm khu vực (Tromp-Taylor): quân + điểm trống chỉ giáp một màu (cả vùng trống liền nhau).
   * Trả { black, white, komi, owner (mảng 0/1/2 theo điểm), regions: [{ pts, owner }], winner, margin }.
   * Điểm Trắng chưa cộng komi; winner so Đen với Trắng + komi.
   */
  function areaScore(board, n, komi) {
    const { adj } = geo(n);
    const N = n * n;
    const owner = new Array(N).fill(EMPTY);
    const regions = [];
    let black = 0, white = 0;
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const v = board[i];
      if (v === BLACK) {
        black++;
        owner[i] = BLACK;
      } else if (v === WHITE) {
        white++;
        owner[i] = WHITE;
      } else if (!seen[i]) {
        // loang vùng trống, ghi các màu giáp ranh
        const pts = [i];
        seen[i] = 1;
        let touch = 0;
        for (let k = 0; k < pts.length; k++) {
          for (const j of adj[pts[k]]) {
            const w = board[j];
            if (w === EMPTY) {
              if (!seen[j]) {
                seen[j] = 1;
                pts.push(j);
              }
            } else touch |= w;
          }
        }
        const o = touch === BLACK || touch === WHITE ? touch : EMPTY;
        if (o === BLACK) black += pts.length;
        else if (o === WHITE) white += pts.length;
        if (o) for (const p of pts) owner[p] = o;
        regions.push({ pts, owner: o });
      }
    }
    const k = typeof komi === 'number' ? komi : KOMI;
    const diff = black - (white + k);
    return { black, white, komi: k, owner, regions, winner: diff > 0 ? BLACK : diff < 0 ? WHITE : EMPTY, margin: Math.abs(diff) };
  }

  function scoreResult(g) {
    const s = areaScore(g.board, g.n, g.komi);
    return { reason: 'score', winner: s.winner, black: s.black, white: s.white, komi: s.komi, margin: s.margin };
  }
  const score = (g) => areaScore(g.board, g.n, g.komi);

  /**
   * Thế cờ "đã xong": cả hai màu đều có quân, mọi vùng trống chỉ giáp đúng một màu và không quá lớn
   * (≤ 1/4 bàn; vùng lớn hơn vẫn có thể bị vào), không nhóm nào chỉ còn một khí.
   * Khi đó máy bỏ lượt thay vì lấp đất của mình.
   */
  function isSettled(g) {
    let hasB = false, hasW = false;
    for (const v of g.board) {
      if (v === BLACK) hasB = true;
      else if (v === WHITE) hasW = true;
    }
    if (!hasB || !hasW) return false;
    const s = areaScore(g.board, g.n, g.komi);
    const maxRegion = Math.floor((g.n * g.n) / 4);
    for (const r of s.regions) if (!r.owner || r.pts.length > maxRegion) return false;
    const done = new Uint8Array(g.board.length);
    for (let i = 0; i < g.board.length; i++) {
      if (g.board[i] === EMPTY || done[i]) continue;
      const ch = chainAt(g.board, g.n, i);
      for (const st of ch.stones) done[st] = 1;
      if (ch.libs.size < 2) return false;
    }
    return true;
  }

  /** Máy (bên tới lượt) có bỏ lượt ở thế này không: thế đã xong, hoặc đối thủ vừa bỏ lượt và tính ngay thì máy thắng. */
  function aiWouldPass(g) {
    if (g.over) return false;
    if (isSettled(g)) return true;
    return g.passes >= 1 && score(g).winner === g.turn;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (g) => ({ v: VERSION, n: g.n, komi: g.komi, moves: g.moves.slice() });

  /** Ván lưu hỏng, khác phiên bản hoặc có nước sai luật thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (SIZES.indexOf(raw.n) < 0) return null;
    if (typeof raw.komi !== 'number' || !isFinite(raw.komi) || Math.abs(raw.komi) > 50 || (raw.komi * 2) % 1 !== 0) return null;
    if (!Array.isArray(raw.moves) || raw.moves.length > raw.n * raw.n * 4) return null;
    let g = newGame({ n: raw.n, komi: raw.komi });
    for (const m of raw.moves) {
      if (!Number.isInteger(m) || g.over) return null;
      g = play(g, m);
      if (!g) return null;
    }
    return g;
  }

  /* ---------------- PRNG ---------------- */
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

  /* =====================================================================
   * Bàn nhanh cho mô phỏng (MCTS)
   *   Bàn có viền: rộng W = n + 2, điểm p = (r + 1) * W + (c + 1), viền mang giá trị EDGE.
   *   Nhóm quân là danh sách vòng (next) với đầu nhóm (head). Mỗi nhóm giữ "khí giả"
   *   (đếm theo cặp quân–điểm trống kề): số lượng lc, tổng ls, tổng bình phương lq.
   *   Nhóm chỉ còn một khí thật khi ls² = lc · lq (mọi khí giả trùng một điểm), khí đó là ls / lc.
   *   Ko trong mô phỏng là ko đơn (siêu ko chỉ xét ở nước thật).
   * ===================================================================== */
  const simGeo = {};
  function simInfo(n) {
    if (simGeo[n]) return simGeo[n];
    const W = n + 2;
    const pts = new Int16Array(n * n);
    for (let i = 0; i < n * n; i++) pts[i] = (((i / n) | 0) + 1) * W + (i % n) + 1;
    return (simGeo[n] = { W, S: W * W, pts });
  }
  const toSim = (i, n) => (((i / n) | 0) + 1) * (n + 2) + (i % n) + 1;
  const fromSim = (p, n) => (((p / (n + 2)) | 0) - 1) * n + (p % (n + 2)) - 1;

  function Sim(n) {
    const info = simInfo(n);
    const S = info.S;
    this.n = n;
    this.W = info.W;
    this.S = S;
    this.pts = info.pts;
    this.b = new Int8Array(S);
    this.next = new Int16Array(S);
    this.head = new Int16Array(S);
    this.sz = new Int16Array(S);
    this.lc = new Int32Array(S);
    this.ls = new Float64Array(S);
    this.lq = new Float64Array(S);
    this.emp = new Int16Array(n * n);
    this.epos = new Int16Array(S);
    this.ne = 0;
    this.ko = -1;
    this.turn = BLACK;
    this.passes = 0;
    this.last = -1;
  }

  Sim.prototype.copyFrom = function (o) {
    this.b.set(o.b);
    this.next.set(o.next);
    this.head.set(o.head);
    this.sz.set(o.sz);
    this.lc.set(o.lc);
    this.ls.set(o.ls);
    this.lq.set(o.lq);
    this.emp.set(o.emp);
    this.epos.set(o.epos);
    this.ne = o.ne;
    this.ko = o.ko;
    this.turn = o.turn;
    this.passes = o.passes;
    this.last = o.last;
  };

  /** Nạp từ ván thật. */
  Sim.prototype.load = function (g) {
    const n = this.n, W = this.W, b = this.b, pts = this.pts;
    b.fill(EDGE);
    this.ne = 0;
    for (let i = 0; i < n * n; i++) {
      b[pts[i]] = g.board[i];
      if (!g.board[i]) this.addEmpty(pts[i]);
    }
    const seen = new Uint8Array(this.S);
    for (let i = 0; i < n * n; i++) {
      const p = pts[i];
      if (!b[p] || seen[p]) continue;
      const col = b[p];
      const stack = [p];
      const stones = [];
      seen[p] = 1;
      while (stack.length) {
        const s = stack.pop();
        stones.push(s);
        for (const q of [s + 1, s - 1, s + W, s - W]) {
          if (b[q] === col && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      this.lc[p] = 0;
      this.ls[p] = 0;
      this.lq[p] = 0;
      this.sz[p] = stones.length;
      for (let k = 0; k < stones.length; k++) {
        const s = stones[k];
        this.head[s] = p;
        this.next[s] = stones[(k + 1) % stones.length];
      }
      for (const s of stones) {
        for (const q of [s + 1, s - 1, s + W, s - W]) if (b[q] === EMPTY) this.addLib(p, q);
      }
    }
    this.ko = -1; // ko ở nước thật đã được lọc bằng siêu ko khi dựng con của gốc
    this.turn = g.turn;
    this.passes = g.passes;
    this.last = g.last >= 0 ? pts[g.last] : -1;
  };

  Sim.prototype.addEmpty = function (p) {
    this.epos[p] = this.ne;
    this.emp[this.ne++] = p;
  };
  Sim.prototype.remEmpty = function (p) {
    const k = this.epos[p];
    const last = this.emp[--this.ne];
    this.emp[k] = last;
    this.epos[last] = k;
  };
  Sim.prototype.addLib = function (h, p) {
    this.lc[h]++;
    this.ls[h] += p;
    this.lq[h] += p * p;
  };
  Sim.prototype.remLib = function (h, p) {
    this.lc[h]--;
    this.ls[h] -= p;
    this.lq[h] -= p * p;
  };
  /** Nhóm (đầu h) chỉ còn đúng một khí. */
  Sim.prototype.atari = function (h) {
    const c = this.lc[h], s = this.ls[h];
    return c > 0 && s * s === c * this.lq[h];
  };
  Sim.prototype.libOf = function (h) {
    return this.ls[h] / this.lc[h];
  };

  /** Đặt quân trong mô phỏng (đã biết hợp lệ). */
  Sim.prototype.place = function (p, c) {
    const b = this.b, head = this.head, W = this.W, opp = 3 - c;
    b[p] = c;
    this.remEmpty(p);
    head[p] = p;
    this.next[p] = p;
    this.sz[p] = 1;
    this.lc[p] = 0;
    this.ls[p] = 0;
    this.lq[p] = 0;
    const n0 = p + 1, n1 = p - 1, n2 = p + W, n3 = p - W;
    // khí: điểm trống kề là khí của quân mới; nhóm kề mất khí p
    let v = b[n0];
    if (v === EMPTY) this.addLib(p, n0); else if (v !== EDGE) this.remLib(head[n0], p);
    v = b[n1];
    if (v === EMPTY) this.addLib(p, n1); else if (v !== EDGE) this.remLib(head[n1], p);
    v = b[n2];
    if (v === EMPTY) this.addLib(p, n2); else if (v !== EDGE) this.remLib(head[n2], p);
    v = b[n3];
    if (v === EMPTY) this.addLib(p, n3); else if (v !== EDGE) this.remLib(head[n3], p);
    // nhập nhóm cùng màu
    if (b[n0] === c && head[n0] !== head[p]) this.merge(head[p], head[n0]);
    if (b[n1] === c && head[n1] !== head[p]) this.merge(head[p], head[n1]);
    if (b[n2] === c && head[n2] !== head[p]) this.merge(head[p], head[n2]);
    if (b[n3] === c && head[n3] !== head[p]) this.merge(head[p], head[n3]);
    // bắt nhóm đối thủ hết khí
    let captured = 0, capAt = -1;
    if (b[n0] === opp && this.lc[head[n0]] === 0) { captured += this.capture(head[n0]); capAt = n0; }
    if (b[n1] === opp && this.lc[head[n1]] === 0) { captured += this.capture(head[n1]); capAt = n1; }
    if (b[n2] === opp && this.lc[head[n2]] === 0) { captured += this.capture(head[n2]); capAt = n2; }
    if (b[n3] === opp && this.lc[head[n3]] === 0) { captured += this.capture(head[n3]); capAt = n3; }
    // ko đơn: bắt đúng một quân bằng một quân đơn chỉ còn một khí
    const h = head[p];
    this.ko = captured === 1 && this.sz[h] === 1 && this.lc[h] === 1 ? capAt : -1;
  };

  Sim.prototype.merge = function (a, bh) {
    if (this.sz[a] < this.sz[bh]) {
      const t = a;
      a = bh;
      bh = t;
    }
    const head = this.head, next = this.next;
    let s = bh;
    do {
      head[s] = a;
      s = next[s];
    } while (s !== bh);
    const t = next[a];
    next[a] = next[bh];
    next[bh] = t;
    this.sz[a] += this.sz[bh];
    this.lc[a] += this.lc[bh];
    this.ls[a] += this.ls[bh];
    this.lq[a] += this.lq[bh];
  };

  /** Nhấc nhóm (đầu h) khỏi bàn, trả số quân bị bắt. */
  Sim.prototype.capture = function (h) {
    const b = this.b, next = this.next, head = this.head, W = this.W;
    let s = h, n = 0;
    do {
      b[s] = EMPTY;
      this.addEmpty(s);
      n++;
      s = next[s];
    } while (s !== h);
    s = h;
    do {
      let v = b[s + 1];
      if (v === BLACK || v === WHITE) this.addLib(head[s + 1], s);
      v = b[s - 1];
      if (v === BLACK || v === WHITE) this.addLib(head[s - 1], s);
      v = b[s + W];
      if (v === BLACK || v === WHITE) this.addLib(head[s + W], s);
      v = b[s - W];
      if (v === BLACK || v === WHITE) this.addLib(head[s - W], s);
      s = next[s];
    } while (s !== h);
    return n;
  };

  /** Nước p (điểm trống) của màu c có hợp lệ không (ko đơn, tự sát). */
  Sim.prototype.legal = function (p, c) {
    if (p === this.ko) return false;
    const b = this.b, W = this.W;
    if (b[p + 1] === EMPTY || b[p - 1] === EMPTY || b[p + W] === EMPTY || b[p - W] === EMPTY) return true;
    const opp = 3 - c;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p + 1 : k === 1 ? p - 1 : k === 2 ? p + W : p - W;
      const v = b[q];
      if (v === c) {
        if (!this.atari(this.head[q])) return true;
      } else if (v === opp) {
        if (this.atari(this.head[q])) return true;
      }
    }
    return false;
  };

  /** Điểm p "giống mắt" của màu c: bốn bên là quân c (hoặc viền), góc chéo đối thủ chiếm ít (để không tự lấp mắt). */
  Sim.prototype.eyeish = function (p, c) {
    const b = this.b, W = this.W;
    let v = b[p + 1];
    if (v !== c && v !== EDGE) return false;
    v = b[p - 1];
    if (v !== c && v !== EDGE) return false;
    v = b[p + W];
    if (v !== c && v !== EDGE) return false;
    v = b[p - W];
    if (v !== c && v !== EDGE) return false;
    const opp = 3 - c;
    let bad = 0, edge = 0;
    v = b[p + W + 1];
    if (v === opp) bad++; else if (v === EDGE) edge = 1;
    v = b[p + W - 1];
    if (v === opp) bad++; else if (v === EDGE) edge = 1;
    v = b[p - W + 1];
    if (v === opp) bad++; else if (v === EDGE) edge = 1;
    v = b[p - W - 1];
    if (v === opp) bad++; else if (v === EDGE) edge = 1;
    return edge ? bad === 0 : bad < 2;
  };

  /** Đặt quân p làm nhóm của mình chỉ còn một khí (tự đưa vào atari) mà không bắt được gì. */
  Sim.prototype.selfAtari = function (p, c) {
    const b = this.b, W = this.W, opp = 3 - c;
    let libs = 0, lib = -1;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p + 1 : k === 1 ? p - 1 : k === 2 ? p + W : p - W;
      const v = b[q];
      if (v === EMPTY) {
        if (q !== lib) {
          libs++;
          lib = q;
        }
      } else if (v === opp) {
        if (this.atari(this.head[q])) return false; // bắt được quân
      } else if (v === c) {
        if (!this.atari(this.head[q])) return false; // nối vào nhóm còn ≥ 2 khí: thường vẫn còn ≥ 2 khí
      }
    }
    return libs <= 1;
  };

  /**
   * Nước chiến thuật quanh nước vừa đi của đối thủ (Vừa / Khó):
   * bắt nhóm vừa đi nếu nó chỉ còn một khí; cứu nhóm mình kề nước đó nếu bị atari (chạy ra chỗ rộng hơn).
   */
  Sim.prototype.tactical = function (c) {
    const L = this.last;
    if (L < 0) return -1;
    const b = this.b, W = this.W, head = this.head;
    const opp = 3 - c;
    if (b[L] === opp && this.atari(head[L])) {
      const q = this.libOf(head[L]);
      if (this.legal(q, c)) return q;
    }
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? L + 1 : k === 1 ? L - 1 : k === 2 ? L + W : L - W;
      if (b[q] !== c || !this.atari(head[q])) continue;
      const lib = this.libOf(head[q]);
      if (!this.legal(lib, c)) continue;
      // chạy ra: điểm khí phải có ≥ 2 điểm trống kề, hoặc nối với nhóm mình còn nhiều khí / bắt được quân
      let free = 0;
      for (let t = 0; t < 4; t++) {
        const z = t === 0 ? lib + 1 : t === 1 ? lib - 1 : t === 2 ? lib + W : lib - W;
        const v = b[z];
        if (v === EMPTY) free++;
        else if (v === c && head[z] !== head[q] && !this.atari(head[z])) free += 2;
        else if (v === opp && this.atari(head[z])) free += 2;
      }
      if (free >= 2) return lib;
    }
    return -1;
  };

  /** Chọn nước trong mô phỏng cho màu c (heur: dùng nước chiến thuật và tránh tự atari). */
  Sim.prototype.pick = function (c, rng, heur) {
    if (heur) {
      const t = this.tactical(c);
      if (t >= 0) return t;
    }
    const ne = this.ne;
    if (!ne) return PASS;
    const emp = this.emp;
    let k = (rng() * ne) | 0;
    let fallback = -1;
    for (let j = 0; j < ne; j++) {
      const p = emp[k];
      if (p !== this.ko && !this.eyeish(p, c) && this.legal(p, c)) {
        if (!heur || !this.selfAtari(p, c)) return p;
        if (fallback < 0) fallback = p;
      }
      if (++k === ne) k = 0;
    }
    return fallback >= 0 ? fallback : PASS;
  };

  Sim.prototype.play = function (m) {
    const c = this.turn;
    if (m === PASS) {
      this.passes++;
      this.ko = -1;
      this.last = -1;
    } else {
      this.place(m, c);
      this.passes = 0;
      this.last = m;
    }
    this.turn = 3 - c;
  };

  /** Đếm điểm cuối mô phỏng (điểm trống tính cho màu nếu mọi điểm kề cùng màu đó), trả bên thắng. */
  Sim.prototype.winner = function (komi) {
    const b = this.b, W = this.W, pts = this.pts;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const v = b[p];
      if (v === BLACK) s++;
      else if (v === WHITE) s--;
      else {
        const m = (b[p + 1] | b[p - 1] | b[p + W] | b[p - W]) & 3;
        if (m === BLACK) s++;
        else if (m === WHITE) s--;
      }
    }
    return s - komi > 0 ? BLACK : WHITE;
  };

  /* =====================================================================
   * MCTS
   * ===================================================================== */
  // Cấu hình theo mức: số mô phỏng tối đa, thời gian tối đa (ms, chặn trên khi chạy trong trình duyệt),
  // heuristic trong mô phỏng, RAVE, tri thức ban đầu cho cây (prior), ngưỡng đầu hàng
  const LEVEL_CFG = {
    easy: { playouts: 300, ms: { 9: 500, 13: 700 }, heur: false, rave: false, prior: false, resign: 0.03 },
    medium: { playouts: 3000, ms: { 9: 1000, 13: 1300 }, heur: true, rave: true, prior: false, resign: 0.05 },
    hard: { playouts: 100000, ms: { 9: 1500, 13: 2000 }, heur: true, rave: true, prior: true, resign: 0.05 },
  };
  const EXPAND_AT = 2; // nút lá được mở rộng khi đã có từng này lượt thăm
  const MAX_NODES = 150000; // trần số nút cây (giữ bộ nhớ worker dưới ~20 MB); quá trần thì chỉ mô phỏng từ lá
  const UCT_C = 0.7; // hằng số khám phá cho UCT thuần (Dễ)
  const RAVE_C = 0.2; // khám phá còn lại khi có RAVE
  const RAVE_B = 1 / 2500; // độ lệch RAVE (beta giảm dần khi nút được thăm nhiều)

  function Node(move, color) {
    this.move = move; // điểm trên bàn mô phỏng, hoặc PASS
    this.color = color; // màu vừa đi nước này
    this.N = 0;
    this.W = 0;
    this.rN = 0;
    this.rW = 0;
    this.kids = null;
  }

  /** Tri thức ban đầu (Khó): ưu tiên bắt / cứu quân, tránh tự atari, tránh dòng một lúc đầu ván. */
  function seedPrior(sim, node, p, c, stones) {
    const b = sim.b, W = sim.W, head = sim.head, opp = 3 - c;
    let n = 10, w = 5;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p + 1 : k === 1 ? p - 1 : k === 2 ? p + W : p - W;
      const v = b[q];
      if (v === opp && sim.atari(head[q])) {
        n += 10;
        w += 10;
      } else if (v === c && sim.atari(head[q])) {
        n += 6;
        w += 5;
      }
    }
    if (sim.selfAtari(p, c)) n += 12;
    const size = sim.n;
    const r = ((p / W) | 0) - 1, col = (p % W) - 1;
    const line = Math.min(r, col, size - 1 - r, size - 1 - col);
    if (line === 0 && stones < (size * size) / 3) n += 8;
    node.rN = n;
    node.rW = w;
  }

  /**
   * Tạo phiên tìm kiếm cho bên tới lượt của ván g.
   * opts: { level, seed }. Trả { run(maxIter, deadline, now), result(), iterations, hasMoves, root }.
   */
  function createSearch(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    const cfg = LEVEL_CFG[level];
    const rng = mulberry32(o.seed == null ? 12345 : o.seed);
    const n = g.n, komi = g.komi;
    const base = new Sim(n);
    base.load(g);
    const sim = new Sim(n);
    const me = g.turn;
    let stones = 0;
    for (const v of g.board) if (v) stones++;

    // Con của gốc: nước hợp lệ theo luật thật (cả siêu ko), bỏ điểm giống mắt của mình
    const root = new Node(PASS, 3 - me);
    root.kids = [];
    for (let i = 0; i < g.board.length; i++) {
      if (g.board[i] !== EMPTY) continue;
      const p = toSim(i, n);
      if (base.eyeish(p, me) || tryMove(g, i).error) continue;
      const kid = new Node(p, me);
      if (cfg.prior) seedPrior(base, kid, p, me, stones);
      root.kids.push(kid);
    }

    const maxLen = n * n * 3;
    const seqM = new Int16Array(maxLen + 8);
    const seqC = new Int8Array(maxLen + 8);
    const amaf = new Int8Array(base.S);
    const path = [];

    function select(node) {
      const kids = node.kids;
      let best = kids[0], bv = -Infinity;
      const lg = Math.log(node.N + 1);
      for (let k = 0; k < kids.length; k++) {
        const kid = kids[k];
        let v;
        if (cfg.rave) {
          const N = kid.N, rN = kid.rN;
          const q = N ? kid.W / N : 0;
          const rq = rN ? kid.rW / rN : 0.5;
          const beta = rN / (rN + N + rN * N * RAVE_B);
          v = (N || rN ? (1 - beta) * q + beta * rq : 1) + RAVE_C * Math.sqrt(lg / (N + 1));
        } else {
          v = kid.N ? kid.W / kid.N + UCT_C * Math.sqrt(lg / kid.N) : 10 + rng();
        }
        if (v > bv) {
          bv = v;
          best = kid;
        }
      }
      return best;
    }

    function expand(node) {
      const c = sim.turn;
      const kids = [];
      const emp = sim.emp;
      for (let k = 0; k < sim.ne; k++) {
        const p = emp[k];
        if (p === sim.ko || sim.eyeish(p, c) || !sim.legal(p, c)) continue;
        const kid = new Node(p, c);
        if (cfg.prior) seedPrior(sim, kid, p, c, stones);
        kids.push(kid);
      }
      if (!kids.length) kids.push(new Node(PASS, c));
      node.kids = kids;
      nodes += kids.length;
    }

    let iterations = 0;
    let nodes = root.kids.length;
    function iterate() {
      sim.copyFrom(base);
      let node = root;
      path.length = 0;
      path.push(root);
      while (node.kids && node.kids.length && sim.passes < 2) {
        node = select(node);
        sim.play(node.move);
        path.push(node);
      }
      if (!node.kids && sim.passes < 2 && node.N >= EXPAND_AT && nodes < MAX_NODES) {
        expand(node);
        node = select(node);
        sim.play(node.move);
        path.push(node);
      }
      // mô phỏng tới khi hai bên cùng bỏ lượt
      let len = 0;
      while (sim.passes < 2 && len < maxLen) {
        const c = sim.turn;
        const m = sim.pick(c, rng, cfg.heur);
        sim.play(m);
        if (m >= 0) {
          seqM[len] = m;
          seqC[len] = c;
          len++;
        }
      }
      const win = sim.winner(komi);
      // lan truyền ngược (+ AMAF: màu đi trước nhất ở mỗi điểm, tính từ nút đó trở xuống)
      if (cfg.rave) {
        amaf.fill(0);
        for (let k = len - 1; k >= 0; k--) amaf[seqM[k]] = seqC[k];
      }
      for (let d = path.length - 1; d >= 0; d--) {
        const nd = path[d];
        nd.N++;
        if (win === nd.color) nd.W++;
        if (cfg.rave && nd.kids) {
          const kids = nd.kids;
          for (let k = 0; k < kids.length; k++) {
            const kid = kids[k];
            if (kid.move >= 0 && amaf[kid.move] === kid.color) {
              kid.rN++;
              if (win === kid.color) kid.rW++;
            }
          }
        }
        if (cfg.rave && nd.move >= 0) amaf[nd.move] = nd.color;
      }
      iterations++;
    }

    return {
      root,
      get iterations() {
        return iterations;
      },
      hasMoves: root.kids.length > 0,
      /** Chạy tối đa maxIter vòng, hoặc tới deadline (theo hàm now). Trả số vòng đã chạy lần này. */
      run(maxIter, deadline, now) {
        if (!root.kids.length) return 0;
        let k = 0;
        while (k < maxIter) {
          iterate();
          k++;
          if (deadline != null && (k & 15) === 0 && now() >= deadline) break;
        }
        return k;
      },
      /** Nước chọn: con được thăm nhiều nhất; thua gần chắc (tỉ lệ thắng thấp, ván đã đi ít nhất nửa bàn) thì đầu hàng. */
      result() {
        if (!root.kids.length) return { move: PASS, winrate: 0 };
        let best = root.kids[0];
        for (const kid of root.kids) if (kid.N > best.N || (kid.N === best.N && kid.rN > best.rN)) best = kid;
        const wr = best.N ? best.W / best.N : 0.5;
        if (iterations >= 200 && best.N >= 5 && wr < cfg.resign && g.moves.length >= (n * n) / 2) return { move: RESIGN, winrate: wr };
        return { move: best.move === PASS ? PASS : fromSim(best.move, n), winrate: wr };
      },
    };
  }

  /**
   * Bước 1 của việc chọn nước: các trường hợp quyết ngay (bỏ lượt theo luật của máy) trả { move, reason };
   * cần tìm kiếm thì trả { search, reason: 'search', playouts, ms } để người gọi tự chạy search.run(...)
   * (một lần, hoặc từng khúc khi không có Web Worker), rồi lấy search.result().
   */
  function planMove(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    if (!g || g.over) return { move: null, reason: 'over' };
    if (isSettled(g)) return { move: PASS, reason: 'settled' };
    if (g.passes >= 1 && score(g).winner === g.turn) return { move: PASS, reason: 'score' };
    const search = createSearch(g, { level, seed: o.seed });
    if (!search.hasMoves) return { move: PASS, reason: 'nomove' };
    const cfg = LEVEL_CFG[level];
    return { search, reason: 'search', playouts: cfg.playouts, ms: cfg.ms[g.n] || cfg.ms[9] };
  }

  /**
   * Chọn nước cho bên tới lượt.
   * opts: { level, seed, iterations (số mô phỏng, tất định), timeMs (giới hạn thời gian), now }
   * Trả { move (điểm, PASS hoặc RESIGN), reason, winrate, iterations }.
   */
  function chooseMove(g, opts) {
    const o = opts || {};
    const plan = planMove(g, o);
    if (!plan.search) return plan;
    const now = o.now || (() => Date.now());
    const iters = o.iterations || plan.playouts;
    const deadline = o.iterations ? null : now() + (o.timeMs || plan.ms);
    plan.search.run(iters, deadline, now);
    const r = plan.search.result();
    return { move: r.move, reason: r.move === RESIGN ? 'resign' : 'search', winrate: r.winrate, iterations: plan.search.iterations };
  }

  /**
   * Ước lượng chủ đất bằng mô phỏng (dùng khi hết ván do đầu hàng): trả mảng số trong [-1, 1]
   * theo điểm (dương = Đen, âm = Trắng).
   */
  function ownership(g, playouts, seed) {
    const n = g.n, N = n * n;
    const rng = mulberry32(seed == null ? 7 : seed);
    const base = new Sim(n);
    base.load(g);
    const sim = new Sim(n);
    const acc = new Float64Array(N);
    const runs = playouts || 64;
    const W = base.W;
    for (let k = 0; k < runs; k++) {
      sim.copyFrom(base);
      let len = 0;
      while (sim.passes < 2 && len < N * 3) {
        sim.play(sim.pick(sim.turn, rng, true));
        len++;
      }
      for (let i = 0; i < N; i++) {
        const p = base.pts[i];
        let v = sim.b[p];
        if (!v) v = (sim.b[p + 1] | sim.b[p - 1] | sim.b[p + W] | sim.b[p - W]) & 3;
        if (v === BLACK) acc[i]++;
        else if (v === WHITE) acc[i]--;
      }
    }
    return Array.from(acc, (x) => x / runs);
  }

  return {
    EMPTY, BLACK, WHITE, PASS, RESIGN, SIZES, LEVELS, KOMI, VERSION, LEVEL_CFG,
    geo, hoshi, pointName, chainAt, newGame, tryMove, isLegal, legalMoves, play, resign,
    areaScore, score, isSettled, aiWouldPass, toJSON, fromJSON, mulberry32,
    Sim, toSim, fromSim, createSearch, planMove, chooseMove, ownership,
  };
}

(function (root) {
  const api = GoFactory();
  api.factory = GoFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
