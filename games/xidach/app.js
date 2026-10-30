/* =====================================================================
 * Xì Dách - Giao diện + luồng phiên (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   - Phiên 10 ván, 1000 chip; mỗi ván: chọn chip -> Chia bài -> Rút / Dừng / Gấp đôi / Tách
 *   - Engine tính xong ngay (lưu luôn), giao diện diễn lại theo thứ tự: lá bay từ hộp bài và lật lên,
 *     lá úp của nhà cái lật ở cuối, nhà cái rút từng lá, rồi hiện kết quả. Đang diễn thì khóa nút.
 *   - Kể cả khi giảm chuyển động vẫn giữ nhịp chia từng lá (không bay, không lật), nên một ván luôn mất vài giây
 *     (khớp với luật chống gian lận min_duration_ms của cổng)
 *   Báo ván cho cổng (metric wins, mode classic): một phiên 10 ván là một ván của cổng
 *   - Phiên mới: kit.sdk.start(MODE); mở lại phiên dở: kit.sdk.start(MODE, true)
 *   - Hết phiên (đủ 10 ván hoặc cháy chip): kit.sdk.end({ mode, won: chip > 1000, timeMs, assisted: false })
 *   - Bỏ phiên đã chia ít nhất một ván: won false; chưa chia ván nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const PC = window.PNCards;
  const MODE = 'classic';
  const kit = PNKit.init({
    gameId: 'xidach',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { fourColor: false },
    onSetting: (key) => { if (key === 'fourColor') applyFourColor(); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (n) => kit.i18n.fmtNumber(n);
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n));

  // Nhịp diễn (ms). STEP / DEALER_STEP / HOLD giữ cả khi giảm chuyển động (là nhịp chơi, không phải trang trí)
  const STEP = 300; // giữa hai lá khi chia
  const SLIDE = 380; // lá bay từ hộp bài
  const FLIP = 280;
  const DEALER_STEP = 520; // giữa hai lá nhà cái rút
  const HOLD = 1100; // giữ kết quả trước khi cho cược ván sau

  let game = null;
  let stake = 0; // mức cược đang chọn cho ván kế
  let busy = false; // đang diễn
  let shownChips = E.START_CHIPS; // số chip đang hiện ở HUD (chưa cộng tiền thắng khi chưa lật bài)
  let shownShuffles = 0;
  let shownLog = 0; // số ván đã hiện kết quả trên dải (chưa hiện ván đang diễn)
  let cardW = 80; // rộng lá trên bàn (px)
  let handW = 80; // rộng lá của người chơi (nhỏ hơn khi đã tách)
  const stats = Object.assign({ played: 0, won: 0, best: null, hands: 0, handsWon: 0, bjs: 0 }, kit.store.read(keys.stats, {}) || {});

  /* ---------------- Bàn chơi (DOM) ---------------- */
  // view: phần tử lá đang trên bàn, để thêm lá mới có hiệu ứng mà không vẽ lại cả bàn
  const view = { round: -1, dealer: [], holeHidden: false, hands: [] };

  function applyFourColor() {
    document.documentElement.classList.toggle('cards-4color', !!kit.settings.get().fourColor);
  }

  /**
   * Cỡ lá theo khung bàn: hai hàng lá (nhà cái, người chơi) + nhãn + dải kết quả, và đủ chỗ cho tay 4 lá.
   * Khi tách, hai tay nằm cạnh nhau nên lá của người chơi nhỏ hơn (--card-w riêng trên #hands).
   */
  function layout() {
    const tb = $('table');
    const W = tb.clientWidth;
    const H = tb.clientHeight;
    if (!W || !H) return;
    const rowH = (H - 2 * 30 - 44 - 28) / 2;
    const w = Math.max(36, Math.floor(Math.min(rowH / 1.4, (W - 24) / 3.1, 118)));
    cardW = w;
    tb.style.setProperty('--card-w', w + 'px');
    const two = view.hands.length > 1;
    handW = two ? Math.max(32, Math.min(w, Math.floor((W - 30) / 2 / 2.1))) : w;
    if (two) $('hands').style.setProperty('--card-w', handW + 'px');
    else $('hands').style.removeProperty('--card-w');
    positionAll();
  }

  /** Xếp lá trong một hàng: lệch nhau tối đa 0,62 rộng lá, co lại cho vừa (tối thiểu 0,24), canh giữa. */
  function position(box, els, cw0) {
    const n = els.length;
    if (!n) return;
    const w = cw0 || cardW;
    const cw = box.clientWidth;
    let off = n > 1 ? Math.min(w * 0.62, (cw - w) / (n - 1)) : 0;
    off = Math.max(off, w * 0.24);
    const total = w + off * (n - 1);
    const x0 = Math.max(0, (cw - total) / 2);
    els.forEach((el, i) => {
      el.style.left = Math.round(x0 + i * off) + 'px';
      el.style.zIndex = String(i + 1);
    });
  }
  function positionAll() {
    position($('dealer-cards'), view.dealer);
    view.hands.forEach((h) => position(h.box, h.els, handW));
  }

  /** Dựng các ô tay bài của người chơi (1 tay, hoặc 2 khi tách). */
  function buildHands(n) {
    const wrap = $('hands');
    wrap.innerHTML = '';
    wrap.classList.toggle('two', n > 1);
    view.hands = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'hand';
      el.innerHTML = '<div class="cards" role="group"></div><div class="hand-info"><span class="total" hidden></span>' +
        '<span class="hand-bet"></span><span class="hand-res" hidden></span></div>';
      el.querySelector('.cards').setAttribute('aria-label', n > 1 ? t('seat.hand', { i: i + 1 }) : t('seat.you'));
      wrap.appendChild(el);
      view.hands.push({ el, box: el.querySelector('.cards'), els: [], total: el.querySelector('.total'), bet: el.querySelector('.hand-bet'), res: el.querySelector('.hand-res') });
    }
    layout();
  }

  function clearTable() {
    $('dealer-cards').innerHTML = '';
    view.dealer = [];
    view.holeHidden = false;
    buildHands(1);
    $('dealer-total').hidden = true;
    view.hands[0].bet.hidden = true;
  }

  /** Lá trên bàn: hole = lá úp của nhà cái (vẽ lá null, không lộ mặt trong DOM). */
  function makeCard(card, faceUp, hole) {
    const el = PC.render(hole ? null : card, { faceUp, label: hole ? t('card.hole') : undefined });
    el.classList.add('tcard');
    return el;
  }

  /** Thêm một lá vào hàng: bay từ hộp bài tới chỗ rồi lật (giảm chuyển động: hiện ngửa ngay). */
  async function addCard(box, els, card, opts) {
    const o = opts || {};
    const anim = !reduced() && !o.instant;
    const faceUp = !o.hole;
    const el = makeCard(card, faceUp && !anim, o.hole);
    els.push(el);
    box.appendChild(el);
    position(box, els, box === $('dealer-cards') ? cardW : handW);
    if (!anim) return el;
    kit.sfx('flip');
    const s = $('shoe-stack').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = s.left + s.width / 2 - (r.left + r.width / 2);
    const dy = s.top + s.height / 2 - (r.top + r.height / 2);
    const a = el.animate(
      [{ transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(-14deg) scale(.62)' }, { transform: 'none' }],
      { duration: SLIDE, easing: 'cubic-bezier(.2,.75,.3,1)' },
    );
    await a.finished.catch(() => {});
    if (faceUp) await PC.flip(el, true, { duration: FLIP });
    return el;
  }

  /** Lật lá úp của nhà cái: thay lá null bằng lá thật đang úp rồi lật. */
  async function revealHole(card, instant) {
    const old = view.dealer[1];
    if (!old) return;
    const el = makeCard(card, false, false);
    el.style.left = old.style.left;
    el.style.zIndex = old.style.zIndex;
    old.replaceWith(el);
    view.dealer[1] = el;
    view.holeHidden = false;
    if (instant || reduced()) PC.flip(el, true, { duration: 0 });
    else {
      kit.sfx('flip');
      await PC.flip(el, true, { duration: FLIP + 60 });
    }
  }

  /** Dọn bài ván trước: trượt lên và mờ dần. */
  async function sweep() {
    const all = view.dealer.concat(...view.hands.map((h) => h.els));
    if (all.length && !reduced()) {
      all.forEach((el, i) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate(' + (cardW * 0.8) + 'px,' + (-cardW * 0.5) + 'px) rotate(8deg)' }],
        { duration: 240, delay: i * 18, easing: 'ease-in', fill: 'forwards' }));
      await wait(260 + all.length * 18);
    }
    clearTable();
  }

  /* ---------------- Vẽ phần chữ: tổng điểm, cược, kết quả, HUD, dải kết quả ---------------- */

  function dealerShown() {
    if (!game.dealer.length) return [];
    return view.holeHidden ? [game.dealer[0]] : game.dealer.slice(0, view.dealer.length);
  }

  function paintTotals() {
    const dt = $('dealer-total');
    const dc = dealerShown();
    dt.hidden = !dc.length;
    // Nhà cái đã đủ 17 (sẽ dừng) thì hiện một số, chưa đủ thì hiện cả hai cách tính át
    dt.textContent = view.holeHidden || E.dealerHits(dc) ? E.totalLabel(dc) : String(E.handValue(dc).total);
    dt.classList.toggle('bust', E.handValue(dc).total > 21);
    view.hands.forEach((v, i) => {
      const h = game.hands[i];
      if (!h) return;
      const shown = h.cards.slice(0, v.els.length);
      v.total.hidden = !shown.length;
      const bj = E.isBlackjack(h) && shown.length === 2;
      // Tay đã xong (dừng, gấp đôi, quắc) thì hiện tổng cuối, đang chơi thì hiện "7/17"
      const fin = h.done && shown.length === h.cards.length;
      v.total.textContent = bj ? t('res.bj') : fin ? String(E.handValue(shown).total) : E.totalLabel(shown);
      v.total.classList.toggle('bj', bj);
      v.total.classList.toggle('bust', E.handValue(shown).total > 21);
      v.bet.hidden = false;
      v.bet.textContent = num(h.bet);
      v.bet.classList.toggle('dbl', h.doubled);
    });
  }

  function paintActive() {
    const playing = game.phase === 'play' && !busy;
    view.hands.forEach((v, i) => {
      v.el.classList.toggle('active', game.phase === 'play' && game.hands.length > 1 && i === game.active);
      v.el.classList.toggle('waiting', game.phase === 'play' && game.hands.length > 1 && i !== game.active);
    });
    if (playing) setBanner(game.hands.length > 1 ? t('banner.turnHand', { i: game.active + 1 }) : t('banner.turn'), 'turn');
  }

  const RES_SFX = { win: 'coin', bj: 'combo', push: 'draw', lose: 'drop', bust: 'drop' };

  /** Kết quả từng tay + dải giữa bàn. */
  function paintResults(withSound) {
    if (!game.round || game.phase === 'play') return;
    view.hands.forEach((v, i) => {
      const h = game.hands[i];
      if (!h || !h.result || game.hands.length < 2) return; // một tay: kết quả ở dải giữa bàn là đủ
      v.res.hidden = false;
      v.res.className = 'hand-res res-' + h.result;
      v.res.textContent = t('res.' + h.result) + (h.net ? ' ' + signed(h.net) : '');
      v.el.classList.remove('active', 'waiting');
    });
    const last = game.log[game.log.length - 1];
    if (!last) return;
    const code = game.hands.length === 1 ? game.hands[0].result : last[1];
    setBanner(t('res.' + code) + (last[0] ? ' ' + signed(last[0]) : ''), 'res res-' + code);
    if (withSound) kit.sfx(RES_SFX[code] || 'drop');
  }

  function setBanner(text, cls) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'banner' + (cls ? ' ' + cls : '') + (text ? '' : ' empty');
  }

  function idleBanner() {
    if (game.phase === 'over') {
      const net = game.chips - E.START_CHIPS;
      setBanner(t(game.chips < E.MIN_BET ? 'banner.broke' : 'banner.over') + (net ? ' ' + signed(net) : ''), 'res ' + (E.won(game) ? 'res-win' : 'res-lose'));
    }
    else if (game.phase === 'bet' && !game.round) setBanner(t('banner.start'), 'turn');
  }

  function paintHud() {
    $('chips').textContent = num(shownChips);
    const net = shownChips - E.START_CHIPS;
    const cn = $('chips-net');
    cn.textContent = net ? signed(net) : '';
    cn.className = 'hud-net' + (net > 0 ? ' up' : net < 0 ? ' down' : '');
    const n = game.phase === 'bet' ? Math.min(game.round + 1, E.HANDS) : game.round;
    $('hand').textContent = n + '/' + E.HANDS;
    const bet = game.phase === 'play' || busy ? game.hands.reduce((s, h) => s + h.bet, 0) : stake;
    $('bet').textContent = num(bet);
    // Hộp bài: phần còn lại, vạch xáo lại ở 25%
    $('shoe-fill').style.width = (E.remaining(game) / E.SHOE_SIZE) * 100 + '%';
  }

  function paintTrail() {
    const ol = $('trail');
    if (!ol.children.length) {
      for (let i = 0; i < E.HANDS; i++) ol.appendChild(document.createElement('li'));
    }
    Array.from(ol.children).forEach((li, i) => {
      const x = i < shownLog ? game.log[i] : null;
      li.className = x ? 'res-' + x[1] : i === shownLog && (game.phase === 'play' || busy) ? 'now' : '';
      li.textContent = x ? (x[0] ? signed(x[0]) : '0') : String(i + 1);
      li.setAttribute('aria-label', x ? t('trail.item', { i: i + 1, res: t('res.' + x[1]) + (x[0] ? ' ' + signed(x[0]) : '') }) : t('trail.empty', { i: i + 1 }));
    });
  }

  function paintControls() {
    const ph = game.phase;
    $('panel-play').hidden = ph !== 'play';
    $('panel-bet').hidden = ph === 'play';
    const a = E.actions(game);
    $('btn-hit').disabled = busy || !a.hit;
    $('btn-stand').disabled = busy || !a.stand;
    $('btn-double').disabled = busy || !a.double;
    $('btn-split').disabled = busy || !a.split;
    const betting = ph === 'bet' && !busy;
    const max = E.maxBet(game);
    document.querySelectorAll('.chip-btn').forEach((b) => { b.disabled = !betting || stake + Number(b.dataset.chip) > max; });
    $('btn-clear').disabled = !betting || !stake;
    const re = Math.min(game.lastBet, max);
    const rb = $('btn-rebet');
    rb.textContent = game.lastBet ? t('bet.rebet', { n: num(re) }) : t('bet.rebetNone');
    rb.disabled = !betting || re < E.MIN_BET;
    rb.hidden = ph === 'over';
    const deal = $('btn-deal');
    deal.textContent = t(ph === 'over' ? 'bet.again' : 'bet.deal');
    deal.disabled = busy || (ph === 'bet' && stake < E.MIN_BET);
    $('chip-row').classList.toggle('off', ph === 'over');
  }

  /** Vẽ phần không phải lá bài (gọi sau mỗi thao tác và khi diễn xong). */
  function render() {
    paintTotals();
    paintHud();
    paintTrail();
    paintControls();
    paintActive();
  }

  /** Dựng cả bàn từ trạng thái, không hiệu ứng (khi mở trang / phiên mới). */
  function renderStatic() {
    clearTable();
    view.round = game.round;
    shownShuffles = game.shuffles;
    shownChips = game.chips;
    shownLog = game.log.length;
    if (game.round) {
      buildHands(game.hands.length);
      game.dealer.forEach((c, i) => addCard($('dealer-cards'), view.dealer, c, { instant: true, hole: i === 1 && game.phase === 'play' }));
      view.holeHidden = game.phase === 'play';
      game.hands.forEach((h, i) => h.cards.forEach((c) => addCard(view.hands[i].box, view.hands[i].els, c, { instant: true })));
    }
    setBanner('');
    render();
    paintResults(false);
    idleBanner();
  }

  /* ---------------- Diễn lại một thao tác ---------------- */

  /** Tiền trả về của ván vừa tính (để HUD chưa cộng trước khi lật bài). */
  const payout = (g) => g.hands.reduce((s, h) => s + (h.result ? h.bet + h.net : 0), 0);

  async function present(g) {
    busy = true;
    const settled = g.phase !== 'play';
    shownChips = settled ? g.chips - payout(g) : g.chips;
    shownLog = settled ? g.log.length - 1 : g.log.length;
    paintHud();
    paintTrail();
    paintControls();
    setBanner('');
    try {
      if (g.round !== view.round) {
        // Ván mới: dọn bàn, chia người - nhà cái - người - nhà cái
        await sweep();
        view.round = g.round;
        if (g.shuffles !== shownShuffles) {
          shownShuffles = g.shuffles;
          kit.toast(t('toast.shuffle'));
          await shuffleAnim();
        }
        paintTotals();
        const h0 = g.hands[0];
        // Bài đã tách ngay sau khi chia không xảy ra (tách là một thao tác riêng), nên hàng người chơi luôn là tay 0
        // Lá sau bay ra khi lá trước còn đang bay / lật (so le STEP); tổng điểm cập nhật khi từng lá ngửa xong
        const seq = [[0, 0], [-1, 0], [0, 1], [-1, 1]];
        const landed = [];
        for (let k = 0; k < seq.length; k++) {
          const [who, i] = seq[k];
          if (k) await wait(STEP);
          if (who < 0 && i === 1) view.holeHidden = true;
          const p = who < 0
            ? addCard($('dealer-cards'), view.dealer, g.dealer[i], { hole: i === 1 })
            : addCard(view.hands[0].box, view.hands[0].els, h0.cards[i]);
          landed.push(p.then(paintTotals));
        }
        await Promise.all(landed);
        await wait(STEP / 2);
      }
      if (g.hands.length > view.hands.length) await splitView(g);
      // Lá mới của người chơi, theo thứ tự tay
      for (let h = 0; h < g.hands.length; h++) {
        const v = view.hands[h];
        for (let i = v.els.length; i < g.hands[h].cards.length; i++) {
          v.el.classList.add('active');
          await addCard(v.box, v.els, g.hands[h].cards[i]);
          paintTotals();
          await wait(reduced() ? STEP : STEP / 3);
        }
      }
      if (settled) await dealerTurn(g);
    } finally {
      busy = false;
      shownChips = game.chips;
      shownLog = game.log.length;
      render();
      if (settled && game === g) {
        paintResults(true);
        if (E.isOver(g)) idleBannerLater();
      }
    }
    if (settled) {
      // Giữ kết quả một nhịp trước khi cho cược tiếp
      busy = true;
      paintControls();
      await wait(HOLD);
      busy = false;
      paintControls();
    }
  }

  function idleBannerLater() {
    setTimeout(() => { if (E.isOver(game)) idleBanner(); }, HOLD * 1.6);
  }

  /** Tách: dựng hai ô tay, lá đầu ở lại tay 1, lá thứ hai sang tay 2 (giữ nguyên phần tử lá). */
  async function splitView(g) {
    const [a, b] = view.hands[0].els;
    buildHands(g.hands.length);
    [[0, a], [1, b]].forEach(([i, el]) => {
      view.hands[i].els.push(el);
      view.hands[i].box.appendChild(el);
    });
    layout();
    kit.sfx('move');
    paintTotals();
    await wait(STEP);
  }

  async function dealerTurn(g) {
    paintActive();
    await wait(reduced() ? STEP : STEP / 2);
    if (view.holeHidden) {
      await revealHole(g.dealer[1]);
      paintTotals();
    }
    if (g.dealer.length > view.dealer.length) setBanner(t('banner.dealer'), 'turn');
    for (let i = view.dealer.length; i < g.dealer.length; i++) {
      await wait(DEALER_STEP - (reduced() ? 0 : SLIDE / 2));
      await addCard($('dealer-cards'), view.dealer, g.dealer[i]);
      paintTotals();
    }
    await wait(STEP);
  }

  /** Hộp bài mới: chồng lá nảy nhẹ. */
  async function shuffleAnim() {
    const s = $('shoe-stack');
    if (reduced()) return;
    s.animate([{ transform: 'none' }, { transform: 'translateY(-6px) rotate(-6deg)' }, { transform: 'translateY(2px) rotate(4deg)' }, { transform: 'none' }], { duration: 520, easing: 'ease-in-out' });
    kit.sfx('merge');
    await wait(540);
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && E.started(game) && !E.isOver(game);

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const st = [];
    if (stats.best != null) st.push({ value: num(stats.best), label: t('stats.best') });
    if (stats.played) st.push({ value: Math.round((stats.won / stats.played) * 100) + '%', label: t('summary.rate') });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.best == null ? t('summary.none') : t('summary.note', { n: num(stats.best) }),
      stats: st,
      resume: inPlay()
        ? { title: t('app.name'), detail: t('summary.resume', { i: game.round, n: num(game.chips + (game.phase === 'play' ? game.hands.reduce((s, h) => s + h.bet, 0) : 0)) }), pct: game.round / E.HANDS }
        : null,
      now: Date.now(),
    }));
  }
  /** Luôn lưu phiên (kể cả đã xong) để hộp bài đi tiếp sang phiên sau; chỉ phiên đang dở mới được mở lại. */
  function persist() {
    if (game) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), stake, elapsed: Math.round(clock.elapsed()) });
    writeSummary();
  }

  /* ---------------- Luồng phiên ---------------- */
  let endShown = false;

  function newSession() {
    game = E.newSession(game ? { prev: game } : {});
    stake = 0;
    endShown = false;
    clock.reset();
    kit.sdk.start(MODE);
    renderStatic();
    persist();
  }

  function hint(key, params) {
    kit.sfx('error');
    kit.toast(t(key, params));
  }

  /** Áp trạng thái mới: thống kê + báo cổng ngay (để tắt trang giữa chừng không mất kết quả), rồi diễn. */
  function apply(next) {
    const prev = game;
    game = next;
    if (next.log.length > prev.log.length) {
      const last = next.log[next.log.length - 1];
      stats.hands++;
      if (last[0] > 0) stats.handsWon++;
      next.hands.forEach((h) => { if (h.result === 'bj') stats.bjs++; });
      if (next.round === E.HANDS - 1 && next.phase === 'bet') setTimeout(() => kit.toast(t('toast.lastHand')), reduced() ? 400 : 2200);
    }
    if (E.isOver(next) && !E.isOver(prev)) report(next);
    else saveStats();
    persist();
    present(next).then(() => {
      if (game === next && E.isOver(next) && !endShown) showEnd();
    });
  }

  /** Hết phiên: thống kê + kit.sdk.end. Hiện hộp kết quả sau khi diễn xong. */
  function report(g) {
    clock.pause();
    const won = E.won(g);
    stats.played++;
    if (won) stats.won++;
    if (stats.best == null || g.chips > stats.best) stats.best = g.chips;
    saveStats();
    kit.sdk.end({ mode: MODE, won, timeMs: Math.round(clock.elapsed()), assisted: false });
  }

  function showEnd() {
    endShown = true;
    const g = game;
    const won = E.won(g);
    const net = g.chips - E.START_CHIPS;
    $('end-chips').textContent = num(g.chips);
    const badge = $('end-badge');
    badge.textContent = t(won ? 'end.won' : g.chips < E.MIN_BET ? 'end.broke' : net === 0 ? 'end.even' : 'end.lost');
    badge.className = 'end-badge ' + (won ? 'good' : 'bad');
    $('end-net').textContent = net ? signed(net) : '0';
    $('end-net').className = net > 0 ? 'up' : net < 0 ? 'down' : '';
    $('end-hands').textContent = g.log.filter((x) => x[0] > 0).length + '/' + g.log.length;
    $('end-bj').textContent = num(g.log.filter((x) => x[1] === 'bj').length);
    $('end-best').textContent = stats.best == null ? '–' : num(stats.best);
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    kit.modal.open('modal-end');
  }

  function canAct() {
    return !busy && game && !kit.modal.current();
  }

  function addChip(v) {
    if (!canAct() || game.phase !== 'bet') return;
    const max = E.maxBet(game);
    if (stake + v > max) return hint('toast.max', { n: num(max) });
    stake += v;
    kit.sfx('tap');
    const b = $('bet');
    b.classList.remove('pop');
    void b.offsetWidth; // chạy lại hiệu ứng
    b.classList.add('pop');
    paintHud();
    paintControls();
    persist();
  }

  function clearBet() {
    if (!canAct() || game.phase !== 'bet' || !stake) return;
    stake = 0;
    kit.sfx('pop');
    paintHud();
    paintControls();
    persist();
  }

  function deal() {
    if (!canAct()) return;
    if (game.phase === 'over') return requestNew();
    if (game.phase !== 'bet') return;
    if (stake < E.MIN_BET) {
      if (game.lastBet) return rebet();
      return hint('toast.min', { n: E.MIN_BET });
    }
    const next = E.deal(game, stake);
    if (next === game) return hint('toast.max', { n: num(E.maxBet(game)) });
    if (E.started(game)) clock.resume();
    else clock.start();
    stake = 0;
    apply(next);
  }

  function rebet() {
    if (!canAct() || game.phase !== 'bet') return;
    const b = Math.min(game.lastBet, E.maxBet(game));
    if (b < E.MIN_BET) return hint('toast.min', { n: E.MIN_BET });
    stake = b;
    deal();
  }

  function act(name) {
    if (!canAct() || game.phase !== 'play') return;
    const next = E[name](game);
    if (next === game) {
      if (name === 'double') return hint('toast.noDouble');
      if (name === 'split') return hint('toast.noSplit');
      return;
    }
    if (name === 'stand') kit.sfx('place');
    apply(next);
  }

  /** Phiên đang dở (đã chia ít nhất một ván) thì hỏi trước, vì bỏ phiên tính là thua. */
  function requestNew() {
    if (busy) return;
    if (inPlay()) kit.modal.open('modal-confirm');
    else newSession();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newSession();
  }

  function fillStats() {
    $('stats-played').textContent = num(stats.played);
    $('stats-won').textContent = num(stats.won);
    $('stats-best').textContent = stats.best == null ? '–' : num(stats.best);
    $('stats-hands').textContent = num(stats.hands);
    $('stats-rate').textContent = stats.hands ? Math.round((stats.handsWon / stats.hands) * 100) + '%' : '–';
    $('stats-bj').textContent = num(stats.bjs);
  }

  /* ---------------- Sự kiện ---------------- */
  // Ô lãi / lỗ của phiên cạnh nhãn Chip
  (function () {
    const label = document.querySelector('#chips').previousElementSibling;
    const s = document.createElement('span');
    s.id = 'chips-net';
    s.className = 'hud-net';
    label.appendChild(s);
  })();
  // Hộp bài: ba lưng lá chồng lên nhau
  for (let i = 0; i < 3; i++) $('shoe-stack').appendChild(PC.render(null, { label: false, className: 'shoe-card' }));

  document.querySelectorAll('.chip-btn').forEach((b) => b.addEventListener('click', () => addChip(Number(b.dataset.chip))));
  $('btn-clear').addEventListener('click', clearBet);
  $('btn-deal').addEventListener('click', deal);
  $('btn-rebet').addEventListener('click', rebet);
  $('btn-hit').addEventListener('click', () => act('hit'));
  $('btn-stand').addEventListener('click', () => act('stand'));
  $('btn-double').addEventListener('click', () => act('double'));
  $('btn-split').addEventListener('click', () => act('split'));
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-end');
    newSession();
  });
  $('btn-stats').addEventListener('click', fillStats);
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    const onButton = e.target.closest && e.target.closest('button');
    if (k === 'enter') {
      // Enter trên nút đang focus là cú bấm của trình duyệt; riêng chip thì Enter vẫn là Chia bài
      // (bấm chip bằng chuột rồi Enter để chia là thói quen tự nhiên; thêm chip bằng phím thì dùng 1–4 hoặc Space)
      if (onButton && !onButton.classList.contains('chip-btn')) return;
      if (game.phase === 'bet' && stake < E.MIN_BET) rebet();
      else deal();
    } else if (k === 'h') act('hit');
    else if (k === 's') act('stand');
    else if (k === 'd') act('double');
    else if (k === 'p') act('split');
    else if (k >= '1' && k <= '4' && k.length === 1) addChip(E.CHIPS[Number(k) - 1]);
    else if (k === 'backspace' || k === 'delete') clearBet();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  });
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe($('table'));

  /* ---------------- Khởi động: mở lại phiên dở nếu có ---------------- */
  applyFourColor();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && E.started(restored) && !E.isOver(restored)) {
    game = restored;
    const s = saved.stake;
    stake = Number.isInteger(s) && s >= 0 && s <= E.maxBet(game) && game.phase === 'bet' ? s : 0;
    clock.set(saved.elapsed);
    clock.start();
    kit.sdk.start(MODE, true);
    layout();
    renderStatic();
    persist();
    kit.toast(t('toast.saved'));
  } else {
    game = restored; // phiên cũ đã xong (hoặc chưa chia): đi tiếp hộp bài của nó
    layout();
    newSession();
  }
  layout();
})();
