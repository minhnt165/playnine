/* =====================================================================
 * Bài Tám - Giao diện + luồng trận (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   Bạn là ghế 0 (dưới), ba máy Tây (1), Bắc (2), Đông (3), đi theo chiều kim đồng hồ.
 *   Chạm lá đang nhô lên để đánh (lá 8 thì chọn chất), chạm nọc / nút Rút để rút; rút rồi thì nút thành Bỏ lượt.
 *   Lá vừa rút không đánh được (hoặc hết bài để rút) thì tự bỏ lượt sau một nhịp đọc kịp.
 *   Máy đi với nhịp đọc kịp (Cài đặt: Chậm / Vừa / Nhanh); chuỗi hẹn giờ dừng khi đang mở hộp thoại
 *   hoặc trang bị ẩn, và bị hủy khi chia trận mới (biến `gen`).
 *   Báo trận cho cổng (metric wins, mode = mức máy easy / hard, một trận = một lần chơi):
 *   - Chia trận mới: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true)
 *   - Có người chạm mốc: kit.sdk.end({ mode, won: bạn chạm trước, timeMs, assisted: false })
 *   - Bỏ trận khi bạn đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = window.PNCards;
  const HUMAN = E.HUMAN;
  // Nhịp (ms): think = máy nghĩ, fly = lá bay, after = xem lá máy vừa rút, pass = đọc thông báo tự bỏ lượt,
  // round = dừng ở bàn trước khi hiện bảng điểm ván
  const PACE = {
    slow: { think: 1150, fly: 520, after: 650, pass: 1500, round: 1300 },
    normal: { think: 700, fly: 380, after: 420, pass: 1100, round: 1000 },
    fast: { think: 300, fly: 230, after: 200, pass: 750, round: 650 },
  };
  const HEADROOM = 12; // chỗ trống trên bài (số phím trên lá nhô lên), khớp .hand trong style.css
  const MAX_BACKS = 12; // số lá úp tối đa vẽ cho mỗi máy (đếm thật ở huy hiệu)

  let game = null;
  let gen = 0; // tăng mỗi khi chia trận mới: các chuỗi hẹn giờ của trận cũ tự dừng
  let busy = false; // đang có lá bay / máy đang đi / đang tự bỏ lượt
  let note = ''; // dòng nhỏ: nước vừa đi
  let hold = ''; // dòng chính tạm thời (đang tự bỏ lượt)
  let flash = ''; // dòng chính tạm thời (vừa chạm lá không đánh được)
  let flashTimer = 0;
  let sel = -1; // lá đang chọn bằng bàn phím (chỉ số trên tay), -1 = chưa chọn
  let pending8 = null; // lá 8 đang chờ gọi chất
  let roundTimer = 0;

  const kit = PNKit.init({
    gameId: 'baitam',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { speed: 'normal', level: 'easy', target: '100' },
    onSetting,
  });
  const t = kit.t;
  const lang = kit.i18n.lang;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pace = () => PACE[kit.settings.get().speed] || PACE.normal;
  const seatName = (s) => t('seat.' + s);
  const card = (id) => C.fromId(id);
  const short = (id) => C.rankLabel(card(id)) + C.suitSymbol(card(id));
  const suitText = (s) => C.suitSymbol(s) + ' ' + t('suit.' + s);

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: 0, won: 0, rounds: 0 };
    if (Number.isInteger(raw.played) && raw.played >= 0) s.played = raw.played;
    if (Number.isInteger(raw.won) && raw.won >= 0) s.won = Math.min(raw.won, s.played);
    if (Number.isInteger(raw.rounds) && raw.rounds >= 0) s.rounds = raw.rounds;
    return s;
  })();
  const winRate = () => (stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–');

  /* ---------------- Hẹn giờ: dừng khi mở hộp thoại / trang ẩn, bỏ hẳn khi đã sang trận khác ---------------- */
  function sleep(ms) {
    const g0 = gen;
    return new Promise((resolve) => {
      const tick = () => {
        if (g0 !== gen) return; // trận đã đổi: chuỗi này dừng luôn
        if (document.hidden || kit.modal.current()) {
          setTimeout(tick, 250);
          return;
        }
        resolve();
      };
      setTimeout(tick, ms);
    });
  }

  /** Lá bay từ phần tử / khung `from` tới `to` (đổi cỡ theo đích). flip: lật từ úp sang ngửa trong lúc bay. */
  function fly(from, to, id, opts) {
    const o = opts || {};
    if (reduceMotion || !from || !to) return Promise.resolve();
    const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
    const b = to.getBoundingClientRect ? to.getBoundingClientRect() : to;
    if (!a.width || !b.width) return Promise.resolve();
    const el = C.render(id ? card(id) : null, { label: false, faceUp: !!id && !o.flip && o.faceUp !== false, className: 'flyer' });
    el.style.left = a.left + 'px';
    el.style.top = a.top + 'px';
    el.style.setProperty('--card-w', a.width + 'px');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const ms = pace().fly;
    const s = b.width / a.width;
    const rot = o.rot || 0;
    const anim = el.animate(
      [{ transform: 'translate(0px, 0px) scale(1) rotate(0deg)' }, { transform: 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + s + ') rotate(' + rot + 'deg)' }],
      { duration: ms, easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' },
    );
    if (o.flip && id) C.flip(el, true, { duration: ms * 0.8 });
    return anim.finished.catch(() => {}).then(() => el.remove());
  }

  /* ---------------- Bố cục: cỡ lá theo chỗ trống; màn ngang thì Tây / Đông hai bên ---------------- */
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  let hw = 64;
  function layout() {
    const st = $('stage');
    const W = st.clientWidth;
    const H = st.clientHeight + (st.classList.contains('wide') ? 0 : 0);
    if (!W || !H) return;
    const wide = W > H * 1.25;
    st.classList.toggle('wide', wide);
    let cw;
    let ow;
    if (wide) {
      hw = clamp(H * 0.17, 44, 116);
      cw = clamp(H * 0.19, 44, 130);
      ow = clamp(H * 0.08, 22, 58);
    } else {
      hw = clamp(Math.min(W * 0.205, H * 0.145), 46, 100);
      cw = clamp(Math.min(W * 0.255, H * 0.17), 50, 112);
      ow = clamp(Math.min(W * 0.11, H * 0.07), 24, 50);
    }
    st.style.setProperty('--hw', Math.round(hw) + 'px');
    st.style.setProperty('--cw', Math.round(cw) + 'px');
    st.style.setProperty('--ow', Math.round(ow) + 'px');
    if (game) render();
  }

  /* ---------------- Vẽ ---------------- */
  const myTurn = () => !!game && game.phase === 'play' && game.turn === HUMAN;
  const humanCan = () => myTurn() && !busy && !kit.modal.current();

  function renderSeats() {
    const ow = parseFloat(getComputedStyle($('stage')).getPropertyValue('--ow')) || 32;
    for (let s = 1; s < 4; s++) {
      const el = $('seat-' + s);
      const n = game.hands[s].length;
      const shown = Math.min(n, MAX_BACKS);
      const top = s === 2;
      // Lá úp lệch nhau: hàng ngang (Bắc) hoặc cột dọc (Tây, Đông); nhiều lá thì khít lại
      const step = top ? ow * (shown > 8 ? 0.2 : 0.28) : ow * (shown > 8 ? 0.13 : 0.2);
      const w = top ? ow + step * Math.max(0, shown - 1) : ow;
      const h = ow * 1.4 + (top ? 0 : step * Math.max(0, shown - 1));
      let backs = '';
      for (let i = 0; i < shown; i++) backs += C.html(null, { label: false }).replace('class="pnc"', 'class="pnc" style="--i:' + i + '"');
      const active = game.phase === 'play' && game.turn === s;
      el.classList.toggle('active', active);
      el.classList.toggle('thinking', active && busy);
      el.classList.toggle('winner', game.phase !== 'play' && !!game.result && game.result.winner === s);
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', t('seat.aria', { name: seatName(s), cards: t('seat.cards', { n }), score: game.scores[s] }));
      el.innerHTML =
        '<div class="seat-cards" style="width:' + w + 'px;height:' + h + 'px;--step:' + step + 'px" aria-hidden="true">' + backs +
        (n ? '<span class="seat-count">' + n + '</span>' : '') + '</div>' +
        '<div class="seat-tag" aria-hidden="true"><span class="seat-name">' + seatName(s) + '</span>' +
        '<span class="seat-score">' + t('me.score', { n: game.scores[s] }) + '</span><span class="dots"><i></i><i></i><i></i></span></div>';
    }
  }

  /** Góc nghiêng nhẹ của lá trên chồng, cố định theo lá (không nhảy khi vẽ lại). */
  function tilt(id, k) {
    let h = k * 7;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    return ((h % 13) - 6) * 1.2;
  }

  function renderCenter() {
    const n = game.deck.length;
    const canDraw = humanCan() && E.canDraw(game) && !game.drawn;
    const deck = $('deck');
    let backs = '';
    const layers = n === 0 ? 0 : n > 20 ? 3 : n > 6 ? 2 : 1;
    for (let i = 0; i < layers; i++) backs += C.html(null, { label: false });
    $('deck-cards').innerHTML = layers ? backs : '<span class="deck-empty"></span>';
    $('deck-count').textContent = n;
    deck.disabled = !canDraw;
    deck.classList.toggle('ready', canDraw);
    deck.classList.toggle('hint', canDraw && E.legalPlays(game).length === 0);
    deck.setAttribute('aria-label', t('deck.label', { n }) + (canDraw ? '. ' + t('deck.draw') : ''));

    const pile = game.pile.slice(-3);
    $('pile-cards').innerHTML = pile.length
      ? pile.map((id, i) => C.html(card(id), { label: false }).replace('class="pnc ', 'style="--r:' + (i === pile.length - 1 ? tilt(id, 0) * 0.4 : tilt(id, i)) + 'deg" class="pnc ')).join('')
      : '<span class="pile-empty"></span>';
    const top = E.top(game);
    const called = top && card(top).rank === 8;
    const chip = $('suit-chip');
    chip.className = 'suit-chip s-' + game.suit + (called ? ' called' : '');
    $('suit-use').setAttribute('href', '#pnc-' + game.suit);
    $('pile').setAttribute('aria-label', t('pile.label', { card: top ? C.cardName(card(top), lang) : '–', suit: t('suit.' + game.suit) }) + (called ? ' (' + t('suit.called') + ')' : ''));
  }

  /* Bài trên tay: xếp theo chất (bích, cơ, nhép, rô: đen đỏ xen kẽ) rồi theo bậc, lá 8 để cuối */
  const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
  function sortKey(id) {
    const c = card(id);
    return c.rank === 8 ? 100 + SUIT_ORDER[c.suit] : SUIT_ORDER[c.suit] * 20 + c.rank;
  }
  /** Bài của bạn theo thứ tự hiển thị (chọn bằng bàn phím cũng theo thứ tự này). */
  const disp = () => (game ? game.hands[HUMAN].slice().sort((x, y) => sortKey(x) - sortKey(y)) : []);
  /** Lá đánh được theo thứ tự hiển thị (phím 1–9). */
  const dispPlays = () => {
    const plays = humanCan() ? E.legalPlays(game) : [];
    return disp().filter((id) => plays.indexOf(id) >= 0);
  };

  /* Giữ nguyên phần tử theo id để lá nhô / xòe có hiệu ứng.
     Lá to nhất có thể, các lá lệch nhau ít nhất 42% bề rộng (đọc được bậc + chất ở góc);
     nhiều lá tới mức phải thu nhỏ quá 20% thì xếp hai hàng (hàng sau lộ nửa trên). */
  const handEls = new Map();
  function renderHand() {
    const box = $('hand');
    const ids = disp();
    handEls.forEach((el, id) => {
      if (ids.indexOf(id) < 0) {
        el.remove();
        handEls.delete(id);
      }
    });
    const pad = 6;
    const Wi = Math.max(60, box.clientWidth - pad * 2);
    const n = ids.length;
    const fitW = (k) => (k > 1 ? Math.min(hw, Wi / (1 + (k - 1) * 0.42)) : hw);
    let rows = 1;
    let w = fitW(n);
    if (w < hw * 0.8 && n > 7) {
      rows = 2;
      w = fitW(Math.ceil(n / 2));
    }
    w = Math.max(30, w);
    const rowShift = rows === 2 ? w * 1.4 * 0.5 : 0;
    box.style.height = rows === 2 ? 'calc(' + (w * 1.4 + rowShift + HEADROOM + 4) + 'px + var(--lift))' : '';
    const plays = dispPlays();
    const mine = humanCan();
    if (sel >= n) sel = n - 1;
    const focusIdx = sel >= 0 ? sel : Math.max(0, ids.indexOf(plays[0]));
    const k0 = rows === 2 ? Math.ceil(n / 2) : n; // số lá hàng sau (hàng trên)
    ids.forEach((id, i) => {
      let el = handEls.get(id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'hc';
        el.dataset.id = id;
        el.appendChild(C.render(card(id), { label: false }));
        const key = document.createElement('span');
        key.className = 'hc-key';
        key.setAttribute('aria-hidden', 'true');
        el.appendChild(key);
        box.appendChild(el);
        handEls.set(id, el);
      }
      const row = i < k0 ? 0 : 1;
      const j = row ? i - k0 : i; // vị trí trong hàng
      const m = row ? n - k0 : k0; // số lá trong hàng
      const step = m > 1 ? Math.min(w * 0.74, (Wi - w) / (m - 1)) : 0;
      const x0 = pad + (Wi - (w + step * (m - 1))) / 2;
      const spread = rows === 2 ? Math.min(1.6, 14 / m) : Math.min(3.2, 28 / Math.max(m, 1));
      const k = j - (m - 1) / 2;
      el.style.setProperty('--w', w + 'px');
      el.style.setProperty('--x', x0 + j * step + 'px');
      el.style.setProperty('--y', (rows === 2 && row === 1 ? rowShift : 0) + Math.abs(k) * spread * 0.9 + 'px');
      el.style.setProperty('--rot', k * spread + 'deg');
      el.style.zIndex = row * 100 + j + 1;
      const pi = plays.indexOf(id);
      const can = pi >= 0;
      el.classList.toggle('can', can);
      const face = el.firstChild;
      face.classList.toggle('pnc-highlight', can);
      face.classList.toggle('pnc-disabled', mine && !can);
      face.classList.toggle('pnc-selected', i === sel);
      if (can && pi < 9) {
        el.dataset.key = pi + 1;
        el.lastChild.textContent = pi + 1;
      } else delete el.dataset.key;
      el.tabIndex = i === focusIdx ? 0 : -1;
      el.setAttribute('aria-label', C.cardName(card(id), lang) + (can ? ', ' + t('card.playable') : ''));
      el.setAttribute('aria-disabled', String(!can));
    });
  }

  function mainText() {
    if (flash) return flash;
    if (hold) return hold;
    if (game.phase === 'over') return t('status.matchOver');
    if (game.phase === 'round') return t('status.roundOver');
    if (game.turn !== HUMAN) return t('status.cpu', { name: seatName(game.turn) });
    const plays = E.legalPlays(game);
    if (game.drawn) return plays.length ? t('status.drewPlayable') : t('status.drewDead');
    const p = { suit: C.suitSymbol(game.suit), rank: C.rankLabel(card(E.top(game))) };
    if (!plays.length) return E.canDraw(game) ? t('status.noMatch', p) : t('status.stuck');
    return t('status.yourTurn', p);
  }

  function render() {
    if (!game) return;
    renderSeats();
    renderCenter();
    renderHand();
    const mine = $('seat-0');
    mine.classList.toggle('active', myTurn());
    mine.classList.toggle('winner', game.phase !== 'play' && !!game.result && game.result.winner === HUMAN);
    $('me-score').textContent = t('me.score', { n: game.scores[HUMAN] });
    $('round-info').textContent = t('info.round', { n: game.round, target: game.target }) + ' · ' + t('level.' + game.level);
    const act = $('btn-act');
    const passMode = myTurn() && !!game.drawn;
    $('act-label').textContent = t(passMode ? 'act.pass' : 'act.draw');
    act.disabled = !(humanCan() && (passMode ? E.canPass(game) : E.canDraw(game)));
    $('status-log').textContent = note;
    $('status-main').textContent = mainText();
    $('status').classList.toggle('you', myTurn() && !hold);
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => !!game && game.humanMoves > 0 && game.phase !== 'over';
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { won: stats.won, played: stats.played }) : t('summary.none'),
      stats: stats.played ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('summary.wins') }, { value: winRate(), label: t('summary.rate') }] : [],
      resume: inPlay()
        ? { title: t('app.name'), detail: t('summary.resume', { n: game.round, score: game.scores[HUMAN], target: game.target }), pct: Math.min(1, game.scores[HUMAN] / game.target) }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng trận ---------------- */
  function clearHand() {
    handEls.forEach((el) => el.remove());
    handEls.clear();
  }

  function newMatch() {
    gen++;
    busy = false;
    hold = '';
    flash = '';
    sel = -1;
    pending8 = null;
    clearTimeout(roundTimer);
    kit.modal.close('modal-round');
    const s = kit.settings.get();
    game = E.newMatch({ seed: (Math.random() * 4294967296) >>> 0, level: s.level, target: s.target });
    note = t('log.start', { n: 1, card: short(E.top(game)) });
    clock.reset();
    clearHand();
    kit.store.remove(keys.save);
    kit.sdk.start(game.level);
    writeSummary();
    advance();
  }

  /** Nước đầu tiên của bạn trong trận: đồng hồ bắt đầu chạy. */
  function firstAction() {
    if (game.humanMoves === 0) clock.resume();
  }

  /** Sau mỗi nước: lưu, hết ván thì tính điểm, không thì đi tiếp. */
  function afterMove() {
    persist();
    if (game.phase !== 'play') endRound();
    else advance();
  }

  /** Bước kế tiếp: máy tự đi; tới lượt bạn mà không còn gì làm được thì tự bỏ lượt sau một nhịp. */
  function advance() {
    render();
    if (!game || busy || game.phase !== 'play') return;
    if (game.turn !== HUMAN) {
      cpuTurn();
      return;
    }
    if (!E.legalPlays(game).length && E.canPass(game)) {
      const snap = game;
      busy = true;
      hold = game.drawn ? t('status.drewDead') : t('status.stuck');
      render();
      sleep(pace().pass).then(() => {
        if (game !== snap) return;
        busy = false;
        hold = '';
        doPass();
      });
    }
  }

  /* --- Lượt của máy: nghĩ, (rút), đánh / bỏ lượt --- */
  function seatCard(seat) {
    const cards = $('seat-' + seat).querySelectorAll('.seat-cards .pnc');
    return cards.length ? cards[cards.length - 1] : $('seat-' + seat).querySelector('.seat-cards');
  }

  async function cpuTurn() {
    const g0 = gen;
    const seat = game.turn;
    const p = pace();
    const name = seatName(seat);
    busy = true;
    render();
    await sleep(p.think);
    if (g0 !== gen) return;
    let a = E.aiAction(game);
    if (a.type === 'draw') {
      const next = E.draw(game);
      kit.sfx('flip');
      await fly($('deck-cards').lastElementChild || $('deck'), seatCard(seat), null);
      if (g0 !== gen) return;
      game = next;
      note = (next.last.reshuffled ? t('log.reshuffle') + '. ' : '') + t('log.draw', { name });
      persist();
      render();
      await sleep(p.after);
      if (g0 !== gen) return;
      a = E.aiAction(game);
    }
    if (a.type === 'play') {
      await fly(seatCard(seat), $('pile-cards'), a.card, { flip: true, rot: tilt(a.card, 0) * 0.4 });
      if (g0 !== gen) return;
      game = E.play(game, a.card, a.suit);
      note = a.suit ? t('log.play8', { name, card: short(a.card), suit: suitText(a.suit) }) : t('log.play', { name, card: short(a.card) });
      kit.sfx(a.suit ? 'combo' : 'place');
      busy = false;
      afterMove();
      if (a.suit) pulseChip();
      return;
    }
    game = E.pass(game);
    note = t('log.pass', { name });
    kit.sfx('tick');
    busy = false;
    afterMove();
  }

  function pulseChip() {
    const chip = $('suit-chip');
    chip.classList.remove('pulse');
    void chip.offsetWidth; // chạy lại hiệu ứng
    chip.classList.add('pulse');
  }

  /* --- Nước của bạn --- */
  function showFlash(msg) {
    flash = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = '';
      if (game) render();
    }, 1600);
    render();
  }

  function tryPlay(id) {
    if (!humanCan()) return;
    const el = handEls.get(id);
    if (E.legalPlays(game).indexOf(id) < 0) {
      kit.sfx('error');
      if (el) {
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
      }
      const p = { card: short(id), suit: C.suitSymbol(game.suit), rank: C.rankLabel(card(E.top(game))) };
      showFlash(game.drawn ? t('status.drewPlayable') : t('status.bad', p));
      return;
    }
    if (card(id).rank === 8) {
      openSuit(id);
      return;
    }
    doPlay(id);
  }

  async function doPlay(id, suit) {
    const g0 = gen;
    const el = handEls.get(id);
    busy = true;
    flash = '';
    firstAction();
    kit.sfx('tap');
    if (el) {
      const from = el.firstChild.getBoundingClientRect();
      el.classList.add('flying');
      render();
      await fly(from, $('pile-cards'), id, { rot: tilt(id, 0) * 0.4 });
    }
    if (g0 !== gen) return;
    game = E.play(game, id, suit);
    note = suit ? t('log.youPlay8', { card: short(id), suit: suitText(suit) }) : t('log.youPlay', { card: short(id) });
    kit.sfx(suit ? 'combo' : 'place');
    sel = -1;
    busy = false;
    afterMove();
    if (suit) pulseChip();
  }

  async function doDraw() {
    if (!humanCan() || !E.canDraw(game)) return;
    const g0 = gen;
    busy = true;
    flash = '';
    firstAction();
    const next = E.draw(game);
    const id = next.drawn;
    kit.sfx('flip');
    render();
    // Bay tới mép phải bài trên tay
    const hb = $('hand').getBoundingClientRect();
    const w = Math.min(hw, hb.width);
    const to = { left: Math.min(hb.right - w, hb.left + hb.width / 2 + w), top: hb.top + HEADROOM + hw * 0.22, width: w, height: w * 1.4 };
    await fly($('deck-cards').lastElementChild || $('deck'), to, id, { flip: true });
    if (g0 !== gen) return;
    game = next;
    note = (next.last.reshuffled ? t('log.reshuffle') + '. ' : '') + t('log.youDraw', { card: short(id) });
    if (sel >= 0) sel = disp().indexOf(id);
    busy = false;
    persist();
    advance();
  }

  function doPass() {
    if (!myTurn() || busy || !E.canPass(game)) return;
    firstAction();
    game = E.pass(game);
    note = t('log.youPass');
    sel = -1;
    kit.sfx('tick');
    afterMove();
  }

  /** Nút Rút / Bỏ lượt (phím D). */
  function act() {
    if (!humanCan()) return;
    if (game.drawn) doPass();
    else doDraw();
  }

  /* --- Gọi chất cho lá 8 --- */
  function openSuit(id) {
    pending8 = id;
    const rest = game.hands[HUMAN].filter((x) => x !== id);
    const best = E.bestSuit(rest, game.voids[1]);
    let bestBtn = null;
    document.querySelectorAll('#suit-grid .suit-btn').forEach((b) => {
      const s = b.dataset.suit;
      const n = rest.filter((x) => card(x).rank !== 8 && card(x).suit === s).length;
      b.querySelector('.suit-have').textContent = t('suit.have', { n });
      b.classList.toggle('best', s === best);
      if (s === best) bestBtn = b;
    });
    kit.modal.open('modal-suit');
    if (bestBtn) bestBtn.focus();
  }
  function chooseSuit(s) {
    const id = pending8;
    pending8 = null;
    kit.modal.close('modal-suit');
    if (id && humanCan() && E.legalPlays(game).indexOf(id) >= 0) doPlay(id, s);
  }

  /* --- Hết ván / hết trận --- */
  function endRound() {
    const r = game.result;
    const won = r.winner === HUMAN;
    if (won) stats.rounds++;
    if (game.phase === 'over') finishMatch();
    else kit.sfx(won ? 'coin' : 'drop');
    saveStats();
    persist();
    render();
    clearTimeout(roundTimer);
    roundTimer = setTimeout(showRound, reduceMotion ? 400 : pace().round);
  }

  function finishMatch() {
    clock.pause();
    const won = E.matchWinner(game) === HUMAN;
    stats.played++;
    if (won) stats.won++;
    saveStats();
    kit.sdk.end({ mode: game.level, won, timeMs: Math.round(clock.elapsed()), assisted: false });
    if (won) {
      kit.sfx('win');
      kit.confetti();
    } else {
      kit.sfx('lose');
    }
  }

  function leftCards(hand) {
    if (!hand.length) return '<span class="left-none">–</span>';
    return '<div class="left-cards">' + hand.map((id) => {
      const c = card(id);
      return '<span class="mc' + (C.isRed(c) ? ' red' : '') + (c.rank === 8 ? ' eight' : '') + '">' + short(id) + '</span>';
    }).join('') + '</div>';
  }

  function showRound() {
    if (!game || game.phase === 'play') return;
    const r = game.result;
    const over = game.phase === 'over';
    const name = seatName(r.winner);
    const you = r.winner === HUMAN;
    $('round-title').textContent = over ? (you ? t('match.won') : t('match.lost', { name })) : you ? t('round.won') : t('round.lost', { name });
    $('round-text').textContent = over ? t('match.text', { target: game.target }) : you ? t('round.textYou', { n: r.gain }) : t('round.text', { name, n: r.gain });
    $('round-rows').innerHTML = [0, 1, 2, 3].map((s) =>
      '<tr' + (s === r.winner ? ' class="win"' : '') + '><th scope="row">' + seatName(s) + '</th><td>' + leftCards(game.hands[s]) + '</td>' +
      '<td>' + (s === r.winner ? '+' + r.gain : r.points[s]) + '</td><td>' + game.scores[s] + '</td></tr>').join('');
    $('btn-next').hidden = over;
    $('btn-again').hidden = !over;
    kit.modal.open('modal-round');
  }

  function nextRound() {
    if (!game || game.phase !== 'round') return;
    kit.modal.close('modal-round');
    game = E.nextRound(game);
    note = t('log.start', { n: game.round, card: short(E.top(game)) });
    sel = -1;
    clearHand();
    kit.sfx('start');
    persist();
    advance();
  }

  /** Trận đang dở (bạn đã đi) thì hỏi trước, vì bỏ trận tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else {
      kit.sfx('start');
      newMatch();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      clock.pause();
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: game.level, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newMatch();
  }

  /** Đổi mức / mốc: trận chưa có nước nào của bạn thì chia lại ngay, không thì áp dụng từ trận sau. */
  function onSetting(key) {
    if (key !== 'level' && key !== 'target') return;
    if (!game) return;
    if (game.phase === 'play' && game.humanMoves === 0) newMatch();
    else kit.toast(t('toast.nextMatch'));
  }

  /* --- Bàn phím: chọn lá --- */
  function focusSel() {
    renderHand();
    const id = disp()[sel];
    const el = id && handEls.get(id);
    if (el) el.focus();
  }
  function moveSel(d) {
    if (!game) return;
    const ids = disp();
    const n = ids.length;
    if (!n) return;
    if (sel < 0) {
      const plays = dispPlays();
      sel = plays.length ? ids.indexOf(plays[0]) : d > 0 ? 0 : n - 1;
    } else sel = (sel + d + n) % n;
    focusSel();
  }
  function selectPlayable(i) {
    if (!humanCan()) return;
    const id = dispPlays()[i];
    if (!id) return;
    sel = disp().indexOf(id);
    focusSel();
  }
  function playSel() {
    if (!humanCan()) return;
    const id = disp()[sel];
    if (id) tryPlay(id);
    else selectPlayable(0);
  }

  /* ---------------- Sự kiện ---------------- */
  $('hand').addEventListener('click', (e) => {
    const b = e.target.closest('.hc');
    if (!b) return;
    sel = disp().indexOf(b.dataset.id);
    tryPlay(b.dataset.id);
  });
  $('deck').addEventListener('click', doDraw);
  $('btn-act').addEventListener('click', act);
  $('suit-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.suit-btn');
    if (b) chooseSuit(b.dataset.suit);
  });
  $('suit-grid').addEventListener('keydown', (e) => {
    const btns = Array.from(document.querySelectorAll('#suit-grid .suit-btn'));
    const i = btns.indexOf(document.activeElement);
    const k = e.key.toUpperCase();
    if (['S', 'H', 'D', 'C'].indexOf(k) >= 0) {
      e.preventDefault();
      chooseSuit(k);
      return;
    }
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
    if (i < 0 || !d) return;
    e.preventDefault();
    btns[(i + d + 4) % 4].focus();
  });
  $('btn-next').addEventListener('click', nextRound);
  $('btn-again').addEventListener('click', () => {
    kit.sfx('start');
    newMatch();
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-rate').textContent = winRate();
    $('stats-rounds').textContent = kit.i18n.fmtNumber(stats.rounds);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const btn = e.target.closest && e.target.closest('button');
    if (k === 'ArrowLeft' || k === 'ArrowRight') moveSel(k === 'ArrowLeft' ? -1 : 1);
    else if (/^[1-9]$/.test(k)) selectPlayable(Number(k) - 1);
    else if (k === 'Enter') {
      if (btn) return; // Enter trên nút đang focus (kể cả lá trên tay): để trình duyệt bấm nút
      playSel();
    } else if (k === 'd' || k === 'D') act();
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  window.addEventListener('resize', layout);

  /* ---------------- Khởi động: mở lại trận dở nếu có ---------------- */
  layout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.humanMoves > 0 && restored.phase !== 'over') {
    game = restored;
    note = '';
    clock.set(saved.elapsed);
    clock.resume(); // trận đã bắt đầu: đồng hồ chạy tiếp ngay
    kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    layout();
    if (game.phase === 'round') {
      render();
      showRound();
    } else advance();
  } else {
    newMatch();
  }
  layout();
})();
