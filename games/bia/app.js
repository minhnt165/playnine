/* =====================================================================
 * Bi-a - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng canvas: bàn 1000 × 500 đơn vị (+ băng, gỗ), co theo khung; khung dọc thì xoay bàn đứng
 *     (đầu bàn ở dưới), khung ngang thì đầu bàn bên trái
 *   - Ngắm: kéo ở bất kỳ đâu trên bàn (gậy chỉ về phía ngón tay), nút ‹ › chỉnh nhỏ, thanh Lực, nút Đánh;
 *     bàn phím: ← → xoay, ↑ ↓ lực, W / S xoáy, Space đánh, M đặt bi cái bằng phím mũi tên
 *   - Bi trong tay: kéo chính bi cái tới chỗ khác (cú phá: chỉ sau vạch phát bi)
 *   - Engine tính trọn cú đánh (khung hình 60 / s + sự kiện va chạm); app phát lại theo thời gian thật,
 *     tua nhanh khi bấm ⏩ / chạm bàn / Space, hoặc mặc định nhanh hơn khi giảm chuyển động
 *   - Máy nghĩ theo từng phần (planner.step trong setTimeout, ≤ 8 ms mỗi lần) để không đơ giao diện,
 *     "ngắm" tối thiểu MIN_THINK_MS rồi xoay gậy tới góc đã chọn
 *   - Báo ván cho cổng (metric wins, mode = mức máy easy | medium | hard; chế độ 2 người không báo):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }); bỏ ván đã đánh ít nhất một cú: won: false;
 *     chưa đánh cú nào thì không gửi gì. Không có đánh lại.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = E.LEVELS;
  const kit = PNKit.init({
    gameId: 'bia',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', opponent: 'cpu', guide: true, vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const calm = () => reduced.matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const DEG = Math.PI / 180;

  const M = 46; // lề quanh mặt bàn (băng + gỗ), đơn vị bàn
  const MIN_THINK_MS = 700; // máy "nghĩ" ít nhất chừng này
  const AIM_MS = 450; // máy xoay gậy tới góc đã chọn
  const STROKE = 0.14; // gậy thúc tới bi (s)
  const POT_ANIM = 0.22; // bi lọt xuống lỗ (s)
  const FPS = 1 / (E.STEP * E.REC); // khung hình ghi trong engine mỗi giây
  // Độ dài đường dự đoán sau chỗ chạm: [hướng bi mục tiêu, hướng bi cái] (đơn vị bàn)
  const GUIDE = { easy: [280, 170], medium: [120, 70], hard: [50, 0] };
  const BALL_COLORS = ['#f4f1e8', '#f2c12e', '#1f5fd1', '#d93a2b', '#6b3fa0', '#f07b22', '#198a4b', '#8a2431', '#16171c'];
  const ballColor = (n) => BALL_COLORS[n > 8 ? n - 8 : n];

  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best), shots: toInt(raw.shots), pots: toInt(raw.pots) };
    LEVELS.forEach((lv) => {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost) };
    });
    return st;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });
  const potRate = () => (stats.shots ? Math.round((stats.pots / stats.shots) * 100) + '%' : '–');

  /* ---------------- Trạng thái ---------------- */
  let game = null; // trạng thái engine (sau cú đánh gần nhất)
  let cur = null; // { mode: 'cpu' | 'pvp', level, humanShots, ended }
  let phase = 'aim'; // aim | think | roll | over
  const aim = { angle: 0, power: 40, spin: 0 };
  let cuePos = null; // chỗ đặt bi cái khi có bi trong tay (chưa đánh)
  let lastValid = null; // chỗ đặt hợp lệ gần nhất (thả ở chỗ sai thì quay về)
  let drag = null; // 'aim' | 'place'
  let moveMode = false; // phím M: mũi tên di chuyển bi cái
  let anim = null; // cú đánh đang phát lại
  let ai = null; // { token, phase: 'plan' | 'aim', shot, from, to, start, dur, cueFrom, cueTo }
  let aiToken = 0;
  let shownAngle = 0; // góc gậy đang vẽ (máy xoay dần)
  let fast = false;
  let dirty = true;
  let resultTimer = 0;

  const isCpu = () => cur && cur.mode === 'cpu';
  const isAiTurn = () => isCpu() && game && !E.isOver(game) && game.turn === 1;
  const canAim = () => phase === 'aim' && game && !E.isOver(game) && !isAiTurn() && !kit.modal.current();
  const humanHand = () => canAim() && game.ballInHand;
  const inProgress = () => !!game && !E.isOver(game) && cur.humanShots > 0 && !cur.ended;
  const nameOf = (side) => t(isCpu() ? (side === 0 ? 'name.you' : 'name.cpu') : side === 0 ? 'name.p1' : 'name.p2');
  const speed = () => (fast ? 3 : calm() ? 2 : 1);

  function buzz(ms) {
    if (!kit.settings.get().vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }
  function announce(msg) {
    $('live').textContent = msg;
  }

  /* ---------------- Bố cục canvas ---------------- */
  const view = { w: 0, h: 0, dpr: 1, s: 1, ox: 0, oy: 0, rot: false };
  let colors = {};
  let tableCache = null;
  let sprites = [];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {};
    ['felt', 'felt-2', 'cushion', 'wood', 'wood-2', 'pocket', 'sight', 'line-soft', 'guide', 'guide-2', 'cue-1', 'cue-2', 'bad', 'p0', 'p1'].forEach((n) => { colors[n] = v('--' + n); });
    colors.font = v('--font') || 'system-ui, sans-serif';
    tableCache = null;
    dirty = true;
  }
  function layout() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.w = w;
    view.h = h;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    const TW = E.W + 2 * M;
    const TH = E.H + 2 * M;
    const sL = Math.min(w / TW, h / TH);
    const sP = Math.min(w / TH, h / TW);
    view.rot = sP > sL * 1.02; // khung dọc: dựng bàn đứng cho bàn to hơn
    view.s = view.rot ? sP : sL;
    view.ox = (w - (view.rot ? TH : TW) * view.s) / 2;
    view.oy = (h - (view.rot ? TW : TH) * view.s) / 2;
    tableCache = null;
    sprites = [];
    dirty = true;
  }
  /** Đơn vị bàn → điểm trên canvas (px CSS). */
  function S(x, y) {
    if (!view.rot) return [view.ox + (x + M) * view.s, view.oy + (y + M) * view.s];
    return [view.ox + (y + M) * view.s, view.oy + (E.W + M - x) * view.s];
  }
  /** Điểm trên màn hình → đơn vị bàn. */
  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = (clientX - r.left - view.ox) / view.s;
    const sy = (clientY - r.top - view.oy) / view.s;
    return view.rot ? { x: E.W + M - sy, y: sx - M } : { x: sx - M, y: sy - M };
  }
  /** Đặt phép biến đổi để vẽ trực tiếp theo đơn vị bàn. */
  function worldTransform(g) {
    const d = view.dpr;
    const s = view.s;
    if (!view.rot) g.setTransform(s * d, 0, 0, s * d, (view.ox + M * s) * d, (view.oy + M * s) * d);
    else g.setTransform(0, -s * d, s * d, 0, (view.ox + M * s) * d, (view.oy + (E.W + M) * s) * d);
  }

  /* ---------------- Vẽ bàn (dựng lại khi đổi khung / giao diện) ---------------- */
  function buildTable() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    worldTransform(g);
    const W = E.W;
    const H = E.H;
    // Khung gỗ
    const wood = g.createLinearGradient(0, -M, 0, H + M);
    wood.addColorStop(0, colors.wood);
    wood.addColorStop(0.5, colors['wood-2']);
    wood.addColorStop(1, colors.wood);
    g.fillStyle = wood;
    roundRect(g, -M, -M, W + 2 * M, H + 2 * M, 22);
    g.fill();
    // Băng (dải nỉ sẫm) và mặt bàn
    g.fillStyle = colors.cushion;
    g.fillRect(-17, -17, W + 34, H + 34);
    const felt = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    felt.addColorStop(0, colors.felt);
    felt.addColorStop(1, colors['felt-2']);
    g.fillStyle = felt;
    g.fillRect(0, 0, W, H);
    // Mép băng hơi sáng
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, W, H);
    // Vạch phát bi, điểm đặt bi
    g.strokeStyle = colors['line-soft'];
    g.lineWidth = 1.5;
    g.setLineDash([6, 8]);
    g.beginPath();
    g.moveTo(E.HEAD_X, 0);
    g.lineTo(E.HEAD_X, H);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = colors['line-soft'];
    [[E.FOOT_X, H / 2], [E.HEAD_X, H / 2]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    });
    // Miệng lỗ (cắt qua băng, sẫm dần về lỗ) và lỗ
    g.fillStyle = 'rgba(0,0,0,0.5)';
    const mouth = (pts) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fill();
    };
    [[1, 1, 0, 0], [-1, 1, W, 0], [1, -1, 0, H], [-1, -1, W, H]].forEach(([sx, sy, ox, oy]) => {
      mouth([[ox + sx * 46, oy], [ox + sx * 12, oy - sy * 24], [ox - sx * 24, oy + sy * 12], [ox, oy + sy * 46]]);
    });
    [[0, -1], [H, 1]].forEach(([y, s]) => mouth([[W / 2 - 32, y], [W / 2 - 24, y + s * 22], [W / 2 + 24, y + s * 22], [W / 2 + 32, y]]));
    E.POCKETS.forEach((P) => {
      const r = P.side ? 27 : 31;
      const hole = g.createRadialGradient(P.x, P.y, r * 0.2, P.x, P.y, r);
      hole.addColorStop(0, '#000');
      hole.addColorStop(1, colors.pocket);
      g.fillStyle = hole;
      g.beginPath();
      g.arc(P.x, P.y, r, 0, Math.PI * 2);
      g.fill();
    });
    // Mắt ngắm trên khung gỗ
    g.fillStyle = colors.sight;
    const dia = (x, y) => {
      g.beginPath();
      g.moveTo(x, y - 5);
      g.lineTo(x + 4, y);
      g.lineTo(x, y + 5);
      g.lineTo(x - 4, y);
      g.closePath();
      g.fill();
    };
    for (let k = 1; k < 8; k++) {
      if (k === 4) continue;
      dia((W * k) / 8, -32);
      dia((W * k) / 8, H + 32);
    }
    for (let k = 1; k < 4; k++) {
      dia(-32, (H * k) / 4);
      dia(W + 32, (H * k) / 4);
    }
    tableCache = c;
  }
  function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  /* ---------------- Ảnh bi (dựng sẵn theo cỡ hiện tại) ---------------- */
  function sprite(n) {
    if (sprites[n]) return sprites[n];
    const r = E.R * view.s;
    const d = view.dpr;
    const size = Math.ceil((r * 2 + 2) * d);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, size / 2, size / 2);
    const col = ballColor(n);
    const stripe = n > 8;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = stripe || n === 0 ? BALL_COLORS[0] : col;
    g.fill();
    if (stripe) {
      g.save();
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = col;
      g.fillRect(-r, -r * 0.56, r * 2, r * 1.12);
      g.restore();
    }
    if (n > 0) {
      g.beginPath();
      g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      g.fillStyle = '#fbfaf5';
      g.fill();
      if (r >= 7) {
        g.fillStyle = '#15161b';
        g.font = '800 ' + Math.max(6, r * (n > 9 ? 0.56 : 0.66)).toFixed(1) + 'px ' + colors.font;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(n), 0, r * 0.04);
      }
    }
    // Bóng khối: viền tối + điểm sáng
    const edge = g.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = edge;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    const hi = g.createRadialGradient(-r * 0.38, -r * 0.42, 0, -r * 0.38, -r * 0.42, r * 0.7);
    hi.addColorStop(0, 'rgba(255,255,255,0.75)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    sprites[n] = c;
    return c;
  }

  /* ---------------- Vẽ mỗi khung ---------------- */
  /** Vị trí bi đang vẽ: khung hình đang phát (nội suy) hoặc ván hiện tại. Trả mảng [x, y, scale, alpha] | null. */
  function currentBalls() {
    const out = [];
    if (anim) {
      const frames = anim.out.sim.frames;
      const fi = Math.max(0, anim.t) * FPS;
      const i0 = Math.min(frames.length - 1, Math.floor(fi));
      const i1 = Math.min(frames.length - 1, i0 + 1);
      const k = fi - Math.floor(fi);
      const f0 = frames[i0];
      const f1 = frames[i1];
      for (let n = 0; n < 16; n++) {
        let x = f0[n * 2];
        let y = f0[n * 2 + 1];
        if (!Number.isNaN(f1[n * 2]) && !Number.isNaN(x)) {
          x = lerp(x, f1[n * 2], k);
          y = lerp(y, f1[n * 2 + 1], k);
        }
        if (Number.isNaN(x)) {
          // bi vừa rơi: trượt vào lỗ, nhỏ dần
          const pot = anim.pots[n];
          const age = pot ? anim.t - pot.t : Infinity;
          if (!pot || calm() || age > POT_ANIM || age < 0) out.push(null);
          else {
            const q = age / POT_ANIM;
            const P = E.POCKETS[pot.p];
            out.push([lerp(pot.x, P.x, q), lerp(pot.y, P.y, q), 1 - q * 0.55, 1 - q * 0.7]);
          }
        } else out.push([x, y, 1, 1]);
      }
      return out;
    }
    for (let n = 0; n < 16; n++) {
      const b = game.balls[n];
      if (n === 0 && cuePos && game.ballInHand && phase !== 'over') out.push([cuePos.x, cuePos.y, 1, 1]);
      else out.push(b.on ? [b.x, b.y, 1, 1] : null);
    }
    return out;
  }

  /** Bi cái đang ở đâu (để ngắm / vẽ gậy). */
  function cueAt() {
    if (cuePos && game.ballInHand) return cuePos;
    return game.balls[0];
  }

  function drawGuide(c) {
    const set = kit.settings.get();
    if (!set.guide) return;
    const lens = GUIDE[isCpu() ? cur.level : 'medium'];
    const pr = E.predict(game, aim.angle, c, aim.spin);
    if (!pr) return;
    const px = 1 / view.s; // 1 px CSS theo đơn vị bàn
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.guide;
    ctx.lineWidth = 1.6 * px;
    ctx.setLineDash([7 * px, 6 * px]);
    ctx.beginPath();
    ctx.moveTo(c.x + Math.cos(aim.angle) * E.R, c.y + Math.sin(aim.angle) * E.R);
    ctx.lineTo(pr.x, pr.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Bi ma ở chỗ chạm
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, E.R, 0, Math.PI * 2);
    ctx.stroke();
    if (pr.ball != null) {
      const b = game.balls[pr.ball];
      const legal = E.isLegalFirst(game, game.turn, pr.ball);
      if (lens[0] > 0) {
        ctx.strokeStyle = legal ? colors.guide : colors.bad;
        ctx.lineWidth = 2.2 * px;
        ctx.beginPath();
        ctx.moveTo(b.x + pr.ox * E.R, b.y + pr.oy * E.R);
        ctx.lineTo(b.x + pr.ox * (E.R + lens[0]), b.y + pr.oy * (E.R + lens[0]));
        ctx.stroke();
      }
      if (!legal) {
        // dấu × trên bi không được chạm trước
        const r = E.R * 0.7;
        ctx.strokeStyle = colors.bad;
        ctx.lineWidth = 2.6 * px;
        ctx.beginPath();
        ctx.moveTo(b.x - r, b.y - r);
        ctx.lineTo(b.x + r, b.y + r);
        ctx.moveTo(b.x + r, b.y - r);
        ctx.lineTo(b.x - r, b.y + r);
        ctx.stroke();
      }
      if (lens[1] > 0 && (pr.cx || pr.cy)) {
        ctx.strokeStyle = colors['guide-2'];
        ctx.lineWidth = 1.4 * px;
        ctx.setLineDash([4 * px, 5 * px]);
        ctx.beginPath();
        ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(pr.x + pr.cx * lens[1], pr.y + pr.cy * lens[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (lens[1] > 0 && pr.pocket == null) {
      ctx.strokeStyle = colors['guide-2'];
      ctx.lineWidth = 1.4 * px;
      ctx.setLineDash([4 * px, 5 * px]);
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(pr.x + pr.rx * lens[1], pr.y + pr.ry * lens[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Gậy: đầu gậy cách bi `gap` đơn vị, kéo lùi theo lực. */
  function drawCue(c, angle, gap) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const L = 560;
    const x0 = c.x - dx * (E.R + gap);
    const y0 = c.y - dy * (E.R + gap);
    const x1 = x0 - dx * L;
    const y1 = y0 - dy * L;
    const nx = -dy;
    const ny = dx;
    const w0 = 3.6;
    const w1 = 7.5;
    // bóng gậy
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0 + 6, y0 + ny * w0 + 8);
    ctx.lineTo(x1 + nx * w1 + 6, y1 + ny * w1 + 8);
    ctx.lineTo(x1 - nx * w1 + 6, y1 - ny * w1 + 8);
    ctx.lineTo(x0 - nx * w0 + 6, y0 - ny * w0 + 8);
    ctx.closePath();
    ctx.fill();
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, colors['cue-1']);
    grad.addColorStop(0.62, colors['cue-1']);
    grad.addColorStop(0.63, colors['cue-2']);
    grad.addColorStop(1, colors['cue-2']);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
    ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
    ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
    ctx.closePath();
    ctx.fill();
    // đầu gậy: khâu trắng + đầu xanh
    ctx.fillStyle = '#f5f2ea';
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
    ctx.lineTo(x0 - dx * 9 + nx * w0, y0 - dy * 9 + ny * w0);
    ctx.lineTo(x0 - dx * 9 - nx * w0, y0 - dy * 9 - ny * w0);
    ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3d7bd9';
    ctx.beginPath();
    ctx.arc(x0, y0, w0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    if (!view.w || !game) return;
    if (!tableCache) buildTable();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tableCache, 0, 0);
    const balls = currentBalls();
    const c = cueAt();
    const aiming = phase === 'aim' && canAimLook();
    worldTransform(ctx);
    // Vùng được đặt bi (cú phá) + đường ngắm
    if (phase === 'aim' && game.ballInHand && game.kitchen && !isAiTurn()) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 0, E.HEAD_X, E.H);
    }
    if (aiming) drawGuide(c);
    // Bóng bi
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const r = E.R * view.s;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    balls.forEach((b) => {
      if (!b || b[3] < 1) return;
      const [sx, sy] = S(b[0], b[1]);
      ctx.beginPath();
      ctx.arc(sx + r * 0.18, sy + r * 0.24, r * 1.02, 0, Math.PI * 2);
      ctx.fill();
    });
    // Bi
    balls.forEach((b, n) => {
      if (!b) return;
      const [sx, sy] = S(b[0], b[1]);
      const sp = sprite(n);
      const size = (sp.width / view.dpr) * b[2];
      ctx.globalAlpha = b[3];
      ctx.drawImage(sp, sx - size / 2, sy - size / 2, size, size);
    });
    ctx.globalAlpha = 1;
    // Bi trong tay: vòng quanh bi cái (đỏ nếu chỗ đặt không hợp lệ)
    if (phase === 'aim' && game.ballInHand && !isAiTurn() && cuePos) {
      const [sx, sy] = S(cuePos.x, cuePos.y);
      const ok = E.canPlace(game, cuePos.x, cuePos.y);
      ctx.strokeStyle = ok ? colors.guide : colors.bad;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Gậy
    worldTransform(ctx);
    if (anim && anim.pre > 0 && !calm()) {
      const k = 1 - anim.pre / STROKE;
      drawCue(anim.from, anim.angle, lerp(pullOf(anim.power), 2, k * k));
    } else if (aiming && !drag) {
      drawCue(c, aim.angle, pullOf(aim.power / 100));
    } else if (aiming && drag === 'aim') {
      drawCue(c, aim.angle, pullOf(aim.power / 100));
    } else if (phase === 'think' && ai && ai.phase === 'aim') {
      const cc = ai.cueNow || c;
      drawCue(cc, shownAngle, pullOf(ai.shot.power));
    }
  }
  const pullOf = (power) => 8 + power * 70;
  /** Có vẽ đường ngắm / gậy không (lượt người, không có hộp thoại che thì vẫn vẽ). */
  const canAimLook = () => game && !E.isOver(game) && !isAiTurn();

  /* ---------------- Bảng hai bên, bảng đánh ---------------- */
  function renderMinis(side) {
    const el = $('minis-' + side);
    const g = game.groups;
    if (!g) {
      el.innerHTML = '';
      return;
    }
    const nums = g[side] === E.SOLID ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    let html = nums.map((n) => '<span class="mini' + (n > 8 ? ' stripe' : '') + (game.balls[n].on ? '' : ' off') + '" style="--c:' + ballColor(n) + ';background:' + ballColor(n) + '"></span>').join('');
    html += '<span class="mini' + (E.onEight(game, side) && game.balls[8].on ? '' : ' off') + '" style="background:' + BALL_COLORS[8] + '"></span>';
    el.innerHTML = html;
  }
  function renderHud() {
    for (let i = 0; i < 2; i++) {
      $('name-' + i).textContent = nameOf(i) + (i === 1 && isCpu() ? ' · ' + t('level.' + cur.level) : '');
      const g = game.groups;
      $('group-' + i).textContent = g ? (E.onEight(game, i) ? t('group.eight') : t('group.' + g[i])) : t('group.open');
      renderMinis(i);
      $('side-' + i).classList.toggle('active', !E.isOver(game) && phase !== 'roll' && game.turn === i);
    }
    const pill = $('turn-pill');
    let txt = '';
    const p = game.turn;
    if (E.isOver(game)) txt = phase === 'roll' ? '' : t('turn.over');
    else if (phase === 'think') txt = t(game.ballInHand ? 'turn.cpuHand' : 'turn.cpu');
    else if (phase === 'aim') {
      if (moveMode) txt = t('turn.moving');
      else if (isCpu()) txt = t(game.isBreak ? 'turn.youBreak' : game.ballInHand ? 'turn.youHand' : 'turn.you');
      else txt = t(game.isBreak ? 'turn.playerBreak' : game.ballInHand ? 'turn.playerHand' : 'turn.player', { name: nameOf(p) });
    }
    pill.textContent = txt;
    pill.className = 'turn-pill' + (phase === 'aim' || phase === 'think' ? ' p' + p : '');
    $('btn-ff').hidden = phase !== 'roll';
    $('btn-ff').classList.toggle('on', fast);
    renderControls();
  }
  function renderControls() {
    const can = canAim();
    $('controls').classList.toggle('wait', !can);
    $('btn-shoot').disabled = !can;
    board.classList.toggle('aiming', can);
    $('power').value = String(Math.round(aim.power));
    $('power-val').textContent = Math.round(aim.power) + '%';
    const s = aim.spin;
    $('spin-dot').style.transform = 'translateY(' + (-s * 13).toFixed(1) + 'px)';
    $('spin-text').textContent = s === 0 ? '0' : (s > 0 ? '↑' : '↓') + Math.round(Math.abs(s) * 100) + '%';
    const label = s === 0 ? t('spin.none') : t(s > 0 ? 'spin.follow' : 'spin.draw', { n: Math.round(Math.abs(s) * 100) });
    $('spin').setAttribute('aria-label', t('ctl.spin') + ' — ' + label);
  }

  /* ---------------- Ngắm ---------------- */
  const norm = (a) => {
    let x = a % (Math.PI * 2);
    if (x < 0) x += Math.PI * 2;
    return x;
  };
  function setAngle(a) {
    aim.angle = norm(a);
    shownAngle = aim.angle;
    dirty = true;
  }
  function setPower(p) {
    aim.power = Math.round(clamp(p, 2, 100));
    renderControls();
    dirty = true;
  }
  function setSpin(s) {
    aim.spin = clamp(Math.round(s * 4) / 4, -1, 1);
    renderControls();
    dirty = true;
  }
  /** Bi trong tay: đặt bi cái tới (x, y) (kẹp trong bàn / sau vạch); trả true nếu chỗ đó hợp lệ. */
  function placeCue(x, y) {
    const maxX = game.kitchen ? E.HEAD_X : E.W - E.R;
    cuePos = { x: Math.round(clamp(x, E.R, maxX) * 1000) / 1000, y: Math.round(clamp(y, E.R, E.H - E.R) * 1000) / 1000 };
    const ok = E.canPlace(game, cuePos.x, cuePos.y);
    if (ok) lastValid = { x: cuePos.x, y: cuePos.y };
    dirty = true;
    return ok;
  }
  /** Góc nhắm thẳng vào bi gần nhất mình được chạm (đầu lượt / cú phá). */
  function defaultAngle() {
    const c = cueAt();
    const targets = E.legalTargets(game, game.turn);
    let best = null;
    let bd = Infinity;
    targets.forEach((n) => {
      const b = game.balls[n];
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    });
    if (game.isBreak) {
      // đỉnh tam giác: bi gần đầu bàn nhất
      best = null;
      targets.forEach((n) => { if (!best || game.balls[n].x < best.x) best = game.balls[n]; });
    }
    return best ? Math.atan2(best.y - c.y, best.x - c.x) : 0;
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const tot = totals();
    const live = inProgress() && isCpu();
    const left = (side) => (game.groups ? E.remaining(game, game.groups[side]) : 7);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: tot.played ? [{ value: fmt(tot.won), label: t('stats.won') }, { value: potRate(), label: t('stats.potRate') }] : [],
      resume: live ? { title: t('app.name'), detail: t('summary.resume', { level: t('level.' + cur.level), a: left(0), b: left(1) }), pct: (7 - left(0)) / 8 } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress()) {
      kit.store.write(keys.save, {
        v: 1, mode: cur.mode, level: cur.level, humanShots: cur.humanShots,
        aim: { angle: Math.round(aim.angle * 1e5) / 1e5, power: aim.power, spin: aim.spin },
        game: E.toJSON(game),
      });
    } else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function setGame(g, c) {
    cancelAi();
    clearTimeout(resultTimer);
    anim = null;
    drag = null;
    moveMode = false;
    cuePos = null;
    game = g;
    cur = c;
    dirty = true;
  }

  function newGame() {
    const s = kit.settings.get();
    const mode = s.opponent === 'human' ? 'pvp' : 'cpu';
    const level = LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium';
    kit.modal.close('modal-result');
    setGame(E.newGame({ seed: (Math.random() * 4294967296) >>> 0 }), { mode, level, humanShots: 0, ended: false });
    aim.power = 90;
    aim.spin = 0;
    kit.store.remove(keys.save);
    if (mode === 'cpu') kit.sdk.start(level);
    kit.sfx('start');
    nextTurn();
    writeSummary();
  }

  /** Bắt đầu lượt: người thì chuẩn bị ngắm (bi trong tay: đặt bi cái chỗ hợp lệ), máy thì bắt đầu nghĩ. */
  function nextTurn(restoring) {
    if (E.isOver(game)) {
      phase = 'over';
      renderHud();
      return;
    }
    moveMode = false;
    cuePos = null;
    if (game.ballInHand) {
      const b = game.balls[0];
      const spot = E.canPlace(game, b.x, b.y) ? { x: b.x, y: b.y } : E.nearestFree(game, game.kitchen ? E.HEAD_X - 40 : b.x, b.y);
      cuePos = spot;
      lastValid = { x: spot.x, y: spot.y };
    }
    if (isAiTurn()) {
      phase = 'think';
      shownAngle = aim.angle;
      scheduleAi();
    } else {
      phase = 'aim';
      if (restoring) setAngle(aim.angle); // mở lại ván: giữ góc / lực đã lưu
      else setAngle(game.isBreak || game.ballInHand || game.last == null ? defaultAngle() : aim.angle);
    }
    announce(t('live.turn', { name: nameOf(game.turn) }));
    renderHud();
    dirty = true;
  }

  function humanShoot() {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    if (phase !== 'aim' || isAiTurn()) {
      kit.toast(t('toast.wait'));
      return;
    }
    const shot = { angle: aim.angle, power: aim.power / 100, spin: aim.spin };
    if (game.ballInHand) {
      if (!cuePos || !E.canPlace(game, cuePos.x, cuePos.y)) {
        kit.sfx('error', { volume: 0.5 });
        kit.toast(t('toast.badSpot'));
        return;
      }
      shot.cue = { x: cuePos.x, y: cuePos.y };
    }
    shoot(shot, true);
  }

  /** Đánh: engine tính trọn cú đánh, app phát lại. */
  function shoot(shot, byHuman) {
    const before = game;
    const out = E.shoot(game, shot, { record: true });
    if (!out) {
      kit.sfx('error', { volume: 0.5 });
      return;
    }
    const p = before.turn;
    game = out.state;
    if (byHuman) {
      cur.humanShots++;
      if (before.isBreak) aim.power = 40; // sau cú phá: lực mặc định vừa phải cho cú sau
      if (isCpu() && !before.isBreak) {
        stats.shots++;
        const mine = game.groups ? game.groups[0] : null;
        if (!game.last.foul && mine && game.last.potted.some((n) => E.groupOf(n) === mine)) stats.pots++;
        saveStats();
      }
    }
    const pots = {};
    out.sim.events.forEach((e) => { if (e.k === 'pot') pots[e.n] = e; });
    anim = { out, t: 0, ev: 0, pre: calm() ? 0 : STROKE, angle: shot.angle, power: shot.power, from: out.start[0], pots, lastSfx: -1 };
    phase = 'roll';
    drag = null;
    moveMode = false;
    cuePos = null;
    cancelAi();
    kit.sfx('pop', { volume: 0.35 + 0.65 * shot.power, pitch: 0.8 + shot.power * 0.3 });
    if (byHuman) buzz(12);
    announce(t('live.shot', { name: nameOf(p), power: Math.round(shot.power * 100) }));
    persist();
    renderHud();
  }

  /** Phát lại: gậy thúc tới, rồi bi chạy theo khung hình; âm thanh theo sự kiện va chạm. */
  function stepAnim(dt) {
    if (anim.pre > 0) {
      anim.pre -= dt;
      if (anim.pre > 0) return;
      dt = -anim.pre;
      anim.pre = 0;
    }
    anim.t += dt * speed();
    const evs = anim.out.sim.events;
    while (anim.ev < evs.length && evs[anim.ev].t <= anim.t) playEvent(evs[anim.ev++]);
    if (anim.t >= anim.out.sim.time + 0.25) endShot();
  }
  function playEvent(e) {
    if (e.k === 'pot') {
      kit.sfx('drop', { volume: 0.8 });
      buzz(20);
      return;
    }
    // hạn chế dồn âm: tối đa một tiếng mỗi 35 ms
    if (anim.t - anim.lastSfx < 0.035) return;
    anim.lastSfx = anim.t;
    if (e.k === 'ball') kit.sfx('tap', { volume: clamp(e.s / 1600, 0.12, 1), pitch: 1.3 });
    else if (e.k === 'rail' && e.s > 120) kit.sfx('tick', { volume: clamp(e.s / 2400, 0.08, 0.5), pitch: 0.7 });
  }

  function endShot() {
    if (!anim) return;
    anim = null;
    dirty = true;
    const L = game.last;
    const name = nameOf(L.by);
    const msgs = [];
    if (L.potted.length) {
      const list = L.potted.map((n) => (n === 0 ? '○' : String(n))).join(', ');
      msgs.push(t('live.potted', { list }));
    } else msgs.push(t('live.none'));
    if (!E.isOver(game)) {
      if (L.foul) {
        const txt = t('foul.' + L.foul) + ' — ' + t('foul.hand', { name: nameOf(1 - L.by) });
        kit.toast(txt, 2600);
        kit.sfx('error', { volume: 0.6 });
        msgs.push(txt);
      } else if (L.assigned) {
        const txt = t('toast.assigned', { name, group: t('group.' + L.assigned) });
        kit.toast(txt, 2200);
        kit.sfx('coin');
        msgs.push(txt);
      } else if (L.eight === 'spot') {
        kit.toast(t('toast.spot'), 2400);
        msgs.push(t('toast.spot'));
      }
    }
    announce(msgs.join(' '));
    if (E.isOver(game)) finish();
    else nextTurn();
    persist();
  }

  /* ---------------- Máy ---------------- */
  function scheduleAi() {
    const token = ++aiToken;
    const planner = E.createPlanner(game, cur.level);
    const t0 = performance.now();
    ai = { token, phase: 'plan' };
    const tick = () => {
      if (token !== aiToken) return;
      const start = performance.now();
      while (!planner.done && performance.now() - start < 8) planner.step(1);
      if (!planner.done) {
        setTimeout(tick, 0);
        return;
      }
      const shot = planner.result();
      const wait = Math.max(0, (calm() ? 300 : MIN_THINK_MS) - (performance.now() - t0));
      setTimeout(() => {
        if (token !== aiToken || !isAiTurn()) return;
        const from = shownAngle;
        let to = shot.angle;
        // xoay theo đường ngắn nhất
        while (to - from > Math.PI) to -= Math.PI * 2;
        while (to - from < -Math.PI) to += Math.PI * 2;
        const cueFrom = cueAt();
        ai = { token, phase: 'aim', shot, from, to, start: performance.now(), dur: calm() ? 200 : AIM_MS, cueFrom: { x: cueFrom.x, y: cueFrom.y }, cueTo: shot.cue || null, cueNow: { x: cueFrom.x, y: cueFrom.y } };
        dirty = true;
        setTimeout(() => {
          if (token !== aiToken || !isAiTurn()) return;
          shoot(shot, false);
        }, ai.dur + (calm() ? 60 : 180));
      }, wait);
    };
    setTimeout(tick, 30);
  }
  function cancelAi() {
    aiToken++;
    ai = null;
  }
  function stepAi() {
    if (!ai || ai.phase !== 'aim') return false;
    const k = clamp((performance.now() - ai.start) / ai.dur, 0, 1);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    shownAngle = lerp(ai.from, ai.to, e);
    if (ai.cueTo) {
      ai.cueNow = { x: lerp(ai.cueFrom.x, ai.cueTo.x, e), y: lerp(ai.cueFrom.y, ai.cueTo.y, e) };
      cuePos = ai.cueNow;
    }
    return true;
  }

  /* ---------------- Hết ván ---------------- */
  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    phase = 'over';
    const w = game.winner;
    const L = game.last;
    let title;
    let text;
    let won = false;
    const loserText = () => t(L.foul ? 'result.textFoul8' : 'result.textEarly', { name: nameOf(L.by) });
    if (isCpu()) {
      won = w === 0;
      const lv = stats.levels[cur.level];
      lv.played++;
      if (won) {
        lv.won++;
        stats.streak++;
        stats.best = Math.max(stats.best, stats.streak);
      } else {
        lv.lost++;
        stats.streak = 0;
      }
      saveStats();
      kit.sdk.end({ mode: cur.level, won, assisted: false });
      kit.sfx(won ? 'win' : 'lose');
      if (won) kit.confetti();
      title = t(won ? 'result.win' : 'result.lose');
      if (L.eight === 'win') text = t(won ? 'result.textWin' : 'result.textCpuWin', { level: t('level.' + cur.level) });
      else text = loserText();
      $('result-streak').hidden = !won || stats.streak < 2;
      $('result-streak').textContent = t('result.streak', { n: stats.streak });
    } else {
      won = true;
      kit.sfx('win');
      kit.confetti();
      title = t('result.pvp', { name: nameOf(w) });
      text = L.eight === 'win' ? t('result.textPvp', { name: nameOf(w) }) : loserText();
      $('result-streak').hidden = true;
    }
    $('result-title').textContent = title;
    $('result-text').textContent = text;
    $('result-art').className = 'result-art' + (won ? '' : ' lose');
    announce(title + ' ' + text);
    persist();
    renderHud();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => kit.modal.open('modal-result'), calm() ? 200 : 700);
  }

  /** Ván đang dở (đã đánh) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) {
      $('confirm-text').textContent = t(isCpu() ? 'confirm.text' : 'confirm.textPvp');
      kit.modal.open('modal-confirm');
    } else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress() && isCpu()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    cur.ended = true;
    newGame();
  }

  /** Đổi mức / đối thủ: chưa đánh cú nào thì chơi ván mới ngay, đã đánh thì để ván sau. */
  function onSetting(key) {
    if (key === 'theme') {
      requestAnimationFrame(readColors);
      return;
    }
    if (key === 'guide') {
      dirty = true;
      return;
    }
    if (key !== 'level' && key !== 'opponent') return;
    if (!game) return;
    if (!E.isOver(game) && cur.humanShots === 0 && phase !== 'roll') newGame();
    else kit.toast(t('toast.next'));
    renderLevelSetting();
  }
  function renderLevelSetting() {
    $('setting-level').classList.toggle('dim', kit.settings.get().opponent === 'human');
  }

  /* ---------------- Vòng lặp vẽ ---------------- */
  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // tab vừa quay lại: không bù cả quãng dài
    let busy = false;
    if (anim) {
      stepAnim(dt);
      busy = true;
    }
    if (stepAi()) busy = true;
    if (busy || dirty) {
      draw();
      dirty = false;
    }
  }

  /* ---------------- Điều khiển ---------------- */
  function pointerWorld(e) {
    return toWorld(e.clientX, e.clientY);
  }
  function aimAt(p) {
    const c = cueAt();
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (dx * dx + dy * dy < E.R * E.R) return;
    setAngle(Math.atan2(dy, dx));
  }
  board.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (phase === 'roll') {
      fast = true;
      renderHud();
      return;
    }
    if (!canAim()) return;
    const p = pointerWorld(e);
    const c = cueAt();
    const grab = Math.max(E.R * 2.2, 24 / view.s);
    try {
      board.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
    if (game.ballInHand && Math.hypot(p.x - c.x, p.y - c.y) < grab) {
      drag = 'place';
      board.classList.add('placing');
      kit.sfx('tap', { volume: 0.3 });
    } else {
      drag = 'aim';
      aimAt(p);
    }
    dirty = true;
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || !canAim()) return;
    const p = pointerWorld(e);
    if (drag === 'place') placeCue(p.x, p.y);
    else aimAt(p);
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag === 'place' && cuePos && !E.canPlace(game, cuePos.x, cuePos.y)) {
      if (lastValid) cuePos = { x: lastValid.x, y: lastValid.y };
      kit.toast(t('toast.badSpot'));
      kit.sfx('error', { volume: 0.4 });
    }
    drag = null;
    board.classList.remove('placing');
    dirty = true;
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('lostpointercapture', endDrag);

  $('power').addEventListener('input', (e) => {
    if (canAim()) setPower(Number(e.target.value));
    else renderControls();
  });
  $('btn-shoot').addEventListener('click', humanShoot);
  $('btn-ff').addEventListener('click', (e) => {
    e.stopPropagation();
    fast = !fast;
    renderHud();
  });
  $('btn-ff').addEventListener('pointerdown', (e) => e.stopPropagation());

  // Xoáy: chạm nửa trên / dưới bi cái nhỏ; bàn phím (Enter / Space trên nút) đổi vòng 0 → theo → kéo
  const spinBtn = $('spin');
  spinBtn.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !canAim()) return;
    e.preventDefault();
    const r = spinBtn.querySelector('.spin-ball').getBoundingClientRect();
    const k = (r.top + r.height / 2 - e.clientY) / (r.height / 2);
    setSpin(Math.abs(k) < 0.25 ? 0 : k);
    kit.sfx('tick', { volume: 0.3 });
  });
  spinBtn.addEventListener('click', (e) => {
    if (e.detail !== 0 || !canAim()) return;
    const order = [0, 0.5, 1, -0.5, -1];
    setSpin(order[(order.indexOf(aim.spin) + 1) % order.length] || 0);
  });

  // Nút ‹ ›: chạm một lần xoay 0,1°, giữ thì chạy liên tục (nhanh dần)
  function holdButton(id, dir) {
    const el = $(id);
    let timer = 0;
    let n = 0;
    const stop = () => {
      clearTimeout(timer);
      timer = 0;
    };
    const run = (delay) => {
      if (!canAim()) return stop();
      n++;
      setAngle(aim.angle + dir * (n > 25 ? 0.6 : n > 8 ? 0.25 : 0.1) * DEG);
      timer = setTimeout(() => run(55), delay);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      stop();
      n = 0;
      run(380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, stop));
    el.addEventListener('click', (e) => { if (e.detail === 0 && canAim()) setAngle(aim.angle + dir * 0.1 * DEG); });
  }
  holdButton('aim-left', -1);
  holdButton('aim-right', 1);

  /** Hướng mũi tên trên màn hình → hướng trên bàn (bàn đứng thì xoay). */
  function screenDir(k) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    return view.rot ? { x: -d[1], y: d[0] } : { x: d[0], y: d[1] };
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const el = e.target && e.target.closest ? e.target.closest('button, input, select, a') : null;
    const onRange = !!el && el.classList.contains('range');
    const arrow = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';
    if (arrow) {
      if (onRange || (el && el.closest('.segmented'))) return; // để thanh trượt / nhóm nút tự xử lý
      if (!canAim()) return;
      if (moveMode && game.ballInHand) {
        const d = screenDir(k);
        const step = e.shiftKey ? 25 : 5;
        const c = cueAt();
        placeCue(c.x + d.x * step, c.y + d.y * step);
      } else if (k === 'ArrowLeft') setAngle(aim.angle - (e.shiftKey ? 2 : 0.25) * DEG);
      else if (k === 'ArrowRight') setAngle(aim.angle + (e.shiftKey ? 2 : 0.25) * DEG);
      else if (k === 'ArrowUp') setPower(aim.power + (e.shiftKey ? 10 : 1));
      else setPower(aim.power - (e.shiftKey ? 10 : 1));
    } else if (k === ' ' || k === 'Enter') {
      if (phase === 'roll') {
        fast = !fast;
        renderHud();
      } else if (el && !onRange && el.offsetParent !== null) return; // để trình duyệt bấm nút đang focus
      else if (moveMode) {
        moveMode = false;
        renderHud();
      } else humanShoot();
    } else if (k === 'w' || k === 'W') {
      if (canAim()) setSpin(aim.spin + 0.25);
    } else if (k === 's' || k === 'S') {
      if (canAim()) setSpin(aim.spin - 0.25);
    } else if (k === 'm' || k === 'M') {
      if (!humanHand()) return;
      moveMode = !moveMode;
      if (!moveMode && cuePos && !E.canPlace(game, cuePos.x, cuePos.y) && lastValid) cuePos = { x: lastValid.x, y: lastValid.y };
      renderHud();
      dirty = true;
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    $('stats-played').textContent = fmt(tot.played);
    $('stats-won').textContent = fmt(tot.won);
    $('stats-pot').textContent = potRate();
    $('stats-best').textContent = fmt(stats.best);
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td><td>' + fmt(r.lost) + '</td></tr>';
    }).join('');
  }

  // Rời trang khi bi đang lăn: kết thúc hoạt cảnh ngay để ván (và kết quả nếu là cú cuối) được ghi nhận
  kit.onLeave(() => {
    if (anim) endShot();
    persist();
  });
  // Mở / đóng hộp thoại thì vẽ lại (đường ngắm ẩn khi không ngắm được)
  new MutationObserver(() => { dirty = true; renderControls(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(readColors));
  if (window.ResizeObserver) new ResizeObserver(() => { layout(); draw(); }).observe(board);
  window.addEventListener('resize', () => { layout(); draw(); });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  readColors();
  layout();
  renderLevelSetting();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && (saved.mode === 'cpu' || saved.mode === 'pvp') && LEVELS.indexOf(saved.level) >= 0 &&
    Number.isInteger(saved.humanShots) && saved.humanShots > 0 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isOver(restored)) {
    setGame(restored, { mode: saved.mode, level: saved.level, humanShots: saved.humanShots, ended: false });
    const a = saved.aim || {};
    aim.power = Number.isFinite(a.power) ? clamp(Math.round(a.power), 2, 100) : 40;
    aim.spin = Number.isFinite(a.spin) ? clamp(Math.round(a.spin * 4) / 4, -1, 1) : 0;
    if (Number.isFinite(a.angle)) aim.angle = norm(a.angle);
    if (saved.mode === 'cpu') kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    if (!Number.isFinite(a.angle)) aim.angle = 0;
    nextTurn(Number.isFinite(a.angle));
    writeSummary();
  } else {
    kit.store.remove(keys.save);
    newGame();
  }
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
  // Fonts tải xong thì vẽ lại số trên bi
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sprites = []; dirty = true; });
  requestAnimationFrame((now) => {
    lastT = now;
    frame(now);
  });
})();
