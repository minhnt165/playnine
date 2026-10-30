/* =====================================================================
 * Bài Bích - Giao diện + luồng trận (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   Bạn là ghế 0 (dưới), Mai Tây (1), Bảo Bắc (2, đồng đội), Khoa Đông (3), đi theo chiều kim đồng hồ.
 *   Mỗi ván: vòng báo (bảng báo ở giữa bàn, có gợi ý), rồi 13 nước; chạm lá đang nhô lên để ra.
 *   Đủ 4 lá thì nước nằm lại một nhịp (lá ăn sáng lên) rồi bay về người ăn.
 *   Máy đi với nhịp đọc kịp (Cài đặt: Chậm / Vừa / Nhanh); chuỗi hẹn giờ dừng khi đang mở hộp thoại
 *   hoặc trang bị ẩn, và bị hủy khi chia trận mới (biến `gen`).
 *   Báo trận cho cổng (metric wins, mode = mức đối thủ easy / medium / hard, một trận = một lần chơi):
 *   - Chia trận mới: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true)
 *   - Có đội thắng trận: kit.sdk.end({ mode, won: đội bạn thắng, timeMs, assisted: false })
 *   - Bỏ trận khi bạn đã đi ít nhất một nước (báo hoặc ra lá): won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = window.PNCards;
  const HUMAN = E.HUMAN;
  // Nhịp (ms): think = máy nghĩ, fly = lá bay vào giữa bàn, trick = xem nước đủ 4 lá, collect = lá bay về người ăn,
  // hand = dừng ở bàn trước khi hiện bảng điểm ván
  const PACE = {
    slow: { think: 900, fly: 460, trick: 1000, collect: 420, hand: 1200 },
    normal: { think: 650, fly: 360, trick: 750, collect: 340, hand: 950 },
    fast: { think: 400, fly: 240, trick: 450, collect: 240, hand: 650 },
  };
  const HEADROOM = 12; // chỗ trống trên bài (số phím trên lá nhô lên), khớp .hand trong style.css

  let game = null;
  let gen = 0; // tăng mỗi khi chia trận mới: các chuỗi hẹn giờ của trận cũ tự dừng
  let busy = false; // đang có lá bay / máy đang đi / đang xem nước vừa xong
  let note = ''; // dòng nhỏ: nước vừa đi
  let flash = ''; // dòng chính tạm thời (vừa chạm lá không ra được)
  let flashTimer = 0;
  let sel = -1; // lá đang chọn bằng bàn phím (chỉ số trên tay), -1 = chưa chọn
  let bidSel = null; // số đang chọn trên bảng báo
  let shown = null; // nước vừa đủ 4 lá đang để trên bàn: { lead, cards, win }
  let dealing = false; // vừa chia: bài trên tay chạy hiệu ứng chia
  let roundTimer = 0;

  const kit = PNKit.init({
    gameId: 'baibich',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { speed: 'normal', level: 'medium', target: '300' },
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
    const s = { played: 0, won: 0, made: 0, nils: 0 };
    Object.keys(s).forEach((k) => {
      if (Number.isInteger(raw[k]) && raw[k] >= 0) s[k] = raw[k];
    });
    s.won = Math.min(s.won, s.played);
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
    const el = C.render(card(id), { label: false, faceUp: !o.flip, className: 'flyer' });
    el.style.left = a.left + 'px';
    el.style.top = a.top + 'px';
    el.style.setProperty('--card-w', a.width + 'px');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const ms = o.ms || pace().fly;
    const s = b.width / a.width;
    const end = 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + s + ')';
    const frames = [{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, { transform: end, opacity: o.fade ? 0.2 : 1 }];
    const anim = el.animate(frames, { duration: ms, easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' });
    if (o.flip) C.flip(el, true, { duration: ms * 0.8 });
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
    const low = window.innerHeight < 560;
    document.documentElement.classList.toggle('low', low);
    // Cỡ lá giữa bàn: vừa phần bàn còn lại sau bài trên tay, hàng của Bảo và dòng trạng thái
    // (nước 4 lá cao 1,4 × cw × hệ số chồng, khớp .trick trong style.css)
    let cw;
    if (wide) {
      hw = clamp(H * 0.19, 40, 96);
      const tableH = H - (hw * 1.72 + 26) - 8;
      const avail = tableH - 14 - (low ? 38 : 50) - (low ? 22 : 42) - 8;
      cw = clamp(Math.min(avail / (1.4 * (low ? 1.75 : 2.05)), W * 0.09), 30, 92);
    } else {
      // Điện thoại dọc: lá to, 13 lá xếp hai hàng để mỗi lá chừa đủ chỗ chạm
      hw = clamp(Math.min(W * 0.24, H * 0.13), 44, 100);
      const tableH = H - 38 - (hw * 2.42 + 24) - 8;
      const avail = tableH - 14 - 50 - 44 - 8;
      cw = clamp(Math.min(avail / (1.4 * 2.3), (W - 160) / 2.9), 34, 90);
    }
    st.style.setProperty('--hw', Math.round(hw) + 'px');
    st.style.setProperty('--cw', Math.round(cw) + 'px');
    if (game) render();
  }

  /* ---------------- Vẽ ---------------- */
  const myTurn = () => !!game && (game.phase === 'play' || game.phase === 'bid') && game.turn === HUMAN && !shown;
  const humanCan = () => myTurn() && !busy && !kit.modal.current();

  /** Chữ báo / ăn ngắn của một người: "Báo 3" khi đang báo, "ăn 1/3" khi đang đánh. */
  function bidText(s) {
    const b = game.bids[s];
    if (b === null) return game.phase === 'bid' && game.turn === s ? t('bid.bidding') : '–';
    if (game.phase === 'bid') return b === 0 ? t('nil') : t('bid.short', { n: b });
    return b === 0 ? t('bid.tookNil', { took: game.tricks[s] }) : t('bid.chip', { took: game.tricks[s], bid: b });
  }

  function renderSeats() {
    for (let s = 1; s < 4; s++) {
      const el = $('seat-' + s);
      const active = (game.phase === 'bid' || game.phase === 'play') && game.turn === s && !shown;
      el.classList.toggle('active', active);
      el.classList.toggle('thinking', active && busy);
      el.classList.toggle('partner', s === E.PARTNER);
      const b = game.bids[s];
      const nilBroken = b === 0 && game.tricks[s] > 0;
      el.setAttribute('aria-label', t('seat.aria', { name: seatName(s), role: t('seat.role' + s), bid: bidText(s) }));
      el.innerHTML =
        '<span class="avatar av-' + s + '" aria-hidden="true">' + seatName(s).charAt(0) + '</span>' +
        '<span class="seat-tag" aria-hidden="true"><span class="seat-name">' + seatName(s) + '</span>' +
        '<span class="seat-bid' + (b === 0 ? ' nil' : '') + (nilBroken ? ' broke' : '') + '">' + bidText(s) + '</span>' +
        '<span class="dots"><i></i><i></i><i></i></span></span>';
    }
  }

  /** Nước giữa bàn: lá đang đánh, hoặc nước vừa đủ 4 lá (lá ăn sáng lên). */
  function renderTrick() {
    const tr = shown || { lead: game.lead, cards: game.trick, win: -1 };
    const at = {};
    tr.cards.forEach((id, i) => { at[(tr.lead + i) % 4] = id; });
    const names = [];
    for (let s = 0; s < 4; s++) {
      const slot = $('slot-' + s);
      const id = at[s];
      slot.classList.toggle('lead', game.phase === 'play' && !shown && !tr.cards.length && game.lead === s);
      if (!id) {
        slot.innerHTML = '';
        continue;
      }
      const win = shown && tr.win === s;
      slot.innerHTML = C.html(card(id), { label: false, className: win ? 'pnc-highlight' : '' });
      names.push(seatName(s) + ' ' + C.cardName(card(id), lang));
    }
    $('trick').setAttribute('aria-label', names.length ? t('trick.label', { cards: names.join(', ') }) : t('trick.empty'));
  }

  /* Bài trên tay: xếp theo chất (cơ, nhép, rô, bích: đỏ đen xen kẽ, bích chủ ở cuối) rồi theo bậc 2 → A */
  const SUIT_ORDER = { H: 0, C: 1, D: 2, S: 3 };
  const sortKey = (id) => SUIT_ORDER[E.suitOf(id)] * 20 + E.pow(id);
  /** Bài của bạn theo thứ tự hiển thị (chọn bằng bàn phím cũng theo thứ tự này). */
  const disp = () => (game ? game.hands[HUMAN].slice().sort((x, y) => sortKey(x) - sortKey(y)) : []);
  /** Lá ra được theo thứ tự hiển thị (phím 1–9). */
  const dispPlays = () => {
    const plays = humanCan() && game.phase === 'play' ? E.legalPlays(game) : [];
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
    const pad = Math.max(6, Math.min(hw, box.clientWidth / 6) * 0.22); // chừa chỗ cho lá xòe nghiêng ở hai mép
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
    const fan = (m) => (rows === 2 ? Math.min(1.6, 14 / m) : Math.min(3, 20 / Math.max(m, 1))); // độ nghiêng mỗi lá
    // Lá ở hai mép xòe thấp xuống: chừa chỗ dưới để không tràn khung
    const drop = ((Math.ceil(n / rows) - 1) / 2) * fan(Math.ceil(n / rows)) * 0.9 + w * 0.06;
    box.style.height = 'calc(' + (w * 1.4 + rowShift + HEADROOM + 4 + drop) + 'px + var(--lift))';
    const plays = dispPlays();
    const playing = humanCan() && game.phase === 'play';
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
        if (dealing && !reduceMotion) {
          el.classList.add('deal');
          el.style.animationDelay = i * 40 + 'ms';
          el.addEventListener('animationend', () => el.classList.remove('deal'), { once: true });
        }
        box.appendChild(el);
        handEls.set(id, el);
      }
      const row = i < k0 ? 0 : 1;
      const j = row ? i - k0 : i; // vị trí trong hàng
      const m = row ? n - k0 : k0; // số lá trong hàng
      const step = m > 1 ? Math.min(w * 0.74, (Wi - w) / (m - 1)) : 0;
      const x0 = pad + (Wi - (w + step * (m - 1))) / 2;
      const spread = fan(m);
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
      face.classList.toggle('pnc-disabled', playing && !can);
      el.classList.toggle('dim', playing && !can);
      face.classList.toggle('pnc-selected', i === sel);
      if (can && pi < 9) {
        el.dataset.key = pi + 1;
        el.lastChild.textContent = pi + 1;
      } else delete el.dataset.key;
      el.tabIndex = i === focusIdx ? 0 : -1;
      el.setAttribute('aria-label', C.cardName(card(id), lang) + (can ? ', ' + t('card.playable') : ''));
      el.setAttribute('aria-disabled', String(!can));
    });
    dealing = false;
  }

  /* Bảng báo: Nil, 1–13; số gợi ý có viền, chạm số đang chọn lần nữa cũng là báo */
  function renderBid() {
    const show = humanCan() && game.phase === 'bid';
    const panel = $('bidpanel');
    const wasHidden = panel.hidden;
    panel.hidden = !show;
    $('center').classList.toggle('bidding', show);
    if (!show) return;
    const sug = E.suggestBid(game);
    if (bidSel === null) bidSel = sug.bid;
    const grid = $('bid-grid');
    if (!grid.childElementCount) {
      for (let n = 0; n <= E.HAND; n++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bid-n' + (n === 0 ? ' bid-nil' : '');
        b.dataset.n = n;
        b.textContent = n === 0 ? t('nil') : String(n);
        b.setAttribute('aria-label', n === 0 ? t('bid.nilOption') : t('bid.option', { n }));
        grid.appendChild(b);
      }
    }
    grid.querySelectorAll('.bid-n').forEach((b) => {
      const n = Number(b.dataset.n);
      b.setAttribute('aria-pressed', String(n === bidSel));
      b.classList.toggle('sug', n === sug.bid);
      b.tabIndex = n === bidSel ? 0 : -1;
    });
    $('bid-hint').textContent = sug.nil ? t('bid.hintNil') : t('bid.hint', { n: sug.bid });
    $('btn-bid').textContent = bidSel === 0 ? t('bid.goNil') : t('bid.go', { n: bidSel });
    if (wasHidden && !kit.modal.current()) $('btn-bid').focus({ preventScroll: true });
  }

  function mainText() {
    if (flash) return flash;
    if (game.phase === 'over') return t('status.matchOver');
    if (game.phase === 'hand') return t('status.handOver');
    if (shown) return '';
    if (game.phase === 'bid') return game.turn === HUMAN ? t('status.yourBid') : t('status.cpuBid', { name: seatName(game.turn) });
    if (game.turn !== HUMAN) return t('status.cpu', { name: seatName(game.turn) });
    if (game.trick.length) return t('status.yourFollow', { suit: suitText(E.suitOf(game.trick[0])) });
    const hand = game.hands[HUMAN];
    const closed = !game.broken && hand.some((id) => E.suitOf(id) === 'S') && hand.some((id) => E.suitOf(id) !== 'S');
    return t(closed ? 'status.yourLeadClosed' : 'status.yourLead');
  }

  function renderScores() {
    for (let tm = 0; tm < 2; tm++) {
      $('score-' + tm).textContent = kit.i18n.fmtNumber(game.scores[tm]);
      const parts = [];
      if (game.phase !== 'bid' || game.bids.every((b) => b !== null)) {
        const bid = (game.bids[tm] || 0) + (game.bids[tm + 2] || 0);
        parts.push(t('meta.hand', { bid, took: game.tricks[tm] + game.tricks[tm + 2] }));
      }
      parts.push(t('meta.bags', { n: game.bags[tm] }));
      $('meta-' + tm).textContent = parts.join(' · ');
    }
    const lead = game.scores[0] === game.scores[1] ? -1 : game.scores[0] > game.scores[1] ? 0 : 1;
    $('team-0').classList.toggle('ahead', lead === 0);
    $('team-1').classList.toggle('ahead', lead === 1);
    $('score-mid').innerHTML = '<b>' + t('mid.hand', { n: game.handNo }) + '</b><span>' + t('mid.target', { target: game.target }) + '</span>';
  }

  function render() {
    if (!game) return;
    renderScores();
    renderSeats();
    renderTrick();
    renderBid();
    renderHand();
    const mine = $('seat-0');
    mine.classList.toggle('active', myTurn());
    const b = game.bids[HUMAN];
    const meBid = $('me-bid');
    meBid.textContent = b === null && !(game.phase === 'bid' && game.turn === HUMAN) ? '' : bidText(HUMAN);
    meBid.classList.toggle('nil', b === 0);
    meBid.classList.toggle('broke', b === 0 && game.tricks[HUMAN] > 0);
    $('round-info').textContent = t('info.level', { level: t('level.' + game.level) });
    const brk = $('broken');
    brk.classList.toggle('on', game.broken);
    brk.title = t(game.broken ? 'spades.broken' : 'spades.closed');
    $('status-log').textContent = note;
    $('status-main').textContent = mainText();
    $('status').classList.toggle('you', myTurn() && !flash);
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
        ? {
          title: t('app.name'),
          detail: t('summary.resume', { n: game.handNo, us: game.scores[0], them: game.scores[1] }),
          pct: clamp(game.scores[0] / game.target, 0, 1),
        }
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

  function dealNote() {
    return game.dealer === HUMAN ? t('log.dealYou', { n: game.handNo }) : t('log.deal', { n: game.handNo, name: seatName(game.dealer) });
  }

  function newMatch() {
    gen++;
    busy = false;
    flash = '';
    sel = -1;
    bidSel = null;
    shown = null;
    clearTimeout(roundTimer);
    kit.modal.close('modal-round');
    const s = kit.settings.get();
    game = E.newMatch({ seed: (Math.random() * 4294967296) >>> 0, level: s.level, target: s.target });
    note = dealNote();
    clock.reset();
    clearHand();
    dealing = true;
    kit.store.remove(keys.save);
    kit.sdk.start(game.level);
    kit.sfx('flip');
    writeSummary();
    advance();
  }

  /** Nước đầu tiên của bạn trong trận: đồng hồ bắt đầu chạy. */
  function firstAction() {
    if (game.humanMoves === 0) clock.resume();
  }

  /** Bước kế tiếp: máy tự báo / ra lá; tới lượt bạn thì chờ. */
  function advance() {
    render();
    if (!game || busy || shown) return;
    if ((game.phase === 'bid' || game.phase === 'play') && game.turn !== HUMAN) cpuTurn();
  }

  /** Phần tử đại diện chỗ ngồi (lá bay ra / bay về): avatar của máy, hoặc thẻ tên của bạn. */
  function seatAnchor(s) {
    return s === HUMAN ? document.querySelector('#seat-0 .avatar') : document.querySelector('#seat-' + s + ' .avatar');
  }

  async function cpuTurn() {
    const g0 = gen;
    const seat = game.turn;
    busy = true;
    render();
    await sleep(pace().think);
    if (g0 !== gen) return;
    if (game.phase === 'bid') {
      const n = E.aiBid(game);
      game = E.bid(game, n);
      note = n === 0 ? t('log.bidNil', { name: seatName(seat) }) : t('log.bid', { name: seatName(seat), n });
      kit.sfx('tick');
      busy = false;
      persist();
      advance();
      return;
    }
    const id = E.aiPlay(game);
    const from = seatAnchor(seat);
    const fr = from && from.getBoundingClientRect();
    await fly(fr && { left: fr.left, top: fr.top, width: fr.width, height: fr.width * 1.4 }, $('slot-' + seat), id, { flip: true });
    if (g0 !== gen) return;
    await afterPlay(seat, id);
  }

  /** Sau mỗi lá: ghi nhật ký, đủ 4 lá thì để nước nằm lại một nhịp rồi bay về người ăn. */
  async function afterPlay(seat, id) {
    const g0 = gen;
    const prev = game;
    game = E.play(game, id);
    note = seat === HUMAN ? t('log.youPlay', { card: short(id) }) : t('log.play', { name: seatName(seat), card: short(id) });
    if (!prev.broken && game.broken) note += ' · ' + t('log.broken');
    kit.sfx(E.suitOf(id) === 'S' && prev.trick.length && E.suitOf(prev.trick[0]) !== 'S' ? 'capture' : 'place');
    if (game.done.length > prev.done.length) {
      const d = game.done[game.done.length - 1];
      shown = d;
      busy = true;
      persist();
      render();
      await sleep(pace().trick);
      if (g0 !== gen) return;
      const rects = [0, 1, 2, 3].map((s) => {
        const c = $('slot-' + s).firstElementChild;
        return c ? c.getBoundingClientRect() : null;
      });
      const anchor = seatAnchor(d.win);
      shown = null;
      render();
      const wid = d.cards[(d.win - d.lead + 4) % 4];
      kit.sfx(E.teamOf(d.win) === 0 ? 'coin' : 'drop');
      await Promise.all(d.cards.map((cid, i) => {
        const r = rects[(d.lead + i) % 4];
        return r ? fly(r, anchor, cid, { ms: pace().collect, fade: true }) : null;
      }));
      if (g0 !== gen) return;
      note = d.win === HUMAN ? t('log.youWon', { card: short(wid) }) : t('log.won', { name: seatName(d.win), card: short(wid) });
      busy = false;
      if (game.phase !== 'play') endHand();
      else advance();
      return;
    }
    busy = false;
    persist();
    advance();
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
    if (!humanCan() || game.phase !== 'play') return;
    const el = handEls.get(id);
    if (!E.isLegal(game, id)) {
      kit.sfx('error');
      if (el) {
        el.classList.remove('nope');
        void el.offsetWidth; // chạy lại hiệu ứng
        el.classList.add('nope');
      }
      showFlash(game.trick.length ? t('status.badFollow', { suit: suitText(E.suitOf(game.trick[0])) }) : t('status.badLead'));
      return;
    }
    doPlay(id);
  }

  async function doPlay(id) {
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
      await fly(from, $('slot-0'), id);
    }
    if (g0 !== gen) return;
    sel = -1;
    await afterPlay(HUMAN, id);
  }

  function doBid(n) {
    if (!humanCan() || game.phase !== 'bid' || !Number.isInteger(n)) return;
    firstAction();
    game = E.bid(game, n);
    note = n === 0 ? t('log.youBidNil') : t('log.youBid', { n });
    bidSel = null;
    kit.sfx('tap');
    persist();
    advance();
  }

  /* --- Hết ván / hết trận --- */
  function endHand() {
    const r = game.result;
    if (r.teams[0].made) stats.made++;
    if (r.teams[0].nils.some((x) => x.seat === HUMAN && x.ok)) stats.nils++;
    if (game.phase === 'over') finishMatch();
    else kit.sfx(r.teams[0].delta >= r.teams[1].delta ? 'levelup' : 'drop');
    saveStats();
    persist();
    render();
    clearTimeout(roundTimer);
    roundTimer = setTimeout(showRound, reduceMotion ? 400 : pace().hand);
  }

  function finishMatch() {
    clock.pause();
    const won = E.matchWinner(game) === 0;
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

  const signed = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');

  function showRound() {
    if (!game || (game.phase !== 'hand' && game.phase !== 'over')) return;
    const r = game.result;
    const over = game.phase === 'over';
    const won = over && r.winner === 0;
    $('round-title').textContent = over ? (won ? t('match.won') : t('match.lost')) : t('round.title', { n: game.handNo });
    const lead = game.scores[0] === game.scores[1] ? 'round.tie' : game.scores[0] > game.scores[1] ? 'round.us' : 'round.them';
    $('round-text').textContent = over ? t('match.text', { target: game.target }) : t(lead);
    const T = r.teams;
    const row = (label, f, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th><td>' + f(T[0], 0) + '</td><td>' + f(T[1], 1) + '</td></tr>';
    const bids = (tm) => [tm, tm + 2].map((s) => seatName(s) + ' ' + (game.bids[s] === 0 ? t('nil') : game.bids[s])).join(', ');
    const tricks = (tm) => [tm, tm + 2].map((s) => game.tricks[s]).join(' + ') + ' = ' + T[tm].took;
    let rows = row(t('round.bid'), (x, tm) => bids(tm));
    rows += row(t('round.took'), (x, tm) => tricks(tm));
    rows += row(t('round.contract'), (x) => (x.made === null ? '–' : signed(x.base) + ' <small>' + t(x.made ? 'round.made' : 'round.set') + '</small>'), '');
    if (T[0].nils.length || T[1].nils.length) {
      rows += row(t('round.nil'), (x) => (x.nils.length ? x.nils.map((n) => (n.ok ? '+100' : '−100') + ' <small>' + seatName(n.seat) + '</small>').join('<br>') : '–'));
    }
    rows += row(t('round.bags'), (x) => (x.over ? '+' + x.over : '0'));
    if (T[0].penalty || T[1].penalty) rows += row(t('round.penalty'), (x) => (x.penalty ? signed(x.penalty) : '–'), 'neg');
    rows += row(t('round.hand'), (x) => signed(x.delta), 'sum');
    rows += row(t('round.total'), (x, tm) => kit.i18n.fmtNumber(game.scores[tm]), 'total');
    rows += row(t('round.bagsNow'), (x, tm) => game.bags[tm]);
    $('round-rows').innerHTML = rows;
    $('btn-next').hidden = over;
    $('btn-again').hidden = !over;
    kit.modal.open('modal-round');
  }

  function nextHand() {
    if (!game || game.phase !== 'hand') return;
    kit.modal.close('modal-round');
    game = E.nextHand(game);
    note = dealNote();
    sel = -1;
    bidSel = null;
    clearHand();
    dealing = true;
    kit.sfx('flip');
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
    if (game.phase !== 'over' && game.humanMoves === 0) newMatch();
    else kit.toast(t('toast.nextMatch'));
  }

  /* --- Bàn phím: chọn lá / số báo --- */
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
  function setBidSel(n) {
    bidSel = clamp(n, 0, E.HAND);
    renderBid();
    const b = $('bid-grid').querySelector('[data-n="' + bidSel + '"]');
    if (b) b.focus();
  }

  /* ---------------- Sự kiện ---------------- */
  $('hand').addEventListener('click', (e) => {
    const b = e.target.closest('.hc');
    if (!b) return;
    sel = disp().indexOf(b.dataset.id);
    tryPlay(b.dataset.id);
  });
  $('bid-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.bid-n');
    if (!b) return;
    const n = Number(b.dataset.n);
    if (n === bidSel) doBid(n); // chạm lại số đang chọn = báo luôn
    else {
      bidSel = n;
      kit.sfx('tick');
      renderBid();
    }
  });
  $('btn-bid').addEventListener('click', () => doBid(bidSel));
  $('btn-next').addEventListener('click', nextHand);
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
    $('stats-made').textContent = kit.i18n.fmtNumber(stats.made);
    $('stats-nils').textContent = kit.i18n.fmtNumber(stats.nils);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    const btn = e.target.closest && e.target.closest('button');
    if (k === 'n' || k === 'N') requestNew();
    else if (game.phase === 'bid' && humanCan()) {
      // Bảng báo: mũi tên đổi số, 0–9 chọn thẳng (0 = Nil), Enter báo
      if (k === 'ArrowLeft' || k === 'ArrowDown') setBidSel((bidSel || 0) - 1);
      else if (k === 'ArrowRight' || k === 'ArrowUp') setBidSel((bidSel || 0) + 1);
      else if (/^[0-9]$/.test(k)) setBidSel(Number(k));
      else if (k === 'Enter') {
        if (btn && btn.id === 'btn-bid') return; // trình duyệt tự bấm nút Báo
        doBid(bidSel);
      } else return;
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') moveSel(k === 'ArrowLeft' ? -1 : 1);
    else if (/^[1-9]$/.test(k)) selectPlayable(Number(k) - 1);
    else if (k === 'Enter') {
      if (btn) return; // Enter trên nút đang focus (kể cả lá trên tay): để trình duyệt bấm nút
      playSel();
    } else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && game) render(); });

  /* ---------------- Khởi động: mở lại trận dở nếu có ---------------- */
  layout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.humanMoves > 0 && restored.phase !== 'over') {
    game = restored;
    note = '';
    clock.set(Number(saved.elapsed) || 0);
    clock.resume(); // trận đã bắt đầu: đồng hồ chạy tiếp ngay
    kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    layout();
    if (game.phase === 'hand') {
      render();
      showRound();
    } else advance();
  } else {
    newMatch();
  }
  layout();
})();
