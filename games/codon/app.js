/* =====================================================================
 * Cờ Đơn - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước; worker.js chạy bộ giải)
 *   - Mode = bàn ('english' | 'european' | 'triangle'), metric wins; mỗi ván là một lần chơi một bàn
 *   - Điều khiển: chạm quân rồi chạm lỗ đích (lỗ hợp lệ sáng lên), hoặc kéo quân; bàn phím: mũi tên + Enter
 *   - Đi lại / Từ đầu không giới hạn, vẫn là cùng ván và không tính là trợ giúp; Gợi ý thì ván thành assisted
 *   - Báo ván cho cổng:
 *     - ván mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - còn một quân: kit.sdk.end({ mode, won: true, timeMs, assisted })
 *     - kẹt rồi chọn Ván mới, hoặc bỏ ván đã đi ít nhất một nước (ván mới / đổi bàn): won: false
 *     - chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = E.BOARD_IDS;
  const kit = PNKit.init({ gameId: 'codon', version: '1.0.1', dict: window.GAME_DICT, defaults: { board: 'english' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const SVG = 'http://www.w3.org/2000/svg';

  const defaults = { played: 0, won: 0, perfect: 0, streak: 0, best: {} };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  if (!stats.best || typeof stats.best !== 'object') stats.best = {};

  let game = null;
  let B = null; // hình bàn đang vẽ (E.board)
  let holes = []; // nút lỗ theo chỉ số
  let pegEls = []; // quân trong từng lỗ
  let selected = -1; // quân đang chọn
  let cursor = 0; // lỗ đang trỏ bằng bàn phím
  let hintMove = -1; // nước gợi ý đang hiện (chỉ số trong B.jumps)
  let pending = null; // việc chờ xác nhận bỏ ván: { kind: 'new' } | { kind: 'mode', mode }
  let drag = null;
  let endTimer = 0;
  let tickTimer = 0;

  const mode = () => game.board;
  const label = (m) => t('mode.' + m);
  /** Ván đang dở: đã đi ít nhất một nước và chưa thắng (kẹt vẫn là dở vì còn đi lại được). */
  const inPlay = () => !!game && game.made > 0 && !E.isWon(game);

  /** m:ss */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------------- Dựng bàn ---------------- */

  /** Viền bàn vuông: hợp các dải hàng (mỗi hàng rộng từ lỗ đầu tới lỗ cuối), góc lồi bo nhờ nét viền tròn. */
  function squareOutline(b, pad) {
    const rows = [];
    b.holes.forEach((h) => {
      const row = rows[h.r] || (rows[h.r] = { l: h.x, r: h.x, y: h.y });
      row.l = Math.min(row.l, h.x);
      row.r = Math.max(row.r, h.x);
    });
    const last = rows.length - 1;
    // Mép trên / dưới cùng cách tâm lỗ một khoảng pad; ranh giới giữa hai hàng nằm giữa hai hàng lỗ
    const top = (i) => (i === 0 ? rows[i].y - pad : rows[i].y - 0.5);
    const bot = (i) => (i === last ? rows[i].y + pad : rows[i].y + 0.5);
    const pts = [];
    rows.forEach((row, i) => pts.push([row.r + pad, top(i)], [row.r + pad, bot(i)]));
    for (let i = last; i >= 0; i--) pts.push([rows[i].l - pad, bot(i)], [rows[i].l - pad, top(i)]);
    return pts;
  }

  /** Nền gỗ của bàn: đa giác viền (vuông) hoặc tam giác nối ba lỗ góc, nét viền dày bo tròn. */
  function drawBackground(svg, b) {
    svg.setAttribute('viewBox', '0 0 ' + b.span + ' ' + b.span);
    let pts;
    let stroke;
    let face; // nét của mặt gỗ sáng (tam giác cần dày để phủ quanh lỗ góc); phần nét ngoài còn lại là khung sẫm
    if (b.id === 'triangle') {
      const corners = [b.at(0, 0), b.at(4, 0), b.at(4, 4)].map((i) => [b.holes[i].x, b.holes[i].y]);
      pts = corners;
      stroke = 1.5;
      face = 0.94;
    } else {
      pts = squareOutline(b, 0.24);
      stroke = 0.56;
      face = 0;
    }
    const poly = pts.map((p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' ');
    svg.innerHTML =
      '<defs><linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" class="wood-1"/><stop offset="1" class="wood-2"/></linearGradient></defs>' +
      '<polygon class="board-shape" points="' + poly + '" stroke-width="' + stroke + '"/>' +
      (face ? '<polygon class="board-face" points="' + poly + '" stroke-width="' + face + '"/>' : '') +
      '<polygon class="board-rim" points="' + poly + '"/>';
  }

  function buildBoard() {
    B = E.board(game.board);
    const board = $('board');
    board.dataset.board = B.id;
    board.style.setProperty('--span', B.span);
    board.querySelectorAll('.hole').forEach((el) => el.remove());
    drawBackground($('board-bg'), B);
    holes = [];
    pegEls = [];
    const start = B.holes[B.start];
    B.holes.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hole';
      b.dataset.i = i;
      b.style.setProperty('--x', h.x);
      b.style.setProperty('--y', h.y);
      // độ trễ hiệu ứng chia quân: lan ra từ lỗ khởi đầu
      b.style.setProperty('--d', Math.round(Math.hypot(h.x - start.x, h.y - start.y) * 10) / 10);
      const peg = document.createElement('span');
      peg.className = 'peg';
      b.appendChild(peg);
      board.appendChild(b);
      holes.push(b);
      pegEls.push(peg);
    });
  }

  /* ---------------- Vẽ ---------------- */

  function render() {
    if (!B || B.id !== game.board) buildBoard();
    const tg = selected >= 0 ? E.targets(game, selected) : [];
    const hint = hintMove >= 0 ? B.jumps[hintMove] : null;
    const won = E.isWon(game);
    holes.forEach((b, i) => {
      const on = game.pegs[i] === 1;
      const target = tg.indexOf(i) >= 0;
      b.classList.toggle('on', on);
      b.classList.toggle('sel', i === selected);
      b.classList.toggle('target', target);
      b.classList.toggle('hint-from', !!hint && hint[0] === i);
      b.classList.toggle('hint-to', !!hint && hint[2] === i);
      b.classList.toggle('last', won && on);
      b.tabIndex = i === cursor ? 0 : -1;
      const h = B.holes[i];
      const key = on ? (i === selected ? 'hole.pegSel' : 'hole.peg') : target ? 'hole.target' : 'hole.empty';
      b.setAttribute('aria-label', t(key, { r: h.r + 1, c: h.c + 1 }));
    });
    const n = E.pegCount(game);
    const board = $('board');
    board.classList.toggle('won', won);
    board.classList.toggle('stuck', E.isStuck(game));
    board.setAttribute('aria-label', t('board.label', { board: label(mode()), n }));
    $('pegs').textContent = kit.i18n.fmtNumber(n);
    $('pegs').classList.toggle('bad', E.isStuck(game));
    renderTime();
    $('btn-undo').disabled = !game.history.length || won;
    $('btn-restart').disabled = !game.history.length || won;
    $('btn-hint').disabled = won || !!hintReq;
    $('btn-hint').classList.toggle('busy', !!hintReq);
    $('mode-name').textContent = label(mode());
    $('btn-mode').setAttribute('aria-label', t('mode.badge', { board: label(mode()) }));
  }

  function renderTime() {
    $('time').textContent = fmt(clock.elapsed());
  }

  /** Đồng hồ trên HUD chạy khi đang tính giờ. */
  function syncTick() {
    clearInterval(tickTimer);
    if (clock.running) tickTimer = setInterval(renderTime, 250);
    renderTime();
  }

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Hiệu ứng nhảy ---------------- */

  function centre(i) {
    const r = holes[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Quân không chuyển trạng thái bằng CSS trong lúc hiệu ứng nhảy chạy (tránh mờ dần sai chỗ). */
  function snap(list, ms) {
    list.forEach((i) => holes[i].classList.add('snap'));
    setTimeout(() => list.forEach((i) => holes[i] && holes[i].classList.remove('snap')), ms);
  }

  /** Quân bay từ `from` (hoặc từ điểm thả khi kéo) tới `to` theo đường vòng; quân ở `over` mờ dần. */
  function animateJump(from, over, to, drop) {
    if (calm()) return;
    const a = drop || centre(from);
    const c = centre(to);
    const dx = a.x - c.x;
    const dy = a.y - c.y;
    const peg = pegEls[to];
    holes[to].classList.add('flying');
    const frames = drop
      ? [{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.15)' }, { transform: 'none' }]
      : [
          { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
          { transform: 'translate(' + dx / 2 + 'px,' + (dy / 2 - holes[to].offsetHeight * 0.55) + 'px) scale(1.3)', offset: 0.5 },
          { transform: 'none' },
        ];
    const anim = peg.animate(frames, { duration: drop ? 140 : 320, easing: 'ease-in-out' });
    anim.onfinish = anim.oncancel = () => holes[to] && holes[to].classList.remove('flying');
    // Quân bị nhảy qua: bóng mờ dần và thu nhỏ
    const ghost = document.createElement('span');
    ghost.className = 'peg ghost';
    holes[over].appendChild(ghost);
    const g = ghost.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.3 }, { opacity: 0, transform: 'scale(.25)' }],
      { duration: 360, delay: drop ? 40 : 140, easing: 'ease-in', fill: 'both' },
    );
    g.onfinish = g.oncancel = () => ghost.remove();
  }

  /** Đi lại: quân bay ngược từ `to` về `from`, quân ở `over` hiện lại. */
  function animateUndo(from, over, to) {
    if (calm()) return;
    const a = centre(to);
    const c = centre(from);
    holes[from].classList.add('flying');
    const anim = pegEls[from].animate(
      [
        { transform: 'translate(' + (a.x - c.x) + 'px,' + (a.y - c.y) + 'px)' },
        { transform: 'translate(' + (a.x - c.x) / 2 + 'px,' + ((a.y - c.y) / 2 - holes[from].offsetHeight * 0.45) + 'px) scale(1.2)', offset: 0.5 },
        { transform: 'none' },
      ],
      { duration: 260, easing: 'ease-in-out' },
    );
    anim.onfinish = anim.oncancel = () => holes[from] && holes[from].classList.remove('flying');
    pegEls[over].animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 80, easing: 'ease-out', fill: 'backwards' });
  }

  /** Bàn mới: quân hiện dần lan ra từ lỗ khởi đầu. */
  function deal() {
    if (calm()) return;
    const board = $('board');
    replay(board, 'deal');
    clearTimeout(deal.timer);
    deal.timer = setTimeout(() => board.classList.remove('deal'), 1100);
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? mode() : kit.settings.get().board;
    const startN = E.board(m).n - 1;
    const n = game ? E.pegCount(game) : startN;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.won > 0 ? t('summary.note', { n: stats.won }) : t('summary.none'),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(stats.perfect), label: t('stats.perfect') }]
        : [],
      resume: inPlay()
        ? { title: t('app.name') + ' · ' + label(m), detail: t('summary.resume', { n }), pct: Math.max(0, Math.min(1, (startN - n) / (startN - 1))) }
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

  /** Lỗ con trỏ mặc định: quân đầu tiên có nước đi. */
  function firstMovable() {
    const k = E.legalMoves(game)[0];
    return k == null ? 0 : B.jumps[k][0];
  }

  function clearTransient() {
    clearTimeout(endTimer);
    selected = -1;
    hintMove = -1;
    hintReq = null;
  }

  function newBoard(m) {
    clearTransient();
    game = E.newGame(m);
    if (!B || B.id !== m) buildBoard();
    cursor = firstMovable();
    clock.reset();
    syncTick();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    deal();
    writeSummary();
    warm(m);
  }

  /** Đi nước k. drop = điểm thả khi kéo (để quân trượt từ chỗ thả vào lỗ). */
  function doJump(k, drop) {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    const next = E.applyJump(game, k);
    if (next === game) return;
    const [a, m, c] = B.jumps[k];
    game = next;
    hintMove = -1;
    hintReq = null;
    // Quân vừa đáp còn nhảy tiếp được thì giữ chọn nó (nhảy liên tiếp đỡ một lần chạm)
    selected = E.targets(game, c).length ? c : -1;
    cursor = c;
    if (!E.isWon(game)) clock.resume();
    snap([a, c], 400);
    render();
    animateJump(a, m, c, drop);
    kit.sfx(game.history.length === 1 ? 'start' : 'capture');
    if (E.isWon(game)) finish();
    else if (E.isStuck(game)) stuck();
    else {
      syncTick();
      persist();
    }
  }

  function undoMove() {
    if (!game || !game.history.length || E.isWon(game)) return;
    if (kit.modal.current() && kit.modal.current().id !== 'modal-over') return;
    kit.modal.close('modal-over');
    clearTimeout(endTimer);
    const [a, m, c] = B.jumps[game.history[game.history.length - 1]];
    game = E.undo(game);
    selected = -1;
    hintMove = -1;
    hintReq = null;
    cursor = a;
    clock.resume();
    syncTick();
    snap([a, c], 400);
    render();
    animateUndo(a, m, c);
    kit.sfx('move');
    persist();
  }

  /** Về thế đầu: vẫn là ván này (không tính bỏ ván, không phải trợ giúp). */
  function restartBoard() {
    if (!game || !game.history.length || E.isWon(game) || kit.modal.current()) return;
    clearTransient();
    game = E.restart(game);
    cursor = firstMovable();
    render();
    deal();
    kit.sfx('flip');
    persist();
    kit.toast(t('toast.restart'));
  }

  function finish() {
    clock.pause();
    syncTick();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const perfect = E.isPerfect(game);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (perfect) stats.perfect++;
    stats.best[m] = 1;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted: game.assisted });
    kit.sfx('win');
    kit.confetti();
    $('win-title').textContent = perfect ? t('win.perfect') : t('win.title');
    const moves = game.history.length;
    $('win-text').textContent = t('win.text', { n: moves, time: fmt(ms) });
    $('win-badge').hidden = !game.assisted;
    $('win-badge').textContent = t('win.assisted');
    // Cho người chơi kịp thấy quân cuối cùng rồi mới mở hộp thắng
    endTimer = setTimeout(() => {
      if (game && E.isWon(game)) kit.modal.open('modal-win');
    }, calm() ? 0 : 750);
  }

  /** Hết nước nhảy: dừng đồng hồ, báo số quân còn lại; ván chỉ kết thúc (thua) khi người chơi chọn Ván mới. */
  function stuck() {
    clock.pause();
    syncTick();
    persist();
    kit.sfx('lose');
    endTimer = setTimeout(openOver, calm() ? 0 : 650);
  }

  function openOver() {
    if (!game || !E.isStuck(game)) return;
    $('over-text').textContent = t('over.text', { n: E.pegCount(game) });
    kit.modal.open('modal-over');
  }

  /** Bỏ ván đang dở: tính thua, báo cổng. Ván kẹt thì ghi số quân còn lại vào kỷ lục ít quân nhất. */
  function abandon() {
    const m = mode();
    stats.played++;
    stats.streak = 0;
    if (E.isStuck(game)) {
      const n = E.pegCount(game);
      if (!(stats.best[m] <= n)) stats.best[m] = n;
    }
    saveStats();
    clock.pause();
    kit.sdk.end({ mode: m, won: false, timeMs: Math.round(clock.elapsed()), assisted: game.assisted });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'mode' ? t('confirm.board', { board: label(p.mode) }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'mode') switchMode(p.mode);
    else newBoard(mode());
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.closeAll();
      newBoard(mode());
    }
  }

  /** Đổi bàn: chia bàn mới trước, rồi lưu cài đặt (onSetting gặp bàn đã khớp nên không làm gì). */
  function switchMode(m) {
    newBoard(m);
    kit.settings.set({ board: m });
  }

  /** Yêu cầu đổi bàn (Cài đặt, hộp chọn bàn). Ván đang dở thì giữ cài đặt cũ và hỏi trước. */
  function requestMode(m) {
    if (MODES.indexOf(m) < 0 || !game) return;
    if (m === mode()) {
      kit.modal.close('modal-mode');
      // Vừa thắng mà chọn lại đúng bàn này: chia ván mới luôn
      if (E.isWon(game)) newBoard(m);
      return;
    }
    if (inPlay()) {
      kit.settings.set({ board: mode() });
      askConfirm({ kind: 'mode', mode: m });
    } else {
      kit.modal.closeAll();
      switchMode(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'board') requestMode(value);
  }

  /* ---------------- Gợi ý (bộ giải chạy trong Web Worker) ---------------- */

  let worker = null; // null = chưa tạo, false = không dùng được (chạy bộ giải ngay trên trang, hạn mức ngắn)
  let hintSeq = 0;
  let hintReq = null;
  const localSolvers = {};

  function ensureWorker() {
    if (worker !== null) return worker;
    try {
      worker = new Worker('worker.js?v=1.0.0');
      worker.onmessage = (e) => onHint(e.data || {});
      worker.onerror = () => {
        worker = false;
        if (hintReq) runLocal(hintReq);
      };
    } catch (e) {
      worker = false;
    }
    return worker;
  }

  /** Giải trước thế đầu của bàn trong worker để gợi ý đầu tiên trả lời ngay. */
  function warm(m) {
    const w = ensureWorker();
    if (w) w.postMessage({ type: 'warm', board: m });
  }

  function runLocal(req) {
    const s = localSolvers[req.board] || (localSolvers[req.board] = E.createSolver(req.board));
    const r = s.hint(req.pegs, { maxMs: 700, now: () => performance.now() });
    onHint({ id: req.id, status: r.status, move: r.move });
  }

  function requestHint() {
    if (!game || E.isWon(game) || hintReq || kit.modal.current()) return;
    const req = { id: ++hintSeq, board: game.board, pegs: game.pegs.slice() };
    hintReq = req;
    render();
    setTimeout(() => { if (hintReq === req) kit.toast(t('hint.thinking'), 3000); }, 350);
    const w = ensureWorker();
    if (w) w.postMessage({ type: 'hint', id: req.id, board: req.board, pegs: req.pegs, maxMs: 2000 });
    else setTimeout(() => { if (hintReq === req) runLocal(req); }, 30);
  }

  function onHint(d) {
    const req = hintReq;
    if (!req || d.id !== req.id) return;
    hintReq = null;
    $('toast').hidden = true; // ẩn thông báo "đang tìm…"
    // Bàn đã đổi trong lúc chờ (đi nước khác, đi lại, ván mới) thì bỏ kết quả
    if (!game || game.board !== req.board || game.pegs.join('') !== req.pegs.join('')) return render();
    if (d.status === 'solved' && B.jumps[d.move]) {
      const first = !game.assisted;
      game = E.markAssisted(game);
      hintMove = d.move;
      selected = B.jumps[d.move][0];
      cursor = selected;
      kit.sfx('pop');
      if (first) kit.toast(t('hint.assisted'), 2600);
      persist();
    } else if (d.status === 'dead') {
      game = E.markAssisted(game);
      kit.sfx('error');
      kit.toast(t('hint.dead'), 2800);
      persist();
    } else {
      kit.toast(t('hint.unknown'), 2800);
    }
    render();
  }

  /* ---------------- Chạm / kéo ---------------- */

  /** Chạm (hoặc Enter) vào lỗ i. wasSel: quân này đã được chọn trước khi chạm (chạm lại thì bỏ chọn). */
  function tapHole(i, wasSel) {
    if (!game || E.isWon(game)) return;
    if (selected >= 0 && !game.pegs[i]) {
      const k = E.findJump(game, selected, i);
      if (k >= 0) return doJump(k);
    }
    cursor = i;
    if (game.pegs[i]) {
      if (wasSel) {
        selected = -1;
        hintMove = -1;
      } else if (!E.targets(game, i).length) {
        selected = -1;
        replay(holes[i], 'shake');
        kit.sfx('error');
      } else {
        if (hintMove >= 0 && B.jumps[hintMove][0] !== i) hintMove = -1;
        selected = i;
        kit.sfx('tap');
      }
    } else {
      selected = -1;
    }
    render();
  }

  /** Lỗ đích hợp lệ của quân đang chọn gần điểm (x, y) nhất (trong bán kính ~0.7 ô), hoặc -1. */
  function targetAt(x, y) {
    if (selected < 0) return -1;
    const unit = $('board').getBoundingClientRect().width / B.span;
    let best = -1;
    let bd = unit * 0.7;
    E.targets(game, selected).forEach((i) => {
      const c = centre(i);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  const board = $('board');
  board.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !game || kit.modal.current() || drag) return;
    const hole = e.target.closest('.hole');
    if (!hole) return;
    const i = Number(hole.dataset.i);
    drag = { i, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, wasSel: selected === i, over: -1 };
    // Nhấn vào quân nhảy được: chọn ngay để thấy lỗ đích trong lúc kéo
    if (game.pegs[i] && !E.isWon(game) && selected !== i && E.targets(game, i).length) {
      if (hintMove >= 0 && B.jumps[hintMove][0] !== i) hintMove = -1;
      selected = i;
      cursor = i;
      render();
    }
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || selected !== drag.i || !game.pegs[drag.i]) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      holes[drag.i].classList.add('dragging');
    }
    pegEls[drag.i].style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.15)';
    const over = targetAt(e.clientX, e.clientY);
    if (over !== drag.over) {
      if (drag.over >= 0) holes[drag.over].classList.remove('drop');
      if (over >= 0) holes[over].classList.add('drop');
      drag.over = over;
    }
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.over >= 0) holes[d.over].classList.remove('drop');
    if (!d.moved) {
      if (!cancelled) tapHole(d.i, d.wasSel);
      return;
    }
    const peg = pegEls[d.i];
    const from = peg.style.transform;
    peg.style.transform = '';
    holes[d.i].classList.remove('dragging');
    const to = cancelled ? -1 : targetAt(e.clientX, e.clientY);
    const k = to >= 0 ? E.findJump(game, d.i, to) : -1;
    if (k >= 0) {
      doJump(k, { x: e.clientX, y: e.clientY });
    } else if (!calm()) {
      // Thả ngoài lỗ hợp lệ: quân trượt về chỗ cũ, vẫn được chọn
      peg.animate([{ transform: from }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    }
  }
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));
  // Kéo trên bàn không được cuộn / chọn chữ
  board.addEventListener('dragstart', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */

  /** Lỗ kế tiếp theo hướng (dx, dy) trên hình học bàn: gần nhất theo hướng đó, ưu tiên thẳng hàng. */
  function nextHole(i, dx, dy) {
    const h = B.holes[i];
    let best = i;
    let bs = Infinity;
    B.holes.forEach((o, j) => {
      const vx = o.x - h.x;
      const vy = o.y - h.y;
      const along = vx * dx + vy * dy;
      if (along < 0.3) return;
      const score = along + Math.abs(vx * dy - vy * dx) * 2;
      if (score < bs - 1e-9) {
        bs = score;
        best = j;
      }
    });
    return best;
  }

  const ARROWS = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] };
  document.addEventListener('keydown', (e) => {
    if (!game) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.altKey && !kit.modal.current()) {
      e.preventDefault();
      return undoMove();
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // Hộp "hết nước": Z vẫn đi lại được
    if (kit.modal.current()) {
      if (k === 'z' && kit.modal.current().id === 'modal-over') {
        e.preventDefault();
        undoMove();
      }
      return;
    }
    const onHole = !!(e.target.closest && e.target.closest('.hole'));
    const onOtherButton = !onHole && e.target.closest && e.target.closest('button, input, a[href]');
    if (ARROWS[k]) {
      cursor = nextHole(cursor, ARROWS[k][0], ARROWS[k][1]);
      render();
      holes[cursor].focus();
    } else if (k === ' ' || k === 'enter') {
      // Nút khác đang focus (Đi lại, Gợi ý…) thì để trình duyệt bấm nút đó
      if (onOtherButton) return;
      if (!onHole) holes[cursor].focus();
      tapHole(cursor, selected === cursor);
    } else if (k === 'z' || k === 'u' || k === 'backspace') undoMove();
    else if (k === 'h') requestHint();
    else if (k === 'r') restartBoard();
    else if (k === 'n') requestNew();
    else if (k === 'escape' && (selected >= 0 || hintMove >= 0)) {
      selected = -1;
      hintMove = -1;
      render();
    } else return;
    e.preventDefault();
  });
  // Space trên nút lỗ: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  board.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

  /* ---------------- Nút ---------------- */

  $('btn-undo').addEventListener('click', undoMove);
  $('btn-restart').addEventListener('click', restartBoard);
  $('btn-hint').addEventListener('click', requestHint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-over-undo').addEventListener('click', undoMove);
  $('btn-over-new').addEventListener('click', () => {
    kit.modal.close('modal-over');
    if (inPlay()) abandon();
    newBoard(mode());
  });
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(mode());
  });
  $('btn-win-board').addEventListener('click', () => {
    kit.modal.close('modal-win');
    kit.modal.open('modal-mode');
    renderModeList();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-perfect').textContent = kit.i18n.fmtNumber(stats.perfect);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    const best = $('stats-best');
    best.textContent = '';
    MODES.forEach((m) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label(m);
      dd.textContent = Number.isInteger(stats.best[m]) ? kit.i18n.fmtNumber(stats.best[m]) : '–';
      div.append(dt, dd);
      best.appendChild(div);
    });
  });

  /** Hộp chọn bàn: hình thu nhỏ của từng bàn (chấm = lỗ), tên và mô tả ngắn. */
  function renderModeList() {
    const list = $('mode-list');
    list.textContent = '';
    MODES.forEach((m) => {
      const b = E.board(m);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-option';
      btn.dataset.mode = m;
      btn.setAttribute('aria-pressed', String(!!game && mode() === m));
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + b.span + ' ' + b.span);
      svg.setAttribute('class', 'mode-mini');
      svg.setAttribute('aria-hidden', 'true');
      b.holes.forEach((h, i) => {
        const dot = document.createElementNS(SVG, 'circle');
        dot.setAttribute('cx', h.x);
        dot.setAttribute('cy', h.y);
        dot.setAttribute('r', 0.34);
        if (i === b.start) dot.setAttribute('class', 'empty');
        svg.appendChild(dot);
      });
      const text = document.createElement('span');
      text.className = 'mode-text';
      const name = document.createElement('b');
      name.textContent = label(m);
      const desc = document.createElement('small');
      desc.textContent = t('mode.' + m + 'Desc');
      text.append(name, desc);
      btn.append(svg, text);
      btn.addEventListener('click', () => requestMode(m));
      list.appendChild(btn);
    });
  }
  $('btn-mode').addEventListener('click', renderModeList);

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && game) syncTick(); });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */

  /** Cài đặt bàn đi theo ván đang có (ghi thẳng, không qua onSetting). */
  function syncModeSetting() {
    if (kit.settings.get().board === mode()) return;
    kit.settings.get().board = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.made > 0 && !E.isWon(restored)) {
    game = restored;
    buildBoard();
    cursor = firstMovable();
    syncModeSetting();
    clock.set(Number.isFinite(saved.elapsed) && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(mode(), true);
    render();
    syncTick();
    writeSummary();
    warm(mode());
    if (E.isStuck(game)) openOver();
    else kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().board;
    newBoard(MODES.indexOf(m) >= 0 ? m : 'english');
    syncModeSetting();
  }
})();
