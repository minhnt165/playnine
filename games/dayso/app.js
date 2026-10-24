/* =====================================================================
 * Dãy Số - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ đề ('s' Dễ 6×6 | 'm' Vừa 8×8 | 'l' Khó 10×10), metric time_low
 *   - "Số tiếp theo" (cur) hiện ở thanh dưới bàn: chạm ô trống là đặt cur vào đó rồi cur tự chuyển
 *     sang số kế; chạm một số trên bàn để nối tiếp dãy từ số đó; chạm thanh để chọn số bất kỳ
 *   - Vẽ đường: kéo từ một số (hoặc từ ô trống vừa đặt) qua các ô kề để đặt tiếp k + 1, k + 2…
 *     (đi ngược nếu k + 1 đã có mà k - 1 chưa có); kéo lùi lại ô trước để rút bớt; cả lần kéo là
 *     một lần hoàn tác
 *   - Bàn phím: mũi tên chọn ô, gõ số (một hoặc hai chữ số) để điền, Space / Enter đặt số tiếp theo
 *   - Ghi chú (tối đa 4 số / ô), hoàn tác / làm lại không giới hạn, gợi ý đặt đúng số tiếp theo
 *     (tính là có trợ giúp: assisted)
 *   - Đồng hồ chạy từ lúc chia đề, dừng khi trang ẩn hoặc đang mở hộp thoại; lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted })
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = E.MODE_KEYS;
  const kit = PNKit.init({
    gameId: 'dayso',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { size: 's', errors: 'auto' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const nextMode = (m) => MODES[(MODES.indexOf(m) + 1) % MODES.length];
  const isMode = (m) => MODES.indexOf(m) >= 0;

  /* Thống kê: kỷ lục từng cỡ chỉ tính ván không dùng gợi ý */
  const stats = Object.assign({ played: 0, won: 0, clean: 0 }, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, stats.best || {});
  ['played', 'won', 'clean'].forEach((k) => { if (!Number.isInteger(stats[k]) || stats[k] < 0) stats[k] = 0; });
  MODES.forEach((m) => { if (!(Number.isFinite(stats.best[m]) && stats.best[m] > 0)) stats.best[m] = null; });

  let game = null;
  let sel = -1; // ô đang chọn (bàn phím)
  let cur = -1; // số tiếp theo cần đặt (-1: bàn đã đủ số)
  let dir = 1; // chiều nối dãy: +1 xuôi, -1 ngược
  let noteMode = false;
  let typing = null; // đang gõ số bằng bàn phím: { cell, buf, timer }
  let drag = null; // đang chạm / kéo trên bàn
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'size', mode }
  let hintTarget = -1; // ô chờ xác nhận gợi ý lần đầu
  let winTimer = 0;
  let els = []; // phần tử theo chỉ số ô

  const grid = $('grid');
  const mode = () => game.mode;
  const solved = () => !!game && E.isSolved(game);
  /** Ván đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);
  const showErrors = () => {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && !!game && game.mode === 's');
  };

  /** m:ss (h:mm:ss nếu quá một giờ). */
  function fmt(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* ---------------- Số tiếp theo ---------------- */

  /** Sau khi có số k trên bàn: số kế theo chiều d nếu còn thiếu, không thì số thiếu nhỏ nhất sau k. */
  function advanceFrom(k, d) {
    const pos = E.positions(game);
    const nx = k + d;
    if (nx >= 1 && nx <= game.N && pos[nx] < 0) {
      cur = nx;
      dir = d;
    } else {
      cur = E.nextMissing(game, k);
      dir = 1;
    }
  }
  /** Chiều nối dãy từ số k: xuôi nếu k + 1 còn thiếu, ngược nếu chỉ k - 1 còn thiếu. */
  function dirFrom(k) {
    const pos = E.positions(game);
    if (k < game.N && pos[k + 1] < 0) return 1;
    if (k > 1 && pos[k - 1] < 0) return -1;
    return 1;
  }
  /** Chọn số tiếp theo là k (đang thiếu): chiều theo phía đã có số bên cạnh. */
  function pickCur(k) {
    const pos = E.positions(game);
    cur = k;
    dir = k > 1 && pos[k - 1] >= 0 ? 1 : k < game.N && pos[k + 1] >= 0 ? -1 : 1;
  }
  /** Giữ cur hợp lệ sau hoàn tác / gợi ý…: cur đã có trên bàn thì lấy số thiếu nhỏ nhất từ cur. */
  function fixCur() {
    if (!game) return;
    const pos = E.positions(game);
    if (cur >= 1 && cur <= game.N && pos[cur] < 0) return;
    cur = E.nextMissing(game, cur >= 1 ? cur - 1 : 0);
    dir = 1;
    if (cur > 0) pickCur(cur);
  }

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới khi chia đề mới: ô mở là nút (roving tabindex), ô khoét là khoảng tối. */
  function buildBoard() {
    const n = game.n;
    const board = $('board');
    board.style.setProperty('--n', n);
    board.dataset.size = game.mode;
    grid.textContent = '';
    els = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      let el;
      if (game.open[i]) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'cell' + (game.given[i] ? ' given' : '');
        el.dataset.i = i;
        el.innerHTML = '<span class="v"></span><span class="notes"></span>';
      } else {
        el = document.createElement('div');
        el.className = 'hole';
        el.setAttribute('aria-hidden', 'true');
      }
      el.style.setProperty('--d', r + c);
      grid.appendChild(el);
      els.push(el);
    }
    $('links').setAttribute('viewBox', '0 0 ' + n + ' ' + n);
  }

  function render() {
    if (!game) return;
    const n = game.n;
    const st = E.check(game);
    const bad = new Set(showErrors() ? st.bad : []);
    const pos = E.positions(game);
    const near = new Set();
    if (cur > 0) {
      if (pos[cur - 1] >= 0) near.add(pos[cur - 1]);
      if (cur < game.N && pos[cur + 1] >= 0) near.add(pos[cur + 1]);
    }
    const over = solved();

    els.forEach((el, i) => {
      if (!game.open[i]) return;
      const v = game.vals[i];
      const typed = typing && typing.cell === i ? typing.buf : '';
      el.classList.toggle('sel', i === sel && !over);
      el.classList.toggle('near', near.has(i) && !over);
      el.classList.toggle('bad', bad.has(i));
      el.classList.toggle('filled', !!v && !game.given[i]);
      el.classList.toggle('typing', !!typed);
      el.tabIndex = i === (sel >= 0 ? sel : firstOpen()) ? 0 : -1;
      const vEl = el.firstChild;
      const nEl = el.lastChild;
      const vText = typed || (v ? String(v) : '');
      if (vEl.textContent !== vText) vEl.textContent = vText;
      vEl.dataset.len = vText.length;
      const notes = !v && !typed ? game.notes[i] : [];
      const key = notes.join(',');
      if (nEl.dataset.k !== key) {
        nEl.dataset.k = key;
        nEl.innerHTML = notes.map((k) => '<i>' + k + '</i>').join('');
      }
      const parts = [t('cell.label', { r: Math.floor(i / n) + 1, c: (i % n) + 1 })];
      if (typed) parts.push(t('cell.typing', { k: typed }));
      else if (game.given[i]) parts.push(t('cell.given', { k: v }));
      else if (v) parts.push(t('cell.value', { k: v }));
      else if (notes.length) parts.push(t('cell.notes', { list: notes.join(' ') }));
      else parts.push(t('cell.empty'));
      if (bad.has(i)) parts.push(t('cell.wrong'));
      el.setAttribute('aria-label', parts.join(', '));
    });

    // Đường nối giữa hai số liên tiếp nằm kề nhau
    let d = '';
    st.links.forEach((k) => {
      const a = pos[k];
      const b = pos[k + 1];
      const ax = (a % n) + 0.5;
      const ay = Math.floor(a / n) + 0.5;
      const bx = (b % n) + 0.5;
      const by = Math.floor(b / n) + 0.5;
      const f = 0.3;
      d += 'M' + (ax + (bx - ax) * f).toFixed(2) + ' ' + (ay + (by - ay) * f).toFixed(2) +
        'L' + (bx - (bx - ax) * f).toFixed(2) + ' ' + (by - (by - ay) * f).toFixed(2);
    });
    const links = $('links');
    if (links.dataset.d !== d) {
      links.dataset.d = d;
      links.innerHTML = d ? '<path d="' + d + '"/>' : '';
    }
    const board = $('board');
    board.classList.toggle('solved', over);
    board.setAttribute('aria-label', t('board.label', { left: E.emptyCount(game), k: cur > 0 ? cur : '–' }));

    // Số liệu
    renderTime();
    $('left').textContent = kit.i18n.fmtNumber(E.emptyCount(game));
    const best = stats.best[mode()];
    $('best').textContent = best == null ? '–' : fmt(best);

    // Huy hiệu cỡ đề
    const badge = $('btn-size');
    badge.textContent = t('size.short.' + mode());
    badge.setAttribute('aria-label', t('size.badge', { size: t('size.' + mode()), next: t('size.' + nextMode(mode())) }));
    badge.title = t('size.name');

    // Thanh số tiếp theo
    const curBtn = $('btn-cur');
    $('cur-num').textContent = cur > 0 ? String(cur) : t('next.done');
    curBtn.classList.toggle('none', cur <= 0);
    curBtn.classList.toggle('notes', noteMode);
    curBtn.setAttribute('aria-label', cur > 0 ? t('next.cur', { k: cur }) : t('next.none'));
    curBtn.disabled = over || cur <= 0;
    $('btn-prev').disabled = over || cur <= 0;
    $('btn-next').disabled = over || cur <= 0;

    // Công cụ
    $('btn-undo').disabled = over || !game.undo.length;
    $('btn-redo').disabled = over || !game.redo.length;
    $('btn-erase').disabled = over || sel < 0 || !E.isFree(game, sel) || (!game.vals[sel] && !game.notes[sel].length);
    $('btn-hint').disabled = over;
    $('btn-notes').setAttribute('aria-pressed', String(noteMode));
    $('btn-notes').classList.toggle('on', noteMode);
  }

  const firstOpen = () => game.open.indexOf(1);

  let lastTimeText = '';
  function renderTime() {
    const s = fmt(clock.elapsed());
    if (s !== lastTimeText) {
      lastTimeText = s;
      $('time').textContent = s;
    }
  }
  setInterval(() => { if (clock.running) renderTime(); }, 250);

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    if (!el || calm()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Đồng hồ ---------------- */

  /** Đồng hồ chỉ chạy khi có đề chưa giải, trang đang hiện và không mở hộp thoại nào. */
  function syncClock() {
    const want = !!game && !E.isSolved(game) && !document.hidden && !kit.modal.current();
    if (want) clock.resume();
    else clock.pause();
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
    const m = game ? mode() : kit.settings.get().size;
    const best = stats.best[m];
    const shown = [];
    if (stats.won > 0) shown.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) shown.push({ value: fmt(best), label: t('hud.best') + ' · ' + t('size.short.' + m) });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best != null ? t('summary.note', { size: t('size.short.' + m), time: fmt(best) }) : t('summary.none'),
      stats: shown,
      resume: inPlay()
        ? {
          title: t('app.name') + ' · ' + t('size.' + m),
          detail: t('summary.resume', { size: t('size.short.' + m), left: E.emptyCount(game) }),
          pct: Math.max(0, Math.min(1, 1 - E.emptyCount(game) / Math.max(1, E.freeCount(game)))),
        }
        : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()), cur, dir });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function newBoard(m) {
    clearTimeout(winTimer);
    cancelTyping();
    drag = null;
    game = E.newGame({ mode: m });
    sel = -1;
    cur = -1;
    fixCur();
    noteMode = false;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    buildBoard();
    syncClock();
    render();
    replay($('board'), 'deal');
    writeSummary();
  }

  /** Sau mỗi nước: âm thanh, lưu; giải xong thì kết thúc ván. */
  function after(before, sound) {
    const wasBad = E.check(before).bad.length;
    const now = E.check(game);
    const err = showErrors() && now.bad.length > wasBad;
    fixCur();
    syncClock();
    render();
    if (E.isSolved(game)) {
      finish();
      return;
    }
    if (err) kit.sfx('error');
    else if (sound) kit.sfx(sound);
    persist();
  }

  /** Bật / tắt ghi chú số k ở ô i. */
  function noteToggle(i, k) {
    if (k < 1 || !E.isFree(game, i) || game.vals[i]) return;
    const before = game;
    game = E.toggleNote(game, i, k);
    if (game === before) {
      kit.sfx('error');
      if (game.notes[i].length >= E.MAX_NOTES) kit.toast(t('toast.notesFull'));
      else if (E.isGivenNumber(game, k)) kit.toast(t('toast.given', { k }));
      return;
    }
    after(before, 'tap');
  }

  /** Đặt số k vào ô i (bàn phím / gợi ý). */
  function putNumber(i, k) {
    if (!E.isFree(game, i)) return;
    if (k < 1 || k > game.N) {
      kit.sfx('error');
      kit.toast(t('toast.range', { n: game.N }));
      return;
    }
    if (E.isGivenNumber(game, k)) {
      kit.sfx('error');
      kit.toast(t('toast.given', { k }));
      return;
    }
    const before = game;
    game = E.setValue(game, i, k);
    if (game === before) return;
    replay(els[i], 'pop');
    advanceFrom(k, dirFrom(k));
    after(before, 'place');
  }

  function eraseCell() {
    if (!game || solved() || sel < 0 || kit.modal.current()) return;
    if (typing) {
      typing.buf = typing.buf.slice(0, -1);
      if (!typing.buf) cancelTyping();
      render();
      return;
    }
    const before = game;
    game = E.erase(game, sel);
    if (game !== before) after(before, 'pop');
  }

  function step(fn) {
    if (!game || solved() || kit.modal.current()) return;
    cancelTyping();
    const before = game;
    game = fn(game);
    if (game === before) return;
    if (game.last && game.last.length) sel = game.last[game.last.length - 1];
    // Hoàn tác vừa gỡ số nào khỏi bàn thì số tiếp theo quay về số đó (nhỏ nhất nếu nhiều số)
    const pos = E.positions(game);
    const gone = before.vals.filter((v) => v && pos[v] < 0).sort((a, b) => a - b);
    if (gone.length) pickCur(gone[0]);
    after(before, 'move');
  }

  function toggleNotes() {
    if (!game || solved()) return;
    commitTyping();
    noteMode = !noteMode;
    kit.sfx('tap');
    render();
  }

  /** Lùi / tiến số tiếp theo sang số còn thiếu liền trước / liền sau. */
  function shiftCur(d) {
    if (!game || solved() || cur <= 0) return;
    const k = d > 0 ? E.nextMissing(game, cur) : E.prevMissing(game, cur);
    if (k > 0) pickCur(k);
    kit.sfx('tap');
    render();
  }

  /** Gợi ý: lần đầu trong ván thì hỏi trước (ván sẽ tính là có trợ giúp). */
  function requestHint() {
    if (!game || solved() || kit.modal.current()) return;
    commitTyping();
    const target = E.hintCell(game, cur);
    if (target < 0) return;
    if (game.hints > 0) {
      applyHint(target);
      return;
    }
    hintTarget = target;
    kit.modal.open('modal-hint');
  }

  function applyHint(target) {
    const before = game;
    game = E.hint(game, target);
    if (game === before) return;
    sel = target;
    replay(els[target], 'hinted');
    const k = game.vals[target];
    advanceFrom(k, cur === k ? dir : dirFrom(k));
    if (before.hints === 0) kit.toast(t('toast.hint'), 2400);
    after(before, 'coin');
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const assisted = game.hints > 0;
    const prev = stats.best[m];
    const isBest = !assisted && (prev == null || ms < prev);
    stats.played++;
    stats.won++;
    if (!assisted) stats.clean++;
    if (isBest) stats.best[m] = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    sel = -1;
    cur = -1;
    render();

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    if (assisted) badge.textContent = t('win.assisted', { n: game.hints });
    else if (isBest) badge.textContent = t('win.best', { size: t('size.short.' + m) });
    else badge.textContent = t('win.prev', { size: t('size.short.' + m), time: fmt(stats.best[m]) });
    badge.classList.toggle('good', isBest);
    // Cho người chơi kịp thấy cả đường sáng lên rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (game && E.isSolved(game)) kit.modal.open('modal-win');
    }, calm() ? 0 : 1000);
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'size' ? t('confirm.size', { size: t('size.' + p.mode) }) : t('kit.newGame');
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
    commitTyping();
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

  /** Yêu cầu đổi cỡ (từ Cài đặt hoặc huy hiệu). Đề đang dở thì giữ cài đặt cũ và hỏi trước. */
  function requestSize(m) {
    if (!isMode(m) || !game || m === mode()) return;
    commitTyping();
    if (inPlay()) {
      kit.settings.set({ size: mode() });
      kit.modal.close('modal-settings');
      askConfirm({ kind: 'size', mode: m });
    } else {
      kit.modal.close('modal-win');
      switchSize(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'size') requestSize(value);
    else if (key === 'errors') render();
  }

  /* ---------------- Chạm / kéo trên bàn ---------------- */

  /**
   * Ô dưới điểm (x, y). strict: chỉ nhận khi điểm nằm gần tâm ô, để khi kéo chéo qua góc ô
   * không vô tình chạm hai ô bên cạnh.
   */
  function cellAt(x, y, strict) {
    const rect = grid.getBoundingClientRect();
    const n = game.n;
    const fx = ((x - rect.left) / rect.width) * n;
    const fy = ((y - rect.top) / rect.height) * n;
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    if (r < 0 || r >= n || c < 0 || c >= n) return -1;
    if (strict) {
      const dx = fx - c - 0.5;
      const dy = fy - r - 0.5;
      if (dx * dx + dy * dy > 0.42 * 0.42) return -1;
    }
    const i = r * n + c;
    return game.open[i] ? i : -1;
  }

  grid.addEventListener('pointerdown', (e) => {
    if (!game || solved() || kit.modal.current() || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest && e.target.closest('.cell');
    if (!el) return;
    const i = Number(el.dataset.i);
    e.preventDefault();
    commitTyping();
    if (!game || solved()) return;
    try { grid.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    sel = i;
    const v = game.vals[i];
    if (!v) {
      if (noteMode) {
        noteToggle(i, cur);
        render();
        return;
      }
      if (cur <= 0 || !E.isFree(game, i)) {
        render();
        return;
      }
      // Chạm ô trống: đặt số tiếp theo, và kéo tiếp từ đây thì nối dãy
      drag = { id: e.pointerId, base: game, list: [[i, cur]], trail: [{ c: i, placed: true }], k: cur, dir, tap: false };
      game = E.place(drag.base, drag.list);
      replay(els[i], 'pop');
      kit.sfx('place');
    } else {
      // Chạm một số: kéo đi để vẽ đường từ số đó
      drag = { id: e.pointerId, base: game, list: [], trail: [{ c: i, placed: false }], k: v, dir: dirFrom(v), tap: true };
    }
    render();
  });

  grid.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !game) return;
    const c = cellAt(e.clientX, e.clientY, true);
    const tr = drag.trail;
    const last = tr[tr.length - 1].c;
    if (c < 0 || c === last) return;
    // Kéo lùi về ô trước: rút bước cuối
    if (tr.length >= 2 && c === tr[tr.length - 2].c) {
      const out = tr.pop();
      if (out.placed) drag.list.pop();
      drag.k -= drag.dir;
      game = drag.list.length ? E.place(drag.base, drag.list) : drag.base;
      sel = c;
      if (out.placed) kit.sfx('pop');
      render();
      return;
    }
    if (!E.adjacent(game.n, last, c)) return;
    const want = drag.k + drag.dir;
    if (want < 1 || want > game.N) return;
    const v = game.vals[c];
    if (v === want) {
      // Đi qua số đã có đúng thứ tự (số cho sẵn hoặc đã điền)
      tr.push({ c, placed: false });
    } else {
      if (v || !E.isFree(game, c) || E.isGivenNumber(game, want)) return;
      drag.list.push([c, want]);
      tr.push({ c, placed: true });
      game = E.place(drag.base, drag.list);
      replay(els[c], 'pop');
      kit.sfx('tap');
    }
    drag.k = want;
    drag.tap = false;
    sel = c;
    render();
  });

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    if (d.tap) {
      // Chạm một số (không kéo): nối tiếp dãy từ số đó
      advanceFrom(d.k, d.dir);
      kit.sfx('tap');
      render();
      return;
    }
    advanceFrom(d.k, d.dir);
    if (game !== d.base) after(d.base, d.list.length > 1 ? 'combo' : null);
    else render();
  }
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
  grid.addEventListener('lostpointercapture', endDrag);
  // Bàn phím trên ô đã xử lý ở keydown; chặn "click" của trình duyệt để không xử lý hai lần
  grid.addEventListener('click', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */

  /** Gõ một chữ số vào ô đang chọn; đủ số (không thể thêm chữ số nữa) hoặc dừng 1 giây thì chốt. */
  function typeDigit(d) {
    if (!game || solved()) return;
    if (sel < 0 || !E.isFree(game, sel)) {
      kit.sfx('error');
      return;
    }
    if (!typing || typing.cell !== sel) {
      commitTyping();
      if (d === 0) {
        eraseCell();
        return;
      }
      typing = { cell: sel, buf: '', timer: 0 };
    }
    typing.buf += String(d);
    clearTimeout(typing.timer);
    const v = Number(typing.buf);
    if (v * 10 > game.N || typing.buf.length >= 2) commitTyping();
    else {
      typing.timer = setTimeout(commitTyping, 1000);
      render();
    }
  }

  function cancelTyping() {
    if (!typing) return;
    clearTimeout(typing.timer);
    typing = null;
  }

  function commitTyping() {
    if (!typing) return;
    const tp = typing;
    cancelTyping();
    const v = Number(tp.buf);
    if (!game || solved() || !v) {
      render();
      return;
    }
    if (noteMode) {
      noteToggle(tp.cell, v);
      render();
    } else putNumber(tp.cell, v);
  }

  /** Space / Enter: đặt số tiếp theo vào ô đang chọn (ô có số thì nối dãy từ số đó). */
  function placeCurAtSel() {
    if (!game || solved()) return;
    if (typing) {
      commitTyping();
      return;
    }
    if (sel < 0) {
      sel = firstOpen();
      render();
      return;
    }
    const v = game.vals[sel];
    if (v) {
      advanceFrom(v, dirFrom(v));
      kit.sfx('tap');
      render();
      return;
    }
    if (cur <= 0) return;
    if (noteMode) {
      noteToggle(sel, cur);
      return;
    }
    const before = game;
    const k = cur;
    game = E.setValue(game, sel, k);
    if (game === before) return;
    replay(els[sel], 'pop');
    advanceFrom(k, dir);
    after(before, 'place');
  }

  /** Mũi tên: đi tới ô mở gần nhất theo hướng đó (nhảy qua ô khoét); hết bàn thì đứng yên. */
  function move(dr, dc) {
    if (!game) return;
    commitTyping();
    const n = game.n;
    if (sel < 0) {
      select(firstOpen());
      return;
    }
    let r = Math.floor(sel / n) + dr;
    let c = (sel % n) + dc;
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c;
      if (game.open[i]) {
        select(i);
        return;
      }
      r += dr;
      c += dc;
    }
    if (els[sel]) els[sel].focus();
  }

  function select(i) {
    if (!game || !E.isOpen(game, i)) return;
    sel = i;
    render();
    els[i].focus();
  }

  /* ---------------- Bảng chọn số ---------------- */

  function openPicker() {
    if (!game || solved() || cur <= 0) return;
    commitTyping();
    const pos = E.positions(game);
    let html = '';
    for (let k = 1; k <= game.N; k++) {
      const on = pos[k] >= 0;
      const cls = 'pk' + (on ? ' on' : '') + (on && game.given[pos[k]] ? ' given' : '') + (k === cur ? ' cur' : '');
      html += '<button type="button" class="' + cls + '" data-k="' + k + '"' + (on ? ' disabled' : '') +
        ' aria-label="' + (on ? t('pick.on', { k }) : t('pick.label', { k })) + '">' + k + '</button>';
    }
    const box = $('pick-grid');
    box.style.setProperty('--cols', game.N > 64 ? 10 : 8);
    box.innerHTML = html;
    kit.modal.open('modal-pick');
    const curBtn = box.querySelector('.pk.cur');
    if (curBtn) curBtn.focus();
  }

  $('pick-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.pk');
    if (!b || b.disabled) return;
    pickCur(Number(b.dataset.k));
    kit.modal.close('modal-pick');
    kit.sfx('tap');
    render();
  });

  /* ---------------- Sự kiện ---------------- */

  $('btn-prev').addEventListener('click', () => shiftCur(-1));
  $('btn-next').addEventListener('click', () => shiftCur(1));
  $('btn-cur').addEventListener('click', openPicker);
  $('btn-undo').addEventListener('click', () => step(E.undo));
  $('btn-redo').addEventListener('click', () => step(E.redo));
  $('btn-erase').addEventListener('click', eraseCell);
  $('btn-notes').addEventListener('click', toggleNotes);
  $('btn-hint').addEventListener('click', requestHint);
  $('btn-hint-ok').addEventListener('click', () => {
    kit.modal.close('modal-hint');
    const target = hintTarget;
    hintTarget = -1;
    if (target >= 0) applyHint(target);
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-size').addEventListener('click', () => requestSize(nextMode(mode())));
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(mode());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-clean').textContent = kit.i18n.fmtNumber(stats.clean);
    MODES.forEach((m) => { $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
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
    // Nút của thanh trên / hộp thoại giữ hành vi Space / Enter mặc định; trên bàn thì là "đặt số"
    const onBoard = !!(e.target.closest && e.target.closest('.board'));
    const onOtherButton = !onBoard && e.target.closest && e.target.closest('button, input, a[href]');
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    const digit = m ? Number(m[1]) : k >= '0' && k <= '9' && k.length === 1 ? Number(k) : -1;
    if (digit >= 0) typeDigit(digit);
    else if (k === 'Backspace' || k === 'Delete') eraseCell();
    else if (ARROWS[k]) move(ARROWS[k][0], ARROWS[k][1]);
    else if (k === ' ' || k === 'Enter') {
      if (onOtherButton) return; // để trình duyệt bấm nút đó
      placeCurAtSel();
    } else if (k === '[' || k === '-') shiftCur(-1);
    else if (k === ']' || k === '+' || k === '=') shiftCur(1);
    else if (lower === 'm') toggleNotes();
    else if (lower === 'z') step(E.undo);
    else if (lower === 'y') step(E.redo);
    else if (lower === 'h') requestHint();
    else if (lower === 'n') requestNew();
    else if (k === 'Escape' && typing) {
      cancelTyping();
      render();
    } else return;
    e.preventDefault();
  });
  // Space trên ô: chặn cả keyup để trình duyệt không "bấm" nút đó thêm lần nữa
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && e.target.closest && e.target.closest('.board')) e.preventDefault();
  });

  kit.onLeave(() => {
    commitTyping();
    persist();
  });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */

  /** Cài đặt cỡ đi theo đề đang có (ghi thẳng, không qua onSetting). */
  function syncSizeSetting() {
    if (kit.settings.get().size === mode()) return;
    kit.settings.get().size = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isSolved(restored)) {
    game = restored;
    cur = Number.isInteger(saved.cur) ? saved.cur : -1;
    dir = saved.dir === -1 ? -1 : 1;
    fixCur();
    syncSizeSetting();
    clock.set(Number.isFinite(saved.elapsed) && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(mode(), true);
    buildBoard();
    syncClock();
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().size;
    newBoard(isMode(m) ? m : 's');
    syncSizeSetting();
  }
})();
