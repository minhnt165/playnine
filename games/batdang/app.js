/* =====================================================================
 * Bất Đẳng - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ ('5' Dễ | '6' Vừa | '7' Khó) hoặc 'daily' (đề 6×6 chung theo ngày), metric time_low
 *   - Chọn ô (chạm / mũi tên) rồi điền số (bàn số / phím 1-N); chế độ ghi chú (N / Space / Shift+số);
 *     hoàn tác / làm lại không giới hạn; gợi ý sửa ô sai hoặc điền một ô suy ra được (tính là có trợ giúp)
 *   - Báo lỗi (Cài đặt): tô ô trùng hàng / cột và dấu bị vi phạm; tự xóa ghi chú khi điền số (Cài đặt)
 *   - Đồng hồ chạy từ lúc chia đề, dừng khi trang ẩn hoặc đang mở hộp thoại (bàn mờ đi); lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const SIZE_MODES = ['5', '6', '7'];
  const kit = PNKit.init({
    gameId: 'batdang',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { size: '5', errors: 'auto', autoNotes: true },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  /* ---------------- Thống kê ---------------- */

  // { played, won, clean, best: { 5, 6, 7, daily } (ms, chỉ đề không gợi ý), daily: { 'YYYY-MM-DD': ms } }
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
    const s = { played: num(raw.played), won: num(raw.won), clean: num(raw.clean), best: {}, daily: {} };
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
  let sel = -1; // ô đang chọn
  let noteMode = false;
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'mode', mode }
  let hintArmed = false; // đang chờ xác nhận gợi ý lần đầu
  let winTimer = 0;
  let cells = [];
  let hSigns = {}; // dấu ngang k → phần tử
  let vSigns = {};

  const solved = () => !!game && E.isSolved(game);
  /** Đề đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);
  const canAct = () => !!game && !solved() && !kit.modal.current();
  const showErrors = () => {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && !!game && game.mode === '5');
  };
  const autoNotes = () => kit.settings.get().autoNotes !== false;
  const sizeText = (m) => E.MODES[m].n + '×' + E.MODES[m].n;
  const modeLabel = (m) => t('mode.label' + (m === 'daily' ? 'Daily' : m));
  const lastSize = () => (SIZE_MODES.indexOf(kit.settings.get().size) >= 0 ? kit.settings.get().size : '5');

  /** Đồng hồ trên HUD: m:ss (h:mm:ss nếu quá một giờ). */
  function fmtClock(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? h + ':' + pad2(m) + ':' + pad2(s % 60) : m + ':' + pad2(s % 60);
  }
  /** Thời gian kỷ lục: m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    return Math.floor(ds / 600) + ':' + pad2(Math.floor((ds % 600) / 10)) + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }

  /* ---------------- Dựng bàn ---------------- */

  const board = $('board');
  const CHEVRON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M7 1.5 3 5l4 3.5"/></svg>';

  /** Dựng lại lưới khi chia đề mới: ô là nút (roving tabindex), dấu nằm ở khe giữa hai ô. */
  function buildBoard() {
    const n = game.n;
    // Ô 1fr, khe dấu 0,42fr (khớp --k trong style.css): bàn vuông nên hàng và cột như nhau
    const tracks = 'repeat(' + (n - 1) + ', minmax(0, 1fr) minmax(0, 0.42fr)) minmax(0, 1fr)';
    board.style.setProperty('--n', n);
    board.style.gridTemplateColumns = tracks;
    board.style.gridTemplateRows = tracks;
    board.dataset.size = game.mode;
    board.textContent = '';
    cells = [];
    hSigns = {};
    vSigns = {};
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell' + (game.givens[i] ? ' given' : '');
      b.dataset.i = i;
      b.innerHTML = '<span class="v"></span><span class="notes"></span>';
      b.style.gridRow = String(2 * r + 1);
      b.style.gridColumn = String(2 * c + 1);
      b.style.setProperty('--d', r + c);
      board.appendChild(b);
      cells.push(b);
    }
    const addSign = (kind, k, rel, row, col, d) => {
      const s = document.createElement('div');
      s.className = 'sign ' + kind + ' ' + (rel === E.LT ? 'lt' : 'gt');
      s.innerHTML = CHEVRON;
      s.style.gridRow = String(row);
      s.style.gridColumn = String(col);
      s.style.setProperty('--d', d);
      s.setAttribute('aria-hidden', 'true');
      board.appendChild(s);
      return s;
    };
    game.hs.forEach((rel, k) => {
      if (!rel) return;
      const r = Math.floor(k / (n - 1));
      const c = k % (n - 1);
      hSigns[k] = addSign('h', k, rel, 2 * r + 1, 2 * c + 2, r + c);
    });
    game.vs.forEach((rel, k) => {
      if (!rel) return;
      const r = Math.floor(k / n);
      const c = k % n;
      vSigns[k] = addSign('v', k, rel, 2 * r + 2, 2 * c + 1, r + c);
    });
    // Bàn số: chỉ hiện 1..N
    const pad = $('pad');
    pad.style.setProperty('--n', n);
    pad.style.setProperty('--half', Math.ceil(n / 2)); // màn hình ngang: bàn số hai hàng
    pad.querySelectorAll('.key').forEach((k) => { k.hidden = Number(k.dataset.d) > n; });
  }

  function notesHtml(mask) {
    let html = '';
    for (let d = 1; d <= game.n; d++) html += '<i>' + (mask & E.bit(d) ? d : '') + '</i>';
    return html;
  }

  function digitList(mask) {
    const out = [];
    for (let d = 1; d <= game.n; d++) if (mask & E.bit(d)) out.push(d);
    return out.join(' ');
  }

  /** Mô tả dấu quanh ô cho trình đọc màn hình: "nhỏ hơn ô bên phải"… */
  function relText(i) {
    const n = game.n;
    const r = Math.floor(i / n);
    const c = i % n;
    const out = [];
    const say = (rel, dir, first) => {
      if (!rel) return;
      const smaller = (rel === E.LT) === first;
      out.push(t('rel.' + (smaller ? 'lt' : 'gt'), { dir: t('dir.' + dir) }));
    };
    if (c < n - 1) say(game.hs[r * (n - 1) + c], 'right', true);
    if (c > 0) say(game.hs[r * (n - 1) + c - 1], 'left', false);
    if (r < n - 1) say(game.vs[i], 'down', true);
    if (r > 0) say(game.vs[i - n], 'up', false);
    return out;
  }

  /* ---------------- Vẽ ---------------- */

  function render() {
    if (!game) return;
    const n = game.n;
    if (cells.length !== n * n) buildBoard();
    const st = E.check(game);
    const err = showErrors() && !solved();
    const dup = new Set(err ? st.dup : []);
    const badH = new Set(err ? st.badH : []);
    const badV = new Set(err ? st.badV : []);
    const sr = sel >= 0 ? Math.floor(sel / n) : -1;
    const sc = sel >= 0 ? sel % n : -1;
    const sv = sel >= 0 ? game.vals[sel] : 0;

    cells.forEach((el, i) => {
      const v = game.vals[i];
      const notes = game.notes[i];
      const r = Math.floor(i / n);
      const c = i % n;
      el.classList.toggle('sel', i === sel);
      el.classList.toggle('peer', i !== sel && (r === sr || c === sc));
      el.classList.toggle('same', i !== sel && !!sv && v === sv);
      el.classList.toggle('dup', dup.has(i));
      el.tabIndex = i === (sel >= 0 ? sel : 0) ? 0 : -1;
      const vEl = el.firstChild;
      const nEl = el.lastChild;
      const vText = v ? String(v) : '';
      if (vEl.textContent !== vText) vEl.textContent = vText;
      const key = v ? '' : String(notes);
      if (nEl.dataset.k !== key) {
        nEl.dataset.k = key;
        nEl.innerHTML = !v && notes ? notesHtml(notes) : '';
      }
      const parts = [t('cell.label', { r: r + 1, c: c + 1 })];
      if (game.givens[i]) parts.push(t('cell.given', { d: v }));
      else if (v) parts.push(t('cell.value', { d: v }));
      else if (notes) parts.push(t('cell.notes', { list: digitList(notes) }));
      else parts.push(t('cell.empty'));
      if (dup.has(i)) parts.push(t('cell.wrong'));
      el.setAttribute('aria-label', parts.concat(relText(i)).join(', '));
    });
    Object.keys(hSigns).forEach((k) => hSigns[k].classList.toggle('bad', badH.has(Number(k))));
    Object.keys(vSigns).forEach((k) => vSigns[k].classList.toggle('bad', badV.has(Number(k))));
    board.classList.toggle('solved', solved());
    board.setAttribute('aria-label', t('board.label', { size: sizeText(game.mode), left: E.emptyCount(game) }));

    // Số liệu
    tick();
    $('left').textContent = kit.i18n.fmtNumber(E.emptyCount(game));

    // Công cụ
    const over = solved();
    $('btn-undo').disabled = !E.canUndo(game);
    $('btn-redo').disabled = !E.canRedo(game);
    $('btn-erase').disabled = over || sel < 0 || !!game.givens[sel] || (!game.vals[sel] && !game.notes[sel]);
    $('btn-hint').disabled = over;
    $('btn-notes').setAttribute('aria-pressed', String(noteMode));
    $('btn-notes').classList.toggle('on', noteMode);

    // Bàn số: ghi chú thì sáng các số đã ghi; điền thì sáng số đang có trong ô; số đã đủ N lần thì mờ
    const pad = $('pad');
    pad.classList.toggle('notes', noteMode);
    const count = new Array(n + 1).fill(0);
    game.vals.forEach((v) => { count[v]++; });
    pad.querySelectorAll('.key').forEach((b) => {
      const d = Number(b.dataset.d);
      if (d > n) return;
      const on = sel >= 0 && (noteMode ? !game.vals[sel] && !!(game.notes[sel] & E.bit(d)) : game.vals[sel] === d);
      b.classList.toggle('on', on);
      b.classList.toggle('full', count[d] >= n);
      b.disabled = over;
    });
    renderModes();
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
    $('daily-sub').textContent = done !== null ? '✓ ' + fmtClock(done) : sizeText('daily');
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
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
    if (!el || calm()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Đồng hồ ---------------- */

  /**
   * Đồng hồ chỉ chạy khi đề chưa xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn để không nhìn đề "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !solved();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    $('app').classList.toggle('paused', playing && open);
    tick();
  }
  const watcher = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', syncClock);

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
        ? {
          title: t('app.name') + ' · ' + modeLabel(m),
          detail: t('summary.resume', { mode: modeLabel(m), left: E.emptyCount(game) }),
          pct: Math.round(Math.max(0, Math.min(1, E.progress(game))) * 1000) / 1000,
        }
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
  const firstOpen = () => Math.max(0, game.givens.findIndex((v) => !v));

  function newPuzzle(m) {
    clearTimeout(winTimer);
    const mode = E.MODE_KEYS.indexOf(m) >= 0 ? m : '5';
    game = E.newGame({ mode, seed: randomSeed(), date: mode === 'daily' ? todayKey() : null });
    sel = firstOpen();
    noteMode = false;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    $('sr-status').textContent = '';
    if (mode !== 'daily' && kit.settings.get().size !== mode) kit.settings.set({ size: mode });
    buildBoard();
    render();
    replay(board, 'deal');
    syncClock();
    writeSummary();
  }

  /** Số lỗi luật hiện có (để phát tiếng báo lỗi khi vừa tạo thêm lỗi). */
  function errorCount(g) {
    const st = E.check(g);
    return st.dup.length + st.badH.length + st.badV.length;
  }

  /** Sau mỗi nước: vẽ, âm thanh, lưu; giải xong thì kết thúc ván. */
  function after(before, sound) {
    const worse = showErrors() && errorCount(game) > errorCount(before);
    syncClock();
    render();
    if (E.isSolved(game)) {
      finish();
      return;
    }
    kit.sfx(worse ? 'error' : sound);
    persist();
  }

  function select(i, focus) {
    if (!game || !Number.isInteger(i) || i < 0 || i >= game.n * game.n) return;
    sel = i;
    render();
    if (focus) cells[i].focus();
  }

  /** Bàn số / phím số: điền (chạm lại đúng số đang có thì xóa) hoặc bật / tắt ghi chú. */
  function input(d, asNote) {
    if (!canAct()) return;
    if (d > game.n) return;
    if (sel < 0) {
      kit.toast(t('toast.pick'));
      return;
    }
    if (game.givens[sel]) {
      kit.sfx('error');
      kit.toast(t('toast.given'));
      return;
    }
    const before = game;
    let sound;
    if (asNote || noteMode) {
      if (game.vals[sel]) {
        kit.sfx('error');
        return;
      }
      game = E.toggleNote(game, sel, d);
      sound = 'tap';
    } else {
      game = E.setValue(game, sel, d, { autoNotes: autoNotes() });
      sound = game.vals[sel] ? 'place' : 'pop';
      if (game.vals[sel]) replay(cells[sel], 'pop');
    }
    if (game !== before) after(before, sound);
  }

  function eraseCell() {
    if (!canAct() || sel < 0) return;
    const before = game;
    game = E.erase(game, sel);
    if (game !== before) after(before, 'pop');
  }

  /** Hoàn tác / làm lại: chọn ô vừa đổi. */
  function step(fn) {
    if (!canAct()) return;
    const before = game;
    const stack = fn === E.undo ? game.undo : game.redo;
    if (!stack.length) return;
    const cell = stack[stack.length - 1][0][0];
    game = fn(game);
    if (game === before) return;
    sel = cell;
    after(before, 'move');
  }

  function toggleNotes() {
    if (!game || solved()) return;
    noteMode = !noteMode;
    kit.sfx('tap');
    render();
  }

  /** Gợi ý: lần đầu trong đề thì hỏi trước (đề sẽ tính là có trợ giúp). */
  function requestHint() {
    if (!canAct()) return;
    if (game.hints > 0) {
      applyHint();
      return;
    }
    hintArmed = true;
    kit.modal.open('modal-hint');
  }

  function applyHint() {
    const first = game.hints === 0;
    const h = E.hint(game, sel, { autoNotes: autoNotes() });
    if (!h) return;
    const before = game;
    game = h.game;
    sel = h.cell;
    replay(cells[h.cell], 'hinted');
    const where = { r: Math.floor(h.cell / game.n) + 1, c: (h.cell % game.n) + 1 };
    if (first) kit.toast(t('toast.hintFirst'), 2600);
    else kit.toast(t(h.kind === 'fix' ? 'toast.hintFix' : 'toast.hintDeduce', where), 2000);
    after(before, 'coin');
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const assisted = game.hints > 0;
    const isBest = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    if (!assisted) stats.clean++;
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
    sel = -1;
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
    // Cho người chơi kịp thấy cả bàn sáng lên rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (solved()) kit.modal.open('modal-win');
    }, calm() ? 250 : 900);
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
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
    const onIt = game.mode === m && (m !== 'daily' || game.date === today) && !solved();
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
    if ((key === 'errors' || key === 'autoNotes') && game) render();
  }

  /** Mũi tên: đi một ô theo hướng (dừng ở mép). */
  function move(dr, dc) {
    if (!game) return;
    const n = game.n;
    if (sel < 0) {
      select(firstOpen(), true);
      return;
    }
    const r = Math.min(n - 1, Math.max(0, Math.floor(sel / n) + dr));
    const c = Math.min(n - 1, Math.max(0, (sel % n) + dc));
    select(r * n + c, true);
  }

  /* ---------------- Sự kiện ---------------- */

  board.addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b && game && !solved()) select(Number(b.dataset.i));
  });
  $('pad').addEventListener('click', (e) => {
    const b = e.target.closest('.key');
    if (b) input(Number(b.dataset.d), e.shiftKey);
  });
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => requestMode(b.dataset.mode)));
  $('btn-undo').addEventListener('click', () => step(E.undo));
  $('btn-redo').addEventListener('click', () => step(E.redo));
  $('btn-erase').addEventListener('click', eraseCell);
  $('btn-notes').addEventListener('click', toggleNotes);
  $('btn-hint').addEventListener('click', requestHint);
  $('btn-hint-ok').addEventListener('click', () => {
    const armed = hintArmed;
    hintArmed = false;
    kit.modal.close('modal-hint');
    if (armed && canAct()) applyHint();
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newPuzzle(nextModeForNew());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-clean').textContent = kit.i18n.fmtNumber(stats.clean);
    $('stats-daily').textContent = kit.i18n.fmtNumber(dailyStreak());
    E.MODE_KEYS.forEach((m) => { $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
  });

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (kit.modal.current() || !game) return;
    const k = e.key;
    const lower = k.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Z hoàn tác, Ctrl+Y / Ctrl+Shift+Z làm lại
      if (e.altKey) return;
      if (lower === 'z' && !e.shiftKey) step(E.undo);
      else if (lower === 'y' || (lower === 'z' && e.shiftKey)) step(E.redo);
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey) return;
    // Nút của thanh trên / hộp thoại / thanh chọn cỡ giữ hành vi Space mặc định; ô, bàn số, công cụ thì Space = ghi chú
    const onGame = !!(e.target.closest && e.target.closest('.board, .pad, .tools'));
    const onOtherButton = !onGame && e.target.closest && e.target.closest('button, input, a[href]');
    // Chữ số: dùng e.code để Shift+số (ra !, @…) vẫn nhận ra là số → ghi chú
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    const digit = m ? Number(m[1]) : k >= '0' && k <= '9' && k.length === 1 ? Number(k) : -1;
    if (digit >= 1) input(digit, e.shiftKey);
    else if (digit === 0 || k === 'Backspace' || k === 'Delete') eraseCell();
    else if (ARROWS[k]) {
      if (e.target.closest && e.target.closest('.segmented')) return; // mũi tên trong thanh chọn cỡ
      move(ARROWS[k][0], ARROWS[k][1]);
    } else if (k === ' ') {
      if (onOtherButton) return; // Space trên nút khác: để trình duyệt bấm nút đó
      toggleNotes();
    } else if (lower === 'n') toggleNotes();
    else if (lower === 'z') step(E.undo);
    else if (lower === 'y') step(E.redo);
    else if (lower === 'h') requestHint();
    else return;
    e.preventDefault();
  });
  // Space trên ô / bàn số / công cụ: chặn cả keyup để trình duyệt không "bấm" nút đó thêm lần nữa
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && e.target.closest && e.target.closest('.board, .pad, .tools')) e.preventDefault();
  });

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isSolved(restored)) {
    game = restored;
    sel = firstOpen();
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(game.mode, true);
    buildBoard();
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
