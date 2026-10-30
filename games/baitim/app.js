/* =====================================================================
 * Bài Tim - Giao diện + luồng trận (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   Bạn là ghế 0 (dưới), ba máy Tây (1), Bắc (2), Đông (3), đi theo chiều kim đồng hồ.
 *   - Đầu ván: chạm 3 lá để chọn rồi bấm Chuyền (ván thứ 4, 8… không chuyền)
 *   - Khi đánh: lá ra được nhô lên, lá không ra được mờ đi; chạm lá để ra
 *   - Đủ 4 lá thì dừng một nhịp cho thấy ai ăn, rồi gom lá về người ăn
 *   Máy đi với nhịp đọc kịp (Cài đặt: Chậm / Vừa / Nhanh); chuỗi hẹn giờ dừng khi đang mở hộp thoại
 *   hoặc trang bị ẩn, và bị hủy khi chia trận mới (biến `gen`).
 *   Báo trận cho cổng (metric wins, mode = mức máy easy / medium / hard, một trận = một lần chơi):
 *   - Chia trận mới: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true)
 *   - Hết trận: kit.sdk.end({ mode, won: bạn ít điểm nhất, timeMs, assisted: false })
 *   - Bỏ trận khi bạn đã đi ít nhất một nước (chuyền hoặc ra lá): won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = window.PNCards;
  const HUMAN = E.HUMAN;
  // Nhịp (ms): think = máy nghĩ (+ ngẫu nhiên tới jitter), fly = lá bay, trick = xem nước đủ 4 lá,
  // round = dừng ở bàn trước khi hiện bảng điểm ván
  const PACE = {
    slow: { think: 900, jitter: 350, fly: 480, trick: 1300, round: 1200 },
    normal: { think: 450, jitter: 400, fly: 340, trick: 900, round: 900 },
    fast: { think: 250, jitter: 200, fly: 220, trick: 550, round: 600 },
  };
  const HEADROOM = 12; // chỗ trống trên bài (số phím trên lá nhô lên), khớp .hand trong style.css
  const SUIT_ORDER = { C: 0, D: 1, S: 2, H: 3 }; // nhép, rô, bích, cơ: đen đỏ xen kẽ

  let game = null;
  let gen = 0; // tăng mỗi khi chia trận mới: các chuỗi hẹn giờ của trận cũ tự dừng
  let busy = false; // đang có lá bay / máy đang đi / đang gom nước
  let note = ''; // dòng nhỏ: nước vừa đi
  let flash = ''; // dòng chính tạm thời (vừa chạm lá không ra được)
  let flashTimer = 0;
  let sel = -1; // lá đang chọn bằng bàn phím (chỉ số trên tay), -1 = chưa chọn
  let picks = []; // lá đang chọn để chuyền
  let showing = null; // nước vừa đủ 4 lá (đang xem trước khi gom), { cards, winner }
  let roundTimer = 0;

  const kit = PNKit.init({
    gameId: 'baitim',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { speed: 'normal', level: 'medium' },
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
  const shortList = (ids) => sortIds(ids).map(short).join(' ');
  const roundPts = (s) => E.sumPoints(game.taken[s]);
  /** Hướng chuyền của ván n, dạng chữ ("chuyền sang trái" / "không chuyền"). */
  const dirText = (n) => {
    const d = E.passOffset(n);
    return d ? t('info.pass', { dir: t('dir.' + d) }) : t('dir.0');
  };

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: 0, won: 0, best: null, moons: 0, rounds: 0 };
    if (Number.isInteger(raw.played) && raw.played >= 0) s.played = raw.played;
    if (Number.isInteger(raw.won) && raw.won >= 0) s.won = Math.min(raw.won, s.played);
    if (Number.isInteger(raw.best) && raw.best >= 0) s.best = raw.best;
    if (Number.isInteger(raw.moons) && raw.moons >= 0) s.moons = raw.moons;
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
    const el = C.render(id ? card(id) : null, { label: false, faceUp: !!id && !o.flip && !o.back, className: 'flyer' });
    el.style.left = a.left + 'px';
    el.style.top = a.top + 'px';
    el.style.setProperty('--card-w', a.width + 'px');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const ms = o.ms || pace().fly;
    const s = b.width / a.width;
    const anim = el.animate(
      [{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, { transform: 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + s + ')', opacity: o.fade ? 0.2 : 1 }],
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
    const H = st.clientHeight;
    if (!W || !H) return;
    const wide = W > H * 1.25;
    st.classList.toggle('wide', wide);
    let ow;
    if (wide) {
      hw = clamp(H * 0.16, 40, 104);
      ow = clamp(H * 0.075, 20, 48);
    } else {
      hw = clamp(Math.min(W * 0.2, H * 0.135), 44, 96);
      ow = clamp(Math.min(W * 0.085, H * 0.05), 20, 40);
    }
    st.style.setProperty('--hw', Math.round(hw) + 'px');
    st.style.setProperty('--ow', Math.round(ow) + 'px');
    if (game) {
      renderSeats();
      renderHand();
    }
    // Cỡ lá giữa bàn: vừa chỗ còn lại sau ba máy và dòng trạng thái (nước xếp chữ thập: dọc rộng 3,1 lá × cao 1,9 lá ngửa; ngang 3,6 × 1,55)
    const tb = $('table');
    const side = Math.max($('seat-1').offsetWidth, $('seat-3').offsetWidth);
    const cwW = (tb.clientWidth - side * 2 - 36) / (wide ? 3.6 : 3.1);
    const cwH = (tb.clientHeight - $('seat-2').offsetHeight - $('status').offsetHeight - 30) / (1.4 * (wide ? 1.55 : 1.9));
    st.style.setProperty('--cw', Math.round(clamp(Math.min(cwW, cwH), 34, 104)) + 'px');
    if (game) render();
  }

  /* ---------------- Vẽ ---------------- */
  const myTurn = () => !!game && game.phase === 'play' && game.turn === HUMAN && !showing;
  const humanCan = () => myTurn() && !busy && !kit.modal.current();
  const passing = () => !!game && game.phase === 'pass';

  function sortKey(id) {
    return SUIT_ORDER[E.suitOf(id)] * 20 + E.val(id);
  }
  function sortIds(ids) {
    return ids.slice().sort((x, y) => sortKey(x) - sortKey(y));
  }

  function renderSeats() {
    const ow = parseFloat(getComputedStyle($('stage')).getPropertyValue('--ow')) || 30;
    for (let s = 1; s < 4; s++) {
      const el = $('seat-' + s);
      const n = game.hands[s].length;
      const top = s === 2;
      // Lá úp lệch nhau: hàng ngang (Bắc) hoặc cột dọc (Tây, Đông); nhiều lá thì khít lại
      const step = top ? ow * (n > 8 ? 0.2 : 0.3) : ow * (n > 8 ? 0.12 : 0.2);
      const w = top ? ow + step * Math.max(0, n - 1) : ow;
      const h = ow * 1.4 + (top ? 0 : step * Math.max(0, n - 1));
      let backs = '';
      for (let i = 0; i < n; i++) backs += C.html(null, { label: false }).replace('class="pnc"', 'class="pnc" style="--i:' + i + '"');
      const active = game.phase === 'play' && game.turn === s && !showing;
      const pts = roundPts(s);
      el.classList.toggle('active', active);
      el.classList.toggle('thinking', active && busy);
      el.classList.toggle('took', !!showing && showing.winner === s);
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', t('seat.aria', { name: seatName(s), cards: t('seat.cards', { n }), score: game.scores[s], round: pts }));
      el.innerHTML =
        '<div class="seat-cards" style="width:' + w + 'px;height:' + h + 'px;--step:' + step + 'px" aria-hidden="true">' + backs + '</div>' +
        '<div class="seat-tag" aria-hidden="true"><span class="avatar av-' + s + '">' + seatName(s).charAt(0) + '</span>' +
        '<span class="seat-text"><span class="seat-name">' + seatName(s) + '</span>' +
        '<span class="seat-score">' + t('me.score', { n: game.scores[s] }) + '</span></span>' +
        (pts ? '<span class="pts-chip' + (game.taken[s].indexOf(E.QS) >= 0 ? ' queen' : '') + '">+' + pts + '</span>' : '') +
        '<span class="dots"><i></i><i></i><i></i></span></div>';
    }
  }

  /** Nước giữa bàn: các lá đang đánh (hoặc nước vừa đủ 4 lá, lá thắng sáng lên). */
  function renderTrick() {
    const cards = showing ? showing.cards : game.trick;
    const win = showing ? showing.cards.find((p) => p.seat === showing.winner) : null;
    for (let s = 0; s < 4; s++) {
      const slot = $('slot-' + s);
      const i = cards.findIndex((p) => p.seat === s);
      if (i < 0) {
        slot.innerHTML = '';
        continue;
      }
      const id = cards[i].card;
      if (slot.dataset.id !== id || !slot.firstChild) slot.innerHTML = C.html(card(id), { label: false });
      slot.dataset.id = id;
      slot.style.zIndex = i + 1;
      slot.firstChild.classList.toggle('pnc-highlight', !!win && win.card === id);
    }
    const passD = passing() ? E.passOffset(game.round) : 0;
    const hint = $('pass-hint');
    hint.className = 'pass-hint' + (passD ? ' d' + passD : '');
    $('trick').setAttribute('aria-label', cards.length ? t('trick.label', { cards: cards.map((p) => seatName(p.seat) + ' ' + C.cardName(card(p.card), lang)).join(', ') }) : t('trick.empty'));
  }

  /** Bài của bạn theo thứ tự hiển thị (chọn bằng bàn phím cũng theo thứ tự này). */
  const disp = () => (game ? sortIds(game.hands[HUMAN]) : []);
  /** Lá ra được theo thứ tự hiển thị (phím 1–9). */
  const dispPlays = () => {
    const plays = humanCan() ? E.legalPlays(game) : [];
    return disp().filter((id) => plays.indexOf(id) >= 0);
  };
  /** Lá vừa nhận (sáng lên tới khi bạn ra lá đầu tiên của ván). */
  const recv = () => (game && game.phase === 'play' && game.tricks === 0 && game.hands[HUMAN].length === 13 ? E.received(game, HUMAN) : []);

  /* Giữ nguyên phần tử theo id để lá nhô / xòe có hiệu ứng.
     Lá to nhất có thể, các lá lệch nhau ít nhất 42% bề rộng (đọc được bậc + chất ở góc);
     màn dọc nhiều lá thì xếp hai hàng (hàng sau lộ nửa trên) cho dễ chạm. */
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
    // Màn dọc mà mỗi lá chỉ lộ < 36px (khó chạm) thì xếp hai hàng, lá to hơn
    if (n > 7 && !$('stage').classList.contains('wide') && (Wi - w) / (n - 1) < 36) {
      rows = 2;
      w = fitW(Math.ceil(n / 2));
    }
    w = Math.max(30, w);
    const rowShift = rows === 2 ? w * 1.4 * 0.5 : 0;
    box.style.height = rows === 2 ? 'calc(' + (w * 1.4 + rowShift + HEADROOM + 4) + 'px + var(--lift))' : '';
    const pass = passing();
    const plays = dispPlays();
    const mine = humanCan();
    const got = recv();
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
      const spread = rows === 2 ? Math.min(1.6, 12 / m) : Math.min(3, 18 / Math.max(m, 1));
      const k = j - (m - 1) / 2;
      el.style.setProperty('--w', w + 'px');
      el.style.setProperty('--x', x0 + j * step + 'px');
      el.style.setProperty('--y', (rows === 2 && row === 1 ? rowShift : 0) + Math.abs(k) * spread * 0.9 + 'px');
      el.style.setProperty('--rot', k * spread + 'deg');
      el.style.zIndex = row * 100 + j + 1;
      el.style.setProperty('--d', i);
      const picked = pass && picks.indexOf(id) >= 0;
      const pi = plays.indexOf(id);
      const can = pi >= 0;
      el.classList.toggle('can', can || picked);
      el.classList.toggle('pick', pass);
      const face = el.firstChild;
      face.classList.toggle('pnc-highlight', can);
      face.classList.toggle('pnc-selected', picked || i === sel);
      face.classList.toggle('pnc-disabled', mine && !can);
      el.classList.toggle('got', got.indexOf(id) >= 0);
      if (can && pi < 9) {
        el.dataset.key = pi + 1;
        el.lastChild.textContent = pi + 1;
      } else delete el.dataset.key;
      el.tabIndex = i === focusIdx ? 0 : -1;
      let label = C.cardName(card(id), lang);
      if (can) label += ', ' + t('card.playable');
      if (picked) label += ', ' + t('card.picked');
      if (got.indexOf(id) >= 0) label += ', ' + t('card.received');
      el.setAttribute('aria-label', label);
      el.setAttribute('aria-disabled', String(!(can || (pass && !busy))));
      el.setAttribute('aria-pressed', pass ? String(picked) : 'false');
    });
  }

  function mainText() {
    if (flash) return flash;
    if (game.phase === 'over') return t('status.matchOver');
    if (game.phase === 'round') return t('status.roundOver');
    if (passing()) {
      const p = { dir: t('dir.' + E.passOffset(game.round)), name: seatName(E.passTarget(game, HUMAN)) };
      return picks.length === 3 ? t('status.pickReady', p) : t('status.pick', p);
    }
    if (showing) return game.last && game.last.winner === HUMAN ? t('log.youTrick') : t('log.trick', { name: seatName(showing.winner) });
    if (game.turn !== HUMAN) return t('status.cpu', { name: seatName(game.turn) });
    if (!game.trick.length) {
      if (game.tricks === 0) return t('status.lead2C');
      return game.broken ? t('status.lead') : t('status.leadNoHearts');
    }
    const led = E.ledSuit(game);
    const suit = C.suitSymbol(led) + ' ' + t('suit.' + led);
    if (game.hands[HUMAN].some((id) => E.suitOf(id) === led)) return t('status.follow', { suit });
    return t(game.tricks === 0 ? 'status.discardFirst' : 'status.discard', { suit });
  }

  function render() {
    if (!game) return;
    renderSeats();
    renderTrick();
    renderHand();
    const mine = $('seat-0');
    mine.classList.toggle('active', myTurn() || passing());
    mine.classList.toggle('took', !!showing && showing.winner === HUMAN);
    $('me-score').textContent = t('me.score', { n: game.scores[HUMAN] });
    const pts = roundPts(HUMAN);
    const chip = $('me-round');
    chip.hidden = !pts;
    chip.textContent = '+' + pts;
    chip.classList.toggle('queen', game.taken[HUMAN].indexOf(E.QS) >= 0);
    $('round-info').textContent = t('info.round', { n: game.round, dir: dirArrow(game.round) ? ' ' + dirArrow(game.round) : '' });
    const act = $('btn-act');
    act.hidden = !passing();
    $('act-label').textContent = t('act.pass', { n: picks.length });
    act.disabled = !(passing() && picks.length === 3 && !busy);
    $('status-log').textContent = note;
    $('status-main').textContent = mainText();
    $('status').classList.toggle('you', (myTurn() || passing()) && !flash);
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
        ? { title: t('app.name'), detail: t('summary.resume', { n: game.round, score: game.scores[HUMAN] }), pct: Math.min(1, Math.max(...game.scores) / E.TARGET) }
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
  function resetUi() {
    busy = false;
    flash = '';
    sel = -1;
    picks = [];
    showing = null;
    clearTimeout(roundTimer);
    clearHand();
  }

  function newMatch() {
    gen++;
    resetUi();
    kit.modal.close('modal-round');
    const s = kit.settings.get();
    game = E.newMatch({ seed: (Math.random() * 4294967296) >>> 0, level: s.level });
    note = '';
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(game.level);
    writeSummary();
    dealt();
  }

  /** Vừa chia ván: ván không chuyền thì báo, rồi đi tiếp. */
  async function dealt() {
    if (game.phase === 'play') note = t('log.noPass', { n: game.round });
    kit.sfx('flip');
    if (reduceMotion) {
      advance();
      return;
    }
    // Hoạt cảnh chia: lá trên tay lần lượt bay từ giữa bàn xuống (CSS .hand.deal), máy chờ chia xong mới đi
    const g0 = gen;
    const hand = $('hand');
    busy = true;
    hand.classList.add('deal');
    render();
    await sleep(13 * 45 + 400);
    hand.classList.remove('deal');
    if (g0 !== gen) return;
    busy = false;
    advance();
  }

  /** Nước đầu tiên của bạn trong trận: đồng hồ bắt đầu chạy. */
  function firstAction() {
    if (game.humanMoves === 0) clock.resume();
  }

  /** Bước kế tiếp: máy tự đi; tới lượt bạn thì chờ. */
  function advance() {
    render();
    if (!game || busy || showing || game.phase !== 'play') return;
    if (game.turn !== HUMAN) cpuTurn();
  }

  function seatCard(seat) {
    const cards = $('seat-' + seat).querySelectorAll('.seat-cards .pnc');
    return cards.length ? cards[cards.length - 1] : $('seat-' + seat).querySelector('.seat-tag');
  }
  /** Ô đích của lá trên bàn (cỡ --cw, đúng chỗ của ghế). */
  const slotBox = (seat) => $('slot-' + seat).getBoundingClientRect();

  /* --- Lượt của máy --- */
  async function cpuTurn() {
    const g0 = gen;
    const seat = game.turn;
    const p = pace();
    busy = true;
    render();
    await sleep(p.think + Math.random() * p.jitter);
    if (g0 !== gen) return;
    const id = E.aiPlay(game);
    await fly(seatCard(seat), slotBox(seat), id, { flip: true });
    if (g0 !== gen) return;
    afterPlay(E.play(game, id), seat, id);
  }

  /* --- Nước của bạn --- */
  function showFlash(msg) {
    flash = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = '';
      if (game) render();
    }, 1800);
    render();
  }
  function nope(id) {
    kit.sfx('error');
    const el = handEls.get(id);
    if (el) {
      el.classList.remove('nope');
      void el.offsetWidth; // chạy lại hiệu ứng
      el.classList.add('nope');
    }
  }

  /** Vì sao lá này không ra được (để báo cho người chơi). */
  function whyNot(id) {
    if (!game.trick.length) return game.tricks === 0 ? t('status.bad2C') : t('status.badHearts');
    const led = E.ledSuit(game);
    if (game.hands[HUMAN].some((x) => E.suitOf(x) === led)) return t('status.bad', { suit: C.suitSymbol(led) + ' ' + t('suit.' + led) });
    return t('status.badFirst');
  }

  async function tryPlay(id) {
    if (!humanCan()) return;
    if (E.legalPlays(game).indexOf(id) < 0) {
      nope(id);
      showFlash(whyNot(id));
      return;
    }
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
      await fly(from, slotBox(HUMAN), id);
    }
    if (g0 !== gen) return;
    sel = -1;
    afterPlay(E.play(game, id), HUMAN, id);
  }

  /** Sau mỗi lá: ghi nhật ký, lưu; đủ 4 lá thì xem nước rồi gom về người ăn; hết ván thì tính điểm. */
  async function afterPlay(next, seat, id) {
    const g0 = gen;
    const wasBroken = game.broken;
    game = next;
    note = seat === HUMAN ? t('log.youPlay', { card: short(id) }) : t('log.play', { name: seatName(seat), card: short(id) });
    kit.sfx(id === E.QS ? 'drop' : 'place');
    if (!wasBroken && game.broken) kit.toast(t('toast.broken'));
    persist();
    if (game.trick.length) {
      busy = false;
      advance();
      return;
    }
    // Đủ 4 lá: xem ai ăn
    showing = { cards: game.last.cards, winner: game.last.winner };
    busy = true;
    render();
    await sleep(pace().trick);
    if (g0 !== gen) return;
    const w = showing.winner;
    const pts = E.sumPoints(showing.cards.map((p) => p.card));
    kit.sfx(pts ? (w === HUMAN ? 'drop' : 'capture') : 'move');
    if (!reduceMotion) {
      const to = w === HUMAN ? $('hand') : seatCard(w);
      const tr = to.getBoundingClientRect();
      const ow = Math.max(24, Math.min(tr.width, 48));
      const dst = { left: tr.left + tr.width / 2 - ow / 2, top: tr.top + (w === HUMAN ? 10 : tr.height / 2 - ow * 0.7), width: ow, height: ow * 1.4 };
      const flights = showing.cards.map((p) => fly($('slot-' + p.seat).firstChild, dst, p.card, { fade: true, ms: pace().fly * 1.1 }));
      for (let s = 0; s < 4; s++) $('slot-' + s).innerHTML = '';
      await Promise.all(flights);
      if (g0 !== gen) return;
    }
    if (game.last.cards.some((p) => p.card === E.QS)) kit.toast(t('toast.queen', { name: seatName(w) }));
    const ptsKey = w === HUMAN ? (pts ? 'log.youTrickPts' : 'log.youTrick') : pts ? 'log.trickPts' : 'log.trick';
    note = t(ptsKey, { name: seatName(w), n: pts });
    showing = null;
    busy = false;
    if (game.phase === 'round' || game.phase === 'over') endRound();
    else advance();
  }

  /* --- Chuyền bài --- */
  function togglePick(id) {
    if (!passing() || busy || kit.modal.current()) return;
    const i = picks.indexOf(id);
    if (i >= 0) picks.splice(i, 1);
    else if (picks.length >= 3) {
      nope(id);
      showFlash(t('status.max3'));
      return;
    } else picks.push(id);
    kit.sfx('tap');
    render();
  }

  async function doPass() {
    if (!passing() || busy || kit.modal.current()) return;
    if (picks.length !== 3) {
      kit.sfx('error');
      return;
    }
    const g0 = gen;
    busy = true;
    flash = '';
    firstAction();
    const mine = picks.slice();
    const all = [mine, E.aiPass(game, 1), E.aiPass(game, 2), E.aiPass(game, 3)];
    const to = E.passTarget(game, HUMAN);
    const from = E.passSource(game, HUMAN);
    kit.sfx('flip');
    if (!reduceMotion) {
      const dst = seatCard(to).getBoundingClientRect();
      const flights = mine.map((id) => {
        const el = handEls.get(id);
        const r = el.firstChild.getBoundingClientRect();
        el.classList.add('flying');
        return fly(r, dst, id, { ms: pace().fly * 1.2 });
      });
      await Promise.all(flights);
      if (g0 !== gen) return;
    }
    game = E.exchange(game, all);
    picks = [];
    const got = E.received(game, HUMAN);
    note = t('log.passed', { cards: shortList(mine), name: seatName(to) });
    kit.toast(t('toast.received', { name: seatName(from), cards: shortList(got) }), 2600);
    kit.sfx('flip');
    busy = false;
    persist();
    advance();
  }

  /* --- Hết ván / hết trận --- */
  function endRound() {
    const h = game.history[game.history.length - 1];
    stats.rounds++;
    if (h.moon === HUMAN) stats.moons++;
    if (game.phase === 'over') finishMatch();
    else kit.sfx(h.moon >= 0 ? 'combo' : h.pts[HUMAN] === 0 ? 'coin' : 'drop');
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
    if (won) {
      stats.won++;
      if (stats.best == null || game.scores[HUMAN] < stats.best) stats.best = game.scores[HUMAN];
    }
    saveStats();
    kit.sdk.end({ mode: game.level, won, timeMs: Math.round(clock.elapsed()), assisted: false });
    if (won) {
      kit.sfx('win');
      kit.confetti();
    } else {
      kit.sfx('lose');
    }
  }

  /** Bảng điểm từng ván: hàng = ván, cột = người; dòng cuối là tổng (thấp nhất sáng lên, ≥ 100 đỏ). */
  function scoreTable() {
    const seats = [0, 1, 2, 3];
    const lo = Math.min(...game.scores);
    let html = '<table class="score-table"><thead><tr><th scope="col">' + t('scores.round') + '</th>' +
      seats.map((s) => '<th scope="col"><span class="avatar av-' + s + '" aria-hidden="true">' + seatName(s).charAt(0) + '</span><span class="sc-name">' + seatName(s) + '</span></th>').join('') +
      '</tr></thead><tbody>';
    game.history.forEach((h, i) => {
      const last = i === game.history.length - 1 && (game.phase === 'round' || game.phase === 'over');
      html += '<tr' + (last ? ' class="last"' : '') + '><th scope="row">' + (i + 1) + '<span class="sc-dir">' + dirArrow(i + 1) + '</span></th>' +
        seats.map((s) => {
          const moon = h.moon === s;
          return '<td' + (moon ? ' class="moon" title="' + t('scores.moon') + '"' : '') + '>' + (moon ? '☾ ' : '') + h.pts[s] + '</td>';
        }).join('') + '</tr>';
    });
    if (game.phase === 'play' || game.phase === 'pass') {
      html += '<tr class="now"><th scope="row">' + t('scores.now') + '</th>' + seats.map((s) => '<td>' + (roundPts(s) ? '+' + roundPts(s) : '–') + '</td>').join('') + '</tr>';
    }
    html += '</tbody><tfoot><tr><th scope="row">' + t('scores.total') + '</th>' +
      seats.map((s) => '<td class="' + (game.scores[s] === lo ? 'lead' : '') + (game.scores[s] >= E.TARGET ? ' bust' : '') + '">' + game.scores[s] + '</td>').join('') +
      '</tr></tfoot></table>';
    return html;
  }
  /** Mũi tên hướng chuyền của ván n: trái ←, phải →, đối diện ↑, không chuyền: trống. */
  const ARROWS = { 0: '', 1: '←', 2: '↑', 3: '→' };
  const dirArrow = (n) => ARROWS[E.passOffset(n)];

  function showRound() {
    if (!game || (game.phase !== 'round' && game.phase !== 'over')) return;
    const h = game.history[game.history.length - 1];
    const over = game.phase === 'over';
    let title;
    let text;
    if (over) {
      const w = E.matchWinner(game);
      const top = game.scores.indexOf(Math.max(...game.scores));
      title = w === HUMAN ? t('match.won') : t('match.lost', { name: seatName(w) });
      text = t('match.text', { name: seatName(top), max: game.scores[top] });
    } else {
      title = h.moon >= 0 ? (h.moon === HUMAN ? t('round.moonYou') : t('round.moon', { name: seatName(h.moon) })) : t('round.title', { n: game.round });
      text = Math.max(...game.scores) >= E.TARGET ? t('round.tie') : t('round.text', { dir: dirText(game.round + 1) });
    }
    if (h.moon >= 0) text = t('round.moonText') + ' ' + text;
    $('round-title').textContent = title;
    $('round-text').textContent = text;
    $('round-table').innerHTML = scoreTable();
    $('btn-next').hidden = over;
    $('btn-again').hidden = !over;
    kit.modal.open('modal-round');
  }

  function openScores() {
    if (!game) return;
    $('scores-text').textContent = t('scores.text', { n: game.round, dir: dirText(game.round), level: t('level.' + game.level).toLowerCase() });
    $('scores-table').innerHTML = scoreTable();
    kit.modal.open('modal-scores');
  }

  function nextRound() {
    if (!game || game.phase !== 'round') return;
    kit.modal.close('modal-round');
    game = E.nextRound(game);
    resetUi();
    note = '';
    kit.sfx('start');
    persist();
    dealt();
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

  /** Đổi mức: trận chưa có nước nào của bạn thì chia lại ngay, không thì áp dụng từ trận sau. */
  function onSetting(key) {
    if (key !== 'level' || !game) return;
    if (game.humanMoves === 0 && game.phase !== 'over') newMatch();
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
  /** Chạm / Enter trên một lá: lúc chuyền thì chọn / bỏ chọn, lúc đánh thì ra lá. */
  function useCard(id) {
    if (!id) return;
    if (passing()) togglePick(id);
    else tryPlay(id);
  }

  /* ---------------- Sự kiện ---------------- */
  $('hand').addEventListener('click', (e) => {
    const b = e.target.closest('.hc');
    if (!b) return;
    sel = disp().indexOf(b.dataset.id);
    useCard(b.dataset.id);
  });
  $('btn-act').addEventListener('click', doPass);
  $('btn-scores').addEventListener('click', openScores);
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
    $('stats-best').textContent = stats.best == null ? '–' : kit.i18n.fmtNumber(stats.best);
    $('stats-moons').textContent = kit.i18n.fmtNumber(stats.moons);
    $('stats-rounds').textContent = kit.i18n.fmtNumber(stats.rounds);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const btn = e.target.closest && e.target.closest('button');
    if (k === 'ArrowLeft' || k === 'ArrowRight') moveSel(k === 'ArrowLeft' ? -1 : 1);
    else if (/^[1-9]$/.test(k)) selectPlayable(Number(k) - 1);
    else if (k === 'Enter' || k === ' ') {
      if (btn) return; // Enter / Space trên nút đang focus (kể cả lá trên tay): để trình duyệt bấm nút
      if (sel >= 0) useCard(disp()[sel]);
      else selectPlayable(0);
    } else if (k === 'p' || k === 'P') doPass();
    else if (k === 's' || k === 'S') openScores();
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
    clock.set(Number.isFinite(saved.elapsed) && saved.elapsed >= 0 ? saved.elapsed : 0);
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
