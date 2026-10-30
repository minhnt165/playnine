/* =====================================================================
 * Nối Màu - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi màn là một ván; mode = cỡ bàn (5x5, 7x7, 9x9) chọn trong Cài đặt, metric wins trên cổng
 *   - Chuột / chạm: kéo từ chấm hoặc đầu đường; kéo nhanh qua nhiều ô thì đi từng ô một theo hướng con trỏ
 *   - Bàn phím: mũi tên di chuyển con trỏ (đang vẽ thì kéo đường), Space bắt đầu / kết thúc, Backspace lùi, R xóa hết, N màn mới
 *   - Báo ván cho cổng:
 *     - Chia màn mới: kit.sdk.start(mode); mở lại màn lưu dở: kit.sdk.start(mode, true)
 *     - Giải xong: kit.sdk.end({ mode, won: true, timeMs, assisted: false })
 *     - Bỏ màn đã đi ít nhất một nước: kit.sdk.end({ mode, won: false, ... }); chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = Object.keys(E.MODES);
  const kit = PNKit.init({
    gameId: 'noimau',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { mode: '5x5' },
    onSetting: (key, value) => { if (key === 'mode') onModeSetting(value); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const board = $('board');

  let mode = '5x5'; // mode của màn đang chơi (Cài đặt có thể đã đổi cho màn sau)
  let game = null;
  let won = false;
  let drawing = -1; // màu đang vẽ, -1 = không vẽ
  let cursor = 0; // ô con trỏ bàn phím
  let showCursor = false; // chỉ hiện con trỏ sau khi dùng bàn phím
  let pulse = -1; // màu vừa nối xong (hiệu ứng một lần)

  /* ---------------- Thống kê theo mode ---------------- */
  const blankMode = () => ({ played: 0, won: 0, best: null, perfect: 0 });
  const stats = { modes: {} };
  (function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    MODES.forEach((m) => {
      const s = raw.modes && raw.modes[m];
      stats.modes[m] = Object.assign(blankMode(), s && typeof s === 'object' ? s : {});
    });
  })();
  const total = (field) => MODES.reduce((s, m) => s + (Number(stats.modes[m][field]) || 0), 0);

  function settingMode() {
    const m = kit.settings.get().mode;
    return MODES.indexOf(m) >= 0 ? m : '5x5';
  }

  /** m:ss (HUD) hoặc m:ss.d (kết quả). */
  function fmt(ms, tenths) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    const base = m + ':' + String(s).padStart(2, '0');
    return tenths ? base + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10) : base;
  }

  const inPlay = () => !!game && game.moves > 0 && !won;
  const pct = () => Math.floor((E.filledCount(game) / (game.size * game.size)) * 100);

  /* ---------------- Vẽ ---------------- */
  function center(i) {
    return [(i % game.size) + 0.5, Math.floor(i / game.size) + 0.5];
  }

  function renderBoard() {
    const n = game.size;
    const owner = new Array(n * n).fill(-1);
    game.paths.forEach((p, k) => { if (p.length >= 2) p.forEach((c) => { owner[c] = k; }); });
    let s = '';
    // Ô (để bắt sự kiện và tô nhạt màu đường đi qua)
    for (let i = 0; i < n * n; i++) {
      const x = i % n;
      const y = Math.floor(i / n);
      const k = owner[i];
      s += '<rect class="cell' + (k >= 0 ? ' tint' : '') + '" data-cell="' + i + '" x="' + x + '" y="' + y + '" width="1" height="1"' +
        (k >= 0 ? ' style="fill:var(--c' + k + ')"' : '') + '/>';
    }
    // Lưới
    let d = '';
    for (let j = 1; j < n; j++) d += 'M' + j + ' 0V' + n + 'M0 ' + j + 'H' + n;
    s += '<path class="grid" d="' + d + '"/>';
    // Đường
    game.paths.forEach((p, k) => {
      if (p.length < 2) return;
      const pts = p.map((c) => center(c).join(',')).join(' ');
      s += '<polyline class="pipe" points="' + pts + '" style="stroke:var(--c' + k + ')"/>';
    });
    // Chấm (đã nối thì có vòng ngoài)
    game.dots.forEach((pair, k) => {
      const done = E.isConnected(game, k);
      pair.forEach((c) => {
        const [x, y] = center(c);
        if (done) s += '<circle class="ring" cx="' + x + '" cy="' + y + '" r="0.44" style="stroke:var(--c' + k + ')"/>';
        s += '<circle class="dot' + (pulse === k ? ' pulse' : '') + '" cx="' + x + '" cy="' + y + '" r="0.32" style="fill:var(--c' + k + ')"/>';
      });
    });
    // Đầu đường đang vẽ
    if (drawing >= 0) {
      const p = game.paths[drawing];
      const head = p[p.length - 1];
      if (p.length > 1 && E.dotColor(game, head) < 0) {
        const [x, y] = center(head);
        s += '<circle class="head" cx="' + x + '" cy="' + y + '" r="0.1"/>';
      }
    }
    if (showCursor && !won) {
      s += '<rect class="cursor" x="' + ((cursor % n) + 0.07) + '" y="' + (Math.floor(cursor / n) + 0.07) + '" width="0.86" height="0.86" rx="0.14"/>';
    }
    board.innerHTML = s;
    board.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    board.classList.toggle('won', won);
    pulse = -1;
  }

  let raf = 0;
  function renderTime() {
    $('time').textContent = fmt(clock.elapsed());
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(renderTime);
  }

  function render() {
    renderBoard();
    const pairs = E.connectedCount(game);
    $('pairs').textContent = pairs + '/' + game.dots.length;
    $('filled').textContent = pct() + '%';
    $('moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('mode-badge').textContent = mode;
    $('mode-badge').setAttribute('aria-label', t('mode.badge', { mode }));
    board.setAttribute('aria-label', t('board.label', { size: mode, pairs, total: game.dots.length, pct: pct() }));
    $('btn-undo').disabled = won || game.last < 0 || !game.paths[game.last].length;
    $('btn-reset').disabled = won || game.paths.every((p) => !p.length);
    renderTime();
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, { v: 1, modes: stats.modes });
  }
  function writeSummary() {
    const bests = MODES.filter((m) => stats.modes[m].best != null);
    const cur = stats.modes[mode].best != null ? mode : bests[bests.length - 1];
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: total('played'),
      won: total('won'),
      note: cur ? t('summary.note', { time: fmt(stats.modes[cur].best, true), mode: cur }) : t('summary.none'),
      stats: bests.map((m) => ({ value: fmt(stats.modes[m].best, true), label: m })),
      resume: inPlay()
        ? { title: t('app.name') + ' ' + mode, detail: t('summary.resume', { pairs: E.connectedCount(game), total: game.dots.length, pct: pct() }), pct: pct() / 100 }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, mode, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function newGame() {
    mode = settingMode();
    game = E.newGame(mode, (Math.random() * 4294967296) >>> 0);
    won = false;
    drawing = -1;
    cursor = game.dots[0][0];
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    render();
    writeSummary();
  }

  /** Nhận trạng thái mới từ engine: âm thanh khi nối xong một cặp, kiểm tra thắng. */
  function apply(next) {
    if (next === game) return false;
    const before = game.dots.map((d, k) => E.isConnected(game, k));
    game = next;
    if (!clock.running) clock.resume();
    const joined = game.dots.findIndex((d, k) => !before[k] && E.isConnected(game, k));
    if (E.isWon(game)) {
      finish();
      return true;
    }
    if (joined >= 0) {
      pulse = joined;
      kit.sfx('place');
      if (E.connectedCount(game) === game.dots.length) kit.toast(t('toast.full'));
    }
    return true;
  }

  function finish() {
    won = true;
    drawing = -1;
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const s = stats.modes[mode];
    const best = s.best == null || ms < s.best;
    const perfect = game.moves === game.dots.length;
    s.played++;
    s.won++;
    if (best) s.best = ms;
    if (perfect) s.perfect++;
    saveStats();
    persist();
    kit.sdk.end({ mode, won: true, timeMs: ms, assisted: false });
    kit.sfx('win');
    kit.confetti();
    $('win-time').textContent = fmt(ms, true);
    $('win-moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('win-best').hidden = !best;
    $('win-perfect').hidden = !perfect;
    render();
    // Cho người chơi nhìn bàn đã phủ kín một chút rồi mới hiện kết quả
    setTimeout(() => { if (won && !kit.modal.current()) kit.modal.open('modal-win'); }, 650);
  }

  /** Màn đang dở (đã đi nước) thì hỏi trước, vì bỏ màn tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    stats.modes[mode].played++;
    saveStats();
    kit.sdk.end({ mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    newGame();
  }

  /** Đổi cỡ bàn trong Cài đặt: chưa đi nước nào thì đổi ngay, đang giải dở thì áp dụng từ màn sau. */
  function onModeSetting(value) {
    if (!game || MODES.indexOf(value) < 0 || value === mode) return;
    if (inPlay()) kit.toast(t('toast.nextSize'));
    else newGame();
  }

  /* ---------------- Vẽ bằng chuột / chạm ---------------- */
  function cellAt(e) {
    const r = board.getBoundingClientRect();
    const n = game.size;
    const x = Math.floor(((e.clientX - r.left) / r.width) * n);
    const y = Math.floor(((e.clientY - r.top) / r.height) * n);
    if (x < 0 || y < 0 || x >= n || y >= n) return -1;
    return y * n + x;
  }

  /** Đi từng ô từ đầu đường tới ô `target` (kéo nhanh có thể bỏ qua vài ô giữa hai lần pointermove). */
  function stepToward(target) {
    const n = game.size;
    for (let guard = 0; guard < n * n && drawing >= 0 && !won; guard++) {
      const p = game.paths[drawing];
      if (!p.length) return;
      const head = p[p.length - 1];
      if (head === target) return;
      const dr = Math.floor(target / n) - Math.floor(head / n);
      const dc = (target % n) - (head % n);
      const vert = dr ? head + Math.sign(dr) * n : -1;
      const horz = dc ? head + Math.sign(dc) : -1;
      const order = Math.abs(dr) >= Math.abs(dc) ? [vert, horz] : [horz, vert];
      const ok = order.some((c) => c >= 0 && apply(E.extend(game, drawing, c)));
      if (!ok) return;
    }
  }

  board.addEventListener('pointerdown', (e) => {
    if (won || kit.modal.current() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const cell = cellAt(e);
    if (cell < 0) return;
    e.preventDefault();
    showCursor = false;
    const r = E.touch(game, cell);
    if (r.color < 0) return;
    apply(r.game);
    if (won) return render();
    drawing = r.color;
    const p = game.paths[drawing];
    cursor = p[p.length - 1];
    kit.sfx('tap');
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    render();
  });
  board.addEventListener('pointermove', (e) => {
    if (drawing < 0) return;
    const cell = cellAt(e);
    if (cell < 0) return;
    const before = game;
    stepToward(cell);
    if (game !== before) {
      if (drawing >= 0) {
        const p = game.paths[drawing];
        cursor = p.length ? p[p.length - 1] : cursor;
      }
      render();
    }
  });
  const endStroke = () => {
    if (drawing < 0) return;
    drawing = -1;
    render();
    persist();
  };
  board.addEventListener('pointerup', endStroke);
  board.addEventListener('pointercancel', endStroke);
  board.addEventListener('lostpointercapture', endStroke);

  /* ---------------- Nút ---------------- */
  function undoLast() {
    if (won) return;
    const k = drawing >= 0 ? drawing : game.last;
    if (k < 0 || !apply(E.undo(game, k))) return;
    kit.sfx('move');
    if (drawing >= 0) {
      const p = game.paths[drawing];
      if (p.length) cursor = p[p.length - 1];
      else drawing = -1;
    }
    render();
    persist();
  }
  function resetBoard() {
    if (won || !apply(E.reset(game))) return;
    drawing = -1;
    kit.sfx('clear');
    render();
    persist();
  }

  $('btn-undo').addEventListener('click', undoLast);
  $('btn-reset').addEventListener('click', resetBoard);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-next').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    const m = settingMode();
    const s = stats.modes[m];
    $('stats-for').textContent = t('stats.for', { mode: m });
    $('stats-played').textContent = kit.i18n.fmtNumber(s.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(s.won);
    $('stats-best').textContent = s.best == null ? '–' : fmt(s.best, true);
    $('stats-perfect').textContent = kit.i18n.fmtNumber(s.perfect);
  });

  /* ---------------- Bàn phím ---------------- */
  const DIRS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };

  function arrow(dr, dc) {
    const n = game.size;
    const r = Math.floor(cursor / n) + dr;
    const c = (cursor % n) + dc;
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    const next = r * n + c;
    if (drawing < 0) {
      cursor = next;
      return;
    }
    if (!apply(E.extend(game, drawing, next))) {
      kit.sfx('error');
      return;
    }
    cursor = next;
    // Nối tới chấm thứ hai thì tự kết thúc đường
    if (drawing >= 0 && E.isConnected(game, drawing)) {
      drawing = -1;
      persist();
    }
  }

  function space() {
    if (drawing >= 0) {
      drawing = -1;
      persist();
      return;
    }
    const r = E.touch(game, cursor);
    if (r.color < 0) {
      kit.sfx('error');
      return;
    }
    apply(r.game);
    if (won) return;
    drawing = r.color;
    kit.sfx('tap');
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    // Space / Enter trên một nút đang focus là cú bấm của trình duyệt
    if ((k === ' ' || k === 'enter') && e.target && e.target.tagName === 'BUTTON') return;
    if (k === 'n') {
      e.preventDefault();
      return requestNew();
    }
    if (won) return;
    if (DIRS[k]) {
      showCursor = true;
      arrow(DIRS[k][0], DIRS[k][1]);
    } else if (k === ' ' || k === 'enter') {
      showCursor = true;
      space();
    } else if (k === 'backspace') {
      undoLast();
    } else if (k === 'r') {
      resetBoard();
    } else {
      return;
    }
    e.preventDefault();
    render();
  });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTime(); });

  /* ---------------- Khởi động: mở lại màn dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const savedMode = saved && MODES.indexOf(saved.mode) >= 0 ? saved.mode : null;
  const restored = savedMode && E.fromJSON(saved.game);
  if (restored && restored.size === E.MODES[savedMode].size && restored.moves > 0 && !E.isWon(restored)) {
    mode = savedMode;
    game = restored;
    cursor = game.dots[0][0];
    clock.set(saved.elapsed);
    kit.sdk.start(mode, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
  } else {
    newGame();
  }
})();
