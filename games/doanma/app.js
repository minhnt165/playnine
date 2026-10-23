/* =====================================================================
 * Đoán Mã - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   Chạm màu để điền ô trống kế tiếp, chạm chốt ở hàng đang nhập để xóa, "Kiểm tra" khi hàng đầy.
 *   Hai mode chọn trong Cài đặt (easy / hard), xếp hạng theo thời gian phá mã (metric time_low).
 *   Đồng hồ chạy từ chốt đầu tiên được điền.
 *   Báo ván cho cổng:
 *   - Chia ván mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *   - Phá được mã: kit.sdk.end({ mode, won: true, timeMs }); hết lượt: won: false
 *   - Bỏ ván đã điền ít nhất một chốt: won: false; ván chưa điền chốt nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const kit = PNKit.init({
    gameId: 'doanma',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { mode: 'easy' },
    onSetting: (key, value) => { if (key === 'mode') changeMode(value); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null;
  let endTimer = 0; // hẹn mở hộp kết thúc (để kịp thấy phản hồi / mã lộ ra)
  let fx = null; // hiệu ứng cho lần vẽ kế tiếp: { pop: ô vừa điền } | { scored: hàng vừa chấm } | { shake: true }

  /** Mode trong cài đặt (giá trị lạ thì về Dễ). */
  const settingMode = () => (E.MODE_KEYS.indexOf(kit.settings.get().mode) >= 0 ? kit.settings.get().mode : 'easy');

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: 0, won: 0, best: { easy: null, hard: null } };
    if (Number.isInteger(raw.played) && raw.played >= 0) s.played = raw.played;
    if (Number.isInteger(raw.won) && raw.won >= 0) s.won = Math.min(raw.won, s.played);
    E.MODE_KEYS.forEach((k) => {
      const b = raw.best && raw.best[k];
      if (typeof b === 'number' && b > 0) s.best[k] = b;
    });
    return s;
  })();

  /** m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    return m + ':' + String(s).padStart(2, '0') + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }
  const fmtBest = (mode) => (stats.best[mode] == null ? '–' : fmt(stats.best[mode]));

  /* ---------------- Chốt ---------------- */
  const colorName = (c) => t('color.' + c);
  function pegHTML(c, cls, style) {
    return '<span class="peg c' + c + (cls ? ' ' + cls : '') + '"' + (style ? ' style="' + style + '"' : '') + '><svg class="sym" aria-hidden="true"><use href="#sym-' + c + '"/></svg></span>';
  }
  /** Chốt phản hồi: đặc (đúng chỗ) trước, rỗng (sai chỗ) sau, còn lại là chấm mờ. */
  function pinsHTML(pegs, black, white) {
    let s = '<span class="pins" style="--pc:' + Math.ceil(pegs / 2) + '" aria-hidden="true">';
    for (let i = 0; i < pegs; i++) {
      const k = i < black ? 'black' : i < black + white ? 'white' : 'none';
      s += '<i class="pin ' + k + '" style="--d:' + i + '"></i>';
    }
    return s + '</span>';
  }
  const feedbackText = (r) => t('row.feedback', { black: r.black, white: r.white });

  /* ---------------- Bố cục: cỡ chốt theo chỗ trống, 1 hoặc 2 cột hàng ---------------- */
  const ROW_H = 1.3; // chiều cao hàng (đơn vị = cỡ chốt P)
  const ROW_GAP = 0.12;
  const COL_GAP = 0.6;
  function layout() {
    if (!game) return;
    const wrap = $('board-wrap');
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (!W || !H) return;
    const m = E.MODES[game.mode];
    const rowW = 2.85 + 1.18 * m.pegs; // lề + số thứ tự + chốt + phản hồi (khớp style.css)
    let best = { p: 0, cols: 1, per: m.guesses };
    [1, 2].forEach((cols) => {
      const per = Math.ceil(m.guesses / cols);
      const hUnits = ROW_H * (per + 1) + ROW_GAP * per + 0.3;
      const wUnits = rowW * cols + COL_GAP * (cols - 1);
      const p = Math.min(H / hUnits, W / wUnits, 46);
      // Hai cột chỉ khi chốt to hơn hẳn (màn ngang thấp); còn lại giữ một cột cho dễ đọc
      if (cols === 1 || p > best.p * 1.2) best = { p, cols, per };
    });
    const board = $('board');
    board.style.setProperty('--p', Math.max(14, Math.floor(best.p)) + 'px');
    board.style.setProperty('--per', best.per);
    board.dataset.cols = best.cols;
  }

  /* ---------------- Vẽ ---------------- */
  let raf = 0;
  function tick() {
    $('time').textContent = fmt(clock.elapsed());
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(tick);
  }

  function renderSecret() {
    const m = E.MODES[game.mode];
    const over = E.isOver(game);
    let s = '<span class="row-num" aria-hidden="true"><svg class="lock" viewBox="0 0 24 24"><path d="' +
      (over ? 'M17 9h-1V7a4 4 0 0 0-7.9-.9l1.9.6A2 2 0 0 1 14 7v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2z' :
        'M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V7z') +
      '"/></svg></span><span class="pegs">';
    for (let i = 0; i < m.pegs; i++) s += over ? pegHTML(game.secret[i], 'reveal', '--d:' + i) : '<span class="peg hidden">?</span>';
    s += '</span><span class="pins-spacer"></span>';
    const row = $('secret-row');
    row.innerHTML = s;
    row.setAttribute('aria-label', over ? t('board.secret', { code: game.secret.map(colorName).join(', ') }) : t('board.hidden'));
    row.classList.toggle('open', over);
  }

  function renderRows() {
    const m = E.MODES[game.mode];
    const over = E.isOver(game);
    const focusSlot = document.activeElement && document.activeElement.classList.contains('slot') ? document.activeElement.dataset.i : null;
    let html = '';
    for (let r = 0; r < m.guesses; r++) {
      const num = '<span class="row-num" aria-hidden="true">' + (r + 1) + '</span>';
      if (r < game.rows.length) {
        const row = game.rows[r];
        const label = t('row.done', { n: r + 1, code: row.code.map(colorName).join(', '), feedback: feedbackText(row) });
        const cls = fx && fx.scored === r ? ' scored' : '';
        html += '<li class="row done' + cls + (row.black === m.pegs ? ' win' : '') + '" aria-label="' + label + '">' + num + '<span class="pegs">' +
          row.code.map((c) => pegHTML(c)).join('') + '</span>' + pinsHTML(m.pegs, row.black, row.white) + '</li>';
      } else if (r === game.rows.length && !over) {
        const next = game.current.indexOf(null);
        let pegs = '';
        game.current.forEach((c, i) => {
          if (c === null) {
            pegs += '<button type="button" class="slot peg empty' + (i === next ? ' next' : '') + '" data-i="' + i + '" tabindex="-1" aria-label="' +
              t('slot.empty', { n: i + 1 }) + '"></button>';
          } else {
            pegs += '<button type="button" class="slot peg c' + c + (fx && fx.pop === i ? ' pop' : '') + '" data-i="' + i + '" aria-label="' +
              t('slot.filled', { n: i + 1, color: colorName(c) }) + '"><svg class="sym" aria-hidden="true"><use href="#sym-' + c + '"/></svg></button>';
          }
        });
        html += '<li class="row current' + (fx && fx.shake ? ' shake' : '') + '" aria-label="' + t('row.current', { n: r + 1 }) + '">' + num +
          '<span class="pegs">' + pegs + '</span>' + pinsHTML(m.pegs, 0, 0) + '</li>';
      } else {
        html += '<li class="row future" aria-hidden="true">' + num + '<span class="pegs">' + '<span class="peg empty"></span>'.repeat(m.pegs) + '</span>' +
          pinsHTML(m.pegs, 0, 0) + '</li>';
      }
    }
    $('rows').innerHTML = html;
    if (focusSlot != null) {
      const el = $('rows').querySelector('.slot[data-i="' + focusSlot + '"]:not(.empty)') || $('rows').querySelector('.slot:not(.empty)');
      if (el) el.focus();
    }
  }

  function renderPalette() {
    const m = E.MODES[game.mode];
    const pal = $('palette');
    if (pal.dataset.mode !== game.mode) {
      // Dựng lại bảng màu khi đổi mode
      let s = '';
      for (let c = 0; c < m.colors; c++) {
        s += '<button type="button" class="pal" data-c="' + c + '">' + pegHTML(c) + '<span class="pal-key" aria-hidden="true">' + (c + 1) + '</span></button>';
      }
      pal.innerHTML = s;
      pal.dataset.mode = game.mode;
      pal.style.setProperty('--n', m.colors);
    }
    pal.querySelectorAll('.pal').forEach((b) => {
      const c = Number(b.dataset.c);
      const used = !m.repeats && game.current.indexOf(c) >= 0;
      b.disabled = !E.canPlace(game, c);
      b.classList.toggle('used', used);
      b.setAttribute('aria-label', t('palette.color', { color: colorName(c), key: c + 1 }));
    });
  }

  function render() {
    const m = E.MODES[game.mode];
    const over = E.isOver(game);
    $('mode-badge').textContent = t('mode.' + game.mode);
    $('best-label').textContent = t('hud.bestMode', { mode: t('mode.' + game.mode) });
    $('left').textContent = E.guessesLeft(game) + '/' + m.guesses;
    $('best').textContent = fmtBest(game.mode);
    $('help-keys').innerHTML = t('help.keys', { n: m.colors });
    renderSecret();
    renderRows();
    renderPalette();
    const submit = $('btn-submit');
    submit.textContent = over ? t('kit.playAgain') : t('board.submit');
    submit.disabled = !over && !E.isFull(game);
    submit.classList.toggle('ready', !over && E.isFull(game));
    $('btn-back').disabled = over || game.current.every((c) => c === null);
    fx = null;
    layout();
    tick();
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && game.started && !E.isOver(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const shown = E.MODE_KEYS.filter((k) => stats.best[k] != null);
    const noteMode = stats.best[settingMode()] != null ? settingMode() : shown[0];
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: noteMode ? t('summary.note', { time: fmt(stats.best[noteMode]), mode: t('mode.' + noteMode) }) : t('summary.none'),
      stats: shown.map((k) => ({ value: fmt(stats.best[k]), label: t('summary.best', { mode: t('mode.' + k) }) })),
      resume: inPlay()
        ? {
            title: t('app.name') + ' · ' + t('mode.' + game.mode),
            detail: t('summary.resume', { n: game.rows.length + 1, total: E.MODES[game.mode].guesses }),
            pct: game.rows.length / E.MODES[game.mode].guesses,
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
  function newGame(mode) {
    clearTimeout(endTimer);
    kit.modal.close('modal-end');
    const seed = (Math.random() * 4294967296) >>> 0;
    game = E.newGame(mode || settingMode(), seed);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(game.mode);
    $('live').textContent = '';
    render();
    writeSummary();
  }

  /** Thay ván bằng trạng thái mới; lưu lại nếu ván đang dở. */
  function update(next) {
    if (next === game) return false;
    game = next;
    if (game.started) clock.resume(); // đồng hồ chạy từ chốt đầu tiên
    return true;
  }

  function place(c) {
    if (!game || kit.modal.current()) return;
    const i = game.current.indexOf(null);
    if (!update(E.place(game, c))) {
      if (!E.isOver(game)) kit.sfx('error');
      return;
    }
    kit.sfx('place');
    fx = { pop: i };
    render();
    persist();
  }

  function clearSlot(i) {
    if (!game || kit.modal.current()) return;
    if (!update(E.clear(game, i))) return;
    kit.sfx('pop');
    render();
    persist();
  }

  function back() {
    if (!game || kit.modal.current()) return;
    if (!update(E.backspace(game))) return;
    kit.sfx('pop');
    render();
    persist();
  }

  function submit() {
    if (!game || kit.modal.current()) return;
    if (E.isOver(game)) return newGame();
    if (!E.isFull(game)) {
      kit.sfx('error');
      fx = { shake: true };
      render();
      return;
    }
    update(E.submit(game));
    const row = game.rows[game.rows.length - 1];
    fx = { scored: game.rows.length - 1 };
    $('live').textContent = feedbackText(row);
    if (E.isOver(game)) finish();
    else kit.sfx(row.black || row.white ? 'flip' : 'tap');
    render();
    persist();
  }

  function finish() {
    clock.pause();
    const won = E.status(game) === 'won';
    const mode = game.mode;
    const ms = Math.round(clock.elapsed());
    const best = won && (stats.best[mode] == null || ms < stats.best[mode]);
    stats.played++;
    if (won) stats.won++;
    if (best) stats.best[mode] = ms;
    saveStats();
    kit.sdk.end({ mode, won, timeMs: ms, assisted: false });
    if (won) {
      kit.sfx('win');
      kit.confetti();
    } else {
      kit.sfx('lose');
    }
    const n = game.rows.length;
    $('end-title').textContent = won ? t('end.won') : t('end.lost');
    $('end-text').textContent = won ? t('end.wonText', { n, time: fmt(ms) }) : t('end.lostText');
    $('end-code').innerHTML = game.secret.map((c) => pegHTML(c)).join('');
    $('end-code').setAttribute('aria-label', t('board.secret', { code: game.secret.map(colorName).join(', ') }));
    $('end-best').hidden = !best;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => kit.modal.open('modal-end'), reduceMotion ? 300 : 900);
  }

  /** Ván đang dở (đã điền chốt) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else {
      kit.sfx('start');
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      clock.pause();
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: game.mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newGame();
  }

  /** Đổi mode trong Cài đặt: chưa điền chốt nào (hoặc ván đã xong) thì chia lại ngay, đang chơi dở thì áp dụng từ ván sau. */
  function changeMode(mode) {
    renderModeDesc();
    if (!game || game.mode === mode) return;
    if (inPlay()) kit.toast(t('toast.nextGame', { mode: t('mode.' + mode) }), 2600);
    else newGame(mode);
  }
  function renderModeDesc() {
    const m = E.MODES[settingMode()];
    const desc = t(m.repeats ? 'mode.descRepeats' : 'mode.descUnique', { pegs: m.pegs, colors: m.colors, guesses: m.guesses });
    $('mode-desc').textContent = desc;
    $('help-mode').textContent = t('help.modes');
  }

  /* ---------------- Sự kiện ---------------- */
  $('palette').addEventListener('click', (e) => {
    const b = e.target.closest('.pal');
    if (b) place(Number(b.dataset.c));
  });
  $('rows').addEventListener('click', (e) => {
    const b = e.target.closest('.slot');
    if (b && !b.classList.contains('empty')) clearSlot(Number(b.dataset.i));
  });
  $('btn-back').addEventListener('click', back);
  $('btn-submit').addEventListener('click', submit);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => newGame());
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-best-easy').textContent = fmtBest('easy');
    $('stats-best-hard').textContent = fmtBest('hard');
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    if (/^[1-9]$/.test(k)) place(Number(k) - 1);
    else if (k === 'Backspace' || k === 'Delete') back();
    else if (k === 'Enter') submit(); // Enter luôn là "Kiểm tra" (Space vẫn bấm nút đang focus)
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  renderModeDesc();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.started && !E.isOver(restored)) {
    game = restored;
    clock.set(saved.elapsed);
    clock.resume(); // ván đã bắt đầu: đồng hồ chạy tiếp ngay
    kit.sdk.start(game.mode, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
  } else {
    newGame();
  }
})();
