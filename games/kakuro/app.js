/* =====================================================================
 * Kakuro - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ đề ('s' Dễ 6×6 | 'm' Vừa 8×8 | 'l' Khó 10×10), metric time_low
 *   - Chọn ô (chạm / mũi tên) rồi điền số (bàn số / phím 1-9); chế độ ghi chú (Space / Shift+số);
 *     hoàn tác / làm lại không giới hạn; bảng tổ hợp cho hai đoạn của ô đang chọn (không tính trợ giúp);
 *     gợi ý điền đúng một ô (tính là có trợ giúp: assisted)
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
    gameId: 'kakuro',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { size: 's', errors: 'auto', combos: true },
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
  let sel = -1; // ô trắng đang chọn
  let noteMode = false;
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'size', mode }
  let hintTarget = -1; // ô chờ xác nhận gợi ý lần đầu
  let winTimer = 0;
  let els = []; // phần tử theo chỉ số ô (nút ô trắng / ô đen)
  let clueOf = {}; // ô đen → { a: đoạn ngang, d: đoạn dọc }

  const mode = () => game.mode;
  const solved = () => !!game && E.isSolved(game);
  /** Ván đang dở: đã đi ít nhất một nước và chưa giải xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isSolved(game);
  const showErrors = () => {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && !!game && game.mode === 's');
  };
  const leftCount = () => E.whiteCount(game) - E.filledCount(game);

  /** m:ss (h:mm:ss nếu quá một giờ). */
  function fmt(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới khi chia đề mới: ô trắng là nút (roving tabindex), ô đen có thể mang gợi ý. */
  function buildBoard() {
    const board = $('board');
    const n = game.n;
    board.style.setProperty('--n', n);
    board.dataset.size = game.mode;
    board.textContent = '';
    els = [];
    clueOf = {};
    game.runs.forEach((run, k) => {
      if (run.clue < 0) return;
      clueOf[run.clue] = clueOf[run.clue] || {};
      clueOf[run.clue][run.dir === 'h' ? 'a' : 'd'] = k;
    });
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      let el;
      if (game.white[i]) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'cell';
        el.dataset.i = i;
        el.innerHTML = '<span class="v"></span><span class="notes"></span>';
      } else {
        el = document.createElement('div');
        const cl = clueOf[i];
        if (cl) {
          el.className = 'clue';
          let html = '';
          if (cl.a != null) html += '<span class="ca">' + game.runs[cl.a].sum + '</span>';
          if (cl.d != null) html += '<span class="cd">' + game.runs[cl.d].sum + '</span>';
          el.innerHTML = html;
          const parts = [];
          if (cl.a != null) parts.push(t('clue.across', { sum: game.runs[cl.a].sum }));
          if (cl.d != null) parts.push(t('clue.down', { sum: game.runs[cl.d].sum }));
          el.setAttribute('role', 'img');
          el.setAttribute('aria-label', t('clue.label', { parts: parts.join(', ') }));
        } else {
          el.className = 'blk';
          el.setAttribute('aria-hidden', 'true');
        }
      }
      el.style.setProperty('--d', r + c);
      board.appendChild(el);
      els.push(el);
    }
  }

  function notesHtml(mask) {
    let html = '';
    for (let d = 1; d <= 9; d++) html += '<i>' + (mask & E.bit(d) ? d : '') + '</i>';
    return html;
  }

  function render() {
    if (!game) return;
    const st = E.check(game);
    const err = showErrors();
    const dup = new Set(err ? st.dupCells : []);
    const bad = new Set(err ? st.badRuns : []);
    const done = new Set(st.doneRuns);
    const hk = sel >= 0 ? game.cellRuns[2 * sel] : -1;
    const vk = sel >= 0 ? game.cellRuns[2 * sel + 1] : -1;
    const n = game.n;

    els.forEach((el, i) => {
      if (game.white[i]) {
        const v = game.vals[i];
        const notes = game.notes[i];
        const h = game.cellRuns[2 * i];
        const vv = game.cellRuns[2 * i + 1];
        el.classList.toggle('sel', i === sel);
        el.classList.toggle('peer', i !== sel && (h === hk || vv === vk));
        el.classList.toggle('dup', dup.has(i));
        el.classList.toggle('filled', !!v);
        el.tabIndex = i === sel ? 0 : -1;
        const vEl = el.firstChild;
        const nEl = el.lastChild;
        const vText = v ? String(v) : '';
        if (vEl.textContent !== vText) vEl.textContent = vText;
        const key = v ? '' : String(notes);
        if (nEl.dataset.k !== key) {
          nEl.dataset.k = key;
          nEl.innerHTML = !v && notes ? notesHtml(notes) : '';
        }
        const parts = [t('cell.label', { r: Math.floor(i / n), c: i % n })];
        parts.push(t('cell.across', { sum: game.runs[h].sum }), t('cell.down', { sum: game.runs[vv].sum }));
        if (v) parts.push(t('cell.value', { d: v }));
        else if (notes) parts.push(t('cell.notes', { list: digitList(notes) }));
        else parts.push(t('cell.empty'));
        if (dup.has(i)) parts.push(t('cell.wrong'));
        el.setAttribute('aria-label', parts.join(', '));
      } else if (clueOf[i]) {
        const cl = clueOf[i];
        const a = el.querySelector('.ca');
        const d = el.querySelector('.cd');
        if (a) {
          a.classList.toggle('on', cl.a === hk);
          a.classList.toggle('bad', bad.has(cl.a));
          a.classList.toggle('done', done.has(cl.a));
        }
        if (d) {
          d.classList.toggle('on', cl.d === vk);
          d.classList.toggle('bad', bad.has(cl.d));
          d.classList.toggle('done', done.has(cl.d));
        }
      }
    });
    const board = $('board');
    board.classList.toggle('solved', solved());
    board.setAttribute('aria-label', t('board.label', { left: leftCount() }));

    // Số liệu
    renderTime();
    $('left').textContent = kit.i18n.fmtNumber(leftCount());
    const best = stats.best[mode()];
    $('best').textContent = best == null ? '–' : fmt(best);

    // Huy hiệu cỡ đề
    const badge = $('btn-size');
    badge.textContent = t('size.short.' + mode());
    badge.setAttribute('aria-label', t('size.badge', { size: t('size.' + mode()), next: t('size.' + nextMode(mode())) }));
    badge.title = t('size.name');

    // Công cụ
    const over = solved();
    $('btn-undo').disabled = over || !game.undo.length;
    $('btn-redo').disabled = over || !game.redo.length;
    $('btn-erase').disabled = over || sel < 0 || (!game.vals[sel] && !game.notes[sel]);
    $('btn-hint').disabled = over;
    $('btn-notes').setAttribute('aria-pressed', String(noteMode));
    $('btn-notes').classList.toggle('on', noteMode);

    // Bàn số: ghi chú thì sáng các số đã ghi; điền thì sáng số đang có trong ô
    const pad = $('pad');
    pad.classList.toggle('notes', noteMode);
    pad.querySelectorAll('.key').forEach((b) => {
      const d = Number(b.dataset.d);
      const on = sel >= 0 && (noteMode ? !game.vals[sel] && !!(game.notes[sel] & E.bit(d)) : game.vals[sel] === d);
      b.classList.toggle('on', on);
      b.disabled = over;
    });

    renderCombos(hk, vk);
  }

  function digitList(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & E.bit(d)) out.push(d);
    return out.join(' ');
  }

  /** Bảng tổ hợp: một dòng cho đoạn ngang, một dòng cho đoạn dọc của ô đang chọn. */
  function renderCombos(hk, vk) {
    const box = $('combo');
    const on = !!kit.settings.get().combos;
    box.hidden = !on;
    document.body.classList.toggle('no-combos', !on);
    if (!on) return;
    const rowH = $('combo-h');
    const rowV = $('combo-v');
    if (sel < 0) {
      rowH.innerHTML = '<span class="cb-pick">' + t('combo.pick') + '</span>';
      rowV.innerHTML = '';
      return;
    }
    [[rowH, hk, 'across', '→'], [rowV, vk, 'down', '↓']].forEach(([row, k, dir, arrow]) => {
      const run = game.runs[k];
      const list = E.runCombos(game, k);
      const okList = list.filter((c) => c.ok);
      const offList = list.filter((c) => !c.ok);
      const chips = okList.concat(offList).map((c) => '<span class="chip' + (c.ok ? '' : ' off') + '">' + c.digits.join('') + '</span>').join('');
      const html = '<span class="cb-head" aria-hidden="true"><span class="cb-dir">' + arrow + '</span><b>' + run.sum + '</b><small>/' + run.cells.length + '</small></span>' +
        '<span class="cb-list" aria-hidden="true">' + (chips || '<span class="chip off">' + t('combo.none') + '</span>') + '</span>';
      if (row.dataset.k !== html) {
        row.dataset.k = html;
        row.innerHTML = html;
      }
      row.setAttribute('aria-label', t('combo.label', {
        dir: t('combo.' + dir).toLowerCase(),
        sum: run.sum,
        n: run.cells.length,
        list: okList.length ? okList.map((c) => c.digits.join('+')).join(', ') : t('combo.none'),
      }));
      row.setAttribute('role', 'note');
    });
  }

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

  /** Nháy gợi ý của các đoạn vừa xong. */
  function flashRuns(list) {
    list.forEach((k) => {
      const run = game.runs[k];
      const el = els[run.clue];
      if (el) replay(el.querySelector(run.dir === 'h' ? '.ca' : '.cd'), 'flash');
      run.cells.forEach((i) => replay(els[i], 'glow'));
    });
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
          detail: t('summary.resume', { size: t('size.short.' + m), left: leftCount() }),
          pct: Math.max(0, Math.min(1, E.filledCount(game) / E.whiteCount(game))),
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

  const firstWhite = () => game.white.indexOf(1);

  function newBoard(m) {
    clearTimeout(winTimer);
    game = E.newGame({ mode: m });
    sel = firstWhite();
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

  /** Sau mỗi nước: âm thanh, hiệu ứng đoạn xong, lưu; giải xong thì kết thúc ván. */
  function after(before, sound) {
    const was = E.check(before);
    const now = E.check(game);
    const fresh = now.doneRuns.filter((k) => was.doneRuns.indexOf(k) < 0);
    const err = showErrors() && (now.dupCells.length > was.dupCells.length || now.badRuns.some((k) => was.badRuns.indexOf(k) < 0));
    syncClock();
    render();
    if (E.isSolved(game)) {
      finish();
      return;
    }
    if (err) kit.sfx('error');
    else if (fresh.length) kit.sfx('clear');
    else if (sound) kit.sfx(sound);
    flashRuns(fresh);
    persist();
  }

  function select(i, focus) {
    if (!game || !E.isWhite(game, i)) return;
    sel = i;
    render();
    if (focus) els[i].focus();
  }

  /** Bàn số / phím số: điền (chạm lại đúng số đang có thì xóa) hoặc bật / tắt ghi chú. */
  function input(d, asNote) {
    if (!game || solved() || kit.modal.current()) return;
    if (sel < 0) {
      kit.toast(t('toast.pick'));
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
      game = E.setValue(game, sel, game.vals[sel] === d ? 0 : d);
      sound = game.vals[sel] ? 'place' : 'pop';
      if (game.vals[sel]) replay(els[sel], 'pop');
    }
    if (game !== before) after(before, sound);
  }

  function eraseCell() {
    if (!game || solved() || sel < 0 || kit.modal.current()) return;
    const before = game;
    game = E.erase(game, sel);
    if (game !== before) after(before, 'pop');
  }

  function step(fn) {
    if (!game || solved() || kit.modal.current()) return;
    const before = game;
    game = fn(game);
    if (game === before) return;
    if (game.last && game.last.length) sel = game.last[0];
    after(before, 'move');
  }

  function toggleNotes() {
    if (!game || solved()) return;
    noteMode = !noteMode;
    kit.sfx('tap');
    render();
  }

  /** Gợi ý: lần đầu trong ván thì hỏi trước (ván sẽ tính là có trợ giúp). */
  function requestHint() {
    if (!game || solved() || kit.modal.current()) return;
    const target = E.hintCell(game, sel);
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
    render();

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    if (assisted) badge.textContent = t('win.assisted', { n: game.hints });
    else if (isBest) badge.textContent = t('win.best', { size: t('size.short.' + m) });
    else badge.textContent = t('win.prev', { size: t('size.short.' + m), time: fmt(stats.best[m]) });
    badge.classList.toggle('good', isBest);
    // Cho người chơi kịp thấy cả bàn sáng lên rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (game && E.isSolved(game)) kit.modal.open('modal-win');
    }, calm() ? 0 : 900);
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
    else if (key === 'errors' || key === 'combos') render();
  }

  /** Mũi tên: đi tới ô trắng gần nhất theo hướng đó (nhảy qua ô đen); hết bàn thì đứng yên. */
  function move(dr, dc) {
    if (!game) return;
    const n = game.n;
    if (sel < 0) {
      select(firstWhite(), true);
      return;
    }
    let r = Math.floor(sel / n) + dr;
    let c = (sel % n) + dc;
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c;
      if (game.white[i]) {
        select(i, true);
        return;
      }
      r += dr;
      c += dc;
    }
    if (els[sel]) els[sel].focus();
  }

  /* ---------------- Sự kiện ---------------- */

  $('board').addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b) select(Number(b.dataset.i));
  });
  $('pad').addEventListener('click', (e) => {
    const b = e.target.closest('.key');
    if (b) input(Number(b.dataset.d), e.shiftKey);
  });
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
    // Nút của thanh trên / hộp thoại giữ hành vi Space mặc định; ô, bàn số, công cụ thì Space = ghi chú
    const onGame = !!(e.target.closest && e.target.closest('.board, .pad, .tools'));
    const onOtherButton = !onGame && e.target.closest && e.target.closest('button, input, a[href]');
    // Chữ số: dùng e.code để Shift+số (ra !, @…) vẫn nhận ra là số → ghi chú
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    const digit = m ? Number(m[1]) : k >= '0' && k <= '9' && k.length === 1 ? Number(k) : -1;
    if (digit >= 1) input(digit, e.shiftKey);
    else if (digit === 0 || k === 'Backspace' || k === 'Delete') eraseCell();
    else if (ARROWS[k]) move(ARROWS[k][0], ARROWS[k][1]);
    else if (k === ' ') {
      if (onOtherButton) return; // Space trên nút khác: để trình duyệt bấm nút đó
      toggleNotes();
    } else if (lower === 'z') step(E.undo);
    else if (lower === 'y') step(E.redo);
    else if (lower === 'h') requestHint();
    else if (lower === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Space trên ô / bàn số / công cụ: chặn cả keyup để trình duyệt không "bấm" nút đó thêm lần nữa
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && e.target.closest && e.target.closest('.board, .pad, .tools')) e.preventDefault();
  });

  kit.onLeave(persist);

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
    sel = firstWhite();
    syncSizeSetting();
    clock.set(saved.elapsed);
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
