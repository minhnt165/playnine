/* =====================================================================
 * Xếp Tầng - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng <canvas> kiểu isometric 2.5D, camera lên theo tháp; hết ván thì lùi ra cho thấy cả tháp
 *   - Vòng lặp: requestAnimationFrame, mô phỏng theo bước cố định E.STEP_MS (giới hạn dt khi tab vừa quay lại)
 *   - Trạng thái màn: ready (màn chờ) → playing ⇄ paused → over
 *   - Báo ván cho cổng: bắt đầu kit.sdk.start(MODE), mở lại ván dở kit.sdk.start(MODE, true);
 *     hết ván kit.sdk.end({ mode, won: false, score }); bỏ ván khi đã có điểm hoặc chơi ≥ 1 giây cũng gửi won: false
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const LAYER_H = 20; // độ dày một tầng (đơn vị thế giới), chỉ để vẽ
  const ISO_C = Math.cos(Math.PI / 6);
  const ISO_S = 0.5;
  const MIN_PLAY_MS = 1000; // bỏ ván chơi ít nhất chừng này (hoặc đã có điểm) thì tính là một ván
  const OVER_DELAY = 750; // hết ván: chờ khối rơi và camera lùi ra rồi mới hiện bảng điểm

  const kit = PNKit.init({
    gameId: 'xeptang',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = kit.settings.get();
  const reduceMq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(reduceMq && reduceMq.matches);

  const stage = $('stage');
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  /* ---------------- Thống kê ---------------- */
  const rawStats = kit.store.read(keys.stats, {}) || {};
  const nat = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const stats = { played: nat(rawStats.played), best: nat(rawStats.best), bestStreak: nat(rawStats.bestStreak), blocks: nat(rawStats.blocks) };

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let mode = 'ready';
  let acc = 0; // thời gian thật chưa mô phỏng (ms)
  let last = performance.now();
  let runId = 0;
  let overAt = 0;
  let overShown = false;
  let pieces = []; // phần bị cắt đang rơi (trang trí)
  let ring = null; // vòng sáng khi hoàn hảo
  let label = null; // chữ "Hoàn hảo ×n"
  let shake = 0;
  const cam = { k: 1, oy: 0 }; // tỉ lệ (px / đơn vị) và vị trí màn hình của y = 0
  let hueNow = 0;
  let cw = 1;
  let ch = 1;
  let dpr = 1;
  let baseScale = 1;
  let dark = false;

  const randomSeed = () => Math.floor(Math.random() * 2147483647);
  const hueOf = (i) => game.hue0 + i * E.HUE_STEP;
  const topHue = () => (game ? hueOf(game.blocks) : 0);

  /* ---------------- Cài đặt, rung ---------------- */
  function onSetting(key) {
    if (key === 'theme') readTheme();
  }
  function vibrate(p) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* bỏ qua */ }
  }
  /** Đọc --bg của kit để biết đang sáng hay tối (vẽ nền canvas theo đó). */
  function readTheme() {
    requestAnimationFrame(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const m = /^#([0-9a-f]{6})$/i.exec(bg);
      if (m) {
        const n = parseInt(m[1], 16);
        dark = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 110;
      }
    });
  }
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);

  /* ---------------- Lưu ---------------- */
  const inRun = () => !!game && !game.over && (mode === 'playing' || mode === 'paused');
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { n: stats.best }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: String(stats.best), label: t('hud.best') }, { value: '×' + stats.bestStreak, label: t('stats.streak') }] : [],
      resume: inRun() ? { title: t('app.name'), detail: t('summary.resume', { n: game.score }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRun()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Giao diện ngoài canvas ---------------- */
  function showOverlay(id) {
    ['ov-start', 'ov-pause', 'ov-over'].forEach((x) => { $(x).hidden = x !== id; });
    $('btn-pause').hidden = mode !== 'playing';
  }
  function renderHud() {
    $('score').textContent = game ? kit.i18n.fmtNumber(game.score) : '0';
    $('combo').textContent = game && game.streak > 0 ? '×' + game.streak : '–';
    $('best').textContent = kit.i18n.fmtNumber(stats.best);
    $('start-best').textContent = stats.best > 0 ? t('start.best', { n: kit.i18n.fmtNumber(stats.best) }) : '';
  }
  function announce(msg) {
    $('sr-status').textContent = msg;
  }

  /* ---------------- Luồng ván ---------------- */
  function newRun() {
    kit.modal.close('modal-confirm');
    runId++;
    game = E.newGame(randomSeed());
    mode = 'playing';
    acc = 0;
    last = performance.now();
    overShown = false;
    ring = null;
    label = null;
    kit.store.remove(keys.save);
    showOverlay(null);
    renderHud();
    kit.sdk.start(MODE);
    kit.sfx('start');
    writeSummary();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    showOverlay('ov-pause');
    persist();
  }
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'playing';
    acc = 0;
    last = performance.now();
    showOverlay(null);
  }

  /** Mô phỏng phần thời gian thật đã dồn theo bước cố định. */
  function advance() {
    let n = 0;
    while (acc >= E.STEP_MS && n < 40) {
      game = E.step(game);
      acc -= E.STEP_MS;
      n++;
    }
    if (n >= 40) acc = 0; // máy quá chậm: bỏ bớt, không dồn bước
  }

  /** Lúc bấm thả: mô phỏng tới đúng thời điểm bấm (làm tròn tới bước gần nhất). */
  function catchUp() {
    const now = performance.now();
    acc += Math.min(now - last, 100);
    last = now;
    advance();
    if (acc >= E.STEP_MS / 2) {
      game = E.step(game);
      acc -= E.STEP_MS;
    }
  }

  /** Cao độ âm khi hoàn hảo: đi lên theo thang trưởng theo độ dài chuỗi. */
  function streakPitch(streak) {
    const scale = [0, 2, 4, 5, 7, 9, 11];
    const i = Math.max(0, streak - 1);
    const semis = Math.floor(i / 7) * 12 + scale[i % 7];
    return Math.min(4, Math.pow(2, semis / 12));
  }

  function dropBlock() {
    catchUp();
    const r = E.drop(game);
    if (r.event.kind === 'early' || r.event.kind === 'over') return;
    game = r.game;
    const ev = r.event;
    if (ev.cut) addPiece(ev);
    if (ev.kind === 'miss') {
      gameOver();
      return;
    }
    if (ev.kind === 'perfect') {
      kit.sfx('pop', { pitch: streakPitch(ev.streak) });
      if (ev.grew) kit.sfx('coin', { volume: 0.6 });
      vibrate(18);
      ring = { b: ev.placed, y: ev.layer * LAYER_H, age: 0 };
      label = { text: t('fx.perfect') + (ev.streak > 1 ? ' ×' + ev.streak : ''), sub: ev.grew ? t('fx.grow') : '', age: 0 };
      announce(t('sr.perfect', { n: game.score }));
    } else {
      kit.sfx('place');
      vibrate(10);
      announce(t('sr.place', { n: game.score }));
    }
    renderHud();
    persist();
  }

  function gameOver() {
    mode = 'over';
    overAt = performance.now();
    overShown = false;
    const my = ++runId;
    const prevBest = stats.best;
    const newBest = game.score > prevBest && game.score > 0;
    stats.played++;
    stats.blocks += game.blocks;
    if (newBest) stats.best = game.score;
    stats.bestStreak = Math.max(stats.bestStreak, game.bestStreak);
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won: false, score: game.score });
    kit.sfx('drop');
    vibrate([60, 40, 90]);
    shake = reduced() ? 0 : 1;
    showOverlay(null);
    renderHud();
    announce(t('sr.over', { n: game.score }));
    $('over-score').textContent = kit.i18n.fmtNumber(game.score);
    $('over-new').hidden = !newBest;
    $('over-detail').textContent = t('over.detail', { n: game.blocks, p: game.perfects, s: game.bestStreak });
    $('over-best').textContent = newBest ? '' : t('over.best', { n: kit.i18n.fmtNumber(stats.best) });
    setTimeout(() => {
      if (my !== runId || mode !== 'over') return;
      overShown = true;
      showOverlay('ov-over');
      if (newBest && prevBest > 0) {
        kit.sfx('levelup');
        kit.confetti();
      } else {
        kit.sfx('lose');
      }
    }, reduced() ? 150 : OVER_DELAY);
  }

  /** Ván đang chơi đã có điểm hoặc đủ lâu thì hỏi trước, vì bỏ ván được ghi là một ván. */
  const counts = () => inRun() && (game.score > 0 || game.t >= MIN_PLAY_MS);
  function requestNew() {
    if (counts()) {
      pause();
      kit.modal.open('modal-confirm');
    } else {
      newRun();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (counts()) {
      stats.played++;
      stats.blocks += game.blocks;
      stats.best = Math.max(stats.best, game.score);
      stats.bestStreak = Math.max(stats.bestStreak, game.bestStreak);
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, score: game.score });
    }
    newRun();
  }

  /** Thao tác chính (chạm / Space / Enter): bắt đầu, thả, chơi tiếp, chơi lại. */
  function action() {
    if (kit.modal.current()) return;
    if (mode === 'ready') newRun();
    else if (mode === 'playing') dropBlock();
    else if (mode === 'paused') resume();
    else if (mode === 'over' && overShown && performance.now() - overAt > OVER_DELAY + 250) newRun();
  }

  /* ---------------- Hiệu ứng ---------------- */
  function addPiece(ev) {
    if (reduced()) return;
    const screenDir = ev.side * (ev.axis === 'x' ? 1 : -1); // phía trên màn hình của phần rơi
    pieces.push({
      b: Object.assign({}, ev.cut),
      y: (ev.layer - 1) * LAYER_H,
      vy: 20,
      axis: ev.axis,
      drift: ev.side * 35,
      rot: 0,
      vr: screenDir * (1.6 + Math.random() * 1.4),
      hue: hueOf(ev.layer),
      back: ev.side < 0, // phía sau tháp: vẽ trước tháp để bị che
    });
    if (pieces.length > 12) pieces.shift();
  }

  function updateFx(dt) {
    pieces.forEach((p) => {
      p.vy -= 1100 * dt;
      p.y += p.vy * dt;
      p.b[p.axis] += p.drift * dt;
      p.rot += p.vr * dt;
    });
    pieces = pieces.filter((p) => cam.oy - (p.y + LAYER_H) * cam.k - E.BASE * cam.k < ch + 50);
    if (ring) {
      ring.age += dt;
      if (ring.age > 0.5) ring = null;
    }
    if (label) {
      label.age += dt;
      if (label.age > 1.1) label = null;
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.5);
    const c = camTarget();
    const f = reduced() ? 1 : 1 - Math.exp(-dt * 6);
    cam.k += (c.k - cam.k) * f;
    cam.oy += (c.oy - cam.oy) * f;
    hueNow += (topHue() - hueNow) * (reduced() ? 1 : 1 - Math.exp(-dt * 3));
  }

  /* ---------------- Vẽ ---------------- */
  function resize() {
    const r = stage.getBoundingClientRect();
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const isoW = 2 * E.BASE * ISO_C;
    // Khung ngang thấp (điện thoại xoay ngang) thì cho tháp chiếm nhiều chiều cao hơn
    baseScale = Math.min((cw * 0.56) / isoW, (ch * (cw / ch > 1.3 ? 0.5 : 0.36)) / isoW);
    snapCamera();
    draw();
  }
  /** Mục tiêu camera: lên theo đỉnh tháp; hết ván thì lùi ra cho thấy cả tháp. */
  function camTarget() {
    const topY = (game ? game.blocks : 0) * LAYER_H;
    if (mode === 'over' && game) {
      const k = baseScale * Math.min(1, (ch * 0.4) / Math.max(1, (topY + LAYER_H) * baseScale));
      return { k, oy: ch * 0.52 + topY * k };
    }
    return { k: baseScale, oy: ch * 0.58 + topY * baseScale };
  }
  /** Đặt camera đúng chỗ ngay (lần đầu, đổi cỡ khung). */
  function snapCamera() {
    const c = camTarget();
    cam.k = c.k;
    cam.oy = c.oy;
    hueNow = topHue();
  }

  const hsl = (h, s, l, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(1) + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';

  function poly(pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** Hộp { x, z, w, d } từ y0 tới y1 (đơn vị thế giới): mặt trên, mặt trước-trái (+z), mặt trước-phải (+x). */
  function drawBox(b, y0, y1, hue, alpha, P) {
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    const z0 = b.z - b.d / 2;
    const z1 = b.z + b.d / 2;
    const a = alpha == null ? 1 : alpha;
    const L = dark ? -6 : 0;
    poly([P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1), P(x0, y0, z1)], hsl(hue, 62, 55 + L, a));
    poly([P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), P(x1, y0, z0)], hsl(hue, 58, 43 + L, a));
    const top = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
    poly(top, hsl(hue, 72, 68 + L, a));
    // Viền sáng mép trước của mặt trên cho khối rõ nét
    ctx.beginPath();
    ctx.moveTo(top[3][0], top[3][1]);
    ctx.lineTo(top[2][0], top[2][1]);
    ctx.lineTo(top[1][0], top[1][1]);
    ctx.strokeStyle = 'rgba(255,255,255,' + 0.45 * a + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Nền đổi màu theo độ cao tháp
    const h = hueNow;
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    if (dark) {
      g.addColorStop(0, hsl(h + 40, 38, 15));
      g.addColorStop(1, hsl(h, 42, 7));
    } else {
      g.addColorStop(0, hsl(h + 40, 70, 93));
      g.addColorStop(1, hsl(h, 55, 80));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    if (!game) return;

    const k = cam.k;
    const sx = shake > 0 ? Math.sin(performance.now() / 22) * 5 * shake : 0;
    const cx = cw / 2 + sx;
    const oy = cam.oy;
    const P = (x, y, z) => [cx + (x - z) * ISO_C * k, oy + ((x + z) * ISO_S - y) * k];

    pieces.forEach((p) => { if (p.back) drawPiece(p, P); });

    // Chỉ vẽ các tầng còn trong khung (tầng i nằm từ (i-1)·H tới i·H; đế i = 0 là bệ cao)
    const L = game.layers;
    const first = Math.max(1, Math.floor((oy - ch) / (LAYER_H * k) - (E.BASE * ISO_S) / LAYER_H) - 1);
    if (first <= 1) drawBox(L[0], -60 * LAYER_H, 0, hueOf(0) - 10, 1, P);
    for (let i = first; i < L.length; i++) drawBox(L[i], (i - 1) * LAYER_H, i * LAYER_H, hueOf(i), 1, P);

    // Khối đang trượt (nội suy theo phần thời gian chưa mô phỏng cho mượt)
    if (mode === 'playing' || mode === 'paused') {
      const view = Object.assign({}, game, { t: Math.max(game.cur.spawnT, game.t + (mode === 'playing' ? Math.max(-E.STEP_MS, acc) : 0)) });
      const m = E.moving(view);
      drawBox(m, game.blocks * LAYER_H, (game.blocks + 1) * LAYER_H, hueOf(game.blocks + 1), 1, P);
    }

    pieces.forEach((p) => { if (!p.back) drawPiece(p, P); });

    if (ring && !reduced()) {
      const p = ring.age / 0.5;
      const s = 1 + 0.35 * p;
      const b = ring.b;
      const r = Object.assign({}, b, { w: b.w * s, d: b.d * s });
      const pts = [P(r.x - r.w / 2, ring.y, r.z - r.d / 2), P(r.x + r.w / 2, ring.y, r.z - r.d / 2), P(r.x + r.w / 2, ring.y, r.z + r.d / 2), P(r.x - r.w / 2, ring.y, r.z + r.d / 2)];
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (label) {
      const a = Math.min(1, (1.1 - label.age) / 0.35);
      const rise = reduced() ? 0 : label.age * 14;
      const y = ch * 0.17 - rise;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 ' + Math.round(Math.min(30, cw / 12)) + 'px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.fillStyle = dark ? hsl(h, 85, 82, a) : hsl(h, 70, 32, a);
      ctx.fillText(label.text, cw / 2, y);
      if (label.sub) {
        ctx.font = '700 ' + Math.round(Math.min(18, cw / 20)) + 'px "Be Vietnam Pro", system-ui, sans-serif';
        ctx.fillText(label.sub, cw / 2, y + 28);
      }
    }
  }

  function drawPiece(p, P) {
    const c = P(p.b.x, p.y + LAYER_H / 2, p.b.z);
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(p.rot);
    ctx.translate(-c[0], -c[1]);
    drawBox(p.b, p.y, p.y + LAYER_H, p.hue, 1, P);
    ctx.restore();
  }

  /* ---------------- Vòng lặp ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = now - last;
    last = now;
    if (dt > 100) dt = 100; // tab vừa quay lại / máy khựng: không cho nhảy cóc
    if (dt < 0) dt = 0;
    if (mode === 'playing') {
      if (kit.modal.current() || document.hidden) pause();
      else {
        acc += dt;
        advance();
      }
    }
    updateFx(dt / 1000);
    draw();
  }

  /* ---------------- Sự kiện ---------------- */
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target.closest && (e.target.closest('button') || e.target.closest('.ov-card')))) return;
    e.preventDefault();
    action();
  });
  // Chạm vào thẻ màn chờ / tạm dừng (ngoài nút) cũng tính là thao tác chính
  document.querySelectorAll('#ov-start .ov-card, #ov-pause .ov-card').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      action();
    });
  });
  $('btn-start').addEventListener('click', () => { if (mode === 'ready') newRun(); });
  $('btn-resume').addEventListener('click', resume);
  $('btn-again').addEventListener('click', () => { if (mode === 'over') newRun(); });
  $('btn-pause').addEventListener('click', pause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-best').textContent = kit.i18n.fmtNumber(stats.best);
    $('stats-streak').textContent = '×' + stats.bestStreak;
    $('stats-blocks').textContent = kit.i18n.fmtNumber(stats.blocks);
  });
  $('sw-vibrate').addEventListener('change', (e) => { if (e.target.checked) vibrate(20); });
  document.querySelector('[data-open="modal-help"]').addEventListener('click', () => {
    if (!settings.guideSeen) kit.settings.set({ guideSeen: true });
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || kit.modal.current()) return;
    const k = e.key;
    const onButton = e.target && e.target.tagName === 'BUTTON';
    if (k === ' ' || k === 'Spacebar') {
      // Space luôn là thao tác chính, kể cả khi nút trên thanh đang được focus
      if (onButton) e.target.blur();
      if (!e.repeat) action();
    } else if (k === 'Enter') {
      if (onButton) return; // Enter trên nút: để nút tự xử lý
      if (!e.repeat) action();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      else return;
    } else if (k === 'n' || k === 'N') {
      requestNew();
    } else {
      return;
    }
    e.preventDefault();
  });

  kit.onLeave(() => {
    pause();
    persist();
  });
  window.addEventListener('blur', pause);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  readTheme();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !restored.over) {
    game = restored;
    mode = 'paused';
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    showOverlay('ov-pause');
  } else {
    kit.store.remove(keys.save);
    game = E.newGame(randomSeed());
    mode = 'ready';
    showOverlay('ov-start');
  }
  renderHud();
  writeSummary();
  resize();
  snapCamera();
  if (!settings.guideSeen) {
    kit.modal.open('modal-help');
    kit.settings.set({ guideSeen: true });
  }
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
