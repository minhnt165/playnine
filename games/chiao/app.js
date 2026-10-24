/* =====================================================================
 * Chia Ô - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ bàn ('s' 7x7, 'm' 10x10, 'l' 13x13), metric time_low
 *   - Vẽ: kéo từ góc này sang góc kia (chuột / chạm), hoặc phím mũi tên + Enter đặt góc, Enter lần nữa để vẽ
 *   - Chạm vào hình đã vẽ để xóa; hoàn tác / làm lại không giới hạn; gợi ý đặt giúp một hình đúng (assisted)
 *   - Đồng hồ chạy từ khi đề hiện ra, dừng khi tab ẩn hoặc mở hộp thoại (lúc đó bàn bị làm mờ)
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted: đã dùng gợi ý })
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = E.MODES;
  const kit = PNKit.init({ gameId: 'chiao', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: 's', errors: true }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const sizeLabel = (m) => E.SIZES[m] + 'x' + E.SIZES[m];
  const nextMode = (m) => MODES[(MODES.indexOf(m) + 1) % MODES.length];

  const defaults = { played: 0, won: 0, streak: 0, hints: 0, best: { s: null, m: null, l: null } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, defaults.best, stats.best || {});
  MODES.forEach((m) => { if (!(Number.isFinite(stats.best[m]) && stats.best[m] > 0)) stats.best[m] = null; });

  let game = null;
  let palette = []; // màu theo chỉ số số (clue) của đề hiện tại
  let cursor = { r: 0, c: 0 }; // ô đang chọn bằng bàn phím
  let anchor = null; // góc thứ nhất khi vẽ bằng bàn phím
  let drag = null; // { id, a, b, moved } khi đang kéo
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'size', mode }
  let winTimer = 0;
  let lastAdded = null; // hình vừa vẽ (chạy hiệu ứng nảy)
  let cellEls = [];

  /** Đề đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);
  const errorsOn = () => kit.settings.get().errors !== false;

  /** m:ss (thêm giờ nếu cần) */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }
  const pctFilled = () => Math.floor((E.coverage(game) * 100) / (game.size * game.size));

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới ô khi đổi đề. */
  function buildBoard() {
    const n = game.size;
    const board = $('board');
    board.style.setProperty('--n', n);
    const cells = $('cells');
    cells.textContent = '';
    cellEls = [];
    const clueAt = new Map(game.clues.map((q, k) => [q.r * n + q.c, k]));
    for (let i = 0; i < n * n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      if (clueAt.has(i)) {
        const s = document.createElement('span');
        s.className = 'num';
        s.textContent = game.clues[clueAt.get(i)].n;
        d.appendChild(s);
      }
      cells.appendChild(d);
      cellEls.push(d);
    }
    palette = E.colors(game, 8);
    board.dataset.key = game.seed + ':' + game.mode;
  }

  function render() {
    const n = game.size;
    const board = $('board');
    if (board.dataset.key !== game.seed + ':' + game.mode || cellEls.length !== n * n) buildBoard();
    const errors = errorsOn();
    const solved = E.isSolved(game);
    // Hình đã vẽ: hợp lệ thì tô màu của số trong hình; sai luật thì đỏ (báo lỗi bật) hoặc màu trung tính
    const layer = $('rects');
    layer.textContent = '';
    const own = new Array(n * n).fill(-1);
    const bad = new Array(n * n).fill(false);
    game.rects.forEach((x, i) => {
      const ks = E.cluesIn(game, x);
      const good = E.rectOk(game, x);
      const el = document.createElement('div');
      let cls = 'rect ';
      if (good) cls += 'f' + palette[ks[0]];
      else if (errors) cls += 'bad';
      else cls += ks.length === 1 ? 'f' + palette[ks[0]] : 'plain';
      el.className = cls;
      el.style.cssText = '--r:' + x.r + ';--c:' + x.c + ';--h:' + x.h + ';--w:' + x.w + ';--i:' + (x.r + x.c);
      if (lastAdded && x.r === lastAdded.r && x.c === lastAdded.c && x.h === lastAdded.h && x.w === lastAdded.w && !calm()) el.classList.add('pop');
      layer.appendChild(el);
      for (let r = x.r; r < x.r + x.h; r++) {
        for (let c = x.c; c < x.c + x.w; c++) {
          own[r * n + c] = i;
          bad[r * n + c] = !good && errors;
        }
      }
    });
    lastAdded = null;
    cellEls.forEach((d, i) => {
      d.classList.toggle('covered', own[i] >= 0);
      d.classList.toggle('bad', bad[i]);
    });
    board.classList.toggle('solved', solved);
    board.setAttribute('aria-label', t('board.label', { size: sizeLabel(game.mode), done: E.coverage(game), total: n * n }));
    renderCursor();

    $('filled').textContent = pctFilled() + '%';
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
    $('btn-undo').disabled = !E.canUndo(game);
    $('btn-redo').disabled = !E.canRedo(game);
    $('btn-clear').disabled = solved || game.rects.length === 0;
    $('btn-hint').disabled = solved;
    const m = game.mode;
    $('btn-size').textContent = sizeLabel(m);
    $('btn-size').setAttribute('aria-label', t('size.badge', { size: sizeLabel(m), next: sizeLabel(nextMode(m)) }));
    $('btn-size').title = t('size.name');
    tick();
  }

  /** Đồng hồ trên HUD: vẽ lại mỗi khung hình khi đang chạy. */
  let raf = 0;
  function tick() {
    $('time').textContent = fmt(clock.elapsed());
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(tick);
  }

  function renderCursor() {
    const cur = $('cursor');
    cur.style.setProperty('--cr', cursor.r);
    cur.style.setProperty('--cc', cursor.c);
  }

  /** Khung xem trước: diện tích, đúng / sai (khi báo lỗi bật). */
  function showPreview(a, b) {
    const pv = $('preview');
    if (!a) {
      pv.hidden = true;
      return;
    }
    const x = E.rectFrom(a, b);
    pv.hidden = false;
    pv.style.cssText = '--r:' + x.r + ';--c:' + x.c + ';--h:' + x.h + ';--w:' + x.w;
    const st = E.rectStatus(game, x);
    pv.classList.toggle('good', errorsOn() && st === 'ok');
    pv.classList.toggle('bad', errorsOn() && st !== 'ok');
    pv.classList.toggle('below', x.r === 0);
    const lab = $('preview-label');
    lab.textContent = x.h * x.w;
    const dims = document.createElement('small');
    dims.textContent = x.h + '×' + x.w;
    lab.appendChild(dims);
  }

  /** Mô tả ô đang chọn cho trình đọc màn hình. */
  function announce(text) {
    $('sr-cell').textContent = text;
  }
  function describeCursor() {
    const { r, c } = cursor;
    const parts = [t('cell.pos', { r: r + 1, c: c + 1 })];
    const q = game.clues.find((x) => x.r === r && x.c === c);
    if (q) parts.push(t('cell.clue', { n: q.n }));
    const i = E.rectAt(game, r, c);
    if (i >= 0) {
      const x = game.rects[i];
      parts.push(t(E.rectOk(game, x) || !errorsOn() ? 'cell.inRect' : 'cell.inBad', { h: x.h, w: x.w }));
    } else parts.push(t('cell.empty'));
    announce(parts.join(', '));
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? game.mode : kit.settings.get().size;
    const bests = MODES.filter((k) => stats.best[k] != null);
    const shown = bests.indexOf(m) >= 0 ? m : bests[bests.length - 1];
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: shown ? t('summary.note', { time: fmt(stats.best[shown]), size: sizeLabel(shown) }) : t('summary.none'),
      stats: bests.slice(-2).map((k) => ({ value: fmt(stats.best[k]), label: sizeLabel(k) })),
      resume: inPlay()
        ? { title: t('app.name') + ' ' + sizeLabel(m), detail: t('summary.resume', { pct: pctFilled() }), pct: pctFilled() / 100 }
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
    game = E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    cursor = { r: 0, c: 0 };
    anchor = null;
    drag = null;
    showPreview(null);
    clock.reset();
    // Đổi cỡ trong Cài đặt: hộp thoại còn mở thì đợi đóng rồi mới chạy đồng hồ
    if (kit.modal.current()) heldByModal = true;
    else clock.start();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    writeSummary();
  }

  /** Áp một ván mới sau nước đi: âm thanh, vẽ, lưu, kiểm tra thắng. */
  function commit(next, sound) {
    if (next === game) return false;
    game = next;
    if (sound) kit.sfx(sound);
    render();
    if (E.isSolved(game)) finish();
    else persist();
    return true;
  }

  function drawRect(x) {
    if (!game || E.isSolved(game)) return;
    const next = E.draw(game, x);
    if (next === game) return;
    lastAdded = x;
    const okRect = E.rectOk(game, x);
    commit(next, okRect || !errorsOn() ? 'place' : 'error');
  }

  /** Chạm một ô (không kéo): xóa hình ở đó; ô trống có số 1 thì vẽ hình 1x1. */
  function tapCell(cell) {
    if (!game || E.isSolved(game)) return;
    if (E.rectAt(game, cell.r, cell.c) >= 0) {
      commit(E.erase(game, cell.r, cell.c), 'pop');
      return;
    }
    const q = game.clues.find((x) => x.r === cell.r && x.c === cell.c);
    if (q && q.n === 1) drawRect({ r: cell.r, c: cell.c, h: 1, w: 1 });
  }

  function doUndo() {
    if (!game) return;
    if (!E.canUndo(game)) {
      if (!E.isSolved(game) && game.moves > 0) kit.toast(t('toast.nothing'));
      return;
    }
    commit(E.undo(game), 'move');
  }
  function doRedo() {
    if (game && E.canRedo(game)) commit(E.redo(game), 'move');
  }
  function doClear() {
    if (!game || !game.rects.length || E.isSolved(game)) return;
    if (commit(E.clear(game), 'clear')) kit.toast(t('toast.cleared'));
  }
  function doHint() {
    if (!game || E.isSolved(game) || kit.modal.current()) return;
    const first = game.hints === 0;
    const next = E.hint(game);
    if (next === game) return;
    stats.hints++;
    saveStats();
    lastAdded = next.rects[next.rects.length - 1];
    if (commit(next, 'coin') && first && !E.isSolved(game)) kit.toast(t('toast.hint'), 2600);
  }

  function finish() {
    clock.pause();
    tick();
    anchor = null;
    drag = null;
    showPreview(null);
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const assisted = game.hints > 0;
    const best = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (best) stats.best[m] = ms;
    saveStats();
    persist();
    render();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    $('win-time').textContent = fmt(ms);
    $('win-size').textContent = sizeLabel(m);
    $('win-best').hidden = !best;
    $('win-assisted').hidden = !assisted;
    $('win-assisted').textContent = t('win.assisted', { n: game.hints });
    // Cho người chơi kịp thấy cả bàn sáng lên rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (game && E.isSolved(game)) kit.modal.open('modal-win');
    }, calm() ? 0 : 750);
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: game.mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
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
    else newBoard(game.mode);
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newBoard(game.mode);
    }
  }

  /** Đổi cỡ: chia đề mới cỡ đó trước, rồi lưu cài đặt (onSetting gặp cỡ đã khớp nên không làm gì). */
  function switchSize(m) {
    newBoard(m);
    kit.settings.set({ size: m });
  }

  /** Yêu cầu đổi cỡ (Cài đặt hoặc huy hiệu cỡ bàn). Đề đang dở thì giữ cài đặt cũ và hỏi trước. */
  function requestSize(m) {
    if (MODES.indexOf(m) < 0 || !game || m === game.mode) return;
    if (inPlay()) {
      kit.settings.set({ size: game.mode });
      askConfirm({ kind: 'size', mode: m });
    } else {
      switchSize(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'size') requestSize(value);
    else if (key === 'errors' && game) render();
  }

  /* ---------------- Đồng hồ dừng khi mở hộp thoại ---------------- */

  let heldByModal = false;
  function syncModalPause() {
    const open = !!kit.modal.current();
    const board = $('board');
    if (open && clock.running) {
      clock.pause();
      heldByModal = true;
    } else if (!open && heldByModal) {
      heldByModal = false;
      if (game && !E.isSolved(game) && !document.hidden) clock.resume();
    }
    board.classList.toggle('veiled', open && !!game && !E.isSolved(game));
    tick();
  }
  new MutationObserver(syncModalPause).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  /* ---------------- Chuột / chạm: kéo để vẽ ---------------- */

  /** Ô dưới con trỏ; clamp = kẹp vào lưới khi kéo ra ngoài. */
  function cellAt(e, clamp) {
    const box = $('cells').getBoundingClientRect();
    const n = game.size;
    let c = Math.floor(((e.clientX - box.left) / box.width) * n);
    let r = Math.floor(((e.clientY - box.top) / box.height) * n);
    if (!clamp && (r < 0 || c < 0 || r >= n || c >= n)) return null;
    r = Math.max(0, Math.min(n - 1, r));
    c = Math.max(0, Math.min(n - 1, c));
    return { r, c };
  }
  const sameCell = (a, b) => a.r === b.r && a.c === b.c;

  const board = $('board');
  board.addEventListener('pointerdown', (e) => {
    if (!game || E.isSolved(game) || kit.modal.current() || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = cellAt(e, false);
    if (!cell) return;
    e.preventDefault();
    board.focus({ preventScroll: true });
    board.classList.remove('kbd');
    board.classList.add('ptr');
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    anchor = null;
    drag = { id: e.pointerId, a: cell, b: cell, moved: false };
    cursor = cell;
    renderCursor();
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const cell = cellAt(e, true);
    if (sameCell(cell, drag.b)) return;
    drag.b = cell;
    if (!sameCell(cell, drag.a)) drag.moved = true;
    if (drag.moved) {
      showPreview(drag.a, drag.b);
      kit.sfx('tick', { volume: 0.35 });
    }
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    showPreview(null);
    cursor = d.b;
    renderCursor();
    if (cancel) return;
    if (!d.moved) tapCell(d.a);
    else if (!sameCell(d.a, d.b)) drawRect(E.rectFrom(d.a, d.b));
  }
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));
  board.addEventListener('lostpointercapture', (e) => endDrag(e, true));
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  function moveCursor(dr, dc) {
    const n = game.size;
    cursor = { r: Math.max(0, Math.min(n - 1, cursor.r + dr)), c: Math.max(0, Math.min(n - 1, cursor.c + dc)) };
    renderCursor();
    if (anchor) showPreview(anchor, cursor);
    describeCursor();
  }
  /** Enter / Space: đặt góc thứ nhất, lần sau vẽ hình (góc trùng nhau = chạm ô). */
  function pressCell() {
    if (E.isSolved(game)) return;
    if (!anchor) {
      anchor = cursor;
      showPreview(anchor, cursor);
      announce(t('cell.anchor', { r: cursor.r + 1, c: cursor.c + 1 }));
      kit.sfx('tick');
      return;
    }
    const a = anchor;
    anchor = null;
    showPreview(null);
    if (sameCell(a, cursor)) tapCell(cursor);
    else drawRect(E.rectFrom(a, cursor));
    describeCursor();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || ARROWS[e.key.toLowerCase()]) board.classList.remove('ptr');
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey;
    const onBoard = e.target === board;
    const onOther = !onBoard && e.target.closest && e.target.closest('button, input, a[href]');
    if (mod) {
      // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
      if (k === 'z' && !e.shiftKey) doUndo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) doRedo();
      else return;
      e.preventDefault();
      return;
    }
    if (ARROWS[k]) {
      board.classList.add('kbd');
      if (!onBoard) board.focus({ preventScroll: true });
      moveCursor(ARROWS[k][0], ARROWS[k][1]);
    } else if (k === ' ' || k === 'enter') {
      // Nút khác đang focus (Hoàn tác, Gợi ý…) thì để trình duyệt bấm nút đó
      if (onOther) return;
      board.classList.add('kbd');
      if (!onBoard) board.focus({ preventScroll: true });
      pressCell();
    } else if (k === 'escape') {
      if (!anchor) return;
      anchor = null;
      showPreview(null);
    } else if (k === 'delete' || k === 'backspace' || k === 'x') {
      if (E.rectAt(game, cursor.r, cursor.c) >= 0) commit(E.erase(game, cursor.r, cursor.c), 'pop');
    } else if (k === 'z') doUndo();
    else if (k === 'y') doRedo();
    else if (k === 'h') doHint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  board.addEventListener('blur', () => {
    if (anchor) {
      anchor = null;
      showPreview(null);
    }
  });

  /* ---------------- Nút ---------------- */

  $('btn-undo').addEventListener('click', doUndo);
  $('btn-redo').addEventListener('click', doRedo);
  $('btn-clear').addEventListener('click', doClear);
  $('btn-hint').addEventListener('click', doHint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-size').addEventListener('click', () => requestSize(nextMode(game.mode)));
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(game.mode);
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    MODES.forEach((m) => {
      $('stats-best-' + m + '-label').textContent = t('stats.best', { size: sizeLabel(m) });
      $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]);
    });
  });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  /** Cài đặt cỡ bàn đi theo đề đang có (ghi thẳng, không qua onSetting). */
  function syncSizeSetting() {
    if (kit.settings.get().size === game.mode) return;
    kit.settings.get().size = game.mode;
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isSolved(restored)) {
    game = restored;
    syncSizeSetting();
    clock.set(saved.elapsed);
    clock.start();
    kit.sdk.start(game.mode, true);
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().size;
    newBoard(MODES.indexOf(m) >= 0 ? m : 's');
    syncSizeSetting();
  }
})();
