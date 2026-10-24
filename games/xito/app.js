/* =====================================================================
 * Xì Tố - Giao diện + luồng giải (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   Bạn là ghế 0 (dưới), ba máy ngồi Trái (1), Trên (2), Phải (3), đi theo chiều kim đồng hồ.
 *   - Màn chờ: chọn mức máy rồi bấm Bắt đầu giải (#btn-start); giải lưu dở thì mở lại thẳng bàn chơi
 *   - Đến lượt bạn: thanh trượt + ½ pot / Pot / All-in chọn mức, rồi Bỏ / Xem-Theo / Cược-Tố
 *   - Máy nghĩ 400–1400 ms tùy tốc độ (Cài đặt); lá chung lật từng vòng, mỗi vòng dừng ≥ 700 ms; so bài thì lật
 *     bài máy, tô sáng 5 lá thắng. Chuỗi hẹn giờ dừng khi mở hộp thoại / trang ẩn, bị hủy khi sang giải khác (`gen`)
 *   - Nhịp lật bài / dừng giữa các vòng không phụ thuộc giảm chuyển động (chỉ hiệu ứng trang trí bị tắt)
 *   Báo giải cho cổng (metric wins, mode = mức máy easy / medium / hard, một giải = một lần chơi):
 *   - Bắt đầu giải: kit.sdk.start(level); mở lại giải lưu dở: kit.sdk.start(level, true)
 *   - Hết giải: kit.sdk.end({ mode, won: ăn hết chip, timeMs, assisted: false })
 *   - Bỏ giải sau ván đầu (hoặc đã nói ít nhất một lần): won: false; trước đó thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const PC = window.PNCards;
  const HUMAN = E.HUMAN;
  // Nhịp (ms): think = máy nghĩ [min, max], street = dừng mỗi vòng lật bài chung, deal = cách nhau khi chia lá
  const PACE = {
    slow: { think: [800, 1400], street: 950, deal: 90 },
    normal: { think: [450, 900], street: 800, deal: 70 },
    fast: { think: [400, 550], street: 700, deal: 50 },
  };
  const FINAL_HOLD = 2000; // ván cuối của giải: giữ bàn để xem bài trước khi hiện kết quả
  const BOARD_N = { flop: 3, turn: 4, river: 5 };
  const LEVELS = E.LEVELS;

  let game = null;
  let gen = 0; // tăng khi sang giải khác: các chuỗi hẹn giờ cũ tự dừng
  let busy = false; // máy đang nghĩ / đang lật bài / đang chia
  let betTo = 0; // mức cược / tố đang chọn (tổng đặt ở vòng này)
  const ui = { boardShown: 0, logCount: 0, reveal: false, hideResult: false, resultShown: false, winCards: [], winSeats: [], thinking: -1, msg: '' };

  const kit = PNKit.init({
    gameId: 'xito',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', speed: 'normal', fourColor: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (n) => kit.i18n.fmtNumber(n);
  const pace = () => PACE[kit.settings.get().speed] || PACE.normal;
  const level = () => (LEVELS.indexOf(kit.settings.get().level) >= 0 ? kit.settings.get().level : 'medium');
  const name = (s) => t('seat.' + s);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const rankText = (r) => (r === 14 ? 'A' : PC.rankLabel(r));
  const cardText = (c) => PC.rankLabel(c) + PC.suitSymbol(c);

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: 0, won: 0, hands: 0, pots: 0, bigPot: 0, wins: { easy: 0, medium: 0, hard: 0 } };
    const nat = (x) => Number.isInteger(x) && x >= 0;
    ['played', 'won', 'hands', 'pots', 'bigPot'].forEach((k) => { if (nat(raw[k])) s[k] = raw[k]; });
    s.won = Math.min(s.won, s.played);
    if (raw.wins && typeof raw.wins === 'object') LEVELS.forEach((l) => { if (nat(raw.wins[l])) s.wins[l] = raw.wins[l]; });
    return s;
  })();
  const saveStats = () => kit.store.write(keys.stats, stats);
  const winRate = () => (stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–');

  /* ---------------- Hẹn giờ: dừng khi mở hộp thoại / trang ẩn, bỏ hẳn khi đã sang giải khác ---------------- */
  function sleep(ms) {
    const g0 = gen;
    return new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const tick = () => {
        if (g0 !== gen) return; // giải đã đổi: chuỗi này dừng luôn
        const now = performance.now();
        if (!document.hidden && !kit.modal.current()) left -= now - last;
        last = now;
        if (left <= 0) resolve();
        else setTimeout(tick, Math.max(16, Math.min(100, left)));
      };
      setTimeout(tick, Math.max(0, Math.min(100, ms)));
    });
  }

  /* ---------------- Dựng bàn ---------------- */
  const table = $('table');
  const seatEls = [null];
  const boardSlots = [];
  const meSlots = [];

  function slotEl() {
    const s = document.createElement('span');
    s.className = 'cslot';
    return s;
  }
  function buildTable() {
    for (let s = 1; s <= 3; s++) {
      const el = document.createElement('div');
      el.className = 'seat seat-' + s;
      const cards = document.createElement('div');
      cards.className = 'seat-cards';
      const c0 = slotEl();
      const c1 = slotEl();
      cards.append(c0, c1);
      const av = document.createElement('div');
      av.className = 'avatar avatar-' + s;
      av.setAttribute('aria-hidden', 'true');
      av.textContent = name(s).charAt(0);
      const plate = document.createElement('div');
      plate.className = 'plate';
      const nm = document.createElement('span');
      nm.className = 'seat-name';
      nm.textContent = name(s);
      const ch = document.createElement('span');
      ch.className = 'seat-chips';
      plate.append(nm, ch);
      const bub = document.createElement('span');
      bub.className = 'bubble';
      bub.hidden = true;
      el.append(cards, av, plate, bub);
      table.appendChild(el);
      const bet = document.createElement('div');
      bet.className = 'bet';
      bet.hidden = true;
      el.appendChild(bet);
      const dl = document.createElement('span');
      dl.className = 'dealer';
      dl.textContent = 'D';
      dl.hidden = true;
      el.appendChild(dl);
      seatEls.push({ el, cards: [c0, c1], chips: ch, bubble: bub, bet, dealer: dl });
    }
    for (let i = 0; i < 5; i++) {
      const s = slotEl();
      $('board').appendChild(s);
      boardSlots.push(s);
    }
    for (let i = 0; i < 2; i++) {
      const s = slotEl();
      $('me-cards').appendChild(s);
      meSlots.push(s);
    }
  }

  /** Đặt lá vào ô (chỉ dựng lại khi đổi lá / mặt). card null + faceUp false = lá úp không lộ mặt. */
  function setCard(slot, card, faceUp) {
    const key = (card ? PC.toId(card) : 'x') + (faceUp ? 'u' : 'd');
    if (slot.dataset.key === key && slot.firstChild) return slot.firstChild;
    const el = PC.render(card, { faceUp });
    slot.replaceChildren(el);
    slot.dataset.key = key;
    return el;
  }
  function setBlank(slot) {
    if (slot.dataset.key === 'slot') return;
    slot.replaceChildren(PC.slot({}));
    slot.dataset.key = 'slot';
  }
  function setNone(slot) {
    if (slot.dataset.key === '') return;
    slot.replaceChildren();
    slot.dataset.key = '';
  }
  /** Lật lá úp thành ngửa có hiệu ứng (giảm chuyển động thì đổi ngay). */
  function flipUp(slot, card) {
    const el = setCard(slot, card, false);
    slot.dataset.key = PC.toId(card) + 'u';
    return PC.flip(el, true, { duration: 260 });
  }

  /** Cỡ lá theo khung bàn. */
  function fit() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    if (!w || !h) return;
    const bw = Math.floor(Math.max(30, Math.min((w * 0.8 - 24) / 5, (h * 0.2) / 1.4, 76)));
    table.style.setProperty('--board-w', bw + 'px');
    table.style.setProperty('--bot-w', Math.round(Math.max(24, Math.min(bw * 0.68, 50))) + 'px');
  }

  /* ---------------- Đọc trạng thái để vẽ ---------------- */
  const inPlay = () => !!game && !E.isOver(game);
  const myTurn = () => !!game && game.phase === 'bet' && game.h.toAct === HUMAN && !busy;
  const live = (s) => !!(game && game.h && game.h.inHand[s] && !game.h.folded[s]);
  /** Chip hiển thị: lúc đang lật bài so (chưa công bố) thì chưa cộng tiền thắng. */
  function chipsOf(s) {
    if (!game) return E.START_CHIPS;
    const r = game.h && game.h.result;
    return game.phase === 'done' && ui.hideResult && r ? game.chips[s] - r.won[s] : game.chips[s];
  }
  function potOf() {
    if (!game || !game.h) return 0;
    if (game.phase === 'bet') return sum(game.h.committed);
    return ui.hideResult && game.h.result ? sum(game.h.result.won) : 0;
  }
  /** Tên tay bài từ điểm của engine. */
  function handName(score) {
    const d = E.describe(score);
    return t('hand.' + d.cat, { a: rankText(d.a), b: rankText(d.b) });
  }
  /** Tay hiện tại của bạn với các lá chung đã lật. */
  function myHand() {
    if (!game || !game.h || !game.h.inHand[HUMAN]) return '';
    const cards = E.holeCards(game, HUMAN).concat(E.boardCards(game).slice(0, ui.boardShown)).map(E.cardInt);
    const d = E.describe(E.score(cards));
    if (cards.length < 5 && d.cat === 'high') return '';
    return handName(E.score(cards));
  }
  /** Chữ nhỏ cạnh ghế: nước gần nhất của ghế trong vòng hiện tại (theo phần lịch sử đã hiện). */
  function bubbleOf(s) {
    if (!game || !game.h) return '';
    const log = game.h.log;
    let text = '';
    for (let i = 0; i < ui.logCount && i < log.length; i++) {
      const e = log[i];
      if (e.s === undefined) text = ''; // sang vòng mới: xóa
      else if (e.s === s) {
        if (e.a === 'win') text = '+' + num(e.n);
        else if (e.a === 'sb' || e.a === 'bb' || e.a === 'fold' || e.a === 'check') text = t('bub.' + e.a);
        else text = t('bub.' + e.a) + ' ' + num(e.n);
      }
    }
    return text;
  }
  function logLine(e) {
    if (e.s === undefined) {
      const n = BOARD_N[e.a];
      const cards = E.boardCards(game).slice(n === 3 ? 0 : n - 1, n).map(cardText).join(' ');
      return { street: true, text: t('street.' + e.a) + ' ' + cards };
    }
    return { who: name(e.s), me: e.s === HUMAN, text: t((e.s === HUMAN ? 'act.you.' : 'act.') + e.a, { n: num(e.n || 0) }) };
  }

  function message() {
    if (!game) return t('msg.waiting');
    if (game.phase === 'bet') {
      if (ui.thinking >= 0) return t('msg.thinking', { name: name(ui.thinking) });
      if (myTurn()) {
        const L = E.legal(game);
        return L.toCall > 0 ? t('msg.toCall', { n: num(L.toCall) }) : t('msg.yourTurn');
      }
      return '';
    }
    return ui.hideResult ? '' : ui.msg;
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    const g = game;
    const h = g && g.h;
    // Dải thông tin: mù, khi nào tăng, ván, mức máy
    const handNo = g ? g.handNo : 1;
    const bl = E.blindsFor(handNo - 1);
    $('info-blinds').textContent = num(bl.sb) + '/' + num(bl.bb);
    const maxLevel = bl.level >= E.SMALL_BLINDS.length - 1;
    const left = E.HANDS_PER_LEVEL - ((handNo - 1) % E.HANDS_PER_LEVEL);
    $('info-next').textContent = maxLevel ? t('info.max') : t('info.next', { n: left });
    $('info-hand').textContent = g ? t('info.hand', { n: handNo }) : '';
    $('info-level').textContent = t('level.' + (g ? g.level : level()));

    // Ghế máy
    for (let s = 1; s <= 3; s++) {
      const se = seatEls[s];
      const chips = chipsOf(s);
      const out = !!g && chips === 0 && (!h || !h.inHand[s] || (g.phase === 'done' && !ui.hideResult));
      se.el.classList.toggle('out', out);
      se.el.classList.toggle('folded', !!h && h.inHand[s] && h.folded[s]);
      se.el.classList.toggle('thinking', ui.thinking === s);
      se.el.classList.toggle('turn', !!g && g.phase === 'bet' && h.toAct === s && ui.thinking !== s);
      se.el.classList.toggle('winner', ui.winSeats.indexOf(s) >= 0 && !ui.hideResult);
      se.chips.textContent = out ? t('bub.out') : num(chips);
      const bub = out ? '' : bubbleOf(s);
      se.bubble.textContent = bub;
      se.bubble.hidden = !bub;
      se.bubble.classList.toggle('win', bub.charAt(0) === '+');
      const cards = E.holeCards(g || {}, s);
      se.cards.forEach((slot, i) => {
        if (!h || !h.inHand[s] || h.folded[s]) setNone(slot);
        else if (ui.reveal && live(s)) setCard(slot, cards[i], true);
        else setCard(slot, null, false);
        const el = slot.firstChild;
        if (el && el.classList) el.classList.toggle('pnc-highlight', ui.reveal && ui.winCards.indexOf(PC.toId(cards[i])) >= 0 && ui.winSeats.indexOf(s) >= 0);
      });
      const bet = g && g.phase === 'bet' ? h.bets[s] : 0;
      se.bet.hidden = !bet;
      se.bet.textContent = bet ? num(bet) : '';
      se.dealer.hidden = !g || g.button !== s;
    }

    // Bạn
    const myCards = E.holeCards(g || {}, HUMAN);
    meSlots.forEach((slot, i) => {
      if (!h || !h.inHand[HUMAN]) setBlank(slot);
      else setCard(slot, myCards[i], true);
      const el = slot.firstChild;
      if (el && el.classList && myCards[i]) el.classList.toggle('pnc-highlight', ui.winSeats.indexOf(HUMAN) >= 0 && !ui.hideResult && ui.reveal && ui.winCards.indexOf(PC.toId(myCards[i])) >= 0);
    });
    $('me').classList.toggle('folded', !!h && h.folded[HUMAN]);
    $('me').classList.toggle('turn', myTurn());
    $('me').classList.toggle('winner', ui.winSeats.indexOf(HUMAN) >= 0 && !ui.hideResult);
    $('me-chips').textContent = num(chipsOf(HUMAN));
    $('me-hand').textContent = myHand();
    $('me-tag').hidden = !g || g.button !== HUMAN;
    const myBet = g && g.phase === 'bet' ? h.bets[HUMAN] : 0;
    $('bet-0').hidden = !myBet;
    $('bet-0').textContent = myBet ? num(myBet) : '';

    // Lá chung + pot + thông báo
    const board = E.boardCards(g || {});
    boardSlots.forEach((slot, i) => {
      if (i < ui.boardShown && board[i]) {
        setCard(slot, board[i], true);
        slot.firstChild.classList.toggle('pnc-highlight', ui.reveal && !ui.hideResult && ui.winCards.indexOf(PC.toId(board[i])) >= 0);
      } else setBlank(slot);
    });
    const pot = potOf();
    $('pot').textContent = pot ? t('pot', { n: num(pot) }) : '';
    $('pot').hidden = !pot;
    $('msg').textContent = message();

    // Lịch sử: 3 dòng gần nhất của ván
    const list = $('log');
    list.replaceChildren();
    if (h) {
      const lines = h.log.slice(0, ui.logCount).filter((e) => e.a !== 'sb' && e.a !== 'bb').slice(-3).map(logLine);
      lines.forEach((ln) => {
        const li = document.createElement('li');
        if (ln.street) {
          li.className = 'street';
          li.textContent = ln.text;
        } else {
          const b = document.createElement('b');
          b.textContent = ln.who;
          if (ln.me) li.className = 'mine';
          li.append(b, ' ' + ln.text);
        }
        list.appendChild(li);
      });
    }
    renderControls();
  }

  /** Nút hành động + thanh cược theo nước được phép. */
  function renderControls() {
    const L = myTurn() ? E.legal(game) : null;
    const done = !!game && game.phase === 'done' && !busy && !E.isOver(game) && ui.resultShown;
    $('act-row').hidden = done;
    $('btn-next').hidden = !done;
    $('controls').classList.toggle('active', !!L);
    $('btn-fold').disabled = !L || !L.canFold;
    const call = $('btn-call');
    call.disabled = !L;
    call.textContent = !L || L.canCheck ? t('ctl.check') : L.toCall >= game.chips[HUMAN] ? t('ctl.callAllin', { n: num(L.toCall) }) : t('ctl.call', { n: num(L.toCall) });
    const canRaise = !!L && L.canRaise;
    ['btn-half', 'btn-pot', 'btn-allin', 'btn-raise'].forEach((id) => { $(id).disabled = !canRaise; });
    const range = $('bet-range');
    range.disabled = !canRaise || L.minTo >= L.maxTo;
    if (canRaise) {
      betTo = clampBet(betTo, L);
      range.min = String(L.minTo);
      range.max = String(L.maxTo);
      range.value = String(betTo);
      $('btn-raise').textContent = betTo >= L.maxTo ? t('ctl.allinTo', { n: num(betTo) }) : t(game.h.cur === 0 ? 'ctl.bet' : 'ctl.raise', { n: num(betTo) });
    } else {
      $('btn-raise').textContent = t('ctl.raiseIdle');
      range.value = range.min;
    }
  }

  function clampBet(v, L) {
    if (!(v >= L.minTo)) return L.minTo;
    if (v >= L.maxTo) return L.maxTo;
    const unit = game.h.sb;
    return Math.max(L.minTo, Math.min(L.maxTo, Math.round(v / unit) * unit));
  }
  /** Mức tố theo phần pot: tố = theo đủ rồi cộng thêm frac × (pot sau khi theo). */
  function potSize(frac) {
    const L = E.legal(game);
    const h = game.h;
    return h.cur + Math.round((L.pot + L.owe) * frac);
  }
  function setBet(v) {
    if (!myTurn()) return;
    const L = E.legal(game);
    if (!L.canRaise) return;
    betTo = clampBet(v, L);
    kit.sfx('tap');
    renderControls();
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const st = [];
    if (stats.played) {
      st.push({ value: num(stats.won), label: t('summary.won') });
      st.push({ value: winRate(), label: t('summary.rate') });
    }
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.won ? t('summary.note', { n: stats.won }) : t('summary.none'),
      stats: st,
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { h: game.handNo, n: num(game.chips[HUMAN]) }), pct: game.chips[HUMAN] / E.TOTAL } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Hoạt cảnh ---------------- */
  function sfxFor(e) {
    if (e.a === 'fold') kit.sfx('move');
    else if (e.a === 'check') kit.sfx('tap');
    else if (e.a === 'allin') kit.sfx('combo');
    else if (e.a === 'call' || e.a === 'bet' || e.a === 'raise') kit.sfx('coin');
  }

  /** Lật các lá chung tới đủ n lá. */
  async function revealBoard(n) {
    const board = E.boardCards(game);
    const from = ui.boardShown;
    for (let i = from; i < n; i++) {
      kit.sfx('flip');
      const p = flipUp(boardSlots[i], board[i]);
      ui.boardShown = i + 1;
      if (i === n - 1) await p;
      else if (!reduced()) await new Promise((r) => setTimeout(r, 90));
    }
  }

  /** Hiện dần các mục lịch sử mới (nước đi, lật vòng mới); dừng trước mục "ăn pot" (showResult lo). */
  async function animate() {
    const g0 = gen;
    const log = game.h.log;
    for (let i = ui.logCount; i < log.length; i++) {
      if (g0 !== gen) return;
      const e = log[i];
      if (BOARD_N[e.a]) {
        await sleep(pace().street * 0.45); // kịp đọc nước cuối của vòng trước
        if (g0 !== gen) return;
        ui.logCount = i + 1;
        render();
        await revealBoard(BOARD_N[e.a]);
        render();
        await sleep(pace().street * 0.55);
        continue;
      }
      if (e.a === 'win') break;
      ui.logCount = i + 1;
      sfxFor(e);
      render();
    }
  }

  /** Ván xong: lật bài người còn lại (nếu so bài), tô sáng 5 lá thắng, cộng chip, ghi thông báo. */
  async function showResult() {
    if (ui.resultShown) return;
    const g0 = gen;
    const h = game.h;
    const res = h.result;
    if (!res.uncontested) {
      ui.reveal = true;
      const flips = [];
      for (let s = 1; s <= 3; s++) {
        if (!live(s)) continue;
        const cards = E.holeCards(game, s);
        seatEls[s].cards.forEach((slot, i) => flips.push(flipUp(slot, cards[i])));
      }
      if (flips.length) kit.sfx('flip');
      await Promise.all(flips);
      await sleep(450);
      if (g0 !== gen) return;
    }
    ui.hideResult = false;
    ui.resultShown = true;
    ui.logCount = h.log.length;
    const winners = [];
    res.pots.forEach((p) => p.winners.forEach((s) => { if (winners.indexOf(s) < 0) winners.push(s); }));
    ui.winSeats = winners;
    ui.winCards = [];
    if (!res.uncontested) res.pots[0].winners.forEach((s) => { ui.winCards = ui.winCards.concat(E.handInfo(game, s).best); });
    // Thông báo: mỗi pot một cụm (pot chính trước)
    ui.msg = res.pots.slice(0, 2).map((p) => {
      const w = p.winners[0];
      const you = w === HUMAN;
      if (res.uncontested) return t(you ? 'msg.youWin' : 'msg.win', { name: name(w), n: num(p.amount) });
      const hand = handName(res.scores[w]);
      if (p.winners.length > 1) return t('msg.split', { names: p.winners.map(name).join(', '), hand });
      return t(you ? 'msg.youWinHand' : 'msg.winHand', { name: name(w), n: num(p.amount), hand });
    }).join('\n');
    if (h.inHand[HUMAN]) stats.hands++;
    if (res.won[HUMAN] > 0) {
      stats.pots++;
      stats.bigPot = Math.max(stats.bigPot, res.won[HUMAN]);
      kit.sfx(res.won[HUMAN] >= 1000 ? 'combo' : 'coin');
    } else if (live(HUMAN)) kit.sfx('drop');
    saveStats();
    render();
    persist();
  }

  /** Vòng chạy: máy đi tới khi đến lượt bạn hoặc hết ván. */
  async function drive() {
    const g0 = gen;
    while (g0 === gen && game) {
      if (game.phase === 'bet') {
        if (game.h.toAct === HUMAN) {
          busy = false;
          ui.thinking = -1;
          const L = E.legal(game);
          if (L.canRaise) betTo = L.minTo;
          render();
          return;
        }
        busy = true;
        ui.thinking = game.h.toAct;
        render();
        const [a, b] = pace().think;
        await sleep(a + Math.random() * (b - a));
        if (g0 !== gen) return;
        ui.thinking = -1;
        game = E.botAct(game);
        if (game.phase === 'done') ui.hideResult = true;
        persist();
        await animate();
        continue;
      }
      busy = true;
      render();
      await showResult();
      if (g0 !== gen) return;
      if (E.isOver(game)) {
        await sleep(FINAL_HOLD);
        if (g0 === gen) finish();
        return;
      }
      busy = false;
      render();
      return;
    }
  }

  /** Giao diện cho ván mới chia: lá tẩy bay vào, mục mù hiện ngay. */
  async function startHandUI(restoring) {
    const h = game.h;
    ui.boardShown = restoring ? E.boardCards(game).length : 0;
    let k = 0;
    while (k < h.log.length && (h.log[k].a === 'sb' || h.log[k].a === 'bb')) k++;
    ui.logCount = restoring ? h.log.length : k;
    ui.reveal = false;
    ui.hideResult = game.phase === 'done';
    ui.resultShown = false;
    ui.winCards = [];
    ui.winSeats = [];
    ui.msg = '';
    ui.thinking = -1;
    if (restoring) {
      render();
      return;
    }
    // Ép dựng lại lá tẩy để chạy hiệu ứng chia
    seatEls.forEach((se) => se && se.cards.forEach((slot) => { slot.dataset.key = '-'; }));
    meSlots.forEach((slot) => { slot.dataset.key = '-'; });
    busy = true;
    render();
    const els = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 1; i <= 4; i++) {
        const s = (game.button + i) % 4;
        if (!h.inHand[s]) continue;
        const slot = s === HUMAN ? meSlots[r] : seatEls[s].cards[r];
        if (slot.firstChild) els.push(slot.firstChild);
      }
    }
    if (!reduced()) {
      els.forEach((el, i) => {
        el.style.animationDelay = i * pace().deal + 'ms';
        el.classList.add('deal-in');
      });
    }
    kit.sfx('flip');
    await sleep(reduced() ? 150 : els.length * pace().deal + 320);
    els.forEach((el) => el.classList.remove('deal-in'));
  }

  /* ---------------- Luồng giải ---------------- */
  function showStart() {
    $('start').hidden = false;
    $('start-desc').textContent = t('start.desc.' + level());
    render();
  }

  async function startTournament() {
    gen++;
    const lv = level();
    game = E.newTournament((Math.random() * 4294967296) >>> 0, lv);
    $('start').hidden = true;
    kit.sdk.start(lv);
    kit.sfx('start');
    clock.reset();
    clock.start();
    persist();
    await startHandUI(false);
    drive();
  }

  async function nextHand() {
    if (!game || game.phase !== 'done' || busy || !ui.resultShown || E.isOver(game)) return;
    const g0 = gen;
    game = E.nextHand(game);
    persist();
    await startHandUI(false);
    if (g0 === gen) drive();
  }

  async function humanAct(action) {
    if (!myTurn() || kit.modal.current()) return;
    const n = E.act(game, action);
    if (!n) {
      kit.sfx('error');
      return;
    }
    game = n;
    if (game.phase === 'done') ui.hideResult = true;
    busy = true;
    persist();
    await animate();
    drive();
  }
  const fold = () => humanAct({ type: 'fold' });
  function checkCall() {
    if (!myTurn()) return;
    humanAct({ type: E.legal(game).canCheck ? 'check' : 'call' });
  }
  function raise() {
    if (!myTurn()) return;
    const L = E.legal(game);
    if (!L.canRaise) return;
    humanAct({ type: 'raise', to: clampBet(betTo, L) });
  }

  function finish() {
    clock.pause();
    const won = E.won(game);
    const place = won ? 1 : 1 + E.botsLeft(game);
    const lv = game.level;
    stats.played++;
    if (won) {
      stats.won++;
      stats.wins[lv]++;
    }
    saveStats();
    persist();
    kit.sdk.end({ mode: lv, won, timeMs: Math.round(clock.elapsed()), assisted: false });
    $('end-title').textContent = t(won ? 'end.won' : 'end.lost');
    $('end-badge').textContent = won ? t('end.wonText') : t('end.lostText', { place });
    $('end-badge').classList.toggle('good', won);
    $('end-place').textContent = place + '/4';
    $('end-hands').textContent = num(game.handNo);
    $('end-level').textContent = t('level.' + lv);
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    kit.modal.open('modal-end');
  }

  /** Giải đang dở và đã "chơi" thì hỏi trước, vì bỏ giải tính là thua. */
  function requestNew() {
    if (!game) return;
    if (inPlay() && E.started(game)) kit.modal.open('modal-confirm');
    else leave(false);
  }
  /** Rời giải hiện tại về màn chờ; report = gửi thua cho cổng. */
  function leave(report) {
    if (report && inPlay()) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: game.level, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    gen++;
    busy = false;
    game = null;
    clock.reset();
    kit.store.remove(keys.save);
    writeSummary();
    resetUI();
    showStart();
  }
  function resetUI() {
    Object.assign(ui, { boardShown: 0, logCount: 0, reveal: false, hideResult: false, resultShown: false, winCards: [], winSeats: [], thinking: -1, msg: '' });
  }

  function fillStats() {
    $('stats-played').textContent = num(stats.played);
    $('stats-won').textContent = num(stats.won);
    $('stats-rate').textContent = winRate();
    $('stats-hands').textContent = num(stats.hands);
    $('stats-pots').textContent = num(stats.pots);
    $('stats-big').textContent = stats.bigPot ? num(stats.bigPot) : '–';
    $('stats-levels').textContent = t('stats.levels', { e: num(stats.wins.easy), m: num(stats.wins.medium), h: num(stats.wins.hard) });
  }

  function onSetting(key) {
    if (key === 'fourColor') document.documentElement.classList.toggle('cards-4color', !!kit.settings.get().fourColor);
    if (key === 'level') {
      $('start-desc').textContent = t('start.desc.' + level());
      if (game && inPlay()) kit.toast(t('toast.levelNext'));
      render();
    }
  }

  // Người chơi đang đi bằng phím Tab (focus có chủ đích) hay bằng chuột / chạm
  let tabbing = false;
  document.addEventListener('pointerdown', () => { tabbing = false; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') tabbing = true; }, true);
  const keyboardFocus = (el) => tabbing && !!(el && el.closest && el.closest('button, input, a[href]'));

  /* ---------------- Sự kiện ---------------- */
  buildTable();
  document.documentElement.classList.toggle('cards-4color', !!kit.settings.get().fourColor);
  const click = (id, fn) => $(id).addEventListener('click', (e) => {
    fn();
    if (e.detail > 0) e.currentTarget.blur();
  });
  click('btn-start', startTournament);
  click('btn-fold', fold);
  click('btn-call', checkCall);
  click('btn-raise', raise);
  click('btn-next', nextHand);
  click('btn-half', () => setBet(potSize(0.5)));
  click('btn-pot', () => setBet(potSize(1)));
  click('btn-allin', () => myTurn() && setBet(E.legal(game).maxTo));
  $('bet-range').addEventListener('input', (e) => {
    if (!myTurn()) return;
    betTo = clampBet(Number(e.target.value), E.legal(game));
    renderControls();
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', () => {
    kit.modal.close('modal-confirm');
    leave(true);
  });
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-end');
    leave(false);
  });
  $('btn-stats').addEventListener('click', fillStats);
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    const onRange = e.target === $('bet-range');
    if (!$('start').hidden) {
      if ((k === 'enter' || k === ' ') && !keyboardFocus(e.target)) {
        e.preventDefault();
        startTournament();
      }
      return;
    }
    if (k === 'n') requestNew();
    else if (k === 'enter' || k === ' ') {
      if (keyboardFocus(e.target)) return;
      nextHand();
    } else if (k === 'f') fold();
    else if (k === 'c') checkCall();
    else if (k === 'r') raise();
    else if (k === 'h') setBet(potSize(0.5));
    else if (k === 'p') setBet(potSize(1));
    else if (k === 'a') myTurn() && setBet(E.legal(game).maxTo);
    else if ((k === 'arrowleft' || k === '-') && !onRange) myTurn() && setBet(betTo - game.h.bb);
    else if ((k === 'arrowright' || k === '+' || k === '=') && !onRange) myTurn() && setBet(betTo + game.h.bb);
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(table);
  window.addEventListener('resize', fit);

  /* ---------------- Khởi động: mở lại giải dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  let restored = saved && E.fromJSON(saved.game);
  if (restored && restored.phase === 'done') restored = E.nextHand(restored); // lưu giữa hai ván: chia ván sau
  fit();
  if (restored && !E.isOver(restored)) {
    game = restored;
    $('start').hidden = true;
    clock.set(saved.elapsed);
    clock.start();
    kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
    startHandUI(true);
    persist();
    drive();
  } else {
    kit.store.remove(keys.save);
    showStart();
    writeSummary();
  }
})();
