/* =====================================================================
 * Chim Bay - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Thế giới cố định: cao WORLD_H đơn vị, mặt đất ở GROUND_Y; chim ở x = quãng đã bay (distOf)
 *   - Mô phỏng theo bước cố định DT = 1/120 s: cùng seed + cùng chuỗi tick vỗ cánh thì ra cùng kết quả,
 *     máy nhanh / chậm như nhau (app chỉ đổi thời gian thật thành số bước bằng ticksFor)
 *   - Cặp thân tre sinh tuần tự bằng PRNG mulberry32 (trạng thái lưu trong ván); khe hẹp dần và cột
 *     dày dần theo số thứ tự cột rồi dừng ở trần; tâm khe hai cột liền nhau lệch tối đa MAX_SHIFT
 *   - Điểm: +1 khi chim qua tâm cột. Tốc độ cuộn không đổi, khoảng cách cột ≥ SPACE_MIN và cột đầu
 *     ở xa hơn SPACE_MIN, nên điểm / giây không bao giờ vượt MAX_SCORE_RATE = SPEED / SPACE_MIN
 *   - Hàm thuần: nhận trạng thái cũ, trả trạng thái mới; toJSON / fromJSON để lưu ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số thế giới (đơn vị thế giới, giây) ---------------- */
  const WORLD_H = 640;
  const GROUND_Y = 560; // mép trên mặt đất
  const BIRD_R = 14; // bán kính vùng va chạm của chim (hình vẽ to hơn một chút)
  const START_Y = 260;
  const PIPE_W = 72; // bề ngang thân tre
  const SPEED = 150; // tốc độ cuộn (đơn vị / giây), không đổi suốt ván
  const GRAVITY = 1500;
  const FLAP_V = -450; // vỗ cánh: đặt vận tốc đứng về giá trị này
  const MAX_FALL = 720;
  const HZ = 120;
  const DT = 1 / HZ;
  const TICK_MS = 1000 / HZ;
  const MAX_FRAME_MS = 100; // khung hình dài hơn (tab vừa quay lại, máy khựng) chỉ tính bằng chừng này
  const FIRST_PIPE_X = 420; // mép trái cột đầu tiên (chim xuất phát ở x = 0)
  const GAP_START = 190;
  const GAP_MIN = 150;
  const GAP_STEP = 1; // khe hẹp 1 đơn vị mỗi cột → chạm trần ở cột thứ 40
  const SPACE_START = 300; // khoảng cách mép trái cột này tới cột sau
  const SPACE_MIN = 230;
  const SPACE_STEP = 1.75; // → chạm trần ở cột thứ 40
  const EDGE = 70; // khe cách trần và mặt đất ít nhất chừng này
  const MAX_SHIFT = 170; // tâm khe hai cột liền nhau lệch tối đa
  const LOOKAHEAD = 1400; // luôn sinh sẵn cột tới trước chim chừng này (đủ cho khung nhìn rộng nhất)
  const KEEP_BEHIND = 600; // bỏ cột đã lùi quá xa sau chim
  const MAX_SCORE_RATE = SPEED / SPACE_MIN; // cột / giây tối đa (≈ 0,652)
  const MEDALS = [
    ['platinum', 80],
    ['gold', 40],
    ['silver', 20],
    ['bronze', 10],
  ];
  const PHASES = ['ready', 'play', 'over'];

  /* ---------------- PRNG mulberry32 (trạng thái 32 bit lưu trong ván) ---------------- */
  function rand(s) {
    const state = (s + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { state, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  /* ---------------- Độ khó theo số thứ tự cột k (0, 1, 2…) ---------------- */
  const gapFor = (k) => Math.max(GAP_MIN, GAP_START - k * GAP_STEP);
  const spacingFor = (k) => Math.max(SPACE_MIN, SPACE_START - k * SPACE_STEP);
  /** Khoảng tâm khe hợp lệ cho khe cao `gap`. */
  const gapRange = (gap) => [EDGE + gap / 2, GROUND_Y - EDGE - gap / 2];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  /** Quãng đã bay (= toạ độ x của chim) sau `tick` bước bay; tính lại từ tick để không cộng dồn sai số. */
  const distOf = (g) => g.tick * SPEED * DT;

  /** Sinh cột thứ g.nextK (ghi thẳng vào g: chỉ gọi trên bản sao). */
  function spawn(g) {
    const k = g.nextK;
    const gap = gapFor(k);
    const [lo, hi] = gapRange(gap);
    const r = rand(g.rng);
    g.rng = r.state;
    let y = k === 0 ? lo + r.value * (hi - lo) : clamp(g.lastY + (r.value * 2 - 1) * MAX_SHIFT, lo, hi);
    y = Math.round(y * 100) / 100; // làm tròn cho ván lưu gọn
    g.pipes.push({ k, x: g.nextX, y, gap, passed: false });
    g.lastY = y;
    g.nextX += spacingFor(k);
    g.nextK = k + 1;
  }

  /** Sinh thêm cột phía trước, bỏ cột đã lùi xa phía sau. */
  function fill(g) {
    const d = distOf(g);
    while (g.nextX < d + LOOKAHEAD) spawn(g);
    while (g.pipes.length && g.pipes[0].x + PIPE_W < d - KEEP_BEHIND) g.pipes.shift();
  }

  const clone = (g) => Object.assign({}, g, { pipes: g.pipes.map((p) => Object.assign({}, p)) });

  function blank(seed) {
    const s = Number(seed) >>> 0 || 1;
    return { seed: s, rng: s, phase: 'ready', tick: 0, y: START_Y, vy: 0, score: 0, flaps: 0, cause: null, pipes: [], nextK: 0, nextX: FIRST_PIPE_X, lastY: 0 };
  }

  /** Ván mới (chờ cú vỗ đầu tiên). seed: số nguyên 32 bit bất kỳ. */
  function newGame(seed) {
    const g = blank(seed);
    fill(g);
    return g;
  }

  /** n cột đầu tiên của seed (cho test và xem trước). */
  function generate(seed, n) {
    const g = blank(seed);
    while (g.nextK < n) spawn(g);
    return g.pipes;
  }

  /** Vỗ cánh: ván đang chờ thì bắt đầu bay. Hết ván thì không đổi gì. */
  function flap(g) {
    if (g.phase === 'over') return g;
    return Object.assign({}, g, { phase: 'play', vy: FLAP_V, flaps: g.flaps + 1 });
  }

  /** Hình tròn tâm (cx, cy) bán kính r chạm hình chữ nhật [x0, x1] × [y0, y1] không. */
  function circleHitsRect(cx, cy, r, x0, y0, x1, y1) {
    const dx = cx - clamp(cx, x0, x1);
    const dy = cy - clamp(cy, y0, y1);
    return dx * dx + dy * dy < r * r;
  }

  /** Chim ở (x, y) chạm cột p không (thân trên kéo lên vô cực, thân dưới tới mặt đất). */
  function hitsPipe(p, x, y) {
    if (x + BIRD_R <= p.x || x - BIRD_R >= p.x + PIPE_W) return false;
    const top = p.y - p.gap / 2;
    const bottom = p.y + p.gap / 2;
    return circleHitsRect(x, y, BIRD_R, p.x, -1e9, p.x + PIPE_W, top) || circleHitsRect(x, y, BIRD_R, p.x, bottom, p.x + PIPE_W, GROUND_Y);
  }

  /** Một bước mô phỏng DT. */
  function step(g) {
    if (g.phase === 'ready') return g;
    if (g.phase === 'over') {
      // Đã va: chim rơi tự do xuống đất, không cuộn nữa
      if (g.y + BIRD_R >= GROUND_Y) return g;
      const vy = Math.min(g.vy + GRAVITY * DT, MAX_FALL);
      return Object.assign({}, g, { vy, y: Math.min(g.y + vy * DT, GROUND_Y - BIRD_R) });
    }
    const n = clone(g);
    n.vy = Math.min(n.vy + GRAVITY * DT, MAX_FALL);
    n.y += n.vy * DT;
    n.tick += 1;
    if (n.y < BIRD_R) {
      // Trần chặn lại, không chết (bay sát trần vẫn đâm vào thân tre phía trên)
      n.y = BIRD_R;
      n.vy = 0;
    }
    fill(n);
    if (n.y + BIRD_R >= GROUND_Y) {
      n.y = GROUND_Y - BIRD_R;
      n.vy = 0;
      n.phase = 'over';
      n.cause = 'ground';
      return n;
    }
    const x = distOf(n);
    if (n.pipes.some((p) => hitsPipe(p, x, n.y))) {
      n.phase = 'over';
      n.cause = 'pipe';
      n.vy = Math.max(n.vy, 0);
      return n;
    }
    n.pipes.forEach((p) => {
      if (!p.passed && x >= p.x + PIPE_W / 2) {
        p.passed = true;
        n.score += 1;
      }
    });
    return n;
  }

  /** Đổi thời gian thật thành số bước cố định: trả { ticks, acc } (acc: phần dư ms mang sang khung sau). */
  function ticksFor(acc, frameMs) {
    const total = acc + Math.min(Math.max(0, frameMs), MAX_FRAME_MS);
    const ticks = Math.floor(total / TICK_MS + 1e-9);
    return { ticks, acc: Math.max(0, total - ticks * TICK_MS) };
  }

  /** Mô phỏng từ seed với danh sách tick vỗ cánh (vỗ ngay trước bước thứ i, đếm từ 0), tối đa maxTicks bước. */
  function simulate(seed, flapTicks, maxTicks) {
    const set = new Set(flapTicks);
    let g = newGame(seed);
    for (let i = 0; i < maxTicks && g.phase !== 'over'; i++) {
      if (set.has(i)) g = flap(g);
      g = step(g);
    }
    return g;
  }

  /** Lái tự động "rất giỏi": nhắm đáy khe của cột chưa qua (chừa margin), sắp rơi quá đó thì vỗ. Cho test / đo ngưỡng. */
  function autopilot(g, margin) {
    if (g.phase === 'over') return false;
    const m = margin == null ? 12 : margin;
    const x = distOf(g);
    const p = g.pipes.find((q) => q.x + PIPE_W + BIRD_R > x);
    const target = p ? p.y + p.gap / 2 - BIRD_R - m : GROUND_Y / 2;
    return g.y + g.vy * DT > target;
  }

  /** Huy chương của một điểm: 'bronze' | 'silver' | 'gold' | 'platinum' | null. */
  function medalFor(score) {
    for (const [name, min] of MEDALS) if (score >= min) return name;
    return null;
  }
  /** Mốc huy chương kế tiếp: { name, at }, hoặc null khi đã bạch kim. */
  function nextMedal(score) {
    for (let i = MEDALS.length - 1; i >= 0; i--) if (score < MEDALS[i][1]) return { name: MEDALS[i][0], at: MEDALS[i][1] };
    return null;
  }
  /** Điểm cao nhất có thể sau `tick` bước bay (để từ chối ván lưu bị sửa điểm). */
  function maxScoreAt(tick) {
    const d = tick * SPEED * DT;
    const first = FIRST_PIPE_X + PIPE_W / 2;
    return d < first ? 0 : Math.floor((d - first) / SPACE_MIN) + 1;
  }

  const toJSON = (g) => ({
    v: VERSION,
    seed: g.seed,
    rng: g.rng,
    phase: g.phase,
    tick: g.tick,
    y: g.y,
    vy: g.vy,
    score: g.score,
    flaps: g.flaps,
    cause: g.cause,
    pipes: g.pipes.map((p) => ({ k: p.k, x: p.x, y: p.y, gap: p.gap, passed: p.passed })),
    nextK: g.nextK,
    nextX: g.nextX,
    lastY: g.lastY,
  });

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isUint = (v) => Number.isInteger(v) && v >= 0;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, rng, phase, tick, y, vy, score, flaps, cause, pipes, nextK, nextX, lastY } = raw;
    if (!isUint(seed) || seed > 0xffffffff || !isUint(rng) || rng > 0xffffffff) return null;
    if (PHASES.indexOf(phase) < 0 || !isUint(tick) || !isUint(score) || !isUint(flaps) || !isUint(nextK)) return null;
    if (!isNum(y) || y < BIRD_R || y > GROUND_Y - BIRD_R || !isNum(vy) || vy < FLAP_V || vy > MAX_FALL) return null;
    if (!isNum(nextX) || !isNum(lastY)) return null;
    if (cause !== null && cause !== 'pipe' && cause !== 'ground') return null;
    if ((phase === 'over') !== (cause !== null)) return null;
    if (phase === 'ready' && (tick !== 0 || score !== 0)) return null;
    if (score > maxScoreAt(tick)) return null;
    if (!Array.isArray(pipes) || pipes.length > 64) return null;
    const out = [];
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      if (!p || typeof p !== 'object' || !isUint(p.k) || !isNum(p.x) || !isNum(p.y) || typeof p.passed !== 'boolean') return null;
      if (p.gap !== gapFor(p.k)) return null;
      const [lo, hi] = gapRange(p.gap);
      if (p.y < lo - 1e-6 || p.y > hi + 1e-6) return null;
      if (i > 0 && (p.k !== out[i - 1].k + 1 || p.x <= out[i - 1].x)) return null;
      out.push({ k: p.k, x: p.x, y: p.y, gap: p.gap, passed: p.passed });
    }
    if (out.length && out[out.length - 1].k !== nextK - 1) return null;
    return { seed, rng, phase, tick, y, vy, score, flaps, cause, pipes: out, nextK, nextX, lastY };
  }

  const api = {
    VERSION, WORLD_H, GROUND_Y, BIRD_R, START_Y, PIPE_W, SPEED, GRAVITY, FLAP_V, MAX_FALL, HZ, DT, TICK_MS, MAX_FRAME_MS,
    FIRST_PIPE_X, GAP_START, GAP_MIN, GAP_STEP, SPACE_START, SPACE_MIN, SPACE_STEP, EDGE, MAX_SHIFT, LOOKAHEAD, MAX_SCORE_RATE, MEDALS,
    gapFor, spacingFor, gapRange, distOf, newGame, generate, flap, step, hitsPipe, circleHitsRect, ticksFor, simulate, autopilot,
    medalFor, nextMedal, maxScoreAt, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
