/* =====================================================================
 * Kim Tự Tháp - Giao diện + luồng ván (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   - Bàn chơi: lá bài của cards.js đặt tuyệt đối trong #table, vị trí tính theo cỡ khung (layout());
 *     mỗi lá là một phần tử giữ theo id, nên rút lá / quay vòng / bỏ lá đều trượt hoặc mờ dần tự nhiên
 *   - Màn hình dọc: chồng rút / chồng bỏ dưới tháp (lá to hơn); màn hình rộng: chồng nằm ở góc trái trên
 *   - Chơi: chạm hai lá tổng 13 (K chạm một mình) hoặc kéo lá này thả lên lá kia; bàn phím: mũi tên + Space
 *   - Một mode 'classic', metric wins. Báo ván cho cổng:
 *     - ván mới: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     - dọn sạch tháp: won true; hết nước: won false; bỏ ván đã đi ít nhất một nước: won false
 *     - assisted: true nếu đã bấm Gợi ý (hoàn tác không tính là trợ giúp)
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = window.PNCards;
  const MODE = 'classic';
  const kit = PNKit.init({ gameId: 'kimtuthap', version: '1.0.0', dict: window.GAME_DICT, defaults: { fourColor: false }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const table = $('table');
  const stage = $('stage');

  const defaults = { played: 0, won: 0, streak: 0, bestStreak: 0, best: null };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let selected = null; // vị trí đang chọn: số ô tháp | 'stock' | 'waste'
  let cursor = null; // vị trí con trỏ bàn phím
  let hintPos = []; // vị trí đang sáng gợi ý
  let hintTimer = 0;
  let endTimer = 0;
  let finished = false; // đã báo kết thúc ván này cho cổng
  let L = null; // bố cục hiện tại
  const els = new Map(); // id lá -> phần tử .pnc
  let slots = null; // ô trống, nhãn chồng, nút rút giữa hai chồng

  const posKey = (p) => String(p);
  const parsePos = (v) => (/^\d+$/.test(v) ? Number(v) : v);
  const inPlay = () => !!game && game.moves > 0 && !E.isOver(game);
  const leftInPyramid = () => game.pyramid.filter(Boolean).length;

  /** m:ss */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------------- Bố cục ---------------- */

  const G = 0.08; // khe giữa hai lá cùng hàng, theo bề rộng lá
  const CAP = 18; // cao dòng nhãn dưới chồng (px)
  const SPAN = 7 + 6 * G; // bề rộng tháp theo bề rộng lá

  /**
   * Tính cỡ lá và vị trí theo khung #stage:
   *   - 'corner': chồng rút / chồng bỏ ở góc trái trên (chỗ trống cạnh đỉnh tháp), hợp màn hình rộng / thấp
   *   - 'below': chồng nằm dưới tháp, lá chồng to hơn; tháp giãn hàng ra nếu còn chỗ
   */
  function computeLayout() {
    const cs = getComputedStyle(stage);
    const W = Math.max(120, stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const H = Math.max(120, stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    const byW = W / SPAN;
    const wC = Math.min(byW, H / 5.6, 118);
    const wB = Math.min(byW, (H - CAP) / (5.6 + 0.35 + 1.4 * 1.45), 118);
    const corner = wC > wB * 1.12;
    const w = Math.floor(corner ? wC : wB);
    const h = w * 1.4;
    const g = Math.max(2, Math.round(w * G));
    const TW = 7 * w + 6 * g;
    let step = 0.5 * h; // khoảng cách hai hàng tháp
    let wt = w;
    let talonY = 0;
    if (!corner) {
      wt = Math.floor(Math.min(w * 1.45, 104));
      const room = H - CAP - 0.35 * w - 1.4 * wt;
      step = Math.max(0.5, Math.min(0.7, (room / h - 1) / 6)) * h;
      talonY = h + 6 * step + 0.35 * w;
    }
    const pyrH = h + 6 * step;
    const TH = corner ? pyrH : talonY + 1.4 * wt + CAP;
    const pyr = [];
    for (let p = 0; p < E.PYRAMID; p++) {
      const [r, c] = E.rowCol(p);
      pyr.push({ x: ((6 - r) * (w + g)) / 2 + c * (w + g), y: r * step });
    }
    let stock;
    let waste;
    if (corner) {
      stock = { x: 0, y: 0 };
      waste = { x: w + g, y: 0 };
    } else {
      stock = { x: TW / 2 - 1.75 * wt, y: talonY };
      waste = { x: TW / 2 + 0.75 * wt, y: talonY };
    }
    return { corner, w, h, g, wt, ht: 1.4 * wt, TW, TH, pyr, stock, waste };
  }

  /** Ô trống của hai chồng, nhãn số lá, nút rút giữa hai chồng (dựng một lần). */
  function buildSlots() {
    const stockSlot = C.slot({ className: 'kt-slot kt-slot-stock' });
    stockSlot.dataset.act = 'recycle';
    stockSlot.innerHTML = '<svg class="kt-recycle" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4l-2.3 2.3z"/></svg><span class="kt-recycle-n"></span>';
    const wasteSlot = C.slot({ className: 'kt-slot kt-slot-waste' });
    const capStock = document.createElement('div');
    capStock.className = 'kt-cap';
    const capWaste = document.createElement('div');
    capWaste.className = 'kt-cap';
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'kt-arrow';
    arrow.dataset.act = 'draw';
    arrow.tabIndex = -1;
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5.5 19.5 12 13 18.5l-1.4-1.4 4.1-4.1H4v-2h11.7l-4.1-4.1L13 5.5z"/></svg>';
    [stockSlot, wasteSlot, capStock, capWaste, arrow].forEach((el) => table.appendChild(el));
    slots = { stockSlot, wasteSlot, capStock, capWaste, arrow };
  }

  function place(el, x, y) {
    el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  function applyLayout() {
    L = computeLayout();
    table.style.width = Math.round(L.TW) + 'px';
    table.style.height = Math.round(L.TH) + 'px';
    table.style.setProperty('--card-w', L.w + 'px');
    table.style.setProperty('--talon-w', L.wt + 'px');
    table.classList.toggle('kt-corner', L.corner);
    const s = slots;
    place(s.stockSlot, L.stock.x, L.stock.y);
    place(s.wasteSlot, L.waste.x, L.waste.y);
    const capY = L.stock.y + L.ht + 3;
    s.capStock.style.width = s.capWaste.style.width = Math.round(L.wt + 24) + 'px';
    place(s.capStock, L.stock.x - 12, capY);
    place(s.capWaste, L.waste.x - 12, capY);
    const aw = Math.round(L.wt * 0.62);
    s.arrow.style.width = s.arrow.style.height = aw + 'px';
    s.arrow.hidden = L.corner;
    place(s.arrow, L.TW / 2 - aw / 2, L.stock.y + L.ht / 2 - aw / 2);
  }

  /* ---------------- Vẽ ---------------- */

  function cardLabel(id, kind) {
    const name = C.cardName(C.fromId(id), kit.i18n.lang);
    return t(kind, { card: name });
  }

  /** Lá cần có trên bàn: id -> { x, y, z, up, pos (chỗ chơi được) | null, talon }. */
  function wanted() {
    const out = new Map();
    game.pyramid.forEach((id, p) => {
      if (!id) return;
      out.set(id, { x: L.pyr[p].x, y: L.pyr[p].y, z: 10 + p, up: true, pos: E.isAvailable(game, p) ? p : null });
    });
    const pile = (arr, base, z0, kind) => {
      arr.forEach((id, i) => {
        const k = arr.length - 1 - i; // 0 = lá trên cùng
        const d = Math.min(k, 2) * 1.5;
        out.set(id, { x: base.x - d, y: base.y - d, z: z0 + i, up: kind === 'waste' || k === 0, pos: k === 0 ? kind : null, talon: true, deep: k > 2 });
      });
    };
    pile(game.stock, L.stock, 100, 'stock');
    pile(game.waste, L.waste, 200, 'waste');
    return out;
  }

  /** Vẽ lại bàn. opts.deal: chia ván mới (lá bay từ chồng rút ra); opts.instant: không hiệu ứng (đổi cỡ khung). */
  function render(opts) {
    const o = opts || {};
    if (!L) applyLayout();
    const want = wanted();
    const dealing = o.deal && !calm();
    if (o.deal) {
      els.forEach((el) => el.remove());
      els.clear();
    }
    // Lá đã bỏ: mờ dần rồi gỡ khỏi trang
    els.forEach((el, id) => {
      if (want.has(id)) return;
      els.delete(id);
      if (calm() || o.instant || el.dataset.dragged) return el.remove();
      el.classList.add('kt-out');
      el.removeAttribute('data-pos');
      el.removeAttribute('data-drop');
      setTimeout(() => el.remove(), 320);
    });
    // Ô nhận Tab (roving tabindex): con trỏ bàn phím, chưa có thì lá chơi được đầu tiên
    const tabKey = posKey(cursor != null && E.isAvailable(game, cursor) ? cursor : E.available(game)[0]);
    let n = 0;
    want.forEach((w, id) => {
      let el = els.get(id);
      const fresh = !el;
      const order = n++;
      if (fresh) {
        el = C.render(C.fromId(id), { faceUp: w.up });
        el.classList.add('kt-card');
        els.set(id, el);
        if (dealing) {
          // Bắt đầu ở chồng rút, úp, rồi bay về chỗ theo thứ tự chia
          el.classList.remove('pnc-up');
          place(el, L.stock.x, L.stock.y);
          el.style.opacity = '0';
          el.style.transitionDelay = order * 16 + 'ms';
        } else if (!o.instant && !calm()) {
          el.classList.add('kt-in'); // lá quay lại sau khi hoàn tác
        }
        table.appendChild(el);
      }
      el.classList.toggle('kt-talon', !!w.talon);
      el.classList.toggle('kt-deep', !!w.deep);
      el.style.zIndex = w.z;
      if (dealing && fresh) {
        const up = w.up;
        const target = w;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          place(el, target.x, target.y);
          el.style.opacity = '';
          if (up) setTimeout(() => C.flip(el, true, { duration: 220 }), order * 16 + 200);
          setTimeout(() => { el.style.transitionDelay = ''; }, 700);
        }));
      } else {
        if (o.instant) el.classList.add('kt-still');
        place(el, w.x, w.y);
        if (o.instant) requestAnimationFrame(() => el.classList.remove('kt-still'));
        const isUp = el.classList.contains('pnc-up');
        if (w.up !== isUp) {
          // Lá chồng rút vừa lộ ra thì lật lên; quay vòng thì úp ngay
          if (w.up && !fresh && !o.instant) C.flip(el, true, { duration: 240 });
          else el.classList.toggle('pnc-up', w.up);
        }
      }
      // Trạng thái chơi được / đang chọn / gợi ý
      const pos = w.pos;
      const key = pos == null ? null : posKey(pos);
      el.classList.toggle('kt-avail', pos != null && !E.isOver(game));
      el.classList.toggle('kt-covered', pos == null && !w.talon);
      el.classList.toggle('pnc-selected', key != null && key === posKey(selected));
      el.classList.toggle('pnc-highlight', key != null && hintPos.some((h) => posKey(h) === key));
      if (pos != null) {
        el.dataset.pos = key;
        el.dataset.drop = '';
        el.setAttribute('role', 'button');
        el.tabIndex = key === tabKey ? 0 : -1;
        const kind = key === posKey(selected) ? 'card.selected' : pos === 'stock' ? 'card.stock' : pos === 'waste' ? 'card.waste' : 'card.free';
        el.setAttribute('aria-label', cardLabel(id, kind));
      } else {
        el.removeAttribute('data-pos');
        el.removeAttribute('data-drop');
        el.removeAttribute('tabindex');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', w.up ? cardLabel(id, w.talon ? 'card.free' : 'card.covered') : C.cardName(null, kit.i18n.lang));
      }
    });
    renderChrome();
  }

  /** HUD, nút, nhãn chồng, ô chồng rút trống. */
  function renderChrome() {
    const over = E.isOver(game);
    const left = leftInPyramid();
    $('left').textContent = kit.i18n.fmtNumber(left);
    $('pass').textContent = E.pass(game) + '/' + (E.MAX_RECYCLES + 1);
    $('time').textContent = fmt(clock.elapsed());
    table.setAttribute('aria-label', t('board.label', { n: left }));

    const undo = $('btn-undo');
    undo.disabled = !E.canUndo(game);
    $('undo-left').textContent = game.undoLeft;
    undo.title = t('btn.undoLong', { n: game.undoLeft });
    $('btn-hint').disabled = over;

    const draw = $('btn-draw');
    const recycle = !game.stock.length && E.canRecycle(game);
    draw.classList.toggle('is-recycle', recycle);
    $('draw-label').textContent = t(recycle ? 'btn.recycle' : 'btn.draw');
    draw.title = recycle ? t('btn.recycleLong', { n: E.passesLeft(game) }) : t('btn.drawLong');
    draw.disabled = over || !(E.canDraw(game) || E.canRecycle(game));
    draw.classList.toggle('kt-pulse', hintPos.indexOf('draw') >= 0);

    const s = slots;
    s.capStock.textContent = t('pile.stock') + ' ' + game.stock.length;
    s.capWaste.textContent = t('pile.waste') + ' ' + game.waste.length;
    s.stockSlot.classList.toggle('can-recycle', recycle && !over);
    s.stockSlot.querySelector('.kt-recycle-n').textContent = E.passesLeft(game);
    s.stockSlot.setAttribute('aria-label', recycle ? t('slot.recycle', { n: E.passesLeft(game) }) : t('slot.empty'));
    s.stockSlot.setAttribute('role', recycle ? 'button' : 'img');
    s.arrow.disabled = over || !E.canDraw(game);
    s.arrow.setAttribute('aria-label', t('btn.drawLong'));
    s.arrow.classList.toggle('kt-pulse', hintPos.indexOf('draw') >= 0);
  }

  let tick = 0;
  function startTicking() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (clock.running) $('time').textContent = fmt(clock.elapsed());
    }, 500);
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const left = game ? leftInPyramid() : E.PYRAMID;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played === 0 ? t('summary.none') : t('summary.note', { won: kit.i18n.fmtNumber(stats.won), played: kit.i18n.fmtNumber(stats.played) }),
      stats: stats.played > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(stats.best == null ? [] : [{ value: fmt(stats.best), label: t('stats.best') }])
        : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { n: left }), pct: (E.PYRAMID - left) / E.PYRAMID } : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function clearHint() {
    clearTimeout(hintTimer);
    hintPos = [];
  }

  function newDeal() {
    clearTimeout(endTimer);
    clearHint();
    game = E.newGame();
    selected = null;
    cursor = null;
    finished = false;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    render({ deal: true });
    kit.sfx('start');
    writeSummary();
  }

  /** Sau mỗi nước: âm thanh, vẽ lại, lưu, kiểm thắng / thua. */
  function commit(next, sfx) {
    if (next === game) return false;
    game = next;
    selected = null;
    clearHint();
    clock.resume();
    if (cursor != null && !E.isAvailable(game, cursor)) cursor = null;
    render();
    if (E.isWon(game)) finish(true);
    else if (E.isStuck(game)) finish(false);
    else {
      if (sfx) kit.sfx(sfx);
      persist();
    }
    return true;
  }

  /** Bỏ lá: một lá K hoặc cặp tổng 13. */
  function removeCards(a, b) {
    const next = E.remove(game, a, b);
    if (next === game) return false;
    return commit(next, b != null ? 'capture' : 'clear');
  }

  function draw() {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    if (E.canDraw(game)) commit(E.draw(game), 'flip');
    else if (E.canRecycle(game)) commit(E.recycle(game), 'move');
  }

  function recycle() {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    commit(E.recycle(game), 'move');
  }

  function undo() {
    if (!game || kit.modal.current()) return;
    if (!E.canUndo(game)) {
      if (!E.isOver(game) && game.undoLeft === 0 && game.moves > 0) kit.toast(t('toast.noUndo'));
      return;
    }
    game = E.undo(game);
    selected = null;
    clearHint();
    kit.sfx('move');
    render();
    persist();
  }

  /** Chạm một lá ở vị trí pos (đã chơi được). */
  function tap(pos) {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    if (!E.isAvailable(game, pos)) return;
    cursor = pos;
    if (E.canRemove(game, pos)) {
      removeCards(pos);
      return;
    }
    if (selected == null || !E.isAvailable(game, selected)) {
      selected = pos;
      kit.sfx('tap');
    } else if (posKey(selected) === posKey(pos)) {
      selected = null;
      kit.sfx('tap');
    } else if (E.canPair(game, selected, pos)) {
      removeCards(selected, pos);
      return;
    } else {
      // Không đủ 13: lá cũ lắc nhẹ, chọn lá mới
      const old = elAt(selected);
      if (old && !calm()) {
        old.classList.remove('kt-nope');
        void old.offsetWidth;
        old.classList.add('kt-nope');
      }
      selected = pos;
      kit.sfx('error');
    }
    render();
  }

  function elAt(pos) {
    if (pos == null) return null;
    return table.querySelector('.pnc[data-pos="' + posKey(pos) + '"]');
  }

  function hint() {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    const h = E.hint(game);
    game = E.markAssisted(game);
    clearHint();
    selected = null;
    const m = h.move;
    if (!h.solvable && h.solvable !== null) kit.toast(t('toast.lost'), 2600);
    if (m && m.type === 'pair') {
      hintPos = m.b == null ? [m.a] : [m.a, m.b];
      if (h.solvable !== false) kit.toast(t(m.b == null ? 'toast.kingHint' : 'toast.pairHint'));
    } else if (m) {
      hintPos = ['draw'];
      if (h.solvable !== false) kit.toast(t(m.type === 'recycle' ? 'toast.recycleHint' : 'toast.drawHint'));
    }
    kit.sfx('pop');
    hintTimer = setTimeout(() => {
      hintPos = [];
      if (game) render();
    }, 3000);
    render();
    persist();
  }

  function finish(won) {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    let best = false;
    stats.played++;
    if (won) {
      stats.won++;
      stats.streak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      if (!game.assisted && (stats.best == null || ms < stats.best)) {
        stats.best = ms;
        best = true;
      }
    } else {
      stats.streak = 0;
    }
    saveStats();
    persist();
    finished = true;
    kit.sdk.end({ mode: MODE, won, timeMs: ms, assisted: game.assisted });
    if (won) {
      kit.sfx('win');
      kit.confetti();
      $('win-time').textContent = t('win.time', { time: fmt(ms) });
      const badge = $('win-badge');
      badge.hidden = !(best || game.assisted);
      badge.textContent = game.assisted ? t('win.assisted') : t('win.best');
      badge.classList.toggle('good', best);
    } else {
      kit.sfx('lose');
      const n = leftInPyramid();
      $('lose-text').textContent = t('lose.text', { n });
    }
    endTimer = setTimeout(() => {
      if (game && E.isOver(game)) kit.modal.open(won ? 'modal-win' : 'modal-lose');
    }, calm() ? 0 : won ? 650 : 450);
  }

  /** Ván đang dở (đã đi ít nhất một nước) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else {
      kit.modal.closeAll();
      newDeal();
    }
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay() && !finished) {
      stats.played++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted: game.assisted });
    }
    newDeal();
  }

  function onSetting(key, value) {
    if (key === 'fourColor') document.documentElement.classList.toggle('cards-4color', !!value);
  }

  /* ---------------- Sự kiện ---------------- */

  table.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && table.contains(act)) {
      if (act.dataset.act === 'draw') draw();
      else if (act.dataset.act === 'recycle' && act.classList.contains('can-recycle')) recycle();
      return;
    }
    const card = e.target.closest('.pnc[data-pos]');
    if (card) tap(parsePos(card.dataset.pos));
    else if (selected != null) {
      selected = null;
      render();
    }
  });

  // Tab tới lá nào thì con trỏ bàn phím theo lá đó
  table.addEventListener('focusin', (e) => {
    const card = e.target.closest && e.target.closest('.pnc[data-pos]');
    if (card) cursor = parsePos(card.dataset.pos);
  });

  // Kéo lá này thả lên lá kia để ghép (chạm vẫn là cách chính)
  C.drag(table, {
    canPick: (el) => !!game && !E.isOver(game) && !kit.modal.current() && el.dataset.pos != null && E.isAvailable(game, parsePos(el.dataset.pos)),
    canDrop: (el, target) => target !== el && target.dataset.pos != null && E.canPair(game, parsePos(el.dataset.pos), parsePos(target.dataset.pos)),
    onStart: () => {
      if (selected != null) {
        selected = null;
        render();
      }
    },
    onDrop: (el, target) => {
      el.dataset.dragged = '1'; // lá kéo biến mất ngay, lá đích mờ dần
      if (removeCards(parsePos(el.dataset.pos), parsePos(target.dataset.pos))) return true;
      delete el.dataset.dragged;
      return false;
    },
    onCancel: () => kit.sfx('error'),
  });

  $('btn-draw').addEventListener('click', draw);
  $('btn-undo').addEventListener('click', undo);
  $('btn-hint').addEventListener('click', hint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newDeal();
  });
  $('btn-retry').addEventListener('click', () => {
    kit.modal.close('modal-lose');
    newDeal();
  });
  $('btn-stats').addEventListener('click', () => {
    const f = kit.i18n.fmtNumber;
    $('stats-played').textContent = f(stats.played);
    $('stats-won').textContent = f(stats.won);
    $('stats-rate').textContent = stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–';
    $('stats-best').textContent = stats.best == null ? '–' : fmt(stats.best);
    $('stats-streak').textContent = f(stats.streak);
    $('stats-best-streak').textContent = f(stats.bestStreak);
  });

  /** Con trỏ bàn phím: chọn lá chơi được gần nhất theo hướng mũi tên (theo vị trí trên bàn). */
  function center(pos) {
    if (pos === 'stock' || pos === 'waste') {
      const b = L[pos];
      return { x: b.x + L.wt / 2, y: b.y + L.ht / 2 };
    }
    return { x: L.pyr[pos].x + L.w / 2, y: L.pyr[pos].y + L.h / 2 };
  }
  function moveCursor(dx, dy) {
    const av = E.available(game);
    if (!av.length) return;
    if (cursor == null || !E.isAvailable(game, cursor)) {
      cursor = av.filter((p) => typeof p === 'number')[0];
      if (cursor == null) cursor = av[0];
    } else {
      const c = center(cursor);
      let best = null;
      let bestScore = Infinity;
      av.forEach((p) => {
        if (posKey(p) === posKey(cursor)) return;
        const q = center(p);
        const vx = q.x - c.x;
        const vy = q.y - c.y;
        const prim = dx ? vx * dx : vy * dy;
        if (prim <= 2) return;
        const score = prim + 2.5 * (dx ? Math.abs(vy) : Math.abs(vx));
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      });
      if (best != null) cursor = best;
    }
    render();
    const el = elAt(cursor);
    if (el) el.focus({ preventScroll: true });
  }

  const ARROWS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      undo();
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const onCard = !!(e.target.closest && e.target.closest('.pnc[data-pos]'));
    const onOtherButton = !onCard && e.target.closest && e.target.closest('button, input, a[href]');
    if (ARROWS[k]) moveCursor(ARROWS[k][0], ARROWS[k][1]);
    else if (k === ' ' || k === 'enter') {
      if (onOtherButton) return; // để trình duyệt bấm nút đang focus
      if (cursor == null || !E.isAvailable(game, cursor)) moveCursor(1, 0);
      else {
        tap(cursor);
        // Lá vừa bỏ thì con trỏ sang lá chơi được khác
        if (!E.isOver(game) && (cursor == null || !E.isAvailable(game, cursor))) moveCursor(1, 0);
        const el = elAt(cursor);
        if (el) el.focus({ preventScroll: true });
      }
    } else if (k === 'd') draw();
    else if (k === 'u') undo();
    else if (k === 'h') hint();
    else if (k === 'n') requestNew();
    else if (k === 'escape' && selected != null) {
      selected = null;
      render();
    } else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && game) renderChrome(); });

  // Đổi cỡ khung: tính lại bố cục, đặt lá ngay (không trượt)
  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (!game) return;
      const prev = L;
      const next = computeLayout();
      if (prev && prev.w === next.w && prev.corner === next.corner && Math.abs(prev.TH - next.TH) < 1) return;
      applyLayout();
      render({ instant: true });
    });
  };
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  buildSlots();
  applyLayout();
  startTicking();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isOver(restored)) {
    game = restored;
    clock.set(saved.elapsed);
    kit.sdk.start(MODE, true);
    render({ instant: true });
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    newDeal();
  }
})();
