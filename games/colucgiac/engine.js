/* =====================================================================
 * Cờ Lục Giác (Hex) - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong
 *   Web Worker: toàn bộ engine nằm trong hàm HexFactory để app.js dựng lại mã nguồn
 *   cho worker qua GameEngine.factory.toString() (chạy được cả khi mở bằng file://).
 *
 * Bàn hình thoi n × n (n = 7, 9, 11), ô = r * n + c (r hàng, c cột).
 *   - Đỏ (RED = 1) đi trước, nối hàng r = 0 với hàng r = n - 1
 *   - Xanh (BLUE = 2) nối cột c = 0 với cột c = n - 1
 *   - Sáu láng giềng của (r, c): (r, c±1), (r-1, c), (r-1, c+1), (r+1, c-1), (r+1, c)
 *   - Không có hòa: bàn đầy thì luôn đúng một bên đã nối được (định lý Hex)
 *   - Luật đổi bên (swap / pie rule, tùy chọn): ở nước thứ hai Xanh được "lấy" nước đầu của Đỏ.
 *     Quân Đỏ ở (r, c) đổi thành quân Xanh ở (c, r) (đối xứng qua đường chéo dài), rồi tới lượt Đỏ.
 *     Mỗi bên vẫn giữ màu và cạnh của mình, chỉ đổi ai được hưởng nước đầu.
 *   - Nước đi là chỉ số ô, hoặc SWAP (-1) cho nước đổi bên
 *   - Phát hiện thắng bằng union-find với 4 nút ảo cho 4 cạnh
 *   - Máy: Dễ (ngẫu nhiên có ưu tiên), Vừa (đánh giá "hai-khoảng cách" của Queenbee, xét 1 nước),
 *     Khó (MCTS + RAVE, mô phỏng có giữ cầu, giới hạn số vòng hoặc thời gian, chạy được từng khúc)
 * ===================================================================== */
