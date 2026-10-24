/* =====================================================================
 * Mê Cung Ma - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Đom đóm đi trong mê cung ăn đốm sáng; 4 con ma đuổi theo, mỗi con một tính cách
 *   - Mô phỏng bước thời gian cố định 60 bước / giây: step(g) đổi trực tiếp trạng thái g
 *   - Toạ độ nguyên: mỗi ô U = 1000 đơn vị, tâm ô (c, r) ở (c·U, r·U); nhân vật luôn nằm trên trục ô
 *   - Tất định theo seed + chuỗi lệnh: ma sợ rẽ ngẫu nhiên bằng mulberry32, trạng thái nằm trong ván (rs)
 * Ký hiệu mê cung: '#' tường, '.' đốm sáng, 'o' đốm lớn, ' ' đường trống, 'T' đường hầm (ma đi chậm),
 *   'P' chỗ đom đóm xuất phát, 'F' chỗ trái cây, 'G' cửa ra của chuồng ma (ngay trên cửa '-'), 'H' trong chuồng.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const SPS = 60; // bước mô phỏng mỗi giây
  const STEP_MS = 1000 / SPS;
  const U = 1000; // đơn vị trong một ô
  const COLS = 19;
  const ROWS = 21;
  const START_LIVES = 3;
  const MAX_LIVES = 5;
  const BONUS_LIFE = 10000; // thêm một mạng (một lần) khi đạt chừng này điểm
  const DOT = 10;
  const POWER = 50;
  const GHOST_BASE = 200; // ăn ma liên tiếp: 200, 400, 800, 1600
  const FRUITS = [100, 300, 500, 700, 1000, 2000, 3000, 5000]; // điểm trái cây theo màn (màn 8 trở đi giữ 5000)
  const FRUIT_STEPS = 570; // trái cây nằm 9,5 giây
  const FRUIT_AT = [0.3, 0.7]; // trái cây hiện khi ăn được 30% và 70% số đốm của màn
  const START_STEPS = 120; // "Sẵn sàng" đầu ván (2 giây)
  const READY_STEPS = 90; // "Sẵn sàng" sau khi mất mạng / sang màn (1,5 giây)
  const DIE_STEPS = 90; // hoạt cảnh mất mạng
  const CLEAR_STEPS = 120; // mê cung nhấp nháy khi ăn hết đốm
  const EAT_STEPS = 30; // khựng lại nửa giây khi ăn ma
  const HIT = 550; // khoảng cách tâm (đơn vị) coi là chạm ma
  const CORNER = 300; // vừa lướt qua tâm ngã rẽ chưa quá chừng này mà bấm rẽ thì vẫn rẽ được (đỡ trễ tay)
  const DOG_RANGE = 8; // ma "Lơ Ngơ" chỉ đuổi khi cách xa hơn chừng này ô

  const DIRS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
  const ORDER = ['up', 'left', 'down', 'right']; // thứ tự ưu tiên khi hai hướng bằng nhau
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const STATES = ['house', 'leave', 'active', 'eyes', 'enter'];
  const PHASES = ['ready', 'play', 'freeze', 'dying', 'clear', 'over'];

  /* ---------------- Mê cung (tự thiết kế, đối xứng trái phải, xoay vòng theo màn) ---------------- */
  const MAZES = [
    [
      '###################',
      '#........#........#',
      '#o##.###.#.###.##o#',
      '#.................#',
      '#.##.#.#####.#.##.#',
      '#....#...#...#....#',
      '####.### # ###.####',
      '####.#   G   #.####',
      '####.# ##-## #.####',
      'TTTT.  #HHH#  .TTTT',
      '####.# ##### #.####',
      '####.#   F   #.####',
      '####.# ##### #.####',
      '#........#........#',
      '#.##.###.#.###.##.#',
      '#o.#.....P.....#.o#',
      '##.#.#.#####.#.#.##',
      '#....#...#...#....#',
      '#.######.#.######.#',
      '#.................#',
      '###################',
    ],
    [
      '###################',
      '#.....#.....#.....#',
      '#.###.#.###.#.###.#',
      '#o#.............#o#',
      '#.#.##.#####.##.#.#',
      '#...#.........#...#',
      '###.#.###.###.#.###',
      '###...   G   ...###',
      '###.## ##-## ##.###',
      '###.#  #HHH#  #.###',
      '###.# ####### #.###',
      'TTT......F......TTT',
      '###.#.#######.#.###',
      '#.................#',
      '#.###.#.###.#.###.#',
      '#o#...#..P..#...#o#',
      '#.#.#.#.###.#.#.#.#',
      '#.....#.....#.....#',
      '#.###.#.###.#.###.#',
      '#.................#',
      '###################',
    ],
    [
      '###################',
      '#o.....#####.....o#',
      '#.####.#####.####.#',
      '#.................#',
      '###.##.#####.##.###',
      'TTT.............TTT',
      '###.#.#######.#.###',
      '#........G........#',
      '#.##.#.##-##.#.##.#',
      '#.#..#.#HHH#.#..#.#',
      '#.#.##.#####.##.#.#',
      '#........F........#',
      '###.#.###.###.#.###',
      'TTT.#....P....#.TTT',
      '###.#.###.###.#.###',
      '#o...............o#',
      '#.###.###.###.###.#',
      '#.................#',
      '#.##.#.#####.#.##.#',
      '#.................#',
      '###################',
    ],
  ];

  /** Đọc một mê cung: vị trí đặc biệt, đốm ban đầu (0 trống, 1 đốm, 2 đốm lớn). */
  function parseMaze(rows) {
    const m = { rows, dots: new Array(COLS * ROWS).fill(0), total: 0, slots: [], tunnelRows: [] };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = rows[r][c];
        const k = r * COLS + c;
        if (ch === '.') m.dots[k] = 1;
        else if (ch === 'o') m.dots[k] = 2;
        else if (ch === 'P') m.start = { c, r };
        else if (ch === 'F') m.fruit = { c, r };
        else if (ch === 'G') m.exit = { c, r };
        else if (ch === '-') m.door = { c, r };
        else if (ch === 'H') m.slots.push({ c, r });
        if (m.dots[k]) m.total++;
      }
      if (rows[r][0] === 'T') m.tunnelRows.push(r);
    }
    m.house = { c: m.door.c, r: m.door.r + 1 }; // giữa chuồng, ngay dưới cửa
    return m;
  }
  const PARSED = MAZES.map(parseMaze);

  const mod = (a, n) => ((a % n) + n) % n;
  const mazeIndex = (level) => (level - 1) % MAZES.length;
  const mazeOf = (g) => PARSED[mazeIndex(g.level)];
  function cell(m, c, r) {
    if (r < 0 || r >= ROWS) return '#';
    return m.rows[r][mod(c, COLS)];
  }
  /** Ô đi được (cho đom đóm và ma ngoài chuồng): không phải tường, cửa chuồng, trong chuồng. */
  function open(m, c, r) {
    const ch = cell(m, c, r);
    return ch !== '#' && ch !== '-' && ch !== 'H';
  }

  /* ---------------- Số ngẫu nhiên có seed (mulberry32, trạng thái nằm trong ván) ---------------- */
  function nextRand(g) {
    g.rs = (g.rs + 0x6d2b79f5) >>> 0;
    let x = g.rs;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return (x ^ (x >>> 14)) >>> 0;
  }

  /* ---------------- Thông số theo màn ---------------- */
  const spd = (tilesPerSec) => Math.round((tilesPerSec * U) / SPS); // ô / giây → đơn vị / bước
  function params(level) {
    const L = level - 1;
    return {
      player: spd(Math.min(7.6 + 0.2 * L, 9)),
      ghost: spd(Math.min(7.0 + 0.3 * L, 9.2)),
      tunnel: spd(Math.min(3.8 + 0.1 * L, 4.6)),
      fright: spd(Math.min(4.2 + 0.1 * L, 5)),
      eyes: spd(15),
      house: spd(4),
      frightSteps: Math.round(Math.max(2, 7 - level) * SPS),
      // bước (tính từ đầu mạng) để từng con ra khỏi chuồng
      release: (level === 1 ? [0, 1, 4, 7] : level <= 3 ? [0, 0.5, 2.5, 4.5] : [0, 0.3, 1.2, 2.2]).map((s) => Math.round(s * SPS)),
      // tản / đuổi xen kẽ (giây): chỉ số chẵn là tản, lẻ là đuổi; hết lịch thì đuổi mãi
      modes: (level === 1 ? [7, 20, 7, 20, 5, 20, 5] : level <= 4 ? [7, 20, 7, 20, 5, 60, 1] : [5, 20, 5, 20, 5, 60, 1]).map((s) => s * SPS),
    };
  }
  const fruitKind = (level) => Math.min(level - 1, FRUITS.length - 1);
  const scattering = (g) => g.modeIdx < params(g.level).modes.length && g.modeIdx % 2 === 0;

  /* ---------------- Ván mới / màn mới / về chỗ ---------------- */
  function newGame(seed) {
    const s = (Number.isFinite(seed) ? seed : Math.floor(Math.random() * 4294967296)) >>> 0;
    const g = {
      seed: s, rs: (s ^ 0x9e3779b9) >>> 0, level: 1, lives: START_LIVES, score: 0, bonus: false, t: 0,
      phase: 'ready', phaseT: START_STEPS, over: false,
      dots: null, dotsLeft: 0, dotsEaten: 0, fruit: null, fruitsShown: 0,
      modeIdx: 0, modeT: 0, frightT: 0, chain: 0, lifeT: 0,
      player: null, ghosts: null, events: [],
    };
    loadLevel(g);
    resetActors(g);
    return g;
  }

  function loadLevel(g) {
    const m = mazeOf(g);
    g.dots = m.dots.slice();
    g.dotsLeft = m.total;
    g.dotsEaten = 0;
    g.fruit = null;
    g.fruitsShown = 0;
  }

  /** Đặt đom đóm và ma về chỗ xuất phát (đầu màn, sau khi mất mạng); đồng hồ tản / đuổi chạy lại từ đầu. */
  function resetActors(g) {
    const m = mazeOf(g);
    g.player = { x: m.start.c * U, y: m.start.r * U, dir: 'left', want: null, moving: true };
    const ghost = (s, state) => ({ x: s.c * U, y: s.r * U, dir: state === 'active' ? 'left' : 'up', state, fright: false, rev: false, lc: -1 });
    g.ghosts = [
      ghost(m.exit, 'active'), // Lửa: đã ở ngoài cửa chuồng
      ghost(m.house, 'house'), // Rình: giữa chuồng
      ghost(m.slots[0], 'house'), // Sương: bên trái
      ghost(m.slots[m.slots.length - 1], 'house'), // Lơ Ngơ: bên phải
    ];
    g.ghosts[0].lc = m.exit.r * COLS + m.exit.c; // ra khỏi cửa là đi sang trái, không cân nhắc lại ở ô này
    g.modeIdx = 0;
    g.modeT = 0;
    g.frightT = 0;
    g.chain = 0;
    g.lifeT = 0;
  }

  /* ---------------- Hình học trên lưới ---------------- */
  const tileC = (e) => mod(Math.round(e.x / U), COLS);
  const tileR = (e) => Math.round(e.y / U);
  const atCenter = (e) => mod(e.x, U) === 0 && mod(e.y, U) === 0;
  /** Quãng tới tâm ô kế tiếp theo hướng dir (đang ở tâm thì là cả một ô). */
  function toNext(e, dir) {
    const v = dir === 'left' || dir === 'right' ? mod(e.x, U) : mod(e.y, U);
    if (v === 0) return U;
    return dir === 'right' || dir === 'down' ? U - v : v;
  }
  function wrap(e) {
    // đường hầm: ra mép này vào mép kia
    if (e.x < -U / 2) e.x += COLS * U;
    else if (e.x >= COLS * U - U / 2) e.x -= COLS * U;
  }
  function advance(e, dir, d) {
    e.x += DIRS[dir][0] * d;
    e.y += DIRS[dir][1] * d;
    wrap(e);
  }
  /** Khoảng cách bình phương giữa hai nhân vật (tính cả đường vòng qua hầm). */
  function dist2(a, b) {
    let dx = Math.abs(a.x - b.x);
    dx = Math.min(dx, COLS * U - dx);
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /* ---------------- Lệnh người chơi ---------------- */
  /** Đặt hướng muốn đi; lệnh được giữ tới ngã rẽ gần nhất đi được (bấm lại đúng hướng đang đi thì bỏ lệnh rẽ đang chờ). */
  function input(g, dir) {
    if (g.over || !DIRS[dir]) return g;
    const p = g.player;
    p.want = dir === p.dir && p.moving ? null : dir;
    return g;
  }

  /* ---------------- Điểm ---------------- */
  function addScore(g, n) {
    g.score += n;
    if (!g.bonus && g.score >= BONUS_LIFE) {
      g.bonus = true;
      if (g.lives < MAX_LIVES) g.lives++;
      g.events.push({ type: 'life', lives: g.lives });
    }
  }

  /** Đốm lớn: ma (trừ mắt ma) sợ; con đang đi thì quay đầu; chuỗi ăn ma tính lại từ 200. */
  function startFright(g) {
    g.frightT = params(g.level).frightSteps;
    g.chain = 0;
    for (const gh of g.ghosts) {
      if (gh.state === 'eyes' || gh.state === 'enter') continue;
      if (gh.state === 'active' && !gh.fright) gh.rev = true;
      gh.fright = true;
    }
  }

  /** Đom đóm vào ô có đốm / trái cây thì ăn. */
  function eat(g) {
    const m = mazeOf(g);
    const c = tileC(g.player);
    const r = tileR(g.player);
    const k = r * COLS + c;
    const d = g.dots[k];
    if (d) {
      g.dots[k] = 0;
      g.dotsLeft--;
      g.dotsEaten++;
      addScore(g, d === 2 ? POWER : DOT);
      g.events.push({ type: d === 2 ? 'power' : 'dot', c, r });
      if (d === 2) startFright(g);
      if (g.fruitsShown < FRUIT_AT.length && g.dotsEaten === Math.floor(m.total * FRUIT_AT[g.fruitsShown])) {
        g.fruit = { k: fruitKind(g.level), t: FRUIT_STEPS };
        g.fruitsShown++;
        g.events.push({ type: 'fruitShow', k: g.fruit.k });
      }
    }
    if (g.fruit && c === m.fruit.c && r === m.fruit.r) {
      const pts = FRUITS[g.fruit.k];
      addScore(g, pts);
      g.events.push({ type: 'fruit', k: g.fruit.k, points: pts, c, r });
      g.fruit = null;
    }
  }

  /* ---------------- Đom đóm ---------------- */
  function movePlayer(g, speed) {
    const m = mazeOf(g);
    const p = g.player;
    // quay đầu: làm ngay, không chờ ngã rẽ
    if (p.want && p.want === OPP[p.dir]) {
      p.dir = p.want;
      p.want = null;
      p.moving = true;
    }
    // vừa lướt qua tâm ngã rẽ (≤ CORNER) mà mới bấm rẽ: kéo về tâm rồi rẽ
    if (p.want && p.moving && !atCenter(p)) {
      const back = U - toNext(p, p.dir);
      if (back <= CORNER) {
        const v = DIRS[p.dir];
        const pc = { x: p.x - v[0] * back, y: p.y - v[1] * back };
        wrap(pc);
        const w = DIRS[p.want];
        if (open(m, tileC(pc) + w[0], tileR(pc) + w[1])) {
          p.x = pc.x;
          p.y = pc.y;
        }
      }
    }
    let dist = speed;
    while (dist > 0) {
      if (atCenter(p)) {
        const c = tileC(p);
        const r = tileR(p);
        if (p.want) {
          const w = DIRS[p.want];
          if (open(m, c + w[0], r + w[1])) {
            p.dir = p.want;
            p.want = null;
          }
        }
        const v = DIRS[p.dir];
        if (!open(m, c + v[0], r + v[1])) {
          p.moving = false;
          return;
        }
        p.moving = true;
      }
      const d = Math.min(dist, toNext(p, p.dir));
      advance(p, p.dir, d);
      dist -= d;
      eat(g);
      if (g.dotsLeft === 0) return;
    }
  }

  /* ---------------- Ma ---------------- */
  // Góc "tản" của từng con (ngoài mê cung, để chúng đi vòng quanh một góc)
  const CORNERS = [[COLS - 2, -2], [1, -2], [COLS, ROWS + 1], [-1, ROWS + 1]];

  /** Ô đích của ma i: tản về góc riêng, đuổi theo tính cách, mắt ma về cửa chuồng. */
  function targetOf(g, i) {
    const gh = g.ghosts[i];
    const m = mazeOf(g);
    if (gh.state === 'eyes') return [m.exit.c, m.exit.r];
    if (scattering(g)) return CORNERS[i];
    const p = g.player;
    const pc = tileC(p);
    const pr = tileR(p);
    const v = DIRS[p.dir];
    if (i === 0) return [pc, pr]; // Lửa: đuổi thẳng
    if (i === 1) return [pc + v[0] * 4, pr + v[1] * 4]; // Rình: chặn trước mặt 4 ô
    if (i === 2) {
      // Sương: phối hợp với Lửa, lấy điểm cách 2 ô trước mặt làm tâm rồi đối xứng vị trí của Lửa qua đó
      const ax = pc + v[0] * 2;
      const ay = pr + v[1] * 2;
      const b = g.ghosts[0];
      return [2 * ax - tileC(b), 2 * ay - tileR(b)];
    }
    // Lơ Ngơ: xa thì đuổi, lại gần (≤ DOG_RANGE ô) thì bỏ đi lang thang về góc của mình
    const dx = tileC(gh) - pc;
    const dy = tileR(gh) - pr;
    return dx * dx + dy * dy > DOG_RANGE * DOG_RANGE ? [pc, pr] : CORNERS[3];
  }

  /** Chọn hướng ở tâm ô: không quay đầu; ma sợ chọn ngẫu nhiên (theo seed), còn lại lấy ô kề gần đích nhất. */
  function chooseDir(g, i) {
    const gh = g.ghosts[i];
    const m = mazeOf(g);
    const c = tileC(gh);
    const r = tileR(gh);
    let opts = ORDER.filter((d) => d !== OPP[gh.dir] && open(m, c + DIRS[d][0], r + DIRS[d][1]));
    if (!opts.length) opts = [OPP[gh.dir]]; // phòng hờ (mê cung không có ngõ cụt)
    if (opts.length === 1) return opts[0];
    if (gh.fright && gh.state === 'active') return opts[nextRand(g) % opts.length];
    const [tx, ty] = targetOf(g, i);
    let best = opts[0];
    let bestD = Infinity;
    for (const d of opts) {
      const dx = c + DIRS[d][0] - tx;
      const dy = r + DIRS[d][1] - ty;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  function ghostSpeed(g, gh, P) {
    if (gh.state === 'eyes' || gh.state === 'enter') return P.eyes;
    if (gh.state === 'leave' || gh.state === 'house') return P.house;
    if (cell(mazeOf(g), tileC(gh), tileR(gh)) === 'T') return P.tunnel;
    return gh.fright ? P.fright : P.ghost;
  }

  /** Ma đi trong mê cung (đuổi / tản / sợ, hoặc chỉ còn mắt chạy về chuồng); chỉ rẽ ở tâm ô. */
  function moveInMaze(g, i, speed) {
    const gh = g.ghosts[i];
    const m = mazeOf(g);
    if (gh.rev) {
      gh.dir = OPP[gh.dir];
      gh.rev = false;
      gh.lc = -1; // quay về tâm ô vừa qua thì được chọn hướng lại (hướng cũ có thể là tường)
    }
    let dist = speed;
    while (dist > 0) {
      if (atCenter(gh)) {
        const key = tileR(gh) * COLS + tileC(gh);
        if (gh.lc !== key) {
          gh.lc = key;
          if (gh.state === 'eyes' && tileC(gh) === m.exit.c && tileR(gh) === m.exit.r) {
            gh.state = 'enter';
            gh.dir = 'down';
            moveScripted(g, i, dist);
            return;
          }
          gh.dir = chooseDir(g, i);
        }
      }
      const d = Math.min(dist, toNext(gh, gh.dir));
      advance(gh, gh.dir, d);
      dist -= d;
    }
  }

  /** Ra / vào chuồng theo đường cố định xuyên cửa: ngang tới cột cửa rồi lên ô cửa ra; hoặc từ cửa ra xuống giữa chuồng. */
  function moveScripted(g, i, speed) {
    const gh = g.ghosts[i];
    const m = mazeOf(g);
    if (gh.state === 'enter') {
      const hy = m.house.r * U;
      gh.y += Math.min(speed, hy - gh.y);
      gh.dir = 'down';
      if (gh.y >= hy) {
        gh.state = 'leave'; // hồi sinh rồi ra lại ngay
        gh.fright = false;
        gh.dir = 'up';
      }
      return;
    }
    const tx = m.exit.c * U;
    const ey = m.exit.r * U;
    let dist = speed;
    while (dist > 0) {
      if (gh.x !== tx) {
        const d = Math.min(dist, Math.abs(tx - gh.x));
        gh.dir = tx > gh.x ? 'right' : 'left';
        gh.x += tx > gh.x ? d : -d;
        dist -= d;
      } else if (gh.y > ey) {
        const d = Math.min(dist, gh.y - ey);
        gh.dir = 'up';
        gh.y -= d;
        dist -= d;
      } else {
        gh.state = 'active';
        gh.dir = 'left';
        gh.lc = m.exit.r * COLS + m.exit.c;
        return;
      }
    }
  }

  function moveGhosts(g, P) {
    g.ghosts.forEach((gh, i) => {
      if (gh.state === 'house') {
        if (g.lifeT >= P.release[i]) gh.state = 'leave';
        return;
      }
      const speed = ghostSpeed(g, gh, P);
      if (gh.state === 'leave' || gh.state === 'enter') moveScripted(g, i, speed);
      else moveInMaze(g, i, speed);
    });
  }

  /** Đom đóm chạm ma: ma thường thì mất mạng; ma sợ thì ăn được (điểm nhân đôi liên tiếp). */
  function collide(g) {
    const hits = g.ghosts.filter((gh) => (gh.state === 'active' || gh.state === 'leave') && dist2(gh, g.player) < HIT * HIT);
    if (!hits.length) return;
    if (hits.some((gh) => !gh.fright)) {
      g.phase = 'dying';
      g.phaseT = DIE_STEPS;
      g.frightT = 0;
      g.fruit = null;
      g.events.push({ type: 'die' });
      return;
    }
    for (const gh of hits) {
      g.chain = Math.min(g.chain + 1, 4);
      const pts = GHOST_BASE * Math.pow(2, g.chain - 1);
      addScore(g, pts);
      g.events.push({ type: 'ghost', i: g.ghosts.indexOf(gh), points: pts, chain: g.chain, x: gh.x / U, y: gh.y / U });
      gh.state = 'eyes';
      gh.fright = false;
      gh.rev = false;
      gh.lc = -1;
    }
    g.phase = 'freeze';
    g.phaseT = EAT_STEPS;
  }

  /* ---------------- Một bước mô phỏng ---------------- */
  function phaseTick(g) {
    if (--g.phaseT > 0) return;
    g.phaseT = 0;
    if (g.phase === 'ready' || g.phase === 'freeze') {
      if (g.phase === 'ready') g.events.push({ type: 'go' });
      g.phase = 'play';
    } else if (g.phase === 'dying') {
      g.lives--;
      if (g.lives <= 0) {
        g.lives = 0;
        g.phase = 'over';
        g.over = true;
        g.events.push({ type: 'over', score: g.score });
        return;
      }
      resetActors(g);
      g.phase = 'ready';
      g.phaseT = READY_STEPS;
      g.events.push({ type: 'respawn', lives: g.lives });
    } else if (g.phase === 'clear') {
      g.level++;
      loadLevel(g);
      resetActors(g);
      g.phase = 'ready';
      g.phaseT = READY_STEPS;
      g.events.push({ type: 'level', level: g.level });
    }
  }

  function step(g) {
    if (g.over) return g;
    g.t++;
    if (g.phase !== 'play') {
      phaseTick(g);
      return g;
    }
    const P = params(g.level);
    g.lifeT++;
    // ma đang sợ thì đồng hồ tản / đuổi đứng lại; hết sợ thì ma trở lại bình thường
    if (g.frightT > 0) {
      if (--g.frightT === 0) {
        g.chain = 0;
        g.ghosts.forEach((gh) => { gh.fright = false; });
        g.events.push({ type: 'frightEnd' });
      }
    } else if (g.modeIdx < P.modes.length && ++g.modeT >= P.modes[g.modeIdx]) {
      g.modeIdx++;
      g.modeT = 0;
      g.ghosts.forEach((gh) => { if (gh.state === 'active') gh.rev = true; });
      g.events.push({ type: 'mode', scatter: scattering(g) });
    }
    movePlayer(g, P.player);
    if (g.dotsLeft === 0) {
      g.phase = 'clear';
      g.phaseT = CLEAR_STEPS;
      g.fruit = null;
      g.frightT = 0;
      g.events.push({ type: 'clear', level: g.level });
      return g;
    }
    collide(g);
    if (g.phase !== 'play') return g;
    moveGhosts(g, P);
    collide(g);
    if (g.fruit && --g.fruit.t <= 0) g.fruit = null;
    return g;
  }

  /** Chơi tiếp sau tạm dừng / mở lại ván lưu: cho 1,5 giây "Sẵn sàng" để kịp nhìn lại bàn (pha khác giữ nguyên). */
  function getReady(g) {
    if (g.phase === 'play') {
      g.phase = 'ready';
      g.phaseT = READY_STEPS;
    }
    return g;
  }

  /** Lấy và xóa danh sách sự kiện (app phát âm thanh / hiệu ứng). */
  function drain(g) {
    const ev = g.events;
    g.events = [];
    return ev;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    const actor = (a) => ({ x: a.x, y: a.y, dir: a.dir });
    return {
      v: VERSION, seed: g.seed, rs: g.rs, level: g.level, lives: g.lives, score: g.score, bonus: g.bonus, t: g.t,
      phase: g.phase, phaseT: g.phaseT, dots: g.dots.join(''), dotsEaten: g.dotsEaten,
      fruit: g.fruit ? { k: g.fruit.k, t: g.fruit.t } : null, fruitsShown: g.fruitsShown,
      modeIdx: g.modeIdx, modeT: g.modeT, frightT: g.frightT, chain: g.chain, lifeT: g.lifeT,
      player: Object.assign(actor(g.player), { want: g.player.want, moving: g.player.moving }),
      ghosts: g.ghosts.map((gh) => Object.assign(actor(gh), { state: gh.state, fright: gh.fright, rev: gh.rev, lc: gh.lc })),
    };
  }

  const int = (v) => Number.isInteger(v);
  const nat = (v) => int(v) && v >= 0;
  /** Nhân vật nằm trong khung và trên trục ô (ít nhất một toạ độ ở tâm), hướng hợp lệ. */
  const onGrid = (a) => int(a.x) && int(a.y) && a.x >= -U / 2 && a.x < COLS * U - U / 2 && a.y >= 0 && a.y <= (ROWS - 1) * U &&
    (mod(a.x, U) === 0 || mod(a.y, U) === 0) && !!DIRS[a.dir];

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, rs, level, lives, score, bonus, t, phase, phaseT, dots, dotsEaten, fruit, fruitsShown, modeIdx, modeT, frightT, chain, lifeT, player, ghosts } = raw;
    if (!nat(seed) || seed > 0xffffffff || !nat(rs) || rs > 0xffffffff) return null;
    if (!int(level) || level < 1 || level > 999 || !nat(lives) || lives > MAX_LIVES || !nat(score) || typeof bonus !== 'boolean' || !nat(t)) return null;
    if (PHASES.indexOf(phase) < 0 || !nat(phaseT) || (phase === 'over') !== (lives === 0)) return null;
    if (!nat(modeIdx) || !nat(modeT) || !nat(frightT) || !nat(chain) || chain > 4 || !int(lifeT) || !nat(fruitsShown) || fruitsShown > FRUIT_AT.length) return null;
    const m = PARSED[mazeIndex(level)];
    if (typeof dots !== 'string' || dots.length !== COLS * ROWS) return null;
    const arr = new Array(COLS * ROWS);
    let left = 0;
    for (let k = 0; k < arr.length; k++) {
      const d = dots.charCodeAt(k) - 48;
      if (d !== 0 && d !== m.dots[k]) return null; // chỉ còn đốm ở đúng chỗ ban đầu
      arr[k] = d;
      if (d) left++;
    }
    if (!nat(dotsEaten) || dotsEaten !== m.total - left) return null;
    let fr = null;
    if (fruit != null) {
      if (typeof fruit !== 'object' || !nat(fruit.k) || fruit.k >= FRUITS.length || !int(fruit.t) || fruit.t < 1 || fruit.t > FRUIT_STEPS) return null;
      fr = { k: fruit.k, t: fruit.t };
    }
    if (!player || typeof player !== 'object' || !onGrid(player) || typeof player.moving !== 'boolean') return null;
    if (player.want != null && !DIRS[player.want]) return null;
    if (!open(m, tileC(player), tileR(player))) return null;
    if (!Array.isArray(ghosts) || ghosts.length !== 4) return null;
    const gs = [];
    for (const gh of ghosts) {
      if (!gh || typeof gh !== 'object' || !onGrid(gh) || STATES.indexOf(gh.state) < 0) return null;
      if (typeof gh.fright !== 'boolean' || typeof gh.rev !== 'boolean' || !int(gh.lc) || gh.lc < -1 || gh.lc >= COLS * ROWS) return null;
      gs.push({ x: gh.x, y: gh.y, dir: gh.dir, state: gh.state, fright: gh.fright, rev: gh.rev, lc: gh.lc });
    }
    return {
      seed, rs, level, lives, score, bonus, t, phase, phaseT, over: phase === 'over',
      dots: arr, dotsLeft: left, dotsEaten, fruit: fr, fruitsShown, modeIdx, modeT, frightT, chain, lifeT,
      player: { x: player.x, y: player.y, dir: player.dir, want: player.want || null, moving: player.moving },
      ghosts: gs, events: [],
    };
  }

  const clone = (g) => fromJSON(JSON.parse(JSON.stringify(toJSON(g))));

  const api = {
    VERSION, SPS, STEP_MS, U, COLS, ROWS, START_LIVES, MAX_LIVES, BONUS_LIFE, DOT, POWER, GHOST_BASE, FRUITS, FRUIT_STEPS, FRUIT_AT,
    START_STEPS, READY_STEPS, DIE_STEPS, CLEAR_STEPS, EAT_STEPS, HIT, CORNER, DOG_RANGE, DIRS, ORDER, OPP, CORNERS, MAZES, PARSED,
    params, mazeIndex, mazeOf, cell, open, scattering, newGame, input, step, getReady, drain, targetOf, chooseDir, tileC, tileR, atCenter,
    toJSON, fromJSON, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
