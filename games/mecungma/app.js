/* =====================================================================
 * Mê Cung Ma - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng <canvas>, nhân devicePixelRatio, tự co theo khung; vòng lặp bước cố định của engine (60 bước / giây)
 *   - Màn chờ có nút #btn-start (Space / Enter / chạm cũng bắt đầu); tự tạm dừng khi trang ẩn hoặc mở hộp thoại
 *   - Điều khiển: phím mũi tên / WASD, vuốt ở bất kỳ đâu trong khung game, phím điều hướng ảo (tùy chọn)
 *   - Báo ván cho cổng: bắt đầu kit.sdk.start('classic'); mở lại ván lưu dở kit.sdk.start('classic', true);
 *     hết ván hoặc bỏ ván (đã có điểm / đã chơi ≥ 1 giây): kit.sdk.end({ mode, won: false, score })
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const MAX_CATCHUP = 10; // bước mô phỏng tối đa mỗi khung hình (máy quá chậm thì bỏ bớt, không dồn)
  const SWIPE_PX = 16; // ngón tay đi chừng này (px CSS) là tính một lần vuốt
  const GHOST_COLORS = ['#ff6b3d', '#b57bff', '#2ec4b6', '#5b8cff']; // Lửa, Rình, Sương, Lơ Ngơ
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const kit = PNKit.init({
    gameId: 'mecungma',
    version: '1.0.0',
    dict: window.GAME_DICT,
    // điện thoại / máy tính bảng: mặc định hiện phím điều hướng ảo
    defaults: { vibrate: true, guideSeen: false, dpad: coarse },
    onSetting(key) {
      if (key === 'theme') refreshPalette();
      if (key === 'dpad') applyDpad();
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
    return { played: n(s.played), best: n(s.best), maxLevel: n(s.maxLevel), ghosts: n(s.ghosts) };
  })();
  const saveStats = () => kit.store.write(keys.stats, stats);

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let phase = 'ready'; // ready | playing | paused | over (pha bên trong ván: game.phase của engine)
  let restored = false; // ván mở lại từ ván lưu, đang chờ "Chơi tiếp"
  let playMs = 0; // thời gian đã chơi của ván này
  let overRecord = false;
  let popups = []; // điểm bay lên khi ăn ma / trái cây
  let sparks = []; // hạt sáng khi đom đóm bị bắt
  let lastDot = 0;
  let dotHi = false;

  /* ---------------- Lưu ---------------- */
  const inRun = () => !!game && !game.over && (phase === 'playing' || phase === 'paused' || (phase === 'ready' && restored));

  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { n: kit.i18n.fmtNumber(stats.best) }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: kit.i18n.fmtNumber(stats.best), label: t('hud.best') }] : [],
      resume: inRun() ? { title: t('app.name'), detail: t('summary.resume', { level: game.level, score: kit.i18n.fmtNumber(game.score) }), pct: null } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRun()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), ms: Math.round(playMs) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- HUD / lớp phủ ---------------- */
  const LIFE_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="5.6" cy="8" rx="4.2" ry="2.6" fill="#bfe3ff" opacity=".85"/>' +
    '<ellipse cx="14.4" cy="8" rx="4.2" ry="2.6" fill="#bfe3ff" opacity=".85"/><circle cx="10" cy="12.6" r="5.6" fill="#d4f53c"/>' +
    '<circle cx="10" cy="6.2" r="3.2" fill="#3b3470"/></svg>';
  const hudCache = {};
  function setHud(id, v) {
    if (hudCache[id] === v) return;
    hudCache[id] = v;
    $(id).textContent = v;
  }
  function renderHud() {
    const score = game ? game.score : 0;
    setHud('score', kit.i18n.fmtNumber(score));
    setHud('best', kit.i18n.fmtNumber(Math.max(stats.best, score)));
    setHud('level', String(game ? game.level : 1));
    const lives = game ? game.lives : E.START_LIVES;
    if (hudCache.lives !== lives) {
      hudCache.lives = lives;
      $('lives').innerHTML = lives ? LIFE_SVG.repeat(lives) : '0';
      $('lives').setAttribute('aria-label', t('hud.livesLabel', { n: lives }));
    }
    $('btn-pause').hidden = phase !== 'playing';
  }
  function showOverlay(id) {
    ['overlay-start', 'overlay-pause', 'overlay-over'].forEach((o) => { $(o).hidden = o !== id; });
  }
  function showStart() {
    $('guide').hidden = !!settings.guideSeen || restored;
    $('btn-start-text').textContent = t(restored ? 'start.continue' : 'start.button');
    $('start-sub').textContent = restored
      ? t('start.restored', { level: game.level, score: kit.i18n.fmtNumber(game.score) })
      : t('start.sub');
    showOverlay('overlay-start');
  }
  function applyDpad() {
    $('dpad').hidden = !settings.dpad;
  }

  /* ---------------- Luồng ván ---------------- */
  /** Dựng ván mới, chờ người chơi bấm Bắt đầu. */
  function setupRun() {
    game = E.newGame();
    phase = 'ready';
    restored = false;
    playMs = 0;
    popups = [];
    sparks = [];
    kit.store.remove(keys.save);
    showStart();
    renderHud();
    writeSummary();
    wallKey = '';
    draw(performance.now());
  }

  function startRun() {
    if (phase !== 'ready' || kit.modal.current()) return;
    if (!restored) kit.sdk.start(MODE); // ván mở lại đã báo start(resume) lúc tải trang
    else E.getReady(game); // cho 1,5 giây nhìn lại bàn
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
    $('pause-sub').textContent = t('pause.sub', { level: game.level, score: kit.i18n.fmtNumber(game.score) });
    showOverlay('overlay-pause');
    renderHud();
    persist();
  }
  function resume() {
    if (phase !== 'paused' || kit.modal.current()) return;
    phase = 'playing';
    E.getReady(game);
    showOverlay(null);
    renderHud();
    kick();
  }

  /** Ghi kết quả ván: thống kê + báo cổng (game vô tận: luôn won: false kèm điểm). */
  function record() {
    const score = game.score;
    const isRecord = score > stats.best;
    stats.played++;
    if (isRecord) stats.best = score;
    stats.maxLevel = Math.max(stats.maxLevel, game.level);
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    return isRecord && score > 0;
  }

  function onOver() {
    phase = 'over';
    overRecord = record();
    kit.store.remove(keys.save);
    writeSummary();
    $('over-sub').textContent = t('over.sub', { n: game.level });
    $('over-score').textContent = kit.i18n.fmtNumber(game.score);
    $('over-best').textContent = kit.i18n.fmtNumber(stats.best);
    $('over-record').hidden = !overRecord;
    $('live').textContent = t('live.over', { n: game.score });
    showOverlay('overlay-over');
    renderHud();
    if (overRecord && game.score >= 500) {
      kit.sfx('win');
      kit.confetti();
    }
  }

  function again() {
    if (phase !== 'over') return;
    setupRun();
    startRun();
  }

  /** Ván mới: ván đang dở mà đã có điểm / đã chơi ≥ 1 giây thì hỏi trước (bỏ ván = ghi điểm hiện có). */
  function requestNew() {
    if (inRun() && (game.score > 0 || playMs >= 1000)) {
      pause();
      kit.modal.open('modal-confirm');
    } else {
      if (phase === 'playing' || phase === 'paused') kit.store.remove(keys.save);
      setupRun();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inRun()) record();
    setupRun();
  }

  /* ---------------- Điều khiển ---------------- */
  function dirInput(dir) {
    if (phase === 'ready') startRun();
    if (phase !== 'playing' || kit.modal.current()) return;
    E.input(game, dir);
  }

  function vibrate(p) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* bỏ qua */ }
  }

  function popup(x, y, text) {
    popups.push({ x, y, text, age: 0 });
  }

  function handleEvents() {
    for (const ev of E.drain(game)) {
      switch (ev.type) {
        case 'dot': {
          // tiếng ăn đốm: cao / thấp xen kẽ, không dày quá
          const now = performance.now();
          if (now - lastDot > 85) {
            lastDot = now;
            dotHi = !dotHi;
            kit.sfx('tap', { pitch: dotHi ? 1.9 : 1.6, volume: 0.28 });
          }
          break;
        }
        case 'power':
          kit.sfx('combo');
          vibrate(15);
          break;
        case 'ghost':
          stats.ghosts++;
          popup(ev.x, ev.y, String(ev.points));
          kit.sfx('capture', { pitch: 1 + ev.chain * 0.2 });
          vibrate(25);
          break;
        case 'fruitShow':
          kit.sfx('pop');
          break;
        case 'fruit':
          popup(ev.c, ev.r, String(ev.points));
          kit.sfx('coin');
          break;
        case 'die':
          kit.sfx('lose');
          vibrate([60, 40, 90]);
          spawnSparks();
          break;
        case 'clear':
          kit.sfx('levelup');
          break;
        case 'level':
          $('live').textContent = t('live.level', { n: ev.level });
          wallKey = '';
          persist();
          break;
        case 'life':
          kit.toast(t('toast.life'));
          kit.sfx('coin', { pitch: 1.5 });
          break;
        case 'over':
          onOver();
          break;
        default:
          break;
      }
    }
  }

  const KEYMAP = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) {
      e.preventDefault();
      // giữ phím thì trình duyệt lặp keydown: bỏ qua, kẻo xóa mất lệnh rẽ vừa bấm
      if (!e.repeat) dirInput(KEYMAP[k]);
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

  // Vuốt ở bất kỳ đâu trong khung game (trừ thanh trên / nút / hộp thoại): đổi hướng ngay khi ngón tay vượt ngưỡng,
  // vuốt tiếp không nhấc tay vẫn đổi hướng được (mốc dời theo ngón tay)
  let sw = null;
  document.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.pointerType === 'mouse') return;
    if (e.target.closest && e.target.closest('.modal, .topbar, button, .dpad')) return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, last: null };
  });
  document.addEventListener('pointermove', (e) => {
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) < SWIPE_PX) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    sw.x = e.clientX;
    sw.y = e.clientY;
    if (dir !== sw.last) {
      sw.last = dir;
      sw.moved = true;
      dirInput(dir);
    }
  });
  const swEnd = (e) => { if (sw && sw.id === e.pointerId) sw = null; };
  document.addEventListener('pointerup', swEnd);
  document.addEventListener('pointercancel', swEnd);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Phím điều hướng ảo: nhận ngay khi chạm xuống (không chờ nhấc tay)
  $('dpad').querySelectorAll('.dpad-btn').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('on');
      dirInput(b.dataset.dir);
    });
    const off = () => b.classList.remove('on');
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
    // bàn phím (Enter / Space trên nút đang focus) cho ra click không có chạm
    b.addEventListener('click', (e) => { if (e.detail === 0) dirInput(b.dataset.dir); });
  });

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
    $('stats-level').textContent = kit.i18n.fmtNumber(Math.max(stats.maxLevel, inRun() ? game.level : 0));
    $('stats-ghosts').textContent = kit.i18n.fmtNumber(stats.ghosts);
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
    saveStats();
    persist();
  });

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let lastT = 0;
  let acc = 0;
  let saveAcc = 0;

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
      saveAcc += dt;
      if (saveAcc >= 3000 && phase === 'playing') {
        saveAcc = 0;
        persist();
      }
      renderHud();
    } else acc = 0;
    updateFx(dt);
    draw(now);
    if (phase === 'playing' || popups.length || sparks.length) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  function kick() {
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- Hiệu ứng ---------------- */
  function spawnSparks() {
    if (reduced()) return;
    const p = game.player;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const s = 2 + Math.random() * 2.5;
      sparks.push({ x: p.x / E.U, y: p.y / E.U, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 0.6 + Math.random() * 0.5 });
    }
  }
  function updateFx(dt) {
    const s = dt / 1000;
    popups.forEach((p) => { p.age += s; });
    popups = popups.filter((p) => p.age < 1);
    sparks.forEach((f) => {
      f.age += s;
      f.x += f.vx * s;
      f.y += f.vy * s;
      f.vx *= 0.94;
      f.vy *= 0.94;
    });
    sparks = sparks.filter((f) => f.age < f.life);
  }

  /* ---------------- Kích thước ---------------- */
  let W = 0;
  let H = 0;
  let T = 20; // cỡ một ô (px thiết bị)
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let hudHidden = false;

  function resize() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = Math.round(w * dpr);
    H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    hudHidden = getComputedStyle(document.querySelector('.hud')).display === 'none';
    // màn ngang thấp: chừa lề trái cho điểm vẽ trên canvas
    const side = hudHidden ? Math.round(110 * dpr) : 0;
    T = Math.max(4, Math.floor(Math.min((W - side * 2) / E.COLS, H / E.ROWS)));
    // nút tạm dừng ở góc trên phải: mê cung chạm kín khung (máy tính) thì chừa một dải phía trên cho nút
    const reserve = Math.round(52 * dpr);
    const tight = (W - T * E.COLS) / 2 < reserve && (H - T * E.ROWS) / 2 < reserve;
    if (tight) T = Math.max(4, Math.floor(Math.min(W / E.COLS, (H - reserve) / E.ROWS)));
    ox = Math.round((W - T * E.COLS) / 2);
    oy = Math.round((H - T * E.ROWS) / 2);
    if (tight) oy = Math.min(H - T * E.ROWS, Math.max(oy, reserve));
    wallKey = '';
    if (game) draw(performance.now());
  }

  /* ---------------- Bảng màu theo giao diện ---------------- */
  let pal = null;
  const LIGHT = {
    bg: '#fbfaff', wallLine: '#6a4cf5', wallFill: '#e6e0ff', flashLine: '#ffffff', flashFill: '#a996ff',
    dot: '#d08c00', dotGlow: null, power: '#e39b00', door: '#e85d9f', text: '#a86f00', textStroke: 'rgba(255,255,255,0.9)',
    popup: '#0b7f96', glow: 'rgba(160, 205, 20, 0.30)', fright: '#aeb8ff', frightFace: '#2d3170', frightAlt: '#ffcf5a',
    eye: '#ffffff', pupil: '#1c1f4a', ghostEdge: 'rgba(20, 20, 60, 0.25)', side: '#5d6285', night: false,
  };
  const DARK = {
    bg: '#0a0b1a', wallLine: '#8b6cff', wallFill: '#1a1840', flashLine: '#ffffff', flashFill: '#4a3fa0',
    dot: '#ffe08a', dotGlow: 'rgba(255, 224, 138, 0.25)', power: '#ffd23f', door: '#ff8fc7', text: '#ffd84a', textStroke: 'rgba(0,0,0,0.6)',
    popup: '#7df9ff', glow: 'rgba(214, 245, 60, 0.42)', fright: '#e2e6ff', frightFace: '#3d4380', frightAlt: '#ffd166',
    eye: '#ffffff', pupil: '#1c1f4a', ghostEdge: null, side: '#9096b8', night: true,
  };
  function isDark() {
    const th = document.documentElement.getAttribute('data-theme');
    if (th === 'dark') return true;
    if (th === 'light') return false;
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function refreshPalette() {
    pal = isDark() ? DARK : LIGHT;
    wallKey = '';
    if (game) draw(performance.now());
  }
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshPalette);

  /* ---------------- Tường (vẽ sẵn ra canvas phụ, vẽ lại khi đổi cỡ / màn / giao diện) ---------------- */
  let wallKey = '';
  let wallImg = null;
  let wallFlash = null;

  function renderWalls(mi, line, fill) {
    const cv = document.createElement('canvas');
    cv.width = T * E.COLS;
    cv.height = T * E.ROWS;
    const c = cv.getContext('2d');
    const m = E.PARSED[mi];
    const wall = (cc, r) => r >= 0 && r < E.ROWS && cc >= 0 && cc < E.COLS && m.rows[r][cc] === '#';
    const g1 = T * 0.2;
    const g2 = g1 + Math.max(1.5 * dpr, T * 0.08);
    const rad = T * 0.32;
    // hai lớp: viền sáng (lùi g1 khỏi lối đi) rồi lõi (lùi g2); ô tường liền nhau nối thành khối
    [[g1, rad, line], [g2, Math.max(0, rad - (g2 - g1)), fill]].forEach(([ins, rr, color]) => {
      c.fillStyle = color;
      for (let r = 0; r < E.ROWS; r++) {
        for (let cc = 0; cc < E.COLS; cc++) {
          if (!wall(cc, r)) continue;
          const x = cc * T;
          const y = r * T;
          const N = wall(cc, r - 1);
          const S = wall(cc, r + 1);
          const Wl = wall(cc - 1, r);
          const Ea = wall(cc + 1, r);
          const inner = T - 2 * ins;
          c.beginPath();
          const radii = [!N && !Wl ? rr : 0, !N && !Ea ? rr : 0, !S && !Ea ? rr : 0, !S && !Wl ? rr : 0];
          if (c.roundRect) c.roundRect(x + ins, y + ins, inner, inner, radii);
          else c.rect(x + ins, y + ins, inner, inner);
          c.fill();
          if (N) c.fillRect(x + ins, y, inner, ins + 0.5);
          if (S) c.fillRect(x + ins, y + T - ins - 0.5, inner, ins + 0.5);
          if (Wl) c.fillRect(x, y + ins, ins + 0.5, inner);
          if (Ea) c.fillRect(x + T - ins - 0.5, y + ins, ins + 0.5, inner);
          if (N && Wl && wall(cc - 1, r - 1)) c.fillRect(x, y, ins + 0.5, ins + 0.5);
          if (N && Ea && wall(cc + 1, r - 1)) c.fillRect(x + T - ins - 0.5, y, ins + 0.5, ins + 0.5);
          if (S && Wl && wall(cc - 1, r + 1)) c.fillRect(x, y + T - ins - 0.5, ins + 0.5, ins + 0.5);
          if (S && Ea && wall(cc + 1, r + 1)) c.fillRect(x + T - ins - 0.5, y + T - ins - 0.5, ins + 0.5, ins + 0.5);
        }
      }
    });
    return cv;
  }
  function ensureWalls() {
    const mi = E.mazeIndex(game.level);
    const key = mi + '|' + T + '|' + (pal === DARK ? 'd' : 'l');
    if (key === wallKey) return;
    wallKey = key;
    wallImg = renderWalls(mi, pal.wallLine, pal.wallFill);
    wallFlash = renderWalls(mi, pal.flashLine, pal.flashFill);
  }

  /* ---------------- Vẽ ---------------- */
  const px = (x) => ox + (x + 0.5) * T; // toạ độ ô (số thực) → px
  const py = (y) => oy + (y + 0.5) * T;

  function circle(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function ellipse(x, y, rx, ry, color, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawDots(now) {
    const m = E.mazeOf(game);
    const pulse = reduced() ? 1 : 0.82 + 0.18 * Math.sin(now / 160);
    for (let r = 0; r < E.ROWS; r++) {
      for (let c = 0; c < E.COLS; c++) {
        const d = game.dots[r * E.COLS + c];
        if (!d) continue;
        const x = px(c);
        const y = py(r);
        if (d === 1) {
          if (pal.dotGlow) circle(x, y, T * 0.2, pal.dotGlow);
          circle(x, y, T * 0.1, pal.dot);
        } else {
          circle(x, y, T * 0.42 * pulse, pal.night ? 'rgba(255, 210, 63, 0.22)' : 'rgba(227, 155, 0, 0.16)');
          circle(x, y, T * 0.28 * pulse, pal.power);
          circle(x - T * 0.08, y - T * 0.08, T * 0.08, 'rgba(255,255,255,0.7)');
        }
      }
    }
    // cửa chuồng ma
    const dx = ox + m.door.c * T;
    const dy = oy + m.door.r * T + T * 0.42;
    ctx.fillStyle = pal.door;
    ctx.fillRect(dx - T * 0.1, dy, T * 1.2, T * 0.16);
  }

  /* Trái cây theo màn: dâu tây, cam, nho, dưa hấu, táo, chuối, khế, thanh long */
  function drawFruit(k, x, y, R) {
    const leaf = '#2fa84f';
    if (k === 0) {
      ctx.beginPath();
      ctx.moveTo(x - R * 0.8, y - R * 0.3);
      ctx.quadraticCurveTo(x - R * 0.85, y + R * 0.6, x, y + R);
      ctx.quadraticCurveTo(x + R * 0.85, y + R * 0.6, x + R * 0.8, y - R * 0.3);
      ctx.quadraticCurveTo(x, y - R * 0.75, x - R * 0.8, y - R * 0.3);
      ctx.fillStyle = '#ef3b4f';
      ctx.fill();
      for (const [a, b] of [[-0.35, 0.05], [0.3, 0.1], [0, 0.45], [-0.25, 0.55], [0.3, 0.5], [0.02, -0.1]]) ellipse(x + a * R, y + b * R, R * 0.06, R * 0.09, '#ffe27a');
      ellipse(x - R * 0.3, y - R * 0.45, R * 0.35, R * 0.14, leaf, -0.4);
      ellipse(x + R * 0.3, y - R * 0.45, R * 0.35, R * 0.14, leaf, 0.4);
    } else if (k === 1) {
      circle(x, y + R * 0.1, R * 0.85, '#ff9f1c');
      circle(x - R * 0.3, y - R * 0.2, R * 0.22, 'rgba(255,255,255,0.35)');
      ellipse(x + R * 0.25, y - R * 0.75, R * 0.35, R * 0.15, leaf, -0.5);
    } else if (k === 2) {
      for (const [a, b] of [[-0.45, -0.3], [0, -0.3], [0.45, -0.3], [-0.22, 0.12], [0.22, 0.12], [0, 0.52]]) circle(x + a * R, y + b * R, R * 0.3, '#8e44d8');
      for (const [a, b] of [[-0.5, -0.38], [-0.05, -0.38], [0.4, -0.38]]) circle(x + a * R, y + b * R, R * 0.09, 'rgba(255,255,255,0.4)');
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x - R * 0.05, y - R * 0.95, R * 0.1, R * 0.4);
      ellipse(x + R * 0.28, y - R * 0.78, R * 0.3, R * 0.13, leaf, 0.3);
    } else if (k === 3) {
      ctx.beginPath();
      ctx.arc(x, y - R * 0.2, R, 0, Math.PI);
      ctx.fillStyle = '#2f9e44';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - R * 0.2, R * 0.8, 0, Math.PI);
      ctx.fillStyle = '#ff4d6d';
      ctx.fill();
      for (const a of [-0.45, 0, 0.45]) ellipse(x + a * R, y + R * 0.15, R * 0.06, R * 0.11, '#1d1d28');
    } else if (k === 4) {
      circle(x - R * 0.3, y + R * 0.1, R * 0.62, '#e5383b');
      circle(x + R * 0.3, y + R * 0.1, R * 0.62, '#e5383b');
      circle(x - R * 0.4, y - R * 0.05, R * 0.18, 'rgba(255,255,255,0.4)');
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x - R * 0.05, y - R * 0.85, R * 0.1, R * 0.4);
      ellipse(x + R * 0.3, y - R * 0.7, R * 0.32, R * 0.13, leaf, -0.4);
    } else if (k === 5) {
      ctx.beginPath();
      ctx.arc(x - R * 0.2, y - R * 0.6, R * 1.3, 0.35, 1.85);
      ctx.arc(x - R * 0.1, y - R * 1.0, R * 1.3, 1.6, 0.55, true);
      ctx.closePath();
      ctx.fillStyle = '#ffd43b';
      ctx.fill();
      circle(x + R * 0.75, y - R * 0.05, R * 0.1, '#6b4a2b');
    } else if (k === 6) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? R * 0.45 : R;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#f7d046';
      ctx.fill();
      circle(x, y, R * 0.18, '#e0a800');
    } else {
      ellipse(x, y + R * 0.05, R * 0.72, R * 0.9, '#e83e8c');
      for (const [a, b, s] of [[-0.75, -0.3, -1], [0.75, -0.3, 1], [-0.7, 0.4, -1], [0.7, 0.4, 1], [0, -0.95, 0]]) {
        ctx.beginPath();
        ctx.moveTo(x + a * R * 0.85, y + b * R);
        ctx.lineTo(x + a * R * 1.25 + s * R * 0.05, y + b * R - R * 0.25);
        ctx.lineTo(x + a * R * 0.95, y + b * R + R * 0.12);
        ctx.fillStyle = '#4cc36b';
        ctx.fill();
      }
      ellipse(x - R * 0.2, y - R * 0.15, R * 0.15, R * 0.22, 'rgba(255,255,255,0.3)');
    }
  }

  const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  /** Đom đóm: thân sau phát sáng, đầu sẫm màu quay theo hướng đi, hai cánh vỗ, râu. */
  function drawFirefly(x, y, R, dir, now, moving, scale, spin) {
    const k = scale == null ? 1 : scale;
    if (k <= 0.02) return;
    const glowR = R * 2.1 * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    g.addColorStop(0, pal.glow);
    g.addColorStop(1, 'rgba(214, 245, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ANGLE[dir] + (spin || 0));
    ctx.scale(k, k);
    const flap = reduced() ? 0.8 : moving ? 0.45 + 0.55 * Math.abs(Math.sin(now / 45)) : 0.75 + 0.15 * Math.sin(now / 300);
    ctx.globalAlpha = 0.85;
    ellipse(-R * 0.05, -R * 0.55, R * 0.55, R * 0.3 * flap, '#cfe8ff', -0.35);
    ellipse(-R * 0.05, R * 0.55, R * 0.55, R * 0.3 * flap, '#cfe8ff', 0.35);
    ctx.globalAlpha = 1;
    const body = ctx.createRadialGradient(-R * 0.35, -R * 0.1, R * 0.1, -R * 0.25, 0, R * 0.75);
    body.addColorStop(0, '#f6ffb0');
    body.addColorStop(1, '#b6e021');
    ellipse(-R * 0.25, 0, R * 0.62, R * 0.55, body);
    circle(R * 0.42, 0, R * 0.4, '#3b3470');
    // râu
    ctx.strokeStyle = '#3b3470';
    ctx.lineWidth = Math.max(1, R * 0.08);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(R * 0.7, s * R * 0.14);
      ctx.quadraticCurveTo(R * 0.95, s * R * 0.2, R * 1.08, s * R * 0.42);
      ctx.stroke();
    }
    // mắt
    for (const s of [-1, 1]) {
      circle(R * 0.58, s * R * 0.17, R * 0.12, '#ffffff');
      circle(R * 0.64, s * R * 0.17, R * 0.06, '#1c1f4a');
    }
    ctx.restore();
  }

  /** Ma: đầu tròn, thân thon dần thành một dải đuôi uốn lượn; mắt nhìn theo hướng đi. */
  function drawGhost(i, gh, now) {
    const R = T * 0.45;
    let x = px(gh.x / E.U);
    let y = py(gh.y / E.U);
    if (gh.state === 'house' && !reduced()) y += Math.sin(now / 220 + i * 1.7) * T * 0.14;
    const v = E.DIRS[gh.dir];
    const y0 = y - R * 0.18;
    const eyes = (er, pr) => {
      for (const s of [-1, 1]) {
        ellipse(x + s * R * 0.36 + v[0] * R * 0.08, y0 + v[1] * R * 0.06, er * 0.82, er, pal.eye);
        circle(x + s * R * 0.36 + v[0] * R * 0.2, y0 + v[1] * R * 0.16, pr, pal.pupil);
      }
    };
    if (gh.state === 'eyes' || gh.state === 'enter') {
      eyes(R * 0.3, R * 0.15);
      return;
    }
    let color = GHOST_COLORS[i];
    let scared = false;
    if (gh.fright) {
      scared = true;
      const blink = game.frightT < 120 && !reduced() && Math.floor(game.frightT / 12) % 2 === 0;
      color = blink ? pal.frightAlt : pal.fright;
    }
    const sway = reduced() ? 0 : Math.sin(now / 170 + i * 1.3) * R * 0.28;
    ctx.beginPath();
    ctx.moveTo(x - R, y0);
    ctx.arc(x, y0, R, Math.PI, 0);
    ctx.bezierCurveTo(x + R, y0 + R * 0.75, x + R * 0.55 + sway * 0.5, y0 + R * 1.15, x + R * 0.2 + sway, y0 + R * 1.55);
    ctx.bezierCurveTo(x - R * 0.05 + sway * 0.5, y0 + R * 1.2, x - R * 0.85, y0 + R * 1.25, x - R, y0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (pal.ghostEdge) {
      ctx.strokeStyle = pal.ghostEdge;
      ctx.lineWidth = Math.max(1, T * 0.04);
      ctx.stroke();
    }
    // ánh sáng nhẹ trên đỉnh đầu
    ellipse(x - R * 0.35, y0 - R * 0.55, R * 0.28, R * 0.14, 'rgba(255,255,255,0.35)', -0.5);
    if (scared) {
      for (const s of [-1, 1]) circle(x + s * R * 0.33, y0 - R * 0.05, R * 0.11, pal.frightFace);
      ctx.beginPath();
      const my = y0 + R * 0.42;
      ctx.moveTo(x - R * 0.5, my);
      for (let k = 1; k <= 4; k++) ctx.lineTo(x - R * 0.5 + k * R * 0.25, my + (k % 2 ? -R * 0.12 : 0));
      ctx.strokeStyle = pal.frightFace;
      ctx.lineWidth = Math.max(1, R * 0.09);
      ctx.lineJoin = 'round';
      ctx.stroke();
      return;
    }
    eyes(R * 0.28, R * 0.14);
  }

  function drawText(text, x, y, size, color) {
    ctx.font = '800 ' + Math.round(size) + 'px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = pal.textStroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function draw(now) {
    if (!W || !H || !game) return;
    if (!pal) pal = isDark() ? DARK : LIGHT;
    ensureWalls();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    const gp = game.phase;
    const flash = gp === 'clear' && !reduced() && Math.floor((E.CLEAR_STEPS - game.phaseT) / 15) % 2 === 1;
    ctx.drawImage(flash ? wallFlash : wallImg, ox, oy);
    drawDots(now);
    const m = E.mazeOf(game);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, T * E.COLS, T * E.ROWS);
    ctx.clip();
    if (game.fruit) {
      const blink = game.fruit.t < 120 && !reduced() && Math.floor(game.fruit.t / 10) % 2 === 0;
      if (!blink) drawFruit(game.fruit.k, px(m.fruit.c), py(m.fruit.r), T * 0.42);
    }
    const p = game.player;
    const dyingK = gp === 'dying' ? 1 - game.phaseT / E.DIE_STEPS : 0;
    const showGhosts = gp !== 'clear' && gp !== 'over' && !(gp === 'dying' && dyingK > 0.3);
    if (showGhosts) game.ghosts.forEach((gh, i) => drawGhost(i, gh, now));
    if (gp === 'dying') {
      const k = Math.max(0, 1 - Math.max(0, dyingK - 0.25) / 0.6);
      drawFirefly(px(p.x / E.U), py(p.y / E.U), T * 0.52, p.dir, now, false, reduced() ? (dyingK < 0.5 ? 1 : 0) : k, reduced() ? 0 : dyingK * 8);
    } else if (gp !== 'over') {
      drawFirefly(px(p.x / E.U), py(p.y / E.U), T * 0.52, p.dir, now, p.moving && gp === 'play');
    }
    // hạt sáng khi bị bắt
    for (const f of sparks) {
      ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
      circle(px(f.x), py(f.y), T * 0.08, '#e6ff7a');
    }
    ctx.globalAlpha = 1;
    // điểm bay lên
    for (const pp of popups) {
      ctx.globalAlpha = Math.max(0, 1 - pp.age);
      drawText(pp.text, px(pp.x), py(pp.y) - (reduced() ? 0 : pp.age * T * 0.8), T * 0.62, pal.popup);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // "Sẵn sàng!" ở hàng trái cây
    if (gp === 'ready') {
      drawText(t('board.ready'), ox + (T * E.COLS) / 2, py(m.fruit.r), T * 0.8, pal.text);
      if (game.level > 1 || game.t > 0) drawText(t('board.maze', { n: game.level }), ox + (T * E.COLS) / 2, py(m.exit.r), T * 0.62, pal.text);
    }
    // màn thấp (ẩn HUD): điểm, màn, mạng vẽ ở lề trái
    if (hudHidden) {
      const x = Math.max(8 * dpr, ox - 100 * dpr);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = pal.side;
      ctx.font = '700 ' + Math.round(11 * dpr) + 'px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.fillText(t('hud.score').toUpperCase(), x, oy + 4 * dpr);
      ctx.fillText(t('hud.level').toUpperCase() + ' ' + game.level, x, oy + 52 * dpr);
      ctx.fillStyle = pal.night ? '#eef0ff' : '#14162b';
      ctx.font = '800 ' + Math.round(22 * dpr) + 'px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.fillText(kit.i18n.fmtNumber(game.score), x, oy + 18 * dpr);
      for (let i = 0; i < game.lives; i++) circle(x + 8 * dpr + i * 18 * dpr, oy + 80 * dpr, 6 * dpr, '#d4f53c');
    }
  }

  /* ---------------- Khởi động ---------------- */
  refreshPalette();
  applyDpad();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(board);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else draw(performance.now());
  });

  // Mở lại ván dở nếu có
  const saved = kit.store.read(keys.save, null);
  const back = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (back && !back.over) {
    game = back;
    restored = true;
    phase = 'ready';
    playMs = Number.isFinite(saved.ms) && saved.ms >= 0 ? saved.ms : 0;
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
