/* =====================================================================
 * Sao Chiến - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, puzzles.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ ('5' | '8' | '10') hoặc 'daily' (đề 8x8 chung theo ngày), metric time_low
 *   - Chạm ô xoay vòng dấu (thứ tự theo Cài đặt), kéo qua nhiều ô để chấm / xóa chấm hàng loạt (một nước),
 *     chuột phải bật / tắt chấm; bàn phím: mũi tên + Space / Enter / S / X
 *   - Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại / ẩn tab (bàn bị làm mờ lúc dừng), lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const SIZE_MODES = ['5', '8', '10'];
  const kit = PNKit.init({
    gameId: 'saochien',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { size: '5', errors: true, auto: true, order: 'dot' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  /* ---------------- Thống kê ---------------- */

  // { played, won, streak, best: { 5, 8, 10, daily } (ms, chỉ đề không gợi ý), daily: { 'YYYY-MM-DD': ms } }
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
    const s = { played: num(raw.played), won: num(raw.won), streak: num(raw.streak), best: {}, daily: {} };
    E.MODE_KEYS.forEach((m) => {
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
  /** Số ngày liên tiếp đã giải đề hằng ngày (tính tới hôm nay, hoặc hôm qua nếu hôm nay chưa giải). */
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
  let cursor = 0; // ô đang chọn bằng bàn phím
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'mode', mode }
  let winTimer = 0;
  let cells = [];
  let rowEdge = [];
  let colEdge = [];
  let builtFor = null; // bảng vùng đang dựng trên DOM

  const won = () => !!game && E.isWon(game);
  /** Đề đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isWon(game);
  const canAct = () => !!game && !won() && !kit.modal.current();
  const showErrors = () => kit.settings.get().errors !== false;
  const autoDot = () => kit.settings.get().auto !== false;
  const order = () => (kit.settings.get().order === 'star' ? 'star' : 'dot');
  const sizeText = (m) => E.MODES[m].n + '×' + E.MODES[m].n;
  const modeLabel = (m) => t(m === 'daily' ? 'mode.labelDaily' : 'mode.label' + m);
  const lastSize = () => (SIZE_MODES.indexOf(kit.settings.get().size) >= 0 ? kit.settings.get().size : '5');

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

  /* ---------------- Dựng bàn ---------------- */

  const board = $('board');
  const grid = $('grid');
  const SVG = 'http://www.w3.org/2000/svg';

  /** Dựng lại ô, số đếm ở mép và lớp viền vùng khi có đề mới. Ô là nút; chỉ ô con trỏ nhận Tab (roving tabindex). */
  function buildBoard() {
    const n = game.n;
    builtFor = game.regions;
    board.style.setProperty('--n', n);
    grid.textContent = '';
    cells = [];
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.i = i;
      b.style.setProperty('--rc', 'var(--r' + (game.regions[i] % 10) + ')');
      b.style.setProperty('--d', Math.floor(i / n) + (i % n));
      grid.appendChild(b);
      cells.push(b);
    }
    const edge = (el) => {
      el.textContent = '';
      const out = [];
      for (let x = 0; x < n; x++) out.push(el.appendChild(document.createElement('span')));
      return out;
    };
    rowEdge = edge($('edge-r'));
    colEdge = edge($('edge-b'));
    drawLines();
  }

  /** Lớp SVG (đơn vị = ô): đường lưới mảnh trong cùng vùng, đường dày giữa hai vùng, khung ngoài. */
  function drawLines() {
    const n = game.n;
    const reg = game.regions;
    let thin = '';
    let thick = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (c < n - 1) {
          const seg = 'M' + (c + 1) + ' ' + r + 'v1';
          if (reg[i] === reg[i + 1]) thin += seg;
          else thick += seg;
        }
        if (r < n - 1) {
          const seg = 'M' + c + ' ' + (r + 1) + 'h1';
          if (reg[i] === reg[i + n]) thin += seg;
          else thick += seg;
        }
      }
    }
    const svg = $('lines');
    svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    svg.textContent = '';
    const add = (tag, attrs) => {
      const el = document.createElementNS(SVG, tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      svg.appendChild(el);
    };
    add('path', { class: 'thin', d: thin });
    add('path', { class: 'thick', d: thick });
    add('rect', { class: 'frame', x: 0, y: 0, width: n, height: n });
  }

  /* ---------------- Vẽ ---------------- */

  function render() {
    if (!game) return;
    const n = game.n;
    if (builtFor !== game.regions || cells.length !== n * n) buildBoard();
    const st = E.status(game);
    const errs = showErrors() && !won();
    const bad = new Uint8Array(n * n);
    const warn = new Uint8Array(n * n);
    if (errs) {
      st.bad.forEach((i) => { bad[i] = 1; });
      const regs = st.over.regions.concat(st.blocked.regions);
      for (let i = 0; i < n * n; i++) if (regs.indexOf(game.regions[i]) >= 0) warn[i] = 1;
    }
    cells.forEach((b, i) => {
      const m = game.marks[i];
      b.classList.toggle('star', m === E.STAR);
      b.classList.toggle('dot', m === E.DOT);
      b.classList.toggle('auto', m === E.AUTO);
      b.classList.toggle('bad', !!bad[i]);
      b.classList.toggle('warn', !!warn[i]);
      b.tabIndex = i === cursor ? 0 : -1;
      let label = t('cell.label', { r: Math.floor(i / n) + 1, c: (i % n) + 1, g: game.regions[i] + 1 });
      if (m === E.STAR) label += ', ' + t('cell.star');
      else if (m !== E.EMPTY) label += ', ' + t('cell.dot');
      if (bad[i]) label += ', ' + t('cell.error');
      b.setAttribute('aria-label', label);
    });
    const edgeCell = (span, left, unit, blocked) => {
      span.textContent = left === 0 ? '✓' : left < 0 ? '+' + -left : String(left);
      span.classList.toggle('done', left === 0);
      span.classList.toggle('bad', errs && (left < 0 || blocked.indexOf(unit) >= 0));
    };
    rowEdge.forEach((s, r) => edgeCell(s, st.rowLeft[r], r, st.blocked.rows));
    colEdge.forEach((s, c) => edgeCell(s, st.colLeft[c], c, st.blocked.cols));

    board.classList.toggle('solved', won());
    grid.setAttribute('aria-label', t('board.label', { size: sizeText(game.mode), k: game.k }));
    $('stars').textContent = st.rowStars.reduce((a, b) => a + b, 0) + '/' + n * game.k;
    $('btn-undo').disabled = !E.canUndo(game);
    $('btn-redo').disabled = !E.canRedo(game);
    $('btn-hint').disabled = won();
    renderModes();
    tick();
  }

  function renderModes() {
    const today = todayKey();
    document.querySelectorAll('#modes button').forEach((b) => {
      const m = b.dataset.mode;
      b.setAttribute('aria-checked', String(m === game.mode));
      b.tabIndex = m === game.mode ? 0 : -1;
      b.setAttribute('aria-label', modeLabel(m));
    });
    const done = dailyTime(today);
    document.querySelector('#modes [data-mode="daily"]').classList.toggle('done', done !== null);
    $('daily-sub').textContent = done !== null ? '✓ ' + fmtClock(done) : sizeText('daily') + ' · 1★';
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
    document.querySelector('.help-touch').textContent = t(order() === 'star' ? 'help.touchStar' : 'help.touch');
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

  /**
   * Đồng hồ chỉ chạy khi đề chưa xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn để không nhìn đề "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !won();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    if (open) endDrag(null);
    $('app').classList.toggle('paused', playing && open);
    tick();
  }

  /* ---------------- Lưu ---------------- */

  function writeSummary() {
    const m = game ? game.mode : lastSize();
    const sm = SIZE_MODES.indexOf(m) >= 0 ? m : lastSize();
    const best = stats.best[sm];
    const today = todayKey();
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' ' + sizeText(sm) });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { mode: modeLabel(sm), time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? { title: t('app.name') + ' · ' + modeLabel(m), detail: t('summary.resume', { mode: modeLabel(m), time: fmtClock(clock.elapsed()) }), pct: Math.round(E.progress(game) * 1000) / 1000 }
        : null,
      daily: { date: today, done: dailyTime(today) !== null, title: t('summary.dailyTitle'), streak: dailyStreak() },
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  const randomSeed = () => Math.floor(Math.random() * 4294967296);

  function newPuzzle(m) {
    clearTimeout(winTimer);
    endDrag(null);
    const mode = E.MODE_KEYS.indexOf(m) >= 0 ? m : '5';
    game = E.newGame({ mode, seed: randomSeed(), date: mode === 'daily' ? todayKey() : null });
    cursor = Math.min(cursor, game.n * game.n - 1);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    $('sr-status').textContent = '';
    if (mode !== 'daily' && kit.settings.get().size !== mode) kit.settings.set({ size: mode });
    render();
    if (!calm()) replay(board, 'deal');
    syncClock();
    writeSummary();
  }

  /** Số lỗi chắc chắn (sao vi phạm, đơn vị hết chỗ) để phát tiếng báo lỗi khi vừa tạo thêm lỗi. */
  function hardErrors(g) {
    const st = E.status(g);
    return st.bad.length + st.blocked.rows.length + st.blocked.cols.length + st.blocked.regions.length;
  }

  /** Áp một nước (chạm, hoàn tác, gợi ý…): vẽ lại, lưu, kiểm tra thắng. */
  function apply(next, sound, cell) {
    if (!game || next === game || won()) return false;
    const before = showErrors() ? hardErrors(game) : 0;
    const prevMark = cell != null ? game.marks[cell] : null;
    game = next;
    if (cell != null) cursor = cell;
    render();
    if (cell != null && !calm() && game.marks[cell] === E.STAR && prevMark !== E.STAR) replay(cells[cell], 'pop');
    if (E.isWon(game)) {
      finish();
      return true;
    }
    kit.sfx(showErrors() && hardErrors(game) > before ? 'error' : sound);
    persist();
    return true;
  }

  /** Tiếng theo dấu mới của ô: sao = place, còn lại = tap. */
  const soundFor = (g, i) => (g.marks[i] === E.STAR ? 'place' : 'tap');

  function press(i) {
    if (!canAct()) return;
    const next = E.tap(game, i, order(), autoDot());
    apply(next, soundFor(next, i), i);
  }

  function toggleMark(i, mark) {
    if (!canAct()) return;
    const next = E.toggle(game, i, mark, autoDot());
    apply(next, soundFor(next, i), i);
  }

  function clearCell(i) {
    if (!canAct()) return;
    apply(E.setMark(game, i, E.EMPTY), 'tap', i);
  }

  function undo() {
    if (!game || kit.modal.current() || !E.canUndo(game)) return;
    const step = game.history[game.history.length - 1];
    apply(E.undo(game), 'move', step[0][0]);
  }

  function redo() {
    if (!game || kit.modal.current() || !E.canRedo(game)) return;
    const step = game.future[game.future.length - 1];
    apply(E.redo(game), 'move', step[0][0]);
  }

  function hint() {
    if (!canAct()) return;
    const h = E.hint(game, { auto: autoDot() });
    if (!h) return;
    const first = game.hints === 0;
    apply(h.game, 'flip', h.cell);
    if (!won()) {
      cells[h.cell].focus();
      const where = { r: Math.floor(h.cell / game.n) + 1, c: (h.cell % game.n) + 1 };
      const msg = h.kind === 'fix' ? 'toast.hintFix' : h.kind === 'deduce' ? 'toast.hintDeduce' : 'toast.hintReveal';
      kit.toast(first ? t('toast.hintFirst') : t(msg, where), first ? 2600 : 2000);
    }
    if (!calm()) replay(cells[h.cell], 'hinted');
  }

  function finish() {
    endDrag(null);
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const assisted = game.hints > 0;
    const isBest = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (isBest) stats.best[m] = ms;
    if (m === 'daily' && game.date) {
      const prev = dailyTime(game.date);
      stats.daily[game.date] = prev === null ? ms : Math.min(prev, ms);
    }
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    $('sr-status').textContent = t('sr.won', { time: fmt(ms) });
    render();
    $('app').classList.remove('paused');

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest;
    badge.textContent = t('win.best', { mode: modeLabel(m) });
    const notes = [];
    if (assisted) notes.push(t('win.assisted', { n: game.hints }));
    else if (!isBest && stats.best[m] != null) notes.push(t('win.noteBest', { mode: modeLabel(m), time: fmt(stats.best[m]) }));
    if (m === 'daily') notes.push(t('win.daily', { n: dailyStreak() }));
    $('win-note').textContent = notes.join(' ');
    $('win-note').hidden = !notes.length;
    // Cho người chơi kịp thấy bàn đã giải rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 250 : 900);
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

  /** Đề mới: cùng cỡ; đang chơi đề hằng ngày thì về cỡ đã chọn gần nhất. */
  const nextModeForNew = () => (game && game.mode !== 'daily' ? game.mode : lastSize());

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newPuzzle(nextModeForNew());
    }
  }

  /** Chọn cỡ / đề hằng ngày. Đang giải dở thì hỏi trước; đề hôm nay đã xong thì chỉ báo thời gian. */
  function requestMode(m) {
    if (!game || E.MODE_KEYS.indexOf(m) < 0) return;
    const today = todayKey();
    const onIt = game.mode === m && (m !== 'daily' || game.date === today) && !won();
    if (onIt) return;
    if (m === 'daily' && dailyTime(today) !== null) {
      kit.toast(t('toast.dailyDone', { time: fmt(dailyTime(today)) }), 2800);
      return;
    }
    if (inPlay()) askConfirm({ kind: 'mode', mode: m });
    else {
      kit.modal.close('modal-win');
      newPuzzle(m);
    }
  }

  function onSetting(key) {
    if ((key === 'errors' || key === 'order') && game) render();
  }

  /* ---------------- Chuột / chạm: chạm = đổi dấu, kéo = chấm hàng loạt ---------------- */

  /** Ô dưới điểm (x, y) theo khung lưới; ngoài lưới thì -1. */
  function cellAt(x, y) {
    const r = grid.getBoundingClientRect();
    const n = game.n;
    const c = Math.floor(((x - r.left) / r.width) * n);
    const w = Math.floor(((y - r.top) / r.height) * n);
    if (c < 0 || w < 0 || c >= n || w >= n) return -1;
    return w * n + c;
  }

  // { id, start, lx, ly, base, list, mark, painting, lastSound }
  let drag = null;

  grid.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !canAct()) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    drag = { id: e.pointerId, start: i, lx: e.clientX, ly: e.clientY, base: game, list: [i], mark: null, painting: false, lastSound: 0 };
    cursor = i;
  });

  grid.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !canAct()) return;
    // Lấy mẫu dọc đoạn ngón tay vừa đi (mỗi 1/3 ô) để không bỏ sót ô khi kéo nhanh
    const r = grid.getBoundingClientRect();
    const step = r.width / game.n / 3;
    const len = Math.hypot(e.clientX - drag.lx, e.clientY - drag.ly);
    const k = Math.max(1, Math.ceil(len / step));
    let changed = false;
    for (let s = 1; s <= k; s++) {
      const i = cellAt(drag.lx + ((e.clientX - drag.lx) * s) / k, drag.ly + ((e.clientY - drag.ly) * s) / k);
      if (i < 0 || drag.list[drag.list.length - 1] === i) continue;
      if (!drag.painting) {
        // Bắt đầu kéo: từ ô có chấm thì xóa chấm, từ ô trống / sao thì đánh chấm
        const m0 = drag.base.marks[drag.start];
        drag.mark = m0 === E.DOT || m0 === E.AUTO ? E.EMPTY : E.DOT;
        drag.painting = true;
      }
      if (drag.list.indexOf(i) < 0) {
        drag.list.push(i);
        changed = true;
      }
    }
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    if (!changed) return;
    const next = E.paint(drag.base, drag.list, drag.mark);
    if (next === game) return;
    game = next;
    cursor = drag.list[drag.list.length - 1];
    render();
    const now = performance.now();
    if (now - drag.lastSound > 90) {
      drag.lastSound = now;
      kit.sfx('tap');
    }
  });

  /** Nhả tay: không kéo thì là một lần chạm; đã kéo thì chốt nước chấm hàng loạt. */
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    if (d.painting) {
      if (game !== d.base) persist();
    } else if (e && e.type === 'pointerup') {
      press(d.start);
    }
  }
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
  // Chuột phải: bật / tắt chấm
  grid.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!game) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0) toggleMark(i, E.DOT);
  });

  /* ---------------- Nút ---------------- */

  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => requestMode(b.dataset.mode)));
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-hint').addEventListener('click', hint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newPuzzle(nextModeForNew());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    $('stats-daily').textContent = kit.i18n.fmtNumber(dailyStreak());
    E.MODE_KEYS.forEach((m) => { $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
  });

  /* ---------------- Bàn phím ---------------- */

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
      if (target.closest && target.closest('.segmented')) return; // mũi tên trong thanh chọn cỡ để trình duyệt / kit xử lý
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
    } else if (k === 's' || k === '*') toggleMark(cursor, E.STAR);
    else if (k === 'x' || k === '.') toggleMark(cursor, E.DOT);
    else if (k === 'backspace' || k === 'delete' || k === '0') clearCell(cursor);
    else if (k === 'z' || k === 'u') undo();
    else if (k === 'y' || k === 'r') redo();
    else if (k === 'h') hint();
    else if (k === 'n') requestNew();
    else if (k >= '1' && k <= '4') requestMode(E.MODE_KEYS[Number(k) - 1]);
    else return;
    e.preventDefault();
  });
  // Space trên nút ô: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  grid.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
  grid.addEventListener('focusin', (e) => {
    const b = e.target.closest('.cell');
    if (b) cursor = Number(b.dataset.i);
  });

  /* ---------------- Đồng hồ theo hộp thoại / tab ---------------- */

  const observer = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endDrag(null);
    else syncClock();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(game.mode, true);
    render();
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
