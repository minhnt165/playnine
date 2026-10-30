/* =====================================================================
 * Chạy Vô Tận - Giao diện + vòng lặp + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng <canvas>: requestAnimationFrame lấy dt, engine chạy theo bước cố định 1/120 s (E.ticksFor),
 *     hình vẽ nội suy giữa hai bước nên mượt ở mọi tần số màn hình; nhân devicePixelRatio, tự co theo khung.
 *     Khung nhìn luôn rộng ít nhất MIN_VIEW_W đơn vị (điện thoại dọc thì thu nhỏ và để thêm trời phía trên)
 *     để người chơi thấy trước chướng ngại đủ lâu
 *   - Chế độ: 'idle' (màn chờ, nút #btn-start) → 'wait' (đứng ở vạch xuất phát, bấm nhảy / chạm để chạy)
 *     → 'play' ⇄ 'paused' (chơi tiếp thì 'count': đếm 3-2-1 rồi mới chạy) → 'over' (ngã rồi hiện kết quả)
 *   - Điều khiển: Space / ↑ / W nhảy (giữ = cao hơn), ↓ / S trượt; cảm ứng: nửa phải nhảy, nửa trái trượt.
 *     Phím / chạm nhanh hơn một bước mô phỏng vẫn được ghi (chốt lại tới bước kế tiếp)
 *   - Báo ván cho cổng: bấm Chơi / Chơi lại → kit.sdk.start('classic'); mở lại lượt lưu dở → start('classic', true);
 *     ngã → kit.sdk.end({ won: false, score }); bỏ lượt đã có điểm hoặc đã chạy ≥ 1 giây → cũng gửi
 *     won: false với điểm hiện có; chưa chạy thì không gửi gì
 *   - Tự tạm dừng khi trang ẩn, mất focus hoặc mở hộp thoại; rời trang giữa lượt thì lưu lượt (mở lại ở trạng thái tạm dừng)
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const MAX_ASPECT = 2.4; // khung rộng nhất (rộng / cao); rộng hơn thì chừa lề hai bên
  const MIN_ASPECT = 0.85; // hẹp nhất; hẹp hơn (điện thoại dọc) thì chừa chỗ bên dưới (nhãn vùng chạm)
  const MIN_VIEW_W = 640; // khung nhìn rộng ít nhất chừng này đơn vị thế giới (thấy trước ≥ 0,83 s ở tốc độ tối đa)
  const COUNT_S = 1.5; // đếm ngược khi chơi tiếp
  const MILESTONE_M = 500;
  const S = E.SPRITE;

  const kit = PNKit.init({
    gameId: 'chayvotan',
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
    return { played: n(raw.played), best: n(raw.best), far: n(raw.far), total: n(raw.total), meters: n(raw.meters), coins: n(raw.coins) };
  }
  const stats = readStats();

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let mode = 'idle';
  let prev = null; // { x, y } trước bước cuối (để nội suy khi vẽ)
  let acc = 0; // ms dư chưa đủ một bước
  let lastT = null;
  let animT = 0; // giây, cho hiệu ứng trang trí
  let countLeft = 0;
  let crashAt = 0;
  let overShown = false;
  let overReadyAt = 0;
  let lastRun = null;
  let death = null; // hoạt cảnh ngã: { x, y, vx, vy, rot, t }
  let lastMilestone = 0;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { reduced = e.matches; });

  const randomSeed = () => (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
  const running = () => mode === 'play' || mode === 'count' || mode === 'paused' || (mode === 'wait' && game.tick > 0);
  const inRun = () => !!game && game.phase === 'run' && running();
  /** Lượt "đã chơi": có điểm hoặc chạy được ít nhất 1 giây → bỏ ngang thì vẫn gửi kết quả. */
  const counts = () => inRun() && (E.scoreOf(game) > 0 || game.tick >= E.HZ);

  /* ---------------- Input: phím + chạm (giữ) ---------------- */
  const input = { keyJump: false, keyDown: false, latchJump: false, latchDown: false, suppress: false };
  const pointers = new Map(); // pointerId → 'jump' | 'down' | 'none'
  const held = (kind) => {
    for (const v of pointers.values()) if (v === kind) return true;
    return false;
  };
  function tickInput() {
    const jump = (!input.suppress && (input.keyJump || held('jump'))) || input.latchJump;
    const down = input.keyDown || held('down') || input.latchDown;
    input.latchJump = false;
    input.latchDown = false;
    return { jump, down };
  }
  function releaseAll() {
    input.keyJump = input.keyDown = input.latchJump = input.latchDown = false;
    pointers.clear();
    paintPads();
  }
  function paintPads() {
    $('pad-jump').classList.toggle('on', held('jump'));
    $('pad-down').classList.toggle('on', held('down'));
  }

  /* ---------------- Bảng màu (token CSS, đổi theo giao diện) ---------------- */
  let pal = null;
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    pal = {};
    ['sky-top', 'sky-bottom', 'sun', 'cloud', 'mount', 'mount-snow', 'hill', 'tree', 'tree-dark', 'grass', 'grass-dark', 'soil', 'soil-dark', 'pit', 'post', 'post-light', 'post-dark', 'flyer', 'flyer-wing', 'coin', 'coin-dark', 'runner', 'runner-dark', 'skin', 'accent'].forEach((k) => {
      pal[k.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v('--' + k);
    });
    pal.night = v('--night') === '1';
    buildGradients();
    draw();
  }
  window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(readPalette));

  /* ---------------- Khung vẽ ---------------- */
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let scale = 1; // px CSS trên một đơn vị thế giới
  let viewW = 0; // bề ngang / cao khung nhìn (đơn vị thế giới)
  let viewH = 0;
  let skyTop = 0; // phần trời thêm phía trên thế giới (điện thoại dọc)
  let grads = null;

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
    scale = Math.min(h / E.WORLD_H, w / MIN_VIEW_W);
    viewW = w / scale;
    viewH = h / scale;
    skyTop = viewH - E.WORLD_H;
    buildGradients();
    draw();
  }
  new ResizeObserver(layout).observe(stage);

  function buildGradients() {
    if (!pal || !viewH) return;
    const sky = ctx.createLinearGradient(0, -skyTop, 0, E.GROUND_Y);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    const pit = ctx.createLinearGradient(0, E.GROUND_Y, 0, E.WORLD_H);
    pit.addColorStop(0, pal.pit);
    pit.addColorStop(1, '#000');
    grads = { sky, pit };
  }

  /** Nhân vật đứng cách mép trái 14% khung nhìn. */
  const runX = () => Math.max(60, Math.min(viewW * 0.14, 170));

  /* ---------------- Vẽ: nền nhiều lớp ---------------- */
  /** Số giả ngẫu nhiên cố định theo n (trang trí: núi, cây, mây, sao, sỏi). */
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  function drawSky(camX) {
    ctx.fillStyle = grads.sky;
    ctx.fillRect(0, -skyTop, viewW, E.GROUND_Y + skyTop);
    const sx = viewW * 0.78;
    const sy = Math.max(-skyTop * 0.5 + 40, 58);
    if (pal.night) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 70; i++) {
        const x = hash(i) * viewW;
        const y = -skyTop + hash(i + 0.37) * (skyTop + 210);
        const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(animT * (1 + hash(i + 2) * 2) + i);
        ctx.globalAlpha = tw * (0.45 + hash(i + 5) * 0.55);
        const r = 1.2 + hash(i + 9) * 1.4;
        ctx.fillRect(x, y, r, r);
      }
      ctx.globalAlpha = 1;
    }
    const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 80);
    glow.addColorStop(0, pal.night ? 'rgba(242, 239, 210, 0.32)' : 'rgba(255, 230, 150, 0.75)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 80, sy - 80, 160, 160);
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    if (pal.night) {
      // Trăng khuyết: hình tròn trừ đi một hình tròn lệch (evenodd, cắt trong hình trăng)
      ctx.save();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.arc(sx + 9, sy - 6, 17, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();
    } else {
      ctx.arc(sx, sy, 28, 0, Math.PI * 2);
      ctx.fill();
    }
    // Núi xa (thị sai 0,08)
    const om = reduced ? 0 : camX * 0.08;
    const P = 260;
    for (let i = Math.floor(om / P) - 2; i <= Math.floor((om + viewW) / P) + 2; i++) {
      const cx = i * P + hash(i) * 90 - om;
      const hgt = 95 + hash(i + 0.3) * 85;
      const half = 140 + hash(i + 0.6) * 70;
      const base = E.GROUND_Y - 30;
      ctx.fillStyle = pal.mount;
      ctx.beginPath();
      ctx.moveTo(cx - half, base);
      ctx.lineTo(cx, base - hgt);
      ctx.lineTo(cx + half, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.mountSnow;
      const k = 0.26;
      ctx.beginPath();
      ctx.moveTo(cx, base - hgt);
      ctx.lineTo(cx + half * k, base - hgt * (1 - k));
      ctx.lineTo(cx + half * k * 0.35, base - hgt * (1 - k * 0.8));
      ctx.lineTo(cx - half * k * 0.2, base - hgt * (1 - k * 1.05));
      ctx.lineTo(cx - half * k, base - hgt * (1 - k));
      ctx.closePath();
      ctx.fill();
    }
    // Mây (thị sai 0,15 + trôi chậm)
    const oc = reduced ? 0 : camX * 0.15 + animT * 8;
    const TILE = 330;
    ctx.fillStyle = pal.cloud;
    for (let i = Math.floor(oc / TILE) - 1; i <= Math.floor((oc + viewW) / TILE) + 1; i++) {
      const cx = i * TILE + hash(i + 40) * 200 - oc;
      const cy = -skyTop * 0.6 + 30 + hash(i + 40.5) * 120;
      const s = 0.55 + hash(i + 40.3) * 0.55;
      ctx.beginPath();
      [[0, 0, 18], [20, -11, 23], [44, -3, 19], [62, 4, 13], [28, 7, 16]].forEach(([dx, dy, r]) => {
        ctx.moveTo(cx + (dx + r) * s, cy + dy * s);
        ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
      });
      ctx.fill();
    }
    // Đồi (thị sai 0,3)
    const oh = reduced ? 0 : camX * 0.3;
    ctx.fillStyle = pal.hill;
    ctx.beginPath();
    ctx.moveTo(0, E.GROUND_Y);
    for (let x = 0; x <= viewW + 8; x += 8) {
      const u = x + oh;
      ctx.lineTo(x, E.GROUND_Y - 48 - 20 * Math.sin(u / 160) - 11 * Math.sin(u / 61 + 1.3));
    }
    ctx.lineTo(viewW + 8, E.GROUND_Y);
    ctx.closePath();
    ctx.fill();
    // Hàng cây (thị sai 0,55)
    const ot = reduced ? 0 : camX * 0.55;
    const TP = 64;
    for (let i = Math.floor(ot / TP) - 1; i <= Math.floor((ot + viewW) / TP) + 1; i++) {
      if (hash(i + 70) < 0.25) continue;
      const x = i * TP + hash(i + 71) * 34 - ot;
      const h = 30 + hash(i + 72) * 34;
      const base = E.GROUND_Y + 2;
      ctx.fillStyle = pal.treeDark;
      ctx.fillRect(x - 2.5, base - h * 0.45, 5, h * 0.45);
      ctx.fillStyle = hash(i + 73) < 0.5 ? pal.tree : pal.treeDark;
      ctx.beginPath();
      if (hash(i + 74) < 0.45) {
        // thông
        ctx.moveTo(x, base - h - 8);
        ctx.lineTo(x + h * 0.32, base - h * 0.3);
        ctx.lineTo(x - h * 0.32, base - h * 0.3);
        ctx.closePath();
      } else {
        const r = h * 0.3;
        ctx.arc(x, base - h * 0.7, r, 0, Math.PI * 2);
        ctx.moveTo(x - r * 0.4 + r * 0.75, base - h * 0.52);
        ctx.arc(x - r * 0.4, base - h * 0.52, r * 0.75, 0, Math.PI * 2);
        ctx.moveTo(x + r * 0.5 + r * 0.7, base - h * 0.5);
        ctx.arc(x + r * 0.5, base - h * 0.5, r * 0.7, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  /* ---------------- Vẽ: đường chạy ---------------- */
  /** Một khối đất / bậc; openL / openR: mép trái / phải là mép hố (vẽ thành đất sẫm). */
  function drawBlock(k, camX, openL, openR) {
    const x0 = k.x0 - camX;
    const x1 = k.x1 - camX;
    if (x1 < -20 || x0 > viewW + 20) return;
    const w = x1 - x0 + (openR ? 0 : 1); // nối liền khối bên cạnh, không lộ đường khe khi khử răng cưa
    const raised = k.top < E.GROUND_Y;
    ctx.fillStyle = pal.soil;
    ctx.fillRect(x0, k.top, w, E.WORLD_H - k.top + 2);
    // Sỏi (cố định theo tọa độ thế giới)
    ctx.fillStyle = pal.soilDark;
    const PB = 46;
    for (let i = Math.floor(k.x0 / PB); i * PB < k.x1; i++) {
      const px = i * PB + hash(i * 3.1 + k.top) * PB;
      if (px < k.x0 + 4 || px > k.x1 - 4) continue;
      const py = k.top + 20 + hash(i * 7.3 + k.top) * (E.WORLD_H - k.top - 26);
      ctx.beginPath();
      ctx.ellipse(px - camX, py, 2.5 + hash(i + 0.2) * 2.5, 1.8 + hash(i + 0.9) * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (raised) {
      // Bậc: viền gạch hai bên
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fillRect(x0, k.top, 4, E.WORLD_H - k.top);
      ctx.fillRect(x1 - 4, k.top, 4, E.WORLD_H - k.top);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let y = k.top + 22; y < E.GROUND_Y; y += 14) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    } else {
      // Mép hố: thành đất sẫm
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      if (openL) ctx.fillRect(x0, k.top + 8, 3, E.WORLD_H - k.top);
      if (openR) ctx.fillRect(x1 - 3, k.top + 8, 3, E.WORLD_H - k.top);
    }
    // Lớp cỏ
    ctx.fillStyle = pal.grass;
    ctx.fillRect(x0, k.top - 1, w, 10);
    ctx.fillStyle = pal.grassDark;
    ctx.fillRect(x0, k.top + 8, w, 3);
    // Ngọn cỏ lởm chởm
    ctx.fillStyle = pal.grass;
    ctx.beginPath();
    const G = 12;
    for (let gx = Math.ceil(k.x0 / G) * G; gx < k.x1 - 4; gx += G) {
      const sx = gx - camX;
      ctx.moveTo(sx, k.top + 9);
      ctx.lineTo(sx + 3, k.top + 14 + hash(gx) * 3);
      ctx.lineTo(sx + 6, k.top + 9);
    }
    ctx.fill();
  }

  function drawPost(h, camX) {
    const x = h.x - camX;
    const w = S.postW;
    const top = h.base - S.postH;
    ctx.fillStyle = pal.postDark;
    roundRect(x - w / 2 - 3, h.base - 6, w + 6, 6, 2);
    ctx.fillStyle = pal.post;
    roundRect(x - w / 2, top, w, S.postH - 4, 7);
    ctx.fillStyle = pal.postLight;
    ctx.fillRect(x - w / 2, top + 13, w, 7);
    ctx.fillRect(x - w / 2, top + 27, w, 7);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(x - w / 2 + 4, top + 4, 4, S.postH - 12);
    // Đèn nhỏ trên đỉnh
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(x, top + 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlyer(h, camX) {
    const x = h.x - camX;
    const y = h.base - S.flyY + (reduced ? 0 : Math.sin(animT * 5 + h.x) * 2);
    const flap = reduced ? 0.3 : Math.sin(animT * 16 + h.x);
    // Cánh
    ctx.fillStyle = pal.flyerWing;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(x + side * 4, y - 2);
      ctx.quadraticCurveTo(x + side * 18, y - 14 - flap * 8, x + side * 23, y - 4 - flap * 10);
      ctx.quadraticCurveTo(x + side * 14, y + 2, x + side * 4, y + 3);
      ctx.closePath();
      ctx.fill();
    });
    // Thân
    ctx.fillStyle = pal.flyer;
    ctx.beginPath();
    ctx.ellipse(x, y, 15, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Mắt nhìn về phía nhân vật (bên trái) + mỏ
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 6, y - 3, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d1b2e';
    ctx.beginPath();
    ctx.arc(x - 7.5, y - 3, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x - 21, y + 2.5);
    ctx.lineTo(x - 13, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  function drawCoin(c, camX) {
    const x = c.x - camX;
    const sx = reduced ? 1 : Math.max(0.35, Math.abs(Math.cos(animT * 3.2 + c.x * 0.02)));
    ctx.save();
    ctx.translate(x, c.y);
    ctx.scale(sx, 1);
    ctx.fillStyle = pal.coinDark;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.coin;
    ctx.beginPath();
    ctx.arc(0, -0.7, 8.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(-1.8, -5.5, 3.6, 9.5);
    ctx.restore();
  }

  function drawFeather(it, camX) {
    const x = it.x - camX;
    const y = it.y + (reduced ? 0 : Math.sin(animT * 3) * 4);
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 22);
    glow.addColorStop(0, 'rgba(160, 240, 255, 0.8)');
    glow.addColorStop(1, 'rgba(160, 240, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 22, y - 22, 44, 44);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, -2, 5.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5bc7e8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -13);
    ctx.stroke();
    ctx.restore();
  }

  /** Cột mốc mỗi 100 m và cờ kỷ lục. */
  function drawMarkers(camX) {
    const step = 100 * E.UNITS_PER_M;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let m = Math.max(1, Math.floor(camX / step)); m * step < camX + viewW + 40; m++) {
      const x = m * step - camX;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(x - 1, E.GROUND_Y - 30, 2, 30);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      roundRect(x - 17, E.GROUND_Y - 44, 34, 15, 4);
      ctx.fillStyle = '#2b2f55';
      ctx.fillText(m * 100 + ' m', x, E.GROUND_Y - 33);
    }
    if (stats.far > 0) {
      const x = stats.far * E.UNITS_PER_M - camX;
      if (x > -20 && x < viewW + 20) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(x - 1, E.GROUND_Y - 62, 2, 62);
        ctx.fillStyle = pal.accent || '#7c5cff';
        ctx.beginPath();
        ctx.moveTo(x + 1, E.GROUND_Y - 62);
        ctx.lineTo(x + 24, E.GROUND_Y - 55);
        ctx.lineTo(x + 1, E.GROUND_Y - 48);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- Vẽ: nhân vật ---------------- */
  /** Một chi hai đốt từ (x, y): góc đốt trên a1, đốt dưới a2 (rad, 0 = thẳng xuống). */
  function limb(x, y, a1, a2, l1, l2, color, width) {
    const kx = x + Math.sin(a1) * l1;
    const ky = y + Math.cos(a1) * l1;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(kx, ky);
    ctx.lineTo(kx + Math.sin(a2) * l2, ky + Math.cos(a2) * l2);
    ctx.stroke();
  }

  function head(x, y) {
    ctx.fillStyle = pal.skin;
    ctx.beginPath();
    ctx.arc(x, y, 8.5, 0, Math.PI * 2);
    ctx.fill();
    // Tóc + băng đô bay
    ctx.fillStyle = '#3b2a20';
    ctx.beginPath();
    ctx.arc(x - 1, y - 2, 8.5, Math.PI * 0.95, Math.PI * 1.95);
    ctx.fill();
    ctx.fillStyle = pal.accent || '#7c5cff';
    ctx.fillRect(x - 8.5, y - 4, 17, 3.4);
    const wave = reduced ? 0 : Math.sin(animT * 18) * 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 4);
    ctx.lineTo(x - 17, y - 6 + wave);
    ctx.lineTo(x - 16, y - 1 + wave);
    ctx.lineTo(x - 8, y - 0.6);
    ctx.closePath();
    ctx.fill();
    // Mắt
    ctx.fillStyle = '#1d1b2e';
    ctx.beginPath();
    ctx.arc(x + 4.5, y + 0.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Nhân vật: chân ở (x, y). pose: 'run' | 'jump' | 'slide' | 'stand' | 'hurt'.
   * phase: pha chạy (rad), vy: vận tốc đứng (nghiêng người khi nhảy).
   */
  function drawRunner(x, y, pose, phase, vy, rot) {
    const pants = '#34386b';
    const shoe = '#f5f5f8';
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (rot) ctx.rotate(rot);
    if (pose === 'slide') {
      // Nằm ngửa lướt, chân duỗi về trước
      limb(2, -7, 1.45, 1.6, 9, 10, pants, 5.5);
      ctx.fillStyle = shoe;
      ctx.beginPath();
      ctx.ellipse(21, -6, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.runner;
      roundRect(-12, -15, 17, 11, 5);
      limb(-6, -12, 2.3, 2.6, 7, 7, pal.runnerDark, 4);
      head(-15, -12);
      ctx.restore();
      return;
    }
    let lA1;
    let lA2;
    let rA1;
    let rA2;
    let armA;
    let armB;
    if (pose === 'jump') {
      const up = vy < 0;
      lA1 = up ? 1.15 : 0.75;
      lA2 = up ? 0.1 : 0.05;
      rA1 = up ? -0.35 : -0.2;
      rA2 = up ? -1.3 : -0.9;
      armA = 2.3;
      armB = -0.9;
    } else if (pose === 'run') {
      const s = Math.sin(phase);
      lA1 = s * 0.85;
      rA1 = -s * 0.85;
      // cẳng chân gập ra sau đầu gối, gập nhiều nhất khi chân đang đưa lên trước
      lA2 = lA1 - 0.5 - Math.max(0, Math.cos(phase)) * 1.1;
      rA2 = rA1 - 0.5 - Math.max(0, -Math.cos(phase)) * 1.1;
      armA = -s * 1.0;
      armB = s * 1.0;
    } else if (pose === 'hurt') {
      lA1 = 0.5;
      lA2 = -0.4;
      rA1 = -0.6;
      rA2 = -0.2;
      armA = 2.6;
      armB = -2.4;
    } else {
      lA1 = 0.12;
      lA2 = 0.05;
      rA1 = -0.12;
      rA2 = -0.05;
      armA = 0.25;
      armB = -0.25;
    }
    const hipY = -19;
    // Chân sau, tay sau (tối hơn)
    limb(0, hipY, rA1, rA2, 10, 10, '#2a2d58', 5.5);
    limb(0, hipY - 13, armB, armB + 0.9, 7, 7, pal.runnerDark, 4);
    // Thân
    ctx.fillStyle = pal.runner;
    roundRect(-6.5, -36, 13, 20, 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-1.5, -33, 3, 14);
    // Chân trước
    limb(0, hipY, lA1, lA2, 10, 10, pants, 5.5);
    // Giày
    ctx.fillStyle = shoe;
    [[lA1, lA2], [rA1, rA2]].forEach(([a1, a2]) => {
      const fx = Math.sin(a1) * 10 + Math.sin(a2) * 10;
      const fy = hipY + Math.cos(a1) * 10 + Math.cos(a2) * 10;
      ctx.beginPath();
      ctx.ellipse(fx + 2, fy, 4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // Tay trước
    limb(0, hipY - 13, armA, armA + 0.9, 7, 7, pal.runner, 4);
    head(1.5, -44);
    ctx.restore();
  }

  /* Hiệu ứng trang trí: bụi, lấp lánh khi nhặt xu, rung khung (tắt khi giảm chuyển động) */
  let parts = [];
  let shake = 0;
  let flash = 0;
  function puff(x, y, n, color, spread) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.random() - 0.5) * (spread || 1.6);
      const sp = 30 + Math.random() * 70;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: 1.5 + Math.random() * 2.5, life: 0.5 + Math.random() * 0.3, color, g: 120 });
    }
  }
  function sparkle(x, y) {
    if (reduced) return;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 2, life: 0.35, color: pal.coin, g: 0 });
    }
  }
  function updateFx(dt) {
    shake = Math.max(0, shake - dt * 3.5);
    flash = Math.max(0, flash - dt * 4);
    parts.forEach((p) => {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    parts = parts.filter((p) => p.life > 0);
    if (death) {
      death.t += dt;
      if (!reduced || death.pit) {
        death.vy += (death.pit ? 1600 : 1900) * dt;
        death.x += death.vx * dt;
        death.y += death.vy * dt;
        if (!death.pit && death.y > death.floor) {
          death.y = death.floor;
          death.vy = 0;
          death.vx *= 0.6;
        }
        death.rot += death.spin * dt * (death.y < death.floor || death.pit ? 1 : 0);
      }
    }
  }

  function draw() {
    if (!pal || !game || !cssW || !grads) return;
    const g = game;
    // Nội suy giữa bước trước và bước hiện tại
    const a = prev && mode === 'play' ? Math.min(1, acc / E.TICK_MS) : 1;
    const x = prev ? prev.x + (g.x - prev.x) * a : g.x;
    const y = prev ? prev.y + (g.y - prev.y) * a : g.y;
    let camX = x - runX();
    if (shake > 0) camX += Math.sin(animT * 80) * 4 * shake;

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, dpr * scale * skyTop);
    drawSky(camX);
    // Hố: nền tối, mặt đất phủ lên
    ctx.fillStyle = grads.pit;
    ctx.fillRect(0, E.GROUND_Y, viewW, E.WORLD_H - E.GROUND_Y + 2);
    const chs = E.chunksIn(g.seed, camX - 40, camX + viewW + 40);
    const ground = [];
    chs.forEach((ch) => ch.blocks.forEach((k) => { if (k.top === E.GROUND_Y) ground.push(k); }));
    const joined = (x) => ground.filter((o) => Math.abs(o.x0 - x) < 0.5 || Math.abs(o.x1 - x) < 0.5).length > 1;
    ground.forEach((k) => drawBlock(k, camX, !joined(k.x0), !joined(k.x1)));
    chs.forEach((ch) => ch.blocks.forEach((k) => { if (k.top < E.GROUND_Y) drawBlock(k, camX, true, true); }));
    drawMarkers(camX);
    const taken = new Set(g.taken);
    chs.forEach((ch) => {
      ch.coins.forEach((c) => {
        if (!taken.has(c.id) && c.x > camX - 12 && c.x < camX + viewW + 12) drawCoin(c, camX);
      });
      if (ch.item && !taken.has(ch.item.id)) drawFeather(ch.item, camX);
      ch.hz.forEach((h) => {
        if (h.x < camX - 40 || h.x > camX + viewW + 40) return;
        if (h.k === 'post') drawPost(h, camX);
        else drawFlyer(h, camX);
      });
    });

    // Nhân vật
    const rx = x - camX;
    if (death) {
      drawRunner(death.x - camX, death.y, 'hurt', 0, 0, death.rot);
    } else {
      // Bóng trên mặt đất
      const floor = surfaceBelow(chs, x);
      if (floor !== Infinity) {
        const d = Math.max(0, floor - y);
        ctx.fillStyle = 'rgba(0, 0, 0, ' + (0.22 * Math.max(0.25, 1 - d / 160)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(rx, floor + 1, 12 * Math.max(0.5, 1 - d / 200), 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const pose = g.sliding ? 'slide' : !g.grounded ? 'jump' : mode === 'play' ? 'run' : 'stand';
      drawRunner(rx, y, pose, reduced ? 0 : x / 15, g.vy, 0);
      if (g.dj > 0) {
        // Lông vũ sau lưng khi còn nhảy đôi
        ctx.save();
        ctx.translate(rx - 9, y - (g.sliding ? 10 : 30));
        ctx.rotate(-1.1 + (reduced ? 0 : Math.sin(animT * 8) * 0.15));
        ctx.fillStyle = g.usedDouble ? 'rgba(255, 255, 255, 0.45)' : '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    parts.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Khung chữ trên canvas (không chịu thị sai): thời gian nhảy đôi, đếm ngược
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g.dj > 0 && !death) {
      const w = 96;
      ctx.fillStyle = 'rgba(10, 14, 36, 0.5)';
      roundRectPx(10, 10, w + 16, 30, 10);
      ctx.fillStyle = '#fff';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(t('canvas.double'), 18, 22);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(18, 28, w, 5);
      ctx.fillStyle = '#7fe0ff';
      ctx.fillRect(18, 28, (w * g.dj) / E.DJ_TICKS, 5);
    }
    if (mode === 'count') {
      const n = Math.max(1, Math.ceil(countLeft / (COUNT_S / 3)));
      const k = reduced ? 0 : 1 - ((countLeft / (COUNT_S / 3)) % 1);
      ctx.save();
      ctx.translate(cssW / 2, cssH * 0.38);
      ctx.scale(1 + k * 0.25, 1 + k * 0.25);
      ctx.globalAlpha = 1 - k * 0.5;
      ctx.font = '800 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(10, 14, 36, 0.55)';
      ctx.strokeText(String(n), 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }
  function roundRectPx(x, y, w, h, r) {
    roundRect(x, y, w, h, r);
  }
  /** Mặt đất cao nhất dưới x (để vẽ bóng). */
  function surfaceBelow(chs, x) {
    let top = Infinity;
    chs.forEach((ch) => ch.blocks.forEach((k) => { if (k.x0 < x + 4 && k.x1 > x - 4 && k.top < top && k.top >= game.y - 1) top = k.top; }));
    return top;
  }

  /* ---------------- Vòng lặp ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const ms = lastT == null ? 0 : now - lastT;
    lastT = now;
    const dt = Math.min(ms, E.MAX_FRAME_MS) / 1000;
    animT += dt;
    if (mode === 'count') {
      countLeft -= dt;
      if (countLeft <= 0) {
        mode = 'play';
        acc = 0;
        prev = null;
        input.latchJump = input.latchDown = false;
        renderHud();
      }
    } else if (mode === 'play') {
      const r = E.ticksFor(acc, ms);
      acc = r.acc;
      for (let i = 0; i < r.ticks && mode === 'play'; i++) {
        prev = { x: game.x, y: game.y };
        const before = game;
        game = E.step(game, tickInput());
        onTick(before, game);
      }
    }
    updateFx(dt);
    if (mode === 'over' && !overShown && now - crashAt > (reduced ? 350 : 1000)) showOver();
    if (mode !== 'paused' || parts.length || shake > 0) draw();
  }

  /** Sự kiện của một bước: âm thanh, hiệu ứng, HUD. */
  function onTick(a, b) {
    if (b.phase === 'over') {
      onCrash();
      return;
    }
    if (b.jumps !== a.jumps) {
      kit.sfx('tap', { volume: 0.5 });
      if (!a.grounded) puff(b.x - 6, b.y, 5, 'rgba(255, 255, 255, 0.8)', 3);
      else puff(b.x - 8, b.y, 4, 'rgba(160, 130, 90, 0.6)');
    }
    if (b.grounded && !a.grounded) puff(b.x - 4, b.y, 5, 'rgba(160, 130, 90, 0.6)');
    if (b.sliding && !a.sliding) kit.sfx('move', { volume: 0.4 });
    if (b.sliding && !reduced && (b.tick & 7) === 0) puff(b.x - 12, b.y, 1, 'rgba(160, 130, 90, 0.5)', 0.6);
    if (b.coins !== a.coins) {
      kit.sfx('coin', { volume: 0.55 });
      sparkle(b.x + 6, b.y - 24);
      if (!reduced) pop($('coins'));
    }
    if (b.dj > a.dj + 1) {
      kit.sfx('levelup');
      vibrate(30);
      kit.toast(t('toast.feather'));
      announce(t('say.feather'));
    }
    const m = E.meters(b);
    if (Math.floor(m / MILESTONE_M) > lastMilestone) {
      lastMilestone = Math.floor(m / MILESTONE_M);
      kit.sfx('combo');
    }
    renderScore();
  }

  /* ---------------- HUD ---------------- */
  let shownScore = -1;
  let shownCoins = -1;
  function renderScore() {
    const s = game ? E.scoreOf(game) : 0;
    const c = game ? game.coins : 0;
    if (s !== shownScore) {
      shownScore = s;
      $('score').textContent = String(s);
    }
    if (c !== shownCoins) {
      shownCoins = c;
      $('coins').textContent = String(c);
    }
  }
  function renderHud() {
    renderScore();
    $('best').textContent = String(stats.best);
    const canPause = mode === 'play' || mode === 'paused' || mode === 'count' || (mode === 'wait' && game.tick > 0);
    pauseBtn.disabled = !canPause;
    pauseBtn.dataset.state = mode === 'paused' ? 'paused' : 'running';
    const label = mode === 'paused' ? t('btn.resume') : t('btn.pause');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = t('btn.keySuffix', { label });
  }
  function pop(el) {
    el.parentNode.classList.remove('pop');
    void el.offsetWidth; // chạy lại hiệu ứng
    el.parentNode.classList.add('pop');
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
      note: stats.best > 0 ? t('summary.note', { score: stats.best, m: stats.far }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: String(stats.best), label: t('hud.best') }, { value: t('stats.m', { m: stats.far }), label: t('stats.far') }] : [],
      resume: inRun() && game.tick > 0 ? { title: t('app.name'), detail: t('summary.detail', { score: E.scoreOf(game), m: E.meters(game) }) } : null,
      now: Date.now(),
    }));
  }
  function saveRun() {
    if (inRun() && game.tick > 0 && mode !== 'play') kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
  }
  /** Rời trang / ẩn trang: đang chạy thì tạm dừng, lưu lượt dở và tóm tắt. */
  function persist() {
    if (mode === 'play' || mode === 'count') pause(false);
    saveRun();
    writeSummary();
  }
  /** Ghi một lượt đã xong (ngã hoặc bỏ ngang) vào thống kê; trả về có phải kỷ lục mới không. */
  function recordRun(g) {
    const score = E.scoreOf(g);
    const m = E.meters(g);
    const best = score > stats.best;
    stats.played++;
    stats.total += score;
    stats.meters += m;
    stats.coins += g.coins;
    if (best) stats.best = score;
    if (m > stats.far) stats.far = m;
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
    death = null;
    parts = [];
    shake = 0;
    flash = 0;
    lastMilestone = 0;
    releaseAll();
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

  /** Bấm đầu tiên ở vạch xuất phát: bắt đầu chạy (phím / chạm này không tính là nhảy). */
  function beginRun() {
    if (mode !== 'wait' || kit.modal.current()) return;
    mode = 'play';
    acc = 0;
    prev = null;
    input.suppress = true;
    input.latchJump = input.latchDown = false;
    setHint(false);
    renderHud();
  }

  function onCrash() {
    mode = 'over';
    crashAt = performance.now();
    overShown = false;
    const g = game;
    const score = E.scoreOf(g);
    const best = recordRun(g);
    lastRun = { score, best, m: E.meters(g), coins: g.coins, cause: g.cause };
    kit.store.remove(keys.save);
    writeSummary();
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    kit.sfx('error');
    vibrate([40, 40, 90]);
    releaseAll();
    const pit = g.cause === 'pit';
    death = { x: g.x, y: g.y, vx: pit ? 0.25 * E.speedAt(g.x) : -120, vy: pit ? Math.max(g.vy, 100) : -420, rot: 0, spin: pit ? 2 : -7, t: 0, pit, floor: g.y };
    if (!pit && !g.grounded) death.floor = surfaceBelow(E.chunksIn(g.seed, g.x - 60, g.x + 60), g.x - 30);
    if (death.floor === Infinity) death.floor = E.GROUND_Y;
    if (!reduced) {
      shake = 1;
      flash = 0.8;
    }
    setHint(false);
    renderHud();
    announce(t('say.over', { score, m: lastRun.m }));
  }

  function showOver() {
    overShown = true;
    const r = lastRun;
    $('over-cause').textContent = t('over.' + r.cause);
    $('over-score').textContent = String(r.score);
    $('over-distance').textContent = t('over.m', { m: r.m });
    $('over-coins').textContent = String(r.coins);
    $('over-best').textContent = String(stats.best);
    $('over-new').hidden = !r.best;
    showOverlay('over');
    if (r.best && r.score > 0) {
      kit.sfx('win');
      kit.confetti();
    } else {
      kit.sfx('lose');
    }
    // Chặn phím bấm nhầm "Chơi lại" ngay khi vừa ngã
    overReadyAt = performance.now() + 500;
    setTimeout(() => {
      if (mode === 'over' && !kit.modal.current()) $('btn-again').focus({ preventScroll: true });
    }, 500);
  }

  function pause(focus) {
    if (!(mode === 'play' || mode === 'count' || (mode === 'wait' && game.tick > 0))) return;
    mode = 'paused';
    releaseAll();
    $('pause-sub').textContent = t('pause.sub', { score: E.scoreOf(game), m: E.meters(game) });
    setHint(false);
    showOverlay('pause');
    renderHud();
    saveRun();
    if (focus) $('btn-resume').focus({ preventScroll: true });
  }

  /** Chơi tiếp: đếm 3-2-1 (thấy trước đường) rồi mới chạy. */
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'count';
    countLeft = COUNT_S;
    prev = null;
    acc = 0;
    showOverlay(null);
    renderHud();
    focusCanvas();
  }

  function togglePause() {
    if (mode === 'paused') resume();
    else pause(true);
  }

  /** Ván mới: lượt đã có điểm / đã chạy ≥ 1 giây thì hỏi trước (điểm hiện có sẽ được ghi). */
  function requestNew() {
    if (kit.modal.current()) return;
    if (counts()) {
      pause(false);
      $('confirm-text').textContent = t('confirm.text', { score: E.scoreOf(game) });
      kit.modal.open('modal-confirm');
    } else {
      start();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (counts()) {
      recordRun(game);
      kit.sdk.end({ mode: MODE, won: false, score: E.scoreOf(game), assisted: false });
    }
    start();
  }

  /* ---------------- Sự kiện ---------------- */
  $('btn-start').addEventListener('click', start);
  $('btn-again').addEventListener('click', () => {
    if (performance.now() >= overReadyAt) start();
  });
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
    $('stats-far').textContent = t('stats.m', { m: f(stats.far) });
    $('stats-avg').textContent = stats.played ? f(Math.round(stats.total / stats.played)) : '0';
    $('stats-meters').textContent = t('stats.m', { m: f(stats.meters) });
    $('stats-coins').textContent = f(stats.coins);
  });

  // Chạm / nhấp: nửa phải nhảy (giữ = cao hơn), nửa trái trượt (giữ); trừ nút và thẻ lớp phủ
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.overlay-card') || e.target.closest('button') || kit.modal.current()) return;
    if (mode === 'idle') {
      e.preventDefault();
      start();
      return;
    }
    if (mode === 'wait') {
      e.preventDefault();
      focusCanvas();
      beginRun();
      pointers.set(e.pointerId, 'none');
    } else if (mode === 'play' || mode === 'count') {
      e.preventDefault();
      focusCanvas();
      const r = stage.getBoundingClientRect();
      const kind = e.clientX < r.left + r.width / 2 ? 'down' : 'jump';
      pointers.set(e.pointerId, kind);
      if (mode === 'play') {
        if (kind === 'jump') {
          input.suppress = false;
          input.latchJump = true;
        } else input.latchDown = true;
      }
      paintPads();
    } else return;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
  });
  const pointerUp = (e) => {
    if (pointers.delete(e.pointerId)) paintPads();
  };
  stage.addEventListener('pointerup', pointerUp);
  stage.addEventListener('pointercancel', pointerUp);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  const JUMP_KEYS = [' ', 'ArrowUp', 'w', 'W'];
  const DOWN_KEYS = ['ArrowDown', 's', 'S'];
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onControl = e.target && e.target.closest && e.target.closest('button, input, a, select');
    if (JUMP_KEYS.indexOf(k) >= 0 || k === 'Enter') {
      if (onControl && (k === ' ' || k === 'Enter')) {
        // Nút tự bấm bằng Space / Enter; riêng "Chơi lại" chặn trong lúc vừa ngã
        if (e.target.id === 'btn-again' && performance.now() < overReadyAt) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.repeat) return; // giữ phím không lặp
      if (mode === 'idle') start();
      else if (mode === 'wait') {
        beginRun();
        if (k !== 'Enter') input.keyJump = true; // đang giữ nhưng không tính là nhảy tới khi buông
      } else if (mode === 'paused') resume();
      else if (mode === 'over') {
        if (overShown && performance.now() >= overReadyAt) start();
      } else if (k !== 'Enter') {
        input.keyJump = true;
        input.suppress = false;
        if (mode === 'play') input.latchJump = true;
      }
      return;
    }
    if (DOWN_KEYS.indexOf(k) >= 0) {
      e.preventDefault();
      if (mode === 'wait') beginRun();
      if (mode === 'play' || mode === 'count') {
        input.keyDown = true;
        if (mode === 'play' && !e.repeat) input.latchDown = true;
      }
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (mode === 'play' || mode === 'paused' || mode === 'count' || (mode === 'wait' && game.tick > 0)) {
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
  document.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.indexOf(e.key) >= 0) {
      input.keyJump = false;
      input.suppress = false;
    } else if (DOWN_KEYS.indexOf(e.key) >= 0) input.keyDown = false;
  });
  // Mất focus (chuyển cửa sổ): nhả mọi phím, đang chạy thì tạm dừng
  window.addEventListener('blur', () => {
    releaseAll();
    if (mode === 'play' || mode === 'count') pause(false);
  });

  // Mở hộp thoại thì tạm dừng; đóng hướng dẫn lần đầu thì ghi guideSeen
  const watcher = new MutationObserver(() => {
    if (kit.modal.current()) {
      if (mode === 'play' || mode === 'count') pause(false);
    } else if (!settings.guideSeen && $('modal-help').hidden) {
      kit.settings.set({ guideSeen: true });
    }
  });
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại lượt dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.phase === 'run' && restored.tick > 0) {
    game = restored;
    mode = 'paused';
    lastMilestone = Math.floor(E.meters(game) / MILESTONE_M);
    $('pause-sub').textContent = t('pause.sub', { score: E.scoreOf(game), m: E.meters(game) });
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
