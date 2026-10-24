/* =====================================================================
 * Bóng Bàn - Giao diện + luồng trận (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng canvas, vòng lặp requestAnimationFrame; engine chạy bước cố định 1/120 s (dồn thời gian, giới hạn dt)
 *   - Điều khiển: rê chuột / kéo ở bất kỳ đâu trên bàn (vợt theo ngón tay), hoặc giữ phím mũi tên
 *   - Màn hình dọc: bạn ở dưới, máy ở trên; màn hình ngang: bạn bên trái, máy bên phải (chỉ xoay hình vẽ)
 *   - Báo trận cho cổng (metric wins, mode = mức máy easy | medium | hard):
 *     - bấm Bắt đầu: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true) ngay khi tải trang
 *     - hết trận: kit.sdk.end({ mode, won, assisted: false })
 *     - bỏ trận sau quả giao đầu tiên: won false; chưa giao quả nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = ['easy', 'medium', 'hard'];
  const kit = PNKit.init({
    gameId: 'bongban',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { played: toInt(raw.played), won: toInt(raw.won), longest: toInt(raw.longest), streak: toInt(raw.streak), bestStreak: toInt(raw.bestStreak), levels: {} };
    LEVELS.forEach((lv) => {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won) };
    });
    return st;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);

  /* ---------------- Trạng thái ---------------- */
  let game = null; // trận hiện tại (trạng thái engine), null = chưa bắt đầu trận nào
  let prev = null; // trạng thái bước trước, để nội suy khi vẽ
  let mode = 'idle'; // idle (màn chờ) | running | paused | over (đã xong, chờ đóng bảng kết quả)
  let counted = false; // trận này đã tính thống kê / báo kết thúc
  let resultOpen = false;
  let modalWasOpen = false;
  let lastScorer = 0; // ai vừa ghi điểm (dòng chữ giữa bàn)
  let acc = 0;
  let last = 0;
  const held = new Set(); // phím hướng đang giữ: 'neg' | 'pos'
  let pointerTarget = null; // vị trí ngang (đơn vị bàn) theo chuột / ngón tay
  const idleState = E.newGame({ level: 'medium', seed: 1 }); // chỉ để vẽ bàn khi chưa có trận

  const settingLevel = () => (LEVELS.indexOf(kit.settings.get().level) >= 0 ? kit.settings.get().level : 'medium');
  const levelOf = () => (game && !E.isOver(game) ? game.level : settingLevel());
  const inProgress = () => !!game && game.served && !E.isOver(game) && !counted;

  /* ---------------- Hiệu ứng (trang trí, tắt khi giảm chuyển động) ---------------- */
  const fx = { shake: 0, flash: [0, 0], trail: [], sparks: [], pop: 0 };
  const calm = () => reduced.matches;
  function resetFx() {
    fx.shake = 0;
    fx.flash = [0, 0];
    fx.trail = [];
    fx.sparks = [];
  }
  function sparks(x, y, n, color) {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 160;
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.25, age: 0, color });
    }
  }
  function buzz(ms) {
    if (!kit.settings.get().vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Bố cục canvas ---------------- */
  const view = { w: 0, h: 0, dpr: 1, land: false, scale: 1, ox: 0, oy: 0 };
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      t1: v('--table-1'), t2: v('--table-2'), edge: v('--table-edge'), line: v('--table-line'), net: v('--net'),
      you: v('--pad-you'), youRim: v('--pad-you-rim'), cpu: v('--pad-cpu'), cpuRim: v('--pad-cpu-rim'),
      ball: v('--ball'), glow: v('--ball-glow'), ink: v('--score-ink'), banner: v('--banner-ink'), font: v('--font') || 'system-ui, sans-serif',
    };
  }
  function layout() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.w = w;
    view.h = h;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    view.land = w > h * 1.15;
    const m = 10;
    const tw = view.land ? E.L : E.W;
    const th = view.land ? E.W : E.L;
    view.scale = Math.max(0.1, Math.min((w - 2 * m) / tw, (h - 2 * m) / th));
    view.ox = (w - tw * view.scale) / 2;
    view.oy = (h - th * view.scale) / 2;
  }
  /** Tọa độ bàn (x ngang, y dọc) → điểm trên màn hình. Ngang: bạn (y = L) bên trái. */
  function P(x, y) {
    return view.land
      ? { x: view.ox + (E.L - y) * view.scale, y: view.oy + x * view.scale }
      : { x: view.ox + x * view.scale, y: view.oy + y * view.scale };
  }
  /** Điểm trên màn hình → vị trí ngang trên bàn (cho vợt theo ngón tay / chuột). */
  function lateralAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return view.land ? (clientY - r.top - view.oy) / view.scale : (clientX - r.left - view.ox) / view.scale;
  }

  /* ---------------- Vẽ ---------------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const lerp = (a, b, k) => a + (b - a) * k;

  function drawTable(s) {
    const a = P(0, 0);
    const b = P(E.W, E.L);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    const k = view.scale;
    // Bóng đổ + cạnh bàn
    ctx.fillStyle = colors.edge;
    roundRect(x - 2, y - 2 + 6 * k, w + 4, h + 4, 10 * k);
    ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, colors.t1);
    g.addColorStop(1, colors.t2);
    ctx.fillStyle = g;
    roundRect(x, y, w, h, 8 * k);
    ctx.fill();
    // Đường biên, đường giữa dọc bàn
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = Math.max(1.5, 3 * k);
    const inset = 5 * k;
    ctx.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
    ctx.lineWidth = Math.max(1, 1.5 * k);
    ctx.beginPath();
    const c1 = P(E.W / 2, 0);
    const c2 = P(E.W / 2, E.L);
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Điểm số mờ ở mỗi nửa bàn
    const sc = s ? s.score : [0, 0];
    ctx.fillStyle = colors.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(130 * k) + 'px ' + colors.font;
    const py = P(E.W / 2, E.L * 0.75);
    const cy = P(E.W / 2, E.L * 0.25);
    ctx.fillText(String(sc[0]), py.x, py.y);
    ctx.fillText(String(sc[1]), cy.x, cy.y);
    // Lưới
    const n1 = P(-8, E.L / 2);
    const n2 = P(E.W + 8, E.L / 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(2, 5 * k);
    ctx.beginPath();
    ctx.moveTo(n1.x + (view.land ? 3 * k : 0), n1.y + (view.land ? 0 : 3 * k));
    ctx.lineTo(n2.x + (view.land ? 3 * k : 0), n2.y + (view.land ? 0 : 3 * k));
    ctx.stroke();
    ctx.strokeStyle = colors.net;
    ctx.lineWidth = Math.max(2, 4 * k);
    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    ctx.stroke();
    ctx.fillStyle = colors.net;
    [n1, n2].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, 5 * k), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPaddle(i, x) {
    const k = view.scale;
    const c = P(x, E.PAD_Y[i]);
    const pw = (view.land ? E.PAD_H : E.PAD_W) * k;
    const ph = (view.land ? E.PAD_W : E.PAD_H) * k;
    const f = fx.flash[i];
    const grow = 1 + f * 0.12;
    const w = pw * (view.land ? 1 : grow);
    const h = ph * (view.land ? grow : 1);
    if (f > 0) {
      ctx.shadowColor = i === 0 ? colors.you : colors.ball;
      ctx.shadowBlur = 18 * f;
    }
    ctx.fillStyle = i === 0 ? colors.you : colors.cpu;
    roundRect(c.x - w / 2, c.y - h / 2, w, h, Math.min(w, h) / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.5, 2 * k);
    ctx.strokeStyle = i === 0 ? colors.youRim : colors.cpuRim;
    ctx.stroke();
  }

  function drawBall(bx, by, showTrail) {
    const k = view.scale;
    const p = P(bx, by);
    const r = Math.max(3, E.R * k);
    if (showTrail && !calm()) {
      for (let i = 0; i < fx.trail.length; i++) {
        const q = fx.trail[i];
        const a = (i + 1) / (fx.trail.length + 1);
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = colors.ball;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * (0.45 + 0.5 * a), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(p.x + r * 0.5, p.y + r * 0.7, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 10;
    const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, '#fff3dc');
    g.addColorStop(1, colors.ball);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    return p;
  }

  function drawText(text, size, y, color, alpha) {
    const c = P(E.W / 2, E.L / 2);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = '800 ' + Math.round(size) + 'px ' + colors.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size * 0.12);
    ctx.strokeStyle = 'rgba(8, 20, 50, 0.55)';
    ctx.strokeText(text, c.x, c.y + y);
    ctx.fillStyle = color;
    ctx.fillText(text, c.x, c.y + y);
    ctx.globalAlpha = 1;
  }

  /** Dòng chữ giữa bàn: đếm ngược + ai giao (và Hòa / Điểm quyết định), hoặc ai vừa ghi điểm. */
  function drawBanner(s) {
    const k = view.scale;
    const base = Math.min(view.w, view.h);
    if (s.phase === 'countdown' && mode !== 'idle') {
      const n = E.countdownNumber(s);
      const frac = (s.timer % E.COUNT_STEP) / E.COUNT_STEP; // 1 → 0 trong mỗi số
      const pop = calm() ? 1 : 1 + 0.25 * Math.max(0, frac - 0.6) / 0.4;
      drawText(String(n), Math.min(110 * k, base * 0.2) * pop, 0, colors.banner);
      drawText(t(s.server === 0 ? 'canvas.serveYou' : 'canvas.serveCpu'), Math.min(24 * k, 22), -Math.min(78 * k, base * 0.16), colors.banner);
      const sub = statusLine(s.score);
      if (sub) drawText(sub, Math.min(20 * k, 19), Math.min(78 * k, base * 0.16), colors.ball);
    } else if (s.phase === 'point' || (s.phase === 'over' && mode === 'over')) {
      const who = lastScorer;
      const a = s.phase === 'point' ? Math.min(1, s.timer / 30) : 1;
      drawText(t(who === 0 ? 'canvas.pointYou' : 'canvas.pointCpu'), Math.min(34 * k, 32), 0, who === 0 ? colors.ball : colors.banner, a);
    }
  }
  /** "Hòa" ở 10-10 trở đi khi bằng điểm, "Điểm quyết định" khi một bên chỉ còn thiếu 1 điểm. */
  function statusLine(sc) {
    if (sc[0] >= E.WIN_POINTS - 1 && sc[0] === sc[1]) return t('canvas.deuce');
    for (let i = 0; i < 2; i++) if (E.winnerOf([sc[0] + (i === 0 ? 1 : 0), sc[1] + (i === 1 ? 1 : 0)]) === i) return t('canvas.matchPoint');
    return '';
  }

  function draw(alpha) {
    if (!view.w) return;
    const s = game || idleState;
    const p = prev || s;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (fx.shake > 0.05 && !calm()) ctx.translate((Math.random() * 2 - 1) * fx.shake, (Math.random() * 2 - 1) * fx.shake);
    drawTable(s);
    // Nội suy giữa hai bước mô phỏng cho mượt (bỏ qua khi vừa đổi pha: bóng nhảy về vợt giao)
    const smooth = p.phase === s.phase && s.phase === 'play' && !s.events.some((e) => e.type === 'hit');
    const k = smooth ? alpha : 1;
    drawPaddle(1, lerp(p.pads[1].x, s.pads[1].x, k));
    drawPaddle(0, lerp(p.pads[0].x, s.pads[0].x, k));
    if (s.phase !== 'over' && s.phase !== 'point' || (s.phase === 'point' && s.ball.y > -2 * E.R && s.ball.y < E.L + 2 * E.R)) {
      const bp = drawBall(smooth ? lerp(p.ball.x, s.ball.x, k) : s.ball.x, smooth ? lerp(p.ball.y, s.ball.y, k) : s.ball.y, s.phase === 'play');
      if (mode === 'running' && s.phase === 'play') {
        fx.trail.push(bp);
        if (fx.trail.length > 10) fx.trail.shift();
      } else if (s.phase !== 'play') fx.trail = [];
    }
    fx.sparks.forEach((q) => {
      ctx.globalAlpha = Math.max(0, 1 - q.age / q.life);
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(1.5, 2.2 * view.scale), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawBanner(s);
  }

  function updateFx(dt) {
    fx.shake = fx.shake > 0 ? fx.shake * Math.exp(-dt * 14) : 0;
    fx.flash = fx.flash.map((f) => Math.max(0, f - dt * 4));
    fx.sparks = fx.sparks.filter((q) => {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
      return q.age < q.life;
    });
  }

  /* ---------------- Bảng điểm / lớp phủ ---------------- */
  function renderHud() {
    const s = game || idleState;
    $('score-you').textContent = game ? s.score[0] : 0;
    $('score-cpu').textContent = game ? s.score[1] : 0;
    const active = !!game && !E.isOver(game);
    $('box-you').classList.toggle('serving', active && s.server === 0);
    $('box-cpu').classList.toggle('serving', active && s.server === 1);
    $('hud-level').textContent = t('level.' + levelOf());
    $('btn-level').setAttribute('aria-label', t('set.level') + ': ' + t('level.' + levelOf()));
    $('btn-pause').disabled = mode !== 'running' && mode !== 'paused';
  }
  function renderOverlays() {
    $('overlay-start').hidden = mode !== 'idle';
    $('overlay-pause').hidden = mode !== 'paused';
    board.classList.toggle('idle', mode !== 'running');
    const resumable = inProgress();
    $('start-label').textContent = t(resumable ? 'start.continue' : 'start.go');
    $('start-saved').hidden = !resumable;
    $('btn-start-new').hidden = !resumable;
    if (resumable) $('start-saved').textContent = t('start.saved', { you: game.score[0], cpu: game.score[1] });
    if (game) $('pause-sub').textContent = t('pause.sub', { you: game.score[0], cpu: game.score[1], level: t('level.' + game.level) });
  }
  function setMode(m) {
    mode = m;
    acc = 0;
    last = performance.now();
    renderOverlays();
    renderHud();
    if (m === 'running') board.focus({ preventScroll: true });
    else if (m === 'paused' && !kit.modal.current()) $('btn-resume').focus({ preventScroll: true });
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const live = inProgress();
    const rate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { won: stats.won, played: stats.played }) : t('summary.none'),
      stats: stats.played ? [{ value: rate + '%', label: t('stats.rate') }, { value: fmt(stats.longest), label: t('stats.rally') }] : [],
      resume: live
        ? { title: t('app.name'), detail: t('summary.resume', { you: game.score[0], cpu: game.score[1], level: t('level.' + game.level) }), pct: Math.max(game.score[0], game.score[1]) / E.WIN_POINTS }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng trận ---------------- */
  function freshGame() {
    game = E.newGame({ level: settingLevel(), seed: (Math.random() * 4294967296) >>> 0 });
    prev = game;
    counted = false;
    resultOpen = false;
    resetFx();
    kit.store.remove(keys.save);
    kit.sdk.start(game.level);
  }
  function newMatch() {
    freshGame();
    kit.sfx('start');
    setMode('running');
    writeSummary();
  }

  /** Màn chờ: trận lưu dở thì chơi tiếp, không thì trận mới. */
  function start() {
    if (mode !== 'idle' || kit.modal.current()) return;
    if (game && !E.isOver(game) && !counted) {
      kit.sfx('start');
      setMode('running');
    } else newMatch();
  }
  function pause() {
    if (mode !== 'running') return;
    held.clear();
    setMode('paused');
    persist();
  }
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    setMode('running');
  }

  function finish(winner) {
    if (counted) return;
    counted = true;
    const won = winner === 0;
    const lv = stats.levels[game.level];
    stats.played++;
    lv.played++;
    if (won) {
      stats.won++;
      lv.won++;
      stats.streak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else stats.streak = 0;
    stats.longest = Math.max(stats.longest, game.longest);
    saveStats();
    persist();
    kit.sdk.end({ mode: game.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    setMode('over');
    $('result-title').textContent = t(won ? 'result.win' : 'result.lose');
    $('result-you').textContent = game.score[0];
    $('result-cpu').textContent = game.score[1];
    $('result-text').textContent = t('result.text', { level: t('level.' + game.level), n: game.longest });
    $('result-streak').hidden = !won || stats.streak < 2;
    $('result-streak').textContent = t('result.streak', { n: stats.streak });
    setTimeout(() => {
      if (mode !== 'over') return;
      resultOpen = true;
      kit.modal.open('modal-result');
    }, 700);
  }

  /** Trận mới: trận đã giao bóng mà chưa xong thì hỏi trước (bỏ trận tính là thua). */
  function requestNew() {
    if (inProgress()) {
      pause();
      kit.modal.open('modal-confirm');
    } else {
      kit.modal.closeAll();
      newMatch();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress()) {
      counted = true;
      const lv = stats.levels[game.level];
      stats.played++;
      lv.played++;
      stats.streak = 0;
      stats.longest = Math.max(stats.longest, game.longest);
      saveStats();
      kit.sdk.end({ mode: game.level, won: false, assisted: false });
    }
    newMatch();
  }

  /** Đổi mức: trận chưa giao quả nào thì chia lại với mức mới (báo lại start), đã giao thì áp dụng từ trận sau. */
  function onSetting(key) {
    if (key === 'theme') {
      readColors();
      return;
    }
    if (key !== 'level') return;
    if (inProgress()) kit.toast(t('toast.next'));
    else if (game && !E.isOver(game) && !game.served && mode !== 'idle') freshGame();
    renderHud();
    renderOverlays();
  }

  /* ---------------- Sự kiện của engine → âm thanh, hiệu ứng ---------------- */
  function handleEvents(s) {
    s.events.forEach((ev) => {
      if (ev.type === 'hit') {
        const fast = (ev.speed - E.SERVE_SPEED) / (E.MAX_SPEED - E.SERVE_SPEED);
        kit.sfx('tap', { pitch: (ev.who === 0 ? 1 : 0.8) + fast * 0.5 });
        fx.flash[ev.who] = 1;
        fx.shake = Math.max(fx.shake, 1.5 + 3 * fast);
        const p = P(ev.x, E.CONTACT[ev.who]);
        sparks(p.x, p.y, 6 + Math.round(6 * fast), ev.who === 0 ? colors.you : colors.ball);
        if (ev.who === 0) buzz(12);
      } else if (ev.type === 'wall') {
        kit.sfx('tick');
        const p = P(s.ball.x, s.ball.y);
        sparks(p.x, p.y, 3, colors.line);
      } else if (ev.type === 'count') {
        if (mode === 'running') kit.sfx('tick', { pitch: 0.7 });
      } else if (ev.type === 'serve') {
        kit.sfx('pop');
      } else if (ev.type === 'point') {
        lastScorer = ev.who;
        kit.sfx(ev.who === 0 ? 'coin' : 'drop');
        fx.shake = Math.max(fx.shake, ev.who === 0 ? 4 : 7);
        if (ev.who === 1) buzz(40);
        $('live').textContent = t('live.score', { you: ev.score[0], cpu: ev.score[1] });
        renderHud();
        persist();
      } else if (ev.type === 'over') {
        finish(ev.winner);
      }
    });
    if (s.events.some((e) => e.type === 'count' && e.n === 3)) renderHud(); // đổi người giao
  }

  /* ---------------- Vòng lặp ---------------- */
  function input() {
    const dir = (held.has('pos') ? 1 : 0) - (held.has('neg') ? 1 : 0);
    if (dir) return { target: null, dir };
    return { target: pointerTarget, dir: 0 };
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // tab vừa quay lại / máy khựng: không bù cả quãng dài
    if (mode === 'running') {
      if (kit.modal.current()) pause();
      else {
        acc += dt;
        while (acc >= E.DT && mode === 'running') {
          prev = game;
          game = E.step(game, input());
          acc -= E.DT;
          handleEvents(game);
        }
      }
    }
    // Đóng hộp thoại khi đang tạm dừng: đưa focus về nút Chơi tiếp (Space không bấm nhầm nút trên thanh trên)
    const modalOpen = !!kit.modal.current();
    if (modalWasOpen && !modalOpen && mode === 'paused') $('btn-resume').focus({ preventScroll: true });
    else if (modalWasOpen && !modalOpen && mode === 'idle') $('btn-start').focus({ preventScroll: true });
    modalWasOpen = modalOpen;
    if (mode === 'over' && resultOpen && !modalOpen) {
      resultOpen = false;
      setMode('idle');
    }
    updateFx(dt);
    draw(mode === 'running' ? acc / E.DT : 1);
  }

  /* ---------------- Điều khiển ---------------- */
  function onPointer(e) {
    if (mode !== 'running' || (e.target.closest && e.target.closest('.overlay'))) return;
    pointerTarget = lateralAt(e.clientX, e.clientY);
    held.clear();
  }
  board.addEventListener('pointermove', onPointer);
  board.addEventListener('pointerdown', (e) => {
    onPointer(e);
    if (mode === 'running' && e.pointerType !== 'mouse') {
      try {
        board.setPointerCapture(e.pointerId);
      } catch (err) { /* bỏ qua */ }
    }
  });

  const DIRS = { arrowleft: 'neg', arrowup: 'neg', a: 'neg', w: 'neg', arrowright: 'pos', arrowdown: 'pos', d: 'pos', s: 'pos' };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    // Nút vừa bị ẩn (đóng hộp thoại) vẫn có thể giữ focus: không tính là đang đứng trên nút
    const btn = e.target && e.target.closest && e.target.closest('button, input, select, a');
    const onButton = btn && btn.offsetParent !== null ? btn : null;
    if (DIRS[k] && !(onButton && onButton.closest('.segmented'))) {
      if (mode !== 'running') return;
      held.add(DIRS[k]);
      pointerTarget = null;
    } else if (k === ' ' || k === 'enter') {
      if (onButton) return; // để trình duyệt bấm nút đang focus
      if (mode === 'idle') start();
      else if (mode === 'paused') resume();
      else return;
    } else if (k === 'p' || k === 'escape') {
      if (mode === 'running') pause();
      else if (mode === 'paused') resume();
      else return;
    } else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    const d = DIRS[e.key.toLowerCase()];
    if (d) held.delete(d);
  });
  window.addEventListener('blur', () => held.clear());

  $('btn-start').addEventListener('click', start);
  $('btn-start-new').addEventListener('click', requestNew);
  $('overlay-start').addEventListener('click', (e) => {
    if (!e.target.closest('button, .segmented')) start();
  });
  $('overlay-pause').addEventListener('click', (e) => {
    if (!e.target.closest('.overlay-card')) resume();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNew);
  $('btn-pause').addEventListener('click', () => (mode === 'paused' ? resume() : pause()));
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    resultOpen = false;
    kit.modal.close('modal-result');
    newMatch();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmt(stats.played);
    $('stats-rate').textContent = stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–';
    $('stats-rally').textContent = fmt(stats.longest);
    $('stats-streak').textContent = fmt(stats.bestStreak);
    $('stats-levels').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td></tr>';
    }).join('');
  });

  kit.onLeave(() => {
    pause();
    persist();
  });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);
  if (window.ResizeObserver) new ResizeObserver(() => { layout(); draw(1); }).observe(board);
  window.addEventListener('resize', () => { layout(); draw(1); });

  /* ---------------- Khởi động: mở lại trận dở nếu có ---------------- */
  readColors();
  layout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.served && !E.isOver(restored)) {
    game = E.resume(restored); // quả đang đánh dở được giao lại
    prev = game;
    kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
  } else {
    kit.store.remove(keys.save);
  }
  setMode('idle');
  writeSummary();
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
  // Fonts tải xong thì vẽ lại chữ trên canvas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw(1));
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
