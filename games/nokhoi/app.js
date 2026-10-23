/* =====================================================================
 * Nổ Khối - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Chuột: trỏ vào thì sáng nhóm + hiện điểm, bấm là nổ
 *   - Cảm ứng: chạm lần đầu chọn nhóm + hiện điểm, chạm lần hai vào nhóm đó mới nổ (cài đặt "một chạm" thì nổ ngay)
 *   - Bàn phím: mũi tên di chuyển con trỏ, Space / Enter nổ, N ván mới
 *   - Báo ván cho cổng (metric score_high, mode classic):
 *     ván mới kit.sdk.start(MODE), mở lại ván dở kit.sdk.start(MODE, true);
 *     hết nước kit.sdk.end({ mode, won: <đã sạch bàn>, score }); bỏ ván đã nổ ít nhất một lần thì won: false
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const kit = PNKit.init({
    gameId: 'nokhoi',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { singleTap: false },
    onSetting: (key) => { if (key === 'singleTap') renderHelp(); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const board = $('board');
  const stage = $('stage');
  const stats = Object.assign({ played: 0, cleared: 0, best: null, total: 0 }, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let finished = false; // ván đã báo kết thúc (tránh gửi hai lần)
  let cell = 32; // cạnh một ô (px), tính lại khi đổi cỡ màn hình
  let sel = null; // nhóm đang sáng: { cells: [[x, y]...], ids: Set }
  let cursor = { x: 0, y: 0 }; // con trỏ bàn phím, y = 0 là hàng dưới
  let kbMode = false; // đang dùng bàn phím thì hiện con trỏ
  let lastMouse = null; // vị trí chuột cuối cùng trên bàn (để sáng lại nhóm mới sau khi nổ)
  let overTimer = 0;
  const els = new Map(); // id khối -> phần tử

  const fmtN = (n) => kit.i18n.fmtNumber(n);
  const started = () => game && game.pops > 0 && !E.isOver(game);

  /* ---------------- Kích thước bàn ---------------- */
  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const next = Math.max(12, Math.floor(Math.min(w / game.w, h / game.h)));
    if (next === cell && board.style.width) return;
    cell = next;
    // Đổi cỡ thì đặt lại vị trí ngay, không chạy hiệu ứng trượt
    board.classList.add('still');
    board.style.setProperty('--cell', cell + 'px');
    board.style.width = cell * game.w + 'px';
    board.style.height = cell * game.h + 'px';
    void board.offsetWidth;
    board.classList.remove('still');
    renderTag();
  }

  /* ---------------- Vẽ ---------------- */
  function place(el, x, y) {
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', game.h - 1 - y);
  }

  /** Đồng bộ khối trên bàn với ván: khối mới tạo ra, khối còn thì dời chỗ (CSS trượt), khối mất thì nổ. */
  function renderBoard(fresh) {
    if (fresh) {
      els.forEach((el) => el.remove());
      els.clear();
    }
    const alive = new Set();
    game.cols.forEach((col, x) => col.forEach((b, y) => {
      alive.add(b.id);
      let el = els.get(b.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'block c' + b.c + (fresh && !calm() ? ' enter' : '');
        el.innerHTML = '<span class="face"></span>';
        els.set(b.id, el);
        board.insertBefore(el, $('cursor'));
      }
      place(el, x, y);
    }));
    els.forEach((el, id) => {
      if (alive.has(id)) return;
      els.delete(id);
      if (calm()) {
        el.remove();
        return;
      }
      el.classList.add('gone');
      setTimeout(() => el.remove(), 260);
    });
    if (fresh && !calm()) setTimeout(() => els.forEach((el) => el.classList.remove('enter')), 700);
  }

  function renderHud() {
    $('score').textContent = fmtN(game.score);
    $('left').textContent = fmtN(E.blocksLeft(game));
    $('best').textContent = stats.best == null ? '–' : fmtN(stats.best);
    const over = E.isOver(game);
    const banner = $('over-banner');
    banner.hidden = !over;
    banner.textContent = E.isCleared(game) ? t('board.clearedBanner') : t('board.noMoves');
    banner.classList.toggle('won', E.isCleared(game));
    board.classList.toggle('over', over);
  }

  function renderHelp() {
    $('help-touch').textContent = t(kit.settings.get().singleTap ? 'help.touchOne' : 'help.touch');
  }

  /** Nhãn điểm nổi trên đỉnh nhóm đang sáng. */
  function renderTag() {
    const tag = $('tag');
    if (!sel) {
      tag.hidden = true;
      return;
    }
    let top = -1;
    let sx = 0;
    sel.cells.forEach(([x, y]) => {
      top = Math.max(top, y);
      sx += x;
    });
    const cx = (sx / sel.cells.length + 0.5) * cell;
    const cy = (game.h - 1 - top) * cell;
    tag.textContent = '+' + fmtN(E.points(sel.cells.length));
    tag.hidden = false;
    // Giữ nhãn trong khung bàn
    const half = tag.offsetWidth / 2;
    tag.style.left = Math.min(Math.max(cx, half), cell * game.w - half) + 'px';
    tag.style.top = cy + 'px';
    tag.classList.toggle('below', cy < tag.offsetHeight + 6);
  }

  function renderCursor() {
    const c = $('cursor');
    c.hidden = !kbMode || E.isOver(game);
    c.style.setProperty('--x', cursor.x);
    c.style.setProperty('--y', game.h - 1 - cursor.y);
  }

  /* ---------------- Chọn nhóm ---------------- */
  function select(cells) {
    const grp = cells && cells.length >= 2 ? cells : null;
    els.forEach((el) => el.classList.remove('sel'));
    if (!grp) {
      sel = null;
    } else {
      const ids = new Set(grp.map(([x, y]) => game.cols[x][y].id));
      sel = { cells: grp, ids };
      ids.forEach((id) => els.get(id).classList.add('sel'));
    }
    board.classList.toggle('has-sel', !!sel);
    renderTag();
  }
  const clearSel = () => select(null);
  const selectAt = (x, y) => select(E.groupAt(game, x, y));

  function announce(msg) {
    $('live').textContent = msg;
  }

  /** Ô (x, y) dưới điểm chạm; y = 0 là hàng dưới cùng. */
  function cellAt(clientX, clientY) {
    const r = board.getBoundingClientRect();
    const x = Math.floor((clientX - r.left) / cell);
    const row = Math.floor((clientY - r.top) / cell);
    if (x < 0 || row < 0 || x >= game.w || row >= game.h) return null;
    return { x, y: game.h - 1 - row };
  }

  /* ---------------- Nổ ---------------- */
  function popAt(x, y) {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    const grp = E.groupAt(game, x, y);
    if (grp.length < 2) {
      if (grp.length === 1) kit.sfx('error', { volume: 0.5 });
      return;
    }
    const firstPop = game.pops === 0;
    const before = game;
    const gain = E.points(grp.length);
    // Tâm nhóm (theo ô) để vẽ số điểm bay lên
    let sx = 0;
    let top = -1;
    grp.forEach(([gx, gy]) => {
      sx += gx;
      top = Math.max(top, gy);
    });
    game = E.pop(game, x, y);
    if (game === before) return;
    clearSel();
    renderBoard(false);
    floatScore('+' + fmtN(gain), (sx / grp.length + 0.5) * cell, (game.h - 1 - top + 0.5) * cell);
    kit.sfx(grp.length >= 10 ? 'combo' : grp.length >= 5 ? 'clear' : 'pop');
    announce(t('board.popped', { n: grp.length, pts: gain, score: game.score }));
    if (firstPop) writeSummary();
    clampCursor();
    renderHud();
    renderCursor();
    if (E.isOver(game)) finish();
    else {
      persist();
      // Chuột vẫn ở trên bàn hoặc đang dùng phím: sáng luôn nhóm mới dưới con trỏ
      if (kbMode) selectAt(cursor.x, cursor.y);
      else if (lastMouse) {
        const c = cellAt(lastMouse.x, lastMouse.y);
        if (c) selectAt(c.x, c.y);
      }
    }
  }

  function floatScore(text, x, y) {
    if (calm()) return;
    const f = document.createElement('div');
    f.className = 'float';
    f.textContent = text;
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    board.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  function clampCursor() {
    if (!game.cols.length) return;
    cursor.x = Math.min(cursor.x, game.cols.length - 1);
    cursor.y = Math.min(cursor.y, game.cols[cursor.x].length - 1);
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const total = game.w * game.h;
    const left = E.blocksLeft(game);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.cleared,
      note: stats.best == null ? t('summary.none') : t('summary.note', { score: fmtN(stats.best) }),
      stats: stats.best == null ? [] : [{ value: fmtN(stats.best), label: t('hud.best') }],
      resume: started() ? { title: t('app.name'), detail: t('summary.resume', { score: fmtN(game.score), left }), pct: 1 - left / total } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (started()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /** Ghi một ván đã xong (hết nước hoặc bỏ ngang) vào thống kê; trả về true nếu là kỷ lục mới. */
  function record(cleared) {
    const best = game.score > 0 && (stats.best == null || game.score > stats.best);
    stats.played++;
    stats.total += game.score;
    if (cleared) stats.cleared++;
    if (stats.best == null || game.score > stats.best) stats.best = game.score;
    saveStats();
    return best;
  }

  /* ---------------- Luồng ván ---------------- */
  function seed() {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    } catch (e) {
      return (Math.random() * 4294967296) >>> 0 || 1;
    }
  }

  function newGame() {
    clearTimeout(overTimer);
    game = E.newGame(seed());
    finished = false;
    cursor = { x: 0, y: game.h - 1 };
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    sel = null;
    board.classList.remove('has-sel');
    layout();
    renderBoard(true);
    renderHud();
    renderTag();
    renderCursor();
    writeSummary();
    kit.sfx('start');
  }

  function finish() {
    if (finished) return;
    finished = true;
    const cleared = E.isCleared(game);
    const best = record(cleared);
    persist();
    renderHud();
    kit.sdk.end({ mode: MODE, won: cleared, score: game.score, assisted: false });
    $('over-title').textContent = cleared ? t('over.cleared') : t('over.title');
    $('over-score').textContent = fmtN(game.score);
    const left = E.blocksLeft(game);
    $('over-detail').textContent = cleared ? t('over.bonus') : t('over.left', { n: left });
    $('over-best').hidden = !best;
    // Đợi khối rơi xong rồi mới hiện bảng kết quả
    overTimer = setTimeout(() => {
      if (cleared) {
        kit.sfx('win');
        kit.confetti();
      } else kit.sfx(best ? 'levelup' : 'lose');
      kit.modal.open('modal-over');
    }, calm() ? 0 : 650);
  }

  /** Ván đang dở (đã nổ ít nhất một lần) thì hỏi trước, vì bỏ ván là kết thúc với điểm hiện tại. */
  function requestNew() {
    if (started()) {
      $('confirm-text').textContent = t('confirm.text', { n: game.score, score: fmtN(game.score) });
      kit.modal.open('modal-confirm');
    } else {
      kit.modal.closeAll();
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (started() && !finished) {
      finished = true;
      record(false);
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    newGame();
  }

  /* ---------------- Chuột / chạm ---------------- */
  board.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !game) return;
    lastMouse = { x: e.clientX, y: e.clientY };
    if (kbMode) {
      kbMode = false;
      renderCursor();
    }
    if (E.isOver(game)) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c) selectAt(c.x, c.y);
    else clearSel();
  });
  board.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    lastMouse = null;
    if (!kbMode) clearSel();
  });
  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // không để bàn lấy focus làm hiện viền khi chạm
  });
  board.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !game || E.isOver(game) || kit.modal.current()) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    const active = document.activeElement;
    if (active && active !== board && active !== document.body && active.blur) active.blur();
    if (kbMode) {
      kbMode = false;
      renderCursor();
    }
    if (e.pointerType === 'mouse' || kit.settings.get().singleTap) {
      popAt(c.x, c.y);
      return;
    }
    // Cảm ứng: chạm vào nhóm đang chọn thì nổ, chạm chỗ khác thì chọn nhóm đó
    const b = game.cols[c.x] && game.cols[c.x][c.y];
    if (b && sel && sel.ids.has(b.id)) popAt(c.x, c.y);
    else {
      const grp = E.groupAt(game, c.x, c.y);
      select(grp);
      if (grp.length >= 2) {
        kit.sfx('tap', { volume: 0.5 });
        announce(t('board.group', { n: grp.length, pts: E.points(grp.length) }));
      } else if (grp.length === 1) kit.sfx('error', { volume: 0.5 });
    }
  });

  /* ---------------- Bàn phím ---------------- */
  const MOVES = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if (MOVES[k]) {
      if (E.isOver(game)) return;
      // Đưa focus về bàn để Space / Enter sau đó là nổ, không bấm lại nút vừa dùng
      if (document.activeElement !== board) board.focus({ preventScroll: true });
      if (kbMode) {
        cursor.x = Math.min(game.w - 1, Math.max(0, cursor.x + MOVES[k][0]));
        cursor.y = Math.min(game.h - 1, Math.max(0, cursor.y + MOVES[k][1]));
      } else {
        kbMode = true;
        clampCursor();
      }
      kit.sfx('move', { volume: 0.3 });
      renderCursor();
      selectAt(cursor.x, cursor.y);
      const grp = E.groupAt(game, cursor.x, cursor.y);
      if (grp.length) announce(t('board.group', { n: grp.length, pts: E.points(grp.length) }));
    } else if ((k === ' ' || k === 'enter') && !(e.target instanceof HTMLButtonElement)) {
      if (!kbMode) {
        kbMode = true;
        clampCursor();
        renderCursor();
        selectAt(cursor.x, cursor.y);
      } else popAt(cursor.x, cursor.y);
    } else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });

  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-over');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmtN(stats.played);
    $('stats-best').textContent = stats.best == null ? '–' : fmtN(stats.best);
    $('stats-avg').textContent = stats.played ? fmtN(Math.round(stats.total / stats.played)) : '–';
    $('stats-cleared').textContent = fmtN(stats.cleared);
  });
  kit.onLeave(persist);
  if (window.ResizeObserver) new ResizeObserver(() => game && layout()).observe(stage);
  else window.addEventListener('resize', () => game && layout());

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  renderHelp();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.pops > 0 && !E.isOver(restored)) {
    game = restored;
    cursor = { x: 0, y: game.h - 1 };
    clampCursor();
    kit.sdk.start(MODE, true);
    layout();
    renderBoard(true);
    renderHud();
    renderCursor();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    newGame();
  }
})();
