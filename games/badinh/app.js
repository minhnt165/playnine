/* =====================================================================
 * Ba Đỉnh - Giao diện + luồng trận (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   - 52 lá là 52 phần tử .pnc cố định trong một ván, đặt bằng transform; đổi chỗ là lá tự bay (transition)
 *   - Chạm lá đánh được để đánh, chạm nọc để rút; bàn phím: mũi tên chọn lá đánh được, Enter đánh, Space rút
 *   - Báo trận cho cổng (metric score_high, mode classic):
 *     trận mới kit.sdk.start(MODE); mở lại trận lưu dở kit.sdk.start(MODE, true)
 *     hết ván 3: kit.sdk.end({ mode, won, score }) với won = dọn sạch cả 3 ván
 *     bỏ trận đã đi ít nhất một nước: won false + điểm hiện có; chưa đi nước nào thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = window.PNCards;
  const MODE = 'classic';
  const GAP = 0.06; // khe giữa hai lá hàng dưới, theo bề rộng lá
  const kit = PNKit.init({ gameId: 'badinh', version: '1.0.1', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const lang = kit.i18n.lang;
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const nameOf = (id) => C.cardName(C.fromId(id), lang);

  const tableEl = $('table');
  const streakEl = $('streak');
  const drawBtn = $('btn-draw');

  let game = null;
  let els = {}; // id lá -> phần tử .pnc của ván đang chơi
  let geo = null; // bố cục đã tính: cỡ lá, vị trí 28 ô, nọc, đáy
  let sel = -1; // lá đang chọn bằng phím (chỉ số trên bàn), -1 = chưa chọn
  let kbd = false; // đang chơi bằng phím: đánh xong tự chọn lá kế
  let dealing = false;
  let dealTimer = 0;
  let bannerTimer = 0;
  let overTimer = 0;
  const stats = Object.assign({ played: 0, best: 0, total: 0, perfect: 0, rounds: 0, streak: 0 }, kit.store.read(keys.stats, {}) || {});

  /* ---------------- Bố cục ---------------- */
  /**
   * Tính cỡ lá theo khung: dọc (ba đỉnh trên, nọc + đáy dưới) hoặc ngang (nọc / chuỗi / đáy thành cột bên phải,
   * cho màn hình thấp). Chọn cách cho lá to hơn. Chỗ dọc còn thừa thì phóng to nọc / đáy và giãn hàng.
   */
  function layout() {
    const st = $('stage');
    const pad = 10;
    const W = st.clientWidth - 2 * pad;
    const H = st.clientHeight - 2 * pad;
    const tabW = 9 * (1 + GAP) + 1; // bề rộng ba đỉnh, theo cw
    const cwV = Math.min(W / tabW, H / (3.5 + 0.5 + 1.4));
    const cwS = Math.min(W / (tabW + 0.45 + 1), H / 3.5);
    const side = cwS > cwV * 1.08;
    const cw = Math.max(24, Math.min(96, Math.floor(side ? cwS : cwV)));
    const ch = cw * 1.4;
    const pitch = cw * (1 + GAP);
    let rowF = 0.5; // hàng sau lệch hàng trước 0,5 bề cao lá
    let ps = 1; // tỉ lệ lá nọc / đáy so với lá trên bàn
    let gapV = 0.5 * cw;
    let top = pad; // mép trên ba đỉnh
    let spare = 0;
    if (!side) {
      // Màn hình dọc còn thừa chỗ: phóng to nọc / đáy, giãn hàng, nới khoảng giữa bàn và đáy; phần còn lại chia trên / dưới
      spare = H - (3 * rowF * ch + ch + gapV + ch);
      ps = Math.min(1.7, 1 + Math.max(0, spare * 0.5) / ch);
      spare -= (ps - 1) * ch;
      rowF = Math.min(0.62, 0.5 + Math.max(0, spare * 0.5) / (3 * ch));
      spare -= (rowF - 0.5) * 3 * ch;
      const more = Math.min(ch * 1.6, Math.max(0, spare * 0.5));
      gapV += more;
      spare = Math.max(0, spare - more);
      top += spare * 0.42;
    }
    const tabH = 3 * rowF * ch + ch;
    const pw = cw * ps;
    const ph = pw * 1.4;
    const tab = E.POS.map((p) => ({ x: pad + p.x * pitch, y: top + p.row * rowF * ch }));
    let tw, th, stock, waste, streak;
    if (side) {
      const colX = pad + tabW * cw + 0.45 * cw;
      tw = colX + cw + pad;
      th = tabH + 2 * pad;
      stock = { x: colX, y: pad };
      waste = { x: colX, y: pad + tabH - ph };
      streak = { x: colX - 0.4 * cw, y: pad + ph, w: tw - (colX - 0.4 * cw), h: tabH - 2 * ph };
    } else {
      tw = tabW * cw + 2 * pad;
      th = tabH + gapV + ph + 2 * pad + spare;
      const cx = tw / 2;
      const y = top + tabH + gapV;
      stock = { x: cx - pw - 0.18 * cw, y };
      waste = { x: cx + 0.18 * cw, y };
      const sx = waste.x + pw + 0.2 * cw;
      streak = { x: sx, y, w: tw - pad - sx, h: ph };
    }
    geo = { cw, ps, pw, ph, tab, stock, waste, side };
    streakEl.classList.toggle('compact', side);
    const s = tableEl.style;
    s.setProperty('--card-w', cw + 'px');
    s.setProperty('--tw', Math.round(tw) + 'px');
    s.setProperty('--th', Math.round(th) + 'px');
    s.setProperty('--streak-size', Math.max(1.5, Math.min(2.6, cw / 26)) + 'rem');
    const pileAt = (el, p) => {
      el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) scale(' + ps + ')';
    };
    pileAt($('stock-slot'), stock);
    pileAt($('waste-slot'), waste);
    Object.assign(drawBtn.style, { left: stock.x + 'px', top: stock.y + 'px', width: pw + 'px', height: ph + 'px' });
    Object.assign(streakEl.style, { left: streak.x + 'px', top: streak.y + 'px', width: streak.w + 'px', height: streak.h + 'px' });
  }

  /* ---------------- Vẽ ---------------- */
  function put(el, x, y, s, z) {
    const tr = 'translate(' + x + 'px,' + y + 'px)' + (s !== 1 ? ' scale(' + s + ')' : '');
    if (el.style.transform !== tr) el.style.transform = tr;
    el.style.zIndex = z;
  }
  /** Ngửa / úp lá; có hiệu ứng lật nếu `anim`. */
  function setUp(el, up, anim) {
    if (el.classList.contains('pnc-up') !== up) C.flip(el, up, { duration: anim ? 300 : 0 });
  }

  /** Dựng 52 phần tử lá cho ván hiện tại (xóa lá ván trước). */
  function buildCards() {
    Object.keys(els).forEach((id) => els[id].remove());
    els = {};
    const frag = document.createDocumentFragment();
    game.tableau.concat(game.stock, game.waste).forEach((id) => {
      if (!id) return;
      const el = C.render(C.fromId(id), { faceUp: false });
      els[id] = el;
      frag.appendChild(el);
    });
    tableEl.insertBefore(frag, drawBtn);
  }

  /** Thứ tự chọn bằng phím: lá đánh được theo vị trí từ trái sang phải, hàng dưới trước. */
  function choices() {
    return E.playable(game).sort((a, b) => E.POS[a].x - E.POS[b].x || E.POS[b].row - E.POS[a].row);
  }

  function render(opts) {
    const o = opts || {};
    const anim = !o.instant && !reduced.matches;
    tableEl.classList.toggle('instant', !anim);
    const legal = new Set(E.playable(game));
    if (sel >= 0 && !legal.has(sel)) sel = -1;
    game.tableau.forEach((id, i) => {
      if (!id) return;
      const el = els[id];
      const p = geo.tab[i];
      put(el, p.x, p.y, 1, 1 + E.POS[i].row);
      if (!o.noFlip) setUp(el, E.exposed(game, i), anim);
      el.classList.toggle('legal', legal.has(i));
      el.classList.toggle('pnc-selected', sel === i);
      el.classList.remove('waste-old');
    });
    // Nọc: chỉ vẽ vài lá trên cùng, lệch nhau chút ít; nọc càng dày càng nhiều lớp (tối đa 4)
    const n = game.stock.length;
    const layers = Math.min(4, Math.ceil(n / 6));
    game.stock.forEach((id, k) => {
      const el = els[id];
      const depth = n - 1 - k; // 0 = lá trên cùng
      const d = Math.max(0, layers - 1 - depth) * 1.5;
      put(el, geo.stock.x - d, geo.stock.y - d, geo.ps, 20 + k);
      setUp(el, false, false);
      el.classList.remove('legal', 'pnc-selected');
      el.classList.toggle('waste-old', depth >= layers);
    });
    const m = game.waste.length;
    game.waste.forEach((id, k) => {
      const el = els[id];
      put(el, geo.waste.x, geo.waste.y, geo.ps, 100 + k);
      if (!o.noFlip) setUp(el, true, anim);
      el.classList.remove('legal', 'pnc-selected');
      el.classList.toggle('waste-old', k < m - 3); // chỉ giữ vài lá trên cùng (lá đang bay tới vẫn có lá dưới)
    });
    // Nọc
    const canDraw = game.phase === 'play' && n > 0;
    drawBtn.disabled = !canDraw;
    $('stock-count').textContent = n;
    drawBtn.setAttribute('aria-label', n ? t('stock.draw', { n }) : t('stock.empty'));
    drawBtn.classList.toggle('hint', canDraw && !legal.size && !dealing);
    // Chuỗi
    const s = game.streak;
    $('streak-value').textContent = s;
    streakEl.classList.toggle('zero', s === 0);
    streakEl.classList.toggle('warm', s >= 5 && s < 10);
    streakEl.classList.toggle('hot', s >= 10);
    renderHud();
  }

  function renderHud() {
    $('score').textContent = fmt(game.score);
    $('round').textContent = game.round + 1 + '/' + E.ROUNDS;
    $('best').textContent = fmt(Math.max(stats.best, game.score));
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Chữ điểm bay lên phía trên lá đáy. */
  function pop(text, small, big) {
    if (reduced.matches) return;
    const el = document.createElement('div');
    el.className = 'pop' + (big ? ' big' : '');
    el.style.left = geo.waste.x + geo.pw / 2 + 'px';
    el.style.top = geo.waste.y - 0.1 * geo.ph + 'px';
    el.textContent = text;
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      el.appendChild(s);
    }
    $('fx').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => !!game && game.actions > 0 && game.phase !== 'over';
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.perfect,
      note: stats.best > 0 ? t('summary.note', { score: fmt(stats.best) }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: fmt(stats.best), label: t('hud.best') }] : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.detail', { round: game.round + 1, score: fmt(game.score) }), pct: game.rounds.length / E.ROUNDS } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }
  /** Ghi trận vừa xong (hết ván 3 hoặc bỏ dở) vào thống kê; trả về có phải kỷ lục mới không. */
  function record() {
    const best = game.score > stats.best;
    stats.played++;
    stats.total += game.score;
    stats.rounds += game.rounds.filter((x) => x.cleared).length;
    stats.streak = Math.max(stats.streak, game.bestStreak);
    if (E.perfect(game)) stats.perfect++;
    if (best) stats.best = game.score;
    saveStats();
    return best;
  }

  /* ---------------- Luồng trận ---------------- */
  function clearTimers() {
    clearTimeout(dealTimer);
    clearTimeout(bannerTimer);
    clearTimeout(overTimer);
    dealing = false;
  }

  /** Chia bài ván hiện tại: lá bay từ nọc lên ba đỉnh lần lượt, rồi hàng dưới lật ngửa. */
  function deal() {
    buildCards();
    sel = -1;
    $('round-banner').hidden = true;
    if (reduced.matches) {
      render({ instant: true });
      return;
    }
    // Mọi lá nằm úp ở chỗ nọc, rồi bay tới chỗ của mình với độ trễ tăng dần
    tableEl.classList.add('instant');
    Object.keys(els).forEach((id, k) => put(els[id], geo.stock.x, geo.stock.y, geo.ps, 20 + k));
    void tableEl.offsetWidth;
    dealing = true;
    const order = game.tableau.map((id, i) => i).sort((a, b) => E.POS[a].row - E.POS[b].row || E.POS[a].x - E.POS[b].x);
    order.forEach((i, k) => { els[game.tableau[i]].style.transitionDelay = k * 22 + 'ms'; });
    els[game.waste[0]].style.transitionDelay = order.length * 22 + 'ms';
    render({ noFlip: true });
    kit.sfx('start');
    const total = order.length * 22 + 340;
    dealTimer = setTimeout(() => {
      Object.keys(els).forEach((id) => { els[id].style.transitionDelay = ''; });
      dealing = false;
      render();
      kit.sfx('flip');
    }, total);
  }

  function newGame() {
    clearTimers();
    kit.modal.closeAll();
    game = E.newGame();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    deal();
    writeSummary();
  }

  /** Lá kế để chọn bằng phím: lá đánh được gần vị trí x nhất. */
  function nearest(x) {
    let best = -1;
    let bd = Infinity;
    choices().forEach((i) => {
      const d = Math.abs(E.POS[i].x - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  function playCard(i) {
    if (!game || game.phase !== 'play' || dealing) return;
    const res = E.play(game, i);
    if (!res) {
      nope(i);
      return;
    }
    game = res.game;
    sel = kbd ? nearest(E.POS[i].x) : -1;
    const s = res.streak;
    kit.sfx(res.peak ? 'coin' : s >= 5 && s % 5 === 0 ? 'combo' : 'place', { pitch: 1 + Math.min(s - 1, 12) * 0.06 });
    if (res.flipped.length) setTimeout(() => kit.sfx('flip'), 140);
    pop('+' + res.gained, res.peak ? t('pop.peak') : '', s >= 5 || res.peak);
    if (!reduced.matches) replay(streakEl, 'bump');
    $('live').textContent = t('live.play', { card: nameOf(res.card), n: res.gained, s });
    render();
    if (res.end) roundEnded(res.end);
    else persist();
  }

  /** Chạm lá không đánh được: lắc lá (nếu đã ngửa) + âm báo lỗi. */
  function nope(i) {
    const id = game.tableau[i];
    if (!id || !E.exposed(game, i) || game.phase !== 'play') return;
    kit.sfx('error');
    if (!reduced.matches) {
      replay(els[id], 'nope');
      setTimeout(() => els[id] && els[id].classList.remove('nope'), 360);
    }
    $('live').textContent = t('live.nope', { card: nameOf(id), open: nameOf(game.waste[game.waste.length - 1]) });
  }

  function drawCard() {
    if (!game || dealing || kit.modal.current()) return;
    const before = game.streak;
    const res = E.draw(game);
    if (!res) {
      kit.sfx('error');
      return;
    }
    game = res.game;
    sel = kbd ? nearest(4.5) : -1;
    kit.sfx('flip');
    if (before > 0 && !reduced.matches) replay(streakEl, 'broke');
    $('live').textContent = t('live.draw', { card: nameOf(res.card) });
    render();
    if (res.end) roundEnded(res.end);
    else persist();
  }

  function roundEnded(end) {
    if (end.cleared) pop(t('pop.clear', { n: end.bonus }), '', true);
    if (end.over) {
      finish();
      return;
    }
    persist();
    kit.sfx(end.cleared ? 'levelup' : 'drop');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(showBanner, reduced.matches ? 250 : 800);
  }

  /** Băng giữa hai ván: kết quả ván vừa xong, nút chia ván kế. */
  function showBanner() {
    const r = game.rounds[game.rounds.length - 1];
    if (!r || game.phase !== 'roundEnd') return;
    $('round-title').textContent = r.cleared ? t('round.cleared') : t('round.stuck');
    $('round-text').textContent = t('round.text', { round: game.round + 1, score: fmt(r.score) });
    $('round-bonus').hidden = !r.cleared;
    $('round-bonus').textContent = !r.cleared ? '' : r.stockLeft ? t('round.bonus', { n: r.stockLeft, stock: r.stockLeft * E.STOCK_BONUS }) : t('round.bonusClear');
    $('btn-next').textContent = t('round.next', { n: game.round + 2 });
    $('round-banner').hidden = false;
    $('live').textContent = $('round-title').textContent + ' ' + $('round-text').textContent;
    if (!kit.modal.current()) $('btn-next').focus();
  }

  function nextRound() {
    const g = E.nextRound(game);
    if (!g) return;
    clearTimeout(bannerTimer);
    game = g;
    deal();
    persist();
  }

  /** Hết ván 3: báo cổng ngay, lát sau mở hộp kết quả. */
  function finish() {
    const best = record();
    const perfect = E.perfect(game);
    persist();
    kit.sdk.end({ mode: MODE, won: perfect, score: game.score, assisted: false });
    kit.sfx(perfect || best ? 'win' : 'lose');
    renderHud();
    $('over-score').textContent = fmt(game.score);
    $('over-streak').textContent = fmt(game.bestStreak);
    $('over-perfect').hidden = !perfect;
    $('over-best').hidden = !best;
    const list = $('over-rounds');
    list.textContent = '';
    game.rounds.forEach((r, k) => {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = t('over.round', { n: k + 1, score: fmt(r.score) });
      li.appendChild(a);
      if (r.cleared) {
        const b = document.createElement('span');
        b.className = 'ok';
        b.textContent = t('over.roundCleared');
        li.appendChild(b);
      }
      list.appendChild(li);
    });
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      kit.modal.open('modal-over');
      if (perfect || best) kit.confetti();
    }, reduced.matches ? 400 : 1100);
  }

  /** Trận đang dở (đã đi nước) thì hỏi trước, vì bỏ trận sẽ kết thúc và gửi điểm hiện có. */
  function requestNew() {
    if (inPlay()) {
      $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score) });
      kit.modal.open('modal-confirm');
    } else {
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

  /* ---------------- Chọn bằng phím ---------------- */
  function moveSel(d) {
    if (game.phase !== 'play' || dealing) return;
    const list = choices();
    if (!list.length) {
      sel = -1;
      kit.sfx('error');
      render();
      return;
    }
    kbd = true;
    const k = list.indexOf(sel);
    sel = k < 0 ? list[d < 0 ? list.length - 1 : 0] : list[(k + d + list.length) % list.length];
    kit.sfx('tap');
    $('live').textContent = nameOf(game.tableau[sel]);
    render();
  }

  /* ---------------- Sự kiện ---------------- */
  tableEl.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.pnc');
    if (!el || !game || dealing) return;
    kbd = false;
    const i = game.tableau.indexOf(el.dataset.id);
    if (i >= 0) playCard(i);
    else if (game.stock.indexOf(el.dataset.id) >= 0) drawCard();
  });
  drawBtn.addEventListener('click', (e) => {
    if (e.detail) kbd = false;
    drawCard();
  });
  $('btn-next').addEventListener('click', nextRound);
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
    $('stats-streak').textContent = fmt(stats.streak);
    $('stats-rounds').textContent = fmt(stats.rounds);
    $('stats-perfect').textContent = fmt(stats.perfect);
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    const onButton = e.target && e.target.tagName === 'BUTTON';
    if (k === 'n' || k === 'N') {
      requestNew();
    } else if (game.phase === 'roundEnd') {
      if (k !== 'Enter' && k !== ' ') return;
      if (e.target === $('btn-next')) return; // trình duyệt tự bấm nút
      if (!$('round-banner').hidden) nextRound();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
      moveSel(-1);
    } else if (k === 'ArrowRight' || k === 'ArrowDown') {
      moveSel(1);
    } else if (k === 'Enter') {
      if (sel >= 0) playCard(sel);
      else if (onButton) return; // Enter trên nút: để trình duyệt bấm nút
      else moveSel(1);
    } else if (k === ' ') {
      if (e.target === drawBtn) return; // trình duyệt tự bấm nút nọc
      kbd = true;
      drawCard();
    } else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  function relayout() {
    layout();
    if (game && Object.keys(els).length) render({ instant: true, noFlip: dealing });
  }
  if (window.ResizeObserver) new ResizeObserver(relayout).observe($('stage'));
  window.addEventListener('resize', relayout);
  layout();

  /* ---------------- Khởi động: mở lại trận dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && restored.actions > 0 && restored.phase !== 'over') {
    game = restored;
    kit.sdk.start(MODE, true);
    buildCards();
    render({ instant: true });
    kit.toast(t('toast.saved'));
    if (game.phase === 'roundEnd') showBanner();
    writeSummary();
  } else {
    newGame();
  }
})();
