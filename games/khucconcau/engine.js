/* =====================================================================
 * Khúc Côn Cầu - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn theo đơn vị logic: rộng W (ngang), dài L (dọc). y = 0 là đầu bàn của máy (trên),
 *     y = L là đầu bàn của người chơi (dưới). Màn hình ngang chỉ xoay hình vẽ, engine không đổi.
 *   - Mô phỏng bước cố định DT = 1/120 s, mỗi bước chia SUB bước con để đĩa không xuyên chày / thành.
 *     step(state, input) trả trạng thái mới (không sửa trạng thái cũ); sự kiện của bước ở state.events.
 *   - Tất định theo seed + chuỗi input: mọi ngẫu nhiên (ai cầm đĩa trước, sai số của máy) lấy từ PRNG trong state.
 *   - Vật lý: chày do tay giữ (không bị đĩa đẩy lùi), va chạm theo xung lượng của hệ hai vật
 *     (khối lượng chày / đĩa, hệ số hồi phục), thành bàn dội có hệ số, ma sát nhẹ, trần tốc độ đĩa.
 *   - Luật: đĩa vào khung thành là ghi bàn, bên thủng lưới được giao đĩa ở nửa sân mình; ai tới 7 bàn trước thắng.
 *     Đĩa nằm một nửa sân quá 7 s thì chuyển quyền giao đĩa cho bên kia (chống câu giờ).
 *   - Người chơi là phần tử 0 (dưới), máy là phần tử 1 (trên) trong score / mallets.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const HZ = 120;
  const DT = 1 / HZ;
  const SUB = 4; // bước con mỗi bước mô phỏng (chống xuyên)
  const W = 360; // bề ngang bàn
  const L = 640; // chiều dài bàn
  const PR = 14; // bán kính đĩa
  const MR = 21; // bán kính chày
  const GOAL_W = 168; // bề rộng khung thành
  const GOAL_L = W / 2 - GOAL_W / 2; // mép trái khung thành
  const GOAL_R = W / 2 + GOAL_W / 2; // mép phải khung thành

  const PUCK_MAX = 1700; // trần tốc độ đĩa (đơn vị / giây)
  const FRICTION = 0.3; // ma sát nhẹ: tốc độ giảm theo e^(-0,3 t)
  const E_WALL = 0.9; // hệ số hồi phục khi dội thành
  const E_MALLET = 0.9; // hệ số hồi phục khi chạm chày
  const PUCK_MASS = 1;
  const MALLET_MASS = 8; // chày nặng hơn đĩa nhiều
  const MASS_K = MALLET_MASS / (MALLET_MASS + PUCK_MASS);
  const PLAYER_SPEED = 2400; // chày theo chuột / ngón tay: gần như tức thì nhưng vẫn có trần
  const KEY_SPEED = 700; // chày khi giữ phím mũi tên
  const LOUD = 60; // va chạm nhẹ hơn mức này thì không phát sự kiện (đỡ ồn khi đẩy đĩa chậm)

  const FACEOFF = 120; // 1 s giữ đĩa đứng yên trước khi thả (cả ván đầu và sau mỗi bàn)
  const GOAL_PAUSE = 180; // 1,5 s ăn mừng sau mỗi bàn
  const STALL = 840; // 7 s đĩa nằm một nửa sân thì chuyển quyền giao đĩa
  const WIN_GOALS = 7;
  // Chỗ đặt đĩa khi giao cho người chơi (0) / máy (1) và chỗ đứng chờ của chày
  const SPOT = [L - 190, 190];
  const HOME = [{ x: W / 2, y: L - 64 }, { x: W / 2, y: 64 }];
  // Vùng chày được đi: cả chày nằm trong nửa sân mình
  const BOUNDS = [
    { x0: MR, x1: W - MR, y0: L / 2 + MR, y1: L - MR },
    { x0: MR, x1: W - MR, y0: MR, y1: L / 2 - MR },
  ];

  // Máy theo mức (trong khung "của máy": khung thành mình ở y = 0):
  //   reaction = số bước trễ trước khi phản ứng / quyết định lại, speed = tốc độ chày tối đa,
  //   predict = cách đoán đường đĩa (none: nhìn chỗ đĩa đang ở, straight: đường thẳng không tính dội, bounce: có dội thành + ma sát),
  //   attack = có phản công khi đĩa ở nửa mình không, aim = cách nhắm (direct: thẳng khung, bank: chọn đánh thẳng hay dội thành),
  //   error = sai số chỗ đứng (đơn vị bàn), spread = sai số góc đánh (rad), defY = hàng thủ trước khung.
  const LEVELS = {
    easy: { reaction: 40, speed: 300, predict: 'none', attack: false, aim: 'direct', error: 40, spread: 0.35, defY: 72 },
    medium: { reaction: 26, speed: 600, predict: 'straight', attack: true, aim: 'direct', error: 24, spread: 0.22, defY: 66 },
    hard: { reaction: 22, speed: 760, predict: 'bounce', attack: true, aim: 'bank', error: 18, spread: 0.12, defY: 60 },
  };
  const PHASES = ['faceoff', 'play', 'goal', 'over'];

  /* ---------------- PRNG (mulberry32) ---------------- */
  function hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const str = String(seed == null ? '' : seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h;
  }
  /** Bước PRNG trên ô nhớ { rng }: trả số [0, 1) và đổi o.rng. */
  function rand(o) {
    o.rng = (o.rng + 0x6d2b79f5) >>> 0;
    let t = o.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;

  /** Kẹp điểm vào vùng chày của bên `side`. */
  function confine(side, x, y) {
    const b = BOUNDS[side];
    return { x: clamp(x, b.x0, b.x1), y: clamp(y, b.y0, b.y1) };
  }

  /** Giới hạn tốc độ đĩa ở PUCK_MAX (giữ hướng). */
  function capSpeed(p) {
    const v = hyp(p.vx, p.vy);
    if (v > PUCK_MAX) {
      p.vx *= PUCK_MAX / v;
      p.vy *= PUCK_MAX / v;
    }
  }

  /* ---------------- Ván mới ---------------- */
  function clone(g) {
    return {
      level: g.level,
      score: [g.score[0], g.score[1]],
      phase: g.phase,
      timer: g.timer,
      tick: g.tick,
      released: g.released,
      winner: g.winner,
      receiver: g.receiver,
      half: g.half,
      stall: g.stall,
      shots: g.shots,
      touch: [g.touch[0], g.touch[1]],
      puck: { x: g.puck.x, y: g.puck.y, vx: g.puck.vx, vy: g.puck.vy },
      mallets: g.mallets.map((m) => ({ x: m.x, y: m.y, vx: m.vx, vy: m.vy })),
      ai: {
        wait: g.ai.wait, tx: g.ai.tx, ty: g.ai.ty, err: g.ai.err,
        aimX: g.ai.aimX, aimErr: g.ai.aimErr, sign: g.ai.sign, bank: g.ai.bank,
      },
      rng: g.rng,
    };
  }

  function newAiMemory() {
    return { wait: 0, tx: HOME[1].x, ty: HOME[1].y, err: 0, aimX: 0, aimErr: 0, sign: 0, bank: 0 };
  }

  /** Giao đĩa cho `who`: đĩa đứng yên ở nửa sân của họ, giữ FACEOFF bước rồi thả. */
  function setupFaceoff(s, who) {
    s.phase = 'faceoff';
    s.timer = FACEOFF;
    s.receiver = who;
    s.puck.x = W / 2;
    s.puck.y = SPOT[who];
    s.puck.vx = 0;
    s.puck.vy = 0;
    s.half = who;
    s.stall = 0;
    s.ai.wait = 0;
    s.events.push({ type: 'faceoff', who });
  }

  /** opts: { level: 'easy'|'medium'|'hard', seed } → ván mới, đĩa đang chờ thả lần đầu. */
  function newGame(opts) {
    const o = opts || {};
    const level = Object.prototype.hasOwnProperty.call(LEVELS, o.level) ? o.level : 'medium';
    const s = {
      level,
      score: [0, 0],
      phase: 'faceoff',
      timer: FACEOFF,
      tick: 0,
      released: false,
      winner: null,
      receiver: 0,
      half: 0,
      stall: 0,
      shots: 0,
      touch: [-1, -1], // bước gần nhất mỗi chày chạm đĩa (-1: chưa chạm)
      puck: { x: W / 2, y: SPOT[0], vx: 0, vy: 0 },
      mallets: [0, 1].map((i) => ({ x: HOME[i].x, y: HOME[i].y, vx: 0, vy: 0 })),
      ai: newAiMemory(),
      rng: hashSeed(o.seed),
      events: [],
    };
    const first = rand(s) < 0.5 ? 0 : 1; // tung đồng xu: ai cầm đĩa trước
    setupFaceoff(s, first);
    s.events = [];
    return s;
  }

  /* ---------------- Đoán đường đĩa (dùng cho máy) ---------------- */
  /**
   * Mô phỏng thô đường đĩa trong t giây (dội thành, ma sát, không tính chày); dừng khi đĩa vào khung.
   * stopY (tùy chọn): dừng sớm khi đĩa vượt qua đường y này theo chiều đang bay (hit: true).
   */
  function project(p, t, stopY) {
    let x = p.x;
    let y = p.y;
    let vx = p.vx;
    let vy = p.vy;
    const h = 1 / 60;
    const k = Math.exp(-FRICTION * h);
    for (let tt = 0; tt < t; tt += h) {
      const ny = y + vy * h;
      if (stopY != null && ((vy < 0 && y > stopY && ny <= stopY) || (vy > 0 && y < stopY && ny >= stopY))) {
        const f = (stopY - y) / (ny - y);
        return { x: x + vx * h * f, y: stopY, vx, vy, hit: true };
      }
      x += vx * h;
      y = ny;
      if (x < PR) { x = 2 * PR - x; vx = -vx * E_WALL; }
      else if (x > W - PR) { x = 2 * (W - PR) - x; vx = -vx * E_WALL; }
      const mouth = x > GOAL_L && x < GOAL_R;
      if (!mouth && y < PR) { y = 2 * PR - y; vy = -vy * E_WALL; }
      else if (!mouth && y > L - PR) { y = 2 * (L - PR) - y; vy = -vy * E_WALL; }
      else if (y < 0 || y > L) return { x, y, vx, vy, goal: true };
      vx *= k;
      vy *= k;
    }
    return { x, y, vx, vy };
  }

  /** Điểm đĩa cắt hàng y (khung của máy, đĩa đang bay về phía y nhỏ) theo cách đoán của mức. */
  function interceptX(p, y, mode) {
    if (mode === 'none' || p.vy >= -1) return p.x;
    if (mode === 'straight') return clamp(p.x + (p.vx * (y - p.y)) / p.vy, PR, W - PR);
    const r = project(p, 2, y);
    return r.hit || r.goal ? r.x : p.x;
  }

  /* ---------------- Máy (trong khung của máy: khung thành mình ở y = 0) ---------------- */
  /**
   * view: { phase, mine (mình đang được giao đĩa), puck {x,y,vx,vy}, me {x,y}, opp {x,y} }
   * mem: bộ nhớ của máy (đổi tại chỗ). Trả điểm chày muốn tới.
   */
  function aiDecide(cfg, mem, view) {
    const P = view.puck;
    const home = { x: W / 2, y: cfg.defY };
    if (view.phase === 'goal' || view.phase === 'over') return home;
    if (view.phase === 'faceoff' && !view.mine) return home;
    const inMine = P.y < L / 2;
    const speed = hyp(P.vx, P.vy);
    if (inMine && (view.phase === 'faceoff' || speed < 140 || (cfg.attack && P.vy > -280))) {
      if (!cfg.attack) return { x: P.x, y: P.y }; // mức Dễ chỉ đẩy đĩa chậm ra khỏi sân mình
      return aiAttack(cfg, mem, view);
    }
    if (P.vy < -20) {
      // Đĩa đang bay về khung: đứng chặn trên hàng thủ
      const x = interceptX(P, cfg.defY, cfg.predict) + mem.err;
      return { x: clamp(x, GOAL_L - 8, GOAL_R + 8), y: cfg.defY };
    }
    // Đĩa đi xa: về giữa khung, hơi nghiêng theo đĩa
    return { x: W / 2 + (P.x - W / 2) * 0.3, y: cfg.defY + 12 };
  }

  /** Phản công: vòng ra sau đĩa rồi lao qua đĩa theo hướng nhắm (khung thành đối phương ở y = L). */
  function aiAttack(cfg, mem, view) {
    const M = view.me;
    let Q = view.puck;
    // Đĩa đang trôi: nhắm chỗ đĩa sẽ tới khi chày tới nơi
    if (cfg.predict !== 'none' && hyp(Q.vx, Q.vy) > 5) {
      const t = Math.min(0.45, hyp(M.x - Q.x, M.y - Q.y) / cfg.speed);
      Q = cfg.predict === 'bounce' ? project(Q, t) : { x: clamp(Q.x + Q.vx * t, PR, W - PR), y: clamp(Q.y + Q.vy * t, PR, L / 2) };
    }
    const gx = W / 2 + mem.aimX;
    let T = { x: gx, y: L };
    if (cfg.aim === 'bank') {
      // Chọn đánh thẳng, dội thành trái hay phải: đường nào đi xa chày đối phương nhất (soi gương qua thành)
      const opts = [T, { x: 2 * PR - gx, y: L }, { x: 2 * (W - PR) - gx, y: L }];
      let best = -1;
      opts.forEach((c, i) => {
        if (Math.abs(c.x - Q.x) > 1.6 * (c.y - Q.y)) return; // góc quá thoải: dội nhiều lần, mất lực
        const f = (view.opp.y - Q.y) / (c.y - Q.y);
        let x = Q.x + (c.x - Q.x) * f;
        if (x < PR) x = 2 * PR - x;
        else if (x > W - PR) x = 2 * (W - PR) - x;
        const gap = Math.abs(x - view.opp.x) + (i === mem.bank ? 25 : 0); // giữ lựa chọn cũ nếu ngang nhau
        if (gap > best) {
          best = gap;
          T = c;
        }
      });
      mem.bank = opts.indexOf(T);
    }
    const a = Math.atan2(T.y - Q.y, T.x - Q.x) + mem.aimErr;
    let n = { x: Math.cos(a), y: Math.sin(a) };
    const R2 = PR + MR;
    // Đĩa sát thành: chỗ đứng sau đĩa nằm ngoài sân thì đánh theo hướng làm được (từ chỗ đứng gần nhất trong sân)
    const S = confine(1, Q.x - n.x * (R2 + 12), Q.y - n.y * (R2 + 12));
    const sd = hyp(Q.x - S.x, Q.y - S.y);
    if (sd > R2 * 0.8) n = { x: (Q.x - S.x) / sd, y: (Q.y - S.y) / sd };
    const dx = M.x - Q.x;
    const dy = M.y - Q.y;
    const behind = dx * n.x + dy * n.y; // âm: chày nằm sau đĩa (phía khung mình)
    const side = dx * -n.y + dy * n.x; // lệch ngang so với đường đánh
    if (behind < -R2 * 0.55 && Math.abs(side) < R2 * 0.45) return { x: Q.x + n.x * (R2 + 40), y: Q.y + n.y * (R2 + 40) };
    if (behind < -4) return { x: Q.x - n.x * (R2 + 12), y: Q.y - n.y * (R2 + 12) };
    // Chày ở trước đĩa: vòng sang bên đang đứng, không đẩy đĩa về khung mình
    const sgn = side >= 0 ? 1 : -1;
    return { x: Q.x - n.y * sgn * (R2 + 24) - n.x * R2 * 0.6, y: Q.y + n.x * sgn * (R2 + 24) - n.y * R2 * 0.6 };
  }

  /**
   * Một bước của máy: phản ứng trễ `reaction` bước mỗi khi đĩa đổi hướng (bị đánh, dội), quyết định lại mỗi `reaction` bước.
   * Trả điểm muốn tới (chưa giới hạn tốc độ).
   */
  function aiTick(cfg, mem, view, rnd) {
    const vy = view.puck.vy;
    const sign = view.phase !== 'play' ? 0 : vy > 30 ? 1 : vy < -30 ? -1 : 0;
    if (sign !== mem.sign) {
      mem.sign = sign;
      mem.wait = cfg.reaction;
      // Mỗi lượt đĩa tới: sai số chỗ đứng và góc đánh mới
      mem.err = (rnd() * 2 - 1) * cfg.error;
      mem.aimErr = (rnd() * 2 - 1) * cfg.spread;
      mem.aimX = (rnd() * 2 - 1) * GOAL_W * 0.28;
    }
    if (mem.wait > 0) mem.wait--;
    else {
      const t = aiDecide(cfg, mem, view);
      mem.tx = t.x;
      mem.ty = t.y;
      mem.wait = cfg.reaction;
    }
    return { x: mem.tx, y: mem.ty };
  }

  /** Góc nhìn của bên `side` (lật trục y cho người chơi để dùng chung bộ não của máy). */
  function viewFor(s, side) {
    const f = side === 1 ? (y) => y : (y) => L - y;
    const g = side === 1 ? 1 : -1;
    const me = s.mallets[side];
    const op = s.mallets[1 - side];
    return {
      phase: s.phase,
      mine: s.receiver === side,
      puck: { x: s.puck.x, y: f(s.puck.y), vx: s.puck.vx, vy: g * s.puck.vy },
      me: { x: me.x, y: f(me.y) },
      opp: { x: op.x, y: f(op.y) },
    };
  }

  /**
   * Bộ điều khiển chày người chơi bằng bộ não của máy (cho test, bot đấu máy): level là tên mức hoặc cấu hình riêng.
   * Trả hàm (state) → input; tất định theo seed, tôn trọng tốc độ chày của cấu hình.
   */
  function makeController(level, seed) {
    const cfg = typeof level === 'string' ? LEVELS[level] : level;
    const mem = newAiMemory();
    const box = { rng: hashSeed(seed) };
    const rnd = () => rand(box);
    return (s) => {
      const t = aiTick(cfg, mem, viewFor(s, 0), rnd);
      const me = s.mallets[0];
      const c = confine(0, t.x, L - t.y);
      const d = hyp(c.x - me.x, c.y - me.y);
      const lim = cfg.speed * DT;
      const k = d > lim ? lim / d : 1;
      return { target: { x: me.x + (c.x - me.x) * k, y: me.y + (c.y - me.y) * k } };
    };
  }

  /* ---------------- Chày ---------------- */
  /** Vị trí chày người chơi muốn tới trong bước này. input: { target: {x, y} | null, dx, dy } (dx, dy ∈ -1..1 khi giữ phím). */
  function playerGoal(s, input) {
    const m = s.mallets[0];
    let x = m.x;
    let y = m.y;
    const t = input && input.target;
    if (t && Number.isFinite(t.x) && Number.isFinite(t.y)) {
      const c = confine(0, t.x, t.y);
      const d = hyp(c.x - m.x, c.y - m.y);
      const lim = PLAYER_SPEED * DT;
      const k = d > lim ? lim / d : 1;
      x += (c.x - m.x) * k;
      y += (c.y - m.y) * k;
    } else if (input && (input.dx || input.dy)) {
      const dx = clamp(+input.dx || 0, -1, 1);
      const dy = clamp(+input.dy || 0, -1, 1);
      const len = Math.max(1, hyp(dx, dy));
      x += (dx / len) * KEY_SPEED * DT;
      y += (dy / len) * KEY_SPEED * DT;
    }
    return confine(0, x, y);
  }

  /** Vị trí chày máy muốn tới trong bước này (trễ phản ứng + trần tốc độ của mức). */
  function cpuGoal(s) {
    const cfg = LEVELS[s.level];
    const t = aiTick(cfg, s.ai, viewFor(s, 1), () => rand(s));
    const m = s.mallets[1];
    const c = confine(1, t.x, t.y);
    const d = hyp(c.x - m.x, c.y - m.y);
    const lim = cfg.speed * DT;
    const k = d > lim ? lim / d : 1;
    return { x: m.x + (c.x - m.x) * k, y: m.y + (c.y - m.y) * k };
  }

  /* ---------------- Đĩa ---------------- */
  function wallHit(s, axis) {
    const p = s.puck;
    const v = axis === 'x' ? p.vx : p.vy;
    if (axis === 'x') p.vx = -p.vx * E_WALL;
    else p.vy = -p.vy * E_WALL;
    if (Math.abs(v) > LOUD) s.events.push({ type: 'wall', x: p.x, y: p.y, speed: Math.abs(v) });
  }

  /** Dội thành / cột khung thành; trả 0 / 1 nếu đĩa đã vào khung (bên ghi bàn), không thì -1. */
  function walls(s) {
    const p = s.puck;
    if (p.x < PR) {
      p.x = Math.min(2 * PR - p.x, W - PR);
      if (p.vx < 0) wallHit(s, 'x');
    } else if (p.x > W - PR) {
      p.x = Math.max(2 * (W - PR) - p.x, PR);
      if (p.vx > 0) wallHit(s, 'x');
    }
    const mouth = p.x > GOAL_L && p.x < GOAL_R;
    if (!mouth) {
      if (p.y < PR) {
        p.y = Math.min(2 * PR - p.y, L - PR);
        if (p.vy < 0) wallHit(s, 'y');
      } else if (p.y > L - PR) {
        p.y = Math.max(2 * (L - PR) - p.y, PR);
        if (p.vy > 0) wallHit(s, 'y');
      }
      return -1;
    }
    // Trong miệng khung: va hai cột (coi là điểm) ở mỗi đầu bàn
    for (let i = 0; i < 4; i++) {
      const cx = i % 2 ? GOAL_R : GOAL_L;
      const cy = i < 2 ? 0 : L;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = hyp(dx, dy);
      if (d < PR && d > 1e-9) {
        const nx = dx / d;
        const ny = dy / d;
        p.x = cx + nx * PR;
        p.y = cy + ny * PR;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) {
          p.vx -= (1 + E_WALL) * vn * nx;
          p.vy -= (1 + E_WALL) * vn * ny;
          if (-vn > LOUD) s.events.push({ type: 'wall', x: p.x, y: p.y, speed: -vn });
        }
      }
    }
    if (p.y < 0) return 0; // vào khung của máy: người chơi ghi bàn
    if (p.y > L) return 1;
    return -1;
  }

  /**
   * Va chạm đĩa – chày `i` (vị trí cur, vận tốc mv). Đĩa bị đẩy ra ngoài chày; nếu đang lao vào nhau thì
   * đĩa nhận xung lượng của va chạm hai vật: Δv = -(1 + e)·M/(M + m)·(v_tương_đối · n)·n
   * (đúng như va chạm tự do bảo toàn động lượng; phần xung lượng của chày do tay người giữ hấp thụ).
   * frozen: đĩa đứng yên (lúc giao đĩa), chày bị chặn lại thay vì đẩy đĩa.
   * Trả true nếu chày bị chặn, 0 / 1 nếu cú chạm đẩy đĩa vào khung, false nếu không có gì đặc biệt.
   */
  function collide(s, i, cur, mv, frozen) {
    const p = s.puck;
    const R2 = PR + MR;
    let dx = p.x - cur.x;
    let dy = p.y - cur.y;
    let d = hyp(dx, dy);
    if (d >= R2) return false;
    let nx = d > 1e-9 ? dx / d : 0;
    let ny = d > 1e-9 ? dy / d : i === 0 ? -1 : 1;
    if (frozen) {
      const c = confine(i, p.x - nx * R2, p.y - ny * R2);
      cur.x = c.x;
      cur.y = c.y;
      return true;
    }
    let mvx = mv.x;
    let mvy = mv.y;
    let blocked = false;
    const px = cur.x + nx * R2;
    const py = cur.y + ny * R2;
    if (inside(px, py)) {
      p.x = px;
      p.y = py;
    } else {
      // Đĩa kẹt giữa chày và thành: đĩa nằm sát thành, chày lùi lại sát đĩa và coi như đứng yên
      // (không bơm thêm năng lượng cho đĩa khi chày cứ ép vào góc)
      p.x = clamp(px, PR, W - PR);
      p.y = p.x > GOAL_L && p.x < GOAL_R ? py : clamp(py, PR, L - PR);
      dx = p.x - cur.x;
      dy = p.y - cur.y;
      d = hyp(dx, dy);
      if (d < R2) {
        nx = d > 1e-9 ? dx / d : nx;
        ny = d > 1e-9 ? dy / d : ny;
        const c = confine(i, p.x - nx * R2, p.y - ny * R2);
        cur.x = c.x;
        cur.y = c.y;
      }
      mvx = 0;
      mvy = 0;
      blocked = true;
    }
    const vn = (p.vx - mvx) * nx + (p.vy - mvy) * ny;
    if (vn < 0) {
      const j = (1 + E_MALLET) * MASS_K * vn;
      p.vx -= j * nx;
      p.vy -= j * ny;
      capSpeed(p);
      // Chỉ báo cú chạm mới (bước trước chưa chạm): chày đẩy đĩa liên tục không phát âm thanh dồn dập
      const fresh = s.touch[i] < s.tick - 1;
      if (fresh && i === 0) s.shots++;
      if (fresh && -vn > LOUD) s.events.push({ type: 'hit', who: i, x: p.x, y: p.y, speed: hyp(p.vx, p.vy) });
    }
    s.touch[i] = s.tick;
    const g = walls(s); // cột khung thành, hoặc chày đẩy đĩa qua vạch khung
    if (g >= 0) return g;
    return blocked;
  }

  /** Tâm đĩa ở vị trí này có nằm gọn trong bàn không (miệng khung thành thì không có thành ở hai đầu). */
  function inside(x, y) {
    if (x < PR || x > W - PR) return false;
    return (x > GOAL_L && x < GOAL_R) || (y >= PR && y <= L - PR);
  }

  function scoreGoal(s, who) {
    s.score[who]++;
    s.events.push({ type: 'goal', who, score: [s.score[0], s.score[1]] });
    s.puck.vx = 0;
    s.puck.vy = 0;
    s.puck.y = who === 0 ? -PR : L + PR; // đĩa nằm trong khung
    s.puck.x = clamp(s.puck.x, GOAL_L + PR, GOAL_R - PR);
    if (s.score[who] >= WIN_GOALS) {
      s.winner = who;
      s.phase = 'over';
      s.timer = 0;
      s.events.push({ type: 'over', winner: who });
    } else {
      s.phase = 'goal';
      s.timer = GOAL_PAUSE;
      s.receiver = 1 - who; // bên thủng lưới được giao đĩa
    }
  }

  /** Di chuyển chày tới đích của bước (chia bước con), xử lý va chạm; đĩa chỉ chạy khi `live`. */
  function physics(s, goals, live) {
    const p = s.puck;
    const old = s.mallets.map((m) => ({ x: m.x, y: m.y }));
    const cur = old.map((o) => ({ x: o.x, y: o.y }));
    const inc = goals.map((g, i) => ({ x: (g.x - old[i].x) / SUB, y: (g.y - old[i].y) / SUB }));
    let scored = -1;
    for (let k = 0; k < SUB && scored < 0; k++) {
      for (let i = 0; i < 2; i++) {
        cur[i].x += inc[i].x;
        cur[i].y += inc[i].y;
      }
      if (live) {
        p.x += (p.vx * DT) / SUB;
        p.y += (p.vy * DT) / SUB;
        scored = walls(s);
        if (scored >= 0) break;
      }
      for (let i = 0; i < 2 && scored < 0; i++) {
        // Vận tốc chày lúc chạm = quãng thật sự đi trong bước con này (chày đã bị chặn thì coi như đứng yên)
        const r = collide(s, i, cur[i], { x: (inc[i].x * SUB) / DT, y: (inc[i].y * SUB) / DT }, !live);
        if (r === true) {
          inc[i].x = 0; // chày bị chặn: đứng lại trong phần còn lại của bước
          inc[i].y = 0;
        } else if (r === 0 || r === 1) scored = r;
      }
    }
    for (let i = 0; i < 2; i++) {
      const m = s.mallets[i];
      m.vx = (cur[i].x - old[i].x) / DT;
      m.vy = (cur[i].y - old[i].y) / DT;
      m.x = cur[i].x;
      m.y = cur[i].y;
    }
    if (scored >= 0) {
      scoreGoal(s, scored);
      return;
    }
    if (live) {
      const k = Math.exp(-FRICTION * DT);
      p.vx *= k;
      p.vy *= k;
      if (hyp(p.vx, p.vy) < 1) {
        p.vx = 0;
        p.vy = 0;
      }
      capSpeed(p);
      // Chống câu giờ: đĩa nằm một nửa sân quá lâu thì bên kia được giao đĩa
      const half = p.y >= L / 2 ? 0 : 1;
      if (half !== s.half) {
        s.half = half;
        s.stall = 0;
      } else if (++s.stall >= STALL) {
        s.events.push({ type: 'stall', who: half });
        setupFaceoff(s, 1 - half);
      }
    }
  }

  /* ---------------- Một bước mô phỏng ---------------- */
  /** input: { target: {x, y} | null, dx, dy } của người chơi trong bước này. */
  function step(state, input) {
    const s = clone(state);
    s.events = [];
    if (s.phase === 'over') return s;
    s.tick++;
    const goals = [playerGoal(s, input), cpuGoal(s)];
    if (s.phase === 'faceoff') {
      physics(s, goals, false);
      if (--s.timer <= 0) {
        s.phase = 'play';
        s.released = true;
        s.events.push({ type: 'drop', who: s.receiver });
      }
    } else if (s.phase === 'play') {
      physics(s, goals, true);
    } else if (s.phase === 'goal') {
      for (let i = 0; i < 2; i++) {
        const m = s.mallets[i];
        m.vx = (goals[i].x - m.x) / DT;
        m.vy = (goals[i].y - m.y) / DT;
        m.x = goals[i].x;
        m.y = goals[i].y;
      }
      if (--s.timer <= 0) setupFaceoff(s, s.receiver);
    }
    return s;
  }

  /** Mở lại ván lưu: giao đĩa lại ở tỉ số hiện tại cho bên đang giữ đĩa (đĩa đang trượt không lưu chính xác được). */
  function resume(state) {
    const s = clone(state);
    s.events = [];
    if (s.phase !== 'over') {
      const who = s.phase === 'faceoff' || s.phase === 'goal' ? s.receiver : s.puck.y >= L / 2 ? 0 : 1;
      s.mallets = [0, 1].map((i) => ({ x: HOME[i].x, y: HOME[i].y, vx: 0, vy: 0 }));
      s.ai = newAiMemory();
      setupFaceoff(s, who);
    }
    s.events = [];
    return s;
  }

  const isOver = (g) => g.phase === 'over';
  /** Cận dưới thời gian (giây) của trận 7-0: mỗi bàn ít nhất một lần giao đĩa + quãng đĩa trượt ở trần tốc độ, giữa các bàn nghỉ GOAL_PAUSE. */
  function fastestWin() {
    const travel = Math.min(SPOT[1], SPOT[0] - PR) / PUCK_MAX; // từ chỗ giao gần khung máy nhất tới vạch khung
    return WIN_GOALS * (FACEOFF / HZ + travel) + (WIN_GOALS - 1) * (GOAL_PAUSE / HZ);
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    const s = clone(g);
    s.v = VERSION;
    return s;
  }

  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!isObj(raw) || raw.v !== VERSION) return null;
    if (!Object.prototype.hasOwnProperty.call(LEVELS, raw.level)) return null;
    if (PHASES.indexOf(raw.phase) < 0) return null;
    if (!Array.isArray(raw.score) || raw.score.length !== 2 || !raw.score.every((x) => int(x, 0, WIN_GOALS))) return null;
    if (!int(raw.timer, 0, Math.max(FACEOFF, GOAL_PAUSE)) || !int(raw.tick, 0, 1e9)) return null;
    if (typeof raw.released !== 'boolean' || !int(raw.receiver, 0, 1) || !int(raw.half, 0, 1)) return null;
    if (!int(raw.stall, 0, STALL) || !int(raw.shots, 0, 1e9) || !int(raw.rng, 0, 4294967295)) return null;
    if (!Array.isArray(raw.touch) || raw.touch.length !== 2 || !raw.touch.every((x) => int(x, -1, raw.tick))) return null;
    const p = raw.puck;
    if (!isObj(p) || ![p.x, p.y, p.vx, p.vy].every(num)) return null;
    if (p.x < 0 || p.x > W || p.y < -2 * PR || p.y > L + 2 * PR || hyp(p.vx, p.vy) > PUCK_MAX + 1e-6) return null;
    if (!Array.isArray(raw.mallets) || raw.mallets.length !== 2) return null;
    const okMallet = (m, i) => isObj(m) && [m.x, m.y, m.vx, m.vy].every(num) &&
      m.x >= BOUNDS[i].x0 - 1e-6 && m.x <= BOUNDS[i].x1 + 1e-6 && m.y >= BOUNDS[i].y0 - 1e-6 && m.y <= BOUNDS[i].y1 + 1e-6;
    if (!raw.mallets.every(okMallet)) return null;
    const ai = raw.ai;
    if (!isObj(ai) || !int(ai.wait, 0, 1000) || ![ai.tx, ai.ty, ai.err, ai.aimX, ai.aimErr].every(num)) return null;
    if (!int(ai.sign, -1, 1) || !int(ai.bank, 0, 2)) return null;
    // Tỉ số phải khớp trạng thái: đã xong thì người thắng đủ 7 bàn, chưa xong thì chưa ai đủ
    const done = raw.score.map((x) => x >= WIN_GOALS);
    if (done[0] && done[1]) return null;
    if (raw.phase === 'over') {
      if (!(raw.winner === 0 || raw.winner === 1) || !done[raw.winner]) return null;
    } else if (done[0] || done[1] || raw.winner !== null) return null;
    if (raw.score[0] + raw.score[1] > 0 && !raw.released) return null;
    const s = clone(raw);
    s.events = [];
    return s;
  }

  const api = {
    VERSION, HZ, DT, SUB, W, L, PR, MR, GOAL_W, GOAL_L, GOAL_R,
    PUCK_MAX, FRICTION, E_WALL, E_MALLET, PUCK_MASS, MALLET_MASS, MASS_K, PLAYER_SPEED, KEY_SPEED, LOUD,
    FACEOFF, GOAL_PAUSE, STALL, WIN_GOALS, SPOT, HOME, BOUNDS, LEVELS,
    newGame, step, resume, isOver, fastestWin, project, interceptX, makeController,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
