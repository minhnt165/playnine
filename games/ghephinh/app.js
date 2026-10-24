/* =====================================================================
 * Ghép Hình - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js, scenes.js nạp trước)
 *   - Mode = cỡ ('easy' 4x4 | 'medium' 6x6 | 'hard' 8x8) hoặc 'daily' (đề chung theo ngày, 6x6), metric time_low
 *   - Hình vẽ một lần vào canvas ẩn (scenes.js), mỗi mảnh là một <canvas> riêng cắt bằng Path2D (clip) + viền nổi.
 *     Mảnh trong khay: co lại cho vừa ô khay; mảnh rời: nằm trên bàn đúng cỡ; mảnh đã khóa: vẽ thẳng vào canvas bàn.
 *   - Điện thoại dọc: bàn vuông ở trên, khay cuộn ngang ở dưới (vuốt ngang = cuộn khay, kéo lên = nhấc mảnh).
 *     Màn hình ngang / máy tính: bàn bên trái, khay cuộn dọc ở cột phải (kéo ngang = nhấc mảnh).
 *   - Điều khiển: kéo thả mảnh (hoặc cả nhóm); chạm chọn mảnh rồi chạm chỗ trên bàn; bàn phím: mũi tên chọn mảnh,
 *     Enter cầm lên, mũi tên chọn ô đích, Enter đặt (chỉ nhận đúng ô), Esc bỏ; giữ V / nút "Xem hình" để xem hình gốc mờ.
 *   - Đồng hồ chạy từ lúc bức hình hiện ra, dừng khi mở hộp thoại / ẩn tab (bàn và khay bị làm mờ lúc dừng), lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - ván mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted: false }) (xem hình gốc là một phần của trò ghép hình, không tính trợ giúp)
 *     - bỏ ván (ván mới / đổi cỡ) khi đã đặt ít nhất một mảnh: won: false; chưa đặt mảnh nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const SC = window.JigsawScenes;
  const SIZE_MODES = ['easy', 'medium', 'hard'];
  const kit = PNKit.init({ gameId: 'ghephinh', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: 'easy', grid: true, edges: false }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const wide = window.matchMedia && matchMedia('(min-aspect-ratio: 5/4)');

  const M = E.MARGIN;
  const DOCK_MIN = 150; // điện thoại dọc: chừa ít nhất ngần này (px) cho thanh công cụ + khay
  const MAX_PX = 1600; // cạnh ảnh gốc tối đa (px thật) để giới hạn bộ nhớ trên máy dpr cao
  const WIN_MS = 1200; // hiệu ứng vệt sáng khi ghép xong

  /* ---------------- Thống kê ---------------- */

  // { played, won, best: { easy, medium, hard, daily } (ms), daily: { 'YYYY-MM-DD': ms } }
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
  /** Số ngày liên tiếp đã ghép xong đề hằng ngày (tính tới hôm nay, hoặc hôm qua nếu hôm nay chưa ghép). */
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
  let sel = -1; // mảnh đang chọn (chạm / bàn phím), -1 = không
  let target = null; // ô đích khi chơi bằng phím { c, r }; null = chưa cầm mảnh
  let lastTarget = { c: 0, r: 0 };
  let peekOn = false;

  const won = () => !!game && E.isWon(game);
  /** Ván đang dở: đã đặt ít nhất một mảnh và chưa ghép xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isWon(game);
  const lastSize = () => (SIZE_MODES.indexOf(kit.settings.get().size) >= 0 ? kit.settings.get().size : 'easy');
  const modeLabel = (m) => (m === 'daily' ? t('mode.daily') : t('mode.label', { name: t('mode.' + m), n: E.pieceCount(m) }));
  const sceneName = () => t('scene.' + SC.KEYS[game.scene]);
  const edgesOnly = () => !!kit.settings.get().edges;
  const doneCount = () => game.done.filter(Boolean).length;

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

  /* ---------------- Phần tử ---------------- */

  const app = $('app');
  const stage = $('stage');
  const table = $('table');
  const boardCv = $('board');
  const boardCtx = boardCv.getContext('2d');
  const peekCv = $('peek');
  const looseEl = $('loose');
  const trayEl = $('tray');
  const dock = $('dock');
  const dragLayer = $('drag');
  const cursor = $('cursor');
  const ghost = $('cursor-ghost');
  const hitCtx = document.createElement('canvas').getContext('2d');

  // portrait = điện thoại dọc (khay dưới); cell, S, bx, by, tw, th, spriteCss, slot: px CSS
  const view = { portrait: true, cell: 0, S: 0, bx: 0, by: 0, tw: 0, th: 0, dpr: 1, spriteCss: 0, slot: 0 };
  let picture = null; // canvas ẩn chứa bức hình gốc (px thật)
  let paths = []; // Path2D của từng mảnh, đơn vị mảnh, gốc = góc trên trái ô lõi
  let els = []; // <canvas> của từng mảnh
  let builtKey = '';
  let lastDrawMs = 0;
  const colors = {};

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['board', 'grid', 'frame'].forEach((k) => {
      colors[k] = cs.getPropertyValue('--jg-' + k).trim() || '#888';
    });
  }

  /* ---------------- Bố cục ---------------- */

  function layout() {
    if (!game) return;
    cancelDrag();
    view.portrait = !(wide && wide.matches);
    if (view.portrait) {
      const sr = stage.getBoundingClientRect();
      const th = Math.max(120, Math.min(sr.width, sr.height - DOCK_MIN));
      table.style.height = Math.floor(th) + 'px';
    } else {
      table.style.height = '';
    }
    const tr = table.getBoundingClientRect();
    view.tw = tr.width;
    view.th = tr.height;
    const n = game.cols;
    const room = view.portrait ? Math.min(tr.width, tr.height) : Math.min(tr.width - 24, tr.height - 8);
    view.cell = Math.max(8, Math.floor(room / n));
    view.S = view.cell * n;
    view.bx = Math.round((tr.width - view.S) / 2);
    view.by = Math.round((tr.height - view.S) / 2);
    view.spriteCss = (1 + 2 * M) * view.cell;
    view.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3, MAX_PX / view.S));
    [boardCv, peekCv].forEach((c) => {
      c.style.left = view.bx + 'px';
      c.style.top = view.by + 'px';
      c.style.width = view.S + 'px';
      c.style.height = view.S + 'px';
    });
    const px = Math.round(view.S * view.dpr);
    if (boardCv.width !== px) {
      boardCv.width = px;
      boardCv.height = px;
    }
    // Ô khay: dọc thì 1–2 hàng cuộn ngang, ngang thì 2–3 cột cuộn dọc; mảnh to hơn ô thì co lại
    const kr = trayEl.getBoundingClientRect();
    trayEl.dataset.orient = view.portrait ? 'row' : 'col';
    if (view.portrait) {
      const rows = Math.max(1, Math.min(4, Math.floor((kr.height - 8) / (Math.min(view.spriteCss, 110) * 0.85))));
      view.slot = Math.max(40, Math.min(view.spriteCss, 110, Math.floor((kr.height - 8) / rows)));
      trayEl.style.setProperty('--lines', rows);
    } else {
      const cols = Math.max(2, Math.floor((kr.width - 8) / Math.min(view.spriteCss, 100)));
      view.slot = Math.max(40, Math.min(view.spriteCss, Math.floor((kr.width - 8) / cols)));
      trayEl.style.setProperty('--lines', cols);
    }
    trayEl.style.setProperty('--slot', view.slot + 'px');
    buildPieces();
    drawBoard();
    sync();
    renderCursor();
  }

  let layoutRaf = 0;
  function layoutSoon() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      layout();
    });
  }

  /* ---------------- Dựng hình + mảnh ---------------- */

  function toPath(segs) {
    const p = new Path2D();
    segs.forEach((s) => {
      if (s[0] === 'M') p.moveTo(s[1], s[2]);
      else if (s[0] === 'L') p.lineTo(s[1], s[2]);
      else p.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
    });
    p.closePath();
    return p;
  }

  /** Vẽ bức hình + cắt mảnh; chỉ làm lại khi đổi ván hoặc đổi cỡ bàn. */
  function buildPieces() {
    const key = [game.mode, game.seed, game.date, view.S, view.dpr].join('|');
    if (key === builtKey) return;
    builtKey = key;
    const n = game.cols * game.rows;
    const P = Math.round(view.S * view.dpr);
    picture = document.createElement('canvas');
    picture.width = P;
    picture.height = P;
    const t0 = performance.now();
    SC.draw(picture.getContext('2d'), game.scene, P, game.sceneSeed);
    lastDrawMs = performance.now() - t0;
    app.dataset.drawMs = lastDrawMs.toFixed(1);
    peekCv.width = P;
    peekCv.height = P;
    peekCv.getContext('2d').drawImage(picture, 0, 0);

    paths = [];
    for (let id = 0; id < n; id++) paths.push(toPath(E.piecePath(game, id)));
    if (els.length !== n) {
      els.forEach((el) => el.remove());
      els = [];
      for (let id = 0; id < n; id++) {
        const el = document.createElement('canvas');
        el.className = 'piece';
        el.dataset.id = String(id);
        els.push(el);
      }
    }
    const sp = Math.ceil(view.spriteCss * view.dpr);
    els.forEach((el, id) => {
      el.width = sp;
      el.height = sp;
      drawSprite(el, id);
    });
  }

  /** Mảnh: cắt hình theo đường viền, viền nổi (sáng trên trái, tối dưới phải) và nét viền mảnh. */
  function drawSprite(el, id) {
    const k = view.cell * view.dpr;
    const c = el.getContext('2d');
    const { c: col, r: row } = E.cellOf(game, id);
    const p = paths[id];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, el.width, el.height);
    c.save();
    c.setTransform(k, 0, 0, k, M * k, M * k);
    c.clip(p);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(picture, Math.round(-(col - M) * k), Math.round(-(row - M) * k));
    c.setTransform(k, 0, 0, k, M * k, M * k);
    c.lineJoin = 'round';
    c.lineWidth = 0.07;
    c.translate(0.025, 0.025);
    c.strokeStyle = 'rgba(255,255,255,0.42)';
    c.stroke(p);
    c.translate(-0.05, -0.05);
    c.strokeStyle = 'rgba(0,0,0,0.32)';
    c.stroke(p);
    c.restore();
    c.setTransform(k, 0, 0, k, M * k, M * k);
    c.lineWidth = 1.1 / view.cell;
    c.strokeStyle = 'rgba(20,14,34,0.55)';
    c.stroke(p);
  }

  /** Canvas bàn: nền + lưới ô (tùy chọn) + mảnh đã khóa; ghép xong thì vẽ trọn bức hình (shine 0..1 = vệt sáng chạy qua). */
  function drawBoard(shine) {
    if (!game || !picture) return;
    const c = boardCtx;
    const S = view.S;
    const cell = view.cell;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, S, S);
    if (won()) {
      c.drawImage(picture, 0, 0, S, S);
      if (shine != null && shine > 0 && shine < 1) {
        const x = -S + shine * 3 * S;
        const g = c.createLinearGradient(x, 0, x + S * 0.6, S * 0.6);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, S, S);
      }
      return;
    }
    c.fillStyle = colors.board;
    c.fillRect(0, 0, S, S);
    if (kit.settings.get().grid !== false) {
      c.strokeStyle = colors.grid;
      c.lineWidth = 1;
      c.beginPath();
      for (let k = 1; k < game.cols; k++) {
        c.moveTo(k * cell + 0.5, 0);
        c.lineTo(k * cell + 0.5, S);
        c.moveTo(0, k * cell + 0.5);
        c.lineTo(S, k * cell + 0.5);
      }
      c.stroke();
    }
    const sc = view.spriteCss;
    game.done.forEach((d, id) => {
      if (!d) return;
      const { c: col, r: row } = E.cellOf(game, id);
      c.drawImage(els[id], (col - M) * cell, (row - M) * cell, sc, sc);
    });
  }

  /* ---------------- Đồng bộ phần tử theo ván ---------------- */

  /** Độ lệch nhóm kẹp vào trong bàn (để mảnh rời luôn nhìn thấy và kéo được khi khung đổi cỡ). */
  function clampOffset(members, dx, dy) {
    let c0 = Infinity;
    let c1 = -Infinity;
    let r0 = Infinity;
    let r1 = -Infinity;
    members.forEach((id) => {
      const { c, r } = E.cellOf(game, id);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
    });
    const cell = view.cell;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    return {
      dx: clamp(dx, -view.bx / cell - c0, (view.tw - view.bx) / cell - c1 - 1),
      dy: clamp(dy, -view.by / cell - r0, (view.th - view.by) / cell - r1 - 1),
    };
  }

  function sizeEl(el, px) {
    const s = px + 'px';
    if (el.style.width !== s) {
      el.style.width = s;
      el.style.height = s;
    }
  }

  function sync() {
    if (!game || !els.length) return;
    // Khay theo đúng thứ tự
    const kids = trayEl.children;
    let same = kids.length === game.tray.length;
    for (let i = 0; same && i < kids.length; i++) same = kids[i] === els[game.tray[i]];
    if (!same) game.tray.forEach((id) => trayEl.appendChild(els[id]));
    const filter = edgesOnly();
    let visible = 0;
    game.tray.forEach((id) => {
      const el = els[id];
      el.style.transform = '';
      el.style.zIndex = '';
      el.classList.remove('lifted', 'loose');
      sizeEl(el, view.slot);
      el.hidden = filter && !E.isEdge(game, id);
      if (!el.hidden) visible++;
      el.style.touchAction = view.portrait ? 'pan-x' : 'pan-y';
    });
    // Mảnh rời: thứ tự chồng theo mảng nhóm
    game.loose.forEach((grp, zi) => {
      const o = clampOffset(grp.members, grp.dx, grp.dy);
      grp.members.forEach((id) => {
        const el = els[id];
        if (el.parentNode !== looseEl) looseEl.appendChild(el);
        const { c, r } = E.cellOf(game, id);
        el.hidden = false;
        el.classList.add('loose');
        el.classList.remove('lifted');
        el.style.touchAction = 'none';
        sizeEl(el, view.spriteCss);
        el.style.zIndex = String(zi + 1);
        el.style.transform = 'translate3d(' + (view.bx + (c + o.dx - M) * view.cell).toFixed(1) + 'px,' + (view.by + (r + o.dy - M) * view.cell).toFixed(1) + 'px,0)';
      });
    });
    game.done.forEach((d, id) => {
      if (d && els[id].parentNode) els[id].remove();
    });
    els.forEach((el, id) => el.classList.toggle('sel', id === sel));
    const total = game.cols * game.rows;
    $('placed').textContent = doneCount() + '/' + total;
    $('tray-count').textContent = filter ? t('tray.countFilter', { n: visible, total: game.tray.length }) : t('tray.count', { n: game.tray.length });
    $('tray-empty').hidden = game.tray.length > 0 && visible > 0;
    $('tray-empty').textContent = game.tray.length ? t('tray.noEdges') : won() ? t('tray.done') : t('tray.empty');
    $('btn-edges').setAttribute('aria-pressed', String(filter));
  }

  /* ---------------- Giao diện ngoài bàn ---------------- */

  function renderUI() {
    if (!game) return;
    const today = todayKey();
    document.querySelectorAll('#modes button').forEach((b) => {
      const m = b.dataset.mode;
      b.setAttribute('aria-checked', String(m === game.mode));
      b.setAttribute('aria-label', modeLabel(m));
    });
    const done = dailyTime(today);
    $('modes').querySelector('[data-mode="daily"]').classList.toggle('done', done !== null);
    $('daily-sub').textContent = done !== null ? '✓ ' + fmtClock(done) : t('mode.pieces', { n: E.pieceCount('daily') });
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
    table.classList.toggle('solved', won());
    $('btn-peek').disabled = won();
    $('btn-edges').disabled = won();
    table.setAttribute('aria-label', t('board.label', { scene: sceneName(), n: game.cols * game.rows }));
    updateTime();
  }

  let shown = '';
  function updateTime() {
    const s = fmtClock(game ? clock.elapsed() : 0);
    if (s !== shown) $('time').textContent = shown = s;
  }
  setInterval(updateTime, 250);

  /**
   * Đồng hồ chỉ chạy khi chưa ghép xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn + khay để không ngắm hình "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !won();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    if (open) {
      cancelDrag();
      setPeek(false);
    }
    app.classList.toggle('paused', playing && open);
    updateTime();
  }

  const say = (msg) => { $('sr-status').textContent = msg; };

  /* ---------------- Lưu ---------------- */

  function writeSummary() {
    const m = game ? game.mode : lastSize();
    const sm = SIZE_MODES.indexOf(m) >= 0 ? m : lastSize();
    const best = stats.best[sm];
    const today = todayKey();
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' ' + E.pieceCount(sm) });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { mode: modeLabel(sm), time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? { title: t('app.name') + ' · ' + modeLabel(m), detail: t('summary.resume', { done: doneCount(), total: game.cols * game.rows, time: fmtClock(clock.elapsed()) }), pct: Math.round(E.progress(game) * 1000) / 1000 }
        : null,
      daily: { date: today, done: dailyTime(today) !== null, title: t('summary.dailyTitle'), streak: dailyStreak() },
      now: Date.now(),
    }));
  }

  let persistTimer = 0;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }
  // Đặt liên tục thì gom lại, lưu sau 300 ms (rời trang vẫn lưu ngay qua kit.onLeave)
  function persistSoon() {
    if (!persistTimer) persistTimer = setTimeout(persist, 300);
  }

  /* ---------------- Luồng ván ---------------- */

  const randomSeed = () => Math.floor(Math.random() * 4294967296);

  function newPuzzle(m) {
    clearTimeout(winTimer);
    cancelDrag();
    const mode = E.MODES.indexOf(m) >= 0 ? m : 'easy';
    game = E.newGame({ mode, seed: randomSeed(), date: mode === 'daily' ? todayKey() : null });
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    sel = -1;
    target = null;
    lastTarget = { c: 0, r: 0 };
    say('');
    trayEl.scrollLeft = 0;
    trayEl.scrollTop = 0;
    if (mode !== 'daily' && kit.settings.get().size !== mode) kit.settings.set({ size: mode });
    layout();
    renderUI();
    syncClock();
    writeSummary();
  }

  const canAct = () => !!game && !won() && !kit.modal.current();

  /** Áp kết quả một lần thả / đem về khay. */
  function apply(res, kind) {
    if (!res || res.game === game || res.result === 'none' || res.ok === false) {
      sync();
      return false;
    }
    game = res.game;
    const total = game.cols * game.rows;
    if (kind === 'tray') {
      kit.sfx('move');
      say(t('sr.toTray'));
    } else if (res.result === 'lock') {
      if (res.members.indexOf(sel) >= 0) sel = -1;
      kit.sfx(res.members.length >= 4 ? 'combo' : 'place');
      flash(res.members);
      drawBoard();
      say(t('sr.locked', { n: res.members.length, done: doneCount(), total }));
    } else if (res.result === 'merge') {
      kit.sfx('merge');
      say(t('sr.merged', { n: res.members.length }));
    } else {
      kit.sfx('drop');
    }
    sync();
    renderCursor();
    if (E.isWon(game)) finish();
    else persistSoon();
    return true;
  }

  /** Lóe sáng chỗ vừa khóa (tắt khi giảm chuyển động). */
  function flash(members) {
    if (calm()) return;
    members.forEach((id) => {
      const { c, r } = E.cellOf(game, id);
      const f = document.createElement('div');
      f.className = 'flash';
      f.style.left = view.bx + c * view.cell + 'px';
      f.style.top = view.by + r * view.cell + 'px';
      f.style.width = view.cell + 'px';
      f.style.height = view.cell + 'px';
      table.appendChild(f);
      f.addEventListener('animationend', () => f.remove());
      setTimeout(() => f.remove(), 900);
    });
  }

  function finish() {
    cancelDrag();
    setPeek(false);
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const isBest = stats.best[m] == null || ms < stats.best[m];
    stats.played++;
    stats.won++;
    if (isBest) stats.best[m] = ms;
    if (m === 'daily' && game.date) {
      const prev = dailyTime(game.date);
      stats.daily[game.date] = prev === null ? ms : Math.min(prev, ms);
    }
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted: false });
    kit.sfx('win');
    kit.confetti();
    sel = -1;
    target = null;
    renderCursor();
    sync();
    renderUI();
    say(t('sr.won', { time: fmt(ms) }));
    celebrate();

    $('win-scene').textContent = sceneName();
    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest;
    badge.textContent = t('win.best', { mode: modeLabel(m) });
    const notes = [];
    if (!isBest && stats.best[m] != null) notes.push(t('win.noteBest', { mode: modeLabel(m), time: fmt(stats.best[m]) }));
    if (m === 'daily') notes.push(t('win.daily', { n: dailyStreak() }));
    $('win-note').textContent = notes.join(' ');
    $('win-note').hidden = !notes.length;
    // Cho người chơi kịp ngắm bức hình hoàn chỉnh rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 300 : 1400);
  }

  /** Hiệu ứng ghép xong: vệt sáng chạy chéo qua bức hình (giảm chuyển động: chỉ hiện hình trọn vẹn). */
  function celebrate() {
    if (calm()) {
      drawBoard();
      return;
    }
    table.classList.remove('pop');
    void table.offsetWidth; // chạy lại hiệu ứng
    table.classList.add('pop');
    const t0 = performance.now();
    const step = (now) => {
      if (!won()) return;
      const p = (now - t0) / WIN_MS;
      drawBoard(Math.min(1, p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Bỏ ván đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    saveStats();
    kit.sdk.end({ mode: game.mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
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
    newPuzzle(p.kind === 'mode' ? p.mode : nextModeForNew());
  }

  /** Ván mới: cùng cỡ; đang chơi đề hằng ngày thì về cỡ đã chọn gần nhất. */
  const nextModeForNew = () => (game && game.mode !== 'daily' ? game.mode : lastSize());

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newPuzzle(nextModeForNew());
    }
  }

  /** Chọn cỡ / đề hằng ngày. Đang ghép dở thì hỏi trước; đề hôm nay đã xong thì chỉ báo thời gian. */
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
    else newPuzzle(m);
  }

  function onSetting(key) {
    if (!game) return;
    if (key === 'grid') drawBoard();
    if (key === 'edges') {
      if (sel >= 0 && edgesOnly() && game.tray.indexOf(sel) >= 0 && !E.isEdge(game, sel)) sel = -1;
      sync();
    }
  }

  /* ---------------- Xem hình gốc ---------------- */

  function setPeek(on) {
    on = !!on && canAct();
    if (on === peekOn) return;
    peekOn = on;
    peekCv.classList.toggle('on', on);
    $('btn-peek').setAttribute('aria-pressed', String(on));
  }
  const peekBtn = $('btn-peek');
  peekBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { peekBtn.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    setPeek(true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => peekBtn.addEventListener(ev, () => setPeek(false)));
  peekBtn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      setPeek(true);
    }
  });
  peekBtn.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') setPeek(false);
  });
  peekBtn.addEventListener('blur', () => setPeek(false));
  peekBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  $('btn-edges').addEventListener('click', () => kit.settings.set({ edges: !edgesOnly() }));

  /* ---------------- Kéo thả ---------------- */

  let drag = null; // { id, pid, sx, sy, x, y, started, inTray, touch, gx, gy, members: [{ id, ox, oy }] }
  let tap = null; // chạm chỗ trống trên bàn khi đang chọn mảnh: { pid, x, y }

  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  /** Mảnh dưới điểm (clientX/Y): kiểm tra đúng đường viền (góc trong suốt của ô vuông không tính). */
  function hit(id, x, y) {
    const el = els[id];
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !inside(r, x, y)) return false;
    const u = ((x - r.left) / r.width) * (1 + 2 * M) - M;
    const v = ((y - r.top) / r.height) * (1 + 2 * M) - M;
    return hitCtx.isPointInPath(paths[id], u, v);
  }

  function pieceAt(x, y) {
    for (let gi = game.loose.length - 1; gi >= 0; gi--) {
      const m = game.loose[gi].members;
      for (let k = 0; k < m.length; k++) if (hit(m[k], x, y)) return m[k];
    }
    if (inside(trayEl.getBoundingClientRect(), x, y)) {
      for (let k = 0; k < game.tray.length; k++) if (hit(game.tray[k], x, y)) return game.tray[k];
    }
    return -1;
  }

  stage.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !canAct() || drag) return;
    const id = pieceAt(e.clientX, e.clientY);
    if (id < 0) {
      if (sel >= 0 && inside(table.getBoundingClientRect(), e.clientX, e.clientY)) {
        tap = { pid: e.pointerId, x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
      return;
    }
    const inTray = game.tray.indexOf(id) >= 0;
    drag = { id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, started: false, inTray, touch: e.pointerType !== 'mouse' };
    // Chạm trong khay: chưa giữ con trỏ để trình duyệt còn cuộn khay khi vuốt dọc theo khay
    if (!(inTray && drag.touch)) {
      e.preventDefault();
      try { app.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.started) {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) < (drag.touch ? 8 : 5)) return;
      if (drag.inTray && drag.touch) {
        // Vuốt dọc theo khay là cuộn khay, không nhấc mảnh
        const along = view.portrait ? Math.abs(dx) : Math.abs(dy);
        const across = view.portrait ? Math.abs(dy) : Math.abs(dx);
        if (along > across) {
          drag = null;
          return;
        }
      }
      if (!canAct()) {
        drag = null;
        return;
      }
      startDrag();
    }
    moveSoon();
  }, { passive: true });

  function startDrag() {
    const d = drag;
    const el = els[d.id];
    const r = el.getBoundingClientRect();
    const k = r.width / view.spriteCss || 1;
    d.gx = (d.sx - r.left) / k;
    d.gy = (d.sy - r.top) / k;
    const ids = d.inTray ? [d.id] : E.groupOf(game, d.id).members;
    const me = E.cellOf(game, d.id);
    d.members = ids.map((id) => {
      const q = E.cellOf(game, id);
      return { id, ox: (q.c - me.c) * view.cell, oy: (q.r - me.r) * view.cell };
    });
    d.members.forEach((m) => {
      const x = els[m.id];
      x.hidden = false;
      x.classList.add('lifted');
      x.classList.remove('sel');
      x.style.zIndex = '';
      sizeEl(x, view.spriteCss);
      dragLayer.appendChild(x);
    });
    try { app.setPointerCapture(d.pid); } catch (err) { /* bỏ qua */ }
    d.started = true;
    sel = -1;
    target = null;
    renderCursor();
    kit.sfx('tap');
    moveNow();
  }

  let moveRaf = 0;
  function moveSoon() {
    if (!moveRaf) moveRaf = requestAnimationFrame(moveNow);
  }
  function moveNow() {
    moveRaf = 0;
    if (!drag || !drag.started) return;
    const x0 = drag.x - drag.gx;
    const y0 = drag.y - drag.gy;
    drag.members.forEach((m) => {
      els[m.id].style.transform = 'translate3d(' + (x0 + m.ox).toFixed(1) + 'px,' + (y0 + m.oy).toFixed(1) + 'px,0)';
    });
  }

  /** Vị trí chèn vào khay theo điểm thả (mảnh đứng trước mảnh gần nhất nếu thả trước tâm của nó). */
  function trayIndexAt(x, y) {
    let best = -1;
    let bestD = Infinity;
    let before = true;
    game.tray.forEach((id, i) => {
      const el = els[id];
      if (el.hidden) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) {
        bestD = d;
        best = i;
        before = view.portrait ? x < cx : y < cy || (Math.abs(y - cy) < r.height / 2 && x < cx);
      }
    });
    return best < 0 ? 0 : before ? best : best + 1;
  }

  function finishDrag(d, x, y) {
    d.members.forEach((m) => els[m.id].classList.remove('lifted'));
    const single = d.members.length === 1;
    if (single && inside(dock.getBoundingClientRect(), x, y)) {
      if (d.inTray) sync();
      else apply(E.toTray(game, d.id, trayIndexAt(x, y)), 'tray');
      return;
    }
    const tr = table.getBoundingClientRect();
    if (d.inTray && !inside(tr, x, y)) {
      sync(); // thả ra ngoài bàn: mảnh về lại khay
      return;
    }
    const me = E.cellOf(game, d.id);
    const ux = (x - d.gx - tr.left - view.bx) / view.cell + M;
    const uy = (y - d.gy - tr.top - view.by) / view.cell + M;
    const o = clampOffset(d.members.map((m) => m.id), ux - me.c, uy - me.r);
    apply(E.drop(game, d.id, me.c + o.dx, me.r + o.dy), 'drop');
  }

  /** Chạm chỗ trống trên bàn khi đang chọn mảnh: đặt mảnh (cả nhóm) sao cho tâm mảnh chọn nằm ở chỗ chạm. */
  function placeSelectedAt(x, y) {
    if (sel < 0 || !canAct()) return;
    const tr = table.getBoundingClientRect();
    const me = E.cellOf(game, sel);
    const ux = (x - tr.left - view.bx) / view.cell - 0.5;
    const uy = (y - tr.top - view.by) / view.cell - 0.5;
    const grp = E.groupOf(game, sel);
    const o = clampOffset(grp ? grp.members : [sel], ux - me.c, uy - me.r);
    apply(E.drop(game, sel, me.c + o.dx, me.r + o.dy), 'drop');
  }

  function select(id) {
    sel = id;
    target = null;
    renderCursor();
    sync();
    if (id >= 0) {
      kit.sfx('tap');
      const el = els[id];
      if (el.parentNode === trayEl) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
      say(t(game.tray.indexOf(id) >= 0 ? 'sr.selTray' : 'sr.selLoose', { k: keyList().indexOf(id) + 1, n: keyList().length }) + (E.isEdge(game, id) ? ' ' + t('sr.edge') : ''));
    }
  }

  window.addEventListener('pointerup', (e) => {
    if (tap && e.pointerId === tap.pid) {
      const p = tap;
      tap = null;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12) placeSelectedAt(e.clientX, e.clientY);
      return;
    }
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    if (!d.started) {
      // Chạm (không kéo): chọn / bỏ chọn mảnh
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 12 && canAct()) select(sel === d.id ? -1 : d.id);
      return;
    }
    finishDrag(d, e.clientX, e.clientY);
  });
  window.addEventListener('pointercancel', (e) => {
    if (tap && e.pointerId === tap.pid) tap = null;
    if (drag && e.pointerId === drag.pid) cancelDrag();
  });

  /** Hủy kéo đang dở: mảnh về chỗ cũ. */
  function cancelDrag() {
    tap = null;
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.started) {
      d.members.forEach((m) => els[m.id].classList.remove('lifted'));
      sync();
    }
  }

  // Lăn chuột trên khay ngang thì cuộn ngang
  trayEl.addEventListener('wheel', (e) => {
    if (!view.portrait || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    trayEl.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */

  /** Danh sách mảnh chọn được bằng phím: mảnh trong khay (theo bộ lọc) rồi mỗi nhóm rời một mảnh đại diện. */
  function keyList() {
    const list = game.tray.filter((id) => !els[id] || !els[id].hidden);
    game.loose.forEach((g) => list.push(g.members[0]));
    return list;
  }

  /** Ô đích (khung nét đứt) + bóng mờ của mảnh đang cầm. */
  function renderCursor() {
    const on = !!game && target != null && sel >= 0 && !won();
    cursor.hidden = !on;
    if (!on) return;
    const cell = view.cell;
    cursor.style.left = view.bx + target.c * cell + 'px';
    cursor.style.top = view.by + target.r * cell + 'px';
    cursor.style.width = cell + 'px';
    cursor.style.height = cell + 'px';
    const sp = els[sel];
    ghost.width = sp.width;
    ghost.height = sp.height;
    ghost.getContext('2d').drawImage(sp, 0, 0);
    ghost.style.width = view.spriteCss + 'px';
    ghost.style.height = view.spriteCss + 'px';
    ghost.style.left = -M * cell + 'px';
    ghost.style.top = -M * cell + 'px';
  }

  function tryPlace() {
    const me = E.cellOf(game, sel);
    if (target.c === me.c && target.r === me.r) {
      const list = keyList();
      const i = list.indexOf(sel);
      lastTarget = { c: target.c, r: target.r };
      apply(E.drop(game, sel, me.c, me.r), 'drop');
      if (won()) return;
      // Chọn sẵn mảnh kế tiếp, ô đích ẩn tới khi cầm mảnh mới
      const rest = keyList();
      target = null;
      sel = rest.length ? rest[Math.min(i, rest.length - 1)] : -1;
      select(sel);
      return;
    }
    kit.sfx('error');
    cursor.classList.remove('shake');
    void cursor.offsetWidth;
    cursor.classList.add('shake');
    say(t('sr.wrong'));
    kit.toast(t('toast.wrongSpot'), 1200);
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a[href]');
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      if (!canAct()) return;
      const [dx, dy] = arrows[k];
      if (target && sel >= 0) {
        target = { c: Math.max(0, Math.min(game.cols - 1, target.c + dx)), r: Math.max(0, Math.min(game.rows - 1, target.r + dy)) };
        kit.sfx('move');
        renderCursor();
        say(t('sr.target', { c: target.c + 1, r: target.r + 1 }));
        return;
      }
      const list = keyList();
      if (!list.length) return;
      const i = list.indexOf(sel);
      const next = i < 0 ? 0 : (i + (dx + dy > 0 ? 1 : -1) + list.length) % list.length;
      select(list[next]);
      return;
    }
    if ((k === 'enter' || k === ' ') && !onButton) {
      e.preventDefault();
      if (!canAct()) return;
      if (target && sel >= 0) tryPlace();
      else if (sel >= 0) {
        target = { c: lastTarget.c, r: lastTarget.r };
        kit.sfx('tap');
        renderCursor();
        say(t('sr.pick', { c: target.c + 1, r: target.r + 1 }));
      } else {
        const list = keyList();
        if (list.length) select(list[0]);
      }
      return;
    }
    if (k === 'escape') {
      if (target) {
        target = null;
        renderCursor();
      } else if (sel >= 0) select(-1);
      return;
    }
    if (k === 'v') {
      e.preventDefault();
      if (!e.repeat) setPeek(true);
      return;
    }
    if (k === 'e') kit.settings.set({ edges: !edgesOnly() });
    else if (k === 'n') requestNew();
    else if (k >= '1' && k <= '4') requestMode(E.MODES[Number(k) - 1]);
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'v') setPeek(false);
  });
  window.addEventListener('blur', () => setPeek(false));

  /* ---------------- Nút ---------------- */

  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => requestMode(b.dataset.mode)));
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newPuzzle(nextModeForNew());
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
    if (document.hidden) {
      cancelDrag();
      setPeek(false);
    } else syncClock();
  });
  kit.onLeave(persist);

  function retheme() {
    // Đợi CSS áp token mới rồi mới đọc màu
    requestAnimationFrame(() => {
      readColors();
      drawBoard();
    });
  }
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  window.addEventListener('resize', layoutSoon);
  if (window.ResizeObserver) new ResizeObserver(layoutSoon).observe(app);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */

  readColors();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(game.mode, true);
    layout();
    renderUI();
    syncClock();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    newPuzzle(lastSize());
  }

  // Lần đầu mở game: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
