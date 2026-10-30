/* =====================================================================
 * Vòng Kín - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = mức ('s' Dễ 5×5 | 'm' Vừa 7×7 | 'l' Khó 10×10), metric time_low
 *   - Bàn vẽ bằng SVG (đơn vị = một ô); chạm / kéo tính theo tọa độ lưới, không cần phần tử bấm cho từng cạnh
 *   - Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại / ẩn tab; ván có gợi ý gửi assisted: true, không tính kỷ lục
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - giải xong: kit.sdk.end({ mode, won: true, timeMs, assisted })
 *     - bỏ đề (đề mới / đổi mức) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['s', 'm', 'l'];
  const kit = PNKit.init({
    gameId: 'vongkin',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { mode: 's', errors: 'auto', guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const SVG = 'http://www.w3.org/2000/svg';
  const U = 100; // một ô = 100 đơn vị SVG (cỡ chữ / nét tính theo đơn vị này, tránh cỡ chữ tối thiểu của trình duyệt)
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const sizeOf = (m) => E.MODES[m].n + '×' + E.MODES[m].n;
  const levelOf = (m) => t('mode.' + m);
  const nextMode = (m) => MODES[(MODES.indexOf(m) + 1) % MODES.length];

  const defaults = { played: 0, won: 0, streak: 0, best: { s: null, m: null, l: null } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, defaults.best, stats.best || {});
  MODES.forEach((m) => { if (!(Number.isFinite(stats.best[m]) && stats.best[m] > 0)) stats.best[m] = null; });

  let game = null;
  let view = null; // kết quả E.analyze(game) của lần vẽ gần nhất
  let cursor = { r: 0, c: 0 }; // con trỏ bàn phím, nằm trên một điểm
  let crossArmed = false; // X: mũi tên tiếp theo đánh dấu × thay vì di chuyển
  let xHeld = false;
  let xUsed = false;
  let stroke = null; // nét kéo / chạm đang diễn ra
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'mode', mode }
  let winTimer = 0;
  let els = null;

  const mode = () => game.mode;
  const solved = () => !!game && E.isSolved(game);
  /** Đề đang dở: đã đi ít nhất một nước và chưa giải (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !solved();
  const errorsOn = () => {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && game.mode === 's');
  };

  /** m:ss (hoặc h:mm:ss). */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* ---------------- Dựng bàn SVG ---------------- */

  function el(name, attrs, parent) {
    const x = document.createElementNS(SVG, name);
    Object.keys(attrs).forEach((k) => x.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(x);
    return x;
  }

  /** Dựng lại toàn bộ bàn khi đổi đề (số ô, số, cạnh, dấu ×, điểm, con trỏ). */
  function buildBoard() {
    const n = game.n;
    const G = E.geom(n);
    const board = $('board');
    board.textContent = '';
    board.setAttribute('viewBox', [-U / 2, -U / 2, (n + 1) * U, (n + 1) * U].join(' '));
    board.style.setProperty('--n', n);
    board.dataset.n = n;
    const gCells = el('g', { class: 'cells' }, board);
    const gClues = el('g', { class: 'clues' }, board);
    const gEdges = el('g', { class: 'edges' }, board);
    const gMarks = el('g', { class: 'marks' }, board);
    const gDots = el('g', { class: 'dots' }, board);
    els = { cells: [], clues: [], edges: [], marks: [], dots: [] };
    for (let c = 0; c < G.C; c++) {
      const r = Math.floor(c / n);
      const col = c % n;
      const rect = el('rect', { x: col * U, y: r * U, width: U, height: U, class: 'cell' }, gCells);
      rect.style.setProperty('--d', r + col);
      els.cells.push(rect);
      if (game.clues[c] >= 0) {
        const tx = el('text', { x: (col + 0.5) * U, y: (r + 0.5) * U, dy: '0.35em', class: 'clue' }, gClues);
        tx.style.setProperty('--d', r + col);
        tx.textContent = game.clues[c];
        els.clues[c] = tx;
      }
    }
    const k = 11; // nửa cỡ dấu ×
    for (let e = 0; e < G.E; e++) {
      const a = G.ea[e];
      const b = G.eb[e];
      const x1 = (a % (n + 1)) * U;
      const y1 = Math.floor(a / (n + 1)) * U;
      const x2 = (b % (n + 1)) * U;
      const y2 = Math.floor(b / (n + 1)) * U;
      els.edges.push(el('line', { x1, y1, x2, y2, class: 'edge', 'data-e': e }, gEdges));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      els.marks.push(el('path', { d: `M${mx - k} ${my - k}L${mx + k} ${my + k}M${mx + k} ${my - k}L${mx - k} ${my + k}`, class: 'mark' }, gMarks));
    }
    for (let v = 0; v < G.V; v++) els.dots.push(el('circle', { cx: (v % (n + 1)) * U, cy: Math.floor(v / (n + 1)) * U, r: 8, class: 'dot' }, gDots));
    els.cursor = el('circle', { r: 24, class: 'cursor' }, board);
    cursor = { r: Math.floor(n / 2), c: Math.floor(n / 2) };
  }

  /** Ô nằm trong vòng (chỉ dùng khi đã giải): quét từng hàng, đổi phía mỗi khi qua một cạnh dọc là đường. */
  function insideCells() {
    const n = game.n;
    const out = [];
    for (let r = 0; r < n; r++) {
      let inside = false;
      for (let c = 0; c < n; c++) {
        if (game.edges[E.vEdge(n, r, c)] === 1) inside = !inside;
        out.push(inside);
      }
    }
    return out;
  }

  function render() {
    if (!els || els.edges.length !== E.geom(game.n).E) buildBoard();
    view = E.analyze(game);
    const err = errorsOn();
    const bad = err && view.badLoop ? new Set(view.loopEdges) : null;
    const s = game.edges;
    for (let e = 0; e < s.length; e++) {
      const cls = s[e] === 1 ? (bad && bad.has(e) ? 'edge on bad' : 'edge on') : 'edge';
      if (els.edges[e].getAttribute('class') !== cls) els.edges[e].setAttribute('class', cls);
      const m = s[e] === 2 ? 'mark show' : 'mark';
      if (els.marks[e].getAttribute('class') !== m) els.marks[e].setAttribute('class', m);
    }
    els.clues.forEach((tx, c) => {
      if (!tx) return;
      const st = view.cell[c];
      const cls = 'clue' + (st === 'done' ? ' done' : '') + (err && (st === 'over' || st === 'short') ? ' err' : '');
      if (tx.getAttribute('class') !== cls) tx.setAttribute('class', cls);
    });
    els.dots.forEach((d, v) => {
      const st = view.vertex[v];
      const cls = 'dot' + (st === 'branch' || (err && st === 'dead') ? ' err' : '');
      if (d.getAttribute('class') !== cls) d.setAttribute('class', cls);
    });
    const win = view.solved;
    const inside = win ? insideCells() : null;
    els.cells.forEach((rect, c) => rect.setAttribute('class', inside && inside[c] ? 'cell in' : 'cell'));
    els.cursor.setAttribute('cx', cursor.c * U);
    els.cursor.setAttribute('cy', cursor.r * U);
    els.cursor.setAttribute('class', 'cursor' + (crossArmed ? ' x' : ''));

    const board = $('board');
    board.classList.toggle('solved', win);
    board.setAttribute('aria-label', win ? t('board.solved') : t('board.label', { size: sizeOf(game.mode), lines: view.lines }));
    $('level').textContent = levelOf(game.mode);
    $('best').textContent = stats.best[game.mode] == null ? '–' : fmt(stats.best[game.mode]);
    $('btn-undo').disabled = win || !game.undo.length;
    $('btn-redo').disabled = win || !game.redo.length;
    $('btn-hint').disabled = win;
    const badge = $('btn-mode');
    $('size').textContent = sizeOf(game.mode);
    badge.setAttribute('aria-label', t('mode.badge', { size: sizeOf(game.mode), level: levelOf(game.mode), next: levelOf(nextMode(game.mode)) }));
    badge.title = t('mode.name');
    renderTime();
  }

  function renderTime() {
    if (game) $('time').textContent = fmt(clock.elapsed());
  }
  setInterval(renderTime, 250);

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? game.mode : kit.settings.get().mode;
    const best = stats.best[m];
    const solLen = game ? Math.max(1, game.sol.reduce((a, b) => a + b, 0)) : 1;
    const lines = view ? view.lines : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { level: levelOf(m), time: fmt(best) }),
      stats: stats.won > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(best == null ? [] : [{ value: fmt(best), label: t('stats.best', { level: levelOf(m) }) }])
        : [],
      resume: inPlay()
        ? { title: t('app.name') + ' ' + sizeOf(m), detail: t('summary.resume', { level: levelOf(m), lines }), pct: Math.max(0, Math.min(0.95, lines / solLen)) }
        : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Đồng hồ: chạy khi đang giải, dừng khi mở hộp thoại ---------------- */

  function syncClock() {
    if (!game || solved() || kit.modal.current() || document.hidden) clock.pause();
    else clock.resume();
    renderTime();
  }
  const watcher = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  /* ---------------- Luồng ván ---------------- */

  function newBoard(m) {
    clearTimeout(winTimer);
    stroke = null;
    game = E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    els = null;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    deal();
    writeSummary();
    syncClock();
  }

  /** Đề mới: số hiện dần theo đường chéo. */
  function deal() {
    if (calm()) return;
    const board = $('board');
    board.classList.remove('deal');
    void board.getBoundingClientRect();
    board.classList.add('deal');
  }

  /** Đổi ván sang trạng thái mới (đã khác); kiểm thắng, lưu, vẽ lại. */
  function commit(next, sound) {
    if (next === game) return false;
    game = next;
    if (solved()) {
      render();
      finish();
      return true;
    }
    if (sound) kit.sfx(sound);
    render();
    persist();
    return true;
  }

  /** Âm thanh theo trạng thái mới của cạnh; tạo điểm rẽ nhánh thì báo lỗi. */
  function soundFor(to, e) {
    if (to === 1) {
      const G = E.geom(game.n);
      const deg = (v) => {
        let k = 0;
        for (let j = 0; j < G.vDeg[v]; j++) if (game.edges[G.vE[4 * v + j]] === 1) k++;
        return k;
      };
      return deg(G.ea[e]) >= 3 || deg(G.eb[e]) >= 3 ? 'error' : 'place';
    }
    return to === 2 ? 'tap' : 'pop';
  }

  function tapEdge(e, reverse) {
    if (e < 0 || !game || solved()) return;
    const next = E.cycle(game, e, reverse);
    if (next === game) return;
    const to = next.edges[e];
    game = next;
    if (solved()) {
      render();
      finish();
      return;
    }
    kit.sfx(soundFor(to, e));
    render();
    persist();
  }

  function finish() {
    stroke = null;
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const assisted = game.hints > 0;
    const best = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (best) stats.best[m] = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    render();
    $('win-time').textContent = fmt(ms);
    $('win-best').hidden = !best;
    $('win-hints').hidden = !assisted;
    $('win-hints').textContent = assisted ? t('win.hints', { n: game.hints }) : '';
    // Cho người chơi kịp thấy vòng sáng lên rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (solved()) kit.modal.open('modal-win');
    }, calm() ? 200 : 1100);
  }

  function doUndo() {
    if (!game || solved()) return;
    if (!game.undo.length) return kit.toast(t('toast.noUndo'));
    commit(E.undo(game), 'move');
  }
  function doRedo() {
    if (!game || solved()) return;
    commit(E.redo(game), 'move');
  }
  function doHint() {
    if (!game || solved() || kit.modal.current()) return;
    const first = game.hints === 0;
    const h = E.hint(game);
    if (!h) return;
    if (commit(E.useHint(game), h.to === 1 ? 'place' : 'tap')) {
      if (first) kit.toast(t('toast.hint'));
      flash(h.e);
    }
  }
  /** Nháy cạnh vừa được gợi ý. */
  function flash(e) {
    if (calm() || !els || !els.edges[e]) return;
    const x = els.edges[e];
    x.classList.remove('flash');
    void x.getBoundingClientRect();
    x.classList.add('flash');
    const m = els.marks[e];
    m.classList.remove('flash');
    void m.getBoundingClientRect();
    m.classList.add('flash');
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'mode' ? t('confirm.mode', { level: levelOf(p.mode) }) : t('btn.new');
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
      kit.modal.close('modal-win');
      newBoard(mode());
    }
  }

  /** Đổi mức: chia đề mới mức đó trước, rồi lưu cài đặt (onSetting gặp mức đã khớp nên không làm gì). */
  function switchMode(m) {
    newBoard(m);
    kit.settings.set({ mode: m });
  }

  /** Yêu cầu đổi mức (từ Cài đặt hoặc nhãn cỡ bàn). Đề đang dở thì giữ cài đặt cũ và hỏi trước. */
  function requestMode(m) {
    if (MODES.indexOf(m) < 0 || !game || m === mode()) return;
    if (inPlay()) {
      kit.settings.set({ mode: mode() });
      askConfirm({ kind: 'mode', mode: m });
    } else {
      switchMode(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'mode') requestMode(value);
    else if (key === 'errors' && game) render();
  }

  /* ---------------- Chạm / kéo trên bàn ---------------- */

  const board = $('board');

  /** Tọa độ con trỏ chuột / ngón tay theo đơn vị ô (x = cột, y = hàng). */
  function toGrid(ev) {
    const m = board.getScreenCTM();
    if (!m) return { x: -9, y: -9 };
    const p = board.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x / U, y: q.y / U };
  }

  /** Cạnh gần điểm (x, y) nhất trong bán kính 0,42 ô; -1 nếu không có (ví dụ chạm giữa ô). */
  function nearestEdge(x, y) {
    const n = game.n;
    let best = -1;
    let bd = 0.42;
    const hr = Math.round(y);
    const hc = Math.floor(x);
    if (hr >= 0 && hr <= n && hc >= 0 && hc < n && Math.abs(y - hr) < bd) {
      bd = Math.abs(y - hr);
      best = E.hEdge(n, hr, hc);
    }
    const vc = Math.round(x);
    const vr = Math.floor(y);
    if (vc >= 0 && vc <= n && vr >= 0 && vr < n && Math.abs(x - vc) < bd) best = E.vEdge(n, vr, vc);
    return best;
  }

  const vid = (r, c) => r * (game.n + 1) + c;

  /** Kéo qua một cạnh (từ điểm a sang điểm kề b): vẽ / xóa / đánh × theo kiểu của nét, lùi lại thì hoàn cạnh vừa đổi. */
  function strokeStep(a, b) {
    const e = E.edgeBetween(game.n, vid(a.r, a.c), vid(b.r, b.c));
    if (e < 0) return;
    const path = stroke.path;
    const last = path[path.length - 1];
    if (last && last.e === e) {
      path.pop();
      if (last.changed) stroke.changes.pop();
    } else {
      if (path.some((p) => p.e === e)) return;
      const cur = stroke.base.edges[e];
      if (!stroke.kind) stroke.kind = stroke.right ? (cur === 2 ? 'unmark' : 'mark') : cur === 1 ? 'erase' : 'draw';
      let to = -1;
      if (stroke.kind === 'draw') to = 1;
      else if (stroke.kind === 'erase' && cur === 1) to = 0;
      else if (stroke.kind === 'mark' && cur === 0) to = 2;
      else if (stroke.kind === 'unmark' && cur === 2) to = 0;
      const changed = to >= 0 && to !== cur;
      path.push({ e, changed });
      if (changed) stroke.changes.push([e, to]);
      if (changed) kit.sfx(to === 1 ? 'place' : 'tick');
    }
    const next = stroke.changes.length ? E.apply(stroke.base, stroke.changes) : stroke.base;
    game = next;
    if (solved()) {
      render();
      finish();
      return;
    }
    render();
  }

  board.addEventListener('pointerdown', (ev) => {
    if (!game || solved() || kit.modal.current() || stroke) return;
    if (ev.button !== 0 && ev.button !== 2) return;
    ev.preventDefault();
    board.classList.remove('kbd');
    try { board.setPointerCapture(ev.pointerId); } catch (e) { /* bỏ qua */ }
    const p = toGrid(ev);
    const n = game.n;
    stroke = {
      id: ev.pointerId,
      x0: ev.clientX,
      y0: ev.clientY,
      p0: p,
      right: ev.button === 2,
      dragging: false,
      at: { r: Math.max(0, Math.min(n, Math.round(p.y))), c: Math.max(0, Math.min(n, Math.round(p.x))) },
      base: game,
      changes: [],
      path: [],
      kind: null,
    };
  });

  board.addEventListener('pointermove', (ev) => {
    if (!stroke || ev.pointerId !== stroke.id) return;
    const p = toGrid(ev);
    const n = game.n;
    if (!stroke.dragging) {
      if (Math.hypot(ev.clientX - stroke.x0, ev.clientY - stroke.y0) < 8) return;
      stroke.dragging = true;
      // Bắt đầu kéo từ giữa một cạnh (xa điểm): coi như xuất phát từ đầu cạnh phía sau hướng kéo
      const p0 = stroke.p0;
      const e0 = nearestEdge(p0.x, p0.y);
      if (e0 >= 0 && Math.hypot(p0.x - Math.round(p0.x), p0.y - Math.round(p0.y)) > 0.3) {
        const G = E.geom(n);
        const ends = [G.ea[e0], G.eb[e0]].map((v) => ({ r: Math.floor(v / (n + 1)), c: v % (n + 1) }));
        const far = (q) => Math.hypot(q.c - p.x, q.r - p.y);
        stroke.at = far(ends[0]) >= far(ends[1]) ? ends[0] : ends[1];
      }
    }
    const r = Math.round(p.y);
    const c = Math.round(p.x);
    // Chỉ "bắt" điểm khi ngón tay tới đủ gần, đi chéo thì chờ tới điểm cùng hàng / cột
    if (r < 0 || c < 0 || r > n || c > n || Math.hypot(p.y - r, p.x - c) > 0.36) return;
    const at = stroke.at;
    if ((r === at.r && c === at.c) || (r !== at.r && c !== at.c)) return;
    const dr = Math.sign(r - at.r);
    const dc = Math.sign(c - at.c);
    while (stroke && (stroke.at.r !== r || stroke.at.c !== c)) {
      const from = stroke.at;
      const to = { r: from.r + dr, c: from.c + dc };
      stroke.at = to;
      strokeStep(from, to);
    }
  });

  function endStroke(ev) {
    if (!stroke || ev.pointerId !== stroke.id) return;
    const s = stroke;
    stroke = null;
    if (!s.dragging) {
      tapEdge(nearestEdge(s.p0.x, s.p0.y), s.right);
      return;
    }
    if (game !== s.base && !solved()) persist();
    render();
  }
  board.addEventListener('pointerup', endStroke);
  board.addEventListener('pointercancel', endStroke);
  board.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /* ---------------- Bàn phím ---------------- */

  const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

  function keyArrow(d, shift) {
    const n = game.n;
    const to = { r: cursor.r + d[0], c: cursor.c + d[1] };
    const inside = to.r >= 0 && to.c >= 0 && to.r <= n && to.c <= n;
    board.classList.add('kbd');
    if (solved()) {
      if (inside) cursor = to;
      render();
      return;
    }
    if (crossArmed) {
      // X + mũi tên: bật / tắt dấu × trên cạnh theo hướng đó, con trỏ đứng yên
      if (inside) {
        const e = E.edgeBetween(n, vid(cursor.r, cursor.c), vid(to.r, to.c));
        tapEdge(e, true);
      }
      if (xHeld) xUsed = true;
      else crossArmed = false;
      render();
      return;
    }
    if (!inside) return;
    if (shift) {
      // Shift + mũi tên: vẽ đường (hoặc xóa nếu đã có) rồi đi theo nó
      const e = E.edgeBetween(n, vid(cursor.r, cursor.c), vid(to.r, to.c));
      cursor = to;
      const next = E.apply(game, [[e, game.edges[e] === 1 ? 0 : 1]]);
      const toState = next.edges[e];
      if (next !== game) {
        game = next;
        if (solved()) {
          render();
          finish();
          return;
        }
        kit.sfx(soundFor(toState, e));
        persist();
      }
      render();
      return;
    }
    cursor = to;
    render();
  }

  document.addEventListener('keydown', (e) => {
    if (kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z') {
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (k === 'y') doRedo();
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (DIRS[e.key]) {
      keyArrow(DIRS[e.key], e.shiftKey);
      e.preventDefault();
      return;
    }
    if (k === 'x') {
      if (!e.repeat) {
        crossArmed = !(crossArmed && !xHeld);
        xHeld = true;
        xUsed = false;
        board.classList.add('kbd');
        render();
      }
    } else if (k === 'escape' && crossArmed) {
      crossArmed = false;
      render();
    } else if (k === 'z') doUndo();
    else if (k === 'y') doRedo();
    else if (k === 'h') doHint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() !== 'x') return;
    xHeld = false;
    if (xUsed) {
      crossArmed = false;
      xUsed = false;
      if (game) render();
    }
  });

  /* ---------------- Nút ---------------- */

  $('btn-undo').addEventListener('click', doUndo);
  $('btn-redo').addEventListener('click', doRedo);
  $('btn-hint').addEventListener('click', doHint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-mode').addEventListener('click', () => requestMode(nextMode(mode())));
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(mode());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    MODES.forEach((m) => {
      $('stats-best-' + m + '-label').textContent = t('stats.best', { level: levelOf(m) });
      $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]);
    });
  });

  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  /** Cài đặt mức đi theo đề đang có (ghi thẳng, không qua onSetting). */
  function syncModeSetting() {
    if (kit.settings.get().mode === mode()) return;
    kit.settings.get().mode = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isSolved(restored)) {
    game = restored;
    syncModeSetting();
    clock.set(saved.elapsed);
    kit.sdk.start(mode(), true);
    render();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().mode;
    newBoard(MODES.indexOf(m) >= 0 ? m : 's');
    syncModeSetting();
  }
  // Lần đầu mở: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
  syncClock();
})();
