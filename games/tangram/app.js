/* =====================================================================
 * Tangram - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bàn là một SVG theo đơn vị lưới của engine: hình bóng ở giữa ô [-3.6, 3.6]², khay mảnh ở dưới (màn dọc)
 *     hoặc bên phải (màn ngang); đổi bố cục khi khung chơi đổi tỉ lệ (mảnh trong khay chuyển sang khay mới)
 *   - Kéo mảnh để di chuyển (thả là hít vào chỗ chính xác), chạm mảnh đang chọn để xoay 45°, nút / phím F lật hình bình hành
 *   - Gợi ý đặt đúng một mảnh và khóa lại; ván có dùng gợi ý báo assisted: true
 *   - Một lần xếp một màn = một ván (metric wins, mode classic)
 *   Luật báo ván cho cổng:
 *   - Mở màn: kit.sdk.start(MODE); mở lại màn đang xếp dở: kit.sdk.start(MODE, true)
 *   - Thắng: kit.sdk.end({ mode, won: true, timeMs, assisted: số gợi ý > 0 })
 *   - Bỏ màn đã di chuyển ít nhất một mảnh: kit.sdk.end({ mode, won: false, ... }); chưa đụng mảnh nào thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const G = E.geo;
  const MODE = 'classic';
  const NS = 'http://www.w3.org/2000/svg';
  const CATS = ['animal', 'people', 'object', 'letter', 'number'];
  const TOTAL = E.PUZZLES.length;

  const kit = PNKit.init({ gameId: 'tangram', version: '1.0.1', dict: window.GAME_DICT, defaults: { grid: true }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const stage = $('stage');
  const board = $('board');
  const targetG = $('target');
  const piecesG = $('pieces');

  let layout = 'portrait';
  let game = null;
  let sel = -1; // mảnh đang chọn
  let order = E.TYPES.map((x, i) => i); // thứ tự vẽ: mảnh chạm sau cùng nằm trên
  let drag = null; // { id, i, x0, y0, sx, sy, moved, wasSel }
  let pendingId = null; // màn chờ mở sau khi xác nhận bỏ màn đang xếp
  let winTimer = 0;
  const stats = readStats();

  function readStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const solved = {};
    if (raw.solved && typeof raw.solved === 'object') {
      Object.keys(raw.solved).forEach((id) => {
        if (E.byId(id) && (raw.solved[id] === 1 || raw.solved[id] === 2)) solved[id] = raw.solved[id];
      });
    }
    return { played: int(raw.played), won: int(raw.won), clean: int(raw.clean), solved, last: E.byId(raw.last) ? raw.last : null };
  }

  /** m:ss */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  const nameOf = (id) => t('pz.' + id);
  const indexOf = (id) => E.PUZZLES.findIndex((p) => p.id === id);
  const solvedCount = () => Object.keys(stats.solved).length;
  const won = () => !!game && E.isWon(game);
  const inProgress = () => !!game && game.moves > 0 && !won();
  const canPlay = () => !!game && !won() && !kit.modal.current();
  const announce = (msg) => { $('live').textContent = msg; };
  const pieceName = (i) => t('piece.' + E.TYPES[i]);

  /* ---------------- Vẽ bàn ---------------- */
  const pts = (poly) => E.toFloat(poly).map(([x, y]) => x.toFixed(4) + ',' + y.toFixed(4)).join(' ');
  function svg(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  const tray = svg('rect', { class: 'tray', rx: '0.3' });
  board.insertBefore(tray, $('grid'));
  const pieceEls = E.TYPES.map((type, i) => {
    const g = svg('g', { class: 'piece p' + i, 'data-i': i });
    g.appendChild(svg('polygon', { class: 'piece-shape' }));
    piecesG.appendChild(g);
    return g;
  });

  function renderTarget() {
    targetG.textContent = '';
    E.byId(game.id).target.forEach((poly) => targetG.appendChild(svg('polygon', { class: 'sil', points: pts(poly) })));
  }

  function applyLayout() {
    const v = E.VIEW[layout];
    board.setAttribute('viewBox', [v.x, v.y, v.w, v.h].join(' '));
    // khay: phần khung nhìn ngoài ô hình bóng
    const r = layout === 'portrait'
      ? { x: v.x + 0.05, y: E.BOX + 0.2, w: v.w - 0.1, h: v.y + v.h - E.BOX - 0.25 }
      : { x: E.BOX + 0.2, y: v.y + 0.05, w: v.x + v.w - E.BOX - 0.25, h: v.h - 0.1 };
    tray.setAttribute('x', r.x);
    tray.setAttribute('y', r.y);
    tray.setAttribute('width', r.w);
    tray.setAttribute('height', r.h);
  }

  function renderPieces() {
    const correct = won();
    order.forEach((i) => piecesG.appendChild(pieceEls[i]));
    pieceEls.forEach((el, i) => {
      el.firstChild.setAttribute('points', pts(E.polyOf(game, i)));
      el.classList.toggle('sel', i === sel && !correct);
      el.classList.toggle('locked', game.locked[i]);
    });
    board.classList.toggle('won', correct);
  }

  /* ---------------- Vẽ số liệu ---------------- */
  let raf = 0;
  function tick() {
    $('time').textContent = fmt(clock.elapsed());
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(tick);
  }

  function render() {
    const n = indexOf(game.id) + 1;
    $('puzzle-num').textContent = t('hud.puzzle', { n });
    $('puzzle-name').textContent = nameOf(game.id);
    $('solved').textContent = solvedCount() + '/' + TOTAL;
    const lockedSel = sel >= 0 && game.locked[sel];
    $('btn-rotate').disabled = won() || sel < 0 || lockedSel;
    $('btn-flip').disabled = won() || game.locked[6];
    $('btn-hint').disabled = won();
    $('btn-reset').disabled = won();
    renderPieces();
    tick();
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const n = solvedCount();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: n ? t('summary.note', { n, total: TOTAL }) : t('summary.none'),
      stats: [{ value: n + '/' + TOTAL, label: t('summary.solved') }],
      resume: inProgress()
        ? { title: t('app.name'), detail: t('summary.resume', { name: nameOf(game.id), n: E.correctCount(game) }), pct: Math.max(0.05, E.correctCount(game) / 7) }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Hiệu ứng ---------------- */
  /** Chạy mảnh i từ biến đổi `from` về chỗ thật (tắt khi giảm chuyển động). */
  function animateFrom(i, from, origin) {
    const el = pieceEls[i];
    el.classList.remove('anim');
    el.style.transformOrigin = origin || '';
    el.style.transform = from;
    if (reduceMotion.matches) {
      el.style.transform = '';
      return;
    }
    void el.getBoundingClientRect();
    el.classList.add('anim');
    el.style.transform = '';
    clearTimeout(el._fx);
    el._fx = setTimeout(() => {
      el.classList.remove('anim');
      el.style.transformOrigin = '';
    }, 260);
  }
  const anchor = (i) => [G.fx(game.pieces[i].p), G.fy(game.pieces[i].p)];
  const centerPx = (i) => E.centroid(E.polyOf(game, i)).map((v) => v.toFixed(3) + 'px').join(' ');

  /* ---------------- Luồng ván ---------------- */
  function select(i) {
    sel = i;
    if (i >= 0) {
      order = order.filter((k) => k !== i).concat(i);
      announce(t('live.pick', { piece: pieceName(i) }));
    }
    render();
  }

  /** Nhận trạng thái mới sau một nước; đồng hồ chạy từ nước đầu tiên. Trả về true nếu có thay đổi. */
  function apply(next, sound) {
    if (next === game) {
      renderPieces();
      return false;
    }
    if (game.moves === 0) {
      clock.reset();
      clock.start();
    } else clock.resume();
    game = next;
    kit.sfx(sound);
    if (won()) finish();
    else persist();
    render();
    return true;
  }

  function startPuzzle(id) {
    clearTimeout(winTimer);
    game = E.newGame(id, layout);
    sel = -1;
    order = E.TYPES.map((x, i) => i);
    clock.reset();
    stats.last = game.id;
    saveStats();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    renderTarget();
    render();
    writeSummary();
  }

  /** Bỏ màn đang xếp dở (đã di chuyển ít nhất một mảnh): tính là thua và báo cổng. */
  function abandon() {
    if (!inProgress()) return;
    clock.pause();
    stats.played++;
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
    kit.store.remove(keys.save);
  }

  /** Màn kế tiếp: màn chưa giải đầu tiên sau màn hiện tại (vòng lại đầu), hết thì màn liền sau. */
  function nextId() {
    const k = indexOf(game.id);
    for (let d = 1; d <= TOTAL; d++) {
      const p = E.PUZZLES[(k + d) % TOTAL];
      if (!stats.solved[p.id]) return p.id;
    }
    return E.PUZZLES[(k + 1) % TOTAL].id;
  }

  /** Mở màn `id`; đang xếp dở màn khác thì hỏi trước vì bỏ màn tính là thua. */
  function choose(id) {
    if (!E.byId(id)) return;
    if (id === game.id && !won()) {
      kit.modal.closeAll();
      return;
    }
    if (inProgress()) {
      pendingId = id;
      kit.modal.open('modal-confirm');
      return;
    }
    kit.modal.closeAll();
    startPuzzle(id);
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const hinted = game.hints > 0;
    stats.played++;
    stats.won++;
    if (!hinted) stats.clean++;
    stats.solved[game.id] = stats.solved[game.id] === 1 || !hinted ? 1 : 2;
    saveStats();
    kit.store.remove(keys.save);
    writeSummary();
    kit.sdk.end({ mode: MODE, won: true, timeMs: ms, assisted: hinted });
    kit.sfx('win');
    kit.confetti();
    sel = -1;
    announce(t('live.won', { name: nameOf(game.id) }));

    $('win-name').textContent = nameOf(game.id);
    $('win-time').textContent = fmt(ms);
    const note = hinted ? t('win.hinted', { n: game.hints }) : t('win.clean');
    $('win-note').textContent = solvedCount() === TOTAL ? note + ' ' + t('win.all', { n: TOTAL }) : note;
    const fig = $('win-figure');
    fig.textContent = '';
    const all = [].concat(...E.polys(game).map(E.toFloat));
    const xs = all.map((q) => q[0]);
    const ys = all.map((q) => q[1]);
    const x0 = Math.min(...xs) - 0.2;
    const y0 = Math.min(...ys) - 0.2;
    fig.setAttribute('viewBox', [x0, y0, Math.max(...xs) + 0.2 - x0, Math.max(...ys) + 0.2 - y0].map((v) => v.toFixed(3)).join(' '));
    E.polys(game).forEach((poly, i) => fig.appendChild(svg('polygon', { class: 'piece-shape p' + i, points: pts(poly) })));
    clearTimeout(winTimer);
    winTimer = setTimeout(() => {
      if (won() && !kit.modal.current()) kit.modal.open('modal-win');
    }, reduceMotion.matches ? 0 : 700);
  }

  function rotateSel(dir) {
    if (!canPlay() || sel < 0) return;
    if (game.locked[sel]) {
      kit.toast(t('toast.locked'));
      kit.sfx('error');
      return;
    }
    const i = sel;
    if (apply(E.rotate(game, i, dir, layout), 'flip')) animateFrom(i, 'rotate(' + (dir < 0 ? 45 : -45) + 'deg)', centerPx(i));
  }

  function flipP() {
    if (!canPlay()) return;
    if (sel !== 6) select(6);
    if (game.locked[6]) {
      kit.toast(t('toast.locked'));
      kit.sfx('error');
      return;
    }
    if (apply(E.flip(game, 6, layout), 'flip')) animateFrom(6, 'scaleX(-1)', centerPx(6));
  }

  function hint() {
    if (!canPlay()) return;
    const h = E.hint(game, layout);
    if (!h) return;
    const before = anchor(h.piece);
    sel = h.piece;
    order = order.filter((k) => k !== h.piece).concat(h.piece);
    apply(h.game, 'pop');
    const after = anchor(h.piece);
    animateFrom(h.piece, 'translate(' + (before[0] - after[0]).toFixed(3) + 'px,' + (before[1] - after[1]).toFixed(3) + 'px)');
  }

  function resetPieces() {
    if (!canPlay()) return;
    sel = -1;
    apply(E.reset(game, layout), 'clear');
  }

  /** Di chuyển mảnh đang chọn bằng phím mũi tên (nửa ô mỗi lần, rồi hít như khi thả). */
  function nudge(dx, dy) {
    if (!canPlay()) return;
    if (sel < 0) {
      select(order[order.length - 1]);
      return;
    }
    if (game.locked[sel]) {
      kit.toast(t('toast.locked'));
      return;
    }
    const [x, y] = anchor(sel);
    if (apply(E.drop(game, sel, x + dx * 0.5, y + dy * 0.5, layout), 'move')) announce(t('live.moved', { piece: pieceName(sel) }));
  }

  /* ---------------- Bố cục theo khung chơi ---------------- */
  function layoutFor() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    return w && h && w / h > 1.05 ? 'landscape' : 'portrait';
  }
  function onResize() {
    const next = layoutFor();
    if (next === layout) return;
    layout = next;
    applyLayout();
    if (game) {
      game = E.relayout(game, layout);
      if (inProgress()) persist();
      render();
    }
  }

  /* ---------------- Kéo / chạm (pointer events) ---------------- */
  function svgPoint(e) {
    const m = board.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  board.addEventListener('pointerdown', (e) => {
    if (drag || !game || kit.modal.current()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (won()) {
      kit.modal.open('modal-win');
      return;
    }
    const el = e.target.closest && e.target.closest('.piece');
    if (!el) {
      if (sel >= 0) select(-1);
      return;
    }
    const i = Number(el.dataset.i);
    const wasSel = sel === i;
    if (!wasSel) {
      select(i);
      kit.sfx('tap');
    }
    const [x, y] = svgPoint(e);
    drag = { id: e.pointerId, i, x0: x, y0: y, sx: e.clientX, sy: e.clientY, moved: false, wasSel };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    e.preventDefault();
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    if (game.locked[drag.i]) {
      if (!drag.moved) {
        kit.toast(t('toast.locked'));
        kit.sfx('error');
      }
      drag.moved = true;
      return;
    }
    drag.moved = true;
    const [x, y] = svgPoint(e);
    const el = pieceEls[drag.i];
    el.classList.add('dragging');
    el.style.transform = 'translate(' + (x - drag.x0).toFixed(3) + 'px,' + (y - drag.y0).toFixed(3) + 'px)';
  });

  function endDrag(e, cancelled) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    const el = pieceEls[d.i];
    el.classList.remove('dragging');
    if (d.moved && !game.locked[d.i]) {
      const [x, y] = svgPoint(e);
      const dx = x - d.x0;
      const dy = y - d.y0;
      el.style.transform = '';
      if (cancelled || !canPlay()) {
        renderPieces();
        return;
      }
      const a = anchor(d.i);
      if (apply(E.drop(game, d.i, a[0] + dx, a[1] + dy, layout), 'place')) {
        const b = anchor(d.i);
        animateFrom(d.i, 'translate(' + (a[0] + dx - b[0]).toFixed(3) + 'px,' + (a[1] + dy - b[1]).toFixed(3) + 'px)');
        announce(t('live.moved', { piece: pieceName(d.i) }));
      }
    } else if (!d.moved && !cancelled) {
      if (game.locked[d.i]) {
        kit.toast(t('toast.locked'));
      } else if (d.wasSel) rotateSel(1);
    }
  }
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* ---------------- Chọn màn ---------------- */
  let levelsBuilt = false;
  function buildLevels() {
    const root = $('levels');
    root.textContent = '';
    CATS.forEach((cat) => {
      const head = document.createElement('h3');
      head.className = 'levels-cat';
      head.textContent = t('cat.' + cat);
      root.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'levels-grid';
      E.PUZZLES.filter((p) => p.cat === cat).forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'level';
        b.dataset.id = p.id;
        const fig = svg('svg', { viewBox: '-3.7 -3.7 7.4 7.4', 'aria-hidden': 'true', class: 'level-fig' });
        p.target.forEach((poly) => fig.appendChild(svg('polygon', { points: pts(poly) })));
        const name = document.createElement('span');
        name.className = 'level-name';
        name.textContent = nameOf(p.id);
        const mark = document.createElement('span');
        mark.className = 'level-mark';
        mark.setAttribute('aria-hidden', 'true');
        b.append(fig, name, mark);
        b.addEventListener('click', () => choose(p.id));
        grid.appendChild(b);
      });
      root.appendChild(grid);
    });
    levelsBuilt = true;
  }
  function openLevels() {
    if (!levelsBuilt) buildLevels();
    document.querySelectorAll('.level').forEach((b) => {
      const id = b.dataset.id;
      const s = stats.solved[id];
      b.classList.toggle('solved', !!s);
      b.classList.toggle('hinted', s === 2);
      b.classList.toggle('current', id === game.id);
      if (id === game.id) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
      b.setAttribute('aria-label', nameOf(id) + (s ? ', ' + t(s === 2 ? 'levels.hinted' : 'levels.solved') : '') + (id === game.id ? ', ' + t('levels.current') : ''));
    });
    $('levels-count').textContent = t('levels.count', { n: solvedCount(), total: TOTAL });
    kit.modal.open('modal-levels');
    const cur = document.querySelector('.level.current');
    if (cur) {
      cur.scrollIntoView({ block: 'center' });
      cur.focus();
    }
  }

  function onSetting(key, value) {
    if (key === 'grid') board.classList.toggle('no-grid', !value);
  }

  /* ---------------- Nút, phím ---------------- */
  $('btn-levels').addEventListener('click', openLevels);
  $('hud-puzzle').addEventListener('click', openLevels);
  $('btn-win-levels').addEventListener('click', () => {
    kit.modal.close('modal-win');
    openLevels();
  });
  $('btn-next').addEventListener('click', () => {
    kit.modal.close('modal-win');
    startPuzzle(nextId());
  });
  $('btn-confirm').addEventListener('click', () => {
    kit.modal.close('modal-confirm');
    const id = pendingId;
    pendingId = null;
    abandon();
    kit.modal.closeAll();
    startPuzzle(id || nextId());
  });
  $('btn-rotate').addEventListener('click', () => rotateSel(1));
  $('btn-flip').addEventListener('click', flipP);
  $('btn-hint').addEventListener('click', hint);
  $('btn-reset').addEventListener('click', resetPieces);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-solved').textContent = solvedCount() + '/' + TOTAL;
    $('stats-clean').textContent = kit.i18n.fmtNumber(Object.keys(stats.solved).filter((id) => stats.solved[id] === 1).length);
  });

  board.setAttribute('tabindex', '0');
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k >= '1' && k <= '7') {
      if (canPlay()) select(Number(k) - 1);
    } else if (k === 'Tab' && document.activeElement === board && canPlay()) {
      // Tab trong bàn: lần lượt chọn 7 mảnh; hết vòng thì để Tab đi tiếp như thường
      const next = sel + (e.shiftKey ? -1 : 1);
      if (next < 0 || next > 6) {
        select(-1);
        return;
      }
      select(sel < 0 && e.shiftKey ? 6 : next);
    } else if (k === 'ArrowLeft') nudge(-1, 0);
    else if (k === 'ArrowRight') nudge(1, 0);
    else if (k === 'ArrowUp') nudge(0, -1);
    else if (k === 'ArrowDown') nudge(0, 1);
    else if (k === 'r' || ((k === ' ' || k === 'Enter') && document.activeElement === board)) rotateSel(e.shiftKey ? -1 : 1);
    else if (k === 'f') flipP();
    else if (k === 'h') hint();
    else if (k === 'x') resetPieces();
    else if (k === 'p') openLevels();
    else if (k === 'n') {
      if (won()) startPuzzle(nextId());
      else choose(nextId());
    } else if (k === 'Escape') {
      if (sel < 0) return;
      select(-1);
    } else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  /* ---------------- Khởi động: mở lại màn đang xếp dở nếu có ---------------- */
  onSetting('grid', kit.settings.get().grid !== false);
  layout = layoutFor();
  applyLayout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = E.relayout(restored, layout);
    clock.set(saved.elapsed);
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    renderTarget();
    render();
    writeSummary();
  } else {
    const last = stats.last && !stats.solved[stats.last] ? stats.last : null;
    let first = last;
    if (!first) first = (E.PUZZLES.find((p) => !stats.solved[p.id]) || E.PUZZLES[0]).id;
    startPuzzle(first);
  }
})();
