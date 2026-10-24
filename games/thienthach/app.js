/* =====================================================================
 * Thiên Thạch - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vòng lặp requestAnimationFrame, mô phỏng theo bước cố định 1/60 giây (engine.step) nên máy nhanh
 *     hay chậm đều như nhau; dt bị chặn khi tab vừa quay lại
 *   - Canvas nhân devicePixelRatio, sân vuông tự co theo khung; trên máy cảm ứng chừa chỗ cho nút
 *   - Phase: ready (màn chờ, đá trôi phía sau) → playing ⇄ paused → over
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

  const kit = PNKit.init({
    gameId: 'thienthach',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { controls: 'buttons', autofire: false, vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmt = (n) => kit.i18n.fmtNumber(n);

  const app = $('app');
  const stage = $('stage');
  const field = $('field');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceMQ.matches;
  reduceMQ.addEventListener('change', (e) => { reduced = e.matches; });

  /* ---------------- Thống kê ---------------- */
  const stats = Object.assign({ played: 0, best: 0, bestWave: 0, total: 0, rocks: 0, saucers: 0 }, kit.store.read(keys.stats, {}) || {});
  Object.keys(stats).forEach((k) => { if (!Number.isFinite(stats[k]) || stats[k] < 0) stats[k] = 0; });

  /* ---------------- Trạng thái ---------------- */
  let game = null; // ván đang chơi
  let demo = null; // màn chờ: đá trôi phía sau lớp phủ (không có tàu)
  let phase = 'ready'; // ready | playing | paused | over
  let overAt = 0; // lúc hết ván (chặn Space đang giữ bấm lại ngay)
  let particles = [];
  let shake = 0;
  let waiting = false; // đang chờ tâm sân trống để hồi sinh

  const hasProgress = (g) => !!g && (g.score > 0 || g.tick >= C.FPS);

  /* ================================================================
   * Điều khiển: bàn phím + chạm (nút hoặc cần lái)
   * ================================================================ */
  const held = new Set(); // phím đang giữ: left right thrust fire hyper
  const KEYMAP = {
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
    arrowup: 'thrust', w: 'thrust',
    ' ': 'fire', j: 'fire', k: 'fire',
    arrowdown: 'hyper', s: 'hyper', h: 'hyper',
  };
  const pointers = new Map(); // pointerId → phím của nút đang chạm (null khi trượt ra ngoài)
  const stick = { id: null, cx: 0, cy: 0, aim: null, thrust: false };
  const STICK_R = 52; // px: bán kính cần lái; đẩy quá 60% thì tăng tốc

  function touchHeld(key) {
    for (const k of pointers.values()) if (k === key) return true;
    return false;
  }

  function currentInput() {
    const left = held.has('left') || touchHeld('left');
    const right = held.has('right') || touchHeld('right');
    const inp = {
      left,
      right,
      thrust: held.has('thrust') || touchHeld('thrust') || stick.thrust,
      fire: held.has('fire') || touchHeld('fire') || !!settings().autofire,
      hyper: held.has('hyper') || touchHeld('hyper'),
    };
    if (stick.aim != null && !left && !right) inp.aim = stick.aim;
    return inp;
  }

  function releaseAll() {
    held.clear();
    pointers.clear();
    endStick();
    renderTouch();
  }

  /* ---------- Chạm ---------- */
  const touchLayer = $('touch');
  const coarse = window.matchMedia('(pointer: coarse)');
  function setTouch(on) {
    if (app.classList.contains('touch-on') === on) return;
    app.classList.toggle('touch-on', on);
    layout();
  }
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); }, true);
  app.dataset.controls = settings().controls === 'stick' ? 'stick' : 'buttons';

  function renderTouch() {
    touchLayer.querySelectorAll('.tc-btn').forEach((b) => b.classList.toggle('on', touchHeld(b.dataset.key)));
    $('tc-fire-zone').classList.toggle('on', touchHeld('fire'));
    $('tc-stick-zone').classList.toggle('on', stick.id != null);
  }

  function startStick(e) {
    const zone = $('tc-stick-zone').getBoundingClientRect();
    stick.id = e.pointerId;
    stick.cx = e.clientX;
    stick.cy = e.clientY;
    stick.aim = null;
    stick.thrust = false;
    const s = $('tc-stick');
    s.style.left = e.clientX - zone.left + 'px';
    s.style.top = e.clientY - zone.top + 'px';
    $('tc-knob').style.transform = '';
    s.hidden = false;
  }
  function moveStick(e) {
    let dx = e.clientX - stick.cx;
    let dy = e.clientY - stick.cy;
    const d = Math.hypot(dx, dy);
    stick.aim = d > 10 ? Math.atan2(dy, dx) : null;
    stick.thrust = d > STICK_R * 0.6;
    if (d > STICK_R) {
      dx *= STICK_R / d;
      dy *= STICK_R / d;
    }
    $('tc-knob').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function endStick() {
    stick.id = null;
    stick.aim = null;
    stick.thrust = false;
    $('tc-stick').hidden = true;
  }

  touchLayer.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el || phase !== 'playing') return;
    e.preventDefault();
    if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (el.dataset.key === 'stick') startStick(e);
    else {
      pointers.set(e.pointerId, el.dataset.key);
      if (el.dataset.key === 'fire' || el.dataset.key === 'hyper') buzz(8);
    }
    renderTouch();
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
      moveStick(e);
      return;
    }
    if (!pointers.has(e.pointerId) || app.dataset.controls !== 'buttons') return;
    // Chế độ nút: trượt ngón từ nút này sang nút kia (xoay trái ↔ phải) không cần nhấc tay
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const btn = el && el.closest('.tc-btn');
    const key = btn ? btn.dataset.key : null;
    if (key !== pointers.get(e.pointerId)) {
      pointers.set(e.pointerId, key);
      renderTouch();
    }
  });
  function pointerEnd(e) {
    if (e.pointerId === stick.id) endStick();
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
   * Bố cục: sân vuông lớn nhất vừa .stage; máy cảm ứng chừa chỗ cho nút
   * ================================================================ */
  let dpr = 1;
  let scale = 1; // pixel canvas trên một đơn vị sân
  let cssSize = 0;
  let stars = [];

  function layout() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    const touch = app.classList.contains('touch-on');
    let s;
    let left;
    let top;
    if (touch && sh >= sw * 1.05) {
      // Dọc: sân ở trên, nút ở dải dưới
      const reserve = Math.min(230, Math.max(150, sh * 0.28));
      s = Math.min(sw, sh - reserve);
      left = (sw - s) / 2;
      top = 0;
    } else if (touch) {
      // Ngang: nút ở hai bên sân
      s = Math.min(sh, sw - 2 * 176);
      left = (sw - s) / 2;
      top = (sh - s) / 2;
    } else {
      s = Math.min(sw, sh);
      left = (sw - s) / 2;
      top = (sh - s) / 2;
    }
    s = Math.max(140, Math.floor(s));
    cssSize = s;
    field.style.width = s + 'px';
    field.style.height = s + 'px';
    field.style.left = Math.round(left) + 'px';
    field.style.top = Math.round(top) + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(s * dpr);
    canvas.height = Math.round(s * dpr);
    scale = canvas.width / C.W;
    makeStars();
    draw();
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  window.addEventListener('resize', layout);

  /** Sao nền cố định (trang trí, không chuyển động). */
  function makeStars() {
    let seed = 12345;
    const r = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    stars = [];
    for (let i = 0; i < 70; i++) stars.push({ x: r() * C.W, y: r() * C.H, s: r() < 0.15 ? 1.6 : 1 });
  }

  /* ================================================================
   * Vẽ
   * ================================================================ */
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      ship: v('--c-ship'), flame: v('--c-flame'), rock: v('--c-rock'), bullet: v('--c-bullet'), saucer: v('--c-saucer'),
      sbullet: v('--c-sbullet'), spark: v('--c-spark'), star: v('--c-star'), glow: parseFloat(v('--glow')) || 0,
    };
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });

  /** Gọi fn tại (x, y) và tại các bản sao qua mép nếu vật thò ra mép (sân xuyên mép). */
  function wrapped(x, y, r, fn) {
    const xs = [x];
    const ys = [y];
    if (x < r) xs.push(x + C.W);
    if (x > C.W - r) xs.push(x - C.W);
    if (y < r) ys.push(y + C.H);
    if (y > C.H - r) ys.push(y - C.H);
    for (const px of xs) for (const py of ys) fn(px, py);
  }

  /** Nét phát sáng: ở giao diện tối vẽ thêm một nét dày mờ phía dưới (rẻ hơn shadowBlur). */
  function glowStroke(color, width) {
    ctx.strokeStyle = color;
    if (colors.glow) {
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = width * 3.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawRock(r, lw) {
    const R = E.rockRadius(r.s);
    wrapped(r.x, r.y, R * 1.1, (x, y) => {
      ctx.beginPath();
      for (let i = 0; i < r.shape.length; i++) {
        const a = r.a + (i / r.shape.length) * TAU;
        const rr = (R * r.shape[i]) / 100;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = colors.rock;
      ctx.globalAlpha = colors.glow ? 0.06 : 0.09;
      ctx.fill();
      ctx.globalAlpha = 1;
      glowStroke(colors.rock, lw);
    });
  }

  function drawShip(s, lw, tick) {
    if (s.hyper) return;
    let alpha = 1;
    if (s.inv > 0 && !reduced) alpha = Math.floor(s.inv / 6) % 2 ? 0.35 : 1; // nhấp nháy khi bất tử
    else if (s.inv > 0) alpha = 0.6;
    wrapped(s.x, s.y, 20, (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.a);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-11, -10);
      ctx.lineTo(-6.5, 0);
      ctx.lineTo(-11, 10);
      ctx.closePath();
      ctx.lineJoin = 'round';
      glowStroke(colors.ship, lw);
      if (s.thrusting) {
        const len = reduced ? 16 : 13 + ((tick * 7) % 5) * 2;
        ctx.beginPath();
        ctx.moveTo(-8, -5);
        ctx.lineTo(-len - 2, 0);
        ctx.lineTo(-8, 5);
        glowStroke(colors.flame, lw);
      }
      ctx.restore();
      if (s.inv > 0) {
        // Vòng khiên: cho biết đang bất tử (cả khi giảm chuyển động)
        ctx.save();
        ctx.globalAlpha = 0.35 * Math.min(1, s.inv / 30);
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, TAU);
        ctx.strokeStyle = colors.ship;
        ctx.lineWidth = lw * 0.8;
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function drawSaucer(u, lw) {
    const r = E.saucerRadius(u.small);
    wrapped(((u.x % C.W) + C.W) % C.W, u.y, r + 2, (x, y) => {
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.45, y - r * 0.38);
      ctx.lineTo(x + r * 0.45, y - r * 0.38);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.45, y + r * 0.38);
      ctx.lineTo(x - r * 0.45, y + r * 0.38);
      ctx.closePath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x - r * 0.3, y - r * 0.38);
      ctx.lineTo(x - r * 0.18, y - r * 0.75);
      ctx.lineTo(x + r * 0.18, y - r * 0.75);
      ctx.lineTo(x + r * 0.3, y - r * 0.38);
      glowStroke(colors.saucer, lw);
    });
  }

  function drawDot(x, y, r, color) {
    ctx.fillStyle = color;
    if (colors.glow) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function draw() {
    const w = canvas.width;
    if (!w) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, canvas.height);
    const g = phase === 'ready' ? demo : game;
    let sx = 0;
    let sy = 0;
    if (shake > 0 && !reduced) {
      sx = (Math.random() - 0.5) * shake * 0.8;
      sy = (Math.random() - 0.5) * shake * 0.8;
    }
    ctx.setTransform(scale, 0, 0, scale, sx * dpr, sy * dpr);
    // Một nét ~1,6 px màn hình bất kể sân to nhỏ (đơn vị sân)
    const px = dpr / scale;
    const lw = Math.max(1.3, Math.min(2.2, cssSize / 300)) * px;

    ctx.fillStyle = colors.star;
    for (const s of stars) ctx.fillRect(s.x, s.y, s.s * px, s.s * px);
    if (!g) return;

    for (const r of g.rocks) drawRock(r, lw);
    if (g.saucer) drawSaucer(g.saucer, lw);
    const br = Math.max(2, 2.2 * px);
    for (const b of g.bullets) drawDot(b.x, b.y, br, colors.bullet);
    for (const b of g.sbullets) drawDot(b.x, b.y, br, colors.sbullet);
    if (g.ship) drawShip(g.ship, lw, g.tick);

    // Hạt: tia lửa, mảnh vỡ, vòng nổ
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.kind === 'ring') {
        const k = reduced ? 1 : 1 - a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * k, 0, TAU);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = lw;
        ctx.stroke();
      } else if (p.kind === 'line') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.beginPath();
        ctx.moveTo(-p.len / 2, 0);
        ctx.lineTo(p.len / 2, 0);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - px, p.y - px, 2.2 * px, 2.2 * px);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Hạt (chỉ trang trí, không ảnh hưởng luật) ---------- */
  function sparks(x, y, n, color, speed) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.4 + Math.random()) * speed;
      const life = 300 + Math.random() * 450;
      particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color });
    }
  }
  function ring(x, y, r0, r1, color, life) {
    particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, max: life, color });
  }
  function debris(x, y, color) {
    if (reduced) return;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU;
      const v = 20 + Math.random() * 50;
      const life = 900 + Math.random() * 700;
      particles.push({ kind: 'line', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: Math.random() * TAU, spin: (Math.random() - 0.5) * 6, len: 8 + Math.random() * 10, life, max: life, color });
    }
  }
  function updateParticles(dt) {
    const s = dt / 1000;
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * s;
      p.y += p.vy * s;
      if (p.spin) p.a += p.spin * s;
    }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
    if (shake > 0) shake = Math.max(0, shake - dt / 40);
  }

  /* ================================================================
   * HUD, chữ giữa sân, thông báo cho trình đọc màn hình
   * ================================================================ */
  const SHIP_SVG = '<svg viewBox="0 0 13 16" aria-hidden="true"><path d="M6.5 1 12 15 6.5 11.5 1 15z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  let hudCache = {};
  function updateHud() {
    const g = game;
    const score = g ? g.score : 0;
    const best = Math.max(stats.best, score);
    const wave = g ? g.wave : 1;
    const lives = g ? g.lives : C.START_LIVES;
    if (hudCache.score !== score) $('score').textContent = fmt(score);
    if (hudCache.best !== best) $('best').textContent = fmt(best);
    if (hudCache.wave !== wave) $('wave').textContent = String(wave);
    if (hudCache.lives !== lives) {
      const el = $('lives');
      const shown = Math.min(lives, 4);
      el.innerHTML = SHIP_SVG.repeat(shown) + (lives > shown ? '<span class="lives-more">+' + (lives - shown) + '</span>' : '');
      el.setAttribute('aria-label', t('hud.livesLabel', { n: lives }));
      if (hudCache.lives != null && lives > hudCache.lives && !reduced) {
        el.classList.remove('bump');
        void el.offsetWidth; // chạy lại hiệu ứng
        el.classList.add('bump');
      }
    }
    hudCache = { score, best, wave, lives };
  }

  let bannerTimer = null;
  function banner(title, sub, stay) {
    const b = $('banner');
    clearTimeout(bannerTimer);
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    $('banner-sub').hidden = !sub;
    b.hidden = false;
    b.classList.remove('show', 'stay');
    void b.offsetWidth;
    b.classList.add(stay ? 'stay' : 'show');
    if (!stay) bannerTimer = setTimeout(() => { b.hidden = true; }, 1600);
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

  /* ================================================================
   * Sự kiện của engine → âm thanh, hạt, chữ
   * ================================================================ */
  function handleEvents(g) {
    for (const ev of g.events) {
      switch (ev.type) {
        case 'shot':
          kit.sfx('tick', { volume: 0.4 });
          break;
        case 'rock':
          kit.sfx(ev.s === 3 ? 'capture' : 'pop');
          sparks(ev.x, ev.y, ev.s * 5, colors.rock, 60 + ev.s * 10);
          ring(ev.x, ev.y, E.rockRadius(ev.s) * 0.4, E.rockRadius(ev.s) * 1.3, colors.rock, reduced ? 250 : 380);
          break;
        case 'saucer':
          kit.sfx('coin');
          sparks(ev.x, ev.y, 18, colors.saucer, 90);
          ring(ev.x, ev.y, 6, 40, colors.saucer, 450);
          break;
        case 'saucerIn':
          kit.sfx('drop');
          if (ev.small) banner(t('banner.small'));
          break;
        case 'die':
          kit.sfx('error');
          buzz([80, 40, 120]);
          debris(ev.x, ev.y, colors.ship);
          sparks(ev.x, ev.y, 26, colors.flame, 110);
          ring(ev.x, ev.y, 8, 60, colors.ship, 600);
          if (!reduced) shake = 12;
          break;
        case 'respawn':
          kit.sfx('place');
          if (waiting) hideBanner();
          waiting = false;
          break;
        case 'life':
          kit.sfx('levelup');
          buzz(30);
          banner(t('banner.life'));
          announce(t('announce.life'));
          break;
        case 'clear':
          kit.sfx('clear');
          banner(t('banner.clear'));
          break;
        case 'wave':
          kit.sfx('start');
          banner(t('banner.wave', { n: ev.n }), t('banner.waveSub', { n: E.waveCount(ev.n) }));
          announce(t('announce.wave', { n: ev.n }));
          break;
        case 'hyperIn':
          kit.sfx('flip');
          ring(ev.x, ev.y, 26, 4, colors.ship, 350);
          break;
        case 'hyperOut':
          ring(ev.x, ev.y, 4, 26, colors.ship, 350);
          break;
        default:
          break;
      }
    }
    // Đã hết thời gian chờ mà tâm sân chưa trống: báo cho người chơi biết vì sao chưa hồi sinh
    const wait = !g.ship && !g.over && g.lives > 0 && g.deadT === 0;
    if (wait && !waiting) banner(t('banner.wait'), '', true);
    waiting = wait;
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
    if (p === 'paused' && game) $('pause-sub').textContent = t('pause.sub', { wave: game.wave, score: fmt(game.score) });
  }

  function makeDemo() {
    const d = E.newGame('demo-' + (Date.now() % 997));
    d.ship = null;
    d.lives = 99;
    d.deadT = 1e9; // không bao giờ hồi sinh: chỉ có đá trôi và đĩa bay
    return d;
  }

  function startGame() {
    kit.modal.closeAll();
    game = E.newGame();
    particles = [];
    shake = 0;
    waiting = false;
    hideBanner();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    setPhase('playing');
    handleEvents(game); // "Đợt 1"
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
    stats.rocks += g.kills.rocks;
    stats.saucers += g.kills.saucers;
    if (isBest) stats.best = g.score;
    stats.bestWave = Math.max(stats.bestWave, g.wave);
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
    $('over-wave').textContent = String(game.wave);
    $('over-rocks').textContent = fmt(game.kills.rocks);
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
    if (game && (phase === 'playing' || phase === 'paused') && hasProgress(game)) {
      pause();
      $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score) });
      kit.modal.open('modal-confirm');
    } else startGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (game && !game.over && hasProgress(game)) {
      record(game);
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    startGame();
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const inPlay = game && !game.over && (phase === 'playing' || phase === 'paused') && hasProgress(game);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.played ? t('summary.note', { score: fmt(stats.best), wave: stats.bestWave }) : t('summary.none'),
      stats: stats.played ? [{ value: fmt(stats.best), label: t('hud.best') }, { value: String(stats.bestWave), label: t('stats.wave') }] : [],
      resume: inPlay ? { title: t('app.name'), detail: t('summary.detail', { wave: game.wave, score: fmt(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && !game.over && (phase === 'playing' || phase === 'paused') && hasProgress(game)) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
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
          if (game.ship && game.ship.thrusting && !reduced && game.tick % 2 === 0) {
            const s = game.ship;
            const a = s.a + Math.PI + (Math.random() - 0.5) * 0.5;
            particles.push({ kind: 'spark', x: s.x - Math.cos(s.a) * 10, y: s.y - Math.sin(s.a) * 10, vx: Math.cos(a) * 70 + s.vx * 30, vy: Math.sin(a) * 70 + s.vy * 30, life: 260, max: 260, color: colors.flame });
          }
          if (game.over) finish();
          acc -= STEP_MS;
          n++;
        }
        if (n >= 10) acc = 0;
        updateHud();
      }
    } else if (phase === 'ready' && demo && !reduced) {
      acc += dt;
      let n = 0;
      while (acc >= STEP_MS && n < 10) {
        E.step(demo, null);
        acc -= STEP_MS;
        n++;
      }
      if (n >= 10) acc = 0;
    }
    if (phase !== 'paused') updateParticles(dt);
    draw();
  }

  /* ================================================================
   * Nút, cài đặt, rời trang
   * ================================================================ */
  function onSetting(key, value) {
    if (key === 'theme') {
      readColors();
      draw();
    } else if (key === 'controls') {
      app.dataset.controls = value === 'stick' ? 'stick' : 'buttons';
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
    $('stats-wave').textContent = fmt(stats.bestWave);
    $('stats-avg').textContent = fmt(stats.played ? Math.round(stats.total / stats.played) : 0);
    $('stats-rocks').textContent = fmt(stats.rocks);
    $('stats-saucers').textContent = fmt(stats.saucers);
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
    demo = makeDemo();
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
