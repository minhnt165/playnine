/* =====================================================================
 * Hạ Cánh - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vòng lặp requestAnimationFrame, mô phỏng theo bước cố định 1/60 giây (engine.step) nên máy nhanh
 *     hay chậm đều như nhau; dt bị chặn khi tab vừa quay lại
 *   - Canvas nhân devicePixelRatio, vùng chơi tự co theo khung; khi hiện nút chạm thì chừa chỗ cho nút
 *   - Camera luôn giữ tàu ở giữa theo chiều ngang (thế giới xuyên mép nên địa hình lặp liền mạch);
 *     xa mặt đất thì thấy cả màn, xuống thấp thì phóng to quanh tàu
 *   - Phase: ready (màn chờ) → playing ⇄ paused → over
 *   - Báo ván cho cổng (metric score_high, mode classic):
 *     · bấm Bắt đầu: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     · hết ván: kit.sdk.end({ mode, won: false, score })
 *     · bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi won: false với điểm hiện có; chưa thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = E.CONST;
  const MODE = 'classic';
  const STEP_MS = 1000 / C.FPS;
  const TAU = Math.PI * 2;
  const VIEW_H = 600; // chiều cao thế giới thấy được ở tầm xa (mặt đất tới trên chỗ tàu xuất hiện)

  const kit = PNKit.init({
    gameId: 'hacanh',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { buttons: 'auto', assist: false, vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const fmt1 = (n) => Number(n).toLocaleString(kit.i18n.lang === 'vi' ? 'vi-VN' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const app = $('app');
  const stage = $('stage');
  const field = $('field');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceMQ.matches;
  reduceMQ.addEventListener('change', (e) => { reduced = e.matches; });

  /* ---------------- Thống kê ---------------- */
  const stats = Object.assign({ played: 0, best: 0, bestLevel: 0, total: 0, lands: 0, x5: 0 }, kit.store.read(keys.stats, {}) || {});
  Object.keys(stats).forEach((k) => { if (!Number.isFinite(stats[k]) || stats[k] < 0) stats[k] = 0; });

  /* ---------------- Trạng thái ---------------- */
  let game = null; // ván đang chơi
  let demo = null; // màn chờ: địa hình + tàu đậu trên bãi ×5
  let phase = 'ready'; // ready | playing | paused | over
  let overAt = 0; // lúc hết ván (chặn Space đang giữ bấm lại ngay)
  let particles = [];
  let shake = 0;

  const hasProgress = (g) => !!g && (g.score > 0 || g.tick >= C.FPS);

  /* ================================================================
   * Điều khiển: bàn phím + nút chạm
   * ================================================================ */
  const held = new Set(); // left right thrust
  const KEYMAP = {
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
    arrowup: 'thrust', w: 'thrust', ' ': 'thrust',
  };
  const pointers = new Map(); // pointerId → phím của nút đang chạm (null khi trượt ra ngoài)

  function touchHeld(key) {
    for (const k of pointers.values()) if (k === key) return true;
    return false;
  }
  const isHeld = (k) => held.has(k) || touchHeld(k);

  function currentInput() {
    return { left: isHeld('left'), right: isHeld('right'), thrust: isHeld('thrust'), assist: !!settings().assist };
  }

  function releaseAll() {
    held.clear();
    pointers.clear();
    renderTouch();
  }

  /* ---------- Chạm ---------- */
  const touchLayer = $('touch');
  let touchSeen = window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);
  function applyTouch() {
    const mode = settings().buttons;
    const on = mode === 'on' || (mode !== 'off' && touchSeen);
    if (app.classList.contains('touch-on') === on) return;
    app.classList.toggle('touch-on', on);
    layout();
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !touchSeen) {
      touchSeen = true;
      applyTouch();
    }
  }, true);

  function renderTouch() {
    touchLayer.querySelectorAll('.tc-btn').forEach((b) => b.classList.toggle('on', touchHeld(b.dataset.key)));
  }

  touchLayer.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el || phase !== 'playing') return;
    e.preventDefault();
    if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    pointers.set(e.pointerId, el.dataset.key);
    renderTouch();
  });
  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    // Trượt ngón từ nút này sang nút kia (xoay trái ↔ phải) không cần nhấc tay
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const btn = el && el.closest('.tc-btn');
    const key = btn ? btn.dataset.key : null;
    if (key !== pointers.get(e.pointerId)) {
      pointers.set(e.pointerId, key);
      renderTouch();
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    renderTouch();
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Bàn phím ---------- */
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
    const key = KEYMAP[k];
    if (key) {
      e.preventDefault();
      held.add(key);
    }
  });
  document.addEventListener('keyup', (e) => {
    const key = KEYMAP[e.key.toLowerCase()];
    if (key) held.delete(key);
  });
  window.addEventListener('blur', releaseAll);

  /* ================================================================
   * Bố cục: vùng chơi chiếm hết .stage; có nút chạm thì chừa dải dưới (dọc) hoặc hai bên (ngang)
   * ================================================================ */
  let dpr = 1;
  let cw = 0; // kích thước vùng chơi (px CSS)
  let ch = 0;
  let topPad = 0; // phần trên vùng chơi bị đồng hồ bay che (px): camera giữ tàu ở dưới phần này
  let stars = [];

  function layout() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    const touch = app.classList.contains('touch-on');
    let left = 0;
    let top = 0;
    let w = sw;
    let h = sh;
    if (touch && sh >= sw * 1.05) {
      h = sh - Math.min(150, Math.max(120, sh * 0.19)); // dọc: nút ở dải dưới
    } else if (touch) {
      const side = Math.min(176, sw * 0.24); // ngang: nút ở hai bên
      left = side;
      w = sw - 2 * side;
    }
    w = Math.max(160, Math.floor(w));
    h = Math.max(140, Math.floor(h));
    cw = w;
    ch = h;
    field.style.width = w + 'px';
    field.style.height = h + 'px';
    field.style.left = Math.round(left) + 'px';
    field.style.top = Math.round(top) + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    topPad = Math.min(h * 0.4, $('gauges').offsetHeight + 6 + 18);
    makeStars();
    draw();
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  window.addEventListener('resize', layout);

  /** Sao nền cố định theo màn hình (trang trí, không chuyển động). */
  function makeStars() {
    let seed = 4242;
    const r = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    stars = [];
    const n = Math.round((cw * ch) / 5000);
    for (let i = 0; i < n; i++) stars.push({ x: r() * cw, y: r() * ch, s: r() < 0.15 ? 1.6 : 1 });
  }

  /* ================================================================
   * Camera: tâm ngang theo tàu; z = 0 nhìn xa (cả màn), z = 1 phóng to quanh tàu
   * ================================================================ */
  const cam = { x: C.W / 2, z: 0, target: 0, s: 1, bottom: 0 };

  /** Tầm xa: thấy đủ chiều cao VIEW_H; màn hình dọc thì chỉ cần thấy ~55% bề ngang (bãi ngoài khung có mũi tên chỉ). */
  function farScale() {
    return Math.min((ch - topPad) / VIEW_H, cw / (C.W * 0.55));
  }
  function nearScale() {
    const sf = farScale();
    return sf * Math.max(1.5, Math.min(3.5, 46 / (26 * sf))); // tàu cao ~46 px khi phóng to
  }

  /** Cập nhật camera theo tàu (dt ms). */
  function updateCamera(g, dt) {
    const s = g && g.ship;
    if (s) cam.x = s.x;
    else if (g && g.wreck) cam.x = g.wreck.x;
    const sf = farScale();
    const sn = nearScale();
    if (s && g.phase === 'fly') {
      const alt = s.y - C.FOOT - E.maxHeight(g.terrain, s.x, 50);
      const zoomAt = Math.min(130, (0.4 * (ch - topPad)) / sn);
      if (alt < zoomAt) cam.target = 1;
      else if (alt > zoomAt * 1.4) cam.target = 0;
    }
    if (reduced || dt == null) cam.z = cam.target;
    else cam.z += (cam.target - cam.z) * Math.min(1, (dt / 1000) * 3);
    cam.s = sf + (sn - sf) * cam.z;
    // Tầm xa: đáy thế giới ở mép dưới, nâng lên nếu tàu bay quá cao (luôn ở dưới đồng hồ bay).
    // Tầm gần: tàu ở khoảng 45% phần nhìn thấy, tính từ dưới đồng hồ bay xuống
    const y = s ? s.y : g && g.wreck ? g.wreck.y : 0;
    const bf = Math.max(-6, y + 20 - (ch - topPad) / sf);
    const bn = Math.max(-6, y - (0.55 * (ch - topPad)) / sn);
    cam.bottom = bf + (bn - bf) * cam.z;
  }

  const sx = (x) => cw / 2 + E.wrapDelta(cam.x, x) * cam.s;
  const sy = (y) => ch - (y - cam.bottom) * cam.s;

  /* ================================================================
   * Vẽ
   * ================================================================ */
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      ground: v('--c-ground'), ground2: v('--c-ground-2'), ridge: v('--c-ridge'), ship: v('--c-ship'), shipFill: v('--c-ship-fill'),
      window: v('--c-window'), flame: v('--c-flame'), flame2: v('--c-flame-2'), star: v('--c-star'), text: v('--c-text'),
      repeat: v('--c-repeat'), pad: { 2: v('--c-pad2'), 3: v('--c-pad3'), 5: v('--c-pad5') }, glow: parseFloat(v('--glow')) || 0,
    };
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });

  /** Các bản lặp của thế giới (k · W) phủ vùng nhìn thấy. */
  function copies() {
    const half = cw / 2 / cam.s;
    const lo = Math.floor((cam.x - half) / C.W) - 1;
    const hi = Math.floor((cam.x + half) / C.W) + 1;
    const out = [];
    for (let k = lo; k <= hi; k++) out.push(k * C.W);
    return out;
  }
  /** x màn hình của điểm thế giới X đã tính bản lặp (không quấn lại). */
  const sxRaw = (X) => cw / 2 + (X - cam.x) * cam.s;

  function drawTerrain(T) {
    const base = ch + 4;
    const ks = copies();
    ctx.beginPath();
    let first = true;
    for (const k of ks) {
      for (const [u, h] of T.pts) {
        const X = sxRaw(u + T.off + k);
        const Y = sy(h);
        if (first) {
          ctx.moveTo(X, base);
          first = false;
        }
        ctx.lineTo(X, Y);
      }
    }
    const lastK = ks[ks.length - 1];
    ctx.lineTo(sxRaw(C.W + T.off + lastK), base);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, sy(C.GROUND_MAX), 0, ch);
    grad.addColorStop(0, colors.ground);
    grad.addColorStop(1, colors.ground2);
    ctx.fillStyle = grad;
    ctx.fill();
    // Đường sống núi
    ctx.beginPath();
    first = true;
    for (const k of ks) {
      for (const [u, h] of T.pts) {
        const X = sxRaw(u + T.off + k);
        if (first) {
          ctx.moveTo(X, sy(h));
          first = false;
        } else ctx.lineTo(X, sy(h));
      }
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors.ridge;
    if (colors.glow) {
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Bãi đáp: vạch màu + đèn hai đầu + nhãn hệ số
    const fs = Math.round(Math.max(11, Math.min(16, 9 + cam.s * 4)));
    ctx.font = '800 ' + fs + 'px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top'; // nhãn dưới vạch bãi: tàu đậu trên bãi không che mất
    for (const k of ks) {
      for (const p of T.pads) {
        const x0 = sxRaw(p.x0 + k);
        const x1 = sxRaw(p.x0 + p.w + k);
        if (x1 < -40 || x0 > cw + 40) continue;
        const y = sy(p.y);
        const col = colors.pad[p.mult];
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        if (colors.glow) {
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 9;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0 + 1, y);
        ctx.lineTo(x1 - 1, y);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = col;
        for (const x of [x0, x1]) {
          ctx.fillRect(x - 1, y - 6, 2, 6);
          ctx.beginPath();
          ctx.arc(x, y - 7, 2, 0, TAU);
          ctx.fill();
        }
        ctx.fillText('×' + p.mult, (x0 + x1) / 2, y + 5);
      }
    }
    // Bãi nằm ngoài khung nhìn: mũi tên ở mép, cao ngang bãi
    ctx.textBaseline = 'middle';
    for (const p of T.pads) {
      const x = sx(p.cx);
      const hw = (p.w / 2) * cam.s;
      if (x + hw >= 0 && x - hw <= cw) continue; // còn thấy một phần bãi thì thôi
      const right = x > cw;
      const ex = right ? cw - 8 : 8;
      const ey = Math.max(96, Math.min(ch - 16, sy(p.y) - 8));
      ctx.fillStyle = colors.pad[p.mult];
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + (right ? -8 : 8), ey - 6);
      ctx.lineTo(ex + (right ? -8 : 8), ey + 6);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillText('×' + p.mult, ex + (right ? -11 : 11), ey);
    }
  }

  /** Tàu đổ bộ (đơn vị thế giới, quay theo góc); flame: chiều dài lửa (0 = tắt). */
  function drawShip(x, y, a, flame) {
    const s = cam.s;
    ctx.save();
    ctx.translate(sx(x), sy(y));
    ctx.rotate(a);
    ctx.scale(s, s);
    const lw = 1.5 / s;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Lửa (dưới vòi phun)
    if (flame > 0) {
      ctx.beginPath();
      ctx.moveTo(-3.6, 9);
      ctx.lineTo(0, 9 + flame);
      ctx.lineTo(3.6, 9);
      ctx.closePath();
      ctx.fillStyle = colors.flame;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.8, 9);
      ctx.lineTo(0, 9 + flame * 0.6);
      ctx.lineTo(1.8, 9);
      ctx.closePath();
      ctx.fillStyle = colors.flame2;
      ctx.fill();
    }
    ctx.strokeStyle = colors.ship;
    ctx.fillStyle = colors.shipFill;
    // Chân + đế chân
    ctx.beginPath();
    ctx.moveTo(-6, 3);
    ctx.lineTo(-11, 11);
    ctx.moveTo(6, 3);
    ctx.lineTo(11, 11);
    ctx.moveTo(-13.5, 11);
    ctx.lineTo(-8.5, 11);
    ctx.moveTo(8.5, 11);
    ctx.lineTo(13.5, 11);
    ctx.stroke();
    // Vòi phun
    ctx.beginPath();
    ctx.moveTo(-2.6, 6);
    ctx.lineTo(2.6, 6);
    ctx.lineTo(4, 9);
    ctx.lineTo(-4, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Tầng dưới
    ctx.beginPath();
    ctx.rect(-8, -1, 16, 7);
    ctx.fill();
    ctx.stroke();
    // Khoang lái
    ctx.beginPath();
    ctx.moveTo(-6, -1);
    ctx.lineTo(-5.5, -7.5);
    ctx.lineTo(-2.2, -10.5);
    ctx.lineTo(2.2, -10.5);
    ctx.lineTo(5.5, -7.5);
    ctx.lineTo(6, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -5.2, 2.3, 0, TAU);
    ctx.fillStyle = colors.window;
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const w = canvas.width;
    if (!w) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, canvas.height);
    let ox = 0;
    let oy = 0;
    if (shake > 0 && !reduced) {
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
    }
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    ctx.fillStyle = colors.star;
    for (const s of stars) ctx.fillRect(s.x, s.y, s.s, s.s);

    const g = phase === 'ready' ? demo : game;
    if (!g) return;
    drawTerrain(g.terrain);

    // Nhìn rộng hơn một vòng thế giới: phủ mờ phần lặp lại hai bên
    const half = (C.W / 2) * cam.s;
    if (cw / 2 > half + 1) {
      ctx.fillStyle = colors.repeat;
      ctx.fillRect(0, 0, cw / 2 - half, ch);
      ctx.fillRect(cw / 2 + half, 0, cw / 2 - half, ch);
    }

    const s = g.ship;
    if (s) {
      let flame = 0;
      if (s.thrusting) flame = reduced ? 12 : 9 + ((g.tick * 7) % 5) * 1.6;
      drawShip(s.x, s.y, s.a, flame);
    }

    // Hạt: khói động cơ, tia lửa nổ, mảnh vỡ, bụi
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      const x = sx(p.x);
      const y = sy(p.y);
      if (p.kind === 'line') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.a);
        ctx.beginPath();
        ctx.moveTo((-p.len / 2) * cam.s, 0);
        ctx.lineTo((p.len / 2) * cam.s, 0);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'ring') {
        const k = reduced ? 1 : 1 - a;
        ctx.beginPath();
        ctx.arc(x, y, (p.r0 + (p.r1 - p.r0) * k) * cam.s, 0, TAU);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        const r = Math.max(1, p.r * cam.s);
        ctx.fillStyle = p.color;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Hạt (chỉ trang trí, không ảnh hưởng luật) ---------- */
  function sparks(x, y, n, color, speed, life) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.3 + Math.random()) * speed;
      const l = (life || 600) * (0.6 + Math.random() * 0.6);
      particles.push({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + speed * 0.3, grav: 30, r: 1.6, life: l, max: l, color });
    }
  }
  function debris(x, y, color) {
    if (reduced) return;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI;
      const v = 25 + Math.random() * 45;
      const life = 1200 + Math.random() * 800;
      particles.push({ kind: 'line', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 40, a: Math.random() * TAU, spin: (Math.random() - 0.5) * 8, len: 4 + Math.random() * 6, life, max: life, color });
    }
  }
  function ring(x, y, r0, r1, color, life) {
    particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, max: life, color });
  }
  function dust(x, y) {
    if (reduced) return;
    for (let i = 0; i < 14; i++) {
      const dir = i % 2 ? 1 : -1;
      const life = 500 + Math.random() * 500;
      particles.push({ kind: 'dot', x: x + dir * 6, y: y + 1, vx: dir * (15 + Math.random() * 30), vy: Math.random() * 10, grav: 0, r: 1.4, life, max: life, color: colors.ridge });
    }
  }
  /** Khói / lửa phụt ra từ vòi khi đang đẩy. */
  function exhaust(s) {
    if (reduced) return;
    const n = Math.sin(s.a);
    const c = Math.cos(s.a);
    const spread = (Math.random() - 0.5) * 0.5;
    const v = 55 + Math.random() * 30;
    const life = 240 + Math.random() * 160;
    particles.push({
      kind: 'dot', x: s.x - 9 * n, y: s.y - 9 * c,
      vx: s.vx - (n + spread * c) * v, vy: s.vy - (c - spread * n) * v, grav: 0, r: 1.4,
      life, max: life, color: Math.random() < 0.5 ? colors.flame : colors.flame2,
    });
  }
  function updateParticles(dt) {
    const s = dt / 1000;
    for (const p of particles) {
      p.life -= dt;
      p.vy -= (p.grav || 0) * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      if (p.spin) p.a += p.spin * s;
    }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 500) particles.splice(0, particles.length - 500);
    if (shake > 0) shake = Math.max(0, shake - dt / 50);
  }

  /* ================================================================
   * HUD, đồng hồ bay, chữ giữa vùng chơi, thông báo cho trình đọc màn hình
   * ================================================================ */
  const SHIP_SVG = '<svg viewBox="0 0 14 16" aria-hidden="true"><path d="M4 7.5 3.5 4 5.5 1.5h3L10.5 4 10 7.5zM2.5 7.5h9v3h-9zM4 10.5 1.5 14.5M10 10.5l2.5 4M0.5 14.5h3M10.5 14.5h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const cache = {};
  /** Ghi textContent / class chỉ khi đổi (cập nhật mỗi khung hình). */
  function setText(id, v) {
    if (cache[id] === v) return;
    cache[id] = v;
    $(id).textContent = v;
  }
  function setState(id, ok) {
    const v = ok == null ? '' : ok ? 'ok' : 'bad';
    if (cache['s:' + id] === v) return;
    cache['s:' + id] = v;
    const el = $(id);
    el.classList.toggle('ok', v === 'ok');
    el.classList.toggle('bad', v === 'bad');
  }

  function updateHud() {
    const g = game;
    const score = g ? g.score : 0;
    setText('score', fmt(score));
    setText('best', fmt(Math.max(stats.best, score)));
    const lv = String(g ? g.level : 1);
    if (cache.level !== lv) {
      const bump = cache.level != null && g && !reduced;
      setText('level', lv);
      if (bump) {
        const el = $('level');
        el.classList.remove('bump');
        void el.offsetWidth; // chạy lại hiệu ứng
        el.classList.add('bump');
      }
    }
    const ships = g ? g.ships : C.SHIPS;
    if (cache.ships !== ships) {
      cache.ships = ships;
      const el = $('ships');
      el.innerHTML = ships > 0 ? SHIP_SVG.repeat(ships) : '0';
      el.setAttribute('aria-label', t('hud.shipsLabel', { n: ships }));
    }
    updateGauges(g);
  }

  function updateGauges(g) {
    const s = g && g.ship;
    if (s) {
      const ok = E.safety(s);
      const vx = Math.round(Math.abs(s.vx));
      const vy = Math.round(Math.abs(s.vy));
      setText('g-alt', fmt(Math.round(E.altitude(g))));
      setText('g-vx', (vx === 0 ? '' : s.vx > 0 ? '→ ' : '← ') + vx);
      setText('g-vy', (vy === 0 ? '' : s.vy < 0 ? '↓ ' : '↑ ') + vy);
      setText('g-ang', Math.round((Math.abs(s.a) * 180) / Math.PI) + '°');
      setState('gb-vx', ok.vx);
      setState('gb-vy', ok.vy);
      setState('gb-ang', ok.angle);
    } else {
      ['g-alt', 'g-vx', 'g-vy', 'g-ang'].forEach((id) => setText(id, '–'));
      ['gb-vx', 'gb-vy', 'gb-ang'].forEach((id) => setState(id, null));
    }
    const fuel = g ? g.fuel : C.FUEL_MAX;
    const pct = Math.ceil((fuel / C.FUEL_MAX) * 100);
    if (cache.fuel !== fuel) {
      cache.fuel = fuel;
      $('g-fuel').style.transform = 'scaleX(' + fuel / C.FUEL_MAX + ')';
      $('g-fuel').classList.toggle('low', fuel <= C.FUEL_LOW);
    }
    setText('g-fuel-pct', pct + '%');
    const wind = g ? E.windAt(g) : 0;
    const wtxt = g && g.wind ? t('g.wind') + ' ' + (wind > 0 ? t('wind.right') : t('wind.left')) + ' ' + fmt1(Math.abs(wind)) : '';
    if (cache.wind !== wtxt) {
      cache.wind = wtxt;
      $('g-wind').hidden = !wtxt;
      $('g-wind').textContent = wtxt;
    }
  }

  let bannerTimer = null;
  function banner(title, sub, tone) {
    const b = $('banner');
    clearTimeout(bannerTimer);
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    $('banner-sub').hidden = !sub;
    b.hidden = false;
    b.classList.remove('show', 'good', 'bad');
    void b.offsetWidth;
    b.classList.add('show');
    if (tone) b.classList.add(tone);
    bannerTimer = setTimeout(() => { b.hidden = true; }, 2000);
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

  function levelBanner(g) {
    const gm = fmt1(g.gravity / C.G0);
    const sub = g.wind ? t('banner.levelWind', { g: gm, dir: g.wind > 0 ? t('wind.right') : t('wind.left') }) : t('banner.levelSub', { g: gm });
    banner(t('banner.level', { n: g.level }), sub);
  }

  /* ================================================================
   * Sự kiện của engine → âm thanh, hạt, chữ
   * ================================================================ */
  function handleEvents(g) {
    for (const ev of g.events) {
      switch (ev.type) {
        case 'level':
          if (ev.n > 1) kit.sfx('start');
          levelBanner(g);
          announce(t('announce.level', { n: ev.n }));
          cam.target = 0;
          break;
        case 'land':
          kit.sfx(ev.mult === 5 ? 'levelup' : 'coin');
          buzz(30);
          dust(ev.x, ev.y);
          banner(t('banner.land', { points: fmt(ev.total) }), t('banner.landSub', { mult: ev.mult, base: ev.base, soft: ev.soft, fuel: ev.fuel }), 'good');
          announce(t('announce.land', { mult: ev.mult, points: ev.total }));
          break;
        case 'crash': {
          kit.sfx('error');
          buzz([80, 40, 120]);
          debris(ev.x, ev.y, colors.ship);
          sparks(ev.x, ev.y, 30, colors.flame, 60, 900);
          ring(ev.x, ev.y, 4, 34, colors.flame, reduced ? 300 : 600);
          if (!reduced) shake = 10;
          const why = t('banner.' + ev.reason);
          banner(t('banner.crash'), why, 'bad');
          announce(t('announce.crash', { why }));
          break;
        }
        case 'low':
          kit.sfx('tick');
          banner(t('banner.low'), '', 'bad');
          break;
        case 'empty':
          kit.sfx('drop');
          banner(t('banner.empty'), '', 'bad');
          break;
        case 'spawn':
          if (g.tick > 1) kit.sfx('place');
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
    if (p === 'paused' && game) $('pause-sub').textContent = t('pause.sub', { level: game.level, score: fmt(game.score) });
  }

  /** Màn chờ: địa hình cố định, tàu đậu trên bãi ×5. */
  function makeDemo() {
    const d = E.newGame('hacanh-demo');
    const pad = d.terrain.pads.find((p) => p.mult === 5);
    d.ship = { x: pad.cx, y: pad.y + C.FOOT, vx: 0, vy: 0, a: 0, thrusting: false };
    return d;
  }

  function startGame() {
    kit.modal.closeAll();
    game = E.newGame();
    particles = [];
    shake = 0;
    hideBanner();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    setPhase('playing');
    cam.z = 0;
    cam.target = 0;
    handleEvents(game); // "Màn 1"
    kit.sfx('start');
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
    stats.lands += g.lands[0] + g.lands[1] + g.lands[2];
    stats.x5 += g.lands[2];
    if (isBest) stats.best = g.score;
    stats.bestLevel = Math.max(stats.bestLevel, g.level);
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
    $('over-level').textContent = String(game.level);
    $('over-lands').textContent = fmt(game.lands[0] + game.lands[1] + game.lands[2]);
    $('over-why').textContent = t(game.ships <= 0 ? 'over.noShips' : 'over.noFuel');
    $('over-record').hidden = !isBest || !game.score;
    hideBanner();
    if (isBest && game.score) {
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
    if (game && (phase === 'playing' || phase === 'paused') && hasProgress(game)) {
      pause();
      $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score) });
      kit.modal.open('modal-confirm');
    } else startGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (game && game.phase !== 'over' && (phase === 'playing' || phase === 'paused') && hasProgress(game)) {
      record(game);
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    startGame();
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && game.phase !== 'over' && (phase === 'playing' || phase === 'paused') && hasProgress(game);
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.played ? t('summary.note', { score: fmt(stats.best), level: stats.bestLevel }) : t('summary.none'),
      stats: stats.played ? [{ value: fmt(stats.best), label: t('hud.best') }, { value: String(stats.bestLevel), label: t('stats.level') }] : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.detail', { level: game.level, score: fmt(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
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
      if (kit.modal.current()) {
        pause();
      } else {
        acc += dt;
        let n = 0;
        while (acc >= STEP_MS && n < 10 && phase === 'playing') {
          E.step(game, currentInput());
          handleEvents(game);
          if (game.ship && game.ship.thrusting && game.tick % 2 === 0) exhaust(game.ship);
          if (game.phase === 'over') finish();
          acc -= STEP_MS;
          n++;
        }
        if (n >= 10) acc = 0;
        updateHud();
      }
    }
    if (phase !== 'paused') updateParticles(dt);
    updateCamera(phase === 'ready' ? demo : game, phase === 'paused' ? 0 : dt);
    draw();
  }

  /* ================================================================
   * Nút, cài đặt, rời trang
   * ================================================================ */
  function onSetting(key) {
    if (key === 'theme') {
      readColors();
      draw();
    } else if (key === 'buttons') {
      applyTouch();
      releaseAll();
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
    $('stats-level').textContent = fmt(stats.bestLevel);
    $('stats-avg').textContent = fmt(stats.played ? Math.round(stats.total / stats.played) : 0);
    $('stats-lands').textContent = fmt(stats.lands);
    $('stats-x5').textContent = fmt(stats.x5);
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
  applyTouch();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  demo = makeDemo();
  if (restored && restored.phase !== 'over') {
    game = restored;
    kit.sdk.start(MODE, true);
    setPhase('paused');
    kit.toast(t('toast.saved'), 2600);
  } else {
    kit.store.remove(keys.save);
    setPhase('ready');
  }
  layout();
  updateCamera(phase === 'ready' ? demo : game, null);
  updateHud();
  writeSummary();
  if (!settings().guideSeen) kit.modal.open('modal-help');
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
