/* =====================================================================
 * Cột Ngọc - Giao diện + vòng lặp + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng <canvas>: requestAnimationFrame lấy dt, engine chạy theo bước cố định 1/60 s (E.ticksFor);
 *     khối đang rơi vẽ lệch theo phần bước đã trôi nên rơi mượt; nhân devicePixelRatio, tự co theo khung
 *   - Ngọc vẽ sẵn thành ảnh nhỏ theo cỡ ô (mỗi màu một hình: tròn, tam giác, thoi, vuông, lục giác, sao)
 *   - Điều khiển: phím ← → (giữ: DAS 10 bước rồi ARR 2 bước, đếm trong vòng lặp bước cố định), ↑ / X / W xoay,
 *     Z xoay ngược, ↓ / S rơi nhanh (giữ), Space thả thẳng; cảm ứng: nút lớn dưới giếng + chạm giếng để xoay
 *   - Chế độ: 'idle' (màn chờ, nút #btn-start) → 'play' ⇄ 'paused' → 'over' (ngọc tối dần rồi hiện kết quả)
 *   - Báo ván cho cổng: bấm Chơi / Chơi lại → kit.sdk.start('classic'); mở lại ván lưu dở → start('classic', true);
 *     hết ván → kit.sdk.end({ won: false, score }); bỏ ván đã có điểm hoặc đã chơi ≥ 1 giây → cũng gửi
 *     won: false với điểm hiện có; chưa đủ thì không gửi gì
 *   - Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; rời trang giữa ván thì lưu ván (mở lại ở trạng thái tạm dừng)
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const DAS_TICKS = 10; // giữ ← → bao lâu thì bắt đầu tự trượt (≈ 167 ms)
  const ARR_TICKS = 2; // rồi mỗi 2 bước dịch một ô (30 ô / giây)
  const OVER_MS = 900;

  const kit = PNKit.init({
    gameId: 'cotngoc',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, ghost: true, guideSeen: false },
    onSetting(key) {
      if (key === 'theme') requestAnimationFrame(readPalette);
      if (key === 'ghost') draw();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = kit.settings.get();

  const app = document.querySelector('.app');
  const stage = $('stage');
  const board = $('board');
  const side = $('side');
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const nextCanvas = $('next-canvas');
  const nctx = nextCanvas.getContext('2d');
  const pauseBtn = $('btn-pause');
  const overlays = { start: $('overlay-start'), pause: $('overlay-pause'), over: $('overlay-over') };

  /* ---------------- Thống kê ---------------- */
  function readStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    return { played: n(raw.played), best: n(raw.best), total: n(raw.total), jewels: n(raw.jewels), chain: n(raw.chain), level: n(raw.level) };
  }
  const stats = readStats();

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let mode = 'idle';
  let acc = 0; // ms dư chưa đủ một bước
  let lastT = null;
  let animT = 0; // giây, cho hiệu ứng trang trí
  let overAt = 0;
  let overShown = false;
  let overReadyAt = 0;
  let lastRun = null;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { reduced = e.matches; });
  const landscape = matchMedia('(max-height: 520px) and (min-aspect-ratio: 1/1)');

  const randomSeed = () => (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
  const inRun = () => !!game && game.phase !== 'over' && (mode === 'play' || mode === 'paused');
  /** Ván "đã chơi": có điểm hoặc đã chơi ít nhất 1 giây → bỏ ngang thì vẫn gửi kết quả. */
  const counts = () => inRun() && (game.score > 0 || game.tick >= E.HZ);

  /* ---------------- Ngọc: màu + hình ---------------- */
  // [sáng, giữa, tối] cho từng màu 1..6
  const GEM = {
    1: ['#ff9aa0', '#e5484d', '#8f1625'], // hồng ngọc: tròn
    2: ['#ffc98a', '#f08c2e', '#9a4a0b'], // hổ phách: tam giác
    3: ['#fff2a8', '#f2c230', '#8f6a05'], // hoàng ngọc: thoi
    4: ['#8ef0b8', '#25b468', '#0d6b39'], // lục bảo: vuông vát góc
    5: ['#9cc4ff', '#3b7ff0', '#173f9e'], // lam ngọc: lục giác
    6: ['#e2bcff', '#a455f0', '#5b1c99'], // thạch anh tím: sao
  };

  /** Đường viền hình ngọc màu v, tâm (0,0), bán kính r. */
  function gemPath(c, v, r) {
    c.beginPath();
    if (v === 1) {
      c.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    } else if (v === 2) {
      c.moveTo(0, -r);
      c.lineTo(r * 0.98, r * 0.78);
      c.lineTo(-r * 0.98, r * 0.78);
      c.closePath();
    } else if (v === 3) {
      c.moveTo(0, -r);
      c.lineTo(r * 0.82, 0);
      c.lineTo(0, r);
      c.lineTo(-r * 0.82, 0);
      c.closePath();
    } else if (v === 4) {
      const a = r * 0.82;
      const k = r * 0.3;
      c.moveTo(-a + k, -a);
      c.lineTo(a - k, -a);
      c.lineTo(a, -a + k);
      c.lineTo(a, a - k);
      c.lineTo(a - k, a);
      c.lineTo(-a + k, a);
      c.lineTo(-a, a - k);
      c.lineTo(-a, -a + k);
      c.closePath();
    } else if (v === 5) {
      for (let i = 0; i < 6; i++) {
        const ang = Math.PI / 6 + (i * Math.PI) / 3;
        const x = Math.cos(ang) * r * 0.95;
        const y = Math.sin(ang) * r * 0.95;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
    } else {
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.48 : r;
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * rr + r * 0.06;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
    }
  }

  /** Vẽ một viên ngọc màu v vào ô vuông cạnh s, góc trên trái (x, y). */
  function paintGem(c, v, x, y, s) {
    const [hi, mid, lo] = GEM[v];
    const r = s * 0.43;
    c.save();
    c.translate(x + s / 2, y + s / 2);
    // Bóng đổ nhẹ
    c.save();
    c.translate(0, s * 0.04);
    gemPath(c, v, r);
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    c.fill();
    c.restore();
    const g = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.15);
    g.addColorStop(0, hi);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, lo);
    gemPath(c, v, r);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(1, s * 0.045);
    c.strokeStyle = lo;
    c.lineJoin = 'round';
    c.stroke();
    // Mặt cắt bên trong (cùng hình, nhỏ hơn) + điểm sáng
    gemPath(c, v, r * 0.52);
    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    c.fill();
    c.beginPath();
    c.ellipse(-r * 0.32, -r * 0.4, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255, 255, 255, 0.75)';
    c.fill();
    c.restore();
  }

  /** Ảnh ngọc vẽ sẵn theo (màu, cỡ px thật). */
  const sprites = new Map();
  function sprite(v, px) {
    const key = v + ':' + px;
    let cv = sprites.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = px;
      cv.height = px;
      paintGem(cv.getContext('2d'), v, 0, 0, px);
      sprites.set(key, cv);
    }
    return cv;
  }

  /** Viên ngọc ma thuật: cầu vồng xoay + ngôi sao trắng (giảm chuyển động thì đứng yên). */
  function paintMagic(c, x, y, s, phase) {
    const r = s * 0.43;
    c.save();
    c.translate(x + s / 2, y + s / 2);
    let fill;
    if (c.createConicGradient) {
      fill = c.createConicGradient(phase, 0, 0);
      ['#ff5b6e', '#ffb340', '#ffe35a', '#4fe08a', '#4aa8ff', '#b46bff', '#ff5b6e'].forEach((col, i) => fill.addColorStop(i / 6, col));
    } else {
      fill = c.createLinearGradient(-r, -r, r, r);
      ['#ff5b6e', '#ffe35a', '#4fe08a', '#4aa8ff', '#b46bff'].forEach((col, i) => fill.addColorStop(i / 4, col));
    }
    c.beginPath();
    c.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = Math.max(1.5, s * 0.06);
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.rotate(reduced ? 0 : phase * 0.5);
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.18 : r * 0.55;
      c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
    c.restore();
  }

  /* ---------------- Bảng màu (token CSS, đổi theo giao diện) ---------------- */
  let pal = null;
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    pal = { top: v('--well-top'), bottom: v('--well-bottom'), line: v('--well-line'), danger: v('--well-danger') };
    draw();
  }
  window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(readPalette));

  /* ---------------- Khung vẽ ---------------- */
  let dpr = 1;
  let cell = 20; // px CSS mỗi ô
  let nextCell = 20;

  function layout() {
    const sh = stage.clientHeight;
    if (!sh) return;
    const sideW = side.offsetWidth || 70;
    const availW = landscape.matches ? Math.floor(app.clientWidth * 0.46) : stage.clientWidth;
    const c = Math.max(8, Math.floor(Math.min((availW - sideW - 10) / E.COLS, sh / E.ROWS)));
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const changed = c !== cell || canvas.width !== Math.round(c * E.COLS * dpr);
    cell = c;
    board.style.width = cell * E.COLS + 'px';
    board.style.height = cell * E.ROWS + 'px';
    canvas.width = Math.round(cell * E.COLS * dpr);
    canvas.height = Math.round(cell * E.ROWS * dpr);
    nextCell = Math.max(10, Math.min(cell, sideW - 18, 44));
    nextCanvas.style.width = nextCell + 'px';
    nextCanvas.style.height = nextCell * 3 + 'px';
    nextCanvas.width = Math.round(nextCell * dpr);
    nextCanvas.height = Math.round(nextCell * 3 * dpr);
    if (changed) sprites.clear();
    draw();
  }
  new ResizeObserver(layout).observe(stage);
  landscape.addEventListener('change', layout);

  /* ---------------- Hiệu ứng trang trí ---------------- */
  let sparks = [];
  let flash = 0;
  function burst(cells, magic) {
    flash = magic ? 1 : 0.5;
    if (reduced) return;
    cells.forEach((i) => {
      const x = (i % E.COLS) + 0.5;
      const y = Math.floor(i / E.COLS) - E.HIDDEN + 0.5;
      const v = game.grid[i];
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1, col: v ? GEM[v][0] : '#ffffff' });
      }
    });
    if (sparks.length > 300) sparks = sparks.slice(-300);
  }
  function updateFx(dt) {
    flash = Math.max(0, flash - dt * 3);
    sparks.forEach((p) => {
      p.vy += 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.6;
    });
    sparks = sparks.filter((p) => p.life > 0);
  }

  /* ---------------- Vẽ ---------------- */
  function drawWell(W, H) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.top);
    bg.addColorStop(1, pal.bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal.line;
    for (let x = 1; x < E.COLS; x += 2) ctx.fillRect(x * cell, 0, cell, H);
    // Cột xuất hiện: vạch mờ ở miệng giếng
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(E.SPAWN_COL * cell, 0, cell, cell * 0.12);
    // Nguy hiểm: cột xuất hiện gần đầy
    let h = E.TOTAL;
    for (let y = E.HIDDEN; y < E.TOTAL; y++) if (game && game.grid[E.idx(E.SPAWN_COL, y)]) { h = y; break; }
    if (game && h - E.HIDDEN <= 4 && mode !== 'idle') {
      const k = reduced ? 1 : 0.65 + 0.35 * Math.sin(animT * 6);
      const dg = ctx.createLinearGradient(0, 0, 0, cell * 4);
      dg.addColorStop(0, pal.danger);
      dg.addColorStop(1, 'rgba(255, 82, 82, 0)');
      ctx.globalAlpha = k;
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, W, cell * 4);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    if (!pal || !game || !cell) return;
    const W = cell * E.COLS;
    const H = cell * E.ROWS;
    const px = Math.round(cell * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWell(W, H);
    const g = game;
    const marked = g.phase === 'clear' ? new Set(g.marked) : null;
    // Tiến độ đợt xóa (0 → 1), nội suy giữa hai bước
    const prog = marked ? Math.min(1, (E.CLEAR_TICKS - g.clearT + (mode === 'play' ? acc / E.TICK_MS : 0)) / E.CLEAR_TICKS) : 0;
    for (let y = E.HIDDEN; y < E.TOTAL; y++) {
      for (let x = 0; x < E.COLS; x++) {
        const i = E.idx(x, y);
        const v = g.grid[i];
        if (!v) continue;
        const dx = x * cell;
        const dy = (y - E.HIDDEN) * cell;
        if (marked && marked.has(i)) {
          // Viên sắp xóa: nhấp nháy rồi co lại
          const blink = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(prog * Math.PI * 6);
          const s = reduced ? 1 : Math.max(0.05, 1 - Math.max(0, prog - 0.45) / 0.55);
          ctx.save();
          ctx.translate(dx + cell / 2, dy + cell / 2);
          ctx.scale(s, s);
          ctx.drawImage(sprite(v, px), -cell / 2, -cell / 2, cell, cell);
          ctx.globalAlpha = 0.25 + 0.55 * blink;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, cell * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.drawImage(sprite(v, px), dx, dy, cell, cell);
        }
      }
    }
    const p = g.piece;
    if (p && g.phase === 'fall' && mode !== 'idle') {
      const magic = E.isMagic(p.c);
      // Bóng chỗ đáp
      if (settings.ghost) {
        const gy = E.ghostY(g);
        if (gy > p.y + 0) {
          ctx.globalAlpha = 0.26;
          for (let k = 0; k < 3; k++) {
            const yy = gy - 2 + k - E.HIDDEN;
            if (yy < 0) continue;
            if (magic) paintMagic(ctx, p.x * cell, yy * cell, cell, 0);
            else ctx.drawImage(sprite(p.c[k], px), p.x * cell, yy * cell, cell, cell);
          }
          ctx.globalAlpha = 1;
        }
      }
      // Khối đang rơi: lệch xuống theo phần bước đã trôi (rơi mượt), chạm đáy thì đứng yên
      let off = 0;
      if (E.fits(g.grid, p.x, p.y + 1) && mode === 'play') {
        const iv = soft() ? Math.min(E.SOFT_TICKS, E.gravityFor(g.level)) : E.gravityFor(g.level);
        off = Math.min(0.95, (g.grav + acc / E.TICK_MS) / iv);
      }
      for (let k = 0; k < 3; k++) {
        const yy = p.y - 2 + k - E.HIDDEN + off;
        if (yy <= -1) continue;
        if (magic) paintMagic(ctx, p.x * cell, yy * cell, cell, reduced ? 0 : animT * 3 + k);
        else ctx.drawImage(sprite(p.c[k], px), p.x * cell, yy * cell, cell, cell);
      }
      // Viền sáng quanh khối đang rơi
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      const top = Math.max(0, (p.y - 2 - E.HIDDEN + off) * cell);
      const bot = (p.y + 1 - E.HIDDEN + off) * cell;
      if (bot > 0) ctx.strokeRect(p.x * cell + 1, top + 1, cell - 2, bot - top - 2);
    }
    sparks.forEach((s) => {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.col;
      ctx.fillRect(s.x * cell - 2, s.y * cell - 2, 4, 4);
    });
    ctx.globalAlpha = 1;
    if (flash > 0 && !reduced) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flash * 0.18).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (mode === 'over') {
      const k = reduced ? 1 : Math.min(1, (performance.now() - overAt) / OVER_MS);
      ctx.fillStyle = 'rgba(6, 4, 18, ' + (0.55 * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    drawNext();
  }

  function drawNext() {
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nctx.clearRect(0, 0, nextCell, nextCell * 3);
    if (!game) return;
    const px = Math.round(nextCell * dpr);
    for (let k = 0; k < 3; k++) {
      if (E.isMagic(game.next)) paintMagic(nctx, 0, k * nextCell, nextCell, reduced ? 0 : animT * 3 + k);
      else nctx.drawImage(sprite(game.next[k], px), 0, k * nextCell, nextCell, nextCell);
    }
  }

  /** Hàng ngọc mẫu trong hộp Cách chơi: 6 màu + ngọc ma thuật. */
  function drawLegend() {
    const cv = $('legend');
    const w = cv.clientWidth;
    if (!w) return;
    const s = Math.min(40, Math.floor(w / 7.5));
    const r = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(w * r);
    cv.height = Math.round(s * r);
    cv.style.height = s + 'px';
    const c = cv.getContext('2d');
    c.setTransform(r, 0, 0, r, 0, 0);
    const gap = (w - s * 7) / 6;
    for (let v = 1; v <= 6; v++) paintGem(c, v, (v - 1) * (s + gap), 0, s);
    paintMagic(c, 6 * (s + gap), 0, s, 0.6);
  }

  /* ---------------- HUD ---------------- */
  let shownScore = -1;
  function renderHud() {
    const s = game ? game.score : 0;
    if (s !== shownScore) {
      $('score').textContent = kit.i18n.fmtNumber(s);
      if (shownScore >= 0 && s > shownScore && !reduced) {
        const el = $('score');
        el.classList.remove('bump');
        void el.offsetWidth; // chạy lại hiệu ứng
        el.classList.add('bump');
      }
      shownScore = s;
    }
    $('level').textContent = String(game ? game.level : 1);
    $('best').textContent = kit.i18n.fmtNumber(stats.best);
    $('jewels').textContent = kit.i18n.fmtNumber(game ? game.jewels : 0);
    $('chain').textContent = String(game ? game.maxChain : 0);
    const canPause = mode === 'play' || mode === 'paused';
    pauseBtn.disabled = !canPause;
    pauseBtn.dataset.state = mode === 'paused' ? 'paused' : 'running';
    const label = mode === 'paused' ? t('btn.resume') : t('btn.pause');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = t('btn.keySuffix', { label });
  }

  let popTimer = 0;
  function showPop(text, kind) {
    const el = $('pop');
    el.textContent = text;
    el.dataset.kind = kind;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(popTimer);
    popTimer = setTimeout(() => el.classList.remove('show'), 1100);
  }

  function showOverlay(name) {
    Object.keys(overlays).forEach((k) => { overlays[k].hidden = k !== name; });
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

  /* ---------------- Sự kiện từ engine → âm thanh / hiệu ứng ---------------- */
  function handleFx(fx) {
    let hud = false;
    for (const f of fx) {
      if (f.type === 'move') kit.sfx('move', { volume: 0.3 });
      else if (f.type === 'rotate') kit.sfx('flip', { volume: 0.45 });
      else if (f.type === 'hard') {
        kit.sfx('drop', { volume: 0.7 });
        hud = true;
      } else if (f.type === 'lock') kit.sfx('place', { volume: 0.5 });
      else if (f.type === 'magic') {
        kit.sfx('pop');
        showPop(t('pop.magic'), 'magic');
      } else if (f.type === 'clear') {
        kit.sfx(f.chain >= 2 ? 'combo' : 'clear', f.chain >= 2 ? { pitch: 1 + Math.min(0.6, (f.chain - 2) * 0.12) } : undefined);
        burst(game.marked, f.magic);
        if (f.chain >= 2) {
          showPop(t('pop.chain', { n: f.chain }), 'chain');
          vibrate(25 + f.chain * 10);
          announce(t('say.chain', { n: f.chain, points: f.points }));
        }
        hud = true;
      } else if (f.type === 'level') {
        setTimeout(() => {
          kit.sfx('levelup');
          showPop(t('pop.level', { level: f.level }), 'level');
          announce(t('say.level', { level: f.level }));
        }, 450);
        hud = true;
      } else if (f.type === 'over') onOver();
    }
    if (hud || soft()) renderHud();
  }

  /* ---------------- Điều khiển ----------------
   * Giữ ← → (phím, nút): dịch 1 ô ngay, sau DAS_TICKS bước thì cứ ARR_TICKS bước dịch một ô.
   * Nhiều nguồn cùng giữ: hướng nhấn sau cùng thắng. Bộ đếm chạy theo bước cố định (công bằng mọi máy). */
  const held = []; // [{ src, dir }]
  let das = 0;
  const softSrc = new Set();
  const soft = () => softSrc.size > 0;
  const curDir = () => (held.length ? held[held.length - 1].dir : 0);
  const canAct = () => mode === 'play' && !kit.modal.current() && game && game.phase === 'fall';

  function doAct(name) {
    if (!canAct()) return;
    const before = game;
    game = E.act(game, name);
    if (game !== before) {
      handleFx(game.fx);
      game.fx = [];
      draw();
    }
  }

  function pressDir(src, dir) {
    releaseDir(src);
    held.push({ src, dir });
    das = 0;
    doAct(dir < 0 ? 'left' : 'right');
  }
  function releaseDir(src) {
    const before = curDir();
    for (let i = held.length - 1; i >= 0; i--) if (held[i].src === src) held.splice(i, 1);
    if (curDir() !== before) das = 0;
  }
  function releaseAll() {
    held.length = 0;
    softSrc.clear();
    das = 0;
    document.querySelectorAll('.pad-btn.is-down').forEach((b) => b.classList.remove('is-down'));
  }

  /** Mỗi bước cố định: tự trượt khi đang giữ ← →. */
  function autoShift() {
    const d = curDir();
    if (!d) return;
    das++;
    if (das >= DAS_TICKS && (das - DAS_TICKS) % ARR_TICKS === 0 && game.phase === 'fall') {
      const before = game;
      game = E.move(game, d);
      if (game !== before) {
        handleFx(game.fx);
        game.fx = [];
      }
    }
  }

  /* ---------------- Vòng lặp ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const ms = lastT == null ? 0 : now - lastT;
    lastT = now;
    const dt = Math.min(ms, E.MAX_FRAME_MS) / 1000;
    animT += dt;
    if (mode === 'play' && !kit.modal.current()) {
      const r = E.ticksFor(acc, ms);
      acc = r.acc;
      for (let i = 0; i < r.ticks && mode === 'play'; i++) {
        autoShift();
        const before = game.score;
        game = E.step(game, soft());
        if (game.fx.length) handleFx(game.fx);
        else if (game.score !== before) renderHud();
      }
    }
    if (mode === 'over' && !overShown && now - overAt > (reduced ? 300 : OVER_MS)) showOver();
    updateFx(dt);
    if (mode === 'play' || mode === 'over' || sparks.length || flash > 0 || (game && game.piece && E.isMagic(game.piece.c)) || (game && E.isMagic(game.next))) draw();
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { score: kit.i18n.fmtNumber(stats.best) }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: kit.i18n.fmtNumber(stats.best), label: t('hud.best') }] : [],
      resume: inRun() ? { title: t('app.name'), detail: t('summary.detail', { score: kit.i18n.fmtNumber(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function saveRun() {
    if (inRun() && mode !== 'play') kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
  }
  /** Rời trang / ẩn trang: đang chơi thì tạm dừng, lưu ván dở và tóm tắt. */
  function persist() {
    if (mode === 'play') pause(false);
    saveRun();
    writeSummary();
  }
  /** Ghi một ván đã xong (hết ván hoặc bỏ ngang) vào thống kê; trả về có phải kỷ lục mới không. */
  function recordRun(g) {
    const best = g.score > stats.best;
    stats.played++;
    stats.total += g.score;
    stats.jewels += g.jewels;
    if (g.maxChain > stats.chain) stats.chain = g.maxChain;
    if (g.level > stats.level) stats.level = g.level;
    if (best) stats.best = g.score;
    saveStats();
    return best;
  }

  /* ---------------- Luồng ván ---------------- */
  function start() {
    if (kit.modal.current()) return;
    game = E.newGame(randomSeed());
    acc = 0;
    mode = 'play';
    overShown = false;
    sparks = [];
    flash = 0;
    shownScore = -1;
    releaseAll();
    showOverlay(null);
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    kit.sfx('start');
    renderHud();
    writeSummary();
    focusCanvas();
    draw();
  }

  function onOver() {
    if (mode === 'over') return;
    mode = 'over';
    overAt = performance.now();
    overShown = false;
    releaseAll();
    const g = game;
    const best = recordRun(g);
    lastRun = { score: g.score, best, cause: g.cause, level: g.level, jewels: g.jewels, chain: g.maxChain };
    kit.store.remove(keys.save);
    writeSummary();
    kit.sdk.end({ mode: MODE, won: false, score: g.score, assisted: false });
    kit.sfx('lose');
    vibrate([40, 40, 90]);
    renderHud();
    announce(t('say.over', { score: g.score }));
  }

  function showOver() {
    overShown = true;
    const r = lastRun;
    const f = kit.i18n.fmtNumber;
    $('over-cause').textContent = t('over.' + (r.cause || 'blocked'));
    $('over-score').textContent = f(r.score);
    $('over-level').textContent = String(r.level);
    $('over-jewels').textContent = f(r.jewels);
    $('over-chain').textContent = String(r.chain);
    $('over-new').hidden = !r.best;
    showOverlay('over');
    if (r.best && r.score > 0) {
      kit.sfx('win');
      kit.confetti();
    }
    // Chặn Space / Enter bấm nhầm "Chơi lại" ngay khi đang thả ngọc dồn dập
    overReadyAt = performance.now() + 500;
    setTimeout(() => {
      if (mode === 'over' && !kit.modal.current()) $('btn-again').focus({ preventScroll: true });
    }, 500);
    draw();
  }

  function pause(focus) {
    if (mode !== 'play') return;
    mode = 'paused';
    releaseAll();
    $('pause-sub').textContent = t('pause.sub', { score: kit.i18n.fmtNumber(game.score), level: game.level });
    showOverlay('pause');
    renderHud();
    saveRun();
    if (focus) $('btn-resume').focus({ preventScroll: true });
  }

  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'play';
    acc = 0;
    showOverlay(null);
    renderHud();
    focusCanvas();
  }

  function togglePause() {
    if (mode === 'paused') resume();
    else pause(true);
  }

  /** Ván mới: ván đã có điểm / đã chơi ≥ 1 giây thì hỏi trước (điểm hiện có sẽ được ghi). */
  function requestNew() {
    if (kit.modal.current()) return;
    if (counts()) {
      pause(false);
      $('confirm-text').textContent = t('confirm.text', { score: kit.i18n.fmtNumber(game.score) });
      kit.modal.open('modal-confirm');
    } else {
      start();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (counts()) {
      recordRun(game);
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
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
    if (mode === 'play') focusCanvas();
  });
  $('btn-stats').addEventListener('click', () => {
    const f = kit.i18n.fmtNumber;
    $('stats-played').textContent = f(stats.played);
    $('stats-best').textContent = f(stats.best);
    $('stats-jewels').textContent = f(stats.jewels);
    $('stats-chain').textContent = f(stats.chain);
    $('stats-level').textContent = f(stats.level);
    $('stats-avg').textContent = f(stats.played ? Math.round(stats.total / stats.played) : 0);
  });

  // Chạm / nhấp vào giếng: xoay (màn chờ thì bắt đầu)
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (kit.modal.current()) return;
    if (mode === 'play') {
      e.preventDefault();
      focusCanvas();
      doAct('rotate');
    } else if (mode === 'idle') {
      e.preventDefault();
      start();
    }
  });

  // Nút cảm ứng: bấm bằng pointerdown (không chờ click) cho nhạy; giữ ◀ ▶ để trượt, giữ ▼ để rơi nhanh
  const pad = $('pad');
  pad.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.pad-btn');
    if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try {
      b.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
    b.classList.add('is-down');
    const src = 'pad' + e.pointerId;
    b.dataset.src = src;
    const a = b.dataset.act;
    if (mode === 'paused' && !kit.modal.current()) return;
    if (a === 'left') pressDir(src, -1);
    else if (a === 'right') pressDir(src, 1);
    else if (a === 'soft') softSrc.add(src);
    else doAct(a);
  });
  function padRelease(e) {
    const b = e.target.closest && e.target.closest('.pad-btn');
    if (!b) return;
    b.classList.remove('is-down');
    const src = b.dataset.src;
    if (!src) return;
    releaseDir(src);
    softSrc.delete(src);
    delete b.dataset.src;
  }
  pad.addEventListener('pointerup', padRelease);
  pad.addEventListener('pointercancel', padRelease);
  pad.addEventListener('lostpointercapture', padRelease);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  pad.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const low = k.length === 1 ? k.toLowerCase() : k;
    const onControl = e.target && e.target.closest && e.target.closest('button, input, a, select');
    if (k === ' ' || k === 'Enter') {
      if (onControl) {
        // Nút tự bấm bằng Space / Enter; riêng "Chơi lại" chặn trong lúc vừa hết ván
        if (e.target.id === 'btn-again' && performance.now() < overReadyAt) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'idle') start();
      else if (mode === 'paused') resume();
      else if (mode === 'over') {
        if (overShown && performance.now() >= overReadyAt) start();
      } else if (k === ' ') doAct('hard');
      return;
    }
    if (low === 'p' || k === 'Escape') {
      if (mode === 'play' || mode === 'paused') {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (low === 'n') {
      e.preventDefault();
      requestNew();
      return;
    }
    let handled = true;
    if (k === 'ArrowLeft' || low === 'a') {
      if (!e.repeat) pressDir('key-l', -1);
    } else if (k === 'ArrowRight' || low === 'd') {
      if (!e.repeat) pressDir('key-r', 1);
    } else if (k === 'ArrowDown' || low === 's') {
      softSrc.add('key');
    } else if (k === 'ArrowUp' || low === 'x' || low === 'w') {
      if (!e.repeat) doAct('rotate');
    } else if (low === 'z') {
      if (!e.repeat) doAct('rotateBack');
    } else handled = false;
    if (handled) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key;
    const low = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'ArrowLeft' || low === 'a') releaseDir('key-l');
    else if (k === 'ArrowRight' || low === 'd') releaseDir('key-r');
    else if (k === 'ArrowDown' || low === 's') softSrc.delete('key');
  });
  window.addEventListener('blur', releaseAll);

  // Mở hộp thoại thì tạm dừng; đóng hướng dẫn lần đầu thì ghi guideSeen; mở hướng dẫn thì vẽ hàng ngọc mẫu
  const watcher = new MutationObserver(() => {
    if (kit.modal.current()) {
      if (mode === 'play') pause(false);
      if (!$('modal-help').hidden) requestAnimationFrame(drawLegend);
    } else if (!settings.guideSeen && $('modal-help').hidden) {
      kit.settings.set({ guideSeen: true });
    }
  });
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.phase !== 'over') {
    game = restored;
    mode = 'paused';
    $('pause-sub').textContent = t('pause.sub', { score: kit.i18n.fmtNumber(game.score), level: game.level });
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
