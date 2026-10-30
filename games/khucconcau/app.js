/* =====================================================================
 * Khúc Côn Cầu - Giao diện + luồng trận (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng canvas, vòng lặp requestAnimationFrame; engine chạy bước cố định 1/120 s (dồn thời gian, giới hạn dt)
 *   - Điều khiển: chày theo chuột / ngón tay (kéo ở bất kỳ đâu trên bàn), hoặc giữ phím mũi tên / WASD
 *   - Màn hình dọc: bạn ở dưới, máy ở trên; màn hình ngang: bạn bên trái, máy bên phải (chỉ xoay hình vẽ)
 *   - Báo trận cho cổng (metric wins, mode = mức máy easy | medium | hard):
 *     - bấm Bắt đầu: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true) ngay khi tải trang
 *     - hết trận: kit.sdk.end({ mode, won, assisted: false })
 *     - bỏ trận sau khi đã thả đĩa lần đầu: won false; chưa thả đĩa thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = ['easy', 'medium', 'hard'];
  const RAIL = 12; // bề dày thành bàn khi vẽ (đơn vị bàn)
  const TOUCH_LIFT = 16; // chạm: chày nằm hơi trên đầu ngón tay (về phía đối thủ) để ngón tay không che chày
  const kit = PNKit.init({
    gameId: 'khucconcau',
    version: '1.0.1',
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
    const st = { played: toInt(raw.played), won: toInt(raw.won), goals: toInt(raw.goals), streak: toInt(raw.streak), bestStreak: toInt(raw.bestStreak), levels: {} };
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
  let lastScorer = 0; // ai vừa ghi bàn (dòng chữ giữa bàn)
  let acc = 0;
  let last = 0;
  const held = new Set(); // phím hướng đang giữ: 'left' | 'right' | 'up' | 'down' (theo màn hình)
  let pointerTarget = null; // điểm trên bàn theo chuột / ngón tay
  const idleState = E.newGame({ level: 'medium', seed: 1 }); // chỉ để vẽ bàn khi chưa có trận
  idleState.puck.y = E.L / 2;

  const settingLevel = () => (LEVELS.indexOf(kit.settings.get().level) >= 0 ? kit.settings.get().level : 'medium');
  const levelOf = () => (game && !E.isOver(game) ? game.level : settingLevel());
  const inProgress = () => !!game && game.released && !E.isOver(game) && !counted;

  /* ---------------- Hiệu ứng (trang trí, tắt khi giảm chuyển động) ---------------- */
  const fx = { shake: 0, flash: [0, 0], trail: [], sparks: [], glow: 0 };
  const calm = () => reduced.matches;
  function resetFx() {
    fx.shake = 0;
    fx.flash = [0, 0];
    fx.trail = [];
    fx.sparks = [];
    fx.glow = 0;
  }
  function sparks(x, y, n, color) {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 180;
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.3, age: 0, color });
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
  let dots = null; // lớp lỗ thổi khí vẽ sẵn
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      r1: v('--rink-1'), r2: v('--rink-2'), rail: v('--rink-rail'), railHi: v('--rink-rail-hi'), line: v('--rink-line'), mid: v('--rink-mid'),
      dot: v('--rink-dot'), goal: v('--goal'), you: v('--mallet-you'), youRim: v('--mallet-you-rim'), cpu: v('--mallet-cpu'), cpuRim: v('--mallet-cpu-rim'),
      puck: v('--puck'), puckRim: v('--puck-rim'), ink: v('--score-ink'), banner: v('--banner-ink'), font: v('--font') || 'system-ui, sans-serif',
    };
    dots = null;
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
    const m = 6;
    const tw = (view.land ? E.L : E.W) + 2 * RAIL;
    const th = (view.land ? E.W : E.L) + 2 * RAIL;
    view.scale = Math.max(0.1, Math.min((w - 2 * m) / tw, (h - 2 * m) / th));
    view.ox = (w - (tw - 2 * RAIL) * view.scale) / 2;
    view.oy = (h - (th - 2 * RAIL) * view.scale) / 2;
    dots = null;
  }
  /** Tọa độ bàn (x ngang, y dọc) → điểm trên màn hình. Ngang: bạn (y = L) bên trái. */
  function P(x, y) {
    return view.land
      ? { x: view.ox + (E.L - y) * view.scale, y: view.oy + x * view.scale }
      : { x: view.ox + x * view.scale, y: view.oy + y * view.scale };
  }
  /** Điểm trên màn hình → điểm trên bàn (cho chày theo ngón tay / chuột). */
  function tableAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = (clientX - r.left - view.ox) / view.scale;
    const sy = (clientY - r.top - view.oy) / view.scale;
    return view.land ? { x: sy, y: E.L - sx } : { x: sx, y: sy };
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
  /** Khung chữ nhật trên màn hình của vùng bàn [x0, x1] × [y0, y1]. */
  function rectOf(x0, y0, x1, y1) {
    const a = P(x0, y0);
    const b = P(x1, y1);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  /** Lớp lỗ thổi khí (chấm nhỏ đều) vẽ một lần vào canvas phụ cho nhẹ. */
  function dotLayer(r) {
    if (dots && dots.w === Math.round(r.w) && dots.h === Math.round(r.h)) return dots.c;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w * view.dpr));
    c.height = Math.max(1, Math.round(r.h * view.dpr));
    const g = c.getContext('2d');
    g.scale(view.dpr, view.dpr);
    g.fillStyle = colors.dot;
    const gap = 20 * view.scale;
    const rad = Math.max(0.7, 1.1 * view.scale);
    for (let y = gap / 2; y < r.h; y += gap) for (let x = gap / 2; x < r.w; x += gap) {
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    dots = { w: Math.round(r.w), h: Math.round(r.h), c };
    return c;
  }

  function drawTable(s) {
    const k = view.scale;
    const outer = rectOf(-RAIL, -RAIL, E.W + RAIL, E.L + RAIL);
    const r = rectOf(0, 0, E.W, E.L);
    // Thành bàn + bóng đổ
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(outer.x, outer.y + 5 * k, outer.w, outer.h, 18 * k);
    ctx.fill();
    ctx.fillStyle = colors.rail;
    roundRect(outer.x, outer.y, outer.w, outer.h, 18 * k);
    ctx.fill();
    ctx.strokeStyle = colors.railHi;
    ctx.lineWidth = Math.max(1, 2 * k);
    roundRect(outer.x + 2 * k, outer.y + 2 * k, outer.w - 4 * k, outer.h - 4 * k, 16 * k);
    ctx.stroke();
    // Mặt bàn
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, colors.r1);
    g.addColorStop(1, colors.r2);
    ctx.fillStyle = g;
    roundRect(r.x, r.y, r.w, r.h, 8 * k);
    ctx.fill();
    ctx.save();
    roundRect(r.x, r.y, r.w, r.h, 8 * k);
    ctx.clip();
    ctx.drawImage(dotLayer(r), r.x, r.y, r.w, r.h);
    // Vạch giữa, vòng tròn giữa, vòng cấm trước hai khung
    ctx.lineWidth = Math.max(1.5, 3 * k);
    ctx.strokeStyle = colors.mid;
    const c1 = P(0, E.L / 2);
    const c2 = P(E.W, E.L / 2);
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();
    const c = P(E.W / 2, E.L / 2);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 52 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = Math.max(1.2, 2.2 * k);
    [0, E.L].forEach((y) => {
      const p = P(E.W / 2, y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (E.GOAL_W / 2 + 14) * k, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Điểm số mờ ở mỗi nửa bàn
    const sc = s ? s.score : [0, 0];
    ctx.fillStyle = colors.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(120 * k) + 'px ' + colors.font;
    const py = P(E.W / 2, E.L * 0.75);
    const cy = P(E.W / 2, E.L * 0.25);
    ctx.fillText(String(sc[0]), py.x, py.y);
    ctx.fillText(String(sc[1]), cy.x, cy.y);
    ctx.restore();
    // Khe khung thành trên thành bàn
    [[-RAIL, 0], [E.L, E.L + RAIL]].forEach(([y0, y1], i) => {
      const q = rectOf(E.GOAL_L, y0, E.GOAL_R, y1);
      ctx.fillStyle = colors.goal;
      roundRect(q.x, q.y, q.w, q.h, 4 * k);
      ctx.fill();
      const lit = fx.glow > 0 && lastScorer === i; // khung trên (i = 0) là của máy: sáng khi người chơi ghi bàn
      if (lit && !calm()) {
        ctx.globalAlpha = Math.min(1, fx.glow);
        ctx.fillStyle = i === 0 ? colors.you : colors.cpu;
        roundRect(q.x, q.y, q.w, q.h, 4 * k);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawMallet(i, x, y) {
    const k = view.scale;
    const p = P(x, y);
    const r = E.MR * k;
    const f = fx.flash[i];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(p.x + r * 0.12, p.y + r * 0.22, r, 0, Math.PI * 2);
    ctx.fill();
    if (f > 0 && !calm()) {
      ctx.shadowColor = i === 0 ? colors.you : colors.cpu;
      ctx.shadowBlur = 20 * f;
    }
    ctx.fillStyle = i === 0 ? colors.you : colors.cpu;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.5, 2.5 * k);
    ctx.strokeStyle = i === 0 ? colors.youRim : colors.cpuRim;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    // Núm cầm
    const g = ctx.createRadialGradient(p.x - r * 0.15, p.y - r * 0.15, r * 0.05, p.x, p.y, r * 0.42);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, i === 0 ? colors.you : colors.cpu);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPuck(x, y, showTrail, ring) {
    const k = view.scale;
    const p = P(x, y);
    const r = E.PR * k;
    if (showTrail && !calm()) {
      for (let i = 0; i < fx.trail.length; i++) {
        const q = fx.trail[i];
        const a = (i + 1) / (fx.trail.length + 1);
        ctx.globalAlpha = a * 0.3;
        ctx.fillStyle = colors.puckRim;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * (0.4 + 0.5 * a), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(p.x + r * 0.15, p.y + r * 0.3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.puck;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2.6 * k);
    ctx.strokeStyle = colors.puckRim;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    // Vòng đếm lúc giao đĩa: co dần tới lúc thả
    if (ring > 0) {
      ctx.lineWidth = Math.max(2, 3 * k);
      ctx.strokeStyle = colors.puckRim;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    return p;
  }

  function drawText(text, size, dy, color, alpha) {
    const c = P(E.W / 2, E.L / 2);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = '800 ' + Math.round(size) + 'px ' + colors.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10, 18, 40, 0.6)';
    ctx.strokeText(text, c.x, c.y + dy);
    ctx.fillStyle = color;
    ctx.fillText(text, c.x, c.y + dy);
    ctx.globalAlpha = 1;
  }

  /** Dòng chữ giữa bàn: ai cầm đĩa lúc giao, "Vào!" / "Máy ghi bàn", "Bàn quyết định". */
  function drawBanner(s) {
    const k = view.scale;
    const base = Math.min(view.w, view.h);
    if (s.phase === 'faceoff' && mode !== 'idle') {
      const off = Math.min(46 * k, base * 0.09);
      drawText(t(s.receiver === 0 ? 'canvas.yourPuck' : 'canvas.cpuPuck'), Math.min(26 * k, 24), -off, colors.banner, 0.95);
      const sub = statusLine(s.score);
      if (sub) drawText(sub, Math.min(20 * k, 19), off, colors.puckRim);
    } else if (s.phase === 'goal' || (s.phase === 'over' && mode === 'over')) {
      const who = lastScorer;
      const a = s.phase === 'goal' ? Math.min(1, s.timer / 30) : 1;
      const grow = s.phase === 'goal' && !calm() ? 1 + 0.2 * Math.max(0, (s.timer - (E.GOAL_PAUSE - 24)) / 24) : 1;
      drawText(t(who === 0 ? 'canvas.goalYou' : 'canvas.goalCpu'), Math.min(40 * k, 38) * grow, 0, who === 0 ? colors.puckRim : colors.banner, a);
    }
  }
  /** "Bàn quyết định" khi một bên chỉ còn thiếu 1 bàn. */
  function statusLine(sc) {
    if (sc[0] === E.WIN_GOALS - 1 && sc[1] === E.WIN_GOALS - 1) return t('canvas.decider');
    if (sc[0] === E.WIN_GOALS - 1 || sc[1] === E.WIN_GOALS - 1) return t('canvas.matchPoint');
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
    // Nội suy giữa hai bước mô phỏng cho mượt (bỏ qua khi vừa đổi pha: đĩa nhảy về chỗ giao)
    const smooth = p.phase === s.phase;
    const k = smooth ? alpha : 1;
    drawMallet(1, lerp(p.mallets[1].x, s.mallets[1].x, k), lerp(p.mallets[1].y, s.mallets[1].y, k));
    drawMallet(0, lerp(p.mallets[0].x, s.mallets[0].x, k), lerp(p.mallets[0].y, s.mallets[0].y, k));
    if (s.phase === 'play' || s.phase === 'faceoff') {
      const ring = s.phase === 'faceoff' && mode !== 'idle' ? s.timer / E.FACEOFF : 0;
      const bp = drawPuck(lerp(p.puck.x, s.puck.x, k), lerp(p.puck.y, s.puck.y, k), s.phase === 'play', ring);
      if (mode === 'running' && s.phase === 'play' && Math.hypot(s.puck.vx, s.puck.vy) > 500) {
        fx.trail.push(bp);
        if (fx.trail.length > 8) fx.trail.shift();
      } else if (fx.trail.length) fx.trail.shift();
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
    fx.glow = Math.max(0, fx.glow - dt * 0.8);
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
    $('score-you').textContent = game ? game.score[0] : 0;
    $('score-cpu').textContent = game ? game.score[1] : 0;
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
      stats: stats.played ? [{ value: rate + '%', label: t('stats.rate') }, { value: fmt(stats.goals), label: t('stats.goals') }] : [],
      resume: live
        ? { title: t('app.name'), detail: t('summary.resume', { you: game.score[0], cpu: game.score[1], level: t('level.' + game.level) }), pct: Math.max(game.score[0], game.score[1]) / E.WIN_GOALS }
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

  /** "m:ss" từ số bước mô phỏng. */
  function clock(ticks) {
    const sec = Math.floor(ticks / E.HZ);
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
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
    saveStats();
    persist();
    kit.sdk.end({ mode: game.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    setMode('over');
    $('result-title').textContent = t(won ? 'result.win' : 'result.lose');
    $('result-you').textContent = game.score[0];
    $('result-cpu').textContent = game.score[1];
    $('result-text').textContent = t('result.text', { level: t('level.' + game.level), time: clock(game.tick) });
    $('result-streak').hidden = !won || stats.streak < 2;
    $('result-streak').textContent = t('result.streak', { n: stats.streak });
    setTimeout(() => {
      if (mode !== 'over') return;
      resultOpen = true;
      kit.modal.open('modal-result');
    }, 700);
  }

  /** Trận mới: trận đã thả đĩa mà chưa xong thì hỏi trước (bỏ trận tính là thua). */
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
      saveStats();
      kit.sdk.end({ mode: game.level, won: false, assisted: false });
    }
    newMatch();
  }

  /** Đổi mức: trận chưa thả đĩa thì chia lại với mức mới (báo lại start), đã thả thì áp dụng từ trận sau. */
  function onSetting(key) {
    if (key === 'theme') {
      readColors();
      return;
    }
    if (key !== 'level') return;
    if (inProgress()) kit.toast(t('toast.next'));
    else if (game && !E.isOver(game) && !game.released && mode !== 'idle') freshGame();
    renderHud();
    renderOverlays();
  }

  /* ---------------- Sự kiện của engine → âm thanh, hiệu ứng ---------------- */
  function handleEvents(s) {
    s.events.forEach((ev) => {
      if (ev.type === 'hit') {
        const hard = Math.min(1, ev.speed / E.PUCK_MAX);
        kit.sfx('tap', { pitch: (ev.who === 0 ? 1 : 0.8) + hard * 0.5 });
        fx.flash[ev.who] = 1;
        fx.shake = Math.max(fx.shake, 1 + 3 * hard);
        const p = P(ev.x, ev.y);
        sparks(p.x, p.y, 4 + Math.round(8 * hard), ev.who === 0 ? colors.you : colors.cpu);
        if (ev.who === 0) buzz(10 + Math.round(10 * hard));
      } else if (ev.type === 'wall') {
        kit.sfx('tick', { pitch: 0.8 + Math.min(1, ev.speed / E.PUCK_MAX) * 0.4 });
        const p = P(ev.x, ev.y);
        sparks(p.x, p.y, 3, colors.puckRim);
      } else if (ev.type === 'drop') {
        if (mode === 'running') kit.sfx('pop');
      } else if (ev.type === 'stall') {
        kit.toast(t(ev.who === 0 ? 'toast.stallYou' : 'toast.stallCpu'));
      } else if (ev.type === 'goal') {
        lastScorer = ev.who;
        if (ev.who === 0) {
          stats.goals++; // bàn thắng của người chơi tính vào thống kê ngay khi ghi
          saveStats();
        }
        fx.glow = 1.6;
        kit.sfx(ev.who === 0 ? 'coin' : 'drop');
        fx.shake = Math.max(fx.shake, ev.who === 0 ? 5 : 8);
        buzz(ev.who === 0 ? 30 : 60);
        const p = P(s.puck.x, ev.who === 0 ? 0 : E.L);
        sparks(p.x, p.y, 18, ev.who === 0 ? colors.you : colors.cpu);
        $('live').textContent = t('live.score', { you: ev.score[0], cpu: ev.score[1] });
        renderHud();
        persist();
      } else if (ev.type === 'over') {
        finish(ev.winner);
      }
    });
  }

  /* ---------------- Vòng lặp ---------------- */
  function input() {
    const h = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0); // ngang màn hình
    const v = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0); // dọc màn hình
    if (h || v) return view.land ? { target: null, dx: v, dy: -h } : { target: null, dx: h, dy: v };
    return { target: pointerTarget };
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
    const p = tableAt(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') p.y -= TOUCH_LIFT;
    pointerTarget = p;
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

  const DIRS = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
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
    $('stats-goals').textContent = fmt(stats.goals);
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
  if (restored && restored.released && !E.isOver(restored)) {
    game = E.resume(restored); // đĩa đang trượt dở được giao lại
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
