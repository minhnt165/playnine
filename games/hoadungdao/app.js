/* =====================================================================
 * Hoa Dung Đạo - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Khay vẽ bằng DOM: mỗi khối là một <button> đặt bằng transform theo % kích thước của chính nó
 *   - Điều khiển: kéo khối (đi theo con trỏ, rẽ góc được), vuốt ngắn một ô, chạm khối cạnh ô trống, chạm ô trống
 *     mà chỉ một khối vào được; bàn phím: Tab / mũi tên chọn khối, Enter / Space nhấc, mũi tên trượt
 *     (Shift + mũi tên trượt ngay), Z hoàn tác, R chơi lại, L chọn màn
 *   - Mỗi lần chơi một thế là một ván (metric wins, mode classic):
 *     · hiện thế: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     · khối lớn tới lối ra: kit.sdk.end({ mode, won: true, assisted: false }) (hoàn tác / chơi lại không tính trợ giúp)
 *     · chơi lại hoặc rời thế khi đã đi ít nhất một nước: kit.sdk.end({ mode, won: false }); chưa đi thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const TOTAL = E.LEVELS.length;
  const kit = PNKit.init({ gameId: 'hoadungdao', version: '1.0.1', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchUI = () => window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;
  // Hoa trang trí trên khối lớn ("hoa" trong Hoa Dung)
  const FLOWER = '<svg class="emblem" viewBox="0 0 24 24" aria-hidden="true"><g><ellipse cx="12" cy="6.2" rx="3.4" ry="4.6"/><ellipse cx="12" cy="17.8" rx="3.4" ry="4.6"/><ellipse cx="6.2" cy="12" rx="4.6" ry="3.4"/><ellipse cx="17.8" cy="12" rx="4.6" ry="3.4"/></g><circle cx="12" cy="12" r="2.6" class="emblem-core"/></svg>';

  let game = null;
  let moved = false; // ván (lượt chơi thế hiện tại) đã đi ít nhất một nước, kể cả khi đã hoàn tác hết
  let over = false; // khối lớn đã ra, đã gửi kết quả
  let sel = -1; // khối đang chọn bằng bàn phím
  let grabbed = false; // khối đang chọn đã được nhấc (mũi tên sẽ trượt khối)

  /* ---------------- Thống kê + tiến độ ---------------- */
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: int(raw.played), won: int(raw.won), solved: [], best: {}, current: 0 };
    if (Array.isArray(raw.solved)) s.solved = raw.solved.filter((i, k, a) => Number.isInteger(i) && i >= 0 && i < TOTAL && a.indexOf(i) === k);
    if (raw.best && typeof raw.best === 'object') {
      Object.keys(raw.best).forEach((k) => {
        const i = Number(k);
        const m = raw.best[k];
        if (Number.isInteger(i) && i >= 0 && i < TOTAL && Number.isInteger(m) && m > 0) s.best[i] = m;
      });
    }
    if (Number.isInteger(raw.current) && raw.current >= 0 && raw.current < TOTAL) s.current = raw.current;
    return s;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);
  const isSolved = (i) => stats.solved.indexOf(i) >= 0;
  const perfectCount = () => Object.keys(stats.best).filter((i) => stats.best[i] <= E.LEVELS[i].min).length;
  /** Thế chưa giải có số nhỏ nhất (giải hết thì -1). */
  function firstUnsolved() {
    for (let i = 0; i < TOTAL; i++) if (!isSolved(i)) return i;
    return -1;
  }

  /* ---------------- Khay ---------------- */
  const stage = $('stage');
  const tray = $('tray');
  const board = $('board');
  let els = []; // phần tử của từng khối, cùng chỉ số với game.blocks

  function blockLabel(k) {
    const b = game.blocks[k];
    const [w, h] = E.SIZE[b.t];
    const name = t('block.' + b.t, { x: b.x + 1, x2: b.x + w, y: b.y + 1, y2: b.y + h });
    return grabbed && k === sel ? t('block.grabbed', { name }) : name;
  }

  /** Dựng lại các khối (đổi thế / chơi lại); vị trí đặt ngay, không trượt. */
  function build() {
    board.textContent = '';
    els = game.blocks.map((b, k) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'blk blk-' + b.t;
      el.dataset.k = k;
      el.innerHTML = '<span class="face">' + (b.t === 'B' ? FLOWER : '') + '</span>';
      el.addEventListener('focus', () => {
        if (sel !== k) grabbed = false;
        sel = k;
        renderSel();
      });
      board.appendChild(el);
      return el;
    });
    board.classList.add('no-anim');
    renderBlocks();
    void board.offsetWidth;
    board.classList.remove('no-anim');
  }

  function renderBlocks() {
    game.blocks.forEach((b, k) => {
      const [w, h] = E.SIZE[b.t];
      const el = els[k];
      if (!el.classList.contains('escape')) el.style.transform = 'translate(' + (b.x * 100) / w + '%,' + (b.y * 100) / h + '%)';
      el.setAttribute('aria-label', blockLabel(k));
      el.disabled = over;
    });
  }

  function renderSel() {
    els.forEach((el, k) => {
      const on = grabbed && k === sel;
      el.classList.toggle('grabbed', on);
      el.setAttribute('aria-pressed', String(on));
      if (k === sel) el.setAttribute('aria-label', blockLabel(k));
    });
  }

  /** Cỡ ô theo khung còn trống: khay 4 ô + khung hai bên, cao 5 ô + khung + nhãn lối ra; tối đa 92px. */
  function fit() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const cs = Math.max(24, Math.floor(Math.min(w / 4.4, h / 5.78, 92)));
    tray.style.setProperty('--cs', cs + 'px');
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  fit();

  /* ---------------- HUD ---------------- */
  function render() {
    renderBlocks();
    renderSel();
    const lv = game.level + 1;
    $('level').textContent = lv;
    $('level-total').textContent = '/' + TOTAL;
    $('moves').textContent = kit.i18n.fmtNumber(E.moves(game));
    $('min').textContent = kit.i18n.fmtNumber(E.LEVELS[game.level].min);
    const best = stats.best[game.level];
    $('best').textContent = best ? kit.i18n.fmtNumber(best) : '–';
    $('btn-level').setAttribute('aria-label', t('hud.levelBtn', { n: lv }));
    $('btn-undo').disabled = !E.moves(game) || over;
    $('btn-restart').disabled = !moved && !over;
    board.setAttribute('aria-label', t('board.label', { n: lv }));
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const n = stats.solved.length;
    const inPlay = game && moved && !over;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: n ? t('summary.note', { n, total: TOTAL }) : t('summary.none', { total: TOTAL }),
      stats: n ? [{ value: n + '/' + TOTAL, label: t('summary.solved') }] : [],
      resume: inPlay ? { title: t('summary.resume', { n: game.level + 1 }), detail: t('summary.detail', { moves: E.moves(game) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && moved && !over) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  /** Bỏ ván đang chơi: đã đi ít nhất một nước thì tính một lượt thua; chưa đi thì không gửi gì. */
  function abandon() {
    if (game && moved && !over) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, assisted: false });
    }
  }

  /** Hiện thế i và bắt đầu ván mới (gửi start). */
  function showLevel(i) {
    clearTimeout(winTimer);
    game = E.newGame(i);
    moved = false;
    over = false;
    sel = -1;
    grabbed = false;
    armedRestart = 0;
    stats.current = i;
    saveStats();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    build();
    render();
    writeSummary();
  }

  function goLevel(i) {
    if (i < 0 || i >= TOTAL) return;
    if (game && i === game.level && !over) return;
    abandon();
    showLevel(i);
    kit.sfx('start');
  }

  /** Nhận ván mới từ engine; trả true nếu có khối đi. */
  function apply(next) {
    if (next === game) return false;
    const before = E.moves(game);
    game = next;
    moved = true;
    armedRestart = 0;
    kit.sfx(E.moves(game) > before ? 'move' : 'tap');
    render();
    if (E.isWon(game)) finish();
    return true;
  }

  /** Khối không đi được: rung nhẹ + tiếng lỗi. */
  function nope(k) {
    kit.sfx('error');
    const el = els[k];
    if (!el || reduced()) return;
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }

  function slide(k, d) {
    if (over || k < 0) return;
    if (!apply(E.step(game, k, d))) nope(k);
  }

  let winTimer = 0;
  function finish() {
    over = true;
    grabbed = false;
    const lv = game.level;
    const m = E.moves(game);
    const min = E.LEVELS[lv].min;
    const prev = stats.best[lv];
    const isBest = !prev || m < prev;
    if (isBest) stats.best[lv] = m;
    if (!isSolved(lv)) stats.solved.push(lv);
    stats.played++;
    stats.won++;
    const next = lv + 1 < TOTAL ? lv + 1 : firstUnsolved();
    if (next >= 0) stats.current = next;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won: true, assisted: false });
    render();
    // Khối lớn trượt ra khỏi khay qua lối ra
    const big = els[E.bigIndex(game)];
    if (document.activeElement && document.activeElement.classList.contains('blk')) $('btn-level').focus();
    if (!reduced()) {
      big.classList.add('escape');
      big.style.transform = 'translate(50%, 285%)';
    }
    kit.sfx('win');
    kit.confetti();
    $('live').textContent = t(E.LEVELS[lv].classic ? 'win.titleClassic' : 'win.title', { n: lv + 1 });
    $('win-title').textContent = $('live').textContent;
    $('win-result').textContent = t('win.result', { moves: kit.i18n.fmtNumber(m), min: kit.i18n.fmtNumber(min) });
    $('win-perfect').hidden = m > min;
    $('win-best').hidden = !(isBest && prev) || m <= min;
    $('win-prev').hidden = isBest || !prev;
    if (prev) $('win-prev').textContent = t('win.prevBest', { moves: kit.i18n.fmtNumber(stats.best[lv]) });
    $('win-all').hidden = firstUnsolved() >= 0;
    $('btn-next').hidden = next < 0;
    winTimer = setTimeout(() => {
      if (over && game.level === lv) kit.modal.open('modal-win');
    }, reduced() ? 0 : 900);
  }

  function nextLevel() {
    kit.modal.close('modal-win');
    const n = game.level + 1 < TOTAL ? game.level + 1 : firstUnsolved();
    if (n >= 0) goLevel(n);
  }

  function undo() {
    if (!game || over || !E.moves(game)) return;
    game = E.undo(game);
    armedRestart = 0;
    kit.sfx('pop');
    render();
  }

  // Chơi lại khi đã đi: bấm hai lần trong 2,5 giây để không lỡ tay mất cả thế
  let armedRestart = 0;
  function restart() {
    if (!game) return;
    if (over) {
      kit.modal.close('modal-win');
      showLevel(game.level);
      kit.sfx('start');
      return;
    }
    if (!moved) return;
    const now = Date.now();
    if (now - armedRestart > 2500) {
      armedRestart = now;
      kit.toast(t(touchUI() ? 'toast.restartAgainTouch' : 'toast.restartAgain'), 2500);
      return;
    }
    abandon();
    showLevel(game.level);
    kit.sfx('start');
  }

  /* ---------------- Chạm / kéo / vuốt ---------------- */
  const STEP_AT = 0.6; // con trỏ lệch quá 0,6 ô so với khối thì khối trượt theo một ô
  let drag = null;

  function cellSize() {
    return board.getBoundingClientRect().width / E.W;
  }

  /** Kéo: khối đuổi theo con trỏ từng ô, ưu tiên trục lệch nhiều hơn, bị chặn thì thử trục kia (rẽ góc). */
  function follow(d, fx, fy) {
    for (let i = 0; i < 12 && !over; i++) {
      const b = game.blocks[d.k];
      const ex = fx - b.x;
      const ey = fy - b.y;
      const axes = Math.abs(ex) >= Math.abs(ey) ? [[ex, 1, 3], [ey, 2, 0]] : [[ey, 2, 0], [ex, 1, 3]];
      let stepped = false;
      for (const [e, pos, neg] of axes) {
        if (Math.abs(e) < STEP_AT) continue;
        const dir = e > 0 ? pos : neg;
        if (E.canStep(game, d.k, dir)) {
          apply(E.step(game, d.k, dir));
          d.steps++;
          stepped = true;
          break;
        }
      }
      if (!stepped) break;
    }
  }

  /** Chạm khối: đi một ô về phía có chỗ trống; nhiều hướng thì chọn hướng gần với điểm chạm (so với tâm khối). */
  function tapBlock(k, cx, cy) {
    const dirs = [0, 1, 2, 3].filter((d) => E.canStep(game, k, d));
    if (!dirs.length) return nope(k);
    let d = dirs[0];
    if (dirs.length > 1) {
      const r = els[k].getBoundingClientRect();
      const vx = (cx - (r.left + r.width / 2)) / r.width;
      const vy = (cy - (r.top + r.height / 2)) / r.height;
      d = dirs.reduce((a, c) => (E.DX[c] * vx + E.DY[c] * vy > E.DX[a] * vx + E.DY[a] * vy ? c : a), dirs[0]);
    }
    apply(E.step(game, k, d));
  }

  /** Chạm ô trống: chỉ một khối trượt một ô vào được ô đó thì đi khối ấy. */
  function tapEmpty(cx, cy) {
    const r = board.getBoundingClientRect();
    const cs = r.width / E.W;
    const x = Math.floor((cx - r.left) / cs);
    const y = Math.floor((cy - r.top) / cs);
    if (x < 0 || y < 0 || x >= E.W || y >= E.H) return;
    const hits = [];
    game.blocks.forEach((b, k) => {
      const [w, h] = E.SIZE[b.t];
      for (let d = 0; d < 4; d++) {
        const nx = b.x + E.DX[d];
        const ny = b.y + E.DY[d];
        if (x >= nx && x < nx + w && y >= ny && y < ny + h && !(x >= b.x && x < b.x + w && y >= b.y && y < b.y + h) && E.canStep(game, k, d)) hits.push([k, d]);
      }
    });
    const pick = hits.length === 1 ? hits[0] : hits.find((h) => h[0] === sel);
    if (pick) apply(E.step(game, pick[0], pick[1]));
    else kit.sfx('error');
  }

  board.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !game || over || kit.modal.current()) return;
    const blk = e.target.closest('.blk');
    const r = board.getBoundingClientRect();
    const cs = r.width / E.W;
    drag = { k: -1, id: e.pointerId, x0: e.clientX, y0: e.clientY, steps: 0 };
    if (blk) {
      const k = Number(blk.dataset.k);
      const b = game.blocks[k];
      Object.assign(drag, { k, ax: (e.clientX - r.left) / cs - b.x, ay: (e.clientY - r.top) / cs - b.y });
      if (sel !== k) grabbed = false;
      sel = k;
      els[k].classList.add('held');
    }
    try {
      board.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || drag.k < 0 || e.pointerId !== drag.id || over) return;
    const r = board.getBoundingClientRect();
    const cs = r.width / E.W;
    follow(drag, (e.clientX - r.left) / cs - drag.ax, (e.clientY - r.top) / cs - drag.ay);
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.k >= 0 && els[d.k]) els[d.k].classList.remove('held');
    if (cancel || over || kit.modal.current() || d.steps) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    const dist = Math.hypot(dx, dy);
    if (d.k < 0) {
      if (dist < 12) tapEmpty(e.clientX, e.clientY);
      return;
    }
    // Vuốt ngắn (chưa đủ để kéo được một ô): trượt một ô theo hướng vuốt
    if (dist >= Math.max(14, cellSize() * 0.2)) slide(d.k, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    else tapBlock(d.k, e.clientX, e.clientY);
  }
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* ---------------- Bàn phím trên khay ---------------- */
  function focusBlock(k) {
    if (k >= 0 && els[k]) els[k].focus();
  }

  /** Khối gần nhất theo hướng d tính từ tâm khối k (ưu tiên thẳng hàng). */
  function neighbourIn(k, d) {
    const centre = (b) => {
      const [w, h] = E.SIZE[b.t];
      return [b.x + w / 2, b.y + h / 2];
    };
    const [cx, cy] = centre(game.blocks[k]);
    let best = k;
    let bestScore = Infinity;
    game.blocks.forEach((b, j) => {
      if (j === k) return;
      const [x, y] = centre(b);
      const along = (x - cx) * E.DX[d] + (y - cy) * E.DY[d];
      const across = Math.abs((x - cx) * E.DY[d]) + Math.abs((y - cy) * E.DX[d]);
      if (along <= 0.01) return;
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    });
    return best;
  }

  board.addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !board.contains(e.relatedTarget)) {
      grabbed = false;
      renderSel();
    }
  });

  /* ---------------- Chọn màn ---------------- */
  function renderLevels() {
    const grid = $('level-grid');
    grid.textContent = '';
    $('levels-progress').textContent = t('levels.progress', { n: stats.solved.length, total: TOTAL });
    for (let i = 0; i < TOTAL; i++) {
      const L = E.LEVELS[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-btn';
      const best = stats.best[i];
      if (isSolved(i)) b.classList.add('solved');
      if (best && best <= L.min) b.classList.add('perfect');
      if (L.classic) b.classList.add('classic');
      if (game && i === game.level) {
        b.classList.add('current');
        b.setAttribute('aria-current', 'true');
      }
      let label = best ? t('levels.solved', { n: i + 1, moves: best, min: L.min }) : t('levels.open', { n: i + 1, min: L.min });
      if (L.classic) label += ' · ' + t('level.classic');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.innerHTML = '<span class="level-num">' + (i + 1) + '</span>' +
        '<span class="level-best">' + (best ? best + (best <= L.min ? '★' : '') : '&nbsp;') + '</span>';
      b.addEventListener('click', () => {
        kit.modal.close('modal-levels');
        goLevel(i);
      });
      grid.appendChild(b);
    }
  }
  function openLevels() {
    clearTimeout(winTimer);
    renderLevels();
    kit.modal.closeAll();
    kit.modal.open('modal-levels');
    const cur = document.querySelector('.level-btn.current') || document.querySelector('.level-btn');
    if (cur) cur.focus();
  }

  /* ---------------- Sự kiện ---------------- */
  $('btn-undo').addEventListener('click', undo);
  $('btn-restart').addEventListener('click', restart);
  $('btn-levels').addEventListener('click', openLevels);
  $('btn-level').addEventListener('click', openLevels);
  $('btn-next').addEventListener('click', nextLevel);
  $('btn-replay').addEventListener('click', () => {
    kit.modal.close('modal-win');
    showLevel(game.level);
    kit.sfx('start');
  });
  $('btn-win-levels').addEventListener('click', openLevels);
  $('btn-stats').addEventListener('click', () => {
    $('stats-solved').textContent = stats.solved.length + '/' + TOTAL;
    $('stats-perfect').textContent = kit.i18n.fmtNumber(perfectCount());
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
  });

  const ARROWS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      // Ctrl+Z cũng hoàn tác
      if (k === 'z' && !kit.modal.current()) {
        undo();
        e.preventDefault();
      }
      return;
    }
    const open = kit.modal.current();
    if (open) {
      if (open.id === 'modal-win' && k === 'n') nextLevel();
      else if (open.id === 'modal-win' && k === 'r') restart();
      return;
    }
    const a = document.activeElement;
    const onBlock = !!(a && a.classList && a.classList.contains('blk') && board.contains(a));
    const dir = ARROWS[e.key];
    if (dir != null) {
      // Trong ô cài đặt / nút khác ngoài khay: mũi tên lần đầu đưa focus vào khay
      if (over) return;
      if (!onBlock) focusBlock(sel >= 0 ? sel : E.bigIndex(game));
      else if (grabbed || e.shiftKey) slide(sel, dir);
      else focusBlock(neighbourIn(sel, dir));
    } else if ((k === ' ' || k === 'enter') && onBlock && !over) {
      grabbed = !grabbed;
      kit.sfx('tap');
      renderSel();
    } else if (k === 'escape' && grabbed) {
      grabbed = false;
      renderSel();
    } else if (k === 'z' || k === 'u' || k === 'backspace') undo();
    else if (k === 'r') restart();
    else if (k === 'l') openLevels();
    else if (k === 'n' && over) nextLevel();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isWon(restored)) {
    game = restored;
    moved = true;
    stats.current = game.level;
    kit.sdk.start(MODE, true);
    build();
    render();
    kit.toast(t('toast.saved'));
    writeSummary();
  } else {
    kit.store.remove(keys.save);
    showLevel(stats.current);
  }
})();
