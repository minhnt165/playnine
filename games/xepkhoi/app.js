/* =====================================================================
 * Xếp Khối - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Kéo khối từ khay vào bàn (chạm: khối nổi phía trên ngón tay), bóng mờ chỗ đặt + đường sắp xóa
 *   - Hoặc chạm / bấm chọn khối rồi chạm ô trên bàn; bàn phím: 1/2/3 chọn, mũi tên di chuyển, Enter/Space đặt, Esc hủy
 *   - Báo ván cho cổng (metric score_high, mode classic):
 *     ván mới kit.sdk.start(MODE); mở lại ván lưu dở kit.sdk.start(MODE, true)
 *     hết chỗ: kit.sdk.end({ mode, won: false, score }); bỏ ván đã đặt ít nhất một khối: cũng gửi won false + điểm hiện có
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const N = E.SIZE;
  const PITCH = 1.07; // khoảng cách giữa hai ô = 1 ô + khe 0.07 ô (khớp style.css)
  const PAD = 0.1; // lề trong của bàn, tính theo ô
  const kit = PNKit.init({ gameId: 'xepkhoi', version: '1.0.1', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const boardEl = $('board');
  const dragEl = $('drag');
  const slots = [0, 1, 2].map((s) => $('slot-' + s));
  const cells = [];

  let game = null;
  let sel = null; // khối đang chọn bằng phím / chạm: { slot, r, c, kbd }
  let drag = null; // khối đang kéo: { slot, id, touch, sx, sy, active, moved, r, c, wasSel }
  let cellPx = 34;
  let overTimer = 0;
  const drop = new Set(); // ô vừa đặt (hiệu ứng nảy)
  const clearing = new Map(); // ô vừa bị xóa → màu cũ (hiệu ứng vỡ)
  const stats = Object.assign({ played: 0, best: 0, total: 0, lines: 0 }, kit.store.read(keys.stats, {}) || {});

  const fmt = (n) => kit.i18n.fmtNumber(n);

  /* ---------------- Dựng bàn ---------------- */
  for (let i = 0; i < N * N; i++) {
    const c = document.createElement('div');
    c.className = 'cell';
    c.dataset.i = i;
    boardEl.appendChild(c);
    cells.push(c);
  }

  /** Tính cỡ bàn theo khung: khay dưới bàn (dọc) hoặc bên phải (màn hình thấp, nằm ngang). */
  function layout() {
    const st = $('stage');
    const W = st.clientWidth;
    const H = st.clientHeight;
    const gap = 12;
    const vert = Math.min(W, (H - gap) / 1.3);
    const side = Math.min(H, (W - gap) / 1.36);
    const isSide = side > vert * 1.05;
    const B = Math.floor(Math.max(150, isSide ? side : vert));
    $('play').classList.toggle('side', isSide);
    cellPx = B / (N + (N - 1) * (PITCH - 1) + 2 * PAD);
    const s = document.documentElement.style;
    s.setProperty('--board', B + 'px');
    s.setProperty('--cell', cellPx + 'px');
    s.setProperty('--tcell', B / 19 + 'px');
  }

  function pieceEl(key) {
    const p = E.PIECES[key];
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.gridTemplateColumns = 'repeat(' + p.w + ', var(--pc))';
    el.style.gridTemplateRows = 'repeat(' + p.h + ', var(--pc))';
    p.cells.forEach(([r, c]) => {
      const s = document.createElement('span');
      s.className = 'pc c' + p.color;
      s.style.gridRow = r + 1;
      s.style.gridColumn = c + 1;
      el.appendChild(s);
    });
    return el;
  }

  /* ---------------- Vẽ ---------------- */
  /** Bóng mờ của khối đang kéo / đang chọn: ô sẽ lấp, đường sắp xóa; chỗ sai (chỉ khi chọn bằng phím / chạm) vẽ đỏ. */
  function ghost() {
    const src = drag && drag.active ? drag : sel;
    if (!src || src.r == null || !game.pieces[src.slot]) return null;
    const p = E.PIECES[game.pieces[src.slot]];
    const pv = E.preview(game, src.slot, src.r, src.c);
    if (pv) {
      const hl = new Set();
      pv.rows.forEach((y) => { for (let x = 0; x < N; x++) hl.add(y * N + x); });
      pv.cols.forEach((x) => { for (let y = 0; y < N; y++) hl.add(y * N + x); });
      return { cells: new Set(pv.cells), color: p.color, bad: false, hl };
    }
    if (src === drag) return null;
    const bad = new Set();
    p.cells.forEach(([dr, dc]) => {
      const r = src.r + dr;
      const c = src.c + dc;
      if (r >= 0 && c >= 0 && r < N && c < N) bad.add(r * N + c);
    });
    return { cells: bad, color: 0, bad: true, hl: new Set() };
  }

  function renderBoard() {
    const gh = ghost();
    for (let i = 0; i < N * N; i++) {
      const v = game.board[i];
      let cls = 'cell';
      if (v) cls += ' f c' + v + (drop.has(i) ? ' drop' : '');
      else if (clearing.has(i)) cls += ' clearing c' + clearing.get(i);
      if (gh && gh.cells.has(i)) cls += gh.bad ? ' ghost bad' : ' ghost c' + gh.color;
      if (gh && gh.hl.has(i)) cls += ' hl';
      if (cells[i].className !== cls) cells[i].className = cls;
    }
    boardEl.classList.toggle('kbd', !!(sel && sel.kbd && !drag));
  }

  let dealTimer = 0;
  function renderTray(dealt) {
    const fit = E.playable(game);
    slots.forEach((el, s) => {
      const key = game.pieces[s];
      // Chỉ dựng lại hình khối khi khối trong ô đổi (tránh chạy lại hiệu ứng mỗi lần vẽ)
      if (el.dataset.key !== (key || '') || dealt) {
        el.dataset.key = key || '';
        el.textContent = '';
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = s + 1;
        el.appendChild(k);
        if (key) el.appendChild(pieceEl(key));
      }
      el.classList.toggle('sel', !!(sel && sel.slot === s));
      el.classList.toggle('lifted', !!(drag && drag.active && drag.slot === s));
      el.classList.toggle('nofit', !!key && !fit[s]);
      el.disabled = !key || game.over;
      if (key) {
        const p = E.PIECES[key];
        el.setAttribute('aria-label', t('slot.label', { n: s + 1, cells: p.cells.length, w: p.w, h: p.h }) + (fit[s] ? '' : ', ' + t('slot.noFit')));
      } else {
        el.setAttribute('aria-label', t('slot.empty', { n: s + 1 }));
      }
      if (dealt && !reduced.matches) el.classList.add('deal');
    });
    if (dealt) {
      clearTimeout(dealTimer);
      dealTimer = setTimeout(() => slots.forEach((el) => el.classList.remove('deal')), 500);
    }
  }

  function renderHud() {
    $('score').textContent = fmt(game.score);
    $('best').textContent = fmt(Math.max(stats.best, game.score));
    $('lines').textContent = fmt(game.lines);
  }

  function render(dealt) {
    renderBoard();
    renderTray(dealt);
    renderHud();
  }

  /** Điểm bay lên ở giữa các ô vừa đặt (chỉ khi ăn đường, để bàn không rối). */
  function popScore(cellIdx, gained, lines) {
    if (reduced.matches || !lines) return;
    let sr = 0;
    let sc = 0;
    cellIdx.forEach((i) => { sr += Math.floor(i / N); sc += i % N; });
    const r = sr / cellIdx.length;
    const c = sc / cellIdx.length;
    const el = document.createElement('div');
    el.className = 'pop' + (lines >= 2 ? ' big' : '');
    el.style.left = cellPx * (PAD + PITCH * c + 0.5) + 'px';
    el.style.top = cellPx * (PAD + PITCH * r + 0.5) + 'px';
    el.textContent = '+' + gained;
    if (lines >= 2) {
      const s = document.createElement('small');
      s.textContent = t('pop.combo', { n: lines });
      el.appendChild(s);
    }
    $('fx').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && game.moves > 0 && !game.over;
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { score: fmt(stats.best) }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: fmt(stats.best), label: t('hud.best') }] : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.detail', { score: fmt(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }
  /** Ghi ván vừa xong (hết chỗ hoặc bỏ dở) vào thống kê; trả về có phải kỷ lục mới không. */
  function record() {
    const best = game.score > stats.best;
    stats.played++;
    stats.total += game.score;
    stats.lines += game.lines;
    if (best) stats.best = game.score;
    saveStats();
    return best;
  }

  /* ---------------- Luồng ván ---------------- */
  function resetView() {
    clearTimeout(overTimer);
    sel = null;
    cancelDrag(false);
    drop.clear();
    clearing.clear();
    boardEl.classList.remove('over');
    $('over-banner').hidden = true;
  }

  function newGame() {
    resetView();
    game = E.newGame();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    render(true);
    writeSummary();
  }

  function placeAt(slot, r, c) {
    const res = E.place(game, slot, r, c);
    if (!res) {
      kit.sfx('error');
      return false;
    }
    game = res.game;
    sel = null;
    drop.clear();
    res.cells.forEach((i) => drop.add(i));
    res.cleared.forEach(({ i, color }) => clearing.set(i, color));
    setTimeout(() => {
      res.cells.forEach((i) => drop.delete(i));
      res.cleared.forEach(({ i }) => clearing.delete(i));
      if (game) renderBoard();
    }, 450);
    kit.sfx(res.lines >= 2 ? 'combo' : res.lines ? 'clear' : 'place');
    if (res.dealt && !game.over) setTimeout(() => kit.sfx('pop'), 140);
    popScore(res.cells, res.gained, res.lines);
    $('live').textContent = '+' + res.gained + ' · ' + t('hud.score') + ' ' + fmt(game.score);
    render(res.dealt);
    if (game.over) finish();
    else persist();
    return true;
  }

  /** Hết chỗ: báo cổng ngay, rung bàn + băng "Hết chỗ", lát sau mới mở hộp kết quả. */
  function finish() {
    const best = record();
    persist();
    kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    kit.sfx(best ? 'win' : 'lose');
    boardEl.classList.add('over');
    $('over-banner').hidden = false;
    $('live').textContent = t('board.over');
    renderHud();
    $('over-score').textContent = fmt(game.score);
    $('over-lines').textContent = fmt(game.lines);
    $('over-best').hidden = !best;
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      kit.modal.open('modal-over');
      if (best) kit.confetti();
    }, reduced.matches ? 400 : 1300);
  }

  /** Ván đang dở (đã đặt khối) thì hỏi trước, vì bỏ ván sẽ kết thúc và gửi điểm hiện có. */
  function requestNew() {
    if (inPlay()) {
      $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score) });
      kit.modal.open('modal-confirm');
    } else {
      kit.modal.closeAll();
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      record();
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    newGame();
  }

  /* ---------------- Chọn khối (phím / chạm) ---------------- */
  const clampR = (p, r) => Math.max(0, Math.min(N - p.h, r));
  const clampC = (p, c) => Math.max(0, Math.min(N - p.w, c));

  /** Vị trí đặt được gần (r, c) nhất; không có thì null. */
  function nearestValid(slot, r0, c0) {
    const key = game.pieces[slot];
    let best = null;
    let bd = Infinity;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!E.canPlace(game.board, key, r, c)) continue;
        const d = (r - r0) * (r - r0) + (c - c0) * (c - c0);
        if (d < bd) { bd = d; best = [r, c]; }
      }
    }
    return best;
  }

  function selectSlot(s, kbd) {
    if (!game.pieces[s] || game.over) return;
    if (sel && sel.slot === s && !kbd) {
      sel = null;
      render();
      return;
    }
    const p = E.PIECES[game.pieces[s]];
    let r = sel ? clampR(p, sel.r) : Math.floor((N - p.h) / 2);
    let c = sel ? clampC(p, sel.c) : Math.floor((N - p.w) / 2);
    const near = nearestValid(s, r, c);
    if (near) [r, c] = near;
    sel = { slot: s, r, c, kbd };
    kit.sfx('tap');
    render();
  }

  function moveSel(dr, dc) {
    const p = E.PIECES[game.pieces[sel.slot]];
    sel.r = clampR(p, sel.r + dr);
    sel.c = clampC(p, sel.c + dc);
    sel.kbd = true;
    kit.sfx('move');
    renderBoard();
  }

  /** Ô (r, c) của bàn dưới điểm (x, y) trên màn hình. */
  function cellAt(x, y) {
    const br = boardEl.getBoundingClientRect();
    const pitch = cellPx * PITCH;
    return [Math.floor((y - br.top - cellPx * PAD) / pitch), Math.floor((x - br.left - cellPx * PAD) / pitch)];
  }
  /** Đặt khối đang chọn sao cho ô giữa của khối nằm ở (r, c). */
  function aimSel(r, c) {
    const p = E.PIECES[game.pieces[sel.slot]];
    sel.r = clampR(p, r - Math.floor((p.h - 1) / 2));
    sel.c = clampC(p, c - Math.floor((p.w - 1) / 2));
  }

  /* ---------------- Kéo thả ---------------- */
  function liftDrag() {
    const d = drag;
    d.active = true;
    sel = null;
    dragEl.textContent = '';
    dragEl.appendChild(pieceEl(game.pieces[d.slot]));
    dragEl.classList.remove('back');
    dragEl.hidden = false;
    kit.sfx('tap');
    render();
  }

  function moveDrag(x, y) {
    const d = drag;
    const p = E.PIECES[game.pieces[d.slot]];
    const pitch = cellPx * PITCH;
    const w = p.w * pitch - (PITCH - 1) * cellPx;
    const h = p.h * pitch - (PITCH - 1) * cellPx;
    const left = x - w / 2;
    // Chạm: khối nổi hẳn phía trên ngón tay để không bị che; chuột: khối nằm giữa con trỏ
    const top = d.touch ? y - h - Math.max(cellPx * 1.4, 44) : y - h / 2;
    dragEl.style.transform = 'translate(' + left + 'px, ' + top + 'px)';
    const br = boardEl.getBoundingClientRect();
    let r = Math.round((top - br.top - cellPx * PAD) / pitch);
    let c = Math.round((left - br.left - cellPx * PAD) / pitch);
    // Gần bàn (lố mép tối đa một ô) thì hút vào trong; xa hơn thì không có bóng
    const near = r >= -1 && c >= -1 && r + p.h <= N + 1 && c + p.w <= N + 1;
    if (near) {
      r = clampR(p, r);
      c = clampC(p, c);
    } else {
      r = null;
      c = null;
    }
    if (r !== d.r || c !== d.c) {
      d.r = r;
      d.c = c;
      renderBoard();
    }
  }

  /** Thả khối về khay (có hiệu ứng bay về nếu `animate`). */
  function cancelDrag(animate) {
    const d = drag;
    drag = null;
    if (!d || !d.active) return;
    if (animate && !reduced.matches) {
      const sr = slots[d.slot].getBoundingClientRect();
      const pr = dragEl.getBoundingClientRect();
      dragEl.classList.add('back');
      dragEl.style.transform = 'translate(' + (sr.left + sr.width / 2 - pr.width / 2) + 'px, ' + (sr.top + sr.height / 2 - pr.height / 2) + 'px) scale(0.6)';
      setTimeout(() => { if (!drag) dragEl.hidden = true; }, 190);
    } else {
      dragEl.hidden = true;
    }
    if (game) render();
  }

  function onSlotDown(e) {
    const s = Number(e.currentTarget.dataset.slot);
    if (drag || !game.pieces[s] || game.over || kit.modal.current() || e.button > 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    drag = { slot: s, id: e.pointerId, touch: e.pointerType !== 'mouse', sx: e.clientX, sy: e.clientY, active: false, moved: false, r: null, c: null, wasSel: !!(sel && sel.slot === s), prevSel: sel };
    // Chạm: nhấc khối ngay để thấy nó nổi trên ngón tay; chuột: nhấc khi bắt đầu kéo
    if (drag.touch) {
      liftDrag();
      moveDrag(e.clientX, e.clientY);
    }
  }
  function onSlotMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 8) drag.moved = true;
    if (!drag.active && drag.moved) liftDrag();
    if (drag.active) moveDrag(e.clientX, e.clientY);
  }
  function onSlotUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    // Chạm / bấm không kéo: chọn (hoặc bỏ chọn) khối để đặt bằng cách chạm bàn hoặc phím
    if (!d.moved) {
      cancelDrag(false);
      if (d.wasSel) {
        sel = null;
        render();
      } else {
        sel = d.prevSel;
        selectSlot(d.slot, false);
      }
      return;
    }
    if (d.r != null && E.preview(game, d.slot, d.r, d.c)) {
      drag = null;
      dragEl.hidden = true;
      placeAt(d.slot, d.r, d.c);
      return;
    }
    if (d.r != null) kit.sfx('error');
    cancelDrag(true);
  }

  slots.forEach((el) => {
    el.addEventListener('pointerdown', onSlotDown);
    el.addEventListener('pointermove', onSlotMove);
    el.addEventListener('pointerup', onSlotUp);
    el.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) cancelDrag(true); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Enter / Space trên nút khay (click từ bàn phím, detail 0): chọn khối
    el.addEventListener('click', (e) => { if (e.detail === 0) selectSlot(Number(el.dataset.slot), true); });
  });

  // Đã chọn khối: rê chuột trên bàn để ngắm, chạm / bấm ô để đặt
  boardEl.addEventListener('pointermove', (e) => {
    if (!sel || drag || e.pointerType !== 'mouse') return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    const pr = sel.r;
    const pc = sel.c;
    aimSel(r, c);
    sel.kbd = false;
    if (sel.r !== pr || sel.c !== pc) renderBoard();
  });
  boardEl.addEventListener('click', (e) => {
    if (!sel || drag || game.over) return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (r < 0 || c < 0 || r >= N || c >= N) return;
    aimSel(r, c);
    if (!placeAt(sel.slot, sel.r, sel.c)) renderBoard();
  });

  /* ---------------- Nút, phím ---------------- */
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-over');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmt(stats.played);
    $('stats-best').textContent = fmt(stats.best);
    $('stats-avg').textContent = fmt(stats.played ? Math.round(stats.total / stats.played) : 0);
    $('stats-lines').textContent = fmt(stats.lines);
  });

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onSlot = e.target && e.target.classList && e.target.classList.contains('slot');
    if (k === '1' || k === '2' || k === '3') {
      selectSlot(Number(k) - 1, true);
    } else if (ARROWS[k]) {
      if (game.over) return;
      if (!sel) {
        const s = E.playable(game).indexOf(true);
        if (s < 0) return;
        selectSlot(s, true);
      } else moveSel(ARROWS[k][0], ARROWS[k][1]);
    } else if (k === 'Enter' || k === ' ') {
      if (!sel) {
        if (onSlot) return; // để trình duyệt bấm nút khay (chọn khối)
        if (k === ' ') e.preventDefault();
        return;
      }
      if (!placeAt(sel.slot, sel.r, sel.c)) renderBoard();
    } else if (k === 'Escape') {
      if (drag) cancelDrag(true);
      else if (sel) {
        sel = null;
        render();
      } else return;
    } else if (k === 'n' || k === 'N') {
      requestNew();
    } else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('stage'));
  window.addEventListener('resize', layout);
  layout();

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !restored.over) {
    game = restored;
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    render(true);
    writeSummary();
  } else {
    newGame();
  }
})();
