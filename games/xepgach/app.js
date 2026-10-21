/* =====================================================================
 * Xếp Gạch - Logic giao diện (cần engine.js nạp trước)
 *   - Vẽ bàn chơi bằng <canvas> (nét theo devicePixelRatio), ô giữ và 3 khối kế tiếp
 *   - Vòng lặp requestAnimationFrame: trọng lực, trễ khóa, DAS/ARR khi giữ phím
 *   - Bàn phím, nút bấm cảm ứng (giữ ◀ ▶ để lặp), cử chỉ trên bàn chơi (tùy chọn)
 *   - Hiệu ứng xóa hàng (nháy rồi sập), dòng chữ "Xếp 4 hàng!", rung khi xóa hàng
 *   - Tự dừng khi ẩn trang; lưu ván, cài đặt, thống kê vào localStorage;
 *     ghi tóm tắt cho cổng PlayNine
 * ===================================================================== */
(function () {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'xepgach' });
  // Âm thanh / pháo giấy của SDK: SDK cũ hoặc chạy không có SDK thì im lặng, không lỗi.
  // Trọng lực / thả nhanh / tự lặp khi giữ phím không phát tiếng, chỉ thao tác của người chơi mới có tiếng.
  const SFX = PN && PN.sfx ? PN.sfx : null;
  const sfx = (name, opts) => {
    try {
      SFX && SFX.play(name, opts);
    } catch (e) {}
  };
  const confetti = () => {
    try {
      PN && PN.fx && PN.fx.confetti();
    } catch (e) {}
  };

  const APP_VERSION = '1.1.0';
  const E = window.XepGach;
  const T = window.I18N.t;
  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  window.I18N.apply();

  // Mọi khóa localStorage đều có tiền tố playnine-xepgach-
  const KEYS = {
    settings: 'playnine-xepgach-settings-v1',
    game: 'playnine-xepgach-game-v1',
    stats: 'playnine-xepgach-stats-v1',
    summary: 'playnine-xepgach-summary-v1',
  };
  const DAS_MS = 160; // giữ phím bao lâu thì bắt đầu tự lặp
  const ARR_MS = 40; // mỗi lần lặp cách nhau
  const CLEAR_MS = 320; // hiệu ứng xóa hàng: nháy rồi sập
  const TRAIL_MS = 170; // vệt thả thẳng
  const SUMMARY_MS = 5000; // ghi tóm tắt / lưu ván định kỳ khi đang chơi
  const BANNER_MS = 1300;
  const THEMES = ['auto', 'light', 'dark'];
  const COLOR_VARS = { I: '--p-i', O: '--p-o', T: '--p-t', S: '--p-s', Z: '--p-z', J: '--p-j', L: '--p-l' };

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const fmt = (n) => window.I18N.fmtNumber(n);
  const now = () => performance.now();

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
    const bool = (v, def) => (typeof v === 'boolean' ? v : def);
    return {
      theme: THEMES.includes(s.theme) ? s.theme : 'auto',
      startLevel: E.START_LEVELS.includes(s.startLevel) ? s.startLevel : 1,
      ghost: bool(s.ghost, true),
      showPad: bool(s.showPad, false),
      gestures: bool(s.gestures, false),
      vibrate: bool(s.vibrate, true),
    };
  }
  const settings = loadSettings();
  const saveSettings = () => writeJSON(KEYS.settings, settings);

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    const meta = $('theme-color');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f6f2ea';
    readPalette();
    drawAll();
  }

  /* ---------------- Thống kê ---------------- */
  function emptyStats() {
    return { played: 0, best: 0, mostLines: 0, highestLevel: 0, totalLines: 0, quads: 0 };
  }
  function loadStats() {
    const s = readJSON(KEYS.stats);
    const out = emptyStats();
    if (!s || typeof s !== 'object') return out;
    Object.keys(out).forEach((k) => {
      if (Number.isInteger(s[k]) && s[k] >= 0) out[k] = s[k];
    });
    return out;
  }
  let stats = loadStats();
  const saveStats = () => writeJSON(KEYS.stats, stats);

  /* ---------------- Trạng thái ----------------
   * mode: 'idle' (chưa có ván, hiện lớp phủ bắt đầu) | 'playing' | 'paused' | 'over'
   * counted: ván đã được tính vào "ván đã chơi" chưa (tính khi khóa khối đầu tiên)
   * bestAtStart: điểm cao nhất lúc bắt đầu ván, để báo "Kỷ lục mới" */
  let game = null;
  let mode = 'idle';
  let counted = false;
  let bestAtStart = 0;

  function loadGame() {
    const saved = readJSON(KEYS.game);
    const g = saved && E.restore(saved.game);
    if (!g) return false;
    game = g;
    counted = saved.counted === true;
    bestAtStart = Number.isInteger(saved.bestAtStart) ? saved.bestAtStart : stats.best;
    return true;
  }

  const hasOpenGame = () => !!game && !game.over && (mode === 'playing' || mode === 'paused');

  function saveGame() {
    if (hasOpenGame()) writeJSON(KEYS.game, { game, counted, bestAtStart });
    else removeKey(KEYS.game);
  }

  /** Tóm tắt cho thẻ game ở cổng PlayNine. */
  function writeSummary() {
    const list = [];
    if (stats.best > 0) list.push({ value: fmt(stats.best), label: T('summary.best') });
    if (stats.mostLines > 0) list.push({ value: fmt(stats.mostLines), label: T('summary.mostLines') });
    if (stats.highestLevel > 0) list.push({ value: String(stats.highestLevel), label: T('summary.highestLevel') });

    let note = T('summary.intro');
    if (stats.best > 0) note = T('summary.note', { score: fmt(stats.best), lines: linesText(stats.mostLines) });

    let resume = null;
    if (hasOpenGame()) {
      resume = {
        title: T('summary.resumeTitle'),
        detail: T('summary.resumeDetail', { score: fmt(game.score), level: game.level }),
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

  /** Cập nhật kỷ lục theo ván đang chơi (gọi sau mỗi lần khóa khối). */
  function updateRecords() {
    if (!game || !counted) return;
    if (game.score > stats.best) stats.best = game.score;
    if (game.lines > stats.mostLines) stats.mostLines = game.lines;
    if (game.level > stats.highestLevel) stats.highestLevel = game.level;
  }

  /* ---------------- DOM ---------------- */
  const appEl = $('app');
  const boardEl = $('board');
  const boardArea = $('board-area');
  const canvas = $('board-canvas');
  const ctx = canvas.getContext('2d');
  const holdCanvas = $('hold-canvas');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = $('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');
  const pauseBtn = $('btn-pause');
  const overlays = { start: $('overlay-start'), pause: $('overlay-pause'), over: $('overlay-over') };

  /* ---------------- Màu (đọc từ biến CSS để theo giao diện sáng / tối) ---------------- */
  const palette = { board: '#e9dfcc', grid: 'rgba(0,0,0,0.1)', flash: '#ffffff', piece: {} };
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, def) => cs.getPropertyValue(name).trim() || def;
    palette.board = v('--board-bg', '#e9dfcc');
    palette.grid = v('--board-grid', 'rgba(0,0,0,0.1)');
    palette.flash = v('--flash', '#ffffff');
    E.PIECES.forEach((t) => (palette.piece[t] = v(COLOR_VARS[t], '#888888')));
    sprites.clear();
  }
  const colorOfId = (id) => palette.piece[E.PIECES[id - 1]];

  /* ---------------- Cỡ bàn chơi ---------------- */
  let cell = 20; // px CSS mỗi ô
  let dpr = 1;
  let miniCell = 12;

  function setupCanvas(cv, c, w, h) {
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Tính cỡ ô lớn nhất vừa chỗ trống (cao: hàng giữa của lưới; rộng: trừ hai cột bên). */
  function fitBoard() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const cs = getComputedStyle(appEl);
    const innerW = appEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const sideMin = parseFloat(cs.getPropertyValue('--side-min')) || 58;
    const gap = parseFloat(cs.columnGap) || 8;
    const availW = innerW - 2 * sideMin - 2 * gap;
    const availH = boardArea.clientHeight;
    let c = Math.floor(Math.min(availH / E.ROWS, availW / E.COLS));
    c = Math.max(8, Math.min(c, 44));
    if (c !== cell || canvas.width !== Math.round(c * E.COLS * dpr)) {
      cell = c;
      sprites.clear();
    }
    appEl.style.setProperty('--cell', cell + 'px');
    setupCanvas(canvas, ctx, cell * E.COLS, cell * E.ROWS);

    // Ô xem trước: vừa bề ngang cột bên, không to hơn ô bàn chơi
    const panelW = $('hold-canvas').parentElement.clientWidth - 12;
    miniCell = Math.max(7, Math.min(Math.floor(panelW / 4.4), Math.round(cell * 0.72), 24));
    const mw = Math.round(miniCell * 4.4);
    setupCanvas(holdCanvas, holdCtx, mw, Math.round(miniCell * 2.6));
    setupCanvas(nextCanvas, nextCtx, mw, Math.round(miniCell * 2.6 * E.NEXT_COUNT));
    drawAll();
  }

  /* ---------------- Vẽ ---------------- */
  // Ảnh ô gạch dựng sẵn theo màu và cỡ (vẽ gradient một lần, sau đó chỉ drawImage)
  const sprites = new Map();

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function sprite(color, size) {
    const key = color + '|' + size + '|' + dpr;
    let sp = sprites.get(key);
    if (sp) return sp;
    sp = document.createElement('canvas');
    sp.width = sp.height = Math.max(1, Math.round(size * dpr));
    const g = sp.getContext('2d');
    g.scale(dpr, dpr);
    const inset = Math.max(0.5, size * 0.045);
    const s = size - inset * 2;
    const r = Math.max(1.5, size * 0.17);
    roundRect(g, inset, inset, s, s, r);
    g.fillStyle = color;
    g.fill();
    // Ánh sáng phía trên, bóng phía dưới cho cảm giác viên gạch
    const grad = g.createLinearGradient(0, inset, 0, inset + s);
    grad.addColorStop(0, 'rgba(255,255,255,0.30)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.20)');
    g.fillStyle = grad;
    g.fill();
    // Vệt sáng nhỏ góc trên trái
    if (size >= 10) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(g, inset + s * 0.16, inset + s * 0.14, s * 0.34, Math.max(1.5, s * 0.12), Math.max(0.75, s * 0.06));
      g.fill();
    }
    sprites.set(key, sp);
    return sp;
  }

  function drawCell(c, x, y, size, color, alpha) {
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.drawImage(sprite(color, size), x, y, size, size);
    if (alpha !== undefined) c.globalAlpha = 1;
  }

  function drawGrid(c) {
    const w = cell * E.COLS;
    const h = cell * E.ROWS;
    c.fillStyle = palette.board;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = palette.grid;
    c.lineWidth = 1 / dpr;
    c.beginPath();
    const off = 0.5 / dpr;
    for (let x = 1; x < E.COLS; x++) {
      c.moveTo(x * cell + off, 0);
      c.lineTo(x * cell + off, h);
    }
    for (let y = 1; y < E.ROWS; y++) {
      c.moveTo(0, y * cell + off);
      c.lineTo(w, y * cell + off);
    }
    c.stroke();
  }

  /** Vẽ các ô đã khóa. shiftOf(y) trả về số hàng dịch xuống (cho hiệu ứng sập). */
  function drawStack(c, board, skipRows, shiftOf, alphaRows) {
    for (let y = E.HIDDEN; y < E.TOTAL_ROWS; y++) {
      const skip = skipRows && skipRows.has(y);
      const alpha = skip ? alphaRows : undefined;
      if (skip && !(alphaRows > 0)) continue;
      const dy = shiftOf ? shiftOf(y) : 0;
      for (let x = 0; x < E.COLS; x++) {
        const id = board[y * E.COLS + x];
        if (!id) continue;
        drawCell(c, x * cell, (y - E.HIDDEN + dy) * cell, cell, colorOfId(id), alpha);
      }
    }
  }

  let clearAnim = null; // { t0, rows:Set, board }
  let trail = null; // { t0, cols: [{x, top, bottom}], color }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function drawBoard() {
    const c = ctx;
    drawGrid(c);
    if (!game) return;
    const t = now();

    if (clearAnim) {
      const p = Math.min(1, (t - clearAnim.t0) / CLEAR_MS);
      const rows = clearAnim.rows;
      const b = clearAnim.board;
      if (p < 0.45) {
        // Nháy sáng các hàng bị xóa
        drawStack(c, b);
        const a = 0.85 * (1 - p / 0.45) + 0.1;
        c.fillStyle = palette.flash;
        c.globalAlpha = a;
        rows.forEach((y) => c.fillRect(0, (y - E.HIDDEN) * cell, cell * E.COLS, cell));
        c.globalAlpha = 1;
      } else {
        // Các hàng phía trên sập xuống
        const u = easeOut((p - 0.45) / 0.55);
        const sorted = Array.from(rows);
        const shiftOf = (y) => sorted.filter((r) => r > y).length * u;
        drawStack(c, b, rows, shiftOf, 0);
      }
      return;
    }

    drawStack(c, game.board);
    const p = game.cur;
    if (!p || game.over) return;

    // Vệt thả thẳng
    if (trail) {
      const k = 1 - (t - trail.t0) / TRAIL_MS;
      if (k > 0) {
        trail.cols.forEach((col) => {
          const y0 = (col.top - E.HIDDEN) * cell;
          const y1 = (col.bottom - E.HIDDEN) * cell;
          if (y1 <= y0) return;
          const grad = c.createLinearGradient(0, y0, 0, y1);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, trail.color);
          c.globalAlpha = 0.35 * k;
          c.fillStyle = grad;
          c.fillRect(col.x * cell + cell * 0.12, y0, cell * 0.76, y1 - y0);
          c.globalAlpha = 1;
        });
      }
    }

    const color = palette.piece[p.t];
    // Bóng khối
    if (settings.ghost && mode !== 'idle') {
      const gy = E.ghostY(game);
      if (gy !== p.y) {
        c.strokeStyle = color;
        c.fillStyle = color;
        const lw = Math.max(1.5, cell * 0.08);
        c.lineWidth = lw;
        E.pieceCells({ t: p.t, r: p.r, x: p.x, y: gy }).forEach(([x, y]) => {
          if (y < E.HIDDEN) return;
          const px = x * cell + lw / 2 + cell * 0.06;
          const py = (y - E.HIDDEN) * cell + lw / 2 + cell * 0.06;
          const s = cell - lw - cell * 0.12;
          roundRect(c, px, py, s, s, Math.max(1.5, cell * 0.14));
          c.globalAlpha = 0.16;
          c.fill();
          c.globalAlpha = 0.75;
          c.stroke();
          c.globalAlpha = 1;
        });
      }
    }
    // Khối đang rơi (phần trong vùng ẩn bị cắt bỏ tự nhiên)
    E.pieceCells(p).forEach(([x, y]) => {
      if (y < E.HIDDEN) return;
      drawCell(c, x * cell, (y - E.HIDDEN) * cell, cell, color);
    });
  }

  /** Vẽ một khối căn giữa trong khung (x, y, w, h) của canvas nhỏ. */
  function drawMiniPiece(c, t, x, y, w, h, alpha) {
    const cells = E.shapeCells(t, 0);
    const xs = cells.map((p) => p[0]);
    const ys = cells.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const pw = (Math.max(...xs) - minX + 1) * miniCell;
    const ph = (Math.max(...ys) - minY + 1) * miniCell;
    const ox = Math.round(x + (w - pw) / 2);
    const oy = Math.round(y + (h - ph) / 2);
    cells.forEach(([cx, cy]) => {
      drawCell(c, ox + (cx - minX) * miniCell, oy + (cy - minY) * miniCell, miniCell, palette.piece[t], alpha);
    });
  }

  function drawPreviews() {
    const w = parseFloat(holdCanvas.style.width) || 0;
    const hh = parseFloat(holdCanvas.style.height) || 0;
    holdCtx.clearRect(0, 0, w, hh);
    if (game && game.hold) drawMiniPiece(holdCtx, game.hold, 0, 0, w, hh, game.canHold ? 1 : 0.35);

    const nh = parseFloat(nextCanvas.style.height) || 0;
    nextCtx.clearRect(0, 0, w, nh);
    if (!game) return;
    const slot = nh / E.NEXT_COUNT;
    game.queue.slice(0, E.NEXT_COUNT).forEach((t, i) => drawMiniPiece(nextCtx, t, 0, i * slot, w, slot));
  }

  function drawAll() {
    if (!ctx) return;
    drawBoard();
    drawPreviews();
  }

  /* ---------------- HUD ---------------- */
  const hudEls = { score: $('score'), best: $('best'), level: $('level'), lines: $('lines') };
  const hudCache = {};
  function setText(key, text) {
    if (hudCache[key] === text) return;
    hudCache[key] = text;
    hudEls[key].textContent = text;
  }
  function updateHud() {
    const score = game ? game.score : 0;
    setText('score', fmt(score));
    setText('best', fmt(Math.max(stats.best, counted ? score : 0)));
    setText('level', String(game ? game.level : settings.startLevel));
    setText('lines', fmt(game ? game.lines : 0));
    const open = hasOpenGame();
    pauseBtn.disabled = !open;
    const paused = mode === 'paused';
    pauseBtn.classList.toggle('is-paused', paused);
    const label = paused ? T('top.resume') : T('top.pause');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = label;
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép reflow, gắn lại). */
  function replayClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function floatScore(n) {
    if (!n || reduceMotion.matches) return;
    replayClass($('score-box'), 'bump');
    const el = document.createElement('span');
    el.className = 'score-float';
    el.textContent = '+' + fmt(n);
    el.setAttribute('aria-hidden', 'true');
    $('score-box').appendChild(el);
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

  let bannerTimer = 0;
  function showBanner(title, sub, small) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    el.classList.toggle('small', !!small);
    // Khởi động lại animation
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), BANNER_MS);
  }

  function vibrate(pattern) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {}
  }

  /* ---------------- Lớp phủ ---------------- */
  function showOverlay(name) {
    Object.keys(overlays).forEach((k) => (overlays[k].hidden = k !== name));
  }

  /** "12 hàng" / "12 lines" (tiếng Anh có số ít / số nhiều). */
  function linesText(n) {
    return T('detail.lines', { n: fmt(n) });
  }

  function detailText() {
    return T('detail.full', { score: fmt(game.score), level: game.level, lines: linesText(game.lines) });
  }

  /* ---------------- Luồng chơi ---------------- */
  function resetEffects() {
    clearAnim = null;
    trail = null;
    $('banner').hidden = true;
  }

  function startNewGame() {
    closeModal();
    game = E.newGame({ startLevel: settings.startLevel });
    PN && PN.gameStart({ mode: 'lv' + game.startLevel });
    counted = false;
    bestAtStart = stats.best;
    recordCheered = false;
    mode = 'playing';
    sfx('start');
    resetEffects();
    releaseAll();
    showOverlay(null);
    summaryAcc = 0;
    updateHud();
    persist();
    drawAll();
    boardEl.focus();
    kick();
    announce(T('announce.start', { level: game.level }));
  }

  /** Ván mới: hỏi lại nếu đang dở ván. */
  function requestNewGame() {
    const inProgress = hasOpenGame() && (game.pieces > 0 || game.score > 0);
    if (!inProgress) {
      startNewGame();
      return;
    }
    pause(false);
    $('confirm-text').textContent = T('confirm.textDetail', { detail: detailText().toLowerCase() });
    confirmAction = startNewGame;
    openModal('modal-confirm', $('btn-confirm-ok'));
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    mode = 'paused';
    releaseAll();
    $('pause-sub').textContent = detailText();
    showOverlay('pause');
    updateHud();
    persist();
    drawAll();
    if (focus) sfx('tap', { pitch: 0.8 });
    if (focus && !modalOpen()) $('btn-resume').focus();
  }

  function resume() {
    if (mode !== 'paused' || modalOpen()) return;
    mode = 'playing';
    sfx('tap');
    showOverlay(null);
    updateHud();
    boardEl.focus();
    kick();
  }

  let overAt = 0;
  function gameOver() {
    mode = 'over';
    PN && PN.gameEnd({ mode: 'lv' + game.startLevel, score: game.score, won: false });
    overAt = now();
    releaseAll();
    updateRecords();
    const record = counted && game.score > bestAtStart && game.score > 0;
    $('over-record').hidden = !record;
    $('over-score').textContent = fmt(game.score);
    $('over-sub').textContent = T('detail.rest', { level: game.level, lines: linesText(game.lines) });
    sfx('lose');
    if (record) confetti();
    showOverlay('over');
    updateHud();
    persist();
    if (!modalOpen()) $('btn-again').focus();
    announce(T(record ? 'announce.overRecord' : 'announce.over', { detail: detailText() }));
  }

  let recordCheered = false; // đã báo vượt kỷ lục trong ván này chưa

  /**
   * Tiếng khi khóa khối: thả thẳng / đặt khối; xóa hàng cao dần theo số hàng và combo;
   * xếp 4 hàng hoặc liên tiếp: tiếng combo; lên cấp: tiếng lên cấp ngay sau.
   */
  function lockSound(res, hard) {
    const n = res.lines;
    if (!n) {
      sfx(hard ? 'drop' : 'place', { volume: hard ? 1 : 0.6 });
      return;
    }
    if (hard) sfx('drop', { volume: 0.7 });
    const pitch = 1 + (n - 1) * 0.08 + Math.min(res.combo || 0, 8) * 0.05;
    sfx(n === 4 || res.b2b ? 'combo' : 'clear', { pitch });
    if (res.levelUp) {
      setTimeout(() => sfx('levelup'), 260);
      replayClass($('level').parentElement, 'bump');
    }
  }

  /** Xử lý kết quả khóa khối từ engine (thả thẳng hoặc hết trễ khóa). */
  function onLock(res, t, hard) {
    if (!res) return;
    lockSound(res, hard);
    if (res.lines && !reduceMotion.matches) replayClass(boardEl, res.lines === 4 ? 'quake' : 'thump');
    else if (hard && !reduceMotion.matches) replayClass(boardEl, 'thump');
    if (!counted) {
      counted = true;
      stats.played++;
    }
    const n = res.lines;
    if (n) {
      stats.totalLines += n;
      if (n === 4) stats.quads++;
      if (!reduceMotion.matches) clearAnim = { t0: t, rows: new Set(res.rows), board: res.boardBefore };
      vibrate(n === 4 ? [30, 40, 30] : 18);
      floatScore(res.points);
    }
    if (hard && res.drop > 0 && !reduceMotion.matches) {
      const cols = new Map();
      res.cells.forEach(([x, y]) => {
        const top = y - res.drop;
        const c = cols.get(x);
        if (!c) cols.set(x, { x, top, bottom: y });
        else {
          c.top = Math.min(c.top, top);
          c.bottom = Math.min(c.bottom, y);
        }
      });
      trail = { t0: t, cols: Array.from(cols.values()), color: palette.piece[res.piece] };
    }

    // Dòng chữ lớn: xếp 4 hàng > lên cấp > combo
    const subs = [];
    if (res.b2b) subs.push(T('banner.b2b'));
    if (n === 4) {
      if (res.levelUp) subs.push(T('banner.levelUp', { level: game.level }));
      else if (res.combo >= 1) subs.push(T('banner.combo', { n: res.combo }));
      showBanner(T('banner.quad'), subs.join(' · '));
      announce(T('announce.quad', { points: fmt(res.points) }));
    } else if (res.levelUp) {
      showBanner(T('banner.level', { level: game.level }), res.combo >= 1 ? T('banner.combo', { n: res.combo }) : '', true);
      announce(T('banner.levelUp', { level: game.level }));
    } else if (n && res.combo >= 2) {
      showBanner(T('banner.combo', { n: res.combo }), '', true);
    }

    updateRecords();
    updateHud();
    if (!recordCheered && bestAtStart > 0 && game.score > bestAtStart && !(res.over || game.over)) {
      recordCheered = true;
      replayClass($('score-box'), 'record');
      setTimeout(() => sfx('coin'), 380);
    }
    if (res.over || game.over) gameOver();
    else if (n) saveStats();
    kick();
  }

  /* ---------------- Điều khiển ----------------
   * Giữ ◀ / ▶ (phím, nút bấm): đi 1 ô ngay, sau DAS_MS thì lặp mỗi ARR_MS.
   * Nhiều nguồn cùng giữ: hướng nhấn sau cùng thắng. */
  const held = []; // [{ src, dir }]
  const das = { t: 0, arr: 0 };
  const softSrc = new Set(); // các nguồn đang giữ thả nhanh

  const curDir = () => (held.length ? held[held.length - 1].dir : 0);
  /** Được thao tác không. Thao tác trong lúc đang chạy hiệu ứng xóa hàng thì bỏ qua phần còn lại của hiệu ứng. */
  function canAct() {
    if (mode !== 'playing' || modalOpen()) return false;
    if (clearAnim) clearAnim = null;
    return true;
  }

  function pressDir(src, dir) {
    releaseDir(src, true);
    held.push({ src, dir });
    das.t = 0;
    das.arr = 0;
    if (canAct() && E.move(game, dir)) {
      sfx('move', { volume: 0.3 });
      drawAll();
    }
  }

  function releaseDir(src, silent) {
    const before = curDir();
    for (let i = held.length - 1; i >= 0; i--) if (held[i].src === src) held.splice(i, 1);
    if (!silent && curDir() !== before) {
      das.t = 0;
      das.arr = 0;
    }
  }

  function pressSoft(src) {
    softSrc.add(src);
    if (canAct() && E.softDrop(game)) {
      game.gravAcc = 0;
      updateHud();
      drawAll();
    }
  }
  const releaseSoft = (src) => softSrc.delete(src);

  function releaseAll() {
    held.length = 0;
    softSrc.clear();
    das.t = 0;
    das.arr = 0;
    document.querySelectorAll('.pad-btn.is-down').forEach((b) => b.classList.remove('is-down'));
  }

  /** Thao tác một lần: xoay, thả thẳng, giữ. */
  function act(name) {
    if (!canAct()) return;
    if (name === 'cw' || name === 'ccw') {
      if (E.rotate(game, name === 'cw' ? 1 : -1) >= 0) {
        sfx('flip', { volume: 0.5, pitch: name === 'cw' ? 1 : 0.9 });
        drawAll();
      }
    } else if (name === 'hard') {
      const res = E.hardDrop(game);
      onLock(res, now(), true);
      drawAll();
    } else if (name === 'hold') {
      if (E.hold(game)) {
        sfx('pop', { volume: 0.7 });
        if (game.over) gameOver();
        drawAll();
      } else {
        sfx('error', { volume: 0.5 });
      }
    }
  }

  function stepAutoRepeat(dt) {
    const d = curDir();
    if (!d) return;
    const before = das.t;
    das.t += dt;
    if (das.t < DAS_MS) return;
    das.arr += before < DAS_MS ? ARR_MS : dt; // vừa đủ DAS: đi ngay một ô
    while (das.arr >= ARR_MS) {
      das.arr -= ARR_MS;
      if (!E.move(game, d)) {
        das.arr = 0;
        break;
      }
    }
  }

  /* ---------------- Vòng lặp ---------------- */
  let rafId = 0;
  let lastT = 0;
  let summaryAcc = 0;

  function frame(t) {
    rafId = 0;
    const dt = lastT ? Math.min(t - lastT, 100) : 16;
    lastT = t;
    if (clearAnim && t - clearAnim.t0 >= CLEAR_MS) clearAnim = null;
    if (trail && t - trail.t0 >= TRAIL_MS) trail = null;

    if (mode === 'playing' && !modalOpen()) {
      if (!clearAnim) {
        stepAutoRepeat(dt);
        const before = game.score;
        const res = E.update(game, dt, softSrc.size > 0);
        if (res) onLock(res, t, false);
        if (game.score !== before) updateHud();
      }
      summaryAcc += dt;
      if (summaryAcc >= SUMMARY_MS) {
        summaryAcc = 0;
        persist();
      }
    }
    drawAll();
    if ((mode === 'playing' && !modalOpen()) || clearAnim || trail) rafId = requestAnimationFrame(frame);
    else lastT = 0;
  }

  function kick() {
    if (rafId) return;
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  /* ---------------- Modal ---------------- */
  let openId = null;
  let returnFocus = null;
  let confirmAction = null;
  function modalOpen() {
    return openId !== null;
  }

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
    const target =
      mode === 'paused' ? $('btn-resume') : mode === 'over' ? $('btn-again') : mode === 'idle' ? $('btn-start') : null;
    if (target) target.focus();
    else if (returnFocus && document.body.contains(returnFocus) && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else boardEl.focus();
    returnFocus = null;
    kick();
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

  /* ---------------- Cài đặt ---------------- */
  function syncSettingsUI() {
    document.querySelectorAll('.segmented').forEach((group) => {
      const cur = group.dataset.setting === 'lang' ? window.I18N.lang : String(settings[group.dataset.setting]);
      group.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === cur;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('input.switch').forEach((input) => {
      input.checked = input.dataset.setting === 'sound' ? !!SFX && !SFX.isMuted() : !!settings[input.dataset.setting];
    });
  }

  function applyPadVisibility() {
    const show = settings.showPad || coarsePointer.matches;
    const changed = appEl.classList.contains('has-pad') !== show;
    appEl.classList.toggle('has-pad', show);
    if (changed) fitBoard();
  }

  function chooseSetting(key, value) {
    if (key === 'theme') {
      settings.theme = value;
      saveSettings();
      applyTheme();
    } else if (key === 'startLevel') {
      settings.startLevel = Number(value);
      saveSettings();
      if (!game || mode === 'idle') updateHud();
    } else if (key === 'lang') {
      // Lưu ván (I18N.beforeReload) rồi tải lại trang theo ngôn ngữ mới
      if (value !== window.I18N.lang) window.I18N.set(value);
      return;
    }
    syncSettingsUI();
  }

  document.querySelectorAll('.segmented').forEach((group) => {
    const key = group.dataset.setting;
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) chooseSetting(key, b.dataset.value);
    });
    // Phím mũi tên di chuyển trong nhóm radio
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const btns = Array.from(group.querySelectorAll('button'));
      const i = btns.indexOf(document.activeElement);
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = btns[(i + step + btns.length) % btns.length];
      chooseSetting(key, next.dataset.value);
      next.focus();
    });
  });

  // Âm thanh: lưu ở khóa chung với cổng (qua SDK), không vào settings; không có SDK âm thanh thì ẩn hàng này
  $('setting-sound').hidden = !SFX;
  if (SFX && SFX.onChange) SFX.onChange(syncSettingsUI);

  document.querySelectorAll('input.switch').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.setting === 'sound') {
        if (SFX) SFX.setMuted(!input.checked);
        sfx('tap');
        return;
      }
      settings[input.dataset.setting] = input.checked;
      saveSettings();
      if (input.dataset.setting === 'showPad') applyPadVisibility();
      drawAll();
    });
  });

  /* ---------------- Thống kê (modal) ---------------- */
  function renderStats() {
    $('st-played').textContent = fmt(stats.played);
    $('st-best').textContent = fmt(stats.best);
    $('st-lines').textContent = fmt(stats.mostLines);
    $('st-level').textContent = stats.highestLevel ? String(stats.highestLevel) : '—';
    $('st-total').textContent = fmt(stats.totalLines);
    $('st-quads').textContent = fmt(stats.quads);
  }

  let resetArmed = false;
  let resetTimer = 0;
  const resetBtn = $('btn-stats-reset');
  function disarmReset() {
    resetArmed = false;
    clearTimeout(resetTimer);
    resetBtn.textContent = T('stats.reset');
    resetBtn.classList.remove('btn-danger');
  }
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      // Bấm hai lần để tránh xóa nhầm
      resetArmed = true;
      resetBtn.textContent = T('stats.resetConfirm');
      resetBtn.classList.add('btn-danger');
      resetTimer = setTimeout(disarmReset, 3500);
      return;
    }
    disarmReset();
    stats = emptyStats();
    counted = false; // ván đang dở sẽ được tính lại khi khóa khối tiếp theo
    bestAtStart = 0;
    persist();
    renderStats();
    updateHud();
    toast(T('stats.resetDone'));
  });

  /* ---------------- Nút bấm ---------------- */
  $('btn-new').addEventListener('click', requestNewGame);
  $('btn-start').addEventListener('click', startNewGame);
  $('btn-again').addEventListener('click', () => {
    // Bỏ qua cú bấm ngay sau khi thua (vd. nhả phím Space của lần thả thẳng cuối trên nút vừa được focus)
    if (now() - overAt < 600) return;
    startNewGame();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNewGame);
  pauseBtn.addEventListener('click', () => (mode === 'paused' ? resume() : pause(true)));
  $('btn-confirm-ok').addEventListener('click', () => {
    const fn = confirmAction;
    confirmAction = null;
    if (fn) fn();
    else closeModal();
  });
  $('btn-settings').addEventListener('click', () => {
    syncSettingsUI();
    openModal('modal-settings');
  });
  $('btn-stats').addEventListener('click', () => {
    disarmReset();
    renderStats();
    openModal('modal-stats');
  });

  /* ---------------- Bàn phím ---------------- */
  function keyName(e) {
    // Dùng e.code làm dự phòng khi bộ gõ tiếng Việt / bố cục phím khác đổi e.key
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowUp') return k;
    if (k === ' ' || e.code === 'Space') return 'Space';
    if (k === 'Escape') return 'Escape';
    if (k === 'Shift') return 'Shift';
    if (k && k.length === 1 && /[a-z]/i.test(k)) return k.toUpperCase();
    const code = e.code || '';
    if (code.startsWith('Key')) return code.slice(3);
    return k;
  }

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
    const k = keyName(e);
    if (mode === 'paused') {
      if ((k === 'P' || k === 'Escape') && !e.repeat) {
        e.preventDefault();
        resume();
      }
      return;
    }
    if (mode !== 'playing') return;
    // Đang chơi: các phím điều khiển không kích hoạt nút đang focus
    switch (k) {
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        if (!e.repeat) pressDir('key' + k, k === 'ArrowLeft' ? -1 : 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!e.repeat) pressSoft('key');
        break;
      case 'Space':
        e.preventDefault();
        if (!e.repeat) act('hard');
        break;
      case 'ArrowUp':
      case 'X':
        e.preventDefault();
        if (!e.repeat) act('cw');
        break;
      case 'Z':
        e.preventDefault();
        if (!e.repeat) act('ccw');
        break;
      case 'C':
      case 'Shift':
        e.preventDefault();
        if (!e.repeat) act('hold');
        break;
      case 'P':
      case 'Escape':
        e.preventDefault();
        if (!e.repeat) pause(true);
        break;
      default:
    }
  });

  document.addEventListener('keyup', (e) => {
    const k = keyName(e);
    if (k === 'ArrowLeft' || k === 'ArrowRight') releaseDir('key' + k);
    else if (k === 'ArrowDown') releaseSoft('key');
    else if (k === 'Space' && mode === 'playing' && !modalOpen()) e.preventDefault();
  });

  /* ---------------- Nút bấm cảm ứng ----------------
   * Bấm bằng pointerdown (không chờ click) cho nhạy; giữ ◀ ▶ để lặp, giữ ▼ để thả nhanh.
   * Bàn phím (Tab + Enter) vẫn dùng được qua sự kiện click có detail = 0. */
  const pad = $('pad');
  pad.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.pad-btn');
    if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try {
      b.setPointerCapture(e.pointerId);
    } catch (err) {}
    b.classList.add('is-down');
    const a = b.dataset.act;
    const src = 'pad' + e.pointerId;
    b.dataset.src = src;
    if (a === 'left' || a === 'right') pressDir(src, a === 'left' ? -1 : 1);
    else if (a === 'soft') pressSoft(src);
    else act(a);
  });
  function padRelease(e) {
    const b = e.target.closest && e.target.closest('.pad-btn');
    if (!b) return;
    b.classList.remove('is-down');
    const src = b.dataset.src;
    if (!src) return;
    releaseDir(src);
    releaseSoft(src);
    delete b.dataset.src;
  }
  pad.addEventListener('pointerup', padRelease);
  pad.addEventListener('pointercancel', padRelease);
  pad.addEventListener('lostpointercapture', padRelease);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.addEventListener('click', (e) => {
    const b = e.target.closest('.pad-btn');
    if (!b || e.detail !== 0) return; // chỉ nhận click từ bàn phím
    const a = b.dataset.act;
    if (a === 'left' || a === 'right') {
      if (canAct() && E.move(game, a === 'left' ? -1 : 1)) drawAll();
    } else if (a === 'soft') {
      pressSoft('click');
      releaseSoft('click');
    } else act(a);
  });

  /* ---------------- Cử chỉ trên bàn chơi (bật trong Cài đặt) ----------------
   * Chạm: xoay phải. Kéo ngang: đi theo ngón tay từng ô. Kéo chậm xuống: thả nhanh từng ô.
   * Vuốt nhanh xuống: thả thẳng. Vuốt lên: giữ khối. */
  let gesture = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (!settings.gestures || mode !== 'playing' || modalOpen()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gesture) return; // bỏ qua ngón thứ hai
    try {
      boardEl.setPointerCapture(e.pointerId);
    } catch (err) {}
    const t = now();
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: t, axis: null, lastY: e.clientY, lastT: t, acted: false };
  });
  boardEl.addEventListener('pointermove', (e) => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    const t = now();
    const tx = e.clientX - g.x0;
    const ty = e.clientY - g.y0;
    if (!g.axis && Math.max(Math.abs(tx), Math.abs(ty)) > Math.max(8, cell * 0.4)) {
      g.axis = Math.abs(tx) > Math.abs(ty) ? 'h' : 'v';
    }
    if (g.axis === 'h' && canAct()) {
      let dx = e.clientX - g.ax;
      while (Math.abs(dx) >= cell) {
        const dir = dx > 0 ? 1 : -1;
        E.move(game, dir);
        g.ax += dir * cell;
        dx -= dir * cell;
        g.acted = true;
      }
      drawAll();
    } else if (g.axis === 'v' && canAct()) {
      const speed = (e.clientY - g.lastY) / Math.max(1, t - g.lastT);
      if (speed < 0.7) {
        // Kéo chậm: thả nhanh theo ngón tay
        let dy = e.clientY - g.ay;
        let moved = false;
        while (dy >= cell) {
          if (E.softDrop(game)) moved = true;
          g.ay += cell;
          dy -= cell;
        }
        if (moved) {
          game.gravAcc = 0;
          g.acted = true;
          updateHud();
          drawAll();
        }
      } else {
        g.ay = e.clientY;
      }
    }
    g.lastY = e.clientY;
    g.lastT = t;
  });
  function endGesture(e, cancelled) {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    gesture = null;
    if (cancelled || !canAct()) return;
    const dt = Math.max(1, now() - g.t0);
    const dy = e.clientY - g.y0;
    const dx = e.clientX - g.x0;
    if (!g.axis && dt < 350 && Math.hypot(dx, dy) < 12) act('cw');
    else if (g.axis === 'v' && dy > cell * 1.5 && dy / dt > 0.55) act('hard');
    else if (g.axis === 'v' && dy < -cell * 1.5 && -dy / dt > 0.35) act('hold');
  }
  boardEl.addEventListener('pointerup', (e) => endGesture(e, false));
  boardEl.addEventListener('pointercancel', (e) => endGesture(e, true));
  // Chặn cuộn trang bằng cảm ứng khi thao tác trên bàn chơi (dự phòng cho trình duyệt cũ)
  boardEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Tự dừng / lưu khi rời trang ---------------- */
  window.addEventListener('pagehide', () => {
    pause(false);
    persist();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pause(false);
      persist();
    }
  });
  window.addEventListener('blur', () => pause(false));
  // Đổi ngôn ngữ (ở đây hoặc ở cổng) sẽ tải lại trang: tạm dừng và lưu ván trước
  window.I18N.beforeReload = () => {
    pause(false);
    persist();
  };

  const onSchemeChange = () => {
    if (settings.theme === 'auto') applyTheme();
  };
  const schemeMQ = window.matchMedia('(prefers-color-scheme: dark)');
  if (schemeMQ.addEventListener) {
    schemeMQ.addEventListener('change', onSchemeChange);
    coarsePointer.addEventListener('change', applyPadVisibility);
  }

  if (window.ResizeObserver) new ResizeObserver(() => fitBoard()).observe(appEl);
  else window.addEventListener('resize', fitBoard);
  // Font tải xong có thể đổi chiều cao thanh trên / điểm
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBoard);

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  readPalette();
  syncSettingsUI();
  applyPadVisibility();
  applyTheme();
  if (loadGame()) {
    // Có ván đang dở: mở lại ở trạng thái tạm dừng
    mode = 'paused';
    PN && PN.gameStart({ mode: 'lv' + game.startLevel, resume: true });
    $('pause-sub').textContent = detailText();
    showOverlay('pause');
  } else {
    removeKey(KEYS.game);
    showOverlay('start');
  }
  updateHud();
  fitBoard();
  writeSummary();
  (mode === 'paused' ? $('btn-resume') : $('btn-start')).focus({ preventScroll: true });
})();
