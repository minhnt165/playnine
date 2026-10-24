/* =====================================================================
 * Mê Cung - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi mê cung là một ván; mode = cỡ ('easy' | 'medium' | 'hard') hoặc 'daily' (mê cung chung theo ngày), metric time_low
 *   - Vẽ bằng canvas: tường gom thành đoạn dài, vết đi, ô đã qua, gợi ý (nét đứt), người chơi trượt mượt giữa các ô.
 *     Màn hình ngang thì vẽ chuyển vị (đổi hàng / cột) cho ô to hơn; phím và vuốt đổi hướng theo.
 *   - Điều khiển: phím mũi tên / WASD đi một ô, giữ phím thì trượt tới ngã rẽ tiếp theo (tắt "trượt" thì đi tới tường);
 *     vuốt = trượt; kéo chấm tròn dọc hành lang; chạm ô cùng hàng / cột thông thẳng để đi tới đó
 *   - Đồng hồ chạy từ lúc mê cung hiện ra, dừng khi mở hộp thoại / ẩn tab (mê cung bị làm mờ lúc dừng), lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - mê cung mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ ván (ván mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const SIZE_MODES = ['easy', 'medium', 'hard'];
  const kit = PNKit.init({ gameId: 'mecung', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: 'easy', slide: true }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const HOLD_MS = 170; // giữ phím lâu hơn ngần này thì bắt đầu trượt
  const STEP_MS = 55; // mỗi ô khi đang trượt bằng phím giữ
  const HINT_MS = 4000; // gợi ý hiện trong ngần này rồi mờ dần
  const FX_MS = 1100; // hiệu ứng vòng sóng ở lối ra khi thắng

  /* ---------------- Thống kê ---------------- */

  // { played, won, best: { easy, medium, hard, daily } (ms, chỉ ván không gợi ý), daily: { 'YYYY-MM-DD': ms } }
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
    const s = { played: num(raw.played), won: num(raw.won), best: {}, daily: {} };
    E.MODES.forEach((m) => {
      const v = raw.best && raw.best[m];
      s.best[m] = typeof v === 'number' && v > 0 ? v : null;
    });
    if (raw.daily && typeof raw.daily === 'object') {
      Object.keys(raw.daily).forEach((k) => { if (E.isDate(k) && typeof raw.daily[k] === 'number') s.daily[k] = raw.daily[k]; });
    }
    return s;
  })();

  function saveStats() {
    // Chỉ giữ 400 ngày gần nhất của đề hằng ngày
    const days = Object.keys(stats.daily).sort();
    days.slice(0, Math.max(0, days.length - 400)).forEach((k) => { delete stats.daily[k]; });
    kit.store.write(keys.stats, stats);
  }

  /* ---------------- Ngày (đề hằng ngày theo giờ địa phương) ---------------- */

  const pad2 = (n) => String(n).padStart(2, '0');
  const dateKeyOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const todayKey = () => dateKeyOf(new Date());
  const dailyTime = (k) => (typeof stats.daily[k] === 'number' ? stats.daily[k] : null);
  /** Số ngày liên tiếp đã thoát mê cung hằng ngày (tính tới hôm nay, hoặc hôm qua nếu hôm nay chưa chơi). */
  function dailyStreak() {
    const d = new Date();
    if (dailyTime(dateKeyOf(d)) === null) d.setDate(d.getDate() - 1);
    let n = 0;
    while (dailyTime(dateKeyOf(d)) !== null) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------------- Trạng thái ---------------- */

  let game = null;
  let pending = null; // việc chờ xác nhận bỏ ván: { kind: 'new' } | { kind: 'mode', mode }
  let winTimer = 0;
  let hintCells = []; // đoạn gợi ý còn lại (chưa đi tới)
  let hintFrom = -1; // ô bắt đầu nét gợi ý
  let hintUntil = 0;
  let fx = null; // hiệu ứng thắng { t0 }

  const won = () => !!game && E.isWon(game);
  /** Ván đang dở: đã đi ít nhất một nước và chưa tới lối ra (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isWon(game);
  const slideOn = () => kit.settings.get().slide !== false;
  const sizeText = (m) => E.SIZES[m].w + '×' + E.SIZES[m].h;
  const modeLabel = (m) => (m === 'daily' ? t('mode.daily') : t('mode.label', { name: t('mode.' + m), size: sizeText(m) }));
  const lastSize = () => (SIZE_MODES.indexOf(kit.settings.get().size) >= 0 ? kit.settings.get().size : 'easy');

  /** Đồng hồ trên HUD: m:ss */
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + pad2(s % 60);
  }
  /** Thời gian kỷ lục: m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    return Math.floor(ds / 600) + ':' + pad2(Math.floor((ds % 600) / 10)) + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }

  /* ---------------- Bố cục canvas ---------------- */

  const stage = $('stage');
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  // tr = vẽ chuyển vị (cột mê cung thành hàng màn hình); cell, pad tính theo px CSS
  const view = { tr: false, cell: 20, pad: 6, cssW: 0, cssH: 0, dpr: 1 };
  let wallPath = null; // Path2D tường theo đơn vị ô, dựng lại khi đổi mê cung
  let wallFor = null;
  const colors = {};

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['floor', 'wall', 'trail', 'seen', 'start', 'goal', 'flag', 'player', 'ring', 'hint'].forEach((k) => {
      colors[k] = cs.getPropertyValue('--mz-' + k).trim() || '#888';
    });
  }

  /** Chọn hướng vẽ cho ô to nhất (chuyển vị khi to hơn rõ rệt), đặt cỡ canvas theo khung. */
  function layout() {
    if (!game) return;
    const r = stage.getBoundingClientRect();
    const W = Math.max(80, r.width);
    const H = Math.max(80, r.height);
    const fit = (cols, rows) => Math.max(4, Math.floor(Math.min(W / (cols + 0.7), H / (rows + 0.7)) * 4) / 4);
    const a = fit(game.w, game.h);
    const b = fit(game.h, game.w);
    view.tr = b > a * 1.12;
    view.cell = view.tr ? b : a;
    view.pad = Math.max(4, Math.round(view.cell * 0.32));
    const cols = view.tr ? game.h : game.w;
    const rows = view.tr ? game.w : game.h;
    view.cssW = Math.round(cols * view.cell + 2 * view.pad);
    view.cssH = Math.round(rows * view.cell + 2 * view.pad);
    view.dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = view.cssW + 'px';
    canvas.style.height = view.cssH + 'px';
    canvas.width = Math.round(view.cssW * view.dpr);
    canvas.height = Math.round(view.cssH * view.dpr);
    canvas.dataset.orient = view.tr ? 'transposed' : 'normal';
    draw();
  }

  /** Tường gom thành đoạn dài (theo đơn vị ô), chừa lối vào ở cạnh trên và lối ra ở cạnh dưới. */
  function buildWalls() {
    const m = game.maze;
    const w = m.w;
    const h = m.h;
    const p = new Path2D();
    // Đường ngang y = 0..h: có tường phía trên ô (x, y)
    for (let y = 0; y <= h; y++) {
      let run = -1;
      for (let x = 0; x <= w; x++) {
        let wall = false;
        if (x < w) {
          if (y === 0) wall = x !== m.start % w;
          else if (y === h) wall = x !== m.goal % w;
          else wall = !E.isOpen(m, y * w + x, E.N);
        }
        if (wall && run < 0) run = x;
        if (!wall && run >= 0) {
          p.moveTo(run, y);
          p.lineTo(x, y);
          run = -1;
        }
      }
    }
    // Đường dọc x = 0..w: có tường bên trái ô (x, y)
    for (let x = 0; x <= w; x++) {
      let run = -1;
      for (let y = 0; y <= h; y++) {
        let wall = false;
        if (y < h) wall = x === 0 || x === w || !E.isOpen(m, y * w + x, E.W);
        if (wall && run < 0) run = y;
        if (!wall && run >= 0) {
          p.moveTo(x, run);
          p.lineTo(x, y);
          run = -1;
        }
      }
    }
    wallPath = p;
    wallFor = m;
  }

  /** Tâm ô theo tọa độ mê cung (đơn vị ô, số thực) → px CSS trên canvas. */
  function toScreen(mx, my) {
    const sx = view.tr ? my : mx;
    const sy = view.tr ? mx : my;
    return { x: view.pad + (sx + 0.5) * view.cell, y: view.pad + (sy + 0.5) * view.cell };
  }

  /** Điểm trên màn hình (clientX/Y) → tọa độ mê cung (đơn vị ô, số thực). */
  function toMaze(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const k = r.width > 0 ? view.cssW / r.width : 1;
    const sx = ((clientX - r.left) * k - view.pad) / view.cell;
    const sy = ((clientY - r.top) * k - view.pad) / view.cell;
    return view.tr ? { x: sy, y: sx } : { x: sx, y: sy };
  }

  function cellAt(clientX, clientY) {
    const p = toMaze(clientX, clientY);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    return x < 0 || y < 0 || x >= game.w || y >= game.h ? -1 : y * game.w + x;
  }

  /** Hướng màn hình (sx, sy ∈ -1..1) → hướng trong mê cung, theo cách vẽ hiện tại. */
  function mazeDir(sx, sy) {
    const mx = view.tr ? sy : sx;
    const my = view.tr ? sx : sy;
    if (mx > 0) return E.E;
    if (mx < 0) return E.W;
    return my > 0 ? E.S : E.N;
  }

  /* ---------------- Vẽ ---------------- */

  // Vị trí hiển thị của người chơi (đơn vị ô) đi dần theo hàng đợi các ô vừa đi qua
  const vis = { x: 0, y: 0, queue: [] };
  function snapVis() {
    vis.queue.length = 0;
    vis.x = game.pos % game.w;
    vis.y = Math.floor(game.pos / game.w);
  }

  let raf = 0;
  let lastT = 0;
  function kick() {
    if (raf) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    let busy = false;
    if (vis.queue.length) {
      // Tốc độ tăng theo số ô còn chờ để không bao giờ tụt lại xa
      let budget = (14 + vis.queue.length * 5) * dt;
      while (budget > 0 && vis.queue.length) {
        const c = vis.queue[0];
        const dx = (c % game.w) - vis.x;
        const dy = Math.floor(c / game.w) - vis.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) {
          vis.x += dx;
          vis.y += dy;
          budget -= d;
          vis.queue.shift();
        } else {
          vis.x += (dx / d) * budget;
          vis.y += (dy / d) * budget;
          budget = 0;
        }
      }
      busy = busy || vis.queue.length > 0;
    }
    if (hintCells.length) {
      if (now > hintUntil) hintCells = [];
      else busy = true;
    }
    if (fx) {
      if (now - fx.t0 > FX_MS) fx = null;
      else busy = true;
    }
    draw(now);
    if (busy) {
      lastT = now;
      raf = requestAnimationFrame(frame);
    }
  }

  function draw(nowArg) {
    if (!game || !view.cssW) return;
    const now = nowArg || performance.now();
    const m = game.maze;
    const w = game.w;
    const c = view.cell;
    if (wallFor !== m) buildWalls();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.cssW, view.cssH);
    // Vẽ theo tọa độ mê cung (px = ô × cell); chuyển vị thì đổi trục x / y
    ctx.translate(view.pad, view.pad);
    if (view.tr) ctx.transform(0, 1, 1, 0, 0, 0);
    const cx = (i) => ((i % w) + 0.5) * c;
    const cy = (i) => (Math.floor(i / w) + 0.5) * c;

    // Ô lối vào / lối ra, ô đã qua
    ctx.fillStyle = colors.start;
    ctx.fillRect((m.start % w) * c, 0, c, c);
    ctx.fillStyle = colors.goal;
    ctx.fillRect((m.goal % w) * c, (game.h - 1) * c, c, c);
    ctx.fillStyle = colors.seen;
    for (let i = 0; i < game.seen.length; i++) {
      if (game.seen[i] && i !== m.start && i !== m.goal) ctx.fillRect((i % w) * c, Math.floor(i / w) * c, c, c);
    }

    // Vết đi: từ mép lối vào qua tâm các ô trên vết
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors.trail;
    ctx.lineWidth = Math.max(2, c * 0.34);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(cx(m.start), 0);
    game.trail.forEach((i) => ctx.lineTo(cx(i), cy(i)));
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Gợi ý: nét đứt chạy theo đoạn đường đúng tiếp theo, mờ dần lúc sắp hết giờ
    if (hintCells.length && hintFrom >= 0) {
      const left = hintUntil - now;
      ctx.globalAlpha = Math.max(0, Math.min(1, left / 600));
      ctx.strokeStyle = colors.hint;
      ctx.fillStyle = colors.hint;
      ctx.lineWidth = Math.max(2, c * 0.16);
      ctx.setLineDash([c * 0.26, c * 0.22]);
      ctx.lineDashOffset = calm() ? 0 : -now / 45;
      ctx.beginPath();
      ctx.moveTo(cx(hintFrom), cy(hintFrom));
      hintCells.forEach((i) => ctx.lineTo(cx(i), cy(i)));
      ctx.stroke();
      ctx.setLineDash([]);
      const end = hintCells[hintCells.length - 1];
      ctx.beginPath();
      ctx.arc(cx(end), cy(end), Math.max(2.5, c * 0.14), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Tường: một nét cho cả mê cung (đơn vị ô), đầu tròn cho góc gọn
    ctx.save();
    ctx.scale(c, c);
    ctx.strokeStyle = colors.wall;
    ctx.lineWidth = Math.max(1.6, c * 0.13) / c;
    ctx.stroke(wallPath);
    ctx.restore();

    // Phần còn lại vẽ theo px màn hình (cờ luôn dựng đứng dù mê cung chuyển vị)
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const g = toScreen(m.goal % w, game.h - 1);
    drawFlag(g.x, g.y, c);

    if (fx) {
      const el = now - fx.t0;
      ctx.strokeStyle = colors.trail;
      for (let k = 0; k < 3; k++) {
        const p = (el - k * 170) / 750;
        if (p <= 0 || p >= 1) continue;
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.lineWidth = Math.max(1.5, c * 0.14 * (1 - p));
        ctx.beginPath();
        ctx.arc(g.x, g.y, c * (0.45 + 2.4 * p), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Người chơi
    const p = toScreen(vis.x, vis.y);
    const r = Math.max(3.5, c * 0.3);
    ctx.fillStyle = colors.player;
    ctx.strokeStyle = colors.ring;
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Cờ ở lối ra: cán + lá cờ tam giác, tâm tại (x, y). */
  function drawFlag(x, y, c) {
    const s = c * 0.62;
    ctx.strokeStyle = colors.flag;
    ctx.fillStyle = colors.flag;
    ctx.lineWidth = Math.max(1.2, c * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y + s * 0.5);
    ctx.lineTo(x - s * 0.3, y - s * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y - s * 0.5);
    ctx.lineTo(x + s * 0.45, y - s * 0.24);
    ctx.lineTo(x - s * 0.3, y + 0.02 * s);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- Giao diện ngoài canvas ---------------- */

  function renderUI() {
    if (!game) return;
    const today = todayKey();
    document.querySelectorAll('#modes button').forEach((b) => {
      const m = b.dataset.mode;
      const on = m === game.mode;
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-label', modeLabel(m));
    });
    const done = dailyTime(today);
    const daily = document.querySelector('#modes [data-mode="daily"]');
    daily.classList.toggle('done', done !== null);
    $('daily-sub').textContent = done !== null ? '✓ ' + fmtClock(done) : sizeText('daily');
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
    $('btn-hint').disabled = won();
    canvas.classList.toggle('solved', won());
    canvas.setAttribute('aria-label', t('board.label', { size: sizeText(game.mode) }));
    updateTime();
  }

  let shown = '';
  function updateTime() {
    const s = fmtClock(game ? clock.elapsed() : 0);
    if (s !== shown) $('time').textContent = shown = s;
  }
  setInterval(updateTime, 250);

  /**
   * Đồng hồ chỉ chạy khi chưa thoát, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ mê cung để không dò đường "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !won();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    if (open) release();
    $('app').classList.toggle('paused', playing && open);
    updateTime();
  }

  /* ---------------- Lưu ---------------- */

  function writeSummary() {
    const m = game ? game.mode : lastSize();
    const sm = SIZE_MODES.indexOf(m) >= 0 ? m : lastSize();
    const best = stats.best[sm];
    const today = todayKey();
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' ' + sizeText(sm) });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { mode: modeLabel(sm), time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? { title: t('app.name') + ' · ' + modeLabel(m), detail: t('summary.resume', { mode: modeLabel(m), time: fmtClock(clock.elapsed()) }), pct: Math.round(E.progress(game) * 1000) / 1000 }
        : null,
      daily: { date: today, done: dailyTime(today) !== null, title: t('summary.dailyTitle'), streak: dailyStreak() },
      now: Date.now(),
    }));
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }
  // Đi liên tục thì gom lại, lưu sau 400 ms (rời trang vẫn lưu ngay qua kit.onLeave)
  let persistTimer = 0;
  function persistSoon() {
    if (!persistTimer) persistTimer = setTimeout(persist, 400);
  }

  /* ---------------- Luồng ván ---------------- */

  const randomSeed = () => Math.floor(Math.random() * 4294967296);

  function newMaze(m) {
    clearTimeout(winTimer);
    release();
    const mode = E.MODES.indexOf(m) >= 0 ? m : 'easy';
    game = E.newGame({ mode, seed: randomSeed(), date: mode === 'daily' ? todayKey() : null });
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    hintCells = [];
    fx = null;
    snapVis();
    $('sr-status').textContent = '';
    if (mode !== 'daily' && kit.settings.get().size !== mode) kit.settings.set({ size: mode });
    layout();
    renderUI();
    syncClock();
    writeSummary();
  }

  /** Bỏ hiển thị gợi ý phần đã đi tới. */
  function trimHint() {
    if (!hintCells.length) return;
    const k = hintCells.indexOf(game.pos);
    if (k < 0) return;
    hintFrom = game.pos;
    hintCells = hintCells.slice(k + 1);
  }

  /** Áp một nước đã đi (cells = các ô vừa đi qua theo thứ tự). */
  function apply(next, cells, sound) {
    if (!game || next === game || !cells.length) return false;
    game = next;
    if (calm()) snapVis();
    else cells.forEach((c) => vis.queue.push(c));
    trimHint();
    if (sound) kit.sfx(sound);
    if (E.isWon(game)) finish();
    else persistSoon();
    kick();
    return true;
  }

  const canAct = () => !!game && !won() && !kit.modal.current();

  /** Đi một ô theo hướng mê cung d. */
  function walk(d, sound) {
    const next = E.step(game, d);
    return apply(next, next === game ? [] : [next.pos], sound);
  }

  /** Trượt theo hướng mê cung d tới ngã rẽ tiếp theo. */
  function slideDir(d, sound) {
    const r = E.slide(game, d);
    return apply(r.game, r.cells, sound);
  }

  /** Chạm một ô: kề (hoặc cách một ô) thì đi tới; cùng hàng / cột và thông thẳng thì đi thẳng tới đó. */
  function walkTo(target) {
    if (target < 0 || target === game.pos) return false;
    const r = E.moveToward(game, target);
    if (r.cells.length) return apply(r.game, r.cells, 'move');
    const x0 = game.pos % game.w;
    const y0 = Math.floor(game.pos / game.w);
    const x1 = target % game.w;
    const y1 = Math.floor(target / game.w);
    if (x0 !== x1 && y0 !== y1) return false;
    const d = x1 > x0 ? E.E : x1 < x0 ? E.W : y1 > y0 ? E.S : E.N;
    let g = game;
    const cells = [];
    while (g.pos !== target && E.isOpen(g.maze, g.pos, d) && !E.isWon(g)) {
      g = E.step(g, d);
      cells.push(g.pos);
    }
    if (g.pos !== target) return false;
    return apply(g, cells, 'move');
  }

  function hint() {
    if (!canAct()) return;
    const h = E.hint(game);
    if (!h) return;
    const first = game.hints === 0;
    game = h.game;
    hintFrom = game.pos;
    hintCells = h.cells;
    hintUntil = performance.now() + HINT_MS;
    kit.sfx('pop');
    persist();
    kick();
    kit.toast(first ? t('toast.hintFirst') : t('toast.hint', { n: game.hints }), first ? 2600 : 1400);
  }

  function finish() {
    release();
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const assisted = game.hints > 0;
    const isBest = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    if (isBest) stats.best[m] = ms;
    if (m === 'daily' && game.date) {
      const prev = dailyTime(game.date);
      stats.daily[game.date] = prev === null ? ms : Math.min(prev, ms);
    }
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    fx = calm() ? null : { t0: performance.now() };
    hintCells = [];
    $('sr-status').textContent = t('sr.won', { time: fmt(ms) });
    renderUI();
    kick();

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest;
    badge.textContent = t('win.best', { mode: modeLabel(m) });
    const notes = [];
    if (assisted) notes.push(t('win.assisted', { n: game.hints }));
    else if (!isBest && stats.best[m] != null) notes.push(t('win.noteBest', { mode: modeLabel(m), time: fmt(stats.best[m]) }));
    if (m === 'daily') notes.push(t('win.daily', { n: dailyStreak() }));
    $('win-note').textContent = notes.join(' ');
    $('win-note').hidden = !notes.length;
    // Cho người chơi kịp thấy mình tới lối ra rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 250 : 1000);
  }

  /** Bỏ ván đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    saveStats();
    kit.sdk.end({ mode: game.mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'mode' ? t('confirm.mode', { mode: modeLabel(p.mode) }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    newMaze(p.kind === 'mode' ? p.mode : nextModeForNew());
  }

  /** Ván mới: cùng cỡ; đang chơi đề hằng ngày thì về cỡ đã chọn gần nhất. */
  const nextModeForNew = () => (game && game.mode !== 'daily' ? game.mode : lastSize());

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newMaze(nextModeForNew());
    }
  }

  /** Chọn cỡ / đề hằng ngày. Đang đi dở thì hỏi trước; đề hôm nay đã xong thì chỉ báo thời gian. */
  function requestMode(m) {
    if (!game || E.MODES.indexOf(m) < 0) return;
    const today = todayKey();
    const onIt = game.mode === m && (m !== 'daily' || game.date === today) && !won();
    if (onIt) return;
    if (m === 'daily' && dailyTime(today) !== null) {
      kit.toast(t('toast.dailyDone', { time: fmt(dailyTime(today)) }), 2800);
      return;
    }
    if (inPlay()) askConfirm({ kind: 'mode', mode: m });
    else newMaze(m);
  }

  function onSetting(key) {
    if (key === 'slide') release();
  }

  /* ---------------- Bàn phím: đi một ô, giữ để trượt ---------------- */

  const KEYS = {
    arrowup: [0, -1], w: [0, -1],
    arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0],
    arrowright: [1, 0], d: [1, 0],
  };
  let held = null; // { key, sx, sy, timer }

  function release() {
    if (held) clearTimeout(held.timer);
    held = null;
  }

  /** Giữ phím: bật trượt thì đi tiếp tới ngã rẽ / khúc quanh rồi dừng; tắt trượt thì đi tới khi gặp tường. */
  function holdTick() {
    if (!held || !canAct()) return release();
    const d = mazeDir(held.sx, held.sy);
    if (!E.isOpen(game.maze, game.pos, d) || (slideOn() && E.isStop(game.maze, game.pos, d))) return;
    walk(d, null);
    if (held && !won()) held.timer = setTimeout(holdTick, STEP_MS);
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    const v = KEYS[k];
    if (v) {
      e.preventDefault();
      if (e.repeat) return; // tự lặp của hệ điều hành bỏ qua: tự đếm giờ giữ phím
      if (!canAct()) return;
      release();
      const d = mazeDir(v[0], v[1]);
      if (!walk(d, 'move')) {
        kit.sfx('error');
        return;
      }
      if (won()) return;
      held = { key: k, sx: v[0], sy: v[1], timer: setTimeout(holdTick, HOLD_MS) };
      return;
    }
    if (k === 'h') hint();
    else if (k === 'n') requestNew();
    else if (k >= '1' && k <= '4') requestMode(E.MODES[Number(k) - 1]);
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (held && e.key.toLowerCase() === held.key) release();
  });
  window.addEventListener('blur', release);

  /* ---------------- Cảm ứng / chuột: vuốt, kéo theo ngón tay, chạm ---------------- */

  let ptr = null; // { id, mode: 'trace' | 'swipe', ox, oy, lx, ly, lastDir, acted, sx0, sy0, t }
  let lastTraceSound = 0;

  stage.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !canAct()) return;
    release();
    const p = toMaze(e.clientX, e.clientY);
    // Chạm gần chấm tròn: kéo theo ngón tay; chỗ khác: vuốt
    const near = Math.hypot(p.x - (vis.x + 0.5), p.y - (vis.y + 0.5)) <= 0.95;
    ptr = { id: e.pointerId, mode: near ? 'trace' : 'swipe', ox: e.clientX, oy: e.clientY, lx: e.clientX, ly: e.clientY, sx0: e.clientX, sy0: e.clientY, lastDir: 0, acted: false };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    e.preventDefault();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id || !canAct()) return;
    if (ptr.mode === 'trace') trace(e.clientX, e.clientY);
    else swipe(e.clientX, e.clientY);
  });

  /** Kéo: lấy mẫu dọc đoạn ngón tay vừa đi (mỗi 1/3 ô) để không bỏ sót ô khi lướt nhanh. */
  function trace(x, y) {
    const len = Math.hypot(x - ptr.lx, y - ptr.ly);
    const n = Math.max(1, Math.ceil(len / (view.cell / 3)));
    for (let k = 1; k <= n && !won(); k++) {
      const cell = cellAt(ptr.lx + ((x - ptr.lx) * k) / n, ptr.ly + ((y - ptr.ly) * k) / n);
      if (cell < 0 || cell === game.pos) continue;
      const r = E.moveToward(game, cell);
      if (!r.cells.length) continue;
      const now = performance.now();
      const loud = now - lastTraceSound > 140;
      if (loud) lastTraceSound = now;
      apply(r.game, r.cells, loud ? 'move' : null);
      ptr.acted = true;
    }
    ptr.lx = x;
    ptr.ly = y;
  }

  /** Vuốt: đủ xa theo một hướng thì trượt (hoặc đi một ô nếu tắt trượt); vuốt tiếp hướng khác trong cùng lần chạm được. */
  function swipe(x, y) {
    const dx = x - ptr.ox;
    const dy = y - ptr.oy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const sx = ax >= ay ? Math.sign(dx) : 0;
    const sy = ax >= ay ? 0 : Math.sign(dy);
    if (!sx && !sy) return;
    const d = mazeDir(sx, sy);
    const th = Math.max(18, Math.min(40, view.cell * 0.9));
    // Cùng hướng với lần vừa trượt thì phải vuốt xa hơn hẳn (một lần vuốt dài không trượt qua nhiều ngã rẽ)
    const need = d === ptr.lastDir ? (slideOn() ? th * 3 : Math.max(14, view.cell * 0.8)) : th;
    if (Math.max(ax, ay) < need) return;
    const moved = slideOn() ? slideDir(d, 'move') : walk(d, 'move');
    if (!moved && !ptr.acted) kit.sfx('error');
    ptr.acted = true;
    ptr.lastDir = d;
    ptr.ox = x;
    ptr.oy = y;
  }

  function endPointer(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    // Chạm (không kéo / vuốt): đi tới ô được chạm nếu đi thẳng được
    if (e.type === 'pointerup' && !p.acted && Math.hypot(e.clientX - p.sx0, e.clientY - p.sy0) < 12 && canAct()) {
      walkTo(cellAt(e.clientX, e.clientY));
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  /* ---------------- Nút ---------------- */

  // Mũi tên luôn dành cho mê cung (kể cả khi focus đang ở nút chọn cỡ); chọn cỡ bằng chạm / Tab + Enter / phím 1–4
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => requestMode(b.dataset.mode)));
  $('btn-hint').addEventListener('click', hint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newMaze(nextModeForNew());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(dailyStreak());
    SIZE_MODES.forEach((m) => { $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
  });

  /* ---------------- Đồng hồ theo hộp thoại / tab, theme, cỡ khung ---------------- */

  const observer = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release();
    else syncClock();
  });
  kit.onLeave(persist);

  function retheme() {
    // Đợi CSS áp token mới rồi mới đọc màu
    requestAnimationFrame(() => {
      readColors();
      draw();
    });
  }
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(stage);
  else window.addEventListener('resize', layout);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */

  readColors();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    snapVis();
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(game.mode, true);
    layout();
    renderUI();
    syncClock();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    newMaze(lastSize());
  }

  // Lần đầu mở game: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
