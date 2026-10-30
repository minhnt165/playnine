/* =====================================================================
 * Gin Rummy - Giao diện + luồng trận (cần ../_kit/kit.js, ../_kit/cards.js, i18n.js, engine.js nạp trước)
 *   Bạn là ghế 0 (dưới), máy là ghế 1 (trên). Một trận = nhiều ván, ai tới 100 điểm trước thắng.
 *   - Lượt đầu: chạm chồng bỏ để nhặt lá mời, hoặc nút Bỏ qua. Sau đó: chạm nọc / nút Rút, hoặc chạm chồng bỏ để nhặt.
 *   - Bỏ lá: chạm lá (nhô lên), chạm lần nữa / nút Bỏ lá / kéo vào chồng bỏ. Nút Knock (Gin) khi lá lẻ ≤ 10.
 *   - Bài tự xếp thành bộ tối ưu (vạch màu dưới lá cùng bộ), tổng lá lẻ hiện dưới điểm. Kéo lá để tự xếp
 *     (chuyển sang thứ tự riêng), nút Xếp bộ để xếp lại.
 *   Máy đi với nhịp đọc kịp (Cài đặt: Chậm / Vừa / Nhanh); chuỗi hẹn giờ dừng khi đang mở hộp thoại
 *   hoặc trang bị ẩn, và bị hủy khi chia trận mới (biến `gen`).
 *   Báo trận cho cổng (metric wins, mode = mức máy easy / medium / hard, một trận = một lần chơi):
 *   - Chia trận mới: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true)
 *   - Có người tới 100: kit.sdk.end({ mode, won: bạn tới trước, timeMs, assisted: false })
 *   - Bỏ trận khi bạn đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const C = window.PNCards;
  const HUMAN = E.HUMAN;
  const CPU = E.CPU;
  // Nhịp (ms): think = máy nghĩ, fly = lá bay, after = xem lá máy vừa rút, round = dừng ở bàn trước khi hiện bảng điểm
  const PACE = {
    slow: { think: 1000, fly: 520, after: 600, round: 1700 },
    normal: { think: 650, fly: 380, after: 380, round: 1300 },
    fast: { think: 400, fly: 240, after: 200, round: 900 },
  };
  const HEADROOM = 10; // chỗ trống trên bài cho lá nhô lên, khớp .hand trong style.css
  const GROUP_COLORS = 4; // số màu vạch bộ (style.css .g0 … .g3)

  let game = null;
  let gen = 0; // tăng mỗi khi chia trận mới: các chuỗi hẹn giờ của trận cũ tự dừng
  let busy = false; // đang có lá bay / máy đang đi
  let note = ''; // dòng nhỏ: nước vừa đi
  let flash = ''; // dòng chính tạm thời (báo lỗi nước đi)
  let flashTimer = 0;
  let sel = null; // lá đang chọn (id)
  let order = []; // thứ tự hiển thị bài của bạn
  let manual = false; // bạn đã tự xếp (kéo / Shift + mũi tên): không tự xếp lại cho tới khi bấm Xếp bộ
  let fresh = null; // lá vừa rút / nhặt (viền sáng)
  let dealing = false; // vẽ lần tới có hiệu ứng chia bài
  let roundTimer = 0;

  const kit = PNKit.init({
    gameId: 'ginrummy',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { speed: 'normal', level: 'easy', bigGin: true },
    onSetting,
  });
  const t = kit.t;
  const lang = kit.i18n.lang;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pace = () => PACE[kit.settings.get().speed] || PACE.normal;
  const card = (id) => C.fromId(id);
  const short = (id) => C.rankLabel(card(id)) + C.suitSymbol(card(id));
  const cpuName = () => t('cpu.' + (game ? game.level : kit.settings.get().level));

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: 0, won: 0, rounds: 0, gins: 0, best: 0 };
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
        if (g0 !== gen) return;
        if (document.hidden || kit.modal.current()) {
          setTimeout(tick, 250);
          return;
        }
        resolve();
      };
      setTimeout(tick, ms);
    });
  }

  /** Lá bay từ phần tử / khung `from` tới `to` (đổi cỡ theo đích). flip: lật từ úp sang ngửa; back: bay úp. */
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
    const ms = pace().fly;
    const anim = el.animate(
      [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + b.width / a.width + ')' }],
      { duration: ms, easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' },
    );
    if (o.flip && id) C.flip(el, true, { duration: ms * 0.8 });
    return anim.finished.catch(() => {}).then(() => el.remove());
  }

  /* ---------------- Bố cục: cỡ lá theo chỗ trống; màn ngang thì máy bên trái, trạng thái bên phải ---------------- */
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  let hw = 64;
  let ow = 34;
  function layout() {
    const st = $('stage');
    const W = st.clientWidth;
    const H = st.clientHeight;
    if (!W || !H) return;
    const wide = W > H * 1.25;
    st.classList.toggle('wide', wide);
    let cw;
    if (wide) {
      hw = clamp(H * 0.2, 46, 112);
      cw = clamp(H * 0.17, 44, 104);
      ow = clamp(H * 0.075, 24, 50);
    } else {
      hw = clamp(Math.min(W * 0.2, H * 0.13), 44, 96);
      cw = clamp(Math.min(W * 0.27, H * 0.15), 50, 112);
      ow = clamp(Math.min(W * 0.12, H * 0.07), 26, 52);
    }
    st.style.setProperty('--hw', Math.round(hw) + 'px');
    st.style.setProperty('--cw', Math.round(cw) + 'px');
    st.style.setProperty('--ow', Math.round(ow) + 'px');
    if (game) render();
  }

  /* ---------------- Trạng thái nước đi ---------------- */
  const playing = () => !!game && E.playing(game);
  const myTurn = () => playing() && game.turn === HUMAN;
  const humanCan = () => myTurn() && !busy && !kit.modal.current();
  const canTakePile = () => humanCan() && (game.phase === 'upcard' || (game.phase === 'draw' && !game.mustStock)) && !!E.top(game);
  const canDrawStock = () => humanCan() && game.phase === 'draw' && game.stock.length > 0;
  const canDiscard = (id) => humanCan() && game.phase === 'discard' && game.hands[HUMAN].indexOf(id) >= 0 && id !== game.taken;

  /** Nước knock / gin / big gin cho nút Knock: lá đang chọn nếu knock được với nó, không thì lá tốt nhất. */
  function knockAction() {
    if (!humanCan() || game.phase !== 'discard') return null;
    const acts = E.legalActions(game);
    const big = acts.find((a) => a.type === 'bigGin');
    if (big && !sel) return big;
    const knocks = acts.filter((a) => a.type === 'knock');
    if (!knocks.length) return big || null;
    const mine = sel && knocks.find((a) => a.card === sel);
    if (mine) return mine;
    let best = null;
    knocks.forEach((a) => {
      const dw = E.deadwoodAfter(game, a.card);
      if (!best || dw < best.dw || (dw === best.dw && E.cardValue(a.card) > E.cardValue(best.a.card))) best = { dw, a };
    });
    return best.a;
  }
  const actionDw = (a) => (a.type === 'bigGin' ? 0 : E.deadwoodAfter(game, a.card));

  /* ---------------- Vẽ ---------------- */
  const AVATAR = {
    easy: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#ff8fb8"/><path d="M8 17c1-8 7-12 12-12s11 4 12 12c-3-4-7-5-12-5s-9 1-12 5z" fill="#7a3550"/><circle cx="15" cy="20" r="2.2" fill="#2b1020"/><circle cx="25" cy="20" r="2.2" fill="#2b1020"/><path d="M14 26q6 5 12 0" stroke="#2b1020" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="11" cy="25" r="2.4" fill="#ff5f95" opacity=".6"/><circle cx="29" cy="25" r="2.4" fill="#ff5f95" opacity=".6"/></svg>',
    medium: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#5ec2ff"/><path d="M7 16c2-7 7-10 13-10s11 3 13 10H7z" fill="#1f4f7a"/><rect x="6" y="15" width="28" height="3" rx="1.5" fill="#1f4f7a"/><circle cx="15" cy="22" r="2.2" fill="#0d2238"/><circle cx="25" cy="22" r="2.2" fill="#0d2238"/><path d="M15 29h10" stroke="#0d2238" stroke-width="2.2" stroke-linecap="round"/></svg>',
    hard: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#ffc53d"/><path d="M9 14l4-6 7 4 7-4 4 6z" fill="#8a5a00"/><rect x="9" y="18" width="9" height="6" rx="2.5" fill="#1b1b2b"/><rect x="22" y="18" width="9" height="6" rx="2.5" fill="#1b1b2b"/><path d="M18 20h4" stroke="#1b1b2b" stroke-width="2"/><path d="M14 29q6 3 12-1" stroke="#1b1b2b" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
  };

  /** Các nhóm lá của một tay để vẽ / hiện bảng điểm: [{ cards, meld: true|false, laid? }]. */
  function groupsOf(p) {
    const r = game.result;
    if (r && r.kind !== 'draw') {
      const side = r.knocker === p ? r.k : r.d;
      const out = side.melds.map((m) => ({ cards: m, meld: true }));
      if (side.laid && side.laid.length) out.push({ cards: side.laid.map((l) => l.card), meld: true, laid: true });
      if (side.dead.length) out.push({ cards: side.dead, meld: false });
      return out;
    }
    const a = E.analyze(game.hands[p]);
    const out = a.melds.map((m) => ({ cards: m, meld: true }));
    if (a.deadwood.length) out.push({ cards: a.deadwood, meld: false });
    return out;
  }

  function renderOpp() {
    const n = game.hands[CPU].length;
    const box = $('opp-hand');
    const reveal = !playing();
    const lv = game.level;
    $('opp-avatar').innerHTML = AVATAR[lv];
    $('opp-avatar').className = 'avatar lv-' + lv;
    $('opp-name').textContent = cpuName() + ' · ' + t('level.' + lv);
    $('opp-score').textContent = t('me.score', { n: game.scores[CPU] });
    const opp = $('opp');
    const active = playing() && game.turn === CPU;
    opp.classList.toggle('active', active);
    opp.classList.toggle('thinking', active && busy);
    opp.classList.toggle('winner', !!game.result && game.result.winner === CPU);
    opp.setAttribute('aria-label', t('opp.aria', { name: cpuName(), level: t('level.' + lv), score: game.scores[CPU], n }));
    let html = '';
    if (reveal) {
      // Hết ván: lật bài máy, xếp theo bộ
      const groups = groupsOf(CPU);
      const step = ow * 0.5;
      const gap = ow * 0.3;
      let x = 0;
      groups.forEach((g, gi) => {
        if (gi) x += gap;
        g.cards.forEach((id) => {
          html += C.html(card(id), { label: false }).replace('class="pnc ', 'style="left:' + x + 'px" class="' + (g.meld ? '' : 'dead ') + (g.laid ? 'laid ' : '') + 'pnc ');
          x += step;
        });
      });
      box.style.width = x - step + ow + 'px';
    } else {
      const step = ow * (n > 10 ? 0.3 : 0.33);
      for (let i = 0; i < n; i++) html += C.html(null, { label: false }).replace('class="pnc"', 'class="pnc' + (dealing ? ' deal' : '') + '" style="left:' + i * step + 'px;--d:' + (i * 2 + 1) * 45 + 'ms"');
      box.style.width = ow + step * Math.max(0, n - 1) + 'px';
    }
    box.innerHTML = html;
    box.classList.toggle('reveal', reveal);
    // Lá máy đã nhặt từ chồng bỏ (thông tin công khai)
    const known = playing() ? E._internal.knownOpp(game, HUMAN).map(E._internal.toId) : [];
    $('opp-took').innerHTML = known.length ? '<span class="took-label">' + t('opp.took') + '</span>' + known.map(chip).join('') : '';
  }

  /** Lá nhỏ dạng chữ (bảng điểm, dòng "đã nhặt"). */
  function chip(id, extra) {
    return '<span class="mc' + (C.isRed(card(id)) ? ' red' : '') + (extra ? ' ' + extra : '') + '">' + short(id) + '</span>';
  }

  function renderCenter() {
    const n = game.stock.length;
    const deck = $('deck');
    const can = canDrawStock();
    let backs = '';
    const layers = n === 0 ? 0 : n > 16 ? 3 : n > 5 ? 2 : 1;
    for (let i = 0; i < layers; i++) backs += C.html(null, { label: false });
    $('deck-cards').innerHTML = layers ? backs : '<span class="slot-empty"></span>';
    $('deck-count').textContent = n;
    $('deck-count').classList.toggle('low', n <= 6);
    deck.disabled = !can;
    deck.classList.toggle('ready', can);
    deck.setAttribute('aria-label', t('deck.label', { n }) + (can ? '. ' + t('deck.draw') : ''));

    const pile = $('pile');
    const top = E.top(game);
    const under = game.discard.length > 1 ? game.discard[game.discard.length - 2] : null;
    const take = canTakePile();
    let html = '';
    if (under) html += C.html(card(under), { label: false }).replace('class="pnc ', 'class="under pnc ');
    if (top) html += C.html(card(top), { label: false }).replace('class="pnc ', 'class="' + (take ? 'pnc-highlight ' : '') + 'pnc ');
    $('pile-cards').innerHTML = html || '<span class="slot-empty"></span>';
    pile.classList.toggle('ready', take);
    pile.setAttribute('aria-label', (top ? t('pile.label', { card: C.cardName(card(top), lang) }) : t('pile.empty')) + (take ? '. ' + t('pile.take') : ''));
    pile.setAttribute('aria-disabled', String(!take && !(myTurn() && game.phase === 'discard')));
  }

  /** Thứ tự hiển thị bài của bạn: tự xếp theo bộ, hoặc thứ tự riêng (lá mới thêm vào cuối). */
  function syncOrder() {
    const hand = game.hands[HUMAN];
    if (!manual) {
      const groups = groupsOf(HUMAN);
      order = [].concat(...groups.map((g) => g.cards));
      return;
    }
    order = order.filter((id) => hand.indexOf(id) >= 0);
    hand.forEach((id) => {
      if (order.indexOf(id) < 0) order.push(id);
    });
  }

  /* Giữ nguyên phần tử theo id để lá dời / nhô có hiệu ứng.
     Lá to nhất có thể, lệch nhau ít nhất 42% bề rộng (đọc được bậc + chất ở góc); khi tự xếp thì giữa các bộ có khe. */
  const handEls = new Map();
  function renderHand() {
    syncOrder();
    const box = $('hand');
    const ids = order;
    handEls.forEach((el, id) => {
      if (ids.indexOf(id) < 0) {
        el.remove();
        handEls.delete(id);
      }
    });
    // Nhóm bộ của từng lá (theo cách xếp tối ưu), dùng cho vạch màu và khe
    const grp = new Map();
    let gi = 0;
    groupsOf(HUMAN).forEach((g) => {
      g.cards.forEach((id) => grp.set(id, g.meld ? (g.laid ? -2 : gi) : -1));
      if (g.meld && !g.laid) gi++;
    });
    const n = ids.length;
    let gaps = 0;
    if (!manual) for (let i = 1; i < n; i++) if (grp.get(ids[i]) !== grp.get(ids[i - 1])) gaps++;
    const pad = 4;
    const Wi = Math.max(60, box.clientWidth - pad * 2);
    let w = Math.min(hw, Wi / (1 + (n - 1) * 0.42 + gaps * 0.2));
    w = Math.max(30, w);
    const gapW = gaps ? Math.min(w * 0.35, Math.max(w * 0.12, (Wi - w - (n - 1) * w * 0.42) / gaps * 0.5)) : 0;
    const step = n > 1 ? Math.min(w * 0.7, (Wi - w - gaps * gapW) / (n - 1)) : 0;
    const total = w + step * (n - 1) + gaps * gapW;
    let x = pad + (Wi - total) / 2;
    const mine = myTurn() && game.phase === 'discard';
    const focusIdx = sel ? ids.indexOf(sel) : 0;
    ids.forEach((id, i) => {
      let el = handEls.get(id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'hc' + (dealing ? ' deal' : '');
        el.dataset.id = id;
        el.dataset.drop = 'card';
        el.style.setProperty('--d', i * 90 + 'ms');
        el.appendChild(C.render(card(id), { label: false }));
        const bar = document.createElement('span');
        bar.className = 'mbar';
        bar.setAttribute('aria-hidden', 'true');
        el.appendChild(bar);
        box.appendChild(el);
        handEls.set(id, el);
      }
      if (i > 0 && !manual && grp.get(id) !== grp.get(ids[i - 1])) x += gapW;
      const g = grp.get(id);
      el.style.setProperty('--w', w + 'px');
      el.style.setProperty('--x', x + 'px');
      el.style.zIndex = i + 1;
      x += step;
      el.classList.toggle('up', id === sel);
      el.dataset.g = g >= 0 ? g % GROUP_COLORS : g === -2 ? 'laid' : 'dead';
      const face = el.firstChild;
      face.classList.toggle('pnc-selected', id === sel);
      face.classList.toggle('pnc-highlight', id === fresh && id !== sel);
      face.classList.toggle('pnc-disabled', mine && id === game.taken);
      el.tabIndex = i === Math.max(0, focusIdx) ? 0 : -1;
      el.setAttribute('aria-label', C.cardName(card(id), lang) + ', ' + t(g === -1 ? 'card.dead' : 'card.meld') + (id === fresh ? ', ' + t('card.new') : ''));
      el.setAttribute('aria-pressed', String(id === sel));
    });
    box.style.height = 'calc(' + w * 1.4 + 'px + var(--lift) + ' + (HEADROOM + 8) + 'px)';
  }

  function mainText() {
    if (flash) return flash;
    if (game.phase === 'over') return t('status.matchOver');
    if (game.phase === 'round') return t('status.roundOver');
    if (game.turn !== HUMAN) return t('status.cpu', { name: cpuName() });
    const top = E.top(game);
    if (game.phase === 'upcard') return t('status.upcard', { card: short(top) });
    if (game.phase === 'draw') return game.mustStock ? t('status.drawStock') : t('status.draw', { card: short(top) });
    const k = knockAction();
    if (k && actionDw(k) === 0) return t('status.canGin');
    if (sel) return t('status.selected', { card: short(sel) });
    if (k) return t('status.canKnock', { n: actionDw(k) });
    return t('status.discard');
  }

  function render() {
    if (!game) return;
    renderOpp();
    renderCenter();
    renderHand();
    dealing = false;
    const mine = $('mine');
    mine.classList.toggle('active', myTurn());
    mine.classList.toggle('winner', !!game.result && game.result.winner === HUMAN);
    $('me-score').textContent = t('me.score', { n: game.scores[HUMAN] });
    // Lá lẻ: tay 10 lá; đang cầm 11 lá thì là lá lẻ sau khi bỏ lá đang chọn (hoặc lá tốt nhất)
    let dw;
    const h = game.hands[HUMAN];
    if (h.length > E.HAND) {
      const cands = h.filter((id) => id !== game.taken);
      dw = sel && sel !== game.taken ? E.deadwoodAfter(Object.assign({}, game, { turn: HUMAN }), sel) : Math.min.apply(null, cands.map((id) => E.deadwoodAfter(Object.assign({}, game, { turn: HUMAN }), id)));
    } else dw = E.deadwood(h);
    $('dw-val').textContent = dw;
    $('dw-val').classList.toggle('ok', dw <= E.KNOCK_MAX);

    const act = $('btn-act');
    let label = 'act.wait';
    let key = '';
    let enabled = false;
    if (myTurn()) {
      if (game.phase === 'upcard') {
        label = 'act.pass';
        key = 'P';
        enabled = humanCan();
      } else if (game.phase === 'draw') {
        label = 'act.draw';
        key = 'S';
        enabled = canDrawStock();
      } else {
        label = 'act.discard';
        key = '↵';
        enabled = !!sel && canDiscard(sel);
      }
    }
    $('act-label').textContent = t(label);
    $('act-key').textContent = key;
    $('act-key').hidden = !key;
    act.disabled = !enabled;
    const k = knockAction();
    const kb = $('btn-knock');
    const showKnock = myTurn() && game.phase === 'discard';
    kb.classList.toggle('shown', showKnock);
    kb.disabled = !k;
    kb.classList.toggle('btn-primary', !!k);
    kb.classList.toggle('btn-ghost', !k);
    // Knock với lá khác lá đang chọn (lá tốt nhất): ghi rõ lá sẽ bỏ
    $('knock-label').textContent = t(k && k.type === 'bigGin' ? 'act.bigGin' : k && actionDw(k) === 0 ? 'act.gin' : 'act.knock') +
      (k && k.card && k.card !== sel ? ' ' + short(k.card) : '');
    $('btn-sort').classList.toggle('on', manual);
    $('status-log').textContent = note;
    $('status-main').textContent = mainText();
    $('status').classList.toggle('you', myTurn() && !busy);
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
        ? { title: t('app.name'), detail: t('summary.resume', { n: game.round, you: game.scores[HUMAN], opp: game.scores[CPU] }), pct: Math.min(1, game.scores[HUMAN] / E.TARGET) }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()), order, manual });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng trận ---------------- */
  function clearHand() {
    handEls.forEach((el) => el.remove());
    handEls.clear();
  }
  function resetRoundUi() {
    sel = null;
    fresh = null;
    manual = false;
    order = [];
    flash = '';
    clearHand();
    dealing = !reduceMotion;
  }

  function newMatch() {
    gen++;
    busy = false;
    clearTimeout(roundTimer);
    kit.modal.close('modal-round');
    const s = kit.settings.get();
    game = E.newMatch({ seed: (Math.random() * 4294967296) >>> 0, level: s.level, bigGin: s.bigGin !== false });
    resetRoundUi();
    note = t('log.deal', { n: 1, card: short(E.top(game)) });
    clock.reset();
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
    if (!playing()) endRound();
    else advance();
  }

  /** Bước kế tiếp: tới lượt máy thì máy đi. */
  function advance() {
    render();
    if (!playing() || busy) return;
    if (game.turn === CPU) cpuTurn();
  }

  /* --- Lượt của máy --- */
  function oppCard() {
    const cards = $('opp-hand').querySelectorAll('.pnc');
    return cards.length ? cards[cards.length - 1] : $('opp-hand');
  }
  function pileTarget() {
    return $('pile-cards').lastElementChild || $('pile');
  }

  async function cpuTurn() {
    const g0 = gen;
    const p = pace();
    const name = cpuName();
    busy = true;
    render();
    await sleep(p.think);
    if (g0 !== gen) return;
    let a = E.aiAction(game);
    if (a.type === 'pass') {
      note = t('log.pass', { name, card: short(E.top(game)) });
      game = E.apply(game, a);
      kit.sfx('tick');
      busy = false;
      afterMove();
      return;
    }
    if (a.type === 'draw') {
      const fromPile = a.from === 'discard';
      const id = fromPile ? E.top(game) : null;
      kit.sfx('flip');
      await fly(fromPile ? pileTarget() : $('deck-cards').lastElementChild || $('deck'), oppCard(), id);
      if (g0 !== gen) return;
      game = E.apply(game, a);
      note = fromPile ? t('log.take', { name, card: short(id) }) : t('log.draw', { name });
      persist();
      render();
      await sleep(p.after);
      if (g0 !== gen) return;
      a = E.aiAction(game);
    }
    if (a.type === 'bigGin') {
      game = E.apply(game, a);
      note = t('log.gin', { name });
      busy = false;
      afterMove();
      return;
    }
    await fly(oppCard(), pileTarget(), a.card, { flip: a.type !== 'knock', back: a.type === 'knock' });
    if (g0 !== gen) return;
    game = E.apply(game, a);
    if (a.type === 'knock') note = t(game.end.kind === 'gin' ? 'log.gin' : 'log.knock', { name });
    else {
      note = t('log.discard', { name, card: short(a.card) });
      kit.sfx('place');
    }
    busy = false;
    afterMove();
  }

  /* --- Nước của bạn --- */
  function showFlash(msg) {
    flash = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = '';
      if (game) render();
    }, 1700);
    render();
  }
  function nope(id) {
    kit.sfx('error');
    const el = id && handEls.get(id);
    if (!el) return;
    el.classList.remove('nope');
    void el.offsetWidth; // chạy lại hiệu ứng
    el.classList.add('nope');
  }

  /** Bay tới mép phải bài trên tay. */
  function handSpot() {
    const hb = $('hand').getBoundingClientRect();
    const w = Math.min(hw, hb.width);
    return { left: hb.right - w - 6, top: hb.top + HEADROOM + 4, width: w, height: w * 1.4 };
  }

  async function doDraw(from) {
    if (from === 'stock' ? !canDrawStock() : !canTakePile()) return;
    const g0 = gen;
    busy = true;
    flash = '';
    firstAction();
    const a = { type: 'draw', from };
    const id = from === 'stock' ? game.stock[game.stock.length - 1] : E.top(game);
    kit.sfx(from === 'stock' ? 'flip' : 'tap');
    render();
    await fly(from === 'stock' ? $('deck-cards').lastElementChild || $('deck') : pileTarget(), handSpot(), id, { flip: from === 'stock' });
    if (g0 !== gen) return;
    game = E.apply(game, a);
    note = t(from === 'stock' ? 'log.youDraw' : 'log.youTake', { card: short(id) });
    fresh = id;
    sel = null;
    busy = false;
    persist();
    advance();
  }

  function doPass() {
    if (!humanCan() || game.phase !== 'upcard') return;
    firstAction();
    note = t('log.youPass', { card: short(E.top(game)) });
    game = E.apply(game, { type: 'pass' });
    kit.sfx('tick');
    afterMove();
  }

  /** Bỏ lá (hoặc knock với lá đó). dropped: lá đã được kéo tới chồng bỏ, không bay nữa. */
  async function doDiscard(id, knock, dropped) {
    if (!canDiscard(id)) {
      if (id === game.taken && humanCan()) {
        nope(id);
        showFlash(t('status.taken'));
      }
      return;
    }
    const a = { type: knock ? 'knock' : 'discard', card: id };
    if (!E.isLegal(game, a)) {
      nope(id);
      showFlash(t('status.noKnock'));
      return;
    }
    const g0 = gen;
    busy = true;
    flash = '';
    firstAction();
    const el = handEls.get(id);
    if (el && !dropped) {
      const from = el.firstChild.getBoundingClientRect();
      el.classList.add('flying');
      render();
      kit.sfx('tap');
      await fly(from, pileTarget(), knock ? null : id, { back: !!knock });
      if (g0 !== gen) return;
    }
    game = E.apply(game, a);
    sel = null;
    fresh = null;
    if (knock) note = t(game.end.kind === 'gin' ? 'log.youGin' : 'log.youKnock');
    else {
      note = t('log.youDiscard', { card: short(id) });
      kit.sfx('place');
    }
    busy = false;
    afterMove();
  }

  function doKnock() {
    const a = knockAction();
    if (!a) {
      if (humanCan() && game.phase === 'discard') {
        nope(sel);
        showFlash(t('status.noKnock'));
      }
      return;
    }
    if (a.type === 'bigGin') {
      firstAction();
      game = E.apply(game, a);
      sel = null;
      note = t('log.youGin');
      afterMove();
      return;
    }
    doDiscard(a.card, true);
  }

  /** Nút chính: Bỏ qua / Rút / Bỏ lá. */
  function act() {
    if (!humanCan()) return;
    if (game.phase === 'upcard') doPass();
    else if (game.phase === 'draw') doDraw('stock');
    else if (sel) doDiscard(sel);
  }

  /** Chạm lá: chọn (nhô lên); chạm lá đang chọn trong lượt bỏ thì bỏ lá đó. */
  function tapCard(id) {
    if (!playing()) return;
    if (sel === id && humanCan() && game.phase === 'discard') {
      doDiscard(id);
      return;
    }
    sel = sel === id ? null : id;
    kit.sfx('tap');
    render();
  }

  /** Xếp lại theo bộ tối ưu. */
  function autoSort() {
    if (!game) return;
    manual = false;
    kit.sfx('move');
    render();
  }

  /** Dời lá `id` tới vị trí `to` trong thứ tự hiển thị (chuyển sang thứ tự riêng). */
  function moveCard(id, to) {
    syncOrder();
    const from = order.indexOf(id);
    if (from < 0) return;
    const next = order.slice();
    next.splice(from, 1);
    next.splice(clamp(to, 0, next.length), 0, id);
    if (!manual) note = t('log.manual');
    manual = true;
    order = next;
    kit.sfx('move');
    render();
    persist();
  }

  /* --- Hết ván / hết trận --- */
  function endRound() {
    const r = game.result;
    if (r.winner === HUMAN) {
      stats.rounds++;
      if (r.kind === 'gin' || r.kind === 'bigGin') stats.gins++;
    }
    sel = null;
    fresh = null;
    if (game.phase === 'over') finishMatch();
    else if (r.kind === 'draw') kit.sfx('tick');
    else kit.sfx(r.winner === HUMAN ? (r.kind === 'gin' || r.kind === 'bigGin' ? 'combo' : 'coin') : 'drop');
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
      stats.best = Math.max(stats.best, E.finalScores(game)[HUMAN].total);
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

  function handRow(p) {
    const r = game.result;
    const name = p === HUMAN ? t('seat.you') : cpuName();
    const groups = groupsOf(p);
    const dw = r.kind === 'draw' ? E.deadwood(game.hands[p]) : r.knocker === p ? r.kdw : r.ddw;
    const tagKey = r.kind === 'gin' ? 'act.gin' : r.kind === 'bigGin' ? 'act.bigGin' : 'round.knocker';
    const tag = r.knocker === p ? '<span class="rh-tag">' + t(tagKey) + '</span>' : '';
    const body = groups.map((g) => {
      const cls = g.laid ? 'grp laid' : g.meld ? 'grp' : 'grp dead';
      const label = g.laid ? '<span class="grp-label">' + t('round.laid') + '</span>' : '';
      return '<span class="' + cls + '">' + label + g.cards.map((id) => chip(id)).join('') + '</span>';
    }).join('');
    return '<div class="rh' + (r.winner === p ? ' win' : '') + '"><div class="rh-head"><b>' + name + '</b>' + tag +
      '<span class="rh-dw">' + t('round.dw', { n: dw }) + '</span></div><div class="rh-cards">' + body + '</div></div>';
  }

  function showRound() {
    if (!game || playing()) return;
    const r = game.result;
    const over = game.phase === 'over';
    const name = cpuName();
    const you = r.winner === HUMAN;
    let title;
    let text;
    if (r.kind === 'draw') {
      title = t('round.draw');
      text = t('round.textDraw');
    } else {
      const kindKey = { knock: 'Knock', undercut: 'Undercut', gin: 'Gin', bigGin: 'BigGin' }[r.kind];
      title = t((you ? 'round.you' : 'round.cpu') + kindKey, { name });
      const winner = you ? t('round.you') : t('round.cpu', { name });
      text = t('round.text' + (r.kind === 'knock' ? 'Knock' : kindKey), { winner, pts: t('round.pts', { n: r.points }), kdw: r.kdw, ddw: r.ddw });
    }
    if (over) title = E.matchWinner(game) === HUMAN ? t('match.won') : t('match.lost', { name });
    $('round-title').textContent = title;
    $('round-text').textContent = text;
    const first = r.knocker === CPU ? [CPU, HUMAN] : [HUMAN, CPU];
    $('round-hands').innerHTML = first.map(handRow).join('');
    $('round-score').textContent = t('round.total', { you: game.scores[HUMAN], opp: game.scores[CPU], name });
    const ft = $('final-table');
    ft.hidden = !over;
    if (over) {
      const f = E.finalScores(game);
      $('final-opp').textContent = name;
      const row = (label, a, b, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th><td>' + a + '</td><td>' + b + '</td></tr>';
      $('final-rows').innerHTML =
        row(t('final.base'), f[0].base, f[1].base) +
        row(t('final.game'), f[0].game, f[1].game) +
        row(t('final.box'), f[0].box, f[1].box) +
        (f[0].shutout || f[1].shutout ? row(t('final.shutout'), f[0].shutout ? '×2' : '', f[1].shutout ? '×2' : '') : '') +
        row(t('final.total'), f[0].total, f[1].total, 'total');
    }
    $('btn-next').hidden = over;
    $('btn-again').hidden = !over;
    kit.modal.open('modal-round');
  }

  function nextRound() {
    if (!game || game.phase !== 'round') return;
    kit.modal.close('modal-round');
    game = E.nextRound(game);
    resetRoundUi();
    note = t('log.deal', { n: game.round, card: short(E.top(game)) });
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

  /** Đổi mức / big gin: trận chưa có nước nào của bạn thì chia lại ngay, không thì áp dụng từ trận sau. */
  function onSetting(key) {
    if (key !== 'level' && key !== 'bigGin') return;
    if (!game) return;
    if (playing() && game.humanMoves === 0) newMatch();
    else kit.toast(t('toast.nextMatch'));
  }

  /* --- Bàn phím: chọn / dời lá --- */
  function focusSel() {
    render();
    const el = sel && handEls.get(sel);
    if (el) el.focus();
  }
  function moveSel(d) {
    if (!playing()) return;
    syncOrder();
    const n = order.length;
    if (!n) return;
    const i = sel ? order.indexOf(sel) : -1;
    sel = order[i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n];
    focusSel();
  }
  function shiftSel(d) {
    if (!playing() || !sel) return;
    syncOrder();
    moveCard(sel, order.indexOf(sel) + d);
    focusSel();
  }

  /* ---------------- Sự kiện ---------------- */
  $('hand').addEventListener('click', (e) => {
    const b = e.target.closest('.hc');
    if (b) tapCard(b.dataset.id);
  });
  $('deck').addEventListener('click', () => doDraw('stock'));
  $('pile').addEventListener('click', () => {
    if (canTakePile()) doDraw('discard');
    else if (sel && canDiscard(sel)) doDiscard(sel);
  });
  $('btn-act').addEventListener('click', act);
  $('btn-knock').addEventListener('click', doKnock);
  $('btn-sort').addEventListener('click', autoSort);
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
    $('stats-gins').textContent = kit.i18n.fmtNumber(stats.gins);
    $('stats-best').textContent = stats.best ? kit.i18n.fmtNumber(stats.best) : '–';
  });

  // Kéo thả: kéo lá trên tay tới lá khác để dời chỗ, tới chồng bỏ để bỏ
  C.drag($('stage'), {
    cards: '#hand .hc > .pnc',
    canPick: () => playing() && !(myTurn() && busy),
    canDrop: (el, target) => {
      const id = el.parentNode.dataset.id;
      if (target.id === 'pile') return canDiscard(id);
      return !!target.dataset.id && target.dataset.id !== id;
    },
    onDrop: (el, target) => {
      const id = el.parentNode.dataset.id;
      if (target.id === 'pile') {
        doDiscard(id, false, true);
        return true;
      }
      syncOrder();
      moveCard(id, order.indexOf(target.dataset.id));
      return true;
    },
    onCancel: () => kit.sfx('error'),
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const btn = e.target.closest && e.target.closest('button');
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const d = k === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) shiftSel(d);
      else moveSel(d);
    } else if (k === 'Enter') {
      if (btn) return; // Enter trên nút đang focus (kể cả lá trên tay): để trình duyệt bấm nút
      if (sel && humanCan() && game.phase === 'discard') doDiscard(sel);
      else if (!sel) moveSel(1);
      else return;
    } else if (k === 's' || k === 'S') doDraw('stock');
    else if (k === 'd' || k === 'D') doDraw('discard');
    else if (k === 'p' || k === 'P') doPass();
    else if (k === 'k' || k === 'K') doKnock();
    else if (k === 'a' || k === 'A') autoSort();
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
    manual = saved.manual === true && Array.isArray(saved.order);
    order = manual ? saved.order.filter((id) => typeof id === 'string') : [];
    note = '';
    clock.set(Number(saved.elapsed) || 0);
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
