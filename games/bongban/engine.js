/* =====================================================================
 * Bóng Bàn - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn chơi theo đơn vị logic: rộng W (ngang bàn), dài L (trục đánh bóng).
 *     y = 0 là đầu bàn của máy (trên), y = L là đầu bàn của người chơi (dưới).
 *     Màn hình ngang chỉ xoay hình vẽ, engine không đổi.
 *   - Mô phỏng theo bước cố định DT = 1/120 s: step(state, input) trả trạng thái mới (không sửa trạng thái cũ),
 *     sự kiện của bước nằm ở state.events (va chạm, ghi điểm, giao bóng…) để app phát âm thanh / hiệu ứng.
 *   - Tất định theo seed + chuỗi input: mọi ngẫu nhiên (ai giao trước, góc giao, sai số của máy) lấy từ PRNG trong state.
 *   - Luật: 11 điểm, hơn 2 điểm; đổi giao mỗi 2 điểm, từ 10-10 đổi mỗi điểm.
 *   - Người chơi là phần tử 0 (dưới), máy là phần tử 1 (trên) trong score / pads.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const HZ = 120;
  const DT = 1 / HZ;
  const W = 360; // bề ngang bàn
  const L = 640; // chiều dài bàn
  const R = 6; // bán kính bóng
  const PAD_W = 72; // bề ngang vợt
  const PAD_H = 10; // độ dày vợt
  const PAD_Y = [L - 40, 40]; // tâm vợt người chơi (dưới) và máy (trên)
  // Đường tâm bóng chạm mặt vợt
  const CONTACT = [PAD_Y[0] - PAD_H / 2 - R, PAD_Y[1] + PAD_H / 2 + R];
  const REACH = PAD_W / 2 + R; // tâm bóng cách tâm vợt tối đa bấy nhiêu thì còn chạm

  const SERVE_SPEED = 360; // đơn vị / giây
  const SPEED_INC = 20; // mỗi cú đánh nhanh thêm
  const MAX_SPEED = 860; // trần tốc độ
  const DEG = Math.PI / 180;
  const MAX_ANGLE = 60 * DEG; // chạm mép vợt: lệch 60° so với trục bàn
  const MAX_FLIGHT = 66 * DEG; // xoáy không bẻ bóng quá góc này (bóng không chạy ngang mãi)
  const SERVE_ANGLE = 18 * DEG;
  const SPIN_K = 0.0006; // xoáy (rad/s) theo vận tốc vợt (đơn vị/s)
  const SPIN_MAX = 0.5;
  const SPIN_KEEP = Math.exp(-1.2 * DT); // xoáy tắt dần
  const PLAYER_SPEED = 2400; // vợt theo ngón tay / chuột: gần như tức thì nhưng vẫn có trần
  const KEY_SPEED = 620; // vợt khi giữ phím mũi tên

  const COUNTDOWN = 180; // 1,5 s đếm ngược trước mỗi quả giao (3-2-1)
  const COUNT_STEP = 60; // mỗi số đếm 0,5 s
  const POINT_PAUSE = 108; // 0,9 s nghỉ sau mỗi điểm
  const WIN_POINTS = 11;

  // Máy theo mức: reaction = số bước trễ trước khi phản ứng / quyết định lại, speed = tốc độ vợt tối đa,
  // predict = tính trước điểm rơi (có dội tường) hay chỉ chạy theo bóng, error = sai số điểm chạm (phần nửa vợt),
  // aim = cố đánh bóng về phía xa người chơi.
  const LEVELS = {
    easy: { reaction: 36, speed: 240, predict: false, error: 1.4, aim: false },
    medium: { reaction: 24, speed: 330, predict: true, error: 1.15, aim: false },
    hard: { reaction: 15, speed: 450, predict: true, error: 0.55, aim: true },
  };
  const PHASES = ['countdown', 'play', 'point', 'over'];

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

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const padMin = PAD_W / 2;
  const padMax = W - PAD_W / 2;

  /* ---------------- Luật điểm ---------------- */
  /** Thắng khi có ít nhất 11 điểm và hơn đối thủ 2 điểm; trả 0 / 1 hoặc null. */
  function winnerOf(score) {
    for (let i = 0; i < 2; i++) if (score[i] >= WIN_POINTS && score[i] - score[1 - i] >= 2) return i;
    return null;
  }
  /** Ai giao: đổi mỗi 2 điểm, từ 10-10 (tổng 20) đổi mỗi điểm. */
  function serverFor(score, first) {
    const total = score[0] + score[1];
    const flip = total < 2 * (WIN_POINTS - 1) ? Math.floor(total / 2) % 2 : total % 2;
    return first ^ flip;
  }

  /** Điểm rơi theo phương ngang khi tâm bóng tới đường y (tính dội tường, bỏ qua xoáy). */
  function intercept(ball, y) {
    if (ball.vy === 0) return ball.x;
    const t = (y - ball.y) / ball.vy;
    if (t < 0) return ball.x;
    const span = W - 2 * R;
    let m = (ball.x + ball.vx * t - R) % (2 * span);
    if (m < 0) m += 2 * span;
    if (m > span) m = 2 * span - m;
    return R + m;
  }

  /* ---------------- Ván mới ---------------- */
  function clone(g) {
    return {
      level: g.level,
      first: g.first,
      server: g.server,
      score: [g.score[0], g.score[1]],
      phase: g.phase,
      timer: g.timer,
      tick: g.tick,
      served: g.served,
      winner: g.winner,
      speed: g.speed,
      rally: g.rally,
      longest: g.longest,
      ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy, spin: g.ball.spin },
      pads: [{ x: g.pads[0].x, v: g.pads[0].v }, { x: g.pads[1].x, v: g.pads[1].v }],
      ai: { wait: g.ai.wait, target: g.ai.target, offset: g.ai.offset, toward: g.ai.toward },
      rng: g.rng,
    };
  }

  /** Bóng đặt trước mặt vợt người giao (theo vợt trong lúc đếm ngược). */
  function placeOnServer(s) {
    s.ball.x = clamp(s.pads[s.server].x, R, W - R);
    s.ball.y = CONTACT[s.server];
  }

  /** Chuẩn bị quả giao kế tiếp ở tỉ số hiện tại: đếm ngược, bóng về vợt người giao. */
  function setupServe(s) {
    s.server = serverFor(s.score, s.first);
    s.phase = 'countdown';
    s.timer = COUNTDOWN;
    s.rally = 0;
    s.speed = SERVE_SPEED;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.spin = 0;
    placeOnServer(s);
    s.ai.toward = false;
    s.ai.wait = 0;
    // Máy giao thì chọn chỗ đứng hơi lệch (đổi góc ra bóng)
    s.ai.offset = s.server === 1 ? (rand(s) * 2 - 1) * 0.6 * (PAD_W / 2) : 0;
    s.events.push({ type: 'count', n: Math.ceil(s.timer / COUNT_STEP) });
  }

  /** opts: { level: 'easy'|'medium'|'hard', seed } → ván mới, đang đếm ngược quả giao đầu tiên. */
  function newGame(opts) {
    const o = opts || {};
    const level = Object.prototype.hasOwnProperty.call(LEVELS, o.level) ? o.level : 'medium';
    const s = {
      level,
      first: 0,
      server: 0,
      score: [0, 0],
      phase: 'countdown',
      timer: COUNTDOWN,
      tick: 0,
      served: false,
      winner: null,
      speed: SERVE_SPEED,
      rally: 0,
      longest: 0,
      ball: { x: W / 2, y: CONTACT[0], vx: 0, vy: 0, spin: 0 },
      pads: [{ x: W / 2, v: 0 }, { x: W / 2, v: 0 }],
      ai: { wait: 0, target: W / 2, offset: 0, toward: false },
      rng: hashSeed(o.seed),
      events: [],
    };
    s.first = rand(s) < 0.5 ? 0 : 1; // tung đồng xu: ai giao trước
    setupServe(s);
    s.events = [];
    return s;
  }

  /* ---------------- Vợt ---------------- */
  /** input: { target: số (vị trí ngang muốn tới, chuột / chạm) | null, dir: -1 | 0 | 1 (phím) } */
  function movePlayer(s, input) {
    const p = s.pads[0];
    const old = p.x;
    let d = 0;
    if (input && typeof input.target === 'number' && Number.isFinite(input.target)) {
      d = clamp(input.target - p.x, -PLAYER_SPEED * DT, PLAYER_SPEED * DT);
    } else if (input && (input.dir === 1 || input.dir === -1)) {
      d = input.dir * KEY_SPEED * DT;
    }
    p.x = clamp(p.x + d, padMin, padMax);
    p.v = p.v * 0.7 + ((p.x - old) / DT) * 0.3; // vận tốc làm mượt (dùng cho xoáy)
  }

  /** Sai số điểm chạm của máy cho lượt bóng đang tới. */
  function drawOffset(s, cfg) {
    const half = PAD_W / 2;
    // Bóng càng nhanh, càng xoáy thì máy càng dễ đánh lệch (có thể trượt hẳn khi lệch quá tầm vợt)
    const fast = (s.speed - SERVE_SPEED) / (MAX_SPEED - SERVE_SPEED);
    const noise = (rand(s) * 2 - 1) * cfg.error * half * (1 + 1.5 * fast + Math.abs(s.ball.spin) / SPIN_MAX);
    if (!cfg.aim) return noise;
    // Đánh về phía xa người chơi: bóng chạm bên trái tâm vợt thì bay sang trái
    const mag = (0.25 + 0.45 * rand(s)) * half;
    const away = s.pads[0].x > W / 2 ? 1 : -1; // người ở bên phải → đẩy bóng sang trái → vợt lệch sang phải bóng
    return away * mag + noise;
  }

  /** Máy: phản ứng trễ `reaction` bước khi bóng đổi hướng, quyết định lại mỗi `reaction` bước, vợt có trần tốc độ. */
  function moveAI(s) {
    const cfg = LEVELS[s.level];
    const ai = s.ai;
    const b = s.ball;
    const toward = s.phase === 'play' && b.vy < 0;
    if (toward !== ai.toward) {
      ai.toward = toward;
      ai.wait = cfg.reaction;
      if (toward) ai.offset = drawOffset(s, cfg);
    }
    if (ai.wait > 0) ai.wait--;
    else {
      if (toward) ai.target = (cfg.predict ? intercept(b, CONTACT[1]) : b.x) + ai.offset;
      else if (s.phase === 'countdown' && s.server === 1) ai.target = W / 2 + ai.offset;
      else ai.target = W / 2 + (b.x - W / 2) * 0.25; // về giữa, hơi nghiêng theo bóng
      ai.wait = cfg.reaction;
    }
    const p = s.pads[1];
    const old = p.x;
    const lim = cfg.speed * DT;
    p.x = clamp(p.x + clamp(ai.target - p.x, -lim, lim), padMin, padMax);
    p.v = p.v * 0.7 + ((p.x - old) / DT) * 0.3;
  }

  /* ---------------- Bóng ---------------- */
  function setVelocity(s, angle, dir) {
    s.ball.vx = s.speed * Math.sin(angle);
    s.ball.vy = dir * s.speed * Math.cos(angle);
  }

  /** Góc bật ra theo chỗ chạm trên vợt: giữa vợt đi thẳng, mép vợt lệch MAX_ANGLE. */
  function hitAngle(ballX, padX) {
    return clamp((ballX - padX) / REACH, -1, 1) * MAX_ANGLE;
  }

  function hit(s, who, x) {
    const pad = s.pads[who];
    s.speed = Math.min(s.speed + SPEED_INC, MAX_SPEED);
    setVelocity(s, hitAngle(x, pad.x), who === 0 ? -1 : 1);
    s.ball.x = x;
    s.ball.y = CONTACT[who];
    s.ball.spin = clamp(pad.v * SPIN_K, -SPIN_MAX, SPIN_MAX);
    s.rally++;
    s.events.push({ type: 'hit', who, speed: s.speed, x, offset: (x - pad.x) / REACH });
  }

  function launch(s) {
    const angle = (rand(s) * 2 - 1) * SERVE_ANGLE;
    s.speed = SERVE_SPEED;
    setVelocity(s, angle, s.server === 0 ? -1 : 1);
    s.ball.spin = clamp(s.pads[s.server].v * SPIN_K, -SPIN_MAX, SPIN_MAX);
    s.phase = 'play';
    s.served = true;
    s.events.push({ type: 'serve', who: s.server });
  }

  function scorePoint(s, who) {
    s.score[who]++;
    s.longest = Math.max(s.longest, s.rally);
    s.events.push({ type: 'point', who, score: [s.score[0], s.score[1]] });
    const w = winnerOf(s.score);
    if (w != null) {
      s.winner = w;
      s.phase = 'over';
      s.timer = 0;
      s.ball.vx = 0;
      s.ball.vy = 0;
      s.ball.spin = 0;
      s.events.push({ type: 'over', winner: w });
    } else {
      s.phase = 'point';
      s.timer = POINT_PAUSE;
    }
  }

  function moveBall(s) {
    const b = s.ball;
    // Xoáy: xoay vector vận tốc (giữ nguyên tốc độ), không vượt MAX_FLIGHT
    if (b.spin !== 0) {
      const sign = b.vy < 0 ? -1 : 1;
      let a = Math.atan2(b.vx, Math.abs(b.vy)) + b.spin * DT;
      if (a > MAX_FLIGHT || a < -MAX_FLIGHT) {
        a = clamp(a, -MAX_FLIGHT, MAX_FLIGHT);
        b.spin = 0;
      }
      setVelocity(s, a, sign);
      b.spin *= SPIN_KEEP;
      if (Math.abs(b.spin) < 1e-3) b.spin = 0;
    }
    const px = b.x;
    const py = b.y;
    let nx = px + b.vx * DT;
    const ny = py + b.vy * DT;
    if (nx < R) {
      nx = 2 * R - nx;
      b.vx = -b.vx;
      b.spin = 0;
      s.events.push({ type: 'wall' });
    } else if (nx > W - R) {
      nx = 2 * (W - R) - nx;
      b.vx = -b.vx;
      b.spin = 0;
      s.events.push({ type: 'wall' });
    }
    // Vợt: bóng cắt qua đường chạm mặt vợt trong bước này và nằm trong tầm vợt
    const who = b.vy > 0 ? 0 : 1;
    const c = CONTACT[who];
    const crossed = who === 0 ? py <= c && ny >= c : py >= c && ny <= c;
    if (crossed) {
      const t = ny === py ? 0 : (c - py) / (ny - py);
      const x = clamp(px + (nx - px) * t, R, W - R);
      if (Math.abs(x - s.pads[who].x) <= REACH) {
        hit(s, who, x);
        return;
      }
    }
    b.x = nx;
    b.y = ny;
    if (b.y > L + 2 * R) scorePoint(s, 1);
    else if (b.y < -2 * R) scorePoint(s, 0);
  }

  /* ---------------- Một bước mô phỏng ---------------- */
  function step(state, input) {
    const s = clone(state);
    s.events = [];
    if (s.phase === 'over') return s;
    s.tick++;
    movePlayer(s, input);
    moveAI(s);
    if (s.phase === 'countdown') {
      s.timer--;
      placeOnServer(s);
      if (s.timer <= 0) launch(s);
      else if (s.timer % COUNT_STEP === 0) s.events.push({ type: 'count', n: s.timer / COUNT_STEP });
    } else if (s.phase === 'play') {
      moveBall(s);
    } else if (s.phase === 'point') {
      s.timer--;
      if (s.timer <= 0) setupServe(s);
    }
    return s;
  }

  /** Mở lại ván lưu: quả đang đánh dở được giao lại ở tỉ số hiện tại (bóng giữa không trung không lưu chính xác được). */
  function resume(state) {
    const s = clone(state);
    s.events = [];
    if (s.phase !== 'over') setupServe(s);
    s.events = [];
    return s;
  }

  const isOver = (g) => g.phase === 'over';
  /** Số đang đếm ngược (3, 2, 1) hoặc 0 khi không đếm. */
  const countdownNumber = (g) => (g.phase === 'countdown' ? Math.ceil(g.timer / COUNT_STEP) : 0);

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    const s = clone(g);
    s.v = VERSION;
    return s;
  }

  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (!Object.prototype.hasOwnProperty.call(LEVELS, raw.level)) return null;
    if (PHASES.indexOf(raw.phase) < 0) return null;
    if (!int(raw.first, 0, 1) || !int(raw.server, 0, 1)) return null;
    if (!Array.isArray(raw.score) || raw.score.length !== 2 || !raw.score.every((x) => int(x, 0, 999))) return null;
    if (!int(raw.timer, 0, Math.max(COUNTDOWN, POINT_PAUSE)) || !int(raw.tick, 0, 1e9)) return null;
    if (typeof raw.served !== 'boolean') return null;
    if (!int(raw.rally, 0, 1e6) || !int(raw.longest, 0, 1e6) || !int(raw.rng, 0, 4294967295)) return null;
    if (!num(raw.speed) || raw.speed < SERVE_SPEED || raw.speed > MAX_SPEED) return null;
    const b = raw.ball;
    if (!b || typeof b !== 'object' || ![b.x, b.y, b.vx, b.vy, b.spin].every(num)) return null;
    if (b.x < 0 || b.x > W || b.y < -4 * R || b.y > L + 4 * R || Math.abs(b.spin) > SPIN_MAX) return null;
    if (!Array.isArray(raw.pads) || raw.pads.length !== 2) return null;
    if (!raw.pads.every((p) => p && typeof p === 'object' && num(p.x) && num(p.v) && p.x >= padMin && p.x <= padMax)) return null;
    const ai = raw.ai;
    if (!ai || typeof ai !== 'object' || !int(ai.wait, 0, 1000) || !num(ai.target) || !num(ai.offset) || typeof ai.toward !== 'boolean') return null;
    // Tỉ số phải khớp trạng thái: đã xong thì có người thắng, chưa xong thì chưa ai thắng
    const w = winnerOf(raw.score);
    if (raw.phase === 'over' ? w == null || raw.winner !== w : w != null || raw.winner !== null) return null;
    if (raw.score[0] + raw.score[1] > 0 && !raw.served) return null;
    const s = clone(raw);
    s.events = [];
    return s;
  }

  const api = {
    VERSION, HZ, DT, W, L, R, PAD_W, PAD_H, PAD_Y, CONTACT, REACH,
    SERVE_SPEED, SPEED_INC, MAX_SPEED, MAX_ANGLE, MAX_FLIGHT, SERVE_ANGLE, SPIN_MAX,
    PLAYER_SPEED, KEY_SPEED, COUNTDOWN, COUNT_STEP, POINT_PAUSE, WIN_POINTS, LEVELS,
    newGame, step, resume, isOver, countdownNumber, winnerOf, serverFor, intercept, hitAngle,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
