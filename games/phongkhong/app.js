/* =====================================================================
 * Phòng Không - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ sân 240 x 360 (logic) lên <canvas> theo devicePixelRatio, co theo khung (tỉ lệ 2:3)
 *   - Vòng lặp: requestAnimationFrame + bước cố định 60 bước / giây của engine (giới hạn dt khi tab quay lại)
 *   - Điều khiển: chạm / nhấp một điểm trên trời = bắn từ bệ gần nhất còn đạn; 1/2/3 hoặc A/S/D = bắn từ bệ
 *     chọn sẵn tới chỗ con trỏ / tâm ngắm; mũi tên di tâm ngắm, Space bắn; P / Esc tạm dừng, N ván mới
 *   - Hình vẽ nét neon tối giản, màu lấy từ biến --pk-* trong style.css (theo giao diện sáng / tối)
 *   - Giảm chuyển động: quả cầu nổ là hình tròn đặc một màu có viền (vẫn thấy rõ vùng nổ), không đổi màu nhấp nháy,
 *     không mảnh vỡ, không rung, không chớp sáng
 *   - Luật báo ván cho cổng (metric score_high, mode classic):
 *     bấm Bắt đầu: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     hết ván: kit.sdk.end({ mode, won: false, score }); bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: như hết ván
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const VERSION = '1.0.1';
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  const hoverMQ = window.matchMedia('(hover: hover)');
  const kit = PNKit.init({
    gameId: 'phongkhong',
    version: VERSION,
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
    onSetting: (key) => {
      if (key === 'theme') readPalette();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const reduced = () => reduceMQ.matches;

  const MAX_CATCHUP = 8; // số bước mô phỏng tối đa trong một khung hình (máy giật thì bỏ bớt)
  const SAVE_EVERY = 5000; // ms, chu kỳ lưu ván khi đang chơi
  const MIN_PLAY_TICKS = 60; // bỏ ván sau ≥ 1 giây chơi (hoặc đã có điểm) thì tính là một ván
  const CROSS_SPEED = 2.6; // tâm ngắm bằng phím: px logic / tick, giữ lâu thì nhanh dần
  const CROSS_FAST = 4.6;

  /* ---------------- Trạng thái ---------------- */
  const statsRaw = kit.store.read(keys.stats, {}) || {};
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const stats = { played: num(statsRaw.played), best: num(statsRaw.best), bestWave: num(statsRaw.bestWave), kills: num(statsRaw.kills) };

  let game = null;
  let mode = 'ready'; // ready | playing | paused | over
  let recorded = false; // ván này đã báo kết thúc cho cổng chưa
  let overTimer = 0;

  // Input
  const arrows = new Set();
  let arrowHeld = 0; // số tick đang giữ mũi tên (để tăng tốc tâm ngắm)
  const cross = { x: E.W / 2, y: 150, shown: false };
  let pending = []; // các phát bắn chờ tick kế tiếp

  /* ---------------- Âm thanh, rung, thông báo ---------------- */
  const sfxLast = {};
  function sfx(name, opts, gap) {
    const now = performance.now();
    if (now - (sfxLast[name] || 0) < (gap || 40)) return;
    sfxLast[name] = now;
    kit.sfx(name, opts);
  }
  function vibrate(p) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* bỏ qua */ }
  }
  function announce(text) {
    $('announcer').textContent = text;
  }
  let bannerTimer = 0;
  function banner(title, sub, sub2) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    $('banner-sub2').textContent = sub2 || '';
    el.hidden = true;
    void el.offsetWidth; // chạy lại hiệu ứng
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }
  function hideBanner() {
    clearTimeout(bannerTimer);
    $('banner').hidden = true;
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => !!game && (mode === 'playing' || mode === 'paused') && game.tick > 0 && !E.isOver(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best ? t('summary.note', { n: fmt(stats.best) }) : t('summary.none'),
      stats: stats.best
        ? [{ value: fmt(stats.best), label: t('hud.best') }, { value: fmt(stats.bestWave), label: t('hud.wave') }]
        : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { wave: game.wave, score: fmt(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- HUD, lớp phủ ---------------- */
  let shownScore = -1;
  function updateHud() {
    if (!game) return;
    const sc = $('score');
    if (game.score !== shownScore) {
      sc.textContent = fmt(game.score);
      if (shownScore >= 0 && game.score > shownScore && !reduced()) {
        sc.classList.remove('bump');
        void sc.offsetWidth;
        sc.classList.add('bump');
      }
      shownScore = game.score;
    }
    $('best').textContent = fmt(Math.max(stats.best, recorded ? 0 : game.score));
    $('wave').textContent = fmt(game.wave);
    const pb = $('btn-pause');
    pb.disabled = !(mode === 'playing' || mode === 'paused');
    pb.dataset.state = mode === 'paused' ? 'paused' : 'playing';
    pb.setAttribute('aria-label', mode === 'paused' ? t('btn.resume') : t('btn.pause'));
  }
  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
  }
  function renderStartBest() {
    const el = $('start-best');
    el.hidden = !stats.best;
    if (stats.best) el.innerHTML = t('start.best', { n: '<b>' + fmt(stats.best) + '</b>' });
  }
  function focusBoard() {
    try {
      $('board').focus({ preventScroll: true });
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Luồng ván ---------------- */
  function newGame() {
    clearTimeout(overTimer);
    game = E.newGame({ seed: (Math.random() * 4294967296) >>> 0 });
    recorded = false;
    shownScore = -1;
    pending = [];
    resetFx();
    hideBanner();
  }

  function startPlaying() {
    if (mode !== 'ready' && mode !== 'over') return;
    if (mode === 'over' || !game || game.tick > 0) newGame();
    mode = 'playing';
    releaseInput();
    showOverlay(null);
    kit.sdk.start(MODE);
    kit.sfx('start');
    banner(t('banner.wave', { n: game.wave }), t('banner.defend'));
    announce(t('sr.wave', { n: game.wave }));
    updateHud();
    persist();
    focusBoard();
    kick();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    releaseInput();
    $('pause-sub').textContent = t('pause.detail', { wave: fmt(game.wave), score: fmt(game.score) });
    showOverlay('pause');
    announce(t('sr.paused'));
    updateHud();
    persist();
    draw();
  }
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'playing';
    showOverlay(null);
    updateHud();
    focusBoard();
    kick();
  }
  const togglePause = () => (mode === 'playing' ? pause() : resume());

  /** Ghi thống kê + báo cổng đúng một lần cho mỗi ván. Trả true nếu là kỷ lục mới. */
  function recordEnd() {
    if (recorded) return false;
    recorded = true;
    const best = game.score > stats.best;
    stats.played++;
    stats.kills += game.kills;
    if (best) stats.best = game.score;
    stats.bestWave = Math.max(stats.bestWave, game.wave);
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    return best;
  }

  function gameOver() {
    mode = 'over';
    releaseInput();
    const best = recordEnd() && game.score > 0;
    persist();
    kit.sfx('lose');
    vibrate([80, 50, 140]);
    flash(0.5);
    announce(t('sr.over', { n: fmt(game.score) }));
    updateHud();
    $('over-score').textContent = fmt(game.score);
    $('over-wave').textContent = fmt(game.wave);
    $('over-kills').textContent = fmt(game.kills);
    $('over-record').hidden = !best;
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (mode !== 'over') return;
      hideBanner();
      showOverlay('over');
      $('btn-again').focus({ preventScroll: true });
      if (best) {
        kit.sfx('win');
        kit.confetti();
      }
    }, reduced() ? 500 : 1300);
  }

  /** Ván đang dở (đã có điểm hoặc đã chơi ≥ 1 giây) thì hỏi trước, vì bỏ ván là chốt điểm luôn. */
  function requestNew() {
    if (inPlay() && (game.score > 0 || game.tick >= MIN_PLAY_TICKS)) {
      pause();
      kit.modal.open('modal-confirm');
      return;
    }
    if (mode === 'playing' || mode === 'paused') mode = 'ready'; // chưa chơi gì: chia lại, không báo cổng
    if (mode === 'ready') newGame();
    startPlaying();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) recordEnd();
    mode = 'over';
    startPlaying();
  }

  /* ---------------- Sự kiện từ engine → âm thanh, hiệu ứng ---------------- */
  let emptyAt = 0;
  function handleEvents(ev) {
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.type) {
        case 'launch':
          sfx('tap', { volume: 0.35, pitch: 1.5 }, 30);
          break;
        case 'empty': {
          const now = performance.now();
          if (now - emptyAt > 450) {
            emptyAt = now;
            const bx = e.base >= 0 ? E.BASE_X[e.base] : E.W / 2;
            popup(clampX(bx), E.BASE_Y - 12, t('canvas.empty'), pal.enemy, 0.8);
            sfx('error', { volume: 0.4 }, 300);
          }
          break;
        }
        case 'boom':
          sfx('pop', { volume: 0.45, pitch: 0.7 }, 50);
          break;
        case 'kill':
          sparks(e.x, e.y, pal.enemy, 6, 40);
          sfx(e.chain ? 'combo' : 'capture', { volume: 0.4, pitch: e.chain ? 1.3 : 1 }, 60);
          break;
        case 'bomberKill':
          sparks(e.x, e.y, pal.bomber, 18, 70);
          popup(e.x, e.y - 6, '+' + fmt(e.pts * e.mult), pal.bomber, 1.1);
          sfx('coin');
          vibrate(25);
          break;
        case 'split':
          sparks(e.x, e.y, pal.enemy, 4, 30);
          sfx('flip', { volume: 0.35 }, 120);
          break;
        case 'bomber':
          sfx('move', { volume: 0.5 });
          break;
        case 'cityHit':
          sparks(e.x, e.y - 4, pal.city, 22, 70);
          sparks(e.x, e.y - 4, pal.boom[2], 18, 55);
          shake(5, 0.45);
          flash(0.25);
          kit.sfx('error');
          vibrate([60, 40, 90]);
          announce(t('sr.city', { n: E.citiesAlive(game) }));
          break;
        case 'baseHit':
          sparks(e.x, e.y, pal.base, 18, 60);
          shake(3, 0.3);
          sfx('drop');
          vibrate(45);
          announce(t('sr.base'));
          break;
        case 'impact':
          sparks(e.x, e.y, pal.boom[2], 6, 35);
          sfx('drop', { volume: 0.3 }, 120);
          break;
        case 'rebuild':
          sparks(e.x, e.y - 6, pal.city, 14, 40);
          sfx('place');
          break;
        case 'bonusCity':
          kit.toast(t('toast.bonusCity'));
          announce(t('sr.bonusCity'));
          sfx('levelup', null, 300);
          break;
        case 'waveClear':
          banner(
            t('banner.clear', { n: e.wave }),
            t('banner.ammo', { n: e.ammo, pts: fmt(e.ammoPts) }),
            t('banner.cities', { n: e.cities, pts: fmt(e.cityPts) }),
          );
          announce(t('sr.clear', { n: fmt(e.bonus) }));
          kit.sfx('clear');
          persist();
          break;
        case 'wave': {
          const m = E.multiplier(e.wave);
          banner(t('banner.wave', { n: e.wave }), m !== E.multiplier(e.wave - 1) ? t('banner.mult', { n: m }) : '');
          announce(t('sr.wave', { n: e.wave }));
          kit.sfx('levelup');
          persist();
          break;
        }
        case 'over':
          gameOver();
          break;
        default:
          break;
      }
    }
  }
  const clampX = (x) => Math.max(20, Math.min(E.W - 20, x));

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let lastT = 0;
  let acc = 0;
  let saveAcc = 0;
  let clock = 0; // giây, cho sao lấp lánh / nhấp nháy

  function moveCross() {
    const dx = (arrows.has('right') ? 1 : 0) - (arrows.has('left') ? 1 : 0);
    const dy = (arrows.has('down') ? 1 : 0) - (arrows.has('up') ? 1 : 0);
    if (!dx && !dy) {
      arrowHeld = 0;
      return;
    }
    arrowHeld++;
    const v = arrowHeld > 18 ? CROSS_FAST : CROSS_SPEED;
    const k = dx && dy ? Math.SQRT1_2 : 1;
    cross.x = Math.max(E.AIM_X_MIN, Math.min(E.AIM_X_MAX, cross.x + dx * v * k));
    cross.y = Math.max(E.AIM_Y_MIN, Math.min(E.AIM_Y_MAX, cross.y + dy * v * k));
    cross.shown = true;
  }

  function simTick() {
    moveCross();
    const input = pending.length ? { shots: pending } : null;
    pending = [];
    handleEvents(E.step(game, input));
  }

  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min(now - lastT, 100) : 16.7; // tab vừa quay lại: không dồn cả quãng
    lastT = now;
    if (mode === 'playing' && (kit.modal.current() || document.hidden)) pause();
    if (mode === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= E.STEP_MS && n < MAX_CATCHUP && mode === 'playing') {
        acc -= E.STEP_MS;
        n++;
        simTick();
      }
      if (acc > E.STEP_MS) acc = 0; // máy quá chậm: bỏ bớt, không dồn bước
      saveAcc += dt;
      if (saveAcc >= SAVE_EVERY) {
        saveAcc = 0;
        persist();
      }
      updateHud();
    }
    clock += dt / 1000;
    updateFx(dt / 1000);
    draw();
    if (mode === 'playing' || fxActive()) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  function kick() {
    if (raf) return;
    lastT = 0;
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- Bảng màu (theo giao diện sáng / tối, đọc từ CSS) ---------------- */
  const boardArea = $('board-area');
  const boardEl = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let pal = null;
  function readPalette() {
    const cs = getComputedStyle(boardEl);
    const v = (n) => cs.getPropertyValue('--pk-' + n).trim();
    pal = {
      enemy: v('enemy') || '#ff4d6d',
      enemyHead: v('enemy-head') || '#ffffff',
      shot: v('shot') || '#37f0ff',
      city: v('city') || '#4dff9c',
      base: v('base') || '#b18cff',
      pip: v('pip') || '#ffffff',
      ground: v('ground') || '#7c5cff',
      bomber: v('bomber') || '#ffb03a',
      cross: v('cross') || '#ffffff',
      text: v('text') || '#ffffff',
      boom: [v('boom-1'), v('boom-2'), v('boom-3'), v('boom-4')].map((c, i) => c || ['#fff', '#ffe066', '#ff8a3d', '#ff4dd2'][i]),
      star: parseFloat(v('star')) || 0,
      glow: parseFloat(v('glow')) || 0,
    };
    draw();
  }

  /* ---------------- Canvas ---------------- */
  let S = 1; // px canvas trên mỗi px logic
  function resize() {
    const w = boardEl.clientWidth;
    const h = boardEl.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    S = cw / E.W;
    draw();
  }

  /* ---------------- Nền sao (chỉ giao diện tối) ---------------- */
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * E.W, y: Math.random() * (E.GROUND_Y - 30), s: 0.4 + Math.random() * 0.8, tw: Math.random() * Math.PI * 2 }));
  function drawStars() {
    if (!pal.star) return;
    ctx.fillStyle = '#ffffff';
    stars.forEach((st) => {
      ctx.globalAlpha = (reduced() ? 0.55 : 0.4 + 0.35 * Math.sin(clock * 1.7 + st.tw)) * st.s;
      const s = Math.max(1, st.s * S);
      ctx.fillRect(Math.round(st.x * S), Math.round(st.y * S), s, s);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- Hiệu ứng: tia lửa, chữ bay, rung, chớp sáng ---------------- */
  let parts = [];
  let popups = [];
  let shakeT = 0;
  let shakeAmp = 0;
  let flashT = 0;
  function resetFx() {
    parts = [];
    popups = [];
    shakeT = 0;
    flashT = 0;
  }
  function sparks(x, y, color, n, speed) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.8);
      const life = 0.3 + Math.random() * 0.5;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, color, size: 0.7 + Math.random() * 1 });
    }
  }
  function popup(x, y, text, color, life) {
    popups.push({ x, y, text, color, life: life || 1 });
  }
  function shake(amp, dur) {
    if (reduced()) return;
    shakeAmp = amp;
    shakeT = dur;
  }
  function flash(a) {
    if (!reduced()) flashT = a;
  }
  const fxActive = () => parts.length > 0 || popups.length > 0 || shakeT > 0 || flashT > 0;
  function updateFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 60 * dt;
    }
    popups = popups.filter((p) => {
      p.life -= dt;
      if (!reduced()) p.y -= 12 * dt;
      return p.life > 0;
    });
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (flashT > 0) flashT = Math.max(0, flashT - dt * 1.4);
  }

  /* ---------------- Vẽ một khung hình ---------------- */
  const X = (v) => v * S;
  function glow(color, blur) {
    if (pal.glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * S * pal.glow;
    }
  }
  function noGlow() {
    ctx.shadowBlur = 0;
  }
  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(X(x1), X(y1));
    ctx.lineTo(X(x2), X(y2));
    ctx.stroke();
  }
  function dot(x, y, r) {
    ctx.beginPath();
    ctx.arc(X(x), X(y), Math.max(1, r * S), 0, Math.PI * 2);
    ctx.fill();
  }

  // Hình thành phố: các tòa nhà [lệch x, cao, rộng] tính từ tâm, đứng trên mặt đất
  const CITY_SHAPE = [[-9, 6, 4], [-5, 11, 4], [-1, 8, 3.5], [2.5, 13, 3.5], [6, 7, 3]];
  function drawCity(i, alive) {
    const cx = E.CITY_X[i];
    const gy = E.GROUND_Y;
    ctx.lineWidth = Math.max(1, 1.1 * S);
    if (!alive) {
      ctx.strokeStyle = pal.text;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      [[-9, 0], [-6, -3], [-3, -1], [0, -4], [3, -1.5], [6, -2.5], [9, 0]].forEach(([dx, dy], k) => {
        if (k) ctx.lineTo(X(cx + dx), X(gy + dy));
        else ctx.moveTo(X(cx + dx), X(gy + dy));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.strokeStyle = pal.city;
    ctx.fillStyle = pal.city;
    glow(pal.city, 4);
    CITY_SHAPE.forEach(([dx, h, w]) => {
      ctx.globalAlpha = 0.18;
      ctx.fillRect(X(cx + dx), X(gy - h), X(w), X(h));
      ctx.globalAlpha = 1;
      ctx.strokeRect(X(cx + dx), X(gy - h), X(w), X(h));
    });
    noGlow();
  }

  function drawBase(j) {
    const bx = E.BASE_X[j];
    const alive = game.baseAlive[j];
    const gy = E.GROUND_Y;
    const by = E.BASE_Y;
    ctx.lineWidth = Math.max(1, 1.2 * S);
    ctx.beginPath();
    ctx.moveTo(X(bx - 16), X(gy));
    ctx.lineTo(X(bx - 8), X(by));
    ctx.lineTo(X(bx + 8), X(by));
    ctx.lineTo(X(bx + 16), X(gy));
    ctx.closePath();
    ctx.fillStyle = pal.base;
    ctx.globalAlpha = alive ? 0.2 : 0.08;
    ctx.fill();
    ctx.globalAlpha = alive ? 1 : 0.35;
    ctx.strokeStyle = pal.base;
    if (alive) glow(pal.base, 4);
    ctx.stroke();
    noGlow();
    if (alive) {
      // Nòng phóng
      ctx.strokeStyle = pal.shot;
      line(bx, by, bx, by - 4);
    } else {
      // Hố bom
      ctx.strokeStyle = pal.enemy;
      line(bx - 3, by + 2, bx + 3, by + 7);
      line(bx + 3, by + 2, bx - 3, by + 7);
    }
    ctx.globalAlpha = 1;
    // Số phím (máy có chuột)
    if (hoverMQ.matches) {
      ctx.fillStyle = pal.text;
      ctx.globalAlpha = 0.65;
      ctx.font = '700 ' + Math.round(6.5 * S) + 'px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(j + 1), X(bx), X(by + 6.5));
      ctx.globalAlpha = 1;
    }
    // Đạn còn: hình tháp 4-3-2-1 dưới mặt đất
    const n = alive ? game.ammo[j] : 0;
    ctx.strokeStyle = pal.pip;
    ctx.lineWidth = Math.max(1, 1.1 * S);
    let k = 0;
    for (let r = 0; r < 4; r++) {
      const cnt = 4 - r;
      for (let c = 0; c < cnt; c++, k++) {
        const px = bx + (c - (cnt - 1) / 2) * 5;
        const py = gy + 4 + r * 5;
        ctx.globalAlpha = k < n ? 0.95 : 0.14;
        line(px, py + 3, px, py);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    const gy = E.GROUND_Y;
    ctx.fillStyle = pal.ground;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, X(gy), canvas.width, canvas.height - X(gy));
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = pal.ground;
    ctx.lineWidth = Math.max(1, 1.2 * S);
    glow(pal.ground, 5);
    line(0, gy, E.W, gy);
    noGlow();
    ctx.globalAlpha = 1;
  }

  function drawMissiles() {
    const blink = !reduced() && (game.tick >> 2) & 1;
    ctx.lineWidth = Math.max(1, 1.1 * S);
    game.missiles.forEach((m) => {
      const grad = ctx.createLinearGradient(X(m.sx), X(m.sy), X(m.x), X(m.y));
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, pal.enemy);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.9;
      line(m.sx, m.sy, m.x, m.y);
      ctx.globalAlpha = 1;
    });
    game.missiles.forEach((m) => {
      ctx.fillStyle = blink ? pal.enemy : pal.enemyHead;
      glow(pal.enemy, 6);
      dot(m.x, m.y, 1.6);
    });
    noGlow();
  }

  function drawBombers() {
    game.bombers.forEach((b) => {
      const d = b.vx > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(X(b.x + 8 * d), X(b.y));
      ctx.lineTo(X(b.x - 6 * d), X(b.y - 4.5));
      ctx.lineTo(X(b.x - 3 * d), X(b.y));
      ctx.lineTo(X(b.x - 6 * d), X(b.y + 4.5));
      ctx.closePath();
      ctx.fillStyle = pal.bomber;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.bomber;
      ctx.lineWidth = Math.max(1, 1.2 * S);
      glow(pal.bomber, 6);
      ctx.stroke();
      noGlow();
      if (reduced() || (game.tick >> 3) & 1) {
        ctx.fillStyle = pal.enemy;
        dot(b.x + 1 * d, b.y, 1);
      }
    });
  }

  function drawShots() {
    ctx.lineWidth = Math.max(1, 1 * S);
    const blink = reduced() || (game.tick >> 3) & 1;
    game.shots.forEach((s) => {
      ctx.strokeStyle = pal.shot;
      ctx.globalAlpha = 0.85;
      glow(pal.shot, 4);
      line(s.sx, s.sy, s.x, s.y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.boom[0];
      dot(s.x, s.y, 1.3);
      noGlow();
      // Dấu X ở điểm ngắm
      if (blink) {
        ctx.strokeStyle = pal.shot;
        line(s.tx - 2.5, s.ty - 2.5, s.tx + 2.5, s.ty + 2.5);
        line(s.tx + 2.5, s.ty - 2.5, s.tx - 2.5, s.ty + 2.5);
      }
    });
  }

  function drawBooms() {
    game.booms.forEach((b, i) => {
      const r = E.radiusAt(b.age, b.r);
      if (r <= 0) return;
      ctx.beginPath();
      ctx.arc(X(b.x), X(b.y), X(r), 0, Math.PI * 2);
      if (reduced()) {
        // Giảm chuyển động: một màu, không nhấp nháy, có viền rõ
        ctx.fillStyle = pal.boom[1];
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal.boom[2];
        ctx.lineWidth = Math.max(1, 1.4 * S);
        ctx.stroke();
        return;
      }
      const c = pal.boom[1 + (((game.tick >> 2) + i) % 3)];
      const g = ctx.createRadialGradient(X(b.x), X(b.y), 0, X(b.x), X(b.y), X(r));
      g.addColorStop(0, pal.boom[0]);
      g.addColorStop(0.45, c);
      g.addColorStop(1, c);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.9;
      glow(c, 10);
      ctx.fill();
      noGlow();
      ctx.globalAlpha = 1;
    });
  }

  function drawCross() {
    if (!cross.shown || mode !== 'playing') return;
    const x = cross.x;
    const y = cross.y;
    ctx.strokeStyle = pal.cross;
    ctx.lineWidth = Math.max(1, 1 * S);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(X(x), X(y), X(5), 0, Math.PI * 2);
    ctx.stroke();
    line(x - 9, y, x - 3, y);
    line(x + 3, y, x + 9, y);
    line(x, y - 9, x, y - 3);
    line(x, y + 3, x, y + 9);
    ctx.globalAlpha = 1;
  }

  function drawInfo() {
    ctx.font = '700 ' + Math.round(8 * S) + 'px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.text;
    ctx.globalAlpha = 0.8;
    const m = E.multiplier(game.wave);
    if (m > 1) {
      ctx.textAlign = 'left';
      ctx.fillText('×' + m, X(6), X(10));
    }
    if (game.bank > 0) {
      ctx.textAlign = 'right';
      ctx.fillText('+' + game.bank, X(E.W - 6), X(10));
      // Biểu tượng thành phố nhỏ cạnh số thành phố thưởng
      const w = ctx.measureText('+' + game.bank).width / S;
      ctx.strokeStyle = pal.city;
      ctx.lineWidth = Math.max(1, 0.9 * S);
      const x0 = E.W - 8 - w - 10;
      ctx.strokeRect(X(x0), X(9), X(3), X(5));
      ctx.strokeRect(X(x0 + 3), X(6), X(3), X(8));
      ctx.strokeRect(X(x0 + 6), X(10), X(3), X(4));
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!game || !canvas.width || !pal) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (shakeT > 0) {
      const k = shakeT * shakeAmp * S;
      ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    drawStars();
    drawGround();
    for (let i = 0; i < E.N_CITY; i++) drawCity(i, game.cities[i]);
    for (let j = 0; j < E.N_BASE; j++) drawBase(j);
    drawMissiles();
    drawBombers();
    drawShots();
    drawBooms();

    // Tia lửa, chữ bay
    parts.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * S);
      ctx.fillRect(Math.round(X(p.x)), Math.round(X(p.y)), s, s);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(8 * S) + 'px "Be Vietnam Pro", system-ui, sans-serif';
    popups.forEach((p) => {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      glow(p.color, 5);
      ctx.fillText(p.text, X(p.x), X(p.y));
      noGlow();
    });
    ctx.globalAlpha = 1;

    drawInfo();
    drawCross();

    if (flashT > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flashT * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  /* ---------------- Bắn ---------------- */
  /** Toạ độ logic của một điểm trên màn hình (ngoài bàn thì kẹp vào mép). */
  function toLogic(e) {
    const rect = boardEl.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / (rect.width || 1)) * E.W;
    const y = ((e.clientY - rect.top) / (rect.height || 1)) * E.H;
    return { x: Math.max(0, Math.min(E.W, x)), y: Math.max(0, Math.min(E.H, y)) };
  }
  function queueShot(x, y, base) {
    if (mode !== 'playing' || game.phase !== 'play') return;
    pending.push({ x, y, base: base == null ? -1 : base });
  }

  /* ---------------- Bàn phím ---------------- */
  const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const BASE_KEYS = { 1: 0, 2: 1, 3: 2, a: 0, s: 1, d: 2 };
  function releaseInput() {
    arrows.clear();
    arrowHeld = 0;
    pending = [];
  }
  const onButton = (e) => !!(e.target && e.target.closest && e.target.closest('button, input, a'));

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || kit.modal.current()) return;
    const k = e.key;
    if (ARROWS[k]) {
      if (mode !== 'playing') return;
      e.preventDefault();
      arrows.add(ARROWS[k]);
      cross.shown = true;
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      // Đang chơi: Space / Enter là bắn tới tâm ngắm (kể cả khi focus còn ở nút). Ngoài lúc chơi: để nút đang focus tự xử lý
      if (mode === 'playing') {
        e.preventDefault();
        if (!e.repeat) {
          cross.shown = true;
          queueShot(cross.x, cross.y);
        }
        return;
      }
      if (onButton(e) || e.repeat) return;
      e.preventDefault();
      if (mode === 'paused') resume();
      else if (mode === 'ready' || (mode === 'over' && !$('overlay-over').hidden)) startPlaying();
      return;
    }
    if (e.repeat) return;
    const low = k.toLowerCase();
    if (mode === 'playing' && BASE_KEYS[low] != null) {
      e.preventDefault();
      cross.shown = true;
      queueShot(cross.x, cross.y, BASE_KEYS[low]);
      return;
    }
    if (low === 'p') {
      e.preventDefault();
      togglePause();
    } else if (k === 'Escape') {
      if (mode === 'playing') {
        e.preventDefault();
        pause();
      }
    } else if (low === 'n') {
      e.preventDefault();
      requestNew();
    } else if (low === 'h' || k === '?') {
      e.preventDefault();
      pause();
      kit.modal.open('modal-help');
    }
  });
  document.addEventListener('keyup', (e) => {
    if (ARROWS[e.key]) arrows.delete(ARROWS[e.key]);
  });

  /* ---------------- Chuột / cảm ứng ----------------
   * Chuột / bút: tâm ngắm theo con trỏ, nhấp trái là bắn từ bệ gần nhất (phím 1/2/3 bắn từ bệ chọn sẵn).
   * Cảm ứng: mỗi lần chạm (kể cả nhiều ngón) là một phát vào đúng chỗ chạm. */
  boardArea.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (mode === 'ready' && e.target.closest('#overlay-start')) {
      startPlaying();
      return;
    }
    if (e.target.closest('.overlay') || mode !== 'playing' || kit.modal.current()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    focusBoard();
    const p = toLogic(e);
    if (e.pointerType === 'touch') cross.shown = false;
    else {
      cross.x = p.x;
      cross.y = Math.min(p.y, E.AIM_Y_MAX);
      cross.shown = true;
    }
    queueShot(p.x, p.y);
  });
  boardArea.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = toLogic(e);
    cross.x = Math.max(E.AIM_X_MIN, Math.min(E.AIM_X_MAX, p.x));
    cross.y = Math.max(E.AIM_Y_MIN, Math.min(E.AIM_Y_MAX, p.y));
    cross.shown = true;
  });
  boardArea.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !arrows.size) cross.shown = false;
  });
  boardArea.addEventListener('contextmenu', (e) => e.preventDefault());
  boardArea.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Nút ---------------- */
  $('btn-start').addEventListener('click', startPlaying);
  $('btn-again').addEventListener('click', () => {
    if (mode === 'over') startPlaying();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNew);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmt(stats.played);
    $('stats-best').textContent = fmt(stats.best);
    $('stats-wave').textContent = fmt(stats.bestWave);
    $('stats-kills').textContent = fmt(stats.kills);
  });

  /* ---------------- Tự dừng / lưu khi rời trang ---------------- */
  kit.onLeave(() => {
    pause();
    persist();
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) draw();
  });
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', () => {
    resetFx();
    draw();
  });
  darkMQ.addEventListener && darkMQ.addEventListener('change', readPalette);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.tick > 0 && !E.isOver(restored)) {
    game = restored;
    mode = 'paused';
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    $('pause-sub').textContent = t('pause.detail', { wave: fmt(game.wave), score: fmt(game.score) });
    showOverlay('pause');
  } else {
    kit.store.remove(keys.save);
    newGame();
    mode = 'ready';
    renderStartBest();
    showOverlay('start');
  }
  readPalette();
  updateHud();
  resize();
  writeSummary();
  if (!settings().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  } else {
    (mode === 'paused' ? $('btn-resume') : $('btn-start')).focus({ preventScroll: true });
  }
})();
