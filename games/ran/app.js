/* =====================================================================
 * Rắn Săn Mồi - Logic giao diện (cần i18n.js và engine.js nạp trước)
 *   - Vẽ bàn chơi trên <canvas> theo DPR, rắn trượt mượt giữa hai tick (nội suy)
 *   - Bàn phím (mũi tên, WASD, Space/P), vuốt ở bất kỳ đâu trên vùng bàn chơi, nút điều hướng
 *   - Màn hình bắt đầu, tạm dừng (tự dừng khi ẩn trang), lớp phủ thua
 *   - Lưu ván, cài đặt, thống kê vào localStorage; ghi tóm tắt cho cổng PlayNine
 * ===================================================================== */
(function () {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'ran' });

  const APP_VERSION = '1.0.1';
  const G = window.GameRan;
  const t = I18N.t;

  // Mọi khóa localStorage đều có tiền tố playnine-ran-
  const KEYS = {
    settings: 'playnine-ran-settings-v1',
    game: 'playnine-ran-game-v1',
    stats: 'playnine-ran-stats-v1',
    summary: 'playnine-ran-summary-v1',
  };
  const SWIPE_MIN = 18; // px, quãng vuốt tối thiểu để đổi hướng
  const SAVE_EVERY = 4000; // ms, chu kỳ lưu ván + tóm tắt khi đang chơi
  const OVER_DELAY = 650; // ms, chờ trước khi hiện lớp phủ thua (để thấy chỗ va chạm)
  const MAX_CATCHUP = 4; // số tick tối đa xử lý trong một khung hình (khi máy giật)
  const THEMES = ['auto', 'light', 'dark'];
  // Tên chế độ / tốc độ / bản đồ theo ngôn ngữ hiện tại (engine chỉ giữ mã)
  const modeName = (m) => t('mode.' + m);
  const speedName = (s) => t('speed.' + s);
  const mapName = (i) => t('map.' + G.MAPS[i]);

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const fmt = (n) => I18N.fmtNumber(n);
  const bestKey = (mode, speed) => mode + '-' + speed;

  /* ---------------- localStorage (mọi truy cập đều bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  /* ---------------- Cài đặt ---------------- */
  function loadSettings() {
    const s = readJSON(KEYS.settings) || {};
    return {
      theme: THEMES.includes(s.theme) ? s.theme : 'auto',
      mode: G.MODES.includes(s.mode) ? s.mode : 'classic',
      speed: G.SPEEDS.includes(s.speed) ? s.speed : 'normal',
      size: G.SIZES.includes(s.size) ? s.size : G.DEFAULT_SIZE,
      map: Number.isInteger(s.map) && s.map >= 0 && s.map < G.MAPS.length ? s.map : 0,
      accel: s.accel !== false,
      dpad: typeof s.dpad === 'boolean' ? s.dpad : null, // null: theo loại màn hình (cảm ứng thì hiện)
      vibrate: s.vibrate !== false,
    };
  }
  const settings = loadSettings();
  const saveSettings = () => writeJSON(KEYS.settings, settings);
  const dpadOn = () => (settings.dpad === null ? coarsePointer.matches : settings.dpad);

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    const meta = $('theme-color');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f6f2ea';
    readColors();
    drawThumbs();
    draw();
  }

  /* ---------------- Thống kê ---------------- */
  function emptyStats() {
    const best = {};
    G.MODES.forEach((m) => G.SPEEDS.forEach((s) => (best[bestKey(m, s)] = 0)));
    return { played: 0, food: 0, longest: 0, bestFood: 0, bestFoodMode: null, best };
  }
  function loadStats() {
    const s = readJSON(KEYS.stats);
    const out = emptyStats();
    if (!s || typeof s !== 'object') return out;
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    out.played = int(s.played);
    out.food = int(s.food);
    out.longest = int(s.longest);
    out.bestFood = int(s.bestFood);
    out.bestFoodMode = G.MODES.includes(s.bestFoodMode) ? s.bestFoodMode : null;
    if (s.best && typeof s.best === 'object') Object.keys(out.best).forEach((k) => (out.best[k] = int(s.best[k])));
    return out;
  }
  let stats = loadStats();
  const saveStats = () => writeJSON(KEYS.stats, stats);
  const bestOverall = () => Math.max(0, ...Object.values(stats.best));

  /* ---------------- Trạng thái ván ---------------- */
  // phase: 'idle' (màn hình bắt đầu) | 'ready' (chờ lệnh đầu tiên) | 'running' | 'paused' | 'over'
  // counted: ván này đã được tính vào "ván đã chơi" chưa (tính khi rắn bắt đầu chạy)
  let game = null;
  let phase = 'idle';
  let counted = false;
  let prevSnake = null; // thân rắn trước tick gần nhất, để nội suy chuyển động
  let startBest = 0; // điểm cao nhất của chế độ này lúc bắt đầu ván (để báo kỷ lục mới)
  let acc = 0; // ms đã trôi qua kể từ tick gần nhất
  let lastTime = 0;
  let raf = 0;
  let overTimer = 0;

  const unfinished = () => !!game && !game.over && game.ticks > 0;

  function loadGame() {
    const saved = readJSON(KEYS.game);
    const g = saved && G.restore(saved.game);
    if (!g || g.over) return false;
    game = g;
    counted = saved.counted === true;
    return true;
  }
  function saveGame() {
    if (unfinished()) writeJSON(KEYS.game, { game, counted });
    else removeKey(KEYS.game);
  }

  /** Tóm tắt cho thẻ game ở cổng PlayNine. */
  function writeSummary() {
    const best = bestOverall();
    const list = [];
    if (best > 0) list.push({ value: fmt(best), label: t('summary.best') });
    if (stats.longest > 0) list.push({ value: fmt(stats.longest), label: t('summary.longest') });
    if (stats.food > 0) list.push({ value: fmt(stats.food), label: t('summary.food') });

    let note = t('summary.note');
    if (stats.bestFood > 0) {
      note = t('summary.record', { food: fmt(stats.bestFood), mode: modeName(stats.bestFoodMode || 'classic') });
    }

    let resume = null;
    if (unfinished()) {
      const modeTxt = game.mode !== 'classic' ? t('summary.mode', { mode: modeName(game.mode) }) : '';
      resume = {
        title: t('summary.resume'),
        detail: modeTxt + t('summary.detail', { len: fmt(game.snake.length), score: fmt(game.score), n: game.score }),
        pct: null,
      };
    }
    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: 0,
      note,
      stats: list,
      resume,
      daily: null,
    });
  }

  function persist() {
    saveGame();
    saveStats();
    writeSummary();
  }

  /* ---------------- DOM ---------------- */
  const appEl = $('app');
  const boardEl = $('board');
  const boardArea = $('board-area');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = $('score');
  const scoreBox = $('score-box');
  const bestEl = $('best');
  const lengthEl = $('length');
  const pauseBtn = $('btn-pause');
  const overlayPause = $('overlay-pause');
  const overlayOver = $('overlay-over');
  const readyHint = $('ready-hint');
  const dpadEl = $('dpad');
  const mapsEl = $('maps');

  /* ---------------- Màu (đọc từ biến CSS) ---------------- */
  let colors = {};
  let palette = []; // dải màu thân rắn từ đầu (vàng) tới đuôi (xanh)

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return [176, 125, 31];
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function readColors() {
    const cs = getComputedStyle(boardEl);
    const v = (name, def) => cs.getPropertyValue(name).trim() || def;
    colors = {
      bg: v('--board-bg', '#ebe1cc'),
      alt: v('--board-alt', 'rgba(0,0,0,0.05)'),
      obstacle: v('--obstacle', '#7d5e3f'),
      obstacleTop: v('--obstacle-top', '#9c7a55'),
      head: v('--snake-head', '#c48d17'),
      tail: v('--snake-tail', '#5d8c3c'),
      edge: v('--snake-edge', 'rgba(0,0,0,0.3)'),
      eye: v('--snake-eye', '#ffffff'),
      pupil: v('--snake-pupil', '#1d1711'),
      accent: v('--accent', '#b07d1f'),
    };
    const a = hexToRgb(colors.head);
    const b = hexToRgb(colors.tail);
    palette = [];
    for (let i = 0; i < 32; i++) {
      const t = i / 31;
      const c = a.map((x, k) => Math.round(x + (b[k] - x) * t));
      palette.push('rgb(' + c.join(',') + ')');
    }
    bgKey = '';
  }

  /* ---------------- Canvas: kích thước theo DPR ---------------- */
  let dpr = 1;
  let bgLayer = null;
  let bgKey = '';

  function resize() {
    const w = canvas.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.max(1, Math.round(w * dpr));
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
      bgKey = '';
    }
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(x, y, w, h, r);
      return;
    }
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** Lớp nền (ô cờ + chướng ngại) vẽ sẵn, chỉ vẽ lại khi đổi kích thước / bản đồ / giao diện. */
  function background() {
    const key = canvas.width + '|' + game.size + '|' + game.obstacles.join(',') + '|' + colors.bg;
    if (bgLayer && key === bgKey) return bgLayer;
    bgKey = key;
    bgLayer = bgLayer || document.createElement('canvas');
    bgLayer.width = canvas.width;
    bgLayer.height = canvas.height;
    const c = bgLayer.getContext('2d');
    paintBoard(c, canvas.width, game.size, game.obstacles);
    return bgLayer;
  }

  /** Vẽ nền bàn chơi + chướng ngại lên context c (đơn vị pixel, cạnh W). Dùng cả cho ảnh bản đồ. */
  function paintBoard(c, W, n, obstacles, simple) {
    const s = W / n;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, W, W);
    if (!simple) {
      c.fillStyle = colors.alt;
      for (let r = 0; r < n; r++) {
        for (let k = r % 2; k < n; k += 2) c.fillRect(k * s, r * s, s, s);
      }
    }
    if (!obstacles.length) return;
    const set = new Set(obstacles);
    const inset = s * 0.06;
    c.fillStyle = colors.obstacle;
    obstacles.forEach((i) => {
      const r = Math.floor(i / n);
      const k = i % n;
      roundRect(c, k * s + inset, r * s + inset, s - 2 * inset, s - 2 * inset, s * 0.22);
      c.fill();
      // Nối liền các ô chướng ngại kề nhau thành một khối
      if (k + 1 < n && set.has(i + 1)) c.fillRect(k * s + s / 2, r * s + inset, s, s - 2 * inset);
      if (r + 1 < n && set.has(i + n)) c.fillRect(k * s + inset, r * s + s / 2, s - 2 * inset, s);
    });
    if (simple) return;
    c.fillStyle = colors.obstacleTop;
    obstacles.forEach((i) => {
      const r = Math.floor(i / n);
      const k = i % n;
      roundRect(c, k * s + s * 0.2, r * s + s * 0.16, s * 0.6, s * 0.36, s * 0.14);
      c.fill();
    });
  }

  /* ---------------- Vẽ rắn ---------------- */
  /**
   * Toạ độ (tâm ô, đơn vị ô) của các điểm trên thân rắn, đã "trải phẳng" qua mép bàn
   * (xuyên tường) để thân liền mạch. Điểm đầu được nội suy giữa ô cũ và ô mới, đuôi cũng vậy.
   */
  function snakePoints(alpha) {
    const n = game.size;
    const cur = game.snake;
    const xy = (i) => [(i % n) + 0.5, Math.floor(i / n) + 0.5];
    const delta = (a, b) => {
      let dx = (b % n) - (a % n);
      let dy = Math.floor(b / n) - Math.floor(a / n);
      if (dx > 1) dx -= n;
      else if (dx < -1) dx += n;
      if (dy > 1) dy -= n;
      else if (dy < -1) dy += n;
      return [dx, dy];
    };
    const pts = [xy(cur[0])];
    for (let i = 1; i < cur.length; i++) {
      const d = delta(cur[i - 1], cur[i]);
      pts.push([pts[i - 1][0] + d[0], pts[i - 1][1] + d[1]]);
    }
    if (prevSnake && alpha < 1 && cur.length > 1) {
      const p1 = pts[1];
      const p0 = pts[0];
      pts[0] = [p1[0] + (p0[0] - p1[0]) * alpha, p1[1] + (p0[1] - p1[1]) * alpha];
      const prevTail = prevSnake[prevSnake.length - 1];
      const last = cur[cur.length - 1];
      if (prevTail !== last) {
        const d = delta(last, prevTail);
        const L = pts[pts.length - 1];
        pts.push([L[0] + d[0] * (1 - alpha), L[1] + d[1] * (1 - alpha)]);
      }
    }
    return pts;
  }

  /**
   * Vẽ từng đoạn thân từ đuôi lên đầu. widthFn nhận số đoạn tính từ đuôi (thon dần ở vài đoạn cuối),
   * colorFn nhận vị trí 0..1 tính từ đầu (dải màu trải trên ít nhất 10 đoạn để rắn ngắn không bị loang lổ).
   */
  function strokeSegments(pts, widthFn, colorFn) {
    const m = pts.length - 1;
    const span = Math.max(m - 1, 10);
    for (let i = m - 1; i >= 0; i--) {
      ctx.strokeStyle = colorFn(i / span);
      ctx.lineWidth = widthFn(m - 1 - i);
      ctx.beginPath();
      ctx.moveTo(pts[i + 1][0], pts[i + 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  function drawSnakeAt(pts, now) {
    const W = 0.74; // bề rộng thân (đơn vị ô)
    const width = (fromTail) => (fromTail >= 3 ? W : W - 0.06 * (3 - fromTail)); // 3 đoạn cuối thon dần
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length > 1) {
      // Viền tối, rồi thân chuyển màu vàng -> xanh, rồi vệt bóng
      strokeSegments(pts, (k) => width(k) + 0.12, () => colors.edge);
      strokeSegments(pts, width, (t) => palette[Math.round(t * (palette.length - 1))]);
      ctx.save();
      ctx.translate(-0.07, -0.09);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.restore();
    }

    // Đầu rắn
    const [hx, hy] = pts[0];
    const v = G.VEC[game.dir];
    const dx = v[1];
    const dy = v[0];
    const px = -dy;
    const py = dx;
    const dead = game.over && !game.won;

    // Lưỡi thè ra theo nhịp khi đang chạy
    if (phase === 'running' && !reduceMotion.matches && Math.floor(now / 520) % 4 === 0) {
      const bx = hx + dx * 0.4;
      const by = hy + dy * 0.4;
      ctx.strokeStyle = '#c8323a';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + dx * 0.22, by + dy * 0.22);
      ctx.lineTo(bx + dx * 0.32 + px * 0.08, by + dy * 0.32 + py * 0.08);
      ctx.moveTo(bx + dx * 0.22, by + dy * 0.22);
      ctx.lineTo(bx + dx * 0.32 - px * 0.08, by + dy * 0.32 - py * 0.08);
      ctx.stroke();
    }

    ctx.fillStyle = colors.edge;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.5, 0, Math.PI * 2);
    ctx.fill();
    const hg = ctx.createRadialGradient(hx - 0.15, hy - 0.17, 0.05, hx, hy, 0.48);
    hg.addColorStop(0, 'rgba(255,255,255,0.35)');
    hg.addColorStop(0.45, palette[0]);
    hg.addColorStop(1, palette[0]);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.45, 0, Math.PI * 2);
    ctx.fill();
    if (dead) {
      ctx.fillStyle = 'rgba(179,38,30,0.45)';
      ctx.beginPath();
      ctx.arc(hx, hy, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mắt nhìn theo hướng đi
    for (const side of [-1, 1]) {
      const ex = hx + dx * 0.13 + px * 0.21 * side;
      const ey = hy + dy * 0.13 + py * 0.21 * side;
      if (dead) {
        ctx.strokeStyle = colors.pupil;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(ex - 0.08, ey - 0.08);
        ctx.lineTo(ex + 0.08, ey + 0.08);
        ctx.moveTo(ex + 0.08, ey - 0.08);
        ctx.lineTo(ex - 0.08, ey + 0.08);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = colors.eye;
      ctx.beginPath();
      ctx.arc(ex, ey, 0.125, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.pupil;
      ctx.beginPath();
      ctx.arc(ex + dx * 0.045, ey + dy * 0.045, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSnake(alpha, now) {
    const pts = snakePoints(alpha);
    if (game.mode !== 'wrap') {
      drawSnakeAt(pts, now);
      return;
    }
    // Xuyên tường: vẽ thêm các bản sao dịch đi n ô để phần thân đã qua mép hiện ở phía bên kia
    const n = game.size;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    pts.forEach(([x, y]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    for (const ox of [0, -n, n]) {
      for (const oy of [0, -n, n]) {
        if (maxX + ox < -1 || minX + ox > n + 1 || maxY + oy < -1 || minY + oy > n + 1) continue;
        ctx.save();
        ctx.translate(ox, oy);
        drawSnakeAt(pts, now);
        ctx.restore();
      }
    }
  }

  /* ---------------- Vẽ mồi ---------------- */
  /** Quả xoài: thân bầu dục cam vàng, má ửng đỏ, cuống và lá. */
  function drawMango(x, y, k) {
    ctx.save();
    ctx.translate(x, y + 0.03);
    ctx.scale(k, k);
    ctx.rotate(-0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(0.06, 0.1, 0.34, 0.41, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-0.12, -0.16, 0.03, 0, 0, 0.46);
    g.addColorStop(0, '#ffe58a');
    g.addColorStop(0.5, '#f8b630');
    g.addColorStop(1, '#e57a17');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -0.4);
    ctx.bezierCurveTo(0.3, -0.42, 0.38, -0.05, 0.3, 0.18);
    ctx.bezierCurveTo(0.22, 0.4, -0.02, 0.44, -0.18, 0.34);
    ctx.bezierCurveTo(-0.36, 0.22, -0.34, -0.12, -0.24, -0.27);
    ctx.bezierCurveTo(-0.17, -0.37, -0.09, -0.4, 0, -0.4);
    ctx.fill();
    // Má ửng đỏ
    const blush = ctx.createRadialGradient(0.18, 0.12, 0, 0.18, 0.12, 0.24);
    blush.addColorStop(0, 'rgba(226,70,40,0.5)');
    blush.addColorStop(1, 'rgba(226,70,40,0)');
    ctx.fillStyle = blush;
    ctx.fill();
    // Vệt sáng
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-0.13, -0.17, 0.06, 0.11, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Cuống + lá
    ctx.strokeStyle = '#6b4a1f';
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -0.39);
    ctx.lineTo(0.03, -0.5);
    ctx.stroke();
    ctx.fillStyle = '#4f9a3c';
    ctx.beginPath();
    ctx.ellipse(0.17, -0.5, 0.15, 0.065, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(0.05, -0.47);
    ctx.lineTo(0.29, -0.55);
    ctx.stroke();
    ctx.restore();
  }

  /** Quả vải: tròn đỏ, vỏ sần (chấm nhỏ), cuống lá xanh. */
  function drawLychee(x, y, k) {
    ctx.save();
    ctx.translate(x, y + 0.03);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(0.04, 0.07, 0.36, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-0.12, -0.14, 0.03, 0, 0, 0.38);
    g.addColorStop(0, '#ff8a80');
    g.addColorStop(0.45, '#d9343f');
    g.addColorStop(1, '#8f1424');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 0.35, 0, Math.PI * 2);
    ctx.fill();
    // Vỏ sần
    ctx.fillStyle = 'rgba(90,10,20,0.35)';
    for (let ring = 0; ring < 2; ring++) {
      const rr = ring ? 0.24 : 0.12;
      const cnt = ring ? 9 : 5;
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + ring * 0.3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr + 0.02, 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-0.13, -0.15, 0.07, 0.1, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b4a1f';
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -0.33);
    ctx.lineTo(-0.02, -0.45);
    ctx.stroke();
    ctx.fillStyle = '#4f9a3c';
    ctx.beginPath();
    ctx.ellipse(-0.15, -0.44, 0.13, 0.055, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFood(now) {
    const n = game.size;
    const still = reduceMotion.matches;
    if (game.food !== null) {
      const k = still ? 1.12 : 1.12 + 0.06 * Math.sin(now / 260);
      drawMango((game.food % n) + 0.5, Math.floor(game.food / n) + 0.5, k);
    }
    if (game.bonus) {
      const b = game.bonus;
      const x = (b.at % n) + 0.5;
      const y = Math.floor(b.at / n) + 0.5;
      // Thời gian còn lại: trừ dần mượt giữa hai tick
      const left = phase === 'running' ? Math.max(0, b.ms - acc) : b.ms;
      const frac = Math.max(0, Math.min(1, left / b.total));
      const blink = !still && left < 1500 && Math.floor(now / 150) % 2 === 0;
      const k = still ? 1.08 : 1.08 + 0.07 * Math.sin(now / 160);
      if (!blink) drawLychee(x, y, k);
      // Vòng đếm ngược
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.075;
      ctx.strokeStyle = 'rgba(128,128,128,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 0.47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = frac < 0.3 ? '#d9343f' : colors.accent;
      ctx.beginPath();
      ctx.arc(x, y, 0.47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
    }
  }

  /* ---------------- Hiệu ứng ăn mồi ---------------- */
  let particles = [];
  function burst(idx, color) {
    if (reduceMotion.matches) return;
    const n = game.size;
    particles.push({ x: (idx % n) + 0.5, y: Math.floor(idx / n) + 0.5, t0: performance.now(), color });
  }
  function drawParticles(now) {
    particles = particles.filter((p) => now - p.t0 < 420);
    particles.forEach((p) => {
      const t = (now - p.t0) / 420;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - t;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 0.25 + 0.55 * t;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.09 * (1 - t) + 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  /* ---------------- Vẽ một khung hình ---------------- */
  function draw(now) {
    if (!game || !canvas.width || appEl.dataset.screen !== 'game') return;
    const t = typeof now === 'number' ? now : performance.now();
    const s = canvas.width / game.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(), 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const interval = G.tickMs(game);
    const alpha = phase === 'running' && prevSnake ? Math.min(1, acc / interval) : 1;
    drawFood(t);
    drawSnake(alpha, t);
    drawParticles(t);
  }

  /* ---------------- Vòng lặp ---------------- */
  const needsLoop = () =>
    appEl.dataset.screen === 'game' &&
    document.visibilityState !== 'hidden' &&
    (phase === 'running' || particles.length > 0 || (phase === 'ready' && !reduceMotion.matches));

  function ensureLoop() {
    if (!raf && needsLoop()) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (phase === 'running') {
      const dt = Math.max(0, Math.min(250, now - lastTime));
      lastTime = now;
      acc += dt;
      let interval = G.tickMs(game);
      let guard = 0;
      while (acc >= interval && phase === 'running' && guard++ < MAX_CATCHUP) {
        acc -= interval;
        tick();
        interval = G.tickMs(game);
      }
      if (acc > interval) acc = interval; // máy quá chậm: bỏ bớt, không dồn tick
      if (phase !== 'running') acc = 0;
    } else {
      lastTime = now;
    }
    draw(now);
    ensureLoop();
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    if (!game) return;
    scoreEl.textContent = fmt(game.score);
    bestEl.textContent = fmt(stats.best[bestKey(game.mode, game.speed)]);
    lengthEl.textContent = fmt(game.snake.length);
    const paused = phase !== 'running';
    pauseBtn.dataset.state = paused ? 'paused' : 'running';
    pauseBtn.disabled = phase === 'over';
    const label = t(phase === 'running' ? 'hud.pause' : phase === 'ready' ? 'hud.start' : 'hud.resume');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = t('hud.keyHint', { label });
    readyHint.hidden = phase !== 'ready';
    const badge = $('mode-badge');
    badge.textContent = t('hud.badge', { mode: modeName(game.mode), speed: speedName(game.speed) });
    badge.hidden = false;
    boardEl.dataset.mode = game.mode;
  }

  function floatScore(n) {
    if (!n || reduceMotion.matches) return;
    const el = document.createElement('span');
    el.className = 'score-float';
    el.textContent = '+' + fmt(n);
    el.setAttribute('aria-hidden', 'true');
    scoreBox.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 1200);
  }

  function announce(text) {
    const el = $('announcer');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 30);
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1800);
  }

  function vibrate(pattern) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {}
  }

  /* ---------------- Luồng chơi ---------------- */
  function setScreen(name) {
    appEl.dataset.screen = name;
    if (name === 'game') {
      resize();
    } else {
      $('mode-badge').hidden = true;
    }
  }

  /** Về màn hình bắt đầu (bỏ ván hiện tại nếu có). */
  function showStart(focus) {
    clearTimeout(overTimer);
    game = null;
    phase = 'idle';
    prevSnake = null;
    particles = [];
    overlayPause.hidden = true;
    overlayOver.hidden = true;
    setScreen('start');
    renderStart();
    persist();
    if (focus) $('btn-start').focus();
  }

  function startGame() {
    clearTimeout(overTimer);
    game = G.newGame({
      mode: settings.mode,
      speed: settings.speed,
      size: settings.size,
      map: settings.map,
      accel: settings.accel,
    });
    phase = 'ready';
    PN && PN.gameStart({ mode: game.mode + '-' + game.speed });
    counted = false;
    prevSnake = null;
    particles = [];
    acc = 0;
    startBest = stats.best[bestKey(game.mode, game.speed)];
    overlayPause.hidden = true;
    overlayOver.hidden = true;
    setScreen('game');
    updateHud();
    draw();
    ensureLoop();
    persist();
    boardEl.focus();
    announce(t('announce.newGame', { mode: modeName(game.mode), speed: speedName(game.speed) }));
  }

  function countGame() {
    if (counted) return;
    counted = true;
    stats.played++;
  }

  /** Rắn bắt đầu chạy (từ trạng thái chờ hoặc tạm dừng). */
  function run() {
    if (!game || game.over) return;
    countGame();
    phase = 'running';
    prevSnake = null; // không nội suy ở tick đầu để rắn không bị giật lùi
    acc = 0;
    lastTime = performance.now();
    overlayPause.hidden = true;
    updateHud();
    persist();
    draw();
    ensureLoop();
  }

  function resume() {
    if (phase !== 'paused') return;
    run();
    boardEl.focus();
    announce(t('announce.resumed'));
  }

  function pause(focus) {
    if (phase !== 'running') return;
    phase = 'paused';
    prevSnake = null;
    acc = 0;
    updateHud();
    $('pause-sub').textContent = pauseSub();
    overlayPause.hidden = false;
    draw();
    persist();
    if (focus) $('btn-resume').focus();
    announce(t('announce.paused'));
  }

  function pauseSub() {
    return t('pause.sub', { len: fmt(game.snake.length), score: fmt(game.score), n: game.score });
  }

  function togglePause() {
    if (phase === 'running') pause(true);
    else if (phase === 'paused') resume();
    else if (phase === 'ready') run();
    else if (phase === 'over') startGame();
  }

  function tick() {
    const before = game;
    const res = G.step(game);
    game = res.state;
    prevSnake = res.moved ? before.snake : null;

    if (res.ate) {
      stats.food++;
      const at = game.snake[0];
      burst(at, res.ate === 'bonus' ? '#d9343f' : '#f8b630');
      floatScore(res.gained);
      vibrate(res.ate === 'bonus' ? 35 : 15);
    }
    if (res.bonusSpawned) announce(t('announce.bonus'));
    const key = bestKey(game.mode, game.speed);
    if (game.score > stats.best[key]) stats.best[key] = game.score;
    if (game.snake.length > stats.longest) stats.longest = game.snake.length;
    if (game.eaten > stats.bestFood) {
      stats.bestFood = game.eaten;
      stats.bestFoodMode = game.mode;
    }
    if (res.died || res.won) gameOver();
    if (res.ate || res.died || res.won) updateHud();
  }

  function gameOver() {
    phase = 'over';
    PN && PN.gameEnd({ mode: game.mode + '-' + game.speed, score: game.score, won: !!game.won });
    prevSnake = null;
    acc = 0;
    updateHud();
    persist(); // ván đã xong: xóa ván lưu, resume = null
    vibrate(game.won ? [40, 60, 40, 60, 120] : [70, 50, 110]);

    const key = bestKey(game.mode, game.speed);
    const newBest = game.score > startBest && game.score > 0;
    const title = t(game.won ? 'over.won' : ['wall', 'self', 'obstacle'].includes(game.cause) ? 'over.' + game.cause : 'over.end');
    $('over-title').textContent = title;
    overlayOver.classList.toggle('won', game.won);
    $('over-new-best').hidden = !newBest;
    $('over-score').textContent = fmt(game.score);
    $('over-length').textContent = fmt(game.snake.length);
    $('over-best').textContent = fmt(stats.best[key]);
    announce(t('announce.over', { title, score: fmt(game.score), len: fmt(game.snake.length) }) + (newBest ? t('announce.newBest') : ''));

    clearTimeout(overTimer);
    overTimer = setTimeout(
      () => {
        if (phase !== 'over') return;
        overlayOver.hidden = false;
        if (!modalOpen()) $('btn-again').focus();
      },
      reduceMotion.matches ? 0 : OVER_DELAY
    );
  }

  /** Nhận một lệnh hướng từ bàn phím / vuốt / nút điều hướng. */
  function steer(dir) {
    if (!game || modalOpen() || appEl.dataset.screen !== 'game') return;
    if (phase === 'ready') {
      game = G.turn(game, dir);
      run();
    } else if (phase === 'running') {
      game = G.turn(game, dir);
    }
  }

  /** Ván mới: hỏi lại nếu đang dở ván. */
  function requestNewGame() {
    if (!unfinished()) {
      closeModal();
      showStart(true);
      return;
    }
    pause(false);
    $('confirm-title').textContent = t('confirm.title');
    $('confirm-text').textContent =
      t('confirm.text', { len: fmt(game.snake.length), score: fmt(game.score), n: game.score });
    confirmAction = () => {
      closeModal();
      showStart(true);
    };
    openModal('modal-confirm', $('btn-confirm-ok'));
  }

  /* ---------------- Màn hình bắt đầu ---------------- */
  function buildMaps() {
    G.MAPS.forEach((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-btn';
      b.setAttribute('role', 'radio');
      b.dataset.value = String(i);
      const cv = document.createElement('canvas');
      cv.className = 'map-thumb';
      cv.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = mapName(i);
      b.append(cv, label);
      mapsEl.appendChild(b);
    });
  }

  /** Ảnh thu nhỏ của từng bản đồ Mê cung theo kích thước đang chọn. */
  function drawThumbs() {
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(60 * ratio);
    const n = settings.size;
    mapsEl.querySelectorAll('canvas').forEach((cv, i) => {
      cv.width = px;
      cv.height = px;
      const c = cv.getContext('2d');
      paintBoard(c, px, n, G.obstaclesFor('maze', n, i), true);
      // Rắn ở chỗ xuất phát
      const s = px / n;
      const mid = Math.floor(n / 2);
      c.fillStyle = colors.head;
      roundRect(c, (mid - 2) * s, mid * s, s * 3, s, s / 2);
      c.fill();
    });
  }

  function renderStart() {
    syncSegmented();
    $('mode-desc').textContent = t('modeDesc.' + settings.mode);
    $('field-map').hidden = settings.mode !== 'maze';
    const best = stats.best[bestKey(settings.mode, settings.speed)];
    const b = $('start-best').querySelector('b');
    b.textContent = best ? fmt(best) : '—';
    drawThumbs();
  }

  /* ---------------- Modal ---------------- */
  let openId = null;
  let returnFocus = null;
  let confirmAction = null;
  const modalOpen = () => openId !== null;

  function openModal(id, focusEl) {
    pause(false);
    if (openId && openId !== id) $(openId).hidden = true;
    else returnFocus = document.activeElement;
    openId = id;
    const m = $(id);
    m.hidden = false;
    // Mặc định focus vào khung hộp thoại (không vào nút "Đặt lại" để tránh bấm nhầm bằng Enter)
    const card = m.querySelector('.modal-card');
    card.tabIndex = -1;
    (focusEl || card).focus();
  }

  function closeModal() {
    if (!openId) return;
    $(openId).hidden = true;
    openId = null;
    if (returnFocus && document.body.contains(returnFocus) && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else if (appEl.dataset.screen === 'game') (overlayPause.hidden ? boardEl : $('btn-resume')).focus();
    else $('btn-start').focus();
    returnFocus = null;
  }

  function trapFocus(e) {
    const items = Array.from(
      $(openId).querySelectorAll('.modal-card button:not([disabled]), .modal-card input:not([disabled])')
    ).filter((b) => b.tabIndex >= 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!items.includes(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeModal();
  });

  /* ---------------- Nhóm lựa chọn (radio dạng segmented) ---------------- */
  function syncSegmented() {
    document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
      const cur = group.dataset.setting === 'lang' ? I18N.lang : String(settings[group.dataset.setting]);
      group.querySelectorAll('button[data-value]').forEach((b) => {
        const on = b.dataset.value === cur;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
  }

  function chooseSetting(key, value) {
    if (key === 'lang') {
      // Đổi ngôn ngữ: lưu ván (đã tạm dừng khi mở Cài đặt) rồi tải lại trang
      if (value === I18N.lang) return;
      pause(false);
      persist();
      I18N.set(value);
      return;
    }
    if (key === 'theme') {
      settings.theme = value;
      saveSettings();
      applyTheme();
      syncSegmented();
      return;
    }
    if (key === 'mode' && G.MODES.includes(value)) settings.mode = value;
    else if (key === 'speed' && G.SPEEDS.includes(value)) settings.speed = value;
    else if (key === 'size' && G.SIZES.includes(Number(value))) settings.size = Number(value);
    else if (key === 'map') settings.map = Number(value) || 0;
    else return;
    saveSettings();
    renderStart();
  }

  document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
    const key = group.dataset.setting;
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) chooseSetting(key, b.dataset.value);
    });
    // Phím mũi tên di chuyển trong nhóm radio (và chọn luôn)
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const btns = Array.from(group.querySelectorAll('button[data-value]'));
      const i = btns.indexOf(document.activeElement);
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = btns[(i + step + btns.length) % btns.length];
      chooseSetting(key, next.dataset.value);
      next.focus();
    });
  });

  /* ---------------- Công tắc trong Cài đặt ---------------- */
  function applyDpad() {
    const on = dpadOn();
    dpadEl.hidden = !on;
    appEl.classList.toggle('has-dpad', on);
  }

  function syncSwitches() {
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
      const k = sw.dataset.setting;
      sw.checked = k === 'dpad' ? dpadOn() : !!settings[k];
    });
  }

  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      const k = sw.dataset.setting;
      settings[k] = sw.checked;
      saveSettings();
      if (k === 'accel' && game) {
        game = Object.assign({}, game, { accel: sw.checked });
        saveGame();
      } else if (k === 'dpad') {
        applyDpad();
      } else if (k === 'vibrate' && sw.checked) {
        vibrate(20);
      }
    });
  });

  /* ---------------- Thống kê (modal) ---------------- */
  function renderStats() {
    $('st-played').textContent = fmt(stats.played);
    $('st-food').textContent = fmt(stats.food);
    $('st-longest').textContent = stats.longest ? fmt(stats.longest) : '—';
    $('st-best').textContent = fmt(bestOverall());
    const body = $('st-best-table');
    body.textContent = '';
    const curMode = game ? game.mode : settings.mode;
    const curSpeed = game ? game.speed : settings.speed;
    G.MODES.forEach((m) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = modeName(m);
      tr.appendChild(th);
      G.SPEEDS.forEach((s) => {
        const td = document.createElement('td');
        const v = stats.best[bestKey(m, s)];
        td.textContent = v ? fmt(v) : '—';
        if (!v) td.classList.add('empty');
        if (m === curMode && s === curSpeed) {
          td.classList.add('current');
          td.title = t('stats.current');
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  let resetArmed = false;
  let resetTimer = 0;
  const resetBtn = $('btn-stats-reset');
  function disarmReset() {
    resetArmed = false;
    clearTimeout(resetTimer);
    resetBtn.textContent = t('stats.reset');
    resetBtn.classList.remove('btn-danger');
  }
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      // Bấm hai lần để tránh xóa nhầm
      resetArmed = true;
      resetBtn.textContent = t('stats.resetConfirm');
      resetBtn.classList.add('btn-danger');
      resetTimer = setTimeout(disarmReset, 3500);
      return;
    }
    disarmReset();
    stats = emptyStats();
    counted = false; // ván đang dở sẽ được tính lại khi chơi tiếp
    if (game) startBest = 0;
    persist();
    renderStats();
    updateHud();
    if (appEl.dataset.screen === 'start') renderStart();
    toast(t('stats.resetDone'));
  });

  /* ---------------- Nút bấm ---------------- */
  $('btn-new').addEventListener('click', requestNewGame);
  $('btn-start').addEventListener('click', startGame);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNewGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-over-menu').addEventListener('click', () => showStart(true));
  $('btn-confirm-ok').addEventListener('click', () => {
    const fn = confirmAction;
    confirmAction = null;
    if (fn) fn();
    else closeModal();
  });
  $('btn-settings').addEventListener('click', () => {
    syncSegmented();
    syncSwitches();
    openModal('modal-settings');
  });
  $('btn-stats').addEventListener('click', () => {
    disarmReset();
    renderStats();
    openModal('modal-stats');
  });

  /* ---------------- Nút điều hướng ---------------- */
  dpadEl.querySelectorAll('.dpad-btn').forEach((btn) => {
    const dir = btn.dataset.dir;
    const release = () => btn.classList.remove('pressed');
    // Nhận lệnh ngay lúc chạm (không đợi nhả tay) để phản hồi nhanh
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      btn.classList.add('pressed');
      steer(dir);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    // Kích hoạt bằng bàn phím (Enter / Space khi nút đang được focus)
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) steer(dir);
    });
  });

  /* ---------------- Bàn phím ---------------- */
  const KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
      return;
    }
    const inGame = appEl.dataset.screen === 'game';
    const onControl = e.target.closest && e.target.closest('button, input');
    // Enter / Space trên nút đang focus: để nút tự xử lý
    if (onControl && (e.key === ' ' || e.key === 'Enter')) return;

    const dir = KEY_DIRS[e.key];
    if (dir) {
      if (!inGame) return;
      e.preventDefault();
      steer(dir);
      return;
    }
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      if (!inGame) return;
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
    if (e.repeat) return;
    if (e.key === 'Escape' && phase === 'running') pause(true);
    else if (e.key === 'n' || e.key === 'N') requestNewGame();
  });

  /* ---------------- Vuốt ở bất kỳ đâu trên vùng bàn chơi ---------------- */
  // Đổi hướng ngay khi ngón tay đi đủ xa (không đợi nhả tay), rồi lấy điểm hiện tại làm mốc
  // mới để vuốt tiếp sang hướng khác trong cùng một lần chạm.
  const pointers = new Set();
  let swipe = null;

  boardArea.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay, button')) return; // để nút trên lớp phủ bấm bình thường
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.add(e.pointerId);
    // Hai ngón trở lên: bỏ qua cử chỉ
    swipe = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    if (swipe) {
      try {
        boardArea.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  });
  boardArea.addEventListener('pointermove', (e) => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE_MIN) return;
    steer(ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (swipe && swipe.id === e.pointerId) swipe = null;
  }
  boardArea.addEventListener('pointerup', endPointer);
  boardArea.addEventListener('pointercancel', endPointer);
  // Chặn cuộn trang bằng cảm ứng khi vuốt (dự phòng cho trình duyệt cũ)
  boardArea.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Rời trang / ẩn trang ---------------- */
  window.addEventListener('pagehide', () => {
    pause(false);
    persist();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pause(false); // tự tạm dừng khi ẩn trang
      persist();
    } else {
      draw();
      ensureLoop();
    }
  });
  setInterval(() => {
    if (phase === 'running') persist();
  }, SAVE_EVERY);

  const onSchemeChange = () => {
    if (settings.theme === 'auto') applyTheme();
  };
  const schemeMQ = window.matchMedia('(prefers-color-scheme: dark)');
  if (schemeMQ.addEventListener) schemeMQ.addEventListener('change', onSchemeChange);
  if (coarsePointer.addEventListener) coarsePointer.addEventListener('change', applyDpad);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);
  window.addEventListener('resize', () => {
    resize();
    if (appEl.dataset.screen === 'start') drawThumbs();
  });

  /* ---------------- Khởi động ---------------- */
  I18N.apply();
  // Ngôn ngữ đổi ở trang khác: lưu ván trước khi tải lại
  I18N.beforeReload = () => {
    pause(false);
    persist();
  };
  $('app-version').textContent = APP_VERSION;
  buildMaps();
  applyDpad();
  applyTheme();
  if (loadGame()) {
    // Có ván đang dở: mở lại ở trạng thái tạm dừng
    settings.mode = game.mode;
    settings.speed = game.speed;
    settings.size = game.size;
    settings.map = game.map;
    startBest = stats.best[bestKey(game.mode, game.speed)];
    phase = 'paused';
    PN && PN.gameStart({ mode: game.mode + '-' + game.speed, resume: true });
    setScreen('game');
    updateHud();
    $('pause-sub').textContent = pauseSub();
    overlayPause.hidden = false;
    draw();
    persist();
  } else {
    showStart(false);
  }
  syncSegmented();
})();
