/* =====================================================================
 * Ô Trống (FreeCell) - Giao diện + luồng ván (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   - 52 lá vẽ bằng bộ bài chung (PNCards.render), đặt tuyệt đối trên bàn bằng transform; cỡ lá tính theo khung
 *   - Chạm lá: tự tìm chỗ (đích -> cột -> cột trống -> ô trống); kéo thả bằng PNCards.drag; bàn phím 1-8 / QWER / F
 *   - Gợi ý: solver của engine chạy từng phần bằng setTimeout (không chặn giao diện); dùng gợi ý thì ván tính assisted
 *   - Báo ván cho cổng (metric time_low, mode classic):
 *     ván mới kit.sdk.start(MODE); mở lại ván dở kit.sdk.start(MODE, true);
 *     thắng kit.sdk.end({ mode, won: true, timeMs, assisted }); bỏ ván đã đi ít nhất một nước: won false
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const P = window.PNCards;
  const MODE = 'classic';
  const F_ORDER = [3, 2, 1, 0]; // ô đích hiển thị từ trái sang: ♠ ♥ ♦ ♣ (chất theo engine: C D H S)
  const kit = PNKit.init({
    gameId: 'otrong',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { auto: true, fourColor: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null; // ván của engine
  let touched = false; // đã đi ít nhất một nước trong ván này (bỏ ván thì tính thua)
  let assisted = false; // đã dùng gợi ý
  let finished = false;
  let sel = null; // { from, n }: chồng đang nhấc bằng bàn phím
  let hint = null; // { move, timer }
  let pending = null; // ván muốn chơi sau khi xác nhận bỏ ván hiện tại
  let solveGen = 0; // tăng mỗi lần ván đổi: lượt giải cũ tự dừng
  let solving = false;
  const plan = new Map(); // khóa trạng thái -> nước kế tiếp của lời giải gần nhất

  const stats = loadStats();

  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    return {
      played: num(raw.played),
      won: num(raw.won),
      best: Number.isFinite(raw.best) && raw.best > 0 ? raw.best : null,
      streak: num(raw.streak),
      bestStreak: num(raw.bestStreak),
    };
  }
  const saveStats = () => kit.store.write(keys.stats, stats);

  /** m:ss (giờ thì h:mm:ss). */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  const cardName = (c) => P.cardName(E.toCard(c), kit.i18n.lang);
  function announce(msg) {
    const el = $('live');
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = msg; });
  }

  /* ================= Bàn chơi: dựng phần tử ================= */
  const wrapEl = $('table-wrap');
  const tableEl = $('table');
  const cardEls = [];
  const zoneEls = {};
  const PILES = ['c0', 'c1', 'c2', 'c3'].concat(F_ORDER.map((f) => 'f' + f), ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);

  function buildTable() {
    const frag = document.createDocumentFragment();
    PILES.forEach((id) => {
      let el;
      if (id[0] === 't') {
        el = document.createElement('div');
        el.className = 'zone zone-col';
        el.appendChild(P.slot({ className: 'col-slot' }));
      } else if (id[0] === 'c') {
        el = P.slot({ className: 'zone zone-cell' });
      } else {
        const suit = E.SUIT_CH[+id[1]];
        el = P.slot({ label: P.suitSymbol(suit), className: 'zone zone-found pnc-s-' + suit });
      }
      el.dataset.drop = id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      zoneEls[id] = el;
      frag.appendChild(el);
    });
    for (let c = 0; c < 52; c++) {
      const el = P.render(E.toCard(c), { className: 'card' });
      el.dataset.c = c;
      el._x = null;
      el._y = null;
      cardEls[c] = el;
      frag.appendChild(el);
    }
    tableEl.appendChild(frag);
  }

  /* ================= Bố cục: cỡ lá theo khung ================= */
  let lay = null; // { W, H, cw, ch, gap, x0, tabY, off }
  let pos = []; // vị trí từng lá: { x, y, z, pile, idx }
  const colX = (i) => lay.x0 + i * (lay.cw + lay.gap);
  const topX = (id) => (id[0] === 'c' ? colX(+id[1]) : colX(4 + F_ORDER.indexOf(+id[1])));

  function layout() {
    const W = tableEl.clientWidth;
    const H = tableEl.clientHeight;
    if (!W || !H) return false;
    // Bề ngang: 8 cột + 7 khe; bề dọc: hàng trên + khe + cột 13 lá lệch 0,4 bề rộng lá
    let gap = Math.max(3, Math.min(12, Math.round(W * 0.012)));
    let cw = Math.floor(Math.min((W - 7 * gap) / 8, H / 7.4, 112));
    cw = Math.max(cw, 26);
    gap = Math.max(gap, Math.min(Math.floor((W - 8 * cw) / 7), Math.round(cw * 0.22)));
    const ch = Math.round(cw * 1.4);
    const x0 = Math.max(0, Math.floor((W - (8 * cw + 7 * gap)) / 2));
    const tabY = ch + Math.max(8, Math.round(ch * 0.16));
    // độ lệch mặc định: rộng rãi để dễ chạm, nhưng cột 16 lá vẫn vừa
    const off = Math.max(cw * 0.36, Math.min(ch * 0.5, (H - tabY - ch - 2) / 15));
    lay = { W, H, cw, ch, gap, x0, tabY, off };
    tableEl.style.setProperty('--card-w', cw + 'px');
    PILES.forEach((id) => {
      const el = zoneEls[id];
      if (id[0] === 't') {
        el.style.transform = 'translate(' + colX(+id[1]) + 'px,' + tabY + 'px)';
        el.style.width = cw + 'px';
        el.style.height = Math.max(ch, H - tabY) + 'px';
      } else {
        el.style.transform = 'translate(' + topX(id) + 'px,0px)';
      }
    });
    return true;
  }

  /** Độ lệch giữa các lá trong cột n lá: co lại khi cột dài hơn chỗ trống. */
  function colOffset(n) {
    if (n < 2) return lay.off;
    const avail = Math.max(0, lay.H - lay.tabY - lay.ch - 2);
    return Math.min(lay.off, avail / (n - 1));
  }

  function computePositions(s) {
    const out = new Array(52);
    s.cells.forEach((c, i) => {
      if (c >= 0) out[c] = { x: colX(i), y: 0, z: 5, pile: 'c' + i, idx: 0 };
    });
    s.found.forEach((top, f) => {
      for (let r = 1; r <= top; r++) out[(r - 1) * 4 + f] = { x: topX('f' + f), y: 0, z: 5 + r, pile: 'f' + f, idx: r - 1 };
    });
    s.cols.forEach((col, i) => {
      const off = colOffset(col.length);
      col.forEach((c, j) => { out[c] = { x: colX(i), y: Math.round(lay.tabY + j * off), z: 20 + j, pile: 't' + i, idx: j }; });
    });
    return out;
  }

  /* ================= Vẽ ================= */
  const liftTimers = [];

  /**
   * Đặt 52 lá vào chỗ. o.instant: không hiệu ứng; o.delays: Map lá -> độ trễ (ms) để các lá bay lần lượt;
   * o.still: Set lá đặt ngay không bay (lá vừa kéo thả).
   */
  function render(o) {
    if (!game || !lay) return;
    const opt = o || {};
    pos = computePositions(game);
    const ms = opt.instant || reduced() ? 0 : 200;
    const selSet = new Set(selectedCards());
    const hintSet = new Set(hint ? E.pile(game, hint.move.f).slice(-hint.move.n) : []);
    for (let c = 0; c < 52; c++) {
      const p = pos[c];
      const el = cardEls[c];
      const moved = el._x !== p.x || el._y !== p.y;
      const still = opt.still && opt.still.has(c);
      const delay = (opt.delays && opt.delays.get(c)) || 0;
      clearTimeout(liftTimers[c]);
      if (moved) {
        el.style.transitionDuration = still ? '0ms' : ms + 'ms';
        el.style.transitionDelay = ms && !still ? delay + 'ms' : '0ms';
        el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        el._x = p.x;
        el._y = p.y;
      }
      // Lá đang bay nằm trên mọi lá khác, bay xong thì về đúng tầng
      if (moved && ms && !still) {
        el.style.zIndex = 300 + p.z;
        liftTimers[c] = setTimeout(() => { el.style.zIndex = p.z; }, ms + delay + 40);
      } else {
        el.style.zIndex = p.z;
      }
      el.classList.toggle('pnc-selected', selSet.has(c));
      el.classList.toggle('pnc-highlight', hintSet.has(c));
    }
    renderZones();
    renderHud();
  }

  function selectedCards() {
    if (!sel) return [];
    return E.pile(game, sel.from).slice(-sel.n);
  }

  function zoneLabel(id) {
    const i = +id[1];
    const cards = E.pile(game, id);
    if (id[0] === 'c') return cards.length ? t('zone.cell', { i: i + 1, card: cardName(cards[0]) }) : t('zone.cellEmpty', { i: i + 1 });
    if (id[0] === 'f') {
      const suit = t('suit.' + E.SUIT_CH[i]);
      return cards.length ? t('zone.found', { suit, card: cardName(cards[cards.length - 1]) }) : t('zone.foundEmpty', { suit });
    }
    if (!cards.length) return t('zone.colEmpty', { i: i + 1 });
    return t('zone.col', { i: i + 1, n: cards.length, cards: cards.slice().reverse().map(cardName).join(', ') });
  }

  function renderZones() {
    const can = new Set();
    if (sel) {
      PILES.forEach((id) => {
        if (id !== sel.from && moveTo(sel, id)) can.add(id);
      });
    }
    PILES.forEach((id) => {
      const el = zoneEls[id];
      el.setAttribute('aria-label', zoneLabel(id));
      el.classList.toggle('is-target', can.has(id));
      el.classList.toggle('is-hint', !!hint && hint.move.t === id);
    });
  }

  let shownSec = -1;
  function renderTime() {
    const ms = clock.elapsed();
    const sec = Math.floor(ms / 1000);
    if (sec !== shownSec) {
      shownSec = sec;
      $('time').textContent = fmt(ms);
    }
  }
  function renderHud() {
    renderTime();
    $('moves').textContent = kit.i18n.fmtNumber(game.hist.length);
    $('deal').textContent = '#' + game.deal;
    $('btn-undo').disabled = finished || !game.hist.length;
    $('btn-hint').disabled = finished;
    $('btn-hint').classList.toggle('busy', solving);
    $('hint-label').textContent = t(solving ? 'btn.thinking' : 'btn.hint');
    $('btn-finish').hidden = finished || !E.canFinish(game);
  }
  setInterval(() => { if (game && clock.running) renderTime(); }, 250);

  /** Lá rung + tiếng báo khi không đi được. */
  function nope(cards) {
    kit.sfx('error');
    (cards || []).forEach((c) => {
      const el = cardEls[c];
      el.classList.remove('shake');
      void el.offsetWidth; // chạy lại hiệu ứng
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 400);
    });
  }

  /* ================= Lưu ================= */
  function writeSummary() {
    const inPlay = game && touched && !finished;
    const rate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    const list = [];
    if (stats.best != null) list.push({ value: fmt(stats.best), label: t('stats.best') });
    if (stats.played) list.push({ value: rate + '%', label: t('stats.rate') });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.best == null ? t('summary.none') : t('summary.note', { time: fmt(stats.best) }),
      stats: list,
      resume: inPlay ? { title: t('summary.resume', { n: game.deal }), detail: t('summary.resumeDetail', { n: E.foundCount(game) }), pct: E.foundCount(game) / 52 } : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (game && touched && !finished) {
      kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()), assisted });
    } else {
      kit.store.remove(keys.save);
    }
    writeSummary();
  }

  /* ================= Luồng ván ================= */
  function startDeal(n) {
    game = E.newGame(n);
    touched = false;
    assisted = false;
    finished = false;
    sel = null;
    clearHint();
    cancelSolve();
    plan.clear();
    clock.reset();
    shownSec = -1;
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    kit.sfx('start');
    dealAnimation();
    writeSummary();
  }

  /** Chia bài: lá bay từ giữa hàng trên xuống từng cột lần lượt (tắt khi giảm chuyển động). */
  function dealAnimation() {
    if (!lay) return;
    if (reduced()) {
      render({ instant: true });
      return;
    }
    const x = Math.round((lay.W - lay.cw) / 2);
    cardEls.forEach((el) => {
      el.style.transitionDuration = '0ms';
      el.style.transitionDelay = '0ms';
      el.style.transform = 'translate(' + x + 'px,0px)';
      el._x = x;
      el._y = 0;
    });
    void tableEl.offsetWidth;
    const delays = new Map();
    game.cols.forEach((col, i) => col.forEach((c, j) => delays.set(c, (j * 8 + i) * 12)));
    render({ delays });
  }

  /** Ván đang dở (đã đi) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestDeal(n) {
    if (touched && !finished) {
      pending = n;
      kit.modal.open('modal-confirm');
    } else {
      startDeal(n);
      kit.toast(t('toast.deal', { n }));
    }
  }

  function abandon() {
    if (!touched || finished) return;
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted });
  }

  /** Nước của người chơi (kèm tự lên đích theo cài đặt). Sai luật trả false. */
  function doMove(m, o) {
    if (finished || !game) return false;
    const before = game;
    const next = E.play(game, m, { auto: kit.settings.get().auto !== false });
    if (!next) return false;
    game = next;
    afterMove(before, game.hist[game.hist.length - 1], o || {});
    return true;
  }

  /** Xếp nốt: đưa hết lá lên đích thành một nhóm, lá bay lần lượt. */
  function finishAll() {
    if (finished || !game || !E.canFinish(game)) return;
    const moves = E.finishMoves(game);
    const next = moves && E.playGroup(game, moves);
    if (!next) return;
    const before = game;
    game = next;
    afterMove(before, moves, { stagger: true });
  }

  /** Sau mỗi nhóm nước: hiệu ứng, âm thanh, đồng hồ, lưu, kiểm tra thắng / kẹt. */
  function afterMove(before, group, o) {
    sel = null;
    clearHint(true);
    cancelSolve();
    touched = true;
    clock.resume(); // đồng hồ chạy từ nước đầu tiên
    // lá của từng nước trong nhóm: nước đầu bay ngay (hoặc đặt ngay nếu vừa kéo thả), các nước sau bay lần lượt
    const delays = new Map();
    const still = new Set();
    let x = before;
    group.forEach((mv, i) => {
      const cards = E.pile(x, mv.f).slice(-mv.n);
      cards.forEach((c) => {
        if (i === 0 && o.instant) still.add(c);
        else delays.set(c, o.stagger ? i * 45 : i ? 120 + (i - 1) * 70 : 0);
      });
      x = E.move(x, mv) || x;
    });
    const home = group.some((mv) => mv.t[0] === 'f');
    kit.sfx(group[0].t[0] === 'f' || (home && group.length > 1) ? 'coin' : group[0].t[0] === 'c' ? 'move' : 'place');
    render({ delays, still });
    const first = group[0];
    announce(t('say.moved', { card: cardName(E.pile(before, first.f).slice(-first.n)[0]), dest: destName(first.t) }));
    if (E.isWon(game)) {
      win(o.stagger ? group.length * 45 + 250 : 400 + group.length * 70);
      return;
    }
    persist();
    if (!E.legalMoves(game).length) kit.toast(t('toast.stuck'), 2600);
  }

  function destName(id) {
    if (id[0] === 'c') return t('dest.cell');
    if (id[0] === 'f') return t('dest.found');
    return t('dest.col', { i: +id[1] + 1 });
  }

  function undo() {
    if (finished || !game) return;
    if (!game.hist.length) {
      kit.toast(t('toast.nothingToUndo'));
      return;
    }
    game = E.undo(game);
    sel = null;
    clearHint(true);
    cancelSolve();
    kit.sfx('move');
    render();
    persist();
    announce(t('say.undo'));
  }

  function win(delay) {
    finished = true;
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const best = !assisted && (stats.best == null || ms < stats.best);
    stats.played++;
    stats.won++;
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    if (best) stats.best = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won: true, timeMs: ms, assisted });
    renderHud();
    $('win-time').textContent = fmt(ms);
    $('win-moves').textContent = kit.i18n.fmtNumber(game.hist.length);
    $('win-deal').textContent = '#' + game.deal;
    $('win-best').hidden = !best;
    $('win-assisted').hidden = !assisted;
    tableEl.classList.add('won');
    setTimeout(() => {
      kit.sfx('win');
      kit.confetti();
      if (finished) kit.modal.open('modal-win');
    }, reduced() ? 0 : delay);
  }

  /* ================= Gợi ý ================= */
  function clearHint(silent) {
    if (!hint) return;
    clearTimeout(hint.timer);
    hint = null;
    if (!silent) render();
  }

  function cancelSolve() {
    solveGen++;
    if (solving) {
      solving = false;
      if (game) renderHud();
    }
  }

  function showHint(m) {
    assisted = true;
    clearTimeout(hint && hint.timer);
    hint = { move: m, timer: setTimeout(() => clearHint(), 4000) };
    kit.sfx('pop');
    render();
    persist();
    const c = E.pile(game, m.f).slice(-m.n)[0];
    announce(t('say.hint', { card: cardName(c), dest: destName(m.t) }));
  }

  /** Ghi lời giải thành bảng: trạng thái -> nước kế tiếp (đi theo gợi ý thì lần sau trả lời ngay). */
  function buildPlan(start, moves) {
    plan.clear();
    let x = start;
    for (let i = 0; i < moves.length && x; i++) {
      plan.set(E.exactKey(x), moves[i]);
      x = E.move(x, moves[i]);
    }
  }

  function requestHint() {
    if (finished || !game || solving || kit.modal.current()) return;
    sel = null;
    const known = plan.get(E.exactKey(game));
    if (known && E.canMove(game, known)) {
      showHint(known);
      return;
    }
    const start = game;
    const gen = ++solveGen;
    const sv = E.createSolver(start);
    solving = true;
    renderHud();
    const tick = () => {
      if (gen !== solveGen) return;
      const t0 = performance.now();
      let r;
      do {
        r = sv.step(300);
      } while (!r.done && performance.now() - t0 < 14);
      if (!r.done) {
        setTimeout(tick, 0);
        return;
      }
      solving = false;
      renderHud();
      if (!r.moves) {
        kit.toast(t('toast.noHint'), 2600);
        return;
      }
      buildPlan(start, r.moves);
      const m = plan.get(E.exactKey(game));
      if (m) showHint(m);
    };
    setTimeout(tick, 0);
  }

  /* ================= Chạm, kéo thả ================= */

  /** Số lá đi cùng khi cầm lá c (lá c và các lá phía trên), 0 nếu không cầm được. */
  function grabCount(c) {
    const p = pos[c];
    if (!p || p.pile[0] === 'f') return 0;
    if (p.pile[0] === 'c') return 1;
    const col = game.cols[+p.pile[1]];
    const n = col.length - p.idx;
    return n <= E.runLength(col) ? n : 0;
  }

  /** Báo vì sao không đi được: quá số lá được chuyển, hoặc không có chỗ. */
  function explainFail(from, n) {
    if (n > 1 && n > E.maxMove(game, false)) kit.toast(t('toast.tooMany', { n: E.maxMove(game, false) }));
    else kit.toast(t('toast.noMove'));
  }

  function tapCard(c) {
    if (finished || !game) return;
    const p = pos[c];
    if (sel) {
      place(p.pile);
      return;
    }
    const n = grabCount(c);
    if (!n) {
      if (p.pile[0] !== 'f') nope([c]);
      return;
    }
    // đang có gợi ý cho đúng nhóm này thì đi theo gợi ý
    if (hint && hint.move.f === p.pile && hint.move.n === n) {
      doMove(hint.move);
      return;
    }
    const m = E.tapTarget(game, p.pile, n);
    if (m) doMove(m);
    else {
      nope(E.pile(game, p.pile).slice(-n));
      explainFail(p.pile, n);
    }
  }

  tableEl.addEventListener('click', (e) => {
    if (kit.modal.current()) return;
    const cardEl = e.target.closest('.card');
    if (cardEl) {
      tapCard(+cardEl.dataset.c);
      return;
    }
    const z = e.target.closest('.zone');
    if (z && sel) place(z.dataset.drop);
  });

  P.drag(tableEl, {
    cards: '.card',
    canPick: (el) => {
      if (finished || !game || kit.modal.current()) return false;
      const c = +el.dataset.c;
      const n = grabCount(c);
      if (!n) return false;
      return E.pile(game, pos[c].pile).slice(-n).map((x) => cardEls[x]);
    },
    canDrop: (el, target, els) => E.canMove(game, { f: pos[+el.dataset.c].pile, t: target.dataset.drop, n: els.length }),
    onStart: () => {
      if (sel) {
        sel = null;
        render();
      }
    },
    onDrop: (el, target, els) => doMove({ f: pos[+el.dataset.c].pile, t: target.dataset.drop, n: els.length }, { instant: true }),
  });

  /* ================= Bàn phím ================= */

  /** Nước đưa nhóm đang nhấc sang chồng `to` (ô đích: theo chất của lá), null nếu không hợp luật. */
  function moveTo(s, to) {
    const src = E.pile(game, s.from);
    if (!src.length) return null;
    let m;
    if (to[0] === 'f') m = { f: s.from, t: 'f' + E.suitOf(src[src.length - 1]), n: 1 };
    else if (to[0] === 'c') m = { f: s.from, t: to, n: 1 };
    else {
      const dst = game.cols[+to[1]];
      const n = dst.length ? E.rankOf(dst[dst.length - 1]) - E.rankOf(src[src.length - 1]) : Math.min(s.n, E.maxMove(game, true));
      m = { f: s.from, t: to, n };
    }
    return m.n >= 1 && m.n <= s.n && E.canMove(game, m) ? m : null;
  }

  /** Nước tự động cho chồng from: lên đích, rồi dãy dài nhất sang cột có lá, rồi như khi chạm lá trên cùng. */
  function autoFor(from) {
    const run = from[0] === 't' ? E.runLength(game.cols[+from[1]]) : 1;
    const one = E.tapTarget(game, from, 1);
    if (one && one.t[0] === 'f') return one;
    for (let n = run; n >= 1; n--) {
      const m = E.tapTarget(game, from, n);
      if (m && m.t[0] === 't' && game.cols[+m.t[1]].length) return m;
    }
    for (let n = run; n >= 2; n--) {
      const m = E.tapTarget(game, from, n);
      if (m) return m;
    }
    return one;
  }

  /** Chọn chồng bằng phím / Enter: lần đầu nhấc, lần sau đặt (chọn lại chính nó thì lá tự đi). */
  function keyPile(id) {
    if (finished || !game) return;
    clearHint(true);
    if (!sel) {
      if (id[0] === 'f') return;
      const src = E.pile(game, id);
      if (!src.length) {
        kit.sfx('error');
        return;
      }
      const n = id[0] === 't' ? E.runLength(game.cols[+id[1]]) : 1;
      sel = { from: id, n };
      kit.sfx('tap');
      render();
      announce(t('say.selected', { n, more: n - 1, card: cardName(src[src.length - n]) }));
      return;
    }
    place(id);
  }

  function place(id) {
    const s = sel;
    sel = null;
    let m = null;
    if (id === s.from) m = autoFor(s.from);
    else m = moveTo(s, id);
    if (m && doMove(m)) return;
    nope(E.pile(game, s.from).slice(-s.n));
    if (id === s.from) kit.toast(t('toast.noMove'));
    else if (id[0] === 't' && game.cols[+id[1]].length) {
      const dst = game.cols[+id[1]];
      const src = E.pile(game, s.from);
      const need = E.rankOf(dst[dst.length - 1]) - E.rankOf(src[src.length - 1]);
      if (need > 1 && need <= s.n && need > E.maxMove(game, false)) kit.toast(t('toast.tooMany', { n: E.maxMove(game, false) }));
    }
    render();
  }

  function cancelSel() {
    if (!sel) return false;
    sel = null;
    render();
    announce(t('say.cancel'));
    return true;
  }

  const CELL_KEYS = { q: 'c0', w: 'c1', e: 'c2', r: 'c3' };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') {
        e.preventDefault();
        undo();
      }
      return;
    }
    if (k >= '1' && k <= '8') keyPile('t' + (+k - 1));
    else if (CELL_KEYS[k]) keyPile(CELL_KEYS[k]);
    else if (k === 'f') { if (sel) keyPile('f0'); }
    else if (k === 'z' || k === 'u' || k === 'backspace') undo();
    else if (k === 'g') requestHint();
    else if (k === 'a') finishAll();
    else if (k === 'n') requestNew();
    else if (k === 'escape') { if (!cancelSel()) return; }
    else return;
    e.preventDefault();
  });

  // Ô / cột đang có focus: mũi tên chuyển, Enter / Space nhấc hoặc đặt
  const TOP = PILES.slice(0, 8);
  const BOTTOM = PILES.slice(8);
  tableEl.addEventListener('keydown', (e) => {
    const z = e.target.closest && e.target.closest('.zone');
    if (!z || e.altKey || e.ctrlKey || e.metaKey) return;
    const id = z.dataset.drop;
    const row = TOP.indexOf(id) >= 0 ? TOP : BOTTOM;
    const i = row.indexOf(id);
    let next = null;
    if (e.key === 'ArrowLeft') next = row[(i + 7) % 8];
    else if (e.key === 'ArrowRight') next = row[(i + 1) % 8];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') next = (row === TOP ? BOTTOM : TOP)[i];
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      keyPile(id);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    zoneEls[next].focus();
  });

  /* ================= Nút, modal, cài đặt ================= */
  function requestNew() {
    if (kit.modal.current()) return;
    requestDeal(E.randomDeal());
  }

  $('btn-new').addEventListener('click', requestNew);
  $('btn-undo').addEventListener('click', undo);
  $('btn-hint').addEventListener('click', requestHint);
  $('btn-finish').addEventListener('click', finishAll);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    startDeal(E.randomDeal());
  });
  $('btn-confirm-new').addEventListener('click', () => {
    kit.modal.close('modal-confirm');
    abandon();
    startDeal(pending || E.randomDeal());
    kit.toast(t('toast.deal', { n: game.deal }));
    pending = null;
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-rate').textContent = (stats.played ? Math.round((stats.won / stats.played) * 100) : 0) + '%';
    $('stats-best').textContent = stats.best == null ? '–' : fmt(stats.best);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    $('stats-best-streak').textContent = kit.i18n.fmtNumber(stats.bestStreak);
  });
  $('btn-settings').addEventListener('click', () => {
    $('deal-input').value = game ? game.deal : '';
    $('deal-error').hidden = true;
  });
  $('deal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('deal-input').value.trim();
    const n = /^\d+$/.test(raw) ? +raw : NaN;
    if (!E.validDeal(n)) {
      $('deal-error').hidden = false;
      $('deal-input').focus();
      return;
    }
    kit.modal.close('modal-settings');
    requestDeal(n);
  });

  function onSetting(key, value) {
    if (key === 'fourColor') document.documentElement.classList.toggle('cards-4color', !!value);
  }
  document.documentElement.classList.toggle('cards-4color', !!kit.settings.get().fourColor);

  kit.onLeave(persist);
  // Đổi cỡ khung: tính lại cỡ lá, đặt lại ngay không hiệu ứng
  let resizeRaf = 0;
  const relayout = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (layout()) render({ instant: true });
    });
  };
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(wrapEl);
  else window.addEventListener('resize', relayout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && game) renderHud(); });

  /* ================= Khởi động: mở lại ván dở nếu có ================= */
  buildTable();
  layout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && !E.isWon(restored)) {
    game = restored;
    touched = true;
    assisted = saved.assisted === true;
    clock.set(Number(saved.elapsed) || 0);
    clock.resume(); // ván dở: đồng hồ chạy tiếp ngay (không cho tải lại trang để dừng giờ)
    kit.sdk.start(MODE, true);
    render({ instant: true });
    writeSummary();
    kit.toast(t('toast.restored'));
  } else {
    kit.store.remove(keys.save);
    startDeal(E.randomDeal());
  }
})();
