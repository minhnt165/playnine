/* =====================================================================
 * Chim Bay - Giao diện + vòng lặp + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng <canvas>: requestAnimationFrame lấy dt, engine chạy theo bước cố định 1/120 s (E.ticksFor),
 *     hình vẽ nội suy giữa hai bước nên mượt ở mọi tần số màn hình; nhân devicePixelRatio, tự co theo khung
 *   - Chế độ: 'idle' (màn chờ, nút #btn-start) → 'wait' (chim đứng chờ cú vỗ đầu, hoặc chờ sau khi chơi tiếp)
 *     → 'play' ⇄ 'paused' → 'over' (chim rơi xuống đất rồi hiện kết quả)
 *   - Báo ván cho cổng: bấm Chơi / Chơi lại → kit.sdk.start('classic'); mở lại lượt lưu dở → start('classic', true);
 *     chạm tre / đất → kit.sdk.end({ won: false, score }); bỏ lượt đã có điểm hoặc đã bay ≥ 1 giây → cũng gửi
 *     won: false với điểm hiện có; chưa bay được 1 giây và chưa có điểm thì không gửi gì
 *   - Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; rời trang giữa lượt thì lưu lượt (mở lại ở trạng thái tạm dừng)
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const MAX_ASPECT = 1.8; // khung nhìn rộng nhất (rộng / cao); rộng hơn thì chừa lề hai bên
  const MIN_ASPECT = 0.42; // hẹp nhất; hẹp hơn thì chừa lề trên dưới
  const MEDAL_STEPS = E.MEDALS.map((m) => m[1]);

  const kit = PNKit.init({
    gameId: 'chimbay',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
    onSetting(key) {
      if (key === 'theme') readPalette();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = kit.settings.get();

  const stage = $('stage');
  const board = $('board');
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const pauseBtn = $('btn-pause');
  const overlays = { start: $('overlay-start'), pause: $('overlay-pause'), over: $('overlay-over') };

  /* ---------------- Thống kê ---------------- */
  function readStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const m = raw.medals && typeof raw.medals === 'object' ? raw.medals : {};
    return {
      played: n(raw.played),
      best: n(raw.best),
      total: n(raw.total),
      medals: { bronze: n(m.bronze), silver: n(m.silver), gold: n(m.gold), platinum: n(m.platinum) },
    };
  }
  const stats = readStats();

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let mode = 'idle';
  let prev = null; // trạng thái trước bước cuối (để nội suy khi vẽ)
  let acc = 0; // ms dư chưa đủ một bước
  let lastT = null;
  let animT = 0; // giây, cho hiệu ứng trang trí (vỗ cánh, nhấp nhô)
  let flapAt = -10;
  let crashAt = 0;
  let overShown = false;
  let overReadyAt = 0;
  let lastRun = null;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { reduced = e.matches; });

  const randomSeed = () => (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
  const inRun = () => !!game && game.phase === 'play' && (mode === 'play' || mode === 'paused' || mode === 'wait');
  /** Lượt "đã chơi": có điểm hoặc bay được ít nhất 1 giây → bỏ ngang thì vẫn gửi kết quả. */
  const counts = () => inRun() && (game.score > 0 || game.tick >= E.HZ);

  /* ---------------- Bảng màu (token CSS, đổi theo giao diện) ---------------- */
  let pal = null;
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    pal = {
      skyTop: v('--sky-top'), skyBottom: v('--sky-bottom'), sun: v('--sun'), night: v('--night') === '1', cloud: v('--cloud'),
      hillFar: v('--hill-far'), hillNear: v('--hill-near'), grass: v('--grass'), grassDark: v('--grass-dark'),
      soil: v('--soil'), soilDark: v('--soil-dark'), bamboo: v('--bamboo'), bambooLight: v('--bamboo-light'),
      bambooDark: v('--bamboo-dark'), bambooNode: v('--bamboo-node'), leaf: v('--leaf'),
    };
    const sky = ctx.createLinearGradient(0, 0, 0, E.GROUND_Y);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    pal.skyGrad = sky;
    const st = ctx.createLinearGradient(0, 0, E.PIPE_W, 0);
    st.addColorStop(0, pal.bambooDark);
    st.addColorStop(0.18, pal.bamboo);
    st.addColorStop(0.36, pal.bambooLight);
    st.addColorStop(0.58, pal.bamboo);
    st.addColorStop(1, pal.bambooDark);
    pal.stalk = st;
    draw();
  }
  window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(readPalette));

  /* ---------------- Khung vẽ ---------------- */
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let scale = 1; // px CSS trên một đơn vị thế giới
  let viewW = 0; // bề ngang khung nhìn (đơn vị thế giới)

  function layout() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    let w = sw;
    let h = sh;
    if (w / h > MAX_ASPECT) w = Math.floor(h * MAX_ASPECT);
    if (w / h < MIN_ASPECT) h = Math.floor(w / MIN_ASPECT);
    board.style.width = w + 'px';
    board.style.height = h + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cssW = w;
    cssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = h / E.WORLD_H;
    viewW = w / scale;
    draw();
  }
  new ResizeObserver(layout).observe(stage);

  /** Chim đứng ở khoảng 30% bề ngang khung nhìn (không quá sát mép trên màn rộng). */
  const birdX = () => Math.max(80, Math.min(viewW * 0.3, 300));

  /* ---------------- Vẽ ---------------- */
  /** Số giả ngẫu nhiên cố định theo n (trang trí: mây, sao, sỏi). */
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  function drawSky(camX) {
    ctx.fillStyle = pal.skyGrad;
    ctx.fillRect(0, 0, viewW, E.GROUND_Y);
    // Mặt trời / trăng + sao (đứng yên)
    const sx = viewW - 78;
    const sy = 92;
    if (pal.night) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 46; i++) {
        const x = hash(i) * viewW;
        const y = hash(i + 0.37) * 330;
        const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(animT * (1 + hash(i + 2) * 2) + i);
        ctx.globalAlpha = tw * (0.5 + hash(i + 5) * 0.5);
        ctx.fillRect(x, y, 1.6 + hash(i + 9) * 1.6, 1.6 + hash(i + 9) * 1.6);
      }
      ctx.globalAlpha = 1;
    }
    const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 90);
    glow.addColorStop(0, pal.night ? 'rgba(244, 241, 214, 0.35)' : 'rgba(255, 236, 160, 0.7)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, pal.night ? 24 : 32, 0, Math.PI * 2);
    ctx.fill();
    if (pal.night) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.beginPath();
      ctx.arc(sx - 7, sy - 5, 5, 0, Math.PI * 2);
      ctx.arc(sx + 8, sy + 6, 3.5, 0, Math.PI * 2);
      ctx.arc(sx + 2, sy - 11, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mây (thị sai 0,15; giảm chuyển động thì đứng yên)
    const o = reduced ? 0 : camX * 0.15 + animT * 6;
    const TILE = 360;
    ctx.fillStyle = pal.cloud;
    for (let i = Math.floor(o / TILE) - 1; i <= Math.floor((o + viewW) / TILE) + 1; i++) {
      const cx = i * TILE + hash(i) * 220 - o;
      const cy = 46 + hash(i + 0.5) * 190;
      const s = 0.65 + hash(i + 0.3) * 0.6;
      ctx.beginPath();
      [[0, 0, 20], [22, -12, 26], [48, -4, 22], [68, 4, 15], [30, 8, 18]].forEach(([dx, dy, r]) => {
        ctx.moveTo(cx + (dx + r) * s, cy + dy * s);
        ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
      });
      ctx.fill();
    }
    // Đồi xa, đồi gần (thị sai 0,3 và 0,55)
    hills(reduced ? 0 : camX * 0.3, pal.hillFar, (x) => 404 - 46 * Math.sin(x / 180) - 22 * Math.sin(x / 71 + 1.3));
    hills(reduced ? 0 : camX * 0.55, pal.hillNear, (x) => 482 - 26 * Math.sin(x / 120 + 2) - 12 * Math.sin(x / 47 + 0.4));
  }

  function hills(o, color, f) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, E.GROUND_Y);
    for (let x = 0; x <= viewW + 8; x += 8) ctx.lineTo(x, f(x + o));
    ctx.lineTo(viewW + 8, E.GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  /** Một thân tre từ y0 tới y1 (đơn vị thế giới), đầu cắt ở `open` (mép khe). */
  function drawStalk(x, y0, y1, open, dir) {
    if (y1 - y0 <= 0) return;
    ctx.save();
    ctx.translate(x, 0);
    ctx.fillStyle = pal.stalk;
    ctx.fillRect(0, y0, E.PIPE_W, y1 - y0);
    // Đốt tre cách đều tính từ đầu cắt; lá mọc ở đốt thứ hai
    const SEG = 58;
    for (let k = 1; ; k++) {
      const ny = open - dir * SEG * k;
      if (ny < y0 - 4 || ny > y1 + 4) break;
      ctx.fillStyle = pal.bambooNode;
      ctx.fillRect(-2, ny - 3, E.PIPE_W + 4, 6);
      ctx.fillStyle = pal.bambooLight;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(4, ny - 3, E.PIPE_W - 8, 1.5);
      ctx.globalAlpha = 1;
      if (k === 2) leaves(ny, dir);
    }
    // Đầu cắt: vành sẫm hơi rộng hơn thân, mép trong sáng
    const capY = dir > 0 ? open - 14 : open;
    ctx.fillStyle = pal.bambooDark;
    ctx.fillRect(-3, capY, E.PIPE_W + 6, 14);
    ctx.fillStyle = pal.bambooLight;
    ctx.fillRect(-3, dir > 0 ? open - 3 : open, E.PIPE_W + 6, 3);
    ctx.fillStyle = pal.bambooNode;
    ctx.fillRect(-3, dir > 0 ? capY : capY + 11, E.PIPE_W + 6, 3);
    ctx.restore();
  }

  function leaves(ny, dir) {
    ctx.fillStyle = pal.leaf;
    [[E.PIPE_W + 1, 1], [-1, -1]].forEach(([lx, side], i) => {
      ctx.save();
      ctx.translate(lx, ny);
      ctx.rotate(side * (0.5 + i * 0.15) * -dir);
      ctx.beginPath();
      ctx.ellipse(side * 15, 0, 15, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawGround(camX) {
    const G = E.GROUND_Y;
    ctx.fillStyle = pal.soil;
    ctx.fillRect(0, G, viewW, E.WORLD_H - G);
    // Sỏi trong đất (cuộn cùng tốc độ với tre)
    ctx.fillStyle = pal.soilDark;
    const P = 90;
    for (let i = Math.floor(camX / P) - 1; i <= Math.floor((camX + viewW) / P) + 1; i++) {
      for (let j = 0; j < 3; j++) {
        const x = i * P + hash(i * 3 + j) * P - camX;
        const y = G + 26 + hash(i * 7 + j + 0.5) * 46;
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + hash(i + j) * 3, 2 + hash(i - j) * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Dải cỏ có vạch chéo
    ctx.fillStyle = pal.grass;
    ctx.fillRect(0, G, viewW, 16);
    ctx.fillStyle = pal.grassDark;
    const S = 28;
    const off = -(((camX % S) + S) % S);
    ctx.beginPath();
    for (let x = off - S; x < viewW + S; x += S) {
      ctx.moveTo(x, G + 3);
      ctx.lineTo(x + 14, G + 3);
      ctx.lineTo(x + 8, G + 16);
      ctx.lineTo(x - 6, G + 16);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillRect(0, G, viewW, 3);
    ctx.fillRect(0, G + 16, viewW, 3);
  }

  /** Chú chim (vẽ to hơn vùng va chạm một chút). */
  function drawBird(x, y, ang, wing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Đuôi
    ctx.fillStyle = '#f08a24';
    ctx.beginPath();
    ctx.moveTo(-13, -3);
    ctx.lineTo(-26, -10);
    ctx.lineTo(-23, -1);
    ctx.lineTo(-27, 6);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fill();
    // Mào
    ctx.strokeStyle = '#e07a14';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-1, -15);
    ctx.quadraticCurveTo(-1, -24, 6, -23);
    ctx.moveTo(-5, -14);
    ctx.quadraticCurveTo(-8, -21, -3, -22);
    ctx.stroke();
    // Thân
    ctx.fillStyle = '#ffcd3c';
    ctx.strokeStyle = '#d9871c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Bụng
    ctx.fillStyle = '#fff3cc';
    ctx.beginPath();
    ctx.ellipse(3, 7, 10.5, 7, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // Má hồng
    ctx.fillStyle = 'rgba(255, 112, 140, 0.7)';
    ctx.beginPath();
    ctx.ellipse(5, 3, 3.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Mắt
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(60, 30, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(7, -5, 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d1b2e';
    ctx.beginPath();
    ctx.arc(8.6, -5, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(9.6, -6.3, 1, 0, Math.PI * 2);
    ctx.fill();
    // Mỏ
    ctx.fillStyle = '#ff8a2a';
    ctx.beginPath();
    ctx.moveTo(13, -3);
    ctx.quadraticCurveTo(25, -1, 14, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e2661a';
    ctx.beginPath();
    ctx.moveTo(14, 2);
    ctx.quadraticCurveTo(22, 2.5, 13, 5);
    ctx.closePath();
    ctx.fill();
    // Cánh
    ctx.save();
    ctx.translate(-5, 2);
    ctx.rotate(wing);
    ctx.fillStyle = '#f7a928';
    ctx.strokeStyle = '#d9871c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 10, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /* Hiệu ứng trang trí: lông bay khi va, chớp sáng, rung khung (tắt khi giảm chuyển động) */
  let feathers = [];
  let flash = 0;
  let shake = 0;
  function crashFx(x, y) {
    if (reduced) return;
    flash = 1;
    shake = 1;
    feathers = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      return { x, y, vx: Math.cos(a) * (60 + Math.random() * 90), vy: Math.sin(a) * (60 + Math.random() * 90) - 60, r: Math.random() * 6, life: 1 };
    });
  }
  function updateFx(dt) {
    flash = Math.max(0, flash - dt * 4);
    shake = Math.max(0, shake - dt * 4);
    feathers.forEach((f) => {
      f.vy += 260 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.r += dt * 6;
      f.life -= dt * 1.1;
    });
    feathers = feathers.filter((f) => f.life > 0);
  }

  function draw() {
    if (!pal || !game || !cssW) return;
    const g = game;
    // Nội suy giữa bước trước và bước hiện tại
    const a = prev && (mode === 'play' || mode === 'over') ? Math.min(1, acc / E.TICK_MS) : 1;
    const lerp = (p, q) => (prev ? p + (q - p) * a : q);
    const dist = prev ? lerp(prev.dist, E.distOf(g)) : E.distOf(g);
    let y = prev ? lerp(prev.y, g.y) : g.y;
    const vy = prev ? lerp(prev.vy, g.vy) : g.vy;
    const bx = birdX();
    let camX = dist - bx;
    if (shake > 0) camX += Math.sin(animT * 90) * 5 * shake;

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawSky(camX);
    for (const p of g.pipes) {
      const x = p.x - camX;
      if (x > viewW + 10 || x + E.PIPE_W < -10) continue;
      drawStalk(x, -10, p.y - p.gap / 2, p.y - p.gap / 2, 1);
      drawStalk(x, p.y + p.gap / 2, E.GROUND_Y, p.y + p.gap / 2, -1);
    }
    drawGround(camX);

    // Góc chim: ngóc lên khi vỗ, chúc xuống khi rơi nhanh; chờ thì nhấp nhô
    let ang = 0;
    let wing;
    if (g.phase === 'ready' || (mode === 'wait' && g.phase === 'play')) {
      if (!reduced && g.phase === 'ready') y += Math.sin(animT * 6.5) * 7;
      ang = g.phase === 'ready' ? 0 : Math.max(-0.42, Math.min(1.45, -0.42 + ((vy - E.FLAP_V) / (E.MAX_FALL - E.FLAP_V)) * 1.9));
      wing = reduced ? 0.2 : Math.sin(animT * 16) * 0.7;
    } else {
      ang = Math.max(-0.42, Math.min(1.45, -0.42 + ((vy - E.FLAP_V) / (E.MAX_FALL - E.FLAP_V)) * 1.9));
      const since = animT - flapAt;
      wing = g.phase === 'over' ? -0.5 : !reduced && since < 0.3 ? Math.sin(since * 40) * 0.8 : 0.25;
    }
    drawBird(bx, y, ang, wing);

    feathers.forEach((f) => {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = '#ffd866';
      ctx.beginPath();
      ctx.ellipse(f.x - camX, f.y, 5, 2.4, f.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, E.WORLD_H);
    }
  }

  /* ---------------- Vòng lặp ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const ms = lastT == null ? 0 : now - lastT;
    lastT = now;
    const dt = Math.min(ms, E.MAX_FRAME_MS) / 1000;
    animT += dt;
    if (mode === 'play' || mode === 'over') {
      const r = E.ticksFor(acc, ms);
      acc = r.acc;
      for (let i = 0; i < r.ticks; i++) {
        if (game.phase === 'over' && game.y + E.BIRD_R >= E.GROUND_Y) {
          prev = null;
          break;
        }
        prev = { dist: E.distOf(game), y: game.y, vy: game.vy };
        const before = game;
        game = E.step(game);
        if (game.score !== before.score) onScore();
        if (before.phase === 'play' && game.phase === 'over') onCrash();
      }
      if (mode === 'over' && !overShown && now - crashAt > (reduced ? 300 : 900) && (game.y + E.BIRD_R >= E.GROUND_Y || now - crashAt > 2500)) showOver();
    }
    updateFx(dt);
    if (mode !== 'paused' || flash > 0 || feathers.length) draw();
  }

  /* ---------------- HUD ---------------- */
  function renderHud() {
    const s = game ? String(game.score) : '0';
    if ($('score').textContent !== s) $('score').textContent = s;
    $('best').textContent = String(stats.best);
    const canPause = mode === 'play' || mode === 'paused' || (mode === 'wait' && game.phase === 'play');
    pauseBtn.disabled = !canPause;
    pauseBtn.dataset.state = mode === 'paused' ? 'paused' : 'running';
    const label = mode === 'paused' ? t('btn.resume') : t('btn.pause');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = t('btn.keySuffix', { label });
  }
  function popScore() {
    const el = $('score');
    el.classList.remove('pop');
    void el.offsetWidth; // chạy lại hiệu ứng
    el.classList.add('pop');
  }

  function showOverlay(name) {
    Object.keys(overlays).forEach((k) => { overlays[k].hidden = k !== name; });
  }
  function setHint(on) {
    $('ready-hint').hidden = !on;
  }
  function focusCanvas() {
    canvas.focus({ preventScroll: true });
  }
  function announce(msg) {
    $('sr-status').textContent = msg;
  }
  function vibrate(pattern) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { score: stats.best }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: String(stats.best), label: t('hud.best') }] : [],
      resume: inRun() ? { title: t('app.name'), detail: t('summary.detail', { score: game.score }) } : null,
      now: Date.now(),
    }));
  }
  function saveRun() {
    if (inRun() && mode !== 'play') kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
  }
  /** Rời trang / ẩn trang: đang bay thì tạm dừng, lưu lượt dở và tóm tắt. */
  function persist() {
    if (mode === 'play') pause(false);
    saveRun();
    writeSummary();
  }
  /** Ghi một lượt đã xong (va chạm hoặc bỏ ngang) vào thống kê; trả về có phải kỷ lục mới không. */
  function recordRun(score) {
    const best = score > stats.best;
    stats.played++;
    stats.total += score;
    if (best) stats.best = score;
    const m = E.medalFor(score);
    if (m) stats.medals[m]++;
    saveStats();
    return best;
  }

  /* ---------------- Luồng ván ---------------- */
  function start() {
    if (kit.modal.current()) return;
    game = E.newGame(randomSeed());
    prev = null;
    acc = 0;
    mode = 'wait';
    overShown = false;
    feathers = [];
    flash = 0;
    shake = 0;
    showOverlay(null);
    setHint(true);
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    kit.sfx('start');
    renderHud();
    writeSummary();
    focusCanvas();
    draw();
  }

  function doFlap() {
    if (kit.modal.current() || !game) return;
    if (mode === 'wait') {
      mode = 'play';
      acc = 0;
      prev = null;
      setHint(false);
    } else if (mode !== 'play') return;
    game = E.flap(game);
    flapAt = animT;
    kit.sfx('tap');
    renderHud();
  }

  function onScore() {
    renderHud();
    if (!reduced) popScore();
    if (MEDAL_STEPS.indexOf(game.score) >= 0) {
      kit.sfx('levelup');
      vibrate(30);
    } else {
      kit.sfx('coin');
    }
  }

  function onCrash() {
    mode = 'over';
    crashAt = performance.now();
    overShown = false;
    const score = game.score;
    const best = recordRun(score);
    lastRun = { score, best, medal: E.medalFor(score), cause: game.cause };
    kit.store.remove(keys.save);
    writeSummary();
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    kit.sfx('error');
    vibrate([40, 40, 90]);
    crashFx(E.distOf(game), game.y);
    setHint(false);
    renderHud();
    announce(t('say.over', { score }));
  }

  function showOver() {
    overShown = true;
    const r = lastRun;
    $('over-cause').textContent = t('over.' + r.cause);
    $('over-score').textContent = String(r.score);
    $('over-best').textContent = String(stats.best);
    const medal = $('over-medal');
    medal.dataset.medal = r.medal || '';
    medal.classList.remove('shine');
    if (r.medal && !reduced) {
      void medal.offsetWidth;
      medal.classList.add('shine');
    }
    $('over-medal-name').textContent = r.medal ? t('medal.' + r.medal) : t('medal.none');
    $('over-new').hidden = !r.best;
    const next = E.nextMedal(r.score);
    $('over-next').textContent = next ? t('over.next', { n: next.at - r.score, medal: t('medal.' + next.name).toLowerCase() }) : t('over.top');
    showOverlay('over');
    if (r.best) {
      kit.sfx('win');
      kit.confetti();
    } else {
      kit.sfx('lose');
    }
    // Chặn Space bấm nhầm "Chơi lại" ngay khi đang vỗ cánh dồn dập
    overReadyAt = performance.now() + 500;
    setTimeout(() => {
      if (mode === 'over' && !kit.modal.current()) $('btn-again').focus({ preventScroll: true });
    }, 500);
  }

  function pause(focus) {
    if (!(mode === 'play' || (mode === 'wait' && game.phase === 'play'))) return;
    mode = 'paused';
    $('pause-sub').textContent = t('pause.sub', { score: game.score });
    setHint(false);
    showOverlay('pause');
    renderHud();
    saveRun();
    if (focus) $('btn-resume').focus({ preventScroll: true });
  }

  /** Chơi tiếp: chim đứng giữa trời chờ cú vỗ kế tiếp (không bị rơi ngay khi vừa bấm). */
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'wait';
    prev = null;
    acc = 0;
    showOverlay(null);
    setHint(true);
    renderHud();
    focusCanvas();
  }

  function togglePause() {
    if (mode === 'paused') resume();
    else pause(true);
  }

  /** Ván mới: lượt đã có điểm / đã bay ≥ 1 giây thì hỏi trước (điểm hiện có sẽ được ghi). */
  function requestNew() {
    if (kit.modal.current()) return;
    if (counts()) {
      pause(false);
      $('confirm-text').textContent = t('confirm.text', { score: game.score });
      kit.modal.open('modal-confirm');
    } else {
      start();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (counts()) {
      const score = game.score;
      recordRun(score);
      kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    }
    start();
  }

  /* ---------------- Sự kiện ---------------- */
  $('btn-start').addEventListener('click', start);
  $('btn-again').addEventListener('click', start);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNew);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  pauseBtn.addEventListener('click', () => {
    togglePause();
    if (mode !== 'paused') focusCanvas();
  });
  $('btn-stats').addEventListener('click', () => {
    const f = kit.i18n.fmtNumber;
    $('stats-played').textContent = f(stats.played);
    $('stats-best').textContent = f(stats.best);
    $('stats-total').textContent = f(stats.total);
    $('stats-avg').textContent = stats.played ? (stats.total / stats.played).toLocaleString(kit.i18n.lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 }) : '0';
    Object.keys(stats.medals).forEach((m) => { $('stats-' + m).textContent = f(stats.medals[m]); });
  });

  // Chạm / nhấp bất kỳ đâu trên bầu trời để vỗ cánh (trừ nút và thẻ lớp phủ)
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.overlay-card') || e.target.closest('button') || kit.modal.current()) return;
    if (mode === 'wait' || mode === 'play') {
      e.preventDefault();
      focusCanvas();
      doFlap();
    } else if (mode === 'idle') {
      e.preventDefault();
      start();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onControl = e.target && e.target.closest && e.target.closest('button, input, a, select');
    if (k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      if (onControl && (k === ' ' || k === 'Enter')) {
        // Nút tự bấm bằng Space / Enter; riêng "Chơi lại" chặn trong lúc vừa hết lượt
        if (e.target.id === 'btn-again' && performance.now() < overReadyAt) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.repeat) return; // giữ phím không vỗ liên tục
      if (mode === 'idle') start();
      else if (mode === 'wait' || mode === 'play') doFlap();
      else if (mode === 'paused') resume();
      else if (mode === 'over' && overShown && performance.now() >= overReadyAt) start();
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (mode === 'play' || mode === 'paused' || (mode === 'wait' && game.phase === 'play')) {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === 'n' || k === 'N') {
      e.preventDefault();
      requestNew();
    }
  });

  // Mở hộp thoại thì tạm dừng; đóng hướng dẫn lần đầu thì ghi guideSeen
  const watcher = new MutationObserver(() => {
    if (kit.modal.current()) {
      if (mode === 'play') pause(false);
    } else if (!settings.guideSeen && $('modal-help').hidden) {
      kit.settings.set({ guideSeen: true });
    }
  });
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại lượt dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.phase === 'play') {
    game = restored;
    mode = 'paused';
    $('pause-sub').textContent = t('pause.sub', { score: game.score });
    showOverlay('pause');
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
  } else {
    kit.store.remove(keys.save);
    game = E.newGame(randomSeed());
    mode = 'idle';
    showOverlay('start');
  }
  readPalette();
  layout();
  renderHud();
  writeSummary();
  requestAnimationFrame(frame);
  if (!settings.guideSeen) kit.modal.open('modal-help');
  else (mode === 'paused' ? $('btn-resume') : $('btn-start')).focus({ preventScroll: true });
})();
