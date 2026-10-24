/* =====================================================================
 * Ô Số Tính - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ lưới ('4' | '5' | '6' | '7'), metric time_low
 *   - Đồng hồ chạy từ lúc chia đề, dừng khi mở hộp thoại (lưới bị làm mờ) hoặc tab ẩn; lưu cả đồng hồ
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ ván (ván mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const SIZES = E.SIZES;
  const kit = PNKit.init({ gameId: 'osotinh', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: 4, errors: true, guideSeen: false }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const board = $('board');
  const pad = $('pad');

  /* ---------------- Thống kê (đọc phòng thủ: dữ liệu cũ / hỏng thì về mặc định) ---------------- */
  const stats = (function () {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
    const s = { played: num(raw.played), won: num(raw.won), streak: num(raw.streak), clean: num(raw.clean), best: {}, wonBy: {} };
    SIZES.forEach((n) => {
      const b = raw.best && raw.best[n];
      s.best[n] = Number.isInteger(b) && b > 0 ? b : null;
      s.wonBy[n] = num(raw.wonBy && raw.wonBy[n]);
    });
    return s;
  })();

  let game = null;
  let cursor = 0; // ô đang chọn
  let notesMode = false;
  let fixed = []; // ô cho sẵn của đề hiện tại
  let owner = []; // chỉ số lồng của từng ô
  let parts = []; // phần tử con của từng ô: { el, val, label, notes: [span…] }
  let digits = []; // nút số trên bàn số
  let winTimer = 0;

  const mode = () => String(game.size);
  const sizeText = (n) => n + '×' + n;
  const solved = () => !!game && E.isSolved(game);
  /** Ván đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);

  /** m:ss (hoặc h:mm:ss). */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* ---------------- Dựng lưới ---------------- */

  /** Dựng lại lưới và bàn số khi có đề mới: viền lồng, nhãn lồng ở ô trên cùng bên trái của lồng. */
  function buildBoard() {
    const n = game.size;
    fixed = E.fixedCells(game);
    owner = E.cageIndex(game);
    const anchor = game.cages.map((cg) => Math.min.apply(null, cg.cells));
    board.style.setProperty('--n', n);
    board.dataset.size = n;
    board.setAttribute('role', 'group');
    board.textContent = '';
    parts = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.i = i;
      b.style.setProperty('--d', r + c);
      // Cạnh giáp lồng khác: vẽ đường đậm (cạnh ngoài lưới do khung lưới vẽ)
      if (r > 0 && owner[i - n] !== owner[i]) b.classList.add('et');
      if (r < n - 1 && owner[i + n] !== owner[i]) b.classList.add('eb');
      if (c > 0 && owner[i - 1] !== owner[i]) b.classList.add('el');
      if (c < n - 1 && owner[i + 1] !== owner[i]) b.classList.add('er');
      if (fixed[i]) b.classList.add('fixed');
      let label = null;
      if (anchor[owner[i]] === i) {
        label = document.createElement('span');
        label.className = 'cage-label';
        label.textContent = E.cageLabel(game.cages[owner[i]]);
        b.appendChild(label);
      }
      const val = document.createElement('span');
      val.className = 'val';
      b.appendChild(val);
      const box = document.createElement('span');
      box.className = 'notes';
      const notes = [];
      for (let v = 1; v <= n; v++) {
        const s = document.createElement('span');
        s.textContent = v;
        box.appendChild(s);
        notes.push(s);
      }
      b.appendChild(box);
      board.appendChild(b);
      parts.push({ el: b, val, label, box, notes });
    }
    pad.style.setProperty('--n', n);
    pad.textContent = '';
    digits = [];
    for (let v = 1; v <= n; v++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.dataset.v = v;
      b.textContent = v;
      pad.appendChild(b);
      digits.push(b);
    }
  }

  /* ---------------- Vẽ ---------------- */

  function render() {
    const n = game.size;
    if (parts.length !== n * n) buildBoard();
    const showErr = !!kit.settings.get().errors;
    const conf = E.conflicts(game);
    const cst = E.cageStates(game);
    const cr = Math.floor(cursor / n);
    const cc = cursor % n;
    const done = solved();
    const selV = done ? 0 : game.values[cursor];
    const count = new Array(n + 1).fill(0);
    game.values.forEach((v) => { count[v]++; });

    parts.forEach((p, i) => {
      const v = game.values[i];
      const r = Math.floor(i / n);
      const c = i % n;
      const bad = showErr && cst[owner[i]] === 'bad';
      const err = showErr && conf[i];
      p.val.textContent = v ? v : '';
      p.box.classList.toggle('shown', !v && game.notes[i] !== 0);
      p.notes.forEach((s, k) => s.classList.toggle('on', (game.notes[i] & (1 << k)) !== 0));
      const cl = p.el.classList;
      cl.toggle('sel', !done && i === cursor);
      cl.toggle('peer', !done && i !== cursor && (r === cr || c === cc));
      cl.toggle('same', i !== cursor && !!v && v === selV);
      cl.toggle('err', err);
      cl.toggle('bad', bad);
      if (p.label) {
        p.label.classList.toggle('done', cst[owner[i]] === 'ok');
        p.label.classList.toggle('bad', bad);
      }
      p.el.tabIndex = i === cursor ? 0 : -1;
      // Nhãn cho trình đọc màn hình
      const cg = game.cages[owner[i]];
      let desc = t('cell.label', { r: r + 1, c: c + 1, cage: E.cageLabel(cg) }) + ', ';
      if (fixed[i]) desc += t('cell.given', { v });
      else if (v) desc += t('cell.value', { v });
      else if (game.notes[i]) desc += t('cell.notes', { list: p.notes.filter((s) => s.classList.contains('on')).map((s) => s.textContent).join(' ') });
      else desc += t('cell.empty');
      if (err || bad) desc += ', ' + t('cell.wrong');
      p.el.setAttribute('aria-label', desc);
    });

    digits.forEach((b, k) => {
      const v = k + 1;
      b.classList.toggle('full', count[v] >= n);
      b.setAttribute('aria-label', t(notesMode ? 'pad.note' : 'pad.digit', { v }));
    });
    pad.classList.toggle('noting', notesMode);

    board.classList.toggle('solved', done);
    board.setAttribute('aria-label', t('board.label', { size: sizeText(n), n: E.filledCount(game), total: n * n }));
    $('btn-undo').disabled = done || !game.undo.length;
    $('btn-redo').disabled = done || !game.redo.length;
    $('btn-erase').disabled = done || fixed[cursor] || (!game.values[cursor] && !game.notes[cursor]);
    $('btn-hint').disabled = done;
    $('btn-notes').setAttribute('aria-pressed', String(notesMode));
    $('btn-notes').classList.toggle('on', notesMode);

    $('filled').textContent = E.filledCount(game) + '/' + n * n;
    $('best').textContent = stats.best[n] == null ? '–' : fmt(stats.best[n]);
    $('btn-size').textContent = sizeText(n);
    $('btn-size').setAttribute('aria-label', t('size.badge', { size: sizeText(n), level: t('level.' + n) }));
    $('btn-size').title = t('level.' + n);
    tick();
  }

  /** Cập nhật đồng hồ (gọi định kỳ, chỉ đổi chữ khi khác). */
  function tick() {
    if (!game) return;
    const s = fmt(clock.elapsed());
    const el = $('time');
    if (el.textContent !== s) el.textContent = s;
  }
  setInterval(tick, 250);

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    if (calm()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const n = game ? game.size : kit.settings.get().size;
    const best = stats.best[n];
    const total = n * n;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { size: sizeText(n), time: fmt(best) }),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(best == null ? [] : [{ value: fmt(best), label: t('hud.best') + ' ' + sizeText(n) }])
        : [],
      resume: inPlay()
        ? { title: t('app.name') + ' ' + sizeText(n), detail: t('summary.resume', { n: E.filledCount(game), total }), pct: E.filledCount(game) / total }
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

  /** Ô sửa được đầu tiên (đặt con trỏ khi chia đề). */
  const firstOpen = () => Math.max(0, game.values.findIndex((v, i) => !v && !fixed[i]));

  function newGame(size) {
    clearTimeout(winTimer);
    kit.modal.close('modal-win');
    game = E.newGame({ size, seed: Math.floor(Math.random() * 4294967296) });
    parts = [];
    buildBoard();
    cursor = firstOpen();
    clock.reset();
    clock.start();
    kit.store.remove(keys.save);
    kit.sdk.start(mode());
    render();
    replay(board, 'deal');
    writeSummary();
  }

  /** Sau mỗi nước: kiểm tra thắng, âm thanh, hiệu ứng, lưu. */
  function afterMove(sound) {
    render();
    replay(parts[cursor].el, 'pop');
    if (E.isSolved(game)) {
      finish();
      return;
    }
    const showErr = kit.settings.get().errors;
    if (sound === 'place' && showErr && (E.conflicts(game)[cursor] || E.cageStates(game)[owner[cursor]] === 'bad')) sound = 'error';
    kit.sfx(sound);
    persist();
  }

  const blocked = () => !game || solved() || !!kit.modal.current();

  function select(i) {
    if (!game || i < 0 || i >= game.size * game.size) return;
    cursor = i;
    render();
  }

  /** Điền số v vào ô đang chọn (hoặc ghi chú nếu đang ở chế độ ghi chú / giữ Shift). */
  function input(v, asNote) {
    if (blocked() || v < 1 || v > game.size) return;
    if (fixed[cursor]) {
      kit.toast(t('toast.given'));
      return;
    }
    const note = asNote || notesMode;
    const next = note ? E.toggleNote(game, cursor, v) : E.setValue(game, cursor, v);
    if (next === game) return;
    game = next;
    afterMove(!note && game.values[cursor] ? 'place' : 'tap');
  }

  function erase() {
    if (blocked()) return;
    const next = E.clearCell(game, cursor);
    if (next === game) return;
    game = next;
    afterMove('tap');
  }

  function undo() {
    if (blocked()) return;
    const next = E.undo(game);
    if (next === game) return;
    game = next;
    kit.sfx('move');
    render();
    persist();
  }

  function redo() {
    if (blocked()) return;
    const next = E.redo(game);
    if (next === game) return;
    game = next;
    kit.sfx('move');
    render();
    if (E.isSolved(game)) finish();
    else persist();
  }

  function useHint() {
    if (blocked()) return;
    const res = E.hint(game, cursor);
    if (res.cell < 0) {
      kit.toast(t('toast.noHint'));
      return;
    }
    const first = game.hints === 0;
    game = res.game;
    cursor = res.cell;
    if (first) kit.toast(t('toast.hint'), 2600);
    afterMove('pop');
  }

  function toggleNotes() {
    if (!game || solved()) return;
    notesMode = !notesMode;
    kit.sfx('tap');
    render();
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const n = game.size;
    const assisted = game.hints > 0;
    stats.played++;
    stats.won++;
    stats.streak++;
    stats.wonBy[n]++;
    if (!assisted) stats.clean++;
    const best = !assisted && (stats.best[n] == null || ms < stats.best[n]);
    if (best) stats.best[n] = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: mode(), won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    render();
    $('win-size').textContent = sizeText(n) + ' · ' + t('level.' + n);
    $('win-time').textContent = fmt(ms);
    $('win-best').hidden = !best;
    $('win-assisted').hidden = !assisted;
    $('win-assisted').textContent = assisted ? t('win.assisted', { n: game.hints }) : '';
    // Cho người chơi kịp thấy lưới hoàn chỉnh rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (solved()) kit.modal.open('modal-win');
    }, calm() ? 0 : 900);
  }

  /** Bỏ ván đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  /** Mở hộp chọn cỡ cho ván mới (ván đang dở thì báo trước là tính thua). */
  function requestNew() {
    if (!game) return;
    clearTimeout(winTimer);
    $('new-warn').hidden = !inPlay();
    document.querySelectorAll('.size-option').forEach((b) => {
      const n = Number(b.dataset.size);
      b.classList.toggle('current', n === game.size);
      b.querySelector('.size-best').textContent = stats.best[n] == null ? '' : fmt(stats.best[n]);
    });
    kit.modal.open('modal-new');
  }

  function chooseSize(n) {
    if (SIZES.indexOf(n) < 0) return;
    kit.modal.close('modal-new');
    if (inPlay()) abandon();
    newGame(n);
    if (kit.settings.get().size !== n) kit.settings.set({ size: n });
  }

  function onSetting(key) {
    if (key === 'errors' && game) render();
  }

  /** Đồng hồ dừng khi có hộp thoại mở (lưới bị làm mờ để không xem đề lúc dừng), chạy tiếp khi đóng. */
  function syncClock() {
    const open = !!kit.modal.current();
    const live = !!game && !solved();
    board.classList.toggle('veiled', open && live);
    if (!live) return;
    if (open) clock.pause();
    else if (!document.hidden) clock.resume();
    tick();
  }

  /* ---------------- Sự kiện ---------------- */

  board.addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b) select(Number(b.dataset.i));
  });
  pad.addEventListener('click', (e) => {
    const b = e.target.closest('.num');
    if (b) input(Number(b.dataset.v), false);
  });
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-erase').addEventListener('click', erase);
  $('btn-hint').addEventListener('click', useHint);
  $('btn-notes').addEventListener('click', toggleNotes);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-size').addEventListener('click', requestNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newGame(game.size);
  });
  $('btn-win-size').addEventListener('click', () => {
    kit.modal.close('modal-win');
    requestNew();
  });
  $('size-list').addEventListener('click', (e) => {
    const b = e.target.closest('.size-option');
    if (b) chooseSize(Number(b.dataset.size));
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    $('stats-clean').textContent = kit.i18n.fmtNumber(stats.clean);
    const body = $('stats-best');
    body.textContent = '';
    SIZES.forEach((n) => {
      const tr = document.createElement('tr');
      [sizeText(n) + ' · ' + t('level.' + n), kit.i18n.fmtNumber(stats.wonBy[n]), stats.best[n] == null ? '–' : fmt(stats.best[n])].forEach((txt) => {
        const td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  });

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') (e.shiftKey ? redo : undo)();
      else if (k === 'y') redo();
      else return;
      e.preventDefault();
      return;
    }
    const onCell = !!(e.target.closest && e.target.closest('.cell'));
    const onOtherButton = !onCell && !!(e.target.closest && e.target.closest('button, input, a[href]'));
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    const d = m ? Number(m[1]) : /^\d$/.test(e.key) ? Number(e.key) : -1;
    if (d >= 1) input(d, e.shiftKey);
    else if (d === 0 || k === 'backspace' || k === 'delete') erase();
    else if (ARROWS[k]) {
      const n = game.size;
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + ARROWS[k][0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + ARROWS[k][1]));
      select(r * n + c);
      parts[cursor].el.focus();
    } else if (k === ' ') {
      // Nút khác đang focus (Hoàn tác, Gợi ý…) thì để trình duyệt bấm nút đó
      if (onOtherButton) return;
      toggleNotes();
    } else if (k === 'z') (e.shiftKey ? redo : undo)();
    else if (k === 'y') redo();
    else if (k === 'h') useHint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Space trên nút ô: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  board.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

  kit.onLeave(persist);
  new MutationObserver(syncClock).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isSolved(restored)) {
    game = restored;
    buildBoard();
    cursor = firstOpen();
    clock.set(Number.isFinite(saved.elapsed) ? saved.elapsed : 0);
    clock.start();
    kit.sdk.start(mode(), true);
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const s = Number(kit.settings.get().size);
    newGame(SIZES.indexOf(s) >= 0 ? s : 4);
  }
  // Lần đầu mở: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
