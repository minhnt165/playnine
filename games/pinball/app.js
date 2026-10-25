/* =====================================================================
 * Pinball - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vòng lặp requestAnimationFrame, mô phỏng theo nhịp cố định 1/120 giây (engine.step, mỗi nhịp 4 bước con)
 *     nên máy nhanh hay chậm đều như nhau; dt bị chặn khi tab vừa quay lại
 *   - Canvas nhân devicePixelRatio, bàn 600 × 1000 tự co theo khung; dọc: HUD trên, ngang: bàn giữa, HUD hai bên
 *   - Lớp tĩnh (nền tinh vân, tường, ray) vẽ sẵn vào canvas phụ, mỗi khung chỉ vẽ phần động (đèn, flipper, bi…)
 *   - Điều khiển: phím ← Z Shift trái / → M Shift phải (flipper), ↓ / Space giữ (lò xo); chạm giữ nửa trái / phải
 *     (đa chạm), góc dưới phải khi bi chờ phóng: kéo xuống / giữ rồi thả
 *   - Phase: ready (màn chờ) → playing ⇄ paused → over
 *   - Báo ván cho cổng (metric score_high, mode classic):
 *     · bấm Bắt đầu: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     · hết 3 bi: kit.sdk.end({ mode, won: false, score })
 *     · bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi won: false với điểm hiện có; chưa thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = E.CONST;
  const T = E.TABLE;
  const MODE = 'classic';
  const STEP_MS = 1000 / C.TPS;
  const TAU = Math.PI * 2;

  const kit = PNKit.init({
    gameId: 'pinball',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmt = (n) => kit.i18n.fmtNumber(n);

  const app = $('app');
  const play = $('play');
  const stage = $('stage');
  const field = $('field');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas'); // lớp tĩnh
  const bctx = bg.getContext('2d');

  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceMQ.matches;
  reduceMQ.addEventListener('change', (e) => { reduced = e.matches; });

  /* ---------------- Thống kê ---------------- */
  const stats = Object.assign({ played: 0, best: 0, total: 0, ramps: 0, banks: 0, jackpots: 0 }, kit.store.read(keys.stats, {}) || {});
  Object.keys(stats).forEach((k) => { if (!Number.isFinite(stats[k]) || stats[k] < 0) stats[k] = 0; });

  /* ---------------- Trạng thái ---------------- */
  let game = null; // ván đang chơi
  let preview = E.newGame(1); // màn chờ: bàn trống, bi nằm trên lò xo
  let phase = 'ready'; // ready | playing | paused | over
  let overAt = 0;
  let particles = [];
  let popups = [];

  const shown = () => game || preview;

  /* ================================================================
   * Điều khiển: bàn phím + chạm
   * ================================================================ */
  const held = new Set(); // left | right | plunge
  function keyRole(e) {
    if (e.code === 'ShiftLeft') return 'left';
    if (e.code === 'ShiftRight') return 'right';
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'z') return 'left';
    if (k === 'arrowright' || k === 'm' || k === '/') return 'right';
    if (k === 'arrowdown' || k === ' ') return 'plunge';
    return null;
  }

  const pointers = new Map(); // pointerId → { role, y0, pull }
  function currentInput() {
    let left = held.has('left');
    let right = held.has('right');
    let plunge = held.has('plunge') ? true : 0;
    for (const p of pointers.values()) {
      if (p.role === 'left') left = true;
      else if (p.role === 'right') right = true;
      else if (p.role === 'plunge' && plunge !== true) plunge = p.pull === true ? true : Math.max(plunge, p.pull);
    }
    return { left, right, plunge: plunge || false };
  }
  function releaseAll() {
    held.clear();
    pointers.clear();
  }

  const coarse = window.matchMedia('(pointer: coarse)');
  function setTouch(on) {
    app.classList.toggle('touch-on', on);
  }

  play.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setTouch(true);
    if (phase !== 'playing' || (e.target.closest && e.target.closest('button'))) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const r = field.getBoundingClientRect();
    const g = game;
    let role = e.clientX < r.left + r.width * 0.5 ? 'left' : 'right';
    // Góc dưới phải khi bi đang chờ phóng: lò xo
    if (g && E.ballWaiting(g) && e.clientX > r.left + r.width * 0.6 && e.clientY > r.top + r.height * 0.55) role = 'plunge';
    pointers.set(e.pointerId, { role, y0: e.clientY, pull: true });
    try {
      play.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
    if (role !== 'plunge') buzz(6);
  });
  play.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || p.role !== 'plunge') return;
    const r = field.getBoundingClientRect();
    const dy = e.clientY - p.y0;
    // Kéo xuống: độ nén theo quãng kéo (16% chiều cao bàn = nén hết); chưa kéo thì giữ là nén dần như phím
    p.pull = dy > 6 ? Math.max(0.04, Math.min(1, dy / (r.height * 0.16))) : true;
  });
  function pointerEnd(e) {
    pointers.delete(e.pointerId);
  }
  play.addEventListener('pointerup', pointerEnd);
  play.addEventListener('pointercancel', pointerEnd);
  play.addEventListener('lostpointercapture', pointerEnd);
  play.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    if (phase === 'ready' || phase === 'over') {
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        if (e.repeat || (phase === 'over' && performance.now() - overAt < 700)) return;
        startGame();
      } else if (k === 'n') {
        e.preventDefault();
        startGame();
      }
      return;
    }
    if (k === 'p' || k === 'escape') {
      e.preventDefault();
      if (phase === 'playing') pause();
      else if (k === 'p') resume();
      return;
    }
    if (k === 'n') {
      e.preventDefault();
      requestNew();
      return;
    }
    if (phase === 'paused') {
      if ((k === 'enter' || k === ' ') && !e.repeat) {
        e.preventDefault();
        resume();
      }
      return;
    }
    const role = keyRole(e);
    if (role) {
      e.preventDefault();
      held.add(role);
    }
  });
  document.addEventListener('keyup', (e) => {
    const role = keyRole(e);
    if (role) held.delete(role);
    // Thả một phím Shift khi đang giữ cả hai: trình duyệt có thể không báo đúng code, thả luôn cả hai
    if (e.key === 'Shift' && !e.shiftKey) {
      held.delete('left');
      held.delete('right');
    }
  });
  window.addEventListener('blur', releaseAll);

  /* ================================================================
   * Bố cục: bàn 600 × 1000 lớn nhất vừa .stage, căn giữa
   * ================================================================ */
  let dpr = 1;
  let scale = 1; // pixel canvas trên một đơn vị bàn
  let cssW = 0;

  function layout() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    let s = Math.min(sw / C.W, sh / C.H);
    const w = Math.max(120, Math.floor(C.W * s));
    const h = Math.max(200, Math.floor(C.H * s));
    cssW = w;
    field.style.width = w + 'px';
    field.style.height = h + 'px';
    field.style.left = Math.round((sw - w) / 2) + 'px';
    field.style.top = Math.round((sh - h) / 2) + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    bg.width = canvas.width;
    bg.height = canvas.height;
    scale = canvas.width / C.W;
    buildStatic();
    draw();
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  window.addEventListener('resize', layout);

  /* ================================================================
   * Màu (đọc từ token CSS theo giao diện)
   * ================================================================ */
  let col = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    col = {
      top: v('--pf-top'), bottom: v('--pf-bottom'), neb1: v('--pf-neb1'), neb2: v('--pf-neb2'), star: v('--pf-star'), lane: v('--pf-lane'),
      wall: v('--c-wall'), wall2: v('--c-wall-2'), rubber: v('--c-rubber'), sling: v('--c-sling'), insert: v('--c-insert'),
      lit: v('--c-lit'), lit2: v('--c-lit-2'), planets: [v('--c-planet-1'), v('--c-planet-2'), v('--c-planet-3')], target: v('--c-target'),
      flipper: v('--c-flipper'), flipperEdge: v('--c-flipper-edge'), ball1: v('--c-ball-1'), ball2: v('--c-ball-2'),
      ramp: v('--c-ramp'), rampRail: v('--c-ramp-rail'), text: v('--c-text'), save: v('--c-save'), glow: parseFloat(v('--glow')) || 0,
    };
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors();
    buildStatic();
    draw();
  });

  /* ================================================================
   * Lớp tĩnh: nền tinh vân, sao, làn phóng, tường, ray, đế ramp
   * ================================================================ */
  function playfieldPath(c) {
    c.beginPath();
    c.moveTo(12, C.H + 10);
    c.lineTo(12, T.ARC.y);
    c.arc(T.ARC.x, T.ARC.y, T.ARC.r, Math.PI, TAU);
    c.lineTo(590, C.H + 10);
    c.closePath();
  }

  function strokeLine(c, pts, width, color, glow) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (glow && col.glow) {
      c.globalAlpha = 0.25;
      c.strokeStyle = color;
      c.lineWidth = width * 2.6;
      c.stroke();
      c.globalAlpha = 1;
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }

  function buildStatic() {
    if (!bg.width) return;
    const c = bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, bg.width, bg.height);
    c.setTransform(scale, 0, 0, scale, 0, 0);
    // Khung ngoài (góc trên ngoài vòm)
    c.fillStyle = col.bottom;
    c.fillRect(0, 0, C.W, C.H);
    c.fillStyle = col.wall2;
    c.globalAlpha = 0.35;
    c.fillRect(0, 0, C.W, C.H);
    c.globalAlpha = 1;
    // Mặt bàn
    c.save();
    playfieldPath(c);
    const grad = c.createLinearGradient(0, 0, 0, C.H);
    grad.addColorStop(0, col.top);
    grad.addColorStop(1, col.bottom);
    c.fillStyle = grad;
    c.fill();
    c.clip();
    // Tinh vân + sao
    [[170, 330, 280, col.neb1], [430, 640, 300, col.neb2], [300, 120, 200, col.neb2]].forEach(([x, y, r, cc]) => {
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, cc);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
    let seed = 2024;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    c.fillStyle = col.star;
    for (let i = 0; i < 90; i++) {
      const s = rnd() < 0.12 ? 2.6 : 1.4;
      c.beginPath();
      c.arc(12 + rnd() * 576, rnd() * 1000, s, 0, TAU);
      c.fill();
    }
    // Làn phóng
    c.fillStyle = col.lane;
    c.fillRect(C.LANE_X0, C.LANE_TOP - 40, C.LANE_X1 - C.LANE_X0, C.H);
    // Chữ trang trí giữa bàn
    c.fillStyle = col.wall;
    c.globalAlpha = col.glow ? 0.14 : 0.1;
    c.font = '800 46px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('NEBULA', C.CX, 560);
    c.globalAlpha = 1;
    // Lỗ thoát: tối dần
    const dg = c.createLinearGradient(0, 930, 0, C.H);
    dg.addColorStop(0, 'rgba(0,0,0,0)');
    dg.addColorStop(1, col.glow ? 'rgba(0,0,0,0.55)' : 'rgba(40,20,120,0.18)');
    c.fillStyle = dg;
    c.fillRect(12, 930, 536, 70);
    c.restore();

    // Đế ramp (khối kín sau miệng)
    c.beginPath();
    T.RAMP_BASE.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    c.fillStyle = col.wall2;
    c.globalAlpha = 0.45;
    c.fill();
    c.globalAlpha = 1;

    // Tường: vòm, hai bên, vách làn phóng, thanh dẫn
    const arc = T.ARC_PTS.slice();
    strokeLine(c, [[12, C.H + 10]].concat(arc).concat([[590, C.H + 10]]), 7, col.wall, true);
    c.fillStyle = col.wall;
    c.beginPath();
    c.moveTo(548, C.H + 10);
    c.lineTo(548, C.LANE_TOP);
    c.arc(552, C.LANE_TOP, 4, Math.PI, TAU);
    c.lineTo(556, C.H + 10);
    c.closePath();
    c.fill();
    T.GUIDES.forEach((g) => strokeLine(c, g, 6, col.wall, true));
    T.LANE_GUIDES.forEach((x) => strokeLine(c, [[x, 130], [x, 190]], 6, col.wall, true));
    strokeLine(c, [[T.MOUTH.ax, T.MOUTH.ay], T.RAMP_BASE[1], T.RAMP_BASE[2]], 5, col.wall, false);
    strokeLine(c, [[T.MOUTH.bx, T.MOUTH.by], T.RAMP_BASE[3]], 5, col.wall, false);
    // Cột cao su
    [[T.GUIDES[0][0][0], 700, 5], [T.GUIDES[1][0][0], 700, 5], [T.MOUTH.ax, T.MOUTH.ay, 6], [T.MOUTH.bx, T.MOUTH.by, 6]].forEach(([x, y, r]) => {
      c.beginPath();
      c.arc(x, y, r + 1.5, 0, TAU);
      c.fillStyle = col.rubber;
      c.fill();
    });
    // Cửa một chiều
    strokeLine(c, [[T.GATE.ax, T.GATE.ay], [T.GATE.bx, T.GATE.by]], 2.5, col.wall2, false);
    // Lỗ ở chân làn phóng
    c.fillStyle = col.wall2;
    c.fillRect(C.LANE_X0, C.PLUNGER_Y + C.PULL_DIST + 16, C.LANE_X1 - C.LANE_X0, 30);
  }

  /* ================================================================
   * Vẽ phần động
   * ================================================================ */
  const lit = (tick, at, dur) => tick - at >= 0 && tick - at < dur;
  const blink = (tick, period) => (reduced ? true : Math.floor(tick / period) % 2 === 0);

  function glowCircle(x, y, r, color, a) {
    if (!col.glow && a < 0.5) return;
    const rg = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function insert(x, y, r, on, color, label) {
    if (on) glowCircle(x, y, r * 2.4, color, col.glow ? 0.55 : 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = on ? color : col.insert;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = on ? color : col.wall2;
    ctx.globalAlpha = on ? 1 : 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (label) {
      ctx.fillStyle = on ? '#ffffff' : col.text;
      ctx.globalAlpha = on ? 1 : 0.55;
      ctx.font = '800 ' + Math.round(r * 1.15) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 0.5);
      ctx.globalAlpha = 1;
    }
  }

  function drawRamp() {
    const R = T.RAMP;
    ctx.beginPath();
    for (let i = 0; i < R.n; i += 2) (i ? ctx.lineTo(R.x[i], R.y[i]) : ctx.moveTo(R.x[i], R.y[i]));
    ctx.lineTo(R.x[R.n - 1], R.y[R.n - 1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col.ramp;
    ctx.lineWidth = 34;
    ctx.stroke();
    // Hai ray hai bên
    [-15, 15].forEach((off) => {
      ctx.beginPath();
      for (let i = 0; i < R.n; i += 2) {
        const x = R.x[i] - R.ty[i] * off;
        const y = R.y[i] + R.tx[i] * off;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = col.rampRail;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    });
  }

  function drawFlipper(i, a) {
    const f = T.FLIPPERS[i];
    ctx.save();
    ctx.translate(f.px, f.py);
    ctx.rotate(a);
    const up = Math.atan2(-f.c, f.k);
    const dn = Math.atan2(f.c, f.k);
    ctx.beginPath();
    ctx.moveTo(f.r0 * f.k, -f.r0 * f.c);
    ctx.lineTo(f.L + f.r1 * f.k, -f.r1 * f.c);
    ctx.arc(f.L, 0, f.r1, up, dn, false);
    ctx.lineTo(f.r0 * f.k, f.r0 * f.c);
    ctx.arc(0, 0, f.r0, dn, up + TAU, false);
    ctx.closePath();
    if (col.glow) {
      ctx.shadowColor = col.flipperEdge;
      ctx.shadowBlur = 10 * scale;
    }
    ctx.fillStyle = col.flipper;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = col.flipperEdge;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fillStyle = col.flipperEdge;
    ctx.fill();
    ctx.restore();
  }

  function drawBall(x, y, s) {
    const r = C.R * (s || 1);
    if (!col.glow) {
      ctx.beginPath();
      ctx.arc(x + 2.5, y + 3.5, r, 0, TAU);
      ctx.fillStyle = 'rgba(30, 20, 80, 0.18)';
      ctx.fill();
    } else glowCircle(x, y, r * 2.2, 'rgba(200, 220, 255, 0.5)', 0.5);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, col.ball1);
    g.addColorStop(0.55, '#c9cde3');
    g.addColorStop(1, col.ball2);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function draw() {
    if (!canvas.width) return;
    const g = shown();
    const tick = g.tick;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Làn U F O + skill shot
    const skillOn = g.skill >= 0 && (g.skillT > 0 || (g.saveArmed && E.ballWaiting(g)));
    T.LANES.forEach((x, i) => {
      const on = g.lanes[i] || lit(tick, g.fx.lane[i], 18);
      const sk = skillOn && i === g.skill;
      insert(x, 214, 14, on || (sk && blink(tick, 20)), sk && !g.lanes[i] ? col.lit2 : col.lit, 'UFO'[i]);
    });
    // Hệ số 2× … 5×
    [2, 3, 4, 5].forEach((m, i) => insert(C.CX - 69 + 46 * i, 640, 15, g.mult >= m, col.lit2, m + '×'));
    // Quỹ đạo: 3 mũi tên tiến độ multiball / jackpot khi đang multiball
    for (let i = 0; i < 3; i++) {
      const x = 424 - i * 16;
      const y = 515 + i * 26;
      const on = g.multi ? blink(tick + i * 6, 15) : g.ramps > i || lit(tick, g.fx.ramp, 40);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(T.MOUTH.ny, T.MOUTH.nx));
      // mũi tên dạng chữ V chỉ vào miệng ramp
      ctx.beginPath();
      ctx.moveTo(-5, -11);
      ctx.lineTo(6, 0);
      ctx.lineTo(-5, 11);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = on ? (g.multi ? col.lit2 : col.lit) : col.insert;
      ctx.stroke();
      ctx.restore();
    }
    // Ball save (khiên giữa hai flipper)
    const saveOn = g.saveT > 0 ? (g.saveT > 2 * C.TPS || blink(tick, 10)) : g.saveArmed;
    ctx.save();
    ctx.translate(C.CX, 975);
    if (saveOn && col.glow) glowCircle(0, 0, 24, col.save, 0.35);
    ctx.scale(1.3, 1.3);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, -8);
    ctx.lineTo(8, 4);
    ctx.lineTo(0, 11);
    ctx.lineTo(-8, 4);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fillStyle = saveOn ? col.save : col.insert;
    ctx.fill();
    ctx.restore();

    // Slingshot
    T.SLINGS.forEach((s, i) => {
      const on = lit(tick, g.fx.sling[i], 10);
      ctx.beginPath();
      ctx.moveTo(s[0][0], s[0][1]);
      ctx.lineTo(s[1][0], s[1][1]);
      ctx.lineTo(s[2][0], s[2][1]);
      ctx.closePath();
      ctx.fillStyle = col.sling;
      ctx.globalAlpha = on ? 1 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = col.rubber;
      ctx.stroke();
      if (on) {
        ctx.beginPath();
        ctx.moveTo(s[0][0], s[0][1]);
        ctx.lineTo(s[2][0], s[2][1]);
        ctx.lineWidth = 7;
        ctx.strokeStyle = col.lit;
        ctx.stroke();
      }
    });

    // Thiên thạch (target)
    T.TARGETS.forEach((tg, i) => {
      const up = g.targets[i];
      const flash = lit(tick, g.fx.target[i], 12);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(tg.x - (up ? 10 : 4), tg.y0, up ? 10 : 4, tg.y1 - tg.y0, 3) : ctx.rect(tg.x - (up ? 10 : 4), tg.y0, up ? 10 : 4, tg.y1 - tg.y0);
      ctx.fillStyle = flash ? col.lit : col.target;
      ctx.globalAlpha = up ? 1 : 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
      // đèn báo bên cạnh
      insert(tg.x + 22, (tg.y0 + tg.y1) / 2, 5, !up, col.target, '');
    });

    // Hành tinh (bumper)
    const superOn = g.superT > 0;
    T.BUMPERS.forEach((b, i) => {
      const flash = lit(tick, g.fx.bumper[i], reduced ? 8 : 12);
      const color = col.planets[i];
      if (flash || superOn) glowCircle(b.x, b.y, b.r * (flash ? 2.3 : 1.7), superOn ? col.lit2 : color, flash ? 0.8 : 0.4);
      // vành cao su
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fillStyle = flash ? '#ffffff' : col.rubber;
      ctx.fill();
      const pg = ctx.createRadialGradient(b.x - 8, b.y - 9, 3, b.x, b.y, b.r - 4);
      pg.addColorStop(0, '#ffffff');
      pg.addColorStop(0.35, color);
      pg.addColorStop(1, color);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 4, 0, TAU);
      ctx.fillStyle = pg;
      ctx.fill();
      // vành đai kiểu sao Thổ
      if (i === 1) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(-0.4);
        ctx.beginPath();
        ctx.ellipse(0, 0, b.r + 6, 7, 0, 0, TAU);
        ctx.strokeStyle = superOn ? col.lit2 : col.sling;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }
    });

    // Lò xo phóng bi
    const py = C.PLUNGER_Y + C.PULL_DIST * g.plunger;
    ctx.fillStyle = col.wall;
    ctx.fillRect(C.LANE_CX - 3, py, 6, C.H - py);
    ctx.strokeStyle = col.wall2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const coils = 6;
    for (let i = 0; i <= coils * 2; i++) {
      const y = py + 8 + ((C.H - py - 8) * i) / (coils * 2);
      const x = C.LANE_CX + (i % 2 ? 11 : -11);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = col.rubber;
    ctx.fillRect(C.LANE_X0 + 3, py, C.LANE_X1 - C.LANE_X0 - 6, 7);

    // Flipper
    drawFlipper(0, g.flips[0].a);
    drawFlipper(1, g.flips[1].a);

    // Bi trên mặt bàn, rồi ramp, rồi bi trên ramp (cao hơn)
    for (const b of g.balls) if (!b.ramp) drawBall(b.x, b.y, 1);
    drawRamp();
    for (const b of g.balls) if (b.ramp) drawBall(b.x, b.y, 1.12);

    // Hạt + điểm bay
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life / 300);
      ctx.font = '800 ' + p.size + 'px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = col.top;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // Gợi ý kéo lò xo trên máy cảm ứng
    if (phase === 'playing' && app.classList.contains('touch-on') && E.ballWaiting(g) && g.plunger === 0) {
      const y = 800 + (reduced ? 0 : (tick % 60) * 0.6);
      ctx.fillStyle = col.lit2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(C.LANE_CX - 14, y);
      ctx.lineTo(C.LANE_CX + 14, y);
      ctx.lineTo(C.LANE_CX, y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.fillText(t('tc.pull'), C.LANE_CX - 2, 778);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Hạt / điểm bay (chỉ trang trí, không ảnh hưởng luật) ---------- */
  function sparks(x, y, n, color, speed) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.4 + Math.random()) * speed;
      const life = 250 + Math.random() * 300;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.6 + Math.random() * 2, life, max: life, color });
    }
  }
  function popup(x, y, pts, color, size) {
    popups.push({ x, y, text: '+' + fmt(pts), color: color || col.lit, size: size || 22, life: 900 });
    if (popups.length > 12) popups.shift();
  }
  function updateFx(dt) {
    const s = dt / 1000;
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 300) particles.splice(0, particles.length - 300);
    for (const p of popups) {
      p.life -= dt;
      if (!reduced) p.y -= 40 * s;
    }
    popups = popups.filter((p) => p.life > 0);
  }

  /* ================================================================
   * HUD, chữ giữa bàn, thông báo cho trình đọc màn hình
   * ================================================================ */
  let hudCache = {};
  function updateHud() {
    const g = game;
    const score = g ? g.score : 0;
    const best = Math.max(stats.best, score);
    const ball = g ? g.ball : 1;
    const left = g ? (g.over ? 0 : C.BALLS - g.ball + 1) : C.BALLS;
    const mult = g ? g.mult : 1;
    if (hudCache.score !== score) {
      $('score').textContent = fmt(score);
    }
    if (hudCache.best !== best) $('best').textContent = t('hud.best', { score: fmt(best) });
    if (hudCache.left !== left || hudCache.ball !== ball) {
      const el = $('balls');
      let html = '';
      for (let i = 0; i < C.BALLS; i++) html += '<i' + (i < left ? ' class="on"' : '') + '></i>';
      el.innerHTML = html;
      el.setAttribute('aria-label', t('hud.ballLabel', { n: ball, total: C.BALLS }));
    }
    if (hudCache.mult !== mult) {
      const el = $('mult');
      el.textContent = '×' + mult;
      if (hudCache.mult != null && mult > hudCache.mult && !reduced) {
        el.classList.remove('bump');
        void el.offsetWidth; // chạy lại hiệu ứng
        el.classList.add('bump');
      }
    }
    hudCache = { score, best, ball, left, mult };
  }

  let bannerTimer = null;
  function banner(title, sub) {
    const b = $('banner');
    clearTimeout(bannerTimer);
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    $('banner-sub').hidden = !sub;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    bannerTimer = setTimeout(() => { b.hidden = true; }, 1700);
  }
  function hideBanner() {
    clearTimeout(bannerTimer);
    $('banner').hidden = true;
  }

  function announce(msg) {
    const a = $('announcer');
    a.textContent = '';
    setTimeout(() => { a.textContent = msg; }, 30);
  }

  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }

  const lastSfx = {};
  function sfx(name, opts) {
    const now = performance.now();
    if (now - (lastSfx[name] || 0) < 50) return; // chặn dồn tiếng khi bi nảy liên tục
    lastSfx[name] = now;
    kit.sfx(name, opts);
  }

  /* ================================================================
   * Sự kiện của engine → âm thanh, đèn, chữ
   * ================================================================ */
  function handleEvents(g) {
    for (const ev of g.events) {
      switch (ev.type) {
        case 'flip':
          sfx('flip', { volume: 0.35 });
          break;
        case 'bumper':
          sfx('pop');
          buzz(8);
          sparks(ev.x, ev.y, 10, col.planets[ev.i], 260);
          if (g.superT > 0) popup(ev.x, ev.y - 40, ev.pts, col.lit2, 18);
          break;
        case 'sling':
          sfx('tap');
          buzz(6);
          sparks(ev.x, ev.y, 6, col.sling, 200);
          break;
        case 'target':
          sfx('place');
          popup(ev.x + 40, ev.y, ev.pts, col.target, 18);
          break;
        case 'bank':
          sfx('combo');
          buzz([20, 30, 20]);
          popup(90, 450, ev.pts, col.lit, 28);
          banner(t('banner.super'), t('banner.superSub'));
          announce(t('announce.event', { what: t('banner.super'), pts: fmt(ev.pts) }));
          break;
        case 'lane':
          sfx('tick');
          break;
        case 'mult':
          sfx('levelup');
          banner(ev.max ? t('banner.multMax') : t('banner.mult', { n: ev.mult }), ev.max ? '+' + fmt(ev.pts) : '');
          announce(t('banner.mult', { n: ev.mult }));
          break;
        case 'skill':
          sfx('coin');
          popup(C.CX, 240, ev.pts, col.lit2, 28);
          banner(t('banner.skill'));
          announce(t('announce.event', { what: t('banner.skill'), pts: fmt(ev.pts) }));
          break;
        case 'rampIn':
          sfx('move', { volume: 0.5 });
          break;
        case 'ramp':
          sfx('coin');
          popup(110, 600, ev.pts, col.lit, 24);
          banner(t('banner.ramp', { n: ev.n }));
          break;
        case 'jackpot':
          sfx('win');
          buzz([30, 40, 60]);
          popup(110, 600, ev.pts, col.lit2, 30);
          banner(t('banner.jackpot'));
          announce(t('announce.event', { what: t('banner.jackpot'), pts: fmt(ev.pts) }));
          break;
        case 'multiball':
          sfx('start');
          buzz([40, 40, 40]);
          banner(t('banner.multiball'), t('banner.multiballSub'));
          announce(t('banner.multiball'));
          break;
        case 'launch':
        case 'serve':
          sfx('move');
          break;
        case 'save':
          sfx('clear');
          banner(t('banner.save'));
          announce(t('banner.save'));
          break;
        case 'inlane':
          sfx('tick', { volume: 0.5 });
          break;
        case 'outlane':
          sfx('drop');
          break;
        case 'drainOne':
          sfx('drop');
          break;
        case 'drain':
          sfx('error');
          buzz([60, 40, 90]);
          if (!g.over) {
            banner(t('banner.ball', { n: ev.ball }), t('banner.launch'));
            announce(t('announce.ball', { n: ev.ball, score: fmt(g.score) }));
          }
          break;
        default:
          break;
      }
    }
  }

  /* ================================================================
   * Luồng ván
   * ================================================================ */
  function setPhase(p) {
    phase = p;
    app.classList.toggle('is-playing', p === 'playing');
    app.classList.toggle('is-paused', p === 'paused');
    $('overlay-start').hidden = p !== 'ready';
    $('overlay-pause').hidden = p !== 'paused';
    $('overlay-over').hidden = p !== 'over';
    const pb = $('btn-pause');
    pb.disabled = !(p === 'playing' || p === 'paused');
    const label = t(p === 'paused' ? 'btn.resumeKey' : 'btn.pauseKey');
    pb.setAttribute('aria-label', label);
    pb.title = label;
    if (p !== 'playing') releaseAll();
    if (p === 'ready') {
      $('start-best').hidden = !stats.best;
      $('start-best').textContent = t('start.best', { score: fmt(stats.best) });
    }
    if (p === 'paused' && game) $('pause-sub').textContent = t('pause.sub', { ball: game.ball, score: fmt(game.score) });
  }

  function startGame() {
    kit.modal.closeAll();
    game = E.newGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    particles = [];
    popups = [];
    hideBanner();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    setPhase('playing');
    kit.sfx('start');
    banner(t('banner.ball', { n: 1 }), t('banner.launch'));
    updateHud();
    writeSummary();
    last = performance.now();
    acc = 0;
    field.focus({ preventScroll: true });
  }

  function pause() {
    if (phase !== 'playing') return;
    setPhase('paused');
    persist();
  }

  function resume() {
    if (phase !== 'paused' || kit.modal.current()) return;
    setPhase('playing');
    last = performance.now();
    acc = 0;
    field.focus({ preventScroll: true });
  }

  /** Cộng ván vào thống kê; trả true nếu là kỷ lục mới. */
  function record(g) {
    const isBest = g.score > stats.best;
    stats.played++;
    stats.total += g.score;
    stats.ramps += g.count.ramps;
    stats.banks += g.count.banks;
    stats.jackpots += g.count.jackpots;
    if (isBest) stats.best = g.score;
    kit.store.write(keys.stats, stats);
    return isBest;
  }

  function finish() {
    const isBest = record(game);
    overAt = performance.now();
    setPhase('over');
    kit.store.remove(keys.save);
    kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    $('over-score').textContent = fmt(game.score);
    $('over-ramps').textContent = fmt(game.count.ramps);
    $('over-banks').textContent = fmt(game.count.banks);
    $('over-record').hidden = !isBest;
    hideBanner();
    if (isBest) {
      kit.sfx('win');
      kit.confetti();
    } else kit.sfx('lose');
    announce(t('announce.over', { score: fmt(game.score) }));
    updateHud();
    writeSummary();
    setTimeout(() => { if (phase === 'over') $('btn-again').focus(); }, 50);
  }

  /** Ván mới: ván đang dở có điểm / đã chơi ≥ 1 giây thì hỏi trước (điểm hiện có sẽ được ghi nhận). */
  function requestNew() {
    if (game && (phase === 'playing' || phase === 'paused') && E.hasProgress(game)) {
      pause();
      $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score) });
      kit.modal.open('modal-confirm');
    } else startGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (game && !game.over && E.hasProgress(game)) {
      record(game);
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    startGame();
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const inPlay = game && !game.over && (phase === 'playing' || phase === 'paused') && E.hasProgress(game);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.played ? t('summary.note', { score: fmt(stats.best) }) : t('summary.none'),
      stats: stats.played ? [{ value: fmt(stats.best), label: t('stats.best') }, { value: fmt(stats.ramps), label: t('stats.ramps') }] : [],
      resume: inPlay ? { title: t('app.name'), detail: t('summary.detail', { ball: game.ball, score: fmt(game.score) }), pct: (game.ball - 1) / C.BALLS } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && !game.over && (phase === 'playing' || phase === 'paused') && E.hasProgress(game)) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ================================================================
   * Vòng lặp
   * ================================================================ */
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // tab vừa quay lại / máy khựng: không chạy bù quá nhiều
    if (dt < 0) dt = 0;
    if (phase === 'playing') {
      if (kit.modal.current()) pause();
      else {
        acc += dt;
        let n = 0;
        while (acc >= STEP_MS && n < 12 && phase === 'playing') {
          E.step(game, currentInput());
          handleEvents(game);
          if (game.over) finish();
          acc -= STEP_MS;
          n++;
        }
        if (n >= 12) acc = 0;
        updateHud();
      }
    }
    if (phase !== 'paused') updateFx(dt);
    draw();
  }

  /* ================================================================
   * Nút, cài đặt, rời trang
   * ================================================================ */
  function onSetting(key) {
    if (key === 'theme') {
      readColors();
      buildStatic();
      draw();
    }
  }

  $('overlay-start').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNew);
  $('btn-pause').addEventListener('click', () => {
    if (phase === 'playing') pause();
    else resume();
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmt(stats.played);
    $('stats-best').textContent = fmt(stats.best);
    $('stats-avg').textContent = fmt(stats.played ? Math.round(stats.total / stats.played) : 0);
    $('stats-ramps').textContent = fmt(stats.ramps);
    $('stats-banks').textContent = fmt(stats.banks);
    $('stats-jackpots').textContent = fmt(stats.jackpots);
  });
  // Mở hộp thoại khi đang chơi thì tạm dừng ngay (không đợi khung hình sau)
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-open]')) pause();
  }, true);

  // Hướng dẫn lần đầu: đánh dấu đã xem khi đóng
  new MutationObserver(() => {
    if ($('modal-help').hidden && !settings().guideSeen) kit.settings.set({ guideSeen: true });
  }).observe($('modal-help'), { attributes: true, attributeFilter: ['hidden'] });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    last = performance.now();
  });

  /* ================================================================
   * Khởi động: mở lại ván dở (tạm dừng) nếu có
   * ================================================================ */
  readColors();
  setTouch(coarse.matches || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches));
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !restored.over) {
    game = restored;
    kit.sdk.start(MODE, true);
    setPhase('paused');
    kit.toast(t('toast.saved'), 2600);
  } else {
    kit.store.remove(keys.save);
    setPhase('ready');
  }
  layout();
  updateHud();
  writeSummary();
  if (!settings().guideSeen) kit.modal.open('modal-help');
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
