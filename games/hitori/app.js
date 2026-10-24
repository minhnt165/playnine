/* =====================================================================
 * Hitori - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ đề ('5' | '7' | '9'), metric time_low
 *   - Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại / ẩn tab (bàn bị làm mờ lúc dừng), lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['5', '7', '9'];
  const kit = PNKit.init({ gameId: 'hitori', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: '5', errors: true }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const LONG_PRESS = 420; // ms nhấn giữ để khoanh tròn

  const sizeLabel = (m) => m + '×' + m;
  const isMode = (m) => MODES.indexOf(m) >= 0;

  const defaults = { played: 0, won: 0, streak: 0, best: { 5: null, 7: null, 9: null } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, defaults.best, stats.best || {});
  MODES.forEach((m) => { if (!(typeof stats.best[m] === 'number' && stats.best[m] > 0)) stats.best[m] = null; });
  ['played', 'won', 'streak'].forEach((k) => { if (!Number.isInteger(stats[k]) || stats[k] < 0) stats[k] = 0; });

  let game = null;
  let cursor = 0; // ô đang chọn bằng bàn phím
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'size', mode }
  let winTimer = 0;
  let cells = [];

  const mode = () => String(game.n);
  const won = () => !!game && E.isWon(game);
  /** Đề đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isWon(game);
  const showErrors = () => kit.settings.get().errors !== false;

  /** Đồng hồ trên HUD: m:ss */
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  /** Thời gian kỷ lục: m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    return m + ':' + String(s).padStart(2, '0') + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới ô khi đổi cỡ; ô là nút, chỉ ô con trỏ nhận Tab (roving tabindex). */
  function buildBoard() {
    const board = $('board');
    const n = game.n;
    board.style.setProperty('--n', n);
    board.dataset.size = n;
    board.textContent = '';
    cells = [];
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.i = i;
      b.style.setProperty('--d', Math.floor(i / n) + (i % n));
      const num = document.createElement('span');
      num.className = 'num';
      b.appendChild(num);
      board.appendChild(b);
      cells.push(b);
    }
  }

  function render() {
    const n = game.n;
    if (cells.length !== n * n || $('board').dataset.size !== String(n)) buildBoard();
    const v = showErrors() && !won() ? E.violations(game) : null;
    const flag = (list) => {
      const s = new Uint8Array(n * n);
      if (list) list.forEach((i) => { s[i] = 1; });
      return s;
    };
    const bad = flag(v && v.adjacent.concat(v.clash));
    const iso = flag(v && v.isolated);
    const dup = flag(v && v.dup);
    const must = flag(v && v.must);
    cells.forEach((b, i) => {
      const m = game.marks[i];
      b.firstChild.textContent = game.grid[i];
      b.classList.toggle('black', m === E.BLACK);
      b.classList.toggle('circle', m === E.CIRCLE);
      b.classList.toggle('bad', !!bad[i]);
      b.classList.toggle('iso', !!iso[i]);
      b.classList.toggle('dup', !!dup[i] && !bad[i] && !must[i]);
      b.classList.toggle('must', !!must[i]);
      b.tabIndex = i === cursor ? 0 : -1;
      let label = t('cell.label', { r: Math.floor(i / n) + 1, c: (i % n) + 1, v: game.grid[i] });
      if (m === E.BLACK) label += ', ' + t('cell.black');
      if (m === E.CIRCLE) label += ', ' + t('cell.circle');
      if (bad[i] || iso[i]) label += ', ' + t('cell.error');
      b.setAttribute('aria-label', label);
    });
    const board = $('board');
    board.classList.toggle('solved', won());
    board.setAttribute('aria-label', t('board.label', { size: sizeLabel(mode()) }));
    $('btn-undo').disabled = !E.canUndo(game);
    $('btn-redo').disabled = !E.canRedo(game);
    $('btn-hint').disabled = won();
    const best = stats.best[mode()];
    $('best').textContent = best == null ? '–' : fmt(best);
    tick();
  }

  /** Cập nhật đồng hồ trên HUD; chạy theo khung hình khi đồng hồ đang chạy. */
  let raf = 0;
  let shown = '';
  function tick() {
    cancelAnimationFrame(raf);
    const s = fmtClock(game ? clock.elapsed() : 0);
    if (s !== shown) $('time').textContent = shown = s;
    if (clock.running) raf = requestAnimationFrame(tick);
  }

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Đề mới: ô hiện dần theo đường chéo. */
  function deal() {
    if (calm()) return;
    replay($('board'), 'deal');
  }

  /**
   * Đồng hồ chỉ chạy khi đề chưa xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn để không nhìn đề "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !won();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    $('app').classList.toggle('paused', playing && open);
    tick();
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? mode() : kit.settings.get().size;
    const best = stats.best[m];
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' ' + sizeLabel(m) });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { size: sizeLabel(m), time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? { title: t('app.name') + ' ' + sizeLabel(m), detail: t('summary.resume', { size: sizeLabel(m), time: fmtClock(clock.elapsed()) }), pct: E.progress(game) }
        : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function newBoard(m) {
    clearTimeout(winTimer);
    const n = Number(m);
    game = E.newGame({ size: n, seed: Math.floor(Math.random() * 4294967296) });
    cursor = Math.min(cursor, n * n - 1);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    deal();
    syncClock();
    writeSummary();
  }

  /** Số lỗi chắc chắn (đen kề nhau, ô trắng bị tách rời, hai ô khoanh tròn trùng số) để phát tiếng báo lỗi khi vừa tạo thêm lỗi. */
  function hardErrors(g) {
    const v = E.violations(g);
    return v.adjacent.length + v.clash.length + v.isolated.length;
  }

  /** Áp một nước (chạm, hoàn tác, gợi ý…): vẽ lại, lưu, kiểm tra thắng. */
  function apply(next, sound, cell) {
    if (!game || next === game || won()) return false;
    const before = showErrors() ? hardErrors(game) : 0;
    game = next;
    if (cell != null) cursor = cell;
    render();
    if (cell != null && !calm()) replay(cells[cell], 'pop');
    if (E.isWon(game)) {
      finish();
      return true;
    }
    kit.sfx(showErrors() && hardErrors(game) > before ? 'error' : sound);
    persist();
    return true;
  }

  const SOUND = ['tap', 'place', 'pop']; // theo dấu mới: xóa, tô đen, khoanh tròn

  function press(i) {
    if (!game || won() || kit.modal.current()) return;
    const next = E.tap(game, i);
    apply(next, SOUND[next.marks[i]], i);
  }

  function toggleMark(i, mark) {
    if (!game || won() || kit.modal.current()) return;
    const next = E.toggle(game, i, mark);
    apply(next, SOUND[next.marks[i]], i);
  }

  function clearCell(i) {
    if (!game || won() || kit.modal.current()) return;
    apply(E.setMark(game, i, E.NONE), 'tap', i);
  }

  function undo() {
    if (!game || kit.modal.current() || !E.canUndo(game)) return;
    const step = game.history[game.history.length - 1];
    apply(E.undo(game), 'move', step.i);
  }

  function redo() {
    if (!game || kit.modal.current() || !E.canRedo(game)) return;
    const step = game.future[game.future.length - 1];
    apply(E.redo(game), 'move', step.i);
  }

  function hint() {
    if (!game || won() || kit.modal.current()) return;
    const h = E.hint(game);
    if (!h) {
      kit.toast(t('toast.nohint'));
      return;
    }
    const first = game.hints === 0;
    apply(h.game, 'flip', h.cell);
    if (!won()) {
      cells[h.cell].focus();
      kit.toast(first ? t('toast.hintFirst') : t('toast.hint', { r: Math.floor(h.cell / game.n) + 1, c: (h.cell % game.n) + 1 }), first ? 2600 : 1800);
    }
    if (!calm()) replay(cells[h.cell], 'hinted');
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const assisted = game.hints > 0;
    const isBest = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (isBest) stats.best[m] = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    render();
    $('app').classList.remove('paused');

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest;
    badge.textContent = t('win.best', { size: sizeLabel(m) });
    const note = assisted
      ? t('win.assisted', { n: game.hints })
      : stats.best[m] != null && !isBest ? t('win.noteBest', { size: sizeLabel(m), time: fmt(stats.best[m]) }) : '';
    $('win-note').textContent = note;
    $('win-note').hidden = !note;
    // Cho người chơi kịp thấy bàn đã giải rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 0 : 750);
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'size' ? t('confirm.size', { size: sizeLabel(p.mode) }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'size') switchSize(p.mode);
    else newBoard(mode());
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newBoard(mode());
    }
  }

  /** Đổi cỡ: chia đề mới cỡ đó trước, rồi lưu cài đặt (onSetting gặp cỡ đã khớp nên không làm gì). */
  function switchSize(m) {
    newBoard(m);
    kit.settings.set({ size: m });
  }

  /** Yêu cầu đổi cỡ (thanh chọn cỡ). Đề đang dở thì giữ lựa chọn cũ và hỏi trước. */
  function requestSize(m) {
    if (!isMode(m) || !game || m === mode()) return;
    if (inPlay()) {
      kit.settings.set({ size: mode() });
      askConfirm({ kind: 'size', mode: m });
    } else {
      switchSize(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'size') requestSize(value);
    else if (key === 'errors' && game) render();
  }

  /* ---------------- Sự kiện: chuột / chạm ---------------- */

  const board = $('board');
  let press0 = null; // { id, i, x, y, timer, type } của lần nhấn đang giữ
  let swallowClick = false;

  board.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.cell');
    swallowClick = false;
    if (!b || e.button !== 0) return;
    if (press0) clearTimeout(press0.timer);
    press0 = { id: e.pointerId, i: Number(b.dataset.i), x: e.clientX, y: e.clientY, type: e.pointerType, timer: 0 };
    if (e.pointerType !== 'mouse') {
      const p = press0;
      p.timer = setTimeout(() => {
        if (press0 !== p) return;
        swallowClick = true; // nhả tay sau khi giữ không tính là chạm
        press0 = null;
        toggleMark(p.i, E.CIRCLE);
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (err) { /* bỏ qua */ }
      }, LONG_PRESS);
    }
  });
  board.addEventListener('pointermove', (e) => {
    if (press0 && press0.id === e.pointerId && Math.hypot(e.clientX - press0.x, e.clientY - press0.y) > 10) {
      clearTimeout(press0.timer);
      press0 = null;
    }
  });
  ['pointerup', 'pointercancel'].forEach((ev) => board.addEventListener(ev, () => {
    if (press0) clearTimeout(press0.timer);
    press0 = null;
  }));
  board.addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (!b) return;
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    press(Number(b.dataset.i));
  });
  // Chuột phải: khoanh tròn. Trên màn hình cảm ứng, nhấn giữ đã lo việc này nên chỉ chặn menu.
  let lastPointer = 'mouse';
  board.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);
  board.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.cell');
    e.preventDefault();
    if (b && lastPointer === 'mouse') toggleMark(Number(b.dataset.i), E.CIRCLE);
  });

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-hint').addEventListener('click', hint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(mode());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    MODES.forEach((m) => { $('stats-best' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
  });

  /* ---------------- Sự kiện: bàn phím ---------------- */

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
      return;
    }
    const target = e.target;
    const onCell = !!(target.closest && target.closest('.cell'));
    const onOther = !onCell && target.closest && target.closest('button, input, a[href]');
    if (ARROWS[k]) {
      if (target.closest && target.closest('.segmented')) return; // mũi tên trong thanh chọn cỡ do kit xử lý
      const n = game.n;
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + ARROWS[k][0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + ARROWS[k][1]));
      cursor = r * n + c;
      cells.forEach((b, i) => { b.tabIndex = i === cursor ? 0 : -1; });
      cells[cursor].focus();
    } else if (k === ' ' || k === 'enter') {
      if (onOther) return; // để trình duyệt bấm nút đang focus
      if (!onCell) cells[cursor].focus();
      press(cursor);
    } else if (k === 'x' || k === 'b' || k === '1') toggleMark(cursor, E.BLACK);
    else if (k === 'o' || k === 'c' || k === '2') toggleMark(cursor, E.CIRCLE);
    else if (k === 'backspace' || k === 'delete' || k === '0') clearCell(cursor);
    else if (k === 'z' || k === 'u') undo();
    else if (k === 'y' || k === 'r') redo();
    else if (k === 'h') hint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Space trên nút ô: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  board.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
  board.addEventListener('focusin', (e) => {
    const b = e.target.closest('.cell');
    if (b) cursor = Number(b.dataset.i);
  });

  /* ---------------- Đồng hồ theo hộp thoại / tab ---------------- */

  const observer = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncClock(); });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  /** Cài đặt cỡ đi theo đề đang có (ghi thẳng, không qua onSetting). */
  function syncSizeSetting() {
    if (kit.settings.get().size === mode()) return;
    kit.settings.get().size = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    syncSizeSetting();
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(mode(), true);
    render();
    syncClock();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().size;
    newBoard(isMode(m) ? m : '5');
    syncSizeSetting();
  }

  // Lần đầu mở game: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
