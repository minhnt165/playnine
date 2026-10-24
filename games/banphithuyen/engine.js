/* =====================================================================
 * Bắn Phi Thuyền - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Sân logic 240 x 360, mô phỏng theo bước cố định 60 bước / giây (STEP_MS)
 *   - step(game, input) đổi trực tiếp trạng thái (vòng lặp 60 Hz) và trả mảng sự kiện cho giao diện
 *     (bắn, hạ địch, trúng khiên, mất mạng, qua đợt…); input = { dir: -1 | 0 | 1, target: x | null, fire }
 *   - Tất định: cùng hạt giống + cùng chuỗi input thì ra cùng ván (PRNG mulberry32 nằm trong trạng thái)
 *   - Luật: đội hình 5 x 9 đi ngang, chạm mép thì xuống một nấc và quay đầu, càng ít địch càng nhanh;
 *     mỗi lần chỉ một viên đạn của người chơi; địch thả bom; 4 khiên bị bào mòn từng ô;
 *     đĩa bay thưởng thỉnh thoảng bay ngang; hết địch thì sang đợt mới nhanh hơn
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số sân chơi (đơn vị: px logic, tick = 1/60 giây) ---------------- */
  const W = 240;
  const H = 360;
  const STEP_MS = 1000 / 60;

  // Đội hình: hàng 0 trên cùng (30 điểm), hàng 1–2 (20 điểm), hàng 3–4 (10 điểm)
  const ROWS = 5;
  const COLS = 9;
  const TOTAL = ROWS * COLS;
  const PITCH_X = 18;
  const PITCH_Y = 16;
  const CELL_W = 12; // bề ngang một ô của đội hình; địch đứng giữa ô
  const ALIEN_H = 8;
  const ROW_TYPE = [2, 1, 1, 0, 0];
  const TYPE_W = [12, 11, 8];
  const TYPE_PTS = [10, 20, 30];
  const FORM_W = (COLS - 1) * PITCH_X + CELL_W;
  const EDGE = 6; // khoảng cách tới mép sân thì đội hình quay đầu
  const DX = 3; // mỗi nhịp đi ngang
  const DY = 8; // mỗi lần xuống một nấc
  const FY0 = 44; // độ cao hàng trên cùng ở đợt 1 (đợt sau bắt đầu thấp hơn, lặp lại mỗi 6 đợt)

  // Người chơi
  const PLAYER_Y = 322; // mép trên của tàu
  const PLAYER_W = 15;
  const PLAYER_H = 8;
  const PLAYER_SPEED = 2.5;
  const PX_MIN = PLAYER_W / 2 + 3;
  const PX_MAX = W - PX_MIN;
  const GROUND_Y = 338;

  // Đạn, bom
  const BULLET_SPEED = 7;
  const BULLET_H = 6;
  const BOMB_W = 3;
  const BOMB_H = 7;
  const SUB = 2; // chia quãng đi mỗi tick thành bước ≤ 2px để không xuyên qua vật

  // Khiên: lưới 12 x 8 ô, mỗi ô 2px
  const SHIELD_Y = 274;
  const SHIELD_CELL = 2;
  const SHIELD_COLS = 12;
  const SHIELD_ROWS = 8;
  const SHIELD_W = SHIELD_COLS * SHIELD_CELL;
  const SHIELD_H = SHIELD_ROWS * SHIELD_CELL;
  const SHIELD_X = [30, 90, 150, 210].map((c) => c - SHIELD_W / 2);
  const SHIELD_SHAPE = [
    '...######...',
    '.##########.',
    '############',
    '############',
    '############',
    '####....####',
    '###......###',
    '###......###',
  ].join('');

  // Đĩa bay thưởng
  const UFO_Y = 16;
  const UFO_W = 16;
  const UFO_H = 7;
  const UFO_SPEED = 1.2;
  const UFO_POINTS = [50, 100, 50, 150, 100, 50, 300, 100, 150, 50];
  const UFO_MIN_ALIENS = 8; // còn ít địch hơn thì không gọi đĩa bay

  // Mạng, nhịp
  const LIVES = 3;
  const MAX_LIVES = 6;
  const EXTRA_AT = 1500;
  const DEATH_TICKS = 100;
  const CLEAR_TICKS = 120;
  const BOMB_GRACE = 90; // đầu đợt / sau khi hồi sinh: chưa thả bom ngay
  const PHASES = ['play', 'dying', 'clear', 'over'];

  /* ---------------- Tiện ích ---------------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  /** Hạt giống: số hoặc chuỗi (băm FNV-1a) → số nguyên 32 bit. */
  function seedOf(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const s = String(seed == null ? '' : seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry32: trạng thái nằm ở g.rng nên lưu / khôi phục ván là chạy tiếp đúng dãy số. */
  function rand(g) {
    let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (g, n) => Math.floor(rand(g) * n);

  /* ---------------- Độ khó theo đợt ---------------- */
  /** Số tick giữa hai nhịp đi của cả đội hình khi còn đủ 45 địch. */
  const baseInterval = (wave) => Math.max(6, 22 - 2 * (wave - 1));
  const bombSpeed = (wave) => Math.min(1.8 + 0.15 * (wave - 1), 3.2);
  const maxBombs = (wave) => Math.min(2 + Math.ceil(wave / 2), 5);
  const bombBase = (wave) => Math.max(16, 50 - 4 * (wave - 1));
  const startY = (wave) => FY0 + ((wave - 1) % 6) * 8;

  function aliveCount(g) {
    let n = 0;
    for (let i = 0; i < TOTAL; i++) n += g.alive[i];
    return n;
  }

  /** Nhịp đi (tick) theo số địch còn lại: đủ đội hình = baseInterval, còn một con = 1 tick. */
  function stepInterval(g) {
    const n = aliveCount(g);
    if (n <= 1) return 1;
    return 1 + Math.round(((n - 1) * (baseInterval(g.wave) - 1)) / (TOTAL - 1));
  }

  /** Hình chữ nhật của địch thứ i (hàng = i / COLS, cột = i % COLS). */
  function alienRect(g, i) {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const type = ROW_TYPE[r];
    const w = TYPE_W[type];
    return { x: g.fx + c * PITCH_X + (CELL_W - w) / 2, y: g.fy + r * PITCH_Y, w, h: ALIEN_H, type, row: r, col: c };
  }

  /** Cột trái nhất / phải nhất còn địch và hàng thấp nhất còn địch. */
  function extent(g) {
    let minC = COLS;
    let maxC = -1;
    let maxR = -1;
    for (let i = 0; i < TOTAL; i++) {
      if (!g.alive[i]) continue;
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r > maxR) maxR = r;
    }
    return { minC, maxC, maxR };
  }

  const freshShield = () => Array.from(SHIELD_SHAPE, (ch) => (ch === '#' ? 1 : 0));

  /* ---------------- Ván mới / đợt mới ---------------- */
  function setupWave(g) {
    g.alive = new Array(TOTAL).fill(1);
    g.fx = (W - FORM_W) / 2;
    g.fy = startY(g.wave);
    g.dir = 1;
    g.anim = 0;
    g.march = 0;
    g.stepT = stepInterval(g);
    g.shields = SHIELD_X.map(freshShield);
    g.bullet = null;
    g.bombs = [];
    g.bombT = BOMB_GRACE;
    g.ufo = null;
    g.ufoT = 900 + randInt(g, 600);
    g.phase = 'play';
    g.timer = 0;
  }

  /** opts: { seed } (số hoặc chuỗi). */
  function newGame(opts) {
    const g = {
      rng: seedOf(opts && opts.seed != null ? opts.seed : Date.now()),
      wave: 1,
      score: 0,
      lives: LIVES,
      extra: false,
      tick: 0,
      shots: 0,
      kills: 0,
      px: W / 2,
    };
    setupWave(g);
    return g;
  }

  /* ---------------- Điểm, mạng ---------------- */
  function addScore(g, pts, ev) {
    g.score += pts;
    if (!g.extra && g.score >= EXTRA_AT) {
      g.extra = true;
      if (g.lives < MAX_LIVES) g.lives++;
      ev.push({ type: 'extraLife', lives: g.lives });
    }
  }

  function killPlayer(g, ev) {
    g.lives--;
    g.bombs = [];
    g.bullet = null;
    ev.push({ type: 'hit', x: g.px, y: PLAYER_Y + PLAYER_H / 2, lives: g.lives });
    if (g.lives <= 0) {
      g.lives = 0;
      g.phase = 'over';
      ev.push({ type: 'over', reason: 'lives' });
    } else {
      g.phase = 'dying';
      g.timer = DEATH_TICKS;
    }
  }

  /* ---------------- Khiên ---------------- */
  /**
   * Ô khiên đặc đầu tiên mà hình chữ nhật (x, y, w, h) chạm vào: đi lên (đạn) lấy ô thấp nhất,
   * đi xuống (bom) lấy ô cao nhất. Trả { s, cx, cy } hoặc null.
   */
  function shieldHit(g, x, y, w, h, down) {
    if (y + h <= SHIELD_Y || y >= SHIELD_Y + SHIELD_H) return null;
    for (let s = 0; s < SHIELD_X.length; s++) {
      const sx = SHIELD_X[s];
      if (x + w <= sx || x >= sx + SHIELD_W) continue;
      const c0 = Math.max(0, Math.floor((x - sx) / SHIELD_CELL));
      const c1 = Math.min(SHIELD_COLS - 1, Math.floor((x + w - 0.001 - sx) / SHIELD_CELL));
      const r0 = Math.max(0, Math.floor((y - SHIELD_Y) / SHIELD_CELL));
      const r1 = Math.min(SHIELD_ROWS - 1, Math.floor((y + h - 0.001 - SHIELD_Y) / SHIELD_CELL));
      const cells = g.shields[s];
      for (let k = 0; k <= r1 - r0; k++) {
        const r = down ? r0 + k : r1 - k;
        for (let c = c0; c <= c1; c++) if (cells[r * SHIELD_COLS + c]) return { s, cx: c, cy: r };
      }
    }
    return null;
  }

  /** Bào mòn quanh ô bị trúng: ô trúng luôn mất, các ô kề theo hướng bay mất ngẫu nhiên (tất định theo rng). */
  function erode(g, s, cx, cy, down) {
    const cells = g.shields[s];
    const dirY = down ? 1 : -1;
    const kill = (c, r, p) => {
      if (c < 0 || c >= SHIELD_COLS || r < 0 || r >= SHIELD_ROWS) return;
      if (p >= 1 || rand(g) < p) cells[r * SHIELD_COLS + c] = 0;
    };
    kill(cx, cy, 1);
    kill(cx - 1, cy, 0.6);
    kill(cx + 1, cy, 0.6);
    kill(cx - 1, cy + dirY, 0.5);
    kill(cx, cy + dirY, 0.75);
    kill(cx + 1, cy + dirY, 0.5);
    kill(cx, cy + 2 * dirY, 0.4);
  }

  const shieldCellCenter = (s, cx, cy) => ({ x: SHIELD_X[s] + cx * SHIELD_CELL + 1, y: SHIELD_Y + cy * SHIELD_CELL + 1 });

  /** Địch xuống tới khiên thì xóa mọi ô khiên nằm dưới thân. */
  function aliensVsShields(g) {
    for (let i = 0; i < TOTAL; i++) {
      if (!g.alive[i]) continue;
      const a = alienRect(g, i);
      if (a.y + a.h <= SHIELD_Y || a.y >= SHIELD_Y + SHIELD_H) continue;
      for (let s = 0; s < SHIELD_X.length; s++) {
        const sx = SHIELD_X[s];
        if (a.x + a.w <= sx || a.x >= sx + SHIELD_W) continue;
        for (let r = 0; r < SHIELD_ROWS; r++) {
          for (let c = 0; c < SHIELD_COLS; c++) {
            if (overlap(a.x, a.y, a.w, a.h, sx + c * SHIELD_CELL, SHIELD_Y + r * SHIELD_CELL, SHIELD_CELL, SHIELD_CELL)) g.shields[s][r * SHIELD_COLS + c] = 0;
          }
        }
      }
    }
  }

  /* ---------------- Từng phần của một tick ---------------- */
  function movePlayer(g, input) {
    let dx = 0;
    if (input.dir) dx = clamp(input.dir, -1, 1) * PLAYER_SPEED;
    else if (typeof input.target === 'number' && Number.isFinite(input.target)) dx = clamp(input.target - g.px, -PLAYER_SPEED, PLAYER_SPEED);
    g.px = clamp(g.px + dx, PX_MIN, PX_MAX);
  }

  /** Đạn đi lên theo bước nhỏ: đĩa bay → địch → bom → khiên → ra khỏi sân. */
  function moveBullet(g, ev) {
    const b = g.bullet;
    if (!b) return;
    const n = Math.ceil(BULLET_SPEED / SUB);
    const d = BULLET_SPEED / n;
    for (let k = 0; k < n; k++) {
      b.y -= d;
      const bx = b.x - 0.5;
      if (b.y + BULLET_H < 0) {
        g.bullet = null;
        return;
      }
      if (g.ufo && overlap(bx, b.y, 1, BULLET_H, g.ufo.x, UFO_Y, UFO_W, UFO_H)) {
        const pts = UFO_POINTS[randInt(g, UFO_POINTS.length)];
        ev.push({ type: 'ufoKill', x: g.ufo.x + UFO_W / 2, y: UFO_Y + UFO_H / 2, pts });
        addScore(g, pts, ev);
        g.ufo = null;
        g.ufoT = 1200 + randInt(g, 900);
        g.bullet = null;
        return;
      }
      // Duyệt từ hàng dưới lên: đạn trúng con thấp nhất trên đường bay
      for (let i = TOTAL - 1; i >= 0; i--) {
        if (!g.alive[i]) continue;
        const a = alienRect(g, i);
        if (!overlap(bx, b.y, 1, BULLET_H, a.x, a.y, a.w, a.h)) continue;
        g.alive[i] = 0;
        g.kills++;
        g.bullet = null;
        g.stepT = Math.min(g.stepT, stepInterval(g)); // ít địch hơn thì nhịp nhanh lên ngay
        ev.push({ type: 'kill', x: a.x + a.w / 2, y: a.y + a.h / 2, kind: a.type, pts: TYPE_PTS[a.type], left: aliveCount(g) });
        addScore(g, TYPE_PTS[a.type], ev);
        return;
      }
      for (let j = 0; j < g.bombs.length; j++) {
        const m = g.bombs[j];
        if (!overlap(bx, b.y, 1, BULLET_H, m.x - BOMB_W / 2, m.y, BOMB_W, BOMB_H)) continue;
        g.bombs.splice(j, 1);
        g.bullet = null;
        ev.push({ type: 'bombShot', x: m.x, y: m.y + BOMB_H / 2 });
        return;
      }
      const hit = shieldHit(g, bx, b.y, 1, BULLET_H, false);
      if (hit) {
        erode(g, hit.s, hit.cx, hit.cy, false);
        g.bullet = null;
        ev.push(Object.assign({ type: 'shield', by: 'bullet' }, shieldCellCenter(hit.s, hit.cx, hit.cy)));
        return;
      }
    }
  }

  /** Một nhịp của đội hình: đi ngang DX, hoặc chạm mép thì xuống DY và quay đầu. */
  function marchStep(g, ev) {
    const { minC, maxC } = extent(g);
    if (maxC < 0) return;
    const left = g.fx + minC * PITCH_X;
    const right = g.fx + maxC * PITCH_X + CELL_W;
    if ((g.dir > 0 && right + DX > W - EDGE) || (g.dir < 0 && left - DX < EDGE)) {
      g.fy += DY;
      g.dir = -g.dir;
      ev.push({ type: 'descend' });
    } else {
      g.fx += DX * g.dir;
    }
    g.anim ^= 1;
    g.march = (g.march + 1) % 4;
    ev.push({ type: 'march', n: g.march });
  }

  /** Thả bom từ con thấp nhất của một cột: 40% chọn cột gần tàu nhất, còn lại chọn ngẫu nhiên. */
  function spawnBomb(g, ev) {
    const cols = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 1; r >= 0; r--) {
        if (g.alive[r * COLS + c]) {
          cols.push(r * COLS + c);
          break;
        }
      }
    }
    if (!cols.length) return;
    let pick = cols[0];
    if (rand(g) < 0.4) {
      let best = Infinity;
      cols.forEach((i) => {
        const a = alienRect(g, i);
        const d = Math.abs(a.x + a.w / 2 - g.px);
        if (d < best) {
          best = d;
          pick = i;
        }
      });
    } else {
      pick = cols[randInt(g, cols.length)];
    }
    const a = alienRect(g, pick);
    const bomb = { x: a.x + a.w / 2, y: a.y + a.h, k: randInt(g, 3) };
    g.bombs.push(bomb);
    ev.push({ type: 'bomb', x: bomb.x, y: bomb.y });
  }

  /** Bom rơi: trúng tàu thì mất mạng (trả true), trúng khiên thì bào khiên, chạm đất thì tan. */
  function moveBombs(g, ev) {
    const speed = bombSpeed(g.wave);
    const n = Math.ceil(speed / SUB);
    const d = speed / n;
    for (let j = 0; j < g.bombs.length; j++) {
      const m = g.bombs[j];
      let gone = false;
      for (let k = 0; k < n && !gone; k++) {
        m.y += d;
        const bx = m.x - BOMB_W / 2;
        if (overlap(bx, m.y, BOMB_W, BOMB_H, g.px - PLAYER_W / 2, PLAYER_Y, PLAYER_W, PLAYER_H)) {
          killPlayer(g, ev);
          return true;
        }
        const hit = shieldHit(g, bx, m.y, BOMB_W, BOMB_H, true);
        if (hit) {
          erode(g, hit.s, hit.cx, hit.cy, true);
          ev.push(Object.assign({ type: 'shield', by: 'bomb' }, shieldCellCenter(hit.s, hit.cx, hit.cy)));
          gone = true;
        } else if (m.y + BOMB_H >= GROUND_Y) {
          ev.push({ type: 'ground', x: m.x, y: GROUND_Y });
          gone = true;
        }
      }
      if (gone) {
        g.bombs.splice(j, 1);
        j--;
      }
    }
    return false;
  }

  function moveUfo(g, ev) {
    if (g.ufo) {
      g.ufo.x += UFO_SPEED * g.ufo.dir;
      if (g.ufo.x < -UFO_W - 1 || g.ufo.x > W + 1) {
        g.ufo = null;
        g.ufoT = 1200 + randInt(g, 900);
        ev.push({ type: 'ufoGone' });
      }
    } else if (--g.ufoT <= 0) {
      if (aliveCount(g) >= UFO_MIN_ALIENS) {
        const dir = rand(g) < 0.5 ? 1 : -1;
        g.ufo = { x: dir > 0 ? -UFO_W : W, dir };
        ev.push({ type: 'ufo', dir });
      } else {
        g.ufoT = 300;
      }
    }
  }

  /**
   * Một tick mô phỏng (1/60 giây). Đổi trực tiếp `g`, trả mảng sự kiện cho giao diện.
   * input: { dir: -1 | 0 | 1 (phím), target: x đích của tàu (chuột / chạm) hoặc null, fire: true = muốn bắn }
   */
  function step(g, input) {
    const ev = [];
    if (g.phase === 'over') return ev;
    const inp = input || {};
    g.tick++;
    if (g.phase === 'dying') {
      if (--g.timer <= 0) {
        g.phase = 'play';
        g.px = W / 2;
        g.bombT = BOMB_GRACE;
        ev.push({ type: 'respawn' });
      }
      return ev;
    }
    if (g.phase === 'clear') {
      if (--g.timer <= 0) {
        g.wave++;
        setupWave(g);
        ev.push({ type: 'wave', wave: g.wave });
      }
      return ev;
    }

    movePlayer(g, inp);
    if (inp.fire && !g.bullet) {
      g.bullet = { x: g.px, y: PLAYER_Y - BULLET_H };
      g.shots++;
      ev.push({ type: 'shoot', x: g.px, y: PLAYER_Y });
    }
    moveBullet(g, ev);

    // Hết địch: qua đợt (dọn bom, đạn, đĩa bay)
    if (aliveCount(g) === 0) {
      g.phase = 'clear';
      g.timer = CLEAR_TICKS;
      g.bombs = [];
      g.bullet = null;
      g.ufo = null;
      ev.push({ type: 'clear', wave: g.wave });
      return ev;
    }

    if (--g.stepT <= 0) {
      marchStep(g, ev);
      g.stepT = stepInterval(g);
    }
    aliensVsShields(g);
    const { maxR } = extent(g);
    if (g.fy + maxR * PITCH_Y + ALIEN_H >= PLAYER_Y) {
      // Địch xuống tới hàng của tàu: hết ván ngay
      g.lives = 0;
      g.phase = 'over';
      g.bombs = [];
      g.bullet = null;
      ev.push({ type: 'hit', x: g.px, y: PLAYER_Y + PLAYER_H / 2, lives: 0 });
      ev.push({ type: 'over', reason: 'invaded' });
      return ev;
    }

    if (--g.bombT <= 0) {
      const base = bombBase(g.wave);
      g.bombT = Math.floor(base / 2) + randInt(g, base);
      if (g.bombs.length < maxBombs(g.wave)) spawnBomb(g, ev);
    }
    if (moveBombs(g, ev)) return ev;
    moveUfo(g, ev);
    return ev;
  }

  const isOver = (g) => g.phase === 'over';

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION,
      rng: g.rng,
      wave: g.wave,
      score: g.score,
      lives: g.lives,
      extra: g.extra,
      tick: g.tick,
      shots: g.shots,
      kills: g.kills,
      px: g.px,
      alive: g.alive.join(''),
      fx: g.fx,
      fy: g.fy,
      dir: g.dir,
      anim: g.anim,
      march: g.march,
      stepT: g.stepT,
      shields: g.shields.map((s) => s.join('')),
      bullet: g.bullet ? { x: g.bullet.x, y: g.bullet.y } : null,
      bombs: g.bombs.map((m) => ({ x: m.x, y: m.y, k: m.k })),
      bombT: g.bombT,
      ufo: g.ufo ? { x: g.ufo.x, dir: g.ufo.dir } : null,
      ufoT: g.ufoT,
      phase: g.phase,
      timer: g.timer,
    };
  }

  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const isBits = (s, n) => typeof s === 'string' && s.length === n && /^[01]*$/.test(s);
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!isObj(raw) || raw.v !== VERSION) return null;
    const BIG = 1e9;
    const ok =
      isInt(raw.rng, 0, 4294967295) &&
      isInt(raw.wave, 1, 9999) &&
      isInt(raw.score, 0, BIG) &&
      isInt(raw.lives, 0, MAX_LIVES) &&
      typeof raw.extra === 'boolean' &&
      isInt(raw.tick, 0, BIG) &&
      isInt(raw.shots, 0, BIG) &&
      isInt(raw.kills, 0, BIG) &&
      isNum(raw.px, PX_MIN, PX_MAX) &&
      isBits(raw.alive, TOTAL) &&
      isNum(raw.fx, -W, W) &&
      isNum(raw.fy, 0, H) &&
      (raw.dir === 1 || raw.dir === -1) &&
      (raw.anim === 0 || raw.anim === 1) &&
      isInt(raw.march, 0, 3) &&
      isInt(raw.stepT, 0, 1000) &&
      Array.isArray(raw.shields) &&
      raw.shields.length === SHIELD_X.length &&
      raw.shields.every((s) => isBits(s, SHIELD_COLS * SHIELD_ROWS)) &&
      (raw.bullet === null || (isObj(raw.bullet) && isNum(raw.bullet.x, 0, W) && isNum(raw.bullet.y, -BULLET_H - 10, H))) &&
      Array.isArray(raw.bombs) &&
      raw.bombs.length <= 8 &&
      raw.bombs.every((m) => isObj(m) && isNum(m.x, 0, W) && isNum(m.y, 0, H) && isInt(m.k, 0, 2)) &&
      isInt(raw.bombT, -1, 1000) &&
      (raw.ufo === null || (isObj(raw.ufo) && isNum(raw.ufo.x, -UFO_W - 2, W + 2) && (raw.ufo.dir === 1 || raw.ufo.dir === -1))) &&
      isInt(raw.ufoT, -1, 10000) &&
      PHASES.indexOf(raw.phase) >= 0 &&
      isInt(raw.timer, 0, 1000);
    if (!ok) return null;
    // Đang chơi mà hết mạng, hoặc hết địch mà không ở bước qua đợt: dữ liệu không nhất quán
    if (raw.phase !== 'over' && raw.lives < 1) return null;
    if (raw.phase === 'play' && raw.alive.indexOf('1') < 0) return null;
    return {
      rng: raw.rng,
      wave: raw.wave,
      score: raw.score,
      lives: raw.lives,
      extra: raw.extra,
      tick: raw.tick,
      shots: raw.shots,
      kills: raw.kills,
      px: raw.px,
      alive: Array.from(raw.alive, Number),
      fx: raw.fx,
      fy: raw.fy,
      dir: raw.dir,
      anim: raw.anim,
      march: raw.march,
      stepT: raw.stepT,
      shields: raw.shields.map((s) => Array.from(s, Number)),
      bullet: raw.bullet ? { x: raw.bullet.x, y: raw.bullet.y } : null,
      bombs: raw.bombs.map((m) => ({ x: m.x, y: m.y, k: m.k })),
      bombT: raw.bombT,
      ufo: raw.ufo ? { x: raw.ufo.x, dir: raw.ufo.dir } : null,
      ufoT: raw.ufoT,
      phase: raw.phase,
      timer: raw.timer,
    };
  }

  const api = {
    VERSION, W, H, STEP_MS,
    ROWS, COLS, TOTAL, PITCH_X, PITCH_Y, CELL_W, ALIEN_H, ROW_TYPE, TYPE_W, TYPE_PTS, EDGE, DX, DY, FY0,
    PLAYER_Y, PLAYER_W, PLAYER_H, PLAYER_SPEED, PX_MIN, PX_MAX, GROUND_Y,
    BULLET_SPEED, BULLET_H, BOMB_W, BOMB_H,
    SHIELD_X, SHIELD_Y, SHIELD_W, SHIELD_H, SHIELD_COLS, SHIELD_ROWS, SHIELD_CELL, SHIELD_SHAPE,
    UFO_Y, UFO_W, UFO_H, UFO_SPEED, UFO_POINTS,
    LIVES, MAX_LIVES, EXTRA_AT, DEATH_TICKS, CLEAR_TICKS, BOMB_GRACE,
    seedOf, newGame, step, isOver, aliveCount, stepInterval, baseInterval, bombSpeed, maxBombs, alienRect, extent,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
