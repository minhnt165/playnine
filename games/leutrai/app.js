/* =====================================================================
 * Lều Trại - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mode = cỡ bàn: 's' 6×6 (Dễ), 'm' 8×8 (Vừa), 'l' 12×12 (Khó); metric time_low
 *   - Chạm ô: trống → lều → cỏ → trống; kéo qua nhiều ô để tô cỏ (bắt đầu từ ô cỏ thì xóa cỏ); chạm số đã đủ để tô cỏ cả hàng / cột
 *   - Đồng hồ chạy từ lúc chia đề, dừng khi tab ẩn hoặc mở hộp thoại (bàn bị làm mờ để không "nghĩ trộm")
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - giải xong: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ đề (ván mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = E.MODES;
  const kit = PNKit.init({ gameId: 'leutrai', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: 's' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const sizeText = (m) => E.SIZES[m] + '×' + E.SIZES[m];
  const nextMode = (m) => MODES[(MODES.indexOf(m) + 1) % MODES.length];

  const defaults = { played: 0, won: 0, streak: 0, best: { s: null, m: null, l: null } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, defaults.best, stats.best || {});
  MODES.forEach((m) => { if (!(Number.isFinite(stats.best[m]) && stats.best[m] > 0)) stats.best[m] = null; });
  ['played', 'won', 'streak'].forEach((k) => { if (!Number.isInteger(stats[k]) || stats[k] < 0) stats[k] = 0; });

  const board = $('board');
  let game = null;
  let preview = null; // ván tạm trong lúc đang kéo tô cỏ (chưa thành nước đi)
  let stroke = null; // nét chạm / kéo đang diễn ra
  let cursor = 0; // ô đang chọn bằng bàn phím
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'size', mode }
  let winTimer = 0;
  let cells = [];
  let rowClues = [];
  let colClues = [];

  const view = () => preview || game;
  const solved = () => !!game && E.isSolved(game);
  /** Ván đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);
  /** Báo lỗi: người chơi đã chọn thì theo đó, chưa chọn thì chỉ bật ở mức Dễ. */
  function showErrors() {
    const v = kit.settings.get().errors;
    return typeof v === 'boolean' ? v : !!game && game.mode === 's';
  }

  /** m:ss (h:mm:ss nếu quá một giờ) */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* ---------------- Vẽ ---------------- */

  /** Dựng lưới khi đổi đề: góc trống, hàng số cột, rồi mỗi hàng gồm số hàng + n ô. Chỉ ô con trỏ nhận Tab. */
  function buildBoard() {
    const n = game.n;
    board.style.setProperty('--n', n);
    board.dataset.size = n;
    board.textContent = '';
    cells = [];
    rowClues = [];
    colClues = [];
    const corner = document.createElement('div');
    corner.className = 'corner';
    board.appendChild(corner);
    const clue = (kind, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clue ' + kind;
      b.dataset.kind = kind;
      b.dataset.k = k;
      b.tabIndex = -1;
      board.appendChild(b);
      return b;
    };
    for (let c = 0; c < n; c++) colClues.push(clue('col', c));
    for (let r = 0; r < n; r++) {
      rowClues.push(clue('row', r));
      for (let c = 0; c < n; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell';
        b.dataset.i = r * n + c;
        b.setAttribute('role', 'gridcell');
        b.style.setProperty('--d', r + c);
        board.appendChild(b);
        cells.push(b);
      }
    }
  }

  function render() {
    if (!game) return;
    if (cells.length !== game.n * game.n) buildBoard();
    const g = view();
    const n = g.n;
    const errOn = showErrors();
    const errs = errOn ? new Set(E.errors(g)) : new Set();
    cells.forEach((b, i) => {
      const tree = g.trees[i] === 1;
      const m = g.marks[i];
      b.classList.toggle('tree', tree);
      b.classList.toggle('tent', m === E.TENT);
      b.classList.toggle('grass', m === E.GRASS);
      b.classList.toggle('err', errs.has(i));
      b.tabIndex = i === cursor ? 0 : -1;
      const key = tree ? 'cell.tree' : m === E.TENT ? 'cell.tent' : m === E.GRASS ? 'cell.grass' : 'cell.empty';
      b.setAttribute('aria-label', t(key, { r: Math.floor(i / n) + 1, c: (i % n) + 1 }) + (errs.has(i) ? t('cell.error') : ''));
    });
    const st = E.lineStats(g);
    const paint = (el, want, have, free, label) => {
      const s = E.lineState(want, have, free);
      el.textContent = want;
      el.classList.toggle('done', s === 'done');
      el.classList.toggle('over', s === 'over');
      el.classList.toggle('short', s === 'short' && errOn);
      el.setAttribute('aria-label', label);
    };
    rowClues.forEach((el, k) => paint(el, g.rows[k], st.rowTents[k], st.rowFree[k], t('clue.row', { k: k + 1, want: g.rows[k], have: st.rowTents[k] })));
    colClues.forEach((el, k) => paint(el, g.cols[k], st.colTents[k], st.colFree[k], t('clue.col', { k: k + 1, want: g.cols[k], have: st.colTents[k] })));
    const total = E.treeCount(g);
    const placed = E.tentCount(g);
    board.classList.toggle('solved', E.isSolved(g));
    board.setAttribute('aria-label', t('board.label', { size: sizeText(g.mode), n: placed, total }));
    $('tents').textContent = placed + '/' + total;
    $('tents').classList.toggle('over', placed > total);
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
    renderTime();
    const done = solved();
    $('btn-undo').disabled = done || !game.past.length;
    $('btn-redo').disabled = done || !game.future.length;
    $('btn-hint').disabled = done;
    $('size-label').textContent = t('mode.' + game.mode);
    $('size-value').textContent = sizeText(game.mode);
    $('btn-size').setAttribute('aria-label', t('size.badge', { size: sizeText(game.mode), next: sizeText(nextMode(game.mode)) }));
    $('btn-size').title = t('size.name');
    $('sw-errors').checked = errOn;
  }

  function renderTime() {
    $('time').textContent = fmt(clock.elapsed());
  }
  setInterval(() => { if (clock.running) renderTime(); }, 250);

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Đề mới: ô hiện dần theo đường chéo. */
  function deal() {
    if (calm()) return;
    replay(board, 'deal');
  }

  /* ---------------- Đồng hồ ---------------- */

  /** Đồng hồ chỉ chạy khi đang giải, trang hiện và không mở hộp thoại; mở hộp thoại (trừ hộp thắng) thì làm mờ bàn. */
  function syncClock() {
    const open = kit.modal.current();
    const live = !!game && !E.isSolved(game);
    if (live && !open && !document.hidden) clock.resume();
    else clock.pause();
    $('app').classList.toggle('paused', live && !!open && open.id !== 'modal-win');
    renderTime();
  }
  const watcher = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', syncClock);

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? game.mode : kit.settings.get().size;
    const best = stats.best[m];
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { size: sizeText(m), time: fmt(best) }),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(best == null ? [] : [{ value: fmt(best), label: t('stats.best', { size: sizeText(m) }) }])
        : [],
      resume: inPlay()
        ? {
          title: t('app.name') + ' ' + sizeText(m),
          detail: t('summary.resume', { n: Math.min(E.tentCount(game), E.treeCount(game)), total: E.treeCount(game) }),
          pct: Math.max(0, Math.min(1, E.tentCount(game) / E.treeCount(game))),
        }
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

  function newPuzzle(m) {
    clearTimeout(winTimer);
    kit.modal.close('modal-win');
    stroke = null;
    preview = null;
    game = E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    cursor = Math.min(cursor, game.n * game.n - 1);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    buildBoard();
    render();
    deal();
    syncClock();
    writeSummary();
  }

  /**
   * Nhận ván mới sau một nước (chạm, tô, hoàn tác, gợi ý). Trả false nếu không có gì đổi.
   * sound: tên âm thanh khi chưa thắng.
   */
  function commit(next, sound) {
    if (next === game) return false;
    cells.forEach((b) => b.classList.remove('hinted'));
    const before = showErrors() ? E.errors(game).length : 0;
    game = next;
    render();
    if (E.isSolved(game)) {
      finish();
      return true;
    }
    if (showErrors() && E.errors(game).length > before) kit.sfx('error');
    else if (sound) kit.sfx(sound);
    persist();
    return true;
  }

  const canPlay = () => !!game && !E.isSolved(game) && !kit.modal.current();

  /** Chạm một ô: đổi theo vòng (dir -1 là chiều ngược, chuột phải). */
  function tapCell(i, dir) {
    if (!canPlay() || game.trees[i]) return;
    cursor = i;
    const next = E.cycle(game, i, dir);
    const v = next.marks[i];
    if (commit(next, v === E.TENT ? 'place' : 'tap') && v === E.TENT) replay(cells[i], 'pitch');
  }

  /** Đặt hẳn một giá trị cho ô (phím T / G / Delete); đặt lại đúng giá trị đang có thì xóa về trống. */
  function setMark(i, v) {
    if (!canPlay() || game.trees[i]) return;
    const val = game.marks[i] === v ? E.EMPTY : v;
    if (commit(E.setCells(game, [i], val), val === E.TENT ? 'place' : 'tap') && val === E.TENT) replay(cells[i], 'pitch');
  }

  /** Chạm số đầu hàng / cột đã đủ lều: tô cỏ mọi ô còn trống của hàng / cột đó. */
  function fillLine(kind, k) {
    if (!canPlay()) return;
    const n = game.n;
    const st = E.lineStats(game);
    const want = kind === 'row' ? game.rows[k] : game.cols[k];
    const have = kind === 'row' ? st.rowTents[k] : st.colTents[k];
    const idxs = [];
    for (let m = 0; m < n; m++) {
      const i = kind === 'row' ? k * n + m : m * n + k;
      if (!game.trees[i] && game.marks[i] === E.EMPTY) idxs.push(i);
    }
    if (!idxs.length) return;
    if (have !== want) {
      kit.sfx('error');
      kit.toast(t('toast.lineNotDone'));
      return;
    }
    commit(E.setCells(game, idxs, E.GRASS), 'tap');
  }

  function undo() {
    if (!canPlay()) return;
    commit(E.undo(game), 'move');
  }

  function redo() {
    if (!canPlay()) return;
    commit(E.redo(game), 'move');
  }

  function hint() {
    if (!canPlay()) return;
    const h = E.hint(game);
    if (!h) return;
    cursor = h.i;
    const n = game.n;
    commit(E.useHint(game), 'pop');
    if (!E.isSolved(game)) {
      const key = h.kind === 'wrongTent' ? 'toast.hintWrongTent' : h.kind === 'wrongGrass' ? 'toast.hintWrongGrass' : 'toast.hintTent';
      kit.toast(t(key, { r: Math.floor(h.i / n) + 1, c: (h.i % n) + 1 }));
    }
    replay(cells[h.i], 'hinted');
  }

  function finish() {
    clock.pause();
    syncClock();
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const assisted = game.hints > 0;
    const prev = stats.best[m];
    const record = !assisted && (prev == null || ms < prev);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (record) stats.best[m] = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();

    $('win-time').textContent = fmt(ms);
    const badge = $('win-badge');
    badge.classList.toggle('good', record);
    badge.textContent = assisted
      ? t('win.hints', { n: game.hints })
      : record ? t('win.best') : t('win.prev', { size: sizeText(m), time: fmt(stats.best[m]) });
    $('win-text').textContent = t('win.text', { size: sizeText(m) + ' ' + t('mode.' + m), trees: E.treeCount(game) });
    render();
    // Cho người chơi kịp thấy trại dựng xong rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (solved()) kit.modal.open('modal-win');
    }, calm() ? 0 : 1100);
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
    $('btn-confirm').textContent = p.kind === 'size' ? t('confirm.size', { size: sizeText(p.mode) }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'size') switchSize(p.mode);
    else newPuzzle(game.mode);
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else newPuzzle(game.mode);
  }

  /** Đổi cỡ: chia đề cỡ đó trước rồi mới lưu cài đặt (onSetting gặp cỡ đã khớp nên không làm gì). */
  function switchSize(m) {
    newPuzzle(m);
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
  }

  /* ---------------- Chạm / chuột: chạm đổi ô, kéo tô cỏ ---------------- */

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest ? el.closest('.cell') : null;
    return c && board.contains(c) ? Number(c.dataset.i) : -1;
  }

  /** Các ô trên đoạn thẳng từ a tới b (không kể a), để kéo nhanh không bỏ sót ô. */
  function lineCells(a, b) {
    const n = game.n;
    let r = Math.floor(a / n);
    let c = a % n;
    const r1 = Math.floor(b / n);
    const c1 = b % n;
    const out = [];
    const steps = Math.max(Math.abs(r1 - r), Math.abs(c1 - c));
    for (let s = 1; s <= steps; s++) {
      const rr = Math.round(r + ((r1 - r) * s) / steps);
      const cc = Math.round(c + ((c1 - c) * s) / steps);
      out.push(rr * n + cc);
    }
    return out;
  }

  /** Thêm ô vào nét tô: tô cỏ lên ô trống, hoặc (nét bắt đầu từ ô cỏ) xóa cỏ. Lều và cây giữ nguyên. */
  function addToStroke(i) {
    if (stroke.seen.has(i)) return;
    stroke.seen.add(i);
    const m = game.marks[i];
    if (game.trees[i]) return;
    if (stroke.erase ? m === E.GRASS : m === E.EMPTY) stroke.list.push(i);
  }

  board.addEventListener('pointerdown', (e) => {
    board.classList.remove('kbd');
    if (!canPlay() || stroke) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    const b = e.target.closest && e.target.closest('.cell');
    if (!b) return;
    const i = Number(b.dataset.i);
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    stroke = { id: e.pointerId, start: i, last: i, dir: e.button === 2 ? -1 : 1, painting: false, erase: false, seen: new Set(), list: [] };
  });

  board.addEventListener('pointermove', (e) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    const j = cellAt(e.clientX, e.clientY);
    if (j < 0 || j === stroke.last) return;
    if (!stroke.painting) {
      stroke.painting = true;
      stroke.erase = game.marks[stroke.start] === E.GRASS;
      addToStroke(stroke.start);
    }
    lineCells(stroke.last, j).forEach(addToStroke);
    stroke.last = j;
    cursor = j;
    preview = E.setCells(game, stroke.list, stroke.erase ? E.EMPTY : E.GRASS);
    render();
  });

  function endStroke(e, cancelled) {
    if (!stroke || e.pointerId !== stroke.id) return;
    const s = stroke;
    stroke = null;
    const p = preview;
    preview = null;
    if (cancelled || !canPlay()) {
      render();
      return;
    }
    if (s.painting) {
      if (p && p !== game) commit(p, 'tap');
      else render();
    } else {
      tapCell(s.start, s.dir);
    }
  }
  board.addEventListener('pointerup', (e) => endStroke(e, false));
  board.addEventListener('pointercancel', (e) => endStroke(e, true));
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  board.addEventListener('selectstart', (e) => e.preventDefault());
  board.addEventListener('dragstart', (e) => e.preventDefault());
  // Số đầu hàng / cột: chạm để tô cỏ phần còn lại (click chạy cả với bàn phím)
  board.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.clue');
    if (c) fillLine(c.dataset.kind, Number(c.dataset.k));
  });

  /* ---------------- Nút ---------------- */

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-hint').addEventListener('click', hint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-size').addEventListener('click', () => requestSize(nextMode(game.mode)));
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => newPuzzle(game.mode));
  $('sw-errors').addEventListener('change', () => {
    kit.settings.set({ errors: $('sw-errors').checked });
    render();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    MODES.forEach((m) => {
      $('stats-best-' + m + '-label').textContent = t('stats.best', { size: sizeText(m) });
      $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]);
    });
  });

  /* ---------------- Bàn phím ---------------- */

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z') (e.shiftKey ? redo : undo)();
      else if (k === 'y') redo();
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onCell = !!(e.target.closest && e.target.closest('.cell'));
    const onOtherButton = !onCell && e.target.closest && e.target.closest('button, input, a[href]');
    if (ARROWS[k]) {
      const n = game.n;
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + ARROWS[k][0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + ARROWS[k][1]));
      cursor = r * n + c;
      board.classList.add('kbd');
      // Shift + mũi tên: tô cỏ lên ô vừa tới nếu ô đó trống
      if (e.shiftKey && canPlay() && !game.trees[cursor] && game.marks[cursor] === E.EMPTY) commit(E.setCells(game, [cursor], E.GRASS), 'tap');
      else render();
      cells[cursor].focus();
    } else if (k === ' ' || k === 'enter') {
      // Nút khác đang focus (Hoàn tác, Gợi ý…) thì để trình duyệt bấm nút đó
      if (onOtherButton) return;
      if (!onCell) cells[cursor].focus();
      tapCell(cursor, e.shiftKey ? -1 : 1);
    } else if (k === 't' || k === '1') setMark(cursor, E.TENT);
    else if (k === 'g' || k === 'x' || k === '2') setMark(cursor, E.GRASS);
    else if (k === 'backspace' || k === 'delete' || k === '0') {
      if (canPlay() && !game.trees[cursor]) commit(E.setCells(game, [cursor], E.EMPTY), 'tap');
    } else if (k === 'z') undo();
    else if (k === 'y') redo();
    else if (k === 'h') hint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Space trên nút ô: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  board.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */

  /** Cài đặt cỡ bàn đi theo ván đang có (ghi thẳng, không qua onSetting). */
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
    kit.sdk.start(game.mode, true);
    buildBoard();
    render();
    syncClock();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().size;
    newPuzzle(MODES.indexOf(m) >= 0 ? m : 's');
    syncSizeSetting();
  }
})();
