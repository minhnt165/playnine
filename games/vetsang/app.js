/* =====================================================================
 * Vệt Sáng - Giao diện + luồng trận (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng canvas, vòng lặp requestAnimationFrame; engine chạy bước cố định 1/120 s (dồn thời gian, giới hạn dt)
 *   - Điều khiển: phím mũi tên / WASD (hướng tuyệt đối, có hàng đợi), vuốt trên đấu trường, nút rẽ trái / phải lớn (tùy chọn)
 *   - Đấu trường vuông: màn hình dọc thì nút rẽ nằm dưới, màn hình ngang thì nằm hai bên
 *   - Báo trận cho cổng (metric wins, mode = mức máy easy | medium | hard):
 *     - bấm Bắt đầu: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true) ngay khi tải trang
 *     - hết trận: kit.sdk.end({ mode, won, assisted: false })
 *     - bỏ trận sau khi hiệp đầu đã chạy: won false; còn đang đếm ngược hiệp đầu thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = ['easy', 'medium', 'hard'];
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const kit = PNKit.init({
    gameId: 'vetsang',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', vibrate: true, pad: coarse, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const stage = $('stage');
  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { played: toInt(raw.played), won: toInt(raw.won), rounds: toInt(raw.rounds), streak: toInt(raw.streak), bestStreak: toInt(raw.bestStreak), levels: {} };
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
  let mode = 'idle'; // idle (màn chờ) | running | paused | over (đã xong, chờ đóng bảng kết quả)
  let counted = false; // trận này đã tính thống kê / báo kết thúc
  let resultOpen = false;
  let modalWasOpen = false;
  let acc = 0;
  let last = 0;
  const idleState = E.newGame({ level: 'medium', seed: 1 }); // chỉ để vẽ đấu trường khi chưa có trận

  const settingLevel = () => (LEVELS.indexOf(kit.settings.get().level) >= 0 ? kit.settings.get().level : 'medium');
  const levelOf = () => (game && (inProgress() || mode !== 'idle') ? game.level : settingLevel());
  const inProgress = () => !!game && game.started && !E.isOver(game) && !counted;

  /* ---------------- Hiệu ứng (trang trí, tắt khi giảm chuyển động) ---------------- */
  const fx = { shake: 0, sparks: [], flash: 0 };
  const calm = () => reduced.matches;
  function resetFx() {
    fx.shake = 0;
    fx.sparks = [];
    fx.flash = 0;
  }
  function sparks(x, y, n, color) {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 50 + Math.random() * 190;
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, age: 0, color });
    }
  }
  function buzz(ms) {
    if (!kit.settings.get().vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Bố cục canvas ---------------- */
  const view = { w: 0, h: 0, dpr: 1, cell: 1, size: 1, ox: 0, oy: 0 };
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      bg: v('--arena-bg'), line: v('--arena-line'), major: v('--arena-major'), edge: v('--arena-edge'),
      trail: [v('--you'), v('--cpu')], glow: [v('--you-glow'), v('--cpu-glow')], core: [v('--you-core'), v('--cpu-core')],
      banner: v('--banner-ink'), shadow: v('--banner-shadow'), font: v('--font') || 'system-ui, sans-serif',
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
    const avail = Math.max(40, Math.min(w, h) - 8);
    // Cỡ ô tròn theo điểm ảnh thật để đường lưới sắc nét
    view.cell = Math.max(1, Math.floor((avail * view.dpr) / E.W)) / view.dpr;
    view.size = view.cell * E.W;
    view.ox = Math.round(((w - view.size) / 2) * view.dpr) / view.dpr;
    view.oy = Math.round(((h - view.size) / 2) * view.dpr) / view.dpr;
  }
  const cx = (x) => view.ox + (x + 0.5) * view.cell;
  const cy = (y) => view.oy + (y + 0.5) * view.cell;

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

  function drawArena() {
    const { ox, oy, size, cell } = view;
    ctx.fillStyle = colors.edge;
    roundRect(ox - 4, oy - 4, size + 8, size + 8, 10);
    ctx.fill();
    ctx.fillStyle = colors.bg;
    ctx.fillRect(ox, oy, size, size);
    const px = 1 / view.dpr;
    // Lưới mảnh từng ô, đậm hơn mỗi 10 ô
    ctx.fillStyle = colors.line;
    for (let i = 1; i < E.W; i++) if (i % 10) ctx.fillRect(ox + i * cell, oy, px, size);
    for (let i = 1; i < E.H; i++) if (i % 10) ctx.fillRect(ox, oy + i * cell, size, px);
    ctx.fillStyle = colors.major;
    for (let i = 10; i < E.W; i += 10) ctx.fillRect(ox + i * cell, oy, px, size);
    for (let i = 10; i < E.H; i += 10) ctx.fillRect(ox, oy + i * cell, size, px);
  }

  /** Hướng đi kế tiếp để vẽ trượt mượt giữa hai tick (xe người chơi: lệnh rẽ đầu hàng đợi; máy: hướng hiện tại). */
  function nextDir(s, i) {
    const b = s.bikes[i];
    if (i === 0) for (let k = 0; k < s.queue.length; k++) if (s.queue[k] !== b.dir && s.queue[k] !== (b.dir + 2) % 4) return s.queue[k];
    return b.dir;
  }

  function drawBike(s, i, ext) {
    const b = s.bikes[i];
    const cell = view.cell;
    const p = b.path;
    let hx = cx(b.x);
    let hy = cy(b.y);
    let dir = b.dir;
    if (ext > 0 && b.alive) {
      const d = nextDir(s, i);
      if (E.free(s.grid, b.x + E.DX[d], b.y + E.DY[d])) {
        hx += E.DX[d] * ext * cell;
        hy += E.DY[d] * ext * cell;
        dir = d;
      }
    }
    // Vệt: lớp sáng rộng mờ, thân màu, lõi sáng
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx(p[0]), cy(p[1]));
    for (let k = 2; k < p.length; k += 2) ctx.lineTo(cx(p[k]), cy(p[k + 1]));
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = colors.glow[i];
    ctx.lineWidth = cell * 1.3;
    ctx.stroke();
    ctx.strokeStyle = colors.trail[i];
    ctx.lineWidth = cell * 0.62;
    ctx.stroke();
    ctx.strokeStyle = colors.core[i];
    ctx.lineWidth = Math.max(1, cell * 0.2);
    ctx.stroke();
    // Đầu xe: khối bo tròn + đèn phía trước
    const r = cell * 0.55;
    ctx.fillStyle = colors.trail[i];
    roundRect(hx - r, hy - r, 2 * r, 2 * r, r * 0.45);
    ctx.fill();
    ctx.fillStyle = colors.core[i];
    ctx.beginPath();
    ctx.arc(hx + E.DX[dir] * r * 0.45, hy + E.DY[dir] * r * 0.45, Math.max(1.2, r * 0.38), 0, Math.PI * 2);
    ctx.fill();
    if (!b.alive) {
      // Xe đã đâm: dấu chéo trên đầu xe
      ctx.strokeStyle = colors.banner;
      ctx.lineWidth = Math.max(1.5, cell * 0.22);
      const q = r * 1.25;
      ctx.beginPath();
      ctx.moveTo(hx - q, hy - q);
      ctx.lineTo(hx + q, hy + q);
      ctx.moveTo(hx + q, hy - q);
      ctx.lineTo(hx - q, hy + q);
      ctx.stroke();
    }
    return { x: hx, y: hy };
  }

  function drawText(text, size, y, color, alpha) {
    const x = view.ox + view.size / 2;
    const yy = view.oy + view.size / 2 + y;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = '800 ' + Math.round(size) + 'px ' + colors.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors.shadow;
    ctx.strokeText(text, x, yy);
    ctx.fillStyle = color;
    ctx.fillText(text, x, yy);
    ctx.globalAlpha = 1;
  }

  /** Nhãn "BẠN" phía trên xe người chơi trong lúc đếm ngược (biết mình là xe nào). */
  function drawYouTag(head) {
    const size = Math.max(11, Math.min(16, view.cell * 1.5));
    ctx.font = '800 ' + Math.round(size) + 'px ' + colors.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const y = head.y - view.cell * 1.4;
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.shadow;
    ctx.strokeText(t('canvas.you'), head.x, y);
    ctx.fillStyle = colors.trail[0];
    ctx.fillText(t('canvas.you'), head.x, y);
    ctx.beginPath();
    ctx.moveTo(head.x - size * 0.3, y + 2);
    ctx.lineTo(head.x + size * 0.3, y + 2);
    ctx.lineTo(head.x, y + size * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  /** Dòng chữ giữa đấu trường: đếm ngược + số hiệp, hoặc kết quả hiệp vừa xong. */
  function drawBanner(s, heads) {
    const k = view.size / 400;
    if (s.phase === 'countdown' && mode !== 'idle') {
      const n = E.countdownNumber(s);
      const frac = (s.timer % E.COUNT_STEP) / E.COUNT_STEP;
      const pop = calm() ? 1 : 1 + 0.3 * Math.max(0, frac - 0.6) / 0.4;
      drawText(String(n), 96 * k * pop, 0, colors.banner);
      drawText(t('canvas.round', { n: s.round }), 24 * k, -78 * k, colors.banner);
      if (s.score[0] === E.TARGET - 1 || s.score[1] === E.TARGET - 1) drawText(t('canvas.matchPoint'), 20 * k, 76 * k, colors.trail[1]);
      if (heads) drawYouTag(heads[0]);
    } else if (s.phase === 'crash' || (s.phase === 'over' && mode === 'over')) {
      const key = s.last === 0 ? 'canvas.roundYou' : s.last === 1 ? 'canvas.roundCpu' : 'canvas.draw';
      const color = s.last === 0 ? colors.trail[0] : s.last === 1 ? colors.trail[1] : colors.banner;
      const a = s.phase === 'crash' ? Math.min(1, (E.CRASH_PAUSE - s.timer) / 20) : 1;
      drawText(t(key), 30 * k, 0, color, a);
    }
  }

  function draw() {
    if (!view.w) return;
    const s = game || idleState;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (fx.shake > 0.05 && !calm()) ctx.translate((Math.random() * 2 - 1) * fx.shake, (Math.random() * 2 - 1) * fx.shake);
    drawArena();
    const ext = s.phase === 'play' ? s.move : 0;
    const heads = [drawBike(s, 1, ext), drawBike(s, 0, ext)].reverse();
    if (fx.flash > 0 && !calm()) {
      ctx.globalAlpha = fx.flash * 0.25;
      ctx.fillStyle = colors.banner;
      ctx.fillRect(view.ox, view.oy, view.size, view.size);
      ctx.globalAlpha = 1;
    }
    fx.sparks.forEach((q) => {
      ctx.globalAlpha = Math.max(0, 1 - q.age / q.life);
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(1.5, view.cell * 0.22), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawBanner(s, game ? heads : null);
  }

  function updateFx(dt) {
    fx.shake = fx.shake > 0 ? fx.shake * Math.exp(-dt * 12) : 0;
    fx.flash = Math.max(0, fx.flash - dt * 3);
    fx.sparks = fx.sparks.filter((q) => {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.93;
      q.vy *= 0.93;
      return q.age < q.life;
    });
  }

  /* ---------------- Bảng điểm / lớp phủ ---------------- */
  function renderPips(id, n) {
    $(id).querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < n));
  }
  function renderHud() {
    const sc = game ? game.score : [0, 0];
    renderPips('pips-you', sc[0]);
    renderPips('pips-cpu', sc[1]);
    $('sr-you').textContent = t('hud.rounds', { n: sc[0] });
    $('sr-cpu').textContent = t('hud.rounds', { n: sc[1] });
    $('hud-level').textContent = t('level.' + levelOf());
    $('btn-level').setAttribute('aria-label', t('set.level') + ': ' + t('level.' + levelOf()));
    $('btn-pause').disabled = mode !== 'running' && mode !== 'paused';
  }
  function renderOverlays() {
    $('overlay-start').hidden = mode !== 'idle';
    $('overlay-pause').hidden = mode !== 'paused';
    stage.classList.toggle('idle', mode !== 'running');
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
  function applyPad() {
    stage.classList.toggle('pad-on', !!kit.settings.get().pad);
    layout();
    draw();
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const live = inProgress();
    const rate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { won: stats.won, played: stats.played }) : t('summary.none'),
      stats: stats.played ? [{ value: rate + '%', label: t('stats.rate') }, { value: fmt(stats.bestStreak), label: t('stats.streak') }] : [],
      resume: live
        ? { title: t('app.name'), detail: t('summary.resume', { you: game.score[0], cpu: game.score[1], level: t('level.' + game.level) }), pct: Math.max(game.score[0], game.score[1]) / E.TARGET }
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

  /** Màn chờ: trận lưu dở thì chơi tiếp (đếm ngược lại nếu đang giữa hiệp), không thì trận mới. */
  function start() {
    if (mode !== 'idle' || kit.modal.current()) return;
    if (inProgress()) {
      game = E.resume(game);
      kit.sfx('start');
      setMode('running');
    } else newMatch();
  }
  function pause() {
    if (mode !== 'running') return;
    setMode('paused');
    persist();
  }
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    game = E.resume(game);
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
    saveStats();
    persist();
    kit.sdk.end({ mode: game.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    setMode('over');
    $('result-title').textContent = t(won ? 'result.win' : 'result.lose');
    $('result-you').textContent = game.score[0];
    $('result-cpu').textContent = game.score[1];
    $('result-text').textContent = t('result.text', { level: t('level.' + game.level), rounds: t('result.rounds', { n: game.round }) });
    $('result-streak').hidden = !won || stats.streak < 2;
    $('result-streak').textContent = t('result.streak', { n: stats.streak });
    setTimeout(() => {
      if (mode !== 'over') return;
      resultOpen = true;
      kit.modal.open('modal-result');
    }, 900);
  }

  /** Trận mới: trận đã chạy hiệp đầu mà chưa xong thì hỏi trước (bỏ trận tính là thua). */
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

  /** Đổi mức: trận chưa chạy hiệp đầu thì chia lại với mức mới (báo lại start), đã chạy thì áp dụng từ trận sau. */
  function onSetting(key) {
    if (key === 'theme') {
      readColors();
      draw();
      return;
    }
    if (key === 'pad') {
      applyPad();
      return;
    }
    if (key !== 'level') return;
    if (inProgress()) kit.toast(t('toast.next'));
    else if (game && !E.isOver(game) && !game.started && mode !== 'idle') freshGame();
    renderHud();
    renderOverlays();
  }

  /* ---------------- Sự kiện của engine → âm thanh, hiệu ứng ---------------- */
  function handleEvents(s) {
    const over = s.events.some((e) => e.type === 'over');
    s.events.forEach((ev) => {
      if (ev.type === 'count') {
        kit.sfx('tick', { pitch: ev.n === 1 ? 1.2 : 0.8 });
      } else if (ev.type === 'go') {
        kit.sfx('pop');
      } else if (ev.type === 'turn') {
        kit.sfx('move', { volume: 0.5 });
      } else if (ev.type === 'crash') {
        kit.sfx('capture');
        ev.who.forEach((dead, i) => {
          if (!dead) return;
          const b = s.bikes[i];
          sparks(cx(b.x) + (E.DX[b.dir] * view.cell) / 2, cy(b.y) + (E.DY[b.dir] * view.cell) / 2, 22, colors.trail[i]);
        });
        fx.shake = Math.max(fx.shake, ev.who[0] ? 7 : 4);
        fx.flash = 1;
        if (ev.who[0]) buzz(60);
      } else if (ev.type === 'round') {
        if (ev.winner === 0) {
          stats.rounds++; // hiệp thắng cộng ngay (kể cả khi trận bỏ dở sau đó)
          saveStats();
        }
        if (!over) kit.sfx(ev.winner === 0 ? 'coin' : ev.winner === 1 ? 'drop' : 'draw');
        $('live').textContent = ev.winner < 0 ? t('live.draw') : t('live.round', { you: ev.score[0], cpu: ev.score[1] });
        renderHud();
        persist();
      } else if (ev.type === 'newround') {
        renderHud();
      } else if (ev.type === 'over') {
        finish(ev.winner);
      }
    });
  }

  /* ---------------- Vòng lặp ---------------- */
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
          game = E.step(game);
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
    draw();
  }

  /* ---------------- Điều khiển ---------------- */
  function steer(dir) {
    if (mode === 'running' && game) game = E.turn(game, dir);
  }
  function steerRel(side) {
    if (mode === 'running' && game) game = E.turnRel(game, side);
  }

  // Vuốt: mỗi đoạn vuốt đủ dài theo một trục là một lệnh rẽ (vuốt chữ L liền một hơi = hai lệnh)
  let swipe = null;
  board.addEventListener('pointerdown', (e) => {
    if (mode !== 'running' || (e.target.closest && e.target.closest('.overlay'))) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      board.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
  });
  board.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const th = Math.max(18, Math.min(34, view.cell * 2.5));
    if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  const endSwipe = () => { swipe = null; };
  board.addEventListener('pointerup', endSwipe);
  board.addEventListener('pointercancel', endSwipe);

  // Nút rẽ lớn: rẽ ngay khi chạm xuống (không đợi nhả tay); bấm bằng bàn phím (Enter / Space trên nút) cũng rẽ
  [['btn-left', -1], ['btn-right', 1]].forEach(([id, side]) => {
    const btn = $(id);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      steerRel(side);
      btn.classList.add('down');
    });
    const up = () => btn.classList.remove('down');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) steerRel(side);
    });
  });

  const DIRS = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    // Nút vừa bị ẩn (đóng hộp thoại / lớp phủ) vẫn có thể giữ focus: không tính là đang đứng trên nút
    const btn = e.target && e.target.closest && e.target.closest('button, input, select, a');
    const onButton = btn && btn.offsetParent !== null ? btn : null;
    if (k in DIRS && !(onButton && onButton.closest('.segmented'))) {
      if (mode !== 'running') return;
      steer(DIRS[k]);
    } else if (k === ' ' || k === 'enter') {
      if (onButton) return; // để trình duyệt bấm nút đang focus
      if (mode === 'idle') start();
      else if (mode === 'paused') resume();
      else if (mode !== 'running') return;
      // đang chạy: nuốt phím để trang không cuộn
    } else if (k === 'p' || k === 'escape') {
      if (mode === 'running') pause();
      else if (mode === 'paused') resume();
      else return;
    } else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });

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
    $('stats-rounds').textContent = fmt(stats.rounds);
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
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  if (window.ResizeObserver) new ResizeObserver(() => { layout(); draw(); }).observe(board);
  window.addEventListener('resize', () => { layout(); draw(); });

  /* ---------------- Khởi động: mở lại trận dở nếu có ---------------- */
  readColors();
  stage.classList.toggle('pad-on', !!kit.settings.get().pad);
  layout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.started && !E.isOver(restored)) {
    game = restored;
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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
