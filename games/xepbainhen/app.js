/* =====================================================================
 * Xếp Bài Nhện - Giao diện + luồng ván (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   - 104 phần tử lá (PNCards.render) đặt tuyệt đối trên .board, vị trí tính lại sau mỗi nước (translate + transition)
 *   - Chạm lá: tự đi tới chỗ tốt nhất (chạm lại: chỗ kế tiếp); kéo thả bằng PNCards.drag; bàn phím: con trỏ cột
 *   - Báo ván cho cổng (metric time_low, mode s1 / s2 / s4):
 *     ván mới kit.sdk.start(mode); mở lại ván dở kit.sdk.start(mode, true);
 *     thắng kit.sdk.end({ mode, won: true, timeMs, assisted }); bỏ ván đã đi ít nhất một nước: won false
 *   - Đi lại không tính là trợ giúp; dùng Gợi ý thì assisted = true
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const P = window.PNCards;
  const MODES = ['s1', 's2', 's4'];
  const SUITS_OF = { s1: 1, s2: 2, s4: 4 };
  const MOVE_MS = 220;
  const kit = PNKit.init({
    gameId: 'xepbainhen',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { mode: 's1', fourColor: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const boardEl = $('board');
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  let game = null; // trạng thái engine
  let assisted = false; // ván này đã dùng Gợi ý
  let finished = false; // ván đã thắng
  let lastTap = null; // lá vừa chạm để tự đi (chạm lại: thử đích kế tiếp)
  let held = null; // chồng đang cầm bằng bàn phím: { col, idx }
  const cursor = { col: 0, idx: -1, on: false }; // con trỏ bàn phím
  let lay = null; // bố cục bàn (cỡ lá, tọa độ cột…)
  let pos = []; // vị trí từng lá sau lần vẽ gần nhất
  let cardEls = [];
  let colEls = [];
  let colSlots = [];
  let foundSlot = null;
  let stockSlot = null;
  let stockCount = null;
  let cursorEl = null;
  let phaseTimer = 0; // vẽ giai đoạn 2 (dãy K→A bay ra ô đích)
  let hintTimer = 0;
  let stuckAt = -1;
  let winFx = null;
  let pendingConfirm = null; // { kind: 'new' } | { kind: 'mode', mode }
  let statsMode = 's1';

  /* ---------------- Thống kê ---------------- */
  const nat = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const out = {};
    MODES.forEach((m) => {
      const b = raw && typeof raw[m] === 'object' && raw[m] ? raw[m] : {};
      out[m] = {
        played: nat(b.played),
        won: Math.min(nat(b.won), nat(b.played)),
        best: Number.isInteger(b.best) && b.best > 0 ? b.best : null,
        bestScore: Number.isInteger(b.bestScore) ? b.bestScore : null,
      };
    });
    return out;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);

  /** m:ss (h:mm:ss nếu quá một giờ). */
  function fmt(ms) {
    const sec = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
  }

  const modeOf = (g) => 's' + g.suits;
  const curMode = () => (game ? modeOf(game) : kit.settings.get().mode);
  const inPlay = () => !!game && game.moves > 0 && !finished;
  const busy = () => !!(winFx && winFx.timer);
  const say = (msg) => { $('say').textContent = msg; };
  const lang = () => kit.i18n.lang;
  const nameOf = (i) => P.cardName(game.cards[i], lang());

  /* ---------------- Dựng bàn ---------------- */

  /** Tạo lại toàn bộ phần tử của bàn cho ván hiện tại (mặt lá mỗi ván mỗi khác). */
  function buildBoard() {
    clearTimeout(phaseTimer);
    boardEl.textContent = '';
    const frag = document.createDocumentFragment();
    colEls = [];
    colSlots = [];
    for (let c = 0; c < E.COLS; c++) {
      const strip = document.createElement('div');
      strip.className = 'col';
      strip.dataset.drop = c;
      strip.dataset.col = c;
      colEls.push(strip);
      frag.appendChild(strip);
      const slot = document.createElement('div');
      slot.className = 'col-slot';
      slot.dataset.col = c;
      slot.appendChild(P.slot({ label: '' }));
      colSlots.push(slot);
      frag.appendChild(slot);
    }
    foundSlot = document.createElement('div');
    foundSlot.className = 'found-slot';
    foundSlot.appendChild(P.slot({ label: 'K' }));
    frag.appendChild(foundSlot);
    stockSlot = document.createElement('div');
    stockSlot.className = 'stock-slot';
    stockSlot.setAttribute('role', 'button');
    stockSlot.appendChild(P.slot({ label: '' }));
    frag.appendChild(stockSlot);
    cardEls = game.cards.map((card, i) => {
      const el = P.render(card, { faceUp: false });
      el.dataset.i = i;
      el._up = false;
      el._x = null;
      el._y = null;
      frag.appendChild(el);
      return el;
    });
    stockCount = document.createElement('div');
    stockCount.className = 'stock-count';
    stockCount.setAttribute('aria-hidden', 'true');
    frag.appendChild(stockCount);
    cursorEl = document.createElement('div');
    cursorEl.className = 'kcursor';
    cursorEl.hidden = true;
    frag.appendChild(cursorEl);
    boardEl.appendChild(frag);
  }

  /**
   * Bố cục theo khung bàn:
   *  - dọc (điện thoại): hàng trên có chồng chia (trái) và ô đích (phải), 10 cột bên dưới
   *  - ngang (máy tính, điện thoại xoay ngang): chồng chia bên trái, ô đích bên phải, 10 cột ở giữa cao hết khung
   */
  function layout() {
    const W = boardEl.clientWidth;
    const H = boardEl.clientHeight;
    if (!W || !H) return false;
    const side = W / H > 1.25;
    const gap = Math.max(3, Math.min(12, Math.round(W * 0.011)));
    let cw;
    let L;
    if (side) {
      const sideGap = gap * 2 + 4;
      cw = Math.floor((W - 9 * gap - 2 * sideGap) / 12);
      cw = Math.max(24, Math.min(cw, Math.floor(H / 6.2), 104));
      const ch = Math.round(cw * 1.4);
      const total = 12 * cw + 9 * gap + 2 * sideGap;
      const x0 = Math.max(0, Math.floor((W - total) / 2));
      const fy = Math.min(Math.round(ch * 0.24), Math.floor((H - ch) / 7));
      L = {
        side, cw, ch, gap,
        colX: (c) => x0 + cw + sideGap + c * (cw + gap),
        tabY: 0,
        stockPos: (g) => ({ x: x0, y: g * Math.round(ch * 0.1) }),
        foundPos: (r) => ({ x: x0 + total - cw, y: r * fy }),
      };
    } else {
      cw = Math.floor((W - 9 * gap) / 10);
      cw = Math.max(22, Math.min(cw, Math.floor(H / 7.6), 104));
      const ch = Math.round(cw * 1.4);
      const total = 10 * cw + 9 * gap;
      const x0 = Math.max(0, Math.floor((W - total) / 2));
      const sx = Math.round(cw * 0.2);
      const fx = Math.round(cw * 0.55);
      L = {
        side, cw, ch, gap,
        colX: (c) => x0 + c * (cw + gap),
        tabY: ch + Math.max(6, Math.round(ch * 0.16)),
        stockPos: (g) => ({ x: x0 + g * sx, y: 0 }),
        // Ô đích neo ở mép phải: dãy mới nhất nằm ngoài cùng, dãy cũ lùi sang trái
        foundPos: (r, n) => ({ x: x0 + total - cw - Math.max(0, n - 1 - r) * fx, y: 0 }),
      };
    }
    L.W = W;
    L.H = H;
    lay = L;
    boardEl.style.setProperty('--card-w', cw + 'px');
    return true;
  }

  /**
   * Độ lệch giữa các lá trong cột: co lại khi cột dài hơn chỗ trống.
   * Ép phần lá úp trước (tối thiểu 2 px) để dải bậc / chất của lá ngửa đọc được lâu nhất.
   */
  function offsets(col) {
    const n = game.tab[col].length;
    const down = game.down[col];
    let od = Math.max(3, Math.round(lay.cw * 0.16));
    let ou = Math.round(lay.cw * (lay.cw < 60 ? 0.5 : 0.4));
    if (n > 1) {
      const nd = Math.min(down, n - 1);
      const nu = Math.max(0, n - 1 - down);
      const avail = Math.max(0, lay.H - lay.tabY - lay.ch - 2);
      if (nd * od + nu * ou > avail) {
        const odMin = Math.max(2, Math.round(lay.cw * 0.06));
        if (nd * odMin + nu * ou <= avail) od = (avail - nu * ou) / nd;
        else {
          od = odMin;
          ou = nu ? Math.max(0, (avail - nd * odMin) / nu) : ou;
        }
      }
    }
    return { od, ou };
  }

  /** Vị trí mọi lá theo trạng thái s: { x, y, z, up, where: 's' | 't' | 'f', col, idx }. */
  function computePositions(s) {
    const out = new Array(s.cards.length);
    s.stock.forEach((c, j) => {
      const p = lay.stockPos(Math.floor(j / 10));
      out[c] = { x: p.x, y: p.y, z: 10 + j, up: false, where: 's', idx: j };
    });
    s.found.forEach((run, r) => {
      const p = lay.foundPos(r, s.found.length);
      run.forEach((c, k) => { out[c] = { x: p.x, y: p.y, z: 70 + r * 14 + (13 - k), up: true, where: 'f', idx: k }; });
    });
    s.tab.forEach((col, ci) => {
      const { od, ou } = offsets(ci);
      let y = lay.tabY;
      col.forEach((c, i) => {
        out[c] = { x: lay.colX(ci), y: Math.round(y), z: 200 + i, up: i >= s.down[ci], where: 't', col: ci, idx: i };
        y += i < s.down[ci] ? od : ou;
      });
    });
    return out;
  }

  const place = (el, x, y) => { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };

  /**
   * Vẽ lá theo trạng thái (mặc định là ván hiện tại).
   *   o.instant: không hiệu ứng (đổi cỡ khung, kéo thả xong); o.delays: { chỉ số lá: ms } để lá bay lần lượt
   */
  function render(o) {
    const opts = o || {};
    if (!lay || !game) return;
    const s = opts.state || game;
    if (!opts.state) clearTimeout(phaseTimer);
    const instant = !!opts.instant || reduceMotion.matches;
    boardEl.classList.toggle('instant', instant);
    pos = computePositions(s);
    const heldSet = new Set(held ? game.tab[held.col].slice(held.idx) : []);
    for (let i = 0; i < cardEls.length; i++) {
      const p = pos[i];
      const el = cardEls[i];
      const moved = el._x !== p.x || el._y !== p.y;
      const d = !instant && opts.delays && opts.delays[i] ? opts.delays[i] : 0;
      el.style.transitionDelay = d ? d + 'ms' : '';
      if (moved) {
        place(el, p.x, p.y);
        el._x = p.x;
        el._y = p.y;
      }
      // Lá đang bay nằm trên mọi lá khác, bay xong trả về đúng tầng
      clearTimeout(el._lift);
      if (moved && !instant) {
        el.style.zIndex = 600 + p.z;
        el._lift = setTimeout(() => { el.style.zIndex = p.z; }, MOVE_MS + d + 60);
      } else {
        el.style.zIndex = p.z;
      }
      if (p.up !== el._up) {
        el._up = p.up;
        if (p.up && !instant) {
          clearTimeout(el._flip);
          el._flip = setTimeout(() => { if (el._up) P.flip(el, true, { duration: 240 }); }, d);
        } else {
          P.flip(el, p.up, { duration: 0 });
        }
      }
      el.classList.toggle('can', p.where === 't' && p.up && E.canPick(s, p.col, p.idx));
      el.classList.toggle('stock-card', p.where === 's');
      el.classList.toggle('pnc-selected', heldSet.has(i));
    }
    renderSlots(s);
    renderCursor();
    renderHud();
    if (instant) {
      // Bỏ lớp "instant" sau khi trình duyệt đã áp vị trí mới (để lần sau lại có hiệu ứng)
      requestAnimationFrame(() => requestAnimationFrame(() => boardEl.classList.remove('instant')));
    }
  }

  function renderSlots(s) {
    const tabH = Math.max(lay.ch, lay.H - lay.tabY);
    for (let c = 0; c < E.COLS; c++) {
      const x = lay.colX(c);
      place(colEls[c], x, lay.tabY);
      colEls[c].style.width = lay.cw + 'px';
      colEls[c].style.height = tabH + 'px';
      colEls[c].setAttribute('aria-label', t('col.label', { n: c + 1 }));
      place(colSlots[c], x, lay.tabY);
    }
    const nf = s.found.length;
    // Ô trống của ô đích: dọc thì ở chỗ dãy kế tiếp, hàng trên thì chỉ hiện khi chưa có dãy nào
    foundSlot.hidden = lay.side ? nf >= E.RUNS : nf > 0;
    if (!foundSlot.hidden) {
      const p = lay.foundPos(nf, nf + 1);
      place(foundSlot, p.x, p.y);
    }
    foundSlot.setAttribute('aria-label', t('found.label', { n: nf }));
    const p0 = lay.stockPos(0);
    place(stockSlot, p0.x, p0.y);
    const left = s.stock.length / 10;
    stockSlot.setAttribute('aria-label', left ? t('stock.label', { n: left }) : t('stock.empty'));
    stockCount.hidden = !left;
    if (left) {
      const pt = lay.stockPos(left - 1);
      place(stockCount, pt.x + lay.cw - 14, pt.y + lay.ch - 14);
      stockCount.textContent = left;
    }
  }

  function renderHud() {
    $('moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('score').textContent = kit.i18n.fmtNumber(Math.max(0, E.score(game)));
    $('mode-label').textContent = t('mode.' + modeOf(game));
    $('deal-left').textContent = game.stock.length / 10;
    $('btn-deal').disabled = finished || !game.stock.length;
    $('btn-undo').disabled = finished || !game.hist.length;
    $('btn-hint').disabled = finished;
    renderTime();
  }
  function renderTime() {
    if (game) $('time').textContent = fmt(clock.elapsed());
  }
  setInterval(() => { if (clock.running) renderTime(); }, 250);

  /** Khung con trỏ bàn phím: quanh chồng từ cursor.idx lên đỉnh (cột trống: quanh ô trống). */
  function renderCursor() {
    if (!cursorEl) return;
    cursorEl.hidden = !cursor.on || finished;
    if (cursorEl.hidden) return;
    const col = game.tab[cursor.col];
    const x = lay.colX(cursor.col);
    let y = lay.tabY;
    let h = lay.ch;
    if (col.length) {
      const idx = Math.min(Math.max(cursor.idx, game.down[cursor.col]), col.length - 1);
      const a = pos[col[idx]];
      const b = pos[col[col.length - 1]];
      y = a.y;
      h = b.y + lay.ch - a.y;
    }
    place(cursorEl, x, y);
    cursorEl.style.width = lay.cw + 'px';
    cursorEl.style.height = h + 'px';
    cursorEl.classList.toggle('holding', !!held);
  }

  /* ---------------- Đi bài ---------------- */

  /** Áp trạng thái mới: bấm giờ, vẽ, kiểm tra thắng / bí, lưu. */
  function commit(next, o) {
    const opts = o || {};
    game = next;
    clearHint();
    if (!clock.running && !finished) clock.resume();
    if (cursor.on) cursor.idx = defaultIdx(cursor.col);
    if (opts.phase) {
      render({ state: opts.phase, instant: opts.instant });
      phaseTimer = setTimeout(() => render({ delays: opts.delays }), MOVE_MS - 40);
    } else {
      render({ instant: opts.instant, delays: opts.delays });
    }
    if (E.isWon(game)) {
      onWin(opts.phase ? MOVE_MS : 0);
      return;
    }
    if (!E.hint(game) && stuckAt !== game.hist.length) {
      stuckAt = game.hist.length;
      kit.toast(t('toast.stuck'), 2600);
    }
    persist();
  }

  /** Bản sao trạng thái với dãy K→A vừa gỡ còn nằm trên cột (để vẽ hai bước: lá tới cột rồi cả dãy bay ra ô đích). */
  function beforeRun(s, col, flipped) {
    const g = { suits: s.suits, cards: s.cards, tab: s.tab.map((x) => x.slice()), down: s.down.slice(), stock: s.stock, found: s.found.slice() };
    const run = g.found.pop();
    if (flipped) g.down[col]++;
    g.tab[col].push(...run);
    return g;
  }

  /** Lá của dãy vừa gỡ bay lần lượt từ Át lên tới Già. */
  function runDelays(s) {
    const d = {};
    const run = s.found[s.found.length - 1];
    run.forEach((c, k) => { d[c] = (12 - k) * 28; });
    return d;
  }

  /** Đi chồng từ idx của cột col sang cột to. Trả false nếu sai luật. */
  function doMove(col, idx, to, o) {
    const opts = o || {};
    const base = opts.base || game; // trạng thái trước nước đi (đổi đích khi chạm lại: trạng thái trước lần chạm đầu)
    const next = opts.next || E.move(base, col, idx, to);
    if (!next) return false;
    const card = base.tab[col][idx];
    const ran = next.found.length > base.found.length;
    held = null;
    if (ran) {
      lastTap = null;
      const h = next.hist[next.hist.length - 1];
      commit(next, { instant: opts.instant, phase: opts.instant ? null : beforeRun(next, to, h.run === 2), delays: runDelays(next) });
      kit.sfx('clear');
      if (!E.isWon(next)) kit.toast(t('toast.run', { n: next.found.length }));
    } else {
      commit(next, { instant: opts.instant });
      kit.sfx('place');
    }
    say(t('say.move', { card: P.cardName(next.cards[card], lang()), n: to + 1 }));
    return true;
  }

  /** Chia một hàng mới (hoặc báo vì sao chưa chia được). */
  function requestDeal() {
    if (!game || finished || busy()) return;
    if (!game.stock.length) {
      kit.toast(t('toast.stockEmpty'));
      kit.sfx('error');
      return;
    }
    const next = E.deal(game);
    if (!next) {
      kit.toast(t('toast.emptyCol'));
      nope(colSlots.filter((x, c) => !game.tab[c].length).map((x) => x.firstChild));
      return;
    }
    held = null;
    lastTap = null;
    const delays = {};
    for (let c = 0; c < E.COLS; c++) {
      const i = next.tab[c].length ? next.tab[c][next.tab[c].length - 1] : -1;
      if (i >= 0) delays[i] = c * 45;
    }
    if (next.found.length > game.found.length) Object.assign(delays, runDelays(next));
    commit(next, { delays });
    kit.sfx('flip');
    say(t('say.deal'));
  }

  function undo() {
    if (!game || finished || busy()) return;
    const next = E.undo(game);
    if (!next) {
      kit.toast(t('toast.noUndo'));
      return;
    }
    held = null;
    lastTap = null;
    commit(next);
    kit.sfx('move');
  }

  /* ---------------- Chạm, kéo thả ---------------- */

  function nope(els) {
    kit.sfx('error');
    if (reduceMotion.matches) return;
    els.forEach((el) => {
      if (!el) return;
      el.classList.remove('nope');
      void el.offsetWidth; // chạy lại hiệu ứng
      el.classList.add('nope');
      setTimeout(() => el.classList.remove('nope'), 340);
    });
  }
  const stackEls = (col, idx) => game.tab[col].slice(idx).map((c) => cardEls[c]);

  /** Chạm lá ngửa: tự đi tới đích tốt nhất; chạm lại đúng lá vừa đi thì chuyển sang đích kế tiếp. */
  function autoMove(col, idx) {
    const card = game.tab[col][idx];
    if (lastTap && lastTap.card === card && lastTap.after === game && lastTap.dests.length > 1) {
      const k = (lastTap.k + 1) % lastTap.dests.length;
      const next = E.move(lastTap.before, lastTap.col, lastTap.idx, lastTap.dests[k]);
      if (next) {
        lastTap.k = k;
        const keep = lastTap;
        // Đổi đích không tính thêm nước: đi từ trạng thái trước lần chạm đầu
        doMove(keep.col, keep.idx, keep.dests[k], { next, base: keep.before });
        if (game === next && next.found.length === keep.before.found.length) {
          keep.after = game;
          lastTap = keep;
        }
        return;
      }
    }
    lastTap = null;
    if (!E.canPick(game, col, idx)) {
      nope(stackEls(col, idx));
      return;
    }
    const dests = E.targets(game, col, idx);
    if (!dests.length) {
      nope(stackEls(col, idx));
      kit.toast(t('toast.noMove'));
      return;
    }
    const before = game;
    doMove(col, idx, dests[0]);
    if (game !== before && game.found.length === before.found.length && !finished) {
      lastTap = { card, col, idx, dests, k: 0, before, after: game };
    }
  }

  function tapCard(i) {
    const p = pos[i];
    if (!p) return;
    if (p.where === 's') {
      requestDeal();
      return;
    }
    if (p.where !== 't') return;
    if (held) {
      placeHeld(p.col);
      return;
    }
    if (!p.up) return;
    cursor.col = p.col;
    autoMove(p.col, p.idx);
  }

  /** Đặt chồng đang cầm lên cột to; cùng cột thì tự đi như chạm. Trả true nếu đã xử lý. */
  function placeHeld(to) {
    const h = held;
    held = null;
    if (h.col === to) {
      autoMove(h.col, h.idx);
      return true;
    }
    if (E.canMove(game, h.col, h.idx, to)) {
      lastTap = null;
      doMove(h.col, h.idx, to);
      return true;
    }
    nope(stackEls(h.col, h.idx));
    render();
    return false;
  }

  boardEl.addEventListener('click', (e) => {
    if (!game) return;
    if (busy()) {
      finishWinFx();
      return;
    }
    if (finished) return;
    const cardEl = e.target.closest('.pnc[data-i]');
    if (cardEl) {
      tapCard(Number(cardEl.dataset.i));
      return;
    }
    if (e.target.closest('.stock-slot')) {
      requestDeal();
      return;
    }
    const colEl = e.target.closest('[data-col]');
    if (colEl && held) placeHeld(Number(colEl.dataset.col));
  });

  P.drag(boardEl, {
    canPick(el) {
      if (!game || finished || busy() || !el.dataset.i) return false;
      const p = pos[Number(el.dataset.i)];
      if (!p || p.where !== 't' || !p.up || !E.canPick(game, p.col, p.idx)) return false;
      return stackEls(p.col, p.idx);
    },
    canDrop(el, target) {
      const p = pos[Number(el.dataset.i)];
      return !!p && E.canMove(game, p.col, p.idx, Number(target.dataset.drop));
    },
    onDrop(el, target) {
      const p = pos[Number(el.dataset.i)];
      lastTap = null;
      return doMove(p.col, p.idx, Number(target.dataset.drop), { instant: true });
    },
    onStart() {
      held = null;
      clearHint();
      kit.sfx('tap');
    },
  });

  /* ---------------- Gợi ý ---------------- */

  function clearHint() {
    clearTimeout(hintTimer);
    boardEl.querySelectorAll('.pnc-highlight').forEach((el) => el.classList.remove('pnc-highlight'));
    colSlots.forEach((s) => s.classList.remove('target'));
  }

  function showHint() {
    if (!game || finished || busy()) return;
    assisted = true;
    clearHint();
    const h = E.hint(game);
    if (!h) {
      kit.toast(t('toast.stuck'), 2600);
      persist();
      return;
    }
    const mark = (el) => el && el.classList.add('pnc-highlight');
    if (h.t === 'deal') {
      game.stock.slice(-10).forEach((c) => mark(cardEls[c]));
      kit.toast(t('toast.hintDeal'));
    } else {
      stackEls(h.col, h.idx).forEach(mark);
      const top = E.topIdx(game, h.to);
      const card = nameOf(game.tab[h.col][h.idx]);
      if (top >= 0) {
        mark(cardEls[top]);
        kit.toast(t('toast.hintMove', { card, dest: nameOf(top) }), 2400);
      } else {
        colSlots[h.to].classList.add('target');
        kit.toast(t('toast.hintEmpty', { card }), 2400);
      }
    }
    kit.sfx('pop');
    hintTimer = setTimeout(clearHint, 2600);
    persist();
  }

  /* ---------------- Bàn phím ---------------- */

  /** Vị trí mặc định của con trỏ trong cột: đầu dãy cùng chất ở đỉnh (cả chồng đi được). */
  function defaultIdx(col) {
    return E.runStart(game, col);
  }
  function moveCursor(col) {
    cursor.on = true;
    cursor.col = (col + E.COLS) % E.COLS;
    cursor.idx = defaultIdx(cursor.col);
    renderCursor();
  }
  /** Enter / Space: chưa cầm thì nhấc chồng ở con trỏ; đang cầm thì đặt vào cột con trỏ. */
  function kbdEnter() {
    cursor.on = true;
    if (held) {
      placeHeld(cursor.col);
      return;
    }
    const col = cursor.col;
    if (cursor.idx >= 0 && E.canPick(game, col, cursor.idx)) {
      held = { col, idx: cursor.idx };
      lastTap = null;
      kit.sfx('tap');
      say(t('say.held', { card: nameOf(game.tab[col][cursor.idx]) }));
      render();
    } else if (game.tab[col].length) {
      nope(stackEls(col, Math.max(cursor.idx, game.down[col])));
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') {
        e.preventDefault();
        undo();
      }
      return;
    }
    if (busy()) {
      if (k === 'enter' || k === ' ' || k === 'escape') {
        e.preventDefault();
        finishWinFx();
      }
      return;
    }
    const onButton = e.target.closest && e.target.closest('button, input, a[href]');
    if (k === 'n') requestNew();
    else if (finished) return;
    else if (k === 'arrowleft' || k === 'arrowright') moveCursor((cursor.on ? cursor.col : 0) + (cursor.on ? (k === 'arrowleft' ? -1 : 1) : 0));
    else if (k === 'arrowup' || k === 'arrowdown') {
      if (!cursor.on) moveCursor(cursor.col);
      else {
        const col = cursor.col;
        const len = game.tab[col].length;
        if (!len) return;
        const lo = game.down[col];
        cursor.idx = Math.max(lo, Math.min(len - 1, cursor.idx + (k === 'arrowup' ? -1 : 1)));
        renderCursor();
      }
    } else if (k === 'enter' || k === ' ') {
      if (onButton) return; // để trình duyệt bấm nút đang focus
      kbdEnter();
    } else if (/^[0-9]$/.test(k)) {
      const col = (Number(k) + 9) % 10;
      if (held) {
        cursor.on = true;
        cursor.col = col;
        placeHeld(col);
      } else {
        moveCursor(col);
        kbdEnter();
      }
    } else if (k === 'd') requestDeal();
    else if (k === 'z' || k === 'backspace') undo();
    else if (k === 'h') showHint();
    else if (k === 'escape' && held) {
      held = null;
      render();
    } else return;
    e.preventDefault();
  });
  // Space trên bàn: chặn cả keyup để trình duyệt không bấm thêm nút đang focus
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && !(e.target.closest && e.target.closest('button, input, a[href]'))) e.preventDefault();
  });

  /* ---------------- Thắng ván ---------------- */

  function onWin(wait) {
    finished = true;
    held = null;
    lastTap = null;
    cursor.on = false;
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = modeOf(game);
    const b = stats[m];
    const sc = E.score(game);
    b.played++;
    b.won++;
    // Kỷ lục cá nhân chỉ tính ván không dùng gợi ý (giống bảng xếp hạng)
    const record = !assisted && (b.best == null || ms < b.best);
    if (record) b.best = ms;
    if (b.bestScore == null || sc > b.bestScore) b.bestScore = sc;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    renderHud();
    winFx = { anims: [], timer: 0, result: { ms, sc, record, moves: game.moves, mode: m, assisted } };
    winFx.timer = setTimeout(() => {
      kit.sfx('win');
      const delay = celebrate();
      winFx.timer = setTimeout(() => {
        winFx.timer = 0;
        showWin(winFx.result);
      }, delay);
    }, (wait || 0) + 13 * 28 + MOVE_MS);
  }

  /** Lá trên các ô đích lần lượt nảy xuống đáy bàn (kiểu solitaire cổ điển). Trả thời gian chờ trước khi hiện kết quả. */
  function celebrate() {
    if (reduceMotion.matches || !document.body.animate) return 300;
    const anims = [];
    const floorY = lay.H - lay.ch;
    let n = 0;
    for (let k = 0; k < 13; k++) {
      for (let r = game.found.length - 1; r >= 0; r--) {
        const c = game.found[r][k];
        const el = cardEls[c];
        const p = pos[c];
        let x = p.x;
        let y = p.y;
        let vx = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.5) * lay.cw;
        let vy = -Math.random() * lay.ch * 0.3;
        const g = lay.ch * 0.1;
        const frames = [{ transform: 'translate(' + x + 'px,' + y + 'px)', opacity: 1 }];
        for (let f = 0; f < 28; f++) {
          vy += g;
          x += vx;
          y += vy;
          if (y > floorY) {
            y = floorY;
            vy = -vy * 0.7;
          }
          frames.push({ transform: 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)', opacity: f > 21 ? (27 - f) / 6 : 1 });
        }
        el.style.zIndex = 700 + n;
        anims.push(el.animate(frames, { duration: 1300, delay: n * 14, easing: 'linear', fill: 'backwards' }));
        n++;
      }
    }
    winFx.anims = anims;
    return 1300 + n * 14 + 100;
  }

  function stopWinFx() {
    if (!winFx) return;
    clearTimeout(winFx.timer);
    winFx.anims.forEach((a) => a.cancel());
    winFx = null;
  }
  /** Chạm / nhấn phím trong lúc hiệu ứng thắng: bỏ qua, hiện kết quả ngay. */
  function finishWinFx() {
    if (!busy()) return;
    const r = winFx.result;
    stopWinFx();
    render({ instant: true });
    showWin(r);
  }

  function showWin(r) {
    $('win-time').textContent = fmt(r.ms);
    $('win-moves').textContent = kit.i18n.fmtNumber(r.moves);
    $('win-score').textContent = kit.i18n.fmtNumber(Math.max(0, r.sc));
    $('win-mode').textContent = t('mode.' + r.mode);
    $('win-best').hidden = !r.record;
    $('win-assisted').hidden = !r.assisted;
    kit.confetti();
    kit.modal.open('modal-win');
  }

  /* ---------------- Lưu ---------------- */

  function writeSummary() {
    const m = curMode();
    const b = stats[m];
    let played = 0;
    let won = 0;
    MODES.forEach((k) => {
      played += stats[k].played;
      won += stats[k].won;
    });
    const live = inPlay();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played,
      won,
      note: b.best == null ? t('summary.none') : t('summary.note', { time: fmt(b.best), mode: t('mode.' + m) }),
      stats: b.best == null ? [] : [{ value: fmt(b.best), label: t('summary.best') + ' · ' + t('mode.' + m) }],
      resume: live ? { title: t('app.name') + ' · ' + t('mode.' + m), detail: t('summary.resume', { n: game.found.length }), pct: game.found.length / E.RUNS } : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()), assisted });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function newGame(mode) {
    const m = MODES.indexOf(mode) >= 0 ? mode : 's1';
    stopWinFx();
    kit.modal.close('modal-win');
    game = E.newGame({ suits: SUITS_OF[m] });
    assisted = false;
    finished = false;
    held = null;
    lastTap = null;
    stuckAt = -1;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    buildBoard();
    if (!layout()) return;
    // Chia bài: mọi lá bắt đầu ở chồng chia rồi bay ra cột lần lượt
    const p0 = lay.stockPos(Math.floor(game.stock.length / 10));
    cardEls.forEach((el) => {
      el._x = p0.x;
      el._y = p0.y;
      place(el, p0.x, p0.y);
    });
    boardEl.classList.add('instant');
    void boardEl.offsetWidth;
    const delays = {};
    for (let i = 0; i < 54; i++) delays[i] = i * 14;
    requestAnimationFrame(() => render({ delays }));
    renderHud();
    writeSummary();
  }

  function abandon() {
    const m = modeOf(game);
    stats[m].played++;
    saveStats();
    kit.sdk.end({ mode: m, won: false, timeMs: Math.round(clock.elapsed()), assisted });
  }

  function askConfirm(c) {
    pendingConfirm = c;
    $('confirm-text').textContent = c.kind === 'mode' ? t('confirm.mode', { mode: t('mode.' + c.mode) }) : t('confirm.text');
    kit.modal.open('modal-confirm');
  }
  function confirmLeave() {
    const c = pendingConfirm;
    pendingConfirm = null;
    kit.modal.close('modal-confirm');
    if (!c || !game) return;
    if (inPlay()) abandon();
    if (c.kind === 'mode') {
      newGame(c.mode);
      kit.settings.set({ mode: c.mode });
    } else {
      newGame(curMode());
    }
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else newGame(curMode());
  }

  /** Đổi số chất (từ Cài đặt). Ván đang dở thì giữ cài đặt cũ và hỏi trước (bỏ ván tính là thua). */
  function requestMode(m) {
    if (MODES.indexOf(m) < 0 || !game || m === modeOf(game)) return;
    if (inPlay()) {
      kit.settings.set({ mode: modeOf(game) });
      kit.modal.close('modal-settings');
      askConfirm({ kind: 'mode', mode: m });
    } else {
      newGame(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'mode') requestMode(value);
    else if (key === 'fourColor') document.documentElement.classList.toggle('cards-4color', !!value);
  }

  /* ---------------- Thống kê, cách chơi ---------------- */

  function renderStats() {
    const b = stats[statsMode];
    $('stats-title').textContent = t('stats.mode', { mode: t('mode.' + statsMode) });
    $('stats-played').textContent = kit.i18n.fmtNumber(b.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(b.won);
    $('stats-rate').textContent = (b.played ? Math.round((b.won / b.played) * 100) : 0) + '%';
    $('stats-best').textContent = b.best == null ? '–' : fmt(b.best);
    $('stats-modes').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === statsMode)));
  }
  $('stats-modes').setAttribute('role', 'radiogroup');
  $('stats-modes').querySelectorAll('button').forEach((x) => {
    x.setAttribute('role', 'radio');
    x.addEventListener('click', () => {
      statsMode = x.dataset.value;
      renderStats();
    });
  });
  $('btn-stats').addEventListener('click', () => {
    statsMode = curMode();
    renderStats();
  });

  /** Hình minh họa trong Cách chơi: một dãy K→A cùng chất xòe ngang. */
  (function helpFigure() {
    const fig = $('help-figure');
    for (let r = 13; r >= 1; r--) {
      const el = P.render({ rank: r, suit: 'H' }, { label: false });
      el.style.left = 'calc((100% - var(--card-w)) * ' + ((13 - r) / 12).toFixed(4) + ')';
      fig.appendChild(el);
    }
  })();

  /* ---------------- Sự kiện ---------------- */
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => newGame(curMode()));
  $('btn-undo').addEventListener('click', undo);
  $('btn-hint').addEventListener('click', showHint);
  $('btn-deal').addEventListener('click', requestDeal);
  kit.onLeave(persist);

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (game && layout()) render({ instant: true });
    }).observe(boardEl);
  }

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  /** Cài đặt số chất đi theo ván đang có (ghi thẳng, không qua onSetting). */
  function syncModeSetting() {
    const st = kit.settings.get();
    if (st.mode === curMode()) return;
    st.mode = curMode();
    kit.store.write(keys.settings, st);
    kit.renderSettings();
  }
  if (kit.settings.get().fourColor) document.documentElement.classList.add('cards-4color');

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' ? E.fromJSON(saved.game) : null;
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    assisted = !!saved.assisted;
    clock.set(Number.isFinite(saved.elapsed) && saved.elapsed > 0 ? saved.elapsed : 0);
    syncModeSetting();
    kit.sdk.start(modeOf(game), true);
    buildBoard();
    if (layout()) render({ instant: true });
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().mode;
    newGame(MODES.indexOf(m) >= 0 ? m : 's1');
    syncModeSetting();
  }
})();
