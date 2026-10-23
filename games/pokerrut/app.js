/* =====================================================================
 * Poker Rút - Giao diện + luồng phiên (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   - Máy video poker: bảng trả (cột cược hiện tại sáng, hàng thắng nhấp nháy), 5 lá, nút Cược 1 / Cược tối đa / Chia-Rút
 *   - Lá lật khi chia / rút (PNCards.flip; giảm chuyển động thì đổi ngay); chạm lá hoặc phím 1–5 để giữ
 *   - Gợi ý giữ bài (Cài đặt): tô sáng cách giữ có kỳ vọng cao nhất (engine.bestHold, tính chính xác);
 *     phiên có dùng gợi ý được đánh dấu assisted
 *   Báo ván cho cổng (metric score_high, mode classic):
 *   - Phiên mới: kit.sdk.start(MODE); mở lại phiên lưu dở: kit.sdk.start(MODE, true)
 *   - Hết 25 tay / hết xu: kit.sdk.end({ mode, won: xu > 100, score: xu, assisted })
 *   - Bỏ phiên đã chia ít nhất một tay: won false kèm số xu hiện có; chưa chia tay nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const PC = window.PNCards;
  const MODE = 'classic';
  const kit = PNKit.init({
    gameId: 'pokerrut',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { suggest: false },
    onSetting: (key) => {
      if (key === 'suggest') {
        if (kit && game) {
          noteAssist();
          render();
        }
      }
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (n) => kit.i18n.fmtNumber(n);
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

  let game = null;
  let busy = false; // đang lật bài
  let suggestion = null; // { held, ev } cho tay đang chơi
  const stats = Object.assign({ played: 0, won: 0, best: null, games: 0, sum: 0, hands: 0, royals: 0 }, kit.store.read(keys.stats, {}) || {});

  const suggestOn = () => !!kit.settings.get().suggest;

  /* ---------------- Dựng bảng trả và 5 ô lá ---------------- */
  const payRows = {};
  const payCols = [];
  function buildPaytable() {
    const head = $('pay-head');
    for (let b = 1; b <= E.MAX_BET; b++) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = String(b);
      th.setAttribute('aria-label', t('pay.col', { n: b }));
      head.appendChild(th);
      payCols.push([th]);
    }
    E.CATS.forEach((c) => {
      const tr = document.createElement('tr');
      tr.dataset.cat = c;
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = t('cat.' + c);
      tr.appendChild(th);
      for (let b = 1; b <= E.MAX_BET; b++) {
        const td = document.createElement('td');
        td.textContent = num(E.payout(c, b));
        tr.appendChild(td);
        payCols[b - 1].push(td);
      }
      $('pay-body').appendChild(tr);
      payRows[c] = tr;
    });
  }

  const slots = [];
  function buildHand() {
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.dataset.i = String(i);
      b.appendChild(PC.render(null, { label: false }));
      const tag = document.createElement('span');
      tag.className = 'held-tag';
      tag.setAttribute('aria-hidden', 'true');
      tag.textContent = t('card.held');
      b.appendChild(tag);
      b.addEventListener('click', (e) => {
        hold(i);
        if (e.detail > 0) b.blur(); // bấm chuột / chạm: trả phím Space cho Chia / Rút
      });
      $('hand').appendChild(b);
      slots.push(b);
    }
  }
  const cardEl = (i) => slots[i].querySelector('.pnc');
  /** Thay lá ở ô i (card null = lá úp không biết mặt). */
  function setCard(i, card, faceUp) {
    const el = PC.render(card, { faceUp, label: false });
    slots[i].replaceChild(el, cardEl(i));
    return el;
  }

  /** Cỡ lá theo khung: vừa 5 lá theo bề ngang và chiều cao còn lại (chừa nhãn GIỮ). */
  function fitCards() {
    const area = $('hand-area');
    const w = area.clientWidth;
    const h = area.clientHeight;
    if (!w || !h) return;
    const gap = Math.max(6, Math.min(14, w * 0.02));
    const cw = Math.floor(Math.min((w - gap * 4) / 5, (h - 26) / 1.4, 132));
    $('hand').style.setProperty('--card-w', Math.max(36, cw) + 'px');
    $('hand').style.setProperty('--gap', gap + 'px');
  }

  /* ---------------- Vẽ ---------------- */
  function cardList(idx) {
    return idx.map((i) => PC.rankLabel(game.hand[i]) + PC.suitSymbol(game.hand[i])).join(' ');
  }

  function message() {
    if (E.isOver(game)) return game.credits <= 0 ? t('msg.broke') : t('msg.over', { n: num(game.credits) });
    if (game.phase === 'hold') {
      const c = E.evaluate(game.hand);
      return c ? t('msg.have', { cat: t('cat.' + c) }) : t('msg.hold');
    }
    if (game.last) {
      return game.last.cat ? t('msg.win', { cat: t('cat.' + game.last.cat), n: num(game.last.pay) }) : t('msg.lose', { n: game.last.bet });
    }
    return game.hands === 0 ? t('msg.start') : t('msg.bet', { n: game.bet });
  }

  function render() {
    const hold = game.phase === 'hold';
    const over = E.isOver(game);
    $('credits').textContent = num(game.credits);
    $('bet').textContent = String(game.bet);
    $('left').textContent = String(E.handsLeft(game));
    $('badge-assisted').hidden = !game.assisted;

    // Bảng trả: cột cược hiện tại, hàng của bài đang cầm (khi giữ) hoặc hàng vừa thắng
    payCols.forEach((cells, i) => cells.forEach((c) => c.classList.toggle('on', i + 1 === game.bet)));
    const now = hold ? E.evaluate(game.hand) : null;
    const won = !hold && !busy && game.last ? game.last.cat : null;
    E.CATS.forEach((c) => {
      payRows[c].classList.toggle('now', c === now);
      payRows[c].classList.toggle('win', c === won);
    });

    const m = $('msg');
    m.textContent = busy ? ' ' : message();
    m.classList.toggle('good', !busy && !hold && !!(game.last && game.last.cat));

    // Lá: nhãn đọc màn hình, giữ, gợi ý, lá ăn tiền
    const win = !hold && !busy && game.last && game.last.cat && game.hand.length ? E.winningCards(game.hand) : [];
    const sug = hold && suggestion && suggestOn() ? suggestion.held : null;
    slots.forEach((b, i) => {
      const card = game.hand[i];
      const el = cardEl(i);
      const up = el.classList.contains('pnc-up');
      b.classList.toggle('held', hold && game.held[i]);
      b.disabled = !hold || busy;
      b.setAttribute('aria-pressed', String(hold && game.held[i]));
      const name = card && up ? PC.cardName(card, kit.i18n.lang) : null;
      b.setAttribute('aria-label', name ? t(hold && game.held[i] ? 'card.ariaHeld' : 'card.aria', { i: i + 1, name }) : t('card.back', { i: i + 1 }));
      el.classList.toggle('pnc-selected', hold && game.held[i] && !busy);
      el.classList.toggle('pnc-highlight', !busy && ((sug && sug[i]) || win.indexOf(i) >= 0));
    });

    // Gợi ý
    // Hàng gợi ý giữ chỗ suốt khi bật (lá không đổi cỡ giữa các tay), chỉ hiện chữ khi đang giữ lá
    const showSug = hold && !busy && suggestOn() && suggestion;
    const row = $('suggest-row');
    if (row.hidden === suggestOn()) {
      row.hidden = !suggestOn();
      fitCards();
    }
    row.classList.toggle('idle', !showSug);
    $('btn-apply').disabled = !showSug;
    if (showSug) {
      const idx = [0, 1, 2, 3, 4].filter((i) => suggestion.held[i]);
      $('suggest-text').textContent = idx.length ? t('msg.suggest', { cards: cardList(idx) }) : t('msg.suggestNone');
      $('btn-apply').disabled = suggestion.held.every((h, i) => h === game.held[i]);
    }

    // Nút
    $('btn-bet-one').disabled = busy || !E.canDeal(game);
    $('btn-bet-max').disabled = busy || !E.canDeal(game);
    $('btn-bet-one').setAttribute('aria-label', t('ctl.betAria', { n: game.bet }));
    $('deal-text').textContent = t(hold ? 'ctl.draw' : over ? 'ctl.new' : 'ctl.deal');
    $('btn-deal').disabled = busy;
    $('btn-deal').classList.toggle('draw', hold);
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && E.started(game) && !E.isOver(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const avg = stats.games ? Math.round(stats.sum / stats.games) : null;
    const st = [];
    if (stats.best != null) st.push({ value: num(stats.best), label: t('hud.best') });
    if (avg != null) st.push({ value: num(avg), label: t('summary.avg') });
    const h = Math.min(E.HANDS, game ? game.hands + 1 : 1);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.best == null ? t('summary.none') : t('summary.note', { n: num(stats.best) }),
      stats: st,
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { h, n: num(game.credits) }), pct: game.hands / E.HANDS } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Gợi ý ---------------- */
  /** Gợi ý đang bật và có tay đang chơi thì tính cách giữ tốt nhất, đánh dấu phiên có trợ giúp. */
  function noteAssist() {
    if (game.phase !== 'hold' || !suggestOn()) return;
    if (!suggestion) suggestion = E.bestHold(game.hand, game.bet);
    if (!game.assisted) {
      game = E.markAssisted(game);
      persist();
    }
  }

  /* ---------------- Lật bài ---------------- */
  /** Úp các ô idx (song song), đặt lá mới úp vào, rồi lật lên lần lượt. */
  async function reveal(idx, cards) {
    const down = idx.filter((i) => cardEl(i).classList.contains('pnc-up'));
    if (down.length) {
      await Promise.all(down.map((i) => PC.flip(cardEl(i), false, { duration: 220 })));
    }
    idx.forEach((i) => setCard(i, cards[i], false));
    for (let k = 0; k < idx.length; k++) {
      const el = cardEl(idx[k]);
      kit.sfx('flip');
      const p = PC.flip(el, true, { duration: 260 });
      if (k === idx.length - 1) await p;
      else await wait(85);
    }
  }

  /* ---------------- Luồng phiên ---------------- */
  function newGame() {
    game = E.newGame((Math.random() * 4294967296) >>> 0);
    suggestion = null;
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    for (let i = 0; i < 5; i++) setCard(i, null, false);
    render();
    writeSummary();
  }

  async function dealOrDraw() {
    if (busy || !game || kit.modal.current()) return;
    if (game.phase === 'hold') return doDraw();
    if (E.isOver(game)) return requestNew();
    if (!E.canDeal(game)) return;
    game = E.deal(game);
    suggestion = null;
    noteAssist();
    persist(); // lưu ngay: tải lại trang không chia lại được
    busy = true;
    render();
    await reveal([0, 1, 2, 3, 4], game.hand);
    busy = false;
    render();
  }

  async function doDraw() {
    const prev = game;
    game = E.draw(game);
    suggestion = null;
    const changed = [0, 1, 2, 3, 4].filter((i) => !prev.held[i]);
    stats.hands++;
    if (game.last.cat === 'royal') stats.royals++;
    saveStats();
    persist();
    busy = true;
    render();
    await reveal(changed, game.hand);
    busy = false;
    const c = game.last.cat;
    if (c) {
      const i = E.CATS.indexOf(c);
      kit.sfx(c === 'royal' ? 'levelup' : i <= 2 ? 'combo' : 'coin');
      if (c === 'royal') {
        kit.toast(t('toast.royal'));
        kit.confetti();
      }
      const row = payRows[c];
      row.classList.remove('flash');
      void row.offsetWidth; // chạy lại hiệu ứng nhấp nháy
      row.classList.add('flash');
    } else {
      kit.sfx('drop');
    }
    render();
    if (E.isOver(game)) finish();
  }

  function hold(i) {
    if (busy || !game || kit.modal.current() || game.phase !== 'hold') return;
    game = E.toggleHold(game, i);
    kit.sfx('tap');
    persist();
    render();
  }

  function applySuggestion() {
    if (busy || !suggestion || game.phase !== 'hold') return;
    game = E.setHeld(game, suggestion.held);
    kit.sfx('tap');
    persist();
    render();
  }

  function bet(next) {
    if (busy || !game || kit.modal.current() || !E.canDeal(game)) return;
    const before = game.bet;
    game = next(game);
    if (game.bet !== before) {
      kit.sfx('coin');
      persist();
    }
    render();
  }
  const betOne = () => bet(E.betOne);
  /** Cược tối đa rồi chia luôn (như máy thật). */
  function betMax() {
    if (busy || !game || kit.modal.current() || !E.canDeal(game)) return;
    bet(E.betMax);
    dealOrDraw();
  }

  function finish() {
    const credits = game.credits;
    const won = credits > E.START_CREDITS;
    const best = stats.best == null || credits > stats.best;
    stats.played++;
    stats.games++;
    stats.sum += credits;
    if (won) stats.won++;
    if (best) stats.best = credits;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won, score: credits, assisted: !!game.assisted });
    $('end-title').textContent = t(credits <= 0 ? 'end.broke' : 'end.title');
    $('end-credits').textContent = num(credits);
    const net = credits - E.START_CREDITS;
    $('end-net').textContent = (net > 0 ? '+' : '') + num(net);
    $('end-net').className = net > 0 ? 'up' : net < 0 ? 'down' : '';
    $('end-hands').textContent = String(game.hands);
    $('end-best-hand').textContent = game.best ? t('cat.' + game.best) : t('end.none');
    const badge = $('end-badge');
    badge.textContent = t(won ? 'end.won' : 'end.lost') + (best && credits > 0 ? ' · ' + t('end.best') : '');
    badge.classList.toggle('good', won);
    $('end-assisted').hidden = !game.assisted;
    const ended = game;
    setTimeout(() => {
      if (game !== ended) return; // đã bắt đầu phiên mới trong lúc chờ
      kit.sfx(won ? 'win' : 'lose');
      if (won) kit.confetti();
      kit.modal.open('modal-end');
    }, reduced() ? 0 : 700);
  }

  /** Phiên đang dở (đã chia) thì hỏi trước, vì bỏ phiên là kết thúc với số xu hiện có và tính thua. */
  function requestNew() {
    if (busy) return;
    if (inPlay()) {
      $('confirm-text').textContent = t('confirm.text', { n: num(game.credits) });
      kit.modal.open('modal-confirm');
    } else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, score: game.credits, assisted: !!game.assisted });
    }
    newGame();
  }

  function fillStats() {
    $('stats-played').textContent = num(stats.played);
    $('stats-won').textContent = num(stats.won);
    $('stats-best').textContent = stats.best == null ? '–' : num(stats.best);
    $('stats-avg').textContent = stats.games ? num(Math.round(stats.sum / stats.games)) : '–';
    $('stats-hands').textContent = num(stats.hands);
    $('stats-royals').textContent = num(stats.royals);
  }

  // Người chơi đang đi bằng phím Tab (focus có chủ đích) hay bằng chuột / chạm
  let tabbing = false;
  document.addEventListener('pointerdown', () => { tabbing = false; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') tabbing = true; }, true);
  /** Nút đang focus do người chơi Tab tới: Space / Enter để trình duyệt bấm nút đó. */
  function keyboardFocus(el) {
    return tabbing && !!(el && el.closest && el.closest('button, input, a[href]'));
  }

  /* ---------------- Sự kiện ---------------- */
  buildPaytable();
  buildHand();
  $('btn-deal').addEventListener('click', (e) => {
    dealOrDraw();
    if (e.detail > 0) e.currentTarget.blur();
  });
  $('btn-bet-one').addEventListener('click', (e) => {
    betOne();
    if (e.detail > 0) e.currentTarget.blur();
  });
  $('btn-bet-max').addEventListener('click', (e) => {
    betMax();
    if (e.detail > 0) e.currentTarget.blur();
  });
  $('btn-apply').addEventListener('click', applySuggestion);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-end');
    newGame();
  });
  $('btn-stats').addEventListener('click', fillStats);
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    // Space / Enter trên nút người chơi Tab tới là cú bấm của trình duyệt.
    // Focus do chuột / chạm hoặc do modal trả về thì Space / Enter vẫn là Chia / Rút.
    if (k === ' ' || k === 'enter') {
      if (keyboardFocus(e.target)) return;
      dealOrDraw();
    } else if (k.length === 1 && k >= '1' && k <= '5') hold(Number(k) - 1);
    else if (k === 'b') betOne();
    else if (k === 'm') betMax();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  if (window.ResizeObserver) new ResizeObserver(fitCards).observe($('hand-area'));
  window.addEventListener('resize', fitCards);

  /* ---------------- Khởi động: mở lại phiên dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && E.started(restored) && !E.isOver(restored)) {
    game = restored;
    game.hand.forEach((c, i) => setCard(i, c, true));
    noteAssist();
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
  } else {
    newGame();
  }
  fitCards();
})();