function HexFactory() {
  'use strict';

  const EMPTY = 0, RED = 1, BLUE = 2;
  const SWAP = -1;
  const SIZES = [7, 9, 11];
  const LEVELS = ['easy', 'medium', 'hard'];
  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const LETTERS = 'abcdefghijk';
  // Sáu hướng láng giềng (dr, dc) theo thứ tự vòng quanh ô: hai hướng liền nhau là hai ô kề nhau
  const DIRS = [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]];

  /* ---------------- Hình học (lưu sẵn theo cỡ) ---------------- */
  const geoCache = {};
  function geo(n) {
    if (geoCache[n]) return geoCache[n];
    const N = n * n;
    const ring = []; // ring[i]: 6 láng giềng theo vòng (-1 nếu ra ngoài bàn)
    const adj = []; // adj[i]: láng giềng trong bàn
    for (let i = 0; i < N; i++) {
      const r = (i / n) | 0, c = i % n;
      const rg = DIRS.map(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        return rr >= 0 && rr < n && cc >= 0 && cc < n ? rr * n + cc : -1;
      });
      ring.push(rg);
      adj.push(rg.filter((j) => j >= 0));
    }
    return (geoCache[n] = { n, N, ring, adj });
  }

  const rowOf = (i, n) => (i / n) | 0;
  const colOf = (i, n) => i % n;
  /** Tên ô kiểu Hex: chữ là cột, số là hàng (a1 ở góc hàng 0, cột 0). */
  const cellName = (i, n) => LETTERS[i % n] + (((i / n) | 0) + 1);
  /** Ô đối xứng qua đường chéo dài (dùng cho luật đổi bên). */
  const mirror = (i, n) => (i % n) * n + ((i / n) | 0);
  /** Ô i có nằm trên cạnh `edge` (0 hoặc 1) của bên `color` không. */
  function onEdge(i, n, color, edge) {
    const k = color === RED ? rowOf(i, n) : colOf(i, n);
    return edge === 0 ? k === 0 : k === n - 1;
  }

  /* ---------------- Union-find ---------------- */
  function UnionFind(size) {
    this.p = new Int32Array(size);
    for (let i = 0; i < size; i++) this.p[i] = i;
  }
  UnionFind.prototype.find = function (x) {
    const p = this.p;
    while (p[x] !== x) {
      p[x] = p[p[x]]; // nén đường đi một nửa
      x = p[x];
    }
    return x;
  };
  UnionFind.prototype.union = function (a, b) {
    a = this.find(a);
    b = this.find(b);
    if (a !== b) this.p[a] = b;
  };
  UnionFind.prototype.connected = function (a, b) {
    return this.find(a) === this.find(b);
  };

  /** Bên thắng của một bàn (0 nếu chưa ai nối được). Nút ảo: N trên, N+1 dưới, N+2 trái, N+3 phải. */
  function winnerOf(board, n) {
    const { N, adj } = geo(n);
    const TOP = N, BOTTOM = N + 1, LEFT = N + 2, RIGHT = N + 3;
    const uf = new UnionFind(N + 4);
    for (let i = 0; i < N; i++) {
      const col = board[i];
      if (!col) continue;
      if (col === RED) {
        if (rowOf(i, n) === 0) uf.union(i, TOP);
        if (rowOf(i, n) === n - 1) uf.union(i, BOTTOM);
      } else {
        if (colOf(i, n) === 0) uf.union(i, LEFT);
        if (colOf(i, n) === n - 1) uf.union(i, RIGHT);
      }
      const a = adj[i];
      for (let k = 0; k < a.length; k++) if (a[k] > i && board[a[k]] === col) uf.union(i, a[k]);
    }
    if (uf.connected(TOP, BOTTOM)) return RED;
    if (uf.connected(LEFT, RIGHT)) return BLUE;
    return 0;
  }

  /* ---------------- Ván ---------------- */
  // g: { n, swap (bật luật đổi bên), board[N] (0 / 1 / 2), moves[] (ô hoặc SWAP), turn, winner, swapped, last }
  function newGame(opts) {
    const o = opts || {};
    const n = SIZES.indexOf(o.n) >= 0 ? o.n : 9;
    return { n, swap: o.swap !== false, board: new Array(n * n).fill(EMPTY), moves: [], turn: RED, winner: 0, swapped: false, last: -1 };
  }

  /** Được đổi bên: luật bật, mới có đúng một nước (của Đỏ) và chưa ai thắng. */
  const canSwap = (g) => g.swap && g.moves.length === 1 && !g.winner;

  function legalMoves(g) {
    if (g.winner) return [];
    const out = [];
    for (let i = 0; i < g.board.length; i++) if (!g.board[i]) out.push(i);
    if (canSwap(g)) out.push(SWAP);
    return out;
  }

  /** Đi một nước; trả ván mới, hoặc null nếu nước sai luật. */
  function play(g, m) {
    if (g.winner) return null;
    const n = g.n;
    if (m === SWAP) {
      if (!canSwap(g)) return null;
      const first = g.moves[0];
      const to = mirror(first, n);
      const board = g.board.slice();
      board[first] = EMPTY;
      board[to] = BLUE;
      return { n, swap: g.swap, board, moves: g.moves.concat(SWAP), turn: RED, winner: 0, swapped: true, last: to };
    }
    if (!Number.isInteger(m) || m < 0 || m >= n * n || g.board[m]) return null;
    const board = g.board.slice();
    board[m] = g.turn;
    return { n, swap: g.swap, board, moves: g.moves.concat(m), turn: 3 - g.turn, winner: winnerOf(board, n), swapped: g.swapped, last: m };
  }

  /** Số quân mỗi bên đã đặt trên bàn. */
  function stoneCount(g) {
    let red = 0, blue = 0;
    for (const v of g.board) {
      if (v === RED) red++;
      else if (v === BLUE) blue++;
    }
    return { red, blue };
  }

  /** Đường nối ngắn nhất (qua quân của bên thắng) giữa hai cạnh, để tô sáng khi hết ván. */
  function winningPath(g) {
    const col = g.winner;
    if (!col) return [];
    const { N, adj } = geo(g.n);
    const prev = new Int32Array(N).fill(-2);
    const queue = [];
    for (let i = 0; i < N; i++) {
      if (g.board[i] === col && onEdge(i, g.n, col, 0)) {
        prev[i] = -1;
        queue.push(i);
      }
    }
    for (let h = 0; h < queue.length; h++) {
      const x = queue[h];
      if (onEdge(x, g.n, col, 1)) {
        const path = [];
        for (let y = x; y >= 0; y = prev[y]) path.push(y);
        return path.reverse();
      }
      for (const y of adj[x]) {
        if (g.board[y] === col && prev[y] === -2) {
          prev[y] = x;
          queue.push(y);
        }
      }
    }
    return [];
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (g) => ({ v: VERSION, n: g.n, swap: g.swap, moves: g.moves.slice() });

  /** Dựng lại ván bằng cách đi lại từng nước: dữ liệu hỏng, sai luật hay khác phiên bản thì trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (SIZES.indexOf(raw.n) < 0 || typeof raw.swap !== 'boolean' || !Array.isArray(raw.moves)) return null;
    if (raw.moves.length > raw.n * raw.n + 1) return null;
    let g = newGame({ n: raw.n, swap: raw.swap });
    for (const m of raw.moves) {
      g = play(g, m);
      if (!g) return null;
    }
    return g;
  }

  /* ---------------- Số ngẫu nhiên có hạt giống ---------------- */
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

  /* ---------------- Công cụ chung cho máy ---------------- */
  /** Các ô trống mà bên `col` đặt vào là thắng ngay. */
  function winningCells(board, n, col) {
    const out = [];
    const b = board.slice();
    for (let i = 0; i < b.length; i++) {
      if (b[i]) continue;
      b[i] = col;
      if (winnerOf(b, n) === col) out.push(i);
      b[i] = EMPTY;
    }
    return out;
  }

  /** Khoảng cách lục giác tới tâm bàn (tâm là ô giữa, n lẻ). */
  function centerDist(i, n) {
    const h = (n - 1) / 2;
    const dr = rowOf(i, n) - h, dc = colOf(i, n) - h;
    return (Math.abs(dr) + Math.abs(dc) + Math.abs(dr + dc)) / 2;
  }

  /* ---------------- Đánh giá "hai-khoảng cách" (two-distance, Queenbee) ----------------
   * Với bên col và một cạnh: ô kề cạnh (trực tiếp hoặc qua nhóm quân col chạm cạnh) có khoảng cách 1;
   * ô khác có khoảng cách k + 1 nếu có ít nhất HAI láng giềng có khoảng cách ≤ k (đối thủ luôn chặn
   * được đường tốt nhất nên tính đường tốt thứ hai). Láng giềng đi xuyên qua nhóm quân col.
   * Tiềm năng của bên col = min trên ô trống (khoảng cách tới cạnh 1 + tới cạnh 2): càng nhỏ càng tốt. */
  const FAR = 200; // không còn đường nối

  function twoDistance(board, n, col) {
    const { N, adj } = geo(n);
    // Gom quân của col thành nhóm, mỗi nhóm có danh sách ô trống kề nhóm (khí)
    const uf = new UnionFind(N);
    for (let i = 0; i < N; i++) {
      if (board[i] !== col) continue;
      for (const j of adj[i]) if (j > i && board[j] === col) uf.union(i, j);
    }
    const libs = new Map(); // gốc nhóm -> mảng ô trống kề
    const touch = new Map(); // gốc nhóm -> [chạm cạnh 0, chạm cạnh 1]
    const mark = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (board[i] !== col) continue;
      const root = uf.find(i);
      if (!libs.has(root)) {
        libs.set(root, []);
        touch.set(root, [false, false]);
      }
      const t = touch.get(root);
      if (onEdge(i, n, col, 0)) t[0] = true;
      if (onEdge(i, n, col, 1)) t[1] = true;
      const l = libs.get(root);
      for (const j of adj[i]) {
        if (!board[j] && mark[j] !== root) {
          mark[j] = root;
          l.push(j);
        }
      }
    }
    for (const t of touch.values()) if (t[0] && t[1]) return { won: true, pot: 0, mob: N };
    // Láng giềng mở rộng của từng ô trống (đi xuyên nhóm quân col)
    const nbs = new Array(N);
    const seen = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (board[i]) continue;
      const list = [];
      seen[i] = i;
      for (const j of adj[i]) {
        if (!board[j]) {
          if (seen[j] !== i) {
            seen[j] = i;
            list.push(j);
          }
        } else if (board[j] === col) {
          for (const k of libs.get(uf.find(j))) {
            if (seen[k] !== i) {
              seen[k] = i;
              list.push(k);
            }
          }
        }
      }
      nbs[i] = list;
    }
    const dist = [];
    for (let e = 0; e < 2; e++) {
      const d = new Int32Array(N).fill(FAR);
      for (let i = 0; i < N; i++) {
        if (board[i]) continue;
        let near = onEdge(i, n, col, e);
        if (!near) {
          for (const j of adj[i]) {
            if (board[j] === col && touch.get(uf.find(j))[e]) {
              near = true;
              break;
            }
          }
        }
        if (near) d[i] = 1;
      }
      for (let k = 1; k < N; k++) {
        const set = [];
        for (let i = 0; i < N; i++) {
          if (board[i] || d[i] !== FAR) continue;
          let cnt = 0;
          const l = nbs[i];
          for (let q = 0; q < l.length && cnt < 2; q++) if (d[l[q]] <= k) cnt++;
          if (cnt >= 2) set.push(i);
        }
        if (!set.length) break;
        for (const i of set) d[i] = k + 1;
      }
      dist.push(d);
    }
    let pot = FAR * 2, mob = 0;
    for (let i = 0; i < N; i++) {
      if (board[i]) continue;
      const v = dist[0][i] + dist[1][i];
      if (v < pot) {
        pot = v;
        mob = 1;
      } else if (v === pot) mob++;
    }
    return { won: false, pot, mob };
  }

  /** Điểm thế cờ theo góc nhìn của col: lớn là tốt cho col. */
  function evaluate(board, n, col) {
    const me = twoDistance(board, n, col);
    if (me.won) return 1e6;
    const op = twoDistance(board, n, 3 - col);
    if (op.won) return -1e6;
    return 100 * (op.pot - me.pot) + (me.mob - op.mob);
  }

  /* ---------------- MCTS + RAVE ----------------
   * Mỗi nút giữ thống kê cho từng nước con trong mảng kiểu (đỡ tốn bộ nhớ); nút con chỉ được tạo khi
   * nước đó đã được thử EXPAND lần. Mô phỏng: lấp đầy bàn ngẫu nhiên, ưu tiên "giữ cầu" (đối thủ chen vào
   * một cầu của mình thì đặt ngay ô còn lại), rồi xem bên nào nối được trên bàn đầy (luôn đúng một bên).
   * RAVE / AMAF: ô trống ở một nút thuộc về bên nào trên bàn đầy thì coi như bên đó đã đi nước ấy. */
  const EXPAND = 6;
  const MAX_NODES = 9000;
  const RAVE_B = 1 / 400; // 4b² trong công thức beta của Silver
  const UCT_C = 0.2;

  function createSearch(g, opts) {
    const o = opts || {};
    const n = g.n;
    const G = geo(n);
    const N = G.N;
    const rng = o.rng || mulberry32(o.seed || 1);
    const rootBoard = Int8Array.from(g.board);
    const board = new Int8Array(N);
    const order = new Int16Array(N);
    const stack = new Int16Array(N);
    const visit = new Int32Array(N);
    let gen = 0;
    let nodes = 0;
    let iterations = 0;

    function makeNode(b, player) {
      let k = 0;
      for (let i = 0; i < N; i++) if (!b[i]) k++;
      const moves = new Int16Array(k);
      k = 0;
      for (let i = 0; i < N; i++) if (!b[i]) moves[k++] = i;
      nodes++;
      return {
        player, // bên tới lượt ở nút này
        visits: 0,
        moves,
        cn: new Int32Array(k), // số lần thử nước con
        cw: new Int32Array(k), // số lần thắng (cho player)
        rn: new Int32Array(k), // AMAF
        rw: new Int32Array(k),
        kids: new Array(k).fill(null),
      };
    }
    const root = makeNode(rootBoard, g.turn);

    function select(node) {
      const lnN = Math.log(node.visits + 1);
      let best = 0, bestV = -Infinity;
      const { cn, cw, rn, rw } = node;
      for (let i = 0; i < cn.length; i++) {
        const c = cn[i], r = rn[i];
        const a = r ? rw[i] / r : 0.5;
        let v;
        if (!c) v = a + UCT_C * Math.sqrt(lnN) + 0.1;
        else {
          const beta = r / (r + c + RAVE_B * r * c);
          v = (1 - beta) * (cw[i] / c) + beta * a + UCT_C * Math.sqrt(lnN / c);
        }
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      }
      return best;
    }

    /** Đối thủ vừa đi `last`: nếu chen vào cầu của p (hai quân p cách nhau một ô, chung hai ô kề) thì trả ô còn lại. */
    function bridgeReply(last, p) {
      const rg = G.ring[last];
      let found = -1, cnt = 0;
      for (let i = 0; i < 6; i++) {
        const a = rg[i], mid = rg[(i + 1) % 6], b = rg[(i + 2) % 6];
        if (a < 0 || b < 0 || mid < 0) continue;
        if (board[a] === p && board[b] === p && !board[mid]) {
          cnt++;
          if (rng() * cnt < 1) found = mid; // chọn ngẫu nhiên đều trong các ô hợp lệ
        }
      }
      return found;
    }

    /** Bàn đầy: Đỏ thắng khi có đường Đỏ từ hàng 0 tới hàng n - 1, ngược lại Xanh thắng. */
    function fullWinner() {
      gen++;
      let top = 0;
      for (let c = 0; c < n; c++) {
        if (board[c] === RED) {
          visit[c] = gen;
          stack[top++] = c;
        }
      }
      const last = N - n;
      while (top) {
        const x = stack[--top];
        if (x >= last) return RED;
        const a = G.adj[x];
        for (let k = 0; k < a.length; k++) {
          const y = a[k];
          if (board[y] === RED && visit[y] !== gen) {
            visit[y] = gen;
            stack[top++] = y;
          }
        }
      }
      return BLUE;
    }

    function playout(toMove, last) {
      let k = 0;
      for (let i = 0; i < N; i++) if (!board[i]) order[k++] = i;
      for (let i = k - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
      }
      let p = toMove, idx = 0;
      for (let filled = 0; filled < k; filled++) {
        let m = last >= 0 ? bridgeReply(last, p) : -1;
        if (m < 0) {
          while (board[order[idx]]) idx++;
          m = order[idx++];
        }
        board[m] = p;
        last = m;
        p = 3 - p;
      }
      return fullWinner();
    }

    const pathNodes = [];
    const pathSlots = [];
    function iterate() {
      board.set(rootBoard);
      let node = root;
      let toMove = g.turn;
      let last = g.last;
      pathNodes.length = 0;
      pathSlots.length = 0;
      for (;;) {
        if (!node.moves.length) break;
        const slot = select(node);
        const m = node.moves[slot];
        board[m] = toMove;
        last = m;
        pathNodes.push(node);
        pathSlots.push(slot);
        toMove = 3 - toMove;
        const child = node.kids[slot];
        if (!child) {
          if (node.cn[slot] >= EXPAND && nodes < MAX_NODES) node.kids[slot] = makeNode(board, toMove);
          break;
        }
        node = child;
      }
      const winner = playout(toMove, last);
      for (let q = 0; q < pathNodes.length; q++) {
        const nd = pathNodes[q];
        const s = pathSlots[q];
        const p = nd.player;
        const won = winner === p ? 1 : 0;
        nd.visits++;
        nd.cn[s]++;
        nd.cw[s] += won;
        const mv = nd.moves;
        for (let i = 0; i < mv.length; i++) {
          if (board[mv[i]] === p) {
            nd.rn[i]++;
            nd.rw[i] += won;
          }
        }
      }
      iterations++;
    }

    function bestSlot() {
      let b = 0;
      for (let i = 1; i < root.cn.length; i++) if (root.cn[i] > root.cn[b]) b = i;
      return b;
    }

    return {
      /** Chạy thêm tối đa `count` vòng, dừng sớm khi quá `deadline` (theo hàm now). Trả false nếu dừng vì hết giờ. */
      run(count, deadline, now) {
        for (let i = 0; i < count; i++) {
          if (deadline != null && (i & 31) === 0 && now() >= deadline) return false;
          iterate();
        }
        return true;
      },
      best() {
        return root.moves.length ? root.moves[bestSlot()] : -1;
      },
      /** Tỉ lệ thắng ước lượng của bên tới lượt với nước tốt nhất. */
      value() {
        const b = bestSlot();
        return root.cn[b] ? root.cw[b] / root.cn[b] : 0.5;
      },
      get iterations() { return iterations; },
      get nodes() { return nodes; },
    };
  }

  /* ---------------- Máy chọn nước ---------------- */
  /** Nước mở đầu khi máy cầm Đỏ (đi trước). Có luật đổi bên thì chọn nước "vừa phải" để người chơi khó lợi khi đổi. */
  function opening(g, level, rng) {
    const n = g.n;
    const N = n * n;
    if (level === 'easy') return weightedPick(g, rng);
    if (!g.swap) return ((n - 1) / 2) * n + (n - 1) / 2; // không có đổi bên: chiếm tâm
    // Ô trên cạnh của Xanh (cột đầu / cột cuối), không ở hai góc: yếu vừa đủ để đổi bên không lợi nhiều
    const cand = [];
    for (let i = 0; i < N; i++) {
      const r = rowOf(i, n), c = colOf(i, n);
      if ((c === 0 || c === n - 1) && r >= 1 && r <= n - 2) cand.push(i);
    }
    return cand[(rng() * cand.length) | 0];
  }

  /** Máy cầm Xanh, gặp nước đầu của Đỏ: có đổi bên không. */
  function shouldSwap(g, level) {
    const n = g.n;
    const m = g.moves[0];
    if (level === 'easy') return centerDist(m, n) <= 1; // Dễ chỉ đổi khi Đỏ đặt sát tâm
    const r = rowOf(m, n), c = colOf(m, n);
    return r >= 1 && r <= n - 2 && c >= 1 && c <= n - 2; // Vừa / Khó: đổi mọi nước không nằm trên cạnh
  }

  /** Dễ: chọn ngẫu nhiên có trọng số, thích ô gần quân mình, gần quân đối thủ và gần tâm. */
  function weightedPick(g, rng) {
    const n = g.n;
    const { adj } = geo(n);
    const me = g.turn;
    const cells = [];
    const weights = [];
    let total = 0;
    for (let i = 0; i < g.board.length; i++) {
      if (g.board[i]) continue;
      let w = 1 + Math.max(0, (n / 2 - centerDist(i, n)) / n) * 3;
      for (const j of adj[i]) {
        if (g.board[j] === me) w += 1.5;
        else if (g.board[j]) w += 1;
      }
      cells.push(i);
      weights.push(w);
      total += w;
    }
    let x = rng() * total;
    for (let k = 0; k < cells.length; k++) {
      x -= weights[k];
      if (x <= 0) return cells[k];
    }
    return cells[cells.length - 1];
  }

  /** Vừa: thử từng ô trống, chấm bằng hai-khoảng cách, chọn ô điểm cao nhất (nhiễu nhỏ để không lặp một kiểu). */
  function greedyTwoDistance(g, rng, noise) {
    const n = g.n;
    const me = g.turn;
    const b = g.board.slice();
    let best = -1, bestV = -Infinity;
    for (let i = 0; i < b.length; i++) {
      if (b[i]) continue;
      b[i] = me;
      const v = evaluate(b, n, me) + rng() * noise;
      b[i] = EMPTY;
      if (v > bestV) {
        bestV = v;
        best = i;
      }
    }
    return best;
  }

  // Khó: số vòng MCTS tối đa và thời gian nghĩ (ms) theo cỡ bàn
  const HARD_ITER = 200000;
  const HARD_MS = { 7: 1200, 9: 1800, 11: 2600 };

  /**
   * Bước 1 của việc chọn nước: các trường hợp quyết ngay (mở đầu, đổi bên, thắng ngay, chặn, Dễ, Vừa)
   * trả { move, reason }; Khó cần tìm kiếm thì trả { search, reason: 'search' } để người gọi tự chạy
   * search.run(...) (một lần, hoặc từng khúc theo khung hình khi không có Web Worker).
   */
  function planMove(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    const rng = mulberry32(o.seed == null ? 12345 : o.seed);
    if (g.winner) return { move: null, reason: 'over' };
    if (!g.moves.length) return { move: opening(g, level, rng), reason: 'opening' };
    if (canSwap(g) && shouldSwap(g, level)) return { move: SWAP, reason: 'swap' };
    const me = g.turn;
    const wins = winningCells(g.board, g.n, me);
    const threats = winningCells(g.board, g.n, 3 - me);
    if (level === 'easy') {
      if (wins.length && rng() < 0.85) return { move: wins[0], reason: 'win' };
      if (threats.length && rng() < 0.5) return { move: threats[0], reason: 'block' };
      return { move: weightedPick(g, rng), reason: 'random' };
    }
    if (wins.length) return { move: wins[0], reason: 'win' };
    if (threats.length === 1) return { move: threats[0], reason: 'block' };
    if (level === 'medium') return { move: greedyTwoDistance(g, rng, 30), reason: 'eval' };
    return { search: createSearch(g, { rng }), reason: 'search' };
  }

  /**
   * Chọn nước cho bên tới lượt.
   * opts: { level, seed, iterations (Khó: số vòng MCTS, tất định), timeMs (Khó: giới hạn thời gian), now }
   * Trả { move, reason }.
   */
  function chooseMove(g, opts) {
    const o = opts || {};
    const plan = planMove(g, o);
    if (!plan.search) return plan;
    const search = plan.search;
    const now = o.now || (() => Date.now());
    const iters = o.iterations || HARD_ITER;
    const deadline = o.iterations ? null : now() + (o.timeMs || HARD_MS[g.n]);
    search.run(iters, deadline, now);
    return { move: search.best(), reason: 'search', iterations: search.iterations };
  }

  return {
    EMPTY, RED, BLUE, SWAP, SIZES, LEVELS, VERSION, DIRS, HARD_MS,
    geo, rowOf, colOf, cellName, mirror, onEdge, UnionFind, winnerOf,
    newGame, canSwap, legalMoves, play, stoneCount, winningPath, toJSON, fromJSON,
    mulberry32, winningCells, centerDist, twoDistance, evaluate, createSearch, planMove, chooseMove,
  };
}

(function (root) {
  const api = HexFactory();
  api.factory = HexFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
