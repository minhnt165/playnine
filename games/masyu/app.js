/* =====================================================================
 * Masyu - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ ('s' 6×6 | 'm' 8×8 | 'l' 10×10) hoặc 'daily' (8×8, một đề mỗi ngày), metric time_low
 *   - Bàn vẽ bằng SVG (một ô = 100 đơn vị); kéo qua các ô để vẽ, chạm giữa hai ô để đổi cạnh, × đánh dấu cạnh cấm
 *   - Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại / ẩn tab; ván có gợi ý gửi assisted: true, không tính kỷ lục
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - giải xong: kit.sdk.end({ mode, won: true, timeMs, assisted })
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 *   - Đề hằng ngày: mỗi ngày chơi một lần (giải xong hoặc bỏ đều ghi kết quả ngày), có chuỗi ngày thắng
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['s', 'm', 'l', 'daily'];
  const kit = PNKit.init({
    gameId: 'masyu',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { mode: 's', size: 's', errors: 'auto', guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const SVG = 'http://www.w3.org/2000/svg';
  const U = 100; // một ô = 100 đơn vị SVG
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const sizeOf = (m) => E.MODES[m].n + '×' + E.MODES[m].n;
  const levelOf = (m) => t('mode.' + m);

  /* ---------------- Thống kê ---------------- */

  const num = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const stats = (function load() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: num(raw.played), won: num(raw.won), streak: num(raw.streak), maxDaily: num(raw.maxDaily), best: {}, daily: {} };
    MODES.forEach((m) => {
      const b = raw.best && raw.best[m];
      s.best[m] = Number.isFinite(b) && b > 0 ? b : null;
    });
    if (raw.daily && typeof raw.daily === 'object') {
      Object.keys(raw.daily).forEach((k) => {
        const d = raw.daily[k];
        if (E.isDateKey(k) && d && typeof d === 'object') s.daily[k] = { won: !!d.won, ms: Number.isFinite(d.ms) ? d.ms : null };
      });
    }
    return s;
  })();

  const todayKey = () => E.dateKey(new Date());
  const dayOffset = (k) => {
    const d = new Date();
    d.setDate(d.getDate() + k);
    return E.dateKey(d);
  };
  const dailyWon = (k) => !!(stats.daily[k] && stats.daily[k].won);
  const dailyDone = () => !!stats.daily[todayKey()];

  /** Chuỗi ngày thắng đề hằng ngày: tính tới hôm nay (hoặc hôm qua nếu hôm nay chưa chơi). */
  function dailyStreak() {
    const today = todayKey();
    if (stats.daily[today] && !stats.daily[today].won) return 0;
    let i = stats.daily[today] ? 0 : -1;
    let n = 0;
    while (dailyWon(dayOffset(i))) {
      n++;
      i--;
    }
    return n;
  }

  /** Ghi kết quả đề ngày (giữ 120 ngày gần nhất). */
  function recordDaily(date, won, ms) {
    stats.daily[date] = { won, ms: won ? ms : null };
    const old = Object.keys(stats.daily).sort();
    while (old.length > 120) delete stats.daily[old.shift()];
    stats.maxDaily = Math.max(stats.maxDaily, dailyStreak());
  }

  /* ---------------- Trạng thái ---------------- */

  let game = null;
  let view = null; // kết quả E.analyze(game) của lần vẽ gần nhất
  let cursor = { r: 0, c: 0 }; // con trỏ bàn phím, nằm trên một ô
  let crossMode = false; // nút ×: chạm / kéo đánh dấu × thay vì vẽ
  let crossArmed = false; // phím X: mũi tên tiếp theo đánh dấu × thay vì di chuyển
  let xHeld = false;
  let xUsed = false;
  let stroke = null; // nét kéo / chạm đang diễn ra
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'mode', mode }
  let winTimer = 0;
  let els = null;

  const mode = () => game.mode;
  const solved = () => !!game && E.isSolved(game);
  /** Đề đang dở: đã đi ít nhất một nước và chưa giải (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !solved();
  const errorsOn = () => {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && game.mode === 's');
  };

  /** m:ss (hoặc h:mm:ss). */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* ---------------- Dựng bàn SVG ---------------- */

  function el(name, attrs, parent) {
    const x = document.createElementNS(SVG, name);
    Object.keys(attrs).forEach((k) => x.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(x);
    return x;
  }

  const cx = (v) => ((v % game.n) + 0.5) * U;
  const cy = (v) => (Math.floor(v / game.n) + 0.5) * U;

  /** Dựng lại toàn bộ bàn khi đổi đề (lưới, cạnh, dấu ×, hạt, con trỏ). */
  function buildBoard() {
    const n = game.n;
    const G = E.geom(n);
    const board = $('board');
    board.textContent = '';
    board.setAttribute('viewBox', [0, 0, n * U, n * U].join(' '));
    board.dataset.n = n;
    let d = '';
    for (let i = 1; i < n; i++) d += `M${i * U} 0V${n * U}M0 ${i * U}H${n * U}`;
    el('path', { d, class: 'grid' }, board);
    const gEdges = el('g', { class: 'edges' }, board);
    const gMarks = el('g', { class: 'marks' }, board);
    const gCells = el('g', { class: 'cells' }, board); // trên vòng: chấm đỏ báo lỗi phải nhìn thấy
    const gPearls = el('g', { class: 'pearls' }, board);
    els = { cells: [], edges: [], marks: [], pearls: [] };
    for (let v = 0; v < G.V; v++) els.cells.push(el('circle', { cx: cx(v), cy: cy(v), r: 6, class: 'cell' }, gCells));
    const k = 12; // nửa cỡ dấu ×
    for (let e = 0; e < G.E; e++) {
      const a = G.ea[e];
      const b = G.eb[e];
      els.edges.push(el('line', { x1: cx(a), y1: cy(a), x2: cx(b), y2: cy(b), class: 'edge' }, gEdges));
      const mx = (cx(a) + cx(b)) / 2;
      const my = (cy(a) + cy(b)) / 2;
      els.marks.push(el('path', { d: `M${mx - k} ${my - k}L${mx + k} ${my + k}M${mx + k} ${my - k}L${mx - k} ${my + k}`, class: 'mark' }, gMarks));
    }
    for (let v = 0; v < G.V; v++) {
      const p = game.pearls[v];
      if (!p) continue;
      const c = el('circle', { cx: cx(v), cy: cy(v), r: 29, class: 'pearl ' + (p === 1 ? 'white' : 'black') }, gPearls);
      c.style.setProperty('--d', Math.floor(v / n) + (v % n));
      els.pearls[v] = c;
    }
    els.cursor = el('rect', { width: U - 12, height: U - 12, rx: 18, class: 'cursor' }, board);
    cursor = { r: Math.floor(n / 2), c: Math.floor(n / 2) };
  }

  /** Thứ tự các ô dọc theo vòng (chỉ dùng khi đã giải): để hạt sáng lần lượt theo vòng. */
  function loopOrder() {
    const G = E.geom(game.n);
    const order = new Array(G.V).fill(-1);
    let start = -1;
    for (let e = 0; e < G.E && start < 0; e++) if (game.edges[e] === 1) start = G.ea[e];
    if (start < 0) return order;
    let prev = -1;
    let v = start;
    let i = 0;
    do {
      order[v] = i++;
      let next = -1;
      for (let d = 0; d < 4; d++) {
        const w = G.nb[4 * v + d];
        const e = G.dirE[4 * v + d];
        if (e >= 0 && game.edges[e] === 1 && w !== prev) next = w;
      }
      prev = v;
      v = next;
    } while (v >= 0 && v !== start && i <= G.V);
    return order;
  }

  function setCls(node, cls) {
    if (node.getAttribute('class') !== cls) node.setAttribute('class', cls);
  }

  function render() {
    if (!els || els.edges.length !== E.geom(game.n).E || els.cells.length !== game.n * game.n) buildBoard();
    view = E.analyze(game);
    const err = errorsOn();
    const bad = err && view.badLoop ? new Set(view.loopEdges) : null;
    const s = game.edges;
    for (let e = 0; e < s.length; e++) {
      setCls(els.edges[e], s[e] === 1 ? (bad && bad.has(e) ? 'edge on bad' : 'edge on') : 'edge');
      setCls(els.marks[e], s[e] === 2 ? 'mark show' : 'mark');
    }
    const G = E.geom(game.n);
    const lit = new Uint8Array(G.V);
    for (let e = 0; e < s.length; e++) {
      if (s[e] !== 1) continue;
      lit[G.ea[e]] = 1;
      lit[G.eb[e]] = 1;
    }
    els.cells.forEach((c, v) => {
      const st = view.cell[v];
      setCls(c, 'cell' + (st === 'branch' || (err && st === 'dead') ? ' err' : lit[v] ? ' lit' : ''));
    });
    const win = view.solved;
    const order = win ? loopOrder() : null;
    els.pearls.forEach((c, v) => {
      if (!c) return;
      const st = view.pearl[v];
      setCls(c, 'pearl ' + (game.pearls[v] === 1 ? 'white' : 'black') + (err && st === 'bad' ? ' bad' : '') + (st === 'ok' && !win ? ' ok' : ''));
      if (order) c.style.setProperty('--i', order[v]);
    });
    els.cursor.setAttribute('x', cursor.c * U + 6);
    els.cursor.setAttribute('y', cursor.r * U + 6);
    setCls(els.cursor, 'cursor' + (crossArmed ? ' x' : ''));

    const board = $('board');
    board.classList.toggle('solved', win);
    board.classList.toggle('crossing', crossMode);
    board.setAttribute('aria-label', win ? t('board.solved') : t('board.label', { size: sizeOf(game.mode), lines: view.lines }));
    $('level').textContent = game.mode === 'daily' ? t('mode.dailyShort') : levelOf(game.mode);
    $('size').textContent = sizeOf(game.mode);
    $('best').textContent = stats.best[game.mode] == null ? '–' : fmt(stats.best[game.mode]);
    $('btn-undo').disabled = win || !game.undo.length;
    $('btn-redo').disabled = win || !game.redo.length;
    $('btn-hint').disabled = win;
    $('btn-cross').setAttribute('aria-pressed', crossMode ? 'true' : 'false');
    const badge = $('btn-mode');
    badge.setAttribute('aria-label', t('mode.badge', { size: sizeOf(game.mode), level: levelOf(game.mode), next: levelOf(nextMode(game.mode)) }));
    badge.title = t('mode.name');
    renderTime();
  }

  function renderTime() {
    if (game) $('time').textContent = fmt(clock.elapsed());
  }
  setInterval(renderTime, 250);

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? game.mode : kit.settings.get().mode;
    const best = stats.best[m];
    const solLen = game ? Math.max(1, game.sol.reduce((a, b) => a + b, 0)) : 1;
    const lines = view ? view.lines : 0;
    const today = todayKey();
    const streak = dailyStreak();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { level: levelOf(m), time: fmt(best) }),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(best == null ? [] : [{ value: fmt(best), label: t('stats.best', { level: levelOf(m) }) }])
        : [],
      resume: inPlay()
        ? { title: t('app.name') + ' ' + sizeOf(m), detail: t('summary.resume', { level: levelOf(m), lines }), pct: Math.max(0, Math.min(0.95, lines / solLen)) }
        : null,
      daily: { date: today, done: dailyDone(), title: t('summary.dailyTitle'), streak },
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Đồng hồ: chạy khi đang giải, dừng khi mở hộp thoại ---------------- */

  function syncClock() {
    if (!game || solved() || kit.modal.current() || document.hidden) clock.pause();
    else clock.resume();
    renderTime();
  }
  const watcher = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  /* ---------------- Luồng ván ---------------- */

  function newBoard(m) {
    clearTimeout(winTimer);
    stroke = null;
    game = m === 'daily'
      ? E.newGame({ mode: 'daily', date: todayKey() })
      : E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    els = null;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    deal();
    writeSummary();
    syncClock();
  }

  /** Đề mới: hạt hiện dần theo đường chéo. */
  function deal() {
    if (calm()) return;
    const board = $('board');
    board.classList.remove('deal');
    void board.getBoundingClientRect();
    board.classList.add('deal');
  }

  /** Đổi ván sang trạng thái mới (đã khác); kiểm thắng, lưu, vẽ lại. */
  function commit(next, sound) {
    if (next === game) return false;
    game = next;
    if (solved()) {
      render();
      finish();
      return true;
    }
    if (sound) kit.sfx(sound);
    render();
    persist();
    return true;
  }

  /** Âm thanh theo trạng thái mới của cạnh; tạo ô 3 đường thì báo lỗi. */
  function soundFor(to, e) {
    if (to === 1) {
      const G = E.geom(game.n);
      const deg = (v) => {
        let k = 0;
        for (let d = 0; d < 4; d++) {
          const x = G.dirE[4 * v + d];
          if (x >= 0 && game.edges[x] === 1) k++;
        }
        return k;
      };
      return deg(G.ea[e]) >= 3 || deg(G.eb[e]) >= 3 ? 'error' : 'place';
    }
    return to === 2 ? 'tap' : 'pop';
  }

  function tapEdge(e, reverse) {
    if (e < 0 || !game || solved()) return;
    const next = E.cycle(game, e, reverse);
    if (next === game) return;
    const to = next.edges[e];
    commit(next, null);
    if (!solved()) kit.sfx(soundFor(to, e));
  }

  function finish() {
    stroke = null;
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const assisted = game.hints > 0;
    const best = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (best) stats.best[m] = ms;
    if (m === 'daily') recordDaily(game.date, true, ms);
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    render();
    $('win-time').textContent = fmt(ms);
    $('win-best').hidden = !best;
    $('win-hints').hidden = !assisted;
    $('win-hints').textContent = assisted ? t('win.hints', { n: game.hints }) : '';
    $('win-daily').hidden = m !== 'daily';
    if (m === 'daily') $('win-daily').textContent = t('win.daily', { n: dailyStreak() });
    $('btn-again').textContent = m === 'daily' ? t('win.nextSize', { level: levelOf(kit.settings.get().size) }) : t('win.next');
    // Cho người chơi kịp thấy vòng sáng lên rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (solved()) kit.modal.open('modal-win');
    }, calm() ? 200 : 1300);
  }

  function doUndo() {
    if (!game || solved()) return;
    if (!game.undo.length) return kit.toast(t('toast.noUndo'));
    commit(E.undo(game), 'move');
  }
  function doRedo() {
    if (!game || solved()) return;
    commit(E.redo(game), 'move');
  }
  function doHint() {
    if (!game || solved() || kit.modal.current()) return;
    const first = game.hints === 0;
    const h = E.hint(game);
    if (!h) return;
    if (commit(E.useHint(game), h.to === 1 ? 'place' : 'tap')) {
      if (first) kit.toast(t('toast.hint'));
      flash(h.e);
    }
  }
  /** Nháy cạnh vừa được gợi ý. */
  function flash(e) {
    if (calm() || !els || !els.edges[e]) return;
    [els.edges[e], els.marks[e]].forEach((x) => {
      x.classList.remove('flash');
      void x.getBoundingClientRect();
      x.classList.add('flash');
    });
  }

  function toggleCross(on) {
    crossMode = typeof on === 'boolean' ? on : !crossMode;
    if (game) render();
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    if (game.mode === 'daily') recordDaily(game.date, false, 0);
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'mode' ? t('confirm.mode', { level: levelOf(p.mode) }) : t('btn.new');
    $('confirm-text').textContent = game.mode === 'daily' ? t('confirm.daily') : t('confirm.text');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'mode') switchMode(p.mode);
    else newBoard(game.mode === 'daily' ? sizeMode() : mode());
  }

  /** Cỡ thường chơi gần nhất (để quay về sau đề ngày). */
  const sizeMode = () => (['s', 'm', 'l'].indexOf(kit.settings.get().size) >= 0 ? kit.settings.get().size : 's');

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newBoard(game.mode === 'daily' ? sizeMode() : mode());
    }
  }

  /** Mode kế tiếp khi bấm ô cỡ trên HUD (bỏ qua đề ngày nếu hôm nay đã chơi). */
  function nextMode(m) {
    let i = MODES.indexOf(m);
    for (let k = 0; k < MODES.length; k++) {
      i = (i + 1) % MODES.length;
      if (MODES[i] !== 'daily' || !dailyDone()) return MODES[i];
    }
    return m;
  }

  /** Đổi mode: chia đề mới mode đó trước, rồi lưu cài đặt (onSetting gặp mode đã khớp nên không làm gì). */
  function switchMode(m) {
    newBoard(m);
    kit.settings.set(m === 'daily' ? { mode: m } : { mode: m, size: m });
  }

  /** Yêu cầu đổi mode (từ Cài đặt hoặc ô cỡ). Đề đang dở thì giữ cài đặt cũ và hỏi trước; đề ngày đã chơi thì báo. */
  function requestMode(m) {
    if (MODES.indexOf(m) < 0 || !game || m === mode()) return;
    if (m === 'daily' && dailyDone()) {
      kit.settings.set({ mode: mode() });
      const d = stats.daily[todayKey()];
      kit.toast(d.won ? t('toast.dailyWon', { time: fmt(d.ms) }) : t('toast.dailyLost'), 2600);
      return;
    }
    if (inPlay()) {
      kit.settings.set({ mode: mode() });
      askConfirm({ kind: 'mode', mode: m });
    } else {
      switchMode(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'mode') requestMode(value);
    else if (key === 'errors' && game) render();
  }

  /* ---------------- Chạm / kéo trên bàn ---------------- */

  const board = $('board');

  /** Tọa độ chuột / ngón tay theo đơn vị ô (x = cột, y = hàng; tâm ô (r,c) ở (c+0,5; r+0,5)). */
  function toGrid(ev) {
    const m = board.getScreenCTM();
    if (!m) return { x: -9, y: -9 };
    const p = board.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x / U, y: q.y / U };
  }

  /** Cạnh có điểm giữa (trên ranh giới hai ô) gần (x, y) nhất trong bán kính 0,3 ô; -1 nếu chạm giữa ô. */
  function nearestEdge(x, y) {
    const n = game.n;
    let best = -1;
    let bd = 0.3;
    // Cạnh ngang nối (r, c-1)-(r, c): điểm giữa trên đường dọc x = c
    const c = Math.round(x);
    const r = Math.floor(y);
    if (c >= 1 && c <= n - 1 && r >= 0 && r < n && Math.abs(x - c) < bd) {
      bd = Math.abs(x - c);
      best = E.hEdge(n, r, c - 1);
    }
    const r2 = Math.round(y);
    const c2 = Math.floor(x);
    if (r2 >= 1 && r2 <= n - 1 && c2 >= 0 && c2 < n && Math.abs(y - r2) < bd) best = E.vEdge(n, r2 - 1, c2);
    return best;
  }

  const vid = (r, c) => r * game.n + c;
  const inBoard = (r, c) => r >= 0 && c >= 0 && r < game.n && c < game.n;

  /** Kéo từ ô a sang ô kề b: vẽ / xóa / đánh × theo kiểu của nét; lùi lại thì hoàn cạnh vừa đổi. */
  function strokeStep(a, b) {
    const e = E.edgeBetween(game.n, vid(a.r, a.c), vid(b.r, b.c));
    if (e < 0) return;
    const path = stroke.path;
    const last = path[path.length - 1];
    if (last && last.e === e) {
      path.pop();
      if (last.changed) stroke.changes.pop();
    } else {
      if (path.some((p) => p.e === e)) return;
      const cur = stroke.base.edges[e];
      if (!stroke.kind) stroke.kind = stroke.cross ? (cur === 2 ? 'unmark' : 'mark') : cur === 1 ? 'erase' : 'draw';
      let to = -1;
      if (stroke.kind === 'draw') to = 1;
      else if (stroke.kind === 'erase' && cur === 1) to = 0;
      else if (stroke.kind === 'mark' && cur === 0) to = 2;
      else if (stroke.kind === 'unmark' && cur === 2) to = 0;
      const changed = to >= 0 && to !== cur;
      path.push({ e, changed });
      if (changed) stroke.changes.push([e, to]);
      if (changed) kit.sfx(to === 1 ? 'place' : 'tick');
    }
    game = stroke.changes.length ? E.apply(stroke.base, stroke.changes) : stroke.base;
    if (solved()) {
      render();
      finish();
      return;
    }
    render();
  }

  /** Chạm lâu (cảm ứng / bút): đánh × lên cạnh dưới ngón tay. */
  function longPress() {
    const s = stroke;
    if (!s || s.dragging) return;
    const e = nearestEdge(s.p0.x, s.p0.y);
    s.done = true;
    if (e < 0) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch (err) { /* bỏ qua */ }
    }
    tapEdge(e, true);
  }

  board.addEventListener('pointerdown', (ev) => {
    if (!game || solved() || kit.modal.current() || stroke) return;
    if (ev.button !== 0 && ev.button !== 2) return;
    ev.preventDefault();
    board.classList.remove('kbd');
    try { board.setPointerCapture(ev.pointerId); } catch (e) { /* bỏ qua */ }
    const p = toGrid(ev);
    const n = game.n;
    stroke = {
      id: ev.pointerId,
      x0: ev.clientX,
      y0: ev.clientY,
      p0: p,
      cross: ev.button === 2 || crossMode,
      right: ev.button === 2,
      dragging: false,
      done: false,
      at: { r: Math.max(0, Math.min(n - 1, Math.floor(p.y))), c: Math.max(0, Math.min(n - 1, Math.floor(p.x))) },
      base: game,
      changes: [],
      path: [],
      kind: null,
      timer: ev.pointerType === 'mouse' ? 0 : setTimeout(longPress, 450),
    };
  });

  board.addEventListener('pointermove', (ev) => {
    if (!stroke || ev.pointerId !== stroke.id || stroke.done) return;
    const p = toGrid(ev);
    if (!stroke.dragging) {
      if (Math.hypot(ev.clientX - stroke.x0, ev.clientY - stroke.y0) < 8) return;
      stroke.dragging = true;
      clearTimeout(stroke.timer);
    }
    const r = Math.floor(p.y);
    const c = Math.floor(p.x);
    // Chỉ "bắt" ô khi ngón tay vào đủ sâu (tránh rung ở ranh giới); đi chéo thì chờ tới ô cùng hàng / cột
    const fx = p.x - c;
    const fy = p.y - r;
    if (!inBoard(r, c) || fx < 0.12 || fx > 0.88 || fy < 0.12 || fy > 0.88) return;
    const at = stroke.at;
    if ((r === at.r && c === at.c) || (r !== at.r && c !== at.c)) return;
    const dr = Math.sign(r - at.r);
    const dc = Math.sign(c - at.c);
    while (stroke && (stroke.at.r !== r || stroke.at.c !== c)) {
      const from = stroke.at;
      const to = { r: from.r + dr, c: from.c + dc };
      stroke.at = to;
      strokeStep(from, to);
    }
    if (stroke) cursor = { r, c };
  });

  function endStroke(ev) {
    if (!stroke || ev.pointerId !== stroke.id) return;
    const s = stroke;
    stroke = null;
    clearTimeout(s.timer);
    if (s.done) return;
    if (!s.dragging) {
      if (ev.type === 'pointercancel') return;
      const e = nearestEdge(s.p0.x, s.p0.y);
      if (e >= 0) tapEdge(e, s.cross);
      else if (inBoard(Math.floor(s.p0.y), Math.floor(s.p0.x))) {
        cursor = { r: Math.floor(s.p0.y), c: Math.floor(s.p0.x) };
        render();
      }
      return;
    }
    if (game !== s.base && !solved()) persist();
    render();
  }
  board.addEventListener('pointerup', endStroke);
  board.addEventListener('pointercancel', endStroke);
  board.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /* ---------------- Bàn phím ---------------- */

  const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

  function keyArrow(d, shift) {
    const to = { r: cursor.r + d[0], c: cursor.c + d[1] };
    const inside = inBoard(to.r, to.c);
    board.classList.add('kbd');
    if (solved()) {
      if (inside) cursor = to;
      render();
      return;
    }
    if (crossArmed) {
      // X + mũi tên: bật / tắt dấu × trên cạnh theo hướng đó, con trỏ đứng yên
      if (inside) tapEdge(E.edgeBetween(game.n, vid(cursor.r, cursor.c), vid(to.r, to.c)), true);
      if (xHeld) xUsed = true;
      else crossArmed = false;
      render();
      return;
    }
    if (!inside) return;
    if (shift) {
      // Shift + mũi tên: vẽ đường (hoặc xóa nếu đã có) rồi đi theo nó
      const e = E.edgeBetween(game.n, vid(cursor.r, cursor.c), vid(to.r, to.c));
      cursor = to;
      const next = E.apply(game, [[e, game.edges[e] === 1 ? 0 : 1]]);
      if (next !== game) {
        const toState = next.edges[e];
        commit(next, null);
        if (!solved()) kit.sfx(soundFor(toState, e));
      }
      render();
      return;
    }
    cursor = to;
    render();
  }

  document.addEventListener('keydown', (e) => {
    if (kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z') {
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (k === 'y') doRedo();
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (DIRS[e.key]) {
      keyArrow(DIRS[e.key], e.shiftKey);
      e.preventDefault();
      return;
    }
    if (k === 'x') {
      if (!e.repeat) {
        crossArmed = !(crossArmed && !xHeld);
        xHeld = true;
        xUsed = false;
        board.classList.add('kbd');
        render();
      }
    } else if (k === 'escape' && crossArmed) {
      crossArmed = false;
      render();
    } else if (k === 'z') doUndo();
    else if (k === 'y') doRedo();
    else if (k === 'h') doHint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() !== 'x') return;
    xHeld = false;
    if (xUsed) {
      crossArmed = false;
      xUsed = false;
      if (game) render();
    }
  });

  /* ---------------- Nút ---------------- */

  $('btn-undo').addEventListener('click', doUndo);
  $('btn-redo').addEventListener('click', doRedo);
  $('btn-hint').addEventListener('click', doHint);
  $('btn-cross').addEventListener('click', () => toggleCross());
  $('btn-new').addEventListener('click', requestNew);
  $('btn-mode').addEventListener('click', () => requestMode(nextMode(mode())));
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    if (mode() === 'daily') switchMode(sizeMode());
    else newBoard(mode());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    $('stats-daily').textContent = kit.i18n.fmtNumber(dailyStreak());
    MODES.forEach((m) => {
      $('stats-best-' + m + '-label').textContent = t('stats.best', { level: levelOf(m) });
      $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]);
    });
  });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', syncClock);

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  /** Cài đặt mode đi theo đề đang có (ghi thẳng, không qua onSetting). */
  function syncModeSetting() {
    const st = kit.settings.get();
    if (st.mode === mode() && (mode() === 'daily' || st.size === mode())) return;
    st.mode = mode();
    if (mode() !== 'daily') st.size = mode();
    kit.store.write(keys.settings, st);
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  // Đề ngày đã có kết quả (ví dụ ở tab khác) thì không mở lại
  const usable = restored && restored.moves > 0 && !E.isSolved(restored) && !(restored.mode === 'daily' && stats.daily[restored.date]);
  if (usable) {
    game = restored;
    syncModeSetting();
    clock.set(Number.isFinite(saved.elapsed) && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(mode(), true);
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    let m = kit.settings.get().mode;
    if (MODES.indexOf(m) < 0 || (m === 'daily' && dailyDone())) m = sizeMode();
    newBoard(m);
    syncModeSetting();
  }
  // Lần đầu mở: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
  syncClock();
})();
