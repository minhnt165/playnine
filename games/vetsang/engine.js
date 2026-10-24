/* =====================================================================
 * Vệt Sáng - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới W × H ô. Hai xe (0 = người chơi, 1 = máy) mỗi tick đi đúng một ô, ô đã đi qua thành vệt.
 *     Đâm tường / vệt là thua hiệp; cả hai cùng đâm trong một tick (kể cả lao vào cùng một ô) là hòa, hiệp đấu lại.
 *     Ai thắng TARGET hiệp trước thắng trận.
 *   - Mô phỏng theo bước cố định DT = 1/120 s: step(state, opts) trả trạng thái mới (không sửa trạng thái cũ),
 *     sự kiện của bước nằm ở state.events (đếm ngược, rẽ, va chạm, hết hiệp, hết trận) để app phát âm thanh / hiệu ứng.
 *     Tốc độ (ô / giây) tăng dần theo thời gian của hiệp; khi dồn đủ một ô thì có một tick trên lưới.
 *   - Người chơi rẽ qua hàng đợi (turn / turnRel): bấm nhanh hai lần trước một tick thì dùng ở hai tick liên tiếp.
 *   - Tất định theo seed + chuỗi input: mọi ngẫu nhiên (vị trí xuất phát, máy) lấy từ PRNG trong state.
 *   - Máy theo mức: Dễ chỉ tránh ô trước mặt, Vừa chọn hướng có vùng trống lớn nhất (flood fill),
 *     Khó phân vùng Voronoi + tìm kiếm 2 lượt đi (máy, người) với thời gian phản ứng 2 tick khi nhìn đối thủ.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const HZ = 120;
  const DT = 1 / HZ;
  const W = 40;
  const H = 40;
  const N = W * H;
  const TARGET = 3; // số hiệp thắng để thắng trận
  const COUNT_STEP = 72; // mỗi số đếm ngược 0,6 s
  const COUNTDOWN = 3 * COUNT_STEP; // 1,8 s trước mỗi hiệp (và khi chơi tiếp giữa hiệp)
  const CRASH_PAUSE = 144; // 1,2 s nghỉ sau mỗi hiệp
  const SPEED0 = 8; // ô / giây lúc đầu hiệp
  const SPEED_ACC = 0.12; // ô / giây, tăng mỗi giây
  const SPEED_MAX = 14;
  const QUEUE_MAX = 3;
  const HIST = 4; // số vị trí gần nhất của mỗi xe giữ lại (cho thời gian phản ứng của máy)
  const START_Y = 6; // xe người chơi xuất phát cách cạnh dưới 6 ô, máy cách cạnh trên 6 ô (đối xứng tâm)

  // Hướng: 0 lên, 1 phải, 2 xuống, 3 trái
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const PHASES = ['countdown', 'play', 'crash', 'over'];

  // miss = xác suất "không nhìn" (đi thẳng dù trước mặt là tường), wander = xác suất rẽ ngẫu nhiên khi đang thoáng,
  // error = xác suất chọn bừa một hướng an toàn, lag = số tick trễ khi nhìn đối thủ, depth = số lượt (máy + người) tìm trước.
  const LEVELS = {
    easy: { miss: 0.07, wander: 0.05 },
    medium: { error: 0.02 },
    hard: { lag: 2, depth: 2 },
  };
  const WIN = 10000;
  const DRAW = -2000; // hòa tốt hơn thua nhưng tệ hơn mọi thế còn sống: máy Khó không cố ý đâm đầu

  /* ---------------- PRNG (mulberry32) ---------------- */
  function hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const str = String(seed == null ? '' : seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h;
  }
  /** Số ngẫu nhiên [0, 1) từ s.rng; đổi s.rng (chỉ gọi trên bản sao trong step). */
  function rand(s) {
    s.rng = (s.rng + 0x6d2b79f5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const idx = (x, y) => x + y * W;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const free = (g, x, y) => x >= 0 && y >= 0 && x < W && y < H && g[x + y * W] === 0;
  const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  const speedAt = (time) => Math.min(SPEED_MAX, SPEED0 + (SPEED_ACC * time) / HZ);

  /* ---------------- Ván mới / hiệp mới ---------------- */
  /** Đặt hai xe về chỗ xuất phát (lệch ngang ngẫu nhiên, đối xứng tâm), lưới sạch, đếm ngược. */
  function setupRound(s) {
    const ax = 8 + Math.floor(rand(s) * 8);
    const ay = H - START_Y;
    const bx = W - 1 - ax;
    const by = H - 1 - ay;
    s.grid = new Uint8Array(N);
    s.grid[idx(ax, ay)] = 1;
    s.grid[idx(bx, by)] = 2;
    s.bikes = [
      { x: ax, y: ay, dir: 0, alive: true, path: [ax, ay] },
      { x: bx, y: by, dir: 2, alive: true, path: [bx, by] },
    ];
    s.hist = [[[ax, ay, 0]], [[bx, by, 2]]];
    s.queue = [];
    s.time = 0;
    s.move = 0;
    s.ticks = 0;
    s.round++;
    s.phase = 'countdown';
    s.timer = COUNTDOWN;
  }

  function newGame(opts) {
    const o = opts || {};
    const s = {
      level: LEVELS[o.level] ? o.level : 'medium',
      rng: hashSeed(o.seed),
      score: [0, 0],
      round: 0,
      draws: 0,
      started: false,
      winner: null,
      last: null, // kết quả hiệp vừa xong: 0 / 1 = ai thắng, -1 = hòa
      events: [],
    };
    setupRound(s);
    return s;
  }

  /** Bản sao nông: lưới, đường đi và lịch sử dùng chung tới khi tick thay bằng bản mới (copy-on-write). */
  function clone(s) {
    return {
      level: s.level,
      rng: s.rng,
      score: [s.score[0], s.score[1]],
      round: s.round,
      draws: s.draws,
      started: s.started,
      winner: s.winner,
      last: s.last,
      phase: s.phase,
      timer: s.timer,
      time: s.time,
      move: s.move,
      ticks: s.ticks,
      grid: s.grid,
      bikes: s.bikes.map((b) => ({ x: b.x, y: b.y, dir: b.dir, alive: b.alive, path: b.path })),
      hist: s.hist,
      queue: s.queue.slice(),
      events: [],
    };
  }

  /** Đường đi lưu dạng các điểm góc [x0, y0, x1, y1, …], điểm cuối là đầu xe. Trả mảng mới. */
  function extendPath(path, x, y) {
    const n = path.length;
    const out = path.slice();
    if (n >= 4) {
      const hx = path[n - 2];
      const hy = path[n - 1];
      if (Math.sign(hx - path[n - 4]) === x - hx && Math.sign(hy - path[n - 3]) === y - hy) {
        out[n - 2] = x;
        out[n - 1] = y;
        return out;
      }
    }
    out.push(x, y);
    return out;
  }

  /* ---------------- Điều khiển người chơi ---------------- */
  const refDir = (s) => (s.queue.length ? s.queue[s.queue.length - 1] : s.bikes[0].dir);

  /** Rẽ theo hướng tuyệt đối (phím mũi tên, vuốt). Trùng hướng / quay đầu / hàng đầy thì bỏ qua. */
  function turn(s, dir) {
    if (!isInt(dir, 0, 3) || (s.phase !== 'play' && s.phase !== 'countdown')) return s;
    const ref = refDir(s);
    if (dir === ref || dir === (ref + 2) % 4 || s.queue.length >= QUEUE_MAX) return s;
    const n = clone(s);
    n.queue.push(dir);
    return n;
  }
  /** Rẽ trái (side < 0) / phải (side > 0) so với hướng sẽ đi sau các lệnh đang chờ. */
  function turnRel(s, side) {
    const ref = refDir(s);
    return turn(s, (ref + (side < 0 ? 3 : 1)) % 4);
  }

  /* ---------------- Bước mô phỏng ---------------- */
  /**
   * Một bước 1/120 s. opts.pick = [fn0, fn1] (tùy chọn): hàm (state, i) → hướng cho xe i thay cho hàng đợi / máy
   * (dùng cho bot mô phỏng); bỏ trống thì xe 0 theo hàng đợi, xe 1 là máy theo mức của ván.
   */
  function step(s, opts) {
    const n = clone(s);
    if (n.phase === 'over') return n;
    if (n.phase === 'countdown') {
      if (n.timer % COUNT_STEP === 0) n.events.push({ type: 'count', n: n.timer / COUNT_STEP });
      n.timer--;
      if (n.timer <= 0) {
        n.timer = 0;
        n.phase = 'play';
        n.started = true;
        n.events.push({ type: 'go' });
      }
      return n;
    }
    if (n.phase === 'crash') {
      n.timer--;
      if (n.timer <= 0) {
        setupRound(n);
        n.events.push({ type: 'newround', round: n.round });
      }
      return n;
    }
    n.time++;
    n.move += speedAt(n.time) * DT;
    if (n.move >= 1 - 1e-9) {
      n.move = Math.max(0, n.move - 1);
      tick(n, opts && opts.pick);
    }
    return n;
  }

  /** Một tick trên lưới: hai xe chọn hướng trên cùng một lưới rồi cùng đi một ô. Sửa trực tiếp n (bản sao). */
  function tick(n, pick) {
    const dirs = [0, 0];
    for (let i = 0; i < 2; i++) {
      const b = n.bikes[i];
      let d = b.dir;
      const fn = pick && pick[i];
      if (fn) {
        const want = fn(n, i);
        if (isInt(want, 0, 3) && want !== (b.dir + 2) % 4) d = want;
      } else if (i === 0) {
        while (n.queue.length) {
          const q = n.queue.shift();
          if (q !== b.dir && q !== (b.dir + 2) % 4) {
            d = q;
            break;
          }
        }
      } else d = decide(n, 1, n.level);
      dirs[i] = d;
    }
    const nx = [0, 0];
    const ny = [0, 0];
    const dead = [false, false];
    for (let i = 0; i < 2; i++) {
      nx[i] = n.bikes[i].x + DX[dirs[i]];
      ny[i] = n.bikes[i].y + DY[dirs[i]];
      dead[i] = !free(n.grid, nx[i], ny[i]);
    }
    if (nx[0] === nx[1] && ny[0] === ny[1]) dead[0] = dead[1] = true;
    if (dirs[0] !== n.bikes[0].dir) n.events.push({ type: 'turn', who: 0 });
    n.grid = n.grid.slice();
    const hist = n.hist.slice();
    for (let i = 0; i < 2; i++) {
      const b = n.bikes[i];
      b.dir = dirs[i];
      if (dead[i]) {
        b.alive = false;
        continue;
      }
      n.grid[idx(nx[i], ny[i])] = i + 1;
      b.x = nx[i];
      b.y = ny[i];
      b.path = extendPath(b.path, b.x, b.y);
      const h = hist[i].concat([[b.x, b.y, b.dir]]);
      hist[i] = h.length > HIST ? h.slice(h.length - HIST) : h;
    }
    n.hist = hist;
    n.ticks++;
    if (!dead[0] && !dead[1]) return;
    const w = dead[0] && dead[1] ? -1 : dead[0] ? 1 : 0;
    n.events.push({ type: 'crash', who: [dead[0], dead[1]], at: [[nx[0], ny[0]], [nx[1], ny[1]]] });
    n.last = w;
    if (w < 0) n.draws++;
    else n.score[w]++;
    n.events.push({ type: 'round', winner: w, score: n.score.slice() });
    if (w >= 0 && n.score[w] >= TARGET) {
      n.phase = 'over';
      n.winner = w;
      n.timer = 0;
      n.events.push({ type: 'over', winner: w });
    } else {
      n.phase = 'crash';
      n.timer = CRASH_PAUSE;
    }
  }

  /** Chơi tiếp sau khi tạm dừng / mở lại ván lưu: hiệp đang chạy dừng lại đếm ngược (giữ vệt), hàng đợi rẽ xóa. */
  function resume(s) {
    const n = clone(s);
    if (n.phase === 'play') {
      n.phase = 'countdown';
      n.timer = COUNTDOWN;
      n.queue = [];
    }
    return n;
  }

  const isOver = (s) => s.phase === 'over';
  const countdownNumber = (s) => Math.max(1, Math.ceil(s.timer / COUNT_STEP));

  /* ---------------- Máy ---------------- */
  // Bộ đệm dùng lại cho flood fill / BFS (không cấp phát trong vòng lặp)
  const stack = new Int16Array(N);
  const mark = new Uint32Array(N);
  let stamp = 0;
  const owner = new Uint8Array(N);
  const dist = new Int16Array(N);

  /** Đánh dấu vùng ô trống nối với ô start (ô start tính cả khi đã bị chiếm). Trả số ô (kể cả start). */
  function region(g, start) {
    stamp++;
    if (stamp === 0xffffffff) {
      mark.fill(0);
      stamp = 1;
    }
    let top = 0;
    let count = 0;
    stack[top++] = start;
    mark[start] = stamp;
    while (top) {
      const c = stack[--top];
      count++;
      const x = c % W;
      if (x > 0 && g[c - 1] === 0 && mark[c - 1] !== stamp) {
        mark[c - 1] = stamp;
        stack[top++] = c - 1;
      }
      if (x < W - 1 && g[c + 1] === 0 && mark[c + 1] !== stamp) {
        mark[c + 1] = stamp;
        stack[top++] = c + 1;
      }
      if (c >= W && g[c - W] === 0 && mark[c - W] !== stamp) {
        mark[c - W] = stamp;
        stack[top++] = c - W;
      }
      if (c < N - W && g[c + W] === 0 && mark[c + W] !== stamp) {
        mark[c + W] = stamp;
        stack[top++] = c + W;
      }
    }
    return count;
  }

  /** Số ô bị chặn (vệt hoặc tường) quanh ô (x, y): càng nhiều càng "bám tường", lấp vùng gọn. */
  function hug(g, x, y) {
    let k = 0;
    for (let d = 0; d < 4; d++) if (!free(g, x + DX[d], y + DY[d])) k++;
    return k;
  }

  /** Chọn hướng có vùng trống lớn nhất; hòa thì (nếu bám tường) chọn ô sát vệt hơn, rồi theo thứ tự cand. */
  function fillMove(g, b, cand, withHug) {
    let best = cand[0];
    let bestArea = -1;
    let bestHug = -1;
    for (let i = 0; i < cand.length; i++) {
      const d = cand[i];
      const x = b.x + DX[d];
      const y = b.y + DY[d];
      const area = region(g, idx(x, y));
      const h = withHug ? hug(g, x, y) : 0;
      if (area > bestArea || (area === bestArea && h > bestHug)) {
        best = d;
        bestArea = area;
        bestHug = h;
      }
    }
    return best;
  }

  /**
   * Phân vùng Voronoi: BFS đồng thời từ hai đầu xe, ô tới trước là của xe đó, tới cùng lúc là trung lập.
   * Trả (số ô của a) − (số ô của b).
   */
  function voronoi(g, ia, ib) {
    owner.fill(0);
    let head = 0;
    let tail = 0;
    let score = 0;
    owner[ia] = 1;
    dist[ia] = 0;
    stack[tail++] = ia;
    owner[ib] = 2;
    dist[ib] = 0;
    stack[tail++] = ib;
    while (head < tail) {
      const c = stack[head++];
      const o = owner[c];
      if (o === 3) continue;
      const nd = dist[c] + 1;
      const x = c % W;
      for (let k = 0; k < 4; k++) {
        let m;
        if (k === 0) {
          if (x === 0) continue;
          m = c - 1;
        } else if (k === 1) {
          if (x === W - 1) continue;
          m = c + 1;
        } else if (k === 2) {
          if (c < W) continue;
          m = c - W;
        } else {
          if (c >= N - W) continue;
          m = c + W;
        }
        if (g[m] !== 0) continue;
        const om = owner[m];
        if (om === 0) {
          owner[m] = o;
          dist[m] = nd;
          stack[tail++] = m;
          score += o === 1 ? 1 : -1;
        } else if (om !== o && om !== 3 && dist[m] === nd) {
          score -= om === 1 ? 1 : -1;
          owner[m] = 3;
        }
      }
    }
    return score;
  }

  /** Giá trị khi a đã chọn đi tới (ax, ay) và b (đối thủ) chọn đường tệ nhất cho a. g được sửa tạm rồi trả lại. */
  function reply(g, ax, ay, ad, o, depth, alpha) {
    const aDead = !free(g, ax, ay);
    let worst = Infinity;
    const opts = [o.dir, (o.dir + 3) % 4, (o.dir + 1) % 4];
    for (let i = 0; i < 3; i++) {
      const od = opts[i];
      const bx = o.x + DX[od];
      const by = o.y + DY[od];
      const bDead = !free(g, bx, by);
      let v;
      if ((ax === bx && ay === by) || (aDead && bDead)) v = DRAW;
      else if (aDead) v = -WIN - depth; // thua càng sớm càng tệ
      else if (bDead) v = WIN + depth;
      else {
        const ia = idx(ax, ay);
        const ib = idx(bx, by);
        g[ia] = 1;
        g[ib] = 2;
        v = depth <= 1 ? voronoi(g, ia, ib) : best(g, { x: ax, y: ay, dir: ad }, { x: bx, y: by, dir: od }, depth - 1, null);
        g[ia] = 0;
        g[ib] = 0;
      }
      if (v < worst) worst = v;
      if (worst <= alpha) break; // a đã có nước tốt hơn: không cần xét tiếp
    }
    return worst;
  }

  /** Nước tốt nhất của a (max) trước mọi đáp trả của b (min), sâu depth lượt. moves: danh sách hướng được xét. */
  function best(g, a, o, depth, moves, out) {
    const cand = moves || [a.dir, (a.dir + 3) % 4, (a.dir + 1) % 4];
    let bestV = -Infinity;
    for (let i = 0; i < cand.length; i++) {
      const d = cand[i];
      const v = reply(g, a.x + DX[d], a.y + DY[d], d, o, depth, bestV);
      if (v > bestV) {
        bestV = v;
        if (out) out.dir = d;
      }
    }
    return bestV;
  }

  /** Thế giới mà máy "thấy": đối thủ ở vị trí lag tick trước, các ô nó vừa đi qua sau đó coi như còn trống. */
  function lagView(s, me, lag) {
    const h = s.hist[1 - me];
    const k = Math.min(lag, h.length - 1);
    const g = s.grid.slice();
    for (let i = h.length - k; i < h.length; i++) g[idx(h[i][0], h[i][1])] = 0;
    const p = h[h.length - 1 - k];
    return { g, opp: { x: p[0], y: p[1], dir: p[2] } };
  }

  /** Máy chọn hướng cho xe `me` theo mức. Dùng PRNG của s (chỉ gọi trên bản sao trong step, hoặc trong bot / test). */
  function decide(s, me, level) {
    const cfg = LEVELS[level] || LEVELS.medium;
    const b = s.bikes[me];
    const g = s.grid;
    const d = b.dir;
    const flip = rand(s) < 0.5; // thứ tự xét rẽ trái / phải ngẫu nhiên để máy không thiên một phía
    const cand = flip ? [d, (d + 1) % 4, (d + 3) % 4] : [d, (d + 3) % 4, (d + 1) % 4];
    let safe = cand.filter((k) => free(g, b.x + DX[k], b.y + DY[k]));
    if (level === 'easy') {
      if (rand(s) < cfg.miss) return d;
      const sides = safe.filter((k) => k !== d);
      if (safe[0] === d) return sides.length && rand(s) < cfg.wander ? sides[Math.floor(rand(s) * sides.length)] : d;
      return sides.length ? sides[Math.floor(rand(s) * sides.length)] : d;
    }
    if (!safe.length) return d;
    if (safe.length === 1) return safe[0];
    if (level === 'medium') {
      if (rand(s) < cfg.error) return safe[Math.floor(rand(s) * safe.length)];
      return fillMove(g, b, safe, false);
    }
    // Khó: phản xạ tránh ô mà đầu xe đối thủ (vị trí thật) có thể lao vào ngay tick này, nếu còn lối khác
    const ob = s.bikes[1 - me];
    const calm = safe.filter((k) => Math.abs(b.x + DX[k] - ob.x) + Math.abs(b.y + DY[k] - ob.y) > 1);
    if (calm.length && calm.length < safe.length) safe = calm;
    if (safe.length === 1) return safe[0];
    // Còn chung vùng với đối thủ thì tranh vùng (Voronoi + tìm kiếm); đã tách vùng thì lấp vùng của mình cho gọn
    const view = lagView(s, me, cfg.lag);
    region(view.g, idx(b.x, b.y));
    const o = view.opp;
    let together = false;
    for (let k = 0; k < 4 && !together; k++) {
      const x = o.x + DX[k];
      const y = o.y + DY[k];
      if (inside(x, y) && mark[idx(x, y)] === stamp) together = true;
    }
    if (!together) return fillMove(g, b, safe, true);
    const out = { dir: safe[0] };
    best(view.g, b, o, cfg.depth, safe, out);
    return out.dir;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(s) {
    return {
      v: VERSION,
      level: s.level,
      rng: s.rng,
      score: s.score.slice(),
      round: s.round,
      draws: s.draws,
      started: s.started,
      winner: s.winner,
      last: s.last,
      phase: s.phase,
      timer: s.timer,
      time: s.time,
      move: s.move,
      ticks: s.ticks,
      bikes: s.bikes.map((b) => ({ x: b.x, y: b.y, dir: b.dir, alive: b.alive, path: b.path.slice() })),
      queue: s.queue.slice(),
      hist: s.hist.map((h) => h.map((p) => p.slice())),
    };
  }

  /** Vẽ đường đi lên lưới; đoạn chéo / ra ngoài / đè ô đã có thì trả false. */
  function drawPath(g, path, v) {
    if (!Array.isArray(path) || path.length < 2 || path.length % 2 || !path.every((n) => isInt(n, 0, Math.max(W, H) - 1))) return false;
    if (!inside(path[0], path[1]) || g[idx(path[0], path[1])]) return false;
    g[idx(path[0], path[1])] = v;
    for (let i = 2; i < path.length; i += 2) {
      let x = path[i - 2];
      let y = path[i - 1];
      const tx = path[i];
      const ty = path[i + 1];
      if (!inside(tx, ty) || (x !== tx) === (y !== ty)) return false; // phải đi đúng một trục, khác điểm trước
      const sx = Math.sign(tx - x);
      const sy = Math.sign(ty - y);
      while (x !== tx || y !== ty) {
        x += sx;
        y += sy;
        if (g[idx(x, y)]) return false;
        g[idx(x, y)] = v;
      }
    }
    return true;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !LEVELS[raw.level]) return null;
    const r = raw;
    if (!isInt(r.rng, 0, 0xffffffff)) return null;
    if (!Array.isArray(r.score) || r.score.length !== 2 || !r.score.every((v) => isInt(v, 0, TARGET))) return null;
    if (!isInt(r.round, 1, 1e6) || !isInt(r.draws, 0, r.round) || typeof r.started !== 'boolean') return null;
    if (PHASES.indexOf(r.phase) < 0 || !isInt(r.timer, 0, Math.max(COUNTDOWN, CRASH_PAUSE))) return null;
    if (!isInt(r.time, 0, 1e9) || !isInt(r.ticks, 0, 1e9) || typeof r.move !== 'number' || !(r.move >= 0 && r.move < 1)) return null;
    if (r.last !== null && !isInt(r.last, -1, 1)) return null;
    if (r.phase === 'over') {
      if (!isInt(r.winner, 0, 1) || r.score[r.winner] !== TARGET) return null;
    } else if (r.winner !== null || r.score[0] >= TARGET || r.score[1] >= TARGET) return null;
    if (!Array.isArray(r.queue) || r.queue.length > QUEUE_MAX || !r.queue.every((v) => isInt(v, 0, 3))) return null;
    if (!Array.isArray(r.bikes) || r.bikes.length !== 2 || !Array.isArray(r.hist) || r.hist.length !== 2) return null;
    const grid = new Uint8Array(N);
    const bikes = [];
    for (let i = 0; i < 2; i++) {
      const b = r.bikes[i];
      if (!b || typeof b !== 'object' || !isInt(b.x, 0, W - 1) || !isInt(b.y, 0, H - 1) || !isInt(b.dir, 0, 3) || typeof b.alive !== 'boolean') return null;
      if (!drawPath(grid, b.path, i + 1)) return null;
      if (b.path[b.path.length - 2] !== b.x || b.path[b.path.length - 1] !== b.y) return null;
      if ((r.phase === 'play' || r.phase === 'countdown') && !b.alive) return null;
      const h = r.hist[i];
      if (!Array.isArray(h) || h.length < 1 || h.length > HIST) return null;
      if (!h.every((p) => Array.isArray(p) && p.length === 3 && isInt(p[0], 0, W - 1) && isInt(p[1], 0, H - 1) && isInt(p[2], 0, 3))) return null;
      const last = h[h.length - 1];
      if (last[0] !== b.x || last[1] !== b.y) return null;
      bikes.push({ x: b.x, y: b.y, dir: b.dir, alive: b.alive, path: b.path.slice() });
    }
    return {
      level: r.level,
      rng: r.rng,
      score: r.score.slice(),
      round: r.round,
      draws: r.draws,
      started: r.started,
      winner: r.winner,
      last: r.last,
      phase: r.phase,
      timer: r.timer,
      time: r.time,
      move: r.move,
      ticks: r.ticks,
      grid,
      bikes,
      hist: r.hist.map((h) => h.map((p) => p.slice())),
      queue: r.queue.slice(),
      events: [],
    };
  }

  const api = {
    VERSION, HZ, DT, W, H, TARGET, COUNTDOWN, COUNT_STEP, CRASH_PAUSE, SPEED0, SPEED_ACC, SPEED_MAX, QUEUE_MAX, DX, DY, LEVELS,
    newGame, step, turn, turnRel, resume, decide, isOver, countdownNumber, speedAt, free, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
