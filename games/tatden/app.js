/* =====================================================================
 * Tắt Đèn - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi bàn là một ván; mode = cỡ bàn ('5x5' | '7x7'), metric wins
 *   - Thắng thì lên cấp (mỗi cỡ bàn một cấp riêng, lưu trong stats); chơi lại bàn không tính là bỏ ván
 *   - Báo ván cho cổng:
 *     - bàn mới: kit.sdk.start(mode); mở lại bàn lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted: false })
 *     - bỏ bàn (bàn mới / đổi cỡ) khi đã bấm ít nhất một lần: won: false; chưa bấm lần nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['5x5', '7x7'];
  const kit = PNKit.init({ gameId: 'tatden', version: '1.0.1', dict: window.GAME_DICT, defaults: { size: '5x5' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const modeOf = (size) => size + 'x' + size;
  const sizeOf = (mode) => (mode === '7x7' ? 7 : 5);
  const otherMode = (mode) => (mode === '5x5' ? '7x7' : '5x5');

  const defaults = { played: 0, won: 0, par: 0, streak: 0, levels: { '5x5': 1, '7x7': 1 } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.levels = Object.assign({}, defaults.levels, stats.levels || {});
  MODES.forEach((m) => { if (!Number.isInteger(stats.levels[m]) || stats.levels[m] < 1) stats.levels[m] = 1; });

  let game = null;
  let cursor = 0; // ô đang chọn bằng bàn phím
  let pending = null; // việc chờ xác nhận bỏ bàn: { kind: 'new' } | { kind: 'size', mode }
  let winTimer = 0;
  let cells = [];

  const mode = () => modeOf(game.size);
  /** Bàn đang dở: đã bấm ít nhất một lần và chưa tắt hết (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.total > 0 && !E.isSolved(game);

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới ô khi đổi cỡ bàn; ô là nút, chỉ ô con trỏ nhận Tab (roving tabindex). */
  function buildBoard() {
    const board = $('board');
    board.style.setProperty('--n', game.size);
    board.dataset.size = game.size;
    board.textContent = '';
    cells = [];
    for (let i = 0; i < game.size * game.size; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.i = i;
      b.style.setProperty('--d', Math.floor(i / game.size) + (i % game.size));
      board.appendChild(b);
      cells.push(b);
    }
  }

  function render() {
    if (cells.length !== game.size * game.size) buildBoard();
    const lit = E.litCount(game.lights);
    cells.forEach((b, i) => {
      const on = game.lights[i] === 1;
      b.classList.toggle('on', on);
      b.tabIndex = i === cursor ? 0 : -1;
      b.setAttribute('aria-label', t(on ? 'cell.on' : 'cell.off', { r: Math.floor(i / game.size) + 1, c: (i % game.size) + 1 }));
    });
    const board = $('board');
    board.classList.toggle('solved', E.isSolved(game));
    board.setAttribute('aria-label', t('board.label', { n: lit }));
    $('level').textContent = kit.i18n.fmtNumber(game.level);
    $('moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('par').textContent = kit.i18n.fmtNumber(game.par);
    $('moves').classList.toggle('over', game.moves > game.par);
    $('btn-restart').disabled = game.moves === 0 || E.isSolved(game);
    const m = mode();
    $('btn-size').textContent = m;
    $('btn-size').setAttribute('aria-label', t('size.badge', { size: m, next: otherMode(m) }));
    $('btn-size').title = t('size.name');
  }

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Hiệu ứng lan: ô vừa bấm nảy + vòng sáng, 4 ô kề rung theo ngay sau. */
  function ripple(i) {
    if (calm()) return;
    $('board').classList.remove('deal'); // lớp deal đè hiệu ứng của ô
    cells.forEach((b) => b.classList.remove('hit', 'wave'));
    replay(cells[i], 'hit');
    E.neighbours(game.size, i).forEach((j) => replay(cells[j], 'wave'));
  }

  /** Bàn mới / chơi lại: đèn hiện dần theo đường chéo. */
  function deal() {
    if (calm()) return;
    cells.forEach((b) => b.classList.remove('hit', 'wave'));
    replay($('board'), 'deal');
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? mode() : kit.settings.get().size;
    const level = stats.levels[m] || 1;
    const lit = game ? E.litCount(game.lights) : 0;
    const startLit = game ? Math.max(1, E.litCount(game.start)) : 1;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played === 0 ? t('summary.none') : t('summary.note', { level, size: m }),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(level), label: t('hud.level') }]
        : [],
      resume: inPlay()
        ? { title: t('app.name') + ' ' + m, detail: t('summary.resume', { level: game.level, n: lit }), pct: Math.max(0, Math.min(1, 1 - lit / startLit)) }
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
    const size = sizeOf(m);
    game = E.newGame({ size, level: stats.levels[m], seed: Math.floor(Math.random() * 4294967296) });
    cursor = Math.min(cursor, size * size - 1);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    deal();
    writeSummary();
  }

  function press(i) {
    if (!game || E.isSolved(game) || kit.modal.current()) return;
    const next = E.press(game, i);
    if (next === game) return;
    game = next;
    cursor = i;
    clock.resume();
    ripple(i); // gắn lớp hiệu ứng trước khi đổi đèn để độ trễ của ô kề có tác dụng
    render();
    if (E.isSolved(game)) finish();
    else {
      kit.sfx(game.lights[i] ? 'flip' : 'tap');
      persist();
    }
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const onPar = game.moves <= game.par;
    stats.played++;
    stats.won++;
    stats.streak++;
    if (onPar) stats.par++;
    stats.levels[m] = Math.max(stats.levels[m], game.level + 1);
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted: false });
    kit.sfx('win');
    kit.confetti();

    $('win-text').textContent = t('win.text', { n: game.moves, moves: kit.i18n.fmtNumber(game.moves), par: kit.i18n.fmtNumber(game.par) });
    const badge = $('win-badge');
    const diff = game.moves - game.par;
    badge.textContent = diff < 0 ? t('win.under') : diff === 0 ? t('win.on') : t('win.over', { n: diff });
    badge.classList.toggle('good', diff <= 0);
    $('win-next').textContent = t('win.next', { level: kit.i18n.fmtNumber(stats.levels[m]) });
    // Cho người chơi kịp thấy cả bàn tắt rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (game && E.isSolved(game)) kit.modal.open('modal-win');
    }, calm() ? 0 : 700);
  }

  function restartBoard() {
    if (!game || game.moves === 0 || E.isSolved(game)) return;
    game = E.restart(game);
    kit.sfx('move');
    render();
    deal();
    persist();
    kit.toast(t('toast.restart'));
  }

  /** Bỏ bàn đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'size' ? t('confirm.size', { size: p.mode }) : t('btn.new');
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

  /** Đổi cỡ bàn: chia bàn mới cỡ đó trước, rồi lưu cài đặt (onSetting gặp cỡ đã khớp nên không làm gì). */
  function switchSize(m) {
    newBoard(m);
    kit.settings.set({ size: m });
  }

  /** Yêu cầu đổi cỡ (từ Cài đặt hoặc huy hiệu cỡ bàn). Bàn đang dở thì giữ cài đặt cũ và hỏi trước. */
  function requestSize(m) {
    if (MODES.indexOf(m) < 0 || !game || m === mode()) return;
    if (inPlay()) {
      kit.settings.set({ size: mode() });
      askConfirm({ kind: 'size', mode: m });
    } else {
      switchSize(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'size') requestSize(value);
  }

  /* ---------------- Sự kiện ---------------- */

  $('board').addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b) press(Number(b.dataset.i));
  });
  $('btn-restart').addEventListener('click', restartBoard);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-size').addEventListener('click', () => requestSize(otherMode(mode())));
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-next').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(mode());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-par').textContent = kit.i18n.fmtNumber(stats.par);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    $('stats-level5-label').textContent = t('stats.level', { size: '5x5' });
    $('stats-level7-label').textContent = t('stats.level', { size: '7x7' });
    $('stats-level5').textContent = kit.i18n.fmtNumber(stats.levels['5x5']);
    $('stats-level7').textContent = kit.i18n.fmtNumber(stats.levels['7x7']);
  });

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    const onCell = !!(e.target.closest && e.target.closest('.cell'));
    const onOtherButton = !onCell && e.target.closest && e.target.closest('button, input, a[href]');
    if (ARROWS[k]) {
      const n = game.size;
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + ARROWS[k][0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + ARROWS[k][1]));
      cursor = r * n + c;
      render();
      cells[cursor].focus();
    } else if (k === ' ' || k === 'enter') {
      // Nút khác đang focus (Chơi lại, Bàn mới…) thì để trình duyệt bấm nút đó
      if (onOtherButton) return;
      if (!onCell) cells[cursor].focus();
      press(cursor);
    } else if (k === 'r') restartBoard();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Space trên nút ô: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  $('board').addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại bàn dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  /** Cài đặt cỡ bàn đi theo bàn đang có (ghi thẳng, không qua onSetting). */
  function syncSizeSetting() {
    if (kit.settings.get().size === mode()) return;
    kit.settings.get().size = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  if (restored && restored.total > 0 && !E.isSolved(restored)) {
    game = restored;
    const m = mode();
    syncSizeSetting();
    clock.set(saved.elapsed);
    kit.sdk.start(m, true);
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().size;
    newBoard(MODES.indexOf(m) >= 0 ? m : '5x5');
    syncSizeSetting();
  }
})();
