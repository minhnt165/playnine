/* =====================================================================
 * Nhị Phân - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ lưới ('6' | '8' | '10' | '12'), metric time_low
 *   - Đồng hồ chạy từ lúc đề hiện ra (không chờ nước đầu, tránh nhìn đề trước rồi mới bấm giờ);
 *     dừng khi tab ẩn hoặc mở hộp thoại (lúc đó che lưới)
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted: hints > 0 })
 *     - bỏ đề đã đi ít nhất một nước (chọn đề mới): won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['6', '8', '10', '12'];
  const kit = PNKit.init({ gameId: 'nhiphan', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: '6', errors: 'auto', helpSeen: false }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  /* ---------------- Thống kê ---------------- */
  const stats = (function () {
    const raw = kit.store.read(keys.stats, {}) || {};
    const nat = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
    const s = { played: nat(raw.played), won: nat(raw.won), streak: nat(raw.streak), modes: {} };
    MODES.forEach((m) => {
      const r = (raw.modes && raw.modes[m]) || {};
      s.modes[m] = { played: nat(r.played), won: nat(r.won), best: Number.isFinite(r.best) && r.best > 0 ? r.best : null };
    });
    return s;
  })();

  let game = null;
  let cursor = 0; // ô đang chọn bằng bàn phím
  let cells = [];
  let winTimer = 0;
  let heldByModal = false; // đồng hồ đang dừng vì mở hộp thoại

  const mode = () => String(game.size);
  const sizeLabel = (m) => m + '×' + m;
  /** Ván đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);
  const showErrors = () => {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && game && game.size === 6);
  };

  /** m:ss (HUD) hoặc m:ss.d (kết quả), dấu thập phân theo ngôn ngữ. */
  function fmt(ms, tenths) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    return m + ':' + String(s).padStart(2, '0') + (tenths ? (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10) : '');
  }

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới ô khi đổi cỡ; ô là nút, chỉ ô con trỏ nhận Tab (roving tabindex). */
  function buildBoard() {
    const board = $('board');
    const n = game.size;
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
      board.appendChild(b);
      cells.push(b);
    }
  }

  function render() {
    const n = game.size;
    if (cells.length !== n * n || $('board').dataset.size !== String(n)) buildBoard();
    const bad = showErrors() ? new Set(E.conflicts(n, game.cells)) : new Set();
    cells.forEach((b, i) => {
      const v = game.cells[i];
      const given = E.isGiven(game, i);
      b.textContent = v < 0 ? '' : String(v);
      b.classList.toggle('v0', v === 0);
      b.classList.toggle('v1', v === 1);
      b.classList.toggle('given', given);
      b.classList.toggle('bad', bad.has(i));
      b.tabIndex = i === cursor ? 0 : -1;
      const p = { r: Math.floor(i / n) + 1, c: (i % n) + 1, v };
      b.setAttribute('aria-label', t(v < 0 ? 'cell.empty' : given ? 'cell.given' : 'cell.value', p) + (bad.has(i) ? t('cell.bad') : ''));
    });
    const left = E.emptyCount(game);
    const board = $('board');
    board.classList.toggle('solved', E.isSolved(game));
    board.setAttribute('aria-label', t('board.label', { size: sizeLabel(n), n: left }));
    $('left').textContent = kit.i18n.fmtNumber(left);
    const best = stats.modes[mode()].best;
    $('best').textContent = best == null ? '–' : fmt(best);
    $('best-label').textContent = t('hud.bestSize', { size: sizeLabel(n) });
    const done = E.isSolved(game);
    $('btn-undo').disabled = done || !game.undo.length;
    $('btn-redo').disabled = done || !game.redo.length;
    $('btn-hint').disabled = done;
    $('hint-count').hidden = game.hints === 0;
    $('hint-count').textContent = game.hints;
    renderTime();
  }

  function renderTime() {
    $('time').textContent = fmt(clock.elapsed());
  }
  setInterval(() => { if (clock.running) renderTime(); }, 250);

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    if (calm()) return;
    if (cls !== 'deal') $('board').classList.remove('deal'); // lớp deal đè hiệu ứng của ô
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Che lưới + dừng giờ khi mở hộp thoại ---------------- */

  function syncPause() {
    const open = kit.modal.current();
    const veil = !!open && !!game && !E.isSolved(game);
    $('board').classList.toggle('veiled', veil);
    if (open && clock.running) {
      clock.pause();
      heldByModal = true;
    } else if (!open && heldByModal) {
      heldByModal = false;
      if (game && !E.isSolved(game) && !document.hidden) clock.resume();
    }
    renderTime();
  }
  const watcher = new MutationObserver(syncPause);
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? mode() : kit.settings.get().size;
    const best = stats.modes[m].best;
    const left = game ? E.emptyCount(game) : 0;
    const start = game ? Math.max(1, game.puzzle.filter((v) => v < 0).length) : 1;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { size: sizeLabel(m), time: fmt(best) }),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(best == null ? [] : [{ value: fmt(best), label: t('hud.best') + ' ' + sizeLabel(m) }])
        : [],
      resume: inPlay()
        ? { title: t('app.name') + ' ' + sizeLabel(m), detail: t('summary.resume', { n: left }), pct: Math.max(0, Math.min(1, 1 - left / start)) }
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

  function newGame(m) {
    clearTimeout(winTimer);
    const size = Number(MODES.indexOf(m) >= 0 ? m : '6');
    game = E.newGame({ size, seed: Math.floor(Math.random() * 4294967295) + 1 });
    cursor = Math.min(cursor, size * size - 1);
    clock.reset();
    clock.start();
    heldByModal = false;
    kit.store.remove(keys.save);
    if (kit.settings.get().size !== String(size)) kit.settings.set({ size: String(size) });
    kit.sdk.start(String(size));
    render();
    replay($('board'), 'deal');
    writeSummary();
    syncPause();
  }

  /** Áp ván mới sau một thao tác của người chơi; kêu lỗi khi ô vừa đổi phạm luật (lúc đang báo lỗi). */
  function commit(next, i, sound) {
    if (next === game) return false;
    game = next;
    if (!clock.running && !kit.modal.current()) clock.resume();
    if (i != null) {
      cursor = i;
      replay(cells[i], 'pop');
    }
    render();
    if (E.isSolved(game)) {
      finish();
      return true;
    }
    if (i != null && showErrors() && game.cells[i] >= 0 && E.conflicts(game.size, game.cells).indexOf(i) >= 0) kit.sfx('error');
    else kit.sfx(sound);
    persist();
    return true;
  }

  function playable() {
    return !!game && !E.isSolved(game) && !kit.modal.current();
  }

  function setAt(i, v) {
    if (!playable()) return;
    commit(E.setCell(game, i, v), i, v < 0 ? 'pop' : v === 0 ? 'tap' : 'flip');
  }

  function cycleAt(i, dir) {
    if (!playable()) return;
    const next = E.cycle(game, i, dir);
    if (next === game) {
      if (E.isGiven(game, i)) {
        cursor = i;
        render();
        replay(cells[i], 'nudge');
      }
      return;
    }
    const v = next.cells[i];
    commit(next, i, v < 0 ? 'pop' : v === 0 ? 'tap' : 'flip');
  }

  function doUndo() {
    if (!playable() || !game.undo.length) return;
    const i = game.undo[game.undo.length - 1][0];
    commit(E.undo(game), i, 'move');
  }

  function doRedo() {
    if (!playable() || !game.redo.length) return;
    const i = game.redo[game.redo.length - 1][0];
    commit(E.redo(game), i, 'move');
  }

  function doHint() {
    if (!playable()) return;
    const h = E.hint(game);
    if (!h) return;
    commit(h.game, h.i, 'coin');
    if (cells[h.i]) replay(cells[h.i], 'hinted');
    if (!E.isSolved(game)) kit.toast(t('hint.' + h.kind), 2600);
  }

  function finish() {
    clock.pause();
    heldByModal = false;
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const assisted = game.hints > 0;
    const rec = stats.modes[m];
    const best = !assisted && (rec.best == null || ms < rec.best);
    stats.played++;
    stats.won++;
    stats.streak++;
    rec.played++;
    rec.won++;
    if (best) rec.best = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    render();
    $('win-time').textContent = fmt(ms, true);
    $('win-best').hidden = !best;
    $('win-assisted').hidden = !assisted;
    $('win-assisted').textContent = t('win.assisted', { n: game.hints });
    // Cho người chơi kịp thấy làn sáng quét qua lưới rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (game && E.isSolved(game)) kit.modal.open('modal-win');
    }, calm() ? 0 : 750);
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    const m = mode();
    stats.played++;
    stats.streak = 0;
    stats.modes[m].played++;
    saveStats();
    kit.sdk.end({ mode: m, won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  /** Mở hộp chọn đề mới (cảnh báo tính thua khi đang dở). */
  function openNew() {
    clearTimeout(winTimer);
    const playing = inPlay();
    $('new-warn').hidden = !playing;
    document.querySelectorAll('.size-opt').forEach((b) => {
      const m = b.dataset.size;
      const best = stats.modes[m].best;
      b.querySelector('.size-best').textContent = best == null ? t('new.none') : t('new.best', { time: fmt(best) });
      b.classList.toggle('current', !!game && m === mode());
    });
    kit.modal.closeAll();
    kit.modal.open('modal-new');
  }

  function pickSize(m) {
    if (MODES.indexOf(m) < 0) return;
    kit.modal.close('modal-new');
    if (inPlay()) abandon();
    newGame(m);
    kit.sfx('start');
  }

  function onSetting(key) {
    if (key === 'errors' && game) render();
  }

  /* ---------------- Sự kiện ---------------- */

  $('board').addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b) cycleAt(Number(b.dataset.i), 1);
  });
  // Chuột phải: xoay ngược (trống → 1 → 0 → trống)
  $('board').addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.cell');
    if (!b) return;
    e.preventDefault();
    cycleAt(Number(b.dataset.i), -1);
  });
  // Ô nhận focus (Tab, chạm) thành ô con trỏ của bàn phím
  $('board').addEventListener('focusin', (e) => {
    const b = e.target.closest('.cell');
    if (!b || Number(b.dataset.i) === cursor) return;
    cursor = Number(b.dataset.i);
    cells.forEach((x, i) => { x.tabIndex = i === cursor ? 0 : -1; });
  });
  $('btn-undo').addEventListener('click', doUndo);
  $('btn-redo').addEventListener('click', doRedo);
  $('btn-hint').addEventListener('click', doHint);
  $('btn-new').addEventListener('click', openNew);
  $('btn-change').addEventListener('click', openNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    pickSize(mode());
  });
  $('size-list').addEventListener('click', (e) => {
    const b = e.target.closest('.size-opt');
    if (b) pickSize(b.dataset.size);
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    const body = $('stats-sizes');
    body.textContent = '';
    MODES.forEach((m) => {
      const r = stats.modes[m];
      const tr = document.createElement('tr');
      [sizeLabel(m) + ' · ' + t('level.' + m), kit.i18n.fmtNumber(r.won) + ' / ' + kit.i18n.fmtNumber(r.played), r.best == null ? '–' : fmt(r.best, true)].forEach((txt) => {
        const td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  });

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    // Ctrl / Cmd chỉ dùng cho hoàn tác / làm lại
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) doUndo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) doRedo();
      else return;
      e.preventDefault();
      return;
    }
    const onCell = !!(e.target.closest && e.target.closest('.cell'));
    const onOtherButton = !onCell && e.target.closest && e.target.closest('button, input, a[href]');
    const n = game.size;
    if (ARROWS[k]) {
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + ARROWS[k][0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + ARROWS[k][1]));
      cursor = r * n + c;
      render();
      cells[cursor].focus();
    } else if (k === '0' || k === '1') {
      setAt(cursor, Number(k));
      if (cells[cursor] && !onCell) cells[cursor].focus();
    } else if (k === 'backspace' || k === 'delete' || k === '.') {
      setAt(cursor, -1);
    } else if (k === ' ' || k === 'enter') {
      // Nút khác đang focus (Hoàn tác, Gợi ý…) thì để trình duyệt bấm nút đó
      if (onOtherButton) return;
      if (!onCell) cells[cursor].focus();
      cycleAt(cursor, 1);
    } else if (k === 'z') doUndo();
    else if (k === 'y') doRedo();
    else if (k === 'h') doHint();
    else if (k === 'n') openNew();
    else return;
    e.preventDefault();
  });
  // Space / Enter trên nút ô: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  $('board').addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTime(); });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isSolved(restored)) {
    game = restored;
    if (kit.settings.get().size !== mode()) kit.settings.set({ size: mode() });
    clock.set(Number(saved.elapsed) || 0);
    clock.start();
    kit.sdk.start(mode(), true);
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    newGame(kit.settings.get().size);
  }
  // Lần đầu mở: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().helpSeen) {
    kit.settings.set({ helpSeen: true });
    kit.modal.open('modal-help');
  }
  syncPause();
})();
