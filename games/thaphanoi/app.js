/* =====================================================================
 * Tháp Hà Nội - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Chạm cọc để nhấc đĩa trên cùng (đĩa nổi lên trên cọc), chạm cọc khác để đặt; kéo thả bằng chuột / chạm
 *   - Phím 1/2/3 nhấc rồi đặt, Esc đặt lại, R (hoặc N) chơi lại; không có hoàn tác
 *   - Mode d4..d7 (số đĩa) chọn trong Cài đặt, xếp hạng theo thời gian (metric time_low)
 *   Luật báo ván cho cổng:
 *   - Chia ván mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *   - Thắng: kit.sdk.end({ mode, won: true, timeMs, assisted: false })
 *   - Bỏ ván đã đi ít nhất một nước (ván mới / đổi số đĩa): kit.sdk.end({ mode, won: false, ... }); chưa đi nước nào thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['d4', 'd5', 'd6', 'd7'];
  const disksOf = (m) => Number(m.slice(1));
  const modeOf = (n) => 'd' + n;

  const kit = PNKit.init({ gameId: 'thaphanoi', version: '1.0.1', dict: window.GAME_DICT, defaults: { mode: 'd4' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const stage = $('stage');
  const board = $('board');
  const pegEls = Array.from(board.querySelectorAll('.peg'));

  let mode = MODES.indexOf(kit.settings.get().mode) >= 0 ? kit.settings.get().mode : 'd4';
  let game = null;
  let held = null; // cọc có đĩa đang được nhấc (null = không nhấc)
  let press = null; // lần chạm / bấm chuột đang diễn ra trên bàn
  let drag = null; // { from, x, y, over } khi đang kéo đĩa
  let landing = null; // { k }: đĩa vừa đặt, đang bay ngang trước khi hạ xuống
  let landTimer = 0;
  let pendingMode = null; // số đĩa chờ đổi sau khi xác nhận bỏ ván
  let diskEls = [];
  let geo = null;
  const stats = readStats();

  function readStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: int(raw.played), won: int(raw.won), perfect: int(raw.perfect), best: {} };
    MODES.forEach((m) => {
      const v = raw.best && raw.best[m];
      s.best[m] = Number.isFinite(v) && v > 0 ? v : null;
    });
    return s;
  }

  /** m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    return m + ':' + String(s).padStart(2, '0') + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }
  const modeName = (m) => t('mode.name', { n: disksOf(m) });
  const inProgress = () => !!game && game.moves > 0 && !E.isWon(game);
  const canPlay = () => !!game && !E.isWon(game) && !kit.modal.current();
  const announce = (msg) => { $('live').textContent = msg; };

  /* ---------------- Bàn chơi: dựng đĩa, tính kích thước ---------------- */
  function buildDisks() {
    diskEls.forEach((el) => el && el.remove());
    diskEls = [];
    for (let k = 1; k <= game.n; k++) {
      const el = document.createElement('div');
      el.className = 'disk';
      el.dataset.size = k;
      const face = document.createElement('span');
      face.className = 'disk-face';
      el.appendChild(face);
      board.appendChild(el);
      diskEls[k] = el;
    }
  }

  /** Tính kích thước theo khung chơi: cao đĩa dh, chỗ trống phía trên cọc để đĩa nhấc lên, đế + số cọc ở dưới. */
  function layout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H || !game) return;
    const n = game.n;
    const colW = W / 3;
    const maxW = Math.min(colW - 10, 172);
    const labelH = 22;
    const baseH = 12;
    const liftGap = 12;
    const dh = Math.floor(Math.max(8, Math.min(40, maxW / 3.8, (H - labelH - baseH - liftGap - 6) / (n + 1.7))));
    const minW = Math.max(maxW * 0.3, dh * 1.4);
    const poleH = Math.round((n + 0.7) * dh);
    const boardH = Math.min(H, dh + liftGap + poleH + baseH + labelH + 6);
    const baseY = boardH - labelH - baseH;
    geo = { colW, dh, minW, maxW, baseY, liftY: baseY - poleH - liftGap - dh };
    board.classList.add('no-anim');
    board.style.height = boardH + 'px';
    board.style.setProperty('--dh', dh + 'px');
    board.style.setProperty('--pole-h', poleH + 'px');
    board.style.setProperty('--base-h', baseH + 'px');
    board.style.setProperty('--label-h', labelH + 'px');
    renderBoard();
    void board.offsetWidth; // áp vị trí mới không chạy hiệu ứng
    board.classList.remove('no-anim');
  }

  const diskW = (k) => (game.n === 1 ? geo.maxW : geo.minW + ((k - 1) / (game.n - 1)) * (geo.maxW - geo.minW));
  const pegX = (p) => geo.colW * (p + 0.5);

  function renderBoard() {
    if (!geo) return;
    game.pegs.forEach((s, p) => {
      s.forEach((k, i) => {
        const el = diskEls[k];
        const w = diskW(k);
        const isTop = i === s.length - 1;
        const dragging = !!drag && drag.from === p && isTop;
        let x = pegX(p) - w / 2;
        let y = geo.baseY - (i + 1) * geo.dh;
        if ((held === p && isTop) || (landing && landing.k === k)) y = geo.liftY;
        if (dragging) {
          x = drag.x - w / 2;
          y = drag.y - geo.dh / 2;
        }
        el.style.width = w + 'px';
        el.style.height = geo.dh + 'px';
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        el.classList.toggle('held', held === p && isTop);
        el.classList.toggle('dragging', dragging);
      });
    });
    pegEls.forEach((el, p) => {
      const s = game.pegs[p];
      el.classList.toggle('can-drop', held != null && E.canMove(game, held, p));
      el.classList.toggle('over', !!drag && drag.over === p && drag.from !== p);
      el.classList.toggle('source', held === p);
      el.setAttribute('aria-pressed', String(held === p));
      el.setAttribute('aria-label', t('peg.label', {
        p: p + 1,
        goal: p === E.GOAL ? t('peg.goal') : '',
        state: s.length ? t('peg.disks', { n: s.length, top: s[s.length - 1] }) : t('peg.empty'),
      }));
    });
  }

  /* ---------------- Vẽ số liệu ---------------- */
  let raf = 0;
  function tick() {
    $('time').textContent = fmt(clock.elapsed());
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(tick);
  }

  function render() {
    const min = E.minMoves(game.n);
    $('moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('moves-min').textContent = '/' + min;
    $('best').textContent = stats.best[mode] == null ? '–' : fmt(stats.best[mode]);
    $('mode-name').textContent = modeName(mode);
    $('min-note').textContent = t('mode.min', { min });
    renderBoard();
    tick();
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const withBest = MODES.filter((m) => stats.best[m] != null);
    const noteMode = stats.best[mode] != null ? mode : withBest[0];
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: noteMode ? t('summary.note', { mode: modeName(noteMode), time: fmt(stats.best[noteMode]) }) : t('summary.none'),
      stats: withBest.map((m) => ({ value: fmt(stats.best[m]), label: modeName(m) })),
      resume: inProgress()
        ? { title: t('app.name'), detail: t('summary.resume', { mode: modeName(mode), moves: game.moves }), pct: Math.min(0.95, game.moves / E.minMoves(game.n)) }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress()) kit.store.write(keys.save, { v: 1, mode, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function resetPlay() {
    held = null;
    press = null;
    drag = null;
    landing = null;
    clearTimeout(landTimer);
  }

  function newGame() {
    game = E.newGame(disksOf(mode));
    resetPlay();
    clock.reset();
    kit.store.remove(keys.save);
    buildDisks();
    kit.sdk.start(mode);
    layout();
    render();
    writeSummary();
  }

  /** Bỏ ván đang dở (đã đi ít nhất một nước): tính là thua và báo cổng. Chưa đi nước nào thì không gửi gì. */
  function abandon() {
    if (!inProgress()) return;
    clock.pause();
    stats.played++;
    saveStats();
    kit.sdk.end({ mode: modeOf(game.n), won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    kit.store.remove(keys.save);
    game = null; // đã báo thua: không gửi lần nữa (ván mới được chia ngay sau đó)
  }

  function pick(p) {
    if (!E.top(game, p)) return; // cọc trống: không có gì để nhấc
    held = p;
    if (game.moves > 0) clock.resume();
    kit.sfx('tap');
    announce(t('live.picked', { d: E.top(game, p), p: p + 1 }));
    render();
  }

  function putBack() {
    if (held == null) return;
    held = null;
    announce(t('live.cancel'));
    render();
  }

  /** Lắc đĩa (và nháy cọc đích) khi đặt sai luật; chạy lại hiệu ứng nếu đang lắc. */
  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el._fx);
    el._fx = setTimeout(() => el.classList.remove(cls), 500);
  }

  function tryMove(from, to, viaDrag) {
    const k = E.top(game, from);
    const next = E.move(game, from, to);
    if (!next) {
      kit.sfx('error');
      if (k) restart(diskEls[k].firstChild, 'shake');
      restart(pegEls[to], 'bad');
      announce(t('live.illegal'));
      if (viaDrag) held = null; // kéo sai thì đĩa về chỗ cũ; chạm sai thì đĩa vẫn nhấc để chọn cọc khác
      render();
      return;
    }
    const first = game.moves === 0;
    game = next;
    held = null;
    if (first) {
      clock.reset();
      clock.start();
    } else clock.resume();
    kit.sfx('place');
    announce(t('live.moved', { d: k, p: to + 1, m: game.moves }));
    // Đĩa đang nhấc: bay ngang sang trên cọc đích rồi mới hạ xuống
    if (!viaDrag && !reduceMotion.matches) {
      clearTimeout(landTimer);
      landing = { k };
      landTimer = setTimeout(() => {
        landing = null;
        renderBoard();
      }, 130);
    }
    if (E.isWon(game)) finish();
    else persist();
    render();
  }

  function tapPeg(p) {
    if (!game) return;
    if (E.isWon(game)) {
      if (!kit.modal.current()) kit.modal.open('modal-win'); // bàn đã xong: mở lại kết quả để chơi tiếp
      return;
    }
    if (!canPlay()) return;
    if (held == null) pick(p);
    else if (held === p) putBack();
    else tryMove(held, p, false);
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const n = game.n;
    const min = E.minMoves(n);
    const perfect = game.moves === min;
    const isBest = stats.best[mode] == null || ms < stats.best[mode];
    stats.played++;
    stats.won++;
    if (perfect) stats.perfect++;
    if (isBest) stats.best[mode] = ms;
    saveStats();
    kit.store.remove(keys.save);
    writeSummary();
    kit.sdk.end({ mode: modeOf(n), won: true, timeMs: ms, assisted: false });
    kit.sfx('win');
    kit.confetti();

    $('win-title').textContent = perfect ? t('win.perfect') : t('win.title');
    $('win-time').textContent = fmt(ms);
    $('win-moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('win-min').textContent = t('win.min', { min });
    $('win-best-label').textContent = t('win.bestFor', { mode: modeName(mode) });
    $('win-best').textContent = fmt(stats.best[mode]);
    const note = [];
    if (isBest) note.push(t('win.newBest', { mode: modeName(mode) }));
    note.push(perfect ? t('win.perfectNote') : t('win.extra', { n: game.moves - min }));
    $('win-note').textContent = note.join(' ');
    $('win-note').classList.toggle('is-best', isBest);
    const next = MODES[MODES.indexOf(mode) + 1];
    $('btn-next').hidden = !next;
    if (next) $('btn-next').textContent = t('win.next', { n: disksOf(next) });
    // Chờ đĩa cuối hạ xuống rồi mới hiện kết quả
    setTimeout(() => {
      if (game && E.isWon(game) && !kit.modal.current()) kit.modal.open('modal-win');
    }, reduceMotion.matches ? 0 : 450);
  }

  /** Ván đang dở thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) {
      pendingMode = null;
      kit.modal.open('modal-confirm');
    } else newGame();
  }

  /** Đổi số đĩa (từ Cài đặt hoặc nút "Thử n đĩa"): bỏ ván dở nếu có rồi chia ván mới. */
  function onSetting(key, value) {
    if (key !== 'mode' || MODES.indexOf(value) < 0 || value === mode) return;
    abandon();
    mode = value;
    newGame();
  }

  /* ---------------- Chạm / kéo thả (pointer events) ---------------- */
  function boardPoint(e) {
    const r = board.getBoundingClientRect();
    const x = e.clientX - r.left;
    return { x, y: e.clientY - r.top, p: Math.max(0, Math.min(2, Math.floor(x / (r.width / 3)))) };
  }

  board.addEventListener('pointerdown', (e) => {
    if (press || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!game || kit.modal.current()) return;
    const pt = boardPoint(e);
    // Kéo được khi cọc có đĩa và chưa nhấc đĩa nào (hoặc đang nhấc chính đĩa của cọc này)
    const canDrag = canPlay() && E.top(game, pt.p) > 0 && (held == null || held === pt.p);
    press = { id: e.pointerId, p: pt.p, x0: e.clientX, y0: e.clientY, canDrag, active: false };
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) return;
    if (!press.active) {
      if (!press.canDrag || Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < 8) return;
      press.active = true;
      if (held !== press.p) kit.sfx('tap');
      held = press.p;
      if (game.moves > 0) clock.resume();
      tick();
    }
    const pt = boardPoint(e);
    drag = { from: press.p, x: pt.x, y: pt.y, over: pt.p };
    renderBoard();
  });

  function endPointer(e, cancelled) {
    if (!press || press.id !== e.pointerId) return;
    const pr = press;
    press = null;
    if (pr.active) {
      const to = boardPoint(e).p;
      drag = null;
      if (cancelled || to === pr.p || !canPlay()) {
        held = null;
        render();
      } else tryMove(pr.p, to, true);
    } else if (!cancelled) tapPeg(pr.p);
  }
  window.addEventListener('pointerup', (e) => endPointer(e, false));
  window.addEventListener('pointercancel', (e) => endPointer(e, true));

  // Enter / Space trên cọc đang focus (click do bàn phím có detail = 0; click do chuột đã xử lý ở pointerup)
  pegEls.forEach((el, p) => el.addEventListener('click', (e) => { if (e.detail === 0) tapPeg(p); }));

  /* ---------------- Nút, phím ---------------- */
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', () => {
    kit.modal.close('modal-confirm');
    const m = pendingMode;
    pendingMode = null;
    abandon();
    if (m && m !== mode) kit.settings.set({ mode: m }); // onSetting chia ván mới
    else newGame();
  });
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newGame();
  });
  $('btn-next').addEventListener('click', () => {
    kit.modal.close('modal-win');
    const next = MODES[MODES.indexOf(mode) + 1];
    if (next) kit.settings.set({ mode: next });
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    const grid = $('stats-best');
    grid.textContent = '';
    MODES.forEach((m) => {
      const cell = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = modeName(m);
      dd.textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]);
      cell.append(dt, dd);
      grid.appendChild(cell);
    });
  });

  // Đổi số đĩa giữa ván: hỏi trước (chặn ở pha capture, trước khi kit đổi cài đặt)
  const segMode = $('seg-mode');
  segMode.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-value]');
    if (!b || b.dataset.value === mode || !inProgress()) return;
    e.stopPropagation();
    pendingMode = b.dataset.value;
    kit.modal.open('modal-confirm');
  }, true);
  segMode.addEventListener('keydown', (e) => {
    if (!inProgress() || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
    // Mũi tên chỉ chuyển focus, Enter / Space mới chọn (rồi hỏi xác nhận như trên)
    e.stopPropagation();
    e.preventDefault();
    const buttons = Array.from(segMode.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    buttons[(i + d + buttons.length) % buttons.length].focus();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') {
      if (!drag) tapPeg(Number(k) - 1);
    } else if (k === 'escape') {
      if (held == null || drag) return;
      putBack();
    } else if (k === 'r' || k === 'n') requestNew();
    else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(stage);
  else window.addEventListener('resize', layout);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    const m = modeOf(game.n);
    if (m !== mode) {
      mode = m; // onSetting bỏ qua vì mode đã trùng
      kit.settings.set({ mode: m });
    }
    clock.set(saved.elapsed);
    buildDisks();
    kit.sdk.start(mode, true);
    kit.toast(t('toast.saved'));
    layout();
    render();
    writeSummary();
  } else {
    newGame();
  }
})();
