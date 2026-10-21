/* =====================================================================
 * Phá Gạch - Logic giao diện (cần engine.js nạp trước)
 *   - Vẽ sân trên <canvas> theo DPR: sân logic 400 x 560 co giãn vừa khung, gạch vẽ sẵn ra lớp riêng
 *   - Vòng lặp bước cố định 120 bước / giây (engine), vẽ theo requestAnimationFrame
 *   - Điều khiển: kéo tương đối ở bất kỳ đâu trên vùng bàn chơi (cảm ứng), rê chuột, phím ←/→ A/D,
 *     Space / chạm / nhấp để phóng bóng, P / Esc tạm dừng (tự dừng khi ẩn trang, mất focus)
 *   - Hiệu ứng: mảnh vỡ, rung màn hình nhẹ, điểm bay lên, dòng chữ vào màn / qua màn
 *   - Lưu ván, cài đặt, thống kê vào localStorage; ghi tóm tắt cho cổng PlayNine
 * ===================================================================== */
(function () {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'phagach' });

  const APP_VERSION = '1.3.0';
  const E = window.PhaGach;
  const I18N = window.I18N;
  const t = I18N.t;
  // Chữ tĩnh trong trang theo ngôn ngữ đã chọn, trước khi vẽ nội dung động
  I18N.apply();

  // Mọi khóa localStorage đều có tiền tố playnine-phagach-
  const KEYS = {
    settings: 'playnine-phagach-settings-v1',
    save: 'playnine-phagach-save-v1',
    stats: 'playnine-phagach-stats-v1',
    summary: 'playnine-phagach-summary-v1',
  };
  const SAVE_EVERY = 4000; // ms, chu kỳ lưu ván + tóm tắt khi đang chơi
  const MAX_CATCHUP = 12; // số bước vật lý tối đa trong một khung hình (máy giật thì bỏ bớt)
  const CLEAR_MS = 1500; // dừng lại bao lâu khi qua màn trước khi sang màn mới
  const OVER_DELAY = 700; // chờ trước khi hiện lớp phủ thua
  const BANNER_MS = 1500;
  const TAP_MS = 300; // chạm ngắn hơn ngần này và...
  const TAP_MOVE = 10; // ...di chuyển ít hơn ngần này px thì tính là chạm (phóng bóng)
  const THEMES = ['auto', 'light', 'dark'];
  const SENS = { low: 1.1, normal: 1.5, high: 2.1 }; // hệ số kéo: 1px ngón tay = bao nhiêu px sân (theo bề ngang)
  const BRICK_VARS = { r: '--b-r', o: '--b-o', y: '--b-y', g: '--b-g', c: '--b-c', b: '--b-b', p: '--b-p' };
  const POWER_VARS = { wide: '--pw-wide', multi: '--pw-multi', slow: '--pw-slow', fire: '--pw-fire', life: '--pw-life' };

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const fmt = (n) => I18N.fmtNumber(n);
  // Âm thanh / pháo giấy của SDK: SDK cũ hoặc thiếu thì bỏ qua, không bao giờ làm hỏng game
  const sfx = (name, o) => { try { window.PlayNine?.sfx?.play(name, o); } catch (e) { /* bỏ qua */ } };
  const confetti = () => { try { window.PlayNine?.fx?.confetti(); } catch (e) { /* bỏ qua */ } };
  // Nhiều bước vật lý trong một khung hình dồn tiếng lại: mỗi loại một tiếng / khung, cách nhau tối thiểu SFX_GAP ms
  const SFX_GAP = 45;
  const sfxQueue = new Map();
  const sfxLast = {};
  const queueSfx = (name, o) => { if (!sfxQueue.has(name)) sfxQueue.set(name, o); };
  function flushSfx() {
    if (!sfxQueue.size) return;
    const now = performance.now();
    sfxQueue.forEach((o, name) => {
      if (now - (sfxLast[name] || 0) < SFX_GAP) return;
      sfxLast[name] = now;
      sfx(name, o);
    });
    sfxQueue.clear();
  }
  let comboMult = 1; // hệ số combo đã báo bằng tiếng; về 1 khi bóng chạm thanh đỡ
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
      sens: SENS[s.sens] ? s.sens : 'normal',
      vibrate: s.vibrate !== false,
      guideSeen: s.guideSeen === true,
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
    readColors();
    draw();
  }

  /* ---------------- Thống kê ---------------- */
  function emptyStats() {
    return { played: 0, best: 0, highestLevel: 0, bricks: 0, bestChain: 0, won: 0 };
  }
  function loadStats() {
    const s = readJSON(KEYS.stats);
    const out = emptyStats();
    if (!s || typeof s !== 'object') return out;
    Object.keys(out).forEach((k) => (out[k] = Number.isInteger(s[k]) && s[k] >= 0 ? s[k] : 0));
    return out;
  }
  let stats = loadStats();
  const saveStats = () => writeJSON(KEYS.stats, stats);

  /* ---------------- Trạng thái ván ----------------
   * mode: 'idle' (lớp phủ bắt đầu, sân màn 1 làm nền) | 'playing' | 'paused' | 'over'
   * counted: ván đã được tính vào "ván đã chơi" chưa (tính khi phóng bóng lần đầu)
   * bestAtStart: điểm cao nhất lúc bắt đầu ván, để báo "Kỷ lục mới" */
  let game = E.newGame();
  let mode = 'idle';
  let counted = false;
  let bestAtStart = 0;
  let clearLeft = 0; // ms còn lại của đoạn dừng qua màn

  const hasOpenGame = () => !!game && game.phase !== 'over' && (mode === 'playing' || mode === 'paused');
  const inProgress = () => hasOpenGame() && counted;

  function loadGame() {
    const saved = readJSON(KEYS.save);
    const g = saved && E.restore(saved.game);
    if (!g || g.phase === 'over') return false;
    game = g;
    counted = saved.counted === true;
    bestAtStart = Number.isInteger(saved.bestAtStart) ? saved.bestAtStart : stats.best;
    if (game.phase === 'clear') E.nextLevel(game); // lưu đúng lúc qua màn: vào luôn màn mới
    return true;
  }
  function saveGame() {
    if (inProgress()) writeJSON(KEYS.save, { game, counted, bestAtStart });
    else removeKey(KEYS.save);
  }

  /** Tóm tắt cho thẻ game ở cổng PlayNine. */
  function writeSummary() {
    const list = [];
    if (stats.best > 0) list.push({ value: fmt(stats.best), label: t('sum.best') });
    if (stats.highestLevel > 0) list.push({ value: String(stats.highestLevel), label: t('sum.level') });
    if (stats.bricks > 0) list.push({ value: fmt(stats.bricks), label: t('sum.bricks') });

    let note = t('sum.note');
    if (stats.best > 0) note = t('sum.noteBest', { score: fmt(stats.best), level: stats.highestLevel });

    let resume = null;
    if (inProgress()) {
      resume = {
        title: t('sum.resume'),
        detail: detailText(),
        pct: null,
      };
    }
    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: stats.won,
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

  /** Cập nhật kỷ lục theo ván đang chơi. */
  function updateRecords() {
    if (!counted) return;
    if (game.score > stats.best) stats.best = game.score;
    if (game.level > stats.highestLevel) stats.highestLevel = game.level;
    if (game.bestChain > stats.bestChain) stats.bestChain = game.bestChain;
  }

  /* ---------------- DOM ---------------- */
  const appEl = $('app');
  const boardEl = $('board');
  const boardArea = $('board-area');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const pauseBtn = $('btn-pause');
  const readyHint = $('ready-hint');
  const overlays = { start: $('overlay-start'), pause: $('overlay-pause'), over: $('overlay-over') };

  /* ---------------- Màu (đọc từ biến CSS để theo giao diện sáng / tối) ---------------- */
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, def) => cs.getPropertyValue(name).trim() || def;
    colors = {
      bg: v('--board-bg', '#e9dfcc'),
      band: v('--board-band', 'rgba(0,0,0,0.06)'),
      line: v('--board-line', 'rgba(0,0,0,0.08)'),
      text: v('--text', '#1d1711'),
      muted: v('--muted', '#6e6255'),
      accent: v('--accent', '#b07d1f'),
      paddle: v('--paddle', '#b07d1f'),
      paddleEdge: v('--paddle-edge', '#6e4c12'),
      ball: v('--ball', '#2a1f16'),
      shine: v('--ball-shine', 'rgba(255,255,255,0.5)'),
      strong: v('--b-strong', '#9a6b2f'),
      strong3: v('--b-strong3', '#6e4a22'),
      steel: v('--b-steel', '#868a90'),
      brick: {},
      power: {},
    };
    Object.keys(BRICK_VARS).forEach((k) => (colors.brick[k] = v(BRICK_VARS[k], '#888888')));
    Object.keys(POWER_VARS).forEach((k) => (colors.power[k] = v(POWER_VARS[k], '#888888')));
    bricksDirty = true;
  }
  const brickColor = (k) => (k.kind === 'x' ? colors.steel : k.kind === 's' ? (k.max === 3 ? colors.strong3 : colors.strong) : colors.brick[k.color]);

  /* ---------------- Canvas: kích thước theo DPR ---------------- */
  let dpr = 1;
  let scale = 1; // px canvas trên mỗi px logic
  let bricksLayer = null;
  let bricksDirty = true;

  function resize() {
    const w = boardEl.clientWidth;
    const h = boardEl.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.max(1, Math.round(w * dpr));
    const H = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      bricksDirty = true;
    }
    scale = W / E.W;
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

  /* ---------------- Vẽ gạch ---------------- */
  /** Vết nứt cố định theo vị trí viên gạch (không nhảy lung tung mỗi lần vẽ). */
  function crackPath(c, k, n) {
    let seed = (k.c * 7 + k.r * 13 + 3) >>> 0;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    c.beginPath();
    for (let i = 0; i < n; i++) {
      let x = k.x + k.w * (0.25 + 0.5 * rnd());
      let y = k.y + 1.5;
      c.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += (rnd() - 0.5) * 9;
        y += k.h / 3 - 0.5;
        c.lineTo(x, y);
      }
      // Một nhánh ngang nhỏ
      c.moveTo(x - 1, k.y + k.h * 0.5);
      c.lineTo(x + (rnd() < 0.5 ? -7 : 7), k.y + k.h * (0.35 + 0.3 * rnd()));
    }
  }

  function drawBrick(c, k) {
    const x = k.x + 1.2;
    const y = k.y + 1.2;
    const w = k.w - 2.4;
    const h = k.h - 2.4;
    const color = brickColor(k);
    if (k.kind === 'x') {
      // Thép: dải màu xám chuyển sắc, vệt sáng chéo, bốn đinh tán
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      c.fillStyle = color;
      roundRect(c, x, y, w, h, 3);
      c.fill();
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.beginPath();
      c.moveTo(x + w * 0.3, y + h);
      c.lineTo(x + w * 0.5, y);
      c.lineTo(x + w * 0.62, y);
      c.lineTo(x + w * 0.42, y + h);
      c.fill();
      c.restore();
      c.fillStyle = 'rgba(0,0,0,0.35)';
      [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]].forEach(([bx, by]) => {
        c.beginPath();
        c.arc(bx, by, 1.4, 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.lineWidth = 1;
      roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, 2.6);
      c.stroke();
      return;
    }
    c.fillStyle = color;
    roundRect(c, x, y, w, h, 3.5);
    c.fill();
    // Mép sáng phía trên, bóng tối phía dưới
    c.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(c, x + 2.5, y + 2, w - 5, 3.2, 1.6);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.16)';
    roundRect(c, x + 1, y + h - 3.4, w - 2, 2.6, 1.3);
    c.fill();
    if (k.kind === 's') {
      // Gạch cứng: viền trong + chấm đinh, nứt dần theo số lần đã đập
      c.strokeStyle = 'rgba(0,0,0,0.28)';
      c.lineWidth = 1;
      roundRect(c, x + 2.5, y + 2.5, w - 5, h - 5, 2);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < k.max; i++) {
        c.beginPath();
        c.arc(x + w / 2 + (i - (k.max - 1) / 2) * 6, y + h / 2, 1.3, 0, Math.PI * 2);
        c.fill();
      }
      const cracks = k.max - k.hp;
      if (cracks > 0) {
        c.strokeStyle = 'rgba(20,12,6,0.7)';
        c.lineWidth = 1.2;
        c.lineJoin = 'round';
        crackPath(c, k, cracks);
        c.stroke();
      }
    }
  }

  /** Lớp gạch vẽ sẵn (chỉ vẽ lại khi gạch thay đổi / đổi cỡ / đổi giao diện). */
  function bricksImage() {
    if (!bricksLayer) bricksLayer = document.createElement('canvas');
    if (bricksLayer.width !== canvas.width || bricksLayer.height !== canvas.height) {
      bricksLayer.width = canvas.width;
      bricksLayer.height = canvas.height;
      bricksDirty = true;
    }
    if (!bricksDirty) return bricksLayer;
    bricksDirty = false;
    const c = bricksLayer.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, bricksLayer.width, bricksLayer.height);
    c.setTransform(scale, 0, 0, scale, 0, 0);
    game.bricks.forEach((k) => drawBrick(c, k));
    return bricksLayer;
  }

  /* ---------------- Biểu tượng vật phẩm ---------------- */
  /** Vẽ ký hiệu trắng của vật phẩm, tâm (x, y), cao khoảng s. */
  function drawGlyph(c, type, x, y, s) {
    c.save();
    c.translate(x, y);
    c.scale(s / 10, s / 10);
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 1.8;
    c.beginPath();
    if (type === 'wide') {
      c.moveTo(-7, 0);
      c.lineTo(7, 0);
      c.moveTo(-4, -3);
      c.lineTo(-7, 0);
      c.lineTo(-4, 3);
      c.moveTo(4, -3);
      c.lineTo(7, 0);
      c.lineTo(4, 3);
      c.stroke();
    } else if (type === 'multi') {
      [-5, 0, 5].forEach((dx) => {
        c.moveTo(dx + 2.2, 0);
        c.arc(dx, 0, 2.2, 0, Math.PI * 2);
      });
      c.fill();
    } else if (type === 'slow') {
      c.lineWidth = 1.6;
      c.arc(0, 0, 4.2, 0, Math.PI * 2);
      c.moveTo(0, -2.4);
      c.lineTo(0, 0);
      c.lineTo(1.8, 1.2);
      c.stroke();
    } else if (type === 'fire') {
      c.moveTo(0, -4.8);
      c.bezierCurveTo(2.6, -2.4, 3.9, -0.6, 3.9, 1.4);
      c.arc(0, 1.4, 3.9, 0, Math.PI, false);
      c.bezierCurveTo(-3.9, 0.1, -3.3, -0.9, -2.4, -1.8);
      c.bezierCurveTo(-2.3, -0.7, -1.8, 0, -1.1, 0.3);
      c.bezierCurveTo(-1.4, -1.5, -1, -3.1, 0, -4.8);
      c.fill();
    } else if (type === 'life') {
      c.moveTo(0, 4.2);
      c.lineTo(-4, 0.3);
      c.bezierCurveTo(-5.6, -1.5, -3.6, -4.6, -1.4, -3.4);
      c.lineTo(0, -2.3);
      c.lineTo(1.4, -3.4);
      c.bezierCurveTo(3.6, -4.6, 5.6, -1.5, 4, 0.3);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function drawCapsule(c, type, x, y, w, h) {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(c, x - w / 2 + 1, y - h / 2 + 2, w, h, h / 2);
    c.fill();
    c.fillStyle = colors.power[type];
    roundRect(c, x - w / 2, y - h / 2, w, h, h / 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(c, x - w / 2 + 4, y - h / 2 + 2, w - 8, h * 0.28, h * 0.14);
    c.fill();
    drawGlyph(c, type, x, y, h * 0.75);
  }

  /* ---------------- Hiệu ứng ---------------- */
  let particles = [];
  let popups = [];
  let trails = []; // vệt bóng xuyên
  let shake = null; // { amp, t0, dur }
  const fxOn = () => !reduceMotion.matches;

  function burst(x, y, w, h, color, count) {
    if (!fxOn()) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 150;
      particles.push({
        x: x + Math.random() * w,
        y: y + Math.random() * h,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        life: 0,
        max: 0.45 + Math.random() * 0.35,
        size: 2 + Math.random() * 3,
        color,
      });
    }
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  function popup(x, y, text, color) {
    if (!fxOn()) return;
    popups.push({ x, y, text, color: color || colors.text, life: 0, max: 0.8 });
    if (popups.length > 30) popups.shift();
  }

  function shakeScreen(amp, dur) {
    if (!fxOn()) return;
    if (shake && shake.amp > amp && performance.now() - shake.t0 < shake.dur) return;
    shake = { amp, t0: performance.now(), dur };
  }

  function updateFx(dt) {
    const s = dt / 1000;
    particles = particles.filter((p) => {
      p.life += s;
      p.vy += 520 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      return p.life < p.max;
    });
    popups = popups.filter((p) => {
      p.life += s;
      p.y -= 34 * s;
      return p.life < p.max;
    });
    trails = trails.filter((t) => {
      t.life += s;
      return t.life < 0.18;
    });
    if (shake && performance.now() - shake.t0 > shake.dur) shake = null;
  }
  const fxActive = () => particles.length > 0 || popups.length > 0 || trails.length > 0 || !!shake;

  /* ---------------- Vẽ một khung hình ---------------- */
  function drawBand() {
    // Dải trên cùng: mạng bên trái, chuỗi ở giữa, vật phẩm đang có hiệu lực bên phải
    ctx.fillStyle = colors.band;
    ctx.fillRect(0, 0, E.W, 34);
    for (let i = 0; i < game.lives; i++) {
      const x = 16 + i * 17;
      ctx.fillStyle = colors.ball;
      ctx.beginPath();
      ctx.arc(x, 17, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.shine;
      ctx.beginPath();
      ctx.arc(x - 1.8, 15, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    const mult = E.comboMult(game);
    if (mult > 1 && game.phase === 'play') {
      ctx.font = '800 15px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.accent;
      ctx.fillText(t('canvas.combo', { n: mult }), E.W / 2 - 6, 18);
    }
    let x = E.W - 8;
    E.TIMED.slice().reverse().forEach((k) => {
      const left = game.effects[k];
      if (left <= 0 || game.phase === 'clear') return; // qua màn thì vật phẩm sắp hết tác dụng: thôi hiện
      const w = 46;
      x -= w;
      const frac = clamp(left / E.POWER_MS[k], 0, 1);
      const blink = fxOn() && left < 2000 && Math.floor(left / 160) % 2 === 0;
      ctx.globalAlpha = blink ? 0.45 : 1;
      ctx.fillStyle = 'rgba(128,128,128,0.25)';
      roundRect(ctx, x, 9, w, 16, 8);
      ctx.fill();
      ctx.save();
      roundRect(ctx, x, 9, w, 16, 8);
      ctx.clip();
      ctx.fillStyle = colors.power[k];
      ctx.fillRect(x, 9, w * frac, 16);
      ctx.restore();
      drawGlyph(ctx, k, x + 11, 17, 11);
      ctx.font = '700 10px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(Math.ceil(left / 1000) + 's', x + 21, 17.5);
      ctx.globalAlpha = 1;
      x -= 6;
    });
  }

  function drawPaddle() {
    const p = game.paddle;
    const x = p.x - p.w / 2;
    const y = E.PADDLE_Y;
    const h = E.PADDLE_H;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(ctx, x + 1, y + 3, p.w, h, h / 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, colors.paddle);
    g.addColorStop(1, colors.paddleEdge);
    ctx.fillStyle = g;
    roundRect(ctx, x, y, p.w, h, h / 2);
    ctx.fill();
    // Hai đầu thanh: đổi màu khi đang "Mở rộng thanh"
    ctx.fillStyle = game.effects.wide > 0 ? colors.power.wide : colors.paddleEdge;
    roundRect(ctx, x, y, 12, h, h / 2);
    ctx.fill();
    roundRect(ctx, x + p.w - 12, y, 12, h, h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, x + 8, y + 2, p.w - 16, 3, 1.5);
    ctx.fill();
  }

  function drawBalls() {
    const fire = game.effects.fire > 0;
    const r = E.BALL_R;
    trails.forEach((t) => {
      ctx.globalAlpha = 0.35 * (1 - t.life / 0.18);
      ctx.fillStyle = colors.power.fire;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * (1 - t.life * 2.5), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    game.balls.forEach((b) => {
      if (fire) {
        const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, r * 2.4);
        g.addColorStop(0, 'rgba(255,190,90,0.55)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        const core = ctx.createRadialGradient(b.x - 2, b.y - 2, 0.5, b.x, b.y, r);
        core.addColorStop(0, '#fff3c4');
        core.addColorStop(0.5, '#ffb43c');
        core.addColorStop(1, colors.power.fire);
        ctx.fillStyle = core;
      } else {
        ctx.fillStyle = colors.ball;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (!fire) {
        ctx.fillStyle = colors.shine;
        ctx.beginPath();
        ctx.arc(b.x - 1.9, b.y - 2, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawFx() {
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    popups.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.font = '800 13px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.bg;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!game || !canvas.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let ox = 0;
    let oy = 0;
    if (shake) {
      const k = 1 - (performance.now() - shake.t0) / shake.dur;
      if (k > 0) {
        ox = (Math.random() * 2 - 1) * shake.amp * k;
        oy = (Math.random() * 2 - 1) * shake.amp * k;
      }
    }
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    // Đường kẻ dọc mờ trên nền
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < E.COLS; c++) {
      const x = E.GRID_X + c * E.BRICK_W;
      ctx.moveTo(x, 34);
      ctx.lineTo(x, E.H);
    }
    ctx.stroke();
    drawBand();
    ctx.setTransform(1, 0, 0, 1, ox * scale, oy * scale);
    ctx.drawImage(bricksImage(), 0, 0);
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    game.drops.forEach((d) => drawCapsule(ctx, d.type, d.x, d.y, E.DROP_W, E.DROP_H));
    drawPaddle();
    drawBalls();
    drawFx();
  }

  /* ---------------- HUD ---------------- */
  const hudEls = { score: $('score'), best: $('best'), level: $('level') };
  const hudCache = {};
  function setText(key, text) {
    if (hudCache[key] === text) return;
    hudCache[key] = text;
    hudEls[key].textContent = text;
  }
  /** Điểm vừa tăng: số điểm nảy nhẹ (tối đa ~10 lần / giây). */
  let bumpAt = 0;
  function bumpScore() {
    const now = performance.now();
    if (reduceMotion.matches || now - bumpAt < 90) return;
    bumpAt = now;
    const el = hudEls.score;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  function updateHud() {
    setText('score', fmt(game.score));
    setText('best', fmt(Math.max(stats.best, counted ? game.score : 0)));
    setText('level', String(game.level));
    const open = hasOpenGame();
    pauseBtn.disabled = !open;
    const paused = mode === 'paused';
    pauseBtn.dataset.state = paused ? 'paused' : 'running';
    const label = paused ? t('btn.resume') : t('btn.pause');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = t('btn.keySuffix', { label });
    readyHint.hidden = !(mode === 'playing' && game.phase === 'serve' && !modalOpen());
  }

  function floatScore(n) {
    if (!n || reduceMotion.matches) return;
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
  function showBanner(title, sub) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    // Khởi động lại animation
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), BANNER_MS);
  }
  function hideBanner() {
    clearTimeout(bannerTimer);
    $('banner').hidden = true;
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
  function detailText() {
    return t('detail', { level: game.level, score: fmt(game.score), n: game.lives });
  }
  function renderStartBest() {
    const el = $('start-best');
    el.hidden = !stats.best;
    el.innerHTML = t('start.best', { score: fmt(stats.best), level: stats.highestLevel });
  }

  /* ---------------- Luồng chơi ---------------- */
  function resetEffects() {
    particles = [];
    popups = [];
    trails = [];
    shake = null;
    hideBanner();
  }

  const levelTitle = (n) => t('banner.level', { n });
  const levelName = (n) => t('level.' + (((n - 1) % E.LEVELS.length) + 1));
  const powerName = (type) => t('power.' + type);
  const levelSub = (n) => levelName(n) + (E.loopOf(n) > 1 ? t('banner.loop', { n: E.loopOf(n) }) : '');

  function startNewGame() {
    closeModal();
    clearTimeout(overTimer);
    game = E.newGame();
    sfx('start');
    comboMult = 1;
    PN && PN.gameStart({ mode: 'default' });
    counted = false;
    bestAtStart = stats.best;
    mode = 'playing';
    clearLeft = 0;
    acc = 0;
    resetEffects();
    releaseInput();
    showOverlay(null);
    bricksDirty = true;
    updateHud();
    persist();
    draw();
    boardEl.focus({ preventScroll: true });
    showBanner(levelTitle(1), levelSub(1));
    kick();
    announce(t('say.newGame'));
  }

  /** Ván mới: hỏi lại nếu đang dở ván. */
  function requestNewGame() {
    if (!inProgress()) {
      startNewGame();
      return;
    }
    pause(false);
    $('confirm-text').textContent = t('confirm.textDetail', { detail: detailText().toLowerCase() });
    confirmAction = startNewGame;
    openModal('modal-confirm', $('btn-confirm-ok'));
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    mode = 'paused';
    if (focus) sfx('tap', { pitch: 0.85 });
    releaseInput();
    $('pause-sub').textContent = detailText();
    showOverlay('pause');
    updateHud();
    persist();
    draw();
    if (focus && !modalOpen()) $('btn-resume').focus();
    announce(t('say.paused'));
  }

  function resume() {
    if (mode !== 'paused' || modalOpen()) return;
    mode = 'playing';
    sfx('tap', { pitch: 1.15 });
    showOverlay(null);
    releaseInput();
    updateHud();
    boardEl.focus({ preventScroll: true });
    kick();
  }

  function togglePause() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused') resume();
  }

  let overTimer = 0;
  function gameOver() {
    mode = 'over';
    PN && PN.gameEnd({ mode: 'default', score: game.score, won: game.cleared >= E.LEVELS.length });
    releaseInput();
    updateRecords();
    hideBanner();
    const record = counted && game.score > bestAtStart && game.score > 0;
    $('over-new-best').hidden = !record;
    $('over-score').textContent = fmt(game.score);
    $('over-level').textContent = String(game.level);
    $('over-bricks').textContent = fmt(game.broken);
    // Đã phá đảo trong ván thì kết thúc bằng tiếng thắng, không thì tiếng thua
    sfxQueue.clear();
    sfx(game.cleared >= E.LEVELS.length ? 'win' : 'lose');
    updateHud();
    persist(); // ván đã xong: xóa ván lưu, resume = null
    vibrate([70, 50, 110]);
    announce(t('say.over', { score: fmt(game.score), level: game.level }) + (record ? t('say.overRecord') : ''));
    clearTimeout(overTimer);
    overTimer = setTimeout(
      () => {
        if (mode !== 'over') return;
        showOverlay('over');
        if (!modalOpen()) $('btn-again').focus();
      },
      reduceMotion.matches ? 0 : OVER_DELAY
    );
  }

  function countGame() {
    if (counted) return;
    counted = true;
    stats.played++;
    updateRecords();
  }

  /** Sang màn kế sau đoạn dừng qua màn. */
  function enterNextLevel() {
    E.nextLevel(game);
    bricksDirty = true;
    acc = 0;
    updateRecords();
    updateHud();
    persist();
    showBanner(levelTitle(game.level), levelSub(game.level));
    announce(t('say.level', { n: game.level, name: levelName(game.level) }));
  }

  /** Xử lý sự kiện của một bước vật lý: hiệu ứng, thống kê, thông báo. */
  function handleEvents(ev) {
    // Tiếng: bóng nảy thanh đỡ / tường / thép, gạch vỡ cao dần theo hàng (hàng trên cao hơn), combo tăng bậc
    if (ev.launched) queueSfx('pop', { pitch: 0.8 });
    if (ev.paddle) {
      queueSfx('tap', { pitch: 0.8 });
      comboMult = 1;
    }
    if (ev.wall) queueSfx('tick');
    if (ev.steel) queueSfx('tick', { pitch: 0.7 });
    const rowPitch = (y) => clamp(1.55 - ((y - E.GRID_Y) / 18) * 0.06, 0.85, 1.6);
    if (ev.broken.length) queueSfx('pop', { pitch: rowPitch(Math.min(...ev.broken.map((b) => b.y))) });
    if (ev.cracked.length) queueSfx('place', { pitch: rowPitch(ev.cracked[0].y) + 0.3 });
    const topMult = Math.max(1, ...ev.broken.map((b) => b.mult || 1), ...ev.cracked.map((c) => c.mult || 1));
    if (topMult > comboMult) {
      comboMult = topMult;
      queueSfx('combo', { pitch: 1 + (topMult - 2) * 0.12 });
    }
    if (ev.caught.length) queueSfx('coin');
    if (ev.ballLost && !ev.lifeLost) queueSfx('drop', { pitch: 0.8 });
    if (ev.gained) bumpScore();
    if (ev.launched) {
      countGame();
      hideBanner();
      updateHud();
    }
    if (ev.broken.length || ev.cracked.length) bricksDirty = true;
    ev.broken.forEach((b) => {
      stats.bricks++;
      const color = brickColor({ kind: b.color === 's' ? 's' : 'n', color: b.color, max: 2 });
      burst(b.x, b.y, b.w, b.h, color, 10);
      popup(b.x + b.w / 2, b.y + b.h / 2, '+' + b.points, b.mult > 1 ? colors.accent : colors.text);
      shakeScreen(1.6, 120);
    });
    ev.cracked.forEach((c) => {
      burst(c.x - 6, c.y - 4, 12, 8, colors.strong, 4);
      popup(c.x, c.y, '+' + c.points, colors.muted);
    });
    ev.caught.forEach((type) => {
      vibrate(20);
      popup(game.paddle.x, E.PADDLE_Y - 18, powerName(type) + '!', colors.power[type]);
      announce(powerName(type));
    });
    // vi viết thường tên vật phẩm sau "Hết" như cũ; en giữ nguyên
    ev.expired.forEach((type) => announce(t('power.expired', { name: I18N.lang === 'vi' ? powerName(type).toLowerCase() : powerName(type) })));
    if (ev.ballLost) shakeScreen(2, 160);
    if (ev.gained) {
      updateRecords();
      updateHud();
    }
    if (ev.cleared) {
      clearLeft = CLEAR_MS;
      if (game.level === E.LEVELS.length) stats.won++; // lần đầu qua đủ 10 màn trong ván: phá đảo
      vibrate([30, 50, 30]);
      floatScore(ev.bonus);
      const done = game.level === E.LEVELS.length;
      sfxQueue.clear();
      sfx(done ? 'win' : 'levelup');
      if (done) confetti();
      showBanner(done ? t('banner.won') : t('banner.cleared', { n: game.level }), t('banner.bonus', { n: fmt(ev.bonus) }));
      announce((done ? t('say.won') : t('say.cleared', { n: game.level })) + t('say.bonus', { n: fmt(ev.bonus) }));
      updateRecords();
      persist();
    }
    if (ev.lifeLost) {
      shakeScreen(5, 320);
      if (ev.gameOver) {
        gameOver();
        return;
      }
      vibrate([60, 40, 90]);
      sfxQueue.clear();
      sfx('error');
      comboMult = 1;
      bricksDirty = true;
      updateHud();
      persist();
      announce(t('say.lifeLost', { n: game.lives }));
    }
  }

  /* ---------------- Điều khiển ---------------- */
  // Thanh đỡ đi theo: target (kéo / chuột, px logic) nếu có, không thì theo phím đang giữ
  const keysDown = new Set(); // 'left' | 'right'
  let target = null;
  let launchReq = false;

  function releaseInput() {
    keysDown.clear();
    target = null;
    drag = null;
    launchReq = false;
  }

  function requestLaunch() {
    if (mode === 'playing' && game.phase === 'serve' && !modalOpen()) launchReq = true;
  }

  function physicsStep() {
    const dir = (keysDown.has('right') ? 1 : 0) - (keysDown.has('left') ? 1 : 0);
    const input = { dir, target: dir ? null : target, launch: launchReq };
    launchReq = false;
    const fire = game.effects.fire > 0;
    const ev = E.step(game, input);
    if (fire && fxOn()) game.balls.forEach((b) => trails.push({ x: b.x, y: b.y, life: 0 }));
    if (trails.length > 120) trails.splice(0, trails.length - 120);
    handleEvents(ev);
  }

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let lastT = 0;
  let acc = 0;
  let saveAcc = 0;

  const running = () => mode === 'playing' && !modalOpen() && document.visibilityState !== 'hidden';

  function frame(t) {
    raf = 0;
    const dt = lastT ? Math.min(t - lastT, 250) : 16;
    lastT = t;
    if (running()) {
      if (game.phase === 'clear') {
        clearLeft -= dt;
        if (clearLeft <= 0) enterNextLevel();
      } else {
        acc += dt;
        let n = 0;
        while (acc >= E.STEP_MS && n < MAX_CATCHUP && mode === 'playing' && game.phase !== 'clear') {
          acc -= E.STEP_MS;
          n++;
          physicsStep();
        }
        flushSfx();
        if (acc > E.STEP_MS || game.phase === 'clear') acc = 0; // máy quá chậm: bỏ bớt, không dồn bước
      }
      saveAcc += dt;
      if (saveAcc >= SAVE_EVERY) {
        saveAcc = 0;
        if (mode === 'playing') persist();
      }
    }
    updateFx(dt);
    draw();
    if (running() || fxActive()) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }

  function kick() {
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
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
    readyHint.hidden = true;
    // Mặc định focus vào khung hộp thoại (không vào nút "Đặt lại" để tránh bấm nhầm bằng Enter)
    const card = m.querySelector('.modal-card');
    card.tabIndex = -1;
    (focusEl || card).focus();
  }

  function closeModal() {
    if (!openId) return;
    if (openId === 'modal-help' && !settings.guideSeen) {
      settings.guideSeen = true;
      saveSettings();
    }
    $(openId).hidden = true;
    openId = null;
    const focusTarget =
      mode === 'paused' ? $('btn-resume') : mode === 'over' && !overlays.over.hidden ? $('btn-again') : mode === 'idle' ? $('btn-start') : null;
    if (focusTarget) focusTarget.focus();
    else if (returnFocus && document.body.contains(returnFocus) && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else boardEl.focus({ preventScroll: true });
    returnFocus = null;
    updateHud();
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
    document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
      const cur = group.dataset.setting === 'lang' ? I18N.lang : String(settings[group.dataset.setting]);
      group.querySelectorAll('button[data-value]').forEach((b) => {
        const on = b.dataset.value === cur;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => (sw.checked = !!settings[sw.dataset.setting]));
  }

  function chooseSetting(key, value) {
    if (key === 'theme' && THEMES.includes(value)) {
      settings.theme = value;
      applyTheme();
    } else if (key === 'sens' && SENS[value]) {
      settings.sens = value;
    } else if (key === 'lang') {
      I18N.set(value); // lưu ván (onBeforeReload) rồi tải lại theo ngôn ngữ mới
      return;
    } else {
      return;
    }
    saveSettings();
    syncSettingsUI();
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

  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      settings[sw.dataset.setting] = sw.checked;
      saveSettings();
      if (sw.dataset.setting === 'vibrate' && sw.checked) vibrate(20);
    });
  });

  /* ---------------- Âm thanh: công tắc trong Cài đặt, dùng chung trạng thái tắt tiếng với cổng ---------------- */
  const SFX = window.PlayNine && window.PlayNine.sfx;
  if (SFX && typeof SFX.isMuted === 'function' && typeof SFX.setMuted === 'function') {
    const sw = $('sound-switch');
    const sync = () => { sw.checked = !SFX.isMuted(); };
    $('setting-sound').hidden = false;
    sync();
    if (typeof SFX.onChange === 'function') SFX.onChange(sync);
    sw.addEventListener('change', () => {
      SFX.setMuted(!sw.checked);
      if (sw.checked) sfx('tap');
    });
  }

  /* ---------------- Thống kê (modal) ---------------- */
  function renderStats() {
    $('st-played').textContent = fmt(stats.played);
    $('st-best').textContent = fmt(stats.best);
    $('st-level').textContent = stats.highestLevel ? String(stats.highestLevel) : '—';
    $('st-bricks').textContent = fmt(stats.bricks);
    $('st-chain').textContent = fmt(stats.bestChain);
    $('st-won').textContent = fmt(stats.won);
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
    counted = false; // ván đang dở sẽ được tính lại khi phóng bóng lần sau
    bestAtStart = 0;
    persist();
    renderStats();
    renderStartBest();
    updateHud();
    toast(t('toast.statsReset'));
  });

  /* ---------------- Nút bấm ---------------- */
  $('btn-new').addEventListener('click', requestNewGame);
  $('btn-start').addEventListener('click', startNewGame);
  $('btn-again').addEventListener('click', startNewGame);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNewGame);
  pauseBtn.addEventListener('click', togglePause);
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
  // Focus vào nút đóng ở đầu hộp thoại để nội dung hiện từ trên xuống (không cuộn tới nút cuối)
  const openHelp = () => openModal('modal-help', document.querySelector('#modal-help .help-head .btn-icon'));
  $('btn-help').addEventListener('click', openHelp);
  $('btn-settings-help').addEventListener('click', openHelp);

  /* ---------------- Bàn phím ---------------- */
  const KEY_DIRS = { ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right', A: 'left', D: 'right' };

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
    const onControl = e.target.closest && e.target.closest('button, input');
    // Enter / Space trên nút đang focus: để nút tự xử lý
    if (onControl && (e.key === ' ' || e.key === 'Enter')) return;

    const dir = KEY_DIRS[e.key];
    if (dir) {
      if (mode !== 'playing') return;
      e.preventDefault();
      keysDown.add(dir);
      target = null; // phím giành quyền điều khiển cho tới khi rê chuột lại
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'playing') requestLaunch();
      else if (mode === 'paused') resume();
      else if (mode === 'idle' || (mode === 'over' && !overlays.over.hidden)) startNewGame();
      return;
    }
    if (e.repeat) return;
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'Escape') {
      if (mode === 'playing') pause(true);
    } else if (e.key === 'n' || e.key === 'N') {
      requestNewGame();
    } else if (e.key === 'h' || e.key === 'H' || e.key === '?') {
      openHelp();
    }
  });
  document.addEventListener('keyup', (e) => {
    const dir = KEY_DIRS[e.key];
    if (dir) keysDown.delete(dir);
  });

  /* ---------------- Chuột / cảm ứng trên vùng bàn chơi ----------------
   * Chuột: thanh đi theo vị trí chuột (tuyệt đối), nhấp để phóng bóng.
   * Cảm ứng / bút: kéo TƯƠNG ĐỐI ở bất kỳ đâu (thanh đi theo khoảng kéo nhân hệ số độ nhạy),
   * nên ngón tay không che bóng; chạm nhẹ để phóng bóng. */
  let drag = null; // { id, x0, px0, t0, moved }

  const pxToLogic = () => E.W / (boardEl.clientWidth || 1); // 1px CSS = bao nhiêu px logic
  const paddleHalf = () => game.paddle.w / 2;

  function mouseTarget(e) {
    const rect = boardEl.getBoundingClientRect();
    return clamp(((e.clientX - rect.left) / (rect.width || 1)) * E.W, paddleHalf(), E.W - paddleHalf());
  }

  boardArea.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay, button')) return; // để nút trên lớp phủ bấm bình thường
    if (mode !== 'playing' || modalOpen()) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      target = mouseTarget(e);
      requestLaunch();
      boardEl.focus({ preventScroll: true });
      return;
    }
    if (drag) return; // ngón thứ hai: bỏ qua
    drag = { id: e.pointerId, x0: e.clientX, px0: game.paddle.x, t0: performance.now(), moved: false };
    target = game.paddle.x;
    keysDown.clear();
    try {
      boardArea.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  boardArea.addEventListener('pointermove', (e) => {
    if (mode !== 'playing' || modalOpen()) return;
    if (e.pointerType === 'mouse') {
      if (keysDown.size) return;
      target = mouseTarget(e);
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x0;
    if (Math.abs(dx) > TAP_MOVE) drag.moved = true;
    const want = drag.px0 + dx * pxToLogic() * SENS[settings.sens];
    const lo = paddleHalf();
    const hi = E.W - paddleHalf();
    // Kéo quá tường thì dời mốc, để kéo ngược lại là thanh đi ngay (không có "vùng chết")
    if (want < lo || want > hi) {
      const t = clamp(want, lo, hi);
      drag.x0 = e.clientX;
      drag.px0 = t;
      target = t;
    } else {
      target = want;
    }
  });

  function endPointer(e, cancelled) {
    if (!drag || drag.id !== e.pointerId) return;
    const tap = !cancelled && !drag.moved && performance.now() - drag.t0 < TAP_MS;
    drag = null;
    if (tap) requestLaunch();
  }
  boardArea.addEventListener('pointerup', (e) => endPointer(e, false));
  boardArea.addEventListener('pointercancel', (e) => endPointer(e, true));
  boardArea.addEventListener('contextmenu', (e) => e.preventDefault());
  // Chặn cuộn trang bằng cảm ứng khi kéo (dự phòng cho trình duyệt cũ)
  boardArea.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Tự dừng / lưu khi rời trang ---------------- */
  window.addEventListener('pagehide', () => {
    pause(false);
    persist();
  });
  // Đổi ngôn ngữ (ở đây hoặc ở cổng): tạm dừng và lưu ván trước khi tải lại
  I18N.onBeforeReload = () => {
    pause(false);
    persist();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pause(false); // tự tạm dừng khi ẩn trang
      persist();
    } else {
      draw();
    }
  });
  window.addEventListener('blur', () => pause(false));

  const onSchemeChange = () => {
    if (settings.theme === 'auto') applyTheme();
  };
  const schemeMQ = window.matchMedia('(prefers-color-scheme: dark)');
  if (schemeMQ.addEventListener) schemeMQ.addEventListener('change', onSchemeChange);
  if (coarsePointer.addEventListener) coarsePointer.addEventListener('change', draw);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);
  window.addEventListener('resize', resize);
  // Font tải xong thì vẽ lại chữ trên canvas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  readColors();
  syncSettingsUI();
  applyTheme();
  if (loadGame()) {
    // Có ván đang dở: mở lại ở trạng thái tạm dừng
    mode = 'paused';
    PN && PN.gameStart({ mode: 'default', resume: true });
    $('pause-sub').textContent = detailText();
    showOverlay('pause');
  } else {
    removeKey(KEYS.save);
    renderStartBest();
    showOverlay('start');
  }
  updateHud();
  resize();
  writeSummary();
  if (!settings.guideSeen) openHelp();
  else (mode === 'paused' ? $('btn-resume') : $('btn-start')).focus({ preventScroll: true });
})();
