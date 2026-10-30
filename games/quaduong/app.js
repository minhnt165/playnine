/* =====================================================================
 * Qua Đường - Giao diện + luồng lượt chơi (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng <canvas>, nhân devicePixelRatio, tự co theo khung; vòng lặp bước cố định của engine (60 bước / giây)
 *   - Màn chờ có nút #btn-start (Space / Enter / chạm cũng bắt đầu); tự tạm dừng khi trang ẩn hoặc mở hộp thoại
 *   - Báo lượt cho cổng: bắt đầu kit.sdk.start('classic'); mở lại lượt lưu dở kit.sdk.start('classic', true);
 *     hết lượt hoặc bỏ lượt (đã có điểm / đã chơi ≥ 1 giây): kit.sdk.end({ mode, won: false, score })
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const MAX_CATCHUP = 10; // bước mô phỏng tối đa mỗi khung hình (máy quá chậm thì bỏ bớt, không dồn)
  const SWIPE_PX = 22;
  const DEATH_MS = 1100;
  const kit = PNKit.init({
    gameId: 'quaduong',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
    onSetting(key) {
      if (key === 'theme') refreshPalette();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = kit.settings.get();
  const motionMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(motionMQ && motionMQ.matches);

  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const s = kit.store.read(keys.stats, {}) || {};
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    return { played: n(s.played), best: n(s.best), total: n(s.total) };
  })();
  const saveStats = () => kit.store.write(keys.stats, stats);

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let phase = 'ready'; // ready | playing | paused | dying | over
  let restored = false; // lượt mở lại từ ván lưu, đang chờ "Chơi tiếp"
  let playMs = 0; // thời gian đã chơi của lượt này
  let face = 'up'; // hướng vịt đang nhìn
  let deathAt = 0;
  let deathCause = null;
  let deathPose = null;
  let overRecord = false;
  let fx = []; // hạt hiệu ứng (lông vịt, giọt nước)
  let cam = 0; // hàng ở mép dưới màn hình (số thực)
  let camReady = false;
  let bumpAt = -1e9;

  /* ---------------- Lưu ---------------- */
  const inRun = () => !!game && !game.over && (phase === 'playing' || phase === 'paused' || (phase === 'ready' && restored));

  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { n: stats.best }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: String(stats.best), label: t('hud.best') }] : [],
      resume: inRun() ? { title: t('app.name'), detail: t('summary.resume', { n: game.best }), pct: null } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRun()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), ms: Math.round(playMs), face });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- HUD / lớp phủ ---------------- */
  function renderHud() {
    $('score').textContent = kit.i18n.fmtNumber(game ? game.best : 0);
    $('best').textContent = kit.i18n.fmtNumber(Math.max(stats.best, game ? game.best : 0));
    $('btn-pause').hidden = phase !== 'playing';
  }
  function showOverlay(id) {
    ['overlay-start', 'overlay-pause', 'overlay-over'].forEach((o) => { $(o).hidden = o !== id; });
  }
  function showStart() {
    $('guide').hidden = !!settings.guideSeen || restored;
    $('btn-start-text').textContent = t(restored ? 'start.continue' : 'start.button');
    $('start-sub').textContent = restored ? t('start.restored', { n: game.best }) : t('start.sub');
    showOverlay('overlay-start');
  }

  /* ---------------- Luồng lượt ---------------- */
  /** Dựng lượt mới, chờ người chơi bấm Bắt đầu. */
  function setupRun() {
    game = E.newGame();
    phase = 'ready';
    restored = false;
    playMs = 0;
    face = 'up';
    fx = [];
    camReady = false;
    kit.store.remove(keys.save);
    showStart();
    renderHud();
    writeSummary();
    updateCam(0);
    draw(performance.now());
  }

  function startRun() {
    if (phase !== 'ready' || kit.modal.current()) return;
    if (!restored) kit.sdk.start(MODE); // lượt mở lại đã báo start(resume) lúc tải trang
    restored = false;
    phase = 'playing';
    if (!settings.guideSeen) kit.settings.set({ guideSeen: true });
    showOverlay(null);
    kit.sfx('start');
    renderHud();
    persist();
    kick();
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    $('pause-sub').textContent = t('pause.sub', { n: game.best });
    showOverlay('overlay-pause');
    renderHud();
    persist();
  }
  function resume() {
    if (phase !== 'paused' || kit.modal.current()) return;
    phase = 'playing';
    showOverlay(null);
    renderHud();
    kick();
  }

  /** Ghi kết quả lượt: thống kê + báo cổng. */
  function record() {
    const score = game.best;
    const isRecord = score > stats.best;
    stats.played++;
    stats.total += score;
    if (isRecord) stats.best = score;
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    return isRecord;
  }

  function onDeath(cause) {
    phase = 'dying';
    deathAt = performance.now();
    deathCause = cause;
    deathPose = E.pose(game);
    if (cause === 'off') deathPose.x = Math.max(0, Math.min(E.COLS, deathPose.x));
    overRecord = record();
    kit.store.remove(keys.save);
    writeSummary();
    renderHud();
    kit.sfx(cause === 'water' || cause === 'off' ? 'drop' : cause === 'eagle' ? 'lose' : 'capture');
    vibrate([60, 40, 90]);
    spawnDeathFx(cause);
    $('live').textContent = t('live.over', { n: game.best });
    kick();
  }

  function showOver() {
    phase = 'over';
    $('over-cause').textContent = t('cause.' + deathCause);
    $('over-score').textContent = kit.i18n.fmtNumber(game.best);
    $('over-best').textContent = kit.i18n.fmtNumber(stats.best);
    $('over-record').hidden = !overRecord;
    showOverlay('overlay-over');
    renderHud();
    if (overRecord && game.best >= 5) {
      kit.sfx('win');
      kit.confetti();
    } else kit.sfx('lose');
  }

  function again() {
    if (phase !== 'over') return;
    setupRun();
    startRun();
  }

  /** Ván mới: lượt đang dở mà đã có điểm / đã chơi ≥ 1 giây thì hỏi trước (bỏ lượt = ghi điểm hiện có). */
  function requestNew() {
    if (phase === 'dying') return;
    if (inRun() && (game.best > 0 || playMs >= 1000)) {
      pause();
      kit.modal.open('modal-confirm');
    } else setupRun();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inRun()) record();
    setupRun();
  }

  /* ---------------- Điều khiển ---------------- */
  function hopInput(dir) {
    if (phase === 'ready' && !restored) startRun();
    if (phase !== 'playing' || kit.modal.current()) return;
    face = dir;
    E.input(game, dir);
    handleEvents();
    kick();
  }

  function vibrate(p) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* bỏ qua */ }
  }

  function handleEvents() {
    for (const ev of E.drain(game)) {
      if (ev.type === 'hop') kit.sfx('move');
      else if (ev.type === 'bump') {
        bumpAt = performance.now();
        kit.sfx('tap');
      } else if (ev.type === 'score') {
        renderHud();
        if (ev.score % 25 === 0) kit.sfx('coin');
      } else if (ev.type === 'die') onDeath(ev.cause);
    }
  }

  const KEYMAP = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) {
      e.preventDefault();
      if (!e.repeat) hopInput(KEYMAP[k]);
      return;
    }
    if (k === ' ' || k === 'enter') {
      // nút đang được focus tự xử lý Space / Enter
      if (e.target && e.target.closest && e.target.closest('button, input, a')) return;
      if (phase === 'ready') startRun();
      else if (phase === 'paused') resume();
      else if (phase === 'over') again();
      else return;
    } else if (k === 'p' || k === 'escape') {
      if (phase === 'playing') pause();
      else if (phase === 'paused') resume();
      else return;
    } else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });

  // Chạm = nhảy lên trước; vuốt = nhảy theo hướng vuốt (nhảy ngay khi vượt ngưỡng, không chờ nhấc tay)
  let ptr = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptr || ptr.id !== e.pointerId || ptr.fired) return;
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    if (Math.hypot(dx, dy) < SWIPE_PX) return;
    ptr.fired = true;
    hopInput(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!ptr || ptr.id !== e.pointerId) return;
    if (!ptr.fired) hopInput('up');
    ptr = null;
  });
  canvas.addEventListener('pointercancel', () => { ptr = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  $('btn-start').addEventListener('click', (e) => {
    e.stopPropagation();
    startRun();
  });
  $('overlay-start').addEventListener('click', (e) => {
    if (!e.target.closest('button')) startRun();
  });
  $('btn-pause').addEventListener('click', () => {
    pause();
    $('btn-resume').focus();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-again').addEventListener('click', again);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-best').textContent = kit.i18n.fmtNumber(stats.best);
    $('stats-avg').textContent = kit.i18n.fmtNumber(stats.played ? Math.round(stats.total / stats.played) : 0);
    $('stats-total').textContent = kit.i18n.fmtNumber(stats.total);
  });
  // Mở hộp thoại khi đang chơi thì tạm dừng trước
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-open]') && phase === 'playing') pause();
  }, true);
  document.addEventListener('change', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.setting === 'vibrate' && e.target.checked) vibrate(20);
  });
  kit.onLeave(() => {
    pause();
    persist();
  });

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let lastT = 0;
  let acc = 0;
  let saveAcc = 0;
  let lastWarn = new Set();

  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min(now - lastT, 250) : 16;
    lastT = now;
    if (phase === 'playing' && (kit.modal.current() || document.hidden)) pause();
    if (phase === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= E.STEP_MS && n < MAX_CATCHUP && phase === 'playing') {
        acc -= E.STEP_MS;
        n++;
        E.step(game);
        playMs += E.STEP_MS;
        handleEvents();
      }
      if (acc > E.STEP_MS) acc = 0;
      if (phase === 'playing') checkWarnings();
      saveAcc += dt;
      if (saveAcc >= 3000 && phase === 'playing') {
        saveAcc = 0;
        persist();
      }
    } else acc = 0;
    if (phase === 'dying' && now - deathAt >= (reduced() ? 500 : DEATH_MS)) showOver();
    updateFx(dt);
    updateCam(dt);
    draw(now);
    if (phase === 'playing' || phase === 'dying' || fx.length || now - bumpAt < 200) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  function kick() {
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  /** Tiếng "tích" khi đèn báo tàu ở gần vịt vừa bật. */
  function checkWarnings() {
    const on = new Set();
    for (let r = game.y - 1; r <= game.y + 5; r++) {
      const lane = E.laneAt(game, r);
      if (lane.type === 'rail' && E.train(lane, game.t).warn) on.add(r);
    }
    for (const r of on) if (!lastWarn.has(r)) kit.sfx('tick');
    lastWarn = on;
  }

  /* ---------------- Hiệu ứng ---------------- */
  function spawnDeathFx(cause) {
    if (reduced()) return;
    const p = deathPose;
    const water = cause === 'water' || cause === 'off';
    const n = cause === 'eagle' ? 6 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      fx.push({
        x: p.x, y: p.y + 0.5, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s + (water ? 2 : 0.5),
        life: 0.7 + Math.random() * 0.4, age: 0, r: water ? 0.06 + Math.random() * 0.05 : 0.07,
        color: water ? (Math.random() < 0.5 ? '#ffffff' : '#9fdcff') : Math.random() < 0.7 ? '#fff3c4' : '#ffd23f',
        g: water ? 9 : 3,
      });
    }
  }
  function updateFx(dt) {
    if (!fx.length) return;
    const s = dt / 1000;
    fx.forEach((f) => {
      f.age += s;
      f.x += f.vx * s;
      f.y += f.vy * s;
      f.vy -= f.g * s;
      f.vx *= 0.97;
    });
    fx = fx.filter((f) => f.age < f.life);
  }

  /* ---------------- Camera / kích thước ---------------- */
  let W = 0;
  let H = 0;
  let cs = 40; // cỡ một ô (px thiết bị)
  let ox = 0; // mép trái bàn chơi
  let hudHidden = false;

  function camTarget() {
    const p = phase === 'dying' || phase === 'over' ? deathPose : E.pose(game);
    const below = Math.min(3.2, (H / cs) * 0.24);
    // bám theo vịt, nhưng mép dưới màn hình không bao giờ tụt sau "bờ" đại bàng
    return Math.max(p.y - below, game.edge - 0.55);
  }
  function updateCam(dt) {
    if (!game || !H) return;
    const target = camTarget();
    if (!camReady || reduced()) {
      cam = target;
      camReady = true;
      return;
    }
    cam += (target - cam) * (1 - Math.exp(-dt / 110));
  }

  function resize() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = Math.round(w * dpr);
    H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    // Dọc: lấp đầy bề ngang; ngang / màn thấp: giữ ít nhất 8 hàng nhìn thấy, hai bên là cảnh nền tối đi
    cs = Math.min(W / E.COLS, H / 8);
    ox = (W - cs * E.COLS) / 2;
    hudHidden = getComputedStyle(document.querySelector('.hud')).display === 'none';
    camReady = false;
    if (game) {
      updateCam(0);
      draw(performance.now());
    }
  }

  /* ---------------- Bảng màu theo giao diện ---------------- */
  let pal = null;
  const LIGHT = {
    grass: ['#a6d96a', '#9bd25f'], grassDot: '#86bf4f', flower: ['#ffffff', '#ff8fb1', '#ffd54a'],
    leaf: '#4fae4e', leafTop: '#74cc5e', leafDark: '#37883e', trunk: '#8a5a33', trunkDark: '#6b4325',
    road: '#5c6173', roadEdge: '#4d5263', line: '#eef0f7', curb: '#c7cad6',
    water: '#58bfee', water2: '#4cb0e2', ripple: 'rgba(255,255,255,0.45)',
    log: '#9a6034', logTop: '#c4844b', logEnd: '#e8b77f', hull: '#f1e6cc', hullDark: '#c9b590', canopy: '#e2574c',
    bed: '#b9ab98', sleeper: '#7c5a3e', rail: '#7e8697', railHi: '#c3c9d6',
    side: 'rgba(14, 18, 36, 0.32)', shadow: 'rgba(20, 30, 20, 0.22)', window: '#cfeaff', night: false,
  };
  const DARK = {
    grass: ['#2e5b39', '#2a5434'], grassDot: '#24492c', flower: ['#cfd8e6', '#d97b9c', '#d8b54a'],
    leaf: '#2f7d4c', leafTop: '#3f9a5c', leafDark: '#21603a', trunk: '#6b4529', trunkDark: '#4d311d',
    road: '#262938', roadEdge: '#1e212e', line: '#9aa1b8', curb: '#4a4f63',
    water: '#1e4f7c', water2: '#1a4670', ripple: 'rgba(170,210,255,0.28)',
    log: '#6b4426', logTop: '#8d5d36', logEnd: '#b48a5c', hull: '#bdb39c', hullDark: '#8b8270', canopy: '#a8443c',
    bed: '#4b453f', sleeper: '#3a2a1e', rail: '#8f97aa', railHi: '#c4cad8',
    side: 'rgba(0, 0, 0, 0.42)', shadow: 'rgba(0, 0, 0, 0.35)', window: '#88b7dd', night: true,
  };
  const CAR = ['#ef5350', '#42a5f5', '#ffca28', '#ab47bc', '#26a69a', '#ff7043'];
  function isDark() {
    const th = document.documentElement.getAttribute('data-theme');
    if (th === 'dark') return true;
    if (th === 'light') return false;
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function refreshPalette() {
    pal = isDark() ? DARK : LIGHT;
    if (game) draw(performance.now());
  }
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshPalette);

  /** Làm sáng / tối một màu hex (f > 0 sáng hơn, f < 0 tối hơn). */
  const shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + f;
    if (shadeCache.has(key)) return shadeCache.get(key);
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f));
    const out = '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
    shadeCache.set(key, out);
    return out;
  }
  /** Số giả ngẫu nhiên cố định theo (a, b): trang trí không nhảy lung tung giữa các khung hình. */
  const hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /* ---------------- Vẽ ---------------- */
  const sx = (x) => ox + x * cs; // toạ độ ô → px
  const rowTop = (r) => H - (r - cam + 1) * cs;

  function rrect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRR(x, y, w, h, r, color) {
    rrect(x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function ellipse(x, y, rx, ry, color) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function poly(pts, color) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawGround(lane, r, y, now) {
    const P = pal;
    if (lane.type === 'grass') {
      ctx.fillStyle = P.grass[((r % 2) + 2) % 2];
      ctx.fillRect(0, y, W, cs + 1);
      // cỏ lún phún, hoa nhỏ (vị trí cố định theo hàng / cột)
      const c0 = Math.floor(-ox / cs) - 1;
      const c1 = Math.ceil((W - ox) / cs) + 1;
      for (let c = c0; c < c1; c++) {
        const h = hash(r, c);
        if (h >= 0.22) continue;
        const x = sx(c + 0.2 + hash(c, r) * 0.6);
        const yy = y + cs * (0.25 + hash(r + 7, c) * 0.5);
        if (h < 0.06) ellipse(x, yy, cs * 0.045, cs * 0.045, P.flower[Math.floor(h * 50) % 3]);
        else poly([x - cs * 0.06, yy + cs * 0.05, x, yy - cs * 0.07, x + cs * 0.06, yy + cs * 0.05], P.grassDot);
      }
    } else if (lane.type === 'road') {
      ctx.fillStyle = P.road;
      ctx.fillRect(0, y, W, cs + 1);
      if (E.laneAt(game, r + 1).type === 'road') {
        // vạch đứt giữa hai làn xe
        ctx.fillStyle = P.line;
        const dash = cs * 0.5;
        for (let x = (ox % (dash * 2)) - dash * 2; x < W; x += dash * 2) ctx.fillRect(x + dash * 0.5, y - cs * 0.025, dash, cs * 0.05);
      } else {
        ctx.fillStyle = P.curb;
        ctx.fillRect(0, y, W, cs * 0.07);
      }
      if (E.laneAt(game, r - 1).type !== 'road') {
        ctx.fillStyle = P.roadEdge;
        ctx.fillRect(0, y + cs * 0.9, W, cs * 0.1);
      }
    } else if (lane.type === 'river') {
      ctx.fillStyle = r & 1 ? P.water : P.water2;
      ctx.fillRect(0, y, W, cs + 1);
      ctx.fillStyle = P.ripple;
      const drift = reduced() ? 0 : ((now / 1000) * (lane.speed > 0 ? 0.35 : -0.35)) % 3;
      const k0 = Math.floor(-ox / cs / 1.5) - 2;
      const k1 = Math.ceil((W - ox) / cs / 1.5) + 2;
      for (let k = k0; k < k1; k++) {
        const x = sx(k * 1.5 + drift + hash(r, k) * 0.8);
        const yy = y + cs * (0.3 + hash(k, r) * 0.45);
        ctx.fillRect(x, yy, cs * 0.32, Math.max(1, cs * 0.035));
      }
    } else {
      ctx.fillStyle = P.bed;
      ctx.fillRect(0, y, W, cs + 1);
      ctx.fillStyle = P.sleeper;
      const st = cs * 0.42;
      for (let x = (ox % st) - st; x < W; x += st) ctx.fillRect(x, y + cs * 0.18, cs * 0.15, cs * 0.66);
      ctx.fillStyle = P.rail;
      ctx.fillRect(0, y + cs * 0.28, W, cs * 0.07);
      ctx.fillRect(0, y + cs * 0.66, W, cs * 0.07);
      ctx.fillStyle = P.railHi;
      ctx.fillRect(0, y + cs * 0.28, W, cs * 0.025);
      ctx.fillRect(0, y + cs * 0.66, W, cs * 0.025);
    }
  }

  function drawTree(cx, y, r, c) {
    const P = pal;
    const tall = hash(r * 3, c) < 0.4;
    const base = y + cs * 0.8;
    ellipse(cx, base, cs * 0.36, cs * 0.12, P.shadow);
    ctx.fillStyle = P.trunkDark;
    ctx.fillRect(cx - cs * 0.07, base - cs * 0.24, cs * 0.14, cs * 0.24);
    ctx.fillStyle = P.trunk;
    ctx.fillRect(cx - cs * 0.07, base - cs * 0.24, cs * 0.07, cs * 0.24);
    // tán cây kiểu khối đa giác: mặt trước tối, mặt trên sáng, một mảng sáng lệch trái
    const tiers = tall ? [[0.42, 0.24, 0.62], [0.32, 0.6, 0.96]] : [[0.4, 0.22, 0.7]];
    for (const [w, b, top] of tiers) {
      const yb = base - cs * b;
      const yt = base - cs * top;
      const ym = yt + (yb - yt) * 0.35;
      const hw = cs * w;
      poly([cx - hw, yb, cx - hw * 0.8, ym, cx + hw * 0.8, ym, cx + hw, yb], P.leafDark);
      poly([cx - hw * 0.8, ym, cx - hw * 0.45, yt, cx + hw * 0.45, yt, cx + hw * 0.8, ym], P.leaf);
      poly([cx - hw * 0.45, yt, cx + hw * 0.1, yt, cx - hw * 0.2, ym, cx - hw * 0.8, ym], P.leafTop);
    }
  }

  function glow(x, y, dir) {
    const len = cs * 1.3;
    const g = ctx.createLinearGradient(x, y, x + dir * len, y);
    g.addColorStop(0, 'rgba(255, 236, 160, 0.38)');
    g.addColorStop(1, 'rgba(255, 236, 160, 0)');
    poly([x, y - cs * 0.06, x + dir * len, y - cs * 0.3, x + dir * len, y + cs * 0.3, x, y + cs * 0.06], g);
  }

  function drawVehicle(o, lane, y) {
    const P = pal;
    const x = sx(o.x);
    const w = o.len * cs;
    const dir = lane.speed >= 0 ? 1 : -1;
    const col = o.kind === 'truck' ? '#5c7cfa' : CAR[o.color % CAR.length];
    const top = y + cs * 0.14;
    const bodyH = cs * 0.5;
    ellipse(x + w / 2, y + cs * 0.84, w * 0.5, cs * 0.1, P.shadow);
    if (o.kind === 'moto') {
      // xe máy: thân hẹp, bánh trước sau, người lái đội mũ
      fillRR(x, y + cs * 0.55, w, cs * 0.18, cs * 0.08, '#2b2f3a');
      ellipse(x + w * 0.15, y + cs * 0.72, cs * 0.1, cs * 0.08, '#1b1d24');
      ellipse(x + w * 0.85, y + cs * 0.72, cs * 0.1, cs * 0.08, '#1b1d24');
      fillRR(x + w * 0.18, y + cs * 0.4, w * 0.64, cs * 0.2, cs * 0.06, col);
      fillRR(x + w * 0.3, y + cs * 0.22, w * 0.4, cs * 0.24, cs * 0.06, shade(col, -0.35));
      ellipse(x + w / 2 + dir * w * 0.04, y + cs * 0.2, cs * 0.13, cs * 0.12, shade(CAR[(o.color + 2) % CAR.length], 0.1));
      ellipse(x + w / 2 + dir * w * 0.1, y + cs * 0.19, cs * 0.06, cs * 0.05, P.window);
      if (P.night) glow(dir > 0 ? x + w : x, y + cs * 0.55, dir);
      return;
    }
    // ô tô / xe tải: hộp có mặt trên sáng, mặt trước tối, bánh xe
    for (const k of o.kind === 'truck' ? [0.14, 0.5, 0.86] : [0.2, 0.8]) fillRR(x + w * k - cs * 0.12, y + cs * 0.66, cs * 0.24, cs * 0.16, cs * 0.05, '#1b1d24');
    fillRR(x, top + bodyH * 0.55, w, bodyH * 0.7, cs * 0.08, shade(col, -0.3));
    fillRR(x, top, w, bodyH * 0.8, cs * 0.1, col);
    if (o.kind === 'truck') {
      // thùng hàng phía sau, cabin phía trước
      const cab = cs * 0.75;
      const cx0 = dir > 0 ? x + w - cab : x;
      const bx0 = dir > 0 ? x : x + cab;
      fillRR(bx0, top - cs * 0.08, w - cab - cs * 0.04, bodyH * 1.05, cs * 0.06, P.night ? '#a8aec0' : '#eef0f6');
      fillRR(bx0, top - cs * 0.08, w - cab - cs * 0.04, bodyH * 0.25, cs * 0.06, P.night ? '#c3c8d6' : '#ffffff');
      fillRR(cx0 + cs * 0.12, top + cs * 0.06, cab - cs * 0.24, bodyH * 0.38, cs * 0.05, P.window);
    } else {
      fillRR(x + w * 0.24, top - cs * 0.06, w * 0.52, bodyH * 0.62, cs * 0.08, shade(col, 0.25));
      const wx = dir > 0 ? x + w * 0.56 : x + w * 0.27;
      fillRR(wx, top - cs * 0.02, w * 0.17, bodyH * 0.48, cs * 0.04, P.window);
    }
    // đèn pha
    ctx.fillStyle = '#ffe58a';
    ctx.fillRect(dir > 0 ? x + w - cs * 0.08 : x + cs * 0.02, top + bodyH * 0.65, cs * 0.06, cs * 0.1);
    if (P.night) glow(dir > 0 ? x + w : x, top + bodyH * 0.7, dir);
  }

  function drawFloat(o, y) {
    const P = pal;
    const x = sx(o.x);
    const w = o.len * cs;
    if (o.kind === 'boat') {
      // thuyền: mũi nhọn hai đầu, mái che ở giữa
      const yt = y + cs * 0.2;
      const hh = cs * 0.6;
      poly([x, yt + hh * 0.35, x + cs * 0.25, yt, x + w - cs * 0.25, yt, x + w, yt + hh * 0.35, x + w - cs * 0.2, yt + hh, x + cs * 0.2, yt + hh], P.hullDark);
      poly([x + cs * 0.12, yt + hh * 0.3, x + cs * 0.3, yt + hh * 0.08, x + w - cs * 0.3, yt + hh * 0.08, x + w - cs * 0.12, yt + hh * 0.3, x + w - cs * 0.3, yt + hh * 0.62, x + cs * 0.3, yt + hh * 0.62], P.hull);
      fillRR(x + w * 0.3, yt - cs * 0.04, w * 0.4, hh * 0.45, cs * 0.12, P.canopy);
      fillRR(x + w * 0.3, yt - cs * 0.04, w * 0.4, hh * 0.15, cs * 0.06, shade(P.canopy, 0.25));
      return;
    }
    const yt = y + cs * 0.18;
    const hh = cs * 0.62;
    fillRR(x + cs * 0.02, yt + hh * 0.25, w - cs * 0.04, hh * 0.75, hh * 0.35, P.log);
    fillRR(x + cs * 0.02, yt, w - cs * 0.04, hh * 0.6, hh * 0.3, P.logTop);
    // vân gỗ + mặt cắt đầu khúc
    ctx.fillStyle = shade(P.logTop, -0.12);
    for (let k = 0.6; k < o.len - 0.4; k += 0.9) ctx.fillRect(x + k * cs, yt + hh * 0.22, cs * 0.35, Math.max(1, cs * 0.035));
    ellipse(x + w - cs * 0.1, yt + hh * 0.5, cs * 0.1, hh * 0.42, P.logEnd);
    ellipse(x + w - cs * 0.1, yt + hh * 0.5, cs * 0.045, hh * 0.18, shade(P.logEnd, -0.2));
  }

  function drawRailSignal(lane, y, now) {
    const tr = E.train(lane, game.t);
    const x = Math.max(sx(0) - cs * 0.35, cs * 0.18);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(x - cs * 0.035, y - cs * 0.35, cs * 0.07, cs * 0.55);
    fillRR(x - cs * 0.16, y - cs * 0.62, cs * 0.32, cs * 0.3, cs * 0.12, '#262a36');
    const on = tr.warn && (reduced() || Math.floor(now / 180) % 2 === 0);
    ellipse(x, y - cs * 0.47, cs * 0.09, cs * 0.09, on ? '#ff3b30' : '#5a2a2a');
    if (on) ellipse(x, y - cs * 0.47, cs * 0.2, cs * 0.2, 'rgba(255, 59, 48, 0.28)');
  }

  function drawTrain(lane, y) {
    const tr = E.train(lane, game.t);
    if (tr.x0 == null) return;
    const P = pal;
    const x0 = sx(tr.x0);
    const x1 = sx(tr.x1);
    const top = y + cs * 0.02;
    const h = cs * 0.78;
    ellipse((x0 + x1) / 2, y + cs * 0.86, (x1 - x0) / 2, cs * 0.1, P.shadow);
    const cars = 3;
    const seg = (x1 - x0) / cars;
    for (let i = 0; i < cars; i++) {
      const a = x0 + i * seg + cs * 0.05;
      const w = seg - cs * 0.1;
      fillRR(a, top + h * 0.45, w, h * 0.55, cs * 0.08, '#9e2a2a');
      fillRR(a, top, w, h * 0.62, cs * 0.1, '#d84343');
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(a, top + h * 0.48, w, h * 0.08);
      ctx.fillStyle = P.window;
      for (let k = a + cs * 0.3; k < a + w - cs * 0.5; k += cs * 0.7) ctx.fillRect(k, top + h * 0.14, cs * 0.4, h * 0.22);
    }
    // đầu máy có đèn
    ctx.fillStyle = '#ffe58a';
    ctx.fillRect(lane.dir > 0 ? x1 - cs * 0.12 : x0 + cs * 0.04, top + h * 0.6, cs * 0.08, h * 0.16);
    if (P.night) glow(lane.dir > 0 ? x1 : x0, top + h * 0.68, lane.dir);
  }

  function drawDuck(p, y0, now, look) {
    const P = pal;
    const dir = look || face;
    const cx = sx(p.x);
    const ground = y0 + cs * 0.62;
    const lift = p.z * cs * 0.42;
    const squash = reduced() ? 0 : p.z;
    const bump = !reduced() && now - bumpAt < 160 ? Math.sin(((now - bumpAt) / 160) * Math.PI) : 0;
    ellipse(cx, ground + cs * 0.14, cs * 0.26 * (1 - p.z * 0.35), cs * 0.09 * (1 - p.z * 0.35), P.shadow);
    const bw = cs * 0.3 * (1 - squash * 0.08);
    const bh = cs * 0.25 * (1 + squash * 0.14);
    const by = ground - lift - bh * 0.4 - bump * cs * 0.05;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, -1];
    // thân: mặt dưới đậm, mặt trên sáng
    ellipse(cx, by + bh * 0.25, bw, bh * 0.85, '#e5a91c');
    ellipse(cx, by, bw * 0.96, bh * 0.82, '#ffd23f');
    ellipse(cx - v[0] * bw * 0.25, by - bh * 0.25, bw * 0.55, bh * 0.35, '#ffe68a');
    // cánh
    if (v[0] === 0) {
      ellipse(cx - bw * 0.82, by + bh * 0.1, bw * 0.22, bh * 0.4, '#f0bc2a');
      ellipse(cx + bw * 0.82, by + bh * 0.1, bw * 0.22, bh * 0.4, '#f0bc2a');
    } else ellipse(cx - v[0] * bw * 0.15, by + bh * 0.15, bw * 0.45, bh * 0.38, '#f0bc2a');
    // đầu theo hướng nhìn
    const hx = cx + v[0] * bw * 0.55;
    const hy = by - bh * 0.55 + v[1] * bh * 0.45;
    const hr = cs * 0.16;
    if (dir === 'up') {
      ellipse(cx, by + bh * 0.75, bw * 0.3, bh * 0.22, '#f0bc2a'); // đuôi
      ellipse(hx, hy, hr, hr, '#ffd23f');
      ellipse(hx, hy - hr * 0.95, hr * 0.42, hr * 0.32, '#ff9f1c');
      ellipse(hx, hy - hr * 0.2, hr * 0.6, hr * 0.45, '#ffe68a');
      return;
    }
    ellipse(hx, hy, hr, hr, '#ffd23f');
    ellipse(hx - v[0] * hr * 0.2, hy - hr * 0.35, hr * 0.55, hr * 0.38, '#ffe68a');
    if (dir === 'down') {
      poly([hx - hr * 0.45, hy + hr * 0.25, hx + hr * 0.45, hy + hr * 0.25, hx, hy + hr * 0.85], '#ff9f1c');
      ellipse(hx - hr * 0.42, hy - hr * 0.1, hr * 0.13, hr * 0.16, '#1d1d28');
      ellipse(hx + hr * 0.42, hy - hr * 0.1, hr * 0.13, hr * 0.16, '#1d1d28');
    } else {
      poly([hx + v[0] * hr * 0.75, hy - hr * 0.05, hx + v[0] * hr * 1.5, hy + hr * 0.18, hx + v[0] * hr * 0.75, hy + hr * 0.42], '#ff9f1c');
      ellipse(hx + v[0] * hr * 0.35, hy - hr * 0.15, hr * 0.13, hr * 0.17, '#1d1d28');
    }
  }

  function drawEagle(cx, cy, flap) {
    const s = cs * 1.1;
    const wy = cy - s * 0.15 * flap;
    poly([cx - s * 0.12, cy, cx - s * 0.95, wy - s * 0.2, cx - s * 0.7, wy + s * 0.05, cx - s * 0.85, wy + s * 0.12, cx - s * 0.4, cy + s * 0.15], '#6b3f1f');
    poly([cx + s * 0.12, cy, cx + s * 0.95, wy - s * 0.2, cx + s * 0.7, wy + s * 0.05, cx + s * 0.85, wy + s * 0.12, cx + s * 0.4, cy + s * 0.15], '#6b3f1f');
    ellipse(cx, cy + s * 0.05, s * 0.18, s * 0.3, '#7d4a24');
    poly([cx - s * 0.14, cy + s * 0.3, cx + s * 0.14, cy + s * 0.3, cx, cy + s * 0.5], '#5a3418');
    ellipse(cx, cy - s * 0.25, s * 0.13, s * 0.12, '#f4f1ea');
    poly([cx - s * 0.05, cy - s * 0.2, cx + s * 0.05, cy - s * 0.2, cx, cy - s * 0.08], '#f5b52e');
  }

  function drawDeadDuck(now) {
    const p = deathPose;
    const k = Math.min(1, (now - deathAt) / (reduced() ? 1 : DEATH_MS));
    const cx = sx(p.x);
    const y0 = rowTop(p.y);
    if (deathCause === 'car' || deathCause === 'train') {
      // bẹp dí
      ellipse(cx, y0 + cs * 0.66, cs * 0.42, cs * 0.12, '#e5a91c');
      ellipse(cx, y0 + cs * 0.62, cs * 0.38, cs * 0.09, '#ffd23f');
      ellipse(cx + cs * 0.3, y0 + cs * 0.6, cs * 0.07, cs * 0.05, '#ff9f1c');
    } else if (deathCause === 'water' || deathCause === 'off') {
      // vòng nước loang, vịt chìm dần
      const yy = y0 + cs * 0.55;
      for (let i = 0; i < 3; i++) {
        const q = reduced() ? 0.4 + i * 0.2 : Math.max(0, Math.min(1, k * 1.4 - i * 0.18));
        if (q <= 0 || q >= 1) continue;
        ctx.beginPath();
        ctx.ellipse(cx, yy, cs * (0.15 + q * 0.5), cs * (0.06 + q * 0.18), 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - q)).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1, cs * 0.04);
        ctx.stroke();
      }
      if (k < 0.25 && !reduced()) drawDuck({ x: p.x, y: p.y, z: 0 }, y0 + k * cs * 1.2, now, 'down');
    } else {
      // đại bàng sà xuống rồi quắp vịt bay lên
      const dive = reduced() ? 1 : Math.min(1, k / 0.4);
      const rise = reduced() ? 0 : Math.max(0, (k - 0.45) / 0.55);
      const ey = y0 + cs * 0.3 - (1 - dive) * H * 0.6 - rise * rise * H * 0.9;
      if (rise <= 0) drawDuck({ x: p.x, y: p.y, z: 0 }, y0, now, 'down');
      else {
        ellipse(cx, ey + cs * 0.55, cs * 0.24, cs * 0.2, '#ffd23f');
        ellipse(cx, ey + cs * 0.42, cs * 0.14, cs * 0.14, '#ffd23f');
      }
      drawEagle(cx, ey, 1 + (reduced() ? 0 : Math.sin(now / 70) * 0.12));
    }
  }

  function draw(now) {
    if (!W || !H || !game) return;
    if (!pal) pal = isDark() ? DARK : LIGHT;
    const r0 = Math.floor(cam) - 1;
    const r1 = Math.ceil(cam + H / cs) + 1;
    // mặt đất các làn
    for (let r = r0; r <= r1; r++) drawGround(E.laneAt(game, r), r, rowTop(r), now);
    const alive = phase !== 'dying' && phase !== 'over';
    const p = alive ? E.pose(game) : deathPose;
    const duckRow = Math.round(p.y);
    // vật thể từ xa tới gần (hàng gần che hàng xa); vịt vẽ ngay sau hàng của nó
    for (let r = r1; r >= r0; r--) {
      const lane = E.laneAt(game, r);
      const y = rowTop(r);
      if (lane.type === 'grass') {
        for (let c = -3; c < E.COLS + 3; c++) {
          const tree = c < 0 || c >= E.COLS ? hash(r, c + 50) < 0.5 : lane.trees[c];
          if (tree && sx(c + 1) > -cs && sx(c) < W + cs) drawTree(sx(c + 0.5), y, r, c);
        }
      } else if (lane.type === 'road') E.objects(lane, game.t).forEach((o) => drawVehicle(o, lane, y));
      else if (lane.type === 'river') E.objects(lane, game.t).forEach((o) => drawFloat(o, y));
      else {
        drawTrain(lane, y);
        drawRailSignal(lane, y, now);
      }
      if (r === duckRow) {
        if (alive) drawDuck(p, rowTop(p.y), now);
        else drawDeadDuck(now);
      }
    }
    // hai bên ngoài bàn chơi tối đi
    if (ox > 0.5) {
      ctx.fillStyle = pal.side;
      ctx.fillRect(0, 0, ox, H);
      ctx.fillRect(W - ox, 0, ox, H);
    } else {
      // màn dọc: viền mờ hai bên báo mép bàn
      const e = cs * 0.22;
      const g = ctx.createLinearGradient(0, 0, e, 0);
      g.addColorStop(0, pal.side);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, e, H);
      const g2 = ctx.createLinearGradient(W, 0, W - e, 0);
      g2.addColorStop(0, pal.side);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(W - e, 0, e, H);
    }
    // hạt hiệu ứng
    for (const f of fx) {
      ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
      ellipse(sx(f.x), rowTop(f.y) + cs, cs * f.r, cs * f.r, f.color);
    }
    ctx.globalAlpha = 1;
    // đại bàng sắp tới: bóng tối dâng lên từ mép dưới
    if (alive && phase !== 'ready') {
      const gap = game.y - game.edge;
      if (gap < 1.6) {
        const a = Math.min(0.55, (1.6 - gap) * 0.4) * (reduced() ? 1 : 0.8 + 0.2 * Math.sin(now / 120));
        const g = ctx.createLinearGradient(0, H, 0, H - cs * 2);
        g.addColorStop(0, 'rgba(40, 20, 10,' + a.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(40, 20, 10, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, H - cs * 2, W, cs * 2);
      }
    }
    // màn thấp (ẩn HUD): điểm vẽ ngay trên bàn chơi
    if (hudHidden) {
      ctx.font = '800 ' + Math.round(cs * 0.6) + 'px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.lineWidth = cs * 0.08;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(String(game.best), ox + cs * 0.3, cs * 0.25);
      ctx.fillText(String(game.best), ox + cs * 0.3, cs * 0.25);
    }
  }

  /* ---------------- Khởi động ---------------- */
  refreshPalette();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(board);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else draw(performance.now());
  });

  // Mở lại lượt dở nếu có
  const saved = kit.store.read(keys.save, null);
  const back = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (back && !back.over) {
    game = back;
    restored = true;
    phase = 'ready';
    playMs = Number.isFinite(saved.ms) && saved.ms >= 0 ? saved.ms : 0;
    face = ['up', 'down', 'left', 'right'].indexOf(saved.face) >= 0 ? saved.face : 'up';
    kit.sdk.start(MODE, true);
    showStart();
    renderHud();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    setupRun();
  }
  resize();
})();
